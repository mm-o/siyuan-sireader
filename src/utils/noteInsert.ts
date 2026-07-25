import { fetchSyncPost, showMessage } from 'siyuan'
import * as api from '@/api'
import type { ReaderSettings } from '@/composables/useSetting'

// ===== 类型 =====
type InsertMode = ReaderSettings['noteInsertMode']
type ProtyleLike = {
  element?: HTMLElement
  lute?: { Md2BlockDOM: (markdown: string) => string }
  toolbar?: { range?: Range | null }
  getInstance?: () => { insert?: (html: string, isBlock?: boolean, useProtyleRange?: boolean) => void }
}

// ===== 常量与工具 =====
const ATTR = 'custom-sireader-note-key'
const DEFAULT_NOTEBOOK_NAME = '思阅笔记'
const isWindowReader = () => /\/window\.html$/i.test(location.pathname)
const pickId = (value: any) => typeof value === 'string' ? value : value?.id || ''
const escapeSql = (value = '') => String(value).replace(/'/g, "''")
const sanitize = (title: string, fallback = '读书') => `${(title || fallback).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || fallback}笔记`
const getSelectionRange = () => window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null
const getNotebookId = (settings: ReaderSettings) => pickId(settings.notebookId) || pickId(settings.parentDoc?.notebook)
const getBroadcastUrl = (channel: string) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/broadcast?channel=${encodeURIComponent(channel)}`
const createNodeId = () => {
  const now = new Date()
  const part = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}${part(now.getHours())}${part(now.getMinutes())}${part(now.getSeconds())}`
  const suffix = Array.from({ length: 7 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')
  return `${stamp}-${suffix}`
}

// ===== 广播 =====
const createBroadcast = (channel: string) => {
  let socket: WebSocket | null = null
  const listeners = new Set<(payload: Record<string, any>) => void>()
  const connect = () => {
    if (socket && socket.readyState < WebSocket.CLOSING) return
    socket = new WebSocket(getBroadcastUrl(channel))
    socket.onmessage = event => { try { listeners.forEach(fn => fn(JSON.parse(String(event.data || '{}')))) } catch {} }
    socket.onclose = () => { socket = null }
  }
  return {
    post: (payload: Record<string, any>) => fetchSyncPost('/api/broadcast/postMessage', { channel, message: JSON.stringify(payload) }),
    on: (fn: (payload: Record<string, any>) => void) => {
      listeners.add(fn)
      connect()
      return () => {
        listeners.delete(fn)
        if (!listeners.size && socket) socket.close(), socket = null
      }
    },
  }
}
const broadcast = createBroadcast('sireader-document-insert')

// ===== 当前编辑器定位 =====
const getNodeId = (node?: Node | null) => {
  let el = (node instanceof HTMLElement ? node : node?.parentElement) as HTMLElement | null
  while (el && !el.dataset?.nodeId) el = el.parentElement
  return el?.dataset?.nodeId || ''
}
const findProtyle = (range = getSelectionRange()): ProtyleLike | null => {
  const editor = (range?.startContainer instanceof Element ? range.startContainer : range?.startContainer?.parentElement)?.closest('.protyle') as HTMLElement | null
  if (!editor) return null
  const seen = new Set<any>()
  const visit = (value: any): ProtyleLike | null => {
    if (!value) return null
    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = visit(item)
        if (hit) return hit
      }
      return null
    }
    if (seen.has(value)) return null
    seen.add(value)
    if (value?.protyle?.element === editor) return value.protyle
    return visit([
      value?.model?.editor,
      value?.model?.editors?.edit,
      value?.model?.editors?.unRefEdit,
      ...(Array.isArray(value?.model?.editors) ? value.model.editors : []),
      ...(Array.isArray(value?.children) ? value.children : []),
      ...(Array.isArray(value?.editors) ? value.editors : []),
      ...Object.values(value?.editors || {}),
    ])
  }
  const siyuan = (window as any).siyuan
  return visit([siyuan?.layout?.layout, siyuan?.dialogs, siyuan?.blockPanels])
}
const insertAtCursor = (content: string) => {
  const protyle = findProtyle()
  const instance = protyle?.getInstance?.()
  if (typeof instance?.insert !== 'function' || !protyle?.lute) return false
  instance.insert(protyle.lute.Md2BlockDOM(content), false, true)
  return true
}
const findActiveDocId = () => {
  for (const selector of ['.layout__wnd--active .protyle-background', '.layout__wnd--active .protyle-title', '.layout__wnd--active [data-node-id]', '.protyle.fn__flex-1:not(.fn__none) .protyle-background', '.protyle.fn__flex-1:not(.fn__none) .protyle-title']) {
    const id = (document.querySelector(selector) as HTMLElement | null)?.dataset?.nodeId || ''
    if (id) return id
  }
  return ''
}
const getCurrentBlockId = (range = getSelectionRange()) => getNodeId(range?.startContainer || null) || getNodeId(findProtyle(range)?.toolbar?.range?.startContainer || null) || getNodeId(document.activeElement)
export const getCurrentDocId = async (blockId = '') => !blockId ? findActiveDocId() : (await api.getBlockByID(blockId))?.root_id || findActiveDocId()

// ===== 块插入 =====
const writeBlock = (mode: InsertMode, content: string, blockId: string, docId: string) => ({
  updateBlock: () => api.updateBlock('markdown', content, blockId),
  prependBlock: () => api.insertBlock('markdown', content, blockId),
  appendBlock: () => api.insertBlock('markdown', content, undefined, blockId),
  prependDoc: () => api.prependBlock('markdown', content, docId),
  appendDoc: () => api.appendBlock('markdown', content, docId),
  insertBlock: () => api.insertBlock('markdown', content, undefined, blockId),
}[mode] || (() => api.insertBlock('markdown', content, undefined, blockId)))()
export const insertToDoc = async (text: string, docId: string, mode: InsertMode = 'appendDoc') => {
  if (!docId) throw new Error('未找到目标文档')
  await ({ prependDoc: () => api.prependBlock('markdown', text, docId), appendDoc: () => api.appendBlock('markdown', text, docId) }[mode] || (() => api.appendBlock('markdown', text, docId)))()
}

// ===== 当前文档插入 =====
const requestCurrentInsert = (text: string, settings: ReaderSettings) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error('未找到当前编辑器')) }, 1200)
    const off = broadcast.on(payload => {
      if (payload.type !== 'document-insert-ack' || payload.requestId !== requestId) return
      clearTimeout(timer)
      off()
      payload.ok ? resolve() : reject(new Error(payload.message || '插入失败'))
    })
    void broadcast.post({ type: 'document-insert', requestId, text, settings })
  })
}
const insertCurrent = async (text: string, settings: ReaderSettings) => {
  if (settings.noteInsertMode === 'insertBlock' && insertAtCursor(text)) return
  const blockId = getCurrentBlockId()
  const docId = await getCurrentDocId(blockId)
  if (!docId) throw new Error('未找到当前文档')
  if (!blockId) return settings.noteInsertMode === 'prependDoc' ? api.prependBlock('markdown', text, docId) : api.appendBlock('markdown', text, docId)
  await writeBlock(settings.noteInsertMode, text, blockId, docId)
}

// ===== 笔记文档复用 =====
const getDocIdByAttr = async (value: string) => !value ? '' : (await api.sql(`SELECT b.id FROM blocks b JOIN attributes a ON a.block_id = b.id WHERE b.type = 'd' AND a.name = '${ATTR}' AND a.value = '${escapeSql(value)}' LIMIT 1`).catch(() => []))?.[0]?.id || ''
const ensureNotebookId = async (settings: ReaderSettings) => {
  const notebook = getNotebookId(settings)
  const notebooks = (await api.lsNotebooks().catch(() => null))?.notebooks
  if (notebook && (!Array.isArray(notebooks) || notebooks.some((item: any) => item?.id === notebook))) return notebook
  const next = pickId(Array.isArray(notebooks) && notebooks.find((item: any) => item?.name === DEFAULT_NOTEBOOK_NAME)) || pickId(await api.createNotebook(DEFAULT_NOTEBOOK_NAME).catch(() => null))
  if (!next) throw new Error('创建思阅笔记本失败')
  settings.notebookId = next
  const current = (window as any).__sireader_settings
  if (current && current !== settings) current.notebookId = next
  await import('@/composables/useSetting').then(({ settingsManager }) => settingsManager.save(current || settings)).catch(() => {})
  return next
}
const getCreateDocPath = async (parentID?: string, notebook?: string) => {
  const docId = createNodeId()
  if (!parentID) return { docId, path: `/${docId}.sy` }
  const parentPath = (await api.getPathByID(parentID, notebook)).path
  return { docId, path: `${parentPath.replace(/\.sy$/, '')}/${docId}.sy` }
}
const appendToNoteDoc = async (title: string, settings: ReaderSettings, text: string, key: string, parentID?: string) => {
  const notebook = parentID ? getNotebookId(settings) : await ensureNotebookId(settings)
  if (!notebook) throw new Error('未设置目标笔记本')
  const id = await getDocIdByAttr(key)
  if (id) {
    if (key.startsWith('book:')) {
      const bookUrl = key.slice(5)
      if (bookUrl) {
        const bindDocName = await api.getHPathByID(id).catch(() => '') || title
        const { bookshelfManager } = await import('@/core/bookshelf')
        await bookshelfManager.updateBook(bookUrl, { bindDocId: id, bindDocName })
      }
    }
    return api.appendBlock('markdown', text, id)
  }
  const { path } = await getCreateDocPath(parentID, notebook)
  const created = String((await api.createDoc(notebook, path, sanitize(title), ''))?.id || '')
  if (!created) throw new Error('创建笔记文档失败')
  await api.setBlockAttrs(created, { [ATTR]: key })
  if (key.startsWith('book:')) {
    const bookUrl = key.slice(5)
    if (bookUrl) {
      const bindDocName = await api.getHPathByID(created).catch(() => '') || title
      const { bookshelfManager } = await import('@/core/bookshelf')
      await bookshelfManager.updateBook(bookUrl, { bindDocId: created, bindDocName })
    }
  }
  return api.appendBlock('markdown', text, created)
}
const insertDailyNote = async (settings: ReaderSettings, text: string) => {
  const notebook = getNotebookId(settings)
  if (!notebook) throw new Error('未设置目标笔记本')
  const res = await fetchSyncPost('/api/filetree/createDailyNote', { notebook })
  const id = res?.data?.id || res?.data
  if (!id) throw new Error('创建 Daily Note 失败')
  await api.appendBlock('markdown', text, id)
}

// ===== 统一插入入口 =====
export const insertNote = async (text: string, settings: ReaderSettings, title = '读书', key = title) => {
  const target = settings.noteInsertTarget || 'clipboard'
  if (target === 'clipboard') return navigator.clipboard.writeText(text).then(() => showMessage('已复制到剪贴板', 1500, 'info'))
  if (target === 'current' && isWindowReader()) return requestCurrentInsert(text, settings)
  const result = await ({
    current: () => insertCurrent(text, settings),
    notebook: () => appendToNoteDoc(title, settings, text, `book:${key}`),
    document: () => appendToNoteDoc(title, settings, text, `book:${key}`, pickId(settings.parentDoc)),
    dailynote: () => insertDailyNote(settings, text),
  }[target] || (() => navigator.clipboard.writeText(text)))()
  showMessage('已插入笔记', 1500, 'info')
  return result
}

// ===== 新窗口桥接 =====
broadcast.on(async payload => {
  if (isWindowReader() || payload.type !== 'document-insert' || !payload.requestId) return
  try { await insertCurrent(payload.text || '', payload.settings || {}) }
  catch (error: any) { return void await broadcast.post({ type: 'document-insert-ack', requestId: payload.requestId, ok: false, message: error?.message || '插入失败' }) }
  await broadcast.post({ type: 'document-insert-ack', requestId: payload.requestId, ok: true })
})
