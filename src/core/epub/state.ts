import { computed, ref } from 'vue'

const activeView = ref<any>(null)
const activeReader = ref<any>(null)
const activeBookUrl = ref('')
export const getActiveBookUrl = () => activeBookUrl.value

export const setActiveReader = (view: any, reader?: any, settings?: any, bookUrl = '') => {
  activeView.value = view
  activeReader.value = reader || null
  activeBookUrl.value = bookUrl
  ;(window as any).__sireader_active_view = view
  ;(window as any).__sireader_active_reader = reader || null
  ;(window as any).__sireader_settings = settings || null
  window.dispatchEvent(new CustomEvent('sireader:reader-state'))
}

export const clearActiveReader = (view?: any) => {
  if (view && activeView.value !== view) return
  activeView.value = null
  activeReader.value = null
  activeBookUrl.value = ''
  ;(window as any).__sireader_active_view = null
  ;(window as any).__sireader_active_reader = null
  ;(window as any).__sireader_settings = null
  window.dispatchEvent(new CustomEvent('sireader:reader-state'))
}

export const useReaderState = () => ({
  activeView: computed(() => activeView.value),
  activeReader: computed(() => activeReader.value),
  activeBookUrl: computed(() => activeBookUrl.value),
  canShowToc: computed(() => !!activeView.value),
})
