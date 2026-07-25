<template>
  <div class="plugin-app-main">
    <Stats :visible="showStats" @close="showStats=false" @open="handleOpenBook" />
    <TTSMini />
  </div>
</template>

<script setup lang="ts">
import { computed, createApp, defineComponent, h, onMounted, onUnmounted, provide, ref, toRaw, watch, type Component } from 'vue'
import { MotionPlugin } from '@vueuse/motion'
import { showMessage } from 'siyuan'
import { usePlugin, setOpenSettingHandler, registerCleanup } from '@/main'
import { useSetting, settingsManager, parseBookLink, DEFAULT_NAV_ITEMS } from '@/composables/useSetting'
import { useStats } from '@/composables/useStats'
import { READER_ICON_ID } from '@/utils/icon'
import { isMobile } from '@/utils/mobile'
import { useReaderState } from '@/core/epub/state'
import { listPageScripts, registerPageScript, setPageScriptEnabled, unregisterPageScript } from '@/core/pageScripts'
import DockShell from '@/components/ui/DockShell.vue'
import BookSearch from '@/components/BookSearch.vue'
import BookShelf from '@/components/BookShelf.vue'
import OnlineReader from '@/components/OnlineReader.vue'
import ReaderToc from '@/components/ReaderToc.vue'
import ReaderMarks from '@/components/ReaderMarks.vue'
import Settings from '@/components/Settings.vue'
import Stats from '@/components/Stats.vue'
import TTSMini from '@/components/TTSMini.vue'
import { getTTSController } from '@/services/TTSPlayer'
import { isWereadReaderUrl, normalizeWereadReaderUrl, openWereadReaderLink, registerWeread } from '@/weread/open'
import { normalizeSiyuanCloudUrl } from '@/core/bookStore'

const plugin = usePlugin()
const { settings, isLoaded } = useSetting(plugin)
const showStats = ref(false)

let settingsApp: any = null
let mobileReaderApp: any = null
const cloneSettings = () => JSON.parse(JSON.stringify(toRaw(settings.value)))
const waitForSettings = async () => {
  if (isLoaded.value) return
  await new Promise(r => { const check = () => isLoaded.value ? r(true) : setTimeout(check, 50); check() })
}

const SettingsDock = defineComponent({
  props: ['modelValue', 'i18n', 'onSave', 'onUpdate:modelValue'],
  setup(props: any) {
    const { canShowToc } = useReaderState()
    const activeTab = ref('bookshelf')
    const model = ref(props.modelValue)
    const navItems = computed(() => (model.value.navItems?.length ? model.value.navItems : DEFAULT_NAV_ITEMS).filter((item: any) => !['dictionary', 'weread'].includes(item.id)).sort((a: any, b: any) => a.order - b.order))
    const tabs = computed(() => navItems.value.filter((item: any) => item.enabled && (item.id !== 'toc' || canShowToc.value)).map((item: any) => ({ id: item.id, icon: item.icon, tip: props.i18n?.[item.tip] || item.tip })))
    const tooltipDir = computed(() => ({ left: 'e', right: 'w', top: 's', bottom: 'n' }[model.value.navPosition] || 'n'))
    const handleUpdate = (value: any) => {
      model.value = value
      props['onUpdate:modelValue']?.(value)
    }
    const handleReadOnline = async (book: any) => (await import('@/utils/bookOpen')).openOrActivateBook(plugin, book, model.value)
    const openLicense = () => {
      activeTab.value = 'appearance'
      setTimeout(() => (window as any)._openLicenseContent?.(), 50)
    }
    watch(canShowToc, show => !show && activeTab.value === 'toc' && (activeTab.value = 'bookshelf'), { immediate: true })
    watch(tabs, list => list.length && !list.some((t: any) => t.id === activeTab.value) && (activeTab.value = list[0].id), { immediate: true })
    onMounted(() => { ;(window as any)._openLicense = openLicense })
    onUnmounted(() => { if ((window as any)._openLicense === openLicense) delete (window as any)._openLicense })
    return () => h(
      DockShell,
      {
        activeTab: activeTab.value,
        navPosition: model.value.navPosition,
        tooltipDir: tooltipDir.value,
        tabs: tabs.value,
        'onUpdate:activeTab': (tab: string) => { activeTab.value = tab },
      },
      {
        default: () => [
          h(Settings, {
            modelValue: model.value,
            i18n: props.i18n,
            onSave: props.onSave,
            'onUpdate:modelValue': handleUpdate,
            style: { display: activeTab.value === 'appearance' ? '' : 'none' },
          }),
          h(BookSearch, {
            i18n: props.i18n,
            style: { display: activeTab.value === 'search' ? '' : 'none' },
          }),
          h(BookShelf, {
            i18n: props.i18n,
            coverSize: model.value.bookshelfCoverSize,
            hiddenItems: model.value.bookshelfHiddenItems,
            openDocAssets: model.value.openDocAssets,
            onRead: handleReadOnline,
            style: { display: activeTab.value === 'bookshelf' ? '' : 'none' },
          }),
          activeTab.value === 'toc'
            ? h(ReaderToc, { mode: 'toc', i18n: props.i18n })
            : null,
          activeTab.value === 'mark'
            ? h(ReaderMarks, { i18n: props.i18n })
            : null,
        ],
      },
    )
  },
})

const DOCK_TYPE = 'reader'
const DOCK_ID = `${plugin.name}${DOCK_TYPE}`
const { openWereadTab, topBar: wereadTopBar } = registerWeread(plugin)
watch(() => settings.value.showWereadTopBar, show => wereadTopBar.style.display = show === false ? 'none' : '', { immediate: true })

// 打开设置并展开授权
const openSetting = (openLicense = false) => {
  const btn = document.querySelector<HTMLElement>(`.dock__item[data-type="${DOCK_ID}"]`)
  if (!btn?.classList.contains('dock__item--active')) btn?.click()
  if (openLicense) setTimeout(() => (window as any)._openLicense?.(), 100)
}

// ===== 阅读器核心 =====
const BOOK_RE = /\.(epub|pdf|mobi|azw3|azw|fb2|cbz|txt)(?:[?#].*)?$/i
let docAssetExcludePattern = '', docAssetExcludeRegex: RegExp | null = null
const decodeLink = (value = '') => { try { return decodeURIComponent(value) } catch { return value } }
const shouldAddDocAssetToShelf = (url: string, pattern = '') => {
  pattern = pattern.trim()
  if (pattern !== docAssetExcludePattern) {
    docAssetExcludePattern = pattern
    try { docAssetExcludeRegex = pattern ? new RegExp(pattern) : null } catch { docAssetExcludeRegex = null }
  }
  const name = decodeLink(url.split(/[?#]/)[0].split('/').pop() || '')
  return !docAssetExcludeRegex || (!docAssetExcludeRegex.test(decodeLink(url)) && !docAssetExcludeRegex.test(name))
}
const fetchFile = async (url: string) => {
  try {
    const res = await fetch(url[0] === '/' || url.startsWith('http') ? url : `/${url}`)
    return res.ok ? new File([await res.blob()], url.split('/').pop()?.split('?')[0] || 'book') : null
  } catch { return null }
}

const createReaderApp = async (props: any) => {
  const { default: Reader } = await import('@/components/Reader.vue')
  return createApp(Reader as Component, { ...props, plugin, settings: cloneSettings(), i18n: plugin.i18n })
}

const mountReader = async (el: HTMLElement, props: any) => {
  await waitForSettings()
  const app = await createReaderApp(props)
  const vm = app.mount(el) as any
  ;(app as any).resize = () => vm?.resize?.()
  return app
}

// 暴露渲染接口供其他插件调用
;(window as any).sireader = {
  mountReader: async (el: HTMLElement, props: any) => await mountReader(el, props),
  openEpubTab: async (file: File, title?: string) => (await import('@/utils/bookOpen')).openReaderTab(plugin, title || file.name.replace(/\.[^.]+$/, ''), { file }, `${plugin.name}epub_reader`),
  registerPageScript,
  unregisterPageScript,
  listPageScripts,
  setPageScriptEnabled,
}
window.dispatchEvent(new CustomEvent('sireader:api-ready', { detail: (window as any).sireader }))

// 注册标签页
plugin.addTab({
  type: 'epub_reader',
  async init() {
    const { url, blockId, file } = this.data
    if (!file && !url) return this.element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--b3-theme-error)">加载失败</div>'
    ;(this as any)._app = await mountReader(this.element, { file, url, blockId })
  },
  resize() { ;(this as any)._app?.resize?.() },
  destroy() { ;(this as any)._app?.unmount() }
})

plugin.addTab({
  type: 'custom_tab_book_reader',
  async init() {
    const { bookInfo } = this.data
    if (!bookInfo) return this.element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--b3-theme-error)">加载失败</div>'
    ;(this as any)._app = await mountReader(this.element, { bookInfo })
  },
  resize() { ;(this as any)._app?.resize?.() },
  destroy() { ;(this as any)._app?.unmount() }
})

plugin.addTab({
  type: 'online_reader',
  init() {
    const { url, bookInfo, context } = this.data
    if (!url) return this.element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--b3-theme-error)">加载失败</div>'
    this.element.innerHTML = ''
    ;(this as any)._app = createApp(OnlineReader as Component, {
      url,
      title: bookInfo?.title || '在线阅读',
      context,
      mountReader,
    })
    ;(this as any)._app.mount(this.element)
  },
  resize() { ;(this as any)._app?.resize?.() },
  destroy() { ;(this as any)._app?.unmount?.() }
})

// 链接打开书籍
const getLinkTarget = (target: EventTarget | null) => {
  const link = (target as HTMLElement | null)?.closest?.('a[href], [data-href], [data-url], span[data-type="a"]') as HTMLElement | null
  const url = link?.getAttribute('data-href') || link?.getAttribute('href') || link?.getAttribute('data-url') || ''
  return { link, url }
}

const handleEbookLink = async (e: MouseEvent) => {
  const { link, url } = getLinkTarget(e.target)
  if (!url) return
  
  // 处理自定义协议 sireader://
  const parsed = parseBookLink(url)
  if (parsed) {
    e.preventDefault(), e.stopPropagation()
    if (!parsed.bookUrl) return showMessage('无效的书籍链接', 3000, 'error')
    if (await openWereadReaderLink(plugin, settings.value, parsed.bookUrl, parsed.cfi, parsed.id)) return
    const { bookshelfManager } = await import('@/core/bookshelf')
    const { openOrActivateBook } = await import('@/utils/bookOpen')
    const book = await bookshelfManager.getBook(parsed.bookUrl)
    if (!book) return showMessage('书籍不存在', 3000, 'error')
    return openOrActivateBook(plugin, book, settings.value, () =>
      window.dispatchEvent(new CustomEvent('sireader:goto', { detail: { cfi: parsed.cfi, id: parsed.id, bookUrl: book.url } }))
    )
  }

  const wereadBookUrl = normalizeWereadReaderUrl(url)
  if (wereadBookUrl) {
    e.preventDefault(), e.stopPropagation()
    return openWereadReaderLink(plugin, settings.value, wereadBookUrl, url)
  }
  
  const cleanUrl = url.split('#')[0]
  if (!BOOK_RE.test(cleanUrl)) return
  
  // 处理文档内 assets 链接
  if (url.startsWith('assets/') || url.includes('/assets/')) {
    if (!settings.value.openDocAssets) return // 设置关闭时不处理
    e.preventDefault(), e.stopPropagation()
    const file = await fetchFile(cleanUrl)
    if (!file) return showMessage('文件不存在', 3000, 'error')
    const { openReaderTab, getOrAddAssetBook, openOrActivateBook } = await import('@/utils/bookOpen')
    if (!shouldAddDocAssetToShelf(url, settings.value.docAssetExcludeRegex)) {
      const title = file.name.replace(/\.[^.]+$/, '') || 'Reader'
      return openReaderTab(plugin, title, { file, bookInfo: { title, url: `asset://${url}`, temporary: true } }, `${plugin.name}epub_reader`, settings.value)
    }
    const { bookshelfManager } = await import('@/core/bookshelf')
    const book = await getOrAddAssetBook(bookshelfManager, url, file)
    if (!book) return showMessage('添加失败', 3000, 'error')
    return openOrActivateBook(plugin, book, settings.value)
  }
  
  // 普通文件链接
  e.preventDefault(), e.stopPropagation()
  const { bookshelfManager } = await import('@/core/bookshelf')
  const { openOrActivateBook, openReaderTab } = await import('@/utils/bookOpen')
  const readUrl = normalizeSiyuanCloudUrl(cleanUrl)
  const blockId = link.closest('[data-node-id]')?.getAttribute('data-node-id')
  const existing = await bookshelfManager.getBook(readUrl)
  const addedUrl = existing ? readUrl : await bookshelfManager.addUrlBook(readUrl).catch(() => '')
  const book = existing || (addedUrl ? await bookshelfManager.getBook(addedUrl) : null)
  if (book) return openOrActivateBook(plugin, book, settings.value)
  const name = readUrl.split('/').pop()?.split('?')[0] || ''
  const title = (decodeURIComponent(name).replace(/\.[^.]+$/, '') || 'Reader')
  openReaderTab(plugin, title, { url: readUrl, blockId }, `${plugin.name}epub_reader`, settings.value)
}

const handleEbookLinkEnter = async (e: MouseEvent) => {
  const { link, url } = getLinkTarget(e.target)
  if (!link || !url) return
  const parsed = parseBookLink(url)
  if (!parsed?.bookUrl || isWereadReaderUrl(parsed.cfi || parsed.bookUrl)) return
  e.stopPropagation()
  const { showLinkedMarkPreview } = await import('@/utils/markPreview')
  showLinkedMarkPreview(parsed, link)
}

const handleEbookLinkLeave = async (e: MouseEvent) => {
  const { link, url } = getLinkTarget(e.target)
  if (!link || !url || (e.relatedTarget instanceof Node && link.contains(e.relatedTarget))) return
  const parsed = parseBookLink(url)
  if (!parsed) return
  e.stopPropagation()
  const { scheduleHide } = await import('@/utils/markPreview')
  scheduleHide()
}

setOpenSettingHandler(openSetting)

const iconId = READER_ICON_ID
plugin.addDock({
  type: DOCK_TYPE,
  config: { position: 'RightTop', size: { width: 680, height: 580 }, icon: iconId, title: plugin.i18n?.name || '思阅' },
  data: { plugin },
  async init() {
    const container = document.createElement('div')
    container.className = 'sireader-dock-content'
    container.style.cssText = 'width:100%;height:100%;overflow:hidden'
    this.element.appendChild(container)
    if (!isLoaded.value) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--b3-theme-on-surface)">加载中...</div>'
      await waitForSettings()
      container.innerHTML = ''
    }
    settingsApp = createApp(SettingsDock, {
      modelValue: cloneSettings(),
      i18n: (this.data.plugin as typeof plugin).i18n,
      onSave: async () => await settingsManager.save(settings.value),
      'onUpdate:modelValue': (v: any) => settings.value = v
    })
    settingsApp.use(MotionPlugin).mount(container)
  },
  resize() {},
  destroy() { settingsApp?.unmount(); settingsApp = null }
})

plugin.addTopBar({ icon: `<svg><use xlink:href="#${iconId}"/></svg>`, title: '思阅', callback: openSetting })

// 启用底部右下角的阅读统计功能
const statsInstance = useStats(plugin)
statsInstance.init()
provide('stats', statsInstance)
provide('plugin', plugin)

const ttsController = getTTSController()
const ttsBar = document.createElement('div')
ttsBar.className = 'toolbar__item b3-tooltips b3-tooltips__n'
ttsBar.id = 'tts-btn'
ttsBar.innerHTML = '<svg class="toolbar__icon"><use xlink:href="#lucide-volume-2"></use></svg>'
ttsBar.setAttribute('aria-label', '朗读播放')
ttsBar.style.cssText = 'cursor:pointer;display:none'
ttsBar.addEventListener('click', () => window.dispatchEvent(new CustomEvent('tts:toggle-mini')))
plugin.addStatusBar({ element: ttsBar, position: 'right' })
watch([ttsController.isActive, ttsController.paused], ([active, paused]) => {
  ttsBar.style.display = active ? '' : 'none'
  ttsBar.classList.toggle('toolbar__item--active', !!active && !paused)
  ttsBar.setAttribute('aria-label', active ? (paused ? '继续朗读' : '朗读中') : '朗读播放')
}, { immediate: true })

// 处理统计面板切换
const handleStatsToggle = () => showStats.value = !showStats.value
const handleOpenWeread = () => openWereadTab()
const handleOpenOnlineReader = async (e: CustomEvent) => {
  const { title, url, context } = e.detail || {}
  if (!url) return showMessage('在线阅读地址为空', 2000, 'error')
  const { openOnlineReaderTab } = await import('@/utils/bookOpen')
  openOnlineReaderTab(plugin, title || '在线阅读', url, settings.value, undefined, context)
}
const handleOpenBook = async (book: any) => {
  showStats.value = false
  const { openOrActivateBook } = await import('@/utils/bookOpen')
  const { bookshelfManager } = await import('@/core/bookshelf')
  const full = await bookshelfManager.getBook(book.url)
  if (!full) return showMessage('加载失败', 3000, 'error')
  openOrActivateBook(plugin, full, settings.value)
}

// 移动端 Reader 处理
const handleMobileReaderOpen = async (e: CustomEvent) => {
  const { book } = e.detail
  mobileReaderApp?.unmount()
  mobileReaderApp = null
  let container = document.getElementById('sireader-mobile-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'sireader-mobile-container'
    container.style.cssText = 'position:fixed;inset:0;z-index:100;background:var(--b3-theme-background)'
    document.body.appendChild(container)
  }
  container.style.display = 'block'
  mobileReaderApp = await createReaderApp({ bookInfo: book })
  mobileReaderApp.mount(container)
}

const handleMobileReaderClose = () => {
  mobileReaderApp?.unmount()
  mobileReaderApp = null
  document.getElementById('sireader-mobile-container')?.style.setProperty('display', 'none')
}

onMounted(async () => {
  window.addEventListener('click', handleEbookLink, true)
  window.addEventListener('mouseover', handleEbookLinkEnter, true)
  window.addEventListener('mouseout', handleEbookLinkLeave, true)
  window.addEventListener('stats:toggle', handleStatsToggle as any)
  window.addEventListener('sireader:open-weread', handleOpenWeread as any)
  window.addEventListener('sireader:open-online-reader', handleOpenOnlineReader as any)
  registerCleanup(() => {
    window.removeEventListener('click', handleEbookLink, true)
    window.removeEventListener('mouseover', handleEbookLinkEnter, true)
    window.removeEventListener('mouseout', handleEbookLinkLeave, true)
    window.removeEventListener('stats:toggle', handleStatsToggle as any)
    window.removeEventListener('sireader:open-weread', handleOpenWeread as any)
    window.removeEventListener('sireader:open-online-reader', handleOpenOnlineReader as any)
  })
  
  if (isMobile()) {
    window.addEventListener('reader:mobile-open', handleMobileReaderOpen as any)
    window.addEventListener('reader:mobile-close', handleMobileReaderClose)
    registerCleanup(() => {
      window.removeEventListener('reader:mobile-open', handleMobileReaderOpen as any)
      window.removeEventListener('reader:mobile-close', handleMobileReaderClose)
    })
  }
})
</script>

<style lang="scss" scoped>
.plugin-app-main {
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>

