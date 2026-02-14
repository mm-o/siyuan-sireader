/**
 * PDF 类型定义
 */

import type { HighlightColor } from '../foliate/types'

export interface PDFAnnotation {
  id: string
  page: number
  type: 'highlight' | 'note'
  rects: { x: number; y: number; w: number; h: number }[]
  text: string
  color: HighlightColor
  style?: 'highlight' | 'underline' | 'outline' | 'dotted' | 'dashed' | 'double' | 'squiggly'
  note?: string
  timestamp: number
}

export interface PDFLocation {
  page: number
  total: number
  fraction: number
  scrollTop?: number
}

export interface PDFViewerOptions {
  container: HTMLElement
  scale?: number
  onPageChange?: (page: number) => void
  onAnnotationClick?: (ann: PDFAnnotation) => void
}

export interface PDFOutlineItem {
  title: string
  dest: any
  items?: PDFOutlineItem[]
  pageNumber?: number
}

export type ViewMode='single'|'double'|'scroll'