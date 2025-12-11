/**
 * Foliate 模块统一导出
 */

import { ref, computed } from 'vue'

// 导出所有模块
export * from './types'
export * from './mark'
export * from './reader'

// 全局阅读器状态
const activeReaderInstance = ref<any>(null)
const activeView = ref<any>(null)

export const setActiveReader = (view: any, reader?: any) => {
  activeView.value = view
  activeReaderInstance.value = reader || null
}

export const clearActiveReader = () => {
  activeView.value = null
  activeReaderInstance.value = null
}

export const useReaderState = () => ({
  activeView: computed(() => activeView.value),
  activeReaderInstance: computed(() => activeReaderInstance.value),
  canShowToc: computed(() => !!activeView.value),
  goToLocation: async (location: string | number) => activeView.value?.goTo(location)
})
