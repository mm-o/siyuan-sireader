import * as API from '../api'
import { COLORS, COLOR_CODE, COLOR_MAP, updateMark, loadBookmarks, addBookmark, removeBookmark, parseNoteContent, createNoteInput, createColorPicker, notebook, type HighlightColor, type Bookmark, type DocInfo } from './epubDoc'

interface TocItem { id: string; href: string; label: string; subitems?: TocItem[] }
interface Mark { cfi: string; color: HighlightColor; text?: string }
interface Note { cfi: string; note: string; text: string }
type Mode = 'toc' | 'bookmark' | 'mark' | 'note' | 'settings'

const MODES = [{ k: 'toc', i: '#iconList' }, { k: 'bookmark', i: '#iconBookmark' }, { k: 'mark', i: '#iconMark' }, { k: 'note', i: '#iconFile' }] as const
const MODE_LABELS: Record<Mode, string> = { toc: '目录', bookmark: '书签', mark: '标注', note: '笔记', settings: '设置' }
const TYPE_LABELS = { bookmark: '书签', mark: '标记', note: '笔记' }

export class EpubToc {
  private panel: HTMLElement | null = null
  private overlay: HTMLElement | null = null
  private toc: TocItem[] = []
  private bookmarks: Bookmark[] = []
  private marks: Mark[] = []
  private notes: Note[] = []
  private currentHref = ''
  private mode: Mode = 'toc'
  private reverse = false
  private search = ''
  private pinned = false
  private docInfo?: DocInfo
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
    if (!this.docId) return
    await this.loadDocInfo()
    await this.reloadData()
  }
  
  setDocId = async (docId: string) => {
    if (this.docId === docId) return
    this.docId = docId
    await this.loadDocInfo()
    this.panel && (await this.reloadData(), this.render())
  }
  
  private loadDocInfo = async () => {
    if (!this.docId) return
    const result = await API.getBlockAttrs(this.docId).catch(() => null)
    if (result) this.docInfo = { id: this.docId, name: result.title || result.name || '未知文档', path: result.path || '', notebook: result.box || '' }
  }
  
  private reloadData = async () => {
    if (!this.docId) return
    const [bms, blocks] = await Promise.all([
      loadBookmarks(this.docId).catch(() => []), 
      API.sql(`SELECT markdown FROM blocks WHERE root_id='${this.docId}' AND markdown LIKE '%epubcfi%'`).catch(() => [])
    ])
    this.bookmarks = bms
    this.marks = []
    this.notes = []
    const seen = new Set<string>()
    blocks.forEach((b: any) => {
      const md = b.markdown?.trim()
      if (!md?.startsWith('- ')) return
      if (md.startsWith('- N ')) {
        const m = md.match(/^-\s*N\s+([^<#]+).*#(epubcfi\([^)]+\))/)
        m && !seen.has(m[2]) && (this.notes.push({ cfi: m[2], note: parseNoteContent(md), text: m[1].trim() }), seen.add(m[2]))
      } else if (/^-\s*[ROYGPBV]\s/.test(md)) {
        const m = md.match(/^-\s*([ROYGPBV])\s+(.+?)\s*\[◎\].*#(epubcfi\([^)]+\))/)
        m && !seen.has(m[3]) && (this.marks.push({ cfi: m[3], color: COLOR_MAP[m[1] as keyof typeof COLOR_MAP] || 'yellow', text: m[2] }), seen.add(m[3]))
      }
    })
  }

  private mapItem = (item: any): TocItem => ({
    id: item.id || item.href,
    href: item.href,
    label: item.label,
    subitems: item.subitems?.map(this.mapItem)
  })

  toggle = () => this.panel ? this.close() : this.open()
  destroy = () => this.close()

  isPinned = () => this.pinned
  
  setPosition = (position: 'left' | 'right') => {
    if (this.position === position) return
    this.position = position
    if (this.panel) {
      this.panel.className = `epub-toc-panel epub-toc-panel--${position}`
      this.pinned && window.dispatchEvent(new CustomEvent('epubTocPinned', { detail: { pinned: true, position } }))
    }
  }

  private open = () => {
    this.overlay = Object.assign(document.createElement('div'), { className: 'epub-toc-overlay', onclick: () => !this.pinned && this.close() })
    this.panel = Object.assign(document.createElement('div'), { className: `epub-toc-panel epub-toc-panel--${this.position}` })
    this.pinned && (this.overlay.style.display = 'none', window.dispatchEvent(new CustomEvent('epubTocPinned', { detail: { pinned: true, position: this.position } })))
    this.bindEvents()
    this.render(true)
    this.parentEl.append(this.overlay, this.panel)
  }

  private close = () => {
    this.boundHandler && this.panel?.removeEventListener('click', this.boundHandler)
    this.pinned && (this.pinned = false, window.dispatchEvent(new CustomEvent('epubTocPinned', { detail: { pinned: false, position: this.position } })))
    this.overlay?.remove()
    this.panel?.remove()
    this.overlay = this.panel = this.boundHandler = undefined
  }

  private render = (scroll = false) => {
    if (!this.panel) return
    const scrollTop = this.body?.scrollTop || 0
    this.panel.innerHTML = `<div class="toc-header"><div class="toc-modes">${this.renderModes()}</div><div class="toc-extra-btns"><button class="toc-btn" data-action="settings" aria-label="设置"><svg><use xlink:href="#iconSettings"/></svg></button><button class="toc-btn${this.pinned ? ' active' : ''}" data-action="pin" aria-label="${this.pinned ? '取消钉住' : '钉住'}"><svg><use xlink:href="#iconPin"/></svg></button></div></div>${this.mode === 'settings' ? '' : `<div class="toc-search"><input type="text" class="b3-text-field" placeholder="搜索..." value="${this.search}"><div class="toc-tools">${this.renderTools()}</div></div>`}<div class="toc-body${this.reverse ? ' toc-body--reverse' : ''}" data-body>${this.renderContent()}</div>`
    this.body = this.panel.querySelector('[data-body]') as HTMLElement
    this.body.scrollTop = scrollTop
    
    if (this.mode === 'settings') {
      this.initSettings()
    } else {
      this.panel.querySelector('.toc-search input')?.addEventListener('input', (e) => (this.search = (e.target as HTMLInputElement).value, this.updateContent()))
      this.mode === 'toc' && this.currentHref && requestAnimationFrame(() => this.updateHighlight(scroll))
    }
  }

  private renderModes = () => MODES.map(m => `<button class="toc-mode-btn${this.mode === m.k ? ' active' : ''}" data-mode="${m.k}" aria-label="${MODE_LABELS[m.k as Mode]}"><svg><use xlink:href="${m.i}"/></svg></button>`).join('')
  
  private renderTools = () => `<button class="toc-btn${this.reverse ? ' active' : ''}" data-action="reverse" aria-label="${this.reverse ? '正序' : '反序'}"><svg><use xlink:href="#iconSort"/></svg></button><button class="toc-btn" data-action="scroll" aria-label="到${this.body?.scrollTop && this.body.scrollTop > this.body.scrollHeight / 2 ? '顶部' : '底部'}"><svg><use xlink:href="#iconDown"/></svg></button>`

  private updateContent = () => this.body && (this.body.innerHTML = this.renderContent())

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
    if (this.mode === 'settings') return this.renderSettings()
    if (this.mode === 'note') return this.renderList(this.notes, 'note')
    if (this.mode === 'bookmark') return this.renderList(this.bookmarks, 'bookmark')
    if (this.mode === 'mark') return this.renderList(this.marks, 'mark')
    const items = this.filterItems(this.toc, this.search)
    return items.length ? this.renderTocItems(items) : '<div class="toc-state">暂无目录</div>'
  }

  private filterList<T extends Bookmark | Mark | Note>(data: T[]): T[] {
    if (!this.search) return data
    const q = this.search.toLowerCase()
    return data.filter(i => Object.values(i).some(v => typeof v === 'string' && v.toLowerCase().includes(q)))
  }

  private renderTocItems = (items: TocItem[], lv = 0): string =>
    items.map(i => {
      const isCurrent = this.currentHref.startsWith(i.href.split('#')[0])
      const isBookmarked = this.bookmarks.some(x => x.href === i.href)
      const hasSub = !!i.subitems?.length
      const isExpanded = this.expanded.get(i.id) ?? true
      return `<div class="toc-item-wrap" data-wrap="${i.id}"><div class="b3-list-item${isCurrent ? ' b3-list-item--focus' : ''}" data-href="${i.href}" style="padding-left:${8 + lv * 16}px">${hasSub ? `<button class="toc-expand-btn" data-expand="${i.id}" style="opacity:1"><svg style="width:12px;height:12px;transition:transform .2s${isExpanded ? ';transform:rotate(90deg)' : ''}"><use xlink:href="#iconRight"/></svg></button>` : '<span style="width:20px;display:inline-block"></span>'}<span class="b3-list-item__text fn__flex-1">${i.label}</span><button class="toc-bookmark-btn b3-tooltips b3-tooltips__w" aria-label="${isBookmarked ? '移除书签' : '添加书签'}" data-bookmark="${i.href}" data-label="${i.label}"${isBookmarked ? ' style="opacity:1"' : ''}><svg style="width:14px;height:14px;color:${isBookmarked ? 'var(--b3-theme-error)' : 'var(--b3-theme-on-surface)'}"><use xlink:href="#iconBookmark"/></svg></button></div>${hasSub && isExpanded ? `<div class="toc-subitems" data-sub="${i.id}">${this.renderTocItems(i.subitems!, lv + 1)}</div>` : ''}</div>`
    }).join('')

  private renderList(data: Bookmark[], type: 'bookmark'): string
  private renderList(data: Mark[], type: 'mark'): string
  private renderList(data: Note[], type: 'note'): string
  private renderList(data: any[], type: 'bookmark' | 'mark' | 'note'): string {
    const filtered = this.filterList(data)
    if (!filtered.length) return `<div class="toc-state">${this.search ? '无匹配结果' : `暂无${TYPE_LABELS[type]}`}</div>`
    const btn = (a: string, i: string, k: string, v: string) => `<button class="toc-action-btn" data-action="${a}" ${k}="${v}"><svg><use xlink:href="#${i}"/></svg></button>`
    if (type === 'bookmark') return filtered.map((b: Bookmark) => `<div class="b3-list-item" data-href="${b.href}"><span class="b3-list-item__text fn__flex-1">${b.label}</span><div class="toc-actions">${btn('remove-bookmark', 'iconTrashcan', 'data-href', b.href)}</div></div>`).join('')
    if (type === 'note') return filtered.map((n: Note) => `<div class="b3-list-item" data-cfi="${n.cfi}" style="border-left:3px solid ${COLORS.blue}"><div class="toc-item-content"><div class="toc-note-text">${n.note}</div><div class="toc-note-excerpt">${n.text}</div></div><div class="toc-actions">${btn('edit-note', 'iconEdit', 'data-cfi', n.cfi)}${btn('remove-note', 'iconTrashcan', 'data-cfi', n.cfi)}</div></div>`).join('')
    return filtered.map((m: Mark) => {
      const match = m.text?.match(/（([^）]+)）$/)
      const [text, chapter] = match ? [m.text!.slice(0, match.index), match[1]] : [m.text, '']
      return `<div class="b3-list-item" data-cfi="${m.cfi}" style="border-left:3px solid ${COLORS[m.color]}"><div class="toc-item-content"><div>${text || m.cfi.slice(0, 50)}</div>${chapter ? `<div class="toc-chapter">${chapter}</div>` : ''}</div><div class="toc-actions">${btn('edit-mark', 'iconEdit', 'data-cfi', m.cfi)}${btn('remove-mark', 'iconTrashcan', 'data-cfi', m.cfi)}</div></div>`
    }).join('')
  }

  private bindEvents = () => {
    this.boundHandler = async (e) => {
      const p = (e.target as HTMLElement).closest('[data-mode], [data-action], [data-expand], [data-bookmark], [data-href], [data-cfi]') as HTMLElement
      if (!p) return
      e.stopPropagation()
      const d = p.dataset
      if (d.mode) return (this.mode = d.mode as Mode, this.search = '', this.render(d.mode === 'toc'))
      if (d.action === 'settings') return (this.mode = 'settings', this.render())
      if (d.action === 'pin') return this.togglePin()
      if (d.action === 'reverse') return this.toggleReverse()
      if (d.action === 'scroll') return this.toggleScroll()
      if (d.action === 'remove-bookmark') return this.toggleBookmark(d.href!)
      if (d.action === 'remove-mark') return this.removeMark(d.cfi!)
      if (d.action === 'remove-note') return this.removeNote(d.cfi!)
      if (d.action === 'edit-mark') return this.editMark(p)
      if (d.action === 'edit-note') return this.editNote(p)
      if (d.expand) return this.toggleExpand(d.expand)
      if (d.bookmark) return this.toggleBookmark(d.bookmark, d.label)
      if (d.href && !p.closest('button')) return this.navigate(d.href)
      if (d.cfi && !p.closest('button')) return this.rendition?.display(d.cfi)
    }
    this.panel?.addEventListener('click', this.boundHandler)
  }

  private navigate = (href: string) => (this.currentHref = href, this.rendition?.display(href.split('#')[0]), this.render())
  
  private togglePin = () => {
    this.pinned = !this.pinned
    this.panel?.querySelector('[data-action="pin"]')?.classList.toggle('active')
    this.overlay && (this.overlay.style.display = this.pinned ? 'none' : 'block')
    window.dispatchEvent(new CustomEvent('epubTocPinned', { detail: { pinned: this.pinned, position: this.position } }))
  }
  
  private toggleReverse = () => (this.reverse = !this.reverse, this.body?.classList.toggle('toc-body--reverse'), this.panel?.querySelector('[data-action="reverse"]')?.classList.toggle('active'))
  
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

  addMark = (cfi: string, color: HighlightColor, text?: string, docId?: string) => (
    docId && this.docId !== docId && (this.docId = docId),
    this.marks = this.marks.filter(m => m.cfi !== cfi).concat({ cfi, color, text }),
    this.panel && this.mode === 'mark' && this.render()
  )
  
  addNote = (cfi: string, note: string, text: string, docId?: string) => (
    docId && this.docId !== docId && (this.docId = docId),
    this.notes = this.notes.filter(n => n.cfi !== cfi).concat({ cfi, note, text }),
    this.panel && this.mode === 'note' && this.render()
  )
  
  private removeMark = async (cfi: string) => this.docId && (await this.removeItem(cfi), this.marks = this.marks.filter(m => m.cfi !== cfi), this.render())
  private removeNote = async (cfi: string) => this.docId && (await this.removeItem(cfi), this.notes = this.notes.filter(n => n.cfi !== cfi), this.render())
  
  private removeItem = async (cfi: string) => {
    const blocks = await API.sql(`SELECT id FROM blocks WHERE root_id='${this.docId}' AND markdown LIKE '%${cfi}%'`).catch(() => [])
    await Promise.all(blocks.map((b: any) => API.deleteBlock(b.id).catch(() => {})))
  }

  private editMark = async (el: HTMLElement) => {
    const cfi = el.dataset.cfi!, mark = this.marks.find(m => m.cfi === cfi)
    if (!mark || !this.docId) return
    const r = el.getBoundingClientRect()
    createColorPicker(r.left + r.width/2, r.bottom, mark.color, COLORS, async (color) => 
      await updateMark(this.docId, cfi, 'color', COLOR_CODE[color as HighlightColor]) && (mark.color = color as HighlightColor, this.render())
    )
  }

  private editNote = async (el: HTMLElement) => {
    const cfi = el.dataset.cfi!, note = this.notes.find(n => n.cfi === cfi)
    if (!note || !this.docId) return
    const r = el.getBoundingClientRect()
    createNoteInput(r.left, r.bottom, note.note, '编辑笔记...', async (newNote) =>
      await updateMark(this.docId, cfi, 'note', newNote) && (note.note = newNote, this.render())
    )
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

  private renderSettings = () => `
    <div class="toc-settings">
      <div class="toc-settings-group">
        <div class="toc-settings-label">当前绑定文档</div>
        <div class="toc-settings-current">
          <div class="toc-doc-name">${this.docInfo?.name || '未知文档'}</div>
          <div class="toc-doc-id">${this.docId || '无'}</div>
        </div>
      </div>
      <div class="toc-settings-group">
        <div class="toc-settings-label">更换文档</div>
        <input class="b3-text-field" placeholder="输入文档名搜索，按回车" data-search>
        <div class="toc-settings-results" data-results style="display:none"></div>
      </div>
    </div>
  `

  private initSettings = () => {
    const input = this.panel?.querySelector('[data-search]') as HTMLInputElement
    const results = this.panel?.querySelector('[data-results]') as HTMLElement
    if (!input || !results) return
    
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return
      e.preventDefault()
      
      const docs = await notebook.search(input.value.trim()).catch(() => [])
      if (!docs.length) return (results.innerHTML = '<div class="toc-empty">未找到文档</div>', results.style.display = 'block')
      
      results.innerHTML = docs.map(d => {
        const id = d.path?.split('/').pop()?.replace(/\.sy$/, '') || ''
        const name = d.hPath || d.content || '无标题'
        return `<div class="toc-doc-item" data-id="${id}" data-name="${name}" data-path="${d.path || ''}" data-box="${d.box || ''}">${name}</div>`
      }).join('')
      results.style.display = 'block'
      
      results.querySelectorAll('.toc-doc-item').forEach(el => el.addEventListener('click', async () => {
        this.docInfo = { id: el.getAttribute('data-id')!, name: el.getAttribute('data-name')!, path: el.getAttribute('data-path') || '', notebook: el.getAttribute('data-box') || '' }
        this.docId = this.docInfo.id
        await Promise.all([this.loadDocInfo(), this.reloadData()])
        this.mode = 'toc'
        input.value = ''
        results.style.display = 'none'
        this.render(true)
      }))
    })
  }
}
