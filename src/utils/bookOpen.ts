import { getFrontend, openTab, openWindow } from 'siyuan'
import * as siyuanApi from 'siyuan'
import type { Plugin, Tab } from 'siyuan'
import { bookshelfManager, isSameOpenedTab, type Book, type OpenedTabKey } from '@/core/bookshelf'
import type { ReaderSettings } from '@/composables/useSetting'
import { isMobile } from '@/utils/mobile'
import { wereadBookIdOf } from '@/weread/agent'
import { createWereadContextFromSource } from '@/weread/context'
import { httpSourceManager } from '@/utils/HttpSources'

type TabPosition = 'right' | 'bottom'
type NativePdfTarget = { kind: 'asset' | 'pdf'; path: string }
type OpenModeSettings = Pick<ReaderSettings, 'openMode' | 'openDocAssets'>
type ReaderTabData = { file?: File; url?: string; blockId?: string | null; bookInfo?: any; context?: any }
const BOOK_RE = /\.(epub|pdf|mobi|azw3|azw|fb2|cbz|txt)(?:[?#].*)?$/i

// 查找已打开的阅读器标签页：按书 url 判等，同名不同格式不会互相抢占；覆盖左右下所有布局
export const findOpenedTab = (target: OpenedTabKey, pluginName: string, tabType = 'custom_tab_book_reader') => {
  const type = `${pluginName}${tabType}`
  const tabs = ((siyuanApi as any).getAllTabs?.() || []) as any[]
  for (const tab of tabs) {
    if (tab?.model?.type !== type) continue
    const title = (tab.headElement?.getAttribute('data-title') || tab.headElement?.querySelector('.item__text')?.textContent || '').trim()
    if (isSameOpenedTab(tab.model?.data, title, target)) return tab.headElement as HTMLElement
  }
  return null
}

export const getOpenTabPosition = (settings: Pick<ReaderSettings, 'openMode'>): TabPosition | undefined =>
  ({ rightTab: 'right', bottomTab: 'bottom' }[settings.openMode])

const openInNewWindow = (tab: Tab, mode?: ReaderSettings['openMode']) => {
  if (mode === 'newWindow' && getFrontend().startsWith('desktop')) openWindow({ tab })
}

export const openReaderTab = (plugin: Plugin, title: string, data: ReaderTabData, id: string, settings?: Pick<ReaderSettings, 'openMode'>, onReady?: () => void) => {
  const position = settings ? getOpenTabPosition(settings) : undefined
  openTab({
    app: (plugin as any).app,
    custom: { icon: 'siyuan-reader-icon', title, data, id },
    ...(position ? { position } : {}),
    afterOpen: onReady
  }).then(tab => openInNewWindow(tab, settings?.openMode))
}

const activateOpenedTab = (tab: HTMLElement | null, onReady?: () => void) => {
  if (!tab) return false
  tab.click()
  onReady?.()
  return true
}

export const openOnlineReaderTab = (plugin: Plugin, title: string, url: string, settings?: Pick<ReaderSettings, 'openMode'>, onReady?: () => void, context?: any) =>
  (plugin as any).isBrowser && /^https:\/\/weread\.qq\.com\/web\/reader\//i.test(url)
    ? (window.open(url, '_blank', 'noopener,noreferrer'), onReady?.(), true)
    : activateOpenedTab(findOpenedTab({ url, title }, plugin.name, 'online_reader'), onReady)
      || openReaderTab(plugin, title, { url, bookInfo: { title }, context }, `${plugin.name}online_reader`, settings, onReady)

const normalizeNativePdfPath = (path: string) => {
  if (!path || /^https?:\/\//i.test(path) || /^file:\/\//i.test(path)) return null
  if (path.startsWith('/data/public/')) return { kind: 'asset' as const, path: path.replace(/^\/data\/public\//i, 'public/') }
  if (path.startsWith('/public/')) return { kind: 'asset' as const, path: path.replace(/^\/public\//i, 'public/') }
  if (path.startsWith('public/')) return { kind: 'asset' as const, path }
  if (path.startsWith('/assets/')) return { kind: 'pdf' as const, path: path.replace(/^\/assets\//i, 'assets/') }
  if (path.startsWith('assets/')) return { kind: 'pdf' as const, path }
  // 插件虚拟路径（/plugin/private/...）不是思源资产路径，交给思源原生 PDF 会报 "is not an asset path"
  return null
}

export const getSiyuanPdfTarget = (book: Book, settings: OpenModeSettings): NativePdfTarget | null => {
  if (settings.openDocAssets || book.format !== 'pdf') return null
  const sourcePath = book.url.startsWith('asset://') ? book.url.replace('asset://', '') : (book.path || book.url || '')
  return normalizeNativePdfPath(sourcePath)
}

export const openWithSiyuanPdf = (plugin: Plugin, book: Book, settings: OpenModeSettings, onReady?: () => void) => {
  const target = getSiyuanPdfTarget(book, settings)
  if (!target) return false
  const position = getOpenTabPosition(settings)

  openTab({
    app: (plugin as any).app,
    [target.kind]: { path: target.path },
    ...(position ? { position } : {}),
    afterOpen: onReady
  }).then(tab => openInNewWindow(tab, settings.openMode))
  return true
}

// 获取或添加assets书籍
export const getOrAddAssetBook = async (manager: typeof bookshelfManager, assetPath: string, file: File) => {
  const bookUrl = `asset://${assetPath}`
  
  const existing = await manager.getBook(bookUrl)
  if (existing) return existing
  
  try {
    await manager.addAssetBook(assetPath, file)
    window.dispatchEvent(new CustomEvent('sireader:bookshelf-updated'))
    return await manager.getBook(bookUrl)
  } catch {
    return null
  }
}

// 打开或激活书籍
export const openOrActivateBook = async (plugin: Plugin, book: Book, settings: ReaderSettings, onReady?: () => void) => {
  const readUrl = /^https?:\/\//i.test(book?.path || '') && !BOOK_RE.test(book.path) && book.path
  if (readUrl) {
    await httpSourceManager.init()
    const context = /^https:\/\/weread\.qq\.com\/web\/reader\//i.test(readUrl) ? createWereadContextFromSource({ ...book, bookId: wereadBookIdOf(book) }, httpSourceManager.getSource('weread-agent')) : undefined
    return openOnlineReaderTab(plugin, book.title, readUrl, settings, onReady, context)
  }

  if (isMobile()) {
    window.dispatchEvent(new CustomEvent('reader:mobile-open', { detail: { book } }))
    onReady?.()
    return
  }

  if (openWithSiyuanPdf(plugin, book, settings, onReady)) return
  
  if (activateOpenedTab(findOpenedTab(book, plugin.name), onReady)) return
  openReaderTab(plugin, book.title, { bookInfo: book }, `${plugin.name}custom_tab_book_reader`, settings, onReady)
}
