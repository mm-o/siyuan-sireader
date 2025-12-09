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
  isEpub?: boolean
  epubPath?: string
  // EPUB 特有字段
  epubCfi?: string  // EPUB 当前阅读位置
  epubProgress?: number  // EPUB 阅读进度 0-100
  epubBookmarks?: Array<{ cfi: string; title: string; progress: number; time: number }>  // EPUB 书签
  // TXT/在线书籍书签
  txtBookmarks?: Array<{ section: number; page?: number; title: string; progress: number; time: number }>  // TXT 书签
  durChapterPage?: number  // TXT 当前页码
}

export interface BookIndex {
  bookUrl: string
  name: string
  author: string
  coverUrl?: string  // 封面路径（非base64）
  durChapterIndex: number
  totalChapterNum: number
  durChapterTime: number
  addTime: number
  lastCheckCount: number
  isEpub?: boolean
  epubProgress?: number  // EPUB阅读进度
}

export interface UpdateResult {
  bookUrl: string
  hasUpdate: boolean
  newChapters: number
  latestChapterTitle: string
}

export type SortType = 'time' | 'name' | 'author' | 'update'

const STORAGE_PATH = {
  BOOKS: '/data/storage/petal/siyuan-sireader/books/',
  INDEX: '/data/storage/petal/siyuan-sireader/index.json',
}

// ===== 书架管理器 =====
class BookshelfManager {
  private index: BookIndex[] = []
  private initialized = false

  async init(force = false) {
    if (this.initialized && !force) return
    try {
      await putFile(STORAGE_PATH.BOOKS, true, new File([], '')).catch(() => {})
      this.index = Array.isArray(await getFile(STORAGE_PATH.INDEX)) ? await getFile(STORAGE_PATH.INDEX) : []
    } catch { this.index = [] }
    this.initialized = true
  }

  private getHash(bookUrl: string): string {
    let hash = 0
    for (let i = 0; i < bookUrl.length; i++) {
      hash = ((hash << 5) - hash) + bookUrl.charCodeAt(i)
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  }

  private async saveCover(hash: string, data: string): Promise<string | undefined> {
    if (!data?.startsWith('data:image/')) return undefined
    try {
      const bytes = new Uint8Array(atob(data.split(',')[1]).split('').map(c => c.charCodeAt(0)))
      const path = `${STORAGE_PATH.BOOKS}${hash}.jpg`
      await putFile(path, false, new File([bytes], `${hash}.jpg`, { type: 'image/jpeg' }))
      return path
    } catch { return undefined }
  }

  private async downloadCover(hash: string, url: string): Promise<string | undefined> {
    if (!url || url.startsWith('data:') || url.startsWith('/icons/')) return undefined
    try {
      const blob = await (await fetch(url)).blob()
      const path = `${STORAGE_PATH.BOOKS}${hash}.jpg`
      await putFile(path, false, new File([blob], `${hash}.jpg`, { type: 'image/jpeg' }))
      return path
    } catch { return undefined }
  }

  private async saveIndex() {
    await putFile(STORAGE_PATH.INDEX, false, new File([JSON.stringify(this.index, null, 2)], 'index.json', { type: 'application/json' }))
  }

  async getBook(bookUrl: string): Promise<Book | null> {
    try {
      const book = await getFile(`${STORAGE_PATH.BOOKS}${this.getHash(bookUrl)}.json`) as Book
      if (book?.isEpub && book.epubPath && !book.chapters?.length) book.chapters = await this.getEpubChapters(book.epubPath)
      return book || null
    } catch { return null }
  }

  async saveBook(book: Book) {
    const hash = this.getHash(book.bookUrl)
    const data = book.isEpub ? { ...book, chapters: [], coverUrl: undefined } : { ...book, coverUrl: undefined }
    await putFile(`${STORAGE_PATH.BOOKS}${hash}.json`, false, new File([JSON.stringify(data, null, 2)], `${hash}.json`, { type: 'application/json' }))
    const cover = book.coverUrl?.startsWith('data:') ? await this.saveCover(hash, book.coverUrl) : book.coverUrl?.startsWith('http') ? await this.downloadCover(hash, book.coverUrl) : book.coverUrl
    this.updateIndex(book, cover)
    await this.saveIndex()
  }

  async addBook(partial: Partial<Book>) {
    if (!partial.bookUrl || this.index.some(b => b.bookUrl === partial.bookUrl)) {
      throw new Error(partial.bookUrl ? '书籍已存在' : 'URL不能为空')
    }
    
    let chapters: any[] = []
    if (partial.origin && !partial.isEpub) {
      try {
        const info = await bookSourceManager.getBookInfo(partial.origin, partial.bookUrl)
        chapters = await bookSourceManager.getChapters(partial.origin, info.tocUrl || partial.bookUrl)
      } catch {}
    }
    
    const now = Date.now()
    const chaps = partial.chapters || chapters.map((ch, i) => ({ index: i, title: ch.name || `第${i + 1}章`, url: ch.url || '' }))
    
    await this.saveBook({
      bookUrl: partial.bookUrl,
      tocUrl: partial.tocUrl || '',
      origin: partial.origin || '',
      originName: partial.originName || '',
      name: partial.name || '未知书名',
      author: partial.author || '未知作者',
      kind: partial.kind,
      coverUrl: partial.coverUrl,
      intro: partial.intro,
      wordCount: partial.wordCount,
      chapters: partial.isEpub ? [] : chaps,
      totalChapterNum: partial.totalChapterNum || chaps.length,
      latestChapterTitle: chaps[chaps.length - 1]?.title || '',
      latestChapterTime: now,
      durChapterIndex: 0,
      durChapterTitle: chaps[0]?.title || '',
      durChapterPos: 0,
      durChapterTime: now,
      addTime: now,
      lastCheckTime: now,
      lastCheckCount: 0,
      canUpdate: !partial.isEpub,
      isEpub: partial.isEpub,
      epubPath: partial.epubPath,
      epubCfi: partial.epubCfi,
      epubProgress: partial.epubProgress || 0,
      epubBookmarks: partial.epubBookmarks || [],
      txtBookmarks: partial.txtBookmarks || [],
    })
  }

  private async parseEpubMetadata(zip: JSZip, opfPath: string, opfContent: string) {
    const get = (pattern: RegExp) => opfContent.match(pattern)?.[1]
    const manifest: Record<string, string> = {}
    const spine: string[] = []
    const titles: Record<string, string> = {}
    
    opfContent.replace(/<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"/g, (_, id, href) => (manifest[id] = href, ''))
    opfContent.replace(/<itemref[^>]+idref="([^"]+)"/g, (_, id) => (spine.push(id), ''))
    
    const ncxHref = get(/<item[^>]+id="ncx"[^>]+href="([^"]+)"/)
    if (ncxHref) {
      try {
        const ncx = await zip.file(opfPath.replace(/[^/]+$/, '') + ncxHref)?.async('text')
        ncx?.replace(/<navPoint[^>]*>.*?<text>([^<]+)<\/text>.*?<content src="([^"#]+)/gs, (_, title, href) => (titles[href] = title, ''))
      } catch {}
    }
    
    return {
      title: get(/<dc:title[^>]*>([^<]+)<\/dc:title>/) || '',
      author: get(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/) || '未知作者',
      intro: get(/<dc:description[^>]*>([^<]+)<\/dc:description>/),
      chapters: spine.map((id, i) => ({ index: i, title: titles[manifest[id]?.split('/').pop() || ''] || `第${i + 1}章`, url: manifest[id] || '' })).filter(c => c.url),
      cover: async () => {
        let coverHref = get(/<item[^>]+id="cover[^"]*"[^>]+href="([^"]+)"/i)
        if (!coverHref) coverHref = get(/<item[^>]+properties="cover-image"[^>]+href="([^"]+)"/)
        if (!coverHref) coverHref = get(/<item[^>]+href="([^"]+)"[^>]+properties="cover-image"/)
        if (!coverHref) return undefined
        
        try {
          const buf = await zip.file(opfPath.replace(/[^/]+$/, '') + coverHref)?.async('arraybuffer')
          if (!buf) return undefined
          
          const bytes = new Uint8Array(buf)
          const chunkSize = 8192
          let binary = ''
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)))
          }
          const ext = coverHref.split('.').pop()?.toLowerCase() || 'jpg'
          return `data:image/${ext === 'png' ? 'png' : ext === 'gif' ? 'gif' : 'jpeg'};base64,${btoa(binary)}`
        } catch {}
      }
    }
  }
  
  async getEpubChapters(epubPath: string): Promise<Chapter[]> {
    try {
      const zip = await JSZip.loadAsync(await getFile(epubPath) as any)
      const opfPath = (await zip.file('META-INF/container.xml')?.async('text'))?.match(/full-path="([^"]+)"/)?.[1]
      if (!opfPath) return []
      const opf = await zip.file(opfPath)?.async('text')
      return opf ? (await this.parseEpubMetadata(zip, opfPath, opf)).chapters : []
    } catch { return [] }
  }

  async addEpubBook(file: File) {
    try {
      const zip = await JSZip.loadAsync(file)
      const container = await zip.file('META-INF/container.xml')?.async('text')
      if (!container) throw new Error('无效 EPUB')
      const opfPath = container.match(/full-path="([^"]+)"/)?.[1]
      if (!opfPath) throw new Error('找不到 OPF')
      const opf = await zip.file(opfPath)?.async('text')
      if (!opf) throw new Error('读取 OPF 失败')
      
      const meta = await this.parseEpubMetadata(zip, opfPath, opf)
      const bookUrl = `epub://${Date.now()}_${file.name}`
      const hash = this.getHash(bookUrl)
      const epubPath = `${STORAGE_PATH.BOOKS}${hash}.epub`
      
      await putFile(epubPath, false, file)
      
      await this.addBook({
        bookUrl,
        name: meta.title || file.name.replace('.epub', ''),
        author: meta.author,
        intro: meta.intro,
        coverUrl: await meta.cover(),
        chapters: [],
        origin: 'epub',
        originName: 'EPUB',
        isEpub: true,
        epubPath,
        totalChapterNum: meta.chapters.length
      })
    } catch (err) {
      throw new Error(`EPUB 导入失败: ${err instanceof Error ? err.message : err}`)
    }
  }

  async removeBook(bookUrl: string) {
    const hash = this.getHash(bookUrl)
    await Promise.all(['.json', '.jpg', '.epub'].map(ext => removeFile(`${STORAGE_PATH.BOOKS}${hash}${ext}`).catch(() => {})))
    this.index = this.index.filter(b => b.bookUrl !== bookUrl)
    await this.saveIndex()
  }

  async updateProgress(bookUrl: string, chapterIndex: number, chapterPos: number) {
    const book = await this.getBook(bookUrl)
    if (!book) return
    book.durChapterIndex = chapterIndex
    book.durChapterPos = chapterPos
    book.durChapterTime = Date.now()
    book.durChapterTitle = book.chapters[chapterIndex]?.title
    await this.saveBook(book)
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
      
      if (newCount > 0) {
        newChaps.slice(book.totalChapterNum).forEach((ch, i) => {
          book.chapters.push({ index: book.totalChapterNum + i, title: ch.name || `第${book.totalChapterNum + i + 1}章`, url: ch.url || '' })
        })
        book.totalChapterNum = newChaps.length
        book.latestChapterTitle = newChaps[newChaps.length - 1].name
        book.latestChapterTime = Date.now()
        book.lastCheckCount = newCount
      } else {
        book.lastCheckCount = 0
      }
      book.lastCheckTime = Date.now()
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
      bookUrl: book.bookUrl, name: book.name, author: book.author, coverUrl: cover || this.index[i]?.coverUrl,
      durChapterIndex: book.durChapterIndex, totalChapterNum: book.totalChapterNum, durChapterTime: book.durChapterTime,
      addTime: book.addTime, lastCheckCount: book.lastCheckCount, isEpub: book.isEpub, epubProgress: book.epubProgress || this.index[i]?.epubProgress
    }
    i >= 0 ? (this.index[i] = idx) : this.index.push(idx)
  }
}

export const bookshelfManager = new BookshelfManager()
