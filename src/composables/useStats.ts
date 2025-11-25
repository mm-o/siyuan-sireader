import { ref } from 'vue'
import type { Plugin } from 'siyuan'

export function useStats(plugin: Plugin) {
  const i18n = plugin.i18n as any
  const stats = ref({
    readingTime: 0,
    todayReadingTime: 0,
    sessionStartTime: Date.now(),
  })

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`
  }

  const load = async () => {
    try {
      const data = await plugin.loadData('stats.json')
      if (data) stats.value = { ...stats.value, ...data }
    } catch (e) {
      console.error(`${i18n?.statsLoadError || '加载统计数据失败'}:`, e)
    }
  }

  const save = async () => {
    try {
      await plugin.saveData('stats.json', stats.value)
    } catch (e) {
      console.error(`${i18n?.statsSaveError || '保存统计数据失败'}:`, e)
    }
  }

  let popup: HTMLElement | null = null

  const open = (event: MouseEvent) => {
    // 关闭已存在的浮窗
    if (popup) {
      popup.remove()
      popup = null
      return
    }

    const currentSession = Math.floor((Date.now() - stats.value.sessionStartTime) / 1000)
    
    popup = document.createElement('div')
    popup.style.cssText = `
      position: fixed;
      z-index: 9999;
      background: var(--b3-theme-background);
      border: 1px solid var(--b3-border-color);
      border-radius: 8px;
      padding: 12px 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-size: 12px;
      line-height: 1.8;
      min-width: 150px;
    `
    popup.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 6px; color: var(--b3-theme-on-background);">📊 ${i18n?.statsTitle || '阅读统计'}</div>
      <div style="color: var(--b3-theme-on-background-light);">${i18n?.statsSession || '本次'}: ${formatTime(currentSession)}</div>
      <div style="color: var(--b3-theme-on-background-light);">${i18n?.statsToday || '今日'}: ${formatTime(stats.value.todayReadingTime + currentSession)}</div>
      <div style="color: var(--b3-theme-on-background-light);">${i18n?.statsTotal || '累计'}: ${formatTime(stats.value.readingTime)}</div>
    `
    document.body.appendChild(popup)

    // 定位：按钮左上方
    const target = event.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    popup.style.right = `${window.innerWidth - rect.right}px`
    popup.style.bottom = `${window.innerHeight - rect.top + 8}px`
    
    // 点击外部关闭
    setTimeout(() => {
      document.addEventListener('click', function closePopup() {
        if (popup) {
          popup.remove()
          popup = null
        }
        document.removeEventListener('click', closePopup)
      })
    }, 100)
  }

  const init = () => {
    load()
    
    const statusBar = document.createElement('div')
    statusBar.className = 'toolbar__item'
    statusBar.innerHTML = `
      <svg class="toolbar__icon"><use xlink:href="#iconClock"></use></svg>
      <span style="font-size: 12px; margin-left: 4px;" id="stats-time">0:00</span>
    `
    statusBar.title = i18n?.statsTooltip || '点击查看阅读统计'
    statusBar.style.cursor = 'pointer'
    statusBar.addEventListener('click', open)
    
    plugin.addStatusBar({ element: statusBar, position: 'right' })

    // 定时更新
    const timer = setInterval(() => {
      const el = document.getElementById('stats-time')
      if (el) {
        const t = Math.floor((Date.now() - stats.value.sessionStartTime) / 1000)
        el.textContent = formatTime(t)
        
        // 每分钟保存
        if (t % 60 === 0) {
          stats.value.readingTime += 60
          stats.value.todayReadingTime += 60
          save()
        }
      }
    }, 1000)

    return () => clearInterval(timer)
  }

  return { init }
}
