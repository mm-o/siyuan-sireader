import { openTab } from 'siyuan'
import type { Plugin } from 'siyuan'
import { bookshelfManager, type Book } from '@/core/bookshelf'
import type { ReaderSettings } from '@/composables/useSetting'
import { isMobile } from '@/core/utils/mobile'

// 查找已打开的标签页
export const findOpenedTab = (bookName: string) => {
  const tabs = document.querySelectorAll<HTMLElement>('.layout-tab-bar .item')
  for (const tab of tabs) {
    const title = tab.getAttribute('data-title') || tab.querySelector('.item__text')?.textContent
    if (title?.includes(bookName)) return tab
  }
  return null
}

// 获取书籍（带在线章节加载）
export const getBookWithFallback = async (manager: typeof bookshelf, bookUrl: string) => {
  const book = await manager.getBook(bookUrl)
  if (!book) return null
  
  // 在线书籍延迟加载章节（如果有 source.origin 信息）
  if (book.source?.origin && !book.toc?.length) {
    try {
      const { bookSourceManager } = await import('@/core/book')
      const info = await bookSourceManager.getBookInfo(book.source.origin, bookUrl)
      const chapters = await bookSourceManager.getChapters(book.source.origin, info.tocUrl || bookUrl)
      book.toc = chapters.map((ch) => ({ 
        label: ch.name,
        href: ch.url,
        subitems: []
      }))
      await manager.updateBook(bookUrl, { 
        toc: book.toc,
        location: { ...book.location, chapterTotal: chapters.length }
      })
    } catch (e) {
      console.error('[章节加载]', e)
      return null
    }
  }
  
  return book
}

// 获取或添加assets书籍
export const getOrAddAssetBook = async (manager: typeof bookshelf, assetPath: string, file: File) => {
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
  
  const tab = findOpenedTab(book.title)
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
