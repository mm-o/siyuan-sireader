import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { reactive } from 'vue'

vi.mock('@/api', () => ({ readDir: vi.fn(), putFile: vi.fn(), removeFile: vi.fn() }))
vi.mock('@/main', () => ({ usePlugin: vi.fn() }))
vi.mock('@/core/diagnostics', () => ({ diagnosticLog: vi.fn() }))
vi.mock('@/core/license', () => ({ LicenseManager: {} }))
vi.mock('@/utils/copy', () => ({ inlineLinkText: vi.fn(), sendMarkToDoc: vi.fn() }))

import { usePlugin } from '@/main'
import { putFile, removeFile, readDir } from '@/api'
import { bookRecordKey, createStorageEngine, pluginStorageAdapter, readEmbedPdfAnnotations, readEmbedPdfProgress, deleteEmbedPdfAnnotation, recoverBackupRecords, storageEngine, cloneStorageValue, writeEmbedPdfProgress, createLatestSaver, normalizeBookTitle, readFileBlob, normalizeSiyuanCloudUrl, writeManagedFiles } from '@/core/storage'

test('normalizes Siyuan Cloud protocol and temporary-origin URLs to a readable stable path', () => {
  const path = '/plugin/private/siyuan-cloud/p/WPS 云文档/检查记录/奥本海默 (OCR).pdf'
  expect(normalizeSiyuanCloudUrl(`https://127.0.0.1:64819${path}`)).toBe(path)
  expect(normalizeSiyuanCloudUrl(`https://127.0.0.1:64819${encodeURI(path)}`)).toBe(path)
  expect(normalizeSiyuanCloudUrl(`siyuan-cloud:///WPS 云文档/检查记录/奥本海默 (OCR).pdf`)).toBe(`${path}`)
})
import { ensurePdfRecordMigrated } from '@/core/dataMigration'
import { ReaderDatabase } from '@/core/database'
import { diagnosticLog } from '@/core/diagnostics'
import { BookshelfManager, mergeBookCompletion, compareBookshelfValues, listCloudDownloadFolders, uploadCloudBook } from '@/core/bookshelf'

test('cloud download can browse mount names without provider metadata and rejects read-only folders', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { provider: 'siyuan-storage', content: [
      { name: 'My drive', is_dir: true },
      { name: 'Book.pdf', is_dir: false },
    ] } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { provider: 'webdav', write: false } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { provider: 'webdav', write: true } })))
  vi.stubGlobal('fetch', fetchMock)
  try {
    await expect(listCloudDownloadFolders('/', 'test-token')).resolves.toMatchObject({
      folders: [{ name: 'My drive', path: '/My drive' }],
      writable: false,
    })
    await expect(listCloudDownloadFolders('/My drive', 'test-token')).resolves.toMatchObject({ writable: false })
    await expect(listCloudDownloadFolders('/My drive/books', 'test-token')).resolves.toMatchObject({ writable: true })
  } finally {
    vi.unstubAllGlobals()
  }
})

test('cloud upload sends the book bytes with an encoded path and refuses to overwrite', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200 })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 403, message: 'file exists' })))
  const file = new File(['book bytes'], 'Book #1.epub', { type: 'application/epub+zip' })
  vi.stubGlobal('fetch', fetchMock)
  try {
    await expect(uploadCloudBook('/My drive', file, 'test-token'))
      .resolves.toBe('/plugin/private/siyuan-cloud/p/My drive/Book %231.epub')
    expect(fetchMock).toHaveBeenCalledWith('/plugin/private/siyuan-cloud/api/fs/put', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/epub+zip',
        'File-Path': '%2FMy%20drive%2FBook%20%231.epub',
        Overwrite: 'false',
        'X-Siyuan-Cloud-Authorization': 'test-token',
      },
      body: file,
    })
    await expect(uploadCloudBook('/My drive', file, 'test-token')).rejects.toThrow('file exists')
  } finally {
    vi.unstubAllGlobals()
  }
})

test('bookshelf sorting defaults to newest-first for numeric fields', () => {
  expect(compareBookshelfValues(10, 5, 'time')).toBe(-1)
  expect(compareBookshelfValues(10, 5, 'time', true)).toBe(1)
  expect(compareBookshelfValues('Alpha', 'beta', 'name')).toBe(-1)
  expect(compareBookshelfValues('Alpha', 'beta', 'name', true)).toBe(1)
})

test('book and group covers share the canonical SiYuan public URL', () => {
  const manager = new BookshelfManager()
  expect(manager.getCoverUrl('data/public/siyuan-sireader/covers/group.jpg')).toMatch(/^\/public\/siyuan-sireader\/covers\/group\.jpg\?v=/)
  expect(manager.getCoverUrl({ cover: '/data/public/siyuan-sireader/covers/book.jpg' })).toMatch(/^\/public\/siyuan-sireader\/covers\/book\.jpg\?v=/)
  expect(manager.getCoverUrl('public/siyuan-sireader/covers/group.jpg?size=small')).toMatch(/^\/public\/siyuan-sireader\/covers\/group\.jpg\?size=small&v=/)
})

test('managed model files reuse directories and upload with bounded concurrency', async () => {
  let active = 0, maxActive = 0
  vi.mocked(putFile).mockImplementation(async (_path, isDir) => {
    if (!isDir) {
      active++; maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 10))
      active--
    }
    return null
  })
  const progress: number[] = []

  await writeManagedFiles(Array.from({ length: 5 }, (_, i) => ({
    destination: `/public/siyuan-sireader/tts/model/espeak-ng-data/file-${i}`,
    blob: new Blob([String(i)]),
    name: `file-${i}`,
  })), value => progress.push(value), 2)

  expect(maxActive).toBe(2)
  expect(vi.mocked(putFile).mock.calls.filter(([, isDir]) => isDir)).toHaveLength(1)
  expect(progress).toEqual([20, 40, 60, 80, 100])
})

test('completion fills only missing fields and preserves user values', () => {
  const current = { title: '用户标题', author: '用户作者', cover: '/public/custom.jpg', meta: { isbn: 'old-isbn', description: '' }, tags: ['用户标签'], groups: ['g'], rating: 4, status: 'reading', progress: 42 }
  const candidate = { title: '解析标题', author: '解析作者', cover: '/public/extracted.jpg', meta: { isbn: 'new-isbn', publisher: '出版社', description: '简介' }, tags: ['解析标签'] }
  expect(mergeBookCompletion(current, candidate)).toEqual({ meta: { isbn: 'old-isbn', description: '简介', publisher: '出版社' } })
  expect(mergeBookCompletion({ title: '', author: '', cover: '', meta: {} }, { title: '标题', author: '作者', cover: '/public/cover.jpg', meta: { isbn: 'isbn' } })).toEqual({ title: '标题', author: '作者', cover: '/public/cover.jpg', meta: { isbn: 'isbn' } })
  expect(mergeBookCompletion({ author: '未知作者', meta: {} }, { author: '真实作者', meta: {} })).toEqual({ author: '真实作者' })
  expect(mergeBookCompletion({ title: '用户标题', cover: '/public/siyuan-sireader/covers/deleted.jpg', meta: {} }, { title: '解析标题', cover: '/public/new.jpg', meta: {} }, { coverMissing: true })).toEqual({ cover: '/public/new.jpg' })
})

test('PDF progress writes its record once and preserves annotations and finished status', async () => {
  const key = bookRecordKey('data-id').name
  files.set('bookshelf.json', JSON.stringify({ book: { url: 'book', dataId: 'data-id', status: 'finished', format: 'pdf' } }))
  files.set(key, JSON.stringify(record(['note'])))
  const db = new ReaderDatabase()
  await db.updateProgress('book', 20, 2, '#page-2', { key: 'data-id', totalPages: 10 })
  const saved = JSON.parse(files.get(key)!)
  expect(saved).toMatchObject({ progress: { pageNumber: 2, totalPages: 10 }, book: { status: 'finished', progress: 20 } })
  expect(saved.annotations).toHaveLength(1)
  expect(vi.mocked(putFile).mock.calls.filter(([path]) => path.endsWith(key))).toHaveLength(1)
  vi.mocked(putFile).mockClear()
  await db.updateProgress('book', 20, 2, '#page-2', { key: 'data-id', totalPages: 10 })
  expect(putFile).not.toHaveBeenCalled()
})

test('one shelf refresh reads the index once and never scans annotation files', async () => {
  files.set('bookshelf.json', JSON.stringify({ book: { url: 'book', title: 'Alpha', status: 'reading', format: 'pdf', tags: ['tag'], groups: ['g'] } }))
  files.set('settings.json', JSON.stringify({ book_groups: [{ id: 'g', type: 'folder' }] }))
  const state = await new BookshelfManager().getBookshelfState({ keyword: 'Alpha' })
  expect(state.books).toHaveLength(1)
  expect(state).toMatchObject({ counts: { g: 1 }, tags: [{ tag: 'tag', count: 1 }] })
  const paths = vi.mocked(fetch).mock.calls.map(([, options]) => JSON.parse(options!.body as string).path)
  expect(paths.filter(path => path.endsWith('/bookshelf.json'))).toHaveLength(1)
  expect(paths.some(path => path.includes('/records/'))).toBe(false)
})

test('progress retries a failed index write without rewriting its already-saved record', async () => {
  const key = bookRecordKey('book').name
  files.set('bookshelf.json', JSON.stringify({ book: { url: 'book', status: 'unread' } }))
  files.set(key, JSON.stringify(record(['keep'])))
  const write = vi.mocked(putFile).getMockImplementation()!
  let failed = false
  vi.mocked(putFile).mockImplementation(async (...args) => {
    if (!failed && args[0].endsWith('/bookshelf.json')) { failed = true; throw new Error('disk') }
    return write(...args)
  })
  const db = new ReaderDatabase()
  await expect(db.updateProgress('book', 20, 2, 'cfi')).rejects.toThrow('disk')
  vi.mocked(putFile).mockClear()
  expect(await db.updateProgress('book', 20, 2, 'cfi')).toBe(true)
  expect(vi.mocked(putFile).mock.calls.map(([path]) => path)).toEqual(['/data/storage/petal/siyuan-sireader/bookshelf.json'])
  expect(JSON.parse(files.get(key)!).annotations).toHaveLength(1)
})

test('missing files are logged as completed reads, including SiYuan JSON 404', async () => {
  await pluginStorageAdapter.read('missing.json')
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: 404, msg: 'missing', data: null }), { status: 202 }))
  await pluginStorageAdapter.read('missing.json')
  const missing = vi.mocked(diagnosticLog).mock.calls.filter(([, event, data]) => event === 'storage.read' && data?.found === false)
  expect(missing).toHaveLength(2)
  expect(missing[0][2]).toMatchObject({ key: 'missing.json', status: 404 })
  expect(missing[1][2]).toMatchObject({ key: 'missing.json', status: 202, code: 404 })
})

test('book file failures retain HTTP and SiYuan API evidence', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: 403, msg: 'forbidden', data: null }), { status: 202, headers: { 'content-type': 'application/json' } }))
  expect(await readFileBlob('/plugin/private/siyuan-cloud/p/books/a.pdf')).toBeNull()
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/plugin/private/siyuan-cloud/d/books/a.pdf')
  const failure = vi.mocked(diagnosticLog).mock.calls.find(([, event]) => event === 'file.read.failed')
  expect(failure?.[2]).toMatchObject({ kind: 'siyuan-cloud', status: 202, apiCode: 403, apiMsg: 'forbidden', contentType: 'application/json' })
  expect(failure?.[2]?.bodyPreview).toContain('forbidden')
})

const files = new Map<string, string>()
const record = (ids: string[] = []) => ({ version: 1, book: {}, annotations: ids.map(id => ({ annotation: { id, type: 9, pageIndex: 0 } })), updatedAt: 0 })
const nameFromPath = (path: string) => path.replace('/data/storage/petal/siyuan-sireader/', '')
beforeEach(() => {
  files.clear()
  vi.clearAllMocks()
  vi.mocked(usePlugin).mockReturnValue({ name: 'siyuan-sireader' } as any)
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const key = nameFromPath(JSON.parse(options.body).path)
    return files.has(key) ? new Response(files.get(key)) : new Response('', { status: 404 })
  }))
  vi.mocked(putFile).mockImplementation(async (path, _isDir, file) => { files.set(nameFromPath(path), await file.text()); return null })
  vi.mocked(removeFile).mockImplementation(async path => { files.delete(nameFromPath(path)); return null })
  vi.mocked(readDir).mockResolvedValue([] as any)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

test('read failure and malformed JSON never become an empty writable record', async () => {
  files.set('settings.json', '{broken')
  await expect(storageEngine.transact({ name: 'settings.json', defaultValue: () => ({}) }, [{ id: 'x', type: 'set', path: ['x'], value: 1 }])).rejects.toThrow('Invalid JSON')
  vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
  await expect(pluginStorageAdapter.read('settings.json')).rejects.toThrow('offline')
  expect(putFile).not.toHaveBeenCalled()
})

test('only explicit absence returns found:false, HTTP errors remain errors', async () => {
  expect((await pluginStorageAdapter.read('absent.json')).found).toBe(false)
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: 404, msg: 'missing', data: null })))
  expect((await pluginStorageAdapter.read('absent.json')).found).toBe(false)
  vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 500 }))
  await expect(pluginStorageAdapter.read('absent.json')).rejects.toThrow('500')
})

test('stamp binary survives JSON and Vue proxy cloning', async () => {
  const value = reactive({ ctx: { data: new Uint8Array([0, 255, 12]).buffer } })
  const copy = cloneStorageValue(value)
  await pluginStorageAdapter.write('stamp.json', copy)
  const loaded = (await pluginStorageAdapter.read('stamp.json')).value as any
  expect([...new Uint8Array(loaded.ctx.data)]).toEqual([0, 255, 12])
})

test('queued updates use the latest record and snapshot the submitted proxy', async () => {
  const key = bookRecordKey('book')
  files.set(key.name, JSON.stringify(record()))
  const value = reactive({ annotation: { id: 'a', type: 9, contents: 'before' } })
  const first = storageEngine.transact(key, [{ id: 'a', type: 'upsert', path: ['annotations'], itemKey: 'annotation.id', value }])
  value.annotation.contents = 'after'
  const second = writeEmbedPdfProgress('book', { pageNumber: 8, totalPages: 10, updatedAt: 1 })
  await Promise.all([first, second])
  const actual = JSON.parse(files.get(key.name)!)
  expect(actual.annotations[0].annotation.contents).toBe('before')
  expect(actual.progress.pageNumber).toBe(8)
  expect(actual.migration?.pdfAnnotations).toBeUndefined()
})

test('a failed queued write does not poison subsequent writes', async () => {
  const engine = createStorageEngine({ read: async () => ({ found: true, value: {} }), write: vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined), remove: vi.fn() })
  const key = { name: 'settings.json', defaultValue: () => ({}) }
  await expect(engine.transact(key, [{ id: 'a', type: 'set', path: ['x'], value: 1 }])).rejects.toThrow('disk')
  await expect(engine.transact(key, [{ id: 'b', type: 'set', path: ['x'], value: 2 }])).resolves.toEqual({ x: 2 })
})

test('deleting a book does not flush unrelated writes', async () => {
  files.set('bookshelf.json', JSON.stringify({ book: { url: 'book' } }))
  const flush = vi.spyOn(storageEngine, 'flush').mockRejectedValue(new Error('unrelated write failed'))
  try {
    await expect(new ReaderDatabase().deleteBook('book')).resolves.toBeUndefined()
    expect(JSON.parse(files.get('bookshelf.json')!)).toEqual({})
    expect(flush).not.toHaveBeenCalled()
  } finally { flush.mockRestore() }
})

test('flush preserves the original single write failure', async () => {
  let reject!: (error: Error) => void
  let start!: () => void
  const started = new Promise<void>(resolve => { start = resolve })
  const failure = new Error('remove denied: records/book.json')
  const engine = createStorageEngine({ read: vi.fn(), write: vi.fn(), remove: () => new Promise<void>((_, fail) => { reject = fail; start() }) })
  const removing = engine.remove('records/book.json')
  const settled = removing.catch(error => error)
  await started
  const flushing = engine.flush()
  reject(failure)
  await expect(flushing).rejects.toBe(failure)
  expect(await settled).toBe(failure)
})

test('future record versions are rejected before any write', async () => {
  const key = bookRecordKey('future')
  files.set(key.name, JSON.stringify({ ...record(), version: 2 }))
  await expect(storageEngine.transact(key, [{ id: 'x', type: 'set', path: ['updatedAt'], value: 1 }])).rejects.toThrow('unsupported')
  expect(putFile).not.toHaveBeenCalled()
})

test.each([
  { ...record(['future']), version: 2 },
  { ...record(['future']), book: null },
  { storageVersion: 3, data: record(['future']) },
])('unsupported backup records cannot be merged into current data: %j', async backup => {
  const key = bookRecordKey('book').name
  files.set('bookshelf.json', JSON.stringify({ book: { url: 'book' } }))
  files.set(key, JSON.stringify(record(['current'])))
  vi.mocked(readDir).mockResolvedValue([{ name: '100', isDir: true }] as any)
  files.set(`backups/storage-v1/100/${key}`, JSON.stringify(backup))
  expect(await recoverBackupRecords()).toBe(0)
  expect(putFile).not.toHaveBeenCalled()
  expect(JSON.parse(files.get(key)!).annotations).toHaveLength(1)
})

test('legacy decoding is detached and consistent for reads and both update paths', async () => {
  const legacy = { book: {}, annotations: [], updatedAt: 0 }
  const raw = { storageVersion: 2, data: JSON.stringify(legacy) }
  const adapter = { read: vi.fn(async () => ({ found: true, value: raw })), write: vi.fn(), remove: vi.fn() }
  const engine = createStorageEngine(adapter)
  const key = bookRecordKey('legacy-envelope')
  expect((await engine.read(key)).version).toBe(1)
  await engine.transact(key, [{ id: 'edit', type: 'set', path: ['book', 'title'], value: 'title' }])
  expect(adapter.write).toHaveBeenLastCalledWith(key.name, expect.objectContaining({ version: 1, book: { title: 'title' } }))
  await engine.mutate(key, 'edit', current => ({ ...current, updatedAt: 1 }))
  expect(adapter.write).toHaveBeenLastCalledWith(key.name, expect.objectContaining({ version: 1, updatedAt: 1 }))
  expect(raw).toEqual({ storageVersion: 2, data: JSON.stringify(legacy) })
})

test('unversioned legacy records remain readable and are normalized during recovery', async () => {
  const legacy = { book: { title: 'legacy' }, annotations: [], updatedAt: 1 }
  const key = bookRecordKey('legacy')
  files.set('bookshelf.json', JSON.stringify({ legacy: { url: 'legacy' } }))
  files.set(key.name, JSON.stringify(legacy))
  expect((await storageEngine.read(key)).version).toBe(1)
  expect(await recoverBackupRecords()).toBe(1)
  expect(JSON.parse(files.get(key.name)!)).toMatchObject({ version: 1, book: { title: 'legacy' }, annotations: [] })
  const snapshot = [...files.keys()].find(name => name.startsWith('backups/before-recovery/'))!
  expect(JSON.parse(files.get(snapshot)!)).toEqual(legacy)
  expect(diagnosticLog).toHaveBeenCalledWith('info', 'recovery.done', expect.objectContaining({ normalized: 1, supplemented: 0, addedAnnotations: 0 }))
})

test('URL alias is migrated once; deleting an annotation does not resurrect it', async () => {
  files.set(bookRecordKey('url').name, JSON.stringify(record(['old'])))
  expect((await readEmbedPdfAnnotations('data-id', [], ['url']))?.length).toBe(1)
  await deleteEmbedPdfAnnotation('data-id', 'old')
  expect(await readEmbedPdfAnnotations('data-id', [], ['url'])).toBeNull()
  expect(JSON.parse(files.get(bookRecordKey('data-id').name)!).annotations).toEqual([])
})

test('migration retains unsupported legacy records and does not mark them complete', async () => {
  const original = { ...record(), annotations: [{ id: 'unknown', type: 'future-kind' }, { annotation: { id: 'valid', type: 9, pageIndex: 0 } }] }
  const io = { readRecord: vi.fn(async () => original as any), writeRecord: vi.fn(async (_url, next) => next), readLegacyBlob: vi.fn(async () => null), removeLegacy: vi.fn() }
  const result = await ensurePdfRecordMigrated('legacy', io)
  expect(result?.annotations.map(item => (item.annotation || item).id)).toEqual(['unknown', 'valid'])
  expect(result?.migration?.pdfAnnotations).toBeUndefined()
})

test('one-time recovery supplements valid records without reviving shelf entries', async () => {
  files.set('bookshelf.json', JSON.stringify({ url: { url: 'url', dataId: 'data-id' } }))
  const key = bookRecordKey('data-id').name
  files.set(key, JSON.stringify(record(['current'])))
  files.set(`backups/storage-v1/123/${bookRecordKey('url').name}`, JSON.stringify(record(['backup'])))
  files.set('backups/storage-v1/123/bookshelf.json', JSON.stringify({ deleted: { url: 'deleted' } }))
  vi.mocked(readDir).mockResolvedValue([{ name: '123', isDir: true }] as any)
  expect(await recoverBackupRecords()).toBe(1)
  expect(JSON.parse(files.get(key)!).annotations.map(item => item.annotation.id)).toEqual(['backup', 'current'])
  expect(Object.keys(JSON.parse(files.get('bookshelf.json')!))).toEqual(['url'])
  expect([...files.keys()].some(name => name.startsWith('backups/before-recovery/'))).toBe(true)
})

test('a recovery snapshot failure leaves the current record untouched without blocking startup', async () => {
  files.set('bookshelf.json', JSON.stringify({ url: { url: 'url' } }))
  const key = bookRecordKey('url').name
  files.set(key, JSON.stringify({ storageVersion: 2, data: record(['current']) }))
  files.set(`backups/storage-v1/123/${key}`, JSON.stringify(record(['backup'])))
  vi.mocked(readDir).mockResolvedValue([{ name: '123', isDir: true }] as any)
  vi.mocked(putFile).mockRejectedValueOnce(new Error('snapshot failed'))
  await expect(recoverBackupRecords()).resolves.toBe(0)
  expect(JSON.parse(files.get(key)!).data.annotations.map(item => item.annotation.id)).toEqual(['current'])
  expect(vi.mocked(diagnosticLog)).toHaveBeenCalledWith('error', 'recovery.record.failed', expect.objectContaining({ key }))
})

test('one invalid record does not prevent other shelf records from recovering', async () => {
  const brokenKey = bookRecordKey('broken').name
  const healthyKey = bookRecordKey('healthy').name
  files.set('bookshelf.json', JSON.stringify({ broken: { url: 'broken' }, healthy: { url: 'healthy' } }))
  files.set(brokenKey, JSON.stringify({ unexpected: true }))
  files.set(`backups/storage-v1/123/${healthyKey}`, JSON.stringify(record(['recovered'])))
  vi.mocked(readDir).mockResolvedValue([{ name: '123', isDir: true }] as any)
  await expect(recoverBackupRecords()).resolves.toBe(1)
  expect(JSON.parse(files.get(healthyKey)!).annotations[0].annotation.id).toBe('recovered')
  expect(files.get(brokenKey)).toBe(JSON.stringify({ unexpected: true }))
  expect(vi.mocked(diagnosticLog)).toHaveBeenCalledWith('error', 'recovery.record.failed', expect.objectContaining({ key: brokenKey }))
})

test('missing records merge all old backup entries only once', async () => {
  files.set('bookshelf.json', JSON.stringify({ url: { url: 'url' } }))
  const key = bookRecordKey('url').name
  files.set(`backups/storage-v1/123/${key}`, JSON.stringify(record(['newest'])))
  files.set(`backups/storage-v1/122/${key}`, JSON.stringify(record(['deleted-in-newer'])))
  vi.mocked(readDir).mockResolvedValue([{ name: '122', isDir: true }, { name: '123', isDir: true }] as any)
  expect(await recoverBackupRecords()).toBe(1)
  expect(JSON.parse(files.get(key)!).annotations.map(item => item.annotation.id)).toEqual(['deleted-in-newer', 'newest'])
  await deleteEmbedPdfAnnotation('url', 'newest')
  expect(await recoverBackupRecords()).toBe(0)
  expect(JSON.parse(files.get(key)!).annotations.map(item => item.annotation.id)).toEqual(['deleted-in-newer'])
})

test('legacy envelope is snapshotted before supplementing its payload', async () => {
  files.set('bookshelf.json', JSON.stringify({ url: { url: 'url' } }))
  const key = bookRecordKey('url').name
  const original = JSON.stringify({ storageVersion: 2, data: record([]) })
  files.set(key, original)
  files.set(`backups/storage-v1/123/${key}`, JSON.stringify(record(['deleted'])))
  vi.mocked(readDir).mockResolvedValue([{ name: '123', isDir: true }] as any)
  expect(await recoverBackupRecords()).toBe(1)
  expect(JSON.parse(files.get(key)!).annotations.map(item => item.annotation.id)).toEqual(['deleted'])
  const snapshot = [...files.keys()].find(name => name.startsWith('backups/before-recovery/'))!
  expect(JSON.parse(files.get(snapshot)!)).toEqual(JSON.parse(original))
})

test('recovery keeps the latest current annotation on ID conflicts and retries after failed writes', async () => {
  const key = bookRecordKey('book')
  const current = { ...record(['same']), annotations: [{ annotation: { id: 'same', contents: 'current' } }] }
  const backup = { ...record(['same']), annotations: [{ annotation: { id: 'same', contents: 'old' } }, { annotation: { id: 'missing' } }] }
  let value: any = current
  const adapter = { read: vi.fn(async () => ({ found: true, value })), write: vi.fn(async (name, next) => { if (name === key.name) value = next }), remove: vi.fn() }
  const engine = createStorageEngine(adapter)
  adapter.write.mockRejectedValueOnce(new Error('snapshot failed'))
  await expect(engine.recover(key, backup, 'snapshot')).rejects.toThrow('snapshot failed')
  expect(value.migration).toBeUndefined()
  expect(await engine.recover(key, backup, 'snapshot')).toMatchObject({ supplemented: true, addedAnnotations: 1 })
  expect(value.annotations.find(item => item.annotation.id === 'same').annotation.contents).toBe('current')
  expect(value.annotations).toHaveLength(2)
  expect(await engine.recover(key, backup, 'snapshot')).toBe(false)
})

test('database settings read synced changes and do not skip a stale equal-value save', async () => {
  const db = new ReaderDatabase()
  files.set('settings.json', JSON.stringify({ x: 1 }))
  expect(await db.getSetting('x')).toBe(1)
  files.set('settings.json', JSON.stringify({ x: 2, remote: true }))
  await db.saveSetting('x', 1)
  expect(JSON.parse(files.get('settings.json')!)).toEqual({ x: 1, remote: true })
})

test('normalizes Siyuan document attachment suffixes in book titles', () => {
  expect(normalizeBookTitle('bert-acl-two-column-20260929204441-983j8fw.pdf')).toBe('bert-acl-two-column')
  expect(normalizeBookTitle('bert-acl-two-column.pdf')).toBe('bert-acl-two-column')
})

test('patching nested settings works on a clean installation', async () => {
  const db = new ReaderDatabase()
  await db.patchSetting('reader_settings', { nested: { font: 16 } })
  expect(JSON.parse(files.get('settings.json')!)).toEqual({ reader_settings: { nested: { font: 16 } } })
})

test('failed book record save never publishes a broken shelf entry', async () => {
  vi.mocked(putFile).mockRejectedValueOnce(new Error('disk full'))
  await expect(new ReaderDatabase().saveBook({ url: 'new', title: 'New', format: 'pdf', status: 'unread' })).rejects.toThrow('disk full')
  expect(files.has('bookshelf.json')).toBe(false)
})

test('older record metadata cannot roll back current shelf fields', async () => {
  files.set('bookshelf.json', JSON.stringify({ url: { url: 'url', title: 'new', chapter: 12, groups: [] } }))
  files.set(bookRecordKey('url').name, JSON.stringify({ ...record(), book: { title: 'old', chapter: 1, path: '/public/book.pdf' } }))
  const book = await new ReaderDatabase().getBook('url')
  expect(book?.title).toBe('new')
  expect(book?.chapter).toBe(12)
  expect(book?.path).toBe('/public/book.pdf')
  expect(putFile).not.toHaveBeenCalled()
})

test('later arriving alias remains eligible for migration after an initial missing read', async () => {
  await readEmbedPdfAnnotations('data-id', [], ['url'])
  files.set(bookRecordKey('url').name, JSON.stringify(record(['late'])))
  expect((await readEmbedPdfAnnotations('data-id', [], ['url']))?.map(item => item.annotation.id)).toEqual(['late'])
})

test('failed deferred save does not block the next progress update', async () => {
  const { createLatestSaver } = await import('@/core/storage')
  const write = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined)
  const saver = createLatestSaver<number>(write)
  saver.schedule(1)
  await expect(saver.flush()).rejects.toThrow('network')
  saver.schedule(2)
  await expect(saver.flush()).resolves.toBeUndefined()
  expect(write).toHaveBeenLastCalledWith(2)
})

describe('storage flow', () => {

  test('valid primary progress does not read a corrupt obsolete alias', async () => {
    const progress = { pageNumber: 7, totalPages: 20, updatedAt: 10 }
    files.set(bookRecordKey('primary').name, JSON.stringify({ ...record(), progress }))
    files.set(bookRecordKey('obsolete').name, '{broken')
    expect(await readEmbedPdfProgress('primary', ['obsolete'])).toEqual(progress)
    expect(putFile).not.toHaveBeenCalled()
  })

  test('alias progress cannot overwrite progress arriving during migration', async () => {
    const old = { pageNumber: 2, totalPages: 20, updatedAt: 1 }
    const latest = { pageNumber: 9, totalPages: 20, updatedAt: 10 }
    const primaryKey = bookRecordKey('primary').name
    files.set(primaryKey, JSON.stringify(record()))
    files.set(bookRecordKey('alias').name, JSON.stringify({ ...record(), progress: old }))
    const originalFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (...args) => {
      const response = await originalFetch(...args)
      if (JSON.parse(String(args[1]?.body)).path.endsWith(bookRecordKey('alias').name)) {
        files.set(primaryKey, JSON.stringify({ ...record(), progress: latest }))
      }
      return response
    })
    expect(await readEmbedPdfProgress('primary', ['alias'])).toEqual(latest)
    expect(JSON.parse(files.get(primaryKey)!).progress).toEqual(latest)
    expect(putFile).not.toHaveBeenCalled()
  })

  test('unchanged recovery does not reset migration or write another snapshot', async () => {
    const current = { ...record(['note']), migration: { pdfAnnotations: 'done', backupRecovery: '2026-09-29' } }
    const adapter = { read: vi.fn(async () => ({ found: true, value: current })), write: vi.fn(), remove: vi.fn() }
    const engine = createStorageEngine(adapter)
    expect(await engine.recover(bookRecordKey('book'), current, 'snapshot')).toBe(false)
    expect(adapter.write).not.toHaveBeenCalled()
    expect(current.migration.pdfAnnotations).toBe('done')
  })

  test('alias annotation migration preserves the only available book metadata', async () => {
    files.set(bookRecordKey('alias').name, JSON.stringify({ ...record(['note']), book: { path: '/public/book.pdf' } }))
    await readEmbedPdfAnnotations('primary', [], ['alias'])
    expect(JSON.parse(files.get(bookRecordKey('primary').name)!).book.path).toBe('/public/book.pdf')
  })

  test('latest saver preserves A after an in-flight B and snapshots scheduled values', async () => {
    const writes: number[] = []
    let release!: () => void
    let started!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    const blocked = new Promise<void>(resolve => { release = resolve })
    const saver = createLatestSaver<{ value: number }>(async item => {
      if (item.value === 2) { started(); await blocked }
      writes.push(item.value)
    })
    saver.schedule({ value: 1 })
    await saver.flush()
    saver.schedule({ value: 2 })
    const second = saver.flush()
    await entered
    const final = { value: 1 }
    saver.schedule(final)
    final.value = 99
    const third = saver.flush()
    release()
    await Promise.all([second, third])
    expect(writes).toEqual([1, 2, 1])
  })

  test('shutdown rejects removal and recovery without touching files', async () => {
    const adapter = { read: vi.fn(), write: vi.fn(), remove: vi.fn() }
    const engine = createStorageEngine(adapter)
    engine.stopAccepting()
    await expect(engine.remove('settings.json')).rejects.toThrow('shutting down')
    await expect(engine.recover(bookRecordKey('book'), record(), 'snapshot')).rejects.toThrow('shutting down')
    expect(adapter.read).not.toHaveBeenCalled()
    expect(adapter.remove).not.toHaveBeenCalled()
  })

  test('latest saver coalesces noisy events and skips unchanged values', async () => {
    const { createLatestSaver } = await import('@/core/storage')
    vi.useFakeTimers()
    const writes: number[] = []
    const saver = createLatestSaver<number>(value => { writes.push(value) }, 100)

    saver.schedule(1)
    saver.schedule(2)
    saver.schedule(2)
    await vi.advanceTimersByTimeAsync(100)
    expect(writes).toEqual([2])

    saver.schedule(2)
    await vi.advanceTimersByTimeAsync(100)
    expect(writes).toEqual([2])

    saver.schedule(3)
    await saver.flush()
    expect(writes).toEqual([2, 3])
    vi.useRealTimers()
  })

  test('PDF cover rendering is safe when no browser document is available', async () => {
    const { renderPdfFirstPage } = await import('@/utils/embedPdfActions')
    expect(await renderPdfFirstPage(new Blob(['%PDF-'], { type: 'application/pdf' }))).toBeUndefined()
  })

})
