// 卡片工具函数
import { getMediaFromApkg } from './pack'
import { detectCardType } from './siyuan-card'

// 文本清理：移除 HTML 标签和特殊标记
const cleanHtml = (html: string) => html
  .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<[^>]+>|(\[sound:[^\]]+\]|{{[^}]+}})/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

// 思源闪卡清理：根据类型处理挖空
const cleanSiyuanCard = (html: string, type: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const actions: Record<string, () => void> = {
    'card__block--hidemark': () => doc.querySelectorAll('span[data-type]').forEach(el => {
      if (/\bmark\b/.test(el.getAttribute('data-type') || '')) el.innerHTML = '[...]'
    }),
    'card__block--hideli': () => {
      doc.querySelectorAll('.list[custom-riff-decks]').forEach(list => {
        const items = Array.from(list.children).filter(el => el.classList.contains('li'))
        items.slice(1).forEach(el => el.remove())
        items[0]?.querySelectorAll('.list').forEach(el => el.remove())
      })
      doc.querySelectorAll('.li[custom-riff-decks]>.list').forEach(el => el.remove())
    },
    'card__block--hidesb': () => doc.querySelectorAll('.sb[custom-riff-decks]').forEach(sb => 
      Array.from(sb.children).slice(1).forEach(el => el.remove())
    ),
    'card__block--hideh': () => doc.querySelectorAll('[data-type="NodeHeading"][custom-riff-decks]').forEach(h => {
      let n = h.nextElementSibling
      while (n) { const t = n; n = n.nextElementSibling; t.remove() }
    })
  }
  actions[type]?.()
  return doc.body.innerHTML
}

// 提取思源标记内容（用于提示）
const extractSiyuanMarks = (html: string): string[] => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const marks = new Set<string>()
  doc.querySelectorAll('span[data-type]').forEach(el => {
    if (/\bmark\b/.test(el.getAttribute('data-type') || '')) {
      const text = el.textContent?.trim()
      if (text) marks.add(text)
    }
  })
  return Array.from(marks)
}

// 标题提取：显示在卡片列表中
export const extractAnkiTitle = (card: any): string => 
  card._titleCache || (card._titleCache = (() => {
    let front = card.front || card.fields?.[0] || ''
    if (front.includes('card__block')) {
      const type = detectCardType(front)
      if (type) front = cleanSiyuanCard(front, type)
    }
    const text = cleanHtml(front)
    const phonetic = text.match(/\[[a-zA-Z:ˈˌəɪʊɛæɑɔʌθðŋʃʒ]+\]/)?.[0] || ''
    const cleaned = text.replace(/[（(][^)）]*[)）]/g, '').replace(/\[[a-zA-Z:ˈˌəɪʊɛæɑɔʌθðŋʃʒ]+\]/g, '')
    return (cleaned + (phonetic ? ' ' + phonetic : '')).trim() || '(无标题)'
  })())

// 提示提取：鼠标悬停显示的内容
export const extractAnkiHint = (card: any): string => 
  card._hintCache || (card._hintCache = (() => {
    let back = card.back || card.fields?.[1] || ''
    
    // 思源闪卡：提取标记内容
    if (back.includes('card__block')) {
      const type = detectCardType(back)
      if (type === 'card__block--hidemark') {
        const marks = extractSiyuanMarks(back)
        if (marks.length) return marks.join('，')
      }
    }
    
    // 普通卡片：提取中文句子
    const text = cleanHtml(back.replace(/<br\s*\/?>/gi, ' ').replace(/([高研四六托推]+\s*\d+\/\d+\s*-?\d*|[（(][^)）]*\d+[^)）]*[)）])/g, ''))
    const matches = text.match(/[\u4e00-\u9fa5]+(?:[，。；：、的地得了着过吗呢啊][\u4e00-\u9fa5]*)*[，。；：！？]?/g)
    return matches?.filter((m: string) => m.length > 1).slice(0, 3).join('，').slice(0, 60) || text.slice(0, 60)
  })())

// CSS 作用域
const scopeCss = (css: string, scope: string): string => {
  const globals = [':root', 'html', 'body']
  return css.split('}').map(rule => {
    const t = rule.trim()
    if (!t) return ''
    if (t.startsWith('@')) {
      if (!t.includes('{')) return rule + '}'
      const [at, ...rest] = t.split('{')
      return at.includes('@font-face') || at.includes('@keyframes') ? rule + '}' : `${at} {${scopeCss(rest.join('{'), scope)}`
    }
    const [sel, ...rest] = rule.split('{')
    if (!sel || !rest.length) return rule + '}'
    const scoped = sel.split(',').map(s => {
      const ss = s.trim()
      return globals.some(g => ss === g || ss.startsWith(g + ' ')) ? ss : ss.startsWith(':') ? `${scope}${ss}` : `${scope} ${ss}`
    }).join(', ')
    return `${scoped} {${rest.join('{')}`
  }).join('}')
}

const renderWithCss = (html: string, css: string | undefined, scope: string) => 
  css ? `<style>${scopeCss(css, scope)}</style>${html}` : html

export const renderFront = (card: any, scope = '.anki-content') => 
  renderWithCss(card.front || '', card.modelCss, scope)

export const renderAnki = (card: any, scope = '.deck-card-back') => {
  let html = card.back || ''
  const scripts: string[] = card.scripts || []
  if (!scripts.length) html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi, (_, c: string) => (scripts.push(c.trim()), ''))
  html = renderWithCss(html, card.modelCss, scope)
  if (scripts.length) setTimeout(() => scripts.forEach(c => { try { ;(0, eval)(c) } catch (e: any) { console.warn('[Anki]', e.message) } }), 50)
  return html
}

// 交互处理
export const setupInteractive = (selector: string) => {
  const stop = (e: Event) => e.stopPropagation()
  document.querySelectorAll(selector).forEach(c => {
    c.querySelectorAll('input, textarea, select').forEach(el => ['click', 'change', 'input', 'focus'].forEach(evt => el.addEventListener(evt, stop, false)))
    c.querySelectorAll('button:not(.b3-button):not(.rating-btn)').forEach(el => el.addEventListener('click', stop, false))
  })
}

// 音频播放
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

// 图片懒加载
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
    
    img.style.opacity = '0.5'
    const url = await loadImg(cid, file)
    if (url) { img.src = url; img.style.opacity = '1' } else { img.alt = `[${file}]`; img.style.opacity = '0.3' }
  }),
  { rootMargin: '200px', threshold: 0.01 }
)

// 卡片熟练度
const MASTERY = { colors: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6'], icons: ['😐', '🙂', '😊', '🤩'] }

const getMasteryLevel = (card: any) => {
  const days = Math.floor((card.learning?.interval || 0) / 1440)
  return days < 1 ? 0 : days < 4 ? 1 : days < 15 ? 2 : 3
}

export const getMasteryColor = (card: any) => MASTERY.colors[getMasteryLevel(card)]
export const getMasteryIcon = (card: any) => MASTERY.icons[getMasteryLevel(card)]

// ========== 卡片刷新 ==========
export const refreshCards = (selector: string, obs: IntersectionObserver | null) => {
  setTimeout(() => {
    document.querySelectorAll(`${selector} img[data-cid]`).forEach(img => {
      if (!(img as HTMLImageElement).src?.startsWith('blob:')) obs?.observe(img)
    })
    ;(window as any).MathJax?.typesetPromise?.()
    setTimeout(() => setupInteractive(selector), 100)
  }, 100)
}

// MathJax
export const initMathJax = () => {
  if (!(window as any).MathJax) {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'
    script.async = true
    document.head.appendChild(script)
  }
}

export const renderMath = (selector: string) => 
  (window as any).MathJax?.typesetPromise?.([document.querySelector(selector)]).catch(() => {})

// 格式化
export const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

export const formatDate = (dateStr: string) => {
  const dt = new Date(dateStr)
  return `${dt.getMonth() + 1}/${dt.getDate()}`
}

export const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim()

export const stopIfAudio = (e: Event) => {
  if ((e.target as HTMLElement).closest('.anki-audio')) e.stopPropagation()
}

// 统计图表
export const calcRings = (dist: any[]) => 
  dist.map((d, i) => {
    const r = 100 - i * 20
    const c = 2 * Math.PI * r
    return { r, w: 14, circum: c, dash: (d.percent / 100) * c, color: d.color }
  })

export const calcRadar = (dist: any[]) => {
  const n = dist.length
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * Math.PI / n) - Math.PI / 2
    return { x: Math.cos(a), y: Math.sin(a) }
  })
  const max = Math.max(...dist.map(d => d.count), 1)
  const data = dist.map((d, i) => ({ x: pts[i].x * d.count / max * 88, y: pts[i].y * d.count / max * 88 }))
  const labels = dist.map((d, i) => ({ x: pts[i].x * 116, y: pts[i].y * 116 + 4, label: d.label }))
  return { points: pts, data, labels, polygon: data.map(p => `${p.x},${p.y}`).join(' ') }
}