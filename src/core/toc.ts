import * as API from '@/api'
import type { HighlightColor, Bookmark } from '@/core/epubDoc'
import { loadBookmarks, addBookmark, removeBookmark } from '@/core/epubDoc'

interface TocItem { id: string; href: string; label: string; subitems?: TocItem[] }
interface Mark { cfi: string; color: HighlightColor; text?: string }
type Mode = 'toc' | 'bookmark' | 'mark' | 'note'

const COLORS: Record<HighlightColor, string> = { red: '#f44336', orange: '#ff9800', yellow: '#ffeb3b', green: '#4caf50', pink: '#e91e63', blue: '#2196f3', purple: '#9c27b0' }
const COLOR_MAP = { R: 'red', O: 'orange', Y: 'yellow', G: 'green', P: 'pink', L: 'blue', V: 'purple' } as const
const MODES = [{ k: 'toc', i: '#iconList' }, { k: 'bookmark', i: '#iconBookmark' }, { k: 'mark', i: '#iconMark' }, { k: 'note', i: '#iconFile' }] as const

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
  private expanded = new Map<string, boolean>()
  private body?: HTMLElement
  private boundHandler?: (e: MouseEvent) => void
  
  constructor(
    private parentEl: HTMLElement,
    private position: 'left' | 'right',
    private rendition: any,
    private docId: string,
    private url = ''
  ) {
    this.rendition?.on('relocated', (l: any) => l?.start?.href && (this.currentHref = l.start.href, this.panel && this.mode === 'toc' && this.updateHighlight()))
  }

  load = async (navigation: any) => {
    this.toc = navigation.toc.map(this.mapItem)
    this.docId && await this.reloadData()
  }
  
  setDocId = async (docId: string) => {
    if (this.docId === docId) return
    this.docId = docId
    this.panel && (await this.reloadData(), this.render())
  }
  
  private reloadData = async () => {
    if (!this.docId) return
    const [bms, blocks] = await Promise.all([
      loadBookmarks(this.docId).catch(() => []), 
      API.sql(`SELECT markdown FROM blocks WHERE root_id='${this.docId}' AND markdown LIKE '%epubcfi%'`).catch(() => [])
    ])
    this.bookmarks = bms
    this.marks = [...new Map(
      blocks.map((b: any) => {
        const m = b.markdown?.match(/^-\s*([ROYGPLV])\s+(.+?)\s*\[◎\].*#(epubcfi\([^)]+\))/) || b.markdown?.match(/^-\s*([ROYGPLV])\s.*#(epubcfi\([^)]+\))/)
        return m ? [m[3] || m[2], { cfi: m[3] || m[2], color: COLOR_MAP[m[1] as keyof typeof COLOR_MAP] || 'yellow' as HighlightColor, text: m[2] }] : null
      }).filter(x => x) as [string, Mark][]
    ).values()]
  }

  private mapItem = (item: any): TocItem => ({
    id: item.id || item.href,
    href: item.href,
    label: item.label,
    subitems: item.subitems?.map(this.mapItem)
  })

  toggle = () => this.panel ? this.close() : this.open()
  destroy = () => this.close()

  private open = () => {
    this.overlay = Object.assign(document.createElement('div'), { className: 'epub-toc-overlay', onclick: this.close })
    this.panel = Object.assign(document.createElement('div'), { className: `epub-toc-panel epub-toc-panel--${this.position}` })
    this.bindEvents()
    this.render(true)
    this.parentEl.append(this.overlay, this.panel)
  }

  private close = () => {
    this.boundHandler && this.panel?.removeEventListener('click', this.boundHandler)
    this.overlay?.remove()
    this.panel?.remove()
    this.overlay = this.panel = this.boundHandler = undefined
  }

  private render = (scroll = false) => {
    if (!this.panel) return
    const scrollTop = this.body?.scrollTop || 0
    const modes = MODES.map(m => `<button class="toc-mode-btn${this.mode === m.k ? ' active' : ''} b3-tooltips b3-tooltips__s" data-mode="${m.k}" aria-label="${m.k === 'toc' ? '目录' : m.k === 'bookmark' ? '书签' : m.k === 'mark' ? '标注' : '笔记'}"><svg><use xlink:href="${m.i}"/></svg></button>`).join('')
    const tools = `<button class="toc-btn${this.reverse ? ' active' : ''} b3-tooltips b3-tooltips__sw" data-action="reverse" aria-label="${this.reverse ? '正序' : '反序'}"><svg><use xlink:href="#iconSort"/></svg></button><button class="toc-btn b3-tooltips b3-tooltips__sw" data-action="scroll" aria-label="到底部"><svg><use xlink:href="#iconDown"/></svg></button>`
    this.panel.innerHTML = `<div class="toc-header"><div class="toc-modes">${modes}</div><div class="toc-tools">${tools}</div></div>${this.mode !== 'note' ? `<div class="toc-search"><input type="text" class="b3-text-field" placeholder="搜索..." value="${this.search}"></div>` : ''}<div class="toc-body${this.reverse ? ' toc-body--reverse' : ''}" data-body>${this.renderContent()}</div>`
    this.body = this.panel.querySelector('[data-body]') as HTMLElement
    this.body.scrollTop = scrollTop
    this.panel.querySelector('input')?.addEventListener('input', (e) => (this.search = (e.target as HTMLInputElement).value, this.render()))
    this.mode === 'toc' && this.currentHref && requestAnimationFrame(() => this.updateHighlight(scroll))
  }

  private filterItems = (items: TocItem[], q?: string): TocItem[] => {
    if (!q) return items
    const lq = q.toLowerCase()
    return items.reduce((a, i) => {
      if (i.label.toLowerCase().includes(lq)) return a.push(i), a
      const filtered = i.subitems && this.filterItems(i.subitems, q)
      filtered?.length && a.push({ ...i, subitems: filtered })
      return a
    }, [] as TocItem[])
  }

  private renderContent = (): string => {
    if (this.mode === 'note') return '<div class="toc-state">即将推出...</div>'
    if (this.mode === 'bookmark') return this.renderList(this.bookmarks, 'bookmark')
    if (this.mode === 'mark') return this.renderList(this.marks, 'mark')
    const items = this.filterItems(this.toc, this.search)
    return items.length ? this.renderTocItems(items) : '<div class="toc-state">暂无目录</div>'
  }

  private renderTocItems = (items: TocItem[], lv = 0): string =>
    items.map(i => {
      const isCurrent = this.currentHref.startsWith(i.href.split('#')[0])
      const isBookmarked = this.bookmarks.some(x => x.href === i.href)
      const hasSub = !!i.subitems?.length
      const isExpanded = this.expanded.get(i.id) ?? true
      return `<div class="toc-item-wrap" data-wrap="${i.id}"><div class="b3-list-item${isCurrent ? ' b3-list-item--focus' : ''}" data-href="${i.href}" style="padding-left:${8 + lv * 16}px">${hasSub ? `<button class="toc-expand-btn" data-expand="${i.id}" style="opacity:1"><svg style="width:12px;height:12px;transition:transform .2s${isExpanded ? ';transform:rotate(90deg)' : ''}"><use xlink:href="#iconRight"/></svg></button>` : '<span style="width:20px;display:inline-block"></span>'}<span class="b3-list-item__text fn__flex-1">${i.label}</span><button class="toc-bookmark-btn b3-tooltips b3-tooltips__w" aria-label="${isBookmarked ? '移除书签' : '添加书签'}" data-bookmark="${i.href}" data-label="${i.label}"${isBookmarked ? ' style="opacity:1"' : ''}><svg style="width:14px;height:14px;color:${isBookmarked ? 'var(--b3-theme-error)' : 'var(--b3-theme-on-surface)'}"><use xlink:href="#iconBookmark"/></svg></button></div>${hasSub && isExpanded ? `<div class="toc-subitems" data-sub="${i.id}">${this.renderTocItems(i.subitems!, lv + 1)}</div>` : ''}</div>`
    }).join('')

  private renderList = (data: Bookmark[] | Mark[], type: 'bookmark' | 'mark'): string => {
    if (!data.length) return `<div class="toc-state">暂无${type === 'bookmark' ? '书签' : '标记'}</div>`
    return type === 'bookmark' 
      ? (data as Bookmark[]).map(b => `<div class="b3-list-item" data-href="${b.href}" style="padding:8px 12px;position:relative"><span class="b3-list-item__text fn__flex-1">${b.label}</span><button class="toc-delete-btn b3-tooltips b3-tooltips__w" aria-label="删除书签" data-action="remove-bookmark" data-href="${b.href}"><svg style="width:14px;height:14px;color:var(--b3-theme-error)"><use xlink:href="#iconTrashcan"/></svg></button></div>`).join('')
      : (data as Mark[]).map(m => {
          const match = m.text?.match(/（([^）]+)）$/)
          const [text, chapter] = match ? [m.text!.substring(0, match.index), match[1]] : [m.text, '']
          return `<div class="b3-list-item" data-cfi="${m.cfi}" style="padding:8px 12px;border-left:3px solid ${COLORS[m.color]};margin:6px 8px;position:relative;display:block"><div style="word-break:break-word;line-height:1.6;padding-right:32px"><div>${text || m.cfi.slice(0, 50)}</div>${chapter ? `<div style="font-size:11px;opacity:0.6;margin-top:4px;color:var(--b3-theme-on-surface-light)">${chapter}</div>` : ''}</div><button class="toc-delete-btn b3-tooltips b3-tooltips__w" aria-label="删除标记" data-action="remove-mark" data-cfi="${m.cfi}" style="position:absolute;top:8px;right:8px"><svg style="width:14px;height:14px;color:var(--b3-theme-error)"><use xlink:href="#iconTrashcan"/></svg></button></div>`
        }).join('')
  }

  private bindEvents = () => {
    this.boundHandler = async (e) => {
      const p = (e.target as HTMLElement).closest('[data-mode], [data-action], [data-expand], [data-bookmark], [data-href], [data-cfi]') as HTMLElement
      if (!p) return
      e.stopPropagation()
      const d = p.dataset
      if (d.mode) return (this.mode = d.mode as Mode, this.search = '', this.render(d.mode === 'toc'))
      if (d.action === 'reverse') return this.toggleReverse()
      if (d.action === 'scroll') return this.toggleScroll()
      if (d.action === 'remove-bookmark') return this.toggleBookmark(d.href!)
      if (d.action === 'remove-mark') return this.removeMark(d.cfi!)
      if (d.expand) return this.toggleExpand(d.expand)
      if (d.bookmark) return this.toggleBookmark(d.bookmark, d.label)
      if (d.href && !p.closest('button')) return this.navigate(d.href)
      if (d.cfi && !p.closest('button')) return this.rendition?.display(d.cfi)
    }
    this.panel?.addEventListener('click', this.boundHandler)
  }

  private navigate = (href: string) => {
    this.currentHref = href
    this.rendition?.display(href.split('#')[0])
    this.render()
  }
  
  private toggleReverse = () => {
    this.reverse = !this.reverse
    this.body?.classList.toggle('toc-body--reverse', this.reverse)
    this.panel?.querySelector('[data-action="reverse"]')?.classList.toggle('active', this.reverse)
  }
  
  private toggleScroll = () => {
    if (!this.body) return
    const isAtTop = this.body.scrollTop < this.body.scrollHeight / 2
    this.body.scrollTo({ top: isAtTop ? this.body.scrollHeight : 0, behavior: 'smooth' })
    this.panel?.querySelector('[data-action="scroll"] use')?.setAttribute('xlink:href', isAtTop ? '#iconUp' : '#iconDown')
  }
  
  private toggleExpand = (id: string) => {
    const isExpanded = this.expanded.get(id) ?? true
    this.expanded.set(id, !isExpanded)
    const wrap = this.panel?.querySelector(`[data-wrap="${id}"]`)
    const sub = wrap?.querySelector(`[data-sub="${id}"]`) as HTMLElement
    const svg = wrap?.querySelector('.toc-expand-btn svg') as HTMLElement
    if (sub) sub.style.display = isExpanded ? 'none' : 'block'
    if (svg) svg.style.transform = isExpanded ? '' : 'rotate(90deg)'
  }

  private toggleBookmark = async (href: string, label?: string) => {
    if (!this.docId) return
    const exists = this.bookmarks.some(x => x.href === href)
    if (exists) {
      await removeBookmark(this.docId, href)
      this.bookmarks = this.bookmarks.filter(x => x.href !== href)
    } else {
      const url = this.url ? `${this.url}#${href}#${this.docId}` : href
      await addBookmark(this.docId, label || href, href, url)
      this.bookmarks.push({ label: label || href, href, url })
    }
    this.render()
  }
  
  addBookmark = (href: string, label: string) => this.toggleBookmark(href, label)

  addMark = (cfi: string, color: HighlightColor, text?: string, docId?: string) => {
    if (docId && this.docId !== docId) this.docId = docId
    this.marks = this.marks.filter(m => m.cfi !== cfi).concat({ cfi, color, text })
    this.panel && this.mode === 'mark' && this.render()
  }
  
  private removeMark = async (cfi: string) => {
    if (!this.docId) return
    const blocks = await API.sql(`SELECT id FROM blocks WHERE root_id='${this.docId}' AND markdown LIKE '%${cfi}%'`).catch(() => [])
    await Promise.all(blocks.map((b: any) => API.deleteBlock(b.id).catch(() => {})))
    this.marks = this.marks.filter(m => m.cfi !== cfi)
    this.render()
  }

  private updateHighlight = (scroll = false) => {
    if (!this.panel) return
    const href = this.currentHref.split('#')[0]
    const current = this.panel.querySelector('.b3-list-item--focus')
    const next = this.panel.querySelector(`[data-href^="${href}"]`) as HTMLElement
    if (!next || current === next) return
    current?.classList.remove('b3-list-item--focus')
    next.classList.add('b3-list-item--focus')
    scroll && next.scrollIntoView({ block: 'center' })
  }
}
