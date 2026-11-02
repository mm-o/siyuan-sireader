import { expect, test } from 'vitest'
import * as mupdf from 'mupdf'
import { createReflowDocument } from '../src/core/pdfReflowDocument'
import { projectReflowAnnotation } from '../src/core/pdfReflow'

test('reflows into a real multi-page PDF with searchable Chinese text and source-page mapping', () => {
  const writer = createReflowDocument(mupdf, { width: 300, height: 400, fontSize: 18 })
  writer.append({ pageIndex: 3, ocr: false, blocks: [{ role: 'header', text: 'RUNNING HEADER' }, { text: '中文正文和英文 Native selection. '.repeat(40) }] })
  writer.append({ pageIndex: 4, ocr: true, blocks: [{ text: '第二张原页 <script> 字样应该作为文字显示。' }] })
  const result = writer.finish(), doc = mupdf.Document.openDocument(result.buffer, 'application/pdf')
  try {
    expect(doc.countPages()).toBeGreaterThan(2)
    expect(result.pageMap.length).toBe(doc.countPages())
    expect(result.pageMap[0]).toBe(3)
    expect(result.pageMap.at(-1)).toBe(4)
    let text = ''
    for (let n = 0; n < doc.countPages(); n++) {
      const page = doc.loadPage(n), contents = page.toStructuredText()
      text += contents.asText(); contents.destroy(); page.destroy()
    }
    expect(text).toContain('中文正文')
    expect(text).toContain('Native')
    expect(text).toContain('<script>')
    expect(text).not.toContain('RUNNING HEADER')
    const page = doc.loadPage(0), contents = page.toStructuredText()
    expect(contents.search('中文', {}).length).toBeGreaterThan(0)
    contents.destroy(); page.destroy()
  } finally { doc.destroy() }
})

test('keeps exact source character coordinates through repagination and repeated text', () => {
  const text = '甲乙丙丁'.repeat(100)
  const spans = Array.from(text, (_, i) => ({ start: i, end: i + 1, rect: { origin: { x: 50 + i % 20 * 10, y: 80 + Math.floor(i / 20) * 16 }, size: { width: 10, height: 12 } } }))
  const writer = createReflowDocument(mupdf, { width: 200, height: 260, fontSize: 18 })
  writer.append({ pageIndex: 4, ocr: false, blocks: [{ text, spans }] })
  const result = writer.finish(), last = result.annotationMap.at(-1)!, glyph = last.glyphs.at(-1)!
  expect(result.annotationMap.length).toBeGreaterThan(1)
  expect(result.annotationMap.reduce((count, page) => count + page.glyphs.length, 0)).toBe(text.length)
  const projected = projectReflowAnnotation({ id: 'repeated', type: 10, pageIndex: result.pageMap.length - 1, segmentRects: [{ origin: { x: glyph[1], y: glyph[2] }, size: { width: glyph[3], height: glyph[4] } }] }, '/reflow.pdf', last, 4)
  expect(projected.type).toBe(10)
  expect(projected.pageIndex).toBe(4)
  expect(projected.rect).toEqual(spans.at(-1)!.rect)
})
