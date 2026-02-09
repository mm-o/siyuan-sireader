// 闪卡系统类型定义

// 词典卡片数据
export interface DictCardData {
  phonetic?: string
  meanings?: Array<{ pos: string; text: string }>
  examples?: Array<{ en: string; zh?: string }>
  [key: string]: any
}

// 卡片类型
export type CardType = 'qa' | 'cloze' | 'bidirectional'

// 卡片状态
export type CardState = 'new' | 'learning' | 'review' | 'suspended'

// 卡组设置（完整版）
export interface DeckSettings {
  id: string
  name: string
  
  // 每日上限
  newCardsPerDay: number
  reviewsPerDay: number
  
  // 新卡片
  learningSteps: number[]
  graduatingInterval: number
  easyInterval: number
  newCardOrder: 'random' | 'sequential'
  newReviewPriority: 'mix' | 'new-first' | 'review-first'
  
  // 遗忘
  relearningSteps: number[]
  minimumInterval: number
  leechThreshold: number
  
  // 展示顺序
  newCardGatherPriority: 'deck' | 'position' | 'random'
  reviewSortOrder: 'due' | 'random' | 'interval'
  
  // FSRS
  enableFsrs: boolean
  desiredRetention: number
  fsrsWeights?: number[]
  
  // 埋葬
  buryRelatedNew: boolean
  buryRelatedReviews: boolean
  
  // 音频
  autoPlayAudio: boolean
  playAnswerAudio: boolean
  
  // 计时器
  showTimer: boolean
  maxAnswerSeconds: number
  
  // 自动前进
  autoShowAnswer: boolean
  autoNextCard: boolean
  autoAnswerDelay: number
  autoNextDelay: number
  
  // 轻松日
  easyDays: number[]
  
  // 高级
  maxInterval: number
  startingEase: number
  easyBonus: number
  intervalModifier: number
  hardInterval: number
  newInterval: number
  
  // 元数据
  createdAt: number
  updatedAt: number
}

// 卡组统计
export interface DeckStats {
  total: number
  new: number
  learning: number
  review: number
  suspended: number
}

// 卡组（符合 Anki 结构）
export interface Pack {
  id: string              // 唯一标识
  name: string            // 卡组名称
  desc?: string           // 描述
  icon?: string           // 图标 emoji
  color?: string          // 主题色
  titleImg?: string       // 题头图
  tags?: string[]         // 标签
  parent?: string         // 父卡组 ID（层级结构）
  
  // Anki 关联
  collectionId?: string   // 所属集合 ID（对应文件夹）
  ankiDeckId?: number     // Anki 原始卡组 ID
  
  // 统计
  stats: DeckStats
  
  // 设置
  settings: DeckSettings
  
  // 启用状态
  enabled?: boolean       // 是否启用（用于卡片页面显示）
  
  // 时间戳
  created: number
  updated: number
}

// 集合（Anki Collection）
export interface Collection {
  id: string              // 集合 ID（文件夹名）
  name: string            // 集合名称
  path: string            // 数据库路径
  imported: number        // 导入时间
  apkgPath?: string       // 原始 apkg 文件路径（用于按需提取媒体）
}

// 卡片
export interface DeckCard {
  id: string
  type: CardType
  deckId: string
  
  // Anki 卡片内容
  front: string
  back: string
  
  // 通用属性
  tags: string[]
  fields?: Record<string, string>
  metadata: {
    source: 'dict' | 'manual' | 'import' | 'book'
    bookUrl?: string
    bookTitle?: string
    position?: {
      cfi?: string
      page?: number
      section?: number
      rects?: any[]
    }
    collectionId?: string
    createdAt: number
    updatedAt: number
  }
  
  // Anki 关联
  ankiNoteId?: number
  ankiCardId?: number
  
  // 学习数据
  learning?: {
    state: CardState
    due: number
    interval: number
    ease: number
    lapses: number
    reps: number
    lastReview?: number
  }
  
  // Anki 模板
  model?: string
  modelCss?: string
  scripts?: string[]
  
  timestamp: number
}

// 学习统计
export interface StudyStats {
  today: DailyStats
  history: DailyStats[]
  total: TotalStats
  intervals: IntervalStats
  retention: RetentionStats
  forecast: ForecastStats
}

// 每日统计
export interface DailyStats {
  date: string
  newCards: number
  reviews: number
  correctRate: number
  studyTime: number
  ratings: {
    again: number
    hard: number
    good: number
    easy: number
  }
  mature: number // 成熟卡片复习数
  young: number  // 年轻卡片复习数
}

// 总体统计
export interface TotalStats {
  cards: number
  reviews: number
  studyDays: number
  avgCorrectRate: number
  totalTime: number
  avgStudyTime: number
  streak: number // 连续学习天数
  longestStreak: number
}

// 复习间隔统计
export interface IntervalStats {
  ranges: {
    label: string
    count: number
    percentage: number
  }[]
  avgInterval: number
  medianInterval: number
}

// 记忆保留率统计
export interface RetentionStats {
  overall: number
  byInterval: {
    interval: string
    retention: number
    reviews: number
  }[]
  byEase: {
    ease: string
    retention: number
    reviews: number
  }[]
}

// 预测统计
export interface ForecastStats {
  next7Days: {
    date: string
    new: number
    review: number
    total: number
  }[]
  next30Days: {
    date: string
    new: number
    review: number
    total: number
  }[]
}

// Anki 相关类型
export interface AnkiNote {
  id: number
  guid: string
  mid: number
  mod: number
  tags: string
  flds: string
  sfld: string
}

export interface AnkiCard {
  id: number
  nid: number
  did: number
  ord: number
  type: number
  queue: number
  due: number
  ivl: number
  factor: number
  reps: number
  lapses: number
}

export interface AnkiDeck {
  id: number
  name: string
  desc: string
  mod: number
}

export interface AnkiModel {
  id: number
  name: string
  flds: Array<{ name: string; ord: number }>
  tmpls: Array<{ name: string; qfmt: string; afmt: string }>
}
