/**
 * Foliate Reader - 统一阅读器
 * 整合 View 创建、配置、标记管理等功能
 */

import type { Plugin } from 'siyuan'
import type { FoliateView, Location } from './types'
import type { ReaderSettings } from '@/composables/useSetting'
import { PRESET_THEMES } from '@/composables/useSetting'
import { createTooltip, hideTooltip, showTooltip } from '@/core/MarkManager'
import { EPUBSearch } from './search'
import { createTxtBook, isTxtSource } from '@/core/txt/book'
import { isMobile } from '@/utils/mobile'
import { FootnoteHandler } from 'foliate-js/footnotes.js'
import 'foliate-js/view.js'

export interface ReaderOptions {
  container: HTMLElement
  settings: ReaderSettings
  plugin: Plugin
}

const resolveColor = (color: string) =>
  color.startsWith('var(')
    ? getComputedStyle(document.documentElement).getPropertyValue(color.slice(4, -1)).trim()
    : color

const resolveTheme = (theme: any) => ({ ...theme, bg: resolveColor(theme.bg), color: resolveColor(theme.color) })
const getTheme = (settings: ReaderSettings) =>
  resolveTheme(settings.theme === 'custom' ? settings.customTheme : PRESET_THEMES[settings.theme] || PRESET_THEMES.default)
const getViewBackground = (theme: any) => theme.bgImg ? `${theme.bg} url("${theme.bgImg}") center/cover no-repeat` : theme.bg
const isDark = (c = '') => { const m = c.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number); return !!m && (m[0] * 299 + m[1] * 587 + m[2] * 114) / 1000 < 128 }
const preloadedFonts = new Set<string>()
const preloadFont = (url: string) => {
  if (preloadedFonts.has(url)) return
  preloadedFonts.add(url)
  document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'preload', as: 'font', href: url, crossOrigin: 'anonymous' }))
}
const watchTheme = (cb: () => void) => {
  const observer = new MutationObserver(() => requestAnimationFrame(cb))
  observer.observe(document.documentElement, { attributeFilter: ['data-theme-mode', 'class'] })
  return observer
}

const getStyleTag = (id: string) =>
  document.getElementById(id) || Object.assign(document.head.appendChild(document.createElement('style')), { id })
const setAttr = (el: Element, name: string, value: string, on: any = true) => on ? el.setAttribute(name, value) : el.removeAttribute(name)
const numericNotePattern = /^.{0,2}\d+$/
const inlineFootnoteSelector = '.js_readerFooterNote,.zhangyue-footnote,.duokan-footnote,.qqreader-footnote'
const footnoteSelector = `${inlineFootnoteSelector},.footnote-link,.footnote`
const footnoteLinkClasses = ['duokan-footnote', 'footnote-link', 'footnote']
const epubTypeOf = (el: Element) => el.getAttribute('epub:type') || el.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || el.getAttribute('type') || ''
const hrefId = (href = '') => { const id = href.split('#')[1] || ''; try { return decodeURIComponent(id) } catch { return id } }
const shouldCheckAsFootnote = (a: HTMLAnchorElement) => {
  if (!numericNotePattern.test(a.textContent?.trim() || '')) return false
  const nav = a.closest('nav,ol,ul')
  return !nav || Array.from(nav.querySelectorAll('a')).filter(link => link !== a && numericNotePattern.test(link.textContent?.trim() || '')).length < 2
}
const footnoteText = (el: HTMLElement, target?: Element | null) =>
  (el.getAttribute('data-wr-footernote') || el.getAttribute('zy-footnote') || el.querySelector('img')?.getAttribute('alt') || el.getAttribute('alt') || (target as HTMLElement | null)?.getAttribute?.('alt') || el.textContent || '').trim()
const inlineFootnote = (target: Element | null) => {
  const el = target?.closest?.(inlineFootnoteSelector) as HTMLElement | null
  if (!el || el.closest('a[href]')) return null
  const text = footnoteText(el, target)
  return text.trim() ? { el, text: text.trim() } : null
}
const normalizeFootnoteTypes = (doc?: Document) => {
  doc?.querySelectorAll('[type~="noteref"],[type~="footnote"],[type~="endnote"],[type~="note"],[type~="rearnote"]').forEach(el => {
    const type = el.getAttribute('type')
    if (type && !el.getAttribute('epub:type')) el.setAttribute('epub:type', type)
  })
  const ids = new Set<string>()
  doc?.querySelectorAll('aside,section').forEach(el => {
    if (/\b(footnote|endnote|rearnote)\b/.test(epubTypeOf(el)) || /\bdoc-(footnote|endnote)\b/.test(el.getAttribute('role') || '')) {
      el.setAttribute('data-sr-footnote', 'true')
      if (el.id) ids.add(el.id)
    }
  })
  ids.size && doc?.querySelectorAll('a[href]').forEach(a => {
    const id = hrefId(a.getAttribute('href') || ''), role = a.getAttribute('role') || ''
    if (id && ids.has(id) && !/\bdoc-noteref\b/.test(role)) a.setAttribute('role', `${role} doc-noteref`.trim())
  })
}

const isFootnoteClick = (target: Element | null) => {
  const a = target?.closest?.('a')
  const key = [a?.className, a?.id, a?.getAttribute('href'), a?.getAttribute('type'), a?.getAttribute('role'), a?.getAttribute('epub:type'), a?.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type')].join(' ')
  return !!target?.closest?.(`sup,${footnoteSelector}`) || /\b(doc-)?(note|noteref|footnote|endnote|rearnote|biblio(ref|entry)?)\b|fn\d/i.test(key)
}

const mediaTarget = (target: Element | null) => {
  if (!target || isFootnoteClick(target)) return null
  if (target.localName === 'img') return { type: 'image', el: target, image: (target as HTMLImageElement).currentSrc || (target as HTMLImageElement).src, text: (target as HTMLImageElement).alt || target.title || '图片标注' }
  const svgImage = target.localName === 'image' ? target : target.closest('image') || target.closest('svg')?.querySelector('image')
  const href = svgImage?.getAttribute('href') || svgImage?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
  if (href) return { type: 'image', el: svgImage as Element, image: /^data:|^blob:|^[a-z]+:/i.test(href) ? href : new URL(href, target.ownerDocument.baseURI).href, text: '图片标注' }
  const table = target.localName === 'table' ? target : target.closest('table')
  return table ? { type: 'table', el: table, html: table.outerHTML, text: table.textContent?.replace(/\s+/g, ' ').trim() || '表格' } : null
}

const recoverTransformErrors = (book: any) => book?.transformTarget?.addEventListener('data', (event: Event) => {
  const { detail } = event as CustomEvent
  detail.data = Promise.resolve(detail.data).catch(e => (console.error(new Error(`Failed to load ${detail.name}`, { cause: e })), ''))
})
let openQueue = Promise.resolve()
const enqueueOpen = <T>(task: () => Promise<T>) => {
  const next = openQueue.catch(() => {}).then(task)
  openQueue = next.catch(() => {}).then(() => {})
  return next
}

const readText = (value: any): string => {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map(readText).find(Boolean) || ''
  if (value && typeof value === 'object') return readText(value.label ?? value.name ?? value.value ?? value.text ?? '')
  return ''
}
const sourceNameOf = (source: File | string | any) => source instanceof File
  ? source.name
  : typeof source === 'string'
    ? source.split(/[?#]/)[0]
    : ''
const isKnownEbookSource = (source: File | string | any) => /\.(epub|mobi|azw3|azw|fb2|cbz)$/i.test(sourceNameOf(source))

function createFoliateView(container: HTMLElement): FoliateView {
  const view = document.createElement('foliate-view') as FoliateView
  view.style.cssText = 'display:block;width:100%;height:100%'
  view.setAttribute('persist', 'false')
  container.appendChild(view)
  return view
}

function getLayoutMetrics(settings: ReaderSettings) {
  const { viewMode = 'single', layoutSettings: layout } = settings
  const scroll = viewMode === 'scroll'
  const legacyMargin = layout?.headerFooterMargin ?? 0
  return {
    scroll,
    columns: isMobile() || scroll || viewMode === 'single' ? 1 : 2,
    gap: Math.max(0, layout?.gapPercent ?? layout?.gap ?? 5),
    margins: {
      top: Math.max(0, layout?.marginTopPx ?? legacyMargin),
      right: Math.max(0, layout?.marginRightPx ?? legacyMargin),
      bottom: Math.max(0, layout?.marginBottomPx ?? legacyMargin),
      left: Math.max(0, layout?.marginLeftPx ?? legacyMargin),
    },
  }
}

function configureView(view: FoliateView, settings: ReaderSettings) {
  const renderer = view.renderer
  if (!renderer) return
  const { pageAnimation = 'slide', visualSettings } = settings
  const { scroll, columns, gap, margins } = getLayoutMetrics(settings)
  setAttr(renderer, 'flow', scroll ? 'scrolled' : 'paginated')
  setAttr(renderer, 'max-column-count', String(columns))
  setAttr(renderer, 'animated', '', !scroll && pageAnimation === 'slide')
  setAttr(renderer, 'gap', `${gap}%`)
  for (const side of ['top', 'right', 'bottom', 'left'] as const) setAttr(renderer, `margin-${side}`, `${margins[side]}px`)
  applyVisualFilter(visualSettings)
  applyViewTheme(view, getTheme(settings))
}

function applyVisualFilter(visual: any = {}) {
  const filters = [
    visual.brightness !== 1 && `brightness(${visual.brightness})`,
    visual.contrast !== 1 && `contrast(${visual.contrast})`,
    visual.sepia > 0 && `sepia(${visual.sepia})`,
    visual.saturate !== 1 && `saturate(${visual.saturate})`,
    visual.invert && 'invert(1) hue-rotate(180deg)'
  ].filter(Boolean)
  getStyleTag('sireader-visual-filter').textContent = `
    foliate-view::part(container){background:transparent!important}
    foliate-view::part(filter){${filters.length ? `filter:${filters.join(' ')}` : ''}}
  `
}

function applyViewTheme(view: FoliateView, theme: any) {
  const bg = getViewBackground(theme)
  const pageBg = theme.bgImg ? 'transparent' : bg
  view.style.setProperty('--sr-epub-bg', bg)
  view.style.setProperty('--sr-epub-page-bg', pageBg)
  Object.assign(view.style, { background: bg, color: theme.color })
  Object.assign(view.renderer?.style || {}, { background: pageBg, color: theme.color })
  if (view.parentElement) view.parentElement.style.background = bg
}

function applyCustomCSS(view: FoliateView, settings: ReaderSettings) {
  const {
    textSettings: text = { fontFamily: 'inherit', fontSize: 16, fontWeight: 400, letterSpacing: 0, customFont: { fontFamily: '', fontFile: '' } },
    paragraphSettings: paragraph = { lineHeight: 1.8, textIndent: 2, paragraphSpacing: 1 }
  } = settings
  const theme = getTheme(settings)
  const mobile = isMobile()
  const forceColor = isDark(theme.bg) ? `p,li,dd,blockquote{color:${theme.color}!important}` : ''
  const transparentContent = theme.bgImg ? 'html,body,section,article,main,div,p,blockquote,ul,ol,li,table,thead,tbody,tr,td,th{background-color:transparent!important}' : ''
  const darkText = ['#000', '#000000', 'black', 'rgb(0,0,0)', 'rgb(0, 0, 0)'].map(c => `font[color="${c}"],[style*="color:${c}"],[style*="color: ${c}"]`).join(',')
  const customFont = text.fontFamily === 'custom' ? text.customFont?.fontFamily : ''
  const font = customFont ? `"${customFont}", sans-serif` : text.fontFamily || 'inherit'
  const fontUrl = customFont ? `${location.origin}/plugins/custom-fonts/${encodeURI(text.customFont.fontFile)}` : ''
  fontUrl && preloadFont(fontUrl)
  const fontFace = customFont ? `@font-face{font-family:"${customFont}";src:url("${fontUrl}");font-display:swap}` : ''
  const css = [
    `@namespace epub "http://www.idpf.org/2007/ops";`,
    fontFace,
    `
    html{
      background:transparent!important;
      color:${theme.color}!important;
      ${mobile ? '' : 'color-scheme:light dark'}
      box-sizing:border-box!important;
      scrollbar-width:none!important;
      -ms-overflow-style:none!important;
      ${mobile ? '-webkit-touch-callout:none!important;' : ''}
    }
    html::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
    body{
      background-color:transparent!important;
      color:${theme.color}!important;
      font-family:${font}!important;
      font-size:${text.fontSize}px!important;
      font-weight:${text.fontWeight}!important;
      letter-spacing:${text.letterSpacing}em!important;
      margin:0!important;
      box-sizing:border-box!important;
      scrollbar-width:none!important;
      -ms-overflow-style:none!important;
      ${mobile ? 'width:100%!important;min-width:100%!important;max-width:none!important;display:block!important;' : ''}
    }
    body::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
    body,body>*{background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important}
    ${transparentContent}
    body,body *{font-family:${font}!important}
    p,li,dd,blockquote,span,div{font-size:${text.fontSize}px!important;font-weight:${text.fontWeight}!important}
    p:not(:has(img)),li,blockquote,dd{line-height:${paragraph.lineHeight}!important;text-align:start;text-indent:${paragraph.textIndent}em!important;margin-bottom:${paragraph.paragraphSpacing}em!important}
    img,svg,p:has(img),figure,figure *{background-color:transparent!important}
    p:has(img){text-indent:0!important;margin:0!important}
    ${forceColor}
    ${darkText}{color:${theme.color}!important}
    ${mobile ? 'body>*{max-width:100%!important}img,svg,video,table,pre,code{max-width:100%!important}' : ''}
    [align="left"]{text-align:left!important}
    [align="right"]{text-align:right!important}
    [align="center"]{text-align:center!important}
    [align="justify"]{text-align:justify!important}
    pre{white-space:pre-wrap!important}
    aside[epub|type~="footnote"],
    aside[epub|type~="endnote"],
    aside[epub|type~="rearnote"],
    section[epub|type~="footnote"],
    section[epub|type~="endnote"],
    section[epub|type~="rearnote"],
    [role~="doc-footnote"],
    [role~="doc-endnote"],
    [data-sr-footnote]{display:none!important}
  `
  ].join('')
  const renderer = view.renderer as any
  if (renderer?.__sireaderStyleSig !== css) {
    renderer?.setStyles?.(css)
    renderer && (renderer.__sireaderStyleSig = css)
  }
  Object.assign((view.renderer as HTMLElement | undefined)?.style || {}, { scrollbarWidth: 'none', msOverflowStyle: 'none' })
}

function getCurrentLocation(view: FoliateView): Location | null {
  try {
    const renderer = view.renderer as any
    if (renderer?.index !== undefined) return { index: renderer.index ?? 0, fraction: renderer.fraction ?? 0, cfi: view.lastLocation?.cfi }
    return view.lastLocation ? { index: view.lastLocation.index ?? 0, fraction: view.lastLocation.fraction ?? 0, cfi: view.lastLocation.cfi } : null
  } catch (error) {
    console.error('[FoliateView] Failed to get location:', error)
    return null
  }
}

const applyMarginal = (el: HTMLElement | undefined, text: string, margin = 48) => {
  if (!el) return
  el.textContent = text
  Object.assign(el.style, {
    textAlign: 'start',
    fontSize: `${Math.max(0, Math.min(12, margin * 0.75))}px`,
    lineHeight: '1',
  })
}

function formatClock(layout: ReaderSettings['layoutSettings']) {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: layout.use24HourClock ? false : undefined })
}

function formatProgress(view: FoliateView, renderer: any, layout: ReaderSettings['layoutSettings']) {
  const fraction = view.lastLocation?.fraction
  if (layout.progressStyle === 'percentage' && typeof fraction === 'number') return `${Math.round(fraction * 100)}%`
  if (layout.progressStyle === 'reference' && typeof fraction === 'number' && layout.referencePageCount > 0) return `${Math.max(1, Math.round(fraction * layout.referencePageCount))}/${layout.referencePageCount}`
  return Number.isFinite(renderer?.page) && Number.isFinite(renderer?.pages) && renderer.pages > 2
    ? `${Math.min(renderer.pages - 2, Math.max(1, renderer.page))}/${renderer.pages - 2}`
    : ''
}

function updateMarginals(view: FoliateView, settings: ReaderSettings) {
  const renderer = view.renderer as any
  const heads = [...(renderer?.heads || [])] as HTMLElement[]
  const feet = [...(renderer?.feet || [])] as HTMLElement[]
  if (!heads.length && !feet.length) return
  const layout = settings.layoutSettings
  const topMargin = layout.marginTopPx || layout.headerFooterMargin || 44
  const bottomMargin = layout.marginBottomPx || layout.headerFooterMargin || 44
  const title = readText(view.book?.metadata?.title)
  const chapter = readText(view.lastLocation?.tocItem?.label) || title
  const footer = [
    layout.showProgressInfo && formatProgress(view, renderer, layout),
    layout.showCurrentTime && formatClock(layout),
  ]
    .filter(Boolean)
    .join(' · ')
  heads.forEach(head => applyMarginal(head, layout.showHeader ? chapter || title : '', topMargin))
  feet.forEach(foot => applyMarginal(foot, layout.showFooter ? footer : '', bottomMargin))
}

function refreshMarginals(view: FoliateView, settings: ReaderSettings) {
  requestAnimationFrame(() => requestAnimationFrame(() => updateMarginals(view, settings)))
  setTimeout(() => updateMarginals(view, settings), 0)
}

function refreshRenderer(view: FoliateView, settings: ReaderSettings) {
  requestAnimationFrame(() => { ;(view.renderer as any)?.render?.(); refreshMarginals(view, settings) })
}

export class FoliateReader {
  private view: FoliateView
  private container: HTMLElement
  private settings: ReaderSettings
  private plugin: Plugin
  private eventListeners = new Map<string, Set<Function>>()
  private themeObserver?: MutationObserver
  private resizeObserver?: ResizeObserver
  private resizeTimer: any = null
  private clockTimer: any = null
  private lastResizeWidth = 0
  private footnote = new FootnoteHandler()
  private footnoteAnchor: HTMLElement | null = null
  private footnoteHref = ''
  private footnoteHistory: any[] = []
  private footnoteIndex = -1
  private destroyed = false
  private closeFootnote = () => document.querySelectorAll<HTMLElement>('[data-footnote-tooltip]').forEach(el => Object.assign(el.style, { display: 'none', opacity: '0', transform: 'translateY(-8px)' }))
  private closeFloaters = () => { this.closeFootnote(); this.emit('content-interaction') }
  private syncThemeObserver = (auto: boolean) => auto
    ? this.themeObserver ||= watchTheme(() => this.applySettings())
    : (this.themeObserver?.disconnect(), this.themeObserver = undefined)

  public marks: any
  public searchManager: EPUBSearch

  constructor(options: ReaderOptions) {
    this.container = options.container
    this.settings = options.settings
    this.plugin = options.plugin
    this.view = createFoliateView(options.container)
    this.searchManager = new EPUBSearch(this.view)
    this.setupEventListeners()
    this.resizeObserver = new ResizeObserver(() => this.scheduleResize())
    this.resizeObserver.observe(this.container)
    this.listenToSettingsChanges()
  }

  async open(file: File | string | any | (() => Promise<File | string | any>), format?: string) {
    await enqueueOpen(async () => {
      if (this.destroyed) return
      const input = typeof file === 'function' ? await file() : file
      const source = (isTxtSource(input) || (format === 'txt' && !isKnownEbookSource(input))) ? await createTxtBook(input) : input
      if (this.destroyed) return
      await this.view.open(source)
      if (this.destroyed) return this.view.close?.()
      recoverTransformErrors(this.view.book)
      const renderer = this.view.renderer as any
      if (renderer && !renderer.__sireaderMarginalsBound) {
        renderer.__sireaderMarginalsBound = true
        const refresh = () => refreshMarginals(this.view, this.settings)
        renderer.addEventListener('load', refresh)
        renderer.addEventListener('relocate', refresh)
      }
      this.applySettings()
      await this.view.init?.({})
      if (this.destroyed) return this.view.close?.()
      if (this.marks) await this.marks.init()
      this.emit('loaded', { book: this.view.book })
    })
  }

  private applySettings() {
    configureView(this.view, this.settings)
    applyCustomCSS(this.view, this.settings)
    refreshRenderer(this.view, this.settings)
    this.syncClock()
  }

  private syncClock() {
    clearInterval(this.clockTimer)
    this.clockTimer = this.settings.layoutSettings.showCurrentTime ? setInterval(() => refreshMarginals(this.view, this.settings), 60000) : null
  }

  private scheduleResize() {
    const width = Math.round(this.container.clientWidth)
    if (!width || Math.abs(width - this.lastResizeWidth) < 4) return
    this.lastResizeWidth = width
    this.resize(180)
  }

  resize = (delay = 60) => {
    if (!this.container.isConnected) return
    clearTimeout(this.resizeTimer)
    this.resizeTimer = setTimeout(() => this.applySettings(), delay)
  }

  private handleLoad(detail: any) { normalizeFootnoteTypes(detail?.doc); refreshMarginals(this.view, this.settings); this.bindContentMedia(detail?.doc, detail?.index); this.emit('load', detail) }

  private cfiFor(doc: Document, index: number | undefined, node: Node) {
    try { const range = doc.createRange(); range.selectNode(node); return index !== undefined ? (this.view as any).getCFI(index, range) : '' } catch { return '' }
  }

  private bindContentMedia(doc?: Document, index?: number) {
    if (!doc) return
    doc.querySelectorAll('img').forEach((img: HTMLImageElement) => { img.onerror = () => { img.style.display = 'none' } })
    if ((doc as any).__sireaderImageMenu) return
    ;(doc as any).__sireaderImageMenu = true
    const emitMedia = (event: MouseEvent, media: any, name: string) => {
      const rect = (doc.defaultView?.frameElement as HTMLIFrameElement | null)?.getBoundingClientRect()
      this.emit(name, { item: { id: '', type: 'note', format: 'epub', cfi: this.cfiFor(doc, index, media.el), text: media.text, image: media.image, html: media.html, chapter: this.view.lastLocation?.tocItem?.label || '' }, x: event.clientX + (rect?.left || 0), y: event.clientY + (rect?.top || 0) })
    }
    const openMenu = (event: MouseEvent) => {
      const media = mediaTarget(event.target as Element | null)
      if (!media) return false
      this.closeFloaters()
      event.preventDefault(); event.stopPropagation()
      emitMedia(event, media, media.type === 'table' ? 'table-menu' : 'image-menu')
      return true
    }
    doc.addEventListener('contextmenu', openMenu as EventListener)
    doc.addEventListener('click', ((event: MouseEvent) => {
      const target = event.target as Element | null
      const note = inlineFootnote(target)
      if (note) return event.preventDefault(), event.stopPropagation(), this.renderInlineFootnote(note.el, note.text)
      const media = mediaTarget(target)
      if (!media) return target?.closest?.('a[href]') ? undefined : this.closeFloaters()
      this.closeFloaters()
      event.preventDefault(); event.stopPropagation()
      emitMedia(event, media, media.type === 'table' ? 'table-open' : 'image-open')
    }) as EventListener)
  }

  private setupEventListeners() {
    this.footnote.addEventListener('before-render', ((e: CustomEvent) => {
      const view = e.detail.view as FoliateView
      view.style.cssText = 'display:block;width:100%;height:min(360px,calc(100vh - 120px))'
      view.addEventListener('link', ((event: CustomEvent) => {
        event.preventDefault()
        let id = this.footnoteHref.split('#')[1]
        try { id = id && decodeURIComponent(id) } catch {}
        if (id && event.detail.a?.id === id) return
        const detail = { ...event.detail, follow: true }
        this.footnoteHistory = [...this.footnoteHistory.slice(0, this.footnoteIndex + 1), detail]
        this.footnoteIndex = this.footnoteHistory.length - 1
        this.footnote.handle(this.view.book, { detail, preventDefault: () => event.preventDefault() } as any)?.catch(() => this.view.goTo(detail.href))
      }) as EventListener)
      view.addEventListener('load', ((event: CustomEvent) => normalizeFootnoteTypes(event.detail?.doc)) as EventListener)
      view.renderer?.setAttribute?.('flow', 'scrolled')
      view.renderer?.setAttribute?.('no-background', '')
      view.renderer?.setStyles?.('body{padding:14px!important;font-size:13px!important;line-height:1.7!important;color:var(--b3-theme-on-surface)!important;background:var(--b3-theme-surface)!important}a{color:var(--b3-theme-primary)!important}')
    }) as EventListener)
    this.footnote.addEventListener('render', ((e: CustomEvent) => this.renderFootnote(e.detail)) as EventListener)
    this.view.addEventListener('relocate', ((e: CustomEvent) => {
      refreshMarginals(this.view, this.settings)
      this.emit('relocate', e.detail)
    }) as EventListener)
    this.view.addEventListener('load', ((e: CustomEvent) => this.handleLoad(e.detail)) as EventListener)
    this.view.addEventListener('external-link', ((e: CustomEvent) => this.emit('external-link', e.detail)) as EventListener)

    this.view.addEventListener('link', ((e: CustomEvent) => {
      const { a, href } = e.detail
      if (!a || !href) return this.emit('link', e.detail)
      this.closeFloaters()
      this.footnoteAnchor = a
      this.footnoteHistory = [e.detail]
      this.footnoteIndex = 0
      const sameDocNote = a.ownerDocument.getElementById(hrefId(a.getAttribute('href') || ''))
      if (sameDocNote?.hasAttribute('data-sr-footnote')) return e.preventDefault(), this.renderSameDocFootnote(a, sameDocNote)
      if (footnoteLinkClasses.some(cls => a.classList.contains(cls))) e.detail.follow = true
      if (shouldCheckAsFootnote(a)) e.detail.check = true
      const handled = this.footnote.handle(this.view.book, e as any)
      if (handled) return handled.catch(() => this.emit('link', e.detail))
      this.emit('link', e.detail)
    }) as EventListener)
  }

  private getFootnoteTooltip() {
    let tooltip = document.querySelector('[data-footnote-tooltip]') as HTMLDivElement | null
    if (tooltip) return tooltip
    tooltip = document.createElement('div')
    tooltip.setAttribute('data-footnote-tooltip', '')
    tooltip.style.cssText = 'position:fixed;display:none;width:min(360px,calc(100vw - 20px));background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:99999;pointer-events:auto;overflow:hidden;transition:all .2s'
    document.body.appendChild(tooltip)
    return tooltip
  }

  private renderInlineFootnote(el: HTMLElement, text: string) {
    this.renderFootnoteContent(el, text)
  }

  private renderSameDocFootnote(anchor: HTMLElement, target: Element) {
    this.renderFootnoteContent(anchor, target.innerHTML, true)
  }

  private renderFootnoteContent(anchor: HTMLElement, value: string, html = false) {
    const tooltip = this.getFootnoteTooltip()
    tooltip.innerHTML = createTooltip({ icon: '#iconMark', iconColor: '#ef4444', title: this.plugin.i18n.footnote || '脚注', content: `<div data-footnote-content style="max-height:min(360px,calc(100vh - 120px));overflow:auto;user-select:text;padding:14px;font-size:13px;line-height:1.7;${html ? '' : 'white-space:pre-wrap'}"></div>` })
    const content = tooltip.querySelector('[data-footnote-content]')!
    html ? content.innerHTML = value : content.textContent = value
    const rect = anchor.getBoundingClientRect()
    const frameRect = (anchor.ownerDocument.defaultView?.frameElement as HTMLIFrameElement | null)?.getBoundingClientRect()
    showTooltip(tooltip, (frameRect?.left || 0) + rect.left, (frameRect?.top || 0) + rect.bottom + 8)
  }

  private renderFootnote({ view, href, type, target }: any) {
    const a = this.footnoteAnchor
    if (!a) return
    this.footnoteHref = href || ''
    const tooltip = this.getFootnoteTooltip()
    const i = this.plugin.i18n
    const title = type === 'endnote' ? i.endnote || '尾注' : type === 'biblioentry' ? i.reference || '参考' : type === 'definition' ? i.glossary || '术语' : i.footnote || '脚注'
    tooltip.innerHTML = createTooltip({ icon: '#iconMark', iconColor: '#ef4444', title: `${title} (${i.clickToJump || '点击跳转'})`, content: `${this.footnoteIndex > 0 ? '<button data-footnote-back style="margin:8px 0 0 8px;padding:4px 8px;border:1px solid var(--b3-border-color);border-radius:6px;background:var(--b3-theme-background);color:var(--b3-theme-on-surface);cursor:pointer">←</button>' : ''}<div data-footnote-content style="height:min(360px,calc(100vh - 120px));overflow:auto;user-select:text"></div>`, id: target?.id ? `#${target.id}` : '' })
    tooltip.querySelector('[data-footnote-content]')?.replaceChildren(view)
    tooltip.querySelector('[data-footnote-back]')?.addEventListener('click', () => {
      const detail = this.footnoteHistory[--this.footnoteIndex]
      detail && this.footnote.handle(this.view.book, { detail: { ...detail, follow: true }, preventDefault: () => {} } as any)
    })
    const header = tooltip.firstElementChild as HTMLElement | null
    if (header) {
      header.style.cursor = 'pointer'
      header.onclick = () => { hideTooltip(tooltip!, 0); this.goTo(href).catch(() => {}) }
    }
    const rect = a.getBoundingClientRect()
    const frameRect = (a.ownerDocument.defaultView?.frameElement as HTMLIFrameElement | null)?.getBoundingClientRect()
    const x = (frameRect?.left || 0) + rect.left, y = (frameRect?.top || 0) + rect.bottom + 8
    let timer: any
    showTooltip(tooltip, x, y)
    a.onmouseenter = () => { clearTimeout(timer); showTooltip(tooltip!, x, y) }
    a.onmouseleave = () => { timer = setTimeout(() => hideTooltip(tooltip!), 100) }
    tooltip.onmouseenter = () => clearTimeout(timer)
    tooltip.onmouseleave = () => hideTooltip(tooltip)
  }

  private listenToSettingsChanges() {
    window.addEventListener('sireaderSettingsUpdated', ((e: CustomEvent) => this.updateSettings(e.detail)) as EventListener)
    this.syncThemeObserver(this.settings.theme === 'auto')
  }

  private check = () => this.view.renderer || (console.warn('[Reader] Renderer not ready'), null)

  async goTo(target: string | number | Location) { this.check() && await this.view.goTo(target) }
  async goToTextStart() { this.check() && await this.view.goToTextStart?.() }
  async goLeft() { this.check() && await this.view.goLeft() }
  async goRight() { this.check() && await this.view.goRight() }
  async prev() { this.check() && await this.view.prev() }
  async next() { this.check() && await this.view.next() }
  async goToFraction(fraction: number) { this.check() && await this.view.goToFraction(fraction) }

  getLocation = () => getCurrentLocation(this.view)
  getProgress = () => this.view.lastLocation

  canGoBack = () => this.view.history?.canGoBack ?? false
  canGoForward = () => this.view.history?.canGoForward ?? false
  goBack = () => this.view.history?.back()
  goForward = () => this.view.history?.forward()

  async *search(query: string, options?: any) {
    yield* this.searchManager.search(query, options)
  }

  clearSearch = () => this.searchManager.clear()
  nextSearchResult = () => this.searchManager.next()
  prevSearchResult = () => this.searchManager.prev()
  getSearchResults = () => this.searchManager.getResults()
  getCurrentSearchResult = () => this.searchManager.getCurrent()

  async select(target: string | Location) {
    if ((this.view as any).select) await (this.view as any).select(target)
  }

  deselect = () => (this.view as any).deselect?.()

  getSelectedText(): { text: string; range: Range } | null {
    try {
      for (const { doc } of this.view.renderer?.getContents?.() || []) {
        const selection = doc.defaultView?.getSelection()
        if (selection && !selection.isCollapsed) return { text: selection.toString(), range: selection.getRangeAt(0) }
      }
    } catch (error) {
      console.error('[Reader] Selection error:', error)
    }
    return null
  }

  on(event: string, cb: Function) {
    (this.eventListeners.get(event) || (this.eventListeners.set(event, new Set()), this.eventListeners.get(event)!)).add(cb)
  }

  off = (event: string, cb: Function) => this.eventListeners.get(event)?.delete(cb)
  private emit(event: string, data?: any) {
    this.eventListeners.get(event)?.forEach(cb => {
      try { cb(data) } catch (error) { console.error(`[Reader] Event error (${event}):`, error) }
    })
  }

  updateSettings(settings: ReaderSettings) {
    this.syncThemeObserver(settings.theme === 'auto')
    this.settings = settings
    this.applySettings()
  }

  getBook = () => this.view.book
  getView = () => this.view

  async destroy() {
    this.destroyed = true
    await this.marks?.destroy()
    this.themeObserver?.disconnect()
    this.resizeObserver?.disconnect()
    clearTimeout(this.resizeTimer)
    clearInterval(this.clockTimer)
    this.eventListeners.clear()
    this.view.close?.()
    this.view.book?.destroy?.()
    try { this.view.remove() } catch {}
  }
}

export function createReader(options: ReaderOptions): FoliateReader {
  return new FoliateReader(options)
}
