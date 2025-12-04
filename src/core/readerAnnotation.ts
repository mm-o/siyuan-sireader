// ========================================
// Reader Annotation - 标注系统
// 参考 epubDoc.ts 实现，支持标注、笔记、书签
// ========================================

import * as API from '@/api'
import type { ReaderCore, ReaderLocation } from './reader'

// ===== 类型定义 =====
export type HighlightColor = 'red' | 'orange' | 'yellow' | 'green' | 'pink' | 'blue' | 'purple'
export type AnnotationType = 'highlight' | 'note'

export interface Annotation {
  id?: string
  location: ReaderLocation | string
  type: AnnotationType
  color: HighlightColor
  text: string
  note?: string
  createdAt: number
}

// ===== 颜色配置 =====
export const COLORS = [
  { color: 'red' as HighlightColor, bg: '#ef5350', code: 'R', title: '红色' },
  { color: 'orange' as HighlightColor, bg: '#ff9800', code: 'O', title: '橙色' },
  { color: 'yellow' as HighlightColor, bg: '#ffeb3b', code: 'Y', title: '黄色' },
  { color: 'green' as HighlightColor, bg: '#66bb6a', code: 'G', title: '绿色' },
  { color: 'pink' as HighlightColor, bg: '#ec407a', code: 'P', title: '粉色' },
  { color: 'blue' as HighlightColor, bg: '#42a5f5', code: 'B', title: '蓝色' },
  { color: 'purple' as HighlightColor, bg: '#ab47bc', code: 'V', title: '紫色' },
]

const COLOR_MAP = {
  R: 'red', O: 'orange', Y: 'yellow', G: 'green', 
  P: 'pink', B: 'blue', V: 'purple'
} as const

const COLOR_CODE: Record<HighlightColor, string> = {
  red: 'R', orange: 'O', yellow: 'Y', green: 'G',
  pink: 'P', blue: 'B', purple: 'V'
}

const COLOR_BG: Record<HighlightColor, string> = {
  red: 'rgba(244,67,54,0.4)',
  orange: 'rgba(255,152,0,0.4)',
  yellow: 'rgba(255,235,59,0.4)',
  green: 'rgba(76,175,80,0.4)',
  pink: 'rgba(233,30,99,0.4)',
  blue: 'rgba(33,150,243,0.4)',
  purple: 'rgba(156,39,176,0.4)',
}

// ===== 工具函数 =====
const genId = () => `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 9)}`
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]!))

// ===== 标注系统 =====
export class ReaderAnnotation {
  private reader: ReaderCore
  private blockId: string
  private docId: string = ''
  private mode: 'notebook' | 'document'
  private notebookId?: string
  private parentDoc?: { id: string; notebook: string }
  
  // 缓存
  private annotations: Annotation[] = []
  private rendered = new Set<string>()
  
  constructor(
    reader: ReaderCore,
    blockId: string,
    mode: 'notebook' | 'document' = 'notebook',
    notebookId?: string,
    parentDoc?: { id: string; notebook: string }
  ) {
    this.reader = reader
    this.blockId = blockId
    this.mode = mode
    this.notebookId = notebookId
    this.parentDoc = parentDoc
  }
  
  // ===== 初始化 =====
  async init() {
    // 获取或创建标注文档
    this.docId = await this.getOrCreateDoc()
    
    // 加载标注
    await this.load()
  }
  
  private async getOrCreateDoc(): Promise<string> {
    // 检查已绑定的文档
    try {
      const attrs = await API.getBlockAttrs(this.blockId)
      const boundId = attrs['memo'] || attrs['custom-doc-id']
      
      if (boundId) {
        const block = await API.getBlockByID(boundId)
        if (block?.type === 'd') {
          return boundId
        }
      }
    } catch {}
    
    // 创建新文档
    const notebook = this.mode === 'document' ? this.parentDoc?.notebook : this.notebookId
    if (!notebook) {
      throw new Error('未配置笔记本或父文档')
    }
    
    const title = `标注 - ${this.blockId.slice(-7)}`
    const path = this.mode === 'document' && this.parentDoc?.id
      ? `/${this.parentDoc.id}/${genId()}.sy`
      : `/${genId()}.sy`
    
    const result = await API.createDoc(notebook, path, title, '')
    if (!result?.id) {
      throw new Error('创建文档失败')
    }
    
    // 绑定文档
    await API.setBlockAttrs(this.blockId, { 'memo': result.id })
    
    return result.id
  }
  
  // ===== 加载标注 =====
  async load() {
    if (!this.docId) return
    
    try {
      const blocks = await API.sql(
        `SELECT id, markdown FROM blocks WHERE root_id='${this.docId}' AND markdown LIKE '%◎%'`
      )
      
      this.annotations = blocks.map((b: any) => this.parseAnnotation(b)).filter(Boolean) as Annotation[]
    } catch (e) {
      console.error('[Annotation] Load failed:', e)
      this.annotations = []
    }
  }
  
  private parseAnnotation(block: any): Annotation | null {
    const md = block.markdown?.trim()
    if (!md || !md.startsWith('- ')) return null
    
    // 高亮: - Y 文本内容 [◎](location)
    const highlightMatch = md.match(/^-\s*([ROYGPBV])\s+(.+?)\s*\[◎\]\(([^)]+)\)/)
    if (highlightMatch) {
      return {
        id: block.id,
        type: 'highlight',
        color: COLOR_MAP[highlightMatch[1] as keyof typeof COLOR_MAP] || 'yellow',
        text: highlightMatch[2],
        location: highlightMatch[3],
        createdAt: Date.now()
      }
    }
    
    // 笔记: - N <span...>文本</span> [◎](location)
    const noteMatch = md.match(/^-\s*N\s+<span[^>]*data-inline-memo-content="([^"]*)"[^>]*>([^<]+)<\/span>\s*\[◎\]\(([^)]+)\)/)
    if (noteMatch) {
      return {
        id: block.id,
        type: 'note',
        color: 'blue',
        text: noteMatch[2],
        note: this.decodeHtml(noteMatch[1]),
        location: noteMatch[3],
        createdAt: Date.now()
      }
    }
    
    return null
  }
  
  private decodeHtml(s: string): string {
    return s.replace(/&(quot|#39|lt|gt|amp);/g, m => 
      ({'&quot;':'"','&#39;':"'",'&lt;':'<','&gt;':'>','&amp;':'&'})[m] || m
    )
  }
  
  // ===== 恢复标注 =====
  async restore() {
    // 清除已渲染的标注
    this.clearRendered()
    
    // 渲染所有标注
    for (const anno of this.annotations) {
      this.renderAnnotation(anno)
    }
  }
  
  private renderAnnotation(anno: Annotation) {
    const key = this.getAnnotationKey(anno)
    if (this.rendered.has(key)) return
    
    // TODO: 实际渲染到页面
    // 对于TXT，直接给文本添加背景色
    // 对于EPUB，使用foliate-js的overlayer
    
    const location = typeof anno.location === 'string' ? anno.location : ''
    const element = document.querySelector(`[data-location="${location}"]`)
    if (element) {
      (element as HTMLElement).style.background = COLOR_BG[anno.color]
    }
    
    this.rendered.add(key)
  }
  
  private clearRendered() {
    // TODO: 清除所有渲染的标注
    this.rendered.clear()
  }
  
  private getAnnotationKey(anno: Annotation): string {
    const loc = typeof anno.location === 'string' ? anno.location : JSON.stringify(anno.location)
    return `${anno.type}-${loc}`
  }
  
  // ===== 添加标注 =====
  async addHighlight(location: any, color: HighlightColor, text: string): Promise<Annotation> {
    if (!this.docId) throw new Error('未初始化文档')
    
    const locationStr = this.serializeLocation(location)
    const annotation: Annotation = {
      location: locationStr,
      type: 'highlight',
      color,
      text: text.substring(0, 200),
      createdAt: Date.now()
    }
    
    // 保存到思源
    const content = `- ${COLOR_CODE[color]} ${annotation.text} [◎](${locationStr})`
    const result = await API.appendBlock('markdown', content, this.docId)
    
    if (result?.[0]?.doOperations?.[0]?.id) {
      annotation.id = result[0].doOperations[0].id
      this.annotations.push(annotation)
      this.renderAnnotation(annotation)
    }
    
    return annotation
  }
  
  async addNote(location: any, note: string, text: string): Promise<Annotation> {
    if (!this.docId) throw new Error('未初始化文档')
    
    const locationStr = this.serializeLocation(location)
    const annotation: Annotation = {
      location: locationStr,
      type: 'note',
      color: 'blue',
      text: text.substring(0, 200),
      note,
      createdAt: Date.now()
    }
    
    // 保存到思源
    const escaped = escape(annotation.text)
    const content = `- N <span data-type="inline-memo" data-inline-memo-content="${escape(note)}">${escaped}</span> [◎](${locationStr})`
    const result = await API.appendBlock('markdown', content, this.docId)
    
    if (result?.[0]?.doOperations?.[0]?.id) {
      annotation.id = result[0].doOperations[0].id
      this.annotations.push(annotation)
      this.renderAnnotation(annotation)
    }
    
    return annotation
  }
  
  private serializeLocation(location: any): string {
    if (typeof location === 'string') return location
    if (location?.cfi) return location.cfi
    if (location?.section !== undefined) return `section-${location.section}`
    
    // Range对象
    if (location?.startContainer) {
      // 简单序列化（实际应该使用CFI或其他定位方式）
      return `range-${Date.now()}`
    }
    
    return JSON.stringify(location)
  }
  
  // ===== 更新标注 =====
  async updateColor(location: string, color: HighlightColor) {
    const anno = this.annotations.find(a => a.location === location && a.type === 'highlight')
    if (!anno || !anno.id) return false
    
    try {
      const block = await API.getBlockByID(anno.id)
      if (!block) return false
      
      const newMd = block.markdown.replace(/^-\s*[ROYGPBV]/, `- ${COLOR_CODE[color]}`)
      await API.updateBlock('markdown', newMd, anno.id)
      
      anno.color = color
      this.renderAnnotation(anno)
      
      return true
    } catch {
      return false
    }
  }
  
  async updateNote(location: string, note: string) {
    const anno = this.annotations.find(a => a.location === location && a.type === 'note')
    if (!anno || !anno.id) return false
    
    try {
      const block = await API.getBlockByID(anno.id)
      if (!block) return false
      
      const newMd = block.markdown.replace(
        /data-inline-memo-content="[^"]+"/,
        `data-inline-memo-content="${escape(note)}"`
      )
      await API.updateBlock('markdown', newMd, anno.id)
      
      anno.note = note
      
      return true
    } catch {
      return false
    }
  }
  
  // ===== 删除标注 =====
  async remove(location: string) {
    const anno = this.annotations.find(a => a.location === location)
    if (!anno || !anno.id) return false
    
    try {
      await API.deleteBlock(anno.id)
      this.annotations = this.annotations.filter(a => a.location !== location)
      this.rendered.delete(this.getAnnotationKey(anno))
      return true
    } catch {
      return false
    }
  }
  
  // ===== 查询 =====
  getAll(): Annotation[] {
    return [...this.annotations]
  }
  
  getHighlights(): Annotation[] {
    return this.annotations.filter(a => a.type === 'highlight')
  }
  
  getNotes(): Annotation[] {
    return this.annotations.filter(a => a.type === 'note')
  }
  
  getByLocation(location: string): Annotation | undefined {
    return this.annotations.find(a => a.location === location)
  }
  
  // ===== 清理 =====
  destroy() {
    this.clearRendered()
    this.annotations = []
  }
}
