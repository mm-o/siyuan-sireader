import { createReflowDocument } from '@/core/pdfReflowDocument'
import { analyzeScribePages, readMuPdfPage, readSiyuanOcrPage, plainOcrBlocks } from '@/core/scribeReflow'

let engine: any, output: ReturnType<typeof createReflowDocument> | undefined
let document: any
let documentKey = ''
/** 分窗合并的累积文档：留着它才能只增量插页，不用每窗重解析整本 */
let merged: any
let sizes: { width: number; height: number }[] = []
const pages = new Map<number, any>()
const getPage = (index: number) => {
  if (!pages.has(index)) pages.set(index, readMuPdfPage(document, index, sizes[index]))
  return pages.get(index)
}
// Serialize requests: MuPDF owns native resources and Scribe mutates cloned pages.
let queue = Promise.resolve()
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    const { id, command, payload } = data
    try {
      let result: any
      if (command === 'open') {
        // 同一个重排会话的后续窗口：源文档没换，就不必再搬一次、再解一次整本 PDF
        if (payload.key && payload.key === documentKey && document) {
          sizes = payload.sizes
        } else {
          if (!payload.buffer) throw new Error('open requires PDF bytes for a new source')
          engine = await import(/* @vite-ignore */ payload.engineUrl)
          document = engine.Document.openDocument(payload.buffer, 'application/pdf')
          if (document.needsPassword()) throw new Error('PDF requires a password for text extraction')
          sizes = payload.sizes
          pages.clear()
          merged?.destroy?.()
          merged = undefined
          documentKey = payload.key || ''
        }
      } else if (command === 'layout-begin') {
        output?.dispose(); output = createReflowDocument(engine, payload)
      } else if (command === 'layout-page') {
        if (!output) throw new Error('Reflow output is not initialized')
        output.append(payload)
      } else if (command === 'merge') {
        // 分窗合并：worker 自己留着一份累积文档，只增量插页；只有在首次合并、
        // 或页数对不上（上一次中途失败）时才按 base 重建。
        if (payload.base && !payload.base.byteLength) throw new Error('merge base is detached (already transferred)')
        const expected = Number(payload.expect)
        const addition = engine.PDFDocument.openDocument(payload.addition, 'application/pdf')
        try {
          const added = addition.countPages()
          if (!merged || (Number.isFinite(expected) && merged.countPages() !== expected)) {
            merged?.destroy?.()
            merged = payload.base
              ? engine.PDFDocument.openDocument(payload.base, 'application/pdf')
              : new engine.PDFDocument()
          }
          const basePages = merged.countPages()
          if (Number.isFinite(expected) && basePages !== expected) throw new Error(`merge base has ${basePages} pages, expected ${expected}`)
          const at = payload.at === 'start' ? 0 : basePages
          // 跨文档搬页只有 graftPage（insertPage 要的是 PDFObject，塞文档进去会拼出坏 page tree）
          for (let n = 0; n < added; n++) merged.graftPage(at + n, addition, n)
          if (merged.countPages() !== basePages + added) throw new Error('merge produced an unexpected page count')
          // 这份字节只喂给 viewer（不落盘），压缩整本纯属浪费
          result = { buffer: merged.saveToBuffer('').asUint8Array().slice().buffer, pages: basePages + added }
        } finally {
          addition.destroy?.()
        }
      } else if (command === 'layout-finish') {
        if (!output) throw new Error('Reflow output is not initialized')
        result = output.finish(); output = undefined
      } else {
        const { index } = payload
        if (!document || !sizes[index]) throw new Error('Invalid PDF page')
        if (command === 'ocr') {
          const page = readSiyuanOcrPage(index, payload.result, sizes[index], payload.image)
          if (!page.lines.length) page.plainText = payload.result?.text || ''
          page.ocr = true
          pages.set(index, page)
        }
        const current = getPage(index)
        if (current.scan && !current.ocr) {
          result = { pageIndex: index, blocks: [], ocr: false, needsOCR: true }
        } else {
          const context = []
          for (let n = Math.max(0, index - 2); n <= Math.min(sizes.length - 1, index + 2); n++) {
            const page = getPage(n)
            // Do not let a neighboring scan's damaged embedded OCR bias the model.
            if (!page.scan || page.ocr) context.push(page)
          }
          result = analyzeScribePages(context, index, !!current.ocr)
        }
        // A provider may return plain text without TSV geometry. Never fabricate coordinates.
        if (!result.blocks.length && current.plainText?.trim()) result.blocks = plainOcrBlocks(current.plainText)
        for (const key of pages.keys()) if (Math.abs(key - index) > 2) pages.delete(key)
      }
      self.postMessage({ id, result }, { transfer: result?.buffer instanceof ArrayBuffer ? [result.buffer] : [] })
    } catch (error: any) { self.postMessage({ id, error: error?.message || String(error) }) }
  })
}
