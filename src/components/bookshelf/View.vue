<template>
  <div v-if="mode === 'compact'" class="fn__flex-1 fn__flex-column file-tree sy__file bs-view bs-tree-view" :class="{ 'bs-tree-view--dense': dense }" @dragover="handleRootDragOver" @drop="handleRootDrop">
    <div class="fn__flex-1 fn__hidescrollbar" @mouseover="onCompactHover">
      <ul v-for="root in compactTree" :key="root.key" class="b3-list b3-list--background">
        <li
          class="b3-list-item b3-list-item--hide-action"
          data-type="navigation-root"
          :data-path="compactPath(root)"
          data-playlist-item
          :class="{ dragover: isGroupDropTarget(root), 'b3-list-item--focus': isSelected(root.item) }"
          :style="compactItemStyle(root)"
          :draggable="canDragBook(dragEnabled, root.item.type)"
          @click="handleCompactClick(root, $event)"
          @contextmenu.prevent.stop="handleCompactContextMenu(root, $event)"
          @dragstart="root.kind === 'book' && isBook(root.item) ? handleBookDragStart(root.item.data, $event) : undefined"
          @dragend="handleBookDragEnd"
          @dragover="handleGroupDragOver(root, $event)"
          @dragleave="handleGroupDragLeave(root)"
          @drop="handleGroupDrop(root, $event)"
        >
          <span v-if="isSelectable(root.item)" class="b3-list-item__toggle b3-list-item__toggle--hl" :style="compactToggleStyle(root)" @click.stop="toggleSelected(root.item)">
            <svg class="b3-list-item__arrow"><use :xlink:href="isSelected(root.item) ? '#iconCheck' : '#iconUncheck'" /></svg>
          </span>
          <span v-else class="b3-list-item__toggle b3-list-item__toggle--hl" :style="compactToggleStyle(root)">
            <svg v-if="root.kind === 'group'" class="b3-list-item__arrow" :class="{ 'b3-list-item__arrow--open': isCompactExpanded(root.item.data.id) }"><use xlink:href="#iconRight" /></svg>
            <svg v-else class="b3-list-item__arrow bs-tree-leaf-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /></svg>
          </span>
          <span class="b3-list-item__text ariaLabel" data-position="parentE" :aria-label="mainText(root.item)" data-playlist-item>{{ mainText(root.item) }}</span>
          <span v-if="compactStatusLabel(root.item)" class="bs-status-dot b3-tooltips b3-tooltips__w" :class="compactStatusClass(root.item)" :aria-label="compactStatusLabel(root.item)" data-playlist-item></span>
          <span v-if="compactMeta(root.item)" class="b3-list-item__meta" :class="{ 'bs-compact-progress': isBook(root.item) }" data-playlist-item>{{ compactMeta(root.item) }}</span>
        </li>
        <ul v-if="root.children.length" class="b3-list b3-list--background bs-tree-children">
          <li
            v-for="child in root.children"
            :key="child.key"
            class="b3-list-item b3-list-item--hide-action"
            data-type="navigation-file"
            :data-path="compactPath(child)"
            data-playlist-item
            :class="{ dragover: isGroupDropTarget(child), 'b3-list-item--focus': isSelected(child.item) }"
            :style="compactItemStyle(child)"
            :draggable="canDragBook(dragEnabled, child.item.type)"
            @click="handleCompactClick(child, $event)"
            @contextmenu.prevent.stop="handleCompactContextMenu(child, $event)"
            @dragstart="child.kind === 'book' && isBook(child.item) ? handleBookDragStart(child.item.data, $event) : undefined"
            @dragend="handleBookDragEnd"
            @dragover="handleGroupDragOver(child, $event)"
            @dragleave="handleGroupDragLeave(child)"
            @drop="handleGroupDrop(child, $event)"
          >
            <span v-if="isSelectable(child.item)" class="b3-list-item__toggle b3-list-item__toggle--hl" :style="compactToggleStyle(child)" @click.stop="toggleSelected(child.item)">
              <svg class="b3-list-item__arrow"><use :xlink:href="isSelected(child.item) ? '#iconCheck' : '#iconUncheck'" /></svg>
            </span>
            <span v-else class="b3-list-item__toggle b3-list-item__toggle--hl" :style="compactToggleStyle(child)">
              <svg v-if="child.kind === 'group'" class="b3-list-item__arrow" :class="{ 'b3-list-item__arrow--open': isCompactExpanded(child.item.data.id) }"><use xlink:href="#iconRight" /></svg>
              <svg v-else class="b3-list-item__arrow bs-tree-leaf-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /></svg>
            </span>
            <span class="b3-list-item__text ariaLabel" data-position="parentE" :aria-label="mainText(child.item)" data-playlist-item>{{ mainText(child.item) }}</span>
            <span v-if="compactStatusLabel(child.item)" class="bs-status-dot b3-tooltips b3-tooltips__w" :class="compactStatusClass(child.item)" :aria-label="compactStatusLabel(child.item)" data-playlist-item></span>
            <span v-if="compactMeta(child.item)" class="b3-list-item__meta" :class="{ 'bs-compact-progress': isBook(child.item) }" data-playlist-item>{{ compactMeta(child.item) }}</span>
          </li>
        </ul>
      </ul>
    </div>
  </div>

  <div v-else-if="mode === 'grid'" class="bs-view bs-grid" :style="gridStyle" @dragover="handleRootDragOver" @drop="handleRootDrop">
      <div class="bs-home-drop" :class="{ 'is-visible': showHomeDrop, 'is-drop-target': dragHomeActive }" @dragover="handleHomeDragOver" @dragleave="handleHomeDragLeave" @drop="handleHomeDrop">
        {{ HOME_DROP_LABEL }}
      </div>
      <div
        v-for="item in items"
        :key="itemKey(item)"
        class="bs-grid-item"
        :class="{ 'is-selected': isSelectableBook(item) && isBookSelected(item.data) }"
        :draggable="canDragBook(dragEnabled, item.type)"
        @click="handleClick(item, $event)"
        @contextmenu.prevent="handleContextMenu(item, $event)"
        @dragstart="handleItemDragStart(item, $event)"
        @dragend="handleBookDragEnd"
        @dragover="handleGroupDragOver(item, $event)"
        @dragleave="handleGroupDragLeave(item)"
        @drop="handleGroupDrop(item, $event)"
      >
      <div class="bs-cover" :class="{ 'is-drop-target': isGroupDropTarget(item) }">
        <template v-if="groupCoverUrls(item).length">
          <div class="bs-group-cover">
            <img v-for="(src, index) in groupCoverUrls(item)" :key="`${item.data.id}-${index}`" :src="src" :alt="mainText(item)" loading="lazy" decoding="async">
          </div>
        </template>
        <img v-else :src="coverSrc(item)" :alt="mainText(item)" loading="lazy" decoding="async">
        <template v-if="isBook(item)">
          <span v-if="item.data.rating && !hidden('rating')" class="bs-badge bs-badge--left">{{ starText(item.data.rating) }}</span>
          <span class="bs-badge bs-badge--right">{{ item.data.format.toUpperCase() }}</span>
          <span v-if="!hidden('progress')" class="bs-badge bs-badge--bottom">{{ getProgress(item.data) }}</span>
          <span v-if="!hidden('status')" class="bs-watermark" :class="watermarkClass(item.data.status)">{{ statusMap[item.data.status] }}</span>
        </template>
        <template v-else>
          <div v-if="item.data.type === 'smart'" class="bs-tags">
            <span v-for="text in groupChips(item.data)" :key="text" class="bs-tag bs-tag--type">{{ text }}</span>
          </div>
          <span class="bs-badge bs-badge--bottom">{{ countText(groupCount(item.data)) }}</span>
          <span class="bs-watermark bs-watermark--group">分组</span>
        </template>
      </div>
      <div class="bs-title ariaLabel" :aria-label="mainText(item)">{{ mainText(item) }}</div>
      </div>
  </div>

  <div v-else class="b3-list b3-list--background bs-view bs-list" @dragover="handleRootDragOver" @drop="handleRootDrop">
      <div class="bs-home-drop" :class="{ 'is-visible': showHomeDrop, 'is-drop-target': dragHomeActive }" @dragover="handleHomeDragOver" @dragleave="handleHomeDragLeave" @drop="handleHomeDrop">
        {{ HOME_DROP_LABEL }}
      </div>
      <div
        v-for="item in items"
        :key="itemKey(item)"
        class="b3-list-item b3-list-item--hide-action bs-row"
        :class="{ 'is-drop-target': isGroupDropTarget(item), 'is-selected': isSelectableBook(item) && isBookSelected(item.data) }"
        :draggable="canDragBook(dragEnabled, item.type)"
        @click="handleClick(item, $event)"
        @contextmenu.prevent="handleContextMenu(item, $event)"
        @dragstart="handleItemDragStart(item, $event)"
        @dragend="handleBookDragEnd"
        @dragover="handleGroupDragOver(item, $event)"
        @dragleave="handleGroupDragLeave(item)"
        @drop="handleGroupDrop(item, $event)"
      >
      <div class="bs-row__cover">
        <template v-if="groupCoverUrls(item).length">
          <div class="bs-group-cover">
            <img v-for="(src, index) in groupCoverUrls(item)" :key="`${item.data.id}-${index}`" :src="src" :alt="mainText(item)" loading="lazy" decoding="async">
          </div>
        </template>
        <img v-else :src="coverSrc(item)" :alt="mainText(item)" loading="lazy" decoding="async">
        <span
          v-if="isImport(item)"
          class="block__icon block__icon--show bs-import-check"
          :class="{ 'block__icon--active': item.data.selected }"
          @click.stop="emit('toggle-import', item.data)"
        >
          <svg><use :xlink:href="item.data.selected ? '#iconCheck' : '#iconUncheck'" /></svg>
        </span>
      </div>

      <div class="b3-list-item__text bs-row__main">
        <div class="bs-row__head">
          <div class="bs-row__title ariaLabel" :aria-label="mainText(item)">{{ mainText(item) }}</div>
          <div v-if="isBook(item) && !hidden('progress')" class="bs-row__progress">{{ getProgress(item.data) }}</div>
        </div>

        <div class="bs-row__author ariaLabel" :aria-label="authorText(item)">{{ authorText(item) }}</div>

        <div v-if="isBook(item)" class="bs-tags" :class="{ 'is-stacked': bookTags(item.data).length > 1 }">
          <span class="bs-tag bs-tag--type">{{ item.data.format.toUpperCase() }}</span>
          <span v-if="!hidden('status')" class="bs-tag bs-tag--state" :class="`bs-tag--${item.data.status}`">{{ statusMap[item.data.status] }}</span>
          <span v-if="item.data.rating && !hidden('rating')" class="bs-tag bs-tag--state">{{ starText(item.data.rating) }}</span>
          <span v-for="tag in bookTags(item.data)" :key="tag" class="bs-tag" :style="tagStyle(tag)">{{ tag }}</span>
        </div>
        <div v-else-if="isGroup(item) && item.data.type === 'smart'" class="bs-tags">
          <span v-for="text in groupChips(item.data)" :key="text" class="bs-tag bs-tag--type">{{ text }}</span>
        </div>

        <div v-if="isBook(item)" class="bs-row__meta">
          <span v-if="annotationText(item.data)" class="ariaLabel" :aria-label="annotationText(item.data)">{{ annotationText(item.data) }}</span>
          <span v-if="annotationText(item.data) && chapterText(item.data)">·</span>
          <span v-if="chapterText(item.data)" class="ariaLabel" :aria-label="chapterText(item.data)">{{ chapterText(item.data) }}</span>
          <span v-if="!hidden('lastRead') && (annotationText(item.data) || chapterText(item.data)) && lastReadText(item.data.read)">·</span>
          <span v-if="!hidden('lastRead') && lastReadText(item.data.read)" class="ariaLabel" :aria-label="lastReadText(item.data.read)">{{ lastReadText(item.data.read) }}</span>
        </div>

        <div v-if="isImport(item) && item.data.error" class="ft__error">{{ item.data.error }}</div>
      </div>

      <div v-if="!isBook(item)" class="bs-row__side">
        <span v-for="text in sideTexts(item)" :key="text" class="ft__secondary">{{ text }}</span>
      </div>

      </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BookImportItem } from '@/composables/useBookImport'
import { bookInGroup, canDragBook, type Book, type BookStatus, type BookshelfViewMode, type GroupConfig } from '@/core/bookshelf'

type GroupItem = { type: 'group'; data: GroupConfig }
type BookItem = { type: 'book'; data: Book }
type ImportItem = { type: 'import'; data: BookImportItem }
type Item = GroupItem | BookItem | ImportItem
type CompactRow = { key: string; item: Item; level: number; kind: 'group' | 'book' | 'import' }
type CompactNode = CompactRow & { children: CompactRow[] }
const HOME_DROP_LABEL = '移出分组'

const props = withDefaults(defineProps<{
  items: Item[]
  mode: BookshelfViewMode
  gridStyle?: Record<string, string>
  groupCounts?: Record<string, number>
  statusMap: Record<BookStatus, string>
  getCoverUrl: (book: Book) => string
  getGroupCoverUrls: (group: GroupConfig) => string[]
  getProgress: (book: Book) => string
  currentGroup?: string | null
  currentGroupIsSmart?: boolean
  selecting?: boolean
  selectedUrls?: string[]
  selectGroups?: boolean
  dense?: boolean
  showGroupMeta?: boolean
  hiddenItems?: string[]
  dragEnabled?: boolean
}>(), { gridStyle: () => ({}), groupCounts: () => ({}), currentGroup: null, currentGroupIsSmart: false, dense: false, showGroupMeta: true, dragEnabled: true })

const emit = defineEmits<{
  'select-group': [id: string]
  'book-click': [book: Book, event: MouseEvent]
  'book-menu': [book: Book, event: MouseEvent]
  'group-menu': [group: GroupConfig, event: MouseEvent]
  'toggle-import': [item: BookImportItem]
  'move-book-group': [url: string, groupId: string]
  'move-book-home': [url: string]
  'toggle-select-book': [book: Book]
}>()

const isBook = (item: Item): item is BookItem => item.type === 'book'
const isGroup = (item: Item): item is GroupItem => item.type === 'group'
const isImport = (item: Item): item is ImportItem => item.type === 'import'
const isSelectableBook = (item: Item): item is BookItem => !!props.selecting && isBook(item)
const isSelectable = (item: Item) => isSelectableBook(item) || (props.selectGroups && isGroup(item))
const hidden = (key: string) => props.hiddenItems?.includes(key)
const isBookSelected = (book: Book) => props.selectedUrls?.includes(book.url)
const isSelected = (item: Item) => isBook(item) ? isBookSelected(item.data) : isGroup(item) && props.selectedUrls?.includes(item.data.id)
const toggleSelected = (item: Item) => emit('toggle-select-book', (isBook(item) ? item.data : { url: item.data.id }) as Book)
const groupCount = (group: GroupConfig) => props.groupCounts[group.id] || 0
const itemKey = (item: Item) => isGroup(item) ? `group-${item.data.id}` : isBook(item) ? `book-${item.data.url}` : `import-${item.data.id}`
const compactExpanded = ref<Record<string, boolean>>({})
const draggedBookUrl = ref('')
const draggedBookGroups = ref<string[]>([])
const dragTargetGroupId = ref('')
const dragHomeActive = ref(false)

const booksForGroup = (group: GroupConfig, books: Book[]) => books.filter(book => bookInGroup(book, group))
const groupedBook = (book: Book, groups: GroupItem[]) => groups.some(g => g.data.type === 'folder' && bookInGroup(book, g.data))

const compactTree = computed<CompactNode[]>(() => {
  const groups = props.items.filter(isGroup)
  const books = props.items.filter(isBook).map(item => item.data)
  const childGroups = (parentId = '') => groups.filter(g => (g.data.parentId || '') === parentId)
  const rows = (group: GroupItem, level: number): CompactRow[] => {
    const self = { key: itemKey(group), item: group, level, kind: 'group' as const }
    return compactExpanded.value[group.data.id]
      ? [
          self,
          ...childGroups(group.data.id).flatMap(g => rows(g, level + 1)),
          ...booksForGroup(group.data, books).map(book => ({ key: `child-${group.data.id}-${book.url}`, item: { type: 'book' as const, data: book }, level: level + 1, kind: 'book' as const })),
        ]
      : [self]
  }
  const node = (group: GroupItem): CompactNode => ({
    key: itemKey(group),
    item: group,
    level: 0,
    kind: 'group',
    children: compactExpanded.value[group.data.id] ? rows(group, 0).slice(1) : [],
  })
  const roots: CompactNode[] = childGroups().map(node)
  for (const book of books) {
    if (!groupedBook(book, groups)) {
      roots.push({
        key: `root-${book.url}`,
        item: { type: 'book', data: book },
        level: 0,
        kind: 'book',
        children: [],
      })
    }
  }
  for (const item of props.items.filter(isImport)) {
    roots.push({
      key: itemKey(item),
      item,
      level: 0,
      kind: 'import',
      children: [],
    })
  }
  return roots
})

const isCompactExpanded = (id: string) => !!compactExpanded.value[id]
const toggleCompactGroup = (id: string) => { compactExpanded.value = { ...compactExpanded.value, [id]: !compactExpanded.value[id] } }
const getRowItem = (row: CompactRow | Item) => 'item' in row ? row.item : row
const isFolderGroup = (item: Item) => isGroup(item) && item.data.type === 'folder'
const getDropGroupId = (row: CompactRow | Item) => {
  const item = getRowItem(row)
  return isFolderGroup(item) ? item.data.id : ''
}
const isGroupDropTarget = (row: CompactRow | Item) => {
  const groupId = getDropGroupId(row)
  return !!groupId && dragTargetGroupId.value === groupId
}
const canDropToGroup = (groupId: string) => !draggedBookGroups.value.includes(groupId)
const showHomeDrop = computed(() => props.dragEnabled && !props.currentGroupIsSmart && !!draggedBookUrl.value && !!draggedBookGroups.value.length)
const resetDragState = () => {
  draggedBookUrl.value = ''
  draggedBookGroups.value = []
  dragTargetGroupId.value = ''
  dragHomeActive.value = false
}
const handleItemDragStart = (item: Item, event: DragEvent) => isBook(item) && handleBookDragStart(item.data, event)
const handleBookDragStart = (book: Book, event: DragEvent) => {
  if (!props.dragEnabled) return event.preventDefault()
  draggedBookUrl.value = book.url
  draggedBookGroups.value = [...book.groups]
  event.dataTransfer?.setData('text/plain', book.url)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
const handleBookDragEnd = () => { resetDragState() }
const dragBookUrl = (event?: DragEvent) => props.dragEnabled ? draggedBookUrl.value || event?.dataTransfer?.getData('text/plain') || '' : ''
const handleGroupDragOver = (row: CompactRow | Item, event: DragEvent) => {
  if (!props.dragEnabled) return
  const groupId = getDropGroupId(row)
  if (!groupId || !canDropToGroup(groupId)) return
  event.preventDefault()
  event.stopPropagation()
  event.dataTransfer && (event.dataTransfer.dropEffect = 'move')
  dragHomeActive.value = false
  dragTargetGroupId.value = groupId
}
const handleGroupDragLeave = (row: CompactRow | Item) => {
  const groupId = getDropGroupId(row)
  if (groupId && dragTargetGroupId.value === groupId) dragTargetGroupId.value = ''
}
const handleGroupDrop = (row: CompactRow | Item, event: DragEvent) => {
  if (!props.dragEnabled) return
  const groupId = getDropGroupId(row)
  const url = dragBookUrl(event)
  if (!groupId) return
  event.preventDefault()
  event.stopPropagation()
  resetDragState()
  if (!url || !canDropToGroup(groupId)) return
  emit('move-book-group', url, groupId)
}
const handleRootDragOver = (event: DragEvent) => {
  if (!dragBookUrl(event) || !props.currentGroup || props.currentGroupIsSmart) return
  event.preventDefault()
  dragTargetGroupId.value = ''
  event.dataTransfer && (event.dataTransfer.dropEffect = 'move')
}
const handleRootDrop = (event: DragEvent) => {
  const url = dragBookUrl(event)
  if (!url || !props.currentGroup || props.currentGroupIsSmart) return
  event.preventDefault()
  resetDragState()
  emit('move-book-home', url)
}
const handleHomeDragOver = (event: DragEvent) => {
  if (!showHomeDrop.value || !dragBookUrl(event)) return
  event.preventDefault()
  event.stopPropagation()
  event.dataTransfer && (event.dataTransfer.dropEffect = 'move')
  dragTargetGroupId.value = ''
  dragHomeActive.value = true
}
const handleHomeDragLeave = () => { dragHomeActive.value = false }
const handleHomeDrop = (event: DragEvent) => {
  const url = dragBookUrl(event)
  if (!showHomeDrop.value || !url) return
  event.preventDefault()
  event.stopPropagation()
  resetDragState()
  emit('move-book-home', url)
}

const handleClick = (item: Item, event: MouseEvent) => {
  if (isGroup(item)) emit('select-group', item.data.id)
  else if (isBook(item)) props.selecting ? emit('toggle-select-book', item.data) : emit('book-click', item.data, event)
}

const handleCompactClick = (row: CompactRow, event: MouseEvent) => {
  if (row.kind === 'group' && isGroup(row.item)) {
    const opening = !isCompactExpanded(row.item.data.id)
    if (opening && row.item.data.id.startsWith('/')) emit('select-group', row.item.data.id)
    return toggleCompactGroup(row.item.data.id)
  }
  handleClick(row.item, event)
}

const handleContextMenu = (item: Item, event: MouseEvent) => {
  if (isGroup(item)) emit('group-menu', item.data, event)
  else if (isBook(item)) emit('book-menu', item.data, event)
}

const handleCompactContextMenu = (row: CompactRow, event: MouseEvent) => handleContextMenu(row.item, event)

const countText = (count: number) => `${count} 本`
const compactIndent = (row: CompactRow) => row.level * (props.dense ? 12 : 18)
const compactItemStyle = (row: CompactRow) => ({ '--file-toggle-width': `${compactIndent(row) + (props.dense ? 14 : 18)}px` })
const compactToggleStyle = (row: CompactRow) => ({ paddingLeft: `${compactIndent(row)}px` })
const compactPath = (row: CompactRow) => isGroup(row.item) ? row.item.data.id : isBook(row.item) ? row.item.data.url : row.item.data.id
const starText = (rating: number) => `★${Math.max(0, Math.min(5, rating))}`
const watermarkClass = (status: BookStatus) => `bs-watermark--${status}`
const mainText = (item: Item) => isGroup(item) ? item.data.name : isBook(item) ? item.data.title : item.data.preview?.title || item.data.label
const groupChips = (group: GroupConfig) => [
  ...(group.rules?.tags || []).slice(0, 2),
  ...((group.rules?.format || []).slice(0, 1).map(v => v.toUpperCase())),
  ...((group.rules?.status || []).slice(0, 1).map(v => props.statusMap[v])),
  ...(group.rules?.rating ? [`${group.rules.rating}星+`] : []),
].slice(0, 3)
const authorText = (item: Item) => isGroup(item) ? (item.data.type === 'smart' ? '智能分组' : '分组') : isBook(item) ? item.data.author || '未知作者' : item.data.preview?.author || '未知作者'
const onCompactHover = (event: MouseEvent) => (event.target as HTMLElement).hasAttribute('data-playlist-item') && event.stopPropagation()
const compactMeta = (item: Item) => isGroup(item) ? (props.showGroupMeta ? countText(groupCount(item.data)) : '') : isBook(item) ? (hidden('progress') ? '' : props.getProgress(item.data)) : importStateText(item.data)
const compactStatusLabel = (item: Item) => isBook(item) && !hidden('status') ? props.statusMap[item.data.status] : ''
const compactStatusClass = (item: Item) => isBook(item) ? `bs-status-dot--${item.data.status}` : ''
const sideTexts = (item: Item) => isGroup(item) ? [countText(groupCount(item.data))] : isBook(item) ? [] : [importStateText(item.data)]
const groupCoverUrls = (item: Item) => isGroup(item) ? props.getGroupCoverUrls(item.data) : []
const bookTags = (book: Book) => book.tags.slice(0, 4)
const coverSrc = (item: Item) => (isBook(item) ? props.getCoverUrl(item.data) : isImport(item) ? item.data.preview?.cover || '' : '') || placeholderCover(item)
const placeholderCover = (item: Item) => {
  const kind = isGroup(item) ? 'group' : isBook(item) ? item.data.format : item.data.preview?.format || 'book'
  const themes = {
    group: ['#d6e6ff', '#8eb5f4', '#3f72c5'],
    pdf: ['#ffd6d6', '#f19999', '#bf4747'],
    epub: ['#d8ebff', '#8ec0f2', '#3d79b7'],
    mobi: ['#ffe0bc', '#efb26d', '#b97629'],
    azw3: ['#e1d7ff', '#ab97eb', '#6550b9'],
    txt: ['#dcefdc', '#91c391', '#4b8556'],
    book: ['#dfe6f0', '#9eb0c8', '#5e7088'],
  } as const
  const shapes = {
    group: (accent: string, ink: string) => `<path d="M28 64c0-4.4 3.6-8 8-8h16l8 10h24c4.4 0 8 3.6 8 8v34c0 4.4-3.6 8-8 8H36c-4.4 0-8-3.6-8-8V64z" fill="${accent}" fill-opacity=".28"/><path d="M28 72h25.5c2.3 0 4.5.9 6.1 2.5l2.4 2.5H92v31c0 4.4-3.6 8-8 8H36c-4.4 0-8-3.6-8-8V72z" fill="${accent}" fill-opacity=".42"/><rect x="38" y="84" width="28" height="6" rx="3" fill="${ink}" fill-opacity=".14"/><rect x="38" y="96" width="38" height="6" rx="3" fill="${ink}" fill-opacity=".1"/>`,
    pdf: (_: string, ink: string) => `<rect x="30" y="42" width="40" height="10" rx="5" fill="${ink}" fill-opacity=".16"/><rect x="30" y="58" width="50" height="10" rx="5" fill="${ink}" fill-opacity=".1"/><rect x="30" y="80" width="34" height="34" rx="8" fill="${ink}" fill-opacity=".08"/><text x="47" y="101" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" font-weight="700" fill="${ink}" fill-opacity=".7">PDF</text>`,
    book: (accent: string, _: string, rx = 20, irx = 8) => `<rect x="30" y="42" width="46" height="10" rx="5" fill="${accent}" fill-opacity=".28"/><rect x="30" y="58" width="54" height="10" rx="5" fill="${accent}" fill-opacity=".18"/><rect x="30" y="80" width="40" height="40" rx="${rx}" fill="${accent}" fill-opacity=".12"/><rect x="42" y="92" width="16" height="16" rx="${irx}" fill="${accent}" fill-opacity=".22"/>`,
  } as const
  const theme = themes[kind as keyof typeof themes] || themes.book
  const [bg, accent, ink] = theme
  const art = kind === 'group' ? shapes.group(accent, ink) : kind === 'pdf' ? shapes.pdf(accent, ink) : shapes.book(accent, ink, kind === 'txt' ? 6 : 20, kind === 'txt' ? 2 : 8)
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 180"><rect width="120" height="180" fill="${bg}"/><circle cx="94" cy="24" r="22" fill="${accent}" fill-opacity=".12"/><rect x="22" y="28" width="74" height="92" rx="16" fill="#fff" fill-opacity=".68"/>${art}<rect x="22" y="138" width="68" height="6" rx="3" fill="${ink}" fill-opacity=".34"/><rect x="22" y="150" width="52" height="6" rx="3" fill="${ink}" fill-opacity=".24"/><rect x="22" y="162" width="60" height="6" rx="3" fill="${ink}" fill-opacity=".18"/></svg>`)}` 
}
const importStateText = (item: BookImportItem) => item.error ? '失败' : item.loading ? (item.preview ? '导入中...' : '解析中...') : item.preview?.format?.toUpperCase?.() || '待导入'
const annotationText = (book: Book) => book.annotationCount ? `标注 ${book.annotationCount}` : ''
const chapterText = (book: Book) => book.total ? `章节 ${book.chapter || 0}/${book.total}` : book.chapter ? `章节 ${book.chapter}` : ''
const lastReadText = (ts: number) => ts ? `最近阅读 ${new Date(ts).toLocaleDateString('zh-CN')}` : ''
const tagStyle = (tag: string) => {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return {
    '--bs-tag-bg': `hsla(${hue}, 72%, 93%, .95)`,
    '--bs-tag-color': `hsl(${hue}, 38%, 32%)`,
    '--bs-tag-border': `hsla(${hue}, 32%, 55%, .24)`,
  }
}
</script>

<style scoped lang="scss">
.bs-view{min-height:0;height:100%;padding:0;box-sizing:border-box}
.bs-tree-view{padding-top:8px}
.bs-tree-view--dense{padding-top:2px}
.bs-tree-view .b3-list{padding:0;margin:0}
.bs-tree-view--dense .b3-list-item{padding-right:4px}
.bs-tree-children{padding:0;margin:0}
.bs-tree-leaf-mark{fill:currentColor;opacity:.7}
.bs-status-dot{flex:0 0 auto;width:7px;height:7px;margin:0 0 0 2px;border-radius:50%;box-shadow:0 0 0 1px color-mix(in srgb,currentColor 28%,transparent)}
.bs-status-dot--unread{background:#f59e0b;color:#f59e0b}
.bs-status-dot--reading{background:var(--b3-theme-primary);color:var(--b3-theme-primary)}
.bs-status-dot--finished{background:var(--b3-card-success-color,#2aa775);color:var(--b3-card-success-color,#2aa775)}
.bs-tree-view .bs-compact-progress{flex:0 0 4ch;width:4ch;margin-left:2px;overflow:hidden;text-align:right;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.bs-home-drop{display:none}
.bs-list :deep(.b3-list-item){margin:0}
.bs-grid{display:grid;gap:6px;overflow:auto;scrollbar-gutter:stable;align-content:start;padding:8px 0 8px 8px;box-sizing:border-box}
.bs-home-drop{grid-column:1/-1;align-items:center;justify-content:center;min-height:38px;padding:0 12px;border-radius:10px;background:color-mix(in srgb,var(--b3-theme-primary) 8%,transparent);color:var(--b3-theme-on-surface-variant);font-size:12px}
.bs-home-drop.is-visible{display:flex}
.bs-home-drop.is-drop-target{background:color-mix(in srgb,var(--b3-theme-primary) 18%,transparent);color:var(--b3-theme-primary)}
.bs-grid-item{position:relative;min-width:0;cursor:pointer;content-visibility:auto;contain-intrinsic-size:180px}
.bs-grid-item.is-selected .bs-cover,.bs-grid-item.is-selected:hover .bs-cover{box-shadow:inset 0 0 0 2px var(--b3-theme-primary)}
.bs-grid-item.is-selected .bs-cover::before,.bs-grid-item.is-selected:hover .bs-cover::before{content:'';position:absolute;inset:0;z-index:1;background:color-mix(in srgb,var(--b3-theme-primary) 38%,transparent);pointer-events:none}
.bs-row.is-selected,.bs-row.is-selected:hover{background:color-mix(in srgb,var(--b3-theme-primary) 20%,var(--b3-theme-background))!important;border-color:color-mix(in srgb,var(--b3-theme-primary) 55%,var(--b3-border-color))}
.bs-row.is-drop-target{background:color-mix(in srgb,var(--b3-theme-primary) 16%,transparent)}
.bs-cover.is-drop-target::after{content:'';position:absolute;inset:0;background:color-mix(in srgb,var(--b3-theme-primary) 18%,transparent);pointer-events:none}
.bs-cover,.bs-row__cover{position:relative;overflow:hidden;background:var(--b3-theme-surface-lighter);box-shadow:inset 0 0 0 1px var(--b3-border-color)}
.bs-cover{aspect-ratio:2/3;border-radius:6px}
.bs-cover img,.bs-row__cover img{display:block;width:100%;height:100%;object-fit:cover;background:inherit;animation:bs-cover-fade .18s ease}
.bs-group-cover{display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr);width:100%;height:100%;gap:1px;background:var(--b3-border-color);border-radius:inherit;overflow:hidden}
.bs-import-check{position:absolute;top:4px;left:4px;z-index:2}
.bs-title,.bs-row__title,.bs-row__author,.bs-row .ft__error{color:var(--b3-theme-on-surface);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bs-title{padding-top:3px;font-size:13px;line-height:1.4}
.bs-badge{position:absolute;z-index:1;padding:3px 6px;border-radius:999px;background:rgba(0,0,0,.62);font-size:10px;line-height:1;color:#fff}
.bs-badge--left{top:6px;left:6px}.bs-badge--right{top:6px;right:6px}.bs-badge--bottom{left:6px;bottom:6px}
.bs-cover .bs-tags{position:absolute;top:6px;left:6px;right:28px;z-index:1}
.bs-watermark{position:absolute;right:-.17em;bottom:-.13em;font-size:54px;font-weight:900;line-height:.82;letter-spacing:-.07em;pointer-events:none;opacity:.7;text-shadow:0 1px 0 rgba(255,255,255,.14)}
.bs-watermark--group{color:var(--b3-theme-on-background)}
.bs-watermark--unread{color:#f59e0b}
.bs-watermark--reading{color:var(--b3-theme-primary)}
.bs-watermark--finished{color:var(--b3-card-success-color,#2aa775)}
.bs-list{display:flex;flex-direction:column;gap:6px;overflow:auto;scrollbar-gutter:stable;padding:8px 0 8px 8px;box-sizing:border-box}
.bs-row{position:relative;display:flex;align-items:flex-start;gap:10px;min-height:102px;padding:0 12px 0 0;border:1px solid color-mix(in srgb,var(--b3-border-color) 92%, transparent);border-radius:8px;background:linear-gradient(180deg,color-mix(in srgb,var(--b3-theme-background) 96%, white),var(--b3-theme-background));box-sizing:border-box;overflow:hidden;content-visibility:auto;contain-intrinsic-size:104px}
.bs-row__cover{flex:0 0 auto;width:64px;height:96px;margin:2px;border-right:1px solid color-mix(in srgb,var(--b3-border-color) 88%, transparent);border-radius:8px}
.bs-row__main{display:flex;flex:1;flex-direction:column;justify-content:flex-start;gap:5px;min-width:0;padding:10px 0 9px}
.bs-row__head{display:flex;align-items:flex-start;gap:8px;min-width:0}
.bs-row__title{flex:1;min-width:0;font-size:13px;line-height:1.3;font-weight:600;letter-spacing:0}
.bs-row__progress{flex:0 0 auto;padding-top:1px;font-size:11px;line-height:1.2;color:var(--b3-theme-on-surface-variant);font-variant-numeric:tabular-nums}
.bs-row__author{font-size:11px;line-height:1.25;color:var(--b3-theme-on-surface-variant);min-height:14px}
.bs-tags{display:flex;flex-wrap:nowrap;gap:4px;min-height:16px;overflow:hidden}
.bs-tag{display:inline-flex;align-items:center;max-width:78px;padding:0 6px;height:16px;border-radius:5px;border:1px solid var(--bs-tag-border);background:var(--bs-tag-bg);color:var(--bs-tag-color);font-size:9px;font-weight:500;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box}
.bs-row .bs-tag{position:relative;max-width:78px;flex:0 0 auto}
.bs-row .bs-tags.is-stacked{gap:0}
.bs-row .bs-tags.is-stacked .bs-tag{margin-right:-10px;transition:margin-right .15s ease,max-width .15s ease;z-index:1}
.bs-row .bs-tags.is-stacked .bs-tag:hover{max-width:160px;margin-right:4px;overflow:visible;text-overflow:clip;z-index:2}
.bs-tag--type,.bs-tag--state{background:var(--b3-list-hover);border-color:color-mix(in srgb,var(--b3-border-color) 90%, transparent)}
.bs-tag--type{color:var(--b3-theme-on-surface-variant)}
.bs-tag--unread{color:var(--b3-card-warning-color);background:var(--b3-card-warning-background);border-color:color-mix(in srgb,var(--b3-card-warning-color) 24%,transparent)}
.bs-tag--reading{color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest);border-color:color-mix(in srgb,var(--b3-theme-primary) 24%,transparent)}
.bs-tag--finished{color:var(--b3-card-success-color,#2aa775);background:var(--b3-card-success-background, color-mix(in srgb,var(--b3-card-success-color,#2aa775) 14%, transparent));border-color:color-mix(in srgb,var(--b3-card-success-color,#2aa775) 24%,transparent)}
.bs-row__meta{display:flex;flex-wrap:nowrap;gap:4px;margin-top:auto;font-size:10px;line-height:1.2;color:var(--b3-theme-on-surface-variant);white-space:nowrap;overflow:hidden}
.bs-row__side{display:flex;flex:0 0 auto;flex-direction:column;align-items:flex-end;justify-content:center;gap:8px;padding:12px 0 12px 8px;margin-left:auto}
.bs-row__side .ft__secondary{max-width:100%;font-size:11px;line-height:1.2;text-align:right;color:var(--b3-theme-on-surface-variant)}
@keyframes bs-cover-fade{from{opacity:0}to{opacity:1}}
</style>
