import { bookshelfManager } from '@/core/bookshelf'
import type { RemoteBookInfo, RemoteDownloadRequest, OnlineBookImportInfo } from '@/composables/useBookImport'
import { registerPrivateSources } from '@private-sources'
import { registerWereadAgentSources } from '@/weread/agent'

type HttpSourceType = 'anna' | 'gutenberg' | 'standardebooks' | 'custom' | (string & {})

interface HttpSourceSelectors {
  item: string
  title: string
  author?: string
  link: string
  cover?: string
  intro?: string
}

interface HttpSourceConfig {
  id: string
  name: string
  type: HttpSourceType
  enabled: boolean
  private?: boolean
  url?: string
  searchUrl?: string
  domains?: string[]
  currentDomain?: string
  requestPrefix?: string
  requiresAuth?: boolean
  auth?: { email?: string; password?: string; userId?: string; userKey?: string; cookies?: string }
  filters?: { extensions?: string[] }
  selectors?: HttpSourceSelectors
  bookUrlPrefix?: string
}

interface HttpBook {
  name: string
  author: string
  bookUrl: string
  downloadUrl?: string
  readUrl?: string
  canDownload?: boolean
  privateData?: any
  coverUrl?: string
  intro?: string
  extension?: string
  language?: string
  year?: string
  fileSize?: string
  publisher?: string
  pages?: string
  identifier?: string
  series?: string
  sourceName: string
  sourceId: string
  sourceUrl?: string
  kind?: string
}

type DownloadProgress = (message: string) => void
interface HttpSourceHelpers {
  uniqueValues: typeof uniqueValues
  toAbsoluteUrl: typeof toAbsoluteUrl
  sourceBase: typeof sourceBase
  normalizeFileName: typeof normalizeFileName
  matchExtension: (source: HttpSourceConfig, extension?: string) => boolean
  firstNonEmpty: (searches: Array<Promise<HttpBook[]>>) => Promise<HttpBook[]>
  forwardProxy: (url: string, method?: string, timeout?: number, headers?: Array<{ name: string; value: string }>, payload?: any, contentType?: string) => Promise<{ body: string; headers: Record<string, string>; status: number } | null>
  fetchText: (url: string, timeout?: number) => Promise<string>
  nodeFetchText: (url: string, headers: Array<{ name: string; value: string }>, redirects?: number) => Promise<string>
  save: () => Promise<void>
}
interface HttpSourceExtension {
  sources: HttpSourceConfig[]
  search: (source: HttpSourceConfig, keyword: string, helpers: HttpSourceHelpers) => Promise<HttpBook[]>
  getDownloadPlan?: (book: HttpBook, source: HttpSourceConfig | undefined, helpers: HttpSourceHelpers, onProgress?: DownloadProgress) => Promise<RemoteDownloadRequest>
  getOnlineBookInfo?: (book: HttpBook) => OnlineBookImportInfo
}

const toForwardProxyHeaders = (headers: Array<{ name: string; value: string }> = []) =>
  headers
    .filter(header => header.name && header.value !== undefined && header.value !== null && header.value !== '')
    .map(header => ({ [header.name]: header.value }))

const DEFAULT_SOURCES: HttpSourceConfig[] = [
  {
    id: 'anna',
    name: 'Anna Archive',
    type: 'anna',
    enabled: false,
    domains: ['https://annas-archive.gl', 'https://annas-archive.pk', 'https://annas-archive.gd', 'https://annas-archive.se', 'https://annas-archive.li', 'https://annas-archive.org'],
    currentDomain: 'https://annas-archive.gl',
    filters: { extensions: [] },
  },
  {
    id: 'gutenberg',
    name: 'Project Gutenberg',
    type: 'gutenberg',
    enabled: true,
    url: 'https://www.gutenberg.org',
    filters: { extensions: [] },
  },
  {
    id: 'standardebooks',
    name: 'Standard Ebooks',
    type: 'standardebooks',
    enabled: true,
    url: 'https://standardebooks.org',
    filters: { extensions: [] },
  },
]

const normalizeExtensions = (extensions: string[] = []) =>
  Array.from(new Set(extensions.map(item => item.trim().toLowerCase()).filter(Boolean)))

const uniqueValues = (values: Array<string | undefined>) =>
  Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => !!value)))

const normalizeFileName = (value = 'book') =>
  (value || 'book').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'book'

const mergeSources = (saved: HttpSourceConfig[] = [], privateSources: HttpSourceConfig[] = []) => [
  ...[...DEFAULT_SOURCES, ...privateSources].map(source => {
    const savedSource: Partial<HttpSourceConfig> = saved.find(item => item.id === source.id) || {}
    const domains = source.domains ? uniqueValues([...(source.domains || []), ...(savedSource.domains || [])]) : savedSource.domains || source.domains
    const next = { ...source, ...savedSource, domains }
    return { ...next, filters: { extensions: normalizeExtensions(next.filters?.extensions || []) } }
  }),
  ...saved
    .filter(source => source.type === 'custom')
    .map(source => ({ ...source, filters: { extensions: normalizeExtensions(source.filters?.extensions || []) } })),
]

const toAbsoluteUrl = (url: string, base = '') => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('//')) return `https:${url}`
  if (!base) return url
  try {
    return new URL(url, base).toString()
  } catch {
    return url
  }
}
const sourceBase = (url = '') => {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return ''
  }
}

const applyRequestPrefix = (url: string, prefix = '') => {
  const value = prefix.trim()
  if (!value) return url
  return value.includes('{url}') ? value.replace(/\{url\}/g, encodeURIComponent(url)) : `${value}${url}`
}

const textOf = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() || ''
export class HttpSourceManager {
  private readonly KEY = 'http_sources'
  private sources: HttpSourceConfig[] = [...DEFAULT_SOURCES]
  private privateSources: HttpSourceConfig[] = []
  private extensions = new Map<string, HttpSourceExtension>()
  private loading: Promise<void> | null = null
  private loaded = false

  async init() {
    if (this.loaded) return
    if (!this.loading) this.loading = this.load()
    await this.loading
  }

  private async load() {
    try {
      this.sources = mergeSources(await bookshelfManager.getSetting<HttpSourceConfig[]>(this.KEY, []), this.privateSources)
    } catch {
      this.sources = [...DEFAULT_SOURCES, ...this.privateSources]
    } finally {
      this.loaded = true
      this.loading = null
    }
  }

  private async save() {
    await this.init()
    await bookshelfManager.saveSetting(this.KEY, this.sources.map(source => ({
      ...source,
      filters: { extensions: normalizeExtensions(source.filters?.extensions || []) },
    })))
    window.dispatchEvent(new CustomEvent('http-sources-updated'))
  }

  getSources = () => [...this.sources]
  getEnabledSources = () => this.sources.filter(source => source.enabled)
  getSource = (id: string) => this.sources.find(source => source.id === id)

  registerExtension(extension: HttpSourceExtension) {
    this.privateSources = [...this.privateSources.filter(source => !extension.sources.some(item => item.id === source.id)), ...extension.sources]
    extension.sources.forEach(source => {
      this.extensions.set(source.id, extension)
      this.extensions.set(source.type, extension)
    })
    if (this.loaded) this.sources = mergeSources(this.sources, this.privateSources)
  }

  async updateSource(id: string, updates: Partial<HttpSourceConfig>) {
    const index = this.sources.findIndex(source => source.id === id)
    if (index < 0) return
    const current = this.sources[index]
    const next = {
      ...current,
      ...updates,
      filters: {
        extensions: normalizeExtensions(updates.filters?.extensions || current.filters?.extensions || []),
      },
    }
    this.sources[index] = next
    await this.save()
  }

  async toggleSource(id: string) {
    const source = this.getSource(id)
    if (!source) return
    source.enabled = !source.enabled
    await this.save()
  }

  async addCustomSource(config: Omit<HttpSourceConfig, 'id' | 'type'>) {
    const source: HttpSourceConfig = {
      ...config,
      id: `custom_${Date.now()}`,
      type: 'custom',
      enabled: true,
      filters: { extensions: normalizeExtensions(config.filters?.extensions || []) },
    }
    this.sources.push(source)
    await this.save()
    return source
  }

  async removeSource(id: string) {
    const index = this.sources.findIndex(source => source.id === id)
    if (index < 0 || this.sources[index].type !== 'custom') return
    this.sources.splice(index, 1)
    await this.save()
  }

  async addAnnaDomain(domain: string) {
    const source = this.getSource('anna')
    const value = domain.trim()
    if (!source?.domains || !value || source.domains.includes(value)) return
    source.domains.push(value)
    await this.save()
  }

  switchAnnaDomain = async (domain: string) => this.updateSource('anna', { currentDomain: domain })

  async setAnnaExtensions(extensions: string[]) {
    const source = this.getSource('anna')
    if (!source) return
    await this.updateSource('anna', { filters: { ...source.filters, extensions } })
  }

  async search(keyword: string, sourceId?: string): Promise<HttpBook[]> {
    const sources = sourceId ? [this.getSource(sourceId)].filter(Boolean) : this.getEnabledSources()
    const results = await Promise.allSettled(sources.map(source => this.searchIn(source!, keyword)))
    return results
      .filter((result): result is PromiseFulfilledResult<HttpBook[]> => result.status === 'fulfilled')
      .flatMap(result => result.value.map(book => ({
        ...book,
        kind: book.kind || [book.extension, book.language, book.year].filter(Boolean).join(' / '),
      })))
  }

  private searchIn(source: HttpSourceConfig, keyword: string) {
    const extension = this.extensions.get(source.id) || this.extensions.get(source.type)
    if (extension) return extension.search(source, keyword, this.getHelpers())
    if (source.type === 'anna') return this.searchAnna(keyword, source)
    if (source.type === 'gutenberg') return this.searchGutenberg(keyword, source)
    if (source.type === 'standardebooks') return this.searchStandardEbooks(keyword, source)
    if (source.type === 'custom') return this.searchCustom(keyword, source)
    return Promise.resolve([])
  }

  private matchExtension(source: HttpSourceConfig, extension = '') {
    const exts = source.filters?.extensions || []
    if (!exts.length) return true
    return !!extension && exts.includes(extension.toLowerCase())
  }

  private async searchAnna(keyword: string, source: HttpSourceConfig): Promise<HttpBook[]> {
    const domains = uniqueValues([...(source.domains || []), source.currentDomain]).slice(0, 4)
    return this.firstNonEmpty(domains.map(async (domain) => {
      try {
        const html = await this.request(`${domain}/search?q=${encodeURIComponent(keyword)}`, source, 8000)
        if (!html) return []
        const doc = new DOMParser().parseFromString(html, 'text/html')
        const oldItems = Array.from(doc.querySelectorAll('[class*="search-result"]'))
        return oldItems.length ? this.parseAnnaLegacyResults(oldItems, domain, source) : this.parseAnnaMd5Results(doc, domain, source)
      } catch {
        return []
      }
    }))
  }

  private parseAnnaLegacyResults(items: Element[], domain: string, source: HttpSourceConfig): HttpBook[] {
    return items
      .slice(0, 10)
      .map(item => {
        const title = textOf(item.querySelector('[class*="title"]'))
        const author = textOf(item.querySelector('[class*="author"]')) || 'Unknown'
        const link = item.querySelector('a')?.getAttribute('href') || ''
        const ext = link.match(/\.(epub|pdf|mobi|azw3)/i)?.[1]?.toLowerCase() || ''
        if (!title || !this.matchExtension(source, ext)) return null
        const bookUrl = toAbsoluteUrl(link, domain)
        return {
          name: title,
          author,
          bookUrl,
          downloadUrl: bookUrl,
          coverUrl: '',
          intro: '',
          extension: ext.toUpperCase(),
          sourceName: source.name,
          sourceId: source.id,
        }
      })
      .filter(Boolean) as HttpBook[]
  }

  private parseAnnaMd5Results(doc: Document, domain: string, source: HttpSourceConfig): HttpBook[] {
    const seen = new Set<string>()
    return Array.from(doc.querySelectorAll<HTMLAnchorElement>('a.js-vim-focus[href^="/md5/"], a[href^="/md5/"].font-semibold'))
      .slice(0, 10)
      .map(link => {
        const href = link.getAttribute('href') || ''
        const title = textOf(link)
        if (!href || !title || seen.has(href)) return null
        seen.add(href)

        const content = link.parentElement
        let item: Element | null | undefined = content
        let coverUrl = ''
        let metaText = ''
        for (let node = link.parentElement, depth = 0; node && depth < 8; node = node.parentElement, depth += 1) {
          const nodeText = textOf(node)
          const image = node.querySelector('img[src]')
          if (/\b(epub|pdf|mobi|azw3)\b/i.test(nodeText)) {
            item = node
            metaText = nodeText
            coverUrl = toAbsoluteUrl(image?.getAttribute('src') || '', domain)
            if (coverUrl) break
          }
        }
        const author = textOf(content?.querySelector('a[href^="/search?q="]')) || 'Unknown'
        if (!metaText) metaText = textOf(item)
        if (!coverUrl) coverUrl = toAbsoluteUrl(item?.querySelector('img[src]')?.getAttribute('src') || '', domain)
        const ext = metaText.match(/\b(epub|pdf|mobi|azw3)\b/i)?.[1]?.toLowerCase() || ''
        if (!this.matchExtension(source, ext)) return null

        const bookUrl = toAbsoluteUrl(href, domain)
        return {
          name: title,
          author,
          bookUrl,
          downloadUrl: bookUrl,
          coverUrl,
          intro: '',
          extension: ext.toUpperCase(),
          language: metaText.match(/\b([A-Z][a-z]+)\s+\[[a-z]{2,3}\]/)?.[1] || '',
          year: metaText.match(/\b(19|20)\d{2}\b/)?.[0] || '',
          fileSize: metaText.match(/\b\d+(?:\.\d+)?\s*(?:KB|MB|GB)\b/i)?.[0] || '',
          sourceName: source.name,
          sourceId: source.id,
        }
      })
      .filter(Boolean) as HttpBook[]
  }

  private async searchGutenberg(keyword: string, source: HttpSourceConfig): Promise<HttpBook[]> {
    try {
      const base = source.url || 'https://www.gutenberg.org'
      const html = await this.request(`${base}/ebooks/search/?query=${encodeURIComponent(keyword)}&submit_search=Go%21`, source)
      if (!html) return []
      return Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('li.booklink'))
        .slice(0, 10)
        .map(item => {
          const link = item.querySelector('a[href*="/ebooks/"]')?.getAttribute('href') || ''
          const id = link.match(/\/ebooks\/(\d+)/)?.[1]
          const title = item.querySelector('.title')?.textContent?.trim() || ''
          if (!id || !title || !this.matchExtension(source, 'epub')) return null
          return {
            name: title,
            author: item.querySelector('.subtitle')?.textContent?.trim() || 'Unknown',
            bookUrl: `${base}${link}`,
            downloadUrl: `${base}/ebooks/${id}.epub3.images`,
            coverUrl: `${base}/cache/epub/${id}/pg${id}.cover.medium.jpg`,
            intro: '',
            extension: 'EPUB',
            language: 'en',
            sourceName: source.name,
            sourceId: source.id,
          }
        })
        .filter(Boolean) as HttpBook[]
    } catch {
      return []
    }
  }

  private async searchStandardEbooks(keyword: string, source: HttpSourceConfig): Promise<HttpBook[]> {
    try {
      const base = source.url || 'https://standardebooks.org'
      const html = await this.request(`${base}/ebooks?query=${encodeURIComponent(keyword)}`, source)
      if (!html) return []
      return Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('li[typeof="schema:Book"]'))
        .slice(0, 10)
        .map(item => {
          const link = item.querySelector('a')?.getAttribute('href') || ''
          const title = item.querySelector('[property="schema:name"]')?.textContent?.trim() || ''
          if (!link || !title || !this.matchExtension(source, 'epub')) return null
          const slug = link.replace('/ebooks/', '')
          return {
            name: title,
            author: item.querySelector('[property="schema:author"]')?.textContent?.trim() || 'Unknown',
            bookUrl: `${base}${link}`,
            downloadUrl: `${base}/ebooks/${slug}/downloads/${slug.replace('/', '_')}.epub?source=download`,
            coverUrl: item.querySelector('img')?.getAttribute('src') ? `${base}${item.querySelector('img')?.getAttribute('src')}` : '',
            intro: '',
            extension: 'EPUB',
            language: 'en',
            sourceName: source.name,
            sourceId: source.id,
          }
        })
        .filter(Boolean) as HttpBook[]
    } catch {
      return []
    }
  }

  private async searchCustom(keyword: string, source: HttpSourceConfig): Promise<HttpBook[]> {
    try {
      const searchUrl = (source.searchUrl || '').replace(/\{query\}/g, encodeURIComponent(keyword))
      if (!searchUrl || !source.selectors?.item || !source.selectors.title || !source.selectors.link) return []
      const html = await this.request(searchUrl, source)
      if (!html) return []
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const base = source.bookUrlPrefix || source.url || searchUrl
      return Array.from(doc.querySelectorAll(source.selectors.item))
        .slice(0, 10)
        .map(item => {
          const title = item.querySelector(source.selectors!.title)?.textContent?.trim() || ''
          const rawLink = item.querySelector(source.selectors!.link)?.getAttribute('href') || ''
          const bookUrl = toAbsoluteUrl(rawLink, base)
          const extension = bookUrl.match(/\.(epub|pdf|mobi|azw3)(\?|$)/i)?.[1]?.toLowerCase() || ''
          if (!title || !bookUrl || !this.matchExtension(source, extension)) return null
          return {
            name: title,
            author: source.selectors?.author ? item.querySelector(source.selectors.author)?.textContent?.trim() || 'Unknown' : 'Unknown',
            bookUrl,
            downloadUrl: bookUrl,
            coverUrl: source.selectors?.cover ? toAbsoluteUrl(item.querySelector(source.selectors.cover)?.getAttribute('src') || '', base) : '',
            intro: source.selectors?.intro ? item.querySelector(source.selectors.intro)?.textContent?.trim() || '' : '',
            extension: extension ? extension.toUpperCase() : '',
            sourceName: source.name,
            sourceId: source.id,
          }
        })
        .filter(Boolean) as HttpBook[]
    } catch {
      return []
    }
  }

  private firstNonEmpty(searches: Array<Promise<HttpBook[]>>): Promise<HttpBook[]> {
    return new Promise(resolve => {
      if (!searches.length) return resolve([])
      let pending = searches.length, settled = false
      searches.forEach(search => search.then(books => {
        if (!settled && books.length) {
          settled = true
          resolve(books)
        }
      }).catch(() => {}).finally(() => {
        pending -= 1
        if (!pending && !settled) resolve([])
      }))
    })
  }

  private async request(url: string, source?: HttpSourceConfig, timeout = 15000, headers: Array<{ name: string; value: string }> = []) {
    const target = applyRequestPrefix(url, source?.requestPrefix)
    const res = await this.forwardProxy(target, 'GET', timeout, [{ name: 'User-Agent', value: 'Mozilla/5.0' }, ...headers])
    return res?.body || ''
  }

  private async fetchText(url: string, timeout = 8000) {
    try {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), timeout)
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store' })
      window.clearTimeout(timer)
      if (response.ok) return response.text()
    } catch {}
    const res = await this.forwardProxy(url, 'GET', timeout, [{ name: 'User-Agent', value: 'Mozilla/5.0' }], {}, 'text/plain')
    return res?.body || ''
  }

  private async forwardProxy(url: string, method = 'GET', timeout = 15000, headers: Array<{ name: string; value: string }> = [], payload: any = {}, contentType = 'text/html') {
    const response = await fetch('/api/network/forwardProxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method, contentType, headers: toForwardProxyHeaders(headers), payload, timeout }),
    }).catch(() => null)
    const res = response?.ok ? await response.json().catch(() => null) : null
    return res?.code === 0 ? res.data as { body: string; headers: Record<string, string>; status: number } : null
  }

  private nodeFetchText(url: string, headers: Array<{ name: string; value: string }>, redirects = 0): Promise<string> {
    const req = (window as any).require
    if (!req || redirects > 5) return Promise.reject(new Error('Node request unavailable'))
    const client = req(new URL(url).protocol === 'http:' ? 'http' : 'https')
    const requestHeaders = Object.fromEntries(headers.map(header => [header.name, header.value]))
    return new Promise((resolve, reject) => {
      const request = client.get(url, { headers: requestHeaders }, (response: any) => {
        const status = Number(response.statusCode || 0)
        const location = response.headers?.location
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          response.resume()
          this.nodeFetchText(toAbsoluteUrl(location, url), headers, redirects + 1).then(resolve, reject)
          return
        }
        const chunks: Uint8Array[] = []
        response.on('data', (chunk: Uint8Array) => chunks.push(chunk))
        response.on('end', () => {
          const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
          const body = new Uint8Array(size)
          let offset = 0
          chunks.forEach(chunk => {
            body.set(chunk, offset)
            offset += chunk.byteLength
          })
          resolve(new TextDecoder().decode(body))
        })
      })
      request.on('error', reject)
      request.setTimeout(15000, () => request.destroy(new Error('请求超时')))
    })
  }

  async downloadCover(url: string) {
    if (!url) return null
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
      return res.ok ? await res.blob() : null
    } catch {
      return null
    }
  }

  private getHelpers(): HttpSourceHelpers {
    return {
      uniqueValues,
      toAbsoluteUrl,
      sourceBase,
      normalizeFileName,
      matchExtension: this.matchExtension.bind(this),
      firstNonEmpty: this.firstNonEmpty.bind(this),
      forwardProxy: this.forwardProxy.bind(this),
      fetchText: this.fetchText.bind(this),
      nodeFetchText: this.nodeFetchText.bind(this),
      save: this.save.bind(this),
    }
  }

  private toRemoteBookInfo(book: HttpBook): RemoteBookInfo {
    return {
      title: book.name,
      author: book.author,
      format: book.extension?.toLowerCase() as RemoteBookInfo['format'],
      intro: book.intro,
      language: book.language,
      publisher: book.publisher,
      published: book.year,
      identifier: book.identifier,
      series: book.series,
      sourceName: book.sourceName,
      fileSize: book.fileSize,
      tags: [book.sourceName, book.language, book.year].filter(Boolean),
    }
  }

  async getDownloadPlan(book: HttpBook, onProgress?: DownloadProgress): Promise<RemoteDownloadRequest> {
    const extension = this.extensions.get(book.sourceId)
    if (extension?.getDownloadPlan) return extension.getDownloadPlan(book, this.getSource(book.sourceId), this.getHelpers(), onProgress)
    const url = book.downloadUrl || book.bookUrl
    if (!url) throw new Error('无效的下载链接')
    return {
      url,
      fileName: `${normalizeFileName(book.name || 'book')}.${(book.extension || 'epub').toLowerCase()}`,
      coverUrl: book.coverUrl,
      bookInfo: this.toRemoteBookInfo(book),
    }
  }

  getOnlineBookInfo(book: HttpBook): OnlineBookImportInfo {
    const extension = this.extensions.get(book.sourceId)
    if (extension?.getOnlineBookInfo) return extension.getOnlineBookInfo(book)
    if (!book.readUrl) throw new Error('在线阅读地址为空')
    return {
      url: book.readUrl,
      title: book.name,
      author: book.author,
      coverUrl: book.coverUrl,
      format: book.extension?.toLowerCase() as OnlineBookImportInfo['format'],
      readUrl: book.readUrl,
      downloadUrl: book.downloadUrl,
      intro: book.intro,
      language: book.language,
      publisher: book.publisher,
      published: book.year,
      identifier: book.identifier,
      series: book.series,
      sourceName: book.sourceName,
      fileSize: book.fileSize,
      tags: [book.sourceName, book.language, book.year].filter(Boolean),
    }
  }
}

export const httpSourceManager = new HttpSourceManager()
registerWereadAgentSources(httpSourceManager)
registerPrivateSources(httpSourceManager)
export type { HttpSourceConfig, HttpBook, HttpSourceSelectors, HttpSourceType, HttpSourceExtension, HttpSourceHelpers }
