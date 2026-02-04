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
  // 尝试旧版格式
  try {
    const r = db.exec('SELECT models FROM col')
    if (r?.[0]?.values[0]?.[0]) return JSON.parse(r[0].values[0][0] as string)
  } catch {}
  
  // 新版格式
  try {
    const nt = db.exec('SELECT id, name, config FROM notetypes')?.[0]
    if (!nt) return {}
    
    const templates = db.exec('SELECT ntid, name, ord, qfmt, afmt FROM templates')?.[0]?.values || []
    const fields = db.exec('SELECT ntid, name, ord FROM fields')?.[0]?.values || []
    
    const byNtid = (arr: any[]) => arr.reduce((m, row) => {
      const [ntid, ...data] = row
      if (!m.has(ntid)) m.set(ntid, [])
      m.get(ntid).push(row.length === 5 ? { name: data[0], ord: data[1], qfmt: data[2], afmt: data[3] } : { name: data[0], ord: data[1] })
      return m
    }, new Map())
    
    const templatesByNtid = byNtid(templates)
    const fieldsByNtid = byNtid(fields)
    
    return Object.fromEntries(nt.values.map((row: any) => {
      const [id, name, config] = row
      const cfg = config ? JSON.parse(config) : {}
      return [id, {
        id, name,
        flds: (fieldsByNtid.get(id) || []).sort((a: any, b: any) => a.ord - b.ord),
        tmpls: (templatesByNtid.get(id) || []).sort((a: any, b: any) => a.ord - b.ord),
        css: cfg.css || '.card{font-family:arial;font-size:20px;text-align:center;color:#000;background-color:#fff;}'
      }]
    }))
  } catch (e) {
    console.error('[getModels]', e)
    return {}
  }
}

const getDecks = async (db: any) => {
  const parse = (id: any, name: string, desc = '') => {
    const n = name.replace(/\x1F/g, '::')
    return { id, name: n, desc, parent: n.includes('::') ? n.split('::').slice(0, -1).join('::') : undefined }
  }
  
  // 尝试旧版格式
  try {
    const r = db.exec('SELECT decks FROM col')?.[0]?.values[0]?.[0]
    if (r) return Object.entries(JSON.parse(r as string)).map(([did, info]: any) => parse(parseInt(did), info.name, info.desc))
  } catch {}
  
  // 新版格式
  try {
    const r = db.exec('SELECT id, name FROM decks')?.[0]
    if (r) return r.values.map((row: any) => parse(row[0], row[1]))
  } catch {}
  
  return []
}

// ========== 卡片操作 ==========
// 模板过滤器（提取到外部避免重复创建）
const TEMPLATE_FILTERS: Record<string, (v: string) => string> = {
  furigana: (v) => v.replace(/([^\[\s]+)\[([^\]]+)\]/g, '<ruby>$1<rt>$2</rt></ruby>'),
  kanji: (v) => v.replace(/\[([^\]]*?)\]/g, ''),
  kana: (v) => v.replace(/[^\[]+\[([^\]]+)\]/g, '$1').replace(/[^\[]+/g, ''),
  hint: (v) => v ? `<a class="hint" href="#" onclick="this.style.display='none';this.nextSibling.style.display='inline';return false;">[...]</a><span style="display:none">${v}</span>` : '',
  type: () => `<input type="text" id="typeans" />`,
  text: (v) => v.replace(/<[^>]+>/g, '')
}

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
      
      const baseCard = { id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, fields, tags: cardTags, 
        model: model?.name || 'Unknown', modelCss: model?.css || '' }
      
      if (!template || !model?.flds) {
        return { ...baseCard, 
          front: processMedia(fields[0] || '', cid), 
          back: processMedia(fields[1] || '', cid), 
          scripts: [] }
      }
      
      // 构建字段映射
      const fieldMap = Object.fromEntries([
        ...model.flds.map((f: any, i: number) => [f.name, fields[i] || '']),
        ['Tags', cardTags.join(' ')], ['Type', model.name || ''], ['Deck', ''], ['Subdeck', ''], ['Card', template.name || '']
      ] as [string, string][])
      
      // 模板解析器（优化：减少函数调用）
      const parseTemplate = (html: string): string => {
        return html
          .replace(/\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, f, c) => fieldMap[f.trim()] ? parseTemplate(c) : '')
          .replace(/\{\{\^([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, f, c) => !fieldMap[f.trim()] ? parseTemplate(c) : '')
          .replace(/\{\{([^:}]+):([^}]+)\}\}/g, (_, filter, field) => {
            const v = fieldMap[field.trim()] || ''
            return TEMPLATE_FILTERS[filter.trim()]?.(v) || v
          })
          .replace(/\{\{([^}]+)\}\}/g, (m, f) => f.trim() === 'FrontSide' ? m : (fieldMap[f.trim()] ?? ''))
      }
      
      // 提取脚本并解析（优化：合并操作）
      const extractScripts = (html: string) => {
        const scripts: string[] = []
        return [html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (m) => (scripts.push(m), '')), scripts] as const
      }
      
      // 处理正面：先处理脚本图片映射，再解析模板，最后处理媒体
      let frontHtml = processScriptImgMappings(template.qfmt || fields[0], cid, cardTags)
      const [frontHtmlNoScript, frontScripts] = extractScripts(frontHtml)
      const front = processMedia(parseTemplate(frontHtmlNoScript), cid)
      
      // 处理背面：先处理脚本图片映射，再解析模板，最后处理媒体
      let backHtml = processScriptImgMappings(template.afmt || fields[1], cid, cardTags)
      const [backHtmlNoScript, backScripts] = extractScripts(backHtml)
      const back = processMedia(parseTemplate(backHtmlNoScript).replace(/\{\{FrontSide\}\}/g, front), cid)
      
      // 提取脚本内容并替换变量（优化：预编译正则）
      const scripts = [...backScripts, ...frontScripts].map(s => {
        const m = s.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)
        if (!m) return ''
        let code = m[1].trim()
        for (const [k, v] of Object.entries(fieldMap)) {
          const val = (v as string).replace(/'/g, "\\'").replace(/[\n\r]/g, '\\n')
          code = code.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), val)
        }
        return code
      }).filter(Boolean)
      
      return { ...baseCard, front, back, scripts }
    })
  } catch (e) {
    console.error('[Query]', e)
    return []
  }
}

export const insertAnkiCard = async (cid: string, deckId: number, front: string, back: string, tags: string[] = [], modelCss?: string) => {
  const db = await getAnkiDb(cid)
  if (!db) return null
  
  try {
    const now = Date.now()
    
    // 更新 CSS（如果提供）
    if (modelCss) {
      const r = db.exec('SELECT models FROM col')?.[0]
      if (r) {
        const models = JSON.parse(r.values[0][0] as string)
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
  const db = await getAnkiDb(cid)
  if (!db) return false
  
  try {
    db.run('DELETE FROM cards WHERE id = ?', [cardId])
    if (noteId) db.run('DELETE FROM notes WHERE id = ?', [noteId])
    await saveAnkiDb(cid, db)
    return true
  } catch {
    return false
  }
}

export const getAnkiCardCount = async (cid: string, deckId: number) => {
  const db = await getAnkiDb(cid)
  if (!db) return 0
  try {
    return db.exec(`SELECT COUNT(*) FROM cards WHERE did = ${deckId}`)?.[0]?.values[0][0] || 0
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
const audioSvg = (cid: string, file: string) => `<svg class="anki-audio" data-cid="${cid}" data-file="${file}"><use xlink:href="#iconRecord"/></svg>`
const audioSvgUrl = (url: string) => `<svg class="anki-audio" data-url="${url}"><use xlink:href="#iconRecord"/></svg>`

// 从脚本中提取图片映射并转换为 HTML
const processScriptImgMappings = (html: string, cid: string, tags: string[]): string => {
  const m = html.match(/<script\b[^>]*>([\s\S]*?imgMappings[\s\S]*?)<\/script>/i)
  if (!m) return html
  
  // 括号计数提取对象
  const s = m[1], i = s.indexOf('{', s.indexOf('imgMappings'))
  if (i === -1) return html
  
  for (var d = 0, e = i, j = i; j < s.length && (s[j] === '{' ? ++d : s[j] === '}' && !--d && (e = j, 0)); j++);
  
  // 提取映射并生成图片
  const imgs = tags.map(t => {
    const r = s.slice(i, e + 1).match(new RegExp(`${t}:\\s*\\{\\s*imgSrc:\\s*["']([^"']+)["']`, 'i'))
    return r?.[1] ? `<img data-cid="${cid}" data-file="${decodeURIComponent(r[1].split(/[?/]/).pop()!)}" loading="lazy" style="max-width:70px;height:70px;margin:0 4px;display:inline-block;vertical-align:middle;object-fit:contain">` : ''
  }).filter(Boolean).join('')
  
  return imgs ? html.replace(/<div id="category"><\/div>/, `<div id="category">${imgs}</div>`).replace(m[0], '') : html
}

const processMedia = (html: string, cid: string) => html
  .replace(/\[sound:([^\]]+)\]/g, (_, f) => audioSvg(cid, f))
  .replace(/<audio[^>]*?src=["']([^"']+)["'][^>]*?>.*?<\/audio>/gi, (_, s) => s.startsWith('http') ? audioSvgUrl(s) : audioSvg(cid, s.split(/[?/]/).pop() || s))
  .replace(/<img([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (m, b, s, a) => s.startsWith('http') ? m : `<img ${`${b}${a}`.replace(/\s+/g, ' ').trim()} data-cid="${cid}" data-file="${decodeURIComponent(s.split(/[?/]/).pop() || s)}" loading="lazy" style="max-width:100%;height:auto">`)

export const getMediaFromApkg = async (cid: string, filename: string): Promise<Blob | null> => {
  const key = `${cid}:${filename}`
  const cached = mediaCache.get(key)
  if (cached) return cached
  
  try {
    const { getDatabase } = await import('./database')
    const col = (await (await getDatabase()).getCollections()).find(c => c.id === cid)
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
    
    // 解析 media 映射（优化：合并 try-catch）
    const mediaMap: Record<string, string> = await mediaFile.async('text')
      .then(text => JSON.parse(text) || {})
      .catch(async () => JSON.parse(new TextDecoder().decode(decompress(await mediaFile.async('uint8array')))) || {})
    
    if (!Object.keys(mediaMap).length) return null
    
    // 查找文件（优化：预计算变体）
    const cleanName = filename.replace(/^_+/, '')
    const variants = new Set([filename, cleanName, filename.toLowerCase(), cleanName.toLowerCase()])
    const num = Object.entries(mediaMap).find(([_, n]) => {
      const name = (n as string).replace(/^_+/, '')
      return variants.has(name) || variants.has(name.toLowerCase())
    })?.[0]
    
    if (!num) return null
    const file = zip.file(num)
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
    
    // 按优先级选择数据库
    onProgress?.('加载数据库...')
    let dbBuffer: ArrayBuffer | null = null
    for (const name of ['collection.anki21b', 'collection.anki21', 'collection.anki2']) {
      const f = zip.file(name)
      if (f) {
        try {
          dbBuffer = name === 'collection.anki21b' ? decompress(await f.async('uint8array')).buffer.slice(0) as ArrayBuffer : await f.async('arraybuffer')
          break
        } catch (e) { console.warn(`[Import] 跳过 ${name}:`, e) }
      }
    }
    if (!dbBuffer) throw new Error('无效 .apkg 文件：未找到有效数据库')
    
    const cid = `col-${Date.now()}`
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
    await (await getDatabase()).saveCollection({ 
      id: cid, 
      name: file.name.replace('.apkg', ''), 
      path: dbPath, 
      imported: Date.now(), 
      apkgPath: `${ANKI_BASE}/${cid}/source.apkg` 
    })
    
    clearAnkiDbCache()
    return { collectionId: cid, name: file.name.replace('.apkg', ''), decks: deckList }
  } catch (e) {
    console.error('[Import]', e)
    throw e
  }
}
