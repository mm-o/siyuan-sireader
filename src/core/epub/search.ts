/**
 * EPUB 搜索 - 使用 foliate 原生方法
 */

interface Result { cfi: string; excerpt: { pre: string; match: string; post: string }; label?: string }

export class EPUBSearch {
  private view: any
  private results: Result[] = []
  private current = -1

  constructor(view: any) { this.view = view }

  async *search(q: string, opts: any = {}) {
    this.clear()
    const { matchCase = false, matchWholeWords = false } = opts
    
    // 使用 foliate 原生搜索
    for await (const result of this.view.search({
      query: q,
      matchCase,
      matchWholeWords,
      matchDiacritics: false
    })) {
      if (result === 'done') break
      if (result.progress !== undefined) continue // 跳过进度信息
      
      if (result.subitems) {
        // 章节结果
        for (const item of result.subitems) {
          this.results.push({ ...item, label: result.label })
          yield { ...item, label: result.label }
        }
      } else if (result.cfi) {
        // 单个结果
        this.results.push(result)
        yield result
      }
    }
  }

  private async goto(r: Result) {
    try {
      await (this.view.select ? this.view.select(r.cfi) : this.view.goTo(r.cfi))
    } catch { }
  }

  next() {
    if (!this.results.length) return null
    this.current = (this.current + 1) % this.results.length
    this.goto(this.results[this.current])
    return this.results[this.current]
  }

  prev() {
    if (!this.results.length) return null
    this.current = (this.current - 1 + this.results.length) % this.results.length
    this.goto(this.results[this.current])
    return this.results[this.current]
  }

  clear() {
    this.view.clearSearch?.()
    this.results = []
    this.current = -1
  }

  getResults = () => this.results
  getCurrentIndex = () => this.current
  getCurrent = () => this.current >= 0 ? this.results[this.current] : null
}