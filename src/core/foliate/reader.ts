/**
 * Foliate Reader
 * 整合所有功能的统一阅读器
 */

import type { Plugin } from 'siyuan'
import type { FoliateView, Location, RelocateEvent } from './types'
import type { ReaderSettings } from '@/composables/useSetting'
import { createFoliateView, configureView, applyCustomCSS, getCurrentLocation, destroyView } from './view'
import { MarkManager } from './mark'

export interface ReaderOptions {
  container: HTMLElement
  settings: ReaderSettings
  bookUrl: string  // 改为 bookUrl
  plugin: Plugin
}

/**
 * Foliate Reader 主类
 */
export class FoliateReader {
  private view: FoliateView
  private container: HTMLElement
  private settings: ReaderSettings
  private bookUrl: string
  private plugin: Plugin

  // 统一标记管理器
  public marks: MarkManager

  // 事件监听器
  private eventListeners = new Map<string, Set<Function>>()

  constructor(options: ReaderOptions) {
    this.container = options.container
    this.settings = options.settings
    this.bookUrl = options.bookUrl
    this.plugin = options.plugin

    // 创建 View
    this.view = createFoliateView(this.container)

    // 初始化统一标记管理器
    this.marks = new MarkManager(this.view, this.bookUrl, this.plugin)

    // 设置事件监听
    this.setupEventListeners()

    // 监听设置变化
    this.listenToSettingsChanges()
  }

  /**
   * 打开书籍
   */
  async open(file: File | string | any) {
    await this.view.open(file)

    // 配置视图
    configureView(this.view, this.settings)
    applyCustomCSS(this.view, this.settings)

    // 初始化标记管理器（包含 Calibre 导入）
    await this.marks.init()

    this.emit('loaded', { book: this.view.book })
  }



  /**
   * 设置事件监听
   */
  private setupEventListeners() {
    // 位置变化
    this.view.addEventListener('relocate', ((e: CustomEvent<RelocateEvent>) => {
      this.emit('relocate', e.detail)
    }) as EventListener)

    // 章节加载
    this.view.addEventListener('load', ((e: CustomEvent) => {
      this.emit('load', e.detail)
    }) as EventListener)

    // 外部链接
    this.view.addEventListener('external-link', ((e: CustomEvent) => {
      this.emit('external-link', e.detail)
    }) as EventListener)

    // 内部链接
    this.view.addEventListener('link', ((e: CustomEvent) => {
      this.emit('link', e.detail)
    }) as EventListener)
  }

  /**
   * 监听设置变化
   */
  private listenToSettingsChanges() {
    window.addEventListener('sireaderSettingsUpdated', ((e: CustomEvent) => {
      this.settings = e.detail
      configureView(this.view, this.settings)
      applyCustomCSS(this.view, this.settings)
    }) as EventListener)
  }

  /**
   * 导航方法
   */
  async goTo(target: string | number | Location) {
    await this.view.goTo(target)
  }

  async goLeft() {
    await this.view.goLeft()
  }

  async goRight() {
    await this.view.goRight()
  }

  async prev() {
    await this.view.prev()
  }

  async next() {
    await this.view.next()
  }

  async goToFraction(fraction: number) {
    await this.view.goToFraction(fraction)
  }

  /**
   * 获取当前位置
   */
  getLocation(): Location | null {
    return getCurrentLocation(this.view)
  }

  /**
   * 获取进度信息
   */
  getProgress() {
    return this.view.lastLocation
  }

  /**
   * 历史导航
   */
  canGoBack(): boolean {
    return this.view.history?.canGoBack ?? false
  }

  canGoForward(): boolean {
    return this.view.history?.canGoForward ?? false
  }

  goBack() {
    this.view.history?.back()
  }

  goForward() {
    this.view.history?.forward()
  }

  /**
   * 搜索
   */
  async *search(query: string, options?: any) {
    if (this.view.search) {
      yield* this.view.search({ query, ...options })
    }
  }

  clearSearch() {
    if (this.view.clearSearch) {
      this.view.clearSearch()
    }
  }

  /**
   * 选择文本
   */
  async select(target: string | Location) {
    if (this.view.select) {
      await this.view.select(target)
    }
  }

  deselect() {
    if (this.view.deselect) {
      this.view.deselect()
    }
  }

  /**
   * 获取选中的文本
   */
  getSelectedText(): { text: string; range: Range } | null {
    try {
      const contents = this.view.renderer?.getContents?.()
      if (!contents) return null

      for (const { doc } of contents) {
        const selection = doc.defaultView?.getSelection()
        if (selection && !selection.isCollapsed) {
          const range = selection.getRangeAt(0)
          return {
            text: selection.toString(),
            range
          }
        }
      }
    } catch (e) {
      console.error('[Reader] Failed to get selection:', e)
    }
    return null
  }

  /**
   * 事件系统
   */
  on(event: string, callback: Function) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
  }

  off(event: string, callback: Function) {
    this.eventListeners.get(event)?.delete(callback)
  }

  private emit(event: string, data?: any) {
    this.eventListeners.get(event)?.forEach(callback => {
      try {
        callback(data)
      } catch (e) {
        console.error(`[Reader] Event handler error (${event}):`, e)
      }
    })
  }

  /**
   * 更新设置
   */
  updateSettings(settings: ReaderSettings) {
    this.settings = settings
    configureView(this.view, settings)
    applyCustomCSS(this.view, settings)
  }

  /**
   * 获取书籍信息
   */
  getBook() {
    return this.view.book
  }

  /**
   * 获取原始 View
   */
  getView(): FoliateView {
    return this.view
  }

  /**
   * 销毁
   */
  async destroy() {
    // 清理标记管理器
    await this.marks.destroy()

    // 清理事件监听
    this.eventListeners.clear()

    // 销毁 View
    destroyView(this.view)

    console.log('[Reader] Destroyed')
  }
}

/**
 * 创建 Reader 实例
 */
export function createReader(options: ReaderOptions): FoliateReader {
  return new FoliateReader(options)
}
