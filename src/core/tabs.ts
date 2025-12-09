/**
 * Tab 注册 - 使用新的 Foliate Reader
 */
import type { Plugin } from 'siyuan'
import { openTab } from 'siyuan'
import { createApp } from 'vue'
import Reader from '@/components/Reader.vue'
import type { ReaderSettings } from '@/composables/useSetting'

// 工具函数
const center = (content: string, color = '#999') => 
  `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:${color}">${content}</div>`

const fetchFile = async (url: string) => {
  try {
    const response = await fetch(url.startsWith('http') || url.startsWith('/') ? url : `/${url}`)
    if (!response.ok) return null
    const blob = await response.blob()
    const filename = url.split('/').pop()?.split('?')[0] || 'book'
    return new File([blob], filename, { type: blob.type })
  } catch {
    return null
  }
}

const loadSettings = async (plugin: Plugin): Promise<ReaderSettings> => {
  const config = await plugin.loadData('config.json') || {}
  return {
    enabled: true,
    openMode: 'newTab',
    tocPosition: 'left',
    pageAnimation: 'slide',
    columnMode: 'single',
    theme: 'default',
    customTheme: { name: 'custom', color: '#202124', bg: '#ffffff' },
    annotationMode: 'notebook',
    ...config.settings
  } as ReaderSettings
}

/**
 * 注册 EPUB 阅读器标签页
 */
export function registerEpubTab(plugin: Plugin) {
  plugin.addTab({
    type: 'epub_reader',
    async init() {
      const container = document.createElement('div')
      container.style.cssText = 'width:100%;height:100%'
      this.element.appendChild(container)
      
      const { url, blockId, file: dataFile } = this.data
      
      // 获取文件
      const file = dataFile?.arrayBuffer ? dataFile : url && await fetchFile(url)
      if (!file) {
        container.innerHTML = center('加载失败', '#f00')
        return
      }
      
      // 加载设置
      const settings = await loadSettings(plugin)
      
      // 挂载 Reader 组件
      const app = createApp(Reader, {
        file,
        plugin,
        settings,
        url,
        blockId
      })
      
      app.mount(container)
      
      // 保存 app 实例用于销毁
      ;(this as any)._app = app
    },
    destroy() {
      const app = (this as any)._app
      if (app) {
        app.unmount()
        ;(this as any)._app = null
      }
    }
  })
}

/**
 * 创建 EPUB 链接处理器
 */
export function createEpubLinkHandler(plugin: Plugin, getSettings: () => ReaderSettings) {
  return async (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const linkEl = target.matches('span[data-type="a"]') 
      ? target 
      : target.closest('a[href], [data-href], span[data-type="a"]')
    
    const url = linkEl?.getAttribute('data-href') || linkEl?.getAttribute('href')
    
    // 检查是否是 EPUB 链接
    if (!url || !url.toLowerCase().endsWith('.epub')) return
    
    e.preventDefault()
    e.stopPropagation()
    
    // 获取文件
    const file = await fetchFile(url.split('#')[0])
    if (!file) return
    
    // 获取 blockId
    const blockId = target.closest('[data-node-id]')?.getAttribute('data-node-id')
    
    // 打开标签页
    openTab({
      app: (plugin as any).app,
      custom: {
        icon: 'iconBook',
        title: file.name.replace('.epub', ''),
        data: { file, url: url.split('#')[0], blockId },
        id: `${plugin.name}epub_reader`
      },
      position: getSettings().openMode === 'rightTab' ? 'right' 
        : getSettings().openMode === 'bottomTab' ? 'bottom' 
        : undefined
    })
  }
}

/**
 * 注册在线阅读器标签页
 */
export function registerOnlineReaderTab(plugin: Plugin) {
  plugin.addTab({
    type: 'custom_tab_online_reader',
    async init() {
      const container = document.createElement('div')
      container.style.cssText = 'width:100%;height:100%'
      this.element.appendChild(container)
      
      const { bookInfo } = this.data
      if (!bookInfo) {
        container.innerHTML = center('无法加载书籍信息', '#f00')
        return
      }
      
      // 加载设置
      const settings = await loadSettings(plugin)
      
      // 挂载 Reader 组件
      const app = createApp(Reader, {
        bookInfo,
        plugin,
        settings,
        onReaderReady: () => {
          console.log('[OnlineReader] Ready:', bookInfo.name)
        }
      })
      
      app.mount(container)
      
      // 保存 app 实例用于销毁
      ;(this as any)._app = app
    },
    destroy() {
      const app = (this as any)._app
      if (app) {
        app.unmount()
        ;(this as any)._app = null
      }
    }
  })
}

/**
 * 打开在线阅读器标签页
 */
export async function openOnlineReaderTab(plugin: Plugin, bookInfo: any, getSettings: () => ReaderSettings) {
  openTab({
    app: (plugin as any).app,
    custom: {
      icon: 'iconBook',
      title: bookInfo.name || '在线阅读',
      data: { bookInfo },
      id: `${plugin.name}custom_tab_online_reader`
    },
    position: getSettings().openMode === 'rightTab' ? 'right' 
      : getSettings().openMode === 'bottomTab' ? 'bottom' 
      : undefined
  })
}
