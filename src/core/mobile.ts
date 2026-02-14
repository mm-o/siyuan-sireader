/**
 * 移动端管理器
 */
import type { Plugin } from 'siyuan'
import { getFrontend } from 'siyuan'

export const isMobile = () => getFrontend().endsWith('mobile')

export const initMobile = (_p: Plugin) => {
  if (isMobile()) window.addEventListener('popstate', () => window.dispatchEvent(new CustomEvent('reader:close')))
}

export const saveMobilePosition = async (bookUrl: string, position: any) => {
  if (!isMobile()) return
  const db = await (await import('./database')).getDatabase()
  await db.saveSetting(`mobile_pos_${bookUrl}`, position)
}

export const getMobilePosition = async (bookUrl: string) => {
  if (!isMobile()) return null
  const db = await (await import('./database')).getDatabase()
  return await db.getSetting(`mobile_pos_${bookUrl}`)
}