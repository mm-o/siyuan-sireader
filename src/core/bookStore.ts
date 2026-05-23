import { putFile, readDir, removeFile } from '@/api'
import { usePlugin } from '@/main'

export const PUBLIC_ROOT = '/public/siyuan-sireader'
export const PUBLIC_DATA_ROOT = '/data/public/siyuan-sireader'
export const DB_KEYS = ['reader.db', 'reader.last-good.db'] as const

const BOOKS_DIR = 'books'
const COVERS_DIR = 'covers'
const RECORDS_DIR = 'records'
const SUPPORTED_BOOK_EXTS = ['epub', 'pdf', 'mobi', 'azw3', 'azw', 'fb2', 'cbz', 'txt'] as const
const decoder = new TextDecoder()
const getPlugin = () => usePlugin()

export interface BookRecord {
  version: 1
  book: Record<string, any>
  annotations: any[]
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
const isRemotePath = (path = '') => /^(https?:\/\/|file:\/\/|openlist:\/\/)/i.test(path)
const isPublicPath = (path = '') => path.startsWith('/public/') || path.startsWith('/data/public/')
const getRecordKey = (url: string) => `${RECORDS_DIR}/${hash(url)}.json`
const req = (id: string) => { try { return (window as any).require?.(id) } catch { return null } }

const isApiErrorPayload = (bytes?: Uint8Array | null) => {
  if (!bytes?.byteLength || bytes.byteLength > 512) return false
  const text = decoder.decode(bytes).trim()
  if (!text.startsWith('{') || !text.includes('"code"')) return false
  try {
    const payload = JSON.parse(text)
    return typeof payload?.code === 'number' && payload.code !== 0
  } catch {
    return false
  }
}

const parseStoredValue = <T = any>(value: any): T | null => {
  if (value == null || value === '') return null
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

const putPublicFile = async (blob: Blob, publicPath: string, name?: string) => {
  const dataPath = publicToDataPath(publicPath)
  const dirPath = dataPath.split('/').slice(0, -1).join('/')
  const fileName = name || publicPath.split('/').pop() || 'file'
  const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
  try { await putFile(dirPath, true, new File([], '')) } catch {}
  await putFile(dataPath, false, file)
  return publicPath
}

export const readDirEntries = async (path: string) => (await readDir(path).catch(() => ({ data: [] as any[] })))?.data || []
export const isSupportedBookFile = (name = '') => new RegExp(`\\.(${SUPPORTED_BOOK_EXTS.join('|')})$`, 'i').test(name)
export const filterSupportedBookFiles = (files: File[]) => files.filter(file => isSupportedBookFile(file.name))

export const readFileText = async (path: string) => {
  const res = await readFileResponse(path)
  const text = res?.ok ? await res.text().catch(() => '') : ''
  return text && !isApiErrorPayload(new TextEncoder().encode(text)) ? text : ''
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

export const readFileBytes = async (path: string) => {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) {
    const res = await fetch(path)
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null
  }
  if (path.startsWith('file://')) return null
  const res = await readFileResponse(path)
  if (!res?.ok) return null
  const bytes = new Uint8Array(await res.arrayBuffer())
  return isApiErrorPayload(bytes) ? null : bytes
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

export const loadData = async <T = any>(key: string): Promise<T | null> => {
  try {
    return parseStoredValue<T>(await getPlugin().loadData(key))
  } catch {
    return null
  }
}

export const saveData = async (key: string, data: any) => {
  await getPlugin().saveData(key, data)
}

export const removeData = async (key: string) => {
  await getPlugin().removeData(key)
}

export const saveManagedFile = async (blob: Blob, path: string, name?: string) => putPublicFile(blob, path, name)

export const readBookRecord = async (url: string): Promise<BookRecord | null> => loadData<BookRecord>(getRecordKey(url))
export const writeBookRecord = async (url: string, record: BookRecord) => saveData(getRecordKey(url), record)
export const removeBookRecord = async (url: string) => removeData(getRecordKey(url))

export const removeManagedFile = async (path = '') => {
  if (!path || path.startsWith('asset://') || isRemotePath(path)) return
  try { await removeFile(isPublicPath(path) ? publicToDataPath(path) : path) } catch {}
}

export const cleanupManagedStorage = async (books: StoredBookRef[]) => {
  const keep = new Set(
    books
      .flatMap(book => [book.path || '', book.cover || ''])
      .filter(path => path.startsWith(PUBLIC_ROOT))
      .map(publicToDataPath),
  )
  for (const dir of [`${PUBLIC_DATA_ROOT}/${BOOKS_DIR}`, `${PUBLIC_DATA_ROOT}/${COVERS_DIR}`]) {
    for (const file of await readDirEntries(dir)) {
      const path = `${dir}/${file.name || ''}`
      if (!file.isDir && !keep.has(path)) try { await removeFile(path) } catch {}
    }
  }
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
  if (path.startsWith('openlist://')) {
    const [{ parseOpenListBookUrl, downloadOpenListFile }, { settingsManager }] = await Promise.all([
      import('@/services/openlist'),
      import('@/composables/useSetting'),
    ])
    const ref = parseOpenListBookUrl(path)
    if (!ref) throw new Error('OpenList 路径无效')
    const settings = await settingsManager.get()
    const account = settings.cloudAccounts?.find(item => item.id === ref.accountId)
    if (!account) throw new Error('OpenList 账号不存在，请检查云盘账号设置')
    return downloadOpenListFile(account, ref.path)
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
  for (const key of ['bookshelf.json', 'settings.json', 'daily.json', 'migrated.json']) await removeData(key)
  for (const key of DB_KEYS) await removeData(key)
}
