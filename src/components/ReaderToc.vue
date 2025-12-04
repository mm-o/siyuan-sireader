<template>
  <div class="reader-toc">
    <div class="toc-toolbar">
      <input v-model="search" :placeholder="placeholder" v-motion-fade>
      <button @click="toggleScroll" title="顶部/底部" v-motion-pop>
        <svg><use xlink:href="#lucide-panel-top-open"/></svg>
      </button>
      <button @click="toggleSort" :title="reversed ? '倒序' : '正序'" v-motion-pop>
        <svg><use :xlink:href="reversed ? '#lucide-arrow-up-1-0' : '#lucide-arrow-down-0-1'"/></svg>
      </button>
    </div>
    <div class="toc-body" ref="bodyRef">
      <TransitionGroup name="fade" mode="out-in">
        <div v-if="mode === 'toc'" key="toc" class="toc-list">
          <div v-if="!filteredToc.length" class="toc-empty">{{ search ? '未找到匹配项' : '暂无目录' }}</div>
          <TocItem v-for="(item, idx) in filteredToc" :key="idx" :item="item" :level="0" />
        </div>
        
        <div v-else-if="mode === 'bookmark'" key="bookmark" class="toc-list">
          <div v-if="!bookmarks.length" class="toc-empty">暂无书签</div>
          <div v-for="(bm, idx) in bookmarks" :key="idx" 
            class="b3-list-item bookmark-item"
            @click="goTo(bm)"
            v-motion-pop-visible>
            <span class="b3-list-item__text fn__flex-1">{{ bm.label }}</span>
            <button class="bookmark-remove-btn" @click.stop="toggleBookmark(bm)">
              <svg style="width:14px;height:14px;color:var(--b3-theme-error)"><use xlink:href="#iconTrashcan"/></svg>
            </button>
          </div>
        </div>
        
        <div v-else-if="mode === 'mark'" key="mark" class="toc-list">
          <div class="toc-empty">标注功能开发中...</div>
        </div>
        
        <div v-else-if="mode === 'note'" key="note" class="toc-list">
          <div class="toc-empty">笔记功能开发中...</div>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, provide, reactive } from 'vue'
import { useReaderState } from '@/composables/useReaderState'
import TocItem from './TocItem.vue'

const props = defineProps<{
  mode?: 'toc' | 'bookmark' | 'mark' | 'note'
  bookmarks?: any[]  // 从父组件传入，不再使用localStorage
}>()

const emit = defineEmits<{ 
  close: []
  toggleBookmark: [item: any]
}>()

const { activeView, getToc, goToLocation } = useReaderState()

// 常量
const PLACEHOLDERS = {
  toc: '搜索目录...',
  bookmark: '搜索书签...',
  mark: '搜索标注...',
  note: '搜索笔记...'
}

// 状态
type Mode = 'toc' | 'bookmark' | 'mark' | 'note'
const mode = ref<Mode>(props.mode || 'toc')
const search = ref('')
const bodyRef = ref<HTMLElement>()
const toc = ref<any[]>([])
const currentHref = ref('')
const reversed = ref(false)
const expanded = ref(new Map<string, boolean>())
// 书签操作（完全移除localStorage，由父组件管理）
const bookmarks = computed(() => props.bookmarks || [])

const toggleBookmark = (item: any) => {
  if (!item.href) return emit('toggleBookmark', item)
  const bookmark = bookmarks.value.find((b: any) => b.label === item.label)
  if (bookmark) return emit('toggleBookmark', bookmark)
  const section = item.href.startsWith('#chapter-') ? parseInt(item.href.replace('#chapter-', '')) : 0
  emit('toggleBookmark', item.cfi ? { label: item.label, cfi: item.cfi, fromToc: true } : { label: item.label, section, fromToc: true })
}

// 通过 label 检查是否已添加书签
const isBookmarked = (label: string) => bookmarks.value.some((b: any) => b.label === label)

// 计算属性
const placeholder = computed(() => PLACEHOLDERS[mode.value] || '搜索...')
const loadToc = () => toc.value = getToc() || []

// 递归处理（过滤+反转）
const processTocItems = (items: any[], query: string, reverse: boolean): any[] => {
  const filter = (arr: any[]): any[] => {
    if (!query) return arr
    const q = query.toLowerCase()
    return arr.reduce((acc, item) => {
      const match = item.label?.toLowerCase().includes(q)
      const subs = item.subitems ? filter(item.subitems) : []
      if (match || subs.length) acc.push({ ...item, subitems: subs.length ? subs : undefined })
      return acc
    }, [])
  }
  
  const reverseTree = (arr: any[]): any[] => 
    [...arr].reverse().map(item => ({
      ...item,
      subitems: item.subitems ? reverseTree(item.subitems) : undefined
    }))
  
  const result = filter(items)
  return reverse ? reverseTree(result) : result
}

const filteredToc = computed(() => processTocItems(toc.value, search.value, reversed.value))

// 导航（支持cfi、section+page、href）
const goTo = async (item: any) => {
  if (item.cfi) {
    await goToLocation(item.cfi)
  } else if (item.section !== undefined) {
    // TXT书签可能有page信息
    await goToLocation({ section: item.section, page: item.page })
  } else if (item.href) {
    await goToLocation(item.href)
  }
}

// 监听位置变化
const updateCurrent = (event?: any) => {
  const d = event?.detail
  if (!d) return
  currentHref.value = d.tocItem?.href ?? (d.section !== undefined ? `#chapter-${d.section}` : currentHref.value)
  setTimeout(scrollToCurrentItem, 500)
}

// 滚动到当前章节
const scrollToCurrentItem = () => {
  const activeItem = bodyRef.value?.querySelector('.toc-item-active')
  activeItem?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const toggleScroll = () => {
  if (!bodyRef.value) return
  const items = bodyRef.value.querySelectorAll('.toc-item, .bookmark-item')
  if (!items.length) return
  const { scrollTop } = bodyRef.value
  const target = scrollTop < 50 ? items[items.length - 1] : items[0]
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const toggleSort = () => reversed.value = !reversed.value
const toggleExpand = (itemId: string) => expanded.value.set(itemId, !(expanded.value.get(itemId) ?? true))

// 提供给递归组件（不要用reactive包装computed）
provide('tocContext', {
  expanded,
  currentHref,
  bookmarks,  // computed本身已经是响应式的
  toggleExpand,
  goTo,
  toggleBookmark,
  isBookmarked
})

// 获取当前TOC项
const getCurrentTocItem = () => {
  const tocItem = activeView.value?.lastLocation?.tocItem
  return tocItem ? { tocItem } : null
}

// 初始化
const initView = () => {
  loadToc()
  const loc = activeView.value?.getLocation?.()
  loc && updateCurrent({ detail: loc })
}

// 监听view变化
watch(activeView, (view, oldView) => {
  oldView?.removeEventListener?.('relocate', updateCurrent)
  if (view) {
    setTimeout(() => {
      view.addEventListener?.('relocate', updateCurrent)
      initView()
    }, 200)
  }
}, { immediate: true })

onMounted(() => setTimeout(initView, 500))
onUnmounted(() => activeView.value?.removeEventListener?.('relocate', updateCurrent))

// 监听props
watch(() => props.mode, (newMode) => newMode && (mode.value = newMode))
</script>

<style lang="scss">
.reader-toc{width:100%;height:100%;display:flex;flex-direction:column}

.toc-toolbar{
  position:sticky;top:0;z-index:10;display:flex;gap:4px;padding:6px 8px;
  border-bottom:1px solid var(--b3-border-color);
  
  input{
    flex:1;height:28px;padding:0 10px;border:none;border-bottom:1px solid var(--b3-border-color);
    font-size:12px;outline:none;transition:border .2s;color:var(--b3-theme-on-background);
    &:focus{border-color:var(--b3-theme-primary)}
    &::placeholder{color:var(--b3-theme-on-surface-light);opacity:0.5}
  }
  
  button{
    width:28px;height:28px;border:none;background:none;cursor:pointer;
    color:var(--b3-theme-on-surface);transition:all .2s;
    svg{width:16px;height:16px}
    &:hover{color:var(--b3-theme-primary);transform:scale(1.05)}
    &:active{transform:scale(0.95)}
  }
}

.toc-body{flex:1;overflow-y:auto;scrollbar-width:thin;
  &::-webkit-scrollbar{width:6px}
  &::-webkit-scrollbar-thumb{background:var(--b3-scroll-color);border-radius:3px}
}

.toc-list{padding:6px 4px}

.toc-item-wrap{
  .toc-item{
    position:relative;
    padding:10px 48px 10px 12px;
    margin:2px 4px;
    border-radius:6px;
    transition:all .25s cubic-bezier(0.4, 0, 0.2, 1);
    cursor:pointer;
    user-select:none;
    border-left:3px solid transparent;
    
    &:hover{
      background:var(--b3-list-hover);
      transform:translateX(2px);
      box-shadow:0 1px 3px rgba(0,0,0,0.06);
      
      .b3-list-item__text{
        color:var(--b3-theme-primary);
        font-weight:500;
      }
      
      .toc-bookmark-btn{
        opacity:0.6 !important;
      }
    }
    
    &.toc-item-active{
      background:linear-gradient(to right, rgba(25, 118, 210, 0.12), rgba(25, 118, 210, 0.02));
      border-left-color:var(--b3-theme-primary);
      border-left-width:4px;
      box-shadow:0 2px 8px rgba(25, 118, 210, 0.15);
      font-weight:500;
      
      .b3-list-item__text{
        color:var(--b3-theme-primary);
        font-weight:600;
      }
      
      &:hover{
        background:linear-gradient(to right, rgba(25, 118, 210, 0.15), rgba(25, 118, 210, 0.03));
      }
    }
  }
  
  .toc-expand-btn{
    width:20px;
    height:20px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    cursor:pointer;
    opacity:0.4;
    transition:all .25s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink:0;
    border-radius:4px;
    
    &:hover{
      opacity:1;
      transform:scale(1.2);
      background:rgba(25, 118, 210, 0.1);
    }
  }
  
  .b3-list-item__text{
    flex:1;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-size:14px;
    line-height:1.8;
    color:var(--b3-theme-on-background);
    transition:all .25s cubic-bezier(0.4, 0, 0.2, 1);
    letter-spacing:0.3px;
  }
  
  .toc-bookmark-btn{
    position:absolute;
    right:12px;
    top:50%;
    transform:translateY(-50%);
    width:26px;
    height:26px;
    padding:0;
    margin:0;
    border:none !important;
    background:transparent !important;
    outline:none !important;
    box-shadow:none !important;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    cursor:pointer;
    opacity:0;
    transition:all .3s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink:0;
    border-radius:50%;
    
    &:hover{
      opacity:1 !important;
      transform:translateY(-50%) scale(1.2) rotate(10deg);
      background:rgba(244, 67, 54, 0.15) !important;
    }
    
    &:active{
      transform:translateY(-50%) scale(0.9) rotate(-5deg);
    }
    
    &.is-bookmarked{
      opacity:1 !important;
      background:rgba(244, 67, 54, 0.08) !important;
      
      &:hover{
        background:rgba(244, 67, 54, 0.18) !important;
      }
    }
    
    svg{
      pointer-events:none;
      filter:drop-shadow(0 1px 2px rgba(0,0,0,0.1));
    }
  }
  
  .toc-item:hover .toc-bookmark-btn{
    opacity:0.5 !important;
  }
}

.bookmark-item{
  cursor:pointer;
  position:relative;
  padding:12px 44px 12px 16px;
  margin:2px 4px;
  transition:all .25s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius:6px;
  border-left:3px solid rgba(244, 67, 54, 0.3);
  
  &:hover{
    background:var(--b3-list-hover);
    transform:translateX(2px);
    box-shadow:0 2px 6px rgba(0,0,0,0.08);
    
    .bookmark-remove-btn{
      opacity:0.6 !important;
    }
  }
  
  .b3-list-item__text{
    font-size:14px;
    line-height:1.8;
    color:var(--b3-theme-on-background);
    font-weight:500;
  }
  
  .bookmark-remove-btn{
    position:absolute;
    right:12px;
    top:50%;
    transform:translateY(-50%);
    width:26px;
    height:26px;
    padding:0;
    margin:0;
    border:none !important;
    background:transparent !important;
    outline:none !important;
    box-shadow:none !important;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    cursor:pointer;
    opacity:0;
    transition:all .3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius:50%;
    
    &:hover{
      opacity:1 !important;
      transform:translateY(-50%) scale(1.2) rotate(-10deg);
      background:rgba(244, 67, 54, 0.15) !important;
    }
    
    &:active{
      transform:translateY(-50%) scale(0.9);
    }
    
    svg{
      pointer-events:none;
      filter:drop-shadow(0 1px 2px rgba(0,0,0,0.1));
    }
  }
}

.toc-empty{
  padding:60px 20px;
  text-align:center;
  color:var(--b3-theme-on-surface-light);
  opacity:0.5;
  font-size:14px;
  line-height:1.8;
}
.fade-enter-active,.fade-leave-active{transition:opacity .2s}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
