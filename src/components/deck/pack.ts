// 卡组管理和 Anki 导入
import type { Plugin } from 'siyuan'
import { showMessage } from 'siyuan'
import type { Pack } from './types'
import { getDatabase } from './database'
import { importApkg as ankiImportApkg, getMediaFromApkg as ankiGetMedia, createAnkiDatabase, getAnkiCardCount, clearAnkiDbCache } from './anki'

const DEF_STATS = { total: 0, new: 0, learning: 0, review: 0, suspended: 0 }
const notify = () => window.dispatchEvent(new Event('sireader:pack-updated'))

export const initPack = async (_p: Plugin) => {
  const db = await getDatabase()
  await db.init()
  
  if ((await db.getDecks()).find(d => d.id === 'default')) return
  
  const cid = 'default-col'
  await createAnkiDatabase(cid, '默认集合')
  await db.saveDeck({ id: 'default', name: '默认卡组', desc: '未分类卡片', icon: '📚', color: '#667eea', collectionId: cid, ankiDeckId: 1, stats: { ...DEF_STATS }, settings: {} as any, created: Date.now(), updated: Date.now() })
}

export { getCards, getTodayDueCards, addCard, removeCard } from './card'
export const getPack = async () => (await getDatabase()).getDecks()
export const getCollection = async () => (await getDatabase()).getCollections()

const ensureParent = async (name: string, cid?: string): Promise<string | undefined> => {
  const parts = name.split('::')
  if (parts.length <= 1) return undefined
  
  const parentName = parts.slice(0, -1).join('::')
  const db = await getDatabase()
  let parent = (await db.getDecks()).find(d => d.name === parentName)
  
  if (!parent) {
    const grandParentId = await ensureParent(parentName, cid)
    parent = await createPack(parentName, { desc: '自动创建', icon: '📁', color: '#667eea', collectionId: cid, parent: grandParentId, stats: DEF_STATS })
  }
  
  return parent.id
}

export const createPack = async (name: string, opts?: Partial<Pack>) => {
  const db = await getDatabase()
  const cid = opts?.collectionId || `col-${Date.now()}`
  
  if (!opts?.collectionId) await createAnkiDatabase(cid, name)
  
  const pack: Pack = {
    id: opts?.id || `pack-${Date.now()}`, name, desc: opts?.desc, icon: opts?.icon || '📦', color: opts?.color || '#667eea',
    titleImg: opts?.titleImg, tags: opts?.tags || [], parent: opts?.parent !== undefined ? opts.parent : await ensureParent(name, cid),
    collectionId: cid, ankiDeckId: opts?.ankiDeckId || 1, settings: {} as any, stats: { ...DEF_STATS, ...opts?.stats }, 
    enabled: opts?.enabled || false, created: Date.now(), updated: Date.now()
  }
  
  await db.saveDeck(pack)
  notify()
  return pack
}

export const updatePack = async (id: string, updates: Partial<Pack>) => {
  const db = await getDatabase()
  const pack = await db.getDeck(id)
  if (!pack) return false
  Object.assign(pack, updates, { updated: Date.now() })
  await db.saveDeck(pack)
  notify()
  return true
}

export const deletePack = async (id: string) => {
  if (id === 'default') return false
  
  const db = await getDatabase()
  const pack = await db.getDeck(id)
  if (!pack) return false
  
  await db.deleteDeck(id)
  
  if (pack.collectionId && !(await db.getDecks()).some(d => d.collectionId === pack.collectionId)) {
    await fetch('/api/file/removeFile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `/data/storage/petal/siyuan-sireader/anki/${pack.collectionId}` }) }).catch(() => {})
  }
  
  notify()
  return true
}

export const updatePackStats = async (id: string) => {
  await (await getDatabase()).updateDeckStats(id)
  notify()
  return true
}

export const addCollection = async (col: any) => {
  await (await getDatabase()).saveCollection(col)
  return col
}

export const importApkg = async (file: File) => {
  let msgId: string | undefined
  try {
    msgId = showMessage('导入中...', -1, 'info') as any
    const result = await ankiImportApkg(file, (msg) => showMessage(msg, -1, 'info', msgId as any))
    if (!result) return showMessage('导入失败', 3000, 'error', msgId as any)
    
    showMessage('创建卡组...', -1, 'info', msgId as any)
    const db = await getDatabase()
    const existing = new Set((await db.getDecks()).map(d => d.name))
    const sorted = result.decks.sort((a, b) => a.name.split('::').length - b.name.split('::').length)
    
    for (const deckInfo of sorted) {
      if (existing.has(deckInfo.name)) continue
      
      const total = await getAnkiCardCount(result.collectionId, deckInfo.id)
      if (total === 0 && !sorted.some(d => d.name.startsWith(deckInfo.name + '::') && !existing.has(d.name))) continue
      
      const deckName = deckInfo.name === 'Default' ? result.name : deckInfo.name
      const deckDesc = deckInfo.name === 'Default' ? `从 ${result.name} 导入的默认卡组` : (deckInfo.desc || `从 ${result.name} 导入`)
      
      await createPack(deckName, { desc: deckDesc, icon: '📥', color: '#10b981', tags: ['Anki'], collectionId: result.collectionId, ankiDeckId: deckInfo.id, stats: { total, new: total, learning: 0, review: 0, suspended: 0 } })
      existing.add(deckName)
    }
    
    showMessage(`✓ 已导入 ${result.decks.length} 个卡组`, 2000, 'info', msgId as any)
    notify()
    clearAnkiDbCache()
    return result
  } catch (e) {
    console.error('[Pack]', e)
    showMessage('导入失败: ' + (e as Error).message, 5000, 'error', msgId as any)
  }
}

export const exportApkg = async (_id: string) => showMessage('导出功能开发中...', 2000, 'info')
export const getMediaFromApkg = ankiGetMedia
