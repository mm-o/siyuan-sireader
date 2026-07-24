import { LicenseManager } from '@/core/license'
import pluginInfo from '@/../plugin.json'
import { inlineLinkText, sendMarkToDoc } from '@/utils/copy'

const PDF_PLUGIN_DIR = `/plugins/${pluginInfo.name}/embedpdf`
const PDF_PLUGIN_WASM_URL = `${PDF_PLUGIN_DIR}/pdfium.wasm`
const PDF_WASM_PUBLIC_URL = '/public/siyuan-sireader/embedpdf/pdfium.wasm'
const PDF_PLUGIN_RUNTIME_URL = `${PDF_PLUGIN_DIR}/snippet/embedpdf.js`
const PDF_RUNTIME_PUBLIC_DIR = '/public/siyuan-sireader/embedpdf/snippet'
const PDF_RUNTIME_PUBLIC_URL = `${PDF_RUNTIME_PUBLIC_DIR}/embedpdf.js`
const PDF_RUNTIME_FILES = ['embedpdf.js', 'embedpdf-7TNsu-EA.js', 'worker-engine-BkD2-rJn.js', 'direct-engine-BA2WfEti.js', 'browser-BKLM0ThC-CkSOgtCM.js']
const STAMP_LOCALES = ['zh-CN', 'en']
const STAMP_PLUGIN_MANIFEST = `${PDF_PLUGIN_DIR}/stamps/{locale}/manifest.json`
const STAMP_PUBLIC_MANIFEST = '/public/siyuan-sireader/embedpdf/stamps/{locale}/manifest.json'
let pdfWasmUrlPromise: Promise<string> | undefined
let pdfRuntimePromise: Promise<any> | undefined
let stampManifestsPromise: Promise<any[]> | undefined

const absoluteUrl = (path: string) => typeof location === 'undefined' ? path : new URL(path, location.origin).href
const dynamicImport = (url: string) => new Function('url', 'return import(url)')(url)

const publicReady = async (path: string) =>
  await fetch(absoluteUrl(path), { method: 'HEAD', cache: 'no-store' }).then(res => res.ok).catch(() => false)
const readyUrl = async (path: string) => await publicReady(path) ? absoluteUrl(path) : ''
const firstReady = async (paths: string[], error: string) => {
  for (const path of paths) if (await publicReady(path)) return absoluteUrl(path)
  throw new Error(error)
}
const stampReady = (manifest: string, locale: string) =>
  Promise.all(['manifest.json', 'stamps.pdf'].map(file => publicReady(manifest.replace('{locale}', locale).replace('manifest.json', file))))
    .then(items => items.every(Boolean))

export const ensureEmbedPdfWasmUrl = () =>
  pdfWasmUrlPromise ||= firstReady([PDF_PLUGIN_WASM_URL, PDF_WASM_PUBLIC_URL], 'PDFium wasm is not available').catch((error) => {
    pdfWasmUrlPromise = undefined
    throw error
  })

export const ensureEmbedPdfRuntime = () =>
  pdfRuntimePromise ||= (async () => {
    const pluginRuntime = await readyUrl(PDF_PLUGIN_RUNTIME_URL)
    if (pluginRuntime) return await dynamicImport(pluginRuntime)
    if (await Promise.all(PDF_RUNTIME_FILES.map(file => publicReady(`${PDF_RUNTIME_PUBLIC_DIR}/${file}`))).then(items => items.every(Boolean))) {
      return await dynamicImport(absoluteUrl(PDF_RUNTIME_PUBLIC_URL))
    }
    throw new Error('EmbedPDF runtime is not available')
  })().catch((error) => {
    pdfRuntimePromise = undefined
    throw error
  })

export const initEmbedPdfViewer = async (target: HTMLElement, config: Record<string, any>) =>
  (await ensureEmbedPdfRuntime()).default.init({ type: 'container', target, ...config })

export const ensureEmbedPdfStampManifests = () =>
  stampManifestsPromise ||= (async () => {
    const pluginReady = await Promise.all(STAMP_LOCALES.map(locale => stampReady(STAMP_PLUGIN_MANIFEST, locale)))
    if (pluginReady.every(Boolean)) return [{ url: STAMP_PLUGIN_MANIFEST, fallbackLocale: 'en' }]
    const publicReadyItems = await Promise.all(STAMP_LOCALES.map(locale => stampReady(STAMP_PUBLIC_MANIFEST, locale)))
    if (publicReadyItems.every(Boolean)) return [{ url: STAMP_PUBLIC_MANIFEST, fallbackLocale: 'en' }]
    throw new Error('PDF stamp assets are not available')
  })().catch((error) => {
    stampManifestsPromise = undefined
    throw error
  })

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

export const getPdfSelectionMark = async (selectionScope: any) => {
  const lines = await taskToPromise<string[]>(selectionScope?.getSelectedText?.()).catch(() => [])
  const text = inlineLinkText((lines || []).join('\n'))
  return text ? makePdfSelectionMark(text, selectionScope?.getFormattedSelection?.() || []) : null
}

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
