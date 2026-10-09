import { Plugin, getFrontend } from 'siyuan'
import '@/index.scss'
import PluginInfoString from '@/../plugin.json'
import { destroy, init, usePlugin } from '@/main'
import { PDF_SHORTCUT_COMMANDS } from '@/utils/keyboard'
import { diagnosticLog } from '@/core/diagnostics'

const { version } = PluginInfoString

export default class PluginSample extends Plugin {
  public isMobile: boolean
  public isBrowser: boolean
  public isLocal: boolean
  public isElectron: boolean
  public isInWindow: boolean
  public platform: ReturnType<typeof getFrontend>
  public readonly version = version
  private storageChangeTask: Promise<void> | null = null
  private readonly handleStorageChanged = () => {
    if (this.storageChangeTask) return this.storageChangeTask
    this.storageChangeTask = (async () => {
      diagnosticLog('info', 'sync.completed', { source: 'syncMergeResult' })
      window.dispatchEvent(new CustomEvent('sireader:storage-changed'))
    })().finally(() => { this.storageChangeTask = null })
    return this.storageChangeTask
  }

  async onload() {
    const frontEnd = getFrontend()
    this.platform = frontEnd
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
    await init(this)
    this.eventBus.on('sync-end', this.handleStorageChanged)
    this.eventBus.on('ws-main', this.handleWsMain)
    this.addHotkeys()
  }

  // SiYuan may emit this once per file while a sync is still in progress.
  onDataChanged() {
    // SiYuan calls this for dataChanges without unloading the plugin.
    // Refresh consumers only; never write or recover in this notification.
    window.dispatchEvent(new CustomEvent('sireader:storage-changed'))
  }

  private handleWsMain = (event: CustomEvent) => {
    const cmd = event.detail?.cmd
    if (cmd) diagnosticLog('debug', 'ws-main.command', { cmd })
    if (cmd === 'syncMergeResult') void this.handleStorageChanged()
  }

  private addHotkeys() {
    const cmds = {
      prevPage: { text: 'Previous page', hotkey: '', callback: () => window.dispatchEvent(new CustomEvent('sireader:prevPage')) },
      nextPage: { text: 'Next page', hotkey: '', callback: () => window.dispatchEvent(new CustomEvent('sireader:nextPage')) },
      toggleBookmark: { text: 'Toggle bookmark', hotkey: '', callback: () => window.dispatchEvent(new CustomEvent('sireader:toggleBookmark')) },
      quickNote: { text: 'Quick note', hotkey: '', callback: () => window.dispatchEvent(new CustomEvent('sireader:quickNote')) },
    }

    Object.entries(cmds).forEach(([k, { text, hotkey, callback }]) =>
      this.addCommand({ langKey: k, langText: (this.i18n as any)?.[k] || text, hotkey, callback }),
    )
    const pdfFallback: Record<string, string> = {
      '复制标注回链':'Copy annotation backlink','标注词典':'Annotation dictionary','标注翻译':'Translate annotation','选区挖空':'Redact selection','选区词典':'Selection dictionary','选区翻译':'Translate selection','发送选区':'Send selection','发送标注':'Send annotation','复制截图':'Copy screenshot','放大':'Zoom in','缩小':'Zoom out','适合页面':'Fit page','适合宽度':'Fit width','框选缩放':'Marquee zoom','顺时针旋转':'Rotate clockwise','逆时针旋转':'Rotate counter-clockwise','上一页':'Previous page','下一页':'Next page','复制选区':'Copy selection','侧栏':'Sidebar','搜索面板':'Search panel','评论面板':'Comment panel','标注样式':'Annotation style','遮盖面板':'Redaction panel','打印':'Print','导出':'Export','全屏':'Fullscreen','截图':'Screenshot','高亮':'Highlight','下划线':'Underline','删除线':'Strikethrough','波浪线':'Squiggly underline','箭头':'Arrow','批注框':'Callout','圆形':'Circle','直线':'Line','链接':'Link','多边形':'Polygon','折线':'Polyline','矩形':'Rectangle','文本标注':'Text annotation','画笔':'Ink','荧光笔':'Ink highlighter','插入文本':'Insert text','替换文本':'Replace text','删除标注':'Delete annotation','标注评论':'Annotation comment','标注链接':'Annotation link','编辑标注':'Edit annotation','打开链接':'Open link','文本遮盖':'Redact text','删除遮盖':'Delete redaction','提交遮盖':'Commit redaction','插入图片':'Insert image','插入印章':'Insert stamp','插入签名':'Insert signature','撤销':'Undo','重做':'Redo','平移':'Pan','指针':'Pointer','查看模式':'View mode','标注模式':'Annotation mode','插入模式':'Insert mode','遮盖模式':'Redaction mode','表单模式':'Form mode'
    }
    PDF_SHORTCUT_COMMANDS.forEach(([id, text]) => this.addCommand({
      langKey: 'pdf-' + id.replace(/:/g, '-'),
      langText: 'PDF ' + ((this.i18n as any)?.['pdf-' + id.replace(/:/g, '-')] || pdfFallback[text] || text),
      hotkey: '',
      callback: () => window.dispatchEvent(new CustomEvent('sireader:pdf-command', { detail: id })),
    }))
  }

  async onunload() {
    this.eventBus.off('sync-end', this.handleStorageChanged)
    this.eventBus.off('ws-main', this.handleWsMain)
    await destroy()
  }

  async uninstall() {
    const { clearStoredPluginData } = await import('@/core/storage')
    const { getDatabase } = await import('@/core/database')
    const books = await (await getDatabase()).getBooks().catch(() => [])
    await clearStoredPluginData(books)
    await this.removeData('config.json')
    await this.removeData('stats.json')
  }

  openSetting() {
    ;(window as any)._sy_plugin_sample?.openSetting?.()
  }
}
