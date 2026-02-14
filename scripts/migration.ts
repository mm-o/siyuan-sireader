/**
 * 数据迁移工具
 * 将旧的书架数据迁移到新的数据库结构
 */

import { getDatabase, type Book } from './database';

/**
 * 迁移旧书籍数据到新结构
 */
export async function migrateOldBook(oldBook: any): Promise<Book> {
  const now = Date.now();
  
  const book: Book = {
    // 基础信息
    url: oldBook.bookUrl || oldBook.url,
    title: oldBook.name || oldBook.title || '未知书名',
    author: oldBook.author || '未知作者',
    coverUrl: oldBook.coverUrl,
    format: oldBook.format || 'epub',
    filePath: oldBook.filePath,
    fileSize: oldBook.fileSize,
    
    // 时间戳
    addedAt: oldBook.addTime || oldBook.addedAt || now,
    lastReadAt: oldBook.durChapterTime || oldBook.lastReadAt || now,
    finishedAt: oldBook.finishedAt,
    
    // 阅读状态
    status: determineStatus(oldBook),
    progress: oldBook.epubProgress || oldBook.progress || 0,
    totalReadTime: oldBook.totalReadTime || 0,
    
    // 位置信息
    location: {
      chapter: oldBook.durChapterIndex || 0,
      chapterTotal: oldBook.totalChapterNum || 0,
      chapterTitle: oldBook.durChapterTitle,
      position: oldBook.durChapterPos,
      timestamp: oldBook.durChapterTime || now,
      cfi: oldBook.epubCfi,
      page: oldBook.durChapterPage
    },
    
    // 书源信息（在线书籍）
    source: oldBook.tocUrl ? {
      origin: oldBook.origin || 'unknown',
      bookUrl: oldBook.bookUrl,
      tocUrl: oldBook.tocUrl,
      latestChapter: oldBook.latestChapterTitle,
      latestTime: oldBook.latestChapterTime,
      lastCheckTime: oldBook.lastCheckTime,
      updateCount: oldBook.lastCheckCount || 0
    } : undefined,
    
    // 思源绑定
    binding: oldBook.bindDocId ? {
      docId: oldBook.bindDocId,
      docName: oldBook.bindDocName || '',
      autoSync: oldBook.autoSync || false,
      syncDelete: oldBook.syncDelete || false
    } : undefined,
    
    // 分类与标签
    tags: oldBook.tags || [],
    groups: oldBook.groups || [],
    rating: oldBook.rating,
    
    // 元数据
    metadata: {
      publisher: oldBook.publisher || oldBook.metadata?.publisher,
      publishDate: oldBook.published || oldBook.metadata?.publishDate,
      isbn: oldBook.identifier || oldBook.metadata?.isbn,
      language: oldBook.language || oldBook.metadata?.language,
      description: oldBook.metadata?.description,
      pageCount: oldBook.metadata?.pageCount,
      wordCount: oldBook.metadata?.wordCount,
      series: oldBook.series || oldBook.metadata?.series,
      seriesIndex: oldBook.metadata?.seriesIndex
    },
    
    // 目录与标注
    toc: oldBook.toc || [],
    annotations: oldBook.annotations || []
  };
  
  return book;
}

/**
 * 根据旧数据判断阅读状态
 */
function determineStatus(oldBook: any): 'unread' | 'reading' | 'finished' {
  if (oldBook.status) return oldBook.status;
  
  const progress = oldBook.epubProgress || oldBook.progress || 0;
  
  if (progress === 0) return 'unread';
  if (progress >= 100) return 'finished';
  return 'reading';
}

/**
 * 批量迁移书籍
 */
export async function migrateAllBooks(oldBooks: any[]): Promise<{
  success: number;
  failed: number;
  errors: Array<{ book: any; error: string }>;
}> {
  const db = await getDatabase();
  let success = 0;
  let failed = 0;
  const errors: Array<{ book: any; error: string }> = [];
  
  for (const oldBook of oldBooks) {
    try {
      const newBook = await migrateOldBook(oldBook);
      await db.saveBook(newBook);
      success++;
    } catch (error: any) {
      failed++;
      errors.push({
        book: oldBook,
        error: error.message || String(error)
      });
      console.error('[Migration] Failed to migrate book:', oldBook.name || oldBook.title, error);
    }
  }
  
  return { success, failed, errors };
}

/**
 * 检查是否需要迁移
 */
export async function needsMigration(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const books = await db.getBooks();
    
    // 如果没有书籍，可能需要从旧系统迁移
    if (books.length === 0) {
      // 检查旧系统是否有数据
      const { bookshelfManager: oldManager } = await import('./_deprecated/bookshelf');
      await oldManager.init();
      const oldBooks = oldManager.getBooks();
      return oldBooks.length > 0;
    }
    
    return false;
  } catch (error) {
    console.error('[Migration] Failed to check migration status:', error);
    return false;
  }
}

/**
 * 执行自动迁移
 */
export async function autoMigrate(): Promise<boolean> {
  try {
    if (!await needsMigration()) {
      console.log('[Migration] No migration needed');
      return true;
    }
    
    console.log('[Migration] Starting auto migration...');
    
    const { bookshelfManager: oldManager } = await import('./_deprecated/bookshelf');
    await oldManager.init();
    const oldBooks = oldManager.getBooks();
    
    const result = await migrateAllBooks(oldBooks);
    
    console.log('[Migration] Migration completed:', result);
    
    if (result.failed > 0) {
      console.warn('[Migration] Some books failed to migrate:', result.errors);
    }
    
    return result.failed === 0;
  } catch (error) {
    console.error('[Migration] Auto migration failed:', error);
    return false;
  }
}
