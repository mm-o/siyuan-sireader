// Anki 数据库访问层
import initSqlJs from 'sql.js'
import JSZip from 'jszip'
import { decompress } from 'fzstd'
import { putFile } from '@/api'

const ANKI_BASE = '/data/storage/petal/siyuan-sireader/anki'
const MIME_TYPES: Record<string, string> = {
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg'
}

// ========== 数据库管理 ==========
let sqlJs: any = null
const ankiDbCache = new Map<string, any>()
const mediaCache = new Map<string, Blob>()

const getSqlJs = async () => {
  if (!sqlJs) sqlJs = await initSqlJs({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/${f}` })
  return sqlJs
}

export const getAnkiDbPath = (cid: string) => `${ANKI_BASE}/${cid}/collection.anki21`
export const clearAnkiDbCache = () => ankiDbCache.clear()

export const getAnkiDb = async (cid: string) => {
  const path = getAnkiDbPath(cid)
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
    
    const db = new (await getSqlJs()).Database(new Uint8Array(buffer))
    ankiDbCache.set(path, db)
    return db
  } catch {
    return null
  }
}

export const saveAnkiDb = async (cid: string, db: any) => {
  const path = getAnkiDbPath(cid)
  const formData = new FormData()
  formData.append('path', path)
  formData.append('file', new File([db.export()], 'collection.anki21', { type: 'application/x-sqlite3' }))
  formData.append('isDir', 'false')
  await fetch('/api/file/putFile', { method: 'POST', body: formData })
  ankiDbCache.delete(path)
}

// ========== 格式兼容层 ==========
const getModels = async (db: any) => {
  try {
    const r = db.exec('SELECT models FROM col')
    if (r?.[0]?.values[0]?.[0]) return JSON.parse(r[0].values[0][0] as string)
    
    const nt = db.exec('SELECT id, name FROM notetypes')
    if (!nt?.[0]) return {}
    
    return Object.fromEntries(nt[0].values.map((row: any) => [row[0], {
      id: row[0], name: row[1],
      flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
      tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' }],
      css: '.card{font-family:arial;font-size:20px;text-align:center;color:#000;background-color:#fff;}'
    }]))
  } catch {
    return {}
  }
}

const getDecks = async (db: any) => {
  const parse = (id: any, name: string, desc = '') => {
    const n = name.replace(/\x1F/g, '::')
    const p = n.split('::')
    return { id, name: n, desc, parent: p.length > 1 ? p.slice(0, -1).join('::') : undefined }
  }
  
  try {
    const r = db.exec('SELECT decks FROM col')
    if (r?.[0]?.values[0]?.[0]) {
      const decks = JSON.parse(r[0].values[0][0] as string)
      return Object.entries(decks).map(([did, info]: any) => parse(parseInt(did), info.name, info.desc))
    }
  } catch {}
  
  try {
    const r = db.exec('SELECT id, name FROM decks')
    if (r?.[0]) return r[0].values.map((row: any) => parse(row[0], row[1]))
  } catch {}
  
  return []
}

// ========== 卡片操作 ==========
export const queryAnkiCards = async (cid: string, deckId: number, limit = 100, offset = 0): Promise<any[]> => {
  try {
    const db = await getAnkiDb(cid)
    if (!db) return []
    
    const r = db.exec(`
      SELECT c.id, c.nid, c.did, c.ord, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses,
             n.flds, n.tags, n.mid 
      FROM cards c JOIN notes n ON c.nid = n.id 
      WHERE c.did = ${deckId} ORDER BY c.id LIMIT ${limit} OFFSET ${offset}
    `)
    if (!r?.[0]) return []
    
    const models = await getModels(db)
    
    return r[0].values.map((row: any) => {
      const [id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, flds, tags, mid] = row
      const fields = flds.split('\x1f')
      const model = models[mid]
      const template = model?.tmpls?.[ord]
      const cardTags = tags.trim().split(' ').filter(Boolean)
      
      let front = fields[0] || '', back = fields[1] || ''
      
      if (template && model?.flds) {
        const fieldMap = Object.fromEntries([
          ...model.flds.map((f: any, i: number) => [f.name, fields[i] || '']),
          ['Tags', cardTags.join(' ')], ['Type', model.name || ''], ['Deck', ''], ['Subdeck', ''], ['Card', template.name || '']
        ] as [string, string][])
        
        const parseTemplate = (html: string): string => {
          html = html.replace(/\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, f, c) => fieldMap[f.trim()] ? parseTemplate(c) : '')
          html = html.replace(/\{\{\^([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, f, c) => !fieldMap[f.trim()] ? parseTemplate(c) : '')
          html = html.replace(/\{\{([^:}]+):([^}]+)\}\}/g, (_, filter, field) => {
            const v = fieldMap[field.trim()] || ''
            const filters: Record<string, () => string> = {
              furigana: () => v.replace(/\[([^\]]+)\]/g, '<ruby>$1</ruby>').replace(/\s/g, ''),
              kanji: () => v.replace(/\[([^\]]*?)\]/g, (_, r: string) => r.split(' ')[0] || ''),
              kana: () => v.replace(/\[([^\]]*?)\]/g, (_, r: string) => r.split(' ')[1] || ''),
              hint: () => v ? `<a class="hint" href="#" onclick="this.style.display='none';this.nextSibling.style.display='inline';return false;">[...]</a><span style="display:none">${v}</span>` : '',
              type: () => `<input type="text" id="typeans" />`,
              text: () => v.replace(/<[^>]+>/g, '')
            }
            return filters[filter.trim()]?.() || v
          })
          html = html.replace(/\{\{([^}]+)\}\}/g, (m, f) => {
            const fn = f.trim()
            return fn === 'FrontSide' ? m : (fieldMap[fn] ?? '')
          })
          return html
        }
        
        front = parseTemplate(template.qfmt || front)
        back = parseTemplate(template.afmt || back)
      }
      
      const pf = processMedia(front, cid, cardTags)
      const pb = back.includes('{{FrontSide}}') ? back.replace(/\{\{FrontSide\}\}/g, pf) : processMedia(back.replace(/\{\{FrontSide\}\}/g, pf), cid, cardTags)
      
      return { id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, fields, tags: cardTags, model: model?.name || 'Unknown', modelCss: model?.css || '', front: pf, back: pb }
    })
  } catch (e) {
    console.error('[Query]', e)
    return []
  }
}

export const insertAnkiCard = async (cid: string, deckId: number, front: string, back: string, tags: string[] = [], modelCss?: string) => {
  try {
    const db = await getAnkiDb(cid)
    if (!db) return null
    
    const now = Date.now()
    
    if (modelCss) {
      const r = db.exec('SELECT models FROM col')
      if (r?.[0]) {
        const models = JSON.parse(r[0].values[0][0] as string)
        if (models['1']) {
          models['1'].css = modelCss
          db.run('UPDATE col SET models = ?', [JSON.stringify(models)])
        }
      }
    }
    
    db.run(`INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [now, `${now}`, 1, now, -1, tags.join(' '), `${front}\x1f${back}`, front.slice(0, 100), 0, 0, ''])
    db.run(`INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [now, now, deckId, 0, now, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ''])
    
    await saveAnkiDb(cid, db)
    return { noteId: now, cardId: now }
  } catch {
    return null
  }
}

export const deleteAnkiCard = async (cid: string, cardId: number, noteId?: number) => {
  try {
    const db = await getAnkiDb(cid)
    if (!db) return false
    db.run('DELETE FROM cards WHERE id = ?', [cardId])
    if (noteId) db.run('DELETE FROM notes WHERE id = ?', [noteId])
    await saveAnkiDb(cid, db)
    return true
  } catch {
    return false
  }
}

export const getAnkiCardCount = async (cid: string, deckId: number) => {
  try {
    const db = await getAnkiDb(cid)
    if (!db) return 0
    const r = db.exec(`SELECT COUNT(*) FROM cards WHERE did = ${deckId}`)
    return r?.[0]?.values[0][0] || 0
  } catch {
    return 0
  }
}

export const createAnkiDatabase = async (cid: string, name: string) => {
  try {
    const db = new (await getSqlJs()).Database()
    const now = Date.now()
    const models = JSON.stringify({ "1": { "id": 1, "name": "Basic", "type": 0, "flds": [{ "name": "Front", "ord": 0 }, { "name": "Back", "ord": 1 }], "tmpls": [{ "name": "Card 1", "ord": 0, "qfmt": "{{Front}}", "afmt": "{{FrontSide}}<hr>{{Back}}" }], "css": ".card{font-family:arial;font-size:20px;text-align:center;color:#000;background-color:#fff;}" } })
    const decks = JSON.stringify({ "1": { "id": 1, "name": name, "desc": "", "mod": now } })
    
    db.exec(`
      CREATE TABLE col (id INTEGER PRIMARY KEY, crt INTEGER NOT NULL, mod INTEGER NOT NULL, scm INTEGER NOT NULL, ver INTEGER NOT NULL, dty INTEGER NOT NULL, usn INTEGER NOT NULL, ls INTEGER NOT NULL, conf TEXT NOT NULL, models TEXT NOT NULL, decks TEXT NOT NULL, dconf TEXT NOT NULL, tags TEXT NOT NULL);
      INSERT INTO col VALUES(1,${now},${now},${now},11,0,-1,0,'{}','${models}','${decks}','{}','{}');
      CREATE TABLE notes (id INTEGER PRIMARY KEY, guid TEXT NOT NULL, mid INTEGER NOT NULL, mod INTEGER NOT NULL, usn INTEGER NOT NULL, tags TEXT NOT NULL, flds TEXT NOT NULL, sfld TEXT NOT NULL, csum INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER NOT NULL, did INTEGER NOT NULL, ord INTEGER NOT NULL, mod INTEGER NOT NULL, usn INTEGER NOT NULL, type INTEGER NOT NULL, queue INTEGER NOT NULL, due INTEGER NOT NULL, ivl INTEGER NOT NULL, factor INTEGER NOT NULL, reps INTEGER NOT NULL, lapses INTEGER NOT NULL, left INTEGER NOT NULL, odue INTEGER NOT NULL, odid INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE INDEX ix_notes_usn ON notes (usn);
      CREATE INDEX ix_cards_usn ON cards (usn);
      CREATE INDEX ix_cards_nid ON cards (nid);
      CREATE INDEX ix_cards_sched ON cards (did, queue, due);
    `)
    
    await saveAnkiDb(cid, db)
    db.close()
    return true
  } catch {
    return false
  }
}

// ========== 媒体处理 ==========
const processMedia = (html: string, cid: string, tags: string[] = []) => {
  html = html.replace(/\[sound:([^\]]+)\]/g, (_, f) => `<svg class="anki-audio" data-cid="${cid}" data-file="${f}"><use xlink:href="#iconRecord"/></svg>`)
  html = html.replace(/<audio[^>]*?src=["']([^"']+)["'][^>]*?>.*?<\/audio>/gi, (_, src) => {
    const isUrl = src.startsWith('http')
    return isUrl ? `<svg class="anki-audio" data-url="${src}"><use xlink:href="#iconRecord"/></svg>` : `<svg class="anki-audio" data-cid="${cid}" data-file="${src.split('?')[0].split('/').pop() || src}"><use xlink:href="#iconRecord"/></svg>`
  })
  
  const jsImgMatches = html.match(/(\w+):\s*\{\s*imgSrc:\s*["']([^"']+)["']/g)
  if (jsImgMatches) {
    const imgMap = new Map(jsImgMatches.map(m => {
      const [, tag, file] = m.match(/(\w+):\s*\{\s*imgSrc:\s*["']([^"']+)["']/) || []
      return [tag?.toLowerCase(), decodeURIComponent(file?.split('?')[0].split('/').pop() || file || '')] as [string, string]
    }).filter(([k, v]) => k && v))
    
    const tagsMatch = html.match(/<div id="tags"[^>]*>(.*?)<\/div>/i)
    const tagText = tagsMatch?.[1]?.trim() || ''
    const displayTags = tagText ? tagText.split(/\s+/).filter(Boolean) : tags
    
    if (!tagText && tags.length) html = html.replace(/<div id="tags"([^>]*)><\/div>/, `<div id="tags"$1>${tags.join(' ')}</div>`)
    
    const imgs = displayTags.map(t => imgMap.get(t.toLowerCase())).filter(Boolean).map(f => `<img data-cid="${cid}" data-file="${f}" loading="lazy" style="max-width:70px;height:70px;margin:0 4px;display:inline-block;vertical-align:middle;object-fit:contain">`).join('')
    if (imgs) html = html.replace(/<div id="category"><\/div>/, `<div id="category">${imgs}</div>`)
  }
  
  html = html.replace(/<img([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (m, before, src, after) => {
    if (src.startsWith('http')) return m
    const filename = decodeURIComponent(src.split('?')[0].split('/').pop() || src)
    return `<img ${`${before}${after}`.replace(/\s+/g, ' ').trim()} data-cid="${cid}" data-file="${filename}" loading="lazy" style="max-width:100%;height:auto">`
  })
  
  return html
}

export const getMediaFromApkg = async (cid: string, filename: string): Promise<Blob | null> => {
  const key = `${cid}:${filename}`
  if (mediaCache.has(key)) return mediaCache.get(key)!
  
  try {
    const { getDatabase } = await import('./database')
    const col = (await (await getDatabase()).getCollections()).find(c => c.id === cid)
    if (!col?.apkgPath) return null
    
    const res = await fetch('/api/file/getFile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: col.apkgPath }) })
    if (!res.ok) return null
    
    const zip = await JSZip.loadAsync(await res.arrayBuffer())
    const mediaFile = zip.file('media')
    if (!mediaFile) return null
    
    let mediaMap: Record<string, string> = {}
    try {
      const text = await mediaFile.async('text')
      mediaMap = text ? JSON.parse(text) : {}
    } catch {
      const compressed = await mediaFile.async('uint8array')
      const text = new TextDecoder().decode(decompress(compressed))
      mediaMap = text ? JSON.parse(text) : {}
    }
    
    if (!Object.keys(mediaMap).length) return null
    
    const cleanName = filename.replace(/^_+/, '')
    const num = Object.entries(mediaMap).find(([_, n]) => {
      const name = n as string
      return [filename, cleanName].some(f => [name, name.toLowerCase(), name.replace(/^_+/, '')].includes(f) || [name, name.toLowerCase(), name.replace(/^_+/, '')].includes(f.toLowerCase()))
    })?.[0]
    
    if (!num) return null
    const file = zip.file(num as string)
    if (!file) return null
    
    const ext = filename.toLowerCase().split('.').pop() || ''
    const blob = new Blob([await file.async('arraybuffer')], { type: MIME_TYPES[ext] || 'application/octet-stream' })
    if (blob.size < 5 * 1024 * 1024) mediaCache.set(key, blob)
    return blob
  } catch {
    return null
  }
}

// ========== 导入 ==========
export const importApkg = async (file: File, onProgress?: (msg: string) => void) => {
  try {
    onProgress?.('解析文件...')
    const zip = await JSZip.loadAsync(file)
    
    let dbFile = zip.file('collection.anki21b') || zip.file('collection.anki2') || zip.file('collection.anki21')
    if (!dbFile) throw new Error('无效 .apkg 文件：未找到数据库')
    
    let dbBuffer: ArrayBuffer
    if (dbFile.name === 'collection.anki21b') {
      onProgress?.('解压数据库...')
      const compressed = await dbFile.async('uint8array')
      dbBuffer = decompress(compressed).buffer.slice(0) as ArrayBuffer
    } else {
      dbBuffer = await dbFile.async('arraybuffer')
    }
    
    const cid = `col-${Date.now()}`
    const name = file.name.replace('.apkg', '')
    const dbPath = getAnkiDbPath(cid)
    
    onProgress?.('保存数据...')
    await Promise.all([
      putFile(dbPath, false, new File([dbBuffer], 'collection.anki21', { type: 'application/x-sqlite3' })),
      putFile(`${ANKI_BASE}/${cid}/source.apkg`, false, file)
    ])
    
    onProgress?.('解析卡组...')
    const db = await getAnkiDb(cid)
    if (!db) throw new Error('无效数据库')
    
    const deckList = await getDecks(db)
    if (!deckList.length) throw new Error('未找到卡组数据')
    
    deckList.sort((a, b) => a.name.split('::').length - b.name.split('::').length)
    
    const { getDatabase } = await import('./database')
    await (await getDatabase()).saveCollection({ id: cid, name, path: dbPath, imported: Date.now(), apkgPath: `${ANKI_BASE}/${cid}/source.apkg` })
    
    clearAnkiDbCache()
    return { collectionId: cid, name, decks: deckList }
  } catch (e) {
    console.error('[Import]', e)
    throw e
  }
}
