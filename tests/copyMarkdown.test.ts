import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appendBlock: vi.fn(),
  deleteBlock: vi.fn(),
  getBlockByID: vi.fn(),
  getBlockKramdown: vi.fn(),
  getBook: vi.fn(),
  getChildBlocks: vi.fn(),
  insertBlock: vi.fn(),
  insertNote: vi.fn(),
  showMsg: vi.fn(),
  updateBlock: vi.fn(),
}))

vi.mock('@/api', () => ({
  appendBlock: mocks.appendBlock,
  deleteBlock: mocks.deleteBlock,
  getBlockByID: mocks.getBlockByID,
  getBlockKramdown: mocks.getBlockKramdown,
  getChildBlocks: mocks.getChildBlocks,
  insertBlock: mocks.insertBlock,
  updateBlock: mocks.updateBlock,
  upload: vi.fn(),
}))

vi.mock('@/utils/noteInsert', () => ({
  insertNote: mocks.insertNote,
}))

vi.mock('@/composables/useSetting', () => ({
  collectAnnotationTagPresets: vi.fn(),
  // 与真实 formatBookLink 同义：模板原样输出，一行占位符全空则该行不产出。
  formatBookLink: (bookUrl: string, title: string, author: string, chapter: string, cfi: string, text: string, format: string, note = '', image = '') => {
    const v: Record<string, string> = {
      '书名|{{title}}': title, '作者|{{author}}': author, '章节|{{chapter}}': chapter || title, '位置|{{location}}': '',
      '链接|{{url}}': cfi ? `sireader://open?url=${bookUrl}&cfi=${cfi}` : `sireader://resume?url=${bookUrl}`,
      '文本|{{text}}': text, '笔记|{{note}}': note, '图片|{{image}}': image,
    }
    const keep = (line: string) => {
      const hit = Object.keys(v).filter(aliases => aliases.split('|').some(alias => line.includes(alias)))
      return !hit.length || hit.some(alias => v[alias])
    }
    return format.split('\n').filter(keep)
      .map(line => Object.entries(v).reduce((acc, [aliases, value]) => aliases.split('|').reduce((out, alias) => out.split(alias).join(value), acc), line))
      .join('\n').replace(/(\n>)+$/, '').trim()
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
  mocks.getBlockByID.mockResolvedValue(null)
  mocks.getBlockKramdown.mockResolvedValue({ kramdown: '' })
  mocks.getChildBlocks.mockResolvedValue([])
  mocks.insertBlock.mockResolvedValue(operations('inserted-1'))
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

    const { syncMark } = await import('@/utils/copy')
    await syncMark(
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

describe('bound document wins over note documents', () => {
  const calloutFormat = '> [!NOTE] 📑 {{title}}\n> [{{chapter}}]({{url}}) {{text}}\n> {{note}}'

  test('appends synced annotations to the bound document instead of creating a note document', async () => {
    mocks.getBook.mockResolvedValue({ title: '读书', author: '', bindDocId: 'doc-9' })
    mocks.getBlockByID.mockResolvedValue({ id: 'doc-9', root_id: 'doc-9' })
    mocks.appendBlock.mockResolvedValue(operations('block-9'))
    setSettings({ annotationSyncOnAdd: true, linkFormat: calloutFormat, noteInsertTarget: 'notebook' })

    const { saveMarkEdit } = await import('@/utils/copy')
    const marks = { updateMark: vi.fn() }
    await saveMarkEdit(
      { id: 'mark-9', type: 'highlight', cfi: 'epubcfi(/6/2)', text: 'hello world' },
      { note: 'bound note' },
      { bookUrl: 'book.epub', bookInfo: { title: 'Book Title' }, marks, showMsg: vi.fn() },
    )

    expect(mocks.appendBlock).toHaveBeenCalledWith('markdown', expect.stringContaining('bound note'), 'doc-9')
    expect(mocks.insertNote).not.toHaveBeenCalled()
    expect(marks.updateMark).toHaveBeenLastCalledWith(expect.objectContaining({ blockId: 'block-9' }), { blockId: 'block-9', blockIds: ['block-9'] })
  })

  test('follows the configured target instead of creating a note document', async () => {
    mocks.getBook.mockResolvedValue(null)
    mocks.insertNote.mockResolvedValue(undefined)
    setSettings({ annotationSyncOnAdd: true, linkFormat: calloutFormat, noteInsertTarget: 'current', noteInsertMode: 'insertBlock' })

    const { saveMarkEdit } = await import('@/utils/copy')
    const marks = { updateMark: vi.fn(async () => true) }
    await saveMarkEdit(
      { id: 'mark-11', type: 'highlight', cfi: 'epubcfi(/6/2)', text: 'hello world' },
      { note: 'cursor note' },
      { bookUrl: 'book.epub', bookInfo: { title: 'Book Title' }, marks, showMsg: vi.fn() },
    )

    // 插入位置/插入方式原样传给 insertNote，不再被改写成「文档下 + 文档底部」。
    expect(mocks.insertNote).toHaveBeenCalledWith(
      expect.stringContaining('cursor note'),
      expect.objectContaining({ noteInsertTarget: 'current', noteInsertMode: 'insertBlock' }),
      'Book Title',
      'book.epub',
      undefined,
    )
    // 光标位置插入拿不到块 id：记下已插入，避免下次重复插入。
    expect(marks.updateMark).toHaveBeenLastCalledWith(expect.anything(), { insertedAt: expect.any(Number) })
  })

  test('does not insert again when the target cannot report a block id', async () => {
    mocks.getBook.mockResolvedValue(null)
    setSettings({ annotationSyncOnAdd: true, linkFormat: calloutFormat, noteInsertTarget: 'current' })

    const { syncMark } = await import('@/utils/copy')
    const marks = { updateMark: vi.fn(async () => true) }
    const blockId = await syncMark(
      { id: 'mark-12', type: 'highlight', cfi: 'epubcfi(/6/2)', text: 'hello', note: 'n', insertedAt: 1 },
      { bookUrl: 'book.epub', bookInfo: { title: 'Book Title' }, marks },
    )

    expect(blockId).toBe('')
    expect(mocks.insertNote).not.toHaveBeenCalled()
  })

  test('falls back to the bound document when the configured target cannot insert', async () => {
    mocks.getBook.mockResolvedValue({ title: '读书', author: '', bindDocId: 'doc-7' })
    mocks.getBlockByID.mockResolvedValue({ id: 'doc-7', root_id: 'doc-7' })
    mocks.insertNote.mockRejectedValue(new Error('未找到可插入的当前编辑器或有效光标位置'))
    mocks.appendBlock.mockResolvedValue(operations('block-7'))
    setSettings({ annotationSyncOnAdd: true, linkFormat: calloutFormat, noteInsertTarget: 'current', noteInsertMode: 'insertBlock' })

    const { saveMarkEdit } = await import('@/utils/copy')
    const marks = { updateMark: vi.fn(async () => true) }
    await saveMarkEdit(
      { id: 'mark-13', type: 'highlight', cfi: 'epubcfi(/6/2)', text: 'hello world' },
      { note: 'fallback note' },
      { bookUrl: 'book.epub', bookInfo: { title: 'Book Title' }, marks, showMsg: vi.fn() },
    )

    // 先按设置插，失败退回绑定文档，笔记不丢。
    expect(mocks.insertNote).toHaveBeenCalledWith(expect.stringContaining('fallback note'), expect.objectContaining({ noteInsertTarget: 'current' }), '读书', 'book.epub', undefined)
    expect(mocks.appendBlock).toHaveBeenCalledWith('markdown', expect.stringContaining('fallback note'), 'doc-7')
    expect(marks.updateMark).toHaveBeenLastCalledWith(expect.objectContaining({ blockId: 'block-7' }), { blockId: 'block-7', blockIds: ['block-7'] })
  })

  test('copies to the clipboard when the target is the clipboard', async () => {
    mocks.getBook.mockResolvedValue({ title: '读书', author: '', bindDocId: 'doc-9' })
    mocks.insertNote.mockResolvedValue(undefined)
    setSettings({ annotationSyncOnAdd: true, linkFormat: calloutFormat, noteInsertTarget: 'clipboard' })

    const { saveMarkEdit } = await import('@/utils/copy')
    const marks = { updateMark: vi.fn(async () => true) }
    await saveMarkEdit(
      { id: 'mark-10', type: 'highlight', cfi: 'epubcfi(/6/2)', text: 'hello world' },
      { note: 'clipboard note' },
      { bookUrl: 'book.epub', bookInfo: { title: 'Book Title' }, marks, showMsg: vi.fn() },
    )

    // 插入位置=剪贴板就复制，不写绑定文档、不建文档。
    expect(mocks.insertNote).toHaveBeenCalledWith(expect.stringContaining('clipboard note'), expect.objectContaining({ noteInsertTarget: 'clipboard' }), '读书', 'book.epub', undefined)
    expect(mocks.appendBlock).not.toHaveBeenCalled()
  })

  test('drops empty emphasis so a blank note does not become a divider', async () => {
    setSettings({ linkFormat: '> [书名 · 章节](链接) 文本\n>\n> **笔记**\n>\n> 图片', noteInsertTarget: 'clipboard' })
    const { buildMarkMarkdown } = await import('@/utils/copy')

    const markdown = await buildMarkMarkdown(
      { id: 'mark-14', cfi: 'epubcfi(/6/2)', text: 'hello world', note: '' },
      { bookUrl: 'book.epub', bookInfo: { title: 'Book Title' }, showMsg: vi.fn() },
    )

    expect(markdown).not.toContain('****')
    expect(markdown).not.toContain('---')
  })
})

describe('annotation block rewrite', () => {
  test('keeps multi-line notes inside the same quote block', async () => {
    setSettings({ linkFormat: '> [!NOTE] 📑 {{title}}\n> [{{chapter}}]({{url}}) {{text}}\n> {{note}}', noteInsertTarget: 'clipboard' })
    const { buildMarkMarkdown } = await import('@/utils/copy')

    const markdown = await buildMarkMarkdown(
      { id: 'mark-1', cfi: 'epubcfi(/6/2)', text: 'hello world', note: '第一条评论\n\n第二条评论' },
      { bookUrl: 'book.epub', bookInfo: { title: 'Book Title' }, showMsg: vi.fn() },
    )

    expect(markdown.split('\n').every(line => line.startsWith('>'))).toBe(true)
    expect(markdown).toContain('> 第二条评论')
  })
  test('rewrites the annotation block itself, so the structure matches a fresh insert', async () => {
    mocks.getBlockKramdown.mockResolvedValue({ kramdown: '> [!NOTE] 📑 Book Title\n> [Chapter 1](link) hello world\n> {: id="block-1"}\n>' })
    setSettings({ linkFormat: '> [!NOTE] 📑 {{title}}\n> [{{chapter}}]({{url}}) {{text}}\n> {{note}}', noteInsertTarget: 'clipboard' })

    const { syncMark } = await import('@/utils/copy')
    await syncMark(
      { id: 'mark-1', blockId: 'block-1', cfi: 'epubcfi(/6/2)', text: 'hello world', note: 'my note' },
      { bookUrl: 'book.epub', bookInfo: { title: 'Book Title' }, showMsg: vi.fn() },
    )

    expect(mocks.updateBlock).toHaveBeenCalledTimes(1)
    expect(mocks.updateBlock).toHaveBeenCalledWith('markdown', expect.stringContaining('my note'), 'block-1')
    expect(mocks.getChildBlocks).not.toHaveBeenCalled()
  })

  test('skips the write when the block already holds the same markdown', async () => {
    setSettings({ linkFormat: '> [!NOTE] 📑 {{title}}\n> [{{chapter}}]({{url}}) {{text}}\n> {{note}}', noteInsertTarget: 'clipboard' })
    const { buildMarkMarkdown, syncMark } = await import('@/utils/copy')
    const mark = { id: 'mark-1', blockId: 'block-1', cfi: 'epubcfi(/6/2)', text: 'hello world', note: 'my note' }
    const ctx = { bookUrl: 'book.epub', bookInfo: { title: 'Book Title' }, showMsg: vi.fn() }
    const md = await buildMarkMarkdown(mark, ctx)
    mocks.getBlockKramdown.mockResolvedValue({ kramdown: `${md}\n> {: id="block-1"}\n>` })

    await syncMark(mark, ctx)

    expect(mocks.updateBlock).not.toHaveBeenCalled()
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

  test('keeps 「书名 · 章节」 exactly as written (chapter falls back to the book name)', async () => {
    expect(await copyBook('> [书名 · 章节](链接) 文本\n>\n> 笔记\n>\n> 图片')).toBe('> [三体 · 三体](sireader://resume?url=book.epub)')
  })

  test('falls back to the book name when the template only has a chapter slot', async () => {
    expect(await copyBook('> [!NOTE] 📑 {{title}}\n> [{{chapter}}]({{url}}) {{text}}')).toBe('> [!NOTE] 📑 三体\n> [三体](sireader://resume?url=book.epub)')
  })

  test('drops template lines whose placeholders are all empty', async () => {
    expect(await copyBook('- [书名 / 章节](链接)\n- 文本')).toBe('- [三体 / 三体](sireader://resume?url=book.epub)')
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
