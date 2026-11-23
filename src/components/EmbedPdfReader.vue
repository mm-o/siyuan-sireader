<template>
  <div class="embed-pdf-reader">
    <div ref="host" class="embed-pdf-reader__host" :class="{ 'hide-pdf-toolbar': toolbarHidden }"
      @pointermove.capture="rememberPointer" @pointerleave="clearHover" @pointerdown="clearHover"></div>
    <div v-if="status" class="embed-pdf-reader__status">{{ status }}</div>
    <div v-else-if="sourcePage" class="embed-pdf-reader__source-page">{{ i18n?.sourcePage || '原书页' }} {{ sourcePage }}<template v-if="sourceTotal"> / {{ sourceTotal }}</template></div>
    <input ref="pdfImport" type="file" hidden @change="importPdfData">
    <Teleport to="body">
      <div ref="noteTooltip" class="embed-pdf-reader__note" role="tooltip"></div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, createApp, onBeforeUnmount, ref, watch } from 'vue'
import { Dialog, showMessage } from 'siyuan'
import { putFile } from '@/api'
import { bookshelfManager } from '@/core/bookshelf'
import { alignLegacyPdfAnnotations, needsLegacyPdfTextAlign } from '@/core/dataMigration'
import { createLatestSaver, deleteEmbedPdfAnnotation, readEmbedPdfAnnotations, readEmbedPdfProgress, trackPending, upsertEmbedPdfAnnotation, writeEmbedPdfProgress, writeManagedFile } from '@/core/storage'
import { diagnosticLog } from '@/core/diagnostics'
import { showTooltip } from '@/core/MarkManager'
import { buildEmbedPdfTheme } from '@/utils/embedPdfTheme'
import { copyMark } from '@/utils/copy'
import { embedPdfLocale } from '@/utils/embedPdfLocale'
import { isMobile } from '@/utils/mobile'
import { capturePdfAnnotationImage, initEmbedPdfViewer, legacyPdfDraft, makePdfSelectionMark, openPdf, pdfAnnotationColor, pdfAnnotationRecord, pdfAnnotationResource, pdfAnnotationSubtype, pdfAnnotationToolOptions, pdfAnnotationTransfer, pdfMarkFromAnnotation, pdfBox, sendPdfMarkToDoc } from '@/utils/embedPdfActions'
import { settingsManager, type ReaderSettings, type ReadTheme } from '@/composables/useSetting'
import { readerIconPaths } from '@/utils/icon'
import { createReflowController, reflowLayoutFor, synchronizeReflowAnnotation } from '@/services/pdfReflow'
import { ensureRuntime, MUPDF_FILES } from '@/services/runtimeAssets'
import type { ReflowDocument } from '@/core/pdfReflow'
import { pdfQuickSendCommandId, pdfViewerCommand } from '@/utils/keyboard'
import Translate from './Translate.vue'

// 上游字体链是 --epdf-font: var(--embedpdf-host-font, 西文字体…)；CSS 变量能穿透 shadow 边界，
// 在宿主元素上换成中文字体栈，文本框里的中文才不会渲染成方框。
const PDF_FONT_STACK = 'ui-sans-serif, system-ui, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", sans-serif'
const insidePdfViewer = (node: any) => {
  let current = node
  for (let i = 0; current && i < 40; i++) {
    if (String(current.tagName || '').toLowerCase().startsWith('embedpdf')) return true
    const root = current.getRootNode?.()
    current = root instanceof ShadowRoot ? root.host : current.parentElement
  }
  return false
}
if (typeof Element !== 'undefined' && !(Element.prototype as any).__sireaderScrollHook) {
  // 上游注释面板跳转写死了 smooth；只把阅读器自己的 shadow 树改成瞬时，外层页面不受影响。
  const instant = (arg: any) => typeof arg === 'object' && arg ? { ...arg, behavior: 'instant' } : arg
  const patch = (name: 'scrollIntoView' | 'scrollTo' | 'scrollBy') => {
    const native = Element.prototype[name] as any
    Element.prototype[name] = function (this: Element, ...args: any[]) {
      return native.apply(this, insidePdfViewer(this) ? args.map(instant) : args)
    } as any
  }
  ;(Element.prototype as any).__sireaderScrollHook = true
  for (const name of ['scrollIntoView', 'scrollTo', 'scrollBy'] as const) patch(name)
}

const props = defineProps<{ source: File | string | null; settings?: ReaderSettings; theme?: string; customTheme?: ReadTheme; bookUrl?: string; storageKey?: string; i18n?: any; onAnnotationPersisted?: (event: any) => void }>()
const emit = defineEmits<{ ready: [viewer: any, context: { documentId: string; bookUrl: string; storageKey: string }]; 'read-only': [value: boolean]; detached: [] }>()
const host = ref<HTMLElement>()
const status = ref('')
// 重排态：底部显示"原始书页"，避免和重排后的窗口页码混淆
const sourcePage = ref(0)
const sourceTotal = ref(0)
const refreshSourcePage = () => {
  const current = reflowResult()
  if (!current) { sourcePage.value = 0; sourceTotal.value = 0; return }
  const stage = scoped('stage')
  const output = stage ? stage.getCurrentPageIndex() : 0
  sourcePage.value = (current.pageMap[output] ?? current.pageMap[0] ?? 0) + 1
  sourceTotal.value = current.sourcePageCount
}
const toolbarHidden = ref(false)
const readOnly = ref(false)
// 上游 afterCreate 是整份文档的设置；这里以本地状态为准，避免依赖它自己的激活链路。
const keepTool = ref(!!props.settings?.pdfAnnotationKeepTool)
const pdfImport = ref<HTMLInputElement>()
const quickDocs = computed(() => (props.settings?.quickSendDocs || []).filter(doc => doc.id).slice(0, 5))
const appState = () => ({ toolbarHidden: toolbarHidden.value, quickDocs: quickDocs.value, readOnly: readOnly.value, keepTool: keepTool.value })
const pdfFeatures = { snapshots: true, redaction: true, 'forms.building': true, measurement: true }
const noteTooltip = ref<HTMLElement>()
let pointer: PointerEvent | undefined
const rememberPointer = (event: PointerEvent) => { pointer = event.pointerType === 'mouse' ? event : undefined }
const clearHover = () => { if (noteTooltip.value) noteTooltip.value.style.display = 'none' }
const sourceKey = () => props.storageKey || props.bookUrl || ''
const zoom = () => {
  const value = props.settings?.pdfZoomLevel
  return typeof value === 'number' && value > 0 ? { level: value } : { mode: typeof value === 'string' ? value : 'fit-width' }
}
const theme = () => buildEmbedPdfTheme(props.theme, host.value, props.customTheme)

let element: any
let viewer: any
let documentId = ''
let initialDocumentId = ''
let session: AbortController | undefined
let detachDocument = () => {}
let persistence = Promise.resolve()
let zoomTimer: ReturnType<typeof setTimeout> | undefined
let switching = false
let restoring: number | null = null
let restoreCancelled = false
const restoreTimers = new Set<number>()
// 外部链接（回链/标注跳转）优先于“恢复上次位置”，调用后本次打开不再回拉。
const stopRestore = () => {
  restoreCancelled = true
  restoring = null
  for (const timer of restoreTimers) clearTimeout(timer)
  restoreTimers.clear()
}
// 按需重排：一次只排 3 页（当前页 ±1），滑到窗口边缘再续排并拼进同一个 PDF。

const scoped = (name: string) => viewer?.forDocument(documentId).tryGet(name)
const annotationId = (annotation: any) => annotation.nm || JSON.stringify(annotation.ref)
const metadata = new Map<string, any>()
let embeddedIds = new Set<string>()
const recordOf = (annotation: any) => {
  const id = annotationId(annotation)
  const record = pdfAnnotationRecord(annotation, viewer.documents.getPageIndex(annotation.ref.page, documentId), metadata.get(id))
  if (!record) return null
  const parent = annotation.reply?.to && scoped('annotation')?.get(annotation.reply.to)
  if (parent) Object.assign(record, { inReplyToId: annotationId(parent) })
  if (embeddedIds.has(id)) record.flags.push('readOnly')
  return record
}
const selected = () => scoped('annotation')?.selection.getSelected()[0]
const selectedBlockId = () => {
  const item = selected()
  return item ? metadata.get(annotationId(item))?.blockId || '' : ''
}
const noteText = (annotation: any, item: any) => {
  const thread = annotation.comments.getThread(item.ref)
  const root = thread?.root ?? item
  return [metadata.get(annotationId(root))?.note || root.contents, ...(thread?.replies.map((reply: any) => reply.contents) ?? [])]
    .filter(Boolean).join('\n\n').trim()
}
const onFailure = (error: any) => showMessage(error?.message || props.i18n?.pdfOperationFailed || 'PDF operation failed', 3000, 'error')
const flushAnnotations = () => persistence
const quickKinds = ['selection', 'annotation'] as const
const quickSlot = (kind: typeof quickKinds[number], index: number) => `sireader:send-${kind}:slot-${index}`
const executeCommand = (id: string) => {
  const kind = quickKinds.find(kind => id.startsWith(`sireader:send-${kind}:`))
  if (!kind) return viewer?.commands.execute(pdfViewerCommand(id))
  const slot = quickDocs.value.findIndex(doc => pdfQuickSendCommandId(kind, doc.id) === id)
  return viewer?.commands.execute(slot < 0 ? id : quickSlot(kind, slot))
}
let copyNextSnapshot = false
const ownsActiveDocument = (id = viewer?.documents.getActiveId()) => !!documentId && id === documentId

const downloadPdfData = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const pickPdfData = (accept: string) => {
  if (!pdfImport.value) return
  pdfImport.value.accept = accept
  pdfImport.value.click()
}

async function importPdfData(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0], isLayer = input.accept === '.epdf-layer'
  input.value = ''
  const activeViewer = viewer
  const id = activeViewer?.documents.getActiveId()
  if (!file || !id || readOnly.value) return
  try {
    if (isLayer) {
      const source = props.source
      if (!source || id !== initialDocumentId) return
      const response = typeof source === 'string' ? await fetch(source) : source
      if (response instanceof Response && !response.ok) throw new Error(`HTTP ${response.status}`)
      const baseBytes = await response.arrayBuffer()
      const bytes = await file.arrayBuffer()
      if (viewer === activeViewer && !readOnly.value) await activeViewer.documents.open({ kind: 'layerBytes', baseBytes, layer: { kind: 'artifact', bytes } }, { name: file.name.replace(/\.epdf-layer$/i, '.pdf') })
    } else {
      const transfer = await pdfAnnotationTransfer()
      const bundle = await transfer.parse(await file.text())
      if (viewer === activeViewer && !readOnly.value) {
        const { dropped } = await activeViewer.forDocument(id).get('annotation').import(bundle)
        if (dropped.length) showMessage((props.i18n?.pdfAnnotationImportSkipped || 'Skipped annotation fields or entries: {count}').replace('{count}', String(dropped.length)))
      }
    }
  } catch (error) { onFailure(error) }
}

function queueSave(work: () => Promise<void>) {
  persistence = persistence.catch(() => {}).then(work)
  void trackPending(persistence).catch(onFailure)
}

function openTranslation(text: string, onAddToAnnotation?: (translation: string) => Promise<void>) {
  if (!text.trim()) return
  let app: ReturnType<typeof createApp>
  const dialog = new Dialog({
    title: props.i18n?.translate || 'Translate',
    content: '<div class="b3-dialog__content sireader-pdf-translate" style="display:flex;flex-direction:column;max-height:min(82vh,780px);overflow:hidden"></div>',
    width: 'min(720px, 92vw)',
    destroyCallback: () => app?.unmount(),
  })
  app = createApp(Translate, { text, onAddToAnnotation, i18n: props.i18n })
  app.mount(dialog.element.querySelector('.sireader-pdf-translate')!)
}

async function selectionMark() {
  const selection = scoped('selection')
  const text = await selection?.readText()
  if (!text) return null
  const pages = selection.listSelectedPages()
  return makePdfSelectionMark(text, pages.map((page: any) => ({
    pageIndex: viewer.documents.getPageIndex(page, documentId),
    segmentRects: selection.listRects(page).map(({ x, y, width, height }: any) => ({ origin: { x, y }, size: { width, height } })),
  })))
}

async function changeMetadata(annotation: any, updates: any) {
  const record = recordOf(annotation)
  if (!record) return
  record.custom = { ...record.custom, ...updates }
  metadata.set(record.id, record.custom)
  const generated = reflowResult()
  const originalKey = sourceKey()
  const key = generated?.url || originalKey
  if (key) {
    queueSave(async () => {
      await upsertEmbedPdfAnnotation(key, { annotation: record })
      if (generated) await synchronizeReflowAnnotation(originalKey, generated, { type: 'update', annotation: record })
    })
    await persistence
  }
  window.dispatchEvent(new Event('sireader:marks-updated'))
}

// 标注上挂的链接如果指向思源块（siyuan://blocks/<id> 或裸块 id），就当成本地绑定，卡片可打开块、悬停预览。
const blockIdOf = (target: any) => /^(?:siyuan:\/\/blocks\/)?(\d{14}-[0-9a-z]{7})$/i.exec(String(target?.uri || '').trim())?.[1]
const nativeMarks = () => ownsActiveDocument() ? (scoped('annotation')?.list() || []).map(recordOf).filter(Boolean) : []
const annotationById = (id: string) => scoped('annotation')?.list().find((item: any) => annotationId(item) === id)
const annotationActions = {
  list: nativeMarks,
  get: (id: string) => {
    const item = annotationById(id)
    return item && recordOf(item)
  },
  select: (id: string) => {
    const annotation = annotationById(id)
    if (annotation) scoped('annotation').selection.select([annotation.ref])
  },
  // 回链定位：选中标注并把它的矩形滚到视口偏上位置，避免只翻到页首、内容落在下三分之一。
  focus: (id: string): boolean => {
    const annotation = annotationById(id)
    if (!annotation) return false
    scoped('annotation')?.selection.select([annotation.ref])
    const pageIndex = viewer.documents.getPageIndex(annotation.ref.page, documentId)
    const rect = annotation.rect && pdfBox(annotation.rect)
    // 书签只有 1×1 占位矩形，reveal 会顺手改缩放；那种情况只滚到页，保持当前比例。
    if (rect && rect.width > 2 && rect.height > 2) scoped('stage')?.reveal(pageIndex, { rect, align: { x: 'center', y: 0.3 } })
    else scoped('stage')?.goToPage(pageIndex, { behavior: 'instant' })
    return true
  },
  async update(id: string, updates: any) {
    if (readOnly.value) return
    const annotation = annotationById(id)
    if (!annotation) return
    const previous = metadata.get(id)
    if (updates.custom) metadata.set(id, { ...previous, ...updates.custom })
    const subtype = pdfAnnotationSubtype(updates.type)
    const color = pdfAnnotationColor(updates.color)
    const patch = Object.fromEntries(Object.entries({
      contents: updates.contents, color,
      opacity: updates.color === 'transparent' ? 0 : color && annotation.opacity === 0 ? 1 : undefined,
      subtype: subtype !== annotation.subtype ? subtype : undefined,
    }).filter(([, value]) => value !== undefined))
    if (!Object.keys(patch).length) {
      if (updates.custom) await changeMetadata(annotation, updates.custom)
      return
    }
    try { await scoped('annotation').update(annotation.ref, patch) }
    catch (error) { metadata.set(id, previous); throw error }
  },
  async delete(id: string) {
    if (readOnly.value) return
    const annotation = annotationById(id)
    if (annotation) await scoped('annotation').delete(annotation.ref)
  },
  async create(record: any) {
    if (readOnly.value) return
    if (record.custom) metadata.set(record.id, record.custom)
    await scoped('annotation').create(record.pageIndex, legacyPdfDraft(record))
  },
}

async function restoreAnnotations(annotation: any, key: string, alias: string, signal: AbortSignal) {
  if (!annotation.canRead()) return new Set<string>()
  await annotation.refresh({ signal })
  signal.throwIfAborted()
  const nativeIds = new Set(annotation.list().map(annotationId))
  if (!key) return nativeIds
  const pages = viewer.documents.listPages(documentId)
  let stored = await readEmbedPdfAnnotations(key, pages.map((page: any) => page.size.height), alias && key !== alias ? [alias] : []) || []
  if (needsLegacyPdfTextAlign(stored)) {
    try {
      const bytes = await viewer.documents.download(documentId, { signal })
      const source = await openPdf(bytes)
      try {
        const aligned = await alignLegacyPdfAnnotations(stored, source)
        for (const item of aligned) if (!stored.includes(item)) await upsertEmbedPdfAnnotation(key, item)
        stored = aligned
      } finally { await source.close() }
    } catch (error) {
      if (signal.aborted) throw error
      diagnosticLog('error', 'pdf.annotation.align.failed', { key, error })
    }
  }
  for (const item of annotation.list()) {
    const id = annotationId(item)
    if (id.startsWith('sireader-reflow:')) {
      await annotation.delete(item.ref, { signal })
      nativeIds.delete(id)
    }
  }
  const ordered = [...stored].sort((left, right) => Number(!!left.annotation.inReplyToId) - Number(!!right.annotation.inReplyToId))
  for (const item of ordered) {
    signal.throwIfAborted()
    const record = item.annotation
    metadata.set(record.id, record.custom)
    if (nativeIds.delete(record.id)) continue
    const draft = item.ctx?.native ? { ...item.ctx.native, nm: record.id, reply: undefined } : legacyPdfDraft(record)
    if (!draft || !pages[record.pageIndex]) continue
    if (record.inReplyToId) {
      const parent = annotationById(record.inReplyToId)
      if (!parent) continue
      Object.assign(draft, { reply: { type: 'reply', to: parent.ref } })
    }
    try {
      const data = await pdfAnnotationResource(item.ctx)
      const resources = data ? { [draft.subtype === 'file-attachment' ? 'file' : 'appearance']: data } : undefined
      const fields = Object.fromEntries(Object.entries(draft).filter(([, value]) => value !== undefined))
      await annotation.create(record.pageIndex, fields, resources, { signal })
    } catch (error) {
      if (signal.aborted) throw error
      diagnosticLog('error', 'pdf.annotation.restore.failed', { key, id: record.id, error })
    }
  }
  return nativeIds
}

async function attachDocument(id: string, signal: AbortSignal, targetPage?: number) {
  detachDocument()
  documentId = id
  metadata.clear()
  embeddedIds = new Set()
  const stage = scoped('stage')
  const annotation = scoped('annotation')
  const render = scoped('render')
  const generated = reflowResult()
  const bookUrl = generated?.url || props.bookUrl || ''
  const key = generated?.url || sourceKey()
  const nativeIds = await restoreAnnotations(annotation, key, bookUrl, signal)
  embeddedIds = nativeIds
  const saved = targetPage === undefined && key ? await readEmbedPdfProgress(key, key === bookUrl ? [] : [bookUrl]) : null
  signal.throwIfAborted()
  const pageIndex = targetPage ?? (saved?.pageNumber ? saved.pageNumber - 1 : 0)
  const page = viewer.documents.getPage(pageIndex, id)
  if (page && saved?.pageCoordinates) {
    stage.goToDestination({ kind: 'xyz', page: page.ref, ...saved.pageCoordinates, zoom: null }, { behavior: 'instant' })
  } else stage.goToPage(pageIndex, { behavior: 'instant' })
  // 刚打开时 stage 还没完成布局，上面的跳页可能被首次布局覆盖，恢复的书页要再补一次。
  restoring = targetPage === undefined && !restoreCancelled && pageIndex > 0 ? pageIndex : null
  const applyRestore = (final = false) => {
    if (restoring === null) return
    stage.goToPage(restoring, { behavior: 'instant' })
    if (final || stage.getCurrentPageIndex() === restoring) restoring = null
  }
  if (restoring !== null) {
    for (const delay of [150, 700]) restoreTimers.add(window.setTimeout(() => applyRestore(delay === 700), delay))
  }
  const save = createLatestSaver(async (index: number) => {
    const page = index + 1
    const count = stage.getPageCount()
    if (generated && key) {
      await writeEmbedPdfProgress(key, { pageNumber: page, totalPages: count, updatedAt: Date.now() })
      if (props.bookUrl) {
        const original = (generated.pageMap[index] ?? 0) + 1
        await bookshelfManager.updateProgress(props.bookUrl, Math.round(original / generated.sourcePageCount * 100), original, '#page-' + original, { key: sourceKey(), totalPages: generated.sourcePageCount })
      }
    } else if (bookUrl && count) {
      await bookshelfManager.updateProgress(bookUrl, Math.round(page / count * 100), page, '#page-' + page, { key, totalPages: count })
    }
  }, 500)
  // 3.x 的注解不再带选区文字（2.x 有 annotation.text）；侧栏和复制模板读 custom.text，创建时补一次刚才的选区。
  const quoteSubtypes = ['highlight', 'underline', 'squiggly', 'strikeout', 'text']
  let quoted = { text: '', at: 0 }
  const captureQuote = () => {
    void Promise.resolve(scoped('selection')?.readText?.()).then((text: any) => {
      const value = String(text || '').trim()
      if (value && value !== quoted.text) quoted = { text: value, at: Date.now() }
    }, () => { })
  }
  // 选区一变就先记下来：顶部「注释」直接画标注时不会再发 onCommitted，只有 onChanged 靠得住。
  const rememberSelection = () => setTimeout(captureQuote, 60)
  const quoteAlive = () => !!quoted.text && Date.now() - quoted.at < 60000
  const recordsByRef = new Map(annotation.list().map((item: any) => [JSON.stringify(item.ref), recordOf(item)]))
  const changed = (type: 'create' | 'update', native: any) => {
    const record = recordOf(native)
    if (record && type === 'create' && !record.custom?.text && quoteAlive() && quoteSubtypes.includes(native.subtype)) {
      metadata.set(record.id, record.custom = { ...record.custom, text: quoted.text })
      quoted = { text: '', at: 0 }
    }
    recordsByRef.set(JSON.stringify(native.ref), record)
    if (!key || !record || nativeIds.has(record.id)) return
    const event = { type, annotation: record, bookUrl, storageKey: key }
    const role = native.subtype === 'stamp' ? 'appearance' : native.subtype === 'file-attachment' ? 'file' : null
    const resource = role ? annotation.downloadResource(native.ref, role) : Promise.resolve(undefined)
    void resource.catch(onFailure)
    queueSave(async () => {
      const data = await resource
      const ctx = { native, ...(data ? { data } : {}) }
      await upsertEmbedPdfAnnotation(key, { annotation: record, ctx }, () => props.onAnnotationPersisted?.(event))
      if (generated) await synchronizeReflowAnnotation(sourceKey(), generated, event)
      window.dispatchEvent(new Event('sireader:marks-updated'))
    })
  }
  const subscriptions = [
    render.onSnapshotChanged(({ snapshot }: any) => {
      if (!snapshot || !copyNextSnapshot) return
      copyNextSnapshot = false
      void viewer.commands.execute('snapshot:copy').catch(onFailure)
    }),
    scoped('interaction').onToolChanged(({ toolId }: any) => {
      if (toolId !== 'snapshot') copyNextSnapshot = false
    }),
    annotation.onHoverChanged(({ ref }: any) => {
      clearHover()
      if (!ref || !pointer || !noteTooltip.value) return
      const item = annotation.get(ref)
      const text = item && noteText(annotation, item)
      if (!text) return
      noteTooltip.value.textContent = text
      showTooltip(noteTooltip.value, pointer.clientX + 12, pointer.clientY + 12)
    }),
    stage.onPageChanged(() => {
      if (restoring === null) save.schedule(stage.getCurrentPageIndex())
      refreshSourcePage()
      ensureReflow().extend()
    }),
    stage.onZoomChanged(({ mode, level }: any) => {
      const value = mode === 'custom' ? level : mode
      if (value !== 'automatic' && value !== 'fit-page' && value !== 'fit-width' && typeof value !== 'number') return
      clearTimeout(zoomTimer)
      zoomTimer = setTimeout(() => { if (value !== props.settings?.pdfZoomLevel) void settingsManager.patch({ pdfZoomLevel: value }) }, 400)
    }),
    annotation.onCreated(({ annotation: item }: any) => changed('create', item)),
    // 上游 afterCreate.tool='default' 没有把工具切回去，这里按同一策略补上（文本框创建后要保留输入，不切）。
    annotation.onCreated(({ annotation: item }: any) => {
      if (keepTool.value || item?.subtype === 'free-text') return
      scoped('interaction')?.activateDefaultTool?.()
    }),
    annotation.onUpdated(({ annotation: item }: any) => changed('update', item)),
    annotation.onDeleted(({ refs }: any) => {
      for (const ref of refs) {
        const refKey = JSON.stringify(ref)
        const stored: any = recordsByRef.get(refKey)
        recordsByRef.delete(refKey)
        // 绑定块等自定义字段只写在我们的元数据里，删除时取最新的一份，不能用创建时的快照。
        const record: any = stored && { ...stored, custom: metadata.get(stored.id) ?? stored.custom }
        if (!key || !record || nativeIds.has(record.id)) continue
        const event = { type: 'delete', annotation: record, bookUrl, storageKey: key }
        queueSave(async () => {
          await deleteEmbedPdfAnnotation(key, record.id, () => props.onAnnotationPersisted?.(event))
          if (generated) await synchronizeReflowAnnotation(sourceKey(), generated, event)
          window.dispatchEvent(new Event('sireader:marks-updated'))
        })
      }
    }),
    annotation.onWriteFailed(({ error }: any) => onFailure(error)),
    annotation.tools.onDefaultsChanged(({ toolId, defaults }: any) => {
      void settingsManager.patch({ pdfAnnotationToolDefaults: { ...props.settings?.pdfAnnotationToolDefaults, [toolId]: defaults } }).catch(onFailure)
    }),
    // onChanged 在拖选过程中就会触发，是顶部工具画标注时唯一能拿到原文的时机。
    scoped('selection')?.onChanged?.(rememberSelection),
    scoped('selection')?.onCommitted?.(rememberSelection),
    // 上游只放行 http/https/mailto/tel；思源块链接（siyuan://blocks/… 或裸块 id）由这里接管，打开并定位到块。
    scoped('link')?.registerUriOpener?.((uri: string) => {
      const blockId = blockIdOf(uri)
      if (blockId) { window.open(`siyuan://blocks/${blockId}`); return true }
      if (!/^(https?|mailto|tel):/i.test(uri)) return false
      window.open(uri, '_blank', 'noopener,noreferrer')
      return true
    }),
  ].filter(Boolean)
  detachDocument = () => {
    copyNextSnapshot = false
    clearHover()
    subscriptions.forEach(off => off())
    void trackPending(save.flush()).catch(onFailure)
  }
  // 手动填进「链接」的块 id 会被上游当成可点链接，抢掉“点标注打开浮条”的点击：
  // 这里把它转成绑定（写 custom.blockId），再移除这条链接子项，标注就恢复可点。
  const adoptBlockLinks = async () => {
    const link = scoped('link')
    if (!link?.listLinks) return
    const pages = new Map<number, any>()
    for (const item of annotation.list()) pages.set(item.ref.page.objectNumber, item.ref.page)
    for (const page of pages.values()) {
      await link.ensureLoaded?.(page)?.catch(() => {})
      for (const item of link.listLinks(page)) {
        const blockId = item.attached && item.ref ? blockIdOf(item.target) : ''
        if (!blockId) continue
        const parent = annotationById(String(item.id).split('#')[0])
        if (parent) {
          const custom = metadata.get(annotationId(parent)) || {}
          await changeMetadata(parent, { blockId, blockIds: [...new Set([...(custom.blockIds || []), blockId])] }).catch(() => {})
        }
        await annotation.delete(item.ref).catch(() => {})
      }
    }
    window.dispatchEvent(new Event('sireader:marks-updated'))
  }
  void adoptBlockLinks().catch(() => {})
  const offLinkLoaded = scoped('link')?.onLoaded?.(() => { void adoptBlockLinks() })
  if (offLinkLoaded) subscriptions.push(offLinkLoaded)
  emit('read-only', readOnly.value || !ownsActiveDocument())
  emit('ready', viewer, { documentId: id, bookUrl, storageKey: key })
}

// 重排流程在 services/pdfReflow 里；这里只提供上下文并转调。
let reflowController: ReturnType<typeof createReflowController> | undefined
const ensureReflow = () => reflowController ||= createReflowController({
  scoped: name => scoped(name),
  documentId: () => documentId,
  signal: () => session?.signal || null,
  setStatus: text => { status.value = text },
  label: (key, fallback) => (props.i18n as any)?.[key] || fallback,
  layout: () => reflowLayoutFor(host.value?.clientWidth || 480, host.value?.clientHeight || 720, props.settings?.textSettings?.fontSize || 18),
  canCopy: () => !!scoped('selection')?.canCopy(),
  openPdf: bytes => openPdf(bytes),
  attach: (id, signal, target) => attachDocument(id, signal, target),
  writeManaged: (blob, url, name) => writeManagedFile(blob, url, name),
  ensureEngine: () => ensureRuntime('mupdf', MUPDF_FILES),
  onFailure: error => onFailure(error),
  documents: () => viewer?.documents,
  scope: id => viewer?.forDocument(id),
  flush: () => flushAnnotations(),
})
const reflowResult = () => ensureReflow().current()
const exportReflow = async () => {
  const current = reflowResult()
  if (!current) return
  try {
    const response = await fetch(current.url)
    if (!response.ok) throw new Error(`重排文件读取失败（HTTP ${response.status}）`)
    const blob = await response.blob()
    const name = current.name || `reflow-${Date.now()}.pdf`
    const path = `/data/assets/${name}`
    await putFile(path, false, new File([blob], name, { type: 'application/pdf' }))
    const link = `![](${path.replace('/data/', '')})`
    await navigator.clipboard?.writeText(link).catch(() => {})
    showMessage(`已导出到 assets/${name}（链接已复制）`, 3000, 'info')
    diagnosticLog('info', 'pdf.reflow.export', { name, bytes: blob.size })
  } catch (error: any) {
    onFailure(error)
  }
}

function configuration() {
  const command = (id: string, label: string, icon: string, run: () => unknown, owned = true) => ({
    id: 'sireader:' + id, label, icon, run: () => Promise.resolve().then(() => {
      if (!owned || ownsActiveDocument()) return run()
    }).catch(onFailure),
    visible: ({ documentId }: any) => !owned || ownsActiveDocument(documentId),
  })
  const dict = async (mark: any) => {
    if (mark?.text) (await import('@/utils/dictionary')).openDict(mark.text, innerWidth / 2, innerHeight / 2, mark)
  }
  const annotationMark = (current = selected(), record = current && recordOf(current)) =>
    record && { ...pdfMarkFromAnnotation(record), note: noteText(scoped('annotation'), current) }
  const annotationImageMark = async () => {
    const item = selected()
    const record = item && recordOf(item)
    return record ? { ...annotationMark(item, record), image: await capturePdfAnnotationImage(scoped('render'), record, !!props.settings?.pdfMarkImageWithAnnotations) } : null
  }
  const send = async (mark: any, id: string) => {
    if (!mark) return
    await sendPdfMarkToDoc(mark, id, {
      bookUrl: reflowController?.current()?.url || props.bookUrl,
      settings: props.settings, i18n: props.i18n,
      marks: { updateMark: (item: any, updates: any) => {
        const target = annotationById(item.id)
        if (target) return changeMetadata(target, updates)
      } },
      showMsg: (text: string) => showMessage(text, 1500),
    })
  }
  const quick = (kind: typeof quickKinds[number]) => Array.from({ length: 5 }, (_, index) => ({
    ...command('send', '{target}', 'send', async () => {
      const doc = quickDocs.value[index]
      if (doc) await send(await (kind === 'selection' ? selectionMark() : annotationImageMark()), doc.id)
    }),
    id: quickSlot(kind, index),
    visible: ({ appState, documentId }: any) => ownsActiveDocument(documentId) && !!appState.quickDocs[index],
    labelParams: ({ appState }: any) => ({ target: appState.quickDocs[index]?.name || appState.quickDocs[index]?.id || '' }),
  }))
  const quickMenus = quickKinds.map(kind => ({ kind, menu: `sireader-send-${kind}`, items: quick(kind) }))
  const redactionsSelected = () => {
    const items = scoped('annotation')?.selection.getSelected()
    return !!items?.length && items.every((item: any) => item.subtype === 'redact')
  }
  const commands = [
    { ...command('pdf-reflow', props.i18n?.pdfReflow || 'Text reflow', 'text', () => ensureReflow().toggle()), active: () => !!reflowController?.isActive() },
    { ...command('export-reflow', props.i18n?.exportReflow || '导出重排 PDF', 'download', exportReflow), visible: () => !!reflowController?.isActive() },
    command('dict-selection', props.i18n?.dict || 'Dictionary', 'book', async () => dict(await selectionMark())),
    command('dict-annotation', props.i18n?.dict || 'Dictionary', 'book', () => dict(annotationMark())),
    command('translate-selection', props.i18n?.translate || 'Translate', 'languages', async () => {
      const selection = scoped('selection'), annotations = scoped('annotation'), id = documentId
      const segments = selection.listSelectedPages().map((page: any) => ({
        page,
        quadPoints: selection.listSegments(page).map((segment: any) => segment.quad),
      }))
      const mark = await selectionMark()
      if (mark?.text) openTranslation(mark.text, async translation => {
        if (readOnly.value || !ownsActiveDocument(id) || !ownsActiveDocument()) return
        for (const { page, quadPoints } of segments) {
          const nm = crypto.randomUUID()
          metadata.set(nm, { type: 'translation', text: mark.text })
          const { annotation } = await annotations.create(page, { subtype: 'highlight', nm, quadPoints, color: '#ffcd45' })
          await annotations.comments.reply(annotation.ref, translation)
        }
        selection.clear()
      })
    }),
    command('translate-annotation', props.i18n?.translate || 'Translate', 'languages', () => {
      const item = selected(), mark = annotationMark(item), id = documentId
      if (mark?.text || mark?.note) openTranslation(mark.text || mark.note, async text => {
        if (!readOnly.value && ownsActiveDocument(id) && ownsActiveDocument()) await scoped('annotation').comments.reply(item.ref, text)
      })
    }),
    { ...command('create-hole', props.i18n?.pdfCreateHole || 'Mask selection', 'redact', async () => {
      if (readOnly.value) return
      const selection = scoped('selection'), annotations = scoped('annotation')
      for (const page of selection.listSelectedPages()) {
        const quadPoints = selection.listSegments(page).map((segment: any) => segment.quad)
        await annotations.create(page, { subtype: 'highlight', quadPoints, color: '#000000', opacity: 1, blendMode: 'normal' })
      }
      selection.clear()
    }), requires: ['doc.annotate.modify'], visible: ({ documentId }: any) => !readOnly.value && ownsActiveDocument(documentId) },
    command('copy-annotation-link', props.i18n?.copyBacklink || 'Copy annotation link', 'copy', async () => {
      const mark = await annotationImageMark()
      if (mark) {
        await copyMark(mark, { bookUrl: reflowResult()?.url || props.bookUrl, isPdf: true, settings: { ...props.settings, noteInsertTarget: 'clipboard' }, showMsg: (text: string) => showMessage(text) } as any)
      }
    }),
    {
      ...command('open-block', props.i18n?.openBlock || '打开块', 'ref', () => { const id = selectedBlockId(); if (id) window.open(`siyuan://blocks/${id}`) }),
      visible: ({ documentId }: any) => ownsActiveDocument(documentId) && !!selectedBlockId(),
    },
    command('notes', props.i18n?.quickNotes || 'Notebook', 'notebook-pen', () => window.dispatchEvent(new Event('sireader:open-quick-notes'))),
    command('toc', props.i18n?.sidebarToc || 'Table of contents', 'listTree', () => window.dispatchEvent(new Event('sireader:togglePdfToc'))),
    {
      ...command('toggle-toolbar', '{action}', 'eye', () => {
        toolbarHidden.value = !toolbarHidden.value
      }),
      active: () => toolbarHidden.value,
      labelParams: () => ({ action: toolbarHidden.value ? props.i18n?.showTopToolbar || 'Show top toolbar' : props.i18n?.hideTopToolbar || 'Hide top toolbar' }),
    },
    {
      ...command('delete-redactions', props.i18n?.delete || 'Delete redactions', 'trash', () => {
        if (redactionsSelected()) return viewer.commands.execute('annotation:delete')
      }),
      enabled: () => !readOnly.value && redactionsSelected(),
    },
    { id: 'annotation:delete', shortcut: [] },
    command('capture-copy', props.i18n?.copyScreenshot || 'Copy screenshot', 'screenshot', async () => {
      const render = scoped('render')
      if (render?.getSnapshot()) return viewer.commands.execute('snapshot:copy')
      if (!render?.canSnapshot()) return
      window.dispatchEvent(new Event('sireader:close-reader-panels'))
      copyNextSnapshot = (await viewer.commands.execute('tool:snapshot')).status === 'executed'
    }),
    {
      ...command('lock-annotation-tool', props.i18n?.pdfKeepTool || 'Keep the tool active after drawing', 'lock', () => {
        keepTool.value = !keepTool.value
        scoped('annotation')?.updateSettings?.({ afterCreate: { tool: keepTool.value ? 'stay' : 'default' } })
        void settingsManager.patch({ pdfAnnotationKeepTool: keepTool.value }).catch(onFailure)
      }),
      active: ({ appState }: any) => appState.keepTool,
    },
    {
      ...command('read-only', props.i18n?.pdfReadOnly || 'Read-only mode', 'lock', () => {
        element.readOnly = readOnly.value = !readOnly.value
        emit('read-only', readOnly.value || !ownsActiveDocument())
      }, false),
      active: ({ appState }: any) => appState.readOnly,
    },
    { ...command('import-annotations', props.i18n?.pdfImportAnnotations || 'Import PDF annotations', 'fileImport', () => pickPdfData('.json'), false),
      enabled: ({ documentId }: any) => !!documentId && !readOnly.value },
    { ...command('export-annotations', props.i18n?.pdfExportAnnotations || 'Export PDF annotations', 'fileExport', async () => {
      const annotation = viewer.tryGet('annotation')
      if (!annotation) return
      const transfer = await pdfAnnotationTransfer()
      downloadPdfData(new Blob([transfer.stringify(await annotation.export())], { type: 'application/json' }), 'annotations.json')
    }, false), requires: ['doc.annotate.read', 'doc.download'] },
    { ...command('import-layer', props.i18n?.pdfImportLayer || 'Open PDF change layer', 'fileImport', () => pickPdfData('.epdf-layer')),
      enabled: () => !readOnly.value && documentId === initialDocumentId },
    { ...command('export-layer', props.i18n?.pdfExportLayer || 'Export PDF change layer', 'fileExport', async () => {
      const bytes = await viewer.documents.downloadLayer(documentId)
      downloadPdfData(new Blob([bytes]), 'changes.epdf-layer')
    }), enabled: () => documentId === initialDocumentId, requires: ['doc.download'] },
    ...(isMobile() ? [command('close', props.i18n?.close || 'Close', 'x', () => window.dispatchEvent(new Event('reader:mobile-close')), false)] : []),
    ...quickMenus.flatMap(({ kind, menu, items }) => [...items, {
      id: `sireader:send-${kind}-menu`, label: props.i18n?.sendTo || 'Send to', icon: 'send', menu,
      visible: ({ appState, documentId }: any) => ownsActiveDocument(documentId) && !!appState.quickDocs.length,
    }]),
  ]
  return {
    locale: embedPdfLocale((window as any).siyuan?.config?.lang || '', props.i18n?.name),
    theme: theme(),
    appState: appState(),
    icons: readerIconPaths,
    identity: { displayName: 'SiReader' },
    readOnly: readOnly.value,
    features: { ...pdfFeatures, 'documents.open': false },
    plugins: {
      stage: { zoom: zoom(), scrollBehavior: 'instant', scrollChaining: false },
      // 底图预算 640 太小：大尺寸扫描页放大后全靠瓦片补锐，瓦片没覆盖到的地方会一直发虚。
      render: { snapshot: { scale: 2 }, fullPage: { maxWidth: Number(props.settings?.pdfRenderMaxWidth) || 640 } },
      annotation: {
        afterCreate: { tool: keepTool.value ? 'stay' : 'default' },
        tools: pdfAnnotationToolOptions(props.settings?.pdfAnnotationToolDefaults),
      },
    },
    commands,
    layout: (layout: any) => {
      let result = layout
        .add('sireader:pdf-reflow', { to: 'main' })
        .add('sireader:export-reflow', { to: 'document' })
        .add({ custom: 'view-only' }, { to: 'main' })
        .place('pager', { float: 'bottom', hideWhenIdle: false })
        .add('sireader:toc', { to: 'pager' })
        .add('sireader:notes', { to: 'pager' })
        .add('sireader:toggle-toolbar', { to: 'pager' })
        .add('sireader:capture-copy', { to: 'document' })
        // afterCreate 是整份文档的绘制设置，注释条和形状条都放同一个开关，避免切模式才能改。
        .add('sireader:lock-annotation-tool', { to: 'annotate' })
        .add('sireader:lock-annotation-tool', { to: 'shapes' })
      for (const id of ['read-only', 'import-annotations', 'export-annotations', 'import-layer', 'export-layer']) {
        result = result.add('sireader:' + id, { to: 'document' })
      }
      if (isMobile()) result = result.add('sireader:close', { to: 'pager' })
      for (const id of ['dict-selection', 'translate-selection', 'create-hole']) result = result.add('sireader:' + id, { to: 'selection' })
      for (const id of ['open-block', 'copy-annotation-link', 'dict-annotation', 'translate-annotation']) result = result.add('sireader:' + id, { to: 'annotation' })
      return quickMenus.reduce((layout, { kind, menu, items }) => layout
        .addMenu(menu, [items.map(item => item.id)])
        .add(`sireader:send-${kind}-menu`, { to: kind }), result)
    },
  }
}

watch([host, () => props.source], async ([target, source], _, onCleanup) => {
  if (!target || !source) return
  restoreCancelled = false
  const controller = new AbortController()
  session = controller
  const { signal } = controller
  onCleanup(() => {
    controller.abort()
    detachDocument()
    detachDocument = () => {}
    clearTimeout(zoomTimer)
    for (const timer of restoreTimers) clearTimeout(timer)
    restoreTimers.clear()
    element?.remove()
    element = viewer = undefined
    documentId = ''
    initialDocumentId = ''
    reflowController?.reset()
    reflowController = undefined
  })
  status.value = ''
  try {
    const next = await initEmbedPdfViewer(target, {
      ...configuration(),
      // 标注由思阅自己持久化，引擎里的文档始终“有未保存改动”；留着上游的离开确认会让思源刷新被拦。
      warnBeforeLeaving: false,
      src: source,
      onReady: (ready: any) => {
        if (signal.aborted) return
        viewer = ready
        const onActive = viewer.documents.onActiveChanged(() => {
          emit('read-only', readOnly.value || !ownsActiveDocument())
          clearHover()
          window.dispatchEvent(new Event('sireader:marks-updated'))
        })
        const onClosed = viewer.documents.onClosed(({ documentId: id }: any) => {
          if (id !== documentId) return
          detachDocument()
          detachDocument = () => {}
          documentId = ''
          emit('detached')
        })
        signal.addEventListener('abort', () => { onActive(); onClosed() }, { once: true })
        const off = viewer.documents.onOpened(async ({ documentId: id }: any) => {
          signal.removeEventListener('abort', off)
          off()
          status.value = props.i18n?.loading || 'Loading…'
          initialDocumentId = id
          try {
            await attachDocument(id, signal)
            if (!signal.aborted) {
              status.value = ''
              if (element) element.features = pdfFeatures
            }
          } catch (error: any) {
            if (!signal.aborted) status.value = error?.message || 'PDF load failed'
          }
        })
        signal.addEventListener('abort', off, { once: true })
      },
    })
    if (signal.aborted) next.remove()
    else {
      element = next
      // 中文字体必须落在宿主上（变量会继承进 shadow），否则文本框里的中文是方框。
      next.style.setProperty('--embedpdf-host-font', PDF_FONT_STACK)
      if (documentId) element.features = pdfFeatures
      // 上游评论/笔记输入框不判断输入法组合态，回车确认候选词会被当成提交；组合期间拦在本层，不进上游。
      const guardIme = (event: KeyboardEvent) => {
        if (event.isComposing || event.keyCode === 229) event.stopPropagation()
      }
      const shadow = next.shadowRoot ?? next
      shadow.addEventListener('keydown', guardIme, true)
      // 键盘选择（shift+方向键）不触发选区事件，靠这两个原生监听兜底。
      document.addEventListener('pointerup', rememberSelection, true)
      document.addEventListener('keyup', rememberSelection, true)
      onCleanup(() => {
        document.removeEventListener('pointerup', rememberSelection, true)
        document.removeEventListener('keyup', rememberSelection, true)
        shadow.removeEventListener('keydown', guardIme, true)
      })
    }
  } catch (error: any) {
    if (!signal.aborted) status.value = error?.message || 'PDF load failed'
  }
}, { flush: 'post' })

watch(() => [props.theme, props.customTheme], () => { if (element) element.theme = theme() }, { deep: true })
watch(appState, value => { if (element) element.appState = value }, { deep: true })
onBeforeUnmount(() => session?.abort())
defineExpose({ flushAnnotations, annotationActions, executeCommand, stopRestore })
</script>

<style scoped>
.embed-pdf-reader,.embed-pdf-reader__host{position:relative;width:100%;height:100%}
.embed-pdf-reader__status{position:absolute;left:50%;top:18px;transform:translateX(-50%);z-index:30;display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;border:1px solid var(--b3-border-color);background:color-mix(in srgb,var(--b3-theme-surface) 94%,transparent);box-shadow:0 6px 18px #0000002e;color:var(--b3-theme-on-surface);font-size:13px;line-height:1.2;pointer-events:none;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.embed-pdf-reader__status::before{content:'';width:14px;height:14px;flex:0 0 14px;border-radius:50%;border:2px solid color-mix(in srgb,var(--b3-theme-primary) 30%,transparent);border-top-color:var(--b3-theme-primary);animation:sireader-spin .8s linear infinite}
@keyframes sireader-spin{to{transform:rotate(360deg)}}
.embed-pdf-reader__source-page{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:29;padding:4px 10px;border-radius:999px;border:1px solid var(--b3-border-color);background:color-mix(in srgb,var(--b3-theme-surface) 92%,transparent);color:var(--b3-theme-on-surface);font-size:12px;line-height:1.2;font-variant-numeric:tabular-nums;pointer-events:none;box-shadow:0 2px 8px #00000024}
@media (prefers-reduced-motion:reduce){.embed-pdf-reader__status::before{animation:none}}
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-main)),
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-annotate)),
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-shapes)),
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-insert)),
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-form)),
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-redact)),
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-measure)){display:none}
.embed-pdf-reader__note{display:none;position:fixed;z-index:99999;box-sizing:border-box;max-width:min(300px,calc(100vw - 20px));max-height:144px;overflow:hidden;padding:8px 12px;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);box-shadow:0 4px 16px #0002;pointer-events:none;white-space:pre-wrap;overflow-wrap:anywhere}
</style>
