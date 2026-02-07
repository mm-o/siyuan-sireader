// 思源闪卡双向同步
import { fetchSyncPost, showMessage } from 'siyuan'

// ==================== 常量定义 ====================
const CSS = `.card{font-family:var(--b3-font-family);font-size:16px;line-height:1.6;color:var(--b3-theme-on-surface);padding:20px;background:var(--b3-theme-surface)}
.card__block--hidemark span[data-type~=mark]{font-size:0!important}
.card__block--hidemark span[data-type~=mark]::before{content:" [...] ";color:var(--b3-theme-primary-light);font-size:16px;font-weight:bold}
.card__block--hideli .list[custom-riff-decks]>.li:nth-child(n+2){display:none!important}
.card__block--hideli .list[custom-riff-decks] .li>.list{display:none!important}
.card__block--hideli .li[custom-riff-decks]>.list{display:none!important}
.card__block--hidesb .sb[custom-riff-decks]>div:nth-of-type(n+2){display:none}
.card__block--hideh [data-type="NodeHeading"][custom-riff-decks]~div{display:none}`

const notifyAll = () => {
  window.dispatchEvent(new Event('sireader:pack-updated'))
  window.dispatchEvent(new Event('sireader:deck-updated'))
}

// ==================== WebSocket 状态 ====================
let ws: WebSocket | null = null
let timer: number | null = null
let enabled = false

// ==================== 核心工具函数 ====================

/** 获取块的完整 HTML（包含子块），自动清理 IAL */
const getBlockHTML = async (blockId: string) => {
  const res = await fetchSyncPost('/api/filetree/getDoc', { id: blockId, mode: 0, size: 102400 })
  return (res?.data?.content || '').replace(/\{:[^}]+\}/g, '')
}

/** 检测闪卡类型并返回对应的 CSS 类 */
export const detectCardType = (html: string) => {
  if (html.includes('data-type~="mark"') || html.includes('data-type="mark"')) return 'card__block--hidemark'
  if (html.includes('data-type="NodeHeading"')) return 'card__block--hideh'
  if (html.includes('class="list"') || html.includes('class="li"')) return 'card__block--hideli'
  if (html.includes('class="sb"')) return 'card__block--hidesb'
  return ''
}

/** 生成闪卡的正反面 HTML */
const makeCard = (html: string) => {
  const cardType = detectCardType(html)
  const cardClass = cardType ? `card__block ${cardType}` : 'card__block'
  const wrap = (cls: string) => `<div class="${cls}"><div class="protyle-wysiwyg">${html}</div></div>`
  return { front: wrap(cardClass), back: wrap('card__block') }
}

// ==================== 插件 → 思源 ====================

export const updateSiyuanCard = async (blockId: string, front: string, back: string) => {
  try {
    await fetchSyncPost('/api/block/updateBlock', { 
      id: blockId, dataType: 'markdown', data: `${front}\n\n${back}` 
    })
  } catch {}
}

export const removeSiyuanCard = async (blockId: string) => {
  try {
    const res = await fetchSyncPost('/api/query/sql', {
      stmt: `SELECT DISTINCT a.value FROM attributes a WHERE a.name='custom-riff-decks' AND a.block_id='${blockId}'`
    })
    if (!res?.data?.length) return
    
    for (const row of res.data) {
      for (const deckId of row.value.split(',').filter(Boolean)) {
        await fetchSyncPost('/api/riff/removeRiffCards', { deckID: deckId.trim(), blockIDs: [blockId] })
      }
    }
  } catch {}
}

export const locateSiyuanCard = (blockId: string) => window.open(`siyuan://blocks/${blockId}`)

// ==================== 手动同步 ====================

export const syncAllSiyuanDecks = async (onComplete?: () => void) => {
  try {
    const decks = await getDecks()
    if (!decks.length) return showMessage('未找到思源卡组', 2000, 'info')
    
    const { getDatabase } = await import('./database')
    const { createPack } = await import('./pack')
    const db = await getDatabase()
    const existing = await db.getDecks()
    const deckMap = new Map(existing.map(d => [d.name, d]))
    
    let total = 0, success = 0
    for (const deck of decks) {
      let target = deckMap.get(deck.name)
      if (!target) {
        target = await createPack(deck.name, {
          desc: `思源同步：${deck.type === 'quick' ? '快速制卡' : '卡包'}`,
          tags: ['siyuan'], 
          color: deck.type === 'quick' ? '#42a5f5' : '#667eea'
        })
        deckMap.set(deck.name, target)
      }
      const count = await importDeck(deck.id, target.id)
      total += deck.size || 0
      success += count
    }
    showMessage(`已同步 ${decks.length} 个卡组，${success}/${total} 张`, 2000, 'info')
    onComplete?.()
  } catch (e: any) {
    showMessage(`同步失败：${e.message}`, 2000, 'error')
  }
}

// ==================== WebSocket 实时同步 ====================

export const enableAutoSync = () => {
  if (ws?.readyState === WebSocket.OPEN) return
  if (timer) clearTimeout(timer), timer = null
  
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${protocol}//${window.location.host}/ws?app=siyuan-sireader&type=main`)
    
    ws.onopen = () => enabled = true
    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.cmd !== 'transactions' || !Array.isArray(msg.data)) return
        
        for (const tx of msg.data) {
          if (!tx.doOperations) continue
          for (const op of tx.doOperations) {
            if (op.action === 'updateAttrs' && op.data?.new?.['custom-riff-decks']) {
              await handleAdd(op.id, op.data.new['custom-riff-decks'])
            } else if (op.action === 'removeFlashcards') {
              await handleRemove(op.blockIDs || op.ids || [])
            } else if (op.action === 'update' && op.id && op.data) {
              await handleUpdate(op.id, op.data)
            }
          }
        }
      } catch {}
    }
    ws.onerror = () => enabled = false
    ws.onclose = (ev) => {
      enabled = false
      ws = null
      if (ev.code !== 1000 && !ev.reason.includes('close websocket')) {
        timer = window.setTimeout(enableAutoSync, 3000)
      }
    }
  } catch {}
}

export const disableAutoSync = () => {
  enabled = false
  if (timer) clearTimeout(timer), timer = null
  if (ws) ws.close(1000, 'close websocket'), ws = null
}

// ==================== 思源 → 插件 ====================

const handleAdd = async (blockId: string, deckIds: string) => {
  if (!enabled) return
  try {
    const { getDatabase } = await import('./database')
    const { createPack } = await import('./pack')
    const db = await getDatabase()
    const allDecks = await db.getDecks()
    
    for (const deckId of deckIds.split(',').filter(Boolean)) {
      const id = deckId.trim()
      let deck = allDecks.find(d => d.tags?.includes(`siyuan-${id}`)) || 
                 allDecks.find(d => d.name.includes(id.substring(0, 8)) && d.tags?.includes('siyuan'))
      
      if (deck) {
        const needUpdate = !deck.tags?.includes(`siyuan-${id}`) || !deck.enabled
        if (needUpdate) {
          if (!deck.tags?.includes(`siyuan-${id}`)) deck.tags = [...(deck.tags || []), `siyuan-${id}`]
          deck.enabled = true
          await db.saveDeck(deck)
        }
      } else {
        deck = await createPack(`快速制卡 ${id.substring(0, 8)}`, {
          desc: '思源同步：快速制卡', 
          tags: ['siyuan', `siyuan-${id}`], 
          color: '#42a5f5', 
          enabled: true
        })
      }
      
      if (await importBlock(blockId, deck.id, id)) {
        await db.updateDeckStats(deck.id)
        showMessage('已自动导入新卡片', 2000, 'info')
        notifyAll()
      }
    }
  } catch {}
}

const handleRemove = async (blockIDs: string[]) => {
  if (!enabled || !blockIDs?.length) return
  try {
    const { getDatabase } = await import('./database')
    const { getAnkiDb, deleteAnkiCard } = await import('./anki')
    const db = await getDatabase()
    const allProgress = await db.getAllProgress()
    
    let count = 0
    for (const blockId of blockIDs) {
      const tag = `siyuan-block-${blockId}`
      for (const p of allProgress) {
        const deck = await db.getDeck(p.deckId)
        if (!deck?.collectionId) continue
        
        const ankiDb = await getAnkiDb(deck.collectionId)
        const exists = ankiDb?.exec(`SELECT COUNT(*) FROM notes WHERE tags LIKE '%${tag}%'`)?.[0]?.values[0]?.[0]
        if (!exists) continue
        
        await Promise.all([
          p.ankiCardId ? deleteAnkiCard(p.collectionId!, p.ankiCardId, p.ankiNoteId) : Promise.resolve(),
          db.deleteProgress(p.id),
          db.updateDeckStats(p.deckId)
        ])
        count++
        break
      }
    }
    
    if (count > 0) {
      showMessage(`已删除 ${count} 张卡片`, 2000, 'info')
      notifyAll()
    }
  } catch {}
}

const handleUpdate = async (blockId: string, data: string) => {
  if (!enabled || !blockId || !data) return
  
  try {
    const { getDatabase } = await import('./database')
    const { getAnkiDb, saveAnkiDb } = await import('./anki')
    
    const html = await getBlockHTML(blockId)
    if (!html) return
    
    const { front, back } = makeCard(html)
    const tag = `siyuan-block-${blockId}`
    const db = await getDatabase()
    const allProgress = await db.getAllProgress()
    const updated = new Set<string>()
    
    let count = 0
    for (const p of allProgress.filter(p => p.collectionId && p.ankiNoteId)) {
      const ankiDb = await getAnkiDb(p.collectionId!)
      if (!ankiDb) continue
      
      const tags = ankiDb.exec(`SELECT tags FROM notes WHERE id = ${p.ankiNoteId}`)?.[0]?.values[0]?.[0] as string
      if (!tags?.includes(tag)) continue
      
      ankiDb.run(`UPDATE notes SET flds = ?, mod = ? WHERE id = ?`, [
        [front, back].join('\x1f'), Date.now(), p.ankiNoteId
      ])
      
      if (!updated.has(p.collectionId!)) {
        await saveAnkiDb(p.collectionId!, ankiDb)
        updated.add(p.collectionId!)
      }
      count++
    }
    
    if (count > 0) {
      showMessage(`已同步更新 ${count} 张卡片`, 2000, 'info')
      notifyAll()
    }
  } catch {}
}

// ==================== 卡组和卡片导入 ====================

const getDecks = async () => {
  const [deckRes, attrRes] = await Promise.all([
    fetchSyncPost('/api/riff/getRiffDecks', {}),
    fetchSyncPost('/api/query/sql', { 
      stmt: `SELECT DISTINCT a.value FROM attributes a WHERE a.name='custom-riff-decks' AND a.value!=''` 
    })
  ])
  
  const traditional = (deckRes?.data || []).map((d: any) => ({ ...d, type: 'traditional' }))
  
  const quickIds = new Set<string>()
  attrRes?.data?.forEach((row: any) => {
    row.value.split(',').filter(Boolean).forEach((id: string) => quickIds.add(id.trim()))
  })
  
  const quick = await Promise.all(Array.from(quickIds).map(async id => {
    const res = await fetchSyncPost('/api/query/sql', {
      stmt: `SELECT COUNT(DISTINCT b.id) as c FROM blocks b 
             JOIN attributes a ON b.id=a.block_id 
             WHERE a.name='custom-riff-decks' 
             AND (a.value='${id}' OR a.value LIKE '%,${id},%' OR a.value LIKE '${id},%' OR a.value LIKE '%,${id}')`
    })
    const existing = traditional.find((d: any) => d.id === id)
    return { 
      id, 
      name: existing?.name || `快速制卡 ${id.substring(0, 8)}`, 
      size: res?.data?.[0]?.c || 0, 
      type: 'quick' 
    }
  }))
  
  const map = new Map()
  ;[...traditional, ...quick].forEach(d => {
    if (!map.has(d.id) || d.type === 'traditional') map.set(d.id, d)
  })
  
  return Array.from(map.values())
}

const importDeck = async (deckId: string, targetId: string) => {
  let blocks = await fetchSyncPost('/api/query/sql', {
    stmt: `SELECT DISTINCT b.id FROM blocks b 
           JOIN attributes a ON b.id=a.block_id 
           WHERE a.name='custom-riff-decks' 
           AND (a.value='${deckId}' OR a.value LIKE '%,${deckId},%' OR a.value LIKE '${deckId},%' OR a.value LIKE '%,${deckId}')
           ORDER BY b.updated DESC`
  }).then(res => res?.data || [])
  
  if (!blocks.length) {
    blocks = await fetchSyncPost('/api/riff/getRiffCards', { 
      id: deckId, page: 1, pageSize: 9999 
    }).then(res => res?.data?.blocks || [])
  }
  
  let count = 0
  for (const block of blocks) {
    if (await importBlock(block.id, targetId, deckId)) count++
  }
  return count
}

const importBlock = async (blockId: string, deckId: string, siyuanDeckId: string) => {
  try {
    const { addCard } = await import('./card')
    const { getDatabase } = await import('./database')
    const { getAnkiDb } = await import('./anki')
    
    const db = await getDatabase()
    const deck = await db.getDeck(deckId)
    if (!deck?.collectionId) return false
    
    const ankiDb = await getAnkiDb(deck.collectionId)
    if (ankiDb) {
      const tag = `siyuan-block-${blockId}`
      const exists = ankiDb.exec(`SELECT COUNT(*) FROM notes WHERE tags LIKE '%${tag}%'`)?.[0]?.values[0]?.[0]
      if (exists) return false
    }
    
    const html = await getBlockHTML(blockId)
    if (!html) return false
    
    const { front, back } = makeCard(html)
    
    return await addCard(deckId, front, back, {
      tags: ['siyuan', siyuanDeckId, `siyuan-block-${blockId}`], 
      source: 'import' as const, 
      modelCss: CSS
    })
  } catch { 
    return false 
  }
}
