import { Plugin } from 'siyuan'
import { createApp } from 'vue'
import App from './App.vue'
import { initDictModule } from '@/utils/dictionary'
import { mountReaderIconSprite, registerReaderIcons } from '@/utils/icon'
import { initMobile } from '@/utils/mobile'
import { setPlugin } from '@/utils/copy'
import { flushStorage, storageEngine, recoverBackupRecords } from '@/core/storage'
import { migrateLegacyDatabase } from '@/core/legacyDbMigration'
import { drainPendingTasks, trackPending } from '@/core/storage'
import { installDiagnostics, diagnosticLog, disposeDiagnostics } from '@/core/diagnostics'

let plugin: Plugin | null = null
let app: any = null
let cleanupCallbacks: (() => void | Promise<void>)[] = []
const readerTabInitializers = new Map<string, (tab: any) => void | Promise<void>>()
export const registerReaderTab = (type: string, init: (tab: any) => void | Promise<void>) => readerTabInitializers.set(type, init)

export const usePlugin = (p?: Plugin) => p ? (plugin = p) : plugin!
export const registerCleanup = (cb: () => void | Promise<void>) => cleanupCallbacks.push(cb)
export const setOpenSettingHandler = (handler: (openLicense?: boolean) => void) => {
  (window as any)._sy_plugin_sample = (window as any)._sy_plugin_sample || {}
  ;(window as any)._sy_plugin_sample.openSetting = handler
}

export async function init(p: Plugin) {
  usePlugin(p)
  let resolveAppReady!: () => void
  const appReady = new Promise<void>(resolve => { resolveAppReady = resolve })
  // Window layout restoration does not wait for the plugin's async onload.
  for (const type of ['epub_reader', 'custom_tab_book_reader', 'online_reader']) p.addTab({
    type,
    init() { return appReady.then(() => readerTabInitializers.get(type)!(this)) },
    resize() { (this as any)._app?.resize?.() },
    destroy() { (this as any)._app?.unmount(); (this as any)._app = null },
  })
  storageEngine.startAccepting()
  setPlugin(p)
  installDiagnostics({ plugin: p.name, version: (p as any).version || '', frontend: (p as any).platform || '' })
  diagnosticLog('info', 'plugin.init.start', { plugin: p.name })
  // Finish recovery before mounting readers; sync notifications never trigger it.
  // Legacy SQLite storage (reader.db from v0.9.x ~ v1.2.x) must be imported first,
  // otherwise an upgraded user sees an empty bookshelf with no clue.
  await migrateLegacyDatabase(p)
  // 支持手动补导：控制台执行 await sireaderImportLegacyDatabase()（比如用户又补了一份更全的 reader.db）
  ;(window as any).sireaderImportLegacyDatabase = () => migrateLegacyDatabase(p, { force: true })
  await recoverBackupRecords()
  initDictModule(p)
  initMobile(p)

  const div = document.createElement('div')
  div.id = p.name
  div.className = 'plugin-sample-vite-vue-app'
  mountReaderIconSprite(div)
  document.body.appendChild(div)
  registerReaderIcons(p)
  app = createApp(App)
  app.mount(div)
  resolveAppReady()
  diagnosticLog('info', 'plugin.init.done', { plugin: p.name })
}

export async function destroy() {
  if (!plugin) return
  diagnosticLog('info', 'plugin.destroy.start', { plugin: plugin.name })
  const errors: unknown[] = []
  for (const callback of cleanupCallbacks) trackPending(Promise.resolve().then(callback))
  cleanupCallbacks = []
  await drainPendingTasks().catch(error => errors.push(error))
  app?.unmount()
  await drainPendingTasks().catch(error => errors.push(error))
  await flushStorage().catch(error => errors.push(error))
  await drainPendingTasks().catch(error => errors.push(error))
  await flushStorage().catch(error => errors.push(error))
  storageEngine.stopAccepting()
  document.getElementById(plugin.name)?.remove()
  plugin = null
  diagnosticLog('info', 'plugin.destroy.done', { errors: errors.length })
  disposeDiagnostics()
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) {
    const error = new Error(`SiReader cleanup failed (${errors.length} errors)`) as Error & { errors?: unknown[] }
    error.errors = errors
    throw error
  }
}
