import { putFile, readDir, removeFile } from '@/api'
import { usePlugin } from '@/main'
import { ensurePdfRecordMigrated, needsLegacyPdfTextAlign, normalizeEmbedPdfAnnotations, PDF_MIGRATION_VERSION } from './dataMigration'

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

const MISSING_DATA = Symbol('sireader.missingData')

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
const bookRecordCache = new Map<string, BookRecord | null>()
const writeQueues = new Map<string, Promise<void>>()
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
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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

const parseStoredValue = <T = any>(value: any): T | null | typeof MISSING_DATA => {
  if (value == null || value === '') return MISSING_DATA
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T } catch { return value as T }
  }
  return value as T
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

const readPluginStorageRawOnce = async (key: string): Promise<string | typeof MISSING_DATA> => {
  const res = await readFileResponse(getPluginStoragePath(key))
  if (!res?.ok) return MISSING_DATA
  const text = await res.text().catch(() => '')
  if (!text) return MISSING_DATA
  if (isApiErrorPayload(new TextEncoder().encode(text))) return MISSING_DATA
  return text
}

const readPluginStorageRaw = async (key: string, retries = 0): Promise<string | typeof MISSING_DATA> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const raw = await readPluginStorageRawOnce(key)
    if (raw !== MISSING_DATA || attempt === retries) return raw
    await sleep(80 + attempt * 160)
  }
  return MISSING_DATA
}

const putPublicFile = async (blob: Blob, publicPath: string, name?: string) => {
  const dataPath = publicToDataPath(publicPath)
  const dirPath = dataPath.split('/').slice(0, -1).join('/')
  const fileName = name || publicPath.split('/').pop() || 'file'
  const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
  try { await putFile(dirPath, true, new File([], '')) } catch {}
  await putFile(dataPath, false, file)
  return publicPath
}

export const isSupportedBookFile = (name = '') => new RegExp(`\\.(${SUPPORTED_BOOK_EXTS.join('|')})$`, 'i').test(name)
export const filterSupportedBookFiles = (files: File[]) => files.filter(file => isSupportedBookFile(file.name))
export const readDirEntries = async (path: string) => (await readDir(path).catch(() => ({ data: [] as any[] })))?.data || []

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
  } as File
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

export const loadDataState = async <T = any>(key: string, options: { retries?: number } = {}): Promise<{ found: boolean; value: T | null }> => {
  try {
    // Critical reader state bypasses Plugin.data so SiYuan sync changes are visible immediately.
    const raw = await readPluginStorageRaw(key, Math.max(0, Number(options.retries || 0)))
    const value = parseStoredValue<T>(raw)
    return value === MISSING_DATA ? { found: false, value: null } : { found: true, value: value as T }
  } catch {
    return { found: false, value: null }
  }
}

export const loadData = async <T = any>(key: string): Promise<T | null> => {
  const state = await loadDataState<T>(key)
  return state.found ? state.value : null
}

export const saveData = async (key: string, data: any) => {
  const plugin = getPlugin()
  await plugin.saveData(key, data)
  if ((plugin as any).data) (plugin as any).data[key] = data
}

export const removeData = async (key: string) => {
  const plugin = getPlugin()
  await plugin.removeData(key)
  if ((plugin as any).data) delete (plugin as any).data[key]
}

export const saveManagedFile = async (blob: Blob, path: string, name?: string) => putPublicFile(blob, path, name)

export const readBookRecord = async (url: string): Promise<BookRecord | null> => {
  const key = getRecordKey(url)
  if (bookRecordCache.has(key)) return bookRecordCache.get(key) || null
  const record = await loadData<BookRecord>(key)
  bookRecordCache.set(key, record || null)
  return record
}
export const writeBookRecord = async (url: string, record: BookRecord) => {
  const key = getRecordKey(url)
  const task = (writeQueues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    bookRecordCache.set(key, record)
    await saveData(key, record)
  })
  const queued = task.finally(() => {
    if (writeQueues.get(key) === queued) writeQueues.delete(key)
  })
  writeQueues.set(key, queued)
  return task
}
export const removeBookRecord = async (url: string) => {
  const key = getRecordKey(url)
  bookRecordCache.delete(key)
  return removeData(key)
}
const migratePdfRecordFor = (url: string, pageHeights: number[] = []) => ensurePdfRecordMigrated(url, {
  readRecord: readBookRecord,
  writeRecord: writeBookRecord,
  readLegacyBlob: url => readFileBlob(getPluginStoragePath(getLegacyEmbedPdfRecordKey(url))),
  removeLegacy: url => removeFile(getPluginStoragePath(getLegacyEmbedPdfRecordKey(url))),
}, pageHeights)
const writeEmbedPdfRecord = async (url: string, patch: Partial<BookRecord>) => {
  const record = await readBookRecord(url)
  await writeBookRecord(url, { version: 1, book: record?.book || {}, annotations: record?.annotations || [], progress: record?.progress, ...patch, migration: { ...(record?.migration || {}), pdfAnnotations: PDF_MIGRATION_VERSION }, updatedAt: Date.now() })
}
export const readEmbedPdfAnnotations = async (url: string, pageHeights: number[] = []): Promise<any[] | null> => {
  const record = await migratePdfRecordFor(url, pageHeights)
  if (!record) return null
  return record.annotations.length ? (record.migration?.pdfAnnotations === PDF_MIGRATION_VERSION || needsLegacyPdfTextAlign(record.annotations) ? record.annotations : normalizeEmbedPdfAnnotations(record.annotations)) : null
}
export const writeEmbedPdfAnnotations = (url: string, annotations: any[]) => writeEmbedPdfRecord(url, { annotations: normalizeEmbedPdfAnnotations(annotations) })
export const readEmbedPdfProgress = async (url: string): Promise<EmbedPdfProgress | null> => {
  const record = await readBookRecord(url)
  return record?.progress || null
}
export const writeEmbedPdfProgress = (url: string, progress: EmbedPdfProgress) => writeEmbedPdfRecord(url, { progress })
export const removeManagedFile = async (path = '') => {
  if (!path || path.startsWith('asset://') || isRemotePath(path)) return
  try { await removeFile(isPublicPath(path) ? publicToDataPath(path) : path) } catch {}
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
