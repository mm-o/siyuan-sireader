/**
 * 阅读器数据库 - 极简架构
 * SQL.js + 文件持久化
 */
import initSqlJs from 'sql.js';

const DB_PATH = '/data/storage/petal/siyuan-sireader/reader.db';

// ==================== 类型 ====================

export interface Book {
  url: string;        // 唯一标识
  title: string;      // 书名
  author: string;     // 作者
  cover: string;      // 封面URL
  format: string;     // 格式(epub/pdf/mobi/azw3/txt)
  path: string;       // 文件路径
  size: number;       // 文件大小(字节)
  added: number;      // 添加时间戳
  read: number;       // 最后阅读时间戳
  finished: number;   // 完成时间戳(0=未完成)
  status: string;     // 状态(unread/reading/finished)
  progress: number;   // 进度(0-100)
  time: number;       // 阅读时长(秒)
  chapter: number;    // 当前章节
  total: number;      // 总章节数
  pos: any;           // 位置(JSON)
  source: any;        // 书源(JSON)
  rating: number;     // 评分(0-5)
  meta: any;          // 元数据(JSON)
  tags: string[];     // 标签数组
  groups: string[];   // 分组数组
  bindDocId?: string; // 绑定文档ID
  bindDocName?: string; // 绑定文档名
  autoSync?: boolean; // 添加时同步
  syncDelete?: boolean; // 删除时同步
}

export type AnnotationType = 'highlight' | 'note' | 'bookmark' | 'vocab' | 'shape' | 'ink';

export interface Annotation {
  id: string;         // 唯一ID
  book: string;       // 书籍URL
  type: AnnotationType; // 类型
  loc: string;        // 位置
  text: string;       // 标注文本
  note: string;       // 笔记内容
  color: string;      // 颜色
  data: any;          // 扩展数据(JSON) - 存储格式特定字段
  created: number;    // 创建时间戳
  updated: number;    // 更新时间戳
  chapter: string;    // 章节名
  block: string;      // 思源块ID
  
  // 便捷访问器（从 data 中读取）
  format?: 'pdf' | 'epub' | 'txt';
  page?: number;      // PDF 页码
  cfi?: string;       // EPUB CFI
  section?: number;   // TXT 章节
  rects?: any[];      // PDF 矩形区域
  style?: string;     // 标注样式
  shapeType?: string; // 形状类型
  filled?: boolean;   // 是否填充
  paths?: any[];      // 墨迹路径
}

// ==================== 数据库 ====================

let sqlJs: any;
const getSql = async () => sqlJs || (sqlJs = await initSqlJs({ locateFile: f => `https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/${f}` }));

export class ReaderDatabase {
  private db: any;
  private ready = false;

  async init() {
    if (this.ready) return;
    this.db = await this.load(await getSql());
    this.ready = true;
  }

  private async load(SQL: any) {
    try {
      const res = await fetch('/api/file/getFile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: DB_PATH }) });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 100) return new SQL.Database(new Uint8Array(buf));
      }
    } catch {}
    const db = new SQL.Database();
    db.exec(`CREATE TABLE books (url TEXT PRIMARY KEY, title TEXT, author TEXT, cover TEXT, format TEXT, path TEXT, size INT, added INT, read INT, finished INT, status TEXT, progress INT, time INT, chapter INT, total INT, pos TEXT, source TEXT, rating INT, meta TEXT, bindDocId TEXT, bindDocName TEXT, autoSync INT, syncDelete INT);CREATE INDEX idx_read ON books(read);CREATE TABLE annotations (id TEXT PRIMARY KEY, book TEXT, type TEXT, loc TEXT, text TEXT, note TEXT, color TEXT, data TEXT, created INT, updated INT, chapter TEXT, block TEXT);CREATE INDEX idx_ann_book ON annotations(book);CREATE TABLE tags (book TEXT, tag TEXT, PRIMARY KEY(book,tag));CREATE INDEX idx_tag ON tags(tag);CREATE TABLE groups (book TEXT, gid TEXT, PRIMARY KEY(book,gid));CREATE INDEX idx_group ON groups(gid);CREATE TABLE settings (key TEXT PRIMARY KEY, val TEXT);`);
    return db;
  }

  private async save() {
    const data = this.db.export(), form = new FormData();
    form.append('path', DB_PATH);
    form.append('file', new File([data], 'reader.db'));
    form.append('isDir', 'false');
    await fetch('/api/file/putFile', { method: 'POST', body: form });
  }

  // ==================== 书籍 ====================

  async getBook(url: string) {
    await this.init();
    const r = this.db.exec('SELECT * FROM books WHERE url=?', [url]);
    if (!r[0]?.values[0]) return null;
    const b = this.toBook(r[0].values[0], r[0].columns);
    const tags = this.db.exec('SELECT tag FROM tags WHERE book=?', [url]);
    const groups = this.db.exec('SELECT gid FROM groups WHERE book=?', [url]);
    b.tags = tags[0] ? tags[0].values.map((v: any) => v[0]) : [];
    b.groups = groups[0] ? groups[0].values.map((v: any) => v[0]) : [];
    return b;
  }

  async getBooks() {
    await this.init();
    const r = this.db.exec('SELECT * FROM books ORDER BY read DESC');
    if (!r[0]) return [];
    return r[0].values.map((v: any) => {
      const b = this.toBook(v, r[0].columns);
      const tags = this.db.exec('SELECT tag FROM tags WHERE book=?', [b.url]);
      const groups = this.db.exec('SELECT gid FROM groups WHERE book=?', [b.url]);
      b.tags = tags[0] ? tags[0].values.map((v: any) => v[0]) : [];
      b.groups = groups[0] ? groups[0].values.map((v: any) => v[0]) : [];
      return b;
    });
  }

  async saveBook(b: any) {
    await this.init();
    const r = this.db.exec('SELECT 1 FROM books WHERE url=?', [b.url]);
    const p = [b.title, b.author||'', b.cover||'', b.format, b.path||'', b.size||0, b.added, b.read, b.finished||0, b.status, b.progress||0, b.time||0, b.chapter||0, b.total||0, JSON.stringify(b.pos||{}), JSON.stringify(b.source||{}), b.rating||0, JSON.stringify(b.meta||{}), b.bindDocId||'', b.bindDocName||'', b.autoSync?1:0, b.syncDelete?1:0];
    r[0]?.values.length ? this.db.run('UPDATE books SET title=?,author=?,cover=?,format=?,path=?,size=?,added=?,read=?,finished=?,status=?,progress=?,time=?,chapter=?,total=?,pos=?,source=?,rating=?,meta=?,bindDocId=?,bindDocName=?,autoSync=?,syncDelete=? WHERE url=?', [...p, b.url]) : this.db.run('INSERT INTO books VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [b.url, ...p]);
    this.db.run('DELETE FROM tags WHERE book=?', [b.url]);
    (b.tags||[]).forEach((t: string) => this.db.run('INSERT INTO tags VALUES(?,?)', [b.url, t]));
    this.db.run('DELETE FROM groups WHERE book=?', [b.url]);
    (b.groups||[]).forEach((g: string) => this.db.run('INSERT INTO groups VALUES(?,?)', [b.url, g]));
    await this.save();
  }

  async deleteBook(url: string) { 
    await this.init(); 
    this.db.run('DELETE FROM books WHERE url=?', [url]); 
    this.db.run('DELETE FROM annotations WHERE book=?', [url]);
    this.db.run('DELETE FROM tags WHERE book=?', [url]);
    this.db.run('DELETE FROM groups WHERE book=?', [url]);
    await this.save(); 
  }

  async searchBooks(q: string) {
    await this.init();
    const r = this.db.exec('SELECT * FROM books WHERE title LIKE ? OR author LIKE ? ORDER BY read DESC', [`%${q}%`, `%${q}%`]);
    if (!r[0]) return [];
    return r[0].values.map((v: any) => {
      const b = this.toBook(v, r[0].columns);
      const tags = this.db.exec('SELECT tag FROM tags WHERE book=?', [b.url]);
      const groups = this.db.exec('SELECT gid FROM groups WHERE book=?', [b.url]);
      b.tags = tags[0] ? tags[0].values.map((v: any) => v[0]) : [];
      b.groups = groups[0] ? groups[0].values.map((v: any) => v[0]) : [];
      return b;
    });
  }

  // ==================== 标注 ====================

  async getAnnotations(book: string) {
    await this.init();
    const r = this.db.exec('SELECT * FROM annotations WHERE book=? ORDER BY created', [book]);
    return r[0] ? r[0].values.map((v: any) => this.toAnn(v, r[0].columns)) : [];
  }

  async saveAnnotation(a: any) {
    await this.init();
    const book = a.book;
    if (!book) throw new Error('book required');
    const r = this.db.exec('SELECT 1 FROM annotations WHERE id=?', [a.id]);
    const now = Date.now();
    const p = [book, a.type, a.loc||'', a.text||'', a.note||'', a.color, JSON.stringify(a.data||{}), a.created||now, now, a.chapter||'', a.block||''];
    r[0]?.values.length ? this.db.run('UPDATE annotations SET book=?,type=?,loc=?,text=?,note=?,color=?,data=?,created=?,updated=?,chapter=?,block=? WHERE id=?', [...p, a.id]) : this.db.run('INSERT INTO annotations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [a.id, ...p]);
    await this.save();
  }

  async deleteAnnotation(id: string) { await this.init(); this.db.run('DELETE FROM annotations WHERE id=?', [id]); await this.save(); }

  // ==================== 设置 ====================

  async getSetting<T = any>(key: string): Promise<T | null> {
    await this.init();
    const r = this.db.exec('SELECT val FROM settings WHERE key=?', [key]);
    if (!r[0]?.values[0]?.[0]) return null;
    try { return JSON.parse(r[0].values[0][0]); } catch { return r[0].values[0][0]; }
  }

  async saveSetting(key: string, val: any) {
    await this.init();
    const json = typeof val === 'string' ? val : JSON.stringify(val);
    const r = this.db.exec('SELECT 1 FROM settings WHERE key=?', [key]);
    r[0]?.values.length ? this.db.run('UPDATE settings SET val=? WHERE key=?', [json, key]) : this.db.run('INSERT INTO settings VALUES(?,?)', [key, json]);
    await this.save();
  }

  async batchSaveSettings(updates: Record<string, any>) {
    await this.init();
    for (const [key, val] of Object.entries(updates)) {
      const json = typeof val === 'string' ? val : JSON.stringify(val);
      const r = this.db.exec('SELECT 1 FROM settings WHERE key=?', [key]);
      r[0]?.values.length ? this.db.run('UPDATE settings SET val=? WHERE key=?', [json, key]) : this.db.run('INSERT INTO settings VALUES(?,?)', [key, json]);
    }
    await this.save();
  }

  async getAllSettings() {
    await this.init();
    const r = this.db.exec('SELECT * FROM settings');
    if (!r[0]) return {};
    const s: Record<string, any> = {};
    r[0].values.forEach((v: any) => { try { s[v[0]] = JSON.parse(v[1]); } catch { s[v[0]] = v[1]; } });
    return s;
  }

  // ==================== 分组/标签 ====================

  async getGroups() { return await this.getSetting('book_groups') || []; }
  async saveGroups(g: any[]) { await this.saveSetting('book_groups', g); }
  async getBooksByGroup(gid: string) {
    await this.init();
    const r = this.db.exec('SELECT b.* FROM books b JOIN groups g ON b.url=g.book WHERE g.gid=?', [gid]);
    if (!r[0]) return [];
    return r[0].values.map((v: any) => {
      const b = this.toBook(v, r[0].columns);
      const tags = this.db.exec('SELECT tag FROM tags WHERE book=?', [b.url]);
      const groups = this.db.exec('SELECT gid FROM groups WHERE book=?', [b.url]);
      b.tags = tags[0] ? tags[0].values.map((v: any) => v[0]) : [];
      b.groups = groups[0] ? groups[0].values.map((v: any) => v[0]) : [];
      return b;
    });
  }
  async getAllTags() {
    await this.init();
    const r = this.db.exec('SELECT tag, COUNT(*) as cnt FROM tags GROUP BY tag ORDER BY cnt DESC');
    return r[0] ? r[0].values.map((v: any) => ({ tag: v[0], count: v[1] })) : [];
  }

  // ==================== 高性能查询 ====================

  async filterBooks(opt: {
    status?: string[];
    rating?: number;
    formats?: string[];
    tags?: string[];
    hasUpdate?: boolean;
    sortBy?: string;
    reverse?: boolean;
  } = {}) {
    await this.init();
    let sql = 'SELECT DISTINCT b.* FROM books b';
    const params: any[] = [];
    const where: string[] = [];

    if (opt.tags?.length) {
      sql += ' JOIN tags t ON b.url = t.book';
      where.push(`t.tag IN (${opt.tags.map(() => '?').join(',')})`);
      params.push(...opt.tags);
    }
    if (opt.status?.length) {
      where.push(`b.status IN (${opt.status.map(() => '?').join(',')})`);
      params.push(...opt.status);
    }
    if (opt.rating) {
      where.push('b.rating >= ?');
      params.push(opt.rating);
    }
    if (opt.formats?.length) {
      where.push(`b.format IN (${opt.formats.map(() => '?').join(',')})`);
      params.push(...opt.formats);
    }
    if (opt.hasUpdate) {
      where.push("json_extract(b.source, '$.updateCount') > 0");
    }

    if (where.length) sql += ' WHERE ' + where.join(' AND ');

    const sortMap: Record<string, string> = {
      time: 'b.read', added: 'b.added', progress: 'b.progress',
      rating: 'b.rating', readTime: 'b.time', name: 'b.title',
      author: 'b.author', update: "json_extract(b.source, '$.updateCount')"
    };
    const col = sortMap[opt.sortBy || 'time'] || 'b.read';
    const dir = opt.reverse ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${col} ${dir}`;

    const r = this.db.exec(sql, params);
    if (!r[0]) return [];
    return r[0].values.map((v: any) => {
      const b = this.toBook(v, r[0].columns);
      const tags = this.db.exec('SELECT tag FROM tags WHERE book=?', [b.url]);
      const groups = this.db.exec('SELECT gid FROM groups WHERE book=?', [b.url]);
      b.tags = tags[0] ? tags[0].values.map((v: any) => v[0]) : [];
      b.groups = groups[0] ? groups[0].values.map((v: any) => v[0]) : [];
      return b;
    });
  }

  async getStats() {
    await this.init();
    const statusR = this.db.exec('SELECT status, COUNT(*) as cnt FROM books GROUP BY status');
    const byStatus: Record<string, number> = { unread: 0, reading: 0, finished: 0 };
    statusR[0]?.values.forEach((v: any) => { byStatus[v[0]] = v[1]; });

    const formatR = this.db.exec('SELECT format, COUNT(*) as cnt FROM books GROUP BY format');
    const byFormat: Record<string, number> = { epub: 0, pdf: 0, mobi: 0, azw3: 0, txt: 0 };
    formatR[0]?.values.forEach((v: any) => { byFormat[v[0]] = v[1]; });

    const updateR = this.db.exec("SELECT COUNT(*) FROM books WHERE json_extract(source, '$.updateCount') > 0");
    const withUpdate = updateR[0]?.values[0]?.[0] || 0;

    return { byStatus, byFormat, withUpdate };
  }

  async getGroupCount(gid: string) {
    await this.init();
    const r = this.db.exec('SELECT COUNT(*) FROM groups WHERE gid = ?', [gid]);
    return r[0]?.values[0]?.[0] || 0;
  }

  async deleteGroup(gid: string) {
    await this.init();
    this.db.run('DELETE FROM groups WHERE gid = ?', [gid]);
    const configs = await this.getGroups();
    await this.saveGroups(configs.filter(g => g.id !== gid));
    await this.save();
  }

  async getGroupPreviewBooks(gid: string, limit = 4) {
    await this.init();
    const r = this.db.exec('SELECT b.* FROM books b JOIN groups g ON b.url=g.book WHERE g.gid=? ORDER BY b.read DESC LIMIT ?', [gid, limit]);
    if (!r[0]) return [];
    return r[0].values.map((v: any) => {
      const b = this.toBook(v, r[0].columns);
      const tags = this.db.exec('SELECT tag FROM tags WHERE book=?', [b.url]);
      const groups = this.db.exec('SELECT gid FROM groups WHERE book=?', [b.url]);
      b.tags = tags[0] ? tags[0].values.map((v: any) => v[0]) : [];
      b.groups = groups[0] ? groups[0].values.map((v: any) => v[0]) : [];
      return b;
    });
  }

  // ==================== 辅助 ====================

  private toBook(row: any, cols: string[]) {
    const get = (n: string) => row[cols.indexOf(n)];
    const parse = (v: any) => { try { return JSON.parse(v || '{}'); } catch { return {}; } };
    return { url: get('url'), title: get('title'), author: get('author'), cover: get('cover'), format: get('format'), path: get('path'), size: get('size'), added: get('added'), read: get('read'), finished: get('finished'), status: get('status'), progress: get('progress'), time: get('time'), chapter: get('chapter'), total: get('total'), pos: parse(get('pos')), source: parse(get('source')), rating: get('rating'), meta: parse(get('meta')), tags: [], groups: [], bindDocId: get('bindDocId')||'', bindDocName: get('bindDocName')||'', autoSync: !!get('autoSync'), syncDelete: !!get('syncDelete') };
  }

  private toAnn(row: any, cols: string[]) {
    const get = (n: string) => row[cols.indexOf(n)];
    const parse = (v: any) => { try { return JSON.parse(v || '{}'); } catch { return {}; } };
    return { id: get('id'), book: get('book'), type: get('type'), loc: get('loc'), text: get('text'), note: get('note'), color: get('color'), data: parse(get('data')), created: get('created'), updated: get('updated'), chapter: get('chapter'), block: get('block') };
  }
}

// ==================== 单例 ====================

let instance: ReaderDatabase | null = null;
export const getDatabase = async () => { if (!instance) { instance = new ReaderDatabase(); await instance.init(); } return instance; };
export const initDatabase = getDatabase;
