/**
 * PDF 标注管理器
 */

import type { Plugin } from 'siyuan'
import type { PDFAnnotation } from './types'
import type { HighlightColor } from '../foliate/types'
import { COLORS } from '../foliate/mark'

export class PDFAnnotator {
  private annotations: PDFAnnotation[] = []
  private plugin: Plugin
  private bookUrl: string
  private bookName: string
  private inkData: any[] = []
  private shapeData: any[] = []
  private bookmarks: any[] = []
  private currentPage: number = 1
  private outline: any[] = []
  private viewer: any = null
  private onAnnotationClick?: (ann: PDFAnnotation) => void

  constructor(plugin: Plugin, bookUrl: string, bookName: string, onAnnotationClick?: (ann: PDFAnnotation) => void) {
    this.plugin = plugin
    this.bookUrl = bookUrl
    this.bookName = bookName
    this.onAnnotationClick = onAnnotationClick
  }
  
  setOutline(outline: any[]) {
    this.outline = outline
  }
  
  setViewer(viewer: any) {
    this.viewer = viewer
  }

  async init() {
    const data = await this.load()
    if (data.annotations) this.annotations = data.annotations
    if (data.inkAnnotations) this.inkData = data.inkAnnotations
    if (data.shapeAnnotations) this.shapeData = data.shapeAnnotations
    if (data.epubBookmarks) this.bookmarks = data.epubBookmarks
    if (data.durChapterIndex !== undefined) this.currentPage = data.durChapterIndex
  }

  private async load() {
    try {
      return await this.plugin.loadData(`books/${this.getFileName()}`) || {}
    } catch { return {} }
  }

  private async save() {
    try {
      const existing = await this.plugin.loadData(`books/${this.getFileName()}`) || {}
      await this.plugin.saveData(`books/${this.getFileName()}`, { 
        ...existing,
        annotations: this.annotations, 
        inkAnnotations: this.inkData,
        shapeAnnotations: this.shapeData,
        epubBookmarks: this.bookmarks,
        durChapterIndex: this.currentPage
      })
      window.dispatchEvent(new Event('sireader:marks-updated'))
    } catch (e) { console.error('[PDFAnnotator] Save:', e) }
  }

  private getFileName(): string {
    const hash = this.hash(this.bookUrl)
    const name = this.sanitizeName(this.bookName)
    return `${name}_${hash}.json`
  }

  private hash(url: string): string {
    let h = 0
    for (let i = 0; i < url.length; i++) h = (((h << 5) - h) + url.charCodeAt(i)) | 0
    return Math.abs(h).toString(36)
  }

  private sanitizeName(name: string): string {
    return (name || 'book')
      .replace(/[<>:"/\\|?*\x00-\x1f《》【】「」『』（）()[\]{}]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[._-]+/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 50) || 'book'
  }

  async addHighlight(page: number, rects: any[], text: string, color: HighlightColor, style: 'highlight' | 'underline' | 'outline' | 'squiggly' = 'highlight'): Promise<PDFAnnotation> {
    const ann: PDFAnnotation = {
      id: `pdf-h-${Date.now()}`,
      page,
      type: 'highlight',
      rects: rects.map(r => ({ x: r.left||r.x, y: r.top||r.y, w: r.width||r.w, h: r.height||r.h })),
      text: text.substring(0, 200),
      color,
      style,
      timestamp: Date.now()
    }
    this.annotations.push(ann)
    await this.save()
    this.render(ann)
    return ann
  }

  async addNote(page: number, rects: any[], text: string, note: string, color: HighlightColor, style: 'highlight' | 'underline' | 'outline' | 'squiggly' = 'highlight'): Promise<PDFAnnotation> {
    const ann: PDFAnnotation = {
      id: `pdf-n-${Date.now()}`,
      page,
      type: 'note',
      rects: rects.map(r => ({ x: r.left||r.x, y: r.top||r.y, w: r.width||r.w, h: r.height||r.h })),
      text: text.substring(0, 200),
      note,
      color,
      style,
      timestamp: Date.now()
    }
    this.annotations.push(ann)
    await this.save()
    this.render(ann)
    return ann
  }

  private render(ann: PDFAnnotation) {
    const layer = document.querySelector(`[data-page="${ann.page}"] .pdf-annotation-layer`)
    if (!layer) return
    const bg = COLORS.find(c => c.color === ann.color)?.bg || '#ffeb3b'
    const style = ann.style || 'highlight'
    ann.rects.forEach((rect, idx) => {
      const div = document.createElement('div')
      div.className = `pdf-highlight pdf-${style}`
      div.dataset.id = ann.id
      const baseStyle = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;pointer-events:auto;cursor:pointer;transition:opacity .2s`
      if (style === 'highlight') {
        div.style.cssText = `${baseStyle};background:${bg};opacity:0.3`
      } else if (style === 'underline') {
        div.style.cssText = `${baseStyle};border-bottom:2px solid ${bg};opacity:0.8`
      } else if (style === 'outline') {
        div.style.cssText = `${baseStyle};border:2px solid ${bg};opacity:0.8`
      } else if (style === 'squiggly') {
        div.style.cssText = `${baseStyle};border-bottom:2px wavy ${bg};opacity:0.8`
      }
      div.onmouseenter = () => div.style.opacity = '0.6'
      div.onmouseleave = () => div.style.opacity = style === 'highlight' ? '0.3' : '0.8'
      div.onclick = (e) => {
        e.stopPropagation()
        this.onAnnotationClick?.(ann)
      }
      layer.appendChild(div)
      
      // 添加笔记图标（仅在最后一个 rect 上）
      if (ann.note && idx === ann.rects.length - 1) {
        const isPurple = ann.color === 'purple'
        const icon = isPurple ? '🌐' : '📒'
        const themeColor = isPurple ? '#ab47bc' : '#2196f3'
        const marker = document.createElement('span')
        marker.setAttribute('data-note-marker', 'true')
        marker.textContent = icon
        marker.style.cssText = `position:absolute;left:${rect.x + rect.w + 3}px;top:${rect.y - 5}px;font-size:14px;cursor:pointer;user-select:none;opacity:0.85;transition:opacity .2s;pointer-events:auto;z-index:1`
        
        const tooltip = document.createElement('div')
        tooltip.setAttribute('data-note-tooltip', 'true')
        const cleanNote = ann.note.split('\n').map(l => l.trim()).filter(Boolean).join('\n')
        tooltip.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,.1)"><span style="font-size:18px">${icon}</span><span style="font-size:12px;font-weight:600;color:${themeColor};text-transform:uppercase;letter-spacing:.5px">${isPurple ? '词典' : '笔记'}</span></div><div style="font-size:14px;line-height:1.8;color:#333;white-space:pre-wrap;max-height:300px;overflow-y:auto">${cleanNote}</div>`
        tooltip.style.cssText = 'position:fixed;display:none;min-width:280px;max-width:420px;padding:16px;background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.12);z-index:99999;pointer-events:none;word-wrap:break-word'
        document.body.appendChild(tooltip)
        
        marker.onmouseenter = () => {
          marker.style.opacity = '1'
          const r = marker.getBoundingClientRect()
          const left = r.left
          const top = r.bottom + 5
          tooltip.style.display = 'block'
          tooltip.style.left = left + 'px'
          tooltip.style.top = top + 'px'
          requestAnimationFrame(() => {
            const tr = tooltip.getBoundingClientRect()
            if (tr.right > window.innerWidth) tooltip.style.left = (window.innerWidth - tr.width - 10) + 'px'
            if (tr.bottom > window.innerHeight) tooltip.style.top = (top - tr.height - r.height - 10) + 'px'
          })
        }
        marker.onmouseleave = () => {
          marker.style.opacity = '0.85'
          tooltip.style.display = 'none'
        }
        marker.onclick = (e) => {
          e.stopPropagation()
          this.onAnnotationClick?.(ann)
        }
        
        layer.appendChild(marker)
      }
    })
  }

  renderPage(page: number) {
    const layer = document.querySelector(`[data-page="${page}"] .pdf-annotation-layer`)
    if (!layer) return
    // 清除该页面的旧标注和笔记标记
    layer.querySelectorAll('[data-note-marker],[data-note-tooltip]').forEach(el => el.remove())
    layer.querySelectorAll('.pdf-highlight').forEach(el => el.remove())
    // 渲染该页面的所有标注
    this.annotations.filter(a => a.page === page).forEach(ann => this.render(ann))
  }

  renderAll() {
    // 清除所有旧标注
    document.querySelectorAll('[data-note-marker],[data-note-tooltip]').forEach(el => el.remove())
    document.querySelectorAll('.pdf-highlight').forEach(el => el.remove())
    // 渲染所有标注
    this.annotations.forEach(ann => this.render(ann))
  }

  async update(id: string, updates: Partial<PDFAnnotation>): Promise<boolean> {
    const ann = this.annotations.find(a => a.id === id)
    if (!ann) return false
    Object.assign(ann, updates, { timestamp: Date.now() })
    await this.save()
    // 重新渲染该页面
    this.renderPage(ann.page)
    window.dispatchEvent(new Event('sireader:marks-updated'))
    return true
  }

  async delete(id: string): Promise<boolean> {
    const idx = this.annotations.findIndex(a => a.id === id)
    if (idx === -1) return false
    this.annotations.splice(idx, 1)
    await this.save()
    document.querySelectorAll(`[data-id="${id}"]`).forEach(el => el.remove())
    return true
  }

  getAll = () => [...this.annotations]
  getByPage = (page: number) => this.annotations.filter(a => a.page === page)
  goTo = (ann: PDFAnnotation) => {
    if (this.viewer) {
      this.viewer.goToPage(ann.page)
    } else {
      document.querySelector(`[data-page="${ann.page}"]`)?.scrollIntoView({ behavior: 'smooth' })
    }
  }
  getData = () => ({ annotations: this.annotations, inkAnnotations: this.inkData, shapeAnnotations: this.shapeData })
  
  // 书签管理
  hasBookmark = () => this.bookmarks.some(b => b.page === this.currentPage)
  
  private getPageTitle(page: number): string {
    if (!this.outline.length) return `第 ${page} 页`
    // 找到当前页面或之前最近的大纲项
    let title = `第 ${page} 页`
    for (let i = this.outline.length - 1; i >= 0; i--) {
      if (this.outline[i].pageNumber <= page) {
        title = this.outline[i].title || this.outline[i].label || title
        break
      }
    }
    return title
  }
  
  toggleBookmark = (_cfi?: string, progress?: number, title?: string) => {
    const idx = this.bookmarks.findIndex(b => b.page === this.currentPage)
    if (idx >= 0) {
      this.bookmarks.splice(idx, 1)
      this.save()
      return false
    } else {
      const pageTitle = title || this.getPageTitle(this.currentPage)
      this.bookmarks.push({ 
        page: this.currentPage, 
        title: pageTitle, 
        time: Date.now(),
        progress: progress || this.currentPage / 100
      })
      this.save()
      return true
    }
  }
  
  getBookmarks = () => [...this.bookmarks]
  setCurrentPage = (page: number) => { this.currentPage = page }
  
  deleteBookmark = (key: string) => {
    const page = parseInt(key)
    const idx = isNaN(page) ? -1 : this.bookmarks.findIndex(b => b.page === page)
    if (idx >= 0) {
      this.bookmarks.splice(idx, 1)
      this.save()
      window.dispatchEvent(new Event('sireader:marks-updated'))
      return true
    }
    return false
  }
  
  // 进度保存
  async saveProgress(page: number) {
    this.currentPage = page
    await this.save()
  }
  
  async saveInk(inkAnnotations: any[]) { this.inkData = inkAnnotations; await this.save() }
  async saveShape(shapeAnnotations: any[]) { this.shapeData = shapeAnnotations; await this.save() }
  async updateShape(id: string, updates: any): Promise<boolean> {
    const shape = this.shapeData.find((s: any) => s.id === id)
    if (!shape) return false
    Object.assign(shape, updates)
    await this.save()
    return true
  }
  async deleteShape(id: string): Promise<boolean> {
    const idx = this.shapeData.findIndex((s: any) => s.id === id)
    if (idx === -1) return false
    this.shapeData.splice(idx, 1)
    await this.save()
    return true
  }
  async destroy() { await this.save(); this.annotations = []; this.inkData = []; this.shapeData = []; this.bookmarks = [] }
}

