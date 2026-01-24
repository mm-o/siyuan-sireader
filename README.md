<div class="sy__outline" style="max-width: 900px; margin: 0 auto;">
<div style="text-align: center; padding: 2.5em 1.5em; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); margin-bottom: 2em;">
<h1 style="color: white; margin: 0 0 0.3em; font-size: 2.5em; font-weight: 600;">📖 SiReader</h1>
<p style="color: rgba(255,255,255,0.9); margin: 0 0 1.5em; font-size: 1.1em;">Professional eBook Reader · Smart Annotation · Multi-format Support</p>
<p style="color: rgba(255,255,255,0.85); margin: 0 0 1.5em; line-height: 1.6; font-size: 0.95em;">Transform SiYuan Notes into a professional eBook reader<br>Support EPUB/PDF/TXT/Online novels with smart annotation, multi-theme switching, dictionary lookup, AI translation, deck system, and more for an immersive reading experience</p>
<p style="margin: 0;">
<img src="https://img.shields.io/badge/version-0.7.2-blue.svg" alt="Version" style="display: inline-block; margin: 0 4px;">
<img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" style="display: inline-block; margin: 0 4px;">
<img src="https://img.shields.io/badge/SiYuan-3.0+-orange.svg" alt="SiYuan" style="display: inline-block; margin: 0 4px;">
</p>
</div>
</div>

---

## ✨ Core Features

### 📚 Multi-format Support
- **EPUB** - Full support with smart TOC and footnote recognition
- **PDF** - Professional reader with zoom, rotation, and search
- **TXT** - Smart encoding detection and chapter recognition
- **Online Novels** - Multi-source search with real-time updates

### 🎨 Reading Experience
- **8 Themes** - Default, Almond, Autumn, Green, Blue, Night, Dark, Gold
- **Custom Themes** - Fully customizable text color, background, and images
- **Reading Modes** - Single/double page, scroll/flip, left/right TOC
- **Appearance Settings** - Font, size, spacing, margins, visual filters

### 🖊️ Smart Annotation
- **7 Colors** - Red🔴Orange🟠Yellow🟡Green🟢Pink🩷Blue🔵Purple🟣, 4 styles (highlight/underline/border/wavy)
- **PDF Advanced** - Ink annotation, shape annotation (rectangle/circle/triangle), fill function
- **Note System** - Add detailed notes to annotations with real-time editing
- **Precise Location** - Use CFI/page number for accurate positioning

### 📖 Dictionary
- **7 Sources** - Cambridge, Youdao, Haici, Chinese Character, Phrase, Zdic, Bing
- **Smart Recognition** - Auto-select the most suitable dictionary
- **Deck System** - Add words to deck for review

### 🔍 Book Source
- **Multi-source** - Custom book sources with concurrent search
- **Smart Parsing** - Full support for JSONPath, CSS, XPath, JavaScript, Regex
- **Rule Combination** - Support `&&`/`||`/`%%` combination, `{$.path}` nesting, `@put/@get` data sharing

---

## 🚀 Quick Start

### Installation
1. Open SiYuan → `Settings` → `Marketplace` → `Plugins`
2. Search "SiReader"
3. Click install and enable

### Usage
- **Local Files** - Click "Add Book" button in bookshelf, select EPUB/PDF/TXT files to import
- **Online Novels** - Click toolbar search button, search and add to bookshelf
- **Bookshelf** - Click toolbar bookshelf button to manage all books

---

## 📝 Latest Updates

### v0.7.2 (2026.1.24)

#### ✨ New Features
- **📚 Bookshelf Cover Size** - New bookshelf cover size setting (80-160px), support dynamic adjustment for 3 or 4 covers per row
- **📄 Open Document Assets** - Support opening book links directly from document assets folder, auto-extract metadata and add to bookshelf on first click, open directly on subsequent clicks
- **💾 Interface State Persistence** - Auto-save and restore reading interface state
  - Annotation filters: color filter, sort method (time/date/chapter)
  - TOC state: normal/reverse order
  - Note filters: all filter conditions
  - Auto-restore last filter state when switching books or reopening
- **🔄 Batch Sync Annotations** - New "Sync All" feature, one-click import all unsynced annotations to bound document
  - Refresh button added next to "Sync on Add" option
  - Smart detection of imported annotations to avoid duplicates
  - Auto-handle deleted blocks, re-import and update association if block deleted in document
- **🔄 Bidirectional Annotation Sync** - Auto-sync updates to bound document after editing annotation content in annotation panel or reading interface
  - Auto-locate all blocks containing the annotation
  - Auto-update block content to keep annotation and document consistent
  - Unified handling of all types including highlights and shapes
- **🎨 PDF Shape Annotation Enhancement** - Complete PDF shape annotation feature, unified to auto-sync logic
  - Auto-sync to bound document on add
  - Include complete chapter path information
  - Support block association and bidirectional sync
  - Fully consistent with highlight annotation logic

#### ⚡ Performance Optimization
- **📑 TOC Performance** - Optimize TOC interaction experience with 10-second cooldown mechanism, lazy-load bookmark buttons, delayed rendering
- **🔧 Code Refactor** - Unify book opening logic, eliminate duplicate code, enhance maintainability
- **🚀 Annotation Detection** - Use database queries instead of cache solution, real-time accurate, better performance
- **🎯 Logic Unification** - Comprehensive review of annotation copy and sync logic, unified method calls, optimized code structure, improved performance and stability
- **💾 State Management** - Unified state loading and saving logic, removed duplicate code, simplified function calls

#### 🐛 Bug Fixes
- **🖼️ PDF Thumbnail** - Fix PDF thumbnail not displaying, proactively load unrendered pages, use compression to reduce data, add complete error handling
- **📖 Chapter Path Integrity** - Fix annotation only showing current chapter name, now shows complete hierarchical path (e.g., `Volume 1 - Five-character Ancient Poetry - Drinking Alone Under the Moon`)
  - PDF: Convert flat TOC to structure with complete paths, traverse forward to build ancestor chain
  - EPUB/TXT: Recursively search TOC tree, build complete path through link matching
- **📋 Custom Link Format** - Fix copy, export, auto-export annotations not using custom link format
- **🔗 Shape Annotation Block Association** - Fix shape annotation still showing import button after auto-import
- **🔄 TOC Reverse Function** - Fix TOC normal/reverse order button not working, now supports TOC reverse display
- **⬆️ Scroll Button** - Fix scroll button logic, intelligently switch to top/bottom based on current position
- **🔗 Unbind Document Interaction** - Optimize unbind document button position and interaction, add confirmation to prevent accidental clicks

---

### v0.7.1 (2026.1.22)

#### ✨ New Features
- **🎨 Follow SiYuan Theme** - New "Follow SiYuan" theme option, auto-adapt to SiYuan's light/dark theme and custom themes
- **🌓 Auto Theme Switch** - Reader theme automatically syncs when switching SiYuan theme, perfectly integrated into SiYuan interface
- **📝 Popnote Enhancement** - Support various non-standard EPUB popnote formats (footnotes/endnotes/references, etc.)
- **🎯 Popnote Jump** - Click popnote title bar to jump to original text position
- **📋 Content Copy** - Popnote content area supports text selection and copying
- **🌐 Internationalization** - Popnote types and prompt text support Chinese/English switching
- **🛠️ PDF Toolbar Style** - New toolbar style settings, support floating (default) and fixed modes
  - Floating mode: Draggable rounded card in top-right corner, collapsible
  - Fixed mode: Top-fixed WPS-style toolbar, horizontal layout, always expanded

#### 🎨 UI Optimization
- **🎨 Popnote Style** - Optimize popnote popup style, clickable title bar, selectable content area
- **💡 Interaction Hint** - Title bar shows "(Click to jump)" hint, pointer cursor on hover
- **🔍 PDF Zoom** - Remove PDF 500% max zoom limit, support unlimited zoom
- **📑 Group Optimization** - After grouping annotations by chapter or date, redundant chapter and date info no longer shown within groups
- **✏️ Note Editing** - Optimize note interaction, click note area to enter edit directly, click annotation text to jump and locate
- **🛠️ Toolbar Optimization** - Fixed mode toolbar occupies full width, no rounded corners, light shadow, content area auto-reserves space
- **📚 Book Source Management** - Delete confirmation uses inline UI, remove dialogs, more concise and efficient interaction

#### 🐛 Bug Fixes
- **🌙 PDF Dark Mode** - Fix incorrect text color in PDF dark mode
  - Dark mode: canvas renders with inverted background + invert filter = perfect match with SiYuan dark theme
  - Light mode: canvas uses theme background color directly, no filter
  
- **🎨 EPUB Theme Sync** - Fix outer background not updating when switching EPUB theme
  - foliate-view uses closed Shadow DOM, internal paginator reads background color from iframe
  - Use `requestAnimationFrame` + `renderer.render()` to trigger re-render, sync inner/outer background
  
- **🎨 Theme Parsing** - Optimize CSS variable parsing logic, ensure theme colors correctly applied to all elements
- **🔖 Tab Switch** - Fix PDF text selection still showing annotation menu when in inactive tab

#### ⚡ Code Optimization
- **🧹 Remove Deprecated** - Remove deprecated "TOC Position" setting and related code
- **🔧 Extract Utilities** - Extract `resolveColor`, `resolveTheme`, `getTheme` and other common functions, code more concise and efficient
- **📦 Book Source Refactor** - Extreme code simplification, use SiYuan native UI components, 40% code reduction

---

### v0.7.0 (2026.1.21)

#### ✨ New Features
- **Chapter Display** - Annotations automatically show chapter name, display page number for PDF without TOC
- **Smart Grouping** - Support grouping by chapter, date, or time with collapsible sections
- **Auto Sync on Add** - New annotations automatically import to bound SiYuan document
- **Auto Sync on Delete** - Deleting annotations synchronously removes corresponding blocks in document
- **Smart Deduplication** - Auto-detect imported annotations to avoid duplicates

#### 🐛 Bug Fixes
- **Chapter Export** - Fix missing chapter name in annotation export link format
- **PDF Page Number** - Fix missing location info for PDF annotations without TOC
- **Style Filter** - Fix EPUB annotations showing PDF-only styles (dotted, dashed, double line)

#### 🎨 UI Optimization
- **Annotation Layout** - Chapter name and time displayed side by side, chapter on left, time on right
- **Card Style** - Comprehensive annotation card style optimization, bar height only covers first line
- **Button Position** - Move action buttons to bottom right to avoid covering content
- **Note Style** - Note content displayed in italic for clearer visual hierarchy
- **Group Icon** - Group collapse uses vertical line/dot toggle for more intuitive interaction

---

### v0.6.9 (2026.1.11)

#### ✨ New Features
- **Bidirectional Annotation Binding** - Auto-record block ID after importing annotations to SiYuan document, enabling bidirectional association
- **Block Jump** - Bound annotations show link icon, click to jump directly to the corresponding SiYuan document block
- **Hover Preview** - Hover over bound annotations to show SiYuan native floating preview window after 620ms
- **Document Binding** - Add document binding feature in annotation/note panel, associate book annotations to specified SiYuan document
- **Anna Settings** - New Anna's Archive settings window with file type filtering, domain selection and custom domain support

#### 🎨 UI Optimization
- **Navigation Style** - Optimize navigation bar style to better match SiYuan style
- **Icon Switch** - Imported annotations automatically change download icon to link icon to distinguish import status

#### 🐛 Bug Fixes
- **ZAW3 Jump** - Fix zaw3 jump flicker causing annotations to cover text

---

### v0.6.8 (2026.1.8)

#### 🐛 Bug Fixes
- **Deck Display** - Fix deck not showing content when book is not opened
- **Bookshelf Duplicate Open** - Optimize bookshelf open book logic to avoid duplicate tabs

#### 🎨 UI Optimization
- **Tab Icon** - Add reader icon to book tabs for easier identification

#### 📝 PDF Annotation Enhancement
- **Style Extension** - PDF annotation adds dotted, dashed, double line styles, consistent with EPUB

#### 📖 TXT Annotation Optimization
- **Render Optimization** - Fix other annotations disappearing after annotation, now only render new annotations
- **Delete Optimization** - Fix text being deleted after annotation deletion, now only remove annotation style
- **Jump Function** - Support clicking annotation to jump precisely to annotation position, not just chapter start
- **Link Copy** - Fix annotation copy not generating hyperlink, now correctly copy and jump

---

### v0.6.7 (2025.12.29)

#### 🎯 Interaction Optimization
- **Unified Sidebar** - Optimize top button and plugin settings button click logic, unified to open SiReader sidebar
- **Quick TOC Access** - Add TOC button to reading page bottom toolbar, click to popup compact window from bottom, no need to open sidebar

#### 🛠️ UI Optimization
- **Navigation Adaptive** - Optimize navigation button adaptive layout, responsive layout more smooth
- **Settings Preview Enhancement** - Settings preview add collapse function, optimize space utilization, real-time preview more intuitive
- **Search Interaction** - Optimize search interface dropdown button, click blank area to auto hide
- **Tooltip Complete** - Unify all interface button tooltip display, prompt information more clear

#### 🐛 Bug Fixes
- **TOC Scroll** - Fix TOC scroll position reset after page turn
- **Sidebar Name** - Fix sidebar button name display as "Settings", unified to "SiReader"
- **Cover Display** - Optimize cover loading failure display logic

---

## 📖 Feature Details

### 🎨 Theme System
8 preset themes for different scenarios, support custom themes:
- **Default** - Classic white background with black text
- **Almond** - Eye-protection color scheme
- **Autumn** - Warm tone
- **Green** - Fresh and eye-friendly
- **Blue** - Calm and peaceful
- **Night** - Dark background
- **Dark** - Pure black mode
- **Gold** - Luxury color scheme

### 🖊️ Annotation System
7 colors with 4 style combinations:
- **Colors** - Red🔴Orange🟠Yellow🟡Green🟢Pink🩷Blue🔵Purple🟣
- **Styles** - Highlight, underline, border, wavy
- **Notes** - Add detailed notes to annotations
- **Management** - Filter by color, batch management

### 📖 Dictionary System
9 professional dictionary sources with smart recognition:
- **AI Translation** - Free AI translation (no config), SiYuan AI translation (requires OpenAI API)
- **Offline Dictionary** - Support StarDict (.ifo/.idx/.dict.dz) and dictd (.index/.dict.dz) formats
- **English Dictionary** - Cambridge (bilingual, phonetics, audio, examples), Youdao (simple), Haici (rich examples)
- **Chinese Dictionary** - Character (radicals, strokes), Phrase (synonyms, antonyms), Zdic (classical Chinese)
- **Universal Dictionary** - Bing (external webpage)

**Key Features:**
- **Smart Parsing** - Auto-extract POS, tags, annotations, domains, usage
- **Long Text Translation** - AI translation supports long text and paragraphs with format preservation
- **Dictionary Sorting** - Customizable dictionary query order
- **Offline Query** - Offline dictionaries work without network, fast query
- **Audio Pronunciation** - Cambridge dictionary supports US/UK pronunciation

### 🔍 Book Source System
Powerful rule parser:
- **JSONPath** - `$.key`, `$[0]`, `$[*]`, `.key` recursive search
- **CSS Selectors** - Chain selection, index filtering, attribute extraction
- **JavaScript** - `<js>...</js>` code block, `result` variable passing
- **Regex** - `##regex##replace` syntax
- **Rule Combination** - `&&` (and), `||` (or), `%%` (cross merge)

### 🛠️ PDF Toolbar
Professional PDF reading tools:
- **Zoom Control** - Zoom in, zoom out, fit width, fit page
- **Rotation** - Rotate left/right 90°
- **Tool Modes** - Text selection, hand drag
- **Ink Annotation** - 7 colors, width adjustment, eraser, undo
- **Shape Annotation** - Rectangle, circle, triangle with fill support
- **Document Operations** - Print, download, export images, view metadata

### 📊 Reading Statistics
Track reading time:
- **Current Session** - Current reading session time
- **Today** - Today's total reading time
- **Total** - Cumulative reading time
- **Status Bar** - Real-time display in status bar
- **Auto Save** - Auto-save every minute

### 🔗 Copy & Jump
Smart link generation:
- **Annotation Copy** - One-click copy to SiYuan note format
- **Custom Template** - Support custom link format
- **Shape Screenshot** - Auto-generate shape annotation screenshots
- **Precise Jump** - Click link to jump to exact annotation position
- **Blink Hint** - Highlight blink effect after jump

### 📦 Deck System
Vocabulary learning and review:
- **One-click Add** - Add word lookup results to deck with one click
- **Reading Annotation** - Deck words show 🌐 icon in reading interface
- **Real-time Sync** - Immediately update reading interface after add/delete
- **Data Persistence** - Store as `deck.json` file
- **Position Record** - Record word location in book, chapter, page
- **Smart Annotation** - Deck words auto-highlight in purple

### 📚 Bookshelf Management
Complete book management system:
- **Multi-view** - Grid, list, compact display modes
- **Smart Sorting** - Recently added, recently read, reading progress, title, author
- **Tag Filtering** - Filter by book tags
- **Progress Display** - Real-time reading progress percentage
- **Update Check** - One-click check all online book updates
- **Metadata Parsing** - Auto-extract title, author, intro, chapters, cover
- **Batch Management** - Support batch delete, export books

### 🔗 Smart Jump
Precise positioning and jump:
- **sireader:// Protocol** - Support custom protocol links
- **CFI Positioning** - EPUB uses CFI for precise positioning
- **Page Positioning** - PDF uses page number and rectangle coordinates
- **Blink Hint** - Highlight blink effect after jump
- **Smart Detection** - Auto-detect opened books, jump directly

### 📱 Mobile Support (Experimental)
Initial mobile reading support:
- **Gesture Navigation** - Swipe left/right to turn pages (minimum 50px)
- **Position Memory** - Auto-save and restore reading position
- **Back Support** - Listen to browser back button
- **Sidebar Entry** - Add SiReader icon to mobile sidebar

---

## ⚙️ Settings

### General Settings
- **Open Mode** - New tab, right tab, bottom tab, new window
- **Navigation Position** - Left, right, top, bottom
- **TOC Position** - Left, right
- **Reading Mode** - Single, double, scroll
- **Page Animation** - Slide, none

### Appearance Settings
- **Theme** - 8 preset themes + custom
- **Text** - Font, size, letter spacing
- **Paragraph** - Line height, paragraph spacing, text indent
- **Layout** - Horizontal margin, vertical margin, column gap
- **Visual** - Brightness, contrast, sepia, saturation, invert

### Dictionary Settings
- **Offline Dictionary** - StarDict/MDict format, support upload, sort, enable/disable
- **Online Dictionary** - 9 dictionary sources, support sort, enable/disable
- **AI Translation** - Free AI (no config), SiYuan AI (requires OpenAI API)
- **Dictionary Management** - Customize query order, prioritize dictionaries at the top

---

## 💡 Tips

### Reading Tips
1. **Theme Switch** - Use default/almond in daytime, night/dark at night
2. **Reading Mode** - Use page+single for novels, scroll+double for academic
3. **Shortcuts** - ← → for page turn, Space for page turn, PageUp/Down for page turn

### Annotation Tips
1. **Color Classification** - Red for core concepts, yellow for general points, green for positive cases, blue for supplementary, purple for questions
2. **Annotation Review** - Regularly review in annotation mode
3. **Annotation Export** - Auto-save to SiYuan notes

### Dictionary Tips
1. **Quick Lookup** - Double-click to select and query
2. **Pin Window** - Click 📌 to pin dictionary window
3. **Multi-dictionary** - Switch between different dictionary tabs
4. **Offline Dictionary** - Download StarDict format dictionaries, upload and use without network
5. **AI Translation** - Support long text translation with format and paragraph preservation
6. **Dictionary Sorting** - Adjust order in dictionary management, prioritize frequently used dictionaries

### PDF Tips
1. **Ink Annotation** - Suitable for handwritten notes and highlighting
2. **Shape Annotation** - Rectangle selection, circle marking, triangle indication
3. **Toolbar Drag** - Long press toolbar button to drag position
4. **Hand Tool** - Enable to drag pages, suitable for large documents

### Book Source Tips
1. **Concurrent Search** - Search multiple sources simultaneously
2. **Custom Sources** - Support importing JSON format sources
3. **Rule Debugging** - Use browser developer tools to test rules

---

## 🏗️ Technical Architecture

### Core Modules
- **Foliate.js** - EPUB rendering engine with CFI positioning
- **PDF.js** - Mozilla's PDF rendering engine (SiYuan built-in)
- **RuleParser** - Multi-format book source parser (JSONPath/CSS/XPath/JS/Regex)
- **MarkManager** - Unified annotation manager for PDF/EPUB/TXT
- **Bookshelf** - Book metadata and progress management

### Key Features
- **Unified Annotation** - Single API for PDF/EPUB/TXT annotations
- **Smart Positioning** - CFI for EPUB, page+rect for PDF, section for TXT
- **Real-time Sync** - Auto-save reading progress and annotations
- **Deck Integration** - Vocabulary cards sync with reading interface
- **Mobile Support** - Gesture navigation and position memory

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

**Q: Dictionary results inaccurate?**  
A: Switch between different dictionaries for comparison, or adjust dictionary query order

**Q: Theme switch not working?**  
A: Refresh reader page or reopen the file

**Q: PDF annotations misaligned?**  
A: Try rescaling or rotating the page, annotations will auto re-render

**Q: Book source search failed?**  
A: Check network connection, some sources may be invalid, try other sources

**Q: Can't turn pages on mobile?**  
A: Ensure swipe distance exceeds 50px, or use bottom page buttons

**Q: Reading progress lost?**  
A: Plugin auto-saves progress, if issues occur try reopening the book

---

## 🙏 Acknowledgments

- [SiYuan](https://github.com/siyuan-note/siyuan) - Excellent plugin development framework
- [Foliate.js](https://github.com/johnfactotum/foliate-js) - Powerful EPUB rendering engine
- [PDF.js](https://github.com/mozilla/pdf.js) - Mozilla's PDF rendering engine
- [Guiye Plugin](https://github.com/Wetoria) - Vue3 + Vite plugin template

---

## 📄 License

This project is licensed under the [MIT](LICENSE) License

---

<div align="center">

**Development Philosophy**: Simple · Efficient · Elegant · Perfect

Made with ❤️ by SiReader Team

</div>
