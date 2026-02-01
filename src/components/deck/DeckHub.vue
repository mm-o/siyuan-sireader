<template>
  <Transition name="fade" mode="out-in">
    <!-- 卡片 -->
    <DeckCards
      v-if="activeTab==='cards'"
      key="cards"
      :keyword="keyword"
      :cards="cards"
      :allCards="allCards"
      :displayCards="displayCards"
      :hasMore="hasMore"
      @reload="loadCards"
      @load-more="loadMore"
    />

    <!-- 卡组 -->
    <DeckPack
      v-else-if="activeTab==='packs'"
      key="packs"
      :packs="packs"
      :emojiCategories="emojiCategories"
      :loadingEmojis="loadingEmojis"
      :allTags="allTags"
      @save="savePackHandler"
      @delete="deletePackHandler"
      @toggle="togglePackActive"
      @export="exportPack"
      @sync="syncPackToDoc"
      @import="importAnkiPack"
    />

    <!-- 统计 -->
    <DeckStat
      v-else-if="activeTab==='stats'"
      key="stats"
      :todayStats="todayStats"
      :historyStats="historyStats"
      :totalStats="totalStats"
      :intervals="intervals"
      :retention="retention"
      :forecast="forecast"
      :allCards="allCards"
    />
    
    <!-- 闪卡复习 -->
    <DeckFlash
      v-else-if="activeTab==='review'"
      key="review"
      @close="closeReview"
    />
    
    <!-- 设置 -->
    <DeckSettings
      v-else-if="activeTab==='settings'"
      key="settings"
    />
  </Transition>
  
  <input ref="fileInput" type="file" accept=".apkg" style="display:none" @change="handleAnkiImport">
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchSyncPost, showMessage } from 'siyuan'
import { getCards, getTodayDueCards, getPack, createPack, updatePack, deletePack, importApkg, exportApkg } from './pack'
import { getStat, syncPackToSiyuan } from './stat'
import DeckFlash from './DeckFlash.vue'
import DeckPack from './DeckPack.vue'
import DeckStat from './DeckStat.vue'
import DeckCards from './DeckCards.vue'
import DeckSettings from './DeckSettings.vue'
import type { Pack, DailyStats, TotalStats, IntervalStats, RetentionStats, ForecastStats } from './types'

const props = defineProps<{
  keyword: string
  activeTab: 'cards' | 'packs' | 'stats' | 'review' | 'settings'
}>()

const emit = defineEmits<{ 'update:activeTab': [tab: string] }>()

const fileInput = ref<HTMLInputElement | null>(null)
const allTags = ref<string[]>([])

const cards = ref<any[]>([])
const allCards = ref<any[]>([]) // 所有卡片缓存
const packs = ref<Pack[]>([])
const todayStats = ref<DailyStats>({
  date: '',
  newCards: 0,
  reviews: 0,
  correctRate: 0,
  studyTime: 0,
  ratings: { again: 0, hard: 0, good: 0, easy: 0 },
  mature: 0,
  young: 0
})
const historyStats = ref<DailyStats[]>([])
const totalStats = ref<TotalStats>({
  cards: 0,
  reviews: 0,
  studyDays: 0,
  avgCorrectRate: 0,
  totalTime: 0,
  avgStudyTime: 0,
  streak: 0,
  longestStreak: 0
})
const intervals = ref<IntervalStats>({
  ranges: [],
  avgInterval: 0,
  medianInterval: 0
})
const retention = ref<RetentionStats>({
  overall: 0,
  byInterval: [],
  byEase: []
})
const forecast = ref<ForecastStats>({
  next7Days: [],
  next30Days: []
})

const emojiCategories = ref<Record<string, string[]>>({})
const loadingEmojis = ref(true)

const loadSiyuanEmojis = async () => {
  try {
    const res = await fetchSyncPost('/api/file/getFile', { path: '/conf/appearance/emojis/conf.json' })
    const conf = Array.isArray(res) ? res : (res?.code === 0 && res?.data ? (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) : null)
    if (Array.isArray(conf)) {
      const categories: Record<string, string[]> = {}
      // 只加载前3个分类，减少初始加载时间
      const limit = Math.min(conf.length, 3)
      for (let i = 0; i < limit; i++) {
        const cat = conf[i]
        const title = cat.title_zh_cn || cat.title || cat.id
        const emojis = (cat.items || []).map((item: any) => {
          if (item.unicode) {
            const codePoints = item.unicode.split('-').map((c: string) => parseInt(c, 16))
            return String.fromCodePoint(...codePoints)
          }
          return null
        }).filter(Boolean) as string[]
        if (emojis.length > 0) categories[title] = emojis
      }
      emojiCategories.value = categories
    }
  } catch {} finally {
    loadingEmojis.value = false
  }
}

const loadCards = async () => {
  const { getDatabase } = await import('./database')
  const db = await getDatabase()
  const enabledPacks = await db.getEnabledDecks()
  
  // 加载所有卡片
  let allCardsData: any[] = []
  for (const pack of enabledPacks) {
    const packCards = await getCards(pack.id)
    allCardsData.push(...packCards)
  }
  
  // 按优先级排序：今日待学习 > 其他
  const now = Date.now()
  allCardsData.sort((a, b) => {
    const aDue = a.learning?.due || 0
    const bDue = b.learning?.due || 0
    const aIsDue = aDue <= now
    const bIsDue = bDue <= now
    if (aIsDue && !bIsDue) return -1
    if (!aIsDue && bIsDue) return 1
    return aDue - bDue
  })
  
  allCards.value = allCardsData
  cards.value = allCardsData.slice(0, 8) // 初始显示8张
}

const loadMore = () => {
  const currentCount = cards.value.length
  const moreCards = allCards.value.slice(currentCount, currentCount + 8)
  cards.value = [...cards.value, ...moreCards]
}
const loadPackList = async () => { packs.value = await getPack() }
const loadStats = async () => {
  const stats = await getStat()
  todayStats.value = stats.today
  historyStats.value = stats.history
  totalStats.value = stats.total
  intervals.value = stats.intervals
  retention.value = stats.retention
  forecast.value = stats.forecast
}

const hasMore = computed(() => cards.value.length < allCards.value.length)

const togglePackActive = async (pack: Pack) => {
  const { getDatabase } = await import('./database')
  const db = await getDatabase()
  
  await db.toggleDeckEnabled(pack.id)
  await loadPackList()
  await loadCards()
}

const filteredCards = computed(() => {
  const kw = props.keyword.toLowerCase()
  if (!kw) return cards.value
  
  return allCards.value.filter(c => {
    const text = (c.front || '').replace(/<[^>]*>/g, '').toLowerCase()
    return text.includes(kw)
  })
})

const displayCards = computed(() => {
  const filtered = filteredCards.value
  // 搜索时显示所有匹配结果，否则显示当前加载的卡片
  return props.keyword ? filtered : cards.value
})

const reviewCards = computed(() => displayCards.value.filter(c => c.learning))

const startReview = () => {
  emit('update:activeTab', 'review')
}

const closeReview = () => {
  emit('update:activeTab', 'cards')
  loadCards()
  loadStats()
}

const savePackHandler = async (data: any) => {
  if (!data?.name?.trim()) return showMessage('请输入卡组名称', 3000, 'error')
  
  try {
    if (data.id) {
      await updatePack(data.id, data)
      showMessage('已更新', 1500, 'info')
    } else {
      await createPack(data.name, data)
      showMessage('已创建', 1500, 'info')
    }
    await loadPackList()
  } catch {
    showMessage('操作失败', 3000, 'error')
  }
}

const deletePackHandler = async (id: string) => {
  await deletePack(id)
  await loadPackList()
  showMessage('已删除', 1500, 'info')
}

const exportPack = async (pack: Pack) => { await exportApkg(pack.id) }
const syncPackToDoc = async (pack: Pack) => { await syncPackToSiyuan(pack.id) }
const importAnkiPack = () => { fileInput.value?.click() }

const handleAnkiImport = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  
  await importApkg(file)
  await loadPackList()
  
  if (fileInput.value) fileInput.value.value = ''
}

const loadAllTags = async () => {
  try {
    const res = await fetchSyncPost('/api/query/sql', { stmt: `SELECT DISTINCT value FROM attributes WHERE name = 'tags' ORDER BY value` })
    if (res?.data) {
      const tagSet = new Set<string>()
      res.data.forEach((item: any) => {
        if (item.value) {
          item.value.split(',').forEach((tag: string) => {
            const trimmed = tag.trim()
            if (trimmed) tagSet.add(trimmed)
          })
        }
      })
      allTags.value = Array.from(tagSet).sort()
    }
  } catch {}
}

onMounted(() => {
  loadSiyuanEmojis()
  loadAllTags()
  loadCards()
  loadPackList()
  loadStats()
  window.addEventListener('sireader:deck-updated', loadCards)
  window.addEventListener('sireader:pack-updated', loadPackList)
  window.addEventListener('sireader:stat-updated', loadStats)
})
</script>

<style scoped lang="scss">
@use './deck.scss';
</style>
