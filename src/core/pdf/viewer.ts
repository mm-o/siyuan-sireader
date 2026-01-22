/**
 * PDF 渲染器 - 基于 PDF.js（懒加载优化）
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PDFViewerOptions, PDFLocation } from './types'
import { markRaw } from 'vue'
import { PRESET_THEMES } from '@/composables/useSetting'

// 动态加载思源内置的 PDF.js
let pdfjsLib: any = null
async function loadPDFJS() {
  if (pdfjsLib) return pdfjsLib
  pdfjsLib = await import('/stage/protyle/js/pdf/pdf.min.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/stage/protyle/js/pdf/pdf.worker.min.mjs'
  return pdfjsLib
}

// 解析 CSS 变量为实际颜色值
const resolveColor = (c: string) => c.startsWith('var(') ? getComputedStyle(document.documentElement).getPropertyValue(c.slice(4, -1)).trim() : c
const resolveTheme = (theme: any) => ({ ...theme, bg: resolveColor(theme.bg), color: resolveColor(theme.color) })
const watchTheme = (callback: () => void) => new MutationObserver(() => requestAnimationFrame(() => requestAnimationFrame(callback))).observe(document.documentElement, { attributeFilter: ['data-theme-mode', 'class'] })
const invertColor = (hex: string) => '#' + hex.replace('#', '').match(/.{2}/g)!.map(x => (255 - parseInt(x, 16)).toString(16).padStart(2, '0')).join('')
const isDarkBg = (bg: string) => bg && parseInt(bg.replace('#', ''), 16) < 0x808080

export class PDFViewer {
  private pdf: PDFDocumentProxy | null = null
  private container: HTMLElement
  private scale: number
  private rotation = 0
  private viewMode: 'single' | 'double' | 'scroll' = 'scroll'
  private pages: Map<number, any>
  private rendered = new Set<number>()
  private current = 1
  private onChange?: (page: number) => void
  private observer?: IntersectionObserver
  private renderQueue: number[] = []
  private rendering = false
  private themeSettings: any = null
  private themeObserver?: MutationObserver

  constructor(opt: PDFViewerOptions) {
    this.container = opt.container
    this.scale = opt.scale || 1.0
    this.onChange = opt.onPageChange
    this.pages = markRaw(new Map())
  }

  // 应用主题
  applyTheme(settings: any) {
    this.themeSettings = settings
    const th = resolveTheme(settings.theme === 'custom' ? settings.customTheme : PRESET_THEMES[settings.theme] || PRESET_THEMES.default)
    if (!th) return
    const s = this.container.style, img = th.bgImg, fixUrl = (u: string) => u.startsWith('http') || u.startsWith('/') ? u : `/${u}`
    Object.assign(s, { color: th.color, backgroundColor: img ? 'transparent' : th.bg, backgroundImage: img ? `url("${fixUrl(img)}")` : '', backgroundSize: img ? 'cover' : '', backgroundPosition: img ? 'center' : '', backgroundRepeat: img ? 'no-repeat' : '' })
    s.setProperty('--pdf-page-bg', th.bg)
    const { visualSettings: v = {} } = settings
    const filters = [v.brightness !== 1 && `brightness(${v.brightness})`, v.contrast !== 1 && `contrast(${v.contrast})`, v.sepia > 0 && `sepia(${v.sepia})`, v.saturate !== 1 && `saturate(${v.saturate})`, (v.invert || isDarkBg(th.bg)) && 'invert(1) hue-rotate(180deg)'].filter(Boolean).join(' ')
    s.setProperty('--pdf-canvas-filter', filters || 'none')
    this.container.querySelectorAll('.pdf-page').forEach((p: Element) => {
      const el = p as HTMLElement
      el.style.background = th.bg
      const canvas = el.querySelector('canvas')
      if (canvas) canvas.style.filter = filters || 'none'
    })
    if (settings.viewMode) this.viewMode = settings.viewMode
    settings.theme === 'auto' && !this.themeObserver && (this.themeObserver = watchTheme(() => this.updateTheme(settings)) as any)
  }

  async open(src: string | ArrayBuffer) {
    const pdfjs = await loadPDFJS()
    this.pdf = markRaw(await pdfjs.getDocument({
      data: src,
      cMapUrl: '/stage/protyle/js/pdf/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/stage/protyle/js/pdf/standard_fonts/',
      useSystemFonts: false,
      disableFontFace: false,
      useWorkerFetch: true,
      isEvalSupported: false,
      maxImageSize: 16777216
    }).promise) as any
    this.pages.set(1, markRaw(await this.pdf.getPage(1)))
    await this.fitWidth()
    this.setupScroll()
  }

  private async createPlaceholders() {
    if (!this.pdf) return
    const n = this.pdf.numPages
    this.container.innerHTML = ''
    const isD = this.viewMode === 'double', isS = this.viewMode === 'single'
    Object.assign(this.container.style, isD ? { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '20px' } : { display: 'block' })
    const frag = document.createDocumentFragment()
    const firstPage = this.pages.get(1) || await this.pdf.getPage(1)
    const defaultVp = firstPage.getViewport({ scale: this.scale, rotation: this.rotation })
    for (let i = 1; i <= n; i++) {
      const d = document.createElement('div')
      d.className = 'pdf-page'
      d.dataset.page = String(i)
      d.style.cssText = `position:relative;margin:${isS ? '0 auto' : isD ? '0' : '20px auto'};width:${defaultVp.width}px;height:${defaultVp.height}px;box-shadow:0 2px 8px #0003;background:var(--pdf-page-bg,#fff)${isD ? ';flex-shrink:0' : ''}`
      frag.appendChild(d)
      if (isS && i < n) { const s = document.createElement('div'); s.style.height = '100vh'; frag.appendChild(s) }
    }
    this.container.appendChild(frag)
  }

  private setupLazyLoad() {
    this.observer = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const n = +(e.target as HTMLElement).dataset.page!; n && !this.rendered.has(n) && this.queueRender(n) } }), { rootMargin: '300px' })
    this.container.querySelectorAll('.pdf-page').forEach(el => this.observer!.observe(el))
  }

  private queueRender(n: number) { if (!this.renderQueue.includes(n)) this.renderQueue.push(n), this.processQueue() }
  private async processQueue() { if (this.rendering || !this.renderQueue.length) return; this.rendering = true; await this.renderPage(this.renderQueue.shift()!); this.rendering = false; this.processQueue() }

  private async renderPage(n: number) {
    const w = this.container.querySelector(`[data-page="${n}"]`) as HTMLElement
    if (!w || this.rendered.has(n)) return
    this.rendered.add(n)
    let p = this.pages.get(n)
    if (!p && this.pdf) { p = markRaw(await this.pdf.getPage(n)); this.pages.set(n, p) }
    if (!p) return
    const pdfjs = await loadPDFJS()
    const bg = this.container.style.getPropertyValue('--pdf-page-bg') || '#fff'
    w.style.background = bg
    const vp = p.getViewport({ scale: this.scale, rotation: this.rotation })
    const dpr = window.devicePixelRatio || 1
    const dark = isDarkBg(bg)
    const canvasBg = dark ? invertColor(bg) : bg
    const { visualSettings: v = {} } = this.themeSettings || {}
    const filters = [v.brightness !== 1 && `brightness(${v.brightness})`, v.contrast !== 1 && `contrast(${v.contrast})`, v.sepia > 0 && `sepia(${v.sepia})`, v.saturate !== 1 && `saturate(${v.saturate})`, (v.invert || dark) && 'invert(1) hue-rotate(180deg)'].filter(Boolean).join(' ')
    try {
      const c = document.createElement('canvas'), ctx = c.getContext('2d', { alpha: false })!
      c.width = Math.floor(vp.width * dpr)
      c.height = Math.floor(vp.height * dpr)
      c.style.cssText = `width:${vp.width}px;height:${vp.height}px${filters ? `;filter:${filters}` : ''}`
      await p.render({ canvasContext: ctx, viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0], background: canvasBg, enableWebGL: true }).promise
      w.appendChild(c)
    } catch (e: any) { console.error(`[PDF] 渲染失败 ${n}:`, e); w.style.background = '#fee'; w.innerHTML = `<div style="padding:20px;color:#c00">渲染失败</div>`; return }
    // 文本层（智能合并）
    requestIdleCallback(() => {
      const d = document.createElement('div')
      d.className = 'textLayer'
      d.style.cssText = 'position:absolute;inset:0;line-height:1'
      w.appendChild(d)
      p.getTextContent().then((tc: any) => {
        const vp = p.getViewport({ scale: this.scale, rotation: this.rotation })
        for (let i = 0, its = tc.items; i < its.length;) {
          const it = its[i]
          if (!it.str) { i++; continue }
          const t = pdfjs.Util.transform(vp.transform, it.transform), h = Math.hypot(t[2], t[3]), a = Math.atan2(t[1], t[0])
          let txt = it.str, x = t[4] + it.width * h, j = i + 1
          for (; j < its.length; j++) {
            const n = its[j]
            if (!n.str) continue
            const nt = pdfjs.Util.transform(vp.transform, n.transform), nh = Math.hypot(nt[2], nt[3])
            if (Math.abs(nt[5] - t[5]) > h * .3 || Math.abs(Math.atan2(nt[1], nt[0]) - a) > .01 || Math.abs(nh - h) > h * .1 || nt[4] - x > h * 2) break
            txt += n.str
            x = nt[4] + n.width * nh
          }
          d.innerHTML += `<span style="position:absolute;left:${t[4]}px;top:${t[5]}px;font-size:${h}px;transform:rotate(${a}rad)translateY(-.8em);transform-origin:0 0;white-space:pre;color:transparent;cursor:text">${txt}</span>`
          i = j
        }
      })
    })
    // 延迟渲染链接层和墨迹层
    requestIdleCallback(async () => {
      const ann = document.createElement('div')
      ann.className = 'pdf-annotation-layer'
      ann.style.cssText = 'position:absolute;inset:0;pointer-events:none'
      w.appendChild(ann)
      await this.renderLinks(n, w, p, vp)
      this.createInkLayer(n, w, vp)
      // 触发canvas层创建完成事件
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('pdf:layer-ready', { detail: { page: n } }))
      })
    })
  }

  private createInkLayer(pageNum: number, pageEl: HTMLElement, vp: any) {
    const inkCanvas = document.createElement('canvas')
    inkCanvas.className = 'pdf-ink-layer'
    inkCanvas.dataset.page = String(pageNum)
    inkCanvas.width = vp.width
    inkCanvas.height = vp.height
    inkCanvas.style.cssText = `position:absolute;inset:0;width:${vp.width}px;height:${vp.height}px;z-index:10;pointer-events:none`
    pageEl.appendChild(inkCanvas)

    const shapeCanvas = document.createElement('canvas')
    shapeCanvas.className = 'pdf-shape-layer'
    shapeCanvas.dataset.page = String(pageNum)
    shapeCanvas.width = vp.width
    shapeCanvas.height = vp.height
    shapeCanvas.style.cssText = `position:absolute;inset:0;width:${vp.width}px;height:${vp.height}px;z-index:11;pointer-events:none`
    pageEl.appendChild(shapeCanvas)
  }

  private async renderLinks(_n: number, w: HTMLElement, p: any, vp: any) {
    try {
      const pdfjs = await loadPDFJS()
      const anns = await p.getAnnotations()
      const layer = document.createElement('div')
      layer.className = 'annotationLayer'
      layer.style.cssText = 'position:absolute;inset:0;z-index:10;pointer-events:none'

      for (const a of anns) {
        if (a.subtype !== 'Link') continue
        const link = document.createElement('a')
        const [x1, y1, x2, y2] = pdfjs.Util.normalizeRect(a.rect)
        const [p1, p2] = [vp.convertToViewportPoint(x1, y1), vp.convertToViewportPoint(x2, y2)]
        link.style.cssText = `position:absolute;left:${Math.min(p1[0], p2[0])}px;top:${Math.min(p1[1], p2[1])}px;width:${Math.abs(p2[0] - p1[0])}px;height:${Math.abs(p2[1] - p1[1])}px;cursor:pointer;pointer-events:auto`
        if (a.url) { link.href = a.url; link.target = '_blank' }
        else if (a.dest) {
          link.href = '#'
          link.onclick = async (e) => {
            e.preventDefault()
            const d = typeof a.dest === 'string' ? await this.pdf!.getDestination(a.dest) : a.dest
            if (d?.[0]) { const i = await this.pdf!.getPageIndex(d[0]); this.goToPage(i + 1) }
          }
        }
        layer.appendChild(link)
      }
      w.appendChild(layer)
    } catch {}
  }

  private setupScroll() { let t: any; this.container.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const p = this.getCurrentPage(); if (p !== this.current) { this.current = p; this.onChange?.(p); this.cleanupDistantPages() } }, 100) }) }
  private cleanupDistantPages() { 
    this.rendered.forEach(n => { 
      if (Math.abs(n - this.current) > 5) { 
        const el = this.container.querySelector(`[data-page="${n}"]`) as HTMLElement
        if (el) {
          el.innerHTML = ''
          el.style.background = this.container.style.getPropertyValue('--pdf-page-bg') || '#fff'
        }
        this.rendered.delete(n) 
      } 
    }) 
  }

  getCurrentPage() { const s = this.container.scrollTop + this.container.clientHeight / 2, ps = this.container.querySelectorAll('.pdf-page'); for (let i = 0; i < ps.length; i++) { const el = ps[i] as HTMLElement; if (el.offsetTop + el.offsetHeight > s) return i + 1 } return this.pdf?.numPages || 1 }
  getLocation(): PDFLocation { const p = this.getCurrentPage(), t = this.pdf?.numPages || 1; return { page: p, total: t, fraction: (p - 1) / t, scrollTop: this.container.scrollTop } }
  goToPage(p: number) { const el = this.container.querySelector(`[data-page="${p}"]`) as HTMLElement; if (!el) return; this.container.scrollTop = el.offsetTop; this.current = p; this.onChange?.(p); this.renderQueue = [p, ...Array.from({ length: 3 }, (_, i) => [p - 1 + i, p + 1 + i]).flat().filter(i => i > 0 && i <= this.pdf?.numPages && i !== p && !this.rendered.has(i))]; this.processQueue() }

  async setScale(s: number) { this.scale = Math.max(.25, s); this.rendered.clear(); await this.createPlaceholders(); this.setupLazyLoad() }
  async fitWidth() { const p = this.pages.get(1); if (p) await this.setScale((this.container.clientWidth - 40) / p.getViewport({ scale: 1 }).width) }
  async fitPage() { const p = this.pages.get(1); if (!p) return; const vp = p.getViewport({ scale: 1 }), w = (this.container.clientWidth - 40) / vp.width, h = (this.container.clientHeight - 40) / vp.height; await this.setScale(Math.min(w, h)) }
  async setRotation(d: 0 | 90 | 180 | 270) { this.rotation = d; this.rendered.clear(); await this.createPlaceholders(); this.setupLazyLoad() }
  async setViewMode(m: 'single' | 'double' | 'scroll') { this.viewMode = m; this.rendered.clear(); await this.createPlaceholders(); this.setupLazyLoad(); m === 'double' && await this.fitPage() }

  getScale = () => this.scale
  getRotation = () => this.rotation
  getViewMode = () => this.viewMode
  getPDF = () => this.pdf
  getPages = () => this.pages
  getPageCount = () => this.pdf?.numPages || 0

  // 更新主题并重新渲染
  async updateTheme(settings: any) {
    const old = this.viewMode
    this.applyTheme(settings)
    if (old !== this.viewMode) return await this.setViewMode(this.viewMode)
    const pages = Array.from(this.rendered)
    this.rendered.clear()
    for (const n of pages) { const w = this.container.querySelector(`[data-page="${n}"]`) as HTMLElement; w && (w.innerHTML = ''); await this.renderPage(n) }
  }

  async getThumbnail(n: number, s = .2) { const p = this.pages.get(n); if (!p) return ''; const vp = p.getViewport({ scale: s }), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await p.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c }).promise; return c.toDataURL() }
  async getOutline() { if (!this.pdf) return []; try { const ol = await this.pdf.getOutline() || [], flat = (its: any[], lv = 0): any[] => its.flatMap(it => [{ title: it.title, dest: it.dest, level: lv }, ...(it.items ? flat(it.items, lv + 1) : [])]); return Promise.all(flat(ol).map(async it => { let pn = 1; if (it.dest) try { const d = typeof it.dest === 'string' ? await this.pdf!.getDestination(it.dest) : it.dest; if (d) pn = await this.pdf!.getPageIndex(d[0]) + 1 } catch {}; return { title: it.title, pageNumber: pn, level: it.level } })) } catch { return [] } }
  destroy() { this.observer?.disconnect(); this.themeObserver?.disconnect(); this.pdf?.destroy(); this.pages.clear(); this.rendered.clear(); this.container.innerHTML = '' }
  async createView() { const n = this.getPageCount(), pg = () => this.getCurrentPage(), nav = (d: number) => this.goToPage(pg() + d), thumbs: string[] = []; return { viewer: this, isPdf: true, pageCount: n, getThumbnail: async (p: number) => thumbs[p - 1] || (thumbs[p - 1] = await this.getThumbnail(p).catch(() => '')), book: { toc: (await this.getOutline()).map(it => ({ label: it.title, href: `#page-${it.pageNumber}`, pageNumber: it.pageNumber, level: it.level })) }, goTo: (t: any) => this.goToPage(typeof t === 'number' ? t : t?.pageNumber || +(String(t).replace('#page-', ''))), lastLocation: { page: 1, total: n }, nav: { prev: () => nav(-1), next: () => nav(1), goLeft: () => nav(-1), goRight: () => nav(1) } } }
}
