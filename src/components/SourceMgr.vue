<template>
  <div class="sr-source-mgr" @click="showAnnaMenu=false">
    <div class="sr-toolbar">
      <input v-model="keyword" placeholder="搜索书源...">
      <template v-if="selected.size">
        <button class="b3-tooltips b3-tooltips__s" @click="batchEnable(true)" aria-label="启用">
          <svg><use xlink:href="#lucide-eye"/></svg>
        </button>
        <button class="b3-tooltips b3-tooltips__s" @click="batchEnable(false)" aria-label="禁用">
          <svg><use xlink:href="#lucide-eye-off"/></svg>
        </button>
        <button class="b3-tooltips b3-tooltips__s" @click="confirmAction='batch'" aria-label="删除">
          <svg><use xlink:href="#lucide-trash-2"/></svg>
        </button>
      </template>
      <button class="b3-tooltips b3-tooltips__s" @click.stop="toggleAnna" @contextmenu.prevent.stop="showAnnaMenu=!showAnnaMenu" :aria-label="annaEnabled?(i18n?.annaEnabled||'安娜已启用'):(i18n?.annaDisabled||'安娜已禁用')">
        <svg :style="{color:annaEnabled?'var(--b3-theme-primary)':''}"><use xlink:href="#lucide-library-big"/></svg>
      </button>
      <div v-if="showAnnaMenu" class="sr-menu" @click.stop style="top:40px;right:8px;width:180px;padding:8px">
        <div style="font-size:10px;opacity:.6;margin-bottom:6px">格式筛选</div>
        <div style="display:flex;gap:4px;margin-bottom:8px">
          <span v-for="e in ['epub','pdf','mobi','azw3']" :key="e" @click="toggleExt(e)" style="padding:3px 8px;border-radius:3px;font-size:10px;cursor:pointer;transition:all .15s" :style="{background:annaExts.includes(e)?'var(--b3-theme-primary)':'var(--b3-theme-background)',color:annaExts.includes(e)?'#fff':'var(--b3-theme-on-surface)'}">{{e.toUpperCase()}}</span>
        </div>
        <select v-model="annaDomain" @change="switchDomain" class="b3-select" style="width:100%;margin-bottom:6px">
          <option v-for="d in annaDomains" :key="d" :value="d">{{d.replace('https://','').replace('annas-archive.','')}}</option>
        </select>
        <input v-model="newDomain" placeholder="https://..." @keyup.enter="addDomain" class="b3-text-field" style="width:100%;margin-bottom:6px">
        <button @click="addDomain" class="b3-button b3-button--outline" style="width:100%">添加</button>
      </div>
      <button v-if="!checking" class="b3-tooltips b3-tooltips__s" @click="checkAll" aria-label="检测书源">
        <svg><use xlink:href="#lucide-list-restart"/></svg>
      </button>
      <button v-else class="b3-tooltips b3-tooltips__s" @click="stopCheck = true" aria-label="停止">
        <svg><use xlink:href="#lucide-hand"/></svg>
      </button>
      <button v-if="invalidCount" class="b3-tooltips b3-tooltips__s" @click="confirmAction='invalid'" aria-label="清理失效">
        <svg><use xlink:href="#lucide-brush-cleaning"/></svg>
      </button>
      <button class="b3-tooltips b3-tooltips__s" @click="emit('close')" aria-label="关闭">
        <svg><use xlink:href="#lucide-panel-top-close"/></svg>
      </button>
    </div>

    <Transition name="slide">
      <div v-if="confirmAction" class="sr-confirm-bar" @click.stop>
        <span>{{ confirmAction==='batch'?`删除 ${selected.size} 个书源`:`删除 ${invalidCount} 个失效书源` }}？</span>
        <button @click="confirmAction=null">取消</button>
        <button @click="execDelete" class="btn-delete">删除</button>
      </div>
    </Transition>

    <div class="sr-list">
      <div v-for="s in filtered" :key="s.bookSourceUrl" 
           class="sr-card" 
           :class="{off:!s.enabled,bad:status[s.bookSourceUrl]==='invalid',sel:isSelected(s.bookSourceUrl)}">
        <input type="checkbox" class="b3-checkbox" :checked="isSelected(s.bookSourceUrl)" @change="toggleSelect(s.bookSourceUrl)" @click.stop>
        <svg v-if="status[s.bookSourceUrl]==='checking'" class="sr-icon spin"><use xlink:href="#lucide-refresh-cw"/></svg>
        <svg v-else-if="status[s.bookSourceUrl]==='valid'" class="sr-icon ok"><use xlink:href="#lucide-check"/></svg>
        <svg v-else-if="status[s.bookSourceUrl]==='invalid'" class="sr-icon no"><use xlink:href="#lucide-x"/></svg>
        <div class="sr-info" @click="toggle(s)">
          <div class="sr-name">{{ s.bookSourceName }}</div>
          <div class="sr-url">{{ s.bookSourceUrl }}</div>
        </div>
        <Transition name="fade">
          <div v-if="removingSource===s.bookSourceUrl" class="sr-confirm" @click.stop>
            <button @click="removingSource=null">取消</button>
            <button @click="execRemove(s)" class="btn-delete">删除</button>
          </div>
        </Transition>
        <template v-if="removingSource!==s.bookSourceUrl">
          <button class="sr-btn b3-tooltips b3-tooltips__w" @click.stop="check(s)" aria-label="检测">
            <svg><use xlink:href="#lucide-book-search"/></svg>
          </button>
          <button class="sr-btn b3-tooltips b3-tooltips__w" @click.stop="removingSource=s.bookSourceUrl" aria-label="删除">
            <svg><use xlink:href="#lucide-eraser"/></svg>
          </button>
        </template>
      </div>
      
      <div v-if="!filtered.length" class="sr-empty">{{ keyword?'未找到匹配的书源':'暂无书源' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { bookSourceManager } from '@/core/book'
import { annaArchive } from '@/core/utils/anna'
import { showMessage } from 'siyuan'

const props = defineProps<{ i18n?: any }>()
const emit = defineEmits(['close'])

const sources = ref<BookSource[]>([])
const status = ref<Record<string, 'checking'|'valid'|'invalid'>>({})
const [checking, keyword, selected, stopCheck, annaEnabled, showAnnaMenu, annaExts, annaDomain, annaDomains, newDomain, removingSource, confirmAction] = 
  [ref(false), ref(''), ref<Set<string>>(new Set()), ref(false), ref(localStorage.getItem('anna_enabled')==='true'), ref(false), ref<string[]>([]), ref(''), ref<string[]>([]), ref(''), ref<string|null>(null), ref<'batch'|'invalid'|null>(null)]

const loadAnnaConfig = () => Object.assign(annaExts.value = annaArchive.getConfig().filters?.extensions || [], annaDomain.value = annaArchive.getConfig().currentDomain || '', annaDomains.value = annaArchive.getAllDomains())
const toggleExt = (e: string) => (annaExts.value.includes(e) ? annaExts.value.splice(annaExts.value.indexOf(e), 1) : annaExts.value.push(e), annaArchive.setExtensionFilter(annaExts.value))
const switchDomain = () => (annaArchive.switchDomain(annaDomain.value), showMessage('域名已切换', 1500))
const addDomain = () => newDomain.value.startsWith('http') ? (annaArchive.addCustomDomain(newDomain.value), annaDomains.value = annaArchive.getAllDomains(), newDomain.value = '', showMessage('域名已添加', 1500)) : showMessage('请输入完整URL', 2000, 'error')

const filtered = computed(() => keyword.value ? sources.value.filter(s => [s.bookSourceName, s.bookSourceUrl, s.bookSourceGroup].some(x => x?.toLowerCase().includes(keyword.value.toLowerCase()))) : sources.value)
const invalidCount = computed(() => sources.value.filter(s => status.value[s.bookSourceUrl] === 'invalid').length)
const isSelected = (url: string) => selected.value.has(url)
const reload = () => sources.value = bookSourceManager.getSources()
const toggleSelect = (url: string) => selected.value.has(url) ? selected.value.delete(url) : selected.value.add(url)

const batchEnable = (enable: boolean) => {
  let count = 0
  selected.value.forEach(url => {
    const s = sources.value.find(x => x.bookSourceUrl === url)
    s && s.enabled !== enable && (s.enabled = enable, bookSourceManager.addSource(s), count++)
  })
  reload()
  selected.value.clear()
  showMessage(`${enable ? '启用' : '禁用'} ${count} 个书源`)
}

const execDelete = () => {
  if (confirmAction.value === 'batch') {
    const count = selected.value.size
    selected.value.forEach(url => (bookSourceManager.removeSource(url), delete status.value[url]))
    selected.value.clear()
    showMessage(`删除 ${count} 个书源`)
  } else {
    const invalid = sources.value.filter(s => status.value[s.bookSourceUrl] === 'invalid')
    invalid.forEach(s => (bookSourceManager.removeSource(s.bookSourceUrl), delete status.value[s.bookSourceUrl]))
    showMessage(`已删除 ${invalid.length} 个`)
  }
  reload()
  confirmAction.value = null
}

const toggle = (s: BookSource) => (s.enabled = !s.enabled, bookSourceManager.addSource(s), reload())
const execRemove = (s: BookSource) => (bookSourceManager.removeSource(s.bookSourceUrl), delete status.value[s.bookSourceUrl], reload(), removingSource.value = null, showMessage('已删除'))

const check = async (s: BookSource) => {
  if (stopCheck.value) return
  status.value[s.bookSourceUrl] = 'checking'
  for (const kw of ['小说', '网文', '书', '青春']) {
    if (stopCheck.value) return
    try {
      const results = await Promise.race([bookSourceManager.searchBooks(kw, s.bookSourceUrl), new Promise<never>((_, rej) => setTimeout(rej, 12000))])
      if (results.length > 0) return status.value[s.bookSourceUrl] = 'valid'
    } catch {}
  }
  !stopCheck.value && (status.value[s.bookSourceUrl] = 'invalid')
}

const checkAll = async () => {
  stopCheck.value = false
  checking.value = true
  const enabled = sources.value.filter(s => s.enabled)
  for (let i = 0; i < enabled.length && !stopCheck.value; i += 5) await Promise.allSettled(enabled.slice(i, i + 5).map(check))
  checking.value = false
  const validCount = enabled.filter(s => status.value[s.bookSourceUrl] === 'valid').length
  showMessage(stopCheck.value ? `检测停止: ${validCount} 有效` : `检测完成: ${validCount}/${enabled.length} 有效`)
}

const toggleAnna = () => (annaEnabled.value = !annaEnabled.value, localStorage.setItem('anna_enabled', String(annaEnabled.value)), showMessage(annaEnabled.value ? (props.i18n?.annaEnabled || '已启用安娜的档案') : (props.i18n?.annaDisabled || '已禁用安娜的档案')), window.dispatchEvent(new CustomEvent('anna-toggle')))

onMounted(async () => (await bookSourceManager.loadSources(), reload(), loadAnnaConfig()))
onBeforeUnmount(() => (stopCheck.value = true, checking.value = false))
</script>

<style scoped lang="scss">
@import './deck/deck.scss';
.sr-source-mgr{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--b3-theme-background);z-index:10}
.sr-confirm-bar{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--b3-theme-border);background:var(--b3-theme-surface);font-size:13px;span{flex:1;font-weight:500}button{padding:6px 12px;font-size:13px;line-height:1.4;border:1px solid var(--b3-border-color);background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);border-radius:4px;cursor:pointer;transition:all .15s;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;&:hover{background:var(--b3-list-hover)}&.btn-delete{background:var(--b3-theme-error)!important;color:white!important;border-color:var(--b3-theme-error)!important;&:hover{opacity:.9!important;background:var(--b3-theme-error)!important}}}}
.slide-enter-active,.slide-leave-active,.fade-enter-active,.fade-leave-active{transition:all .2s}
.slide-enter-from,.slide-leave-to{opacity:0;transform:translateY(-100%)}
.fade-enter-from,.fade-leave-to{opacity:0;transform:scale(.9)}
.sr-list{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:4px}
.sr-card{position:relative;display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--b3-theme-surface);border-radius:4px;cursor:pointer;transition:transform .15s;&:hover{transform:translateY(-1px)}&.off{opacity:.5}&.bad{border:1px solid var(--b3-theme-error);background:color-mix(in srgb,var(--b3-theme-error) 5%,transparent)}&.sel{border:1px solid var(--b3-theme-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--b3-theme-primary) 20%,transparent)}}
.sr-icon{width:16px;height:16px;flex-shrink:0;&.spin{animation:spin 1.2s linear infinite}&.ok{color:var(--b3-theme-primary)}&.no{color:var(--b3-theme-error)}}
@keyframes spin{to{transform:rotate(360deg)}}
.sr-info{flex:1;min-width:0}
.sr-name{font-size:13px;font-weight:600;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-url{font-size:11px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-menu{position:absolute;background:var(--b3-theme-surface);border-radius:6px;box-shadow:0 4px 12px #0003;z-index:20}
.sr-btn{width:28px;height:28px;padding:0;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:4px;transition:background .15s;flex-shrink:0;svg{width:16px;height:16px}&:hover{background:var(--b3-theme-background)}}
</style>