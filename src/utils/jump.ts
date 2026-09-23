export const pdfPageFromCfi = (cfi?: string) => Number(String(cfi || '').match(/^(?:#page-)?(\d+)$/)?.[1] || 0)

const flashEPUB = (view: any, cfi: string, resolved?: any) => {
  try {
    const { index, anchor } = resolved || view?.resolveCFI?.(cfi) || {}
    const doc = view?.renderer?.getContents?.().find((item: any) => item.index === index)?.doc
    const target = anchor?.(doc)
    const rects = Array.from(target?.getClientRects?.() || []).filter((rect: any) => rect.width && rect.height).slice(0, 8)
    if (!doc?.body || !rects.length) return
    if (!doc.getElementById('sireader-mark-flash-style')) {
      const style = doc.createElement('style')
      style.id = 'sireader-mark-flash-style'
      style.textContent = '@keyframes sireader-mark-flash{0%,100%{opacity:0;transform:scale(.98)}18%,70%{opacity:1;transform:scale(1)}}.sireader-mark-flash{position:fixed;z-index:2147483647;pointer-events:none;background:rgba(255,214,64,.42);outline:2px solid rgba(255,177,0,.9);border-radius:4px;box-shadow:0 0 0 4px rgba(255,214,64,.22);animation:sireader-mark-flash 1.25s ease-out both}'
      doc.head.appendChild(style)
    }
    rects.forEach((rect: any) => {
      const el = doc.createElement('span')
      el.className = 'sireader-mark-flash'
      el.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`
      doc.body.appendChild(el)
      setTimeout(() => el.remove(), 1300)
    })
  } catch {}
}

export const gotoEPUB = async (cfi: string, id: string | undefined, reader: any, marks: any) => {
  const mark = marks?.getAll?.().find((item: any) => (id && item.id === id) || item.cfi === cfi)
  const target = mark?.cfi || cfi
  const view = reader?.getView?.()
  if (!target) return
  const resolved = reader?.goTo ? await reader.goTo(target) : await view?.goTo?.(target)
  requestAnimationFrame(() => flashEPUB(view || reader?.getView?.(), target, resolved))
  return resolved
}

export const markTarget = (item: any) =>
  typeof item === 'number' ? `#page-${item}` : typeof item === 'string' ? item : item?.cfi || (item?.page ? `#page-${item.page}` : '')

export const jump = (item: any, activeView: any, activeReader: any, marks: any) => {
  const target = markTarget(item)
  const page = pdfPageFromCfi(target)
  if (activeView?.isOnlineContext && target) activeView.goTo(target)
  else if (activeView?.isPdf && page) activeView.goTo?.(page, item?.id)
  else if (target) void gotoEPUB(target, item?.id, activeReader, marks)
}
