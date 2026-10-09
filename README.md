<div align="center">

# 📖 SiReader

**Professional eBook Reader · Smart Annotation**

Transform SiYuan Notes into a professional eBook reader  
Professional eBook reader for EPUB/PDF/MOBI/TXT/online novels. PDFs support highlights, ink, shapes, forms, stamps, signatures, images, screenshots, search, printing, export, and backlinks, with annotation notes, dictionary, translation, themes, and bookshelf management.

[![Version](https://img.shields.io/badge/version-2.5.3-blue.svg)](https://github.com/your-repo/siyuan-sireader)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![SiYuan](https://img.shields.io/badge/SiYuan-3.0+-orange.svg)](https://github.com/siyuan-note/siyuan)

[🌐 Website](https://sireader.745201.xyz) · [📖 Documentation](https://my.feishu.cn/wiki/C3ULw8pM6iY2qgk3aGVc5eManZe) · Use the WeChat Mini Program “思源插件助手” to purchase · [👥 QQ Group](https://qm.qq.com/q/wpHDtsfxCw) · [📝 Changelog](https://my.feishu.cn/wiki/ZD81wv7fAiFnLckWWBycdmoTn7s)

</div>

---

## 📝 Latest Updates

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
[View full changelog](https://my.feishu.cn/wiki/ZD81wv7fAiFnLckWWBycdmoTn7s)

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
