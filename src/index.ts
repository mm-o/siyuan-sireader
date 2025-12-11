import { Plugin, getFrontend } from 'siyuan'
import '@/index.scss'
import PluginInfoString from '@/../plugin.json'
import { destroy, init } from '@/main'

const { version } = PluginInfoString

export default class PluginSample extends Plugin {
  // Run as mobile
  public isMobile: boolean
  // Run in browser
  public isBrowser: boolean
  // Run as local
  public isLocal: boolean
  // Run in Electron
  public isElectron: boolean
  // Run in window
  public isInWindow: boolean
  public platform: SyFrontendTypes
  public readonly version = version

  async onload() {
    const frontEnd = getFrontend()
    this.platform = frontEnd as SyFrontendTypes
    this.isMobile = frontEnd === 'mobile' || frontEnd === 'browser-mobile'
    this.isBrowser = frontEnd.includes('browser')
    this.isLocal = location.href.includes('127.0.0.1') || location.href.includes('localhost')
    this.isInWindow = location.href.includes('window.html')
    try {
      require('@electron/remote').require('@electron/remote/main')
      this.isElectron = true
    } catch {
      this.isElectron = false
    }
    init(this)
    this.addHotkeys()
  }

  private addHotkeys() {
    const getReader = () => (window as any).__sireader_active_reader
    const cmds = {
      prevPage: { text: '上一页', hotkey: '', callback: () => getReader()?.prev?.() || getReader()?.goLeft?.() },
      nextPage: { text: '下一页', hotkey: '', callback: () => getReader()?.next?.() || getReader()?.goRight?.() },
      toggleBookmark: { text: '切换书签', hotkey: '', callback: () => window.dispatchEvent(new CustomEvent('sireader:toggleBookmark')) }
    }
    Object.entries(cmds).forEach(([k, { text, hotkey, callback }]) => 
      this.addCommand({ langKey: k, langText: text, hotkey, callback })
    )
  }

  async onunload() {
    // 新的 foliate 系统会在组件卸载时自动清理
    destroy()
    console.log('[SiReader] 插件已禁用')
  }

  async uninstall() {
    await this.removeData('config.json')
    await this.removeData('stats.json')
    console.log('[SiReader] 插件数据已删除')
  }

  openSetting() {
    window._sy_plugin_sample.openSetting()
  }
}
