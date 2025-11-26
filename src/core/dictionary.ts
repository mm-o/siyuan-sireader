import { Dialog } from 'siyuan'

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

let dialog: Dialog | null = null, state = { word: '' }

const fetchHTML = async (url: string) => new DOMParser().parseFromString(await (await fetch(url)).text(), 'text/html')
const getTexts = (doc: Document, selector: string) => Array.from(doc.querySelectorAll(selector)).map(el => el.textContent?.trim()).filter(Boolean)
const makeTag = (words: string[], color: string, label: string) => words.length ? [`<div style="margin-top:8px;color:${color};font-size:13px">${label}：${words.slice(0, 8).join('、')}</div>`] : []

export async function openDict(word: string, _x?: number, _y?: number) {
  state.word = word
  if (dialog) dialog.destroy()
  
  const tabs = DICTS.map(d => {
    const icon = d.icon.startsWith('#') ? `<svg style="width:14px;height:14px"><use xlink:href="${d.icon}"></use></svg>` : `<img src="${d.icon}" style="width:14px;height:14px">`
    return `<button class="b3-button b3-button--outline" data-id="${d.id}" style="padding:4px 8px;font-size:12px">${icon} ${d.name}</button>`
  }).join('')
  
  dialog = new Dialog({
    title: '📖 词典',
    content: `<div class="b3-dialog__content" style="display:flex;flex-direction:column;gap:8px;height:100%">
      <div style="display:flex;gap:4px;flex-wrap:wrap">${tabs}</div>
      <div class="dict-body fn__flex-1" style="overflow-y:auto;padding:8px"></div>
    </div>`,
    width: '540px',
    height: '600px'
  })
  
  dialog.element.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => switchDict((btn as HTMLElement).dataset.id!)))
  switchDict(/[一-龥]/.test(word) ? (word.length === 1 ? 'mxnzp' : 'ciyu') : 'cambridge')
}

function switchDict(dictId: string) {
  if (!dialog) return
  dialog.element.querySelectorAll('[data-id]').forEach(btn => btn.classList.toggle('b3-button--cancel', (btn as HTMLElement).dataset.id === dictId))
  const dict = DICTS.find(d => d.id === dictId)
  if (dict?.url) return setBody(`<iframe src="${dict.url.replace('{{word}}', state.word)}" style="width:100%;height:100%;border:none"/>`)
  
  setBody('<div style="text-align:center;padding:20px;color:var(--b3-theme-on-surface-light)">查询中...</div>')
  const queries: Record<string, () => Promise<any>> = {
    cambridge: () => fetchDict(state.word.split(' ').join('-'), 'dictionary/english-chinese-simplified').then(r => r || fetchDict(state.word.split(' ').join('-'), 'dictionary/english')),
    youdao: () => queryYoudao(state.word),
    haici: () => queryHaici(state.word),
    mxnzp: () => queryMxnzp(state.word),
    ciyu: () => queryCiyu(state.word),
    zdic: () => queryZdic(state.word)
  }
  queries[dictId]?.().then(r => r ? (dictId === 'cambridge' ? renderCambridge(r) : renderCommon(r)) : setBody('<div style="text-align:center;padding:20px;color:var(--b3-theme-error)">未找到释义</div>')).catch(() => setBody('<div style="text-align:center;padding:20px;color:var(--b3-theme-error)">查询失败</div>'))
}

const setBody = (html: string) => dialog && ((dialog.element.querySelector('.dict-body') as HTMLElement).innerHTML = html)

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
  const audio = data.audio ? `<button class="b3-button b3-button--text" onclick="new Audio('${data.audio}').play().catch(()=>{})">🔊</button>` : ''
  const phonetic = data.phonetic ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="color:var(--b3-theme-on-surface-light)">${data.phonetic}</span>${audio}</div>` : ''
  const meta = data.meta ? `<div style="font-size:12px;color:var(--b3-theme-on-surface-light);margin-bottom:8px">${data.meta}</div>` : ''
  const defs = data.defs.map((d: string) => `<div style="margin:6px 0;padding:6px;background:var(--b3-theme-background);border-radius:4px">${d}</div>`).join('')
  setBody(`<div style="font-size:20px;font-weight:600;margin-bottom:8px">${data.word}</div>${phonetic}${meta}${defs}`)
}

function renderCambridge(r: DictResult) {
  const phonetics = r.phonetics.map(p => `<div style="display:flex;align-items:center;gap:8px"><span>${p.region === 'us' ? '美' : '英'}</span><span>[${p.ipa}]</span><button class="b3-button b3-button--text" onclick="new Audio('${BASE_URL}${p.audio}').play()">🔊</button></div>`).join('')
  const parts = r.parts.map(p => `<div style="margin:8px 0;padding:8px;background:var(--b3-theme-background);border-radius:4px;border-left:3px solid var(--b3-theme-primary)"><span style="font-weight:600;color:var(--b3-theme-primary);margin-right:8px">${p.part}</span><span>${p.means.join('; ')}</span></div>`).join('')
  const examples = r.examples.length ? `<div style="margin-top:12px"><div style="font-weight:600;margin-bottom:6px">例句</div>${r.examples.map(ex => `<div style="margin:6px 0;padding:6px;background:var(--b3-theme-background);border-radius:4px"><div style="font-style:italic;margin-bottom:2px">${ex.en}</div><div style="color:var(--b3-theme-on-surface-light);font-size:13px">${ex.zh}</div></div>`).join('')}</div>` : ''
  setBody(`<div style="font-size:20px;font-weight:600;margin-bottom:8px">${r.word}</div>${phonetics ? `<div style="display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap">${phonetics}</div>` : ''}${parts}${examples}`)
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

