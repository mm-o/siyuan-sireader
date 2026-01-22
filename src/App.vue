<template>
  <div class="plugin-app-main">
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { createApp, type Component } from 'vue'
import { MotionPlugin } from '@vueuse/motion'
import { openTab, showMessage } from 'siyuan'
import { usePlugin, setOpenSettingHandler, registerCleanup } from '@/main'
import { useSetting } from '@/composables/useSetting'
import { useStats } from '@/composables/useStats'
import { bookSourceManager } from '@/core/book'
import { isMobile } from '@/core/mobile'
import Settings from '@/components/Settings.vue'
import Reader from '@/components/Reader.vue'

const plugin = usePlugin()
const { settings, isLoaded } = useSetting(plugin)

let settingsApp: any = null
let mobileReaderApp: any = null

const openSetting = () => document.querySelector<HTMLElement>(`.dock__item[data-title="${plugin.i18n?.name || '思阅'}"]`)?.click()

// ===== 阅读器核心 =====
const FORMATS = ['.epub', '.pdf', '.mobi', '.azw3', '.azw', '.fb2', '.cbz', '.txt']

const fetchFile = async (url: string) => {
  try {
    const res = await fetch(url[0] === '/' || url.startsWith('http') ? url : `/${url}`)
    return res.ok ? new File([await res.blob()], url.split('/').pop()?.split('?')[0] || 'book') : null
  } catch { return null }
}

const mountReader = async (el: HTMLElement, props: any) => {
  if (!isLoaded.value) await new Promise(resolve => { const check = () => isLoaded.value ? resolve(true) : setTimeout(check, 50); check() })
  await new Promise(resolve => requestAnimationFrame(() => resolve(true)))
  const { toRaw } = await import('vue')
  const currentSettings = JSON.parse(JSON.stringify(toRaw(settings.value)))
  const app = createApp(Reader as Component, { ...props, plugin, settings: currentSettings, i18n: plugin.i18n })
  app.mount(el)
  return app
}

// 暴露渲染接口供其他插件调用
;(window as any).sireader = {
  mountReader: async (el: HTMLElement, props: any) => await mountReader(el, props),
  openEpubTab: (file: File, title?: string) => openTab({
    app: (plugin as any).app,
    custom: {
      icon: 'siyuan-reader-icon',
      title: title || file.name.replace(/\.[^.]+$/, ''),
      data: { file },
      id: `${plugin.name}epub_reader`
    }
  }),
  openOnlineTab: (bookInfo: any) => openTab({
    app: (plugin as any).app,
    custom: {
      icon: 'siyuan-reader-icon',
      title: bookInfo.name || '在线阅读',
      data: { bookInfo },
      id: `${plugin.name}custom_tab_online_reader`
    }
  })
}

// 注册标签页
plugin.addTab({
  type: 'epub_reader',
  async init() {
    const { url, blockId, file } = this.data
    const f = file?.arrayBuffer ? file : url && await fetchFile(url)
    if (!f) return this.element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--b3-theme-error)">加载失败</div>'
    ;(this as any)._app = await mountReader(this.element, { file: f, url, blockId })
  },
  destroy() { ;(this as any)._app?.unmount() }
})

plugin.addTab({
  type: 'custom_tab_online_reader',
  async init() {
    const { bookInfo } = this.data
    if (!bookInfo) return this.element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--b3-theme-error)">加载失败</div>'
    ;(this as any)._app = await mountReader(this.element, { bookInfo })
  },
  destroy() { ;(this as any)._app?.unmount() }
})

// 链接打开书籍
const handleEbookLink = async (e: MouseEvent) => {
  const link = (e.target as HTMLElement).closest('a[href], [data-href], span[data-type="a"]') as HTMLElement
  const url = link?.getAttribute('data-href') || link?.getAttribute('href')
  if (!url) return
  
  // 处理自定义协议 sireader://
  const parsed = (await import('@/composables/useSetting')).parseBookLink(url)
  if (parsed) {
    e.preventDefault(), e.stopPropagation()
    if (!parsed.bookUrl) return showMessage('无效的书籍链接', 3000, 'error')
    const { bookshelfManager } = await import('@/core/bookshelf')
    await bookshelfManager.init()
    // 先尝试精确匹配
    let book = await bookshelfManager.getBook(parsed.bookUrl)
    // 如果找不到，尝试模糊匹配（忽略文件大小）
    if (!book) {
      const books = bookshelfManager.getBooks()
      const fileName = parsed.bookUrl.split('://')[1]
      book = books.find(b => b.bookUrl.startsWith(parsed.bookUrl.split('://')[0] + '://') && b.bookUrl.includes(fileName.split('_')[0]))
    }
    if (!book) return showMessage('书籍不存在', 3000, 'error')
    // 查找已打开的标签页
    const tab = Array.from(document.querySelectorAll('.layout-tab-bar .item')).find(t => (t.getAttribute('data-title') || t.querySelector('.item__text')?.textContent) === book.name)
    if (tab) return (tab as HTMLElement).click(), requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('sireader:goto', { detail: { cfi: parsed.cfi, id: parsed.id } })))
    return openTab({ app: (plugin as any).app, custom: { icon: 'siyuan-reader-icon', title: book.name, data: { bookInfo: { ...book, epubCfi: parsed.cfi } }, id: `${plugin.name}custom_tab_online_reader` }, position: { rightTab: 'right', bottomTab: 'bottom' }[settings.value.openMode] })
  }
  
  // 处理普通文件链接
  if (!FORMATS.some(ext => url.toLowerCase().endsWith(ext))) return
  e.preventDefault()
  e.stopPropagation()
  const file = await fetchFile(url.split('#')[0])
  if (!file) return
  openTab({
    app: (plugin as any).app,
    custom: {
      icon: 'siyuan-reader-icon',
      title: file.name.replace(/\.[^.]+$/, ''),
      data: { file, url: url.split('#')[0], blockId: link.closest('[data-node-id]')?.getAttribute('data-node-id') },
      id: `${plugin.name}epub_reader`
    },
    position: { rightTab: 'right', bottomTab: 'bottom' }[settings.value.openMode]
  })
}

setOpenSettingHandler(openSetting)

const iconId = 'siyuan-reader-icon'
plugin.addIcons(`
  <symbol id="${iconId}" viewBox="0 0 1696 1536">
    <path d="M1671 350q40 57 18 129l-275 906q-19 64-76.5 107.5T1215 1536H292q-77 0-148.5-53.5T44 1351q-24-67-2-127q0-4 3-27t4-37q1-8-3-21.5t-3-19.5q2-11 8-21t16.5-23.5T84 1051q23-38 45-91.5t30-91.5q3-10 .5-30t-.5-28q3-11 17-28t17-23q21-36 42-92t25-90q1-9-2.5-32t.5-28q4-13 22-30.5t22-22.5q19-26 42.5-84.5T372 283q1-8-3-25.5t-2-26.5q2-8 9-18t18-23t17-21q8-12 16.5-30.5t15-35t16-36t19.5-32T504.5 12t36-11.5T588 6l-1 3q38-9 51-9h761q74 0 114 56t18 130l-274 906q-36 119-71.5 153.5T1057 1280H188q-27 0-38 15q-11 16-1 43q24 70 144 70h923q29 0 56-15.5t35-41.5l300-987q7-22 5-57q38 15 59 43m-1064 2q-4 13 2 22.5t20 9.5h608q13 0 25.5-9.5T1279 352l21-64q4-13-2-22.5t-20-9.5H670q-13 0-25.5 9.5T628 288zm-83 256q-4 13 2 22.5t20 9.5h608q13 0 25.5-9.5T1196 608l21-64q4-13-2-22.5t-20-9.5H587q-13 0-25.5 9.5T545 544z"/>
  </symbol>
  <symbol id="lucide-library-big" viewBox="0 0 24 24">
    <rect width="8" height="18" x="3" y="3" rx="1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7 3v18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-book-search" viewBox="0 0 24 24">
    <path d="M11 22H5.5a1 1 0 0 1 0-5h4.501" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m21 22-1.879-1.878" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 19.5v-15A2.5 2.5 0 0 1 5.5 2H18a1 1 0 0 1 1 1v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="17" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-settings-2" viewBox="0 0 24 24">
    <path d="M14 17H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19 7h-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="17" cy="17" r="3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="7" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-paintbrush-vertical" viewBox="0 0 24 24">
    <path d="M10 2v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 2v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17 2a1 1 0 0 1 1 1v9H6V3a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6 12a1 1 0 0 0-1 1v1a2 2 0 0 0 2 2h2a1 1 0 0 1 1 1v2.9a2 2 0 1 0 4 0V17a1 1 0 0 1 1-1h2a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-scroll-text" viewBox="0 0 24 24">
    <path d="M15 12h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M15 8h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19 17V5a2 2 0 0 0-2-2H4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-map-pin-check" viewBox="0 0 24 24">
    <path d="M19.43 12.935c.357-.967.57-1.955.57-2.935a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32.197 32.197 0 0 0 .813-.728" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m16 18 2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-paint-bucket" viewBox="0 0 24 24">
    <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m5 2 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2 13h15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-map-pin-pen" viewBox="0 0 24 24">
    <path d="M17.97 9.304A8 8 0 0 0 2 10c0 4.69 4.887 9.562 7.022 11.468" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="10" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-wallet-cards" viewBox="0 0 24 24">
    <rect width="18" height="18" x="3" y="3" rx="2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 11h3c.8 0 1.6.3 2.1.9l1.1.9c1.6 1.6 4.1 1.6 5.7 0l1.1-.9c.5-.5 1.3-.9 2.1-.9H21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-panel-top-close" viewBox="0 0 24 24">
    <rect width="18" height="18" x="3" y="3" rx="2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 9h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m9 16 3-3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-panel-top-open" viewBox="0 0 24 24">
    <rect width="18" height="18" x="3" y="3" rx="2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 9h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m15 14-3 3-3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-zoom-in" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m21 21-4.35-4.35" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M11 8v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 11h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-zoom-out" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m21 21-4.35-4.35" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 11h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-rotate-ccw-square" viewBox="0 0 24 24">
    <path d="M20 9V7a2 2 0 0 0-2-2h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m15 2-3 3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-rotate-cw-square" viewBox="0 0 24 24">
    <path d="M12 5H6a2 2 0 0 0-2 2v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m9 8 3-3-3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-square-mouse-pointer" viewBox="0 0 24 24">
    <path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-hand" viewBox="0 0 24 24">
    <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-brush" viewBox="0 0 24 24">
    <path d="m11 10 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-eraser" viewBox="0 0 24 24">
    <path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m5.082 11.09 8.828 8.828" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-undo-2" viewBox="0 0 24 24">
    <path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-brush-cleaning" viewBox="0 0 24 24">
    <path d="m16 22-1-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m8 22 1-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-pocket" viewBox="0 0 24 24">
    <path d="M4 3h16a2 2 0 0 1 2 2v6a10 10 0 0 1-10 10A10 10 0 0 1 2 11V5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="iconShapes" viewBox="0 0 24 24">
    <path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="17.5" cy="17.5" r="3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="iconSquareDashed" viewBox="0 0 24 24">
    <path d="M5 3a2 2 0 0 0-2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19 3a2 2 0 0 1 2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 19a2 2 0 0 1-2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5 21a2 2 0 0 1-2-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9 3h1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9 21h1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 3h1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 21h1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 9v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 9v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 14v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 14v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="iconCircleDashed" viewBox="0 0 24 24">
    <path d="M10.1 2.182a10 10 0 0 1 3.8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.9 21.818a10 10 0 0 1-3.8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17.609 3.721a10 10 0 0 1 2.69 2.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2.182 13.9a10 10 0 0 1 0-3.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20.279 17.609a10 10 0 0 1-2.7 2.69" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21.818 10.1a10 10 0 0 1 0 3.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3.721 6.391a10 10 0 0 1 2.7-2.69" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.391 20.279a10 10 0 0 1-2.69-2.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="iconTriangleDashed" viewBox="0 0 24 24">
    <path d="M10.17 4.193a2 2 0 0 1 3.666.013" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 21h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m15.874 7.743 1 1.732" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m18.849 12.952 1 1.732" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21.824 18.18a2 2 0 0 1-1.835 2.824" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4.024 21a2 2 0 0 1-1.839-2.839" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m5.136 12.952-1 1.732" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 21h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m8.102 7.743-1 1.732" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m8 10 4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-arrow-down-0-1" viewBox="0 0 24 24">
    <path d="m3 16 4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7 20V4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="15" y="4" width="4" height="6" ry="2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17 20v-6h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M15 20h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-arrow-up-1-0" viewBox="0 0 24 24">
    <path d="m3 8 4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7 4v16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17 10V4h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M15 10h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="15" y="14" width="4" height="6" ry="2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-sliders-horizontal" viewBox="0 0 24 24">
    <path d="M10 5H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 19H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 3v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M16 17v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 12h-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 19h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 5h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 10v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 12H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-clock-plus" viewBox="0 0 24 24">
    <path d="M12 6v6l3.644 1.822" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M16 19h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19 16v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21.92 13.267a10 10 0 1 0-8.653 8.653" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-panels-top-left" viewBox="0 0 24 24">
    <rect width="18" height="18" x="3" y="3" rx="2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 9h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9 21V9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-list-restart" viewBox="0 0 24 24">
    <path d="M21 5H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7 12H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7 19H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 18a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L11 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M11 10v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-book-plus" viewBox="0 0 24 24">
    <path d="M12 7v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9 10h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-book-text" viewBox="0 0 24 24">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m8 13 4-7 4 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9.1 11h5.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-eye" viewBox="0 0 24 24">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-eye-off" viewBox="0 0 24 24">
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m2 2 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-trash-2" viewBox="0 0 24 24">
    <path d="M3 6h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-refresh-cw" viewBox="0 0 24 24">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 3v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M16 21h5v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-x" viewBox="0 0 24 24">
    <path d="M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m6 6 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="lucide-check" viewBox="0 0 24 24">
    <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="iconScroll" viewBox="0 0 32 32">
    <path d="M4 6h24v2H4zm0 6h24v2H4zm0 6h24v2H4zm0 6h24v2H4z"/>
  </symbol>
`)

plugin.addDock({
  type: 'SiyuanReaderDock',
  config: { 
    position: 'RightTop', 
    size: { width: 680, height: 580 }, 
    icon: iconId, 
    title: plugin.i18n?.name || '思阅' 
  },
  data: { plugin },
  init() {
    const container = document.createElement('div')
    container.className = 'sireader-dock-content'
    container.style.cssText = 'width:100%;height:100%;overflow:auto'
    this.element.appendChild(container)
    
    // 挂载设置组件
    const i18n = (this.data.plugin as typeof plugin).i18n
    settingsApp = createApp(Settings, {
      modelValue: settings.value,
      i18n,
      onSave: async () => {
        const cfg = await plugin.loadData('config.json') || {}
        const raw = JSON.parse(JSON.stringify(settings.value))
        cfg.settings = raw
        await plugin.saveData('config.json', cfg)
        window.dispatchEvent(new CustomEvent('sireaderSettingsUpdated', { detail: raw }))
      },
      'onUpdate:modelValue': (v: any) => { settings.value = v }
    })
    settingsApp.use(MotionPlugin)
    settingsApp.mount(container)
  },
  resize() {},
  destroy() {
    settingsApp?.unmount()
    settingsApp = null
  }
})

plugin.addTopBar({ icon: `<svg><use xlink:href="#${iconId}"/></svg>`, title: '思阅', callback: openSetting })

// 暂时停用底部右下角的阅读统计功能
// useStats(plugin).init()

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
  
  const { toRaw } = await import('vue')
  mobileReaderApp = createApp(Reader as Component, {
    bookInfo: book,
    plugin,
    settings: JSON.parse(JSON.stringify(toRaw(settings.value))),
    i18n: plugin.i18n
  })
  mobileReaderApp.mount(container)
}

const handleMobileReaderClose = () => {
  mobileReaderApp?.unmount()
  mobileReaderApp = null
  document.getElementById('sireader-mobile-container')?.style.setProperty('display', 'none')
}

onMounted(async () => {
  await bookSourceManager.loadSources()
  window.addEventListener('click', handleEbookLink, true)
  registerCleanup(() => window.removeEventListener('click', handleEbookLink, true))
  
  if (isMobile()) {
    window.addEventListener('reader:open', handleMobileReaderOpen as any)
    window.addEventListener('reader:close', handleMobileReaderClose)
    registerCleanup(() => {
      window.removeEventListener('reader:open', handleMobileReaderOpen as any)
      window.removeEventListener('reader:close', handleMobileReaderClose)
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

<style>
/* Lucide Icons */
.lucide { width: 1em; height: 1em; }
</style>
