const BASE_URL = 'https://dictionary.cambridge.org'
const MXNZP_ID = 'guuhjloujpkfenn1', MXNZP_SECRET = 'izYrfPlqfRMxrXHUCf5vEbD4WSxnjSow'

interface DictResult { word: string; phonetics: { ipa: string; audio: string; region: 'us' | 'uk' }[]; parts: { part: string; means: string[] }[]; examples: { en: string; zh: string }[] }

const DICTS = [
  { id: 'cambridge', name: '剑桥', icon: '#iconLanguage' },
  { id: 'youdao', name: '有道', icon: 'https://shared.ydstatic.com/images/favicon.ico' },
  { id: 'haici', name: '海词', icon: 'https://dict.cn/favicon.ico' },
  { id: 'mxnzp', name: '汉字', icon: '#iconA' },
  { id: 'ciyu', name: '词语', icon: '#iconFont' },
  { id: 'zdic', name: '汉典', icon: 'https://www.zdic.net/favicon.ico' },
  { id: 'bing', name: '必应', icon: 'https://cn.bing.com/favicon.ico', url: 'https://cn.bing.com/dict/search?q={{word}}' },
]

let popup: HTMLElement | null, state = { dragging: false, resizing: false, pinned: false, word: '', offset: { x: 0, y: 0 }, start: { x: 0, y: 0, w: 0, h: 0 } }

const fetchHTML = async (url: string) => new DOMParser().parseFromString(await (await fetch(url)).text(), 'text/html')
const getTexts = (doc: Document, selector: string) => Array.from(doc.querySelectorAll(selector)).map(el => el.textContent?.trim()).filter(Boolean)
const makeTag = (words: string[], color: string, label: string) => words.length ? [`<div style="margin-top:8px;color:${color};font-size:13px">${label}：${words.slice(0, 8).join('、')}</div>`] : []

export async function openDict(word: string, x: number, y: number) {
  if (!popup) createPopup()
  state.word = word
  Object.assign(popup!.style, { left: Math.max(0, Math.min(window.innerWidth - 520, x)) + 'px', top: Math.max(32, Math.min(window.innerHeight - 600, y)) + 'px', display: 'flex', zIndex: String(++(window.siyuan as any).zIndex || 9999) })
  switchDict(/[一-龥]/.test(word) ? (word.length === 1 ? 'mxnzp' : 'ciyu') : 'cambridge')
}

function switchDict(dictId: string) {
  popup!.querySelectorAll('.dict-tab').forEach(tab => tab.classList.toggle('active', tab.getAttribute('data-id') === dictId))
  const dict = DICTS.find(d => d.id === dictId)
  if (dict?.url) return setBody(`<iframe src="${dict.url.replace('{{word}}', state.word)}" style="width:100%;height:100%;border:none"/>`)
  
  setBody('<div class="dict-loading"><span>查询中...</span></div>')
  const queries: Record<string, () => Promise<any>> = {
    cambridge: () => fetchDict(state.word.split(' ').join('-'), 'dictionary/english-chinese-simplified').then(r => r || fetchDict(state.word.split(' ').join('-'), 'dictionary/english')),
    youdao: () => queryYoudao(state.word),
    haici: () => queryHaici(state.word),
    mxnzp: () => queryMxnzp(state.word),
    ciyu: () => queryCiyu(state.word),
    zdic: () => queryZdic(state.word)
  }
  queries[dictId]?.().then(r => r ? (dictId === 'cambridge' ? renderCambridge(r) : renderCommon(r)) : setBody('<div class="dict-error">未找到释义</div>')).catch(() => setBody('<div class="dict-error">查询失败</div>'))
}

function createPopup() {
  popup = document.createElement('div')
  popup.className = 'mreader-dict-popup'
  
  const tabsHTML = DICTS.map(d => {
    const iconHTML = d.icon.startsWith('#') 
      ? `<svg style="width:14px;height:14px"><use xlink:href="${d.icon}"></use></svg>` 
      : `<img src="${d.icon}" style="width:14px;height:14px" />`
    return `<div class="dict-tab" data-id="${d.id}">${iconHTML} ${d.name}</div>`
  }).join('')
  
  popup.innerHTML = `
    <div class="dict-header">
      <h3 class="dict-title">📖 词典</h3>
      <button class="dict-btn pin-btn"><svg><use xlink:href="#iconPin"></use></svg></button>
      <button class="dict-btn close-btn">×</button>
    </div>
    <div class="dict-tabs">${tabsHTML}</div>
    <div class="dict-body"></div>
    <div class="resize-handle"></div>
  `
  
  popup.querySelector('.dict-header')!.addEventListener('mousedown', (e: any) => !e.target.closest('.dict-btn') && (state.dragging = true, state.offset.x = e.clientX - popup!.offsetLeft, state.offset.y = e.clientY - popup!.offsetTop))
  popup.querySelector('.resize-handle')!.addEventListener('mousedown', (e: MouseEvent) => (e.stopPropagation(), state.resizing = true, state.start = { x: e.clientX, y: e.clientY, w: popup!.offsetWidth, h: popup!.offsetHeight }))
  
  document.addEventListener('mousemove', (e) => {
    if (state.dragging && popup) popup.style.left = Math.max(0, Math.min(window.innerWidth - popup.offsetWidth, e.clientX - state.offset.x)) + 'px', popup.style.top = Math.max(32, Math.min(window.innerHeight - popup.offsetHeight, e.clientY - state.offset.y)) + 'px'
    if (state.resizing && popup) popup.style.width = Math.min(Math.max(320, state.start.w + e.clientX - state.start.x), window.innerWidth - popup.offsetLeft) + 'px', popup.style.height = Math.min(Math.max(400, state.start.h + e.clientY - state.start.y), window.innerHeight - popup.offsetTop) + 'px'
  })
  document.addEventListener('mouseup', () => (state.dragging = false, state.resizing = false))
  popup.querySelector('.pin-btn')!.addEventListener('click', (e: any) => (state.pinned = !state.pinned, e.currentTarget.querySelector('use').setAttribute('xlink:href', state.pinned ? '#iconUnpin' : '#iconPin')))
  popup.querySelector('.close-btn')!.addEventListener('click', () => popup!.style.display = 'none')
  document.addEventListener('click', (e) => !state.pinned && popup && !popup.contains(e.target as Node) && (popup.style.display = 'none'))
  popup.addEventListener('click', (e) => e.stopPropagation())
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !state.pinned && popup?.style.display === 'flex' && (popup.style.display = 'none'))
  
  popup.querySelectorAll('.dict-tab').forEach(tab => tab.addEventListener('click', () => switchDict(tab.getAttribute('data-id')!)))
  
  injectStyles()
  document.body.appendChild(popup)
}

const setBody = (html: string) => (popup!.querySelector('.dict-body') as HTMLElement).innerHTML = html

async function queryYoudao(word: string) {
  try {
    const { data } = await (await fetch(`https://dict.youdao.com/suggest?q=${encodeURIComponent(word)}&le=en&num=5&doctype=json`)).json()
    const entries = data?.entries || []
    return entries.length ? { word: entries[0].entry, phonetic: '', defs: entries.map((e: any) => `<b>${e.entry}</b> - ${e.explain}`) } : null
  } catch { return null }
}

async function queryHaici(word: string) {
  try {
    const doc = await fetchHTML(`https://dict.cn/${encodeURIComponent(word)}`)
    const entry = doc.querySelector('.keyword')?.textContent?.trim()
    const phonetic = doc.querySelector('.phonetic')?.textContent?.trim()
    const audio = doc.querySelector('.audio-btn')?.getAttribute('data-src')
    const defs = getTexts(doc, '.layout.basic li, .layout li, .dict-basic-ul li').filter(d => d.length < 200).slice(0, 10)
    return entry && defs.length ? { word: entry, phonetic: phonetic || '', audio, defs } : null
  } catch { return null }
}

async function queryMxnzp(word: string) {
  try {
    const json = await (await fetch(`https://www.mxnzp.com/api/convert/dictionary?content=${encodeURIComponent(word)}&app_id=${MXNZP_ID}&app_secret=${MXNZP_SECRET}`)).json()
    if (json.code !== 1 || !json.data?.length) return null
    const d = json.data[0]
    const traditional = d.traditional !== d.word ? `（繁：${d.traditional}）` : ''
    const meta = [d.radicals && `部首: ${d.radicals}`, d.strokes && `笔画: ${d.strokes}画`].filter(Boolean).join(' • ')
    const defs = d.explanation ? d.explanation.split('\n').filter((s: string) => s.trim()).slice(0, 10) : []
    return { word: d.word + traditional, phonetic: d.pinyin || '', meta, defs }
  } catch { return null }
}

async function queryCiyu(word: string) {
  try {
    const doc = await fetchHTML(`https://hanyu.dict.cn/${encodeURIComponent(word)}`)
    const entry = doc.querySelector('.keyword')?.textContent?.trim() || word
    const phonetic = doc.querySelector('.phonetic')?.textContent?.trim()
    const basicDefs = getTexts(doc, '.basic-info .info-list li').filter(t => !t.startsWith('【')).slice(0, 8)
    const detailDefs = getTexts(doc, '.detail-info .info-mod p, .content-info p').slice(0, 6)
    const examples = getTexts(doc, '.example-list li, .sent-item').map(t => `• ${t}`).slice(0, 4)
    const origin = doc.querySelector('.origin-info, .source-info')?.textContent?.trim()
    const synonyms = getTexts(doc, '.synonym-list a, .near-word a').slice(0, 8)
    const antonyms = getTexts(doc, '.antonym-list a, .anti-word a').slice(0, 8)
    
    let allDefs = [...basicDefs, ...detailDefs, ...(origin ? [`<div style="margin-top:8px;padding:8px;background:var(--b3-theme-background);border-radius:4px;font-size:13px">${origin}</div>`] : []), ...examples, ...makeTag(synonyms, 'var(--b3-theme-primary)', '近义'), ...makeTag(antonyms, 'var(--b3-theme-error)', '反义')]
    
    if (!allDefs.length) {
      const doc2 = await fetchHTML(`https://dict.cn/${encodeURIComponent(word)}`)
      const basicDefs2 = getTexts(doc2, '.layout.cn ul li a').map(t => `<span style="color:var(--b3-theme-on-surface-light);font-size:12px">英译</span> <b>${t}</b>`).slice(0, 5)
      const refDefs2 = getTexts(doc2, '.layout.ref dd ul li div').slice(0, 4)
      const examples2 = Array.from(doc2.querySelectorAll('.layout.sort ol li')).map(li => li.innerHTML.split('<br>').length === 2 ? `• ${li.innerHTML.split('<br>')[0].trim()}<br><span style="color:var(--b3-theme-on-surface-light);font-size:12px">${li.innerHTML.split('<br>')[1].trim()}</span>` : null).filter(Boolean).slice(0, 3)
      const allWords = getTexts(doc2, '.layout.nfo ul li a')
      allDefs = [...basicDefs2, ...refDefs2, ...examples2, ...makeTag(allWords.slice(0, allWords.length / 2), 'var(--b3-theme-primary)', '近义'), ...makeTag(allWords.slice(allWords.length / 2), 'var(--b3-theme-error)', '反义')]
      return { word: doc2.querySelector('.keyword')?.textContent?.trim() || word, phonetic: doc2.querySelector('.phonetic')?.textContent?.trim() || phonetic || '', defs: allDefs }
    }
    
    return { word: entry, phonetic: phonetic || '', defs: allDefs }
  } catch { return null }
}

async function queryZdic(word: string) {
  try {
    const doc = await fetchHTML(`https://www.zdic.net/hans/${encodeURIComponent(word)}`)
    const entry = doc.querySelector('.z_title h1')?.textContent?.trim() || word
    let phonetic = doc.querySelector('.z_title .z_pyth')?.textContent?.trim()
    const radical = doc.querySelector('.z_info span:nth-child(2)')?.textContent?.trim()
    const strokes = doc.querySelector('.z_info span:nth-child(4)')?.textContent?.trim()
    const defs = getTexts(doc, '.jnr p').slice(0, 8)
    if (!phonetic && defs[0]) phonetic = defs[0].match(/[a-z̀-ͯ\s]+/i)?.[0]?.trim()
    const meta = [radical, strokes].filter(Boolean).join(' • ')
    return entry && defs.length ? { word: entry, phonetic: phonetic || '', meta, defs } : null
  } catch { return null }
}

function renderCommon(data: any) {
  const audioBtn = data.audio ? `<button class="audio-btn" onclick="new Audio('${data.audio}').play().catch(()=>{})"><svg class="audio-icon" width="16" height="16" viewBox="0 0 28 28" fill="none"><path d="M10.7 18.2H8c-.6 0-1-.5-1-1.1v-6.2c0-.6.4-1.1 1-1.1h2.7l3.6-2.5c.6-.6 1.7-.2 1.7.8v11.9c0 .9-1 1.4-1.7.8l-3.6-2.5Z" stroke-width="1.5"/><path d="M19 18c.6-.5 1.1-1.1 1.5-1.8.3-.7.5-1.4.5-2.2s-.2-1.5-.5-2.2c-.4-.7-.9-1.3-1.5-1.8" stroke-width="1.5" stroke-linecap="round"/></svg></button>` : ''
  const phoneticHTML = data.phonetic ? `<div class="dict-phonetics"><div class="phonetic-item"><span>${data.phonetic}</span>${audioBtn}</div></div>` : ''
  const metaHTML = data.meta ? `<div class="dict-meta">${data.meta}</div>` : ''
  const meansHTML = data.defs.map((d: string) => `<div class="dict-part"><span class="part-means">${d}</span></div>`).join('')
  setBody(`<div class="dict-content"><div class="dict-word">${data.word}</div>${phoneticHTML}${metaHTML}${meansHTML}</div>`)
}

function renderCambridge(r: DictResult) {
  const phoneticsHTML = r.phonetics.map(p => `
    <div class="phonetic-item">
      <span>${p.region === 'us' ? '美' : '英'}</span>
      <span>[${p.ipa}]</span>
      <button class="audio-btn" onclick="new Audio('${BASE_URL}${p.audio}').play()">
        <svg class="audio-icon" width="20" height="20" viewBox="0 0 28 28" fill="none">
          <path d="M10.7 18.2H8c-.6 0-1-.5-1-1.1v-6.2c0-.6.4-1.1 1-1.1h2.7l3.6-2.5c.6-.6 1.7-.2 1.7.8v11.9c0 .9-1 1.4-1.7.8l-3.6-2.5Z" stroke-width="1.5"/>
          <path d="M19 18c.6-.5 1.1-1.1 1.5-1.8.3-.7.5-1.4.5-2.2s-.2-1.5-.5-2.2c-.4-.7-.9-1.3-1.5-1.8" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `).join('')
  
  const partsHTML = r.parts.map(p => `
    <div class="dict-part">
      <span class="part-label">${p.part}</span>
      <span class="part-means">${p.means.join('; ')}</span>
    </div>
  `).join('')
  
  const examplesHTML = r.examples.length ? `
    <div class="dict-examples">
      <div class="example-title">例句</div>
      ${r.examples.map(ex => `
        <div class="example-item">
          <div class="example-en">${ex.en}</div>
          <div class="example-zh">${ex.zh}</div>
        </div>
      `).join('')}
    </div>
  ` : ''
  
  setBody(`<div class="dict-content"><div class="dict-word">${r.word}</div>${r.phonetics.length ? `<div class="dict-phonetics">${phoneticsHTML}</div>` : ''}${partsHTML}${examplesHTML}</div>`)
  r.phonetics.length && new Audio(BASE_URL + r.phonetics[0].audio).play().catch(() => {})
}

async function fetchDict(text: string, path: string): Promise<DictResult | null> {
  try {
    const res = await fetch(`${BASE_URL}/${path}/${text}`)
    return res.ok ? parseHTML(await res.text()) : null
  } catch { return null }
}

function parseHTML(html: string): DictResult | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const word = doc.querySelector('.headword')?.textContent?.trim()
  if (!word) return null

  const phonetics = [makePhonetic(doc.querySelector('.us'), 'us'), makePhonetic(doc.querySelector('.uk'), 'uk')].filter(p => p.ipa)
  const partMap = new Map<string, string[]>()
  const examples: { en: string; zh: string }[] = []

  doc.querySelectorAll('.entry-body__el').forEach(el => {
    const partSpeech = el.querySelector('.posgram')?.textContent?.trim() || 'unknown'
    el.querySelectorAll('.dsense').forEach(dsense => {
      dsense.querySelectorAll('.def-block').forEach(defBlock => {
        const cn = defBlock.querySelector('.ddef_b')?.firstElementChild?.textContent?.trim()
        cn && (partMap.has(partSpeech) ? partMap.get(partSpeech)!.push(cn) : partMap.set(partSpeech, [cn]))

        if (examples.length < 3) {
          const examp = defBlock.querySelector('.examp')
          const en = examp?.querySelector('.eg')?.textContent?.trim() || ''
          const zh = examp?.querySelector('.eg')?.nextElementSibling?.textContent?.trim() || ''
          en && examples.push({ en, zh })
        }
      })
    })
  })

  const parts: { part: string; means: string[] }[] = []
  partMap.forEach((means, part) => parts.push({ part, means }))
  return { word, phonetics, parts, examples }
}

function makePhonetic(block: Element | null, region: 'us' | 'uk') {
  return {
    ipa: block?.querySelector('.pron .ipa')?.textContent?.trim() || '',
    audio: block?.querySelector('[type="audio/mpeg"]')?.getAttribute('src') || '',
    region
  }
}

function injectStyles() {
  if (document.getElementById('mreader-dict-styles')) return
  const css = `.mreader-dict-popup{position:fixed;width:520px;height:600px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);
  border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.18);z-index:9999;display:none;flex-direction:column;overflow:hidden;
  min-width:320px;min-height:400px}.dict-header,.dict-tabs{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--b3-theme-background);border-bottom:1px solid var(--b3-border-color)}.dict-header{cursor:move;user-select:none}.dict-tabs{flex-wrap:wrap;gap:6px}.dict-title{flex:1;margin:0;font-size:16px;font-weight:600}.dict-btn{width:24px;height:24px;border:none;border-radius:4px;
  background:0 0;color:var(--b3-theme-on-surface);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;transition:background .15s}.dict-btn:hover{background:var(--b3-theme-surface)}.dict-btn svg{width:14px;height:14px}.dict-tab{min-width:64px;padding:6px 10px;border-radius:4px;cursor:pointer;display:flex;align-items:center;
  justify-content:center;gap:5px;font-size:12px;transition:all .15s;color:var(--b3-theme-on-surface);opacity:.7;
  white-space:nowrap}.dict-tab:hover{opacity:1;background:var(--b3-theme-surface)}.dict-tab.active{opacity:1;background:var(--b3-theme-primary);
  color:#fff;font-weight:500}.dict-body{flex:1;padding:12px;overflow-y:auto}.resize-handle{position:absolute;right:0;bottom:0;width:20px;height:20px;cursor:nwse-resize}.resize-handle::after{content:'';position:absolute;right:2px;bottom:2px;width:10px;height:10px;border-right:2px solid var(--b3-border-color);
  border-bottom:2px solid var(--b3-border-color)}.dict-loading,.phonetic-item{display:flex;align-items:center;gap:8px}.dict-loading{justify-content:center;padding:20px;color:var(--b3-theme-on-surface-light)}.dict-error{padding:20px;text-align:center;color:var(--b3-theme-error)}.dict-word{font-size:22px;
  font-weight:700;margin-bottom:8px}.dict-phonetics{display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap}.phonetic-item{gap:6px;font-size:14px}.dict-meta{font-size:12px;color:var(--b3-theme-on-surface-light);margin-bottom:12px;padding:4px 8px;background:var(--b3-theme-background);border-radius:4px;
  display:inline-block}.audio-btn{border:none;background:0 0;cursor:pointer;
  padding:2px;display:flex;align-items:center}.audio-icon{stroke:var(--b3-theme-on-surface);fill:none;transition:stroke .15s}.audio-btn:hover .audio-icon{stroke:var(--b3-theme-primary)}.dict-part,.example-item{margin:8px 0;padding:8px;
  background:var(--b3-theme-background);border-radius:4px}.dict-part{margin:10px 0;border-left:3px solid var(--b3-theme-primary)}.part-label{font-weight:600;color:var(--b3-theme-primary);
  margin-right:8px}.dict-examples{margin-top:16px}.example-title{font-weight:600;margin-bottom:8px}.example-item{font-size:14px}.example-en{font-style:italic;margin-bottom:4px}.example-zh{color:var(--b3-theme-on-surface-light)}`
  document.head.appendChild(Object.assign(document.createElement('style'), { id: 'mreader-dict-styles', textContent: css }))
}
