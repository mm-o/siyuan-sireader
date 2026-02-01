// Anki 数据库访问层
// 负责：Anki 数据库连接、查询、CRUD、媒体处理
import initSqlJs from 'sql.js'
import JSZip from 'jszip'
import { putFile } from '@/api'

const ANKI_BASE = '/data/storage/petal/siyuan-sireader/anki'

// ========== SQL.js 实例管理 ==========
let sqlJs: any = null

const getSqlJs = async () => {
  if (!sqlJs) {
    sqlJs = await initSqlJs({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/${f}`
    })
  }
  return sqlJs
}

// ========== Anki 数据库缓存 ==========
const ankiDbCache = new Map<string, any>()

export const getAnkiDbPath = (collectionId: string) => 
  `${ANKI_BASE}/${collectionId}/collection.anki21`

export const getAnkiDb = async (collectionId: string) => {
  const path = getAnkiDbPath(collectionId)
  if (ankiDbCache.has(path)) return ankiDbCache.get(path)
  
  try {
    const res = await fetch('/api/file/getFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    })
    
    if (!res.ok) return null
    
    const buffer = await res.arrayBuffer()
    if (!buffer.byteLength) return null
    
    const SQL = await getSqlJs()
    const db = new SQL.Database(new Uint8Array(buffer))
    ankiDbCache.set(path, db)
    return db
  } catch {
    return null
  }
}

export const saveAnkiDb = async (collectionId: string, db: any) => {
  const path = getAnkiDbPath(collectionId)
  const data = db.export()
  const formData = new FormData()
  formData.append('path', path)
  formData.append('file', new File([data], 'collection.anki21', { type: 'application/x-sqlite3' }))
  formData.append('isDir', 'false')
  await fetch('/api/file/putFile', { method: 'POST', body: formData })
  ankiDbCache.delete(path)
}

export const clearAnkiDbCache = () => ankiDbCache.clear()

// ========== Anki 卡片查询 ==========

/**
 * 查询 Anki 卡片（底层查询，返回原始数据）
 */
export const queryAnkiCards = async (
  collectionId: string,
  deckId: number,
  limit = 100,
  offset = 0
): Promise<any[]> => {
  try {
    const ankiDb = await getAnkiDb(collectionId)
    if (!ankiDb) return []
    
    const result = ankiDb.exec(`
      SELECT c.id, c.nid, c.did, c.ord, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses,
             n.flds, n.tags, n.mid 
      FROM cards c 
      JOIN notes n ON c.nid = n.id 
      WHERE c.did = ${deckId} 
      ORDER BY c.id 
      LIMIT ${limit} OFFSET ${offset}
    `)
    
    if (!result?.[0]) return []
    
    const models = JSON.parse(ankiDb.exec('SELECT models FROM col')[0].values[0][0] as string)
    
    return result[0].values.map((row: any) => {
      const [id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, flds, tags, mid] = row
      const fields = flds.split('\x1f')
      const model = models[mid]
      const template = model?.tmpls?.[ord]
      
      let front = fields[0] || '', back = fields[1] || ''
      
      if (template && model?.flds) {
        const fieldMap = Object.fromEntries(model.flds.map((f: any, i: number) => [f.name, fields[i] || '']))
        const replace = (html: string) => Object.entries(fieldMap).reduce((h, [k, v]) => h.replace(new RegExp(`{{${k}}}`, 'g'), v as string), html)
        
        front = replace(template.qfmt || front)
        back = replace(template.afmt || back).replace(/{{FrontSide}}/g, front)
      }
      
      return {
        id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, fields,
        tags: tags.trim().split(' ').filter(Boolean),
        model: model?.name || 'Unknown',
        modelCss: model?.css || '',
        front: processMedia(front, collectionId),
        back: processMedia(back, collectionId)
      }
    })
  } catch {
    return []
  }
}

/**
 * 添加 Anki 卡片
 */
export const insertAnkiCard = async (
  collectionId: string,
  deckId: number,
  front: string,
  back: string,
  tags: string[] = [],
  modelCss?: string
): Promise<{ noteId: number; cardId: number } | null> => {
  try {
    const ankiDb = await getAnkiDb(collectionId)
    if (!ankiDb) return null
    
    const now = Date.now()
    const noteId = now
    const cardId = now
    
    // 如果提供了自定义 CSS，更新 model
    if (modelCss) {
      const colResult = ankiDb.exec('SELECT models FROM col')
      if (colResult?.[0]) {
        const models = JSON.parse(colResult[0].values[0][0] as string)
        if (models['1']) {
          models['1'].css = modelCss
          ankiDb.run('UPDATE col SET models = ?', [JSON.stringify(models)])
        }
      }
    }
    
    const fields = `${front}\x1f${back}`
    const tagsStr = tags.join(' ')
    
    ankiDb.run(`INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [noteId, `${noteId}`, 1, now, -1, tagsStr, fields, front.slice(0, 100), 0, 0, ''])
    
    ankiDb.run(`INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [cardId, noteId, deckId, 0, now, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ''])
    
    await saveAnkiDb(collectionId, ankiDb)
    
    return { noteId, cardId }
  } catch {
    return null
  }
}

/**
 * 删除 Anki 卡片
 */
export const deleteAnkiCard = async (
  collectionId: string,
  cardId: number,
  noteId?: number
): Promise<boolean> => {
  try {
    const ankiDb = await getAnkiDb(collectionId)
    if (!ankiDb) return false
    
    ankiDb.run('DELETE FROM cards WHERE id = ?', [cardId])
    if (noteId) ankiDb.run('DELETE FROM notes WHERE id = ?', [noteId])
    
    await saveAnkiDb(collectionId, ankiDb)
    return true
  } catch {
    return false
  }
}

/**
 * 获取 Anki 卡片数量
 */
export const getAnkiCardCount = async (collectionId: string, deckId: number): Promise<number> => {
  try {
    const ankiDb = await getAnkiDb(collectionId)
    if (!ankiDb) return 0
    const result = ankiDb.exec(`SELECT COUNT(*) FROM cards WHERE did = ${deckId}`)
    return result?.[0]?.values[0][0] || 0
  } catch {
    return 0
  }
}

/**
 * 创建 Anki 数据库
 */
export const createAnkiDatabase = async (collectionId: string, name: string): Promise<boolean> => {
  try {
    const SQL = await getSqlJs()
    const ankiDb = new SQL.Database()
    const now = Date.now()
    
    const models = JSON.stringify({
      "1": {
        "id": 1, "name": "Basic", "type": 0,
        "flds": [{ "name": "Front", "ord": 0 }, { "name": "Back", "ord": 1 }],
        "tmpls": [{ "name": "Card 1", "ord": 0, "qfmt": "{{Front}}", "afmt": "{{FrontSide}}<hr>{{Back}}" }],
        "css": ".card{font-family:arial;font-size:20px;text-align:center;color:#000;background-color:#fff;}"
      }
    })
    
    const decks = JSON.stringify({ "1": { "id": 1, "name": name, "desc": "", "mod": now } })
    
    ankiDb.exec(`
      CREATE TABLE col (id INTEGER PRIMARY KEY, crt INTEGER NOT NULL, mod INTEGER NOT NULL, scm INTEGER NOT NULL,
        ver INTEGER NOT NULL, dty INTEGER NOT NULL, usn INTEGER NOT NULL, ls INTEGER NOT NULL,
        conf TEXT NOT NULL, models TEXT NOT NULL, decks TEXT NOT NULL, dconf TEXT NOT NULL, tags TEXT NOT NULL);
      INSERT INTO col VALUES(1,${now},${now},${now},11,0,-1,0,'{}','${models}','${decks}','{}','{}');
      
      CREATE TABLE notes (id INTEGER PRIMARY KEY, guid TEXT NOT NULL, mid INTEGER NOT NULL, mod INTEGER NOT NULL,
        usn INTEGER NOT NULL, tags TEXT NOT NULL, flds TEXT NOT NULL, sfld TEXT NOT NULL,
        csum INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL);
      
      CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER NOT NULL, did INTEGER NOT NULL, ord INTEGER NOT NULL,
        mod INTEGER NOT NULL, usn INTEGER NOT NULL, type INTEGER NOT NULL, queue INTEGER NOT NULL,
        due INTEGER NOT NULL, ivl INTEGER NOT NULL, factor INTEGER NOT NULL, reps INTEGER NOT NULL,
        lapses INTEGER NOT NULL, left INTEGER NOT NULL, odue INTEGER NOT NULL, odid INTEGER NOT NULL,
        flags INTEGER NOT NULL, data TEXT NOT NULL);
      
      CREATE INDEX ix_notes_usn ON notes (usn);
      CREATE INDEX ix_cards_usn ON cards (usn);
      CREATE INDEX ix_cards_nid ON cards (nid);
      CREATE INDEX ix_cards_sched ON cards (did, queue, due);
    `)
    
    await saveAnkiDb(collectionId, ankiDb)
    ankiDb.close()
    
    return true
  } catch {
    return false
  }
}

// ========== 媒体处理 ==========

const processMedia = (html: string, cid: string) => {
  // 音频
  html = html.replace(/\[sound:([^\]]+)\]/g, (_, f) => 
    `<svg class="anki-audio" data-cid="${cid}" data-file="${f}"><use xlink:href="#iconRecord"/></svg>`
  )
  html = html.replace(/<audio[^>]*?src=["']([^"']+)["'][^>]*?>.*?<\/audio>/gi, (_, src) => {
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return `<svg class="anki-audio" data-url="${src}"><use xlink:href="#iconRecord"/></svg>`
    }
    const filename = src.split('?')[0].split('/').pop() || src
    return `<svg class="anki-audio" data-cid="${cid}" data-file="${filename}"><use xlink:href="#iconRecord"/></svg>`
  })
  
  // 图片
  html = html.replace(/<img([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (m, before, src, after) => {
    if (src.startsWith('http')) return m
    const attrs = `${before}${after}`.replace(/\s+/g, ' ').trim()
    return `<img ${attrs} data-cid="${cid}" data-file="${src}" src="" loading="lazy" style="min-height:100px;background:#f5f5f5">`
  })
  
  return html
}

// 媒体缓存
const mediaCache = new Map<string, Blob>()
const MAX_CACHE = 5 * 1024 * 1024

/**
 * 从 .apkg 提取媒体文件
 */
export const getMediaFromApkg = async (cid: string, filename: string): Promise<Blob | null> => {
  const key = `${cid}:${filename}`
  if (mediaCache.has(key)) return mediaCache.get(key)!
  
  try {
    const { getDatabase } = await import('./database')
    const db = await getDatabase()
    const collections = await db.getCollections()
    const col = collections.find(c => c.id === cid)
    if (!col?.apkgPath) return null
    
    const res = await fetch('/api/file/getFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: col.apkgPath })
    })
    if (!res.ok) return null
    
    const zip = await JSZip.loadAsync(await res.arrayBuffer())
    const mediaFile = zip.file('media')
    if (!mediaFile) return null
    
    const mediaMap = JSON.parse(await mediaFile.async('text'))
    const lower = filename.toLowerCase()
    
    const num = Object.entries(mediaMap).find(([_, n]) => n === filename || (n as string).toLowerCase() === lower)?.[0]
    if (!num) return null
    
    const file = zip.file(num as string)
    if (!file) return null
    
    const blob = await file.async('blob')
    if (blob.size < MAX_CACHE) mediaCache.set(key, blob)
    
    return blob
  } catch (e) {
    console.error('[Media]', filename, e)
    return null
  }
}

/**
 * 导入 .apkg 文件
 */
export const importApkg = async (file: File, onProgress?: (msg: string) => void) => {
  try {
    onProgress?.('解析文件...')
    
    const zip = await JSZip.loadAsync(file)
    const dbFile = zip.file('collection.anki21') || zip.file('collection.anki2')
    if (!dbFile) throw new Error('无效 .apkg 文件')
    
    const cid = `col-${Date.now()}`
    const name = file.name.replace('.apkg', '')
    const dbBuffer = await dbFile.async('arraybuffer')
    
    onProgress?.('保存数据...')
    const dbPath = getAnkiDbPath(cid)
    await Promise.all([
      putFile(dbPath, false, new File([dbBuffer], 'collection.anki21', { type: 'application/x-sqlite3' })),
      putFile(`${ANKI_BASE}/${cid}/source.apkg`, false, file)
    ])
    
    onProgress?.('解析卡组...')
    const ankiDb = await getAnkiDb(cid)
    if (!ankiDb) throw new Error('无效数据库')
    
    const colData = ankiDb.exec('SELECT decks FROM col')[0]
    if (!colData) throw new Error('无效数据库')
    
    const decks = JSON.parse(colData.values[0][0] as string)
    
    // 保存集合信息
    const { getDatabase } = await import('./database')
    const db = await getDatabase()
    await db.saveCollection({ 
      id: cid, 
      name, 
      path: dbPath, 
      imported: Date.now(), 
      apkgPath: `${ANKI_BASE}/${cid}/source.apkg` 
    })
    
    // 解析卡组
    const deckList = Object.entries(decks)
      .filter(([_, info]: any) => info.name !== 'Default')
      .sort((a: any, b: any) => a[1].name.split('::').length - b[1].name.split('::').length)
      .map(([did, info]: any) => ({
        id: parseInt(did),
        name: info.name,
        desc: info.desc || '',
        parent: info.name.split('::').length > 1 ? info.name.split('::').slice(0, -1).join('::') : undefined
      }))
    
    clearAnkiDbCache()
    
    return { collectionId: cid, name, decks: deckList }
  } catch (e) {
    console.error('[Import]', e)
    throw e
  }
}
