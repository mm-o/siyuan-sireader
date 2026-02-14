/**
 * 书架管理系统 - Library Manager
 * 
 * 功能:
 * - 书籍的添加、删除、更新
 * - 书籍搜索和排序
 * - 阅读进度管理
 * - 分组与标签管理
 */

import { getDatabase, type Book, type BookFormat, type BookStatus, type GroupConfig } from './database';

// ========== 类型定义 ==========

export type SortType = 'time' | 'name' | 'author' | 'update' | 'progress' | 'rating' | 'readTime' | 'added';

export interface FilterOptions {
  query?: string;           // 搜索关键词
  status?: BookStatus[];    // 状态筛选
  rating?: number;          // 最低评分
  formats?: BookFormat[];   // 格式筛选
  tags?: string[];          // 标签筛选
  groups?: string[];        // 分组筛选
  hasUpdate?: boolean;      // 仅显示有更新
  hasBind?: boolean;        // 仅显示已绑定
  sortBy?: SortType;        // 排序方式
  reverse?: boolean;        // 反向排序
}

// ========== 书架管理器 ==========

/**
 * 书架管理器 - 使用统一数据库
 */
class LibraryManager {
  private initialized = false;
  private booksCache: Book[] = [];
  private cacheValid = false;
  
  async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const db = await getDatabase();
      await db.init();
      this.initialized = true;
      
      // 初始化时加载书籍到缓存
      await this.refreshCache();
      
      // 检查并执行自动迁移
      const { needsMigration, autoMigrate } = await import('./migration');
      if (await needsMigration()) {
        console.log('[LibraryManager] Migrating old data...');
        await autoMigrate();
        await this.refreshCache();
      }
      
      console.log('[LibraryManager] Initialized');
    } catch (error) {
      console.error('[LibraryManager] Failed to initialize:', error);
      throw error;
    }
  }
  
  /**
   * 刷新缓存
   */
  private async refreshCache(): Promise<void> {
    const db = await getDatabase();
    this.booksCache = await db.getBooks();
    this.cacheValid = true;
  }
  
  // ==================== 书籍管理 ====================
  
  /**
   * 添加书籍
   */
  async addBook(bookInfo: Partial<Book>): Promise<Book> {
    await this.init();
    
    if (!bookInfo.url) {
      throw new Error('书籍 URL 不能为空');
    }
    
    // 检查是否已存在
    const db = await getDatabase();
    const existing = await db.getBook(bookInfo.url);
    if (existing) {
      throw new Error('书籍已存在');
    }
    
    const now = Date.now();
    const book: Book = {
      url: bookInfo.url,
      title: bookInfo.title || '未知书名',
      author: bookInfo.author || '未知作者',
      coverUrl: bookInfo.coverUrl,
      format: bookInfo.format || 'epub',
      filePath: bookInfo.filePath,
      fileSize: bookInfo.fileSize,
      addedAt: now,
      lastReadAt: now,
      status: 'unread',
      progress: 0,
      totalReadTime: 0,
      location: {
        chapter: 0,
        chapterTotal: 0,
        timestamp: now
      },
      tags: [],
      groups: [],
      metadata: bookInfo.metadata || {},
      toc: bookInfo.toc || [],
      annotations: []
    };
    
    await db.saveBook(book);
    await this.refreshCache();
    
    window.dispatchEvent(new Event('sireader:bookshelf-updated'));
    
    return book;
  }
  
  /**
   * 删除书籍
   */
  async removeBook(url: string): Promise<boolean> {
    await this.init();
    
    try {
      const db = await getDatabase();
      await db.deleteBook(url);
      await this.refreshCache(); // 刷新缓存
      
      // 触发更新事件
      window.dispatchEvent(new Event('sireader:bookshelf-updated'));
      
      return true;
    } catch (error) {
      console.error('[LibraryManager] Failed to remove book:', error);
      return false;
    }
  }
  
  /**
   * 获取单本书籍
   */
  async getBook(url: string): Promise<Book | null> {
    await this.init();
    
    const db = await getDatabase();
    return await db.getBook(url);
  }
  
  /**
   * 获取所有书籍（异步）
   */
  async getBooksAsync(): Promise<Book[]> {
    await this.init();
    await this.refreshCache();
    return this.booksCache;
  }
  
  /**
   * 获取所有书籍（同步，向后兼容）
   * 返回缓存的书籍列表，转换为 BookIndex 格式以兼容旧 UI
   */
  getBooks(): any[] {
    if (!this.cacheValid) {
      console.warn('[LibraryManager] Cache not valid, returning empty array. Call init() first.');
      return [];
    }
    
    // 转换为 BookIndex 格式以兼容旧 UI
    return this.booksCache.map(book => ({
      bookUrl: book.url,
      name: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      durChapterIndex: book.location.chapter,
      totalChapterNum: book.location.chapterTotal,
      durChapterTime: book.location.timestamp,
      addTime: book.addedAt,
      lastCheckCount: book.source?.updateCount || 0,
      format: book.format,
      epubProgress: book.progress
    }));
  }
  
  /**
   * 筛选和搜索书籍
   */
  async filterBooks(options: FilterOptions = {}): Promise<Book[]> {
    await this.init();
    
    let books = await this.getBooksAsync();
    
    // 搜索关键词
    if (options.query) {
      const q = options.query.toLowerCase();
      books = books.filter(b => 
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    
    // 状态筛选
    if (options.status?.length) {
      books = books.filter(b => options.status!.includes(b.status));
    }
    
    // 评分筛选
    if (options.rating) {
      books = books.filter(b => (b.rating || 0) >= options.rating!);
    }
    
    // 格式筛选
    if (options.formats?.length) {
      books = books.filter(b => options.formats!.includes(b.format));
    }
    
    // 标签筛选
    if (options.tags?.length) {
      books = books.filter(b => options.tags!.some(t => b.tags.includes(t)));
    }
    
    // 分组筛选
    if (options.groups?.length) {
      books = books.filter(b => options.groups!.some(g => b.groups.includes(g)));
    }
    
    // 更新筛选
    if (options.hasUpdate) {
      books = books.filter(b => b.source && b.source.updateCount > 0);
    }
    
    // 绑定筛选
    if (options.hasBind) {
      books = books.filter(b => !!b.binding);
    }
    
    // 排序
    const sortBy = options.sortBy || 'time';
    books.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.title.localeCompare(b.title, 'zh-CN');
        case 'author':
          return a.author.localeCompare(b.author, 'zh-CN');
        case 'time':
          return b.lastReadAt - a.lastReadAt;
        case 'added':
          return b.addedAt - a.addedAt;
        case 'update':
          return (b.source?.latestTime || 0) - (a.source?.latestTime || 0);
        case 'progress':
          return b.progress - a.progress;
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'readTime':
          return b.totalReadTime - a.totalReadTime;
        default:
          return 0;
      }
    });
    
    // 反向排序
    if (options.reverse) {
      books.reverse();
    }
    
    return books;
  }
  
  /**
   * 更新书籍信息
   */
  async updateBook(url: string, updates: Partial<Book>): Promise<boolean> {
    await this.init();
    
    try {
      const db = await getDatabase();
      const book = await db.getBook(url);
      
      if (!book) {
        console.warn('[LibraryManager] Book not found:', url);
        return false;
      }
      
      const updatedBook = { ...book, ...updates };
      await db.saveBook(updatedBook);
      await this.refreshCache(); // 刷新缓存
      
      // 触发更新事件
      window.dispatchEvent(new Event('sireader:bookshelf-updated'));
      
      return true;
    } catch (error) {
      console.error('[LibraryManager] Failed to update book:', error);
      return false;
    }
  }
  
  /**
   * 更新阅读进度
   */
  async updateProgress(url: string, progress: number, chapter?: number): Promise<boolean> {
    await this.init();
    
    try {
      const book = await this.getBook(url);
      if (!book) return false;
      
      const updates: Partial<Book> = {
        progress: Math.max(0, Math.min(100, progress)),
        lastReadAt: Date.now(),
        location: {
          ...book.location,
          chapter: chapter ?? book.location.chapter,
          timestamp: Date.now()
        }
      };
      
      // 自动更新状态
      if (progress === 0 && book.status === 'unread') {
        updates.status = 'unread';
      } else if (progress > 0 && progress < 100) {
        updates.status = 'reading';
      } else if (progress === 100) {
        updates.status = 'finished';
        updates.finishedAt = Date.now();
      }
      
      return await this.updateBook(url, updates);
    } catch (error) {
      console.error('[LibraryManager] Failed to update progress:', error);
      return false;
    }
  }
  
  /**
   * 更新书籍评分
   */
  async updateRating(url: string, rating: number): Promise<boolean> {
    return await this.updateBook(url, { 
      rating: Math.max(1, Math.min(5, rating)) 
    });
  }
  
  /**
   * 更新书籍状态
   */
  async updateStatus(url: string, status: BookStatus): Promise<boolean> {
    const updates: Partial<Book> = { status };
    if (status === 'finished') {
      updates.finishedAt = Date.now();
      updates.progress = 100;
    }
    return await this.updateBook(url, updates);
  }
  
  /**
   * 添加标签
   */
  async addTag(url: string, tag: string): Promise<boolean> {
    const book = await this.getBook(url);
    if (!book || book.tags.includes(tag)) return false;
    return await this.updateBook(url, { 
      tags: [...book.tags, tag] 
    });
  }
  
  /**
   * 移除标签
   */
  async removeTag(url: string, tag: string): Promise<boolean> {
    const book = await this.getBook(url);
    if (!book) return false;
    return await this.updateBook(url, { 
      tags: book.tags.filter(t => t !== tag) 
    });
  }
  
  /**
   * 添加到分组
   */
  async addToGroup(url: string, groupId: string): Promise<boolean> {
    const book = await this.getBook(url);
    if (!book || book.groups.includes(groupId)) return false;
    return await this.updateBook(url, { 
      groups: [...book.groups, groupId] 
    });
  }
  
  /**
   * 从分组移除
   */
  async removeFromGroup(url: string, groupId: string): Promise<boolean> {
    const book = await this.getBook(url);
    if (!book) return false;
    return await this.updateBook(url, { 
      groups: book.groups.filter(g => g !== groupId) 
    });
  }
  
  /**
   * 获取所有标签
   */
  async getAllTags(): Promise<Array<{ tag: string; count: number }>> {
    const books = await this.getBooksAsync();
    const tagMap = new Map<string, number>();
    
    books.forEach(book => {
      book.tags.forEach(tag => {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      });
    });
    
    return Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }
  
  /**
   * 获取分组配置
   */
  async getGroups(): Promise<GroupConfig[]> {
    const db = await getDatabase();
    return await db.getGroups();
  }
  
  /**
   * 保存分组配置
   */
  async saveGroups(groups: GroupConfig[]): Promise<void> {
    const db = await getDatabase();
    await db.saveGroups(groups);
  }
  
  /**
   * 计算智能分组
   */
  async getSmartGroupBooks(groupId: string): Promise<Book[]> {
    const groups = await this.getGroups();
    const group = groups.find(g => g.id === groupId);
    if (!group || group.type !== 'smart' || !group.rules) return [];
    
    const books = await this.getBooksAsync();
    const { tags, format, status, rating } = group.rules;
    
    return books.filter(book => {
      if (tags?.length && !tags.some(t => book.tags.includes(t))) return false;
      if (format?.length && !format.includes(book.format)) return false;
      if (status?.length && !status.includes(book.status)) return false;
      if (rating && (book.rating || 0) < rating) return false;
      return true;
    });
  }
  
  /**
   * 获取最近阅读的书籍
   */
  async getRecentBooks(limit: number = 10): Promise<Book[]> {
    await this.init();
    
    const books = await this.getBooksAsync();
    return books
      .sort((a, b) => b.lastReadAt - a.lastReadAt)
      .slice(0, limit);
  }
  
  /**
   * 获取按格式分组的书籍数量
   */
  async getBookCountByFormat(): Promise<Record<string, number>> {
    await this.init();
    
    const books = await this.getBooksAsync();
    const counts: Record<string, number> = {};
    
    for (const book of books) {
      const format = book.format || 'unknown';
      counts[format] = (counts[format] || 0) + 1;
    }
    
    return counts;
  }
  
  /**
   * 清理数据库
   */
  async cleanup(): Promise<void> {
    console.log('[LibraryManager] Cleanup completed');
  }
  
  // ==================== 向后兼容方法 ====================
  
  /**
   * 添加本地书籍文件（向后兼容）
   * 委托给旧的实现
   */
  async addLocalBook(file: File): Promise<void> {
    // 导入旧的实现
    const { bookshelfManager: oldManager } = await import('./_deprecated/bookshelf');
    await oldManager.init();
    await oldManager.addLocalBook(file);
    
    // 刷新缓存
    await this.refreshCache();
  }
  
  /**
   * 添加文档资源书籍（向后兼容）
   * 委托给旧的实现
   */
  async addAssetBook(assetPath: string, file: File): Promise<void> {
    // 导入旧的实现
    const { bookshelfManager: oldManager } = await import('./_deprecated/bookshelf');
    await oldManager.init();
    await oldManager.addAssetBook(assetPath, file);
    
    // 刷新缓存
    await this.refreshCache();
  }
  
  /**
   * 检查书籍是否存在（向后兼容）
   */
  hasBook(bookUrl: string): boolean {
    return this.booksCache.some(b => b.url === bookUrl);
  }
}

// ========== 导出 ==========

export const libraryManager = new LibraryManager();
export const library = libraryManager;

// 向后兼容：bookshelfManager 别名
export const bookshelfManager = libraryManager;

// 向后兼容：初始化函数
export const initBookDataPlugin = (_p: any) => {
  libraryManager.init();
};

// 向后兼容：加载书籍数据
export const loadBookData = async (bookUrl: string) => 
  await libraryManager.getBook(bookUrl) || {};

export type { Book, BookFormat };
