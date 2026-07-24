<template>
  <div v-if="props.source && !pdfLoadError" ref="rootRef" class="embed-pdf-reader">
    <div ref="viewerHostRef" class="embed-pdf-reader__host"></div>
    <div v-if="pdfPreparing" class="embed-pdf-reader__loading embed-pdf-reader__loading--overlay">{{ pdfPreparing }}</div>
  </div>
  <div v-else class="embed-pdf-reader__loading">{{ pdfLoadError || props.i18n?.loading || 'Loading...' }}</div>
</template>

<script setup lang="ts">
import { computed, createApp, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Dialog, showMessage } from 'siyuan'
import { bookshelfManager } from '@/core/bookshelf'
import { readEmbedPdfAnnotations, readEmbedPdfProgress, writeEmbedPdfAnnotations, writeEmbedPdfProgress } from '@/core/bookStore'
import { alignLegacyPdfAnnotations, needsLegacyPdfTextAlign } from '@/core/dataMigration'
import { createTooltip, showTooltip } from '@/core/MarkManager'
import { copyMark } from '@/utils/copy'
import { buildEmbedPdfTheme, embedPdfThemePreference } from '@/utils/embedPdfTheme'
import { addMissingPdfMenuItemsAfterFirst, createEmbedPdfDocumentSource, ensureEmbedPdfStampManifests, ensureEmbedPdfWasmUrl, getPdfSelectionMark, initEmbedPdfViewer, pdfAnnotationNote, pdfAnnotationText, pdfAnnotationWithReplies, pdfMarkFromAnnotation, pdfSelectionFromAnnotation, sendPdfMarkToDoc, taskToPromise, writeBlobToClipboard } from '@/utils/embedPdfActions'
import { settingsManager, type ReaderSettings, type ReadTheme } from '@/composables/useSetting'
import { isMobile } from '@/utils/mobile'
import Translate from './Translate.vue'

type EmbedPdfContainer = any
type PluginRegistry = any
type PdfAssets = { wasmUrl: string; stampManifests: any[] }
const props = defineProps<{ source: File | string | null; settings?: ReaderSettings; theme?: string; customTheme?: ReadTheme; bookUrl?: string; storageKey?: string; hideAnnotations?: boolean; i18n?: any }>()
const storageKey = () => props.storageKey || props.bookUrl || ''
const emit = defineEmits<{ ready: [registry: PluginRegistry] }>()
const documentSource = shallowRef<any>(null)
const pdfAssets = shallowRef<PdfAssets | null>(null)
const pdfLoadError = ref('')
const pdfPreparing = ref('')
const rootRef = ref<HTMLElement | null>(null)
const viewerHostRef = ref<HTMLElement | null>(null)
const documentId = 'sireader-document'
const pdfLoadFailedMessage = () => props.i18n?.loadFailed || 'PDF load failed'
const pdfLoadingText = () => props.i18n?.loading || 'Loading...'
const failPdfLoad = (error: any) => {
  pdfPreparing.value = ''
  pdfLoadError.value = error?.message || pdfLoadFailedMessage()
}
const preparePdfAssets = async () => {
  if (pdfAssets.value) return pdfAssets.value
  const [wasmUrl, stampManifests] = await Promise.all([
    ensureEmbedPdfWasmUrl(),
    ensureEmbedPdfStampManifests().catch(() => []),
  ])
  return (pdfAssets.value = { wasmUrl, stampManifests })
}
let annotationSaveTimer: any = null
let progressSaveTimer: any = null
let pendingProgress: { pageNumber: number; totalPages: number } | null = null
let activeRegistry: PluginRegistry | null = null
let activeContainer: EmbedPdfContainer | null = null
let activeAnnotationScope: any = null
let activeScrollScope: any = null
let pdfTooltip: HTMLElement | null = null
let pdfTooltipAnnotations: any[] = []
let currentPdfTooltipId = ''
let pdfTooltipFrame = 0
let nativePdfAnnotationIds = new Set<string>()
let cleanupDocumentEvents: (() => void) | null = null
let cleanupAnnotationEvents: (() => void) | null = null
let cleanupScrollEvents: (() => void) | null = null
let cleanupZoomEvents: (() => void) | null = null
let cleanupCaptureEvents: (() => void) | null = null
let cleanupTooltipEvents: (() => void) | null = null
let cleanupMigrationEvents: (() => void) | null = null
let activeViewer: any = null
let viewerToken = 0
let copyNextCapture = false
let lastCaptureBlob: Blob | null = null
let zoomSaveTimer: any = null
const disposePdfViewer = () => {
  viewerToken++
  activeViewer?.remove?.()
  activeViewer = null
  viewerHostRef.value?.replaceChildren()
}

const PDF_PAGE_THEME_STYLE = `
  :host([data-sireader-page-mode="dark"]) div[style*="mix-blend-mode"][style*="background-color"]{mix-blend-mode:screen!important}
  :host([data-sireader-page-mode="dark"]) img[src^="blob:"]{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.92)}
  :host([data-sireader-hide-annotations]) :is([data-no-interaction],input[type="file"] ~ *){display:none!important}
  div[style*="background: rgb(0, 0, 0)"][style*="cursor: pointer"]:hover,
  div[style*="background: #000000"][style*="cursor: pointer"]:hover{opacity:.08!important}
`
const pdfIcon = (body: string) => `<svg viewBox="0 0 24 24" style="width:16px;height:16px" fill="none" stroke="currentColor" stroke-width="2">${body}</svg>`
const PDF_BOTTOM_ICONS = { toc: pdfIcon('<path d="M4 7h16M4 12h16M4 17h16"/>'), show: pdfIcon('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'), hide: pdfIcon('<path d="m2 2 20 20M10.6 10.6a2 2 0 0 0 2.8 2.8M7.4 7.4C3.8 9.2 2 12 2 12s3 7 10 7c1.6 0 3-.4 4.2-1M14.1 5.2C13.4 5.1 12.7 5 12 5 5 5 2 12 2 12c.8 1.8 2 3.3 3.5 4.4M17.7 17.7C20.5 15.9 22 12 22 12s-3-7-10-7"/>'), close: pdfIcon('<path d="M18 6 6 18M6 6l12 12"/>') }
const getCapability = <T = any>(registry: PluginRegistry, pluginId: string): T | null =>
  (registry.getPlugin(pluginId) as any)?.provides?.() || null
const pdfShadowRoot = () => rootRef.value?.querySelector('embedpdf-container')?.shadowRoot || null
const pdfTheme = () => buildEmbedPdfTheme(props.theme, rootRef.value || undefined, props.customTheme)
const pdfThemePreference = () => embedPdfThemePreference(props.theme, rootRef.value || undefined, props.customTheme)
const normalizePdfZoomLevel = (value: unknown) => value === 'automatic' || value === 'fit-page' || value === 'fit-width' || (typeof value === 'number' && Number.isFinite(value) && value > 0) ? value : undefined
const pdfZoomLevel = () => normalizePdfZoomLevel(props.settings?.pdfZoomLevel)
const pdfInitialZoomLevel = () => { const value = pdfZoomLevel(); return typeof value === 'number' ? undefined : value }
const readerSettings = () => ((window as any).__sireader_settings || props.settings) as ReaderSettings | undefined
const nextIdle = () => new Promise<void>(resolve => 'requestIdleCallback' in window ? requestIdleCallback(() => resolve(), { timeout: 800 }) : setTimeout(resolve))
const ensurePageThemeStyle = () => {
  const shadow = (activeContainer as any)?.shadowRoot as ShadowRoot | undefined
  if (!shadow || shadow.querySelector('style[data-sireader-page-theme]')) return
  const style = document.createElement('style')
  style.setAttribute('data-sireader-page-theme', '')
  style.textContent = PDF_PAGE_THEME_STYLE
  shadow.appendChild(style)
}
const syncPdfAnnotationsHidden = (hidden: boolean) => {
  ;(activeContainer as any)?.toggleAttribute?.('data-sireader-hide-annotations', hidden)
  if (hidden) hidePdfTooltip()
}
const applyPdfTheme = () => {
  activeContainer?.setTheme(pdfTheme())
  activeContainer?.setAttribute('data-sireader-page-mode', pdfThemePreference())
  syncPdfAnnotationsHidden(!!props.hideAnnotations)
  ensurePageThemeStyle()
}
const escapeHtml = (text = '') => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const ensurePdfTooltip = () => {
  if (pdfTooltip) return pdfTooltip
  pdfTooltip = document.createElement('div')
  pdfTooltip.setAttribute('data-pdf-note-tooltip', 'true')
  pdfTooltip.style.cssText = 'position:fixed;display:none;width:340px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12),0 4px 8px rgba(0,0,0,.08);z-index:99999;pointer-events:none;overflow:hidden;transition:transform .12s,opacity .12s'
  document.body.appendChild(pdfTooltip)
  return pdfTooltip
}
const hidePdfTooltip = () => {
  if (!pdfTooltip) return
  currentPdfTooltipId = ''
  pdfTooltip.style.opacity = '0'
  pdfTooltip.style.transform = 'translateY(-8px)'
  pdfTooltip.style.display = 'none'
}
const showPdfTooltip = (item: any, x: number, y: number) => {
  const tip = ensurePdfTooltip()
  const note = pdfAnnotationNote(item)
  if (currentPdfTooltipId !== item.annotation.id) {
    currentPdfTooltipId = item.annotation.id
    const text = pdfAnnotationText(item)
    const quote = text ? `<div style="padding:8px 14px;background:var(--b3-theme-background-light);border-bottom:1px solid var(--b3-border-color);font-size:12px;color:var(--b3-theme-on-surface-variant);font-style:italic;line-height:1.5">${escapeHtml(text)}</div>` : ''
    tip.innerHTML = createTooltip({ icon: '#iconEdit', iconColor: 'var(--b3-theme-primary)', title: props.i18n?.note || '笔记', content: `${quote}<div style="padding:14px;font-size:13px;line-height:1.7;max-height:300px;overflow-y:auto;word-break:break-word;white-space:pre-wrap">${escapeHtml(note)}</div>` })
  }
  showTooltip(tip, x + 12, y + 12)
}
const pdfShadowElementFromPoint = (x: number, y: number) =>
  pdfShadowRoot()?.elementFromPoint(x, y) as HTMLElement | null
const pdfPointerElement = (x: number, y: number) => {
  let el = pdfShadowElementFromPoint(x, y)
  for (; el; el = el.parentElement) if (getComputedStyle(el).cursor === 'pointer') return el
  return null
}
const pdfViewportElement = (x: number, y: number) => {
  let el = pdfShadowElementFromPoint(x, y)
  for (; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) return el
  }
  return null
}
const pdfAnnotationFromPoint = (x: number, y: number) => {
  const pointer = pdfPointerElement(x, y)
  const viewport = pointer && pdfViewportElement(x, y)
  if (!viewport || !activeScrollScope?.getRectPositionForPage) return null
  const box = viewport.getBoundingClientRect()
  const style = getComputedStyle(viewport)
  const offsetX = box.left + (Number.parseFloat(style.paddingLeft) || 0) - viewport.scrollLeft
  const offsetY = box.top + (Number.parseFloat(style.paddingTop) || 0) - viewport.scrollTop
  const target = pointer.getBoundingClientRect()
  let best: { item: any; overlap: number } | null = null
  for (const annotation of pdfTooltipAnnotations) {
    const item = pdfAnnotationWithReplies(annotation, pdfTooltipAnnotations)
    if (!pdfAnnotationNote(item)) continue
    for (const rect of (annotation.segmentRects?.length ? annotation.segmentRects : [annotation.rect]).filter(Boolean)) {
      const pos = activeScrollScope.getRectPositionForPage(annotation.pageIndex, rect)
      if (!pos) continue
      const left = offsetX + pos.origin.x
      const top = offsetY + pos.origin.y
      const overlap = Math.max(0, Math.min(left + pos.size.width, target.right) - Math.max(left, target.left))
        * Math.max(0, Math.min(top + pos.size.height, target.bottom) - Math.max(top, target.top))
      if (overlap && (!best || overlap > best.overlap)) best = { item, overlap }
    }
  }
  return best?.item || null
}
const refreshPdfTooltipAnnotations = () => {
  const all = activeAnnotationScope?.getAnnotations?.()?.map((item: any) => item.object).filter(Boolean) || []
  const replyParents = new Set(all.map((item: any) => item?.inReplyToId).filter(Boolean))
  pdfTooltipAnnotations = all.filter((item: any) => item?.contents || item?.custom?.note || item?.inReplyToId || replyParents.has(item?.id))
}
const selectedPdfAnnotation = () => activeAnnotationScope?.getSelectedAnnotation?.()?.object
const selectedPdfText = (annotation = selectedPdfAnnotation()) => annotation ? pdfSelectionFromAnnotation(annotation).text : ''
const capturePdfAnnotationImage = (registry: PluginRegistry, annotation: any) =>
  annotation?.rect && [4, 5, 6, 8, 15].includes(Number(annotation.type))
    ? taskToPromise<Blob>(getCapability<any>(registry, 'render')?.forDocument(documentId)?.renderPageRect?.({ pageIndex: annotation.pageIndex, rect: annotation.rect, options: { imageType: 'image/png', scaleFactor: 2, withAnnotations: true } })).catch(() => null)
    : null
const pdfMarkWithImage = async (registry: PluginRegistry, annotation: any) => ({ ...pdfMarkFromAnnotation(annotation, pdfTooltipAnnotations), image: await capturePdfAnnotationImage(registry, annotation) })
const quickDocs = () => ((props.settings ? props.settings.quickSendDocs : (window as any).__sireader_settings?.quickSendDocs) || []).filter((doc: any) => doc?.id).slice(0, 5)
const sendPdfMark = async (mark: any, docId: string, registry: PluginRegistry) => {
  await sendPdfMarkToDoc(mark, docId, {
    bookUrl: props.bookUrl || '',
    marks: { updateMark: updateSelectedPdfBlockId(registry) },
    showMsg: (msg: string, type?: string) => showMessage(msg, 1500, type as any),
    i18n: props.i18n,
  })
}
const createPdfHoleFromSelection = async (registry: PluginRegistry) => {
  const selection = getCapability<any>(registry, 'selection')?.forDocument(documentId)
  const formatted = selection?.getFormattedSelection?.() || []
  for (const item of formatted) {
    if (!item?.rect || !item.segmentRects?.length) continue
    activeAnnotationScope?.createAnnotation?.(item.pageIndex, {
      id: `hole-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 9,
      pageIndex: item.pageIndex,
      rect: item.rect,
      segmentRects: item.segmentRects,
      color: '#000000',
      strokeColor: '#000000',
      opacity: 1,
      blendMode: 0,
    })
  }
  selection?.clear?.()
  queueAnnotationSave(registry)
  refreshPdfTooltipAnnotations()
}
const updateSelectedPdfBlockId = (registry: PluginRegistry) => async (item: any, blockId: string) => {
  const annotation = item?.annotation || selectedPdfAnnotation()
  if (!annotation || !activeAnnotationScope?.updateAnnotation) return
  const custom = { ...(annotation.custom || {}), blockId }
  await activeAnnotationScope.updateAnnotation(annotation.pageIndex, annotation.id, { custom })
  queueAnnotationSave(registry)
}
const queueCaptureCopyButton = () => {
  const shadow = pdfShadowRoot()
  if (!shadow) return
  const add = () => {
    if (shadow.querySelector('[data-sireader-copy-capture]')) return true
    const buttons = Array.from(shadow.querySelectorAll('button')) as HTMLButtonElement[]
    const download = buttons.find(button => /download|下载/i.test(button.textContent || ''))
    const footer = download?.parentElement
    if (!download || !footer) return false
    const copy = download.cloneNode(true) as HTMLButtonElement
    copy.dataset.sireaderCopyCapture = 'true'
    copy.textContent = props.i18n?.copy || '复制'
    copy.onclick = event => {
      event.preventDefault()
      event.stopPropagation()
      lastCaptureBlob && void copyCaptureBlob(lastCaptureBlob).catch((error: any) => showMessage(error?.message || '复制失败', 2000, 'error'))
    }
    footer.insertBefore(copy, download)
    return true
  }
  if (add()) return
  const observer = new MutationObserver(() => add() && observer.disconnect())
  observer.observe(shadow, { childList: true, subtree: true })
  setTimeout(() => observer.disconnect(), 3000)
}
const setupPdfBottomButtons = (registry: PluginRegistry) => {
  const shadow = pdfShadowRoot()
  if (!shadow) return
  let toolbarHidden = false
  const labelToolbar = () => toolbarHidden ? '显示顶部工具栏' : '隐藏顶部工具栏'
  const paint = (button: HTMLButtonElement, label: string, icon: string) => {
    button.title = button.ariaLabel = label
    button.innerHTML = icon
  }
  const add = () => {
    const bar = shadow.querySelector('[data-overlay-id="page-controls"] .pointer-events-auto > div') as HTMLElement | null
    const base = bar?.querySelector('button:last-of-type') as HTMLButtonElement | null
    if (!bar || !base) return false
    const mk = (key: string, label: string, icon: string, click: (button: HTMLButtonElement) => void) => {
      if (shadow.querySelector(`[data-${key}]`)) return true
      const button = base.cloneNode(false) as HTMLButtonElement
      button.setAttribute(`data-${key}`, 'true')
      button.type = 'button'
      button.disabled = false
      button.classList.add('b3-tooltips', 'b3-tooltips__n')
      paint(button, label, icon)
      button.onclick = event => { event.preventDefault(); event.stopPropagation(); click(button) }
      bar.appendChild(button)
      return true
    }
    const toggleToolbar = (button: HTMLButtonElement) => {
      const ui = getCapability<any>(registry, 'ui')?.forDocument(documentId)
      toolbarHidden ? ui?.setActiveToolbar?.('top', 'main', 'main-toolbar') : ui?.closeToolbarSlot?.('top', 'main')
      toolbarHidden = !toolbarHidden
      paint(button, labelToolbar(), toolbarHidden ? PDF_BOTTOM_ICONS.show : PDF_BOTTOM_ICONS.hide)
    }
    return (
      mk('sireader-pdf-toc', props.i18n?.toc || '目录', PDF_BOTTOM_ICONS.toc, () => window.dispatchEvent(new Event('sireader:togglePdfToc'))) &&
      mk('sireader-pdf-toolbar', labelToolbar(), PDF_BOTTOM_ICONS.hide, toggleToolbar) &&
      (!isMobile() || mk('sireader-pdf-close', '关闭', PDF_BOTTOM_ICONS.close, () => window.dispatchEvent(new CustomEvent('reader:mobile-close'))))
    )
  }
  if (add()) return
  const observer = new MutationObserver(() => add() && observer.disconnect())
  observer.observe(shadow, { childList: true, subtree: true })
  setTimeout(() => observer.disconnect(), 3000)
}
const copyCaptureBlob = async (blob: Blob) => {
  await writeBlobToClipboard(blob)
  showMessage(props.i18n?.copied || '已复制', 1200)
}
const openPdfTranslate = (text: string) => {
  text = text.trim()
  if (!text) return showMessage(props.i18n?.noContent || '无内容', 1200)
  let app: any
  const dialog = new Dialog({
    title: props.i18n?.translate || '翻译',
    content: '<div class="b3-dialog__content sireader-pdf-translate" style="height:100%;overflow:auto;padding:16px"></div>',
    width: '520px',
    height: '520px',
    destroyCallback: () => app?.unmount(),
  })
  app = createApp(Translate, { text })
  app.mount(dialog.element.querySelector('.sireader-pdf-translate') as HTMLElement)
}
const setupPdfCommands = (registry: PluginRegistry) => {
  const commands = getCapability<any>(registry, 'commands')
  const ui = getCapability<any>(registry, 'ui')
  const uiDoc = ui?.forDocument(documentId)
  const selection = getCapability<any>(registry, 'selection')?.forDocument(documentId)
  const capture = getCapability<any>(registry, 'capture')?.forDocument(documentId)
  const docs = quickDocs()
  const selectedMark = () => getPdfSelectionMark(selection)
  const openSendMenu = (type: 'selection' | 'annotation') => {
    const commandId = `sireader:send-${type}-menu`
    uiDoc?.openMenu?.(`sireader-pdf-send-${type}`, commandId, commandId)
  }
  commands?.registerCommand?.({
    id: 'sireader:copy-annotation-link',
    label: '复制回链',
    icon: 'copy',
    categories: ['annotation', 'sireader-copy-link'],
    action: async () => {
      const selected = selectedPdfAnnotation()
      if (!selected) return
      const mark = await pdfMarkWithImage(registry, selected)
      await copyMark(mark, { bookUrl: props.bookUrl || '', isPdf: true, showMsg: (msg: string, type?: string) => showMessage(msg, 1500, type as any) })
    },
    visible: () => !!selectedPdfAnnotation(),
  })
  commands?.registerCommand?.({
    id: 'sireader:dict-annotation',
    label: props.i18n?.dict || '词典',
    icon: 'book',
    categories: ['annotation', 'sireader'],
    action: async () => {
      const selected = selectedPdfAnnotation()
      if (!selected) return
      const selection = pdfSelectionFromAnnotation(selected)
      if (selection.text) (await import('@/utils/dictionary')).openDict(selection.text, innerWidth / 2, innerHeight / 2, selection)
    },
    visible: () => !!selectedPdfAnnotation(),
    disabled: () => !selectedPdfText(),
  })
  commands?.registerCommand?.({
    id: 'sireader:translate-annotation',
    label: props.i18n?.translate || '翻译',
    icon: 'text',
    categories: ['annotation', 'sireader'],
    action: () => openPdfTranslate(selectedPdfText()),
    visible: () => !!selectedPdfAnnotation(),
    disabled: () => !selectedPdfText(),
  })
  commands?.registerCommand?.({
    id: 'sireader:send-selection-menu',
    label: props.i18n?.sendTo || 'Send to',
    icon: 'fileImport',
    categories: ['selection', 'sireader-send'],
    action: () => openSendMenu('selection'),
  })
  commands?.registerCommand?.({
    id: 'sireader:create-hole',
    label: '挖空',
    icon: 'square',
    action: () => void createPdfHoleFromSelection(registry),
  })
  ;[
    ['dict', props.i18n?.dict || '词典', 'book', async (mark: any) => (await import('@/utils/dictionary')).openDict(mark.text, innerWidth / 2, innerHeight / 2, mark)],
    ['translate', props.i18n?.translate || '翻译', 'text', (mark: any) => openPdfTranslate(mark.text)],
  ].forEach(([id, label, icon, run]: any) => commands?.registerCommand?.({ id: `sireader:${id}-selection`, label, icon, action: async () => { const mark = await selectedMark(); if (mark?.text) run(mark) } }))
  docs.forEach((doc: any, index: number) => commands?.registerCommand?.({
    id: `sireader:send-selection:${index}`,
    label: doc.name || props.i18n?.sendTo || 'Send to',
    icon: 'fileImport',
    categories: ['selection', 'sireader-send'],
    action: async () => {
      const mark = await selectedMark()
      if (mark) await sendPdfMark(mark, doc.id, registry)
      selection?.clear?.()
      uiDoc?.closeMenu?.('sireader-pdf-send-selection')
    },
  }))
  commands?.registerCommand?.({
    id: 'sireader:send-annotation-menu',
    label: props.i18n?.sendTo || 'Send to',
    icon: 'fileImport',
    categories: ['annotation', 'sireader-send'],
    action: () => openSendMenu('annotation'),
  })
  docs.forEach((doc: any, index: number) => commands?.registerCommand?.({
    id: `sireader:send-annotation:${index}`,
    label: doc.name || props.i18n?.sendTo || 'Send to',
    icon: 'fileImport',
    categories: ['annotation', 'sireader-send'],
    action: async () => {
      const selected = selectedPdfAnnotation()
      if (selected) {
        const mark = await pdfMarkWithImage(registry, selected)
        await sendPdfMark(mark, doc.id, registry)
      }
      uiDoc?.closeMenu?.('sireader-pdf-send-annotation')
    },
  }))
  commands?.registerCommand?.({
    id: 'sireader:capture-copy',
    label: props.i18n?.copy || '复制截图',
    icon: 'copy',
    categories: ['document', 'document-capture', 'sireader-capture-copy'],
    action: () => {
      copyNextCapture = true
      window.dispatchEvent(new Event('sireader:close-reader-panels'))
      capture?.toggleMarqueeCapture?.()
      showMessage(props.i18n?.capture || '拖选截图区域', 1500)
    },
  })
  const schema = ui?.getSchema?.()
  const annotationMenu = schema?.selectionMenus?.annotation
  const selectionMenu = schema?.selectionMenus?.selection
  const documentMenu = schema?.menus?.document
  if (!annotationMenu && !selectionMenu && !documentMenu) return
  if (annotationMenu) {
    const items = annotationMenu.items.filter((item: any) => !['sireader-send-annotation-list', 'sireader-send-annotation-divider', 'sireader-send-annotation-menu'].includes(item.id))
    annotationMenu.items = addMissingPdfMenuItemsAfterFirst(items, [
      { type: 'command-button', id: 'sireader-copy-annotation-link', commandId: 'sireader:copy-annotation-link', variant: 'icon', categories: ['annotation', 'sireader-copy-link'] },
      { type: 'command-button', id: 'sireader-dict-annotation', commandId: 'sireader:dict-annotation', variant: 'icon', categories: ['annotation', 'sireader'] },
      { type: 'command-button', id: 'sireader-translate-annotation', commandId: 'sireader:translate-annotation', variant: 'icon', categories: ['annotation', 'sireader'] },
      ...(docs.length ? [
        { type: 'divider', id: 'sireader-send-annotation-divider', categories: ['annotation', 'sireader-send'] },
        { type: 'command-button', id: 'sireader-send-annotation-menu', commandId: 'sireader:send-annotation-menu', variant: 'icon-text', categories: ['annotation', 'sireader-send'] },
      ] : []),
    ] as any)
  }
  if (selectionMenu) {
    const items = selectionMenu.items.filter((item: any) => !['sireader-create-mask', 'sireader-create-hole', 'sireader-dict-selection', 'sireader-translate-selection', 'sireader-send-selection-list', 'sireader-send-selection-divider', 'sireader-send-selection-menu'].includes(item.id))
    selectionMenu.items = addMissingPdfMenuItemsAfterFirst(items, [
      { type: 'command-button', id: 'sireader-create-hole', commandId: 'sireader:create-hole', variant: 'icon-text' },
      { type: 'command-button', id: 'sireader-dict-selection', commandId: 'sireader:dict-selection', variant: 'icon' },
      { type: 'command-button', id: 'sireader-translate-selection', commandId: 'sireader:translate-selection', variant: 'icon' },
      ...(docs.length ? [
        { type: 'divider', id: 'sireader-send-selection-divider', categories: ['selection', 'sireader-send'] },
        { type: 'command-button', id: 'sireader-send-selection-menu', commandId: 'sireader:send-selection-menu', variant: 'icon-text', categories: ['selection', 'sireader-send'] },
      ] : []),
    ] as any)
  }
  const sendMenu = (type: 'selection' | 'annotation') => ({
    id: `sireader-pdf-send-${type}`,
    items: docs.map((_doc: any, index: number) => ({ type: 'command', id: `sireader-send-${type}-${index}`, commandId: `sireader:send-${type}:${index}`, categories: [type, 'sireader-send'] })),
    categories: [type, 'sireader-send'],
  })
  const sendMenus = { 'sireader-pdf-send-annotation': sendMenu('annotation'), 'sireader-pdf-send-selection': sendMenu('selection') }
  ui.mergeSchema?.({
    selectionMenus: schema.selectionMenus,
    menus: documentMenu ? {
      ...schema.menus,
      ...sendMenus,
      document: documentMenu.items?.some((item: any) => item.id === 'sireader-capture-copy') ? documentMenu : {
        ...documentMenu,
        items: [...documentMenu.items, { type: 'command', id: 'sireader-capture-copy', commandId: 'sireader:capture-copy', categories: ['document', 'document-capture'] }],
      },
    } : { ...schema.menus, ...sendMenus },
  })
}
const setupPdfCapture = (registry: PluginRegistry) => {
  cleanupCaptureEvents?.()
  const capture = getCapability<any>(registry, 'capture')?.forDocument(documentId)
  const offArea = capture?.onCaptureArea?.(({ blob }: any) => {
    lastCaptureBlob = blob
    queueCaptureCopyButton()
    if (!copyNextCapture) return
    copyNextCapture = false
    void copyCaptureBlob(blob).catch((error: any) => showMessage(error?.message || '复制失败', 2000, 'error'))
  })
  const offState = capture?.onStateChange?.((state: any) => {
    if (state?.isMarqueeCaptureActive) window.dispatchEvent(new Event('sireader:close-reader-panels'))
  })
  cleanupCaptureEvents = () => { offArea?.(); offState?.() }
}
const setupPdfTooltip = () => {
  cleanupTooltipEvents?.()
  const root = rootRef.value
  if (!root) return
  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    if (!root.contains(event.target as Node | null)) return
    const { clientX: x, clientY: y } = event
    cancelAnimationFrame(pdfTooltipFrame)
    pdfTooltipFrame = requestAnimationFrame(() => {
      const item = pdfAnnotationFromPoint(x, y)
      item ? showPdfTooltip(item, x, y) : hidePdfTooltip()
    })
  }
  root.addEventListener('pointermove', onMove, true)
  root.addEventListener('mouseleave', hidePdfTooltip, true)
  document.addEventListener('pointerdown', hidePdfTooltip, true)
  refreshPdfTooltipAnnotations()
  cleanupTooltipEvents = () => {
    cancelAnimationFrame(pdfTooltipFrame)
    root.removeEventListener('pointermove', onMove, true)
    root.removeEventListener('mouseleave', hidePdfTooltip, true)
    document.removeEventListener('pointerdown', hidePdfTooltip, true)
  }
}

const setupPdfMigration = () => {
  cleanupMigrationEvents?.()
  const onMigration = (event: Event) => {
    const detail = (event as CustomEvent).detail || {}
    if (detail.url && detail.url !== storageKey()) return
    if (detail.phase !== 'progress' && detail.phase !== 'done') return
    showMessage(detail.phase === 'done' ? '标注迁移完成' : `正在迁移标注 ${detail.done || 0}/${detail.total || 0}`, 1200)
  }
  window.addEventListener('sireader:pdf-migration', onMigration as EventListener)
  cleanupMigrationEvents = () => window.removeEventListener('sireader:pdf-migration', onMigration as EventListener)
}

const savePdfZoomLevel = (level: unknown) => {
  const pdfZoomLevel = normalizePdfZoomLevel(level)
  const settings = readerSettings()
  if (!pdfZoomLevel || !settings || settings.pdfZoomLevel === pdfZoomLevel) return
  clearTimeout(zoomSaveTimer)
  zoomSaveTimer = setTimeout(() => {
    zoomSaveTimer = null
    void settingsManager.save({ ...settings, pdfZoomLevel })
  }, 400)
}

const saveAnnotations = async (registry: PluginRegistry) => {
  if (!storageKey()) return
  const annotation = getCapability<any>(registry, 'annotation')?.forDocument(documentId)
  if (!annotation?.exportAnnotations) return
  const items = await annotation.exportAnnotations().toPromise().catch(() => null)
  if (!items) return
  const managed = nativePdfAnnotationIds.size ? items.filter(item => !nativePdfAnnotationIds.has((item.annotation || item)?.id)) : items
  await writeEmbedPdfAnnotations(storageKey(), managed)
  window.dispatchEvent(new Event('sireader:marks-updated'))
}

const queueAnnotationSave = (registry: PluginRegistry) => {
  clearTimeout(annotationSaveTimer)
  annotationSaveTimer = setTimeout(() => {
    annotationSaveTimer = null
    void saveAnnotations(registry)
  }, 600)
}

const saveProgress = async (page: { pageNumber: number; totalPages: number }) => {
  if (!props.bookUrl) return
  const progress = { ...page, updatedAt: Date.now() }
  await writeEmbedPdfProgress(storageKey(), progress)
  const percent = progress.totalPages ? Math.round(progress.pageNumber / progress.totalPages * 100) : 0
  await bookshelfManager.updateProgress(props.bookUrl, percent, progress.pageNumber, `#page-${progress.pageNumber}`)
}

const queueProgressSave = (page: { pageNumber: number; totalPages: number }) => {
  pendingProgress = page
  clearTimeout(progressSaveTimer)
  progressSaveTimer = setTimeout(() => {
    progressSaveTimer = null
    pendingProgress = null
    void saveProgress(page)
  }, 600)
}

const handleInit = (container: EmbedPdfContainer) => {
  activeContainer = container
  applyPdfTheme()
}

const handleReady = async (registry: PluginRegistry) => {
  activeRegistry = registry
  nativePdfAnnotationIds = new Set()
  emit('ready', registry)
  setupPdfMigration()
  ;[cleanupDocumentEvents, cleanupAnnotationEvents, cleanupScrollEvents, cleanupZoomEvents].forEach(cleanup => cleanup?.())
  cleanupDocumentEvents = cleanupAnnotationEvents = cleanupScrollEvents = cleanupZoomEvents = null
  const scroll = getCapability<any>(registry, 'scroll')
  const zoom = getCapability<any>(registry, 'zoom')?.forDocument?.(documentId)
  const savedZoomLevel = pdfZoomLevel()
  let pendingSavedZoom = typeof savedZoomLevel === 'number' && !!scroll?.forDocument
  if (scroll?.forDocument) {
    let restored = false
    const savedProgress = props.bookUrl ? readEmbedPdfProgress(storageKey()).catch(() => null) : null
    const restore = async () => {
      if (restored || !savedProgress) return
      const saved = await savedProgress
      if (!saved?.pageNumber) return
      restored = true
      scroll.forDocument(documentId).scrollToPage({
        pageNumber: saved.pageNumber,
        pageCoordinates: saved.pageCoordinates,
        behavior: 'instant',
        alignX: 0,
        alignY: 0,
      })
    }
    const offPage = props.bookUrl && scroll.onPageChange?.((event: any) => {
      if (event.documentId === documentId) queueProgressSave({ pageNumber: event.pageNumber, totalPages: event.totalPages })
    })
    const offLayout = scroll.onLayoutReady?.((event: any) => {
      if (event.documentId === documentId && event.isInitial) {
        if (pendingSavedZoom) zoom?.requestZoom?.(savedZoomLevel)
        pendingSavedZoom = false
        void restore()
      }
    })
    cleanupScrollEvents = () => { offPage?.(); offLayout?.() }
  }
  const documents = getCapability<any>(registry, 'document-manager')
  const getPageHeights = () => (documents?.getDocumentState(documentId)?.document?.pages || []).map((page: any) => Number(page?.size?.height || 0))
  const annotationRoot = getCapability<any>(registry, 'annotation')
  const toolIds = ['ink', 'inkHighlighter', 'line', 'lineArrow', 'polyline', 'polygon', 'square', 'circle'] as const
  const tool = (id: string) => annotationRoot?.getTool?.(id) || annotationRoot?.getTools?.()?.find?.((item: any) => item?.id === id)
  const clone = (value: any) => { try { value = value && typeof value === 'object' && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : null } catch { value = null } return value && Object.keys(value).length ? value : null }
  const readToolDefaults = () => toolIds.reduce((next: Record<string, Record<string, any>>, id) => { const value = clone(tool(id)?.defaults); if (value) next[id] = value; return next }, {})
  const applyToolDefaults = (defaults: any) => toolIds.forEach(id => { const value = clone(defaults?.[id]); if (value && tool(id)) annotationRoot?.setToolDefaults?.(id, value) })
  let toolDefaultsTimer: any = null
  let offTools: (() => void) | null = null
  const saveToolDefaults = () => {
    const settings = readerSettings()
    if (!settings) return
    const pdfAnnotationToolDefaults = readToolDefaults()
    if (JSON.stringify(settings.pdfAnnotationToolDefaults || {}) === JSON.stringify(pdfAnnotationToolDefaults || {})) return
    void settingsManager.save({ ...settings, pdfAnnotationToolDefaults })
  }
  if (annotationRoot) {
    applyToolDefaults(readerSettings()?.pdfAnnotationToolDefaults)
    offTools = annotationRoot.onToolsChange?.(() => {
      clearTimeout(toolDefaultsTimer)
      toolDefaultsTimer = setTimeout(() => {
        toolDefaultsTimer = null
        saveToolDefaults()
      }, 400)
    })
  }
  activeAnnotationScope = annotationRoot?.forDocument(documentId) || null
  activeScrollScope = scroll?.forDocument?.(documentId) || null
  const offZoomState = zoom?.onStateChange?.((state: any) => {
    if (pendingSavedZoom && typeof state?.zoomLevel !== 'number') return
    savePdfZoomLevel(state?.zoomLevel)
  })
  cleanupZoomEvents = () => offZoomState?.()
  const ui = getCapability<any>(registry, 'ui'), sidebarPanel = ui?.getSchema?.().sidebars?.['sidebar-panel'] as any, tabs = sidebarPanel?.content?.tabs
  const outline = Array.isArray(tabs) ? tabs.find((tab: any) => tab.id === 'outline') : null
  if (outline && tabs[0]?.id !== 'outline') ui?.mergeSchema?.({ sidebars: { 'sidebar-panel': { ...sidebarPanel, content: { ...sidebarPanel.content, tabs: [outline, ...tabs.filter((tab: any) => tab.id !== 'outline')] } } } as any })
  setupPdfCommands(registry)
  setupPdfBottomButtons(registry)
  setupPdfCapture(registry)
  let annotationsLoaded = false
  const annotation = activeAnnotationScope
  const annotationIds = () => new Set(annotation?.getAnnotations?.()?.map((item: any) => item.object?.id).filter(Boolean) || [])
  const loadAnnotations = async () => {
    if (annotationsLoaded) return
    annotationsLoaded = true
    if (!storageKey() || !annotation?.importAnnotations) {
      window.dispatchEvent(new Event('sireader:marks-updated'))
      refreshPdfTooltipAnnotations()
      return
    }
    nativePdfAnnotationIds = annotationIds()
    const pageHeights = getPageHeights()
    const stored = await readEmbedPdfAnnotations(storageKey(), pageHeights).catch(() => null)
    const managed = stored?.filter((item: any) => !nativePdfAnnotationIds.has((item.annotation || item)?.id)) || []
    const aligned = managed.length && needsLegacyPdfTextAlign(managed) ? await alignLegacyPdfAnnotations(managed, registry, documents, documentId) : managed
    if ((stored?.length || 0) !== managed.length || aligned !== managed) await writeEmbedPdfAnnotations(storageKey(), aligned)
    if (managed.length) {
      const existing = annotationIds()
      const missing = aligned.filter((item: any) => !existing.has((item.annotation || item)?.id))
      if (missing.length) {
        if (missing.length > 500) await nextIdle()
        annotation.importAnnotations(missing)
      }
    }
    window.dispatchEvent(new Event('sireader:marks-updated'))
    refreshPdfTooltipAnnotations()
  }
  if (annotation) {
    const offEvent = annotation.onAnnotationEvent?.((event: any) => {
      if (event?.type === 'loaded') {
        void loadAnnotations()
      } else if (!nativePdfAnnotationIds.has(event?.annotation?.id)) {
        queueAnnotationSave(registry)
      }
      refreshPdfTooltipAnnotations()
    })
    const offState = annotation.onStateChange?.(refreshPdfTooltipAnnotations)
    cleanupAnnotationEvents = () => {
      clearTimeout(toolDefaultsTimer)
      offEvent?.()
      offState?.()
      offTools?.()
      if (toolDefaultsTimer) saveToolDefaults()
    }
  }
  const offError = documents?.onDocumentError?.((event: any) => {
    if (event.documentId === documentId) showMessage(event.message || pdfLoadFailedMessage(), 3000, 'error')
  })
  cleanupDocumentEvents = () => offError?.()
  if (annotationIds().size) void loadAnnotations()
  ensurePageThemeStyle()
  void nextTick(setupPdfTooltip)
}

let sourceToken = 0
watch(() => props.source, async (source) => {
  const token = ++sourceToken
  disposePdfViewer()
  documentSource.value = null
  pdfLoadError.value = ''
  pdfPreparing.value = source ? pdfLoadingText() : ''
  if (!source) return
  try {
    await preparePdfAssets()
    const nextSource = await createEmbedPdfDocumentSource(documentId, source)
    if (token === sourceToken) documentSource.value = nextSource
  } catch (error: any) {
    if (token === sourceToken) failPdfLoad(error)
  }
}, { immediate: true })

const config = computed(() => ({
  tabBar: 'never',
  worker: true,
  wasmUrl: pdfAssets.value?.wasmUrl,
  documentManager: {
    initialDocuments: [documentSource.value],
  },
  fonts: { ui: null, signature: null },
  stamp: { manifests: pdfAssets.value?.stampManifests || [] },
  permissions: { enforceDocumentPermissions: true },
  capture: { imageType: 'image/png', scale: 2, withAnnotations: true },
  scroll: { defaultBufferSize: 1 },
  zoom: { defaultZoomLevel: pdfInitialZoomLevel() ?? 'fit-width' },
  redaction: { useAnnotationMode: true, drawBlackBoxes: true },
  i18n: {
    defaultLocale: 'zh-CN',
    fallbackLocale: 'en',
  },
  theme: pdfTheme(),
}))

const mountPdfViewer = async () => {
  const host = viewerHostRef.value
  if (!host || !documentSource.value || !pdfAssets.value || activeViewer) return
  const token = ++viewerToken
  try {
    host.replaceChildren()
    const viewer = await initEmbedPdfViewer(host, config.value)
    if (token !== viewerToken || viewerHostRef.value !== host) return void viewer?.remove?.()
    if (!viewer) throw new Error(pdfLoadFailedMessage())
    activeViewer = viewer
    handleInit(activeViewer)
    pdfPreparing.value = ''
    activeViewer.registry?.then((registry: PluginRegistry) => token === viewerToken && handleReady(registry))
  } catch (error: any) {
    if (token === viewerToken) failPdfLoad(error)
  }
}

watch(() => [documentSource.value, pdfAssets.value, viewerHostRef.value], () => nextTick(mountPdfViewer), { flush: 'post' })
watch(() => [props.theme, props.customTheme?.color, props.customTheme?.bg, props.customTheme?.bgImg], () => nextTick(applyPdfTheme))
watch(() => props.hideAnnotations, hidden => syncPdfAnnotationsHidden(!!hidden))
watch(() => props.settings?.quickSendDocs, () => activeRegistry && setupPdfCommands(activeRegistry), { deep: true })
const themeObserver = new MutationObserver(() => requestAnimationFrame(applyPdfTheme))
;[document.documentElement, document.body].forEach(el => themeObserver.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'data-theme-mode'] }))

onBeforeUnmount(() => {
  if (annotationSaveTimer && activeRegistry) {
    clearTimeout(annotationSaveTimer)
    void saveAnnotations(activeRegistry)
  }
  if (progressSaveTimer && pendingProgress) {
    clearTimeout(progressSaveTimer)
    void saveProgress(pendingProgress)
  }
  clearTimeout(zoomSaveTimer)
  cleanupAnnotationEvents?.()
  cleanupDocumentEvents?.()
  cleanupScrollEvents?.()
  cleanupZoomEvents?.()
  cleanupCaptureEvents?.()
  cleanupTooltipEvents?.()
  cleanupMigrationEvents?.()
  themeObserver.disconnect()
  activeAnnotationScope = null
  activeScrollScope = null
  activeContainer = null
  nativePdfAnnotationIds = new Set()
  disposePdfViewer()
  pdfTooltip?.remove()
  pdfTooltip = null
})
</script>

<style scoped>
.embed-pdf-reader{position:relative;width:100%;height:100%;display:block;background:var(--b3-theme-background)}
.embed-pdf-reader :deep(> *){width:100%;height:100%}
.embed-pdf-reader__loading{height:100%;display:flex;align-items:center;justify-content:center;color:var(--b3-theme-on-surface)}
.embed-pdf-reader__loading--overlay{position:absolute;inset:0;background:var(--b3-theme-background);z-index:1}
</style>
