<template>
  <DockShell class="sr-bookshelf" v-model:search-value="keyword" body-class="sr-books" search-placeholder="搜索书籍或分组..." :toolbar-start-actions="toolbarStartActions" :toolbar-actions="toolbarActions" @click="closePopups" @toolbar-action="handleToolbarAction">
      <Transition name="fade">
        <div v-if="!displayItems.length" class="sr-empty">
          <div>{{ keyword ? '未找到内容' : '暂无内容' }}</div>
          <div v-if="!keyword" class="sr-empty-hint">暂无书籍，点击右上角添加内容</div>
        </div>

        <component :is="View" v-else :key="`${viewMode}-${currentGroup || 'root'}`" v-bind="viewProps" @select-group="setGroup" @book-click="readBook" @book-menu="showContextMenu" @group-menu="showGroupMenu" @move-book-group="moveBookToGroup" @move-book-home="moveBookToHome" @toggle-select-book="toggleSelectBook" />
      </Transition>

      <div v-if="selecting" class="sr-selection-bar" @click.stop>
        <div v-for="row in batchRows" :key="row.key" class="sr-selection-detail">
          <template v-for="item in row.items" :key="item.key">
            <span v-if="item.text" class="sr-selection-count">{{ item.text }}</span>
            <input v-else-if="item.input" v-model="batchTags" class="b3-text-field sr-selection-input" :placeholder="item.input" />
            <button v-else class="sr-chip" type="button" :class="{ 'is-active': item.active, 'is-danger': item.danger, 'is-primary': item.primary }" :disabled="item.disabled" @click="item.click">{{ item.label }}</button>
          </template>
        </div>
      </div>

      <div v-if="confirmDelete" class="sr-selection-bar sr-confirm-bar" :class="{ 'sr-confirm-bar--above-selection': selecting }" @click.stop>
        <div class="sr-selection-detail"><span class="sr-selection-count">{{ confirmDeleteText }}</span></div>
        <div class="sr-row sr-actions-end">
          <button class="b3-button b3-button--outline" type="button" @click="clearConfirmDelete">取消</button>
          <button v-if="confirmDelete?.type === 'group'" class="b3-button b3-button--outline" type="button" @click="confirmDeleteAction(false)">确认删除</button>
          <template v-else>
            <button v-if="confirmDelete?.phase !== 'delete'" class="b3-button b3-button--outline" type="button" @click="confirmDeleteAction(false)">确认移除</button>
            <button v-if="confirmDelete?.phase !== 'delete'" class="b3-button b3-button--remove" type="button" @click="confirmDelete.phase = 'delete'">彻底删除</button>
            <button v-else class="b3-button b3-button--remove" type="button" @click="confirmDeleteAction(true)">确认彻底删除</button>
          </template>
        </div>
      </div>

    <template #overlay>
      <Transition name="fade">
        <div v-if="modalMode" class="sr-manage-panel" @click.stop>
        <header class="sr-modal__head"><span>{{ modalTitle }}</span><span class="block__icon block__icon--show b3-tooltips b3-tooltips__nw sr-icon-btn" aria-label="关闭" @click="closePopups"><svg><use xlink:href="#lucide-x" /></svg></span></header>

        <div class="sr-modal__body">
          <template v-if="modalMode === 'manage'">
            <div class="sr-form-item"><span class="ft__secondary">快捷操作</span><div class="sr-grid2"><button class="b3-button b3-button--outline" type="button" title="从电脑选择 EPUB、PDF 等电子书文件，导入后由插件托管文件和封面。" @click="openLocalImport">本地导入</button><button class="b3-button b3-button--outline" type="button" title="浏览或搜索思源同步盘中的电子书，并添加到书架。" @click="setImportMode('cloud')">思盘导入</button><button class="b3-button b3-button--outline" type="button" title="创建普通文件夹分组。书籍加入后会从首页独立书籍区移出，属于实际归类。" @click="startEditGroup()">手动分组</button><button class="b3-button b3-button--outline" type="button" title="创建按标签、格式、状态、评分等条件动态显示的分组。智能分组不移动书籍归属，也不会把书从首页隐藏。" @click="startEditGroup(undefined, 'smart')">智能分组</button></div></div>

            <template v-if="!editingGroup && importMode === 'link'">
              <div class="sr-editor sr-import-card">
                <div class="sr-editor-head"><strong>输入链接</strong></div>
                <textarea class="b3-text-field fn__block sr-textarea" v-model="importDraft" placeholder="每行一个本地路径、file 链接、网络直链或思盘链接" />
                <div class="sr-row"><button class="b3-button b3-button--outline sr-grow" type="button" @click="parseImportUrls" :disabled="!importDraft.trim() || importParsing">{{ importParsing ? '解析中...' : '解析链接' }}</button></div>
              </div>
            </template>

            <template v-if="!editingGroup && importMode === 'cloud'">
              <div class="sr-editor sr-import-card">
                <div class="sr-editor-head"><strong>思盘导入</strong></div>
                <div class="sr-row"><input v-model.trim="cloudInput" class="b3-text-field sr-grow" placeholder="输入思盘路径" @keyup.enter="openCloudInput" /><button class="b3-button b3-button--outline" type="button" :disabled="cloudLoading || !cloudInput" @click="openCloudInput">输入</button></div>
                <div class="sr-row"><input v-model.trim="cloudKeyword" class="b3-text-field sr-grow" placeholder="输入关键词搜索" @keyup.enter="searchCloud" /><button class="b3-button b3-button--outline" type="button" :disabled="cloudLoading || !cloudKeyword" @click="searchCloud">搜索</button></div>
                <div class="sr-row"><button class="b3-button b3-button--outline sr-grow" type="button" :disabled="cloudLoading" @click="listCloud('/')">浏览全部</button></div>
                <div v-if="cloudError" class="sr-muted">{{ cloudError }}</div>
                <View v-if="cloudResults.length" class="sr-cloud-results" :items="cloudDisplayItems" mode="compact" dense selecting select-groups :selected-urls="cloudSelectedPaths" :show-group-meta="false" :status-map="STATUS_MAP" :get-cover-url="getCoverUrl" :get-group-cover-urls="() => []" :get-progress="() => ''" @select-group="listCloud" @toggle-select-book="book => toggleCloudPath(book.url)" />
                <div v-if="cloudResults.length" class="sr-row sr-actions-end"><button class="b3-button b3-button--outline" type="button" :disabled="cloudLoading || !cloudSelectedPaths.length" @click="parseSelectedCloud">{{ cloudLoading ? '解析中...' : `解析选中 ${cloudSelectedPaths.length || ''}` }}</button></div>
              </div>
            </template>

            <div v-if="showImportItems" class="sr-editor sr-import-card">
              <div class="sr-editor-head"><strong>待导入</strong></div>
              <div class="sr-row"><button class="sr-chip" :class="{ 'is-active': importAllSelected }" type="button" @click="importAllSelected = !importAllSelected">{{ importAllSelected ? '取消全选' : '全选导入' }}</button><span>{{ importSelectedCount }} / {{ importItems.length }}</span><span v-if="importParsing">{{ importProgress }}%</span></div>
              <View class="sr-import-list" :items="importDisplayItems" mode="list" :status-map="STATUS_MAP" :get-cover-url="getCoverUrl" :get-progress="getProgress" @toggle-import="toggleImportItem" />
            </div>

            <div v-if="showImportItems" class="sr-editor sr-import-card sr-import-card--sm">
              <div class="sr-editor-head"><strong>导入设置</strong></div>
              <input v-model="importBulkTags" class="b3-text-field sr-input" placeholder="添加标签，用逗号分隔" />
              <div v-if="allTags.length" class="sr-chips"><button v-for="t in allTags.slice(0, 10)" :key="t.tag" class="sr-chip" type="button" :class="{ 'is-active': importTagList.includes(t.tag) }" @click="toggleImportTag(t.tag)">#{{ t.tag }}</button></div>
              <template v-for="row in importApplyRows" :key="row.key">
                <span class="sr-muted">{{ row.label }}</span>
                <input v-if="row.key === 'groups'" v-model="importGroupKeyword" class="b3-text-field sr-input" placeholder="搜索分组..." />
                <div class="sr-chips"><button v-for="item in row.items" :key="item.key" class="sr-chip" type="button" :class="{ 'is-active': item.active }" @click="item.click">{{ item.label }}</button></div>
              </template>
            </div>

          </template>

              <div v-if="modalMode === 'organize' && groups.length">
                <span class="ft__secondary">{{ modalMode === 'organize' ? '分组排序' : '现有分组' }}</span>
                <template v-for="g in groups" :key="g.id">
                  <div class="sr-group-item">
                    <button class="b3-button sr-grow sr-group-label" :class="g.type === 'smart' ? 'b3-button--cancel' : 'b3-button--outline'" type="button" @click="setGroup(g.id, true)"><strong>{{ g.name }}</strong><span class="sr-entry-meta">{{ groupCounts[g.id] || 0 }} 本</span></button>
                    <span class="sr-inline" @click.stop><span v-for="a in groupRowActions(g)" :key="a.label" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw sr-icon-btn sr-icon-btn--sm" :class="a.warn && 'block__icon--warning'" :aria-label="a.label" @click="a.click"><svg><use :xlink:href="a.icon" /></svg></span></span>
                  </div>
                </template>
              </div>
              <div v-if="modalMode === 'manage' && editingGroup" class="sr-editor">
                <div class="sr-editor-head"><strong>{{ groups.some(g => g.id === editingGroup!.id) ? '编辑分组' : '新增分组' }}</strong></div>
                <div v-for="f in groupFields" :key="f.key" class="sr-form-item">
                  <span class="ft__secondary">{{ f.label }}</span>
                  <input v-if="f.type === 'text'" v-model="editingGroup[f.key]" class="b3-text-field sr-input" :placeholder="f.placeholder" />
                  <div v-else class="sr-chips"><button v-for="opt in f.options" :key="opt.value" class="sr-chip" :class="{ 'is-active': isGroupRuleActive(f, opt.value) }" type="button" @click="toggleGroupRule(f, opt.value)">{{ opt.label }}</button></div>
                </div>
                <div class="sr-row sr-actions-end sr-editor-actions"><button class="b3-button b3-button--outline" type="button" @click="editingGroup = null">取消</button><button class="b3-button b3-button--outline" type="button" @click="saveGroup">保存</button></div>
              </div>

          <template v-if="modalMode === 'manage'">
            <div class="sr-row sr-actions-end sr-section-line">
              <button class="b3-button b3-button--outline" type="button" title="关闭面板，不导入当前待导入项目。" @click="closePopups">取消</button>
              <button v-if="showImportItems && importMode === 'file'" class="b3-button b3-button--outline" type="button" title="复制文件到插件托管目录，适合希望书籍随插件数据一起管理的本地文件。" @click="confirmImport('file')" :disabled="!importSelectedCount || importParsing || importing">复制导入</button>
              <button v-if="showImportItems" class="b3-button b3-button--outline" type="button" title="保留原始路径或链接添加到书架，支持 file 链接、本地路径、网络直链和思盘链接。" @click="confirmImport('link')" :disabled="!importLinkSelectedCount || importParsing || importing">链接导入</button>
            </div>
          </template>

          <template v-else-if="modalMode === 'organize'">
            <label class="sr-form-item">
              <span class="ft__secondary">视图</span><div class="sr-chips"><button v-for="mode in VIEW_MODES" :key="mode.value" class="sr-chip" :class="{ 'is-active': viewMode === mode.value }" type="button" @click="viewMode = mode.value">{{ mode.label }}</button></div>
            </label>

            <label class="sr-form-item">
              <span class="ft__secondary">排序</span>
              <div class="sr-chips"><button v-for="[value, label] in SORTS" :key="value" class="sr-chip" :class="{ 'is-active': sortType === value }" type="button" @click="sortType = value">{{ label }}</button></div>
              <div class="sr-chips"><button class="sr-chip" :class="{ 'is-active': sortReverse }" type="button" @click="sortReverse = !sortReverse">反向排序</button></div>
            </label>

            <label v-for="s in filterSections" :key="s.key" class="sr-form-item">
              <span class="ft__secondary">{{ s.label }}</span><div class="sr-chips"><button v-for="opt in s.options" :key="opt.value" class="sr-chip" :class="{ 'is-active': isFilterActive(s.key, opt.value) }" type="button" @click="toggleFilterItem(s.key, opt.value)">{{ opt.label }} ({{ opt.count }})</button></div>
            </label>

            <div class="sr-row sr-actions-end sr-section-line">
              <button class="b3-button b3-button--outline" type="button" @click="resetOrganize">重置整理</button>
              <button class="b3-button b3-button--outline" type="button" @click="closePopups">完成</button>
            </div>
          </template>

          <template v-else-if="modalMode === 'edit'">
            <div v-if="panelCover" class="sr-panel-cover"><img :src="panelCover" /></div>

            <div v-for="f in editFields" :key="f.key" class="sr-form-item">
              <span class="ft__secondary">{{ f.label }}</span>
              <input v-if="f.type === 'text'" v-model="editForm[f.key]" class="b3-text-field sr-input" :placeholder="f.placeholder" />
              <select v-else-if="f.type === 'select'" v-model="editForm[f.key]" class="b3-select sr-select"><option v-for="opt in f.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select>
              <template v-else-if="f.key === 'tags'">
                <input v-model="editForm.tags" class="b3-text-field sr-input" :placeholder="f.placeholder" />
                <div v-if="allTags.length" class="sr-chips"><button v-for="t in allTags.slice(0, 8)" :key="t.tag" class="sr-chip" type="button" :class="{ 'is-active': editForm.tags.includes(t.tag) }" @click="toggleTag(t.tag)">#{{ t.tag }}</button></div>
              </template>
              <template v-else-if="f.key === 'groups'">
                <div v-if="folderGroups.length" class="sr-chips"><button v-for="g in folderGroups" :key="g.id" class="sr-chip" type="button" :class="{ 'is-active': editForm.groups.includes(g.id) }" @click="toggleGroup(g.id)">{{ g.name }}</button></div>
                <span v-else class="sr-muted">暂无分组</span>
              </template>
              <template v-else-if="f.key === 'bind'">
                <input v-if="!editForm.bindDocId" v-model="bindSearch" class="b3-text-field sr-input" placeholder="搜索文档..." @input="searchBindDoc" />
                <div v-if="bindResults.length" class="sr-chips"><button v-for="d in bindResults.slice(0, 8)" :key="getDocId(d) || d.path" class="sr-chip" type="button" @click.stop="selectBindDoc(d)">{{ d.hPath || d.content || d.name || '无标题' }}</button></div>
                <div v-else-if="editForm.bindDocId"><div class="sr-chips sr-chips-stack"><span class="sr-chip is-active">{{ editForm.bindDocName }}</span><button class="sr-chip is-danger" type="button" @click="unbindDoc">解绑</button></div></div>
              </template>
            </div>

            <div class="sr-row sr-actions-end sr-section-line"><button class="b3-button b3-button--outline" type="button" @click="closePopups">取消</button><button class="b3-button b3-button--outline" type="button" @click="saveEdit">保存</button></div>
          </template>

          <template v-else-if="modalMode === 'detail'">
            <div v-if="panelCover" class="sr-panel-cover"><img :src="panelCover" /></div>
            <label v-for="f in detailFields" :key="f.label" class="sr-form-item"><span class="ft__secondary">{{ f.label }}</span><span :class="{ mono: f.mono }">{{ f.value }}</span></label>
          </template>
        </div>
        </div>
      </Transition>
    </template>
  </DockShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { showMessage, Menu } from 'siyuan'
import { bookInGroup, bookshelfManager, SORTS, STATUS_OPTIONS, STATUS_MAP, RATING_OPTIONS, VIEW_MODES, VIEW_MODE_ICONS, MODAL_TITLES, STAR_OPTIONS, createDefaultGroupRules, createDefaultEditForm, filterGroupsByKeyword, getNextViewMode, buildFilterSections, buildEditFields, buildGroupFields, buildDetailFields, hasBookBulkPatch, normalizeCloudPath, siyuanCloudUrl, mergeCloudNodes, listCloudNodes, searchCloudNodes, cloudNodesToItems, isCloudBookPath, type BookBulkPatch, type SortType, type Book, type BookStatus, type BookFormat, type GroupConfig, type BookshelfViewMode, type BookshelfModalMode, type SiyuanCloudNode } from '@/core/bookshelf'
import View from '@/components/bookshelf/View.vue'
import DockShell from './ui/DockShell.vue'
import { isMobile } from '@/utils/mobile'
import { searchDocs } from '@/composables/useSetting'
import { useBookImport } from '@/composables/useBookImport'
import { useLicense } from '@/core/license'
import { importPdfAnnotationsForBook } from '@/core/pdfAnnotationImport'

type ImportMode = 'file' | 'link' | 'cloud'
type GroupType = 'folder' | 'smart'

const props = defineProps<{ i18n?: any; coverSize?: number; hiddenItems?: string[] }>()
const emit = defineEmits<{ read: [book: Book] }>()
const { can, showUpgrade } = useLicense(props.i18n || {})
const MENU_ICONS = { status: { unread: 'iconUncheck', reading: 'iconEye', finished: 'iconCheck' } }
const dragEnabled = !isMobile()

const books = ref<Book[]>([]), groups = ref<GroupConfig[]>([]), allTags = ref<Array<{ tag: string; count: number }>>([])
const stats = ref({ byStatus: { unread: 0, reading: 0, finished: 0 }, byFormat: { epub: 0, pdf: 0, mobi: 0, azw3: 0, txt: 0 } })
const keyword = ref(''), importGroupKeyword = ref(''), moveGroupKeyword = ref(''), currentGroup = ref<string | null>(null), filterRating = ref(0), sortReverse = ref(false)
const filterStatus = ref<BookStatus[]>([]), filterFormats = ref<BookFormat[]>([]), filterTags = ref<string[]>([])
const sortType = ref<SortType>('time'), viewMode = ref<BookshelfViewMode>('grid')
const batchMode = ref<'rate' | 'status' | 'tags' | 'groups' | null>(null)
const selecting = ref(false), selectedBookUrls = ref<string[]>([]), groupCounts = ref<Record<string, number>>({})
const editingBook = ref<string | null>(null), editingGroup = ref<GroupConfig | null>(null)
const confirmDelete = ref<{ type: 'group' | 'book'; id: string; item: any; phase?: 'delete' } | { type: 'batch'; id: string; count: number; urls: string[]; phase?: 'delete' } | null>(null)
const modalMode = ref<BookshelfModalMode>(null), panelBook = ref<Book | null>(null), importMode = ref<ImportMode>('link')
const importBulkTags = ref(''), importBulkStatus = ref<BookStatus | ''>(''), importBulkRating = ref(0), importBulkGroups = ref<string[]>([])
const batchTags = ref(''), batchGroups = ref<string[]>([])
const batchTagAction = ref<'add' | 'remove' | 'set'>('add'), batchGroupAction = ref<'add' | 'remove' | 'set'>('add')
const editForm = ref(createDefaultEditForm())
const bindSearch = ref(''), bindResults = ref<any[]>([])
const cloudInput = ref(''), cloudKeyword = ref(''), cloudLoading = ref(false), cloudError = ref(''), cloudResults = ref<SiyuanCloudNode[]>([]), cloudSelectedPaths = ref<string[]>([]), cloudImportGroups = ref<Record<string, string[]>>({})
const { items: importItems, draft: importDraft, parsing: importParsing, importing, progress: importProgress, hasItems: importHasItems, selectedCount: importSelectedCount, linkSelectedCount: importLinkSelectedCount, allSelected: importAllSelected, reset: resetImport, pickAndParseFiles, parseDraftUrls, importSelected } = useBookImport()

let settingsLoaded = false, reloading = false, lastReloadAt = 0, activeMenu: any = null
const settingTimers = new Map<string, number>()
const closeMenu = () => { activeMenu?.close?.(); activeMenu = null }
const openMenu = (menu: any, e: MouseEvent) => { closeMenu(); activeMenu = menu; menu.open({ x: e.clientX, y: e.clientY }) }
const saveUiSetting = (key: string, value: any, delay = 180) => {
  const prev = settingTimers.get(key)
  if (prev) clearTimeout(prev)
  settingTimers.set(key, window.setTimeout(() => {
    settingTimers.delete(key)
    void bookshelfManager.saveSetting(key, value)
  }, delay))
}

const folderGroups = computed(() => groups.value.filter(g => g.type === 'folder'))
const importFolderGroups = computed(() => filterGroupsByKeyword(groups.value, importGroupKeyword.value))
const currentGroupIsSmart = computed(() => !!groups.value.find(g => g.id === currentGroup.value && g.type === 'smart'))
const gridStyle = computed(() => viewMode.value === 'grid' ? { gridTemplateColumns: `repeat(auto-fill,minmax(${props.coverSize || 120}px,1fr))` } : {})
const viewModeIcon = computed(() => VIEW_MODE_ICONS[viewMode.value])
const toolbarStartActions = computed(() => currentGroup.value ? [{ id: 'back', icon: '#iconBack', label: '返回' }] : [])
const toolbarActions = computed(() => [{ id: 'view', icon: viewModeIcon.value, label: '切换视图' }, { id: 'select', icon: selecting.value ? '#iconCheck' : '#iconUncheck', label: selecting.value ? '退出选择' : '选择书籍' }, { id: 'organize', icon: '#lucide-sliders-horizontal', label: '整理书架' }, { id: 'manage', icon: '#lucide-book-plus', label: '添加内容' }])
const modalTitle = computed(() => modalMode.value ? MODAL_TITLES[modalMode.value] : '书架')
const panelCover = computed(() => panelBook.value ? getCoverUrl(panelBook.value) : '')
const viewProps = computed(() => ({ items: displayItems.value, mode: viewMode.value, gridStyle: gridStyle.value, groupCounts: groupCounts.value, statusMap: STATUS_MAP, getCoverUrl, getGroupCoverUrls, getProgress, currentGroup: currentGroup.value, currentGroupIsSmart: currentGroupIsSmart.value, selecting: selecting.value, selectedUrls: selectedBookUrls.value, hiddenItems: props.hiddenItems || [], dragEnabled }))

const getSortKey = (item: any, type: string) => item.type === 'group'
  ? (type === 'name' ? item.data.name : type === 'time' ? (item.data as any).created || 0 : item.data.order)
  : type === 'name' ? item.data.title : type === 'author' ? item.data.author || '' : type === 'progress' ? item.data.progress || 0 : type === 'rating' ? item.data.rating || 0 : type === 'readTime' ? item.data.time || 0 : type === 'update' ? item.data.read || 0 : item.data.added
const groupedBook = (book: Book) => groups.value.some(g => g.type === 'folder' && bookInGroup(book, g))
const matchBook = (book: Book, kw = keyword.value.toLowerCase()) => !kw || book.title.toLowerCase().includes(kw) || book.author?.toLowerCase().includes(kw) || book.tags.some(t => t.toLowerCase().includes(kw))

const displayItems = computed(() => {
  const kw = keyword.value.toLowerCase()
  if (currentGroup.value) return books.value.filter(b => matchBook(b, kw)).map(b => ({ type: 'book', data: b }))
  const rootBooks = (kw || viewMode.value === 'compact' ? books.value : books.value.filter(b => !groupedBook(b)))
  const items = [
    ...(keyword.value ? groups.value.filter(g => g.name.toLowerCase().includes(kw)) : groups.value).map(g => ({ type: 'group', data: g })),
    ...rootBooks.filter(b => matchBook(b, kw)).map(b => ({ type: 'book', data: b })),
  ]
  return items.sort((a, b) => {
    const ka = getSortKey(a, sortType.value)
    const kb = getSortKey(b, sortType.value)
    return (sortReverse.value ? -1 : 1) * (typeof ka === 'string' ? ka.localeCompare(kb as string) : (ka as number) - (kb as number))
  })
})
const displayBooks = computed(() => displayItems.value.filter(i => i.type === 'book').map(i => i.data))
const selectedCount = computed(() => selectedBookUrls.value.length)
const filterSections = computed(() => buildFilterSections(stats.value, allTags.value))
const importDisplayItems = computed(() => importItems.value.map(item => ({ type: 'import' as const, data: item })))
const cloudDisplayItems = computed(() => cloudNodesToItems(cloudResults.value))
const batchRatingOptions = computed(() => [...RATING_OPTIONS, [0, '清除评分']] as Array<[number, string]>)
const parseList = (value: string) => Array.from(new Set(value.split(/[,，\n]/).map(t => t.trim()).filter(Boolean)))
const importTagList = computed(() => parseList(importBulkTags.value))
const batchTagList = computed(() => parseList(batchTags.value))
const showImportItems = computed(() => !editingGroup.value && importHasItems.value)
const optionChip = (key: string, label: string, active: boolean, click: () => void) => ({ key, label, active, click })
const importApplyRows = computed(() => [
  { key: 'groups', label: '导入到分组', items: importFolderGroups.value.map(g => optionChip(g.id, g.name, importBulkGroups.value.includes(g.id), () => toggleImportGroup(g.id))) },
  { key: 'status', label: '导入后状态', items: [optionChip('none', '不改状态', !importBulkStatus.value, () => importBulkStatus.value = ''), ...STATUS_OPTIONS.map(([v, label]) => optionChip(v, label, importBulkStatus.value === v, () => importBulkStatus.value = v))] },
  { key: 'rating', label: '导入后评分', items: [optionChip('0', '不评分', !importBulkRating.value, () => importBulkRating.value = 0), ...STAR_OPTIONS.map(v => optionChip(String(v), '★'.repeat(v), importBulkRating.value === v, () => importBulkRating.value = v))] },
].filter(row => row.items.length))
const actionLabels = { tags: [['add', '添加'], ['remove', '移除'], ['set', '替换']], groups: [['add', '加入'], ['remove', '移出'], ['set', '设为']] } as const
const batchRows = computed(() => {
  const modeButton = (value: typeof batchMode.value, label: string) => ({ key: `m-${value}`, label, active: batchMode.value === value, disabled: !selectedCount.value, click: () => batchMode.value = batchMode.value === value ? null : value })
  const chip = (key: string, label: string, click: () => void, extra = {}) => ({ key, label, click, ...extra })
  const rows: any[] = [
    { key: 'main', items: [{ key: 'count', text: `选中 ${selectedCount.value}` }, chip('clear', '清空', clearSelection, { disabled: !selectedCount.value }), chip('all', '全选', selectDisplayedBooks), chip('invert', '反选', invertDisplayedBooks), chip('exit', '退出', exitSelection, { primary: true })] },
    { key: 'ops', items: [modeButton('rate', '评分'), modeButton('status', '状态'), modeButton('tags', '标签'), modeButton('groups', '分组'), chip('remove', '移除', confirmBatchRemove, { danger: true, disabled: !selectedCount.value })] },
  ]
  if (batchMode.value === 'rate') rows.push({ key: 'rate', items: batchRatingOptions.value.map(([v, label]) => chip(`r-${v}`, label, () => batchOp('rate', v))) })
  if (batchMode.value === 'status') rows.push({ key: 'status', items: STATUS_OPTIONS.map(([v, label]) => chip(`s-${v}`, label, () => batchOp('status', v))) })
  if (batchMode.value === 'tags') rows.push({ key: 'tags', items: [...actionLabels.tags.map(([v, label]) => chip(`ta-${v}`, label, () => batchTagAction.value = v, { active: batchTagAction.value === v })), { key: 'input', input: '标签，用逗号分隔' }, ...allTags.value.slice(0, 8).map(t => chip(`t-${t.tag}`, `#${t.tag}`, () => toggleBatchTag(t.tag), { active: batchTagList.value.includes(t.tag) })), chip('apply-tags', '应用', () => batchOp('tags')), chip('clear-tags', '清空标签', () => batchClearList('tags', `清空 ${batchScopeText()} 的标签`, '已清空标签'), { danger: true })] })
  if (batchMode.value === 'groups') rows.push({ key: 'groups', items: [...actionLabels.groups.map(([v, label]) => chip(`ga-${v}`, label, () => batchGroupAction.value = v, { active: batchGroupAction.value === v })), ...(folderGroups.value.length ? folderGroups.value.map(g => chip(`g-${g.id}`, g.name, () => toggleBatchGroup(g.id), { active: batchGroups.value.includes(g.id) })) : [{ key: 'empty', text: '暂无分组' }]), chip('apply-groups', '应用', () => batchOp('groups')), chip('clear-groups', '移出所有', () => batchClearList('groups', `将 ${batchScopeText()} 移出所有分组`, '已移出分组'), { danger: true })] })
  return rows
})
const filterMap = { status: filterStatus, rating: filterRating, format: filterFormats, tags: filterTags }
const setGroup = (id: string | null, close = false) => { closeMenu(); currentGroup.value = id; close && closePopups(); void loadBooks(id) }
const clearConfirmDelete = () => { confirmDelete.value = null }
const confirmGroupDelete = (group: GroupConfig) => { modalMode.value = 'manage'; confirmDelete.value = { type: 'group', id: group.id, item: group } }
const confirmBatchRemove = () => { if (selectedCount.value) confirmDelete.value = { type: 'batch', id: 'batch', count: selectedCount.value, urls: [...selectedBookUrls.value] } }
const setImportMode = (mode: ImportMode) => { editingGroup.value = null; resetImport(); importMode.value = mode }
const groupRowActions = (g: GroupConfig) => {
  const i = groups.value.findIndex(item => item.id === g.id)
  return [i > 0 && { label: '上移', icon: '#iconUp', click: () => moveGroup(g, -1 as const) }, i < groups.value.length - 1 && { label: '下移', icon: '#iconDown', click: () => moveGroup(g, 1 as const) }, { label: '打开分组', icon: '#iconFolder', click: () => setGroup(g.id, true) }, { label: '编辑分组', icon: '#iconEdit', click: () => startEditGroup(g) }, { label: '删除分组', icon: '#lucide-trash-2', warn: true, click: () => confirmGroupDelete(g) }].filter(Boolean) as any[]
}
const handleToolbarAction = (id: string) => {
  closeMenu()
  if (id === 'back') setGroup(null)
  else if (id === 'view') viewMode.value = getNextViewMode(viewMode.value)
  else if (id === 'select') toggleSelecting()
  else if (id === 'organize') modalMode.value = 'organize'
  else if (id === 'manage') { modalMode.value = 'manage'; setImportMode('link') }
}
const getCoverUrl = (book: Book) => bookshelfManager.getCoverUrl(book)
const getGroupCoverUrls = (group: GroupConfig) => books.value.filter(book => bookInGroup(book, group)).map(getCoverUrl).filter(Boolean).slice(0, 4)
const getProgress = (book: Book) => /^https?:\/\//i.test(book.path || '') && book.meta?.fileSize ? book.meta.fileSize : `${book.progress || 0}%`
const toggleArrayItem = (arr: any[], value: any) => { const i = arr.indexOf(value); i > -1 ? arr.splice(i, 1) : arr.push(value) }
const toggleFilterItem = (key: string, value: any) => key === 'rating' ? filterMap[key].value = value : toggleArrayItem(filterMap[key].value, value)
const isFilterActive = (key: string, value: any) => key === 'rating' ? filterMap[key].value === value : filterMap[key].value.includes(value)
const closePopups = () => { closeMenu(); modalMode.value = null; editingGroup.value = null; batchMode.value = null; clearConfirmDelete(); resetImport() }
const resetOrganize = () => { filterStatus.value = []; filterRating.value = 0; filterFormats.value = []; filterTags.value = []; sortType.value = 'time'; sortReverse.value = false; viewMode.value = 'grid'; batchMode.value = null }
const setSelectedUrls = (urls: string[]) => { selectedBookUrls.value = Array.from(new Set(urls)); if (confirmDelete.value?.type === 'batch') clearConfirmDelete() }
const clearSelection = () => { setSelectedUrls([]); batchMode.value = null }
const exitSelection = () => { selecting.value = false; clearSelection() }
const toggleSelecting = () => { selecting.value ? exitSelection() : (selecting.value = true) }
const toggleSelectBook = (book: Book) => {
  selecting.value = true
  const urls = [...selectedBookUrls.value]
  toggleArrayItem(urls, book.url)
  setSelectedUrls(urls)
}
const selectDisplayedBooks = () => {
  selecting.value = true
  setSelectedUrls([...selectedBookUrls.value, ...displayBooks.value.map(book => book.url)])
}
const invertDisplayedBooks = () => {
  selecting.value = true
  const visible = new Set(displayBooks.value.map(book => book.url))
  setSelectedUrls([...selectedBookUrls.value.filter(url => !visible.has(url)), ...displayBooks.value.filter(book => !selectedBookUrls.value.includes(book.url)).map(book => book.url)])
}
const syncSelection = () => {
  const existing = new Set(books.value.map(book => book.url))
  const next = selectedBookUrls.value.filter(url => existing.has(url))
  if (next.length !== selectedBookUrls.value.length) setSelectedUrls(next)
}
const refreshGroups = async () => { const { groups: nextGroups, counts } = await bookshelfManager.getGroupDisplayState(); groups.value = nextGroups; groupCounts.value = counts }
const loadBooks = async (group = currentGroup.value) => {
  const state = await bookshelfManager.getBookshelfState({ currentGroup: group, keyword: keyword.value, sortBy: sortType.value, reverse: sortReverse.value, status: filterStatus.value, rating: filterRating.value, formats: filterFormats.value, tags: filterTags.value })
  books.value = state.books
  stats.value = state.stats
  syncSelection()
}
const refresh = () => Promise.all([loadBooks(), refreshGroups()])
const reloadStorage = async (force = false) => {
  const now = Date.now()
  if (reloading || (!force && now - lastReloadAt < 3000)) return
  reloading = true
  try {
    await bookshelfManager.reload()
    lastReloadAt = now
    await Promise.all([loadBooks(), refreshGroups()])
    allTags.value = await bookshelfManager.getAllTags()
  }
  finally {
    reloading = false
  }
}
const showResult = (success: number, failed: number, ok: string, fail = `成功${success}本，失败${failed}本`, time = 2000) => showMessage(failed ? fail : ok, time, failed ? 'error' : 'info')
const ratingItems = (handler: (rating: number) => void | Promise<void>, clearLabel = '清除') => [1, 2, 3, 4, 5].map(value => ({ icon: 'iconStar', label: `${'★'.repeat(value)} ${value}星`, click: () => handler(value) })).concat([{ type: 'separator' }, { icon: 'iconClose', label: clearLabel, click: () => handler(0) }])
const statusItems = (handler: (status: BookStatus) => void | Promise<void>) => STATUS_OPTIONS.map(([k, v]) => ({ icon: MENU_ICONS.status[k], label: v, click: () => handler(k) }))
const assignEditForm = (book: Book) => { const b = book as any; Object.assign(editForm.value, { title: b.title, author: b.author, tags: b.tags.join(', '), rating: b.rating || 0, status: b.status, cover: b.cover || '', groups: b.groups || [], bindDocId: b.bindDocId || '', bindDocName: b.bindDocName || '' }) }
const setListText = (target: typeof importBulkTags | typeof batchTags, values: string[]) => { target.value = Array.from(new Set(values)).join(', ') }
const toggleTextList = (target: typeof importBulkTags | typeof batchTags, value: string) => { const values = parseList(target.value); toggleArrayItem(values, value); setListText(target, values) }
const toggleImportTag = (tag: string) => toggleTextList(importBulkTags, tag)
const toggleImportGroup = (gid: string) => toggleArrayItem(importBulkGroups.value, gid)
const toggleBatchTag = (tag: string) => toggleTextList(batchTags, tag)
const toggleBatchGroup = (gid: string) => toggleArrayItem(batchGroups.value, gid)
const buildImportPatch = (): BookBulkPatch => ({ ...(importTagList.value.length ? { tags: { add: importTagList.value } } : {}), ...(importBulkStatus.value ? { status: importBulkStatus.value } : {}), ...(importBulkRating.value ? { rating: importBulkRating.value } : {}), ...(importBulkGroups.value.length ? { groups: { add: importBulkGroups.value } } : {}) })
const buildBatchListPatch = (kind: 'tags' | 'groups', values?: string[]): BookBulkPatch => ({ [kind]: { [kind === 'tags' ? batchTagAction.value : batchGroupAction.value]: values ?? (kind === 'tags' ? batchTagList.value : batchGroups.value) } })
const batchScopeText = () => `已选 ${selectedCount.value} 本`
const confirmDeleteText = computed(() => confirmDelete.value?.type === 'batch'
  ? confirmDelete.value?.phase === 'delete' ? `确认彻底删除 ${confirmDelete.value.count} 本？将删除标注数据` : `确认移除 ${confirmDelete.value.count} 本？将删除托管文件，保留阅读数据`
  : confirmDelete.value?.type === 'group'
    ? '确认删除该分组？'
    : confirmDelete.value?.phase === 'delete' ? '确认彻底删除？将删除标注数据' : '确认移除？将删除托管文件，保留阅读数据')

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
const moveGroup = async (group: GroupConfig, offset: -1 | 1) => { if (await bookshelfManager.moveGroup(group.id, offset)) { await refreshGroups(); showMessage(`已${offset < 0 ? '上移' : '下移'}：${group.name}`, 1200, 'info') } }
const deleteGroup = async (g: GroupConfig) => {
  await bookshelfManager.deleteGroup(g.id)
  if (currentGroup.value === g.id) currentGroup.value = null
  clearConfirmDelete()
  await refresh()
  showMessage(`已删除：${g.name}`, 2000, 'info')
}

const showGroupMenu = (group: GroupConfig, e: MouseEvent) => {
  e.preventDefault(); const m = new Menu()
  ;[
    { icon: 'iconFolder', label: '打开分组', click: () => setGroup(group.id) },
    { icon: 'iconEdit', label: '重命名', click: () => startEditGroup(group) },
    { type: 'separator' },
    { icon: 'iconTrashcan', label: '删除', click: () => { closeMenu(); confirmGroupDelete(group) } },
  ].forEach(item => m.addItem(item))
  openMenu(m, e)
}

const updateBookField = async (book: Book, field: string, value: any, msg: string) => {
  closeMenu()
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
  closeMenu(); const full = await bookshelfManager.getBook(book.url)
  if (!full) return showMessage('加载失败', 3000, 'error')
  if (isMobile()) window.dispatchEvent(new CustomEvent('reader:mobile-open', { detail: { book: full } }))
  else emit('read', full)
}
const removeBook = async (book: Book, deleteData = false) => {
  const res = await bookshelfManager.removeBook(book.url, deleteData).then(ok => ({ success: ok ? 1 : 0, failed: ok ? 0 : 1 }))
  clearConfirmDelete()
  await refresh()
  showResult(res.success, res.failed, deleteData ? '已彻底删除' : '已移除并删除托管文件', '删除失败')
}
const removeBatchBooks = async (deleteData = false) => {
  if (confirmDelete.value?.type !== 'batch') return
  const res = await bookshelfManager.removeBooks(confirmDelete.value.urls, deleteData)
  clearConfirmDelete()
  await refresh()
  showResult(res.success, res.failed, deleteData ? `已彻底删除 ${res.success} 本` : `已移除并删除托管文件 ${res.success} 本`)
  if (!res.failed) exitSelection()
}
const confirmDeleteAction = async (deleteData = false) => {
  const target = confirmDelete.value
  if (!target) return
  if (target.type === 'book') return removeBook(target.item, deleteData)
  if (target.type === 'group') return deleteGroup(target.item)
  return removeBatchBooks(deleteData)
}
const openLocalImport = async () => { setImportMode('file'); await pickAndParseFiles() }
const parseImportUrls = async () => { try { await parseDraftUrls() } catch (e) { showMessage(e instanceof Error ? e.message : '解析失败', 2000, 'error') } }
const runCloud = async (fallback: string, fn: () => Promise<void>) => {
  cloudLoading.value = true; cloudError.value = ''
  try { await fn() } catch (e) { cloudError.value = e instanceof Error ? e.message : fallback } finally { cloudLoading.value = false }
}
const listCloud = (path = '/') => runCloud('浏览失败', async () => { cloudResults.value = mergeCloudNodes(cloudResults.value, await listCloudNodes(path), path) })
const searchCloud = () => runCloud('搜索失败', async () => {
  cloudResults.value = mergeCloudNodes([], await searchCloudNodes(cloudKeyword.value))
  cloudError.value = cloudResults.value.length ? '' : '未找到电子书'
})
const openCloudInput = async () => {
  const path = normalizeCloudPath(cloudInput.value)
  try {
    if (isCloudBookPath(path)) return await parseCloudImports([path])
    if (path !== '/') await listCloud('/')
    await listCloud(path)
  } catch (e) { cloudError.value = e instanceof Error ? e.message : '打开失败' }
}
const toggleCloudPath = (path: string) => toggleArrayItem(cloudSelectedPaths.value, path)
const cloudUrls = (paths: string[]) => Array.from(new Set(paths.map(siyuanCloudUrl))).join('\n')
const collectCloudBooks = async (path: string): Promise<string[]> => {
  const parent = normalizeCloudPath(path), children = (await listCloudNodes(parent)).map((node: any) => ({ path: normalizeCloudPath(node.path || `${parent}/${node.name}`), is_dir: !!(node.is_dir ?? node.isDir) })).filter(node => node.is_dir || isCloudBookPath(node.path))
  return [...children.filter(node => !node.is_dir).map(node => node.path), ...(await Promise.all(children.filter(node => node.is_dir).map(node => collectCloudBooks(node.path)))).flat()]
}
const rememberCloudGroup = async (groupPath: string, paths: string[]) => {
  const gid = `cloud:${normalizeCloudPath(groupPath)}`
  await bookshelfManager.upsertGroup({ id: gid, name: groupPath === '/' ? '思盘' : groupPath.split('/').pop() || '思盘分组', order: groups.value.length, type: 'folder' })
  cloudImportGroups.value = { ...cloudImportGroups.value, ...Object.fromEntries(paths.map(path => [siyuanCloudUrl(path), [gid]])) }
}
const parseCloudImports = async (paths: string[]) => { const draft = importDraft.value; await parseDraftUrls(cloudUrls(paths)); importDraft.value = draft }
const parseSelectedCloud = () => runCloud('导入失败', async () => {
  const files = cloudSelectedPaths.value.filter(isCloudBookPath)
  const folders = await Promise.all(cloudSelectedPaths.value.filter(path => !isCloudBookPath(path)).map(async path => [path, await collectCloudBooks(path)] as const))
  await Promise.all(folders.map(([path, paths]) => rememberCloudGroup(path, paths)))
  files.push(...folders.flatMap(([, paths]) => paths))
  if (!files.length) { cloudError.value = '未找到电子书'; return }
  await parseCloudImports(files)
  await refreshGroups()
})
const confirmImport = async (mode: 'file' | 'link') => {
  const patch = buildImportPatch()
  const res = await importSelected(mode, hasBookBulkPatch(patch) ? patch : undefined)
  await Promise.all(res.urls.filter(url => cloudImportGroups.value[url]?.length).map(url => bookshelfManager.applyBookPatch(url, { groups: { add: cloudImportGroups.value[url] } }, false)))
  cloudImportGroups.value = {}
  await loadBooks()
  await refreshGroups()
  allTags.value = await bookshelfManager.getAllTags()
  showResult(res.success, res.failed, `导入${res.success}本`, `成功${res.success}本，失败${res.failed}本`, 3000)
  if (!res.failed) closePopups()
}
const toggleImportItem = (item: { selected: boolean; error: string; loading: boolean }) => { if (!item.error && !item.loading) item.selected = !item.selected }
const openBookPanel = async (mode: 'detail' | 'edit', book: Book) => { closeMenu(); panelBook.value = await bookshelfManager.getBook(book.url) || book; if (mode === 'edit') { if (!can.value('book-edit')) return showUpgrade('书籍编辑'); editingBook.value = panelBook.value.url; resetEditForm(); assignEditForm(panelBook.value) } modalMode.value = mode }
const importBookAnnotations = async (book: Book) => {
  if (String(book.format || '').toLowerCase() !== 'pdf') return showMessage('批注导入暂仅支持 PDF', 2000, 'error')
  try {
    const result = await importPdfAnnotationsForBook(book.url)
    if (result.canceled) return
    await refresh()
    showMessage(result.imported ? `已导入 ${result.imported} 条批注，跳过 ${result.skipped} 条` : '未识别到可导入批注', 3000, result.imported ? 'info' : 'error')
  } catch (e) {
    showMessage(e instanceof Error ? e.message : '批注导入失败', 3000, 'error')
  }
}
const showContextMenu = (book: Book, e: MouseEvent) => {
  e.preventDefault(); const hasBinding = !!(book as any).bindDocId
  const ratingMenu = ratingItems(rating => updateBookField(book, 'rating', rating, rating ? `已评 ${rating} 星` : '已清除评分'))
  const moveGroups = filterGroupsByKeyword(groups.value, moveGroupKeyword.value)
  const searchMoveGroups = { icon: 'iconSearch', label: moveGroupKeyword.value ? `搜索分组（${moveGroupKeyword.value}）` : '搜索分组...', click: () => {
    const value = window.prompt('搜索分组', moveGroupKeyword.value)
    if (value === null) return
    moveGroupKeyword.value = value.trim()
    closeMenu()
    showContextMenu(book, e)
  } }
  const clearMoveGroups = moveGroupKeyword.value ? { icon: 'iconClose', label: '清除分组搜索', click: () => { moveGroupKeyword.value = ''; closeMenu(); showContextMenu(book, e) } } : null
  const groupMenu = [searchMoveGroups, ...(clearMoveGroups ? [clearMoveGroups] : []), ...(book.groups.length ? [{ icon: 'iconFiles', label: '首页', click: () => updateBookField(book, 'group', 'home', '已移动到首页') }, ...(moveGroups.length ? [{ type: 'separator' }] : [])] : []), ...moveGroups.map(g => ({ icon: 'iconFolder', label: g.name, click: () => updateBookField(book, 'group', g.id, `已移动到：${g.name}`) }))]
  const m = new Menu()
  ;[{ icon: 'iconPlay', label: '打开阅读', click: () => readBook(book) }, { icon: 'iconInfo', label: '详细信息', click: () => openBookPanel('detail', book) }, { icon: 'iconCheck', label: selectedBookUrls.value.includes(book.url) ? '取消选择' : '选择此书', click: () => toggleSelectBook(book) }, { icon: 'iconStar', label: '评分', type: 'submenu', submenu: ratingMenu }, { icon: 'iconCheck', label: '标记状态', type: 'submenu', submenu: statusItems(status => updateBookField(book, 'status', status, `已标记为${STATUS_MAP[status]}`)) }, { icon: 'iconFolder', label: '移动到', type: 'submenu', submenu: groupMenu }, { icon: hasBinding ? 'iconLinkOff' : 'iconLink', label: hasBinding ? '解除绑定' : '绑定文档', click: () => openBookPanel('edit', book) }, { icon: 'iconDownload', label: '导入批注', click: () => importBookAnnotations(book) }, { type: 'separator' }, { icon: 'iconEdit', label: '编辑信息', click: () => openBookPanel('edit', book) }, { icon: 'iconTrashcan', label: '移除', click: () => { closeMenu(); confirmDelete.value = { type: 'book', id: book.url, item: book } } }].forEach(item => m.addItem(item as any))
  openMenu(m, e)
}

const batchOp = async (op: 'rate' | 'status' | 'remove' | 'tags' | 'groups', value?: number | BookStatus) => {
  if (!can.value('batch-operation')) return showUpgrade('批量操作')
  const urls = selectedBookUrls.value
  if (!urls.length) return
  const done = async (res: any, action: string) => { batchMode.value = null; await refresh(); allTags.value = await bookshelfManager.getAllTags(); showResult(res.success, res.failed, `${action} ${res.success} 本`); if (!res.failed) exitSelection() }
  if (op === 'remove') return confirmBatchRemove()
  if (op === 'rate') return done(await bookshelfManager.batchUpdateRating(urls, Number(value || 0)), value ? '已评分' : '已清除')
  if (op === 'status') return done(await bookshelfManager.batchUpdateStatus(urls, value as BookStatus), '已更新')
  if (op === 'tags') {
    if (!batchTagList.value.length) return showMessage('请输入标签', 2000, 'error')
    return done(await bookshelfManager.batchUpdateBooks(urls, buildBatchListPatch('tags')), '已更新标签')
  }
  if (!batchGroups.value.length) return showMessage('请选择分组', 2000, 'error')
  return done(await bookshelfManager.batchUpdateBooks(urls, buildBatchListPatch('groups')), '已更新分组')
}
const batchClearList = async (kind: 'tags' | 'groups', text: string, ok: string) => {
  if (!selectedCount.value || !confirm(`确定${text}？`)) return
  const res = await bookshelfManager.batchUpdateBooks(selectedBookUrls.value, { [kind]: { set: [] } })
  batchMode.value = null
  await refresh()
  if (kind === 'tags') allTags.value = await bookshelfManager.getAllTags()
  showResult(res.success, res.failed, `${ok} ${res.success} 本`)
  if (!res.failed) exitSelection()
}
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
const toggleTag = (tag: string) => { const tags = parseList(editForm.value.tags); toggleArrayItem(tags, tag); editForm.value.tags = tags.join(', ') }
const toggleGroup = (gid: string) => toggleArrayItem(editForm.value.groups, gid)
const getDocId = (d: any) => d.id || d.blockID || d.rootID || d.path?.split('/').pop()?.replace('.sy', '') || ''
const searchBindDoc = async () => { const q = bindSearch.value.trim(); bindResults.value = q ? await searchDocs(q).catch(() => []) : [] }
const selectBindDoc = (d: any) => { const id = getDocId(d); if (!id) return showMessage('文档 ID 无效', 2000, 'error'); Object.assign(editForm.value, { bindDocId: id, bindDocName: d.hPath || d.content || d.name || '无标题' }); bindSearch.value = ''; bindResults.value = [] }
const unbindDoc = () => { editForm.value.bindDocId = ''; editForm.value.bindDocName = '' }
const detailFields = computed(() => !panelBook.value || modalMode.value !== 'detail' ? [] : buildDetailFields(panelBook.value, groups.value))

const handleBookshelfUpdated = () => { void reloadStorage() }
const handleStorageChanged = () => { void reloadStorage(true) }
const handleVisibilityChange = () => { if (!document.hidden) void reloadStorage() }
onMounted(async () => {
  await bookshelfManager.reload()
  lastReloadAt = Date.now()
  await loadBooks()
  void (async () => {
    const [nextSort, nextReverse, nextView] = await Promise.all([
      bookshelfManager.getSetting('bookshelf_sortType', 'time'),
      bookshelfManager.getSetting('bookshelf_sortReverse', false),
      bookshelfManager.getSetting('bookshelf_viewMode', 'grid'),
    ])
    sortType.value = nextSort
    sortReverse.value = nextReverse
    viewMode.value = nextView
    await nextTick()
    settingsLoaded = true
  })()
  void refreshGroups()
  void bookshelfManager.getAllTags().then(tags => { allTags.value = tags })
  window.addEventListener('sireader:bookshelf-updated', handleBookshelfUpdated)
  window.addEventListener('sireader:storage-changed', handleStorageChanged)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})
onUnmounted(() => { closeMenu(); window.removeEventListener('sireader:bookshelf-updated', handleBookshelfUpdated); window.removeEventListener('sireader:storage-changed', handleStorageChanged); document.removeEventListener('visibilitychange', handleVisibilityChange); settingTimers.forEach(timer => clearTimeout(timer)); settingTimers.clear() })
watch([filterStatus, filterRating, filterFormats, filterTags, sortType, sortReverse], () => loadBooks(), { deep: true })
watch(sortType, v => settingsLoaded && saveUiSetting('bookshelf_sortType', v))
watch(sortReverse, v => settingsLoaded && saveUiSetting('bookshelf_sortReverse', v))
watch(viewMode, v => settingsLoaded && saveUiSetting('bookshelf_viewMode', v))
</script>

<style scoped lang="scss">
.sr-bookshelf{--sr-gap:6px;position:relative;display:flex;flex-direction:column;height:100%;overflow:hidden}
:deep(.sr-books){overflow:hidden}
.sr-input,.sr-select{width:100%;min-width:0;box-sizing:border-box}
.sr-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100%;font-size:14px;opacity:.5}
.sr-empty-hint,.sr-muted,.sr-entry-meta{font-size:12px;color:var(--b3-theme-on-surface-variant)}
.sr-selection-bar{position:absolute;right:12px;bottom:12px;z-index:18;display:flex;flex-direction:column;gap:6px;width:min(360px,calc(100% - 24px));max-height:min(48vh,220px);overflow:auto;padding:6px;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-surface);box-sizing:border-box}
.sr-selection-detail{display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0}
.sr-selection-count{flex:1 1 auto;min-width:50px;font-size:12px;font-weight:600;color:var(--b3-theme-on-surface)}
.sr-confirm-bar{z-index:30;gap:8px;max-height:none;overflow:visible;padding:8px 10px;border-color:color-mix(in srgb,var(--b3-theme-error) 24%,var(--b3-border-color));background:color-mix(in srgb,var(--b3-theme-surface) 94%,var(--b3-theme-error));box-shadow:0 8px 24px #0002}
.sr-confirm-bar .b3-button{white-space:nowrap}.sr-confirm-bar--above-selection{bottom:76px}
.sr-selection-input{flex:1 1 116px;min-width:96px;height:26px;font-size:12px}
.sr-manage-panel{position:absolute;top:44px;left:8px;right:8px;z-index:20;max-height:calc(100% - 56px);overflow:auto;padding:12px;box-sizing:border-box;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:10px;box-shadow:0 8px 24px #0002}
.sr-modal__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--b3-border-color);font-size:13px;font-weight:600}
.sr-modal__body{display:flex;flex-direction:column;gap:12px;padding-top:12px;box-sizing:border-box}
.sr-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sr-textarea{min-height:84px;resize:vertical;box-sizing:border-box}
.sr-import-card{gap:8px;max-height:min(44vh,360px);overflow:auto}.sr-import-card--sm{max-height:min(32vh,260px)}
.sr-cloud-results,.sr-import-list{max-height:min(32vh,260px);overflow:auto;min-height:120px}
.sr-entry-meta{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-form-item{display:flex;flex-direction:column;gap:4px;padding:0 0 12px;border-bottom:1px solid var(--b3-border-color);font-size:12px}.sr-form-item:last-child{border-bottom:none}
.sr-chips{display:flex;flex-wrap:wrap;gap:calc(var(--sr-gap) / 2)}
.sr-chip{display:inline-flex;align-items:center;justify-content:center;padding:3px 8px;border:1px solid var(--b3-border-color);border-radius:999px;background:var(--b3-theme-background);color:var(--b3-theme-on-surface);font-size:11px;font-weight:600;line-height:1.2;white-space:nowrap}button.sr-chip{cursor:pointer}button.sr-chip:hover{background:var(--b3-list-hover)}.sr-chip.is-active{border-color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary)}.sr-chip.is-primary{border-color:var(--b3-theme-primary);background:var(--b3-theme-primary);color:#fff}.sr-chip.is-danger{background:var(--b3-theme-error);border-color:var(--b3-theme-error);color:#fff}
.sr-select{min-height:32px;font-size:inherit;border-radius:8px}
.sr-row{display:flex;gap:var(--sr-gap);flex-wrap:wrap;align-items:center}
.sr-actions-end{justify-content:flex-end}.sr-grow{flex:1;min-width:0}.sr-inline{display:flex;align-items:center;gap:4px;flex:0 0 auto;flex-wrap:nowrap}.sr-group-item{display:flex;align-items:center;gap:8px;margin-top:8px}
.sr-group-label{display:flex;align-items:center;justify-content:flex-start;gap:4px;min-width:0;min-height:32px;padding:0 12px;font-size:12px}
.sr-group-label strong,.sr-group-label .sr-entry-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-section-line{padding-top:12px;border-top:1px solid var(--b3-border-color)}
.sr-editor{display:flex;flex-direction:column;margin-top:12px;padding:12px;background:var(--b3-theme-background);border:1px solid var(--b3-border-color);border-radius:10px}
.sr-editor-head{padding:0 0 12px;border-bottom:1px solid var(--b3-border-color);font-size:13px;font-weight:600}
.sr-editor .sr-form-item{padding:0;border-bottom:none}.sr-editor .sr-form-item + .sr-form-item{margin-top:10px}.sr-editor-actions{margin-top:12px;padding-top:0}
.sr-panel-cover{width:124px;height:176px;margin:0 auto 4px;overflow:hidden;border-radius:var(--b3-border-radius);background:var(--b3-theme-surface)}.sr-panel-cover img{width:100%;height:100%;object-fit:cover}
.mono{font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}
.fade-enter-active,.fade-leave-active{transition:opacity .18s ease}.fade-enter-from,.fade-leave-to{opacity:0}
</style>
