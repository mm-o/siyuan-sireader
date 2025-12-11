/**
 * Foliate Reader - 统一阅读器
 * 整合 View 创建、配置、TXT 加载、标记管理等所有功能
 */

import type { Plugin } from 'siyuan'
import type { FoliateView, Location } from './types'
import type { ReaderSettings } from '@/composables/useSetting'
import { PRESET_THEMES } from '@/composables/useSetting'
import { bookSourceManager } from '@/core/book'
import { MarkManager } from './mark'
import 'foliate-js/view.js'

interface TxtChapter {
  index: number
  title: string
  url?: string
  content?: string
}

export interface ReaderOptions {
  container: HTMLElement
  settings: ReaderSettings
  bookUrl: string
  plugin: Plugin
}

// ===== View 工具函数 =====

function createFoliateView(container: HTMLElement): FoliateView {
  const view = document.createElement('foliate-view') as FoliateView
  view.style.cssText = 'width:100%;height:100%'
  view.setAttribute('persist', 'false')
  container.appendChild(view)
  return view
}

function configureView(view: FoliateView, settings: ReaderSettings) {
  const r = view.renderer
  if (!r) return
  const { columnMode = 'single', pageAnimation = 'slide', layoutSettings, visualSettings, theme, customTheme } = settings || {}
  const l = layoutSettings || { gap: 5, headerFooterMargin: 0 }
  const th = theme === 'custom' ? customTheme : (theme && PRESET_THEMES[theme]) || PRESET_THEMES.default
  const isScroll = pageAnimation === 'scroll'
  const set = (n: string, val: string) => r.setAttribute(n, val)
  const toggle = (n: string, cond: boolean, val = '') => cond ? set(n, val) : r.removeAttribute(n)
  set('flow', isScroll ? 'scrolled' : 'paginated')
  set('max-column-count', columnMode === 'double' ? '2' : '1')
  toggle('animated', !isScroll && pageAnimation === 'slide')
  set('gap', `${l.gap || 5}%`)
  set('max-inline-size', '800px')
  toggle('margin', (l.headerFooterMargin || 0) > 0, `${l.headerFooterMargin}px`)
  applyVisualFilter(visualSettings)
  applyViewTheme(view, th)
}

function applyVisualFilter(v: any = {}) {
  document.getElementById('sireader-visual-filter')?.remove()
  const filters = [v.brightness !== 1 && `brightness(${v.brightness})`, v.contrast !== 1 && `contrast(${v.contrast})`, v.sepia > 0 && `sepia(${v.sepia})`, v.saturate !== 1 && `saturate(${v.saturate})`, v.invert && 'invert(1) hue-rotate(180deg)'].filter(Boolean)
  if (filters.length) Object.assign(document.head.appendChild(document.createElement('style')), { id: 'sireader-visual-filter', textContent: `foliate-view::part(filter){filter:${filters.join(' ')}}` })
}

function applyViewTheme(view: FoliateView, theme: any) {
  const bgStyle = theme.bgImg ? `url("${theme.bgImg}") center/cover no-repeat` : theme.bg
  Object.assign(view.style, { background: bgStyle, color: theme.color })
}

function applyCustomCSS(view: FoliateView, settings: ReaderSettings) {
  const { textSettings, paragraphSettings, layoutSettings, theme, customTheme } = settings || {}
  const t = textSettings || { fontFamily: 'inherit', fontSize: 16, letterSpacing: 0, customFont: { fontFamily: '', fontFile: '' } }
  const p = paragraphSettings || { lineHeight: 1.8, textIndent: 2, paragraphSpacing: 1 }
  const l = layoutSettings || { marginHorizontal: 40, marginVertical: 20 }
  const th = theme === 'custom' ? customTheme : (theme && PRESET_THEMES[theme]) || PRESET_THEMES.default
  const isCustomFont = t.fontFamily === 'custom' && t.customFont?.fontFamily
  const font = isCustomFont ? `"${t.customFont.fontFamily}", sans-serif` : (t.fontFamily || 'inherit')
  const fontFace = isCustomFont ? `@font-face{font-family:"${t.customFont.fontFamily}";src:url("${window.location.origin}/plugins/custom-fonts/${t.customFont.fontFile}")}` : ''
  const bgStyle = th.bgImg ? `background:url("${th.bgImg}") center/cover no-repeat` : `background:${th.bg}`
  const css = `@namespace epub "http://www.idpf.org/2007/ops";${fontFace}html{color-scheme:light dark}body{${bgStyle}!important;color:${th.color}!important;font-family:${font}!important;font-size:${t.fontSize || 16}px!important;letter-spacing:${t.letterSpacing || 0}em!important;padding:${l.marginVertical}px ${l.marginHorizontal}px!important}p,li,blockquote,dd{line-height:${p.lineHeight || 1.8}!important;text-align:start;text-indent:${p.textIndent || 2}em!important;margin-bottom:${p.paragraphSpacing || 1}em!important}[align="left"]{text-align:left!important}[align="right"]{text-align:right!important}[align="center"]{text-align:center!important}[align="justify"]{text-align:justify!important}pre{white-space:pre-wrap!important}`
  view.renderer?.setStyles?.(css)
}

function getCurrentLocation(view: FoliateView): Location | null {
  if (!view.renderer) return null

  try {
    const loc = view.renderer.location
    if (!loc) return null

    return {
      index: loc.index ?? 0,
      fraction: loc.fraction ?? 0,
      cfi: view.lastLocation?.cfi
    }
  } catch (e) {
    console.error('[FoliateView] Failed to get location:', e)
    return null
  }
}

function destroyView(view: FoliateView) {
  try {
    if (view.renderer?.destroy) view.renderer.destroy()
    view.remove()
  } catch (e) {
    console.error('[FoliateView] Destroy failed:', e)
  }
}

/**
 * Foliate Reader 主类
 */
export class FoliateReader {
  private view: FoliateView
  private container: HTMLElement
  private settings: ReaderSettings
  private bookUrl: string
  private plugin: Plugin

  // 统一标记管理器
  public marks: MarkManager

  // 事件监听器
  private eventListeners = new Map<string, Set<Function>>()

  constructor(options: ReaderOptions) {
    this.container = options.container
    this.settings = options.settings
    this.bookUrl = options.bookUrl
    this.plugin = options.plugin

    // 创建 View
    this.view = createFoliateView(this.container)

    // 初始化统一标记管理器
    this.marks = new MarkManager(this.view, this.bookUrl, this.plugin)

    // 设置事件监听
    this.setupEventListeners()

    // 监听设置变化
    this.listenToSettingsChanges()
  }

  /**
   * 打开书籍
   */
  async open(file: File | string | any) {
    await this.view.open(file)
    this.applySettings()
    await this.marks.init()
    this.emit('loaded', { book: this.view.book })
  }

  /**
   * 应用设置
   */
  private applySettings() {
    configureView(this.view, this.settings)
    applyCustomCSS(this.view, this.settings)
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners() {
    ['relocate', 'load', 'external-link', 'link'].forEach(event => {
      this.view.addEventListener(event, ((e: CustomEvent) => this.emit(event, e.detail)) as EventListener)
    })
  }

  /**
   * 监听设置变化
   */
  private listenToSettingsChanges() {
    window.addEventListener('sireaderSettingsUpdated', ((e: CustomEvent) => this.updateSettings(e.detail)) as EventListener)
  }

  /**
   * 导航方法
   */
  private check = () => !!this.view.renderer || (console.warn('[Reader] Renderer not ready'), false)
  async goTo(target: string | number | Location) { this.check() && await this.view.goTo(target) }
  async goLeft() { this.check() && await this.view.goLeft() }
  async goRight() { this.check() && await this.view.goRight() }
  async prev() { this.check() && await this.view.prev() }
  async next() { this.check() && await this.view.next() }
  async goToFraction(fraction: number) { this.check() && await this.view.goToFraction(fraction) }

  /**
   * 位置和进度
   */
  getLocation = () => getCurrentLocation(this.view)
  getProgress = () => this.view.lastLocation

  /**
   * 历史导航
   */
  canGoBack = () => this.view.history?.canGoBack ?? false
  canGoForward = () => this.view.history?.canGoForward ?? false
  goBack = () => this.view.history?.back()
  goForward = () => this.view.history?.forward()

  /**
   * 搜索
   */
  async *search(query: string, options?: any) {
    if ((this.view as any).search) yield* (this.view as any).search({ query, ...options })
  }

  clearSearch = () => (this.view as any).clearSearch?.()

  /**
   * 选择文本
   */
  async select(target: string | Location) {
    if ((this.view as any).select) await (this.view as any).select(target)
  }

  deselect = () => (this.view as any).deselect?.()

  /**
   * 获取选中的文本
   */
  getSelectedText(): { text: string; range: Range } | null {
    try {
      const contents = this.view.renderer?.getContents?.()
      if (!contents) return null
      for (const { doc } of contents) {
        const sel = doc.defaultView?.getSelection()
        if (sel && !sel.isCollapsed) return { text: sel.toString(), range: sel.getRangeAt(0) }
      }
    } catch (e) {
      console.error('[Reader] Selection error:', e)
    }
    return null
  }

  /**
   * 事件系统
   */
  on(event: string, cb: Function) { (this.eventListeners.has(event) || this.eventListeners.set(event, new Set()), this.eventListeners.get(event)!.add(cb)) }
  off = (event: string, cb: Function) => this.eventListeners.get(event)?.delete(cb)
  private emit(event: string, data?: any) { this.eventListeners.get(event)?.forEach(cb => { try { cb(data) } catch (e) { console.error(`[Reader] Event error (${event}):`, e) } }) }

  /**
   * 设置和信息
   */
  updateSettings(settings: ReaderSettings) { this.settings = settings; this.applySettings() }
  getBook = () => this.view.book
  getView = () => this.view

  /**
   * 销毁
   */
  async destroy() { await this.marks.destroy(); this.eventListeners.clear(); destroyView(this.view) }
}

/**
 * 创建 Reader 实例
 */
export function createReader(options: ReaderOptions): FoliateReader {
  return new FoliateReader(options)
}

// ===== 导出工具函数 =====

export { createFoliateView, configureView, applyCustomCSS, getCurrentLocation, destroyView }

// ===== TXT/在线书籍支持 =====

export async function loadTxtBook(view: FoliateView, content: string, chapters: TxtChapter[], bookInfo?: any, settings?: ReaderSettings) {
  const chaps = chapters.length ? chapters : splitTxtContent(content)
  
  const loadChapter = async (ch: TxtChapter) => {
    let html = ''
    if (ch.url && bookInfo) {
      try {
        const text = await bookSourceManager.getChapterContent(bookInfo.sourceUrl || bookInfo.origin, ch.url)
        html = toHtml(ch.title, text)
      } catch { html = toHtml(ch.title, '加载失败') }
    } else {
      html = toHtml(ch.title, ch.content || '')
    }
    return URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  }
  
  const book = {
    sections: chaps.map((ch, idx) => ({ load: () => loadChapter(ch), id: `chapter-${idx}`, linear: 'yes' })),
    toc: chaps.map((ch, i) => ({ label: ch.title, href: `#chapter-${i}`, level: 0 })),
    resolveHref: (href: string) => {
      const match = href.match(/#chapter-(\d+)/)
      return match ? { index: parseInt(match[1]), anchor: () => null } : null
    },
    resolveCFI: () => null
  }
  
  await view.open(book)
  if (settings) {
    configureView(view, settings)
    applyCustomCSS(view, settings)
  }
  
  const updateLocation = (index: number, fraction = 0) => {
    const title = chaps[index]?.title || ''
    view.lastLocation = { section: index, fraction, label: title, tocItem: { label: title, href: `#chapter-${index}` }, index }
    return view.lastLocation
  }
  
  updateLocation(0, 0)
  
  view.addEventListener('relocate', ((e: CustomEvent) => {
    const detail = e.detail || {}
    let index = detail.index ?? detail.section ?? 0
    if (!index && detail.cfi) {
      const match = detail.cfi.match(/\/6\/(\d+)/)
      if (match) index = Math.floor((parseInt(match[1]) - 2) / 2)
    }
    updateLocation(index, detail.fraction || 0)
    
    // 绑定TXT文档事件和渲染标注
    setTimeout(() => {
      const contents = (view as any).renderer?.getContents?.()
      const marks = (view as any).marks
      if (contents && marks) {
        for (const { doc } of contents) if (doc) marks.bindTxtDocEvents(doc, index)
      }
    }, 100)
  }) as EventListener)
  
  ;(view as any).getLocation = () => {
    const renderer = view.renderer as any
    return renderer?.index !== undefined ? updateLocation(renderer.index, renderer.fraction || 0) : (view.lastLocation || updateLocation(0, 0))
  }
}

function splitTxtContent(content: string): TxtChapter[] {
  const lines = content.split('\n')
  const chapters: TxtChapter[] = []
  let current: { title: string; content: string[] } | null = null
  let idx = 0
  const chapterRegex = /^(第[零一二三四五六七八九十百千万\d]+[章节回集部]|Chapter\s+\d+|\d+\.|【.*?】)/i
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (chapterRegex.test(trimmed)) {
      if (current) chapters.push({ index: idx++, title: current.title, content: current.content.join('\n') })
      current = { title: trimmed || `第 ${idx + 1} 章`, content: [] }
    } else if (trimmed) {
      if (!current) current = { title: '开始', content: [] }
      current.content.push(trimmed)
    }
  }
  
  if (current) chapters.push({ index: idx, title: current.title, content: current.content.join('\n') })
  return chapters.length ? chapters : [{ index: 0, title: '全文', content }]
}

function toHtml(title: string, content: string): string {
  const escape = (text: string) => { const div = document.createElement('div'); div.textContent = text; return div.innerHTML }
  const paragraphs = escape(content).split(/\n+/).map(p => p.trim()).filter(Boolean).map(p => `<p>${p}</p>`).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{max-width:800px;margin:0 auto;padding:2em;font-size:18px;line-height:1.8}h1{text-align:center;margin-bottom:2em}p{text-indent:2em;margin:1em 0}</style></head><body><h1>${escape(title)}</h1>${paragraphs}</body></html>`
}
