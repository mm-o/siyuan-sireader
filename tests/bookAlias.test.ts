import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { isSameOpenedTab, matchLegacyBook } from '@/core/bookshelf'

vi.mock('@/main', () => ({ usePlugin: vi.fn() }))
vi.mock('@/api', () => ({
  readDir: vi.fn(async () => []),
  putFile: vi.fn(),
  removeFile: vi.fn(),
}))
vi.mock('siyuan', () => ({
  showMessage: vi.fn(),
  fetchSyncPost: vi.fn(async () => ({
    code: 0,
    data: {},
  })),
}))

const shelfBooks = [
  {
    url: 'file:///E:/library/books/量价关系_8xv3wj.pdf',
    title: '量价关系_透视股票涨跌脉络_陈凯',
    size: 14479676,
    format: 'pdf',
  },
  {
    url: 'file:///E:/library/books/番茄_exrk55.pdf',
    title: '番茄安全高效栽培技术',
    size: 24252331,
    format: 'pdf',
  },
]

describe('legacy book url matching', () => {
  it('matches the shelf entry that was re-imported under a file:// url', () => {
    expect(matchLegacyBook('pdf://量价关系_透视股票涨跌脉络 - 陈凯_14479676', shelfBooks)?.url).toBe(shelfBooks[0].url)
  })

  it('ignores the annotation suffix that old links carry', () => {
    expect(matchLegacyBook('pdf://量价关系_透视股票涨跌脉络 - 陈凯_14479676_highlight-1794213581693-eknk5go', shelfBooks)?.url).toBe(shelfBooks[0].url)
  })

  it('prefers the entry whose size matches', () => {
    const duplicates = [
      {
        url: 'file:///a/番茄.pdf',
        title: '番茄安全高效栽培技术',
        size: 1,
      },
      {
        url: 'file:///b/番茄.pdf',
        title: '番茄安全高效栽培技术',
        size: 24252331,
      },
    ]
    expect(matchLegacyBook('pdf://番茄安全高效栽培技术_24252331', duplicates)?.url).toBe('file:///b/番茄.pdf')
  })

  it('returns null for non-legacy urls', () => {
    expect(matchLegacyBook('file:///E:/library/books/a.pdf', shelfBooks)).toBeNull()
    expect(matchLegacyBook('https://example.com/a.pdf', shelfBooks)).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(matchLegacyBook('pdf://不存在的书_123', shelfBooks)).toBeNull()
  })
})

describe('reader tab identity', () => {
  const cloud = '/plugin/private/siyuan-cloud/p/WebDAV/Books/一句顶一万句'

  it('separates same-title different-format books by url', () => {
    expect(isSameOpenedTab({ bookInfo: { url: `${cloud}.epub` } }, '一句顶一万句', { title: '一句顶一万句', url: `${cloud}.pdf` })).toBe(false)
    expect(isSameOpenedTab({ bookInfo: { url: `${cloud}.epub` } }, '一句顶一万句', { title: '一句顶一万句', url: `${cloud}.epub` })).toBe(true)
  })

  it('reads url from top-level data and falls back to title', () => {
    expect(isSameOpenedTab({ url: 'https://a/book' }, '在线书', { title: '在线书', url: 'https://a/book' })).toBe(true)
    expect(isSameOpenedTab(null, '某书', { title: '某书', url: 'epub://某书_1' })).toBe(true)
    expect(isSameOpenedTab(null, '某书二', { title: '某书', url: 'epub://某书_1' })).toBe(false)
    expect(isSameOpenedTab(null, '某书', '某书')).toBe(true)
  })

  it('treats percent-encoded and plain cloud urls as the same book', () => {
    const encoded = '/plugin/private/siyuan-cloud/p/WebDAV/Books/%E4%B8%80%E5%8F%A5%E9%A1%B6%E4%B8%80%E4%B8%87%E5%8F%A5.pdf'
    expect(isSameOpenedTab({ bookInfo: { url: encoded } }, '一句顶一万句', { title: '一句顶一万句', url: `${cloud}.pdf` })).toBe(true)
  })
})
