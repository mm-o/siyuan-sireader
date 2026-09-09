import { Plugin, getFrontend } from 'siyuan'
import '@/index.scss'
import PluginInfoString from '@/../plugin.json'
import { destroy, init, usePlugin } from '@/main'

const { version } = PluginInfoString

export default class PluginSample extends Plugin {
  public isMobile: boolean
  public isBrowser: boolean
  public isLocal: boolean
  public isElectron: boolean
  public isInWindow: boolean
  public platform: SyFrontendTypes
  public readonly version = version
  private readonly handleStorageChanged = () => window.dispatchEvent(new CustomEvent('sireader:storage-changed'))

  async onload() {
    const frontEnd = getFrontend()
    this.platform = frontEnd as SyFrontendTypes
    this.isMobile = frontEnd === 'mobile' || frontEnd === 'browser-mobile'
    this.isBrowser = frontEnd.includes('browser')
    this.isLocal = location.href.includes('127.0.0.1') || location.href.includes('localhost')
    this.isInWindow = location.href.includes('window.html')
    try {
      const req = typeof window !== 'undefined' && typeof (window as any).require === 'function'
        ? (window as any).require
        : null
      req?.('@electron/remote')?.require?.('@electron/remote/main')
      this.isElectron = !!req
    } catch {
      this.isElectron = false
    }

    usePlugin(this)
    init(this)
    this.eventBus.on('sync-end', this.handleStorageChanged)
    this.eventBus.on('ws-main', this.handleWsMain)
    this.addHotkeys()
  }

  onDataChanged() {}

  private handleWsMain = (event: CustomEvent) => {
    const cmd = event.detail?.cmd
    if (cmd === 'syncMergeResult' || cmd === 'reloadPlugin') this.handleStorageChanged()
  }

  private addHotkeys() {
    const cmds = {
      prevPage: { text: '上一页', hotkey: '', callback: () => window.dispatchEvent(new CustomEvent('sireader:prevPage')) },
      nextPage: { text: '下一页', hotkey: '', callback: () => window.dispatchEvent(new CustomEvent('sireader:nextPage')) },
      toggleBookmark: { text: '切换书签', hotkey: '', callback: () => window.dispatchEvent(new CustomEvent('sireader:toggleBookmark')) },
      quickNote: { text: '快速笔记', hotkey: '', callback: () => window.dispatchEvent(new CustomEvent('sireader:quickNote')) },
    }

    Object.entries(cmds).forEach(([k, { text, hotkey, callback }]) =>
      this.addCommand({ langKey: k, langText: (this.i18n as any)?.[k] || text, hotkey, callback }),
    )
  }

  async onunload() {
    this.eventBus.off('sync-end', this.handleStorageChanged)
    this.eventBus.off('ws-main', this.handleWsMain)
    destroy()
  }

  async uninstall() {
    const { clearStoredPluginData } = await import('@/core/bookStore')
    const { getDatabase } = await import('@/core/database')
    const books = await (await getDatabase()).getBooks().catch(() => [])
    await clearStoredPluginData(books)
    await this.removeData('config.json')
    await this.removeData('stats.json')
  }

  openSetting() {
    window._sy_plugin_sample.openSetting()
  }
}
