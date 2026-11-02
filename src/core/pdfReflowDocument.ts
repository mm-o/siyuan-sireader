import { reflowCharacters, type ReflowPage, type ReflowRect, type ReflowLayout, type ReflowAnnotationPage, type ReflowDocument } from './pdfReflow'

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** MuPDF owns wrapping, pagination, font embedding and the selectable PDF text layer. */
export function createReflowDocument(engine: any, layout: ReflowLayout) {
  if (![layout.width, layout.height, layout.fontSize].every(Number.isFinite) || layout.width < 160 || layout.height < 240 || layout.fontSize < 8) throw new Error('Invalid reflow layout')
  const buffer = new engine.Buffer(), writer = new engine.DocumentWriter(buffer, 'pdf', 'compress')
  const pageMap: number[] = []
  const annotationMap: ReflowAnnotationPage[] = []
  let closed = false
  return {
    append(source: ReflowPage) {
      const blocks = source.blocks.filter(b => !['header', 'footer', 'pagenum', 'linenum'].includes(b.role || ''))
      const characters: { text: string; prefix: string; rect?: ReflowRect }[] = []
      let prefix = ''
      for (const block of blocks) {
        if (characters.length) prefix += '\n\n'
        let offset = 0, spanIndex = 0
        for (const char of block.text) {
          while (spanIndex < (block.spans?.length || 0) && block.spans![spanIndex].end <= offset) spanIndex++
          const span = block.spans?.[spanIndex], rect = span && span.start <= offset && span.end > offset ? span.rect : undefined
          const normalized = reflowCharacters(char)
          if (!normalized.length) prefix += char
          for (const text of normalized) { characters.push({ text, prefix, rect }); prefix = '' }
          offset += char.length
        }
      }
      const body = blocks.map(b => `<${b.role === 'title' ? 'h2' : 'p'}>${escape(b.text)}</${b.role === 'title' ? 'h2' : 'p'}>`).join('')
      const html = engine.Document.openDocument(new TextEncoder().encode(`<html><head><meta charset="utf-8"/><style>@page{margin:24px}body{font-family:serif;line-height:1.6}p{margin:0 0 .8em}h2{font-size:1.2em}</style></head><body>${body || '<p>&#160;</p>'}</body></html>`), 'text/html')
      try {
        html.layout(layout.width, layout.height, layout.fontSize)
        const maps: ReflowAnnotationPage[] = [], extracted: string[] = []
        let cursor = 0
        for (let n = 0; n < html.countPages(); n++) {
          const page = html.loadPage(n)
          try {
            const mapping: ReflowAnnotationPage = { glyphs: [] }, text = page.toStructuredText()
            try {
              text.walk({ onChar(char: string, _origin: any, _font: any, _size: number, quad: number[]) {
                const x = Math.min(quad[0], quad[2], quad[4], quad[6]), y = Math.min(quad[1], quad[3], quad[5], quad[7])
                const w = Math.max(quad[0], quad[2], quad[4], quad[6]) - x, h = Math.max(quad[1], quad[3], quad[5], quad[7]) - y
                for (const c of reflowCharacters(char)) {
                  extracted.push(c)
                  const original = characters[cursor++], r = original?.rect
                  if (r && w > 0 && h > 0) mapping.glyphs.push([original.prefix + c, x, y, w, h, r.origin.x, r.origin.y, r.size.width, r.size.height])
                }
              } })
            } finally { text.destroy() }
            maps.push(mapping)
            const device = writer.beginPage(page.getBounds())
            try { page.run(device, engine.Matrix.identity); device.close() }
            finally { device.destroy() }
            writer.endPage()
            pageMap.push(source.pageIndex)
          } finally { page.destroy() }
        }
        // A changed/unrepresentable text stream cannot safely locate source highlights.
        // Keep its source page, but fall back to a page note instead of guessing positions.
        if (extracted.join('') !== characters.map(c => c.text).join('')) for (const map of maps) map.glyphs = []
        annotationMap.push(...maps)
      } finally { html.destroy() }
    },
    finish(): ReflowDocument {
      if (closed) throw new Error('Reflow document is closed')
      closed = true
      try { writer.close(); return { buffer: buffer.asUint8Array().slice().buffer, pageMap, annotationMap } }
      finally { writer.destroy(); buffer.destroy() }
    },
    dispose() { if (!closed) { closed = true; writer.destroy(); buffer.destroy() } },
  }
}
