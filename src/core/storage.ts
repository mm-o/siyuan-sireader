import { readDir, putFile, removeFile } from '@/api'
import { usePlugin } from '@/main'
import { ensurePdfRecordMigrated } from './dataMigration'
import { diagnosticLog } from './diagnostics'

const storageJSON = (value: unknown) => JSON.stringify(value, (_key, item) => {
  if (!(item instanceof ArrayBuffer) && !ArrayBuffer.isView(item)) return item
  const bytes = item instanceof ArrayBuffer ? new Uint8Array(item) : new Uint8Array(item.buffer, item.byteOffset, item.byteLength)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return { $sireaderBinary: 'base64', data: btoa(binary) }
})
const parseStorageJSON = (text: string) => JSON.parse(text, (_key, item) =>
  item?.$sireaderBinary === 'base64' && typeof item.data === 'string'
    ? Uint8Array.from(atob(item.data), char => char.charCodeAt(0)).buffer : item)

export interface StorageAdapter { read(key: string): Promise<{ found: boolean; value: unknown }>; write(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void>; listAll?(prefix: string): Promise<Array<{ name: string; isDir: boolean }>> }
const STORAGE_ROOT = '/data/storage/petal'
const safeKey = (key: string) => { const parts = key.replace(/\\/g, '/').split('/').filter(part => part && part !== '.'); if (!parts.length || parts.some(part => part === '..')) throw new TypeError(`Invalid storage key: ${key}`); return parts.join('/') }
const plugin = async () => {
  const instance = usePlugin()
  if (!instance) throw new Error('SiReader plugin is unavailable')
  return instance as any
}
const root = async () => `${STORAGE_ROOT}/${(await plugin()).name}`
const valueSummary = (value: any) => ({
  type: Array.isArray(value) ? 'array' : typeof value,
  ...(Array.isArray(value) ? { length: value.length } : {}),
  ...(value && typeof value === 'object' && !Array.isArray(value) ? {
    keys: Object.keys(value),
    version: value.version,
    storageVersion: value.storageVersion,
    annotations: Array.isArray(value.annotations) ? value.annotations.length : undefined,
    hasBook: !!value.book,
    hasProgress: !!value.progress,
    updatedAt: value.updatedAt,
  } : {}),
})
export const pluginStorageAdapter: StorageAdapter = {
  async read(key) {
    const name = safeKey(key)
    const startedAt = Date.now()
    const missing = (status: number, code?: number) => {
      diagnosticLog('debug', 'storage.read', { key: name, found: false, status, code, durationMs: Date.now() - startedAt })
      return { found: false, value: undefined }
    }
    try {
      // Plugin.loadData falls back to its in-memory value on request errors.
      // Use the same official file API, but distinguish absence from failure.
      const response = await fetch('/api/file/getFile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `${await root()}/${name}` }),
      })
      if (response.status === 404) return missing(response.status)
      if (!response.ok) throw new Error(`Storage read failed (${response.status}): ${name}`)
      const content = await response.text()
      let value: any
      try { value = parseStorageJSON(content) } catch {
        if (name.endsWith('.json')) throw new Error(`Invalid JSON: ${name}`)
        value = content
      }
      if (value && typeof value.code === 'number' && 'msg' in value && 'data' in value) {
        if (value.code === 404) return missing(response.status, value.code)
        if (value.code !== 0) throw new Error(`Storage read failed (${value.code}): ${name}: ${value.msg}`)
      }
      const found = true
      diagnosticLog('debug', 'storage.read', { key: name, read: true, found, durationMs: Date.now() - startedAt, ...valueSummary(value) })
      return { found, value }
    } catch (error) {
      diagnosticLog('error', 'storage.read.failed', { key: name, read: true, failed: true, durationMs: Date.now() - startedAt, error })
      throw error
    }
  },
  async write(key, value) {
    const name = safeKey(key)
    const startedAt = Date.now()
    try { await putFile(`${await root()}/${name}`, false, new File([storageJSON(value)], name.split('/').pop()!, { type: 'application/json' })); diagnosticLog('debug', 'storage.write', { key: name, operation: 'write', durationMs: Date.now() - startedAt, ...valueSummary(value) }) }
    catch (error) { diagnosticLog('error', 'storage.write.failed', { key: name, operation: 'write', failed: true, durationMs: Date.now() - startedAt, error }); throw error }
  },
  async remove(key) {
    const name = safeKey(key)
    try { await removeFile(`${await root()}/${name}`); diagnosticLog('info', 'storage.remove', { key: name }) }
    catch (error) { diagnosticLog('error', 'storage.remove.failed', { key: name, error }); throw error }
  },
  async listAll(prefix) {
    const name = safeKey(prefix)
    const startedAt = Date.now()
    try {
      const payload = await readDir(`${await root()}/${name}`, true)
      const items = Array.isArray(payload) ? payload : Array.isArray((payload as any)?.data) ? (payload as any).data : []
      const entries = items.filter((item: any) => item?.name).map((item: any) => ({ name: item.name, isDir: !!(item.isDir ?? item.is_dir) }))
      diagnosticLog('debug', 'storage.list', { prefix: name, count: entries.length, directories: entries.filter(item => item.isDir).length, durationMs: Date.now() - startedAt })
      return entries
    } catch (error) { diagnosticLog('error', 'storage.list.failed', { prefix: name, error }); throw error }
  },
}
export type StorageOperation =
  | { id: string, type: 'set', path: string[], value: unknown }
  | { id: string, type: 'patch', path: string[], value: Record<string, unknown> }
  | { id: string, type: 'upsert', path: string[], itemKey: string, value: Record<string, unknown> }
  | { id: string, type: 'delete', path: string[], itemKey?: string, itemValue?: unknown }
  | { id: string, type: 'increment' | 'max', path: string[], value: number }
export const cloneStorageValue = <T>(value: T): T => { if (value === undefined || value === null) return value; try { return structuredClone(value) } catch { const json = storageJSON(value); return (json === undefined ? value : parseStorageJSON(json)) as T } }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const itemValue = (item: unknown, key: string) => key.split('.').reduce<unknown>((value, part) => object(value) ? value[part] : undefined, item)
const updateAtPath = (root: any, path: string[], update: (value: unknown) => unknown, create = false): any => {
  if (!path.length) return update(root)
  if (!object(root) && !Array.isArray(root)) {
    if (!create) throw new TypeError(`Invalid operation path: ${path.join('.')}`)
    root = {}
  }
  const [head, ...tail] = path
  if (!(head in root)) { if (tail.length && !create) throw new TypeError(`Invalid operation path: ${path.join('.')}`); const child = tail.length ? updateAtPath({}, tail, update, true) : update(undefined); return Array.isArray(root) ? Object.assign(root.slice(), { [head]: child }) : { ...root, [head]: child } }
  const child = updateAtPath(root[head], tail, update, create)
  if (Array.isArray(root)) { const copy = root.slice(); copy[head as any] = child; return copy }
  return { ...root, [head]: child }
}
const applyOperation = (data: any, operation: StorageOperation): any => {
  if (operation.type === 'set') return updateAtPath(data, operation.path, () => cloneStorageValue(operation.value), true)
  if (operation.type === 'patch') return updateAtPath(data, operation.path, current => ({ ...(object(current) ? current : {}), ...cloneStorageValue(operation.value) }), true)
  if (operation.type === 'upsert') return updateAtPath(data, operation.path, current => { if (!Array.isArray(current)) throw new TypeError('Upsert target is not an array'); const key = itemValue(operation.value, operation.itemKey); const copy = current.slice(); const index = copy.findIndex(item => itemValue(item, operation.itemKey) === key); if (index < 0) copy.push(cloneStorageValue(operation.value)); else copy[index] = cloneStorageValue(operation.value); return copy })
  if (operation.type === 'delete') return operation.itemKey ? updateAtPath(data, operation.path, current => (current as any[]).filter(item => itemValue(item, operation.itemKey!) !== operation.itemValue)) : updateAtPath(data, operation.path.slice(0, -1), current => { const copy = { ...(object(current) ? current : {}) }; delete copy[operation.path.at(-1)!]; return copy })
  return updateAtPath(data, operation.path, current => operation.type === 'max' ? Math.max(Number(current || 0), operation.value) : Number(current || 0) + operation.value, true)
}
const applyOperations = <T>(source: T, operations: StorageOperation[]) => ({ data: operations.reduce((value, operation) => applyOperation(value, operation), source) as T })
const isPlain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export const diffLeaves = (current: Record<string, unknown>, baseline: Record<string, unknown>) => Object.fromEntries(Object.entries(current).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(baseline[key])))
export const leafEntries = (patch: Record<string, unknown>, prefix: string[] = []): Array<[string[], unknown]> => Object.entries(patch).flatMap(([key, value]) => { const path = [...prefix, key]; return isPlain(value) && Object.keys(value).length ? leafEntries(value, path) : [[path, cloneStorageValue(value)]] })

/** Thin adapter over SiYuan storage: no plugin cache, envelope or WAL. */
export interface StorageKey<T> { name: string; defaultValue: () => T }

const validateStored = (name: string, value: any) => {
  if (name.startsWith('records/')) {
    if (!value || value.version !== 1 || !Array.isArray(value.annotations) || !isPlain(value.book)) throw new Error(`Invalid or unsupported record: ${name}`)
  }
  if (['bookshelf.json', 'settings.json', 'daily.json'].includes(name) && !isPlain(value)) throw new Error(`Invalid data: ${name}`)
}

// Decode legacy representations once, using the logical key even for backups.
// Validation never mutates its input; callers keep raw bytes for snapshots.
const decodeStored = <T>(name: string, raw: unknown): T => {
  let value: any = cloneStorageValue(raw)
  if (typeof value === 'string') {
    try { value = parseStorageJSON(value) } catch { /* Non-JSON compatibility values. */ }
  }
  if (isPlain(value) && 'storageVersion' in value) {
    if (value.storageVersion !== 2 || !('data' in value)) throw new Error(`Unsupported storage version: ${value.storageVersion}`)
    value = value.data
    if (typeof value === 'string') {
      try { value = parseStorageJSON(value) } catch { /* Schema validation below. */ }
    }
  }
  if (name.startsWith('records/') && isPlain(value) && value.version === undefined) value = { ...value, version: 1 }
  validateStored(name, value)
  return value as T
}

export class StorageEngine {
  private queues = new Map<string, Promise<unknown>>()
  private accepting = true
  constructor(private readonly adapter: StorageAdapter) {}
  private enqueue<T>(key: string, task: () => Promise<T>) {
    const previous = this.queues.get(key) || Promise.resolve()
    const current = previous.catch(() => undefined).then(async () => {
      const locks = globalThis.navigator?.locks
      return locks ? await locks.request(`siyuan-sireader:${safeKey(key)}`, async () => await task()) : await task()
    })
    const tracked = current.finally(() => { if (this.queues.get(key) === tracked) this.queues.delete(key) })
    this.queues.set(key, tracked)
    return tracked
  }
  async read<T>(key: StorageKey<T>, _fresh = false): Promise<T> {
    return (await this.readState(key)).value
  }
  async readState<T>(key: StorageKey<T>, _fresh = false): Promise<{ found: boolean; value: T }> {
    await this.queues.get(key.name)
    const stored = await this.adapter.read(key.name)
    const value = stored.found ? decodeStored<T>(key.name, stored.value) : cloneStorageValue(key.defaultValue())
    return { found: stored.found, value }
  }
  transact<T>(key: StorageKey<T>, operations: StorageOperation[], onCommit?: (data: T) => void): Promise<T> {
    if (!this.accepting) return Promise.reject(new Error('Storage is shutting down'))
    operations = cloneStorageValue(operations)
    return this.enqueue(key.name, async () => {
      try {
        const stored = await this.adapter.read(key.name)
        const current = stored.found ? decodeStored<T>(key.name, stored.value) : cloneStorageValue(key.defaultValue())
        const result = applyOperations(current, cloneStorageValue(operations))
        validateStored(key.name, result.data)
        if (!stored.found || storageJSON(current) !== storageJSON(result.data)) await this.adapter.write(key.name, result.data)
        const value = cloneStorageValue(result.data)
        diagnosticLog('debug', 'storage.transact', { key: key.name, operation: 'transact', found: stored.found, operations: operations.map(operation => ({ type: operation.type, path: operation.path })) })
        try { onCommit?.(cloneStorageValue(value)) } catch {}
        return value
      } catch (error) {
        diagnosticLog('error', 'storage.transact.failed', { key: key.name, operation: 'transact', failed: true, operations: operations.map(operation => ({ type: operation.type, path: operation.path })), error })
        throw error
      }
    })
  }
  mutate<T>(key: StorageKey<T>, _mutationId: string, update: (current: T) => T): Promise<T> {
    if (!this.accepting) return Promise.reject(new Error('Storage is shutting down'))
    return this.enqueue(key.name, async () => {
      const stored = await this.adapter.read(key.name)
      const current = stored.found ? decodeStored<T>(key.name, stored.value) : cloneStorageValue(key.defaultValue())
      const before = storageJSON(current)
      const value = cloneStorageValue(update(current))
      validateStored(key.name, value)
      if (!stored.found || before !== storageJSON(value)) await this.adapter.write(key.name, value)
      return value
    })
  }
  remove(key: string) {
    if (!this.accepting) return Promise.reject(new Error('Storage is shutting down'))
    return this.enqueue(key, () => this.adapter.remove(key))
  }
  recover(key: StorageKey<BookRecord>, backup: BookRecord, snapshotKey: string) {
    if (!this.accepting) return Promise.reject(new Error('Storage is shutting down'))
    return this.enqueue(key.name, async () => {
      const state = await this.adapter.read(key.name)
      const current = state.found ? decodeStored<BookRecord>(key.name, state.value) : key.defaultValue()
      if (current.migration?.backupRecovery === BACKUP_RECOVERY) return false
      const next = mergeRecoveryRecords(current, decodeStored<BookRecord>(key.name, backup))
      const addedAnnotations = next.annotations.length - current.annotations.length
      const supplemented = storageJSON(mergeRecoveryRecords(current, current)) !== storageJSON(next)
      next.migration = { ...next.migration, backupRecovery: BACKUP_RECOVERY }
      if (storageJSON(current.annotations) !== storageJSON(next.annotations)) delete next.migration.pdfAnnotations
      validateStored(key.name, next)
      if (state.found) await this.adapter.write(snapshotKey, state.value)
      await this.adapter.write(key.name, next)
      const outcome = { normalized: state.found && storageJSON(state.value) !== storageJSON(current), supplemented, addedAnnotations }
      diagnosticLog('info', 'recovery.record.done', { key: key.name, reason: !state.found ? 'missing-record' : supplemented ? 'supplement-current' : 'normalize-or-mark', snapshot: state.found ? snapshotKey : undefined, beforeAnnotations: current.annotations.length, afterAnnotations: next.annotations.length, ...outcome })
      return outcome
    })
  }
  async flush() {
    const errors: unknown[] = []
    while (this.queues.size) for (const result of await Promise.allSettled([...this.queues.values()])) if (result.status === 'rejected') errors.push(result.reason)
    if (errors.length === 1) throw errors[0]
    if (errors.length) throw Object.assign(new Error(`Storage writes failed: ${errors.map(error => error instanceof Error ? error.message : String(error)).join('; ')}`), { errors })
  }
  stopAccepting() { this.accepting = false }
  startAccepting() { this.accepting = true }
}

export const createStorageEngine = (adapter: StorageAdapter) => new StorageEngine(adapter)
export const storageEngine = createStorageEngine(pluginStorageAdapter)
export const flushStorage = () => storageEngine.flush()


const dataPath = (path: string) => path.startsWith('/public/') ? `/data${path}` : path
export const writeManagedFiles = async (items: { blob: Blob; destination: string; name?: string }[], onProgress?: (value: number) => void, concurrency = 4) => {
  const files = items.map(({ blob, destination, name }) => {
    const path = dataPath(destination)
    return { blob, path, name: name || path.split('/').pop() || 'file', type: blob.type || 'application/octet-stream' }
  })
  const directories = new Set<string>()
  for (const { path } of files) directories.add(path.slice(0, path.lastIndexOf('/')) || '/data/public')
  for (const directory of directories) {
    try { await putFile(directory, true, new File([], '')) }
    catch (error) { throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), { path: directory, cause: error }) }
  }

  let next = 0, completed = 0, failed = false, failure: unknown
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), files.length) }, async () => {
    while (!failed && next < files.length) {
      const file = files[next++]
      try {
        await putFile(file.path, false, new File([file.blob], file.name, { type: file.type }))
        onProgress?.(++completed / files.length * 100)
      } catch (error) { failed = true; failure = Object.assign(new Error(error instanceof Error ? error.message : String(error)), { path: file.path, cause: error }) }
    }
  })
  await Promise.all(workers)
  if (failed) throw failure
}
export const writeManagedFile = async (blob: Blob, destination: string, name?: string) => {
  await writeManagedFiles([{ blob, destination, name }], undefined, 1)
  return destination
}
export const removeManagedFileTransactionally = (path: string) => removeFile(dataPath(path))

export interface StorageStep { id: string; kind: string; payload: unknown }
export const storageTransactionStep = <T>(id: string, key: { name: string; defaultValue: T }, operations: StorageOperation[]): StorageStep => ({ id, kind: 'storage:transact', payload: { key: key.name, defaultValue: key.defaultValue, operations } })
export const writeSequentially = async (_label: string, steps: StorageStep[]) => {
  diagnosticLog('debug', 'storage.sequence.start', { label: _label, steps: steps.map(step => step.id) })
  for (const step of steps) {
    if (step.kind !== 'storage:transact') continue
    const payload = step.payload as { key: string; defaultValue: unknown; operations: StorageOperation[] }
    await storageEngine.transact({ name: payload.key, defaultValue: () => payload.defaultValue }, payload.operations)
  }
  diagnosticLog('debug', 'storage.sequence.done', { label: _label, steps: steps.length })
}

export const createLatestSaver = <T>(write: (value: T) => void | Promise<void>, delay = 300) => {
  let pending: T | undefined
  let timer: ReturnType<typeof setTimeout> | null = null
  let running: Promise<void> = Promise.resolve()
  let last: T | undefined
  let hasLast = false
  const run = () => {
    timer = null
    if (pending === undefined) return
    const value = pending
    pending = undefined
    running = running.catch(() => undefined).then(async () => {
      // Compare after prior writes complete: A -> B(in flight) -> A must save A.
      if (hasLast && storageJSON(value) === storageJSON(last)) return
      await write(value); last = value; hasLast = true
    })
    void running.catch(error => diagnosticLog('error', 'storage.deferred.failed', { error }))
  }
  return {
    schedule(value: T) { pending = cloneStorageValue(value); if (timer) clearTimeout(timer); timer = setTimeout(run, delay) },
    async flush() { if (timer) { clearTimeout(timer); run() }; await running; if (pending !== undefined) { run(); await running } },
  }
}
// This identifier belongs to this repair, not the plugin release number.
const BACKUP_RECOVERY = '2026-09-29'
const mergeRecoveryRecords = (current: BookRecord, backup: BookRecord): BookRecord => {
  const annotations = new Map<string, any>()
  for (const item of [...backup.annotations, ...current.annotations]) annotations.set(item?.annotation?.id || item?.id || storageJSON(item), item)
  return { ...backup, ...current, version: 1, book: { ...backup.book, ...current.book }, annotations: [...annotations.values()], progress: current.progress || backup.progress, migration: { ...backup.migration, ...current.migration } }
}
const recoverShelfRecord = async (book: any, roots: string[], startedAt: number) => {
  const key = book.dataId || book.url
  if (!key) return false
  const name = getRecordKey(key)
  const current = await pluginStorageAdapter.read(name)
  const raw = current.value as any
  const needsRewrite = current.found && (raw?.storageVersion === 2 || raw?.version === undefined)
  let candidate: BookRecord | undefined
  const sources: string[] = []

  if (current.found) {
    candidate = decodeStored<BookRecord>(name, raw)
    if (candidate.migration?.backupRecovery === BACKUP_RECOVERY) {
      diagnosticLog('debug', 'recovery.record.skipped', { key: name, reason: 'already-recovered' })
      return false
    }
  }

  // Current record > live URL alias > newer backup > older backup.
  if (book.url && book.url !== key) {
    const source = getRecordKey(book.url)
    const alias = await pluginStorageAdapter.read(source)
    if (alias.found) {
      const value = decodeStored<BookRecord>(name, alias.value)
      candidate = candidate ? mergeRecoveryRecords(candidate, value) : value
      sources.push(source)
    }
  }
  for (const root of roots) for (const alias of [...new Set([key, book.url].filter(Boolean))]) {
    const source = `backups/storage-v1/${root}/${getRecordKey(alias)}`
    const backup = await pluginStorageAdapter.read(source)
    if (!backup.found) continue
    const value = decodeStored<BookRecord>(name, backup.value)
    candidate = candidate ? mergeRecoveryRecords(candidate, value) : value
    sources.push(source)
  }

  if (!candidate || (!sources.length && !needsRewrite)) {
    diagnosticLog('debug', 'recovery.record.skipped', { key: name, reason: 'no-source' })
    return false
  }
  diagnosticLog('info', 'recovery.record.source', { key: name, sources })
  return storageEngine.recover(bookRecordKey(key), candidate, `backups/before-recovery/${startedAt}/${name}`)
}

/** One-time best-effort repair before readers mount, never from sync notifications. */
export const recoverBackupRecords = async () => {
  if (recoveryTask) return recoveryTask
  recoveryTask = (async () => {
    const startedAt = Date.now()
    const shelf = await loadData<Record<string, any>>('bookshelf.json') || {}
    const roots = (await pluginStorageAdapter.listAll?.('backups/storage-v1') || [])
      .filter(item => item.isDir && /^\d+$/.test(item.name)).map(item => item.name).sort((a, b) => Number(b) - Number(a))
    let restored = 0
    let failed = 0
    let normalized = 0
    let supplemented = 0
    let addedAnnotations = 0
    diagnosticLog('info', 'recovery.start', { books: Object.keys(shelf).length, roots, mode: 'one-time-supplement', migration: BACKUP_RECOVERY })
    for (const book of Object.values(shelf)) {
      const key = book.dataId || book.url
      if (!key) continue
      try {
        const result = await recoverShelfRecord(book, roots, startedAt)
        if (result) {
          restored++
          normalized += Number(result.normalized)
          supplemented += Number(result.supplemented)
          addedAnnotations += result.addedAnnotations
        }
      } catch (error) {
        failed++
        diagnosticLog('error', 'recovery.record.failed', { key: getRecordKey(key), error })
      }
    }
    diagnosticLog('info', 'recovery.done', { written: restored, normalized, supplemented, addedAnnotations, failed, durationMs: Date.now() - startedAt })
    return restored
  })().catch(error => { diagnosticLog('error', 'recovery.failed', { error }); return 0 }).finally(() => { recoveryTask = null })
  return recoveryTask
}
let recoveryTask: Promise<number> | null = null



const pendingTasks = new Set<Promise<unknown>>()
export const trackPending = <T>(task: Promise<T>) => { pendingTasks.add(task); task.then(() => pendingTasks.delete(task), () => pendingTasks.delete(task)); return task }
export const drainPendingTasks = async () => { while (pendingTasks.size) await Promise.allSettled([...pendingTasks]) }

export const PUBLIC_ROOT = '/public/siyuan-sireader'
export const SIYUAN_CLOUD_BASE = '/plugin/private/siyuan-cloud'
const PLUGIN_STORAGE_ROOT = '/data/storage/petal'

const BOOKS_DIR = 'books'
const COVERS_DIR = 'covers'
const RECORDS_DIR = 'records'
const SUPPORTED_BOOK_EXTS = ['epub', 'pdf', 'mobi', 'azw3', 'azw', 'fb2', 'cbz', 'txt'] as const
const getPlugin = () => usePlugin()

export interface BookRecord {
  version: 1
  book: Record<string, any>
  annotations: any[]
  progress?: EmbedPdfProgress
  migration?: Record<string, string>
  updatedAt: number
}

export interface EmbedPdfProgress {
  pageNumber: number
  totalPages: number
  pageCoordinates?: { x: number; y: number }
  updatedAt: number
}

export interface StoredBookRef {
  url: string
  path?: string
  cover?: string
}

export const hash = (str: string) => {
  let value = 0
  for (let i = 0; i < str.length; i++) value = (((value << 5) - value) + str.charCodeAt(i)) | 0
  return Math.abs(value).toString(36)
}

const publicToDataPath = (path = '') => path.startsWith('/public/') ? path.replace('/public/', '/data/public/') : path
const isRemotePath = (path = '') => /^(https?:\/\/|file:\/\/)|^\/plugin\/private\//i.test(path)
const isPublicPath = (path = '') => path.startsWith('/public/') || path.startsWith('/data/public/')
const getRecordKey = (url: string) => `${RECORDS_DIR}/${hash(url)}.json`
const getLegacyEmbedPdfRecordKey = (url: string) => `${RECORDS_DIR}/embedpdf/${hash(url)}.bin`
const operationId = (label: string) => `${label}:${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`}`
const req = (id: string) => { try { return (window as any).require?.(id) } catch { return null } }
const normalizeStoragePath = (storageName = '') => {
  const resolved: string[] = []
  for (const part of storageName.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  return resolved.length ? resolved.join('/') : storageName.replace(/[\/\\]+/g, '')
}
const getPluginStoragePath = (key: string) => `${PLUGIN_STORAGE_ROOT}/${getPlugin().name}/${normalizeStoragePath(key)}`

const pathKind = (path = '') => path.startsWith(SIYUAN_CLOUD_BASE + '/') ? 'siyuan-cloud' : path.startsWith('/public/') || path.startsWith('/data/public/') ? 'public' : /^https?:\/\//i.test(path) ? 'http' : 'storage'
const fileReadTarget = (path: string) => {
  const target = path.startsWith('/public/') ? publicToDataPath(path) : path
  return target.startsWith(`${SIYUAN_CLOUD_BASE}/p/`) ? target.replace(`${SIYUAN_CLOUD_BASE}/p/`, `${SIYUAN_CLOUD_BASE}/d/`) : target
}
const fileReadError = (path: string) => path.startsWith(`${SIYUAN_CLOUD_BASE}/`) ? '思源云盘文件读取失败（可能无权限或文件已失效）' : '文件加载失败'
const bodyPreview = (bytes?: Uint8Array | null) => {
  if (!bytes?.byteLength) return ''
  const text = new TextDecoder().decode(bytes).trim()
  return text.slice(0, 500)
}
const parseApiErrorPayload = (bytes?: Uint8Array | null) => {
  if (!bytes?.byteLength || bytes.byteLength > 4096) return null
  const text = new TextDecoder().decode(bytes).trim()
  if (!text.startsWith('{') || !text.includes('"code"')) return null
  try {
    const payload = JSON.parse(text)
    return typeof payload?.code === 'number' && payload.code !== 0
      ? { code: payload.code, msg: typeof payload.msg === 'string' ? payload.msg : '', data: payload.data, preview: text.slice(0, 500) }
      : null
  } catch { return null }
}

const readFileResponse = async (path: string) => {
  if (!path) return null
  const target = fileReadTarget(path)
  if (path.startsWith(`${SIYUAN_CLOUD_BASE}/p/`)) return fetch(target)
  return fetch('/api/file/getFile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: target }),
  })
}

export const isSupportedBookFile = (name = '') => new RegExp(`\\.(${SUPPORTED_BOOK_EXTS.join('|')})$`, 'i').test(name)
export const filterSupportedBookFiles = (files: File[]) => files.filter(file => isSupportedBookFile(file.name))
export const readDirEntries = async (path: string) => {
  const payload = await readDir(path).catch(() => [] as any)
  return Array.isArray(payload) ? payload : (payload as any)?.data || []
}

const normalizeCloudOpenPath = (path = '/') => `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
const encodeCloudOpenPath = (path: string) => {
  let value = String(path || '')
  try { value = decodeURI(value) } catch {}
  return value.replace(/%(?![0-9a-f]{2})/gi, '%25').replace(/#/g, '%23').replace(/\?/g, '%3F')
}
const parseSiyuanCloudOpenUrl = (value: string) => {
  try {
    const url = new URL(value)
    const path = url.searchParams.get('path')
    return url.protocol === 'siyuan:' && url.hostname === 'plugins' && url.pathname === '/siyuan-cloud/open' && path
      ? `${SIYUAN_CLOUD_BASE}/p${encodeCloudOpenPath(normalizeCloudOpenPath(path))}`
      : ''
  } catch {
    return ''
  }
}

const parseSiyuanCloudProtocolUrl = (value: string) => {
  const match = String(value || '').match(/^siyuan-cloud:\/\/\/(.*)$/i)
  if (!match) return ''
  return `${SIYUAN_CLOUD_BASE}/p${encodeCloudOpenPath(normalizeCloudOpenPath(`/${match[1] || ''}`))}`
}

export const normalizeSiyuanCloudUrl = (value = '') => {
  const openUrl = parseSiyuanCloudOpenUrl(value)
  if (openUrl) return openUrl
  const protocolUrl = parseSiyuanCloudProtocolUrl(value)
  if (protocolUrl) return protocolUrl
  const i = value.indexOf(SIYUAN_CLOUD_BASE)
  if (i < 0) return value
  return encodeCloudOpenPath(value.slice(i))
}

export const readFileBlob = async (path: string) => {
  const startedAt = Date.now()
  const target = fileReadTarget(path)
  const kind = pathKind(path)
  diagnosticLog('debug', 'file.read.start', { path: target, kind })
  try {
    const res = await readFileResponse(path)
    if (!res) {
      diagnosticLog('warn', 'file.read.failed', { path: target, kind, reason: 'empty-response', durationMs: Date.now() - startedAt })
      return null
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    const apiError = parseApiErrorPayload(bytes)
    const contentType = res.headers.get('content-type') || ''
    const base = { path: target, kind, status: res.status, ok: res.ok, contentType, contentLength: bytes.byteLength, durationMs: Date.now() - startedAt }
    if (!res.ok || apiError) {
      diagnosticLog('error', 'file.read.failed', { ...base, ...(apiError ? { apiCode: apiError.code, apiMsg: apiError.msg, bodyPreview: apiError.preview } : { bodyPreview: bodyPreview(bytes) }) })
      return null
    }
    diagnosticLog('debug', 'file.read.response', base)
    return new Blob([bytes], { type: contentType || 'application/octet-stream' })
  } catch (error) {
    diagnosticLog('error', 'file.read.failed', { path: target, kind, reason: 'network-or-read-error', durationMs: Date.now() - startedAt, error })
    return null
  }
}

export const readManagedFile = async (path: string, fallbackName?: string) => {
  const blob = await readFileBlob(path)
  return blob ? new File([blob], fallbackName || path.split(/[/\\]/).pop() || 'file', { type: blob.type || 'application/octet-stream' }) : null
}

export const normalizeNativePath = (value = '') => {
  if (!value) return ''
  const path = req('path')
  const raw = decodeURI(`${value}`).replace(/^file:\/+/, path?.sep === '\\' ? '' : '/')
  return path ? path.normalize(raw) : raw
}

export const createLocalFileRef = (path: string, size: number, lastModified: number) => {
  const normalized = normalizeNativePath(path)
  return {
    name: normalized.split(/[\\/]/).pop() || 'file',
    size,
    type: '',
    lastModified,
    path: normalized,
  } as unknown as File
}

export const materializeNativeFile = (file: File): File => {
  const path = normalizeNativePath((file as any)?.path || (file as any)?._path || '')
  if (!path) return file
  const cached = (file as any)._realFile
  if (cached) return cached
  const fs = req('fs')
  if (!fs) return file
  const realFile = new File([fs.readFileSync(path)], file.name || path.split(/[\\/]/).pop() || 'file', {
    type: file.type || '',
    lastModified: file.lastModified || Date.now(),
  }) as File & { path?: string }
  Object.defineProperty(realFile, 'path', { value: path })
  ;(file as any)._realFile = realFile
  return realFile
}

export const toFileUrl = (value: string | File) => {
  const path = normalizeNativePath(typeof value === 'string' ? value : ((value as any)?.path || (value as any)?._path || ''))
  if (!path) return ''
  return path.startsWith('/') ? `file://${encodeURI(path)}` : `file:///${path.replace(/\\/g, '/').replace(/^\/+/, '')}`
}

export const getBookFileName = (url: string, ext: string) => `${hash(url)}.${ext}`
export const getBookFileDataPath = (url: string, ext: string) => `${PUBLIC_ROOT}/${BOOKS_DIR}/${getBookFileName(url, ext)}`
export const getManagedFileExt = (path = '', fallback = 'bin') => {
  const cleanPath = path.split('?')[0].split('#')[0]
  const ext = cleanPath.split('.').pop()?.trim().toLowerCase()
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : fallback
}
export const getCoverFileDataPath = (url: string, ext = 'jpg') => `${PUBLIC_ROOT}/${COVERS_DIR}/${getBookFileName(url, ext)}`

export const normalizeBookTitle = (title = '') => {
  const trimmed = title.trim()
  if (!trimmed) return ''
  const withoutExt = trimmed.replace(/\.(epub|pdf|mobi|azw3|azw|txt|fb2|cbz)$/i, '')
  return withoutExt.replace(/(?:_[a-z0-9]{4,12}|-\d{14}-[a-z0-9]{7,})$/i, '') || withoutExt || trimmed
}

const compatibilityKey = <T>(key: string): StorageKey<T | null> => ({ name: key, defaultValue: () => null })

export const loadDataState = async <T = any>(key: string, _options: { retries?: number } = {}): Promise<{ found: boolean; value: T | null }> =>
  storageEngine.readState(compatibilityKey<T>(key), true)

export const loadData = async <T = any>(key: string): Promise<T | null> => {
  const state = await loadDataState<T>(key)
  return state.found ? state.value : null
}

export const saveData = async (key: string, data: any) => storageEngine.transact(compatibilityKey<any>(key), [
  { id: operationId('compat:set'), type: 'set', path: [], value: data },
])

export const removeData = async (key: string) => storageEngine.remove(key)

export const saveManagedFile = async (blob: Blob, path: string, name?: string) => writeManagedFile(blob, path, name)

export const bookRecordKey = (url: string): StorageKey<BookRecord> => ({
  name: getRecordKey(url),
  defaultValue: () => ({ version: 1, book: {}, annotations: [], updatedAt: 0 }),
})

export const readBookRecord = async (url: string): Promise<BookRecord | null> => {
  const state = await storageEngine.readState(bookRecordKey(url))
  return state.found ? state.value : null
}
export const transactBookRecord = (url: string, operations: StorageOperation[], onCommit?: (record: BookRecord) => void) =>
  storageEngine.transact(bookRecordKey(url), operations, onCommit)

export const writeBookRecord = (url: string, record: BookRecord) => transactBookRecord(url, [
  { id: operationId('record:replace'), type: 'set', path: [], value: record },
])

export const mergeMigratedBookRecord = (url: string, base: BookRecord | null, candidate: BookRecord) =>
  storageEngine.mutate(bookRecordKey(url), operationId('record:migrate'), latest => {
    if (!base) {
      return {
        ...candidate,
        ...latest,
        book: { ...(candidate.book || {}), ...(latest.book || {}) },
        annotations: mergeAnnotationVersions([], candidate.annotations || [], latest.annotations || []),
        progress: latest.progress || candidate.progress,
        migration: { ...(latest.migration || {}), ...(candidate.migration || {}) },
        updatedAt: Date.now(),
      }
    }
    return {
      ...latest,
      ...candidate,
      book: { ...(candidate.book || {}), ...(latest.book || {}) },
      annotations: mergeAnnotationVersions(base.annotations || [], candidate.annotations || [], latest.annotations || []),
      progress: JSON.stringify(latest.progress) === JSON.stringify(base.progress) ? candidate.progress : latest.progress,
      migration: { ...(latest.migration || {}), ...(candidate.migration || {}) },
      updatedAt: Date.now(),
    }
  })

const annotationId = (item: any) => (item?.annotation || item)?.id
const mergeAnnotationVersions = (base: any[], candidate: any[], latest: any[]) => {
  const entries = (items: any[]) => items.map(item => [annotationId(item), item] as const).filter(([id]) => !!id)
  const baseById = new Map(entries(base))
  const latestById = new Map(entries(latest))
  const result = new Map(entries(candidate))
  for (const [id] of baseById) if (!latestById.has(id)) result.delete(id)
  for (const [id, item] of latestById) {
    const original = baseById.get(id)
    if (!original || JSON.stringify(original) !== JSON.stringify(item)) result.set(id, item)
  }
  const withoutIds = candidate.filter(item => !annotationId(item))
  return [...result.values(), ...withoutIds]
}

export const patchBookRecord = (url: string, patch: Partial<BookRecord>) => transactBookRecord(url, [
  { id: operationId('record:patch'), type: 'patch', path: [], value: { ...patch, updatedAt: Date.now() } },
])

export const upsertBookAnnotation = (url: string, annotation: any, nestedId = false, onCommit?: (record: BookRecord) => void) => transactBookRecord(url, [
  { id: operationId('annotation:upsert'), type: 'upsert', path: ['annotations'], itemKey: nestedId ? 'annotation.id' : 'id', value: annotation },
  { id: operationId('record:touch'), type: 'set', path: ['updatedAt'], value: Date.now() },
], onCommit)

export const deleteBookAnnotation = (url: string, id: string, nestedId = false, onCommit?: (record: BookRecord) => void) => transactBookRecord(url, [
  { id: operationId('annotation:delete'), type: 'delete', path: ['annotations'], itemKey: nestedId ? 'annotation.id' : 'id', itemValue: id },
  { id: operationId('record:touch'), type: 'set', path: ['updatedAt'], value: Date.now() },
], onCommit)

export const removeBookRecord = async (url: string) => {
  return storageEngine.remove(getRecordKey(url))
}

export const touchBookRecordFiles = async (keys: string[]) => {
  const unique = [...new Set(keys.filter(Boolean))]
  if (!unique.length) return 0
  const roots = [
    ...(await pluginStorageAdapter.listAll?.('backups/storage-v1') || []).filter(item => item.isDir).map(item => `backups/storage-v1/${item.name}`),
    ...(await pluginStorageAdapter.listAll?.('backups/before-recovery') || []).filter(item => item.isDir).map(item => `backups/before-recovery/${item.name}`),
  ]
  const paths = unique.flatMap(key => { const name = getRecordKey(key); return [name, ...roots.map(root => `${root}/${name}`)] })
  let touched = 0
  for (let i = 0; i < paths.length; i += 6) {
    touched += (await Promise.all(paths.slice(i, i + 6).map(async path => {
      try {
        const stored = await pluginStorageAdapter.read(path)
        if (!stored.found) return false
        await pluginStorageAdapter.write(path, decodeStored<BookRecord>('records/' + path.split('/records/').pop(), stored.value))
        return true
      } catch { return false }
    }))).filter(Boolean).length
  }
  return touched
}
const migratePdfRecordFor = (url: string, pageHeights: number[] = []) => ensurePdfRecordMigrated(url, {
  readRecord: readBookRecord,
  writeRecord: (url, record, base) => mergeMigratedBookRecord(url, base || null, record),
  readLegacyBlob: url => readFileBlob(getPluginStoragePath(getLegacyEmbedPdfRecordKey(url))),
  removeLegacy: url => removeManagedFileTransactionally(getPluginStoragePath(getLegacyEmbedPdfRecordKey(url))),
}, pageHeights)
const writeEmbedPdfRecord = async (url: string, patch: Partial<BookRecord>) => {
  await patchBookRecord(url, patch)
}
export const readEmbedPdfAnnotations = async (url: string, pageHeights: number[] = [], aliases: string[] = []): Promise<any[] | null> => {
  const startedAt = Date.now()
  const primary = await migratePdfRecordFor(url, pageHeights)
  const migratedAliases: string[] = JSON.parse(primary?.migration?.pdfAliases || '[]')
  const keys = [url, ...[...new Set(aliases.filter(key => key && key !== url && !migratedAliases.includes(key)))]]
  const records = [primary, ...await Promise.all(keys.slice(1).map(key => migratePdfRecordFor(key, pageHeights)))]
  const merged = new Map<string, any>()
  records.forEach(record => (record?.annotations || []).forEach(item => {
    const id = (item?.annotation || item)?.id || JSON.stringify(item)
    if (!merged.has(id)) merged.set(id, item)
  }))
  let annotations = merged.size ? [...merged.values()] : null
  if (keys.length > 1 && records.slice(1).some(Boolean)) {
    const saved = await mergeMigratedBookRecord(url, primary, {
      version: 1,
      book: Object.assign({}, ...records.slice().reverse().map(record => record?.book || {})),
      annotations: annotations || [],
      progress: primary?.progress,
      migration: { ...primary?.migration, pdfAliases: JSON.stringify([...migratedAliases, ...keys.slice(1).filter((_, index) => records[index + 1])]) },
      updatedAt: Date.now(),
    })
    annotations = saved.annotations.length ? saved.annotations : null
  }
  diagnosticLog('info', 'pdf.record.read', { key: url, aliases: keys.slice(1), sources: records.map(record => record?.annotations?.length || 0), annotations: annotations?.length || 0, found: records.some(Boolean), durationMs: Date.now() - startedAt })
  // Unsupported legacy items stay on disk; only valid transfer items enter PDFium.
  return annotations?.filter(item => typeof item?.annotation?.type === 'number') || null
}
export const upsertEmbedPdfAnnotation = async (url: string, annotation: any, onCommit?: (record: BookRecord) => void) => {
  const snapshot = cloneStorageValue(annotation)
  const result = await storageEngine.mutate(bookRecordKey(url), 'pdf:upsert', record => {
    const index = record.annotations.findIndex(item => (item.annotation || item).id === snapshot.annotation.id)
    const previous = record.annotations[index]
    const item = { ...previous, ...snapshot }
    const annotations = record.annotations.slice()
    if (index < 0) annotations.push(item)
    else annotations[index] = item
    return { ...record, annotations, updatedAt: Date.now() }
  })
  onCommit?.(result)
  return result
}
export const deleteEmbedPdfAnnotation = (url: string, id: string, onCommit?: (record: BookRecord) => void) => deleteBookAnnotation(url, id, true, onCommit)
export const readEmbedPdfProgress = async (url: string, aliases: string[] = []): Promise<EmbedPdfProgress | null> => {
  const keys = [...new Set([url, ...aliases.filter(Boolean)])]
  const primary = await readBookRecord(url)
  if (primary?.progress) return primary.progress
  const records = await Promise.all(keys.slice(1).map(key => readBookRecord(key)))
  const fallback = records.map(record => record?.progress).filter(Boolean).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null
  if (fallback) {
    const saved = await storageEngine.mutate(bookRecordKey(url), 'pdf:progress:migrate', latest => latest.progress ? latest : { ...latest, progress: fallback, updatedAt: Date.now() })
    diagnosticLog('info', 'pdf.progress.migrated', { key: url, aliases: keys.slice(1), updatedAt: fallback.updatedAt || 0 })
    return saved.progress || null
  }
  return fallback
}
export const writeEmbedPdfProgress = (url: string, progress: EmbedPdfProgress) => writeEmbedPdfRecord(url, { progress })
export const removeManagedFile = async (path = '') => {
  if (!path || path.startsWith('asset://') || isRemotePath(path)) return
  try { await removeManagedFileTransactionally(isPublicPath(path) ? publicToDataPath(path) : path) } catch {}
}

export const saveBookFile = async (file: File, url: string) => {
  const ext = file.name.split('.').pop() || 'bin'
  return saveManagedFile(file, getBookFileDataPath(url, ext))
}

export const saveCoverFile = async (blob: Blob, url: string) => {
  const ext = getManagedFileExt(blob.type.split('/').pop() || '', 'jpg')
  return saveManagedFile(blob, getCoverFileDataPath(url, ext))
}

export const saveOptionalCover = async (blob: Blob | undefined, url: string) => blob ? saveCoverFile(blob, url) : undefined

// 统一读取入口，避免上层重复判断 http / file / public / data 路径。
export const loadBookFile = async (path: string): Promise<File> => {
  path = normalizeSiyuanCloudUrl(path)
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const res = await fetch(path)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    return new File([await res.arrayBuffer()], path.split('/').pop()?.split('?')[0] || 'book', {
      type: res.headers.get('content-type') || 'application/octet-stream',
    })
  }
  if (path.startsWith('file://')) {
    const filePath = decodeURI(path.substring(7)).replace(/^\/([a-zA-Z]:[\\/])/, '$1')
    const fs = req('fs')
    if (fs) return new File([fs.readFileSync(filePath)], filePath.split(/[/\\]/).pop() || 'book')
    throw new Error('本地文件仅支持桌面端')
  }
  const publicPath = path.startsWith('/assets/') || path.startsWith('/public/')
    ? path
    : path.startsWith('assets/') || path.startsWith('public/')
      ? `/${path}`
      : ''
  if (publicPath) {
    const name = path.split(/[/\\]/).pop() || 'book'
    const res = await fetch(publicPath).catch(() => null)
    if (res?.ok) return new File([await res.arrayBuffer()], name, {
      type: res.headers.get('content-type') || 'application/octet-stream',
    })
    if (publicPath.startsWith(PUBLIC_ROOT)) {
      const file = await readManagedFile(publicPath, name)
      if (!file) throw new Error(fileReadError(path))
      return file
    }
    throw new Error(fileReadError(path))
  }
  const blob = await readFileBlob(path)
  if (!blob) throw new Error(fileReadError(path))
  return new File([blob], path.split(/[/\\]/).pop() || 'book', { type: blob.type || 'application/octet-stream' })
}

export const clearStoredPluginData = async (books: StoredBookRef[] = []) => {
  for (const book of books) {
    await Promise.all([removeManagedFile(book.path), removeManagedFile(book.cover), removeBookRecord(book.url)])
  }
  for (const key of ['bookshelf.json', 'settings.json', 'daily.json']) await removeData(key)
}
