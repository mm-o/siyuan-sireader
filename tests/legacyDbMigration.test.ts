import { createRequire } from 'node:module'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  putFile,
  readDir,
} from '@/api'
import { migrateLegacyDatabase } from '@/core/legacyDbMigration'
import {
  drainPendingTasks,
  hash,
} from '@/core/storage'
import { usePlugin } from '@/main'

vi.mock('@/main', () => ({ usePlugin: vi.fn() }))
vi.mock('@/core/diagnostics', () => ({ diagnosticLog: vi.fn() }))
vi.mock('siyuan', () => ({ showMessage: vi.fn() }))
vi.mock('@/api', () => ({
  putFile: vi.fn(),
  readDir: vi.fn(async () => []),
  removeFile: vi.fn(),
}))

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js/dist/sql-wasm-inline.js')

const PLUGIN = 'siyuan-sireader'
const PETAL = `/data/storage/petal/${PLUGIN}`
const PUBLIC = `/data/public/${PLUGIN}`
const PUBLIC_URL = `/public/${PLUGIN}`
const PDF_URL = 'pdf://番茄技术_1000'
const EPUB_URL = 'epub://蜡烛图_2000'
const EXTRA_URL = 'pdf://量价关系_透视股票涨跌脉络_14479676'

const files = new Map<string, Uint8Array>()
const decode = (name: string) => JSON.parse(new TextDecoder().decode(files.get(name)!))
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

interface SeedOptions { extraBook?: boolean, extraAnnotation?: boolean }

const seedLegacyDatabase = async (options: SeedOptions = {}) => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE books (url TEXT, title TEXT, author TEXT, cover TEXT, format TEXT, path TEXT, size INTEGER,
      added INTEGER, read INTEGER, finished INTEGER, status TEXT, progress INTEGER, time INTEGER, chapter INTEGER,
      total INTEGER, pos TEXT, rating INTEGER, meta TEXT, bindDocId TEXT, bindDocName TEXT);
    CREATE TABLE annotations (id TEXT, book TEXT, type TEXT, loc TEXT, text TEXT, note TEXT, color TEXT,
      data TEXT, created INTEGER, updated INTEGER, chapter TEXT, block TEXT);
    CREATE TABLE groups (book TEXT, gid TEXT);
    CREATE TABLE tags (book TEXT, tag TEXT);
    CREATE TABLE settings (key TEXT, val TEXT);
  `)
  db.run(`INSERT INTO books VALUES ('${PDF_URL}','番茄技术','未知作者','','pdf',
    '${PETAL}/books/legacy-a.pdf',1000,1780000000000,1780000900000,0,'reading',42,600,7,0,
    '{"chapter":7,"timestamp":1780000900000,"cfi":"#page-7"}',5,'{"publisher":"农业出版社"}','','')`)
  db.run(`INSERT INTO books VALUES ('${EPUB_URL}','蜡烛图','史蒂夫·尼森',
    '${PETAL}/books/legacy-b.jpg','epub','${PETAL}/books/legacy-b.epub',2000,1780000000000,1780000900000,0,'unread',0,0,0,0,'{}',0,'{}','','')`)
  db.run(`INSERT INTO annotations VALUES ('m-1','${PDF_URL}','highlight','7','原文','笔记','yellow',
    '{"format":"pdf","page":7,"rects":[{"x":10,"y":20,"w":100,"h":-10}],"style":"highlight"}',
    1780000100000,1780000100000,'第7页','')`)
  db.run(`INSERT INTO annotations VALUES ('m-2','${EPUB_URL}','highlight','epubcfi(/6/4!/2/1:1)','文字','','blue',
    '{"format":"epub","cfi":"epubcfi(/6/4!/2/1:1)","style":"highlight"}',1780000200000,1780000200000,'第一章','')`)
  db.run(`INSERT INTO annotations VALUES ('d-1','${PDF_URL}','daily_reading','','','','',
    '{"date":"2026-04-23","duration":321}',1780000300000,1780000300000,'','')`)
  db.run(`INSERT INTO annotations VALUES ('d-2','${PDF_URL}','daily_reading','','','','',
    '{"date":"2026-04-23","duration":100}',1780000400000,1780000400000,'','')`)
  db.run(`INSERT INTO groups VALUES ('${PDF_URL}','group_1')`)
  db.run(`INSERT INTO settings VALUES ('book_groups','[{"id":"group_1","name":"番茄","order":0,"type":"folder"}]')`)
  db.run(`INSERT INTO settings VALUES ('reader_settings','{"theme":"auto"}')`)
  if (options.extraBook) {
    db.run(`INSERT INTO books VALUES ('${EXTRA_URL}','量价关系_透视股票涨跌脉络','陈凯','','pdf',
      '${PETAL}/books/legacy-c.pdf',3000,1780000000000,1780000900000,0,'reading',27,900,9,0,'{}',5,'{}','','')`)
    db.run(`INSERT INTO annotations VALUES ('m-3','${EXTRA_URL}','highlight','9','量价同向','','yellow',
      '{"format":"pdf","page":9,"rects":[{"x":1,"y":2,"w":3,"h":-4}],"style":"highlight"}',
      1780000500000,1780000500000,'第9页','')`)
  }
  if (options.extraAnnotation) {
    db.run(`INSERT INTO annotations VALUES ('m-4','${PDF_URL}','highlight','8','新增段落','','green',
      '{"format":"pdf","page":8,"rects":[{"x":5,"y":6,"w":7,"h":-8}],"style":"highlight"}',
      1780000600000,1780000600000,'第8页','')`)
  }
  const bytes = new Uint8Array(db.export())
  db.close()
  return bytes
}

beforeEach(async () => {
  files.clear()
  vi.mocked(usePlugin).mockReturnValue({ name: PLUGIN } as any)
  vi.mocked(putFile).mockImplementation(async (path, isDir, file: any) => {
    if (isDir) return
    files.set(path, new Uint8Array(await file.arrayBuffer()))
  })
  vi.stubGlobal('window', Object.assign(new EventTarget(), { initSqlJs }))
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: any) => {
    const path = JSON.parse(options.body).path
    const bytes = files.get(path)
    if (!bytes) {
      return new Response(JSON.stringify({
        code: 404,
        msg: 'not found',
      }), { status: 404 })
    }
    return new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    })
  }))
  files.set(`${PETAL}/reader.db`, await seedLegacyDatabase())
  files.set(`${PETAL}/books/legacy-a.pdf`, new TextEncoder().encode('%PDF-1.4 a'))
  files.set(`${PETAL}/books/legacy-b.epub`, new TextEncoder().encode('PK epub'))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('legacy reader.db import', () => {
  it('imports books, annotations, groups, settings and daily reading into the current storage', async () => {
    const imported = await migrateLegacyDatabase({ name: PLUGIN })
    expect(imported).toBe(2)

    const shelf = decode(`${PETAL}/bookshelf.json`)
    expect(Object.keys(shelf).sort()).toEqual([EPUB_URL, PDF_URL].sort())
    expect(shelf[PDF_URL]).toMatchObject({
      title: '番茄技术',
      format: 'pdf',
      status: 'reading',
      progress: 42,
      chapter: 7,
      path: '',
      meta: {},
      groups: ['group_1'],
    })

    const pdfRecord = decode(`${PETAL}/records/${hash(PDF_URL)}.json`)
    expect(pdfRecord.version).toBe(1)
    expect(pdfRecord.book.path).toBe(`${PUBLIC_URL}/books/${hash(PDF_URL)}.pdf`)
    expect(pdfRecord.book.meta).toEqual({ publisher: '农业出版社' })
    expect(pdfRecord.progress).toMatchObject({
      pageNumber: 7,
      totalPages: 0,
    })
    expect(pdfRecord.annotations).toHaveLength(1)
    expect(pdfRecord.annotations[0]).toMatchObject({
      id: 'm-1',
      type: 'highlight',
      chapter: '第7页',
    })
    expect(pdfRecord.annotations[0].data).toMatchObject({
      format: 'pdf',
      page: 7,
    })

    const epubRecord = decode(`${PETAL}/records/${hash(EPUB_URL)}.json`)
    expect(epubRecord.book.cover).toBe(`${PUBLIC_URL}/covers/${hash(EPUB_URL)}.jpg`)
    expect(epubRecord.annotations[0].data).toMatchObject({ cfi: 'epubcfi(/6/4!/2/1:1)' })
    expect(epubRecord.progress).toBeUndefined()

    const settings = decode(`${PETAL}/settings.json`)
    expect(settings.book_groups[0].name).toBe('番茄')
    expect(settings.reader_settings).toEqual({ theme: 'auto' })

    // daily_reading 不进 records，按日期汇总成最大时长
    expect(decode(`${PETAL}/daily.json`)).toEqual({ '2026-04-23': { [PDF_URL]: 321 } })
    expect(decode(`${PETAL}/migrated.json`)).toMatchObject({
      done: true,
      books: 2,
      annotations: 2,
    })

    await drainPendingTasks()
    expect(files.has(`${PUBLIC}/books/${hash(PDF_URL)}.pdf`)).toBe(true)
    expect(files.has(`${PUBLIC}/books/${hash(EPUB_URL)}.epub`)).toBe(true)
  })

  it('is idempotent for the same database file', async () => {
    expect(await migrateLegacyDatabase({ name: PLUGIN })).toBe(2)
    const before = decode(`${PETAL}/records/${hash(PDF_URL)}.json`)
    expect(await migrateLegacyDatabase({ name: PLUGIN })).toBe(0)
    const after = decode(`${PETAL}/records/${hash(PDF_URL)}.json`)
    expect(after.annotations).toHaveLength(before.annotations.length)
    expect(decode(`${PETAL}/records/${hash(EPUB_URL)}.json`)).toBeTruthy()
    expect(Object.keys(decode(`${PETAL}/bookshelf.json`))).toHaveLength(2)
  })

  it('merges a newer database into an existing bookshelf without overwriting current data', async () => {
    // 已有书架：一本未被旧库覆盖的书
    files.set(`${PETAL}/bookshelf.json`, encode({
      'epub://other_1': {
        url: 'epub://other_1',
        title: '别的书',
        format: 'epub',
      },
    }))
    // 新库：多一本「量价关系」，并给已有书补一条标注
    files.set(`${PETAL}/reader.db`, await seedLegacyDatabase({
      extraBook: true,
      extraAnnotation: true,
    }))
    files.set(`${PETAL}/books/legacy-c.pdf`, new TextEncoder().encode('%PDF-1.4 c'))

    const imported = await migrateLegacyDatabase({ name: PLUGIN })
    expect(imported).toBe(3)

    const shelf = decode(`${PETAL}/bookshelf.json`)
    expect(Object.keys(shelf).sort()).toEqual([EPUB_URL, EXTRA_URL, PDF_URL, 'epub://other_1'].sort())
    expect(shelf['epub://other_1'].title).toBe('别的书')

    const pdfRecord = decode(`${PETAL}/records/${hash(PDF_URL)}.json`)
    expect(pdfRecord.annotations.map((item: any) => item.id).sort()).toEqual(['m-1', 'm-4'])
    expect(pdfRecord.book.progress).toBe(42)
    expect(decode(`${PETAL}/records/${hash(EXTRA_URL)}.json`).annotations[0].text).toBe('量价同向')

    // 新书要复制正文；已入库的书（记录已存在）不重拷
    await drainPendingTasks()
    expect(files.has(`${PUBLIC}/books/${hash(EXTRA_URL)}.pdf`)).toBe(true)
    const copies = vi.mocked(putFile).mock.calls.map(([path]) => path).filter((path) => typeof path === 'string' && path.startsWith(PUBLIC)).length
    expect(await migrateLegacyDatabase({ name: PLUGIN }, { force: true })).toBe(3)
    await drainPendingTasks()
    expect(vi.mocked(putFile).mock.calls.map(([path]) => path).filter((path) => typeof path === 'string' && path.startsWith(PUBLIC)).length).toBe(copies)
  })

  it('attaches annotations to a shelf entry that was re-imported under a file:// url', async () => {
    // 用户重新导入本地文件后，书架键变成 file:///.../books/legacy-a.pdf，与旧库的 pdf:// 对不上
    const fileUrl = 'file:///E:/library/books/legacy-a.pdf'
    const dataId = 'data-7c1f0b2d'
    files.set(`${PETAL}/bookshelf.json`, encode({
      [fileUrl]: {
        url: fileUrl,
        title: '番茄技术',
        format: 'pdf',
        size: 1000,
        dataId,
      },
    }))
    files.set(`${PETAL}/records/${hash(dataId)}.json`, encode({
      version: 1,
      book: {
        url: fileUrl,
        title: '番茄技术',
      },
      annotations: [],
      updatedAt: 1,
    }))

    expect(await migrateLegacyDatabase({ name: PLUGIN })).toBe(2)

    const shelf = decode(`${PETAL}/bookshelf.json`)
    expect(Object.keys(shelf)).toEqual([fileUrl, EPUB_URL].sort())
    const mergedRecord = decode(`${PETAL}/records/${hash(dataId)}.json`)
    expect(mergedRecord.annotations.map((item: any) => item.id)).toEqual(['m-1'])
    expect(mergedRecord.annotations[0].book).toBe(fileUrl)
    // 已存在的书不新建、也不复制正文
    await drainPendingTasks()
    expect(files.has(`${PUBLIC}/books/${hash(PDF_URL)}.pdf`)).toBe(false)
  })

  it('does nothing without a legacy database', async () => {
    files.delete(`${PETAL}/reader.db`)
    expect(await migrateLegacyDatabase({ name: PLUGIN })).toBe(0)
  })

  it('falls back to the backup directory that old migrations left behind', async () => {
    // v1.1.0 / v1.3.0 导入成功后会删掉 reader.db，但删除前会备份到同级 -backup 目录
    files.delete(`${PETAL}/reader.db`)
    const backup = `/data/storage/petal/${PLUGIN}-backup/1778426572896`
    files.set(`${backup}/reader.db`, await seedLegacyDatabase())
    files.set(`${backup}/manifest.json`, new TextEncoder().encode('{"createdAt":1}'))
    vi.mocked(readDir).mockResolvedValueOnce([
      {
        name: '1778426572896',
        isDir: true,
      },
      {
        name: 'manifest.json',
        isDir: false,
      },
    ] as any)

    expect(await migrateLegacyDatabase({ name: PLUGIN })).toBe(2)
    expect(decode(`${PETAL}/migrated.json`).source).toContain(`${PLUGIN}-backup/1778426572896/reader.db`)
  })
})
