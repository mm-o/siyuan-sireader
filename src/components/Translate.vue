<template>
  <div class="tr-root">
    <div class="tr-body">
      <div class="tr-section">
        <div class="tr-head"><span>{{ props.i18n?.sourceText || 'Source text' }}</span></div>
        <div class="tr-text tr-src">{{ text }}</div>
      </div>
      <div class="tr-section">
        <div class="tr-head">
          <span>{{ props.i18n?.translatedText || 'Translation' }}</span>
          <select v-model="tgt" class="b3-select tr-select" :aria-label="props.i18n?.targetLanguage || 'Target language'" @change="translate">
            <option v-for="[code, name] in langs" :key="code" :value="code">{{ name }}</option>
          </select>
        </div>
        <div class="tr-text tr-tgt">{{ loading ? (props.i18n?.translating || 'Translating...') : (result || props.i18n?.translationFailed || 'Translation failed') }}</div>
      </div>
    </div>
    <div class="tr-footer">
      <div class="tr-controls">
        <span>{{ props.i18n?.translationEngine || 'Translation engine' }}</span>
        <select v-model="eng" class="b3-select tr-select" :aria-label="props.i18n?.translationEngine || 'Translation engine'" @change="setEngine">
          <option v-for="(engine, key) in engines" :key="key" :value="key">{{ engine.name }}</option>
        </select>
      </div>
      <button v-if="props.onAddToAnnotation" class="b3-button b3-button--outline tr-add" :disabled="loading || !result || adding || added" @click="addToAnnotation">
        {{ added ? (props.i18n?.annotationAdded || 'Annotation added') : (adding ? (props.i18n?.adding || 'Adding...') : (props.i18n?.addAsAnnotation || 'Add as annotation')) }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { translators } from '@/services/translator'

const props = defineProps<{ text: string; onAddToAnnotation?: (translation: string) => void | Promise<void>; i18n?: any }>()

const langs = [['zh-CN', '中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['ru', 'Русский']]
const engines = translators
const tgt = ref('zh-CN')
type EngineKey = keyof typeof translators
const getEngine = (): EngineKey => {
  const key = (window as any).__sireader_settings?.translation?.engine as EngineKey
  return key && engines[key] ? key : 'azure'
}
const eng = ref<EngineKey>(getEngine())
const result = ref('')
const loading = ref(false)
const adding = ref(false)
const added = ref(false)

const translate = async () => {
  loading.value = true
  added.value = false
  try { result.value = await engines[eng.value].translate(props.text, tgt.value) }
  catch { result.value = '' }
  finally { loading.value = false }
}
const setEngine = async () => {
  const settings = (window as any).__sireader_settings
  if (settings) {
    settings.translation = { ...(settings.translation || {}), engine: eng.value }
    ;(await import('@/composables/useSetting')).settingsManager.save(settings).catch(() => {})
  }
  translate()
}
const addToAnnotation = async () => {
  if (!props.onAddToAnnotation || !result.value || adding.value) return
  adding.value = true
  try { await props.onAddToAnnotation(result.value); added.value = true } finally { adding.value = false }
}

watch(() => props.text, () => {
  eng.value = getEngine()
  void translate()
}, { immediate: true })
</script>

<style scoped>
/* 外壳撑满弹窗：正文可滚，底部按钮固定在下方，不产生外层滚动条 */
.tr-root{display:flex;flex-direction:column;min-height:0;max-height:100%}
.tr-body{display:flex;flex-direction:column;min-height:0;overflow-y:auto;padding-right:2px}
.tr-section{display:flex;flex-direction:column;gap:6px}
.tr-section+.tr-section{margin-top:12px}
.tr-head{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--b3-theme-on-surface);font-weight:500}
.tr-text{font-size:14px;line-height:1.55;overflow-y:auto;white-space:pre-wrap;overflow-wrap:anywhere;resize:vertical;color:var(--b3-theme-on-surface);padding:7px 8px;background:var(--b3-theme-background);border:1px solid var(--b3-border-color);border-radius:4px}
/* 默认按内容长，最多到视口的一半多一点；可手动往下拉，但不许超出屏幕 */
.tr-src{min-height:52px;max-height:min(32vh,420px)}
.tr-tgt{min-height:52px;max-height:min(52vh,640px)}
.tr-footer{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding-top:10px;border-top:1px solid var(--b3-border-color)}
.tr-controls{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--b3-theme-on-surface)}
.tr-add{flex:0 0 auto;white-space:nowrap}
.tr-select{width:136px;height:28px}
</style>
