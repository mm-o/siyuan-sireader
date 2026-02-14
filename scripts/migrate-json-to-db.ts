/**
 * JSON 数据迁移脚本
 * 
 * 将旧的 JSON 文件数据迁移到 IndexedDB
 * 
 * 使用方法：
 * 1. 打开思源笔记
 * 2. 打开浏览器开发者工具（F12）
 * 3. 在控制台执行: migrateJSONToDatabase()
 */

import { getDatabase, type Book, type Annotation, type BookFormat } from '../src/core/database';

/** 迁移主函数 */
async function migrateJSONToDatabase() {
  console.log('='.repeat(60));
  console.log('📦 开始迁移 JSON 数据到 IndexedDB');
  console.log('='.repeat(60));
  
  try {
    const db = await getDatabase();
    
    // 读取书架索引
    const response = await fetch('/api/file/getFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/data/storage/petal/siyuan-sireader/index.json' })
    });
    
    if (!response.ok) {
      console.log('❌ 未找到书架数据');
      return;
    }
    
    const indexData = await response.json();
    if (!Array.isArray(indexData)) {
      console.log('❌ 书架数据格式错误');
      return;
    }
    
    console.log(`\n📚 找到 ${indexData.length} 本书籍`);
    
    let successCount = 0;
    let failCount = 0;
    
    // 迁移每本书
    for (const bookIndex of indexData) {
      try {
        const bookResponse = await fetch('/api/file/getFile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            path: `/data/storage/petal/siyuan-sireader/books/${getBookFileName(bookIndex)}` 
          })
        });
        
        if (!bookResponse.ok) {
          failCount++;
          continue;
        }
        
        const bookData = await bookResponse.json();
        
        // 转换标注
        const annotations: Annotation[] = [];
        
        // 高亮和笔记
        if (bookData.annotations) {
          for (const mark of bookData.annotations) {
            annotations.push({
              id: mark.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              type: mark.note ? 'note' : 'highlight',
              location: mark.cfi || mark.value || `page-${mark.page}` || `section-${mark.section}`,
              text: mark.text,
              note: mark.note,
              color: mark.color || '#ffeb3b',
              createdAt: mark.timestamp || Date.now(),
              updatedAt: mark.timestamp || Date.now(),
              page: mark.page,
              rects: mark.rects,
              cfi: mark.cfi || mark.value,
              style: mark.style,
              chapter: mark.chapter,
              blockId: mark.blockId
            });
          }
        }
        
        // EPUB 书签
        if (bookData.epubBookmarks) {
          for (const bm of bookData.epubBookmarks) {
            annotations.push({
              id: `bookmark-${bm.cfi}-${bm.time}`,
              type: 'bookmark',
              location: bm.cfi,
              text: bm.title,
              color: '#2196f3',
              createdAt: bm.time || Date.now(),
              updatedAt: bm.time || Date.now(),
              cfi: bm.cfi
            });
          }
        }
        
        // TXT 书签
        if (bookData.txtBookmarks) {
          for (const bm of bookData.txtBookmarks) {
            annotations.push({
              id: `bookmark-section-${bm.section}-${bm.time}`,
              type: 'bookmark',
              location: `section-${bm.section}`,
              text: bm.title,
              color: '#2196f3',
              createdAt: bm.time || Date.now(),
              updatedAt: bm.time || Date.now()
            });
          }
        }
        
        // 创建书籍对象
        const book: Book = {
          url: bookData.bookUrl || bookIndex.bookUrl,
          title: bookData.name || bookIndex.name,
          author: bookData.author || bookIndex.author || '未知作者',
          coverUrl: bookIndex.coverUrl,
          format: (bookData.format || bookIndex.format || 'epub') as BookFormat,
          
          addedAt: bookData.addTime || Date.now(),
          lastReadAt: bookData.durChapterTime || bookIndex.durChapterTime || Date.now(),
          finishedAt: (bookData.epubProgress || 0) >= 100 ? Date.now() : undefined,
          
          status: (bookData.epubProgress || 0) >= 100 ? 'finished' 
                : (bookData.epubProgress || 0) > 0 ? 'reading' : 'unread',
          progress: bookData.epubProgress || bookIndex.epubProgress || 0,
          currentLocation: getBookLocation(bookData),
          
          totalReadTime: 0,
          
          tags: [],
          groups: ['default'],
          
          filePath: bookData.filePath,
          fileSize: undefined,
          
          metadata: {
            publisher: bookData.publisher,
            publishDate: bookData.published,
            isbn: bookData.identifier,
            language: bookData.language,
            description: bookData.intro,
            pageCount: bookData.totalChapterNum
          },
          
          toc: undefined,
          annotations
        };
        
        await db.saveBook(book);
        successCount++;
        console.log(`✅ ${successCount}/${indexData.length} ${book.title}`);
        
      } catch (error) {
        failCount++;
        console.warn(`❌ 迁移失败: ${bookIndex.name}`, error);
      }
    }
    
    // 初始化默认分组
    await db.saveGroups([
      { id: 'default', name: '默认分组', icon: '📚', color: '#2196f3', order: 0, type: 'folder' },
      { id: 'reading', name: '正在阅读', icon: '📖', color: '#4caf50', order: 1, type: 'smart', 
        rules: { status: ['reading'] } },
      { id: 'finished', name: '已完成', icon: '✅', color: '#9e9e9e', order: 2, type: 'smart', 
        rules: { status: ['finished'] } }
    ]);
    
    // 显示统计
    console.log('\n' + '='.repeat(60));
    console.log('✨ 迁移完成！');
    console.log('='.repeat(60));
    console.log(`\n📊 统计:`);
    console.log(`   ✅ 成功: ${successCount} 本`);
    console.log(`   ❌ 失败: ${failCount} 本`);
    
    // 简单统计
    const books = await db.getBooks();
    const totalAnnotations = books.reduce((sum, b) => sum + b.annotations.length, 0);
    const totalHighlights = books.reduce((sum, b) => 
      sum + b.annotations.filter(a => a.type === 'highlight').length, 0);
    const totalNotes = books.reduce((sum, b) => 
      sum + b.annotations.filter(a => a.type === 'note').length, 0);
    const totalBookmarks = books.reduce((sum, b) => 
      sum + b.annotations.filter(a => a.type === 'bookmark').length, 0);
    
    console.log(`\n📝 标注:`);
    console.log(`   总计: ${totalAnnotations}`);
    console.log(`   🎨 高亮: ${totalHighlights}`);
    console.log(`   📒 笔记: ${totalNotes}`);
    console.log(`   🔖 书签: ${totalBookmarks}`);
    
    console.log(`\n💡 提示:`);
    console.log(`   - 原 JSON 文件已保留作为备份`);
    console.log(`   - 可以删除 /data/storage/petal/siyuan-sireader/ 目录`);
    console.log(`   - 所有数据已迁移到 IndexedDB`);
    
  } catch (error) {
    console.error('\n❌ 迁移失败:', error);
  }
}

// ==================== 工具函数 ====================

/** 获取书籍文件名 */
function getBookFileName(bookIndex: any): string {
  const hash = getHash(bookIndex.bookUrl);
  const sanitizedName = sanitizeName(bookIndex.name);
  return `${sanitizedName}_${hash}.json`;
}

/** 获取书籍位置 */
function getBookLocation(bookData: any): string | undefined {
  if (bookData.epubCfi) return bookData.epubCfi;
  if (bookData.durChapterIndex !== undefined) {
    if (bookData.format === 'pdf') return `#page-${bookData.durChapterIndex}`;
    return `section-${bookData.durChapterIndex}`;
  }
  return undefined;
}

/** 生成哈希 */
function getHash(bookUrl: string): string {
  let h = 0;
  for (let i = 0; i < bookUrl.length; i++) {
    h = (((h << 5) - h) + bookUrl.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/** 清理文件名 */
function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f《》【】「」『』（）()[\]{}]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[._-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 50) || 'book';
}

// 导出到全局
(window as any).migrateJSONToDatabase = migrateJSONToDatabase;

console.log('📦 迁移脚本已加载');
console.log('💡 执行 migrateJSONToDatabase() 开始迁移');
