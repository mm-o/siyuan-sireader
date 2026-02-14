/**
 * 书架管理 - 极简架构
 */
import { reactive } from 'vue';
import { getDatabase } from './database';

export type BookFormat = 'pdf' | 'epub' | 'txt' | 'mobi' | 'azw3';
export type BookStatus = 'unread' | 'reading' | 'finished';
export interface GroupConfig { id: string; name: string; icon?: string; color?: string; parentId?: string; order: number; type: 'folder' | 'smart'; rules?: { tags?: string[]; format?: BookFormat[]; status?: BookStatus[]; rating?: number } }
export type SortType = 'time' | 'name' | 'author' | 'update' | 'progress' | 'rating' | 'readTime' | 'added';
export interface FilterOptions { query?: string; status?: BookStatus[]; rating?: number; formats?: BookFormat[]; tags?: string[]; groups?: string[]; hasUpdate?: boolean; sortBy?: SortType; reverse?: boolean }
export interface BookStats { total: number; byStatus: Record<BookStatus, number>; byFormat: Record<BookFormat, number>; withUpdate: number }

// ===== 常量 =====
export const SORTS = [['time','最近阅读'],['added','最近添加'],['progress','阅读进度'],['rating','评分'],['readTime','阅读时长'],['name','书名'],['author','作者'],['update','最近更新']] as const;
export const STATUS_OPTIONS = [['unread','未读'],['reading','在读'],['finished','已读']] as const;
export const STATUS_MAP: Record<BookStatus,string> = {unread:'未读',reading:'在读',finished:'已读'};
export const RATING_OPTIONS = [[0,'☆☆☆☆☆ 全部'],[5,'★★★★★ 仅5星'],[4,'★★★★☆ 4星及以上'],[3,'★★★☆☆ 3星及以上']] as const;
export const FORMAT_OPTIONS: BookFormat[] = ['epub','pdf','mobi','azw3','txt'];

class BookshelfManager {
  private ready = false;
  private coverCache = reactive<Record<string, string | null>>({});
  
  async init() { if (this.ready) return; await (await getDatabase()).init(); this.ready = true; }
  async getBooks() { await this.init(); return (await getDatabase()).getBooks(); }
  async getBook(url: string) { await this.init(); return (await getDatabase()).getBook(url); }
  
  async addBook(info: any) {
    await this.init();
    if (!info.url) throw new Error('URL required');
    const db = await getDatabase();
    if (await db.getBook(info.url)) throw new Error('已存在');
    const now = Date.now(), toc = info.toc || [], total = toc.length;
    await db.saveBook({ url: info.url, title: info.title || '未知', author: info.author || '未知', cover: info.cover || '', format: info.format || 'epub', path: info.path || '', size: info.size || 0, added: now, read: now, finished: 0, status: info.status || 'unread', progress: info.progress || 0, time: 0, chapter: 0, total, pos: info.location || {}, source: info.source || {}, rating: info.rating || 5, meta: info.metadata || {}, tags: info.tags || [], groups: info.groups || [], toc, bindDocId: '', bindDocName: '', autoSync: false, syncDelete: false });
    this.notify();
  }

  async updateBook(url: string, updates: any) { 
    await this.init(); 
    const book = await (await getDatabase()).getBook(url); 
    if (!book) return false; 
    await (await getDatabase()).saveBook({ ...book, ...updates }); 
    this.notify(); 
    return true; 
  }
  async removeBook(url: string) { 
    await this.init(); 
    const book = await this.getBook(url); 
    if (!book) return false; 
    await (await getDatabase()).deleteBook(url); 
    if (book.path?.startsWith('/data/')) { 
      const { removeFile } = await import('@/api'); 
      await Promise.all([removeFile(book.path).catch(() => {}), book.cover?.startsWith('/data/') ? removeFile(book.cover).catch(() => {}) : Promise.resolve()]); 
    } 
    this.notify(); 
    return true; 
  }
  
  removeBooks = async (urls: string[]) => this.batch(urls, url => this.removeBook(url));
  
  async filterBooks(opt: FilterOptions = {}) {
    await this.init();
    const { query, groups, ...dbOpt } = opt;
    let books = await (await getDatabase()).filterBooks(dbOpt);
    if (query) { const q = query.toLowerCase(); books = books.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)); }
    if (groups?.length) books = books.filter(b => groups.some((g: string) => b.groups?.includes(g)));
    return books;
  }
  
  async getStats(): Promise<BookStats> { 
    await this.init();
    const dbStats = await (await getDatabase()).getStats();
    return { total: (await this.getBooks()).length, ...dbStats };
  }
  
  // ===== 进度管理 =====
  // 更新阅读进度：保存进度百分比、章节、位置信息
  async updateProgress(url:string,progress:number,chapter?:number,cfi?:string){
    const book=await this.getBook(url);if(!book)return false
    const p=Math.max(0,Math.min(100,progress)),now=Date.now(),status=p===0?'unread':p===100?'finished':'reading' // 限制进度范围并计算状态
    return this.updateBook(url,{progress:p,status,read:now,pos:{...book.pos,chapter:chapter??book.pos.chapter,timestamp:now,cfi},...(chapter!==undefined&&{chapter}),...(p===100&&{finished:now})})
  }
  
  // 自动更新进度：根据 reader/pdfViewer 自动获取当前位置并更新
  async updateProgressAuto(url:string,reader?:any,pdfViewer?:any){
    try{
      if(pdfViewer){const p=pdfViewer.getCurrentPage()||1,t=pdfViewer.getPageCount()||1;await this.updateProgress(url,Math.round((p/t)*100),p,`#page-${p}`)} // PDF: 页码/总页数
      else if(reader){const loc=reader.getLocation?.();if(loc?.fraction!==undefined)await this.updateProgress(url,Math.round(loc.fraction*100),loc.index,loc.cfi)} // EPUB: fraction/index/cfi
    }catch(e){console.error('[Progress]',e)}
  }
  
  // 恢复阅读进度：跳转到上次阅读位置
  async restoreProgress(url:string,reader?:any,pdfViewer?:any){
    try{
      const book=await this.getBook(url);if(!book)return
      if(pdfViewer){const page=book.chapter||0,total=pdfViewer.getPageCount();if(page>=1&&page<=total)pdfViewer.goToPage(page);else if(book.pos?.cfi?.startsWith('#page-')){const p=parseInt(book.pos.cfi.replace('#page-',''));if(p>=1&&p<=total)pdfViewer.goToPage(p)}} // PDF: 跳转到页码
      else if(reader){if(book.pos?.cfi)await reader.goTo(book.pos.cfi);else if(book.chapter!==undefined)await reader.goTo(book.chapter)} // EPUB: 跳转到 CFI 或章节
    }catch(e){console.error('[Restore]',e)}
  }
  
  updateRating=async(url:string,rating:number)=>this.updateBook(url,{rating:rating?Math.max(1,Math.min(5,rating)):undefined}) // 更新评分(1-5星)
  updateStatus=async(url:string,status:BookStatus)=>this.updateBook(url,{status,...(status==='finished'&&{finished:Date.now(),progress:100})}) // 更新状态(未读/在读/已读)
  updateReadTime=async(url:string,seconds:number)=>{const book=await this.getBook(url);return book?this.updateBook(url,{time:(book.time||0)+seconds}):false} // 累加阅读时长
  
  // ===== 标签管理 =====
  manageTags = async (url: string, action: 'add' | 'remove' | 'set', data: string | string[]) => {
    const tags = (await this.getBook(url))?.tags || [];
    if (action === 'set') return this.updateBook(url, { tags: data as string[] });
    if (action === 'add') return tags.includes(data as string) ? false : this.updateBook(url, { tags: [...tags, data as string] });
    return this.updateBook(url, { tags: tags.filter(t => t !== data) });
  }
  
  getAllTags = async () => (await getDatabase()).getAllTags()
  
  // ===== 分组管理 =====
  getGroups = async () => { await this.init(); return (await getDatabase()).getGroups() }
  saveGroups = async (groups: GroupConfig[]) => { await this.init(); await (await getDatabase()).saveGroups(groups); this.notify() }
  createGroup = async (name: string, type: 'folder' | 'smart' = 'folder', icon?: string) => { 
    const groups = await this.getGroups(); 
    const newGroup: GroupConfig = { id: `group_${Date.now()}`, name, icon: icon || (type === 'folder' ? '📁' : '⚡'), order: groups.length, type }; 
    await this.saveGroups([...groups, newGroup]); 
    return newGroup; 
  }
  async deleteGroup(gid: string) { 
    await this.init();
    await (await getDatabase()).deleteGroup(gid);
    this.notify();
    return true;
  }
  
  manageGroup = async (url: string, gid: string, action: 'add' | 'remove') => {
    const groups = (await this.getBook(url))?.groups || [];
    if (action === 'add') return groups.includes(gid) ? false : this.updateBook(url, { groups: [...groups, gid] });
    return this.updateBook(url, { groups: groups.filter(g => g !== gid) });
  }
  
  addBooksToGroup = async (urls: string[], gid: string) => this.batch(urls, url => this.manageGroup(url, gid, 'add'))
  getGroupCount = async (gid: string) => {
    await this.init();
    const group = (await this.getGroups()).find(g => g.id === gid);
    if (!group) return 0;
    if (group.type === 'smart') return (await this.getGroupBooks(gid)).length;
    return (await getDatabase()).getGroupCount(gid);
  }
  getGroupPreviewBooks = async (gid: string, limit = 4) => {
    await this.init();
    const group = (await this.getGroups()).find(g => g.id === gid);
    if (!group) return [];
    if (group.type === 'smart') return (await this.getGroupBooks(gid)).slice(0, limit);
    return (await getDatabase()).getGroupPreviewBooks(gid, limit);
  }
  async getGroupBooks(gid: string) { 
    const group = (await this.getGroups()).find(g => g.id === gid); 
    if (!group) return []; 
    const books = await this.getBooks(); 
    if (group.type === 'folder') return books.filter(b => b.groups?.includes(gid)); 
    if (group.type === 'smart' && group.rules) { 
      const { tags = [], format = [], status = [], rating = 0 } = group.rules; 
      return books.filter(b => 
        (!tags.length || tags.some(t => b.tags?.includes(t))) && 
        (!format.length || format.includes(b.format)) && 
        (!status.length || status.includes(b.status)) && 
        (!rating || (b.rating || 0) >= rating)
      ); 
    } 
    return []; 
  }
  
  // 批量操作
  private batch = async <T>(items: T[], op: (item: T) => Promise<boolean>) => { 
    const results = await Promise.allSettled(items.map(op)), success = results.filter(r => r.status === 'fulfilled' && r.value).length; 
    return { success, failed: items.length - success }; 
  }
  
  batchUpdateRating = async (urls: string[], rating: number) => this.batch(urls, url => this.updateRating(url, rating))
  batchUpdateStatus = async (urls: string[], status: BookStatus) => this.batch(urls, url => this.updateStatus(url, status))
  
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
    if (book.cover.startsWith('/data/')) {
      if (!this.coverCache[book.cover]) this.loadCover(book.cover);
      return this.coverCache[book.cover] || '';
    }
    return book.cover;
  }
  
  private async loadCover(path: string) {
    try {
      const res = await fetch('/api/file/getFile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
      if (!res.ok) throw new Error();
      this.coverCache[path] = URL.createObjectURL(await res.blob());
    } catch {
      this.coverCache[path] = null;
    }
  }
  
  // ===== 书籍操作 =====
  async moveBookToGroup(url: string, targetGroupId: string | null) {
    const book = await this.getBook(url);
    if (!book) return false;
    const newGroups = targetGroupId ? [targetGroupId] : [];
    return this.updateBook(url, { groups: newGroups });
  }
  
  async uploadBooks(files: File[]) {
    const results = await Promise.allSettled(files.map(f => this.addLocalBook(f)));
    const success = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - success;
    return { success, failed };
  }
  
  async updateBookInfo(url: string, formData: { title: string; author: string; tags: string; rating: number; status: BookStatus; cover: string; groups: string[]; bindDocId?: string; bindDocName?: string; autoSync?: boolean; syncDelete?: boolean }) {
    const book = await this.getBook(url);
    if (!book || !formData.title.trim()) return { success: false, error: '书名不能为空' };
    const tags = formData.tags.split(/[,，]/).map(t => t.trim()).filter(t => t);
    await this.updateBook(url, {
      title: formData.title.trim(),
      author: formData.author.trim(),
      tags,
      rating: formData.rating || undefined,
      status: formData.status,
      cover: formData.cover.trim() || '',
      groups: formData.groups,
      bindDocId: formData.bindDocId || '',
      bindDocName: formData.bindDocName || '',
      autoSync: formData.autoSync || false,
      syncDelete: formData.syncDelete || false
    });
    return { success: true };
  }
  
  // 导入
  async addLocalBook(file: File) {
    await this.init();
    const format = this.getFormat(file.name), name = file.name.replace(/\.[^.]+$/, ''), url = `${format}://${file.name}_${file.size}`;
    const meta = await this.extractMeta(file, format, name);
    const [path, cover] = await Promise.all([this.saveFile(file, meta.title || name, url), meta.coverBlob ? this.saveCover(meta.coverBlob, meta.title || name, url) : Promise.resolve(undefined)]);
    await this.addBook({ url, title: meta.title || name, author: meta.author || '未知作者', cover, format, path, size: file.size, metadata: { publisher: meta.publisher, publishDate: meta.published, language: meta.language, isbn: meta.identifier, description: meta.intro, series: meta.series }, toc: meta.chapters || [] });
  }
  
  async addAssetBook(assetPath: string, file: File) {
    await this.init();
    const format = this.getFormat(file.name), name = file.name.replace(/\.[^.]+$/, ''), url = `asset://${assetPath}`;
    const meta = await this.extractMeta(file, format, name);
    await this.addBook({ url, title: meta.title || name, author: meta.author || '未知作者', cover: meta.coverBlob ? await this.saveCover(meta.coverBlob, meta.title || name, url) : undefined, format, path: assetPath, metadata: { publisher: meta.publisher, publishDate: meta.published, language: meta.language, isbn: meta.identifier, description: meta.intro, series: meta.series }, toc: meta.chapters || [] });
  }
  
  private getFormat = (path: string): BookFormat => { const ext = path.split('.').pop()?.toLowerCase() || ''; return ({ epub: 'epub', pdf: 'pdf', mobi: 'mobi', azw3: 'azw3', azw: 'azw3', txt: 'txt' } as Record<string, BookFormat>)[ext] || 'epub'; };
  
  private async extractMeta(file: File, format: BookFormat, defaultName: string) {
    const def = { title: defaultName, author: '未知作者', chapters: [], publisher: undefined, published: undefined, language: undefined, identifier: undefined, intro: undefined, subjects: [], series: undefined, coverBlob: undefined, subtitle: undefined };
    if (!['epub', 'mobi', 'azw3'].includes(format)) return def;
    try {
      const view = document.createElement('foliate-view') as any;
      await Promise.race([view.open(file), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))]);
      const { metadata = {}, toc = [] } = view.book || {};
      const norm = (v: any) => typeof v === 'string' ? v : (v?.['zh-CN'] || v?.['zh'] || v?.['en'] || Object.values(v || {})[0] || '');
      const arr = (v: any) => v ? (Array.isArray(v) ? v : [v]) : [];
      const contrib = (v: any) => arr(v).map((c: any) => typeof c === 'string' ? c : norm(c?.name)).filter(Boolean).join(', ') || undefined;
      const convertToc = (items: any[]): any[] => Array.isArray(items) ? items.map((t: any) => ({ label: norm(t.label) || '', href: t.href || '', subitems: t.subitems ? convertToc(t.subitems) : [] })).filter((c: any) => c.label || c.href) : [];
      const [chapters, coverBlob] = await Promise.all([Promise.resolve(convertToc(toc)), format === 'epub' ? this.extractCover(file).catch(() => undefined) : undefined]);
      view.remove();
      return { title: norm(metadata.title) || defaultName, subtitle: norm(metadata.subtitle), author: contrib(metadata.author) || '未知作者', publisher: contrib(metadata.publisher), published: metadata.published instanceof Date ? metadata.published.toISOString().split('T')[0] : metadata.published ? String(metadata.published) : undefined, language: arr(metadata.language)[0], identifier: arr(metadata.identifier)[0], intro: metadata.description, subjects: arr(metadata.subject).map((s: any) => typeof s === 'string' ? s : norm(s?.name)).filter(Boolean), series: Array.isArray(metadata.belongsTo) ? metadata.belongsTo[0] : metadata.belongsTo, coverBlob, chapters };
    } catch { return def; }
  }
  
  private async extractCover(file: File): Promise<Blob | undefined> {
    try {
      const JSZip = (await import('jszip')).default, zip = await JSZip.loadAsync(file), container = await zip.file('META-INF/container.xml')?.async('text'), opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
      if (!opfPath) return;
      const opf = await zip.file(opfPath)?.async('text');
      if (!opf) return;
      const base = opfPath.replace(/[^/]+$/, ''), norm = (h: string) => (base + h).replace(/\/+/g, '/'), getBlob = async (h: string) => await zip.file(norm(h))?.async('blob');
      let href = opf.match(/<item[^>]+properties="cover-image"[^>]+href="([^"]+)"/)?.[1] || opf.match(/<item[^>]+href="([^"]+)"[^>]+properties="cover-image"/)?.[1];
      if (href) return await getBlob(href);
      const item = opf.match(/<item[^>]+id="cover(-image)?"[^>]+href="([^"]+)"/i)?.[2];
      if (item) { if (/\.(xhtml|html)$/i.test(item)) { const html = await zip.file(norm(item))?.async('text'), img = html?.match(/<(?:img|image)[^>]+(?:src|(?:xlink:)?href)="([^"]+)"/i)?.[1]; if (img) return await getBlob((item.replace(/[^/]+$/, '') + img).replace(/^\.?\//, '')); } return await getBlob(item); }
      const id = opf.match(/<meta\s+name="cover"\s+content="([^"]+)"/i)?.[1];
      if (id && (href = opf.match(new RegExp(`<item[^>]+id="${id}"[^>]+href="([^"]+)"`, 'i'))?.[1])) return await getBlob(href);
      if (href = opf.match(/<item[^>]+href="([^"]+\.(?:jpg|jpeg|png|gif))"/i)?.[1]) return await getBlob(href);
      for (const n of ['cover.jpg', 'cover.jpeg', 'cover.png']) for (const p of [n, 'Images/' + n, 'images/' + n]) if (zip.file(norm(p))) return await getBlob(p);
    } catch {}
  }
  
  private async saveFile(file: File, title: string, url: string) { const { putFile } = await import('@/api'), hash = this.hash(url), name = this.sanitize(title), ext = file.name.split('.').pop(); const path = `/data/storage/petal/siyuan-sireader/books/${name}_${hash}.${ext}`; try { await putFile(path, false, file); return path; } catch (err) { throw new Error(`文件保存失败: ${err instanceof Error ? err.message : '未知错误'}`); } }
  private async saveCover(blob: Blob, title: string, url: string) { const { putFile } = await import('@/api'), hash = this.hash(url), name = this.sanitize(title), fileName = `${name}_${hash}.jpg`; const path = `/data/storage/petal/siyuan-sireader/books/${fileName}`; try { await putFile(path, false, new File([blob], fileName, { type: 'image/jpeg' })); return path; } catch (err) { return ''; } }
  private hash = (str: string): string => { let h = 0; for (let i = 0; i < str.length; i++) h = (((h << 5) - h) + str.charCodeAt(i)) | 0; return Math.abs(h).toString(36); };
  private sanitize = (name: string): string => name.replace(/[<>:"/\\|?*\x00-\x1f《》【】「」『』（）()[\]{}]/g, '').replace(/\s+/g, '_').replace(/[._-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '').slice(0, 50) || 'book';
}

export const bookshelfManager = new BookshelfManager();
export type { Book } from './database';
