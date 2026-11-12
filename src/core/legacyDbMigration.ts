import type {
  BookRecord,
  EmbedPdfProgress,
} from './storage'
/**
 * 旧版 SQLite 存储（reader.db）导入当前 JSON 存储。
 *
 * 历史：v0.9.x ~ v1.2.x 把书架/标注写在 `petal/siyuan-sireader/reader.db`（SQLite），
 * v1.3.0 的 `src/utils/migration.ts` 里有一次性导入，v1.3.1 把该文件整份删除，
 * 之后所有版本都不再认识 reader.db，导致旧用户升级后书架为空。
 *
 * 导入语义（幂等 + 合并）：
 * - 数据源：`petal/siyuan-sireader/reader.db`、`reader.last-good.db`，以及老版本迁移后
 *   留下的 `petal/siyuan-sireader-backup/<时间戳>/reader.db`（v1.1.0 / v1.3.0 会删原库）。
 * - 按「数据源路径 + 文件字节数」记录已导入的库；同一份库只导一次，换一份库（比如用户
 *   后来又补了一份更全的 reader.db）会自动再合并一次。
 * - 合并规则：已有的书、已有的标注、已有的进度/设置一律优先，只补缺，不覆盖。
 * - 只读旧库、只写新存储，不删除任何旧文件。
 */
import { showMessage } from 'siyuan'
import { readDir } from '@/api'
import { matchLegacyBook } from './bookshelf'
import { diagnosticLog } from './diagnostics'
import {
  getBookFileDataPath,
  getCoverFileDataPath,
  hash,
  loadData,
  loadDataState,
  normalizeBookTitle,
  readBookRecord,
  saveData,
  trackPending,
  writeBookRecord,
  writeManagedFile,
} from './storage'

const PLUGIN_STORAGE_ROOT = '/data/storage/petal'
const LEGACY_DB_NAMES = ['reader.db', 'reader.last-good.db'] as const
const LEGACY_BACKUP_SUFFIX = '-backup'
const LEGACY_BOOK_EXTS = ['epub', 'pdf', 'mobi', 'azw3', 'azw', 'fb2', 'cbz', 'txt']
const LEGACY_COVER_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']
const MIGRATION_MARKER = 'migrated.json'

interface LegacyBook {
  url: string
  title: string
  author: string
  cover: string
  format: string
  path: string
  size: number
  added: number
  read: number
  finished: number
  status: string
  progress: number
  time: number
  chapter: number
  total: number
  pos: Record<string, any>
  rating: number
  meta: Record<string, any>
  tags: string[]
  groups: string[]
  bindDocId: string
  bindDocName: string
}

type Row = Record<string, any>
interface PluginLike { name: string, i18n?: Record<string, string> }
interface ImportMark { source: string, bytes: number, books?: number, at?: number }

const num = (value: unknown, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback)
const text = (value: unknown, fallback = '') => (value == null ? fallback : String(value))
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value == null || value === '') return fallback
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
const message = (plugin: PluginLike, key: string, fallback: string) => {
  const value = plugin?.i18n?.[key]
  return typeof value === 'string' && value ? value : fallback
}
const annotationIdOf = (item: any) => (item?.annotation || item)?.id

/* ---------------- sql.js（wasm 内联版，按需从插件目录加载，不打包进 index.js） ---------------- */
let sqlFactory: Promise<any> | null = null
const loadSqlJs = (pluginName: string) => sqlFactory ||= new Promise<any>((resolve, reject) => {
  const scope = window as any
  if (typeof scope.initSqlJs === 'function') return resolve(scope.initSqlJs)
  const script = document.createElement('script')
  script.src = `/plugins/${pluginName}/legacy/sql-wasm-inline.js`
  script.async = true
  script.onload = () => typeof scope.initSqlJs === 'function' ? resolve(scope.initSqlJs) : reject(new Error('initSqlJs unavailable'))
  script.onerror = () => reject(new Error('legacy/sql-wasm-inline.js load failed'))
  document.head.appendChild(script)
})

/* ---------------- SQLite 读取助手 ---------------- */
const rows = (db: any, sql: string): Row[] => {
  const result = db.exec(sql)?.[0]
  if (!result) return []
  return result.values.map((values: any[]) => Object.fromEntries(result.columns.map((column: string, index: number) => [column, values[index]])))
}
const columns = (db: any, table: string) => {
  try {
    return rows(db, `PRAGMA table_info(${table})`).map((row) => text(row.name))
  } catch {
    return []
  }
}
const select = (db: any, table: string, wanted: string[], orderBy = '') => {
  const have = columns(db, table)
  if (!have.length) return [] as Row[]
  const usable = wanted.filter((column) => have.includes(column))
  if (!usable.length) return [] as Row[]
  try {
    return rows(db, `SELECT ${usable.join(', ')} FROM ${table}${orderBy ? ` ORDER BY ${orderBy}` : ''}`)
  } catch {
    return [] as Row[]
  }
}

/* ---------------- 旧资源路径 ---------------- */
const storagePathOf = (path = '') => {
  const value = text(path)
  if (!value || /^(?:https?:\/\/|file:\/\/|asset:\/\/|blob:|data:)/i.test(value)) return ''
  if (value.startsWith('/data/public/')) return value
  if (value.startsWith('/public/')) return value.replace(/^\/public\//, '/data/public/')
  if (value.startsWith('/data/')) return value
  return ''
}
const extOf = (path = '', fallback = 'bin') => {
  const ext = text(path).split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() || ''
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : fallback
}

/* 静默读存储文件：404 不写 error 级诊断（启动探测会经常命中不存在的路径）。 */
const readStorageBlob = async (path: string) => {
  try {
    const response = await fetch('/api/file/getFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength && bytes.byteLength < 4096) {
      const head = new TextDecoder().decode(bytes.subarray(0, 64)).trim()
      if (head.startsWith('{') && head.includes('"code"')) return null
    }
    return new Blob([bytes], { type: 'application/octet-stream' })
  } catch { return null }
}

/**
 * v1.1.0 / v1.3.0 的迁移在导入成功后会把 reader.db 从插件目录删掉，
 * 但删之前会整份备份到同级目录 `siyuan-sireader-backup/<时间戳>/`。
 * 这些用户的数据只剩在备份里，所以把最新的几个备份目录也当作数据源。
 */
const backupDatabasePaths = async (pluginName: string) => {
  const root = `${PLUGIN_STORAGE_ROOT}/${pluginName}${LEGACY_BACKUP_SUFFIX}`
  try {
    const payload: any = await readDir(root)
    const entries = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []
    const dirs = entries
      .filter((item: any) => (item?.isDir ?? item?.is_dir) && /^\d+$/.test(String(item?.name || '')))
      .map((item: any) => String(item.name))
      .sort((a: string, b: string) => Number(b) - Number(a))
      .slice(0, 3)
    return dirs.flatMap((dir) => LEGACY_DB_NAMES.map((name) => `${root}/${dir}/${name}`))
  } catch { return [] }
}

/* ---------------- 已导入记录（幂等标记） ---------------- */
const importMarks = (marker: any): ImportMark[] => {
  if (!marker) return []
  if (Array.isArray(marker.imports)) return marker.imports.filter((item: any) => item?.source)
  // 兼容旧标记：{ done: true, source, books }
  return marker.source
    ? [{
        source: String(marker.source),
        bytes: num(marker.bytes),
        books: num(marker.books),
        at: num(marker.at),
      }]
    : []
}

/* ---------------- 合并规则：已有数据优先，只补缺 ---------------- */
const isBlank = (value: any) => value == null || value === '' || value === 0
  || (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length)
/** 只在当前值为空时用旧库的值补齐（进度、章节这类旧库里才有真值） */
const fillEmpty = (target: Record<string, any>, source: Record<string, any>, keys: string[]) => {
  let filled = 0
  for (const key of keys) {
    if (isBlank(target?.[key]) && !isBlank(source?.[key])) {
      target[key] = source[key]
      filled++
    }
  }
  return filled
}
const mergeRecord = (current: BookRecord, incoming: BookRecord) => {
  const annotations = [...(current.annotations || [])]
  const seen = new Set(annotations.map(annotationIdOf).filter(Boolean))
  let added = 0
  for (const item of incoming.annotations || []) {
    const id = annotationIdOf(item)
    if (id && seen.has(id)) continue
    if (id) seen.add(id)
    annotations.push(item)
    added++
  }
  const book = {
    ...(incoming.book || {}),
    ...(current.book || {}),
  }
  const record: BookRecord = {
    ...incoming,
    ...current,
    version: 1,
    book,
    annotations,
    progress: current.progress || incoming.progress,
    migration: {
      ...(incoming.migration || {}),
      ...(current.migration || {}),
    },
    updatedAt: Date.now(),
  }
  const filled = fillEmpty(book, (incoming.book || {}) as Record<string, any>, ['progress', 'chapter', 'total', 'time', 'pos'])
  return {
    record,
    added,
    filled,
  }
}

/* ---------------- 书架别名匹配 ----------------
 * 旧库的 book.url 是 `pdf://标题_大小`，但用户的书架可能被重建过（重新导入本地文件后
 * url 变成 `file:///.../books/xxx.pdf`，或用 dataId 做记录键）。只按 url 精确匹配会
 * 全部落空，进而新建重复书、标注挂不上。这里用「文件名」和「标题+大小」做别名。
 */
const baseNameOf = (value = '') => {
  const clean = String(value || '').split('?')[0].split('#')[0]
  const raw = clean.split(/[\\/]/).pop() || ''
  try {
    return decodeURIComponent(raw).toLowerCase()
  } catch {
    return raw.toLowerCase()
  }
}
const createShelfIndex = (shelf: Record<string, any>) => {
  const byName = new Map<string, string>()
  for (const [key, book] of Object.entries(shelf)) {
    const name = baseNameOf(book?.path || key)
    if (name) byName.set(name, key)
  }
  return byName
}
const resolveShelfKey = (shelf: Record<string, any>, byName: Map<string, string>, book: { url: string, path: string, title: string, size: number }) => {
  if (shelf[book.url]) return book.url
  const name = baseNameOf(book.path || book.url)
  const byFileName = name ? byName.get(name) : undefined
  if (byFileName) return byFileName
  return matchLegacyBook(book.url, Object.values(shelf))?.url
}

const copyManaged = async (url: string, source: string, destination: string) => {
  try {
    const blob = await readStorageBlob(source)
    if (!blob) {
      diagnosticLog('warn', 'legacy-db.migration.file.missing', {
        url,
        source,
      })
      return
    }
    await writeManagedFile(blob, destination)
    diagnosticLog('info', 'legacy-db.migration.file', {
      url,
      destination,
      bytes: blob.size,
    })
  } catch (error) {
    diagnosticLog('error', 'legacy-db.migration.file.failed', {
      url,
      source,
      error,
    })
  }
}

const copyCover = async (url: string, source: string) => {
  const ext = extOf(source, 'jpg')
  if (!LEGACY_COVER_EXTS.includes(ext)) return
  await copyManaged(url, source, getCoverFileDataPath(url, ext))
}

/* ---------------- 主流程 ---------------- */
export const migrateLegacyDatabase = async (plugin: PluginLike, options: { force?: boolean } = {}) => {
  const root = `${PLUGIN_STORAGE_ROOT}/${plugin.name}`
  try {
    const candidates = [
      ...LEGACY_DB_NAMES.map((name) => `${root}/${name}`),
      ...await backupDatabasePaths(plugin.name),
    ]
    let dbPath = ''
    let blob: Blob | null = null
    for (const candidate of candidates) {
      blob = await readStorageBlob(candidate)
      if (blob) {
        dbPath = candidate
        break
      }
    }
    if (!blob) return 0

    const marker = await loadData<Record<string, any>>(MIGRATION_MARKER).catch(() => null)
    const marks = importMarks(marker)
    if (!options.force && marks.some((mark) => mark.source === dbPath && mark.bytes === blob.size)) {
      diagnosticLog('debug', 'legacy-db.migration.already-imported', {
        source: dbPath,
        bytes: blob.size,
      })
      return 0
    }

    diagnosticLog('info', 'legacy-db.migration.start', {
      source: dbPath,
      bytes: blob.size,
      force: !!options.force,
    })
    const initSqlJs = await loadSqlJs(plugin.name)
    const SQL = await initSqlJs()
    const legacy = new SQL.Database(new Uint8Array(await blob.arrayBuffer()))
    const bookRows = select(legacy, 'books', ['url', 'bookUrl', 'id', 'title', 'name', 'author', 'cover', 'coverUrl', 'format', 'path', 'filePath', 'size', 'fileSize', 'added', 'addTime', 'read', 'durChapterTime', 'finished', 'status', 'progress', 'epubProgress', 'time', 'chapter', 'durChapterIndex', 'total', 'totalChapterNum', 'pos', 'rating', 'meta', 'bindDocId', 'bindDocName'], 'added DESC')
    if (!bookRows.length) {
      legacy.close?.()
      return 0
    }

    const tagRows = select(legacy, 'tags', ['book', 'tag'])
    const groupRows = select(legacy, 'groups', ['book', 'gid'])
    const annotationRows = select(legacy, 'annotations', ['id', 'book', 'type', 'loc', 'text', 'note', 'color', 'data', 'created', 'updated', 'chapter', 'block'], 'created')
    const settingRows = select(legacy, 'settings', ['key', 'val'])
    legacy.close?.()

    const tagsMap = new Map<string, string[]>()
    for (const row of tagRows) {
      const book = text(row.book)
      tagsMap.set(book, [...new Set([...(tagsMap.get(book) || []), text(row.tag)])].filter(Boolean))
    }
    const groupsMap = new Map<string, string[]>()
    for (const row of groupRows) {
      const book = text(row.book)
      groupsMap.set(book, [...new Set([...(groupsMap.get(book) || []), text(row.gid)])].filter(Boolean))
    }
    const annotationsMap = new Map<string, any[]>()
    const daily = new Map<string, Record<string, number>>()
    for (const row of annotationRows) {
      const data = parseJson<Record<string, any>>(row.data, {})
      if (text(row.type) === 'daily_reading') {
        const date = text(data.date)
        const duration = num(data.duration)
        if (!date || duration <= 0) continue
        const day = daily.get(date) || {}
        day[text(row.book)] = Math.max(num(day[text(row.book)]), duration)
        daily.set(date, day)
        continue
      }
      const book = text(row.book)
      const list = annotationsMap.get(book) || []
      list.push({
        id: text(row.id) || `legacy-${hash(book)}-${list.length}`,
        book,
        type: text(row.type, 'highlight'),
        loc: text(row.loc),
        text: text(row.text),
        note: text(row.note),
        tags: [],
        color: text(row.color),
        data,
        created: num(row.created, Date.now()),
        updated: num(row.updated || row.created, Date.now()),
        chapter: text(row.chapter),
        block: text(row.block),
      })
      annotationsMap.set(book, list)
    }

    const shelf = (await loadDataState<Record<string, any>>('bookshelf.json').catch(() => null))?.value || {}
    const shelfIndex = createShelfIndex(shelf)
    const index: Record<string, any> = {}
    const records: Array<{ key: string, recordKey: string, record: BookRecord, legacyPath: string, legacyCover: string, fresh: boolean }> = []
    for (const row of bookRows) {
      const url = text(row.url || row.bookUrl || row.id)
      if (!url) continue
      const progress = Math.max(0, Math.min(100, num(row.progress ?? row.epubProgress, 0)))
      const format = (() => {
        const value = text(row.format).toLowerCase()
        if (value === 'azw') return 'azw3'
        if (LEGACY_BOOK_EXTS.includes(value)) return value
        const ext = extOf(text(row.path || row.filePath || url), '')
        return LEGACY_BOOK_EXTS.includes(ext) ? ext : 'epub'
      })()
      const legacyPath = storagePathOf(row.path || row.filePath)
      const legacyCover = storagePathOf(row.cover || row.coverUrl)
      const coverExt = extOf(legacyCover, 'jpg')
      const title = normalizeBookTitle(text(row.title || row.name, '未知书名')) || '未知书名'
      const chapter = num(row.chapter || row.durChapterIndex)
      const total = num(row.total || row.totalChapterNum)
      const book: LegacyBook = {
        url,
        title,
        author: text(row.author, '未知作者') || '未知作者',
        cover: legacyCover && LEGACY_COVER_EXTS.includes(coverExt) ? getCoverFileDataPath(url, coverExt) : text(row.cover || row.coverUrl),
        format,
        path: legacyPath ? getBookFileDataPath(url, extOf(legacyPath, format)) : text(row.path || row.filePath),
        size: num(row.size || row.fileSize),
        added: num(row.added || row.addTime, Date.now()),
        read: num(row.read || row.durChapterTime || row.added || row.addTime, Date.now()),
        finished: num(row.finished, progress >= 100 ? Date.now() : 0),
        status: text(row.status) || (progress >= 100 ? 'finished' : progress > 0 ? 'reading' : 'unread'),
        progress,
        time: num(row.time),
        chapter,
        total,
        pos: parseJson<Record<string, any>>(row.pos, {}),
        rating: num(row.rating),
        meta: parseJson<Record<string, any>>(row.meta, {}),
        tags: tagsMap.get(url) || [],
        groups: groupsMap.get(url) || [],
        bindDocId: text(row.bindDocId),
        bindDocName: text(row.bindDocName),
      }
      const record: BookRecord = {
        version: 1,
        book: book as unknown as Record<string, any>,
        annotations: annotationsMap.get(url) || [],
        updatedAt: Math.max(book.read, book.added) || Date.now(),
      }
      // PDF 阅读进度：与 dataMigration 里补 progress 的方式保持一致。
      if (format === 'pdf' && chapter > 0 && !record.progress) {
        record.progress = {
          pageNumber: chapter,
          totalPages: total,
          updatedAt: num(book.pos?.timestamp, book.read),
        } as EmbedPdfProgress
      }
      // 书架里已有同一本书（url 可能被换成本地 file:// 链接）→ 合并到已有条目，不新建重复书
      const matchedKey = resolveShelfKey(shelf, shelfIndex, {
        url,
        path: legacyPath || url,
        title,
        size: book.size,
      })
      const fresh = !matchedKey
      const key = matchedKey || url
      if (key !== url) {
        record.book = {
          ...(record.book as Record<string, any>),
          url: key,
        }
        for (const item of record.annotations) item.book = key
      }
      const recordKey = matchedKey ? (String(shelf[key]?.dataId || key)) : key
      records.push({
        key,
        recordKey,
        record,
        legacyPath,
        legacyCover,
        fresh,
      })
      if (fresh) {
        // 索引形态与 database.ts stripBookForIndex 一致：path/meta/pos 留空，真值在记录里。
        index[url] = {
          ...book,
          path: '',
          pos: {},
          meta: {},
          dataId: '',
          fingerprint: '',
        }
      }
    }

    let mergedRecords = 0
    let mergedAnnotations = 0
    const freshList: string[] = []
    for (const item of records) {
      const existing = await readBookRecord(item.recordKey).catch(() => null)
      if (!existing) {
        if (item.fresh) freshList.push(item.key)
        await writeBookRecord(item.recordKey, item.record)
        mergedRecords++
        continue
      }
      const merged = mergeRecord(existing, item.record)
      // 顺带把书架索引里为空的进度/章节补上（不动 path/cover，避免指向未复制的文件）
      const shelfEntry = shelf[item.key]
      if (shelfEntry) fillEmpty(shelfEntry, item.record.book as Record<string, any>, ['progress', 'chapter', 'total', 'time'])
      // 没有新增内容就不回写记录，避免每次启动都产生无意义的写入
      if (merged.added > 0 || merged.filled > 0) {
        await writeBookRecord(item.recordKey, merged.record)
        mergedAnnotations += merged.added
      }
      mergedRecords++
    }

    await saveData('bookshelf.json', {
      ...index,
      ...shelf,
    })

    const importedSettings: Record<string, any> = {}
    for (const row of settingRows) {
      const key = text(row.key)
      if (key) importedSettings[key] = parseJson(row.val, row.val)
    }
    if (Object.keys(importedSettings).length) {
      const currentSettings = await loadData<Record<string, any>>('settings.json').catch(() => null) || {}
      await saveData('settings.json', {
        ...importedSettings,
        ...currentSettings,
      })
    }

    if (daily.size) {
      const currentDaily = await loadData<Record<string, Record<string, number>>>('daily.json').catch(() => null) || {}
      const merged: Record<string, Record<string, number>> = { ...currentDaily }
      for (const [date, day] of daily) {
        const target = { ...(merged[date] || {}) }
        for (const [url, duration] of Object.entries(day)) target[url] = Math.max(num(target[url]), duration)
        merged[date] = target
      }
      await saveData('daily.json', merged)
    }

    // 只给新书复制正文/封面；已在书架里的书用户早就能正常打开，不必重拷。
    for (const item of records) {
      if (!freshList.includes(item.key)) continue
      if (item.legacyPath) trackPending(copyManaged(item.key, item.legacyPath, getBookFileDataPath(item.key, extOf(item.legacyPath, item.record.book.format))))
      if (item.legacyCover) trackPending(copyCover(item.key, item.legacyCover))
    }

    const nextMarks = [
      ...marks.filter((mark) => !(mark.source === dbPath && mark.bytes === blob.size)),
      {
        source: dbPath,
        bytes: blob.size,
        books: records.length,
        at: Date.now(),
      },
    ]
    await saveData(MIGRATION_MARKER, {
      done: true,
      source: dbPath,
      bytes: blob.size,
      at: Date.now(),
      books: Object.keys({
        ...index,
        ...shelf,
      }).length,
      annotations: records.reduce((sum, item) => sum + item.record.annotations.length, 0),
      imports: nextMarks,
      tool: 'legacy-db-migration',
    })
    window.dispatchEvent(new Event('sireader:bookshelf-updated'))

    diagnosticLog('info', 'legacy-db.migration.done', {
      source: dbPath,
      records: mergedRecords,
      fresh: freshList.length,
      mergedAnnotations,
    })
    if (freshList.length || mergedAnnotations) {
      try {
        const notice = message(plugin, 'legacyDbRestored', '已从旧版数据库补齐书架与标注')
        showMessage(`${notice} · +${freshList.length} / +${mergedAnnotations}`, 5000, 'info')
      } catch {}
    }
    return mergedRecords
  } catch (error) {
    diagnosticLog('error', 'legacy-db.migration.failed', { error })
    return 0
  }
}

