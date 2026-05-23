/**
 * 书架管理 - 极简架构
 */
import { getDatabase } from './database';
import { loadBookFile, normalizeBookTitle, readDirEntries, removeManagedFile, saveBookFile, saveCoverFile, saveOptionalCover, toFileUrl } from './bookStore';

export type BookFormat = 'pdf' | 'epub' | 'mobi' | 'azw3' | 'txt';
export type BookStatus = 'unread' | 'reading' | 'finished';
export interface GroupConfig { id: string; name: string; icon?: string; color?: string; parentId?: string; order: number; type: 'folder' | 'smart'; rules?: { tags?: string[]; format?: BookFormat[]; status?: BookStatus[]; rating?: number } }
export type SortType = 'time' | 'name' | 'author' | 'update' | 'progress' | 'rating' | 'readTime' | 'added';
export interface FilterOptions { query?: string; status?: BookStatus[]; rating?: number; formats?: BookFormat[]; tags?: string[]; groups?: string[]; sortBy?: SortType; reverse?: boolean }
export interface BookStats { total: number; byStatus: Record<BookStatus, number>; byFormat: Record<string, number>; byRating: Record<number, number>; annotationCount: number }
export interface BookshelfStateOptions {
  currentGroup?: string | null
  keyword?: string
  sortBy?: SortType
  reverse?: boolean
  status?: BookStatus[]
  rating?: number
  formats?: BookFormat[]
  tags?: string[]
}
export interface GroupDisplayState {
  groups: GroupConfig[]
  counts: Record<string, number>
}
export type BookshelfViewMode = 'grid' | 'list' | 'compact'
export type BookshelfModalMode = 'detail' | 'edit' | 'manage' | 'organize' | null
export interface BookshelfOption { value: string | number; label: string; count?: number }
export interface BookshelfSection { key: string; label: string; options: BookshelfOption[] }
export interface BookshelfDetailField { label: string; value: string; mono?: boolean }
export interface BookshelfEditForm { title: string; author: string; tags: string; rating: number; status: BookStatus; cover: string; groups: string[]; bindDocId: string; bindDocName: string }

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
export const createDefaultEditForm = (): BookshelfEditForm => ({ title: '', author: '', tags: '', rating: 0, status: 'unread', cover: '', groups: [], bindDocId: '', bindDocName: '' });
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
export const buildEditFields = () => [
  { key: 'title', label: '书名', type: 'text', placeholder: '书名' },
  { key: 'author', label: '作者', type: 'text', placeholder: '作者' },
  { key: 'cover', label: '封面', type: 'text', placeholder: '封面图片 URL' },
  { key: 'rating', label: '评分', type: 'select', options: [{ value: 0, label: '无评分' }, ...STAR_OPTIONS.map(value => ({ value, label: `${'★'.repeat(value)} ${value}星` }))] },
  { key: 'status', label: '状态', type: 'select', options: STATUS_SELECT_OPTIONS },
  { key: 'tags', label: '标签', type: 'tags', placeholder: '用逗号分隔' },
  { key: 'groups', label: '分组', type: 'groups' },
  { key: 'bind', label: '绑定文档', type: 'bind' },
];
export const buildGroupFields = (group: GroupConfig | null, allTags: Array<{ tag: string; count: number }>) => !group ? [] : [
  { key: 'name', label: '名称', type: 'text', placeholder: '分组名称' },
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
export const buildDetailFields = (book: any, groups: GroupConfig[]): BookshelfDetailField[] => {
  const m = book?.meta || {};
  return !book ? [] : [['书名', book.title], ['作者', book.author], ['格式', book.format.toUpperCase()], ['进度', `${book.progress || 0}%`], ['状态', STATUS_MAP[book.status]], ['评分', book.rating ? '★'.repeat(book.rating) : '未评分'], ['章节', `${book.chapter || 0}/${book.total || '-'}`], ['时长', fmt.time(book.time || 0)], ['大小', fmt.bytes(book.size || 0)], ['添加', fmt.date(book.added)], ['最后阅读', fmt.date(book.read)], book.finished && ['完成', fmt.date(book.finished)], book.tags.length && ['标签', book.tags.join(', ')], book.groups.length && ['分组', groups.filter(g => book.groups.includes(g.id)).map(g => g.name).join(', ')], book.bindDocName && ['绑定文档', book.bindDocName], m.publisher && ['出版社', m.publisher], m.publishDate && ['出版日期', m.publishDate], m.isbn && ['ISBN', m.isbn], m.series && ['系列', m.series], book.path && ['路径', book.path, true]].filter(Boolean).map(([label, value, mono]) => ({ label, value, mono })) as BookshelfDetailField[];
};

class BookshelfManager {
  private ready = false;
  private db = async () => { await this.init(); return getDatabase(); };
  private async useDb<T>(task: (db: Awaited<ReturnType<typeof getDatabase>>) => Promise<T>) {
    return task(await this.db());
  }
  private saveBookData = async (book: any, notify = true) => {
    await this.useDb(db => db.saveBook(book));
    if (notify) this.notify();
  };
  private withBook = async <T>(url: string, task: (book: any) => Promise<T>, fallback: T) => {
    const book = await this.getBook(url);
    return book ? task(book) : fallback;
  };
  private mutateBook = async (url: string, mutate: (book: any) => any, fallback = false, notify = true) =>
    this.withBook(url, async book => {
      const patch = await mutate(book);
      if (!patch || patch === book) return false;
      await this.saveBookData({ ...book, ...patch }, notify);
      return true;
    }, fallback);
  
  private prepareLocalBook = async (file: File, parsedMeta?: any) => {
    const originalFormat = this.getFormat(file.name)
    if (file.name.toLowerCase().endsWith('.txt')) file = await (await import('@/core/txt')).convertTxtFile(file)
    const format = originalFormat
    const name = file.name.replace(/\.[^.]+$/, '')
    const meta = parsedMeta || await this.extractMeta(file, format, name)
    const title = normalizeBookTitle(meta.title || name) || name
    return { file, format, name, meta, title }
  }
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
  });
  private fileBaseName = (path: string, fallback = '未知书籍') => path.split(/[/\\]/).pop()?.split('?')[0]?.replace(/\.[^.]+$/, '') || fallback
  private resolvedTitle = (meta: any, name: string) => normalizeBookTitle(meta.title || name) || name
  private savePreparedBook = async ({ url, path, format, size, meta, name, cover = '' }: { url: string; path: string; format: BookFormat; size?: number; meta: any; name: string; cover?: string }) =>
    this.addBook({ url, title: this.resolvedTitle(meta, name), author: meta.author || '未知作者', cover, format, path, size: size || 0, metadata: this.buildMetadata(meta) })
  
  async init() { if (this.ready) return; await getDatabase(); this.ready = true; }
  async getBooks() { return this.useDb(db => db.getBooks()); }
  async getBook(url: string) { return this.useDb(db => db.getBook(url)); }
  async getSetting<T = any>(key: string, fallback?: T) {
    const value = await this.useDb(db => db.getSetting<T>(key));
    return (value ?? fallback) as T;
  }
  async saveSetting(key: string, value: any) {
    await this.useDb(db => db.saveSetting(key, value));
  }
  async flush() {
    await this.useDb(db => db.cleanup());
  }
  async recordReading(bookUrl: string, duration: number) {
    if (!bookUrl || duration <= 0) return;
    await this.useDb(db => db.saveDailyReading(bookUrl, duration));
    await this.mutateBook(bookUrl, book => ({ time: (book.time || 0) + duration, read: Date.now() }), false, false);
  }
  hasBook = async (url: string) => !!(await this.getBook(url))
  
  async addBook(info: any) {
    if (!info.url) throw new Error('URL required');
    if (await this.useDb(db => db.getBook(info.url))) throw new Error('已存在');
    const now = Date.now();
    await this.saveBookData(this.buildBookPayload({ ...info, added: now, read: now, finished: 0 }));
  }

  async updateBook(url: string, updates: any) { 
    return this.mutateBook(url, () => updates); 
  }
  async removeBook(url: string) { 
    return this.withBook(url, async book => {
      await this.useDb(db => db.deleteBook(url));
      await Promise.all([removeManagedFile(book.path), removeManagedFile(book.cover)]);
      this.notify();
      return true;
    }, false); 
  }
  
  removeBooks = async (urls: string[]) => this.batch(urls, url => this.removeBook(url));
  
  async filterBooks(opt: FilterOptions = {}) {
    const { query, groups, ...dbOpt } = opt;
    let books = await this.useDb(db => db.filterBooks(dbOpt));
    if (query) { const q = query.toLowerCase(); books = books.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)); }
    if (groups?.length) books = books.filter(b => groups.some((g: string) => b.groups?.includes(g)));
    return books;
  }
  async getBookshelfState(opt: BookshelfStateOptions = {}) {
    const { currentGroup = null, keyword = '', sortBy = 'time', reverse = false, status, rating, formats, tags } = opt
    if (currentGroup) {
      const group = (await this.getGroups()).find(g => g.id === currentGroup)
      if (group?.type === 'smart') return { books: await this.getGroupBooks(currentGroup), stats: await this.getStats() }
    }
    return { books: await this.filterBooks({ groups: currentGroup ? [currentGroup] : (!keyword ? [] : undefined), sortBy, reverse, status: status?.length ? status : undefined, rating: rating || undefined, formats: formats?.length ? formats : undefined, tags: tags?.length ? tags : undefined }), stats: await this.getStats() }
  }
  
  async getStats(): Promise<BookStats> { 
    const dbStats = await this.useDb(db => db.getStats());
    return { total: (await this.getBooks()).length, ...dbStats };
  }
  async getTodayReading() {
    return this.useDb(db => db.getTodayReading());
  }
  async getDailyReading(year: number, month?: number) {
    return this.useDb(db => db.getDailyReading(year, month));
  }
  
  // ===== 进度管理 =====
  private progressTimer: any = null
  // 更新阅读进度
  async updateProgress(url:string,progress:number,chapter?:number,cfi?:string){
    const b=await this.getBook(url);if(!b)return false
    const p=Math.max(0,Math.min(100,progress)),now=Date.now()
    // 状态逻辑：手动标注为finished后不再自动更新状态
    const s=b.status==='finished'?'finished':p>0&&p<100?'reading':p===100?'finished':'unread'
    return this.updateBook(url,{progress:p,status:s,read:now,pos:{...b.pos,chapter:chapter??b.pos.chapter,timestamp:now,cfi},...(chapter!==undefined&&{chapter}),...(p===100&&{finished:now})})
  }
  
  // 自动更新进度（防抖）
  async updateProgressAuto(url:string,reader?:any,pdfViewer?:any,view?:any){
    clearTimeout(this.progressTimer)
    this.progressTimer=setTimeout(async()=>{
      try{
        if(pdfViewer){
          const loc=pdfViewer.getLocation?.(),p=loc?.page||pdfViewer.getCurrentPage?.()||1
          return this.updateProgress(url,Math.round((loc?.fraction||0)*100),p,`#page-${p}`)
        }
        const loc=reader?.getLocation?.()??view?.lastLocation;if(!loc)return
        loc.fraction!==undefined&&this.updateProgress(url,Math.round(loc.fraction*100),loc.index,loc.cfi)
      }catch{}
    },2000)
  }
  
  // 恢复阅读进度
  async restoreProgress(url:string,reader?:any,pdfViewer?:any,view?:any){
    try{
      const b=await this.getBook(url),cfi=b?.pos?.cfi,chapter=Number.isInteger(b?.chapter)?b.chapter:undefined
      if(!b)return
      if(pdfViewer){
        const t=pdfViewer.getPageCount(),page=chapter>=1&&chapter<=t?chapter:cfi?.startsWith('#page-')?parseInt(cfi.slice(6)):0
        if(page>=1&&page<=t)pdfViewer.goToPage(page)
        return
      }
      const tgt=reader||view,loc=chapter??cfi
      if(!tgt)return
      if(!loc)return void ((b.progress||0)<=0&&await reader?.goToTextStart?.())
      await new Promise(r=>setTimeout(r,300))
      try{await tgt.goTo(loc)}catch{chapter&&tgt.goTo(chapter).catch(()=>{})}
    }catch{}
  }
  
  // 清理资源
  cleanup(){clearTimeout(this.progressTimer)}
  
  updateRating=async(url:string,rating:number)=>this.updateBook(url,{rating:rating?Math.max(1,Math.min(5,rating)):undefined}); // 更新评分(1-5星)
  updateStatus=async(url:string,status:BookStatus)=>this.updateBook(url,{status,...(status==='finished'&&{finished:Date.now(),progress:100})}); // 更新状态(未读/在读/已读)
  updateReadTime=async(url:string,seconds:number)=>this.mutateBook(url,book=>({time:(book.time||0)+seconds}),false,false); // 累加阅读时长
  
  // ===== 标签管理 =====
  manageTags = async (url: string, action: 'add' | 'remove' | 'set', data: string | string[]) => {
    return this.mutateBook(url, book => {
      const tags = book.tags || [];
      if (action === 'set') return { tags: data as string[] };
      if (action === 'add') return tags.includes(data as string) ? null : { tags: [...tags, data as string] };
      return { tags: tags.filter((t: string) => t !== data) };
    });
  };
  
  getAllTags = async () => this.useDb(db => db.getAllTags());
  
  // ===== 分组管理 =====
  private writeGroups = async (groups: GroupConfig[]) => { await this.useDb(db => db.saveGroups(groups)); this.notify() }
  private matchGroup = (book: any, group: GroupConfig) => bookInGroup(book, group)
  getGroups = async () => this.useDb(db => db.getGroups());
  saveGroups = async (groups: GroupConfig[]) => this.writeGroups(groups);
  async upsertGroup(group: GroupConfig) {
    const groups = await this.getGroups(), index = groups.findIndex(item => item.id === group.id)
    await this.writeGroups(index > -1 ? groups.map(item => item.id === group.id ? { ...group } : item) : [...groups, group])
    return { created: index < 0 }
  }
  createGroup = async (name: string, type: 'folder' | 'smart' = 'folder') => {
    const groups = await this.getGroups(), newGroup: GroupConfig = { id: 'group_' + Date.now(), name, order: groups.length, type }
    await this.writeGroups([...groups, newGroup])
    return newGroup
  };
  
  deleteGroup = async (gid: string) => { 
    await this.useDb(db => db.deleteGroup(gid));
    this.notify();
    return true;
  };
  
  manageGroup = async (url: string, gid: string, action: 'add' | 'remove') => {
    return this.mutateBook(url, book => {
      const groups = book.groups || [];
      if (action === 'add') return groups.includes(gid) ? null : { groups: [...groups, gid] };
      return { groups: groups.filter((group: string) => group !== gid) };
    });
  };
  
  addBooksToGroup = async (urls: string[], gid: string) => this.batch(urls, url => this.manageGroup(url, gid, 'add'));
  private getResolvedGroup = async (gid: string) => (await this.getGroups()).find(g => g.id === gid)
  getGroupCount = async (gid: string) => (await this.getGroupBooks(gid)).length;
  getGroupBooks = async (gid: string) => { 
    const group = await this.getResolvedGroup(gid); 
    if (!group) return []; 
    return (await this.getBooks()).filter(book => this.matchGroup(book, group))
  };
  async getGroupDisplayState(): Promise<GroupDisplayState> {
    const groups = await this.getGroups(), counts: Record<string, number> = {}
    const books = await this.getBooks()
    groups.forEach(group => counts[group.id] = books.filter(book => this.matchGroup(book, group)).length)
    return { groups, counts }
  }
  
  // 批量操作
  private batch = async <T>(items: T[], op: (item: T) => Promise<boolean>) => { 
    const results = await Promise.allSettled(items.map(op)), success = results.filter(r => r.status === 'fulfilled' && r.value).length; 
    return { success, failed: items.length - success }; 
  };
  
  batchUpdateRating=async(urls:string[],rating:number)=>this.batch(urls,url=>this.updateRating(url,rating));
  batchUpdateStatus=async(urls:string[],status:BookStatus)=>this.batch(urls,url=>this.updateStatus(url,status));
  
  // ===== Assets PDF 同步 =====
  async syncAssetsPDF() {
    await this.init()
    const GID='assets-pdf',gs=await this.getGroups()
    if(!gs.find(g=>g.id===GID))await this.saveGroups([...gs,{id:GID,name:'Assets PDF',order:gs.length,type:'folder'}])
    const files = await readDirEntries('/data/assets')
    const assets=new Set(files.filter((f:any)=>!f.isDir&&f.name.endsWith('.pdf')).map((f:any)=>`asset://assets/${f.name}`)),all=new Set((await this.getBooks()).map(b=>b.url)),grp=new Set((await this.getGroupBooks(GID)).map(b=>b.url))
    let add=0,del=0
    for(const u of assets){if(all.has(u)){grp.has(u)||await this.manageGroup(u,GID,'add');continue}try{const n=u.split('/').pop()!;await this.addAssetBook(`assets/${n}`,new File([await(await fetch(`/assets/${n}`)).blob()],n,{type:'application/pdf'}));await this.manageGroup(u,GID,'add');add++}catch(e){console.error('[同步]',u,e)}}
    for(const b of await this.getGroupBooks(GID))assets.has(b.url)||await this.removeBook(b.url)&&del++
    this.notify()
    return{added:add,removed:del,total:assets.size}
  }
  
  private notify = () => typeof window !== 'undefined' && window.dispatchEvent(new Event('sireader:bookshelf-updated'));
  
  // ===== UI辅助 =====
  getBookColor(title: string) {
    const colors = ['#fef3c7', '#dbeafe', '#fce7f3', '#e0e7ff', '#d1fae5', '#fed7aa', '#fae8ff', '#f3e8ff', '#fecaca', '#fbcfe8'];
    let hash = 0;
    for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }
  
  getCoverUrl(book: any) {
    if (!book.cover) return '';
    if (book.cover.startsWith('/assets/') || /^https?:\/\//.test(book.cover)) return book.cover;
    if (book.cover.startsWith('/public/')) return book.cover;
    if (book.cover.startsWith('/data/public/')) return book.cover.replace('/data/public/', '/public/');
    return book.cover;
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
    const url=`${format}://${source.name.replace(/\.[^.]+$/,'')}_${source.size}`
    const [path, cover] = await Promise.all([saveBookFile(source, url), saveOptionalCover(meta.coverBlob, url)])
    await this.savePreparedBook({ url, path, format, size: source.size, meta, name: title, cover })
  }

  async addLocalLinkBook(file: File, parsedMeta?: any) {
    await this.init()
    const localPath = (file as any)?.path || (file as any)?._path || ''
    if (!localPath) throw new Error('本地文件链接不可用')
    await this.addLinkedBook(toFileUrl(localPath), file, parsedMeta)
  }

  async addLinkedBook(url: string, file: File, parsedMeta?: any) {
    await this.init()
    if (!url) throw new Error('外部文件链接不可用')
    const { file: source, format, meta, title } = await this.prepareLocalBook(file, parsedMeta)
    const cover = await saveOptionalCover(meta.coverBlob, url)
    await this.savePreparedBook({ url, path: url, format, size: parsedMeta?.size || source.size, meta, name: title, cover })
  }
  
  async addUrlBook(url: string, coverUrl?: string, bookInfo?: { title?: string; author?: string }, parsedMeta?: any) {
    await this.init()
    
    // HTTP书源快速通道：跳过文件下载和元数据提取
    if (bookInfo?.title) {
      const format = this.getFormat(url)
      const cover = await this.downloadCover(coverUrl, url)
      const file = await loadBookFile(url)
      const path = await saveBookFile(file, url)
      await this.addBook({ url, title: normalizeBookTitle(bookInfo.title) || bookInfo.title, author: bookInfo.author || '未知作者', cover, format, path, size: file.size, metadata: {} })
      return
    }
    
    // 常规路径：需要下载文件提取元数据
    const { filePath, name, format, meta } = parsedMeta
      ? { filePath: url, name: parsedMeta.title || this.fileBaseName(url), format: this.getFormat(url), meta: parsedMeta }
      : await this.parseUrlBook(url)
    const file = await loadBookFile(filePath)
    const path = await saveBookFile(file, filePath)
    let cover = await this.downloadCover(coverUrl, filePath)
    if (!cover) cover = await saveOptionalCover(meta.coverBlob, filePath)
    await this.savePreparedBook({ url: filePath, path, format, size: file.size, meta, name, cover })
  }
  
  async previewUrlBook(url: string) {
    const { meta, format } = await this.parseUrlBook(url)
    return { ...meta, format, cover: meta.coverBlob ? URL.createObjectURL(meta.coverBlob) : '' }
  }

  async previewLocalBook(file: File) {
    await this.init()
    const { format, meta, title } = await this.prepareLocalBook(file)
    return { ...meta, format, title, cover: meta.coverBlob ? URL.createObjectURL(meta.coverBlob) : '' }
  }
  
  private async parseUrlBook(url: string) {
    const isHttp = /^https?:\/\//.test(url), isAbsolute = /^[a-zA-Z]:[\\\/]/.test(url) || url.startsWith('/')
    if (!isHttp && !isAbsolute && !url.includes('/') && !url.includes('\\')) throw new Error('请输入有效的链接或文件路径')
    
    const filePath = isAbsolute && !url.startsWith('file://') ? toFileUrl(url) : url
    const name = this.fileBaseName(url), format = this.getFormat(url)
    const meta = await this.extractMeta(await loadBookFile(filePath), format, name)
    
    return { filePath, name, format, meta }
  }
  
  async addAssetBook(assetPath: string, file: File) {
    await this.init()
    const format = this.getFormat(file.name), name = file.name.replace(/\.[^.]+$/, ''), url = `asset://${assetPath}`, meta = await this.extractMeta(file, format, name)
    await this.savePreparedBook({ url, path: assetPath, format, meta, name, cover: await saveOptionalCover(meta.coverBlob, url) })
  }
  
  // 对阅读器保留统一入口，底层实现已下沉到 bookStore。
  async loadFile(path: string): Promise<File> {
    return loadBookFile(path)
  }
  
  private buildMetadata = (meta: any) => ({ publisher: meta.publisher, publishDate: meta.published, language: meta.language, isbn: meta.identifier, description: meta.intro, series: meta.series })
  private getFormat = (path: string): BookFormat => { const ext = path.split('.').pop()?.toLowerCase() || ''; return ({ epub: 'epub', pdf: 'pdf', mobi: 'mobi', azw3: 'azw3', azw: 'azw3', txt: 'txt' } as Record<string, BookFormat>)[ext] || 'epub' }
  private async extractMeta(file: File, format: BookFormat, defaultName: string) {
    const def = { title: defaultName, author: '未知作者', publisher: undefined, published: undefined, language: undefined, identifier: undefined, intro: undefined, subjects: [], series: undefined, coverBlob: undefined, subtitle: undefined }
    if (!['epub', 'mobi', 'azw3', 'txt'].includes(format)) return def
    try {
      const view = document.createElement('foliate-view') as any
      const coverTask = (format === 'epub' || format === 'txt') ? this.extractCover(file).catch(() => undefined) : Promise.resolve(undefined)
      await Promise.race([view.open(file), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))])
      const { metadata = {} } = view.book || {}
      const norm = (v: any) => typeof v === 'string' ? v : (v?.['zh-CN'] || v?.['zh'] || v?.['en'] || Object.values(v || {})[0] || '')
      const arr = (v: any) => v ? (Array.isArray(v) ? v : [v]) : []
      const contrib = (v: any) => arr(v).map((c: any) => typeof c === 'string' ? c : norm(c?.name)).filter(Boolean).join(', ') || undefined
      const coverBlob = await coverTask
      view.remove()
      return {
        title: normalizeBookTitle(norm(metadata.title) || defaultName) || defaultName, subtitle: norm(metadata.subtitle), author: contrib(metadata.author) || '未知作者',
        publisher: contrib(metadata.publisher), published: metadata.published instanceof Date ? metadata.published.toISOString().split('T')[0] : metadata.published ? String(metadata.published) : undefined,
        language: arr(metadata.language)[0], identifier: arr(metadata.identifier)[0], intro: metadata.description,
        subjects: arr(metadata.subject).map((s: any) => typeof s === 'string' ? s : norm(s?.name)).filter(Boolean),
        series: Array.isArray(metadata.belongsTo) ? metadata.belongsTo[0] : metadata.belongsTo, coverBlob
      }
    } catch { return def }
  }
  
  private async extractCover(file: File): Promise<Blob | undefined> {
    try {
      const JSZip = (await import('jszip')).default, zip = await JSZip.loadAsync(file), container = await zip.file('META-INF/container.xml')?.async('text'), opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
      if (!opfPath) return;
      const opf = await zip.file(opfPath)?.async('text');
      if (!opf) return;
      const base = opfPath.replace(/[^/]+$/, ''), norm = (h: string) => (base + h).replace(/\/+/g, '/'), getBlob = async (h: string) => {
        return await zip.file(norm(h))?.async('blob')
      };
      let href = opf.match(/<item[^>]+properties="cover-image"[^>]+href="([^"]+)"/)?.[1] || opf.match(/<item[^>]+href="([^"]+)"[^>]+properties="cover-image"/)?.[1];
      if (href) return await getBlob(href);
      const item = opf.match(/<item[^>]+id="cover(-image)?"[^>]+href="([^"]+)"/i)?.[2];
      if (item) {
        if (/\.(xhtml|html)$/i.test(item)) {
          const html = await zip.file(norm(item))?.async('text')
          const img = html?.match(/<(?:img|image)[^>]+(?:src|(?:xlink:)?href)="([^"]+)"/i)?.[1]
          const bg = html?.match(/background(?:-image)?:\s*url\((['"]?)([^'")]+)\1\)/i)?.[2]
          const inlineSvg = html?.match(/<(?:image)[^>]+(?:xlink:href|href)=["']([^"']+)["']/i)?.[1]
          const coverRef = img || bg || inlineSvg
          if (coverRef) return await getBlob((item.replace(/[^/]+$/, '') + coverRef).replace(/^\.?\//, ''))
        }
        return await getBlob(item)
      }
      const id = opf.match(/<meta\s+name="cover"\s+content="([^"]+)"/i)?.[1];
      if (id && (href = opf.match(new RegExp(`<item[^>]+id="${id}"[^>]+href="([^"]+)"`, 'i'))?.[1])) return await getBlob(href);
      if (href = opf.match(/<item[^>]+href="([^"]+\.(?:jpg|jpeg|png|gif))"/i)?.[1]) return await getBlob(href);
      for (const n of ['cover.jpg', 'cover.jpeg', 'cover.png']) for (const p of [n, 'Images/' + n, 'images/' + n]) if (zip.file(norm(p))) return await getBlob(p);
    } catch {}
  }
}

export const bookshelfManager = new BookshelfManager();
export type { Book } from './database';

