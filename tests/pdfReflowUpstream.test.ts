import { expect, test } from 'vitest'
import * as mupdf from 'mupdf'
import { analyzeScribePages, readMuPdfPage, readSiyuanOcrPage, plainOcrBlocks } from '../src/core/scribeReflow'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

test('vendored Scribe algorithms match the pinned upstream source byte for byte', () => {
  const root = 'src/vendor/scribe-layout/'
  const manifest = JSON.parse(readFileSync(root + 'UPSTREAM.json', 'utf8'))
  for (const [file, hash] of Object.entries(manifest.sha256)) {
    const source = readFileSync(root + file, 'utf8').replace(/^\/\/ @ts-nocheck[^\n]*\n/, '')
    expect(createHash('sha256').update(source).digest('hex')).toBe(hash)
  }
})

test('real MuPDF extraction and upstream Scribe join lines and remove running furniture', () => {
  const doc = new mupdf.PDFDocument(), font = new mupdf.Font('Helvetica')
  try {
    const resource = { Font: { F1: doc.addSimpleFont(font, 'Latin') } }
    for (let i = 0; i < 3; i++) {
      const content = `BT /F1 8 Tf 40 770 Td (RUNNING HEADER) Tj ET
BT /F1 11 Tf 40 650 Td (This paragraph starts here and continues) Tj 0 -16 Td (on another physical line with the remaining) Tj 0 -16 Td (words of the same paragraph.) Tj ET
BT /F1 8 Tf 300 20 Td (${i + 1}) Tj ET`
      doc.insertPage(-1, doc.addPage([0, 0, 600, 800], 0, resource, content))
    }
    const pages = [0, 1, 2].map(i => readMuPdfPage(doc, i, { width: 600, height: 800 }))
    const result = analyzeScribePages(pages, 1)
    const visible = result.blocks.filter(b => !['header', 'footer', 'pagenum', 'linenum'].includes(b.role || ''))
    expect(visible.map(b => b.text)).toEqual(['This paragraph starts here and continues on another physical line with the remaining words of the same paragraph.'])
    expect(result.blocks.some(b => b.role === 'header')).toBe(true)

  } finally { doc.destroy(); font.destroy() }
})

test('OCR TSV line hierarchy feeds upstream paragraph detection with original word coordinates', () => {
  const rows = [
    { level: '5', block_num: '1', par_num: '1', line_num: '1', text: '这是正文段落的第一行', left: '80', top: '280', width: '500', height: '20' },
    { level: '5', block_num: '1', par_num: '1', line_num: '2', text: '接着第一行继续阅读的正文', left: '80', top: '308', width: '500', height: '20' },
  ]
  const page = readSiyuanOcrPage(0, { ocrJSON: rows }, { width: 600, height: 800 }, { width: 1200, height: 1600 })
  const result = analyzeScribePages([page], 0, true)
  expect(result.blocks.map(b => b.text)).toEqual(['这是正文段落的第一行接着第一行继续阅读的正文'])
  expect(page.lines[0].words[0].bbox.left).toBe(40)
  expect(page.lines[0].words[0].bbox.top).toBe(140)
})

test('segmented extraction retains each repeated line at its own source coordinates', () => {
  const doc = new mupdf.PDFDocument(), font = new mupdf.Font('Helvetica')
  try {
    const resource = { Font: { F1: doc.addSimpleFont(font, 'Latin') } }
    doc.insertPage(-1, doc.addPage([0, 0, 600, 800], 0, resource,
      'BT /F1 11 Tf 320 650 Td (Repeated heading) Tj ET BT /F1 11 Tf 40 650 Td (Repeated heading) Tj ET'))
    const page = readMuPdfPage(doc, 0, { width: 600, height: 800 })
    expect(page.lines).toHaveLength(2)
    expect(page.lines.map((line: any) => line.words.map((word: any) => word.text).join(' '))).toEqual(['Repeated heading', 'Repeated heading'])
    expect(page.lines.map((line: any) => line.words[0].chars[0].bbox.left).sort((a: number, b: number) => a - b)).toEqual([40, 320])
  } finally { doc.destroy(); font.destroy() }
})

test('plain OCR joins physical wraps and preserves explicit paragraph separators without fake boxes', () => {
  expect(plainOcrBlocks('甲\n乙\n丙\n\nEnglish line\ncontinues')).toEqual([
    { text: '甲乙丙', role: 'body' },
    { text: 'English line continues', role: 'body' },
  ])
})
test('upstream recognizes running headers in OCR TSV across adjacent pages', () => {
  const pages = [0, 1, 2].map(index => readSiyuanOcrPage(index, { ocrJSON: [
    { level: 5, block_num: 1, par_num: 1, line_num: 1, text: 'RUNNING HEADER', left: 40, top: 25, width: 150, height: 8 },
    { level: 5, block_num: 2, par_num: 1, line_num: 1, text: 'This is the first physical line of a paragraph', left: 40, top: 140, width: 300, height: 11 },
    { level: 5, block_num: 2, par_num: 1, line_num: 2, text: 'and the next line continues that paragraph.', left: 40, top: 156, width: 300, height: 11 },
    { level: 5, block_num: 3, par_num: 1, line_num: 1, text: String(index + 1), left: 300, top: 770, width: 8, height: 8 },
  ] }, { width: 600, height: 800 }, { width: 600, height: 800 }))
  const result = analyzeScribePages(pages, 1, true)
  expect(result.blocks.find(b => b.text === 'RUNNING HEADER')?.role).toBe('header')
  expect(result.blocks.some(b => b.text.includes('paragraph and the next'))).toBe(true)
})
