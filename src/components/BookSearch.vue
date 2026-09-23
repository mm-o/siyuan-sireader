<template>
  <DockShell
    class="sr-search"
    body-class="sr-body-scroll"
    v-model:search-value="keyword"
    :search-placeholder="i18n.searchPlaceholder || TEXT.searchPlaceholder"
    :search-disabled="searching"
    :toolbar-menu-action="toolbarMenuAction"
    :toolbar-actions="toolbarActions"
    @click="closeOverlays"
    @search-enter="search"
    @toolbar-action="handleToolbarAction"
  >
    <template #toolbar-menu>
      <div v-if="showSourceMenu" class="sr-toolbar-popover" @click.stop>
        <div :class="['sr-toolbar-popover-item', { active: !selectedSource }]" @click="pickSource('')">{{ i18n.allSources || TEXT.allSources }}</div>
        <div v-for="src in visibleEnabledSources" :key="src.id" :class="['sr-toolbar-popover-item', { active: selectedSource === src.id }]" @click="pickSource(src.id)">{{ src.name }}</div>
      </div>
    </template>

      <div v-if="!searching && !results.length && keyword" class="sr-placeholder">{{ i18n.noResults || TEXT.noResults }}</div>
      <div v-else class="b3-list b3-list--background bs-view bs-list">
      <div v-for="book in results" :key="book.bookUrl || book.name" class="b3-list-item b3-list-item--hide-action bs-row" @click="showBook(book)">
        <div class="bs-row__cover">
          <img v-if="shouldShowCover(book)" :src="book.coverUrl" :alt="book.name" loading="lazy" decoding="async" @error="handleCoverError(book)">
          <img v-else :src="placeholderCover(book)" :alt="book.name" loading="lazy" decoding="async">
        </div>

        <div class="b3-list-item__text bs-row__main">
          <div class="bs-row__head">
            <div class="bs-row__title ariaLabel" :aria-label="book.name">{{ book.name }}</div>
            <div v-if="book.fileSize" class="bs-row__progress">{{ book.fileSize }}</div>
          </div>

          <div class="bs-row__author ariaLabel" :aria-label="book.author">{{ book.author || 'Unknown' }}</div>

          <div class="bs-tags" :class="{ 'is-stacked': searchTags(book).length > 1 }">
            <span v-for="tag in searchTags(book)" :key="tag.text" class="bs-tag" :class="tag.class" :style="tag.style">{{ tag.text }}</span>
          </div>

          <div class="bs-row__meta">
            <span v-if="book.publisher" class="ariaLabel" :aria-label="book.publisher">{{ book.publisher }}</span>
            <span v-if="book.publisher && book.pages">·</span>
            <span v-if="book.pages" class="ariaLabel" :aria-label="`${book.pages} 页`">{{ book.pages }} 页</span>
            <span v-if="(book.publisher || book.pages) && book.intro">·</span>
            <span v-if="book.intro" class="ariaLabel" :aria-label="book.intro">{{ book.intro }}</span>
          </div>
        </div>

      </div>
        <div v-if="searching" class="sr-status">{{ TEXT.searching }}</div>
      </div>

    <template #overlay>
    <Transition name="fade">
        <div v-if="showManagePanel" class="sr-manage-panel" @click.stop="handleManagePanelClick">
          <div class="sr-manage-head">
            <div>
              <div class="sr-manage-title">{{ TEXT.manageTitle }}</div>
              <small>{{ TEXT.manageDesc }}</small>
            </div>
            <button class="sr-btn-icon" @click="startAddCustom"><svg><use xlink:href="#lucide-book-plus"/></svg></button>
          </div>

          <div class="sr-manage-group">
            <div v-for="src in visibleSources" :key="src.id" class="sr-manage-item">
              <div class="sr-manage-info">
                <div>{{ src.name }}</div>
                <small>{{ sourceDesc(src) }}</small>
              </div>
              <div class="sr-manage-actions">
                <button v-if="isWebSource(src)" class="sr-text-btn" @click="openWebSource(src)">打开</button>
                <button class="sr-text-btn" @click="startEditSource(src)">{{ TEXT.edit }}</button>
                <button v-if="src.type === 'custom'" class="sr-text-btn danger" @click="removeCustomSource(src.id)">{{ TEXT.remove }}</button>
                <input type="checkbox" class="b3-switch" :checked="src.enabled" @change="toggleSource(src.id)">
              </div>
            </div>
          </div>

          <div v-if="editingSource" class="sr-manage-group sr-edit-group">
            <div class="sr-manage-subtitle">{{ form.id ? TEXT.editSource : TEXT.addSource }}</div>
            <div v-for="field in baseFields" :key="field.key" class="sr-field">
              <label>{{ field.label }}</label>
              <input v-model.trim="form[field.key]" class="b3-text-field" :placeholder="field.placeholder">
            </div>

            <template v-if="formNeedsDomains">
              <div class="sr-field"><label>{{ TEXT.domains }}</label><textarea v-model.trim="form.domainsText" class="b3-text-field" rows="3" :placeholder="TEXT.domainsPlaceholder"></textarea></div>
              <div class="sr-field"><label>{{ TEXT.currentDomain }}</label><input v-model.trim="form.currentDomain" class="b3-text-field"></div>
              <template v-if="formNeedsAuth">
                <div class="sr-field"><label>{{ TEXT.account }}</label><input v-model.trim="form.authEmail" class="b3-text-field" type="email" :placeholder="TEXT.accountPlaceholder"></div>
                <div class="sr-field"><label>{{ TEXT.password }}</label><input v-model="form.authPassword" class="b3-text-field" type="password" autocomplete="current-password" :placeholder="TEXT.passwordPlaceholder"></div>
              </template>
            </template>
            <template v-else-if="builtinTypeSet.has(form.type)">
              <div class="sr-field"><label>{{ TEXT.siteUrl }}</label><input v-model.trim="form.url" class="b3-text-field"></div>
            </template>
            <template v-else>
              <div v-for="field in customFields" :key="field.key" class="sr-field">
                <label>{{ field.label }}</label>
                <input v-model.trim="form[field.key]" class="b3-text-field" :placeholder="field.placeholder">
              </div>
              <div class="sr-grid-two">
                <div v-for="[key, , label, placeholder] in selectorFields" :key="key" class="sr-field">
                  <label>{{ label }}</label>
                  <input v-model.trim="form[key]" class="b3-text-field" :placeholder="placeholder">
                </div>
              </div>
            </template>

            <div class="sr-actions">
              <button class="sr-text-btn" @click="cancelEditSource">{{ TEXT.cancel }}</button>
              <button class="sr-btn-primary" @click="saveSource">{{ TEXT.save }}</button>
            </div>
          </div>
        </div>
    </Transition>

    <Transition name="fade">
        <div v-if="detailBook" class="sr-manage-panel sr-detail-panel" @click.stop>
          <header class="sr-modal__head">
            <span>{{ TEXT.detail }}</span>
            <span class="block__icon block__icon--show sr-icon-btn" aria-label="关闭" @click="detailBook = null">
              <svg><use xlink:href="#lucide-x" /></svg>
            </span>
          </header>
          <div class="sr-modal__body">
            <div class="sr-detail-summary">
              <img class="sr-panel-cover" :src="detailBook.coverUrl || '/icons/book-placeholder.svg'" @error="onDetailCoverError">
              <div class="sr-detail-main">
                <h2>{{ detailBook.name }}</h2>
                <p class="sr-meta">{{ detailBook.author }}</p>
                <div v-if="detailTags.length || detailBook.extension || detailBook.fileSize || detailBook.language || detailBook.year || detailBook.publisher || detailBook.pages || detailBook.identifier" class="sr-tags">
                  <span v-for="tag in detailTags" :key="tag">{{ tag }}</span>
                  <span v-if="detailBook.extension">{{ detailBook.extension }}</span>
                  <span v-if="detailBook.fileSize">{{ detailBook.fileSize }}</span>
                  <span v-if="detailBook.language">{{ detailBook.language }}</span>
                  <span v-if="detailBook.year">{{ detailBook.year }}</span>
                  <span v-if="detailBook.publisher">{{ detailBook.publisher }}</span>
                  <span v-if="detailBook.pages">{{ detailBook.pages }}</span>
                  <span v-if="detailBook.identifier">{{ detailBook.identifier }}</span>
                </div>
                <div v-if="detailStats.length" class="sr-tags"><span v-for="tag in detailStats" :key="tag">{{ tag }}</span></div>
              </div>
            </div>
            <label v-if="detailBook.intro" class="sr-form-item">
              <span class="ft__secondary">简介</span>
              <span class="sr-intro-full">{{ detailBook.intro }}</span>
            </label>
            <div class="sr-actions-full">
              <button v-if="detailBook.readUrl" class="sr-btn-primary" @click="openReadOnline(detailBook)"><svg><use xlink:href="#lucide-eye"/></svg>{{ TEXT.readOnline }}</button>
              <button v-if="detailBook.readUrl" class="sr-btn-primary" :class="{ active: isLinkInShelf(detailBook) || importingState(detailBook, 'link') }" @click="addLinkBook(detailBook)">
                <svg><use :xlink:href="isLinkInShelf(detailBook) ? '#iconCheck' : '#iconLink'"/></svg>{{ importingState(detailBook, 'link') || (isLinkInShelf(detailBook) ? TEXT.inShelf : '链接添加到书架') }}
              </button>
              <button v-if="hasDownloadUrl(detailBook)" class="sr-btn-primary" :class="{ active: isDownloadInShelf(detailBook) || importingState(detailBook, 'download') }" @click="addDownloadBook(detailBook)">
                <svg><use :xlink:href="isDownloadInShelf(detailBook) ? '#iconCheck' : '#iconDownload'"/></svg>{{ importingState(detailBook, 'download') || (isDownloadInShelf(detailBook) ? TEXT.inShelf : '下载添加到书架') }}
              </button>
              <button v-if="!detailBook.readUrl" class="sr-btn-primary" @click="openLink(detailBook.bookUrl)"><svg><use xlink:href="#iconLink"/></svg>{{ i18n.openLink || TEXT.openLink }}</button>
            </div>
          </div>
        </div>
    </Transition>
    </template>
  </DockShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { showMessage } from 'siyuan'
import { bookshelfManager } from '@/core/bookshelf'
import { addOnlineBookToShelf, importRemoteBook } from '@/composables/useBookImport'
import { useLicense } from '@/core/license'
import { httpSourceManager, type HttpSourceConfig } from '@/utils/HttpSources'
import { loadWereadHttpBookDetail, toWereadHttpBook } from '@/weread/agent'
import { createWereadContextFromSource } from '@/weread/context'
import { createPrivateSearchAccess } from '@private-sources'
import DockShell from './ui/DockShell.vue'

const TEXT = { searchPlaceholder: '输入书名搜索', allSources: '全部来源', manageTitle: '来源管理', manageDesc: '统一管理内置源、自定义源和请求前缀。', edit: '编辑', remove: '删除', editSource: '编辑来源', addSource: '新增自定义来源', domains: '镜像列表', domainsPlaceholder: '每行一个域名', currentDomain: '当前镜像', account: '账号', accountPlaceholder: '邮箱', password: '密码', passwordPlaceholder: '用于正常登录获取搜索结果', siteUrl: '站点地址', searchUrl: '搜索地址', bookUrlPrefix: '书籍地址前缀', itemSelector: '结果项选择器', titleSelector: '标题选择器', authorSelector: '作者选择器', linkSelector: '链接选择器', coverSelector: '封面选择器', introSelector: '简介选择器', requestPrefix: '请求前缀 / 代理', requestPrefixPlaceholder: '留空或填写代理前缀', name: '名称', extensions: '扩展名过滤', extensionsPlaceholder: 'epub,pdf,mobi,azw3', siteUrlPlaceholder: 'https://example.com', searchUrlPlaceholder: 'https://example.com/search?q={query}', bookUrlPrefixPlaceholder: '留空自动推断', cancel: '取消', save: '保存', noResults: '未找到书籍', searching: '搜索中...', inShelf: '已在书架', openLink: '打开链接', readOnline: '在线阅读', detail: '书籍详情', saveError: '来源名称不能为空', customError: '自定义源至少需要搜索地址、结果项、标题、链接选择器', saveSuccess: '来源已保存', addError: '添加失败', sourceDescCustom: '自定义选择器来源', sourceDescAnna: '镜像 / 扩展名 / 请求前缀', sourceDescBuiltin: '内置来源' } as const
const FORM_DEFAULTS = { id: '', type: 'custom', name: '', url: '', searchUrl: '', requestPrefix: '', extensions: '', domainsText: '', currentDomain: '', authEmail: '', authPassword: '', bookUrlPrefix: '', itemSelector: '', titleSelector: '', authorSelector: '', linkSelector: '', coverSelector: '', introSelector: '' }
const field = (key: keyof typeof FORM_DEFAULTS, label: string, placeholder = '') => ({ key, label, placeholder })
const baseFields = [field('name', TEXT.name), field('requestPrefix', TEXT.requestPrefix, TEXT.requestPrefixPlaceholder), field('extensions', TEXT.extensions, TEXT.extensionsPlaceholder)] as const
const customFields = [field('url', TEXT.siteUrl, TEXT.siteUrlPlaceholder), field('searchUrl', TEXT.searchUrl, TEXT.searchUrlPlaceholder), field('bookUrlPrefix', TEXT.bookUrlPrefix, TEXT.bookUrlPrefixPlaceholder)] as const
const selectorFields = [['itemSelector', 'item', TEXT.itemSelector, '.book-item'], ['titleSelector', 'title', TEXT.titleSelector, '.title'], ['authorSelector', 'author', TEXT.authorSelector, '.author'], ['linkSelector', 'link', TEXT.linkSelector, 'a'], ['coverSelector', 'cover', TEXT.coverSelector, 'img'], ['introSelector', 'intro', TEXT.introSelector, '.intro']] as const
const builtinTypeSet = new Set(['gutenberg', 'standardebooks'])
const props = defineProps<{ i18n: any }>()
const i18n = computed(() => props.i18n || {})
const { can, showUpgrade } = useLicense(i18n.value)
const keyword = ref(''), selectedSource = ref(''), showSourceMenu = ref(false), showManagePanel = ref(false), searching = ref(false), results = ref<any[]>([]), allSources = ref<HttpSourceConfig[]>([]), detailBook = ref<any>(null), editingSource = ref<HttpSourceConfig | null>(null), shelfBooks = ref(new Set<string>()), failedCovers = new Set<string>(), importing = ref<Record<string, string>>({}), form = reactive({ ...FORM_DEFAULTS })
const enabledSources = computed(() => allSources.value.filter(source => source.enabled))
const privateSearchAccess = createPrivateSearchAccess({ reload: () => loadHttpSources() })
const visibleSources = computed(() => allSources.value.filter(source => privateSearchAccess.isSourceVisible(source)))
const visibleEnabledSources = computed(() => enabledSources.value.filter(source => privateSearchAccess.isSourceVisible(source)))
const detailTags = computed(() => detailBook.value?.kind?.split(/[，,\/]/).map((item: string) => item.trim()).filter(Boolean) || [])
const formNeedsDomains = computed(() => form.type === 'anna' || !!editingSource.value?.domains?.length)
const formNeedsAuth = computed(() => !!editingSource.value?.requiresAuth || !!editingSource.value?.auth)
const selectedSourceName = computed(() => !selectedSource.value ? i18n.value.allSources || TEXT.allSources : allSources.value.find(source => source.id === selectedSource.value)?.name || '')
const toolbarMenuAction = computed(() => ({ id: 'source', icon: '#lucide-sliders-horizontal', label: selectedSourceName.value }))
const toolbarActions = computed(() => [{ id: 'manage', icon: '#lucide-settings-2', label: TEXT.manageTitle }])
const detailStats = computed(() => {
  const stats = detailBook.value?.privateData?.stats
  return stats ? [stats.progress ? `进度 ${stats.progress}%` : '', stats.chapters ? `目录 ${stats.chapters}` : '', stats.marks ? `我的划线 ${stats.marks}` : '', stats.bookmarks ? `书签 ${stats.bookmarks}` : '', stats.bestMarks ? `热门划线 ${stats.bestMarks}` : '', stats.reviews ? `想法 ${stats.reviews}` : ''].filter(Boolean) : []
})

const normalizeExtensions = (value: string) => Array.from(new Set(value.split(/[,，\s]+/).map(item => item.trim().toLowerCase()).filter(Boolean)))
const sourceDesc = (source: HttpSourceConfig) => isWebSource(source) ? '网页书源' : source.type === 'custom' ? TEXT.sourceDescCustom : source.domains?.length ? TEXT.sourceDescAnna : TEXT.sourceDescBuiltin
const shouldShowCover = (book: any) => book.coverUrl && !failedCovers.has(book.coverUrl)
const handleCoverError = (book: any) => failedCovers.add(book.coverUrl)
const onDetailCoverError = (event: Event) => ((event.target as HTMLImageElement).src = '/icons/book-placeholder.svg')
const linkShelfKeys = (book: any) => Array.from(new Set([book.readUrl, book.bookUrl].filter(Boolean)))
const linkShelfKey = (book: any) => linkShelfKeys(book)[0] || ''
const downloadShelfKeys = (book: any) => Array.from(new Set([book.downloadUrl, book.bookUrl].filter(Boolean)))
const isLinkInShelf = (book: any) => linkShelfKeys(book).some(key => shelfBooks.value.has(key))
const isDownloadInShelf = (book: any) => downloadShelfKeys(book).some(key => shelfBooks.value.has(key))
const importingState = (book: any, mode: string) => importing.value[`${mode}:${book.bookUrl || book.name}`] || ''
const setImportingState = (book: any, mode: string, value = '') => {
  const key = `${mode}:${book.bookUrl || book.name}`
  importing.value = value ? { ...importing.value, [key]: value } : Object.fromEntries(Object.entries(importing.value).filter(([item]) => item !== key))
}
const hasDownloadUrl = (book: any) => book.canDownload || (book.downloadUrl || book.bookUrl)?.match(/^https?:\/\/.+\.(epub|pdf|mobi|azw3)(\?|$)/i)
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
const searchTags = (book: any) => [
  book.extension ? { text: book.extension, class: 'bs-tag--type' } : null,
  book.sourceName ? { text: book.sourceName, class: 'bs-tag--state bs-tag--reading' } : null,
  book.language ? { text: book.language, style: tagStyle(book.language) } : null,
  book.year ? { text: book.year, style: tagStyle(book.year) } : null,
].filter(Boolean) as Array<{ text: string; class?: string; style?: Record<string, string> }>
const placeholderCover = (book: any) => {
  const kind = String(book.extension || 'book').toLowerCase()
  const themes: Record<string, string[]> = {
    pdf: ['#ffd6d6', '#f19999', '#bf4747'],
    epub: ['#d8ebff', '#8ec0f2', '#3d79b7'],
    mobi: ['#ffe0bc', '#efb26d', '#b97629'],
    azw3: ['#e1d7ff', '#ab97eb', '#6550b9'],
    txt: ['#dcefdc', '#91c391', '#4b8556'],
    book: ['#dfe6f0', '#9eb0c8', '#5e7088'],
  }
  const [bg, accent, ink] = themes[kind] || themes.book
  const art = kind === 'pdf'
    ? `<rect x="30" y="42" width="40" height="10" rx="5" fill="${ink}" fill-opacity=".16"/><rect x="30" y="58" width="50" height="10" rx="5" fill="${ink}" fill-opacity=".1"/><rect x="30" y="80" width="34" height="34" rx="8" fill="${ink}" fill-opacity=".08"/><text x="47" y="101" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" font-weight="700" fill="${ink}" fill-opacity=".7">PDF</text>`
    : `<rect x="30" y="42" width="46" height="10" rx="5" fill="${accent}" fill-opacity=".28"/><rect x="30" y="58" width="54" height="10" rx="5" fill="${accent}" fill-opacity=".18"/><rect x="30" y="80" width="40" height="40" rx="${kind === 'txt' ? 6 : 20}" fill="${accent}" fill-opacity=".12"/><rect x="42" y="92" width="16" height="16" rx="${kind === 'txt' ? 2 : 8}" fill="${accent}" fill-opacity=".22"/>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 180"><rect width="120" height="180" fill="${bg}"/><circle cx="94" cy="24" r="22" fill="${accent}" fill-opacity=".12"/><rect x="22" y="28" width="74" height="92" rx="16" fill="#fff" fill-opacity=".68"/>${art}<rect x="22" y="138" width="68" height="6" rx="3" fill="${ink}" fill-opacity=".34"/><rect x="22" y="150" width="52" height="6" rx="3" fill="${ink}" fill-opacity=".24"/><rect x="22" y="162" width="60" height="6" rx="3" fill="${ink}" fill-opacity=".18"/></svg>`)}` 
}
const resetForm = () => Object.assign(form, FORM_DEFAULTS)
const closeOverlays = () => (showSourceMenu.value = false, showManagePanel.value = false)
const toggleSourceMenu = () => (showManagePanel.value = false, showSourceMenu.value = !showSourceMenu.value)
const toggleManagePanel = () => (showSourceMenu.value = false, showManagePanel.value = !showManagePanel.value)
const handleToolbarAction = (id: string) => { if (id === 'source') toggleSourceMenu(); else if (id === 'manage') toggleManagePanel() }
const pickSource = (id: string) => (selectedSource.value = id, showSourceMenu.value = false)
const isWebSource = (source: HttpSourceConfig) => source.type === 'qingtian'
const openWebSource = (source: HttpSourceConfig) => {
  const base = (source.currentDomain || source.url || '').replace(/\/+$/g, '')
  if (!base) return
  window.dispatchEvent(new CustomEvent('sireader:open-online-reader', { detail: { title: source.name || TEXT.readOnline, url: `${base}/online_search` } }))
  closeOverlays()
}
const handleManagePanelClick = (event: MouseEvent) => privateSearchAccess.handleManagePanelClick(event)
const checkInShelf = async (book: any) => {
  await Promise.all([
    ...linkShelfKeys(book).map(key => bookshelfManager.hasBook(key).then(has => has && shelfBooks.value.add(key))),
    ...downloadShelfKeys(book).map(key => bookshelfManager.hasBook(key).then(has => has && shelfBooks.value.add(key))),
  ])
}
const normalizeDetailBook = (book: any) => book?.sourceId === 'weread-agent' ? toWereadHttpBook(book.privateData?.raw || book, { id: book.sourceId, name: book.sourceName, url: book.sourceUrl }) || book : book
const showBook = async (book: any) => {
  detailBook.value = normalizeDetailBook(book)
  if (book?.sourceId === 'weread-agent') detailBook.value = await loadWereadHttpBookDetail(detailBook.value, httpSourceManager.getSource('weread-agent'))
}

const openLink = (url: string) => window.open(props.i18n.name === '思源阅读' ? url.replace('annas-archive.org', 'zh.annas-archive.org') : url, '_blank')
const openReadOnline = (book: any) => {
  if (!book?.readUrl) return
  const context = book.sourceId === 'weread-agent' ? createWereadContextFromSource(book, httpSourceManager.getSource('weread-agent')) : undefined
  window.dispatchEvent(new CustomEvent('sireader:open-online-reader', { detail: { title: book.name || TEXT.readOnline, url: book.readUrl, context } }))
}
const loadHttpSources = async () => {
  await httpSourceManager.init()
  allSources.value = httpSourceManager.getSources()
  if (selectedSource.value && !visibleSources.value.some(source => source.id === selectedSource.value)) selectedSource.value = ''
}
const toggleSource = async (id: string) => (await httpSourceManager.toggleSource(id), loadHttpSources())
const assignFormFromSource = (source: HttpSourceConfig) => Object.assign(form, { ...FORM_DEFAULTS, id: source.id, type: source.type, name: source.name || '', url: source.url || '', searchUrl: source.searchUrl || '', requestPrefix: source.requestPrefix || '', extensions: (source.filters?.extensions || []).join(','), domainsText: (source.domains || []).join('\n'), currentDomain: source.currentDomain || '', authEmail: source.auth?.email || '', authPassword: source.auth?.password || '', bookUrlPrefix: source.bookUrlPrefix || '', ...Object.fromEntries(selectorFields.map(([key, sourceKey]) => [key, source.selectors?.[sourceKey] || ''])) })
const startEditSource = (source: HttpSourceConfig) => (editingSource.value = source, assignFormFromSource(source))
const startAddCustom = () => (editingSource.value = { id: '', type: 'custom', name: '', enabled: true }, resetForm())
const cancelEditSource = () => (editingSource.value = null, resetForm())

const saveSource = async () => {
  if (!form.name.trim()) return showMessage(TEXT.saveError, 2000, 'error')
  const filters = { extensions: normalizeExtensions(form.extensions) }
  if (form.type === 'custom') {
    if (!form.searchUrl.trim() || !form.itemSelector.trim() || !form.titleSelector.trim() || !form.linkSelector.trim()) return showMessage(TEXT.customError, 3000, 'error')
    const payload = { name: form.name.trim(), enabled: true, url: form.url.trim(), searchUrl: form.searchUrl.trim(), requestPrefix: form.requestPrefix.trim(), filters, bookUrlPrefix: form.bookUrlPrefix.trim(), selectors: Object.fromEntries(selectorFields.map(([key, sourceKey]) => [sourceKey, form[key].trim()])) }
    if (form.id) await httpSourceManager.updateSource(form.id, payload)
    else await httpSourceManager.addCustomSource(payload)
  } else {
    await httpSourceManager.updateSource(form.id, { name: form.name.trim(), url: form.url.trim(), requestPrefix: form.requestPrefix.trim(), filters, domains: formNeedsDomains.value ? form.domainsText.split(/\r?\n/).map(item => item.trim()).filter(Boolean) : undefined, currentDomain: formNeedsDomains.value ? form.currentDomain.trim() : undefined, auth: formNeedsAuth.value ? { email: form.authEmail.trim(), password: form.authPassword, cookies: '', userId: '', userKey: '' } : undefined })
  }
  await loadHttpSources()
  showMessage(TEXT.saveSuccess, 1500, 'info')
  cancelEditSource()
}

const removeCustomSource = async (id: string) => {
  await httpSourceManager.removeSource(id)
  await loadHttpSources()
  if (form.id === id) cancelEditSource()
}
const search = async () => {
  if (!keyword.value.trim()) return
  if (!can.value('book-search')) return showUpgrade('在线搜书')
  searching.value = true
  results.value = []
  try {
    await httpSourceManager.init()
    results.value = selectedSource.value
      ? await httpSourceManager.search(keyword.value, selectedSource.value)
      : (await Promise.all(visibleEnabledSources.value.map(source => httpSourceManager.search(keyword.value, source.id)))).flat()
    await Promise.all(results.value.map(checkInShelf))
  } catch (error: any) {
    showMessage(`搜索失败: ${error.message}`, 3000, 'error')
  } finally {
    searching.value = false
  }
}
const addLinkBook = async (book: any) => {
  try {
    setImportingState(book, 'link', '添加中...')
    await httpSourceManager.init()
    await addOnlineBookToShelf(httpSourceManager.getOnlineBookInfo(book))
    shelfBooks.value.add(linkShelfKey(book))
    showMessage(`《${book.name}》链接已添加到书架`, 2000, 'info')
  } catch (error: any) {
    showMessage(error.message || TEXT.addError, 3000, 'error')
  } finally {
    setImportingState(book, 'link')
  }
}
const addDownloadBook = async (book: any) => {
  try {
    setImportingState(book, 'download', '下载中...')
    await httpSourceManager.init()
    const plan = await httpSourceManager.getDownloadPlan(book, message => setImportingState(book, 'download', message))
    await importRemoteBook({ ...plan, onProgress: message => setImportingState(book, 'download', message) })
    downloadShelfKeys(book).forEach(key => shelfBooks.value.add(key))
    shelfBooks.value.add(plan.url)
    showMessage(`《${book.name}》已添加到书架`, 2000, 'info')
  } catch (error: any) {
    showMessage(error.message || TEXT.addError, 3000, 'error')
  } finally {
    setImportingState(book, 'download')
  }
}

onMounted(() => {
  loadHttpSources()
  window.addEventListener('http-sources-updated', loadHttpSources)
})
onUnmounted(() => {
  window.removeEventListener('http-sources-updated', loadHttpSources)
})
</script>

<style scoped lang="scss">
.sr-search{position:relative;display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--b3-theme-background)}
.sr-btn-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;min-width:28px;max-width:28px;height:28px;min-height:28px;max-height:28px;flex:0 0 28px;padding:0!important;line-height:1;background:transparent;color:var(--b3-theme-on-surface);opacity:.5;border-radius:4px;border:none;box-sizing:border-box;cursor:pointer;overflow:hidden;
  svg{width:14px;height:14px;flex:0 0 14px}
  &:hover{opacity:1;background:var(--b3-theme-surface)}
  &:active{opacity:1;color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest)}
}
.sr-btn-primary{height:32px;padding:0 14px;background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);border-radius:4px;font-size:12px;font-weight:500;border:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:0;box-sizing:border-box;white-space:nowrap;cursor:pointer;
  svg{width:14px;height:14px;flex:0 0 14px}
  &:hover{transform:translateY(-1px);box-shadow:0 2px 6px #0003}
  &.active{opacity:.5;pointer-events:none}
}
.sr-manage-panel{position:absolute;top:44px;left:8px;right:8px;max-height:calc(100% - 56px);overflow:auto;padding:12px;box-sizing:border-box;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:10px;box-shadow:0 8px 24px #0002;z-index:20}
.sr-modal__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--b3-border-color);font-size:13px;font-weight:600}
.sr-modal__body{display:flex;flex-direction:column;gap:12px;padding-top:12px;box-sizing:border-box}
.sr-icon-btn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;flex:0 0 auto;cursor:pointer;svg{width:14px;height:14px}}
.sr-manage-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0}
.sr-manage-head>div{flex:1 1 auto;min-width:0}
.sr-manage-title,.sr-manage-subtitle{font-size:13px;font-weight:600}
.sr-manage-head small{display:block;font-size:11px;opacity:.65;line-height:1.45}
.sr-manage-group{margin-top:12px;padding-top:12px;border-top:1px solid var(--b3-border-color)}
.sr-manage-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}
.sr-manage-info{min-width:0;div{font-size:12px;font-weight:500}small{display:block;font-size:11px;opacity:.6;margin-top:2px}}
.sr-manage-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
.sr-edit-group{background:var(--b3-theme-background);border:1px solid var(--b3-border-color);border-radius:10px;padding:12px}
.sr-field{display:flex;flex-direction:column;gap:4px;margin-top:10px;min-width:0;label{font-size:12px;font-weight:500}input,textarea,select{width:100%;min-width:0;box-sizing:border-box}}
.sr-grid-two{display:grid;grid-template-columns:1fr;gap:10px}
.sr-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.sr-text-btn{padding:4px 8px;border:none;background:transparent;border-radius:6px;font-size:12px;color:var(--b3-theme-on-surface);cursor:pointer;&:hover{background:var(--b3-list-hover)}&.danger{color:var(--b3-theme-error)}}
.bs-view{min-height:0;height:100%;padding:0;box-sizing:border-box}
.bs-list{display:flex;flex-direction:column;gap:6px;overflow:auto;scrollbar-gutter:stable;padding:8px 0 8px 8px;box-sizing:border-box;margin:0;background:transparent}
.bs-list :deep(.b3-list-item){margin:0}
.bs-row{position:relative;display:flex;align-items:stretch;gap:10px;min-height:98px;padding:0 12px 0 0;border:1px solid color-mix(in srgb,var(--b3-border-color) 92%, transparent);border-radius:8px;background:linear-gradient(180deg,color-mix(in srgb,var(--b3-theme-background) 96%, white),var(--b3-theme-background));box-sizing:border-box;overflow:hidden;content-visibility:auto;contain-intrinsic-size:100px}
.bs-row__cover{position:relative;overflow:hidden;background:var(--b3-theme-surface-lighter);box-shadow:inset 0 0 0 1px var(--b3-border-color);align-self:stretch;flex:0 0 auto;width:64px;margin:2px;border-right:1px solid color-mix(in srgb,var(--b3-border-color) 88%, transparent);border-radius:8px}
.bs-row__cover img{display:block;width:100%;height:100%;object-fit:cover;background:inherit;animation:bs-cover-fade .18s ease}
.bs-row__main{display:flex;flex:1;flex-direction:column;justify-content:flex-start;gap:5px;min-width:0;padding:10px 0 9px}
.bs-row__head{display:flex;align-items:flex-start;gap:8px;min-width:0}
.bs-row__title,.bs-row__author{color:var(--b3-theme-on-surface);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bs-row__title{flex:1;min-width:0;font-size:13px;line-height:1.3;font-weight:600;letter-spacing:0}
.bs-row__progress{flex:0 0 auto;padding-top:1px;font-size:11px;line-height:1.2;color:var(--b3-theme-on-surface-variant);font-variant-numeric:tabular-nums}
.bs-row__author{font-size:11px;line-height:1.25;color:var(--b3-theme-on-surface-variant);min-height:14px}
.bs-tags{display:flex;flex-wrap:nowrap;gap:4px;min-height:16px;overflow:hidden}
.bs-tag{display:inline-flex;align-items:center;max-width:78px;padding:0 6px;height:16px;border-radius:5px;border:1px solid var(--bs-tag-border);background:var(--bs-tag-bg);color:var(--bs-tag-color);font-size:9px;font-weight:500;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;position:relative;flex:0 0 auto}
.bs-tags.is-stacked{gap:0}
.bs-tags.is-stacked .bs-tag{margin-right:-10px;transition:margin-right .15s ease,max-width .15s ease;z-index:1}
.bs-tags.is-stacked .bs-tag:hover{max-width:160px;margin-right:4px;overflow:visible;text-overflow:clip;z-index:2}
.bs-tag--type,.bs-tag--state{background:var(--b3-list-hover);border-color:color-mix(in srgb,var(--b3-border-color) 90%, transparent)}
.bs-tag--type{color:var(--b3-theme-on-surface-variant)}
.bs-tag--reading{color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest);border-color:color-mix(in srgb,var(--b3-theme-primary) 24%,transparent)}
.bs-row__meta{display:flex;flex-wrap:nowrap;gap:4px;margin-top:auto;font-size:10px;line-height:1.2;color:var(--b3-theme-on-surface-variant);white-space:nowrap;overflow:hidden}
.sr-status{display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;background:var(--b3-theme-surface);border-radius:6px;margin:0 0 8px;font-size:12px;opacity:.7}
.sr-placeholder{padding:40px;text-align:center;opacity:.5;font-size:12px}
.fade-enter-active,.fade-leave-active{transition:opacity .15s}
.fade-enter-from,.fade-leave-to{opacity:0}
.sr-detail-panel{background:var(--b3-theme-surface)}
.sr-detail-summary{display:flex;align-items:flex-start;gap:12px;min-width:0}
.sr-panel-cover{width:124px;height:176px;flex:0 0 124px;overflow:hidden;border-radius:var(--b3-border-radius);background:var(--b3-theme-background);object-fit:cover}
.sr-detail-main{flex:1;min-width:0;h2{font-size:16px;font-weight:600;line-height:1.25;margin:0 0 6px;overflow-wrap:anywhere}.sr-meta{font-size:12px;opacity:.6;margin:0 0 10px;overflow-wrap:anywhere}}
.sr-tags{display:flex;gap:6px;margin-bottom:4px;flex-wrap:wrap;span{padding:2px 8px;background:var(--b3-theme-background);border-radius:8px;font-size:10px}}
.sr-form-item{display:flex;flex-direction:column;gap:4px;padding:0 0 12px;border-bottom:1px solid var(--b3-border-color);font-size:12px}
.sr-intro-full{line-height:1.5;opacity:.7;font-size:12px;overflow-wrap:anywhere}
.sr-actions-full{display:flex;flex-direction:column;gap:8px;padding-top:12px;border-top:1px solid var(--b3-border-color);min-width:0;button{width:100%;min-width:0}}
@keyframes bs-cover-fade{from{opacity:0}to{opacity:1}}
@media (max-width:420px){.sr-detail-summary{flex-direction:column}.sr-panel-cover{margin:0 auto}}
</style>
