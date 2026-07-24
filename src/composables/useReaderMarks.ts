import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { showMessage } from 'siyuan'
import { COLORS, STYLES, getColorMap, listAnnotations } from '@/core/MarkManager'
import { useReaderState } from '@/core/epub/state'
import { bookshelfManager } from '@/core/bookshelf'
import { pdfMarkFromAnnotation } from '@/utils/embedPdfActions'
import { copyMark as copyMarkUtil, hideFloat, openBlock, showFloat } from '@/utils/copy'
import { jump, markTarget } from '@/utils/jump'
import { collectMarkTagGroups, formatMarkTags, getMarkTags, parseMarkTags, toggleMarkTags } from '@/components/MarkCard.vue'

type MarkSort = 'time' | 'date' | 'chapter' | 'page' | 'name' | 'custom'
type MarkType = 'highlight' | 'note' | 'bookmark'
type MarkFilterKey = 'types' | 'colors' | 'textStyles' | 'tags' | 'note'
type MarkNoteFilter = 'all' | 'with-note'
type FilterState = { types: MarkType[]; colors: string[]; textStyles: string[]; tags: string[]; note: MarkNoteFilter; sort: MarkSort }

export const MARK_SORT_OPTIONS = [
  { value: 'time', label: '时间' },
  { value: 'date', label: '日期' },
  { value: 'chapter', label: '章节' },
  { value: 'page', label: '页码' },
  { value: 'name', label: '名称' },
  { value: 'custom', label: '自定义' },
] as const

const TYPE_OPTIONS = [
  { value: 'highlight', label: '文本标注' },
  { value: 'note', label: '笔记' },
  { value: 'bookmark', label: '书签' },
] as const

const NOTE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'with-note', label: '仅带笔记' },
] as const

const TEXT_STYLE_OPTIONS = STYLES.map(item => ({ value: item.type, label: item.name }))
const TYPE_CYCLE: Array<{ value: MarkType | null; label: string; icon: string }> = [
  { value: null, label: '全部标注', icon: '#lucide-square-pen' },
  { value: 'highlight', label: '文本标注', icon: '#lucide-map-pin-check' },
  { value: 'note', label: '笔记', icon: '#lucide-map-pin-pen' },
  { value: 'bookmark', label: '书签', icon: '#lucide-bookmark-check' },
]

const COLOR_BUCKETS = [
  { value: 'yellow', label: '黄色', aliases: ['yellow', '#ffeb3b', '#ffcd45'] },
  { value: 'red', label: '红色', aliases: ['red', '#ff0000'] },
  { value: 'green', label: '绿色', aliases: ['green', '#00aa00'] },
  { value: 'blue', label: '蓝色', aliases: ['blue', '#0066ff', '#00bcd4'] },
  { value: 'purple', label: '紫色', aliases: ['purple'] },
  { value: 'orange', label: '橙色', aliases: ['orange', '#ffb000'] },
  { value: 'pink', label: '粉色', aliases: ['pink', '#ff00ff'] },
] as const
const PDF_COLORS = ['#ef4444', '#ff8a00', '#ffcd45', '#63c96b', '#35c4c6', '#5b7cdb', '#c23cc9', '#8b2c24', '#000000', '#ffffff', 'transparent']
const PDF_STYLES = ['highlight', 'strikeout', 'underline', 'squiggly'] as const

const ORDER_MAX = Number.MAX_SAFE_INTEGER
const createFilter = (): FilterState => ({ types: [], colors: [], textStyles: [], tags: [], note: 'all', sort: 'time' })
const isTextMark = (item: any) => item?.type === 'highlight' || item?.type === 'note'
const getKey = (item: any) => item?.id || item?.groupId || item?.cfi || `${item?.type}-${item?.page || item?.section || 0}`
const getType = (item: any): MarkType => item?.type === 'note' ? 'note' : item?.type === 'bookmark' ? 'bookmark' : 'highlight'
const rawColor = (item: any) => item?.color || item?.paths?.find((path: any) => path?.color)?.color || ''
const colorBucket = (item: any) => COLOR_BUCKETS.find(bucket => bucket.aliases.includes(rawColor(item)))?.value || ''
const toggleArray = (list: string[], value: string) => list.includes(value) ? list.splice(list.indexOf(value), 1) : list.push(value)
export const useReaderMarks = (i18n?: any, context?: any) => {
  const globalReaderState = useReaderState()
  const getContext = () => typeof context === 'function' ? context() : context
  const activeReader = computed(() => getContext()?.activeReader || globalReaderState.activeReader.value)
  const activeView = computed(() => getContext()?.activeView || globalReaderState.activeView.value)
  const keyword = ref('')
  const showOrganize = ref(false)
  const markReverse = ref(false)
  const markFilter = ref<FilterState>(createFilter())
  const collapsed = ref<Record<string, true>>({})
  const dragState = ref({ from: '', over: '' })
  const refreshKey = ref(0)
  const editingId = ref('')
  const syncingAll = ref(false)
  const editText = ref('')
  const editNote = ref('')
  const editTags = ref('')
  const editColor = ref('yellow')
  const editStyle = ref('highlight')
  const colors = getColorMap()
  const libraryBooks = ref<any[]>([])
  const libraryMarks = ref<Record<string, any[]>>({})
  const loadingBooks = ref<Record<string, true>>({})
  let librarySearchTask: Promise<void> | null = null

  const marks = computed(() => activeReader.value?.marks || (activeView.value as any)?.marks)
  const isLibraryMode = computed(() => !marks.value)
  const isPdfMode = computed(() => !!(activeView.value as any)?.isPdf)
  const readOnly = computed(() => !!getContext()?.readOnlyMarks || isLibraryMode.value)
  const markSort = computed(() => markFilter.value.sort)
  const searchPlaceholder = '搜索标注、笔记、书签、墨迹、形状'
  const getEditColorOptions = () => isPdfMode.value && marks.value?.updateMark
    ? PDF_COLORS.map(color => ({ key: color, value: color, bg: color === 'transparent' ? 'linear-gradient(45deg,transparent 45%,#e44234 46%,#e44234 54%,transparent 55%)' : color }))
    : COLORS.map(color => ({ key: color.color, value: color.color, bg: color.bg }))
  const getEditStyleOptions = () => isPdfMode.value && marks.value?.updateMark
    ? PDF_STYLES.map(value => ({ value, label: i18n?.[value] || value }))
    : STYLES.map(item => ({ value: item.type, label: item.name }))

  const allEntries = computed(() => {
    refreshKey.value
    const source = marks.value
    if (!source) return Object.values(libraryMarks.value).flat()
    const annotations = source.getAnnotations?.() || []
    const bookmarks = source.getBookmarks?.() || []
    return [...bookmarks, ...annotations]
  })
  const mapStoredMark = (book: any, item: any, items: any[]) => {
    if (book.format === 'pdf') {
      const annotation = item?.annotation || item?.object || item
      return { ...pdfMarkFromAnnotation(annotation, items.map((x: any) => x?.annotation || x?.object || x)), bookUrl: book.url, bookTitle: book.title, color: annotation.color, style: annotation.type, timestamp: annotation.updated || annotation.created || Date.now() }
    }
    const data = item?.data || {}
    return { id: item.id, type: item.type, format: data.format || book.format, cfi: data.cfi || item.loc, section: data.section, page: data.page, text: item.text, note: item.note, tags: item.tags || [], color: item.color, style: data.style, timestamp: item.created, blockId: item.block, chapter: item.chapter, title: data.title, image: data.image, progress: data.progress, customOrder: data.customOrder, bookUrl: book.url, bookTitle: book.title }
  }
  const loadLibraryBooks = async () => {
    const books = await bookshelfManager.getBooks()
    libraryBooks.value = books
    collapsed.value = { ...collapsed.value, ...Object.fromEntries(books.map((book: any) => [book.url, true])) }
    if (hasLibraryScan.value) void loadAllBookMarks()
  }
  const loadBookMarks = async (book: any) => {
    if (!book?.url || libraryMarks.value[book.url] || loadingBooks.value[book.url]) return
    loadingBooks.value = { ...loadingBooks.value, [book.url]: true }
    try {
      const items = await listAnnotations(book.url)
      libraryMarks.value = { ...libraryMarks.value, [book.url]: items.map(item => mapStoredMark(book, item, items)) }
    } finally {
      const { [book.url]: _, ...rest } = loadingBooks.value
      loadingBooks.value = rest
    }
  }
  const loadAllBookMarks = () => librarySearchTask ||= (async () => {
    if (!hasLibraryScan.value) return
    for (const book of libraryBooks.value) await loadBookMarks(book)
  })().finally(() => { librarySearchTask = null })
  const scanLibrary = () => { if (isLibraryMode.value && hasLibraryScan.value) void loadAllBookMarks() }

  const searchText = (item: any) => [item?.title, item?.text, item?.note, ...getMarkTags(item), item?.chapter, item?.key, item?.page && `page ${item.page}`].filter(Boolean).join(' ').toLowerCase()
  const hasActiveFilters = computed(() => !!(markFilter.value.types.length || markFilter.value.colors.length || markFilter.value.textStyles.length || markFilter.value.tags.length || markFilter.value.note !== 'all' || markFilter.value.sort !== 'time' || markReverse.value))
  const hasLibraryContentFilter = computed(() => !!(keyword.value.trim() || markFilter.value.types.length || markFilter.value.colors.length || markFilter.value.textStyles.length || markFilter.value.tags.length || markFilter.value.note !== 'all'))
  const hasLibraryScan = computed(() => hasLibraryContentFilter.value || hasActiveFilters.value)
  const filterLabel = computed(() => hasActiveFilters.value ? '筛选中' : '筛选')
  const typeMode = computed(() => TYPE_CYCLE.find(item => item.value === (markFilter.value.types.length === 1 ? markFilter.value.types[0] : null)) || TYPE_CYCLE[0])
  const toolbarMenuAction = computed(() => ({ id: 'type', icon: typeMode.value.icon, label: typeMode.value.label, tooltipDir: 'sw', active: !!typeMode.value.value }))
  const markGroupKeys = computed(() => Array.isArray(list.value) ? list.value.filter((item: any) => item?.isGroup).map((item: any) => item.key) : [])
  const markAllExpanded = computed(() => !!markGroupKeys.value.length && !markGroupKeys.value.some(key => !!collapsed.value[key]))
  const pdfAnnotationsHidden = computed(() => !!(activeView.value as any)?.annotationsHidden)
  const toolbarActions = computed(() => [
    { id: 'togglePdfAnnotations', icon: pdfAnnotationsHidden.value ? '#lucide-eye-off' : '#lucide-eye', label: pdfAnnotationsHidden.value ? '显示 PDF 标注' : '隐藏 PDF 标注', active: pdfAnnotationsHidden.value, show: isPdfMode.value },
    { id: 'syncAll', icon: '#iconDownload', label: i18n?.syncAll || '同步全部', active: syncingAll.value, show: !readOnly.value && pendingImportCount.value > 0 },
    { id: 'organize', icon: '#lucide-sliders-horizontal', label: filterLabel.value, active: showOrganize.value || hasActiveFilters.value },
    { id: 'expand', icon: markAllExpanded.value ? '#lucide-panel-top-close' : '#lucide-panel-top-open', label: markAllExpanded.value ? '折叠分组' : '展开分组', show: isGroupedMode.value },
    { id: 'reverse', icon: markReverse.value ? '#lucide-arrow-up-1-0' : '#lucide-arrow-down-0-1', label: markReverse.value ? '倒序' : '正序', active: markReverse.value },
  ])

  const matchFilter = (item: any) => !(
    (markFilter.value.types.length && !markFilter.value.types.includes(getType(item))) ||
    (markFilter.value.colors.length && !markFilter.value.colors.includes(colorBucket(item))) ||
    (markFilter.value.textStyles.length && (!isTextMark(item) || !markFilter.value.textStyles.includes(item.style || 'highlight'))) ||
    (markFilter.value.tags.length && !markFilter.value.tags.some(tag => getMarkTags(item).includes(tag))) ||
    (markFilter.value.note === 'with-note' && !item.note?.trim())
  )

  const filtered = computed(() => allEntries.value.filter(matchFilter))
  const isCustomSort = computed(() => markSort.value === 'custom')
  const canDragMarks = computed(() => !readOnly.value && !isPdfMode.value && isCustomSort.value && !keyword.value)
  const isGroupedMode = computed(() => !['time', 'name', 'custom'].includes(markSort.value))
  const reverseList = <T,>(items: T[]) => markReverse.value ? [...items].reverse() : items
  const isPageSort = (sort: MarkSort) => sort === 'page' || (sort === 'chapter' && isPdfMode.value)
  const groupKey = (item: any, sort: MarkSort) => {
    if (sort === 'page' || (sort === 'chapter' && isPdfMode.value)) return item.page ? `第${item.page}页` : '未分页'
    if (sort === 'chapter') return item.chapter || '未分类'
    return new Date(item.timestamp || 0).toISOString().slice(0, 10)
  }
  const isItemPageSort = (sort: MarkSort, item: any) => sort === 'page' || (sort === 'chapter' && (isPdfMode.value || item.format === 'pdf'))
  const compareMarks = (a: any, b: any) => {
    if (isCustomSort.value) return (a.customOrder ?? ORDER_MAX) - (b.customOrder ?? ORDER_MAX) || (b.timestamp || 0) - (a.timestamp || 0)
    if (markSort.value === 'name') return mainText(a).localeCompare(mainText(b)) || (b.timestamp || 0) - (a.timestamp || 0)
    if (isItemPageSort(markSort.value, a) || isItemPageSort(markSort.value, b)) return (a.page || 0) - (b.page || 0) || (b.timestamp || 0) - (a.timestamp || 0)
    if (markSort.value === 'chapter') return (a.chapter || '').localeCompare(b.chapter || '') || (b.timestamp || 0) - (a.timestamp || 0)
    if (markSort.value === 'date') return groupKey(a, 'date').localeCompare(groupKey(b, 'date')) || (b.timestamp || 0) - (a.timestamp || 0)
    return (b.timestamp || 0) - (a.timestamp || 0) || (a.page || 0) - (b.page || 0)
  }
  const sortMarks = (items: any[]) => [...items].sort((a: any, b: any) => compareMarks(a, b) * (markReverse.value ? -1 : 1))

  const list = computed(() => {
    if (isLibraryMode.value) {
      const q = keyword.value.toLowerCase()
      const dir = markReverse.value ? -1 : 1
      const match = (item: any, book: any) => matchFilter(item) && (!q || searchText(item).includes(q) || `${book.title} ${book.author}`.toLowerCase().includes(q))
      return libraryBooks.value.map((book, index) => {
        const loaded = libraryMarks.value[book.url]
        const matched = (loaded || []).filter(item => match(item, book))
        const first = matched.reduce((best, item) => !best || compareMarks(item, best) * dir < 0 ? item : best, null)
        const items = (!isCollapsed(book.url) || keyword.value) ? sortMarks(matched) : []
        return { key: book.url, title: book.title || book.url, count: loadingBooks.value[book.url] ? '...' : loaded ? matched.length : '', items, first, isGroup: true, isBookGroup: true, book, loading: !!loadingBooks.value[book.url], index }
      }).filter(group => !hasLibraryContentFilter.value || group.loading || group.first || `${group.book.title} ${group.book.author}`.toLowerCase().includes(q))
        .sort((a, b) => markSort.value === 'name'
          ? `${a.book.title}`.localeCompare(`${b.book.title}`) * dir
          : a.first && b.first ? compareMarks(a.first, b.first) * dir : a.first ? -1 : b.first ? 1 : a.index - b.index)
    }
    let items = filtered.value.filter(item => !keyword.value || searchText(item).includes(keyword.value.toLowerCase()))
    if (markSort.value === 'time') return reverseList(items.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0) || (a.page || 0) - (b.page || 0)))
    if (isCustomSort.value) return reverseList(items.sort((a: any, b: any) => (a.customOrder ?? ORDER_MAX) - (b.customOrder ?? ORDER_MAX) || (b.timestamp || 0) - (a.timestamp || 0)))
    if (markSort.value === 'name') return sortMarks(items)
    items = [...items].sort((a: any, b: any) => {
      if (isPageSort(markSort.value)) return (a.page || 0) - (b.page || 0) || (b.timestamp || 0) - (a.timestamp || 0)
      const ak = groupKey(a, markSort.value)
      const bk = groupKey(b, markSort.value)
      return ak === bk ? (b.timestamp || 0) - (a.timestamp || 0) : ak.localeCompare(bk)
    })
    const groups = new Map<string, any>()
    items.forEach(item => {
      const key = groupKey(item, markSort.value)
      if (!groups.has(key)) groups.set(key, { key, items: [], isGroup: true })
      groups.get(key).items.push(item)
    })
    return reverseList([...groups.values()].map(group => ({ ...group, items: reverseList(group.items) })))
  })

  const markFilterSections = computed(() => {
    const source = allEntries.value
    const countBy = (matcher: (item: any) => boolean) => source.filter(matcher).length
    const tagCounts = new Map<string, number>()
    source.forEach(item => getMarkTags(item).forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)))
    return [
      { key: 'types', label: '类型', options: TYPE_OPTIONS.map(opt => ({ ...opt, count: countBy(item => getType(item) === opt.value) })) },
      { key: 'colors', label: '颜色', options: COLOR_BUCKETS.map(opt => ({ value: opt.value, label: opt.label, count: countBy(item => colorBucket(item) === opt.value) })).filter(opt => opt.count > 0) },
      { key: 'textStyles', label: '文本样式', options: TEXT_STYLE_OPTIONS.map(opt => ({ ...opt, count: countBy(item => isTextMark(item) && (item.style || 'highlight') === opt.value) })).filter(opt => opt.count > 0) },
      { key: 'tags', label: '标签', options: [...tagCounts.entries()].map(([value, count]) => ({ value, label: `#${value}`, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, 24) },
      { key: 'note', label: '附加条件', options: NOTE_OPTIONS.map(opt => ({ ...opt, count: opt.value === 'all' ? source.length : countBy(item => !!item.note?.trim()) })) },
    ] as Array<{ key: MarkFilterKey; label: string; options: Array<{ value: string; label: string; count: number }> }>
  })
  const markTagGroups = computed(() => collectMarkTagGroups(allEntries.value, editTagList.value))

  const emptyText = computed(() => isLibraryMode.value && !libraryBooks.value.length ? '暂无书籍' : keyword.value ? (i18n?.notFound || '未找到标注') : (i18n?.empty || '暂无标注'))
  const isCollapsed = (key: string) => !!collapsed.value[key]
  const getMarkItems = (item: any) => item?.isGroup ? (isCollapsed(item.key) && !keyword.value ? [] : item.items) : [item]
  const toggleGroup = (key: string) => {
    const item = list.value.find((row: any) => row.key === key)
    if (item?.isBookGroup) void loadBookMarks(item.book)
    return isCollapsed(key) ? (({ [key]: _, ...rest }) => { collapsed.value = rest })(collapsed.value) : collapsed.value = { ...collapsed.value, [key]: true }
  }
  const toggleGroups = () => collapsed.value = markAllExpanded.value ? Object.fromEntries(markGroupKeys.value.map(key => [key, true])) : {}

  const getDragKey = (item: any) => item.groupId || item.id || `${item.type}-${item.page || item.section || 0}`
  const saveCustomOrder = (item: any, base: number) => marks.value?.updateMark?.(item, { customOrder: base })
  const startMarkDrag = (event: DragEvent, item: any) => {
    dragState.value.from = getDragKey(item)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', dragState.value.from)
    }
  }
  const endMarkDrag = () => dragState.value = { from: '', over: '' }
  const dropMark = async (target: any) => {
    const sourceId = dragState.value.from
    const targetId = getDragKey(target)
    const items = [...list.value]
    const from = items.findIndex((item: any) => getDragKey(item) === sourceId)
    const to = items.findIndex((item: any) => getDragKey(item) === targetId)
    if (!canDragMarks.value || !sourceId || sourceId === targetId || from < 0 || to < 0) return endMarkDrag()
    const [moved] = items.splice(from, 1)
    items.splice(to, 0, moved)
    await Promise.all(items.map((item: any, index: number) => saveCustomOrder(item, index * 1000)))
    refreshKey.value++
    endMarkDrag()
  }

  const isEditing = (item: any) => editingId.value === getKey(item)
  const showEditOptions = (item: any) => (!isPdfMode.value || !!marks.value?.updateMark) && (item?.type === 'highlight' || item?.type === 'note' || !item?.type)
  const getBarColor = (item: any) => isEditing(item) ? (colors[editColor.value] || editColor.value) : (colors[item.color] || rawColor(item) || 'var(--b3-theme-primary)')
  const mainText = (item: any) => {
    return item.text || item.title || '无内容'
  }
  const canEdit = (item: any) => !readOnly.value && !item?.readOnly && !!marks.value?.updateMark
  const canDelete = (item: any) => !readOnly.value && !item?.readOnly && !!marks.value?.deleteMark
  const canImport = (_item: any) => !readOnly.value && !!marks.value?.updateMark
  const pendingImportMarks = computed(() => allEntries.value.filter(item => canImport(item) && !item.blockId))
  const pendingImportCount = computed(() => pendingImportMarks.value.length)
  const showMsg = (msg: string, type: 'info' | 'error' = 'info') => showMessage(msg, type === 'error' ? 3000 : 1500, type)

  const startEdit = (item: any) => {
    if (readOnly.value) return
    editingId.value = getKey(item)
    editText.value = item.text || item.title || ''
    editNote.value = item.note || ''
    editTags.value = formatMarkTags(item.tags)
    editColor.value = rawColor(item) || item.color || 'yellow'
    editStyle.value = item.style || 'highlight'
  }
  const cancelEdit = () => editingId.value = ''
  const editTagList = computed(() => parseMarkTags(editTags.value))
  const setEditTags = (tags: string[]) => editTags.value = formatMarkTags(tags)
  const toggleEditTags = (tags: string[]) => setEditTags(toggleMarkTags(editTagList.value, tags))
  const getUrl = () => getContext()?.bookUrl || (window as any).__currentBookUrl || ''

  const saveEdit = async (item: any) => {
    if (readOnly.value) return
    try {
      const updates: any = { color: editColor.value, note: editNote.value.trim() || undefined, tags: parseMarkTags(editTags.value) }
      updates.text = editText.value.trim()
      if (item.title != null) updates.title = updates.text
      updates.style = editStyle.value
      const { saveMarkEdit } = await import('@/utils/copy')
      await saveMarkEdit(item, updates, { marks: marks.value, bookUrl: getUrl(), isPdf: isPdfMode.value, reader: activeReader.value })
      Object.assign(item, updates)
      editingId.value = ''
      refreshKey.value++
      showMsg('已更新')
    } catch (error: any) {
      showMsg(error?.message || '保存失败', 'error')
    }
  }

  const getCopySettings = () => activeView.value?.isOnlineContext
    ? { ...(activeView.value?.settings || {}), noteInsertTarget: 'clipboard' }
    : activeView.value?.settings
  const copyMark = (item: any) => copyMarkUtil(item, { bookUrl: item.bookUrl || getUrl(), isPdf: item.format === 'pdf' || isPdfMode.value, reader: activeReader.value, settings: getCopySettings(), showMsg })
  const importMark = async (item: any) => {
    if (readOnly.value) return
    const { importMark: doImport } = await import('@/utils/copy')
    const url = getUrl()
    await doImport(item, { bookUrl: url, bookInfo: url ? await bookshelfManager.getBook(url) : null, isPdf: isPdfMode.value, reader: activeReader.value, showMsg, i18n, marks: marks.value })
    refreshKey.value++
  }
  const syncAllMarks = async () => {
    if (readOnly.value) return
    if (syncingAll.value) return
    const url = getUrl()
    if (!url) return
    const book = await bookshelfManager.getBook(url)
    const items = pendingImportMarks.value.slice()
    if (!items.length) return
    syncingAll.value = true
    try {
      const { importMark: doImport } = await import('@/utils/copy')
      let count = 0
      for (const item of items) {
        const blockId = await doImport(item, { bookUrl: url, bookInfo: book, isPdf: isPdfMode.value, reader: activeReader.value, showMsg: () => {}, i18n, marks: marks.value })
        if (blockId) count++
      }
      refreshKey.value++
      showMsg(count ? `${i18n?.syncAll || '同步全部'} ${count}/${items.length}` : (i18n?.importFailed || '导入失败'), count ? 'info' : 'error')
    } finally {
      syncingAll.value = false
    }
  }
  const deleteMark = async (item: any) => {
    if (readOnly.value) return
    if (!marks.value) return showMsg('标注系统未初始化', 'error')
    try {
      await marks.value.deleteMark(item)
      refreshKey.value++
      showMsg('已删除')
    } catch {
      showMsg('删除失败', 'error')
    }
  }

  const goTo = async (item: any) => {
    if (!isLibraryMode.value || !item.bookUrl) return jump(item, activeView.value, activeReader.value, marks.value)
    const book = await bookshelfManager.getBook(item.bookUrl)
    if (!book) return showMsg('书籍不存在', 'error')
    const [{ openOrActivateBook }, { settingsManager }, { usePlugin }] = await Promise.all([import('@/utils/bookOpen'), import('@/composables/useSetting'), import('@/main')])
    await openOrActivateBook(usePlugin(), book, await settingsManager.get(), () => window.dispatchEvent(new CustomEvent('sireader:goto', { detail: { cfi: markTarget(item), id: item.id, bookUrl: item.bookUrl } })))
  }
  const showMark = (item: any) => goTo(item)
  const onBlockEnter = (event: MouseEvent, id: string) => showFloat(id, event.target as HTMLElement)

  const refresh = () => refreshKey.value++
  const refreshLibrary = () => {
    if (!isLibraryMode.value) return refresh()
    libraryMarks.value = {}
    void loadLibraryBooks()
  }

  const isMarkFilterActive = (key: MarkFilterKey, value: string) => key === 'note' ? markFilter.value.note === value : markFilter.value[key].includes(value)
  const toggleMarkFilterItem = (key: MarkFilterKey, value: string) => key === 'note' ? markFilter.value.note = value as MarkNoteFilter : toggleArray(markFilter.value[key], value)
  const resetMarkOrganize = () => { markFilter.value = createFilter(); markReverse.value = false }
  const cycleTypeFilter = () => {
    const index = TYPE_CYCLE.findIndex(item => item.value === (markFilter.value.types.length === 1 ? markFilter.value.types[0] : null))
    const next = TYPE_CYCLE[(index + 1) % TYPE_CYCLE.length]
    markFilter.value.types = next.value ? [next.value] : []
  }
  const handleToolbarAction = (id: string) => {
    if (id === 'togglePdfAnnotations') (activeView.value as any)?.toggleAnnotationsHidden?.()
    else if (id === 'syncAll') void syncAllMarks()
    else if (id === 'organize') showOrganize.value = !showOrganize.value
    else if (id === 'type') cycleTypeFilter()
    else if (id === 'expand') toggleGroups()
    else if (id === 'reverse') markReverse.value = !markReverse.value
  }

  const loadState = async () => {
    if (isLibraryMode.value) return
    const book = await bookshelfManager.getBook(getUrl())
    const state = (book as any)?.markPanelState
    if (!book) return
    markFilter.value = { ...createFilter(), ...(state?.filter || { sort: (book as any)?.filterSort || 'time' }) }
    markReverse.value = !!state?.reverse
  }
  const saveState = async () => {
    if (isLibraryMode.value) return
    const url = getUrl()
    if (!url) return
    await bookshelfManager.updateBook(url, { markPanelState: { filter: markFilter.value, reverse: markReverse.value } })
  }

  watch(markReverse, () => { saveState(); scanLibrary() })
  watch(markFilter, () => { saveState(); scanLibrary() }, { deep: true })
  watch(keyword, scanLibrary)
  watch(isLibraryMode, value => value ? void loadLibraryBooks() : void loadState(), { immediate: true })
  onMounted(() => {
    window.addEventListener('sireader:marks-updated', refreshLibrary)
    window.addEventListener('sireader:bookshelf-updated', refreshLibrary)
    setTimeout(loadState, 120)
  })
  onUnmounted(() => {
    window.removeEventListener('sireader:marks-updated', refreshLibrary)
    window.removeEventListener('sireader:bookshelf-updated', refreshLibrary)
  })

  return {
    MARK_SORT_OPTIONS,
    keyword,
    searchPlaceholder,
    toolbarMenuAction,
    toolbarActions,
    handleToolbarAction,
    showOrganize,
    list,
    emptyText,
    toggleGroup,
    isCollapsed,
    getMarkItems,
    canDragMarks,
    dragState,
    getDragKey,
    startMarkDrag,
    dropMark,
    endMarkDrag,
    getBarColor,
    isEditing,
    editText,
    editNote,
    editTags,
    editTagList,
    startEdit,
    cancelEdit,
    showEditOptions,
    getEditColorOptions,
    getEditStyleOptions,
    editColor,
    editStyle,
    markTagGroups,
    toggleEditTags,
    isPdfMode,
    saveEdit,
    mainText,
    copyMark,
    canEdit,
    canDelete,
    openBlock,
    onBlockEnter,
    hideFloat,
    canImport,
    readOnly,
    importMark,
    deleteMark,
    markFilter,
    markReverse,
    markFilterSections,
    isMarkFilterActive,
    toggleMarkFilterItem,
    resetMarkOrganize,
    getMarkTags,
    goTo,
    showMark,
  }
}

export type { MarkFilterKey }
