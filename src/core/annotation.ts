/**
 * 统一标注管理器 - 抹平 PDF/EPUB/TXT 差异
 */

import type { MarkManager } from './foliate/mark'
import type { PDFAnnotator } from './pdf/annotator'
import type { HighlightColor } from './foliate/types'

export interface AnnotationSelection {
  text: string
  cfi?: string
  section?: number
  page?: number
  rects?: any[]
}

export interface AnnotationMark {
  id: string
  text?: string
  note?: string
  color?: HighlightColor
  style?: 'highlight' | 'underline' | 'outline' | 'squiggly'
  cfi?: string
  section?: number
}

interface AnnotationContext {
  isPdf: boolean
  pdfAnnotator?: PDFAnnotator
  markManager?: MarkManager
}

export class UnifiedAnnotationManager {
  private ctx: AnnotationContext

  constructor(context: AnnotationContext) {
    this.ctx = context
  }

  /** 保存标注（新建或更新） */
  async save(
    selection: AnnotationSelection | null,
    currentMark: AnnotationMark | null,
    text: string,
    note: string,
    color: HighlightColor,
    style: 'highlight' | 'underline' | 'outline' | 'squiggly'
  ): Promise<void> {
    const trimmedNote = note.trim()
    
    if (this.ctx.isPdf) {
      await this._savePdf(selection, currentMark, text, trimmedNote, color, style)
    } else {
      await this._saveEpub(selection, currentMark, text, trimmedNote, color, style)
    }
  }

  /** 删除标注 */
  async delete(mark: AnnotationMark): Promise<boolean> {
    if (this.ctx.isPdf) {
      return await this.ctx.pdfAnnotator!.delete(mark.id)
    } else {
      const key = mark.cfi || `section-${mark.section}`
      return await this.ctx.markManager!.deleteMark(key)
    }
  }

  // ===== 私有方法 =====

  private async _savePdf(
    selection: AnnotationSelection | null,
    currentMark: AnnotationMark | null,
    text: string,
    note: string,
    color: HighlightColor,
    style: 'highlight' | 'underline' | 'outline' | 'squiggly'
  ): Promise<void> {
    const annotator = this.ctx.pdfAnnotator!
    
    if (currentMark) {
      // 更新现有标注
      await annotator.update(currentMark.id, { text, color, style, note: note || undefined })
    } else if (selection?.page && selection.rects) {
      // 新建标注
      if (note) {
        await annotator.addNote(selection.page, selection.rects, text, note, color, style)
      } else {
        await annotator.addHighlight(selection.page, selection.rects, text, color, style)
      }
      window.getSelection()?.removeAllRanges()
    }
  }

  private async _saveEpub(
    selection: AnnotationSelection | null,
    currentMark: AnnotationMark | null,
    text: string,
    note: string,
    color: HighlightColor,
    style: 'highlight' | 'underline' | 'outline' | 'squiggly'
  ): Promise<void> {
    const marks = this.ctx.markManager!
    
    if (currentMark) {
      // 更新现有标注
      const key = currentMark.cfi || `section-${currentMark.section}`
      await marks.updateMark(key, { color, style, note: note || undefined })
    } else if (selection) {
      // 新建标注
      const key = selection.cfi ?? selection.section
      if (key === undefined) return
      
      if (note) {
        await marks.addNote(key as any, note, text, color, style)
      } else {
        await marks.addHighlight(key as any, text, color, style)
      }
    }
  }
}

/** 工具函数：创建标注管理器 */
export const createAnnotationManager = (
  isPdf: boolean,
  pdfAnnotator?: PDFAnnotator,
  markManager?: MarkManager
): UnifiedAnnotationManager => {
  return new UnifiedAnnotationManager({ isPdf, pdfAnnotator, markManager })
}
