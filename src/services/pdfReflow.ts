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

/**
 * 按需重排的窗口：以当前页为中心取 6 页，夹在文档首尾之内。
 * 窗口越小首屏越快、续排时每一步要排的页也越少；代价是合并次数变多，
 * 所以 worker 侧改成把累积文档留住、只增量插页（见 pdfReflow.worker 的 merge）。
 */
export const REFLOW_WINDOW = 6
/** 距窗口边缘还剩几页就开始续排。 */
export const REFLOW_TRIGGER = 2
export const reflowWindowRange = (center: number, total: number, window = REFLOW_WINDOW) => {
  const last = Math.max(0, total - 1)
  const from = Math.max(0, Math.min(center - Math.floor(window / 2), Math.max(0, last - window + 1)))
  return { from, to: Math.min(last, from + window - 1) }
}

/**
 * 续排窗口：从已有区间外面接一窗，**不与已有页重叠**。
 * 以前续排也用「以中心取窗」，向前续排会盖住已有 6 页，合并后同一页出现两次。
 * 已经在文档首/尾时返回 to < from，调用方据此放弃。
 */
export const reflowExtendRange = (start: number, end: number, total: number, at: 'start' | 'end', window = REFLOW_WINDOW) => {
  const last = Math.max(0, total - 1)
  if (at === 'end') {
    if (end >= last) return { from: last + 1, to: last } // 到底了：空区间
    return { from: end + 1, to: Math.min(last, end + window) }
  }
  if (start <= 0) return { from: 0, to: -1 } // 到顶了：空区间
  return { from: Math.max(0, start - window), to: start - 1 }
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
  // worker 是否已经持有一份可继续追加的累积文档
  let mergeSeeded = false
  // worker 里当前打开的是哪一份源 PDF：同一个 key 的后续窗口不必再搬字节
  let openedKey = ''
  return {
    /**
     * 把一个新窗口的 PDF 拼到已有结果的前面（start）或后面（end）。
     * expect = 拼之前应有多少页：worker 用它校验留着的累积文档有没有跑偏。
     */
    async merge(base: ArrayBuffer | undefined, addition: ArrayBuffer, at: 'start' | 'end', expect?: number) {
      // 累积文档还在（页数对得上）就不必把整本 base 再搬过去重解析
      if (mergeSeeded) {
        try {
          const result = await worker.request<{ buffer: ArrayBuffer }>('merge', { addition, at, expect })
          return result.buffer
        } catch (error) {
          if ((error as { fatal?: boolean })?.fatal) throw error
          // 状态对不上（上一次合并中途失败等）：退回带 base 重建
          mergeSeeded = false
        }
      }
      const result = await worker.request<{ buffer: ArrayBuffer }>('merge', { base, addition, at, expect })
      mergeSeeded = true
      return result.buffer
    },
    async generate(buffer: ArrayBuffer, layout: ReflowLayout, callerSignal: AbortSignal, progress: (page: number, count: number) => void, range?: { from: number; to: number }, onStage?: (stage: 'render' | 'ocr', page: number, count: number) => void, reuseKey?: string) {
      callerSignal.throwIfAborted()
      const cancel = () => lifetime.abort(callerSignal.reason)
      callerSignal.addEventListener('abort', cancel, { once: true })
      const { signal } = lifetime
      try {
        // Transfer a copy: the committed source snapshot remains available for rollback.
        // reuseKey 没变时 worker 里已经是这份文档，连拷贝都不用做，直接跳过 open。
        const reuse = !!reuseKey && reuseKey === openedKey
        const snapshot = reuse ? undefined : buffer.slice(0)
        await worker.request<void>('open', { buffer: snapshot, sizes: pages.map((page: any) => page.size), engineUrl: new URL(runtimeUrl('mupdf', 'mupdf.js'), location.origin).href, key: reuseKey }, snapshot ? [snapshot] : [])
        openedKey = reuseKey || ''
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
  /** 同一份源文档的会话标识：续排换窗口时不必重搬、重解整本 PDF */
  key: string
  start: number
  end: number
}

export function createReflowController(ctx: ReflowControllerContext) {
  let frame: ReflowFrame | undefined
  let current: { url: string; name: string; buffer: ArrayBuffer; pageMap: number[]; annotationMap: any[]; sourcePageCount: number } | undefined
  let active = false
  let busy = false

  const digestOf = async (buffer: ArrayBuffer) =>
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))).map(value => value.toString(16).padStart(2, '0')).join('')

  const buildWindow = async (signal: AbortSignal, range: { from: number; to: number }) => {
    if (!frame) throw new Error('Reflow session is not ready')
    const startedAt = performance.now()
    const { from, to } = range
    ctx.setStatus(`${ctx.label('pdfReflow', 'Text reflow')} 0/${to - from + 1}`)
    const generated = await frame.generator.generate(
      frame.original,
      ctx.layout(),
      signal,
      (page: number, count: number) => { ctx.setStatus(`${ctx.label('pdfReflow', 'Text reflow')} ${page}/${count}`) },
      { from, to },
      (stage, page, count) => {
        const stageText = stage === 'ocr' ? ctx.label('pdfReflowRecognizing', '识别中') : ctx.label('pdfReflowRendering', '渲染中')
        ctx.setStatus(`${ctx.label('pdfReflow', 'Text reflow')} ${page}/${count} · ${stageText}…`)
      },
      frame.key,
    )
    diagnosticLog('info', 'pdf.reflow.window', { from, to, ms: Math.round(performance.now() - startedAt) })
    return { generated, from, to }
  }

  /**
   * merge 的 base：就是内存里那份累积结果。
   * 重排产物是临时的、不落盘，所以这份 buffer 必须始终活着；
   * 一旦它被 detach（谁把它 transfer 走了），只能明确报错，不能拿死 buffer 去 postMessage。
   */
  const mergeBase = (buffer: ArrayBuffer | undefined) => {
    if (buffer?.byteLength) return buffer
    diagnosticLog('error', 'pdf.reflow.merge.base.detached')
    throw new Error('重排缓冲已被释放，请退出重排后重新进入')
  }

  const showWindow = async (buffer: ArrayBuffer, pageMap: number[], annotationMap: any[], targetSource: number, signal: AbortSignal) => {
    const documents = ctx.documents()
    if (!documents) return
    const previousId = ctx.documentId()
    const previousWindow = current
    const stage = ctx.scoped('stage')
    const mode = stage?.getZoomMode() || 'fit-width'
    const level = stage?.getZoomLevel()
    // 重排 PDF 是临时产物：只在内存里，不写 data 目录（否则每续一窗就多一份、越滚越大）。
    // 内容哈希只用来当标注/进度的稳定 key 和导出时的文件名。
    const digest = await digestOf(buffer)
    const name = `reflow-${digest}.pdf`
    const url = `reflow:${digest}`
    // documents.open() 会把 bytes 转移给 pdfium 的 worker（toArrayBuffer→postMessage transfer），
    // 交进去的 ArrayBuffer 立刻 detached。续排还要拿累积结果当 merge 的 base，所以自己留一份，
    // 交给引擎的是拷贝 —— 否则续排第二次就报 "merge: ... ArrayBuffer is detached"。
    // attachDocument 会用 current() 作为标注/进度的 key，所以这里必须先挂上再 attach。
    current = { url, name, buffer, pageMap, annotationMap, sourcePageCount: frame?.pages.length || 0 }
    const nextId = crypto.randomUUID()
    const { document } = await documents.open({ kind: 'bytes', bytes: buffer.slice(0), id: nextId }, { name: active ? undefined : name, activate: false, signal })
    if (document.status !== 'ready') throw new Error(ctx.label('pdfLoadFailed', 'PDF load failed'))
    signal.throwIfAborted()
    documents.setActive(nextId)
    try {
      ctx.scope(nextId).get('stage').zoomTo(mode === 'custom' && level ? level : { mode })
      await ctx.attach(nextId, signal, Math.max(0, pageMap.indexOf(targetSource)))
    } catch (error) {
      // 回滚：先把 current 换回上一窗，再按它的 key 重新 attach 上一窗
      current = previousWindow
      if (!signal.aborted) { documents.setActive(previousId); await ctx.attach(previousId, signal, 0) }
      throw error
    }
    // 只有真的显示出来了才算进入重排；中途失败时 isActive() 不能谎报
    active = true
    if (previousId && previousId !== nextId) await documents.close(previousId).catch(() => {})
  }

  /** 滑到窗口边缘时续排下一窗。 */
  const extend = async () => {
    if (!active || !frame || busy) return
    const signal = ctx.signal()
    const stage = ctx.scoped('stage')
    const previous = current
    if (!signal || !stage || !previous) return
    const output = stage.getCurrentPageIndex()
    const size = previous.pageMap.length
    if (!size) return
    // 提前几页就开始续排，翻到边界时已经接上了
    const forward = output >= size - REFLOW_TRIGGER && frame.end < frame.pages.length - 1
    const backward = output <= REFLOW_TRIGGER - 1 && frame.start > 0
    if (!forward && !backward) return
    busy = true
    try {
      const range = reflowExtendRange(frame.start, frame.end, frame.pages.length, forward ? 'end' : 'start')
      if (range.to < range.from) return
      const window = await buildWindow(signal, range)
      const addition = window.generated
      const merged = await frame.generator.merge(mergeBase(previous.buffer), addition.buffer, forward ? 'end' : 'start', previous.pageMap.length)
      const pageMap = forward ? [...previous.pageMap, ...addition.pageMap] : [...addition.pageMap, ...previous.pageMap]
      const annotationMap = forward ? [...previous.annotationMap, ...addition.annotationMap] : [...addition.annotationMap, ...previous.annotationMap]
      if (pageMap.length !== annotationMap.length) diagnosticLog('warn', 'pdf.reflow.merge.map.mismatch', { pages: pageMap.length, maps: annotationMap.length })
      if (forward) frame.end = window.to
      else frame.start = window.from
      // 累积后仍是同一处正文：把当前页索引换算过去，续排后不要跳页
      const shift = forward ? 0 : addition.pageMap.length
      const target = pageMap[Math.min(pageMap.length - 1, output + shift)] ?? 0
      await showWindow(merged, pageMap, annotationMap, target, signal)
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
        // 退出后回到源文档自己的标注/进度 key（current 还挂着会让源 PDF 继续用重排 key）
        current = undefined
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
      const downloaded = await documents.download(previousId, { signal })
      // download() 返回 Uint8Array；open() 会转移它的 buffer，所以「引擎用」和「回滚用」各留独立副本
      const bytes = downloaded instanceof Uint8Array ? downloaded.slice() : new Uint8Array(downloaded as ArrayBuffer).slice()
      const original = bytes.slice()
      const source = await ctx.openPdf(bytes)
      try {
        const { pages } = await source.pages.list()
        if (!pages.length) throw new Error('PDF has no pages')
        frame = { source, pages, generator: createPdfReflowSession(source, pages, ctx.canCopy()), original: original.buffer as ArrayBuffer, key: crypto.randomUUID(), start: 0, end: 0 }
        const window = await buildWindow(signal, reflowWindowRange(index, pages.length))
        frame.start = window.from
        frame.end = window.to
        await showWindow(window.generated.buffer, window.generated.pageMap, window.generated.annotationMap, index, signal)
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
