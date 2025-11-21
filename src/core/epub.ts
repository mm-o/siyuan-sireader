import type { Plugin } from 'siyuan'
import { openTab } from 'siyuan'
import { createApp } from 'vue'
// @ts-ignore
import EpubReader from '@/components/EpubReader.vue'

const EPUB_EXTS = ['.epub']
const TAB_TYPE = 'epub_reader'

export const isEpub = (url?: string | null): boolean => {
  if (!url) return false
  return EPUB_EXTS.some(ext => url.toLowerCase().split('?')[0].endsWith(ext))
}

export function registerEpubTab(plugin: Plugin) {
  plugin.addTab({
    type: TAB_TYPE,
    init() {
      const container = document.createElement('div')
      container.style.cssText = 'width: 100%; height: 100%;'
      this.element.appendChild(container)
      
      if (this.data.file) {
        createApp(EpubReader, { file: this.data.file, plugin }).mount(container)
      }
    },
  })
}

export function createEpubLinkHandler(
  plugin: Plugin,
  getSettings: () => { openMode: string }
) {
  return async (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const linkEl = target.matches('span[data-type="a"]') 
      ? target 
      : target.closest('a[href], [data-href], span[data-type="a"]')
    
    if (!linkEl) return
    
    const url = (linkEl.getAttribute('data-href') || linkEl.getAttribute('href')) as string | null
    if (!isEpub(url)) return
    
    e.preventDefault()
    e.stopPropagation()
    
    try {
      const file = await fetchEpubFile(url)
      if (!file) return
      
      const settings = getSettings()
      const position = settings.openMode === 'rightTab' ? 'right' 
        : settings.openMode === 'bottomTab' ? 'bottom' 
        : undefined
      
      openTab({
        app: (plugin as any).app,
        custom: {
          icon: 'iconBook',
          title: file.name.replace('.epub', ''),
          data: { file },
          id: `${plugin.name}${TAB_TYPE}`,
        } as any,
        position,
      })
    } catch (error) {
      console.error('[MReader] 打开失败:', error)
    }
  }
}

async function fetchEpubFile(url: string): Promise<File | null> {
  try {
    const fetchUrl = url.startsWith('http') || url.startsWith('/') ? url : `/${url}`
    const response = await fetch(fetchUrl)
    if (!response.ok) return null
    
    const blob = await response.blob()
    const filename = url.split('/').pop()?.split('?')[0] || 'book.epub'
    return new File([blob], filename, { type: 'application/epub+zip' })
  } catch {
    return null
  }
}
