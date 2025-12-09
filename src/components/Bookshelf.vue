<template>
  <div class="sr-bookshelf fn__flex-1 fn__flex-column b3-scroll">
    <div class="sr-toolbar">
      <input v-model="keyword" :placeholder="i18n.searchPlaceholder || '搜索...'">
      <div class="sr-select" v-if="tags.length > 1">
        <button @click="showTagMenu = !showTagMenu" :title="activeTag">
          <svg><use xlink:href="#lucide-sliders-horizontal"/></svg>
        </button>
        <div v-if="showTagMenu" class="sr-menu" @click="showTagMenu = false">
          <div v-for="tag in tags" :key="tag" :class="['sr-menu-item', { active: activeTag === tag }]" @click="activeTag = tag">{{ tag }}</div>
        </div>
      </div>
      <div class="sr-select">
        <button @click="showSortMenu = !showSortMenu" :title="sortLabel">
          <svg><use xlink:href="#lucide-clock-plus"/></svg>
        </button>
        <div v-if="showSortMenu" class="sr-menu" @click="showSortMenu = false">
          <div v-for="s in SORTS" :key="s.value" :class="['sr-menu-item', { active: sortType === s.value }]" @click="changeSort(s.value)">{{ s.label }}</div>
        </div>
      </div>
      <button @click="toggleViewMode" :title="viewMode === 'grid' ? '网格' : viewMode === 'list' ? '列表' : '简洁'">
        <svg><use xlink:href="#lucide-panels-top-left"/></svg>
      </button>
      <button @click="checkAllUpdates" :title="i18n.checkUpdate || '检查更新'">
        <svg><use xlink:href="#lucide-list-restart"/></svg>
      </button>
      <button @click="triggerFileUpload" :title="i18n.addEpub || '添加EPUB'">
        <svg><use xlink:href="#lucide-book-plus"/></svg>
      </button>
    </div>
    <input ref="fileInput" type="file" accept=".epub" style="display:none" @change="handleFileUpload">
    
    <div class="sr-books" :class="viewMode">
      <Transition name="fade" mode="out-in">
        <div v-if="!displayBooks.length" key="empty" class="sr-empty">{{ keyword ? (i18n.noResults || '未找到书籍') : (i18n.emptyShelf || '暂无书籍') }}</div>
        <div v-else key="books" :class="`sr-${viewMode}`">
          <div v-for="book in displayBooks" :key="book.bookUrl" class="sr-card" @click="readBook(book)" @contextmenu.prevent="showContextMenu($event, book)">
            <div v-if="viewMode !== 'compact'" class="sr-cover-wrap">
              <img :src="getCoverUrl(book)" class="sr-cover" :alt="book.name" @error="e => e.target.src='/icons/book-placeholder.svg'">
              <div v-if="book.lastCheckCount > 0" class="sr-badge">{{ book.lastCheckCount }}</div>
              <div class="sr-progress" :style="{ width: getProgress(book) + '%' }"></div>
            </div>
            <div class="sr-info">
              <div class="sr-title" :title="book.name">{{ book.name }}</div>
              <div class="sr-meta">{{ book.author }}</div>
              <div class="sr-progress-info">
                <span class="sr-percent">{{ getProgress(book) }}%</span>
                <span class="sr-chapter">{{ book.durChapterIndex + 1 }}/{{ book.totalChapterNum }}</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
    
    <div v-if="contextMenu.show" class="sr-context-menu" :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }">
      <div class="sr-menu-item" @click="checkUpdate(contextMenu.book!)">
        <svg><use xlink:href="#iconRefresh"></use></svg>
        <span>{{ i18n.checkUpdate || '检查更新' }}</span>
      </div>
      <div class="sr-menu-divider"></div>
      <div class="sr-menu-item sr-menu-danger" @click="removeBook(contextMenu.book!)">
        <svg><use xlink:href="#iconTrashcan"></use></svg>
        <span>{{ i18n.remove || '移除' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
const contextMenu = ref<{ show: boolean; x: number; y: number; book: BookIndex | null }>({ show: false, x: 0, y: 0, book: null })
const fileInput = ref<HTMLInputElement>()
const coverCache = new Map<string, string>()

const tags = computed(() => ['全部', ...new Set(books.value.map(b => b.isEpub ? 'EPUB' : '在线'))])
const sortLabel = computed(() => SORTS.find(s => s.value === sortType.value)?.label || '')

const displayBooks = computed(() => {
  let list = books.value
  if (activeTag.value !== '全部') list = list.filter(b => (b.isEpub ? 'EPUB' : '在线') === activeTag.value)
  if (keyword.value) {
    const kw = keyword.value.toLowerCase()
    list = list.filter(b => b.name.toLowerCase().includes(kw) || b.author.toLowerCase().includes(kw))
  }
  return list
})

const getProgress = (book: BookIndex) => book.isEpub ? (book.epubProgress || 0) : book.totalChapterNum ? Math.round((book.durChapterIndex / book.totalChapterNum) * 100) : 0

const getCoverUrl = (book: BookIndex) => {
  if (!book.coverUrl) return '/icons/book-placeholder.svg'
  if (book.coverUrl.startsWith('/data/')) {
    if (coverCache.has(book.coverUrl)) return coverCache.get(book.coverUrl)!
    loadCover(book.coverUrl)
    return '/icons/book-placeholder.svg'
  }
  return book.coverUrl
}

const loadCover = async (path: string) => {
  try {
    const blob = await (await fetch('/api/file/getFile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) })).blob()
    coverCache.set(path, URL.createObjectURL(blob))
    books.value = [...books.value]
  } catch {}
}

const readBook = async (book: BookIndex) => {
  const full = await bookshelfManager.getBook(book.bookUrl)
  full ? emit('read', full) : showMessage(props.i18n.loadBookFailed || '加载书籍失败', 3000, 'error')
}

const checkUpdate = async (book: BookIndex) => {
  try {
    showMessage(props.i18n.checking || '检查更新中...', 2000, 'info')
    const r = await bookshelfManager.checkUpdate(book.bookUrl)
    refreshBooks()
    showMessage(r.hasUpdate ? `发现 ${r.newChapters} 个新章节` : props.i18n.noUpdate || '已是最新', 2000, 'info')
  } catch (e: any) {
    showMessage(e.message, 3000, 'error')
  }
}

const checkAllUpdates = async () => {
  showMessage(props.i18n.checkingAll || '检查全部更新中...', 3000, 'info')
  const results = await bookshelfManager.checkAllUpdates()
  const cnt = results.filter(r => r.hasUpdate).length
  cnt > 0 ? (refreshBooks(), showMessage(`${cnt} ${props.i18n.booksUpdated || '本书有更新'}`, 3000, 'info')) : showMessage(props.i18n.checkDone || '检查完成', 2000, 'info')
}

const removeBook = async (book: BookIndex) => {
  if (!confirm(`${props.i18n.confirmRemove || '确定要移出'}《${book.name}》${props.i18n.fromShelf || '吗？'}`)) return
  try {
    await bookshelfManager.removeBook(book.bookUrl)
    refreshBooks()
    showMessage(props.i18n.removed || '已移出书架', 2000, 'info')
  } catch (e: any) {
    showMessage(e.message, 3000, 'error')
  }
}

const refreshBooks = () => books.value = bookshelfManager.getBooks()

const changeSort = async (type: 'time' | 'name' | 'author' | 'update') => {
  sortType.value = type
  await bookshelfManager.sortBooks(type)
  refreshBooks()
}

const toggleViewMode = () => {
  const modes: Array<'grid' | 'list' | 'compact'> = ['grid', 'list', 'compact']
  viewMode.value = modes[(modes.indexOf(viewMode.value) + 1) % modes.length]
  localStorage.setItem('sr-view-mode', viewMode.value)
}

const showContextMenu = (e: MouseEvent, book: BookIndex) => {
  contextMenu.value = { show: true, x: e.clientX, y: e.clientY, book }
  const close = () => { contextMenu.value.show = false; showTagMenu.value = false; showSortMenu.value = false }
  document.addEventListener('click', close, { once: true })
}

const triggerFileUpload = () => fileInput.value?.click()

const handleFileUpload = async (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    showMessage(props.i18n.importing || '导入中...', 5000, 'info')
    await bookshelfManager.addEpubBook(f)
    await bookshelfManager.init(true)
    refreshBooks()
    showMessage(props.i18n.importSuccess || '导入成功', 3000, 'info')
  } catch (err: any) {
    showMessage(err?.message || '导入失败', 5000, 'error')
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

onMounted(async () => {
  viewMode.value = (localStorage.getItem('sr-view-mode') as any) || 'grid'
  await bookshelfManager.init()
  refreshBooks()
})
</script>

<style scoped lang="scss">
.sr-bookshelf{display:flex;flex-direction:column;height:100%;overflow:hidden}
.sr-toolbar{flex-shrink:0;display:flex;gap:4px;padding:8px;background:var(--b3-theme-background);border-bottom:1px solid var(--b3-border-color);
  input{flex:1;min-width:0;height:28px;padding:0 10px;border:none;border-bottom:1px solid var(--b3-border-color);background:transparent;font-size:12px;outline:none;color:var(--b3-theme-on-background);transition:border-color .2s;&:focus{border-color:var(--b3-theme-primary)}&::placeholder{opacity:.4}}
  button{width:28px;height:28px;flex-shrink:0;border:none;background:none;cursor:pointer;transition:all .15s;svg{width:16px;height:16px}&:hover{color:var(--b3-theme-primary);transform:scale(1.08)}&:active{transform:scale(.92)}}
}
.sr-select{position:relative;flex-shrink:0}
.sr-menu{position:absolute;top:calc(100% + 4px);right:0;background:var(--b3-theme-surface);border-radius:6px;box-shadow:0 4px 12px #0003;min-width:100px;padding:4px;z-index:100;animation:fade-in .15s}
@keyframes fade-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.sr-menu-item{padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;transition:background .15s;&:hover{background:var(--b3-list-hover)}&.active{background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary);font-weight:600}}
.sr-books{flex:1;overflow-y:auto;padding:12px 8px;min-height:0}
.sr-empty{padding:60px 20px;text-align:center;opacity:.4;font-size:12px}
.sr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
.sr-card{position:relative;display:flex;flex-direction:column;background:var(--b3-theme-surface);border-radius:6px;overflow:hidden;cursor:pointer;transition:transform .15s;&:hover{transform:translateY(-2px)}}
.sr-cover-wrap{position:relative;padding-top:140%;background:var(--b3-theme-surface-lighter)}
.sr-cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.sr-badge{position:absolute;top:4px;right:4px;min-width:16px;height:16px;display:flex;align-items:center;justify-content:center;background:var(--b3-theme-error);color:#fff;border-radius:8px;padding:0 4px;font-size:10px;font-weight:600}
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
.sr-context-menu{position:fixed;z-index:1000;background:var(--b3-theme-surface);border-radius:6px;box-shadow:0 4px 12px #0003;min-width:130px;padding:4px;animation:fade-in .15s;
  .sr-menu-item{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;transition:background .15s;svg{width:14px;height:14px;opacity:.6}&:hover{background:var(--b3-list-hover);svg{opacity:1}}}
}
.sr-menu-danger{color:var(--b3-theme-error);&:hover{background:var(--b3-theme-error-lighter)}}
.sr-menu-divider{height:1px;background:var(--b3-border-color);margin:2px 0;opacity:.2}
.fade-enter-active,.fade-leave-active{transition:opacity .15s}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
