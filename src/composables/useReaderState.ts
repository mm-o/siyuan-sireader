// 全局阅读器状态管理
import { ref, computed } from 'vue'

// 当前活动的阅读器实例
const activeReaderInstance = ref<any>(null) // FoliateReader 实例
const activeReader = ref<any>(null) // 保持向后兼容
const activeView = ref<any>(null) // FoliateView 实例
const activeDocId = ref<string>('')
const activeFormat = ref<string>('')

export function useReaderState() {
  // 设置当前阅读器（接收 view 和可选的 reader 实例）
  const setActiveReader = (view: any, docId: string = '', reader?: any) => {
    activeView.value = view
    activeReader.value = view // 向后兼容
    activeReaderInstance.value = reader || null
    activeDocId.value = docId
    activeFormat.value = 'epub'
  }

  // 清空阅读器
  const clearActiveReader = () => {
    activeReader.value = null
    activeReaderInstance.value = null
    activeView.value = null
    activeDocId.value = ''
    activeFormat.value = ''
  }

  // 计算属性
  const hasActiveReader = computed(() => !!activeReader.value)
  const isEpubReader = computed(() => activeFormat.value === 'epub')
  const canShowToc = computed(() => hasActiveReader.value && !!activeView.value)

  // 获取目录数据
  const getToc = () => activeView.value?.book?.toc || []
  
  // 获取当前位置 (返回 { range, index, fraction })
  const getCurrentLocation = () => activeView.value?.location
  
  // 获取当前section索引
  const getCurrentIndex = () => activeView.value?.location?.index
  
  // 跳转到指定位置（支持 href/cfi/section/对象）
  const goToLocation = async (location: string | number | { section: number; page?: number }) => {
    if (activeReader.value) {
      await activeReader.value.goTo(location as any)
    }
  }

  return {
    // 状态
    activeReader,
    activeReaderInstance,
    activeView,
    activeDocId,
    activeFormat,
    
    // 计算属性
    hasActiveReader,
    isEpubReader,
    canShowToc,
    
    // 方法
    setActiveReader,
    clearActiveReader,
    getToc,
    getCurrentLocation,
    getCurrentIndex,
    goToLocation
  }
}
