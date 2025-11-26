import type { Plugin } from 'siyuan'
import { openTab } from 'siyuan'
import { createApp } from 'vue'
// @ts-ignore
import EpubReader from '@/components/EpubReader.vue'
import { useSetting } from '@/composables/useSetting'
import * as API from '@/api'
import { clearCache } from './epubDoc'

const TAB_TYPE = 'epub_reader'
const activeTabs = new Map<string, { rendition: any; blockId: string; url: string }>()

// 标注样式配置（7色，极简高效）
export const HL_STYLES = {
  red: { background: 'rgba(244,67,54,0.4)', fill: '#f44336', 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' },
  orange: { background: 'rgba(255,152,0,0.4)', fill: '#ff9800', 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' },
  yellow: { background: 'rgba(255,235,59,0.4)', fill: '#ffeb3b', 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' },
  green: { background: 'rgba(76,175,80,0.4)', fill: '#4caf50', 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' },
  pink: { background: 'rgba(233,30,99,0.4)', fill: '#e91e63', 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' },
  blue: { background: 'rgba(33,150,243,0.4)', fill: '#2196f3', 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' },
  purple: { background: 'rgba(156,39,176,0.4)', fill: '#9c27b0', 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' },
} as const

export const isEpub = (url?: string | null) => !!url && url.toLowerCase().split('?')[0].split('#')[0].endsWith('.epub')

const saveProgress = async (blockId: string, loc: any) => {
  if (!loc?.start?.cfi) return
  await API.setBlockAttrs(blockId, {
    'custom-epub-cfi': loc.start.cfi,
    'custom-epub-progress': Math.round((loc.start.percentage || 0) * 100).toString(),
    'custom-epub-last-read': new Date().toISOString(),
  })
}

export const saveAllProgress = () => Promise.all(
  Array.from(activeTabs.values())
    .filter(({ rendition, blockId }) => rendition && blockId)
    .map(({ rendition, blockId }) => saveProgress(blockId, rendition.currentLocation()).catch(() => {}))
)

// 文档管理功能移至 epubDoc.ts

export function registerEpubTab(plugin: Plugin) {
  const { open: openSetting } = useSetting(plugin)
  const center = (content: string, color = '#999') => `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:${color}">${content}</div>`
  
  plugin.addTab({
    type: TAB_TYPE,
    async init() {
      const container = document.createElement('div')
      container.style.cssText = 'width:100%;height:100%'
      this.element.appendChild(container)
      
      const tabId = (this.element as HTMLElement).dataset.id || Date.now().toString()
      const { url, blockId, cfi, file: dataFile } = this.data
      let file = dataFile?.arrayBuffer ? dataFile : null
      
      if (!file && url) {
        container.innerHTML = center('<div class="fn__loading"><img width="48px" src="/stage/loading-pure.svg"></div><div style="margin-top:10px">正在加载...</div>')
        file = await fetchEpubFile(url)
        if (!file) return container.innerHTML = center('加载失败', '#f00')
      }
      
      if (!file) return container.innerHTML = center('无法加载')
      
      const cfg = (await plugin.loadData('config.json') || {}).settings || {}
      const settings = { enabled: true, openMode: 'newTab', tocPosition: 'left', pageTurnMode: 'click', pageAnimation: 'slide', columnMode: 'single', theme: 'default', customTheme: { name: 'custom', color: '#202124', bg: '#ffffff' }, annotationMode: 'notebook', ...cfg }
      createApp(EpubReader, {
        file, plugin, settings, url, blockId, cfi,
        onRenditionReady: (rendition: any) => tabId && blockId && activeTabs.set(tabId, { rendition, blockId, url: url?.split('#')[0] || '' }),
        onSettings: openSetting,
      }).mount(container)
    },
    destroy() {
      const tabId = (this.element as HTMLElement).dataset.id!
      const tab = activeTabs.get(tabId)
      if (tab) {
        const { rendition, blockId } = tab
        rendition && blockId && saveProgress(blockId, rendition.currentLocation()).catch(() => {})
        rendition && clearCache.highlight(rendition)
        activeTabs.delete(tabId)
      }
    },
  })
}

export function createEpubLinkHandler(plugin: Plugin, getSettings: () => { openMode: string }) {
  return async (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const linkEl = target.matches('span[data-type="a"]') ? target : target.closest('a[href], [data-href], span[data-type="a"]')
    const url = linkEl?.getAttribute('data-href') || linkEl?.getAttribute('href')
    if (!isEpub(url)) return
    
    e.preventDefault()
    e.stopPropagation()
    
    // 解析URL、CFI和文档ID（格式：url#cfi#docId）
    const parts = url!.split('#')
    const epubUrl = parts[0]
    let cfi = parts[1] || ''
    const docId = parts[2] || ''
    if (cfi.includes('%')) try { cfi = decodeURIComponent(cfi) } catch {}
    
    // 如果书已打开，直接跳转
    const openedTab = Array.from(activeTabs.entries()).find(([_, tab]) => tab.url === epubUrl)
    if (openedTab && cfi) {
      const [tabId, tab] = openedTab
      if (docId && tab.blockId !== docId) tab.blockId = docId
      document.querySelector(`[data-id="${tabId}"]`)?.parentElement?.click()
      tab.rendition?.display(cfi).catch(() => {})
      return
    }
    
    const file = await fetchEpubFile(epubUrl).catch(() => null)
    if (!file) return
    
    const { openMode } = getSettings()
    const nodeBlockId = target.closest('[data-node-id]')?.getAttribute('data-node-id')
    const blockId = nodeBlockId || docId
    if (cfi && nodeBlockId) await API.setBlockAttrs(nodeBlockId, { 'custom-epub-cfi': cfi }).catch(() => {})
    
    openTab({
      app: (plugin as any).app,
      custom: {
        icon: 'iconBook',
        title: file.name.replace('.epub', ''),
        data: { file, url: cfi && docId ? `${epubUrl}#${cfi}#${docId}` : epubUrl, blockId, cfi },
        id: `${plugin.name}${TAB_TYPE}`,
      } as any,
      position: openMode === 'rightTab' ? 'right' : openMode === 'bottomTab' ? 'bottom' : undefined,
    })
  }
}

const fetchEpubFile = async (url: string): Promise<File | null> => {
  const fetchUrl = url.startsWith('http') || url.startsWith('/') ? url : `/${url}`
  const res = await fetch(fetchUrl)
  return res.ok ? new File([await res.blob()], url.split('/').pop()?.split('?')[0] || 'book.epub', { type: 'application/epub+zip' }) : null
}
