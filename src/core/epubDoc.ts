// EPUB 文档管理模块
import { fetchSyncPost } from 'siyuan'
import * as API from '../api'

// ===== 类型定义 =====
export type HighlightColor = 'red' | 'orange' | 'yellow' | 'green' | 'pink' | 'blue' | 'purple'
type Highlight = { cfi: string; color: HighlightColor }
export type Bookmark = { href: string; label: string; url?: string }

export interface DocConfig {
  mode: 'notebook' | 'document'
  notebookId?: string
  parentDoc?: { id: string; notebook: string }
}

// ===== 颜色映射 =====
const COLOR_MAP = { R: 'red', O: 'orange', Y: 'yellow', G: 'green', P: 'pink', L: 'blue', V: 'purple' } as const
const MARK_MAP: Record<HighlightColor, string> = { red: 'R', orange: 'O', yellow: 'Y', green: 'G', pink: 'P', blue: 'L', purple: 'V' }

// ===== 三级缓存 =====
const cache = {
  docs: new Map<string, string>(),              // epubBlockId -> docId
  highlights: new Map<string, Highlight[]>(),   // docId -> highlights[]
  bookmarks: new Map<string, Bookmark[]>(),     // docId -> bookmarks[]
  rendered: new Map<any, Set<string>>()         // rendition -> Set<cfi>
}

// ===== 工具函数 =====
const genId = () => `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 9)}`

// 解析器
const parse = (md: string): Highlight | null => {
  const m = md?.match(/^-\s*([ROYGPLV])\s.*#(epubcfi\([^)]+\))/)
  return m ? { cfi: m[2], color: COLOR_MAP[m[1] as keyof typeof COLOR_MAP] || 'yellow' } : null
}

const parseBookmark = (md: string): Bookmark | null => {
  const m = md?.match(/^-\s*B\s+\[([^\]]+)\]\(([^)]+)\)/)
  if (!m) return null
  const url = m[2]
  const href = url.includes('#') ? url.split('#')[1] : url
  return { label: m[1], href, url }
}

// ===== 文档管理 =====
export const verifyDoc = async (docId: string) => (await API.sql(`SELECT id FROM blocks WHERE id='${docId}' AND type='d'`).catch(() => [])).length > 0
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
export const addHighlight = async (docId: string, text: string, url: string, cfi: string, color: HighlightColor = 'yellow', note = '', tags: string[] = []): Promise<Highlight> => {
  const content = `- ${MARK_MAP[color]} [${text}](${url}#${cfi})${tags.length ? ` ${tags.map(t => `#${t}#`).join(' ')}` : ''}${note ? `\n  - ${note}` : ''}`
  await API.appendBlock('markdown', content, docId).catch(() => {})
  const hl = { cfi, color }
  ;(cache.highlights.get(docId) || cache.highlights.set(docId, []).get(docId)!).push(hl)
  return hl
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

export const restoreHighlights = async (docId: string, rendition: any, styles: any) => {
  if (!docId || !rendition) return
  const rendered = cache.rendered.get(rendition) || cache.rendered.set(rendition, new Set()).get(rendition)!
  ;(await loadHighlights(docId)).forEach(({ cfi, color }) => {
    if (!rendered.has(cfi)) rendition.annotations.highlight(cfi, {}, () => {}, '', styles[color]) && rendered.add(cfi)
  })
}

export const addSingleHighlight = (rendition: any, cfi: string, color: HighlightColor, styles: any) => {
  if (!rendition) return
  const rendered = cache.rendered.get(rendition) || cache.rendered.set(rendition, new Set()).get(rendition)!
  if (!rendered.has(cfi)) rendition.annotations.highlight(cfi, {}, () => {}, '', styles[color]) && rendered.add(cfi)
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
  options: async () => (await notebook.list()).map((n: any) => ({ label: n.name || '未命名', value: n.id })),
  search: async (k: string) => k.trim() ? (await fetchSyncPost('/api/filetree/searchDocs', { k: k.trim() }))?.data || [] : [],
  
  // UI 初始化
  initSelect: async (el: HTMLSelectElement, value: string, onChange: (v: string) => void) => {
    const list = await notebook.list()
    el.innerHTML = '<option value="">未选择</option>' + list.map(n => `<option value="${n.id}">${n.name}</option>`).join('')
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
  
  // 搜索并初始化下拉选择
  initSearchSelect: (
    search: HTMLInputElement,
    select: HTMLSelectElement,
    container: HTMLElement,
    hint: HTMLElement,
    current: DocInfo | undefined,
    onSelect: (doc: DocInfo) => void
  ) => {
    // 初始化
    current?.name && (hint.textContent = `已选择：${current.name}`)
    
    // 搜索
    search.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || !search.value.trim()) return
      const docs = await notebook.search(search.value.trim())
      if (!docs.length) return (await import('siyuan')).showMessage('未找到文档', 3000, 'info')
      
      container.style.display = 'block'
      select.innerHTML = docs.map(d => `<option value="${d.id}" data-box="${d.box}" data-path="${d.path}">${d.hPath || d.content || '无标题'}</option>`).join('')
      select.addEventListener('change', () => {
        const doc = document.parseOption(select.selectedOptions[0])
        hint.textContent = `已选择：${doc.name}`
        onSelect(doc)
      }, { once: true })
    })
  }
}
