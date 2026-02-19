/**
 * PDF标注辅助工具 - 基于思源笔记的PDF标注逻辑
 * 解决PDF选择漂移、跨页选择、水印误选等问题
 */

export interface PdfRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface PdfAnnotation {
  id: string
  index: number  // 页码索引
  coords: number[][]  // PDF坐标数组 [x1, y1, x2, y2]
  color: string
  content: string
  type: 'text' | 'border'
  mode: 'text' | 'rect'
}

export interface PdfPageInfo {
  index: number
  positions: number[][]
}

/**
 * 查找页面中的文本节点（首个或末尾）
 * @param element 页面元素
 * @param isFirst true=首个，false=末尾
 */
export function getTextNode(element: HTMLElement, isFirst: boolean): Element | null {
  const spans = element.querySelectorAll('span[role="presentation"]')||element.querySelectorAll('span')
  let i = isFirst ? 0 : spans.length - 1
  const step = isFirst ? 1 : -1
  while (spans[i]&&!(spans[i].textContent?.trim())) i += step
  return spans[i]||null
}

/**
 * 合并同一行的矩形
 */
export function mergeRects(range: Range): PdfRect[] {
  const rects = range.getClientRects()
  const merged: PdfRect[] = []
  let lastTop: number | undefined
  Array.from(rects).forEach(r => {
    if (r.height === 0 || r.width === 0) return
    if (typeof lastTop === 'undefined' || Math.abs(lastTop - r.top) > 4) {
      merged.push({left: r.left, top: r.top, right: r.right, bottom: r.bottom})
      lastTop = r.top
    } else {
      merged[merged.length - 1].right = r.right
    }
  })
  return merged
}

export function hasClosestByClassName(element: Node | null, className: string): HTMLElement | null {
  let cur = element?.nodeType === 1 ? element as HTMLElement : (element as any)?.parentElement
  while (cur) {
    if (cur.classList?.contains(className)) return cur
    cur = cur.parentElement
  }
  return null
}

/**
 * 从Range获取高亮坐标 - 支持跨页选择
 * @param viewer PDF查看器实例（PDFViewer对象）
 * @param range 选择范围
 * @param color 高亮颜色
 */
export function getHighlightCoordsByRange(viewer: any, range: Range, color: string): PdfAnnotation[] | null {
  if (!viewer?.getPages) return null
  
  // 获取起始页和结束页
  const startPageElement = hasClosestByClassName(range.startContainer, 'pdf-page')
  const endPageElement = hasClosestByClassName(range.endContainer, 'pdf-page')
  if (!startPageElement || !endPageElement) return null
  
  const startIndex = parseInt(startPageElement.getAttribute('data-page') || '1') - 1
  const endIndex = parseInt(endPageElement.getAttribute('data-page') || '1') - 1
  
  // 处理换行符和连字符
  const rc = range.cloneContents()
  Array.from(rc.children).forEach(item => {
    if (item.tagName === 'BR' && item.previousElementSibling && item.nextElementSibling) {
      const prev = item.previousElementSibling.textContent || ''
      const next = item.nextElementSibling.textContent || ''
      if (/^[A-Za-z]$/.test(prev.slice(-2, -1)) && /^[A-Za-z]$/.test(next[0])) {
        if (prev.endsWith('-')) {
          item.previousElementSibling.textContent = prev.slice(0, -1)
        } else {
          item.insertAdjacentText('afterend', ' ')
        }
      }
    }
  })
  const content = rc.textContent?.replace(/[\x00]|\n/g, '') || ''
  
  // 获取页面信息
  const pages = viewer.getPages()
  const startPage = pages?.get(startIndex + 1)
  const startCanvas = startPageElement.querySelector('canvas')
  if (!pages || !startPage || !startCanvas) return null
  
  const startPageRect = startCanvas.getBoundingClientRect()
  const startViewport = startPage.getViewport({ scale: viewer.getScale(), rotation: 0 })
  const cloneRange = range.cloneRange()
  
  // 跨页处理：截断起始页到页尾
  if (startIndex !== endIndex) {
    const textLayer = startPageElement.querySelector('.textLayer') as HTMLElement
    const lastNode = textLayer && getTextNode(textLayer, false)
    if (lastNode) range.setEndAfter(lastNode)
  }
  
  // 处理起始页
  const startSelected: number[][] = []
  mergeRects(range).forEach(r => {
    startSelected.push(
      startViewport.convertToPdfPoint(r.left - startPageRect.x, r.top - startPageRect.y)
        .concat(startViewport.convertToPdfPoint(r.right - startPageRect.x, r.bottom - startPageRect.y))
    )
  })
  
  // 处理结束页
  const endSelected: number[][] = []
  if (startIndex !== endIndex) {
    const endPage = pages.get(endIndex + 1)
    const endCanvas = endPageElement.querySelector('canvas')
    if (!endPage || !endCanvas) return null
    
    const endPageRect = endCanvas.getBoundingClientRect()
    const endViewport = endPage.getViewport({ scale: viewer.getScale(), rotation: 0 })
    
    // 从页首开始
    const textLayer = endPageElement.querySelector('.textLayer') as HTMLElement
    const firstNode = textLayer && getTextNode(textLayer, true)
    if (firstNode) cloneRange.setStart(firstNode, 0)
    
    mergeRects(cloneRange).forEach(r => {
      endSelected.push(
        endViewport.convertToPdfPoint(r.left - endPageRect.x, r.top - endPageRect.y)
          .concat(endViewport.convertToPdfPoint(r.right - endPageRect.x, r.bottom - endPageRect.y))
      )
    })
  }
  
  // 生成结果
  const id = generateId()
  const results: PdfAnnotation[] = []
  if (startSelected.length) results.push({id, index: startIndex, coords: startSelected, color, content, type: 'text', mode: 'text'})
  if (endSelected.length) results.push({id, index: endIndex, coords: endSelected, color, content, type: 'text', mode: 'text'})
  return results.length ? results : null
}

/**
 * 从矩形框获取高亮坐标（框选模式）
 */
export function getHighlightCoordsByRect(
  pdf: any,
  rect: DOMRect,
  color: string,
  type: 'text' | 'border'
): PdfAnnotation[] | null {
  // 获取起始页（矩形左上角）
  const startPageElement = hasClosestByClassName(
    document.elementFromPoint(rect.left, rect.top - 1),
    'pdf-page'
  )
  if (!startPageElement) {
    return null
  }
  const startIndex = parseInt(startPageElement.getAttribute('data-page') || '1') - 1
  
  const startPage = pdf.pdfViewer.getPages().get(startIndex + 1)
  if (!startPage) return null
  
  const startCanvas = startPageElement.querySelector('canvas')
  if (!startCanvas) return null
  
  const startPageRect = startCanvas.getBoundingClientRect()
  const startViewport = startPage.getViewport({ scale: pdf.pdfViewer.getScale(), rotation: pdf.pdfViewer.getRotation() })
  
  // 转换为PDF坐标
  const startSelected = startViewport.convertToPdfPoint(
    rect.left - startPageRect.x,
    rect.top - startPageRect.y
  ).concat(
    startViewport.convertToPdfPoint(
      rect.right - startPageRect.x,
      rect.bottom - startPageRect.y
    )
  )
  
  const id = generateId()
  const results: PdfAnnotation[] = [{
    id,
    index: startIndex,
    coords: [startSelected],
    color,
    content: `Page-${startIndex + 1}-${id}`,
    type,
    mode: 'rect'
  }]
  
  // 检查是否跨页（矩形右下角）
  const endPageElement = hasClosestByClassName(
    document.elementFromPoint(rect.right, rect.bottom + 1),
    'pdf-page'
  )
  
  if (endPageElement) {
    const endIndex = parseInt(endPageElement.getAttribute('data-page') || '1') - 1
    
    if (endIndex !== startIndex) {
      const endPage = pdf.pdfViewer.getPages().get(endIndex + 1)
      if (!endPage) return results
      
      const endCanvas = endPageElement.querySelector('canvas')
      if (!endCanvas) return results
      
      const endPageRect = endCanvas.getBoundingClientRect()
      const endViewport = endPage.getViewport({ scale: pdf.pdfViewer.getScale(), rotation: pdf.pdfViewer.getRotation() })
      
      const endSelected = endViewport.convertToPdfPoint(
        rect.left - endPageRect.x,
        rect.top - endPageRect.y
      ).concat(
        endViewport.convertToPdfPoint(
          rect.right - endPageRect.x,
          rect.bottom - endPageRect.y
        )
      )
      
      results.push({
        id,
        index: endIndex,
        coords: [endSelected],
        color,
        content: `Page-${endIndex + 1}-${id}`,
        type,
        mode: 'rect'
      })
    }
  }
  
  return results
}

/**
 * 渲染高亮标注到页面
 */
export function renderHighlight(
  annotation: PdfAnnotation,
  pdf: any,
  layerClass: string = 'pdf-annotation-layer'
): HTMLElement | null {
  const page = pdf.pdfViewer.getPages().get(annotation.index + 1)
  if (!page) return null
  
  const viewport = page.getViewport({ scale: pdf.pdfViewer.getScale(), rotation: pdf.pdfViewer.getRotation() })
  
  // 查找或创建标注层
  const pageElement = document.querySelector(`[data-page="${annotation.index + 1}"]`)
  if (!pageElement) return null
  
  let layer = pageElement.querySelector(`.${layerClass}`) as HTMLElement
  if (!layer) {
    layer = document.createElement('div')
    layer.className = layerClass
    layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:10'
    pageElement.appendChild(layer)
  }
  
  // 创建标注容器
  const container = document.createElement('div')
  container.className = 'pdf-highlight'
  container.dataset.id = annotation.id
  container.dataset.mode = annotation.mode
  container.style.pointerEvents = 'auto'
  
  // 渲染每个矩形
  annotation.coords.forEach(rect => {
    const bounds = viewport.convertToViewportRectangle(rect)
    const width = Math.abs(bounds[0] - bounds[2])
    const height = Math.abs(bounds[1] - bounds[3])
    
    if (width <= 0 || height <= 0) return
    
    const div = document.createElement('div')
    div.style.cssText = `
      position: absolute;
      left: ${Math.min(bounds[0], bounds[2])}px;
      top: ${Math.min(bounds[1], bounds[3])}px;
      width: ${width}px;
      height: ${height}px;
      pointer-events: auto;
      cursor: pointer;
    `
    
    // 根据类型设置样式
    if (annotation.type === 'text') {
      div.style.backgroundColor = annotation.color
      div.style.opacity = '0.3'
    } else {
      div.style.border = `2px solid ${annotation.color}`
      div.style.opacity = '0.8'
    }
    
    container.appendChild(div)
  })
  
  layer.appendChild(container)
  return container
}

/**
 * 清除页面上的标注
 */
export function clearHighlight(annotationId: string, pageIndex?: number): void {
  const selector = pageIndex !== undefined
    ? `[data-page="${pageIndex + 1}"] .pdf-highlight[data-id="${annotationId}"]`
    : `.pdf-highlight[data-id="${annotationId}"]`
  
  document.querySelectorAll(selector).forEach(el => el.remove())
}

export function scrollToAnnotation(el: HTMLElement, cid = 'viewerContainer'): void {
  if (!el?.firstElementChild) return
  const c = document.getElementById(cid)
  if (!c) return
  const r = el.firstElementChild.getBoundingClientRect()
  const cr = c.getBoundingClientRect()
  if (r.top < cr.top) {
    c.scrollTop -= (cr.top - r.top) + (cr.height - r.height) / 2
  } else if (r.bottom > cr.bottom) {
    c.scrollTop += (r.bottom - cr.bottom) + (cr.height - r.height) / 2
  }
}

export function highlightAnnotation(el: HTMLElement, id: string, dur = 1500): void {
  el.querySelectorAll(`.pdf-highlight[data-id="${id}"]`).forEach(item => {
    if (item?.firstElementChild) {
      scrollToAnnotation(item as HTMLElement)
      item.classList.add('pdf-highlight--flash')
      setTimeout(() => item.classList.remove('pdf-highlight--flash'), dur)
    }
  })
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 从当前选择创建标注
 */
export function createAnnotationFromSelection(
  pdf: any,
  color: string = '#ffeb3b'
): PdfAnnotation[] | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return null
  }
  
  const range = selection.getRangeAt(0)
  if (range.toString().trim() === '') {
    return null
  }
  
  return getHighlightCoordsByRange(pdf, range, color)
}

/**
 * 检查选择是否在PDF查看器内
 */
export function isSelectionInPdfViewer(selection: Selection | null): boolean {
  if (!selection || selection.rangeCount === 0) {
    return false
  }
  
  const range = selection.getRangeAt(0)
  return !!hasClosestByClassName(range.commonAncestorContainer, 'pdfViewer')
}
