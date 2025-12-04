// ========================================
// Reader Core - 统一阅读器核心
// 支持 EPUB, TXT, 在线书源等所有格式
// 极限精简，优雅完美
// ========================================

import type { Plugin } from 'siyuan'
import { openTab } from 'siyuan'
import { createApp } from 'vue/dist/vue.esm-bundler.js'
import * as API from '@/api'
import type { ReaderSettings } from '@/composables/useSetting'
import { bookSourceManager } from './book'
import { bookshelfManager } from './bookshelf'
import { useSetting } from '@/composables/useSetting'
import Reader from '@/components/Reader.vue'
import 'foliate-js/view.js'

export type ReaderFormat = 'auto' | 'epub' | 'txt' | 'fb2' | 'cbz' | 'mobi'

export interface ReaderLocation {
  section: number
  cfi?: string
  offset?: number
  page?: number  // TXT 分页模式的页码
  percentage?: number
  tocItem?: any
}

export interface ReaderSection {
  index: number
  title: string
  href?: string
  url?: string
}

// ===== 极简事件系统 =====
class EventEmitter {
  private events = new Map<string, Set<(d: any) => void>>()
  on(e: string, cb: (d: any) => void) { (this.events.get(e) || this.events.set(e, new Set()).get(e)!).add(cb) }
  emit(e: string, d?: any) { this.events.get(e)?.forEach(cb => cb(d)) }
  clear() { this.events.clear() }
}

// ===== TXT 渲染器 =====
class TxtRenderer extends EventEmitter {
  private container: HTMLElement
  private settings: ReaderSettings
  private view: any = null
  private chapters: ReaderSection[] = []
  private bookInfo: any
  
  constructor(container: HTMLElement, settings: ReaderSettings) {
    super()
    this.container = container
    this.settings = settings
  }
  
  async load(_content: string, chapters?: ReaderSection[]) {
    this.chapters = chapters || []
    this.bookInfo = (this.container as any).__bookInfo
    
    // 创建foliate-view
    this.view = document.createElement('foliate-view')
    this.view.style.cssText = 'width:100%;height:100%'
    this.view.setAttribute('persist', 'false')
    this.container.appendChild(this.view)
    
    // 监听位置变化
    this.view.addEventListener('relocate', (e: any) => {
      const { index = 0, fraction = 0 } = e.detail || {}
      this.emit('relocate', {
        section: index,
        page: undefined,
        percentage: (index + fraction) / this.chapters.length
      })
    })
  }
  
  // HTML转义和生成
  private esc = (t: string) => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML }
  private toHtml = (title: string, content: string) => 
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{max-width:800px;margin:0 auto;padding:2em;font-size:18px;line-height:1.8}h1{text-align:center;margin-bottom:2em}p{text-indent:2em;margin:1em 0}</style></head><body><h1>${this.esc(title)}</h1>${content.split(/\n+/).map(p => p.trim()).filter(Boolean).map(this.esc).map(p => `<p>${p}</p>`).join('')}</body></html>`
  
  async render(chapterIndex = 0, _pageIndex = 0) {
    // 构建所有章节的sections
    const sections = this.chapters.map((ch, idx) => ({
      load: async () => {
        const content = ch.url && this.bookInfo
          ? await bookSourceManager.getChapterContent(this.bookInfo.sourceUrl || this.bookInfo.origin, ch.url)
          : ''
        return URL.createObjectURL(new Blob([this.toHtml(ch.title, content)], { type: 'text/html' }))
      },
      id: `chapter-${idx}`,
      linear: 'yes'
    }))
    
    // 一次性打开所有章节
    await this.view.open({
      sections,
      toc: this.chapters.map((ch, i) => ({ label: ch.title, href: `#chapter-${i}`, level: 0 }))
    })
    
    // 应用配置
    this.applyConfig()
    
    // 跳转到指定章节
    chapterIndex > 0 && await this.view.goTo(chapterIndex)
  }
  
  applyConfig() { applyViewConfig(this.view, this.settings) }
  
  // API
  getToc() { return this.chapters.map((ch, i) => ({ label: ch.title, href: `#chapter-${i}`, level: 0 })) }
  getView() { return this.view }
  getLocation(): ReaderLocation {
    const { index = 0, fraction = 0 } = this.view?.renderer?.location || {}
    return { section: index, page: undefined, percentage: (index + fraction) / this.chapters.length }
  }
  
  // 导航（完全使用foliate-js原生API）
  async goTo(loc: ReaderLocation) { loc.section !== undefined && await this.view?.goTo(loc.section) }
  prev() { this.view?.goLeft?.() }
  next() { this.view?.goRight?.() }
  
  // 配置更新（响应外部设置变化）
  updateSettings(settings: ReaderSettings) {
    this.settings = settings
    this.applyConfig()
  }
  
  destroy() { this.view?.destroy?.(); this.container.innerHTML = '' }
}

// ===== EPUB 渲染器 =====
class EpubRenderer {
  private container: HTMLElement
  private settings: ReaderSettings
  private view: any = null
  private onLocationChange?: (loc: ReaderLocation) => void
  private currentLocation?: ReaderLocation
  
  constructor(container: HTMLElement, settings: ReaderSettings) {
    this.container = container
    this.settings = settings
  }
  
  async load(src: string | File) {
    this.view = document.createElement('foliate-view')
    this.view.style.cssText = 'width:100%;height:100%'
    this.view.setAttribute('persist', 'false')
    this.container.appendChild(this.view)
    await this.view.open(src)
    
    // 应用配置
    this.applyConfig()
    
    // 监听位置变化
    this.view.addEventListener('relocate', (e: any) => {
      const loc = e.detail
      this.currentLocation = { section: loc.index || 0, cfi: loc.cfi, percentage: loc.fraction || 0 }
      this.onLocationChange?.(this.currentLocation)
    })
  }
  
  applyConfig() { applyViewConfig(this.view, this.settings) }
  
  async render() {}
  
  setLocationListener(fn: (loc: ReaderLocation) => void) {
    this.onLocationChange = fn
  }
  
  getLocation(): ReaderLocation {
    if (this.currentLocation?.cfi) return this.currentLocation
    if (!this.view) return { section: 0, percentage: 0 }
    try {
      const loc = this.view.location || this.view.renderer?.location
      if (!loc) return { section: 0, percentage: 0 }
      const location = { section: loc.index ?? 0, cfi: loc.cfi || loc.start?.cfi, percentage: loc.fraction ?? 0 }
      if (location.cfi) this.currentLocation = location
      return location
    } catch { return { section: 0, percentage: 0 } }
  }
  
  async goTo(location: ReaderLocation) {
    location.cfi ? await this.view?.goTo(location.cfi) 
      : location.section !== undefined && await this.view?.goTo(location.section)
  }
  
  prev() { this.view?.goLeft?.() }
  next() { this.view?.goRight?.() }
  getView() { return this.view }
  
  updateSettings(settings: ReaderSettings) {
    this.settings = settings
    this.applyConfig()
  }
  
  destroy() { this.view?.destroy?.(); this.container.innerHTML = '' }
}

// ===== 工具函数 =====
// 统一视图配置（foliate-js）
const applyViewConfig = (view: any, settings: ReaderSettings) => {
  const r = view?.renderer
  if (!r) return
  const { columnMode, pageAnimation } = settings
  const isScroll = pageAnimation === 'scroll'
  r.setAttribute('flow', isScroll ? 'scrolled' : 'paginated')
  r.setAttribute('max-column-count', columnMode === 'double' ? '2' : '1')
  !isScroll && pageAnimation === 'slide' ? r.setAttribute('animated', '') : r.removeAttribute('animated')
  r.setAttribute('gap', '5%')
  r.setAttribute('max-inline-size', '800px')
}

const center = (c: string, color = '#999') => `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:${color}">${c}</div>`
const isEpub = (url?: string | null) => !!url && url.toLowerCase().split('?')[0].split('#')[0].endsWith('.epub')
const fetchFile = async (url: string) => fetch(url.startsWith('http') || url.startsWith('/') ? url : `/${url}`).then(async r => r.ok ? new File([await r.blob()], url.split('/').pop()?.split('?')[0] || 'book') : null).catch(() => null)
const loadSettings = async (plugin: Plugin) => ({ enabled: true, openMode: 'newTab', tocPosition: 'left', pageAnimation: 'slide', columnMode: 'single', theme: 'default', customTheme: { name: 'custom', color: '#202124', bg: '#ffffff' }, annotationMode: 'notebook', ...(await plugin.loadData('config.json') || {}).settings })

// ===== Tab管理 =====
const activeTabs = new Map<string, { bookUrl?: string, chapterIndex?: number }>()

// ===== 阅读器核心 =====
export class ReaderCore extends EventEmitter {
  private container: HTMLElement
  private settings: ReaderSettings
  private renderer: TxtRenderer | EpubRenderer | null = null
  private format: ReaderFormat = 'auto'
  private bookInfo: any = null
  private saveTimer: any = null
  
  constructor(container: HTMLElement, settings: ReaderSettings) {
    super()
    this.container = container
    this.settings = settings
    // 监听设置变化
    window.addEventListener('sireaderSettingsUpdated', ((e: CustomEvent) => {
      this.settings = e.detail
      this.renderer?.updateSettings?.(e.detail)
    }) as EventListener)
  }
  
  // ===== 打开书籍 =====
  async open(file: File, format: ReaderFormat = 'auto') {
    this.format = format === 'auto' ? this.detectFormat(file.name) : format
    if (this.format === 'txt') {
      this.renderer = new TxtRenderer(this.container, this.settings)
      await this.renderer.load(await file.text())
      await this.renderer.render()
    } else if (this.format === 'epub') {
      this.renderer = new EpubRenderer(this.container, this.settings)
      await this.renderer.load(file)
    } else throw new Error(`不支持格式: ${this.format}`)
    this.bindEvents()
    this.emit('loaded', { format: this.format })
  }
  
  async openUrl(url: string, format: ReaderFormat = 'auto') {
    const response = await fetch(url)
    const blob = await response.blob()
    const filename = url.split('/').pop() || 'book.txt'
    const file = new File([blob], filename, { type: blob.type })
    await this.open(file, format)
  }
  
  async openOnline(bookInfo: any) {
    this.bookInfo = bookInfo
    ;(this.container as any).__bookInfo = bookInfo
    
    if (bookInfo.isEpub && bookInfo.epubPath) {
      const ws = (window as any).siyuan?.config?.system?.workspaceDir
      this.format = 'epub'
      this.renderer = new EpubRenderer(this.container, this.settings)
      await this.renderer.load(ws && bookInfo.epubPath.startsWith('/') ? `file://${ws}${bookInfo.epubPath}` : bookInfo.epubPath)
      this.renderer.setLocationListener(loc => this.autoSave(bookInfo.bookUrl, loc))
      await this.renderer.goTo(bookInfo.epubCfi ? { section: 0, cfi: bookInfo.epubCfi } : { section: bookInfo.durChapterIndex || 0 })
    } else {
      this.format = 'txt'
      this.renderer = new TxtRenderer(this.container, this.settings)
      await this.renderer.load('', bookInfo.chapters || [])
      await this.renderer.render(bookInfo.durChapterIndex || 0, bookInfo.durChapterPage || 0)
      this.renderer.on('relocate', (loc: ReaderLocation) => this.autoSave(bookInfo.bookUrl, loc))
    }
    this.bindEvents()
    this.emit('loaded', { format: this.format, bookInfo })
  }
  
  // 自动保存（防抖 2秒）
  private autoSave(bookUrl: string, loc: ReaderLocation) {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => 
      this.format === 'epub' ? this.saveEpubProgress(bookUrl, loc) : this.saveTxtProgress(bookUrl, loc), 2000)
  }
  
  private detectFormat(filename: string): ReaderFormat {
    const ext = filename.toLowerCase().split('.').pop()
    const map: Record<string, ReaderFormat> = { epub: 'epub', txt: 'txt', fb2: 'fb2', cbz: 'cbz', cbr: 'cbz', mobi: 'mobi', azw3: 'mobi' }
    return map[ext || ''] || 'txt'
  }
  
  private bindEvents() {
    // 监听选择事件
    this.container.addEventListener('selection', (e: Event) => {
      this.emit('selection', (e as CustomEvent).detail)
    })
  }
  
  // ===== 导航 =====
  async goTo(loc: string | number | ReaderLocation) {
    if (!this.renderer) return
    const target: ReaderLocation = typeof loc === 'number' ? { section: loc }
      : typeof loc === 'string' && loc.startsWith('#chapter-') ? { section: parseInt(loc.replace('#chapter-', '')) }
      : loc as ReaderLocation
    await this.renderer.goTo(target)
    this.emit('relocate', this.getLocation())
  }
  prev() { this.renderer?.prev(); this.emit('relocate', this.getLocation()) }
  next() { this.renderer?.next(); this.emit('relocate', this.getLocation()) }
  getLocation() { return this.renderer?.getLocation() || null }
  
  // 进度保存（统一处理）
  private async saveEpubProgress(bookUrl: string, loc: ReaderLocation) {
    if (!bookUrl || !loc.cfi) return
    const book = await bookshelfManager.getBook(bookUrl)
    book && (book.epubCfi = loc.cfi, book.epubProgress = Math.round((loc.percentage || 0) * 100), book.durChapterTime = Date.now(), await bookshelfManager.saveBook(book))
  }
  
  private async saveTxtProgress(bookUrl: string, loc: ReaderLocation) {
    if (!bookUrl || loc.section === undefined) return
    const book = await bookshelfManager.getBook(bookUrl)
    book && (book.durChapterIndex = loc.section, book.durChapterPage = loc.page, book.durChapterTime = Date.now(), await bookshelfManager.saveBook(book))
  }
  
  // 书签（统一处理EPUB/TXT）
  async addBookmark(title?: string, location?: { cfi?: string; section?: number; page?: number }) {
    const loc = location ? { ...this.getLocation(), ...location } : this.getLocation()
    if (!loc || !this.bookInfo?.bookUrl) throw new Error('无法获取位置或书籍信息')
    const key = this.format === 'epub' ? 'epubBookmarks' : 'txtBookmarks'
    const bookmark = this.format === 'epub'
      ? { cfi: loc.cfi, title: title || `书签${(this.bookInfo[key]?.length || 0) + 1}`, progress: Math.round((loc.percentage || 0) * 100), time: Date.now() }
      : { section: loc.section ?? 0, page: loc.page, title: title || `书签${(this.bookInfo[key]?.length || 0) + 1}`, progress: Math.round((loc.percentage || 0) * 100), time: Date.now() }
    this.bookInfo[key] = [...(this.bookInfo[key] || []), bookmark]
    const book = await bookshelfManager.getBook(this.bookInfo.bookUrl)
    book && (book[key] = this.bookInfo[key], bookshelfManager.saveBook(book))
  }
  
  async removeBookmark(id: string | number) {
    const key = this.format === 'epub' ? 'epubBookmarks' : 'txtBookmarks'
    if (!this.bookInfo?.[key]) return
    this.bookInfo[key] = this.bookInfo[key].filter((b: any) => (this.format === 'epub' ? b.cfi : b.section) !== id)
    const book = await bookshelfManager.getBook(this.bookInfo.bookUrl)
    book && (book[key] = this.bookInfo[key], bookshelfManager.saveBook(book))
  }
  
  getBookmarks() { return this.bookInfo?.[this.format === 'epub' ? 'epubBookmarks' : 'txtBookmarks'] || [] }
  
  async saveProgress(blockId: string, location: ReaderLocation) {
    if (!location) return
    const attrs: Record<string, string> = { 'custom-last-read': new Date().toISOString() }
    this.format === 'txt' ? (attrs['custom-txt-chapter'] = location.section?.toString() || '0', attrs['custom-txt-progress'] = ((location.percentage || 0) * 100).toFixed(3))
      : this.format === 'epub' && location.cfi && (attrs['custom-epub-cfi'] = location.cfi, attrs['custom-epub-progress'] = ((location.percentage || 0) * 100).toFixed(3))
    await API.setBlockAttrs(blockId, attrs).catch(() => {})
  }
  
  getFormat() { return this.format }
  getRenderer() { return this.renderer }
  
  // 更新设置（手动调用）
  updateSettings(settings: ReaderSettings) {
    this.settings = settings
    this.renderer?.updateSettings?.(settings)
  }
  
  destroy() { 
    this.renderer?.destroy()
    window.removeEventListener('sireaderSettingsUpdated', this.updateSettings as any)
  }
}

// ===== 统一Tab注册 =====
export function registerEpubTab(plugin: Plugin) {
  plugin.addTab({
    type: 'epub_reader',
    async init() {
      const container = document.createElement('div')
      container.style.cssText = 'width:100%;height:100%'
      this.element.appendChild(container)
      const { url, blockId, file: dataFile } = this.data
      const file = dataFile?.arrayBuffer ? dataFile : url && await fetchFile(url)
      if (!file) return container.innerHTML = center('加载失败', '#f00')
      createApp(Reader, { file, plugin, settings: await loadSettings(plugin), url, blockId, format: 'epub' as const }).mount(container)
    },
    destroy() {}
  })
}

// 准备书籍数据
export async function prepareBookForReading(book: any) {
  if (book.durChapterIndex === undefined) return await bookSourceManager.getBookInfo(book.sourceUrl, book.bookUrl)
  if (book.isEpub || (book.chapters?.length && book.chapters[0]?.url)) return book
  const sourceUrl = book.origin || book.sourceUrl || (book.tocUrl ? new URL(book.tocUrl).origin : null)
  if (!sourceUrl) throw new Error('书源URL缺失')
  book.chapters = (await bookSourceManager.getChapters(sourceUrl, book.tocUrl || book.bookUrl))
    .map((ch, i) => ({ index: i, title: ch.name || `第${i + 1}章`, url: ch.url }))
  await bookshelfManager.saveBook({ ...book, origin: sourceUrl, totalChapterNum: book.chapters.length })
  return book
}

// 打开Tab（统一处理）
const openReaderTab = (plugin: Plugin, data: any, title: string, type: string, openMode: string) => openTab({
  app: (plugin as any).app,
  custom: { icon: 'iconBook', title, data, id: `${plugin.name}${type}` },
  position: openMode === 'rightTab' ? 'right' : openMode === 'bottomTab' ? 'bottom' : undefined
})

export async function openOnlineReaderTab(plugin: Plugin, bookInfo: any, getSettings: () => { openMode: string }) {
  const prepared = await prepareBookForReading(bookInfo)
  openReaderTab(plugin, { bookInfo: prepared }, prepared.name || '在线阅读', 'custom_tab_online_reader', getSettings().openMode)
}

// 在线阅读器Tab
export function registerOnlineReaderTab(plugin: Plugin) {
  const { open: openSetting } = useSetting(plugin)
  plugin.addTab({
    type: 'custom_tab_online_reader',
    async init() {
      const container = document.createElement('div')
      container.style.cssText = 'width:100%;height:100%'
      this.element.appendChild(container)
      const tabId = (this.element as HTMLElement).dataset.id || Date.now().toString()
      const { bookInfo } = this.data
      if (!bookInfo) return container.innerHTML = center('无法加载书籍信息', '#f00')
      const app = createApp(Reader, {
        bookInfo, plugin, settings: await loadSettings(plugin), format: 'txt',
        onReaderReady: (r: any) => {
          const loc = r.getLocation()
          loc && activeTabs.set(tabId, { bookUrl: bookInfo.bookUrl, chapterIndex: loc.section || bookInfo.durChapterIndex || 0 })
          r.on('relocate', (l: any) => l?.section !== undefined && activeTabs.set(tabId, { bookUrl: bookInfo.bookUrl, chapterIndex: l.section }))
        },
        onSettings: openSetting
      })
      app.mount(container)
      ;(this as any)._app = app
    },
    async destroy() {
      const tabId = (this.element as HTMLElement).dataset.id!
      const tab = activeTabs.get(tabId)
      tab?.bookUrl && (await bookshelfManager.updateProgress(tab.bookUrl, tab.chapterIndex || 0, 0).catch(() => {}), activeTabs.delete(tabId))
      const app = (this as any)._app
      app && (app.unmount(), (this as any)._app = null)
    }
  })
}

// ===== 链接处理器 =====
export function createEpubLinkHandler(plugin: Plugin, getSettings: () => { openMode: string }) {
  return async (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const linkEl = target.matches('span[data-type="a"]') ? target : target.closest('a[href], [data-href], span[data-type="a"]')
    const url = linkEl?.getAttribute('data-href') || linkEl?.getAttribute('href')
    if (!isEpub(url)) return
    e.preventDefault(); e.stopPropagation()
    const file = await fetchFile(url!.split('#')[0])
    if (file) openReaderTab(plugin, { file, url: url!.split('#')[0], blockId: target.closest('[data-node-id]')?.getAttribute('data-node-id') }, file.name.replace('.epub', ''), 'epub_reader', getSettings().openMode)
  }
}

export function createOnlineReaderLinkHandler(plugin: Plugin, getSettings: () => { openMode: string }) {
  return async (e: MouseEvent) => {
    const linkEl = (e.target as HTMLElement).closest('[data-online-book]')
    if (!linkEl) return
    e.preventDefault(); e.stopPropagation()
    const bookUrl = linkEl.getAttribute('data-book-url')
    if (!bookUrl) return
    const opened = Array.from(activeTabs.entries()).find(([_, t]) => t.bookUrl === bookUrl)
    if (opened) return document.querySelector(`[data-id="${opened[0]}"]`)?.parentElement?.click()
    const bookInfo = await bookshelfManager.getBook(bookUrl)
    bookInfo && openOnlineReaderTab(plugin, bookInfo, getSettings)
  }
}

// ===== 进度保存 =====
export const saveAllProgress = async () => Promise.all(Array.from(activeTabs.values()).filter(t => t.bookUrl).map(t => bookshelfManager.updateProgress(t.bookUrl!, t.chapterIndex || 0, 0).catch(() => {})))
export const cleanupAllReaders = () => activeTabs.clear()
