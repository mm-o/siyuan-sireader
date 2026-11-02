import { expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as mupdf from 'mupdf'
import { createReflowDocument } from '../src/core/pdfReflowDocument'

test('EmbedPDF PDFium renders, selects text, creates and saves native annotations on the reflow PDF', async () => {
  // Exercise the exact transitive versions shipped by the pinned snippet, without a browser shim.
  const dependencies = 'node_modules/.pnpm', installed = readdirSync(dependencies)
  const packageRoot = (name: string) => resolve(dependencies, installed.find(p => p.startsWith(`@embedpdf+${name}@`))!, 'node_modules/@embedpdf', name, 'dist')
  const load = (url: string) => import(/* @vite-ignore */ url)
  const { init } = await load(pathToFileURL(packageRoot('pdfium') + '/index.js').href)
  const { PdfiumNative } = await load(pathToFileURL(packageRoot('engines') + '/index.js').href)
  const engine = new PdfiumNative(await init({ wasmBinary: readFileSync(packageRoot('pdfium') + '/pdfium.wasm') }))
  const wait = <T = any>(task: any) => new Promise<T>((resolve, reject) => task.wait(resolve, reject))
  const output = createReflowDocument(mupdf, { width: 300, height: 400, fontSize: 18 })
  output.append({ pageIndex: 0, ocr: false, blocks: [{ text: '中文原生标注 Native PDF selection. '.repeat(30) }] })
  const result = output.finish()
  try {
    const document: any = await wait(engine.openDocumentBuffer({ id: 'native-reflow', content: result.buffer }))
    expect(document.pages.length).toBeGreaterThan(1)
    expect(await wait(engine.extractText(document, [0]))).toContain('中文')
    const page = document.pages[0]
    const geometry: any = await wait(engine.getPageGeometry(document, page))
    expect(geometry.runs.length).toBeGreaterThan(0)
    const rects: any[] = await wait(engine.getPageTextRects(document, page))
    expect(rects.length).toBeGreaterThan(0)
    const rect = rects[0].rect || rects[0]
    await wait(engine.createPageAnnotation(document, page, { id: 'native-highlight', type: 9, pageIndex: 0, rect, segmentRects: [rect], color: '#FFCD45', opacity: 1, blendMode: 1, contents: 'native note' }))
    const bitmap: any = await wait(engine.renderPageRaw(document, page, { scaleFactor: 1, withAnnotations: true }))
    expect(bitmap.width).toBeGreaterThan(0)
    expect(bitmap.height).toBeGreaterThan(0)
    const saved: ArrayBuffer = await wait(engine.saveAsCopy(document))
    await wait(engine.closeDocument(document))
    const reopened: any = await wait(engine.openDocumentBuffer({ id: 'native-reopened', content: saved }))
    const annotations: any[] = await wait(engine.getPageAnnotations(reopened, reopened.pages[0]))
    expect(annotations.some(a => a.type === 9 && a.contents === 'native note')).toBe(true)
    await wait(engine.closeDocument(reopened))
  } finally { await wait(engine.destroy()) }
}, 20000)
