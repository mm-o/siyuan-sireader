/**
 * 一次性数据迁移工具 - 将旧 JSON 数据迁移到 IndexedDB
 * 使用方法: 在控制台运行 window.migrateOldData()
 */

import { getDatabase, type Book } from '@/core/database';
import { getFile } from '@/api';

const STORAGE_PATH = {
  BOOKS: '/data/storage/petal/siyuan-sireader/books',
  INDEX: '/data/storage/petal/siyuan-sireader/index.json',
};

interface OldBookIndex {
  bookUrl: string;
  name: string;
  author: string;
  coverUrl?: string;
  durChapterIndex: number;
  totalChapterNum: number;
  durChapterTime: number;
  addTime: number;
  lastCheckCount: number;
  format: string;
  epubProgress?: number;
}

async function migrateOldBook(oldIndex: OldBookIndex): Promise<Book> {
  const hash = Math.abs(oldIndex.bookUrl.split('').reduce((h, c) => (((h << 5) - h) + c.charCodeAt(0)) | 0, 0)).toString(36);
  const sanitize = (n: string) => n.replace(/[<>:"/\\|?*\x00-\x1f《》【】「」『』（）()[\]{}]/g, '').replace(/\s+/g, '_').replace(/[._-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '').slice(0, 50) || 'book';
  const fileName = `${sanitize(oldIndex.name)}_${hash}.json`;
  
  let oldBook: any = {};
  try {
    oldBook = await getFile(`${STORAGE_PATH.BOOKS}/${fileName}`) || {};
  } catch {
    console.warn('[Migrate] Book file not found:', fileName);
  }
  
  const now = Date.now();
  const book: Book = {
    url: oldIndex.bookUrl,
    title: oldIndex.name || '未知书名',
    author: oldIndex.author || '未知作者',
    coverUrl: oldIndex.coverUrl,
    format: (oldIndex.format || 'epub') as any,
    filePath: oldBook.filePath,
    fileSize: oldBook.fileSize,
    addedAt: oldIndex.addTime || now,
    lastReadAt: oldIndex.durChapterTime || now,
    finishedAt: oldBook.finishedAt,
    status: oldIndex.epubProgress === 100 ? 'finished' : oldIndex.epubProgress > 0 ? 'reading' : 'unread',
    progress: oldIndex.epubProgress || 0,
    totalReadTime: oldBook.totalReadTime || 0,
    location: {
      chapter: oldIndex.durChapterIndex || 0,
      chapterTotal: oldIndex.totalChapterNum || 0,
      chapterTitle: oldBook.durChapterTitle,
      position: oldBook.durChapterPos,
      timestamp: oldIndex.durChapterTime || now,
      cfi: oldBook.epubCfi,
      page: oldBook.durChapterPage
    },
    source: oldBook.tocUrl ? {
      origin: oldBook.origin || 'unknown',
      bookUrl: oldIndex.bookUrl,
      tocUrl: oldBook.tocUrl,
      latestChapter: oldBook.latestChapterTitle,
      latestTime: oldBook.latestChapterTime,
      lastCheckTime: oldBook.lastCheckTime,
      updateCount: oldIndex.lastCheckCount || 0
    } : undefined,
    binding: oldBook.bindDocId ? {
      docId: oldBook.bindDocId,
      docName: oldBook.bindDocName || '',
      autoSync: oldBook.autoSync || false,
      syncDelete: oldBook.syncDelete || false
    } : undefined,
    tags: oldBook.tags || [],
    groups: oldBook.groups || [],
    rating: oldBook.rating,
    metadata: {
      publisher: oldBook.publisher,
      publishDate: oldBook.published,
      isbn: oldBook.identifier,
      language: oldBook.language,
      description: oldBook.intro,
      series: oldBook.series
    },
    toc: oldBook.toc || [],
    annotations: oldBook.annotations || []
  };
  
  return book;
}

export async function migrateOldData(): Promise<{ success: number; failed: number; errors: string[] }> {
  console.log('[Migrate] Starting migration...');
  
  try {
    const index = await getFile(STORAGE_PATH.INDEX) as OldBookIndex[];
    if (!Array.isArray(index) || index.length === 0) {
      console.log('[Migrate] No old data found');
      return { success: 0, failed: 0, errors: [] };
    }
    
    console.log(`[Migrate] Found ${index.length} books to migrate`);
    
    const db = await getDatabase();
    await db.init();
    
    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    
    for (const oldIndex of index) {
      try {
        const book = await migrateOldBook(oldIndex);
        await db.saveBook(book);
        success++;
        console.log(`[Migrate] ✓ ${book.title}`);
      } catch (error: any) {
        failed++;
        const msg = `${oldIndex.name}: ${error.message}`;
        errors.push(msg);
        console.error(`[Migrate] ✗ ${msg}`);
      }
    }
    
    console.log(`[Migrate] Complete: ${success} success, ${failed} failed`);
    return { success, failed, errors };
  } catch (error: any) {
    console.error('[Migrate] Failed:', error);
    throw error;
  }
}

// 暴露到全局
if (typeof window !== 'undefined') {
  (window as any).migrateOldData = migrateOldData;
}
