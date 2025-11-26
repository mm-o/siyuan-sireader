import * as API from '@/api'
import type { HighlightColor, Bookmark } from '@/core/epubDoc'
import { loadBookmarks, addBookmark, removeBookmark } from '@/core/epubDoc'

interface TocItem { id: string; href: string; label: string; subitems?: TocItem[] }
interface Mark { cfi: string; color: HighlightColor; text?: string }
type Mode = 'toc' | 'bookmark' | 'mark' | 'note'

const COLORS: Record<HighlightColor, string> = { red: '#f44336', orange: '#ff9800', yellow: '#ffeb3b', green: '#4caf50', pink: '#e91e63', blue: '#2196f3', purple: '#9c27b0' }
const COLOR_MAP = { R: 'red', O: 'orange', Y: 'yellow', G: 'green', P: 'pink', L: 'blue', V: 'purple' } as const
const MODES = [{ k: 'toc', i: '#iconList', l: '目录' }, { k: 'bookmark', i: '#iconBookmark', l: '书签' }, { k: 'mark', i: '#iconMark', l: '标注' }, { k: 'note', i: '#iconFile', l: '笔记' }]

export class EpubToc {
  private panel: HTMLElement | null = null
  private overlay: HTMLElement | null = null
  private toc: TocItem[] = []
  private bookmarks: Bookmark[] = []
  private marks: Mark[] = []
  private currentHref = ''
  private mode: Mode = 'toc'
  private reverse = false
  private search = ''
  private scrollPos: 'top' | 'bottom' = 'top'
  private expanded = new Map<string, boolean>()
  
  constructor(
    private parentEl: HTMLElement,
    private position: 'left' | 'right',
    private rendition: any,
    private docId: string,
    private i18n?: any
  ) {
    this.rendition?.on('relocated', (l: any) => l?.start?.href && (this.currentHref = l.start.href, this.panel && this.mode === 'toc' && this.updateHighlight()))
  }

  async load(navigation: any) {
    this.toc = navigation.toc.map((item: any) => this.mapItem(item))
    this.docId && await this.reloadData()
  }
  
  async setDocId(docId: string) {
    this.docId = docId
    await this.reloadData()
    this.panel && this.render()
  }
  
  private async reloadData() {
    if (!this.docId) return
    const [bms, blocks] = await Promise.all([loadBookmarks(this.docId), API.sql(`SELECT markdown FROM blocks WHERE root_id='${this.docId}' AND markdown LIKE '%epubcfi%'`).catch(() => [])])
    this.bookmarks = bms
    this.marks = Array.from(new Map(blocks.map((b: any) => b.markdown?.match(/^-\s*([ROYGPLV])\s\[([^\]]+)\].*#(epubcfi\([^)]+\))/)).filter(Boolean).map((m: any) => ({ cfi: m[3], color: COLOR_MAP[m[1] as keyof typeof COLOR_MAP] || 'yellow' as HighlightColor, text: m[2] })).map((m: Mark) => [m.cfi, m])).values())
  }

  private mapItem(item: any): TocItem {
    return {
      id: item.id || item.href,
      href: item.href,
      label: item.label,
      subitems: item.subitems?.map((i: any) => this.mapItem(i))
    }
  }

  // 显示/隐藏
  toggle() { this.panel ? this.close() : this.open() }
  destroy() { this.close() }

  private open() {
    this.overlay = Object.assign(document.createElement('div'), { className: 'epub-toc-overlay', onclick: () => this.close() })
    this.panel = Object.assign(document.createElement('div'), { className: `epub-toc-panel epub-toc-panel--${this.position}` })
    this.render()
    this.parentEl.append(this.overlay, this.panel)
    this.mode === 'toc' && this.currentHref && this.updateHighlight(true)
  }

  private close() {
    this.overlay?.remove()
    this.panel?.remove()
    this.overlay = this.panel = null
  }

  private render() {
    if (!this.panel) return
    const t = this.i18n || {}
    this.panel.innerHTML = `<div class="toc-header"><div class="toc-modes">${MODES.map(m => `<button class="toc-mode-btn${this.mode === m.k ? ' active' : ''} b3-tooltips b3-tooltips__s" data-mode="${m.k}" aria-label="${t[m.k] || m.l}"><svg><use xlink:href="${m.i}"/></svg></button>`).join('')}</div><div class="toc-tools"><button class="toc-btn${this.reverse ? ' active' : ''} b3-tooltips b3-tooltips__sw" data-action="reverse" aria-label="${this.reverse ? t.normalOrder || '正序' : t.reverseOrder || '反序'}"><svg><use xlink:href="#iconSort"/></svg></button><button class="toc-btn b3-tooltips b3-tooltips__sw" data-action="scroll" aria-label="${this.scrollPos === 'top' ? t.scrollBottom || '到底部' : t.scrollTop || '到顶部'}"><svg><use xlink:href="${this.scrollPos === 'top' ? '#iconDown' : '#iconUp'}"/></svg></button></div></div>${this.mode !== 'note' ? `<div class="toc-search"><input type="text" class="b3-text-field" placeholder="${t.search || '搜索...'}" value="${this.search}"></div>` : ''}<div class="toc-body" data-body>${this.renderContent()}</div>`
    this.bindEvents()
    this.mode === 'toc' && this.currentHref && requestAnimationFrame(() => this.updateHighlight(true))
  }

  private filterItems(items: TocItem[], q?: string): TocItem[] {
    if (!q) return items
    const lq = q.toLowerCase()
    return items.reduce((a, i) => (i.label.toLowerCase().includes(lq) ? a.push(i) : i.subitems && ((f) => f.length && a.push({ ...i, subitems: f }))(this.filterItems(i.subitems, q)), a), [] as TocItem[])
  }

  private reverseItems(items: TocItem[]): TocItem[] {
    return items.map(i => ({ ...i, subitems: i.subitems ? this.reverseItems(i.subitems) : undefined })).reverse()
  }

  private renderContent(): string {
    const t = this.i18n || {}
    if (this.mode === 'note') return `<div class="toc-state">${t.comingSoon || '即将推出...'}</div>`
    if (this.mode === 'bookmark') return this.renderList(this.bookmarks, 'bookmark')
    if (this.mode === 'mark') return this.renderList(this.marks, 'mark')
    let items = this.filterItems(this.toc, this.search)
    if (this.reverse) items = this.reverseItems(items)
    return items.length ? this.renderTocItems(items, 0) : `<div class="toc-state">${t.noToc || '暂无目录'}</div>`
  }

  private renderTocItems(items: TocItem[], lv: number): string {
    const t = this.i18n || {}
    return items.map(i => ((c = this.currentHref.split('#')[0] === i.href.split('#')[0], b = this.bookmarks.some(x => x.href === i.href), s = i.subitems?.length, e = this.expanded.get(i.id) ?? true) => `<div class="toc-item-wrap" data-wrap="${i.id}"><div class="b3-list-item${c ? ' b3-list-item--focus' : ''}" data-href="${i.href}" style="padding-left:${8 + lv * 16}px">${s ? `<button class="toc-expand-btn" data-expand="${i.id}" style="opacity:1"><svg style="width:12px;height:12px;transition:transform .2s${e ? ';transform:rotate(90deg)' : ''}"><use xlink:href="#iconRight"/></svg></button>` : '<span style="width:20px;display:inline-block"></span>'}<span class="b3-list-item__text fn__flex-1">${i.label}</span><button class="toc-bookmark-btn b3-tooltips b3-tooltips__w" aria-label="${b ? t.removeBookmark || '移除书签' : t.addBookmark || '添加书签'}" data-bookmark="${i.href}" data-label="${i.label}"${b ? ' style="opacity:1"' : ''}><svg style="width:14px;height:14px;color:${b ? 'var(--b3-theme-error)' : 'var(--b3-theme-on-surface)'}"><use xlink:href="#iconBookmark"/></svg></button></div>${s && e ? `<div class="toc-subitems" data-sub="${i.id}">${this.renderTocItems(i.subitems!, lv + 1)}</div>` : ''}</div>`)()).join('')
  }

  private renderList(data: Bookmark[] | Mark[], type: 'bookmark' | 'mark'): string {
    const t = this.i18n || {}
    if (!data.length) return `<div class="toc-state">${type === 'bookmark' ? t.noBookmarks || '暂无书签' : t.noMarks || '暂无标记'}</div>`
    if (type === 'bookmark') return (data as Bookmark[]).map(b => `<div class="b3-list-item" data-href="${b.href}" style="padding:8px 12px;position:relative"><span class="b3-list-item__text fn__flex-1">${b.label}</span><button class="toc-delete-btn b3-tooltips b3-tooltips__w" aria-label="${t.deleteBookmark || '删除书签'}" data-action="remove-bookmark" data-href="${b.href}"><svg style="width:14px;height:14px;color:var(--b3-theme-error)"><use xlink:href="#iconTrashcan"/></svg></button></div>`).join('')
    return (data as Mark[]).map(m => {
      const [mt, ch] = ((x) => [x ? m.text!.substring(0, x.index) : m.text, x ? x[1] : ''])(m.text?.match(/（([^）]+)）$/))
      return `<div class="b3-list-item" data-cfi="${m.cfi}" style="padding:8px 12px;border-left:3px solid ${COLORS[m.color] || COLORS.yellow};margin:6px 8px;position:relative;display:block"><div style="word-break:break-word;line-height:1.6;padding-right:32px"><div>${mt || m.cfi.slice(0, 50)}</div>${ch ? `<div style="font-size:11px;opacity:0.6;margin-top:4px;color:var(--b3-theme-on-surface-light)">${ch}</div>` : ''}</div><button class="toc-delete-btn b3-tooltips b3-tooltips__w" aria-label="${t.deleteMark || '删除标记'}" data-action="remove-mark" data-cfi="${m.cfi}" style="position:absolute;top:8px;right:8px"><svg style="width:14px;height:14px;color:var(--b3-theme-error)"><use xlink:href="#iconTrashcan"/></svg></button></div>`
    }).join('')
  }

  private bindEvents() {
    if (!this.panel) return
    this.panel.addEventListener('click', async (e) => {
      const t = e.target as HTMLElement, p = t.closest('[data-mode], [data-action], [data-expand], [data-bookmark], [data-href], [data-cfi]') as HTMLElement
      if (!p) return
      const d = p.dataset
      e.stopPropagation()
      if (d.mode) this.mode = d.mode as Mode, this.search = '', this.render()
      else if (d.action) d.action === 'reverse' ? this.toggleReverse() : d.action === 'scroll' ? this.handleScroll() : d.action === 'remove-bookmark' ? await this.removeBookmark(d.href!) : d.action === 'remove-mark' && await this.removeMark(d.cfi!)
      else if (d.expand) this.toggleExpand(d.expand)
      else if (d.bookmark && !t.closest('.b3-list-item')?.getAttribute('data-href')) this.bookmarks.some(x => x.href === d.bookmark) ? await this.removeBookmark(d.bookmark!) : await this.addBookmark(d.bookmark!, d.label!)
      else if (d.href && !t.closest('button')) this.navigate(d.href)
      else if (d.cfi && !t.closest('button')) this.rendition?.display(d.cfi)
    })
    const input = this.panel.querySelector('input'); input && input.addEventListener('input', (e) => (this.search = (e.target as HTMLInputElement).value, this.render()))
  }

  private navigate(href: string) { this.currentHref = href; this.rendition?.display(href.split('#')[0]); this.render() }
  
  private toggleReverse() { this.reverse = !this.reverse; const b = this.panel?.querySelector('[data-body]'); if (!b) return this.render(); const p = b.scrollHeight > 0 ? b.scrollTop / b.scrollHeight : 0; this.render(); requestAnimationFrame(() => { const n = this.panel?.querySelector('[data-body]'); n && (n.scrollTop = p * n.scrollHeight) }) }
  private handleScroll() { const b = this.panel?.querySelector('[data-body]'); if (!b) return; const t = this.scrollPos === 'top'; this.scrollPos = t ? 'bottom' : 'top'; b.scrollTo({ top: t ? b.scrollHeight : 0, behavior: 'smooth' }); const n = this.panel?.querySelector('[data-action="scroll"]'), i = this.i18n || {}, u = n?.querySelector('use'); n && n.setAttribute('aria-label', this.scrollPos === 'top' ? i.scrollBottom || '到底部' : i.scrollTop || '到顶部'); u && u.setAttribute('xlink:href', this.scrollPos === 'top' ? '#iconDown' : '#iconUp') }
  private toggleExpand(id: string) { const e = this.expanded.get(id) ?? true, w = this.panel?.querySelector(`[data-wrap="${id}"]`); this.expanded.set(id, !e); if (!w) return; const s = w.querySelector('svg'), u = w.querySelector(`[data-sub="${id}"]`); s && (s.style.transform = e ? '' : 'rotate(90deg)'); u && ((u as HTMLElement).style.display = e ? 'none' : 'block') }

  async addBookmark(href: string, label: string) { if (!this.docId) return console.warn('[SiReader] 无法添加书签'); await addBookmark(this.docId, label, href); this.bookmarks = await loadBookmarks(this.docId); this.updateBookmarkBtn(href, true) }
  private async removeBookmark(href: string) { if (!this.docId) return; await removeBookmark(this.docId, href); this.bookmarks = await loadBookmarks(this.docId); this.updateBookmarkBtn(href, false) }
  private updateBookmarkBtn(h: string, b: boolean) { const i = this.panel?.querySelector(`[data-href="${h}"]`), n = i?.querySelector('[data-bookmark]') as HTMLElement, s = n?.querySelector('svg'), t = this.i18n || {}; n && (n.setAttribute('aria-label', b ? t.removeBookmark || '移除书签' : t.addBookmark || '添加书签'), n.style.opacity = b ? '1' : '', s && (s.style.color = b ? 'var(--b3-theme-error)' : 'var(--b3-theme-on-surface)')) }

  addMark(cfi: string, color: HighlightColor, text?: string) { this.marks = [...this.marks.filter(m => m.cfi !== cfi), { cfi, color, text }]; this.panel && this.mode === 'mark' && this.render() }
  private async removeMark(cfi: string) { if (!this.docId) return; const blocks = await API.sql(`SELECT id FROM blocks WHERE root_id='${this.docId}' AND markdown LIKE '%${cfi}%'`).catch(() => []); await Promise.all(blocks.map((b: any) => API.deleteBlock(b.id).catch(() => {}))); this.marks = this.marks.filter(m => m.cfi !== cfi); this.mode === 'mark' && this.render() }

  private updateHighlight(scroll = false) { if (!this.panel) return; const h = this.currentHref.split('#')[0], c = this.panel.querySelector('.b3-list-item--focus'), n = this.panel.querySelector(`[data-href^="${h}"]`) as HTMLElement; if (!n) return; c && c !== n && c.classList.remove('b3-list-item--focus'); n.classList.add('b3-list-item--focus'); scroll && n.scrollIntoView({ block: 'center' }) }
}
