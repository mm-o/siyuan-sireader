import { afterEach, describe, expect, test, vi } from 'vitest'
import { translateAzure, translateMyMemory, translateTransmart, translateVolcengine, translateWechat, translateYoudao } from '@/services/translator'

const forwardProxy = vi.hoisted(() => vi.fn())
vi.mock('@/api', () => ({ forwardProxy }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('translator services', () => {
  test('uses MyMemory response text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ responseData: { translatedText: '这是测试。' } }),
    }))
    await expect(translateMyMemory('This is a test.')).resolves.toBe('这是测试。')
  })

  test('uses Microsoft web translation without a key', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ translations: [{ text: '这是测试。' }] }] }))
    await expect(translateAzure('This is a test.')).resolves.toBe('这是测试。')
  })

  test('uses Tencent Transmart response text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auto_translation: ['这是测试。'] }),
    }))
    await expect(translateTransmart('This is a test.')).resolves.toBe('这是测试。')
  })

  test('uses Youdao response text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translation: ['这是测试。'] }),
    }))
    await expect(translateYoudao('This is a test.')).resolves.toBe('这是测试。')
  })

  test('uses Volcengine through SiYuan proxy', async () => {
    forwardProxy.mockResolvedValue({ status: 200, body: JSON.stringify({ translation: '这是测试。', base_resp: { status_code: 0 } }) })
    await expect(translateVolcengine('This is a test.')).resolves.toBe('这是测试。')
    expect(forwardProxy).toHaveBeenCalledWith('https://translate.volcengine.com/crx/translate/v1/', 'POST', expect.any(String), expect.any(Array), 15000, 'application/json')
  })

  test('uses WeChat through SiYuan proxy', async () => {
    forwardProxy.mockResolvedValue({ status: 200, body: JSON.stringify({ errCode: 0, targetText: '这是测试。' }) })
    await expect(translateWechat('This is a test.')).resolves.toBe('这是测试。')
    expect(forwardProxy).toHaveBeenCalledWith(expect.stringContaining('wxapp.translator.qq.com/api/translate'), 'GET', {}, expect.any(Array), 15000, 'text/plain')
  })
})
