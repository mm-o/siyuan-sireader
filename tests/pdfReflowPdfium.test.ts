import { expect, test } from 'vitest'
import { localEngine } from '@embedpdf/engine'
import * as mupdf from 'mupdf'
import { createReflowDocument } from '../src/core/pdfReflowDocument'
import { alignLegacyPdfAnnotations, PDF_MIGRATION_VERSION } from '../src/core/dataMigration'

test('EmbedPDF renders, extracts text and round-trips annotations on the reflow PDF', async () => {
  const engine = localEngine({ runtime: { prefer: 'wasm' } })
  const output = createReflowDocument(mupdf, { width: 300, height: 400, fontSize: 18 })
  output.append({ pageIndex: 0, ocr: false, blocks: [{ text: '中文原生标注 Native PDF selection. '.repeat(30) }] })
  try {
    const document = await engine.open({ kind: 'bytes', bytes: output.finish().buffer })
    const { pages } = await document.pages.list()
    expect(pages.length).toBeGreaterThan(1)
    const page = document.page(pages[0].ref)
    expect((await page.text.get()).text).toContain('中文')
    const { matches } = await document.search.query({ text: 'Native' })
    expect(matches.length).toBeGreaterThan(0)
    const match = matches[0]
    const [aligned] = await alignLegacyPdfAnnotations([{
      annotation: {
        id: 'legacy',
        pageIndex: 0,
        rect: { origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } },
        custom: { text: 'Native', legacyType: 'highlight' },
      },
    }], document)
    expect(aligned.annotation.custom.textCoord).toBe(PDF_MIGRATION_VERSION)
    expect(aligned.annotation.segmentRects.length).toBeGreaterThan(0)
    await document.page(match.page).annotations.create({
      subtype: 'highlight',
      quadPoints: match.segments.map(segment => segment.quad),
      color: '#FFCD45',
      contents: 'native note',
    })
    const image = await page.render.image({ viewport: { kind: 'width', width: 150 } })
    expect((await image.blob()).size).toBeGreaterThan(0)
    const saved = await document.download()
    await document.close()
    const reopened = await engine.open({ kind: 'bytes', bytes: saved })
    const annotations = await reopened.annotations.list()
    expect(annotations.annotations.some(item => item.subtype === 'highlight' && item.contents === 'native note')).toBe(true)
    await reopened.close()
  } finally {
    await engine.destroy()
  }
}, 20000)
