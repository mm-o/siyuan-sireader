<template>
  <div class="tr-section">
    <div class="tr-head"><span>原文</span></div>
    <div class="tr-text tr-src">{{ text }}</div>
  </div>
  <div class="tr-section">
    <div class="tr-head">
      <span>译文</span>
      <select v-model="tgt" class="b3-select tr-select" aria-label="目标语言" @change="translate">
        <option v-for="[code, name] in langs" :key="code" :value="code">{{ name }}</option>
      </select>
    </div>
    <div class="tr-text tr-tgt">{{ loading ? '翻译中...' : (result || '翻译失败') }}</div>
  </div>
  <div class="tr-controls">
    <span>翻译引擎</span>
    <select v-model="eng" class="b3-select tr-select" aria-label="翻译引擎" @change="setEngine">
      <option v-for="(engine, key) in engines" :key="key" :value="key">{{ engine.name }}</option>
    </select>
  </div>
  <div v-if="props.onAddToAnnotation" class="tr-actions">
    <button class="b3-button b3-button--outline" :disabled="loading || !result || adding || added" @click="addToAnnotation">
      {{ added ? '已添加批注' : (adding ? '正在添加...' : '添加为批注') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { translators } from '@/services/translator'

const props = defineProps<{ text: string; onAddToAnnotation?: (translation: string) => void | Promise<void> }>()

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
.tr-section{display:flex;flex-direction:column;gap:6px}
.tr-section+.tr-section{margin-top:12px}
.tr-head{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--b3-theme-on-surface);font-weight:500}
.tr-text{font-size:14px;line-height:1.55;overflow-y:auto;color:var(--b3-theme-on-surface);padding:7px 8px;background:var(--b3-theme-background);border:1px solid var(--b3-border-color);border-radius:4px}
.tr-src{max-height:72px}
.tr-tgt{min-height:48px;max-height:180px}
.tr-controls{display:flex;align-items:center;justify-content:space-between;margin-top:12px;font-size:12px;color:var(--b3-theme-on-surface)}
.tr-actions{display:flex;justify-content:flex-end;margin-top:8px}
.tr-select{width:136px;height:28px}
</style>
