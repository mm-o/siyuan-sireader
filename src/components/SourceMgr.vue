<template>
  <div class="sm">
    <div class="sm-bar">
      <label class="b3-label">
        <input type="checkbox" class="b3-checkbox" :checked="allSelected" @change="toggleAll">
        {{ allSelected ? '取消' : '全选' }}({{ filtered.length }})
      </label>
      
      <template v-if="selected.length">
        <button class="b3-button" @click="batchEnable(true)">
          <svg><use xlink:href="#iconEye"/></svg>启用
        </button>
        <button class="b3-button" @click="batchEnable(false)">
          <svg><use xlink:href="#iconEyeoff"/></svg>禁用
        </button>
        <button class="b3-button b3-button--error" @click="batchDelete">
          <svg><use xlink:href="#iconTrashcan"/></svg>删除
        </button>
      </template>
      
      <input v-model="keyword" class="b3-text-field sm-input" placeholder="搜索书源...">
      
      <button v-if="!checking" class="b3-button" @click="checkAll">
        <svg><use xlink:href="#iconRefresh"/></svg>检测
      </button>
      <button v-else class="b3-button b3-button--error" @click="stopCheck = true">
        <svg><use xlink:href="#iconClose"/></svg>停止({{ progress }}/{{ enabledCount }})
      </button>
      
      <button v-if="invalidCount" class="b3-button b3-button--warning" @click="deleteInvalid">
        <svg><use xlink:href="#iconTrashcan"/></svg>清理({{ invalidCount }})
      </button>
    </div>

    <div class="sm-list">
      <div v-for="s in filtered" :key="s.bookSourceUrl" 
           class="sm-item" :class="{off: !s.enabled, bad: status[s.bookSourceUrl]==='invalid', sel: isSelected(s.bookSourceUrl)}">
        <input type="checkbox" class="b3-checkbox" :checked="isSelected(s.bookSourceUrl)" @change="toggleSelect(s.bookSourceUrl)" @click.stop>
        <div class="sm-st">
          <svg v-if="status[s.bookSourceUrl]==='checking'" class="spin"><use xlink:href="#iconRefresh"/></svg>
          <svg v-else-if="status[s.bookSourceUrl]==='valid'" class="ok"><use xlink:href="#iconCheck"/></svg>
          <svg v-else-if="status[s.bookSourceUrl]==='invalid'" class="no"><use xlink:href="#iconClose"/></svg>
        </div>
        <div class="sm-info">
          <div class="sm-name">{{ s.bookSourceName }}</div>
          <div class="sm-url">{{ s.bookSourceUrl }}</div>
          <span v-if="s.bookSourceGroup" class="sm-tag">{{ s.bookSourceGroup }}</span>
        </div>
        <div class="sm-acts">
          <button class="b3-button b3-button--text" @click.stop="toggle(s)">
            <svg><use :xlink:href="s.enabled?'#iconEye':'#iconEyeoff'"/></svg>
          </button>
          <button class="b3-button b3-button--text" @click.stop="check(s)">
            <svg><use xlink:href="#iconRefresh"/></svg>
          </button>
          <button class="b3-button b3-button--text" @click.stop="del(s)">
            <svg><use xlink:href="#iconTrashcan"/></svg>
          </button>
        </div>
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
import { showMessage, Dialog } from 'siyuan'

const sources = ref<BookSource[]>([])
const status = ref<Record<string, 'checking'|'valid'|'invalid'>>({})
const checking = ref(false)
const progress = ref(0)
const keyword = ref('')
const selected = ref<Set<string>>(new Set())
const stopCheck = ref(false)

const filtered = computed(() => {
  if (!keyword.value) return sources.value
  const k = keyword.value.toLowerCase()
  return sources.value.filter(s => 
    s.bookSourceName.toLowerCase().includes(k) || 
    s.bookSourceUrl.toLowerCase().includes(k) ||
    s.bookSourceGroup?.toLowerCase().includes(k)
  )
})

const allSelected = computed(() => filtered.value.length > 0 && selected.value.size === filtered.value.length)
const enabledCount = computed(() => sources.value.filter(s => s.enabled).length)
const invalidCount = computed(() => sources.value.filter(s => status.value[s.bookSourceUrl] === 'invalid').length)

const isSelected = (url: string) => selected.value.has(url)

const reload = () => sources.value = bookSourceManager.getSources()

const toggleAll = () => {
  if (allSelected.value) {
    selected.value.clear()
  } else {
    selected.value = new Set(filtered.value.map(s => s.bookSourceUrl))
  }
}

const toggleSelect = (url: string) => {
  if (selected.value.has(url)) {
    selected.value.delete(url)
  } else {
    selected.value.add(url)
  }
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
      if (options?.confirm) {
        selected.value.forEach(url => {
          bookSourceManager.removeSource(url)
          delete status.value[url]
        })
        reload()
        selected.value.clear()
        showMessage(`删除 ${count} 个书源`)
      }
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
      if (options?.confirm) {
        bookSourceManager.removeSource(s.bookSourceUrl)
        delete status.value[s.bookSourceUrl]
        reload()
      }
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
      if (options?.confirm) {
        invalid.forEach(s => {
          bookSourceManager.removeSource(s.bookSourceUrl)
          delete status.value[s.bookSourceUrl]
        })
        reload()
        showMessage(`已删除 ${invalid.length} 个`)
      }
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
  progress.value = 0
  const enabled = sources.value.filter(s => s.enabled)
  const batchSize = 5
  for (let i = 0; i < enabled.length && !stopCheck.value; i += batchSize) {
    await Promise.allSettled(enabled.slice(i, i + batchSize).map(check))
    progress.value = Math.min(i + batchSize, enabled.length)
  }
  checking.value = false
  const validCount = enabled.filter(s => status.value[s.bookSourceUrl] === 'valid').length
  showMessage(stopCheck.value 
    ? `检测停止: ${validCount}/${progress.value} 有效`
    : `检测完成: ${validCount}/${enabled.length} 有效`)
}

onMounted(async () => {
  await bookSourceManager.loadSources()
  reload()
})

onBeforeUnmount(() => {
  stopCheck.value = true
  checking.value = false
})
</script>

<style scoped lang="scss">
.sm{display:flex;flex-direction:column;height:100%;background:var(--b3-theme-background)}
.sm-bar{display:flex;gap:8px;padding:8px;border-bottom:1px solid var(--b3-border-color);flex-wrap:wrap;align-items:center;.b3-label{border:none;padding:0;margin:0}}
.sm-input{flex:1;min-width:200px}
.sm-list{flex:1;overflow-y:auto;padding:8px}
.sm-item{display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:8px;background:var(--b3-theme-surface);border:1px solid var(--b3-border-color);border-radius:4px;cursor:pointer;&:hover{background:var(--b3-list-hover)}&.off{opacity:.5}&.bad{border-color:var(--b3-theme-error);background:color-mix(in srgb,var(--b3-theme-error) 5%,transparent)}&.sel{border-color:var(--b3-theme-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--b3-theme-primary) 20%,transparent)}}
.sm-st{width:20px;display:flex;align-items:center;justify-content:center;svg{width:16px;height:16px}}
.spin{animation:spin 1.2s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.ok{color:var(--b3-theme-primary)}
.no{color:var(--b3-theme-error)}
.sm-info{flex:1;min-width:0}
.sm-name{font-size:13px;font-weight:500;margin-bottom:2px}
.sm-url{font-size:11px;opacity:.6;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sm-tag{display:inline-block;font-size:10px;padding:2px 6px;background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary);border-radius:3px;font-weight:500}
.sm-acts{display:flex;gap:4px}
</style>
