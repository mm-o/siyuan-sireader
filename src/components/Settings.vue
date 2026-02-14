
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { showMessage } from 'siyuan'
import type { ReaderSettings, FontFileInfo } from '@/composables/useSetting'
import { PRESET_THEMES, UI_CONFIG, useSetting, useConfirm } from '@/composables/useSetting'
import BookSearch from './BookSearch.vue'
import Bookshelf from './Bookshelf.vue'
import ReaderToc from './ReaderToc.vue'
import { bookshelfManager } from '@/core/bookshelf'
import { offlineDictManager, onlineDictManager } from '@/core/dict'
import { usePlugin } from '@/main'
import { useReaderState } from '@/core/epub'

const props = defineProps<{ modelValue: ReaderSettings; i18n: any; onSave: () => Promise<void> }>()
const emit = defineEmits<{ 'update:modelValue': [value: ReaderSettings] }>()

// 基础状态
const settings = ref<ReaderSettings>(props.modelValue)
const activeTab = ref<'appearance' | 'bookshelf' | 'search' | 'toc' | 'bookmark' | 'mark' | 'note' | 'deck'>('bookshelf')
const previewExpanded = ref(localStorage.getItem('sr-preview-expanded') !== '0')
const activeAccordion = ref<string>('') // 主手风琴状态（互斥）
const activeSub = ref<string>('') // 子手风琴状态（独立）
const plugin = usePlugin()
const { canShowToc } = useReaderState()
const { customFonts, isLoadingFonts, loadCustomFonts, resetStyles: resetStylesRaw } = useSetting(plugin)
const { interfaceItems, customThemeItems, appearanceGroups } = UI_CONFIG
const { confirming: resetConfirm, handleClick: handleReset } = useConfirm(() => { resetStylesRaw(); save() })

// 同步 props 变化
watch(() => props.modelValue, v => settings.value = v, { immediate: true });

// 词典状态
const offlineDicts = ref<any[]>([])
const onlineDicts = ref<any[]>([])
const fileInput = ref<HTMLInputElement>()
const uploading = ref(false)
const loadingDict = ref(true)
const fontsLoaded = ref(false)
const removingDict = ref<string | null>(null) // 删除词典确认状态

// 手风琴切换（主手风琴互斥）
const toggleAccordion = (key: string) => activeAccordion.value = activeAccordion.value === key ? '' : key
// 子手风琴切换（独立，支持延迟加载字体）
const toggleSub = async (key: string) => {
  activeSub.value = activeSub.value === key ? '' : key
  if (key === 'customFont' && !fontsLoaded.value && activeSub.value === key) await loadFontsOnce()
}
// 词典文件上传
const handleUpload = async (e: Event) => {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length) return
  uploading.value = true
  try {
    await offlineDictManager.addDict(files)
    offlineDicts.value = offlineDictManager.getDicts()
    showMessage(`${props.i18n.addedDict || '添加'} ${files.length} ${props.i18n.dictFiles || '个词典文件'}`, 2000, 'info')
  } catch (e: any) {
    showMessage(e.message || props.i18n.addFailed || '添加失败', 3000, 'error')
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
// 删除离线词典
const removeDict = async (id: string) => { await offlineDictManager.removeDict(id); offlineDicts.value = offlineDictManager.getDicts(); removingDict.value = null; showMessage(props.i18n.deleted || '已删除', 1500, 'info') }
// 切换词典启用状态（通用）
const toggleDict = async (manager: any, ref: any, id: string) => { await manager.toggleDict(id); ref.value = manager.getDicts() }
// 列表项排序（通用）
const moveList = async (ref: any, manager: any, idx: number, dir: number) => {
  const arr = [...ref.value], target = idx + dir
  if (target < 0 || target >= arr.length) return
  ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
  await manager.sortDicts(arr.map((d: any) => d.id))
  ref.value = arr
}
// 导航项排序
const moveNav = (idx: number, dir: number) => {
  const items = navItems.value, target = idx + dir
  if (target < 0 || target >= items.length) return
  ;[items[idx].order, items[target].order] = [items[target].order, items[idx].order]
  settings.value.navItems = [...items]
  save()
}
// 延迟加载字体（仅首次）
const loadFontsOnce = async () => { if (!fontsLoaded.value) { await loadCustomFonts(); fontsLoaded.value = true } }

// 计算属性
const tooltipDir = computed(() => ({ left: 'e', right: 'w', top: 's', bottom: 'n' }[settings.value.navPosition] || 'n'))
// 导航项配置（过滤词典项）
const navItems = computed(() => {
  const items = (settings.value.navItems || [
    { id: 'bookshelf', icon: 'lucide-library-big', tip: 'bookshelf', enabled: true, order: 0 },
    { id: 'search', icon: 'lucide-book-search', tip: 'search', enabled: true, order: 1 },
    { id: 'deck', icon: 'lucide-wallet-cards', tip: '卡包', enabled: true, order: 2 },
    { id: 'toc', icon: 'lucide-scroll-text', tip: '目录', enabled: true, order: 3 },
    { id: 'bookmark', icon: 'lucide-map-pin-check', tip: '书签', enabled: true, order: 4 },
    { id: 'mark', icon: 'lucide-paint-bucket', tip: '标注', enabled: true, order: 5 },
    { id: 'note', icon: 'lucide-map-pin-pen', tip: '笔记', enabled: true, order: 6 },
    { id: 'appearance', icon: 'lucide-settings-2', tip: '设置', enabled: true, order: 7 }
  ]).filter(item => item.id !== 'dictionary')
  return items.sort((a, b) => a.order - b.order)
})
// 可见标签页
const tabs = computed(() => navItems.value.filter(item => item.enabled && (item.id === 'appearance' || item.id === 'bookshelf' || item.id === 'search' || item.id === 'deck' || canShowToc.value)).map(item => ({ id: item.id as any, icon: item.icon, tip: item.tip })))
// 预览样式
const previewStyle = computed(() => {
  const theme = settings.value.theme === 'custom' ? settings.value.customTheme : PRESET_THEMES[settings.value.theme]
  if (!theme) return {}
  const { textSettings: t, paragraphSettings: p, layoutSettings: l, visualSettings: v, viewMode } = settings.value
  const filters = [v.brightness !== 1 && `brightness(${v.brightness})`, v.contrast !== 1 && `contrast(${v.contrast})`, v.sepia > 0 && `sepia(${v.sepia})`, v.saturate !== 1 && `saturate(${v.saturate})`, v.invert && 'invert(1) hue-rotate(180deg)'].filter(Boolean).join(' ')
  const fontFamily = t.fontFamily === 'custom' && t.customFont.fontFamily ? `"${t.customFont.fontFamily}", sans-serif` : t.fontFamily || 'inherit'
  return { color: theme.color, backgroundColor: theme.bgImg ? 'transparent' : theme.bg, backgroundImage: theme.bgImg ? `url("${theme.bgImg}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', fontFamily, fontSize: `${t.fontSize}px`, letterSpacing: `${t.letterSpacing}em`, lineHeight: p.lineHeight, filter: filters || 'none', '--paragraph-spacing': p.paragraphSpacing, '--text-indent': p.textIndent, '--margin-h': `${l.marginHorizontal}px`, '--margin-v': `${l.marginVertical}px`, '--gap': `${l.gap}%`, '--header-footer': `${l.headerFooterMargin}px`, '--max-block': l.maxBlockSize > 0 ? `${l.maxBlockSize}px` : 'none', '--column-count': viewMode === 'double' ? 2 : 1 }
})

// 保存
const save = async () => (emit('update:modelValue', settings.value), await props.onSave());
const debouncedSave = (() => { let t: any; return () => (clearTimeout(t), t = setTimeout(save, 300)); })();
const setFont = (f?: FontFileInfo) => (settings.value.textSettings.fontFamily = f ? 'custom' : 'inherit', settings.value.textSettings.customFont = f ? { fontFamily: f.displayName, fontFile: f.name } : { fontFamily: '', fontFile: '' }, f ? debouncedSave() : save());
const handleReadOnline = async (book: any) => { const { openOrActivateBook } = await import('@/utils/bookOpen'); openOrActivateBook(plugin, book, settings.value); };
const togglePreview = () => (previewExpanded.value = !previewExpanded.value, localStorage.setItem('sr-preview-expanded', previewExpanded.value ? '1' : '0'));

// 生命周期
onMounted(() => {
  bookshelfManager.init()
  loadingDict.value = true
  // 只初始化离线词典管理器，在线词典不需要初始化
  offlineDictManager.init(plugin).then(() => {
    offlineDicts.value = offlineDictManager.getDicts()
    onlineDicts.value = onlineDictManager.getDicts()
  }).finally(() => loadingDict.value = false)
})
watch(canShowToc, (show) => !show && ['toc', 'bookmark', 'mark', 'note'].includes(activeTab.value) && (activeTab.value = 'bookshelf'))
</script>

<template>
  <div class="sr-settings" :class="`nav-${settings.navPosition}`">
    <nav class="sr-nav">
      <button v-for="tab in tabs" :key="tab.id" class="sr-nav-tab b3-tooltips" :class="[{'sr-nav-tab--active':activeTab===tab.id},`b3-tooltips__${tooltipDir}`]" :aria-label="i18n?.[tab.tip]||tab.tip" @click="activeTab=tab.id"><svg><use :xlink:href="'#'+tab.icon"/></svg></button>
    </nav>
    <main class="sr-content">
      <div v-if="activeTab==='appearance'" class="sr-preview" :class="{expanded:previewExpanded}" :style="previewStyle">
        <div class="sr-preview-hf" @click="togglePreview"><span>{{i18n.livePreview||'实时预览'}}</span><svg class="sr-preview-toggle"><use :xlink:href="previewExpanded?'#iconContract':'#iconExpand'"/></svg></div>
        <Transition name="expand"><div v-show="previewExpanded" class="sr-preview-body"><p>春江潮水连海平，海上明月共潮生。</p><p>滟滟随波千万里，何处春江无月明。</p></div></Transition>
        <div v-if="previewExpanded" class="sr-preview-hf">{{settings.viewMode==='double'?'双页':settings.viewMode==='scroll'?'连续滚动':'单页'}}</div>
      </div>
      <Transition name="slide" mode="out-in">
        <div v-if="activeTab==='appearance'" :key="activeTab" class="sr-section">
          <div class="ds-card ds-accordion" @click="toggleAccordion('interface')">
            <h3>{{i18n.interfaceLayout||'界面布局'}}<svg class="ds-arrow" :class="{expanded:activeAccordion==='interface'}" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></h3>
            <Transition name="expand">
              <div v-if="activeAccordion==='interface'" @click.stop>
                <div v-for="item in interfaceItems" :key="item.key" class="ds-field" :class="{switch:item.type==='checkbox',select:item.opts}">
                  <label>{{i18n[item.key]||item.key}}</label>
                  <select v-if="item.opts" v-model="settings[item.key]" class="b3-select" @change="save"><option v-for="opt in item.opts" :key="opt" :value="opt">{{i18n[opt]||opt}}</option></select>
                  <div v-else-if="item.type==='range'" class="ds-range"><input v-model.number="settings[item.key]" type="range" class="b3-slider" :min="item.min" :max="item.max" :step="item.step" @input="debouncedSave"><span>{{settings[item.key]}}{{item.unit}}</span></div>
                  <input v-else-if="item.type==='checkbox'" v-model="settings[item.key]" type="checkbox" class="b3-switch" @change="save">
                  <small v-if="i18n[item.key+'Desc']">{{i18n[item.key+'Desc']}}</small>
                </div>
                <div class="ds-divider"></div>
                <div class="ds-sub-accordion" @click.stop="toggleSub('navItems')">
                  <div class="ds-sub-title">{{i18n.navConfig||'导航栏配置'}}<svg class="ds-arrow" :class="{expanded:activeSub==='navItems'}" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div>
                  <Transition name="expand">
                    <div v-if="activeSub==='navItems'" class="ds-list">
                      <div v-for="(item,idx) in navItems" :key="item.id" class="ds-list-item">
                        <input v-model="item.enabled" type="checkbox" class="b3-checkbox" :disabled="item.id==='appearance'" @change="save">
                        <span class="ds-list-label">{{i18n[item.tip]||item.tip}}</span>
                        <div class="ds-list-btns">
                          <button v-if="idx>0" @click="moveNav(idx,-1)" class="ds-list-btn">↑</button>
                          <button v-if="idx<navItems.length-1" @click="moveNav(idx,1)" class="ds-list-btn">↓</button>
                        </div>
                      </div>
                    </div>
                  </Transition>
                </div>
              </div>
            </Transition>
          </div>
          <div class="ds-card ds-accordion" @click="toggleAccordion('theme')">
            <h3>{{i18n.readingTheme||'阅读主题'}}<svg class="ds-arrow" :class="{expanded:activeAccordion==='theme'}" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></h3>
            <Transition name="expand">
              <div v-if="activeAccordion==='theme'" @click.stop>
                <div class="ds-field select">
                  <label>{{i18n.presetTheme||'预设主题'}}</label>
                  <select v-model="settings.theme" class="b3-select" @change="save">
                    <option v-for="(theme,key) in PRESET_THEMES" :key="key" :value="key">{{i18n[theme.name]||theme.name}}</option>
                    <option value="custom">{{i18n.custom||'自定义'}}</option>
                  </select>
                  <small>{{i18n.presetThemeDesc}}</small>
                </div>
                <Transition name="expand">
                  <div v-if="settings.theme==='custom'">
                    <div class="ds-divider"></div>
                    <div v-for="item in customThemeItems" :key="item.key" class="ds-field">
                      <label>{{i18n[item.label]}}</label>
                      <input v-model="settings.customTheme[item.key]" :type="item.type" :class="item.type==='color'?'ds-color':'b3-text-field'" @change="save">
                    </div>
                  </div>
                </Transition>
              </div>
            </Transition>
          </div>
          <div v-for="group in appearanceGroups" :key="group.title" class="ds-card ds-accordion" @click="toggleAccordion(group.title)">
            <h3>{{i18n[group.title]}}<svg class="ds-arrow" :class="{expanded:activeAccordion===group.title}" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></h3>
            <Transition name="expand">
              <div v-if="activeAccordion===group.title" @click.stop>
                <div v-for="item in group.items" :key="item.key" class="ds-field" :class="{switch:item.type==='checkbox',select:item.type==='select'}">
                  <label>{{i18n[item.key]}}</label>
                  <select v-if="item.type==='select'" v-model="settings[group.title][item.key]" class="b3-select" @change="debouncedSave"><option v-for="(opt,idx) in item.opts" :key="opt" :value="opt">{{i18n[item.labels[idx]]}}</option></select>
                  <div v-else-if="item.type==='range'" class="ds-range"><input v-model.number="settings[group.title][item.key]" type="range" class="b3-slider" :min="item.min" :max="item.max" :step="item.step" @input="debouncedSave"><span>{{settings[group.title][item.key]}}{{item.unit||''}}</span></div>
                  <input v-else-if="item.type==='checkbox'" v-model="settings[group.title][item.key]" type="checkbox" class="b3-switch" @change="save">
                </div>
                <template v-if="group.title==='textSettings'">
                  <div class="ds-divider"></div>
                  <div class="ds-sub-accordion" @click.stop="toggleSub('customFont')">
                    <div class="ds-sub-title">{{i18n.customFont||'自定义字体'}}<svg class="ds-arrow" :class="{expanded:activeSub==='customFont'}" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div>
                    <Transition name="expand">
                      <div v-if="activeSub==='customFont'">
                        <small class="ds-hint"><code>data/plugins/custom-fonts/</code> <button class="ds-link-btn" @click.stop="loadCustomFonts" :disabled="isLoadingFonts">{{i18n.fontTip||'刷新'}}</button></small>
                        <div v-if="settings.textSettings.customFont.fontFamily" class="ds-font-sel" @click.stop="setFont()"><span :style="{fontFamily:settings.textSettings.customFont.fontFamily}">{{settings.textSettings.customFont.fontFamily}}</span><small>{{settings.textSettings.customFont.fontFile}} ✕</small></div>
                        <div v-if="isLoadingFonts" class="sr-empty">{{i18n.loadingFonts}}</div>
                        <div v-else-if="customFonts.length" class="ds-font-list"><div v-for="f in customFonts" :key="f.name" class="ds-font-item" :style="{fontFamily:f.displayName}" @click.stop="setFont(f)">{{f.displayName}}</div></div>
                        <div v-else class="sr-empty">{{i18n.noCustomFonts}}</div>
                      </div>
                    </Transition>
                  </div>
                </template>
              </div>
            </Transition>
          </div>
          <div class="ds-card ds-accordion" @click="toggleAccordion('dictionary')">
            <h3>{{i18n.dictionaryTools||'词典工具'}}<svg class="ds-arrow" :class="{expanded:activeAccordion==='dictionary'}" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></h3>
            <Transition name="expand">
              <div v-if="activeAccordion==='dictionary'" @click.stop>
                <div v-if="loadingDict" class="sr-empty">{{i18n.loading||'加载中...'}}</div>
                <template v-else>
                  <div class="ds-sub-accordion" @click.stop="toggleSub('offlineDict')">
                    <div class="ds-sub-title">{{i18n.offlineDict||'离线词典'}}<svg class="ds-arrow" :class="{expanded:activeSub==='offlineDict'}" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div>
                    <Transition name="expand">
                      <div v-if="activeSub==='offlineDict'">
                        <input ref="fileInput" type="file" multiple accept=".ifo,.idx,.dz,.index,.syn" style="display:none" @change="handleUpload">
                        <button class="ds-btn-add" :disabled="uploading" @click.stop="fileInput?.click()"><svg><use xlink:href="#iconUpload"/></svg>{{uploading?(i18n.uploading||'上传中...'):(i18n.addDict||'添加词典')}}</button>
                        <small class="ds-hint">{{i18n.dictFormatHint||'支持 StarDict 和 dictd 格式'}} <a href="https://github.com/mm-o/siyuan-sireader/blob/main/docs/离线词典使用说明.md" target="_blank">{{i18n.downloadDict||'下载词典'}}</a></small>
                        <small v-if="!offlineDicts.length" class="ds-hint">{{i18n.noDicts||'暂无离线词典'}}</small>
                        <div v-else class="ds-list"><div v-for="(d,idx) in offlineDicts" :key="d.id" class="ds-list-item"><input type="checkbox" :checked="d.enabled" class="b3-checkbox" @change="toggleDict(offlineDictManager,offlineDicts,d.id)"><div class="ds-list-label"><div>{{d.name}}</div><small>{{d.type==='stardict'?'StarDict':'dictd'}}</small></div><Transition name="fade"><div v-if="removingDict===d.id" class="sr-confirm" @click.stop><button @click="removingDict=null">{{i18n.cancel||'取消'}}</button><button @click="removeDict(d.id)" class="btn-delete">{{i18n.delete||'删除'}}</button></div></Transition><div v-if="removingDict!==d.id" class="ds-list-btns"><button v-if="idx>0" @click.stop="moveList(offlineDicts,offlineDictManager,idx,-1)" class="ds-list-btn">↑</button><button v-if="idx<offlineDicts.length-1" @click.stop="moveList(offlineDicts,offlineDictManager,idx,1)" class="ds-list-btn">↓</button><button @click.stop="removingDict=d.id" class="ds-list-btn ds-list-btn-del">×</button></div></div></div>
                      </div>
                    </Transition>
                  </div>
                  <div class="ds-divider"></div>
                  <div class="ds-sub-accordion" @click.stop="toggleSub('onlineDict')">
                    <div class="ds-sub-title">{{i18n.onlineDict||'在线词典'}}<svg class="ds-arrow" :class="{expanded:activeSub==='onlineDict'}" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div>
                    <Transition name="expand">
                      <div v-if="activeSub==='onlineDict'" class="ds-list"><div v-for="(d,idx) in onlineDicts" :key="d.id" class="ds-list-item"><input type="checkbox" :checked="d.enabled" class="b3-checkbox" @change="toggleDict(onlineDictManager,onlineDicts,d.id)"><div class="ds-list-label"><div>{{d.name}}</div><small>{{d.desc}}</small></div><div class="ds-list-btns"><button v-if="idx>0" @click="moveList(onlineDicts,onlineDictManager,idx,-1)" class="ds-list-btn">↑</button><button v-if="idx<onlineDicts.length-1" @click="moveList(onlineDicts,onlineDictManager,idx,1)" class="ds-list-btn">↓</button></div></div></div>
                    </Transition>
                  </div>
                </template>
              </div>
            </Transition>
          </div>
          <div class="ds-card ds-accordion" @click="toggleAccordion('other')">
            <h3>{{i18n.otherSettings||'其他设置'}}<svg class="ds-arrow" :class="{expanded:activeAccordion==='other'}" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></h3>
            <Transition name="expand">
              <div v-if="activeAccordion==='other'" @click.stop>
                <div class="ds-field">
                  <label>{{i18n.linkFormat||'链接格式'}}</label>
                  <textarea v-model="settings.linkFormat" class="b3-text-field" rows="4" @input="debouncedSave"/>
                  <small>{{i18n?.linkFormatDesc||'可用变量：书名 作者 章节 位置 链接 文本 笔记 截图'}}</small>
                </div>
              </div>
            </Transition>
          </div>
          <Transition name="fade" mode="out-in">
            <div v-if="resetConfirm" key="confirm" class="ds-reset-group">
              <button @click="resetConfirm=false">{{i18n.cancel||'取消'}}</button>
              <button class="ds-reset-confirm" @click="handleReset">{{i18n.confirm||'确认重置'}}</button>
            </div>
            <button v-else key="reset" class="ds-reset" @click="handleReset">{{i18n.resetDefault||'重置为默认'}}</button>
          </Transition>
        </div>
        <Bookshelf v-else-if="activeTab==='bookshelf'" :key="activeTab" :i18n="i18n" @read="handleReadOnline"/>
        <ReaderToc v-else-if="['toc','bookmark','mark','note','deck'].includes(activeTab)" :key="activeTab" v-model:mode="activeTab" :i18n="props.i18n"/>
      </Transition>
      <BookSearch v-show="activeTab==='search'" :i18n="i18n" @read="handleReadOnline"/>
    </main>
  </div>
</template>

<style scoped lang="scss">
@use './deck/deck.scss';
.sr-settings{display:flex;height:100%;background:var(--b3-theme-background);&.nav-left{flex-direction:row}&.nav-right{flex-direction:row-reverse}&.nav-top{flex-direction:column}&.nav-bottom{flex-direction:column-reverse}}
.sr-nav{background:var(--b3-theme-background);display:flex;flex-shrink:0;.nav-left &,.nav-right &{width:42px;flex-direction:column;border-right:1px solid var(--b3-theme-background-light);padding:8px 0}.nav-top &,.nav-bottom &{height:42px;border-bottom:1px solid var(--b3-theme-background-light);padding:0 8px}.nav-right &{border-right:0;border-left:1px solid var(--b3-theme-background-light)}.nav-bottom &{border-bottom:0;border-top:1px solid var(--b3-theme-background-light)}}
.sr-nav-tab{display:flex;align-items:center;justify-content:center;padding:10px 8px;border:none;background:transparent;cursor:pointer;transition:var(--b3-transition);color:var(--b3-theme-on-surface);svg{width:16px;height:16px}&:hover{color:var(--b3-theme-on-background)}&--active{color:var(--b3-theme-primary)}}
.sr-content{flex:1;overflow:hidden;display:flex;flex-direction:column}
.sr-preview{position:sticky;top:0;z-index:10;margin:20px 20px 0;background:var(--b3-theme-surface);border-radius:8px;overflow:hidden;display:flex;flex-direction:column;transition:max-height .3s;column-count:var(--column-count,1);column-gap:var(--gap);max-height:50px;&.expanded{max-height:min(300px,var(--max-block))}p{margin:0;padding:var(--margin-v) var(--margin-h);text-indent:calc(1em * var(--text-indent,0));break-inside:avoid;& + p{margin-top:calc(1em * var(--paragraph-spacing,0.8))}}}
.sr-preview-hf{height:50px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-size:12px;opacity:.6;border:1px dashed currentColor;border-width:1px 0 0;user-select:none;&:first-child{border-width:0 0 1px;font-weight:500}&:hover{opacity:.8;background:var(--b3-list-hover)}}
.sr-preview-toggle{width:14px;height:14px;transition:transform .3s}
.sr-preview-body{flex:1;overflow:auto;min-height:0}
.ds-color{width:55px;height:34px;padding:3px;border-radius:4px;cursor:pointer;border:1px solid var(--b3-border-color)}
.ds-font-sel{padding:12px;border-radius:6px;cursor:pointer;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);display:flex;flex-direction:column;gap:4px;margin-top:8px;span{font-weight:500}small{font-size:12px;opacity:.65;font-family:monospace}&:hover{background:var(--b3-list-hover)}}
.ds-font-list{max-height:250px;overflow-y:auto;border-radius:6px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);margin-top:8px}
.ds-font-item{padding:10px 12px;cursor:pointer;font-size:15px;border-bottom:1px solid var(--b3-border-color);&:last-child{border-bottom:none}&:hover{background:var(--b3-list-hover)}}
.ds-divider{height:1px;background:var(--b3-border-color);margin:16px 0}
.ds-sub-accordion{cursor:pointer;user-select:none;margin-top:8px;&:hover .ds-sub-title{color:var(--b3-theme-primary)}}
.ds-sub-title{font-size:13px;font-weight:600;color:var(--b3-theme-primary);display:flex;align-items:center;justify-content:space-between;padding:8px 0;transition:color .15s;svg{width:16px;height:16px;fill:currentColor;opacity:.7;transition:transform .2s;flex-shrink:0}&:has(svg.expanded) svg,svg.expanded{transform:rotate(180deg)}}
.ds-hint{display:block;font-size:11px;color:var(--b3-theme-on-surface-variant);opacity:.7;margin:8px 0;line-height:1.5;a{color:var(--b3-theme-primary);text-decoration:none;&:hover{text-decoration:underline}}code{background:var(--b3-theme-background);padding:2px 6px;border-radius:3px;font-size:10px}}
.ds-link-btn{padding:2px 8px;margin-left:6px;border:1px solid var(--b3-border-color);background:transparent;color:var(--b3-theme-primary);border-radius:3px;cursor:pointer;font-size:11px;transition:all .15s;&:hover:not(:disabled){background:var(--b3-list-hover)}&:disabled{opacity:.5;cursor:not-allowed}}
.ds-btn-add{width:100%;padding:8px 12px;margin-bottom:8px;border:1px dashed var(--b3-border-color);background:transparent;color:var(--b3-theme-on-surface);border-radius:4px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;svg{width:14px;height:14px}&:hover:not(:disabled){background:var(--b3-list-hover);border-color:var(--b3-theme-primary);color:var(--b3-theme-primary)}&:disabled{opacity:.5;cursor:not-allowed}}
.ds-list{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.ds-list-item{position:relative;display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:4px;transition:background .15s;&:hover{background:var(--b3-list-hover)}.sr-confirm{position:absolute;right:4px;top:50%;transform:translateY(-50%)}}
.ds-list-label{flex:1;font-size:13px;min-width:0;div{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}small{display:block;font-size:11px;opacity:.6;margin-top:2px}}
.ds-list-btns{display:flex;gap:4px;flex-shrink:0}
.ds-list-btn{width:24px;height:24px;padding:0;border:1px solid var(--b3-border-color);background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);border-radius:4px;cursor:pointer;font-size:14px;line-height:1;transition:all .15s;&:hover{background:var(--b3-list-hover)}&:active{transform:scale(.95)}}
.ds-list-btn-del{color:var(--b3-theme-error);&:hover{background:var(--b3-theme-error);color:white;border-color:var(--b3-theme-error)}}
@media (max-width:640px){.sr-settings{flex-direction:column !important}.sr-nav{width:100% !important;height:42px !important;flex-direction:row !important;padding:0 4px !important}}
</style>
