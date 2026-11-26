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
}

const DEFAULT_LINK_FORMAT = '> [!NOTE] 📑 {{title}}\n> [{{chapter}}]({{url}}) {{text}}\n> {{image}}\n> {{note}}'
export const inlineLinkText = (text = '') => text.replace(/\s+/g, ' ').replace(/([\p{Script=Han}\u3000-\u303f\uff00-\uffef]) ([\p{Script=Han}\u3000-\u303f\uff00-\uffef])/gu, '$1$2').trim()

const getShelfBook = async (bookUrl: string) => bookUrl ? (await import('@/core/bookshelf')).bookshelfManager.getBook(bookUrl) : null
const resolveSettings = async (override?: any) => {
  const base = (window as any).__sireader_settings || await (await import('@/composables/useSetting')).settingsManager.get().catch(() => null)
  return override ? { ...(base || {}), ...override } : base
}
export const asClipboardCtx = (ctx: ExportCtx | any) => ({ ...ctx, settings: { ...(ctx.settings || {}), noteInsertTarget: 'clipboard' } })
const shouldInsert = (settings: any) => settings?.noteInsertTarget && settings.noteInsertTarget !== 'clipboard'
// 绑定文档探活走子块接口（文件系统，不依赖 SQL 索引），刚建好的文档不会被误判成已删除。
const getBoundDocId = async (bookUrl: string) => {
  const book = await getShelfBook(bookUrl), id = book?.bindDocId || ''
  if (!id) return ''
  if (await (await import('@/api')).getChildBlocks(id).catch(() => null) !== null) return id
  await (await import('@/core/bookshelf')).bookshelfManager.updateBook(bookUrl, { bindDocId: '', bindDocName: '' }).catch(() => {})
  return ''
}
const operationIds = (result: any) => (Array.isArray(result) ? result : [result]).flatMap((item: any) => item?.doOperations || item || []).map((item: any) => item?.id).filter(Boolean)
const recordInsertedBlocks = async (item: any, result: any, ctx: any) => {
  const blockIds = operationIds(result), blockId = blockIds[0] || ''
  if (!blockId) return ''
  Object.assign(item, { blockId, blockIds })
  if (ctx.marks) await ctx.marks.updateMark(item, { blockId, blockIds })
  return blockId
}
let insertErrorShown = false
// 自动同步没有 ctx.showMsg（PDF/EPUB 事件里都没有），用思源自带的消息条提示一次。
const toast = async (message: string) => { try { (await import('siyuan')).showMessage(message, 3000, 'error') } catch { } }
// 内核偶发返回空结果时补一次；插件生命周期结束（410）就没必要再试。
export const appendBlockWithRetry = async (text: string, docId: string) => {
  const { appendBlock } = await import('@/api')
  for (let i = 0; i < 2; i++) {
    const result = await appendBlock('markdown', text, docId).catch(() => null)
    if (Array.isArray(result) && result.some((transaction: any) => transaction?.doOperations?.length)) return result
    if ((window as any).__sireader_lastAppendError?.code === 410) return null
    if (!i) await new Promise(resolve => setTimeout(resolve, 120))
  }
  return null
}
const syncingMarks = new Set<string>()
export const imageSrcToMarkdown = async (src: string | Blob, name = 'mark') => {
  if (!src) return ''
  try {
    const blob = typeof src === 'string' ? await fetch(src).then(res => res.blob()) : src
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg').split('+')[0]
    const file = new File([blob], `${name}.${ext}`, { type: blob.type || 'image/png' })
    const res = await (await import('@/api')).upload('/assets/', [file])
    return res.succMap?.[file.name] ? `![](${res.succMap[file.name]})` : (typeof src === 'string' ? `![](${src})` : '')
  } catch { return typeof src === 'string' ? `![](${src})` : '' }
}

const resolveExportMeta = async (ctx: ExportCtx | any) => {
  const shelfBook = await getShelfBook(ctx.bookUrl), readerBook = ctx.reader?.getBook?.()
  return {
    settings: await resolveSettings(ctx.settings),
    title: shelfBook?.title || ctx.bookInfo?.title || ctx.bookInfo?.name || readerBook?.metadata?.title || '读书',
    author: shelfBook?.author || ctx.bookInfo?.author || readerBook?.metadata?.author || '',
  }
}
const writeClipboard = async (text: string, showMsg: ExportCtx['showMsg'], message = '已复制') => {
  await navigator.clipboard.writeText(text)
  showMsg(message)
}
// 引用块模板里，占位内容自带换行（多行笔记）时补齐前缀，否则会掉出块外或截断引用块。
const keepInQuote = (md: string) => /^>/.test(md) ? md.split('\n').map(line => /^>/.test(line) ? line : `> ${line}`.trim()).join('\n') : md
const buildBookMarkdown = async (item: ExportItem, ctx: ExportCtx | any, meta?: Awaited<ReturnType<typeof resolveExportMeta>>) => {
  meta ||= await resolveExportMeta(ctx)
  if (!ctx.bookUrl) return item.text || item.chapter || ''
  const { formatBookLink } = await import('@/composables/useSetting')
  const { formatAuthor } = await import('@/core/MarkManager')
  const link = formatBookLink(
    ctx.bookUrl,
    meta.title,
    formatAuthor(meta.author),
    item.chapter || item.text || '',
    item.cfi || '',
    inlineLinkText(item.text || ''),
    meta.settings?.linkFormat || DEFAULT_LINK_FORMAT,
    item.note || '',
    item.image || '',
    item.id || '',
  )
  return keepInQuote(link) || item.chapter || meta.title
}
export const exportBookLink = async (item: ExportItem, ctx: ExportCtx) => {
  const meta = await resolveExportMeta(ctx)
  const md = await buildBookMarkdown(item, ctx, meta)
  if (!shouldInsert(meta.settings)) return await writeClipboard(md, ctx.showMsg, ctx.bookUrl ? '已复制' : '仅复制文本')
  await writeNote(md, meta, ctx)
  ctx.showMsg('已插入笔记')
}

const markToExportItem = async (item: ExportItem | any, ctx: ExportCtx | any): Promise<ExportItem> => {
  item = await ctx.marks?.imageMark?.(item).catch(() => item) || item
  const isPdf = !!ctx.isPdf || item.format === 'pdf' || !!item.page
  const page = item.page || null
  const cfi = item.cfi || (isPdf && page ? `#page-${page}` : '')
  if (!cfi) return { text: item.text || item.note || '' }
  const { getChapterName } = await import('@/core/MarkManager')
  const toc = isPdf ? null : ctx.reader?.getBook?.()?.toc
  const tocItem = isPdf ? null : await Promise.resolve(ctx.reader?.getView?.()?.getTOCItemOf?.(cfi)).catch(() => null)
  const chapter = item.chapter || tocItem?.label || tocItem?.title || getChapterName({ cfi, page, isPdf, toc, location: ctx.reader?.getLocation?.() }) || '📍'
  return {
    chapter,
    cfi,
    // 模板的「文本」位只放选区原文：截图/形状类批注的正文是用户注释，不能顶掉它。
    text: item.quote ?? item.text ?? '',
    note: item.note || '',
    image: item.image || item.src ? await imageSrcToMarkdown(item.image || item.src || '', 'mark') : '',
    id: item.id || '',
    page,
  }
}
export const buildMarkMarkdown = async (item: any, ctx: ExportCtx | any) => buildBookMarkdown(await markToExportItem(item, ctx), ctx)

export const copyMark = async (item: any, ctx: { bookUrl: string; bookInfo?: any; settings?: any; reader?: any; isPdf?: boolean; showMsg: (msg: string, type?: string) => void }) => {
  await writeClipboard(await buildMarkMarkdown(item, asClipboardCtx(ctx)), ctx.showMsg)
}

// 把标注落到指定文档末尾，返回新建块 id（失败为空）。
const appendMarkToDoc = async (item: any, docId: string, ctx: any, markdown?: string) => {
  const content = markdown || await buildMarkMarkdown(item, ctx).catch(() => '')
  if (!docId || !content) return ''
  return await recordInsertedBlocks(item, await (await import('@/api')).appendBlock('markdown', content, docId).catch(() => null), ctx)
}
export const sendMarkToDoc = async (item: any, docId: string, ctx: any) => {
  const blockId = await appendMarkToDoc(item, docId, ctx)
  ctx.showMsg?.(blockId ? ctx.i18n?.imported || '已导入' : ctx.i18n?.importFailed || '导入失败', blockId ? 'info' : 'error')
  return blockId
}

// ===== 唯一的写入入口 =====
// 「插入位置」说了算：剪贴板复制、打开文档插光标、日记写日记；只有落到「一个文档」的目标（笔记本下 / 文档下）
// 才复用绑定文档，没有就新建并绑定。返回 null = 没写成，'' = 写成但没块 id，其余是块 id。
type WriteMeta = { settings: any; title: string }
const writeNote = async (md: string, meta: WriteMeta, ctx: any = {}, { item, silent }: { item?: any; silent?: boolean } = {}): Promise<string | null> => {
  const target = meta.settings?.noteInsertTarget || 'clipboard'
  const writeToBound = async () => {
    const boundId = await getBoundDocId(ctx.bookUrl)
    if (!boundId) return null
    if (!item) return await (await import('@/utils/noteInsert')).insertToDoc(md, boundId), ''
    return await appendMarkToDoc(item, boundId, ctx, md) || null
  }
  if (target === 'notebook' || target === 'document') {
    const bound = await writeToBound()
    if (bound !== null) return bound
  }
  let result: any
  try {
    result = await (await import('@/utils/noteInsert')).insertNote(md, meta.settings, meta.title, ctx.bookUrl || meta.title, ctx.i18n)
  } catch (error: any) {
    const message = error?.message || '插入失败'
    // 没有可插入的编辑器/光标时退回绑定文档，笔记不丢；再不行只提示一次。
    const fallback = await writeToBound()
    if (fallback !== null) return void toast(`已写入绑定文档（${message}）`), fallback
    if (silent) {
      if (!insertErrorShown) void toast(message)
      insertErrorShown = true
    } else ctx.showMsg?.(message, 'error')
    return null
  }
  if (!item) return ''
  const blockId = await recordInsertedBlocks(item, result, ctx)
  // 光标位置这类插入拿不到块 id：记下已插入，之后改标注不再重复插入。
  if (!blockId && ctx.marks) await Promise.resolve(ctx.marks.updateMark(item, { insertedAt: Date.now() })).catch(() => null)
  return blockId
}
const renderMark = async (item: any, ctx: any) => {
  const settings = await resolveSettings(ctx.settings)
  return { md: await buildMarkMarkdown(item, { ...ctx, settings }), meta: await resolveExportMeta({ ...ctx, settings }) }
}
export const importMark = async (item: any, ctx: any) => {
  const { md, meta } = await renderMark(item, ctx)
  if (!md) return ctx.showMsg?.('生成失败', 'error')
  const blockId = await writeNote(md, meta, ctx, { item })
  ctx.showMsg?.(blockId === null ? ctx.i18n?.importFailed || '导入失败' : ctx.i18n?.imported || '已导入', blockId === null ? 'error' : 'info')
  return blockId || ''
}

// 块源码和模板 md 比对：忽略块属性行和末尾的空引用行。
const blockText = (value: any) => {
  const lines = String(value?.kramdown || value?.data?.kramdown || '').split('\n').filter(line => !/^\s*>?\s*\{:[^}]*\}\s*$/.test(line))
  while (lines.length && !lines[lines.length - 1].replace(/^>\s*/, '').trim()) lines.pop()
  return lines.join('\n').trim()
}
// ===== 标注 ↔ 块 =====
// 一条标注只对应一个块：有块就整块重写（结构必然和首次插入一致），没块才按设置写入一次。
const rewriteMark = async (item: any, blockId: string, ctx: any) => {
  if (ctx?.statusOnly) return blockId
  const md = await buildMarkMarkdown(item, ctx).catch(() => '')
  if (!md) return blockId
  const { updateBlock, getBlockKramdown } = await import('@/api')
  if (blockText(await getBlockKramdown(blockId).catch(() => null)) !== md.trim()) await updateBlock('markdown', md, blockId).catch(() => null)
  return blockId
}
export const syncMark = async (item: any, ctx: any = {}) => {
  const blockId = item?.blockId || item?.blockIds?.[0] || ''
  if (blockId) return await rewriteMark(item, blockId, ctx)
  // 已插入过（光标位置拿不到块 id）/ 书签 / 只读 / 重入 / 过期事件 / 开关关闭：都不再插入。
  const key = `${ctx.bookUrl || ''}:${item?.id || ''}`
  if (item?.insertedAt || item?.type === 'bookmark' || item?.readOnly || syncingMarks.has(key) || (ctx.maxAgeMs && item?.timestamp && Date.now() - item.timestamp > ctx.maxAgeMs) || !(await resolveSettings())?.annotationSyncOnAdd) return ''
  syncingMarks.add(key)
  try {
    const { md, meta } = await renderMark(item, ctx)
    return (md ? await writeNote(md, meta, ctx, { item, silent: true }) : null) || ''
  } catch {
    return ''
  } finally { syncingMarks.delete(key) }
}
export const syncMarkOnDelete = async (item: any) => {
  const ids = Array.from(new Set((typeof item === 'string' ? [item] : [...(item?.blockIds || []), item?.blockId]).filter(Boolean))) as string[]
  if (!ids.length || !(await resolveSettings())?.annotationSyncOnDelete) return false
  const { deleteBlock } = await import('@/api')
  // 块已被手动删掉时内核会返回错误，直接跳过。
  for (const id of ids) if (await deleteBlock(id).catch(() => null)) return true
  return false
}
export const saveMarkEdit = async (mark: any, updates: any, ctx: any) => {
  if (!ctx.marks) throw new Error('标注系统未初始化')
  await ctx.marks.updateMark(mark, updates)
  updates.tags?.length && await (await import('@/composables/useSetting')).collectAnnotationTagPresets(updates.tags).catch(() => {})
  try {
    // 只改状态位（完成/未完成）且正文没变时不碰块内容。
    const statusOnly = 'completed' in updates && !String(updates.text ?? mark?.text ?? '').trim()
    await syncMark({ ...mark, ...updates }, { ...ctx, statusOnly })
  } catch { }
}

let _plugin: any
let _floatTimer = 0

export const setPlugin = (p: any) => _plugin = p
export const openBlock = (id: string) => { hideFloat(); window.open(`siyuan://blocks/${id}`) }
export const showFloat = (id: string, el: HTMLElement) => { hideFloat(); _floatTimer = window.setTimeout(() => _plugin?.addFloatLayer?.({ refDefs: [{ refID: id }], targetElement: el, isBacklink: false }), 620) }
export const hideFloat = () => { if (_floatTimer) clearTimeout(_floatTimer); _floatTimer = 0 }

// 这本书该落到哪个文档：绑定文档优先，其次「打开文档 / 文档下」。
export const openNoteTargetFloat = async (bookUrl: string, settings: any, el: HTMLElement) => {
  const docId = await getBoundDocId(bookUrl)
    || (settings?.noteInsertTarget === 'document' ? settings?.parentDoc?.id || '' : '')
    || (settings?.noteInsertTarget === 'current' ? await (await import('@/utils/noteInsert')).getCurrentDocId() : '')
  if (!docId) throw new Error((settings?.noteInsertTarget || 'clipboard') === 'clipboard' ? '请先绑定文档或将插入位置设为文档/打开文档' : '未找到目标文档')
  hideFloat()
  _plugin?.addFloatLayer?.({ refDefs: [{ refID: docId }], targetElement: el, isBacklink: false })
}
