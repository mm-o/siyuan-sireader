import { bookRecordKey, deleteBookAnnotation, readBookRecord as loadBookRecord, removeBookRecord, transactBookRecord, type BookRecord, upsertBookAnnotation } from './bookStore'
import { flushStorage, storageEngine, type StorageKey } from './storage/engine'
import { runAtomic, storageTransactionStep } from './storage/wal'
import { deepMerge, leafEntries } from './storage/types'

const BOOK_INDEX_KEY = 'bookshelf.json'
const SETTINGS_KEY = 'settings.json'
const DAILY_READING_KEY = 'daily.json'
const ANNOTATION_COUNT_KEY = 'annotation_record_count_v1'

const parseJson = <T>(value: any, fallback: T): T => {
  try {
    if (value == null || value === '') return fallback
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return fallback
  }
}
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b)
export interface Book {
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
  pos: any
  rating: number
  meta: any
  tags: string[]
  groups: string[]
  bindDocId?: string
  bindDocName?: string
  dataId?: string
  fingerprint?: string
  annotationCount?: number
}

export type AnnotationType = 'highlight' | 'note' | 'bookmark' | 'vocab' | 'shape' | 'ink' | 'daily_reading'

export interface Annotation {
  id: string
  book: string
  type: AnnotationType
  loc: string
  text: string
  note: string
  tags?: string[]
  color: string
  data: any
  created: number
  updated: number
  chapter: string
  block: string
  format?: 'pdf' | 'epub'
  page?: number
  cfi?: string
  section?: number
  rects?: any[]
  style?: string
  customOrder?: number
  shapeType?: string
  filled?: boolean
  paths?: any[]
  date?: string
  duration?: number
}

type StoredIndex = Record<string, Book>
type StoredSettings = Record<string, any>
type DailyReadingStore = Record<string, Record<string, number>>
const booksKey: StorageKey<StoredIndex> = { name: BOOK_INDEX_KEY, defaultValue: () => ({}) }
const settingsKey: StorageKey<StoredSettings> = { name: SETTINGS_KEY, defaultValue: () => ({}) }
const dailyKey: StorageKey<DailyReadingStore> = { name: DAILY_READING_KEY, defaultValue: () => ({}) }
const operationId = (label: string) => `${label}:${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`}`

const emptyBook = (book: Partial<Book> & Pick<Book, 'url' | 'title' | 'format' | 'status'>): Book => ({
  url: book.url,
  title: book.title,
  author: '',
  cover: '',
  format: book.format,
  path: '',
  size: 0,
  added: Date.now(),
  read: Date.now(),
  finished: 0,
  status: book.status,
  progress: 0,
  time: 0,
  chapter: 0,
  total: 0,
  pos: {},
  rating: 0,
  meta: {},
  tags: [],
  groups: [],
  bindDocId: '',
  bindDocName: '',
})

export class ReaderDatabase {
  private ready = false
  private initPromise: Promise<void> | null = null
  private books: StoredIndex = {}
  private settings: StoredSettings = {}
  private dailyReading: DailyReadingStore = {}
  private annotationCountRebuildPending = false

  private async readStorageState() {
    const [booksRaw, settingsRaw, dailyRaw] = await Promise.all([
      storageEngine.readState(booksKey, true),
      storageEngine.readState(settingsKey, true),
      storageEngine.readState(dailyKey, true),
    ])
    return { booksRaw, settingsRaw, dailyRaw }
  }

  private async loadStorage() {
    const { booksRaw, settingsRaw, dailyRaw } = await this.readStorageState()
    this.books = parseJson(booksRaw.value, {})
    this.settings = parseJson(settingsRaw.value, {})
    this.dailyReading = parseJson(dailyRaw.value, {})
  }

  private async reloadStorage() {
    const { booksRaw, settingsRaw, dailyRaw } = await this.readStorageState()
    this.books = booksRaw.found ? parseJson(booksRaw.value, {}) : {}
    this.settings = settingsRaw.found ? parseJson(settingsRaw.value, {}) : {}
    this.dailyReading = dailyRaw.found ? parseJson(dailyRaw.value, {}) : {}
  }

  async init() {
    if (this.ready) return
    if (this.initPromise) return this.initPromise
    this.initPromise = (async () => {
      await this.loadStorage()
      this.ready = true
    })()
    try {
      await this.initPromise
    } catch (error) {
      this.initPromise = null
      throw error
    }
  }

  async reload() {
    await this.cleanup()
    await this.reloadStorage()
    this.ready = true
  }

  async saveNow() {
    await flushStorage()
  }

  async cleanup() {
    await flushStorage()
  }

  private readRawSetting<T = any>(key: string): T | null {
    return Object.prototype.hasOwnProperty.call(this.settings, key) ? this.settings[key] as T : null
  }

  private async writeRawSetting(key: string, value: any) {
    if (same(this.settings[key], value)) return
    await storageEngine.transact(settingsKey, [{ id: operationId('setting:set'), type: 'set', path: [key], value }])
    this.settings[key] = value
  }

  private stripBookForIndex(book: Partial<Book> & Pick<Book, 'url' | 'title' | 'format' | 'status'>): Book {
    return {
      url: book.url,
      title: book.title,
      author: book.author || '',
      cover: book.cover || '',
      format: book.format,
      path: '',
      size: Number(book.size || 0),
      added: Number(book.added || Date.now()),
      read: Number(book.read || book.added || Date.now()),
      finished: Number(book.finished || 0),
      status: book.status,
      progress: Number(book.progress || 0),
      time: Number(book.time || 0),
      chapter: Number(book.chapter || 0),
      total: Number(book.total || 0),
      pos: {},
      rating: Number(book.rating || 0),
      meta: {},
      tags: Array.from(new Set(book.tags || [])),
      groups: Array.from(new Set(book.groups || [])),
      bindDocId: book.bindDocId || '',
      bindDocName: book.bindDocName || '',
      dataId: book.dataId || '',
      fingerprint: book.fingerprint || '',
    }
  }

  private async persistBookIndex(book: Book) {
    const indexBook = this.stripBookForIndex(book)
    if (same(this.books[indexBook.url], indexBook)) return indexBook
    await storageEngine.transact(booksKey, [{ id: operationId('book:set'), type: 'set', path: [indexBook.url], value: indexBook }])
    this.books[indexBook.url] = indexBook
    return indexBook
  }

  private mergeRecordBook = (book: Book, record?: Partial<Book> | null) =>
    record ? { ...book, ...record, tags: book.tags, groups: book.groups } : book

  private dataKey = (book: Pick<Book, 'url'> & Partial<Pick<Book, 'dataId'>>) => book.dataId || book.url

  private readBookRecord = async (book: Book) =>
    await loadBookRecord(this.dataKey(book)) || await loadBookRecord(book.url) || { version: 1, book: { ...book }, annotations: [], updatedAt: Date.now() } as BookRecord

  private listBooks = (orderBy = 'read DESC') => {
    const books = Object.values(this.books)
    const [field, direction = 'DESC'] = orderBy.split(/\s+/)
    const getter = (book: Book) => {
      if (field === 'read') return book.read || 0
      if (field === 'added') return book.added || 0
      if (field === 'progress') return book.progress || 0
      if (field === 'rating') return book.rating || 0
      if (field === 'time') return book.time || 0
      if (field === 'title') return (book.title || '').toLowerCase()
      if (field === 'author') return (book.author || '').toLowerCase()
      return book.read || 0
    }
    return [...books].sort((a, b) => {
      const av = getter(a)
      const bv = getter(b)
      if (av === bv) return 0
      if (direction.toUpperCase() === 'ASC') return av > bv ? 1 : -1
      return av < bv ? 1 : -1
    })
  }

  private async hydrateBook(book: Book) {
    const record = await this.readBookRecord(book)
    const full = {
      ...this.mergeRecordBook(book, record?.book),
      annotationCount: record?.annotations?.length || 0,
    }
    if (!book.cover && full.cover) await this.persistBookIndex(full)
    return full
  }

  private async countRecordAnnotations(books: Book[]) {
    return (await Promise.all(books.map(async book => (await this.readBookRecord(book))?.annotations?.length || 0))).reduce((sum, count) => sum + count, 0)
  }

  private setCachedAnnotationCount = (count: number) => this.writeRawSetting(ANNOTATION_COUNT_KEY, Math.max(0, count))
  private async bumpCachedAnnotationCount(delta: number) {
    if (!delta) return
    const stored = await storageEngine.transact(settingsKey, [{
      id: operationId('annotation-count'), type: 'increment', path: [ANNOTATION_COUNT_KEY], value: delta,
    }, {
      id: operationId('annotation-count-floor'), type: 'max', path: [ANNOTATION_COUNT_KEY], value: 0,
    }])
    this.settings[ANNOTATION_COUNT_KEY] = Number(stored[ANNOTATION_COUNT_KEY] || 0)
  }

  private async rebuildAnnotationCount() {
    const total = await this.countRecordAnnotations(this.listBooks('added DESC'))
    await this.setCachedAnnotationCount(total)
    return total
  }

  private scheduleAnnotationCountRebuild() {
    if (this.annotationCountRebuildPending) return
    this.annotationCountRebuildPending = true
    const run = () => void this.rebuildAnnotationCount().finally(() => { this.annotationCountRebuildPending = false }).catch(() => {})
    ;(globalThis as any).requestIdleCallback ? (globalThis as any).requestIdleCallback(run, { timeout: 5000 }) : setTimeout(run, 1500)
  }

  async getBook(url: string) {
    await this.init()
    const book = this.books[url]
    return book ? this.hydrateBook(book) : null
  }

  async getBooks() {
    await this.init()
    return this.listBooks('read DESC')
  }

  async saveBook(book: Partial<Book> & Pick<Book, 'url' | 'title' | 'format' | 'status'>) {
    await this.init()
    const existingIndexBook = this.books[book.url]
    const record = await loadBookRecord(book.dataId || book.url) || await loadBookRecord(book.url)
    const current = existingIndexBook ? this.mergeRecordBook(existingIndexBook, record?.book) : null
    const hasPath = Object.prototype.hasOwnProperty.call(book, 'path')
    const hasCover = Object.prototype.hasOwnProperty.call(book, 'cover')
    const fullBook = {
      ...(current || emptyBook(book)),
      ...book,
      path: hasPath ? book.path || '' : current?.path || '',
      cover: hasCover ? book.cover || '' : current?.cover || '',
      tags: book.tags || current?.tags || record?.book?.tags || [],
      groups: book.groups || current?.groups || record?.book?.groups || [],
    } as Book
    const prevBook = current ? { ...current } : null
    if (same(prevBook, fullBook)) return
    const indexBook = this.stripBookForIndex(fullBook)
    const recordKey = bookRecordKey(this.dataKey(fullBook))
    await runAtomic('book-save', [
      storageTransactionStep('book-index', { name: booksKey.name, defaultValue: booksKey.defaultValue() }, [
        { id: operationId('book:set'), type: 'set', path: [indexBook.url], value: indexBook },
      ]),
      storageTransactionStep('book-record', { name: recordKey.name, defaultValue: recordKey.defaultValue() }, [
        { id: operationId('record-book:patch'), type: 'patch', path: ['book'], value: fullBook as unknown as Record<string, unknown> },
        { id: operationId('record:touch'), type: 'set', path: ['updatedAt'], value: Date.now() },
      ]),
    ])
    this.books[indexBook.url] = indexBook
  }

  async patchBook(url: string, patch: Partial<Book>) {
    await this.init()
    const current = this.books[url]
    if (!current) return false
    const merged = { ...current, ...patch } as Book
    const nextIndex = this.stripBookForIndex(merged)
    const indexPatch = Object.fromEntries(Object.entries(nextIndex).filter(([key, value]) => !same((current as any)[key], value)))
    const dataKey = this.dataKey(merged)
    const steps = []
    if (Object.keys(indexPatch).length) steps.push(storageTransactionStep('book-index', {
      name: booksKey.name,
      defaultValue: booksKey.defaultValue(),
    }, [{ id: operationId('book:patch'), type: 'patch', path: [url], value: indexPatch }]))
    const recordKey = bookRecordKey(dataKey)
    steps.push(storageTransactionStep('book-record', {
      name: recordKey.name,
      defaultValue: recordKey.defaultValue(),
    }, [{ id: operationId('record-book:patch'), type: 'patch', path: ['book'], value: patch as Record<string, unknown> }]))
    await runAtomic('book-patch', steps)
    this.books[url] = nextIndex
    return true
  }

  async incrementBook(url: string, field: 'time', value: number, patch: Partial<Book> = {}) {
    await this.init()
    const current = this.books[url]
    if (!current) return false
    const next = { ...current, ...patch, [field]: Number((current as any)[field] || 0) + value } as Book
    const dataKey = this.dataKey(next)
    const indexOps: any[] = [{ id: operationId('book:increment'), type: 'increment', path: [url, field], value }]
    const recordOps: any[] = [{ id: operationId('record-book:increment'), type: 'increment', path: ['book', field], value }]
    if (Object.keys(patch).length) {
      indexOps.push({ id: operationId('book:patch'), type: 'patch', path: [url], value: patch })
      recordOps.push({ id: operationId('record-book:patch'), type: 'patch', path: ['book'], value: patch })
    }
    const recordKey = bookRecordKey(dataKey)
    await runAtomic('book-increment', [
      storageTransactionStep('book-index', { name: booksKey.name, defaultValue: booksKey.defaultValue() }, indexOps),
      storageTransactionStep('book-record', { name: recordKey.name, defaultValue: recordKey.defaultValue() }, recordOps),
    ])
    this.books[url] = next
    return true
  }

  async deleteBook(url: string, deleteData = false) {
    await this.init()
    const book = this.books[url]
    const annotationCount = deleteData ? (await loadBookRecord(book ? this.dataKey(book) : url))?.annotations?.length || 0 : 0
    const dailyDeletes = Object.entries(this.dailyReading).flatMap(([date, items]) => {
      if (!Object.prototype.hasOwnProperty.call(items, url)) return []
      return [{ id: operationId('daily:delete'), type: 'delete' as const, path: [date, url] }]
    })
    const steps = [storageTransactionStep('book-index', { name: booksKey.name, defaultValue: booksKey.defaultValue() }, [
      { id: operationId('book:delete'), type: 'delete', path: [url] },
    ])]
    if (dailyDeletes.length) steps.push(storageTransactionStep('daily-reading', { name: dailyKey.name, defaultValue: dailyKey.defaultValue() }, dailyDeletes))
    await runAtomic('book-delete', steps)
    delete this.books[url]
    Object.values(this.dailyReading).forEach(items => delete items[url])
    if (deleteData) {
      if (book?.dataId) await removeBookRecord(book.dataId)
      await removeBookRecord(url)
      await this.bumpCachedAnnotationCount(-annotationCount)
    }
    await this.saveNow()
  }

  async getAnnotations(book: string) {
    await this.init()
    const item = this.books[book]
    return (await loadBookRecord(item ? this.dataKey(item) : book) || await loadBookRecord(book))?.annotations || []
  }

  async saveAnnotation(annotation: Partial<Annotation> & Pick<Annotation, 'id' | 'book' | 'type'>, onCommit?: () => void) {
    await this.init()
    if (!annotation.book) throw new Error('book required')
    if (!annotation.id) throw new Error('id required')
    if (annotation.type === 'daily_reading') {
      const data = annotation.data || {}
      const date = String(data.date || '')
      const duration = Number(data.duration || 0)
      if (!date || duration <= 0) return
      const items = this.dailyReading[date] || {}
      await storageEngine.transact(dailyKey, [{ id: operationId('daily:max'), type: 'max', path: [date, annotation.book], value: duration }])
      items[annotation.book] = Math.max(Number(items[annotation.book] || 0), duration)
      this.dailyReading[date] = items
      return
    }
    const book = await this.getBook(annotation.book)
    if (!book) throw new Error('book not found')
    if (book.format === 'pdf') return
    const record = await this.readBookRecord(book)
    const old = (record.annotations || []).find(item => item.id === annotation.id)
    const now = Date.now()
    const item = {
      id: annotation.id,
      book: annotation.book,
      type: annotation.type,
      loc: annotation.loc || '',
      text: annotation.text || '',
      note: annotation.note || '',
      tags: Array.from(new Set((annotation.tags || []).map(tag => String(tag || '').trim()).filter(Boolean))),
      color: annotation.color || '',
      data: annotation.data || {},
      created: annotation.created || old?.created || now,
      updated: now,
      chapter: annotation.chapter || '',
      block: annotation.block || '',
    } as Annotation
    await upsertBookAnnotation(this.dataKey(book), item, false, onCommit)
    if (!old) await this.bumpCachedAnnotationCount(1)
  }

  async saveAnnotations(bookUrl: string, types: AnnotationType[], annotations: Array<Partial<Annotation> & Pick<Annotation, 'id' | 'type'>>) {
    await this.init()
    if (!bookUrl) throw new Error('book required')
    const book = await this.getBook(bookUrl)
    if (!book) throw new Error('book not found')
    if (book.format === 'pdf') return
    const record = await this.readBookRecord(book)
    const current = record.annotations || []
    const allow = new Set(types)
    const prev = new Map(current.map(item => [item.id, item]))
    const now = Date.now()
    const next = [
      ...current.filter(item => !allow.has(item.type)),
      ...annotations.map(annotation => {
        if (!annotation.id) throw new Error('id required')
        const old = prev.get(annotation.id)
        const item = {
          id: annotation.id,
          book: bookUrl,
          type: annotation.type,
          loc: annotation.loc || '',
          text: annotation.text || '',
          note: annotation.note || '',
          tags: Array.from(new Set((annotation.tags || []).map(tag => String(tag || '').trim()).filter(Boolean))),
          color: annotation.color || '',
          data: annotation.data || {},
          created: annotation.created || old?.created || now,
          updated: old?.updated || annotation.updated || now,
          chapter: annotation.chapter || '',
          block: annotation.block || '',
        } as Annotation
        return old && same({ ...old, updated: item.updated }, item) ? old : { ...item, updated: now }
      }),
    ].sort((a, b) => (a.created || 0) - (b.created || 0))
    if (same(current, next)) return
    const nextIds = new Set(next.filter(item => allow.has(item.type)).map(item => item.id))
    const operations = [
      ...current.filter(item => allow.has(item.type) && !nextIds.has(item.id)).map(item => ({
        id: operationId('annotation:delete'), type: 'delete' as const, path: ['annotations'], itemKey: 'id', itemValue: item.id,
      })),
      ...next.filter(item => allow.has(item.type)).map(item => ({
        id: operationId('annotation:upsert'), type: 'upsert' as const, path: ['annotations'], itemKey: 'id', value: item,
      })),
      { id: operationId('record:touch'), type: 'set' as const, path: ['updatedAt'], value: Date.now() },
    ]
    await transactBookRecord(this.dataKey(book), operations)
    await this.bumpCachedAnnotationCount(next.length - current.length)
  }

  async deleteAnnotation(id: string, bookUrl?: string) {
    await this.init()
    const knownBook = bookUrl
      ? this.books[bookUrl] || Object.values(this.books).find(book => book.dataId === bookUrl)
      : null
    const books = knownBook ? [knownBook] : this.listBooks('added DESC')
    for (const book of books) {
      if (book.format === 'pdf') {
        const record = await loadBookRecord(this.dataKey(book)) || await loadBookRecord(book.url)
        const annotations = record?.annotations || []
        const existed = annotations.some(item => (item.annotation || item).id === id)
        if (!knownBook && !existed) continue
        await deleteBookAnnotation(this.dataKey(book), id, true)
        if (existed) await this.bumpCachedAnnotationCount(-1)
        break
      }
      const record = await loadBookRecord(this.dataKey(book)) || await loadBookRecord(book.url)
      const existed = !!record?.annotations?.some(item => item.id === id)
      if (!knownBook && !existed) continue
      await deleteBookAnnotation(this.dataKey(book), id, false)
      if (existed) await this.bumpCachedAnnotationCount(-1)
      break
    }
  }

  async getSetting<T = any>(key: string): Promise<T | null> {
    await this.init()
    return this.readRawSetting<T>(key)
  }

  async saveSetting(key: string, value: any) {
    await this.init()
    if (same(this.settings[key], value)) return
    await storageEngine.transact(settingsKey, [{ id: operationId('setting:set'), type: 'set', path: [key], value }])
    this.settings[key] = value
  }

  async patchSetting(key: string, patch: Record<string, unknown>) {
    await this.init()
    const current = this.settings[key]
    const merged = deepMerge(current && typeof current === 'object' ? current : {}, patch)
    const operations = leafEntries(patch).map(([path, value]) => ({
      id: operationId('setting:set'), type: 'set' as const, path: [key, ...path], value,
    }))
    if (operations.length) await storageEngine.transact(settingsKey, operations)
    this.settings[key] = merged
  }

  async getGroups() {
    return this.getSetting('book_groups').then(groups => groups || [])
  }

  async saveGroups(groups: any[]) {
    await this.saveSetting('book_groups', groups)
  }

  async getAllTags() {
    await this.init()
    const counts = new Map<string, number>()
    Object.values(this.books).forEach(book => (book.tags || []).forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1)))
    return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count)
  }

  async filterBooks(opt: {
    status?: string[]
    rating?: number
    formats?: string[]
    tags?: string[]
    sortBy?: string
    reverse?: boolean
  } = {}) {
    await this.init()
    const sortMap: Record<string, keyof Book> = {
      time: 'read',
      added: 'added',
      progress: 'progress',
      rating: 'rating',
      readTime: 'time',
      name: 'title',
      author: 'author',
    }
    const column = sortMap[opt.sortBy || 'time']
    let books = Object.values(this.books).filter(book =>
      (!opt.status?.length || opt.status.includes(book.status)) &&
      (!opt.rating || (book.rating || 0) >= opt.rating) &&
      (!opt.formats?.length || opt.formats.includes(book.format)) &&
      (!opt.tags?.length || opt.tags.some(tag => (book.tags || []).includes(tag))),
    )
    books = books.sort((a, b) => {
      const av = column === 'title' || column === 'author' ? String(a[column] || '').toLowerCase() : Number(a[column] || 0)
      const bv = column === 'title' || column === 'author' ? String(b[column] || '').toLowerCase() : Number(b[column] || 0)
      if (av === bv) return 0
      return opt.reverse ? (av > bv ? 1 : -1) : (av < bv ? -1 : 1)
    })
    return books
  }

  async getStats() {
    await this.init()
    const books = Object.values(this.books)
    const byStatus: Record<string, number> = { unread: 0, reading: 0, finished: 0 }
    const byFormat: Record<string, number> = { epub: 0, pdf: 0, mobi: 0, azw3: 0, txt: 0 }
    const byRating: Record<number, number> = {}
    books.forEach(book => {
      byStatus[book.status] = (byStatus[book.status] || 0) + 1
      byFormat[book.format] = (byFormat[book.format] || 0) + 1
      if ((book.rating || 0) > 0) byRating[book.rating] = (byRating[book.rating] || 0) + 1
    })
    const cached = this.readRawSetting(ANNOTATION_COUNT_KEY)
    const annotationCount = cached == null ? 0 : Number(cached || 0)
    if (cached == null) this.scheduleAnnotationCountRebuild()
    return { byStatus, byFormat, byRating, annotationCount }
  }

  async getTodayReading() {
    await this.init()
    const today = new Date().toISOString().split('T')[0]
    return Object.values(this.dailyReading[today] || {}).reduce((sum, duration) => sum + Number(duration || 0), 0)
  }

  async getDailyReading(year: number, month?: number) {
    await this.init()
    const prefix = month ? `${year}-${String(month).padStart(2, '0')}` : `${year}`
    const daily: Record<string, { total: number, books: Array<{ url: string, duration: number }> }> = {}
    Object.entries(this.dailyReading)
      .filter(([date]) => date.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, items]) => {
        const books = Object.entries(items)
          .map(([url, duration]) => ({ url, duration: Number(duration || 0) }))
          .filter(item => item.duration > 0)
          .sort((a, b) => b.duration - a.duration)
        daily[date] = { total: books.reduce((sum, item) => sum + item.duration, 0), books }
      })
    return daily
  }

  async saveDailyReading(bookUrl: string, duration: number) {
    if (!bookUrl || duration <= 0) return
    await this.init()
    const date = new Date().toISOString().split('T')[0]
    const current = this.dailyReading[date] || {}
    await storageEngine.transact(dailyKey, [{ id: operationId('daily:increment'), type: 'increment', path: [date, bookUrl], value: duration }])
    current[bookUrl] = Number(current[bookUrl] || 0) + duration
    this.dailyReading[date] = current
  }

  async deleteGroup(gid: string) {
    await this.init()
    const nextBooks = Object.fromEntries(Object.entries(this.books).map(([url, book]) => [url, { ...book, groups: (book.groups || []).filter(group => group !== gid) } as Book]))
    const configs = await this.getGroups()
    const nextGroups = configs.filter((group: any) => group.id !== gid)
    await runAtomic('group-delete', [
      storageTransactionStep('settings', { name: settingsKey.name, defaultValue: settingsKey.defaultValue() }, [
        { id: operationId('groups:set'), type: 'set', path: ['book_groups'], value: nextGroups },
      ]),
      storageTransactionStep('book-index', { name: booksKey.name, defaultValue: booksKey.defaultValue() }, Object.values(nextBooks).map(book => ({
        id: operationId('book:groups'), type: 'set' as const, path: [book.url], value: this.stripBookForIndex(book),
      }))),
    ])
    this.settings.book_groups = nextGroups
    this.books = nextBooks
  }

}

let instance: ReaderDatabase | null = null

export const getDatabase = async () => {
  if (!instance) {
    instance = new ReaderDatabase()
    await instance.init()
  }
  return instance
}

export const initDatabase = getDatabase
