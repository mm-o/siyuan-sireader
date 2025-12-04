import JSZip from 'jszip'
import { fetchSyncPost, fetchPost } from 'siyuan'
import { ruleParser, CssParser } from './RuleParser'

// ==================== 规则引擎 ====================
class RuleEngine {
  private jsonData: any = null

  replaceVariables(template: string, variables: Record<string, any>): string {
    if (!template) return ''
    let result = template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
      try {
        if (/^\w+$/.test(expr)) return String(variables[expr] || '')
        let computed = expr
        for (const [key, value] of Object.entries(variables)) {
          const numValue = Number(value)
          if (!isNaN(numValue)) computed = computed.replace(new RegExp(`\\b${key}\\b`, 'g'), String(numValue))
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

  parseRule(html: string, rule: string): string {
    if (!html || !rule) return ''
    try {
      if (rule.startsWith('@JSon:')) return this.parseJsonPath(html, rule.substring(6))
      if (rule.includes('||')) return rule.split('||').map(r => r.trim()).reduce((res, r) => res || this.parseRule(html, r), '')
      if (rule.includes('&&')) return rule.split('&&').map(r => r.trim()).reduce((res, r) => res || this.parseSingleRule(html, r), '')
      return this.parseSingleRule(html, rule)
    } catch { return '' }
  }

  private parseJsonPath(jsonStr: string, path: string): string {
    try {
      const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr
      this.jsonData = data
      if (path.startsWith('$..')) {
        const results: any[] = []
        const search = (obj: any) => {
          if (obj && typeof obj === 'object') {
            if (path.substring(3) in obj) results.push(obj[path.substring(3)])
            Object.values(obj).forEach(search)
          }
        }
        search(data)
        return results[0] ? String(results[0]) : ''
      }
      return path.startsWith('$.') ? String(this.getJsonValue(data, path.substring(2)) || '') : ''
    } catch { return '' }
  }
  
  private parseSingleRule(html: string, rule: string): string {
    let result = html
    const parts = rule.split('@')
    if (parts[0]) {
      const elements = this.selectElements(result, parts[0])
      if (!elements.length) return ''
      result = elements[0].outerHTML
    }
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]
      if (part.startsWith('js:')) result = this.executeJs(result, part.substring(3))
      else if (part.includes('##')) {
        const [attr, ...regexParts] = part.split('##')
        if (attr) result = this.extractAttribute(result, attr)
        if (regexParts.length) result = this.applyRegex(result, regexParts.join('##'))
      } else result = this.extractAttribute(result, part)
    }
    return result.trim()
  }

  private executeJs(input: string, code: string): string {
    try {
      return String(new Function('result', `try{${code};return result}catch{return result}`)(input) || '')
    } catch { return input }
  }
  
  private selectElements(html: string, selector: string): Element[] {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    if (selector.startsWith('class.')) return Array.from(doc.querySelectorAll(`.${selector.substring(6)}`))
    if (selector.startsWith('id.')) { const el = doc.getElementById(selector.substring(3)); return el ? [el] : [] }
    if (selector.startsWith('tag.')) {
      const match = selector.match(/^tag\.([^.]+)(?:\.(\d+))?$/)
      if (match) {
        const elements = Array.from(doc.getElementsByTagName(match[1]))
        return match[2] !== undefined ? (elements[parseInt(match[2])] ? [elements[parseInt(match[2])]] : []) : elements
      }
    }
    return this.evaluateCssSelector(html, selector)
  }
  
  private extractAttribute(html: string, attr: string): string {
    const el = new DOMParser().parseFromString(html, 'text/html').body.firstElementChild
    if (!el) return html
    if (attr === 'text') return el.textContent?.trim() || ''
    if (attr === 'textNodes') return Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent?.trim()).filter(t => t).join('\n')
    if (attr === 'html') return el.innerHTML || ''
    return el.getAttribute(attr) || (attr === 'href' || attr === 'src' || attr === 'data-src' || attr === 'value' ? '' : html)
  }

  private applyRegex(text: string, pattern: string): string {
    try {
      const match = pattern.match(/^\/(.*)\/\s([gimsuy]*)$/)
      return text.replace(match ? new RegExp(match[1], match[2]) : new RegExp(pattern, 'g'), '')
    } catch { return text }
  }

  private evaluateCssSelector(html: string, selector: string): Element[] {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const eqMatch = selector.match(/^(.+):eq\((\d+)\)$/)
    if (eqMatch) { const els = Array.from(doc.querySelectorAll(eqMatch[1])); return els[parseInt(eqMatch[2])] ? [els[parseInt(eqMatch[2])]] : [] }
    if (selector.endsWith(':first')) { const els = Array.from(doc.querySelectorAll(selector.replace(/:first$/, ''))); return els[0] ? [els[0]] : [] }
    if (selector.endsWith(':last')) { const els = Array.from(doc.querySelectorAll(selector.replace(/:last$/, ''))); return els.length ? [els[els.length - 1]] : [] }
    try { return Array.from(doc.querySelectorAll(selector)) }
    catch { return [] }
  }

  getString(html: string, rule: string, context: RuleContext = {}): string {
    if (!html || !rule) return ''
    const finalRule = this.replaceVariables(rule, context)
    if (typeof html !== 'string' && typeof html === 'object' && html[finalRule] !== undefined) return String(html[finalRule])
    return this.parseRule(html, finalRule)
  }

  getElements(html: string, rule: string, context: RuleContext = {}): Element[] {
    if (!html || !rule) return []
    let finalRule = this.replaceVariables(rule, context)
    if (finalRule.includes('<js>')) {
      const selectorLine = finalRule.split('\n')[0].trim()
      if (!selectorLine || selectorLine.startsWith('<js>')) return []
      finalRule = selectorLine
    }
    if (finalRule.startsWith('$.')) finalRule = '@JSon:' + finalRule
    if (finalRule.startsWith('@JSon:')) {
      try {
        const data = typeof html === 'string' ? JSON.parse(html) : html
        const result = finalRule.startsWith('@JSon:$.') ? this.getJsonValue(data, finalRule.substring(8)) : null
        if (Array.isArray(result)) {
          return result.map((item, index) => {
            const div = document.createElement('div')
            div.setAttribute('data-json', JSON.stringify(item))
            div.setAttribute('data-index', String(index))
            return div
          })
        }
      } catch {}
      return []
    }
    // 使用 CssParser 处理完整的选择器链（包括 @li@a 等）
    const parser = new CssParser(html)
    return parser.getElements(finalRule)
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

// ==================== 书源管理器 ====================
class BookSourceManager {
  private snippets: any[] = []

  // 网络请求
  private async request(url: string, headers = {}): Promise<string> {
    try {
      const res = await fetchSyncPost('/api/network/forwardProxy', {
        url, method: 'GET', contentType: 'text/html',
        headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
        timeout: 15000
      })
      return res?.code === 0 ? res.data?.body || '' : ''
    } catch { return '' }
  }

  // 加载书源
  async loadSources() {
    const res = await fetchSyncPost('/api/snippet/getSnippet', { type: 'all', enabled: 2 })
    if (res.code === 0 && res.data?.snippets) {
      this.snippets = res.data.snippets
      const snippet = this.snippets.find(s => s.type === 'js' && s.enabled && s.content?.includes('siyuanBookSources'))
      if (snippet) {
        const t: any = {}
        eval(snippet.content.replace(/window\./g, 't.')) // eslint-disable-line no-eval
        ;(window as any).siyuanBookSources = t.siyuanBookSources || { sources: [] }
        return
      }
    }
    ;(window as any).siyuanBookSources = { sources: [] }
  }

  getSources() { return (window as any).siyuanBookSources?.sources || [] }
  getEnabledSources() { return this.getSources().filter(s => s.enabled) }
  exportSources() { return JSON.stringify(this.getSources(), null, 2) }
  private getSource(url: string) { return this.getSources().find(s => s.bookSourceUrl === url) }

  addSource(source: BookSource) {
    const sources = this.getSources()
    const idx = sources.findIndex(s => s.bookSourceUrl === source.bookSourceUrl)
    idx >= 0 ? sources[idx] = source : sources.push(source)
    this.save()
  }

  removeSource(url: string) {
    ;(window as any).siyuanBookSources.sources = this.getSources().filter(s => s.bookSourceUrl !== url)
    this.save()
  }

  importSources(json: string) {
    try {
      const data = JSON.parse(json)
      const arr = Array.isArray(data) ? data : (data.sources || [])
      const sources = this.getSources()
      const imported = arr.filter(s => s.bookSourceUrl && !sources.some(e => e.bookSourceUrl === s.bookSourceUrl))
      if (imported.length) { sources.push(...imported); this.save() }
      return imported.length
    } catch { return 0 }
  }

  private save() {
    const sources = this.getSources()
    const snippet = this.snippets.find(s => s.type === 'js' && s.enabled && s.content?.includes('siyuanBookSources'))
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
    if (snippet) snippet.content = content
    else this.snippets.push({ id: Date.now().toString(), name: 'SiReader 书源', type: 'js', enabled: true, content })
    fetchPost('/api/snippet/setSnippet', { snippets: this.snippets }, () => {})
  }

  // 搜索方法
  async *searchBooksStream(keyword: string, sourceUrl?: string, page = 1) {
    const sources = sourceUrl ? [this.getSource(sourceUrl)].filter(Boolean) : this.getEnabledSources()
    for (let i = 0; i < sources.length; i += 10) {
      const results = await Promise.allSettled(sources.slice(i, i + 10).map(s => this.searchInSource(s, keyword, page)))
      for (const r of results) if (r.status === 'fulfilled' && r.value.length) yield r.value
    }
  }

  async searchBooks(keyword: string, sourceUrl?: string, page = 1) {
    const results: SearchResult[] = []
    for await (const batch of this.searchBooksStream(keyword, sourceUrl, page)) results.push(...batch)
    return results
  }

  private parseField(data: any, rule: string | undefined, isJson: boolean = false) {
    if (!rule) return ''
    return ruleParser.getString(data, rule, isJson)
  }

  private cleanField(value: string, type: 'url' | 'intro' | 'text' = 'text') {
    if (!value) return value
    if (type === 'url' && value.startsWith('//')) return 'https:' + value
    if (type === 'intro' && value.length > 500) return value.substring(0, 500) + '...'
    if (type === 'text') return value.replace(/综合信息：\s*([^/\n]+).*/, '$1').split('\n').filter(l => l.trim())[0]?.trim() || value
    return value
  }

  private async searchInSource(source: BookSource, keyword: string, page = 1): Promise<SearchResult[]> {
    try {
      if (source.searchUrl.includes('<js>')) return []
      let url = this.resolveUrl(ruleEngine.replaceVariables(source.searchUrl, { key: encodeURIComponent(keyword), page }), source.bookSourceUrl)
      if (url.includes(',{')) url = url.split(',{')[0]
      if (!url.startsWith('http')) return []
      
      const headers = ruleEngine.parseHeader(source.header || '')
      if (!headers['User-Agent']) headers['User-Agent'] = 'Mozilla/5.0'
      const html = await this.request(url, headers)
      if (!html || (!html.trim().startsWith('{') && !html.trim().startsWith('[') && html.length < 100)) return []
      
      const isJson = html.trim().startsWith('{') || html.trim().startsWith('[')
      const books = ruleParser.getElements(html, source.ruleSearch.bookList)
      if (!books.length) return []
      
      // 智能识别无效内容
      const isValid = (name: string, url: string) => 
        name?.trim().length >= 2 && !/^(首页|更多|返回|下?一?页|上?一?页|列表|搜索|排行|分类|最新|收藏|书架|登[录入]|注册|查看|详[情细]|阅读|目录|章节)$|^\d+$/.test(name.trim()) && !!url?.trim()
      
      return books.slice(0, 5).map((el) => {
        try {
          const json = el.getAttribute?.('data-json')
          const data = json ? (() => { try { return JSON.parse(json) } catch { return el.outerHTML } })() : el.outerHTML
          const parse = (field: keyof BookSource['ruleSearch']) => {
            const rule = source.ruleSearch[field]
            return this.parseField(data, rule, isJson || !!json)
          }
          
          const result = {
            name: parse('name'),
            author: this.cleanField(parse('author'), 'text'),
            bookUrl: this.resolveUrl(parse('bookUrl'), source.bookSourceUrl),
            coverUrl: this.cleanField(parse('coverUrl'), 'url'),
            intro: this.cleanField(parse('intro'), 'intro'),
            lastChapter: parse('lastChapter') || undefined,
            kind: parse('kind') || undefined,
            sourceName: source.bookSourceName, sourceUrl: source.bookSourceUrl
          }
          return result
        } catch (error) {
          return null
        }
      }).filter((r): r is NonNullable<typeof r> => r && isValid(r.name, r.bookUrl)) as SearchResult[]
    } catch { return [] }
  }

  async getBookInfo(url: string, bookUrl: string) {
    const s = this.getSource(url)
    if (!s) throw new Error('书源不存在')
    const html = await this.request(bookUrl, ruleEngine.parseHeader(s.header || ''))
    const isJson = html.trim().startsWith('{') || html.trim().startsWith('[')
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
    
    const html = await this.request(tocUrl, ruleEngine.parseHeader(s.header || ''))
    const isJson = html.trim().startsWith('{') || html.trim().startsWith('[')
    const elements = ruleEngine.getElements(html, s.ruleToc.chapterList)
    if (!elements.length) throw new Error('未找到章节列表')
    
    return elements.map((c, i) => {
      const name = this.parseField(c.outerHTML, s.ruleToc.chapterName, isJson)
      const url = this.parseField(c.outerHTML, s.ruleToc.chapterUrl, isJson)
      return { name, url: this.resolveUrl(url, tocUrl), index: i }
    })
  }

  async getChapterContent(url: string, chapterUrl: string) {
    const s = this.getSource(url)
    if (!s) throw new Error('书源不存在')
    
    const headers = ruleEngine.parseHeader(s.header || '')
    const html = await this.request(chapterUrl, headers)
    const isJson = html.trim().startsWith('{') || html.trim().startsWith('[')
    
    let content = this.parseField(html, s.ruleContent.content, isJson)
    
    // 二次请求：内容是URL
    if (content && /^(\/|https?:\/\/)/.test(content)) {
      try {
        const contentHtml = await this.request(this.resolveUrl(content, chapterUrl), headers)
        const jsonpMatch = contentHtml.match(/callback\(\{content:\'(.*)\'\}\)/)
        content = jsonpMatch ? jsonpMatch[1] : contentHtml
      } catch {
        // 静默失败
      }
    }
    
    return content
  }

  private resolveUrl(url: string, baseUrl: string): string {
    if (!url) return ''
    const cleanBase = baseUrl.split('#')[0].split('?')[0]
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    if (url.startsWith('//')) return 'https:' + url
    if (url.startsWith('/')) {
      try {
        const base = new URL(cleanBase)
        return `${base.protocol}//${base.host}${url}`
      } catch {
        return ''
      }
    }
    try {
      return new URL(url, cleanBase).href
    } catch {
      return ''
    }
  }
}

export const bookSourceManager = new BookSourceManager()

// ==================== EPUB 转换器 ====================
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
