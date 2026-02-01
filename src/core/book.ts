import JSZip from 'jszip'
import { fetchSyncPost, fetchPost } from 'siyuan'
import { ruleParser } from './RuleParser'

// 规则引擎（简化版）
class RuleEngine {
  private jsonData: any = null

  replaceVariables(template: string, variables: Record<string, any>): string {
    if (!template) return ''
    let result = template.replace(/\{\{cookie\.[^}]+\}\}/g, '')
    result = result.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
      try {
        if (/^\w+$/.test(expr)) return String(variables[expr] || '')
        let computed = expr
        for (const [key, value] of Object.entries(variables)) {
          const numValue = Number(value)
          !isNaN(numValue) && (computed = computed.replace(new RegExp(`\\b${key}\\b`, 'g'), String(numValue)))
        }
        return String(Function(`'use strict'; return (${computed})`)())
      } catch { return match }
    })
    if (this.jsonData) {
      result = result.replace(/\{\$\.([^}]+)\}/g, (match, field) => {
        try { return String(this.getJsonValue(this.jsonData, field) || '') }
        catch { return match }
      })
    }
    return result
  }

  private getJsonValue(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => (o || {})[k], obj)
  }

  parseHeader(headerStr: string): Record<string, string> {
    if (!headerStr) return {}
    if (headerStr.startsWith('@js:')) {
      try {
        const result = new Function(`try{${headerStr.substring(4).trim()}}catch{return{}}`)()
        return typeof result === 'string' ? JSON.parse(result) : result
      } catch { return {} }
    }
    try { return JSON.parse(headerStr) }
    catch { return {} }
  }
}

const ruleEngine = new RuleEngine()


// 书源管理器
class BookSourceManager {
  private snippets: any[] = []

  private async request(url: string, headers = {}, method = 'GET', body = '', timeout = 30000): Promise<string> {
    try {
      const payload: any = {
        url, method, contentType: 'text/html',
        headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
        timeout
      }
      method === 'POST' && body && (payload.body = body)
      
      const res = await fetchSyncPost('/api/network/forwardProxy', payload)
      if (res?.code !== 0) {
        console.error('[请求失败]', { url, code: res?.code, msg: res?.msg })
        return ''
      }
      return res.data?.body || ''
    } catch (e: any) {
      console.error('[请求异常]', { url, error: e.message })
      return ''
    }
  }

  async loadSources() {
    const res = await fetchSyncPost('/api/snippet/getSnippet', { type: 'all', enabled: 2 })
    if (res.code === 0 && res.data?.snippets) {
      this.snippets = res.data.snippets
      const snippet = this.snippets.find((s: any) => s.type === 'js' && s.enabled && s.content?.includes('siyuanBookSources'))
      if (snippet) {
        const t: any = {}
        // 使用 Function 构造函数替代 eval，更安全
        const fn = new Function('t', snippet.content.replace(/window\./g, 't.'))
        fn(t)
        ;(window as any).siyuanBookSources = t.siyuanBookSources || { sources: [] }
        return
      }
    }
    ;(window as any).siyuanBookSources = { sources: [] }
  }

  getSources() { return (window as any).siyuanBookSources?.sources || [] }
  getEnabledSources() { return this.getSources().filter((s: any) => s.enabled) }
  exportSources() { return JSON.stringify(this.getSources(), null, 2) }
  private getSource(url: string) { return this.getSources().find((s: any) => s.bookSourceUrl === url) }

  addSource(source: BookSource) {
    const sources = this.getSources()
    const idx = sources.findIndex((s: any) => s.bookSourceUrl === source.bookSourceUrl)
    idx >= 0 ? sources[idx] = source : sources.push(source)
    this.save()
  }

  removeSource(url: string) {
    ;(window as any).siyuanBookSources.sources = this.getSources().filter((s: any) => s.bookSourceUrl !== url)
    this.save()
  }

  importSources(json: string) {
    try {
      const data = JSON.parse(json)
      const arr = Array.isArray(data) ? data : (data.sources || [])
      const sources = this.getSources()
      const imported = arr.filter((s: any) => s.bookSourceUrl && !sources.some((e: any) => e.bookSourceUrl === s.bookSourceUrl))
      if (imported.length) { sources.push(...imported); this.save() }
      return imported.length
    } catch { return 0 }
  }

  private save() {
    const sources = this.getSources()
    const snippet = this.snippets.find((s: any) => s.type === 'js' && s.enabled && s.content?.includes('siyuanBookSources'))
    const header = `// 思源阅读器 - 书源配置扩展
// ==SiReaderBookSources==
// @name         SiReader 书源数据
// @version      2.0.0
// @description  思源笔记电子书阅读增强插件书源存储
// @updateTime   ${new Date().toISOString().split('T')[0]}
// @count        ${sources.length}
// ==/SiReaderBookSources==

`
    const content = `${header}window.siyuanBookSources = {\n  sources: ${JSON.stringify(sources, null, 2)},\n  loaded: true,\n  version: '2.0.0'\n};`
    snippet ? (snippet.content = content) : this.snippets.push({ id: Date.now().toString(), name: 'SiReader 书源', type: 'js', enabled: true, content })
    fetchPost('/api/snippet/setSnippet', { snippets: this.snippets }, () => {})
  }


  async *searchBooksStream(keyword: string, sourceUrl?: string, page = 1, includeZLib = false) {
    const sources = sourceUrl ? [this.getSource(sourceUrl)].filter(Boolean) : this.getEnabledSources()
    
    // 如果启用 Z-Library，先搜索 Z-Library
    if (includeZLib && !sourceUrl) {
      try {
        const { annaArchive } = await import('./anna')
        const annaBooks = await annaArchive.search(keyword, page)
        if (annaBooks.length > 0) {
          const sourceName = annaArchive.getCurrentSource().name
          const converted = annaBooks.map(book => ({
            name: book.name,
            author: book.author,
            bookUrl: book.bookUrl,
            coverUrl: book.coverUrl,
            intro: book.intro,
            extension: book.extension,
            fileSize: book.fileSize,
            language: book.language,
            year: book.year,
            kind: [book.extension, book.language, book.year].filter(Boolean).join(' · '),
            sourceName: sourceName,
            sourceUrl: 'ebook://search'
          }))
          yield converted
        }
      } catch (e: any) {
        console.error('[EBook Search] 搜索失败:', e)
      }
    }
    
    // 搜索常规书源
    for (let i = 0; i < sources.length; i += 10) {
      const results = await Promise.allSettled(sources.slice(i, i + 10).map((s: any) => this.searchInSource(s, keyword, page)))
      for (const r of results) r.status === 'fulfilled' && r.value.length && (yield r.value)
    }
  }

  async searchBooks(keyword: string, sourceUrl?: string, page = 1, includeZLib = false) {
    const results: SearchResult[] = []
    for await (const batch of this.searchBooksStream(keyword, sourceUrl, page, includeZLib)) results.push(...batch)
    return results
  }

  private parseField(data: any, rule: string | undefined, isJson = false) {
    return rule ? ruleParser.getString(data, rule, isJson) : ''
  }

  private cleanField(value: string, type: 'url' | 'intro' | 'text' = 'text') {
    if (!value) return value
    if (type === 'url' && value[0] === '/' && value[1] === '/') return 'https:' + value
    if (type === 'intro' && value.length > 500) return value.substring(0, 500) + '...'
    if (type === 'text') return value.replace(/综合信息：\s*([^/\n]+).*/, '$1').split('\n').filter(l => l.trim())[0]?.trim() || value
    return value
  }

  private async searchInSource(source: BookSource, keyword: string, page = 1): Promise<SearchResult[]> {
    try {
      if (source.searchUrl.includes('<js>')) return []
      
      let url = source.searchUrl, method = 'GET', body = ''
      if (url.includes(',{')) {
        const [u, cfg] = url.split(',{')
        url = u
        try { const c = JSON.parse('{' + cfg); method = c.method || 'GET'; body = c.body || '' } catch {}
      }
      
      url = this.resolveUrl(ruleEngine.replaceVariables(url, { key: encodeURIComponent(keyword), page }), source.bookSourceUrl)
      body = ruleEngine.replaceVariables(body, { key: encodeURIComponent(keyword), page })
      if (!url.startsWith('http')) return []
      
      const headers = ruleEngine.parseHeader(source.header || '')
      headers['User-Agent'] || (headers['User-Agent'] = 'Mozilla/5.0')
      method === 'POST' && body && (headers['Content-Type'] = 'application/x-www-form-urlencoded')
      
      const html = await this.request(url, headers, method, body)
      if (!html || (!html.trim()[0].match(/[{\[]/) && html.length < 100)) return []
      
      const isJson = html.trim()[0] === '{' || html.trim()[0] === '['
      const books = ruleParser.getElements(html, source.ruleSearch.bookList)
      
      if (!books.length) return []
      
      const isValid = (name: string, url: string) => 
        name?.trim().length >= 2 && !/^(首页|更多|返回|下?一?页|上?一?页|列表|搜索|排行|分类|最新|收藏|书架|登[录入]|注册|查看|详[情细]|阅读|目录|章节)$|^\d+$/.test(name.trim()) && !!url?.trim()
      
      return books.slice(0, 5).map(el => {
        try {
          const json = el.getAttribute?.('data-json')
          const data = json ? (() => { try { return JSON.parse(json) } catch { return el.outerHTML } })() : el.outerHTML
          const parse = (field: keyof BookSource['ruleSearch']) => this.parseField(data, source.ruleSearch[field], isJson || !!json)
          
          return {
            name: parse('name'),
            author: this.cleanField(parse('author'), 'text'),
            bookUrl: this.resolveUrl(parse('bookUrl'), source.bookSourceUrl),
            coverUrl: this.cleanField(parse('coverUrl'), 'url'),
            intro: this.cleanField(parse('intro'), 'intro'),
            lastChapter: parse('lastChapter') || undefined,
            kind: parse('kind') || undefined,
            sourceName: source.bookSourceName, sourceUrl: source.bookSourceUrl
          }
        } catch { return null }
      }).filter((r): r is NonNullable<typeof r> => r && isValid(r.name, r.bookUrl)) as SearchResult[]
    } catch (e) {
      console.error(`[搜索失败] ${source.bookSourceName}:`, e)
      return []
    }
  }


  async getBookInfo(url: string, bookUrl: string) {
    const s = this.getSource(url)
    if (!s) throw new Error('书源不存在')
    
    if (!s.ruleBookInfo || !Object.keys(s.ruleBookInfo).length || !s.ruleBookInfo.tocUrl) {
      return {
        name: '', author: '', intro: '', coverUrl: '', tocUrl: bookUrl,
        bookUrl, sourceName: s.bookSourceName, sourceUrl: s.bookSourceUrl
      }
    }
    
    let html = await this.request(bookUrl, ruleEngine.parseHeader(s.header || ''))
    const isJson = html.trim()[0] === '{' || html.trim()[0] === '['
    
    if (isJson && s.ruleBookInfo.init) {
      try {
        const json = JSON.parse(html)
        s.ruleBookInfo.init === 'data' && json.data && (html = JSON.stringify(json.data))
      } catch (e) {
        console.error('[书籍信息] init规则执行失败:', e)
      }
    }
    
    const parse = (rule: string) => this.parseField(html, rule, isJson)
    
    return {
      name: parse(s.ruleBookInfo.name),
      author: this.cleanField(parse(s.ruleBookInfo.author), 'text'),
      intro: this.cleanField(parse(s.ruleBookInfo.intro), 'intro'),
      coverUrl: this.cleanField(parse(s.ruleBookInfo.coverUrl), 'url'),
      tocUrl: this.resolveUrl(parse(s.ruleBookInfo.tocUrl), bookUrl),
      lastChapter: parse(s.ruleBookInfo.lastChapter) || undefined,
      kind: parse(s.ruleBookInfo.kind) || undefined,
      bookUrl, sourceName: s.bookSourceName, sourceUrl: s.bookSourceUrl
    }
  }

  async getChapters(url: string, tocUrl: string) {
    const s = this.getSource(url)
    if (!s) throw new Error('书源不存在')
    
    let html = await this.request(tocUrl, ruleEngine.parseHeader(s.header || ''))
    const isJson = html.trim()[0] === '{' || html.trim()[0] === '['
    let rule = s.ruleToc.chapterList
    
    if (isJson) {
      try {
        const json = JSON.parse(html)
        if (json.data && Array.isArray(json.data) && rule === 'data') {
          html = JSON.stringify(json.data)
          rule = '$[*]'
        }
      } catch {}
    }
    
    const elements = ruleParser.getElements(html, rule)
    if (!elements.length) throw new Error('未找到章节列表')
    
    let bookidContext = ''
    if (s.ruleToc.chapterUrl?.includes('java.get')) {
      const bookidMatch = tocUrl.match(/[?&]bookid=([^&]+)/)
      bookidMatch && (bookidContext = bookidMatch[1])
    }
    
    return elements.map((el, i) => {
      const jsonStr = el.getAttribute('data-json')
      const data = jsonStr ? JSON.parse(jsonStr) : el.outerHTML
      
      let chapterUrl = s.ruleToc.chapterUrl
      bookidContext && chapterUrl?.includes('java.get') && (chapterUrl = chapterUrl.replace(/java\.get\(['"]bookid['"]\)/g, `"${bookidContext}"`))
      
      return {
        name: this.parseField(data, s.ruleToc.chapterName, isJson),
        url: this.resolveUrl(this.parseField(data, chapterUrl, isJson), tocUrl),
        index: i
      }
    })
  }

  async getChapterContent(url: string, chapterUrl: string) {
    const s = this.getSource(url)
    if (!s) throw new Error('书源不存在')
    
    const html = await this.request(chapterUrl, ruleEngine.parseHeader(s.header || ''))
    if (!html) return ''
    
    const isJson = html.trim()[0] === '{' || html.trim()[0] === '['
    let content = this.parseField(html, s.ruleContent.content, isJson)
    
    if (content && /^(\/|https?:\/\/)/.test(content)) {
      const html2 = await this.request(this.resolveUrl(content, chapterUrl), ruleEngine.parseHeader(s.header || ''))
      const jsonpMatch = html2.match(/callback\(\{content:\'(.*)\'\}\)/)
      content = jsonpMatch ? jsonpMatch[1] : html2
    }
    
    return content
  }

  private resolveUrl(url: string, baseUrl: string): string {
    if (!url) return ''
    const cleanBase = baseUrl.split('#')[0].split('?')[0]
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    if (url[0] === '/' && url[1] === '/') return 'https:' + url
    if (url[0] === '/') {
      try {
        const base = new URL(cleanBase)
        return `${base.protocol}//${base.host}${url}`
      } catch { return '' }
    }
    try { return new URL(url, cleanBase).href }
    catch { return '' }
  }
}

export const bookSourceManager = new BookSourceManager()


// EPUB 转换器
class EpubConverter {
  async convertToEpub(bookInfo: BookInfo, chapters: Chapter[]): Promise<Blob> {
    const zip = new JSZip()
    zip.file('META-INF/container.xml', this.getContainerXml())
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
    const chapterContents: string[] = []
    for (const chapter of chapters) {
      try {
        const content = await bookSourceManager.getChapterContent(bookInfo.sourceUrl, chapter.url)
        chapterContents.push(this.cleanContent(content))
      } catch {
        chapterContents.push('章节内容获取失败')
      }
    }
    zip.file('OEBPS/content.opf', this.getContentOpf(bookInfo, chapters))
    zip.file('OEBPS/toc.ncx', this.getTocNcx(bookInfo, chapters))
    chapters.forEach((chapter, i) => {
      zip.file(`OEBPS/chapter${i + 1}.xhtml`, this.getChapterXhtml(chapter.name, chapterContents[i]))
    })
    zip.file('OEBPS/style.css', this.getStyleCss())
    return zip.generateAsync({ type: 'blob' })
  }
  
  private cleanContent(html: string): string {
    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ').trim()
  }
  
  private getContainerXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  }
  
  private getContentOpf(book: BookInfo, chapters: Chapter[]): string {
    const manifest = chapters.map((_, i) => 
      `<item id="chapter${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`
    ).join('\n    ')
    const spine = chapters.map((_, i) => 
      `<itemref idref="chapter${i + 1}"/>`
    ).join('\n    ')
    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${this.escape(book.name)}</dc:title>
    <dc:creator>${this.escape(book.author)}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:identifier id="BookId">${Date.now()}</dc:identifier>
    <dc:description>${this.escape(book.intro || '')}</dc:description>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>
    ${manifest}
  </manifest>
  <spine toc="ncx">
    ${spine}
  </spine>
</package>`
  }
  
  private getTocNcx(book: BookInfo, chapters: Chapter[]): string {
    const navPoints = chapters.map((chapter, i) => 
      `<navPoint id="chapter${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${this.escape(chapter.name)}</text></navLabel>
      <content src="chapter${i + 1}.xhtml"/>
    </navPoint>`
    ).join('\n    ')
    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${Date.now()}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${this.escape(book.name)}</text></docTitle>
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`
  }
  
  private getChapterXhtml(title: string, content: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${this.escape(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>${this.escape(title)}</h1>
  <div class="content">${content}</div>
</body>
</html>`
  }
  
  private getStyleCss(): string {
    return `body { margin: 20px; font-family: serif; line-height: 1.8; }
h1 { text-align: center; margin-bottom: 2em; }
.content p { text-indent: 2em; margin-bottom: 1em; }
img { max-width: 100%; height: auto; }`
  }
  
  private escape(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }
}

export const epubConverter = new EpubConverter()
