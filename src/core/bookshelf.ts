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
  durChapterIndex: number
  totalChapterNum: number
  durChapterTime: number
  addTime: number
  lastCheckCount: number
  isEpub?: boolean  // EPUB 标记
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
  EPUB: '/data/storage/petal/siyuan-sireader/epub/',
  INDEX: '/data/storage/petal/siyuan-sireader/index.json',
}

// ===== 书架管理器 =====
class BookshelfManager {
  private index: BookIndex[] = []
  private initialized = false

  async init(force = false) {
    if (this.initialized && !force) return
    try {
      this.index = Array.isArray(await getFile(STORAGE_PATH.INDEX)) ? await getFile(STORAGE_PATH.INDEX) : []
    } catch {
      this.index = []
    }
    this.initialized = true
  }

  private async saveIndex() {
    await putFile(STORAGE_PATH.INDEX, false, new File([JSON.stringify(this.index, null, 2)], 'index.json', { type: 'application/json' }))
  }

  async getBook(bookUrl: string): Promise<Book | null> {
    const idx = this.index.find(b => b.bookUrl === bookUrl)
    if (!idx) return null
    try {
      const book = await getFile(`${STORAGE_PATH.BOOKS}${this.getFilename(idx.name, idx.author)}`) as Book
      if (book?.isEpub && book.epubPath && !book.chapters?.length) {
        book.chapters = await this.getEpubChapters(book.epubPath)
      }
      return book || null
    } catch {
      return null
    }
  }

  async saveBook(book: Book) {
    const filename = this.getFilename(book.name, book.author)
    const data = book.isEpub ? { ...book, chapters: [] } : book
    await putFile(`${STORAGE_PATH.BOOKS}${filename}`, false, new File([JSON.stringify(data, null, 2)], filename, { type: 'application/json' }))
    this.updateIndex(book)
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
        // 多种方式查找封面
        let coverHref = get(/<item[^>]+id="cover[^"]*"[^>]+href="([^"]+)"/i)
        if (!coverHref) coverHref = get(/<item[^>]+properties="cover-image"[^>]+href="([^"]+)"/)
        if (!coverHref) coverHref = get(/<item[^>]+href="([^"]+)"[^>]+properties="cover-image"/)
        if (!coverHref) return undefined
        
        try {
          const coverPath = opfPath.replace(/[^/]+$/, '') + coverHref
          const buf = await zip.file(coverPath)?.async('arraybuffer')
          if (!buf) return undefined
          
          // 分块转换为 base64，避免堆栈溢出
          const bytes = new Uint8Array(buf)
          const chunkSize = 8192
          let binary = ''
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
            binary += String.fromCharCode(...chunk)
          }
          const b64 = btoa(binary)
          
          const ext = coverHref.split('.').pop()?.toLowerCase() || 'jpg'
          return `data:image/${ext === 'png' ? 'png' : ext === 'gif' ? 'gif' : 'jpeg'};base64,${b64}`
        } catch (e) {
          console.warn('[SiReader] 封面提取失败:', e)
        }
      }
    }
  }
  
  async getEpubChapters(epubPath: string): Promise<Chapter[]> {
    try {
      const file = await getFile(epubPath)
      if (!file) return []
      const zip = await JSZip.loadAsync(file as any)
      const container = await zip.file('META-INF/container.xml')?.async('text')
      const opfPath = container?.match(/full-path="([^"]+)"/)?.[1]
      if (!opfPath) return []
      const opf = await zip.file(opfPath)?.async('text')
      if (!opf) return []
      const meta = await this.parseEpubMetadata(zip, opfPath, opf)
      return meta.chapters
    } catch {
      return []
    }
  }

  async addEpubBook(file: File) {
    // 清理文件名：移除 .epub，替换所有特殊字符（包括中文标点）为下划线
    const cleanName = file.name
      .replace('.epub', '')
      .replace(/[\\/:*?"<>|《》（）【】「」『』、，。；：！？]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .trim()
      .substring(0, 80) || 'book'
    const filename = `${Date.now()}_${cleanName}.epub`
    const epubPath = `${STORAGE_PATH.EPUB}${filename}`
    
    console.log('[SiReader] EPUB 文件名处理:', { 原始: file.name, 清理后: cleanName, 最终: filename })
    
    try {
      const zip = await JSZip.loadAsync(file)
      const container = await zip.file('META-INF/container.xml')?.async('text')
      if (!container) throw new Error('无效 EPUB')
      
      const opfPath = container.match(/full-path="([^"]+)"/)?.[1]
      if (!opfPath) throw new Error('找不到 OPF')
      
      const opf = await zip.file(opfPath)?.async('text')
      if (!opf) throw new Error('读取 OPF 失败')
      
      const meta = await this.parseEpubMetadata(zip, opfPath, opf)
      await putFile(epubPath, false, file)
      
      await this.addBook({
        bookUrl: `epub://${filename}`,
        name: meta.title || cleanName,
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
      try { await removeFile(epubPath) } catch {}
      throw new Error(`EPUB 导入失败: ${err instanceof Error ? err.message : err}`)
    }
  }

  async removeBook(bookUrl: string) {
    const idx = this.index.find(b => b.bookUrl === bookUrl)
    if (idx) {
      const book = await this.getBook(bookUrl)
      try {
        await removeFile(`${STORAGE_PATH.BOOKS}${this.getFilename(idx.name, idx.author)}`)
        if (book?.epubPath) await removeFile(book.epubPath)
      } catch {}
    }
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

  private getFilename(name: string, author: string) {
    const clean = (s: string) => s ? s.replace(/[\\/:*?"<>|\s]/g, '_').replace(/_{2,}/g, '_').trim().substring(0, 50) || 'unknown' : 'unknown'
    const [n, a] = [clean(name), clean(author)]
    return `${a !== 'unknown' ? `${n}_${a}` : n}.json`
  }

  private updateIndex(book: Book) {
    const i = this.index.findIndex(b => b.bookUrl === book.bookUrl)
    const idx: BookIndex = {
      bookUrl: book.bookUrl,
      name: book.name,
      author: book.author,
      durChapterIndex: book.durChapterIndex,
      totalChapterNum: book.totalChapterNum,
      durChapterTime: book.durChapterTime,
      addTime: book.addTime,
      lastCheckCount: book.lastCheckCount,
      isEpub: book.isEpub,  // EPUB 标记
    }
    i >= 0 ? (this.index[i] = idx) : this.index.push(idx)
  }
}

export const bookshelfManager = new BookshelfManager()
