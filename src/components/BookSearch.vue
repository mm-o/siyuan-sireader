<template>
  <div class="sr-search" @click="showSourceMenu = false">
    <div class="sr-toolbar">
      <input v-model="keyword" :placeholder="i18n.searchPlaceholder || '输入书名搜索'" @keyup.enter="search" :disabled="searching">
      <div class="sr-select">
        <button class="b3-tooltips b3-tooltips__s" @click.stop="showSourceMenu = !showSourceMenu" :aria-label="selectedSourceName">
          <svg><use xlink:href="#lucide-sliders-horizontal"/></svg>
        </button>
        <div v-if="showSourceMenu" class="sr-menu" @click.stop>
          <div :class="['sr-menu-item', { active: !selectedSource }]" @click="selectedSource = ''; showSourceMenu = false">{{ i18n.allSources || '全部书源' }}</div>
          <div v-if="annaEnabled" :class="['sr-menu-item', { active: selectedSource === 'anna' }]" @click="selectedSource = 'anna'; showSourceMenu = false">{{ i18n.annaArchive || '安娜的档案' }}</div>
          <div v-for="src in enabledSources" :key="src.bookSourceUrl" :class="['sr-menu-item', { active: selectedSource === src.bookSourceUrl }]" @click="selectedSource = src.bookSourceUrl; showSourceMenu = false">{{ src.bookSourceName }}</div>
        </div>
      </div>
      <button class="b3-tooltips b3-tooltips__s" @click="showSourceMgr = !showSourceMgr" :aria-label="i18n.bookSourceManage || '书源管理'">
        <svg><use xlink:href="#lucide-settings-2"/></svg>
      </button>
    </div>

    <!-- 书源管理面板 -->
    <Transition name="slide">
      <SourceMgr v-if="showSourceMgr" @close="showSourceMgr = false" />
    </Transition>

    <div v-show="!showSourceMgr" class="sr-results" ref="resultsContainer" @scroll="onScroll">
      <div v-if="!searching && !results.length && keyword" class="sr-placeholder">{{ i18n.noResults || '未找到书籍' }}</div>
      <div v-else class="sr-list">
        <div v-for="book in results" :key="book.bookUrl" 
             v-motion
             :initial="{ opacity: 0, y: 15 }"
             :enter="{ opacity: 1, y: 0, transition: { delay: results.indexOf(book) * 20 } }"
             class="sr-card" @click="showDetail(book)">
          <div class="sr-cover-wrap">
            <img v-if="shouldShowCover(book)" :src="book.coverUrl" @error="handleCoverError(book)" class="sr-cover">
            <div v-else class="sr-text-cover">{{ book.name }}</div>
          </div>
          <div class="sr-info">
            <div class="sr-title">{{ book.name }}</div>
            <div class="sr-author">{{ book.author }}</div>
            <div v-if="book.kind" class="sr-author">{{ book.kind }}</div>
            <div v-if="book.extension || book.fileSize" class="sr-author">
              <span v-if="book.extension">{{ book.extension }}</span>
              <span v-if="book.extension && book.fileSize"> · </span>
              <span v-if="book.fileSize">{{ book.fileSize }}</span>
            </div>
            <div v-if="book.intro" class="sr-intro">{{ book.intro }}</div>
            <div v-if="book.lastChapter" class="sr-chapter">{{ book.lastChapter }}</div>
            <div class="sr-source">{{ book.sourceName }}</div>
          </div>
          <button v-if="isAnnaBook(book)" class="sr-btn sr-btn-icon b3-tooltips b3-tooltips__w" :aria-label="i18n.openLink || '打开链接'" @click.stop="openAnnaLink(book.bookUrl)">
            <svg><use xlink:href="#iconLink"/></svg>
          </button>
          <button v-else class="sr-btn sr-btn-icon b3-tooltips b3-tooltips__w" :class="{ active: isInShelf(book) }" :aria-label="isInShelf(book) ? '已在书架' : '加入书架'" @click.stop="addToShelf(book)">
            <svg><use :xlink:href="isInShelf(book) ? '#iconCheck' : '#iconAdd'"/></svg>
          </button>
        </div>
      </div>
      
      <div v-if="searching" class="sr-status">
        <span>搜索中... ({{ results.length }})</span>
        <button class="sr-btn sr-btn-text" @click="stopSearch">停止</button>
      </div>
      
      <div v-if="!searching && hasMore" class="sr-status">
        <button class="sr-btn sr-btn-primary" @click="loadMore">加载更多</button>
      </div>
      
      <div v-if="!searching && !hasMore && results.length" class="sr-status">已加载全部</div>
    </div>

    <Transition name="slide">
      <div v-if="detailBook" class="sr-detail">
        <div class="sr-detail-header">
          <span>书籍详情</span>
          <button class="sr-btn sr-btn-icon" @click="detailBook = null">
            <svg><use xlink:href="#iconClose"/></svg>
          </button>
        </div>

        <div class="sr-detail-content">
          <img class="sr-cover-large" :src="detailBook.coverUrl || '/icons/book-placeholder.svg'" @error="e => e.target.src='/icons/book-placeholder.svg'">
          
          <h2>{{ detailBook.name }}</h2>
          <p class="sr-meta">{{ detailBook.author }}</p>
          
          <div v-if="tags.length || detailBook.extension || detailBook.fileSize || detailBook.language || detailBook.year" class="sr-tags">
            <span v-for="tag in tags" :key="tag">{{ tag }}</span>
            <span v-if="detailBook.extension">{{ detailBook.extension }}</span>
            <span v-if="detailBook.fileSize">{{ detailBook.fileSize }}</span>
            <span v-if="detailBook.language">{{ detailBook.language }}</span>
            <span v-if="detailBook.year">{{ detailBook.year }}</span>
          </div>
          
          <p v-if="detailBook.intro" class="sr-intro-full">{{ detailBook.intro }}</p>
          
          <div v-if="isAnnaBook(detailBook)" class="sr-actions-full">
            <button class="sr-btn sr-btn-primary" @click="openAnnaLink(detailBook.bookUrl)">
              <svg><use xlink:href="#iconLink"/></svg>{{ i18n.openLink || '打开链接' }}
            </button>
          </div>
          <div v-else class="sr-actions-full">
            <button class="sr-btn sr-btn-primary" :class="{ active: isInShelf(detailBook) }" @click="isInShelf(detailBook) || addToShelf(detailBook)">
              <svg><use :xlink:href="isInShelf(detailBook) ? '#iconCheck' : '#iconAdd'"/></svg>
              {{ isInShelf(detailBook) ? '已在书架' : '加入书架' }}
            </button>
            <button class="sr-btn sr-btn-primary" @click="emit('read', detailBook)">
              <svg><use xlink:href="#iconRead"/></svg>开始阅读
            </button>
          </div>

          <div v-if="!isAnnaBook(detailBook)" class="sr-chapters">
            <div class="sr-chapters-header">
              <span>目录 {{ chapters.length }}</span>
              <button class="sr-btn sr-btn-icon" @click="reversed = !reversed">
                <svg><use xlink:href="#iconSort"/></svg>
              </button>
            </div>
            
            <div v-if="loadingChapters" class="sr-placeholder">加载中...</div>
            <div v-else-if="!chapters.length" class="sr-placeholder">暂无章节</div>
            <div v-else class="sr-chapters-list">
              <div v-for="(chapter, index) in displayChapters" :key="index" class="sr-chapter-item" @click="emit('read', detailBook)">
                {{ chapter.name || chapter.title || `第${index + 1}章` }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { bookSourceManager } from '@/core/book'
import { bookshelfManager } from '@/core/bookshelf'
import { showMessage } from 'siyuan'
import SourceMgr from './SourceMgr.vue'

const props = defineProps<{ i18n: any }>()
const emit = defineEmits(['read'])

const isInShelf = (book: any) => bookshelfManager.hasBook(book.bookUrl)
const isAnnaBook = (book: any) => book.bookUrl?.includes('annas-archive.org')
const detailBook = ref<any>(null)
const chapters = ref<any[]>([])
const reversed = ref(false)
const loadingChapters = ref(false)
const showSourceMgr = ref(false)

const tags = computed(() => detailBook.value?.kind?.split(',').filter(Boolean) || [])
const displayChapters = computed(() => reversed.value ? [...chapters.value].reverse() : chapters.value)

const openAnnaLink = (url: string) => {
  const isChinese = props.i18n.name === '思阅'
  const targetUrl = isChinese ? url.replace('annas-archive.org', 'zh.annas-archive.org') : url
  window.open(targetUrl, '_blank')
}

const keyword = ref('')
const selectedSource = ref('')
const showSourceMenu = ref(false)
const searching = ref(false)
const results = ref<SearchResult[]>([])
const resultsContainer = ref<HTMLElement>()
const hasMore = ref(false)
const searchIterator = ref<AsyncGenerator<SearchResult[]> | null>(null)
const annaEnabled = ref(localStorage.getItem('anna_enabled') === 'true')
const failedCovers = new Set<string>()

const enabledSources = computed(() => bookSourceManager.getEnabledSources())
const selectedSourceName = computed(() => {
  if (!selectedSource.value) return props.i18n.allSources || '全部书源'
  if (selectedSource.value === 'anna') return props.i18n.annaArchive || '安娜的档案'
  const src = enabledSources.value.find(s => s.bookSourceUrl === selectedSource.value)
  return src?.bookSourceName || ''
})
const shouldShowCover = (book: any) => book.coverUrl && !failedCovers.has(book.coverUrl)
const handleCoverError = (book: any) => failedCovers.add(book.coverUrl)

const search = async () => {
  if (!keyword.value.trim()) return
  searching.value = true
  results.value = []
  hasMore.value = true
  try {
    const isAnnaOnly = selectedSource.value === 'anna'
    const enableAnna = isAnnaOnly || (!selectedSource.value && annaEnabled.value)
    searchIterator.value = bookSourceManager.searchBooksStream(keyword.value, isAnnaOnly ? undefined : selectedSource.value || undefined, 1, enableAnna)
    await loadMore()
  } catch (e: any) {
    showMessage('搜索失败: ' + e.message, 3000, 'error')
  } finally {
    searching.value = false
  }
}

const loadMore = async () => {
  if (!searchIterator.value || searching.value) return
  searching.value = true
  try {
    const { value, done } = await searchIterator.value.next()
    hasMore.value = !done
    if (value) results.value.push(...value)
  } catch (e: any) {
    showMessage('加载失败: ' + e.message, 3000, 'error')
  } finally {
    searching.value = false
  }
}

const stopSearch = () => {
  searchIterator.value = null
  hasMore.value = false
  searching.value = false
}

const showDetail = (book: any) => {
  detailBook.value = book
  if (!isAnnaBook(book)) loadChapters()
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
    showMessage(`加载章节失败: ${e.message}`, 3000, 'error')
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
    showMessage(`《${book.name}》已加入书架`, 2000, 'info')
  } catch (e: any) {
    showMessage(e.message, 3000, 'error')
  }
}

const onScroll = () => {
  if (!resultsContainer.value || searching.value || !hasMore.value) return
  const { scrollTop, scrollHeight, clientHeight } = resultsContainer.value
  if (scrollTop + clientHeight >= scrollHeight - 100) loadMore()
}

const handleAnnaToggle = () => annaEnabled.value = localStorage.getItem('anna_enabled') === 'true'

onMounted(() => window.addEventListener('anna-toggle', handleAnnaToggle))
onUnmounted(() => window.removeEventListener('anna-toggle', handleAnnaToggle))
</script>

<style scoped lang="scss">
// 统一按钮样式
.sr-btn{border:none;cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:4px;
  svg{width:14px;height:14px}
  &:active{transform:scale(.95)}
}
.sr-btn-icon{width:28px;height:28px;padding:0;background:transparent;color:var(--b3-theme-on-surface);opacity:.5;border-radius:4px;
  &:hover{opacity:1;background:var(--b3-theme-surface)}
  &.active{opacity:1;color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest)}
}
.sr-btn-primary{height:32px;padding:0 14px;background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);border-radius:4px;font-size:12px;font-weight:500;
  &:hover{transform:translateY(-1px);box-shadow:0 2px 6px #0003}
  &.active{opacity:.5;pointer-events:none}
}
.sr-btn-text{height:28px;padding:0 10px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);border-radius:4px;font-size:11px;
  &:hover{background:var(--b3-theme-background)}
}

.sr-search{position:relative;display:flex;flex-direction:column;height:100%;overflow:hidden}
.sr-results{flex:1;overflow-y:auto;padding:12px 8px;min-height:0}
.sr-list{display:flex;flex-direction:column;gap:8px}
.sr-card{display:flex;gap:12px;padding:12px;background:var(--b3-theme-surface);border-radius:6px;cursor:pointer;transition:transform .15s;&:hover{transform:translateY(-2px)}}
.sr-cover-wrap{width:80px;height:112px;border-radius:4px;flex-shrink:0;overflow:hidden;background:linear-gradient(135deg,var(--b3-theme-primary-lightest),var(--b3-theme-surface-lighter))}
.sr-cover{width:100%;height:100%;object-fit:cover}
.sr-text-cover{width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:8px;font-size:12px;font-weight:600;text-align:center;line-height:1.3;color:var(--b3-theme-on-surface);word-break:break-word;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}
.sr-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.sr-title{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-author{font-size:11px;opacity:.6}
.sr-intro{font-size:11px;opacity:.5;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;line-height:1.4}
.sr-chapter{font-size:10px;opacity:.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:auto}
.sr-source{font-size:10px;color:var(--b3-theme-primary);font-weight:600;padding:2px 6px;background:var(--b3-theme-primary-lightest);border-radius:3px;align-self:flex-start}
.sr-status{display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;background:var(--b3-theme-surface);border-radius:6px;margin:0 0 8px;font-size:12px;opacity:.7}
.sr-placeholder{padding:40px;text-align:center;opacity:.5;font-size:12px}
.slide-enter-active{transition:all .2s cubic-bezier(.4,0,.2,1)}
.slide-leave-active{transition:all .15s cubic-bezier(.4,0,1,1)}
.slide-enter-from{opacity:0;transform:translateX(15px)}
.slide-leave-to{opacity:0;transform:translateX(-15px)}

.sr-detail{position:absolute;top:0;right:0;bottom:0;width:320px;background:var(--b3-theme-background);box-shadow:-4px 0 12px #0003;z-index:10;display:flex;flex-direction:column}
.sr-detail-header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--b3-border-color);
  span{font-size:13px;font-weight:600}
}
.sr-detail-content{flex:1;overflow-y:auto;padding:16px;
  h2{font-size:16px;font-weight:600;margin:0 0 4px}
  .sr-meta{font-size:12px;opacity:.6;margin:0 0 10px}
}
.sr-cover-large{width:100%;height:auto;aspect-ratio:7/10;object-fit:cover;border-radius:6px;margin-bottom:12px}
.sr-tags{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;
  span{padding:2px 8px;background:var(--b3-theme-surface);border-radius:8px;font-size:10px}
}
.sr-intro-full{line-height:1.5;opacity:.7;margin-bottom:14px;font-size:12px}
.sr-actions-full{display:flex;gap:6px;margin-bottom:14px;
  button{flex:1}
}
.sr-chapters{background:var(--b3-theme-surface);border-radius:6px;padding:10px}
.sr-chapters-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--b3-border-color);
  span{font-size:12px;font-weight:600}
}
.sr-chapters-list{max-height:320px;overflow-y:auto}
.sr-chapter-item{padding:7px 8px;cursor:pointer;border-radius:4px;transition:background .15s;font-size:11px;
  &:hover{background:var(--b3-list-hover)}
}

@media (max-width:640px) {
  .sr-card{flex-direction:column}
  .sr-cover-wrap{width:100%;height:180px}
  .sr-detail{width:100%}
}
</style>
