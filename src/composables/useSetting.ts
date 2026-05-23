// ===== 阅读器设置管理 =====
import { defineComponent, h, ref, toRaw } from 'vue'
import { showMessage, fetchSyncPost } from 'siyuan'
import type { Plugin } from 'siyuan'
import { putFile, readDir, searchDocs as apiSearchDocs } from '@/api'
import { bookshelfManager } from '@/core/bookshelf'

export type PdfToolbarStyle = 'float' | 'fixed'
export type PageAnimation = 'slide' | 'none'
export type ViewMode = 'single' | 'double' | 'scroll'
export type NavPosition = 'left' | 'right' | 'top' | 'bottom'
export type NavItem = { id: string; icon: string; tip: string; enabled: boolean; order: number }
export type DocInfo = { id: string; name: string; path: string; notebook: string }
export type NoteInsertTarget = 'clipboard' | 'current' | 'notebook' | 'document' | 'dailynote'
export type NoteInsertMode = 'insertBlock' | 'prependBlock' | 'appendBlock' | 'updateBlock' | 'prependDoc' | 'appendDoc'
export type LinkFormatPreset = 'simple' | 'heading' | 'list' | 'quote' | 'code'
export interface ReadTheme { name: string; color: string; bg: string; bgImg?: string }
export interface FontFileInfo { name: string; displayName: string }
export interface TextSettings { fontFamily: string; fontSize: number; fontWeight: number; letterSpacing: number; customFont: { fontFamily: string; fontFile: string } }
export interface ParagraphSettings { lineHeight: number; paragraphSpacing: number; textIndent: number }
export interface LayoutSettings { gap: number; headerFooterMargin: number; maxInlineSize?: number; maxBlockSize?: number }
export interface VisualSettings { brightness: number; contrast: number; sepia: number; saturate: number; invert: boolean }
export interface TTSVoice { name: string; displayName: string; locale: string; isLocal?: boolean }
export interface TTSSettings { enabled: boolean; voice: string; rate: number; autoTurnPage: boolean; highlightText: boolean; favoriteVoices: TTSVoice[] }
export interface PdfToolbarSettings { expanded: boolean; zoomMode: 'custom' | 'fit-width' | 'fit-page'; scale: number; rotation: 0 | 90 | 180 | 270; toolMode: 'text' | 'hand' | 'ink' | 'shape'; inkColor: string; inkWidth: number; shapeType: 'rect' | 'circle' | 'triangle' | 'textbox'; shapeColor: string; shapeWidth: number; shapeFilled: boolean; position: { x: number; y: number } }
export interface CloudDriveAccount { id: string; name: string; server: string; pathPrefix: string; username: string; password: string }
export interface ReaderSettings { enabled: boolean; openMode: 'newTab' | 'rightTab' | 'bottomTab' | 'newWindow'; navPosition: NavPosition; pageAnimation: PageAnimation; viewMode: ViewMode; theme: string; customTheme: ReadTheme; notebookId?: string; parentDoc?: DocInfo; noteInsertTarget: NoteInsertTarget; noteInsertMode: NoteInsertMode; linkFormat: string; annotationSyncOnAdd: boolean; annotationSyncOnDelete: boolean; pdfToolbarStyle: PdfToolbarStyle; pdfToolbar: PdfToolbarSettings; bookshelfCoverSize: number; openDocAssets: boolean; toolbarOpacity: number; quickSendDocs?: DocInfo[]; navItems?: NavItem[]; cloudAccounts?: CloudDriveAccount[]; textSettings: TextSettings; paragraphSettings: ParagraphSettings; layoutSettings: LayoutSettings; visualSettings: VisualSettings; tts?: TTSSettings }

// ===== 预设主题 =====
export const PRESET_THEMES: Record<string, ReadTheme> = { default: { name: 'themeDefault', color: '#202124', bg: '#ffffff' }, auto: { name: 'themeAuto', color: 'var(--b3-theme-on-background)', bg: 'var(--b3-theme-background)' }, almond: { name: 'themeAlmond', color: '#414441', bg: '#FAF9DE' }, autumn: { name: 'themeAutumn', color: '#414441', bg: '#FFF2E2' }, green: { name: 'themeGreen', color: '#414441', bg: '#E3EDCD' }, blue: { name: 'themeBlue', color: '#414441', bg: '#DCE2F1' }, night: { name: 'themeNight', color: '#fff6e6', bg: '#415062' }, dark: { name: 'themeDark', color: '#d5cecd', bg: '#414441' }, gold: { name: 'themeGold', color: '#b58931', bg: '#081010' } }

// ===== 工具 =====
const fixUrl = (u: string) => !u || u[0] === '/' || u.startsWith('http') ? u : `/${u}`;
const msg = { success: (m: string) => showMessage(m, 2000, 'info'), error: (m: string) => showMessage(m, 3000, 'error') };
const getTheme = (s: ReaderSettings) => s.theme === 'custom' ? s.customTheme : PRESET_THEMES[s.theme];
const getFont = (t: TextSettings) => { const c = t.fontFamily === 'custom' && t.customFont.fontFamily; return { font: c ? `"${t.customFont.fontFamily}", sans-serif` : t.fontFamily || 'inherit', fontFace: c ? `@font-face{font-family:"${t.customFont.fontFamily}";src:url("/plugins/custom-fonts/${t.customFont.fontFile}");font-display:swap}` : '' }; };

export const applyTheme = (el: HTMLElement, s: ReaderSettings) => { const t = getTheme(s); if (!t) return; const img = t.bgImg; Object.assign(el.style, { color: t.color, backgroundColor: img ? 'transparent' : t.bg, backgroundImage: img ? `url("${fixUrl(img)}")` : '', backgroundSize: img ? 'cover' : '', backgroundPosition: img ? 'center' : '', backgroundRepeat: img ? 'no-repeat' : '' }); };

export const applyPageStyles = (iframe: HTMLIFrameElement, s: ReaderSettings) => { const doc = iframe.contentDocument; if (!doc?.body) return; const { textSettings: t, paragraphSettings: p } = s; const { font, fontFace } = getFont(t), css = `${fontFace}body{font-family:${font}!important;font-size:${t.fontSize}px!important;font-weight:${t.fontWeight}!important;letter-spacing:${t.letterSpacing}em!important}p,div{line-height:${p.lineHeight}!important;margin:${p.paragraphSpacing}em 0!important}p{text-indent:${p.textIndent}em!important}`; const style = doc.querySelector('style[data-sireader-page]') || doc.head.appendChild(Object.assign(doc.createElement('style'), { textContent: '' })); style.setAttribute('data-sireader-page', 'true'); if (style.textContent !== css) style.textContent = css; };

// ===== 默认配置 =====
const DEFAULT_SETTINGS: ReaderSettings = { enabled: true, openMode: 'newTab', navPosition: 'top', pageAnimation: 'slide', viewMode: 'single', theme: 'auto', customTheme: { name: 'custom', color: '#202124', bg: '#ffffff' }, notebookId: '', parentDoc: undefined, noteInsertTarget: 'clipboard', noteInsertMode: 'insertBlock', linkFormat: '> [!NOTE] 📑 书名\n> [章节](链接) 文本\n> 截图\n> 笔记', annotationSyncOnAdd: false, annotationSyncOnDelete: false, pdfToolbarStyle: 'fixed', pdfToolbar: { expanded: true, zoomMode: 'fit-width', scale: 1.5, rotation: 0, toolMode: 'text', inkColor: '#ff0000', inkWidth: 2, shapeType: 'rect', shapeColor: '#ff0000', shapeWidth: 2, shapeFilled: false, position: { x: 16, y: 52 } }, bookshelfCoverSize: 120, openDocAssets: true, toolbarOpacity: 70, quickSendDocs: [], cloudAccounts: [], textSettings: { fontFamily: 'inherit', fontSize: 16, fontWeight: 400, letterSpacing: 0, customFont: { fontFamily: '', fontFile: '' } }, paragraphSettings: { lineHeight: 1.6, paragraphSpacing: 0.8, textIndent: 0 }, layoutSettings: { gap: 0, headerFooterMargin: 0 }, visualSettings: { brightness: 1, contrast: 1, sepia: 0, saturate: 1, invert: false }, tts: { enabled: false, voice: 'zh-CN-XiaoxiaoNeural', rate: 1.0, autoTurnPage: true, highlightText: true, favoriteVoices: [] } }
export const LINK_FORMAT_PRESETS: Record<LinkFormatPreset, string> = {
  simple: '[书名](链接) 文本',
  heading: '## 书名\n- [章节](链接) 文本\n- 位置\n- 笔记\n- 截图',
  list: '- [书名 / 章节](链接)\n- 文本\n- 笔记\n- 截图',
  quote: '> [书名 · 章节](链接) 文本\n>\n> 笔记\n>\n> 截图',
  code: '### 书名\n```md\n[章节](链接) 文本\n笔记\n```\n截图'
}

// ===== UI配置常量 =====
const r = (k: string, min: number, max: number, step: number, unit = '') => ({ key: k, type: 'range' as const, min, max, step, unit })
export const UI_CONFIG = { interfaceItems: [{ key: 'openMode', opts: ['newTab', 'rightTab', 'bottomTab', 'newWindow'] }, { key: 'openDocAssets', type: 'checkbox' as const }, { key: 'navPosition', opts: ['left', 'right', 'top', 'bottom'] }, { key: 'viewMode', opts: ['single', 'double', 'scroll'] }, { key: 'pageAnimation', opts: ['slide', 'none'] }, { key: 'pdfToolbarStyle', opts: ['float', 'fixed'] }, r('bookshelfCoverSize', 80, 160, 10, 'px'), r('toolbarOpacity', 0, 100, 5, '%')], customThemeItems: [{ key: 'color', label: 'textColor', type: 'color' }, { key: 'bg', label: 'bgColor', type: 'color' }, { key: 'bgImg', label: 'bgImage', type: 'text' }], appearanceGroups: [{ title: 'textSettings', items: [r('fontSize', 12, 32, 1, 'px'), r('fontWeight', 300, 900, 100), r('letterSpacing', 0, 0.2, 0.01, 'em')] }, { title: 'paragraphSettings', items: [r('lineHeight', 1.0, 3.0, 0.1), r('paragraphSpacing', 0, 2, 0.1, 'em'), r('textIndent', 0, 4, 0.5, 'em')] }, { title: 'layoutSettings', items: [r('gap', 0, 20, 1, '%'), r('headerFooterMargin', 0, 60, 5, 'px'), r('maxInlineSize', 0, 2000, 50, 'px'), r('maxBlockSize', 0, 3000, 50, 'px')] }, { title: 'visualSettings', items: [r('brightness', 0.5, 1.5, 0.05), r('contrast', 0.5, 1.5, 0.05), r('sepia', 0, 1, 0.05), r('saturate', 0, 2, 0.1), { key: 'invert', type: 'checkbox' as const }] }], ttsItems: [{ key: 'enabled', type: 'checkbox' as const }, r('rate', 0.5, 2.0, 0.1, 'x')], ttsOptions: [{ key: 'autoTurnPage', type: 'checkbox' as const }, { key: 'highlightText', type: 'checkbox' as const }] }
export const DEFAULT_NAV_ITEMS: NavItem[] = [
  { id: 'bookshelf', icon: 'lucide-library-big', tip: 'bookshelf', enabled: true, order: 0 },
  { id: 'search', icon: 'lucide-book-search', tip: 'search', enabled: true, order: 1 },
  { id: 'deck', icon: 'lucide-wallet-cards', tip: '卡包', enabled: true, order: 2 },
  { id: 'toc', icon: 'lucide-scroll-text', tip: '目录', enabled: true, order: 3 },
  { id: 'mark', icon: 'lucide-square-pen', tip: '标注', enabled: true, order: 4 },
  { id: 'appearance', icon: 'lucide-settings-2', tip: '设置', enabled: true, order: 7 }
]
export const NOTE_TARGET_OPTIONS = ['clipboard', 'current', 'notebook', 'document', 'dailynote'] as const
export const NOTE_MODE_OPTIONS = ['insertBlock', 'prependBlock', 'appendBlock', 'updateBlock', 'prependDoc', 'appendDoc'] as const
export const NOTE_MODE_LABELS: Record<typeof NOTE_MODE_OPTIONS[number], string> = { insertBlock: 'noteInsertModeCursor', prependBlock: 'noteInsertModeBefore', appendBlock: 'noteInsertModeAfter', updateBlock: 'noteInsertModeReplace', prependDoc: 'noteInsertModeDocTop', appendDoc: 'noteInsertModeDocBottom' }
export const SETTING_SECTION_ICONS = {
  root: { preview: '#lucide-eye', license: '#lucide-square-star', interface: '#lucide-monitor-cog', theme: '#lucide-palette', dictionary: '#lucide-languages', other: '#lucide-notebook-tabs', tts: '#lucide-volume-2', cloud: '#lucide-cloud' },
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
      if (item.opts) return h('select', { value: props.modelValue, class: 'b3-select sr-control', onChange: (e: Event) => emit('change', value(e)) }, item.opts.map((opt: string, i: number) => h('option', { key: opt, value: opt }, item.labels?.[i] ? (props.i18n as any)?.[item.labels[i]] : (props.i18n as any)?.[opt] || opt)))
      if (item.type === 'checkbox') return h('label', { class: 'fn__flex-center' }, [h('input', { checked: props.modelValue, type: 'checkbox', class: 'b3-switch', onChange: (e: Event) => emit('change', checked(e)) })])
      if (item.type === 'color' || item.type === 'text') return h('input', { value: props.modelValue, type: item.type, class: item.type === 'color' ? 'sr-control' : 'b3-text-field sr-control', onChange: (e: Event) => emit('change', value(e)) })
      return h('input', { value: props.modelValue, type: 'range', class: 'b3-slider sr-control b3-tooltips b3-tooltips__n', min: item.min, max: item.max, step: item.step, 'aria-label': `${props.modelValue}${item.unit || ''}`, onInput: (e: Event) => emit('input', Number(value(e))) })
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
    const actionButton = (a: any) => h('span', { key: a.key || a.title, class: 'b3-list-item__action b3-tooltips b3-tooltips__w', 'aria-label': a.title || '', onClick: (e: MouseEvent) => stop(e, a.onClick) }, [h('svg', [h('use', { 'xlink:href': a.icon || '#iconBookmark' })])])
    return () => {
      const rows = props.rows as any[]
      if (props.loading || !rows.length) return h('li', { class: 'b3-list-item b3-list-item--hide-action' }, [
        h('span', { class: 'b3-list-item__toggle fn__hidden' }),
        h('span', { class: ['b3-list-item__text', { ft__secondary: !props.loadLabel }] }, props.loading ? `${(props.i18n as any)?.loading || '加载中'}...` : (props.loadLabel || props.empty)),
        props.loadLabel && !props.loading ? h('span', { class: 'fn__space' }) : null,
        props.loadLabel && !props.loading ? h('span', { class: 'b3-list-item__action b3-tooltips b3-tooltips__w', 'aria-label': props.loadLabel, onClick: (e: MouseEvent) => stop(e, () => emit('load')) }, [h('svg', [h('use', { 'xlink:href': '#iconRefresh' })])]) : null
      ])
      return rows.map((row: any) => h('li', { key: row.key, class: ['b3-list-item', { 'b3-list-item--hide-action': !row.alwaysShowActions, 'b3-list-item--focus': row.active }], draggable: row.draggable, onClick: (e: MouseEvent) => stop(e, row.pick), onDragstart: row.dragstart, onDragend: row.dragend, onDragover: row.dragover, onDrop: row.drop }, [
        h('span', { class: 'b3-list-item__toggle fn__hidden' }),
        row.graphic ? h('span', { class: 'b3-list-item__graphic' }, row.graphic) : null,
        h('span', { class: ['b3-list-item__text', { ariaLabel: !!row.hint }], 'aria-label': row.hint || undefined, style: row.textStyle }, row.text),
        h('span', { class: 'fn__space' }),
        row.meta ? h('span', { class: ['b3-list-item__meta', { 'b3-tooltips b3-tooltips__w': !!row.metaTitle }], 'aria-label': row.metaTitle || undefined }, row.meta) : null,
        row.checkbox !== undefined ? h('label', { class: 'fn__flex-center', onClick: (e: MouseEvent) => e.stopPropagation() }, [h('input', { type: 'checkbox', class: 'b3-switch', checked: row.checkbox, disabled: row.disabled, onChange: (e: Event) => row.onCheck?.((e.target as HTMLInputElement).checked) })]) : null,
        ...(row.actions || []).filter((a: any) => a.show !== false).map(actionButton),
        row.action ? actionButton({ key: 'action', title: row.actionTitle, icon: row.actionIcon, onClick: row.action }) : null
      ]))
    }
  }
})
export const savePublicImage = async (file: File, folder = 'backgrounds') => {
  const ext = file.name.split('.').pop() || 'png', name = `${folder}-${Date.now()}.${ext}`, dir = `/data/public/siyuan-sireader/${folder}`
  await putFile(dir, true, new File([], ''))
  await putFile(`${dir}/${name}`, false, file)
  return `/public/siyuan-sireader/${folder}/${name}`
}
export const setCustomBackgroundImage = async (settings: ReaderSettings, file: File) => {
  settings.customTheme.bgImg = await savePublicImage(file, 'backgrounds')
}
export const setCustomBackgroundFromInput = async (settings: ReaderSettings, e: Event) => {
  const input = e.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return false
  try { await setCustomBackgroundImage(settings, file); return true }
  finally { input.value = '' }
}
export const licenseIcon = (type?: string) => ({ lifetime: '#iconLicenseLifetime', annual: '#iconLicenseAnnual', monthly: '#iconLicenseMonthly', trial: '#iconLicenseTrial' } as Record<string, string>)[type || ''] || '#iconLicenseTrial'
export const licenseTypeText = (type: string | undefined, i18n: any) => i18n?.[type === 'lifetime' ? 'lifetimeVersion' : type === 'annual' ? 'annualVersion' : type === 'monthly' ? 'monthlyVersion' : 'trialVersion'] || type || ''
export const licenseAvatar = (avatar = '') => avatar || ((globalThis as any)?.window?.siyuan?.user?.userAvatarURL || '')
export const licenseLines = (license: any, i18n: any) => license ? [
  `${i18n?.activated || '已激活'} · ${licenseTypeText(license.type, i18n)}`,
  license.userId && `ID ${license.userId}`,
  license.activatedAt && `${i18n?.activatedAt || '激活于'} ${new Date(license.activatedAt).toLocaleDateString()}`,
  license.expiresAt && license.expiresAt !== 0 && `${i18n?.expiresAt || '到期'} ${new Date(license.expiresAt).toLocaleDateString()}`
].filter(Boolean) : [i18n?.notActivated || '未激活']
export const getLicenseMedia = (license: any, avatar: string, i18n: any) => ({ avatar: licenseAvatar(avatar), icon: licenseIcon(license?.type), lines: licenseLines(license, i18n) })

// ===== 字体 =====
let cachedFonts: FontFileInfo[] | null = null, fontScanTask: Promise<FontFileInfo[]> | null = null, loadedFontKey = '';
export const scanCustomFonts = async (force = false): Promise<FontFileInfo[]> => {
  if (!force && cachedFonts) return cachedFonts
  if (!force && fontScanTask) return fontScanTask
  fontScanTask = (async () => {
  const files = await readDir('/data/plugins/custom-fonts').catch(() => null) as any
  const list = Array.isArray(files?.data) ? files.data : Array.isArray(files) ? files : []
  return cachedFonts = list.filter((f: any) => !f.isDir && /\.(ttf|otf|woff2?)$/i.test(f.name)).map((f: any) => ({ name: f.name, displayName: f.name.replace(/\.(ttf|otf|woff2?)$/i, '') }))
  })().finally(() => fontScanTask = null)
  return fontScanTask
}
export const loadFonts = (fonts: FontFileInfo[]) => {
  const key = fonts.map(f => f.name).join('|')
  if (key === loadedFontKey) return
  loadedFontKey = key
  const s = document.getElementById('sr-fonts') || Object.assign(document.createElement('style'), { id: 'sr-fonts' })
  s.parentNode || document.head.appendChild(s)
  s.textContent = fonts.map(f => `@font-face{font-family:"${f.displayName}";src:url("/plugins/custom-fonts/${f.name}");font-display:swap}`).join('')
};
export const resetToDefaults = (s: any) => Object.assign(s, { textSettings: DEFAULT_SETTINGS.textSettings, paragraphSettings: DEFAULT_SETTINGS.paragraphSettings, layoutSettings: DEFAULT_SETTINGS.layoutSettings, visualSettings: DEFAULT_SETTINGS.visualSettings });

// ===== 链接格式化 =====
const applyTpl=(t:string,v:Record<string,string>)=>{const ph:Record<string,string>={};let i=0;Object.entries(v).forEach(([k,val])=>{const p=`\x00${i++}\x00`;ph[p]=val;k.split('|').forEach(s=>t=t.replace(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),p))});return Object.entries(ph).reduce((r,[p,val])=>r.replace(new RegExp(p,'g'),val),t)}
const encodeReadableParam=(v:string)=>{try{v=decodeURI(`${v}`)}catch{}return v.replace(/%/g,'%25').replace(/&/g,'%26').replace(/#/g,'%23').replace(/\?/g,'%3F').replace(/\+/g,'%2B')}
export const buildSireaderLink=(bookUrl:string,cfi:string,id='')=>`sireader://open?url=${encodeReadableParam(bookUrl)}&cfi=${encodeReadableParam(cfi)}${id?`&id=${encodeReadableParam(id)}`:''}`
export const formatBookLink=(u:string,t:string,a:string,c:string,f:string,x:string,fmt:string,n='',i='',id='')=>applyTpl(fmt,{'书名|{{title}}':t,'作者|{{author}}':a,'章节|{{chapter}}':c,'位置|{{location}}':f,'链接|{{url}}':buildSireaderLink(u,f,id),'文本|{{text}}':x,'笔记|{{note}}':n,'截图|{{image}}':i}).replace(/> \n/g,'').replace(/\n\n+/g,'\n')
export const parseBookLink=(u:string):{bookUrl:string;cfi:string;id?:string}|null=>{try{const m=u.match(/^sireader:\/\/open\?(.+)$/);if(!m)return null;const p=new URLSearchParams(m[1].replace(/&amp;/g,'&'));let url=p.get('url'),c=p.get('cfi'),id=p.get('id')||undefined;if(!url||!c)return null;const e=url.indexOf('://');if(!id&&e!==-1){const pt=url.slice(e+3);for(const r of[/_(highlight-[^_&]+)$/,/_(note-[^_&]+)$/,/_(shape_\d+_[^_&]+)$/,/_(ink_\d+_[^_&]+)$/,/_(bookmark-[^_&]+)$/,/_(vocab-[^_&]+)$/]){const mt=pt.match(r);if(mt){id=mt[1];url=url.slice(0,-(id.length+1));break}}}return{bookUrl:url,cfi:c,id}}catch{return null}}

// ===== 笔记本和文档管理 =====
export const loadNotebooks = async () => { const r = await fetchSyncPost('/api/notebook/lsNotebooks', {}); return r?.code === 0 ? r.data?.notebooks || [] : [] }
export const searchDocs = async (k: string) => {
  const keyword = k.trim()
  return keyword ? await apiSearchDocs(keyword).catch(() => []) : []
}
export const createDocInfo = (d: any) => ({ id: d.id, name: d.hpath || d.hPath || d.name || d.content || '无标题', path: d.path || '', notebook: d.box || '' })
export const useDocSearch = () => { const s = ref({ input: '', results: [] as any[], show: false }); return { state: s, search: async () => { const k = s.value.input.trim(); if (k) (s.value.results = await searchDocs(k), s.value.show = true) }, select: (d: any, f: (doc: DocInfo) => void) => (f(createDocInfo(d)), s.value = { input: '', results: [], show: false }), reset: () => s.value = { input: '', results: [], show: false } } }
export const useNotebooks = () => { const n = ref<{ id: string; name: string; icon: string }[]>([]); return { notebooks: n, load: async () => !n.value.length && (n.value = await loadNotebooks()) } }
export const useConfirm = (f: () => void) => { const c = ref(false); return { confirming: c, handleClick: () => c.value ? (f(), c.value = false) : (c.value = true) } }

// ===== 设置管理 =====
const merge = (d: any, s: any): any => { const r = { ...d }; for (const k in s) if (s[k] !== undefined && s[k] !== null) r[k] = typeof s[k] === 'object' && !Array.isArray(s[k]) && d[k] ? merge(d[k], s[k]) : s[k]; return r; };
export const settingsManager = {
  get: async (): Promise<ReaderSettings> => { const s = await bookshelfManager.getSetting('reader_settings'); const v = s ? merge(DEFAULT_SETTINGS, s) : { ...DEFAULT_SETTINGS }; return (window as any).__sireader_settings = v; },
  save: async (settings: ReaderSettings) => { const v = JSON.parse(JSON.stringify(toRaw(settings))); await bookshelfManager.saveSetting('reader_settings', v); (window as any).__sireader_settings = v; window.dispatchEvent(new CustomEvent('sireaderSettingsUpdated', { detail: v })); }
};

// ===== useSetting =====
const settings = ref<ReaderSettings>({ ...DEFAULT_SETTINGS })
const isLoaded = ref(false)
const customFonts = ref<FontFileInfo[]>([])
const isLoadingFonts = ref(false)
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
  const resetStyles = () => resetToDefaults(settings.value);
  load(); 
  return { settings, isLoaded, save, customFonts, isLoadingFonts, loadCustomFonts, resetStyles };
}
