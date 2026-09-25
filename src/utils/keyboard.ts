// 阅读器快捷键处理
export interface KeyboardHandlers {
  handlePrev: (distance?: number) => void
  handleNext: (distance?: number) => void
  handleUndo?: () => void
  getScrollStep?: () => number | undefined
}

export const shouldHandleReaderKeydown = (isPdfMode: boolean, isActiveReader: boolean) => isActiveReader && !isPdfMode

export const createKeyboardHandler = (handlers: KeyboardHandlers) => {
  return (e: KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return

    const consume = () => {
      e.preventDefault()
      e.stopPropagation()
    }

    const k = e.key
    const c = e.ctrlKey || e.metaKey

    // 通用快捷键
    if (c && k === 'z') return handlers.handleUndo?.(), consume()

    // 通用导航
    const distance = handlers.getScrollStep?.()
    if (['ArrowLeft', 'ArrowUp'].includes(k) || (k === ' ' && e.shiftKey)) return handlers.handlePrev(distance), consume()
    if (['ArrowRight', 'ArrowDown', ' '].includes(k)) return handlers.handleNext(distance), consume()
  }
}

// EPUB 键盘与选区监听初始化
export const setupEpubKeyboard = (
  reader: any,
  handler: (e: KeyboardEvent) => void,
  onSelectionChange?: (doc: Document, e?: Event) => void,
  onTapZone?: (x: number, doc: Document, target: EventTarget | null) => void,
  prev?: (distance?: number) => void,
  next?: (distance?: number) => void
) => {
  const setup = (doc: Document) => {
    if (!doc || (doc as any).__sireaderKeyboardSetup) return
    ;(doc as any).__sireaderKeyboardSetup = true
    let selectionTimer: any
    const triggerSelection = (e?: Event) => {
      if (!onSelectionChange) return
      clearTimeout(selectionTimer)
      selectionTimer = setTimeout(() => onSelectionChange(doc, e), 120)
    }
    const isInteractive = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      !!target.closest('input,textarea,button,select,a,[contenteditable="true"],.mark-menu,.sr-popup-panel,.reader-toolbar-group,.reader-toc-popup,[data-footnote-tooltip]')
    const turn = (dir: 'prev' | 'next', e: Event) => {
      if (isInteractive(e.target) || !prev || !next || reader?.getView?.()?.renderer?.getAttribute?.('flow') === 'scrolled') return false
      e.preventDefault()
      e.stopPropagation()
      dir === 'prev' ? prev() : next()
      return true
    }
    onSelectionChange && doc.addEventListener('selectionchange', triggerSelection)
    onSelectionChange && doc.addEventListener('mouseup', triggerSelection)
    onSelectionChange && doc.addEventListener('touchend', triggerSelection)
    onSelectionChange && doc.addEventListener('contextmenu', e => e.preventDefault())
    onTapZone && doc.addEventListener('tap', e => {
      const detail = (e as CustomEvent).detail || {}
      if (isInteractive(detail.target)) return
      if (!doc.getSelection()?.isCollapsed) return
      onTapZone(detail.x, doc, detail.target ?? null)
    })
    doc.addEventListener('wheel', e => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (Math.abs(delta) < 12) return
      turn(delta > 0 ? 'next' : 'prev', e)
    }, { passive: false })
    doc.addEventListener('mouseup', e => {
      if (e.button === 3) turn('next', e)
      else if (e.button === 4) turn('prev', e)
    })
    doc.addEventListener('keydown', e => {
      if (e.ctrlKey || e.altKey || e.metaKey) return handler(e)
      const scroll = reader?.getView?.()?.renderer?.getAttribute?.('flow') === 'scrolled'
      if (scroll) {
        const backward = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey)
        const forward = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)
        if (backward || forward) {
          e.preventDefault()
          e.stopPropagation()
          const size = Number(reader?.getView?.()?.renderer?.size)
          const distance = Number.isFinite(size) && size > 0 ? size * 0.9 : undefined
          void (backward ? prev?.(distance) : next?.(distance))
          return
        }
      }
      if (['ArrowLeft', 'ArrowUp'].includes(e.key) || (e.key === ' ' && e.shiftKey)) return turn('prev', e) || handler(e)
      if (['ArrowRight', 'ArrowDown', ' '].includes(e.key)) return turn('next', e) || handler(e)
      return handler(e)
    })
  }

  reader.on('load', ({ doc }: any) => setup(doc))
  setTimeout(() => reader.getView().renderer?.getContents?.()?.forEach(({ doc }: any) => setup(doc)), 500)
}

export const pdfQuickSendCommandId = (type: 'selection' | 'annotation', documentId: string) => 'sireader:send-' + type + ':' + encodeURIComponent(documentId)

export const PDF_SHORTCUT_COMMANDS = [
  ['sireader:copy-annotation-link', '复制标注回链'], ['sireader:dict-annotation', '标注词典'], ['sireader:translate-annotation', '标注翻译'],
  ['sireader:create-hole', '选区挖空'], ['sireader:dict-selection', '选区词典'], ['sireader:translate-selection', '选区翻译'],
  ['sireader:send-selection-menu', '发送选区'], ['sireader:send-annotation-menu', '发送标注'], ['sireader:capture-copy', '复制截图'],
  ['zoom:in', '放大'], ['zoom:out', '缩小'], ['zoom:fit-page', '适合页面'], ['zoom:fit-width', '适合宽度'], ['zoom:marquee', '框选缩放'],
  ['rotate:clockwise', '顺时针旋转'], ['rotate:counter-clockwise', '逆时针旋转'], ['scroll:previous-page', '上一页'], ['scroll:next-page', '下一页'],
  ['selection:copy', '复制选区'], ['panel:toggle-sidebar', '侧栏'], ['panel:toggle-search', '搜索面板'], ['panel:toggle-comment', '评论面板'],
  ['panel:toggle-annotation-style', '标注样式'], ['panel:toggle-redaction', '遮盖面板'], ['document:print', '打印'], ['document:export', '导出'],
  ['document:fullscreen', '全屏'], ['document:capture', '截图'], ['annotation:add-highlight', '高亮'], ['annotation:add-underline', '下划线'],
  ['annotation:add-strikeout', '删除线'], ['annotation:add-squiggly', '波浪线'], ['annotation:add-arrow', '箭头'], ['annotation:add-callout', '批注框'],
  ['annotation:add-circle', '圆形'], ['annotation:add-line', '直线'], ['annotation:add-link', '链接'], ['annotation:add-polygon', '多边形'],
  ['annotation:add-polyline', '折线'], ['annotation:add-rectangle', '矩形'], ['annotation:add-text', '文本标注'], ['annotation:add-ink', '画笔'],
  ['annotation:add-ink-highlighter', '荧光笔'], ['annotation:add-insert-text', '插入文本'], ['annotation:add-replace-text', '替换文本'],
  ['annotation:delete-selected', '删除标注'], ['annotation:toggle-comment', '标注评论'], ['annotation:toggle-link', '标注链接'],
  ['annotation:toggle-annotation-style', '标注样式'], ['annotation:toggle-widget-edit', '编辑标注'], ['annotation:goto-link', '打开链接'],
  ['redaction:redact-text', '文本遮盖'], ['redaction:delete-selected', '删除遮盖'], ['redaction:commit-selected', '提交遮盖'],
  ['insert:add-image', '插入图片'], ['insert:add-rubber-stamp', '插入印章'], ['insert:add-signature', '插入签名'],
  ['history:undo', '撤销'], ['history:redo', '重做'], ['pan:toggle', '平移'], ['pointer:toggle', '指针'],
  ['mode:view', '查看模式'], ['mode:annotate', '标注模式'], ['mode:insert', '插入模式'], ['mode:redact', '遮盖模式'], ['mode:form', '表单模式'],
] as const
