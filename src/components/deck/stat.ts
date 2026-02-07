// 统计数据管理（使用统一数据库）
import { fetchSyncPost } from 'siyuan'
import type { StudyStats, DailyStats, DeckCard, IntervalStats, RetentionStats, ForecastStats } from './types'
import { getDatabase } from './database'

const DAY = 86400000
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
  
  const total = await db.getTotalStats()
  total.reviews++
  total.totalTime += time
  
  const history = await db.getStatsHistory(365)
  const allRev = history.reduce((s, d) => s + d.reviews, 0) + stats.reviews
  const allCor = history.reduce((s, d) => s + (d.reviews * d.correctRate / 100), 0) + (stats.reviews * stats.correctRate / 100)
  total.avgCorrectRate = allRev > 0 ? Math.round((allCor / allRev) * 100) : 0
  
  total.studyDays = new Set([...history.map(d => d.date), stats.date]).size
  total.avgStudyTime = Math.round(total.totalTime / total.studyDays)
  
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

// 思源闪卡 API
export type RiffCardState = 0 | 1 | 2 | 3
export type Rating = 1 | 2 | 3 | 4

export const getDueCard = (deckID: string, reviewedCards: { cardID: string }[] = []) =>
  fetchSyncPost('/api/riff/getRiffDueCards', { deckID, reviewedCards })

export const reviewRiffCard = (deckID: string, cardID: string, rating: Rating) =>
  fetchSyncPost('/api/riff/reviewRiffCard', { deckID, cardID, rating })

export const skipRiffCard = (deckID: string, cardID: string) =>
  fetchSyncPost('/api/riff/skipReviewRiffCard', { deckID, cardID })

export const getRiffDeck = () =>
  fetchSyncPost('/api/riff/getRiffDecks', {})

export const createRiffDeck = (name: string) =>
  fetchSyncPost('/api/riff/createRiffDeck', { name })

