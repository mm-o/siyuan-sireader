// 卡片工具函数
import { getMediaFromApkg } from './pack'

// ========== Anki 文本清理 ==========
const cleanHtml = (html: string) => html
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\[sound:[^\]]+\]/g, '')
  .replace(/{{[^}]+}}/g, '')
  .replace(/\s+/g, ' ')
  .trim()

// ========== Anki 标题/释义提取 ==========
export const extractAnkiTitle = (card: any): string => {
  if (card._titleCache) return card._titleCache
  const front = card.front || card.fields?.[0] || ''
  const phonetic = front.match(/\[[^\]]+\]/)?.[0] || ''
  const text = cleanHtml(front.replace(/[（(][^)）]*[)）]/g, '').replace(/\[[^\]]+\]/g, ''))
  card._titleCache = (text + (phonetic ? ' ' + phonetic : '')).trim() || '(无标题)'
  return card._titleCache
}

export const extractAnkiHint = (card: any): string => {
  if (card._hintCache) return card._hintCache
  const back = card.back || card.fields?.[1] || ''
  const text = cleanHtml(back.replace(/<br\s*\/?>/gi, ' ').replace(/[高研四六托推]+\s*\d+\/\d+\s*-?\d*/g, '').replace(/[（(][^)）]*\d+[^)）]*[)）]/g, ''))
  const matches = text.match(/[\u4e00-\u9fa5]+(?:[，。；：、的地得了着过吗呢啊][\u4e00-\u9fa5]*)*[，。；：！？]?/g)
  card._hintCache = matches?.filter((m: string) => m.length > 1).slice(0, 3).join('，').slice(0, 60) || text.slice(0, 60)
  return card._hintCache
}

// ========== Anki 渲染 ==========
// 清理HTML中的不安全内联事件
const sanitizeHtml = (html: string) => html
  .replace(/\s+on(click|change|input|submit|load|error)\s*=\s*["'](?!this\.checked)[^"']*["']/gi, '')
  .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
  .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')

// CSS作用域化
const scopeCss = (css: string, scope: string) => css
  .split('}')
  .map(rule => {
    if (!rule.trim()) return ''
    const [selector, ...rest] = rule.split('{')
    if (!selector || !rest.length) return rule + '}'
    const scoped = selector.split(',').map(s => `${scope} ${s.trim()}`).join(', ')
    return `${scoped} {${rest.join('{')}`
  })
  .join('}')

// 渲染Anki卡片
export const renderAnki = (card: any, scope = '.deck-card-back') => {
  const html = sanitizeHtml(card.back || '')
  return card.modelCss ? `<style>${scopeCss(card.modelCss, scope)}</style>${html}` : html
}

// ========== 交互元素处理 ==========
export const setupInteractive = (selector: string) => {
  document.querySelectorAll(selector).forEach(container => {
    // 复选框
    container.querySelectorAll('input[type="checkbox"]').forEach(el => {
      const e = el as HTMLInputElement
      e.removeAttribute('onchange')
      e.removeAttribute('onclick')
      e.addEventListener('click', ev => ev.stopPropagation(), { capture: false })
      e.addEventListener('change', ev => ev.stopPropagation(), { capture: false })
    })
    
    // 输入框
    container.querySelectorAll('input[type="text"], input:not([type]), textarea').forEach(el => {
      const e = el as HTMLInputElement
      e.removeAttribute('onclick')
      e.removeAttribute('oninput')
      e.removeAttribute('onchange')
      e.addEventListener('click', ev => ev.stopPropagation(), { capture: false })
      e.addEventListener('focus', ev => ev.stopPropagation(), { capture: false })
      e.addEventListener('input', ev => ev.stopPropagation(), { capture: false })
    })
    
    // 按钮
    container.querySelectorAll('button:not(.b3-button):not(.rating-btn)').forEach(el => {
      const e = el as HTMLButtonElement
      e.removeAttribute('onclick')
      e.addEventListener('click', ev => ev.stopPropagation(), { capture: false })
    })
    
    // 选择框
    container.querySelectorAll('select').forEach(el => {
      const e = el as HTMLSelectElement
      e.removeAttribute('onchange')
      e.removeAttribute('onclick')
      e.addEventListener('click', ev => ev.stopPropagation(), { capture: false })
      e.addEventListener('change', ev => ev.stopPropagation(), { capture: false })
    })
    
    // 链接
    container.querySelectorAll('a').forEach(el => {
      const e = el as HTMLAnchorElement
      if (e.href.startsWith('javascript:') || e.getAttribute('href') === '#') {
        e.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation() }, { capture: false })
      }
    })
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
  
  svg.style.opacity = '0.5'
  use.setAttribute('xlink:href', '#iconRefresh')
  
  try {
    const key = url || `${cid}:${file}`
    let audio = audioCache.get(key)
    
    if (!audio) {
      const src = url || (cid && file ? URL.createObjectURL((await getMediaFromApkg(cid, file))!) : '')
      if (!src) throw new Error('音频加载失败')
      audio = new Audio(src)
      audio.onended = () => { use.setAttribute('xlink:href', '#iconRecord'); svg.style.opacity = '1' }
      audio.onerror = () => { use.setAttribute('xlink:href', '#iconClose'); svg.style.opacity = '1' }
      audioCache.set(key, audio)
    }
    
    use.setAttribute('xlink:href', '#iconRecord')
    svg.style.opacity = '1'
    await audio.play()
  } catch {
    use.setAttribute('xlink:href', '#iconClose')
    svg.style.opacity = '1'
  }
}

// ========== 图片懒加载 ==========
export const setupImageLazyLoad = () => new IntersectionObserver(
  (entries) => entries.forEach(async (entry) => {
    if (!entry.isIntersecting) return
    const img = entry.target as HTMLImageElement
    const { cid, file } = img.dataset
    if (!cid || !file || (img.src && img.src.startsWith('blob:'))) return
    
    try {
      img.style.opacity = '0.5'
      const blob = await getMediaFromApkg(cid, file)
      if (blob) {
        img.src = URL.createObjectURL(blob)
        img.style.opacity = '1'
      } else {
        img.alt = `[${file}]`
        img.style.opacity = '0.3'
      }
    } catch {
      img.alt = `[${file}]`
      img.style.opacity = '0.3'
    }
  }),
  { root: null, rootMargin: '200px', threshold: 0.01 }
)

