// 闪卡学习逻辑管理（统一从 Anki 数据库读取）
import { getDatabase, type CardProgress } from './database'
import { getSettingsManager } from './settings'
import { getTodayDueCards } from './pack'
import type { DeckCard } from './types'

// 学习会话状态
export interface FlashSession {
  cards: DeckCard[]
  startTime: number
  stats: {
    new: number
    learning: number
    review: number
  }
}

let currentSession: FlashSession | null = null

/**
 * 获取待学习的卡片（所有启用的卡组，应用完整设置）
 */
export const getDueCards = async (): Promise<DeckCard[]> => {
  const db = await getDatabase()
  const settingsManager = getSettingsManager()
  
  // 获取所有启用的卡组
  const enabledDecks = await db.getEnabledDecks()
  if (enabledDecks.length === 0) {
    const defaultDeck = await db.getDeck('default')
    if (defaultDeck) enabledDecks.push(defaultDeck)
  }
  
  // 合并所有启用卡组的今日待学习卡片（getTodayDueCards 已应用每日限制和过滤）
  const allCards: DeckCard[] = []
  for (const deck of enabledDecks) {
    const cards = await getTodayDueCards(deck.id)
    allCards.push(...cards)
  }
  
  if (allCards.length === 0) return []
  
  // 获取设置（用于排序和优先级）
  const firstDeck = enabledDecks[0]
  let settings = await settingsManager.getSettings(firstDeck.id)
  if (!settings) {
    settings = settingsManager.getDefaultSettings(firstDeck.id, firstDeck.name)
  }
  
  // 分类卡片（getTodayDueCards 已过滤，这里只需分类）
  const newCards = allCards.filter(c => !c.learning || c.learning.state === 'new')
  const learningCards = allCards.filter(c => c.learning?.state === 'learning')
  const reviewCards = allCards.filter(c => c.learning?.state === 'review')
  
  // 应用新卡片顺序
  if (settings.newCardOrder === 'random') {
    newCards.sort(() => Math.random() - 0.5)
  } else {
    newCards.sort((a, b) => (a.metadata?.createdAt || 0) - (b.metadata?.createdAt || 0))
  }
  
  // 应用复习排序
  if (settings.reviewSortOrder === 'due') {
    reviewCards.sort((a, b) => (a.learning?.due || 0) - (b.learning?.due || 0))
  } else if (settings.reviewSortOrder === 'random') {
    reviewCards.sort(() => Math.random() - 0.5)
  } else if (settings.reviewSortOrder === 'interval') {
    reviewCards.sort((a, b) => (a.learning?.interval || 0) - (b.learning?.interval || 0))
  }
  
  // 应用优先级
  if (settings.newReviewPriority === 'new-first') {
    return [...newCards, ...learningCards, ...reviewCards]
  } else if (settings.newReviewPriority === 'review-first') {
    return [...learningCards, ...reviewCards, ...newCards]
  } else {
    // 默认：学习中 > 复习 > 新卡片
    return [...learningCards, ...reviewCards, ...newCards]
  }
}

/**
 * 保存卡片学习进度
 */
export const saveCardProgress = async (card: DeckCard) => {
  const db = await getDatabase()
  
  if (!card.learning) return
  
  const progress: CardProgress = {
    id: card.id,
    deckId: card.deckId,
    collectionId: card.metadata?.collectionId,
    ankiNoteId: card.ankiNoteId,
    ankiCardId: card.ankiCardId,
    source: card.metadata?.source || 'manual',
    state: card.learning.state,
    due: card.learning.due,
    interval: card.learning.interval,
    ease: card.learning.ease,
    lapses: card.learning.lapses,
    reps: card.learning.reps,
    lastReview: card.learning.lastReview,
    stability: (card.learning as any).stability,
    difficulty: (card.learning as any).difficulty,
    createdAt: card.metadata?.createdAt || Date.now(),
    updatedAt: Date.now()
  }
  
  await db.saveProgress(progress)
}

/**
 * 开始学习会话
 */
export const startFlashSession = async (): Promise<FlashSession | null> => {
  const cards = await getDueCards()
  
  if (cards.length === 0) {
    return null
  }
  
  currentSession = {
    cards,
    startTime: Date.now(),
    stats: {
      new: cards.filter(c => !c.learning || c.learning.state === 'new').length,
      learning: cards.filter(c => c.learning?.state === 'learning').length,
      review: cards.filter(c => c.learning?.state === 'review').length
    }
  }
  
  return currentSession
}

/**
 * 结束学习会话
 */
export const endFlashSession = async () => {
  currentSession = null
}

/**
 * 获取当前会话
 */
export const getCurrentSession = () => currentSession

/**
 * 计算下次复习时间（应用设置，支持 FSRS）
 */
export const calculateNextReview = async (
  rating: 1 | 2 | 3 | 4,
  card: DeckCard
): Promise<{ interval: number; ease: number; state: 'learning' | 'review' }> => {
  const settingsManager = getSettingsManager()
  let settings = await settingsManager.getSettings(card.deckId)
  if (!settings) {
    settings = settingsManager.getDefaultSettings(card.deckId, 'Default')
  }
  
  // 如果启用了 FSRS，使用 FSRS 算法
  if (settings.enableFsrs) {
    const { calculateWithFSRS } = await import('./fsrs')
    return calculateWithFSRS(rating, card, settings)
  }
  
  // 否则使用传统 SM-2 算法
  const isNew = !card.learning || card.learning.state === 'new'
  const currentInterval = card.learning?.interval || 0
  let ease = card.learning?.ease || settings.startingEase
  let newInterval = currentInterval
  let state: 'learning' | 'review' = 'learning'
  
  if (isNew) {
    // 新卡片 - 使用学习阶梯
    const steps = settings.learningSteps
    switch (rating) {
      case 1: // 重来
        newInterval = steps[0] || 1
        break
      case 2: // 困难
        newInterval = steps[Math.min(1, steps.length - 1)] || 10
        break
      case 3: // 良好
        newInterval = settings.graduatingInterval * 1440
        state = 'review'
        break
      case 4: // 简单
        newInterval = settings.easyInterval * 1440
        state = 'review'
        ease = ease * settings.easyBonus
        break
    }
  } else {
    // 已学习卡片
    switch (rating) {
      case 1: // 重来 - 使用重新学习阶梯
        newInterval = settings.relearningSteps[0] || 1
        ease = Math.max(1.3, ease - 0.2)
        state = 'learning'
        break
      case 2: // 困难
        newInterval = Math.max(settings.minimumInterval * 1440, currentInterval * settings.hardInterval)
        ease = Math.max(1.3, ease - 0.15)
        state = 'review'
        break
      case 3: // 良好
        newInterval = currentInterval * ease * settings.intervalModifier
        state = 'review'
        break
      case 4: // 简单
        newInterval = currentInterval * ease * settings.easyBonus * settings.intervalModifier
        ease = Math.min(ease + 0.15, 2.5)
        state = 'review'
        break
    }
  }
  
  // 应用最大间隔限制
  newInterval = Math.min(newInterval, settings.maxInterval * 1440)
  
  return {
    interval: Math.round(newInterval),
    ease: Math.round(ease * 100) / 100,
    state
  }
}

/**
 * 格式化间隔时间为可读文本
 */
export const formatInterval = (minutes: number): string => {
  if (minutes < 60) return `${minutes}分钟`
  if (minutes < 1440) return `${Math.round(minutes / 60)}小时`
  if (minutes < 43200) return `${Math.round(minutes / 1440)}天`
  return `${Math.round(minutes / 43200)}月`
}

/**
 * 获取评分按钮的时间显示
 */
export const getRatingTimeText = async (
  rating: 1 | 2 | 3 | 4,
  card: DeckCard
): Promise<string> => {
  try {
    const result = await calculateNextReview(rating, card)
    const interval = result.interval || 0
    
    if (interval < 60) return `${interval}分钟`
    if (interval < 1440) return `${Math.round(interval / 60)}小时`
    const days = Math.round(interval / 1440)
    return `${days}天`
  } catch (e) {
    console.error('Failed to calculate rating time:', e)
    return '0分钟'
  }
}
