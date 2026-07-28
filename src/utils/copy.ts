// ===== 标注复制与同步 =====

type ExportCtx = {
  bookUrl: string
  bookInfo?: any
  settings?: any
  reader?: any
  isPdf?: boolean
  marks?: any
  i18n?: any
  showMsg: (msg: string, type?: string) => void
}

type ExportItem = {
  chapter?: string
  cfi?: string
  text?: string
  note?: string
  image?: string
  src?: string | Blob
  id?: string
  page?: number
  format?: 'pdf' | 'epub'
}

const DEFAULT_LINK_FORMAT = '> [!NOTE] 📑 {{title}}\n> [{{chapter}}]({{url}}) {{text}}\n> {{image}}\n> {{note}}'
export const inlineLinkText = (text = '') => text.replace(/\s+/g, ' ').replace(/([\p{Script=Han}\u3000-\u303f\uff00-\uffef]) ([\p{Script=Han}\u3000-\u303f\uff00-\uffef])/gu, '$1$2').trim()

const getShelfBook = async (bookUrl: string) => bookUrl ? (await import('@/core/bookshelf')).bookshelfManager.getBook(bookUrl) : null
const getGlobalSettings = async () => (window as any).__sireader_settings || await (await import('@/composables/useSetting')).settingsManager.get().catch(() => null)
const resolveSettings = async (settings?: any) => {
  const globalSettings = await getGlobalSettings()
  return settings ? { ...(globalSettings || {}), ...settings } : globalSettings
}
const asClipboardCtx = (ctx: ExportCtx | any) => ({ ...ctx, settings: { ...(ctx.settings || {}), noteInsertTarget: 'clipboard' } })
const shouldInsert = (settings: any) => settings?.noteInsertTarget && settings.noteInsertTarget !== 'clipboard'
const shouldSyncOnAdd = async () => !!(await getGlobalSettings())?.annotationSyncOnAdd
const shouldSyncOnDelete = async () => !!(await getGlobalSettings())?.annotationSyncOnDelete
const getBoundDocId = async (bookUrl: string) => {
  const book = await getShelfBook(bookUrl), id = book?.bindDocId || ''
  if (!id || await (await import('@/api')).getBlockByID(id).catch(() => null)) return id
  await (await import('@/core/bookshelf')).bookshelfManager.updateBook(bookUrl, { bindDocId: '', bindDocName: '' }).catch(() => {})
  return ''
}
const getInsertedBlockIds = (result: any) => (Array.isArray(result) ? result : [result]).flatMap((item: any) => item?.doOperations || item || []).map((item: any) => item?.id).filter(Boolean)
const recordInsertedBlocks = async (item: any, result: any, ctx: any) => {
  const blockIds = getInsertedBlockIds(result), blockId = blockIds[0] || ''
  if (blockId) {
    Object.assign(item, { blockId, blockIds })
    if (ctx.marks) await ctx.marks.updateMark(item, { blockId, blockIds })
  }
  return blockId
}
const syncingMarks = new Set<string>()
const imageSrcToMarkdown = async (src: string | Blob, name = 'mark') => {
  if (!src) return ''
  try {
    const blob = typeof src === 'string' ? await fetch(src).then(r => r.blob()) : src
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg').split('+')[0]
    const file = new File([blob], `${name}.${ext}`, { type: blob.type || 'image/png' })
    const res = await (await import('@/api')).upload('/assets/', [file])
    return res.succMap?.[file.name] ? `![](${res.succMap[file.name]})` : (typeof src === 'string' ? `![](${src})` : '')
  } catch { return typeof src === 'string' ? `![](${src})` : '' }
}

const resolveExportMeta = async (ctx: ExportCtx | any) => {
  const shelfBook = await getShelfBook(ctx.bookUrl)
  const book = shelfBook || ctx.bookInfo
  const readerBook = ctx.reader?.getBook?.()
  return {
    settings: await resolveSettings(ctx.settings),
    book,
    title: shelfBook?.title || ctx.bookInfo?.title || ctx.bookInfo?.name || readerBook?.metadata?.title || '读书',
    author: shelfBook?.author || ctx.bookInfo?.author || readerBook?.metadata?.author || '',
  }
}

const writeClipboard = async (text: string, showMsg: ExportCtx['showMsg'], message = '已复制') => {
  await navigator.clipboard.writeText(text)
  showMsg(message)
}

const writeExport = async (text: string, ctx: ExportCtx, meta: Awaited<ReturnType<typeof resolveExportMeta>>, message = '已复制') => {
  const { settings, book, title } = meta
  if (shouldInsert(settings)) {
    const docId = book?.bindDocId ? await getBoundDocId(ctx.bookUrl) : ''
    if (docId) {
      await (await import('@/utils/noteInsert')).insertToDoc(text, docId)
      return ctx.showMsg('已插入绑定文档')
    }
    await (await import('@/utils/noteInsert')).insertNote(text, settings, title, ctx.bookUrl || title)
    return ctx.showMsg('已插入笔记')
  }
  await writeClipboard(text, ctx.showMsg, message)
}
const insertGeneratedNote = async (item: any, md: string, settings: any, meta: Awaited<ReturnType<typeof resolveExportMeta>>, ctx: any) =>
  recordInsertedBlocks(item, await (await import('@/utils/noteInsert')).insertNote(md, { ...settings, noteInsertMode: 'appendDoc' }, meta.title, ctx.bookUrl || meta.title), ctx)

const buildBookMarkdown = async (item: ExportItem, ctx: ExportCtx | any, meta?: Awaited<ReturnType<typeof resolveExportMeta>>) => {
  meta ||= await resolveExportMeta(ctx)
  const fallback = item.text || item.chapter || ''
  if (!ctx.bookUrl || !item.cfi) return fallback
  const { formatBookLink } = await import('@/composables/useSetting')
  const { formatAuthor } = await import('@/core/MarkManager')
  return formatBookLink(
    ctx.bookUrl,
    meta.title,
    formatAuthor(meta.author),
    item.chapter || item.text || '读书',
    item.cfi,
    inlineLinkText(item.text || ''),
    meta.settings?.linkFormat || DEFAULT_LINK_FORMAT,
    item.note || '',
    item.image || '',
    item.id || '',
  )
}

export const exportBookLink = async (item: ExportItem, ctx: ExportCtx) => {
  const meta = await resolveExportMeta(ctx)
  await writeExport(await buildBookMarkdown(item, ctx, meta), ctx, meta, !ctx.bookUrl || !item.cfi ? '仅复制文本' : '已复制')
}

const markToExportItem = async (item: ExportItem | any, ctx: ExportCtx | any): Promise<ExportItem> => {
  item = await ctx.marks?.imageMark?.(item).catch(() => item) || item
  const isPdf = !!ctx.isPdf || item.format === 'pdf' || !!item.page
  const page = item.page || null
  const cfi = item.cfi || (isPdf && page ? `#page-${page}` : '')
  if (!cfi) return { text: item.text || item.note || '' }
  const { getChapterName } = await import('@/core/MarkManager')
  const book = isPdf ? null : ctx.reader?.getBook?.()
  const toc = isPdf ? null : book?.toc
  const tocItem = !isPdf ? await Promise.resolve(ctx.reader?.getView?.()?.getTOCItemOf?.(cfi)).catch(() => null) : null
  const chapter = item.chapter || tocItem?.label || tocItem?.title || getChapterName({ cfi, page, isPdf, toc, location: ctx.reader?.getLocation?.() }) || '📍'
  return {
    chapter,
    cfi,
    text: item.text || '',
    note: item.note || '',
    image: item.image || item.src ? await imageSrcToMarkdown(item.image || item.src || '', 'mark') : '',
    id: item.id || '',
    page,
    format: isPdf ? 'pdf' : 'epub',
  }
}

export const buildMarkMarkdown = async (item: any, ctx: ExportCtx | any) => {
  return buildBookMarkdown(await markToExportItem(item, ctx), ctx)
}

export const copyMark = async (item: any, ctx: { bookUrl: string; bookInfo?: any; settings?: any; reader?: any; isPdf?: boolean; showMsg: (msg: string, type?: string) => void }) => {
  await writeClipboard(await buildMarkMarkdown(item, asClipboardCtx(ctx)), ctx.showMsg)
}

const appendMarkToDoc = async (item: any, docId: string, ctx: any, markdown?: string) => {
  if (!docId) return ctx.showMsg?.(ctx.i18n?.noBindDoc || '未绑定文档', 'error')
  try {
    const content = markdown || await buildMarkMarkdown(item, ctx)
    if (!content) return ctx.showMsg?.('生成失败', 'error')
    const blockId = await recordInsertedBlocks(item, await (await import('@/api')).appendBlock('markdown', content, docId), ctx)
    ctx.showMsg?.(blockId ? ctx.i18n?.imported || '已导入' : ctx.i18n?.importFailed || '导入失败', blockId ? 'info' : 'error')
    return blockId
  } catch (error) {
    console.error('[AppendMarkToDoc]', error)
    ctx.showMsg?.(ctx.i18n?.importFailed || '导入失败', 'error')
    return ''
  }
}

export const importMark = async (item: any, ctx: any) => {
  const settings = await resolveSettings(ctx.settings)
  const meta = await resolveExportMeta({ ...ctx, settings })
  const docId = await getBoundDocId(ctx.bookUrl)
  const md = await buildMarkMarkdown(item, { ...ctx, settings })
  if (!md) return ctx.showMsg?.('生成失败', 'error')
  if (docId) return await appendMarkToDoc(item, docId, ctx, md)
  if (!shouldInsert(settings)) return ctx.showMsg?.(ctx.i18n?.noBindDoc || '未绑定文档', 'error')
  const blockId = await insertGeneratedNote(item, md, settings, meta, ctx)
  if (!blockId) return ctx.showMsg?.(ctx.i18n?.importFailed || '导入失败', 'error')
  ctx.showMsg?.(ctx.i18n?.imported || '已导入')
  return blockId
}

export const sendMarkToDoc = async (item: any, docId: string, ctx: any) => appendMarkToDoc(item, docId, ctx)

export const updateMarkInDoc = async (item: any, ctx: any) => {
  try {
    if (!item.blockId) return
    const md = await buildMarkMarkdown(item, ctx)
    if (!md) return
    const { updateBlock } = await import('@/api')
    try { await updateBlock('markdown', md, item.blockId) } catch {}
  } catch {}
}

export const syncMarkOnCreate = async (item: any, ctx: any) => {
  const syncKey = `${ctx.bookUrl || ''}:${item?.id || item?.cfi || item?.page || ''}`
  try {
    if (item?.blockId || item?.type === 'bookmark' || item?.readOnly || syncingMarks.has(syncKey) || (ctx.maxAgeMs && item?.timestamp && Date.now() - item.timestamp > ctx.maxAgeMs) || !await shouldSyncOnAdd()) return
    syncingMarks.add(syncKey)
    const settings = await resolveSettings(ctx.settings)
    const meta = await resolveExportMeta({ ...ctx, settings })
    const docId = await getBoundDocId(ctx.bookUrl)
    const md = await buildMarkMarkdown(item, { ...ctx, settings })
    if (!md) return
    if (docId) {
      await appendMarkToDoc(item, docId, { ...ctx, showMsg: () => {} }, md)
      return
    }
    if (shouldInsert(settings)) await insertGeneratedNote(item, md, settings, meta, ctx)
  } catch {}
  finally { syncKey && syncingMarks.delete(syncKey) }
}

export const syncMarkOnDelete = async (item: any) => {
  const blockIds = typeof item === 'string' ? [item] : Array.from(new Set([...(Array.isArray(item?.blockIds) ? item.blockIds : []), item?.blockId].filter(Boolean)))
  if (!blockIds.length || !await shouldSyncOnDelete()) return false
  const { deleteBlock } = await import('@/api')
  for (const id of blockIds) await deleteBlock(id as string).catch(() => {})
  return true
}

export const saveMarkEdit = async (mark: any, updates: any, ctx: any) => {
  if (!ctx.marks) throw new Error('标注系统未初始化')
  await ctx.marks.updateMark(mark, updates)
  updates.tags?.length && await (await import('@/composables/useSetting')).collectAnnotationTagPresets(updates.tags).catch(() => {})
  try {
    const next = { ...mark, ...updates }
    next.blockId ? await updateMarkInDoc(next, ctx) : await syncMarkOnCreate(next, ctx)
  } catch {}
}

let _plugin: any
let _floatTimer = 0

export const setPlugin = (p: any) => _plugin = p
export const openBlock = (id: string) => { hideFloat(); window.open(`siyuan://blocks/${id}`) }
export const showFloat = (id: string, el: HTMLElement) => { hideFloat(); _floatTimer = window.setTimeout(() => _plugin?.addFloatLayer?.({ refDefs: [{ refID: id }], targetElement: el, isBacklink: false }), 620) }
export const hideFloat = () => { if (_floatTimer) clearTimeout(_floatTimer); _floatTimer = 0 }

export const openNoteTargetFloat = async (bookUrl: string, settings: any, el: HTMLElement) => {
  const book = await getShelfBook(bookUrl)
  const boundId = book?.bindDocId || ''
  const target = settings?.noteInsertTarget || 'clipboard'
  const docId = boundId
    || (target === 'document' ? settings?.parentDoc?.id || '' : '')
    || (target === 'current' ? await (await import('@/utils/noteInsert')).getCurrentDocId() : '')
  if (!docId) throw new Error(target === 'clipboard' ? '请先绑定文档或将插入位置设为文档/打开文档' : '未找到目标文档')
  hideFloat()
  _plugin?.addFloatLayer?.({ refDefs: [{ refID: docId }], targetElement: el, isBacklink: false })
}
