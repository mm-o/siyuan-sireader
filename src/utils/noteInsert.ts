import { fetchSyncPost, showMessage } from 'siyuan'
import * as siyuan from 'siyuan'
import * as api from '@/api'
import type { ReaderSettings } from '@/composables/useSetting'

// ===== 类型 =====
type InsertMode = ReaderSettings['noteInsertMode']
type InsertContentStatus = 'inserted' | 'no-editor' | 'readonly' | 'invalid-range' | 'unsupported-range' | 'unsupported-content' | 'empty-content'
type InsertContentApi = { insertContent?: (options: { data: string; dataType: 'markdown' }) => { status: InsertContentStatus } }
type Editor = ReturnType<typeof siyuan.getAllEditor>[number]['protyle']

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

// ===== 当前编辑器定位（思源公开插件 API） =====
const getNodeId = (node?: Node | null) => {
  let el = (node instanceof HTMLElement ? node : node?.parentElement) as HTMLElement | null
  while (el && !el.dataset?.nodeId) el = el.parentElement
  return el?.dataset?.nodeId || ''
}
const getEditors = (): Editor[] => siyuan.getAllEditor().map(editor => editor.protyle)
const containsNode = (editor: Editor, node?: Node | null) => !!node && editor.element.contains(node)
const getCurrentEditor = (range = getSelectionRange()): Editor | undefined => {
  const editors = getEditors()
  const selectionEditor = editors.find(editor => containsNode(editor, range?.startContainer))
  if (selectionEditor) return selectionEditor

  const focusedEditor = editors.find(editor => containsNode(editor, document.activeElement))
  if (focusedEditor) return focusedEditor

  return editors.find(editor => editor.element.getClientRects().length > 0)
}
const getToolbarRange = (editor: Editor, range = getSelectionRange()) => {
  if (range && containsNode(editor, range.startContainer)) return range
  const savedRange = editor.toolbar?.range
  return savedRange && containsNode(editor, savedRange.startContainer) ? savedRange : null
}
const insertAtCursor = (content: string, i18n: Record<string, string> = {}) => {
  const insertContent = (siyuan as unknown as InsertContentApi).insertContent
  if (!insertContent) throw new Error(i18n.noteInsertUnsupportedVersion || '当前思源版本不支持光标位置插入，请升级思源后重试')

  const { status } = insertContent({ data: content, dataType: 'markdown' })

  if (status === 'inserted') return

  const messages: Record<Exclude<InsertContentStatus, 'inserted'>, [string, string]> = {
    'no-editor': ['noteInsertNoEditor', '未找到可插入的当前编辑器或有效光标位置'],
    readonly: ['noteInsertReadonly', '当前文档为只读，无法插入'],
    'invalid-range': ['noteInsertInvalidRange', '光标位置已失效，请重新定位光标后重试'],
    'unsupported-range': ['noteInsertUnsupportedRange', '当前位置不支持插入内容'],
    'unsupported-content': ['noteInsertUnsupportedContent', '当前编辑器不支持此类内容'],
    'empty-content': ['noteInsertEmptyContent', '插入内容为空'],
  }
  const [key, fallback] = messages[status] || ['', '插入失败']
  throw new Error(i18n[key] || fallback)
}
const getCurrentBlockId = (range = getSelectionRange()) => {
  const editor = getCurrentEditor(range)
  const currentRange = editor && getToolbarRange(editor, range)
  return getNodeId(currentRange?.startContainer)
}
export const getCurrentDocId = async (blockId = '') => {
  if (blockId) {
    const rootId = (await api.getBlockByID(blockId))?.root_id
    if (rootId) return rootId
  }
  return getCurrentEditor()?.block.rootID || ''
}

// ===== 块插入 =====
// 文档级只有「顶部 / 底部」两种落点，其余一律追加到底部。
export const insertToDoc = async (text: string, docId: string, mode: InsertMode = 'appendDoc') => {
  if (!docId) throw new Error('未找到目标文档')
  await (mode === 'prependDoc' ? api.prependBlock('markdown', text, docId) : api.appendBlock('markdown', text, docId))
}

// ===== 当前文档插入 =====
const requestCurrentInsert = (text: string, settings: ReaderSettings, i18n?: Record<string, string>) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new Error('未找到当前编辑器')) }, 1200)
    const off = broadcast.on(payload => {
      if (payload.type !== 'document-insert-ack' || payload.requestId !== requestId) return
      clearTimeout(timer)
      off()
      payload.ok ? resolve() : reject(new Error(payload.message || '插入失败'))
    })
    void broadcast.post({ type: 'document-insert', requestId, text, settings, i18n })
  })
}
const insertCurrent = async (text: string, settings: ReaderSettings, i18n?: Record<string, string>) => {
  const mode = settings.noteInsertMode
  if (mode === 'insertBlock') return insertAtCursor(text, i18n)
  const blockId = getCurrentBlockId(), docId = await getCurrentDocId(blockId)
  if (!docId) throw new Error('未找到当前文档')
  if (!blockId) return mode === 'prependDoc' ? api.prependBlock('markdown', text, docId) : api.appendBlock('markdown', text, docId)
  const place: Record<string, () => any> = {
    updateBlock: () => api.updateBlock('markdown', text, blockId),
    prependBlock: () => api.insertBlock('markdown', text, blockId),
    prependDoc: () => api.prependBlock('markdown', text, docId),
    appendDoc: () => api.appendBlock('markdown', text, docId),
  }
  await (place[mode] || (() => api.insertBlock('markdown', text, undefined, blockId)))()
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
export const ensureNoteDocument = async (title: string, settings: ReaderSettings, key: string, parentID?: string) => {
  const notebook = parentID ? getNotebookId(settings) : await ensureNotebookId(settings)
  if (!notebook) throw new Error('未设置目标笔记本')
  const existing = await getDocIdByAttr(key)
  if (existing) return existing
  const docId = createNodeId()
  const parentPath = parentID ? (await api.getPathByID(parentID, notebook)).path.replace(/\.sy$/, '') : ''
  const created = String((await api.createDoc(notebook, `${parentPath}/${docId}.sy`, sanitize(title), ''))?.id || '')
  if (!created) throw new Error('创建笔记文档失败')
  await api.setBlockAttrs(created, { [ATTR]: key })
  return created
}
const appendToNoteDoc = async (title: string, settings: ReaderSettings, text: string, key: string, parentID?: string) => {
  const id = await ensureNoteDocument(title, settings, key, parentID)

  if (key.startsWith('book:')) {
    const bookUrl = key.slice(5)
    if (bookUrl) {
      const bindDocName = await api.getHPathByID(id).catch(() => '') || title
      const { bookshelfManager } = await import('@/core/bookshelf')
      await bookshelfManager.updateBook(bookUrl, { bindDocId: id, bindDocName })
    }
  }
  const { appendBlockWithRetry } = await import('@/utils/copy')
  return appendBlockWithRetry(text, id)
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
export const insertNote = async (text: string, settings: ReaderSettings, title = '读书', key = title, i18n?: Record<string, string>) => {
  const target = settings.noteInsertTarget || 'clipboard'
  if (target === 'clipboard') return navigator.clipboard.writeText(text).then(() => showMessage('已复制到剪贴板', 1500, 'info'))
  if (target === 'current' && isWindowReader()) return requestCurrentInsert(text, settings, i18n)
  const result = await ({
    current: () => insertCurrent(text, settings, i18n),
    notebook: () => appendToNoteDoc(title, settings, text, `book:${key}`),
    document: () => appendToNoteDoc(title, settings, text, `book:${key}`, pickId(settings.parentDoc)),
    dailynote: () => insertDailyNote(settings, text),
  }[target] || (() => navigator.clipboard.writeText(text)))()
  // 写入失败时 appendBlock 返回 null：不提示成功，把结果交给调用方判断。
  if (!result && target !== 'current') return result
  showMessage('已插入笔记', 1500, 'info')
  return result
}

// ===== 新窗口桥接 =====
broadcast.on(async payload => {
  if (isWindowReader() || payload.type !== 'document-insert' || !payload.requestId) return
  try { await insertCurrent(payload.text || '', payload.settings || {}, payload.i18n) }
  catch (error: any) { return void await broadcast.post({ type: 'document-insert-ack', requestId: payload.requestId, ok: false, message: error?.message || '插入失败' }) }
  await broadcast.post({ type: 'document-insert-ack', requestId: payload.requestId, ok: true })
})
