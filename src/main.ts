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
  diagnosticLog('info', 'plugin.init.ui-mounted', { plugin: p.name })
  ;(window as any).sireaderImportLegacyDatabase = () => migrateLegacyDatabase(p, { force: true })
  void (async () => {
    try {
      await migrateLegacyDatabase(p)
      await recoverBackupRecords()
      diagnosticLog('info', 'plugin.init.maintenance-done', { plugin: p.name })
    } catch (error: any) {
      diagnosticLog('error', 'plugin.init.maintenance-failed', { message: error?.message || String(error) })
    } finally {
      resolveAppReady()
    }
  })()
}

export async function destroy() {
  if (!plugin) return
  diagnosticLog('info', 'plugin.destroy.start', { plugin: plugin.name })
  const errors: unknown[] = []
  // 每个等待都要有上限：PDF 阅读器的保存/写入一旦卡住，不能让 onunload 永不返回（会卡死思源的刷新/重载）。
  const deadline = async (task: Promise<unknown>, ms: number, label: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<void>(resolve => { timer = setTimeout(() => { diagnosticLog('warn', 'plugin.destroy.timeout', { step: label, ms }); resolve() }, ms) })
    try { await Promise.race([task.catch(error => errors.push(error)), timeout]) } finally { if (timer) clearTimeout(timer) }
  }
  for (const callback of cleanupCallbacks) trackPending(Promise.resolve().then(callback))
  cleanupCallbacks = []
  await deadline(drainPendingTasks(1500), 2500, 'drain-before-unmount')
  app?.unmount()
  // 卸载后再关写入口：卸载过程中产生的最终保存仍能完成，之后不再排新任务。
  storageEngine.stopAccepting()
  await deadline(drainPendingTasks(1200), 2000, 'drain-after-unmount')
  await deadline(flushStorage(), 2500, 'flush')
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
