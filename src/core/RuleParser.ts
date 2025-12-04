enum RuleMode { Default = 'default', Json = 'json', XPath = 'xpath', Regex = 'regex', Js = 'js' }

class RuleTypeDetector {
  static detectMode(r: string, isJson: boolean): RuleMode {
    if (!r) return RuleMode.Default
    const t = r.trim()
    if (t.startsWith('@XPath:') || t.startsWith('/')) return RuleMode.XPath
    if (t.startsWith('@Json:') || t.startsWith('@JSon:') || t.startsWith('$.') || t.startsWith('$[')) return RuleMode.Json
    if (t.includes('<js>')) return RuleMode.Js
    return isJson ? RuleMode.Json : RuleMode.Default
  }
  
  static removePrefix(r: string): string {
    const t = r.trim()
    return t.startsWith('@XPath:') ? t.substring(7) : t.startsWith('@Json:') || t.startsWith('@JSon:') ? t.substring(6) : t.startsWith('@CSS:') ? t.substring(5) : t.startsWith('@@') ? t.substring(2) : t
  }
}

class RuleAnalyzer {
  constructor(private queue: string = '') {}
  
  splitRule(...seps: string[]): { rules: string[], type: string } {
    if (!this.queue) return { rules: [], type: '' }
    for (const sep of seps) {
      const parts = this.split(sep)
      if (parts.length > 1) return { rules: parts.filter(Boolean), type: sep }
    }
    return { rules: [this.queue], type: '' }
  }
  
  private split(sep: string): string[] {
    const parts: string[] = [], len = this.queue.length
    let depth = 0, quote: string | null = null, curr = ''
    for (let i = 0; i < len; i++) {
      const c = this.queue[i], next = this.queue.substring(i, i + sep.length)
      if (c === '"' || c === "'") {
        quote = quote === c ? null : (!quote ? c : quote)
        curr += c
      } else if (!quote) {
        if (c === '[' || c === '(' || c === '{') depth++
        else if (c === ']' || c === ')' || c === '}') depth--
        if (depth === 0 && next === sep) {
          parts.push(curr.trim())
          curr = ''
          i += sep.length - 1
          continue
        }
        curr += c
      } else curr += c
    }
    if (curr) parts.push(curr.trim())
    return parts
  }
  
  innerRule(start: string, end: string, fn: (rule: string) => string | null): string {
    const res: string[] = []
    let last = 0, pos = 0
    while (pos < this.queue.length) {
      const si = this.queue.indexOf(start, pos)
      if (si === -1) break
      let ei = si + start.length, depth = 1
      while (depth > 0 && ei < this.queue.length) {
        const ns = this.queue.indexOf(start, ei)
        const ne = this.queue.indexOf(end, ei)
        if (ne === -1) break
        if (ns !== -1 && ns < ne) {
          depth++
          ei = ns + start.length
        } else {
          depth--
          ei = ne + (depth === 0 ? 0 : end.length)
        }
      }
      if (depth === 0) {
        const inner = this.queue.substring(si + start.length, ei)
        const repl = fn(inner)
        if (repl !== null && repl !== undefined) {
          res.push(this.queue.substring(last, si), repl)
          last = ei + end.length
          pos = last
          continue
        }
      }
      pos = si + 1
    }
    if (last === 0) return ''
    res.push(this.queue.substring(last))
    return res.join('')
  }
}

class JsonPathParser {
  private data: any
  
  constructor(json: any) {
    try {
      this.data = typeof json === 'string' ? JSON.parse(json) : json
    } catch {
      this.data = {}
    }
  }
  
  getString(rule: string): string {
    if (!rule) return ''
    const { rules, type } = new RuleAnalyzer(rule).splitRule('&&', '||')
    if (rules.length === 1) {
      const replaced = new RuleAnalyzer(rule).innerRule('{$.', '}', r => this.getString(r))
      if (replaced) return replaced
      return this.getSingleValue(rules[0])
    }
    const results: string[] = []
    for (const r of rules) {
      const value = this.getSingleValue(r)
      if (value) {
        results.push(value)
        if (type === '||') break
      }
    }
    return results.join('\n')
  }
  
  getList(rule: string): any[] {
    if (!rule) return []
    const { rules, type } = new RuleAnalyzer(rule).splitRule('&&', '||', '%%')
    if (rules.length === 1) {
      const replaced = new RuleAnalyzer(rule).innerRule('{$.', '}', r => this.getString(r))
      if (replaced) return [replaced]
      try {
        const result = this.getValueByPath(rules[0])
        return Array.isArray(result) ? result : [result]
      } catch { return [] }
    }
    const results: any[][] = []
    for (const r of rules) {
      try {
        const result = this.getValueByPath(r)
        const list = Array.isArray(result) ? result : [result]
        if (list.length > 0) {
          results.push(list)
          if (type === '||') break
        }
      } catch {}
    }
    if (results.length === 0) return []
    if (type === '%%') {
      const merged: any[] = []
      const maxLen = Math.max(...results.map(arr => arr.length))
      for (let i = 0; i < maxLen; i++) {
        for (const arr of results) if (i < arr.length) merged.push(arr[i])
      }
      return merged
    }
    return results.flat()
  }
  
  private getSingleValue(rule: string): string {
    try {
      const value = this.getValueByPath(rule)
      if (value == null) return ''
      return Array.isArray(value) ? value.join('\n') : String(value)
    } catch {
      return ''
    }
  }
  
  private getValueByPath(path: string): any {
    if (!path || !this.data) return null
    if (path.startsWith('$.')) path = path.substring(2)
    else if (path.startsWith('$[')) path = path.substring(1)
    if (path.startsWith('.')) return this.recursiveSearch(this.data, path.substring(1))
    if (path.startsWith('[')) {
      if (path === '[*]') return Array.isArray(this.data) ? this.data : [this.data]
      const match = path.match(/^\[(\d+)\](.*)/)
      if (match) {
        const value = Array.isArray(this.data) ? this.data[parseInt(match[1])] : null
        return match[2] ? new JsonPathParser(value).getValueByPath(match[2]) : value
      }
    }
    let current = this.data
    for (const part of path.split('.')) {
      if (current == null) return null
      const arrayMatch = part.match(/^(\w+)\[(\d+|\*)\]$/)
      if (arrayMatch) {
        current = current[arrayMatch[1]]
        if (arrayMatch[2] !== '*') current = current?.[parseInt(arrayMatch[2])]
      } else {
        current = current[part]
      }
    }
    return current
  }
  
  private recursiveSearch(obj: any, key: string): any {
    if (!obj || typeof obj !== 'object') return null
    if (key in obj) return obj[key]
    for (const k in obj) {
      if (typeof obj[k] === 'object') {
        const result = this.recursiveSearch(obj[k], key)
        if (result !== null) return result
      }
    }
    return null
  }
}

export class CssParser {
  private doc: Document | Element
  
  constructor(html: string | Element) {
    this.doc = typeof html === 'string' ? new DOMParser().parseFromString(html, 'text/html') : html
  }
  
  getElements(rule: string): Element[] {
    if (!rule) return []
    let cleanRule = rule
    let isCss = false
    
    if (rule.startsWith('@CSS:')) {
      isCss = true
      cleanRule = rule.substring(5).trim()
    }
    
    const analyzer = new RuleAnalyzer(cleanRule)
    const { rules, type } = analyzer.splitRule('&&', '||', '%%')
    
    if (rules.length === 1) {
      return isCss ? this.selectElementsCss(rules[0]) : this.selectElementsChain(rules[0])
    }
    
    const allResults: Element[][] = []
    for (const r of rules) {
      const elements = isCss ? this.selectElementsCss(r) : this.selectElementsChain(r)
      if (elements.length > 0) {
        allResults.push(elements)
        if (type === '||') break
      }
    }
    
    if (type === '%%') {
      const result: Element[] = []
      const maxLen = Math.max(...allResults.map(arr => arr.length))
      for (let i = 0; i < maxLen; i++) {
        for (const arr of allResults) if (i < arr.length) result.push(arr[i])
      }
      return result
    }
    return allResults.flat()
  }
  
  private selectElementsCss(rule: string): Element[] {
    try {
      return Array.from(this.doc.querySelectorAll(rule))
    } catch {
      return []
    }
  }
  
  private selectElementsChain(rule: string): Element[] {
    if (!rule) return []
    const parts = rule.split('@').map(p => p.trim()).filter(Boolean)
    if (parts.length === 0) return []
    
    const lastPart = parts[parts.length - 1]
    // 智能判断：如果是HTML标签或常用属性
    const isHtmlTag = /^[a-z][a-z0-9]{0,9}$/i.test(lastPart) && !['text', 'html', 'all', 'href', 'src', 'title', 'alt', 'name', 'value', 'data'].some(attr => lastPart.startsWith(attr))
    const isAttr = !isHtmlTag && /^(text|textNodes|ownText|html|all|href|src|title|alt|class|id|name|value|placeholder|data-\w+)$/.test(lastPart)
    const selectorParts = isAttr ? parts.slice(0, -1) : parts
    
    if (selectorParts.length === 0) {
      return this.doc instanceof Element ? [this.doc] : []
    }
    
    let currentElements: Element[] = [this.doc as Element]
    for (let i = 0; i < selectorParts.length; i++) {
      const selector = selectorParts[i]
      if (!selector) continue
      currentElements = currentElements.flatMap(el => 
        i > 0 && this.elementMatchesSelector(el, selector) ? [el] : this.selectElements(selector, el)
      )
      if (!currentElements.length) break
    }
    
    // 自动展开列表容器
    if (!isAttr && currentElements.length === 1) {
      const el = currentElements[0], tag = el.tagName.toLowerCase()
      const childTag = {'ul': 'li', 'ol': 'li', 'tbody': 'tr', 'table': 'tr'}[tag]
      if (childTag) {
        const children = tag === 'table' 
          ? Array.from(el.querySelector('tbody')?.children || [])
          : Array.from(el.children)
        const filtered = children.filter(c => c.tagName.toLowerCase() === childTag) as Element[]
        if (filtered.length) return filtered
      }
    }
    return currentElements
  }
  
  private elementMatchesSelector(el: Element, sel: string): boolean {
    if (!sel) return false
    try {
      if (sel.startsWith('class.')) {
        // 支持多个class：class.article-content font16
        const classNames = sel.substring(6).trim().split(/\s+/)
        return classNames.every(c => el.classList.contains(c))
      }
      if (sel.startsWith('id.')) return el.id === sel.substring(3)
      if (sel.startsWith('tag.')) {
        const m = sel.match(/^tag\.([^.]+)/)
        return m ? el.tagName.toLowerCase() === m[1].toLowerCase() : false
      }
      return el.matches(sel)
    } catch { return false }
  }
  
  getString(rule: string): string {
    const pureAttr = /^(text|href|src|html|all|textNodes|ownText|data-\w+)$/.test(rule)
    const els = pureAttr 
      ? [this.doc instanceof Element ? this.doc : (this.doc.body?.firstElementChild || this.doc.documentElement)]
      : this.getElements(rule)
    if (!els.length) return ''
    const getAttr = (el: Element, attr: string) => {
      if (attr === 'text') return el.textContent?.trim() || ''
      if (attr === 'html') { const c = el.cloneNode(true) as Element; c.querySelectorAll('script, style').forEach(e => e.remove()); return c.innerHTML }
      if (attr === 'all') return el.outerHTML
      if (attr === 'textNodes') return Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent?.trim()).filter(Boolean).join('\n')
      if (attr === 'ownText') return Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent?.trim()).filter(Boolean).join('')
      if (attr === 'src' && el.tagName === 'IMG') return el.getAttribute('data-src') || el.getAttribute('data-original') || el.getAttribute('data-lazy-src') || el.getAttribute('src') || ''
      return el.getAttribute(attr) || ''
    }
    
    const isHref = rule.includes('@href') || rule === 'href'
    const isSrc = rule.includes('@src') || rule === 'src'
    const isText = rule.includes('@text') || rule === 'text'
    
    const texts = els.map(el => {
      if (pureAttr) return getAttr(el, rule)
      const m = rule.match(/@([\w-]+)(?!.*@)/)
      return m ? getAttr(el, m[1]) : el.textContent?.trim() || ''
    })
    
    const valid = texts.filter(t => t && 
      !(isHref && (t.startsWith('javascript:') || t === '#')) && 
      !(isText && /^(首页|搜索|排行|目录|登录|注册)$/i.test(t.trim()))
    )
    return (isHref || isSrc || isText) ? (valid[0] || '') : valid.join('\n')
  }
  
  private selectElements(sel: string, ctx: Element | Document = this.doc): Element[] {
    try {
      if (!sel) return []
      if (sel.startsWith('tag.')) {
        const m = sel.substring(4).match(/^([^:\[]+)(.*)/)  
        return m ? this.applyIndexFilter(Array.from(ctx.getElementsByTagName(m[1])), m[2]) : []
      }
      if (sel.startsWith('class.')) {
        const m = sel.substring(6).match(/^([^:\[]+)(.*)/)
        return m ? this.applyIndexFilter(Array.from(ctx.querySelectorAll(m[1].trim().split(/\s+/).map(c => `.${c}`).join(''))), m[2]) : []
      }
      if (sel.startsWith('id.')) {
        const [n, ...r] = sel.substring(3).split(/[.:\[]/)
        const el = ctx.querySelector(`#${n}`)
        return el ? this.applyIndexFilter([el], r.join('')) : []
      }
      if (sel.includes(':eq(')) { const m = sel.match(/^(.+):eq\((\d+)\)$/); if (m) { const e = Array.from(ctx.querySelectorAll(m[1])); return e[parseInt(m[2])] ? [e[parseInt(m[2])]] : [] } }
      if (sel.endsWith(':first')) { const e = Array.from(ctx.querySelectorAll(sel.replace(/:first$/, ''))); return e[0] ? [e[0]] : [] }
      if (sel.endsWith(':last')) { const e = Array.from(ctx.querySelectorAll(sel.replace(/:last$/, ''))); return e.length ? [e[e.length - 1]] : [] }
      return Array.from(ctx.querySelectorAll(sel))
    } catch { return [] }
  }
  
  private applyIndexFilter(els: Element[], idx: string): Element[] {
    if (!idx) return els
    if (idx.startsWith('[') && idx.endsWith(']')) return this.applyArrayIndex(els, idx.slice(1, -1))
    if (idx.startsWith('.') || idx.startsWith('!') || idx.startsWith(':')) return this.applyColonIndex(els, idx)
    return els
  }
  
  private applyArrayIndex(els: Element[], idx: string): Element[] {
    const excl = idx.startsWith('!'), set = new Set<number>()
    for (const i of idx.replace(/^!/, '').split(',').map(s => s.trim())) {
      if (i.includes(':')) {
        const p = i.split(':')
        let s = p[0] ? parseInt(p[0]) : 0, e = p[1] ? parseInt(p[1]) : els.length - 1, st = p[2] ? parseInt(p[2]) : 1
        if (s < 0) s = els.length + s
        if (e < 0) e = els.length + e
        if (e >= s) { for (let j = s; j <= e; j += st) if (j >= 0 && j < els.length) set.add(j) }
        else { for (let j = s; j >= e; j -= st) if (j >= 0 && j < els.length) set.add(j) }
      } else {
        let j = parseInt(i)
        if (j < 0) j = els.length + j
        if (j >= 0 && j < els.length) set.add(j)
      }
    }
    return excl ? els.filter((_, i) => !set.has(i)) : Array.from(set).sort((a, b) => a - b).map(i => els[i])
  }
  
  private applyColonIndex(els: Element[], idx: string): Element[] {
    const excl = idx.startsWith('!')
    const set = new Set(idx.replace(/^[.!]/, '').split(':').map(s => parseInt(s.trim())).filter(n => !isNaN(n)).map(i => i < 0 ? els.length + i : i).filter(i => i >= 0 && i < els.length))
    return excl ? els.filter((_, i) => !set.has(i)) : Array.from(set).map(i => els[i])
  }
}

export class RuleParser {
  private ruleData: Map<string, string> = new Map()
  
  getString(content: any, rule: string | undefined, isJson: boolean = false): string {
    if (!rule) return ''
    
    // 处理<js>代码块：提取<js>前面的规则部分
    if (rule.includes('<js>')) {
      const cr = rule.substring(0, rule.indexOf('<js>')).trim()
      return cr ? this.getString(content, cr, isJson) : ''
    }
    
    // 智能字段匹配
    if (/^(name|author|cover|intro)$/i.test(rule.trim()) && !isJson) {
      const f = rule.trim().toLowerCase()
      const selMap = {
        name: ['class.bookNm@text', `class.${f}@text`],
        author: ['class.authorNm@text', `class.${f}@text`],
        cover: ['tag.img@data-src', 'tag.img@src', `class.${f}@tag.img@src`],
        intro: ['class.bookIntro@text', `class.${f}@text`]
      }
      for (const s of selMap[f] || []) {
        try { const r = this.getString(content, s, false); if (r?.trim()) return r } catch {}
      }
      return ''
    }
    const mode = RuleTypeDetector.detectMode(rule, isJson)
    let cr = RuleTypeDetector.removePrefix(rule)
    cr = this.processPutRule(cr)
    cr = this.processGetRule(cr)
    const pts = cr.split('##'), main = pts[0], regex = pts[1], repl = pts[2] || ''
    let res = ''
    try {
      if (mode === RuleMode.Json) res = new JsonPathParser(content).getString(main)
      else if (mode !== RuleMode.XPath && mode !== RuleMode.Js) res = new CssParser(content).getString(main)
    } catch { return '' }
    if (regex && res) try { res = res.replace(new RegExp(regex, pts.length > 3 ? '' : 'g'), repl) } catch {}
    return res
  }
  
  getElements(content: any, rule: string | undefined): Element[] {
    if (!rule) return []
    const isJson = typeof content === 'string' && (content.trim().startsWith('{') || content.trim().startsWith('['))
    if (rule.includes('<js>')) {
      const cr = rule.substring(0, rule.indexOf('<js>')).trim()
      if (cr) return new CssParser(content).getElements(cr)
    }
    const mode = RuleTypeDetector.detectMode(rule, isJson)
    let cr = RuleTypeDetector.removePrefix(rule)
    cr = this.processPutRule(cr)
    cr = this.processGetRule(cr)
    try {
      if (mode === RuleMode.Json) return new JsonPathParser(content).getList(cr).map((item, i) => {
        const d = document.createElement('div')
        d.setAttribute('data-json', JSON.stringify(item))
        d.setAttribute('data-index', String(i))
        d.textContent = typeof item === 'object' ? JSON.stringify(item) : String(item)
        return d
      })
      return new CssParser(content).getElements(cr)
    } catch { return [] }
  }
  
  private processPutRule(rule: string): string {
    let res = rule, m: RegExpExecArray | null
    while ((m = /@put:\{([^}]+)\}/gi.exec(rule)) !== null) {
      try {
        for (const [k, v] of Object.entries(JSON.parse(`{${m[1]}}`))) this.ruleData.set(k, String(v))
        res = res.replace(m[0], '')
      } catch {}
    }
    return res
  }
  
  private processGetRule(rule: string): string {
    return rule.replace(/@get:\{([^}]+)\}|\{\{([^}]+)\}\}/g, (m, k1, k2) => this.ruleData.get(k1 || k2) || m)
  }
  
  clearRuleData(): void { this.ruleData.clear() }
  setRuleData(k: string, v: string): void { this.ruleData.set(k, v) }
  getRuleData(k: string): string | undefined { return this.ruleData.get(k) }
  
  // 内容处理方法
  static cleanContent(html: string): string {
    if (!html) return ''
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').trim()
  }
  
  static toParagraphs(content: string): string[] {
    return content ? content.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0) : []
  }
  
  static isImage(text: string): boolean {
    return !!text && (/^<img\s/i.test(text) || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(text) || /^data:image\//i.test(text))
  }
  
  static extractImageUrl(text: string): string {
    if (!text) return ''
    const imgMatch = text.match(/<img[^>]+src=["']([^"']+)["']/i)
    if (imgMatch) return imgMatch[1]
    const dataSrcMatch = text.match(/data-src=["']([^"']+)["']/i)
    if (dataSrcMatch) return dataSrcMatch[1]
    return /^(https?:\/\/|data:image\/)/.test(text) ? text : ''
  }
  
  static processContent(html: string): string[] {
    return this.toParagraphs(this.cleanContent(html))
  }
}

export const ruleParser = new RuleParser()
