// 规则模式枚举
enum Mode { Default, Json, XPath, Js, Regex }

// 规则类型检测器
class RuleDetector {
  static detect(r: string, isJson: boolean): Mode {
    if (!r) return Mode.Default
    const t = r.trim()
    if (t[0] === '/' || t.startsWith('@XPath:')) return Mode.XPath
    if (t[0] === '$' || t.startsWith('@Json:') || t.startsWith('@JSon:')) return Mode.Json
    return t.includes('<js>') ? Mode.Js : (isJson ? Mode.Json : Mode.Default)
  }
  
  static clean(r: string): string {
    const t = r.trim()
    for (const [p, l] of [['@XPath:', 7], ['@Json:', 6], ['@JSon:', 6], ['@CSS:', 5], ['@@', 2]] as const)
      if (t.startsWith(p)) return t.substring(l)
    return t
  }
}

// 规则分析器
class RuleAnalyzer {
  constructor(private queue: string) {}
  
  splitRule(...seps: string[]): { rules: string[], type: string } {
    if (!this.queue) return { rules: [], type: '' }
    for (const sep of seps) {
      const parts = this.split(sep)
      if (parts.length > 1) return { rules: parts.filter(Boolean), type: sep }
    }
    return { rules: [this.queue], type: '' }
  }
  
  private split(sep: string): string[] {
    const parts: string[] = [], len = this.queue.length, sepLen = sep.length
    let depth = 0, quote: string | null = null, curr = '', i = 0
    while (i < len) {
      const c = this.queue[i]
      if (c === '"' || c === "'") quote = quote === c ? null : (!quote ? c : quote)
      if (!quote && '([{'.includes(c)) depth++
      else if (!quote && ')]}'.includes(c)) depth--
      if (!quote && depth === 0 && this.queue.substring(i, i + sepLen) === sep) {
        parts.push(curr.trim())
        curr = ''
        i += sepLen
        continue
      }
      curr += c
      i++
    }
    if (curr) parts.push(curr.trim())
    return parts
  }
  
  innerRule(start: string, end: string, fn: (rule: string) => string | null): string {
    const res: string[] = [], len = this.queue.length, sLen = start.length
    let last = 0, pos = 0
    while (pos < len) {
      const si = this.queue.indexOf(start, pos)
      if (si === -1) break
      let ei = si + sLen, depth = 1
      while (depth > 0 && ei < len) {
        const ns = this.queue.indexOf(start, ei), ne = this.queue.indexOf(end, ei)
        if (ne === -1) break
        ns !== -1 && ns < ne ? (depth++, ei = ns + sLen) : (depth--, ei = ne + (depth === 0 ? 0 : end.length))
      }
      if (depth === 0) {
        const repl = fn(this.queue.substring(si + sLen, ei))
        if (repl != null) {
          res.push(this.queue.substring(last, si), repl)
          last = ei + end.length
          pos = last
          continue
        }
      }
      pos = si + 1
    }
    return last === 0 ? '' : res.concat(this.queue.substring(last)).join('')
  }
}


// JSON 路径解析器
class JsonPathParser {
  private data: any
  
  constructor(json: any) {
    try {
      this.data = typeof json === 'object' && json !== null ? json : (typeof json === 'string' ? JSON.parse(json) : json)
      if (this.data?.body && typeof this.data.body === 'string') {
        try {
          const bodyData = JSON.parse(this.data.body)
          if (bodyData && typeof bodyData === 'object') this.data = { ...this.data, ...bodyData }
        } catch {}
      }
    } catch { this.data = {} }
  }
  
  getString(rule: string): string {
    if (!rule) return ''
    const { rules, type } = new RuleAnalyzer(rule).splitRule('&&', '||')
    if (rules.length === 1) {
      const replaced = new RuleAnalyzer(rule).innerRule('{$.', '}', r => this.getString(r))
      return replaced || this.getSingleValue(rules[0])
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
        return Array.isArray(result) ? result : (result != null ? [result] : [])
      } catch { return [] }
    }
    const results: any[][] = []
    for (const r of rules) {
      try {
        const result = this.getValueByPath(r)
        const list = Array.isArray(result) ? result : (result != null ? [result] : [])
        if (list.length) {
          results.push(list)
          if (type === '||') break
        }
      } catch {}
    }
    if (!results.length) return []
    if (type === '%%') {
      const merged: any[] = [], maxLen = Math.max(...results.map(a => a.length))
      for (let i = 0; i < maxLen; i++) 
        for (const arr of results) if (i < arr.length) merged.push(arr[i])
      return merged
    }
    return results.flat()
  }
  
  private getSingleValue(rule: string): string {
    try {
      const value = this.getValueByPath(rule)
      return value == null ? '' : Array.isArray(value) ? value.join('\n') : String(value)
    } catch { return '' }
  }

  
  private getValueByPath(path: string): any {
    if (!path || !this.data) return null
    if (path === '$' || path === '$[*]') return Array.isArray(this.data) ? this.data : [this.data]
    
    path = path.replace(/^\$\./, '').replace(/^\$\[/, '[')
    if (!path) return this.data
    if (path[0] === '.') return this.recursiveSearch(this.data, path.substring(1))
    
    if (path[0] === '[') {
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
      arrayMatch ? (current = current[arrayMatch[1]], arrayMatch[2] !== '*' && (current = current?.[parseInt(arrayMatch[2])])) : (current = current[part])
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

// CSS 解析器
export class CssParser {
  private doc: Document | Element
  
  constructor(html: string | Element) {
    this.doc = typeof html === 'string' ? new DOMParser().parseFromString(html, 'text/html') : html
  }
  
  getElements(rule: string): Element[] {
    if (!rule) return []
    const isCss = rule.toLowerCase().startsWith('@css:')
    const cleanRule = isCss ? rule.substring(5).trim() : rule
    const { rules, type } = new RuleAnalyzer(cleanRule).splitRule('&&', '||', '%%')
    
    if (rules.length === 1) return isCss ? this.selectCss(rules[0]) : this.selectChain(rules[0])
    
    const allResults: Element[][] = []
    for (const r of rules) {
      const elements = isCss ? this.selectCss(r) : this.selectChain(r)
      if (elements.length) {
        allResults.push(elements)
        if (type === '||') break
      }
    }
    
    if (type === '%%') {
      const result: Element[] = [], maxLen = Math.max(...allResults.map(a => a.length))
      for (let i = 0; i < maxLen; i++)
        for (const arr of allResults) if (i < arr.length) result.push(arr[i])
      return result
    }
    return allResults.flat()
  }

  
  private selectCss(rule: string): Element[] {
    try { return Array.from(this.doc.querySelectorAll(rule)) } catch { return [] }
  }
  
  private selectChain(rule: string): Element[] {
    if (!rule) return []
    const parts = rule.split('@').map(p => p.trim()).filter(Boolean)
    if (!parts.length) return []
    
    const lastPart = parts[parts.length - 1]
    const isAttr = /^(text|textNodes|ownText|html|all|href|src|title|alt|class|id|name|value|data-\w+)$/.test(lastPart)
    const selectorParts = isAttr ? parts.slice(0, -1) : parts
    if (!selectorParts.length) return this.doc instanceof Element ? [this.doc] : []
    
    let elements: Element[] = [this.doc as Element]
    for (let i = 0; i < selectorParts.length; i++) {
      const selector = selectorParts[i]
      if (!selector) continue
      
      if (selector.includes(' ') && selector.includes('!')) {
        elements = selector.split(/\s+/).reduce((els, part) => {
          const match = part.includes('!') ? part.match(/^([^!]+)(!.+)$/) : null
          return match ? els.flatMap(el => this.applyFilter(Array.from(el.querySelectorAll(match[1])), '[' + match[2].substring(1) + ']')) : els.flatMap(el => Array.from(el.querySelectorAll(part)))
        }, elements)
        continue
      }
      
      elements = elements.flatMap(el => i > 0 && this.matches(el, selector) ? [el] : this.select(selector, el))
      if (!elements.length) break
    }
    
    if (!isAttr && elements.length === 1) {
      const el = elements[0], tag = el.tagName.toLowerCase()
      const childTag = { ul: 'li', ol: 'li', tbody: 'tr', table: 'tr' }[tag]
      if (childTag) {
        const children = tag === 'table' ? Array.from(el.querySelector('tbody')?.children || []) : Array.from(el.children)
        const filtered = children.filter(c => c.tagName.toLowerCase() === childTag) as Element[]
        if (filtered.length) return filtered
      }
    }
    
    return elements
  }
  
  private matches(el: Element, sel: string): boolean {
    try {
      if (sel.startsWith('class.')) return sel.substring(6).trim().split(/\s+/).every(c => el.classList.contains(c))
      if (sel.startsWith('id.')) return el.id === sel.substring(3)
      if (sel.startsWith('tag.')) { const m = sel.match(/^tag\.([^.]+)/); return m ? el.tagName.toLowerCase() === m[1].toLowerCase() : false }
      return el.matches(sel)
    } catch { return false }
  }

  
  getString(rule: string): string {
    const jsIndex = rule.indexOf('@js:')
    if (jsIndex !== -1) {
      let result = jsIndex > 0 ? this.getString(rule.substring(0, jsIndex)) : ''
      const jsCode = rule.substring(jsIndex + 4).replace(/\n/g, ' ').trim()
      if (jsCode) {
        try {
          const lines = jsCode.split(';').map(l => l.trim()).filter(Boolean)
          const hasMulti = jsCode.includes(';') || /\b(var|let|const)\b/.test(jsCode)
          const wrapped = hasMulti && lines.length > 1 ? `${lines.slice(0, -1).join(';')}; return (${lines[lines.length - 1]});` : `return (${lines[0] || jsCode});`
          const jsResult = new Function('result', wrapped)(result)
          if (jsResult != null) result = String(jsResult)
        } catch (e) { console.error('[JS失败]', e) }
      }
      return result
    }
    
    const pureAttr = /^(text|href|src|html|all|textNodes|ownText|data-\w+)$/.test(rule)
    const els = pureAttr ? [this.doc instanceof Element ? this.doc : (this.doc.body?.firstElementChild || this.doc.documentElement)] : this.getElements(rule)
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
    
    const isHref = rule.includes('@href') || rule === 'href', isSrc = rule.includes('@src') || rule === 'src', isText = rule.includes('@text') || rule === 'text'
    const texts = els.map(el => pureAttr ? getAttr(el, rule) : (rule.match(/@([\w-]+)(?!.*@)/)?.[1] ? getAttr(el, rule.match(/@([\w-]+)(?!.*@)/)[1]) : el.textContent?.trim() || ''))
    const valid = texts.filter(t => t && !(isHref && (t.startsWith('javascript:') || t === '#')) && !(isText && /^(首页|搜索|排行|目录|登录|注册)$/i.test(t.trim())))
    return (isHref || isSrc || isText) ? (valid[0] || '') : valid.join('\n')
  }

  
  private select(sel: string, ctx: Element | Document = this.doc): Element[] {
    try {
      if (!sel) return []
      
      // 标签名.索引：dl.1
      const simpleTagMatch = /^[a-z]+\.\d+$/i.test(sel) ? sel.match(/^([a-z]+)\.(\d+)$/i) : null
      if (simpleTagMatch) {
        const elements = Array.from(ctx.getElementsByTagName(simpleTagMatch[1]))
        const i = parseInt(simpleTagMatch[2])
        return i >= 0 && i < elements.length ? [elements[i]] : []
      }
      
      // tag.div.0 或 tag.div[0]
      if (sel.startsWith('tag.')) {
        const match = sel.substring(4).match(/^([^:\[.]+)(?:\.(\d+)|(\[.+\]))?(.*)/)
        if (match) {
          const elements = Array.from(ctx.getElementsByTagName(match[1]))
          if (match[2] !== undefined) {
            const i = parseInt(match[2])
            return i >= 0 && i < elements.length ? [elements[i]] : []
          }
          return match[3] ? this.applyFilter(elements, match[3] + match[4]) : (match[4] ? this.applyFilter(elements, match[4]) : elements)
        }
      }
      
      // class.list_xm.1
      if (sel.startsWith('class.')) {
        const withoutPrefix = sel.substring(6)
        const dotMatch = withoutPrefix.match(/^(.+?)\.(\d+)$/)
        const bracketMatch = !dotMatch ? withoutPrefix.match(/^(.+?)(\[.+\])$/) : null
        const className = dotMatch ? dotMatch[1] : (bracketMatch ? bracketMatch[1] : withoutPrefix)
        const selector = className.trim().split(/\s+/).map(c => `.${c}`).join('')
        const elements = Array.from(ctx.querySelectorAll(selector))
        
        if (dotMatch) {
          const i = parseInt(dotMatch[2])
          return i >= 0 && i < elements.length ? [elements[i]] : []
        }
        return bracketMatch ? this.applyFilter(elements, bracketMatch[2]) : elements
      }
      
      // id.list.0
      if (sel.startsWith('id.')) {
        const withoutPrefix = sel.substring(3)
        const dotMatch = withoutPrefix.match(/^([^.:\[]+)\.(\d+)$/)
        const bracketMatch = !dotMatch ? withoutPrefix.match(/^([^.:\[]+)(\[.+\])$/) : null
        const idName = dotMatch ? dotMatch[1] : (bracketMatch ? bracketMatch[1] : withoutPrefix.split(/[.:\[]/)[0])
        const el = ctx.querySelector(`#${idName}`)
        if (!el) return []
        if (dotMatch) return parseInt(dotMatch[2]) === 0 ? [el] : []
        return bracketMatch ? this.applyFilter([el], bracketMatch[2]) : [el]
      }
      
      // :eq(n), :first, :last
      const eqMatch = sel.match(/^(.+):eq\((\d+)\)$/)
      if (eqMatch) { const e = Array.from(ctx.querySelectorAll(eqMatch[1])); const i = parseInt(eqMatch[2]); return i < e.length ? [e[i]] : [] }
      if (sel.endsWith(':first')) { const e = Array.from(ctx.querySelectorAll(sel.slice(0, -6))); return e[0] ? [e[0]] : [] }
      if (sel.endsWith(':last')) { const e = Array.from(ctx.querySelectorAll(sel.slice(0, -5))); return e.length ? [e[e.length - 1]] : [] }
      
      return Array.from(ctx.querySelectorAll(sel))
    } catch { return [] }
  }

  
  private applyFilter(els: Element[], idx: string): Element[] {
    if (!idx) return els
    if (idx[0] === '[' && idx[idx.length - 1] === ']') return this.filterArray(els, idx.slice(1, -1))
    if (idx[0] === '.' || idx[0] === '!' || idx[0] === ':') return this.filterColon(els, idx)
    return els
  }
  
  private filterArray(els: Element[], idx: string): Element[] {
    const excl = idx[0] === '!', set = new Set<number>()
    for (const i of idx.replace(/^!/, '').split(',').map(s => s.trim())) {
      if (i.includes(':')) {
        const p = i.split(':')
        let s = p[0] ? parseInt(p[0]) : 0, e = p[1] ? parseInt(p[1]) : els.length - 1, st = p[2] ? parseInt(p[2]) : 1
        s < 0 && (s = els.length + s)
        e < 0 && (e = els.length + e)
        if (e >= s) for (let j = s; j <= e; j += st) j >= 0 && j < els.length && set.add(j)
        else for (let j = s; j >= e; j -= st) j >= 0 && j < els.length && set.add(j)
      } else {
        let j = parseInt(i)
        j < 0 && (j = els.length + j)
        j >= 0 && j < els.length && set.add(j)
      }
    }
    return excl ? els.filter((_, i) => !set.has(i)) : Array.from(set).sort((a, b) => a - b).map(i => els[i])
  }
  
  private filterColon(els: Element[], idx: string): Element[] {
    const excl = idx[0] === '!'
    const set = new Set(idx.replace(/^[.!]/, '').split(':').map(s => parseInt(s.trim())).filter(n => !isNaN(n)).map(i => i < 0 ? els.length + i : i).filter(i => i >= 0 && i < els.length))
    return excl ? els.filter((_, i) => !set.has(i)) : Array.from(set).map(i => els[i])
  }
}

// 主规则解析器
export class RuleParser {
  private ruleData = new Map<string, string>()
  
  getString(content: any, rule?: string, isJson = false): string {
    if (!rule) return ''
    
    if (rule.includes('<js>')) {
      const [beforeJs, jsCode] = [rule.split('<js>')[0].trim(), rule.split('<js>')[1]?.split('</js>')[0] || '']
      let result = beforeJs ? this.getString(content, beforeJs, isJson) : ''
      
      if (jsCode) {
        try {
          const javaStore = new Map<string, string>()
          const java = { put: (k: string, v: string) => javaStore.set(k, v), get: (k: string) => javaStore.get(k) || '', getString: (k: string) => javaStore.get(k) || '' }
          
          const lines = jsCode.trim().split('\n').map(l => l.trim()).filter(Boolean)
          if (lines.length) {
            const lastLine = lines[lines.length - 1]
            const isExpr = (lastLine.includes('"') || lastLine.includes("'") || lastLine.includes('`')) && !/^\s*\w+\s*=/.test(lastLine) && !lastLine.startsWith('java.') && !lastLine.startsWith('return')
            const wrapped = isExpr ? (lines.length > 1 ? `${lines.slice(0, -1).join('\n')}\nreturn ${lastLine.replace(/;$/, '')};` : `return ${lastLine.replace(/;$/, '')};`) : jsCode
            const jsResult = new Function('result', 'java', wrapped)(result, java)
            jsResult !== undefined && jsResult !== null && (result = String(jsResult))
          }
        } catch (e) { console.error('[JS失败]', e) }
      }
      return result
    }

    
    if (rule.includes('{{') && rule.includes('}}')) {
      rule = this.replaceTemplate(rule, content)
      if (!rule.includes('$.') && !rule.includes('@') && !rule.includes('<js>') && !rule.includes('##')) return rule
    }
    
    const mode = RuleDetector.detect(rule, isJson)
    let cr = RuleDetector.clean(rule)
    cr = this.processPutRule(cr)
    cr = this.processGetRule(cr)
    const [main, regex, repl = ''] = cr.split('##')
    
    let res = ''
    try {
      if (mode === Mode.Json) res = new JsonPathParser(content).getString(main)
      else if (mode !== Mode.XPath && mode !== Mode.Js) res = new CssParser(content).getString(main)
    } catch (e) { console.error('[解析失败]', e) }
    
    if (regex && res) try { res = res.replace(new RegExp(regex, cr.split('##').length > 3 ? '' : 'g'), repl) } catch {}
    return res
  }
  
  getElements(content: any, rule?: string): Element[] {
    if (!rule) return []
    const isJson = typeof content === 'string' && (content.trim()[0] === '{' || content.trim()[0] === '[')
    
    if (rule.includes('<js>')) {
      const cr = rule.substring(0, rule.indexOf('<js>')).trim()
      if (cr) return new CssParser(content).getElements(cr)
    }
    
    const mode = RuleDetector.detect(rule, isJson)
    let cr = RuleDetector.clean(rule)
    cr = this.processPutRule(cr)
    cr = this.processGetRule(cr)
    
    try {
      if (mode === Mode.Json) {
        return new JsonPathParser(content).getList(cr).map((item, i) => {
          const d = document.createElement('div')
          d.setAttribute('data-json', JSON.stringify(item))
          d.setAttribute('data-index', String(i))
          return d
        })
      }
      return new CssParser(content).getElements(cr)
    } catch (e) {
      console.error('[解析失败]', e)
      return []
    }
  }
  
  private replaceTemplate(rule: string, content: any): string {
    let result = rule
    for (const match of rule.matchAll(/\{\{(\$[^}]+)\}\}/g)) {
      try {
        const value = new JsonPathParser(content).getString(match[1])
        result = result.replace(match[0], value || '')
      } catch { result = result.replace(match[0], '') }
    }
    return result
  }
  
  private processPutRule(rule: string): string {
    let res = rule
    for (const m of rule.matchAll(/@put:\{([^}]+)\}/gi)) {
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

  
  static cleanContent(html: string): string {
    return html ? html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').trim() : ''
  }
  
  static toParagraphs(content: string): string[] {
    return content ? content.split(/\n+/).map(p => p.trim()).filter(Boolean) : []
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
