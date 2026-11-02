import { cloneStorageValue, loadData, saveData } from '@/core/storage'

export const DEFAULT_QUICK_NOTES_GROUP_ID = 'default'

export interface QuickNotesGroup {
  id: string
  name: string
  createdAt: number
}

export interface QuickNotesDocument {
  id: string
  name: string
  path: string
  groupId: string
  lastOpenedAt: number
}

export interface QuickNotesState {
  version: 1
  groups: QuickNotesGroup[]
  documents: QuickNotesDocument[]
  lastViewedDocId: string
}

const STORAGE_KEY = 'quick-notes.json'

const emptyState = (): QuickNotesState => ({
  version: 1,
  groups: [{ id: DEFAULT_QUICK_NOTES_GROUP_ID, name: '默认分组', createdAt: 0 }],
  documents: [],
  lastViewedDocId: '',
})

export const normalizeQuickNotes = (value: any): QuickNotesState => {
  const state = emptyState()
  const groups = new Map<string, QuickNotesGroup>([[DEFAULT_QUICK_NOTES_GROUP_ID, state.groups[0]]])
  for (const item of Array.isArray(value?.groups) ? value.groups : []) {
    const id = String(item?.id || '').trim()
    const name = String(item?.name || '').trim()
    if (!id || id === DEFAULT_QUICK_NOTES_GROUP_ID || !name || groups.has(id)) continue
    groups.set(id, { id, name, createdAt: Math.max(0, Number(item?.createdAt) || 0) })
  }

  const documents = new Map<string, QuickNotesDocument>()
  for (const item of Array.isArray(value?.documents) ? value.documents : []) {
    const id = String(item?.id || '').trim()
    if (!id || documents.has(id)) continue
    const groupId = String(item?.groupId || '')
    documents.set(id, {
      id,
      name: String(item?.name || '无标题').trim() || '无标题',
      path: String(item?.path || ''),
      groupId: groups.has(groupId) ? groupId : DEFAULT_QUICK_NOTES_GROUP_ID,
      lastOpenedAt: Math.max(0, Number(item?.lastOpenedAt) || 0),
    })
  }

  const lastViewedDocId = String(value?.lastViewedDocId || '')
  return {
    version: 1,
    groups: [...groups.values()],
    documents: [...documents.values()],
    lastViewedDocId: documents.has(lastViewedDocId) ? lastViewedDocId : '',
  }
}

export const quickNotesState = { value: emptyState() }

let loadTask: Promise<QuickNotesState> | null = null
let writeQueue: Promise<unknown> = Promise.resolve()

export const loadQuickNotes = () => {
  if (!loadTask) {
    loadTask = loadData<QuickNotesState>(STORAGE_KEY)
      .then((value) => {
        if (Number((value as any)?.version || 0) > 1) throw new Error('Unsupported future quick-notes schema')
        quickNotesState.value = normalizeQuickNotes(value)
        return quickNotesState.value
      })
      .catch((error) => {
        loadTask = null
        throw error
      })
  }
  return loadTask.then(() => quickNotesState.value)
}

export const updateQuickNotes = (update: (current: QuickNotesState) => QuickNotesState) => {
  const task = writeQueue.then(async () => {
    const current = await loadQuickNotes()
    const next = normalizeQuickNotes(update(cloneStorageValue(current)))
    await saveData(STORAGE_KEY, next)
    quickNotesState.value = next
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('sireader:quick-notes-updated'))
    return next
  })
  writeQueue = task.catch(() => undefined)
  return task
}
