// Anna's Archive 备用域名列表（域名会经常变化）
const DEFAULT_DOMAINS = [
  'https://annas-archive.se',
  'https://annas-archive.li',
  'https://annas-archive.gs',
  'https://annas-archive.org',
]

interface AnnaConfig {
  enabled?: boolean
  customDomains?: string[] // 用户自定义域名列表
  currentDomain?: string // 当前使用的域名
  filters?: {
    extensions?: string[] // 文件格式筛选 ['epub', 'pdf', 'mobi', 'azw3']
    language?: string // 语言筛选 'en', 'zh', 'ja' 等
  }
}

interface AnnaBook {
  id: string
  name: string
  author: string
  bookUrl: string
  coverUrl?: string
  intro?: string
  year?: string
  language?: string
  fileSize?: string
  extension?: string
}

class AnnaArchiveAdapter {
  private config: AnnaConfig = {
    filters: {
      extensions: [], // 默认不筛选
      language: undefined
    }
  }

  constructor() {
    this.loadConfig()
  }

  private loadConfig() {
    try {
      const saved = localStorage.getItem('anna_config')
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) }
      }
      // 如果没有设置当前域名，使用第一个默认域名
      if (!this.config.currentDomain) {
        this.config.currentDomain = DEFAULT_DOMAINS[0]
      }
    } catch (e) {
      // 忽略错误
    }
  }

  saveConfig(config: Partial<AnnaConfig>) {
    this.config = { ...this.config, ...config }
    localStorage.setItem('anna_config', JSON.stringify(this.config))
  }

  getConfig(): AnnaConfig {
    return { ...this.config }
  }

  // 获取当前使用的域名
  private getCurrentDomain(): string {
    return this.config.currentDomain || DEFAULT_DOMAINS[0]
  }

  // 获取所有可用域名（默认 + 自定义）
  getAllDomains(): string[] {
    const custom = this.config.customDomains || []
    return [...custom, ...DEFAULT_DOMAINS]
  }

  // 添加自定义域名
  addCustomDomain(domain: string) {
    const custom = this.config.customDomains || []
    if (!custom.includes(domain) && !DEFAULT_DOMAINS.includes(domain)) {
      custom.push(domain)
      this.saveConfig({ customDomains: custom })
    }
  }

  // 移除自定义域名
  removeCustomDomain(domain: string) {
    const custom = this.config.customDomains || []
    const filtered = custom.filter(d => d !== domain)
    this.saveConfig({ customDomains: filtered })
  }

  // 切换到指定域名
  switchDomain(domain: string) {
    this.saveConfig({ currentDomain: domain })
  }

  // 测试域名是否可用
  async testDomain(domain: string): Promise<boolean> {
    try {
      const response = await fetch(domain, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
    } catch {
      return false
    }
  }

  // 自动切换到可用域名
  async autoSwitchDomain(): Promise<string | null> {
    const domains = this.getAllDomains()
    for (const domain of domains) {
      if (await this.testDomain(domain)) {
        this.switchDomain(domain)
        return domain
      }
    }
    return null
  }

  // 设置文件格式筛选
  setExtensionFilter(extensions: string[]) {
    this.saveConfig({
      filters: {
        ...this.config.filters,
        extensions
      }
    })
  }

  // 设置语言筛选
  setLanguageFilter(language: string | undefined) {
    this.saveConfig({
      filters: {
        ...this.config.filters,
        language
      }
    })
  }

  // 获取当前源信息
  getCurrentSource() {
    return {
      name: "Anna's Archive",
      url: this.getCurrentDomain(),
      type: 'anna'
    }
  }

  // 搜索书籍（支持格式和语言筛选）
  async search(keyword: string, page = 1): Promise<AnnaBook[]> {
    const domain = this.getCurrentDomain()
    
    // 构建搜索URL，添加筛选参数
    let searchUrl = `${domain}/search?q=${encodeURIComponent(keyword)}&page=${page}`
    
    // 添加文件格式筛选
    const extensions = this.config.filters?.extensions || []
    if (extensions.length > 0) {
      searchUrl += `&ext=${extensions.join(',')}`
    }
    
    // 添加语言筛选
    const language = this.config.filters?.language
    if (language) {
      searchUrl += `&lang=${language}`
    }
    
    try {
      const html = await this.request(searchUrl)
      
      if (!html || html.length < 100) {
        throw new Error('搜索结果为空')
      }

      return this.parseResults(html, domain)
    } catch (e: any) {
      // 如果当前域名失败，尝试自动切换
      if (e.message.includes('HTTP') || e.message.includes('请求超时')) {
        const newDomain = await this.autoSwitchDomain()
        if (newDomain && newDomain !== domain) {
          // 用新域名重试一次
          return this.search(keyword, page)
        }
      }
      throw e
    }
  }

  // 网络请求
  private async request(url: string, timeout = 30000): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
        mode: 'cors',
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return await response.text()
    } catch (e: any) {
      clearTimeout(timeoutId)
      if (e.name === 'AbortError') {
        throw new Error('请求超时')
      }
      throw e
    }
  }

  // 解析搜索结果
  private parseResults(html: string, domain: string): AnnaBook[] {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const books: AnnaBook[] = []

    const bookLinks = doc.querySelectorAll('a[href^="/md5/"]')
    if (bookLinks.length === 0) return []

    bookLinks.forEach((link, index) => {
      try {
        const href = link.getAttribute('href') || ''
        const id = href.split('/md5/')[1]?.split('/')[0] || `anna-${index}`
        
        // 提取书名
        const name = link.textContent?.trim() || ''
        if (!name || name.length < 2) return

        const parent = link.parentElement
        if (!parent) return

        // 获取文件名信息（包含格式）
        const fileNameDiv = parent.querySelector('div.text-gray-500')
        const fileName = fileNameDiv?.textContent?.trim() || ''
        
        // 从文件名提取格式
        let extension: string | undefined = undefined
        const extMatch = fileName.match(/\.(pdf|epub|mobi|azw3|djvu|fb2|txt|doc|docx|cbr|cbz)$/i)
        if (extMatch) {
          extension = extMatch[1].toUpperCase()
        }

        // 如果设置了格式筛选，但当前书籍不匹配，跳过
        const filterExts = this.config.filters?.extensions || []
        if (filterExts.length > 0 && extension) {
          if (!filterExts.some(ext => ext.toLowerCase() === extension!.toLowerCase())) {
            return
          }
        }

        // 查找作者链接
        let author = '未知作者'
        const authorLink = parent.querySelector('a[href^="/search?q="]')
        if (authorLink) {
          const authorText = authorLink.textContent?.trim()
          if (authorText && authorText !== 'Unknown' && authorText.length > 0) {
            author = authorText
          }
        }

        // 向上查找包含更多元数据的容器
        let metaContainer = parent.parentElement
        let year: string | undefined = undefined
        let language: string | undefined = undefined
        let fileSize: string | undefined = undefined

        if (metaContainer) {
          const allText = metaContainer.textContent || ''
          
          // 提取年份
          const yearMatch = allText.match(/\b(19|20)\d{2}\b/)
          if (yearMatch) year = yearMatch[0]
          
          // 提取语言
          const langMatch = allText.match(/\b(English|Chinese|Japanese|Korean|French|German|Spanish|Russian|中文|英文|日文|韩文)\b/i)
          if (langMatch) language = langMatch[0]
          
          // 提取文件大小
          const sizeMatch = allText.match(/([\d.]+\s*[KMGT]i?B)/i)
          if (sizeMatch) fileSize = sizeMatch[1]
        }

        // 查找封面图片
        let coverUrl: string | undefined = undefined
        let searchContainer: Element | null = parent
        
        for (let i = 0; i < 3 && searchContainer; i++) {
          const imgEl = searchContainer.querySelector('img')
          if (imgEl) {
            const src = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy-src')
            if (src && !src.includes('data:image')) {
              coverUrl = src.startsWith('http') ? src : domain + src
              break
            }
          }
          searchContainer = searchContainer.parentElement
        }

        books.push({
          id,
          name,
          author,
          bookUrl: domain + href,
          coverUrl,
          intro: undefined,
          year,
          language,
          fileSize,
          extension,
        })
      } catch (e) {
        // 忽略解析错误
      }
    })

    return books
  }

  // 获取书籍详情
  async getBookInfo(bookUrl: string): Promise<any> {
    const html = await this.request(bookUrl)
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // 从URL提取域名
    const urlObj = new URL(bookUrl)
    const domain = `${urlObj.protocol}//${urlObj.host}`

    // 提取书名
    const nameEl = doc.querySelector('h1, .book-title, [itemprop="name"]')
    const name = nameEl?.textContent?.trim() || ''

    // 提取作者
    const authorEl = doc.querySelector('.author, .authors, [itemprop="author"]')
    const author = authorEl?.textContent?.trim() || '未知作者'

    // 提取简介
    const introEl = doc.querySelector('.description, .book-description, [itemprop="description"]')
    const intro = introEl?.textContent?.trim() || ''

    // 提取封面
    let coverUrl: string | undefined = undefined
    const coverEl = doc.querySelector('img[itemprop="image"], .book-cover img, img[alt*="cover"]')
    if (coverEl) {
      const src = coverEl.getAttribute('src') || coverEl.getAttribute('data-src')
      if (src) {
        coverUrl = src.startsWith('http') ? src : domain + src
      }
    }

    // 提取其他元数据
    const allText = doc.body?.textContent || ''
    
    const yearMatch = allText.match(/\b(19|20)\d{2}\b/)
    const year = yearMatch ? yearMatch[0] : undefined
    
    const langMatch = allText.match(/Language:\s*([^\n]+)/i)
    const language = langMatch ? langMatch[1].trim() : undefined
    
    const extMatch = allText.match(/Extension:\s*([^\n]+)/i)
    const extension = extMatch ? extMatch[1].trim().toUpperCase() : undefined
    
    const sizeMatch = allText.match(/Size:\s*([\d.]+\s*[KMGT]i?B)/i)
    const fileSize = sizeMatch ? sizeMatch[1] : undefined

    return {
      name,
      author,
      intro,
      bookUrl,
      coverUrl,
      year,
      language,
      extension,
      fileSize,
    }
  }
}

export const annaArchive = new AnnaArchiveAdapter()
export type { AnnaConfig, AnnaBook }
