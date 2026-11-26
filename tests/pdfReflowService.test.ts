import { expect, test, vi, beforeEach, afterEach } from 'vitest'
const files = vi.hoisted(() => ({ putFile: vi.fn(async () => {}), removeFile: vi.fn(async () => {}) }))
vi.mock('@/api', () => files)
const storage = vi.hoisted(() => ({ upsertEmbedPdfAnnotation: vi.fn(async () => {}), deleteEmbedPdfAnnotation: vi.fn(async () => {}) }))
vi.mock('@/core/storage', () => storage)
const bridge = vi.hoisted(() => ({ open: vi.fn(async () => {}), page: vi.fn(async () => ({ pageIndex: 0, ocr: false, blocks: [{ text: '正文', spans: [] }] })), ocr: vi.fn(async () => ({ pageIndex: 0, ocr: true, blocks: [{ text: '重新识别' }] })), begin: vi.fn(async () => {}), append: vi.fn(async () => {}), finish: vi.fn(async () => ({ buffer: new ArrayBuffer(4), pageMap: [0], annotationMap: [] })), merge: vi.fn(async () => ({ buffer: new ArrayBuffer(8) })), dispose: vi.fn() }))
vi.mock('@/core/diagnostics', () => ({ diagnosticLog: vi.fn() }))
import { recognizePdfPage, createPdfReflowSession, createReflowController, reflowLayoutFor, reflowWindowRange, reflowExtendRange, REFLOW_WINDOW, synchronizeReflowAnnotation } from '../src/services/pdfReflow'
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
      const method = { open: 'open', page: 'page', ocr: 'ocr', merge: 'merge', 'layout-begin': 'begin', 'layout-page': 'append', 'layout-finish': 'finish' }[command]
      const args = command === 'open' ? [payload.buffer, payload.sizes]
        : command === 'page' ? [payload.index]
          : command === 'ocr' ? [payload.index, payload]
            : command === 'merge' ? [payload.base, payload.addition, payload.at, payload.expect]
              : command === 'layout-finish' ? [] : [payload]
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

test('按需重排窗口按给定页数取相邻页并夹在首尾之内', () => {
  expect(reflowWindowRange(0, 10, 3)).toEqual({ from: 0, to: 2 })
  expect(reflowWindowRange(5, 10, 3)).toEqual({ from: 4, to: 6 })
  expect(reflowWindowRange(9, 10, 3)).toEqual({ from: 7, to: 9 })
  expect(reflowWindowRange(3, 2, 3)).toEqual({ from: 0, to: 1 })
  expect(reflowWindowRange(0, 1, 3)).toEqual({ from: 0, to: 0 })
  // 默认 6 页窗口以当前页为中心（窗口越小首屏越快）
  expect(reflowWindowRange(20, 100)).toEqual({ from: 17, to: 22 })
  expect(REFLOW_WINDOW).toBe(6)
  expect(reflowWindowRange(20, 100, 12)).toEqual({ from: 14, to: 25 })
})

test('续排窗口接在已有区间外面：不重叠、不越界、到边就是空区间', () => {
  expect(reflowExtendRange(0, 5, 40, 'end')).toEqual({ from: 6, to: 11 })
  expect(reflowExtendRange(30, 35, 40, 'end')).toEqual({ from: 36, to: 39 })
  expect(reflowExtendRange(34, 39, 40, 'end')).toEqual({ from: 40, to: 39 })
  expect(reflowExtendRange(6, 11, 40, 'start')).toEqual({ from: 0, to: 5 })
  expect(reflowExtendRange(30, 41, 40, 'start')).toEqual({ from: 24, to: 29 })
  expect(reflowExtendRange(0, 5, 40, 'start')).toEqual({ from: 0, to: -1 })
  // 窗口大小可覆盖：12 页窗口时一次接满 12 页
  expect(reflowExtendRange(0, 11, 40, 'end', 12)).toEqual({ from: 12, to: 23 })
})

test('重排版式夹在安全区间内', () => {
  // 0/未测量时回落默认值，过小的有效值才夹到下限
  expect(reflowLayoutFor(0, 0, 0)).toEqual({ width: 480, height: 720, fontSize: 18 })
  expect(reflowLayoutFor(100, 100, 5)).toEqual({ width: 240, height: 400, fontSize: 12 })
  expect(reflowLayoutFor(9999, 9999, 99)).toEqual({ width: 720, height: 960, fontSize: 32 })
  expect(reflowLayoutFor(480, 720, 18)).toEqual({ width: 480, height: 720, fontSize: 18 })
})


const makeController = (overrides: Record<string, any> = {}) => {
  const calls: string[] = []
  const opened: { id: string; bytes: any }[] = []
  const controller = createReflowController({
    scoped: (name: string) => name === 'stage' ? { getCurrentPageIndex: () => 0, getZoomMode: () => 'fit-width', getZoomLevel: () => 1 } : { canCopy: () => true },
    documentId: () => 'doc-1',
    signal: () => new AbortController().signal,
    setStatus: () => {},
    label: (_key: string, fallback: string) => fallback,
    layout: () => ({ width: 480, height: 720, fontSize: 18 }),
    canCopy: () => true,
    openPdf: async () => ({ pages: { list: async () => ({ pages: Array.from({ length: 10 }, () => ({ ref: {}, size: { width: 200, height: 300 } })) }) }, close: async () => {} }),
    attach: async (_id: string, _signal: AbortSignal, target: number) => { calls.push('attach:' + target) },
    ensureEngine: async () => { calls.push('engine') },
    onFailure: (error: any) => { calls.push('failure:' + (error?.message || error)) },
    documents: () => ({
      download: async () => new Uint8Array([1, 2, 3]).buffer,
      open: async (input: any) => { opened.push({ id: input.id, bytes: input.bytes }); return { document: { status: 'ready' } } },
      setActive: () => {}, close: async () => {}, forDocument: () => ({ get: () => ({ zoomTo: () => {} }) }),
    }),
    flush: async () => {},
    ...overrides,
  })
  return { controller, calls, opened }
}

test('按需重排控制器：失败只上报不抛出，状态保持可用', async () => {
  // node 环境没有 Worker，真实会话会失败——正好覆盖错误冒泡与状态复位
  const { controller, calls } = makeController()
  await controller.toggle()
  expect(calls.some(call => call.startsWith('failure:'))).toBe(true)
  expect(controller.isActive()).toBe(false)
  controller.reset()
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

test('同一会话的后续窗口不再重搬源 PDF（复用 worker 里已打开的文档）', async () => {
  const { session } = setupSession(), buffer = new Uint8Array([1, 2, 3, 4]).buffer, signal = new AbortController().signal
  await session.generate(buffer, layout, signal, vi.fn(), undefined, undefined, 'session-key')
  expect(bridge.open).toHaveBeenCalledTimes(1)
  expect(bridge.open.mock.calls[0][0]).toEqual(buffer)
  // 同一个 key：不搬字节，也不解一次
  await session.generate(buffer, layout, signal, vi.fn(), undefined, undefined, 'session-key')
  expect(bridge.open).toHaveBeenCalledTimes(2)
  expect(bridge.open.mock.calls[1][0]).toBeUndefined()
  // 换了源文档就必须重新搬
  await session.generate(buffer, layout, signal, vi.fn(), undefined, undefined, 'other-key')
  expect(bridge.open.mock.calls[2][0]).toEqual(buffer)
  session.dispose()
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

// 续排的回归测试：引擎 open() 会 transfer 掉传进去的 bytes，之前重排把自己的累积结果
// 直接交了出去，翻到第 12 页续排时报 "merge: ... ArrayBuffer is detached"。
// 放在文件末尾：它改写了 bridge 的实现，不影响前面的用例。
test('续排连续两窗：引擎 detach 已显示的 PDF 后仍能合并并保持阅读位置', async () => {
  let output = 0
  const seen: number[] = []
  const bases: number[] = []
  const positions: string[] = []
  const expects: number[] = []
  bridge.begin.mockImplementation(async () => { seen.length = 0 })
  bridge.page.mockImplementation(async (index: number) => {
    seen.push(index)
    return { pageIndex: index, ocr: false, blocks: [{ text: `正文${index}`, spans: [] }] }
  })
  bridge.finish.mockImplementation(async () => {
    const pageMap = seen.slice()
    return { buffer: new ArrayBuffer(8), pageMap, annotationMap: pageMap.map(() => ({ glyphs: [] })) }
  })
  bridge.merge.mockImplementation(async (base: ArrayBuffer, _addition: ArrayBuffer, at: string, expect: number) => {
    bases.push(base?.byteLength ?? -1)
    positions.push(at)
    expects.push(expect)
    return { buffer: new ArrayBuffer(8) }
  })
  const { controller, calls } = makeController({
    scoped: (name: string) => name === 'stage'
      ? { getCurrentPageIndex: () => output, getZoomMode: () => 'fit-width', getZoomLevel: () => 1 }
      : { canCopy: () => true },
    scope: () => ({ get: () => ({ zoomTo: () => {} }) }),
    openPdf: async () => ({ pages: { list: async () => ({ pages: Array.from({ length: 40 }, (_value, index) => ({ ref: { index }, size: { width: 200, height: 300 } })) }) }, close: async () => {} }),
    documents: () => ({
      download: async () => new Uint8Array([1, 2, 3]).buffer,
      // 引擎的真实行为：open() 把 bytes transfer 给 pdfium worker，调用方的 ArrayBuffer 立刻 detached
      open: async (input: any) => { structuredClone(input.bytes, { transfer: [input.bytes] }); return { document: { status: 'ready' } } },
      setActive: () => {}, close: async () => {}, forDocument: () => ({ get: () => ({ zoomTo: () => {} }) }),
    }),
  })
  const failures = () => calls.filter(call => call.startsWith('failure:'))
  await controller.toggle()
  expect(failures()).toEqual([])
  expect(controller.current()?.pageMap).toEqual(Array.from({ length: 6 }, (_value, index) => index))
  output = 5 // 距边界还有 2 页就该续排
  await controller.extend()
  expect(failures()).toEqual([])
  expect(controller.current()?.pageMap).toEqual(Array.from({ length: 12 }, (_value, index) => index))
  output = 11
  await controller.extend()
  expect(failures()).toEqual([])
  expect(controller.current()?.pageMap).toEqual(Array.from({ length: 18 }, (_value, index) => index))
  // 重排 PDF 是临时产物：一窗、两窗、三窗都不许落盘（以前每续一窗就多写一份，越滚越大）
  expect(files.putFile).not.toHaveBeenCalled()
  expect(files.removeFile).not.toHaveBeenCalled()
  expect(controller.current()?.url).toMatch(/^reflow:[0-9a-f]{64}$/)
  expect(controller.current()?.name).toMatch(/^reflow-[0-9a-f]{64}\.pdf$/)
  // 第一次合并要把 base 交给 worker（活的 buffer），之后 worker 留着累积文档，只送新窗口
  expect(bases).toEqual([8, -1])
  // 合并前应有多少页，用来校验 worker 留着的累积文档没跑偏
  expect(expects).toEqual([6, 12])
  expect(positions).toEqual(['end', 'end'])
  // 续排后停在原来那一页，不跳到新窗口开头
  expect(calls.filter(call => call.startsWith('attach:'))).toEqual(['attach:0', 'attach:5', 'attach:11'])
  controller.reset()
})
