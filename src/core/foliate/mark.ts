/**
 * 统一标记系统 - 书签、标注、笔记、词汇
 * 完全基于 foliate-js 原生 API
 * 极限精简，简洁高效，优雅完美
 */

import type { Plugin } from 'siyuan'
import type { FoliateView, HighlightColor } from './types'
import { Overlayer } from 'foliate-js/overlayer.js'

// ===== 类型定义 =====

export interface Mark {
  id: string
  type: 'bookmark' | 'highlight' | 'note' | 'vocab'
  cfi: string
  text?: string
  color?: HighlightColor
  style?: 'highlight' | 'underline' | 'outline' | 'squiggly'
  note?: string
  title?: string
  translation?: string
  timestamp: number
  progress?: number
  chapter?: string
}

// ===== 颜色配置 =====
export const COLORS = [
  { name: '黄色', color: 'yellow' as const, bg: '#ffeb3b' },
  { name: '红色', color: 'red' as const, bg: '#ef5350' },
  { name: '绿色', color: 'green' as const, bg: '#66bb6a' },
  { name: '蓝色', color: 'blue' as const, bg: '#42a5f5' },
  { name: '紫色', color: 'purple' as const, bg: '#ab47bc' },
  { name: '橙色', color: 'orange' as const, bg: '#ff9800' },
  { name: '粉色', color: 'pink' as const, bg: '#ec407a' },
]

// ===== 工具函数 =====

const getHash = (bookUrl: string): string => {
  let hash = 0
  for (let i = 0; i < bookUrl.length; i++) {
    hash = ((hash << 5) - hash) + bookUrl.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

// ===== 统一标记管理器 =====

export class MarkManager {
  private view: FoliateView
  private bookUrl: string
  private plugin: Plugin
  private marks: Mark[] = []
  private marksByCfi = new Map<string, Mark>()

  constructor(view: FoliateView, bookUrl: string, plugin: Plugin) {
    this.view = view
    this.bookUrl = bookUrl
    this.plugin = plugin
    this.setupListeners()
  }

  async init() {
    await this.load()
    await this.loadCalibre()
  }

  // ===== 存储 =====

  private async load() {
    try {
      const hash = getHash(this.bookUrl)
      const data = await this.plugin.loadData(`books/${hash}.json`)
      if (!data) return

      this.marks = []

      // 加载书签
      if (data.epubBookmarks) {
        this.marks.push(...data.epubBookmarks.map((b: any) => ({
          id: `bookmark-${b.time}`,
          type: 'bookmark' as const,
          cfi: b.cfi,
          title: b.title,
          timestamp: b.time,
          progress: b.progress,
          chapter: b.title
        })))
      }

      // 加载标注
      if (data.annotations) {
        this.marks.push(...data.annotations.map((a: any) => {
          const type: 'note' | 'highlight' = a.note ? 'note' : 'highlight'
          return {
            id: `${type}-${a.timestamp || Date.now()}`,
            type,
            cfi: a.value,
            text: a.text,
            color: a.color,
            style: a.style || 'highlight',
            note: a.note,
            timestamp: a.timestamp || Date.now(),
            chapter: a.chapter
          }
        }))
      }

      // 加载词汇
      if (data.vocabulary) {
        this.marks.push(...data.vocabulary.map((v: any) => ({
          id: `vocab-${v.timestamp}`,
          type: 'vocab' as const,
          cfi: v.cfi,
          text: v.word,
          note: v.context,
          translation: v.translation,
          timestamp: v.timestamp,
          chapter: v.chapter
        })))
      }

      this.rebuildIndex()
    } catch (e) {
      console.error('[Mark] Load failed:', e)
    }
  }

  private async save() {
    try {
      const hash = getHash(this.bookUrl)
      const data = await this.plugin.loadData(`books/${hash}.json`) || {}

      // 转换为书架格式
      data.epubBookmarks = this.marks
        .filter(m => m.type === 'bookmark')
        .map(m => ({ cfi: m.cfi, title: m.title || '', progress: m.progress || 0, time: m.timestamp }))

      data.annotations = this.marks
        .filter(m => m.type === 'highlight' || m.type === 'note')
        .map(m => ({ value: m.cfi, color: m.color, style: m.style, text: m.text, note: m.note, timestamp: m.timestamp, chapter: m.chapter }))

      data.vocabulary = this.marks
        .filter(m => m.type === 'vocab')
        .map(m => ({ word: m.text || '', context: m.note || '', translation: m.translation, cfi: m.cfi, timestamp: m.timestamp, chapter: m.chapter }))

      await this.plugin.saveData(`books/${hash}.json`, data)
    } catch (e) {
      console.error('[Mark] Save failed:', e)
    }
  }

  private rebuildIndex() {
    this.marksByCfi.clear()
    for (const mark of this.marks) this.marksByCfi.set(mark.cfi, mark)
  }

  // ===== Calibre 导入 =====

  private async loadCalibre() {
    try {
      const calibre = await this.view.book?.getCalibreBookmarks?.()
      if (!calibre) return

      let count = 0
      for (const obj of calibre) {
        if (obj.type === 'bookmark' && obj.start_cfi && !this.marksByCfi.has(obj.start_cfi)) {
          this.addMark({ type: 'bookmark', cfi: obj.start_cfi, title: obj.title || obj.notes || '书签' })
          count++
        } else if (obj.type === 'highlight') {
          const { fromCalibreHighlight } = await import('foliate-js/epubcfi.js') as any
          const cfi = fromCalibreHighlight(obj)
          if (!this.marksByCfi.has(cfi)) {
            this.addMark({
              type: obj.notes ? 'note' : 'highlight',
              cfi,
              color: (obj.style?.which || 'yellow') as HighlightColor,
              note: obj.notes
            })
            count++
          }
        }
      }

      if (count > 0) await this.save()
    } catch (e) {
      console.error('[Mark] Calibre failed:', e)
    }
  }

  // ===== 事件监听（完全使用 foliate-js 原生 API）=====

  private setupListeners() {
    // 章节加载时恢复标注
    this.view.addEventListener('create-overlay', ((e: CustomEvent) => {
      const { index } = e.detail
      const marks = this.marks.filter(m => {
        try {
          return this.view.resolveCFI(m.cfi).index === index
        } catch {
          return false
        }
      })
      
      for (const mark of marks) {
        if (mark.type !== 'bookmark') {
          this.view.addAnnotation({ value: mark.cfi, color: mark.color, note: mark.note }).catch(console.error)
        }
      }
    }) as EventListener)

    // 自定义标注样式
    this.view.addEventListener('draw-annotation', ((e: CustomEvent) => {
      const { draw, annotation } = e.detail
      const mark = this.marksByCfi.get(annotation.value)
      
      const colorName = mark?.color || annotation.color || 'yellow'
      const colorConfig = COLORS.find(c => c.color === colorName)
      const color = colorConfig?.bg || '#ffeb3b'
      const style = mark?.style || 'highlight'
      
      if (style === 'underline') {
        draw(Overlayer.underline, { color, width: 2 })
      } else if (style === 'outline') {
        draw(Overlayer.outline, { color, width: 3 })
      } else if (style === 'squiggly') {
        draw(Overlayer.squiggly, { color, width: 2 })
      } else {
        draw(Overlayer.highlight, { color })
      }
    }) as EventListener)
  }

  // ===== 内部方法 =====

  private addMark(partial: Partial<Mark>): Mark {
    const mark: Mark = {
      id: `${partial.type}-${Date.now()}`,
      type: partial.type!,
      cfi: partial.cfi!,
      text: partial.text,
      color: partial.color,
      style: partial.style,
      note: partial.note,
      title: partial.title,
      translation: partial.translation,
      timestamp: partial.timestamp || Date.now(),
      progress: partial.progress,
      chapter: partial.chapter
    }
    this.marks.push(mark)
    this.marksByCfi.set(mark.cfi, mark)
    return mark
  }

  private deleteMark_(cfi: string): boolean {
    const index = this.marks.findIndex(m => m.cfi === cfi)
    if (index === -1) return false
    this.marks.splice(index, 1)
    this.marksByCfi.delete(cfi)
    return true
  }

  // ===== 书签 =====

  addBookmark(cfi?: string, title?: string): Mark {
    const loc = cfi ? { cfi } : this.view.lastLocation
    if (!loc?.cfi) throw new Error('无法获取位置')
    if (this.marksByCfi.has(loc.cfi)) throw new Error('该位置已有书签')

    const mark = this.addMark({
      type: 'bookmark',
      cfi: loc.cfi,
      title: title || loc.tocItem?.label || '书签',
      progress: Math.round((loc.fraction || 0) * 100),
      chapter: loc.tocItem?.label || ''
    })

    this.save()
    return mark
  }

  deleteBookmark(cfi: string): boolean {
    if (!this.deleteMark_(cfi)) return false
    this.save()
    return true
  }

  toggleBookmark(): boolean {
    const cfi = this.view.lastLocation?.cfi
    if (!cfi) return false

    const existing = this.marks.find(m => m.type === 'bookmark' && m.cfi === cfi)
    if (existing) {
      this.deleteBookmark(cfi)
      return false
    } else {
      this.addBookmark()
      return true
    }
  }

  hasBookmark(cfi?: string): boolean {
    const target = cfi || this.view.lastLocation?.cfi
    return target ? this.marks.some(m => m.type === 'bookmark' && m.cfi === target) : false
  }

  getBookmarks(): Mark[] {
    return this.marks.filter(m => m.type === 'bookmark').sort((a, b) => (a.progress || 0) - (b.progress || 0))
  }

  // ===== 标注（使用 foliate-js 原生 addAnnotation）=====

  async addHighlight(cfi: string, text: string, color: HighlightColor, style: Mark['style'] = 'highlight'): Promise<Mark> {
    const mark = this.addMark({
      type: 'highlight',
      cfi,
      text: text?.substring(0, 200),
      color,
      style
    })

    await this.save()
    await this.view.addAnnotation({ value: cfi, color })
    return mark
  }

  async addNote(cfi: string, note: string, text: string, color: HighlightColor = 'blue', style: Mark['style'] = 'outline'): Promise<Mark> {
    const mark = this.addMark({
      type: 'note',
      cfi,
      text: text?.substring(0, 200),
      note,
      color,
      style
    })

    await this.save()
    await this.view.addAnnotation({ value: cfi, color, note })
    return mark
  }

  async updateMark(cfi: string, updates: Partial<Mark>): Promise<boolean> {
    const mark = this.marksByCfi.get(cfi)
    if (!mark) return false
    
    Object.assign(mark, updates)
    await this.save()
    
    // 重新渲染标注
    await this.view.deleteAnnotation({ value: cfi })
    await this.view.addAnnotation({ value: cfi, color: mark.color, note: mark.note })
    return true
  }

  async deleteMark(cfi: string): Promise<boolean> {
    if (!this.deleteMark_(cfi)) return false
    await this.save()
    await this.view.deleteAnnotation({ value: cfi })
    return true
  }

  getAnnotations(color?: HighlightColor): Mark[] {
    const marks = this.marks.filter(m => m.type === 'highlight' || m.type === 'note')
    return color ? marks.filter(m => m.color === color) : marks
  }

  getNotes(): Mark[] {
    return this.marks.filter(m => m.type === 'note')
  }

  // ===== 词汇（使用 foliate-js 原生 addAnnotation）=====

  async addVocab(word: string, context: string, translation?: string): Promise<Mark> {
    const loc = this.view.lastLocation
    if (!loc?.cfi) throw new Error('无法获取位置')

    const mark = this.addMark({
      type: 'vocab',
      cfi: loc.cfi,
      text: word.trim(),
      note: context.substring(0, 200),
      translation,
      chapter: loc.tocItem?.label || ''
    })

    await this.save()
    await this.view.addAnnotation({ value: loc.cfi, color: 'purple', note: translation })
    return mark
  }

  async deleteVocab(cfi: string): Promise<boolean> {
    if (!this.deleteMark_(cfi)) return false
    await this.save()
    await this.view.deleteAnnotation({ value: cfi })
    return true
  }

  getVocabulary(): Mark[] {
    return this.marks.filter(m => m.type === 'vocab').sort((a, b) => b.timestamp - a.timestamp)
  }

  // ===== 通用方法（使用 foliate-js 原生 goTo）=====

  getAll(): Mark[] {
    return [...this.marks]
  }

  getByType(type: Mark['type']): Mark[] {
    return this.marks.filter(m => m.type === type)
  }

  async goTo(mark: Mark) {
    await this.view.goTo(mark.cfi)
  }

  exportJSON(): string {
    return JSON.stringify(this.marks, null, 2)
  }

  async importJSON(json: string): Promise<number> {
    try {
      const imported: Mark[] = JSON.parse(json)
      let count = 0

      for (const mark of imported) {
        if (!this.marksByCfi.has(mark.cfi)) {
          this.marks.push(mark)
          this.marksByCfi.set(mark.cfi, mark)
          count++
        }
      }

      if (count > 0) await this.save()
      return count
    } catch (e) {
      console.error('[Mark] Import failed:', e)
      return 0
    }
  }

  async destroy() {
    await this.save()
    this.marks = []
    this.marksByCfi.clear()
  }
}
