<template>
  <div class="embed-pdf-reader">
    <div ref="host" class="embed-pdf-reader__host" :class="{ 'hide-pdf-toolbar': toolbarHidden }"
      @pointermove.capture="rememberPointer" @pointerleave="clearHover" @pointerdown="clearHover"></div>
    <div v-if="status" class="embed-pdf-reader__status">{{ status }}</div>
    <input ref="pdfImport" type="file" hidden @change="importPdfData">
    <Teleport to="body">
      <div ref="noteTooltip" class="embed-pdf-reader__note" role="tooltip"></div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, createApp, onBeforeUnmount, ref, watch } from 'vue'
import { Dialog, showMessage } from 'siyuan'
import { bookshelfManager } from '@/core/bookshelf'
import { alignLegacyPdfAnnotations, needsLegacyPdfTextAlign } from '@/core/dataMigration'
import { createLatestSaver, deleteEmbedPdfAnnotation, readEmbedPdfAnnotations, readEmbedPdfProgress, trackPending, upsertEmbedPdfAnnotation, writeEmbedPdfProgress, writeManagedFile } from '@/core/storage'
import { diagnosticLog } from '@/core/diagnostics'
import { showTooltip } from '@/core/MarkManager'
import { buildEmbedPdfTheme } from '@/utils/embedPdfTheme'
import { copyMark } from '@/utils/copy'
import { embedPdfLocale } from '@/utils/embedPdfLocale'
import { isMobile } from '@/utils/mobile'
import { capturePdfAnnotationImage, initEmbedPdfViewer, legacyPdfDraft, makePdfSelectionMark, openPdf, pdfAnnotationColor, pdfAnnotationRecord, pdfAnnotationResource, pdfAnnotationSubtype, pdfAnnotationToolOptions, pdfAnnotationTransfer, pdfMarkFromAnnotation, sendPdfMarkToDoc } from '@/utils/embedPdfActions'
import { settingsManager, type ReaderSettings, type ReadTheme } from '@/composables/useSetting'
import { readerIconPaths } from '@/utils/icon'
import { createPdfReflowSession, synchronizeReflowAnnotation } from '@/services/pdfReflow'
import type { ReflowDocument } from '@/core/pdfReflow'
import { pdfQuickSendCommandId, pdfViewerCommand } from '@/utils/keyboard'
import Translate from './Translate.vue'

const props = defineProps<{ source: File | string | null; settings?: ReaderSettings; theme?: string; customTheme?: ReadTheme; bookUrl?: string; storageKey?: string; i18n?: any; onAnnotationPersisted?: (event: any) => void }>()
const emit = defineEmits<{ ready: [viewer: any, context: { documentId: string; bookUrl: string; storageKey: string }]; 'read-only': [value: boolean]; detached: [] }>()
const host = ref<HTMLElement>()
const status = ref('')
const toolbarHidden = ref(false)
const readOnly = ref(false)
const pdfImport = ref<HTMLInputElement>()
const quickDocs = computed(() => (props.settings?.quickSendDocs || []).filter(doc => doc.id).slice(0, 5))
const appState = () => ({ toolbarHidden: toolbarHidden.value, quickDocs: quickDocs.value, readOnly: readOnly.value })
const pdfFeatures = { snapshots: true, redaction: true, 'forms.building': true, measurement: true }
const noteTooltip = ref<HTMLElement>()
let pointer: PointerEvent | undefined
const rememberPointer = (event: PointerEvent) => { pointer = event.pointerType === 'mouse' ? event : undefined }
const clearHover = () => { if (noteTooltip.value) noteTooltip.value.style.display = 'none' }
const sourceKey = () => props.storageKey || props.bookUrl || ''
const scrollBehavior = () => props.settings?.pageAnimation === 'push' ? 'instant' : 'smooth'
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
let reflow: (ReflowDocument & { url: string; name: string; original: Uint8Array; sourcePageCount: number }) | undefined
let inReflow = false

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
    content: '<div class="b3-dialog__content sireader-pdf-translate"></div>',
    width: '520px',
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
  const generated = inReflow ? reflow : undefined
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
  const generated = inReflow ? reflow : undefined
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
  const recordsByRef = new Map(annotation.list().map((item: any) => [JSON.stringify(item.ref), recordOf(item)]))
  const changed = (type: 'create' | 'update', native: any) => {
    const record = recordOf(native)
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
    stage.onPageChanged(() => save.schedule(stage.getCurrentPageIndex())),
    stage.onZoomChanged(({ mode, level }: any) => {
      const value = mode === 'custom' ? level : mode
      if (value !== 'automatic' && value !== 'fit-page' && value !== 'fit-width' && typeof value !== 'number') return
      clearTimeout(zoomTimer)
      zoomTimer = setTimeout(() => { if (value !== props.settings?.pdfZoomLevel) void settingsManager.patch({ pdfZoomLevel: value }) }, 400)
    }),
    annotation.onCreated(({ annotation: item }: any) => changed('create', item)),
    annotation.onUpdated(({ annotation: item }: any) => changed('update', item)),
    annotation.onDeleted(({ refs }: any) => {
      for (const ref of refs) {
        const refKey = JSON.stringify(ref)
        const record: any = recordsByRef.get(refKey)
        recordsByRef.delete(refKey)
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
  ]
  detachDocument = () => {
    copyNextSnapshot = false
    clearHover()
    subscriptions.forEach(off => off())
    void trackPending(save.flush()).catch(onFailure)
  }
  emit('read-only', readOnly.value || !ownsActiveDocument())
  emit('ready', viewer, { documentId: id, bookUrl, storageKey: key })
}

async function toggleReflow() {
  if (switching || !session || !documentId) return
  switching = true
  const signal = session.signal
  const activeViewer = viewer
  const previousId = documentId
  const stage = scoped('stage')
  const index = stage.getCurrentPageIndex()
  status.value = props.i18n?.pdfReflow || 'Text reflow'
  let nextId = ''
  try {
    await flushAnnotations()
    const firstReflow = !reflow
    if (!reflow) {
      const original = await activeViewer.documents.download(previousId, { signal })
      const source = await openPdf(original.slice())
      try {
        const { pages } = await source.pages.list()
        const generator = createPdfReflowSession(source, pages, scoped('selection').canCopy(), props.i18n)
        try {
          const width = Math.max(240, Math.min(720, host.value?.clientWidth || 480))
          const generated = await generator.generate(original.slice().buffer, { width, height: Math.max(400, Math.min(960, host.value?.clientHeight || 720)), fontSize: Math.max(12, Math.min(32, props.settings?.textSettings?.fontSize || 18)) }, signal, (page, count) => { status.value = `${props.i18n?.pdfReflow || 'Text reflow'} ${page}/${count}` })
          const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', generated.buffer))).map(value => value.toString(16).padStart(2, '0')).join('')
          const name = 'reflow-' + digest + '.pdf'
          const url = '/public/siyuan-sireader/reflow/' + name
          await writeManagedFile(new Blob([generated.buffer], { type: 'application/pdf' }), url, name)
          reflow = { ...generated, url, name, original, sourcePageCount: pages.length }
        } finally { generator.dispose() }
      } finally { await source.close() }
    }
    signal.throwIfAborted()
    const generated = reflow
    const previousMode = inReflow
    if (!previousMode && !firstReflow) generated.original = await activeViewer.documents.download(previousId, { signal })
    const next = previousMode ? generated.original : generated.buffer
    nextId = crypto.randomUUID()
    const { document } = await activeViewer.documents.open({ kind: 'bytes', bytes: next, id: nextId }, { name: previousMode ? undefined : generated.name, activate: false, signal })
    if (document.status !== 'ready') throw new Error(props.i18n?.pdfLoadFailed || 'PDF load failed')
    signal.throwIfAborted()
    inReflow = !previousMode
    activeViewer.documents.setActive(nextId)
    try {
      const mode = stage.getZoomMode()
      activeViewer.forDocument(nextId).get('stage').zoomTo(mode === 'custom' ? stage.getZoomLevel() : { mode })
      const target = previousMode ? generated.pageMap[index] ?? 0 : Math.max(0, generated.pageMap.indexOf(index))
      await attachDocument(nextId, signal, target)
    } catch (error) {
      inReflow = previousMode
      if (!signal.aborted) {
        activeViewer.documents.setActive(previousId)
        await attachDocument(previousId, signal, index)
      }
      throw error
    }
    await activeViewer.documents.close(previousId)
  } catch (error) {
    if (nextId && documentId !== nextId) await activeViewer.documents.close(nextId).catch(() => {})
    if (!signal.aborted) onFailure(error)
  } finally {
    if (!signal.aborted) status.value = ''
    switching = false
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
    return record ? { ...annotationMark(item, record), image: await capturePdfAnnotationImage(scoped('render'), record) } : null
  }
  const send = async (mark: any, id: string) => {
    if (!mark) return
    await sendPdfMarkToDoc(mark, id, {
      bookUrl: inReflow ? reflow?.url : props.bookUrl,
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
    { ...command('pdf-reflow', props.i18n?.pdfReflow || 'Text reflow', 'text', toggleReflow), active: () => inReflow },
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
        await copyMark(mark, { bookUrl: inReflow ? reflow?.url : props.bookUrl, isPdf: true, settings: { ...props.settings, noteInsertTarget: 'clipboard' }, showMsg: (text: string) => showMessage(text) } as any)
      }
    }),
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
      ...command('delete-redactions', props.i18n?.delete || 'Delete redactions', 'delete', () => {
        if (redactionsSelected()) return viewer.commands.execute('annotation:delete')
      }),
      enabled: () => !readOnly.value && redactionsSelected(),
    },
    command('capture-copy', props.i18n?.copyScreenshot || 'Copy screenshot', 'screenshot', async () => {
      const render = scoped('render')
      if (render?.getSnapshot()) return viewer.commands.execute('snapshot:copy')
      if (!render?.canSnapshot()) return
      window.dispatchEvent(new Event('sireader:close-reader-panels'))
      copyNextSnapshot = (await viewer.commands.execute('tool:snapshot')).status === 'executed'
    }),
    {
      ...command('lock-annotation-tool', props.i18n?.pdfKeepTool || 'Keep annotation tool active', 'lock', () => {
        const annotation = scoped('annotation')
        const tool = annotation.getSettings().afterCreate.tool
        annotation.updateSettings({ afterCreate: { tool: tool === 'stay' ? 'default' : 'stay' } })
      }),
      active: () => scoped('annotation')?.getSettings().afterCreate.tool === 'stay',
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
      stage: { zoom: zoom(), scrollBehavior: scrollBehavior() },
      render: { snapshot: { scale: 2 } },
      annotation: {
        afterCreate: { tool: 'default' },
        tools: pdfAnnotationToolOptions(props.settings?.pdfAnnotationToolDefaults),
      },
    },
    commands,
    layout: (layout: any) => {
      let result = layout
        .add('sireader:pdf-reflow', { to: 'main' })
        .add({ custom: 'view-only' }, { to: 'main' })
        .place('pager', { float: 'bottom', hideWhenIdle: false })
        .add('sireader:toc', { to: 'pager' })
        .add('sireader:notes', { to: 'pager' })
        .add('sireader:toggle-toolbar', { to: 'pager' })
        .add('sireader:capture-copy', { to: 'document' })
        .add('sireader:lock-annotation-tool', { to: 'annotate' })
      for (const id of ['read-only', 'import-annotations', 'export-annotations', 'import-layer', 'export-layer']) {
        result = result.add('sireader:' + id, { to: 'document' })
      }
      if (isMobile()) result = result.add('sireader:close', { to: 'pager' })
      for (const id of ['dict-selection', 'translate-selection', 'create-hole']) result = result.add('sireader:' + id, { to: 'selection' })
      for (const id of ['copy-annotation-link', 'dict-annotation', 'translate-annotation']) result = result.add('sireader:' + id, { to: 'annotation' })
      return quickMenus.reduce((layout, { kind, menu, items }) => layout
        .addMenu(menu, [items.map(item => item.id)])
        .add(`sireader:send-${kind}-menu`, { to: kind }), result)
    },
  }
}

watch([host, () => props.source], async ([target, source], _, onCleanup) => {
  if (!target || !source) return
  const controller = new AbortController()
  session = controller
  const { signal } = controller
  onCleanup(() => {
    controller.abort()
    detachDocument()
    detachDocument = () => {}
    clearTimeout(zoomTimer)
    element?.remove()
    element = viewer = undefined
    documentId = ''
    initialDocumentId = ''
    inReflow = false
    reflow = undefined
  })
  status.value = ''
  try {
    const next = await initEmbedPdfViewer(target, {
      ...configuration(),
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
      if (documentId) element.features = pdfFeatures
    }
  } catch (error: any) {
    if (!signal.aborted) status.value = error?.message || 'PDF load failed'
  }
}, { flush: 'post' })

watch(() => [props.theme, props.customTheme], () => { if (element) element.theme = theme() }, { deep: true })
watch(appState, value => { if (element) element.appState = value }, { deep: true })
watch(scrollBehavior, value => scoped('stage')?.updateSettings({ scrollBehavior: value }))
onBeforeUnmount(() => session?.abort())
defineExpose({ flushAnnotations, annotationActions, executeCommand })
</script>

<style scoped>
.embed-pdf-reader,.embed-pdf-reader__host{position:relative;width:100%;height:100%}
.embed-pdf-reader__status{position:absolute;inset:0;display:grid;place-items:center;background:var(--b3-theme-background);color:var(--b3-theme-on-surface)}
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-main)),
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-annotate)),
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-shapes)),
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-insert)),
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-form)),
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-redact)),
.hide-pdf-toolbar :deep(embedpdf-viewer::part(toolbar-measure)){display:none}
.embed-pdf-reader__note{display:none;position:fixed;z-index:99999;box-sizing:border-box;max-width:min(300px,calc(100vw - 20px));max-height:144px;overflow:hidden;padding:8px 12px;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);box-shadow:0 4px 16px #0002;pointer-events:none;white-space:pre-wrap;overflow-wrap:anywhere}
</style>
