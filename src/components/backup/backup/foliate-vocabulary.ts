/**
 * 词汇本系统
 * 基于标注系统实现生词收集
 * 数据存储在书架的 books/{hash}.json 文件中
 */

import type { Plugin } from 'siyuan'
import type { VocabularyItem, FoliateView, Annotation } from './types'

const VOCABULARY_PREFIX = 'foliate-vocab:'

// 计算 hash（与书架保持一致）
function getHash(bookUrl: string): string {
  let hash = 0
  for (let i = 0; i < bookUrl.length; i++) {
    hash = ((hash << 5) - hash) + bookUrl.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

/**
 * 词汇本管理器
 */
export class VocabularyManager {
  private view: FoliateView
  private vocabulary: VocabularyItem[] = []
  private bookUrl: string
  private plugin: Plugin

  constructor(view: FoliateView, bookUrl: string, plugin: Plugin) {
    this.view = view
    this.bookUrl = bookUrl
    this.plugin = plugin
  }

  /**
   * 初始化
   */
  async init() {
    await this.loadVocabulary()
  }

  /**
   * 加载词汇（使用书架的 JSON 文件）
   */
  private async loadVocabulary() {
    try {
      const hash = getHash(this.bookUrl)
      const filename = `books/${hash}.json`
      const data = await this.plugin.loadData(filename)
      
      if (!data?.vocabulary) return

      this.vocabulary = data.vocabulary
      console.log('[Vocabulary] Loaded:', this.vocabulary.length, 'words')
    } catch (e) {
      console.error('[Vocabulary] Load failed:', e)
      this.vocabulary = []
    }
  }

  /**
   * 保存词汇（使用书架的 JSON 文件）
   */
  private async saveVocabulary() {
    try {
      const hash = getHash(this.bookUrl)
      const filename = `books/${hash}.json`
      
      // 读取完整的书籍数据
      let bookData = await this.plugin.loadData(filename) || {}
      
      // 更新词汇数据（添加到书架的 JSON 中）
      bookData.vocabulary = this.vocabulary
      
      await this.plugin.saveData(filename, bookData)
    } catch (e) {
      console.error('[Vocabulary] Save failed:', e)
    }
  }

  /**
   * 添加生词
   */
  async addWord(word: string, context: string, translation?: string): Promise<VocabularyItem> {
    const location = this.view.lastLocation
    if (!location?.cfi) {
      throw new Error('无法获取当前位置')
    }

    // 检查是否已存在
    const existing = this.vocabulary.find(v => 
      v.word.toLowerCase() === word.toLowerCase() && v.cfi === location.cfi
    )
    if (existing) {
      throw new Error('该单词已在词汇本中')
    }

    const chapter = location.tocItem?.label || '未知章节'

    const item: VocabularyItem = {
      word: word.trim(),
      context: context.substring(0, 200),
      translation,
      cfi: location.cfi,
      timestamp: Date.now(),
      chapter
    }

    this.vocabulary.push(item)
    this.saveVocabulary()

    // 使用标注系统标记生词
    const annotation: Annotation = {
      value: VOCABULARY_PREFIX + location.cfi + ':' + word,
      color: 'purple',
      text: word,
      note: translation
    }
    await this.view.addAnnotation(annotation)

    return item
  }

  /**
   * 删除生词
   */
  async deleteWord(word: string, cfi: string): Promise<boolean> {
    const index = this.vocabulary.findIndex(v => v.word === word && v.cfi === cfi)
    if (index === -1) return false

    this.vocabulary.splice(index, 1)
    this.saveVocabulary()

    // 删除标注
    const annotation: Annotation = {
      value: VOCABULARY_PREFIX + cfi + ':' + word
    }
    await this.view.deleteAnnotation(annotation)

    return true
  }

  /**
   * 更新翻译
   */
  updateTranslation(word: string, cfi: string, translation: string): boolean {
    const item = this.vocabulary.find(v => v.word === word && v.cfi === cfi)
    if (!item) return false

    item.translation = translation
    this.saveVocabulary()
    return true
  }

  /**
   * 获取所有生词
   */
  getAllWords(): VocabularyItem[] {
    return [...this.vocabulary].sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * 搜索生词
   */
  searchWords(query: string): VocabularyItem[] {
    const lowerQuery = query.toLowerCase()
    return this.vocabulary.filter(v => 
      v.word.toLowerCase().includes(lowerQuery) ||
      v.translation?.toLowerCase().includes(lowerQuery) ||
      v.context.toLowerCase().includes(lowerQuery)
    )
  }

  /**
   * 按字母分组
   */
  groupByLetter(): Record<string, VocabularyItem[]> {
    const groups: Record<string, VocabularyItem[]> = {}
    
    for (const item of this.vocabulary) {
      const letter = item.word[0].toUpperCase()
      if (!groups[letter]) {
        groups[letter] = []
      }
      groups[letter].push(item)
    }
    
    return groups
  }

  /**
   * 导出为 CSV
   */
  exportToCSV(): string {
    const headers = ['单词', '翻译', '上下文', '章节', '时间']
    const rows = this.vocabulary.map(v => [
      v.word,
      v.translation || '',
      v.context.replace(/"/g, '""'),
      v.chapter || '',
      new Date(v.timestamp).toLocaleString()
    ])
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    return csv
  }

  /**
   * 导出为 Anki 格式
   */
  exportToAnki(): string {
    return this.vocabulary.map(v => 
      [v.word, v.translation || '', v.context, v.chapter || ''].join('\t')
    ).join('\n')
  }

  /**
   * 跳转到生词位置
   */
  async goToWord(item: VocabularyItem) {
    await this.view.goTo(item.cfi)
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const total = this.vocabulary.length
    const withTranslation = this.vocabulary.filter(v => v.translation).length
    const chapters = new Set(this.vocabulary.map(v => v.chapter)).size
    
    return {
      total,
      withTranslation,
      withoutTranslation: total - withTranslation,
      chapters,
      averagePerChapter: chapters > 0 ? (total / chapters).toFixed(1) : '0'
    }
  }

  /**
   * 清理
   */
  async destroy() {
    await this.saveVocabulary()
    this.vocabulary = []
  }
}

/**
 * 智能提取单词
 */
export function extractWord(text: string, offset: number): string {
  // 英文单词边界
  const wordBoundary = /[^a-zA-Z0-9'-]/
  
  let start = offset
  let end = offset
  
  // 向前查找
  while (start > 0 && !wordBoundary.test(text[start - 1])) {
    start--
  }
  
  // 向后查找
  while (end < text.length && !wordBoundary.test(text[end])) {
    end++
  }
  
  return text.substring(start, end).trim()
}

/**
 * 提取上下文
 */
export function extractContext(text: string, word: string, maxLength: number = 200): string {
  const index = text.indexOf(word)
  if (index === -1) return text.substring(0, maxLength)
  
  const halfLength = Math.floor(maxLength / 2)
  let start = Math.max(0, index - halfLength)
  let end = Math.min(text.length, index + word.length + halfLength)
  
  // 尝试在句子边界截断
  if (start > 0) {
    const sentenceStart = text.lastIndexOf('.', start)
    if (sentenceStart > 0 && sentenceStart > start - 50) {
      start = sentenceStart + 1
    }
  }
  
  if (end < text.length) {
    const sentenceEnd = text.indexOf('.', end)
    if (sentenceEnd > 0 && sentenceEnd < end + 50) {
      end = sentenceEnd + 1
    }
  }
  
  let context = text.substring(start, end).trim()
  
  if (start > 0) context = '...' + context
  if (end < text.length) context = context + '...'
  
  return context
}
