// ========================================
// EPUB 阅读器设置管理模块
// 职责：配置持久化、UI交互、主题应用
// ========================================

import { createApp, ref, toRaw } from 'vue'
import { MotionPlugin } from '@vueuse/motion'
import { Dialog, showMessage, fetchSyncPost } from 'siyuan'
import type { Plugin } from 'siyuan'
import type { DocInfo } from '@/core/epubDoc'
import SettingsVue from '@/components/Settings.vue'

export type PageAnimation = 'slide' | 'scroll' | 'none'  // slide/none翻页，scroll滚动
export type ColumnMode = 'single' | 'double'
export type TocPosition = 'left' | 'right'
export interface ReadTheme { name: string; color: string; bg: string; bgImg?: string }

export interface FontFileInfo {
  name: string
  displayName: string
}

export interface TextSettings {
  fontFamily: string
  fontSize: number
  letterSpacing: number
  customFont: { fontFamily: string; fontFile: string }
}

export interface ParagraphSettings {
  lineHeight: number
  paragraphSpacing: number
  textIndent: number
}

export interface PageSettings {
  marginHorizontal: number
  marginVertical: number
  continuousScroll: boolean
}

export interface ReaderSettings {
  enabled: boolean
  openMode: 'newTab' | 'rightTab' | 'bottomTab' | 'newWindow'
  tocPosition: TocPosition
  pageAnimation: PageAnimation
  columnMode: ColumnMode
  theme: string
  customTheme: ReadTheme
  annotationMode: 'notebook' | 'document'
  notebookId?: string
  parentDoc?: DocInfo
  textSettings: TextSettings
  paragraphSettings: ParagraphSettings
  pageSettings: PageSettings
}

export const PRESET_THEMES: Record<string, ReadTheme> = {
  default: { name: 'themeDefault', color: '#202124', bg: '#ffffff' },
  almond: { name: 'themeAlmond', color: '#414441', bg: '#FAF9DE' },
  autumn: { name: 'themeAutumn', color: '#414441', bg: '#FFF2E2' },
  green: { name: 'themeGreen', color: '#414441', bg: '#E3EDCD' },
  blue: { name: 'themeBlue', color: '#414441', bg: '#DCE2F1' },
  night: { name: 'themeNight', color: '#fff6e6', bg: '#415062' },
  dark: { name: 'themeDark', color: '#d5cecd', bg: '#414441' },
  gold: { name: 'themeGold', color: '#b58931', bg: '#081010' },
}

const fixUrl = (url: string) => url.startsWith('http') || url.startsWith('/') ? url : `/${url}`

// 应用主题到元素
export const applyTheme = (el: HTMLElement, settings: ReaderSettings) => {
  const theme = settings.theme === 'custom' ? settings.customTheme : PRESET_THEMES[settings.theme]
  if (!theme) return
  const s = el.style
  s.color = theme.color
  s.backgroundColor = theme.bgImg ? 'transparent' : theme.bg
  const img = theme.bgImg
  s.backgroundImage = img ? `url("${fixUrl(img)}")` : ''
  s.backgroundSize = img ? 'cover' : ''
  s.backgroundPosition = img ? 'center' : ''
  s.backgroundRepeat = img ? 'no-repeat' : ''
}

// 应用页面排版样式
export const applyPageStyles = (iframe: HTMLIFrameElement, settings: ReaderSettings) => {
  const doc = iframe.contentDocument
  if (!doc?.body) return
  const { textSettings: t, paragraphSettings: p, pageSettings: pg } = settings
  doc.querySelectorAll('style[data-sireader-page]').forEach(s => s.remove())
  
  // 字体
  const isCustom = t.fontFamily === 'custom' && t.customFont.fontFamily
  const font = isCustom ? `"${t.customFont.fontFamily}", sans-serif` : (t.fontFamily || 'inherit')
  const fontFace = isCustom ? `@font-face{font-family:"${t.customFont.fontFamily}";src:url("/plugins/custom-fonts/${t.customFont.fontFile}")}` : ''
  
  const style = Object.assign(doc.createElement('style'), { 
    'data-sireader-page': 'true',
    textContent: `${fontFace}body{font-family:${font}!important;font-size:${t.fontSize}px!important;letter-spacing:${t.letterSpacing}em!important;padding:${pg.marginVertical}px ${pg.marginHorizontal}px!important}p,div{line-height:${p.lineHeight}!important;margin:${p.paragraphSpacing}em 0!important}p{text-indent:${p.textIndent}em!important}`
  })
  doc.head.appendChild(style)
}

// 默认配置
const DEFAULT_SETTINGS: ReaderSettings = {
  enabled: true,
  openMode: 'newTab',
  tocPosition: 'left',
  pageAnimation: 'slide',
  columnMode: 'single',
  theme: 'default',
  customTheme: { name: 'custom', color: '#202124', bg: '#ffffff' },
  annotationMode: 'notebook',
  notebookId: '',
  parentDoc: undefined,
  textSettings: {
    fontFamily: 'inherit',
    fontSize: 16,
    letterSpacing: 0,
    customFont: { fontFamily: '', fontFile: '' },
  },
  paragraphSettings: {
    lineHeight: 1.6,
    paragraphSpacing: 0.8,
    textIndent: 0,
  },
  pageSettings: {
    marginHorizontal: 40,
    marginVertical: 20,
    continuousScroll: false,
  },
}

const msg = { success: (m: string) => showMessage(m, 2000, 'info'), error: (m: string) => showMessage(m, 3000, 'error') }

// 扫描字体
export const scanCustomFonts = async (): Promise<FontFileInfo[]> => {
  try {
    const res = await fetchSyncPost('/api/file/readDir', { path: '/data/plugins/custom-fonts' })
    return res?.code === 0 && Array.isArray(res.data)
      ? res.data
          .filter((f: any) => !f.isDir && /\.(ttf|otf|woff2?)$/i.test(f.name))
          .map((f: any) => ({ name: f.name, displayName: f.name.replace(/\.(ttf|otf|woff2?)$/i, '') }))
      : []
  } catch { return [] }
}

export function useSetting(plugin: Plugin) {
  const settings = ref<ReaderSettings>({ ...DEFAULT_SETTINGS })
  let dialog: Dialog | null = null
  let app: any = null
  const i18n = plugin.i18n as any

  const load = async () => {
    const cfg = await plugin.loadData('config.json') || {}
    if (cfg.settings) settings.value = { ...DEFAULT_SETTINGS, ...cfg.settings }
  }
  
  const save = async () => {
    try {
      const cfg = await plugin.loadData('config.json') || {}
      const raw = JSON.parse(JSON.stringify(toRaw(settings.value)))
      cfg.settings = raw
      await plugin.saveData('config.json', cfg)
      window.dispatchEvent(new CustomEvent('sireaderSettingsUpdated', { detail: raw }))
      msg.success(i18n?.saved || '设置已保存')
    } catch (e) {
      msg.error(i18n?.saveError || '保存失败')
      console.error('[SiReader]', e)
    }
  }
  // 打开设置对话框
  const open = async () => {
    if (dialog) {
      app?.unmount()
      dialog.destroy()
    }
    
    await load()
    
    dialog = new Dialog({
      title: i18n?.settingsTitle || '设置',
      content: '<div id="sireader-settings-mount"></div>',
      width: '680px',
      height: '580px',
      destroyCallback: () => {
        app?.unmount()
        dialog = null
        app = null
      },
    })

    const mountEl = dialog.element.querySelector('#sireader-settings-mount')
    if (mountEl) {
      app = createApp(SettingsVue, {
        modelValue: settings.value,
        i18n,
        onSave: save,
        'onUpdate:modelValue': (newSettings: ReaderSettings) => {
          settings.value = newSettings
        },
      })
      app.use(MotionPlugin)
      app.mount(mountEl)
    }
  }

  load()
  return { settings, open }
}
