// 统计数据管理（使用统一数据库）
import { fetchSyncPost } from 'siyuan'
import { prependBlock } from '@/api'
import type { StudyStats, DailyStats, DeckCard, IntervalStats, RetentionStats, ForecastStats } from './types'
import { getDatabase } from './database'

const DECK_ID = '20230218211946-2kw8jgx'
const NB_KEY = 'sireader-deck-notebook'
const DAY = 86400000

let nbID: string | null = null

const today = () => new Date().toISOString().split('T')[0]

// 获取统计数据
export const getStat = async (): Promise<StudyStats> => {
  const db = await getDatabase()
  await db.init()
  
  const todayDate = today()
  const todayStats = await db.getDailyStats(todayDate)
  const history = await db.getStatsHistory(365)
  const total = await db.getTotalStats()
  
  return {
    today: todayStats,
    history: history.filter(h => h.date !== todayDate),
    total,
    intervals: { ranges: [], avgInterval: 0, medianInterval: 0 },
    retention: { overall: 0, byInterval: [], byEase: [] },
    forecast: { next7Days: [], next30Days: [] }
  }
}

// 记录学习
export const recordReview = async (
  rating: 1 | 2 | 3 | 4,
  isNew: boolean,
  time: number,
  mature = false
): Promise<void> => {
  const db = await getDatabase()
  await db.init()
  
  const todayDate = today()
  const stats = await db.getDailyStats(todayDate)
  
  // 更新今日统计
  if (isNew) stats.newCards++
  stats.reviews++
  stats.studyTime += time
  if (mature) stats.mature++
  else stats.young++
  
  const map = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' } as const
  stats.ratings[map[rating]]++
  
  const { again, hard, good, easy } = stats.ratings
  const tot = again + hard + good + easy
  stats.correctRate = tot > 0 ? Math.round(((good + easy) / tot) * 100) : 0
  
  await db.saveDailyStats(stats)
  
  // 更新总体统计
  const total = await db.getTotalStats()
  total.reviews++
  total.totalTime += time
  
  // 计算平均正确率
  const history = await db.getStatsHistory(365)
  const allRev = history.reduce((s, d) => s + d.reviews, 0) + stats.reviews
  const allCor = history.reduce((s, d) => s + (d.reviews * d.correctRate / 100), 0) + (stats.reviews * stats.correctRate / 100)
  total.avgCorrectRate = allRev > 0 ? Math.round((allCor / allRev) * 100) : 0
  
  // 计算学习天数
  total.studyDays = new Set([...history.map(d => d.date), stats.date]).size
  total.avgStudyTime = Math.round(total.totalTime / total.studyDays)
  
  // 计算连续学习天数
  updateStreak(total, history, stats)
  
  await db.updateTotalStats(total)
}

// 计算连续学习天数
const updateStreak = (total: any, history: DailyStats[], todayStats: DailyStats) => {
  const dates = [...history.map(d => d.date), todayStats.date].sort().reverse()
  let cur = 0, longest = 0, temp = 0
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  
  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i])
    d.setHours(0, 0, 0, 0)
    
    if (i === 0) {
      const diff = Math.floor((t.getTime() - d.getTime()) / DAY)
      if (diff <= 1) cur = temp = 1
    } else {
      const prev = new Date(dates[i - 1])
      prev.setHours(0, 0, 0, 0)
      const diff = Math.floor((prev.getTime() - d.getTime()) / DAY)
      
      if (diff === 1) {
        temp++
        if (i === 1 || cur > 0) cur++
      } else {
        longest = Math.max(longest, temp)
        temp = 1
        if (cur > 0) cur = 0
      }
    }
  }
  
  total.streak = cur
  total.longestStreak = Math.max(total.longestStreak, longest, temp, cur)
}

// 计算间隔分布
export const calcInterval = (cards: DeckCard[]): IntervalStats => {
  const ivls = cards.filter(c => c.learning?.interval).map(c => c.learning!.interval).sort((a, b) => a - b)
  if (!ivls.length) return { ranges: [], avgInterval: 0, medianInterval: 0 }
  
  const ranges = [
    { label: '<1天', min: 0, max: 1 },
    { label: '1-7天', min: 1, max: 7 },
    { label: '1-4周', min: 7, max: 28 },
    { label: '1-3月', min: 28, max: 90 },
    { label: '3-6月', min: 90, max: 180 },
    { label: '6月-1年', min: 180, max: 365 },
    { label: '>1年', min: 365, max: Infinity }
  ].map(r => ({ ...r, count: ivls.filter(i => i >= r.min && i < r.max).length }))
  
  const tot = ivls.length
  return {
    ranges: ranges.map(r => ({ label: r.label, count: r.count, percentage: Math.round((r.count / tot) * 100) })),
    avgInterval: Math.round(ivls.reduce((s, i) => s + i, 0) / tot),
    medianInterval: ivls[Math.floor(tot / 2)]
  }
}

// 计算记忆保留率
export const calcRetention = async (): Promise<RetentionStats> => {
  const stats = await getStat()
  const days = [...stats.history, stats.today]
  const tot = days.reduce((s, d) => s + d.reviews, 0)
  if (!tot) return { overall: 0, byInterval: [], byEase: [] }
  
  const cor = days.reduce((s, d) => s + d.ratings.good + d.ratings.easy, 0)
  return { overall: Math.round((cor / tot) * 100), byInterval: [], byEase: [] }
}

// 计算未来预测
export const calcForecast = (cards: DeckCard[]): ForecastStats => {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  const n7 = [], n30 = []
  
  for (let i = 0; i < 30; i++) {
    const d = new Date(t)
    d.setDate(d.getDate() + i)
    const ds = d.toISOString().split('T')[0]
    
    const due = cards.filter(c => {
      if (!c.learning?.due) return false
      const dd = new Date(c.learning.due)
      dd.setHours(0, 0, 0, 0)
      return dd.getTime() === d.getTime()
    }).length
    
    const f = { date: ds, new: i === 0 ? 20 : 0, review: due, total: due + (i === 0 ? 20 : 0) }
    if (i < 7) n7.push(f)
    n30.push(f)
  }
  
  return { next7Days: n7, next30Days: n30 }
}

// ========== 思源闪卡 API ==========
export type RiffCardState = 0 | 1 | 2 | 3
export type Rating = 1 | 2 | 3 | 4

export const getDueCard = (deckID: string, reviewedCards: { cardID: string }[] = []) =>
  fetchSyncPost('/api/riff/getRiffDueCards', { deckID, reviewedCards })

export const reviewRiffCard = (deckID: string, cardID: string, rating: Rating) =>
  fetchSyncPost('/api/riff/reviewRiffCard', { deckID, cardID, rating })

export const skipRiffCard = (deckID: string, cardID: string) =>
  fetchSyncPost('/api/riff/skipReviewRiffCard', { deckID, cardID })

export const addRiffCard = (deckID: string, blockIDs: string[]) =>
  fetchSyncPost('/api/riff/addRiffCards', { deckID, blockIDs })

export const removeRiffCard = (deckID: string, blockIDs: string[]) =>
  fetchSyncPost('/api/riff/removeRiffCards', { deckID, blockIDs })

export const getRiffCard = (deckID: string, page = 1, pageSize = 100) =>
  fetchSyncPost('/api/riff/getRiffCards', { id: deckID, page, pageSize })

export const getRiffCardByBlockID = (blockIDs: string[]) =>
  fetchSyncPost('/api/riff/getRiffCardsByBlockIDs', { blockIDs })

export const resetRiffCard = (deckID: string, blockIDs?: string[]) =>
  fetchSyncPost('/api/riff/resetRiffCards', { type: 'deck', id: deckID, deckID, blockIDs: blockIDs || [] })

export const getRiffDeck = () =>
  fetchSyncPost('/api/riff/getRiffDecks', {})

export const createRiffDeck = (name: string) =>
  fetchSyncPost('/api/riff/createRiffDeck', { name })

// 笔记本管理
export const getDeckNotebook = async (): Promise<string> => {
  if (nbID) return nbID
  
  try {
    const stored = localStorage.getItem(NB_KEY)
    if (stored) {
      const res = await fetchSyncPost('/api/notebook/lsNotebooks', {})
      if (res?.data?.notebooks?.find((nb: any) => nb.id === stored)) {
        nbID = stored
        return nbID
      }
    }
  } catch { }
  
  try {
    const res = await fetchSyncPost('/api/notebook/lsNotebooks', {})
    if (res?.data?.notebooks?.length) {
      nbID = res.data.notebooks[0].id
      localStorage.setItem(NB_KEY, nbID)
      return nbID
    }
  } catch { }
  
  throw new Error('无法获取笔记本')
}

// ========== 同步功能（待实现） ==========
const fmt = (c: DeckCard): string => {
  const { word, data } = c as any
  const parts = [`## ${word}`]
  if (data.phonetic) parts.push(`**/${data.phonetic}/**`)
  if (data.meanings?.length) {
    parts.push('')
    data.meanings.forEach((m: any) => parts.push(`- **${m.pos}** ${m.text}`))
  }
  if (data.examples?.length) {
    parts.push('')
    data.examples.forEach((e: any) => {
      parts.push(`> ${e.en}`)
      if (e.zh) parts.push(`> ${e.zh}`)
    })
  }
  return parts.join('\n')
}

const createBlock = async (md: string, pid: string): Promise<string> => {
  const res = await prependBlock('markdown', md, pid)
  if (!res || !Array.isArray(res) || !res.length) throw new Error('创建块失败')
  const bid = res[0]?.doOperations?.[0]?.id
  if (!bid) throw new Error('未返回块ID')
  return bid
}

export const syncCardToRiff = async (c: DeckCard, deckID = DECK_ID): Promise<string> => {
  if ((c as any).riffBlockID) return (c as any).riffBlockID
  const md = fmt(c)
  const bid = await createBlock(md, deckID)
  await addRiffCard(deckID, [bid])
  // TODO: 保存 riffBlockID 到数据库
  console.warn('[stat] syncCardToRiff riffBlockID save not implemented')
  return bid
}

export const unsyncCardFromRiff = async (c: DeckCard, deckID = DECK_ID): Promise<boolean> => {
  if (!(c as any).riffBlockID) return false
  await removeRiffCard(deckID, [(c as any).riffBlockID])
  // TODO: 从数据库删除 riffBlockID
  console.warn('[stat] unsyncCardFromRiff not implemented')
  return true
}

export const isCardSynced = async (c: DeckCard): Promise<boolean> => {
  if (!(c as any).riffBlockID) return false
  try {
    const res = await getRiffCardByBlockID([(c as any).riffBlockID])
    return res?.data?.blocks?.length > 0
  } catch {
    return false
  }
}

export const syncPackToSiyuan = async (deckId: string) => {
  // TODO: 实现批量同步
  throw new Error(`功能开发中: ${deckId}`)
}

export { DECK_ID as DEFAULT_DECK_ID }
