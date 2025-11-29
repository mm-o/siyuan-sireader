<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import type { ReaderSettings } from '@/composables/useSetting'
import { PRESET_THEMES } from '@/composables/useSetting'
import { fetchSyncPost, showMessage } from 'siyuan'

const props = defineProps<{
  modelValue: ReaderSettings
  i18n: any
  onSave: () => Promise<void>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ReaderSettings]
}>()

const settings = ref<ReaderSettings>(props.modelValue)
const activeTab = ref<'interface' | 'appearance' | 'annotation'>('interface')
const notebooks = ref<{ id: string; name: string; icon: string }[]>([])
const docSearch = ref({ input: '', results: [] as any[], show: false })

const isNotebookMode = computed(() => settings.value.annotationMode === 'notebook')
const isDocMode = computed(() => settings.value.annotationMode === 'document')

const tabs = [
  { id: 'interface' as const, label: 'tabInterface' },
  { id: 'appearance' as const, label: 'tabAppearance' },
  { id: 'annotation' as const, label: 'tabAnnotation' },
]

const previewStyle = computed(() => {
  const theme = settings.value.theme === 'custom'
    ? settings.value.customTheme
    : PRESET_THEMES[settings.value.theme]
  if (!theme) return {}
  return {
    color: theme.color,
    backgroundColor: theme.bgImg ? 'transparent' : theme.bg,
    backgroundImage: theme.bgImg ? `url("${theme.bgImg}")` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})

const save = async () => {
  emit('update:modelValue', toRaw(settings.value))
  await props.onSave()
  window.dispatchEvent(new CustomEvent('sireaderSettingsUpdated', { detail: settings.value }))
  showMessage(props.i18n?.saved || '设置已保存')
}

const debouncedSave = (() => {
  let timer: any
  return () => {
    clearTimeout(timer)
    timer = setTimeout(() => save(), 300)
  }
})()

const resetStyles = () => confirm(props.i18n.confirmReset || '确定要恢复默认设置吗？') && (
  settings.value.textSettings = { fontFamily: 'inherit', fontSize: 16, letterSpacing: 0 },
  settings.value.paragraphSettings = { lineHeight: 1.6, paragraphSpacing: 0.8, textIndent: 0 },
  settings.value.pageSettings = { marginHorizontal: 40, marginVertical: 20, continuousScroll: false },
  save()
)

const loadNotebooks = async () => {
  if (notebooks.value.length) return
  const res = await fetchSyncPost('/api/notebook/lsNotebooks', {}).catch(() => null)
  res?.code === 0 && res.data?.notebooks && (notebooks.value = res.data.notebooks)
}

const searchDoc = async () => {
  if (!docSearch.value.input.trim()) return
  const res = await fetchSyncPost('/api/filetree/searchDocs', { k: docSearch.value.input.trim() }).catch(() => null)
  docSearch.value.results = res?.code === 0 && Array.isArray(res.data) ? res.data : []
  docSearch.value.show = true
}

const selectDoc = (d: any) => (
  settings.value.parentDoc = { id: d.id, name: d.hPath || d.content || '无标题', path: d.path || '', notebook: d.box || '' },
  docSearch.value = { input: '', results: [], show: false },
  save()
)

watch(() => [activeTab.value, isNotebookMode.value], ([tab, notebook]) => tab === 'annotation' && notebook && loadNotebooks())
watch(() => props.modelValue, (val) => settings.value = val, { deep: true })

const interfaceItems = [
  { key: 'openMode', opts: ['newTab', 'rightTab', 'bottomTab', 'newWindow'] },
  { key: 'tocPosition', opts: ['left', 'right'] },
  { key: 'columnMode', opts: ['single', 'double'] },
  { key: 'pageAnimation', opts: ['slide', 'fade', 'flip', 'scroll', 'vertical', 'none'] },
]

const customThemeItems = [
  { key: 'color', label: 'textColor', type: 'color' },
  { key: 'bg', label: 'bgColor', type: 'color' },
  { key: 'bgImg', label: 'bgImage', type: 'text' },
]

const appearanceGroups = [
  {
    title: 'textSettings',
    items: [
      { key: 'fontFamily', type: 'select', opts: ['inherit', 'serif', 'sans-serif', "'Microsoft YaHei', sans-serif", "'SimSun', serif", "'KaiTi', serif"], labels: ['fontDefault', 'fontSerif', 'fontSans', 'fontYahei', 'fontSong', 'fontKai'] },
      { key: 'fontSize', type: 'range', min: 12, max: 32, step: 1, unit: 'px' },
      { key: 'letterSpacing', type: 'range', min: 0, max: 0.2, step: 0.01, unit: 'em' },
    ],
  },
  {
    title: 'paragraphSettings',
    items: [
      { key: 'lineHeight', type: 'range', min: 1.0, max: 3.0, step: 0.1 },
      { key: 'paragraphSpacing', type: 'range', min: 0, max: 2, step: 0.1, unit: 'em' },
      { key: 'textIndent', type: 'range', min: 0, max: 4, step: 0.5, unit: 'em' },
    ],
  },
  {
    title: 'pageSettings',
    items: [
      { key: 'marginHorizontal', type: 'range', min: 0, max: 100, step: 5, unit: 'px' },
      { key: 'marginVertical', type: 'range', min: 0, max: 80, step: 5, unit: 'px' },
      { key: 'continuousScroll', type: 'checkbox' },
    ],
  },
]
</script>

<template>
  <div class="sr-settings">
    <aside class="sr-sidebar">
      <nav class="sr-nav">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          v-motion-slide-left
          class="sr-nav-item"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ i18n[tab.label] || tab.label }}
        </div>
      </nav>
    </aside>

    <main class="sr-content">
      <Transition name="slide" mode="out-in">
        <div :key="activeTab" class="sr-panel">
          <!-- Interface -->
          <div v-if="activeTab === 'interface'" v-motion-slide-visible-once-bottom>
            <div v-for="item in interfaceItems" :key="item.key" class="sr-item">
              <div class="sr-label">
                <div class="sr-label-text">{{ i18n[item.key] }}</div>
                <div class="sr-label-desc">{{ i18n[item.key + 'Desc'] }}</div>
              </div>
              <select v-model="settings[item.key]" class="b3-select" @change="save">
                <option v-for="opt in item.opts" :key="opt" :value="opt">{{ i18n[opt] || opt }}</option>
              </select>
            </div>
          </div>

          <!-- Appearance -->
          <div v-else-if="activeTab === 'appearance'" class="sr-section">
            <div v-motion-pop-visible class="sr-group">
              <h3 class="sr-title">{{ i18n.themeTitle || i18n.presetTheme }}</h3>
              
              <div class="sr-item">
                <div class="sr-label">
                  <div class="sr-label-text">{{ i18n.presetTheme }}</div>
                  <div class="sr-label-desc">{{ i18n.presetThemeDesc }}</div>
                </div>
                <select v-model="settings.theme" class="b3-select" @change="save">
                  <option v-for="(theme, key) in PRESET_THEMES" :key="key" :value="key">
                    {{ i18n[theme.name] || theme.name }}
                  </option>
                  <option value="custom">{{ i18n.custom }}</option>
                </select>
              </div>

              <Transition name="expand">
                <div v-if="settings.theme === 'custom'" class="sr-custom">
                  <div v-for="item in customThemeItems" :key="item.key" class="sr-item">
                    <div class="sr-label">
                      <div class="sr-label-text">{{ i18n[item.label] }}</div>
                    </div>
                    <input v-model="settings.customTheme[item.key]" :type="item.type" :class="item.type === 'color' ? 'sr-color' : 'b3-text-field'" @change="save">
                  </div>
                </div>
              </Transition>

              <div class="sr-preview" :style="previewStyle">
                <div v-html="i18n.previewText" />
              </div>
            </div>

            <div v-for="group in appearanceGroups" :key="group.title" v-motion-pop-visible class="sr-group">
              <h3 class="sr-title">{{ i18n[group.title] }}</h3>
              
              <div v-for="item in group.items" :key="item.key" class="sr-item">
                <div class="sr-label">
                  <div class="sr-label-text">{{ i18n[item.key] }}</div>
                  <div v-if="item.key === 'continuousScroll'" class="sr-label-desc">{{ i18n.continuousScrollDesc }}</div>
                </div>
                
                <select v-if="item.type === 'select'" v-model="settings[group.title][item.key]" class="b3-select" @change="debouncedSave">
                  <option v-for="(opt, idx) in item.opts" :key="opt" :value="opt">{{ i18n[item.labels[idx]] }}</option>
                </select>
                <div v-else-if="item.type === 'range'" class="sr-slider">
                  <input v-model.number="settings[group.title][item.key]" type="range" class="b3-slider" :min="item.min" :max="item.max" :step="item.step" @input="debouncedSave">
                  <span class="sr-value">{{ settings[group.title][item.key] }}{{ item.unit || '' }}</span>
                </div>
                <input v-else-if="item.type === 'checkbox'" v-model="settings[group.title][item.key]" type="checkbox" class="b3-switch" @change="save">
              </div>

              <button v-if="group.title === 'pageSettings'" class="b3-button b3-button--outline sr-reset" @click="resetStyles">
                {{ i18n.resetToDefault }}
              </button>
            </div>
          </div>

          <!-- Annotation -->
          <div v-else-if="activeTab === 'annotation'" v-motion-pop-visible class="sr-group">
            <div class="sr-item">
              <div class="sr-label">
                <div class="sr-label-text">{{ i18n.annotationMode }}</div>
              </div>
              <select v-model="settings.annotationMode" class="b3-select" @change="save">
                <option value="notebook">{{ i18n.notebook || '笔记本' }}</option>
                <option value="document">{{ i18n.document || '文档' }}</option>
              </select>
            </div>

            <Transition name="expand">
              <div v-if="isNotebookMode" class="sr-item">
                <div class="sr-label">
                  <div class="sr-label-text">{{ i18n.targetNotebook || '目标笔记本' }}</div>
                  <div class="sr-label-desc">{{ i18n.targetNotebookDesc || '选择存储标注的笔记本' }}</div>
                </div>
                <select v-model="settings.notebookId" class="b3-select" @change="save">
                  <option value="">{{ i18n.notSelected || '未选择' }}</option>
                  <option v-for="nb in notebooks" :key="nb.id" :value="nb.id">
                    {{ nb.icon ? String.fromCodePoint(parseInt(nb.icon, 16)) + ' ' : '' }}{{ nb.name }}
                  </option>
                </select>
              </div>
            </Transition>

            <Transition name="expand">
              <div v-if="isDocMode" class="sr-doc-search">
                <div class="sr-label">
                  <div class="sr-label-text">{{ i18n.parentDoc || '父文档' }}</div>
                  <div class="sr-label-desc">{{ i18n.parentDocDesc || '选择作为标注存储的父文档' }}</div>
                </div>
                <div v-if="settings.parentDoc" class="sr-doc-info">
                  <div class="sr-doc-name">{{ settings.parentDoc.name }}</div>
                  <div class="sr-doc-id">{{ settings.parentDoc.id }}</div>
                </div>
                <input v-model="docSearch.input" class="b3-text-field" :placeholder="i18n.searchDocPlaceholder || '输入文档名搜索，按回车'" @keydown.enter="searchDoc">
                <Transition name="expand">
                  <div v-if="docSearch.show" class="sr-doc-results">
                    <div v-if="!docSearch.results.length" class="sr-empty">{{ i18n.noResults || '未找到文档' }}</div>
                    <div v-for="d in docSearch.results" :key="d.id" class="sr-doc-item" @click="selectDoc(d)">{{ d.hPath || d.content || '无标题' }}</div>
                  </div>
                </Transition>
              </div>
            </Transition>
          </div>
        </div>
      </Transition>
    </main>
  </div>
</template>

<style scoped lang="scss">
.sr-settings { display: flex; height: 500px; background: var(--b3-theme-background); border-radius: 8px; overflow: hidden; }
.sr-sidebar { width: 140px; background: var(--b3-theme-surface); border-right: 1px solid var(--b3-border-color); flex-shrink: 0; }
.sr-nav { padding: 12px 8px; display: flex; flex-direction: column; gap: 4px; }
.sr-nav-item { padding: 10px 14px; border-radius: 6px; cursor: pointer; transition: all .2s; color: var(--b3-theme-on-surface); font-size: 13px;
  &:hover { background: var(--b3-theme-surface-lighter); transform: translateX(3px); }
  &.active { background: var(--b3-theme-primary); color: var(--b3-theme-on-primary); font-weight: 500; box-shadow: 0 2px 6px #0003; }
}
.sr-content { flex: 1; overflow-y: auto; padding: 20px; }
.sr-section { display: flex; flex-direction: column; gap: 20px; }
.sr-group { background: var(--b3-theme-surface); border-radius: 8px; padding: 18px; box-shadow: 0 1px 3px #0000000d; transition: box-shadow .3s;
  &:hover { box-shadow: 0 4px 10px #00000014; }
}
.sr-title { font-size: 15px; font-weight: 600; color: var(--b3-theme-primary); margin: 0 0 14px; }
.sr-item { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 10px 0;
  &:not(:last-child) { border-bottom: 1px solid var(--b3-border-color); }
}
.sr-label { flex: 1; min-width: 0; }
.sr-label-text { font-size: 13px; font-weight: 500; color: var(--b3-theme-on-surface); margin-bottom: 3px; }
.sr-label-desc { font-size: 11px; color: var(--b3-theme-on-surface-variant); opacity: .7; line-height: 1.4; }
.b3-select { min-width: 130px; }
.sr-slider { display: flex; align-items: center; gap: 10px; }
.b3-slider { width: 130px; }
.sr-value { min-width: 55px; text-align: right; font-size: 12px; font-weight: 500; color: var(--b3-theme-primary); }
.sr-preview { margin-top: 14px; padding: 18px; border-radius: 6px; font-size: 13px; line-height: 1.8; transition: all .3s; }
.sr-custom { margin-top: 10px; }
.sr-color { width: 55px; height: 34px; padding: 3px; border-radius: 4px; cursor: pointer; border: 1px solid var(--b3-border-color); }
.sr-reset { width: 100%; margin-top: 14px; padding: 9px; font-size: 12px; transition: all .2s;
  &:hover { transform: translateY(-1px); box-shadow: 0 3px 6px #0003; }
}
.slide-enter-active { transition: all .25s cubic-bezier(.4,0,.2,1); }
.slide-leave-active { transition: all .2s cubic-bezier(.4,0,1,1); }
.slide-enter-from { opacity: 0; transform: translateX(15px); }
.slide-leave-to { opacity: 0; transform: translateX(-15px); }
.expand-enter-active, .expand-leave-active { transition: all .3s cubic-bezier(.4,0,.2,1); overflow: hidden; }
.expand-enter-from, .expand-leave-to { max-height: 0; opacity: 0; transform: scaleY(.9); }
.expand-enter-to, .expand-leave-from { max-height: 400px; opacity: 1; transform: scaleY(1); }
.sr-doc-search { 
  margin-top: 12px;
  input { width: 100%; margin-bottom: 8px; }
}
.sr-doc-info { 
  padding: 12px; margin-bottom: 12px; border-radius: 6px; 
  background: var(--b3-theme-surface); border: 1px solid var(--b3-border-color);
}
.sr-doc-name { font-weight: 500; margin-bottom: 4px; }
.sr-doc-id { font-size: 12px; opacity: 0.65; font-family: monospace; }
.sr-doc-results { 
  max-height: 250px; overflow-y: auto; margin-top: 8px; border-radius: 6px;
  background: var(--b3-theme-surface); border: 1px solid var(--b3-border-color);
}
.sr-empty { padding: 20px; text-align: center; color: var(--b3-theme-on-surface-light); opacity: 0.6; }
.sr-doc-item { 
  padding: 10px 12px; cursor: pointer; transition: background 0.15s; 
  border-bottom: 1px solid var(--b3-border-color);
  &:last-child { border-bottom: none; }
  &:hover { background: var(--b3-list-hover); }
}
@media (max-width: 640px) {
  .sr-settings { flex-direction: column; height: auto; }
  .sr-sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--b3-border-color); }
  .sr-nav { flex-direction: row; overflow-x: auto; }
  .sr-nav-item { min-width: 70px; text-align: center; }
  .sr-content { padding: 14px; }
  .sr-item { flex-direction: column; align-items: flex-start; gap: 10px; }
  .b3-select, .sr-slider { width: 100%; }
}
</style>
