import { openTab } from 'siyuan'
import type { Plugin } from 'siyuan'
import { bookshelfManager, type Book } from '@/core/bookshelf'
import type { ReaderSettings } from '@/composables/useSetting'
import { isMobile } from '@/utils/mobile'

// 查找已打开的阅读器标签页
export const findOpenedTab = (bookName: string, pluginName: string) => {
  const type = `${pluginName}custom_tab_online_reader`
  const find = (o: any, id: string): any => o?.id === id ? o : o?.children?.reduce((r: any, c: any) => r || find(c, id), null)
  for (const el of document.querySelectorAll<HTMLElement>('.layout-tab-bar .item[data-id]')) {
    if ((el.getAttribute('data-title') || el.querySelector('.item__text')?.textContent) !== bookName) continue
    if (find((window as any).siyuan?.layout?.centerLayout, el.getAttribute('data-id')!)?.model?.type === type) return el
  }
  return null
}

// 获取书籍（带在线章节加载）
export const getBookWithFallback = async (manager: typeof bookshelfManager, bookUrl: string) => {
  const book = await manager.getBook(bookUrl)
  if (!book) return null
  
  // 在线书籍延迟加载章节
  if (book.format === 'online' && book.source?.origin && !book.total) {
    try {
      const { bookSourceManager } = await import('@/utils/BookSearch')
      const info = await bookSourceManager.getBookInfo(book.source.origin, book.url)
      const chapters = await bookSourceManager.getChapters(book.source.origin, info.tocUrl || book.url)
      await manager.updateBook(book.url, { total: chapters.length })
    } catch (e) {
      console.error('[章节加载]', e)
      return null
    }
  }
  
  return book
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
  } catch (e) {
    console.error('[添加书籍]', e)
    return null
  }
}

// 打开或激活书籍
export const openOrActivateBook = (plugin: Plugin, book: Book, settings: ReaderSettings, onReady?: () => void) => {
  if (isMobile()) {
    window.dispatchEvent(new CustomEvent('reader:open', { detail: { book } }))
    onReady?.()
    return
  }
  
  const tab = findOpenedTab(book.title, plugin.name)
  if (tab) {
    tab.click()
    onReady?.()
    return
  }
  
  openTab({
    app: (plugin as any).app,
    custom: {
      icon: 'siyuan-reader-icon',
      title: book.title,
      data: { bookInfo: book },
      id: `${plugin.name}custom_tab_online_reader`
    },
    position: { rightTab: 'right', bottomTab: 'bottom' }[settings.openMode],
    afterOpen: onReady
  })
}