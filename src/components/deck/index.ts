// 闪卡系统统一导出

// 组件
export { default as DeckHub } from './DeckHub.vue'
export { default as DeckFlash } from './DeckFlash.vue'
export { default as DeckPack } from './DeckPack.vue'
export { default as DeckStat } from './DeckStat.vue'
export { default as DeckCards } from './DeckCards.vue'
export { default as DeckSettings } from './DeckSettings.vue'

// 数据库（思源数据访问层）
export {
  initDatabase,
  getDatabase,
  DeckDatabase,
  type CardProgress
} from './database'

// Anki 数据库访问层
export {
  queryAnkiCards,
  insertAnkiCard,
  deleteAnkiCard,
  getAnkiCardCount,
  createAnkiDatabase,
  getAnkiDb,
  saveAnkiDb,
  getAnkiDbPath,
  clearAnkiDbCache,
  getMediaFromApkg,
  importApkg as ankiImportApkg
} from './anki'

// 卡片业务逻辑层
export {
  getCards,
  getTodayDueCards,
  addCard,
  removeCard,
  updateCard,
  getCardCount
} from './card'

// 卡组管理
export {
  initPack,
  getPack,
  getCollection,
  createPack,
  updatePack,
  deletePack,
  updatePackStats,
  addCollection,
  importApkg,
  exportApkg
} from './pack'

// 闪卡学习
export {
  getDueCards,
  startFlashSession,
  endFlashSession,
  getCurrentSession,
  calculateNextReview,
  formatInterval,
  getRatingTimeText,
  saveCardProgress
} from './flash'

// FSRS 算法
export {
  createFSRS,
  toFSRSCard,
  calculateWithFSRS
} from './fsrs'

// 设置
export {
  getSettingsManager,
  DeckSettingsManager
} from './settings'

// 统计 + 思源同步
export {
  getStat,
  recordReview,
  getDueCard,
  reviewRiffCard,
  skipRiffCard,
  addRiffCard,
  removeRiffCard,
  getRiffCard,
  getRiffCardByBlockID,
  resetRiffCard,
  getRiffDeck,
  createRiffDeck,
  syncCardToRiff,
  unsyncCardFromRiff,
  isCardSynced,
  syncPackToSiyuan,
  getDeckNotebook,
  DEFAULT_DECK_ID,
  type RiffCardState,
  type Rating
} from './stat'

// 工具
export {
  extractAnkiTitle,
  extractAnkiHint,
  playAudio,
  setupImageLazyLoad
} from './utils'

// 类型
export * from './types'
