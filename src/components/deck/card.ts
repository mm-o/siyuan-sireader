// 卡片业务逻辑层
import type { DeckCard } from './types'
import type { CardProgress } from './database'
import { queryAnkiCards, insertAnkiCard, deleteAnkiCard, getAnkiCardCount, getAnkiDb, saveAnkiDb } from './anki'

const notifyCards=()=>window.dispatchEvent(new Event('sireader:deck-updated'))
const extractBlockId = (tags: string): string | null => tags?.match(/siyuan-block-([a-z0-9-]+)/)?.[1] || null

const mergeCardData = (ankiCards: any[], progressList: CardProgress[], deckId: string, collectionId: string): DeckCard[] => {
  const progressMap = new Map(progressList.map(p => [p.ankiCardId, p]))
  return ankiCards.map(c => {
    const p = progressMap.get(c.id)
    return {
      id: `card-${c.id}`,
      type: 'qa',
      deckId,
      front: c.front,
      back: c.back,
      tags: c.tags || [],
      metadata: {
        source: p?.source || 'import',
        collectionId,
        createdAt: p?.createdAt || Date.now(),
        updatedAt: p?.updatedAt || Date.now()
      },
      ankiNoteId: c.nid,
      ankiCardId: c.id,
      timestamp: p?.createdAt || Date.now(),
      learning: p ? {
        state: p.state,
        due: p.due,
        interval: p.interval,
        ease: p.ease,
        lapses: p.lapses,
        reps: p.reps,
        lastReview: p.lastReview,
        stability: p.stability,
        difficulty: p.difficulty
      } as any : undefined,
      model: c.model,
      modelCss: c.modelCss,
      scripts: c.scripts || []
    } as DeckCard
  })
}

export const getCards = async (deckId: string, limit = 20, offset = 0): Promise<DeckCard[]> => {
  try {
    const { getDatabase } = await import('./database')
    const deck = await (await getDatabase()).getDeck(deckId)
    if (!deck?.collectionId) return []
    const [ankiCards, progressList] = await Promise.all([
      queryAnkiCards(deck.collectionId, deck.ankiDeckId || 1, limit, offset).catch(() => []),
      (await getDatabase()).getProgressByDeck(deckId)
    ])
    return mergeCardData(ankiCards, progressList, deckId, deck.collectionId)
  } catch { return [] }
}

export const getTodayDueCards = async (deckId: string): Promise<DeckCard[]> => {
  const { getDatabase } = await import('./database')
  const { getSettingsManager } = await import('./settings')
  const db = await getDatabase()
  const deck = await db.getDeck(deckId)
  if (!deck?.collectionId) return []
  
  const settings = await getSettingsManager().getSettings(deckId) || getSettingsManager().getDefaultSettings(deckId, deck.name)
  const now = Date.now()
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const today = new Date().getDay()
  
  const [newLimit, reviewLimit] = settings.easyDays.includes(today) 
    ? [Math.floor(settings.newCardsPerDay * 0.5), Math.floor(settings.reviewsPerDay * 0.5)]
    : [settings.newCardsPerDay, settings.reviewsPerDay]
  
  const [ankiCards, progressList] = await Promise.all([
    queryAnkiCards(deck.collectionId, deck.ankiDeckId || 1, Math.max(newLimit + reviewLimit, 50), 0),
    db.getProgressByDeck(deckId)
  ])
  
  const progressMap = new Map(progressList.map(p => [p.ankiCardId, p]))
  const [todayNewCount, todayReviewCount] = progressList.reduce(([n, r], p) => {
    if ((p.lastReview || 0) >= todayStart) {
      return p.reps === 1 ? [n + 1, r] : p.reps > 1 ? [n, r + 1] : [n, r]
    }
    return [n, r]
  }, [0, 0])
  
  const [newCards, learningCards, reviewCards] = ankiCards.reduce((acc, c) => {
    const p = progressMap.get(c.id)
    if (!p || p.state === 'new') acc[0].push(c)
    else if (p.state === 'learning' && p.due <= now) acc[1].push(c)
    else if (p.state === 'review' && p.due <= now) acc[2].push(c)
    return acc
  }, [[], [], []] as any[][])
  
  const todayCards = [
    ...learningCards,
    ...reviewCards.slice(0, Math.max(0, reviewLimit - todayReviewCount)),
    ...newCards.slice(0, Math.max(0, newLimit - todayNewCount))
  ]
  
  return mergeCardData(todayCards, progressList, deckId, deck.collectionId)
}

export const addCard = async (
  deckId: string,
  front: string,
  back: string,
  opts?: {
    tags?: string[]
    source?: 'dict' | 'manual' | 'import' | 'book'
    position?: { cfi?: string; page?: number; section?: number; rects?: any[] }
    bookUrl?: string
    bookTitle?: string
    modelCss?: string
  }
): Promise<boolean> => {
  const { getDatabase } = await import('./database')
  const db = await getDatabase()
  const deck = await db.getDeck(deckId)
  if (!deck?.collectionId) return false
  
  const result = await insertAnkiCard(deck.collectionId, deck.ankiDeckId || 1, front, back, opts?.tags, opts?.modelCss)
  if (!result) return false
  
  const now = Date.now()
  await Promise.all([
    db.saveProgress({
      id: `card-${result.cardId}`,
      deckId,
      collectionId: deck.collectionId,
      ankiNoteId: result.noteId,
      ankiCardId: result.cardId,
      source: opts?.source || 'manual',
      state: 'new',
      due: 0,
      interval: 0,
      ease: 2.5,
      lapses: 0,
      reps: 0,
      createdAt: now,
      updatedAt: now,
      bookUrl: opts?.bookUrl,
      bookTitle: opts?.bookTitle,
      position: opts?.position ? JSON.stringify(opts.position) : undefined
    }),
    db.updateDeckStats(deckId)
  ])
  
  notifyCards()
  return true
}

export const updateCard = async (
  cardId: string,
  updates: { front?: string; back?: string; tags?: string[] }
): Promise<boolean> => {
  const { getDatabase } = await import('./database')
  const db = await getDatabase()
  const progress = await db.getProgress(cardId)
  if (!progress?.collectionId || !progress.ankiCardId) return false
  
  const ankiDb = await getAnkiDb(progress.collectionId)
  if (!ankiDb) return false
  
  const noteQuery = ankiDb.exec(`SELECT flds, tags FROM notes WHERE id = ${progress.ankiNoteId}`)
  if (!noteQuery?.[0]) return false
  
  const [flds, tags] = noteQuery[0].values[0] as [string, string]
  const fields = flds.split('\x1f')
  
  if (updates.front !== undefined) fields[0] = updates.front
  if (updates.back !== undefined) fields[1] = updates.back
  if (updates.front !== undefined || updates.back !== undefined) {
    ankiDb.run(`UPDATE notes SET flds = ?, mod = ? WHERE id = ?`, [fields.join('\x1f'), Date.now(), progress.ankiNoteId])
  }
  
  if (updates.tags !== undefined) {
    ankiDb.run(`UPDATE notes SET tags = ? WHERE id = ?`, [updates.tags.join(' '), progress.ankiNoteId])
  }
  
  progress.updatedAt = Date.now()
  await Promise.all([
    saveAnkiDb(progress.collectionId, ankiDb),
    db.saveProgress(progress)
  ])
  
  const blockId = extractBlockId(tags)
  if (blockId && (updates.front !== undefined || updates.back !== undefined)) {
    try {
      await import('./siyuan-card').then(m => m.updateSiyuanCard(blockId, fields[0], fields[1]))
    } catch {}
  }
  
  notifyCards()
  return true
}

export const removeCard = async (cardId: string): Promise<boolean> => {
  const { getDatabase } = await import('./database')
  const db = await getDatabase()
  const progress = await db.getProgress(cardId)
  if (!progress) return false
  
  let blockId: string | null = null
  if (progress.collectionId && progress.ankiNoteId) {
    const ankiDb = await getAnkiDb(progress.collectionId)
    const result = ankiDb?.exec(`SELECT tags FROM notes WHERE id = ${progress.ankiNoteId}`)
    blockId = extractBlockId(result?.[0]?.values[0]?.[0] as string)
  }
  
  await Promise.all([
    progress.collectionId && progress.ankiCardId 
      ? deleteAnkiCard(progress.collectionId, progress.ankiCardId, progress.ankiNoteId)
      : Promise.resolve(),
    db.deleteProgress(cardId),
    db.updateDeckStats(progress.deckId),
    blockId ? import('./siyuan-card').then(m => m.removeSiyuanCard(blockId!)).catch(() => {}) : Promise.resolve()
  ])
  
  notifyCards()
  return true
}

export const getCardCount = async (deckId: string): Promise<number> => {
  const { getDatabase } = await import('./database')
  const deck = await (await getDatabase()).getDeck(deckId)
  return deck?.collectionId ? await getAnkiCardCount(deck.collectionId, deck.ankiDeckId || 1) : 0
}
