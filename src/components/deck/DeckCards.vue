<template>
  <div class="sr-list">
    <div v-if="!displayCards.length" class="sr-empty">{{ keyword?t('deckNoMatch','未找到匹配的卡片'):t('deckNoCards','暂无卡片') }}</div>
    
    <div v-for="card in displayCards" :key="card.id" class="deck-card" :class="{expanded: s.exp===card.id, editing: s.edit===card.id}" @click="toggle($event, card)">
      <span class="sr-bar" :style="{background: mastery(card).c}"></span>
      <div class="deck-card-mastery">{{ mastery(card).i }}</div>
      
      <template v-if="s.edit===card.id">
        <div class="card-edit-panel">
          <div v-for="sec in SECTIONS" :key="sec.k" class="edit-section">
            <div class="edit-header" @click="s.sec[sec.k]=!s.sec[sec.k]">
              <svg class="edit-arrow" :class="{open: s.sec[sec.k]}"><use xlink:href="#iconDown"/></svg>
              <span class="edit-label">{{ sec.l }}</span>
            </div>
            <Transition name="expand">
              <div v-if="s.sec[sec.k]" class="edit-content">
                <component :is="sec.t" v-model="s.data[sec.k]" :class="`edit-${sec.t}`" :rows="sec.r" :placeholder="sec.p"/>
              </div>
            </Transition>
          </div>
          <div class="edit-actions">
            <button @click.stop="save(card.id)" class="b3-button b3-button--outline">保存</button>
            <button @click.stop="cancel" class="b3-button b3-button--text">取消</button>
          </div>
        </div>
      </template>
      
      <template v-else>
        <div class="deck-card-title" v-html="extractAnkiTitle(card)" @click.capture="audio"></div>
        <div class="deck-card-hint" v-html="extractAnkiHint(card)"></div>
        <div class="deck-card-source">{{ card.model || 'Anki' }} · 复习 {{ card.learning?.reps || 0 }} 次</div>
        
        <Transition name="expand">
          <div v-if="s.exp===card.id" class="deck-card-back" v-html="render(card)" @click.capture="audio" @click.stop="handleContent"></div>
        </Transition>
        
        <div v-if="s.del!==card.id" class="sr-btns">
          <button @click.stop="edit(card)" class="b3-tooltips b3-tooltips__nw" aria-label="修改"><svg><use xlink:href="#iconEdit"/></svg></button>
          <button @click.stop="s.del=card.id" class="b3-tooltips b3-tooltips__nw" aria-label="删除"><svg><use xlink:href="#iconTrashcan"/></svg></button>
        </div>
        
        <Transition name="fade">
          <div v-if="s.del===card.id" class="sr-confirm" @click.stop>
            <button @click="s.del=null" class="b3-button b3-button--text">取消</button>
            <button @click="del(card.id)" class="b3-button b3-button--text btn-delete">删除</button>
          </div>
        </Transition>
      </template>
    </div>
    
    <div v-if="hasMore" class="sr-action-btns">
      <button @click="$emit('load-more')" class="sr-btn">加载更多 ({{Math.min(8, allCards.length - cards.length)}}张)</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, onUnmounted, watch } from 'vue'
import { showMessage } from 'siyuan'
import { removeCard, updateCard } from './card'
import { extractAnkiTitle, extractAnkiHint, playAudio, setupImageLazyLoad, renderAnki, setupInteractive } from './utils'

const props = defineProps<{
  keyword: string
  cards: any[]
  allCards: any[]
  displayCards: any[]
  hasMore: boolean
  i18n?: any
}>()

const emit = defineEmits<{ 'reload': []; 'load-more': [] }>()
const t = (k: string, f: string) => props.i18n?.[k] || f

// 状态
const s = reactive({
  exp: null as string | null,
  del: null as string | null,
  edit: null as string | null,
  data: { front: '', back: '', tags: '' },
  sec: { front: true, back: true, tags: false }
})

// 配置
const SECTIONS = [
  { k: 'front', l: 'Front', t: 'textarea', r: 4 },
  { k: 'back', l: 'Back', t: 'textarea', r: 6 },
  { k: 'tags', l: '标签', t: 'input', p: '标签（空格分隔）' }
] as const

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6']
const ICONS = ['😐', '🙂', '😊', '🤩']
const INTERACT = [
  'button', 'a', 'input', 'textarea', 'select', 'label',
  '.b3-button', '.sr-btns', '.sr-confirm', '.card-edit-panel',
  '.deck-card-back a', '.deck-card-back button', '.deck-card-back input',
  '.deck-card-back textarea', '.deck-card-back select', '.hint'
]

// 熟练度
const mastery = (card: any) => {
  const d = Math.floor((card.learning?.interval || 0) / 1440)
  const lv = d < 1 ? 0 : d < 4 ? 1 : d < 15 ? 2 : 3
  return { c: COLORS[lv], i: ICONS[lv] }
}

let obs: IntersectionObserver | null = null

// 刷新
const refresh = () => {
  setTimeout(() => {
    document.querySelectorAll('.deck-card img[data-cid]').forEach(el => {
      const img = el as HTMLImageElement
      if (!img.src || !img.src.startsWith('blob:')) obs?.observe(img)
    })
    window.MathJax?.typesetPromise?.()
    setupInteractive('.deck-card-back')
  }, 100)
}

onMounted(() => {
  obs = setupImageLazyLoad()
  document.addEventListener('click', playAudio, true)
  if (!window.MathJax) {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'
    script.async = true
    document.head.appendChild(script)
  }
})

onUnmounted(() => {
  obs?.disconnect()
  document.removeEventListener('click', playAudio, true)
})

watch(() => props.displayCards, refresh, { flush: 'post' })
watch(() => s.exp, v => v && refresh())

// 交互
const toggle = (e: Event, card: any) => {
  if (s.edit || INTERACT.some(sel => (e.target as HTMLElement).closest(sel))) return
  const was = s.exp === card.id
  s.exp = was ? null : card.id
  if (!was) refresh()
}

const strip = (html: string) => html.replace(/<[^>]*>/g, '').trim()

const edit = (card: any) => {
  s.edit = card.id
  s.exp = null
  s.data = { front: strip(card.front), back: strip(card.back), tags: card.tags.join(' ') }
  Object.assign(s.sec, { front: true, back: true, tags: false })
}

const save = async (id: string) => {
  const ok = await updateCard(id, {
    front: s.data.front,
    back: s.data.back,
    tags: s.data.tags.split(/\s+/).filter(Boolean)
  })
  showMessage(ok ? '已保存' : '保存失败', 1500, ok ? 'info' : 'error')
  if (ok) {
    s.edit = null
    emit('reload')
  }
}

const cancel = () => {
  s.edit = null
  s.data = { front: '', back: '', tags: '' }
}

const del = async (id: string) => {
  s.del = null
  await removeCard(id)
  emit('reload')
  showMessage('已删除', 1500, 'info')
}

const audio = (e: Event) => {
  if ((e.target as HTMLElement).closest('.anki-audio')) {
    e.stopPropagation()
    playAudio(e)
  }
}

const handleContent = (e: Event) => {
  const target = e.target as HTMLElement
  if (target.tagName === 'A' || target.closest('a')) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) {
    e.stopPropagation()
    return
  }
  if (INTERACT.some(sel => target.matches(sel) || target.closest(sel))) {
    e.stopPropagation()
  }
}

const render = (card: any) => renderAnki(card, '.deck-card-back')
</script>

<style scoped lang="scss">
@use './deck.scss';
</style>
