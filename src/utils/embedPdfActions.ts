import { LicenseManager } from '@/core/license'
import pluginInfo from '@/../plugin.json'
import { inlineLinkText, sendMarkToDoc } from '@/utils/copy'

const PDF_PLUGIN_DIR = `/plugins/${pluginInfo.name}/embedpdf`
const PDF_PLUGIN_WASM_URL = `${PDF_PLUGIN_DIR}/pdfium.wasm`
const PDF_PLUGIN_RUNTIME_URL = `${PDF_PLUGIN_DIR}/snippet/embedpdf.js`
const STAMP_PLUGIN_MANIFEST = `${PDF_PLUGIN_DIR}/stamps/{locale}/manifest.json`
let pdfRuntimePromise: Promise<any> | undefined

const absoluteUrl = (path: string) => typeof location === 'undefined' ? path : new URL(path, location.origin).href
const dynamicImport = (url: string) => new Function('url', 'return import(url)')(url)

export const ensureEmbedPdfWasmUrl = async () => absoluteUrl(PDF_PLUGIN_WASM_URL)

export const ensureEmbedPdfRuntime = () =>
  pdfRuntimePromise ||= dynamicImport(absoluteUrl(PDF_PLUGIN_RUNTIME_URL)).catch((error: any) => {
    pdfRuntimePromise = undefined
    throw error
  })

export const initEmbedPdfViewer = async (target: HTMLElement, config: Record<string, any>) =>
  (await ensureEmbedPdfRuntime()).default.init({ type: 'container', target, ...config })

export const ensureEmbedPdfStampManifests = async () =>
  [{ url: STAMP_PLUGIN_MANIFEST, fallbackLocale: 'en' }]

export const createEmbedPdfDocumentSource = async (documentId: string, source: File | Blob | string, fallbackName = 'document.pdf') => {
  const name = typeof source === 'string'
    ? source.split('/').pop()?.split('?')[0] || fallbackName
    : (source as File).name || fallbackName
  return typeof source === 'string'
    ? { documentId, url: source, name, autoActivate: true }
    : { documentId, buffer: await source.arrayBuffer(), name, autoActivate: true }
}

export const taskToPromise = <T>(task: any) => new Promise<T>((resolve, reject) => {
  if (!task?.wait) return resolve(task as T)
  task.wait(resolve, reject)
})

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

const rectLeft = (rect: any) => Number(rect?.origin?.x ?? 0)
const rectRight = (rect: any) => rectLeft(rect) + Number(rect?.size?.width ?? 0)
const rectHeight = (rect: any) => Number(rect?.size?.height ?? 0)

/** Keep the column containing the start of a selection on multi-column pages. */
export const filterPdfSelectionColumns = (selection: any[] = []) => selection.map(item => {
  const rects = Array.isArray(item?.segmentRects) ? item.segmentRects.filter(Boolean) : []
  if (rects.length < 2) return item
  const sorted = [...rects].sort((a, b) => rectLeft(a) - rectLeft(b))
  const medianHeight = [...rects].map(rectHeight).sort((a, b) => a - b)[Math.floor(rects.length / 2)] || 1
  let split = -1
  let largestGap = 0
  for (let i = 1; i < sorted.length; i++) {
    const gap = rectLeft(sorted[i]) - rectRight(sorted[i - 1])
    if (gap > largestGap) { largestGap = gap; split = i }
  }
  if (split < 0 || largestGap < medianHeight * 2) return item
  const start = rects[0]
  const startColumn = rectLeft(start) <= rectLeft(sorted[split - 1]) ? sorted.slice(0, split) : sorted.slice(split)
  if (!startColumn.length || startColumn.length === rects.length) return item
  const minX = Math.min(...startColumn.map(rectLeft))
  const minY = Math.min(...startColumn.map(rect => Number(rect?.origin?.y ?? 0)))
  const maxX = Math.max(...startColumn.map(rectRight))
  const maxY = Math.max(...startColumn.map(rect => Number(rect?.origin?.y ?? 0) + rectHeight(rect)))
  return { ...item, rect: { origin: { x: minX, y: minY }, size: { width: maxX - minX, height: maxY - minY } }, segmentRects: startColumn }
})

export const getPdfSelectionMark = async (selectionScope: any) => {
  const lines = await taskToPromise<string[]>(selectionScope?.getSelectedText?.()).catch(() => [])
  const text = inlineLinkText((lines || []).join('\n'))
  return text ? makePdfSelectionMark(text, filterPdfSelectionColumns(selectionScope?.getFormattedSelection?.() || [])) : null
}

export const restorePdfAnnotationTool = (scope: any, toolId: string) => queueMicrotask(() => {
  if (!scope?.getActiveTool?.()) scope?.setActiveTool?.(toolId)
})

export const pdfAnnotationNote = (item: any) => item?.annotation?.custom?.note || item?.annotation?.contents || ''

export const pdfAnnotationText = (item: any) => inlineLinkText(item?.annotation?.custom?.text || '')

export const pdfAnnotationWithReplies = (annotation: any, annotations: any[] = []) => {
  const replies = annotations.filter(item => item?.inReplyToId === annotation.id && item.contents)
  const contents = [annotation.custom?.note || annotation.contents, ...replies.map(item => item.contents)].filter(Boolean).join('\n\n')
  return { annotation: { ...annotation, contents }, replies }
}

export const pdfMarkFromAnnotation = (annotation: any, annotations: any[] = []) => {
  const item = pdfAnnotationWithReplies(annotation, annotations)
  const page = Number(annotation.pageIndex || 0) + 1
  return { id: annotation.id, type: 'note', format: 'pdf', page, cfi: `#page-${page}`, chapter: `Page ${page}`, text: pdfAnnotationText(item), note: pdfAnnotationNote(item) }
}

export const isPdfImageAnnotation = (annotation: any) => annotation?.rect && [4, 5, 6, 8, 15].includes(Number(annotation.type))
export const capturePdfAnnotationImage = (renderScope: any, annotation: any) =>
  isPdfImageAnnotation(annotation)
    ? taskToPromise<Blob>(renderScope?.renderPageRect?.({ pageIndex: annotation.pageIndex, rect: annotation.rect, options: { imageType: 'image/png', scaleFactor: 2, withAnnotations: true } })).catch(() => null)
    : null

export const pdfSelectionFromAnnotation = (annotation: any) => {
  const page = Number(annotation.pageIndex || 0) + 1
  return { text: pdfAnnotationText({ annotation }) || pdfAnnotationNote({ annotation }), page, cfi: `#page-${page}`, rects: annotation.segmentRects?.length ? annotation.segmentRects : [annotation.rect].filter(Boolean) }
}

export const sendPdfMarkToDoc = async (mark: any, docId: string, ctx: any) => {
  if (!LicenseManager.can('quick-send', await LicenseManager.getLicense())) return ctx.showMsg?.('快捷发送需要升级会员', 'info')
  return sendMarkToDoc(mark, docId, { ...ctx, isPdf: true })
}

export const writeBlobToClipboard = async (blob: Blob) => {
  if (!('ClipboardItem' in window) || !navigator.clipboard?.write) throw new Error('当前环境不支持复制图片')
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
}

export const addMissingPdfMenuItemsAfterFirst = <T extends { id: string }>(items: T[] = [], additions: T[] = []) => {
  const ids = new Set(items.map(item => item.id))
  return [...items.slice(0, 1), ...additions.filter(item => !ids.has(item.id)), ...items.slice(1)]
}

export const bookmarkPage = (bookmark: any) => {
  const target = bookmark?.target
  const destination = target?.type === 'destination' ? target.destination : target?.action?.destination
  return Number.isFinite(destination?.pageIndex) ? destination.pageIndex + 1 : 0
}

export const bookmarkToc = (items: any[] = []): any[] =>
  items.map(item => ({
    label: item.title || 'Untitled',
    href: bookmarkPage(item) ? `#page-${bookmarkPage(item)}` : '',
    subitems: item.children?.length ? bookmarkToc(item.children) : undefined,
  }))
