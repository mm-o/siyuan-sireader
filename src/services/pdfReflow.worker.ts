import { createReflowDocument } from '@/core/pdfReflowDocument'
import { analyzeScribePages, readMuPdfPage, readSiyuanOcrPage, plainOcrBlocks } from '@/core/scribeReflow'

let engine: any, output: ReturnType<typeof createReflowDocument> | undefined
let document: any
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
        engine = await import(/* @vite-ignore */ payload.engineUrl)
        document = engine.Document.openDocument(payload.buffer, 'application/pdf')
        if (document.needsPassword()) throw new Error('PDF requires a password for text extraction')
        sizes = payload.sizes
      } else if (command === 'layout-begin') {
        output?.dispose(); output = createReflowDocument(engine, payload)
      } else if (command === 'layout-page') {
        if (!output) throw new Error('Reflow output is not initialized')
        output.append(payload)
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
