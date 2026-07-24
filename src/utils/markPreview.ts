import { createTooltip, hideTooltip, showTooltip } from '@/core/MarkManager'

import { sameBookUrl } from '@/core/bookshelf'
import { extractText } from '@/services/TTSExtractor'
import { createEmbedPdfDocumentSource, ensureEmbedPdfWasmUrl, initEmbedPdfViewer } from '@/utils/embedPdfActions'
import { pdfPageFromCfi } from '@/utils/jump'

type PreviewContext = {
  isPdf?: boolean
  reader?: any
  view?: any
  bookUrl?: string
  book?: any
}

const CONTEXT_SIZE = 520
const HOVER_DELAY = 180

let tooltip: HTMLElement | null = null
let showTimer: number | undefined
let hideTimer: number | undefined
let activeKey = ''
const bookSourceCache = new Map<string, Promise<File | Blob | string>>()
const offlineViewCache = new Map<string, Promise<any>>()
const textCache = new Map<string, Promise<string>>()
const pdfTextCache = new Map<string, Promise<string>>()
let offlinePdfKey = ''
let offlinePdfSession: Promise<any> | null = null

const esc = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const normalize = (value = '') => value.replace(/\s+/g, ' ').trim()
const compact = (value = '') => normalize(value).slice(0, 12000)
const sourcePathOf = (book: any, bookUrl = '') => book?.url?.startsWith?.('asset://')
  ? book.url.replace('asset://', '')
  : book?.path || bookUrl.replace(/^asset:\/\//, '') || book?.url || ''
const keyOf = (mark: any, ctx: PreviewContext) => [
  ctx.bookUrl || mark?.book || '',
  ctx.isPdf ? 'pdf' : 'epub',
  ctx.reader || ctx.view ? 'live' : 'stored',
  mark?.id || mark?.cfi || mark?.page || mark?.timestamp || '',
].join(':')

const getBookSource = async (ctx: PreviewContext) => {
  const bookUrl = ctx.bookUrl || ctx.book?.url || ''
  if (!bookUrl) throw new Error('Missing book url')
  if (!bookSourceCache.has(bookUrl)) {
    bookSourceCache.set(bookUrl, (async () => {
      const { bookshelfManager } = await import('@/core/bookshelf')
      const book = ctx.book || await bookshelfManager.getBook(bookUrl)
      return bookshelfManager.loadFile(sourcePathOf(book, bookUrl))
    })())
  }
  return bookSourceCache.get(bookUrl)!
}

const getOfflineView = async (ctx: PreviewContext) => {
  const bookUrl = ctx.bookUrl || ctx.book?.url || ''
  if (!bookUrl) return null
  if (!offlineViewCache.has(bookUrl)) {
    offlineViewCache.set(bookUrl, (async () => {
      await import('foliate-js/view.js')
      const [file, { createTxtBook }] = await Promise.all([getBookSource(ctx), import('@/core/txt/book')])
      const host = document.createElement('div')
      host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;visibility:hidden;pointer-events:none'
      const view = document.createElement('foliate-view') as any
      host.appendChild(view)
      document.body.appendChild(host)
      await view.open((ctx.book?.format || '').toLowerCase() === 'txt' ? await createTxtBook(file) : file)
      return view
    })())
  }
  return offlineViewCache.get(bookUrl)!
}

const waitPdfDocument = (registry: any, documentId: string) => new Promise<any>((resolve, reject) => {
  const documents = registry.getPlugin('document-manager')?.provides?.()
  const done = () => {
    const doc = documents?.getDocument?.(documentId)
    if (doc) {
      offOpen?.()
      offError?.()
      clearTimeout(timer)
      resolve(doc)
      return true
    }
    return false
  }
  let offOpen: any
  let offError: any
  const timer = setTimeout(() => {
    offOpen?.()
    offError?.()
    reject(new Error('PDF preview load timeout'))
  }, 10000)
  if (done()) return
  offOpen = documents?.onDocumentOpened?.((state: any) => (state.id === documentId || state.documentId === documentId) && done())
  offError = documents?.onDocumentError?.((event: any) => {
    if (event.documentId !== documentId) return
    offOpen?.()
    offError?.()
    clearTimeout(timer)
    reject(new Error(event.message || 'PDF preview load failed'))
  })
})

const disposeOfflinePdfSession = () => {
  offlinePdfSession?.then(({ host }) => host?.remove?.()).catch(() => {})
}

const getOfflinePdfSession = async (ctx: PreviewContext) => {
  const bookUrl = ctx.bookUrl || ctx.book?.url || ''
  if (offlinePdfSession && offlinePdfKey === bookUrl) return offlinePdfSession
  disposeOfflinePdfSession()
  offlinePdfKey = bookUrl
  offlinePdfSession = (async () => {
    const wasmUrl = await ensureEmbedPdfWasmUrl()
    const source = await getBookSource(ctx)
    const documentId = 'sireader-preview-document'
    const documentSource = await createEmbedPdfDocumentSource(documentId, source, `${bookUrl || 'document'}.pdf`)
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;visibility:hidden;pointer-events:none'
    document.body.appendChild(host)
    return new Promise((resolve, reject) => {
      void (async () => {
        const viewer = await initEmbedPdfViewer(host, {
          tabBar: 'never',
          worker: true,
          wasmUrl,
          documentManager: { initialDocuments: [documentSource] },
          fonts: { ui: null, signature: null },
          stamp: { manifests: [] },
        })
        if (!viewer) throw new Error('PDF preview load failed')
        viewer.registry?.then((registry: any) => waitPdfDocument(registry, documentId)
          .then((doc: any) => resolve({ registry, documentId, doc, host }))
          .catch(reject),
        )
      })().catch(reject)
    })
  })()
  return offlinePdfSession
}

const getPdfPageText = (mark: any, ctx: PreviewContext) => {
  const page = Number(mark?.page) || 1
  const live = ctx.view?.getPageText?.(page)
  if (live) return live
  const bookUrl = ctx.bookUrl || ctx.book?.url || ''
  if (!bookUrl) return Promise.resolve('')
  const key = `${bookUrl}:${page}`
  if (!pdfTextCache.has(key)) {
    const promise = (async () => {
      const { registry, doc } = await getOfflinePdfSession(ctx)
      return await registry.getEngine().extractText(doc, [page - 1]).toPromise()
    })().catch(error => {
      pdfTextCache.delete(key)
      throw error
    })
    pdfTextCache.set(key, promise)
  }
  return pdfTextCache.get(key)!
}

const getTooltip = () => {
  if (tooltip?.isConnected) return tooltip
  tooltip = document.createElement('div')
  tooltip.setAttribute('data-mark-preview', 'true')
  tooltip.style.cssText = [
    'position:fixed',
    'display:none',
    'width:min(420px,calc(100vw - 20px))',
    'background:var(--b3-theme-surface)',
    'border:1px solid var(--b3-border-color)',
    'border-radius:10px',
    'box-shadow:0 10px 28px rgba(0,0,0,.14),0 3px 10px rgba(0,0,0,.08)',
    'z-index:99999',
    'pointer-events:auto',
    'overflow:hidden',
    'transition:transform .16s ease,opacity .16s ease',
  ].join(';')
  tooltip.onmouseenter = () => clearTimeout(hideTimer)
  tooltip.onmouseleave = () => scheduleHide()
  document.body.appendChild(tooltip)
  return tooltip
}

const prevStop = (text: string, from: number) => {
  const cn = text.lastIndexOf('。', from)
  const en = text.lastIndexOf('.', from)
  return Math.max(cn, en)
}

const firstAfter = (text: string, from: number) => {
  const cn = text.indexOf('。', from)
  const en = text.indexOf('.', from)
  return cn < 0 ? en : en < 0 ? cn : Math.min(cn, en)
}

export const getPreviewAround = (text: string, needle = '') => {
  const source = compact(text)
  const target = normalize(needle)
  if (!source) return { before: '', hit: target, after: '' }
  if (!target) return { before: source.slice(0, CONTEXT_SIZE), hit: '', after: source.slice(CONTEXT_SIZE, CONTEXT_SIZE * 2) }

  const lowerSource = source.toLowerCase()
  const lowerTarget = target.toLowerCase()
  const short = lowerTarget.slice(0, Math.min(32, lowerTarget.length))
  const index = lowerSource.indexOf(lowerTarget)
  const start = index >= 0 ? index : short ? lowerSource.indexOf(short) : -1
  if (start < 0) return { before: source.slice(0, CONTEXT_SIZE), hit: target, after: source.slice(CONTEXT_SIZE, CONTEXT_SIZE * 2) }

  const end = start + target.length
  const last = prevStop(source, start - 1)
  const left = last < 0 ? -1 : prevStop(source, last - 1)
  const right = firstAfter(source, end)
  const from = Math.max(0, left + 1, start - CONTEXT_SIZE)
  const to = Math.min(source.length, Math.max(right < 0 ? end : right + 1, end + CONTEXT_SIZE))
  return {
    before: source.slice(from, start).trim(),
    hit: source.slice(start, end) || target,
    after: source.slice(end, to).trim(),
  }
}
const renderContext = (mark: any, text: string, title: string) => {
  const { before, hit, after } = getPreviewAround(text, mark?.text || mark?.title || '')
  const note = mark?.note ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--b3-border-color);color:var(--b3-theme-on-surface);line-height:1.6">${esc(mark.note)}</div>` : ''
  const meta = [mark?.bookTitle, mark?.chapter, mark?.page ? `Page ${mark.page}` : ''].filter(Boolean).join(' - ')
  const body = `
    <div class="protyle-wysiwyg" style="padding:12px 14px;max-height:320px;overflow:auto;font-size:13px;line-height:1.75;color:var(--b3-theme-on-surface);user-select:text;word-break:break-word">
      ${meta ? `<div style="margin-bottom:6px;color:var(--b3-theme-on-surface-variant);font-size:12px">${esc(meta)}</div>` : ''}
      <div>
        <span style="color:var(--b3-theme-on-surface-variant)">${esc(before)}${before ? ' ' : ''}</span>
        ${hit ? `<mark style="padding:1px 3px;border-radius:3px;background:${esc(mark?.color || '') === 'yellow' ? '#ffeb3b66' : 'var(--b3-theme-primary-lightest)'};color:var(--b3-theme-on-surface)">${esc(hit)}</mark>` : ''}
        <span style="color:var(--b3-theme-on-surface-variant)">${after ? ' ' : ''}${esc(after)}</span>
      </div>
      ${note}
    </div>`
  return createTooltip({ icon: '#iconMark', iconColor: 'var(--b3-theme-primary)', title, content: body })
}

export const pdfPreviewText = async (mark: any, ctx: PreviewContext) =>
  await getPdfPageText(mark, ctx).catch(() => '') || mark?.text || mark?.note || ''

const getPdfContext = async (mark: any, ctx: PreviewContext) => renderContext(mark, await pdfPreviewText(mark, ctx), 'Mark Context')

const getEpubContext = async (mark: any, ctx: PreviewContext) => {
  const view = ctx.reader?.getView?.() || ctx.view || await getOfflineView(ctx)
  const book = ctx.reader?.getBook?.() || view?.book
  if (!book || !mark?.cfi) return renderContext(mark, mark?.text || mark?.note || '', 'Mark Context')
  const resolved = view?.resolveCFI?.(mark.cfi)
  const index = Number(resolved?.index)
  const section = Number.isInteger(index) ? book.sections?.[index] : null
  if (!section) return renderContext(mark, mark?.text || mark?.note || '', 'Mark Context')
  const doc = await section.createDocument?.()
  if (!doc) return renderContext(mark, mark?.text || mark?.note || '', 'Mark Context')
  const anchor = resolved.anchor?.(doc)
  const body = doc.body || doc.documentElement
  const range = doc.createRange()
  if (anchor instanceof Range) {
    range.setStart(body, 0)
    range.setEndAfter(body.lastChild || body)
  } else if (anchor instanceof Element) {
    range.setStartBefore(body.firstChild || body)
    range.setEndAfter(body.lastChild || body)
  } else {
    return renderContext(mark, compact(body.textContent || ''), 'Mark Context')
  }
  return renderContext(mark, compact(extractText(range)), 'Mark Context')
}

const buildPreview = (mark: any, ctx: PreviewContext) => {
  if (ctx.isPdf) return getPdfContext(mark, ctx)
  const key = keyOf(mark, ctx)
  if (!textCache.has(key)) {
    textCache.set(key, getEpubContext(mark, ctx))
  }
  return textCache.get(key)!
}

const getActiveContext = (bookUrl: string): PreviewContext => {
  const view = (window as any).__sireader_active_view
  const reader = (window as any).__sireader_active_reader
  const currentBook = (window as any).__currentBookUrl
  if (!view || !sameBookUrl(currentBook, bookUrl)) return { bookUrl }
  return { bookUrl: currentBook || bookUrl, isPdf: !!view?.isPdf, reader, view }
}

const fromAnnotation = (annotation: any, book?: any) => {
  const data = annotation?.data || {}
  return {
    id: annotation.id,
    book: annotation.book,
    bookTitle: book?.title || '',
    type: annotation.type,
    format: data.format || book?.format || annotation.format,
    cfi: data.cfi || annotation.loc,
    section: data.section,
    page: data.page,
    rects: data.rects,
    text: annotation.text,
    color: annotation.color,
    style: data.style,
    note: annotation.note,
    tags: annotation.tags || [],
    timestamp: annotation.created,
    blockId: annotation.block,
    chapter: annotation.chapter,
    title: data.title,
    image: data.image,
    progress: data.progress,
    textOffset: data.textOffset,
    paths: data.paths,
  }
}

export const embedPdfTransferMark = (items: any[] = [], parsed: { cfi: string; id?: string }, book?: any) => {
  const annotations = items.map(item => item?.annotation || item).filter(Boolean)
  const pageFromCfi = pdfPageFromCfi(parsed.cfi)
  const annotation = annotations.find((item: any) => parsed.id && item.id === parsed.id) || annotations.find((item: any) => Number(item.pageIndex || 0) + 1 === pageFromCfi)
  if (!annotation) return null
  const replies = annotations.filter((item: any) => item.inReplyToId === annotation.id && item.contents)
  const page = Number(annotation.pageIndex || 0) + 1
  return {
    id: annotation.id,
    bookTitle: book?.title || '',
    format: 'pdf',
    cfi: `#page-${page}`,
    page,
    text: annotation.custom?.text || '',
    note: [annotation.custom?.note || annotation.contents, ...replies.map((item: any) => item.contents)].filter(Boolean).join('\n\n'),
    color: annotation.strokeColor || annotation.color || annotation.fontColor || annotation.backgroundColor || '',
    timestamp: new Date(annotation.created || annotation.modified || Date.now()).getTime(),
    chapter: annotation.custom?.chapter || `Page ${page}`,
  }
}

const findLiveMark = (parsed: { bookUrl: string; cfi: string; id?: string }) => {
  const ctx = getActiveContext(parsed.bookUrl)
  const marks = ctx.view?.marks || ctx.reader?.marks
  if (!marks) return { mark: null, ctx }
  const items = marks.getAll?.() || marks.getAnnotations?.() || []
  const page = pdfPageFromCfi(parsed.cfi)
  const mark = items.find((item: any) => parsed.id && item.id === parsed.id) || items.find((item: any) => item.cfi === parsed.cfi || item.page === page)
  return { mark, ctx }
}

export const showLinkedMarkPreview = (parsed: { bookUrl: string; cfi: string; id?: string }, anchor: HTMLElement) => {
  const live = findLiveMark(parsed)
  if (live.mark) return showMarkPreview(live.mark, anchor, live.ctx)
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  activeKey = `link:${parsed.bookUrl}:${parsed.id || parsed.cfi}`
  showTimer = window.setTimeout(async () => {
    const tip = getTooltip()
    const rect = anchor.getBoundingClientRect()
    tip.innerHTML = createTooltip({
      icon: '#iconMark',
      iconColor: 'var(--b3-theme-primary)',
      title: 'Mark Context',
      content: '<div style="padding:14px;color:var(--b3-theme-on-surface-variant);font-size:13px">Loading...</div>',
    })
    showTooltip(tip, rect.right + 8, rect.top)
    try {
      const { bookshelfManager } = await import('@/core/bookshelf')
      const book = await bookshelfManager.getBook(parsed.bookUrl).catch(() => null)
      const bookUrl = book?.url || parsed.bookUrl
      let mark: any = null
      if (pdfPageFromCfi(parsed.cfi)) {
        const stored = await (await import('@/core/bookStore')).readEmbedPdfAnnotations(book?.dataId || bookUrl).catch(() => []) || []
        mark = embedPdfTransferMark(stored, parsed, book)
      } else {
        const annotations = await (await (await import('@/core/database')).getDatabase()).getAnnotations(bookUrl)
        const annotation = annotations.find((item: any) => parsed.id ? item.id === parsed.id : item.loc === parsed.cfi || item.data?.cfi === parsed.cfi)
        mark = annotation && fromAnnotation(annotation, book)
      }
      if (!mark || activeKey !== `link:${parsed.bookUrl}:${parsed.id || parsed.cfi}`) return scheduleHide()
      const activeCtx = getActiveContext(bookUrl)
      const ctx = { ...activeCtx, bookUrl, book, isPdf: activeCtx.isPdf || mark.format === 'pdf' || !!mark.page }
      tip.innerHTML = await buildPreview(mark, ctx)
      showTooltip(tip, rect.right + 8, rect.top)
    } catch {
      if (activeKey.startsWith('link:')) tip.innerHTML = createTooltip({
        icon: '#iconMark',
        iconColor: 'var(--b3-theme-primary)',
        title: 'Mark Context',
        content: '<div style="padding:14px;color:var(--b3-theme-on-surface-variant);font-size:13px">No preview available.</div>',
      })
    }
  }, HOVER_DELAY)
}

export const showMarkPreview = (mark: any, anchor: HTMLElement, ctx: PreviewContext) => {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  const key = keyOf(mark, ctx)
  activeKey = key
  showTimer = window.setTimeout(async () => {
    const tip = getTooltip()
    tip.innerHTML = createTooltip({
      icon: '#iconMark',
      iconColor: 'var(--b3-theme-primary)',
      title: 'Mark Context',
      content: '<div style="padding:14px;color:var(--b3-theme-on-surface-variant);font-size:13px">Loading...</div>',
    })
    const rect = anchor.getBoundingClientRect()
    showTooltip(tip, rect.right + 8, rect.top)
    try {
      const html = await buildPreview(mark, ctx)
      if (activeKey !== key || !tip.isConnected) return
      tip.innerHTML = html
      showTooltip(tip, rect.right + 8, rect.top)
    } catch {
      if (activeKey === key) tip.innerHTML = createTooltip({
        icon: '#iconMark',
        iconColor: 'var(--b3-theme-primary)',
        title: 'Mark Context',
        content: '<div style="padding:14px;color:var(--b3-theme-on-surface-variant);font-size:13px">No preview available.</div>',
      })
    }
  }, HOVER_DELAY)
}

export const scheduleHide = () => {
  clearTimeout(showTimer)
  hideTimer = window.setTimeout(() => tooltip && hideTooltip(tooltip, 120), 120)
}

