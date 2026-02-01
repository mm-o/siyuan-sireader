<template>
  <div class="sr-list">
    <div v-if="!displayCards.length" class="sr-empty">{{ keyword?t('deckNoMatch','未找到匹配的卡片'):t('deckNoCards','暂无卡片') }}</div>
    
    <template v-else>
      <div v-for="card in displayCards" :key="card.id" class="deck-card" :class="{expanded: expanded===card.id, editing: editing===card.id}" @click="toggleCard($event, card)">
        <span class="sr-bar" :style="{background: getMasteryColor(card)}"></span>
        <div class="deck-card-main">
          <div class="deck-card-mastery">{{ getMasteryIcon(card) }}</div>
          
          <template v-if="editing===card.id">
            <div class="card-edit-panel">
              <div class="edit-section">
                <div class="edit-header" @click="toggleSection('front')">
                  <svg class="edit-arrow" :class="{open: openSections.front}"><use xlink:href="#iconDown"/></svg>
                  <span class="edit-label">Front</span>
                </div>
                <Transition name="expand">
                  <div v-if="openSections.front" class="edit-content">
                    <textarea v-model="editData.front" class="edit-textarea" rows="4"></textarea>
                  </div>
                </Transition>
              </div>
              
              <div class="edit-section">
                <div class="edit-header" @click="toggleSection('back')">
                  <svg class="edit-arrow" :class="{open: openSections.back}"><use xlink:href="#iconDown"/></svg>
                  <span class="edit-label">Back</span>
                </div>
                <Transition name="expand">
                  <div v-if="openSections.back" class="edit-content">
                    <textarea v-model="editData.back" class="edit-textarea" rows="6"></textarea>
                  </div>
                </Transition>
              </div>
              
              <div class="edit-section">
                <div class="edit-header" @click="toggleSection('tags')">
                  <svg class="edit-arrow" :class="{open: openSections.tags}"><use xlink:href="#iconDown"/></svg>
                  <span class="edit-label">标签</span>
                </div>
                <Transition name="expand">
                  <div v-if="openSections.tags" class="edit-content">
                    <input v-model="editData.tags" class="edit-input" placeholder="标签（空格分隔）" />
                  </div>
                </Transition>
              </div>
              
              <div class="edit-actions">
                <button @click.stop="saveEdit(card.id)" class="b3-button b3-button--outline">保存</button>
                <button @click.stop="cancelEdit" class="b3-button b3-button--text">取消</button>
              </div>
            </div>
          </template>
          
          <template v-else>
            <div class="deck-card-title" v-html="extractAnkiTitle(card)" @click.capture="stopIfAudio"></div>
            <div class="deck-card-hint" v-html="extractAnkiHint(card)"></div>
            <Transition name="expand">
              <div v-if="expanded===card.id" class="deck-card-content">
                <div class="anki-card" v-html="renderAnki(card)" @click.capture="stopIfAudio"></div>
              </div>
            </Transition>
            <div class="deck-card-source">{{ card.model || 'Anki' }} · 复习 {{ card.learning?.reps || 0 }} 次</div>
            
            <div class="deck-card-btns">
              <button @click.stop="startEdit(card)" class="b3-tooltips b3-tooltips__nw" aria-label="修改"><svg><use xlink:href="#iconEdit"/></svg></button>
              <button @click.stop="removing=card.id" class="b3-tooltips b3-tooltips__nw" aria-label="删除"><svg><use xlink:href="#iconTrashcan"/></svg></button>
            </div>
            
            <Transition name="fade">
              <div v-if="removing===card.id" class="deck-card-confirm" @click.stop>
                <button @click="removing=null" class="b3-button b3-button--text">取消</button>
                <button @click="confirmDelete(card.id)" class="b3-button b3-button--text" style="color:var(--b3-theme-error)">删除</button>
              </div>
            </Transition>
          </template>
        </div>
      </div>
      
      <div class="sr-action-btns">
        <button v-if="hasMore" @click="$emit('load-more')" class="sr-btn">
          加载更多 ({{Math.min(8, allCards.length - cards.length)}}张)
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { showMessage } from 'siyuan'
import { removeCard, updateCard } from './card'
import { extractAnkiTitle, extractAnkiHint, playAudio, setupImageLazyLoad } from './utils'

const props = defineProps<{
  keyword: string
  cards: any[]
  allCards: any[]
  displayCards: any[]
  hasMore: boolean
  i18n?: any
}>()

const emit = defineEmits<{ 'reload': []; 'load-more': [] }>()

// i18n 辅助函数
const t = (key: string, fallback: string) => props.i18n?.[key] || fallback

const expanded = ref<string | null>(null)
const removing = ref<string | null>(null)
const editing = ref<string | null>(null)
const editData = ref({ front: '', back: '', tags: '' })
const openSections = reactive({ front: true, back: true, tags: false })
let imgObserver: IntersectionObserver | null = null

const observeImages = () => {
  setTimeout(() => {
    document.querySelectorAll('img[data-cid]').forEach(el => {
      const img = el as HTMLImageElement
      if (!img.src || !img.src.startsWith('blob:')) imgObserver?.observe(img)
    })
  }, 100)
}

onMounted(() => {
  imgObserver = setupImageLazyLoad()
  document.addEventListener('click', playAudio, true)
})

onUnmounted(() => {
  imgObserver?.disconnect()
  document.removeEventListener('click', playAudio, true)
})

watch(() => props.displayCards, observeImages)

const INTERACTIVE = ['button', 'a', 'input', 'textarea', 'select', '.b3-button', '.deck-card-btns', '.deck-card-confirm', '.card-edit-panel']

const toggleCard = (e: Event, card: any) => {
  if (editing.value || INTERACTIVE.some(sel => (e.target as HTMLElement).closest(sel))) return
  const wasExpanded = expanded.value === card.id
  expanded.value = wasExpanded ? null : card.id
  if (!wasExpanded) observeImages()
}

const toggleSection = (section: 'front' | 'back' | 'tags') => openSections[section] = !openSections[section]

const startEdit = (card: any) => {
  editing.value = card.id
  expanded.value = null
  editData.value = {
    front: card.front.replace(/<[^>]*>/g, '').trim(),
    back: card.back.replace(/<[^>]*>/g, '').trim(),
    tags: card.tags.join(' ')
  }
  Object.assign(openSections, { front: true, back: true, tags: false })
}

const saveEdit = async (id: string) => {
  const success = await updateCard(id, {
    front: editData.value.front,
    back: editData.value.back,
    tags: editData.value.tags.split(/\s+/).filter(Boolean)
  })
  showMessage(success ? '已保存' : '保存失败', 1500, success ? 'info' : 'error')
  if (success) {
    editing.value = null
    emit('reload')
  }
}

const cancelEdit = () => {
  editing.value = null
  editData.value = { front: '', back: '', tags: '' }
}

const confirmDelete = async (id: string) => {
  removing.value = null
  await removeCard(id)
  emit('reload')
  showMessage('已删除', 1500, 'info')
}

const stopIfAudio = (e: Event) => { if ((e.target as HTMLElement).closest('.anki-audio')) e.stopPropagation() }
const renderAnki = (card: any) => card.modelCss ? `<style>${card.modelCss}</style>${card.back}` : card.back

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6']
const ICONS = ['😐', '🙂', '😊', '🤩']

const getMasteryLevel = (card: any) => {
  const days = Math.floor((card.learning?.interval || 0) / 1440)
  return days < 1 ? 1 : days < 4 ? 2 : days < 15 ? 3 : 4
}

const getMasteryColor = (card: any) => COLORS[getMasteryLevel(card) - 1]
const getMasteryIcon = (card: any) => ICONS[getMasteryLevel(card) - 1]
</script>

<style scoped lang="scss">
@use './deck.scss';
</style>
