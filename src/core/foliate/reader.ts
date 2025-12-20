/**
 * Foliate Reader - 统一阅读器
 * 整合 View 创建、配置、TXT 加载、标记管理等所有功能
 */

import type { Plugin } from 'siyuan'
import type { FoliateView, Location } from './types'
import type { ReaderSettings } from '@/composables/useSetting'
import { PRESET_THEMES } from '@/composables/useSetting'
import { bookSourceManager } from '@/core/book'
import { createTooltip, showTooltip, hideTooltip } from '@/core/MarkManager'
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
  const { viewMode = 'single', pageAnimation = 'slide', layoutSettings, visualSettings, theme, customTheme } = settings || {}
  const l = layoutSettings || { gap: 5, headerFooterMargin: 0 }
  const th = theme === 'custom' ? customTheme : (theme && PRESET_THEMES[theme]) || PRESET_THEMES.default
  const isScroll = viewMode === 'scroll'
  const set = (n: string, val: string) => r.setAttribute(n, val)
  const toggle = (n: string, cond: boolean, val = '') => cond ? set(n, val) : r.removeAttribute(n)
  set('flow', isScroll ? 'scrolled' : 'paginated')
  set('max-column-count', viewMode === 'double' ? '2' : '1')
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
  try{view.remove()}catch{}
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

  // 统一标记管理器（从外部设置）
  public marks: any

  // 事件监听器
  private eventListeners = new Map<string, Set<Function>>()

  constructor(options: ReaderOptions) {
    this.container = options.container
    this.settings = options.settings
    this.bookUrl = options.bookUrl
    this.plugin = options.plugin

    // 创建 View
    this.view = createFoliateView(this.container)

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
    if (this.marks) await this.marks.init()
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
    ['relocate', 'load', 'external-link'].forEach(event => {
      this.view.addEventListener(event, ((e: CustomEvent) => this.emit(event, e.detail)) as EventListener)
    })
    
    // 脚注处理
    this.view.addEventListener('link',((e:CustomEvent)=>{
      const{a,href}=e.detail
      if(!a||!href){this.emit('link',e.detail);return}
      const types=new Set(a?.getAttributeNS?.('http://www.idpf.org/2007/ops','type')?.split(' '))
      const roles=new Set(a?.getAttribute?.('role')?.split(' '))
      const isSuper=(el:HTMLElement)=>{const s=getComputedStyle(el);return el.matches('sup')||s.verticalAlign==='super'||s.verticalAlign==='top'||/^\d/.test(s.verticalAlign)}
      const isRef=['doc-noteref','doc-biblioref','doc-glossref'].some(r=>roles.has(r))||['noteref','biblioref','glossref'].some(t=>types.has(t))||!types.has('backlink')&&!roles.has('doc-backlink')&&(isSuper(a)||a.children.length===1&&isSuper(a.children[0])||isSuper(a.parentElement))
      isRef?(e.preventDefault(),this.showFootnote(a,href).catch(()=>{})):this.emit('link',e.detail)
    })as EventListener)
  }

  private async showFootnote(a:HTMLElement,href:string){
    try{
      const target=await this.view.book.resolveHref(href),section=this.view.book.sections[target?.index]
      if(!section)return
      const doc=new DOMParser().parseFromString(await(await fetch(await section.load())).text(),'text/html'),el=target.anchor(doc)
      if(!el)return
      
      // 提取脚注信息
      const types=new Set(el?.getAttributeNS?.('http://www.idpf.org/2007/ops','type')?.split(' '))
      const roles=new Set(el?.getAttribute?.('role')?.split(' '))
      const noteType=roles.has('doc-endnote')||types.has('endnote')||types.has('rearnote')?'尾注':roles.has('doc-footnote')||types.has('footnote')?'脚注':roles.has('doc-biblioentry')||types.has('biblioentry')?'参考文献':roles.has('definition')||types.has('glossdef')?'术语':types.has('note')?'注释':'注'
      const noteId=el.id||el.getAttribute('id')||''
      
      const range=el.startContainer?el:doc.createRange()
      if(!el.startContainer)el.matches('li, aside')?range.selectNodeContents(el):range.selectNode(el)
      const div=document.createElement('div')
      div.appendChild(range.cloneContents())
      
      let tooltip=document.querySelector('[data-footnote-tooltip]') as HTMLDivElement
      if(!tooltip){
        tooltip=document.createElement('div')
        tooltip.setAttribute('data-footnote-tooltip','true')
        tooltip.style.cssText='position:fixed;display:none;width:340px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12),0 4px 8px rgba(0,0,0,.08),0 0 1px rgba(0,0,0,.1);z-index:99999;pointer-events:auto;overflow:hidden;backdrop-filter:blur(10px);transform:translateY(0);transition:transform .2s cubic-bezier(.4,0,.2,1),opacity .2s cubic-bezier(.4,0,.2,1)'
        document.body.appendChild(tooltip)
      }
      
      const content=`<div style="padding:14px;font-size:13px;line-height:1.7;color:var(--b3-theme-on-surface);max-height:300px;overflow-y:auto;word-wrap:break-word;word-break:break-word;background:var(--b3-theme-surface)">${div.innerHTML}</div>`
      tooltip.innerHTML=createTooltip({icon:'#iconMark',iconColor:'#ef4444',title:noteType,content,id:noteId?`#${noteId}`:undefined})
      
      const rect=a.getBoundingClientRect(),iframe=a.ownerDocument.defaultView?.frameElement as HTMLIFrameElement,ir=iframe?.getBoundingClientRect()
      const x=(ir?.left||0)+rect.left,y=(ir?.top||0)+rect.bottom+8
      let timer:any
      showTooltip(tooltip,x,y)
      a.onmouseenter=()=>{clearTimeout(timer);showTooltip(tooltip,x,y)}
      a.onmouseleave=()=>{timer=setTimeout(()=>hideTooltip(tooltip),100)}
      tooltip.onmouseenter=()=>clearTimeout(timer)
      tooltip.onmouseleave=()=>hideTooltip(tooltip)
    }catch(e){console.error('[Footnote]',e)}
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
  async destroy() { await this.marks?.destroy(); this.eventListeners.clear(); destroyView(this.view) }
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

// TXT 编码检测和解码
async function detectAndDecodeText(buffer:ArrayBuffer):Promise<string>{
  const bytes=new Uint8Array(buffer)
  
  // 检测 UTF-8 BOM
  if(bytes.length>=3&&bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF){
    return new TextDecoder('utf-8').decode(bytes.slice(3))
  }
  
  // 检测 UTF-16 BOM
  if(bytes.length>=2){
    if(bytes[0]===0xFF&&bytes[1]===0xFE)return new TextDecoder('utf-16le').decode(bytes.slice(2))
    if(bytes[0]===0xFE&&bytes[1]===0xFF)return new TextDecoder('utf-16be').decode(bytes.slice(2))
  }
  
  // 尝试 UTF-8 解码
  try{
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)
    if(!text.includes('�'))return text
  }catch{}
  
  // 降级到 GBK
  try{
    return new TextDecoder('gbk').decode(bytes)
  }catch{
    return new TextDecoder('utf-8').decode(bytes)
  }
}

export async function loadTxtBook(view: FoliateView, content: string|ArrayBuffer, chapters: TxtChapter[], bookInfo?: any, settings?: ReaderSettings) {
  // 处理编码
  let text=''
  if(content instanceof ArrayBuffer){
    text=await detectAndDecodeText(content)
  }else{
    text=content
  }
  
  const chaps = chapters.length ? chapters : splitTxtContent(text)
  
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
    const totalChapters=chaps.length
    const overallFraction=totalChapters>0?(index+fraction)/totalChapters:0
    view.lastLocation = { section: index, fraction: overallFraction, label: title, tocItem: { label: title, href: `#chapter-${index}` }, index }
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
      try{
        const contents = (view as any).renderer?.getContents?.()
        const marks = (view as any).marks
        if (contents && marks && typeof marks.bindTxtDocEvents === 'function') {
          for (const { doc } of contents) {
            if (doc && doc.body) marks.bindTxtDocEvents(doc, index)
          }
        }
      }catch(e){console.error('[TXT] bindTxtDocEvents:',e)}
    }, 200)
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
