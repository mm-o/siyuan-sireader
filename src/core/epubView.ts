import type { Plugin } from 'siyuan'
import { showMessage, openTab } from 'siyuan'
import * as API from '../api'
import ePub from 'epubjs'
import type { Book, Rendition } from 'epubjs'

// ==================== 配置常量 ====================
let pluginInstance: Plugin
let getSettings: () => { openMode: string }

const getViewStyles = (i18n?) => ([
  { icon: 'iconLink', label: i18n?.styleDefault || '默认', value: '' },
  { icon: 'iconEmbed', label: i18n?.styleBorder || '边框', value: 'border' },
  { icon: 'iconGallery', label: i18n?.styleCard || '卡片', value: 'card' },
  { icon: 'iconImage', label: i18n?.styleThumb || '封面', value: 'thumb' },
  { icon: 'iconPreview', label: i18n?.styleReader || '阅读器', value: 'reader' },
])

const progressSavers = new Map<string, { timer: number; lastProgress: number; lastCfi: string }>()
const loadingReaders = new Set<string>()
const activeRenditions = new Map<string, { rendition: Rendition; book: Book }>()
let clickHandlerAdded = false

// ==================== 元数据解析 ====================
export async function parseEpubMetadata(file: File) {
  try {
    const book = ePub(await file.arrayBuffer())
    await book.ready
    const metadata = await book.loaded.metadata
    const title = metadata.title || file.name.replace('.epub', '')
    return { book, metadata: { title, author: metadata.creator || '', publisher: metadata.publisher || '', language: metadata.language || '', description: metadata.description || '', pubdate: metadata.pubdate || '', identifier: metadata.identifier || '', cover: '' } }
  } catch (e) {
    return console.error('[SiReader]', e), null
  }
}

// ==================== 工具函数 ====================
const getEpubUrl = (b: Element) => ((l) => (l?.getAttribute('data-href') || l?.getAttribute('href'))?.toLowerCase().endsWith('.epub') ? l?.getAttribute('data-href') || l?.getAttribute('href') : null)(b.querySelector('span[data-type="a"], a[href]'))
const getBlock = (id: string) => document.querySelector(`[data-node-id="${id}"]`)
const calcPercent = (loc: any, book: any) => loc.start.percentage || (loc.start.index + 1) / (book.spine.length || 1)
const fetchEpub = async (url: string) => new File([await (await fetch(url.startsWith('http') || url.startsWith('/') ? url : `/${url}`)).blob()], url.split('/').pop() || 'book.epub', { type: 'application/epub+zip' })
const uploadCover = async (book: any, title: string, blockId: string) => book.coverUrl().then(u => u && fetch(u).then(r => r.blob()).then(b => API.upload('/assets/', [new File([b], `${title}.jpg`, { type: b.type })]).then(res => res.succMap[`${title}.jpg`])).then(cover => cover && API.setBlockAttrs(blockId, { 'custom-epub-cover': cover }).then(() => refreshEpubBlock(blockId)))).catch(() => {})
const createDiv = (html: string) => Object.assign(document.createElement('div'), { innerHTML: html })

const applyEpubStyle = (block: HTMLElement, attrs: any) => (block.style.setProperty('--epub-cover', attrs['custom-epub-cover'] ? `url(${attrs['custom-epub-cover']})` : 'none'), block.style.setProperty('--epub-info', `"${[attrs['custom-epub-title'] && `📖 ${attrs['custom-epub-title']}`, attrs['custom-epub-author'] && `✍️ ${attrs['custom-epub-author']}`, attrs['custom-epub-publisher'] && `📚 ${attrs['custom-epub-publisher']}`, attrs['custom-epub-pubdate'] && `📅 ${attrs['custom-epub-pubdate']}`, attrs['custom-epub-last-read'] && `🕒 ${new Date(attrs['custom-epub-last-read']).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-')}`, `📊 ${attrs['custom-epub-progress'] || 0}%`].filter(Boolean).join('\\A')}"`), block.style.setProperty('--epub-width', attrs['custom-epub-width'] || ''))

const openEpubTab = async (url: string, blockId: string) => {
  const name = url.split('/').pop()?.replace('.epub', '') || 'book'
  const mode = getSettings().openMode
  openTab({ app: (pluginInstance as any).app, custom: { icon: 'iconBook', title: name, data: { file: await fetchEpub(url), url, blockId }, id: `${pluginInstance.name}epub_reader` } as any, position: mode === 'rightTab' ? 'right' : mode === 'bottomTab' ? 'bottom' : undefined })
}

// ==================== 元数据管理 ====================
const saveMetadata = async (blockId: string, url: string) => {
  const result = await parseEpubMetadata(await fetchEpub(url))
  if (!result) return
  const { metadata, book } = result
  await API.setBlockAttrs(blockId, { 'custom-epub': 'true', 'custom-epub-url': url, 'custom-epub-title': metadata.title, 'custom-epub-author': metadata.author, 'custom-epub-cover': '', 'custom-epub-publisher': metadata.publisher, 'custom-epub-pubdate': metadata.pubdate })
  uploadCover(book, metadata.title, blockId)
}

const batchUpdate = async (docId: string, attrs: Record<string, string>, msg: string, i18n?) => {
  const t = performance.now()
  try {
    const existingIds = (await API.sql(`SELECT block_id FROM attributes WHERE name='custom-epub' AND block_id IN (SELECT id FROM blocks WHERE root_id='${docId}')`))?.map((r: any) => r.block_id) || []
    const existingSet = new Set(existingIds)
    let newBlocks: { id: string; url: string }[] = []
    if (attrs['custom-epub-view']) {
      const blocks = Array.from(document.querySelectorAll(`[data-node-id][data-node-index][data-type="NodeParagraph"]`))
      newBlocks = blocks.filter(b => {
        const id = b.getAttribute('data-node-id')
        return id && !existingSet.has(id) && getEpubUrl(b)
      }).map(b => ({ id: b.getAttribute('data-node-id')!, url: getEpubUrl(b)! }))
      if (newBlocks.length) {
        showMessage(`⏳ ${i18n?.extractingMetadata || '提取元数据...'} ${newBlocks.length}`, 2000, 'info')
        for (let i = 0; i < newBlocks.length; i += 3) await Promise.allSettled(newBlocks.slice(i, i + 3).map(({ id, url }) => saveMetadata(id, url))), await new Promise(ok => setTimeout(ok, 200))
      }
    }
    const blockIds = attrs['custom-epub-width'] ? (await API.sql(`SELECT block_id FROM attributes WHERE name='custom-epub-view' AND value='card' AND block_id IN (SELECT id FROM blocks WHERE root_id='${docId}')`))?.map((r: any) => r.block_id) || [] : [...existingIds, ...newBlocks.map(b => b.id)]
    if (!blockIds.length) return showMessage(i18n?.noEpubBlocks || '当前文档未找到EPUB块', 3000, 'info')
    for (let i = 0; i < blockIds.length; i += 100) document.querySelectorAll(blockIds.slice(i, i + 100).map(id => `[data-node-id="${id}"]`).join(',')).forEach(b => (b.querySelector('.epub-embedded-reader')?.remove(), destroyReader(b.getAttribute('data-node-id')!)))
    for (let i = 0; i < blockIds.length; i += 10) await Promise.allSettled(blockIds.slice(i, i + 10).map(id => API.setBlockAttrs(id, attrs))), await new Promise(ok => setTimeout(ok, 50))
    setTimeout(renderAllEpubBlocks, 100), showMessage(`✅ ${msg} ${blockIds.length} (${((performance.now() - t) / 1000).toFixed(2)}s)`, 3000, 'info')
  } catch (e) { showMessage(`❌ ${i18n?.batchOperationFailed || '批量操作失败'}`, 3000, 'error') }
}

// ==================== 菜单集成 ====================
export function initEpubBlockMenu(plugin: Plugin, settingsGetter: () => { openMode: string }) {
  pluginInstance = plugin
  getSettings = settingsGetter
  const titleMenuListener = (e: CustomEvent) => {
    const { menu, protyle } = e.detail || {}
    if (!menu) return
    const docId = protyle?.block?.rootID || (protyle?.element || document.querySelector('.protyle:not(.fn__none)'))?.querySelector('.protyle-title')?.dataset?.nodeId
    if (!docId) return
    const i18n = pluginInstance.i18n
    menu.addItem({
      icon: 'iconTheme',
      label: i18n?.batchConvertStyle || '批量转换EPUB样式',
      submenu: [
        ...getViewStyles(i18n).map(s => ({ icon: s.icon, label: s.label, click: () => batchUpdate(docId, { 'custom-epub-view': s.value || '' }, i18n?.converted || '已转换', i18n) })),
        { type: 'separator' },
        { icon: 'iconFullscreen', label: i18n?.batchWidth || '批量宽度', type: 'submenu', submenu: [100, 200, 300, 400, 500].map(w => ({ label: `${w}px`, click: () => batchUpdate(docId, { 'custom-epub-width': `${w}px` }, i18n?.widthAdjusted || '已调整宽度', i18n) })) },
      ]
    })
  }
  
  const blockMenuListener = (e: CustomEvent) => {
    const { menu, blockElements } = e.detail || {}
    if (!menu) return
    const block = blockElements?.[0]
    if (!block) return
    const blockId = block.dataset?.nodeId
    const isEpub = block.getAttribute('custom-epub')
    const epubUrl = isEpub ? block.getAttribute('custom-epub-url') : getEpubUrl(block)
    if (!blockId || !epubUrl) return
    
    const currentView = block.getAttribute('custom-epub-view') || ''
    const i18n = pluginInstance.i18n
    
    menu.addItem({
      icon: 'iconTheme',
      label: i18n?.epubStyle || 'EPUB样式',
      submenu: getViewStyles(i18n).map(s => ({
        icon: s.icon,
        label: s.label,
        click: async () => {
          if (!isEpub) await saveMetadata(blockId, epubUrl)
          await setView(blockId, s.value)
        },
        current: currentView === s.value,
      })),
    })
    
    if (currentView && currentView !== 'border') {
      const [unit, max] = currentView === 'card' ? ['px', 1000] : ['vw', 100]
      const percent = Math.round((parseFloat(block.getAttribute('custom-epub-width') || (currentView === 'card' ? '400' : '12.5')) / max) * 100)
      const calc = (v: number) => `${Math.round((v / 100) * max)}${unit}`
      const apply = async (v: number) => {
        const w = calc(v)
        await API.setBlockAttrs(blockId, { 'custom-epub-width': w })
        ;(block as HTMLElement).style.setProperty('--epub-width', w)
        const overlay = block.querySelector('.epub-embedded-reader') as HTMLElement
        overlay?.style.setProperty('--epub-width', w)
        activeRenditions.get(blockId)?.rendition && setTimeout(() => (activeRenditions.get(blockId)!.rendition as any).resize?.(), 100)
      }
      const el = (html: string, fn: (i: HTMLInputElement) => void) => {
        const div = createDiv(html)
        fn(div.querySelector('input')!)
        return { type: 'custom', element: div }
      }
      
      menu.addItem({
        icon: 'iconFullscreen',
        label: i18n?.width || '宽度',
        type: 'submenu',
        submenu: [
          el(`<input class="b3-text-field" type="number" value="${percent}" style="width:100%;margin:2px 0">`, i => i.onkeydown = e => e.key === 'Enter' && apply(+i.value)),
          { type: 'custom', element: Object.assign(createDiv([25, 33, 50, 67, 75, 100].map(v => `<div style="padding:2px 0;cursor:pointer;font-size:14px" data-value="${v}">${v}%</div>`).join('')), { onclick: (e: Event) => apply(+((e.target as HTMLElement).dataset.value || 0)) }) },
          el(`<input class="b3-slider" type="range" min="5" max="100" value="${percent}" style="width:100%;margin:2px 0">`, s => (s.oninput = () => (block as HTMLElement).style.setProperty('--epub-width', calc(+s.value)), s.onchange = () => apply(+s.value)))
        ]
      })
    }
  }
  
  const renderListener = () => setTimeout(renderAllEpubBlocks, 200)
  
  plugin.eventBus.on('click-blockicon', blockMenuListener)
  plugin.eventBus.on('click-editortitleicon', titleMenuListener)
  plugin.eventBus.on('loaded-protyle-static', renderListener)
  
  return () => {
    plugin.eventBus.off('click-blockicon', blockMenuListener)
    plugin.eventBus.off('click-editortitleicon', titleMenuListener)
    plugin.eventBus.off('loaded-protyle-static', renderListener)
  }
}

// ==================== 视图控制 ====================
const destroyReader = (id: string) => (activeRenditions.get(id)?.rendition.destroy?.(), activeRenditions.delete(id), cleanupProgress(id), loadingReaders.delete(id))
export const setView = async (id: string, view: string) => {
  const block = getBlock(id)
  if (!block) return
  destroyReader(id), block.querySelector('.epub-embedded-reader')?.remove()
  await API.setBlockAttrs(id, { 'custom-epub-view': view })
  applyEpubStyle(block as HTMLElement, await API.getBlockAttrs(id))
}

// ==================== 进度管理 ====================
const updateProgress = (container: HTMLElement, progress: number) => ((fill, text) => fill && (fill.style.width = text, fill.setAttribute('aria-label', text)))(container.querySelector('.epub-progress-fill') as HTMLElement, `${progress.toFixed(1)}%`)

const saveProgress = async (blockId: string, cfi: string, progress: number, force = false) => {
  const saver = progressSavers.get(blockId)
  if (!force && saver?.lastCfi === cfi && saver?.lastProgress === progress) return
  const save = () => API.setBlockAttrs(blockId, { 'custom-epub-cfi': cfi, 'custom-epub-progress': progress.toFixed(3), 'custom-epub-last-read': new Date().toISOString() }).then(() => (progressSavers.delete(blockId), refreshEpubBlock(blockId)))
  force ? await save() : progressSavers.set(blockId, { timer: window.setTimeout(save, 2000), lastProgress: progress, lastCfi: cfi })
}
const cleanupProgress = (id: string) => (clearTimeout(progressSavers.get(id)?.timer), progressSavers.delete(id))
export const cleanupAllProgressSavers = () => progressSavers.forEach((_, id) => cleanupProgress(id))

// ==================== 点击处理 ====================
const handleEpubClick = async (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (target.closest('.epub-toolbar, .toolbar-btn')) return
  const block = target.closest('[custom-epub-view]:not([custom-epub-view=""]):not([custom-epub-view="default"])')
  if (!block) return
  const [view, url, id] = [block.getAttribute('custom-epub-view'), block.getAttribute('custom-epub-url'), block.getAttribute('data-node-id')]
  if (!url || !id) return
  e.preventDefault(), e.stopPropagation()
  view === 'reader' ? await loadEmbeddedReader(block, url) : await openEpubTab(url, id)
}


const loadEmbeddedReader = async (block: Element, url: string) => {
  const blockId = block.getAttribute('data-node-id')
  if (!blockId || loadingReaders.has(blockId)) return
  
  destroyReader(blockId), block.querySelector('.epub-embedded-reader')?.remove(), loadingReaders.add(blockId)
  try {
    const overlay = Object.assign(document.createElement('div'), { className: 'epub-embedded-reader', innerHTML: `<div class="epub-reader-loading"><div class="loading-spinner"></div><div>${pluginInstance.i18n?.loading || '加载中...'}</div></div>` })
    const w = (block as HTMLElement).style.getPropertyValue('--epub-width') || block.getAttribute('custom-epub-width')
    w && overlay.style.setProperty('--epub-width', w)
    block.appendChild(overlay)
    
    const file = await fetchEpub(url)
    const size = block.getAttribute('custom-epub-size') || ''
    
    overlay.innerHTML = `
      <div class="epub-embedded-container ${size ? `epub-size-${size}` : ''}">
        <div class="epub-embedded-viewer"></div>
        <div class="epub-progress-fill b3-tooltips b3-tooltips__n" aria-label="0%"></div>
        <div class="epub-toolbar">
          <button class="toolbar-btn b3-tooltips b3-tooltips__n" data-action="prev" aria-label="上一页"><svg><use xlink:href="#iconLeft"></use></svg></button>
          <button class="toolbar-btn b3-tooltips b3-tooltips__n" data-action="next" aria-label="下一页"><svg><use xlink:href="#iconRight"></use></svg></button>
          <button class="toolbar-btn b3-tooltips b3-tooltips__n" data-action="close" aria-label="关闭"><svg><use xlink:href="#iconClose"></use></svg></button>
        </div>
      </div>
    `
    
    const container = overlay.querySelector('.epub-embedded-container') as HTMLElement
    const viewer = container.querySelector('.epub-embedded-viewer') as HTMLElement
    const book: Book = ePub(await file.arrayBuffer())
    await book.ready
    
    const rendition: Rendition = book.renderTo(viewer, { width: '100%', height: '100%', flow: 'paginated' })
    const savedCfi = block.getAttribute('custom-epub-cfi')
    const savedProgress = parseFloat(block.getAttribute('custom-epub-progress') || '0')
    await (savedCfi ? rendition.display(savedCfi) : rendition.display())
    
    book.locations.generate(1024).catch(() => {})
    activeRenditions.set(blockId, { rendition, book })
    const saver = progressSavers.get(blockId)
    if (saver) saver.lastProgress = savedProgress
    
    let isInit = true
    setTimeout(() => isInit = false, 1000)
    rendition.on('relocated', (loc: any) => {
      if (isInit) return
      const prog = calcPercent(loc, book) * 100
      saveProgress(blockId, loc.start.cfi, prog)
      updateProgress(container, prog)
    })
    
    const actions: Record<string, () => void> = {
      prev: () => rendition.prev(),
      next: () => rendition.next(),
      close: async () => ((loc) => loc?.start && saveProgress(blockId, loc.start.cfi, calcPercent(loc, book) * 100, true))(rendition.currentLocation() as any).then(() => (destroyReader(blockId), overlay.remove(), API.getBlockAttrs(blockId).then(attrs => applyEpubStyle(block as HTMLElement, attrs))))
    }
    const handleAction = (action: string) => (e: Event) => (e.stopPropagation(), e.preventDefault(), actions[action]?.())
    container.querySelectorAll('.toolbar-btn').forEach(btn => (btn as HTMLElement).dataset.action && btn.addEventListener('click', (e) => handleAction((btn as HTMLElement).dataset.action!)(e), true))
    
    rendition.on('click', (event: any) => ((rect, x) => x < rect.width / 2 ? rendition.prev() : rendition.next())(viewer.getBoundingClientRect(), (event.clientX || event.pageX) - viewer.getBoundingClientRect().left))
    const keyMap: Record<string, string> = { ArrowLeft: 'prev', ArrowRight: 'next', Escape: 'close' }
    viewer.setAttribute('tabindex', '0'), viewer.addEventListener('keydown', (e) => keyMap[e.key] && handleAction(keyMap[e.key])(e)), viewer.focus()
    loadingReaders.delete(blockId)
  } catch (e) {
    showMessage('加载失败', 2000, 'error')
    loadingReaders.delete(blockId)
  }
}

// ==================== 批量渲染 ====================
export async function renderAllEpubBlocks() {
  for (const block of document.querySelectorAll('[custom-epub][custom-epub-view]:not([custom-epub-view=""]):not([custom-epub-view="default"])')) {
    applyEpubStyle(block as HTMLElement, await API.getBlockAttrs(block.getAttribute('data-node-id')!))
  }
  if (!clickHandlerAdded) document.addEventListener('click', handleEpubClick, true), clickHandlerAdded = true
}

// ==================== 导出接口 ====================
export const refreshEpubBlock = async (blockId: string) => {
  const block = getBlock(blockId)
  if (block) applyEpubStyle(block as HTMLElement, await API.getBlockAttrs(blockId))
}

export const addEpubToBlock = async (blockId: string, url: string) => {
  const block = getBlock(blockId)
  if (block) {
    await saveMetadata(blockId, url)
    await setView(blockId, 'card')
  }
}
