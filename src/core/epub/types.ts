/**
 * Foliate-js 类型定义
 */

// ===== 标注类型 =====
export type HighlightColor = 'red' | 'orange' | 'yellow' | 'green' | 'pink' | 'blue' | 'purple'

export interface Annotation {
  value: string              // CFI 或位置标识（唯一）
  color?: HighlightColor     // 颜色
  note?: string              // 笔记内容
  text?: string              // 标注的原文
  timestamp?: number         // 时间戳
  chapter?: string           // 章节名
}

// ===== 书签类型 =====
export interface Bookmark {
  id: string                 // 唯一标识
  cfi: string                // CFI 位置
  title: string              // 书签标题
  timestamp: number          // 创建时间
  progress?: number          // 进度百分比
  chapter?: string           // 章节名
}

// ===== 目录类型 =====
export interface TOCItem {
  label: string              // 章节标题
  href: string               // 跳转链接
  subitems?: TOCItem[]       // 子章节
  id?: number                // 内部 ID
}

// ===== 词汇类型 =====
export interface VocabularyItem {
  word: string               // 单词
  context: string            // 上下文
  translation?: string       // 翻译
  cfi: string                // 位置
  timestamp: number          // 添加时间
  chapter?: string           // 章节名
}

// ===== 位置类型 =====
export interface Location {
  index?: number             // 章节索引
  cfi?: string               // CFI 位置（EPUB/MOBI/FB2）
  section?: number           // 章节索引（TXT/在线）
  href?: string              // 链接
  fraction?: number          // 进度百分比
  range?: Range              // DOM Range
  label?: string             // 章节标题
  tocItem?: { label?: string; href?: string }  // 目录项
}

// ===== 进度信息 =====
export interface Progress {
  fraction: number           // 总进度 0-1
  section: {
    current: number
    total: number
  }
  location: {
    current: number
    next: number
    total: number
  }
  tocItem?: TOCItem          // 当前目录项
  pageItem?: any             // 当前页码项
}

// ===== Foliate View 接口 =====
export interface FoliateView extends HTMLElement {
  open(file: File | string | any): Promise<void>
  goTo(target: string | number | Location): Promise<any>
  goLeft(): Promise<void>
  goRight(): Promise<void>
  prev(distance?: number): Promise<void>
  next(distance?: number): Promise<void>
  goToFraction(fraction: number): Promise<void>
  
  addAnnotation(annotation: Annotation, remove?: boolean): Promise<any>
  deleteAnnotation(annotation: Annotation): Promise<any>
  showAnnotation(annotation: Annotation): Promise<void>
  
  getCFI(index: number, range?: Range): string
  resolveCFI(cfi: string): { index: number; anchor: (doc: Document) => Range | Element }
  
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
  
  book: any
  renderer: any
  lastLocation: Location | null
  history: any
}

// ===== Overlayer 接口 =====
export interface Overlayer {
  element: SVGElement
  add(key: string, range: Range | Function, draw: Function, options?: any): void
  remove(key: string): void
  redraw(): void
  hitTest(event: { x: number; y: number }): [string, Range] | []
}

// ===== 事件类型 =====
export interface RelocateEvent {
  index: number
  fraction: number
  range: Range
  cfi: string
  tocItem?: TOCItem
  pageItem?: any
  location?: any
}

export interface LoadEvent {
  doc: Document
  index: number
}

export interface CreateOverlayEvent {
  doc: Document
  index: number
  attach: (overlayer: Overlayer) => void
}

export interface DrawAnnotationEvent {
  draw: (func: Function, opts?: any) => void
  annotation: Annotation
  doc: Document
  range: Range
}

export interface ShowAnnotationEvent {
  value: string
  index: number
  range: Range
}