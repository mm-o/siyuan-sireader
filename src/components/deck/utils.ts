// 卡片工具函数
import { getMediaFromApkg } from './pack'

// ========== Anki 文本清理 ==========
const cleanHtml = (html: string) => html
  .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<[^>]+>|(\[sound:[^\]]+\]|{{[^}]+}})/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

// ========== Anki 标题/释义提取 ==========
export const extractAnkiTitle = (card: any): string => 
  card._titleCache || (card._titleCache = (() => {
    const front = card.front || card.fields?.[0] || ''
    const phonetic = front.match(/\[[^\]]+\]/)?.[0] || ''
    const text = cleanHtml(front.replace(/[（(][^)）]*[)）]|\[[^\]]+\]/g, ''))
    return (text + (phonetic ? ' ' + phonetic : '')).trim() || '(无标题)'
  })())

export const extractAnkiHint = (card: any): string => 
  card._hintCache || (card._hintCache = (() => {
    const back = card.back || card.fields?.[1] || ''
    const text = cleanHtml(back.replace(/<br\s*\/?>/gi, ' ').replace(/([高研四六托推]+\s*\d+\/\d+\s*-?\d*|[（(][^)）]*\d+[^)）]*[)）])/g, ''))
    const matches = text.match(/[\u4e00-\u9fa5]+(?:[，。；：、的地得了着过吗呢啊][\u4e00-\u9fa5]*)*[，。；：！？]?/g)
    return matches?.filter((m: string) => m.length > 1).slice(0, 3).join('，').slice(0, 60) || text.slice(0, 60)
  })())

// ========== Anki 渲染 ==========
const scopeCss = (css: string, scope: string): string => {
  const globals = [':root', 'html', 'body']
  return css.split('}').map(rule => {
    const t = rule.trim()
    if (!t) return ''
    if (t.startsWith('@')) {
      if (!t.includes('{')) return rule + '}'
      const [at, ...rest] = t.split('{')
      return (at.includes('@font-face') || at.includes('@keyframes')) ? rule + '}' : `${at} {${scopeCss(rest.join('{'), scope)}`
    }
    const [sel, ...rest] = rule.split('{')
    if (!sel || !rest.length) return rule + '}'
    const scoped = sel.split(',').map(s => {
      const ss = s.trim()
      return globals.some(g => ss === g || ss.startsWith(g + ' ')) ? ss : (ss.startsWith(':') ? `${scope}${ss}` : `${scope} ${ss}`)
    }).join(', ')
    return `${scoped} {${rest.join('{')}`
  }).join('}')
}

export const renderAnki = (card: any, scope = '.deck-card-back') => {
  let html = card.back || ''
  const scripts: string[] = card.scripts || []
  if (!scripts.length) html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi, (_, c: string) => (scripts.push(c.trim()), ''))
  if (card.modelCss) html = `<style>${scopeCss(card.modelCss, scope)}</style>${html}`
  if (scripts.length) setTimeout(() => scripts.forEach(c => { try { ;(0, eval)(c) } catch (e: any) { console.warn('[Anki]', e.message) } }), 50)
  return html
}

// ========== 交互元素处理 ==========
export const setupInteractive = (selector: string) => {
  const stop = (e: Event) => e.stopPropagation()
  document.querySelectorAll(selector).forEach(c => {
    c.querySelectorAll('input, textarea, select').forEach(el => ['click', 'change', 'input', 'focus'].forEach(evt => el.addEventListener(evt, stop, false)))
    c.querySelectorAll('button:not(.b3-button):not(.rating-btn)').forEach(el => el.addEventListener('click', stop, false))
  })
}

// ========== 音频播放 ==========
const audioCache = new Map<string, HTMLAudioElement>()

export const playAudio = async (e: Event) => {
  const svg = (e.target as HTMLElement).closest('.anki-audio') as SVGElement
  if (!svg) return
  e.stopPropagation()
  e.preventDefault()
  
  const { cid, file, url } = svg.dataset
  const use = svg.querySelector('use')
  if (!use) return
  
  const setIcon = (icon: string, opacity = '1') => (use.setAttribute('xlink:href', icon), svg.style.opacity = opacity)
  setIcon('#iconRefresh', '0.5')
  
  try {
    const key = url || `${cid}:${file}`
    let audio = audioCache.get(key)
    if (!audio) {
      const src = url || (cid && file ? URL.createObjectURL((await getMediaFromApkg(cid, file))!) : '')
      if (!src) throw new Error()
      audio = new Audio(src)
      audio.onended = () => setIcon('#iconRecord')
      audio.onerror = () => setIcon('#iconClose')
      audioCache.set(key, audio)
    }
    setIcon('#iconRecord')
    await audio.play()
  } catch {
    setIcon('#iconClose')
  }
}

// ========== 图片懒加载 ==========
const imgCache = new Map<string, string>()

const loadImg = async (cid: string, file: string) => {
  const key = `${cid}:${file}`
  if (imgCache.has(key)) return imgCache.get(key)!
  try {
    const blob = await getMediaFromApkg(cid, file)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    imgCache.set(key, url)
    return url
  } catch { return null }
}

export const setupImageLazyLoad = () => new IntersectionObserver(
  (entries) => entries.forEach(async (entry) => {
    if (!entry.isIntersecting) return
    const img = entry.target as HTMLImageElement
    const { cid, file } = img.dataset
    if (!cid || !file || img.src?.startsWith('blob:')) return
    
    // 图片遮挡：并行加载原图和遮罩
    const w = img.closest('#io-wrapper') as HTMLElement
    if (w) {
      const orig = w.querySelector('#io-original img') as HTMLImageElement
      const mask = w.querySelector('#io-overlay img') as HTMLImageElement
      if (!orig || !mask || orig.src?.startsWith('blob:')) return
      w.style.opacity = '0'
      const [u1, u2] = await Promise.all([loadImg(orig.dataset.cid!, orig.dataset.file!), loadImg(mask.dataset.cid!, mask.dataset.file!)])
      if (u1 && u2) { orig.src = u1; mask.src = u2 }
      w.style.opacity = '1'
      return
    }
    
    // 普通图片
    img.style.opacity = '0.5'
    const url = await loadImg(cid, file)
    if (url) { img.src = url; img.style.opacity = '1' } else { img.alt = `[${file}]`; img.style.opacity = '0.3' }
  }),
  { rootMargin: '200px', threshold: 0.01 }
)

