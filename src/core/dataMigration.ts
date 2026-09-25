import type { BookRecord, EmbedPdfProgress } from './bookStore'

type PdfMigrationIO = {
  readRecord: (url: string) => Promise<BookRecord | null>
  writeRecord: (url: string, record: BookRecord, base?: BookRecord | null) => Promise<BookRecord>
  readLegacyBlob: (url: string) => Promise<Blob | null>
  removeLegacy: (url: string) => Promise<any>
}

const tasks = new Map<string, Promise<BookRecord | null>>()
const req = (id: string) => { try { return (window as any).require?.(id) } catch { return null } }
const now = () => typeof performance === 'undefined' ? Date.now() : performance.now()
const sleep = () => new Promise(resolve => setTimeout(resolve, 0))
const taskToPromise = <T>(task: any) => new Promise<T>((resolve, reject) => task?.wait ? task.wait(resolve, reject) : resolve(task as T))
const emitMigration = (detail: Record<string, any>) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('sireader:pdf-migration', { detail }))
}
const tags = (value: any) => Array.isArray(value) ? value.map(String).filter(Boolean) : String(value || '').replace(/\uFF0C/g, ',').split(',').map(t => t.trim()).filter(Boolean)
const date = (value: any) => {
  const d = new Date(value || Date.now())
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}
const pageIndexOf = (item: any, data = item?.data || {}) => {
  const page = data.pageIndex ?? item.pageIndex ?? (Number(data.page || item.page || String(data.cfi || item.loc || '').match(/page-(\d+)/)?.[1] || 1) - 1)
  return Math.max(0, Number.isFinite(Number(page)) ? Number(page) : 0)
}
const pageOf = (value: any, fallback = 0) => Math.max(0, Number(value?.pageIndex ?? (Number(value?.page || 0) ? Number(value.page) - 1 : fallback)) || 0)
const LEGACY_COORD_VERSION = 'embedpdf-v3'
export const PDF_MIGRATION_VERSION = 'embedpdf-text-v3'
const DEFAULT_HIGHLIGHT = '#FFCD45'
const DEFAULT_STROKE = '#E44234'
const DEFAULT_TEXT = '#000000'
const pageHeightsMap = (heights: number[] = []) => new Map<number, number>(heights.map((height, index) => [index, Number(height) || 0] as [number, number]).filter(([, height]) => height > 0))
const rect = (value: any = {}, pageHeight = 0) => Array.isArray(value)
  ? { origin: { x: Math.min(Number(value[0] || 0), Number(value[2] ?? value[0] ?? 0)), y: Math.min(Number(value[1] || 0), Number(value[3] ?? value[1] ?? 0)) }, size: { width: Math.abs(Number(value[2] ?? value[0] ?? 0) - Number(value[0] || 0)) || 1, height: Math.abs(Number(value[3] ?? value[1] ?? 0) - Number(value[1] || 0)) || 1 } }
  : ((x, y, w, h) => ({
    origin: { x: x + (w < 0 ? w : 0), y: pageHeight ? pageHeight - y - (h > 0 ? h : 0) : y + (h < 0 ? h : 0) },
    size: { width: Math.max(1, Math.abs(w || 1)), height: Math.max(1, Math.abs(h || 1)) },
  }))(Number(value.x ?? value.left ?? 0), Number(value.y ?? value.top ?? 0), Number(value.w ?? value.width ?? 0), Number(value.h ?? value.height ?? 1))
const flipLegacyRect = (box: any, pageHeight = 0) => pageHeight ? { ...box, origin: { ...(box?.origin || {}), y: Math.max(0, pageHeight - Number(box?.origin?.y || 0) - Number(box?.size?.height || 1)) } } : box
const bounds = (rects: any[] = []) => {
  const xs = rects.flatMap(r => [Number(r?.origin?.x || 0), Number(r?.origin?.x || 0) + Number(r?.size?.width || 0)])
  const ys = rects.flatMap(r => [Number(r?.origin?.y || 0), Number(r?.origin?.y || 0) + Number(r?.size?.height || 0)])
  const x = Math.min(...xs), y = Math.min(...ys)
  return rects.length ? { origin: { x, y }, size: { width: Math.max(...xs) - x || 1, height: Math.max(...ys) - y || 1 } } : fallbackRect
}
const clean = (value: Record<string, any>) => Object.fromEntries(Object.entries(value).filter(([, v]) => Array.isArray(v) ? v.length : v != null && v !== ''))
const embedItem = (annotation: any) => ({ annotation })
const isEmbedItem = (item: any) => typeof (item?.annotation || item)?.type === 'number'
const fallbackRect = { origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } }
const annotationId = (item: any) => (item?.annotation || item)?.id || ''
const plainValue = (value: any): any => {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value
  if (value instanceof Date || value instanceof ArrayBuffer) return value
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
  if (Array.isArray(value)) return value.map(plainValue)
  return typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v !== 'function' && typeof v !== 'symbol').map(([k, v]) => [k, plainValue(v)])) : undefined
}
const pdfNum = (value: any) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0
const pdfRect = (box: any) => ({ origin: { x: pdfNum(box?.origin?.x), y: pdfNum(box?.origin?.y) }, size: { width: Math.max(1, pdfNum(box?.size?.width)), height: Math.max(1, pdfNum(box?.size?.height)) } })
const pdfPoint = (point: any) => ({ x: pdfNum(point?.x), y: pdfNum(point?.y) })
const linePoints = (value: any, box: any) => {
  if (Array.isArray(value)) return { start: pdfPoint(value[0]), end: pdfPoint(value[1]) }
  if (value?.start || value?.end) return { start: pdfPoint(value.start), end: pdfPoint(value.end) }
  const rect = pdfRect(box)
  return { start: rect.origin, end: { x: pdfNum(rect.origin.x + rect.size.width), y: pdfNum(rect.origin.y + rect.size.height) } }
}
const isPdfLinkAnnotation = (a: any) => a?.type === 2 && !!(a.action || a.target || a.destination || a.dest || a.url || a.uri || a.href)
export const isUserEmbedPdfAnnotation = (item: any) => {
  const a = item?.annotation || item
  return typeof a?.type === 'number' && !isPdfLinkAnnotation(a) && (a.type !== 2 || !!(a.created || a.modified || a.author || a.custom || String(a.contents || '').trim()))
}
const compactPdfRects = (rects: any[] = []) => rects.map(pdfRect).sort((a, b) => a.origin.y - b.origin.y || a.origin.x - b.origin.x).reduce((list: any[], rect) => {
  const last = list[list.length - 1]
  if (last && Math.abs(last.origin.y - rect.origin.y) <= 2 && Math.abs(last.size.height - rect.size.height) <= 3 && rect.origin.x <= last.origin.x + last.size.width + 8) {
    last.size.width = pdfNum(Math.max(last.origin.x + last.size.width, rect.origin.x + rect.size.width) - last.origin.x)
    last.origin.y = pdfNum(Math.min(last.origin.y, rect.origin.y))
    last.size.height = pdfNum(Math.max(last.size.height, rect.size.height))
  } else list.push(rect)
  return list
}, [])
export const normalizeEmbedPdfAnnotations = (annotations: any[] = []) => [...(Array.isArray(annotations) ? annotations : []).reduce((map, item, index) => {
  if (!isUserEmbedPdfAnnotation(item)) return map
  const annotation = plainValue(item.annotation || item)
  if (!annotation.rect && Array.isArray(annotation.segmentRects) && annotation.segmentRects.length) annotation.rect = bounds(annotation.segmentRects)
  if (!annotation.rect) annotation.rect = fallbackRect
  if ([9, 10, 11, 12].includes(annotation.type) && !Array.isArray(annotation.segmentRects) && annotation.rect) annotation.segmentRects = [annotation.rect]
  if (Array.isArray(annotation.segmentRects)) annotation.segmentRects = compactPdfRects(annotation.segmentRects)
  if ([7, 8].includes(annotation.type)) annotation.vertices = Array.isArray(annotation.vertices) ? annotation.vertices.map(pdfPoint) : []
  if (annotation.type === 4) annotation.linePoints = linePoints(annotation.linePoints, annotation.rect)
  if (annotation.type === 15 && !Array.isArray(annotation.inkList)) annotation.inkList = []
  if (Array.isArray(annotation.inkList)) annotation.inkList = annotation.inkList.map((path: any) => ({ ...path, points: Array.isArray(path?.points) ? path.points.map(pdfPoint) : [] }))
  if (annotation.strokeDashArray && !Array.isArray(annotation.strokeDashArray)) annotation.strokeDashArray = []
  if (annotation.replies && !Array.isArray(annotation.replies)) delete annotation.replies
  if (annotation.rect) annotation.rect = annotation.segmentRects?.length ? pdfRect(bounds(annotation.segmentRects)) : pdfRect(annotation.rect)
  if (annotation.unrotatedRect) annotation.unrotatedRect = pdfRect(annotation.unrotatedRect)
  if (annotation.contents === '') delete annotation.contents
  if (annotation.custom && typeof annotation.custom === 'object') {
    if (annotation.custom.note === annotation.contents) delete annotation.custom.note
    ;['legacyType', 'legacyCoord', 'textCoord'].forEach(key => delete annotation.custom[key])
    if (!Object.keys(annotation.custom).length) delete annotation.custom
  } else delete annotation.custom
  return map.set(annotation.id || `#${index}`, { annotation, ...(item.ctx ? { ctx: plainValue(item.ctx) } : {}) })
}, new Map<string, any>()).values()]
const migrationDone = (record: BookRecord | null) => record?.migration?.pdfAnnotations === PDF_MIGRATION_VERSION
const isStandardEmbedPdfRecord = (record: BookRecord | null) => !!record && (record.annotations || []).every((item: any) => isEmbedItem(item) && !item?.annotation?.custom?.legacyType && !item?.annotation?.custom?.textCoord && !item?.annotation?.custom?.legacyCoord)
const needsPageHeights = (record: BookRecord) => (record.annotations || []).some((item: any) => !isEmbedItem(item) && ['highlight', 'note'].includes(String(item?.type || item?.data?.type || '').toLowerCase()) && (item?.data?.rects || item?.rects)?.length)
const needsLegacyHighlightGeometryRepair = (annotation: any) => {
  return annotation?.custom?.legacyType === 'highlight' && annotation?.custom?.legacyCoord !== LEGACY_COORD_VERSION
}
const needsLegacyNoteRepair = (annotation: any) => annotation?.custom?.legacyType === 'note' && annotation?.custom?.text && annotation?.custom?.textCoord !== PDF_MIGRATION_VERSION
const fixLegacyNote = (annotation: any) => ({ ...annotation, type: 9, strokeColor: DEFAULT_HIGHLIGHT, opacity: 1, contents: annotation.custom.note || annotation.contents || '' })
const fixLegacyHighlightGeometry = (annotation: any, pageHeight = 0) => {
  if (!needsLegacyHighlightGeometryRepair(annotation)) return annotation
  const segments = Array.isArray(annotation?.segmentRects) ? annotation.segmentRects : []
  const lift = (box: any) => {
    const h = Math.max(14, Math.abs(Number(box?.size?.height || 18)) || 18)
    const fixed = flipLegacyRect(box, pageHeight)
    return {
      ...fixed,
      origin: fixed.origin || { x: 0, y: 0 },
      size: { ...(fixed?.size || {}), height: h },
    }
  }
  const fixedSegments = segments.map(lift)
  return { ...annotation, custom: { ...(annotation.custom || {}), legacyCoord: LEGACY_COORD_VERSION }, rect: fixedSegments.length ? bounds(fixedSegments) : lift(annotation.rect), segmentRects: fixedSegments }
}
const needsEmbedRepair = (item: any, heights = new Map<number, number>()) => {
  const source = item?.annotation || item
  return !item?.annotation || !source.id || !Number.isFinite(Number(source.pageIndex || 0)) || !source.created || !source.modified || needsLegacyNoteRepair(source) || (needsLegacyHighlightGeometryRepair(source) && !!heights.get(pageIndexOf(source)))
}

const repairEmbedItem = (item: any, index: number, heights = new Map<number, number>()) => {
  const source = item?.annotation || item
  if (!isEmbedItem(source)) return null
  const annotation = {
    ...source,
    id: source.id || `annotation-${index}-${Date.now()}`,
    pageIndex: Math.max(0, Number(source.pageIndex || 0)),
    created: date(source.created),
    modified: date(source.modified || source.updated || source.created),
  }
  const pageHeight = heights.get(annotation.pageIndex) || 0
  const fixed = needsLegacyNoteRepair(annotation)
    ? fixLegacyNote(annotation)
    : source?.custom?.legacyType === 'highlight' && pageHeight ? fixLegacyHighlightGeometry(annotation, pageHeight) : annotation
  return { annotation: fixed, ...(item?.ctx ? { ctx: item.ctx } : {}) }
}

const legacyToEmbedItem = (item: any, index: number, heights = new Map<number, number>()) => {
  const data = item?.data || {}
  const type = String(item?.type || data.type || '').toLowerCase()
  const pageIndex = pageIndexOf(item, data)
  const custom = clean({
    text: item.text || data.text || item.title,
    note: item.note || data.note,
    tags: tags(item.tags || data.tags),
    blockId: item.blockId || item.block || data.blockId || data.block,
    chapter: item.chapter || data.chapter,
    customOrder: item.customOrder || data.customOrder,
    legacyType: type,
    legacyCoord: LEGACY_COORD_VERSION,
  })
  const base = { id: item.id || `legacy-${index}-${Date.now()}`, pageIndex, flags: ['print'], created: date(item.created || data.created), modified: date(item.updated || item.modified || data.updated || item.created), author: 'SiReader', custom }
  if (type === 'bookmark') return embedItem({ ...base, type: 1, rect: fallbackRect, contents: item.title || item.text || custom.chapter || `Page ${pageIndex + 1}`, flags: ['hidden', 'noView'], custom: { ...custom, type: 'bookmark', title: item.title || item.text || `Page ${pageIndex + 1}` } })
  if (type === 'highlight') {
    if (!heights.get(pageIndex)) return null
    const rects = (data.rects || item.rects || []).map((box: any) => rect(box, heights.get(pageOf(box, pageIndex)) || heights.get(pageIndex) || 0)).filter(Boolean)
    if (rects.length) return embedItem({ ...base, type: 9, strokeColor: DEFAULT_HIGHLIGHT, opacity: 1, rect: bounds(rects), segmentRects: rects, contents: item.note || data.note || '' })
  }
  if (type === 'note') {
    const rects = (data.rects || item.rects || []).map((box: any) => rect(box, heights.get(pageOf(box, pageIndex)) || heights.get(pageIndex) || 0)).filter(Boolean)
    if (rects.length) return embedItem({ ...base, type: 9, strokeColor: DEFAULT_HIGHLIGHT, opacity: 1, rect: bounds(rects), segmentRects: rects, contents: item.note || data.note || '' })
  }
  const box = () => rect(data.rect || item.rect, heights.get(pageIndex) || 0)
  if (type === 'ink') return embedItem({ ...base, type: 15, strokeColor: DEFAULT_STROKE, color: DEFAULT_STROKE, opacity: 1, strokeWidth: data.paths?.[0]?.width || item.strokeWidth || 2, rect: box(), inkList: (data.paths || item.paths || []).map((path: any) => ({ points: path.points || [] })), contents: item.note || data.note || item.text || data.text || '' })
  if (type === 'shape' && data.shapeType === 'textbox') return embedItem({ ...base, type: 3, rect: box(), unrotatedRect: box(), contents: item.text || data.text || item.note || data.note || '', fontSize: 14, fontColor: DEFAULT_TEXT, fontFamily: 4, textAlign: 0, verticalAlign: 0, color: 'transparent', backgroundColor: 'transparent', opacity: 1, rotation: 0 })
  if (type === 'shape') return embedItem({ ...base, type: data.shapeType === 'circle' ? 6 : 5, rect: box(), color: 'transparent', strokeColor: DEFAULT_STROKE, strokeWidth: 2, strokeStyle: 0, opacity: 1, contents: item.note || data.note || item.text || data.text || '' })
  if (type === 'note' || item.note || data.note || item.text || data.text) return embedItem({ ...base, type: 3, rect: box(), unrotatedRect: box(), contents: item.note || data.note || item.text || data.text || '', fontSize: 14, fontColor: DEFAULT_TEXT, fontFamily: 4, textAlign: 0, verticalAlign: 0, color: 'transparent', backgroundColor: 'transparent', opacity: 1, rotation: 0 })
  return null
}

const readLegacyRecord = async (blob: Blob | null): Promise<Partial<BookRecord> | null> => {
  if (!blob) return null
  const buffer = await blob.arrayBuffer()
  let record: any
  try { record = JSON.parse(new TextDecoder().decode(buffer)) } catch {
    const v8 = req('v8'), Buffer = req('buffer')?.Buffer || (window as any).Buffer
    if (v8 && Buffer) record = v8.deserialize(Buffer.from(buffer))
  }
  return record?.version === 1 ? { book: record.book || {}, annotations: Array.isArray(record.annotations) ? record.annotations : [], progress: record.progress, updatedAt: record.updatedAt || record.progress?.updatedAt || Date.now() } : null
}

const mergeAnnotations = (current: any[] = [], legacy: any[] = []) => {
  const seen = new Set(current.map(annotationId).filter(Boolean))
  const annotations = [...current]
  let kept = 0
  for (const item of legacy) {
    const id = annotationId(item)
    if (id && seen.has(id)) { kept++; continue }
    if (id) seen.add(id)
    annotations.push(item)
    kept++
  }
  return { annotations, complete: kept >= legacy.length }
}

const mergeLegacyRecord = async (url: string, record: BookRecord | null, io: PdfMigrationIO) => {
  const legacy = await readLegacyRecord(await io.readLegacyBlob(url))
  if (!legacy) return record
  const merged = mergeAnnotations(record?.annotations, legacy.annotations)
  const next = { version: 1 as const, book: { ...(legacy.book || {}), ...(record?.book || {}) }, annotations: merged.annotations, progress: record?.progress || legacy.progress, migration: record?.migration, updatedAt: Date.now() }
  const committed = await io.writeRecord(url, next, record)
  if (merged.complete) await io.removeLegacy(url).catch(() => {})
  return committed
}

export const migratePdfRecord = async (record: BookRecord, pageHeights: number[] = [], batchSize = 500, budgetMs = 8, onProgress?: (done: number, total: number) => void) => {
  if (!pageHeights.length && needsPageHeights(record)) return { record, changed: false }
  const source = Array.isArray(record.annotations) ? record.annotations : []
  const annotations: any[] = []
  let changed = !Array.isArray(record.annotations)
  let slice = now()
  const heights = pageHeightsMap(pageHeights)
  for (let i = 0; i < source.length; i++) {
    try {
      const wasEmbed = isEmbedItem(source[i])
      const needsRepair = wasEmbed && needsEmbedRepair(source[i], heights)
      const item = wasEmbed ? repairEmbedItem(source[i], i, heights) : legacyToEmbedItem(source[i], i, heights)
      if (item) {
        annotations.push(item)
        if (wasEmbed) changed = changed || needsRepair
        else changed = true
      } else {
        annotations.push(source[i])
      }
    } catch {
      annotations.push(source[i])
      changed = true
    }
    if (i && (i % batchSize === 0 || now() - slice >= budgetMs)) {
      await sleep()
      onProgress?.(i + 1, source.length)
      slice = now()
    }
  }
  onProgress?.(source.length, source.length)
  const progress = record.progress || (record.book?.chapter ? { pageNumber: record.book.chapter, totalPages: record.book.total || 0, updatedAt: record.book.read || Date.now() } as EmbedPdfProgress : undefined)
  const migration = { ...(record.migration || {}), pdfAnnotations: PDF_MIGRATION_VERSION }
  return { record: { ...record, annotations, progress, migration, updatedAt: changed || !migrationDone(record) ? Date.now() : record.updatedAt }, changed: changed || !migrationDone(record) }
}

export const ensurePdfRecordMigrated = (url: string, io: PdfMigrationIO, pageHeights: number[] = []) => {
  const taskKey = `${url}:${pageHeights.length ? 'pages' : 'raw'}`
  const running = tasks.get(taskKey)
  if (running) return running
  const task = (async () => {
    const current = await io.readRecord(url)
    if (migrationDone(current)) return current
    if (isStandardEmbedPdfRecord(current)) {
      const next = { ...current, annotations: normalizeEmbedPdfAnnotations(current.annotations || []), migration: { ...(current.migration || {}), pdfAnnotations: PDF_MIGRATION_VERSION } }
      return await io.writeRecord(url, next, current)
    }
    emitMigration({ url, phase: 'start', done: 0, total: 0 })
    const record = await mergeLegacyRecord(url, current, io)
    if (!record) {
      emitMigration({ url, phase: 'done', done: 0, total: 0 })
      return null
    }
    const migrated = await migratePdfRecord(record, pageHeights, 500, 8, (done, total) => emitMigration({ url, phase: 'progress', done, total }))
    if (migrated.changed) migrated.record = await io.writeRecord(url, { ...migrated.record, annotations: normalizeEmbedPdfAnnotations(migrated.record.annotations) }, record)
    emitMigration({ url, phase: 'done', done: migrated.record.annotations.length, total: migrated.record.annotations.length })
    return migrated.record
  })().finally(() => tasks.delete(taskKey))
  tasks.set(taskKey, task)
  return task
}

const textPart = (value = '') => String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const textKey = (value = '') => [...String(value)].map(textPart).join('')
const textMap = (value = '') => {
  const map: number[] = []
  const key = [...String(value)].map((char, index) => {
    const part = textPart(char)
    for (let i = 0; i < part.length; i++) map.push(index)
    return part
  }).join('')
  return { key, map }
}
const textMatches = (key: string, needle: string) => {
  const exact = []
  for (let at = key.indexOf(needle); at >= 0; at = key.indexOf(needle, at + 1)) exact.push(at)
  if (exact.length || needle.length < 4) return exact
  const n = Math.min(4, Math.max(2, Math.floor(needle.length / 2)))
  const hits = new Map<number, number>()
  for (let i = 0; i <= needle.length - n; i++) for (let at = key.indexOf(needle.slice(i, i + n)); at >= 0; at = key.indexOf(needle.slice(i, i + n), at + 1)) {
    const start = Math.max(0, Math.min(key.length - needle.length, at - i))
    hits.set(start, (hits.get(start) || 0) + n)
  }
  return [...hits.entries()].filter(([, score]) => score >= Math.max(2, needle.length * .45)).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([start]) => start)
}
const rectCenter = (box: any) => ({ x: Number(box?.origin?.x || 0) + Number(box?.size?.width || 0) / 2, y: Number(box?.origin?.y || 0) + Number(box?.size?.height || 0) / 2 })
const rectDistance = (a: any, b: any) => {
  const ca = rectCenter(a), cb = rectCenter(b)
  return Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y)
}
const rectsFromGeometry = (geo: any, start: number, end: number) => (geo?.runs || []).flatMap((run: any) => {
  const runStart = Number(run.charStart || 0), runEnd = runStart + (run.glyphs || []).length - 1
  if (runEnd < start || runStart > end) return []
  const glyphs = (run.glyphs || []).slice(Math.max(start, runStart) - runStart, Math.min(end, runEnd) - runStart + 1).filter((glyph: any) => glyph.flags !== 2)
  if (!glyphs.length) return []
  const xs = glyphs.flatMap((glyph: any) => [glyph.x, glyph.x + glyph.width])
  const ys = glyphs.flatMap((glyph: any) => [glyph.y, glyph.y + glyph.height])
  return [{ origin: { x: Math.min(...xs), y: Math.min(...ys) }, size: { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) } }]
})
export const needsLegacyPdfTextAlign = (items: any[] = []) => items.some(item => {
  const custom = item?.annotation?.custom
  return custom?.text && ['highlight', 'note'].includes(custom?.legacyType) && custom?.textCoord !== PDF_MIGRATION_VERSION
})
export const alignLegacyPdfAnnotations = async (items: any[], registry: any, documents: any, documentId = 'sireader-document') => {
  if (!needsLegacyPdfTextAlign(items)) return items
  const doc = documents?.getDocumentState(documentId)?.document
  const engine = registry?.getEngine?.()
  if (!doc || !engine) return items
  const cache = new Map<number, Promise<any>>()
  const pageData = (pageIndex: number) => cache.get(pageIndex) || cache.set(pageIndex, Promise.all([
    taskToPromise<string>(engine.extractText(doc, [pageIndex])).catch(() => ''),
    taskToPromise<any>(engine.getPageGeometry(doc, doc.pages[pageIndex])).catch(() => null),
  ]).then(([text, geo]) => ({ ...textMap(text), geo }))).get(pageIndex)!
  let changed = false
  const next = await Promise.all(items.map(async item => {
    const a = item?.annotation, needle = textKey(a?.custom?.text || '')
    if (!needle || !['highlight', 'note'].includes(a?.custom?.legacyType) || a?.custom?.textCoord === PDF_MIGRATION_VERSION) return item
    let best: any = null
    const oldRect = bounds(a.segmentRects || []) || a.rect
    for (const pageIndex of [a.pageIndex, a.pageIndex - 1, a.pageIndex + 1].filter((page: number) => page >= 0 && page < doc.pages.length)) {
      const page = await pageData(pageIndex)
      if (!page.geo) continue
      for (const at of textMatches(page.key, needle)) {
        const rects = rectsFromGeometry(page.geo, page.map[at], page.map[Math.min(page.map.length - 1, at + needle.length - 1)])
        const rect = bounds(rects)
        if (!rect) continue
        const score = (pageIndex === a.pageIndex ? 0 : 100000) + rectDistance(oldRect, rect)
        if (!best || score < best.score) best = { pageIndex, rect, rects, score }
      }
    }
    if (!best) return item
    changed = true
    return { ...item, annotation: { ...a, type: 9, strokeColor: a.strokeColor || DEFAULT_HIGHLIGHT, pageIndex: best.pageIndex, rect: best.rect, segmentRects: best.rects, custom: { ...a.custom, textCoord: PDF_MIGRATION_VERSION } } }
  }))
  return changed ? next : items
}
