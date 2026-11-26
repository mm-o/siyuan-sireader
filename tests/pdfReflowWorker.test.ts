import { afterEach, expect, test, vi } from 'vitest'
import * as mupdf from 'mupdf'

afterEach(() => vi.unstubAllGlobals())

test('worker rejects a scan text layer, accepts fresh OCR, and retains text-only paragraphs', async () => {
  let complete: (data: any) => void
  const channel: any = { postMessage: (data: any) => complete(data) }
  vi.stubGlobal('self', channel)
  await import('../src/services/pdfReflow.worker')
  let id = 0
  const request = (command: string, payload: any) => new Promise<any>((resolve, reject) => {
    complete = data => data.error ? reject(new Error(data.error)) : resolve(data.result)
    channel.onmessage({ data: { id: ++id, command, payload } })
  })
  const doc = new mupdf.PDFDocument(), font = new mupdf.Font('Helvetica')
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 6, 8], false)
  pixmap.clear(255)
  const image = new mupdf.Image(pixmap)
  try {
    const resources = { XObject: { I1: doc.addImage(image) }, Font: { F1: doc.addSimpleFont(font, 'Latin') } }
    doc.insertPage(-1, doc.addPage([0, 0, 600, 800], 0, resources, 'q 600 0 0 800 0 0 cm /I1 Do Q BT /F1 11 Tf 3 Tr 40 650 Td (BAD OLD OCR) Tj ET'))
    const saved = doc.saveToBuffer('')
    const buffer = saved.asUint8Array().slice().buffer
    saved.destroy()
    await request('open', { engineUrl: 'mupdf', buffer, sizes: [{ width: 600, height: 800 }] })
    expect(await request('page', { index: 0 })).toMatchObject({ needsOCR: true, blocks: [] })
    const ocr = await request('ocr', { index: 0, image: { width: 1200, height: 1600 }, result: { text: '甲\n乙\n丙\n\n第二段', ocrJSON: [] } })
    expect(ocr.ocr).toBe(true)
    expect(ocr.blocks.map((b: any) => b.text)).toEqual(['甲乙丙', '第二段'])
    expect((await request('page', { index: 0 })).blocks).toEqual(ocr.blocks)
    await request('layout-begin', { width: 300, height: 400, fontSize: 18 })
    await request('layout-page', ocr)
    const output = await request('layout-finish', {})
    const reflow = mupdf.Document.openDocument(output.buffer, 'application/pdf'), page = reflow.loadPage(0), text = page.toStructuredText()
    expect(text.asText()).toContain('甲乙丙')
    expect(output.pageMap).toEqual([0])
    text.destroy(); page.destroy(); reflow.destroy()
    // merge：把新窗口按 start/end 拼到已有结果上（这条路径此前一直被 detached 错误挡住）
    const payload = doc.saveToBuffer(''), addition = payload.asUint8Array().slice().buffer
    payload.destroy()
    const readPages = (bytes: ArrayBuffer) => {
      const pdf = mupdf.Document.openDocument(bytes, 'application/pdf'), texts: string[] = []
      try {
        for (let index = 0; index < pdf.countPages(); index++) {
          const loaded = pdf.loadPage(index), content = loaded.toStructuredText()
          try { texts.push(content.asText()) } finally { content.destroy(); loaded.destroy() }
        }
      } finally { pdf.destroy() }
      return texts
    }
    const appended = await request('merge', { base: output.buffer, addition, at: 'end', expect: 1 })
    expect(appended.pages).toBe(2)
    expect(readPages(appended.buffer)).toHaveLength(2)
    // 第二次合并：worker 已经留着累积文档（2 页），只增量插页，不再重解析 base
    const prepended = await request('merge', { base: appended.buffer, addition, at: 'start', expect: 2 })
    expect(prepended.pages).toBe(3)
    const texts = readPages(prepended.buffer)
    expect(texts[1]).toContain('甲乙丙')
    expect(texts[0]).toContain('BAD OLD OCR')
    expect(texts[2]).toContain('BAD OLD OCR')
    // 页数对不上时不能默默拼下去
    await expect(request('merge', { base: appended.buffer, addition, at: 'end', expect: 9 })).rejects.toThrow(/expected 9/)
    await expect(request('page', { index: 99 })).rejects.toThrow('Invalid PDF page')
  } finally { image.destroy(); pixmap.destroy(); doc.destroy(); font.destroy() }
})
