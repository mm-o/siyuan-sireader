/**
 * 移动端管理器
 */
import type { Plugin } from 'siyuan'
import { getFrontend } from 'siyuan'

// 平台检测
export const isMobile = () => getFrontend().endsWith('mobile')

let plugin: Plugin | null = null

export const initMobile = (p: Plugin) => {
  plugin = p
  
  // 移动端监听浏览器返回按钮
  if (isMobile()) {
    window.addEventListener('popstate', () => {
      window.dispatchEvent(new CustomEvent('reader:close'))
    })
  }
}

// 保存阅读位置
export const saveMobilePosition = async (bookUrl: string, position: any) => {
  if (!plugin || !isMobile()) return
  const pos = await plugin.loadData('positions') || {}
  pos[bookUrl] = position
  await plugin.saveData('positions', pos)
}

// 获取阅读位置
export const getMobilePosition = async (bookUrl: string) => {
  if (!plugin || !isMobile()) return null
  const pos = await plugin.loadData('positions') || {}
  return pos[bookUrl]
}
