import { getFile, putFile, removeFile } from '@/api'
import { bookSourceManager } from '@/core/book'
import JSZip from 'jszip'

// ===== 类型定义 =====
export interface Chapter {
  index: number
  title: string
  url: string
  content?: string
}

export type BookFormat = 'epub' | 'pdf' | 'mobi' | 'azw3' | 'fb2' | 'cbz' | 'txt' | 'online'

export interface Book {
  bookUrl: string
  tocUrl: string
  origin: string
  originName: string
  name: string
  author: string
  kind?: string
  coverUrl?: string
  intro?: string
  wordCount?: string
  chapters: Chapter[]
  totalChapterNum: number
  latestChapterTitle?: string
  latestChapterTime: number
  durChapterIndex: number
  durChapterTitle?: string
  durChapterPos: number
  durChapterTime: number
  addTime: number
  lastCheckTime: number
  lastCheckCount: number
  canUpdate: boolean
  format: BookFormat
  filePath?: string
  epubCfi?: string
  epubProgress?: number
  epubBookmarks?: Array<{ cfi: string; title: string; progress: number; time: number }>
  txtBookmarks?: Array<{ section: number; page?: number; title: string; progress: number; time: number }>
  durChapterPage?: number
  // 元数据
  subtitle?: string
  publisher?: string
  published?: string
  language?: string
  identifier?: string
  subjects?: string[]
  series?: any
  // 绑定文档
  bindDocId?: string
  bindDocName?: string
  autoSync?: boolean
  syncDelete?: boolean
  // 界面状态
  filterColor?: string
  filterSort?: string
  isReverse?: boolean
}

export interface BookIndex {
  bookUrl: string
  name: string
  author: string
  coverUrl?: string
  durChapterIndex: number
  totalChapterNum: number
  durChapterTime: number
  addTime: number
  lastCheckCount: number
  format: BookFormat
  epubProgress?: number
}

export interface UpdateResult {
  bookUrl: string
  hasUpdate: boolean
  newChapters: number
  latestChapterTitle: string
}

export type SortType = 'time' | 'name' | 'author' | 'update'

export const STORAGE_PATH = {
  BOOKS: '/data/storage/petal/siyuan-sireader/books',
  INDEX: '/data/storage/petal/siyuan-sireader/index.json',
}

// ===== 书架管理器 =====
class BookshelfManager {
  private index: BookIndex[] = []
  private initialized = false

  async init(force = false) {
    if (this.initialized && !force) return
    await putFile(`${STORAGE_PATH.BOOKS}/`, true, new File([], '')).catch(() => {})
    try {
      const data = await getFile(STORAGE_PATH.INDEX)
      this.index = Array.isArray(data) ? data : []
    } catch { this.index = [] }
    this.initialized = true
  }

  private getHash(bookUrl: string) {
    let h = 0
    for (let i = 0; i < bookUrl.length; i++) h = (((h << 5) - h) + bookUrl.charCodeAt(i)) | 0
    return Math.abs(h).toString(36)
  }

  private sanitizeName(name: string) {
    return name
      .replace(/[<>:"/\\|?*\x00-\x1f《》【】「」『』（）()[\]{}]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[._-]+/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 50) || 'book'
  }

  private getFileName(name: string, hash: string, ext: string) {
    return `${this.sanitizeName(name)}_${hash}.${ext}`
  }

  private async saveCoverFile(name: string, hash: string, blob: Blob) {
    const fileName = this.getFileName(name, hash, 'jpg')
    const path = `${STORAGE_PATH.BOOKS}/${fileName}`
    await putFile(path, false, new File([blob], fileName, { type: 'image/jpeg' }))
    return path
  }

  private async processCover(hash: string, url: string, name: string) {
    if (!url) return
    try {
      if (url.startsWith('data:image/')) {
        const bytes = Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0))
        return await this.saveCoverFile(name, hash, new Blob([bytes]))
      }
      if (url.startsWith('http')) {
        return await this.saveCoverFile(name, hash, await (await fetch(url)).blob())
      }
      return url
    } catch {}
  }

  private async saveIndex() {
    await putFile(STORAGE_PATH.INDEX, false, new File([JSON.stringify(this.index, null, 2)], 'index.json', { type: 'application/json' }))
  }

  async getBook(bookUrl: string) {
    try {
      const idx = this.index.find(b => b.bookUrl === bookUrl)
      if (!idx) return null
      const hash = this.getHash(bookUrl)
      const fileName = this.getFileName(idx.name, hash, 'json')
      const book = await getFile(`${STORAGE_PATH.BOOKS}/${fileName}`) as Book
      return book || null
    } catch { return null }
  }

  async saveBook(book: Book) {
    const hash = this.getHash(book.bookUrl)
    const hasFile = ['epub', 'mobi', 'azw3', 'fb2', 'pdf', 'cbz'].includes(book.format)
    const fileName = this.getFileName(book.name, hash, 'json')
    const data = { ...book, chapters: hasFile ? [] : book.chapters, coverUrl: undefined }
    await putFile(`${STORAGE_PATH.BOOKS}/${fileName}`, false, new File([JSON.stringify(data, null, 2)], fileName, { type: 'application/json' }))
    this.updateIndex(book, await this.processCover(hash, book.coverUrl || '', book.name))
    await this.saveIndex()
  }

  async updateBook(bookUrl: string, updates: Partial<Book>) {
    const book = await this.getBook(bookUrl)
    if (!book) throw new Error('书籍不存在')
    await this.saveBook({ ...book, ...updates })
  }

  async addBook(partial: Partial<Book>) {
    if (!partial.bookUrl) throw new Error('URL不能为空')
    if (this.index.some(b => b.bookUrl === partial.bookUrl)) throw new Error('书籍已存在')
    
    const format = partial.format || 'online'
    const hasFile = ['epub', 'mobi', 'azw3', 'fb2', 'pdf', 'cbz', 'txt'].includes(format)
    const now = Date.now()
    
    await this.saveBook({
      ...partial,
      bookUrl: partial.bookUrl,
      tocUrl: partial.tocUrl || '',
      origin: partial.origin || '',
      originName: partial.originName || '',
      name: partial.name || '未知书名',
      author: partial.author || '未知作者',
      chapters: hasFile ? [] : (partial.chapters || []),
      totalChapterNum: partial.totalChapterNum || 0,
      latestChapterTitle: '',
      latestChapterTime: now,
      durChapterIndex: 0,
      durChapterTitle: '',
      durChapterPos: 0,
      durChapterTime: now,
      addTime: now,
      lastCheckTime: now,
      lastCheckCount: 0,
      canUpdate: format === 'online',
      format,
      epubProgress: 0,
      epubBookmarks: [],
      txtBookmarks: []
    } as Book)
  }

  private async extractMetadata(file: File, format: string, defaultName: string) {
    if (!['epub', 'mobi', 'azw3', 'fb2', 'cbz'].includes(format)) {
      return { title: defaultName, author: '未知作者', chapters: [] }
    }
    
    try {
      const view = document.createElement('foliate-view') as any
      await view.open(file)
      
      const { metadata = {}, toc = [] } = view.book || {}
      const norm = (v: any) => typeof v === 'string' ? v : (v?.['zh-CN'] || v?.['zh'] || v?.['en'] || Object.values(v || {})[0] || '')
      const arr = (v: any) => v ? (Array.isArray(v) ? v : [v]) : []
      const contrib = (v: any) => arr(v).map(c => typeof c === 'string' ? c : norm(c?.name)).filter(Boolean).join(', ') || undefined
      
      const chapters = toc.map((t: any, i: number) => ({ 
        index: i, 
        title: norm(t.label) || `第${i + 1}章`, 
        url: t.href || '' 
      })).filter((c: any) => c.url)
      
      const coverBlob = format === 'epub' ? await this.extractEpubCover(file) : undefined
      
      view.remove()
      
      return {
        title: norm(metadata.title) || defaultName,
        subtitle: norm(metadata.subtitle),
        author: contrib(metadata.author) || '未知作者',
        publisher: contrib(metadata.publisher),
        published: metadata.published instanceof Date ? metadata.published.toISOString().split('T')[0] : metadata.published ? String(metadata.published) : undefined,
        language: arr(metadata.language)[0],
        identifier: arr(metadata.identifier)[0],
        intro: metadata.description,
        subjects: arr(metadata.subject).map((s: any) => typeof s === 'string' ? s : norm(s?.name)).filter(Boolean),
        series: Array.isArray(metadata.belongsTo) ? metadata.belongsTo[0] : metadata.belongsTo,
        coverBlob,
        chapters
      }
    } catch (e) {
      console.error('[元数据提取]', e)
      return { title: defaultName, author: '未知作者', chapters: [] }
    }
  }
  
  private async extractEpubCover(file: File): Promise<Blob | undefined> {
    try {
      const zip = await JSZip.loadAsync(file)
      const container = await zip.file('META-INF/container.xml')?.async('text')
      const opfPath = container?.match(/full-path="([^"]+)"/)?.[1]
      if (!opfPath) return
      const opf = await zip.file(opfPath)?.async('text')
      if (!opf) return
      const base = opfPath.replace(/[^/]+$/, '')
      const path = (h: string) => (base + h).replace(/\/+/g, '/')
      const blob = async (h: string) => await zip.file(path(h))?.async('blob')
      
      // EPUB3: properties="cover-image"
      let href = opf.match(/<item[^>]+properties="cover-image"[^>]+href="([^"]+)"/)?.[1] ||
                 opf.match(/<item[^>]+href="([^"]+)"[^>]+properties="cover-image"/)?.[1]
      
      // id="cover"
      if (!href) {
        const item = opf.match(/<item[^>]+id="cover(-image)?"[^>]+href="([^"]+)"/i)?.[2]
        if (item && /\.(xhtml|html)$/i.test(item)) {
          const html = await zip.file(path(item))?.async('text')
          const img = html?.match(/<(?:img|image)[^>]+(?:src|(?:xlink:)?href)="([^"]+)"/i)?.[1]
          href = img ? (item.replace(/[^/]+$/, '') + img).replace(/^\.\//, '').replace(/^\//, '') : undefined
        } else {
          href = item
        }
      }
      
      // EPUB2: <meta name="cover">
      if (!href) {
        const id = opf.match(/<meta\s+name="cover"\s+content="([^"]+)"/i)?.[1]
        href = id ? opf.match(new RegExp(`<item[^>]+id="${id}"[^>]+href="([^"]+)"`, 'i'))?.[1] : undefined
      }
      
      // 降级: 第一个图片或常见文件名
      if (!href) {
        href = opf.match(/<item[^>]+href="([^"]+\.(?:jpg|jpeg|png|gif))"/i)?.[1] ||
               ['cover.jpg', 'cover.jpeg', 'cover.png'].find(n => 
                 [n, 'Images/' + n, 'images/' + n].some(p => zip.file(path(p)))
               )
      }
      return href ? await blob(href) : undefined
    } catch {}
  }
  
  private getFormatFromPath(path: string): BookFormat {
    const ext = path.split('.').pop()?.toLowerCase() || ''
    const map: Record<string, BookFormat> = { epub: 'epub', pdf: 'pdf', mobi: 'mobi', azw3: 'azw3', azw: 'azw3', fb2: 'fb2', cbz: 'cbz', txt: 'txt' }
    return map[ext] || 'epub'
  }

  async addLocalBook(file: File) {
    const format = this.getFormatFromPath(file.name)
    const name = file.name.replace(/\.[^.]+$/, '')
    const meta = await this.extractMetadata(file, format, name)
    
    const bookUrl = `${format}://${file.name}_${file.size}`
    const hash = this.getHash(bookUrl)
    const fileName = this.getFileName(meta.title || name, hash, format)
    const filePath = `${STORAGE_PATH.BOOKS}/${fileName}`
    
    await putFile(filePath, false, file)
    await this._addBookFromMeta(bookUrl, filePath, format, format.toUpperCase(), meta)
  }
  
  async addAssetBook(assetPath: string, file: File) {
    const format = this.getFormatFromPath(file.name)
    const name = file.name.replace(/\.[^.]+$/, '')
    const meta = await this.extractMetadata(file, format, name)
    
    await this._addBookFromMeta(`asset://${assetPath}`, assetPath, format, '文档资源', meta)
  }
  
  private async _addBookFromMeta(bookUrl: string, filePath: string, format: BookFormat, originName: string, meta: any) {
    const hash = this.getHash(bookUrl)
    await this.addBook({
      bookUrl,
      name: meta.title,
      author: meta.author,
      intro: meta.intro,
      coverUrl: meta.coverBlob ? await this.saveCoverFile(meta.title, hash, meta.coverBlob) : undefined,
      origin: format,
      originName,
      format,
      filePath,
      totalChapterNum: meta.chapters?.length || 0,
      subtitle: meta.subtitle,
      publisher: meta.publisher,
      published: meta.published,
      language: meta.language,
      identifier: meta.identifier,
      subjects: meta.subjects,
      series: meta.series
    })
  }
  async removeBook(bookUrl: string) {
    const idx = this.index.find(b => b.bookUrl === bookUrl)
    if (idx) {
      const hash = this.getHash(bookUrl)
      const base = `${STORAGE_PATH.BOOKS}/${this.sanitizeName(idx.name)}_${hash}`
      await Promise.all([`${base}.json`, `${base}.jpg`, `${base}.${idx.format}`].map(p => removeFile(p).catch(() => {})))
    }
    this.index = this.index.filter(b => b.bookUrl !== bookUrl)
    await this.saveIndex()
  }

  async cacheChapterContent(bookUrl: string, chapterIndex: number, content: string) {
    const book = await this.getBook(bookUrl)
    if (book?.chapters[chapterIndex]) {
      book.chapters[chapterIndex].content = content
      await this.saveBook(book)
    }
  }

  getBooks() { return [...this.index] }
  
  hasBook(bookUrl: string) { return this.index.some(b => b.bookUrl === bookUrl) }

  async sortBooks(sortType: SortType) {
    const sorters = {
      time: (a: BookIndex, b: BookIndex) => b.durChapterTime - a.durChapterTime,
      name: (a: BookIndex, b: BookIndex) => a.name.localeCompare(b.name, 'zh-CN'),
      author: (a: BookIndex, b: BookIndex) => a.author.localeCompare(b.author, 'zh-CN'),
      update: (a: BookIndex, b: BookIndex) => b.addTime - a.addTime
    }
    this.index.sort(sorters[sortType])
    await this.saveIndex()
  }

  searchBooks(keyword: string) {
    const kw = keyword.toLowerCase()
    return keyword ? this.index.filter(b => b.name.toLowerCase().includes(kw) || b.author.toLowerCase().includes(kw)) : this.getBooks()
  }

  async checkUpdate(bookUrl: string): Promise<UpdateResult> {
    const book = await this.getBook(bookUrl)
    if (!book?.canUpdate) return { bookUrl, hasUpdate: false, newChapters: 0, latestChapterTitle: '' }

    try {
      const newChaps = await bookSourceManager.getChapters(book.origin, book.tocUrl || book.bookUrl)
      const newCount = newChaps.length - book.totalChapterNum
      const now = Date.now()
      
      if (newCount > 0) {
        book.chapters.push(...newChaps.slice(book.totalChapterNum).map((ch, i) => ({ 
          index: book.totalChapterNum + i, 
          title: ch.name || `第${book.totalChapterNum + i + 1}章`, 
          url: ch.url || '' 
        })))
        Object.assign(book, {
          totalChapterNum: newChaps.length,
          latestChapterTitle: newChaps[newChaps.length - 1].name,
          latestChapterTime: now,
          lastCheckCount: newCount,
          lastCheckTime: now
        })
      } else {
        Object.assign(book, { lastCheckCount: 0, lastCheckTime: now })
      }
      
      await this.saveBook(book)
      return { bookUrl, hasUpdate: newCount > 0, newChapters: newCount, latestChapterTitle: book.latestChapterTitle || '' }
    } catch {
      return { bookUrl, hasUpdate: false, newChapters: 0, latestChapterTitle: '' }
    }
  }

  async checkAllUpdates() { 
    return Promise.all(this.index.map(idx => this.checkUpdate(idx.bookUrl))) 
  }

  private updateIndex(book: Book, cover?: string) {
    const i = this.index.findIndex(b => b.bookUrl === book.bookUrl)
    const idx: BookIndex = {
      bookUrl: book.bookUrl,
      name: book.name,
      author: book.author,
      coverUrl: cover || this.index[i]?.coverUrl,
      durChapterIndex: book.durChapterIndex,
      totalChapterNum: book.totalChapterNum,
      durChapterTime: book.durChapterTime,
      addTime: book.addTime,
      lastCheckCount: book.lastCheckCount,
      format: book.format,
      epubProgress: book.epubProgress
    }
    i >= 0 ? (this.index[i] = idx) : this.index.push(idx)
  }
}

export const bookshelfManager = new BookshelfManager()

let plugin: any
export const initBookDataPlugin = (p: any) => plugin = p

export const loadBookData = async (bookUrl: string) => await bookshelfManager.getBook(bookUrl) || {}

export const saveBookData = async (bookUrl: string, data: any) => {
  const book = await bookshelfManager.getBook(bookUrl)
  if (!book) return
  Object.entries(data).forEach(([k, v]) => v !== undefined && ((book as any)[k] = v))
  await bookshelfManager.saveBook(book)
}
