import { Plugin } from 'siyuan'
import { createApp } from 'vue'
import App from './App.vue'

let plugin: Plugin | null = null
export function usePlugin(pluginProps?: Plugin): Plugin {
  if (pluginProps) plugin = pluginProps
  return plugin!
}


let app = null
let pluginInstance: Plugin | null = null
let cleanupCallbacks: (() => void)[] = []

export function init(plugin: Plugin) {
  usePlugin(plugin)
  pluginInstance = plugin

  const div = document.createElement('div')
  div.classList.toggle('plugin-sample-vite-vue-app')
  div.id = plugin.name
  app = createApp(App)
  app.mount(div)
  document.body.appendChild(div)
}

export function setOpenSettingHandler(handler: () => void) {
  window._sy_plugin_sample = window._sy_plugin_sample || {}
  window._sy_plugin_sample.openSetting = handler
}

export function registerCleanup(callback: () => void) {
  cleanupCallbacks.push(callback)
}

export function destroy() {
  if (!pluginInstance) return
  cleanupCallbacks.forEach(cb => cb())
  cleanupCallbacks = []
  app?.unmount()
  const div = document.getElementById(pluginInstance.name)
  div && document.body.removeChild(div)
  pluginInstance = null
}
