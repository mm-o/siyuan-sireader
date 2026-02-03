// 卡片业务逻辑层
import type { DeckCard } from './types'
import type { CardProgress } from './database'
import { queryAnkiCards, insertAnkiCard, deleteAnkiCard, getAnkiCardCount, getAnkiDb, saveAnkiDb } from './anki'

const mergeCardData = (ankiCards: any[], progressList: CardProgress[], deckId: string, collectionId: string): DeckCard[] => {
  const progressMap = new Map(progressList.map(p => [p.ankiCardId, p]))
  return ankiCards.map(c => ({
    id: `card-${c.id}`,
    type: 'qa',
    deckId,
    front: c.front,
    back: c.back,
    tags: c.tags || [],
    metadata: {
      source: progressMap.get(c.id)?.source || 'import',
      collectionId,
      createdAt: progressMap.get(c.id)?.createdAt || Date.now(),
      updatedAt: progressMap.get(c.id)?.updatedAt || Date.now()
    },
    ankiNoteId: c.nid,
    ankiCardId: c.id,
    timestamp: progressMap.get(c.id)?.createdAt || Date.now(),
    learning: progressMap.get(c.id) ? {
      state: progressMap.get(c.id)!.state,
      due: progressMap.get(c.id)!.due,
      interval: progressMap.get(c.id)!.interval,
      ease: progressMap.get(c.id)!.ease,
      lapses: progressMap.get(c.id)!.lapses,
      reps: progressMap.get(c.id)!.reps,
      lastReview: progressMap.get(c.id)!.lastReview,
      stability: progressMap.get(c.id)!.stability,
      difficulty: progressMap.get(c.id)!.difficulty
    } as any : undefined,
    model: c.model,
    modelCss: c.modelCss
  } as DeckCard))
}

export const getCards = async (deckId: string, limit = 20, offset = 0): Promise<DeckCard[]> => {
  const { getDatabase } = await import('./database')
  const deck = await (await getDatabase()).getDeck(deckId)
  if (!deck?.collectionId) return []
  
  const [ankiCards, progressList] = await Promise.all([
    queryAnkiCards(deck.collectionId, deck.ankiDeckId || 1, limit, offset),
    (await getDatabase()).getProgressByDeck(deckId)
  ])
  
  return mergeCardData(ankiCards, progressList, deckId, deck.collectionId)
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
  
  if (updates.front !== undefined || updates.back !== undefined) {
    const result = ankiDb.exec(`SELECT flds FROM notes WHERE id = ${progress.ankiNoteId}`)
    if (!result?.[0]) return false
    
    const fields = (result[0].values[0][0] as string).split('\x1f')
    if (updates.front !== undefined) fields[0] = updates.front
    if (updates.back !== undefined) fields[1] = updates.back
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
  
  return true
}

export const removeCard = async (cardId: string): Promise<boolean> => {
  const { getDatabase } = await import('./database')
  const db = await getDatabase()
  const progress = await db.getProgress(cardId)
  if (!progress) return false
  
  await Promise.all([
    progress.collectionId && progress.ankiCardId 
      ? deleteAnkiCard(progress.collectionId, progress.ankiCardId, progress.ankiNoteId)
      : Promise.resolve(),
    db.deleteProgress(cardId),
    db.updateDeckStats(progress.deckId)
  ])
  
  return true
}

export const getCardCount = async (deckId: string): Promise<number> => {
  const { getDatabase } = await import('./database')
  const deck = await (await getDatabase()).getDeck(deckId)
  return deck?.collectionId ? await getAnkiCardCount(deck.collectionId, deck.ankiDeckId || 1) : 0
}
