import { projectReflowAnnotation, reflowProjectionId, type ReflowDocument, type ReflowLayout, type ReflowPage } from '@/core/pdfReflow'
import { deleteEmbedPdfAnnotation, upsertEmbedPdfAnnotation } from '@/core/storage'
import { putFile, removeFile } from '@/api'
import { diagnosticLog } from '@/core/diagnostics'
import pluginInfo from '../../plugin.json'
import { runtimeUrl } from '@/services/runtimeAssets'

const base = `/plugins/${pluginInfo.name}/`

// 工作线程级错误（崩溃/已关闭）：必须冒泡，不能当成“这一页坏了”跳过
function fatalError(message: string) {
  const error = new Error(message) as Error & { fatal?: boolean }
  error.fatal = true
  return error
}

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
  worker.onerror = event => dispose(fatalError(event.message || 'PDF reflow worker failed'))
  const request = <T>(command: string, payload: any, transfer: Transferable[] = []): Promise<T> => {
    signal.throwIfAborted()
    if (disposed) return Promise.reject(fatalError('PDF reflow session is closed'))
    return new Promise((resolve, reject) => {
      const id = ++sequence
      const abort = () => { pending.delete(id); cleanup(); reject(signal.reason || new DOMException('Aborted', 'AbortError')) }
      const cleanup = () => signal.removeEventListener('abort', abort)
      pending.set(id, { resolve, reject, cleanup })
      signal.addEventListener('abort', abort, { once: true })
      try { worker.postMessage({ id, command, payload }, transfer) }
      catch (error: any) {
        pending.delete(id)
        cleanup()
        reject(new Error(`${command}: ${error?.message || error}`))
      }
    })
  }
  return { request, dispose }
}

/** SiYuan's configured OCR provider; its TSV coordinates refer to the rendered PNG. */
export const OCR_TIMEOUT_MS = 25000

export async function recognizePdfPage(blob: Blob, signal: AbortSignal) {
  const timeout = AbortSignal.timeout(OCR_TIMEOUT_MS)
  const combined = AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal
  try {
    return await recognizeOnce(blob, combined)
  } catch (error) {
    if (timeout.aborted && !signal.aborted) throw new Error(`SiYuan OCR 超时（${OCR_TIMEOUT_MS}ms）`)
    throw error
  }
}

async function recognizeOnce(blob: Blob, signal: AbortSignal) {
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

/** 按需重排的窗口：当前页 ±1（默认 3 页），夹在文档首尾之内。 */
export const REFLOW_WINDOW = 12
export const reflowWindowRange = (center: number, total: number, window = REFLOW_WINDOW) => {
  const last = Math.max(0, total - 1)
  const from = Math.max(0, Math.min(center - Math.floor(window / 2), Math.max(0, last - window + 1)))
  return { from, to: Math.min(last, from + window - 1) }
}

/** 重排版式：宽度/高度/字号都夹到安全区间，供 render 与测试共用。 */
export const reflowLayoutFor = (width: number, height: number, fontSize: number): ReflowLayout => ({
  width: Math.max(240, Math.min(720, width || 480)),
  height: Math.max(400, Math.min(960, height || 720)),
  fontSize: Math.max(12, Math.min(32, fontSize || 18)),
})

export function createPdfReflowSession(document: any, pages: readonly any[], canCopy: boolean, messages: Record<string, string> = {}) {
  if (!canCopy) throw new Error(messages.pdfReflowNoExtractPermission || 'This PDF does not allow text extraction')
  const lifetime = new AbortController()
  const worker = createReflowWorker(lifetime.signal)
  return {
    /** 把一个新窗口的 PDF 拼到已有结果的前面（start）或后面（end）。 */
    async merge(base: ArrayBuffer | undefined, addition: ArrayBuffer, at: 'start' | 'end') {
      const result = await worker.request<{ buffer: ArrayBuffer }>('merge', { base, addition, at })
      return result.buffer
    },
    async generate(buffer: ArrayBuffer, layout: ReflowLayout, callerSignal: AbortSignal, progress: (page: number, count: number) => void, range?: { from: number; to: number }, onStage?: (stage: 'render' | 'ocr', page: number, count: number) => void) {
      callerSignal.throwIfAborted()
      const cancel = () => lifetime.abort(callerSignal.reason)
      callerSignal.addEventListener('abort', cancel, { once: true })
      const { signal } = lifetime
      try {
        // Transfer a copy: the committed source snapshot remains available for rollback.
        const snapshot = buffer.slice(0)
        await worker.request<void>('open', { buffer: snapshot, sizes: pages.map((page: any) => page.size), engineUrl: new URL(runtimeUrl('mupdf', 'mupdf.js'), location.origin).href }, [snapshot])
        await worker.request<void>('layout-begin', layout)
        const skipped: number[] = []
        let skipReason = ''
        const timing = { page: 0, render: 0, ocr: 0, layout: 0, pages: 0 }
        // 只排这一段（含端点）；不传则整本
        const from = Math.max(0, Math.min(range?.from ?? 0, pages.length - 1))
        const to = Math.min(pages.length - 1, Math.max(range?.to ?? pages.length - 1, from))
        const count = to - from + 1
        for (let index = from; index <= to; index++) {
          signal.throwIfAborted()
          try {
            const pageAt = performance.now()
            let page = await worker.request<ReflowPage>('page', { index })
            timing.page += performance.now() - pageAt
            signal.throwIfAborted()
            if (page.needsOCR || !page.blocks.some(block => block.text.trim())) {
              onStage?.('render', index - from + 1, count)
              const size = pages[index].size
              // OCR 只需要能认清字，1400px 长边足够；从 2200 降下来显著减少内存与耗时
              const scaleFactor = Math.min(1.6, 1400 / Math.max(size.width, size.height))
              // 不要给引擎传 signal：它会被塞进 postMessage，AbortSignal 不可结构化克隆
              const renderStartedAt = performance.now()
              const blob = await Promise.race([
                (async () => {
                  const image = await document.page(pages[index].ref).render.image({
                    viewport: { kind: 'width', width: Math.max(1, Math.round(size.width * scaleFactor)) },
                    includeAnnotations: false,
                  })
                  return image.blob()
                })(),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('页面渲染超时（15s）')), 15000)),
              ])
              diagnosticLog('debug', 'pdf.reflow.render', { page: index + 1, ms: Math.round(performance.now() - renderStartedAt), bytes: (blob as Blob).size })
              timing.render += performance.now() - pageAt
              onStage?.('ocr', index - from + 1, count)
              const ocrAt = performance.now()
              const data = await recognizePdfPage(blob, signal)
              timing.ocr += performance.now() - ocrAt
              page = await worker.request<ReflowPage>('ocr', { index, result: data.result, image: data.image })
            }
            signal.throwIfAborted()
            const layoutAt = performance.now()
            await worker.request<void>('layout-page', page)
            timing.layout += performance.now() - layoutAt
            timing.pages += 1
          } catch (error) {
            // 取消要如实抛出；其它情况（某页损坏、OCR 失败）跳过该页继续，别让整本重排失败
            if (signal.aborted || callerSignal.aborted || (error as any)?.fatal) throw error
            skipped.push(index + 1)
            skipReason ||= String((error as any)?.message || error)
            diagnosticLog('warn', 'pdf.reflow.page.skipped', { page: index + 1, error: String((error as any)?.message || error) })
          }
          progress(index - from + 1, count)
        }
        const finishAt = performance.now()
        const document_ = await worker.request<ReflowDocument>('layout-finish', {})
        const ms = (value: number) => Math.round(value)
        diagnosticLog('info', 'pdf.reflow.timing', {
          from, to, pages: timing.pages,
          page: ms(timing.page), render: ms(timing.render), ocr: ms(timing.ocr), layout: ms(timing.layout),
          finish: ms(performance.now() - finishAt), skipped: skipped.length,
        })
        if (skipped.length) diagnosticLog('info', 'pdf.reflow.pages.skipped', { count: skipped.length, pages: skipped.slice(0, 50), reason: skipReason })
        // 一页都没排出来就别返回空文档：用户只会看到一片空白，还以为是重排成功。
        if (!timing.pages) throw new Error(`${messages.pdfReflowEmpty || '重排没有生成任何页面'}${skipReason ? `：${skipReason}` : ''}`)
        return document_
      } finally { callerSignal.removeEventListener('abort', cancel) }
    },
    dispose() { lifetime.abort(); worker.dispose() },
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


/** 按需重排（当前页 ±1，滑到边缘续排）的流程控制：组件只提供上下文。 */
export type ReflowControllerContext = {
  scoped: (name: string) => any
  documentId: () => string
  signal: () => AbortSignal | null
  setStatus: (text: string) => void
  label: (key: string, fallback: string) => string
  layout: () => ReflowLayout
  canCopy: () => boolean
  openPdf: (bytes: ArrayBuffer | Uint8Array) => Promise<any>
  attach: (id: string, signal: AbortSignal, target: number) => Promise<void>
  writeManaged: (blob: Blob, url: string, name: string) => Promise<void>
  ensureEngine: () => Promise<void>
  onFailure: (error: unknown) => void
  documents: () => any
  /** viewer.forDocument(id)：拿某个文档的作用域（stage/render 等都在它上面） */
  scope: (id: string) => any
  flush: () => Promise<void>
}

type ReflowFrame = {
  source: any
  pages: any[]
  generator: any
  original: ArrayBuffer
  start: number
  end: number
}

export function createReflowController(ctx: ReflowControllerContext) {
  let frame: ReflowFrame | undefined
  let current: { url: string; name: string; buffer: ArrayBuffer; pageMap: number[]; annotationMap: any[]; sourcePageCount: number } | undefined
  let active = false
  let busy = false

  const digestName = async (buffer: ArrayBuffer) =>
    'reflow-' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))).map(value => value.toString(16).padStart(2, '0')).join('') + '.pdf'

  const buildWindow = async (signal: AbortSignal, center: number) => {
    if (!frame) throw new Error('Reflow session is not ready')
    const startedAt = performance.now()
    const { from, to } = reflowWindowRange(center, frame.pages.length)
    ctx.setStatus(`${ctx.label('pdfReflow', 'Text reflow')} 0/${to - from + 1}`)
    const generated = await frame.generator.generate(
      frame.original.slice(0),
      ctx.layout(),
      signal,
      (page: number, count: number) => { ctx.setStatus(`${ctx.label('pdfReflow', 'Text reflow')} ${page}/${count}`) },
      { from, to },
      (stage, page, count) => {
        const stageText = stage === 'ocr' ? ctx.label('pdfReflowRecognizing', '识别中') : ctx.label('pdfReflowRendering', '渲染中')
        ctx.setStatus(`${ctx.label('pdfReflow', 'Text reflow')} ${page}/${count} · ${stageText}…`)
      },
    )
    diagnosticLog('info', 'pdf.reflow.window', { from, to, ms: Math.round(performance.now() - startedAt) })
    return { generated, from, to }
  }

  const showWindow = async (buffer: ArrayBuffer, pageMap: number[], annotationMap: any[], to: number, targetSource: number, signal: AbortSignal) => {
    const documents = ctx.documents()
    if (!documents) return
    const previousId = ctx.documentId()
    const stage = ctx.scoped('stage')
    const mode = stage?.getZoomMode() || 'fit-width'
    const level = stage?.getZoomLevel()
    const name = await digestName(buffer)
    const url = '/public/siyuan-sireader/reflow/' + name
    await ctx.writeManaged(new Blob([buffer], { type: 'application/pdf' }), url, name)
    current = { url, name, buffer, pageMap, annotationMap, sourcePageCount: frame?.pages.length || 0 }
    const nextId = crypto.randomUUID()
    const { document } = await documents.open({ kind: 'bytes', bytes: buffer, id: nextId }, { name: active ? undefined : name, activate: false, signal })
    if (document.status !== 'ready') throw new Error(ctx.label('pdfLoadFailed', 'PDF load failed'))
    signal.throwIfAborted()
    active = true
    documents.setActive(nextId)
    try {
      ctx.scope(nextId).get('stage').zoomTo(mode === 'custom' && level ? level : { mode })
      await ctx.attach(nextId, signal, Math.max(0, pageMap.indexOf(targetSource)))
    } catch (error) {
      if (!signal.aborted) { documents.setActive(previousId); await ctx.attach(previousId, signal, 0) }
      throw error
    }
    if (previousId && previousId !== nextId) await documents.close(previousId).catch(() => {})
    if (frame) frame.end = to
  }

  /** 滑到窗口边缘时续排下一窗。 */
  const extend = async () => {
    if (!active || !frame || busy) return
    const signal = ctx.signal()
    const stage = ctx.scoped('stage')
    if (!signal || !stage || !current) return
    const output = stage.getCurrentPageIndex()
    const size = current.pageMap.length
    if (!size) return
    // 提前 3 页就开始续排，翻到边界时已经接上了
    const atEnd = output >= size - 3 && frame.end < frame.pages.length - 1
    const atStart = output <= 2 && frame.start > 0
    if (!atEnd && !atStart) return
    busy = true
    try {
      const window = await buildWindow(signal, atEnd ? frame.end + 1 : frame.start - 1)
      const merged = current
        ? await frame.generator.merge(current.buffer, window.generated.buffer, atEnd ? 'end' : 'start')
        : window.generated.buffer
      const pageMap = atEnd
        ? [...current!.pageMap, ...window.generated.pageMap]
        : [...window.generated.pageMap, ...current!.pageMap]
      const annotationMap = atEnd
        ? [...current!.annotationMap, ...window.generated.annotationMap]
        : [...window.generated.annotationMap, ...current!.annotationMap]
      if (atEnd) frame.end = window.to
      else frame.start = window.from
      await showWindow(merged, pageMap, annotationMap, atEnd ? window.to : window.to, atEnd ? window.from : window.to, signal)
    } catch (error) {
      if (!signal.aborted) ctx.onFailure(error)
    } finally {
      busy = false
      if (!ctx.signal()?.aborted) ctx.setStatus('')
    }
  }

  const toggle = async () => {
    const signal = ctx.signal()
    if (busy || !signal || !ctx.documentId()) return
    busy = true
    const documents = ctx.documents()
    const previousId = ctx.documentId()
    const stage = ctx.scoped('stage')
    const index = stage?.getCurrentPageIndex() || 0
    try {
      await ctx.flush()
      if (active) {
        // 退出重排：回到原始 PDF 的同一页
        const source = current?.pageMap[index] ?? index
        if (!frame) throw new Error('Reflow source is missing')
        const nextId = crypto.randomUUID()
        const { document } = await documents.open({ kind: 'bytes', bytes: frame.original.slice(0), id: nextId }, { activate: false, signal })
        if (document.status !== 'ready') throw new Error(ctx.label('pdfLoadFailed', 'PDF load failed'))
        active = false
        documents.setActive(nextId)
        await ctx.attach(nextId, signal, source)
        await documents.close(previousId).catch(() => {})
        return
      }

      // 重新进入：先释放上一次会话（MuPDF 文档 + worker）
      void frame?.source?.close?.().catch(() => {})
      frame?.generator?.dispose?.()
      frame = undefined
      current = undefined
      ctx.setStatus(ctx.label('pdfReflow', 'Text reflow'))
      await ctx.ensureEngine()
      const original = await documents.download(previousId, { signal })
      const source = await ctx.openPdf(original.slice())
      try {
        const { pages } = await source.pages.list()
        if (!pages.length) throw new Error('PDF has no pages')
        frame = { source, pages, generator: createPdfReflowSession(source, pages, ctx.canCopy()), original: original.slice().buffer as ArrayBuffer, start: 0, end: 0 }
        const window = await buildWindow(signal, index)
        frame.start = window.from
        frame.end = window.to
        await showWindow(window.generated.buffer, window.generated.pageMap, window.generated.annotationMap, window.to, index, signal)
      } catch (error) { await source.close().catch(() => {}); throw error }
    } catch (error) {
      if (!signal.aborted) ctx.onFailure(error)
    } finally {
      if (!signal.aborted) ctx.setStatus('')
      busy = false
    }
  }

  return {
    isActive: () => active,
    current: () => current,
    toggle: () => toggle(),
    extend: () => extend(),
    reset() {
      void frame?.source?.close?.().catch(() => {})
      frame?.generator?.dispose?.()
      frame = undefined
      current = undefined
      active = false
      busy = false
    },
  }
}
