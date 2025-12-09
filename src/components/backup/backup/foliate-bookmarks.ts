/**
 * 书签系统 - 完全基于 CFI 定位
 * 简洁高效，优雅完美
 * 数据存储在书架的 books/{hash}.json 文件中
 */

import type { Plugin } from 'siyuan'
import type { Bookmark, FoliateView } from './types'

// 计算 hash（与书架保持一致）
function getHash(bookUrl: string): string {
  let hash = 0
  for (let i = 0; i < bookUrl.length; i++) {
    hash = ((hash << 5) - hash) + bookUrl.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

export class BookmarkManager {
  private view: FoliateView
  private bookmarks: Bookmark[] = []
  private bookUrl: string
  private plugin: Plugin

  constructor(view: FoliateView, bookUrl: string, plugin: Plugin) {
    this.view = view
    this.bookUrl = bookUrl
    this.plugin = plugin
  }

  async init() {
    await this.load()
  }

  // ===== 核心方法 =====
  
  /**
   * 添加书签
   */
  add(title?: string): Bookmark {
    const loc = this.view.lastLocation
    if (!loc?.cfi) throw new Error('无法获取当前位置')

    const bookmark: Bookmark = {
      id: `${Date.now()}`,
      cfi: loc.cfi,
      title: title || loc.tocItem?.label || '书签',
      timestamp: Date.now(),
      progress: Math.round((loc.fraction || 0) * 100),
      chapter: loc.tocItem?.label || ''
    }

    // 检查重复
    if (this.bookmarks.some(b => b.cfi === bookmark.cfi)) {
      throw new Error('该位置已有书签')
    }

    this.bookmarks.push(bookmark)
    this.save()
    return bookmark
  }

  /**
   * 删除书签
   */
  delete(id: string): boolean {
    const index = this.bookmarks.findIndex(b => b.id === id)
    if (index === -1) return false
    this.bookmarks.splice(index, 1)
    this.save()
    return true
  }

  /**
   * 切换书签（添加/删除）
   */
  toggle(title?: string): boolean {
    const cfi = this.view.lastLocation?.cfi
    if (!cfi) return false

    const existing = this.bookmarks.find(b => b.cfi === cfi)
    if (existing) {
      this.delete(existing.id)
      return false
    } else {
      this.add(title)
      return true
    }
  }

  /**
   * 跳转到书签
   */
  goTo(bookmark: Bookmark) {
    this.view.goTo(bookmark.cfi)
  }

  /**
   * 获取所有书签（按进度排序）
   */
  getAll(): Bookmark[] {
    return [...this.bookmarks].sort((a, b) => (a.progress || 0) - (b.progress || 0))
  }

  /**
   * 检查当前位置是否有书签
   */
  hasCurrent(): boolean {
    const cfi = this.view.lastLocation?.cfi
    return cfi ? this.bookmarks.some(b => b.cfi === cfi) : false
  }

  // ===== 存储（使用书架的 JSON 文件）=====

  private async load() {
    try {
      const hash = getHash(this.bookUrl)
      const filename = `books/${hash}.json`
      const data = await this.plugin.loadData(filename)
      
      if (!data) {
        this.bookmarks = []
        return
      }

      // 从书架的 epubBookmarks 字段读取，转换格式
      const epubBookmarks = data.epubBookmarks || []
      this.bookmarks = epubBookmarks.map((b: any) => ({
        id: `${b.time || Date.now()}`,
        cfi: b.cfi,
        title: b.title,
        timestamp: b.time || Date.now(),
        progress: b.progress,
        chapter: b.title
      }))
      console.log('[Bookmarks] Loaded:', this.bookmarks.length, 'bookmarks')
    } catch (e) {
      console.error('[Bookmarks] Load failed:', e)
      this.bookmarks = []
    }
  }

  private async save() {
    try {
      const hash = getHash(this.bookUrl)
      const filename = `books/${hash}.json`
      
      // 读取完整的书籍数据
      let bookData = await this.plugin.loadData(filename) || {}
      
      // 转换为书架的格式
      bookData.epubBookmarks = this.bookmarks.map(b => ({
        cfi: b.cfi,
        title: b.title,
        progress: b.progress || 0,
        time: b.timestamp
      }))
      
      await this.plugin.saveData(filename, bookData)
    } catch (e) {
      console.error('[Bookmarks] Save failed:', e)
    }
  }

  // ===== Calibre 导入 =====

  /**
   * 从 Calibre 导入书签
   */
  async importCalibreBookmarks(): Promise<number> {
    try {
      const calibre = await this.view.book.getCalibreBookmarks?.()
      if (!calibre) return 0

      let count = 0
      for (const obj of calibre) {
        if (obj.type === 'bookmark' && obj.start_cfi) {
          // 检查是否已存在
          if (this.bookmarks.some(b => b.cfi === obj.start_cfi)) continue

          const bookmark: Bookmark = {
            id: `calibre-${Date.now()}-${count}`,
            cfi: obj.start_cfi,
            title: obj.title || obj.notes || `Calibre 书签 ${count + 1}`,
            timestamp: obj.timestamp || Date.now(),
            progress: 0,
            chapter: ''
          }

          this.bookmarks.push(bookmark)
          count++
        }
      }

      if (count > 0) this.save()
      return count
    } catch (e) {
      console.error('[Bookmarks] Import Calibre failed:', e)
      return 0
    }
  }

  async destroy() {
    await this.save()
  }
}
