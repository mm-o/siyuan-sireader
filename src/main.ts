import { Plugin } from 'siyuan'
import { createApp } from 'vue'
import App from './App.vue'
import { initBookDataPlugin } from '@/core/bookshelf'
import { initDictModule } from '@/core/dictionary'
import { initMobile, isMobile } from '@/core/mobile'

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
  initBookDataPlugin(p)
  initDictModule(p)
  initMobile(p)

  // 移动端：侧边栏入口
  if (isMobile()) {
    addMobileSidebar(p)
  }

  // 挂载主应用
  const div = document.createElement('div')
  div.id = p.name
  div.className = 'plugin-sample-vite-vue-app'
  app = createApp(App)
  app.mount(div)
  document.body.appendChild(div)
}

export function destroy() {
  if (!plugin) return
  cleanupCallbacks.forEach(cb => cb())
  cleanupCallbacks = []
  app?.unmount()
  const div = document.getElementById(plugin.name)
  div?.remove()
  plugin = null
}

// 移动端侧边栏
async function addMobileSidebar(p: Plugin) {
  const sidebar = document.querySelector('#sidebar .toolbar')
  if (!sidebar) return setTimeout(() => addMobileSidebar(p), 500)
  if (sidebar.querySelector('[data-type="sidebar-sireader-tab"]')) return

  // 等待图标注册
  for (let i = 0; i < 10 && !document.querySelector('#siyuan-reader-icon'); i++) {
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  // 克隆按钮
  const template = sidebar.querySelector('[data-type="sidebar-file-tab"]')
  if (!template) return

  const btn = template.cloneNode(true) as SVGElement
  btn.setAttribute('data-type', 'sidebar-sireader-tab')
  btn.classList.remove('toolbar__icon--active')
  btn.querySelector('use')?.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#siyuan-reader-icon')

  // 插入到插件按钮之前
  const pluginTab = sidebar.querySelector('[data-type="sidebar-plugin-tab"]')
  pluginTab ? pluginTab.before(btn) : sidebar.appendChild(btn)

  // 创建内容区
  const content = document.createElement('div')
  content.className = 'fn__flex-column fn__none'
  content.setAttribute('data-type', 'sidebar-sireader')
  content.style.cssText = 'height:100%;overflow:hidden'
  sidebar.parentElement?.querySelector('.b3-list--mobile')?.appendChild(content)

  // 挂载 Settings
  const { default: Settings } = await import('./components/Settings.vue')
  const { useSetting } = await import('./composables/useSetting')
  const { settings } = useSetting(p)

  createApp(Settings, {
    modelValue: settings.value,
    i18n: p.i18n,
    onSave: async () => {
      const cfg = await p.loadData('config.json') || {}
      cfg.settings = JSON.parse(JSON.stringify(settings.value))
      await p.saveData('config.json', cfg)
      window.dispatchEvent(new CustomEvent('sireaderSettingsUpdated', { detail: cfg.settings }))
    },
    'onUpdate:modelValue': (v: any) => { settings.value = v }
  }).mount(content)

  // 点击切换
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
