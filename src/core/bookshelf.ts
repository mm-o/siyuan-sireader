/**
 * 书架管理 - 极简架构
 */
import { getDatabase, type Book } from './database';
export { bookshelfSortValue, compareSortValues as compareBookshelfValues } from './database';
import { loadBookFile, materializeNativeFile, normalizeBookTitle, normalizeNativePath, normalizeSiyuanCloudUrl, readDirEntries, removeManagedFile, saveBookFile, saveCoverFile, saveOptionalCover, touchBookRecordFiles, SIYUAN_CLOUD_BASE, toFileUrl } from './storage';
import { diagnosticLog } from './diagnostics';
import { renderPdfFirstPage } from '@/utils/embedPdfActions';

export type BookFormat = 'pdf' | 'epub' | 'mobi' | 'azw3' | 'txt';
export type BookStatus = 'unread' | 'reading' | 'finished';
export interface GroupConfig { id: string; name: string; icon?: string; color?: string; cover?: string; coverMode?: 'default' | 'books' | 'custom'; parentId?: string; order: number; type: 'folder' | 'smart'; rules?: { tags?: string[]; format?: BookFormat[]; status?: BookStatus[]; rating?: number } }
export type SortType = 'time' | 'name' | 'author' | 'update' | 'progress' | 'rating' | 'readTime' | 'added';
export interface FilterOptions { query?: string; status?: BookStatus[]; rating?: number; formats?: BookFormat[]; tags?: string[]; groups?: string[]; sortBy?: SortType; reverse?: boolean }
export interface BookStats { total: number; byStatus: Record<BookStatus, number>; byFormat: Record<string, number>; byRating: Record<number, number>; annotationCount: number }
export interface BookshelfStateOptions { currentGroup?: string | null; keyword?: string; sortBy?: SortType; reverse?: boolean; status?: BookStatus[]; rating?: number; formats?: BookFormat[]; tags?: string[] }
export interface GroupDisplayState { groups: GroupConfig[]; counts: Record<string, number> }
export type BookshelfViewMode = 'grid' | 'list' | 'compact'
export type BookshelfModalMode = 'detail' | 'edit' | 'manage' | 'organize' | null
export interface BookshelfOption { value: string | number; label: string; count?: number }
export interface BookshelfSection { key: string; label: string; options: BookshelfOption[] }
export interface BookshelfDetailField { label: string; value: string; mono?: boolean }
export interface BookshelfEditForm { title: string; author: string; tags: string; rating: number; status: BookStatus; cover: string; groups: string[]; bindDocId: string; bindDocName: string }
export interface BookArrayPatch { add?: string[]; remove?: string[]; set?: string[] }
export interface BookBulkPatch { tags?: BookArrayPatch; groups?: BookArrayPatch; status?: BookStatus; rating?: number; progress?: number }

// ===== 常量 =====
export const SORTS = [['time','最近阅读'],['added','最近添加'],['progress','阅读进度'],['rating','评分'],['readTime','阅读时长'],['name','书名'],['author','作者'],['update','最近更新']] as const;
export const STATUS_OPTIONS = [['unread','未读'],['reading','在读'],['finished','读完']] as const;
export const STATUS_MAP: Record<BookStatus,string> = {unread:'未读',reading:'在读',finished:'读完'};
export const RATING_OPTIONS = [[0,'☆☆☆☆☆ 全部'],[5,'★★★★★ 仅5星'],[4,'★★★★☆ 4星及以上'],[3,'★★★☆☆ 3星及以上']] as const;
export const FORMAT_OPTIONS: BookFormat[] = ['epub','pdf','mobi','azw3','txt'];
export const VIEW_MODES = [{ value: 'grid', label: '网格' }, { value: 'list', label: '列表' }, { value: 'compact', label: '紧凑' }] as const;
export const VIEW_MODE_ICONS: Record<BookshelfViewMode, string> = { grid: '#lucide-panels-top-left', list: '#lucide-list-restart', compact: '#lucide-book-text' };
export const MODAL_TITLES: Record<Exclude<BookshelfModalMode, null>, string> = { detail: '书籍详情', edit: '编辑书籍', manage: '添加内容', organize: '整理书架' };
export const STAR_OPTIONS = [1, 2, 3, 4, 5] as const;
export const STATUS_SELECT_OPTIONS = STATUS_OPTIONS.map(([value, label]) => ({ value, label }));
export const FORMAT_SELECT_OPTIONS = FORMAT_OPTIONS.map(value => ({ value, label: value.toUpperCase() }));
export const createDefaultGroupRules = () => ({ tags: [] as string[], format: [] as BookFormat[], status: [] as BookStatus[], rating: 0 });
const completionPlaceholder = new Set(['', '未知', '未知作者', '-'])
const completionValue = (value: unknown) => value !== undefined && value !== null && (typeof value !== 'string' || !completionPlaceholder.has(value.trim()))
export const mergeBookCompletion = (current: any = {}, candidate: any = {}, options: { coverMissing?: boolean } = {}) => {
  const updates: any = {}
  for (const key of ['title', 'author', 'cover']) if ((!completionValue(current[key]) || (key === 'cover' && options.coverMissing)) && completionValue(candidate[key])) updates[key] = candidate[key]
  const currentMeta = current.meta || {}, meta: any = {}
  for (const [key, value] of Object.entries(candidate.meta || {})) if (!completionValue(currentMeta[key]) && completionValue(value)) meta[key] = value
  if (Object.keys(meta).length) updates.meta = { ...currentMeta, ...meta }
  return updates
}
export const createDefaultEditForm = (): BookshelfEditForm => ({ title: '', author: '', tags: '', rating: 0, status: 'unread', cover: '', groups: [], bindDocId: '', bindDocName: '' });
export const canDragBook = (enabled: boolean, itemType: string) => enabled && itemType === 'book'
export const filterGroupsByKeyword = (groups: GroupConfig[], keyword = '') => {
  const query = keyword.trim().toLowerCase();
  return groups.filter(group => group.type === 'folder' && (!query || group.name.toLowerCase().includes(query)));
};
export const bookInGroup = (book: Pick<any, 'tags' | 'format' | 'status' | 'rating' | 'groups'>, group: GroupConfig) => {
  if (group.type === 'folder') return book.groups?.includes(group.id)
  const { tags = [], format = [], status = [], rating = 0 } = group.rules || {}
  return (!tags.length || tags.some(t => book.tags?.includes(t))) &&
    (!format.length || format.includes(book.format)) &&
    (!status.length || status.includes(book.status)) &&
    (!rating || (book.rating || 0) >= rating)
}
export const getNextViewMode = (mode: BookshelfViewMode): BookshelfViewMode => {
  const values = VIEW_MODES.map(({ value }) => value);
  return values[(values.indexOf(mode) + 1) % values.length];
};
export const buildFilterSections = (stats: { byStatus: Record<BookStatus, number>; byFormat: Record<string, number> }, allTags: Array<{ tag: string; count: number }>): BookshelfSection[] => [
  { key: 'status', label: '状态', options: STATUS_OPTIONS.map(([value, label]) => ({ value, label, count: stats.byStatus[value] })) },
  { key: 'rating', label: '评分', options: RATING_OPTIONS.map(([value, label]) => ({ value, label, count: 0 })) },
  { key: 'format', label: '格式', options: FORMAT_OPTIONS.map(value => ({ value, label: value.toUpperCase(), count: stats.byFormat[value] })) },
  { key: 'tags', label: '标签', options: allTags.slice(0, 20).map(({ tag, count }) => ({ value: tag, label: tag, count })) },
];
export const buildEditFields = () => [{ key: 'title', label: '书名', type: 'text', placeholder: '书名' }, { key: 'author', label: '作者', type: 'text', placeholder: '作者' }, { key: 'cover', label: '封面', type: 'text', placeholder: '封面图片 URL' }, { key: 'rating', label: '评分', type: 'select', options: [{ value: 0, label: '无评分' }, ...STAR_OPTIONS.map(value => ({ value, label: `${'★'.repeat(value)} ${value}星` }))] }, { key: 'status', label: '状态', type: 'select', options: STATUS_SELECT_OPTIONS }, { key: 'tags', label: '标签', type: 'tags', placeholder: '用逗号分隔' }, { key: 'groups', label: '分组', type: 'groups' }, { key: 'bind', label: '绑定文档', type: 'bind' }];
export const buildGroupFields = (group: GroupConfig | null, allTags: Array<{ tag: string; count: number }>) => !group ? [] : [
  { key: 'name', label: '名称', type: 'text', placeholder: '分组名称' },
  { key: 'coverMode', label: '封面样式', type: 'chips', options: [{ value: 'default', label: '默认·分组图标' }, { value: 'books', label: '书籍内·四宫格' }, { value: 'custom', label: '自定义·整张封面' }], single: true },
  { key: 'cover', label: '封面', type: 'text', placeholder: '封面图片 URL' },
  ...(group.type === 'smart' ? [
    { key: 'tags', label: '标签', type: 'chips', options: allTags.slice(0, 10).map(({ tag }) => ({ value: tag, label: tag })) },
    { key: 'format', label: '格式', type: 'chips', options: FORMAT_SELECT_OPTIONS },
    { key: 'status', label: '状态', type: 'chips', options: STATUS_SELECT_OPTIONS },
    { key: 'rating', label: '评分', type: 'chips', options: [{ value: 0, label: '全部' }, ...STAR_OPTIONS.map(value => ({ value, label: `≥${value}星` }))], single: true },
  ] : []),
];
const fmt = {
  bytes: (n: number) => { const k = 1024, i = n < k ? 0 : Math.floor(Math.log(n) / Math.log(k)); return `${(n / Math.pow(k, i)).toFixed(1)} ${['B', 'KB', 'MB', 'GB'][i]}`; },
  date: (ts: number) => ts ? new Date(ts).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-',
  time: (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}小时${m}分钟` : `${m}分钟`; },
};
export const buildBookMetadata = (meta: any = {}) => ({ publisher: meta.publisher, publishDate: meta.published || meta.publishDate, language: meta.language, isbn: meta.identifier || meta.isbn, description: meta.intro || meta.description, series: meta.series, sourceName: meta.sourceName, fileSize: meta.fileSize })
export interface SiyuanCloudNode { name: string; path: string; parent: string; is_dir: boolean; size?: number }
const BOOK_RE = /\.(epub|pdf|mobi|azw3|azw|fb2|cbz|txt)$/i
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('')
const fallbackDigest = (value: BufferSource) => {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  let a = 0x811c9dc5, b = 0x9e3779b9, c = bytes.length >>> 0, d = Math.floor(bytes.length / 0x100000000) >>> 0
  for (let i = 0; i < bytes.length; i++) {
    a = Math.imul(a ^ bytes[i], 0x01000193)
    b = Math.imul(b ^ (bytes[i] + i), 0x85ebca6b)
  }
  return [a, b, c, d].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('')
}
const digest = async (value: BufferSource) => globalThis.crypto?.subtle ? hex(await crypto.subtle.digest('SHA-256', value)) : fallbackDigest(value)
export const dataIdFromFingerprint = async (fingerprint: string) => `data-${await digest(new TextEncoder().encode(fingerprint))}`
export const fileFingerprint = async (file: File) => {
  const path = normalizeNativePath((file as any)?.path || (file as any)?._path || '')
  return path ? `file-ref:${path}:${file.size || 0}:${Math.floor(file.lastModified || 0)}` : `file-sha256:${await digest(await file.arrayBuffer())}`
}
export const urlFingerprint = (url: string, extra = '') => `url:${url}${extra ? `:${extra}` : ''}`
export const normalizeCloudPath = (path = '/') => `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
export const siyuanCloudUrl = (path: string) => `${SIYUAN_CLOUD_BASE}/p${decodeURI(encodeURI(normalizeCloudPath(path))).replace(/#/g, '%23').replace(/\?/g, '%3F')}`
export const isCloudBookPath = (path: string) => BOOK_RE.test(path)
const cloudApi = async (api: string, options: RequestInit, strict = false) => {
  const response = await fetch(`${SIYUAN_CLOUD_BASE}/api/fs/${api}`, options)
  if (strict && !response.ok) throw new Error(`SiYuan Cloud HTTP ${response.status}`)
  const result = await response.json()
  if (result?.code === 0 || result?.code === 200) return result.data || {}
  if (strict) throw new Error(result?.message || 'SiYuan Cloud request failed')
  return {}
}
const cloudJson = (body: object, token = ''): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Siyuan-Cloud-Authorization': token } : {}) },
  body: JSON.stringify(body),
})
const mapCloudNodes = (items: any[], parent = '/') => items.map(x => {
  const p = normalizeCloudPath(x.parent || parent), path = normalizeCloudPath(x.path || `${p}/${x.name}`)
  return { name: x.name, path, parent: p, size: x.size || 0, is_dir: !!(x.is_dir ?? x.isDir) }
}).filter(x => x.is_dir || isCloudBookPath(x.name))
const cloudParents = (path: string) => normalizeCloudPath(path).split('/').filter(Boolean).map((_, i, a) => ({ name: a[i], path: `/${a.slice(0, i + 1).join('/')}`, parent: i ? `/${a.slice(0, i).join('/')}` : '/', is_dir: true }))
export const mergeCloudNodes = (current: SiyuanCloudNode[], items: any[], parent?: string) => {
  const p = parent && normalizeCloudPath(parent), next = mapCloudNodes(items, p || '/')
  return Array.from(new Map([...(p ? current.filter(x => x.parent !== p) : []), ...(p ? cloudParents(p) : []), ...next.flatMap(x => [...cloudParents(x.parent), x])].map(x => [x.path, x])).values())
}
export const listCloudNodes = async (path = '/') => (await cloudApi('list', cloudJson({ path: normalizeCloudPath(path), per_page: 0 }))).content || []
export const searchCloudNodes = async (keywords: string) => (await cloudApi('search', cloudJson({ parent: '/', keywords, per_page: 50 }))).content || []
export const listCloudDownloadFolders = async (path: string, token: string) => {
  const result = await cloudApi('list', cloudJson({ path, per_page: 0 }, token), true)
  return {
    folders: mapCloudNodes(result.content || [], path).filter(node => node.is_dir),
    writable: path !== '/' && !!result.provider
      && !['siyuan-storage', 'siyuan-workspace'].includes(result.provider) && result.write !== false,
  }
}
export const uploadCloudBook = async (folder: string, file: File, token: string) => {
  const path = normalizeCloudPath(`${folder}/${file.name.replace(/[\\/]/g, '_')}`)
  await cloudApi('put', {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'File-Path': encodeURIComponent(path),
      'Overwrite': 'false',
      ...(token ? { 'X-Siyuan-Cloud-Authorization': token } : {}),
    },
    body: file,
  }, true)
  return siyuanCloudUrl(path)
}
export const cloudNodesToItems = (nodes: SiyuanCloudNode[]) => nodes.map((r, i) => r.is_dir
  ? { type: 'group' as const, data: { id: r.path, name: r.name, parentId: r.parent === '/' ? '' : r.parent, order: i, type: 'folder' as const } }
  : { type: 'book' as const, data: { url: r.path, title: r.name.replace(/\.[^.]+$/, ''), author: r.size ? `${(r.size / 1024 / 1024).toFixed(1)} MB` : '-', cover: '', format: (r.name.split('.').pop()?.toLowerCase() === 'azw' ? 'azw3' : r.name.split('.').pop()?.toLowerCase()) as BookFormat, path: r.path, size: r.size || 0, status: 'unread' as BookStatus, progress: 0, time: 0, chapter: 0, total: 0, pos: {}, rating: 0, meta: {}, tags: [], groups: r.parent === '/' ? [] : [r.parent], read: 0, added: 0, finished: 0 } }
)
export const normalizeBookList = (items: any[] = []) => Array.from(new Set(items.map(item => String(item || '').trim()).filter(Boolean)))
const safeDecode = (url = '') => { try { return decodeURI(url) } catch { return url } }
const safeEncode = (url = '') => { try { return encodeURI(safeDecode(url)) } catch { return url } }
export const bookUrlCandidates = (url = '') => Array.from(new Set([url, normalizeSiyuanCloudUrl(url), safeDecode(url), safeEncode(url)].filter(Boolean)))
export const sameBookUrl = (a = '', b = '') => { const set = new Set(bookUrlCandidates(b)); return bookUrlCandidates(a).some(url => set.has(url)) }
// 旧链接 `pdf://标题_大小`（书被重新导入成 file:// 后书架键对不上）按「标题+大小」归一化匹配回现有书目。
const titleKey = (title = '') => normalizeBookTitle(String(title || '')).toLowerCase().replace(/[\s_\-—–·.]+/g, '')
export const matchLegacyBook = (url: string, books: any[] = []) => {
  const rest = url.match(/^(?:epub|pdf|mobi|azw3|azw|txt|fb2|cbz):\/\/(.+)$/i)?.[1]?.replace(/_(?:highlight|note|bookmark|vocab|shape|ink)-[^_&]+$/i, '')
  if (!rest) return null
  const size = Number(rest.match(/_(\d+)$/)?.[1] || 0)
  const key = titleKey(rest.replace(/_(\d+)$/, ''))
  if (!key) return null
  const hit = books.filter((book) => {
    const bookKey = titleKey(book?.title)
    return bookKey && (bookKey === key || bookKey.includes(key) || key.includes(bookKey))
  })
  return (hit.find(book => size > 0 && Number(book?.size) === size) || hit[0] || null) as any
}
export const applyBookArrayPatch = (current: string[] = [], patch?: BookArrayPatch) => {
  if (!patch) return current
  const base = patch.set ? normalizeBookList(patch.set) : normalizeBookList(current)
  const remove = new Set(normalizeBookList(patch.remove))
  return normalizeBookList([...base.filter(item => !remove.has(item)), ...normalizeBookList(patch.add)])
}
export const hasBookBulkPatch = (patch?: BookBulkPatch) => !!patch && !!(patch.tags || patch.groups || patch.status || patch.rating !== undefined || patch.progress !== undefined)
export const buildDetailFields = (book: any, groups: GroupConfig[]): BookshelfDetailField[] => {
  const m = book?.meta || {};
  return !book ? [] : [['书名', book.title], ['作者', book.author], ['格式', book.format.toUpperCase()], ['进度', `${book.progress || 0}%`], ['状态', STATUS_MAP[book.status]], ['评分', book.rating ? '★'.repeat(book.rating) : '未评分'], ['章节', `${book.chapter || 0}/${book.total || '-'}`], ['时长', fmt.time(book.time || 0)], ['大小', fmt.bytes(book.size || 0)], ['添加', fmt.date(book.added)], ['最后阅读', fmt.date(book.read)], book.finished && ['完成', fmt.date(book.finished)], book.tags.length && ['标签', book.tags.join(', ')], book.groups.length && ['分组', groups.filter(g => book.groups.includes(g.id)).map(g => g.name).join(', ')], book.bindDocName && ['绑定文档', book.bindDocName], m.publisher && ['出版社', m.publisher], m.publishDate && ['出版日期', m.publishDate], m.isbn && ['ISBN', m.isbn], m.series && ['系列', m.series], m.description && ['简介', m.description], book.path && ['路径', book.path, true]].filter(Boolean).map(([label, value, mono]) => ({ label, value, mono })) as BookshelfDetailField[];
};

export class BookshelfManager {
  private ready = false;
  // Managed covers are written to deterministic paths. Bump this token when a
  // deleted cover is recreated so the existing <img> cannot reuse a cached 404.
  private coverRevision = Date.now()
  private db = async () => { await this.init(); return getDatabase(); };
  private async useDb<T>(task: (db: Awaited<ReturnType<typeof getDatabase>>) => Promise<T>) { return task(await this.db()); }
  private saveBookData = async (book: any, notify = true) => {
    diagnosticLog('info', 'bookshelf.save.start', { format: book?.format, size: Number(book?.size || 0), hasPath: !!book?.path, hasDataId: !!book?.dataId });
    try {
      await this.useDb(db => db.saveBook(book));
      diagnosticLog('info', 'bookshelf.save.done', { format: book?.format });
      if (notify) this.notify();
    } catch (error) { diagnosticLog('error', 'bookshelf.save.failed', { format: book?.format, error }); throw error }
  };
  private withBook = async <T>(url: string, task: (book: any) => Promise<T>, fallback: T) => {
    const book = await this.getBook(url);
    return book ? task(book) : fallback;
  };
  private mutateBook = async (url: string, mutate: (book: any) => any, fallback = false, notify = true) =>
    this.withBook(url, async book => {
      const patch = await mutate(book);
      if (!patch || patch === book) return false;
      await this.useDb(db => db.patchBook(url, patch));
      if (notify) this.notify();
      return true;
    }, fallback);
  
  private prepareLocalBook = async (file: File, parsedMeta?: any) => { const format = this.getFormat(file.name), name = file.name.replace(/\.[^.]+$/, ''); const source = materializeNativeFile(file); const meta = parsedMeta || await this.extractMeta(source, format, name), title = normalizeBookTitle(meta.title || name) || name; return { file: source, format, name, meta, title } }
  private downloadCover = async (coverUrl: string | undefined, url: string) => {
    if (!coverUrl) return '';
    try {
      const { httpSourceManager } = await import('@/utils/HttpSources');
      const blob = await httpSourceManager.downloadCover(coverUrl);
      return blob ? await saveCoverFile(blob, url) : '';
    } catch { return ''; }
  };
  private buildBookPayload = (info: any) => ({
    url: info.url,
    title: normalizeBookTitle(info.title || '未知') || '未知',
    author: info.author || '未知',
    cover: info.cover || '',
    format: info.format || 'epub',
    path: info.path || '',
    size: info.size || 0,
    added: info.added,
    read: info.read,
    finished: info.finished,
    status: info.status || 'unread',
    progress: info.progress || 0,
    time: info.time || 0,
    chapter: info.chapter || 0,
    total: info.total || 0,
    pos: info.location || info.pos || {},
    rating: info.rating || 0,
    meta: info.metadata || info.meta || {},
    tags: info.tags || [],
    groups: info.groups || [],
    bindDocId: info.bindDocId || '',
    bindDocName: info.bindDocName || '',
    dataId: info.dataId || '',
    fingerprint: info.fingerprint || '',
  });
  private cleanPath = (path = '') => path.split(/[?#]/)[0]
  private fileBaseName = (path: string, fallback = '未知书籍') => {
    const name = this.cleanPath(path).split(/[/\\]/).pop() || fallback
    try { path = decodeURIComponent(name) } catch { path = name }
    return path.replace(/\.[^.]+$/, '') || fallback
  }
  private resolvedTitle = (meta: any, name: string) => normalizeBookTitle(meta.title || name) || name
  private savePreparedBook = async ({ url, path, format, size, meta, name, cover = '', dataId = '', fingerprint = '' }: { url: string; path: string; format: BookFormat; size?: number; meta: any; name: string; cover?: string; dataId?: string; fingerprint?: string }) => {
    await this.addBook({ url, title: this.resolvedTitle(meta, name), author: meta.author || '未知作者', cover, format, path, size: size || 0, metadata: this.buildMetadata(meta), dataId, fingerprint })
    return url
  }
  private saveCover = (blob: Blob | undefined, url: string) => blob ? Promise.race([saveOptionalCover(blob, url), new Promise<undefined>(resolve => setTimeout(resolve, 8000))]).catch(() => undefined) : undefined
  
  async init() { if (this.ready) return; await getDatabase(); this.ready = true; }
  async getBooks() { return this.useDb(db => db.getBooks()); }
  async getRecentBooks(limit = 5) { return this.useDb(db => db.getRecentBooks(limit)); }
  async getBook(url: string) {
    return this.useDb(async (db) => {
      for (const key of bookUrlCandidates(url)) {
        const book = await db.getBook(key)
        if (book) return book
      }
      // 旧链接（pdf://标题_大小）在书被重新导入成 file:// 条目后仍要能打开
      return matchLegacyBook(url, await db.getBooks())
    })
  }
  async getSetting<T = any>(key: string, fallback?: T) { const value = await this.useDb(db => db.getSetting<T>(key)); return (value ?? fallback) as T; }
  async saveSetting(key: string, value: any) { await this.useDb(db => db.saveSetting(key, value)); }
  async patchSetting(key: string, patch: Record<string, unknown>) { await this.useDb(db => db.patchSetting(key, patch)); }
  async flush() { await this.useDb(db => db.cleanup()); }
  async recordReading(bookUrl: string, duration: number) {
    if (!bookUrl || duration <= 0) return;
    await this.useDb(db => db.saveDailyReading(bookUrl, duration));
    await this.useDb(db => db.incrementBook(bookUrl, 'time', duration, { read: Date.now() }));
  }
  async recordSessionFocus(date: string, durationMs: number) { await this.useDb(db => db.saveSessionFocus(date, durationMs)); }
  async getSessionFocus(date: string) { return this.useDb(db => db.getSessionFocus(date)); }
  hasBook = async (url: string) => !!(await this.getBook(url))
  
  async addBook(info: any) {
    diagnosticLog('info', 'bookshelf.add.start', { format: info?.format, size: Number(info?.size || 0), hasPath: !!info?.path, hasDataId: !!info?.dataId });
    try {
      if (!info.url) throw new Error('URL required');
      if (await this.useDb(db => db.getBook(info.url))) throw new Error('已存在');
      const now = Date.now();
      await this.saveBookData(this.buildBookPayload({ ...info, added: now, read: now, finished: 0 }));
      diagnosticLog('info', 'bookshelf.add.done', { format: info?.format });
    } catch (error) { diagnosticLog('error', 'bookshelf.add.failed', { format: info?.format, error }); throw error }
  }

  async updateBook(url: string, updates: any) { return this.mutateBook(url, () => updates); }
  async removeBook(url: string, deleteData = false) {
    return this.withBook(url, async book => {
      await this.useDb(db => db.deleteBook(url, deleteData));
      await Promise.all([removeManagedFile(book.path), removeManagedFile(book.cover)]);
      this.notify();
      return true;
    }, false); 
  }
  
  removeBooks = async (urls: string[], deleteData = false) => this.batch(urls, url => this.removeBook(url, deleteData));
  
  async filterBooks(opt: FilterOptions = {}) {
    const { query, groups, ...dbOpt } = opt;
    let books = await this.useDb(db => db.filterBooks(dbOpt));
    if (query) { const q = query.toLowerCase(); books = books.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.tags?.some((t: string) => t.toLowerCase().includes(q))); }
    if (groups?.length) books = books.filter(b => groups.some((g: string) => b.groups?.includes(g)));
    return books;
  }
  async getBookshelfState(opt: BookshelfStateOptions = {}) {
    const { currentGroup = null, keyword = '', sortBy = 'time', reverse = false, status, rating, formats, tags } = opt
    const db = await this.db()
    const [source, groups] = await Promise.all([db.getBooks(), this.getGroups()])
    const group = groups.find(g => g.id === currentGroup)
    let books = await db.filterBooks({ sortBy, reverse, status, rating, formats, tags }, source)
    if (group) books = books.filter(book => this.matchGroup(book, group))
    else if (currentGroup) books = books.filter(book => book.groups?.includes(currentGroup))
    const query = keyword.trim().toLowerCase()
    if (query) books = books.filter(book => [book.title, book.author, ...(book.tags || [])].some(value => value?.toLowerCase().includes(query)))
    const counts = Object.fromEntries(groups.map(group => [group.id, source.filter(book => this.matchGroup(book, group)).length]))
    return { books, groups, counts, tags: await db.getAllTags(source), stats: await db.getStats(source, false) }
  }
  
  async getStats(books?: Book[]): Promise<BookStats> { return this.useDb(db => db.getStats(books)); }
  async getTodayReading() { return this.useDb(db => db.getTodayReading()); }
  async getDailyReading(year: number, month?: number) { return this.useDb(db => db.getDailyReading(year, month)); }
  
  // ===== 进度管理 =====
  // 更新阅读进度
  async updateProgress(url:string,progress:number,chapter?:number,cfi?:string,pdf?:{key:string;totalPages:number}){
    const changed = await this.useDb(db => db.updateProgress(url, progress, chapter, cfi, pdf))
    if (changed) this.notify()
    return changed
  }
  
  // 自动更新进度（防抖）
  async updateProgressAuto(url:string,reader?:any,view?:any){
    const loc=reader?.getLocation?.()??view?.lastLocation
    if(!loc||loc.fraction===undefined)return false
    return this.updateProgress(url,Math.round(loc.fraction*100),loc.index,loc.cfi)
  }
  
  // 恢复阅读进度
  async restoreProgress(url:string,reader?:any){
    try{
      const b=await this.getBook(url),cfi=b?.pos?.cfi,chapter=Number.isInteger(b?.chapter)?b.chapter:undefined
      if(!b||!reader)return
      if(cfi&&await reader.goTo(cfi))return
      if(chapter!==undefined)await reader.goTo(chapter)
    }catch{}
  }
  
  // 清理资源
  cleanup(){}
  
  updateRating=async(url:string,rating:number)=>this.updateBook(url,{rating:rating?Math.max(1,Math.min(5,rating)):undefined}); // 更新评分(1-5星)
  updateStatus=async(url:string,status:BookStatus)=>this.updateBook(url,{status,...(status==='finished'&&{finished:Date.now(),progress:100})}); // 更新状态(未读/在读/已读)
  updateReadTime=async(url:string,seconds:number)=>this.useDb(db=>db.incrementBook(url,'time',seconds)); // 累加阅读时长
  
  // ===== 标签管理 =====
  manageTags = async (url: string, action: 'add' | 'remove' | 'set', data: string | string[]) => {
    return this.mutateBook(url, book => {
      const tags = book.tags || [];
      if (action === 'set') return { tags: normalizeBookList(data as string[]) };
      if (action === 'add') return tags.includes(data as string) ? null : { tags: normalizeBookList([...tags, data as string]) };
      return { tags: tags.filter((t: string) => t !== data) };
    });
  };
  
  getAllTags = async () => this.useDb(db => db.getAllTags());
  getSettings = async () => this.useDb(db => db.getSettings());
  
  // ===== 分组管理 =====
  private sortGroups = (groups: GroupConfig[]) => groups.map((group, i) => ({ ...group, order: Number.isFinite(group.order) ? group.order : i })).sort((a, b) => a.order - b.order)
  private writeGroups = async (groups: GroupConfig[]) => { await this.useDb(db => db.saveGroups(groups.map((group, order) => ({ ...group, order })))); this.notify() }
  private matchGroup = (book: any, group: GroupConfig) => bookInGroup(book, group)
  getGroups = async () => this.useDb(db => db.getGroups()).then(this.sortGroups);
  saveGroups = async (groups: GroupConfig[]) => this.writeGroups(groups);
  async upsertGroup(group: GroupConfig) {
    const coverMode = group.coverMode === 'custom' || group.coverMode === 'books' ? group.coverMode : 'default'
    const normalized = { ...group, coverMode, cover: coverMode === 'custom' ? String(group.cover || '').trim() : '' }
    const groups = await this.getGroups(), index = groups.findIndex(item => item.id === group.id)
    await this.writeGroups(index > -1 ? groups.map(item => item.id === group.id ? normalized : item) : [...groups, normalized])
    return { created: index < 0 }
  }
  async moveGroup(gid: string, offset: -1 | 1) {
    const groups = await this.getGroups(), from = groups.findIndex(group => group.id === gid), to = from + offset
    if (from < 0 || to < 0 || to >= groups.length) return false
    ;[groups[from], groups[to]] = [groups[to], groups[from]]
    await this.writeGroups(groups)
    return true
  }
  createGroup = async (name: string, type: 'folder' | 'smart' = 'folder') => {
    const groups = await this.getGroups(), newGroup: GroupConfig = { id: 'group_' + Date.now(), name, order: groups.length, type, coverMode: 'default', cover: '' }
    await this.writeGroups([...groups, newGroup])
    return newGroup
  };
  
  deleteGroup = async (gid: string) => { await this.useDb(db => db.deleteGroup(gid)); this.notify(); return true };
  
  manageGroup = async (url: string, gid: string, action: 'add' | 'remove') => {
    return this.mutateBook(url, book => {
      const groups = book.groups || [];
      if (action === 'add') return groups.includes(gid) ? null : { groups: [...groups, gid] };
      return { groups: groups.filter((group: string) => group !== gid) };
    });
  };
  
  addBooksToGroup = async (urls: string[], gid: string) => this.batch(urls, url => this.manageGroup(url, gid, 'add'));
  private getResolvedGroup = async (gid: string) => (await this.getGroups()).find(g => g.id === gid)
  getGroupBooks = async (gid: string) => { const group = await this.getResolvedGroup(gid); return group ? (await this.getBooks()).filter(book => this.matchGroup(book, group)) : [] };
  async getGroupDisplayState(): Promise<GroupDisplayState> {
    const groups = await this.getGroups(), counts: Record<string, number> = {}
    const books = await this.getBooks()
    groups.forEach(group => counts[group.id] = books.filter(book => this.matchGroup(book, group)).length)
    return { groups, counts }
  }
  
  // 批量操作
  private batch = async <T>(items: T[], op: (item: T) => Promise<boolean>) => { const results = await Promise.allSettled(items.map(op)), success = results.filter(r => r.status === 'fulfilled' && r.value).length; return { success, failed: items.length - success } };
  
  batchUpdateRating=async(urls:string[],rating:number)=>this.batch(urls,url=>this.updateRating(url,rating));
  batchUpdateStatus=async(urls:string[],status:BookStatus)=>this.batch(urls,url=>this.updateStatus(url,status));
  applyBookPatch = async (url: string, patch: BookBulkPatch, notify = true) => this.mutateBook(url, book => {
    if (!hasBookBulkPatch(patch)) return null
    const updates: any = {}
    if (patch.tags) updates.tags = applyBookArrayPatch(book.tags || [], patch.tags)
    if (patch.groups) updates.groups = applyBookArrayPatch(book.groups || [], patch.groups)
    if (patch.rating !== undefined) updates.rating = patch.rating ? Math.max(1, Math.min(5, Number(patch.rating))) : 0
    if (patch.progress !== undefined) updates.progress = Math.max(0, Math.min(100, Number(patch.progress)))
    if (patch.status) {
      updates.status = patch.status
      if (patch.status === 'finished') { updates.finished = Date.now(); updates.progress = 100 }
    }
    return updates
  }, false, notify);
  batchUpdateBooks = async (urls: string[], patch: BookBulkPatch) => {
    const res = await this.batch(urls, url => this.applyBookPatch(url, patch, false))
    if (res.success) this.notify()
    return res
  };

  async completeBookData(url: string, notify = true): Promise<'updated' | 'skipped' | 'failed'> {
    const book = await this.getBook(url)
    if (!book) return 'failed'
    try {
      const sourcePath = book.path || book.url
      const file = await loadBookFile(sourcePath)
      const format = book.format as BookFormat
      const candidate = await this.extractMeta(file, format, book.title || this.fileBaseName(sourcePath))
      const coverManaged = /^\/(?:data\/)?public\/siyuan-sireader\//.test(book.cover || '')
      const coverMissing = coverManaged && await loadBookFile(book.cover).then(() => false, () => true)
      const updates = mergeBookCompletion(book, { ...candidate, meta: this.buildMetadata(candidate) }, { coverMissing })
      if ((!book.cover || coverMissing) && candidate.coverBlob) {
        const cover = await this.saveCover(candidate.coverBlob, book.url)
        if (cover) { updates.cover = cover; this.coverRevision++ }
      }
      if (!Object.keys(updates).length) return 'skipped'
      await this.useDb(db => db.patchBook(book.url, updates))
      if (notify) this.notify()
      return 'updated'
    } catch (error) {
      diagnosticLog('warn', 'bookshelf.completion.failed', { key: book.url, format: book.format, error })
      return 'failed'
    }
  }

  async batchCompleteBookData(urls: string[], onProgress?: (done: number, total: number) => void) {
    const result = { success: 0, skipped: 0, failed: 0 }
    diagnosticLog('info', 'bookshelf.completion.start', { count: urls.length })
    let cursor = 0
    let done = 0
    const books = await this.getBooks()
    const hasPdf = urls.some(url => books.find(book => book.url === url)?.format === 'pdf')
    const worker = async () => { while (cursor < urls.length) { const url = urls[cursor++] ; const state = await this.completeBookData(url, false); result[state === 'updated' ? 'success' : state]++; onProgress?.(++done, urls.length) } }
    await Promise.all(Array.from({ length: hasPdf ? 1 : Math.min(3, urls.length) }, worker))
    const selected = new Set(urls)
    await touchBookRecordFiles(books.filter(book => selected.has(book.url)).flatMap(book => [book.dataId, book.url]))
    if (result.success) this.notify()
    diagnosticLog('info', 'bookshelf.completion.done', result)
    return result
  }
  
  // ===== Assets PDF 同步 =====
  async syncAssetsPDF() {
    await this.init()
    const GID='assets-pdf',gs=await this.getGroups()
    if(!gs.find(g=>g.id===GID))await this.saveGroups([...gs,{id:GID,name:'Assets PDF',order:gs.length,type:'folder'}])
    const files = await readDirEntries('/data/assets')
    const assets=new Set<string>(files.filter((f:any)=>!f.isDir&&f.name.endsWith('.pdf')).map((f:any)=>`asset://assets/${f.name}`)),all=new Set<string>((await this.getBooks()).map(b=>b.url)),grp=new Set<string>((await this.getGroupBooks(GID)).map(b=>b.url))
    let add=0,del=0
    for(const u of assets){if(all.has(u)){grp.has(u)||await this.manageGroup(u,GID,'add');continue}try{const n=u.split('/').pop()!;await this.addAssetBook(`assets/${n}`,new File([await(await fetch(`/assets/${n}`)).blob()],n,{type:'application/pdf'}));await this.manageGroup(u,GID,'add');add++}catch{}}
    for(const b of await this.getGroupBooks(GID))assets.has(b.url)||await this.removeBook(b.url)&&del++
    this.notify()
    return{added:add,removed:del,total:assets.size}
  }
  
  private notify = () => typeof window !== 'undefined' && window.dispatchEvent(new Event('sireader:bookshelf-updated'));
  
  // ===== UI辅助 =====
  getBookColor(title: string) { const colors = ['#fef3c7', '#dbeafe', '#fce7f3', '#e0e7ff', '#d1fae5', '#fed7aa', '#fae8ff', '#f3e8ff', '#fecaca', '#fbcfe8']; let hash = 0; for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash); return colors[Math.abs(hash) % colors.length] }
  
  getCoverUrl(bookOrCover: any) {
    const raw = typeof bookOrCover === 'string' ? bookOrCover : bookOrCover?.cover
    const cover = typeof raw === 'string' ? raw.trim() : ''
    if (!cover) return ''
    if (/^(?:https?:|data:|blob:|\/assets\/)/i.test(cover)) return cover
    const path = cover.replace(/^\/?(?:data\/)?public\//i, '/public/')
    if (!path.startsWith('/public/')) return cover
    const separator = path.includes('?') ? '&' : '?'
    return `${path}${separator}v=${this.coverRevision}`
  }
  
  // ===== 书籍操作 =====
  async updateBookField(url: string, field: 'rating' | 'status' | 'group', value: any) { return field === 'rating' ? this.updateRating(url, value) : field === 'status' ? this.updateStatus(url, value) : this.updateBook(url, { groups: value === 'home' ? [] : [value] }) }
  
  async updateBookInfo(url: string, formData: { title: string; author: string; tags: string; rating: number; status: BookStatus; cover: string; groups: string[]; bindDocId?: string; bindDocName?: string }) {
    const book = await this.getBook(url)
    if (!book || !formData.title.trim()) return { success: false, error: '书名不能为空' }
    const tags = formData.tags.split(/[,，]/).map(t => t.trim()).filter(t => t)
    await this.updateBook(url, { title: formData.title.trim(), author: formData.author.trim(), tags, rating: formData.rating || undefined, status: formData.status, cover: formData.cover.trim() || '', groups: formData.groups, bindDocId: formData.bindDocId || '', bindDocName: formData.bindDocName || '' })
    return { success: true }
  }
  
  async uploadBooks(files: File[]) {
    const r={success:0,failed:0}
    for(const f of files){try{await this.addLocalBook(f);r.success++}catch{r.failed++}}
    return r
  }
  
  async addLocalBook(file: File, parsedMeta?: any) {
    await this.init()
    const { file: source, format, meta, title } = await this.prepareLocalBook(file, parsedMeta)
    const fingerprint = await fileFingerprint(source), dataId = await dataIdFromFingerprint(fingerprint)
    const url=`${format}://${source.name.replace(/\.[^.]+$/,'')}_${source.size}`
    const path = await saveBookFile(source, url)
    const cover = await this.saveCover(meta.coverBlob, url)
    return this.savePreparedBook({ url, path, format, size: source.size, meta, name: title, cover, dataId, fingerprint })
  }

  async addLocalLinkBook(file: File, parsedMeta?: any) {
    await this.init()
    const localPath = (file as any)?.path || (file as any)?._path || ''
    if (!localPath) throw new Error('本地文件链接不可用')
    const { file: source, format, meta, title } = await this.prepareLocalBook(file, parsedMeta)
    const fingerprint = await fileFingerprint(source), dataId = await dataIdFromFingerprint(fingerprint)
    const url=toFileUrl(localPath)
    const cover = await this.saveCover(meta.coverBlob, url)
    return this.savePreparedBook({ url, path: url, format, size: source.size, meta, name: title, cover, dataId, fingerprint })
  }
  
  async addUrlBook(url: string, coverUrl?: string, bookInfo?: { title?: string; author?: string }, parsedMeta?: any) {
    await this.init()
    const bookUrl = normalizeSiyuanCloudUrl(url)
    
    // HTTP书源快速通道：跳过文件下载和元数据提取
    if (bookInfo?.title) {
      const fingerprint = urlFingerprint(bookUrl), dataId = await dataIdFromFingerprint(fingerprint)
      const format = this.getFormat(bookUrl)
      const cover = await this.downloadCover(coverUrl, bookUrl)
      await this.addBook({ url: bookUrl, title: normalizeBookTitle(bookInfo.title) || bookInfo.title, author: bookInfo.author || '未知作者', cover, format, path: bookUrl, size: 0, metadata: {}, dataId, fingerprint })
      return bookUrl
    }
    
    // 常规路径：预览阶段可能已临时读取文件，但入库时保留链接本身，不托管远端正文。
    const { filePath, name, format, meta, file } = parsedMeta
      ? { filePath: bookUrl, name: parsedMeta.title || this.fileBaseName(bookUrl), format: this.getFormat(bookUrl), meta: parsedMeta, file: null }
      : await this.parseUrlBook(bookUrl)
    const fingerprint = parsedMeta?.fingerprint || (file ? await fileFingerprint(file) : urlFingerprint(filePath))
    const dataId = parsedMeta?.dataId || await dataIdFromFingerprint(fingerprint)
    let cover = await this.downloadCover(coverUrl, filePath)
    if (!cover) cover = await this.saveCover(meta.coverBlob, filePath)
    return this.savePreparedBook({ url: filePath, path: filePath, format, size: parsedMeta?.fileSize || 0, meta, name, cover, dataId, fingerprint })
  }

  async previewUrlBook(url: string) {
    const { meta, format, file } = await this.parseUrlBook(url)
    const fingerprint = await fileFingerprint(file)
    return { ...meta, format, fingerprint, dataId: await dataIdFromFingerprint(fingerprint), cover: meta.coverBlob ? URL.createObjectURL(meta.coverBlob) : '' }
  }

  async previewLocalBook(file: File) {
    await this.init()
    const { format, meta, title } = await this.prepareLocalBook(file)
    return { ...meta, format, title, cover: meta.coverBlob ? URL.createObjectURL(meta.coverBlob) : '' }
  }
  
  private async parseUrlBook(url: string) {
    const isHttp = /^https?:\/\//.test(url), isAbsolute = /^[a-zA-Z]:[\\\/]/.test(url) || url.startsWith('/')
    if (!isHttp && !isAbsolute && !url.includes('/') && !url.includes('\\')) throw new Error('请输入有效的链接或文件路径')
    
    url = normalizeSiyuanCloudUrl(url)
    const filePath = url.startsWith(SIYUAN_CLOUD_BASE) ? url : isAbsolute && !url.startsWith('file://') ? toFileUrl(url) : url
    const name = this.fileBaseName(url), format = this.getFormat(url)
    const file = await loadBookFile(filePath)
    const meta = await this.extractMeta(file, format, name)
    
    return { filePath, name, format, meta, file }
  }
  
  async addAssetBook(assetPath: string, file: File) {
    await this.init()
    const format = this.getFormat(file.name), name = file.name.replace(/\.[^.]+$/, ''), url = `asset://${assetPath}`, meta = await this.extractMeta(file, format, name)
    const fingerprint = urlFingerprint(url), dataId = await dataIdFromFingerprint(fingerprint)
    return this.savePreparedBook({ url, path: assetPath, format, meta, name, cover: await this.saveCover(meta.coverBlob, url), dataId, fingerprint })
  }
  
  // 对阅读器保留统一入口，底层实现已下沉到 storage。
  async loadFile(path: string): Promise<File> { return loadBookFile(path) }
  
  private buildMetadata = buildBookMetadata
  private getFormat = (path: string): BookFormat => { const ext = this.cleanPath(path).split('.').pop()?.toLowerCase() || ''; return ({ epub: 'epub', pdf: 'pdf', mobi: 'mobi', azw3: 'azw3', azw: 'azw3', txt: 'txt' } as Record<string, BookFormat>)[ext] || 'epub' }
  private metaDef = (defaultName: string) => ({ title: defaultName, author: '未知作者', publisher: undefined, published: undefined, language: undefined, identifier: undefined, intro: undefined, subjects: [], series: undefined, coverBlob: undefined, subtitle: undefined })
  private normMeta = (metadata: any, defaultName: string, coverBlob?: Blob | null) => {
    const norm = (v: any): string => typeof v === 'string' ? v : (v?.['zh-CN'] || v?.['zh'] || v?.['en'] || Object.values(v || {})[0] || '') as string
    const arr = (v: any) => v ? (Array.isArray(v) ? v : [v]) : []
    const contrib = (v: any) => arr(v).map((c: any) => typeof c === 'string' ? c : norm(c?.name)).filter(Boolean).join(', ') || undefined
    return {
      title: normalizeBookTitle(norm(metadata.title) || defaultName) || defaultName, subtitle: norm(metadata.subtitle), author: contrib(metadata.author) || '未知作者',
      publisher: contrib(metadata.publisher), published: metadata.published instanceof Date ? metadata.published.toISOString().split('T')[0] : metadata.published ? String(metadata.published) : undefined,
      language: arr(metadata.language)[0], identifier: arr(metadata.identifier)[0], intro: metadata.description,
      subjects: arr(metadata.subject).map((s: any) => typeof s === 'string' ? s : norm(s?.name)).filter(Boolean),
      series: Array.isArray(metadata.belongsTo) ? metadata.belongsTo[0] : metadata.belongsTo, coverBlob: coverBlob || undefined
    }
  }
  private async extractEpubMeta(file: File, defaultName: string) {
    const [{ configure, ZipReader, BlobReader, TextWriter, BlobWriter }, { parseEpubMetadataFromXML }] = await Promise.all([import('foliate-js/vendor/zip.js') as any, import('foliate-js/epub.js') as any])
    configure({ useWebWorkers: false })
    const reader = new ZipReader(new BlobReader(file))
    try {
      const entries = new Map<string, any>((await reader.getEntries()).map((e: any) => [e.filename, e] as [string, any]))
      const entry = (p = '') => entries.get(p) || entries.get(decodeURIComponent(p))
      const text = async (p: string) => await entry(p)?.getData(new TextWriter())
      const blob = async (p: string, type = '') => await entry(p)?.getData(new BlobWriter(type))
      const container = new DOMParser().parseFromString(await text('META-INF/container.xml') || '', 'application/xml')
      const opfPath = container.querySelector('rootfile[media-type="application/oebps-package+xml"]')?.getAttribute('full-path') || container.querySelector('rootfile')?.getAttribute('full-path') || ''
      const opfXML = opfPath && await text(opfPath)
      if (!opfXML) throw new Error('No package document')
      const metadata = parseEpubMetadataFromXML(opfXML).metadata
      const opf = new DOMParser().parseFromString(opfXML, 'application/xml')
      const items = Array.from(opf.querySelectorAll('manifest item')), coverId = opf.querySelector('meta[name="cover"]')?.getAttribute('content')
      const coverItem = items.find(el => el.getAttribute('id') === coverId) || items.find(el => /\bcover-image\b/.test(el.getAttribute('properties') || ''))
      const href = coverItem?.getAttribute('href') || '', base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
      const coverBlob = href ? await blob(decodeURIComponent(new URL(href, `file:///${base}`).pathname.slice(1)), coverItem?.getAttribute('media-type') || '') : null
      return this.normMeta(metadata, defaultName, coverBlob)
    } finally { await reader.close?.() }
  }
  private async extractMobiMeta(file: File, defaultName: string) {
    const [{ readMobiMetadata }, { unzlibSync }] = await Promise.all([import('foliate-js/mobi.js') as any, import('fflate')])
    const { metadata, getCover } = await readMobiMetadata(file, { unzlib: unzlibSync })
    return this.normMeta(metadata, defaultName, await getCover?.().catch(() => null))
  }
  private async extractMeta(file: File, format: BookFormat, defaultName: string) {
    const def = this.metaDef(defaultName)
    if (format === 'pdf') return { ...def, coverBlob: await renderPdfFirstPage(file) }
    if (!['epub', 'mobi', 'azw3', 'txt'].includes(format)) return def
    if (format === 'txt') return def
    try {
      if (format === 'epub') return await this.extractEpubMeta(file, defaultName)
      if (format === 'mobi' || format === 'azw3') return await this.extractMobiMeta(file, defaultName)
    } catch {}
    try {
      const { makeBook } = await import('foliate-js/view.js') as any
      const book = await Promise.race([makeBook(file), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))]) as any
      const metadata = book?.metadata || {}, cover = await book?.getCover?.().catch(() => null)
      book?.destroy?.()
      return this.normMeta(metadata, defaultName, cover)
    } catch { return def }
  }
}

export const bookshelfManager = new BookshelfManager();
export type { Book } from './database';
