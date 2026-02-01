<template>
  <div class="flash-container">
    <!-- 启动页面 -->
    <div v-if="!isStarted && !isCompleted" class="flash-start">
      <div class="flash-header">
        <h2>{{t('deckFlashTitle','闪卡学习')}}</h2>
        <p>{{t('deckFlashSubtitle','准备开始今天的学习')}}</p>
      </div>
      
      <div class="flash-stats">
        <div class="flash-stat new">
          <div class="stat-value">{{sessionStats.new}}</div>
          <div class="stat-label">{{t('deckNotLearned','未学习')}}</div>
        </div>
        <div class="flash-stat learning">
          <div class="stat-value">{{sessionStats.learning}}</div>
          <div class="stat-label">{{t('deckLearning','学习中')}}</div>
        </div>
        <div class="flash-stat review">
          <div class="stat-value">{{sessionStats.review}}</div>
          <div class="stat-label">{{t('deckToReview','待复习')}}</div>
        </div>
      </div>
      
      <div class="flash-actions">
        <button v-if="totalCards > 0" @click="startSession" class="flash-btn primary">{{t('deckStartLearning','开始学习')}}</button>
        <div v-else class="flash-empty">
          <p>{{t('deckNoReviewToday','🎉 今天没有需要复习的卡片')}}</p>
          <p class="hint">{{t('deckComeTomorrow','明天再来吧！')}}</p>
        </div>
      </div>
    </div>
    
    <!-- 完成页面 -->
    <div v-else-if="isCompleted" class="flash-complete">
      <div class="confetti">
        <div v-for="i in 80" :key="i" class="confetti-piece" :style="getConfettiStyle(i)"></div>
      </div>
      
      <div class="complete-content">
        <div class="complete-icon">🎉</div>
        <h2>{{t('deckCongrats','恭喜完成！')}}</h2>
        <p>{{t('deckTaskComplete','今天的学习任务已完成')}}</p>
        
        <div class="complete-stats">
          <div class="stat-item">
            <div class="value">{{sessionSummary.total}}</div>
            <div class="label">{{t('deckLearnedCards','学习卡片')}}</div>
          </div>
          <div class="stat-item">
            <div class="value">{{formatTime(sessionSummary.timeSpent)}}</div>
            <div class="label">{{t('deckTimeSpent','学习时长')}}</div>
          </div>
          <div class="stat-item">
            <div class="value">{{sessionSummary.accuracy}}%</div>
            <div class="label">{{t('deckAccuracy','正确率')}}</div>
          </div>
        </div>
        
        <div class="complete-details">
          <div class="row"><span>{{t('deckNewCards','新学')}}</span><span>{{sessionSummary.newCards}}</span></div>
          <div class="row"><span>{{t('deckReviewCards','复习')}}</span><span>{{sessionSummary.reviewCards}}</span></div>
          <div class="row"><span>{{t('deckRatingAgain','重来')}}</span><span>{{sessionSummary.againCount}}</span></div>
          <div class="row"><span>{{t('deckRatingHard','困难')}}</span><span>{{sessionSummary.hardCount}}</span></div>
          <div class="row"><span>{{t('deckRatingGood','良好')}}</span><span>{{sessionSummary.goodCount}}</span></div>
          <div class="row"><span>{{t('deckRatingEasy','简单')}}</span><span>{{sessionSummary.easyCount}}</span></div>
        </div>
        
        <button @click="backToStart" class="flash-btn primary">{{t('deckComplete','完成')}}</button>
      </div>
    </div>
    
    <!-- 学习页面 -->
    <template v-else-if="isStarted && sessionCards.length > 0">
      <div class="flash-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{width: `${progress}%`}"></div>
        </div>
        <div class="progress-info">
          <div class="progress-chips">
            <span class="chip new">{{t('deckNew','新')}} {{stats.new}}</span>
            <span class="chip learning">{{t('deckLearning','学')}} {{stats.learning}}</span>
            <span class="chip review">{{t('deckReview','复')}} {{stats.review}}</span>
          </div>
          <span class="chip">{{currentIndex + 1}} / {{sessionCards.length}}</span>
        </div>
      </div>

      <div class="flash-study-area">
        <div class="flash-card" :class="{flipped: isFlipped}">
          <div v-if="!isFlipped" class="card-face front" @click="flip">
            <div v-html="currentCard.front" class="anki-content" @click.capture="stopIfAudio"></div>
            <div class="card-hint">
              <svg viewBox="0 0 24 24"><use xlink:href="#iconEye"/></svg>
              <div>{{t('deckShowAnswer','点击显示答案')}}</div>
              <div class="hint-key">{{t('deckOrPress','或按')}} <kbd>Space</kbd></div>
            </div>
          </div>
          
          <div v-else class="card-face back">
            <div v-html="renderAnki(currentCard)" class="anki-content" @click.capture="stopIfAudio"></div>
          </div>
        </div>

        <Transition name="expand">
          <div v-if="isFlipped" class="flash-rating">
            <button @click="rate(1)" class="rating-btn again">
              <div class="btn-key">1</div>
              <div class="btn-label">{{t('deckRatingAgain','重来')}}</div>
              <div class="btn-time">{{ratingTimes[1]}}</div>
            </button>
            <button @click="rate(2)" class="rating-btn hard">
              <div class="btn-key">2</div>
              <div class="btn-label">{{t('deckRatingHard','困难')}}</div>
              <div class="btn-time">{{ratingTimes[2]}}</div>
            </button>
            <button @click="rate(3)" class="rating-btn good">
              <div class="btn-key">3</div>
              <div class="btn-label">{{t('deckRatingGood','良好')}}</div>
              <div class="btn-time">{{ratingTimes[3]}}</div>
            </button>
            <button @click="rate(4)" class="rating-btn easy">
              <div class="btn-key">4</div>
              <div class="btn-label">{{t('deckRatingEasy','简单')}}</div>
              <div class="btn-time">{{ratingTimes[4]}}</div>
            </button>
          </div>
        </Transition>
      </div>

      <div class="flash-shortcuts">
        <kbd>Space</kbd> 显示答案 · <kbd>1-4</kbd> 评分 · <kbd>Esc</kbd> 退出
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { showMessage } from 'siyuan'
import { recordReview } from './stat'
import { playAudio, setupImageLazyLoad } from './utils'
import { startFlashSession, endFlashSession, getRatingTimeText } from './flash'
import type { DeckCard } from './types'

const emit = defineEmits<{ close: [] }>()

// i18n 辅助函数 - 需要从父组件传递
// 由于这个组件没有 props.i18n，我们需要添加它
const props = defineProps<{ i18n?: any }>()
const t = (key: string, fallback: string) => props.i18n?.[key] || fallback

// 状态
const isStarted = ref(false)
const isCompleted = ref(false)
const isFlipped = ref(false)

// 会话数据
const sessionCards = ref<DeckCard[]>([])
const currentIndex = ref(0)
const sessionStartTime = ref(0)
const reviewStartTime = ref(Date.now())

// 评分按钮时间文本
const ratingTimes = ref({ 1: '', 2: '', 3: '', 4: '' })

// 统计数据
const sessionStats = ref({ new: 0, learning: 0, review: 0 })
const sessionSummary = ref({
  total: 0,
  timeSpent: 0,
  accuracy: 0,
  newCards: 0,
  reviewCards: 0,
  againCount: 0,
  hardCount: 0,
  goodCount: 0,
  easyCount: 0
})

// 计算属性
const totalCards = computed(() => sessionStats.value.new + sessionStats.value.learning + sessionStats.value.review)
const currentCard = computed(() => sessionCards.value[currentIndex.value])
const progress = computed(() => sessionCards.value.length ? ((currentIndex.value + 1) / sessionCards.value.length) * 100 : 0)
const stats = computed(() => {
  const remaining = sessionCards.value.slice(currentIndex.value)
  return {
    new: remaining.filter(c => !c.learning || c.learning.state === 'new').length,
    learning: remaining.filter(c => c.learning?.state === 'learning').length,
    review: remaining.filter(c => c.learning?.state === 'review').length
  }
})

// 工具函数
const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

const getConfettiStyle = (i: number) => {
  const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#30cfd0']
  return {
    '--color': colors[i % colors.length],
    '--x': `${Math.random() * 100}%`,
    '--delay': `${Math.random() * 0.5}s`,
    '--duration': `${2 + Math.random()}s`
  }
}

const renderAnki = (card: DeckCard) => card.modelCss ? `<style>${card.modelCss}</style>${card.back}` : card.back
const stopIfAudio = (e: Event) => { if ((e.target as HTMLElement).closest('.anki-audio')) e.stopPropagation() }
const flip = async () => { 
  if (!isFlipped.value) { 
    isFlipped.value = true
    setTimeout(observeImages, 50)
    // 加载评分按钮时间
    await updateRatingTimes()
  }
}

// 更新评分按钮时间文本
const updateRatingTimes = async () => {
  if (!currentCard.value) return
  const times = await Promise.all([
    getRatingTimeText(1, currentCard.value),
    getRatingTimeText(2, currentCard.value),
    getRatingTimeText(3, currentCard.value),
    getRatingTimeText(4, currentCard.value)
  ])
  ratingTimes.value = { 1: times[0], 2: times[1], 3: times[2], 4: times[3] }
}

// 启动学习会话
const startSession = async () => {
  const session = await startFlashSession()
  if (!session) {
    showMessage('没有需要学习的卡片', 2000, 'info')
    return
  }
  
  sessionCards.value = session.cards
  sessionStats.value = session.stats
  isStarted.value = true
  sessionStartTime.value = Date.now()
  reviewStartTime.value = Date.now()
  // 预加载第一张卡片的评分时间
  await updateRatingTimes()
}

// 图片懒加载
let imgObserver: IntersectionObserver | null = null

const observeImages = () => {
  if (!imgObserver) return
  const container = document.querySelector('.flash-card .card-face')
  if (!container) return
  
  container.querySelectorAll('img[data-cid]').forEach(el => {
    const img = el as HTMLImageElement
    const { cid, file } = img.dataset
    const srcAttr = img.getAttribute('src')
    
    if (cid && file && (!srcAttr || !srcAttr.startsWith('blob:'))) {
      imgObserver?.observe(img)
      const rect = img.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) loadImageDirectly(img, cid, file)
    }
  })
}

const loadImageDirectly = async (img: HTMLImageElement, cid: string, file: string) => {
  try {
    const { getMediaFromApkg } = await import('./pack')
    const blob = await getMediaFromApkg(cid, file)
    if (blob) {
      img.src = URL.createObjectURL(blob)
      img.style.background = ''
      img.style.minHeight = ''
    } else {
      img.style.display = 'none'
    }
  } catch {
    img.style.display = 'none'
  }
}

// 评分
const rate = async (rating: 1 | 2 | 3 | 4) => {
  try {
    const card = currentCard.value
    if (!card) return
    
    const timeSpent = Math.floor((Date.now() - reviewStartTime.value) / 1000)
    const isNew = !card.learning || card.learning.state === 'new'
    
    // 更新会话统计
    sessionSummary.value.total++
    if (isNew) sessionSummary.value.newCards++
    else sessionSummary.value.reviewCards++
    
    const ratingMap = { 1: 'againCount', 2: 'hardCount', 3: 'goodCount', 4: 'easyCount' } as const
    sessionSummary.value[ratingMap[rating]]++
    
    // 计算下次复习时间
    const { calculateNextReview, saveCardProgress } = await import('./flash')
    const result = await calculateNextReview(rating, card)
    
    // 更新学习数据
    card.learning = {
      state: result.state,
      due: Date.now() + result.interval * 60 * 1000,
      interval: result.interval,
      ease: result.ease,
      lapses: rating === 1 ? (card.learning?.lapses || 0) + 1 : (card.learning?.lapses || 0),
      reps: (card.learning?.reps || 0) + 1,
      lastReview: Date.now(),
      ...(result.stability !== undefined && { stability: result.stability }),
      ...(result.difficulty !== undefined && { difficulty: result.difficulty })
    } as any
    
    // 保存进度
    await saveCardProgress(card)
    
    // 记录学习历史
    const { getDatabase } = await import('./database')
    const db = await getDatabase()
    await db.recordReview(card.id, card.deckId, rating, isNew, timeSpent)
    await recordReview(rating, isNew, timeSpent, false, card.id)
    
    // 下一张卡片
    isFlipped.value = false
    currentIndex.value++
    reviewStartTime.value = Date.now()
    
    // 预加载下一张卡片的评分时间
    if (currentIndex.value < sessionCards.value.length) {
      await updateRatingTimes()
    }
    
    // 检查是否完成
    if (currentIndex.value >= sessionCards.value.length) {
      const totalTime = Math.floor((Date.now() - sessionStartTime.value) / 1000)
      sessionSummary.value.timeSpent = totalTime
      const correctCount = sessionSummary.value.goodCount + sessionSummary.value.easyCount
      sessionSummary.value.accuracy = sessionSummary.value.total > 0 
        ? Math.round((correctCount / sessionSummary.value.total) * 100) 
        : 0
      
      endFlashSession()
      window.dispatchEvent(new Event('sireader:stat-updated'))
      window.dispatchEvent(new Event('sireader:deck-updated'))
      
      isCompleted.value = true
      await refreshStats()
    }
  } catch (e) {
    console.error('[Flash]', e)
    showMessage('评分失败', 3000, 'error')
  }
}

// 刷新统计数据
const refreshStats = async () => {
  const { getDueCards } = await import('./flash')
  const cards = await getDueCards()
  
  sessionStats.value = {
    new: cards.filter((c: DeckCard) => !c.learning || c.learning.state === 'new').length,
    learning: cards.filter((c: DeckCard) => c.learning?.state === 'learning').length,
    review: cards.filter((c: DeckCard) => c.learning?.state === 'review').length
  }
}

// 返回启动页面
const backToStart = () => {
  isStarted.value = false
  isCompleted.value = false
  sessionCards.value = []
  currentIndex.value = 0
  isFlipped.value = false
  sessionSummary.value = {
    total: 0,
    timeSpent: 0,
    accuracy: 0,
    newCards: 0,
    reviewCards: 0,
    againCount: 0,
    hardCount: 0,
    goodCount: 0,
    easyCount: 0
  }
  endFlashSession()
  refreshStats()
}

// 键盘事件
const handleKey = (e: KeyboardEvent) => {
  if (isCompleted.value) {
    if (e.key === 'Enter' || e.key === 'Escape') backToStart()
    return
  }
  
  if (!isStarted.value) {
    if (e.key === 'Enter' && totalCards.value > 0) startSession()
    if (e.key === 'Escape') emit('close')
    return
  }
  
  if (e.key === ' ') { e.preventDefault(); if (!isFlipped.value) flip() }
  if (e.key === 'Escape') backToStart()
  if (isFlipped.value && ['1','2','3','4'].includes(e.key)) rate(+e.key as any)
}

// 生命周期
onMounted(async () => {
  await refreshStats()
  imgObserver = setupImageLazyLoad()
  window.addEventListener('keydown', handleKey)
  document.addEventListener('click', playAudio, true)
})

onUnmounted(() => {
  endFlashSession()
  imgObserver?.disconnect()
  window.removeEventListener('keydown', handleKey)
  document.removeEventListener('click', playAudio, true)
})

watch(() => currentCard.value, () => setTimeout(observeImages, 100))
watch(() => isFlipped.value, (v) => { if (v) setTimeout(observeImages, 100) })
</script>

<style scoped lang="scss">
@use './deck.scss';
</style>
