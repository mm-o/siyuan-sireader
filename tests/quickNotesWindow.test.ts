import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

const state = vi.hoisted(() => ({ value: null as any, url: '', getBook: vi.fn(), updateBook: vi.fn(), search: vi.fn(), destroyEditor: vi.fn(), items: [] as any[] }))
vi.mock('vue', () => { throw new Error('Native quick notes must not load Vue') })
vi.mock('@/core/storage', () => ({ cloneStorageValue: structuredClone, loadData: async () => state.value, saveData: async (_key: string, value: unknown) => { state.value = structuredClone(value) } }))
vi.mock('@/core/epub/state', () => ({ getActiveBookUrl: () => state.url }))
vi.mock('@/core/bookshelf', () => ({ bookshelfManager: { getBook: state.getBook, updateBook: state.updateBook } }))
vi.mock('@/api', () => ({ createDocInfo: (doc: any) => doc, searchDocs: state.search }))
vi.mock('siyuan', () => ({
  showMessage: vi.fn(), openTab: vi.fn(),
  Protyle: class { constructor(_app: any, host: HTMLElement) { host.innerHTML = '<div class="protyle">Editor</div>' }; destroy() { state.destroyEditor() } },
  Menu: class { addItem(item: any) { state.items.push(item) }; open() {}; close() {} },
  Dialog: class {
    element = document.createElement('div')
    constructor(public options: any) {
      this.element.innerHTML = `<div class="b3-dialog"><div class="b3-dialog__scrim"></div><div class="b3-dialog__container"><div class="b3-dialog__header"></div>${options.content}</div></div>`
      document.body.append(this.element)
    }
    destroy() { this.options.destroyCallback(); this.element.remove() }
  },
}))
const plugin = { name: 'sireader', app: {}, i18n: {} } as any
const disposers: Array<() => void> = []
const doc = { id: 'doc', name: 'Note <safe>', path: '/doc.sy', groupId: 'default', lastOpenedAt: 0 }
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  const { window } = new JSDOM()
  for (const key of ['window', 'document', 'Event', 'KeyboardEvent', 'MouseEvent'] as const) vi.stubGlobal(key, key === 'window' ? window : window[key])
  state.value = { version: 1, groups: [], documents: [doc], lastViewedDocId: '' }; state.url = ''; state.items = []
  state.getBook.mockReset().mockImplementation(async url => ({ url, title: url, bindDocId: 'bound', bindDocName: 'Bound note' }))
  state.updateBook.mockReset().mockResolvedValue(true)
  state.search.mockReset().mockResolvedValue([{ id: 'new', name: 'New note', path: '/new.sy' }])
})
afterEach(() => { disposers.splice(0).forEach(fn => fn()); vi.unstubAllGlobals() })
const panel = async (onChange?: (value: any) => void) => {
  const { createQuickNotesPanel } = await import('@/utils/quickNotesWindow')
  const host = document.createElement('div'); document.body.append(host)
  const notes = createQuickNotesPanel(host, plugin, { onChange }); disposers.push(notes.destroy)
  await notes.ready
  return { host, notes }
}
const popup = async () => {
  const { createQuickNotesWindow } = await import('@/utils/quickNotesWindow')
  const notes = createQuickNotesWindow(plugin); disposers.push(notes.destroy); notes.open(); await settle()
  return notes
}

it('renders native theme hierarchy, counters and escaped document names without Vue', async () => {
  const { host } = await panel()
  expect(host.querySelectorAll('.file-tree > .fn__flex-1 > ul ul .b3-list-item__toggle')).toHaveLength(1)
  expect(host.querySelector('.counter')?.textContent).toBe('1')
  expect(host.querySelector('[data-doc] .b3-list-item__text')?.textContent).toBe(doc.name)
  expect(host.querySelector('safe')).toBeNull()
})

it('uses the bookshelf hover guard for marked note rows without blocking other events', async () => {
  const { host } = await panel()
  const nativeHover = vi.fn(), nativeClick = vi.fn()
  document.body.addEventListener('mouseover', nativeHover)
  document.body.addEventListener('click', nativeClick)
  const text = host.querySelector('[data-doc] .b3-list-item__text')!
  text.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  host.querySelector('[data-group]')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  expect(nativeHover).not.toHaveBeenCalled()
  host.querySelector<HTMLElement>('[data-group]')!.click()
  expect(nativeClick).toHaveBeenCalledOnce()
  // Editor events still reach SiYuan's native handlers.
  const editorChild = document.createElement('div'); host.append(editorChild)
  editorChild.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  editorChild.click()
  expect(nativeHover).toHaveBeenCalledOnce(); expect(nativeClick).toHaveBeenCalledTimes(2)
})

it('filters the sidebar and searches/adds documents through the same controller', async () => {
  const { host, notes } = await panel()
  notes.setKeyword('missing'); expect(host.querySelector('[data-doc]')).toBeNull()
  notes.setKeyword('safe'); expect(host.querySelector('[data-doc]')).not.toBeNull()
  notes.action('choose'); notes.setKeyword('new'); notes.action('search'); await settle()
  host.querySelector<HTMLElement>('[data-act="add-doc"]')!.click(); await settle()
  expect(state.value.documents.map((value: any) => value.id)).toEqual(['doc', 'new'])
})

it('keeps the editor alive when hidden and releases it on unload', async () => {
  const notes = await popup(), element = document.body.firstElementChild as HTMLElement
  document.querySelector<HTMLElement>('[data-doc]')!.click(); await settle()
  const editor = document.querySelector('.protyle')
  document.querySelector<HTMLElement>('[data-act="close"]')!.click()
  expect(element.style.display).toBe('none'); expect(state.destroyEditor).not.toHaveBeenCalled()
  notes.open(); expect(document.querySelector('.protyle')).toBe(editor)
  notes.destroy(); expect(state.destroyEditor).toHaveBeenCalledOnce()
})

it('pins for background access, dismisses on outside click otherwise, and keeps round-corner clipping', async () => {
  await popup()
  const root = document.querySelector<HTMLElement>('.b3-dialog')!, container = document.querySelector<HTMLElement>('.b3-dialog__container')!, scrim = document.querySelector<HTMLElement>('.b3-dialog__scrim')!, element = root.parentElement!
  expect(container.style.overflow).toBe('hidden')
  document.querySelector<HTMLElement>('[data-act="pin"]')!.click()
  expect(root.style.pointerEvents).toBe('none'); expect(container.style.pointerEvents).toBe('auto')
  scrim.click(); expect(element.style.display).toBe('')
  document.querySelector<HTMLElement>('[data-act="pin"]')!.click()
  scrim.click(); expect(element.style.display).toBe('none')
})

it('handles search Escape first and scopes window Escape to the dialog', async () => {
  await popup()
  const element = document.body.firstElementChild as HTMLElement
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(element.style.display).toBe('')
  // The add menu selects document search.
  document.querySelector<HTMLElement>('[data-act="add"]')!.click(); state.items[0].click()
  document.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  expect(element.style.display).toBe('')
  document.querySelector('.b3-dialog')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  expect(element.style.display).toBe('none')
})

it('refreshes current book bindings, ignores stale book results and clears on reader close', async () => {
  let resolve!: (value: any) => void
  state.url = 'a'; state.getBook.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const { createQuickNotesPanel } = await import('@/utils/quickNotesWindow')
  const host = document.createElement('div'), notes = createQuickNotesPanel(host, plugin); disposers.push(notes.destroy)
  state.url = 'b'; window.dispatchEvent(new Event('sireader:reader-state')); await settle()
  resolve({ url: 'a', title: 'Old book', bindDocId: 'old' }); await notes.ready
  expect(host.querySelector('[data-doc="old"]')).toBeNull()
  expect(host.querySelector('[data-doc="bound"]')).not.toBeNull()
  state.getBook.mockResolvedValueOnce({ url: 'b', title: 'b', bindDocId: 'changed', bindDocName: 'Changed' })
  window.dispatchEvent(new Event('sireader:bookshelf-updated')); await settle()
  expect(host.querySelector('[data-doc="changed"]')).not.toBeNull()
  state.url = ''; window.dispatchEvent(new Event('sireader:reader-state')); await settle()
  expect(host.querySelector('[data-group="current-book"]')).toBeNull()
})

it('binds from a note row and unlinks through the document context menu', async () => {
  state.url = 'book'
  const { host } = await panel()
  host.querySelector<HTMLElement>('[data-doc="doc"] [data-act="bind"]')!.click(); await settle()
  expect(state.updateBook).toHaveBeenCalledWith('book', { bindDocId: doc.id, bindDocName: doc.name })
  host.querySelector('[data-doc="bound"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
  state.items.find(item => item.icon === 'iconLink').click(); await settle()
  expect(state.updateBook).toHaveBeenLastCalledWith('book', { bindDocId: '', bindDocName: '' })
})

it('synchronizes sidebar changes to an already open floating window', async () => {
  const { createQuickNotesWindow } = await import('@/utils/quickNotesWindow'), notes = createQuickNotesWindow(plugin)
  disposers.push(notes.destroy); notes.open(); await settle()
  const data = await import('@/core/quickNotes')
  await data.updateQuickNotes(current => ({ ...current, documents: [...current.documents, { ...doc, id: 'external', name: 'External' }] }))
  expect(document.querySelector('[data-doc="external"]')).not.toBeNull()
})
