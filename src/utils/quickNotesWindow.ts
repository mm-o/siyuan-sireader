import { Dialog, Menu, Protyle, openTab, showMessage, type Plugin } from 'siyuan'
import { createDocInfo, searchDocs } from '@/api'
import { bookshelfManager, type Book } from '@/core/bookshelf'
import { getActiveBookUrl } from '@/core/epub/state'
import { DEFAULT_QUICK_NOTES_GROUP_ID as DEFAULT, loadQuickNotes, quickNotesState, updateQuickNotes, type QuickNotesDocument as Note } from '@/core/quickNotes'

type Action = { id: string; icon: string; label: string }
export type NotesToolbar = { mode: 'list' | 'search' | 'document'; keyword: string; placeholder: string; searching: boolean; startActions: Action[]; actions: Action[] }
type Options = { header?: HTMLElement; onChange?: (state: NotesToolbar) => void; onClose?: () => void; onPin?: (pinned: boolean) => void }
const esc = (value: string) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const icon = (name: string, className = '') => `<svg class="${className}"><use xlink:href="#${name}"></use></svg>`

/** The sidebar and floating dialog share one native DOM renderer and delegated events. */
export const createQuickNotesPanel = (host: HTMLElement, plugin: Plugin, options: Options = {}) => {
  const tx = (key: string, fallback: string) => plugin.i18n?.[key] || fallback
  let mode: NotesToolbar['mode'] = 'list', keyword = '', searching = false, searched = false, initialized = false, loadError = false
  let disposed = false, pinned = false, binding = false, bookRequest = 0, searchRequest = 0, bookUrl = ''
  let book: Book | null = null, active: Note | null = null, editor: Protyle | null = null, prompt: Dialog | null = null
  let results: Array<Pick<Note, 'id' | 'name' | 'path'>> = [], targetGroup = DEFAULT
  const expanded = new Set([DEFAULT, 'current-book'])
  const data = () => quickNotesState.value
  const has = (id: string) => data().documents.some(doc => doc.id === id)
  const bound = (): Note | null => book?.bindDocId ? { id: book.bindDocId, name: book.bindDocName || tx('untitled', '无标题'), path: '', groupId: 'current-book', lastOpenedAt: 0 } : null
  const bindLabel = () => `${book?.bindDocId ? tx('quickNotesReplaceBinding', '替换书籍绑定') : tx('quickNotesBindCurrent', '绑定当前书籍')} · ${book?.title || ''}`
  const notify = (message: string, error = false) => showMessage(message, 2000, error ? 'error' : 'info')
  const report = (error: unknown, key = 'quickNotesSaveFailed', fallback = '笔记本保存失败') => { console.error(error); notify(tx(key, fallback), true) }
  const persist = async (update: Parameters<typeof updateQuickNotes>[0], message = '') => {
    try { await updateQuickNotes(update); if (!disposed && message) notify(message) }
    catch (error) { if (!disposed) report(error) }
  }
  const cleanupEditor = () => { try { editor?.destroy() } catch (error) { console.error(error) }; editor = null }
  host.innerHTML = `${options.header ? '<div data-search class="fn__flex" style="gap:8px;padding:8px"><input class="b3-text-field fn__flex-1" style="min-width:0"><button class="b3-button b3-button--text" data-act="search">' + esc(tx('search', '搜索')) + '</button></div>' : ''}<div data-body class="fn__flex-1 fn__flex-column" style="min-height:0;overflow:hidden"></div>`
  const body = host.querySelector<HTMLElement>('[data-body]')!
  const input = host.querySelector<HTMLInputElement>('input')
  const searchBar = host.querySelector<HTMLElement>('[data-search]')
  const hint = (text: string) => `<div class="ft__secondary" style="padding:24px;text-align:center">${esc(text)}</div>`
  const actionHTML = (id: string, glyph: string, label: string, disabled = false) => `<span role="button" tabindex="0" class="b3-list-item__action ariaLabel" data-act="${id}" aria-label="${esc(label)}" aria-disabled="${disabled}">${icon(glyph)}</span>`
  const row = (id: string, name: string, level: number, content: string, group = false, selected = false) => `<li class="b3-list-item${mode === 'list' ? ' b3-list-item--hide-action' : ''}${selected ? ' b3-list-item--focus' : ''}" data-type="navigation-${group ? 'root' : 'file'}" data-${group ? 'group' : 'doc'}="${esc(id)}" data-path="${esc(id)}" data-playlist-item style="--file-toggle-width:${level * 18 + 18}px"><span class="b3-list-item__toggle b3-list-item__toggle--hl" style="padding-left:${level * 18}px">${group ? icon('iconRight', `b3-list-item__arrow${isOpen(id) ? ' b3-list-item__arrow--open' : ''}`) : '<svg class="b3-list-item__arrow bs-tree-leaf-mark" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /></svg>'}</span><span class="b3-list-item__text ariaLabel" data-position="parentE" aria-label="${esc(name)}" data-playlist-item>${esc(name)}</span>${content}</li>`
  const query = () => !options.header && mode === 'list' ? keyword.trim().toLocaleLowerCase() : ''
  const isOpen = (id: string) => !!query() || expanded.has(id)
  const groups = () => {
    const current = bound(), filter = query(), matches = (text: string) => text.toLocaleLowerCase().includes(filter)
    const saved = data().groups.map(group => ({ ...group, current: false, documents: data().documents.filter(doc => doc.groupId === group.id && doc.id !== current?.id).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt) })).filter(group => group.documents.length || group.id !== DEFAULT || !current)
    const all = book ? [{ id: 'current-book', name: `${tx('quickNotesCurrentBook', '当前阅读')} · ${book.title}`, createdAt: 0, current: true, documents: current ? [current] : [] }, ...saved] : saved
    return !filter ? all : all.map(group => ({ ...group, documents: matches(group.name) ? group.documents : group.documents.filter(doc => matches(`${doc.name} ${doc.path}`)) })).filter(group => group.documents.length || matches(group.name))
  }
  const toolbar = (): NotesToolbar => ({
    mode, keyword, searching,
    placeholder: mode === 'search' ? tx('quickNotesSearchPlaceholder', '搜索思源文档…') : tx('quickNotesFilter', '筛选笔记本文档…'),
    startActions: mode === 'list' ? [] : [{ id: 'back', icon: '#iconBack', label: tx('back', '返回列表') }],
    actions: mode === 'document' ? book && active && active.id !== book.bindDocId ? [{ id: 'bind', icon: '#iconLink', label: bindLabel() }] : [] : [{ id: mode === 'search' ? 'search' : 'add', icon: mode === 'search' ? '#iconSearch' : '#iconAdd', label: mode === 'search' ? tx('search', '搜索') : tx('quickNotesAdd', '添加') }],
  })
  const render = () => {
    if (disposed) return
    const state = toolbar()
    options.onChange?.(state)
    if (options.header) {
      const controls = [...state.startActions, ...(mode === 'search' ? [] : state.actions), { id: 'pin', icon: pinned ? '#iconUnpin' : '#iconPin', label: pinned ? tx('quickNotesUnpin', '取消钉住速记') : tx('quickNotesPin', '钉住速记') }, { id: 'close', icon: '#iconCloseRound', label: tx('quickNotesClose', '关闭速记') }]
      options.header.innerHTML = `<div class="block__icons fn__flex-1"><div class="block__logo block__logo--icon">${icon('lucide-notebook-pen', 'block__logoicon')}<span>${esc(tx('quickNotes', '笔记本'))}</span></div><span class="fn__flex-1"></span>${controls.map(item => `<button type="button" class="block__icon block__icon--show ariaLabel${item.id === 'pin' && pinned ? ' block__icon--active' : ''}" data-act="${item.id}" aria-label="${esc(item.label)}"${item.id === 'pin' ? ` aria-pressed="${pinned}"` : ''}>${icon(item.icon.slice(1))}</button>`).join('')}</div>`
      searchBar!.style.display = mode === 'search' ? 'flex' : 'none'
      input!.placeholder = state.placeholder
      if (input!.value !== keyword) input!.value = keyword
    }
    if (mode === 'document') return
    if (!initialized) { body.innerHTML = ''; return }
    if (loadError) { body.innerHTML = `${hint(tx('quickNotesLoadFailed', '笔记本加载失败'))}<button class="b3-button" data-act="reload">${esc(tx('retry', '重试'))}</button>`; return }
    const scroll = body.querySelector<HTMLElement>('.fn__hidescrollbar')?.scrollTop || 0
    let html = ''
    if (mode === 'search') {
      html = searching ? hint(tx('searching', '搜索中…')) : !searched ? hint(tx('quickNotesSearchHint', '输入关键词查找要加入的文档')) : !results.length ? hint(tx('noResults', '没有找到文档')) : `<ul class="b3-list b3-list--background">${results.map(doc => row(doc.id, doc.name, 0, actionHTML('add-doc', has(doc.id) ? 'iconCheck' : 'iconAdd', has(doc.id) ? tx('added', '已添加') : tx('quickNotesAdd', '添加'), has(doc.id)) + (book ? actionHTML('bind', 'iconLink', bindLabel(), binding || book.bindDocId === doc.id) : ''), false, has(doc.id))).join('')}</ul>`
    } else {
      if (!data().documents.length && !bound() && !query()) html += `<div style="padding:24px;text-align:center"><strong>${esc(tx('quickNotesEmptyTitle', '把常用文档收进此笔记本'))}</strong>${hint(tx('quickNotesEmptyHint', '搜索并添加思源文档，随时查看或继续编辑'))}<button class="b3-button b3-button--text" data-act="choose">${esc(tx('quickNotesSearch', '搜索文档'))}</button></div>`
      const list = groups()
      if (query() && !list.length) html += hint(tx('noResults', '没有找到文档'))
      html += list.map(group => `<ul class="b3-list b3-list--background">${row(group.id, group.name, 0, (group.documents.length ? `<span class="counter" data-playlist-item>${group.documents.length}</span>` : '') + actionHTML('choose', group.current ? 'iconLink' : 'iconAdd', group.current ? bindLabel() : tx('quickNotesAddToGroup', '向此分组添加文档')), true)}${isOpen(group.id) ? `<ul class="b3-list b3-list--background bs-tree-children">${group.documents.map(doc => row(doc.id, doc.name, 1, book && !group.current ? actionHTML('bind', 'iconLink', bindLabel(), binding) : '', false, doc.id === data().lastViewedDocId)).join('')}${group.current && !bound() ? `<li class="b3-list-item" data-act="choose" style="--file-toggle-width:36px"><span class="b3-list-item__toggle fn__hidden" style="padding-left:18px"></span><span class="b3-list-item__text ft__secondary">${esc(tx('quickNotesChooseBinding', '搜索文档并点击链接图标绑定'))}</span></li>` : ''}</ul>` : ''}</ul>`).join('')
    }
    body.innerHTML = `<div class="fn__flex-1 fn__flex-column file-tree sy__file bs-view bs-tree-view"><div class="fn__flex-1 fn__hidescrollbar">${html}</div></div>`
    body.querySelector<HTMLElement>('.fn__hidescrollbar')!.scrollTop = scroll
  }
  const refreshBook = async () => {
    const version = ++bookRequest, url = getActiveBookUrl()
    if (url !== bookUrl) { bookUrl = url; book = null; render() }
    try { const next = url ? await bookshelfManager.getBook(url) : null; if (!disposed && version === bookRequest) { book = next; render() } }
    catch (error) { if (!disposed && version === bookRequest) { book = null; render() }; console.error(error) }
  }
  const openDocument = async (doc: Note) => {
    cleanupEditor(); mode = 'document'; active = doc; body.innerHTML = ''; render()
    try { editor = new Protyle(plugin.app, body, { blockId: doc.id, render: { background: false, title: true, icon: true, gutter: true, scroll: true, breadcrumb: true, breadcrumbDocName: true } }) }
    catch (error) { mode = 'list'; active = null; cleanupEditor(); report(error, 'quickNotesOpenFailed', '文档无法打开，可从列表中移除该条目'); void persist(current => current.lastViewedDocId === doc.id ? { ...current, lastViewedDocId: '' } : current); render(); return }
    await persist(current => ({ ...current, lastViewedDocId: doc.id, documents: current.documents.map(item => item.id === doc.id ? { ...item, lastOpenedAt: Date.now() } : item) }))
  }
  const reset = (next: 'list' | 'search') => {
    const wasDocument = mode === 'document'
    cleanupEditor(); mode = next; active = null; keyword = ''; results = []; searched = searching = false; searchRequest++; render()
    if (wasDocument && next === 'list') void persist(current => ({ ...current, lastViewedDocId: '' }))
  }
  const back = () => reset('list')
  const choose = (group = DEFAULT) => { targetGroup = group === 'current-book' ? DEFAULT : group; reset('search'); input?.focus() }
  const search = async () => {
    if (mode !== 'search' || !keyword.trim() || searching) return
    const version = ++searchRequest
    searching = searched = true; render()
    try { const matches = await searchDocs(keyword.trim()); if (!disposed && version === searchRequest) results = matches.slice(0, 40).map(createDocInfo).filter(doc => !!doc.id) }
    catch (error) { if (!disposed && version === searchRequest) report(error, 'quickNotesSearchFailed', '搜索失败，请稍后重试') }
    finally { if (!disposed && version === searchRequest) { searching = false; render() } }
  }
  const bind = async (doc: Pick<Note, 'id' | 'name'> | null) => {
    if (!book || binding) return
    const target = book
    binding = true; render()
    try {
      if (!await bookshelfManager.updateBook(target.url, { bindDocId: doc?.id || '', bindDocName: doc?.name || '' })) throw new Error('Book no longer exists')
      await refreshBook(); if (!disposed) notify(tx('quickNotesBindingSaved', '书籍绑定已更新'))
    } catch (error) { if (!disposed) report(error, 'quickNotesBindingFailed', '绑定失败，请重试') }
    finally { binding = false; render() }
  }
  const createGroup = async () => {
    if (prompt) return
    const name = await new Promise<string>(resolve => {
      const finish = (value = '') => { resolve(value.trim()); prompt?.destroy() }
      prompt = new Dialog({ title: tx('quickNotesCreateGroup', '创建分组'), width: '360px', content: `<div class="b3-dialog__content"><input class="b3-text-field fn__block" placeholder="${esc(tx('quickNotesGroupName', '请输入分组名称'))}"></div><div class="b3-dialog__action"><button class="b3-button" data-cancel>${esc(tx('cancel', '取消'))}</button><button class="b3-button" data-confirm>${esc(tx('confirm', '确定'))}</button></div>`, destroyCallback: () => { prompt = null; resolve('') } })
      const field = prompt.element.querySelector<HTMLInputElement>('input')!
      prompt.element.querySelector('[data-confirm]')!.addEventListener('click', () => finish(field.value))
      prompt.element.querySelector('[data-cancel]')!.addEventListener('click', () => finish())
      field.addEventListener('keydown', event => { if (event.key === 'Enter') finish(field.value); if (event.key === 'Escape') finish() })
      field.focus()
    })
    if (!name || disposed) return
    const id = `group-${crypto.randomUUID()}`
    expanded.add(id)
    await persist(current => ({ ...current, groups: [...current.groups, { id, name, createdAt: Date.now() }] }), tx('quickNotesGroupCreated', '分组已创建'))
  }
  const menu = (event: MouseEvent, items: Parameters<Menu['addItem']>[0][]) => {
    const popup = new Menu()
    items.forEach(item => popup.addItem(item.click ? { ...item, click: (...args) => { popup.close(); item.click!(...args) } } : item))
    popup.open({ x: event.clientX, y: event.clientY })
  }
  const findDoc = (id: string): Note | undefined => {
    const current = bound(), doc = data().documents.find(doc => doc.id === id) || (current?.id === id ? current : results.find(doc => doc.id === id))
    return doc ? { groupId: targetGroup, lastOpenedAt: 0, ...doc } : undefined
  }
  const action = (id: string, event?: MouseEvent, doc?: Note, group?: string) => {
    if (disposed) return
    if (id === 'back') back()
    else if (id === 'choose') choose(group)
    else if (id === 'search') void search()
    else if (id === 'reload') void initialize()
    else if (id === 'pin') { pinned = !pinned; options.onPin?.(pinned); render() }
    else if (id === 'close') options.onClose?.()
    else if (id === 'bind') void bind(doc || active)
    else if (id === 'add-doc' && doc && !has(doc.id)) {
      expanded.add(targetGroup)
      void persist(current => current.documents.some(item => item.id === doc.id) ? current : { ...current, documents: [...current.documents, { ...doc, groupId: targetGroup, lastOpenedAt: 0 }] }, tx('quickNotesAdded', '已添加到笔记本'))
    } else if (id === 'add' && event) menu(event, [
      { icon: 'iconSearch', label: tx('quickNotesSearch', '搜索文档'), click: () => choose() },
      { icon: 'iconFolder', label: tx('quickNotesCreateGroup', '创建分组'), click: () => { void createGroup() } },
    ])
  }
  const click = (event: MouseEvent) => {
    const target = event.target as HTMLElement, control = target.closest<HTMLElement>('[data-act]')
    if (control?.getAttribute('aria-disabled') === 'true') return
    const docId = target.closest<HTMLElement>('[data-doc]')?.dataset.doc, group = target.closest<HTMLElement>('[data-group]')?.dataset.group
    if (control) { event.stopPropagation(); action(control.dataset.act!, event, docId ? findDoc(docId) : undefined, group) }
    else if (docId && mode === 'list') { const doc = findDoc(docId); if (doc) void openDocument(doc) }
    else if (group) { expanded.has(group) ? expanded.delete(group) : expanded.add(group); render() }
  }
  const contextMenu = (event: MouseEvent) => {
    const target = event.target as HTMLElement, id = target.closest<HTMLElement>('[data-doc]')?.dataset.doc, group = target.closest<HTMLElement>('[data-group]')?.dataset.group
    if (!id && (!group || group === 'current-book')) return
    event.preventDefault(); event.stopPropagation()
    const items: Parameters<Menu['addItem']>[0][] = []
    if (id) {
      const doc = findDoc(id); if (!doc) return
      items.push({ icon: 'iconFocus', label: tx('openInSiyuan', '在思源中打开'), click: () => { openTab({ app: plugin.app, doc: { id, action: ['cb-get-focus'] } }) } })
      if (book) items.push({ icon: 'iconLink', label: id === book.bindDocId ? tx('unbindDocument', '解除书籍绑定') : bindLabel(), click: () => { void bind(id === book?.bindDocId ? null : doc) } })
      if (has(id)) {
        data().groups.filter(item => item.id !== doc.groupId).forEach(item => items.push({ icon: 'iconFolder', label: `${tx('quickNotesMoveTo', '移至')} ${item.name}`, click: () => { expanded.add(item.id); void persist(current => ({ ...current, documents: current.documents.map(value => value.id === id ? { ...value, groupId: item.id } : value) }), tx('quickNotesMoved', '已移动到分组')) } }))
        items.push({ icon: 'iconTrashcan', label: tx('quickNotesRemove', '从列表移除'), click: () => { void persist(current => ({ ...current, documents: current.documents.filter(value => value.id !== id), lastViewedDocId: current.lastViewedDocId === id ? '' : current.lastViewedDocId }), tx('quickNotesRemoved', '已从笔记本移除')) } })
      }
    } else {
      items.push({ icon: 'iconAdd', label: tx('quickNotesAddToGroup', '向此分组添加文档'), click: () => choose(group) })
      if (group !== DEFAULT) items.push({ icon: 'iconTrashcan', label: tx('quickNotesDeleteGroup', '删除分组'), click: () => { void persist(current => ({ ...current, groups: current.groups.filter(value => value.id !== group), documents: current.documents.map(doc => doc.groupId === group ? { ...doc, groupId: DEFAULT } : doc) }), tx('quickNotesGroupDeleted', '分组已删除，文档已移入默认分组')) } })
    }
    menu(event, items)
  }
  const keydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (event.key === 'Escape' && mode === 'search') { event.preventDefault(); event.stopPropagation(); back() }
    else if (target === input && event.key === 'Enter') { event.preventDefault(); void search() }
    else if ((event.key === 'Enter' || event.key === ' ') && target.getAttribute('role') === 'button') { event.preventDefault(); target.click() }
  }
  const onInput = () => { keyword = input!.value; options.onChange?.(toolbar()) }
  const onHover = (event: MouseEvent) => (event.target as HTMLElement).hasAttribute('data-playlist-item') && event.stopPropagation()
  const initialize = async () => {
    loadError = false
    try { await Promise.all([loadQuickNotes(), refreshBook()]); if (disposed) return; initialized = true; const doc = data().documents.find(item => item.id === data().lastViewedDocId); if (doc) await openDocument(doc); else render() }
    catch (error) { if (!disposed) { initialized = loadError = true; console.error(error); render() } }
  }
  host.addEventListener('click', click); host.addEventListener('contextmenu', contextMenu); host.addEventListener('keydown', keydown)
  host.addEventListener('mouseover', onHover)
  input?.addEventListener('input', onInput); options.header?.addEventListener('click', click)
  window.addEventListener('sireader:quick-notes-updated', render)
  window.addEventListener('sireader:reader-state', refreshBook); window.addEventListener('sireader:bookshelf-updated', refreshBook)
  const ready = initialize()
  return {
    ready, action,
    setKeyword(value: string) { keyword = value; render() },
    destroy() {
      disposed = true; bookRequest++; searchRequest++; prompt?.destroy(); cleanupEditor()
      host.removeEventListener('click', click); host.removeEventListener('contextmenu', contextMenu); host.removeEventListener('keydown', keydown)
      host.removeEventListener('mouseover', onHover)
      input?.removeEventListener('input', onInput); options.header?.removeEventListener('click', click)
      window.removeEventListener('sireader:quick-notes-updated', render)
      window.removeEventListener('sireader:reader-state', refreshBook); window.removeEventListener('sireader:bookshelf-updated', refreshBook)
      host.replaceChildren()
    },
  }
}

export const createQuickNotesWindow = (plugin: Plugin) => {
  let dialog: Dialog | null = null, focus: HTMLElement | null = null
  const open = () => {
    if (dialog) { dialog.element.style.display = ''; (focus?.isConnected ? focus : dialog.element.querySelector<HTMLElement>('.b3-dialog__container'))?.focus({ preventScroll: true }); return }
    let dispose = () => {}
    const current = new Dialog({
      title: plugin.i18n?.quickNotes || '笔记本', positionId: `${plugin.name}-quick-notes`, width: '420px', height: '360px', disableAnimation: true, disableClose: true, transparent: true,
      content: '<div data-quick-notes class="fn__flex-column" style="height:100%;min-height:0;overflow:hidden"></div>',
      destroyCallback: () => { dispose(); if (dialog === current) { dialog = null; focus = null } },
    })
    dialog = current
    const root = current.element.querySelector<HTMLElement>('.b3-dialog'), scrim = current.element.querySelector<HTMLElement>('.b3-dialog__scrim'), container = current.element.querySelector<HTMLElement>('.b3-dialog__container'), header = current.element.querySelector<HTMLElement>('.b3-dialog__header'), host = current.element.querySelector<HTMLElement>('[data-quick-notes]')
    if (!root || !scrim || !container || !header || !host) return current.destroy()
    const hide = () => { focus = container.contains(document.activeElement) ? document.activeElement as HTMLElement : container; current.element.style.display = 'none' }
    const onScrim = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); if (scrim.style.pointerEvents !== 'none') hide() }
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) { event.preventDefault(); event.stopPropagation(); hide() } }
    root.style.background = 'transparent'; scrim.style.setProperty('background', 'transparent', 'important')
    Object.assign(container.style, { pointerEvents: 'auto', overflow: 'hidden', maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100dvh - 16px)' }); container.tabIndex = -1
    header.style.cssText = 'display:flex;padding:0'
    const panel = createQuickNotesPanel(host, plugin, { header, onClose: hide, onPin: value => { root.style.pointerEvents = scrim.style.pointerEvents = value ? 'none' : 'auto' } })
    scrim.addEventListener('click', onScrim, true); root.addEventListener('keydown', onEscape)
    dispose = () => { scrim.removeEventListener('click', onScrim, true); root.removeEventListener('keydown', onEscape); panel.destroy() }
    focus = container; container.focus({ preventScroll: true })
  }
  return { open, destroy: () => dialog?.destroy() }
}
