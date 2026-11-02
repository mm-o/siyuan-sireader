import { beforeEach, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({ value: null as any }))
vi.mock('siyuan', () => ({ fetchSyncPost: vi.fn(), Dialog: vi.fn(), Menu: vi.fn(), Protyle: vi.fn() }))
vi.mock('@/utils/quickNotesWindow', () => ({ createQuickNotesPanel: vi.fn() }))
vi.mock('@/core/storage', () => ({
  cloneStorageValue: (value: unknown) => structuredClone(value),
  loadData: async () => storage.value,
  saveData: async (_key: string, value: unknown) => { storage.value = structuredClone(value) },
}))

beforeEach(() => { vi.resetModules(); storage.value = null })

it('resolves document search results without notebook path API calls', async () => {
  const { createDocInfo } = await import('@/api')
  const { fetchSyncPost } = await import('siyuan')
  for (const result of [{ id: 'doc' }, { blockID: 'doc' }, { rootID: 'doc' }, { path: '/parent/doc.sy' }]) {
    expect(createDocInfo(result).id).toBe('doc')
  }
  expect(createDocInfo({ path: '/doc.sy', notebook: 'nb' }).notebook).toBe('nb')
  expect(createDocInfo({ path: '/doc.sy', box: 'nb' }).notebook).toBe('nb')
  expect(fetchSyncPost).not.toHaveBeenCalled()
})

it('keeps the sidebar on the shared search toolbar', async () => {
  const { h } = await import('vue')
  const { renderToString } = await import('vue/server-renderer')
  const { JSDOM } = await import('jsdom')
  const { default: QuickNotes } = await import('@/components/QuickNotes.vue')
  const html = await renderToString(h(QuickNotes, { plugin: { app: {}, i18n: {} } as any }))
  const { document } = new JSDOM(html).window
  expect(document.querySelectorAll('.sr-toolbar input')).toHaveLength(1)
  expect(document.querySelector('.block__icons')).toBeNull()
})

it('keeps added documents when reopening and recording the last visit', async () => {
  const notes = await import('@/core/quickNotes')
  await notes.loadQuickNotes()
  await notes.updateQuickNotes(state => ({ ...state, documents: [{ id: 'doc-a', name: 'A', path: '', groupId: 'default', lastOpenedAt: 0 }] }))
  expect((await notes.loadQuickNotes()).documents.map(doc => doc.id)).toEqual(['doc-a'])
  await notes.updateQuickNotes(state => ({ ...state, lastViewedDocId: 'doc-a' }))
  expect(notes.quickNotesState.value.documents).toHaveLength(1)
  expect(storage.value.lastViewedDocId).toBe('doc-a')
})

it('preserves every queued document addition', async () => {
  const notes = await import('@/core/quickNotes')
  await Promise.all(['a', 'b', 'c'].map(id => notes.updateQuickNotes(state => ({
    ...state, documents: [...state.documents, { id, name: id, path: '', groupId: 'default', lastOpenedAt: 0 }],
  }))))
  expect(storage.value.documents.map((doc: any) => doc.id)).toEqual(['a', 'b', 'c'])
})
