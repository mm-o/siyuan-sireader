import { projectReflowAnnotation, reflowProjectionId, type ReflowDocument, type ReflowLayout, type ReflowPage } from '@/core/pdfReflow'
import { deleteEmbedPdfAnnotation, upsertEmbedPdfAnnotation } from '@/core/storage'
import { putFile, removeFile } from '@/api'
import { diagnosticLog } from '@/core/diagnostics'
import pluginInfo from '../../plugin.json'

const base = `/plugins/${pluginInfo.name}/`

function createReflowWorker(signal: AbortSignal) {
  const worker = new Worker(base + 'pdfReflow.worker.js')
  let sequence = 0, disposed = false
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; cleanup: () => void }>()
  const dispose = (error: Error = new DOMException('Aborted', 'AbortError')) => {
    if (disposed) return
    disposed = true
    worker.terminate()
    for (const entry of pending.values()) { entry.cleanup(); entry.reject(error) }
    pending.clear()
  }
  worker.onmessage = ({ data }) => {
    const entry = pending.get(data.id)
    if (!entry) return
    pending.delete(data.id); entry.cleanup()
    if (data.error) entry.reject(new Error(data.error))
    else entry.resolve(data.result)
  }
  worker.onerror = event => dispose(new Error(event.message || 'PDF reflow worker failed'))
  const request = <T>(command: string, payload: any, transfer: Transferable[] = []): Promise<T> => {
    signal.throwIfAborted()
    if (disposed) return Promise.reject(new Error('PDF reflow session is closed'))
    return new Promise((resolve, reject) => {
      const id = ++sequence
      const abort = () => { pending.delete(id); cleanup(); reject(signal.reason || new DOMException('Aborted', 'AbortError')) }
      const cleanup = () => signal.removeEventListener('abort', abort)
      pending.set(id, { resolve, reject, cleanup })
      signal.addEventListener('abort', abort, { once: true })
      try { worker.postMessage({ id, command, payload }, transfer) }
      catch (error) { pending.delete(id); cleanup(); reject(error) }
    })
  }
  return { request, dispose }
}

/** SiYuan's configured OCR provider; its TSV coordinates refer to the rendered PNG. */
export async function recognizePdfPage(blob: Blob, signal: AbortSignal) {
  signal.throwIfAborted()
  const header = new DataView(await blob.slice(0, 24).arrayBuffer())
  if (header.byteLength < 24 || header.getUint32(0) !== 0x89504e47) throw new Error('Invalid OCR page image')
  const image = { width: header.getUint32(16), height: header.getUint32(20) }
  if (!image.width || !image.height) throw new Error('Invalid OCR page dimensions')
  const path = `assets/sireader-ocr-${crypto.randomUUID()}.png`
  try {
    await putFile(`/data/${path}`, false, blob)
    signal.throwIfAborted()
    const response = await fetch('/api/asset/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), signal })
    if (!response.ok) throw new Error(`SiYuan OCR: HTTP ${response.status}`)
    const result = await response.json()
    if (result.code !== 0) throw new Error(result.msg || 'SiYuan OCR failed')
    signal.throwIfAborted()
    return { result: result.data, image }
  } finally {
    // Unique plugin-owned files only; never remove or rewrite the source PDF.
    await removeFile(`/data/${path}`).catch(error => diagnosticLog('error', 'pdf.reflow.ocr.cleanup.failed', { path, error }))
  }
}

export function createPdfReflowSession(registry: any, documentId: string, taskToPromise: <T>(task: any) => Promise<T>, messages: Record<string, string> = {}) {
  const document = registry.getPlugin('document-manager')?.provides()?.getDocumentState(documentId)?.document
  const engine = registry.getEngine()
  if (!document || !engine) throw new Error(messages.pdfReflowUnavailable || 'PDF text extraction is unavailable')
  if (typeof document.permissions === 'number' && !document.isOwnerUnlocked && !(document.permissions & 16)) throw new Error(messages.pdfReflowNoExtractPermission || 'This PDF does not allow text extraction')
  const render = registry.getPlugin('render')?.provides()?.forDocument(documentId)
  const run = async <T>(task: any, signal: AbortSignal): Promise<T> => {
    signal.throwIfAborted()
    const abort = () => task?.abort?.()
    signal.addEventListener('abort', abort, { once: true })
    try { const result = await taskToPromise<T>(task); signal.throwIfAborted(); return result }
    finally { signal.removeEventListener('abort', abort) }
  }
  const lifetime = new AbortController()
  const worker = createReflowWorker(lifetime.signal)
  return {
    async generate(buffer: ArrayBuffer, layout: ReflowLayout, callerSignal: AbortSignal, progress: (page: number, count: number) => void) {
      callerSignal.throwIfAborted()
      const cancel = () => lifetime.abort(callerSignal.reason)
      callerSignal.addEventListener('abort', cancel, { once: true })
      const { signal } = lifetime
      try {
        // Transfer a copy: the committed source snapshot remains available for rollback.
        const snapshot = buffer.slice(0)
        await worker.request<void>('open', { buffer: snapshot, sizes: document.pages.map((page: any) => page.size), engineUrl: new URL(base + 'mupdf/mupdf.js', location.origin).href }, [snapshot])
        await worker.request<void>('layout-begin', layout)
        for (let index = 0; index < document.pages.length; index++) {
          signal.throwIfAborted()
          let page = await worker.request<ReflowPage>('page', { index })
          signal.throwIfAborted()
          if (page.needsOCR || !page.blocks.some(block => block.text.trim())) {
            const size = document.pages[index].size
            const scaleFactor = Math.min(2, 2200 / Math.max(size.width, size.height))
            const blob = await run<Blob>(render.renderPage({ pageIndex: index, options: { imageType: 'image/png', scaleFactor, withAnnotations: false } }), signal)
            const data = await recognizePdfPage(blob, signal)
            page = await worker.request<ReflowPage>('ocr', { index, ...data })
          }
          signal.throwIfAborted()
          await worker.request<void>('layout-page', page)
          progress(index + 1, document.pages.length)
        }
        return await worker.request<ReflowDocument>('layout-finish', {})
      } finally { callerSignal.removeEventListener('abort', cancel) }
    },
    dispose() { lifetime.abort(); worker.dispose() },
  }
}

/** Replace document bytes in the existing reader; preserve the previous PDF on load failure. */
export async function replacePdfDocument(documents: any, documentId: string, next: { buffer: ArrayBuffer; name: string }, previous: { buffer: ArrayBuffer; name: string }, wait: <T>(task: any) => Promise<T>, annotations?: any) {
  const close = async () => {
    await wait(documents.closeDocument(documentId))
    // The viewer must unmount the previous viewport before reusing its document id.
    // Otherwise Preact may batch close/open and leave scroll/render hooks on a dead handle.
    if (typeof requestAnimationFrame === 'function') await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }
  await close()
  const open = async (source: { buffer: ArrayBuffer; name: string }) => {
    let off: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined
    const loaded = annotations?.onAnnotationEvent ? new Promise<void>((resolve, reject) => {
      off = annotations.onAnnotationEvent((event: any) => { if (event.documentId === documentId && event.type === 'loaded') resolve() })
      timer = setTimeout(() => reject(new Error('PDF annotations loading timed out')), 30000)
    }) : Promise.resolve()
    // A load failure may precede annotation initialization; keep its waiter handled.
    void loaded.catch(() => undefined)
    try {
      await wait(documents.openDocumentBuffer({ documentId, name: source.name, buffer: source.buffer.slice(0), autoActivate: true }))
      await loaded
    } finally { off?.(); clearTimeout(timer) }
  }
  try { await open(next) }
  catch (error) {
    await close().catch(() => undefined)
    await open(previous)
    throw error
  }
}

export async function synchronizeReflowAnnotation(sourceKey: string, generated: Pick<ReflowDocument, 'pageMap' | 'annotationMap'> & { url: string }, event: { type: string; annotation: any }) {
  const annotation = event.annotation, sourcePage = generated.pageMap[annotation.pageIndex]
  if (!sourceKey || !annotation.id || sourcePage == null) return
  const id = reflowProjectionId(generated.url, annotation.id)
  if (event.type === 'delete') await deleteEmbedPdfAnnotation(sourceKey, id)
  else await upsertEmbedPdfAnnotation(sourceKey, { annotation: projectReflowAnnotation(annotation, generated.url, generated.annotationMap?.[annotation.pageIndex], sourcePage) })
  return id
}
