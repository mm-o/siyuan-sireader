<template>
  <div class="sr-bs-search">
    <div class="sr-toolbar" v-motion-pop-visible>
      <input v-model="keyword" :placeholder="i18n.searchPlaceholder || '输入书名搜索'" @keyup.enter="search" :disabled="searching">
      <div class="sr-select">
        <button class="b3-tooltips b3-tooltips__s" @click="showSourceMenu = !showSourceMenu" :aria-label="selectedSourceName">
          <svg><use xlink:href="#lucide-sliders-horizontal"></use></svg>
        </button>
        <div v-show="showSourceMenu" class="sr-menu" @click="showSourceMenu = false">
          <div class="sr-menu-item" :class="{active: !selectedSource}" @click="selectedSource = ''">{{ i18n.allSources || '全部书源' }}</div>
          <div v-for="src in enabledSources" :key="src.bookSourceUrl" class="sr-menu-item" :class="{active: selectedSource === src.bookSourceUrl}" @click="selectedSource = src.bookSourceUrl">{{ src.bookSourceName }}</div>
        </div>
      </div>
      <button class="b3-tooltips b3-tooltips__s" @click="emit('openSettings')" :aria-label="i18n.bookSourceManage || '书源管理'">
        <svg><use xlink:href="#lucide-settings-2"></use></svg>
      </button>
    </div>

    <div class="sr-results" ref="resultsContainer" @scroll="onScroll">
      <div 
        v-for="(book, idx) in results" 
        :key="book.bookUrl" 
        v-motion-pop-visible
        class="sr-card"
      >
        <div v-if="book.coverUrl" class="sr-cover">
          <img :src="book.coverUrl" @error="e => e.target.src='/icons/book-placeholder.svg'">
        </div>
        <div class="sr-info">
          <div class="sr-title">{{ book.name }}</div>
          <div class="sr-author">{{ book.author }}</div>
          <div v-if="book.intro" class="sr-intro">{{ book.intro }}</div>
          <div class="sr-meta">
            <span class="sr-source">{{ book.sourceName }}</span>
            <span v-if="book.lastChapter" class="sr-latest">{{ book.lastChapter }}</span>
          </div>
        </div>
        <div class="sr-actions">
          <button class="b3-button b3-button--outline" @click.stop="showDetail(book)">{{ i18n.viewDetail || '详情' }}</button>
          <button v-if="!isInShelf(book)" class="b3-button b3-button--outline" @click.stop="addToShelf(book)">{{ i18n.addToShelf || '加入' }}</button>
          <button v-else class="b3-button b3-button--primary" disabled>{{ i18n.inShelf || '已在架' }}</button>
        </div>
      </div>
      
      <Transition name="fade">
        <div v-if="searching" class="sr-status">
          搜索中... ({{ results.length }})
          <button class="b3-button b3-button--cancel" @click="stopSearch">停止</button>
        </div>
      </Transition>
      
      <Transition name="fade">
        <div v-if="!searching && hasMore" class="sr-status">
          <button class="b3-button b3-button--outline" @click="loadMore">加载更多书源</button>
        </div>
      </Transition>
      
      <Transition name="fade">
        <div v-if="!searching && !hasMore && results.length" class="sr-status sr-done">已加载全部书源</div>
      </Transition>
      
      <Transition name="fade">
        <div v-if="!searching && !results.length && keyword" class="sr-status sr-empty">{{ i18n.noResults }}</div>
      </Transition>
    </div>

    <!-- 详情面板 -->
    <Transition name="slide">
      <div v-if="detailBook" class="sr-detail">
        <div class="sr-detail-header">
          <h3>{{ i18n.viewDetail || '书籍详情' }}</h3>
          <button class="b3-button b3-button--text" @click="detailBook = null">
            <svg><use xlink:href="#iconClose"></use></svg>
          </button>
        </div>

        <div class="sr-detail-content">
          <div class="sr-detail-cover">
            <img :src="detailBook.coverUrl || '/icons/book-placeholder.svg'" @error="e => e.target.src='/icons/book-placeholder.svg'">
          </div>
          
          <div class="sr-detail-info">
            <h2>{{ detailBook.name }}</h2>
            <p class="sr-detail-author">{{ detailBook.author }}</p>
            <div v-if="tags.length" class="sr-tags">
              <span v-for="tag in tags" :key="tag">{{ tag }}</span>
            </div>
            <div class="sr-stats">
              <span v-if="detailBook.wordCount">{{ i18n.wordCount || '字数' }}：{{ detailBook.wordCount }}</span>
              <span>{{ i18n.source || '来源' }}：{{ detailBook.sourceName }}</span>
              <span v-if="detailBook.lastChapter">{{ i18n.latest || '最新' }}：{{ detailBook.lastChapter }}</span>
            </div>
            <p v-if="detailBook.intro" class="sr-detail-intro">{{ detailBook.intro }}</p>
            
            <div class="sr-detail-actions">
              <button v-if="!isInShelf(detailBook)" class="b3-button b3-button--primary" @click="addToShelf(detailBook)">
                <svg><use xlink:href="#iconAdd"></use></svg>{{ i18n.addToShelf || '加入书架' }}
              </button>
              <button v-else class="b3-button b3-button--primary" disabled>
                <svg><use xlink:href="#iconCheck"></use></svg>{{ i18n.inShelf || '已在书架' }}
              </button>
              <button class="b3-button b3-button--outline" @click="emit('read', detailBook)">
                <svg><use xlink:href="#iconRead"></use></svg>{{ i18n.readOnline || '在线阅读' }}
              </button>
            </div>
          </div>

          <div class="sr-chapters">
            <div class="sr-chapters-header">
              <h4>{{ i18n.chapters || '目录' }} ({{ chapters.length }})</h4>
              <button class="b3-button b3-button--text" @click="reversed = !reversed">
                <svg><use xlink:href="#iconSort"></use></svg>{{ i18n.reverse || '倒序' }}
              </button>
            </div>
            
            <Transition name="fade" mode="out-in">
              <div v-if="loadingChapters" key="loading" class="sr-loading">{{ i18n.loadingChapters || '加载章节中...' }}</div>
              <div v-else-if="!chapters.length" key="empty" class="sr-empty">{{ i18n.noChapters || '暂无章节' }}</div>
              <div v-else key="list" class="sr-chapters-list">
                <div v-for="(chapter, index) in displayChapters" :key="index" class="sr-chapter-item" @click="emit('read', detailBook)">
                  {{ chapter.name || chapter.title || `第${index + 1}章` }}
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { bookSourceManager } from '@/core/book'
import { bookshelfManager } from '@/core/bookshelf'
import { showMessage } from 'siyuan'

const props = defineProps<{ i18n: any }>()
const emit = defineEmits(['read', 'openSettings'])

const isInShelf = (book: any) => bookshelfManager.hasBook(book.bookUrl)
const detailBook = ref<any>(null)
const chapters = ref<any[]>([])
const reversed = ref(false)
const loadingChapters = ref(false)

const tags = computed(() => detailBook.value?.kind?.split(',').filter(Boolean) || [])
const displayChapters = computed(() => reversed.value ? [...chapters.value].reverse() : chapters.value)

const keyword = ref('')
const selectedSource = ref('')
const showSourceMenu = ref(false)
const searching = ref(false)
const results = ref<SearchResult[]>([])
const resultsContainer = ref<HTMLElement>()
const hasMore = ref(false)
const searchIterator = ref<AsyncGenerator<SearchResult[]> | null>(null)

const enabledSources = computed(() => bookSourceManager.getEnabledSources())
const selectedSourceName = computed(() => {
  if (!selectedSource.value) return props.i18n.allSources || '全部书源'
  const src = enabledSources.value.find(s => s.bookSourceUrl === selectedSource.value)
  return src?.bookSourceName || ''
})

// 搜索：初始加载第一批
const search = async () => {
  if (!keyword.value.trim()) return
  
  searching.value = true
  results.value = []
  hasMore.value = true
  
  try {
    // 创建迭代器
    searchIterator.value = bookSourceManager.searchBooksStream(keyword.value, selectedSource.value || undefined)
    
    // 加载第一批（10个书源）
    await loadMore()
  } catch (e: any) {
    alert('搜索失败: ' + e.message)
  } finally {
    searching.value = false
  }
}

// 加载更多
const loadMore = async () => {
  if (!searchIterator.value || searching.value) return
  
  searching.value = true
  try {
    const { value, done } = await searchIterator.value.next()
    if (done) {
      hasMore.value = false
    } else if (value) {
      results.value.push(...value)
    }
  } catch (e: any) {
    alert('加载失败: ' + e.message)
  } finally {
    searching.value = false
  }
}

const stopSearch = () => {
  searchIterator.value = null
  hasMore.value = false
  searching.value = false
}

const showDetail = async (book: any) => {
  detailBook.value = book
  await loadChapters()
}

const loadChapters = async () => {
  if (!detailBook.value) return
  loadingChapters.value = true
  chapters.value = []
  try {
    const bookInfo = await bookSourceManager.getBookInfo(detailBook.value.sourceUrl || detailBook.value.origin, detailBook.value.bookUrl)
    const tocUrl = bookInfo.tocUrl || detailBook.value.bookUrl
    chapters.value = await bookSourceManager.getChapters(detailBook.value.sourceUrl || detailBook.value.origin, tocUrl)
  } catch (e: any) {
    showMessage(`${props.i18n.loadChaptersFailed || '加载章节失败'}: ${e.message}`, 3000, 'error')
  } finally {
    loadingChapters.value = false
  }
}

const addToShelf = async (book: any) => {
  try {
    await bookshelfManager.addBook({
      bookUrl: book.bookUrl,
      tocUrl: book.tocUrl || book.bookUrl,
      origin: book.sourceUrl || book.origin,
      originName: book.sourceName || book.originName,
      name: book.name,
      author: book.author,
      kind: book.kind,
      coverUrl: book.coverUrl,
      intro: book.intro,
      wordCount: book.wordCount,
    })
    showMessage(`《${book.name}》${props.i18n.addedToShelf || '已加入书架'}`, 2000, 'info')
  } catch (e: any) {
    showMessage(e.message, 3000, 'error')
  }
}

// 滚动到底部自动加载
const onScroll = () => {
  if (!resultsContainer.value || searching.value || !hasMore.value) return
  const { scrollTop, scrollHeight, clientHeight } = resultsContainer.value
  if (scrollTop + clientHeight >= scrollHeight - 100) {
    loadMore()
  }
}

</script>

<style scoped lang="scss">
.sr-bs-search{display:flex;flex-direction:column;height:100%;background:var(--b3-theme-background)}
.sr-toolbar{position:sticky;top:0;z-index:10}
.sr-results{flex:1;overflow-y:auto;padding:18px 20px 20px}
.sr-card{display:flex;gap:14px;padding:16px;margin-bottom:14px;background:var(--b3-theme-surface);border-radius:8px;box-shadow:0 1px 3px #0000000d;transition:all .25s cubic-bezier(.4,0,.2,1);
  &:hover{box-shadow:0 4px 10px #00000014;transform:translateY(-2px)}
}
.sr-cover{width:68px;height:95px;border-radius:6px;flex-shrink:0;overflow:hidden;background:var(--b3-theme-background);
  img{width:100%;height:100%;object-fit:cover}
}
.sr-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.sr-title{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--b3-theme-on-surface)}
.sr-author{font-size:12px;opacity:.75;font-weight:500}
.sr-intro{font-size:11px;opacity:.65;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;line-height:1.5}
.sr-meta{display:flex;gap:10px;font-size:10px;margin-top:auto;padding-top:4px}
.sr-source{color:var(--b3-theme-primary);font-weight:600;padding:2px 8px;background:var(--b3-theme-primary-lightest);border-radius:4px}
.sr-latest{opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-actions{display:flex;flex-direction:column;gap:8px;align-self:flex-start;
  button{padding:6px 14px;font-size:12px;transition:all .2s;white-space:nowrap;&:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 2px 6px rgba(0,0,0,.1)}}
}
.sr-status{padding:18px;text-align:center;background:var(--b3-theme-surface);border-radius:8px;margin:0 0 14px;font-size:13px;box-shadow:0 1px 3px #0000000d;
  button{margin-left:10px}
}
.sr-done{opacity:.6}
.sr-empty{padding:40px;opacity:.6;font-size:13px}
.fade-enter-active, .fade-leave-active { transition:opacity .3s; }
.fade-enter-from, .fade-leave-to { opacity:0; }
.slide-enter-active { transition: all .25s cubic-bezier(.4,0,.2,1); }
.slide-leave-active { transition: all .2s cubic-bezier(.4,0,1,1); }
.slide-enter-from { opacity: 0; transform: translateX(15px); }
.slide-leave-to { opacity: 0; transform: translateX(-15px); }
.expand-enter-active, .expand-leave-active { transition: all .3s cubic-bezier(.4,0,.2,1); overflow: hidden; }
.expand-enter-from, .expand-leave-to { max-height: 0; opacity: 0; transform: scaleY(.9); }
.expand-enter-to, .expand-leave-from { max-height: 400px; opacity: 1; transform: scaleY(1); }

.sr-detail { position:absolute; top:0; right:0; bottom:0; width:400px; background:var(--b3-theme-background); box-shadow:-4px 0 16px #0003; z-index:10; display:flex; flex-direction:column; }
.sr-detail-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid var(--b3-border-color);
  h3 { margin:0; font-size:16px; font-weight:600; }
  button { opacity:.6; &:hover { opacity:1; } }
}
.sr-detail-content { flex:1; overflow-y:auto; padding:20px; }
.sr-detail-cover { text-align:center; margin-bottom:20px;
  img { width:160px; height:220px; object-fit:cover; border-radius:8px; box-shadow:0 4px 12px #0003; }
}
.sr-detail-info { 
  h2 { font-size:20px; font-weight:600; margin:0 0 8px; }
}
.sr-detail-author { font-size:14px; opacity:.75; margin:0 0 12px; }
.sr-tags { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;
  span { padding:4px 12px; background:var(--b3-theme-surface); border-radius:12px; font-size:12px; }
}
.sr-stats { display:flex; flex-direction:column; gap:6px; font-size:13px; opacity:.7; margin-bottom:16px;
  span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
}
.sr-detail-intro { line-height:1.6; opacity:.85; margin-bottom:20px; font-size:14px; }
.sr-detail-actions { display:flex; gap:12px; margin-bottom:24px;
  button { flex:1; transition:all .2s;
    svg { width:16px; height:16px; margin-right:6px; }
    &:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 4px 8px #0003; }
  }
}
.sr-chapters { background:var(--b3-theme-surface); border-radius:8px; padding:16px; }
.sr-chapters-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--b3-border-color);
  h4 { margin:0; font-size:14px; font-weight:600; }
}
.sr-loading, .sr-empty { padding:32px 20px; text-align:center; opacity:.5; font-size:13px; }
.sr-chapters-list { max-height:400px; overflow-y:auto; }
.sr-chapter-item { padding:10px 12px; cursor:pointer; border-radius:4px; transition:all .2s; font-size:13px;
  &:hover { background:var(--b3-list-hover); }
}

.slide-left-enter-active, .slide-left-leave-active { transition:all .3s cubic-bezier(.4,0,.2,1); }
.slide-left-enter-from { transform:translateX(100%); opacity:0; }
.slide-left-leave-to { transform:translateX(100%); opacity:0; }

@media (max-width:640px) {
  .sr-toolbar { flex-direction:column; margin:12px; }
  .sr-search-input, .sr-toolbar select { width:100%; }
  .sr-results { padding:12px; }
  .sr-card { flex-direction:column; }
  .sr-cover { width:100%; height:180px; }
  .sr-actions { flex-direction:row; }
  .sr-detail { width:100%; }
  .sr-detail-actions { 
    flex-direction:column;
    button { width:100%; }
  }
}
</style>
