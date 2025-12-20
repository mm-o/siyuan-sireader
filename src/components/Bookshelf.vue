<template>
  <div class="sr-bookshelf fn__flex-1 fn__flex-column b3-scroll">
    <div class="sr-toolbar">
      <input v-model="keyword" :placeholder="i18n.searchPlaceholder || '搜索...'">
      <div class="sr-select" v-if="tags.length > 1">
        <button class="b3-tooltips b3-tooltips__s" @click="showTagMenu = !showTagMenu" :aria-label="activeTag">
          <svg><use xlink:href="#lucide-sliders-horizontal"/></svg>
        </button>
        <div v-if="showTagMenu" class="sr-menu" @click="showTagMenu = false">
          <div v-for="tag in tags" :key="tag" :class="['sr-menu-item', { active: activeTag === tag }]" @click="activeTag = tag">{{ tag }}</div>
        </div>
      </div>
      <div class="sr-select">
        <button class="b3-tooltips b3-tooltips__s" @click="showSortMenu = !showSortMenu" :aria-label="sortLabel">
          <svg><use xlink:href="#lucide-clock-plus"/></svg>
        </button>
        <div v-if="showSortMenu" class="sr-menu" @click="showSortMenu = false">
          <div v-for="s in SORTS" :key="s.value" :class="['sr-menu-item', { active: sortType === s.value }]" @click="changeSort(s.value)">{{ s.label }}</div>
        </div>
      </div>
      <button class="b3-tooltips b3-tooltips__s" @click="toggleViewMode" :aria-label="viewMode === 'grid' ? '网格' : viewMode === 'list' ? '列表' : '简洁'">
        <svg><use xlink:href="#lucide-panels-top-left"/></svg>
      </button>
      <button class="b3-tooltips b3-tooltips__s" @click="checkAllUpdates" :aria-label="i18n.checkUpdate || '检查更新'">
        <svg><use xlink:href="#lucide-list-restart"/></svg>
      </button>
      <button class="b3-tooltips b3-tooltips__s" @click="triggerFileUpload" :aria-label="i18n.addBook || '添加书籍'">
        <svg><use xlink:href="#lucide-book-plus"/></svg>
      </button>
    </div>
    <input ref="fileInput" type="file" accept=".epub,.pdf,.mobi,.azw3,.azw,.fb2,.cbz,.txt" multiple style="display:none" @change="handleFileUpload">
    
    <div class="sr-books" :class="viewMode">
      <Transition name="fade" mode="out-in">
        <div v-if="!displayBooks.length" key="empty" class="sr-empty">{{ keyword ? (i18n.noResults || '未找到书籍') : (i18n.emptyShelf || '暂无书籍') }}</div>
        <div v-else key="books" :class="`sr-${viewMode}`">
          <div v-for="book in displayBooks" :key="book.bookUrl" 
               v-motion
               :initial="{ opacity: 0, y: 20 }"
               :enter="{ opacity: 1, y: 0, transition: { delay: displayBooks.indexOf(book) * 20 } }"
               :leave="{ opacity: 0, scale: 0.8, transition: { duration: 200 } }"
               class="sr-card">
            <div v-if="viewMode !== 'compact'" class="sr-cover-wrap" @click="readBook(book)">
              <img v-if="getCoverUrl(book)" :src="getCoverUrl(book)" class="sr-cover" :alt="book.name">
              <div v-else class="sr-text-cover">{{ book.name }}</div>
              <div class="sr-format-tag">{{ book.format.toUpperCase() }}</div>
              <div v-if="book.lastCheckCount > 0" class="sr-badge">{{ book.lastCheckCount }}</div>
              <div class="sr-progress" :style="{ width: getProgress(book) + '%' }"></div>
            </div>
            <div class="sr-info" @click="readBook(book)">
              <div class="sr-title" :title="book.name">{{ book.name }}</div>
              <div class="sr-meta">{{ book.author }}</div>
              <div class="sr-progress-info">
                <span class="sr-percent">{{ getProgress(book) }}%</span>
                <span class="sr-chapter">{{ book.durChapterIndex + 1 }}/{{ book.totalChapterNum }}</span>
              </div>
            </div>
            <Transition name="confirm">
              <div v-if="removingBook === book.bookUrl" 
                   v-motion
                   :initial="{ opacity: 0, scale: 0.9 }"
                   :enter="{ opacity: 1, scale: 1 }"
                   class="sr-remove-confirm" @click.stop>
                <button class="sr-btn-cancel" @click="removingBook = null">取消</button>
                <button class="sr-btn-confirm" @click="confirmRemove(book)">移出</button>
              </div>
            </Transition>
            <button v-if="removingBook !== book.bookUrl" class="sr-btn-remove" @click.stop="removingBook = book.bookUrl" :aria-label="i18n.remove || '移出'">
              <svg><use xlink:href="#iconTrashcan"/></svg>
            </button>
          </div>
        </div>
      </Transition>
    </div>
    

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { bookshelfManager, type BookIndex } from '@/core/bookshelf'
import { showMessage } from 'siyuan'

const props = defineProps<{ i18n: any }>()
const emit = defineEmits(['read'])

const SORTS = [
  { value: 'time', label: '最近阅读' },
  { value: 'name', label: '书名' },
  { value: 'author', label: '作者' },
  { value: 'update', label: '最近更新' }
] as const

const books = ref<BookIndex[]>([])
const keyword = ref('')
const activeTag = ref('全部')
const sortType = ref<'time' | 'name' | 'author' | 'update'>('time')
const showTagMenu = ref(false)
const showSortMenu = ref(false)
const viewMode = ref<'grid' | 'list' | 'compact'>('grid')
const removingBook = ref<string | null>(null)
const fileInput = ref<HTMLInputElement>()
const coverCache = new Map<string, string | null>()

const FORMAT_LABELS: Record<string, string> = { epub: 'EPUB', pdf: 'PDF', mobi: 'MOBI', azw3: 'AZW3', fb2: 'FB2', cbz: 'CBZ', txt: 'TXT', online: '在线' }
const TEXT_COVER_FORMATS = ['txt', 'pdf', 'mobi', 'azw3']

const tags = computed(() => ['全部', ...new Set(books.value.map(b => FORMAT_LABELS[b.format] || b.format.toUpperCase()))])
const sortLabel = computed(() => SORTS.find(s => s.value === sortType.value)?.label || '')

const displayBooks = computed(() => {
  let list = books.value
  if (activeTag.value !== '全部') list = list.filter(b => FORMAT_LABELS[b.format] === activeTag.value)
  if (keyword.value) {
    const kw = keyword.value.toLowerCase()
    list = list.filter(b => b.name.toLowerCase().includes(kw) || b.author.toLowerCase().includes(kw))
  }
  return list
})

const getProgress = (book: BookIndex) => {
  if (book.epubProgress) return book.epubProgress
  if (book.totalChapterNum > 0) return Math.round(((book.durChapterIndex + 1) / book.totalChapterNum) * 100)
  return 0
}

const getCoverUrl = (book: BookIndex) => {
  if (TEXT_COVER_FORMATS.includes(book.format)) return ''
  if (!book.coverUrl) return ''
  if (book.coverUrl.startsWith('/data/')) {
    if (coverCache.has(book.coverUrl)) return coverCache.get(book.coverUrl) || ''
    loadCover(book.coverUrl)
    return ''
  }
  return book.coverUrl
}

const loadCover = async (path: string) => {
  try {
    const res = await fetch('/api/file/getFile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) })
    if (!res.ok) throw new Error()
    coverCache.set(path, URL.createObjectURL(await res.blob()))
    books.value = [...books.value]
  } catch {
    coverCache.set(path, null)
  }
}

const readBook = async (book: BookIndex) => {
  const full = await bookshelfManager.getBook(book.bookUrl)
  full ? emit('read', full) : showMessage('加载失败', 3000, 'error')
}

const checkAllUpdates = async () => {
  const results = await bookshelfManager.checkAllUpdates()
  refreshBooks()
  const cnt = results.filter(r => r.hasUpdate).length
  showMessage(cnt > 0 ? `${cnt} 本书有更新` : '已是最新', 2000, 'info')
}

const confirmRemove = async (book: BookIndex) => {
  removingBook.value = null
  try {
    await bookshelfManager.removeBook(book.bookUrl)
    await new Promise(resolve => setTimeout(resolve, 200))
    refreshBooks()
  } catch (e: any) { showMessage(e.message, 3000, 'error') }
}

const refreshBooks = () => books.value = bookshelfManager.getBooks()

const changeSort = async (type: 'time' | 'name' | 'author' | 'update') => {
  sortType.value = type
  await bookshelfManager.sortBooks(type)
  refreshBooks()
}

const toggleViewMode = () => {
  const modes: Array<'grid' | 'list' | 'compact'> = ['grid', 'list', 'compact']
  viewMode.value = modes[(modes.indexOf(viewMode.value) + 1) % 3]
  localStorage.setItem('sr-view-mode', viewMode.value)
}

const triggerFileUpload = () => fileInput.value?.click()

const handleFileUpload = async (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  if (!files.length) return
  
  let success = 0, failed = 0
  
  for (const file of files) {
    try {
      await bookshelfManager.addLocalBook(file)
      success++
    } catch {
      failed++
    }
  }
  
  await bookshelfManager.init(true)
  refreshBooks()
  
  if (failed === 0) showMessage(`导入 ${success} 本`, 2000, 'info')
  else if (success === 0) showMessage('导入失败', 3000, 'error')
  else showMessage(`成功 ${success} 本，失败 ${failed} 本`, 3000, 'info')
  
  if (fileInput.value) fileInput.value.value = ''
}

onMounted(async () => {
  viewMode.value = (localStorage.getItem('sr-view-mode') as any) || 'grid'
  await bookshelfManager.init()
  refreshBooks()
  window.addEventListener('sireader:bookshelf-updated',refreshBooks)
})
onUnmounted(()=>window.removeEventListener('sireader:bookshelf-updated',refreshBooks))
</script>

<style scoped lang="scss">
.sr-bookshelf{display:flex;flex-direction:column;height:100%;overflow:hidden}
.sr-toolbar{position:relative;z-index:10}
.sr-books{flex:1;overflow-y:auto;padding:12px 8px;min-height:0}

.sr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
.sr-card{position:relative;display:flex;flex-direction:column;background:var(--b3-theme-surface);border-radius:6px;overflow:visible;transition:transform .15s;&:hover{transform:translateY(-2px)}}
.sr-btn-remove{position:absolute;top:4px;right:4px;width:24px;height:24px;border:none;background:color-mix(in srgb, var(--b3-theme-on-surface) 50%, transparent);color:var(--b3-theme-surface);border-radius:50%;cursor:pointer;opacity:0;transition:all .15s;display:flex;align-items:center;justify-content:center;z-index:10;svg{width:14px;height:14px}.sr-card:hover &{opacity:1}&:hover{background:var(--b3-theme-error);transform:scale(1.1)}}
.sr-remove-confirm{position:absolute;inset:0;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;z-index:20;border-radius:6px;button{padding:6px 12px;border:none;border-radius:4px;font-size:12px;cursor:pointer;transition:transform .15s;&:hover{transform:scale(1.05)}&:active{transform:scale(.95)}}.sr-btn-cancel{background:var(--b3-theme-surface);color:var(--b3-theme-on-surface)}.sr-btn-confirm{background:var(--b3-theme-error);color:var(--b3-theme-on-error)}}
.confirm-enter-active,.confirm-leave-active{transition:all .2s}
.confirm-enter-from,.confirm-leave-to{opacity:0;transform:scale(.9)}
.sr-cover-wrap{position:relative;padding-top:140%;background:linear-gradient(135deg,var(--b3-theme-primary-lightest),var(--b3-theme-surface-lighter))}
.sr-cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sr-text-cover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;font-size:13px;font-weight:600;text-align:center;line-height:1.3;color:var(--b3-theme-on-surface);word-break:break-word}
.sr-format-tag{position:absolute;top:4px;left:4px;padding:2px 6px;background:color-mix(in srgb, var(--b3-theme-on-surface) 60%, transparent);color:var(--b3-theme-surface);border-radius:4px;font-size:9px;font-weight:600;letter-spacing:.5px;backdrop-filter:blur(4px)}
.sr-badge{position:absolute;top:4px;right:4px;min-width:16px;height:16px;display:flex;align-items:center;justify-content:center;background:var(--b3-theme-error);color:var(--b3-theme-on-error);border-radius:8px;padding:0 4px;font-size:10px;font-weight:600}
.sr-progress{position:absolute;bottom:0;left:0;height:2px;background:var(--b3-theme-primary)}
.sr-list{display:flex;flex-direction:column;gap:4px;
  .sr-card{flex-direction:row;height:70px;.sr-cover-wrap{width:48px;padding-top:0;flex-shrink:0}.sr-info{padding:6px 8px;justify-content:center}}
}
.sr-compact{display:flex;flex-direction:column;gap:1px;
  .sr-card{flex-direction:row;height:34px;padding:0 10px;align-items:center;
    .sr-info{padding:0;flex:1;flex-direction:row;align-items:center;gap:8px;min-height:auto}
    .sr-title{flex:1;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sr-meta{font-size:11px;width:70px;flex-shrink:0;text-align:right;opacity:.5}
    .sr-progress-info{gap:6px;flex-shrink:0;width:70px;justify-content:flex-end;.sr-percent{font-size:11px}.sr-chapter{font-size:10px}}}
}
.sr-info{padding:6px 8px;display:flex;flex-direction:column;gap:2px;min-height:38px}
.sr-title{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.25}
.sr-meta{font-size:10px;opacity:.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-progress-info{display:flex;justify-content:space-between;gap:4px;font-size:10px;margin-top:auto}
.sr-percent{color:var(--b3-theme-primary);font-weight:600}
.sr-chapter{opacity:.5}
.fade-enter-active,.fade-leave-active{transition:opacity .15s}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
