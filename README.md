<div align="center">

# 📖 SiReader

**Professional eBook Reader · Smart Annotation**

Transform SiYuan Notes into a professional eBook reader  
Professional eBook reader for EPUB/PDF/MOBI/TXT/online novels. PDFs support highlights, ink, shapes, forms, stamps, signatures, images, screenshots, search, printing, export, and backlinks, with annotation notes, dictionary, translation, themes, and bookshelf management.

[![Version](https://img.shields.io/badge/version-2.2.2-blue.svg)](https://github.com/your-repo/siyuan-sireader)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![SiYuan](https://img.shields.io/badge/SiYuan-3.0+-orange.svg)](https://github.com/siyuan-note/siyuan)

[🌐 Website](https://sireader.745201.xyz) · [📖 Documentation](https://my.feishu.cn/wiki/Czp8wrf2NibwA9krhvmcHnbtnMc) · [💎 Purchase](https://pay.ldxp.cn/shop/J7MJJ8YR/lillyt) · [👥 QQ Group](https://qm.qq.com/q/wpHDtsfxCw) · [📝 Changelog](https://my.feishu.cn/wiki/XzefwHqz4inde7k7rJKce7shn8d)

</div>

---

## 📝 Latest Updates

### v2.2.2 (2026.7.25)

### Added

- Added a document-link import exclusion regex setting for filtering invoices, receipts, and other book links that should not be auto-added to the bookshelf.
- Added a lightweight bottom progress bar to the EPUB reader.

### Fixed

- Fixed EPUB reader reload, warning, reflow, and close-preview issues.
- Fixed `tree not found` when the notebook selected by "insert under notebook" had been deleted [#40](https://github.com/mm-o/siyuan-sireader/issues/40).
- Fixed multi-block template delete sync, deleted bound-document sync errors, PDF annotation sync, and shape annotation image sync [#39](https://github.com/mm-o/siyuan-sireader/issues/39).
- Fixed EPUB/PDF backlink characters breaking Markdown link parsing, and ensured copy only writes to the clipboard [#39](https://github.com/mm-o/siyuan-sireader/issues/39).

### v2.2.1 (2026.7.23)

### Added

- Added persistent default settings for PDF shape annotation tools, including color, line width, and related options.
- Added EPUB page layout settings for margins, column gap, header/footer, reading progress, current time, and progress style.

### Improved

- Improved restoring and saving default PDF shape annotation settings to reduce duplicate writes.
- Improved document book-link opening: SiReader now parses and adds the linked book to the bookshelf first, then falls back to temporary reading if import fails.
- Improved PDF core asset loading by bundling PDFium, the EmbedPDF runtime, and default stamps with the plugin to reduce open failures caused by network issues.

### Fixed

- Fixed PDFs sometimes reopening to a blank page. SiReader now initializes with a safe zoom state, then restores numeric zoom after layout is ready.
- Fixed slow opening and missing annotation-list pages in PDFs with many embedded annotations. SiReader now waits for native annotations to finish loading and only saves plugin-created annotations.
- Fixed some EPUB font-size settings not taking effect by applying the reader font size to common body elements.
- Fixed EPUB layout settings, header/footer, and two-column display issues under the newer foliate foundation, aligning margins, column gap, header/footer, and progress styles with Readest.
- Fixed SiYuan inserted-link parsing failures that prevented books from opening.
- Fixed garbled rendering in some legacy Chinese PDFs by using EmbedPDF/PDFium native font fallback.
- Fixed navigation bar display toggles not taking effect.

### v2.2.0 (2026.7.21)

### Added

- Added multi-select and folder import for SiYuan assets. Folder import automatically creates a bookshelf group with the same name and batch-categorizes imported books into it.
- Added EPUB image and table interactions: `img`, `svg image`, and `table` clicks are recognized; images can be copied, exported, and annotated, and tables can be copied and located by CFI.
- Added pitch, sentence-pause, and paragraph-pause controls to the TTS mini player.

### Improved

- Switched the EPUB/MOBI/AZW3 foundation to a pinned Readest foliate-js commit, reusing its pagination, footnote, TTS, and multi-format compatibility improvements first; PDFs still use EmbedPDF uniformly.
- Improved bookshelf batch parsing for EPUB/MOBI/AZW3 by reading metadata and covers directly, reducing slowdowns and errors caused by parsing when opening the view.
- Improved local-file, link, and SiYuan asset import flows. Covers are written sequentially with timeout fallbacks, reducing the chance of getting stuck on "importing".
- Improved bookshelf search so the home page includes books that have already been assigned to manual groups during search.
- EPUB footnote popups now render fragments through foliate-js `FootnoteHandler`, reducing handwritten DOM parsing and footnote misclassification.
- Improved EPUB footnote popup interactions with in-popup link following, return history, and duplicate backlink jump prevention.
- Added compatibility for `p.fnote` reverse-anchor footnote structures, improving recognition stability for special EPUBs such as Linguistics.
- Improved the EPUB image browser list by collecting images inside `svg image` and unifying the image/table menu lifecycle.
- EPUB TTS now uses the foliate-js TTS and `textWalker` flow, keeping sentence reading, highlighting, auto page turning, and footnote filtering aligned with the underlying reading order.
- Online Edge TTS now supports standard SSML wrapping and pitch control; local voice synchronization also supports pitch control.
- Improved the EPUB annotation popup by placing tag preset group titles on the same row as tags and using dashed boxes to make groups easier to identify.
- Improved EPUB annotation popup positioning and height limits so the save button remains clickable near the bottom of the page while keeping the popup closer to the selected annotation.
- Improved the visual style of the EPUB annotation popup with a pointer arrow, shadow, and internal scroll boundaries.
- Improved annotation-list jumps. EPUB now uses Readest-standard `goTo(cfi)`, parses the CFI after jumping, and flashes the target position; PDF jumps also select the corresponding annotation.
- Improved annotation previews. PDF previews reuse the EmbedPDF document source and public wasm, while EPUB context previews reuse the unified text extraction logic.
- Improved PDF loading. On first open, `pdfium.wasm` is downloaded from the official EmbedPDF `@embedpdf/pdfium@2.14.4` address into SiYuan `/data/public`; later workers read it directly from `/public/siyuan-sireader/embedpdf/pdfium.wasm`, avoiding blob paths and a larger plugin package.
- Improved PDF default stamp loading. Chinese and English default stamps are downloaded from official EmbedPDF default stamp addresses into `/data/public/siyuan-sireader/embedpdf/stamps` on first open, then loaded at runtime through the public manifest instead of being bundled.
- Improved EmbedPDF runtime loading. The official snippet JS is downloaded to `/data/public/siyuan-sireader/embedpdf/snippet` on first PDF open and then reused as public ESM.
- Improved EmbedPDF document-source creation and loading error display. PDF string URLs are loaded directly as URLs, while file sources are converted to buffers.

### Build and Dependencies

- Bumped the version to `2.2.0`.
- Removed bundled `pdfium.wasm`; the PDF engine now downloads it on first use and reuses the cached copy.
- Removed the `@embedpdf/default-stamps` dependency and bundled stamp assets; default stamps are now downloaded to public storage on first use and reused.
- Removed static bundling for the EmbedPDF viewer runtime, reducing the plugin zip from about 3.69 MB to about 550 KB.
- Removed the old `foliate-js@1.0.1` patch and extra workspace configuration; EPUB/MOBI/AZW3 support now comes from the pinned Readest foliate-js commit.
- Added a Foliate PDF stub during build to avoid pulling duplicate PDF logic into the EPUB foundation.
- Removed the old EmbedPDF worker bundling patch; the PDF viewer runtime now loads independently from the public snippet.

### Fixed

- Fixed some EPUBs opening without initial first-screen positioning or showing a blank reader because of abnormal CSS resource types.
- Fixed some EPUB footnotes not responding to clicks or being misidentified as image clicks.
- Fixed EPUB annotation popup edit mode not receiving localized text, causing tag, note, cancel, and save buttons to show English fallbacks.
- Fixed clicking EPUB annotations in the annotation list possibly opening an annotation card, and not highlighting the target position after jumping.
- Fixed PDF worker initialization failures leaving the page stuck on "Loading...".

### v2.1.4 (2026.7.18)

### Added

- Added a bottom PDF outline button, allowing the outline to be opened quickly from the bottom page controls.
- Added a bottom PDF top-toolbar toggle, making it easy to show or hide the top toolbar while reading.
- Added PDF outline positioning, automatically highlighting the current outline item while turning pages.
- Added one-click PDF annotation hiding on the annotation page for a cleaner original-document view.
- Added mobile PDF double-tap zoom, allowing the current page to be enlarged quickly in two-page reading.
- Added a bottom mobile PDF close button for smoother phone reading.

### Improved

- Improved PDF native annotation loading by waiting for EmbedPDF native annotations before filling in missing local items, avoiding duplicate imports of the same annotation batch during opening.
- Improved PDF annotation save triggering: the native annotation `loaded` event now only refreshes the list and no longer triggers full-document annotation export and write.
- Improved PDF annotation sidebar reading and rendering by preferring EmbedPDF's lightweight `getAnnotations()` and rendering large annotation sets in batches, reducing freezes from thousands of simultaneous cards.
- Improved PDF annotation tooltips and scroll pre-rendering by caching only annotations with notes/replies and reducing off-screen rendering pressure in high-density annotated documents.
- Greatly improved PDF opening speed, with smoother mobile loading and page turning.
- Improved bookshelf import: local import opens the file picker directly, and link import supports local paths, `file://`, remote direct links, and SiYuan links.
- Supported importing NAS direct links, with backlinks continuing to open and jump to the corresponding location.
- Local files can choose "Copy Import" or "Link Import"; remote links and SiYuan links only show "Link Import" to avoid confusion.
- The add window now closes automatically after successful import, and batch operations exit batch selection after success.
- PDFs now remember the last selected zoom mode, such as fit width or fit view, and reuse it on later opens.
- PDF opening now prioritizes native outlines/bookmarks for faster chapter navigation.
- PDF shape annotations can include region images when copying backlinks or quick-sending, reuse the template "image" variable, and generate shorter image resource names.

### Fixed

- Fixed backlinks from link-imported books failing to open, inaccurate PDF jumps, and hover previews missing surrounding context.

### v2.1.2 (2026.7.17)

### Added

- Added bookshelf import group presets, allowing books to be imported directly into a specified manual group.
- Added an all-library annotation page view: the sidebar now keeps the annotation entry visible, shows all-library annotations folded by book hierarchy when no book is open, loads annotations for each expanded book on demand, supports all-library search, filtering, time/date/chapter/page/name sorting, and reduces initial loading and folded-state sorting overhead with large annotation sets.
- Added PDF answer holes: creates black `Normal` blend-mode covers through EmbedPDF native highlight annotations, reveals content on hover, and can be deleted from the annotation outline.

### Improved

- Added PDF redaction/blackout usage notes: create pending redaction marks first, hover to preview the fill effect, then apply redaction after confirming the result.
- Improved bookshelf group management, supporting group order adjustment in the add-content and organize-bookshelf panels, with added hints for quick actions and group operations.

### Notes

- Cross-page PDF drag selection continuing after pointer release is a known upstream issue in EmbedPDF 2.14.4. See official issue [#668](https://github.com/embedpdf/embed-pdf-viewer/issues/668). EmbedPDF currently has no public API to end selection while keeping the selected range, so SiReader does not add outer event patches and will wait for an upstream fix or version update.
- PDF redaction/blackout follows EmbedPDF Redaction's two-step flow: first create pending redaction marks, then apply/commit to permanently remove content. Official references: [EmbedPDF Redaction Plugin](https://www.embedpdf.com/docs/react/headless/plugins/plugin-redaction) and [Adobe Acrobat redaction](https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/redact.html). "Hole/mask" for answer hiding is not destructive redaction; it is a removable black highlight annotation.
- The `Guest` name and avatar in the PDF comment sidebar come from EmbedPDF annotation comment UI's default author display, not from SiReader multi-user comments. EmbedPDF documents `annotation.annotationAuthor` for the default author name (see [EmbedPDF Annotation Plugin](https://www.embedpdf.com/docs/vue/viewer/plugins/plugin-annotation)), but it is not stable in the current SiReader viewer path, so no outer replacement is added for now.

### Fixed

- Fixed the outer PDF reader keyboard handler intercepting EmbedPDF native command shortcuts; PDF mode now lets EmbedPDF handle shortcuts itself.
- Fixed custom dark PDF themes not switching to dark page mode correctly; custom theme backgrounds now participate in EmbedPDF light/dark detection.
- Fixed missing bookshelf cover indexes causing some book covers not to display, and automatically backfills covers from existing complete records.
- Fixed local/remote import possibly getting stuck on "importing" when uploading book files and covers together, now writing through the SiYuan standard file API sequentially.
- Fixed books matched by smart group rules being hidden from the home page; smart groups no longer affect book ownership.
- Fixed the bookshelf context menu remaining visible after switching pages or opening overlays.

### v2.1.1 (2026.7.15)

### Added

- Added grouped annotation tag preset settings. Annotation tag editing now shows tags by preset group, and group titles can toggle the whole group with one click.
- Added bookshelf item visibility settings, allowing progress, status, rating, and last-read information to be hidden as needed.
- Added a WeRead top-bar button visibility switch, allowing the WeRead top-bar entry to be hidden from settings.
- Supports editing and deleting bookmarks in the annotation sidebar.
- Supports adding and removing bookmarks in PDF outlines.
- Supports automatically matching original reading data and annotation data after a removed book is imported again.
- Supports recognizing renamed local books by book fingerprint.
- Added "Import Annotations" to the PDF book context menu, supporting JSON, XFDF, Markdown, and TXT annotation export imports, compatible with text/JSON-like exports from common readers such as Zotero, BookxNote, Reeden, and Boox.

### Improved

- Improved ungrouped annotation tag collection. Newly saved non-preset tags are automatically appended to "Ungrouped" to avoid mixing them into other preset groups.
- Improved link-format and annotation-tag preset setting display, unifying them into a single-row setting structure and reducing overlap.
- Improved interface setting structure by reusing unified config item rendering for bookshelf and WeRead entry switches.
- Improved data matching after removed books are imported again, automatically restoring original reading data and annotation data.
- Improved permanent-delete confirmation text, clearly indicating that annotation data will be deleted.
- Improved PDF annotation migration by converting old data to the EmbedPDF standard annotation format.
- Improved PDF data storage by saving annotations, bookmarks, and reading progress together in each book's JSON data file.
- Improved legacy `.bin` data migration by cleaning old files after successful migration and retaining unsuccessful data for later compatibility fixes.
- Improved PDF annotation migration performance and stability, avoiding repeated migration on every open.
- Improved PDF search display by reusing EmbedPDF's native search layer to highlight matched content, avoiding misalignment and lag from custom search rendering.
- Improved PDF sidebar and comment panel theme mapping. Reader theme background and text colors now sync to the EmbedPDF UI, improving overly dark content in dark themes.
- Improved scrolling performance on the annotation page, bookshelf, online book search, TOC thumbnails, and WeRead lists by using browser-native offscreen rendering to reduce lag from large card lists.
- Improved bookshelf batch import. Large local files are no longer fully read ahead of time, and the import flow now uses lighter sequential writes to reduce lag and stuck "importing" states.
- Improved bookshelf import entry wording, unifying it as "Local Import" and "SiYuan Import". Local import includes file import and link import.
- Improved book removal semantics. "Remove" cleans plugin-managed book files and covers while preserving reading/annotation data; only "Delete Permanently" deletes reading/annotation data.
- Improved PDF annotation save compatibility by automatically filling missing or abnormal `rect`, `segmentRects`, `vertices`, `linePoints`, `inkList`, and other fields, avoiding annotation rendering crashes caused by old or abnormal data.

### Fixed

- Fixed PDF shape annotations possibly failing to save when `custom` is empty.
- Fixed EmbedPDF rendering errors caused by missing annotation array fields after adding PDF notes or importing old annotations.
- Fixed PDF built-in links being added to the annotation page as annotations.
- Fixed the template preset dropdown still showing "Select" after selecting a preset.
- Fixed copy template presets and hints still showing the deprecated "screenshot" variable, unifying them to the actually supported "image" variable.

### v2.0.0 (2026.7.13)

### Added

- PDF reader fully switched to EmbedPDF, using `@embedpdf/vue-pdf-viewer` and PDFium rendering as the only in-plugin PDF reading path.
- Supports opening local PDFs, bookshelf PDFs, document-link PDFs, and assets PDFs inside the plugin; the "Use Plugin PDF Reader" setting can switch between the plugin reader and SiYuan's native PDF tab.
- Supports continuous PDF reading, vertical/horizontal scrolling, single page, odd/even two-page layouts, previous/next page, and page-number jumping.
- Supports PDF zoom, marquee zoom, fit page, fit width, and fixed zoom levels including 25%, 50%, 100%, 125%, 150%, 200%, 400%, 800%, and 1600%.
- Supports PDF clockwise/counter-clockwise rotation, hand pan, pointer selection, fullscreen reading, and other EmbedPDF native reading tools.
- Supports PDF native outline/bookmarks and page thumbnails, shown in the SiReader sidebar with hierarchy preserved.
- Supports the PDF search sidebar with case-sensitive and whole-word search, page-grouped results, previous/next result navigation, and hit positioning.
- Supports PDF printing, download/export, and other EmbedPDF native document actions while respecting PDF document permissions.
- Supports PDF screenshots/area capture, including current PDF annotations, and copies the result to the clipboard as PNG.
- Supports PDF comment sidebar, annotation style sidebar, stamp sidebar, signature sidebar, permission view/protection dialogs, and other EmbedPDF native panels.
- Bundles `pdfium.wasm` and EmbedPDF default stamp assets with the plugin, so the PDF reader no longer depends on the old built-in PDF.js toolchain.
- Supports PDF text highlight, underline, strikeout, squiggly, insert text, replace text, comments, note pins, and callout annotations.
- Supports PDF note annotations with quote text, note content, tags, and bound document blocks.
- Supports PDF annotation colors compatible with SiReader colors: red, orange, yellow, green, cyan, blue, purple, brown, black, white, and transparent.
- Supports PDF annotation styling including color, opacity, blend mode, stroke width, stroke color, fill color, border style, font size, font, text color, background color, horizontal/vertical alignment, and line endings.
- Supports 16 PDF blend modes: Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, Exclusion, Hue, Saturation, Color, and Luminosity.
- Supports PDF ink and ink highlighter annotations with color, stroke width, opacity, and blend-mode adjustment.
- Supports PDF shape annotations including rectangle, circle, line, arrow, polygon, and polyline, with stroke, fill, width, border style, and opacity settings.
- Supports PDF text box/free text and callout annotations for inserting text notes directly onto PDF pages.
- Supports PDF stamp annotations, with EmbedPDF default stamp assets bundled in the plugin.
- Supports PDF signatures and initials, created by drawing, typing, or uploading, then placing them on PDF pages.
- Supports PDF image insertion through EmbedPDF image annotation capability.
- Supports PDF form filling and editing, including text fields, checkboxes, radio buttons, dropdowns, and list boxes, with readonly, required, multiline, comb, and multi-select properties.
- Compatible with PDF form-model controls including buttons, signature fields, and XFA text field/checkbox/dropdown/list box/button/signature/image field types.
- Supports PDF undo/redo, annotation selection, moving, resizing, rotation, grouping/ungrouping, and deletion.
- Supports PDF redaction tools for creating and applying redaction areas.
- Supports copying PDF annotation backlinks using `sireader://open?url=<bookUrl>&cfi=%23page-<page>&id=<annotationId>`.
- Supports opening the corresponding PDF and jumping to the annotation page from PDF backlinks.
- Supports dictionary lookup, translation, copy, and quick-send actions after selecting PDF text.
- Supports copying backlinks, dictionary lookup, translation, and quick-send from PDF annotation menus.
- Supports sending PDF selections or annotations to configured quick-send documents, with up to five valid quick-send documents shown in the PDF menu.
- Supports PDF screenshot copy to the clipboard while still keeping EmbedPDF's native download/export entry available.
- Added dedicated EmbedPDF storage at `records/embedpdf/<bookHash>.bin` for PDF annotations and reading progress.
- Added `docs/embedpdf.md` to document EmbedPDF integration, storage format, legacy migration, PDF backlinks, hover preview, menu actions, theme strategy, and maintenance constraints.

### Improved

- PDF annotations now save and restore directly through EmbedPDF `exportAnnotations()` / `importAnnotations()`, reducing offset and data-loss risk from intermediate format conversion.
- PDF annotation saving filters PDF-native link annotations and only stores user-created annotations, avoiding duplicate plugin records.
- On first old-PDF open, when the EmbedPDF record is empty, legacy `records/<bookHash>.json` highlights, ink, shape annotations, and reading progress are automatically migrated.
- Legacy PDF annotation migration keeps `id`, page, quote, note, tags, color, created/modified time, bound block, chapter, annotation geometry, and reading progress where possible, and reports the migrated count.
- PDF reading progress now saves EmbedPDF scroll state and restores the last reading position on reopen.
- PDF annotations are integrated into the unified SiReader annotation sidebar for viewing, editing, and deletion.
- PDF annotations are integrated into the unified annotation card, showing page, chapter, color, style, note, tags, and bound block.
- PDF annotation hover preview now follows EmbedPDF's actual rendered hit area and only shows quote/note content for annotations with notes or replies.
- PDF backlink hover preview in SiYuan documents supports opened PDFs, saved EmbedPDF annotations, and lazy page-scoped context extraction when the PDF is not open.
- PDF backlink hover preview now extracts and caches context by page, falls back by page when an old annotation id is stale, and no longer pre-parses the whole PDF.
- PDF quick-send now reuses EmbedPDF native menus and SiReader's shared send logic instead of maintaining a custom floating menu.
- PDF screenshot copy now reuses EmbedPDF capture state, closes SiReader side panels during capture, and adds a copy button to the capture result footer.
- PDF sidebar table of contents preserves the native EmbedPDF bookmark/outline hierarchy instead of flattening it.
- PDF dark-theme support is simplified to EmbedPDF UI theme mapping plus dark page inversion, reducing theme-filter impact on pages and annotations.
- PDF opening now reads an `ArrayBuffer` and passes it to EmbedPDF `documentManager.initialDocuments`, using local wasm/assets and `worker:false` in the SiYuan plugin runtime.
- Removed the old built-in PDF.js reader, PDF toolbar, and `src/core/pdf` compatibility layer; PDF behavior now belongs to EmbedPDF and SiReader's shared annotation components.

### Fixed

- Fixed old PDF reader cases where some PDFs could show blank pages, unstable rendering, or stuck loading.
- Fixed EmbedPDF possibly staying in loading forever when worker mode is enabled in the SiYuan plugin runtime.
- Fixed the old PDF theme approach possibly covering text with backgrounds, blurring pages, or making annotations inherit page filters.
- Fixed PDF annotations possibly having coordinate offsets, style loss, or incomplete content in the old storage conversion path.
- Fixed PDF-native link annotations being repeatedly saved into plugin annotation records.
- Fixed PDF backlink jumps incorrectly going through EPUB CFI navigation; `#page-N` now routes to EmbedPDF page navigation.
- Fixed plain highlights also showing the PDF note hover card; only annotations with notes or replies show hover preview now.
- Fixed PDF annotation hover preview possibly showing the wrong annotation because of distance guessing or selected-annotation fallback.
- Fixed the custom PDF quick-send floating menu having unstable hierarchy and state inside EmbedPDF selection menus.
- Fixed PDF screenshot copy being download-only and unable to write directly to the clipboard.

### v1.3.9 (2026.6.17)

### Added

- Added Ctrl/Cmd + Enter shortcut to save annotation notes, reducing manual clicks after editing.
- Added WeRead bookmark sync, statistics, and detail-page display; bookmarks can be clicked from book details to jump [#35](https://github.com/mm-o/siyuan-sireader/issues/35).
- Added WeRead popular-highlight public-thought loading and display entry, allowing direct viewing of public thoughts related to a single popular highlight.

### Improved

- Added an experimental PDF OCR entry that directly calls SiYuan OCR to recognize the current page.
- Improved reader bottom toolbar opacity logic so annotation mode, search panel, and quick annotation all consistently follow the opacity setting.
- Improved annotation note editor by returning to SiYuan's native multiline text field and removing redundant fallback and extra interactions.
- Improved membership authorization cache logic for server, mobile, and browser clients by using persistent authorization snapshots and low-frequency remote validation, reducing dependence on local crypto capability and remote verification frequency.
- Improved WeRead bookshelf, notes, and book-detail data merging so the same book consistently shows highlights, thoughts, bookmarks, progress, and bookshelf status.
- Improved overall WeRead layout with full-width responsive multi-column lists, entering the split detail view only after selecting a book.
- Improved WeRead bookshelf list view to align with the local bookshelf list in cover ratio, information hierarchy, tag colors, hover buttons, and compact layout.
- Improved WeRead book detail page with more complete cover, title, rating, category, publisher, publication information, and reading-data display.
- Improved WeRead table-of-contents tree to align with the local bookshelf tree structure, restoring indent guides, separated rows, expand/collapse, and prevention of SiYuan document-tree recognition.
- Improved scrolling for WeRead table of contents, bookmarks, highlights, and other detail content so the detail area can scroll as a whole, reducing content being constrained near the bottom.
- Improved WeRead page tooltip direction so tooltips consistently expand left and avoid being blocked by the right edge.

### Fixed

- Fixed server web client opening PDFs unable to directly select text until switching to the hand tool and back to text selection.
- Fixed web client icons and some UI occasionally disappearing until refresh.
- Fixed bookshelf possibly being empty on first open after SiYuan sync, or becoming empty again after browser refresh.
- Fixed search results being visible when binding bookshelf documents but possibly not selectable after clicking.
- Fixed mobile client being unable to open EPUB.
- Fixed annotation note box paste possibly closing the window.
- Fixed WeRead reading progress not being remembered; opening WeRead web reading now prioritizes jumping to saved progress.
- Fixed WeRead popular-highlight public thoughts showing as loaded but not visible on the page.
- Fixed being unable to return to the table of contents after loading WeRead chapter highlight popularity.

### v1.3.8 (2026.6.10)

### Fixed

- Fixed default translation engine dropdown items not using internationalized labels, causing option text to be empty and the dropdown list to look blank.

### v1.3.7 (2026.6.10)

### Added

- Added a text-selection translation switch, supporting automatic translation panel popup after selecting text.
- Added a fixed translation engine setting to remember the commonly used translation service and avoid manual switching each time.
- Added a public online page-script API, supporting independent script injection into web reading pages through SiYuan JS snippets, with top-bar buttons, menus, commands, styles, and persistent configuration.
- Added an independent WeRead classic reader script example, allowing external JS snippets to control background color, wide-screen display, immersive reading, auto reading, idle mode, spacebar page turning, screen wake lock, footer buttons, scrollbars, and related effects.

### Improved

- Improved text-selection translation timing so translation starts after selection ends, reducing repeated requests while text is still being selected.
- Improved bookshelf list view so ratings can now be shown directly in book rows like the "finished" status.
- Improved annotation hover-card note input by switching to multiline input and reducing focus and key conflicts.
- Improved WeRead search-result details by completing rating, category, publisher, publish time, table of contents, highlights, thoughts, and related information.
- Unified WeRead search page, WeRead page, and bookshelf opening logic, reusing the same reading links, table of contents, and note context.
- Moved online reading page web-enhancement capability to the public API, leaving concrete site features and styles entirely to independent JS scripts for easier user DIY.
- Improved WeRead book-detail table of contents with a tree structure that supports expand, collapse, full scrolling, and chapter jumping.
- Improved mobile settings panel navigation by hiding the WeRead icon entry that does not need to appear in settings.

### Fixed

- Fixed left/right keyboard page turning failing after switching tabs, clearing search, or refreshing the interface.
- Fixed PDF reading progress possibly being incorrectly saved as 100% when exiting before finishing.
- Fixed plugin update or sync causing duplicate `foliate-view` registration and preventing the plugin from loading.
- Fixed sidebar icons possibly disappearing after sync.
- Fixed WeRead search results possibly opening as 404 when opened directly from the search page.
- Fixed the WeRead API Key test success message continuing to display below the page; it now uses an immediate notification instead.
- Fixed a SiYuan v3.6.5 compatibility issue where creating child note documents could report `Field [notebook] is required`.

### v1.3.6 (2026.6.7)

### Added

- Added Qingtian book-source web reading support, so online books can open directly in the SiReader reading tab without downloading them as local files.
- Added WeRead Agent API integration, allowing an API Key to sync WeRead bookshelves, search results, notes, reading statistics, and recommended books.
- Added WeRead web reading support, opening books in the SiReader online reading tab while reusing the reader table of contents and annotation sidebar.
- Added WeRead table-of-contents support for chapter structure, chapter word count, and chapter popularity, with jumps to the corresponding web chapter.
- Added WeRead annotation page support for my highlights, my thoughts, public thoughts, popular highlights, and public thoughts under popular highlights.
- WeRead books can now be added to the SiReader bookshelf, with added status recognized in the bookshelf, search results, and note lists.
- WeRead table-of-contents and annotation export links now use universal web links, opening directly in browsers while being intercepted inside SiReader documents to reuse the online reading tab.
- Added a WeRead entry and dedicated icon, with support for opening the WeRead management page from the top bar.

### Improved

- Improved online reading tab opening logic so Qingtian and WeRead web reading prefer activating an already-open tab instead of opening duplicates.
- Improved the WeRead API Key setup flow so clicking test completes validation and saving, with a help entry for getting an API Key.
- Improved WeRead page layout and dark-mode adaptation, with compact statistics and colors following the SiYuan theme.
- Improved WeRead table-of-contents, annotation, and copy flows by reusing existing local-book TOC, annotation, copy, and jump logic.
- WeRead annotation copy now writes to the clipboard by default, avoiding influence from the global "insert into current document" setting.
- Improved reader event handling to reduce stutter while dragging the sidebar.
- Improved response speed after deleting annotations with shortcuts, reducing long waits caused by delete operations.
- Split card packs, flashcard study, Anki import, and FSRS-related capabilities into the standalone Sideck plugin, removing the corresponding startup links and dedicated dependencies from the main reader plugin to reduce startup load.

### Fixed

- Fixed books being unable to move out of the bookshelf in tree view and missing a secondary confirmation entry.
- Fixed PDF shape annotation shortcuts possibly causing SiYuan to freeze or crash.
- Fixed SiPan book imports saving temporary addresses such as `127.0.0.1:61102`, which stopped opening after port changes; SiPan relative links are now saved and old imported links remain compatible.
- Fixed EPUB continuous-scroll mode not mounting previous and next chapters after switching modes, preventing smooth continuation between chapters.
- Fixed WeRead table-of-contents and annotation links in documents possibly reporting that the book does not exist, opening the browser, or opening duplicate tabs.
- Fixed the WeRead annotation page incorrectly showing Mark Context previews.
- Fixed WeRead web reading tab cleanup not destroying the table of contents and annotation sidebar in sync with local-book logic after closing.

### v1.3.5 (2026.6.4)

### Added

- Added a TTS background playback mini panel with voice, speed, auto page-turning, read-aloud highlight, pause, stop, previous paragraph, and next paragraph controls.
- Added an EPUB "Start Reading" animation switch, disabled by default to avoid extra loading work when opening books.
- Added one-click chapter copy from the table of contents for easier excerpting and organization.
- Added hover previews for book annotation links in documents, showing the original context including the annotated sentence and adjacent previous and next sentences, with on-demand preview loading when the book is not open.

### Improved

- PDF reader no longer shows the "Start Reading" animation and opens directly into content.
- Improved the TXT reading path with a new lightweight TXT parser, opening directly in the reader without converting to EPUB, improving open speed and reducing compatibility issues from format conversion.
- Improved annotation popup action tooltip placement so it expands leftward and avoids top-edge clipping.

### Fixed

- Fixed EPUB left/right keyboard page turning possibly failing after switching tabs, clearing search, or refreshing the view, unifying the page-turning entry for keyboard, mouse wheel, and mouse side buttons [#33](https://github.com/mm-o/siyuan-sireader/issues/33).
- Fixed the bottom search toolbar disappearing when clicking the reading body, and fixed the popped-up search bar still being affected by toolbar opacity [#32](https://github.com/mm-o/siyuan-sireader/issues/32).
- Fixed some EPUB built-in images or background images being covered by reader container and page backgrounds, causing incomplete display [#28](https://github.com/mm-o/siyuan-sireader/issues/28).
- Fixed some large scanned PDFs opening to blank pages, improving rendering compatibility for national-standard and specification-style PDFs.
- Fixed cloud-drive books being downloaded unexpectedly when added, keeping cloud-drive books added and read online as expected.
- Fixed the "Add custom book source" button being misaligned.
- Fixed bound-document auto-sync reverting book names to "Reading", now preferring the latest modified book name from the bookshelf.

### v1.3.1 (2026.6.2)

**Added**

- Added SiPan file-link import, and SiPan folder links can be added directly as bookshelf groups.
- Added reading and annotation support for cloud-drive files to reduce local storage usage.
- **Added private book-source search, add, and download entry for Z-Library (Easter egg).**
- Added batch organization after batch import.
- Added shortcut commands for PDF text selection, hand, ink annotation, and shape annotation tools, with in-reader T/H/I/S quick switching.

**Improved**

- Improved batch operation flow to reduce repeated clicks and duplicate processing.
- Improved the "Start Reading" animation trigger and wording, so it no longer repeats for books with progress or repeated opens in the same session.
- Kept the page navigation toolbar visible while the "Start Reading" animation is shown.
- PDF reading now always uses continuous scrolling and is no longer affected by single-page or double-page layout settings.
- PDF supports Ctrl + mouse wheel zooming.
- Removed the "fit page" zoom entry from the PDF toolbar; legacy settings fall back to fit width.
- Improved PDF shape annotation screenshot clarity for clearer inserted images.

**Fixed**

- Fixed the missing logout button on the membership card.
- Fixed PDFs with mixed portrait and landscape pages possibly freezing on landscape pages.
- Fixed bookshelf search in grid view, list view, and groups.
- Fixed bound-document search results showing but not being selectable.

### v1.3.0 (2026.5.23)

**Added**

- EPUB image copy/export and annotation browsing.
- Font weight controls for finer reading-text tuning.
- Custom reading background image selection.
- Header and footer display with chapter title, reading progress, and overall progress.
- Annotation tags with add/edit support in both the reader popup and annotation panel.
- Annotation tag filtering with multi-tag combinations and reuse of existing tags.
- Batch note import with block-ID binding detection.
- Open note documents from floating block windows, with automatic note creation and binding.
- Global "sync on add" and "sync on delete" settings, no longer tied to per-book configuration.
- Bilingual offline dictionary usage notes.

**Improved**

- Default startup now opens the bookshelf view.
- More compact settings layout with a more unified look.
- Clearer settings icons and visual hierarchy.
- Faster font and voice loading in settings, reducing wait time when opening settings.
- Faster font application in the reader, so font switching feels more immediate.
- Faster book loading and opening, including Docker environments.
- Removed settings preview so changes can be reviewed directly in the reader, reducing duplicated UI and maintenance cost.
- Offline dictionary import and lookup now use clearer file/folder selection, with multiple dictionaries shown separately.
- Better offline dictionary names and definitions, with simplified/traditional Chinese matching.
- Faster offline dictionary loading with the new storage location.
- Refactored annotation cards and panels for a unified presentation and editing experience across the reader popup, sidebar list, and PDF annotations.
- Unified PDF text, shape, and ink annotation logic, with shapes and ink also using the same annotation card for viewing and editing.
- Improved PDF text-box annotation display and export to fit text content and avoid oversized regions.
- Improved PDF ink annotation interaction so continuous writing merges into a single ink annotation, with unified display and export.
- Improved PDF toolbar and annotation saving logic to reduce flicker and page jumping after annotations.
- Unified table-of-contents styling in the reader and added the ability to show reading settings inside the TOC area.
- Improved continuous-scroll rendering for a cleaner reading state.
- Improved the readable translation logic for `sireader://open` links.
- Improved import-page grouping style, bookshelf cover four-grid layout, label stacking in list view, and element tooltips.
- Improved group navigation interaction to reduce switching flicker.

**Fixed**

- Fixed missing chapter anchors when copying exported outlines.
- Fixed low-contrast dark-mode titles in some places.
- Fixed occasional blank bookshelf sidebar after sync.
- Fixed custom reading backgrounds not applying.
- Fixed some offline dictionaries importing successfully but failing on lookup.
- Fixed incorrect offline dictionary names and result display.
- Fixed PDF text selection offset, half-character selection, and misselection of blank areas.
- Fixed unstable toolbar visibility on the reading page.
- Fixed invalid reading-layout settings.
- Fixed repeated note insertion when a quick-annotation selection area was not cleared.
- Fixed quick-annotation drops landing before drag end.
- Fixed local book-link import failures.
- Fixed confirmation issues when deleting books in tree view.

### v1.2.5 (2026.5.17)

**Added**

- Added mouse wheel page turning.
- Added mouse side-button page turning.

**Improved**

- Refactored the table-of-contents style and interaction for a smoother, more consistent experience.
- Refactored the settings page styling for a more compact layout.

**Fixed**

- Fixed note-insert search results not appearing.
- Fixed EPUB content collapsing into a single line in continuous-scroll mode.
- Fixed continuous-scroll mode failing to turn to the next chapter.

### v1.2.2 (2026.5.12)

**Added**

- Added a tree view for the bookshelf with expand/collapse support.
- Added drag-and-drop grouping for books, including moving books out of groups.
- Added a first-open "Start Reading" welcome effect for newly opened books.
- Added quick annotation-type switches for All, Highlights, Notes, and Bookmarks.
- Added a standalone annotation panel for centralized review and management.

**Improved**

- Improved the overall interaction across the three bookshelf views and refactored the related structure.
- Improved batch import flow and presentation so the import process is clearer.
- Improved bookshelf cover rendering stability and performance.
- Improved smart-grouping conditions to make organization easier.
- Improved the PDF toolbar layout and styling for a more compact, consistent UI.
- Refactored popup structures for bookshelf, search, and annotations to unify interaction patterns.
- Refactored the table of contents and annotation panel structure with clearer responsibility boundaries.
- Refactored annotation filtering to support type filters, combined filters, and sorting.
- Merged bookmarks into the annotation system for unified display and filtering across highlights, notes, and bookmarks.
- Added filtering support for text highlights, notes, bookmarks, ink, shapes, and other annotation types.
- Improved annotation card styling and interaction feedback for a cleaner interface.
- Improved the settings page and related UI structure for better stability.
- Improved book opening and reader-view mounting to reduce initialization coupling.
- Improved import, book storage, and migration code structure for better version compatibility.
- Added full mobile support, including both tap-to-turn and swipe page turning.
- Added full feature support for Docker deployments.

**Fixed**

- Fixed a shortcut conflict between PDF printing and SiYuan global search.
- Fixed an intermittent blank screen when opening a book for the first time.
- Fixed incorrect progress display caused by PDF reading-progress save failures.
- Fixed incomplete background rendering after resizing the EPUB reading window.
- Fixed misplaced toolbar positioning after selecting text in PDF.
- Fixed the repeated display of the "Start Reading" effect for books that already had reading progress.
- Fixed the mobile-side reading open event chain to improve entry stability.
- Fixed compatibility issues in some book import, storage, and migration scenarios.

---

### v1.1.3 (2026.4.30)

**Fixed**

- Fixed incorrect membership checks during book import.

**Added**

- Added a migration progress dialog to make the data migration process more visible.

---

### v1.1.2 (2026.4.28)

**Fixed**

- Fixed an issue where some migrated books could not be opened because of file naming.
- Fixed cover and book file loading failures after unified managed-file renaming.
- Fixed "New Tab" still opening on the right side.

**Added**

- Added pre-import parsing so books can be previewed before import.
- Added book link import.
- Added local file import as links.

**Improved**

- Reused parsed metadata during import to avoid duplicate parsing and speed up batch import.
- Unified open-position logic so all open behaviors follow the same setting.
- Simplified reader-tab opening logic and reused the same entry for bookshelf, document links, and external calls.

---

### v1.1.0 (2026.4.28)

**Highlights**

- Reworked the data read/write and storage pipeline to reduce overhead and improve overall responsiveness.
- Migrated books and covers into the `public` directory for a cleaner structure and more stable asset access.
- Bookshelf PDFs can now be opened directly with SiYuan's built-in PDF viewer, consistent with the related setting.

**Added**

- Open books directly from database resource fields.
- One-click expand/collapse for the table of contents.
- Quick export from table of contents to notes.
- Export the table of contents to a document and open it directly.
- More flexible note insertion targets: current document, notebook, child document, or `Daily Note`.
- Full-text search for annotations, including chapters, titles, body text, and note content.
- Annotation grouping by page number.
- One-click expand/collapse for annotation groups.
- Custom annotation sorting with drag-and-drop reordering.
- Text annotations for PDF.
- Annotation type filters for PDF, including ink and shape annotations.
- Drag-and-drop repositioning for PDF annotations.

**Improved**

- Preserved table-of-contents expansion state more reliably when switching views.
- Improved cross-page annotation behavior.
- Persisted PDF toolbar settings.
- Improved PDF annotation rerendering when pages change.
- Reduced PDF rendering flicker.
- Improved annotation position binding after window resize and page zoom changes.

**Changed**

- Removed automatic rating when importing books.

---

### v0.9.2 (2026.3.12)

**✨ New Features**

- **🔄 License Recovery** - Authorized accounts can quickly activate without re-entering activation code, just click "Recover License"

**📚 Drag & Drop Operations**
- **Drag to Add** - Drag files directly to bookshelf to add books, supports batch import
- **Drag to Group** - Drag books to group folders for quick organization
- **Visual Feedback** - Highlight display during dragging, intuitive and smooth operation

**🐛 Bug Fixes**

- **✅ Bookmark Operation** - Fixed bookmark toggle issue when clicking again (TOC and bottom toolbar)
- **✅ Keyboard Shortcut Conflict** - Fixed keyboard shortcuts triggering simultaneously in split-screen readers
- **✅ TXT Import** - Fixed slow TXT import conversion failure issue
- **✅ Progress Save** - Fixed progress save failure when opening multiple books
- **✅ PDF Color** - Fixed PDF color illustrations not displaying colors issue [#22](https://github.com/mm-o/siyuan-sireader/issues/22)
- **✅ Memory Leak** - Fixed potential memory leak from frequent database read/write operations with multiple books
- **✅ Annotation Display** - Fixed annotation content truncation issue when content is too long [#20](https://github.com/mm-o/siyuan-sireader/issues/20)

**⚙️ Improvements**

- **📚 Batch Import** - Optimized batch import logic methods to improve import efficiency
- **🔤 Encoding Detection** - Improved TXT encoding detection for better accuracy
- **📖 Status Logic** - Manual "finished" status won't be overridden by progress updates
- **🎨 License Interface** - Unified license panel layout and styling for better user experience

---

### v0.9.1 (2026.3.8)

**🎊 Membership System Launch**
- Website: [sireader.745201.xyz](https://sireader.745201.xyz)
- Authorization: Trial (7 days)/Monthly/Annual/Lifetime membership
- Online Activation: Enter activation code to activate, view status and remaining days
- Feature Tiers: Different features based on membership level
- **🎁 Limited Time Offer**: Lifetime membership ~~¥128~~ **¥108** (Until May 5th)

**🐛 Bug Fixes**
- Fixed bookshelf initialization failure due to lax file validation during database loading
- Fixed PDF text selection drift when dragging to annotated areas
- Fixed PDF cross-page text selection drift in blank areas

**⚙️ Improvements**
- Optimized reading control bar search and annotation menu display
- Search and annotation popups are mutually exclusive to avoid overlap
- Toolbar and secondary menu share opacity settings with responsive updates

---

## 📋 Complete Feature List

| Module | Feature | Description |
|--------|---------|-------------|
| **📚 Reading** | Format Support | EPUB/PDF/TXT/Online novels |
| | Themes | 8 preset themes (Default/Almond/Autumn/Green/Blue/Night/Dark/Gold) + Custom |
| | Reading Modes | Single/Double page/Continuous scroll |
| | Page Animation | Slide/Scroll/None |
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
| | Copy Settings | Custom link format, Variables: Title/Author/Chapter/Position/Link/Text/Note/Screenshot |
| | Precise Location | Use CFI/Page number for precise positioning, Jump to original text |
| **🔊 TTS** | TTS Mode | Edge TTS (Online free), Local browser (Offline) |
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

This project is licensed under the [MIT](LICENSE) License

---

<div align="center">

**Development Philosophy**: Simple · Efficient · Elegant · Perfect

Made with ❤️ by SiReader Team

</div>
