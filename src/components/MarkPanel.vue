<template>
  <Teleport to="body">
    <!-- 遮罩：捕获外部点击 -->
    <div v-if="state.showMenu||state.showCard" class="mark-overlay" @click="closeAll"/>
    
    <!-- 选择菜单：一行三按钮 -->
    <div v-if="state.showMenu" class="mark-menu" :style="menuPosition" @click.stop>
      <button @click="handleMark" class="b3-tooltips b3-tooltips__s" :aria-label="i18n?.mark||'标注'"><svg><use xlink:href="#iconMark"/></svg></button>
      <button @click="handleCopy" class="b3-tooltips b3-tooltips__s" :aria-label="i18n?.copy||'复制'"><svg><use xlink:href="#iconCopy"/></svg></button>
      <button @click="handleDict" class="b3-tooltips b3-tooltips__s" :aria-label="i18n?.dict||'词典'"><svg><use xlink:href="#iconLanguage"/></svg></button>
    </div>
    
    <!-- 标注卡片 -->
    <div v-if="state.showCard" v-motion :initial="{opacity:0,y:5}" :enter="{opacity:1,y:0}" class="sr-card" :style="cardPosition" @click.stop>
      <div class="sr-main" :style="{borderLeftColor:currentColor}">
        <!-- 查看模式 -->
        <template v-if="!state.isEditing">
          <div class="sr-title" @click="goToMark">{{state.text||'无内容'}}</div>
          <div v-if="state.note" class="sr-note" @click.stop="handleEdit">{{state.note}}</div>
          <div class="sr-btns">
            <button @click.stop="handleCopyMark" class="b3-tooltips b3-tooltips__nw" :aria-label="i18n.copy||'复制'"><svg><use xlink:href="#iconCopy"/></svg></button>
            <button @click.stop="handleEdit" class="b3-tooltips b3-tooltips__nw" :aria-label="i18n.edit||'编辑'"><svg><use xlink:href="#iconEdit"/></svg></button>
            <button v-if="state.currentMark?.blockId" @click.stop="handleOpenBlock" @mouseenter="handleShowFloat" @mouseleave="hideFloat" class="b3-tooltips b3-tooltips__nw" aria-label="打开块"><svg><use xlink:href="#iconRef"/></svg></button>
            <button v-else @click.stop="handleImport" class="b3-tooltips b3-tooltips__nw" :aria-label="i18n.import||'导入'"><svg><use xlink:href="#iconDownload"/></svg></button>
            <button @click.stop="handleDelete" class="b3-tooltips b3-tooltips__nw" :aria-label="i18n.delete||'删除'"><svg><use xlink:href="#iconTrashcan"/></svg></button>
          </div>
        </template>
        
        <!-- 编辑模式 -->
        <template v-else>
          <!-- 标注文本 -->
          <div v-if="state.currentMark?.type!=='shape'" class="sr-title" contenteditable @blur="e=>state.text=(e.target as HTMLElement).textContent||''" v-html="state.text"></div>
          <div v-else class="sr-title">{{state.text}}</div>
          
          <!-- 笔记输入 -->
          <textarea ref="noteRef" v-model="state.note" placeholder="添加笔记..." class="sr-note-input"/>
          
          <!-- 样式选项 -->
          <div class="sr-options">
            <!-- 颜色选择 -->
            <div class="sr-colors">
              <button v-for="c in COLORS" :key="c.color" class="sr-color-btn" :class="{active:state.color===c.color}" :style="{background:c.bg}" @click.stop="state.color=c.color"/>
            </div>
            
            <!-- 形状样式（PDF） -->
            <div v-if="state.currentMark?.type==='shape'" class="sr-styles">
              <button v-for="s in SHAPES" :key="s.type" class="sr-style-btn" :class="{active:state.shapeType===s.type}" @click.stop="state.shapeType=s.type" :title="s.name"><svg style="width:16px;height:16px"><use :xlink:href="s.icon"/></svg></button>
              <span class="toolbar-divider"/>
              <button class="sr-style-btn" :class="{active:state.shapeFilled}" @click.stop="state.shapeFilled=!state.shapeFilled" title="填充"><svg style="width:16px;height:16px"><use xlink:href="#lucide-paint-bucket"/></svg></button>
            </div>
            
            <!-- 文本样式 -->
            <div v-else class="sr-styles">
              <button v-for="s in STYLES" v-show="(!s.pdfOnly&&!s.epubOnly)||(s.pdfOnly&&isPdf)||(s.epubOnly&&!isPdf)" :key="s.type" class="sr-style-btn" :class="{active:state.style===s.type}" @click.stop="state.style=s.type">
                <span class="sr-style-icon" :data-type="s.type">{{s.text}}</span>
              </button>
            </div>
          </div>
          
          <!-- 操作按钮 -->
          <div class="sr-actions">
            <button @click.stop="handleCopyMark">复制</button>
            <button @click.stop="handleSave" class="primary">保存</button>
            <button @click.stop="handleCancel">取消</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { showMessage } from 'siyuan'
import type { MarkManager, Mark, HighlightColor } from '@/core/MarkManager'
import { COLORS, STYLES, getColorMap } from '@/core/MarkManager'
import { openBlock, showFloat, hideFloat } from '@/utils/copy'
import { jump } from '@/utils/jump'

interface MarkSelection { text: string; location: { format: 'pdf'|'epub'|'txt'; cfi?: string; section?: number; page?: number; rects?: any[] } }

const props = defineProps<{ manager: MarkManager|null; i18n?: Record<string,string>; pdfViewer?: any; reader?: any; currentView?: any }>()
const emit = defineEmits<{ 
  copy: [text: string, selection: any]; 
  dict: [text: string, x: number, y: number, selection: any]; 
  copyMark: [mark: Mark] 
}>()

const SHAPES = [
  { type: 'rect', name: '矩形', icon: '#iconSquareDashed' },
  { type: 'circle', name: '圆形', icon: '#iconCircleDashed' },
  { type: 'triangle', name: '三角形', icon: '#iconTriangleDashed' }
] as const

const colors = getColorMap()
const noteRef = ref<HTMLTextAreaElement>()
const state = reactive({
  showMenu: false, showCard: false, isEditing: false, x: 0, y: 0,
  selection: null as MarkSelection|null, currentMark: null as Mark|null,
  text: '', note: '', color: 'yellow' as HighlightColor,
  style: 'highlight' as 'highlight'|'underline'|'outline'|'dotted'|'dashed'|'double'|'squiggly',
  shapeType: 'rect' as 'rect'|'circle'|'triangle', shapeFilled: false
})

// 当前选择状态（用于复制链接）
let currentSelection: { text: string; cfi?: string; section?: number; page?: number; rects?: any[]; textOffset?: number } | null = null

// 计算属性
const currentColor = computed(() => colors[state.color] || '#ffeb3b')
const isPdf = computed(() => (state.selection?.location.format || state.currentMark?.format) === 'pdf')
const menuPosition = computed(() => ({ left: `${state.x}px`, top: `${state.y}px`, transform: 'translate(-50%,-100%) translateY(-8px)' }))
const cardPosition = computed(() => { // 边缘检测
  const w = 340, h = state.isEditing ? 420 : 180, p = 10
  const x = Math.max(w/2+p, Math.min(state.x, innerWidth-w/2-p))
  const y = state.y+h+p*2 > innerHeight ? Math.max(p*2, state.y-h-p) : state.y+p
  return { left: `${x}px`, top: `${y}px`, transform: 'translate(-50%,0)' }
})

// 显示菜单/卡片
const showMenu = (sel: MarkSelection, x: number, y: number) => {
  currentSelection = { text: sel.text, cfi: sel.location.cfi, section: sel.location.section, page: sel.location.page, rects: sel.location.rects, textOffset: (sel.location as any).textOffset }
  Object.assign(state, { selection: sel, x, y, showMenu: true, showCard: false })
}
const showCard = (mark: Mark, x: number, y: number, edit = false) => {
  Object.assign(state, {
    currentMark: mark, text: mark.text || (mark.type === 'shape' ? '形状标注' : ''), note: mark.note || '',
    color: mark.color || 'yellow', style: mark.style || 'highlight', shapeType: mark.shapeType || 'rect',
    shapeFilled: mark.filled || false, x, y, isEditing: edit, showCard: true
  })
  if (edit) nextTick(() => noteRef.value?.focus())
}
const closeAll = () => {
  currentSelection = null
  Object.assign(state, { showMenu: false, showCard: false, isEditing: false, selection: null, currentMark: null })
}

// 形状标注点击处理（PDF）
const showShapeCard = (shape: any, pdfViewer: any) => {
  const el = document.querySelector(`.pdf-shape-layer[data-page="${shape.page}"]`)
  if (!el || !pdfViewer) return
  const r = el.getBoundingClientRect()
  const page = pdfViewer.getPages().get(shape.page)
  if (!page) return
  const viewport = page.getViewport({ scale: pdfViewer.getScale(), rotation: pdfViewer.getRotation() })
  const [x1, y1, x2, y2] = shape.rect
  const b1 = viewport.convertToViewportRectangle([x1, y1, x1, y1])
  const b2 = viewport.convertToViewportRectangle([x2, y2, x2, y2])
  const x = r.left + (b1[0] + b2[0]) / 2
  const y = r.top + Math.max(b1[1], b2[1]) + 10
  showCard(shape, x, y, false)
}

// PDF 文本标注点击处理
const showAnnotationCard = (annotation: any) => {
  const el = document.querySelector(`[data-id="${annotation.id}"]`)
  if (!el) return
  const r = el.getBoundingClientRect()
  showCard(annotation, r.left + r.width / 2, r.bottom, false)
}

// 工具函数：获取坐标（iframe转换）
const getCoords = (rect: DOMRect, doc: Document) => {
  const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null
  if (!iframe) return { x: rect.left, y: rect.top }
  const ir = iframe.getBoundingClientRect()
  return { x: (rect.left > ir.width ? rect.left % ir.width : rect.left) + ir.left, y: rect.top + ir.top }
}

// EPUB/TXT 文本选择检测
const checkSelection = (txtDoc?: Document, e?: MouseEvent) => {
  if (e && (e.target as HTMLElement).closest('.mark-card,.mark-selection-menu,[data-note-marker],[data-txt-mark]')) return
  
  const processSelection = (doc: Document, index?: number) => {
    const sel = doc.defaultView?.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return false
    try {
      const range = sel.getRangeAt(0), rect = range.getBoundingClientRect()
      const { x, y } = getCoords(rect, doc)
      const text = sel.toString().trim()
      const cfi = index !== undefined ? props.reader?.getView().getCFI(index, range) : undefined
      const section = index === undefined ? props.currentView?.lastLocation?.section || 0 : undefined
      
      let textOffset: number | undefined
      if (section !== undefined && !cfi) {
        let o = 0
        const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
        for (let n: Node | null; n = w.nextNode();) {
          if (n === range.startContainer) { textOffset = o + range.startOffset; break }
          o += (n.textContent || '').length
        }
      }
      
      currentSelection = { text, cfi, section, textOffset }
      showMenu({ text, location: { format: props.pdfViewer ? 'pdf' : 'epub', cfi, section, textOffset } }, x + (index === undefined ? rect.width / 2 : 0), y)
      return true
    } catch { return false }
  }
  
  if (props.reader) {
    const c = props.reader.getView().renderer?.getContents?.()
    if (!c) return
    for (const { doc, index } of c) if (processSelection(doc, index)) return
  } else if (props.currentView && txtDoc && processSelection(txtDoc)) return
}

// EPUB 标注点击监听器
const setupAnnotationListeners = () => {
  if (!props.reader || !props.manager) return
  props.reader.getView().addEventListener('show-annotation', ((e: CustomEvent) => {
    const { value, range } = e.detail
    const mark = props.manager?.getAll().find(m => m.cfi === value)
    if (!mark) return
    try {
      const rect = range.getBoundingClientRect()
      const { x, y } = getCoords(rect, range.startContainer.ownerDocument)
      showCard(mark, x, y + rect.height + 10, false)
    } catch {}
  }) as EventListener)
}

// 全局编辑事件处理
const handleGlobalEdit = (e: Event) => {
  const d = (e as CustomEvent).detail
  d?.item && showCard(d.item, d.position?.x, d.position?.y, true)
}

// TXT 选择事件处理
const handleTxtSelection = (e: Event) => {
  const d = (e as CustomEvent).detail
  setTimeout(() => checkSelection(d?.doc, d?.event), 50)
}

// TXT 标注点击事件处理
const handleTxtAnnotationClick = (e: Event) => {
  const { mark, x, y } = (e as CustomEvent).detail
  showCard(mark, x, y, false)
}

// 初始化监听器
const initListeners = () => {
  setupAnnotationListeners()
  window.addEventListener('sireader:edit-mark', handleGlobalEdit)
  window.addEventListener('txt-selection', handleTxtSelection)
  window.addEventListener('txt-annotation-click', handleTxtAnnotationClick)
}

// 清理监听器
const cleanupListeners = () => {
  window.removeEventListener('sireader:edit-mark', handleGlobalEdit)
  window.removeEventListener('txt-selection', handleTxtSelection)
  window.removeEventListener('txt-annotation-click', handleTxtAnnotationClick)
}

// 生命周期
onMounted(initListeners)
onUnmounted(cleanupListeners)

defineExpose({ showMenu, showCard, closeAll, showShapeCard, showAnnotationCard, checkSelection, setupAnnotationListeners })

// 选择菜单操作
const handleMark=()=>{if(!state.selection)return;Object.assign(state,{currentMark:null,text:state.selection.text,note:'',isEditing:true,showMenu:false,showCard:true});nextTick(()=>noteRef.value?.focus())}
const handleCopy=()=>{state.selection&&(emit('copy',state.selection.text,currentSelection),closeAll())}
const handleDict=()=>{state.selection&&(emit('dict',state.selection.text,state.x,state.y,currentSelection),closeAll())}

// 卡片操作
const handleEdit=()=>{state.isEditing=true;nextTick(()=>noteRef.value?.focus())}
const handleCopyMark=()=>state.currentMark?emit('copyMark',state.currentMark):emit('copy',state.text)
const handleOpenBlock=()=>state.currentMark?.blockId&&openBlock(state.currentMark.blockId)
const handleShowFloat=(e:MouseEvent)=>state.currentMark?.blockId&&showFloat(state.currentMark.blockId,e.target as HTMLElement)
const goToMark=()=>{state.currentMark&&(jump(state.currentMark,(window as any).__activeView,(window as any).__activeReader,props.manager),closeAll())}

const handleSave = async () => {
  if (!props.manager) return
  try {
    if (state.currentMark) { // 更新现有标注
      const updates: any = { note: state.note.trim() || undefined, color: state.color }
      if (state.currentMark.type === 'shape') Object.assign(updates, { shapeType: state.shapeType, filled: state.shapeFilled })
      else Object.assign(updates, { text: state.text.trim(), style: state.style })
      const { saveMarkEdit } = await import('@/utils/copy')
      await saveMarkEdit(state.currentMark, updates, { marks: props.manager, bookUrl: (window as any).__currentBookUrl||'', isPdf: isPdf.value, reader: (window as any).__activeReader, pdfViewer: (window as any).__activeView?.viewer, shapeCache: new Map() })
      showMessage(props.i18n?.saved||'已保存', 1000)
      state.isEditing = false
    } else if (state.selection) { // 创建新标注
      const pos = state.selection.location?.cfi || state.selection.location?.page || state.selection.location?.section
      if (!pos) return showMessage('无法获取位置信息', 2000, 'error')
      const loc = state.selection.location
      const args = [pos, state.text.trim(), state.color, state.style, loc.rects, loc.textOffset]
      if (state.note.trim()) await props.manager.addNote(pos, state.note.trim(), ...args.slice(1))
      else await props.manager.addHighlight(...args)
      showMessage(props.i18n?.created||'已创建', 1000)
      closeAll()
    }
  } catch (e) {
    console.error('[MarkPanel] Save:', e)
    showMessage(props.i18n?.saveError||'保存失败', 2000, 'error')
  }
}

const handleDelete = async () => {
  if (!props.manager || !state.currentMark) return
  try {
    await props.manager.deleteMark(state.currentMark)?(showMessage(props.i18n?.deleted||'已删除',1000),closeAll()):showMessage('删除失败：未找到标注',2000,'error')
  } catch (e) {
    console.error('[MarkPanel] Delete:', e)
    showMessage(props.i18n?.deleteError||'删除失败', 2000, 'error')
  }
}

const handleCancel=()=>{state.currentMark?Object.assign(state,{text:state.currentMark.text||'',note:state.currentMark.note||'',color:state.currentMark.color||'yellow',style:state.currentMark.style||'highlight',isEditing:false}):closeAll()}

const handleImport = async () => {
  if (!state.currentMark) return
  const { importMark } = await import('@/utils/copy')
  await importMark(state.currentMark, { bookUrl: (window as any).__currentBookUrl||'', isPdf: isPdf.value, showMsg: (m: string, t?: string) => showMessage(m, t==='error'?2000:1500, t as any), i18n: props.i18n, marks: props.manager })
}
</script>

<style scoped lang="scss">
@use './deck/deck.scss';
.mark-overlay{position:fixed;inset:0;z-index:949;background:transparent}
.mark-menu{position:fixed;z-index:950;display:flex;gap:4px;padding:6px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);button{width:32px;height:32px;padding:0;border:none;background:transparent;border-radius:6px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);display:flex;align-items:center;justify-content:center;svg{width:16px;height:16px}&:hover{background:var(--b3-list-hover);color:var(--b3-theme-primary)}}}
.sr-card{position:fixed;z-index:950;width:340px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1)}
.sr-main{padding:12px;border-left:4px solid;border-radius:8px}
.sr-title{font-size:13px;font-weight:500;line-height:1.6;color:var(--b3-theme-on-surface);margin-bottom:8px;cursor:pointer;&[contenteditable]{font-size:15px;font-weight:600}}
.sr-note{font-size:12px;color:var(--b3-theme-on-surface-variant);line-height:1.5;margin-bottom:8px;cursor:text}
.sr-btns{display:flex;gap:8px;button{width:32px;height:32px;padding:0;border:none;background:transparent;border:1px solid var(--b3-border-color);border-radius:4px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);display:flex;align-items:center;justify-content:center;svg{width:14px;height:14px}&:hover{background:var(--b3-list-hover);border-color:var(--b3-theme-primary);color:var(--b3-theme-primary)}}}
.sr-note-input{width:100%;min-height:60px;padding:8px;border:1px solid var(--b3-border-color);border-radius:4px;font-size:12px;line-height:1.5;resize:vertical;background:var(--b3-theme-background);color:var(--b3-theme-on-surface-variant);margin-bottom:8px;&:focus{outline:1px solid var(--b3-theme-primary);border-color:var(--b3-theme-primary)}}
.sr-options{margin-bottom:12px}
.sr-colors{display:flex;gap:6px;margin-bottom:8px}
.sr-color-btn{width:28px;height:28px;border:2px solid transparent;border-radius:50%;cursor:pointer;transition:all .15s;padding:0;&.active{border-color:var(--b3-theme-on-surface);transform:scale(1.1);box-shadow:0 2px 8px rgba(0,0,0,.2)}&:hover{transform:scale(1.05)}}
.sr-styles{display:flex;gap:4px;.toolbar-divider{width:1px;height:24px;background:var(--b3-border-color);margin:0 4px}}
.sr-style-btn{width:36px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid var(--b3-border-color);background:transparent;border-radius:4px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);.sr-style-icon{display:inline-block;font-size:14px;font-weight:500;line-height:1.4;padding:4px 0;min-width:16px;text-align:center;&[data-type="highlight"]{background:#ffeb3b;padding:2px 4px}&[data-type="underline"]{border-bottom:2px solid currentColor;padding-bottom:2px}&[data-type="outline"]{border:2px solid currentColor;padding:2px 4px}&[data-type="dotted"]{border-bottom:2px dotted currentColor;padding-bottom:2px}&[data-type="dashed"]{border-bottom:2px dashed currentColor;padding-bottom:2px}&[data-type="double"]{border-bottom:4px double currentColor;padding-bottom:1px}&[data-type="squiggly"]{text-decoration:underline wavy;text-decoration-thickness:2px;text-underline-offset:2px}}&.active{background:var(--b3-theme-primary-lightest);border-color:var(--b3-theme-primary);color:var(--b3-theme-primary)}&:hover{background:var(--b3-list-hover)}}
.sr-actions{display:flex;gap:8px;button{padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;transition:all .15s;border:1px solid var(--b3-border-color);background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);&:hover{background:var(--b3-list-hover)}&.primary{background:var(--b3-theme-primary);color:white;border-color:var(--b3-theme-primary);&:hover{opacity:.9}}}}
</style>
