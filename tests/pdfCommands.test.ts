import { expect, test, vi } from 'vitest'
import { PDF_SHORTCUT_COMMANDS, pdfViewerCommand } from '../src/utils/keyboard'
import { legacyPdfDraft, pdfAnnotationRecord } from '../src/utils/embedPdfActions'

vi.mock('@/core/license', () => ({ LicenseManager: {} }))
vi.mock('@/utils/copy', () => ({ inlineLinkText: (text: string) => text, sendMarkToDoc: vi.fn() }))

test('preserves configured SiYuan shortcut IDs while dispatching native EmbedPDF commands', () => {
  expect(PDF_SHORTCUT_COMMANDS.map(([id]) => id)).toContain('scroll:next-page')
  expect(pdfViewerCommand('scroll:next-page')).toBe('page:next')
  expect(pdfViewerCommand('annotation:add-highlight')).toBe('tool:highlight')
  expect(pdfViewerCommand('annotation:add-rectangle')).toBe('tool:square')
  expect(pdfViewerCommand('redaction:delete-selected')).toBe('sireader:delete-redactions')
  expect(pdfViewerCommand('sireader:capture-copy')).toBe('sireader:capture-copy')
  expect(pdfViewerCommand('zoom:in')).toBe('zoom:in')
  expect(pdfViewerCommand('zoom:out')).toBe('zoom:out')
  expect(pdfViewerCommand('sireader:dict-selection')).toBe('sireader:dict-selection')
})

test('legacy highlights retain the annotation ID, geometry and SiReader metadata', () => {
  const rect = { origin: { x: 2, y: 3 }, size: { width: 10, height: 12 } }
  const legacy = { id: 'old-id', type: 9, rect, segmentRects: [rect], custom: { blockId: 'backlink' } }
  const draft = legacyPdfDraft(legacy)
  expect(draft).toMatchObject({ subtype: 'highlight', nm: 'old-id' })
  expect(draft?.quadPoints).toHaveLength(1)
  expect(pdfAnnotationRecord({ ...draft, rect: { x: 2, y: 3, width: 10, height: 12 } }, 0, legacy.custom))
    .toMatchObject({ id: 'old-id', type: 9, pageIndex: 0, rect, custom: legacy.custom })
})

test('legacy arrows translate PDFium line-ending enums to native EmbedPDF values', () => {
  const draft = legacyPdfDraft({
    id: 'arrow', type: 4, rect: { origin: { x: 2, y: 3 }, size: { width: 10, height: 12 } },
    linePoints: { start: { x: 2, y: 3 }, end: { x: 12, y: 15 } },
    lineEndings: { start: 0, end: 5 },
  })
  expect(draft).toMatchObject({ subtype: 'line', lineEndings: { start: 'none', end: 'closed-arrow' } })
})
