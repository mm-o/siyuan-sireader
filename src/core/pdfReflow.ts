export type ReflowRect = { origin: { x: number; y: number }; size: { width: number; height: number } }
export type ReflowBlock = { role?: string; text: string; spans?: { start: number; end: number; rect: ReflowRect }[] }
export type ReflowPage = { pageIndex: number; blocks: ReflowBlock[]; ocr: boolean; needsOCR?: boolean }
export type ReflowLayout = { width: number; height: number; fontSize: number }
// Text, output x/y/w/h, source x/y/w/h. Dense tuples keep document maps compact.
export type ReflowGlyph = [string, number, number, number, number, number, number, number, number]
export type ReflowAnnotationPage = { glyphs: ReflowGlyph[] }
export type ReflowDocument = { buffer: ArrayBuffer; pageMap: number[]; annotationMap: ReflowAnnotationPage[] }

export const reflowCharacters = (text: string) => Array.from(text.normalize('NFKC')).filter(c => !/[\s\u00ad\u200b]/u.test(c))
export const reflowProjectionId = (url: string, id: string) => `sireader-reflow:${encodeURIComponent(url)}:${id}`

const intersects = (rect: ReflowRect, x: number, y: number, w: number, h: number) => {
  const overlapX = Math.min(rect.origin.x + rect.size.width, x + w) - Math.max(rect.origin.x, x)
  const overlapY = Math.min(rect.origin.y + rect.size.height, y + h) - Math.max(rect.origin.y, y)
  return overlapX > 0 && overlapY > 0 && overlapX * overlapY >= w * h * .25
}
const bounds = (rects: ReflowRect[]): ReflowRect => {
  const x = Math.min(...rects.map(r => r.origin.x)), y = Math.min(...rects.map(r => r.origin.y))
  return { origin: { x, y }, size: { width: Math.max(...rects.map(r => r.origin.x + r.size.width)) - x, height: Math.max(...rects.map(r => r.origin.y + r.size.height)) - y } }
}

/** Project native annotations, not reader interactions. Never reuse output PDF coordinates on the source. */
export function projectReflowAnnotation(annotation: any, url: string, page: ReflowAnnotationPage | undefined, sourcePage: number) {
  const segments: ReflowRect[] = annotation.segmentRects?.length ? annotation.segmentRects : annotation.rect ? [annotation.rect] : []
  const matched = page?.glyphs.filter(g => segments.some(r => intersects(r, g[1], g[2], g[3], g[4]))) || []
  const rects = new Map<string, ReflowRect>()
  for (const g of matched) {
    rects.set(g.slice(5).join(','), { origin: { x: g[5], y: g[6] }, size: { width: g[7], height: g[8] } })
  }
  const text = annotation.custom?.text || matched.map(g => g[0]).join('').trim()
  const result: any = {
    id: reflowProjectionId(url, annotation.id), pageIndex: sourcePage,
    type: 0, rect: { origin: { x: 8, y: 8 }, size: { width: 24, height: 24 } },
    contents: [text, annotation.contents].filter(Boolean).join('\n\n') || 'Reflow annotation',
    created: annotation.created, modified: annotation.modified, author: annotation.author,
    color: annotation.color || annotation.strokeColor || '#FFCD45', strokeColor: annotation.strokeColor || annotation.color || '#FFCD45', opacity: annotation.opacity ?? 1,
    custom: { text, sireaderReflow: { url, annotationId: annotation.id, pageIndex: annotation.pageIndex } },
  }
  if ([9, 10, 11, 12].includes(annotation.type) && rects.size) {
    const segmentRects = [...rects.values()]
    Object.assign(result, { type: annotation.type, rect: bounds(segmentRects), segmentRects, contents: annotation.contents || '', blendMode: annotation.blendMode ?? 1 })
  }
  if (annotation.custom?.type === 'bookmark') Object.assign(result, { type: 1, flags: ['hidden', 'noView'], custom: { ...result.custom, type: 'bookmark', title: annotation.custom.title } })
  return result
}
