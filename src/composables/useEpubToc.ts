import { ref, h, render, computed, watch, nextTick } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import * as API from '@/api'
import type { HighlightColor, Bookmark } from '@/core/epubDoc'
import { loadBookmarks, addBookmark, removeBookmark } from '@/core/epubDoc'

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

export interface MarkData {
  cfi: string
  color: HighlightColor
  text?: string
}

export interface TocState {
  data: TocItemData[]
  currentHref: string
  progress: Record<string, number>
  bookmarks: Bookmark[]
  marks: MarkData[]
  loading: boolean
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
export function useEpubToc(docId?: string, i18n?) {
  const state = ref<TocState>({
    data: [],
    currentHref: '',
    progress: {},
    bookmarks: [],
    marks: [],
    loading: false
  })
  
  let currentDocId = docId || ''

  const loadToc = async (navigation: any) => {
    state.value.loading = true
    try { state.value.data = navigation.toc.map(mapTocItem) } 
    catch (e) { console.error(`[SiReader] ${i18n?.tocLoadError || '加载目录失败'}`, e) } 
    finally { state.value.loading = false }
  }

  const navigate = (rendition: any, href: string) => {
    if (!rendition || !href) return
    const cleanHref = href.split('#')[0]
    state.value.currentHref = cleanHref
    rendition.display(cleanHref).catch(() => {})
  }

  const updateProgress = (href: string, percentage: number) => (state.value.currentHref = href, state.value.progress[href] = percentage * 100)

  const refreshBookmarks = async () => currentDocId && (state.value.bookmarks = await loadBookmarks(currentDocId))
  const toggleBookmark = async (href: string, label: string, url?: string) => currentDocId && ((exists) => (state.value.bookmarks = exists ? state.value.bookmarks.filter(b => b.href !== href) : [...state.value.bookmarks, { href, label, url: url || href }], exists ? removeBookmark(currentDocId, href) : addBookmark(currentDocId, label, href, url)))(state.value.bookmarks.some(b => b.href === href))
  const setDocId = (id: string) => currentDocId = id

  const COLOR_MAP = { R: 'red', O: 'orange', Y: 'yellow', G: 'green', P: 'pink', L: 'blue', V: 'purple' } as const
  const loadMarks = async (docId: string) => docId && (state.value.marks = Array.from(new Map((await API.sql(`SELECT markdown FROM blocks WHERE root_id='${docId}' AND markdown LIKE '%epubcfi%'`).catch(() => [])).map((b: any) => b.markdown?.match(/^-\s*([ROYGPLV])\s\[([^\]]+)\].*#(epubcfi\([^)]+\))/)).filter(Boolean).map((m: any) => ({ cfi: m[3], color: COLOR_MAP[m[1] as keyof typeof COLOR_MAP] || 'yellow', text: m[2] })).map((m: MarkData) => [m.cfi, m])).values()))
  const addMark = (cfi: string, color: HighlightColor, text?: string) => cfi && (state.value.marks = [...state.value.marks.filter(m => m.cfi !== cfi), { cfi, color, text }])
  const getCurrentChapter = () => ((find) => find ? `（${find.label}）` : '')((function search(items): TocItemData | null { return items.find(i => state.value.currentHref.includes(i.href.split('#')[0])) || items.map(i => i.subitems ? search(i.subitems) : null).find(Boolean) })(state.value.data))
  return { state, loadToc, navigate, updateProgress, toggleBookmark, refreshBookmarks, loadMarks, addMark, getCurrentChapter, setDocId }
}

// ===== 对话框工具 =====
const getBtns = (i18n?) => [['reverse', i18n?.tocReverse || '反序', '#iconSort'], ['top', i18n?.tocTop || '跳到顶部', '#iconUp'], ['bottom', i18n?.tocBottom || '跳到底部', '#iconDown'], ['bookmark', i18n?.tocBookmarkMode || '书签模式', '#iconBookmark'], ['marks', i18n?.tocMarkMode || '标记模式', '#iconMark']]
const BTN_ACTIONS: Record<string, (r: any) => void> = { reverse: r => r.toggleReverse(), top: r => r.scrollTo(0), bottom: r => r.scrollTo(-1), bookmark: r => r.toggleBookmarkMode(), marks: r => r.toggleMarkMode() }
const ACTIVE_PROPS: Record<string, string> = { reverse: 'reverseOrder', bookmark: 'bookmarkMode', marks: 'markMode' }

export function createTocDialog(component: any, getProps: () => any, _btnEl?: HTMLElement, mode: 'left' | 'right' = 'left', parentEl?: HTMLElement, i18n?) {
  let panel: HTMLElement | null = null, overlay: HTMLElement | null = null, container: Element | null = null, vnode: any = null

  const renderToc = () => {
    if (!container) return
    vnode = h(component, getProps())
    render(vnode, container as any)
    setTimeout(() => {
      const ref = vnode.component?.exposed
      if (!ref || !panel) return
      const hdr = panel.querySelector('.toc-panel-header')!
      const btns = getBtns(i18n).map(([a, l, i]) => `<button class="toc-btn b3-tooltips b3-tooltips__s" data-action="${a}" aria-label="${l}"><svg style="width:14px;height:14px"><use xlink:href="${i}"></use></svg></button>`).join('')
      hdr.innerHTML = `<div style="padding:8px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--b3-border-color)"><span style="flex:1;font-weight:500">${i18n?.tocTitle || '目录'}</span><div style="display:flex;gap:4px">${btns}</div></div>`
      hdr.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action
        if (!action) return
        BTN_ACTIONS[action]?.(ref)
        const prop = ACTIVE_PROPS[action]
        prop && btn.classList.toggle('active', ref[prop].value)
      }))
      const focus = container!.querySelector('.b3-list-item--focus')
      if (focus) { const r = focus.getBoundingClientRect(), p = focus.parentElement?.getBoundingClientRect(); p && (r.top < p.top || r.bottom > p.bottom) && focus.scrollIntoView({ block: 'nearest' }) }
    }, 0)
  }

  const close = () => {
    overlay?.remove()
    panel?.remove()
    overlay = panel = container = vnode = null
  }

  const update = () => renderToc()
  
  const toggle = () => {
    if (panel) return close()
    overlay = Object.assign(document.createElement('div'), { className: 'epub-toc-overlay', onclick: close })
    panel = Object.assign(document.createElement('div'), { className: `epub-toc-panel epub-toc-panel--${mode}`, innerHTML: '<div class="toc-panel-header"></div><div class="toc-panel-body fn__flex-1"></div>' })
    parentEl?.append(overlay, panel)
    container = panel.querySelector('.toc-panel-body')!
    renderToc()
  }

  return { toggle, update, isOpen: () => !!panel, destroy: close }
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
  bookmarks: Ref<Bookmark[]>
  marks?: Ref<MarkData[]>
  containerRef?: Ref<HTMLElement | undefined>
  baseUrl?: string
  onNavigate?: (href: string) => void
  onToggleBookmark?: (href: string, label: string, url?: string) => void
  onNavigateToMark?: (cfi: string) => void
  onRemoveMark?: (cfi: string) => void
}

export function useTocUI(options: TocUIOptions) {
  const { toc, bookmarks, marks, containerRef, baseUrl, onNavigate, onToggleBookmark, onNavigateToMark } = options

  const searchQuery = ref(''), bookmarkMode = ref(false), markMode = ref(false), reverseOrder = ref(false)

  const displayToc = computed(() => {
    const r = toc.value || []
    const filtered = bookmarkMode.value ? filterToc(r, i => bookmarks.value.some(b => b.href === i.href)) : searchQuery.value ? filterToc(r, i => i.label.toLowerCase().includes(searchQuery.value.toLowerCase())) : r
    return reverseOrder.value ? reverseToc(filtered) : filtered
  })
  const displayMarks = computed(() => marks?.value || []), displayBookmarks = computed(() => bookmarks.value || []), isBookmarked = (href: string) => bookmarks.value.some(b => b.href === href)

  const scroll = (el?: Element | null) => el && (() => { const r = el.getBoundingClientRect(), p = el.parentElement?.getBoundingClientRect(); return p && (r.top < p.top || r.bottom > p.bottom) && el.scrollIntoView({ block: 'nearest' }) })()
  const scrollToItem = (sel: string) => nextTick(() => scroll(containerRef?.value?.querySelector(sel)))
  const handleSearch = () => scrollToItem('.b3-list-item')
  const toggleBookmarkMode = () => (bookmarkMode.value = !bookmarkMode.value, markMode.value = false, searchQuery.value = '')
  const toggleMarkMode = () => (markMode.value = !markMode.value, bookmarkMode.value = false, searchQuery.value = '')
  const handleNavigate = (href: string) => !bookmarkMode.value && !markMode.value && onNavigate?.(href)
  const handleMarkClick = (cfi: string) => onNavigateToMark?.(cfi), handleBookmarkClick = (href: string) => onNavigate?.(href)
  const handleToggleBookmark = (href: string, label: string) => onToggleBookmark?.(href, label, baseUrl ? `${baseUrl}#${href}` : undefined)
  const handleRemoveBookmark = (href: string, label: string) => onToggleBookmark?.(href, label)
  const scrollTo = (p: number) => containerRef?.value?.scrollTo({ top: p === -1 ? containerRef.value.scrollHeight : p, behavior: 'smooth' })
  const toggleReverse = () => reverseOrder.value = !reverseOrder.value
  watch(reverseOrder, () => scrollToItem('.b3-list-item--focus'))

  return { searchQuery, bookmarkMode, markMode, reverseOrder, displayToc, displayMarks, displayBookmarks, isBookmarked, handleSearch, toggleBookmarkMode, toggleMarkMode, handleToggleBookmark, handleRemoveBookmark, handleNavigate, handleMarkClick, handleBookmarkClick, scrollTo, toggleReverse }
}
