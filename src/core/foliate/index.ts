/**
 * Foliate 模块统一导出
 */

import { ref, computed } from 'vue'

// 导出所有模块
export * from './types'
export * from './reader'

// 全局阅读器状态 - ref响应式 + window全局访问
const activeView = ref<any>(null)
const activeReader = ref<any>(null)

export const setActiveReader = (view: any, reader?: any) => {
  activeView.value = view
  activeReader.value = reader || null
  ;(window as any).__sireader_active_view = view
  ;(window as any).__sireader_active_reader = reader || null
}

export const clearActiveReader = () => {
  activeView.value = null
  activeReader.value = null
  ;(window as any).__sireader_active_view = null
  ;(window as any).__sireader_active_reader = null
}

export const useReaderState = () => ({
  activeView: computed(() => activeView.value),
  activeReader: computed(() => activeReader.value),
  canShowToc: computed(() => !!activeView.value)
})
