# EmbedPDF Integration

SiReader uses EmbedPDF as the only PDF reader path.

- GitHub: https://github.com/embedpdf/embed-pdf-viewer
- Runtime package: `@embedpdf/snippet`
- License: MIT

## Runtime

PDF files open through [`src/components/EmbedPdfReader.vue`](../src/components/EmbedPdfReader.vue).

SiReader does not keep a built-in PDF.js reader, PDF toolbar, PDF search bridge, or PDF mark editing bridge. PDF behavior should come from EmbedPDF capabilities directly.

Current loading path:

- SiReader fetches/reads the PDF into an `ArrayBuffer`.
- EmbedPDF receives it through `documentManager.initialDocuments`.
- `worker: true` is intentional. PDFium wasm is bundled with the plugin and loaded by the worker from `/plugins/siyuan-sireader/embedpdf/pdfium.wasm`.
- EmbedPDF snippet runtime is bundled under `/plugins/siyuan-sireader/embedpdf/snippet` and imported from `/plugins/siyuan-sireader/embedpdf/snippet/embedpdf.js`.
- Default stamp manifests and PDFs for `zh-CN` and `en` are bundled under `/plugins/siyuan-sireader/embedpdf/stamps/{locale}`.
- Existing `/public/siyuan-sireader/embedpdf/...` cached assets remain a compatibility fallback only; opening PDF must not require first-use CDN downloads.

## Stored State

EmbedPDF state is stored at:

```txt
records/<bookDataId>.json
```

The file is the normal SiReader per-book JSON record:

```ts
{
  version: 1
  book: Book
  annotations: AnnotationTransferItem[]
  progress?: {
    pageNumber: number
    totalPages: number
    pageCoordinates?: { x: number; y: number }
    updatedAt: number
  }
  updatedAt: number
  migration?: {
    pdfAnnotations?: string
  }
}
```

Annotations are imported and exported only through EmbedPDF:

- `annotation.exportAnnotations()`
- `annotation.importAnnotations()`

SiReader filters exported annotations before saving so PDF-native link annotations are not duplicated into plugin storage. User annotations remain in EmbedPDF transfer format. Keep this direct round trip; do not add an adapter layer unless EmbedPDF changes its transfer shape.

PDF annotations, PDF bookmarks, and PDF progress all use the same per-book JSON record. Do not reintroduce `.bin` as the active storage path.

Current split:

- [`src/core/bookStore.ts`](../src/core/bookStore.ts): thin storage entry for book records, PDF annotation reads/writes, and PDF progress writes.
- [`src/core/dataMigration.ts`](../src/core/dataMigration.ts): legacy PDF conversion, EmbedPDF annotation normalization, migration marker, text/geometry repair.
- [`src/components/EmbedPdfReader.vue`](../src/components/EmbedPdfReader.vue): EmbedPDF lifecycle glue only; no migration algorithm or annotation template logic.

When older SiReader PDF marks are found in the same JSON record, SiReader converts them in time-sliced batches to EmbedPDF transfer items and writes the repaired record back. Items that cannot be converted are kept in the JSON record so later repair logic can try again. Concurrent PDF progress and annotation reads share one migration task per book. Completed records are marked with `migration.pdfAnnotations`; do not show migration messages or rerun migration when that marker is current.

Legacy `records/embedpdf/<bookHash>.bin` records are imported into the same JSON record once and then removed only after the import count matches the legacy annotation count.

Legacy notes with selected text are migrated as normal text highlights with the note saved as the EmbedPDF comment (`contents`). Missing old style/color data falls back to the basic highlight style; do not preserve old SiReader-only style fields if EmbedPDF does not need them.

Progress is saved from EmbedPDF scroll metrics and restored with `scrollToPage()`.

The annotation page reads exported EmbedPDF annotations and maps only UI fields needed by the shared mark card:

- `id`
- `page`
- `text`
- `note`
- `tags`
- `blockId`
- `color`
- `style`
- `created/modified`
- `chapter`

Fields not shown by current UI should stay out of `custom` unless they drive rendering or sync.

Saved annotation records should stay close to standard EmbedPDF transfer items:

- keep `annotation` and optional `ctx`
- dedupe by annotation `id`
- compact/round rects enough to avoid bloated JSON
- remove temporary migration fields after successful text alignment: `legacyType`, `legacyCoord`, `textCoord`
- avoid duplicating the same note in both `contents` and `custom.note`

Normalization is the compatibility boundary for malformed or older PDF annotation data. Keep the defensive fixes in [`src/core/dataMigration.ts`](../src/core/dataMigration.ts), not in render components:

- non-array annotation containers are treated as empty
- malformed annotation entries are skipped
- missing `rect` falls back to a 1x1 safe rect
- text markup annotations restore `segmentRects` from `rect`
- polygon/polyline annotations always expose `vertices`
- line annotations always expose `linePoints`
- ink annotations always expose `inkList` and per-path `points`
- invalid `custom`, `strokeDashArray`, and `replies` values are cleaned before saving

This is intentionally a render-safety layer, not a full data reconstruction system. If geometry cannot be recovered, prefer a harmless fallback over crashing the whole PDF reader.

PDF annotation import lives in [`src/core/pdfAnnotationImport.ts`](../src/core/pdfAnnotationImport.ts). It is a small sidecar-data importer for bookshelf PDFs:

- accepts JSON, XFDF, Markdown, and TXT annotation export files
- recognizes EmbedPDF/SiReader records, Zotero-like JSON fields, and simple reader exports with page/text/note/rect data
- converts through the same migration/normalization path before writing
- merges by annotation `id` and skips duplicates

Do not parse annotated PDF binaries here. If a reader only stores annotations inside the PDF file itself, export a sidecar file first or add a dedicated parser with samples.

## PDF Bookmarks

PDF bookmarks are EmbedPDF annotations too. They should use the same save/load/edit/delete path as other PDF annotations.

Rules:

- no special "bookmark cannot delete/edit" branch
- TOC bookmark icons are format-agnostic; PDF should not be blocked when EPUB has the icon
- bookmark cards use the shared mark card style, with title/text using the theme color and notes/comments staying normal text

## Annotation Links

PDF annotation links use the same SiReader backlink entry as EPUB:

```txt
sireader://open?url=<bookUrl>&cfi=%23page-<page>&id=<annotationId>
```

For PDF, `cfi` is a page anchor (`#page-8`). `%23` is the normal URL encoding of `#`.

Click handling stays in the shared SiReader link flow:

- parse the `sireader://open` URL
- open or activate the book tab
- when `cfi` matches `#page-N`, route to EmbedPDF `goTo(page)` instead of EPUB CFI navigation
- use the annotation `id` only as the exact target/highlight identifier, not as the page source

Do not send `#page-N` into Foliate/EPUB `goTo()`.

## PDF Annotation Tooltip

The reading-page tooltip is only for PDF annotations that already have a comment or replies. Plain highlights without note content should not show a tooltip.

The trigger deliberately follows EmbedPDF's rendered hit area:

- read the element under the pointer through the `embedpdf-container` shadow root
- require `cursor: pointer`, which is EmbedPDF's own annotation hit signal
- match that rendered hit element against EmbedPDF annotation rects using screen-space overlap
- choose the annotation with the largest overlap

The tooltip content is built from:

- selected text: `annotation.custom.text`, normalized to one inline line for PDF line breaks
- comment: `annotation.custom.note` or `annotation.contents`
- replies: annotations whose `inReplyToId` points at the parent annotation

Keep this path small. Avoid timers, global mousemove logging, selected-annotation fallbacks, or distance-based guessing; those make hover unstable or show the wrong note.

## PDF Redaction Usage

References:

- EmbedPDF Redaction Plugin: https://www.embedpdf.com/docs/react/headless/plugins/plugin-redaction
- EmbedPDF Annotation Plugin: https://www.embedpdf.com/docs/vue/viewer/plugins/plugin-annotation
- EmbedPDF cross-page selection issue: https://github.com/embedpdf/embed-pdf-viewer/issues/668
- Adobe Acrobat redaction behavior: https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/redact.html

EmbedPDF redaction is a two-step workflow:

- pending redactions mark content before the destructive apply/commit step
- committed redactions remove the content and may draw black boxes, depending on EmbedPDF behavior/config

SiReader uses EmbedPDF redaction annotation mode. Pending redactions are stored as `REDACT` annotations, show in the normal annotation list as "遮蔽", and can be deleted there before apply/commit.

Correct usage: create pending redactions first, hover them to preview the filled redaction result, then delete or apply when the result is confirmed. Before commit, seeing only a border is expected because the original PDF content has not been removed yet. After commit, redaction remains destructive and cannot restore the original content.

Answer holes are non-destructive EmbedPDF highlight annotations. The PDF selection menu creates a normal `HIGHLIGHT` annotation with black color, full opacity, and `Normal` blend mode, so EmbedPDF's own renderer covers the selected text. Hovering the black highlight lowers its opacity to reveal the original content. They stay in the normal annotation list and can be deleted there. Do not use SiReader-owned overlay layers, hidden annotations, `custom.type = "mask"`, or PDF redaction for this feature.

Cross-page text selection is tracked as an upstream EmbedPDF 2.14.4 issue: when a drag crosses a page boundary, `pointerup` may not end text selection. EmbedPDF currently exposes `clear()` but no public API to end selection while keeping the selected range and menu visible, so SiReader should not add outer pointer-event patches for this.

The `Guest` name and avatar shown in EmbedPDF's comment UI are annotation-author UI, not a SiReader multi-user comment feature. EmbedPDF documents `annotation.annotationAuthor` for the default annotation author, but it does not reliably replace that comment sidebar display in the current SiReader viewer path, so keep the default instead of adding a SiReader-side author/avatar patch.

## PDF Actions And Menus

PDF reader actions should reuse shared TypeScript helpers and keep [`src/components/EmbedPdfReader.vue`](../src/components/EmbedPdfReader.vue) as thin EmbedPDF glue.

Current helper split:

- [`src/utils/copy.ts`](../src/utils/copy.ts): shared mark copy/export/import and `sendMarkToDoc()`.
- [`src/utils/embedPdfActions.ts`](../src/utils/embedPdfActions.ts): EmbedPDF task conversion, PDF selection/annotation-to-mark conversion, quick-send license wrapper, screenshot blob clipboard write, menu item insertion, and bookmark-to-TOC mapping.
- [`src/utils/dictionary.ts`](../src/utils/dictionary.ts): dictionary popup.
- [`src/components/Translate.vue`](../src/components/Translate.vue): translation dialog content.

Annotation copy, quick-send, import, auto-sync, and edit-sync must all generate Markdown through [`src/utils/copy.ts`](../src/utils/copy.ts). Keep custom `linkFormat` handling there; do not capture clipboard output or rebuild annotation templates in PDF components.

Quick send uses EmbedPDF's native UI model:

- selection and annotation menus get one first-level `发送到` command button
- that button opens a native EmbedPDF `menus` entry with the configured quick-send documents
- document rows call the shared `sendMarkToDoc()` path through `sendPdfMarkToDoc()`
- valid quick-send documents must have an `id`; the PDF menu only shows up to five
- when an annotation already has a bound `blockId`, comment or note edits should update that block instead of inserting a duplicate

Do not build custom floating quick-send menus. EmbedPDF `selectionMenus` do not expose a stable submenu item shape; use `menus + openMenu()` instead.

Keyboard shortcuts should stay on EmbedPDF's native commands path. If SiReader adds shortcuts for PDF-only actions, register them through EmbedPDF command `shortcuts` instead of adding a SiReader-owned PDF `keydown` listener. The outer reader keyboard handler should not consume keys while the active reader is EmbedPDF.

Screenshot copy uses EmbedPDF capture state:

- the document menu gets a `复制截图` command
- the command starts marquee capture and closes SiReader side panels
- when EmbedPDF produces a capture blob, SiReader writes it through the shared PDF action helper
- the capture result footer also gets a copy button beside EmbedPDF's own download button

PDF outline/bookmarks are exposed through `Reader.vue` as `currentView.getBookmarks()` and rendered by the shared sidebar TOC via `bookmarkToc()`. Keep the hierarchy from EmbedPDF bookmark children; do not flatten it for the sidebar.

## Document Hover Preview

Backlinks inserted into SiYuan documents should preview PDF annotation context on hover.

Preview lookup order:

- live opened PDF annotations, when the book is already active
- stored EmbedPDF annotations from `records/<bookDataId>.json`
- fallback by page when the stored annotation id is stale

Context text comes from EmbedPDF text extraction:

- opened PDF: reuse the active EmbedPDF engine/document and cache per page
- unopened PDF: create one hidden EmbedPDF session for the book, extract only the requested page, cache the page text, and dispose/reuse the hidden session by book

Preview range should include text before and after the annotation. It should not stop at only the next sentence when the following paragraph still fits inside the context window.

Keep extraction lazy. Do not pre-extract the whole PDF for document hover.

## PDF Search

PDF search should stay on EmbedPDF's native search plugin and search layer. SiReader should not rebuild PDF text matching, highlight positioning, result scrolling, or sidebar search controls.

The search layer's own highlight elements must not be covered by broad shadow-root CSS. If dark-page theming needs a small compatibility rule, keep it scoped to the rendered search highlight blend mode only; do not override generic positioned elements or background-color styles in the PDF page.

## PDF Theme

PDF theme support is intentionally small.

EmbedPDF's `theme` config is used for viewer UI chrome only. It does not reliably recolor rendered PDF page pixels. SiReader therefore keeps page-content theming to two stable modes:

- light/default: no page filter
- dark-like themes: invert rendered PDF page blob images inside the EmbedPDF shadow root

The current implementation lives in:

- [`src/utils/embedPdfTheme.ts`](../src/utils/embedPdfTheme.ts): maps SiReader theme/custom theme to EmbedPDF UI theme preference and the small set of UI colors used by sidebars, comments, controls, scrollbars, and tooltips. Custom theme background participates in the light/dark preference decision.
- [`src/components/EmbedPdfReader.vue`](../src/components/EmbedPdfReader.vue): calls `setTheme()`, sets `data-sireader-page-mode`, and injects one small `style[data-sireader-page-theme]` into EmbedPDF's shadow root

For EmbedPDF UI chrome, keep `background.surface` and `surfaceAlt` aligned with the reader theme background instead of SiYuan's app `--b3-theme-surface`; otherwise dark SiYuan panels can make PDF sidebars and comments too dark when the reader theme itself is lighter or custom. In dark-like reader themes, secondary/muted text should remain readable against that reader background.

Do not reintroduce PDFium/render `pageColors`, patched `@embedpdf` packages, or broad canvas filters. Those attempts previously caused blank pages, background covering text, blurred content, or annotations inheriting the page theme. If richer sepia/green/blue PDF page theming is needed later, treat it as a new feature with visual regression checks.

## Rule

If EmbedPDF does not expose a stable capability, SiReader leaves that PDF feature to EmbedPDF's own UI instead of rebuilding it.

## New Chat Checklist

- Keep `buffer + worker:true + CDN-downloaded public cached PDFium wasm/stamps`.
- Keep PDF state in the normal per-book JSON record.
- Keep EmbedPDF `exportAnnotations()` / `importAnnotations()` as the storage boundary.
- Keep PDF annotations/bookmarks/progress on the same JSON record path; `.bin` is legacy migration input only.
- Keep migration logic in `dataMigration.ts`; keep `bookStore.ts` as a thin read/write layer.
- Keep completed migration guarded by `migration.pdfAnnotations` so opening a PDF does not migrate every time.
- Keep PDF backlinks as `sireader://open?...&cfi=%23page-N&id=...`.
- Keep PDF click navigation on EmbedPDF page anchors, not EPUB CFI navigation.
- Keep PDF search on EmbedPDF native search/highlight; do not add a custom PDF search renderer.
- Keep PDF keyboard shortcuts on EmbedPDF native commands/`shortcuts`; do not add an outer PDF keydown layer.
- Keep PDF page theme support to default/light and dark inversion only.
- Keep custom theme background in the PDF light/dark preference decision.
- Keep EmbedPDF UI theme mapping small; use the reader background for sidebars/comments and avoid unused full-token color maps.
- Keep the PDF theme shadow style injected once with `data-sireader-page-theme`.
- Keep PDF tooltip tied to EmbedPDF rendered pointer hit areas and annotation overlap.
- Keep PDF quick send on native EmbedPDF `menus + openMenu()`, with shared send/copy helpers in `.ts` files.
- Keep PDF screenshot copy on EmbedPDF capture events; do not add a custom screenshot renderer.
- Keep PDF outline/bookmark hierarchy in the sidebar TOC.
- Keep document hover preview lazy, page-scoped, and available for unopened PDFs.
- Avoid restoring the old PDF.js shell, old toolbar, or compatibility card code.
- Avoid patched `@embedpdf` dependencies unless upstream exposes a stable API and the patch is unavoidable.
- Before changing annotation fields, verify both PDF rendering and the shared mark card.
