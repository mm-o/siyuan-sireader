import { ref, h, render, computed, watch, nextTick } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { Rendition } from 'epubjs'
import { Dialog } from 'siyuan'
import * as API from '@/api'

// ========================================
// EPUB 目录管理 Composable
// 职责：目录数据管理、对话框控制、书签管理、UI交互逻辑
// ========================================

// ===== 类型定义 =====
export interface TocItemData {
  id: string
  href: string
  label: string
  subitems?: TocItemData[]
}

export interface TocDialogConfig {
  width: number
  height: number
}

export interface TocState {
  data: TocItemData[]
  currentHref: string
  progress: Record<string, number>
  bookmarks: string[]
  loading: boolean
}

// ===== 常量配置 =====
export const TOC_DIALOG_CONFIG: TocDialogConfig = {
  width: 420,
  height: 600
}

// ===== 目录数据转换 =====
export function mapTocItem(item: any): TocItemData {
  return {
    id: item.id || item.href,
    href: item.href,
    label: item.label,
    subitems: item.subitems?.map(mapTocItem)
  }
}

// ===== 目录管理 Composable =====
export function useEpubToc(blockId?: string) {
  const state = ref<TocState>({
    data: [],
    currentHref: '',
    progress: {},
    bookmarks: [],
    loading: false
  })

  // 加载目录数据
  const loadToc = async (navigation: any) => {
    state.value.loading = true
    try {
      state.value.data = navigation.toc.map(mapTocItem)
    } catch (e) {
      console.error('[MReader] 加载目录失败', e)
    } finally {
      state.value.loading = false
    }
  }

  // 导航到指定章节
  const navigate = (rendition: Rendition | null, href: string) => {
    rendition?.display(href).catch(() => {})
  }

  // 更新当前章节和进度
  const updateProgress = (href: string, percentage: number) => {
    state.value.currentHref = href
    state.value.progress[href] = percentage * 100
  }

  // 书签管理
  const updateBookmarks = async (marks: string[]) => {
    state.value.bookmarks = marks
    if (blockId) {
      await API.setBlockAttrs(blockId, {
        'custom-epub-bookmarks': JSON.stringify(marks)
      }).catch(() => {})
    }
  }

  const loadBookmarks = async () => {
    if (!blockId) return
    try {
      const attrs = await API.getBlockAttrs(blockId)
      if (attrs['custom-epub-bookmarks']) {
        state.value.bookmarks = JSON.parse(attrs['custom-epub-bookmarks'])
      }
    } catch (e) {
      console.error('[MReader] 加载书签失败', e)
    }
  }

  return {
    state,
    loadToc,
    navigate,
    updateProgress,
    updateBookmarks,
    loadBookmarks
  }
}

// ===== 对话框工具 =====
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))
const BTNS = [['reverse', '反序', '#iconSort'], ['top', '跳到顶部', '#iconUp'], ['bottom', '跳到底部', '#iconDown'], ['bookmark', '书签模式', '#iconBookmark']]
const BTN_ACTIONS = new Map([['reverse', (r: any) => r.toggleReverse()], ['top', (r: any) => r.scrollTo(0)], ['bottom', (r: any) => r.scrollTo(-1)], ['bookmark', (r: any) => r.toggleBookmarkMode()]])
const ACTIVE_PROPS = new Map([['reverse', 'reverseOrder'], ['bookmark', 'bookmarkMode']])

// 定位对话框
const positionDialog = (el: HTMLElement, btn: HTMLElement, { width: w, height: h }: typeof TOC_DIALOG_CONFIG) => {
  const { left, top } = btn.getBoundingClientRect()
  const dc = el.querySelector('.b3-dialog__container') as HTMLElement
  dc.style.left = `${clamp(left, 10, innerWidth - w - 10)}px`
  dc.style.top = `${clamp(top - h - 20, 10, innerHeight - h - 10)}px`
  el.querySelector('.b3-dialog')?.setAttribute('style', 'display:block')
}

export function createTocDialog(component: any, getProps: () => any, btnEl?: HTMLElement, mode: 'dialog' | 'left' | 'right' = 'dialog', parentEl?: HTMLElement) {
  let dialog: Dialog | null = null, panel: HTMLElement | null = null, overlay: HTMLElement | null = null, container: Element | null = null, vnode: any = null

  const isOpen = () => mode === 'dialog' ? !!dialog : !!panel
  const close = () => (overlay?.remove(), panel?.remove(), dialog = panel = overlay = container = vnode = null)
  const renderToolbar = (hdr: Element, ref: any) => {
    ;(hdr as HTMLElement).style.cssText = 'position:relative;z-index:2;display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--b3-border-color)'
    hdr.innerHTML = `<span style="flex:1;font-weight:500">目录</span><div style="display:flex;gap:4px">${BTNS.map(([a, l, i]) => `<button class="toc-btn b3-tooltips b3-tooltips__s" data-action="${a}" aria-label="${l}"><svg style="width:14px;height:14px"><use xlink:href="${i}"></use></svg></button>`).join('')}</div>`
    hdr.querySelectorAll('.toc-btn').forEach(btn => btn.addEventListener('click', () => {
      const { action } = (btn as HTMLElement).dataset
      if (!action) return
      BTN_ACTIONS.get(action)?.(ref)
      const prop = ACTIVE_PROPS.get(action)
      prop && (btn as HTMLElement).classList.toggle('active', ref[prop].value)
    }))
  }

  const renderToc = (hdr: Element, cnt: Element, scroll: (el: Element) => void) => {
    vnode = h(component, getProps())
    render(vnode, cnt as any)
    setTimeout(() => {
      const ref = vnode.component?.exposed, focus = cnt?.querySelector('.b3-list-item--focus')
      ref && renderToolbar(hdr, ref)
      focus && scroll(focus)
    }, 0)
  }

  const update = () => isOpen() && container && renderToc(mode === 'dialog' ? dialog!.element.querySelector('.b3-dialog__header')! : panel!.querySelector('.toc-panel-header')!, container, el => { const r = el.getBoundingClientRect(), p = el.parentElement?.getBoundingClientRect(); p && (r.top < p.top || r.bottom > p.bottom) && el.scrollIntoView({ block: 'nearest' }) })
  
  const toggle = () => {
    if (isOpen()) return close()
    if (mode === 'dialog') {
      dialog = new Dialog({ title: '目录', content: '<div class="fn__flex-1"></div>', width: `${TOC_DIALOG_CONFIG.width}px`, height: `${TOC_DIALOG_CONFIG.height}px`, destroyCallback: close })
      const { element } = dialog
      const hdr = element.querySelector('.b3-dialog__header')!
      container = element.querySelector('.b3-dialog__body .fn__flex-1')!
      btnEl && positionDialog(element, btnEl, TOC_DIALOG_CONFIG)
      ;(hdr as HTMLElement).style.cssText = 'position:relative;z-index:2;display:flex;align-items:center;gap:8px'
      hdr.insertAdjacentHTML('beforeend', `<div style="display:flex;gap:4px;margin-left:auto">${BTNS.map(([a, l, i]) => `<button class="toc-btn b3-tooltips b3-tooltips__s" data-action="${a}" aria-label="${l}"><svg><use xlink:href="${i}"></use></svg></button>`).join('')}</div>`)
      renderToc(hdr, container, el => el.scrollIntoView({ block: 'nearest' }))
    } else {
      overlay = Object.assign(document.createElement('div'), { className: 'epub-toc-overlay', onclick: close })
      panel = Object.assign(document.createElement('div'), { className: `epub-toc-panel epub-toc-panel--${mode}`, innerHTML: '<div class="toc-panel-header"></div><div class="toc-panel-body fn__flex-1"></div>', onclick: (e: Event) => e.stopPropagation() })
      parentEl?.append(overlay, panel)
      container = panel.querySelector('.toc-panel-body')!
      renderToc(panel.querySelector('.toc-panel-header')!, container, el => el.scrollIntoView({ block: 'nearest' }))
    }
  }

  return { toggle, update, isOpen, destroy: () => (dialog?.destroy(), close()), get instance() { return dialog } }
}

// ===== 目录工具函数 =====

// 递归过滤目录
export const filterToc = (items: TocItemData[], fn: (i: TocItemData) => boolean): TocItemData[] =>
  items.reduce((a, i) => {
    const m = fn(i), s = i.subitems ? filterToc(i.subitems, fn) : []
    return m || s.length ? [...a, { ...i, subitems: s.length ? s : i.subitems }] : a
  }, [] as TocItemData[])

// 递归反转目录
export const reverseToc = (items: TocItemData[]): TocItemData[] =>
  items.map(i => ({ ...i, subitems: i.subitems ? reverseToc(i.subitems) : undefined })).reverse()

// ===== 目录UI交互 Composable =====

export interface TocUIOptions {
  toc: Ref<TocItemData[]> | ComputedRef<TocItemData[]>
  bookmarks: Ref<string[]>
  containerRef?: Ref<HTMLElement | undefined>
  onNavigate?: (href: string) => void
  onUpdateBookmarks?: (bookmarks: string[]) => void
}

export function useTocUI(options: TocUIOptions) {
  const { toc, bookmarks, containerRef, onNavigate, onUpdateBookmarks } = options

  const searchQuery = ref(''), bookmarkMode = ref(false), reverseOrder = ref(false)

  // 计算显示的目录：合并过滤逻辑
  const displayToc = computed(() => {
    const r = toc.value || []
    const filtered = bookmarkMode.value ? filterToc(r, i => bookmarks.value.includes(i.href))
      : searchQuery.value ? filterToc(r, i => i.label.toLowerCase().includes(searchQuery.value.toLowerCase())) : r
    return reverseOrder.value ? reverseToc(filtered) : filtered
  })

  const smartScroll = (el?: Element | null) => el && (() => { const r = el.getBoundingClientRect(), p = el.parentElement?.getBoundingClientRect(); return p && (r.top < p.top || r.bottom > p.bottom) && el.scrollIntoView({ block: 'nearest' }) })()
  const scrollToItem = (sel: string) => nextTick(() => smartScroll(containerRef?.value?.querySelector(sel)))
  const handleSearch = () => scrollToItem('.b3-list-item')
  const toggleBookmarkMode = () => (bookmarkMode.value = !bookmarkMode.value, searchQuery.value = '')
  const toggleBookmark = (href: string) => onUpdateBookmarks?.(bookmarks.value.includes(href) ? bookmarks.value.filter(b => b !== href) : [...bookmarks.value, href])
  const handleNavigate = (href: string) => !bookmarkMode.value && onNavigate?.(href)
  const scrollTo = (p: number) => containerRef?.value?.scrollTo({ top: p === -1 ? containerRef.value.scrollHeight : p, behavior: 'smooth' })
  const toggleReverse = () => reverseOrder.value = !reverseOrder.value
  watch(reverseOrder, () => scrollToItem('.b3-list-item--focus'))

  return { searchQuery, bookmarkMode, reverseOrder, displayToc, handleSearch, toggleBookmarkMode, toggleBookmark, handleNavigate, scrollTo, toggleReverse }
}
