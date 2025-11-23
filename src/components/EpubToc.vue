<template>
  <div class="fn__flex-column" style="height:100%">
    <div v-if="searchable" style="position:relative;padding:12px;border-bottom:1px solid var(--b3-border-color)">
      <input v-model="searchQuery" class="b3-text-field fn__block" placeholder="搜索章节..." style="padding-right:32px" />
      <svg style="position:absolute;right:20px;top:50%;transform:translateY(-50%);width:14px;height:14px;opacity:0.5;pointer-events:none"><use xlink:href="#iconSearch"></use></svg>
    </div>
    <div v-if="bookmarkMode" class="b3-chip b3-chip--info" style="margin:8px 12px;justify-content:center">📌 点击章节添加/移除书签</div>
    <div ref="tocBd" class="fn__flex-1" style="overflow-y:auto">
      <div v-if="loading" class="ft__center" style="padding:40px 20px;flex-direction:column;gap:12px"><div class="fn__loading"><div class="fn__loading-icon"></div></div><span style="opacity:0.6">加载目录中...</span></div>
      <div v-else-if="bookmarkMode && !bookmarks.length" class="ft__center" style="padding:40px 20px;opacity:0.6">📌 暂无书签</div>
      <div v-else-if="!displayToc.length" class="ft__center" style="padding:40px 20px;opacity:0.6">{{ searchQuery ? '未找到匹配的章节' : '暂无目录' }}</div>
      <div v-else style="padding:6px 0"><TocItem v-for="(item, i) in displayToc" :key="i" :item="item" :href="currentHref" :prog="progress" :marks="bookmarks" :mode="bookmarkMode" :lv="0" @nav="handleNavigate" @mark="toggleBookmark" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, h } from 'vue'

export interface TocItemData { id: string; href: string; label: string; subitems?: TocItemData[] }

interface Props { toc: TocItemData[]; currentHref?: string; loading?: boolean; searchable?: boolean; progress?: Record<string, number>; bookmarks?: string[] }

const props = withDefaults(defineProps<Props>(), { loading: false, searchable: true, progress: () => ({}), bookmarks: () => [] })
const emit = defineEmits<{ navigate: [href: string]; 'update:bookmarks': [bookmarks: string[]] }>()

const searchQuery = ref(''), bookmarkMode = ref(false), reverseOrder = ref(false), tocBd = ref<HTMLElement>()

const filter = (items: TocItemData[], fn: (i: TocItemData) => boolean): TocItemData[] => items.reduce((a, i) => {
  const m = fn(i), s = i.subitems ? filter(i.subitems, fn) : []
  return m || s.length ? [...a, { ...i, subitems: s.length ? s : i.subitems }] : a
}, [] as TocItemData[])

const reverse = (items: TocItemData[]): TocItemData[] => items.map(i => ({ ...i, subitems: i.subitems ? reverse(i.subitems) : undefined })).reverse()
const displayToc = computed(() => {
  let t = bookmarkMode.value ? filter(props.toc, i => props.bookmarks?.includes(i.href)) : searchQuery.value ? filter(props.toc, i => i.label.toLowerCase().includes(searchQuery.value.toLowerCase())) : props.toc
  return reverseOrder.value ? reverse(t) : t
})

const toggleBookmarkMode = () => (bookmarkMode.value = !bookmarkMode.value, searchQuery.value = '')
const toggleBookmark = (h: string) => emit('update:bookmarks', props.bookmarks?.includes(h) ? props.bookmarks.filter(b => b !== h) : [...(props.bookmarks || []), h])
const handleNavigate = (h: string) => !bookmarkMode.value && emit('navigate', h)
const scrollTo = (p: number) => tocBd.value?.scrollTo({ top: p === -1 ? tocBd.value.scrollHeight : p, behavior: 'smooth' })

watch(reverseOrder, () => nextTick(() => tocBd.value?.querySelector('.b3-list-item--focus')?.scrollIntoView()))
defineExpose({ toggleReverse: () => reverseOrder.value = !reverseOrder.value, scrollTo, toggleBookmarkMode, bookmarkMode, reverseOrder })

const TocItem = { name: 'TocItem', props: { item: Object, href: String, prog: Object, marks: Array, mode: Boolean, lv: Number }, emits: ['nav', 'mark'], setup(p: any, { emit }: any) {
  const e = ref(true), a = computed(() => p.href && p.item.href.split('#')[0] === p.href.split('#')[0]), s = computed(() => !!p.item.subitems?.length), g = computed(() => p.prog?.[p.item.href] || 0), m = computed(() => p.marks?.includes(p.item.href))
  const btn = 'width:20px;height:20px;padding:0;border:none;background:transparent;flex-shrink:0'
  return () => h('div', {}, [
    h('div', { class: ['b3-list-item', { 'b3-list-item--focus': a.value }], style: `padding-left:${p.lv * 16 + 12}px`, onClick: () => p.mode ? emit('mark', p.item.href) : emit('nav', p.item.href) }, [
      p.mode && h('button', { class: `b3-tooltips b3-tooltips__n${m.value ? ' ft__error' : ''}`, 'aria-label': m.value ? '移除书签' : '添加书签', style: btn, onClick: (e: Event) => (e.stopPropagation(), emit('mark', p.item.href)) }, h('svg', { style: 'width:14px;height:14px' }, h('use', { 'xlink:href': '#iconBookmark' }))),
      s.value && h('button', { style: btn, onClick: (ev: Event) => (ev.stopPropagation(), e.value = !e.value) }, h('svg', { style: `width:12px;height:12px;color:var(--b3-theme-on-surface);transition:transform .2s${e.value ? ';transform:rotate(90deg)' : ''}` }, h('use', { 'xlink:href': '#iconRight' }))),
      h('span', { class: 'b3-list-item__text fn__flex-1' }, p.item.label),
      g.value > 0 && !p.mode && h('span', { class: 'b3-list-item__meta', style: 'font-size:11px' }, `${g.value.toFixed(0)}%`)
    ]),
    g.value > 0 && !p.mode && h('div', { style: 'height:2px;background:var(--b3-theme-background-light);margin:0 12px 4px' }, h('div', { style: `height:100%;background:var(--b3-theme-primary);width:${g.value}%;transition:width .3s` })),
    e.value && s.value && h('div', {}, p.item.subitems.map((sub: any, i: number) => h(TocItem, { key: i, item: sub, href: p.href, prog: p.prog, marks: p.marks, mode: p.mode, lv: p.lv + 1, onNav: (h: string) => emit('nav', h), onMark: (h: string) => emit('mark', h) })))
  ])
}}
</script>
