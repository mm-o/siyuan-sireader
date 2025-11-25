// ========================================
// EPUB 阅读器设置管理模块
// 职责：配置持久化、UI交互、主题应用
// ========================================

import { ref } from 'vue'
import { Dialog, showMessage } from 'siyuan'
import type { Plugin } from 'siyuan'
import type { DocInfo } from '@/core/epubDoc'

// ===== 类型定义 =====
export type PageTurnMode = 'click' | 'toolbar'
export type PageAnimation = 'slide' | 'fade' | 'flip' | 'scroll' | 'vertical' | 'none'
export type ColumnMode = 'single' | 'double'
export type TocPosition = 'dialog' | 'left' | 'right'
export interface ReadTheme { name: string; color: string; bg: string; bgImg?: string }

export interface ReaderSettings {
  enabled: boolean
  openMode: 'newTab' | 'rightTab' | 'bottomTab' | 'newWindow'
  pageTurnMode: PageTurnMode
  pageAnimation: PageAnimation
  columnMode: ColumnMode
  tocPosition: TocPosition
  theme: string
  customTheme: ReadTheme
  annotationMode: 'notebook' | 'document'
  notebookId?: string
  parentDoc?: DocInfo
}

// ===== 主题配置 =====
export const PRESET_THEMES: Record<string, ReadTheme> = {
  default: { name: '默认', color: '#202124', bg: '#ffffff' },
  almond: { name: '杏仁黄', color: '#414441', bg: '#FAF9DE' },
  autumn: { name: '秋叶褐', color: '#414441', bg: '#FFF2E2' },
  green: { name: '青草绿', color: '#414441', bg: '#E3EDCD' },
  blue: { name: '海天蓝', color: '#414441', bg: '#DCE2F1' },
  night: { name: '夜间', color: '#fff6e6', bg: '#415062' },
  dark: { name: '暗黑', color: '#d5cecd', bg: '#414441' },
  gold: { name: '赤金', color: '#b58931', bg: '#081010' },
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

// ===== 默认配置 =====
const DEFAULT_SETTINGS: ReaderSettings = {
  enabled: true,
  openMode: 'newTab',
  pageTurnMode: 'click',
  pageAnimation: 'slide',
  columnMode: 'single',
  tocPosition: 'left',
  theme: 'default',
  customTheme: { name: '自定义', color: '#202124', bg: '#ffffff' },
  annotationMode: 'notebook',
  notebookId: '',
  parentDoc: undefined,
}

// ===== 常量配置 =====
const DIALOG_SIZE = { width: 560, height: 460 }
const DEBOUNCE_DELAY = 800

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

// 选项生成器
const options = (items: Record<string, string>) => Object.entries(items).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')

// ===== 设置管理 Composable =====
export function useSetting(plugin: Plugin) {
  const settings = ref<ReaderSettings>({ ...DEFAULT_SETTINGS })
  let dialog: Dialog | null = null

  // 加载配置
  const load = async () => {
    try {
      const data = await plugin.loadData('config.json')
      if (data?.settings) settings.value = { ...DEFAULT_SETTINGS, ...data.settings }
    } catch (e) {
      console.error('[MReader] 加载设置失败:', e)
    }
  }

  // 保存配置
  const save = async (msg = '设置已保存') => {
    try {
      await plugin.saveData('config.json', { settings: settings.value })
      window.dispatchEvent(new CustomEvent('mreaderSettingsUpdated', { detail: settings.value }))
      showMessage(msg, 2000, 'info')
    } catch (e) {
      console.error('[MReader] 保存设置失败:', e)
    }
  }

  // 打开设置对话框
  const open = () => {
    if (dialog) return dialog.destroy(), dialog = null
    const btn = document.querySelector('[aria-label="设置"]') as HTMLElement
    dialog = new Dialog({
      title: 'M阅读 - 设置',
      content: `
        <div class="fn__flex" style="height:400px">
          <ul class="b3-list b3-list--background" style="width:140px;padding:8px;border-right:1px solid var(--b3-border-color);flex-shrink:0">
            <li class="b3-list-item b3-list-item--focus" data-group="general" style="cursor:pointer">
              <span class="b3-list-item__text">⚙️ 通用</span>
            </li>
            <li class="b3-list-item" data-group="reader" style="cursor:pointer">
              <span class="b3-list-item__text">📖 阅读</span>
            </li>
            <li class="b3-list-item" data-group="theme" style="cursor:pointer">
              <span class="b3-list-item__text">🎨 主题</span>
            </li>
            <li class="b3-list-item" data-group="annotation" style="cursor:pointer">
              <span class="b3-list-item__text">📝 标注</span>
            </li>
          </ul>
          
          <div class="fn__flex-1" style="overflow-y:auto;padding:16px 20px">
            <div class="setting-group" data-group="general">
              ${item('打开方式', '选择打开书籍时的显示位置', select('openMode', options({ newTab: '新标签', rightTab: '右侧标签', bottomTab: '底部标签', newWindow: '新窗口' })))}
              ${item('目录位置', '选择目录打开方式', select('tocPosition', options({ dialog: '窗口', left: '左侧', right: '右侧' })))}
            </div>
            
            <div class="setting-group" data-group="annotation" style="display:none">
              <div class="b3-label" style="margin-bottom:16px">
                <div class="b3-label__text" style="font-weight:500;margin-bottom:8px">标注文档创建方式</div>
                <select id="setting-annotationMode" class="b3-select fn__block">
                  <option value="notebook">笔记本下创建文档</option>
                  <option value="document">指定文档下创建子文档</option>
                </select>
              </div>
              
              <div id="notebook-mode" style="display:none">
                <div class="b3-label" style="margin-bottom:16px">
                  <div class="b3-label__text" style="font-weight:500;margin-bottom:4px">目标笔记本</div>
                  <div class="b3-label__text" style="font-size:12px;opacity:0.7;margin-bottom:8px">在此笔记本下为每本书创建标注文档</div>
                  <select id="setting-notebookId" class="b3-select fn__block"><option value="">未选择</option></select>
                </div>
              </div>
              
              <div id="document-mode" style="display:none">
                <div class="b3-label" style="margin-bottom:12px">
                  <div class="b3-label__text" style="font-weight:500;margin-bottom:4px">搜索文档</div>
                  <div class="b3-label__text" style="font-size:12px;opacity:0.7;margin-bottom:8px" id="selected-doc-hint">输入关键字搜索文档</div>
                  <input id="setting-docSearch" type="text" class="b3-text-field fn__block" placeholder="按回车搜索">
                </div>
                <div class="b3-label" style="margin-bottom:16px" id="doc-results" style="display:none">
                  <div class="b3-label__text" style="font-weight:500;margin-bottom:8px">选择文档</div>
                  <select id="setting-parentDoc" class="b3-select fn__block"></select>
                </div>
              </div>
              
              <div style="padding:12px;background:var(--b3-theme-background-light);border-radius:6px;font-size:12px;line-height:1.6">
                💡 <b>使用说明</b><br>
                • 7种颜色：R🔴红 O🟠橙 Y🟡黄 G🟢绿 P🩷粉 B🔵蓝 V🟣紫<br>
                • 标注格式：<code>- R [文本](链接)</code><br>
                • 笔记本模式：为每本书自动创建独立文档<br>
                • 文档模式：在指定文档下创建子文档管理
              </div>
            </div>
            
            <div class="setting-group" data-group="reader" style="display:none">
              ${item('翻页方式', '选择如何进行页面翻转', select('pageTurnMode', options({ click: '点击翻页', toolbar: '仅工具栏' })))}
              ${item('翻页动画', '选择翻页时的动画效果', select('pageAnimation', options({ slide: '平移', fade: '淡入淡出', flip: '仿真翻页', scroll: '滚动', vertical: '上下翻页', none: '无动画' })))}
              ${item('显示模式', '选择单页或双页显示', select('columnMode', options({ single: '单页', double: '双页' })))}
            </div>
            
            <div class="setting-group" data-group="theme" style="display:none">
              ${item('预设主题', '选择预设的配色方案', select('theme', `${Object.entries(PRESET_THEMES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}<option value="custom">自定义</option>`))}
              <div id="custom-theme" style="display:none">
                ${item('文字颜色', '自定义文字颜色', '<input id="setting-color" type="color" class="b3-text-field" style="width:60px;height:32px;padding:2px;cursor:pointer">')}
                ${item('背景颜色', '自定义背景颜色', '<input id="setting-bg" type="color" class="b3-text-field" style="width:60px;height:32px;padding:2px;cursor:pointer">')}
                <div class="b3-label" style="margin-bottom:20px">
                  <div class="b3-label__text" style="font-weight:500;margin-bottom:4px">背景图片</div>
                  <div class="b3-label__text" style="font-size:12px;opacity:0.7;margin-bottom:8px">输入图片URL（留空使用纯色）</div>
                  <input id="setting-bgImg" type="text" class="b3-text-field fn__block" placeholder="https://example.com/image.jpg">
                </div>
              </div>
              <div style="margin-top:16px;padding:12px;background:var(--b3-theme-background-light);border-radius:6px">
                <div style="font-size:12px;opacity:0.7;margin-bottom:8px">预览效果：</div>
                <div id="theme-preview">春江潮水连海平，海上明月共潮生。<br>滟滟随波千万里，何处春江无月明。</div>
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
    
    // 定位对话框（按钮附近）
    if (btn) {
      const r = btn.getBoundingClientRect()
      const container = $<HTMLElement>('.b3-dialog__container')
      const { width: w, height: h } = DIALOG_SIZE
      container.style.left = `${Math.max(10, Math.min(r.left, innerWidth - w - 10))}px`
      container.style.top = `${Math.max(10, Math.min(r.top - h, innerHeight - h - 10))}px`
      $('.b3-dialog')?.setAttribute('style', 'display:block')
    }
    
    // ===== 分组导航 =====
    const groups = $$('.b3-list-item')
    const contents = $$('.setting-group')
    groups.forEach(g => g.addEventListener('click', () => {
      groups.forEach(x => x.classList.remove('b3-list-item--focus'))
      g.classList.add('b3-list-item--focus')
      const name = g.getAttribute('data-group')
      contents.forEach(c => ((c as HTMLElement).style.display = c.getAttribute('data-group') === name ? 'block' : 'none'))
    }))
    
    // ===== 通用选择器绑定 =====
    ;(['openMode', 'tocPosition', 'pageTurnMode', 'pageAnimation', 'columnMode'] as const).forEach(key => {
      const el = $<HTMLSelectElement>(`#setting-${key}`)
      if (el) {
        el.value = settings.value[key] as string
        el.addEventListener('change', () => ((settings.value[key] as any) = el.value, save()))
      }
    })
    
    // ===== 标注模式切换 =====
    const modeSelect = $<HTMLSelectElement>('#setting-annotationMode')
    const [notebookMode, documentMode] = ['#notebook-mode', '#document-mode'].map(s => $<HTMLElement>(s))
    const updateMode = () => {
      const mode = modeSelect.value as 'notebook' | 'document'
      notebookMode.style.display = mode === 'notebook' ? 'block' : 'none'
      documentMode.style.display = mode === 'document' ? 'block' : 'none'
    }
    modeSelect.value = settings.value.annotationMode
    updateMode()
    modeSelect.addEventListener('change', () => {
      settings.value.annotationMode = modeSelect.value as 'notebook' | 'document'
      updateMode()
      save()
    })
    
    // ===== 笔记本选择器（委托至epubDoc） =====
    const notebookSelect = $<HTMLSelectElement>('#setting-notebookId')
    notebookSelect && import('../core/epubDoc').then(({ notebook }) => 
      notebook.initSelect(notebookSelect, settings.value.notebookId || '', id => {
        settings.value.notebookId = id
        save()
      })
    ).catch(() => {})
    
    // ===== 文档搜索（委托至epubDoc） =====
    const [docSearch, docResults, parentDocSelect, docHint] = ['#setting-docSearch', '#doc-results', '#setting-parentDoc', '#selected-doc-hint']
      .map(s => $(s)) as [HTMLInputElement, HTMLElement, HTMLSelectElement, HTMLElement]
    
    docSearch && docResults && parentDocSelect && docHint && import('../core/epubDoc').then(({ document }) =>
      document.initSearchSelect(docSearch, parentDocSelect, docResults, docHint, settings.value.parentDoc, doc => {
        settings.value.parentDoc = doc
        save()
      })
    ).catch(() => {})
    
    // ===== 主题配置 =====
    const theme = $<HTMLSelectElement>('#setting-theme')
    const custom = $('#custom-theme')
    const [color, bg, bgImg] = ['#setting-color', '#setting-bg', '#setting-bgImg'].map(s => $<HTMLInputElement>(s))
    const preview = $('#theme-preview')
    
    // 刷新预览
    const refresh = () => {
      applyTheme(preview, settings.value)
      preview.style.cssText += 'padding:16px;border-radius:4px;font-size:14px;line-height:1.8'
    }
    
    // 初始化主题选择
    theme.value = settings.value.theme
    custom.style.display = settings.value.theme === 'custom' ? 'block' : 'none'
    theme.addEventListener('change', () => {
      settings.value.theme = theme.value
      custom.style.display = theme.value === 'custom' ? 'block' : 'none'
      refresh()
      save()
    })
    
    // 初始化自定义主题
    color.value = settings.value.customTheme.color
    bg.value = settings.value.customTheme.bg
    bgImg.value = settings.value.customTheme.bgImg || ''
    
    // 自定义主题更新（防抖）
    let timer: number
    const updateCustom = (immediate = false) => {
      settings.value.customTheme = { 
        name: '自定义', 
        color: color.value, 
        bg: bg.value, 
        bgImg: bgImg.value || undefined 
      }
      refresh()
      clearTimeout(timer)
      immediate ? save() : (timer = window.setTimeout(save, DEBOUNCE_DELAY))
    }
    
    // 绑定事件（实时预览 + 立即保存）
    const bind = (el: HTMLInputElement, endEvent: string) => {
      el.addEventListener('input', () => updateCustom())
      el.addEventListener(endEvent, () => updateCustom(true))
    }
    bind(color, 'change')
    bind(bg, 'change')
    bind(bgImg, 'blur')
    
    refresh()
  }

  load()

  return { settings, open, save, load }
}
