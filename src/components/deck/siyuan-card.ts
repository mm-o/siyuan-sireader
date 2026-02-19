// 思源闪卡双向同步
import { fetchSyncPost, showMessage } from 'siyuan'

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

// 状态
let ws: WebSocket | null = null
let timer: number | null = null
let enabled = false

// 缓存和防抖
const cache = new Map<string, { html: string, time: number }>()
const pending = new Map<string, NodeJS.Timeout>()
const CACHE_TTL = 5 * 60 * 1000
const DELAY = { add: 500, update: 1000 }

// 获取块 HTML
const getHTML = async (id: string, useCache = true) => {
  if (useCache) {
    const c = cache.get(id)
    if (c && Date.now() - c.time < CACHE_TTL) return c.html
  }
  const res = await fetchSyncPost('/api/filetree/getDoc', { id, mode: 0, size: 102400 })
  const html = (res?.data?.content || '').replace(/\{:[^}]+\}/g, '')
  if (html) {
    cache.set(id, { html, time: Date.now() })
    if (cache.size > 100) cache.delete(cache.keys().next().value)
  }
  return html
}

export const detectCardType = (html: string) => {
  if (/data-type="[^"]*\bmark\b[^"]*"/.test(html)) return 'card__block--hidemark'
  if (html.includes('data-type="NodeHeading"')) return 'card__block--hideh'
  if (html.includes('class="list"') || html.includes('class="li"')) return 'card__block--hideli'
  if (html.includes('class="sb"')) return 'card__block--hidesb'
  return ''
}

// 生成闪卡
const makeCard = (html: string) => {
  const type = detectCardType(html)
  const cls = type ? `card__block ${type}` : 'card__block'
  const wrap = (c: string) => `<div class="${c}"><div class="protyle-wysiwyg">${html}</div></div>`
  return { front: wrap(cls), back: wrap('card__block') }
}

// 插件 → 思源
export const updateSiyuanCard = async (id: string, front: string, back: string) => {
  try {
    await fetchSyncPost('/api/block/updateBlock', { id, dataType: 'markdown', data: `${front}\n\n${back}` })
  } catch {}
}

export const removeSiyuanCard = async (id: string) => {
  try {
    const res = await fetchSyncPost('/api/query/sql', {
      stmt: `SELECT DISTINCT a.value FROM attributes a WHERE a.name='custom-riff-decks' AND a.block_id='${id}'`
    })
    if (!res?.data?.length) return
    for (const row of res.data) {
      for (const deckId of row.value.split(',').filter(Boolean)) {
        await fetchSyncPost('/api/riff/removeRiffCards', { deckID: deckId.trim(), blockIDs: [id] })
      }
    }
  } catch {}
}

export const locateSiyuanCard = (id: string) => window.open(`siyuan://blocks/${id}`)

// 手动同步
export const syncAllSiyuanDecks = async (onComplete?: () => void) => {
  try {
    showMessage('正在同步...', 0, 'info')
    const decks = await getDecks()
    if (!decks.length) return showMessage('未找到卡组', 2000, 'info')
    
    const { getDatabase } = await import('./database')
    const { createPack } = await import('./pack')
    const db = await getDatabase()
    const existing = await db.getDecks()
    const deckMap = new Map(existing.map(d => [d.name, d]))
    
    let total = 0, success = 0
    const start = Date.now()
    
    // 并发导入（限制3个）
    for (let i = 0; i < decks.length; i += 3) {
      const batch = decks.slice(i, i + 3)
      const results = await Promise.all(batch.map(async deck => {
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
        return { size: deck.size || 0, count }
      }))
      results.forEach(r => { total += r.size; success += r.count })
      if (decks.length > 3) showMessage(`进度：${Math.min(i + 3, decks.length)}/${decks.length}`, 0, 'info')
    }
    
    const time = ((Date.now() - start) / 1000).toFixed(1)
    showMessage(`✓ 已同步 ${decks.length} 个卡组，${success}/${total} 张 (${time}s)`, 3000, 'info')
    onComplete?.()
  } catch (e: any) {
    showMessage(`同步失败：${e.message}`, 3000, 'error')
  }
}

// WebSocket 实时同步 - 仅在有思源卡组时启用
export const enableAutoSync = async () => {
  if (ws?.readyState === WebSocket.OPEN) return
  if (timer) clearTimeout(timer), timer = null
  
  try {
    // 检查是否有思源卡组
    const { getDatabase } = await import('./database')
    const db = await getDatabase()
    const decks = await db.getDecks()
    const hasSiyuan = decks.some(d => d.tags?.some(t => t === 'siyuan' || t.startsWith('siyuan-')))
    if (!hasSiyuan) return // 无思源卡组，不启用同步
    
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${protocol}//${location.host}/ws?app=siyuan-sireader&type=main`)
    
    ws.onopen = () => { enabled = true }
    
    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.cmd !== 'transactions' || !Array.isArray(msg.data)) return
        
        const adds: Array<{ id: string, deckIds: string }> = []
        const removes: string[] = []
        const updates: Array<{ id: string, data: string }> = []
        
        for (const tx of msg.data) {
          if (!tx.doOperations) continue
          for (const op of tx.doOperations) {
            if (op.action === 'updateAttrs' && op.data?.new?.['custom-riff-decks']) {
              adds.push({ id: op.id, deckIds: op.data.new['custom-riff-decks'] })
            } else if (op.action === 'removeFlashcards') {
              removes.push(...(op.blockIDs || op.ids || []))
            } else if (op.action === 'update' && op.id && op.data) {
              updates.push({ id: op.id, data: op.data })
              cache.delete(op.id)
            }
          }
        }
        
        if (adds.length) await Promise.all(adds.map(op => debounce('add', op.id, () => handleAdd(op.id, op.deckIds))))
        if (removes.length) await handleRemove(removes)
        if (updates.length) await Promise.all(updates.map(op => debounce('update', op.id, () => handleUpdate(op.id, op.data))))
      } catch {}
    }
    
    ws.onerror = () => { enabled = false }
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
  pending.forEach(t => clearTimeout(t))
  pending.clear()
}

// 防抖处理
const debounce = (type: 'add' | 'update', id: string, fn: () => Promise<void>) => {
  const key = `${type}-${id}`
  if (pending.has(key)) clearTimeout(pending.get(key)!)
  return new Promise<void>(resolve => {
    const timeout = setTimeout(async () => {
      pending.delete(key)
      await fn()
      resolve()
    }, DELAY[type])
    pending.set(key, timeout)
  })
}

// 思源 → 插件
const handleAdd = async (id: string, deckIds: string) => {
  if (!enabled) return
  try {
    const { getDatabase } = await import('./database')
    const { createPack } = await import('./pack')
    const db = await getDatabase()
    const allDecks = await db.getDecks()
    const siyuanDecks = allDecks.filter(d => d.tags?.some(t => t === 'siyuan' || t.startsWith('siyuan-')))
    if (!siyuanDecks.length) return // 无思源卡组，跳过
    
    for (const deckId of deckIds.split(',').filter(Boolean)) {
      const did = deckId.trim()
      let deck = siyuanDecks.find(d => d.tags?.includes(`siyuan-${did}`)) || 
                 siyuanDecks.find(d => d.name.includes(did.substring(0, 8)))
      
      if (deck) {
        const needUpdate = !deck.tags?.includes(`siyuan-${did}`) || !deck.enabled
        if (needUpdate) {
          if (!deck.tags?.includes(`siyuan-${did}`)) deck.tags = [...(deck.tags || []), `siyuan-${did}`]
          deck.enabled = true
          await db.saveDeck(deck)
        }
      } else {
        deck = await createPack(`快速制卡 ${did.substring(0, 8)}`, {
          desc: '思源同步：快速制卡', 
          tags: ['siyuan', `siyuan-${did}`], 
          color: '#42a5f5', 
          enabled: true
        })
      }
      
      if (await importBlock(id, deck.id, did)) {
        await db.updateDeckStats(deck.id)
        showMessage('✓ 已导入新卡片', 2000, 'info')
        notifyAll()
      }
    }
  } catch {}
}

const handleRemove = async (ids: string[]) => {
  if (!enabled || !ids?.length) return
  try {
    const { getDatabase } = await import('./database')
    const { getAnkiDb, deleteAnkiCard } = await import('./anki')
    const db = await getDatabase()
    const allProgress = await db.getAllProgress()
    
    const tasks: Promise<any>[] = []
    const decks = new Set<string>()
    let count = 0
    
    for (const id of ids) {
      const tag = `siyuan-block-${id}`
      cache.delete(id)
      
      for (const p of allProgress) {
        const deck = await db.getDeck(p.deckId)
        if (!deck?.collectionId) continue
        
        const ankiDb = await getAnkiDb(deck.collectionId)
        const exists = ankiDb?.exec(`SELECT COUNT(*) FROM notes WHERE tags LIKE '%${tag}%'`)?.[0]?.values[0]?.[0]
        if (!exists) continue
        
        tasks.push(Promise.all([
          p.ankiCardId ? deleteAnkiCard(p.collectionId!, p.ankiCardId, p.ankiNoteId) : Promise.resolve(),
          db.deleteProgress(p.id)
        ]))
        decks.add(p.deckId)
        count++
        break
      }
    }
    
    if (tasks.length) {
      await Promise.all(tasks)
      await Promise.all(Array.from(decks).map(d => db.updateDeckStats(d)))
      showMessage(`✓ 已删除 ${count} 张`, 2000, 'info')
      notifyAll()
    }
  } catch {}
}

const handleUpdate = async (id: string, data: string) => {
  if (!enabled || !id || !data) return
  try {
    const { getDatabase } = await import('./database')
    const { getAnkiDb, saveAnkiDb } = await import('./anki')
    
    const html = await getHTML(id, false)
    if (!html) return
    
    const { front, back } = makeCard(html)
    const tag = `siyuan-block-${id}`
    const db = await getDatabase()
    const allProgress = await db.getAllProgress()
    const updated = new Set<string>()
    const tasks: Promise<any>[] = []
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
        tasks.push(saveAnkiDb(p.collectionId!, ankiDb))
        updated.add(p.collectionId!)
      }
      count++
    }
    
    if (tasks.length) {
      await Promise.all(tasks)
      showMessage(`✓ 已更新 ${count} 张`, 2000, 'info')
      notifyAll()
    }
  } catch {}
}

// 卡组和卡片导入
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
  
  const quick = Array.from(quickIds).length ? await Promise.all(
    Array.from(quickIds).map(async id => {
      const res = await fetchSyncPost('/api/query/sql', {
        stmt: `SELECT COUNT(DISTINCT b.id) as c FROM blocks b 
               JOIN attributes a ON b.id=a.block_id 
               WHERE a.name='custom-riff-decks' 
               AND (a.value='${id}' OR a.value LIKE '${id},%' OR a.value LIKE '%,${id},%' OR a.value LIKE '%,${id}')`
      })
      const existing = traditional.find((d: any) => d.id === id)
      return { 
        id, 
        name: existing?.name || `快速制卡 ${id.substring(0, 8)}`, 
        size: res?.data?.[0]?.c || 0, 
        type: 'quick' 
      }
    })
  ) : []
  
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
           AND (a.value='${deckId}' OR a.value LIKE '${deckId},%' OR a.value LIKE '%,${deckId},%' OR a.value LIKE '%,${deckId}')
           ORDER BY b.updated DESC`
  }).then(res => res?.data || [])
  
  if (!blocks.length) {
    blocks = await fetchSyncPost('/api/riff/getRiffCards', { 
      id: deckId, page: 1, pageSize: 9999 
    }).then(res => res?.data?.blocks || [])
  }
  
  let count = 0
  for (let i = 0; i < blocks.length; i += 5) {
    const batch = blocks.slice(i, i + 5)
    const results = await Promise.all(batch.map((b: any) => importBlock(b.id, targetId, deckId)))
    count += results.filter(Boolean).length
  }
  return count
}

const importBlock = async (id: string, deckId: string, siyuanDeckId: string) => {
  try {
    const { addCard } = await import('./card')
    const { getDatabase } = await import('./database')
    const { getAnkiDb } = await import('./anki')
    
    const db = await getDatabase()
    const deck = await db.getDeck(deckId)
    if (!deck?.collectionId) return false
    
    const ankiDb = await getAnkiDb(deck.collectionId)
    if (ankiDb) {
      const tag = `siyuan-block-${id}`
      const exists = ankiDb.exec(`SELECT COUNT(*) FROM notes WHERE tags LIKE '%${tag}%'`)?.[0]?.values[0]?.[0]
      if (exists) return false
    }
    
    const html = await getHTML(id)
    if (!html) return false
    
    const { front, back } = makeCard(html)
    return await addCard(deckId, front, back, {
      tags: ['siyuan', siyuanDeckId, `siyuan-block-${id}`], 
      source: 'import' as const, 
      modelCss: CSS
    })
  } catch { 
    return false 
  }
}
