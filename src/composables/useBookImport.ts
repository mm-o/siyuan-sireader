import { computed, ref } from 'vue'
import { bookshelfManager } from '@/core/bookshelf'
import { createLocalFileRef, filterSupportedBookFiles, materializeNativeFile, toFileUrl } from '@/core/bookStore'

export interface LinkedBookFile {
  file?: File
  linkSource: string
  label?: string
  size?: number
  preview?: any
}

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

type ImportMode = 'file' | 'link' | 'cloud'

const nextId = () => `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const asLines = (input: string) => input.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
const req = (id: string) => { try { return (window as any).require?.(id) } catch { return null } }
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
const createVirtualFile = (name: string) => new File([], name || 'book', { type: 'application/octet-stream' })
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
  const fs = getFs()
  if (!fs) return createItem('url', value, value, value)
  try {
    const file = createLocalFileRef(value, 0, 0)
    const stats = fs.statSync((file as any).path)
    Object.assign(file, { size: stats.size, lastModified: stats.mtimeMs })
    return createItem('file', file, value, toFileUrl(file))
  } catch {
    return createItem('url', value, value, value)
  }
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
      item => item.mode === 'file'
        ? bookshelfManager.previewLocalBook(getImportFile(item))
        : bookshelfManager.previewUrlBook(item.source as string),
      3,
    )
  }

  const parseFiles = async (files: File[]) => {
    const validFiles = filterSupportedBookFiles(files)
    if (!validFiles.length) return
    await parseItems(
      validFiles.map(file => createItem('file', file, file.name, toFileUrl(file))),
      item => bookshelfManager.previewLocalBook(getImportFile(item)),
      validFiles.length > 8 ? 5 : 3,
    )
  }

  const parseLinkedFiles = async (files: LinkedBookFile[]) => {
    const validFiles = files.filter(item => {
      const name = item.file?.name || item.label || item.linkSource
      return item.linkSource && filterSupportedBookFiles([item.file || createVirtualFile(name)]).length
    })
    if (!validFiles.length) return
    const next = validFiles.map(item => {
      const label = item.label || item.file?.name || item.linkSource.split('/').pop() || 'book'
      const row = createItem('file', item.file || createVirtualFile(label), label, item.linkSource)
      if (item.preview) {
        row.preview = item.preview
        row.loading = false
      }
      return row
    })
    if (next.every(item => item.preview)) {
      items.value.forEach(revokeCover)
      items.value = next
      progress.value = 100
      return
    }
    await parseItems(
      next,
      item => item.preview || bookshelfManager.previewLocalBook(getImportFile(item)),
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

  const parseDraftUrls = () => parseUrls()

  const importSelected = async (mode: ImportMode = 'file') => {
    const selected = items.value.filter(item => item.selected && !item.loading && !item.error)
    if (!selected.length) return { success: 0, failed: 0 }
    importing.value = true
    progress.value = 0
    let success = 0
    let failed = 0
    let done = 0
    const concurrency = mode === 'file' ? (selected.length > 8 ? 3 : 2) : 4
    const importFile = {
      file: (item: BookImportItem) => bookshelfManager.addLocalBook(getImportFile(item), item.preview),
      link: (item: BookImportItem) => bookshelfManager.addLocalLinkBook(getImportFile(item), item.preview),
      cloud: (item: BookImportItem) => bookshelfManager.addLinkedBook(item.linkSource, getImportFile(item), item.preview),
    } satisfies Record<ImportMode, (item: BookImportItem) => Promise<void>>

    await chunked(selected, concurrency, async item => {
      try {
        if (item.mode === 'url') await bookshelfManager.addUrlBook(item.linkSource, undefined, undefined, item.preview)
        else if (mode === 'file' || item.linkSource) await importFile[mode](item)
        else throw new Error('当前环境不支持以链接方式导入本地文件')
        item.error = ''
        success++
      } catch (error) {
        item.error = error instanceof Error ? error.message : '导入失败'
        failed++
      } finally {
        progress.value = Math.round((++done / selected.length) * 100)
      }
    })

    importing.value = false
    return { success, failed }
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
    parseFiles,
    parseLinkedFiles,
    parseDraftUrls,
    importSelected,
    importFiles,
  }
}
