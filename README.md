<div class="sy__outline" style="max-width: 900px; margin: 0 auto;">
    <div style="text-align: center; padding: 2.5em 1.5em; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.1);">
        <h1 style="color: white; margin: 0 0 0.3em; font-size: 2.5em; font-weight: 600;">📖 SiReader</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 0 0 2em; font-size: 1.1em;">Enhanced eBook Reading · Smart Annotations · Multiple Themes</p>
        <div style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap;">
            <a href="" 
               style="display: inline-block; min-width: 160px; padding: 18px 28px; background: white; color: #667eea; border-radius: 12px; text-decoration: none; font-size: 1.1em; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                📖 User Guide
            </a>
            <a href="" 
               style="display: inline-block; min-width: 160px; padding: 18px 28px; background: white; color: #667eea; border-radius: 12px; text-decoration: none; font-size: 1.1em; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                🔄 Changelog
            </a>
            <a href="" 
               style="display: inline-block; min-width: 160px; padding: 18px 28px; background: white; color: #667eea; border-radius: 12px; text-decoration: none; font-size: 1.1em; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                🔗 Links
            </a>
        </div>
    </div>
    <div style="padding: 2em 1.5em;">
        <div style="background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%); border-radius: 12px; padding: 1.5em; margin-bottom: 2em; border-left: 4px solid #667eea;">
            <h3 style="margin: 0 0 0.5em; color: #667eea;">🎯 About</h3>
            <p style="margin: 0; line-height: 1.6;">Transform SiYuan into a professional eBook reader with smart annotations, multiple themes, dictionary integration, and immersive reading experience. Currently supports EPUB format, with plans for PDF, MOBI and more formats.</p>
        </div>
    </div>

## 📖 Quick Start

### 🚀 Installation
1. Open SiYuan `Settings` → `Marketplace` → `Plugins`
2. Search for "SiReader" and install
3. Enable the plugin, 📖 reader icon will appear in toolbar

### 📝 Open EPUB Books
Drag EPUB files into SiYuan documents to create links, click links to open books

---

## 🚀 Latest Updates

### v0.6.2 (2025.12.21)

#### 🐛 Bug Fixes

- **✅ Book Data Files** - Fixed duplicate creation of book data files when books close abnormally
- **✅ Tab Response** - Added responsive switching of TOC, bookmarks, annotations, and notes when switching tabs
- **✅ File Loading** - Unified PDF/EPUB/TXT file loading logic, using `arrayBuffer()` instead of `blob()` to avoid large file loading failures
- **✅ Image Error Handling** - Auto-hide failed EPUB images, no broken image icons displayed
- **✅ Mobile z-index** - Fixed mobile reader container z-index too high blocking SiYuan top bar (back button and menu)
- **✅ Control Bar Display** - Optimized bottom control bar display logic, ensuring close button shows even on loading failure
- **✅ Annotation Overlay** - Lowered annotation overlay and card z-index, ensuring control bar always on top and clickable
- **✅ Component Unmount** - Fixed error accessing null reference during component unmount

#### ✨ Mobile Support (Experimental)

- **📱 Mobile Reading** - Initial mobile reading support, PDF works normally, EPUB/TXT may have issues
- **👆 Gesture Navigation** - Support left/right swipe for page turning, minimum swipe distance 50px, auto-filter vertical swipes
- **💾 Position Memory** - Auto-save and restore reading position on mobile (CFI or page number)
- **🔙 Back Support** - Listen to browser back button, auto-trigger reader close event
- **📱 Sidebar Entry** - Added SiReader icon entry in mobile sidebar, click to open settings panel

#### ⚡ Code Optimization

- **🔄 Position Management** - Unified reading position save and restore logic, cleaner code
- **📂 File Loading** - Unified file loading process for all formats, improved stability
- **🏷️ Tab Switching** - Optimized tab switching listener mechanism
- **🎯 Overall Simplification** - Removed redundant code, improved performance and maintainability

---

### v0.6.1 (2025.12.21)

#### 🐛 Bug Fixes

- **✅ PDF Annotation Position** - Fixed PDF text selection annotation position misalignment, unified coordinate system using `x/y/w/h` format
- **✅ Card Deck Highlight** - Fixed missing purple highlight after adding PDF words to card deck, extended card deck data structure to support `page` and `rects` fields
- **✅ Note Tooltip** - Unified tooltip display logic for annotation notes and shape annotation notes, hover to show full note content
- **✅ Card Deck Location** - Fixed "location info not saved" error when clicking card deck page location, support PDF format `page` field positioning
- **✅ Link Format Description** - Added "note" and "image" variable descriptions in i18n files, improved available variables prompt in copy settings

#### ⚡ Performance Optimization

**PDF Loading Optimization**
- Enabled font rendering and WebGL hardware acceleration, dramatically improved rendering speed
- Optimized Canvas context and rendering resolution, reduced pixel calculations
- Asynchronous text layer loading, non-blocking page rendering
- Reduced preload range, lower memory usage

**PDF Search Optimization**
- Text caching mechanism, 80% faster second search
- Prioritize rendered text layers, avoid redundant parsing
- Smart highlight algorithm, correctly handle cross-span matches
- Auto scroll to match position, improved interaction experience

---

### v0.6.0 (2025.12.20)

#### ✨ New Features

**📄 PDF Reading Support**
- **Complete PDF Reader** - Professional PDF reader based on PDF.js, supports zoom (25%-400%), rotation, page navigation
- **Virtual Scrolling** - Priority queue + virtual scrolling technology, dramatically improves large file loading speed
- **Full-Text Search** - Support PDF full-text search with highlighted results for quick content location
- **Metadata Parsing** - Auto extract PDF title, author, page count and other metadata
- **Toolbar Interaction** - Support toolbar collapse/expand, drag to adjust position, edge detection to prevent overflow

**🖊️ Advanced PDF Annotations**
- **Ink Annotations** - Support freehand ink annotations with 7 colors, adjustable thickness (1-10px), eraser function
- **Shape Annotations** - Support rectangle, circle, triangle annotations with color selection, thickness adjustment, drag to resize
- **Shape Copy** - Support copying shape annotations to SiYuan notes with auto-generated formatted links
- **Vector Storage** - Ink and shape annotations stored as coordinate point data (JSON), no extra storage space
- **Smart Rendering** - Low-resolution Canvas for real-time preview during reading, high-resolution images (2x DPR) generated when copying

**📚 Dictionary Card Deck System**
- **Dictionary Cards** - One-click add lookup results to card deck for review and management
- **Reading Interface Marks** - Card deck vocabulary displayed with 🌐 icon in reading interface, click to view details
- **Real-time Sync** - Immediately update reading interface and data file (`deck.json`) after adding/deleting cards

**📝 EPUB Footnote Enhancement**
- **Smart Footnote Recognition** - Auto recognize EPUB footnote links (`epub:type="noteref"` / `role="doc-noteref"`)
- **Click Popup Display** - Click footnote links to show popup instead of jumping, displays footnote type, ID and full content
- **Tooltip Display** - Hover to show tooltip preview, support scrolling for long content
- **Interaction Optimization** - 100ms delay hide, mouse can enter tooltip for operations

**🎨 Unified Tooltip System**
- **Three Types** - Unified display style for notes (blue 📝), dictionary (purple 🌐), footnotes (red 📌)
- **Visual Effects** - Three-layer shadows, frosted glass background, gradient header, icon glow effects
- **Edge Detection** - Auto detect viewport edges to prevent tooltip overflow
- **Smart Interaction** - Mouse can enter tooltip interior, support scrolling and copying content

**📖 TXT Parsing Enhancement**
- **Smart Encoding Detection** - Auto detect UTF-8/UTF-16/GBK encoding, support BOM markers
- **Chapter Recognition** - Support multiple chapter format recognition (Chapter X, Chapter X, numeric sequence, 【Title】)
- **Error Handling** - Auto fallback to GBK when encoding detection fails, ensure file readability

#### 🔧 Interface Optimization

**📋 Annotation Panel Refactor**
- **Unified Panel** - Refactored `MarkPanel.vue`, unified PDF/EPUB/TXT annotation interactions
- **Unified Edit UI** - Unified annotation, editing, display windows with consistent structure and style
- **Unified Display** - Ink and shape annotations unified in annotation page, support delete, edit, click to expand details
- **Real-time Editing** - Support real-time modification and saving of annotation text, notes, colors, styles
- **Precise Management** - Use `data-mark-id` for precise positioning and management of each annotation and icon
- **7 Colors 4 Styles** - Red🔴Orange🟠Yellow🟡Green🟢Pink🩷Blue🔵Purple🟣 + Highlight/Underline/Outline/Squiggly
- **Interaction Optimization** - Optimized interaction flow for annotation selection, editing, deletion

**🎯 Annotation Manager Optimization**
- **Unified Management** - `MarkManager.ts` unified management of PDF/EPUB/TXT annotation logic
- **Precise Operations** - Add/update/delete annotations with precise single annotation operations, no impact on others
- **Data Sync** - Annotation data real-time sync with dictionary card deck (`deck.json`)

**📚 Bookshelf Metadata Enhancement**
- **Smart Parsing** - Optimized EPUB/MOBI/AZW3/FB2/CBZ metadata parsing logic
- **Complete Info** - Auto extract title, author, description, chapters, cover and other complete information
- **Cache Optimization** - Metadata caching mechanism, reduce redundant parsing for better performance
- **Progress Refresh** - Optimized bookshelf progress display, real-time sync reading progress

#### 🐛 Bug Fixes

- **✅ Annotation Misalignment** - Fixed annotation position misalignment after deletion
- **✅ Icon Residue** - Fixed icon not cleared after annotation deletion causing residue
- **✅ Card Sync** - Fixed `deck.json` file not syncing after dictionary card deletion
- **✅ Tooltip Edge** - Fixed tooltip overflow beyond viewport edges
- **✅ Footnote Jump** - Fixed EPUB footnotes jumping directly instead of showing content
- **✅ Highlight Misalignment** - Fixed text highlight style misalignment after adding/deleting annotations
- **✅ Progress Save** - Fixed inaccurate reading progress saving, ensure real-time sync
- **✅ Bookshelf Progress** - Fixed bookshelf progress not updating, optimized refresh mechanism

---

### v0.5.1 (2025.12.12)

#### 🐛 Bug Fixes
- **✅ Fixed online build issues** - Changed to local build to avoid build environment differences

#### ⏸️ Feature Adjustments
- **📊 Paused reading stats** - Temporarily disabled bottom-right reading statistics

---

## 🚀 What's New in v0.5.0 (2025.12.12)

### ✨ Core Features
- **📚 Reading Engine Upgrade** - Completely replaced with foliate-js, supports EPUB, MOBI, PDF, TXT, online novels
- **⌨️ Keyboard Navigation** - Support arrow keys, PageUp/Down, spacebar for page turning
- **🎹 Custom Shortcuts** - Support SiYuan custom shortcuts (prev page, next page, toggle bookmark)
- **🔗 Smart Link Navigation** - Support `sireader://` protocol, click links to jump to specific positions, avoid duplicate tabs
- **📦 Card Deck** - Support vocabulary card deck management for learning and review
- **📖 Dictionary System** - Support StarDict/MDict offline dictionaries and online dictionaries, select text to lookup
- **🌐 AI Translation** - Integrated SiYuan AI translation and lookup features

### 📚 Bookshelf & Search
- **📖 Local Import** - Support importing local EPUB/MOBI/PDF/TXT files to bookshelf
- **🔍 Smart Search** - Search by title, author, multiple sorting options (time/title/author/update)
- **📋 Multiple Views** - Support grid, list, compact display modes
- **🌐 Book Source Search** - Support concurrent multi-source search, streaming results, one-click add to bookshelf
- **🔄 Update Check** - One-click check updates for all online books
- **📖 Metadata Parsing** - Auto parse EPUB metadata (title, author, description, chapters, cover)

### 🎨 Reading & Annotation
- **📑 TOC Navigation** - Use foliate-js native TOC, support search and smart positioning
- **📌 Bookmark Management** - Add, delete, jump to bookmarks
- **🌈 7-Color Annotation** - Red🔴Orange🟠Yellow🟡Green🟢Pink🩷Blue🔵Purple🟣, support adding notes
- **🎨 4 Styles** - Highlight, underline, outline, squiggly, freely combine
- **🔍 Color Filter** (Coming Soon) - Filter annotations by color, batch management
- **💾 Persistence** - Independent annotation storage, precise positioning with CFI

### ⚙️ Interface & Settings
- **⚙️ Settings Panel** - Brand new design, clear categories: General, Appearance, Dictionary
- **📋 Sidebar** - Optimized button order: Bookshelf→Search→Cards→TOC→Bookmarks→Annotations→Notes→General→Style→Dictionary
- **🎨 Theme System** - Unified SiYuan theme colors, perfect integration
- **🔤 Appearance Settings** - Font, size, spacing, line height, paragraph spacing, text indent fully adjustable
- **📏 Layout Settings** - Horizontal/vertical margins, column gap, header/footer height fine control
- **🌈 Visual Effects** - Brightness, contrast, sepia, saturation, invert filters
- **📖 Reading Modes** - Single/double page, slide/scroll pagination, TOC left/right switch

### 🔗 Links & Copy
- **📋 Formatted Links** - Support custom templates, default uses SiYuan callout format
- **🎯 Precise Positioning** - Use CFI for precise book position
- **📖 Chapter Recognition** - Auto recognize current chapter, generate links with chapter info
- **🔗 Smart Navigation** - Click links to auto detect open books, jump directly

### ⚡ Performance & Optimization
- **📦 Architecture Optimization** - Business logic moved to composables, cleaner components
- **🔄 Reactive** - Settings changes take effect immediately, no refresh needed
- **💾 Smart Caching** - Cache book info, reduce redundant loading
- **🎯 Functional Programming** - Use reduce/map/filter to simplify code
- **🔒 Type Safety** - Complete TypeScript type definitions

### 🐛 Bug Fixes
- **✅ Font Settings** - Fixed font not working (use full URL path)
- **✅ Theme Application** - Fixed theme not applying to entire tab
- **✅ Reactive Updates** - Fixed reading interface not responding to settings updates
- **✅ Chapter Retrieval** - Fixed chapter info not retrieved correctly
- **✅ Author Formatting** - Support string/object/array formats
- **✅ Link Encoding** - Fixed Chinese link encoding issues
- **✅ Internationalization** - Fixed tooltip showing English text
- **✅ Cover Parsing** - Fixed EPUB cover parsing failure causing infinite retries, auto fallback to text cover
- **✅ Shortcut Conflicts** - Fixed shortcuts working during editing, only respond when reading

---

## 🎨 Main Features

### 📚 Reading Experience

#### 🎨 Multiple Themes
8 beautiful preset themes + custom themes for different reading scenarios:

**8 Preset Themes:**
| Theme | Scenario | Features |
|-------|----------|----------|
| **Default** | Daily reading | Classic white background, clear and readable |
| **Almond** | Long-time reading | Eye-care colors, reduce eye strain |
| **Autumn** | Cozy reading | Warm tones, comfortable experience |
| **Green** | Natural reading | Fresh green, eye-friendly |
| **Blue** | Calm reading | Peaceful blue, serene mood |
| **Night** | Night reading | Dark background, protect vision |
| **Dark** | Focus reading | Pure black mode, immersive experience |
| **Gold** | Premium reading | Luxury colors, exclusive experience |

**Custom Themes:**
- **Text Color**: Custom text display color (HEX values supported)
- **Background Color**: Custom page background color (HEX values supported)
- **Background Image**: Upload custom background images (URL or local path)
- **Live Preview**: See effects immediately, support import/export configs

#### 📱 Reading Modes
- **Pagination Mode**: Traditional page-turning experience, perfect for novels
- **Scroll Mode**: Continuous scrolling, suitable for academic documents
- **Single Page**: Focus on current page
- **Double Page**: Simulate physical book reading

#### ⌨️ Convenient Controls
- **Keyboard Navigation**: ← → arrow keys for page turning
- **Toolbar Control**: Previous, next, table of contents buttons

### 📝 Smart Annotations

#### 🎨 7-Color Annotation System
Use 7 colors to mark different types of content:

| Color | Letter | Suggested Use |
|-------|----------|---------------|
| 🔴 **Red** | R | Important content, key concepts |
| 🟠 **Orange** | O | Issues to note |
| 🟡 **Yellow** | Y | General highlights, reminders |
| 🟢 **Green** | G | Positive info, good viewpoints |
| 🩷 **Pink** | P | Personal insights, thoughts |
| 🔵 **Blue** | B | Additional info, extended content |
| 🟣 **Purple** | V | Questions, need verification |

#### 📖 Auto Chapter Tagging
- Automatically add chapter info when annotating
- Annotation format: `- R [annotation text (Chapter 3)](link#position)`
- Chapter info displayed separately in annotation panel

#### 📝 Annotation Document Management
**Two Management Modes:**
1. **Notebook Mode**: Create independent docs for each book under specified notebook
2. **Document Mode**: Create subdocs for each book under specified document

### 📚 Table of Contents Navigation

#### 📂 Three Browse Modes

**1. Contents Mode**
- **Chapter Navigation**: Display complete book TOC structure
- **Hierarchical Display**: Support multi-level TOC with auto indentation
- **Progress Display**: Show reading progress percentage for each chapter
- **Bookmark Operations**: Hover over chapters to show 📖 bookmark button
- **Current Position**: Highlight current reading chapter

**2. Bookmark Mode**
- **Bookmark List**: Display all saved bookmarks
- **Quick Jump**: Click bookmarks to jump directly to positions
- **Bookmark Management**: Hover to show 🗑️ delete button
- **Empty State**: Show "No bookmarks" when empty
- **Chapter Title**: Display bookmark's chapter name

**3. Annotation Mode**
- **Annotation List**: Display all colored annotation content
- **Color Classification**: Left color border identifies different annotation types
- **Content Display**: Annotation text + chapter info displayed separately
- **Quick Location**: Click annotations to jump to original text
- **Delete Function**: Hover to show 🗑️ delete button

### 📚 Dictionary Integration

#### 🌐 Multi-Dictionary Support
Support 7 professional dictionary sources with auto language detection:

| Dictionary | Language | Features |
|------------|----------|----------|
| **Cambridge** | English | Professional definitions, US/UK phonetics, rich examples, auto pronunciation |
| **Youdao** | English | Quick search suggestions, smart recommendations |
| **Haici** | English | Detailed analysis, pronunciation audio, part-of-speech tagging |
| **Chinese Dict** | Chinese | Radical strokes, pinyin notation, character analysis |
| **Word Dict** | Chinese | Word definitions, synonyms/antonyms, idiom stories |
| **Zdic** | Chinese | Ancient Chinese, etymology, classical text support |
| **Bing** | Universal | External jump, complete dictionary functions |

#### 🎯 Smart Recognition
- **Chinese Characters** → Auto select Chinese dictionary
- **Chinese Words** → Auto select Word dictionary
- **English Words** → Auto select Cambridge dictionary


### 🎨 EPUB Block Styles
Support multiple EPUB block display styles for beautiful in-document links:

#### 5 Block Styles
| Style | Effect | Use Case |
|-------|--------|----------|
| **Default** | Plain link style | Simple reference |
| **Border** | Add border decoration | Highlight display |
| **Card** | Card layout with cover and info | Book showcase |
| **Cover** | Cover image only | Book collection |
| **Reader** | Embedded reader | Direct reading |

---

## ⚙️ Settings

### 🎨 Theme Settings
1. Click toolbar settings button ⚙️
2. Select `Theme` tab
3. Choose from preset themes
4. Or select "Custom" to create personal theme

### 📝 Annotation Settings
1. Select `Annotation` tab
2. Choose annotation document creation method:
   - **Notebook Mode**: Create independent doc for each book
   - **Document Mode**: Create subdocs under specified document
3. Set target notebook or parent document

### 📖 Reading Settings
1. Select `Reading` tab
2. Choose page animation effects
3. Set single or double page display mode

### 🔧 General Settings
1. Select `General` tab
2. Set book opening method:
   - **New Tab**: Open in new tab
   - **Right Tab**: Open on right side
   - **Bottom Tab**: Open at bottom
   - **New Window**: Open in new window
3. Choose TOC opening position:
   - **Dialog**: Popup display
   - **Left**: Left panel
   - **Right**: Right panel

---

## 💡 Usage Tips

### 📖 Efficient Reading Tips
1. **Theme Switching**: Choose appropriate themes based on time and environment
   - Daytime: use "Default" or "Almond"
   - Nighttime: use "Night" or "Dark" mode
2. **Reading Modes**: Choose based on content type
   - Novels: Pagination mode + Single page
   - Academic: Scroll mode + Double page

### 📝 Annotation Management Tips
1. **Color Classification**:
   - 🔴 Red: Core concepts and important theories
   - 🟡 Yellow: General highlights and key information
   - 🟢 Green: Positive cases and successful experiences
   - 🔵 Blue: Supplementary materials and extended reading
   - 🟣 Purple: Questions and content needing verification

2. **Annotation Organization**: Regularly review all annotations in annotation mode
3. **Annotation Export**: Annotations auto-save to SiYuan documents for later organization

### 📚 Dictionary Query Tips
1. **Quick Query**: Double-click to select and query unknown words
2. **Fixed Window**: Click 📌 to fix dictionary window while studying
3. **Multi-Dictionary Comparison**: Switch dictionary tabs to compare definitions

---

## ❓ FAQ

### 📱 Usage Issues

**Q: EPUB file won't open?**  
A: Check if file format is standard EPUB and ensure file is not corrupted

**Q: Annotations not saving?**  
A: Check if notebook or parent document is correctly configured in annotation settings

**Q: Dictionary query not responding?**  
A: Check network connection, some dictionaries require internet access

**Q: Theme switching not working?**  
A: Refresh reader page or reopen EPUB file

### ⚙️ Settings Issues

**Q: Can't find settings button?**  
A: Settings button is on the right side of toolbar, icon is ⚙️

**Q: Where are annotation documents?**  
A: Look in corresponding notebook or document based on configured mode

**Q: How to modify shortcuts?**  
A: Shortcuts are currently fixed, custom shortcuts will be supported in future versions

**Q: EPUB block styles not working?**  
A: Ensure EPUB file is correctly dragged into document, click block icon and select style through menu

---

## 🔧 Technical Architecture

### Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vue 3** | Composition API | Reactive frontend framework |
| **ePub.js** | v0.3+ | EPUB rendering engine |
| **SiYuan** | Plugin API | Block integration, data persistence |
| **TypeScript** | 5.0+ | Type safety, code hints |

### Design Philosophy

- **🎯 Clear Responsibilities**: Single responsibility, modular design
- **🔗 Loose Coupling**: Composition functions, dependency injection
- **📱 User Friendly**: Modern UI, intelligent interaction
- **⚡ Performance First**: Algorithm optimization, memory management
- **🛠️ Extensibility**: Plugin architecture, configuration-based

### Performance Optimization

- **🚀 Simple & Efficient**: Single-line functions, chained operations
- **💾 Smart Caching**: Annotation caching, progress debouncing
- **🔄 Reactive Updates**: Direct array operations, avoid reloading
- **🧹 Memory Management**: Auto cleanup, prevent memory leaks

---

## 🙏 Acknowledgments

- Thanks to the SiYuan team for providing excellent plugin development framework and templates, making plugin development more convenient and efficient.
- **[SiYuan Plugin Development Guide](https://ld246.com/article/1723732790981#START-UP)** and its authors for detailed development documentation
- **Plugin developer [vv](https://github.com/Wetoria)** for providing [Vue3 + Vite SiYuan Plugin Template](https://github.com/siyuan-note/plugin-sample-vite-vue)
- **[Epub.js](https://github.com/futurepress/epub.js)** open source project for powerful EPUB rendering engine
- Also thanks to all users who use and provide feedback, your suggestions help SiReader continuously improve.

**Development Philosophy**: Simple, Efficient, Elegant, Perfect  
**Tech Stack**: Vue3 + Epub.js + SiYuan API  
**Architecture**: Modular, Compositional, Reactive, Extensible

</div>
