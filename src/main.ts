import { Plugin } from 'siyuan'
import { createApp } from 'vue'
import App from './App.vue'
import { bookshelfManager } from '@/core/bookshelf'
import { initDictModule } from '@/core/dictionary'
import { initMobile, isMobile } from '@/core/mobile'
import { setPlugin } from '@/utils/copy'

let plugin: Plugin | null = null
let app: any = null
let cleanupCallbacks: (() => void)[] = []

export const usePlugin = (p?: Plugin) => p ? (plugin = p) : plugin!
export const registerCleanup = (cb: () => void) => cleanupCallbacks.push(cb)
export const setOpenSettingHandler = (handler: () => void) => {
  (window as any)._sy_plugin_sample = (window as any)._sy_plugin_sample || {}
  ;(window as any)._sy_plugin_sample.openSetting = handler
}

export function init(p: Plugin) {
  usePlugin(p)
  setPlugin(p)
  bookshelfManager.init()
  initDictModule(p)
  initMobile(p)

  // 挂载主应用
  const div = document.createElement('div')
  div.id = p.name
  div.className = 'plugin-sample-vite-vue-app'
  app = createApp(App)
  app.mount(div)
  document.body.appendChild(div)

  // 异步初始化
  import('@/components/deck').then(({ initDatabase, initPack }) => {
    initDatabase()
    initPack(p)
  }).catch(e => console.error('[SiReader] Init failed:', e))
  
  if (isMobile()) addMobileSidebar(p)
}

export function destroy() {
  if (!plugin) return
  cleanupCallbacks.forEach(cb => cb())
  cleanupCallbacks = []
  app?.unmount()
  document.getElementById(plugin.name)?.remove()
  plugin = null
}

async function addMobileSidebar(p: Plugin) {
  const sidebar = document.querySelector('#sidebar .toolbar')
  if (!sidebar) return setTimeout(() => addMobileSidebar(p), 500)
  if (sidebar.querySelector('[data-type="sidebar-sireader-tab"]')) return

  // 等待图标
  for (let i = 0; i < 10 && !document.querySelector('#siyuan-reader-icon'); i++) 
    await new Promise(r => setTimeout(r, 200))

  const template = sidebar.querySelector('[data-type="sidebar-file-tab"]')
  if (!template) return

  const btn = template.cloneNode(true) as SVGElement
  btn.setAttribute('data-type', 'sidebar-sireader-tab')
  btn.classList.remove('toolbar__icon--active')
  btn.querySelector('use')?.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#siyuan-reader-icon')

  const pluginTab = sidebar.querySelector('[data-type="sidebar-plugin-tab"]')
  pluginTab ? pluginTab.before(btn) : sidebar.appendChild(btn)

  const content = document.createElement('div')
  content.className = 'fn__flex-column fn__none'
  content.setAttribute('data-type', 'sidebar-sireader')
  content.style.cssText = 'height:100%;overflow:hidden'
  sidebar.parentElement?.querySelector('.b3-list--mobile')?.appendChild(content)

  const { default: Settings } = await import('./components/Settings.vue')
  const { useSetting } = await import('./composables/useSetting')
  const { settings, save } = useSetting(p)

  createApp(Settings, {
    modelValue: settings.value,
    i18n: p.i18n,
    onSave: async () => { await new Promise(resolve => setTimeout(resolve, 0)); await save(); },
    'onUpdate:modelValue': (v: any) => { settings.value = v }
  }).mount(content)

  sidebar.addEventListener('click', (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-type="sidebar-sireader-tab"]')
    if (target) {
      sidebar.querySelectorAll('.toolbar__icon').forEach(i => i.classList.remove('toolbar__icon--active'))
      target.classList.add('toolbar__icon--active')
      sidebar.parentElement?.querySelectorAll('.b3-list--mobile > div').forEach(d => d.classList.add('fn__none'))
      content.classList.remove('fn__none')
    }
  })
}
