
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { ReaderSettings, FontFileInfo } from '@/composables/useSetting'
import { PRESET_THEMES, UI_CONFIG, useSetting, useDocSearch, useNotebooks } from '@/composables/useSetting'
import { openTab } from 'siyuan'
import BookSearch from './BookSearch.vue'
import Bookshelf from './Bookshelf.vue'
import { bookshelfManager } from '@/core/bookshelf'
import { usePlugin } from '@/main'
import { useReaderState } from '@/core/foliate'
import ReaderToc from './ReaderToc.vue'
import DictMgr from './DictMgr.vue'

const props = defineProps<{ modelValue: ReaderSettings; i18n: any; onSave: () => Promise<void> }>()
const emit = defineEmits<{ 'update:modelValue': [value: ReaderSettings] }>()

const settings = ref<ReaderSettings>(props.modelValue)
const activeTab = ref<'general' | 'appearance' | 'bookshelf' | 'search' | 'dictionary' | 'toc' | 'bookmark' | 'mark' | 'note' | 'deck'>('bookshelf')
const previewExpanded = ref(localStorage.getItem('sr-preview-expanded') !== '0')
const plugin = usePlugin()
const { canShowToc } = useReaderState()
const { customFonts, isLoadingFonts, loadCustomFonts, resetStyles: resetStylesRaw } = useSetting(plugin)
const { notebooks, load: loadNotebooks } = useNotebooks()
const { state: docSearch, search: searchDoc, select: selectDocRaw } = useDocSearch()
const { interfaceItems, customThemeItems, appearanceGroups } = UI_CONFIG

const tooltipDir = computed(() => ({ left: 'e', right: 'w', top: 's', bottom: 'n' }[settings.value.navPosition] || 'n'))
const tabs = computed(() => [
  { id: 'bookshelf' as const, icon: 'lucide-library-big', tip: 'bookshelf' },
  { id: 'search' as const, icon: 'lucide-book-search', tip: 'search' },
  { id: 'deck' as const, icon: 'lucide-wallet-cards', tip: '卡包' },
  ...(canShowToc.value ? [
    { id: 'toc' as const, icon: 'lucide-scroll-text', tip: '目录' },
    { id: 'bookmark' as const, icon: 'lucide-map-pin-check', tip: '书签' },
    { id: 'mark' as const, icon: 'lucide-paint-bucket', tip: '标注' },
    { id: 'note' as const, icon: 'lucide-map-pin-pen', tip: '笔记' }
  ] : []),
  { id: 'general' as const, icon: 'lucide-settings-2', tip: 'tabGeneral' },
  { id: 'appearance' as const, icon: 'lucide-paintbrush-vertical', tip: 'tabAppearance' },
  { id: 'dictionary' as const, icon: 'lucide-book-text', tip: '词典' }
])
const previewStyle = computed(() => {
  const theme = settings.value.theme === 'custom' ? settings.value.customTheme : PRESET_THEMES[settings.value.theme]
  if (!theme) return {}
  const { textSettings: t, paragraphSettings: p, layoutSettings: l, visualSettings: v, viewMode } = settings.value
  const filters = [v.brightness !== 1 && `brightness(${v.brightness})`, v.contrast !== 1 && `contrast(${v.contrast})`, v.sepia > 0 && `sepia(${v.sepia})`, v.saturate !== 1 && `saturate(${v.saturate})`, v.invert && 'invert(1) hue-rotate(180deg)'].filter(Boolean).join(' ')
  const fontFamily = t.fontFamily === 'custom' && t.customFont.fontFamily ? `"${t.customFont.fontFamily}", sans-serif` : t.fontFamily || 'inherit'
  return { color: theme.color, backgroundColor: theme.bgImg ? 'transparent' : theme.bg, backgroundImage: theme.bgImg ? `url("${theme.bgImg}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', fontFamily, fontSize: `${t.fontSize}px`, letterSpacing: `${t.letterSpacing}em`, lineHeight: p.lineHeight, filter: filters || 'none', '--paragraph-spacing': p.paragraphSpacing, '--text-indent': p.textIndent, '--margin-h': `${l.marginHorizontal}px`, '--margin-v': `${l.marginVertical}px`, '--gap': `${l.gap}%`, '--header-footer': `${l.headerFooterMargin}px`, '--max-block': l.maxBlockSize > 0 ? `${l.maxBlockSize}px` : 'none', '--column-count': viewMode === 'double' ? 2 : 1 }
})

const save = async () => (emit('update:modelValue', settings.value), await props.onSave())
const debouncedSave = (() => { let t: any; return () => (clearTimeout(t), t = setTimeout(save, 300)) })()
const resetStyles = () => confirm(props.i18n.confirmReset || '确定要恢复默认设置吗？') && (resetStylesRaw(), save())
const selectDoc = (d: any) => selectDocRaw(d, (doc) => (settings.value.parentDoc = doc, save()))
const setFont = (f?: FontFileInfo) => (settings.value.textSettings.fontFamily = f ? 'custom' : 'inherit', settings.value.textSettings.customFont = f ? { fontFamily: f.displayName, fontFile: f.name } : { fontFamily: '', fontFile: '' }, f ? debouncedSave() : save())
const handleReadOnline = (book: any) => openTab({ app: (plugin as any).app, custom: { icon: 'siyuan-reader-icon', title: book.name || '在线阅读', data: { bookInfo: book }, id: `${plugin.name}custom_tab_online_reader` } })
const togglePreview = () => (previewExpanded.value = !previewExpanded.value, localStorage.setItem('sr-preview-expanded', previewExpanded.value ? '1' : '0'))

onMounted(() => (loadCustomFonts(), bookshelfManager.init()))
watch(() => [activeTab.value, settings.value.annotationMode === 'notebook'], ([tab, notebook]) => tab === 'general' && notebook && loadNotebooks())
watch(() => props.modelValue, (val) => settings.value = val, { deep: true })
watch(canShowToc, (show) => !show && ['toc', 'bookmark', 'mark', 'note'].includes(activeTab.value) && (activeTab.value = 'bookshelf'))
</script>

<template>
  <div class="sr-settings" :class="`nav-${settings.navPosition}`">
    <nav class="sr-nav">
      <button
        v-for="tab in tabs" :key="tab.id"
        class="sr-nav-tab b3-tooltips"
        :class="[{ 'sr-nav-tab--active': activeTab === tab.id }, `b3-tooltips__${tooltipDir}`]"
        :aria-label="i18n?.[tab.tip] || tab.tip"
        @click="activeTab = tab.id"
      >
        <svg><use :xlink:href="'#' + tab.icon"/></svg>
      </button>
    </nav>

    <main class="sr-content">
      <!-- 样式预览 -->
      <div v-if="activeTab === 'appearance'" class="sr-preview" :class="{expanded:previewExpanded}" :style="previewStyle">
        <div class="sr-preview-hf" @click="togglePreview">
          <span>{{ i18n.livePreview || '实时预览' }}</span>
          <svg class="sr-preview-toggle"><use :xlink:href="previewExpanded?'#iconContract':'#iconExpand'"/></svg>
        </div>
        <Transition name="expand">
          <div v-show="previewExpanded" class="sr-preview-body">
            <p>春江潮水连海平，海上明月共潮生。</p>
            <p>滟滟随波千万里，何处春江无月明。</p>
          </div>
        </Transition>
        <div v-if="previewExpanded" class="sr-preview-hf">{{ settings.viewMode === 'double' ? '双页' : settings.viewMode === 'scroll' ? '连续滚动' : '单页' }}</div>
      </div>

      <Transition name="slide" mode="out-in">
        <!-- General -->
        <div v-if="activeTab === 'general'" :key="activeTab" class="sr-section">
            <div v-motion-pop-visible class="sr-group">
              <h3 class="sr-title">{{ i18n.interfaceSettings || '界面设置' }}</h3>
              <label v-for="item in interfaceItems" :key="item.key" class="sr-item">
                <span class="sr-label">
                  <b>{{ i18n[item.key] }}</b>
                  <small>{{ i18n[item.key + 'Desc'] }}</small>
                </span>
                <select v-model="settings[item.key]" class="b3-select" @change="save">
                  <option v-for="opt in item.opts" :key="opt" :value="opt">{{ i18n[opt] || opt }}</option>
                </select>
              </label>
            </div>

            <!-- 暂时屏蔽标注设置 -->
            <!--
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
                    <option v-for="nb in notebooks.value" :key="nb.id" :value="nb.id">
                      {{ nb.icon ? String.fromCodePoint(parseInt(nb.icon, 16)) + ' ' : '' }}{{ nb.name }}
                    </option>
                  </select>
                </div>
              </Transition>

              <Transition name="expand">
                <div v-if="settings.annotationMode === 'document'" class="sr-doc-search">
                  <div class="sr-label">
                    <div class="sr-label-text">{{ i18n.parentDoc || '父文档' }}</div>
                    <div class="sr-label-desc">{{ i18n.parentDocDesc || '选择作为标注存储的父文档' }}</div>
                  </div>
                  <div v-if="settings.parentDoc" class="sr-doc-info">
                    <div class="sr-doc-name">{{ settings.parentDoc.name }}</div>
                    <div class="sr-doc-id">{{ settings.parentDoc.id }}</div>
                  </div>
                  <input v-model="docSearch.value.input" class="b3-text-field" :placeholder="i18n.searchDocPlaceholder || '输入文档名搜索，按回车'" @keydown.enter="searchDoc">
                  <Transition name="expand">
                    <div v-if="docSearch.value.show" class="sr-doc-results">
                      <div v-if="!docSearch.value.results.length" class="sr-empty">{{ i18n.noResults || '未找到文档' }}</div>
                      <div v-for="d in docSearch.value.results" :key="d.id" class="sr-doc-item" @click="selectDoc(d)">{{ d.hPath || d.content || '无标题' }}</div>
                    </div>
                  </Transition>
                </div>
              </Transition>
            </div>
            -->

            <div v-motion-pop-visible class="sr-group">
              <h3 class="sr-title">{{ i18n.copySettings || '复制设置' }}</h3>
              <label class="sr-item">
                <span class="sr-label">
                  <b>{{ i18n.linkFormat || '链接格式' }}</b>
                  <small>{{ i18n?.linkFormatDesc || '可用变量：书名 作者 章节 位置 链接 文本 笔记 截图' }}</small>
                </span>
              </label>
              <textarea v-model="settings.linkFormat" class="b3-text-field" rows="2" @input="debouncedSave" style="width:100%;resize:vertical;font-size:12px"/>
            </div>
          </div>

        <!-- Appearance -->
        <div v-else-if="activeTab === 'appearance'" :key="activeTab" class="sr-section">
            <div v-motion-pop-visible class="sr-group">
              <h3 class="sr-title">{{ i18n.themeTitle || i18n.presetTheme }}</h3>
              
              <label class="sr-item">
                <span class="sr-label">
                  <b>{{ i18n.presetTheme }}</b>
                  <small>{{ i18n.presetThemeDesc }}</small>
                </span>
                <select v-model="settings.theme" class="b3-select" @change="save">
                  <option v-for="(theme, key) in PRESET_THEMES" :key="key" :value="key">
                    {{ i18n[theme.name] || theme.name }}
                  </option>
                  <option value="custom">{{ i18n.custom }}</option>
                </select>
              </label>

              <template v-if="settings.theme === 'custom'">
                <label v-for="item in customThemeItems" :key="item.key" class="sr-item">
                  <b>{{ i18n[item.label] }}</b>
                  <input v-model="settings.customTheme[item.key]" :type="item.type" :class="item.type === 'color' ? 'sr-color' : 'b3-text-field'" @change="save">
                </label>
              </template>
            </div>

            <div v-for="group in appearanceGroups" :key="group.title" v-motion-pop-visible class="sr-group">
              <h3 class="sr-title">{{ i18n[group.title] }}</h3>
              
              <label v-for="item in group.items" :key="item.key" class="sr-item">
                <b>{{ i18n[item.key] }}</b>
                <select v-if="item.type === 'select'" v-model="settings[group.title][item.key]" class="b3-select" @change="debouncedSave">
                  <option v-for="(opt, idx) in item.opts" :key="opt" :value="opt">{{ i18n[item.labels[idx]] }}</option>
                </select>
                <span v-else-if="item.type === 'range'" class="sr-slider">
                  <input v-model.number="settings[group.title][item.key]" type="range" class="b3-slider" :min="item.min" :max="item.max" :step="item.step" @input="debouncedSave">
                  <em>{{ settings[group.title][item.key] }}{{ item.unit || '' }}</em>
                </span>
                <input v-else-if="item.type === 'checkbox'" v-model="settings[group.title][item.key]" type="checkbox" class="b3-switch" @change="save">
              </label>
              
              <!-- 字体 -->
              <div v-if="group.title === 'textSettings'" class="sr-fonts">
                <b>
                  {{ i18n.fontFamily }}
                  <button class="b3-button b3-button--text" style="padding:0;margin-left:6px" @click="loadCustomFonts" :disabled="isLoadingFonts" :aria-label="i18n.fontTip">
                    <svg style="width:12px;height:12px"><use xlink:href="#iconRefresh"/></svg>
                  </button>
                </b>
                <small><code>data/plugins/custom-fonts/</code></small>
                <div v-if="settings.textSettings.customFont.fontFamily" class="sr-font-sel" @click="setFont()">
                  <span :style="{fontFamily:settings.textSettings.customFont.fontFamily}">{{ settings.textSettings.customFont.fontFamily }}</span>
                  <small>{{ settings.textSettings.customFont.fontFile }} ✕</small>
                </div>
                <div v-if="isLoadingFonts" class="sr-empty">{{ i18n.loadingFonts }}</div>
                <div v-else-if="customFonts.length" class="sr-font-list">
                  <div v-for="f in customFonts" :key="f.name" class="sr-font-item" :style="{fontFamily:f.displayName}" @click="setFont(f)">{{ f.displayName }}</div>
                </div>
                <div v-else class="sr-empty">{{ i18n.noCustomFonts }}</div>
              </div>

              <button v-if="group.title === 'visualSettings'" class="b3-button b3-button--outline sr-reset" @click="resetStyles">
                {{ i18n.resetToDefault }}
              </button>
            </div>
          </div>


        <!-- Bookshelf -->
        <Bookshelf v-else-if="activeTab === 'bookshelf'" :key="activeTab" :i18n="i18n" @read="handleReadOnline" />

        <!-- Dictionary -->
        <DictMgr v-else-if="activeTab === 'dictionary'" :key="activeTab" />

        <!-- TOC/Bookmark/Mark/Note/Deck -->
        <ReaderToc v-else-if="['toc','bookmark','mark','note','deck'].includes(activeTab)" :key="activeTab" v-model:mode="activeTab" :i18n="props.i18n" />
      </Transition>

      <!-- Search - 使用 v-show 保持状态 -->
      <BookSearch v-show="activeTab === 'search'" :i18n="i18n" @read="handleReadOnline" />
    </main>
  </div>
</template>

<style scoped lang="scss">
.sr-settings{display:flex;height:100%;background:var(--b3-theme-background);
  &.nav-left{flex-direction:row}
  &.nav-right{flex-direction:row-reverse}
  &.nav-top{flex-direction:column}
  &.nav-bottom{flex-direction:column-reverse}
}
.sr-nav{background:var(--b3-theme-background);display:flex;flex-shrink:0;
  .nav-left &,.nav-right &{width:42px;flex-direction:column;border-right:1px solid var(--b3-theme-background-light);padding:8px 0}
  .nav-top &,.nav-bottom &{height:42px;border-bottom:1px solid var(--b3-theme-background-light);padding:0 8px}
  .nav-right &{border-right:0;border-left:1px solid var(--b3-theme-background-light)}
  .nav-bottom &{border-bottom:0;border-top:1px solid var(--b3-theme-background-light)}
}
.sr-nav-tab{display:flex;align-items:center;justify-content:center;padding:10px 8px;border:none;background:transparent;cursor:pointer;transition:var(--b3-transition);color:var(--b3-theme-on-surface);
  svg{width:16px;height:16px}
  &:hover{color:var(--b3-theme-on-background)}
  &--active{color:var(--b3-theme-primary)}
}
.sr-content{flex:1;overflow:hidden;display:flex;flex-direction:column}

.sr-preview {
  position: sticky; top: 0; z-index: 10; margin: 20px 20px 0;
  background: var(--b3-theme-surface); border-radius: 8px; overflow: hidden;
  display: flex; flex-direction: column; transition: max-height .3s;
  column-count: var(--column-count, 1); column-gap: var(--gap);
  max-height: 50px;
  &.expanded { max-height: min(300px, var(--max-block)); }
  p { 
    margin: 0; padding: var(--margin-v) var(--margin-h);
    text-indent: calc(1em * var(--text-indent, 0)); break-inside: avoid;
    & + p { margin-top: calc(1em * var(--paragraph-spacing, 0.8)); }
  }
}
.sr-preview-hf {
  height: 50px; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;
  font-size: 12px; opacity: 0.6; border: 1px dashed currentColor; border-width: 1px 0 0; user-select: none;
  &:first-child { border-width: 0 0 1px; font-weight: 500; }
  &:hover { opacity: 0.8; background: var(--b3-list-hover); }
}
.sr-preview-toggle { width: 14px; height: 14px; transition: transform .3s; }
.sr-preview-body { flex: 1; overflow: auto; min-height: 0; }
.expand-enter-active, .expand-leave-active { transition: all .3s; }
.expand-enter-from, .expand-leave-to { opacity: 0; max-height: 0; }

.sr-section{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:20px}
.sr-group { background: var(--b3-theme-surface); border-radius: 8px; padding: 18px; box-shadow: 0 1px 3px #0000000d; transition: box-shadow .3s; container-type: inline-size;
  &:hover { box-shadow: 0 4px 10px #00000014; }
}
.sr-title { font-size: 15px; font-weight: 600; color: var(--b3-theme-primary); margin: 0 0 14px; }
.sr-item { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 10px 0; flex-wrap: wrap;
  &:not(:last-child) { border-bottom: 1px solid var(--b3-border-color); }
  b { font-size: 13px; font-weight: 500; min-width: max-content; }
  @container (max-width: 500px) { gap: 10px; }
}
.sr-label { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;
  small { font-size: 11px; opacity: .7; line-height: 1.4; }
}
.b3-select { min-width: 130px; }
.sr-slider { display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  input { width: clamp(100px, 20vw, 130px); flex-shrink: 1; }
  em { min-width: 50px; text-align: right; font-size: 12px; font-weight: 500; color: var(--b3-theme-primary); font-style: normal; white-space: nowrap; }
}
.sr-color { width: 55px; height: 34px; padding: 3px; border-radius: 4px; cursor: pointer; border: 1px solid var(--b3-border-color); }
.sr-reset { width: 100%; margin-top: 14px; padding: 9px; font-size: 12px; transition: all .2s;
  &:hover { transform: translateY(-1px); box-shadow: 0 3px 6px #0003; }
}

.sr-fonts { margin-top: 12px; display: flex; flex-direction: column; gap: 8px;
  b { font-size: 13px; font-weight: 500; }
  small code { font-size: 10px; opacity: .7; }
}
.sr-font-sel { 
  padding: 12px; border-radius: 6px; cursor: pointer;
  background: var(--b3-theme-surface); border: 1px solid var(--b3-border-color);
  display: flex; flex-direction: column; gap: 4px;
  span { font-weight: 500; }
  small { font-size: 12px; opacity: 0.65; font-family: monospace; }
  &:hover { background: var(--b3-list-hover); }
}
.sr-font-list { 
  max-height: 250px; overflow-y: auto; border-radius: 6px;
  background: var(--b3-theme-surface); border: 1px solid var(--b3-border-color);
}
.sr-font-item { 
  padding: 10px 12px; cursor: pointer; font-size: 15px;
  border-bottom: 1px solid var(--b3-border-color);
  &:last-child { border-bottom: none; }
  &:hover { background: var(--b3-list-hover); }
}
.sr-empty { padding: 16px; text-align: center; opacity: 0.6; }

.slide-enter-active { transition: all .25s cubic-bezier(.4,0,.2,1); }
.slide-leave-active { transition: all .2s cubic-bezier(.4,0,1,1); }
.slide-enter-from { opacity: 0; transform: translateX(15px); }
.slide-leave-to { opacity: 0; transform: translateX(-15px); }

@media (max-width:640px){
  .sr-settings{flex-direction:column !important}
  .sr-nav{width:100% !important;height:42px !important;flex-direction:row !important;padding:0 4px !important}
  .sr-content{padding:14px}
  .sr-item{flex-direction:column;align-items:flex-start;gap:10px}
  .b3-select,.sr-slider{width:100%}
}
</style>
