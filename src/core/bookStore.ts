import { readDir } from '@/api'
import { usePlugin } from '@/main'
import { ensurePdfRecordMigrated, needsLegacyPdfTextAlign, normalizeEmbedPdfAnnotations, PDF_MIGRATION_VERSION } from './dataMigration'
import { storageEngine, type StorageKey } from './storage/engine'
import type { StorageOperation } from './storage/types'
import { removeManagedFileTransactionally, writeManagedFile } from './storage/files'

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

const hash = (str: string) => {
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

const isApiErrorPayload = (bytes?: Uint8Array | null) => {
  if (!bytes?.byteLength || bytes.byteLength > 512) return false
  const text = new TextDecoder().decode(bytes).trim()
  if (!text.startsWith('{') || !text.includes('"code"')) return false
  try {
    const payload = JSON.parse(text)
    return typeof payload?.code === 'number' && payload.code !== 0 && 'msg' in payload && 'data' in payload
  } catch {
    return false
  }
}

const readFileResponse = async (path: string) => {
  if (!path) return null
  const target = path.startsWith('/public/') ? publicToDataPath(path) : path
  return fetch('/api/file/getFile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: target }),
  }).catch(() => null)
}

export const isSupportedBookFile = (name = '') => new RegExp(`\\.(${SUPPORTED_BOOK_EXTS.join('|')})$`, 'i').test(name)
export const filterSupportedBookFiles = (files: File[]) => files.filter(file => isSupportedBookFile(file.name))
export const readDirEntries = async (path: string) => ((await readDir(path).catch(() => ({ data: [] as any[] }))) as any)?.data || []

const normalizeCloudOpenPath = (path = '/') => `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
const encodeCloudOpenPath = (path: string) => decodeURI(encodeURI(path)).replace(/#/g, '%23').replace(/\?/g, '%3F')
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

export const normalizeSiyuanCloudUrl = (value = '') => {
  const openUrl = parseSiyuanCloudOpenUrl(value)
  if (openUrl) return openUrl
  const i = value.indexOf(SIYUAN_CLOUD_BASE)
  return i >= 0 ? value.slice(i) : value
}

export const readFileBlob = async (path: string) => {
  const res = await readFileResponse(path)
  if (!res?.ok) return null
  const blob = await res.blob().catch(() => null)
  if (!blob) return null
  if (blob.size <= 512) {
    const text = await blob.text().catch(() => '')
    if (text && isApiErrorPayload(new TextEncoder().encode(text))) return null
  }
  return blob
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
  return withoutExt.replace(/_[a-z0-9]{4,12}$/i, '') || withoutExt || trimmed
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
const migratePdfRecordFor = (url: string, pageHeights: number[] = []) => ensurePdfRecordMigrated(url, {
  readRecord: readBookRecord,
  writeRecord: (url, record, base) => mergeMigratedBookRecord(url, base || null, record),
  readLegacyBlob: url => readFileBlob(getPluginStoragePath(getLegacyEmbedPdfRecordKey(url))),
  removeLegacy: url => removeManagedFileTransactionally(getPluginStoragePath(getLegacyEmbedPdfRecordKey(url))),
}, pageHeights)
const writeEmbedPdfRecord = async (url: string, patch: Partial<BookRecord>) => {
  const record = await readBookRecord(url)
  await patchBookRecord(url, { ...patch, migration: { ...(record?.migration || {}), pdfAnnotations: PDF_MIGRATION_VERSION } })
}
export const readEmbedPdfAnnotations = async (url: string, pageHeights: number[] = []): Promise<any[] | null> => {
  const record = await migratePdfRecordFor(url, pageHeights)
  if (!record) return null
  return record.annotations.length ? (record.migration?.pdfAnnotations === PDF_MIGRATION_VERSION || needsLegacyPdfTextAlign(record.annotations) ? record.annotations : normalizeEmbedPdfAnnotations(record.annotations)) : null
}
export const writeEmbedPdfAnnotations = (url: string, annotations: any[]) => writeEmbedPdfRecord(url, { annotations: normalizeEmbedPdfAnnotations(annotations) })
export const upsertEmbedPdfAnnotation = (url: string, annotation: any, onCommit?: (record: BookRecord) => void) => upsertBookAnnotation(url, annotation, true, onCommit)
export const deleteEmbedPdfAnnotation = (url: string, id: string, onCommit?: (record: BookRecord) => void) => deleteBookAnnotation(url, id, true, onCommit)
export const readEmbedPdfProgress = async (url: string): Promise<EmbedPdfProgress | null> => {
  const record = await readBookRecord(url)
  return record?.progress || null
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
  if (path.startsWith(`${SIYUAN_CLOUD_BASE}/`)) {
    const res = await fetch(path)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    return new File([await res.arrayBuffer()], path.split('/').pop()?.split('?')[0] || 'book', {
      type: res.headers.get('content-type') || 'application/octet-stream',
    })
  }
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
      if (!file) throw new Error('文件加载失败')
      return file
    }
    throw new Error('文件加载失败')
  }
  const blob = await readFileBlob(path)
  if (!blob) throw new Error('文件加载失败')
  return new File([blob], path.split(/[/\\]/).pop() || 'book', { type: blob.type || 'application/octet-stream' })
}

export const clearStoredPluginData = async (books: StoredBookRef[] = []) => {
  for (const book of books) {
    await Promise.all([removeManagedFile(book.path), removeManagedFile(book.cover), removeBookRecord(book.url)])
  }
  for (const key of ['bookshelf.json', 'settings.json', 'daily.json']) await removeData(key)
}
