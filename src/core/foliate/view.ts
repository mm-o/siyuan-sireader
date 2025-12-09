/**
 * Foliate View 管理器
 * 封装 foliate-view 的创建和配置
 */

import type { FoliateView, Location } from './types'
import type { ReaderSettings } from '@/composables/useSetting'

// 导入 foliate-js view（确保已加载）
import 'foliate-js/view.js'

/**
 * 创建 Foliate View
 */
export function createFoliateView(container: HTMLElement): FoliateView {
  const view = document.createElement('foliate-view') as FoliateView
  view.style.cssText = 'width:100%;height:100%'
  view.setAttribute('persist', 'false')
  container.appendChild(view)
  return view
}

/**
 * 配置 View 样式和布局
 */
export function configureView(view: FoliateView, settings: ReaderSettings) {
  const renderer = view.renderer
  if (!renderer) return

  const { columnMode, pageAnimation, layoutSettings, visualSettings } = settings
  const isScroll = pageAnimation === 'scroll'

  // 流式布局
  renderer.setAttribute('flow', isScroll ? 'scrolled' : 'paginated')

  // 列数（单页/双页）
  renderer.setAttribute('max-column-count', columnMode === 'double' ? '2' : '1')

  // 动画
  if (!isScroll && pageAnimation === 'slide') {
    renderer.setAttribute('animated', '')
  } else {
    renderer.removeAttribute('animated')
  }

  // 间距
  renderer.setAttribute('gap', `${layoutSettings.gap || 5}%`)

  // 最大宽度（默认 800px）
  renderer.setAttribute('max-inline-size', '800px')

  // 最大高度
  if (layoutSettings.maxBlockSize > 0) {
    renderer.setAttribute('max-block-size', `${layoutSettings.maxBlockSize}px`)
  } else {
    renderer.removeAttribute('max-block-size')
  }

  // 页眉页脚边距
  if (layoutSettings.headerFooterMargin > 0) {
    renderer.setAttribute('margin', `${layoutSettings.headerFooterMargin}px`)
  } else {
    renderer.removeAttribute('margin')
  }

  // 视觉滤镜
  applyVisualFilter(view, visualSettings)
}

/**
 * 应用视觉滤镜
 */
function applyVisualFilter(view: FoliateView, settings: ReaderSettings['visualSettings']) {
  // 移除旧样式
  document.getElementById('sireader-visual-filter')?.remove()

  const filters: string[] = []

  if (settings.brightness !== 1) {
    filters.push(`brightness(${settings.brightness})`)
  }
  if (settings.contrast !== 1) {
    filters.push(`contrast(${settings.contrast})`)
  }
  if (settings.sepia > 0) {
    filters.push(`sepia(${settings.sepia})`)
  }
  if (settings.saturate !== 1) {
    filters.push(`saturate(${settings.saturate})`)
  }
  if (settings.invert) {
    filters.push('invert(1) hue-rotate(180deg)')
  }

  if (filters.length > 0) {
    const style = document.createElement('style')
    style.id = 'sireader-visual-filter'
    style.textContent = `foliate-view::part(filter) { filter: ${filters.join(' ')}; }`
    document.head.appendChild(style)
  }
}

/**
 * 应用自定义 CSS
 */
export function applyCustomCSS(view: FoliateView, settings: ReaderSettings) {
  const { textSettings, paragraphSettings, layoutSettings } = settings

  const css = `
    @namespace epub "http://www.idpf.org/2007/ops";
    
    html {
      color-scheme: light dark;
    }
    
    body {
      font-family: ${textSettings.fontFamily || 'inherit'} !important;
      font-size: ${textSettings.fontSize}px !important;
      letter-spacing: ${textSettings.letterSpacing}em !important;
    }
    
    p, li, blockquote, dd {
      line-height: ${paragraphSettings.lineHeight} !important;
      text-align: start;
      text-indent: ${paragraphSettings.textIndent}em !important;
      margin-bottom: ${paragraphSettings.paragraphSpacing}em !important;
    }
    
    /* 防止 align 属性被覆盖 */
    [align="left"] { text-align: left !important; }
    [align="right"] { text-align: right !important; }
    [align="center"] { text-align: center !important; }
    [align="justify"] { text-align: justify !important; }
    
    pre {
      white-space: pre-wrap !important;
    }
  `

  view.renderer?.setStyles?.(css)
}

/**
 * 导航辅助函数
 */
export async function goToLocation(view: FoliateView, location: Location) {
  if (location.cfi) {
    await view.goTo(location.cfi)
  } else if (location.href) {
    await view.goTo(location.href)
  } else if (location.index !== undefined) {
    await view.goTo(location.index)
  } else if (location.fraction !== undefined) {
    await view.goToFraction(location.fraction)
  }
}

/**
 * 获取当前位置
 */
export function getCurrentLocation(view: FoliateView): Location | null {
  if (!view.renderer) return null

  try {
    const loc = view.renderer.location
    if (!loc) return null

    return {
      index: loc.index ?? 0,
      fraction: loc.fraction ?? 0,
      cfi: view.lastLocation?.cfi
    }
  } catch (e) {
    console.error('[FoliateView] Failed to get location:', e)
    return null
  }
}

/**
 * 销毁 View
 */
export function destroyView(view: FoliateView) {
  try {
    view.renderer?.destroy?.()
    view.remove()
  } catch (e) {
    console.error('[FoliateView] Failed to destroy:', e)
  }
}
