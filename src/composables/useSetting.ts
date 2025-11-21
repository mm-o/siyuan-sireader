import { ref } from 'vue'
import { Dialog, showMessage } from 'siyuan'
import type { Plugin } from 'siyuan'

export function useSetting(plugin: Plugin) {
  // 设置数据
  const settings = ref({
    enabled: true,
    openMode: 'newTab' as 'newTab' | 'rightTab' | 'bottomTab' | 'newWindow',
  })

  // 加载设置
  const load = async () => {
    try {
      const data = await plugin.loadData('config.json')
      if (data?.settings) {
        settings.value = { ...settings.value, ...data.settings }
      }
    } catch (e) {
      console.error('[MReader] 加载设置失败:', e)
    }
  }

  // 保存设置
  const save = async () => {
    try {
      const data = await plugin.loadData('config.json') || {}
      data.settings = settings.value
      await plugin.saveData('config.json', data)
      
      // 触发配置更新事件
      window.dispatchEvent(new CustomEvent('mreaderConfigUpdated', { detail: data }))
      
      showMessage('设置已保存', 2000, 'info')
    } catch (e) {
      console.error('[MReader] 保存设置失败:', e)
    }
  }

  // 打开设置对话框
  const open = () => {
    const dialog = new Dialog({
      title: 'M阅读 - 设置',
      content: `
        <div class="fn__flex" style="height: 500px;">
          <!-- 左侧分组 -->
          <ul class="b3-list b3-list--background" style="width: 200px; padding: 8px; overflow-y: auto; border-right: 1px solid var(--b3-border-color); flex-shrink: 0;">
            <li class="b3-list-item b3-list-item--focus" data-group="general" style="cursor: pointer;">
              <span class="b3-list-item__text">⚙️ 通用设置</span>
            </li>
            <li class="b3-list-item" data-group="reader" style="cursor: pointer;">
              <span class="b3-list-item__text">📖 阅读器设置</span>
            </li>
          </ul>
          
          <!-- 右侧设置内容 -->
          <div class="fn__flex-1" style="overflow-y: auto; padding: 20px 24px; background: var(--b3-theme-background);">
            <!-- 通用设置 -->
            <div class="setting-group" data-group="general">
              <div class="b3-label" style="margin-bottom: 24px;">
                <div class="fn__flex" style="align-items: center; justify-content: space-between;">
                  <div class="fn__flex-1">
                    <div class="b3-label__text" style="font-weight: 500; color: var(--b3-theme-on-background); margin-bottom: 4px;">
                      打开方式
                    </div>
                    <div class="b3-label__text" style="font-size: 12px;">
                      选择打开书籍时的显示方式
                    </div>
                  </div>
                  <span class="fn__space" style="width: 16px;"></span>
                  <select id="setting-openMode" class="b3-select" style="width: 200px;">
                    <option value="newTab">新标签</option>
                    <option value="rightTab">右侧新标签</option>
                    <option value="bottomTab">底部新标签</option>
                    <option value="newWindow">新窗口</option>
                  </select>
                </div>
              </div>
            </div>
            
            <!-- 阅读器设置 -->
            <div class="setting-group" data-group="reader" style="display: none;">
              <div class="b3-label" style="margin-bottom: 24px;">
                <div class="fn__flex" style="align-items: center; justify-content: space-between;">
                  <div class="fn__flex-1">
                    <div class="b3-label__text" style="font-weight: 500; color: var(--b3-theme-on-background); margin-bottom: 4px;">
                      启用插件
                    </div>
                    <div class="b3-label__text" style="font-size: 12px;">
                      是否启用 M阅读 插件功能
                    </div>
                  </div>
                  <span class="fn__space"></span>
                  <input id="setting-enabled" type="checkbox" class="b3-switch fn__flex-center">
                </div>
              </div>
            </div>
          </div>
        </div>
      `,
      width: '800px',
    })
    
    // 分组切换逻辑
    const groups = dialog.element.querySelectorAll('.b3-list-item')
    const contents = dialog.element.querySelectorAll('.setting-group')
    
    groups.forEach(group => {
      group.addEventListener('click', () => {
        const groupName = group.getAttribute('data-group')
        
        // 更新左侧选中状态
        groups.forEach(g => g.classList.remove('b3-list-item--focus'))
        group.classList.add('b3-list-item--focus')
        
        // 切换右侧内容
        contents.forEach(content => {
          if (content.getAttribute('data-group') === groupName) {
            (content as HTMLElement).style.display = 'block'
          } else {
            (content as HTMLElement).style.display = 'none'
          }
        })
      })
    })
    
    // 加载设置
    load()
    
    // 绑定打开方式
    const openModeSelect = dialog.element.querySelector('#setting-openMode') as HTMLSelectElement
    if (openModeSelect) {
      openModeSelect.value = settings.value.openMode || 'newTab'
      openModeSelect.addEventListener('change', () => {
        settings.value.openMode = openModeSelect.value as any
        save()
      })
    }
    
    // 绑定启用插件开关
    const checkbox = dialog.element.querySelector('#setting-enabled') as HTMLInputElement
    if (checkbox) {
      checkbox.checked = settings.value.enabled !== false
      checkbox.addEventListener('change', () => {
        settings.value.enabled = checkbox.checked
        save()
      })
    }
  }

  // 初始化时加载设置
  load()

  return {
    settings,
    open,
    save,
    load,
  }
}
