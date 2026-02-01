// 统一数据访问层（DAL - Data Access Layer）
// 管理思源数据库连接和底层 CRUD 操作
import initSqlJs from 'sql.js'
import type { Pack, DailyStats } from './types'

const DECK_DATA_PATH = '/data/storage/petal/siyuan-sireader/deck-data.db'

// ========== SQL.js 实例管理 ==========
let sqlJs: any = null
const getSqlJs = async () => {
  if (!sqlJs) {
    sqlJs = await initSqlJs({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/${f}`
    })
  }
  return sqlJs
}

// ========== 学习进度数据库 ==========

// 卡片学习进度（不包含内容）
export interface CardProgress {
  id: string              // 卡片 ID
  deckId: string          // 卡组 ID
  collectionId?: string   // 集合 ID（用于定位 Anki 数据库）
  ankiNoteId?: number     // Anki Note ID
  ankiCardId?: number     // Anki Card ID
  source: 'dict' | 'manual' | 'import' | 'book'  // 来源
  
  // 学习进度
  state: 'new' | 'learning' | 'review' | 'suspended'
  due: number
  interval: number
  ease: number
  lapses: number
  reps: number
  lastReview?: number
  
  // FSRS 数据
  stability?: number      // FSRS 稳定性
  difficulty?: number     // FSRS 难度
  
  // 书籍信息
  bookUrl?: string        // 书籍 URL
  bookTitle?: string      // 书籍标题
  position?: string       // 位置信息（JSON 字符串）
  
  // 元数据
  createdAt: number
  updatedAt: number
}

export class DeckDatabase {
  private db: any = null
  private initialized = false
  
  async init(): Promise<void> {
    if (this.initialized) return
    
    const SQL = await getSqlJs()
    
    try {
      const res = await fetch('/api/file/getFile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: DECK_DATA_PATH })
      })
      
      if (res.ok) {
        const buffer = await res.arrayBuffer()
        if (buffer.byteLength > 100) {
          this.db = new SQL.Database(new Uint8Array(buffer))
          this.db.exec('SELECT 1 FROM card_progress LIMIT 1')
        }
      }
    } catch {}
    
    if (!this.db) {
      this.db = new SQL.Database()
      this.createTables()
    }
    
    this.initialized = true
  }
  
  private createTables(): void {
    this.db.exec(`
      -- 卡片学习进度（不存储内容）
      CREATE TABLE IF NOT EXISTS card_progress (
        id TEXT PRIMARY KEY,
        deck_id TEXT NOT NULL,
        collection_id TEXT,
        anki_note_id INTEGER,
        anki_card_id INTEGER,
        source TEXT NOT NULL,
        state TEXT DEFAULT 'new',
        due INTEGER DEFAULT 0,
        interval INTEGER DEFAULT 0,
        ease REAL DEFAULT 2.5,
        lapses INTEGER DEFAULT 0,
        reps INTEGER DEFAULT 0,
        last_review INTEGER,
        stability REAL,
        difficulty REAL,
        book_url TEXT,
        book_title TEXT,
        position TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_progress_deck ON card_progress(deck_id);
      CREATE INDEX IF NOT EXISTS idx_progress_state ON card_progress(state);
      CREATE INDEX IF NOT EXISTS idx_progress_due ON card_progress(due);
      CREATE INDEX IF NOT EXISTS idx_progress_collection ON card_progress(collection_id);
      CREATE INDEX IF NOT EXISTS idx_progress_last_review ON card_progress(last_review);
      CREATE INDEX IF NOT EXISTS idx_progress_reps ON card_progress(reps);
      CREATE INDEX IF NOT EXISTS idx_progress_interval ON card_progress(interval);
      CREATE INDEX IF NOT EXISTS idx_progress_difficulty ON card_progress(difficulty);
      CREATE INDEX IF NOT EXISTS idx_progress_anki_note ON card_progress(anki_note_id);
      
      -- 卡组元数据
      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        color TEXT,
        title_img TEXT,
        tags TEXT,
        parent TEXT,
        collection_id TEXT,
        anki_deck_id INTEGER,
        total INTEGER DEFAULT 0,
        new INTEGER DEFAULT 0,
        learning INTEGER DEFAULT 0,
        review INTEGER DEFAULT 0,
        suspended INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      -- 学习记录
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id TEXT NOT NULL,
        deck_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        is_new INTEGER NOT NULL,
        time_spent INTEGER NOT NULL,
        reviewed_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_reviews_card ON reviews(card_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(reviewed_at);
      CREATE INDEX IF NOT EXISTS idx_reviews_deck ON reviews(deck_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
      
      -- 每日统计
      CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT PRIMARY KEY,
        new_cards INTEGER DEFAULT 0,
        reviews INTEGER DEFAULT 0,
        correct_rate REAL DEFAULT 0,
        study_time INTEGER DEFAULT 0,
        rating_again INTEGER DEFAULT 0,
        rating_hard INTEGER DEFAULT 0,
        rating_good INTEGER DEFAULT 0,
        rating_easy INTEGER DEFAULT 0,
        mature INTEGER DEFAULT 0,
        young INTEGER DEFAULT 0
      );
      
      -- 集合（Anki Collection）
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        apkg_path TEXT,
        imported_at INTEGER NOT NULL
      );
      
      -- 卡组设置
      CREATE TABLE IF NOT EXISTS deck_settings (
        id TEXT PRIMARY KEY,
        deck_id TEXT NOT NULL UNIQUE,
        notebook_id TEXT DEFAULT '',
        new_cards_per_day INTEGER DEFAULT 20,
        reviews_per_day INTEGER DEFAULT 200,
        learning_steps TEXT DEFAULT '1,10',
        graduating_interval INTEGER DEFAULT 1,
        easy_interval INTEGER DEFAULT 4,
        new_card_order TEXT DEFAULT 'random',
        new_review_priority TEXT DEFAULT 'mix',
        relearning_steps TEXT DEFAULT '10',
        minimum_interval INTEGER DEFAULT 1,
        leech_threshold INTEGER DEFAULT 8,
        new_card_gather_priority TEXT DEFAULT 'deck',
        review_sort_order TEXT DEFAULT 'due',
        enable_fsrs INTEGER DEFAULT 0,
        desired_retention REAL DEFAULT 0.9,
        fsrs_weights TEXT DEFAULT NULL,
        bury_related_new INTEGER DEFAULT 1,
        bury_related_reviews INTEGER DEFAULT 1,
        auto_play_audio INTEGER DEFAULT 1,
        play_answer_audio INTEGER DEFAULT 1,
        show_timer INTEGER DEFAULT 0,
        max_answer_seconds INTEGER DEFAULT 60,
        auto_show_answer INTEGER DEFAULT 0,
        auto_next_card INTEGER DEFAULT 0,
        auto_answer_delay INTEGER DEFAULT 0,
        auto_next_delay INTEGER DEFAULT 0,
        easy_days TEXT DEFAULT '0,6',
        max_interval INTEGER DEFAULT 36500,
        starting_ease REAL DEFAULT 2.5,
        easy_bonus REAL DEFAULT 1.3,
        interval_modifier REAL DEFAULT 1.0,
        hard_interval REAL DEFAULT 1.2,
        new_interval REAL DEFAULT 0.0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_settings_deck ON deck_settings(deck_id);
      
      -- 总体统计
      CREATE TABLE IF NOT EXISTS total_stats (
        id INTEGER PRIMARY KEY DEFAULT 1,
        cards INTEGER DEFAULT 0,
        reviews INTEGER DEFAULT 0,
        study_days INTEGER DEFAULT 0,
        avg_correct_rate REAL DEFAULT 0,
        total_time INTEGER DEFAULT 0,
        avg_study_time INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `)
  }
  
  private async saveDb(): Promise<void> {
    const data = this.db.export()
    const formData = new FormData()
    formData.append('path', DECK_DATA_PATH)
    formData.append('file', new File([data], 'deck-data.db'))
    formData.append('isDir', 'false')
    await fetch('/api/file/putFile', { method: 'POST', body: formData })
  }
  
  // ========== 卡片进度操作 ==========
  async getProgress(id: string): Promise<CardProgress | null> {
    await this.init()
    const result = this.db.exec('SELECT * FROM card_progress WHERE id = ?', [id])
    if (!result[0]?.values[0]) return null
    return this.rowToProgress(result[0].values[0], result[0].columns)
  }
  
  async getProgressByDeck(deckId: string): Promise<CardProgress[]> {
    await this.init()
    const result = this.db.exec('SELECT * FROM card_progress WHERE deck_id = ?', [deckId])
    if (!result[0]) return []
    return result[0].values.map((row: any) => this.rowToProgress(row, result[0].columns))
  }
  
  async getAllProgress(): Promise<CardProgress[]> {
    await this.init()
    const result = this.db.exec('SELECT * FROM card_progress')
    if (!result[0]) return []
    return result[0].values.map((row: any) => this.rowToProgress(row, result[0].columns))
  }
  
  // 性能优化：按条件查询
  async getProgressByState(state: string): Promise<CardProgress[]> {
    await this.init()
    const result = this.db.exec('SELECT * FROM card_progress WHERE state = ?', [state])
    if (!result[0]) return []
    return result[0].values.map((row: any) => this.rowToProgress(row, result[0].columns))
  }
  
  async getTodayReviewedProgress(todayStart: number): Promise<CardProgress[]> {
    await this.init()
    const result = this.db.exec('SELECT * FROM card_progress WHERE last_review >= ?', [todayStart])
    if (!result[0]) return []
    return result[0].values.map((row: any) => this.rowToProgress(row, result[0].columns))
  }
  
  async getProgressByInterval(minDays: number, maxDays: number): Promise<CardProgress[]> {
    await this.init()
    const minMinutes = minDays * 1440
    const maxMinutes = maxDays * 1440
    const result = this.db.exec(
      'SELECT * FROM card_progress WHERE interval >= ? AND interval < ?',
      [minMinutes, maxMinutes]
    )
    if (!result[0]) return []
    return result[0].values.map((row: any) => this.rowToProgress(row, result[0].columns))
  }
  
  async getProgressByDifficulty(minDiff: number, maxDiff: number): Promise<CardProgress[]> {
    await this.init()
    const result = this.db.exec(
      'SELECT * FROM card_progress WHERE difficulty >= ? AND difficulty < ? AND difficulty IS NOT NULL',
      [minDiff, maxDiff]
    )
    if (!result[0]) return []
    return result[0].values.map((row: any) => this.rowToProgress(row, result[0].columns))
  }
  
  async getDifficultCards(lapsesThreshold = 3): Promise<CardProgress[]> {
    await this.init()
    const result = this.db.exec('SELECT * FROM card_progress WHERE lapses >= ?', [lapsesThreshold])
    if (!result[0]) return []
    return result[0].values.map((row: any) => this.rowToProgress(row, result[0].columns))
  }
  
  async saveProgress(progress: CardProgress): Promise<void> {
    await this.init()
    const exists = await this.getProgress(progress.id)
    const now = Date.now()
    
    const params = [
      progress.deckId,
      progress.collectionId || null,
      progress.ankiNoteId || null,
      progress.ankiCardId || null,
      progress.source,
      progress.state,
      progress.due,
      progress.interval,
      progress.ease,
      progress.lapses,
      progress.reps,
      progress.lastReview || null,
      progress.stability || null,
      progress.difficulty || null,
      progress.bookUrl || null,
      progress.bookTitle || null,
      progress.position || null,
      progress.createdAt || now,
      now
    ]
    
    if (exists) {
      this.db.run(`UPDATE card_progress SET deck_id=?,collection_id=?,anki_note_id=?,anki_card_id=?,
        source=?,state=?,due=?,interval=?,ease=?,lapses=?,reps=?,last_review=?,stability=?,difficulty=?,
        book_url=?,book_title=?,position=?,created_at=?,updated_at=? WHERE id=?`,
        [...params, progress.id])
    } else {
      this.db.run(`INSERT INTO card_progress (id,deck_id,collection_id,anki_note_id,anki_card_id,source,state,due,interval,ease,lapses,reps,last_review,stability,difficulty,book_url,book_title,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [progress.id, ...params])
    }
    
    await this.saveDb()
  }
  
  async deleteProgress(id: string): Promise<void> {
    await this.init()
    this.db.run('DELETE FROM card_progress WHERE id = ?', [id])
    await this.saveDb()
  }
  
  // ========== 卡组操作 ==========
  async getDeck(id: string): Promise<Pack | null> {
    await this.init()
    const result = this.db.exec('SELECT * FROM decks WHERE id = ?', [id])
    if (!result[0]?.values[0]) return null
    return this.rowToDeck(result[0].values[0], result[0].columns)
  }
  
  async getDecks(): Promise<Pack[]> {
    await this.init()
    const result = this.db.exec('SELECT * FROM decks')
    if (!result[0]) return []
    return result[0].values.map((row: any) => this.rowToDeck(row, result[0].columns))
  }
  
  async saveDeck(deck: Pack): Promise<void> {
    await this.init()
    const exists = await this.getDeck(deck.id)
    const now = Date.now()
    
    const params = [
      deck.name, deck.desc || null, deck.icon || null, deck.color || null,
      deck.titleImg || null, JSON.stringify(deck.tags || []), deck.parent || null,
      deck.collectionId || null, deck.ankiDeckId || null,
      deck.stats.total, deck.stats.new, deck.stats.learning, deck.stats.review, deck.stats.suspended,
      deck.enabled ? 1 : 0,
      deck.created || now, now
    ]
    
    if (exists) {
      this.db.run(`UPDATE decks SET name=?,description=?,icon=?,color=?,title_img=?,tags=?,parent=?,
        collection_id=?,anki_deck_id=?,total=?,new=?,learning=?,review=?,suspended=?,enabled=?,created_at=?,updated_at=? WHERE id=?`,
        [...params, deck.id])
    } else {
      this.db.run(`INSERT INTO decks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [deck.id, ...params])
    }
    
    await this.saveDb()
  }
  
  async deleteDeck(id: string): Promise<void> {
    await this.init()
    this.db.run('DELETE FROM decks WHERE id = ?', [id])
    await this.saveDb()
  }
  
  async toggleDeckEnabled(id: string): Promise<boolean> {
    await this.init()
    const deck = await this.getDeck(id)
    if (!deck) return false
    
    const newEnabled = !deck.enabled
    this.db.run('UPDATE decks SET enabled = ?, updated_at = ? WHERE id = ?', [newEnabled ? 1 : 0, Date.now(), id])
    await this.saveDb()
    return newEnabled
  }
  
  async getEnabledDecks(): Promise<Pack[]> {
    await this.init()
    const result = this.db.exec('SELECT * FROM decks WHERE enabled = 1')
    if (!result[0]) return []
    return result[0].values.map((row: any) => this.rowToDeck(row, result[0].columns))
  }
  
  async updateDeckStats(deckId: string): Promise<void> {
    await this.init()
    const result = this.db.exec(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN state = 'new' THEN 1 ELSE 0 END) as new,
        SUM(CASE WHEN state = 'learning' THEN 1 ELSE 0 END) as learning,
        SUM(CASE WHEN state = 'review' THEN 1 ELSE 0 END) as review,
        SUM(CASE WHEN state = 'suspended' THEN 1 ELSE 0 END) as suspended
      FROM card_progress WHERE deck_id = ?
    `, [deckId])
    
    if (result[0]?.values[0]) {
      const [total, newC, learning, review, suspended] = result[0].values[0]
      this.db.run('UPDATE decks SET total=?,new=?,learning=?,review=?,suspended=? WHERE id=?',
        [total, newC, learning, review, suspended, deckId])
      await this.saveDb()
    }
  }
  
  // ========== 学习记录 ==========
  async recordReview(cardId: string, deckId: string, rating: number, isNew: boolean, timeSpent: number): Promise<void> {
    await this.init()
    this.db.run('INSERT INTO reviews (card_id,deck_id,rating,is_new,time_spent,reviewed_at) VALUES(?,?,?,?,?,?)',
      [cardId, deckId, rating, isNew ? 1 : 0, timeSpent, Date.now()])
    await this.saveDb()
  }
  
  async getCardReviewHistory(cardId: string, limit = 20): Promise<any[]> {
    await this.init()
    const result = this.db.exec(
      'SELECT * FROM reviews WHERE card_id = ? ORDER BY reviewed_at DESC LIMIT ?',
      [cardId, limit]
    )
    if (!result[0]) return []
    return result[0].values.map((row: any) => ({
      id: row[0],
      cardId: row[1],
      deckId: row[2],
      rating: row[3],
      isNew: row[4] === 1,
      timeSpent: row[5],
      reviewedAt: row[6]
    }))
  }
  
  async getReviewsByDateRange(startDate: number, endDate: number): Promise<any[]> {
    await this.init()
    const result = this.db.exec(
      'SELECT * FROM reviews WHERE reviewed_at >= ? AND reviewed_at < ? ORDER BY reviewed_at DESC',
      [startDate, endDate]
    )
    if (!result[0]) return []
    return result[0].values.map((row: any) => ({
      id: row[0],
      cardId: row[1],
      deckId: row[2],
      rating: row[3],
      isNew: row[4] === 1,
      timeSpent: row[5],
      reviewedAt: row[6]
    }))
  }
  
  async cleanOldReviews(daysToKeep = 90): Promise<void> {
    await this.init()
    const cutoff = Date.now() - (daysToKeep * 86400000)
    this.db.run('DELETE FROM reviews WHERE reviewed_at < ?', [cutoff])
    await this.saveDb()
  }
  
  async getDailyStats(date: string): Promise<DailyStats> {
    await this.init()
    const result = this.db.exec('SELECT * FROM daily_stats WHERE date = ?', [date])
    if (!result[0]?.values[0]) {
      return { date, newCards: 0, reviews: 0, correctRate: 0, studyTime: 0,
        ratings: { again: 0, hard: 0, good: 0, easy: 0 }, mature: 0, young: 0 }
    }
    return this.rowToStats(result[0].values[0], result[0].columns)
  }
  
  async saveDailyStats(stats: DailyStats): Promise<void> {
    await this.init()
    const exists = await this.getDailyStats(stats.date)
    const params = [
      stats.newCards, stats.reviews, stats.correctRate, stats.studyTime,
      stats.ratings.again, stats.ratings.hard, stats.ratings.good, stats.ratings.easy,
      stats.mature, stats.young
    ]
    
    if (exists.reviews > 0 || exists.newCards > 0) {
      this.db.run(`UPDATE daily_stats SET new_cards=?,reviews=?,correct_rate=?,study_time=?,
        rating_again=?,rating_hard=?,rating_good=?,rating_easy=?,mature=?,young=? WHERE date=?`,
        [...params, stats.date])
    } else {
      this.db.run('INSERT INTO daily_stats VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        [stats.date, ...params])
    }
    
    await this.saveDb()
  }
  
  async getStatsHistory(days: number): Promise<DailyStats[]> {
    await this.init()
    const result = this.db.exec('SELECT * FROM daily_stats ORDER BY date DESC LIMIT ?', [days])
    if (!result[0]) return []
    return result[0].values.map((row: any) => this.rowToStats(row, result[0].columns))
  }
  
  // ========== 集合操作 ==========
  async saveCollection(col: { id: string; name: string; path: string; apkgPath?: string; imported: number }): Promise<void> {
    await this.init()
    this.db.run('INSERT OR REPLACE INTO collections VALUES(?,?,?,?,?)',
      [col.id, col.name, col.path, col.apkgPath || null, col.imported])
    await this.saveDb()
  }
  
  async getCollections(): Promise<any[]> {
    await this.init()
    const result = this.db.exec('SELECT * FROM collections')
    if (!result[0]) return []
    return result[0].values.map((row: any) => ({
      id: row[0], name: row[1], path: row[2], apkgPath: row[3], imported: row[4]
    }))
  }
  
  // ========== 设置操作 ==========
  async getSettings(deckId: string): Promise<any | null> {
    await this.init()
    const result = this.db.exec('SELECT * FROM deck_settings WHERE deck_id = ?', [deckId])
    if (!result[0]?.values[0]) return null
    return this.rowToSettings(result[0].values[0], result[0].columns)
  }
  
  async saveSettings(settings: any): Promise<void> {
    await this.init()
    const exists = await this.getSettings(settings.deckId)
    const now = Date.now()
    
    const params = [
      settings.deckId,
      settings.notebookId || '',
      settings.newCardsPerDay,
      settings.reviewsPerDay,
      Array.isArray(settings.learningSteps) ? settings.learningSteps.join(',') : settings.learningSteps,
      settings.graduatingInterval,
      settings.easyInterval,
      settings.newCardOrder,
      settings.newReviewPriority,
      Array.isArray(settings.relearningSteps) ? settings.relearningSteps.join(',') : settings.relearningSteps,
      settings.minimumInterval,
      settings.leechThreshold,
      settings.newCardGatherPriority,
      settings.reviewSortOrder,
      settings.enableFsrs ? 1 : 0,
      settings.desiredRetention || 0.9,
      settings.fsrsWeights ? JSON.stringify(settings.fsrsWeights) : null,
      settings.buryRelatedNew ? 1 : 0,
      settings.buryRelatedReviews ? 1 : 0,
      settings.autoPlayAudio ? 1 : 0,
      settings.playAnswerAudio ? 1 : 0,
      settings.showTimer ? 1 : 0,
      settings.maxAnswerSeconds,
      settings.autoShowAnswer ? 1 : 0,
      settings.autoNextCard ? 1 : 0,
      settings.autoAnswerDelay,
      settings.autoNextDelay,
      Array.isArray(settings.easyDays) ? settings.easyDays.join(',') : settings.easyDays,
      settings.maxInterval,
      settings.startingEase,
      settings.easyBonus,
      settings.intervalModifier,
      settings.hardInterval,
      settings.newInterval,
      settings.createdAt || now,
      now
    ]
    
    if (exists) {
      this.db.run(`UPDATE deck_settings SET 
        deck_id=?,notebook_id=?,new_cards_per_day=?,reviews_per_day=?,learning_steps=?,
        graduating_interval=?,easy_interval=?,new_card_order=?,new_review_priority=?,
        relearning_steps=?,minimum_interval=?,leech_threshold=?,new_card_gather_priority=?,
        review_sort_order=?,enable_fsrs=?,desired_retention=?,fsrs_weights=?,
        bury_related_new=?,bury_related_reviews=?,auto_play_audio=?,
        play_answer_audio=?,show_timer=?,max_answer_seconds=?,auto_show_answer=?,
        auto_next_card=?,auto_answer_delay=?,auto_next_delay=?,easy_days=?,max_interval=?,
        starting_ease=?,easy_bonus=?,interval_modifier=?,hard_interval=?,new_interval=?,
        created_at=?,updated_at=? WHERE id=?`,
        [...params, settings.id])
    } else {
      this.db.run(`INSERT INTO deck_settings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [settings.id, ...params])
    }
    
    await this.saveDb()
  }
  
  async deleteSettings(deckId: string): Promise<void> {
    await this.init()
    this.db.run('DELETE FROM deck_settings WHERE deck_id = ?', [deckId])
    await this.saveDb()
  }
  
  // ========== 总体统计操作 ==========
  async getTotalStats(): Promise<any> {
    await this.init()
    const result = this.db.exec('SELECT * FROM total_stats WHERE id = 1')
    if (!result[0]?.values[0]) {
      return {
        cards: 0, reviews: 0, studyDays: 0, avgCorrectRate: 0,
        totalTime: 0, avgStudyTime: 0, streak: 0, longestStreak: 0
      }
    }
    return this.rowToTotalStats(result[0].values[0], result[0].columns)
  }
  
  async updateTotalStats(stats: any): Promise<void> {
    await this.init()
    const exists = await this.getTotalStats()
    const now = Date.now()
    
    const params = [
      stats.cards ?? exists.cards,
      stats.reviews ?? exists.reviews,
      stats.studyDays ?? exists.studyDays,
      stats.avgCorrectRate ?? exists.avgCorrectRate,
      stats.totalTime ?? exists.totalTime,
      stats.avgStudyTime ?? exists.avgStudyTime,
      stats.streak ?? exists.streak,
      stats.longestStreak ?? exists.longestStreak,
      now
    ]
    
    if (exists.reviews > 0 || exists.cards > 0) {
      this.db.run(`UPDATE total_stats SET 
        cards=?,reviews=?,study_days=?,avg_correct_rate=?,total_time=?,
        avg_study_time=?,streak=?,longest_streak=?,updated_at=? WHERE id=1`,
        params)
    } else {
      this.db.run('INSERT INTO total_stats VALUES(1,?,?,?,?,?,?,?,?,?)', params)
    }
    
    await this.saveDb()
  }
  
  // ========== 辅助方法 ==========
  private rowToProgress(row: any, cols: string[]): CardProgress {
    const get = (name: string) => row[cols.indexOf(name)]
    return {
      id: get('id'),
      deckId: get('deck_id'),
      collectionId: get('collection_id'),
      ankiNoteId: get('anki_note_id'),
      ankiCardId: get('anki_card_id'),
      source: get('source'),
      state: get('state'),
      due: get('due'),
      interval: get('interval'),
      ease: get('ease'),
      lapses: get('lapses'),
      reps: get('reps'),
      lastReview: get('last_review'),
      stability: get('stability'),
      difficulty: get('difficulty'),
      bookUrl: get('book_url'),
      bookTitle: get('book_title'),
      position: get('position'),
      createdAt: get('created_at'),
      updatedAt: get('updated_at')
    }
  }
  
  private rowToDeck(row: any, cols: string[]): Pack {
    const get = (name: string) => row[cols.indexOf(name)]
    const tags = get('tags')
    
    return {
      id: get('id'),
      name: get('name'),
      desc: get('description'),
      icon: get('icon'),
      color: get('color'),
      titleImg: get('title_img'),
      tags: tags ? JSON.parse(tags) : [],
      parent: get('parent'),
      collectionId: get('collection_id'),
      ankiDeckId: get('anki_deck_id'),
      enabled: get('enabled') === 1,
      stats: {
        total: get('total'),
        new: get('new'),
        learning: get('learning'),
        review: get('review'),
        suspended: get('suspended')
      },
      settings: {} as any,
      created: get('created_at'),
      updated: get('updated_at')
    }
  }
  
  private rowToStats(row: any, cols: string[]): DailyStats {
    const get = (name: string) => row[cols.indexOf(name)]
    return {
      date: get('date'),
      newCards: get('new_cards'),
      reviews: get('reviews'),
      correctRate: get('correct_rate'),
      studyTime: get('study_time'),
      ratings: {
        again: get('rating_again'),
        hard: get('rating_hard'),
        good: get('rating_good'),
        easy: get('rating_easy')
      },
      mature: get('mature'),
      young: get('young')
    }
  }
  
  private rowToSettings(row: any, cols: string[]): any {
    const get = (name: string) => row[cols.indexOf(name)]
    const parseArray = (str: string) => str ? str.split(',').map(Number) : []
    
    return {
      id: get('id'),
      deckId: get('deck_id'),
      notebookId: get('notebook_id'),
      newCardsPerDay: get('new_cards_per_day'),
      reviewsPerDay: get('reviews_per_day'),
      learningSteps: parseArray(get('learning_steps')),
      graduatingInterval: get('graduating_interval'),
      easyInterval: get('easy_interval'),
      newCardOrder: get('new_card_order'),
      newReviewPriority: get('new_review_priority'),
      relearningSteps: parseArray(get('relearning_steps')),
      minimumInterval: get('minimum_interval'),
      leechThreshold: get('leech_threshold'),
      newCardGatherPriority: get('new_card_gather_priority'),
      reviewSortOrder: get('review_sort_order'),
      enableFsrs: get('enable_fsrs') === 1,
      desiredRetention: get('desired_retention') || 0.9,
      fsrsWeights: get('fsrs_weights') ? JSON.parse(get('fsrs_weights')) : undefined,
      buryRelatedNew: get('bury_related_new') === 1,
      buryRelatedReviews: get('bury_related_reviews') === 1,
      autoPlayAudio: get('auto_play_audio') === 1,
      playAnswerAudio: get('play_answer_audio') === 1,
      showTimer: get('show_timer') === 1,
      maxAnswerSeconds: get('max_answer_seconds'),
      autoShowAnswer: get('auto_show_answer') === 1,
      autoNextCard: get('auto_next_card') === 1,
      autoAnswerDelay: get('auto_answer_delay'),
      autoNextDelay: get('auto_next_delay'),
      easyDays: parseArray(get('easy_days')),
      maxInterval: get('max_interval'),
      startingEase: get('starting_ease'),
      easyBonus: get('easy_bonus'),
      intervalModifier: get('interval_modifier'),
      hardInterval: get('hard_interval'),
      newInterval: get('new_interval'),
      createdAt: get('created_at'),
      updatedAt: get('updated_at')
    }
  }
  
  private rowToTotalStats(row: any, cols: string[]): any {
    const get = (name: string) => row[cols.indexOf(name)]
    return {
      cards: get('cards'),
      reviews: get('reviews'),
      studyDays: get('study_days'),
      avgCorrectRate: get('avg_correct_rate'),
      totalTime: get('total_time'),
      avgStudyTime: get('avg_study_time'),
      streak: get('streak'),
      longestStreak: get('longest_streak')
    }
  }
}

let db: DeckDatabase | null = null
let initPromise: Promise<DeckDatabase> | null = null

export const initDatabase = () => {
  if (!db && !initPromise) {
    initPromise = Promise.resolve().then(() => {
      db = new DeckDatabase()
      return db
    })
  }
  return initPromise
}

export const getDatabase = async (): Promise<DeckDatabase> => {
  if (db) return db
  if (initPromise) return initPromise
  // 如果还没初始化，自动初始化
  return initDatabase()!
}
