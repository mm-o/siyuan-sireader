<template>
  <div class="epub-toc fn__flex-column" style="height:100%">
    <div v-if="searchable" class="toc-search">
      <input v-model="searchQuery" class="b3-text-field fn__block" placeholder="搜索章节..." @input="handleSearch" />
      <svg class="search-icon"><use xlink:href="#iconSearch"></use></svg>
    </div>
    <div v-if="bookmarkMode" class="b3-chip b3-chip--info toc-tip">📌 点击章节添加/移除书签</div>
    <div ref="tocBd" class="toc-body fn__flex-1">
      <div v-if="loading" class="toc-state ft__center"><div class="fn__loading"><div class="fn__loading-icon"></div></div><span>加载目录中...</span></div>
      <div v-else-if="bookmarkMode && !bookmarks.length" class="toc-state ft__center">📌 暂无书签</div>
      <div v-else-if="!displayToc.length" class="toc-state ft__center">{{ searchQuery ? '未找到匹配的章节' : '暂无目录' }}</div>
      <div v-else class="toc-list"><TocItem v-for="(item, i) in displayToc" :key="i" :item="item" :href="currentHref" :prog="progress" :marks="bookmarks" :mode="bookmarkMode" :lv="0" @nav="handleNavigate" @mark="toggleBookmark" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h } from 'vue'
import type { TocItemData } from '@/composables/useEpubToc'
import { useTocUI } from '@/composables/useEpubToc'

interface Props { toc: TocItemData[]; currentHref?: string; loading?: boolean; searchable?: boolean; progress?: Record<string, number>; bookmarks?: string[] }
const props = withDefaults(defineProps<Props>(), { loading: false, searchable: true, progress: () => ({}), bookmarks: () => [] })
const emit = defineEmits<{ navigate: [href: string]; 'update:bookmarks': [bookmarks: string[]] }>()

const tocBd = ref<HTMLElement>()
const { searchQuery, bookmarkMode, reverseOrder, displayToc, handleSearch, toggleBookmarkMode, toggleBookmark, handleNavigate, scrollTo, toggleReverse } = useTocUI({
  toc: computed(() => props.toc),
  bookmarks: computed(() => props.bookmarks),
  containerRef: tocBd,
  onNavigate: (href) => emit('navigate', href),
  onUpdateBookmarks: (bookmarks) => emit('update:bookmarks', bookmarks)
})

defineExpose({ toggleReverse, scrollTo, toggleBookmarkMode, bookmarkMode, reverseOrder })

// 目录项渲染组件
const TocItem = {
  name: 'TocItem',
  props: { item: Object, href: String, prog: Object, marks: Array, mode: Boolean, lv: Number },
  emits: ['nav', 'mark'],
  setup(p: any, { emit }: any) {
    const e = ref(true), a = computed(() => p.href && p.item.href.split('#')[0] === p.href.split('#')[0])
    const s = computed(() => !!p.item.subitems?.length), g = computed(() => p.prog?.[p.item.href] || 0), m = computed(() => p.marks?.includes(p.item.href))
    const btn = 'width:20px;height:20px;padding:0;border:none;background:transparent;flex-shrink:0'
    return () => h('div', {}, [
      h('div', { class: ['b3-list-item', { 'b3-list-item--focus': a.value }], style: `padding-left:${p.lv * 16 + 12}px`, onClick: () => p.mode ? emit('mark', p.item.href) : emit('nav', p.item.href) }, [
        p.mode && h('button', { class: `b3-tooltips b3-tooltips__s${m.value ? ' ft__error' : ''}`, 'aria-label': m.value ? '移除书签' : '添加书签', style: btn, onClick: (ev: Event) => (ev.stopPropagation(), emit('mark', p.item.href)) }, h('svg', { style: 'width:14px;height:14px' }, h('use', { 'xlink:href': '#iconBookmark' }))),
        s.value && h('button', { style: btn, onClick: (ev: Event) => (ev.stopPropagation(), e.value = !e.value) }, h('svg', { style: `width:12px;height:12px;color:var(--b3-theme-on-surface);transition:transform .2s${e.value ? ';transform:rotate(90deg)' : ''}` }, h('use', { 'xlink:href': '#iconRight' }))),
        h('span', { class: 'b3-list-item__text fn__flex-1' }, p.item.label),
        g.value > 0 && !p.mode && h('span', { class: 'b3-list-item__meta', style: 'font-size:11px' }, `${g.value.toFixed(0)}%`)
      ]),
      g.value > 0 && !p.mode && h('div', { style: 'height:2px;background:var(--b3-theme-background-light);margin:0 12px 4px' }, h('div', { style: `height:100%;background:var(--b3-theme-primary);width:${g.value}%;transition:width .3s` })),
      e.value && s.value && h('div', {}, p.item.subitems.map((sub: any, i: number) => h(TocItem, { key: i, item: sub, href: p.href, prog: p.prog, marks: p.marks, mode: p.mode, lv: p.lv + 1, onNav: (h: string) => emit('nav', h), onMark: (h: string) => emit('mark', h) })))
    ])
  }
}
</script>

<style scoped>
.epub-toc { --toc-transition: all .2s cubic-bezier(.4,0,.2,1); }
.toc-search { position: relative; padding: 12px; border-bottom: 1px solid var(--b3-border-color); z-index: 1; }
.toc-search input { padding-right: 32px; }
.toc-search input:focus { border-color: var(--b3-theme-primary); box-shadow: 0 0 0 2px var(--b3-theme-primary-lighter); }
.search-icon { position: absolute; right: 20px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; opacity: .5; pointer-events: none; }
.toc-tip { margin: 8px 12px; justify-content: center; }
.toc-body { overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--b3-scroll-color) transparent; }
.toc-body::-webkit-scrollbar { width: 6px; }
.toc-body::-webkit-scrollbar-track { background: transparent; }
.toc-body::-webkit-scrollbar-thumb { background: var(--b3-scroll-color); border-radius: 3px; }
.toc-body::-webkit-scrollbar-thumb:hover { background: var(--b3-theme-primary); }
.toc-state { padding: 40px 20px; flex-direction: column; gap: 12px; opacity: .6; user-select: none; color: var(--b3-theme-on-surface-light); }
.toc-list { padding: 6px 0; }
.toc-list :deep(.b3-list-item) { transition: var(--toc-transition); cursor: pointer; border-radius: 4px; margin: 2px 8px; }
.toc-list :deep(.b3-list-item:hover) { background: var(--b3-list-hover); }
.toc-list :deep(.b3-list-item--focus) { background: var(--b3-theme-primary-lighter); font-weight: 500; }
.toc-list :deep(.b3-list-item__text) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toc-list :deep(.b3-list-item__meta) { opacity: .7; transition: opacity .2s; }
.toc-list :deep(.b3-list-item:hover .b3-list-item__meta) { opacity: 1; }
</style>
