<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import type { ReaderSettings, FontFileInfo } from '@/composables/useSetting'
import { PRESET_THEMES, scanCustomFonts } from '@/composables/useSetting'
import { fetchSyncPost, showMessage } from 'siyuan'
import BookSearch from './BookSearch.vue'
import SourceMgr from './SourceMgr.vue'
import Bookshelf from './Bookshelf.vue'
import { bookshelfManager } from '@/core/bookshelf'
import { openOnlineReaderTab } from '@/core/reader'
import { Dialog } from 'siyuan'
import { createApp } from 'vue'
import { MotionPlugin } from '@vueuse/motion'
import { usePlugin } from '@/main'
import { useReaderState } from '@/composables/useReaderState'
import ReaderToc from './ReaderToc.vue'

const props = defineProps<{
  modelValue: ReaderSettings
  i18n: any
  onSave: () => Promise<void>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ReaderSettings]
}>()

const settings = ref<ReaderSettings>(props.modelValue)
const activeTab = ref<'general' | 'appearance' | 'bookshelf' | 'search' | 'toc' | 'bookmark' | 'mark' | 'note'>('bookshelf')
const notebooks = ref<{ id: string; name: string; icon: string }[]>([])
const docSearch = ref({ input: '', results: [] as any[], show: false })
const customFonts = ref<FontFileInfo[]>([]), isLoadingFonts = ref(false)
const plugin = usePlugin()
const { canShowToc, activeReader } = useReaderState()

// 书签数据（从 activeReader 获取，支持EPUB和TXT）
const bookmarks = computed(() => 
  (activeReader.value?.getBookmarks() || []).map((bm: any) => ({ 
    label: bm.title || '未命名书签', cfi: bm.cfi, section: bm.section, page: bm.page, progress: bm.progress, time: bm.time 
  }))
)

const isNotebookMode = computed(() => settings.value.annotationMode === 'notebook')
const isDocMode = computed(() => settings.value.annotationMode === 'document')

const tabs = computed(() => [
  { id: 'bookshelf' as const, icon: 'lucide-library-big', tip: 'bookshelf' },
  { id: 'search' as const, icon: 'lucide-book-search', tip: 'search' },
  { id: 'general' as const, icon: 'lucide-settings-2', tip: 'general' },
  { id: 'appearance' as const, icon: 'lucide-paintbrush-vertical', tip: 'tabAppearance' },
  ...(canShowToc.value ? [
    { id: 'toc' as const, icon: 'lucide-scroll-text', tip: '目录' },
    { id: 'bookmark' as const, icon: 'lucide-map-pin-check', tip: '书签' },
    { id: 'mark' as const, icon: 'lucide-paint-bucket', tip: '标注' },
    { id: 'note' as const, icon: 'lucide-map-pin-pen', tip: '笔记' }
  ] : [])
])

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
  settings.value.textSettings = { fontFamily: 'inherit', fontSize: 16, letterSpacing: 0, customFont: { fontFamily: '', fontFile: '' } },
  settings.value.paragraphSettings = { lineHeight: 1.6, paragraphSpacing: 0.8, textIndent: 0 },
  settings.value.pageSettings = { marginHorizontal: 40, marginVertical: 20, continuousScroll: false },
  save()
)

// 书签操作（极限精简）
const handleRemoveBookmark = async (bookmark: any) => {
  const reader = activeReader.value
  if (!reader) return
  try {
    if (bookmark.fromToc) {
      const location = bookmark.cfi ? { cfi: bookmark.cfi } : { section: bookmark.section, page: bookmark.page }
      await reader.addBookmark(bookmark.label, location)
      showMessage('书签已添加', 1500, 'info')
    } else {
      await reader.removeBookmark(bookmark.cfi || bookmark.section)
      showMessage('书签已删除', 1500, 'info')
    }
  } catch (e: any) {
    showMessage(e.message || '操作失败', 2000, 'error')
  }
}

const loadNotebooks = async () => !notebooks.value.length && fetchSyncPost('/api/notebook/lsNotebooks', {}).then(r => r?.code === 0 && (notebooks.value = r.data?.notebooks || []))
const searchDoc = async () => docSearch.value.input.trim() && fetchSyncPost('/api/filetree/searchDocs', { k: docSearch.value.input.trim() }).then(r => (docSearch.value.results = r?.code === 0 && Array.isArray(r.data) ? r.data : [], docSearch.value.show = true))
const selectDoc = (d: any) => (settings.value.parentDoc = { id: d.id, name: d.hPath || d.content || '无标题', path: d.path || '', notebook: d.box || '' }, docSearch.value = { input: '', results: [], show: false }, save())

// 字体（极限精简）
const loadCustomFonts = async () => {
  isLoadingFonts.value = true
  customFonts.value = await scanCustomFonts()
  isLoadingFonts.value = false
  const s = document.getElementById('sr-fonts') || Object.assign(document.createElement('style'), {id: 'sr-fonts'})
  s.textContent = customFonts.value.map(f => `@font-face{font-family:"${f.displayName}";src:url("/plugins/custom-fonts/${f.name}")}`).join('')
  document.head.appendChild(s)
}
const setFont = (f?: FontFileInfo) => (settings.value.textSettings.fontFamily = f ? 'custom' : 'inherit', f && (settings.value.textSettings.customFont = {fontFamily: f.displayName, fontFile: f.name}), f ? debouncedSave() : save())

onMounted(async () => {
  loadCustomFonts()
  await bookshelfManager.init()
})

const handleReadOnline = async (book: any) => {
  try { await openOnlineReaderTab(plugin, book, () => settings.value) } 
  catch (e: any) { showMessage(`打开失败: ${e.message}`, 3000, 'error') }
}


const openSourceMgr = () => {
  const d = new Dialog({title:'书源管理', content:'<div id="src-mgr"></div>', width:'800px', height:'600px'})
  d.element.querySelector('.b3-dialog__scrim')?.remove()
  const app = createApp(SourceMgr, {i18n: props.i18n})
  app.use(MotionPlugin)
  app.mount(d.element.querySelector('#src-mgr')!)
  const cleanup = () => { app.unmount(); d.destroy() }
  d.element.querySelector('.b3-dialog__close')?.addEventListener('click', cleanup)
}

watch(() => [activeTab.value, isNotebookMode.value], ([tab, notebook]) => tab === 'general' && notebook && loadNotebooks())
watch(() => props.modelValue, (val) => settings.value = val, { deep: true })

const interfaceItems = [
  { key: 'openMode', opts: ['newTab', 'rightTab', 'bottomTab', 'newWindow'] },
  { key: 'tocPosition', opts: ['left', 'right'] },
  { key: 'columnMode', opts: ['single', 'double'] },
  { key: 'pageAnimation', opts: ['slide', 'scroll', 'none'] },  // slide/none翻页，scroll滚动
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
    <aside class="sr-nav">
      <button
        v-for="tab in tabs" :key="tab.id"
        class="sr-nav-btn b3-tooltips b3-tooltips__e"
        :class="{ active: activeTab === tab.id }"
        :aria-label="i18n?.[tab.tip] || tab.tip"
        @click="activeTab = tab.id"
      >
        <svg><use :xlink:href="'#' + tab.icon"/></svg>
      </button>
    </aside>

    <main class="sr-content">
      <Transition name="slide" mode="out-in">
        <div :key="activeTab" class="sr-panel">
          <!-- General -->
          <div v-if="activeTab === 'general'" class="sr-section">
            <div v-motion-pop-visible class="sr-group">
              <h3 class="sr-title">{{ i18n.interfaceSettings || '界面设置' }}</h3>
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

            <div v-motion-pop-visible class="sr-group">
              <h3 class="sr-title">{{ i18n.annotationSettings || '标注设置' }}</h3>
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
              
              <!-- 字体 -->
              <div v-if="group.title === 'textSettings'" class="sr-doc-search">
                <div class="sr-label">
                  <div class="sr-label-text">
                    {{ i18n.fontFamily }}
                    <button class="b3-button b3-button--text" style="padding:0;margin-left:6px" @click="loadCustomFonts" :disabled="isLoadingFonts" :title="i18n.fontTip">
                      <svg style="width:12px;height:12px"><use xlink:href="#iconRefresh"></use></svg>
                    </button>
                  </div>
                  <div class="sr-label-desc"><code style="font-size:10px;opacity:.7">data/plugins/custom-fonts/</code></div>
                </div>
                <div v-if="settings.textSettings.customFont.fontFamily" class="sr-doc-info" style="cursor:pointer" @click="setFont()">
                  <div class="sr-doc-name" :style="{fontFamily:settings.textSettings.customFont.fontFamily}">{{ settings.textSettings.customFont.fontFamily }}</div>
                  <div class="sr-doc-id">{{ settings.textSettings.customFont.fontFile }} <span style="opacity:.5">✕</span></div>
                </div>
                <div v-if="isLoadingFonts" class="sr-empty" style="padding:16px">{{ i18n.loadingFonts }}</div>
                <div v-else-if="customFonts.length" class="sr-doc-results">
                  <div v-for="f in customFonts" :key="f.name" class="sr-doc-item" :style="{fontFamily:f.displayName,fontSize:'15px'}" @click="setFont(f)">{{ f.displayName }}</div>
                </div>
                <div v-else class="sr-empty" style="padding:16px">{{ i18n.noCustomFonts }}</div>
              </div>

              <button v-if="group.title === 'pageSettings'" class="b3-button b3-button--outline sr-reset" @click="resetStyles">
                {{ i18n.resetToDefault }}
              </button>
            </div>
          </div>


          <!-- Bookshelf -->
          <div v-else-if="activeTab === 'bookshelf'" class="sr-bs-container">
            <Bookshelf :i18n="i18n" @read="handleReadOnline" />
          </div>

          <!-- Search -->
          <div v-else-if="activeTab === 'search'" class="sr-bs-container">
            <BookSearch :i18n="i18n" @read="handleReadOnline" @openSettings="openSourceMgr" />
          </div>

          <!-- TOC -->
          <div v-else-if="activeTab === 'toc'" class="sr-toc-container">
            <ReaderToc mode="toc" :bookmarks="bookmarks" @toggle-bookmark="handleRemoveBookmark" />
          </div>

          <!-- Bookmark -->
          <div v-else-if="activeTab === 'bookmark'" class="sr-toc-container">
            <ReaderToc mode="bookmark" :bookmarks="bookmarks" @toggle-bookmark="handleRemoveBookmark" />
          </div>

          <!-- Mark -->
          <div v-else-if="activeTab === 'mark'" class="sr-toc-container">
            <ReaderToc mode="mark" />
          </div>

          <!-- Note -->
          <div v-else-if="activeTab === 'note'" class="sr-toc-container">
            <ReaderToc mode="note" />
          </div>
        </div>
      </Transition>
    </main>
  </div>
</template>

<style scoped lang="scss">
.sr-settings{display:flex;height:100%;background:var(--b3-theme-background)}
.sr-nav{width:40px;background:var(--b3-theme-surface);border-right:1px solid var(--b3-border-color);padding:4px;display:flex;flex-direction:column;gap:4px;flex-shrink:0;align-items:center}
.sr-nav-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;border-radius:6px;cursor:pointer;transition:all .15s;color:var(--b3-theme-on-surface);flex-shrink:0;svg{width:18px;height:18px}
  &:hover{background:var(--b3-list-hover)}
  &.active{background:var(--b3-theme-primary);color:var(--b3-theme-on-primary);box-shadow:0 2px 4px #0003}
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
.sr-bs-container { display:flex; flex-direction:column; height:100%; }
.sr-toc-container { width:100%; height:100%; overflow:hidden; }
.fade-enter-active, .fade-leave-active { transition: opacity .3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
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
@media (max-width:640px){.sr-settings{flex-direction:column}.sr-nav{width:100%;flex-direction:row;border-right:none;border-bottom:1px solid var(--b3-border-color);padding:4px 8px}.sr-content{padding:14px}.sr-item{flex-direction:column;align-items:flex-start;gap:10px}.b3-select,.sr-slider{width:100%}}
</style>
