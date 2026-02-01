// 卡组管理和 Anki 导入导出
// 负责：卡组 CRUD、Anki 导入、媒体管理
import type { Plugin } from 'siyuan'
import { showMessage } from 'siyuan'
import type { Pack } from './types'
import { getDatabase } from './database'
import { 
  importApkg as ankiImportApkg, 
  getMediaFromApkg as ankiGetMedia,
  createAnkiDatabase,
  getAnkiCardCount,
  clearAnkiDbCache
} from './anki'

const DEF_STATS = { total: 0, new: 0, learning: 0, review: 0, suspended: 0 }

let plugin: Plugin | null = null

const notify = () => window.dispatchEvent(new Event('sireader:pack-updated'))

export const initPack = async (p: Plugin) => {
  plugin = p
  const db = await getDatabase()
  await db.init()
  
  // 确保默认卡组存在
  const decks = await db.getDecks()
  if (!decks.find(d => d.id === 'default')) {
    const collectionId = 'default-col'
    await createAnkiDatabase(collectionId, '默认集合')
    await db.saveDeck({
      id: 'default', name: '默认卡组', desc: '未分类卡片', icon: '📚', color: '#667eea',
      collectionId, ankiDeckId: 1, stats: { ...DEF_STATS }, settings: {} as any,
      created: Date.now(), updated: Date.now()
    })
  }
}

// ========== 卡片业务逻辑（重新导出） ==========
// 卡片相关功能已迁移到 card.ts
export { getCards, getTodayDueCards, addCard, removeCard } from './card'

// ========== 卡组业务逻辑 ==========

export const getPack = async () => (await getDatabase()).getDecks()
export const getCollection = async () => (await getDatabase()).getCollections()

export const createPack = async (name: string, opts?: Partial<Pack>) => {
  const db = await getDatabase()
  
  let collectionId = opts?.collectionId
  if (!collectionId) {
    collectionId = `col-${Date.now()}`
    await createAnkiDatabase(collectionId, name)
  }
  
  const pack: Pack = {
    id: opts?.id || `pack-${Date.now()}`,
    name,
    desc: opts?.desc,
    icon: opts?.icon || '📦',
    color: opts?.color || '#667eea',
    titleImg: opts?.titleImg,
    tags: opts?.tags || [],
    parent: opts?.parent,
    collectionId,
    ankiDeckId: opts?.ankiDeckId || 1,
    settings: {} as any,
    stats: { ...DEF_STATS, ...opts?.stats },
    enabled: opts?.enabled || false,
    created: Date.now(),
    updated: Date.now()
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
  await (await getDatabase()).deleteDeck(id)
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

// ========== Anki 导入/导出 ==========

export const importApkg = async (file: File) => {
  let msgId: string | undefined
  
  try {
    msgId = showMessage('导入中...', -1, 'info') as any
    
    const result = await ankiImportApkg(file, (msg) => {
      showMessage(msg, -1, 'info', msgId as any)
    })
    
    if (!result) {
      showMessage('导入失败', 3000, 'error', msgId as any)
      return
    }
    
    showMessage('创建卡组...', -1, 'info', msgId as any)
    const db = await getDatabase()
    
    await Promise.all(result.decks.map(async (deckInfo: any) => {
      const total = await getAnkiCardCount(result.collectionId, deckInfo.id)
      
      return createPack(deckInfo.name, {
        desc: deckInfo.desc || `从 ${result.name} 导入`,
        icon: '📥', color: '#10b981', tags: ['Anki', result.name],
        collectionId: result.collectionId, ankiDeckId: deckInfo.id,
        parent: deckInfo.parent,
        stats: { total, new: total, learning: 0, review: 0, suspended: 0 }
      })
    }))
    
    showMessage(`✓ 已导入 ${result.decks.length} 个卡组`, 2000, 'info', msgId as any)
    notify()
    clearAnkiDbCache()
    
    return result
  } catch (e) {
    console.error('[Import]', e)
    showMessage('导入失败: ' + (e as Error).message, 3000, 'error', msgId as any)
  }
}

export const exportApkg = async (_id: string) => showMessage('导出功能开发中...', 2000, 'info')

// ========== 媒体（重新导出） ==========
export const getMediaFromApkg = ankiGetMedia
