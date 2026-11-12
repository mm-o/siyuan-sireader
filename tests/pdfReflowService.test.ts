import { expect, test, vi, beforeEach, afterEach } from 'vitest'
const files = vi.hoisted(() => ({ putFile: vi.fn(async () => {}), removeFile: vi.fn(async () => {}) }))
vi.mock('@/api', () => files)
const storage = vi.hoisted(() => ({ upsertEmbedPdfAnnotation: vi.fn(async () => {}), deleteEmbedPdfAnnotation: vi.fn(async () => {}) }))
vi.mock('@/core/storage', () => storage)
const bridge = vi.hoisted(() => ({ open: vi.fn(async () => {}), page: vi.fn(async () => ({ pageIndex: 0, ocr: false, blocks: [{ text: '正文', spans: [] }] })), ocr: vi.fn(async () => ({ pageIndex: 0, ocr: true, blocks: [{ text: '重新识别' }] })), begin: vi.fn(async () => {}), append: vi.fn(async () => {}), finish: vi.fn(async () => ({ buffer: new ArrayBuffer(4), pageMap: [0], annotationMap: [] })), dispose: vi.fn() }))
vi.mock('@/core/diagnostics', () => ({ diagnosticLog: vi.fn() }))
import { recognizePdfPage, createPdfReflowSession, synchronizeReflowAnnotation } from '../src/services/pdfReflow'
import { projectReflowAnnotation } from '../src/core/pdfReflow'
// Exercise RPC and generation together; only the browser transport is substituted.
let transport: any
beforeEach(() => {
  vi.stubGlobal('location', { origin: 'http://localhost:6806' })
  vi.stubGlobal('Worker', class {
    onmessage: any
    onerror: any
    terminated = false
    constructor() { transport = this }
    postMessage(message: any, transfer: Transferable[]) {
      const { id, command, payload } = structuredClone(message, { transfer })
      const method = { open: 'open', page: 'page', ocr: 'ocr', 'layout-begin': 'begin', 'layout-page': 'append', 'layout-finish': 'finish' }[command]
      const args = command === 'open' ? [payload.buffer, payload.sizes] : command === 'page' ? [payload.index] : command === 'ocr' ? [payload.index, payload] : command === 'layout-finish' ? [] : [payload]
      Promise.resolve().then(() => bridge[method](...args)).then(
        result => { if (!this.terminated) this.onmessage({ data: { id, result } }) },
        error => { if (!this.terminated) this.onmessage({ data: { id, error: error.message } }) },
      )
    }
    terminate() { this.terminated = true; bridge.dispose() }
  })
})

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

const png = () => {
  const bytes = new Uint8Array(24), view = new DataView(bytes.buffer)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); view.setUint32(16, 400); view.setUint32(20, 600)
  return new Blob([bytes], { type: 'image/png' })
}

test('OCR uses the asset API and removes only its own temporary image', async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ code: 0, data: { text: '文字', ocrJSON: [{ text: '文字', level: '5', left: '20', top: '40', width: '80', height: '20' }] } }) }))
  vi.stubGlobal('fetch', fetch)
  const result = await recognizePdfPage(png(), new AbortController().signal)
  expect(fetch.mock.calls[0][0]).toBe('/api/asset/ocr')
  const body = JSON.parse((fetch.mock.calls[0] as any)[1].body)
  expect(body.path).toMatch(/^assets\/sireader-ocr-[\w-]+\.png$/)
  expect(files.removeFile).toHaveBeenCalledWith('/data/' + body.path)
  expect(result.image).toEqual({ width: 400, height: 600 })
  expect(result.result.ocrJSON[0].left).toBe('20')
})

test('failed and aborted OCR requests clean up their image and propagate errors', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ code: -1, msg: 'OCR 未启用' }) })))
  await expect(recognizePdfPage(png(), new AbortController().signal)).rejects.toThrow('OCR 未启用')
  expect(files.removeFile).toHaveBeenCalledTimes(1)
  const controller = new AbortController()
  files.putFile.mockImplementationOnce(async () => { controller.abort() })
  await expect(recognizePdfPage(png(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(files.removeFile).toHaveBeenCalledTimes(2)
})

test('PDF extraction restrictions cannot be bypassed through OCR', () => {
  const document = { page: vi.fn() }
  expect(() => createPdfReflowSession(document, [], false)).toThrow('does not allow text extraction')
  expect(document.page).not.toHaveBeenCalled()
})

const layout = { width: 300, height: 400, fontSize: 18 }
const setupSession = () => {
  const page = { ref: { kind: 'baseIndex', index: 0 }, size: { width: 200, height: 300 } }
  const renderPage = vi.fn(async () => ({ blob: async () => png() }))
  const document = { page: () => ({ render: { image: renderPage } }) }
  const session = createPdfReflowSession(document, [page], true)
  return { session, renderPage }
}

test('generation reuses the committed snapshot and streams native pages without OCR', async () => {
  const { session, renderPage } = setupSession(), progress = vi.fn()
  const buffer = new Uint8Array([1, 2, 3, 4]).buffer
  const output = await session.generate(buffer, layout, new AbortController().signal, progress)
  expect(output.pageMap).toEqual([0])
  // The caller retains its rollback snapshot even when worker.postMessage transfers its copy.
  expect(bridge.open.mock.calls[0][0]).not.toBe(buffer)
  expect(bridge.open.mock.calls[0][0]).toEqual(buffer)
  expect(bridge.page).toHaveBeenCalledTimes(1)
  expect(bridge.append).toHaveBeenCalledWith(expect.objectContaining({ blocks: [{ text: '正文', spans: [] }] }))
  expect(progress).toHaveBeenCalledWith(1, 1)
  expect(renderPage).not.toHaveBeenCalled()
  session.dispose()
})

test('scans and empty pages use fresh SiYuan OCR before being appended', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ code: 0, data: { text: '重新识别' } }) })))
  for (const page of [{ blocks: [{ text: '坏的旧文字层' }], needsOCR: true }, { blocks: [] }]) {
    bridge.page.mockResolvedValueOnce({ pageIndex: 0, ocr: false, ...page } as any)
    const { session, renderPage } = setupSession()
    await session.generate(new ArrayBuffer(4), layout, new AbortController().signal, vi.fn())
    expect(renderPage).toHaveBeenCalledWith(expect.objectContaining({ includeAnnotations: false }))
    expect(bridge.append).toHaveBeenLastCalledWith(expect.objectContaining({ blocks: [{ text: '重新识别' }], ocr: true }))
    session.dispose()
  }
  expect(files.removeFile).toHaveBeenCalledTimes(2)
})

test('cancelling generation stops before appending a stale page', async () => {
  const { session } = setupSession(), controller = new AbortController()
  bridge.page.mockImplementationOnce(async () => { controller.abort(); return { pageIndex: 0, ocr: false, blocks: [{ text: '旧页' }] } })
  await expect(session.generate(new ArrayBuffer(4), layout, controller.signal, vi.fn())).rejects.toMatchObject({ name: 'AbortError' })
  expect(bridge.append).not.toHaveBeenCalled()
  expect(bridge.finish).not.toHaveBeenCalled()
  session.dispose()
})

test('disposing the session aborts in-flight OCR and still removes its temporary PNG', async () => {
  const { session } = setupSession()
  bridge.page.mockResolvedValueOnce({ pageIndex: 0, ocr: false, blocks: [] })
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => { session.dispose(); options.signal.throwIfAborted() }))
  await expect(session.generate(new ArrayBuffer(4), layout, new AbortController().signal, vi.fn())).rejects.toMatchObject({ name: 'AbortError' })
  expect(files.removeFile).toHaveBeenCalledTimes(1)
  expect(bridge.append).not.toHaveBeenCalled()
})

test('a worker failure rejects generation and terminates its transport', async () => {
  const { session } = setupSession()
  bridge.page.mockImplementationOnce(() => new Promise(() => {}))
  const output = session.generate(new ArrayBuffer(4), layout, new AbortController().signal, vi.fn())
  const failure = expect(output).rejects.toThrow('worker crashed')
  await vi.waitFor(() => expect(bridge.page).toHaveBeenCalled())
  transport.onerror({ message: 'worker crashed' })
  await failure
  expect(transport.terminated).toBe(true)
  expect(bridge.append).not.toHaveBeenCalled()
  session.dispose()
})


const rect = (x: number, y: number, width = 10, height = 12) => ({ origin: { x, y }, size: { width, height } })
const map = { glyphs: [['甲', 24, 50, 10, 12, 80, 200, 10, 12], ['乙', 34, 50, 10, 12, 90, 200, 10, 12]] as any }
test('a native reflow highlighter maps to source text coordinates and preserves its note and color', () => {
  const projected = projectReflowAnnotation({ id: 'mark', type: 9, pageIndex: 0, rect: rect(24, 50, 20), segmentRects: [rect(24, 50, 20)], contents: '笔记', strokeColor: '#123456' }, '/reflow.pdf', map, 3)
  expect(projected).toMatchObject({ pageIndex: 3, type: 9, rect: rect(80, 200, 20), segmentRects: [rect(80, 200), rect(90, 200)], contents: '笔记', strokeColor: '#123456', custom: { text: '甲乙' } })
})
test('missing source geometry and non-text drawings remain visible as source page notes', () => {
  for (const type of [9, 15]) {
    const note = projectReflowAnnotation({ id: 'plain', type, pageIndex: 0, contents: '批注', custom: { text: '识别文字' } }, '/reflow.pdf', undefined, 5)
    expect(note).toMatchObject({ pageIndex: 5, type: 0, contents: '识别文字\n\n批注' })
    expect(note.segmentRects).toBeUndefined()
  }
})
test('create/update/delete share a stable source id without copying appearance contexts across PDFs', async () => {
  const generated = { url: '/reflow.pdf', pageMap: [3], annotationMap: [map] }, annotation = { id: 'mark', pageIndex: 0, type: 9, segmentRects: [rect(24, 50)] }
  const first = await synchronizeReflowAnnotation('source-key', generated, { type: 'create', annotation })
  const updated = await synchronizeReflowAnnotation('source-key', generated, { type: 'update', annotation: { ...annotation, contents: 'edited' } })
  const deleted = await synchronizeReflowAnnotation('source-key', generated, { type: 'delete', annotation })
  expect(first).toBe(updated); expect(first).toBe(deleted)
  expect(storage.upsertEmbedPdfAnnotation).toHaveBeenLastCalledWith('source-key', expect.objectContaining({ annotation: expect.objectContaining({ id: first, contents: 'edited' }) }))
  expect(storage.upsertEmbedPdfAnnotation.mock.calls[0][1]).not.toHaveProperty('ctx')
  expect(storage.deleteEmbedPdfAnnotation).toHaveBeenCalledWith('source-key', first)
})
