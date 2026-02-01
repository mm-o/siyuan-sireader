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

// ========== Anki 标题提取 ==========
export const extractAnkiTitle = (card: any): string => {
  if (card._titleCache) return card._titleCache
  
  const front = card.front || card.fields?.[0] || ''
  const phonetic = front.match(/\[[^\]]+\]/)?.[0] || ''
  const text = cleanHtml(front.replace(/[（(][^)）]*[)）]/g, '').replace(/\[[^\]]+\]/g, ''))
  
  card._titleCache = (text + (phonetic ? ' ' + phonetic : '')).trim() || '(无标题)'
  return card._titleCache
}

// ========== Anki 释义提取 ==========
export const extractAnkiHint = (card: any): string => {
  if (card._hintCache) return card._hintCache
  
  const back = card.back || card.fields?.[1] || ''
  const text = cleanHtml(back.replace(/<br\s*\/?>/gi, ' ').replace(/[高研四六托推]+\s*\d+\/\d+\s*-?\d*/g, '').replace(/[（(][^)）]*\d+[^)）]*[)）]/g, ''))
  const matches = text.match(/[\u4e00-\u9fa5]+(?:[，。；：、的地得了着过吗呢啊][\u4e00-\u9fa5]*)*[，。；：！？]?/g)
  
  card._hintCache = matches?.filter((m: string) => m.length > 1).slice(0, 3).join('，').slice(0, 60) || text.slice(0, 60)
  return card._hintCache
}

// ========== 音频播放 ==========
const audioCache = new Map<string, HTMLAudioElement>()

const createAudio = (src: string, use: SVGUseElement, svg: SVGElement) => {
  const audio = new Audio(src)
  audio.onended = () => { use.setAttribute('xlink:href', '#iconRecord'); svg.style.opacity = '1' }
  audio.onerror = () => { use.setAttribute('xlink:href', '#iconClose'); svg.style.opacity = '1' }
  return audio
}

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
    let audio: HTMLAudioElement | undefined
    
    if (url) {
      const key = `url:${url}`
      audio = audioCache.get(key) || createAudio(url, use, svg)
      if (!audioCache.has(key)) audioCache.set(key, audio)
    } else if (cid && file) {
      const key = `${cid}:${file}`
      if (!audioCache.has(key)) {
        const blob = await getMediaFromApkg(cid, file)
        if (!blob) throw new Error('音频加载失败')
        audio = createAudio(URL.createObjectURL(blob), use, svg)
        audioCache.set(key, audio)
      } else {
        audio = audioCache.get(key)
      }
    }
    
    if (audio) {
      use.setAttribute('xlink:href', '#iconRecord')
      svg.style.opacity = '1'
      await audio.play()
    }
  } catch (err) {
    console.error('[Audio]', file || url, err)
    use.setAttribute('xlink:href', '#iconClose')
    svg.style.opacity = '1'
  }
}

// ========== 图片懒加载 ==========
const loadImage = async (img: HTMLImageElement, cid: string, file: string) => {
  try {
    const blob = await getMediaFromApkg(cid, file)
    if (blob) {
      img.src = URL.createObjectURL(blob)
      img.style.background = ''
      img.style.minHeight = ''
    } else {
      img.style.display = 'none'
    }
  } catch {
    img.style.display = 'none'
  }
}

export const setupImageLazyLoad = () => new IntersectionObserver(
  (entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return
    const img = entry.target as HTMLImageElement
    const { cid, file } = img.dataset
    const srcAttr = img.getAttribute('src')
    if (cid && file && (!srcAttr || !srcAttr.startsWith('blob:'))) loadImage(img, cid, file)
  }),
  { root: null, rootMargin: '200px', threshold: 0.01 }
)
