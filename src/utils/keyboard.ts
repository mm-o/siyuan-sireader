// 阅读器快捷键处理
export interface KeyboardHandlers {
  handlePrev: () => void
  handleNext: () => void
  handlePdfFirstPage?: () => void
  handlePdfLastPage?: () => void
  handlePdfPageUp?: () => void
  handlePdfPageDown?: () => void
  handlePdfRotate?: () => void
  handlePdfZoomIn?: () => void
  handlePdfZoomOut?: () => void
  handlePdfZoomReset?: () => void
  handlePdfSearch?: () => void
  handlePrint?: () => void
}

export const createKeyboardHandler = (handlers: KeyboardHandlers, isPdfMode: () => boolean) => {
  return (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
    
    const k = e.key, c = e.ctrlKey || e.metaKey
    
    // 通用导航
    if (['ArrowLeft', 'ArrowUp'].includes(k) || k === ' ' && e.shiftKey) return handlers.handlePrev(), e.preventDefault()
    if (['ArrowRight', 'ArrowDown', ' '].includes(k)) return handlers.handleNext(), e.preventDefault()
    
    // PDF 专用快捷键
    if (!isPdfMode()) return
    
    const pdfKeys = {
      'Home': handlers.handlePdfFirstPage,
      'End': handlers.handlePdfLastPage,
      'PageUp': handlers.handlePdfPageUp,
      'PageDown': handlers.handlePdfPageDown,
      'r': handlers.handlePdfRotate,
      'R': handlers.handlePdfRotate
    }
    
    if (pdfKeys[k]) return pdfKeys[k]?.(), e.preventDefault()
    
    if (c) {
      if (k === '+' || k === '=') handlers.handlePdfZoomIn?.(), e.preventDefault()
      else if (k === '-') handlers.handlePdfZoomOut?.(), e.preventDefault()
      else if (k === '0') handlers.handlePdfZoomReset?.(), e.preventDefault()
      else if (k === 'f') handlers.handlePdfSearch?.(), e.preventDefault()
      else if (k === 'p') handlers.handlePrint?.(), e.preventDefault()
    }
  }
}

// 为 iframe 添加键盘监听（EPUB/TXT）
const setupIframeKeyboard = (doc: Document, handler: (e: KeyboardEvent) => void) => {
  doc.addEventListener('keydown', handler)
  doc.body?.setAttribute('tabindex', '0')
}

// EPUB 键盘监听初始化
export const setupEpubKeyboard = (reader: any, handler: (e: KeyboardEvent) => void, onMouseup?: (doc: Document, e: MouseEvent) => void) => {
  reader.on('load', ({doc}: any) => {
    onMouseup && doc?.addEventListener?.('mouseup', (e: MouseEvent) => onMouseup(doc, e))
    setupIframeKeyboard(doc, handler)
  })
  setTimeout(() => reader.getView().renderer?.getContents?.()?.forEach(({doc}: any) => {
    onMouseup && doc?.addEventListener?.('mouseup', (e: MouseEvent) => onMouseup(doc, e))
    setupIframeKeyboard(doc, handler)
  }), 500)
}

// TXT 键盘监听初始化
export const setupTxtKeyboard = (view: any, handler: (e: KeyboardEvent) => void) => {
  setTimeout(() => {
    const iframe = view.iframe
    iframe?.contentDocument && setupIframeKeyboard(iframe.contentDocument, handler)
  }, 500)
}
