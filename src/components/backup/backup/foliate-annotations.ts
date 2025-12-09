/**
 * 标注系统
 * 完全基于 foliate-js 原生方法实现
 * 数据格式：{ value: CFI, color: string, note?: string }
 * 数据存储在书架的 books/{hash}.json 文件中
 */

import type { Plugin } from 'siyuan'
import type { Annotation, FoliateView } from './types'

// 计算 hash（与书架保持一致）
function getHash(bookUrl: string): string {
  let hash = 0
  for (let i = 0; i < bookUrl.length; i++) {
    hash = ((hash << 5) - hash) + bookUrl.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

// ===== 颜色配置（标准 CSS 颜色）=====
export const HIGHLIGHT_COLORS = [
  { name: '黄色', color: 'yellow', bg: '#ffeb3b' },
  { name: '红色', color: 'red', bg: '#ef5350' },
  { name: '绿色', color: 'green', bg: '#66bb6a' },
  { name: '蓝色', color: 'blue', bg: '#42a5f5' },
  { name: '紫色', color: 'purple', bg: '#ab47bc' },
  { name: '橙色', color: 'orange', bg: '#ff9800' },
  { name: '粉色', color: 'pink', bg: '#ec407a' },
] as const

// ===== 标注管理器（完全按照 foliate-js 原生方式）=====
export class AnnotationManager {
  private view: FoliateView
  private bookUrl: string
  private plugin: Plugin
  private annotations = new Map<number, Annotation[]>()  // 按章节索引存储
  private annotationsByValue = new Map<string, Annotation>()
  
  constructor(view: FoliateView, bookUrl: string, plugin: Plugin) {
    this.view = view
    this.bookUrl = bookUrl
    this.plugin = plugin
    this.setupEventListeners()
  }

  /**
   * 初始化（加载数据）
   */
  async init() {
    await this.loadAnnotations()
    await this.loadCalibreAnnotations()
  }

  /**
   * 加载标注（使用书架的 JSON 文件）
   */
  private async loadAnnotations() {
    try {
      const hash = getHash(this.bookUrl)
      const filename = `books/${hash}.json`
      const data = await this.plugin.loadData(filename)
      
      if (!data?.annotations) return

      const saved: Annotation[] = data.annotations
      this.annotations.clear()
      this.annotationsByValue.clear()
      
      for (const annotation of saved) {
        const index = this.extractIndexFromCFI(annotation.value)
        const list = this.annotations.get(index) || []
        list.push(annotation)
        this.annotations.set(index, list)
        this.annotationsByValue.set(annotation.value, annotation)
      }
      
      console.log('[Annotations] Loaded:', saved.length, 'annotations')
    } catch (e) {
      console.error('[Annotations] Load failed:', e)
    }
  }

  /**
   * 保存标注（使用书架的 JSON 文件）
   */
  private async saveAnnotations() {
    try {
      const hash = getHash(this.bookUrl)
      const filename = `books/${hash}.json`
      
      // 读取完整的书籍数据
      let bookData = await this.plugin.loadData(filename) || {}
      
      // 更新标注数据（添加到书架的 JSON 中）
      const all = Array.from(this.annotationsByValue.values())
      bookData.annotations = all
      
      await this.plugin.saveData(filename, bookData)
    } catch (e) {
      console.error('[Annotations] Save failed:', e)
    }
  }

  /**
   * 加载 Calibre 标注（foliate-js 原生方法）
   */
  private async loadCalibreAnnotations() {
    try {
      const bookmarks = await this.view.book?.getCalibreBookmarks?.()
      if (!bookmarks) return

      let count = 0
      for (const obj of bookmarks) {
        if (obj.type === 'highlight') {
          // 使用 foliate-js 的转换方法
          const { fromCalibreHighlight } = await import('foliate-js/epubcfi.js') as any
          const value = fromCalibreHighlight(obj)
          const colorStr = obj.style?.which || 'yellow'
          const note = obj.notes

          const annotation: Annotation = { 
            value, 
            color: colorStr as any,  // 类型断言
            note 
          }
          
          // 添加到缓存
          const index = obj.spine_index || 0
          const list = this.annotations.get(index) || []
          list.push(annotation)
          this.annotations.set(index, list)
          this.annotationsByValue.set(value, annotation)
          count++
        }
      }

      if (count > 0) {
        this.saveAnnotations()
        console.log('[Annotations] Imported from Calibre:', count)
      }
    } catch (e) {
      console.error('[Annotations] Failed to load Calibre annotations:', e)
    }
  }

  /**
   * 从 CFI 中提取章节索引
   */
  private extractIndexFromCFI(cfi: string): number {
    try {
      const resolved = this.view.resolveCFI(cfi)
      return resolved.index
    } catch {
      return 0
    }
  }

  /**
   * 设置事件监听（完全按照 foliate-js 原生方式）
   */
  private setupEventListeners() {
    // 章节加载时恢复标注
    this.view.addEventListener('create-overlay', ((e: CustomEvent) => {
      const { index } = e.detail
      const list = this.annotations.get(index)
      if (list) {
        for (const annotation of list) {
          this.view.addAnnotation(annotation).catch(console.error)
        }
      }
    }) as EventListener)

    // 自定义标注样式（使用 Overlayer 静态方法）
    this.view.addEventListener('draw-annotation', ((e: CustomEvent) => {
      const { draw, annotation } = e.detail
      const colorConfig = HIGHLIGHT_COLORS.find(c => c.color === annotation.color)
      const color = colorConfig?.bg || '#ffeb3b'
      
      // 导入 Overlayer
      import('foliate-js/overlayer.js').then(({ Overlayer }: any) => {
        if (annotation.note) {
          // 笔记：使用边框
          draw(Overlayer.outline, { color, width: 3 })
        } else {
          // 高亮：使用背景色
          draw(Overlayer.highlight, { color })
        }
      })
    }) as EventListener)

    // 点击标注（显示笔记）
    this.view.addEventListener('show-annotation', ((e: CustomEvent) => {
      const annotation = this.annotationsByValue.get(e.detail.value)
      if (annotation?.note) {
        // 触发自定义事件
        window.dispatchEvent(new CustomEvent('sireader:show-note', {
          detail: { annotation, event: e }
        }))
      }
    }) as EventListener)
  }

  /**
   * 添加高亮（简洁版）
   */
  async addHighlight(range: Range, color: string, text?: string): Promise<Annotation> {
    const index = this.getCurrentIndex()
    const cfi = this.view.getCFI(index, range)
    
    const annotation: Annotation = {
      value: cfi,
      color,
      text: text?.substring(0, 200),
      timestamp: Date.now()
    }
    
    // 添加到缓存
    const list = this.annotations.get(index) || []
    list.push(annotation)
    this.annotations.set(index, list)
    this.annotationsByValue.set(cfi, annotation)
    
    // 保存
    this.saveAnnotations()
    
    // 渲染到页面
    await this.view.addAnnotation(annotation)
    
    return annotation
  }

  /**
   * 添加笔记（简洁版）
   */
  async addNote(range: Range, note: string, text?: string): Promise<Annotation> {
    const index = this.getCurrentIndex()
    const cfi = this.view.getCFI(index, range)
    
    const annotation: Annotation = {
      value: cfi,
      color: 'blue',
      text: text?.substring(0, 200),
      note,
      timestamp: Date.now()
    }
    
    // 添加到缓存
    const list = this.annotations.get(index) || []
    list.push(annotation)
    this.annotations.set(index, list)
    this.annotationsByValue.set(cfi, annotation)
    
    // 保存
    this.saveAnnotations()
    
    // 渲染到页面
    await this.view.addAnnotation(annotation)
    
    return annotation
  }

  /**
   * 删除标注（简洁版）
   */
  async deleteAnnotation(cfi: string): Promise<boolean> {
    const annotation = this.annotationsByValue.get(cfi)
    if (!annotation) return false
    
    try {
      // 从缓存删除
      const index = this.extractIndexFromCFI(cfi)
      const list = this.annotations.get(index)
      if (list) {
        this.annotations.set(index, list.filter(a => a.value !== cfi))
      }
      this.annotationsByValue.delete(cfi)
      
      // 保存
      this.saveAnnotations()
      
      // 从页面删除
      await this.view.deleteAnnotation(annotation)
      
      return true
    } catch (e) {
      console.error('[Annotations] Delete failed:', e)
      return false
    }
  }

  /**
   * 获取所有标注
   */
  getAllAnnotations(): Annotation[] {
    return Array.from(this.annotationsByValue.values())
  }

  /**
   * 按章节获取标注
   */
  getAnnotationsBySection(index: number): Annotation[] {
    return this.annotations.get(index) || []
  }

  /**
   * 获取当前章节索引
   */
  private getCurrentIndex(): number {
    return this.view.renderer?.location?.index ?? 0
  }

  /**
   * 导出为 JSON
   */
  exportToJSON(): string {
    return JSON.stringify(this.getAllAnnotations(), null, 2)
  }

  /**
   * 从 JSON 导入
   */
  async importFromJSON(json: string): Promise<number> {
    try {
      const annotations: Annotation[] = JSON.parse(json)
      let count = 0

      for (const annotation of annotations) {
        if (!this.annotationsByValue.has(annotation.value)) {
          const index = this.extractIndexFromCFI(annotation.value)
          const list = this.annotations.get(index) || []
          list.push(annotation)
          this.annotations.set(index, list)
          this.annotationsByValue.set(annotation.value, annotation)
          count++
        }
      }

      if (count > 0) {
        this.saveAnnotations()
      }

      return count
    } catch (e) {
      console.error('[Annotations] Import failed:', e)
      return 0
    }
  }

  /**
   * 清理
   */
  async destroy() {
    await this.saveAnnotations()
    this.annotations.clear()
    this.annotationsByValue.clear()
  }
}
