<template>
  <div class="epub-reader" @click="handleClick">
    <div ref="readerWrapRef" class="epub-reader-wrap">
      <div ref="containerRef" class="epub-container" tabindex="0"></div>
    </div>
    
    <div v-if="ui.loading" class="epub-loading">
      <div class="loading-spinner"></div>
      <div>{{ ui.error || '加载中...' }}</div>
    </div>
    
    <div v-if="ui.loadingNext" class="epub-loading-next">
      <div class="loading-spinner-small"></div>
      <span>加载下一章...</span>
    </div>
    
    <div class="epub-toolbar">
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="showTocDialog" aria-label="目录">
          <svg><use xlink:href="#iconList"></use></svg>
        </button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="rendition?.prev()" aria-label="上一页">
          <svg><use xlink:href="#iconLeft"></use></svg>
        </button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="rendition?.next()" aria-label="下一页">
          <svg><use xlink:href="#iconRight"></use></svg>
        </button>
        <button class="toolbar-btn b3-tooltips b3-tooltips__n" @click.stop="emit('settings')" aria-label="设置">
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
        <button class="menu-btn b3-tooltips b3-tooltips__n" @mouseenter="ui.colorShow = true" @click.stop="addHighlight('yellow'), closeMenu()" aria-label="标注"><svg><use xlink:href="#iconMark"></use></svg></button>
      </div>
      <button class="menu-btn b3-tooltips b3-tooltips__n" @click.stop="addHighlightWithNote(), closeMenu()" aria-label="添加笔记"><svg><use xlink:href="#iconEdit"></use></svg></button>
      <button class="menu-btn b3-tooltips b3-tooltips__n" @click.stop="copySelection(), closeMenu()" aria-label="复制"><svg><use xlink:href="#iconCopy"></use></svg></button>
      <button class="menu-btn b3-tooltips b3-tooltips__n" @click.stop="openDict(ui.menuText, ui.menuX, ui.menuY + 50), closeMenu()" aria-label="词典"><svg><use xlink:href="#iconLanguage"></use></svg></button>
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
import { getOrCreateDoc, addHighlight as saveHighlight, restoreHighlights, clearCache, addSingleHighlight } from '@/core/epubDoc'
import { HL_STYLES } from '@/core/epub'
import { useEpubToc, createTocDialog, mapTocItem } from '@/composables/useEpubToc'
import EpubToc from './EpubToc.vue'

// ===== 类型定义 =====
export type HighlightColor = 'red' | 'orange' | 'yellow' | 'green' | 'pink' | 'blue' | 'purple'

// ===== 常量配置 =====
const COLORS: { color: HighlightColor; bg: string; title: string }[] = [
  { color: 'red', bg: '#f44336', title: '红色' },
  { color: 'orange', bg: '#ff9800', title: '橙色' },
  { color: 'yellow', bg: '#ffeb3b', title: '黄色' },
  { color: 'green', bg: '#4caf50', title: '绿色' },
  { color: 'pink', bg: '#e91e63', title: '粉色' },
  { color: 'blue', bg: '#2196f3', title: '蓝色' },
  { color: 'purple', bg: '#9c27b0', title: '紫色' },
]

const TIMERS = { HIGHLIGHT_DELAY: 300, PROGRESS_SAVE: 2000, MENU_DEBOUNCE: 100, INIT_DELAY: 1000 }
const SCROLL_THRESHOLD = 800

interface Props {
  file: File
  plugin: Plugin
  settings?: ReaderSettings
  url?: string
  blockId?: string
  cfi?: string
  onRenditionReady?: (rendition: any) => void  // ✅ 暴露 rendition
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

const emit = defineEmits<{
  toc: []
  settings: []
}>()

const containerRef = ref<HTMLElement>()
const readerWrapRef = ref<HTMLElement>()
// ===== 响应式状态 =====
const ui = reactive({ 
  loading: true, error: '', loadingNext: false, 
  menuShow: false, menuX: 0, menuY: 0, menuText: '', menuCfi: '', colorShow: false
})

// 使用目录 composable
const toc = useEpubToc(props.blockId)

// ===== 内部状态 =====
let book: Book | null = null
let rendition: Rendition | null = null
let timers = { progress: 0, menu: 0 }
let tocDialog: ReturnType<typeof createTocDialog> | null = null
let progress = -1
let lastSavedProgress = 0
let annotationDocId = ''

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
    const { pageAnimation, columnMode } = props.settings || {}
    const isScroll = pageAnimation === 'scroll'
    
    const config: any = {
      width: '100%',
      height: '100%',
      allowScriptedContent: true,
      ...(isScroll 
        ? { manager: 'continuous', flow: 'scrolled', snap: false }
        : { flow: 'paginated', spread: columnMode === 'double' ? 'auto' : 'none' }
      )
    }
    
    rendition = book.renderTo(containerRef.value, config)
    
    // ===== 主题应用统一函数（极简复用）=====
    const applyThemeToIframes = async (settings?: typeof props.settings) => {
      if (!settings) return
      const { applyTheme } = await import('../composables/useSetting')
      containerRef.value?.querySelectorAll('iframe').forEach(iframe => 
        iframe.contentDocument?.body && applyTheme(iframe.contentDocument.body, settings)
      )
    }
    
    // 加载目录
    book.loaded.navigation.then((nav: any) => toc.loadToc(nav)).catch(() => {})
    
    props.onRenditionReady?.(rendition)
    
    // 恢复阅读状态
    let isInitializing = true
    if (props.blockId) {
      const attrs = await API.getBlockAttrs(props.blockId)
      lastSavedProgress = parseFloat(attrs['custom-epub-progress'] || '0')
      annotationDocId = attrs['custom-epub-doc-id'] || ''
      await toc.loadBookmarks()
      await rendition.display(props.cfi || attrs['custom-epub-cfi'] || undefined)
      annotationDocId && setTimeout(() => restoreHighlights(annotationDocId, rendition, HL_STYLES), TIMERS.HIGHLIGHT_DELAY)
    } else {
      await rendition.display(props.cfi || undefined)
    }
    
    // 初始化后处理
    await applyThemeToIframes(props.settings)
    book.locations.generate(1024).catch(() => {})
    setTimeout(() => isInitializing = false, TIMERS.INIT_DELAY)
    
    // 监听翻页：恢复标注 + 保存进度
    rendition.on('relocated', (loc: any) => {
      closeMenu()
      if (!loc?.start) return
      toc.updateProgress(loc.start.href || '', loc.start.percentage || 0)
      tocDialog?.update() // 仅更新已打开的目录
      annotationDocId && restoreHighlights(annotationDocId, rendition, HL_STYLES)
      if (!props.blockId || isInitializing || !loc.start.cfi) return
      const prog = (loc.start.percentage || (loc.start.index + 1) / (book?.spine.length || 1)) * 100
      if (Math.abs(prog - progress) < 0.1) return
      clearTimeout(timers.progress)
      timers.progress = window.setTimeout(() => 
        API.setBlockAttrs(props.blockId!, { 
          'custom-epub-cfi': loc.start.cfi, 
          'custom-epub-progress': prog.toFixed(3), 
          'custom-epub-last-read': new Date().toISOString() 
        }).then(() => progress = prog).catch(() => {}), 
        TIMERS.PROGRESS_SAVE
      )
    })
    
    // 文本选择处理
    const handleSelection = (iframe: HTMLIFrameElement) => {
      clearTimeout(timers.menu)
      timers.menu = window.setTimeout(() => {
        try {
          const sel = iframe.contentWindow?.getSelection()
          const text = sel?.toString().trim()
          if (!text || !sel?.rangeCount || sel.isCollapsed) return closeMenu()
          const rect = sel.getRangeAt(0).getBoundingClientRect()
          const iRect = iframe.getBoundingClientRect()
          ui.menuText = text
          ui.menuX = iRect.left + rect.left + rect.width / 2 - 70
          ui.menuY = iRect.top + rect.top - 50
          ui.menuShow = true
        } catch { closeMenu() }
      }, TIMERS.MENU_DEBOUNCE)
    }
    
    // 注册选择事件
    const registerEvents = (doc: Document, iframe: HTMLIFrameElement) => {
      const handler = () => handleSelection(iframe)
      doc.addEventListener('selectionchange', handler)
      doc.addEventListener('mouseup', handler)
    }
    
    // 内容加载和每次渲染时注册
    rendition.hooks.content.register((contents: any) => {
      const iframe = contents.document.defaultView.frameElement as HTMLIFrameElement
      iframe.hasAttribute('sandbox') && iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts')
      isScroll && iframe.contentWindow?.addEventListener('scroll', handleScroll, { passive: true })
      registerEvents(contents.document, iframe)
      
      // 应用阅读主题（翻页时复用）
      applyThemeToIframes(props.settings)
    })
    
    rendition.on('rendered', () => {
      const iframe = containerRef.value?.querySelector('iframe')
      iframe?.contentDocument && registerEvents(iframe.contentDocument, iframe)
    })
    
    // 监听选择事件获取CFI
    rendition.on('selected', (cfiRange: string) => ui.menuCfi = cfiRange)
    
    // 监听配置更新，动态应用（复用统一函数）
    const handleSettingsUpdate = ((e: CustomEvent) => e.detail && applyThemeToIframes(e.detail)) as EventListener
    window.addEventListener('mreaderSettingsUpdated', handleSettingsUpdate)
    onUnmounted(() => window.removeEventListener('mreaderSettingsUpdated', handleSettingsUpdate))
  } catch (e) {
    ui.error = e instanceof Error ? e.message : '加载失败'
    console.error('[MReader]', e)
  } finally {
    ui.loading = false
  }
}

// ===== 目录操作 =====
const handleTocNavigate = (href: string) => toc.navigate(rendition, href)

// ===== 文本操作 =====
const copySelection = () => {
  const { menuText: text, menuCfi: cfi } = ui
  if (!text) return
  const link = props.url ? `[${text}](${props.url}${cfi ? '#' + cfi : ''})` : text
  navigator.clipboard.writeText(link).catch(() => {})
}

// ===== 标注操作 =====
const addHighlight = async (color: HighlightColor = 'yellow', note = '', tags: string[] = []) => {
  const { menuText: text, menuCfi: cfi } = ui
  if (!text || !cfi || !props.blockId || !props.url) return
  
  // 确保从自定义属性获取最新文档ID
  if (!annotationDocId) {
    const attrs = await API.getBlockAttrs(props.blockId)
    annotationDocId = attrs['custom-epub-doc-id'] || ''
  }
  
  const config = {
    mode: props.settings?.annotationMode || 'notebook',
    notebookId: props.settings?.notebookId,
    parentDoc: props.settings?.parentDoc
  } as any
  
  if (config.mode === 'notebook' && !config.notebookId) return showMessage('请先在设置中选择笔记本')
  if (config.mode === 'document' && !config.parentDoc?.id) return showMessage('请先在设置中选择文档')
  
  if (!annotationDocId) {
    const title = book?.packaging?.metadata?.title || props.file.name.replace('.epub', '')
    annotationDocId = await getOrCreateDoc(props.blockId, title, config) || ''
  }
  if (!annotationDocId) return
  
  addSingleHighlight(rendition, cfi, color, HL_STYLES)
  await saveHighlight(annotationDocId, text, props.url, cfi, color, note, tags)
  showMessage('标注已保存')
}

const addHighlightWithNote = async () => {
  const note = prompt('输入笔记（可选）：')
  if (note === null) return
  const tags = prompt('输入标签（空格分隔，可选）：')?.split(' ').filter(Boolean) || []
  await addHighlight('yellow', note, tags)
}

// ===== 目录对话框 =====
const showTocDialog = () => {
  const mode = props.settings?.tocPosition || 'dialog'
  if (!tocDialog || (tocDialog as any)._mode !== mode) {
    tocDialog?.destroy()
    tocDialog = createTocDialog(EpubToc, () => ({
      toc: toc.state.value.data,
      currentHref: toc.state.value.currentHref,
      progress: toc.state.value.progress,
      bookmarks: toc.state.value.bookmarks,
      loading: toc.state.value.loading,
      onNavigate: handleTocNavigate,
      'onUpdate:bookmarks': toc.updateBookmarks
    }), containerRef.value?.parentElement?.querySelector('[aria-label="目录"]') as HTMLElement, mode, readerWrapRef.value)
    ;(tocDialog as any)._mode = mode
  }
  tocDialog.toggle()
}

// ===== 事件处理 =====
const handleClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('.epub-toolbar, .epub-selection-menu')) return
  closeMenu()
  if (props.settings?.pageTurnMode === 'toolbar') return
  const rect = containerRef.value?.getBoundingClientRect()
  const x = rect ? (e.clientX - rect.left) / rect.width : 0.5
  x < 0.33 ? rendition?.prev() : x > 0.67 && rendition?.next()
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
