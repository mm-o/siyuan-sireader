// 闪卡设置管理（使用统一数据库）
import type { DeckSettings } from './types'
import { getDatabase } from './database'

export class DeckSettingsManager {
  getDefaultSettings(deckId: string, name: string): DeckSettings {
    const now = Date.now()
    return {
      id: `settings-${deckId}`,
      name,
      notebookId: '',
      newCardsPerDay: 20,
      reviewsPerDay: 200,
      learningSteps: [1, 10],
      graduatingInterval: 1,
      easyInterval: 4,
      newCardOrder: 'random',
      newReviewPriority: 'mix',
      relearningSteps: [10],
      minimumInterval: 1,
      leechThreshold: 8,
      newCardGatherPriority: 'deck',
      reviewSortOrder: 'due',
      enableFsrs: false,
      desiredRetention: 0.9,
      fsrsWeights: undefined,
      buryRelatedNew: true,
      buryRelatedReviews: true,
      autoPlayAudio: true,
      playAnswerAudio: true,
      showTimer: false,
      maxAnswerSeconds: 60,
      autoShowAnswer: false,
      autoNextCard: false,
      autoAnswerDelay: 0,
      autoNextDelay: 0,
      easyDays: [0, 6],
      maxInterval: 36500,
      startingEase: 2.5,
      easyBonus: 1.3,
      intervalModifier: 1.0,
      hardInterval: 1.2,
      newInterval: 0.0,
      createdAt: now,
      updatedAt: now
    }
  }
  
  async getSettings(deckId: string): Promise<DeckSettings | null> {
    const db = await getDatabase()
    await db.init()
    const settings = await db.getSettings(deckId)
    return settings
  }
  
  async saveSettings(settings: DeckSettings): Promise<void> {
    const db = await getDatabase()
    await db.init()
    
    // 转换为数据库格式
    const dbSettings = {
      id: settings.id,
      deckId: settings.id.replace('settings-', ''),
      notebookId: settings.notebookId,
      newCardsPerDay: settings.newCardsPerDay,
      reviewsPerDay: settings.reviewsPerDay,
      learningSteps: settings.learningSteps,
      graduatingInterval: settings.graduatingInterval,
      easyInterval: settings.easyInterval,
      newCardOrder: settings.newCardOrder,
      newReviewPriority: settings.newReviewPriority,
      relearningSteps: settings.relearningSteps,
      minimumInterval: settings.minimumInterval,
      leechThreshold: settings.leechThreshold,
      newCardGatherPriority: settings.newCardGatherPriority,
      reviewSortOrder: settings.reviewSortOrder,
      enableFsrs: settings.enableFsrs,
      desiredRetention: settings.desiredRetention,
      fsrsWeights: settings.fsrsWeights,
      buryRelatedNew: settings.buryRelatedNew,
      buryRelatedReviews: settings.buryRelatedReviews,
      autoPlayAudio: settings.autoPlayAudio,
      playAnswerAudio: settings.playAnswerAudio,
      showTimer: settings.showTimer,
      maxAnswerSeconds: settings.maxAnswerSeconds,
      autoShowAnswer: settings.autoShowAnswer,
      autoNextCard: settings.autoNextCard,
      autoAnswerDelay: settings.autoAnswerDelay,
      autoNextDelay: settings.autoNextDelay,
      easyDays: settings.easyDays,
      maxInterval: settings.maxInterval,
      startingEase: settings.startingEase,
      easyBonus: settings.easyBonus,
      intervalModifier: settings.intervalModifier,
      hardInterval: settings.hardInterval,
      newInterval: settings.newInterval,
      createdAt: settings.createdAt,
      updatedAt: Date.now()
    }
    
    await db.saveSettings(dbSettings)
  }
  
  async deleteSettings(deckId: string): Promise<void> {
    const db = await getDatabase()
    await db.init()
    await db.deleteSettings(deckId)
  }
}

let manager: DeckSettingsManager | null = null

export const getSettingsManager = () => {
  if (!manager) manager = new DeckSettingsManager()
  return manager
}
