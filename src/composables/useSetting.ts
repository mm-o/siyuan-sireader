// ===== 阅读器设置管理 =====
import { computed, defineComponent, h, ref, toRaw, type Ref } from 'vue'
import { showMessage, fetchSyncPost } from 'siyuan'
import type { Plugin } from 'siyuan'
import { createDocInfo, readDir, searchDocs as apiSearchDocs } from '@/api'
export { createDocInfo } from '@/api'
import { bookshelfManager } from '@/core/bookshelf'
import { normalizeSiyuanCloudUrl, removeManagedFileTransactionally, writeManagedFile, diffLeaves } from '@/core/storage'
import { OFFICIAL_TTS_MODELS_URL, OfflineTTSManager } from '@/services/OfflineTTS'
import type { OfflineTTSModelManifest } from '@/services/offlineTTSModels'

export type PageTurnStyle = 'push' | 'slide' | 'curl'
export type ViewMode = 'single' | 'double' | 'scroll'
export type PdfScrollDirection = 'vertical' | 'horizontal'
export type NavPosition = 'left' | 'right' | 'top' | 'bottom'
export type NavItem = { id: string; icon: string; tip: string; enabled: boolean; order: number }
export type DocInfo = { id: string; name: string; path: string; notebook: string }
export type NoteInsertTarget = 'clipboard' | 'current' | 'notebook' | 'document' | 'dailynote'
export type NoteInsertMode = 'insertBlock' | 'prependBlock' | 'appendBlock' | 'updateBlock' | 'prependDoc' | 'appendDoc'
export type LinkFormatPreset = 'simple' | 'heading' | 'list' | 'quote' | 'code'
export interface ReadTheme { name: string; color: string; bg: string; bgImg?: string }
export interface FontFileInfo { name: string; displayName: string; label?: string; source?: 'local' | 'file' }
export interface TextSettings { fontFamily: string; fontSize: number; fontWeight: number; letterSpacing: number; overrideFont?: boolean; overrideFontSize?: boolean; overrideLetterSpacing?: boolean; overrideAlignment?: boolean; textAlign?: 'left' | 'right' | 'center' | 'justify'; customFont: { fontFamily: string; fontFile: string } }
export interface ParagraphSettings { overrideLineHeight?: boolean; overrideParagraphSpacing?: boolean; overrideIndent?: boolean; lineHeight: number; paragraphSpacing: number; textIndent: number }
export interface LayoutSettings { gap?: number; headerFooterMargin?: number; marginTopPx: number; marginBottomPx: number; marginLeftPx: number; marginRightPx: number; gapPercent: number; showHeader: boolean; showFooter: boolean; showRemainingTime: boolean; showProgressInfo: boolean; progressStyle: 'fraction' | 'percentage' | 'reference'; referencePageCount: number; showCurrentTime: boolean; showCurrentBatteryStatus: boolean; use24HourClock: boolean }
export interface VisualSettings { brightness: number; contrast: number; sepia: number; saturate: number; invert: boolean }
export interface TTSVoice { name: string; displayName: string; locale: string; isLocal?: boolean }
export interface TTSSettings { enabled: boolean; voice: string; rate: number; pitch: number; sentenceGap: number; paragraphGap: number; autoTurnPage: boolean; highlightText: boolean; favoriteVoices?: TTSVoice[] }
export interface TranslationSettings { autoOnSelection: boolean; engine: 'google' | 'azure' | 'transmart' | 'youdao' | 'volcengine' | 'wechat' | 'mymemory' | 'ai' }
export interface ReaderSettings { enabled: boolean; openMode: 'newTab' | 'rightTab' | 'bottomTab' | 'newWindow'; navPosition: NavPosition; pageAnimation: PageTurnStyle; viewMode: ViewMode; pdfScrollDirection?: PdfScrollDirection; theme: string; customTheme: ReadTheme; backgroundImage?: string; notebookId?: string; parentDoc?: DocInfo; noteInsertTarget: NoteInsertTarget; noteInsertMode: NoteInsertMode; linkFormat: string; wereadExportTemplate?: string; annotationTagPresets: string; annotationSyncOnAdd: boolean; annotationSyncOnDelete: boolean; bookshelfCoverSize: number; bookshelfHiddenItems: string[]; openDocAssets: boolean; docAssetExcludeRegex: string; showWereadTopBar: boolean; epubOpeningSplash: boolean; toolbarOpacity: number; pdfZoomLevel?: 'automatic' | 'fit-page' | 'fit-width' | number; pdfAnnotationToolDefaults?: Record<string, Record<string, any>>; quickSendDocs?: DocInfo[]; navItems?: NavItem[]; textSettings: TextSettings; paragraphSettings: ParagraphSettings; layoutSettings: LayoutSettings; visualSettings: VisualSettings; translation: TranslationSettings; tts?: TTSSettings }

export const getPdfScrollStrategy = (direction?: PdfScrollDirection): PdfScrollDirection => direction === 'horizontal' ? 'horizontal' : 'vertical'

export const useTTSSettings = (settings: Ref<ReaderSettings>, { i18n, save, can, showUpgrade, openArchiveImport, openFolderImport }: { i18n: any; save: () => Promise<unknown>; can: (feature: string) => boolean; showUpgrade: (feature: string) => void; openArchiveImport: () => void; openFolderImport: () => void }) => {
  const offlineTTS = new OfflineTTSManager(), voices = ref<any[]>([]), loading = ref(false), progress = ref(0), models = ref<OfflineTTSModelManifest[]>([]), operation = ref(''), confirmingRemoval = ref<string|null>(null)
  const myVoices = computed(() => [...voices.value.filter(v => v.isLocal), ...models.value.filter(m => m.installed).flatMap(m => offlineTTS.voices(m)), ...(settings.value.tts?.favoriteVoices || []).filter(v => !v.isLocal && !(v as any).isOffline)])
  const onlineVoices = computed(() => voices.value.filter(v => !v.isLocal))
  const loadOffline = async () => { models.value = await offlineTTS.list() }
  const runOffline = async (task: string, action: () => Promise<unknown>, message: string) => {
    if (operation.value) return false
    operation.value = task; progress.value = 0
    try { await action(); await loadOffline(); showMessage(message, 2000, 'info'); return true }
    catch (e: any) { showMessage(e.message || '离线语音操作失败', 3000, 'error'); return false }
    finally { operation.value = '' }
  }
  const importPiper = (files: FileList) => runOffline('import', () => offlineTTS.importPiper(files, v => progress.value = v), '已导入离线模型')
  const importArchive = (file: File) => runOffline('import', () => offlineTTS.importKokoroArchive(file, v => progress.value = v), '已导入 Kokoro 离线语音模型')
  const remove = async (model: OfflineTTSModelManifest) => {
    if (confirmingRemoval.value !== model.id) return confirmingRemoval.value = model.id
    const removed = await runOffline(`remove:${model.id}`, async () => {
      if (settings.value.tts?.voice?.startsWith(`offline:${model.id}`)) {
        const { getTTSController } = await import('@/services/TTSPlayer')
        getTTSController().destroy(); settings.value.tts.voice = 'zh-CN-XiaoxiaoNeural'; await save()
      }
      await offlineTTS.remove(model.id)
    }, '离线语音模型已删除')
    if (removed) confirmingRemoval.value = null
  }
  const load = async () => {
    if (loading.value || voices.value.length) return
    loading.value = true
    try {
      await loadOffline()
      const { loadOnlineVoices, loadLocalVoices } = await import('@/services/TTSEngine')
      const [local, online] = await Promise.allSettled([loadLocalVoices(), loadOnlineVoices()])
      voices.value = [...(local.status === 'fulfilled' ? local.value : []), ...(online.status === 'fulfilled' ? online.value : [])]
      if (!voices.value.length) showMessage(i18n.loadVoicesFailed || '加载失败', 3000, 'error')
    } catch (e: any) { showMessage(e.message || i18n.loadVoicesFailed || '加载失败', 3000, 'error') }
    finally { loading.value = false }
  }
  const selectVoice = (voice: any) => {
    if (!voice.isLocal && !voice.isOffline && !can('tts-online')) return showUpgrade('在线语音')
    if (settings.value.tts) { settings.value.tts.voice = voice.name; void save() }
  }
  const toggleFavorite = (voice: any) => {
    if (!settings.value.tts) return
    const favorites = settings.value.tts.favoriteVoices || [], index = favorites.findIndex(v => v.name === voice.name)
    index >= 0 ? favorites.splice(index, 1) : favorites.push({ name: voice.name, displayName: voice.displayName, locale: voice.locale, isLocal: voice.isLocal })
    settings.value.tts.favoriteVoices = favorites
    showMessage(index >= 0 ? (i18n.deleted || '已删除') : (i18n.ttsVoiceFavorited || '已收藏'), 1500, 'info'); void save()
  }
  const isFavorite = (name: string) => (settings.value.tts?.favoriteVoices || []).some(v => v.name === name)
  const externalActions = (url: string, openTitle: string, copyTitle: string) => [
    { title: openTitle, icon: '#iconLink', disabled: !!operation.value, onClick: () => window.open(url, '_blank', 'noopener') },
    { title: copyTitle, icon: '#iconCopy', disabled: !!operation.value, onClick: async () => { try { await navigator.clipboard.writeText(url); showMessage(`${copyTitle.replace(/^复制/, '')}已复制`, 1800, 'info') } catch { showMessage('复制失败，请右键链接并复制地址', 2500, 'error') } } }
  ]
  const voiceSections = computed(() => [
    { key: 'ttsFavorites', title: i18n.ttsFavoriteVoices || '我的语音', hint: `${i18n.ttsCurrentVoice || '当前'}: ${settings.value.tts?.voice || ''}`, rows: myVoices.value.map((v: any) => ({ key: v.name, text: v.displayName, meta: v.isOffline ? '离线包' : (v.isLocal ? (i18n.localVoice || '本地') : v.locale), active: settings.value.tts?.voice === v.name, pick: () => selectVoice(v), action: v.isLocal || v.isOffline ? undefined : () => toggleFavorite(v), actionTitle: i18n.delete || '删除' })), empty: i18n.ttsNoFavorites || '暂无，请点击下方加载' },
    { key: 'ttsVoices', title: i18n.ttsVoiceList || '在线语音', hint: i18n.ttsOnlineHint || '点击语音名称选择，点击星号收藏', rows: onlineVoices.value.map(v => ({ key: v.name, text: v.displayName, meta: v.locale, active: settings.value.tts?.voice === v.name, pick: () => selectVoice(v), action: () => toggleFavorite(v), actionTitle: isFavorite(v.name) ? '取消收藏' : '收藏' })), empty: i18n.ttsNoVoices || '暂无语音', loadLabel: i18n.ttsLoadVoices || '加载语音' }
  ])
  const offlineRows = computed(() => [
    { key: 'hint', text: '已安装的模型可在上方“我的语音”中选择；小雅旧模型会自动识别。' },
    { key: 'import-kokoro', text: 'Kokoro · 导入模型包', meta: '选择 .tar.bz2 文件', alwaysShowActions: true, actionTitle: '导入模型包', actionIcon: '#iconFolder', actionDisabled: !!operation.value, action: openArchiveImport },
    { key: 'import-piper', text: 'Piper · 导入解压后的模型文件夹', meta: '支持兼容 Piper VITS 的模型', alwaysShowActions: true, actionTitle: '导入文件夹', actionIcon: '#iconFolder', actionDisabled: !!operation.value, action: openFolderImport },
    ...models.value.filter(model => model.installed).map(model => ({ key: model.id, text: model.name, meta: operation.value === `remove:${model.id}` ? '正在删除…' : '已安装', alwaysShowActions: true, actionTitle: confirmingRemoval.value === model.id ? '确认删除' : '删除模型', actionIcon: '#lucide-trash-2', actionDisabled: !!operation.value, action: () => remove(model) })),
    { key: 'official-models', text: '官方 TTS 模型列表', actions: externalActions(OFFICIAL_TTS_MODELS_URL, '打开官网模型列表', '复制官网模型列表链接') },
  ])
  return { voices, loading, progress, models, operation, confirmingRemoval, voiceSections, offlineRows, load, loadOffline, selectVoice, toggleFavorite, importPiper, importArchive }
}

// ===== 预设主题 =====
export const PRESET_THEMES: Record<string, ReadTheme> = { default: { name: 'themeDefault', color: '#202124', bg: '#ffffff' }, auto: { name: 'themeAuto', color: 'var(--b3-theme-on-background)', bg: 'var(--b3-theme-background)' }, almond: { name: 'themeAlmond', color: '#414441', bg: '#FAF9DE' }, autumn: { name: 'themeAutumn', color: '#414441', bg: '#FFF2E2' }, green: { name: 'themeGreen', color: '#414441', bg: '#E3EDCD' }, blue: { name: 'themeBlue', color: '#414441', bg: '#DCE2F1' }, night: { name: 'themeNight', color: '#fff6e6', bg: '#415062' }, dark: { name: 'themeDark', color: '#d5cecd', bg: '#414441' }, gold: { name: 'themeGold', color: '#b58931', bg: '#081010' } }

// ===== 工具 =====
const fixUrl = (u: string) => !u || u[0] === '/' || u.startsWith('http') ? u : `/${u}`;
const msg = { success: (m: string) => showMessage(m, 2000, 'info'), error: (m: string) => showMessage(m, 3000, 'error') };
export const getReaderTheme = (s: ReaderSettings) => ({ ...(s.theme === 'custom' ? s.customTheme : PRESET_THEMES[s.theme] || PRESET_THEMES.default), bgImg: s.backgroundImage || '' });
export const CUSTOM_FONT_DIR = '/data/public/siyuan-sireader/fonts'
export const customFontUrl = (file = '') => `/public/siyuan-sireader/fonts/${encodeURIComponent(file)}`

export const applyTheme = (el: HTMLElement, s: ReaderSettings) => { const t = getReaderTheme(s); const img = t.bgImg; Object.assign(el.style, { color: t.color, backgroundColor: img ? 'transparent' : t.bg, backgroundImage: img ? `url("${fixUrl(img)}")` : '', backgroundSize: img ? 'cover' : '', backgroundPosition: img ? 'center' : '', backgroundRepeat: img ? 'no-repeat' : '' }); };

// ===== 默认配置 =====
export const DEFAULT_WEREAD_EXPORT_TEMPLATE = `# {{书名}}\n\n{{封面}}\n\n- 作者：{{作者}}\n- 微信读书：{{链接}}\n- 书籍详情：{{详情链接}}\n- bookId：{{bookId}}\n- ISBN：{{ISBN}}\n- 出版社：{{出版社}}\n- 分类：{{分类}}\n- 出版时间：{{出版时间}}\n- 字数：{{字数}}\n- 阅读人数：{{阅读人数}}\n- 评分：{{评分}}\n\n{{简介}}\n\n## 目录\n\n{{目录}}\n\n## 划线与想法\n\n{{划线与想法}}\n\n## 书签\n\n{{书签}}`
const DEFAULT_SETTINGS: ReaderSettings = { enabled: true, openMode: 'newTab', navPosition: 'top', pageAnimation: 'push', viewMode: 'single', theme: 'auto', customTheme: { name: 'custom', color: '#202124', bg: '#ffffff' }, backgroundImage: '', notebookId: '', parentDoc: undefined, noteInsertTarget: 'clipboard', noteInsertMode: 'insertBlock', linkFormat: '> [!NOTE] 📑 书名\n> [章节](链接) 文本\n> 图片\n> 笔记', wereadExportTemplate: DEFAULT_WEREAD_EXPORT_TEMPLATE, annotationTagPresets: '未分组:', annotationSyncOnAdd: false, annotationSyncOnDelete: false, bookshelfCoverSize: 120, bookshelfHiddenItems: [], openDocAssets: true, docAssetExcludeRegex: '', showWereadTopBar: true, epubOpeningSplash: false, toolbarOpacity: 70, pdfAnnotationToolDefaults: {}, quickSendDocs: [], textSettings: { fontFamily: 'serif', fontSize: 16, fontWeight: 400, letterSpacing: 0, overrideFontSize: false, overrideLetterSpacing: false, overrideAlignment: false, textAlign: 'justify', customFont: { fontFamily: '', fontFile: '' } }, paragraphSettings: { overrideLineHeight: false, overrideParagraphSpacing: false, overrideIndent: false, lineHeight: 1.6, paragraphSpacing: 1, textIndent: 2 }, layoutSettings: { marginTopPx: 44, marginBottomPx: 44, marginLeftPx: 16, marginRightPx: 16, gapPercent: 5, showHeader: true, showFooter: true, showRemainingTime: false, showProgressInfo: true, progressStyle: 'fraction', referencePageCount: 0, showCurrentTime: false, showCurrentBatteryStatus: false, use24HourClock: false }, visualSettings: { brightness: 1, contrast: 1, sepia: 0, saturate: 1, invert: false }, translation: { autoOnSelection: false, engine: 'azure' }, tts: { enabled: false, voice: 'zh-CN-XiaoxiaoNeural', rate: 1.0, pitch: 1.0, sentenceGap: 0, paragraphGap: 0.3, autoTurnPage: false, highlightText: true }, }
DEFAULT_SETTINGS.pdfScrollDirection = 'vertical'
export const LINK_FORMAT_PRESETS: Record<LinkFormatPreset, string> = {
  simple: '[书名](链接) 文本',
  heading: '## 书名\n- [章节](链接) 文本\n- 位置\n- 笔记\n- 图片',
  list: '- [书名 / 章节](链接)\n- 文本\n- 笔记\n- 图片',
  quote: '> [书名 · 章节](链接) 文本\n>\n> 笔记\n>\n> 图片',
  code: '### 书名\n```md\n[章节](链接) 文本\n笔记\n```\n图片'
}
const normalizeLinkFormat = (value = '') => value.replace(/截图/g, '图片')
const splitTags = (value = '') => value.split(/[#;,\uFF1B\uFF0C\u3001\n]/).map(tag => tag.trim()).filter(Boolean)

// ===== UI配置常量 =====
const r = (k: string, min: number, max: number, step: number, unit = '') => ({ key: k, type: 'range' as const, min, max, step, unit })
const c = (key: string) => ({ key, type: 'checkbox' as const })
export const PDF_SCROLL_DIRECTION_ITEM = { key: 'pdfScrollDirection', opts: ['vertical', 'horizontal'] }
export const UI_CONFIG = { interfaceItems: [{ key: 'openMode', opts: ['newTab', 'rightTab', 'bottomTab', 'newWindow'] }, { key: 'openDocAssets', type: 'checkbox' as const }, { key: 'showWereadTopBar', type: 'checkbox' as const }, { key: 'epubOpeningSplash', type: 'checkbox' as const }, { key: 'navPosition', opts: ['left', 'right', 'top', 'bottom'] }, { key: 'viewMode', opts: ['single', 'double', 'scroll'] }, { key: 'pageAnimation', opts: ['push', 'slide', 'curl'] }, r('bookshelfCoverSize', 80, 160, 10, 'px'), r('toolbarOpacity', 0, 100, 5, '%')], customThemeItems: [{ key: 'color', label: 'textColor', type: 'color' }, { key: 'bg', label: 'bgColor', type: 'color' }, { key: 'bgImg', label: 'bgImage', type: 'text' }], appearanceGroups: [{ title: 'textSettings', items: [c('overrideFontSize'), r('fontSize', 12, 32, 1, 'px'), r('fontWeight', 300, 900, 100), c('overrideLetterSpacing'), r('letterSpacing', 0, 0.2, 0.01, 'em'), c('overrideAlignment'), { key: 'textAlign', opts: ['justify', 'left', 'right', 'center'], labels: ['alignJustify', 'alignLeft', 'alignRight', 'alignCenter'] }] }, { title: 'paragraphSettings', items: [c('overrideLineHeight'), r('lineHeight', 1.0, 3.0, 0.1), c('overrideParagraphSpacing'), r('paragraphSpacing', 0, 2, 0.1, 'em'), c('overrideIndent'), r('textIndent', 0, 4, 0.5, 'em')] }, { title: 'layoutSettings', items: [r('marginTopPx', 0, 144, 4, 'px'), r('marginBottomPx', 0, 144, 4, 'px'), r('marginLeftPx', 0, 144, 4, 'px'), r('marginRightPx', 0, 144, 4, 'px'), r('gapPercent', 0, 30, 1, '%'), c('showHeader'), c('showFooter'), c('showRemainingTime'), c('showProgressInfo'), { key: 'progressStyle', opts: ['fraction', 'percentage', 'reference'], labels: ['progressStyleFraction', 'progressStylePercentage', 'progressStyleReference'] }, r('referencePageCount', 0, 10000, 50), c('showCurrentTime'), c('showCurrentBatteryStatus'), c('use24HourClock')] }, { title: 'visualSettings', items: [r('brightness', 0.5, 1.5, 0.05), r('contrast', 0.5, 1.5, 0.05), r('sepia', 0, 1, 0.05), r('saturate', 0, 2, 0.1), { key: 'invert', type: 'checkbox' as const }] }], ttsItems: [{ key: 'enabled', type: 'checkbox' as const }, r('rate', 0.5, 2.0, 0.1, 'x'), r('pitch', 0.5, 1.5, 0.1), r('sentenceGap', 0, 3, 0.1, 's'), r('paragraphGap', 0, 5, 0.1, 's')], ttsOptions: [{ key: 'autoTurnPage', type: 'checkbox' as const }, { key: 'highlightText', type: 'checkbox' as const }] }
export const DEFAULT_NAV_ITEMS: NavItem[] = [
  { id: 'bookshelf', icon: 'lucide-library-big', tip: 'bookshelf', enabled: true, order: 0 },
  { id: 'search', icon: 'lucide-book-search', tip: 'search', enabled: true, order: 1 },
  { id: 'notes', icon: 'lucide-notebook-pen', tip: 'quickNotes', enabled: true, order: 2 },
  { id: 'toc', icon: 'lucide-scroll-text', tip: 'sidebarToc', enabled: true, order: 3 },
  { id: 'mark', icon: 'lucide-square-pen', tip: 'sidebarAnnotation', enabled: true, order: 4 },
  { id: 'appearance', icon: 'lucide-settings-2', tip: 'sidebarSettings', enabled: true, order: 7 }
]
export const NOTE_TARGET_OPTIONS = ['clipboard', 'current', 'notebook', 'document', 'dailynote'] as const
export const NOTE_MODE_OPTIONS = ['insertBlock', 'prependBlock', 'appendBlock', 'updateBlock', 'prependDoc', 'appendDoc'] as const
export const NOTE_MODE_LABELS: Record<typeof NOTE_MODE_OPTIONS[number], string> = { insertBlock: 'noteInsertModeCursor', prependBlock: 'noteInsertModeBefore', appendBlock: 'noteInsertModeAfter', updateBlock: 'noteInsertModeReplace', prependDoc: 'noteInsertModeDocTop', appendDoc: 'noteInsertModeDocBottom' }
export const SETTING_SECTION_ICONS = {
  root: { preview: '#lucide-eye', license: '#lucide-square-star', interface: '#lucide-monitor-cog', theme: '#lucide-palette', dictionary: '#lucide-languages', other: '#lucide-notebook-tabs', tts: '#lucide-volume-2' },
  sub: { navItems: '#lucide-list-tree', customFont: '#lucide-book-text' },
  appearance: { textSettings: '#lucide-book-open-text', paragraphSettings: '#lucide-scroll-text', layoutSettings: '#lucide-layout-template', visualSettings: '#lucide-sliders-horizontal' },
  dictionary: { offlineDict: '#lucide-hard-drive', onlineDict: '#lucide-wifi' },
  voice: { ttsFavorites: '#lucide-star', ttsVoices: '#lucide-radio' }
} as const
export const settingSectionIcon = (group: keyof typeof SETTING_SECTION_ICONS, key: string) => (SETTING_SECTION_ICONS[group] as Record<string, string>)[key] || '#lucide-settings-2'
export const SectionTitle = defineComponent({
  props: { title: { type: String, required: true }, icon: { type: String, required: true }, open: Boolean, ariaLabel: String },
  emits: ['toggle'],
  setup: (props, { emit, slots }) => () => h('li', { class: 'b3-list-item sr-section-title', onClick: (e: MouseEvent) => (e.stopPropagation(), emit('toggle')) }, [
    h('span', { class: 'b3-list-item__toggle b3-list-item__toggle--hl' }, [h('svg', { class: ['b3-list-item__arrow', { 'b3-list-item__arrow--open': props.open }] }, [h('use', { 'xlink:href': '#iconRight' })])]),
    h('svg', { class: 'b3-list-item__graphic' }, [h('use', { 'xlink:href': props.icon })]),
    h('span', { class: ['b3-list-item__text', { ariaLabel: !!props.ariaLabel }], 'aria-label': props.ariaLabel || undefined }, props.title),
    slots.default?.()
  ])
})
export const SettingSection = defineComponent({
  props: { title: { type: String, required: true }, icon: { type: String, required: true }, open: Boolean, name: String },
  emits: ['toggle'],
  setup: (props, { emit, slots }) => () => h('ul', { class: 'b3-list b3-list--background', 'data-name': props.name || undefined }, [
    h(SectionTitle, { title: props.title, icon: props.icon, open: props.open, onToggle: () => emit('toggle') }),
    props.open ? slots.default?.() : null
  ])
})
export const SettingItem = defineComponent({
  props: { item: { type: Object, required: true }, modelValue: [String, Number, Boolean], label: String, hint: String, i18n: Object },
  emits: ['change', 'input'],
  setup: (props, { emit }) => {
    const value = (e: Event) => (e.target as HTMLInputElement).value
    const checked = (e: Event) => (e.target as HTMLInputElement).checked
    const control = () => {
      const item = props.item as any
      if (item.opts) return h('select', { value: props.modelValue, class: 'b3-select sr-control', onChange: (e: Event) => emit('change', value(e)) }, item.opts.map((opt: string, i: number) => h('option', { key: opt, value: opt }, item.labels?.[i] ? (props.i18n as any)[item.labels[i]] : (props.i18n as any)[opt])))
      if (item.type === 'checkbox') return h('label', { class: 'fn__flex-center' }, [h('input', { checked: props.modelValue, type: 'checkbox', class: 'b3-switch', onChange: (e: Event) => emit('change', checked(e)) })])
      if (item.type === 'color' || item.type === 'text') return h('input', { value: props.modelValue, type: item.type, class: item.type === 'color' ? 'sr-control' : 'b3-text-field sr-control', onChange: (e: Event) => emit('change', value(e)) })
      return h('input', { value: props.modelValue, type: 'range', class: 'b3-slider sr-control ariaLabel', min: item.min, max: item.max, step: item.step, 'data-position': 'north', 'data-tooltip-encoding': 'none', 'aria-label': `${props.modelValue}${item.unit || ''}`, onInput: (e: Event) => emit('input', Number(value(e))) })
    }
    return () => h('li', { class: 'b3-list-item b3-list-item--hide-action' }, [
      h('span', { class: 'b3-list-item__toggle fn__hidden' }),
      h('span', { class: 'b3-list-item__text ariaLabel', 'aria-label': props.hint || '' }, props.label),
      h('span', { class: 'fn__space' }),
      control()
    ])
  }
})
export const SettingRows = defineComponent({
  props: { rows: { type: Array, default: () => [] }, empty: String, loading: Boolean, loadLabel: String, i18n: Object },
  emits: ['load'],
  setup: (props, { emit }) => {
    const stop = (e: MouseEvent, fn?: () => void) => (e.stopPropagation(), fn?.())
    const actionButton = (a: any) => h('span', { key: a.key || a.title, class: ['b3-list-item__action ariaLabel', { 'ft__secondary': a.disabled }], 'data-position': 'west', 'data-tooltip-encoding': 'none', 'aria-label': a.title || '', 'aria-disabled': a.disabled ? 'true' : undefined, onClick: (e: MouseEvent) => stop(e, a.disabled ? undefined : a.onClick) }, [h('svg', [h('use', { 'xlink:href': a.icon || '#iconBookmark' })])])
    return () => {
      const rows = props.rows as any[]
      if (props.loading || !rows.length) return h('li', { class: 'b3-list-item b3-list-item--hide-action' }, [
        h('span', { class: 'b3-list-item__toggle fn__hidden' }),
        h('span', { class: ['b3-list-item__text', { ft__secondary: !props.loadLabel }] }, props.loading ? `${(props.i18n as any)?.loading || '加载中'}...` : (props.loadLabel || props.empty)),
        props.loadLabel && !props.loading ? h('span', { class: 'fn__space' }) : null,
        props.loadLabel && !props.loading ? h('span', { class: 'b3-list-item__action ariaLabel', 'data-position': 'west', 'data-tooltip-encoding': 'none', 'aria-label': props.loadLabel, onClick: (e: MouseEvent) => stop(e, () => emit('load')) }, [h('svg', [h('use', { 'xlink:href': '#iconRefresh' })])]) : null
      ])
      if (rows[0]?.layout === 'grid') return h('li', { class: 'sr-resource-grid' }, rows.map((row: any) => h('div', { key: row.key, class: ['sr-resource-tile', { 'sr-resource-tile--active': row.active }], title: row.text, 'aria-label': row.text, onClick: (e: MouseEvent) => stop(e, row.pick) }, [
        row.graphic,
        h('span', { class: 'sr-resource-actions' }, (row.actions || []).map(actionButton))
      ])))
      return rows.map((row: any) => h('li', { key: row.key, class: ['b3-list-item', { 'b3-list-item--hide-action': !row.alwaysShowActions, 'b3-list-item--focus': row.active }], draggable: row.draggable, onClick: (e: MouseEvent) => stop(e, row.pick), onDragstart: row.dragstart, onDragend: row.dragend, onDragover: row.dragover, onDrop: row.drop }, [
        h('span', { class: 'b3-list-item__toggle fn__hidden' }),
        row.graphic ? h('span', { class: 'b3-list-item__graphic' }, row.graphic) : null,
        h('span', { class: ['b3-list-item__text', { ariaLabel: !!row.hint }], 'aria-label': row.hint || undefined, style: row.textStyle }, row.text),
        h('span', { class: 'fn__space' }),
        row.meta ? h('span', { class: ['b3-list-item__meta', { 'ariaLabel': !!row.metaTitle }], 'data-position': 'west', 'data-tooltip-encoding': 'none', 'aria-label': row.metaTitle || undefined }, row.meta) : null,
        row.checkbox !== undefined ? h('label', { class: 'fn__flex-center', onClick: (e: MouseEvent) => e.stopPropagation() }, [h('input', { type: 'checkbox', class: 'b3-switch', checked: row.checkbox, disabled: row.disabled, onChange: (e: Event) => row.onCheck?.((e.target as HTMLInputElement).checked) })]) : null,
        ...(row.actions || []).filter((a: any) => a.show !== false).map(actionButton),
        row.action ? actionButton({ key: 'action', title: row.actionTitle, icon: row.actionIcon, disabled: row.actionDisabled, onClick: row.action }) : null
      ]))
    }
  }
})
export const savePublicImage = async (file: File, folder = 'backgrounds') => {
  const ext = file.name.split('.').pop() || 'png', name = `${folder}-${Date.now()}.${ext}`, dir = `/data/public/siyuan-sireader/${folder}`
  await writeManagedFile(file, `${dir}/${name}`, name)
  return `/public/siyuan-sireader/${folder}/${name}`
}
export interface PublicImageInfo { name: string; url: string }
let publicImages: PublicImageInfo[] = [], publicImageTask: Promise<PublicImageInfo[]> | null = null
export const scanPublicImages = async (force = false): Promise<PublicImageInfo[]> => {
  if (!force && publicImages.length) return publicImages
  if (!force && publicImageTask) return publicImageTask
  publicImageTask = (async () => {
    const result = await readDir('/data/public/siyuan-sireader/backgrounds').catch(() => null) as any
    const list = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : []
    return publicImages = list.filter((f: any) => !f.isDir && /\.(png|jpe?g|gif|webp|avif)$/i.test(f.name)).map((f: any) => ({ name: f.name, url: `/public/siyuan-sireader/backgrounds/${encodeURIComponent(f.name)}` }))
  })().finally(() => publicImageTask = null)
  return publicImageTask
}
export const deletePublicImage = async (name: string) => {
  await removeManagedFileTransactionally(`/data/public/siyuan-sireader/backgrounds/${name}`)
  publicImages = publicImages.filter(image => image.name !== name)
}
export const uploadPublicImage = async (file: File) => {
  const url = await savePublicImage(file, 'backgrounds')
  await scanPublicImages(true)
  return url
}
export const setCustomBackgroundImage = async (settings: ReaderSettings, file: File) => {
  settings.backgroundImage = await uploadPublicImage(file)
}
export const setCustomBackgroundFromInput = async (settings: ReaderSettings, e: Event) => {
  const input = e.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return false
  try { await setCustomBackgroundImage(settings, file); return true }
  finally { input.value = '' }
}
export const licenseIcon = (type?: string) => ({ lifetime: '#iconLicenseLifetime', annual: '#iconLicenseAnnual', monthly: '#iconLicenseMonthly', trial: '#iconLicenseTrial' } as Record<string, string>)[type || ''] || '#iconLicenseTrial'
export const licenseTypeText = (type: string | undefined, i18n: any) => {
  if (type === 'free') return i18n?.basicVersion || '基础版'
  const key = type === 'lifetime' ? 'lifetimeVersion' : type === 'annual' ? 'annualVersion' : type === 'monthly' ? 'monthlyVersion' : 'trialVersion'
  return i18n?.[key] || ({ lifetime: '永久会员', annual: '年付会员', monthly: '月付会员', trial: '体验会员' } as Record<string, string>)[type || ''] || '会员'
}
export const licenseAvatar = (avatar = '') => avatar || ((globalThis as any)?.window?.siyuan?.user?.userAvatarURL || '')
export const licenseLines = (license: any, i18n: any = {}) => license ? [
  `${license.userName || '思源用户'} · ID ${license.userId}`,
  license.type === 'free' ? '开通会员后请点击“恢复权益”同步会员状态' : '',
  license.expiresAt > 0 ? `${i18n.validUntil || '有效期至'} ${new Date(license.expiresAt).toLocaleDateString()}` : (i18n.permanent || '永久有效'),
] .filter(Boolean) : ['扫码绑定后自动同步会员权益']
export const getLicenseMedia = (license: any, avatar: string, i18n: any) => ({
  avatar: licenseAvatar(avatar),
  icon: licenseIcon(license?.type),
  title: license ? licenseTypeText(license.type, i18n) : '思阅会员',
  lines: licenseLines(license, i18n),
})

// ===== 字体 =====
let cachedFonts: FontFileInfo[] | null = null, fontScanTask: Promise<FontFileInfo[]> | null = null, loadedFontKey = '';
export const scanCustomFonts = async (force = false): Promise<FontFileInfo[]> => {
  if (!force && cachedFonts) return cachedFonts
  if (!force && fontScanTask) return fontScanTask
  fontScanTask = (async () => {
  const files = await readDir(CUSTOM_FONT_DIR).catch(() => null) as any
  const list = Array.isArray(files?.data) ? files.data : Array.isArray(files) ? files : []
  const filesFonts = list.filter((f: any) => !f.isDir && /\.(ttf|otf|woff2?)$/i.test(f.name)).map((f: any) => ({ name: f.name, displayName: f.name.replace(/\.(ttf|otf|woff2?)$/i, ''), source: 'file' as const }))
  const locals: FontFileInfo[] = []
  const addLocal = (family: unknown, label?: unknown) => {
    const name = String(family || '').trim()
    const displayName = String(label || name).trim()
    const existing = locals.find(font => font.name === `local:${name}`)
    if (existing) { if (displayName && existing.label === name) existing.label = `${displayName} (${name})`; return }
    if (!name) return
    locals.push({ name: `local:${name}`, displayName: name, label: displayName === name ? name : `${displayName} (${name})`, source: 'local' })
  }
  const win = typeof window === 'undefined' ? null : window as any
  if (typeof win?.queryLocalFonts === 'function') {
    try { for (const f of await win.queryLocalFonts({ postscriptNames: true })) addLocal(f.family || f.fullName, f.fullName) } catch { /* use the registry fallback */ }
  }
  const req = win?.require || (() => { try { return win?.parent?.require } catch { return null } })()
  if (!locals.length && typeof req === 'function') {
    try {
      const execFile = req('child_process').execFile
      const query = (key: string) => new Promise<string>(resolve => execFile('reg.exe', ['query', key], { windowsHide: true }, (_error: unknown, stdout: string) => resolve(stdout || '')))
      const fontKeys = ['HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows NT\\CurrentVersion\\Fonts']
      const aliasKeys = ['HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\FontSubstitutes', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\FontSubstitutes']
      const texts = await Promise.all([...fontKeys, ...aliasKeys].map(query))
      for (const line of texts.slice(0, fontKeys.length).join('\n').split(/\r?\n/)) { const match = line.match(/^\s+(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)$/i); if (match) addLocal(match[1].replace(/\s*\(.*\)$/, '').trim()) }
      for (const line of texts.slice(fontKeys.length).join('\n').split(/\r?\n/)) { const match = line.trim().match(/^(.+?)\s+REG_SZ\s+(.+)$/i); if (match) addLocal(match[2].trim(), match[1].trim()) }
    } catch { /* local font enumeration is optional */ }
  }
  return cachedFonts = [...locals, ...filesFonts]
  })().finally(() => fontScanTask = null)
  return fontScanTask
}
export const loadFonts = (fonts: FontFileInfo[]) => {
  const key = fonts.map(f => f.name).join('|')
  if (key === loadedFontKey) return
  loadedFontKey = key
  const s = document.getElementById('sr-fonts') || Object.assign(document.createElement('style'), { id: 'sr-fonts' })
  s.parentNode || document.head.appendChild(s)
  s.textContent = fonts.filter(f => f.source !== 'local' && !f.name.startsWith('local:')).map(f => `@font-face{font-family:"${f.displayName}";src:url("${customFontUrl(f.name)}");font-display:swap}`).join('')
};
export const preloadFont = (font?: FontFileInfo) => font && document.fonts?.load(`16px "${font.displayName}"`)
export const resetToDefaults = (s: any) => Object.assign(s, cloneSettings({ textSettings: DEFAULT_SETTINGS.textSettings, paragraphSettings: DEFAULT_SETTINGS.paragraphSettings, layoutSettings: DEFAULT_SETTINGS.layoutSettings, visualSettings: DEFAULT_SETTINGS.visualSettings }));

// ===== 链接格式化 =====
const applyTpl=(t:string,v:Record<string,string>)=>{const ph:Record<string,string>={};let i=0;Object.entries(v).forEach(([k,val])=>{const p=`\x00${i++}\x00`;ph[p]=val;k.split('|').forEach(s=>t=t.replace(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),p))});return Object.entries(ph).reduce((r,[p,val])=>r.replace(new RegExp(p,'g'),val),t)}
const encodeReadableParam=(v:string)=>{let value=`${v}`;try{value=decodeURIComponent(value)}catch{}return value.replace(/%/g,'%25').replace(/&/g,'%26').replace(/=/g,'%3D').replace(/#/g,'%23').replace(/\?/g,'%3F').replace(/\+/g,'%2B')}
export const buildSireaderLink=(bookUrl:string,cfi:string,id='')=>/^https?:\/\//i.test(cfi)?cfi:`sireader://open?url=${encodeReadableParam(normalizeSiyuanCloudUrl(bookUrl))}&cfi=${encodeReadableParam(cfi)}${id?`&id=${encodeReadableParam(id)}`:''}`
export const formatBookLink=(u:string,t:string,a:string,c:string,f:string,x:string,fmt:string,n='',i='',id='')=>applyTpl(fmt,{'书名|{{title}}':t,'作者|{{author}}':a,'章节|{{chapter}}':c,'位置|{{location}}':f,'链接|{{url}}':buildSireaderLink(u,f,id),'文本|{{text}}':x,'笔记|{{note}}':n,'图片|{{image}}':i}).replace(/> \n/g,'').replace(/\n\n+/g,'\n')
export const parseBookLink=(u:string):{bookUrl:string;cfi:string;id?:string}|null=>{
  try {
    const match=u.replace(/^<|>$/g,'').match(/^sireader:\/\/open\?(.+)$/)
    if (!match) return null
    const params=new URLSearchParams(match[1].replace(/&amp;/g,'&').replace(/\+/g,'%2B'))
    let url=params.get('url'), cfi=params.get('cfi'), id=params.get('id')||undefined
    if (!url||!cfi) return null
    url = normalizeSiyuanCloudUrl(url)
    const e=url.indexOf('://')
    if (!id&&e!==-1) {
      const path=url.slice(e+3)
      for (const pattern of [/_((?:highlight|note|bookmark|vocab)-[^_&]+)$/]) {
        const found=path.match(pattern)
        if (found) { id=found[1]; url=url.slice(0,-(id.length+1)); break }
      }
    }
    return {bookUrl:url,cfi,id}
  } catch { return null }
}

// ===== 笔记本和文档管理 =====
export const loadNotebooks = async () => { const r = await fetchSyncPost('/api/notebook/lsNotebooks', {}); return r?.code === 0 ? r.data?.notebooks || [] : [] }
export const searchDocs = async (k: string) => {
  const keyword = k.trim()
  return keyword ? await apiSearchDocs(keyword).catch(() => []) : []
}
export const useDocSearch = () => { const s = ref({ input: '', results: [] as any[], show: false }); return { state: s, search: async () => { const k = s.value.input.trim(); if (k) (s.value.results = await searchDocs(k), s.value.show = true) }, select: (d: any, f: (doc: DocInfo) => void) => (f(createDocInfo(d)), s.value = { input: '', results: [], show: false }), reset: () => s.value = { input: '', results: [], show: false } } }
export const useNotebooks = () => { const n = ref<{ id: string; name: string; icon: string }[]>([]); return { notebooks: n, load: async () => !n.value.length && (n.value = await loadNotebooks()) } }
export const useConfirm = (f: () => void) => { const c = ref(false); return { confirming: c, handleClick: () => c.value ? (f(), c.value = false) : (c.value = true) } }

// ===== 设置管理 =====
const merge = (d: any, s: any): any => { const r = { ...d }; for (const k in s) if (s[k] !== undefined && s[k] !== null) r[k] = typeof s[k] === 'object' && !Array.isArray(s[k]) && d[k] ? merge(d[k], s[k]) : s[k]; return r; };
let persistedSettings: ReaderSettings | null = null
const cloneSettings = <T>(value: T): T => JSON.parse(JSON.stringify(toRaw(value)))
export const settingsManager = {
  get: async (): Promise<ReaderSettings> => { const s = await bookshelfManager.getSetting('reader_settings'); const v = merge(cloneSettings(DEFAULT_SETTINGS), s || {}); if (Array.isArray(v.navItems) && v.navItems.length && !v.navItems.some((item: NavItem) => item.id === 'notes')) { const item = DEFAULT_NAV_ITEMS.find(item => item.id === 'notes')!; v.navItems = [...v.navItems, { ...item, order: Math.max(-1, ...v.navItems.map((nav: NavItem) => Number(nav.order) || 0)) + 1 }] } if (!v.backgroundImage && v.customTheme?.bgImg) v.backgroundImage = v.customTheme.bgImg; const old = s?.layoutSettings?.headerFooterMargin; if (old > 0 && s.layoutSettings?.marginTopPx == null) Object.assign(v.layoutSettings, { marginTopPx: old, marginBottomPx: old, marginLeftPx: old, marginRightPx: old }); if (v.layoutSettings.gapPercent == null) v.layoutSettings.gapPercent = v.layoutSettings.gap || 5; if (v.layoutSettings.showHeader && v.layoutSettings.marginTopPx <= 0) v.layoutSettings.marginTopPx = 44; if (v.layoutSettings.showFooter && v.layoutSettings.marginBottomPx <= 0) v.layoutSettings.marginBottomPx = 44; v.linkFormat = normalizeLinkFormat(v.linkFormat); persistedSettings = cloneSettings(v); return (window as any).__sireader_settings = v; },
  save: async (settings: ReaderSettings) => { const v = cloneSettings(settings); const baseline = persistedSettings; const patch = (baseline ? diffLeaves(v as unknown as Record<string, unknown>, baseline as unknown as Record<string, unknown>) : v) as Record<string, unknown>; if (Object.keys(patch).length) await bookshelfManager.patchSetting('reader_settings', patch); persistedSettings = cloneSettings(merge(baseline || DEFAULT_SETTINGS, patch)); const current = merge((window as any).__sireader_settings || DEFAULT_SETTINGS, patch); (window as any).__sireader_settings = current; window.dispatchEvent(new CustomEvent('sireaderSettingsUpdated', { detail: current })); },
  patch: async (patch: Partial<ReaderSettings>) => { const value = cloneSettings(patch); await bookshelfManager.patchSetting('reader_settings', value); const v = merge((window as any).__sireader_settings || DEFAULT_SETTINGS, value); persistedSettings = cloneSettings(merge(persistedSettings || DEFAULT_SETTINGS, value)); (window as any).__sireader_settings = v; window.dispatchEvent(new CustomEvent('sireaderSettingsUpdated', { detail: v })); return v; }
};
export const collectAnnotationTagPresets = async (tags: unknown[] = []) => {
  const settings = (window as any).__sireader_settings as ReaderSettings
  if (!settings) return
  const input = splitTags(tags.join(','))
  const lines = (settings.annotationTagPresets || '未分组:').split('\n')
  const known = new Set(splitTags(lines.map(line => line.split(/[:\uFF1A]/)[1] || '').join(',')))
  const add = input.filter(tag => !known.has(tag))
  if (!add.length) return
  let i = lines.findIndex(line => /^\s*未分组\s*[:：]/.test(line))
  if (i < 0) i = lines.push('未分组:') - 1
  const [name, rest = ''] = lines[i].split(/[:\uFF1A]/)
  lines[i] = `${name || '未分组'}: ${splitTags(`${rest},${add.join(',')}`).join(', ')}`
  await settingsManager.save({ ...settings, annotationTagPresets: lines.join('\n') })
}

// ===== useSetting =====
const settings = ref<ReaderSettings>({ ...DEFAULT_SETTINGS })
const isLoaded = ref(false)
const customFonts = ref<FontFileInfo[]>([])
const isLoadingFonts = ref(false)
const backgroundImages = ref<PublicImageInfo[]>([])
const isLoadingBackgrounds = ref(false)
let loadTask: Promise<void> | null = null
let fontLoadTask: Promise<void> | null = null
typeof window !== 'undefined' && window.addEventListener('sireaderSettingsUpdated', (e: Event) => { settings.value = (e as CustomEvent).detail || settings.value })
export function useSetting(plugin: Plugin) { 
  const i18n = plugin.i18n as any
  const load = () => loadTask ||= (async () => { try { settings.value = await settingsManager.get() } catch { settings.value = { ...DEFAULT_SETTINGS }; (window as any).__sireader_settings = settings.value } finally { isLoaded.value = true } })()
  const save = async () => { try { await settingsManager.save(settings.value), msg.success(i18n?.saved || '设置已保存') } catch { msg.error(i18n?.saveError || '保存失败') } };
  const loadCustomFonts = async (force = false) => {
    if (!force && customFonts.value.length) return
    if (!force && fontLoadTask) return fontLoadTask
    isLoadingFonts.value = true
    fontLoadTask = (async () => { customFonts.value = await scanCustomFonts(force); loadFonts(customFonts.value) })().finally(() => (isLoadingFonts.value = false, fontLoadTask = null))
    return fontLoadTask
  };
  const uploadCustomFonts = async (files: FileList | File[]) => {
    const fonts = Array.from(files).filter(file => /\.(ttf|otf|woff2?)$/i.test(file.name))
    if (!fonts.length) return 0
    await Promise.all(fonts.map(file => writeManagedFile(file, `${CUSTOM_FONT_DIR}/${file.name}`, file.name)))
    cachedFonts = null
    await loadCustomFonts(true)
    return fonts.length
  }
  const deleteCustomFont = async (name: string) => {
    await removeManagedFileTransactionally(`${CUSTOM_FONT_DIR}/${name}`)
    cachedFonts = null
    await loadCustomFonts(true)
  }
  const loadFont = (font?: FontFileInfo) => { void preloadFont(font) }
  const uploadBackground = async (file: File) => {
    const previous = settings.value.backgroundImage
    settings.value.backgroundImage = await uploadPublicImage(file)
    if (previous?.startsWith('/public/siyuan-sireader/backgrounds/')) await deletePublicImage(decodeURIComponent(previous.split('/').pop() || '')).catch(() => {})
    await loadBackgrounds(true)
    return settings.value.backgroundImage
  }
  const deleteBackground = async (name: string) => {
    await deletePublicImage(name)
    if (settings.value.backgroundImage?.endsWith(`/${name}`)) { settings.value.backgroundImage = ''; await save() }
    await loadBackgrounds(true)
  }
  const loadBackgrounds = async (force = false) => {
    isLoadingBackgrounds.value = true
    try { backgroundImages.value = await scanPublicImages(force) } finally { isLoadingBackgrounds.value = false }
  }
  const resetStyles = () => resetToDefaults(settings.value);
  load().then(() => Promise.all([loadCustomFonts(), loadBackgrounds()])).catch(() => {})
  return { settings, isLoaded, save, customFonts, isLoadingFonts, loadCustomFonts, loadFont, uploadCustomFonts, deleteCustomFont, backgroundImages, isLoadingBackgrounds, loadBackgrounds, uploadBackground, deleteBackground, resetStyles };
}
