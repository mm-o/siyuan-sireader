// FSRS 算法实现
// 基于 ts-fsrs 库：https://github.com/open-spaced-repetition/ts-fsrs
import { FSRS, Rating, State, type Card, type RecordLog, type FSRSParameters } from 'ts-fsrs'
import type { DeckCard, DeckSettings } from './types'

/**
 * 创建 FSRS 实例
 */
export const createFSRS = (settings: DeckSettings): FSRS => {
  const params: Partial<FSRSParameters> = {
    request_retention: settings.desiredRetention,
    maximum_interval: settings.maxInterval,
    w: settings.fsrsWeights || undefined
  }
  
  return new FSRS(params)
}

/**
 * 将我们的卡片转换为 FSRS Card
 */
export const toFSRSCard = (card: DeckCard): Card => {
  if (!card.learning) {
    // 新卡片
    return {
      due: new Date(),
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: State.New,
      last_review: new Date()
    }
  }
  
  // 已有学习记录的卡片
  return {
    due: new Date(card.learning.due),
    stability: card.learning.interval / 1440, // 转换为天
    difficulty: (10 - card.learning.ease) / 10, // ease 2.5 -> difficulty 0.75
    elapsed_days: card.learning.lastReview 
      ? Math.floor((Date.now() - card.learning.lastReview) / (1000 * 60 * 60 * 24))
      : 0,
    scheduled_days: card.learning.interval / 1440,
    reps: card.learning.reps,
    lapses: card.learning.lapses,
    state: card.learning.state === 'learning' ? State.Learning : 
           card.learning.state === 'review' ? State.Review : State.New,
    last_review: card.learning.lastReview ? new Date(card.learning.lastReview) : new Date()
  }
}

/**
 * 使用 FSRS 算法计算下次复习时间
 */
export const calculateWithFSRS = (
  rating: 1 | 2 | 3 | 4,
  card: DeckCard,
  settings: DeckSettings
): { interval: number; ease: number; state: 'learning' | 'review'; stability: number; difficulty: number } => {
  const fsrs = createFSRS(settings)
  const fsrsCard = toFSRSCard(card)
  
  // 将评分映射到 FSRS Rating
  const fsrsRating = rating === 1 ? Rating.Again :
                     rating === 2 ? Rating.Hard :
                     rating === 3 ? Rating.Good : Rating.Easy
  
  // 计算下次复习
  const now = new Date()
  const schedulingCards = fsrs.repeat(fsrsCard, now)
  const nextCard = schedulingCards[fsrsRating].card
  
  // 计算间隔（分钟）
  const intervalDays = nextCard.scheduled_days
  const intervalMinutes = Math.round(intervalDays * 1440)
  
  // 计算 ease（从 difficulty 反推）
  const ease = Math.max(1.3, Math.min(2.5, 10 - nextCard.difficulty * 10))
  
  // 确定状态
  const state = nextCard.state === State.Review ? 'review' : 'learning'
  
  return {
    interval: intervalMinutes,
    ease: Math.round(ease * 100) / 100,
    state,
    stability: Math.round(nextCard.stability * 100) / 100,
    difficulty: Math.round(nextCard.difficulty * 100) / 100
  }
}
