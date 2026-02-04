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
const sanitizeHtml = (html: string) => html
  .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
  .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')

const scopeCss = (css: string, scope: string): string => {
  const globals = [':root', 'html', 'body']
  return css.split('}').map(rule => {
    const t = rule.trim()
    if (!t) return ''
    
    // @规则
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
  
  // 降级：从 HTML 提取脚本
  if (!scripts.length) html = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi, (_, code: string) => (scripts.push(code.trim()), ''))
  
  html = sanitizeHtml(html)
  if (card.modelCss) html = `<style>${scopeCss(card.modelCss, scope)}</style>${html}`
  
  if (scripts.length) setTimeout(() => scripts.forEach(code => {
    try { ;(0, eval)(code) } catch (err: any) { console.warn('[Anki Script]', err.message) }
  }), 100)
  
  return html
}

// ========== 交互元素处理 ==========
export const setupInteractive = (selector: string) => {
  const stop = (ev: Event) => ev.stopPropagation()
  const prevent = (ev: Event) => { ev.preventDefault(); ev.stopPropagation() }
  
  document.querySelectorAll(selector).forEach(container => {
    // 表单元素（优化：批量处理）
    container.querySelectorAll('input, textarea, select, button:not(.b3-button):not(.rating-btn)').forEach(el => {
      ['onclick', 'onchange', 'oninput'].forEach(attr => el.removeAttribute(attr))
      ;['click', 'change', 'input', 'focus'].forEach(evt => el.addEventListener(evt, stop, false))
    })
    
    // 链接（优化：简化判断）
    container.querySelectorAll('a[href^="javascript:"], a[href="#"]').forEach(el => 
      el.addEventListener('click', prevent, false)
    )
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
export const setupImageLazyLoad = () => new IntersectionObserver(
  (entries) => entries.forEach(async (entry) => {
    if (!entry.isIntersecting) return
    const img = entry.target as HTMLImageElement
    const { cid, file } = img.dataset
    if (!cid || !file || img.src?.startsWith('blob:')) return
    
    img.style.opacity = '0.5'
    try {
      const blob = await getMediaFromApkg(cid, file)
      if (!blob) throw new Error()
      img.src = URL.createObjectURL(blob)
      img.style.opacity = '1'
    } catch {
      img.alt = `[${file}]`
      img.style.opacity = '0.3'
    }
  }),
  { rootMargin: '200px', threshold: 0.01 }
)

