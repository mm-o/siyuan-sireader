<template>
  <DockShell
    class="sr-toc"
    body-class="sr-toc-body"
    v-model:search-value="keyword"
    :search-placeholder="searchPlaceholder"
    :toolbar-actions="toolbarActions"
    toolbar-tooltip-dir="sw"
    @toolbar-action="handleToolbarAction"
  >
    <div v-show="!showThumbnail" class="fn__flex-1 fn__flex-column file-tree sy__file bs-view bs-tree-view">
      <div
        ref="tocRef"
        class="fn__flex-1 fn__hidescrollbar"
        @click="onTocClick"
        @contextmenu.prevent.stop
        @mouseover="e => (e.target as HTMLElement).hasAttribute('data-toc-item') && e.stopPropagation()"
      ></div>
    </div>

    <div v-show="showThumbnail" class="fn__flex-1 fn__flex-column sy__file bs-view">
      <div ref="thumbContainer" class="fn__flex-1 bs-view bs-grid">
        <div v-if="!isPdfMode" class="ft__secondary" style="grid-column:1/-1;padding:8px 12px">{{ props.i18n?.pdfThumbnailsOnly || 'Thumbnails are available for PDF only' }}</div>
        <div v-else v-for="i in pageCount" :key="i" class="bs-grid-item">
          <div class="b3-list b3-list--background">
            <div
              class="b3-list-item"
              :data-page="i"
              style="display:flex;flex-direction:column;gap:8px;align-items:stretch;padding:8px 12px;cursor:pointer"
              @click="goToPage(i)"
            >
              <div style="display:block;aspect-ratio:3/4;overflow:hidden">
                <img
                  v-if="loadedThumbs[i]"
                  :src="loadedThumbs[i]"
                  :alt="`${props.i18n?.page || 'Page '}${i}${props.i18n?.pageSuffix || ''}`"
                  style="display:block;width:100%;height:100%;object-fit:contain"
                >
                <div v-else style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">{{ i }}</div>
              </div>
              <div class="b3-list-item__text">{{ props.i18n?.page || 'Page ' }}{{ i }}{{ props.i18n?.pageSuffix || '' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </DockShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Menu, showMessage } from 'siyuan'
import DockShell from './ui/DockShell.vue'
import { useReaderState } from '@/core/epub/state'
import { getTocChapterText } from '@/core/epub/chapterText'
import { exportBookLink } from '@/utils/copy'
import { bookmarkToc } from '@/utils/embedPdfActions'
import { bookshelfManager } from '@/core/bookshelf'
import { jump, pdfPageFromCfi } from '@/utils/jump'
import type { TOCItem } from '@/core/epub/types'

const props = withDefaults(defineProps<{ mode?: 'toc'; i18n?: any; context?: any }>(), {
  mode: 'toc',
  i18n: () => ({}),
})

const globalReaderState = useReaderState()
const activeView = computed(() => props.context?.activeView || globalReaderState.activeView.value)
const activeReader = computed(() => props.context?.activeReader || globalReaderState.activeReader.value)

const keyword = ref('')
const tocRef = ref<HTMLElement>()
const thumbContainer = ref<HTMLElement>()
const showThumbnail = ref(false)
const reverse = ref(false)
const loadedThumbs = ref<Record<number, string>>({})
const pdfBookmarks = ref<TOCItem[]>([])
const expandedKeys = ref<Record<string, boolean>>({})
const currentHref = ref('')

const isEmbedPdfMode = computed(() => (activeView.value as any)?.engine === 'embedpdf')
const isPdfMode = computed(() => !!(activeView.value as any)?.isPdf)
const pageCount = computed(() => (activeView.value as any)?.pageCount || 0)
const searchPlaceholder = computed(() => props.i18n?.searchChapter || 'Search table of contents...')

const tocLabel = (item: TOCItem) => item.label || (item as any).title || ''
const tocKey = (item: TOCItem, parentKey = 'root') => item.href || `${parentKey}/${tocLabel(item)}`
const goToLocation = async (location: string | number) => {
  const page = typeof location === 'string' ? pdfPageFromCfi(location) : 0
  return activeView.value?.goTo(page ? Number(page) : location)
}
const getUrl = () => props.context?.bookUrl || (window as any).__currentBookUrl
const showMsg = (msg: string, type = 'info') => showMessage(msg, type === 'error' ? 3000 : 1500, type as any)
const esc = (value: string) => {
  const div = document.createElement('div')
  div.textContent = value
  return div.innerHTML
}
const getBookmarkTitles = () => new Set(
  (activeReader.value?.marks || (activeView.value as any)?.marks)?.getBookmarks?.().map((item: any) => item.title) || [],
)

const reverseToc = (items: TOCItem[]): TOCItem[] =>
  [...items].reverse().map(item => ({
    ...item,
    subitems: item.subitems?.length ? reverseToc(item.subitems) : item.subitems,
  }))

const filterToc = (items: TOCItem[], query: string): TOCItem[] => {
  if (!query) return items
  return items.reduce<TOCItem[]>((result, item) => {
    const children = item.subitems?.length ? filterToc(item.subitems, query) : []
    const text = tocLabel(item).toLowerCase()
    if (text.includes(query) || children.length) result.push({ ...item, subitems: children.length ? children : undefined })
    return result
  }, [])
}

const walkToc = (
  items: TOCItem[],
  visit: (item: TOCItem, key: string, level: number) => void,
  parentKey = 'root',
  level = 0,
) => {
  items.forEach(item => {
    const key = tocKey(item, parentKey)
    visit(item, key, level)
    if (item.subitems?.length) walkToc(item.subitems, visit, key, level + 1)
  })
}

const tocSource = computed<TOCItem[]>(() => {
  const toc = (isEmbedPdfMode.value ? pdfBookmarks.value : activeView.value?.book?.toc || []) as TOCItem[]
  return reverse.value ? reverseToc(toc) : toc
})
const visibleToc = computed(() => filterToc(tocSource.value, keyword.value.trim().toLowerCase()))
const branchKeys = computed(() => {
  const keys: string[] = []
  walkToc(visibleToc.value, (item, key) => item.subitems?.length && keys.push(key))
  return keys
})
const hasExpanded = computed(() => branchKeys.value.some(key => expandedKeys.value[key]))

const toolbarActions = computed(() => [
      { id: 'thumbnail', icon: showThumbnail.value ? '#lucide-scroll-text' : '#lucide-panels-top-left', label: showThumbnail.value ? (props.i18n?.tocTitle || 'Table of Contents') : (props.i18n?.tocThumbnail || 'Thumbnails'), show: isPdfMode.value },
      { id: 'expand', icon: hasExpanded.value ? '#lucide-panel-top-close' : '#lucide-panel-top-open', label: hasExpanded.value ? (props.i18n?.collapse || 'Collapse') : (props.i18n?.expand || 'Expand'), show: !showThumbnail.value },
      { id: 'reverse', icon: reverse.value ? '#lucide-arrow-up-1-0' : '#lucide-arrow-down-0-1', label: reverse.value ? (props.i18n?.descending || 'Descending') : (props.i18n?.ascending || 'Ascending') },
    ])

let relocateHandler: any
let thumbObs: IntersectionObserver | undefined
let renderFrame = 0
let initFrame = 0

const hasCurrentDescendant = (items: TOCItem[] | undefined, href: string): boolean =>
  !!items?.some(item => item.href === href || hasCurrentDescendant(item.subitems, href))
const pdfHrefAt = (page: number) => {
  let href = `#page-${page}`, best = 0
  walkToc(tocSource.value, item => {
    const itemPage = pdfPageFromCfi(item.href)
    if (itemPage && itemPage <= page && itemPage >= best) (best = itemPage, href = item.href!)
  })
  return href
}

const ensureExpandedState = (items: TOCItem[], href = '') => {
  let changed = false
  const next = { ...expandedKeys.value }
  walkToc(items, (item, key) => {
    if (!item.subitems?.length) return
    if (hasCurrentDescendant(item.subitems, href) && next[key] !== true) {
      next[key] = true
      changed = true
    }
  })
  if (changed) expandedKeys.value = next
}

const renderTocItem = (item: TOCItem, level: number, parentKey: string, bookmarks: Set<string>): string => {
  const key = tocKey(item, parentKey)
  const hasChild = !!item.subitems?.length
  const isOpen = hasChild && !!expandedKeys.value[key]
  const isCurrent = !!item.href && item.href === currentHref.value
  const hasBookmark = bookmarks.has(tocLabel(item))
  const exportAction = item.href
    ? `<span class="b3-list-item__action b3-tooltips b3-tooltips__nw" data-act="export" aria-label="${esc(props.i18n?.export || 'Export')}"><svg><use xlink:href="#lucide-send"></use></svg></span>`
    : ''
  const bookmarkAction = item.href
    ? `<span class="b3-list-item__action b3-tooltips b3-tooltips__nw" data-act="bookmark" aria-label="${hasBookmark ? (props.i18n?.removeBookmark || 'Remove bookmark') : (props.i18n?.addBookmark || 'Add bookmark')}"><svg><use xlink:href="#iconBookmark"></use></svg></span>`
    : ''
  const hideActionClass = hasBookmark ? '' : ' b3-list-item--hide-action'
  const row = `<li class="b3-list-item${hideActionClass}${isCurrent ? ' b3-list-item--focus' : ''}" style="--file-toggle-width:${level * 18 + 18}px" data-key="${esc(key)}" data-href="${item.href ? encodeURIComponent(item.href) : ''}" data-label="${encodeURIComponent(tocLabel(item))}" data-has-child="${hasChild}" data-type="${level ? 'navigation-file' : 'navigation-root'}" data-toc-item>
    <span style="padding-left:${level * 18}px" class="b3-list-item__toggle b3-list-item__toggle--hl${hasChild ? '' : ' fn__hidden'}">
      <svg class="b3-list-item__arrow${isOpen ? ' b3-list-item__arrow--open' : ''}"><use xlink:href="#iconRight"></use></svg>
    </span>
    <span class="b3-list-item__text ariaLabel" data-toc-item>${esc(tocLabel(item) || props.i18n?.unnamedChapter || 'Unnamed chapter')}</span>
    ${exportAction || bookmarkAction ? '<span class="fn__space"></span>' : ''}
    ${exportAction}
    ${bookmarkAction}
  </li>`
  const children = hasChild && isOpen
    ? item.subitems!.map(child => renderTocItem(child, level + 1, key, bookmarks)).join('')
    : ''
  return `${row}${children ? `<ul class="b3-list b3-list--background bs-tree-children">${children}</ul>` : ''}`
}

const renderToc = () => {
  if (props.mode !== 'toc' || !tocRef.value) return
  if (!visibleToc.value.length) {
    tocRef.value.innerHTML = isPdfMode.value
      ? ''
      : `<ul class="b3-list b3-list--background"><li class="b3-list-item"><span class="b3-list-item__toggle fn__hidden"></span><span class="b3-list-item__text ft__secondary">${props.i18n?.noToc || 'No table of contents'}</span></li></ul>`
    return
  }
  ensureExpandedState(visibleToc.value, currentHref.value)
  const bookmarks = getBookmarkTitles()
  tocRef.value.innerHTML = visibleToc.value.map(item => `<ul class="b3-list b3-list--background">${renderTocItem(item, 0, 'root', bookmarks)}</ul>`).join('')
  tocRef.value.querySelector('.b3-list-item--focus')?.scrollIntoView({ block: 'nearest' })
}

const scheduleRender = () => {
  if (props.mode !== 'toc') return
  cancelAnimationFrame(renderFrame)
  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0
    renderToc()
  })
}

const cleanupToc = () => {
  activeView.value?.removeEventListener?.('relocate', relocateHandler)
  if (tocRef.value) tocRef.value.innerHTML = ''
  relocateHandler = null
}

const initToc = () => {
  if (props.mode !== 'toc') return
  cleanupToc()
  const view = activeView.value
  if (isEmbedPdfMode.value) {
    currentHref.value = pdfHrefAt(view?.getCurrentPage?.() || 1)
    return renderToc()
  }
  if (!view?.book?.toc?.length) {
    if (isPdfMode.value) showThumbnail.value = true
    return
  }
  currentHref.value = view.lastLocation?.tocItem?.href || ''
  renderToc()
  if (view.addEventListener) {
    relocateHandler = (event: any) => {
      const href = event.detail?.tocItem?.href || ''
      if (!href || href === currentHref.value) return
      currentHref.value = href
      scheduleRender()
    }
    view.addEventListener('relocate', relocateHandler)
  }
}

const scheduleInit = () => {
  cancelAnimationFrame(initFrame)
  initFrame = requestAnimationFrame(() => {
    initFrame = 0
    initToc()
  })
}

const sendTocItem = async (href: string, label: string, clipboard = false) => {
  try {
    const bookUrl = getUrl() || ''
    await exportBookLink(
      { chapter: label, cfi: href, text: label },
      {
        bookUrl,
        bookInfo: bookUrl ? await bookshelfManager.getBook(bookUrl) : null,
        reader: activeReader.value,
        settings: clipboard ? { ...(props.context?.settings || (window as any).__sireader_settings || {}), noteInsertTarget: 'clipboard' } : undefined,
        showMsg,
      },
    )
  } catch (error: any) {
    showMsg(error.message || (clipboard ? (props.i18n?.copyFailed || 'Copy failed') : (props.i18n?.exportFailed || 'Export failed')), 'error')
  }
}

const copyTocText = async (label: string) => {
  await navigator.clipboard.writeText(label)
  showMsg(props.i18n?.copiedText || 'Text copied')
}

const copyTocChapterContent = async (href: string, label: string) => {
  try {
    if (isPdfMode.value) return showMsg(props.i18n?.pdfCopyChapterUnsupported || 'PDF does not support copying chapter text from the table of contents', 'error')
    const text = await getTocChapterText(activeView.value?.book, href, label)
    await navigator.clipboard.writeText(text)
    showMsg(props.i18n?.copiedChapter || 'Chapter text copied')
  } catch (error: any) {
    showMsg(error.message || (props.i18n?.copyChapterFailed || 'Failed to copy chapter text'), 'error')
  }
}

const openTocMenu = (event: MouseEvent, href: string, label: string) => {
  const m = new Menu()
  ;[
    { icon: 'iconUpload', label: props.i18n?.export || 'Export', click: () => void sendTocItem(href, label) },
    { icon: 'iconCopy', label: props.i18n?.copyLink || 'Copy Link', click: () => void sendTocItem(href, label, true) },
    { icon: 'iconCopy', label: props.i18n?.copyText || 'Copy Text', click: () => void copyTocText(label) },
    { icon: 'iconCopy', label: props.i18n?.copyChapter || 'Copy Chapter', click: () => void copyTocChapterContent(href, label) },
  ].forEach(item => m.addItem(item))
  m.open({ x: event.clientX, y: event.clientY })
}

const toggleBookmark = async (href: string, label: string) => {
  const marks = activeReader.value?.marks || (activeView.value as any)?.marks
  if (!marks?.toggleBookmark || !activeView.value) return showMsg(props.i18n?.bookmarkUnavailable || 'Bookmark feature is not initialized', 'error')
  try {
    await goToLocation(href)
    await new Promise(resolve => setTimeout(resolve, 200))
    const added = await marks.toggleBookmark(href, label)
    showMsg(added ? (props.i18n?.bookmarkAdded || 'Bookmark added') : (props.i18n?.bookmarkRemoved || 'Bookmark removed'))
    scheduleRender()
  } catch (error: any) {
    showMsg(error.message || (props.i18n?.operationFailed || 'Operation failed'), 'error')
  }
}

const toggleTocNode = (key: string) => {
  expandedKeys.value = { ...expandedKeys.value, [key]: !expandedKeys.value[key] }
  scheduleRender()
}

const setAllExpanded = (expand: boolean) => {
  const next = { ...expandedKeys.value }
  branchKeys.value.forEach(key => { next[key] = expand })
  expandedKeys.value = next
  scheduleRender()
}

const onTocClick = async (event: MouseEvent) => {
  const target = event.target as HTMLElement
  const action = target.closest('[data-act]') as HTMLElement | null
  const row = target.closest('[data-key]') as HTMLElement | null
  if (!row) return
  const key = row.dataset.key || ''
  const href = row.dataset.href ? decodeURIComponent(row.dataset.href) : ''
  const label = row.dataset.label ? decodeURIComponent(row.dataset.label) : row.textContent?.trim() || ''
  const hasChild = row.dataset.hasChild === 'true'
  if (action?.dataset.act === 'export' && href) {
    event.preventDefault()
    event.stopPropagation()
    return void openTocMenu(event, href, label)
  }
  if (action?.dataset.act === 'bookmark' && href) {
    event.preventDefault()
    event.stopPropagation()
    return void toggleBookmark(href, label)
  }
  if (target.closest('.b3-list-item__toggle') && hasChild) return void toggleTocNode(key)
  if (href) await goToLocation(href)
  else if (hasChild) toggleTocNode(key)
}

const handleToolbarAction = (id: string) => {
  if (id === 'thumbnail') showThumbnail.value = !showThumbnail.value
  else if (id === 'expand') setAllExpanded(!hasExpanded.value)
  else if (id === 'reverse') reverse.value = !reverse.value
}

const goToPage = (page: number) =>
  jump(page, activeView.value, activeReader.value, activeReader.value?.marks || (activeView.value as any)?.marks)

const loadPdfBookmarks = async () => {
  if (!isEmbedPdfMode.value) {
    pdfBookmarks.value = []
    return
  }
  const bookmarks = await (activeView.value as any)?.getBookmarks?.().catch(() => [])
  pdfBookmarks.value = bookmarkToc(bookmarks) as TOCItem[]
  scheduleInit()
}

const initThumbs = () => nextTick(() => {
  thumbObs?.disconnect()
  const getThumbnail = (activeView.value as any)?.getThumbnail
  if (!showThumbnail.value || !isPdfMode.value || !pageCount.value || !getThumbnail) return
  thumbObs = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return
    const page = +(entry.target as HTMLElement).dataset.page!
    if (!loadedThumbs.value[page]) {
      getThumbnail(page).then((url: string) => {
        if (url) loadedThumbs.value[page] = url
      })
    }
  }), { root: thumbContainer.value, rootMargin: '200px' })
  thumbContainer.value?.querySelectorAll('[data-page]').forEach(el => thumbObs?.observe(el))
})

watch([showThumbnail, () => pageCount.value], () => showThumbnail.value && initThumbs())
watch(() => activeView.value, () => { props.mode === 'toc' && (isEmbedPdfMode.value ? void loadPdfBookmarks() : scheduleInit()) }, { immediate: true })
watch(() => activeView.value?.book, book => (
  !isEmbedPdfMode.value && book?.toc && props.mode === 'toc' ? scheduleInit() : cleanupToc()
), { immediate: true })
watch(() => props.mode, () => props.mode === 'toc' && scheduleInit())
watch(reverse, () => {
  if (props.mode !== 'toc') return
  expandedKeys.value = {}
  scheduleInit()
})
watch(keyword, () => props.mode === 'toc' && scheduleRender())

const onMarks = () => props.mode === 'toc' && scheduleRender()
const onSwitch = () => props.mode === 'toc' && (isEmbedPdfMode.value ? void loadPdfBookmarks() : scheduleInit())
const onPdfPage = (event: Event) => {
  const { bookUrl, page } = (event as CustomEvent).detail || {}
  if (props.mode !== 'toc' || !isEmbedPdfMode.value || (bookUrl && bookUrl !== getUrl())) return
  const href = pdfHrefAt(page || 1)
  if (href === currentHref.value) return
  currentHref.value = href
  scheduleRender()
}

onMounted(() => {
  window.addEventListener('sireader:marks-updated', onMarks)
  window.addEventListener('sireader:tab-switched', onSwitch)
  window.addEventListener('sireader:pdf-page', onPdfPage)
})

onUnmounted(() => {
  cleanupToc()
  cancelAnimationFrame(renderFrame)
  cancelAnimationFrame(initFrame)
  thumbObs?.disconnect()
  window.removeEventListener('sireader:marks-updated', onMarks)
  window.removeEventListener('sireader:tab-switched', onSwitch)
  window.removeEventListener('sireader:pdf-page', onPdfPage)
})
</script>

<style scoped lang="scss">
:deep(.sr-toc-body){display:flex;flex-direction:column;min-height:0;overflow:hidden}
.bs-view{min-height:0;height:100%;padding:0;box-sizing:border-box}
.bs-tree-view{padding-top:8px}
.bs-tree-view :deep(.b3-list){padding:0;margin:0}
.bs-tree-view :deep(.bs-tree-children){padding:0;margin:0}
.bs-grid{display:grid;gap:6px;overflow:auto;scrollbar-gutter:stable;align-content:start;padding:8px 0 8px 8px;box-sizing:border-box;grid-template-columns:repeat(auto-fill,minmax(92px,1fr))}
.bs-grid .b3-list{margin:0}
.bs-grid-item{position:relative;min-width:0;cursor:pointer;content-visibility:auto;contain-intrinsic-size:150px}
</style>
