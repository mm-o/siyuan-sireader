// EPUB 文档管理模块
import { fetchSyncPost } from 'siyuan'
import * as API from '../api'

// ===== 类型定义 =====
export type HighlightColor = 'red' | 'orange' | 'yellow' | 'green' | 'pink' | 'blue' | 'purple'
type Highlight = { cfi: string; color: HighlightColor }

export interface DocConfig {
  mode: 'notebook' | 'document'
  notebookId?: string
  parentDoc?: { id: string; notebook: string }
}

// ===== 颜色映射 =====
const COLOR_MAP = { R: 'red', O: 'orange', Y: 'yellow', G: 'green', P: 'pink', B: 'blue', V: 'purple' } as const
const MARK_MAP: Record<HighlightColor, string> = { red: 'R', orange: 'O', yellow: 'Y', green: 'G', pink: 'P', blue: 'B', purple: 'V' }

// ===== 三级缓存 =====
const cache = {
  docs: new Map<string, string>(),              // epubBlockId -> docId
  highlights: new Map<string, Highlight[]>(),   // docId -> highlights[]
  rendered: new Map<any, Set<string>>()         // rendition -> Set<cfi>
}

// ===== 工具函数 =====
const genId = () => `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 9)}`
const parse = (md: string): Highlight | null => {
  const m = md?.match(/^-\s*([ROYGPBV])\s.*#(epubcfi\([^)]+\))/)
  return m ? { cfi: m[2], color: COLOR_MAP[m[1] as keyof typeof COLOR_MAP] || 'yellow' } : null
}

// ===== 文档管理 =====
export const getOrCreateDoc = async (blockId: string, title: string, cfg: DocConfig): Promise<string | null> => {
  // 缓存检查
  if (cache.docs.has(blockId)) return cache.docs.get(blockId)!
  
  // 绑定检查
  const attrs = await API.getBlockAttrs(blockId).catch(() => ({}))
  if (attrs['custom-epub-doc-id']) {
    cache.docs.set(blockId, attrs['custom-epub-doc-id'])
    return attrs['custom-epub-doc-id']
  }
  
  // 创建文档
  const { mode, notebookId, parentDoc } = cfg
  const path = `/${mode === 'document' && parentDoc?.id ? `${parentDoc.id}/` : ''}${genId()}.sy`
  const notebook = mode === 'document' ? parentDoc?.notebook : notebookId
  if (!notebook) return null
  
  const result = await API.createDoc(notebook, path, title, '').catch(() => null)
  const docId = result?.id
  if (docId) {
    await API.setBlockAttrs(blockId, { 'custom-epub-doc-id': docId }).catch(() => {})
    cache.docs.set(blockId, docId)
  }
  return docId
}

// ===== 标注管理 =====
export const addHighlight = async (docId: string, text: string, url: string, cfi: string, color: HighlightColor = 'yellow', note = '', tags: string[] = []): Promise<Highlight> => {
  const content = `- ${MARK_MAP[color]} [${text}](${url}#${cfi})${tags.length ? ` ${tags.map(t => `#${t}#`).join(' ')}` : ''}${note ? `\n  - ${note}` : ''}`
  await API.appendBlock('markdown', content, docId).catch(() => {})
  const hl = { cfi, color }
  cache.highlights.get(docId)?.push(hl)
  return hl
}

export const restoreHighlights = async (docId: string, rendition: any, styles: any) => {
  if (!docId || !rendition) return
  
  // 初始化渲染缓存
  if (!cache.rendered.has(rendition)) cache.rendered.set(rendition, new Set())
  const rendered = cache.rendered.get(rendition)!
  
  // 查询并缓存数据
  if (!cache.highlights.has(docId)) {
    const blocks = await API.sql(`SELECT markdown FROM blocks WHERE root_id='${docId}' AND markdown LIKE '%epubcfi%'`).catch(() => [])
    cache.highlights.set(docId, blocks.map((b: any) => parse(b.markdown)).filter(Boolean) as Highlight[])
  }
  
  // 渲染（去重）
  cache.highlights.get(docId)?.forEach(({ cfi, color }) => {
    if (!rendered.has(cfi)) {
      rendition.annotations.highlight(cfi, {}, () => {}, '', styles[color])
      rendered.add(cfi)
    }
  })
}

export const addSingleHighlight = (rendition: any, cfi: string, color: HighlightColor, styles: any) => {
  if (!rendition) return
  if (!cache.rendered.has(rendition)) cache.rendered.set(rendition, new Set())
  const rendered = cache.rendered.get(rendition)!
  if (!rendered.has(cfi)) {
    rendition.annotations.highlight(cfi, {}, () => {}, '', styles[color])
    rendered.add(cfi)
  }
}

// ===== 缓存管理 =====
export const clearCache = {
  highlight: (rendition: any) => cache.rendered.delete(rendition),
  doc: (blockId: string) => cache.docs.delete(blockId),
  all: () => (cache.docs.clear(), cache.highlights.clear(), cache.rendered.clear())
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
