<template>
  <div class="sr-bookshelf">
    <div class="sr-toolbar" v-motion-pop-visible>
      <div class="sr-search-input">
        <svg class="sr-icon"><use xlink:href="#iconSearch"></use></svg>
        <input v-model="keyword" class="b3-text-field" :placeholder="i18n.searchPlaceholder || '搜索书名或作者'">
      </div>
      <button class="sr-btn" @click="viewMode = viewMode === 'grid' ? 'list' : 'grid'" :title="viewMode === 'grid' ? '列表视图' : '网格视图'">
        <svg><use :xlink:href="viewMode === 'grid' ? '#iconList' : '#iconGrid'"></use></svg>
      </button>
      <button class="sr-btn" @click="checkAllUpdates" :title="i18n.checkUpdate || '检查更新'">
        <svg><use xlink:href="#iconRefresh"></use></svg>
      </button>
      <button class="sr-btn" @click="triggerFileUpload" :title="i18n.addEpub || '添加EPUB'">
        <svg><use xlink:href="#iconUpload"></use></svg>
      </button>
      <div class="sr-sort-select">
        <button class="b3-button b3-button--text" @click="showSortMenu = !showSortMenu" :title="sortTypeName">
          <svg><use xlink:href="#iconSort"></use></svg>
        </button>
        <Transition name="fade">
          <div v-show="showSortMenu" class="sr-dropdown" @click="showSortMenu = false">
            <div v-for="type in sortTypes" :key="type.value" class="sr-dropdown-item" :class="{active: sortType === type.value}" @click="sortType = type.value">
              {{ type.label }}
            </div>
          </div>
        </Transition>
      </div>
    </div>
    <input ref="fileInput" type="file" accept=".epub" style="display:none" @change="handleFileUpload">
    
    <div class="sr-books" :class="viewMode">
      <Transition name="fade" mode="out-in">
        <div v-if="!displayBooks.length" key="empty" class="sr-empty">{{ keyword ? (i18n.noResults || '未找到书籍') : (i18n.emptyShelf || '暂无书籍') }}</div>
        <div v-else key="books" :class="viewMode === 'grid' ? 'sr-grid' : 'sr-list'">
          <div 
            v-for="(book, idx) in displayBooks" 
            :key="book.bookUrl" 
            v-motion-pop-visible="{ delay: idx * 30 }"
            class="sr-card" 
            @click="readBook(book)"
            @contextmenu.prevent="showContextMenu($event, book)"
          >
            <div class="sr-cover-wrap">
              <img :src="getCoverUrl(book)" class="sr-cover" @error="e => e.target.src='/icons/book-placeholder.svg'">
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
import { ref, computed, watch, onMounted } from 'vue'
import { bookshelfManager, type BookIndex } from '@/core/bookshelf'
import { showMessage } from 'siyuan'

const props = defineProps<{ i18n: any }>()
const emit = defineEmits(['read'])

const books = ref<(BookIndex & { coverUrl?: string; isEpub?: boolean; epubProgress?: number })[]>([])
const keyword = ref('')
const sortType = ref<'time' | 'name' | 'author' | 'update'>('time')
const showSortMenu = ref(false)
const viewMode = ref<'grid' | 'list'>('grid')
const contextMenu = ref<{ show: boolean; x: number; y: number; book: BookIndex | null }>({ show: false, x: 0, y: 0, book: null })
const fileInput = ref<HTMLInputElement>()
const coverCache = new Map<string, string>()

const sortTypes = computed(() => [
  { value: 'time', label: props.i18n.sortByTime || '最近阅读' },
  { value: 'name', label: props.i18n.sortByName || '书名' },
  { value: 'author', label: props.i18n.sortByAuthor || '作者' },
  { value: 'update', label: props.i18n.sortByUpdate || '最近更新' }
])

const displayBooks = computed(() => {
  if (!keyword.value) return books.value
  const kw = keyword.value.toLowerCase()
  return books.value.filter(b => b.name.toLowerCase().includes(kw) || b.author.toLowerCase().includes(kw))
})

const getProgress = (book: BookIndex & { isEpub?: boolean; epubProgress?: number }) => 
  book.isEpub ? (book.epubProgress || 0) : book.totalChapterNum ? Math.round((book.durChapterIndex / book.totalChapterNum) * 100) : 0

const getCoverUrl = (book: BookIndex & { coverUrl?: string }) => book.coverUrl || '/icons/book-placeholder.svg'

const sortTypeName = computed(() => sortTypes.value.find(t => t.value === sortType.value)?.label || '')

watch(sortType, async (type) => {
  await bookshelfManager.sortBooks(type)
  await refreshBooks()
})

const readBook = async (book: BookIndex) => {
  const full = await bookshelfManager.getBook(book.bookUrl)
  full ? emit('read', full) : showMessage(props.i18n.loadBookFailed || '加载书籍失败', 3000, 'error')
}

const checkUpdate = async (book: BookIndex) => {
  try {
    showMessage(props.i18n.checking || '检查更新中...', 2000, 'info')
    const r = await bookshelfManager.checkUpdate(book.bookUrl)
    await refreshBooks()
    showMessage(r.hasUpdate ? `发现 ${r.newChapters} 个新章节` : props.i18n.noUpdate || '已是最新', 2000, 'info')
  } catch (e: any) {
    showMessage(e.message, 3000, 'error')
  }
}

const checkAllUpdates = async () => {
  showMessage(props.i18n.checkingAll || '检查全部更新中...', 3000, 'info')
  const results = await bookshelfManager.checkAllUpdates()
  const cnt = results.filter(r => r.hasUpdate).length
  cnt > 0 ? (await refreshBooks(), showMessage(`${cnt} ${props.i18n.booksUpdated || '本书有更新'}`, 3000, 'info')) : showMessage(props.i18n.checkDone || '检查完成', 2000, 'info')
}

const removeBook = async (book: BookIndex) => {
  if (!confirm(`${props.i18n.confirmRemove || '确定要移出'}《${book.name}》${props.i18n.fromShelf || '吗？'}`)) return
  try {
    await bookshelfManager.removeBook(book.bookUrl)
    coverCache.delete(book.bookUrl)
    books.value = books.value.filter(b => b.bookUrl !== book.bookUrl)
    showMessage(props.i18n.removed || '已移出书架', 2000, 'info')
  } catch (e: any) {
    showMessage(e.message, 3000, 'error')
  }
}

const refreshBooks = async () => {
  const list = bookshelfManager.getBooks()
  await Promise.all(list.map(async (b) => {
    const full = await bookshelfManager.getBook(b.bookUrl)
    if (full) {
      const cover = coverCache.get(b.bookUrl) ?? full.coverUrl
      cover && (coverCache.set(b.bookUrl, cover), (b as any).coverUrl = cover)
      b.isEpub && ((b as any).epubProgress = full.epubProgress)
    }
  }))
  books.value = list as any
}

const showContextMenu = (e: MouseEvent, book: BookIndex) => {
  contextMenu.value = { show: true, x: e.clientX, y: e.clientY, book }
  document.addEventListener('click', () => contextMenu.value.show = false, { once: true })
}

const triggerFileUpload = () => fileInput.value?.click()

const handleFileUpload = async (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    showMessage(props.i18n.importing || '导入中...', 5000, 'info')
    await bookshelfManager.addEpubBook(f)
    await bookshelfManager.init(true)
    await refreshBooks()
    showMessage(props.i18n.importSuccess || '导入成功', 3000, 'info')
  } catch (err: any) {
    showMessage(err?.message || '导入失败', 5000, 'error')
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

onMounted(() => bookshelfManager.init().then(refreshBooks))
</script>

<style scoped lang="scss">
.sr-bookshelf{display:flex;flex-direction:column;height:100%;background:var(--b3-theme-background)}
.sr-toolbar{position:sticky;top:0;z-index:10;display:flex;gap:6px;padding:12px 16px;background:var(--b3-theme-surface);border-radius:8px 8px 0 0;box-shadow:0 1px 3px #0000000d;align-items:center}
.sr-btn{display:flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:none;background:transparent;border-radius:6px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);
  svg{width:16px;height:16px}
  &:hover{background:var(--b3-list-hover)}
}
.sr-search-input{flex:1;position:relative;display:flex;align-items:center;
  input{padding-left:36px;width:100%;min-width:0}
}
.sr-icon{position:absolute;left:10px;width:16px;height:16px;opacity:.5;pointer-events:none}
.sr-sort-select{position:relative;
  button{display:flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;
    svg{width:16px;height:16px}
  }
}
.sr-dropdown{position:absolute;top:100%;right:0;margin-top:4px;background:var(--b3-theme-surface);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);min-width:140px;z-index:100}
.sr-dropdown-item{padding:10px 14px;cursor:pointer;font-size:13px;transition:background .15s;
  &:hover{background:var(--b3-list-hover)}
  &.active{background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary);font-weight:600}
  &:first-child{border-radius:6px 6px 0 0}
  &:last-child{border-radius:0 0 6px 6px}
}
.sr-books{flex:1;overflow-y:auto;padding:20px 16px}
.sr-empty{padding:60px 20px;text-align:center;opacity:.5;font-size:13px}
.sr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px}
.sr-card{position:relative;display:flex;flex-direction:column;background:var(--b3-theme-surface);border-radius:10px;overflow:hidden;cursor:pointer;transition:all .25s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 3px rgba(0,0,0,.08),0 2px 6px rgba(0,0,0,.04);
  &:hover{box-shadow:0 4px 12px rgba(0,0,0,.12),0 8px 20px rgba(0,0,0,.08);transform:translateY(-2px)}
  &:active{transform:translateY(0);box-shadow:0 2px 8px rgba(0,0,0,.1)}
}
.sr-cover-wrap{position:relative;padding-top:135%;background:linear-gradient(135deg,#f5f5f5 0%,#e8e8e8 100%);overflow:hidden}
.sr-cover{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;transition:opacity .2s}
.sr-badge{position:absolute;top:6px;right:6px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#ff6b6b,#ee5a6f);color:#fff;border-radius:9px;padding:0 5px;font-size:10px;font-weight:700;box-shadow:0 2px 6px rgba(238,90,111,.35)}
.sr-progress{position:absolute;bottom:0;left:0;height:3px;background:linear-gradient(90deg,var(--b3-theme-primary),var(--b3-theme-primary-light));transition:width .3s;box-shadow:0 -1px 4px rgba(var(--b3-theme-primary-rgb),.3)}
.sr-list{display:flex;flex-direction:column;gap:10px;
  .sr-card{flex-direction:row;height:85px;border-radius:8px;
    .sr-cover-wrap{width:60px;padding-top:0;flex-shrink:0}
    .sr-info{padding:8px 10px;justify-content:center}
  }
}
.sr-info{padding:7px 9px;display:flex;flex-direction:column;gap:2px;min-height:44px}
.sr-title{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:var(--b3-theme-on-surface);line-height:1.3;word-break:break-word}
.sr-meta{font-size:10px;color:var(--b3-theme-on-surface);opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-progress-info{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:10px;margin-top:auto}
.sr-percent{color:var(--b3-theme-primary);font-weight:600}
.sr-chapter{color:var(--b3-theme-on-surface);opacity:.5}
.sr-context-menu{position:fixed;z-index:1000;background:var(--b3-theme-surface);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15),0 0 1px rgba(0,0,0,.1);min-width:160px;padding:4px;backdrop-filter:blur(10px);animation:menu-in .2s cubic-bezier(.4,0,.2,1)}
@keyframes menu-in{from{opacity:0;transform:scale(.95) translateY(-8px)}to{opacity:1;transform:scale(1) translateY(0)}}
.sr-menu-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:5px;cursor:pointer;font-size:13px;transition:all .15s cubic-bezier(.4,0,.2,1);color:var(--b3-theme-on-surface);
  svg{width:15px;height:15px;flex-shrink:0;opacity:.7;transition:all .15s}
  &:hover{background:var(--b3-list-hover);transform:translateX(2px);
    svg{opacity:1;transform:scale(1.1)}
  }
  &:active{transform:scale(.98) translateX(2px)}
}
.sr-menu-danger{color:var(--b3-theme-error);
  svg{opacity:.85}
  &:hover{background:var(--b3-theme-error-lighter)}
}
.sr-menu-divider{height:1px;background:var(--b3-border-color);margin:4px 0;opacity:.5}
.fade-enter-active, .fade-leave-active { transition:opacity .3s; }
.fade-enter-from, .fade-leave-to { opacity:0; }
.slide-enter-active { transition: all .25s cubic-bezier(.4,0,.2,1); }
.slide-leave-active { transition: all .2s cubic-bezier(.4,0,1,1); }
.slide-enter-from { opacity: 0; transform: translateX(15px); }
.slide-leave-to { opacity: 0; transform: translateX(-15px); }
.expand-enter-active, .expand-leave-active { transition: all .3s cubic-bezier(.4,0,.2,1); overflow: hidden; }
.expand-enter-from, .expand-leave-to { max-height: 0; opacity: 0; transform: scaleY(.9); }
.expand-enter-to, .expand-leave-from { max-height: 400px; opacity: 1; transform: scaleY(1); }
</style>
