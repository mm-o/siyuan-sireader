import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appendBlock: vi.fn(),
  getBook: vi.fn(),
  insertNote: vi.fn(),
  showMsg: vi.fn(),
  updateBlock: vi.fn(),
}))

vi.mock('@/api', () => ({
  appendBlock: mocks.appendBlock,
  getBlockByID: vi.fn(),
  updateBlock: mocks.updateBlock,
  upload: vi.fn(),
}))

vi.mock('@/utils/noteInsert', () => ({
  insertNote: mocks.insertNote,
}))

vi.mock('@/composables/useSetting', () => ({
  collectAnnotationTagPresets: vi.fn(),
  // 与真实 formatBookLink 同义：无章节时收起模板里的章节位，无位置时链接落到 sireader://resume。
  formatBookLink: (bookUrl: string, title: string, author: string, chapter: string, cfi: string, text: string, format: string, note = '', image = '') => {
    const url = cfi ? `sireader://open?url=${bookUrl}&cfi=${cfi}` : `sireader://resume?url=${bookUrl}`
    const tpl = chapter ? format : format.replace(/ ?[·/|]\s*(章节|\{\{chapter\}\})/g, '').replace(/(章节|\{\{chapter\}\})/g, '')
    return tpl
      .replaceAll('书名', title).replaceAll('作者', author).replaceAll('章节', chapter || title)
      .replaceAll('位置', '').replaceAll('链接', url).replaceAll('文本', text).replaceAll('笔记', note).replaceAll('图片', image)
      .replaceAll('{{title}}', title).replaceAll('{{author}}', author).replaceAll('{{chapter}}', chapter || title)
      .replaceAll('{{text}}', text).replaceAll('{{note}}', note).replaceAll('{{image}}', image)
      .replaceAll('{{url}}', url)
      .replace(/\[\]\(/g, `[${title}](`)
      .replace(/^>[ \t]*$/gm, '').replace(/^[ \t]*(?:[-*+]|#{1,6})[ \t]*$/gm, '').replace(/[ \t]+$/gm, '').replace(/\n\n+/g, '\n').trim()
  },
  settingsManager: { get: vi.fn(async () => (window as any).__sireader_settings) },
}))

vi.mock('@/core/bookshelf', () => ({
  bookshelfManager: {
    getBook: mocks.getBook,
    getSetting: vi.fn(async () => null),
    updateBook: vi.fn(),
  },
}))

vi.mock('@/core/MarkManager', () => ({
  formatAuthor: (author: any) => Array.isArray(author) ? author.join(', ') : author || '',
  getChapterName: () => 'Chapter 1',
}))

const operations = (id: string) => [{ doOperations: [{ id }] }]
const setSettings = (settings: any) => {
  ;(globalThis as any).window = globalThis
  ;(window as any).__sireader_settings = settings
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } })
  mocks.getBook.mockResolvedValue(null)
})

describe('annotation markdown export', () => {
  test('builds custom template markdown without touching clipboard', async () => {
    setSettings({ linkFormat: 'TITLE={{title}}\nTEXT={{text}}\nNOTE={{note}}\nURL={{url}}', noteInsertTarget: 'clipboard' })

    const { buildMarkMarkdown } = await import('@/utils/copy')
    const markdown = await buildMarkMarkdown(
      { id: 'mark-1', cfi: 'epubcfi(/6/2)', chapter: 'Chapter 1', text: 'hello world', note: 'my note' },
      { bookUrl: 'book.epub', bookInfo: { title: 'Book Title', author: 'Author' }, showMsg: vi.fn() },
    )

    expect(markdown).toContain('TITLE=Book Title')
    expect(markdown).toContain('TEXT=hello world')
    expect(markdown).toContain('NOTE=my note')
    expect(markdown).not.toContain('\u{1f4d1}')
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  test('sends custom markdown to documents without clipboard capture', async () => {
    mocks.appendBlock.mockResolvedValue(operations('block-1'))
    setSettings({ linkFormat: 'TITLE={{title}}\nTEXT={{text}}\nNOTE={{note}}', noteInsertTarget: 'clipboard' })

    const { sendMarkToDoc } = await import('@/utils/copy')
    const blockId = await sendMarkToDoc(
      { id: 'mark-1', cfi: 'epubcfi(/6/2)', chapter: 'Chapter 1', text: 'hello world', note: 'my note' },
      'doc-1',
      { bookUrl: 'book.epub', bookInfo: { title: 'Book Title' }, showMsg: vi.fn() },
    )

    expect(blockId).toBe('block-1')
    expect(mocks.appendBlock).toHaveBeenCalledWith('markdown', expect.stringContaining('TITLE=Book Title'), 'doc-1')
    expect(mocks.appendBlock).toHaveBeenCalledWith('markdown', expect.not.stringContaining('\u{1f4d1}'), 'doc-1')
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  test('updates existing inserted blocks even when the book is not bound', async () => {
    mocks.updateBlock.mockResolvedValue([])
    setSettings({ linkFormat: 'TITLE={{title}}\nNOTE={{note}}', noteInsertTarget: 'clipboard' })

    const { updateMarkInDoc } = await import('@/utils/copy')
    await updateMarkInDoc(
      { id: 'mark-1', blockId: 'block-1', cfi: 'epubcfi(/6/2)', text: 'hello world', note: 'edited note' },
      { bookUrl: 'book.epub', bookInfo: { title: 'Book Title' }, showMsg: vi.fn() },
    )

    expect(mocks.updateBlock).toHaveBeenCalledWith('markdown', expect.stringContaining('NOTE=edited note'), 'block-1')
  })

  test('syncs edited unsent marks through the same custom template', async () => {
    mocks.insertNote.mockResolvedValue(operations('block-2'))
    setSettings({ annotationSyncOnAdd: true, linkFormat: 'TITLE={{title}}\nNOTE={{note}}', noteInsertTarget: 'document' })
    const marks = { updateMark: vi.fn() }

    const { saveMarkEdit } = await import('@/utils/copy')
    const mark = { id: 'mark-2', cfi: 'epubcfi(/6/4)', text: 'hello world' }
    await saveMarkEdit(mark, { note: 'new note' }, { bookUrl: 'book.epub', bookInfo: { title: 'Book Title' }, marks, showMsg: vi.fn() })

    expect(mocks.insertNote).toHaveBeenCalledWith(expect.stringContaining('NOTE=new note'), expect.anything(), 'Book Title', 'book.epub', undefined)
    expect(marks.updateMark).toHaveBeenLastCalledWith(expect.objectContaining({ blockId: 'block-2' }), { blockId: 'block-2', blockIds: ['block-2'] })
  })
})

describe('book link export', () => {
  const copyBook = async (linkFormat: string) => {
    mocks.getBook.mockResolvedValue({ title: '三体', author: ['刘慈欣'], bindDocId: '' })
    setSettings({ linkFormat, noteInsertTarget: 'clipboard' })
    const { exportBookLink, asClipboardCtx } = await import('@/utils/copy')
    await exportBookLink({}, asClipboardCtx({ bookUrl: 'book.epub', showMsg: mocks.showMsg }))
    return vi.mocked(navigator.clipboard.writeText).mock.calls.at(-1)?.[0]
  }

  test('keeps 「书名 · 章节」 in the template without repeating the title', async () => {
    expect(await copyBook('> [书名 · 章节](链接) 文本\n>\n> 笔记\n>\n> 图片')).toBe('> [三体](sireader://resume?url=book.epub)')
  })

  test('falls back to the book name when the template only has a chapter slot', async () => {
    expect(await copyBook('> [!NOTE] 📑 {{title}}\n> [{{chapter}}]({{url}}) {{text}}')).toBe('> [!NOTE] 📑 三体\n> [三体](sireader://resume?url=book.epub)')
  })

  test('drops empty list markers instead of leaving a dangling bullet', async () => {
    expect(await copyBook('- [书名 / 章节](链接)\n- 文本')).toBe('- [三体](sireader://resume?url=book.epub)')
  })

  test('exports the plain title when the template is blank', async () => {
    expect(await copyBook('   ')).toBe('三体')
  })

  test('keeps the chapter in annotation links', async () => {
    mocks.getBook.mockResolvedValue({ title: '三体', author: ['刘慈欣'], bindDocId: '' })
    setSettings({ linkFormat: '> [书名 · 章节](链接) 文本', noteInsertTarget: 'clipboard' })
    const { exportBookLink, asClipboardCtx } = await import('@/utils/copy')
    await exportBookLink({ chapter: '第三章', cfi: '#page-7', text: '引用' }, asClipboardCtx({ bookUrl: 'book.epub', showMsg: mocks.showMsg }))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('> [三体 · 第三章](sireader://open?url=book.epub&cfi=#page-7) 引用')
  })
})
