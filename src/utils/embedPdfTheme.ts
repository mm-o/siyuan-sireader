import { PRESET_THEMES, type ReadTheme } from '@/composables/useSetting'
import type { ThemeConfig } from '@embedpdf/viewer'

const cssVar = (name: string, fallback = '') => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
// 主题色可能写成 var(--b3-…)，取一次真实颜色即可。
const resolveColor = (value = '') => value.startsWith('var(') ? cssVar(value.slice(4, -1)) : value
// 背景色够暗就是深色主题，不再维护主题名清单。
const luminance = (color = '') => {
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1] || ''
  const rgb = hex.length === 3 ? [...hex].map(char => Number.parseInt(char + char, 16)) : [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16))
  return hex ? (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 : -1
}

// PDF 的配色只跟设置里的阅读主题走，一次算出两件事：EmbedPDF 的 theme 令牌，和页面纸的样式。
// 令牌管它的界面（画布、正文、阴影、圆角）；页面纸是位图、图元自带隔离层，只能在页面容器上
// 加 `!important` 背景 + 混合/反色：浅色正片叠底压到画布色，深色反色并补回色相。
export const buildEmbedPdfLook = (theme = '', customTheme?: ReadTheme) => {
  const read: ReadTheme = (theme === 'custom' ? customTheme : PRESET_THEMES[theme]) || ({} as ReadTheme)
  const bg = read.bg || '#ffffff', color = read.color || '#202124'
  const dark = luminance(resolveColor(bg)) < 128
  const themeConfig: ThemeConfig = {
    preference: dark ? 'dark' : 'light',
    tokens: {
      canvas: bg,
      'page-background': bg,
      surface: bg,
      'surface-raised': bg,
      text: color,
      'page-shadow': dark ? '0 4px 14px rgb(0 0 0 / 0.45)' : '0 6px 18px rgb(0 0 0 / 0.18)',
      radius: cssVar('--b3-border-radius', '6px'),
    },
  }
  const paint = dark ? 'filter:invert(1) hue-rotate(180deg)' : 'mix-blend-mode:multiply'
  const pageCss = `[style*="--epdf-page-background"]{background:${bg} !important;${paint}}`
  return { theme: themeConfig, pageCss }
}
