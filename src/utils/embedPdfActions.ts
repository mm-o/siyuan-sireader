import { LicenseManager } from '@/core/license'
import pluginInfo from '@/../plugin.json'
import { inlineLinkText, sendMarkToDoc } from '@/utils/copy'
import type { InitOptions } from '@embedpdf/viewer'

const PDF_PLUGIN_DIR = `/plugins/${pluginInfo.name}/embedpdf`
const PDF_PLUGIN_RUNTIME_URL = `${PDF_PLUGIN_DIR}/viewer.js`
let pdfRuntimePromise: Promise<typeof import('@embedpdf/viewer')> | undefined

const absoluteUrl = (path: string) => typeof location === 'undefined' ? path : new URL(path, location.origin).href
const dynamicImport = (url: string) => import(/* @vite-ignore */ url)

const ensureEmbedPdfRuntime = () =>
  pdfRuntimePromise ||= dynamicImport(absoluteUrl(PDF_PLUGIN_RUNTIME_URL)).catch((error: any) => {
    pdfRuntimePromise = undefined
    throw error
  })

let pdfEnginePromise: Promise<typeof import('@embedpdf/engine')> | undefined
let pdfEngine: ReturnType<typeof import('@embedpdf/engine').localEngine> | undefined
const loadPdfEngine = () => pdfEnginePromise ||= dynamicImport(absoluteUrl(`${PDF_PLUGIN_DIR}/engine.js`)).catch((error: unknown) => {
    pdfEnginePromise = undefined
    throw error
  })
export const pdfAnnotationTransfer = async () => (await loadPdfEngine()).AnnotationTransfer
export const openPdf = async (source: Blob | string | Uint8Array) => {
  const runtime = await loadPdfEngine()
  pdfEngine ||= runtime.localEngine()
  if (typeof source !== 'string') return pdfEngine.open({ kind: 'bytes', bytes: source instanceof Uint8Array ? source : await source.arrayBuffer() })
  const response = await fetch(source)
  if (!response.ok) throw new Error(`PDF download failed (HTTP ${response.status})`)
  return pdfEngine.open({ kind: 'bytes', bytes: await response.arrayBuffer() })
}

export const initEmbedPdfViewer = async (target: HTMLElement, config: Omit<InitOptions, 'target'>) =>
  (await ensureEmbedPdfRuntime()).default.init({ target, ...config })

export const renderPdfFirstPage = async (source: File | Blob | string): Promise<Blob | undefined> => {
  try {
    const doc = await openPdf(source)
    try {
      const { pages } = await doc.pages.list()
      if (!pages.length) return
      const image = await doc.page(pages[0].ref).render.image({ viewport: { kind: 'width', width: 320 } })
      return await image.blob()
    } finally {
      await doc.close()
    }
  } catch {
    return undefined
  }
}

export const makePdfSelectionMark = (text: string, selection: any[] = []) => {
  const first = selection[0] || {}
  const page = Number(first.pageIndex ?? 0) + 1
  return {
    format: 'pdf',
    type: 'highlight',
    page,
    cfi: `#page-${page}`,
    chapter: `Page ${page}`,
    text: inlineLinkText(text),
    rects: first.segmentRects || (first.rect ? [first.rect] : []),
  }
}

export const pdfMarkFromAnnotation = (annotation: any, annotations: any[] = []) => {
  const page = Number(annotation.pageIndex || 0) + 1
  const replies = annotations.filter(item => item?.inReplyToId === annotation.id).map(item => item.contents)
  const note = [annotation.custom?.note || annotation.contents, ...replies].filter(Boolean).join('\n\n')
  return { id: annotation.id, type: 'note', format: 'pdf', page, cfi: `#page-${page}`, chapter: `Page ${page}`, text: inlineLinkText(annotation.custom?.text || ''), note }
}

export const isPdfImageAnnotation = (annotation: any) => annotation?.rect && [4, 5, 6, 8, 15].includes(Number(annotation.type))
export async function capturePdfAnnotationImage(render: any, annotation: any) {
  if (!render || !isPdfImageAnnotation(annotation)) return null
  try {
    const image = await render.renderPage(annotation.pageIndex, { rect: pdfBox(annotation.rect), scale: 2, format: 'png' })
    return await image.blob()
  } catch {
    return null
  }
}

export const sendPdfMarkToDoc = async (mark: any, docId: string, ctx: any) => {
  if (!LicenseManager.can('quick-send', await LicenseManager.getLicense())) return ctx.showMsg?.('快捷发送需要升级会员', 'info')
  return sendMarkToDoc(mark, docId, { ...ctx, isPdf: true })
}

const annotationSubtypes: Record<number, string> = {
  1: 'text', 2: 'link', 3: 'free-text', 4: 'line', 5: 'square', 6: 'circle',
  7: 'polygon', 8: 'polyline', 9: 'highlight', 10: 'underline', 11: 'squiggly',
  12: 'strikeout', 13: 'stamp', 14: 'caret', 15: 'ink', 17: 'file-attachment', 28: 'redact',
}
export const pdfAnnotationSubtype = (type: number) => annotationSubtypes[type]

const pdfBox = (rect: any) => ({
  x: rect.origin.x, y: rect.origin.y, width: rect.size.width, height: rect.size.height,
})
const recordBox = ({ x, y, width, height }: { x: number; y: number; width: number; height: number }) => ({
  origin: { x, y }, size: { width, height },
})
const quad = ({ x, y, width, height }: ReturnType<typeof pdfBox>) => ({
  upperLeft: { x, y }, upperRight: { x: x + width, y },
  lowerLeft: { x, y: y + height }, lowerRight: { x: x + width, y: y + height },
})
const quadBounds = (value: ReturnType<typeof quad>) => {
  const points = Object.values(value)
  const xs = points.map(point => point.x), ys = points.map(point => point.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return recordBox({ x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y })
}
const lineEndings = ['none', 'square', 'circle', 'diamond', 'open-arrow', 'closed-arrow', 'butt', 'r-open-arrow', 'r-closed-arrow', 'slash']
const lineEnding = (value: number | string) => typeof value === 'number' ? lineEndings[value] || 'none' : value || 'none'
export const pdfAnnotationColor = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)
  ? value.length === 4 ? value.replace(/[0-9a-f]/gi, digit => digit + digit) : value
  : undefined
const blendModes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']

export function pdfAnnotationToolOptions(saved: Record<string, Record<string, any>> = {}) {
  return Object.entries(saved).flatMap(([id, defaults]) => {
    if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return []
    if (defaults.type === undefined) return [{ id, defaults }]

    const { strokeColor, color, opacity, strokeWidth, strokeDashArray, blendMode, lineEndings } = defaults
    const stroke = strokeColor ?? color
    const appearance = {
      ...(stroke === 'transparent' ? { color: null } : pdfAnnotationColor(stroke) ? { color: pdfAnnotationColor(stroke) } : {}),
      ...(typeof opacity === 'number' ? { opacity } : {}),
      ...(typeof strokeWidth === 'number' ? { strokeWidth } : {}),
    }
    if (id === 'ink' || id === 'inkHighlighter') {
      const mode = typeof blendMode === 'number' ? blendModes[blendMode] : blendMode
      return [{ id: id === 'inkHighlighter' ? 'ink-highlight' : id, defaults: { ...appearance, ...(blendModes.includes(mode) ? { blendMode: mode } : {}) } }]
    }
    if (!['line', 'lineArrow', 'polyline', 'polygon', 'square', 'circle'].includes(id)) return []
    const shape = {
      ...appearance,
      ...(Array.isArray(strokeDashArray) && strokeDashArray.length ? { borderStyle: 'dashed', dashArray: strokeDashArray } : {}),
      ...(['line', 'lineArrow', 'polyline'].includes(id) && lineEndings ? { lineEndings: { start: lineEnding(lineEndings.start), end: lineEnding(lineEndings.end) } } : {}),
    }
    return [{ id: id === 'lineArrow' ? 'arrow' : id, defaults: shape }]
  })
}

export async function pdfAnnotationResource(context: any) {
  const data = context?.data ?? context?.appearance
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (data instanceof Uint8Array || data instanceof Blob) return data
  const image = context?.imageData
  if (!image?.data || !image.width || !image.height) return
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve))
}

export function legacyPdfDraft(record: any) {
  const subtype = record.type === 0 ? 'text' : annotationSubtypes[record.type]
  if (!subtype || !record.rect) return null
  const box = pdfBox(record.rect)
  const common = {
    subtype, nm: record.id, contents: record.contents,
    color: pdfAnnotationColor(record.strokeColor ?? record.color),
    opacity: record.opacity,
    blendMode: typeof record.blendMode === 'number' ? blendModes[record.blendMode] : record.blendMode,
    ...Object.fromEntries((Array.isArray(record.flags) ? record.flags : []).map((flag: string) => [flag, true])),
  }
  if ([9, 10, 11, 12].includes(record.type)) {
    const rects = record.segmentRects?.length ? record.segmentRects : [record.rect]
    return { ...common, quadPoints: rects.map((rect: any) => quad(pdfBox(rect))) }
  }
  if ([3, 4, 5, 6, 7, 8, 15].includes(record.type)) {
    Object.assign(common, { strokeWidth: record.strokeWidth })
    if (record.strokeColor === 'transparent') Object.assign(common, { color: null })
    if (record.strokeDashArray?.length) Object.assign(common, { borderStyle: 'dashed', dashArray: record.strokeDashArray })
  }
  if ((record.type === 4 || record.type === 8) && record.lineEndings) {
    Object.assign(common, { lineEndings: { start: lineEnding(record.lineEndings.start), end: lineEnding(record.lineEndings.end) } })
  }
  if (record.type === 4) return { ...common, linePoints: record.linePoints }
  if (record.type === 7 || record.type === 8) return { ...common, vertices: record.vertices }
  if (record.type === 15) return { ...common, inkList: record.inkList?.map((stroke: any) => stroke.points) }
  if (record.type === 3) return { ...common, box, fontSize: record.fontSize, fontColor: pdfAnnotationColor(record.fontColor), interiorColor: pdfAnnotationColor(record.backgroundColor) ?? null }
  if (record.type === 5 || record.type === 6) return { ...common, box, interiorColor: pdfAnnotationColor(record.color) ?? null }
  if (record.type === 13 || record.type === 14) return { ...common, box }
  return { ...common, rect: box }
}

export function pdfAnnotationRecord(native: any, pageIndex: number, custom?: any) {
  const type = Number(Object.keys(annotationSubtypes).find(key => annotationSubtypes[Number(key)] === native.subtype))
  if (!type || !native.rect) return null
  const rects = native.quadPoints?.map(quadBounds)
  return {
    id: native.nm || JSON.stringify(native.ref), type, pageIndex,
    rect: recordBox(native.rect), ...(rects?.length ? { segmentRects: rects } : {}),
    color: native.opacity === 0 ? 'transparent' : native.interiorColor || native.color,
    strokeColor: native.opacity === 0 ? 'transparent' : native.color,
    contents: native.contents, author: native.author, created: native.createdAt, modified: native.modifiedAt,
    opacity: native.opacity, strokeWidth: native.strokeWidth, custom,
    linePoints: native.linePoints, lineEndings: native.lineEndings, vertices: native.vertices,
    ...(native.inkList ? { inkList: native.inkList.map((points: any) => ({ points })) } : {}),
    fontSize: native.fontSize, fontColor: native.fontColor, backgroundColor: native.interiorColor,
    flags: ['hidden', 'noView', 'readOnly'].filter(flag => native[flag]),
  }
}
