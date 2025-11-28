// ========================================
// EPUB 阅读器设置管理模块
// 职责：配置持久化、UI交互、主题应用
// ========================================

import { ref, toRaw } from 'vue'
import { Dialog, showMessage } from 'siyuan'
import type { Plugin } from 'siyuan'
import type { DocInfo } from '@/core/epubDoc'

// ===== 类型定义 =====
export type PageTurnMode = 'click' | 'toolbar'
export type PageAnimation = 'slide' | 'fade' | 'flip' | 'scroll' | 'vertical' | 'none'
export type ColumnMode = 'single' | 'double'
export type TocPosition = 'left' | 'right'
export interface ReadTheme { name: string; color: string; bg: string; bgImg?: string }

// 页面排版设置
export interface TextSettings {
  fontFamily: string
  fontSize: number
  letterSpacing: number
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
  pageTurnMode: PageTurnMode
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

// ===== 主题配置 =====
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
  
  // 移除旧样式
  doc.querySelectorAll('style[data-sireader-page]').forEach(s => s.remove())
  
  // 注入新样式
  const style = doc.createElement('style')
  style.setAttribute('data-sireader-page', 'true')
  style.textContent = `
    body {
      font-family: ${t.fontFamily} !important;
      font-size: ${t.fontSize}px !important;
      letter-spacing: ${t.letterSpacing}em !important;
      padding-left: ${pg.marginHorizontal}px !important;
      padding-right: ${pg.marginHorizontal}px !important;
      padding-top: ${pg.marginVertical}px !important;
      padding-bottom: ${pg.marginVertical}px !important;
    }
    p, div {
      line-height: ${p.lineHeight} !important;
      margin-top: ${p.paragraphSpacing}em !important;
      margin-bottom: ${p.paragraphSpacing}em !important;
    }
    p {
      text-indent: ${p.textIndent}em !important;
    }
  `
  doc.head.appendChild(style)
}

// ===== 默认配置 =====
const DEFAULT_SETTINGS: ReaderSettings = {
  enabled: true,
  openMode: 'newTab',
  tocPosition: 'left',
  pageTurnMode: 'click',
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

// ===== 工具函数 =====
const msg = { success: (m: string) => showMessage(m, 2000, 'info'), error: (m: string) => showMessage(m, 3000, 'error') }

// ===== HTML 模板构建 =====
const item = (title: string, desc: string, control: string) => `
  <div class="b3-label" style="margin-bottom:20px">
    <div class="fn__flex" style="align-items:center;justify-content:space-between">
      <div class="fn__flex-1">
        <div class="b3-label__text" style="font-weight:500;margin-bottom:4px">${title}</div>
        <div class="b3-label__text" style="font-size:12px;opacity:0.7">${desc}</div>
      </div>
      <span class="fn__space" style="width:16px"></span>
      ${control}
    </div>
  </div>
`

const select = (id: string, opts: string) => `<select id="setting-${id}" class="b3-select" style="width:160px">${opts}</select>`

// 滑块控件
const slider = (id: string, min: number, max: number, step: number, unit: string = '') => `
  <div class="fn__flex" style="align-items:center;gap:8px">
    <input type="range" id="setting-${id}" min="${min}" max="${max}" step="${step}" class="b3-slider" style="width:120px">
    <span id="${id}-value" style="min-width:50px;text-align:right;font-size:13px;color:var(--b3-theme-on-surface)">--${unit}</span>
  </div>
`

// 选项生成器
const options = (items: Record<string, string>) => Object.entries(items).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')

// ===== 设置管理 Composable =====
export function useSetting(plugin: Plugin) {
  const settings = ref<ReaderSettings>({ ...DEFAULT_SETTINGS })
  let dialog: Dialog | null = null
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
    } catch (e) {
      msg.error(i18n?.saveError || '保存失败')
      console.error('[SiReader]', e)
    }
  }
  // 打开设置对话框
  const open = async () => {
    if (dialog) dialog.destroy()
    await load()
    dialog = new Dialog({
      title: i18n?.settingsTitle || '设置',
      content: `
        <div class="fn__flex" style="height:400px">
          <ul class="b3-list b3-list--background" style="width:140px;padding:8px;border-right:1px solid var(--b3-border-color);flex-shrink:0">
            <li class="b3-list-item b3-list-item--focus" data-group="general" style="cursor:pointer">
              <span class="b3-list-item__text">⚙️ ${i18n?.tabGeneral || '通用'}</span>
            </li>
            <li class="b3-list-item" data-group="reader" style="cursor:pointer">
              <span class="b3-list-item__text">📚 ${i18n?.tabReader || '阅读'}</span>
            </li>
            <li class="b3-list-item" data-group="theme" style="cursor:pointer">
              <span class="b3-list-item__text">🎨 ${i18n?.tabTheme || '主题'}</span>
            </li>
            <li class="b3-list-item" data-group="annotation" style="cursor:pointer">
              <span class="b3-list-item__text">📝 ${i18n?.tabAnnotation || '标注'}</span>
            </li>
            <li class="b3-list-item" data-group="page" style="cursor:pointer">
              <span class="b3-list-item__text">📄 ${i18n?.tabPage || '页面'}</span>
            </li>
          </ul>
          
          <div class="fn__flex-1" style="overflow-y:auto;padding:16px 20px">
            <div class="setting-group" data-group="general">
              ${item(i18n?.openMode || '打开方式', i18n?.openModeDesc || '选择打开书籍时的显示位置', select('openMode', options({ newTab: i18n?.newTab || '新标签', rightTab: i18n?.rightTab || '右侧标签', bottomTab: i18n?.bottomTab || '底部标签', newWindow: i18n?.newWindow || '新窗口' })))}
              ${item(i18n?.tocPosition || '目录位置', i18n?.tocPositionDesc || '选择目录打开位置', select('tocPosition', options({ left: i18n?.left || '左侧', right: i18n?.right || '右侧' })))}
            </div>
            
            <div class="setting-group" data-group="annotation" style="display:none">
              <div class="b3-label" style="margin-bottom:16px">
                <div class="b3-label__text" style="font-weight:500;margin-bottom:8px">${i18n?.annotationMode || '标注文档创建方式'}</div>
                <select id="setting-annotationMode" class="b3-select fn__block">
                  <option value="notebook">${i18n?.notebook || '笔记本下创建文档'}</option>
                  <option value="document">${i18n?.document || '指定文档下创建子文档'}</option>
                </select>
              </div>
              
              <div id="notebook-mode" style="display:none">
                <div class="b3-label" style="margin-bottom:16px">
                  <div class="b3-label__text" style="font-weight:500;margin-bottom:4px">${i18n?.targetNotebook || '目标笔记本'}</div>
                  <div class="b3-label__text" style="font-size:12px;opacity:0.7;margin-bottom:8px">${i18n?.targetNotebookDesc || '在此笔记本下为每本书创建标注文档'}</div>
                  <select id="setting-notebookId" class="b3-select fn__block"><option value="">${i18n?.notSelected || '未选择'}</option></select>
                </div>
              </div>
              
              <div id="document-mode" style="display:none">
                <div class="b3-label" style="margin-bottom:12px">
                  <div class="b3-label__text" style="font-weight:500;margin-bottom:4px">${i18n?.searchDoc || '搜索文档'}</div>
                  <div class="b3-label__text" style="font-size:12px;opacity:0.7;margin-bottom:8px" id="selected-doc-hint">${i18n?.searchDocDesc || '输入关键字搜索文档'}</div>
                  <input id="setting-docSearch" type="text" class="b3-text-field fn__block" placeholder="${i18n?.searchPlaceholder || '按回车搜索'}">
                </div>
                <div class="b3-label" style="margin-bottom:16px" id="doc-results" style="display:none">
                  <div class="b3-label__text" style="font-weight:500;margin-bottom:8px">${i18n?.selectDoc || '选择文档'}</div>
                  <select id="setting-parentDoc" class="b3-select fn__block"></select>
                </div>
              </div>
              
              <div style="padding:12px;background:var(--b3-theme-background-light);border-radius:6px;font-size:12px;line-height:1.6">
                💡 <b>${i18n?.usageTitle || '使用说明'}</b><br>
                • ${i18n?.usageColors || '7种颜色：R🔴红 O🟠橙 Y🟡黄 G🟢绿 P🩷粉 B🔵蓝 V🟣紫'}<br>
                • ${i18n?.usageFormat || '标注格式：<code>- R [文本](链接)</code>'}<br>
                • ${i18n?.usageNotebook || '笔记本模式：为每本书自动创建独立文档'}<br>
                • ${i18n?.usageDocument || '文档模式：在指定文档下创建子文档管理'}
              </div>
            </div>
            
            <div class="setting-group" data-group="reader" style="display:none">
              ${item(i18n?.pageTurnMode || '翻页方式', i18n?.pageTurnModeDesc || '选择如何进行页面翻转', select('pageTurnMode', options({ click: i18n?.click || '点击翻页', toolbar: i18n?.toolbar || '仅工具栏' })))}
              ${item(i18n?.pageAnimation || '翻页动画', i18n?.pageAnimationDesc || '选择翻页时的动画效果', select('pageAnimation', options({ slide: i18n?.slide || '平移', fade: i18n?.fade || '淡入淡出', flip: i18n?.flip || '仿真翻页', scroll: i18n?.scroll || '滚动', vertical: i18n?.vertical || '上下翻页', none: i18n?.none || '无动画' })))}
              ${item(i18n?.displayMode || '显示模式', i18n?.displayModeDesc || '选择单页或双页显示', select('columnMode', options({ single: i18n?.single || '单页', double: i18n?.double || '双页' })))}
            </div>
            
            <div class="setting-group" data-group="theme" style="display:none">
              ${item(i18n?.presetTheme || '预设主题', i18n?.presetThemeDesc || '选择预设的配色方案', select('theme', `${Object.entries(PRESET_THEMES).map(([k, v]) => `<option value="${k}">${i18n?.[v.name] || v.name}</option>`).join('')}<option value="custom">${i18n?.custom || '自定义'}</option>`))}
              <div id="custom-theme" style="display:none">
                ${item(i18n?.textColor || '文字颜色', i18n?.textColorDesc || '自定义文字颜色', '<input id="setting-color" type="color" class="b3-text-field" style="width:60px;height:32px;padding:2px;cursor:pointer">')}
                ${item(i18n?.bgColor || '背景颜色', i18n?.bgColorDesc || '自定义背景颜色', '<input id="setting-bg" type="color" class="b3-text-field" style="width:60px;height:32px;padding:2px;cursor:pointer">')}
                <div class="b3-label" style="margin-bottom:20px">
                  <div class="b3-label__text" style="font-weight:500;margin-bottom:4px">${i18n?.bgImage || '背景图片'}</div>
                  <div class="b3-label__text" style="font-size:12px;opacity:0.7;margin-bottom:8px">${i18n?.bgImageDesc || '输入图片URL（留空使用纯色）'}</div>
                  <input id="setting-bgImg" type="text" class="b3-text-field fn__block" placeholder="https://example.com/image.jpg">
                </div>
              </div>
              <div style="margin-top:16px;padding:12px;background:var(--b3-theme-background-light);border-radius:6px">
                <div style="font-size:12px;opacity:0.7;margin-bottom:8px">${i18n?.previewLabel || '预览效果：'}</div>
                <div id="theme-preview">${i18n?.previewText || '春江潮水连海平，海上明月共潮生。<br>滟滟随波千万里，何处春江无月明。'}</div>
              </div>
            </div>
            
            <div class="setting-group" data-group="page" style="display:none">
              <div style="margin-bottom:24px">
                <div style="font-weight:600;margin-bottom:12px;color:var(--b3-theme-primary)">📝 ${i18n?.textSettings || '文本设置'}</div>
                ${item(i18n?.fontFamily || '字体', '', `
                  <select id="setting-fontFamily" class="b3-select" style="width:160px">
                    <option value="inherit">${i18n?.fontDefault || '默认'}</option>
                    <option value="serif">${i18n?.fontSerif || '衬线体'}</option>
                    <option value="sans-serif">${i18n?.fontSans || '无衬线体'}</option>
                    <option value="'Microsoft YaHei', sans-serif">${i18n?.fontYahei || '微软雅黑'}</option>
                    <option value="'SimSun', serif">${i18n?.fontSong || '宋体'}</option>
                    <option value="'KaiTi', serif">${i18n?.fontKai || '楷体'}</option>
                  </select>
                `)}
                ${item(i18n?.fontSize || '字号', '', slider('fontSize', 12, 32, 1, 'px'))}
                ${item(i18n?.letterSpacing || '字距', '', slider('letterSpacing', 0, 0.2, 0.01, 'em'))}
              </div>
              
              <div style="margin-bottom:24px">
                <div style="font-weight:600;margin-bottom:12px;color:var(--b3-theme-primary)">📐 ${i18n?.paragraphSettings || '段落设置'}</div>
                ${item(i18n?.lineHeight || '行距', '', slider('lineHeight', 1.0, 3.0, 0.1, ''))}
                ${item(i18n?.paragraphSpacing || '段距', '', slider('paragraphSpacing', 0, 2, 0.1, 'em'))}
                ${item(i18n?.textIndent || '首行缩进', '', slider('textIndent', 0, 4, 0.5, 'em'))}
              </div>
              
              <div style="margin-bottom:20px">
                <div style="font-weight:600;margin-bottom:12px;color:var(--b3-theme-primary)">📏 ${i18n?.pageSettings || '页面设置'}</div>
                ${item(i18n?.marginHorizontal || '左右边距', '', slider('marginHorizontal', 0, 100, 5, 'px'))}
                ${item(i18n?.marginVertical || '上下边距', '', slider('marginVertical', 0, 80, 5, 'px'))}
                <div class="b3-label">
                  <div class="fn__flex" style="align-items:center;justify-content:space-between">
                    <div class="fn__flex-1">
                      <div class="b3-label__text" style="font-weight:500">${i18n?.continuousScroll || '连续滚动'}</div>
                      <div class="b3-label__text" style="font-size:12px;opacity:0.7">${i18n?.continuousScrollDesc || '启用后页面连续滚动，禁用后分页显示'}</div>
                    </div>
                    <span class="fn__space" style="width:16px"></span>
                    <input type="checkbox" id="setting-continuousScroll" class="b3-switch">
                  </div>
                </div>
              </div>
              
              <div style="padding-top:16px;border-top:1px solid var(--b3-border-color)">
                <button id="reset-page-settings" class="b3-button b3-button--outline" style="width:100%">
                  🔄 ${i18n?.resetToDefault || '恢复默认设置'}
                </button>
              </div>
            </div>
          </div>
        </div>
      `,
      width: '560px',
      height: '440px',
      destroyCallback: () => dialog = null
    })
    
    // 查询辅助函数
    const $ = <T = HTMLElement>(sel: string) => dialog.element.querySelector(sel) as T
    const $$ = (sel: string) => dialog.element.querySelectorAll(sel)
    
    // ===== 分组导航 =====
    const groups = $$('.b3-list-item')
    const contents = $$('.setting-group')
    groups.forEach(g => g.addEventListener('click', () => {
      groups.forEach(x => x.classList.remove('b3-list-item--focus'))
      g.classList.add('b3-list-item--focus')
      const name = g.getAttribute('data-group')
      contents.forEach(c => ((c as HTMLElement).style.display = c.getAttribute('data-group') === name ? 'block' : 'none'))
    }))
    
    // 通用选择器绑定
    const bindSelect = (key: keyof ReaderSettings) => {
      const el = $<HTMLSelectElement>(`#setting-${key}`)
      if (el) el.value = settings.value[key] as string, el.onchange = () => ((settings.value[key] as any) = el.value, save())
    }
    ;(['openMode', 'tocPosition', 'pageTurnMode', 'pageAnimation', 'columnMode'] as const).forEach(bindSelect)
    
    // 标注模式
    const modeSelect = $<HTMLSelectElement>('#setting-annotationMode')
    const [notebookMode, documentMode] = ['#notebook-mode', '#document-mode'].map(s => $<HTMLElement>(s))
    const updateMode = () => ((m => (notebookMode.style.display = m === 'notebook' ? 'block' : 'none', documentMode.style.display = m === 'document' ? 'block' : 'none'))(modeSelect.value))
    modeSelect.value = settings.value.annotationMode, updateMode()
    modeSelect.onchange = () => (settings.value.annotationMode = modeSelect.value as any, updateMode(), save())
    
    // 笔记本与文档选择
    const notebookSelect = $<HTMLSelectElement>('#setting-notebookId')
    const [docSearch, docResults, parentDocSelect, docHint] = ['#setting-docSearch', '#doc-results', '#setting-parentDoc', '#selected-doc-hint'].map(s => $(s)) as [HTMLInputElement, HTMLElement, HTMLSelectElement, HTMLElement]
    import('../core/epubDoc').then(({ notebook, document }) => (
      notebookSelect && notebook.initSelect(notebookSelect, settings.value.notebookId || '', id => (settings.value.notebookId = id, save()), i18n),
      docSearch && document.initSearchSelect(docSearch, parentDocSelect, docResults, docHint, settings.value.parentDoc, doc => (settings.value.parentDoc = doc, save()), i18n)
    )).catch(() => {})
    
    // 主题配置
    const theme = $<HTMLSelectElement>('#setting-theme'), custom = $('#custom-theme')
    const [color, bg, bgImg] = ['#setting-color', '#setting-bg', '#setting-bgImg'].map(s => $<HTMLInputElement>(s))
    const preview = $('#theme-preview')
    const refresh = () => (applyTheme(preview, settings.value), preview.style.cssText += 'padding:16px;border-radius:4px;font-size:14px;line-height:1.8')
    const updateCustom = () => (settings.value.customTheme = { name: '自定义', color: color.value, bg: bg.value, bgImg: bgImg.value || undefined }, refresh(), save())
    
    theme.value = settings.value.theme, custom.style.display = settings.value.theme === 'custom' ? 'block' : 'none'
    theme.onchange = () => (settings.value.theme = theme.value, custom.style.display = theme.value === 'custom' ? 'block' : 'none', refresh(), save())
    color.value = settings.value.customTheme.color, bg.value = settings.value.customTheme.bg, bgImg.value = settings.value.customTheme.bgImg || ''
    color.onchange = bg.onchange = updateCustom, bgImg.onblur = updateCustom
    refresh()
    
    // 页面设置绑定
    const bindSlider = (key: string, category: 'textSettings' | 'paragraphSettings' | 'pageSettings', unit = '') => {
      const slider = $<HTMLInputElement>(`#setting-${key}`)
      const display = $<HTMLSpanElement>(`#${key}-value`)
      if (!slider || !display) return
      
      const cfg = settings.value[category] as Record<string, number>
      slider.value = String(cfg[key])
      display.textContent = `${cfg[key]}${unit}`
      
      slider.oninput = () => {
        const newVal = key === 'fontSize' || key === 'marginHorizontal' || key === 'marginVertical' 
          ? Number.parseInt(slider.value) 
          : Number.parseFloat(slider.value)
        cfg[key] = newVal
        display.textContent = `${slider.value}${unit}`
        window.dispatchEvent(new CustomEvent('sireaderSettingsUpdated', { detail: settings.value }))
        save()
      }
    }
    
    // 绑定文本设置
    const fontFamily = $<HTMLSelectElement>('#setting-fontFamily')
    if (fontFamily) {
      fontFamily.value = settings.value.textSettings.fontFamily
      fontFamily.onchange = () => {
        settings.value.textSettings.fontFamily = fontFamily.value
        window.dispatchEvent(new CustomEvent('sireaderSettingsUpdated', { detail: settings.value }))
        save()
      }
    }
    bindSlider('fontSize', 'textSettings', 'px')
    bindSlider('letterSpacing', 'textSettings', 'em')
    
    // 绑定段落设置
    bindSlider('lineHeight', 'paragraphSettings')
    bindSlider('paragraphSpacing', 'paragraphSettings', 'em')
    bindSlider('textIndent', 'paragraphSettings', 'em')
    
    // 绑定页面设置
    bindSlider('marginHorizontal', 'pageSettings', 'px')
    bindSlider('marginVertical', 'pageSettings', 'px')
    
    const scrollCheck = $<HTMLInputElement>('#setting-continuousScroll')
    if (scrollCheck) {
      scrollCheck.checked = settings.value.pageSettings.continuousScroll
      scrollCheck.onchange = () => {
        settings.value.pageSettings.continuousScroll = scrollCheck.checked
        msg.success(i18n?.reloadRequired || '设置已保存，重新打开书籍后生效')
        save()
      }
    }
    
    // 重置按钮
    const resetBtn = $('#reset-page-settings')
    if (resetBtn) {
      resetBtn.onclick = () => {
        settings.value.textSettings = { ...DEFAULT_SETTINGS.textSettings }
        settings.value.paragraphSettings = { ...DEFAULT_SETTINGS.paragraphSettings }
        settings.value.pageSettings = { ...DEFAULT_SETTINGS.pageSettings }
        save()
        dialog?.destroy()
        setTimeout(open, 100)
      }
    }
  }

  load()
  return { settings, open }
}
