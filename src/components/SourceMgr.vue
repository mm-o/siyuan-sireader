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
        <button class="b3-tooltips b3-tooltips__s" @click="batchDelete" aria-label="删除">
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
      <button v-if="invalidCount" class="b3-tooltips b3-tooltips__s" @click="deleteInvalid" aria-label="清理失效">
        <svg><use xlink:href="#lucide-brush-cleaning"/></svg>
      </button>
      <button class="b3-tooltips b3-tooltips__s" @click="emit('close')" aria-label="关闭">
        <svg><use xlink:href="#lucide-panel-top-close"/></svg>
      </button>
    </div>

    <div class="sr-list">
      <div v-for="s in filtered" :key="s.bookSourceUrl" 
           class="sr-card" 
           :class="{off: !s.enabled, bad: status[s.bookSourceUrl]==='invalid', sel: isSelected(s.bookSourceUrl)}">
        <input type="checkbox" class="b3-checkbox" :checked="isSelected(s.bookSourceUrl)" @change="toggleSelect(s.bookSourceUrl)" @click.stop>
        <svg v-if="status[s.bookSourceUrl]==='checking'" class="sr-icon spin"><use xlink:href="#lucide-refresh-cw"/></svg>
        <svg v-else-if="status[s.bookSourceUrl]==='valid'" class="sr-icon ok"><use xlink:href="#lucide-check"/></svg>
        <svg v-else-if="status[s.bookSourceUrl]==='invalid'" class="sr-icon no"><use xlink:href="#lucide-x"/></svg>
        <div class="sr-info" @click="toggle(s)">
          <div class="sr-name">{{ s.bookSourceName }}</div>
          <div class="sr-url">{{ s.bookSourceUrl }}</div>
        </div>
        <button class="sr-btn-icon b3-tooltips b3-tooltips__w" @click.stop="check(s)" aria-label="检测">
          <svg><use xlink:href="#lucide-book-search"/></svg>
        </button>
        <button class="sr-btn-icon b3-tooltips b3-tooltips__w" @click.stop="del(s)" aria-label="删除">
          <svg><use xlink:href="#lucide-eraser"/></svg>
        </button>
      </div>
      
      <div v-if="!filtered.length" class="sr-empty">
        {{ keyword ? '未找到匹配的书源' : '暂无书源' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { bookSourceManager } from '@/core/book'
import { annaArchive } from '@/core/anna'
import { showMessage, Dialog } from 'siyuan'

const props = defineProps<{ i18n?: any }>()
const emit = defineEmits(['close'])

const sources = ref<BookSource[]>([])
const status = ref<Record<string, 'checking'|'valid'|'invalid'>>({})
const checking = ref(false)
const keyword = ref('')
const selected = ref<Set<string>>(new Set())
const stopCheck = ref(false)
const annaEnabled = ref(localStorage.getItem('anna_enabled') === 'true')
const showAnnaMenu = ref(false)
const annaExts = ref<string[]>([])
const annaDomain = ref('')
const annaDomains = ref<string[]>([])
const newDomain = ref('')

const loadAnnaConfig = () => {
  const cfg = annaArchive.getConfig()
  annaExts.value = cfg.filters?.extensions || []
  annaDomain.value = cfg.currentDomain || ''
  annaDomains.value = annaArchive.getAllDomains()
}
const toggleExt = (e: string) => {
  const i = annaExts.value.indexOf(e)
  i > -1 ? annaExts.value.splice(i, 1) : annaExts.value.push(e)
  annaArchive.setExtensionFilter(annaExts.value)
}
const switchDomain = () => {
  annaArchive.switchDomain(annaDomain.value)
  showMessage('域名已切换', 1500)
}
const addDomain = () => {
  if (!newDomain.value.startsWith('http')) return showMessage('请输入完整URL', 2000, 'error')
  annaArchive.addCustomDomain(newDomain.value)
  annaDomains.value = annaArchive.getAllDomains()
  newDomain.value = ''
  showMessage('域名已添加', 1500)
}

const filtered = computed(() => {
  if (!keyword.value) return sources.value
  const k = keyword.value.toLowerCase()
  return sources.value.filter(s => 
    s.bookSourceName.toLowerCase().includes(k) || 
    s.bookSourceUrl.toLowerCase().includes(k) ||
    s.bookSourceGroup?.toLowerCase().includes(k)
  )
})

const invalidCount = computed(() => sources.value.filter(s => status.value[s.bookSourceUrl] === 'invalid').length)
const isSelected = (url: string) => selected.value.has(url)
const reload = () => sources.value = bookSourceManager.getSources()

const toggleSelect = (url: string) => selected.value.has(url) ? selected.value.delete(url) : selected.value.add(url)

const batchEnable = (enable: boolean) => {
  let count = 0
  selected.value.forEach(url => {
    const s = sources.value.find(x => x.bookSourceUrl === url)
    if (s && s.enabled !== enable) {
      s.enabled = enable
      bookSourceManager.addSource(s)
      count++
    }
  })
  reload()
  selected.value.clear()
  showMessage(`${enable ? '启用' : '禁用'} ${count} 个书源`)
}

const batchDelete = () => {
  const count = selected.value.size
  new Dialog({
    title: '批量删除',
    content: `<div class="b3-dialog__content">确定删除 ${count} 个书源？</div>`,
    width: '400px',
    destroyCallback: (options) => {
      if (!options?.confirm) return
      selected.value.forEach(url => {
        bookSourceManager.removeSource(url)
        delete status.value[url]
      })
      reload()
      selected.value.clear()
      showMessage(`删除 ${count} 个书源`)
    }
  })
}

const toggle = (s: BookSource) => {
  s.enabled = !s.enabled
  bookSourceManager.addSource(s)
  reload()
}

const del = (s: BookSource) => {
  new Dialog({
    title: '删除书源',
    content: `<div class="b3-dialog__content">确定删除「${s.bookSourceName}」？</div>`,
    width: '400px',
    destroyCallback: (options) => {
      if (!options?.confirm) return
      bookSourceManager.removeSource(s.bookSourceUrl)
      delete status.value[s.bookSourceUrl]
      reload()
    }
  })
}

const deleteInvalid = () => {
  const invalid = sources.value.filter(s => status.value[s.bookSourceUrl] === 'invalid')
  new Dialog({
    title: '清理失效书源',
    content: `<div class="b3-dialog__content">确定删除 ${invalid.length} 个失效书源？</div>`,
    width: '400px',
    destroyCallback: (options) => {
      if (!options?.confirm) return
      invalid.forEach(s => {
        bookSourceManager.removeSource(s.bookSourceUrl)
        delete status.value[s.bookSourceUrl]
      })
      reload()
      showMessage(`已删除 ${invalid.length} 个`)
    }
  })
}

const testKeywords = ['小说', '网文', '书', '青春']
const check = async (s: BookSource) => {
  if (stopCheck.value) return
  status.value[s.bookSourceUrl] = 'checking'
  for (const kw of testKeywords) {
    if (stopCheck.value) return
    try {
      const results = await Promise.race([
        bookSourceManager.searchBooks(kw, s.bookSourceUrl),
        new Promise<never>((_, rej) => setTimeout(() => rej(), 12000))
      ])
      if (results.length > 0) {
        status.value[s.bookSourceUrl] = 'valid'
        return
      }
    } catch {}
  }
  if (!stopCheck.value) status.value[s.bookSourceUrl] = 'invalid'
}

const checkAll = async () => {
  stopCheck.value = false
  checking.value = true
  const enabled = sources.value.filter(s => s.enabled)
  const batchSize = 5
  for (let i = 0; i < enabled.length && !stopCheck.value; i += batchSize) {
    await Promise.allSettled(enabled.slice(i, i + batchSize).map(check))
  }
  checking.value = false
  const validCount = enabled.filter(s => status.value[s.bookSourceUrl] === 'valid').length
  showMessage(stopCheck.value ? `检测停止: ${validCount} 有效` : `检测完成: ${validCount}/${enabled.length} 有效`)
}

const toggleAnna = () => {
  annaEnabled.value = !annaEnabled.value
  localStorage.setItem('anna_enabled', String(annaEnabled.value))
  const msg = annaEnabled.value ? (props.i18n?.annaEnabled || '已启用安娜的档案') : (props.i18n?.annaDisabled || '已禁用安娜的档案')
  showMessage(msg)
  window.dispatchEvent(new CustomEvent('anna-toggle'))
}

onMounted(async () => {
  await bookSourceManager.loadSources()
  reload()
  loadAnnaConfig()
})

onBeforeUnmount(() => {
  stopCheck.value = true
  checking.value = false
})
</script>

<style scoped lang="scss">
.sr-source-mgr{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--b3-theme-background);z-index:10}
.sr-list{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:4px}
.sr-card{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--b3-theme-surface);border-radius:4px;cursor:pointer;transition:transform .15s;
  &:hover{transform:translateY(-1px)}
  &.off{opacity:.5}
  &.bad{border:1px solid var(--b3-theme-error);background:color-mix(in srgb,var(--b3-theme-error) 5%,transparent)}
  &.sel{border:1px solid var(--b3-theme-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--b3-theme-primary) 20%,transparent)}
}
.b3-checkbox{flex-shrink:0}
.sr-icon{width:16px;height:16px;flex-shrink:0;
  &.spin{animation:spin 1.2s linear infinite}
  &.ok{color:var(--b3-theme-primary)}
  &.no{color:var(--b3-theme-error)}
  &.off{opacity:.5}
}
@keyframes spin{to{transform:rotate(360deg)}}
.sr-info{flex:1;min-width:0}
.sr-name{font-size:13px;font-weight:600;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-url{font-size:11px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-menu{position:absolute;background:var(--b3-theme-surface);border-radius:6px;box-shadow:0 4px 12px #0003;z-index:20}
</style>