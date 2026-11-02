import { OcrPage, OcrLine, OcrWord, OcrChar } from '@/vendor/scribe-layout/js/objects/ocrObjects.js'
import { calcBboxUnion } from '@/vendor/scribe-layout/js/utils/miscUtils.js'
import { analyzeLayout } from '@/vendor/scribe-layout/js/import/analyzeLayout.js'
import type { ReflowPage, ReflowBlock } from './pdfReflow'

const bbox = (rect: number[]) => ({ left: rect[0], top: rect[1], right: rect[2], bottom: rect[3] })

/** Coordinate/data adaptation only: MuPDF owns text segmentation; Scribe owns layout decisions. */
export function readMuPdfPage(document: any, index: number, size: { width: number; height: number }): any {
  const native = document.loadPage(index)
  let text: any, segmented: any
  try {
    const bounds = native.getBounds(), sx = size.width / (bounds[2] - bounds[0]), sy = size.height / (bounds[3] - bounds[1])
    const convert = (r: number[]) => bbox([(r[0] - bounds[0]) * sx, (r[1] - bounds[1]) * sy, (r[2] - bounds[0]) * sx, (r[3] - bounds[1]) * sy])
    const page: any = new OcrPage(index, size)
    let line: any, word: any
    const finishWord = () => {
      if (word?.text) { word.bbox = calcBboxUnion(word.chars.map((c: any) => c.bbox)); line.words.push(word) }
      word = null
    }
    text = native.toStructuredText('paragraph-break,collect-styles,preserve-images')
    text.walk({
      onImageBlock(rect: number[]) {
        if ((rect[2] - rect[0]) * (rect[3] - rect[1]) >= (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]) * .8) page.scan = true
      },
      beginLine(rect: number[], mode: number) { line = new OcrLine(page, convert(rect), [0, 0]); line.orientation = mode ? 1 : 0; line.sourceText = '' },
      onChar(char: string, _origin: any, font: any, fontSize: number, quad: number[], color: number[]) {
        if (!line) return
        line.sourceText += char
        if (/\s/.test(char)) { finishWord(); return }
        const xs = [quad[0], quad[2], quad[4], quad[6]], ys = [quad[1], quad[3], quad[5], quad[7]]
        const box = convert([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
        if (!word) {
          word = new OcrWord(line, `${index}-${page.lines.length}-${line.words.length}`, '', box)
          word.chars = []
          word.style.size = fontSize * sy
          word.style.font = font.getName()
          word.style.bold = /bold/i.test(word.style.font)
          word.style.italic = /italic|oblique/i.test(word.style.font)
          word.style.color = '#' + color.slice(0, 3).map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
          word.conf = 100
        }
        word.text += char
        word.chars.push(new OcrChar(char, box))
      },
      endLine() {
        finishWord()
        if (line?.words.length) { line.bbox = calcBboxUnion(line.words.map((w: any) => w.bbox)); page.lines.push(line) }
        line = null
      },
    })
    // The session will request SiYuan OCR for scanned pages, not their old text layer.
    if (page.scan) { page.lines = []; return page }
    // MuPDF's segmenter supplies reading order. Its JS walk currently skips structure
    // nodes, so use JSON for order and the unsegmented walk for exact glyph quads.
    segmented = native.toStructuredText('segment,paragraph-break,collect-styles')
    const remaining = new Set<any>(page.lines), ordered: any[] = [], byText = new Map<string, any[]>()
    for (const line of page.lines) {
      const matches = byText.get(line.sourceText) || []
      matches.push(line); byText.set(line.sourceText, matches)
    }
    const visit = (blocks: any[]) => {
      for (const block of blocks || []) {
        if (block.contents) visit(block.contents)
        for (const nativeLine of block.lines || []) {
          const matches = (byText.get(nativeLine.text) || []).filter(line => remaining.has(line))
          const x = (nativeLine.bbox.x - bounds[0]) * sx, y = (nativeLine.bbox.y - bounds[1]) * sy
          const distance = (line: any) => Math.hypot(line.bbox.left - x, line.bbox.top - y)
          const target = matches.reduce((best, line) => !best || distance(line) < distance(best) ? line : best, undefined)
          if (target) { ordered.push(target); remaining.delete(target) }
        }
      }
    }
    visit(JSON.parse(segmented.asJSON()).blocks)
    page.lines = [...ordered, ...remaining]
    for (const line of page.lines) delete line.sourceText
    return page
  } finally { text?.destroy(); segmented?.destroy(); native.destroy() }
}

export function readSiyuanOcrPage(index: number, result: any, size: { width: number; height: number }, image: { width: number; height: number }): any {
  const page: any = new OcrPage(index, size)
  const lines = new Map<string, any>()
  for (const [i, row] of (Array.isArray(result?.ocrJSON) ? result.ocrJSON : []).entries()) {
    if (!String(row.text || '').trim() || (row.level != null && Number(row.level) !== 5)) continue
    const left = Number(row.left) * size.width / image.width, top = Number(row.top) * size.height / image.height
    const box = { left, top, right: left + Number(row.width) * size.width / image.width, bottom: top + Number(row.height) * size.height / image.height }
    if (![box.left, box.top, box.right, box.bottom].every(Number.isFinite) || (box.right <= box.left || box.bottom <= box.top)) continue
    const key = row.line_num != null ? `${row.block_num}/${row.par_num}/${row.line_num}` : String(i)
    let line = lines.get(key)
    if (!line) { line = new OcrLine(page, box, [0, 0]); lines.set(key, line); page.lines.push(line) }
    const word: any = new OcrWord(line, `${index}-ocr-${i}`, String(row.text), box)
    // TSV has no font metrics; supply its measured text height in PDF units.
    word.style.size = box.bottom - box.top
    word.conf = Number(row.conf) || 0
    line.words.push(word)
    line.bbox = calcBboxUnion(line.words.map((w: any) => w.bbox))
  }
  return page
}

export function plainOcrBlocks(text: string): ReflowBlock[] {
  return text.trim().split(/\r?\n\s*\r?\n/).filter(Boolean).map(text => ({
    text: text.replace(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\r?\n|\r?\n(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, '').replace(/\r?\n/g, ' '),
    role: 'body',
  }))
}

export function analyzeScribePages(pages: any[], index: number, ocr = false): ReflowPage {
  // Upstream mutates its model; keep raw extraction data intact for later windows.
  const models = structuredClone(pages)
  analyzeLayout(models, { pdfType: ocr || models.find((p: any) => p.n === index)?.scan ? 'ocr' : 'text', fullPageImagePages: models.map((p: any) => !!p.scan) })
  const page = models.find((p: any) => p.n === index)
  const blocks: ReflowBlock[] = []
  for (const par of page?.pars || []) {
    const block: ReflowBlock = { text: '', role: par.type, spans: [] }
    for (const line of par.lines) for (const word of line.words) {
      if (block.text && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(block.text) && !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word.text)) block.text += ' '
      // Serialize the upstream paragraph; MuPDF handles output wrapping and pagination.
      const start = block.text.length
      block.text += word.text
      const parts = word.chars?.map((c: any) => c.text).join('') === word.text ? word.chars : [{ text: word.text, bbox: word.bbox }]
      let offset = start
      for (const part of parts) {
        const b = part.bbox, end = offset + part.text.length
        if (b && b.right > b.left && b.bottom > b.top) block.spans!.push({ start: offset, end, rect: { origin: { x: b.left, y: b.top }, size: { width: b.right - b.left, height: b.bottom - b.top } } })
        offset = end
      }
    }
    if (block.text.trim()) blocks.push(block)
  }
  return { pageIndex: index, blocks, ocr }
}
