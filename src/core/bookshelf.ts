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
  BOOKS: '/data/storage/petal/siyuan-sireader/books/',
  INDEX: '/data/storage/petal/siyuan-sireader/index.json',
}

// ===== 书架管理器 =====
class BookshelfManager {
  private index: BookIndex[] = []
  private initialized = false

  async init(force = false) {
    if (this.initialized && !force) return
    await putFile(STORAGE_PATH.BOOKS, true, new File([], '')).catch(() => {})
    try {
      const data = await getFile(STORAGE_PATH.INDEX)
      this.index = Array.isArray(data) ? data : []
    } catch { this.index = [] }
    this.initialized = true
  }

  private getHash(bookUrl: string) {
    let h = 0
    for (let i = 0; i < bookUrl.length; i++) h = ((h << 5) - h + bookUrl.charCodeAt(i)) | 0
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
    const path = `${STORAGE_PATH.BOOKS}${fileName}`
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
      const fileName = this.getFileName(idx.name, this.getHash(bookUrl), 'json')
      const book = await getFile(`${STORAGE_PATH.BOOKS}${fileName}`) as Book
      if (!book) return null
      if (['epub', 'mobi', 'azw3', 'fb2'].includes(book.format) && book.filePath && !book.chapters?.length) {
        book.chapters = await this.getEpubChapters(book.filePath)
      }
      return book
    } catch { return null }
  }

  async saveBook(book: Book) {
    const hash = this.getHash(book.bookUrl)
    const hasFile = ['epub', 'mobi', 'azw3', 'fb2', 'pdf', 'cbz'].includes(book.format)
    const fileName = this.getFileName(book.name, hash, 'json')
    const data = { ...book, chapters: hasFile ? [] : book.chapters, coverUrl: undefined }
    await putFile(`${STORAGE_PATH.BOOKS}${fileName}`, false, new File([JSON.stringify(data, null, 2)], fileName, { type: 'application/json' }))
    
    this.updateIndex(book, await this.processCover(hash, book.coverUrl || '', book.name))
    await this.saveIndex()
  }

  async addBook(partial: Partial<Book>) {
    if (!partial.bookUrl) throw new Error('URL不能为空')
    if (this.index.some(b => b.bookUrl === partial.bookUrl)) throw new Error('书籍已存在')
    
    const format = partial.format || 'online'
    const hasFile = ['epub', 'mobi', 'azw3', 'fb2', 'pdf', 'cbz', 'txt'].includes(format)
    
    let chapters: any[] = []
    if (partial.origin && format === 'online') {
      try {
        const info = await bookSourceManager.getBookInfo(partial.origin, partial.bookUrl)
        chapters = await bookSourceManager.getChapters(partial.origin, info.tocUrl || partial.bookUrl)
      } catch {}
    }
    
    const now = Date.now()
    const chaps = partial.chapters || chapters.map((ch, i) => ({ index: i, title: ch.name || `第${i + 1}章`, url: ch.url || '' }))
    
    await this.saveBook({
      ...partial,
      bookUrl: partial.bookUrl,
      tocUrl: partial.tocUrl || '',
      origin: partial.origin || '',
      originName: partial.originName || '',
      name: partial.name || '未知书名',
      author: partial.author || '未知作者',
      chapters: hasFile ? [] : chaps,
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
      canUpdate: format === 'online',
      format,
      epubProgress: 0,
      epubBookmarks: [],
      txtBookmarks: []
    } as Book)
  }

  private async parseEpubMetadata(zip: JSZip, opfPath: string, opf: string) {
    const get = (p: RegExp) => opf.match(p)?.[1]
    const manifest: Record<string, string> = {}
    const spine: string[] = []
    const titles: Record<string, string> = {}
    const baseDir = opfPath.replace(/[^/]+$/, '')
    
    opf.replace(/<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"/g, (_, id, href) => (manifest[id] = href, ''))
    opf.replace(/<itemref[^>]+idref="([^"]+)"/g, (_, id) => (spine.push(id), ''))
    
    const ncxHref = get(/<item[^>]+id="ncx"[^>]+href="([^"]+)"/)
    if (ncxHref) {
      try {
        const ncx = await zip.file(baseDir + ncxHref)?.async('text')
        ncx?.replace(/<navPoint[^>]*>.*?<text>([^<]+)<\/text>.*?<content src="([^"#]+)/gs, (_, t, h) => (titles[h] = t, ''))
      } catch {}
    }
    
    const getCover = async () => {
      const href = get(/<item[^>]+id="cover[^"]*"[^>]+href="([^"]+)"/i) || get(/<item[^>]+properties="cover-image"[^>]+href="([^"]+)"/) || get(/<item[^>]+href="([^"]+)"[^>]+properties="cover-image"/)
      if (!href) return
      try {
        const buf = await zip.file(baseDir + href)?.async('arraybuffer')
        if (!buf) return
        const bytes = new Uint8Array(buf)
        let binary = ''
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)))
        const ext = href.split('.').pop()?.toLowerCase() || 'jpg'
        return `data:image/${ext === 'png' ? 'png' : ext === 'gif' ? 'gif' : 'jpeg'};base64,${btoa(binary)}`
      } catch {}
    }
    
    return {
      title: get(/<dc:title[^>]*>([^<]+)<\/dc:title>/) || '',
      author: get(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/) || '未知作者',
      intro: get(/<dc:description[^>]*>([^<]+)<\/dc:description>/),
      chapters: spine.map((id, i) => ({ index: i, title: titles[manifest[id]?.split('/').pop() || ''] || `第${i + 1}章`, url: manifest[id] || '' })).filter(c => c.url),
      cover: getCover
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

  private detectFormat(file: File): BookFormat {
    const ext = file.name.split('.').pop()?.toLowerCase()
    const formats: Record<string, BookFormat> = { epub: 'epub', pdf: 'pdf', mobi: 'mobi', azw3: 'azw3', azw: 'azw3', fb2: 'fb2', cbz: 'cbz', txt: 'txt' }
    return formats[ext || ''] || 'epub'
  }

  async addLocalBook(file: File) {
    const format = this.detectFormat(file)
    const bookUrl = `${format}://${Date.now()}_${file.name}`
    const defaultName = file.name.replace(/\.[^.]+$/, '')
    
    let meta = { title: defaultName, author: '未知作者', intro: undefined, cover: undefined, chapters: [] }
    if (format === 'epub') {
      try {
        const zip = await JSZip.loadAsync(file)
        const opfPath = (await zip.file('META-INF/container.xml')?.async('text'))?.match(/full-path="([^"]+)"/)?.[1]
        if (opfPath) {
          const opf = await zip.file(opfPath)?.async('text')
          if (opf) {
            const parsed = await this.parseEpubMetadata(zip, opfPath, opf)
            meta = { title: parsed.title, author: parsed.author, intro: parsed.intro, cover: await parsed.cover(), chapters: parsed.chapters }
          }
        }
      } catch {}
    }
    
    const bookName = meta.title || defaultName
    const hash = this.getHash(bookUrl)
    const fileName = this.getFileName(bookName, hash, format)
    
    await putFile(`${STORAGE_PATH.BOOKS}${fileName}`, false, file)
    await this.addBook({
      bookUrl,
      name: bookName,
      author: meta.author,
      intro: meta.intro,
      coverUrl: meta.cover,
      origin: format,
      originName: format.toUpperCase(),
      format,
      filePath: `${STORAGE_PATH.BOOKS}${fileName}`,
      totalChapterNum: meta.chapters?.length || 0
    })
  }



  async removeBook(bookUrl: string) {
    const idx = this.index.find(b => b.bookUrl === bookUrl)
    if (idx) {
      const hash = this.getHash(bookUrl)
      await Promise.all(['json', 'jpg', idx.format].map(ext => 
        removeFile(`${STORAGE_PATH.BOOKS}${this.getFileName(idx.name, hash, ext)}`).catch(() => {})
      ))
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
      
      if (newCount > 0) {
        book.chapters.push(...newChaps.slice(book.totalChapterNum).map((ch, i) => ({ 
          index: book.totalChapterNum + i, 
          title: ch.name || `第${book.totalChapterNum + i + 1}章`, 
          url: ch.url || '' 
        })))
        Object.assign(book, {
          totalChapterNum: newChaps.length,
          latestChapterTitle: newChaps[newChaps.length - 1].name,
          latestChapterTime: Date.now(),
          lastCheckCount: newCount,
          lastCheckTime: Date.now()
        })
      } else {
        book.lastCheckCount = 0
        book.lastCheckTime = Date.now()
      }
      
      await this.saveBook(book)
      return { bookUrl, hasUpdate: newCount > 0, newChapters: newCount, latestChapterTitle: book.latestChapterTitle || '' }
    } catch {
      return { bookUrl, hasUpdate: false, newChapters: 0, latestChapterTitle: '' }
    }
  }

  async checkAllUpdates() { return Promise.all(this.index.map(idx => this.checkUpdate(idx.bookUrl))) }

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
      epubProgress: book.epubProgress || this.index[i]?.epubProgress
    }
    i >= 0 ? (this.index[i] = idx) : this.index.push(idx)
  }
}

export const bookshelfManager = new BookshelfManager()
