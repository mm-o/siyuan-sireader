<template>
  <div class="sr-online">
    <div class="sr-online__bar">
      <div class="sr-online__title">{{ title || '在线阅读' }}</div>
      <div v-if="status" class="sr-online__status">{{ status }}</div>
      <div class="sr-online__actions">
        <div v-for="item in toolbarItems" :key="item.id" class="sr-online__more">
          <button class="sr-online__btn b3-tooltips b3-tooltips__sw" :class="{ active: toolbarActive(item) }" :aria-label="item.title" @click.stop="openToolbarMenu(item, $event)">
            <svg v-if="item.icon"><use :xlink:href="item.icon"></use></svg><span>{{ item.text || item.title }}</span>
          </button>
        </div>
        <button class="sr-online__btn b3-tooltips b3-tooltips__sw" :class="{ active: mode === 'web' }" aria-label="显示原网页" @click="mode = 'web'">
          <svg><use xlink:href="#lucide-eye"></use></svg><span>网页</span>
        </button>
        <button class="sr-online__btn b3-tooltips b3-tooltips__sw" :class="{ active: mode === 'reader' }" aria-label="转换为阅读模式" :disabled="busy" @click="convert">
          <svg><use xlink:href="#lucide-book-open-text"></use></svg><span>{{ actionText }}</span>
        </button>
      </div>
    </div>
    <div v-show="mode === 'web'" ref="webPaneRef" class="sr-online__pane"></div>
    <div v-show="mode === 'reader'" ref="readerPaneRef" class="sr-online__pane"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Menu, showMessage } from 'siyuan'
import { clearActiveReader, setActiveReader } from '@/core/epub/state'
import {
  createPageBridgeScript,
  getRuntimePageScriptsForUrl,
  loadPageScriptSettings,
  persistPageScriptSettings,
  type PageScript,
  type PageScriptMenuItem,
  type PageScriptToolbarItem,
  wrapPageScript,
} from '@/core/pageScripts'

const props = defineProps<{
  url: string
  title?: string
  context?: any
  mountReader: (el: HTMLElement, props: any) => Promise<any>
}>()

const webPaneRef = ref<HTMLElement>()
const readerPaneRef = ref<HTMLElement>()
const mode = ref<'web' | 'reader'>('web')
const status = ref('')
const busy = ref(false)
const turning = ref<'prev' | 'next' | null>(null)
const toolbarItems = ref<PageScriptToolbarItem[]>([])
const pageState = ref<Record<string, any>>({})

let frame: any = null
let readerApp: any = null
let tabObserver: MutationObserver | null = null
let pageScriptRunId = 0

const actionText = computed(() => {
  if (turning.value === 'next') return '下一页'
  if (turning.value === 'prev') return '上一页'
  return busy.value ? '转换中' : '转换'
})

const currentFrameUrl = () =>
  (typeof frame?.getURL === 'function' ? frame.getURL() : frame?.getAttribute?.('src')) || props.url

const createFrame = (url: string) => {
  const isWebview = !!(window as any).require
  const el = document.createElement(isWebview ? 'webview' : 'iframe') as HTMLElement
  el.className = 'sr-online-frame fn__flex-1'
  if (isWebview) el.setAttribute('partition', 'persist:siyuan-sireader-online')
  el.setAttribute('src', url)
  el.setAttribute(isWebview ? 'allowpopups' : 'allowfullscreen', 'true')
  if (isWebview) {
    el.addEventListener('dom-ready', () => runPageScripts())
    el.addEventListener('did-finish-load', () => runPageScripts())
    el.addEventListener('did-navigate-in-page', () => runPageScripts())
  } else {
    el.addEventListener('load', () => runPageScripts())
  }
  return el
}

const executePageScript = async (script: string) => {
  if (typeof frame?.executeJavaScript === 'function') return frame.executeJavaScript(script, true)
  const win = (frame as HTMLIFrameElement | null)?.contentWindow
  if (!win) return null
  return win.eval(script)
}

const runInPage = async (script: string) => {
  if (typeof frame?.executeJavaScript === 'function') return frame.executeJavaScript(script, true)
  const doc = (frame as HTMLIFrameElement | null)?.contentDocument
  if (!doc) return null
  return {
    url: doc.location.href,
    title: doc.title,
    text: doc.body?.innerText || '',
    visibleText: doc.body?.innerText || '',
    shadowText: '',
    html: doc.documentElement?.outerHTML || '',
  }
}

const contextScripts = async (url: string): Promise<PageScript[]> => {
  const context = props.context || {}
  const raw = typeof context.getScripts === 'function'
    ? await context.getScripts(url)
    : context.scripts ?? context.script
  return (Array.isArray(raw) ? raw : [raw])
    .map((item: any, index: number): PageScript | null => {
      if (typeof item === 'string') return { id: `context-${index}`, name: `上下文脚本 ${index + 1}`, matches: ['*'], code: item }
      if (item?.code || item?.css) return { id: item.id || `context-${index}`, name: item.name || `上下文脚本 ${index + 1}`, matches: item.matches || ['*'], ...item }
      return null
    })
    .filter((item): item is PageScript => !!item)
}

const executableScripts = async (url: string) => [
  ...getRuntimePageScriptsForUrl(url),
  ...await contextScripts(url),
]

const syncPageBridge = async () => {
  const snapshot = await executePageScript('window.__sireaderPageBridge?.dump?.() || null').catch(() => null)
  if (!snapshot || typeof snapshot !== 'object') return
  toolbarItems.value = Array.isArray(snapshot.toolbarItems) ? snapshot.toolbarItems : []
  pageState.value = snapshot.state || {}
  if (snapshot.settings && typeof snapshot.settings === 'object') {
    await persistPageScriptSettings(snapshot.settings)
    await executePageScript('window.__sireaderPageBridge?.clearLegacySettings?.()').catch(() => {})
  }
}

const runPageScripts = async () => {
  const runId = ++pageScriptRunId
  await waitForPage()
  if (runId !== pageScriptRunId || !frame) return
  const url = currentFrameUrl()
  const scripts = await executableScripts(url)
  const storedSettings = await loadPageScriptSettings().catch(() => ({}))
  await executePageScript(createPageBridgeScript(storedSettings)).catch(() => {})
  for (const script of scripts) {
    if (runId !== pageScriptRunId || !frame) return
    await executePageScript(wrapPageScript(script)).catch(() => {})
  }
  await syncPageBridge()
}

const runScriptCommand = async (command?: string, payload: Record<string, unknown> = {}) => {
  if (!command) return
  const script = `window.__sireaderPageBridge?.runCommand?.(${JSON.stringify(command)}, ${JSON.stringify(payload)}) || null`
  const snapshot = await executePageScript(script).catch(() => null)
  if (snapshot && typeof snapshot === 'object') {
    toolbarItems.value = Array.isArray(snapshot.toolbarItems) ? snapshot.toolbarItems : toolbarItems.value
    pageState.value = snapshot.state || pageState.value
    if (snapshot.settings && typeof snapshot.settings === 'object') {
      await persistPageScriptSettings(snapshot.settings)
      await executePageScript('window.__sireaderPageBridge?.clearLegacySettings?.()').catch(() => {})
    }
  } else {
    await syncPageBridge()
  }
}

const toolbarActive = (item: PageScriptToolbarItem) => !!(item.activeKey && pageState.value[item.activeKey])
const menuActive = (item: PageScriptMenuItem) => {
  if (item.activeKey) return !!pageState.value[item.activeKey]
  if (item.valueKey && 'activeValue' in item) return pageState.value[item.valueKey] === item.activeValue
  return false
}
const menuMeta = (item: PageScriptMenuItem) => {
  if (item.type === 'checkbox') return menuActive(item) ? '已开启' : '已关闭'
  if (!item.valueKey) return item.description || ''
  const value = pageState.value[item.valueKey]
  return value === undefined || value === null || value === '' ? (item.description || '') : `${value}${item.unit || ''}`
}

const runMenuItem = async (item: PageScriptMenuItem) => {
  await runScriptCommand(item.command, item.payload || {})
}

const menuIconHTML = (item: PageScriptMenuItem) =>
  item.color ? `<span class="b3-menu__icon" style="background:${item.color};border-radius:50%;box-shadow:inset 0 0 0 1px var(--b3-border-color)"></span>` : undefined

const toNativeMenuItem = (item: PageScriptMenuItem): any => {
  if (item.type === 'separator') return { type: 'separator' }
  if (item.children?.length) {
    return {
      label: item.title,
      type: 'submenu',
      accelerator: menuMeta(item),
      iconHTML: menuIconHTML(item),
      current: menuActive(item),
      submenu: item.children.map(toNativeMenuItem),
    }
  }
  return {
    label: item.title,
    accelerator: menuMeta(item),
    iconHTML: menuIconHTML(item),
    current: menuActive(item),
    click: () => void runMenuItem(item),
  }
}

const openToolbarMenu = async (item: PageScriptToolbarItem, event: MouseEvent) => {
  if (!item.menu?.length) return runScriptCommand(item.command)
  const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  await syncPageBridge()
  const menu = new Menu()
  item.menu.map(toNativeMenuItem).forEach(menuItem => menu.addItem(menuItem))
  menu.open({ x: rect?.right ?? event.clientX, y: rect?.bottom ?? event.clientY })
}

const loadFrameUrl = async (url: string) => {
  if (!url) return
  if (typeof frame?.loadURL === 'function') frame.loadURL(url)
  else frame?.setAttribute?.('src', url)
  await waitForPage()
}

const getSnapshot = async () => {
  const script = `(() => {
    const clean = text => String(text || '').replace(/\\s+/g, ' ').trim()
    const visibleText = Array.from(document.body?.querySelectorAll('article,main,section,h1,h2,h3,h4,p,li,blockquote,pre') || [])
      .filter(el => {
        const style = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
      })
      .map(el => clean(el.innerText || el.textContent))
      .filter(text => text.length >= 16)
      .slice(0, 160)
      .join('\\n\\n')
    const shadowText = []
    const walk = root => Array.from(root.querySelectorAll?.('*') || []).forEach(el => {
      if (!el.shadowRoot) return
      const text = clean(el.shadowRoot.innerText || el.shadowRoot.textContent)
      if (text) shadowText.push(text)
      walk(el.shadowRoot)
    })
    walk(document)
    return {
      url: location.href,
      title: document.title || '',
      text: document.body?.innerText || '',
      visibleText,
      shadowText: shadowText.join('\\n\\n'),
      html: document.documentElement?.outerHTML || ''
    }
  })()`
  return await runInPage(script).catch(() => null)
}

const waitForPage = async () => {
  await new Promise(resolve => setTimeout(resolve, 700))
  if (typeof frame?.executeJavaScript !== 'function') return
  await frame.executeJavaScript(`new Promise(resolve => {
    if (document.readyState === 'complete') return setTimeout(resolve, 120)
    window.addEventListener('load', () => setTimeout(resolve, 120), { once: true })
    setTimeout(resolve, 1800)
  })`, true).catch(() => {})
}

const navigateWeread = async (target: { text?: string; url?: string }) => {
  mode.value = 'web'
  if (target.url) await loadFrameUrl(target.url)
  if (!target.text) return
  const script = `(() => {
    const needle = ${JSON.stringify(target.text || '')}.replace(/\\s+/g, ' ').trim().slice(0, 32)
    if (!needle) return false
    const clean = text => String(text || '').replace(/\\s+/g, ' ').trim()
    const nodes = []
    const walk = root => {
      const found = Array.from(root.querySelectorAll?.('p,span,div') || [])
      nodes.push(...found)
      found.forEach(el => el.shadowRoot && walk(el.shadowRoot))
    }
    walk(document)
    const node = nodes.find(el => clean(el.innerText || el.textContent).includes(needle))
    if (!node) return false
    node.scrollIntoView({ block: 'center', behavior: 'smooth' })
    node.style.outline = '2px solid #18a058'
    node.style.outlineOffset = '3px'
    setTimeout(() => { node.style.outline = ''; node.style.outlineOffset = '' }, 1400)
    return true
  })()`
  await runInPage(script).catch(() => false)
}

const clickPageTurn = async (dir: 'prev' | 'next') => {
  const words = dir === 'next'
    ? ['下一页', '下一章', '下页', '下章', 'next']
    : ['上一页', '上一章', '上页', '上章', 'prev', 'previous']
  const selectors = dir === 'next'
    ? ['.renderTarget_pager_button_right', '.next', '.next-page', '.nextChapter', '[aria-label*="下一"]', '[title*="下一"]']
    : ['.renderTarget_pager_button:not(.renderTarget_pager_button_right)', '.prev', '.prev-page', '.prevChapter', '[aria-label*="上一"]', '[title*="上一"]']
  const script = `(() => {
    const words = ${JSON.stringify(words)}
    const selectors = ${JSON.stringify(selectors)}
    const textOf = el => [el.innerText, el.textContent, el.getAttribute('aria-label'), el.getAttribute('title')].filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim().toLowerCase()
    const visible = el => {
      const style = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const nodes = [
      ...selectors.flatMap(selector => Array.from(document.querySelectorAll(selector))),
      ...Array.from(document.querySelectorAll('button,a,[role="button"],.renderTarget_pager_content'))
    ].filter((el, index, arr) => arr.indexOf(el) === index && visible(el))
    const target = nodes.find(el => words.some(word => textOf(el).includes(word.toLowerCase())))
    if (!target) return false
    ;(target.closest('button,a,[role="button"]') || target).click()
    return true
  })()`
  const ok = await runInPage(script).catch(() => false)
  if (!ok) throw new Error('没有找到网页翻页按钮')
  await waitForPage()
}

const mountConverted = async (file: File, title: string) => {
  const mountEl = readerPaneRef.value
  if (!mountEl) return
  readerApp?.unmount?.()
  readerApp = null
  mountEl.innerHTML = ''
  await new Promise(resolve => requestAnimationFrame(resolve))
  readerApp = await props.mountReader(mountEl, {
    file,
    blockId: null,
    bookInfo: {
      title: title || file.name.replace(/\.[^.]+$/, ''),
      url: `webpage-temp://${Date.now()}`,
      temporary: true,
      webpageTurn,
    },
  })
}

const convertCurrentPage = async (afterTurn = false) => {
  const { createReadableWebpageTxtFile } = await import('@private-sources')
  const snapshot = await getSnapshot()
  const currentUrl = snapshot?.url || currentFrameUrl()
  const result = await createReadableWebpageTxtFile(currentUrl, snapshot || '')
  status.value = `${afterTurn ? '已翻页并转换' : '已转换'} ${result.page.text.length} 字`
  mode.value = 'reader'
  await nextTick()
  await mountConverted(result.file, result.page.title)
}

const webpageTurn = async (dir: 'prev' | 'next') => {
  if (busy.value) return
  busy.value = true
  turning.value = dir
  try {
    mode.value = 'web'
    status.value = dir === 'next' ? '网页下一页中...' : '网页上一页中...'
    await clickPageTurn(dir)
    await convertCurrentPage(true)
  } catch (error: any) {
    showMessage(error?.message || '网页翻页转换失败', 3000, 'error')
    throw error
  } finally {
    busy.value = false
    turning.value = null
  }
}

const convert = async () => {
  busy.value = true
  try {
    await convertCurrentPage()
    showMessage('已转换为阅读模式', 1400, 'info')
  } catch (error: any) {
    showMessage(error?.message || '转换失败', 3000, 'error')
  } finally {
    busy.value = false
  }
}

const resize = () => readerApp?.resize?.()
const handleGoto = (event: Event) => {
  const cfi = (event as CustomEvent).detail?.cfi
  if (/^https:\/\/weread\.qq\.com\/web\/reader\//i.test(cfi || '')) navigateWeread({ url: cfi })
}

const activateContext = () => {
  const context = props.context
  if (!context?.activeView) return
  setActiveReader(context.activeView, context.activeReader, context.settings)
  ;(window as any).__currentBookUrl = context.bookUrl || props.url
  window.dispatchEvent(new CustomEvent('sireader:tab-switched'))
}

const setupTabObserver = () => {
  let el = webPaneRef.value?.parentElement
  while (el) {
    if (el.hasAttribute('data-id')) {
      const header = document.querySelector<HTMLElement>(`li[data-type="tab-header"][data-id="${el.getAttribute('data-id')}"]`)
      if (header) {
        tabObserver = new MutationObserver(() => header.classList.contains('item--focus') && activateContext())
        tabObserver.observe(header, { attributes: true, attributeFilter: ['class'] })
      }
      return
    }
    el = el.parentElement
  }
}

onMounted(() => {
  if (!webPaneRef.value) return
  frame = createFrame(props.url)
  webPaneRef.value.appendChild(frame)
  const context = props.context
  if (context?.activeView) {
    context.setNavigator?.(navigateWeread)
    activateContext()
    setupTabObserver()
    context.init?.().catch((error: any) => showMessage(error?.message || '加载在线目录标注失败', 3000, 'error'))
  }
  window.addEventListener('sireader:goto', handleGoto)
})

onUnmounted(() => {
  window.removeEventListener('sireader:goto', handleGoto)
  tabObserver?.disconnect()
  tabObserver = null
  if (props.context?.activeView) clearActiveReader(props.context.activeView)
  props.context?.destroy?.()
  readerApp?.unmount?.()
  frame?.remove?.()
  readerApp = null
  frame = null
})

defineExpose({ resize })
</script>

<style scoped>
.sr-online {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--b3-theme-background);
}
.sr-online__bar {
  flex: 0 0 auto;
  height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-bottom: 1px solid var(--b3-border-color);
  background: color-mix(in srgb, var(--b3-theme-surface) 92%, transparent);
  box-sizing: border-box;
}
.sr-online__pane {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.sr-online__title,
.sr-online__status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.sr-online__title {
  flex: 1 1 auto;
  color: var(--b3-theme-on-surface);
  font-weight: 600;
}
.sr-online__status {
  flex: 0 1 280px;
  color: var(--b3-theme-on-surface-light);
}
.sr-online__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.sr-online__btn {
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 8px;
  border: 1px solid var(--b3-border-color);
  border-radius: 6px;
  background: var(--b3-theme-surface);
  color: var(--b3-theme-on-surface);
  font-size: 12px;
  cursor: pointer;
  box-sizing: border-box;
}
.sr-online__btn svg {
  width: 14px;
  height: 14px;
}
.sr-online__btn:hover {
  border-color: var(--b3-theme-primary);
  color: var(--b3-theme-primary);
}
.sr-online__btn.active {
  border-color: var(--b3-theme-primary);
  background: var(--b3-theme-primary-lightest);
  color: var(--b3-theme-primary);
}
.sr-online__btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}
</style>

<style>
.sr-online-frame {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border: 0;
}
</style>
