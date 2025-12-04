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
    
    <div v-show="ui.menuShow" class="epub-selection-menu" :style="{ left: ui.menuX + 'px', top: ui.menuY + 'px' }" @mousedown.stop>
      <div class="menu-btn-wrapper" @mouseenter="ui.colorShow = true" @mouseleave="handleColorHide">
        <div v-show="ui.colorShow" class="color-picker" @mousedown.stop>
          <button 
            v-for="c in COLORS" :key="c.color"
            class="color-btn" 
            :style="{ background: c.bg }" 
            :title="c.title"
            @click.stop="addMark(c.color), closeMenu()"
          ></button>
        </div>
        <button class="menu-btn b3-tooltips b3-tooltips__n" @click.stop="addMark('yellow'), closeMenu()" :aria-label="i18n?.highlight || '标注'"><svg><use xlink:href="#iconMark"></use></svg></button>
      </div>
      <button class="menu-btn b3-tooltips b3-tooltips__n" @click.stop="addMark('blue', true), closeMenu()" :aria-label="i18n?.addNote || '添加笔记'"><svg><use xlink:href="#iconEdit"></use></svg></button>
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
import { reactive, ref, onMounted, onUnmounted } from 'vue'
import type { Book, Rendition } from 'epubjs'
import ePub from 'epubjs'
import { showMessage } from 'siyuan'
import type { Plugin } from 'siyuan'
import type { ReaderSettings } from '@/composables/useSetting'
import * as API from '@/api'
import { openDict } from '@/core/dictionary'
import { getOrCreateDoc, addHighlight as saveHighlight, restoreHighlights, clearCache, addSingleHighlight, verifyDoc, addInlineMemo, COLORS as EPUB_COLORS, COLOR_CODE, COLOR_RGB, COLOR_MAP, RGB_MAP, updateMark, parseNoteContent, queryAndFind, createNoteInput, createColorPicker } from '@/core/epubDoc'
import { HL_STYLES, MARK_STYLES } from '@/core/epub'
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
    pageAnimation: 'slide',
    columnMode: 'single',
  })
})

// ===== 状态 =====
const emit = defineEmits<{ toc: [], settings: [] }>()
const [containerRef, readerWrapRef] = [ref<HTMLElement>(), ref<HTMLElement>()]
const ui = reactive({ loading: true, error: '', loadingNext: false, menuShow: false, menuX: 0, menuY: 0, menuText: '', menuCfi: '', colorShow: false })
const timers = { progress: 0, menu: 0, colorHide: 0 }
const i18n = props.plugin.i18n as any
const COLORS = Object.entries(EPUB_COLORS).map(([color, bg]) => ({ color, bg, title: i18n?.[`color${color[0].toUpperCase()}${color.slice(1)}`] || color })) as { color: HighlightColor; bg: string; title: string }[]
const currentSettings = ref(props.settings)
let [rendition, book, tocPanel]: [Rendition | null, Book | null, EpubToc | null] = [null, null, null]
let [annotationDocId, progress, currentHref] = ['', 0, '']

const closeMenu = () => (ui.menuShow = ui.colorShow = false)
const handleColorHide = () => (clearTimeout(timers.colorHide), timers.colorHide = window.setTimeout(() => ui.colorShow = false, 300))
const clean = (t: string) => t.replace(/[\r\n]+/g, ' ').trim()
const url = (cfi: string, docId = annotationDocId) => props.url && cfi ? `${props.url.split('#')[0]}#${cfi}${docId ? '#' + docId : ''}` : ''
const chapter = () => {
  if (!currentHref || !book?.navigation?.toc) return ''
  const find = (items: any[], h = currentHref.split('#')[0]): string => items.reduce((r, i) => r || (i.href.split('#')[0] === h ? i.label : find(i.subitems || [], h)), '')
  return find(book.navigation.toc) ? `（${clean(find(book.navigation.toc))}）` : ''
}
const copySelection = () => ui.menuText && navigator.clipboard.writeText(url(ui.menuCfi) ? `${clean(ui.menuText)} [◎](${url(ui.menuCfi)})` : clean(ui.menuText)).catch(() => {})

// ===== 设置响应式更新 =====
const updateSettings = async (settings: typeof props.settings) => {
  if (!settings || !containerRef.value) return
  currentSettings.value = settings
  const { applyTheme, applyPageStyles } = await import('../composables/useSetting')
  containerRef.value.querySelectorAll('iframe').forEach(iframe => iframe.contentDocument?.body && (applyTheme(iframe.contentDocument.body, settings), applyPageStyles(iframe, settings)))
  rendition && settings.columnMode && (rendition.spread(settings.columnMode === 'double' ? 'auto' : 'none'), rendition.resize())
  tocPanel && settings.tocPosition && tocPanel.setPosition(settings.tocPosition)
}

// ===== 目录钉住处理 =====
const handleTocPin = (e: CustomEvent) => {
  const { pinned, position } = e.detail
  if (!containerRef.value) return
  const [margin, opposite] = position === 'left' ? ['marginLeft', 'marginRight'] : ['marginRight', 'marginLeft']
  Object.assign(containerRef.value.style, { width: pinned ? 'calc(100% - 360px)' : '100%', [margin]: pinned ? '360px' : '0', [opposite]: '0' })
  rendition?.resize()
}

// ===== 滚动加载 =====
const handleScroll = () => {
  if (ui.loadingNext || !rendition) return
  const doc = containerRef.value?.querySelector('iframe')?.contentDocument
  if (!doc) return
  const { scrollHeight, scrollTop, clientHeight } = doc.documentElement
  scrollHeight - (scrollTop || doc.body.scrollTop) - clientHeight < SCROLL_THRESHOLD && (ui.loadingNext = true, rendition.next().finally(() => setTimeout(() => ui.loadingNext = false, 300)))
}

// ===== 书籍加载 =====
const openBook = async () => {
  if (!props.file || !containerRef.value) return
  rendition?.destroy(), book?.destroy()
  ui.loading = true, ui.error = ''
  try {
    book = ePub(await props.file.arrayBuffer())
    await book.ready
    const settings = currentSettings.value
    const isScroll = settings?.pageAnimation === 'scroll' || settings?.pageSettings?.continuousScroll
    const config: any = { width: '100%', height: '100%', allowScriptedContent: true, ...(isScroll ? { manager: 'continuous', flow: 'scrolled', snap: false } : { flow: 'paginated', spread: settings?.columnMode === 'double' ? 'auto' : 'none' }) }
    
    rendition = book.renderTo(containerRef.value, config)
    props.onRenditionReady?.(rendition)
    
    // 恢复阅读状态
    let isInit = true, cfi = props.cfi
    const urlDocId = props.url?.split('#')[2]
    if (urlDocId && await verifyDoc(urlDocId)) annotationDocId = urlDocId
    else if (props.blockId && await verifyDoc(props.blockId)) annotationDocId = props.blockId
    else if (props.blockId) {
      const attrs = await API.getBlockAttrs(props.blockId)
      const id = attrs['memo'] || attrs['custom-epub-doc-id']
      id && await verifyDoc(id) ? annotationDocId = id : id && await API.setBlockAttrs(props.blockId, { 'memo': '' }).catch(() => {})
      cfi ||= attrs['custom-epub-cfi']
    }
    await rendition.display(cfi)
    annotationDocId && setTimeout(() => restoreHighlights(annotationDocId, rendition, HL_STYLES, MARK_STYLES), TIMERS.HIGHLIGHT_DELAY)
    
    // 加载目录
    book.loaded.navigation.then(async (nav: any) => {
      tocPanel = new EpubToc(readerWrapRef.value!, currentSettings.value?.tocPosition || 'left', rendition, annotationDocId, props.url?.split('#')[0] || '')
      await tocPanel.load(nav)
    }).catch(() => {})
    book.locations.generate(1024).catch(() => {})
    setTimeout(() => isInit = false, TIMERS.INIT_DELAY)
    
    // 监听翻页
    rendition.on('relocated', (loc: any) => {
      if (closeMenu(), !loc?.start) return
      currentHref = loc.start.href || '', annotationDocId && restoreHighlights(annotationDocId, rendition, HL_STYLES, MARK_STYLES)
      if (!props.blockId || isInit || !loc.start.cfi) return
      const prog = (loc.start.percentage || (loc.start.index + 1) / (book?.spine.length || 1)) * 100
      Math.abs(prog - progress) >= 0.1 && (clearTimeout(timers.progress), timers.progress = window.setTimeout(() => API.setBlockAttrs(props.blockId!, { 'custom-epub-cfi': loc.start.cfi, 'custom-epub-progress': prog.toFixed(3), 'custom-epub-last-read': new Date().toISOString() }).then(() => progress = prog).catch(() => {}), TIMERS.PROGRESS_SAVE))
    })
    
    // 文本选择和内容注册
    const handleSel = (iframe: HTMLIFrameElement) => (clearTimeout(timers.menu), timers.menu = window.setTimeout(() => {
      try {
        const sel = iframe.contentWindow?.getSelection(), text = sel?.toString().trim()
        if (!text || !sel?.rangeCount || sel.isCollapsed) return closeMenu()
        const rect = sel.getRangeAt(0).getBoundingClientRect(), iRect = iframe.getBoundingClientRect()
        ui.menuText = text, ui.menuX = iRect.left + rect.left + rect.width / 2 - 70, ui.menuY = iRect.top + rect.top - 50, ui.menuShow = true
      } catch { closeMenu() }
    }, TIMERS.MENU_DEBOUNCE))
    
    const showColorPicker = (x: number, y: number, w: number, currentColor: HighlightColor, onSelect: (color: HighlightColor) => void) => 
      createColorPicker(x + w/2, y, currentColor, EPUB_COLORS, onSelect as (c: string) => void)
    
    // 检查点击的标注
    const findClickedAnnotation = (doc: Document, e: MouseEvent) => {
      try {
        const clickRange = doc.caretRangeFromPoint?.(e.clientX, e.clientY)
        if (!clickRange || !rendition?.annotations) return null
        const allAnnotations = [...Object.entries(rendition.annotations._annotations), ...Object.entries(rendition.annotations._underlines || {})]
        for (const [, anno] of allAnnotations) {
          try {
            const annoRange = rendition.getRange((anno as any).cfiRange)
            if (annoRange && clickRange.compareBoundaryPoints(Range.START_TO_START, annoRange) >= 0 && clickRange.compareBoundaryPoints(Range.END_TO_END, annoRange) <= 0) {
              return { ...anno, isUnderline: !!rendition.annotations._underlines?.[(anno as any).cfiRange] } as any
            }
          } catch {}
        }
      } catch {}
      return null
    }
    
    // 点击编辑标注/笔记
    const regEvents = (doc: Document, iframe: HTMLIFrameElement) => {
      ['selectionchange', 'mouseup'].forEach(e => doc.addEventListener(e, () => handleSel(iframe)))
      
      doc.onclick = async (e) => {
        if (!annotationDocId) return
        const target = e.target as HTMLElement
        const r = target.getBoundingClientRect(), ir = iframe.getBoundingClientRect()
        const [x, y, w] = [ir.left + r.left, ir.top + r.bottom, r.width]
        
        // 检测点击的标注类型
        const anno = findClickedAnnotation(doc, e)
        if (anno) {
          e.stopPropagation()
          const cfi = anno.cfiRange
          const isNote = anno.isUnderline || ['underline', 'note'].includes(anno.type) || (anno.styles && ['stroke', 'border', 'borderColor'].some(k => anno.styles[k]?.includes('#2196f3') || anno.styles[k]?.includes('blue')))
          if (isNote) {
            const match = await queryAndFind(annotationDocId, '- N %', cfi)
            return createNoteInput(x, y, parseNoteContent(match?.markdown), i18n?.editNote || '编辑笔记...', async (note) => 
              await updateMark(annotationDocId, cfi, 'note', note) && (tocPanel?.addNote(cfi, note, target.textContent || '', annotationDocId), showMessage(i18n?.noteSaved || '笔记已保存')))
          } else {
            const match = await queryAndFind(annotationDocId, '- [ROYGPBV] %', cfi)
            const bg = anno.styles?.background || 'rgba(255, 235, 59, 0.4)'
            const currentColor = match ? COLOR_MAP[match.markdown.match(/^-\s*([ROYGPBV])\s/)?.[1] as keyof typeof COLOR_MAP] || 'yellow' 
              : RGB_MAP.find(([rgb]) => bg.includes(rgb.replace(/,/g, ', ')) || bg.includes(rgb))?.[1] || Object.entries(COLOR_RGB).find(([rgb]) => bg.includes(rgb))?.[1] || 'yellow'
            
            return showColorPicker(x, y, w, currentColor, async (newColor) => {
              if (!await updateMark(annotationDocId, cfi, 'color', COLOR_CODE[newColor])) return
              const { clearRenderedCache, addSingleHighlight } = await import('@/core/epubDoc')
              rendition?.annotations._annotations[cfi] && rendition.annotations.remove(cfi, 'highlight')
              rendition?.annotations._underlines?.[cfi] && rendition.annotations.remove(cfi, 'underline')
              clearRenderedCache(rendition, cfi)
              addSingleHighlight(rendition, cfi, newColor, undefined, HL_STYLES, MARK_STYLES)
              tocPanel?.addMark(cfi, newColor, target.textContent || '', annotationDocId)
              showMessage(i18n?.markUpdated || '标注已更新')
            })
          }
        }
      }
    }
    
    // 事件注册
    rendition.hooks.content.register(async (contents: any) => {
      const iframe = contents.document.defaultView.frameElement as HTMLIFrameElement
      iframe.hasAttribute('sandbox') && iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts')
      isScroll && iframe.contentWindow?.addEventListener('scroll', handleScroll, { passive: true })
      regEvents(contents.document, iframe)
      const body = iframe.contentDocument?.body
      if (currentSettings.value && body) {
        const { applyTheme, applyPageStyles } = await import('../composables/useSetting')
        applyTheme(body, currentSettings.value), applyPageStyles(iframe, currentSettings.value)
      }
    })
    rendition.on('rendered', () => containerRef.value?.querySelector('iframe')?.contentDocument && regEvents(containerRef.value.querySelector('iframe')!.contentDocument!, containerRef.value.querySelector('iframe')!))
    rendition.on('selected', (cfiRange: string) => ui.menuCfi = cfiRange)
    const onSettings = (e: CustomEvent) => e.detail && updateSettings(e.detail)
    window.addEventListener('sireaderSettingsUpdated', onSettings as EventListener)
    onUnmounted(() => window.removeEventListener('sireaderSettingsUpdated', onSettings as EventListener))
  } catch (e) {
    ui.error = e instanceof Error ? e.message : i18n?.loadFailed || '加载失败'
    console.error('[SiReader]', e)
  } finally {
    ui.loading = false
  }
}


// ===== 标注操作 =====
const ensureAnnotationDoc = async () => {
  if (annotationDocId) return true
  const cfg = { mode: props.settings?.annotationMode || 'notebook', notebookId: props.settings?.notebookId, parentDoc: props.settings?.parentDoc } as any
  if (cfg.mode === 'notebook' && !cfg.notebookId) return showMessage(i18n?.selectNotebook || '请先在设置中选择笔记本'), false
  if (cfg.mode === 'document' && !cfg.parentDoc?.id) return showMessage(i18n?.selectDocument || '请先在设置中选择文档'), false
  const metadata = book ? await book.loaded.metadata.catch(() => ({ title: '' })) : { title: '' }
  annotationDocId = await getOrCreateDoc(props.blockId, metadata?.title || props.file.name.replace('.epub', ''), cfg) || ''
  return !!annotationDocId
}

const addMark = async (color: HighlightColor, isNote = false) => {
  const { menuText, menuCfi } = ui
  if (!menuText || !menuCfi || !props.blockId || !props.url || !await ensureAnnotationDoc()) return
  const text = clean(menuText), link = url(menuCfi)
  if (isNote) {
    createNoteInput(ui.menuX, ui.menuY + 20, '', i18n?.inputNote || '输入备注...', (note) => {
      addSingleHighlight(rendition, menuCfi, 'blue', 'border', HL_STYLES, MARK_STYLES)
      addInlineMemo(annotationDocId, text, note, link)
      tocPanel?.addNote(menuCfi, note, text, annotationDocId)
      showMessage(i18n?.inlineMemoSaved || '备注已保存')
    })
  } else {
    addSingleHighlight(rendition, menuCfi, color, undefined, HL_STYLES, MARK_STYLES)
    await saveHighlight(annotationDocId, text + chapter(), link, menuCfi, color)
    tocPanel?.addMark(menuCfi, color, text + chapter(), annotationDocId)
    showMessage(i18n?.annotationSaved || '标注已保存')
  }
}

const showTocDialog = () => tocPanel?.toggle()
const handleClick = (e: MouseEvent) => (e.target as HTMLElement).closest('.epub-toolbar, .epub-selection-menu') || closeMenu()
const handleKey = (e: KeyboardEvent) => {
  if (!containerRef.value?.contains(document.activeElement)) return
  const actions = { ArrowLeft: () => rendition?.prev(), ArrowRight: () => rendition?.next(), Escape: closeMenu }
  actions[e.key as keyof typeof actions]?.() && e.preventDefault()
}

onMounted(() => {
  window.addEventListener('epubTocPinned', handleTocPin as EventListener)
  window.addEventListener('keydown', handleKey)
  containerRef.value?.focus()
  openBook()
})
onUnmounted(async () => {
  // 保存阅读位置
  if (props.blockId && rendition) {
    const loc = (rendition as any).currentLocation()
    if (loc) {
      await API.setBlockAttrs(props.blockId, {
        'custom-epub-cfi': loc.start.cfi,
        'custom-epub-progress': ((loc.start.percentage || 0) * 100).toFixed(3),
        'custom-epub-last-read': new Date().toISOString()
      }).catch(() => {})
    }
  }
  // 清理资源
  Object.values(timers).forEach(clearTimeout)
  window.removeEventListener('epubTocPinned', handleTocPin as EventListener)
  window.removeEventListener('keydown', handleKey)
  rendition && clearCache.highlight(rendition)
  rendition?.destroy(), book?.destroy()
  rendition = book = null
})
</script>
