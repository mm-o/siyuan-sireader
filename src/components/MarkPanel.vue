<template>
  <Teleport to="body">
    <div v-if="state.showMenu || state.showPanel || state.showSendMenu" class="mark-overlay" @click="closeAll" />

    <div v-if="state.showMenu" class="mark-menu" :style="menuPosition" @click.stop>
      <button v-if="!readOnly" @click="openSelectionEditor" class="b3-tooltips b3-tooltips__s" :aria-label="i18n?.note || '笔记'"><svg><use xlink:href="#lucide-square-pen" /></svg></button>
      <button v-if="!readOnly" @click="() => handleCopy()" class="b3-tooltips b3-tooltips__s" :aria-label="i18n?.mark || '标注'"><svg><use xlink:href="#iconMark" /></svg></button>
      <button v-if="!readOnly" @click="toggleSendMenu" class="b3-tooltips b3-tooltips__s" :aria-label="i18n?.sendTo || '发送到'"><svg><use xlink:href="#lucide-send" /></svg></button>
      <button @click="handleCopyText" class="b3-tooltips b3-tooltips__s" :aria-label="i18n?.copy || '复制'"><svg><use xlink:href="#iconCopy" /></svg></button>
      <button v-if="props.ttsConfig?.enabled" @click="handleSpeak" class="b3-tooltips b3-tooltips__s" :aria-label="i18n?.ttsPlay || '朗读'"><svg><use xlink:href="#iconPlay" /></svg></button>
      <button @click="handleDict" class="b3-tooltips b3-tooltips__s" :aria-label="i18n?.dict || '词典'"><svg><use xlink:href="#iconLanguage" /></svg></button>
      <button @click="handleTranslate" class="b3-tooltips b3-tooltips__s" :aria-label="i18n?.translate || '翻译'"><svg><use xlink:href="#iconTranslate" /></svg></button>
    </div>

    <!-- 发送到文档菜单 -->
    <div v-if="state.showSendMenu" class="mark-menu send-menu" :style="sendMenuPosition" @click.stop>
      <button v-for="doc in quickDocs" :key="doc.id" class="send-item" @click="() => handleSendToDoc(doc.id)">{{ doc.name }}</button>
      <input v-model="sendSearch" class="b3-text-field send-input" :placeholder="i18n?.searchDocPlaceholder || '搜索文档...'" @input="searchSendDocs" />
      <div v-if="!sendDocs.length" class="send-empty">{{ sendSearch ? '无结果' : '输入关键词搜索' }}</div>
      <button v-for="doc in sendDocs" :key="doc.id" class="send-item" @click="() => handleSendToDoc(doc.path?.split('/').pop()?.replace('.sy', '') || doc.id)">{{ doc.hPath || doc.content || '无标题' }}</button>
    </div>

    <div v-if="state.showPanel" v-motion :initial="{ opacity: 0, y: 5 }" :enter="{ opacity: 1, y: 0 }" :class="['sr-popup sr-popup-panel',{ 'is-above': cardPlacement.dir === 'down' }]" :style="cardPosition" @click.stop>
      <div class="sr-main">
        <Translate v-if="state.panel === 'translate'" :text="state.selection?.text || ''" />
        <MarkCard
          v-else
          :time="formatDateTime(state.currentMark?.timestamp || Date.now())"
          :tags="displayTags"
          :tag-groups="panelTagGroups"
          :selected-tags="displayTags"
          :tag-input="state.tags"
          :i18n="i18n"
          :editing="state.isEditing"
          :editable="!readOnly"
          :text="state.text || '无内容'"
          :chapter="state.isEditing ? '' : (state.currentMark?.chapter || (state.currentMark?.page ? `第${state.currentMark.page}页` : ''))"
          :note="state.note"
          :mark-color="currentMarkColor"
          :kind="state.currentMark?.type === 'note' ? 'note' : state.currentMark?.type === 'bookmark' ? 'bookmark' : 'highlight'"
          :color-value="state.color"
          :color-options="state.isEditing ? colorOptions : []"
          :style-value="state.style"
          :style-options="state.isEditing ? markStyleOptions : []"
          @update:tag-input="state.tags = $event"
          @update:note="state.note = $event"
          @update:color-value="state.color = $event"
          @update:style-value="setMarkStyle"
          @toggle-tags="togglePanelTags"
          @go="goToMark"
          @edit="handleEdit"
          @cancel="handleCancel"
          @save="handleSave"
        >
          <template v-if="!state.isEditing" #actions>
            <div class="sr-icon-actions">
              <button @click.stop="handleCopyMark" class="b3-tooltips b3-tooltips__w" :aria-label="i18n?.copy || '复制'"><svg><use xlink:href="#iconCopy" /></svg></button>
              <button v-if="state.currentMark?.blockId" @click.stop="handleOpenBlock" @mouseenter="handleShowFloat" @mouseleave="hideFloat" class="b3-tooltips b3-tooltips__w" aria-label="打开块"><svg><use xlink:href="#iconRef" /></svg></button>
              <button v-else-if="!readOnly" @click.stop="handleImport" class="b3-tooltips b3-tooltips__w" :aria-label="i18n?.import || '导入'"><svg><use xlink:href="#iconDownload" /></svg></button>
              <button v-if="!readOnly" @click.stop="handleDelete" class="b3-tooltips b3-tooltips__w" :aria-label="i18n?.delete || '删除'"><svg><use xlink:href="#iconTrashcan" /></svg></button>
            </div>
          </template>
        </MarkCard>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { showMessage } from 'siyuan'
import type { HighlightColor, Mark, MarkManager } from '@/core/MarkManager'
import { COLORS, STYLES } from '@/core/MarkManager'
import { hideFloat, openBlock, showFloat } from '@/utils/copy'
import { jump } from '@/utils/jump'
import { isMobile } from '@/utils/mobile'
import MarkCard, { collectMarkTagGroups, formatMarkTags, getMarkTags, parseMarkTags, toggleMarkTags } from './MarkCard.vue'
import Translate from './Translate.vue'

interface MarkSelection {
  text: string
  location: { format: 'pdf' | 'epub'; cfi?: string; section?: number; page?: number; rects?: any[] }
}
interface SelectionAnchor {
  x: number
  y: number
  panelY?: number
}
type MarkStyle = 'highlight' | 'underline' | 'outline' | 'dotted' | 'dashed' | 'double' | 'squiggly'

const props = defineProps<{
  root?: HTMLElement | null
  bookUrl?: string
  manager: MarkManager | null
  i18n?: Record<string, string>
  reader?: any
  currentView?: any
  readOnly?: boolean
  ttsController?: any
  ttsConfig?: any
  quickMarkMode?: boolean
  quickMarkColor?: HighlightColor
  quickMarkStyle?: 'highlight' | 'underline' | 'outline' | 'dotted' | 'dashed' | 'double' | 'squiggly'
  can?: any
  showUpgrade?: any
}>()

const emit = defineEmits<{
  copy: [text: string, selection: any]
  dict: [text: string, x: number, y: number, selection: any]
  copyMarkOnly: [mark: Mark]
}>()

const sendSearch = ref('')
const sendDocs = ref<any[]>([])
let quickMarkCooldown = false
let selectionDoc: Document | null = null

const state = reactive({
  showMenu: false,
  showPanel: false,
  showSendMenu: false,
  panel: '' as '' | 'card' | 'translate',
  isEditing: false,
  x: 0,
  y: 0,
  panelY: 0,
  selection: null as MarkSelection | null,
  currentMark: null as Mark | null,
  text: '',
  note: '',
  tags: '',
  color: 'yellow' as HighlightColor,
  style: 'highlight' as MarkStyle,
})
const queryRoot = () => props.root || document
const getBookUrl = () => props.bookUrl || (window as any).__currentBookUrl || ''

const readOnly = computed(() => !!props.readOnly)
const isPdf = computed(() => (state.selection?.location.format || state.currentMark?.format) === 'pdf')
const quickDocs = computed(() => (window as any).__sireader_settings?.quickSendDocs || [])
const colorOptions = computed(() => COLORS.map(color => ({ key: color.color, value: color.color, bg: color.bg })))
const textStyleOptions = computed(() => STYLES
  .filter(item => !item.epubOnly)
  .map(item => ({ value: item.type, label: item.name })))
const markStyleOptions = computed(() => textStyleOptions.value)
const colorMap = Object.fromEntries(COLORS.map(color => [color.color, color.bg]))
const currentMarkColor = computed(() => colorMap[state.color] || state.color || '#e0e0e0')
const displayTags = computed(() => state.isEditing ? parseMarkTags(state.tags) : getMarkTags(state.currentMark))
const panelTagGroups = computed(() => collectMarkTagGroups(props.manager, displayTags.value))
const togglePanelTags = (tags: string[]) => state.tags = formatMarkTags(toggleMarkTags(displayTags.value, tags))
const setMarkStyle = (style: string) => {
  state.style = style as MarkStyle
}
const formatDateTime = (ts?: number) => ts ? new Date(ts).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

const placePopup = (x: number, y: number, w: number, h: number, preferAbove = false, clampBelow = false) => {
  const rect = props.root?.getBoundingClientRect() || document.querySelector('.reader-container')?.getBoundingClientRect()
  const box = rect
    ? { left: rect.left + 16, right: rect.right - 16, top: rect.top + 16, bottom: rect.bottom - 16 }
    : { left: 16, right: innerWidth - 16, top: 16, bottom: innerHeight - 16 }
  const pad = 6
  const belowY = y + pad
  const aboveY = y - h - pad
  const availableBelow = Math.max(0, box.bottom - belowY - pad)
  const availableAbove = Math.max(0, y - box.top - pad * 2)
  const preferAboveHit = preferAbove && aboveY >= box.top
  const overflowBottom = y + h + pad * 2 > box.bottom
  if (clampBelow && overflowBottom) {
    const placeAbove = availableAbove > availableBelow
    const maxHeight = Math.max(0, placeAbove ? availableAbove : availableBelow)
    return {
      x: Math.max(box.left + w / 2 + pad, Math.min(x, box.right - w / 2 - pad)),
      y: placeAbove ? Math.max(box.top + pad, y - Math.min(h, maxHeight) - pad) : belowY,
      maxHeight,
      dir: placeAbove ? 'down' : 'up',
    }
  }
  return {
    x: Math.max(box.left + w / 2 + pad, Math.min(x, box.right - w / 2 - pad)),
    y: preferAboveHit ? aboveY : overflowBottom ? Math.max(box.top + pad * 2, aboveY) : belowY,
    dir: preferAboveHit || overflowBottom ? 'down' : 'up',
  }
}
const popupStyle = ({ x, y, maxHeight }: { x: number; y: number; maxHeight?: number }) => ({
  left: `${x}px`,
  top: `${y}px`,
  transform: 'translate(-50%,0)',
  maxHeight: maxHeight ? `${maxHeight}px` : undefined,
})
const cardPlacement = computed(() => placePopup(state.x, state.panelY || state.y + 24, 280, state.panel === 'translate' ? 420 : state.isEditing ? 560 : 220, false, true))
const menuPosition = computed(() => popupStyle(placePopup(state.x, state.y, 240, 50, true)))
const cardPosition = computed(() => popupStyle(cardPlacement.value))
const sendMenuPosition = computed(() => {
  const quickHeight = quickDocs.value.length * 40
  const searchHeight = sendDocs.value.length ? Math.min(sendDocs.value.length, 5) * 40 : 60
  return popupStyle(placePopup(state.x, state.panelY || state.y + 24, 280, quickHeight + searchHeight + 40, false, true))
})

const markData = (mark: any, extra: Record<string, any> = {}) => ({
  currentMark: mark,
  text: mark.text || '',
  note: mark.note || '',
  tags: formatMarkTags(mark.tags),
  color: mark.color || 'yellow',
  style: mark.style || 'highlight',
  ...extra,
})
const markExportCtx = () => ({ bookUrl: getBookUrl(), isPdf: isPdf.value, showMsg: (msg: string, type?: string) => showMessage(msg, type === 'error' ? 2000 : 1500, type as any), i18n: props.i18n, marks: props.manager })
const selectionArgs = () => {
  const loc = state.selection?.location
  const pos = loc?.cfi || loc?.page || loc?.section
  return pos && loc ? [pos, state.text.trim(), state.color, state.style, loc.rects, (loc as any).textOffset] as const : null
}
const addSelectionMark = async (text: string, color: HighlightColor = state.color, style: typeof state.style = state.style) => {
  const args = selectionArgs()
  return args && props.manager ? await props.manager.addHighlight(args[0], text.trim(), color, style, args[4], args[5]) : null
}
const resetSendState = () => {
  sendSearch.value = ''
  sendDocs.value = []
}
const closeMenus = () => {
  state.showMenu = false
  state.showSendMenu = false
}
const closePanel = (clearSelection = false) => {
  Object.assign(state, {
    showPanel: false,
    panel: '',
    isEditing: false,
    currentMark: null,
    ...(clearSelection ? { selection: null } : {}),
  })
}
const setPanelState = (panel: '' | 'card' | 'translate', extra: Record<string, any> = {}) => {
  closeMenus()
  Object.assign(state, { showPanel: !!panel, panel, ...extra })
}
const openSelectionEditor = async () => {
  if (readOnly.value) return
  if (!state.selection) return
  const mark = await addSelectionMark(state.selection.text, state.color, state.style)
  if (!mark) return
  selectionDoc?.defaultView?.getSelection()?.removeAllRanges()
  window.getSelection()?.removeAllRanges()
  selectionDoc = null
  setPanelState('card', markData(mark, { x: state.x, y: state.y, panelY: state.panelY, selection: null, isEditing: true }))
}
const closeAll = () => {
  resetSendState()
  closeMenus()
  closePanel(true)
}
const openSelectionPanel = async (selection: MarkSelection, anchor: SelectionAnchor) => {
  const sameSelection = state.selection && getSelectionKey(state.selection) === getSelectionKey(selection)
  Object.assign(state, { selection, x: anchor.x, y: anchor.y, panelY: anchor.panelY || 0 })
  if (props.quickMarkMode) return await handleCopy(props.quickMarkColor, props.quickMarkStyle)
  if ((window as any).__sireader_settings?.translation?.autoOnSelection && state.panel !== 'translate' && (!props.can || props.can('translate'))) return setPanelState('translate', { currentMark: null, isEditing: false, text: selection.text, note: '', tags: '' })
  if (sameSelection && state.showMenu && !state.showPanel && !state.showSendMenu) return
  closePanel()
  Object.assign(state, { currentMark: null, isEditing: false, text: selection.text, note: '', tags: '', showMenu: true, showSendMenu: false })
}
const openMarkPanel = (mark: Mark, x: number, y: number, edit = false) => {
  setPanelState('card', markData(mark, { x, y, panelY: y, isEditing: edit }))
}

const showAnnotationCard = (mark: any) => {
  if (quickMarkCooldown) return
  const el = queryRoot().querySelector(`[data-id="${mark.id}"]`) as HTMLElement | null
  if (!el) return
  openMarkAtRect(mark, el.getBoundingClientRect(), document)
}

const getSelectionAnchor = (rect: DOMRect, doc: Document, center = true): SelectionAnchor => {
  const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null
  const box = iframe?.getBoundingClientRect()
  const x = box ? (rect.left > box.width ? rect.left % box.width : rect.left) + box.left : rect.left
  const y = box ? rect.top + box.top : rect.top
  return { x: x + (center ? rect.width / 2 : 0), y, panelY: y + rect.height + 8 }
}
const getSelectionKey = (selection: MarkSelection) => `${selection.location.format}:${selection.location.cfi || selection.location.page || selection.location.section || ''}:${selection.text}`
const openMarkAtRect = (mark: Mark, rect: DOMRect, doc: Document, center = true, edit = false) => {
  const anchor = getSelectionAnchor(rect, doc, center)
  openMarkPanel(mark, anchor.x, anchor.panelY || anchor.y, edit)
}
const checkSelection = (doc?: Document, e?: Event) => {
  if (props.quickMarkMode && e && !['mouseup', 'touchend'].includes(e.type)) return
  if ((window as any).__sireader_settings?.translation?.autoOnSelection && e && !['mouseup', 'touchend'].includes(e.type)) return
  const process = (targetDoc: Document, index?: number) => {
    const selection = targetDoc.defaultView?.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      if (state.selection) {
        state.selection = null
        selectionDoc = null
      }
      if (state.showMenu && !state.showPanel && !state.showSendMenu) closeAll()
      return false
    }
    try {
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const cfi = index !== undefined ? props.reader?.getView().getCFI(index, range) : undefined
      selectionDoc = targetDoc
      openSelectionPanel({ text: selection.toString().trim(), location: { format: 'epub', cfi } }, getSelectionAnchor(rect, targetDoc, index === undefined))
      return true
    } catch {
      return false
    }
  }
  if (props.reader) {
    const contents = props.reader.getView().renderer?.getContents?.()
    if (!contents) return
    for (const { doc: targetDoc, index } of contents) if (process(targetDoc, index)) return
  } else if (props.currentView && doc) process(doc)
}

const setupAnnotationListeners = () => {
  if (!props.reader || !props.manager) return
  props.reader.getView().addEventListener('show-annotation', ((e: CustomEvent) => {
    if (quickMarkCooldown) return
    const { value, range, rect } = e.detail
    if (!rect) return
    const mark = props.manager?.getAll().find(item => item.cfi === value)
    if (!mark) return
    try {
      openMarkAtRect(mark, range.getBoundingClientRect(), range.startContainer.ownerDocument, false)
    } catch {}
  }) as EventListener)
}
const handleGlobalEdit = (e: Event) => {
  const detail = (e as CustomEvent).detail
  if (detail?.manager && detail.manager !== props.manager) return
  detail?.item && openMarkPanel(detail.item, detail.position?.x, detail.position?.y, detail.edit === true)
}

onMounted(() => {
  window.addEventListener('sireader:edit-mark', handleGlobalEdit)
  if (!isMobile()) window.addEventListener('resize', closeAll)
  window.addEventListener('scroll', closeAll, true)
})
onUnmounted(() => {
  window.removeEventListener('sireader:edit-mark', handleGlobalEdit)
  if (!isMobile()) window.removeEventListener('resize', closeAll)
  window.removeEventListener('scroll', closeAll, true)
})

defineExpose({
  openSelectionPanel,
  openMarkPanel,
  closeAll,
  showAnnotationCard,
  checkSelection,
  setupAnnotationListeners,
  showSelectionMenu: openSelectionPanel,
  showMenu: (selection: MarkSelection, anchor: SelectionAnchor | number, y?: number) => openSelectionPanel(selection, typeof anchor === 'number' ? { x: anchor, y: y || 0, panelY: (y || 0) + 24 } : anchor),
  showCard: openMarkPanel,
})

const handleCopy = async (color?: HighlightColor, style?: typeof state.style) => {
  if (readOnly.value) return
  if (!state.selection) return
  await addSelectionMark(state.selection.text, color, style)
  if (!props.quickMarkMode) return closeAll()
  quickMarkCooldown = true
  setTimeout(() => { quickMarkCooldown = false }, 300)
  selectionDoc?.defaultView?.getSelection()?.removeAllRanges()
  window.getSelection()?.removeAllRanges()
  state.selection = null
  selectionDoc = null
}
const toggleSendMenu = () => {
  if (readOnly.value) return
  state.showSendMenu = !state.showSendMenu
  if (state.showSendMenu) resetSendState()
}
const searchSendDocs = async () => {
  const keyword = sendSearch.value.trim()
  if (!keyword) return sendDocs.value = []
  try { sendDocs.value = await (await import('@/composables/useSetting')).searchDocs(keyword) } catch { sendDocs.value = [] }
}
const handleSendToDoc = async (docId: string) => {
  if (readOnly.value) return
  if (props.can && !props.can('quick-send')) return props.showUpgrade?.('快捷发送')
  if (!docId) return
  const mark = state.selection ? await addSelectionMark(state.selection.text, props.quickMarkColor, props.quickMarkStyle) : state.currentMark
  if (mark) await (await import('@/utils/copy')).sendMarkToDoc(mark, docId, markExportCtx())
  closeAll()
}
const handleCopyText = () => {
  if (!state.selection) return
  navigator.clipboard.writeText(state.selection.text).then(() => showMessage(props.i18n?.copied || '已复制', 1000))
  closeAll()
}
const handleSpeak = () => {
  if (!state.selection || !props.ttsController) return
  if (props.can && !props.can('tts')) return props.showUpgrade?.('TTS朗读')
  props.ttsController.speak(state.selection.text, props.ttsConfig)
  closeMenus()
}
const handleDict = async () => {
  if (!state.selection) return
  const { openDict } = await import('@/utils/dictionary')
  openDict(state.selection.text, cardPlacement.value.x, cardPlacement.value.y, { text: state.selection.text, cfi: state.selection.location?.cfi, section: state.selection.location?.section, page: state.selection.location?.page, rects: state.selection.location?.rects })
  closeMenus()
}
const handleTranslate = () => {
  if (props.can && !props.can('translate')) return props.showUpgrade?.('翻译')
  setPanelState('translate')
}
const handleEdit = () => {
  if (readOnly.value) return
  state.tags = formatMarkTags((state.currentMark as any)?.tags)
  state.isEditing = true
}
const handleCopyMark = () => state.currentMark ? emit('copyMarkOnly', state.currentMark) : emit('copy', state.text)
const handleOpenBlock = () => state.currentMark?.blockId && openBlock(state.currentMark.blockId)
const handleShowFloat = (e: MouseEvent) => state.currentMark?.blockId && showFloat(state.currentMark.blockId, e.target as HTMLElement)
const goToMark = () => {
  if (!state.currentMark) return
  jump(state.currentMark, props.currentView, props.reader, props.manager)
  closeAll()
}
const handleSave = async () => {
  if (readOnly.value) return
  if (!props.manager) return
  try {
    if (state.currentMark) {
      const updates: any = { note: state.note.trim() || undefined, color: state.color, tags: parseMarkTags(state.tags) }
      Object.assign(updates, { text: state.text.trim(), style: state.style })
      const { saveMarkEdit } = await import('@/utils/copy')
      await saveMarkEdit(state.currentMark, updates, { ...markExportCtx(), reader: props.reader })
      Object.assign(state.currentMark, updates)
      showMessage(props.i18n?.saved || '已保存', 1000)
      state.isEditing = false
      return
    }
    const args = selectionArgs()
    const pos = args?.[0]
    if (!pos) return showMessage('无法获取位置信息', 2000, 'error')
    const tags = parseMarkTags(state.tags)
    await (state.note.trim() ? props.manager.addNote(pos, state.note.trim(), ...args.slice(1), tags) : props.manager.addHighlight(...args, tags))
    await (await import('@/composables/useSetting')).collectAnnotationTagPresets(tags).catch(() => {})
    closeAll()
  } catch {
    showMessage(props.i18n?.saveError || '保存失败', 2000, 'error')
  }
}
const handleDelete = async () => {
  if (readOnly.value) return
  if (!props.manager || !state.currentMark) return
  try {
    if (await props.manager.deleteMark(state.currentMark)) {
      showMessage(props.i18n?.deleted || '已删除', 1000)
      closeAll()
    } else showMessage('删除失败：未找到标注', 2000, 'error')
  } catch {
    showMessage(props.i18n?.deleteError || '删除失败', 2000, 'error')
  }
}
const handleCancel = () => state.currentMark ? setPanelState('card', { ...markData(state.currentMark, { isEditing: false }) }) : closeAll()
const handleImport = async () => {
  if (readOnly.value) return
  if (!state.currentMark) return
  const { importMark } = await import('@/utils/copy')
  await importMark(state.currentMark, markExportCtx())
}
</script>

<style scoped lang="scss">
.mark-overlay{position:fixed;inset:0;z-index:949;background:transparent}
.mark-menu{position:fixed;z-index:950;display:flex;gap:4px;padding:6px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);button{width:32px;height:32px;padding:0;border:none;background:transparent;border-radius:6px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);display:flex;align-items:center;justify-content:center;svg{width:16px;height:16px}&:hover{background:var(--b3-list-hover);color:var(--b3-theme-primary)}}}
.send-menu{flex-direction:column;width:280px;max-height:400px;overflow-y:auto;button{width:100%;height:auto;padding:8px;justify-content:flex-start;border-radius:0;border-bottom:1px solid var(--b3-border-color);font-size:12px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;&:last-child{border-bottom:none}}}
.send-input{margin:8px;width:calc(100% - 16px)}
.send-empty{padding:16px 8px;text-align:center;color:var(--b3-theme-on-surface-variant);font-size:12px;opacity:.6}
.send-item:hover{background:var(--b3-list-hover)}
.sr-popup-panel{--sr-gap:4px;--sr-line:19px;position:fixed;z-index:10002!important;width:280px;max-width:min(280px,calc(100vw - 12px));max-height:calc(100vh - 32px);pointer-events:auto;cursor:default;overflow:visible;box-sizing:border-box;padding:7px;border:1px solid color-mix(in srgb,var(--b3-border-color) 92%,transparent);border-radius:8px;background:linear-gradient(180deg,color-mix(in srgb,var(--b3-theme-background) 96%,white),var(--b3-theme-background));color:var(--b3-theme-on-surface);box-shadow:0 10px 28px #0002,0 2px 8px #0001!important;transition:border-color .15s,box-shadow .15s}
.sr-popup-panel::before{content:'';position:absolute;left:50%;top:-5px;width:10px;height:10px;transform:translateX(-50%) rotate(45deg);border-left:inherit;border-top:inherit;background:inherit;border-radius:2px}
.sr-popup-panel.is-above::before{top:auto;bottom:-5px;border:0;border-right:inherit;border-bottom:inherit}
.sr-popup-panel:hover{border-color:var(--b3-theme-primary);box-shadow:0 12px 32px #0003,0 2px 8px #0001!important}
.sr-popup-panel>.sr-main{display:flex;flex-direction:column;gap:var(--sr-gap);box-sizing:border-box;min-height:100%;max-height:inherit;overflow:auto;overscroll-behavior:contain;padding-left:0;position:relative;z-index:1}
.sr-icon-actions{display:flex;align-items:center;gap:4px}
.sr-icon-actions button{display:flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:none;border-radius:4px;background:transparent;color:var(--b3-theme-on-surface-variant);line-height:1;cursor:pointer}
.sr-icon-actions button:hover{background:var(--b3-list-hover);color:var(--b3-theme-primary)}
.sr-icon-actions svg{width:14px;height:14px}
</style>
