// EPUB 文档管理模块
import { fetchSyncPost } from 'siyuan'
import * as API from '../api'

// ===== 类型定义 =====
export type HighlightColor = 'red' | 'orange' | 'yellow' | 'green' | 'pink' | 'blue' | 'purple'
export type MarkStyle = 'highlight' | 'border' | 'underline' | 'wavy'
type Highlight = { cfi: string; color: HighlightColor; style?: MarkStyle }
export type Bookmark = { href: string; label: string; url?: string }

export interface DocConfig {
  mode: 'notebook' | 'document'
  notebookId?: string
  parentDoc?: { id: string; notebook: string }
}

// ===== 颜色常量（统一数据源）=====
export const COLORS: Record<HighlightColor, string> = { red: '#f44336', orange: '#ff9800', yellow: '#ffeb3b', green: '#4caf50', pink: '#e91e63', blue: '#2196f3', purple: '#9c27b0' }
export const COLOR_CODE: Record<HighlightColor, string> = { red: 'R', orange: 'O', yellow: 'Y', green: 'G', pink: 'P', blue: 'B', purple: 'V' }
export const COLOR_RGB: Record<string, HighlightColor> = { 'rgb(244, 67, 54)': 'red', 'rgb(255, 152, 0)': 'orange', 'rgb(255, 235, 59)': 'yellow', 'rgb(76, 175, 80)': 'green', 'rgb(233, 30, 99)': 'pink', 'rgb(33, 150, 243)': 'blue', 'rgb(156, 39, 176)': 'purple' }
export const COLOR_MAP = { R: 'red', O: 'orange', Y: 'yellow', G: 'green', P: 'pink', B: 'blue', V: 'purple' } as const
export const RGB_MAP = [['244,67,54', 'red'], ['255,152,0', 'orange'], ['255,235,59', 'yellow'], ['76,175,80', 'green'], ['233,30,99', 'pink'], ['33,150,243', 'blue'], ['156,39,176', 'purple']] as const

// ===== 三级缓存 =====
const cache = {
  docs: new Map<string, string>(),              // epubBlockId -> docId
  highlights: new Map<string, Highlight[]>(),   // docId -> highlights[]
  bookmarks: new Map<string, Bookmark[]>(),     // docId -> bookmarks[]
  rendered: new Map<any, Set<string>>()         // rendition -> Set<cfi>
}
const blockCache: Record<string, string> = {} // docId:cfi -> blockId 缓存（性能优化）

// ===== 工具函数 =====
const genId = () => `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 9)}`

// HTML转义/解码
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]!))
export const decodeHtml = (s: string) => s.replace(/&(quot|#39|lt|gt|amp);/g, m => ({'&quot;':'"','&#39;':"'",'&lt;':'<','&gt;':'>','&amp;':'&'})[m] || m)

// 事件工具
export const stopEvent = (e: Event) => e.stopPropagation()

// 通用查询
export const queryByPattern = async (docId: string, pattern: string) => API.sql(`SELECT markdown FROM blocks WHERE root_id='${docId}' AND markdown LIKE '${pattern}'`).catch(() => [])

// 极致精简：创建弹出元素
export const createPopup = (tag: string, props: Record<string, any>, style: string) => {
  const doc = globalThis.document || window.document
  const el = Object.assign(doc.createElement(tag), props)
  el.style.cssText = `${style};position:fixed;z-index:10000;pointer-events:auto;user-select:text`
  return doc.body.appendChild(el)
}

// 笔记内容解析
export const parseNoteContent = (markdown: string | undefined): string => {
  if (!markdown) return ''
  const sup = markdown.match(/<sup>\(([^)]+)\)<\/sup>/)?.[1]
  if (sup) return sup
  const data = markdown.match(/data-inline-memo-content="([^"]*)"/)?.[1]
  return data ? decodeHtml(data) : ''
}

export const createNoteInput = (x: number, y: number, value = '', placeholder = '', onSave?: (note: string) => void) => {
  let saved = false
  const cleanup = (save = false) => saved || (saved = true, save && (v => v && v !== value && onSave?.(v))(input.value.trim()), input.remove())
  const input = createPopup('textarea', {
    className: 'epub-note-input', value, placeholder, onclick: stopEvent, onmousedown: stopEvent,
    onkeydown: (e: KeyboardEvent) => { e.stopPropagation(); e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), cleanup(true)); e.key === 'Escape' && cleanup() },
    onblur: () => cleanup(true)
  }, `left:${x}px;top:${y + 10}px`) as HTMLTextAreaElement
  setTimeout(() => (input.focus(), input.select(), addEventListener('click', e => !input.contains(e.target as Node) && cleanup(), { once: true })), 10)
  return input
}

export const createColorPicker = (x: number, y: number, current: string, colors: Record<string, string>, onSelect?: (color: string) => void) => {
  let t = 0
  const hide = (d = 800) => (clearTimeout(t), t = window.setTimeout(() => picker.remove(), d))
  const picker = Object.assign(createPopup('div', {
    className: 'color-picker',
    innerHTML: Object.entries(colors).filter(([k]) => k !== 'blue').map(([c, h]) => 
      `<button class="color-btn${c === current ? ' active' : ''}" data-color="${c}" style="background:${h}"></button>`).join('')
  }, `left:${x}px;top:${y + 4}px;transform:translateX(-50%)`), {
    onmouseenter: () => clearTimeout(t),
    onmouseleave: hide,
    onclick: (e: Event) => (c => c && c !== current && (onSelect?.(c), hide(200)))(((e.target as HTMLElement).closest('.color-btn') as HTMLElement)?.dataset?.color)
  })
  return hide(), setTimeout(() => addEventListener('click', () => picker.remove(), { once: true }), 200), picker
}

// 查询并查找匹配
export const queryAndFind = async (docId: string, pattern: string, cfi: string) => 
  (await queryByPattern(docId, pattern)).find(n => n.markdown.includes(cfi))

// 解析器
const parse = (md: string): Highlight | null => {
  if (md?.startsWith('- N ')) return md.match(/#(epubcfi\([^)]+\))/) ? { cfi: RegExp.$1, color: 'blue', style: 'border' } : null
  const m = md?.match(/^-\s*([ROYGPBV])\s.*#(epubcfi\([^)]+\))/)
  return m ? { cfi: m[2], color: COLOR_MAP[m[1] as keyof typeof COLOR_MAP] || 'yellow' } : null
}

const parseBookmark = (md: string): Bookmark | null => {
  const m = md?.match(/^-\s*B\s+\[([^\]]+)\]\(([^)]+)\)/)
  return m ? { label: m[1], href: m[2].includes('#') ? m[2].split('#')[1] : m[2], url: m[2] } : null
}

// ===== 文档管理 =====
export const verifyDoc = async (docId: string) => {
  if (!docId || !/^\d{14}-[a-z0-9]{7}$/.test(docId)) return false
  const block = await API.getBlockByID(docId).catch(() => null)
  return block?.type === 'd'
}
export const getOrCreateDoc = async (blockId: string, title: string, cfg: DocConfig): Promise<string | null> => {
  // 缓存验证
  const cached = cache.docs.get(blockId)
  if (cached && await verifyDoc(cached)) return cached
  cache.docs.delete(blockId)
  
  // 绑定验证（优先 memo）
  const attrs = await API.getBlockAttrs(blockId).catch(() => ({}))
  const boundId = attrs['memo'] || attrs['custom-epub-doc-id']
  if (boundId && await verifyDoc(boundId)) {
    cache.docs.set(blockId, boundId)
    attrs['memo'] !== boundId && await API.setBlockAttrs(blockId, { 'memo': boundId }).catch(() => {})
    return boundId
  }
  boundId && await API.setBlockAttrs(blockId, { 'custom-epub-doc-id': '', 'memo': '' }).catch(() => {})
  
  // 创建文档
  const { mode, notebookId, parentDoc } = cfg, notebook = mode === 'document' ? parentDoc?.notebook : notebookId
  if (!notebook) return null
  const docId = (await API.createDoc(notebook, `/${mode === 'document' && parentDoc?.id ? `${parentDoc.id}/` : ''}${genId()}.sy`, title, '').catch(() => null))?.id
  return docId && (await API.setBlockAttrs(blockId, { 'memo': docId }).catch(() => {}), cache.docs.set(blockId, docId), docId) || null
}

// ===== 标注管理 =====
const addToCache = (docId: string, item: Highlight) => {
  const cached = cache.highlights.get(docId) || cache.highlights.set(docId, []).get(docId)!
  !cached.some(h => h.cfi === item.cfi) && cached.push(item)
}

export const addHighlight = async (docId: string, text: string, url: string, cfi: string, color: HighlightColor = 'yellow', note = '', tags: string[] = []): Promise<Highlight> => {
  const content = `- ${COLOR_CODE[color]} ${text} [◎](${url})${tags.length ? ` ${tags.map(t => `#${t}#`).join(' ')}` : ''}${note ? `\n  - ${note}` : ''}`
  const result = await API.appendBlock('markdown', content, docId).catch(() => null)
  const hl = { cfi, color }
  // 缓存blockId以提升性能
  if (result?.id) blockCache[`${docId}:${cfi}`] = result.id
  return addToCache(docId, hl), hl
}

export const addBookmark = async (docId: string, label: string, href: string, url?: string): Promise<Bookmark> => {
  const content = `- B [${label}](${url || href})`
  await API.appendBlock('markdown', content, docId).catch(() => {})
  return { label, href, url: url || href }
}

export const removeBookmark = async (docId: string, href: string) => {
  const blocks = await API.sql(`SELECT id FROM blocks WHERE root_id='${docId}' AND markdown LIKE '- B %${href}%'`).catch(() => [])
  await Promise.all(blocks.map(b => API.deleteBlock(b.id).catch(() => {})))
  const bookmarks = cache.bookmarks.get(docId)
  if (bookmarks) cache.bookmarks.set(docId, bookmarks.filter(bm => bm.href !== href))
}

const loadData = async <T>(docId: string, cacheMap: Map<string, T[]>, sql: string, parse: (md: string) => T | null, key: (item: T) => string) => {
  if (!docId) return []
  if (cacheMap.has(docId)) return cacheMap.get(docId)!
  const blocks = await API.sql(`SELECT markdown FROM blocks WHERE root_id='${docId}' AND markdown LIKE '${sql}'`).catch(() => [])
  const items = blocks.map((b: any) => parse(b.markdown)).filter(Boolean) as T[]
  const unique = Array.from(new Map(items.map(i => [key(i), i])).values())
  cacheMap.set(docId, unique)
  return unique
}

export const loadBookmarks = (docId: string) => loadData(docId, cache.bookmarks, '- B %', parseBookmark, b => b.href)
export const loadHighlights = (docId: string) => loadData(docId, cache.highlights, '%epubcfi%', parse, h => h.cfi)

const renderMark = (rendition: any, cfi: string, color: HighlightColor, style: MarkStyle | undefined, styles: any, markStyles: any) =>
  style && markStyles[style] ? rendition.annotations.underline(cfi, {}, () => {}, '', markStyles[style]) : rendition.annotations.highlight(cfi, {}, () => {}, '', styles[color])

const getRendered = (rendition: any) => cache.rendered.get(rendition) || cache.rendered.set(rendition, new Set()).get(rendition)!

export const restoreHighlights = async (docId: string, rendition: any, styles: any, markStyles: any) => {
  if (!docId || !rendition) return
  const rendered = getRendered(rendition)
  ;(await loadHighlights(docId)).forEach(({ cfi, color, style }) => !rendered.has(cfi) && renderMark(rendition, cfi, color, style, styles, markStyles) && rendered.add(cfi))
}

export const addSingleHighlight = (rendition: any, cfi: string, color: HighlightColor, style: MarkStyle | undefined, styles: any, markStyles: any) => {
  if (!rendition) return
  const rendered = getRendered(rendition)
  !rendered.has(cfi) && renderMark(rendition, cfi, color, style, styles, markStyles) && rendered.add(cfi)
}

// 清除特定CFI的渲染缓存（用于编辑标注时重新渲染）
export const clearRenderedCache = (rendition: any, cfi: string) => {
  const rendered = getRendered(rendition)
  rendered.delete(cfi)
}

// ===== 缓存管理 =====
export const clearCache = {
  highlight: (rendition: any) => cache.rendered.delete(rendition),
  doc: (blockId: string) => cache.docs.delete(blockId),
  bookmark: (docId: string) => cache.bookmarks.delete(docId),
  all: () => (cache.docs.clear(), cache.highlights.clear(), cache.bookmarks.clear(), cache.rendered.clear())
}

// ===== 笔记本工具 =====
export const notebook = {
  list: async () => (await API.lsNotebooks()).notebooks?.filter((n: any) => !n.closed) || [],
  options: async (i18n?) => (await notebook.list()).map((n: any) => ({ label: n.name || i18n?.unnamed || '未命名', value: n.id })),
  search: async (k: string) => k.trim() ? (await fetchSyncPost('/api/filetree/searchDocs', { k: k.trim() }))?.data || [] : [],
  
  // UI 初始化
  initSelect: async (el: HTMLSelectElement, value: string, onChange: (v: string) => void, i18n?) => {
    const list = await notebook.list()
    el.innerHTML = `<option value="">${i18n?.notSelected || '未选择'}</option>` + list.map(n => `<option value="${n.id}">${n.name}</option>`).join('')
    value && (el.value = value)
    el.addEventListener('change', () => onChange(el.value))
  }
}

// ===== 文档工具 =====
export type DocInfo = { id: string; name: string; path: string; notebook: string }

export const document = {
  // 从选项元素提取文档信息
  parseOption: (opt: HTMLOptionElement): DocInfo => {
    const path = opt.getAttribute('data-path') || ''
    return {
      id: path.split('/').pop()?.replace('.sy', '') || opt.value,
      name: opt.textContent || '',
      path: path.replace('.sy', ''),
      notebook: opt.getAttribute('data-box') || ''
    }
  },
  
  initSearchSelect: (search: HTMLInputElement, select: HTMLSelectElement, container: HTMLElement, hint: HTMLElement, current: DocInfo | undefined, onSelect: (doc: DocInfo) => void, i18n?) => {
    const handleSelect = () => (doc => (hint.textContent = `${i18n?.selected || '已选择：'}${doc.name}`, onSelect(doc)))(document.parseOption(select.selectedOptions[0]))
    current?.name && (hint.textContent = `${i18n?.selected || '已选择：'}${current.name}`)
    select.onchange = handleSelect
    search.onkeydown = async (e) => {
      if (e.key !== 'Enter' || !search.value.trim()) return
      const docs = await notebook.search(search.value.trim())
      if (!docs.length) return (await import('siyuan')).showMessage(i18n?.notFoundDoc || '未找到文档', 3000, 'info')
      container.style.display = 'block'
      select.innerHTML = docs.map(d => `<option value="${d.id}" data-box="${d.box}" data-path="${d.path}">${d.hPath || d.content || i18n?.noTitle || '无标题'}</option>`).join('')
      docs.length === 1 && handleSelect()  // 只有1个结果时自动选择
    }
  }
}

// 行级备注 - 极简实现

export const addInlineMemo = async (docId: string, text: string, note: string, url?: string): Promise<boolean> => {
  if (!docId || !note.trim() || !text.trim()) return false
  try {
    const escaped = escape(text.substring(0, 200).trim())
    const content = `- N <span data-type="inline-memo" data-inline-memo-content="${escape(note)}">${escaped}</span>${url ? ` [◎](${url})` : ''}`
    const result = await API.appendBlock('markdown', content, docId).catch(() => null)
    const cfi = url?.match(/(epubcfi\([^)]+\))/)?.[1]
    // 缓存blockId以提升性能
    if (cfi && result?.id) blockCache[`${docId}:${cfi}`] = result.id
    return cfi && (addToCache(docId, { cfi, color: 'blue', style: 'border' }), true) || true
  } catch (e) {
    return console.error('[SiReader]', e), false
  }
}

// 更新标注/笔记（优化：先查缓存，再查数据库）
export const updateMark = async (docId: string, cfi: string, type: 'color' | 'note', value: string) => {
  if (!docId || !cfi) return false
  
  // 先从缓存获取blockId
  const cacheKey = `${docId}:${cfi}`
  let blockId = blockCache[cacheKey]
  let markdown = ''
  
  if (blockId) {
    // 从缓存的blockId直接获取
    const block = await API.getBlockByID(blockId).catch(() => null)
    if (block) markdown = block.markdown
  }
  
  if (!markdown) {
    // 缓存未命中，SQL查询
    const blocks = await API.sql(`SELECT id, markdown FROM blocks WHERE root_id='${docId}' AND markdown LIKE '%${cfi}%'`).catch(() => [])
    if (!blocks[0]) return false
    blockId = blocks[0].id
    markdown = blocks[0].markdown
    blockCache[cacheKey] = blockId // 更新缓存
  }
  
  const md = type === 'color' 
    ? markdown.replace(/^-\s*[ROYGPBV]/, `- ${value}`)
    : (() => {
        // 提取文本内容，重新构造为标准格式（与addInlineMemo一致）
        // 匹配 <sup>(内容)</sup> 格式
        const supMatch = markdown.match(/^-\s*N\s+(.+?)<sup>\([^)]+\)<\/sup>(.*)$/)
        if (supMatch) {
          const [, text, tail] = supMatch
          return `- N <span data-type="inline-memo" data-inline-memo-content="${escape(value)}">${text}</span>${tail}`
        }
        // 备用：匹配 data-inline-memo-content 格式
        return markdown.replace(/data-inline-memo-content="[^"]+"/, `data-inline-memo-content="${escape(value)}"`)
      })()
  await API.updateBlock('markdown', md, blockId)
  return true
}
