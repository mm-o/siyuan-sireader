<template>
  <div class="epub-toc fn__flex-column" style="height:100%">
    <div v-if="searchable" class="toc-search">
      <input v-model="searchQuery" class="b3-text-field fn__block" placeholder="搜索章节..." @input="handleSearch" />
      <svg class="search-icon"><use xlink:href="#iconSearch"></use></svg>
    </div>
    <div ref="tocBd" class="toc-body fn__flex-1">
      <div v-if="loading" class="toc-state ft__center"><div class="fn__loading"><div class="fn__loading-icon"></div></div><span>加载目录中...</span></div>
      <div v-else-if="markMode && !displayMarks.length" class="toc-state ft__center">暂无标记</div>
      <div v-else-if="bookmarkMode && !displayBookmarks.length" class="toc-state ft__center">暂无书签</div>
      <div v-else-if="!displayToc.length && !markMode && !bookmarkMode" class="toc-state ft__center">{{ searchQuery ? '未找到匹配的章节' : '暂无目录' }}</div>
      <div v-else-if="markMode" class="mark-list"><div class="toc-list"><TocItem v-for="(mark, i) in displayMarks" :key="i" :item="{ href: mark.cfi, label: mark.text }" :href="currentHref" :bookmarkMode="true" :markColor="mark.color" :lv="0" @nav="handleMarkClick" @mark="() => emit('removeMark', mark.cfi)" /></div></div>
      <div v-else-if="bookmarkMode" class="toc-list"><TocItem v-for="(bm, i) in displayBookmarks" :key="i" :item="{ href: bm.href, label: bm.label }" :href="currentHref" :bookmarkMode="true" :lv="0" @nav="handleBookmarkClick" @mark="handleRemoveBookmark" /></div>
      <div v-else class="toc-list"><TocItem v-for="(item, i) in displayToc" :key="i" :item="item" :href="currentHref" :prog="progress" :bookmarked="isBookmarked" :lv="0" @nav="handleNavigate" @mark="handleToggleBookmark" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import type { TocItemData, MarkData } from '@/composables/useEpubToc'
import { useTocUI } from '@/composables/useEpubToc'

import type { Bookmark } from '@/core/epubDoc'

interface Props { toc: TocItemData[]; currentHref?: string; loading?: boolean; searchable?: boolean; progress?: Record<string, number>; bookmarks?: Bookmark[]; marks?: MarkData[]; baseUrl?: string }
const props = withDefaults(defineProps<Props>(), { loading: false, searchable: true, progress: () => ({}), bookmarks: () => [], marks: () => [] })
const emit = defineEmits<{ navigate: [href: string]; toggleBookmark: [href: string, label: string, url?: string]; navigateToMark: [cfi: string]; removeMark: [cfi: string] }>()

const tocBd = ref<HTMLElement>()
const { searchQuery, bookmarkMode, markMode, reverseOrder, displayToc, displayMarks, displayBookmarks, isBookmarked, handleSearch, toggleBookmarkMode, toggleMarkMode, handleToggleBookmark, handleRemoveBookmark, handleNavigate, handleMarkClick, handleBookmarkClick, scrollTo, toggleReverse } = useTocUI({
  toc: computed(() => props.toc),
  bookmarks: computed(() => props.bookmarks),
  marks: computed(() => props.marks),
  containerRef: tocBd,
  baseUrl: props.baseUrl,
  onNavigate: (href) => emit('navigate', href),
  onToggleBookmark: (href, label, url) => emit('toggleBookmark', href, label, url),
  onNavigateToMark: (cfi) => emit('navigateToMark', cfi),
  onRemoveMark: (cfi) => emit('removeMark', cfi)
})

defineExpose({ toggleReverse, scrollTo, toggleBookmarkMode, toggleMarkMode, bookmarkMode, markMode, reverseOrder })


const COLORS: Record<string, string> = { red: '#f44336', orange: '#ff9800', yellow: '#ffeb3b', green: '#4caf50', pink: '#e91e63', blue: '#2196f3', purple: '#9c27b0' }
const BTN = 'width:20px;height:20px;padding:0;border:none;background:transparent;cursor:pointer;flex-shrink:0'

const TocItem = {
  props: { item: Object, href: String, prog: Object, bookmarked: Function, bookmarkMode: Boolean, markColor: String, lv: Number },
  emits: ['nav', 'mark'],
  setup(p: any, { emit }: any) {
    const exp = ref(true), active = computed(() => p.href && p.item.href.split('#')[0] === p.href.split('#')[0])
    const hasSub = computed(() => !!p.item.subitems?.length), progress = computed(() => p.prog?.[p.item.href] || 0), marked = computed(() => p.bookmarked?.(p.item.href))
    const borderColor = p.markColor ? COLORS[p.markColor] || COLORS.yellow : ''
    const itemStyle = `padding-left:${p.lv * 16 + 12}px${borderColor ? `;border-left:3px solid ${borderColor}` : ''}${p.markColor ? ';display:block;position:relative;padding-right:36px' : ''}`
    return () => h('div', {}, [
      h('div', { class: ['b3-list-item', { 'b3-list-item--focus': active.value }], style: itemStyle, onClick: () => emit('nav', p.item.href) }, [
        hasSub.value && h('button', { style: BTN, onClick: (e: Event) => (e.stopPropagation(), exp.value = !exp.value) }, h('svg', { style: `width:12px;height:12px;color:var(--b3-theme-on-surface);transition:transform .2s${exp.value ? ';transform:rotate(90deg)' : ''}` }, h('use', { 'xlink:href': '#iconRight' }))),
        p.markColor ? h('div', { class: 'b3-list-item__text fn__flex-1', style: 'display:block;white-space:normal;word-break:break-word;line-height:1.6' }, ((m) => [h('div', {}, m ? p.item.label.substring(0, m.index) : p.item.label), m && h('div', { style: 'font-size:11px;opacity:.6;margin-top:2px;color:var(--b3-theme-on-surface-light)' }, m[1])])(p.item.label.match(/（([^）]+)）$/))) : h('span', { class: 'b3-list-item__text fn__flex-1' }, p.item.label),
        progress.value > 0 && h('span', { class: 'b3-list-item__meta', style: 'font-size:11px;margin-right:4px' }, `${progress.value.toFixed(0)}%`),
        !p.bookmarkMode && !p.markColor && h('button', { class: 'b3-tooltips b3-tooltips__w', 'aria-label': marked.value ? '移除书签' : '添加书签', style: `${BTN};opacity:${marked.value ? 1 : 0};transition:opacity .2s`, onClick: (e: Event) => (e.stopPropagation(), emit('mark', p.item.href, p.item.label)) }, h('svg', { style: `width:14px;height:14px;color:var(--b3-theme-${marked.value ? 'error' : 'on-surface'})` }, h('use', { 'xlink:href': '#iconBookmark' }))),
        (p.bookmarkMode || p.markColor) && h('button', { class: 'b3-tooltips b3-tooltips__w', 'aria-label': p.markColor ? '删除标记' : '删除书签', style: `${BTN};opacity:0;transition:opacity .2s${p.markColor ? ';position:absolute;top:8px;right:8px' : ''}`, onClick: (e: Event) => (e.stopPropagation(), emit('mark', p.item.href, p.item.label)) }, h('svg', { style: 'width:14px;height:14px;color:var(--b3-theme-error)' }, h('use', { 'xlink:href': '#iconTrashcan' })))
      ]),
      progress.value > 0 && h('div', { class: 'toc-progress' }, h('div', { class: 'toc-progress-bar', style: `width:${progress.value}%` })),
      exp.value && hasSub.value && h('div', {}, p.item.subitems.map((sub: any, i: number) => h(TocItem, { key: i, item: sub, href: p.href, prog: p.prog, bookmarked: p.bookmarked, lv: p.lv + 1, onNav: (h: string) => emit('nav', h), onMark: (h: string, l: string) => emit('mark', h, l) })))
    ])
  }
}
</script>

