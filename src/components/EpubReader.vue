<template>
  <div class="epub-reader" @click="handleClick">
    <div ref="readerWrapRef" class="epub-reader-wrap">
      <div ref="containerRef" class="epub-container" tabindex="0"></div>
    </div>
    
    <div v-if="ui.loading" class="epub-loading">
      <div class="loading-spinner"></div>
      <div>{{ ui.error || i18n?.loading || '加载中...' }}</div>
    </div>
    
    <div v-if="ui.loadingNext" class="epub-loading-next">
      <div class="loading-spinner-small"></div>
      <span>{{ i18n?.loadingNext || '加载下一章...' }}</span>
    </div>
    
    <div class="epub-toolbar">
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="showTocDialog" :aria-label="i18n?.tocBtn || '目录'">
          <svg><use xlink:href="#iconList"></use></svg>
        </button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="rendition?.prev()" :aria-label="i18n?.prevBtn || '上一页'">
          <svg><use xlink:href="#iconLeft"></use></svg>
        </button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="rendition?.next()" :aria-label="i18n?.nextBtn || '下一页'">
          <svg><use xlink:href="#iconRight"></use></svg>
        </button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="emit('settings')" :aria-label="i18n?.settingsBtn || '设置'">
          <svg><use xlink:href="#iconSettings"></use></svg>
        </button>
    </div>
    
    <div v-show="ui.menuShow" class="epub-selection-menu" :style="{ left: ui.menuX + 'px', top: ui.menuY + 'px' }" @mousedown.stop @mouseleave="ui.colorShow = false">
      <div class="menu-btn-wrapper">
        <div v-show="ui.colorShow" class="color-picker" @mousedown.stop>
          <button 
            v-for="c in COLORS" :key="c.color"
            class="color-btn" 
            :style="{ background: c.bg }" 
            :title="c.title"
            @click.stop="addHighlight(c.color), closeMenu()"
          ></button>
        </div>
        <button class="menu-btn b3-tooltips b3-tooltips__n" @mouseenter="ui.colorShow = true" @click.stop="addHighlight('yellow'), closeMenu()" :aria-label="i18n?.highlight || '标注'"><svg><use xlink:href="#iconMark"></use></svg></button>
      </div>
      <button class="menu-btn b3-tooltips b3-tooltips__n" @click.stop="addHighlightWithNote(), closeMenu()" :aria-label="i18n?.addNote || '添加笔记'"><svg><use xlink:href="#iconEdit"></use></svg></button>
      <button class="menu-btn b3-tooltips b3-tooltips__n" @click.stop="copySelection(), closeMenu()" :aria-label="i18n?.copyBtn || '复制'"><svg><use xlink:href="#iconCopy"></use></svg></button>
      <button class="menu-btn b3-tooltips b3-tooltips__n" @click.stop="openDict(ui.menuText, ui.menuX, ui.menuY + 50), closeMenu()" :aria-label="i18n?.dictBtn || '词典'"><svg><use xlink:href="#iconLanguage"></use></svg></button>
    </div>
  </div>
</template>

// ========================================
// EPUB 阅读器组件
// 职责：书籍渲染、交互、标注、进度管理
// ========================================

<script setup lang="ts">
import { reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import type { Book, Rendition } from 'epubjs'
import ePub from 'epubjs'
import { showMessage } from 'siyuan'
import type { Plugin } from 'siyuan'
import type { ReaderSettings } from '@/composables/useSetting'
import * as API from '@/api'
import { openDict } from '@/core/dictionary'
import { getOrCreateDoc, addHighlight as saveHighlight, restoreHighlights, clearCache, addSingleHighlight, verifyDoc } from '@/core/epubDoc'
import { HL_STYLES } from '@/core/epub'
import { EpubToc } from '@/core/toc'

// ===== 类型定义 =====
export type HighlightColor = 'red' | 'orange' | 'yellow' | 'green' | 'pink' | 'blue' | 'purple'

const TIMERS = { HIGHLIGHT_DELAY: 300, PROGRESS_SAVE: 2000, MENU_DEBOUNCE: 100, INIT_DELAY: 1000 }
const SCROLL_THRESHOLD = 800

interface Props {
  file: File
  plugin: Plugin
  settings?: ReaderSettings
  url?: string
  blockId?: string
  cfi?: string
  onRenditionReady?: (rendition: any) => void  //  暴露 rendition
}

const props = withDefaults(defineProps<Props>(), {
  settings: () => ({
    enabled: true,
    openMode: 'newTab',
    pageTurnMode: 'click',
    pageAnimation: 'slide',
    columnMode: 'single',
  })
})

const i18n = props.plugin.i18n as any
// ===== 常量配置 =====
const COLORS: { color: HighlightColor; bg: string; title: string }[] = [
  { color: 'red', bg: '#f44336', title: i18n?.colorRed || '红色' },
  { color: 'orange', bg: '#ff9800', title: i18n?.colorOrange || '橙色' },
  { color: 'yellow', bg: '#ffeb3b', title: i18n?.colorYellow || '黄色' },
  { color: 'green', bg: '#4caf50', title: i18n?.colorGreen || '绿色' },
  { color: 'pink', bg: '#e91e63', title: i18n?.colorPink || '粉色' },
  { color: 'blue', bg: '#2196f3', title: i18n?.colorBlue || '蓝色' },
  { color: 'purple', bg: '#9c27b0', title: i18n?.colorPurple || '紫色' },
]

const emit = defineEmits<{
  toc: []
  settings: []
}>()

const containerRef = ref<HTMLElement>()
const readerWrapRef = ref<HTMLElement>()
// ===== 响应式状态 =====
const ui = reactive({ loading: true, error: '', loadingNext: false, menuShow: false, menuX: 0, menuY: 0, menuText: '', menuCfi: '', colorShow: false })
const timers = { progress: 0, menu: 0 }

let rendition: Rendition | null = null, book: Book | null = null, annotationDocId = '', progress = 0, currentHref = ''
let tocPanel: EpubToc | null = null

const closeMenu = () => (ui.menuShow = ui.colorShow = false)

// ===== 滚动加载 =====
const handleScroll = () => {
  if (ui.loadingNext || !rendition) return
  const doc = containerRef.value?.querySelector('iframe')?.contentDocument
  if (!doc) return
  const { scrollHeight, scrollTop, clientHeight } = doc.documentElement
  const isNearBottom = scrollHeight - (scrollTop || doc.body.scrollTop) - clientHeight < SCROLL_THRESHOLD
  isNearBottom && (ui.loadingNext = true, rendition.next().finally(() => setTimeout(() => ui.loadingNext = false, 300)))
}

// ===== 书籍加载 =====
const openBook = async () => {
  if (!props.file || !containerRef.value) return
  rendition?.destroy(), book?.destroy()
  ui.loading = true, ui.error = ''
  try {
    book = ePub(await props.file.arrayBuffer())
    await book.ready
    const isScroll = props.settings?.pageAnimation === 'scroll'
    const config: any = { width: '100%', height: '100%', allowScriptedContent: true, ...(isScroll ? { manager: 'continuous', flow: 'scrolled', snap: false } : { flow: 'paginated', spread: props.settings?.columnMode === 'double' ? 'auto' : 'none' }) }
    
    rendition = book.renderTo(containerRef.value, config)
    
    // 主题应用
    const applyTheme = async (settings?: typeof props.settings) => {
      if (!settings) return
      const { applyTheme: apply } = await import('../composables/useSetting')
      containerRef.value?.querySelectorAll('iframe').forEach(iframe => iframe.contentDocument?.body && apply(iframe.contentDocument.body, settings))
    }
    
    props.onRenditionReady?.(rendition)
    
    // 恢复阅读状态（解析文档ID优先级：URL > blockId > 块属性）
    let isInit = true
    const urlDocId = props.url?.split('#')[2]
    let cfi = props.cfi
    if (urlDocId && await verifyDoc(urlDocId)) annotationDocId = urlDocId
    else if (props.blockId && await verifyDoc(props.blockId)) annotationDocId = props.blockId
    else if (props.blockId) {
      const attrs = await API.getBlockAttrs(props.blockId)
      const id = attrs['memo'] || attrs['custom-epub-doc-id']
      if (id && await verifyDoc(id)) annotationDocId = id
      else if (id) await API.setBlockAttrs(props.blockId, { 'memo': '' }).catch(() => {})
      cfi = props.cfi || attrs['custom-epub-cfi']
    }
    await rendition.display(cfi)
    annotationDocId && setTimeout(() => restoreHighlights(annotationDocId, rendition, HL_STYLES), TIMERS.HIGHLIGHT_DELAY)
    
    // 加载目录（在获取 annotationDocId 之后）
    book.loaded.navigation.then(async (nav: any) => {
      tocPanel = new EpubToc(readerWrapRef.value!, props.settings?.tocPosition || 'left', rendition, annotationDocId, getBaseUrl())
      await tocPanel.load(nav)
    }).catch(() => {})
    await applyTheme(props.settings)
    book.locations.generate(1024).catch(() => {})
    setTimeout(() => isInit = false, TIMERS.INIT_DELAY)
    
    // 监听翻页
    rendition.on('relocated', (loc: any) => {
      closeMenu()
      if (!loc?.start) return
      currentHref = loc.start.href || ''
      annotationDocId && restoreHighlights(annotationDocId, rendition, HL_STYLES)
      if (!props.blockId || isInit || !loc.start.cfi) return
      const prog = (loc.start.percentage || (loc.start.index + 1) / (book?.spine.length || 1)) * 100
      if (Math.abs(prog - progress) < 0.1) return
      clearTimeout(timers.progress)
      timers.progress = window.setTimeout(() => API.setBlockAttrs(props.blockId!, { 'custom-epub-cfi': loc.start.cfi, 'custom-epub-progress': prog.toFixed(3), 'custom-epub-last-read': new Date().toISOString() }).then(() => progress = prog).catch(() => {}), TIMERS.PROGRESS_SAVE)
    })
    
    // 文本选择
    const handleSel = (iframe: HTMLIFrameElement) => {
      clearTimeout(timers.menu)
      timers.menu = window.setTimeout(() => {
        try {
          const sel = iframe.contentWindow?.getSelection()
          const text = sel?.toString().trim()
          if (!text || !sel?.rangeCount || sel.isCollapsed) return closeMenu()
          const rect = sel.getRangeAt(0).getBoundingClientRect(), iRect = iframe.getBoundingClientRect()
          ui.menuText = text, ui.menuX = iRect.left + rect.left + rect.width / 2 - 70, ui.menuY = iRect.top + rect.top - 50, ui.menuShow = true
        } catch { closeMenu() }
      }, TIMERS.MENU_DEBOUNCE)
    }
    const regEvents = (doc: Document, iframe: HTMLIFrameElement) => {
      const h = () => handleSel(iframe)
      doc.addEventListener('selectionchange', h)
      doc.addEventListener('mouseup', h)
    }
    
    // 内容注册
    rendition.hooks.content.register((contents: any) => {
      const iframe = contents.document.defaultView.frameElement as HTMLIFrameElement
      iframe.hasAttribute('sandbox') && iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts')
      isScroll && iframe.contentWindow?.addEventListener('scroll', handleScroll, { passive: true })
      regEvents(contents.document, iframe)
      applyTheme(props.settings)
    })
    rendition.on('rendered', () => { const iframe = containerRef.value?.querySelector('iframe'); iframe?.contentDocument && regEvents(iframe.contentDocument, iframe) })
    rendition.on('selected', (cfiRange: string) => ui.menuCfi = cfiRange)
    const onSettings = ((e: CustomEvent) => e.detail && applyTheme(e.detail)) as EventListener
    window.addEventListener('sireaderSettingsUpdated', onSettings)
    onUnmounted(() => window.removeEventListener('sireaderSettingsUpdated', onSettings))
  } catch (e) {
    ui.error = e instanceof Error ? e.message : i18n?.loadFailed || '加载失败'
    console.error('[SiReader]', e)
  } finally {
    ui.loading = false
  }
}

// ===== 工具函数 =====
const cleanText = (text: string) => text.replace(/[\r\n]+/g, ' ').trim()
const getBaseUrl = () => props.url?.split('#')[0] || ''
const buildUrl = (cfi: string, docId?: string) => {
  const base = getBaseUrl()
  return base && cfi ? `${base}#${cfi}${docId ? '#' + docId : ''}` : ''
}
const getCurrentChapter = (): string => {
  if (!currentHref || !book?.navigation?.toc) return ''
  const h = currentHref.split('#')[0]
  const find = (items: any[]): string => items.reduce((r, i) => r || (i.href.split('#')[0] === h ? i.label : find(i.subitems || [])), '')
  const ch = find(book.navigation.toc)
  return ch ? `（${cleanText(ch)}）` : ''
}

// ===== 文本操作 =====
const copySelection = () => {
  const { menuText: text, menuCfi: cfi } = ui
  if (!text) return
  const url = buildUrl(cfi, annotationDocId)
  const link = url ? `${cleanText(text)} [◎](${url})` : cleanText(text)
  navigator.clipboard.writeText(link).catch(() => {})
}

// ===== 标注操作 =====
const addHighlight = async (color: HighlightColor = 'yellow', note = '', tags: string[] = []) => {
  const { menuText: text, menuCfi: cfi } = ui
  if (!text || !cfi || !props.blockId || !props.url) return
  if (!annotationDocId) {
    const cfg = { mode: props.settings?.annotationMode || 'notebook', notebookId: props.settings?.notebookId, parentDoc: props.settings?.parentDoc } as any
    if (cfg.mode === 'notebook' && !cfg.notebookId) return showMessage(i18n?.selectNotebook || '请先在设置中选择笔记本')
    if (cfg.mode === 'document' && !cfg.parentDoc?.id) return showMessage(i18n?.selectDocument || '请先在设置中选择文档')
    const metadata = book ? await book.loaded.metadata.catch(() => ({ title: '' })) : { title: '' }
    annotationDocId = await getOrCreateDoc(props.blockId, metadata?.title || props.file.name.replace('.epub', ''), cfg) || ''
    if (!annotationDocId) return
  }
  const textWithChapter = `${cleanText(text)}${getCurrentChapter()}`
  addSingleHighlight(rendition, cfi, color, HL_STYLES), await saveHighlight(annotationDocId, textWithChapter, buildUrl(cfi, annotationDocId), cfi, color, note, tags)
  tocPanel?.addMark(cfi, color, textWithChapter, annotationDocId)
  showMessage(i18n?.annotationSaved || '标注已保存')
}
const addHighlightWithNote = async () => {
  const note = prompt(i18n?.inputNote || '输入笔记（可选）：')
  if (note === null) return
  const tags = prompt(i18n?.inputTags || '输入标签（空格分隔，可选）：')?.split(' ').filter(Boolean) || []
  await addHighlight('yellow', note, tags)
}

// ===== 目录面板 =====
const showTocDialog = () => tocPanel?.toggle()

// ===== 事件处理 =====
const handleClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('.epub-toolbar, .epub-selection-menu')) return
  closeMenu()
}

const handleKey = (e: KeyboardEvent) => {
  if (!containerRef.value?.contains(document.activeElement)) return
  const actions = { ArrowLeft: () => rendition?.prev(), ArrowRight: () => rendition?.next(), Escape: closeMenu }
  actions[e.key as keyof typeof actions]?.() && e.preventDefault()
}

// ===== 生命周期 =====
onMounted(() => (containerRef.value?.focus(), window.addEventListener('keydown', handleKey), openBook()))

onUnmounted(async () => {
  if (props.blockId && rendition) {
    const loc = (rendition as any).currentLocation()
    loc && await API.setBlockAttrs(props.blockId, { 'custom-epub-cfi': loc.start.cfi, 'custom-epub-progress': ((loc.start.percentage || 0) * 100).toFixed(3), 'custom-epub-last-read': new Date().toISOString() }).catch(() => {})
  }
  Object.values(timers).forEach(clearTimeout)
  window.removeEventListener('keydown', handleKey)
  rendition && clearCache.highlight(rendition)
  rendition?.destroy()
  book?.destroy()
  rendition = book = null
})
</script>
