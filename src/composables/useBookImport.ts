import { computed, ref } from 'vue'
import { buildBookMetadata, bookshelfManager, dataIdFromFingerprint, fileFingerprint, hasBookBulkPatch, type BookBulkPatch, type BookFormat, urlFingerprint } from '@/core/bookshelf'
import { createLocalFileRef, filterSupportedBookFiles, materializeNativeFile, normalizeBookTitle, saveBookFile, saveCoverFile, toFileUrl } from '@/core/bookStore'

export interface BookImportItem {
  id: string
  mode: 'url' | 'file'
  source: string | File
  linkSource: string
  label: string
  selected: boolean
  loading: boolean
  error: string
  preview: any | null
}

type ImportMode = 'file' | 'link'
type DownloadProgress = (message: string) => void

export interface RemoteBookInfo {
  title?: string
  author?: string
  format?: BookFormat
  intro?: string
  language?: string
  publisher?: string
  published?: string
  identifier?: string
  series?: string
  sourceName?: string
  fileSize?: string
  tags?: string[]
}

export interface RemoteDownloadRequest {
  url: string
  fileName: string
  headers?: Array<{ name: string; value: string }>
  coverUrl?: string
  bookInfo?: RemoteBookInfo
  onProgress?: DownloadProgress
}

export interface OnlineBookImportInfo extends RemoteBookInfo {
  url: string
  readUrl: string
  coverUrl?: string
  downloadUrl?: string
}

const nextId = () => `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const asLines = (input: string) => input.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
const req = (id: string) => { try { return (window as any).require?.(id) } catch { return null } }
const cleanLink = (value: string) => (value.includes('](') ? value.slice(value.indexOf('](') + 2).replace(/(^|[^\\])\).*$/, '$1').replace(/\\([()\\])/g, '$1') : value).trim().replace(/^<|>$/g, '')
const resolveItemUrl = async (item: BookImportItem) => {
  const url = cleanLink(item.linkSource)
  item.source = item.linkSource = url
  return url
}
const getElectron = () => req('electron')?.remote || req('@electron/remote')
const getFs = () => req('fs')
const pickByInput = () => new Promise<File[]>((resolve) => {
  const input = Object.assign(document.createElement('input'), {
    type: 'file',
    multiple: true,
    accept: '.epub,.pdf,.mobi,.azw3,.azw,.fb2,.cbz,.txt',
  }) as HTMLInputElement
  input.onchange = () => resolve(Array.from(input.files || []))
  input.click()
})
const chunked = async <T>(items: T[], limit: number, task: (item: T, index: number) => Promise<void>) => {
  for (let i = 0; i < items.length; i += limit) await Promise.all(items.slice(i, i + limit).map(task))
}
const revokeCover = (item: BookImportItem) => item.preview?.cover?.startsWith?.('blob:') && URL.revokeObjectURL(item.preview.cover)
const getImportFile = (item: BookImportItem) => materializeNativeFile(item.source as File)
const formatBytes = (value: number) => {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value, index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`
}
const parseSizeText = (value = '') => {
  const match = value.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB|B)/i)
  if (!match) return 0
  return Number(match[1]) * ({ B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[match[2].toUpperCase()] || 1)
}
const assertBookFile = async (file: File, format: BookFormat, expectedSizeText = '') => {
  const expected = parseSizeText(expectedSizeText)
  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer())
  const textHead = new TextDecoder().decode(head).trim().toLowerCase()
  const brief = textHead.replace(/\s+/g, ' ').slice(0, 120)
  if (expected && file.size < Math.max(8192, expected * 0.2)) throw new Error(`下载内容不完整：${formatBytes(file.size)} / ${expectedSizeText}，文件头=${brief || '-'}`)
  if (textHead.startsWith('<!doctype') || textHead.startsWith('<html') || textHead.includes('<html')) throw new Error(`下载内容不是书籍文件，文件头=${brief || '-'}`)
  if (format === 'epub' && !(head[0] === 0x50 && head[1] === 0x4b)) throw new Error(`下载内容不是有效 EPUB，文件头=${brief || '-'}`)
  if (format === 'pdf' && !textHead.startsWith('%pdf')) throw new Error(`下载内容不是有效 PDF，文件头=${brief || '-'}`)
}
const importTags = (info?: RemoteBookInfo) => info?.tags || [info?.sourceName, info?.language, info?.published].filter(Boolean)
const remoteMetadata = (info?: RemoteBookInfo) => buildBookMetadata({ publisher: info?.publisher, published: info?.published, language: info?.language, identifier: info?.identifier, intro: info?.intro, series: info?.series, sourceName: info?.sourceName, fileSize: info?.fileSize })
const downloadCover = async (url = '', bookUrl: string) => {
  if (!url) return ''
  const { httpSourceManager } = await import('@/utils/HttpSources')
  const blob = await httpSourceManager.downloadCover(url)
  return blob ? saveCoverFile(blob, bookUrl) : ''
}
const toAbsoluteUrl = (url: string, base = '') => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('//')) return `https:${url}`
  try { return new URL(url, base).toString() } catch { return url }
}
const createItem = (mode: BookImportItem['mode'], source: string | File, label: string, linkSource: string): BookImportItem => ({
  id: nextId(),
  mode,
  source,
  linkSource,
  label,
  selected: true,
  loading: true,
  error: '',
  preview: null,
})
const toDraftItem = (value: string) => {
  const url = cleanLink(value)
  const fs = getFs()
  if (!fs) return createItem('url', url, value, url)
  try {
    const file = createLocalFileRef(url, 0, 0)
    const stats = fs.statSync((file as any).path)
    Object.assign(file, { size: stats.size, lastModified: stats.mtimeMs })
    return createItem('file', file, value, toFileUrl(file))
  } catch {
    return createItem('url', url, value, url)
  }
}

const nodeDownloadFile = ({ url, fileName, headers = [], onProgress }: RemoteDownloadRequest, redirects = 0): Promise<File> => {
  const req = (window as any).require
  if (!req || redirects > 5) return Promise.reject(new Error('Node download unavailable'))
  const client = req(new URL(url).protocol === 'http:' ? 'http' : 'https')
  const requestHeaders = Object.fromEntries(headers.map(header => [header.name, header.value]))
  return new Promise((resolve, reject) => {
    const request = client.get(url, { headers: requestHeaders }, (response: any) => {
      const status = Number(response.statusCode || 0)
      const location = response.headers?.location
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.resume()
        nodeDownloadFile({ url: toAbsoluteUrl(location, url), fileName, headers, onProgress }, redirects + 1).then(resolve, reject)
        return
      }
      if (status < 200 || status >= 300) {
        response.resume()
        reject(new Error(`HTTP ${status}: ${response.statusMessage || '下载失败'}`))
        return
      }
      const total = Number(response.headers?.['content-length'] || 0)
      const chunks: Uint8Array[] = []
      let loaded = 0
      response.on('data', (chunk: Uint8Array) => {
        chunks.push(chunk)
        loaded += chunk.byteLength
        onProgress?.(total ? `下载中 ${Math.floor((loaded / total) * 100)}%` : `下载中 ${formatBytes(loaded)}`)
      })
      response.on('end', () => resolve(new File(chunks as BlobPart[], fileName, { type: String(response.headers?.['content-type'] || 'application/octet-stream') })))
    })
    request.on('error', reject)
    request.setTimeout(30000, () => request.destroy(new Error('下载超时')))
  })
}

export const importRemoteBook = async (request: RemoteDownloadRequest) => {
  if (!request.url) throw new Error('无效的下载链接')
  request.onProgress?.('连接下载...')
  const file = await nodeDownloadFile(request)
  const format = (request.bookInfo?.format || file.name.split('.').pop()?.toLowerCase() || 'epub') as BookFormat
  await assertBookFile(file, format, request.bookInfo?.fileSize)
  const info = request.bookInfo
  const source = info?.title && !file.name.toLowerCase().split('?')[0].endsWith(`.${format}`)
    ? new File([file], `${normalizeBookTitle(info.title) || 'book'}.${format}`, { type: file.type || 'application/octet-stream' })
    : file
  const fingerprint = await fileFingerprint(source), dataId = await dataIdFromFingerprint(fingerprint)
  const path = await saveBookFile(source, request.url)
  const cover = await downloadCover(request.coverUrl, request.url)
  await bookshelfManager.addBook({ url: request.url, title: normalizeBookTitle(info?.title || source.name.replace(/\.[^.]+$/, '')) || info?.title || source.name, author: info?.author || '未知作者', cover, format, path, size: source.size, tags: importTags(info), metadata: remoteMetadata(info), dataId, fingerprint })
}

export const addOnlineBookToShelf = async (info: OnlineBookImportInfo) => {
  const cover = await downloadCover(info.coverUrl, info.url)
  const meta = { ...remoteMetadata(info), downloadUrl: info.downloadUrl }
  const fingerprint = urlFingerprint(info.url), dataId = await dataIdFromFingerprint(fingerprint)
  const payload = { title: normalizeBookTitle(info.title) || info.title, author: info.author || '未知作者', cover, format: info.format || 'epub', path: info.readUrl, size: 0, tags: importTags(info) }
  const existing = await bookshelfManager.getBook(info.url)
  if (existing) return bookshelfManager.updateBook(info.url, { ...payload, cover: cover || existing.cover, meta: { ...(existing.meta || {}), ...meta } })
  return bookshelfManager.addBook({ url: info.url, ...payload, metadata: meta, dataId, fingerprint })
}

export const useBookImport = () => {
  const items = ref<BookImportItem[]>([])
  const draft = ref('')
  const parsing = ref(false)
  const importing = ref(false)
  const progress = ref(0)

  const reset = () => {
    items.value.forEach(revokeCover)
    items.value = []
    draft.value = ''
    parsing.value = false
    importing.value = false
    progress.value = 0
  }

  // 统一解析队列，负责预览、错误和进度。
  const parseItems = async (next: BookImportItem[], worker: (item: BookImportItem) => Promise<any>, concurrency = 3) => {
    parsing.value = true
    progress.value = 0
    items.value.forEach(revokeCover)
    items.value = next
    const queue = items.value
    let done = 0
    await chunked(queue, concurrency, async item => {
      try {
        item.preview = await worker(item)
        item.error = ''
      } catch (error) {
        item.preview = null
        item.error = error instanceof Error ? error.message : '解析失败'
        item.selected = false
      } finally {
        item.loading = false
        progress.value = Math.round((++done / next.length) * 100)
      }
    })
    queue.forEach(item => { item.loading = false })
    parsing.value = false
  }

  const parseUrls = async (input = draft.value) => {
    const urls = asLines(input)
    if (!urls.length) return
    draft.value = input
    const next = urls.map(toDraftItem)
    await parseItems(
      next,
      async item => item.mode === 'file'
        ? bookshelfManager.previewLocalBook(item.source as File)
        : bookshelfManager.previewUrlBook(await resolveItemUrl(item)),
      3,
    )
  }

  const parseFiles = async (files: File[]) => {
    const validFiles = filterSupportedBookFiles(files)
    if (!validFiles.length) return
    await parseItems(
      validFiles.map(file => createItem('file', file, file.name, toFileUrl(file))),
      item => bookshelfManager.previewLocalBook(item.source as File),
      validFiles.length > 8 ? 5 : 3,
    )
  }

  const selectFiles = async () => {
    const electron = getElectron()
    if (!electron) return pickByInput()
    const fs = getFs()
    if (!fs) return pickByInput()
    const result = await electron.dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Books', extensions: ['epub', 'pdf', 'mobi', 'azw3', 'azw', 'fb2', 'cbz', 'txt'] }],
    })
    if (result.canceled || !result.filePaths.length) return []
    return result.filePaths.map((path: string) => {
      const stats = fs.statSync(path)
      return createLocalFileRef(path, stats.size, stats.mtimeMs)
    })
  }

  const pickAndParseFiles = async () => {
    const files = await selectFiles()
    if (files.length) await parseFiles(files)
    return files
  }

  const parseDraftUrls = (input = draft.value) => parseUrls(input)

  const importSelected = async (mode: ImportMode = 'file', patch?: BookBulkPatch) => {
    const selected = items.value.filter(item => item.selected && !item.loading && !item.error)
    if (!selected.length) return { success: 0, failed: 0, urls: [] as string[] }
    importing.value = true
    let success = 0
    let failed = 0
    const urls: string[] = []
    const concurrency = mode === 'file' || selected.some(item => item.mode === 'file') ? 1 : 4
    const importFile = {
      file: (item: BookImportItem) => bookshelfManager.addLocalBook(getImportFile(item), item.preview),
      link: (item: BookImportItem) => bookshelfManager.addLocalLinkBook(item.source as File, item.preview),
    } satisfies Record<ImportMode, (item: BookImportItem) => Promise<string>>

    try {
      await chunked(selected, concurrency, async item => {
        item.loading = true
        try {
          let url = ''
          if (item.mode === 'url') url = await bookshelfManager.addUrlBook(item.linkSource, undefined, undefined, item.preview)
          else if (mode === 'file' || item.linkSource) url = await importFile[mode](item)
          else throw new Error('当前环境不支持以链接方式导入本地文件')
          item.error = ''
          if (url) urls.push(url)
          success++
        } catch (error) {
          item.error = error instanceof Error ? error.message : '导入失败'
          failed++
        } finally {
          item.loading = false
        }
      })

      if (urls.length && hasBookBulkPatch(patch)) await bookshelfManager.batchUpdateBooks(urls, patch!)

      return { success, failed, urls }
    } finally {
      importing.value = false
    }
  }

  // 拖拽导入直接入库，不经过预览列表。
  const importFiles = async (files: File[]) => {
    const validFiles = filterSupportedBookFiles(files)
    if (!validFiles.length) return { success: 0, failed: 0 }
    return bookshelfManager.uploadBooks(validFiles)
  }

  const selectedCount = computed(() => items.value.filter(item => item.selected && !item.error).length)
  const linkSelectedCount = computed(() => items.value.filter(item => item.selected && !item.error && item.linkSource).length)
  const hasItems = computed(() => !!items.value.length)
  const allSelected = computed({
    get: () => !!items.value.length && items.value.every(item => item.error || item.selected),
    set: (value: boolean) => { items.value.forEach(item => { if (!item.error) item.selected = value }) },
  })

  return {
    items,
    draft,
    parsing,
    importing,
    progress,
    hasItems,
    selectedCount,
    linkSelectedCount,
    allSelected,
    reset,
    pickAndParseFiles,
    parseDraftUrls,
    importSelected,
    importFiles,
  }
}
