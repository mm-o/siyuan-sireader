<template>
  <div class="sr-mgr">
    <div class="sr-toolbar" v-motion-slide-visible-once-bottom>
      <div class="sr-select" v-motion-pop-visible>
        <input type="checkbox" :checked="allSelected" @change="toggleAll" class="sr-checkbox">
        <span class="sr-label">{{ allSelected ? '取消全选' : '全选' }}({{ filtered.length }})</span>
      </div>
      
      <div v-if="selected.length" v-motion-slide-left class="sr-batch">
        <button class="sr-btn sr-btn-primary" @click="batchEnable(true)">
          <svg><use xlink:href="#iconEye"></use></svg>启用{{ selected.length }}
        </button>
        <button class="sr-btn sr-btn-secondary" @click="batchEnable(false)">
          <svg><use xlink:href="#iconEyeoff"></use></svg>禁用{{ selected.length }}
        </button>
        <button class="sr-btn sr-btn-danger" @click="batchDelete">
          <svg><use xlink:href="#iconTrashcan"></use></svg>删除{{ selected.length }}
        </button>
      </div>
      
      <div class="sr-search">
        <svg class="sr-icon"><use xlink:href="#iconSearch"></use></svg>
        <input v-model="keyword" class="b3-text-field" placeholder="搜索书源..." @input="onSearch">
        <button v-if="keyword" class="sr-clear" @click="keyword='';onSearch()">
          <svg><use xlink:href="#iconClose"></use></svg>
        </button>
      </div>
      
      <button v-if="!checking" class="sr-btn sr-btn-outline" @click="checkAll" v-motion-pop-visible>
        <svg><use xlink:href="#iconRefresh"></use></svg>检测全部
      </button>
      <button v-else class="sr-btn sr-btn-danger" @click="stopCheck = true" v-motion-pop-visible>
        <svg><use xlink:href="#iconClose"></use></svg>停止({{ progress }}/{{ total }})
      </button>
      
      <button v-if="invalid.length" class="sr-btn sr-btn-warning" @click="deleteInvalid" v-motion-pop-visible>
        <svg><use xlink:href="#iconTrashcan"></use></svg>清理失效{{ invalid.length }}
      </button>
    </div>

    <div class="sr-list">
      <div v-for="s in filtered" :key="s.bookSourceUrl" v-motion-pop-visible 
           class="sr-card" :class="{off: !s.enabled, bad: status[s.bookSourceUrl]==='invalid', sel: selected.includes(s.bookSourceUrl)}">
        <input type="checkbox" :checked="selected.includes(s.bookSourceUrl)" @change="toggleSelect(s.bookSourceUrl)" class="sr-item-checkbox" @click.stop>
        <div class="sr-status">
          <svg v-if="status[s.bookSourceUrl]==='checking'" class="spin"><use xlink:href="#iconRefresh"></use></svg>
          <svg v-else-if="status[s.bookSourceUrl]==='valid'" class="ok"><use xlink:href="#iconCheck"></use></svg>
          <svg v-else-if="status[s.bookSourceUrl]==='invalid'" class="no"><use xlink:href="#iconClose"></use></svg>
        </div>
        <div class="sr-info">
          <div class="sr-name">{{ s.bookSourceName }}</div>
          <div class="sr-url">{{ s.bookSourceUrl }}</div>
          <span v-if="s.bookSourceGroup" class="sr-tag">{{ s.bookSourceGroup }}</span>
        </div>
        <div class="sr-actions">
          <button class="b3-button b3-button--text" @click.stop="toggle(s)" :title="s.enabled?'禁用':'启用'">
            <svg><use :xlink:href="s.enabled?'#iconEye':'#iconEyeoff'"></use></svg>
          </button>
          <button class="b3-button b3-button--text" @click.stop="check(s)" title="测试">
            <svg><use xlink:href="#iconRefresh"></use></svg>
          </button>
          <button class="b3-button b3-button--text" @click.stop="del(s)" title="删除">
            <svg><use xlink:href="#iconTrashcan"></use></svg>
          </button>
        </div>
      </div>
      
      <Transition name="fade">
        <div v-if="!filtered.length" class="sr-empty">
          {{ keyword ? '未找到匹配的书源' : '暂无书源' }}
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { bookSourceManager } from '@/core/book'
import { showMessage, Dialog } from 'siyuan'

const sources = ref<BookSource[]>([])

onMounted(async () => {
  await bookSourceManager.loadSources()
  sources.value = bookSourceManager.getSources()
})
const status = ref<Record<string, 'checking'|'valid'|'invalid'>>({})
const checking = ref(false)
const progress = ref(0)
const keyword = ref('')
const selected = ref<string[]>([])
const stopCheck = ref(false)

const total = computed(() => sources.value.filter(s => s.enabled).length)
const invalid = computed(() => sources.value.filter(s=>status.value[s.bookSourceUrl]==='invalid'))
const filtered = computed(() => {
  if (!keyword.value) return sources.value
  const k = keyword.value.toLowerCase()
  return sources.value.filter(s => 
    s.bookSourceName.toLowerCase().includes(k) || 
    s.bookSourceUrl.toLowerCase().includes(k) ||
    s.bookSourceGroup?.toLowerCase().includes(k)
  )
})
const allSelected = computed(() => filtered.value.length > 0 && selected.value.length === filtered.value.length)

const reload = () => sources.value = bookSourceManager.getSources()
const onSearch = () => {}

const toggleAll = () => {
  if (allSelected.value) selected.value = []
  else selected.value = filtered.value.map(s => s.bookSourceUrl)
}

const toggleSelect = (url: string) => {
  const idx = selected.value.indexOf(url)
  if (idx > -1) selected.value.splice(idx, 1)
  else selected.value.push(url)
}

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
  selected.value = []
  showMessage(`${enable?'启用':'禁用'} ${count} 个书源`)
}

const batchDelete = () => {
  if (!confirm(`删除 ${selected.value.length} 个书源？`)) return
  selected.value.forEach(url => {
    bookSourceManager.removeSource(url)
    delete status.value[url]
  })
  const count = selected.value.length
  reload()
  selected.value = []
  showMessage(`删除 ${count} 个书源`)
}

const toggle = (s: BookSource) => {
  s.enabled = !s.enabled
  bookSourceManager.addSource(s)
  reload()
}

const del = (s: BookSource) => {
  if (!confirm(`删除「${s.bookSourceName}」？`)) return
  bookSourceManager.removeSource(s.bookSourceUrl)
  delete status.value[s.bookSourceUrl]
  reload()
}

const deleteInvalid = () => {
  if (!confirm(`删除${invalid.value.length}个失效书源？`)) return
  invalid.value.forEach(s => {
    bookSourceManager.removeSource(s.bookSourceUrl)
    delete status.value[s.bookSourceUrl]
  })
  reload()
  showMessage(`已删除${invalid.value.length}个`)
}

const testKeywords = ['小说', '网文', '书', '青春']
const check = async (s: BookSource) => {
  if (stopCheck.value) return
  status.value[s.bookSourceUrl] = 'checking'
  for (const keyword of testKeywords) {
    if (stopCheck.value) return
    try {
      const results = await Promise.race([
        bookSourceManager.searchBooks(keyword, s.bookSourceUrl),
        new Promise<never>((_, rej) => setTimeout(() => rej(), 12000))
      ])
      if (results.length > 0) {
        status.value[s.bookSourceUrl] = 'valid'
        return
      }
    } catch { /* 继续下一个关键词 */ }
  }
  !stopCheck.value && (status.value[s.bookSourceUrl] = 'invalid')
}

const checkAll = async () => {
  stopCheck.value = false
  checking.value = true
  progress.value = 0
  const enabled = sources.value.filter(s => s.enabled)
  const batchSize = 5
  for (let i = 0; i < enabled.length && !stopCheck.value; i += batchSize) {
    const batch = enabled.slice(i, i + batchSize)
    await Promise.allSettled(batch.map(check))
    progress.value = Math.min(i + batchSize, enabled.length)
  }
  checking.value = false
  const ok = enabled.filter(s => status.value[s.bookSourceUrl] === 'valid').length
  showMessage(stopCheck.value 
    ? `检测停止: ${ok}/${progress.value}有效`
    : `检测完成: ${ok}/${enabled.length}有效`)
}

onBeforeUnmount(() => {
  stopCheck.value = true
  checking.value = false
})
</script>

<style scoped lang="scss">
.sr-mgr { display:flex; flex-direction:column; height:100%; }
.sr-toolbar { position:sticky; top:0; z-index:10; display:flex; gap:6px; padding:8px 12px; background:var(--b3-theme-surface); border-radius:0 0 6px 6px; margin:0 12px 12px; box-shadow:0 2px 4px #00000014; align-items:center; flex-wrap:wrap; }
.sr-select { display:flex; align-items:center; gap:6px; padding:4px 8px; border-radius:4px; cursor:pointer; transition:all .2s; user-select:none;
  &:hover { background:var(--b3-list-hover); }
}
.sr-checkbox { width:16px; height:16px; cursor:pointer; accent-color:var(--b3-theme-primary); }
.sr-label { font-size:12px; font-weight:500; color:var(--b3-theme-on-surface); }
.sr-batch { display:flex; gap:4px; }
.sr-btn { display:flex; align-items:center; gap:4px; padding:4px 8px; border:none; border-radius:4px; font-size:11px; font-weight:500; cursor:pointer; transition:all .2s; white-space:nowrap;
  svg { width:12px; height:12px; }
  &:hover { transform:translateY(-1px); box-shadow:0 2px 4px #0000001a; }
}
.sr-btn-primary { background:var(--b3-theme-primary); color:white; &:hover { background:color-mix(in srgb, var(--b3-theme-primary) 90%, black); } }
.sr-btn-secondary { background:var(--b3-theme-surface-lighter); color:var(--b3-theme-on-surface); &:hover { background:var(--b3-list-hover); } }
.sr-btn-danger { background:#dc3545; color:white; &:hover { background:#c82333; } }
.sr-btn-warning { background:#ff9800; color:white; &:hover { background:#f57c00; } }
.sr-btn-outline { background:transparent; color:var(--b3-theme-on-surface); border:1px solid var(--b3-border-color); &:hover { background:var(--b3-list-hover); } }
.sr-search { flex:1; min-width:200px; position:relative; display:flex; align-items:center;
  input { padding-left:36px; padding-right:36px; }
}
.sr-icon { position:absolute; left:10px; width:16px; height:16px; opacity:.5; pointer-events:none; }
.sr-clear { position:absolute; right:8px; padding:4px; background:none; border:none; cursor:pointer; opacity:.5; transition:all .2s;
  &:hover { opacity:1; transform:rotate(90deg); }
  svg { width:12px; height:12px; }
}
.sr-list { flex:1; overflow-y:auto; padding:12px 16px 16px; }
.sr-card { display:flex; align-items:center; gap:10px; padding:12px; margin-bottom:10px; background:var(--b3-theme-surface); border:1px solid var(--b3-border-color); border-radius:8px; box-shadow:0 1px 3px #0000000d; transition:all .3s cubic-bezier(.4,0,.2,1); cursor:pointer;
  &:hover { box-shadow:0 4px 10px #00000014; transform:translateY(-2px); }
  &.off { opacity:.45; filter:grayscale(.5); }
  &.bad { border:1px solid #f44336; background:linear-gradient(135deg, #f4433509, #f4433504); }
  &.sel { border:1px solid var(--b3-theme-primary); box-shadow:0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 20%, transparent); }
}
.sr-item-checkbox { width:16px; height:16px; cursor:pointer; accent-color:var(--b3-theme-primary); }
.sr-status { width:20px; display:flex; align-items:center; justify-content:center;
  svg { width:18px; height:18px; }
}
.spin { animation:spin 1.2s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.ok { color:#4caf50; filter:drop-shadow(0 0 4px #4caf504d); }
.no { color:#f44336; filter:drop-shadow(0 0 4px #f443364d); }
.sr-info { flex:1; min-width:0; }
.sr-name { font-size:14px; font-weight:500; margin-bottom:4px; }
.sr-url { font-size:11px; opacity:.65; margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sr-tag { display:inline-block; font-size:10px; padding:2px 6px; background:color-mix(in srgb, var(--b3-theme-primary) 15%, transparent); color:var(--b3-theme-primary); border-radius:3px; font-weight:500; }
.sr-actions { display:flex; gap:4px;
  svg { width:14px; height:14px; }
  button { transition:all .2s; &:hover { transform:scale(1.15); } }
}
.sr-empty { padding:60px 20px; text-align:center; opacity:.5; font-size:13px; background:var(--b3-theme-surface); border-radius:8px; box-shadow:0 1px 3px #0000000d; }
.fade-enter-active, .fade-leave-active { transition:opacity .3s; }
.fade-enter-from, .fade-leave-to { opacity:0; }
@media (max-width:640px) {
  .sr-toolbar { flex-direction:column; margin:8px; }
  .sr-search { width:100%; }
  .sr-list { padding:8px; }
  .sr-card { flex-wrap:wrap; }
}
</style>
