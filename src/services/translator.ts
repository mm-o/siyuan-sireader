import { forwardProxy } from '@/api'

const proxyJson = async (url: string, method: 'GET' | 'POST', payload: object | string, headers: Record<string, string>[], contentType: string) => {
  const response = await forwardProxy(url, method, payload, headers, 15000, contentType)
  if (!response || response.status < 200 || response.status >= 300) throw new Error(`Translation proxy HTTP ${response?.status || 0}`)
  return JSON.parse(response.body)
}

export async function translateGoogle(text: string, targetLang: string = 'zh-CN'): Promise<string> {
  const url = new URL('https://translate.googleapis.com/translate_a/single')
  url.searchParams.append('client', 'gtx')
  url.searchParams.append('dt', 't')
  url.searchParams.append('sl', 'auto')
  url.searchParams.append('tl', targetLang)
  url.searchParams.append('q', text)
  
  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`Google HTTP ${response.status}`)
  const data = await response.json()
  
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].filter((s: any) => Array.isArray(s) && s[0]).map((s: any) => s[0]).join('')
  }
  throw new Error('Google returned no translation')
}

export async function translateMyMemory(text: string, targetLang: string = 'zh-CN'): Promise<string> {
  const url = new URL('https://api.mymemory.translated.net/get')
  url.searchParams.set('q', text)
  url.searchParams.set('langpair', `en|${targetLang}`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`MyMemory HTTP ${response.status}`)
  const data = await response.json()
  const result = data?.responseData?.translatedText?.trim()
  if (!result) throw new Error(data?.responseDetails || 'MyMemory returned no translation')
  return result
}

export async function translateTransmart(text: string, targetLang: string = 'zh-CN'): Promise<string> {
  const target = targetLang.startsWith('zh') ? 'zh' : targetLang
  const response = await fetch('https://transmart.qq.com/api/imt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      header: { fn: 'auto_translation', client_key: 'browser-chrome', client_ver: '1.0.0', common: { model: 'browser' } },
      type: 'plain',
      model_category: 'normal',
      source: { lang: 'auto', text_list: [text] },
      target: { lang: target },
    }),
  })
  if (!response.ok) throw new Error(`Transmart HTTP ${response.status}`)
  const result = (await response.json())?.auto_translation?.[0]?.trim()
  if (!result) throw new Error('Transmart returned no translation')
  return result
}

export async function translateYoudao(text: string, targetLang: string = 'zh-CN'): Promise<string> {
  const target = ({ 'zh-CN': 'zh-CHS', 'zh-TW': 'zh-CHT' } as Record<string, string>)[targetLang] || targetLang
  const response = await fetch('https://aidemo.youdao.com/trans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ q: text, from: 'auto', to: target }),
  })
  if (!response.ok) throw new Error(`Youdao HTTP ${response.status}`)
  const result = (await response.json())?.translation?.join('\n')?.trim()
  if (!result) throw new Error('Youdao returned no translation')
  return result
}

export async function translateVolcengine(text: string, targetLang: string = 'zh-CN'): Promise<string> {
  const target = targetLang === 'zh-CN' ? 'zh' : targetLang
  const data = await proxyJson(
    'https://translate.volcengine.com/crx/translate/v1/',
    'POST',
    JSON.stringify({ source_language: 'detect', target_language: target, text }),
    [{ 'Content-Type': 'application/json' }],
    'application/json',
  )
  const result = data?.translation?.trim()
  if (data?.base_resp?.status_code !== 0 || !result) throw new Error(data?.base_resp?.status_message || 'Volcengine returned no translation')
  return result
}

export async function translateWechat(text: string, targetLang: string = 'zh-CN'): Promise<string> {
  const target = ({ 'zh-CN': 'zh', ja: 'jp', ko: 'kr' } as Record<string, string>)[targetLang] || targetLang
  const params = new URLSearchParams({ source: 'auto', target, sourceText: text, platform: 'WeChat_APP', candidateLangs: 'en|zh', guid: 'oqdgX0SIwhvM0TmqzTHghWBvfk22' })
  const data = await proxyJson(
    `https://wxapp.translator.qq.com/api/translate?${params}`,
    'GET',
    {},
    [
      { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.32' },
      { Referer: 'https://servicewechat.com/wxb1070eabc6f9107e/117/page-frame.html' },
    ],
    'text/plain',
  )
  const result = data?.targetText?.trim()
  if (data?.errCode !== 0 || !result) throw new Error(data?.errMsg || 'WeChat returned no translation')
  return result
}

export async function translateAzure(text: string, targetLang: string = 'zh-CN'): Promise<string> {
  const language = ({ 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant' } as Record<string, string>)[targetLang] || targetLang
  const params = new URLSearchParams({ to: language, isEnterpriseClient: 'false' })
  const response = await fetch(`https://edge.microsoft.com/translate/translatetext?${params}`, {
    method: 'POST',
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    body: JSON.stringify([text])
  })
  if (!response.ok) throw new Error(`Microsoft HTTP ${response.status}`)
  const result = (await response.json())?.[0]?.translations?.[0]?.text?.trim()
  if (!result) throw new Error('Microsoft returned no translation')
  return result
}

export async function translateAISiyuan(text: string, targetLang: string = 'zh-CN'): Promise<string> {
  const hideProgress = () => {
    const el = document.querySelector('#progress:has(.b3-dialog__loading)')
    if (el) el.remove()
    else requestAnimationFrame(hideProgress)
  }
  hideProgress()
  
  const langMap: Record<string, string> = {
    'zh-CN': '中文', 'en': 'English', 'ja': '日本語', 'ko': '한국어',
    'fr': 'Français', 'de': 'Deutsch', 'es': 'Español', 'ru': 'Русский'
  }
  const targetName = langMap[targetLang] || targetLang
  const response = await fetch('/api/ai/chatGPT', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg: `请将以下文本翻译成${targetName}，只返回译文，不要解释：\n\n${text}` })
  })
  const data = await response.json()
  if (data.code !== 0) throw new Error(data.msg || '翻译失败')
  return data.data || text
}

export const translators = {
  google: { name: 'Google', translate: translateGoogle },
  azure: { name: 'Microsoft', translate: translateAzure },
  transmart: { name: '腾讯翻译', translate: translateTransmart },
  youdao: { name: '有道翻译', translate: translateYoudao },
  volcengine: { name: '火山翻译', translate: translateVolcengine },
  wechat: { name: '微信翻译', translate: translateWechat },
  mymemory: { name: 'MyMemory（免费）', translate: translateMyMemory },
  ai: { name: 'AI翻译(思源)', translate: translateAISiyuan }
}
