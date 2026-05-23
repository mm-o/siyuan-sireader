<template>
  <DockShell
    class="sr-bookshelf"
    v-model:search-value="keyword"
    body-class="sr-books"
    search-placeholder="搜索书籍或分组..."
    :toolbar-start-actions="toolbarStartActions"
    :toolbar-actions="toolbarActions"
    @click="closePopups"
    @toolbar-action="handleToolbarAction"
  >
      <Transition name="fade">
        <div v-if="!displayItems.length" class="sr-empty">
          <div>{{ keyword ? '未找到内容' : '暂无内容' }}</div>
          <div v-if="!keyword" class="sr-empty-hint">暂无书籍，点击右上角添加内容</div>
        </div>

        <component
          :is="View"
          v-else
          :key="`${viewMode}-${currentGroup || 'root'}`"
          v-bind="viewProps"
          @select-group="setGroup"
          @book-click="readBook"
          @book-menu="showContextMenu"
          @group-menu="showGroupMenu"
          @clear-delete="clearConfirmDelete"
          @remove-book="removeBook"
          @move-book-group="moveBookToGroup"
          @move-book-home="moveBookToHome"
        />
      </Transition>

    <template #overlay>
      <Transition name="fade">
        <div v-if="modalMode" class="sr-manage-panel" @click.stop>
        <header class="sr-modal__head">
          <span>{{ modalTitle }}</span>
          <span class="block__icon block__icon--show sr-icon-btn" aria-label="关闭" @click="closePopups">
            <svg><use xlink:href="#lucide-x" /></svg>
          </span>
        </header>

        <div class="sr-modal__body">
          <template v-if="modalMode === 'manage'">
            <div class="sr-form-item">
              <span class="ft__secondary">快捷操作</span>
              <div class="sr-grid2">
                <button class="b3-button b3-button--outline" type="button" @click="importMode = 'file'; pickAndParseFiles()">导入书籍</button>
                <button class="b3-button b3-button--outline" type="button" @click="importMode = 'link'">导入链接</button>
                <button class="b3-button b3-button--outline" type="button" @click="openCloudImport">云盘导入</button>
                <button class="b3-button b3-button--outline" type="button" @click="startEditGroup()">手动分组</button>
                <button class="b3-button b3-button--outline" type="button" @click="startEditGroup(undefined, 'smart')">智能分组</button>
              </div>
            </div>

            <template v-if="importMode === 'link'">
              <div class="sr-form-item">
                <span class="ft__secondary">链接导入</span>
                <textarea
                  class="b3-text-field fn__block sr-textarea"
                  v-model="importDraft"
                  placeholder="支持批量导入，每行一个链接"
                />
                <div class="sr-row">
                  <button class="b3-button b3-button--outline" type="button" @click="parseImportUrls" :disabled="!importDraft.trim() || importParsing">
                    {{ importParsing ? '解析中...' : '解析链接' }}
                  </button>
                </div>
              </div>
            </template>

            <template v-if="importMode === 'cloud'">
              <div class="sr-form-item">
                <span class="ft__secondary">云盘文件</span>
                <div class="sr-row">
                  <select v-model="selectedCloudAccountId" class="b3-select sr-select" @change="loadCloudRoot">
                    <option v-for="account in cloudAccounts" :key="account.id" :value="account.id">{{ cloudAccountLabel(account) }}</option>
                  </select>
                  <button class="b3-button b3-button--outline" type="button" @click="loadCloudAccounts(true)">刷新账号</button>
                  <button class="b3-button b3-button--outline" type="button" :disabled="cloudLoading || !currentCloudAccount" @click="loadCloudDir(cloudPath)">刷新目录</button>
                </div>
                <div v-if="!cloudAccounts.length" class="sr-muted">请先在设置里的“云盘账号”填写 OpenList 服务器。</div>
                <div v-else class="sr-cloud-panel">
                  <div class="sr-row">
                    <button class="sr-chip" type="button" :disabled="cloudPath === '/'" @click="loadCloudParent">上一级</button>
                    <span class="mono">{{ cloudPath }}</span>
                    <span v-if="cloudLoading">{{ cloudProgressText }}</span>
                    <span v-else-if="cloudError" class="sr-error">{{ cloudError }}</span>
                    <span class="fn__space"></span>
                    <span class="sr-cloud-search">
                      <input
                        v-model.trim="cloudSearchKeyword"
                        class="b3-text-field"
                        type="search"
                        placeholder="输入文件名搜索"
                        @keydown.stop
                        @keyup.enter.stop.prevent="searchCloudFiles"
                      >
                      <button class="block__icon block__icon--show b3-tooltips b3-tooltips__w" type="button" aria-label="搜索" :disabled="cloudLoading || !cloudSearchKeyword" @click="searchCloudFiles">
                        <svg><use xlink:href="#iconSearch"></use></svg>
                      </button>
                      <button v-if="cloudSearchActive" class="block__icon block__icon--show b3-tooltips b3-tooltips__w" type="button" aria-label="清除搜索" @click="clearCloudSearch">
                        <svg><use xlink:href="#iconClose"></use></svg>
                      </button>
                    </span>
                  </div>
                  <div v-if="cloudLoading || cloudProgress" class="sr-progress">
                    <div class="sr-progress__bar" :style="{ width: `${cloudProgress || 12}%` }"></div>
                  </div>
                  <div class="sr-cloud-list">
                    <button
                      v-for="entry in displayedCloudEntries"
                      :key="entry.path"
                      class="sr-cloud-row"
                      :class="{ 'is-dir': entry.isDir, 'is-selected': isCloudSelected(entry), 'is-disabled': !entry.isDir && !isSupportedCloudBook(entry.name) }"
                      type="button"
                      @click="entry.isDir ? loadCloudDir(entry.path) : toggleCloudSelection(entry)"
                    >
                      <svg class="sr-cloud-icon"><use :xlink:href="entry.isDir ? '#iconFolder' : '#lucide-file'"></use></svg>
                      <span class="sr-cloud-name">{{ entry.name }}</span>
                      <span class="sr-cloud-meta">{{ entry.isDir ? '目录' : formatBytes(entry.size) }}</span>
                    </button>
                  </div>
                  <div class="sr-row sr-actions-end">
                    <span class="sr-muted">已选 {{ selectedCloudPaths.length }} 个文件</span>
                    <button class="b3-button b3-button--outline" type="button" :disabled="cloudLoading || !selectedCloudPaths.length" @click="prepareCloudImport">
                      加入待导入
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <div v-if="importHasItems" class="sr-form-item">
              <span class="ft__secondary">待导入项目</span>
              <div class="sr-row">
                <button class="sr-chip" :class="{ 'is-active': importAllSelected }" type="button" @click="importAllSelected = !importAllSelected">{{ importAllSelected ? '取消全选' : '全选导入' }}</button>
                <span>{{ importSelectedCount }} / {{ importItems.length }}</span>
                <span v-if="importParsing || importing">{{ importProgress }}%</span>
              </div>
              <div v-if="importParsing || importing" class="sr-progress">
                <div class="sr-progress__bar" :style="{ width: `${importProgress || 8}%` }"></div>
              </div>

              <View
                :items="importDisplayItems"
                mode="list"
                :status-map="STATUS_MAP"
                :get-cover-url="getCoverUrl"
                :get-progress="getProgress"
                @toggle-import="toggleImportItem"
              />
            </div>

            <template v-if="groups.length || editingGroup">
              <div v-if="groups.length">
                <span class="ft__secondary">现有分组</span>
                <template v-for="g in groups" :key="g.id">
                  <div class="sr-group-item">
                    <button class="b3-button sr-grow sr-group-label" :class="g.type === 'smart' ? 'b3-button--cancel' : 'b3-button--outline'" type="button" @click="setGroup(g.id, true)">
                      <strong>{{ g.name }}</strong>
                      <span class="sr-entry-meta">{{ groupCounts[g.id] || 0 }} 本</span>
                    </button>
                    <span class="sr-inline" @click.stop>
                      <span class="block__icon block__icon--show sr-icon-btn sr-icon-btn--sm" aria-label="打开分组" @click="setGroup(g.id, true)">
                        <svg><use xlink:href="#iconFolder" /></svg>
                      </span>
                      <span class="block__icon block__icon--show sr-icon-btn sr-icon-btn--sm" aria-label="编辑分组" @click="startEditGroup(g)">
                        <svg><use xlink:href="#iconEdit" /></svg>
                      </span>
                      <span class="block__icon block__icon--show block__icon--warning sr-icon-btn sr-icon-btn--sm" aria-label="删除分组" @click="confirmGroupDelete(g)">
                        <svg><use xlink:href="#lucide-trash-2" /></svg>
                      </span>
                    </span>
                  </div>
                  <div v-if="confirmDelete?.type === 'group' && confirmDelete.id === g.id" class="sr-confirm">
                    <span>确认删除该分组？</span>
                    <button class="b3-button b3-button--outline" type="button" @click="clearConfirmDelete">取消</button>
                    <button class="b3-button b3-button--remove" type="button" @click="deleteGroup(g)">删除</button>
                  </div>
                </template>
              </div>
              <div v-if="editingGroup" class="sr-editor">
                <div class="sr-editor-head">
                  <strong>{{ groups.some(g => g.id === editingGroup!.id) ? '编辑分组' : '新增分组' }}</strong>
                </div>
                <div v-for="f in groupFields" :key="f.key" class="sr-form-item">
                  <span class="ft__secondary">{{ f.label }}</span>
                  <input v-if="f.type === 'text'" v-model="editingGroup[f.key]" class="b3-text-field sr-input" :placeholder="f.placeholder" />
                  <div v-else class="sr-chips">
                    <button v-for="opt in f.options" :key="opt.value" class="sr-chip" :class="{ 'is-active': isGroupRuleActive(f, opt.value) }" type="button" @click="toggleGroupRule(f, opt.value)">{{ opt.label }}</button>
                  </div>
                </div>
                <div class="sr-row sr-actions-end sr-editor-actions">
                  <button class="b3-button b3-button--outline" type="button" @click="editingGroup = null">取消</button>
                  <button class="b3-button b3-button--outline" type="button" @click="saveGroup">保存</button>
                </div>
              </div>
            </template>

            <div class="sr-row sr-actions-end sr-section-line">
              <button class="b3-button b3-button--outline" type="button" @click="closePopups">关闭</button>
              <button
                v-if="importHasItems"
                class="b3-button b3-button--outline"
                type="button"
                @click="confirmImport(importMode === 'cloud' ? 'cloud' : importMode === 'file' ? 'file' : 'link')"
                :disabled="!importSelectedCount || importParsing || importing"
              >
                {{ importing ? '导入中...' : '确认导入' }}
              </button>
            </div>
          </template>

          <template v-else-if="modalMode === 'organize'">
            <label class="sr-form-item">
              <span class="ft__secondary">视图</span>
              <div class="sr-chips">
                <button v-for="mode in VIEW_MODES" :key="mode.value" class="sr-chip" :class="{ 'is-active': viewMode === mode.value }" type="button" @click="viewMode = mode.value">{{ mode.label }}</button>
              </div>
            </label>

            <label class="sr-form-item">
              <span class="ft__secondary">排序</span>
              <div class="sr-chips">
                <button v-for="[value, label] in SORTS" :key="value" class="sr-chip" :class="{ 'is-active': sortType === value }" type="button" @click="sortType = value">{{ label }}</button>
              </div>
              <div class="sr-chips">
                <button class="sr-chip" :class="{ 'is-active': sortReverse }" type="button" @click="sortReverse = !sortReverse">
                  反向排序
                </button>
              </div>
            </label>

            <label v-for="s in filterSections" :key="s.key" class="sr-form-item">
              <span class="ft__secondary">{{ s.label }}</span>
              <div class="sr-chips">
                <button v-for="opt in s.options" :key="opt.value" class="sr-chip" :class="{ 'is-active': isFilterActive(s.key, opt.value) }" type="button" @click="toggleFilterItem(s.key, opt.value)">{{ opt.label }} ({{ opt.count }})</button>
              </div>
            </label>

            <div class="sr-form-item">
              <div class="sr-row">
                <button class="b3-button b3-button--outline" type="button" @click="toggleBatchMode('rate')" :disabled="!displayBooks.length">批量评分</button>
                <button class="b3-button b3-button--outline" type="button" @click="toggleBatchMode('status')" :disabled="!displayBooks.length">批量状态</button>
                <button class="b3-button b3-button--outline" type="button" @click="batchOp('remove')" :disabled="!displayBooks.length">批量删除</button>
              </div>
              <div v-if="batchMode === 'rate'" class="sr-chips">
                <button v-for="[value, label] in batchRatingOptions" :key="value" class="sr-chip" type="button" @click="batchOp('rate', value)">{{ label }}</button>
              </div>
              <div v-else-if="batchMode === 'status'" class="sr-chips">
                <button v-for="[value, label] in STATUS_OPTIONS" :key="value" class="sr-chip" type="button" @click="batchOp('status', value)">{{ label }}</button>
              </div>
            </div>

            <div class="sr-row sr-actions-end sr-section-line">
              <button class="b3-button b3-button--outline" type="button" @click="resetOrganize">重置整理</button>
              <button class="b3-button b3-button--outline" type="button" @click="closePopups">完成</button>
            </div>
          </template>

          <template v-else-if="modalMode === 'edit'">
            <div v-if="panelCover" class="sr-panel-cover"><img :src="panelCover" /></div>

            <label v-for="f in editFields" :key="f.key" class="sr-form-item">
              <span class="ft__secondary">{{ f.label }}</span>
              <input v-if="f.type === 'text'" v-model="editForm[f.key]" class="b3-text-field sr-input" :placeholder="f.placeholder" />
              <select v-else-if="f.type === 'select'" v-model="editForm[f.key]" class="b3-select sr-select">
                <option v-for="opt in f.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <template v-else-if="f.key === 'tags'">
                <input v-model="editForm.tags" class="b3-text-field sr-input" :placeholder="f.placeholder" />
                <div v-if="allTags.length" class="sr-chips">
                  <button v-for="t in allTags.slice(0, 8)" :key="t.tag" class="sr-chip" type="button" :class="{ 'is-active': editForm.tags.includes(t.tag) }" @click="toggleTag(t.tag)">#{{ t.tag }}</button>
                </div>
              </template>
              <template v-else-if="f.key === 'groups'">
                <div v-if="folderGroups.length" class="sr-chips">
                  <button v-for="g in folderGroups" :key="g.id" class="sr-chip" type="button" :class="{ 'is-active': editForm.groups.includes(g.id) }" @click="toggleGroup(g.id)">{{ g.name }}</button>
                </div>
                <span v-else class="sr-muted">暂无分组</span>
              </template>
              <template v-else-if="f.key === 'bind'">
                <input v-if="!editForm.bindDocId" v-model="bindSearch" class="b3-text-field sr-input" placeholder="搜索文档..." @input="searchBindDoc" />
                <div v-if="bindResults.length" class="sr-chips">
                  <button v-for="d in bindResults.slice(0, 8)" :key="d.path || d.id" class="sr-chip" type="button" @click="selectBindDoc(d)">{{ d.hPath || d.content || '无标题' }}</button>
                </div>
                <div v-else-if="editForm.bindDocId">
                  <div class="sr-chips sr-chips-stack">
                    <span class="sr-chip is-active">{{ editForm.bindDocName }}</span>
                    <button class="sr-chip is-danger" type="button" @click="unbindDoc">解绑</button>
                  </div>
                </div>
              </template>
            </label>

            <div class="sr-row sr-actions-end sr-section-line">
              <button class="b3-button b3-button--outline" type="button" @click="closePopups">取消</button>
              <button class="b3-button b3-button--outline" type="button" @click="saveEdit">保存</button>
            </div>
          </template>

          <template v-else-if="modalMode === 'detail'">
            <div v-if="panelCover" class="sr-panel-cover"><img :src="panelCover" /></div>
            <label v-for="f in detailFields" :key="f.label" class="sr-form-item">
              <span class="ft__secondary">{{ f.label }}</span>
              <span :class="{ mono: f.mono }">{{ f.value }}</span>
            </label>
          </template>
        </div>
        </div>
      </Transition>
    </template>
  </DockShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { showMessage, Menu } from 'siyuan'
import { bookInGroup, bookshelfManager, SORTS, STATUS_OPTIONS, STATUS_MAP, RATING_OPTIONS, VIEW_MODES, VIEW_MODE_ICONS, MODAL_TITLES, createDefaultGroupRules, createDefaultEditForm, getNextViewMode, buildFilterSections, buildEditFields, buildGroupFields, buildDetailFields, type SortType, type Book, type BookStatus, type BookFormat, type GroupConfig, type BookshelfViewMode, type BookshelfModalMode } from '@/core/bookshelf'
import View from '@/components/bookshelf/View.vue'
import DockShell from './ui/DockShell.vue'
import { isMobile } from '@/utils/mobile'
import { searchDocs, settingsManager, type CloudDriveAccount } from '@/composables/useSetting'
import { useBookImport } from '@/composables/useBookImport'
import { useLicense } from '@/composables/useLicense'
import { createOpenListBookUrl, deepSearchOpenListFiles, isSupportedCloudBook, listOpenListDir, searchOpenListFiles, type OpenListEntry } from '@/services/openlist'

type ImportMode = 'link' | 'file' | 'cloud'
type GroupType = 'folder' | 'smart'

const props = defineProps<{ i18n?: any; coverSize?: number }>()
const emit = defineEmits<{ read: [book: Book] }>()
const { can, showUpgrade } = useLicense(props.i18n || {})
const MENU_ICONS = { status: { unread: 'iconUncheck', reading: 'iconEye', finished: 'iconCheck' } }

const books = ref<Book[]>([])
const groups = ref<GroupConfig[]>([])
const allTags = ref<Array<{ tag: string; count: number }>>([])
const stats = ref({ byStatus: { unread: 0, reading: 0, finished: 0 }, byFormat: { epub: 0, pdf: 0, mobi: 0, azw3: 0, txt: 0 } })
const keyword = ref('')
const currentGroup = ref<string | null>(null)
const filterStatus = ref<BookStatus[]>([])
const filterRating = ref(0)
const filterFormats = ref<BookFormat[]>([])
const filterTags = ref<string[]>([])
const sortType = ref<SortType>('time')
const sortReverse = ref(false)
const viewMode = ref<BookshelfViewMode>('grid')
const batchMode = ref<'rate' | 'status' | null>(null)
const groupCounts = ref<Record<string, number>>({})
const editingBook = ref<string | null>(null)
const editingGroup = ref<GroupConfig | null>(null)
const confirmDelete = ref<{ type: 'group' | 'book'; id: string; item: any } | null>(null)
const modalMode = ref<BookshelfModalMode>(null)
const panelBook = ref<Book | null>(null)
const importMode = ref<ImportMode>('file')
const editForm = ref(createDefaultEditForm())
const bindSearch = ref('')
const bindResults = ref<any[]>([])
const { items: importItems, draft: importDraft, parsing: importParsing, importing, progress: importProgress, hasItems: importHasItems, selectedCount: importSelectedCount, allSelected: importAllSelected, reset: resetImport, pickAndParseFiles, parseLinkedFiles, parseDraftUrls, importSelected } = useBookImport()
const cloudAccounts = ref<CloudDriveAccount[]>([])
const selectedCloudAccountId = ref('')
const cloudPath = ref('/')
const cloudEntries = ref<OpenListEntry[]>([])
const cloudSearchEntries = ref<OpenListEntry[]>([])
const cloudSearchKeyword = ref('')
const cloudSearchActive = ref(false)
const selectedCloudPaths = ref<string[]>([])
const cloudLoading = ref(false)
const cloudError = ref('')
const cloudProgressText = ref('')
const cloudProgress = ref(0)

let settingsLoaded = false
const settingTimers = new Map<string, number>()
const saveUiSetting = (key: string, value: any, delay = 180) => {
  const prev = settingTimers.get(key)
  if (prev) clearTimeout(prev)
  settingTimers.set(key, window.setTimeout(() => {
    settingTimers.delete(key)
    void bookshelfManager.saveSetting(key, value)
  }, delay))
}

const folderGroups = computed(() => groups.value.filter(g => g.type === 'folder'))
const gridStyle = computed(() => viewMode.value === 'grid' ? { gridTemplateColumns: `repeat(auto-fill,minmax(${props.coverSize || 120}px,1fr))` } : {})
const viewModeIcon = computed(() => VIEW_MODE_ICONS[viewMode.value])
const toolbarStartActions = computed(() => currentGroup.value ? [{ id: 'back', icon: '#iconBack', label: '返回' }] : [])
const toolbarActions = computed(() => [
  { id: 'view', icon: viewModeIcon.value, label: '切换视图' },
  { id: 'organize', icon: '#lucide-sliders-horizontal', label: '整理书架' },
  { id: 'manage', icon: '#lucide-book-plus', label: '添加内容' },
])
const modalTitle = computed(() => modalMode.value ? MODAL_TITLES[modalMode.value] : '书架')
const panelCover = computed(() => panelBook.value ? getCoverUrl(panelBook.value) : '')
const viewProps = computed(() => ({
  items: displayItems.value,
  mode: viewMode.value,
  gridStyle: gridStyle.value,
  confirmDeleteId: confirmDelete.value?.type === 'book' ? confirmDelete.value.id : null,
  groupCounts: groupCounts.value,
  statusMap: STATUS_MAP,
  getCoverUrl,
  getGroupCoverUrls,
  getProgress,
  currentGroup: currentGroup.value,
}))

const getSortKey = (item: any, type: string) => item.type === 'group'
  ? (type === 'name' ? item.data.name : type === 'time' ? (item.data as any).created || 0 : item.data.order)
  : type === 'name' ? item.data.title : type === 'author' ? item.data.author || '' : type === 'progress' ? item.data.progress || 0 : type === 'rating' ? item.data.rating || 0 : type === 'readTime' ? item.data.time || 0 : type === 'update' ? item.data.read || 0 : item.data.added
const groupedBook = (book: Book) => groups.value.some(g => bookInGroup(book, g))

const displayItems = computed(() => {
  if (currentGroup.value) return books.value.map(b => ({ type: 'book', data: b }))
  const kw = keyword.value.toLowerCase()
  const rootBooks = (viewMode.value === 'compact' ? books.value : books.value.filter(b => !groupedBook(b)))
  const items = [
    ...(keyword.value ? groups.value.filter(g => g.name.toLowerCase().includes(kw)) : groups.value).map(g => ({ type: 'group', data: g })),
    ...(keyword.value ? rootBooks.filter(b => b.title.toLowerCase().includes(kw) || b.author?.toLowerCase().includes(kw) || b.tags.some(t => t.toLowerCase().includes(kw))) : rootBooks).map(b => ({ type: 'book', data: b })),
  ]
  return items.sort((a, b) => {
    const ka = getSortKey(a, sortType.value)
    const kb = getSortKey(b, sortType.value)
    return (sortReverse.value ? -1 : 1) * (typeof ka === 'string' ? ka.localeCompare(kb as string) : (ka as number) - (kb as number))
  })
})
const displayBooks = computed(() => displayItems.value.filter(i => i.type === 'book').map(i => i.data))
const filterSections = computed(() => buildFilterSections(stats.value, allTags.value))
const importDisplayItems = computed(() => importItems.value.map(item => ({ type: 'import' as const, data: item })))
const currentCloudAccount = computed(() => cloudAccounts.value.find(account => account.id === selectedCloudAccountId.value) || null)
const displayedCloudEntries = computed(() => cloudSearchActive.value ? cloudSearchEntries.value : cloudEntries.value)
const batchRatingOptions = computed(() => [...RATING_OPTIONS, [0, '清除评分']] as Array<[number, string]>)
const filterMap = { status: filterStatus, rating: filterRating, format: filterFormats, tags: filterTags }
const setGroup = (id: string | null, close = false) => {
  currentGroup.value = id
  close && closePopups()
  void loadBooks(id)
}
const clearConfirmDelete = () => { confirmDelete.value = null }
const confirmGroupDelete = (group: GroupConfig) => { modalMode.value = 'manage'; confirmDelete.value = { type: 'group', id: group.id, item: group } }
const handleToolbarAction = (id: string) => {
  if (id === 'back') setGroup(null)
  else if (id === 'view') viewMode.value = getNextViewMode(viewMode.value)
  else if (id === 'organize') modalMode.value = 'organize'
  else if (id === 'manage') { modalMode.value = 'manage'; importMode.value = 'file' }
}
const getCoverUrl = (book: Book) => bookshelfManager.getCoverUrl(book)
const getGroupCoverUrls = (group: GroupConfig) => books.value.filter(book => bookInGroup(book, group)).map(getCoverUrl).filter(Boolean).slice(0, 4)
const getProgress = (book: Book) => `${book.progress || 0}%`
const toggleArrayItem = (arr: any[], value: any) => { const i = arr.indexOf(value); i > -1 ? arr.splice(i, 1) : arr.push(value) }
const toggleFilterItem = (key: string, value: any) => key === 'rating' ? filterMap[key].value = value : toggleArrayItem(filterMap[key].value, value)
const isFilterActive = (key: string, value: any) => key === 'rating' ? filterMap[key].value === value : filterMap[key].value.includes(value)
const closePopups = () => { modalMode.value = null; editingGroup.value = null; batchMode.value = null; clearConfirmDelete(); resetImport() }
const resetOrganize = () => { filterStatus.value = []; filterRating.value = 0; filterFormats.value = []; filterTags.value = []; sortType.value = 'time'; sortReverse.value = false; viewMode.value = 'grid'; batchMode.value = null }
const refreshGroups = async () => { const { groups: nextGroups, counts } = await bookshelfManager.getGroupDisplayState(); groups.value = nextGroups; groupCounts.value = counts }
const loadBooks = async (group = currentGroup.value) => {
  const state = await bookshelfManager.getBookshelfState({ currentGroup: group, keyword: keyword.value, sortBy: sortType.value, reverse: sortReverse.value, status: filterStatus.value, rating: filterRating.value, formats: filterFormats.value, tags: filterTags.value })
  books.value = state.books
  stats.value = state.stats
}
const refresh = () => Promise.all([loadBooks(), refreshGroups()])
const showResult = (success: number, failed: number, ok: string, fail = `成功${success}本，失败${failed}本`, time = 2000) => showMessage(failed ? fail : ok, time, failed ? 'error' : 'info')
const ratingItems = (handler: (rating: number) => void | Promise<void>, clearLabel = '清除') => [1, 2, 3, 4, 5].map(value => ({ icon: 'iconStar', label: `${'★'.repeat(value)} ${value}星`, click: () => handler(value) })).concat([{ type: 'separator' }, { icon: 'iconClose', label: clearLabel, click: () => handler(0) }])
const statusItems = (handler: (status: BookStatus) => void | Promise<void>) => STATUS_OPTIONS.map(([k, v]) => ({ icon: MENU_ICONS.status[k], label: v, click: () => handler(k) }))
const assignEditForm = (book: Book) => { const b = book as any; Object.assign(editForm.value, { title: b.title, author: b.author, tags: b.tags.join(', '), rating: b.rating || 0, status: b.status, cover: b.cover || '', groups: b.groups || [], bindDocId: b.bindDocId || '', bindDocName: b.bindDocName || '' }) }

const createGroupDraft = (type: GroupType): GroupConfig => ({ id: `group_${Date.now()}`, name: '', icon: type === 'smart' ? '⚡' : '📁', order: groups.value.length, type, rules: createDefaultGroupRules() })
const startEditGroup = (g?: GroupConfig, type: GroupType = 'folder') => {
  if (!g && !can.value(type === 'smart' ? 'smart-group' : 'folder-group')) return showUpgrade(type === 'smart' ? '智能分组' : '分组')
  editingGroup.value = g ? { ...g, rules: g.rules || createDefaultGroupRules() } : createGroupDraft(type)
  modalMode.value = 'manage'
}
const saveGroup = async () => {
  if (!editingGroup.value?.name.trim()) return (editingGroup.value = null)
  const { created } = await bookshelfManager.upsertGroup(editingGroup.value)
  await refresh()
  showMessage(`已${created ? '创建' : '更新'}：${editingGroup.value.name}`, 2000, 'info')
  editingGroup.value = null
  modalMode.value = 'manage'
}
const deleteGroup = async (g: GroupConfig) => {
  await bookshelfManager.deleteGroup(g.id)
  if (currentGroup.value === g.id) currentGroup.value = null
  clearConfirmDelete()
  await refresh()
  showMessage(`已删除：${g.name}`, 2000, 'info')
}

const showGroupMenu = (group: GroupConfig, e: MouseEvent) => {
  const m = new Menu()
  ;[
    { icon: 'iconFolder', label: '打开分组', click: () => setGroup(group.id) },
    { icon: 'iconEdit', label: '重命名', click: () => startEditGroup(group) },
    { type: 'separator' },
    { icon: 'iconTrashcan', label: '删除', click: () => { m.close(); confirmGroupDelete(group) } },
  ].forEach(item => m.addItem(item))
  m.open({ x: e.clientX, y: e.clientY })
}

const updateBookField = async (book: Book, field: string, value: any, msg: string) => {
  await bookshelfManager.updateBookField(book.url, field as 'rating' | 'status' | 'group', value)
  await (field === 'group' ? refresh() : loadBooks())
  showMessage(msg, 2000, 'info')
}
const moveBookToGroup = async (url: string, groupId: string) => {
  await bookshelfManager.updateBookField(url, 'group', groupId)
  await refresh()
  const group = folderGroups.value.find(item => item.id === groupId)
  showMessage(`已移动到：${group?.name || '分组'}`, 2000, 'info')
}
const moveBookToHome = async (url: string) => {
  await bookshelfManager.updateBookField(url, 'group', 'home')
  await refresh()
  showMessage('已移出分组', 2000, 'info')
}
const readBook = async (book: Book) => {
  const { getBookWithFallback } = await import('@/utils/bookOpen')
  const full = await getBookWithFallback(bookshelfManager, book.url)
  if (!full) return showMessage('加载失败', 3000, 'error')
  if (isMobile()) window.dispatchEvent(new CustomEvent('reader:mobile-open', { detail: { book: full } }))
  else emit('read', full)
}
const removeBook = async (book: Book) => {
  const res = await bookshelfManager.removeBooks([book.url])
  clearConfirmDelete()
  await refresh()
  showResult(res.success, res.failed, '已移出书架', '删除失败')
}
const parseImportUrls = async () => { try { await parseDraftUrls() } catch (e) { showMessage(e instanceof Error ? e.message : '解析失败', 2000, 'error') } }
const cloudAccountLabel = (account: CloudDriveAccount) => account.name || account.server || 'OpenList'
const cloudEntryFormat = (name = '') => {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return ext === 'azw' ? 'azw3' : ext
}
const cloudEntryPreview = (entry: OpenListEntry) => {
  const title = entry.name.replace(/\.[^.]+$/, '')
  return {
    title,
    author: '未知作者',
    format: cloudEntryFormat(entry.name),
    cover: '',
    size: entry.size || 0,
  }
}
const formatBytes = (size = 0) => {
  if (!size) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)))
  return `${(size / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`
}
const loadCloudAccounts = async (forceRoot = false) => {
  const settings = await settingsManager.get()
  cloudAccounts.value = (settings.cloudAccounts || []).filter(account => account.server?.trim())
  if (!cloudAccounts.value.some(account => account.id === selectedCloudAccountId.value)) selectedCloudAccountId.value = cloudAccounts.value[0]?.id || ''
  if (forceRoot && currentCloudAccount.value) await loadCloudRoot()
}
const openCloudImport = async () => {
  importMode.value = 'cloud'
  await loadCloudAccounts()
  if (currentCloudAccount.value && !cloudEntries.value.length) await loadCloudRoot()
}
const loadCloudDir = async (path = '/') => {
  if (!currentCloudAccount.value) return
  cloudLoading.value = true
  cloudError.value = ''
  cloudProgress.value = 8
  cloudProgressText.value = '加载中...'
  try {
    cloudPath.value = path || '/'
    cloudEntries.value = await listOpenListDir(currentCloudAccount.value, cloudPath.value)
    cloudProgress.value = 100
    clearCloudSearch(false)
    selectedCloudPaths.value = selectedCloudPaths.value.filter(item => cloudEntries.value.some(entry => entry.path === item))
  } catch (error) {
    cloudEntries.value = []
    cloudError.value = error instanceof Error ? error.message : '云盘目录加载失败'
  } finally {
    cloudLoading.value = false
    cloudProgressText.value = ''
    window.setTimeout(() => { cloudProgress.value = 0 }, 200)
  }
}
const loadCloudRoot = () => {
  selectedCloudPaths.value = []
  return loadCloudDir('/')
}
const loadCloudParent = () => {
  const parent = cloudPath.value.split('/').filter(Boolean).slice(0, -1).join('/')
  return loadCloudDir(parent ? `/${parent}` : '/')
}
const isCloudSelected = (entry: OpenListEntry) => selectedCloudPaths.value.includes(entry.path)
const clearCloudSearch = (clearKeyword = true) => {
  cloudSearchActive.value = false
  cloudSearchEntries.value = []
  if (clearKeyword) cloudSearchKeyword.value = ''
}
const searchCloudFiles = async () => {
  if (!currentCloudAccount.value) return
  const keyword = cloudSearchKeyword.value.trim()
  if (!keyword) return clearCloudSearch()
  const deepSearch = () => deepSearchOpenListFiles(currentCloudAccount.value!, keyword, cloudPath.value, {
    maxDirs: 2000,
    maxResults: 300,
    onProgress: message => {
      cloudProgressText.value = message
      cloudProgress.value = Math.min(95, cloudProgress.value + 2)
    },
  })
  cloudLoading.value = true
  cloudError.value = ''
  cloudProgress.value = 8
  cloudProgressText.value = '搜索中...'
  try {
    cloudSearchEntries.value = await searchOpenListFiles(currentCloudAccount.value, keyword, cloudPath.value)
    if (!cloudSearchEntries.value.length) {
      cloudProgress.value = 30
      cloudProgressText.value = '深度搜索中...'
      cloudSearchEntries.value = await deepSearch()
      if (!cloudSearchEntries.value.length) {
        const local = cloudEntries.value.filter(entry => entry.name.toLowerCase().includes(keyword.toLowerCase()))
        cloudSearchEntries.value = local
      }
    }
    cloudProgress.value = 100
    cloudSearchActive.value = true
  } catch (error) {
    try {
      cloudProgress.value = 30
      cloudProgressText.value = '索引不可用，正在深度搜索...'
      cloudSearchEntries.value = await deepSearch()
      cloudSearchActive.value = true
      cloudError.value = cloudSearchEntries.value.length ? '' : '未找到匹配文件'
    } catch (deepError) {
      cloudSearchEntries.value = cloudEntries.value.filter(entry => entry.name.toLowerCase().includes(keyword.toLowerCase()))
      cloudSearchActive.value = !!cloudSearchEntries.value.length
      cloudError.value = cloudSearchEntries.value.length ? '已显示当前目录匹配结果' : (deepError instanceof Error ? deepError.message : error instanceof Error ? error.message : '搜索失败')
    }
  } finally {
    cloudLoading.value = false
    cloudProgressText.value = ''
    window.setTimeout(() => { cloudProgress.value = 0 }, 200)
  }
}
const toggleCloudSelection = (entry: OpenListEntry) => {
  if (entry.isDir || !isSupportedCloudBook(entry.name)) return
  const index = selectedCloudPaths.value.indexOf(entry.path)
  index > -1 ? selectedCloudPaths.value.splice(index, 1) : selectedCloudPaths.value.push(entry.path)
}
const prepareCloudImport = async () => {
  if (!currentCloudAccount.value || !selectedCloudPaths.value.length) return
  cloudLoading.value = true
  cloudError.value = ''
  cloudProgress.value = 5
  try {
    const entriesByPath = new Map(displayedCloudEntries.value.map(entry => [entry.path, entry]))
    const files: Array<{ linkSource: string; label: string; preview: any }> = []
    for (const [index, path] of selectedCloudPaths.value.entries()) {
      cloudProgressText.value = `准备引用 ${index + 1}/${selectedCloudPaths.value.length}`
      cloudProgress.value = Math.round(((index + 1) / selectedCloudPaths.value.length) * 100)
      const entry = entriesByPath.get(path) || { name: path.split('/').pop() || path, path, isDir: false, size: 0, modified: '' }
      files.push({
        linkSource: createOpenListBookUrl(currentCloudAccount.value, path),
        label: entry.name,
        preview: cloudEntryPreview(entry),
      })
    }
    await parseLinkedFiles(files)
  } catch (error) {
    cloudError.value = error instanceof Error ? error.message : '云盘文件解析失败'
  } finally {
    cloudLoading.value = false
    cloudProgressText.value = ''
    window.setTimeout(() => { cloudProgress.value = 0 }, 200)
  }
}
const confirmImport = async (mode: 'file' | 'link' | 'cloud') => {
  const res = await importSelected(mode)
  await loadBooks()
  showResult(res.success, res.failed, `导入${res.success}本`, `成功${res.success}本，失败${res.failed}本`, 3000)
  if (!res.failed) resetImport()
}
const toggleImportItem = (item: { selected: boolean; error: string; loading: boolean }) => { if (!item.error && !item.loading) item.selected = !item.selected }
const openBookPanel = async (mode: 'detail' | 'edit', book: Book) => { panelBook.value = await bookshelfManager.getBook(book.url) || book; if (mode === 'edit') { if (!can.value('book-edit')) return showUpgrade('书籍编辑'); editingBook.value = panelBook.value.url; resetEditForm(); assignEditForm(panelBook.value) } modalMode.value = mode }
const showContextMenu = (book: Book, e: MouseEvent) => {
  const hasBinding = !!(book as any).bindDocId
  const ratingMenu = ratingItems(rating => updateBookField(book, 'rating', rating, rating ? `已评 ${rating} 星` : '已清除评分'))
  const groupMenu = (book.groups.length ? [{ icon: 'iconFiles', label: '首页', click: () => updateBookField(book, 'group', 'home', '已移动到首页') }, ...(folderGroups.value.length ? [{ type: 'separator' }] : [])] : []).concat(folderGroups.value.map(g => ({ icon: 'iconFolder', label: g.name, click: () => updateBookField(book, 'group', g.id, `已移动到：${g.name}`) })))
  const m = new Menu()
  ;[{ icon: 'iconPlay', label: '打开阅读', click: () => readBook(book) }, { icon: 'iconInfo', label: '详细信息', click: () => openBookPanel('detail', book) }, { icon: 'iconStar', label: '评分', type: 'submenu', submenu: ratingMenu }, { icon: 'iconCheck', label: '标记状态', type: 'submenu', submenu: statusItems(status => updateBookField(book, 'status', status, `已标记为${STATUS_MAP[status]}`)) }, { icon: 'iconFolder', label: '移动到', type: 'submenu', submenu: groupMenu }, { icon: hasBinding ? 'iconLinkOff' : 'iconLink', label: hasBinding ? '解除绑定' : '绑定文档', click: () => openBookPanel('edit', book) }, { type: 'separator' }, { icon: 'iconEdit', label: '编辑信息', click: () => openBookPanel('edit', book) }, { icon: 'iconTrashcan', label: '移出书架', click: () => { m.close(); confirmDelete.value = { type: 'book', id: book.url, item: book } } }].forEach(item => m.addItem(item))
  m.open({ x: e.clientX, y: e.clientY })
}

const batchOp = async (op: 'rate' | 'status' | 'remove', value?: number | BookStatus) => {
  if (!can.value('batch-operation')) return showUpgrade('批量操作')
  const urls = displayBooks.value.map(book => book.url)
  if (!urls.length) return
  const done = async (res: any, action: string) => { batchMode.value = null; await refresh(); showResult(res.success, res.failed, `${action} ${res.success} 本`) }
  if (op === 'remove') {
    if (!confirm(`确定移出 ${urls.length} 本书籍？`)) return
    return done(await bookshelfManager.removeBooks(urls), '已移出')
  }
  if (op === 'rate') return done(await bookshelfManager.batchUpdateRating(urls, Number(value || 0)), value ? '已评分' : '已清除')
  return done(await bookshelfManager.batchUpdateStatus(urls, value as BookStatus), '已更新')
}
const toggleBatchMode = (mode: 'rate' | 'status') => batchMode.value = batchMode.value === mode ? null : mode

const editFields = computed(() => buildEditFields())
const groupFields = computed(() => buildGroupFields(editingGroup.value, allTags.value))
const isGroupRuleActive = (field: any, value: any) => field.single ? editingGroup.value?.rules[field.key] === value : editingGroup.value?.rules[field.key]?.includes(value)
const toggleGroupRule = (field: any, value: any) => field.single ? editingGroup.value && (editingGroup.value.rules[field.key] = value) : editingGroup.value && toggleArrayItem(editingGroup.value.rules[field.key], value)
const resetEditForm = () => { editForm.value = createDefaultEditForm(); bindSearch.value = ''; bindResults.value = [] }
const saveEdit = async () => {
  if (!editingBook.value) return
  const result = await bookshelfManager.updateBookInfo(editingBook.value, editForm.value)
  if (!result.success) return showMessage(result.error || '保存失败', 2000, 'error')
  await refresh()
  allTags.value = await bookshelfManager.getAllTags()
  showMessage('保存成功', 2000, 'info')
  closePopups()
}
const toggleTag = (tag: string) => { const tags = editForm.value.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean); toggleArrayItem(tags, tag); editForm.value.tags = tags.join(', ') }
const toggleGroup = (gid: string) => toggleArrayItem(editForm.value.groups, gid)
const searchBindDoc = async () => { const q = bindSearch.value.trim(); if (!q) return bindResults.value = []; try { bindResults.value = await searchDocs(q) } catch { bindResults.value = [] } }
const selectBindDoc = (d: any) => { const id = d.path?.split('/').pop()?.replace('.sy', '') || d.id; if (!id) return showMessage('文档 ID 无效', 2000, 'error'); Object.assign(editForm.value, { bindDocId: id, bindDocName: d.hPath || d.content || '无标题' }); bindSearch.value = ''; bindResults.value = [] }
const unbindDoc = () => { editForm.value.bindDocId = ''; editForm.value.bindDocName = '' }
const detailFields = computed(() => !panelBook.value || modalMode.value !== 'detail' ? [] : buildDetailFields(panelBook.value, groups.value))

const handleBookshelfUpdated = () => { void Promise.all([loadBooks(), refreshGroups()]) }
onMounted(async () => {
  await bookshelfManager.init()
  const [, allTagsData] = await Promise.all([refreshGroups(), bookshelfManager.getAllTags()])
  allTags.value = allTagsData
  sortType.value = await bookshelfManager.getSetting('bookshelf_sortType', 'time')
  sortReverse.value = await bookshelfManager.getSetting('bookshelf_sortReverse', false)
  viewMode.value = await bookshelfManager.getSetting('bookshelf_viewMode', 'grid')
  settingsLoaded = true
  await loadBooks()
  window.addEventListener('sireader:bookshelf-updated', handleBookshelfUpdated)
})
onUnmounted(() => { window.removeEventListener('sireader:bookshelf-updated', handleBookshelfUpdated); settingTimers.forEach(timer => clearTimeout(timer)); settingTimers.clear() })
watch([filterStatus, filterRating, filterFormats, filterTags, sortType, sortReverse], loadBooks, { deep: true })
watch(sortType, v => settingsLoaded && saveUiSetting('bookshelf_sortType', v))
watch(sortReverse, v => settingsLoaded && saveUiSetting('bookshelf_sortReverse', v))
watch(viewMode, v => settingsLoaded && saveUiSetting('bookshelf_viewMode', v))
</script>

<style scoped lang="scss">
.sr-bookshelf{--sr-gap:6px;position:relative;display:flex;flex-direction:column;height:100%;overflow:hidden}
.sr-confirm{display:flex;align-items:center}
:deep(.sr-books){overflow:hidden}
.sr-input{width:100%;min-width:0;box-sizing:border-box}
.sr-back{color:var(--b3-theme-primary)}
.sr-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100%;font-size:14px;opacity:.5}
.sr-empty-hint,.sr-muted,.sr-entry-meta{font-size:12px;color:var(--b3-theme-on-surface-variant)}
.sr-manage-panel{position:absolute;top:44px;left:8px;right:8px;z-index:20;max-height:calc(100% - 56px);overflow:auto;padding:12px;box-sizing:border-box;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:10px;box-shadow:0 8px 24px #0002}
.sr-modal__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--b3-border-color);font-size:13px;font-weight:600}
.sr-modal__body{display:flex;flex-direction:column;gap:12px;padding-top:12px;box-sizing:border-box}
.sr-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.sr-entry-meta{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-form-item{display:flex;flex-direction:column;gap:4px;padding:0 0 12px;border-bottom:1px solid var(--b3-border-color);font-size:12px}
.sr-form-item:last-child{border-bottom:none}
.sr-textarea{min-height:84px;resize:vertical;box-sizing:border-box}
.sr-chips{display:flex;flex-wrap:wrap;gap:calc(var(--sr-gap) / 2)}
.sr-chip{
  display:inline-flex;align-items:center;justify-content:center;padding:3px 8px;
  border:1px solid var(--b3-border-color);border-radius:999px;background:var(--b3-theme-background);
  color:var(--b3-theme-on-surface);font-size:11px;font-weight:600;line-height:1.2;white-space:nowrap
}
button.sr-chip{cursor:pointer}
button.sr-chip:hover{background:var(--b3-list-hover)}
.sr-chip.is-active{border-color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary)}
.sr-chip.is-danger{background:var(--b3-theme-error);border-color:var(--b3-theme-error);color:#fff}
.sr-select{width:100%;min-width:0;min-height:32px;font-size:inherit;border-radius:8px;box-sizing:border-box}
.sr-row{display:flex;gap:var(--sr-gap);flex-wrap:wrap;align-items:center}
.sr-actions-end{justify-content:flex-end}
.sr-error{color:var(--b3-theme-error)}
.sr-cloud-panel{display:flex;flex-direction:column;gap:8px}
.sr-cloud-search{display:flex;align-items:center;gap:4px;min-width:220px}
.sr-cloud-search .b3-text-field{height:28px;min-width:180px}
.sr-progress{height:4px;overflow:hidden;border-radius:999px;background:var(--b3-border-color)}
.sr-progress__bar{height:100%;min-width:12px;border-radius:inherit;background:var(--b3-theme-primary);transition:width .18s ease}
.sr-cloud-list{display:flex;flex-direction:column;max-height:260px;overflow:auto;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-background)}
.sr-cloud-row{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;min-height:32px;padding:0 10px;border:0;border-bottom:1px solid var(--b3-border-color);background:transparent;color:var(--b3-theme-on-surface);font:inherit;text-align:left;cursor:pointer}
.sr-cloud-row:last-child{border-bottom:0}
.sr-cloud-row:hover{background:var(--b3-list-hover)}
.sr-cloud-row.is-selected{background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary)}
.sr-cloud-row.is-disabled{opacity:.45;cursor:not-allowed}
.sr-cloud-icon{width:15px;height:15px}
.sr-cloud-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-cloud-meta{font-size:11px;color:var(--b3-theme-on-surface-variant);white-space:nowrap}
.sr-grow{flex:1;min-width:0}
.sr-inline{display:flex;align-items:center;gap:4px;flex:0 0 auto;flex-wrap:nowrap}
.sr-group-item{display:flex;align-items:center;gap:8px;margin-top:8px}
.sr-group-label{display:flex;align-items:center;justify-content:flex-start;gap:4px;min-width:0;min-height:32px;padding:0 12px;font-size:12px}
.sr-group-label strong,.sr-group-label .sr-entry-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-section-line{padding-top:12px;border-top:1px solid var(--b3-border-color)}
.sr-confirm{display:flex;align-items:center;gap:var(--sr-gap);margin:6px 0 8px;padding:var(--sr-gap);border:1px solid var(--b3-border-color);border-radius:var(--b3-border-radius-b);background:var(--b3-theme-background)}
.sr-confirm span{flex:1;min-width:0}
.sr-editor{display:flex;flex-direction:column;margin-top:12px;padding:12px;background:var(--b3-theme-background);border:1px solid var(--b3-border-color);border-radius:10px}
.sr-editor-head{padding:0 0 12px;border-bottom:1px solid var(--b3-border-color);font-size:13px;font-weight:600}
.sr-editor .sr-form-item{padding:0;border-bottom:none}
.sr-editor .sr-form-item + .sr-form-item{margin-top:10px}
.sr-editor-actions{margin-top:12px;padding-top:0}
.sr-panel-cover{width:124px;height:176px;margin:0 auto 4px;overflow:hidden;border-radius:var(--b3-border-radius);background:var(--b3-theme-surface)}
.sr-panel-cover img{width:100%;height:100%;object-fit:cover}
.mono{font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}
.fade-enter-active,.fade-leave-active{transition:opacity .18s ease}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
