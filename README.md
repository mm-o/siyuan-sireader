<div align="center">

# 📖 SiReader

**Professional eBook Reader · Smart Annotation**

Transform SiYuan Notes into a professional eBook reader  
Professional eBook reader for EPUB/PDF/MOBI/TXT/online novels. PDFs support highlights, ink, shapes, forms, stamps, signatures, images, screenshots, search, printing, export, and backlinks, with annotation notes, dictionary, translation, themes, and bookshelf management.

[![Version](https://img.shields.io/badge/version-2.8.1-blue.svg)](https://github.com/mm-o/siyuan-sireader)
[![License](https://img.shields.io/badge/license-MIT%20%2B%20AGPL-green.svg)](LICENSE)
[![SiYuan](https://img.shields.io/badge/SiYuan-3.0+-orange.svg)](https://github.com/siyuan-note/siyuan)

[🌐 Product Page](https://docs.745201.xyz/products/sireader/) · [📖 Documentation](https://docs.745201.xyz/docs/sireader/overview/) · [📝 Changelog](https://docs.745201.xyz/docs/changelog/sireader/) · [🔌 Integration API](https://docs.745201.xyz/docs/sireader/integration/) · Buy via the WeChat Mini Program “思源插件助手” · [👥 QQ Group](https://qm.qq.com/q/wpHDtsfxCw)

</div>

---

## 📝 Latest Updates

## v2.8.1 (2026-11-19)

### Fixed

- Fixed the reader's table-of-contents button doing nothing and every jump/settings-sync event being dead

## v2.8.0 (2026-11-17)

### Added

- Full-screen button for EPUB and other non-PDF readers: one button to enter and leave full screen, with the icon following the state (PDF keeps its built-in full screen).
- The translation window is wider (720px, up to 92vw), the source and translation boxes size to their content and can be dragged taller, and the engine picker plus "Add as annotation" stay pinned so the dialog itself never scrolls.
- New "Page sharpness (scans)" setting for the PDF base image width (five stops: 640 / 1280 / 1920 / 2560 / 3200, default 640, the upstream default). High-resolution scans such as 291 ppi look soft at normal zoom; raising it sharpens them at the cost of per-page bitmap memory, and it applies after reopening the PDF.

### Fixed

- Fixed membership features needing a SiYuan restart after "Recover entitlement": the license state is now shared across the app, so it takes effect immediately.
- Fixed bookshelf search inside a group only finding that group: any keyword now searches the whole shelf, and group names, author, status, tags, file names and paths all match (space-separated words, all must match).
- Fixed blurry exported images for shape annotations: exports render at 4 px/pt (~288 dpi) with a 600 px floor for small marks, and polygons (type 7) are included.
- Fixed annotation backlinks opening at the last reading position instead of the target page: the jump target now goes through a single-slot handoff consumed once the reader is ready, with "restore last position" cancelled, covering the not-open, already-open and cross-book cases (the timer-based retry polling is gone).
- Fixed a horizontal scrollbar (the grey bar) appearing under a settings row on hover: the settings list now scrolls vertically only, and the "Note insertion" group uses the same flat row structure as the other groups.

## v2.7.3 (2026-11-17)

### Fixed

- Cloud books from Siyuan Cloud now fall back between routes: when the `/d/` download route fails, SiReader retries through the `/p/` preview route instead of returning an error page, which previously surfaced as `File type not supported` for EPUB.
- If upstream returns a gzip body without a `Content-Encoding` header, SiReader decompresses it from the magic bytes before parsing (`.gz` files themselves are excluded).
- When the fetched content is not a real EPUB/PDF, the error now reports the byte size and the file header (hex when not printable), so you can tell whether the file or the transfer is at fault.
- Fixed books that share a title but differ in format (for example the EPUB and the PDF of the same book) being treated as one tab: the "already open" check now compares the book url and uses the title for display only. Legacy tabs without a recorded url still fall back to the title so the same book never opens twice.
- Fixed one book opening duplicate tabs: the tab lookup now scans every layout (right and bottom docks included) and compares urls through the candidate normalization, so differently encoded addresses of the same file still match.

## v2.7.2 (2026-11-17)

### Added

- PDF annotations can be bound to a SiYuan block and opened from the annotation toolbar: importing, sync-on-add, and sending to a document record the block automatically, and a `siyuan://blocks/<id>` or bare block id link becomes that binding.
- Bookshelf search splits on spaces: `guangdong 2026` requires every word to match, and file names, paths, and links are searched too.

### Fixed

- Fixed PDF annotations not showing their quoted text in the sidebar: the 3.x engine no longer stores the selected text on the annotation, so it is written into `custom.text` when the annotation is created, which the sidebar, backlink copy, and send-to-document paths all read.
- Fixed `Cannot read properties of undefined (reading 'x')` when jumping to an annotation from the sidebar: annotation rectangles now accept both `{origin,size}` and `{x,y,width,height}`, with the same normalization used by annotation image cropping and record writes.
- Fixed shape annotations reading as the generic "Annotation" in the sidebar: they now read "Shape annotation", apart from text annotations.
- Fixed a PDF bookmark jump changing the zoom level: a bookmark only has a placeholder rect, so it now scrolls to the page and keeps the current zoom.
- Fixed an empty tooltip bar appearing when hovering a setting that has no description.
- Fixed "Show data location" reporting unsupported for books on the cloud drive or moved away: it now resolves the local file when possible, otherwise opens the link or explains and copies the path.
- Fixed the bookshelf context menu not reopening after a click elsewhere, and a drag cursor showing up on right-click.
- Fixed annotation backlinks doing nothing while the PDF tab was open but not ready yet: the jump now waits for the document and retries before focusing the annotation.
- Fixed the missing-file error not naming the file: it now includes the missing path so the link works again once the file is back.

## v2.7.1 (2026-11-15)

### Added

- The bookshelf book menu now offers “Show data location”, which jumps straight to the book's data or original file.
- The bookshelf book menu now offers “Copy link”, which copies a Markdown link (`[Book](sireader://resume?url=…)`) using the same “link format” template as annotation export; clicking it resumes at the saved position without an annotation anchor.

### Fixed

- Fixed deleting a PDF annotation not deleting the block already bound in the document: the binding was only written to metadata during a session, while deletion used the snapshot taken at creation time.
- Fixed a PDF backlink only opening the book instead of jumping to the annotation on the first click: the target is now stashed until the reader is ready, then executed.
- Fixed imprecise PDF annotation positioning: the annotation is now selected and its area scrolled slightly above the viewport center, instead of jumping to the top of the page and leaving the content in the lower third.
- Fixed PDF reading progress jumping back to the cover after sleep or lock: a restored page was overwritten by the first layout, so it now re-jumps once and does not write progress while restoring.
- Fixed shape annotations not showing their frame after being inserted into a document (which also hid other annotations inside the frame): added the “Include the annotation in exported images” switch, which exports the frame with the picture.
- Fixed Chinese input in PDF comment and annotation note fields: Enter during IME composition is no longer treated as submit by upstream.
- Fixed shape annotation “sync on add” not working: tool style defaults were passed to the engine worker as a reactive object, triggering DataCloneError so annotation events never flowed back.
- Fixed “Show data location” reporting “no local file” for link-only or externally imported books: it now opens the link or locates the original `file://` file.
- Fixed the PDF toolbar “delete redaction” command using a non-existent icon name and logging console warnings repeatedly.
- Fixed SiYuan refresh/reload hanging after opening a PDF: upstream enables “confirm before leaving” by default, and any document judged to have unsaved changes blocks `beforeunload`; SiReader persists annotations itself, so the engine's document always looks unsaved and every reload was cancelled. The confirmation is now disabled.
- Bounded the save and wait steps of plugin unload, so one stuck write can no longer keep SiYuan's refresh/reload hanging.
- Fixed the PDF annotation “delete” button tooltip mixing in an English shortcut name.
- Fixed exported shape annotation images carrying the annotation stroke; only page content is captured now.
- Fixed the “keep tool after drawing” switch having no effect: turning it off now returns to the default tool after drawing; the switch appears on both the “annotate” and “shapes” toolbars and its state is saved.
- Fixed large scanned pages looking blurry at some zoom levels: the base image budget `render.fullPage.maxWidth` was raised from 640 to 1280.
- Fixed reaching the end of a page scrolling the outer page: upstream's new, default-on `stage.scrollChaining` is disabled.
- Fixed PDFs in the SiYuan cloud drive (siyuan-cloud) failing with `is not an asset path`: plugin virtual paths are no longer handed to SiYuan's built-in PDF tab and always fall back to the plugin reader.
- Clicking a cloud-drive file now prefers siyuan-cloud's new `data-reader-href` (`siyuan://plugins/siyuan-cloud/open?path=…`), matching links inserted or copied in documents.
- Document exclusion path rules now also apply to that `data-reader-href` link shape.

### Known Issues

- Legacy GB-standard PDFs (no embedded CJK font and no character map, typically typeset with Founder or WPS in the 2000s) show Latin text and correct layout but leave every Chinese character blank. Re-checked on EmbedPDF 3.2.0: the official `engine.fallbackFonts` still trips a WASM out-of-bounds during rendering, and PDFium's native system-font interface has no effect in this wasm build, so neither glyph-fallback route is usable — it has to wait for an upstream fix, and this release ships no temporary font or build patch. Until then open these files in another reader, or OCR / re-export the PDF with embedded fonts. Scanned PDFs, forms, signatures and ordinary PDFs are unaffected.

## v2.7.0 (2026-11-12)

### Added

- The PDF reader now uses EmbedPDF's native drag-to-open, multi-document tabs, measurement, thumbnails, outline, screenshots, redaction, form design, and read-only mode.
- Document menu adds annotation JSON import/export and PDF change-layer import/export; importing a change layer opens the source PDF in a separate tab and preserves the changes.
- Restored hover-to-view PDF annotation notes. Selecting text or an annotation offers dictionary lookup, translation, copy-backlink, and send-to-SiYuan actions.
- SiYuan table of contents, quick notes, and toolbar visibility toggles integrate with the native bottom toolbar; mobile keeps the reader close entry.
- PDF native outline and annotation panels use EmbedPDF outline navigation; the thumbnail entry opens the native thumbnail panel.
- Restored copy-screenshot after area selection, with quick-send targets updating live during PDF reading.
- Document-link auto-import exclusion adds "exclude keywords" and "exclude paths": keywords match filenames or links with `*` wildcards, paths exclude whole directories by prefix, covering `assets/` and SiYuan cloud (web drive) files.

### Fixed

- Fixed legacy annotation tool settings causing PDF white screens or SiYuan freezes; legacy settings are converted to the current colors, line widths, dashes, and arrow styles on load.
- Kept legacy annotation data compatibility, converting geometry, colors, arrow endpoints, and stamp resources; new annotations write back to SiReader records through native EmbedPDF events. Fixed empty-color annotations breaking the sidebar list.
- Fixed PDF translation using the old selection API, and broken rectangle and redaction-delete shortcuts; updated the translation, dictionary, copy-backlink, and notebook icons.
- Fixed the reader failing to mount when the PDF tab source is not a valid file object.
- Fixed the settings panel multiline inputs being stretched by a fixed minimum height. Removing `min-height:96px` lets textarea height follow `rows` again: the document-link exclusion keywords, paths, and regex return to 2 rows instead of 4.
- GB PDF Chinese garble remains unresolved. The official 3.1.0 `engine.fallbackFonts` triggers WASM memory out-of-bounds on Adobe-GB1 samples without embedded CJK fonts, so it is disabled; upstream has open CJK missing-glyph and font-config discussions with no matching fix.
- Fixed legacy SQLite data no longer being read after upgrading from v0.9.x–v1.2.x, leaving the bookshelf empty. Startup now auto-detects `reader.db` / `reader.last-good.db` in the plugin directory, as well as the `petal/siyuan-sireader-backup/<timestamp>/` backups left by older migrations, and imports books, annotations, groups, settings, and reading records. Import is idempotent by "source + byte size", so repeated launches or re-copying the same database never duplicate.
- Fixed old `pdf://title_size` backlinks in notes showing "book not found" after the book was re-imported as a `file://` entry. Opening books, resume links, the annotation panel, and link-hover preview now resolve to the existing book by "filename" and "title + size", then jump to the original annotation.

### Improved

- Improved document-link exclusion settings: direct keyword and path input boxes with one-click common-path presets and live link-match testing; regex remains an advanced option.
- Moved the document-link exclusion setting under "Open & Interface → Bookshelf Config" to group bookshelf-related options and avoid hunting through note insertion.
- Reordered the sidebar's top navigation: the notebook button moves after annotations, and the settings button is fixed as the last item; also fixed old configs adding the notebook button after settings when backfilling.
- Migrated from the EmbedPDF 2.x Snippet to the official `@embedpdf/viewer` and `@embedpdf/engine` 3.1.0 API, removing the old Snippet, duplicated document management, scroll/zoom code, and Shadow-DOM-dependent DOM patches.
- Reader commands and shortcuts map to native EmbedPDF `commands`; document lifecycle uses `viewer.documents.open()`, `setActive()`, `download()`, and `close()`. Extra tabs stay isolated from SiReader bookshelf annotation data.
- Page navigation, zoom, scroll, and rotation are handled by the native `stage`; zoom shortcuts use native zoom stepping, reducing custom scroll/zoom logic. Removed the duplicate PDF scroll-direction setting.
- Annotations use native `annotation.create()`, `update()`, `delete()`, and events; view contexts come from `viewer.get()` and `viewer.forDocument(id).get()`. SiReader keeps storing compatible legacy annotation records.
- Cover and offline annotation previews reuse `localEngine().open()`, `page.text.get()`, and `page.render.image()`, removing the hidden Viewer and old engine bridge.
- Reflowed PDFs open in the same Viewer through the native multi-document interface, preserving source-page and annotation mapping plus the save-wait before switching.
- Build uses local Viewer, Engine Worker, and WASM, with adjusted reflow Worker browser builds to remove build warnings.
- Legacy data migration now merges: existing books, annotations (deduplicated by annotation ID), progress, and settings take precedence, only filling gaps; `daily_reading` annotations aggregate into `daily.json`, empty PDF progress and chapter are backfilled, and the original database file is neither deleted nor rewritten.
- Legacy annotation compatibility improved: legacy flat PDF annotations (highlight / note / ink / shape) are converted to EmbedPDF structure using real page heights on open, keeping page numbers, rectangles, ink paths, and note text unchanged, with stable annotation IDs and no duplicates on repeated opens.
- The legacy database engine loads on demand: the WASM-inlined SQLite parser is downloaded only when a legacy database is detected, adding no startup cost or main-bundle size.

[EmbedPDF 3.x official migration guide](https://www.embedpdf.com/docs/viewer/vanilla/migrate)

## v2.6.1 (2026-11-03)

### Fixed

- Fixed malformed paths that clipped the Notes and Hide icons in the PDF bottom toolbar.
- Unified page-turn animation settings for the native PDF outline and comments with the reader's table of contents, using instant jumps or smooth scrolling according to the current setting.

## v2.6.0 (2026-11-02)

### Added

- Added a notebook page and quick-note window, accessible from the sidebar and EPUB/PDF readers. Search for and add SiYuan documents, create groups, open documents for editing, and bind documents to the current book for quick access.
- The quick-note window can be pinned. An empty notebook suggests adding frequently used documents, and the prompt disappears once content is added.

### Improved

- Simplified EPUB/PDF reflow: removed unused legacy iframe styling, empty clock updates, and the old PDF page-cache interface; unified EPUB override styles and shared PDF types; reused committed source-PDF snapshots to reduce repeated exports and page matching.
- Consolidated the reflow main-thread service, shared types, and coordinate mapping, reducing production modules from 9 to 5. Worker messaging is now internal, and related tests are consolidated.
- Preserved the reflow core and service directories in packaged source to prevent files with the same name from overwriting each other.
- PDF reflow now generates a PDF with a real text layer and opens it in the same EmbedPDF reader. Native reading features—including pagination, zoom, selection, annotations, search, drawing, screenshots, and export—use the same reader, replacing the separate text layer and manual selection/annotation bridge.
- Reflow annotations retain their character-position mapping to the source. Edits, deletions, and mappings restored for legacy annotations stay in sync with the source. OCR text and graphic annotations without reliable mappings appear as page comments on the source to prevent misplaced highlights.

### Fixed

- Fixed reader tabs staying on a loading screen when restored in a new window or moved from a tab into a new window.
- Fixed the “New window” setting opening the reader in a new tab in the current window.
- Fixed flickering caused by redundant layout updates when switching from a document tab back to the EPUB reader.
- Fixed borders appearing in images copied or inserted into documents from PDF shapes with no fill or stroke color. To insert a borderless image: select a shape tool → set the line width → set both fill and stroke colors to “None” → draw the shape around the desired area → insert the annotation into a document.
- Kept annotations and backlinks separate between the reflowed PDF and source, mapped reading progress to source pages, waited for pending writes before switching, and restored the previous document if loading failed.
- Fixed notebook search results that could not be opened from the reader, and the `Field [notebook] must not be null` error when hovering over document-tree items.

## v2.5.8 (2026-10-29)

### Improved

- Updated tooltips across the reader, bookshelf, table of contents, annotations, settings, and WeRead UI to follow SiYuan's `ariaLabel` conventions and use consistent text and positions.
- Clarified the Chinese plugin display name as “思阅-思源 EPUB/PDF 阅读器”.

## v2.5.7 (2026-10-22)

### Added

- Expanded offline voice-model management to import Kokoro-82M (103 Chinese and English voices), Piper VITS packs, and Xiaoya voice packs, and to browse, switch, and remove installed models.
- Added SiReader Reading Lifecycle Integration API v1 for version and capability discovery, stable reading events, and effective reading-time queries. Events do not expose book titles or URLs; see the [bilingual API documentation](https://github.com/mm-o/siyuan-sireader/blob/main/docs/integration-api.md) ([Issue #55](https://github.com/mm-o/siyuan-sireader/issues/55)).
- Added a XiaoLu LeiQie panel widget for recently read books and reading progress, with click-to-resume support and cleanup when the plugin is uninstalled ([Issue #57](https://github.com/mm-o/siyuan-sireader/issues/57)).
- Added portrait and landscape scroll-direction settings for PDF reading.

### Improved

- Moved offline voice inference to a dedicated Worker and improved model import, management, preloading, and continuous playback.
- Improved membership binding and entitlement checks: show service errors clearly, preserve still-valid cached entitlements during temporary network failures, and clear stale cache only after the server confirms there is no entitlement.
- Switched cursor insertion to SiYuan's official `insertContent` API, removed the legacy editor-positioning and internal insertion logic, and added bilingual error messages.

## v2.5.6 (2026-10-14)

### Added

- Added local font selection so installed system fonts can replace book fonts.

### Fixed

- Fixed footnote links in some books failing to open the footnote popup.
- Fixed font overriding not applying to some books.

## v2.5.4 (2026-10-12)

### Improved

- WeRead highlight exports now follow the book's chapter order while preserving the original order within each chapter.

### Fixed

- Fixed cloud-drive callback links retaining temporary local addresses by normalizing them to stable SiYuan paths.
- Improved callback-link readability by preserving Chinese filenames and path structure while encoding only required URL characters.
- Fixed [Issue #58](https://github.com/mm-o/siyuan-sireader/issues/58): text inside SiYuan tables could not be copied with Ctrl+C after opening the PDF reader.

## v2.5.3 (2026-10-09)

### Added

- Added a SiYuan kernel-plugin network bridge for WeRead, book-source search and downloads, translation, dictionaries, and other online requests across desktop, server, and Docker deployments.
- Added an EPUB “Override book font” setting that can optionally replace the book’s font family.

### Improved

- Aligned EPUB font handling with Readest: native book fonts and carefully designed font sizes are preserved by default, with font-family overriding applied only when enabled. Removed the legacy Foliate-internal header and footer injection so the outer reader owns their display.
- Aligned EPUB typography with Readest's default rules: Chinese books use 2em first-line indentation by default while preserving the book's native heading hierarchy, fonts, font sizes, bold text, paragraph styles, and inline formatting. Paragraph wrapping, alignment, code fonts, and image-paragraph exceptions now follow the same baseline.
- PDF language switching now uses EmbeddedPDF's native locale configuration.

### Fixed

- Fixed server-mode group covers being rendered with a different path treatment from book covers.
- Fixed [Issue #59](https://github.com/mm-o/siyuan-sireader/issues/59) by completing global Chinese and English i18n, including the bookshelf “Unknown author” label and the reader TOC button when switching SiYuan's language.
- Fixed the PDF interface not following SiYuan's language setting.
- Large scanned PDFs may still trigger `Sibling task failed` when searching again after clearing a search; this has been reported upstream and is tracked in [Issue #853](https://github.com/embedpdf/embed-pdf-viewer/issues/853).

## v2.5.1 (2026-10-04)

### Added

- Added percentage-based quick navigation to the EPUB reader toolbar, allowing direct jumps to an approximate reading position.
- Added batch book-data completion for PDF, EPUB, MOBI, and AZW3, including missing covers and metadata without overwriting existing user content, with progress reporting.
- Group covers can now use a cover from a book in the group or a custom cover; the group editor follows the book editor layout.

### Improved

- EPUB TOC now automatically expands and scrolls to the current chapter when opened, making back-and-forth reference reading faster.
- Unified file reading, cover parsing, cache refresh, and completion flows; the bookshelf now refreshes automatically and synchronizes filesystem timestamps for current and backup records after completion.
- Improved batch-processing speed and bookshelf sorting, including consistent recent-reading sort direction, while reducing duplicate reads, refreshes, and UI updates.
- Consolidated duplicate completion, sorting, file-reading, and editor logic, and expanded diagnostics for cover-loading failures.

### Fixed

- Fixed cloud-drive file reads that prevented PDF cover parsing.
- Fixed missing or broken EPUB/PDF covers and covers that only appeared after a manual bookshelf refresh.
- Fixed cancelling group editing returning to the add-content page.

## v2.5.0 (2026-09-30)

### 新增

- 新增 [Issue #36](https://github.com/mm-o/siyuan-sireader/issues/36) 微信读书导出功能：支持自定义模板，将书籍信息、封面、阅读链接、详情链接、ISBN、出版社、分类、出版时间、字数、阅读人数、评分、简介、目录、划线、书签和想法增量同步到思源子文档，并保留章节跳转及划线与想法的关联关系。

### 优化

- 同步 Foliate 上游分页、脚注与 TTS 能力，保留 WebView 选区兼容和安全销毁处理。
- 优化连续朗读衔接：当前句播放与下一句预加载协同工作，减少句间等待和播放断续。
- 优化朗读高亮：按当前实际播放句更新高亮样式，避免预加载误触发高亮或弹出浏览器选区菜单。
- 重构朗读播放小窗：采用紧凑的原位展开布局，统一播放、暂停、切句、停止和语音设置，与阅读器控制栏保持同一状态。
- 优化 [Issue #48](https://github.com/mm-o/siyuan-sireader/issues/48)：恢复 EmbedPDF 原生页面缓冲策略，预加载相邻页面，减少滚动时页面短暂模糊。

### 修复

- 修复在线语音请求产生无效音频、导致语音无法播放的问题，并完善异常连接的恢复处理。
- 修复文件写入时间戳单位错误，避免新写入的 JSON 文件显示为 1970 年。
- 修复书架“最近阅读”排序误用添加时间的问题；最近阅读现在按最后阅读时间排序。
- 修复鸿蒙端书架触摸点击响应偏慢的问题，优化移动端触摸反馈。
- 修复 [Issue #54](https://github.com/mm-o/siyuan-sireader/issues/54)：深色模式下微信读书内嵌网页滚动条显示为白色的问题，在网页加载完成后注入跟随页面前景色的滚动条样式。
- 修复 [Issue #51](https://github.com/mm-o/siyuan-sireader/issues/51)：EPUB 阅读器内容位于 iframe 时，点击正文无法关闭思源原生页签弹窗的问题；现在会将阅读器内容交互同步给宿主页面。
- 修复 [Issue #53](https://github.com/mm-o/siyuan-sireader/issues/53)：PDF 导入时自动渲染第一页并保存为默认封面。
- 修复 [Issue #47](https://github.com/mm-o/siyuan-sireader/issues/47)：从思源文档打开附件时，书架标题自动去除时间戳和随机后缀。
- 修复 [Issue #49](https://github.com/mm-o/siyuan-sireader/issues/49)：整理 EPUB 阅读器主题样式注入逻辑，修复暗色和自定义主题下背景与文字颜色互相覆盖导致的白底浅字问题。

### v2.3.6 (2026.9.29)

### Fixed

- Fixed `Storage checksum mismatch`, missing book metadata, and invisible PDF annotations after switching plugin versions or syncing devices. Legacy checksums, write-ahead logs, and in-memory caches were removed in favor of direct SiYuan file API reads and writes.
- Added a one-time legacy-data recovery for books currently on the shelf. Missing content is supplemented from legacy record paths and migration backups; current values win ID conflicts, existing records are snapshotted first, and successful recovery is not repeated.
- Fixed startup aborting and hiding the top-bar and dock entries when automatic recovery encountered an unversioned or malformed legacy record. Recognizable unversioned records are normalized, while other failures are isolated per book and logged.
- Fixed `DataCloneError` while creating groups, editing book metadata, or processing annotations imported from external PDF applications.
- Fixed `Managed file size mismatch: got unknown` after importing data or books.
- Fixed PDFs losing their record association when local paths, cloud-drive URLs, or synced device paths changed by supporting stable data IDs together with legacy Book URL aliases.
- Fixed stale full snapshots overwriting newer PDF annotations, deleted annotations reappearing, the final edit being lost on close, and concurrent progress/annotation saves overwriting one another.
- Fixed SiYuan data-change notifications triggering repeated recovery or writes; sync notifications now refresh consumers only.

### Improved

- Upgraded EmbedPDF from `2.14.4` to `2.15.1`, adding programmable text selection and fixing overlapping redactions that missed targeted text or removed adjacent text, including vertical text, transformed nested forms, and stale replacement text.
- Reworked annotation integration around EmbedPDF's standard `importAnnotations()` / `exportAnnotations()` and committed-event APIs. Annotation changes are serialized and persisted by ID without duplicate saves during import.
- Preserved binary contexts for stamps and similar annotations, separated native PDF annotations from plugin-managed annotations, and drained annotation/progress work before closing a reader.
- Improved first-page rendering and progress restoration for large PDFs, reducing blank-screen waits, stalls, and initial page-state overwrites.
- Simplified storage by removing duplicate caches, WAL, checksum wrappers, and obsolete files while retaining ordered per-file writes, cross-window locking, schema validation, and corrupt-data protection.
- Expanded diagnostics across storage, migration, recovery, sync, and PDF annotation flows with timing, source, and recovery-difference statistics.

### v2.3.4 (2026.9.27)

### Fixed

- Fixed checksum mismatches after switching between newer and older plugin versions, and improved legacy-data recovery and migration locking.
- Strengthened storage-version, structure, and corruption checks; storage errors now include the affected key instead of silently overwriting data.
- Unified PDF annotation and storage-boundary data normalization, fixing `DataCloneError` when external PDF annotation objects enter a transaction.

### Improved

- Hardened the storage read/write flow with unified write verification and retries, improving compatibility with short-lived SiYuan file API visibility delays and concurrent writes.
- Improved compatibility for PDFs containing large numbers of annotations from other readers, preventing reactive or engine-owned objects from reaching persistent storage directly.
- Reduced PDF first-screen preloading so large scanned PDFs prioritize the current page, lowering initial wait time and memory use.

### v2.3.3 (2026.9.27)

### Added

- Added downloadable offline TTS voice packs and local voice-pack playback. Browser WASM inference is currently single-threaded, so playback may sound intermittent; queueing and inference performance will be improved in a future release.

### Fixed

- Fixed file-size validation errors during data import.
- Fixed manual bookshelf group creation not responding.
- Fixed mini-program binding QR-code requests not retrying through SiYuan's network proxy when the endpoint returned an error (Issue #56).

### v2.3.2 (2026.9.25)

### Fixed

- Reworked PDF and EPUB annotation persistence to perform creates, updates, and deletions in annotation-ID order, preventing delayed full snapshots from restoring deleted annotations or overwriting newer notes during repeated create, delete, and refresh cycles.
- Fixed automatic SiYuan document synchronization writing block IDs back through a stale PDF annotation object; block IDs are now merged into the latest annotation data without overwriting changes the user just made.
- Fixed PDF annotations temporarily remaining in the left-hand list after deletion; the list now reloads after the reader event has settled.
- Fixed annotations reappearing when an initial save failed, the annotation was immediately deleted, and the failed operation was later replayed; deletion is now reliably executed as an ordered operation on the same record.

### Improved

- Added a unified transactional storage layer with revisions, checksums, per-file ordered queues, cross-window locks, write-after-read verification, cache invalidation, and pending-task draining during shutdown.
- Settings, license state, reading statistics, page-script settings, bookshelf indexes, reading progress, and annotation records now use transactional reads and writes, reducing inconsistencies caused by concurrent overwrites or abnormal exits.
- Failed writes are retried and replayed before later operations on the same record; automatic PDF/EPUB insertion into SiYuan documents runs only after the corresponding annotation has been reliably written and verified.
- Cross-file changes use recoverable write-ahead logs under `transactions/`; unfinished transactions are recovered during startup and their logs are removed after a successful commit.
- Managed books, covers, backgrounds, fonts, and dictionaries now use temporary writes, file-size verification, and atomic publication, preventing interrupted writes from leaving incomplete files.
- When upgrading from legacy JSON storage for the first time, the original data is backed up once to `backups/storage-v1/<timestamp>/` and verified before migration. This directory is a static migration snapshot, is not continuously updated, and is not the active data source.

### v2.3.1 (2026.9.23)

### Fixed

- Fixed QR-code login failures and slow loading with the production mini-program endpoint, which returns an image directly; the image URL is now loaded natively by the browser without an extra request or Base64 conversion.

### v2.3.0 (2026.9.23)

### Added

- Added search when importing books or moving them to a bookshelf group, making large group lists easier to navigate.
- Added reading-status dots to compact bookshelf view to distinguish unread, in-progress, and completed books by color.
- Added Tencent, Youdao, Volcengine, WeChat, and MyMemory translation engines. Volcengine and WeChat use the SiYuan network proxy and work on both desktop and mobile.
- PDF translation results can now be added directly as annotations, preserving the selected source text and writing the translation as a reply.
- Added a PDF annotation lock switch: after an annotation is completed, the toolbar either returns to hand-pan mode or keeps the selected annotation tool active.

### Improved

- Refined compact bookshelf layout with consistent group and book row heights, SiYuan-style hierarchy markers, and clearer status/progress alignment.
- PDF page-turn settings now use EmbedPDF's official `instant` and `smooth` APIs for consistent TOC, annotation, and adjacent-page behavior; redundant interception and custom scrolling logic were removed for more stable navigation.
- Shift-click resource links now use SiYuan's native logic to open in the system default application instead of being intercepted by SiReader.

### Fixed

- Fixed accidental drag-and-drop while swiping the bookshelf on mobile; mobile grouping now uses the book menu while desktop drag-and-drop remains available.
- Fixed blank EPUB readers and missing TOCs in some mobile WebViews by restoring the required Foliate group APIs and initialization/progress-restore order.
- Fixed errors from asynchronous saves running after a mobile plugin reload destroyed the plugin instance.
- Fixed EPUB image annotation field mapping so image descriptions are saved as notes without occupying the text field.
- Fixed cross-section EPUB footnotes that failed to open or displayed an entire chapter; standard `type="noteref"` / `type="rearnote"` structures are supported and popup height adapts to the footnote content.
- Fixed concurrent progress and annotation saves overwriting one another when multiple PDF readers were open in split view by serializing merged writes.
- Fixed PDF views being unloaded after a new tab was dragged into split view, which reset the page and hid annotations; the view is now rebuilt with reading state restored.
- Fixed text selection crossing columns in double-column PDFs.
- Fixed Microsoft translation returning the source text after an API failure and restored keyless translation.
- Fixed WeRead toolbar buttons remaining after they were disabled or being registered repeatedly when re-enabled.
- Fixed EPUB image browser behavior diverging from SiYuan's native interface by reusing its script version, toolbar, title, and preview behavior.

### Authorization and Membership

- Unified the short-path membership API to fix failures with legacy QR-code endpoints.
- Improved QR-code authorization and membership-entitlement synchronization.

### v2.2.8 (2026.9.13)

### Fixed

- Fixed the PDF annotation menu freeze caused by the missing `sireader:copy-annotation-link` command.
- Fixed PDF annotation backlinks failing for filenames containing reserved special characters.
- Fixed EPUB mouse selection not turning pages at the edge in paginated mode; cross-page selection now works without holding Shift.

### Added

- Added native SiYuan shortcuts for all PDF functions, with a `PDF` prefix in command names.

### v2.2.7 (2026.9.9)

### Fixed

- Fixed repeated plugin reloads and UI stalls caused by file-change notifications in newer SiYuan versions.
- Fixed unstable PDF engine loading by bundling the PDF core resources directly in the plugin.
- Fixed the continuous-scroll scrollbar position and restored the native scrollbar at the far right of the reading area.

### Added

- Added unified import, export, and deletion management for background images, fonts, and offline dictionaries.
- Added direct background image display, font style previews, and background image thumbnail previews.

### Improved

- Expanded continuous-scroll content to the available reading width, reducing unnecessary side margins.
- Improved continuous-scroll keyboard navigation with Foliate's native scrolling and page-turn behavior, retaining a small reading overlap.

### Note

- Word-count statistics are not added for now because the EPUB/PDF engines lack a low-cost raw word-count API, and full extraction could affect opening and reading performance.

### v2.2.6 (2026.7.29)

### Improved

- Optimized loading, section indexing, and persistence for EPUB books with large annotation datasets, preventing repeated full scans, redundant writes, and concurrent record overwrites from freezing SiYuan.
- Annotation saves now use dirty checks and single-pass batch merging, skip unchanged data, and serialize writes for the same book.

### Fixed

- Fixed long UI stalls caused by specific EPUB/JSON annotation data repeatedly triggering section calculation and persistence work.

### v2.2.5 (2026.7.28)

### Added

- Aligned EPUB page-turn styles with Readest/Foliate: Push, Slide, and Page Curl are now used directly, while continuous scroll remains Foliate-native.
- Added Feishu documentation sync notes and document index configuration for publishing README and changelog content to Feishu Wiki.
- EPUB highlights now follow the last color and style selected in the note panel instead of always using the default blue highlight.
- Quick highlights and automatic annotation sync now reuse the unified note insertion path and fall back to appending at the bottom when no document is bound.

### Fixed

- Fixed EPUB Auto (SiYuan) theme not following SiYuan dark-mode theme changes correctly and falling back to an overlay-like effect instead [#44](https://github.com/mm-o/siyuan-sireader/issues/44) [#45](https://github.com/mm-o/siyuan-sireader/issues/45).
[View full changelog](https://docs.745201.xyz/docs/changelog/sireader/)

## 📋 Complete Feature List

| Module | Feature | Description |
|--------|---------|-------------|
| **📚 Reading** | Format Support | EPUB/PDF/TXT/Online novels |
| | Themes | 8 preset themes (Default/Almond/Autumn/Green/Blue/Night/Dark/Gold) + Custom |
| | Reading Modes | Single/Double page/Continuous scroll |
| | Page Turn Style | Push/Slide/Page Curl; Continuous Scroll |
| | Open Mode | New tab/Right tab/Bottom tab/New window |
| | Navigation Position | Left/Right/Top/Bottom, Custom modules and sorting |
| | TOC Navigation | TOC/Bookmarks/Marks, Search chapters, Reverse, Jump |
| | Footnote Recognition | Auto-recognize footnotes/endnotes/references/terms, Click to popup |
| | Text Settings | Font/Size/Letter spacing/Line height/Paragraph spacing/Text indent |
| | Layout Settings | Horizontal margin/Vertical margin/Column gap/Header footer height/Max content width |
| | Visual Enhancement | Brightness/Contrast/Sepia/Saturation/Invert |
| | Reading Statistics | Session/Daily/Total time, Reading calendar, Book distribution, Favorite books, Rating distribution, Format distribution |
| | PDF Toolbar | Zoom/Rotate/Search/Print/First page/Last page, Floating/Fixed style, Opacity adjustment |
| | Bottom Toolbar | TOC/Previous/Next/Settings/Search |
| | Full-text Search | Search book content, Highlight results, Jump support |
| **🖊️ Annotation** | Colors | 7 colors (Red🔴Orange🟠Yellow🟡Green🟢Pink🩷Blue🔵Purple🟣) |
| | Styles | Highlight/Underline/Border/Wavy |
| | Quick Annotate | Select color and style in toolbar, Select text to annotate |
| | PDF Advanced | Ink annotation, Shape annotation (Rectangle/Circle/Triangle), Fill function |
| | Note System | Add detailed notes, Real-time editing, Add tags |
| | Bookmarks | Add/Remove bookmarks, Bookmark list management |
| | Line Notes | Add line-level notes to paragraphs |
| | Annotation Management | Filter by color/chapter, Sort by time/date/chapter, Delete annotations |
| | Quick Send | Configure quick document list (max 5), One-click send annotations |
| | Auto Sync | Auto-sync annotations to bound SiYuan documents (Add/Delete/Modify) |
| | Undo Annotation | Ctrl+Z to undo recent annotation |
| | Copy Settings | Custom link format, Variables: Title/Author/Chapter/Position/Link/Text/Note/Image |
| | Precise Location | Use CFI/Page number for precise positioning, Jump to original text |
| **🔊 TTS** | TTS Mode | Edge TTS (Online free), Local browser (Offline) |
| | Offline Voice Packs | Download and reuse local voice packs; browser WASM playback may currently be intermittent |
| | Multi-voice | Hundreds of online and local voices, Favorite commonly used voices |
| | Smart Playback | Loop selected text, Play from selected paragraph, Play from current page, Read selected text |
| | Precise Highlighting | PDF highlights current text precisely, EPUB auto-scrolls to current paragraph |
| | Playback Control | Pause/Resume, Fast forward/backward 10s, Auto page turn, Auto stop |
| | Voice Parameters | Speed/Volume/Pitch adjustment |
| | Playback Options | Auto play, Highlight reading text, Auto page turn |
| **📚 Bookshelf** | Group Management | Folder groups, Smart groups (Auto-filter by tags/format/status/rating) |
| | Sorting | Recent read/Added time/Reading progress/Rating/Duration/Title/Author/Recent update |
| | View Modes | Grid/List/Compact |
| | Multi-filter | Status/Rating/Format/Tags/Update status |
| | Book Management | Edit book info (Title/Author/Cover/Rating/Status/Tags), Remove books |
| | Document Binding | Bind SiYuan documents, Auto-sync annotations |
| | Batch Operations | Batch convert EPUB styles, Batch adjust width |
| | Interface Settings | Cover size adjustment (80-160px), Toolbar opacity adjustment |
| | Update Check | Check online book updates |
| | Add Books | Local files (EPUB/PDF/TXT), HTTP(S) links, Absolute/Relative paths |
| **🔍 Search** | Online Sources | Multi-source concurrent search, Built-in Anna's Archive/Project Gutenberg/Standard Ebooks |
| | Custom Sources | Support JSONPath/CSS/XPath/JavaScript/Regex |
| | Rule Combination | Support `&&`/`||`/`%%` combination, `{$.path}` nesting, `@put/@get` data sharing |
| | Source Management | Import/Export/Enable/Disable/Edit/Delete sources |
| | Format Filter | Filter search results by format |
| | Quick Add | One-click add search results to bookshelf |
| | Chapter Search | Search book chapter content |
| **📖 Dictionary** | Online Dictionaries | 7 sources (Cambridge/Youdao/Haici/Character/Phrase/Zdic/Bing) |
| | Offline Dictionary | Support StarDict and dictd formats |
| | Smart Recognition | Auto-select the most suitable dictionary |
| | Dictionary Management | Add/Delete offline dictionaries |
| **🌐 Translation** | Translation Services | Azure/Google/Yandex/AI Translation(Free)/AI Translation(SiYuan) |
| | Selected Translation | Translate selected text directly |
| | Translation Panel | Independent translation panel to display results |
| **⚙️ Others** | Authorization System | Trial/Monthly/Annual/Lifetime membership |
| | Shortcuts | Custom shortcuts (Previous/Next/Bookmark/PDF operations, etc.) |
| | Data Management | Managed book files, records, and settings storage |
| | Mobile Support | Support PDF reading (EPUB/TXT not supported yet) |

---

## 💎 Membership Features

### Feature Comparison

| Category | Feature | 🆓 Free | ⭐ Trial | 💎 Monthly | 👑 Annual | 🏆 Lifetime |
|----------|---------|---------|---------|-----------|----------|-----------|
| **📚 Reading** | Format Support | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Themes | Default | 8 + Custom | 8 + Custom | 8 + Custom | 8 + Custom |
| | Reading Modes | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Page Animation | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Text Settings | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Layout Settings | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Visual Enhancement | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Statistics | Simple | Full | Full | Full | Full |
| | TOC Navigation | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Footnote Recognition | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Full-text Search | ✓ | ✓ | ✓ | ✓ | ✓ |
| | PDF Toolbar | ✓ | ✓ | ✓ | ✓ | ✓ |
| **🖊️ Annotation** | Colors | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Styles | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Quick Annotate | - | - | - | ✓ | ✓ |
| | PDF Advanced | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Note System | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Bookmarks | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Line Notes | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Management | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Quick Send | - | - | - | ✓ | ✓ |
| | Auto-sync SiYuan | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Undo | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Custom Link Format | ✓ | ✓ | ✓ | ✓ | ✓ |
| **🔊 TTS** | TTS Function | - | ✓ | ✓ | ✓ | ✓ |
| | Online Voices | - | - | ✓ | ✓ | ✓ |
| | Local Voices | - | ✓ | ✓ | ✓ | ✓ |
| | Smart Playback | - | ✓ | ✓ | ✓ | ✓ |
| | Selected Text | - | ✓ | ✓ | ✓ | ✓ |
| | Precise Highlighting | - | ✓ | ✓ | ✓ | ✓ |
| | Playback Control | - | ✓ | ✓ | ✓ | ✓ |
| | Voice Parameters | - | ✓ | ✓ | ✓ | ✓ |
| **📚 Bookshelf** | Basic | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Folder Groups | - | ✓ | ✓ | ✓ | ✓ |
| | Smart Groups | - | - | ✓ | ✓ | ✓ |
| | Assets Sync | - | - | ✓ | ✓ | ✓ |
| | Sorting | ✓ | ✓ | ✓ | ✓ | ✓ |
| | View Modes | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Multi-filter | ✓ | ✓ | ✓ | ✓ | ✓ |
| | View Book Info | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Edit Book Info | - | ✓ | ✓ | ✓ | ✓ |
| | Document Binding | - | ✓ | ✓ | ✓ | ✓ |
| | Batch Operations | - | ✓ | ✓ | ✓ | ✓ |
| | Add Methods | Local files | Local/Link/Path | Local/Link/Path | Local/Link/Path | Local/Link/Path |
| **🔍 Search** | Online Sources | - | - | ✓ | ✓ | ✓ |
| | Custom Sources | - | - | ✓ | ✓ | ✓ |
| | Source Management | - | - | ✓ | ✓ | ✓ |
| | Format Filter | - | - | ✓ | ✓ | ✓ |
| | Chapter Search | - | - | ✓ | ✓ | ✓ |
| **📖 Dictionary** | Online | 2 (Youdao/Bing) | All 7 | All 7 | All 7 | All 7 |
| | Offline | - | ✓ | ✓ | ✓ | ✓ |
| | Smart Recognition | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Management | - | ✓ | ✓ | ✓ | ✓ |
| **🌐 Translation** | Services | - | ✓ | ✓ | ✓ | ✓ |
| | Selected Text | - | ✓ | ✓ | ✓ | ✓ |
| **⚙️ Others** | Custom Shortcuts | - | ✓ | ✓ | ✓ | ✓ |
| | Data Management | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Mobile Support | PDF | PDF | PDF | PDF | PDF |
| | Technical Support | Community | Community | Priority | Priority | Highest |
| | New Features | - | - | - | Priority | Highest Priority |
| | Updates | Free | Free | Free | Free | Lifetime Free |

### Membership Tiers

**🆓 Free** - Basic reading + Full annotation  
**⭐ Trial (7 days)** - Full features (except Quick annotate/Quick send/Online search)  
**💎 Monthly** - Full features (except Quick annotate/Quick send)  
**👑 Annual** - Full features + Quick annotate + Quick send + Priority support  
**🏆 Lifetime** - All features + Lifetime updates + Highest priority

---

## 💡 Tips

### Reading Tips
- **Theme Switch** - Use Default/Almond in daytime, Night/Dark at night
- **Shortcuts** - ← → for page turn, Space for page turn, PageUp/Down for page turn

### Annotation Tips
- **Color Classification** - Red for core concepts, Yellow for general points, Green for positive cases, Blue for supplementary, Purple for questions
- **Quick Annotate** - Select color in toolbar then select text to annotate, Ctrl+Z to undo

### Dictionary Tips
- **Quick Lookup** - Double-click to select and query
- **Offline Dictionary** - Download StarDict format dictionaries, Upload and use without network
- **Dictionary Sorting** - Adjust order in dictionary management, Prioritize frequently used dictionaries

### PDF Tips
- **PDF Shortcuts** - T for text selection, H for hand tool, I for ink annotation, S for shape annotation, Ctrl+wheel to zoom
- **Ink Annotation** - Suitable for handwritten notes and highlighting
- **Shape Annotation** - Rectangle selection, Circle marking, Triangle indication
- **Toolbar Drag** - Long press toolbar button to drag position

---

## ❓ FAQ

**Q: Can't open EPUB file?**  
A: Check if the file format is standard EPUB and not corrupted

**Q: A book from Siyuan Cloud fails with `File type not supported`?**  
A: That message comes from the EPUB parser and means the bytes are not a zip. SiReader self-heals in three steps: it prefers the `/d/` download route and falls back to the `/p/` preview route; if the response lacks `Content-Encoding` but starts with `1f 8b`, it decompresses it; and if the content still is not a valid EPUB/PDF, the error reports the byte size and file header so you can tell whether the file or the transfer is at fault. Also upgrade Siyuan Cloud to 0.8.3+, which pins `Accept-Encoding: identity` so upstream never gzips the file in the first place.

**Q: Annotations not saved?**  
A: Check if notebook or parent document is correctly configured in annotation settings

**Q: Dictionary not responding?**  
A: Check network connection, some dictionaries require internet

**Q: AI translation failed?**  
A: SiYuan AI requires OpenAI API configuration in Settings → AI, or use "AI Translation (Free)" option

**Q: Offline dictionary not working?**  
A: Ensure complete dictionary files (.ifo/.idx/.dict.dz or .index/.dict.dz) are uploaded and enabled in dictionary management

**Q: Theme switch not working?**  
A: Refresh reader page or reopen the file

**Q: PDF annotations misaligned?**  
A: Try rescaling or rotating the page, annotations will auto re-render

---

## 🙏 Acknowledgments

- [SiYuan](https://github.com/siyuan-note/siyuan) - Excellent plugin development framework
- [Foliate.js](https://github.com/johnfactotum/foliate-js) - Powerful EPUB rendering engine
- [PDF.js](https://github.com/mozilla/pdf.js) - Mozilla's PDF rendering engine

---

## 📄 License

Original SiReader code is licensed under [MIT](LICENSE). PDF reflow bundles AGPL components; combined distributions must comply with their licenses. See [third-party notices](THIRD_PARTY_NOTICES.md).

---

<div align="center">

**Development Philosophy**: Simple · Efficient · Elegant · Perfect

Made with ❤️ by SiReader Team

</div>
