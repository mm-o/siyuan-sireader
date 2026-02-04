<div class="sy__outline" style="max-width: 900px; margin: 0 auto;">
<div style="text-align: center; padding: 2.5em 1.5em; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); margin-bottom: 2em;">
<h1 style="color: white; margin: 0 0 0.3em; font-size: 2.5em; font-weight: 600;">📖 SiReader</h1>
<p style="color: rgba(255,255,255,0.9); margin: 0 0 1.5em; font-size: 1.1em;">Professional eBook Reader · Smart Annotation · Multi-format Support</p>
<p style="color: rgba(255,255,255,0.85); margin: 0 0 1.5em; line-height: 1.6; font-size: 0.95em;">Transform SiYuan Notes into a professional eBook reader<br>Support EPUB/PDF/TXT/Online novels with smart annotation, multi-theme switching, dictionary lookup, AI translation, deck system, and more for an immersive reading experience</p>
<p style="margin: 0 0 1em;">
<img src="https://img.shields.io/badge/version-0.8.2-blue.svg" alt="Version" style="display: inline-block; margin: 0 4px;">
<img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" style="display: inline-block; margin: 0 4px;">
<img src="https://img.shields.io/badge/SiYuan-3.0+-orange.svg" alt="SiYuan" style="display: inline-block; margin: 0 4px;">
</p>
<p style="margin: 0;">
<a href="https://my.feishu.cn/wiki/Czp8wrf2NibwA9krhvmcHnbtnMc?from=from_copylink" style="display: inline-block; margin: 0 4px; color: white; text-decoration: none;">📖 User Guide</a>
<a href="https://my.feishu.cn/wiki/XzefwHqz4inde7k7rJKce7shn8d?from=from_copylink" style="display: inline-block; margin: 0 4px; color: white; text-decoration: none;">🔄 Changelog</a>
<a href="https://qm.qq.com/q/wpHDtsfxCw" style="display: inline-block; margin: 0 4px; color: white; text-decoration: none;">👥 QQ Group</a>
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

### 🎴 Flashcard Learning System
- **Anki Import** - Full .apkg file import with deck structure and card content preserved (learning progress import not yet supported)
- **Spaced Repetition** - Four-level rating system, smart queue, customizable learning steps
- **FSRS Algorithm** - Advanced memory algorithm for optimized review intervals
- **Data Statistics** - 11 visualization charts: ring charts, line charts, bubble charts, radar charts, heatmaps, etc.
- **Comprehensive Settings** - 30+ configurable parameters, daily limits, learning steps, advanced options

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

### v0.8.2 (2026.2.4)

#### ✨ New Features
- **Script Support** - Cards now support loading and executing script content for interactive features (e.g., dictionary lookup, audio playback)
- **Tag Image Display** - Automatically extract image info from card scripts, display corresponding images based on tags, works on both front and back

#### 🔧 Improvements
- Image processing code reduced by 78%, smoother operation, 10x faster matching
- Auto-detect and select optimal database file, auto-handle compressed formats
- Enhanced robustness, unified path handling, optimized caching

#### 🐛 Bug Fixes
- Fixed issues where some card images failed to load
- Fixed image information loss during processing
- Fixed tag images not displaying on back side

---

### v0.8.1 (2026.2.3)

#### ✨ New Features

**🎨 Deck Template Editor**
- **View Template Info** - Display deck field list, front template, back template
- **Edit Templates** - Support editing front template, back template, and CSS styles
- **Live Preview** - Preview changes immediately, support front/back toggle
- **Auto Save** - Changes auto-save, settings persist on next open

**🎯 Complete Anki Template System Support**
- **Template Syntax** - Full support for Anki template syntax (conditional display, nested conditions, front content reference)
- **Advanced Filters** - Japanese furigana, kanji/kana extraction, hint buttons, type input, plain text
- **Perfect Styling** - Custom fonts, colors, layouts all work correctly
- **Math Formulas** - Auto-recognize and render LaTeX formulas (inline and block)
- **Card Editing** - Support direct editing of card content (front/back independent editing)

**📦 Full Support for New Anki Format**
- **Auto Format Detection** - Support `.anki21b` (compressed), `.anki2`, `.anki21` all formats
- **Smart Decompression** - Auto-handle compressed database and media files
- **Backward Compatible** - Perfect compatibility with old Anki formats
- **Hierarchical Decks** - Correctly recognize and import multi-level deck structures

#### 🐛 Bug Fixes

- **✅ Database Initialization** - Fixed database creation failure after plugin update
- **✅ Statistics Page Error** - Fixed error when clicking "Total" tab with no learning data

#### ⚡ Performance Optimization

- **Emoji Picker** - Load 50 emojis initially, scroll to load more, faster opening
- **Code Simplification** - Optimized code structure, reduced 20% code size, smoother operation
- **Style Unification** - Unified style management, more coordinated interface

---

### v0.8.0 (2026.2.1)

> **⚠️ Important Notice for Next Version**  
> - **Database Unification**: v0.9.0 will unify all data storage into a single SQLite database. **This is a breaking update, please backup your data in advance**  
> - **Membership Features**: v0.9.0 will introduce professional subscription to unlock more advanced features

#### ✨ New Features

- **📦 Anki Deck Import** - Full support for .apkg file import, preserving deck structure and card content
  - Auto-parse Anki database, extract decks, cards, templates
  - Auto-extract media files (images, audio) and load on-demand
  - **Note**: Current version does not support importing original learning progress, multi-level deck structure, custom CSS styles. Will be supported in future versions
  
- **🎴 Complete Flashcard Learning System** - Professional spaced repetition learning functionality
  - Four-level rating system: Again, Hard, Good, Easy
  - Smart learning queue: new cards, learning, review cards auto-sorted
  - Learning steps: support custom learning steps (e.g., 1 minute, 10 minutes, 1 day)
  - Daily limits: set daily new cards and review cards limits
  - Deck enable/disable: flexible learning content control
  - Study session: record study start time and statistics
  
- **📊 Multi-dimensional Data Statistics** - Comprehensive learning data analysis and visualization
  - **Today's Stats**: new cards, reviews, correct rate, streak days
  - **Today's Rating**: ring chart showing rating distribution (again/hard/good/easy)
  - **Memory Curve**: line chart showing 7-day/30-day memory retention trend
  - **Overall Stats**: total cards, reviewed, average correct rate, streak days
  - **Lapse Analysis**: categorized by lapse count (0, 1-2, 3-5, >5)
  - **Learning Efficiency**: bubble chart showing review count vs interval days (efficient mastery/steady progress/needs consolidation/difficult cards)
  - **Memory Strength**: categorized by Ease value (difficult<130%, average 130-200%, good 200-250%, excellent≥250%)
  - **FSRS Stats**: target retention, FSRS cards, average stability, average difficulty
  - **Difficulty Distribution**: radar chart showing FSRS difficulty distribution (easy/medium/hard/very hard)
  - **Interval Distribution**: ring chart showing interval distribution (<1 day, 1-3 days, 4-14 days, ≥15 days)
  - **Review Intervals**: detailed interval distribution (<1 day, 1-7 days, 1-4 weeks, 1-3 months, 3-6 months, >6 months)
  - **Study Calendar**: heatmap showing annual study activity, support date filtering and navigation
  
- **🧠 FSRS Algorithm Integration** - Advanced spaced repetition algorithm
  - Support FSRS (Free Spaced Repetition Scheduler) algorithm
  - Auto-calculate card stability and difficulty
  - Set desired memory retention rate (default 90%)
  - Support custom FSRS weight parameters
  - Seamless switch with traditional SM-2 algorithm
  
- **💾 Independent Database Management** - High-performance data storage solution
  - Use SQL.js to implement client-side SQLite database (WebAssembly version)
  - Separate learning progress and card content for optimized query performance
  - Support complex queries: filter by state, interval, difficulty, date
  - Auto-indexing optimization, support large card collections (10000+)
  - Data persistence to SiYuan Notes `/data/storage/petal/siyuan-sireader/`
  - Support Anki database and SiYuan database dual storage
  
- **⚙️ Comprehensive Deck Settings** - 20+ configurable parameters
  - **Daily Limits**: new cards/review cards daily count (default 20/200)
  - **Learning Steps**: new card learning steps (default 1,10 minutes), graduating interval (1 day), easy interval (4 days)
  - **Lapse Handling**: relearning steps (10 minutes), minimum interval (1 day), leech threshold (8 times)
  - **Display Order**: new card order (random/sequential), review sort (due/random/interval), new review priority (mixed/new first/review first), new card collection priority (deck/position/random)
  - **FSRS Options**: enable/disable, desired retention (default 90%), custom weights
  - **Advanced Options**: maximum interval (36500 days), starting ease (2.5), easy bonus (1.3), interval modifier (1.0), hard interval (1.2), new interval (0.0)
  - **Related Cards**: related new cards/review cards temporarily hidden (avoid showing related content simultaneously)
  - **Future Support**: audio settings, timer, auto-advance, easy days, notebook binding will be implemented in future versions

#### ⚡ Performance Optimization

- **🚀 Database Query Optimization** - Add indexes for high-frequency query fields, improve query speed by 10x+
- **💾 Caching Mechanism** - Anki database caching to avoid repeated loading
- **📦 Lazy Loading** - Media files (images, audio) extracted on-demand from .apkg, reduce memory usage
- **🔄 Batch Operations** - Support batch import, batch update, improve large card collection processing efficiency

#### 🐛 Bug Fixes

- **📊 Statistics Accuracy** - Fix incorrect streak days calculation
- **🎴 Card State Sync** - Fix inaccurate learning progress save timing
- **💾 Database Initialization** - Fix database creation failure on first use



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

### 🎴 Flashcard Learning System
Complete spaced repetition learning functionality:

**Anki Deck Import:**
- **Full Compatibility** - Support .apkg file import with all data preserved
- **Learning Progress** - Retain original intervals, difficulty, review counts
- **Deck Structure** - Support multi-level decks (e.g., Language::English::Vocabulary)
- **Media Files** - Auto-extract images and audio, load on-demand
- **Custom Templates** - Preserve Anki card templates and CSS styles

**Learning Features:**
- **Four-level Rating** - Again, Hard, Good, Easy
- **Smart Queue** - Auto-sort new cards, learning cards, review cards
- **Learning Steps** - Customizable steps (e.g., 1 minute, 10 minutes, 1 day)
- **Daily Limits** - Set daily new cards and review cards limits
- **Deck Management** - Enable/disable decks for flexible learning control
- **Study Session** - Track study time and statistics

**FSRS Algorithm:**
- **Advanced Algorithm** - Free Spaced Repetition Scheduler
- **Smart Calculation** - Auto-calculate card stability and difficulty
- **Memory Optimization** - Set desired retention rate (default 90%)
- **Custom Weights** - Support custom FSRS parameters
- **Seamless Switch** - Free switch between FSRS and traditional SM-2

**Data Statistics:**
- **Today's Stats** - New cards, reviews, correct rate, study time, rating distribution
- **History** - 365-day study data with chart visualization
- **Overall Stats** - Total cards, reviews, study days, average correct rate, streak
- **Interval Distribution** - Statistics by time range (<1 day, 1-7 days, 1-4 weeks, etc.)
- **Retention Rate** - Memory effectiveness by interval and difficulty
- **Forecast** - Predict study load for next 7 and 30 days

**Deck Settings (30+ Parameters):**
- **Daily Limits** - New cards/review cards per day
- **Learning Steps** - New card steps, graduating interval, easy interval
- **Lapse Handling** - Relearning steps, minimum interval, leech threshold
- **Display Order** - New card order (random/sequential), review sort (due/random/interval)
- **FSRS Options** - Enable/disable, desired retention, custom weights
- **Advanced Options** - Maximum interval, starting ease, easy bonus, interval modifier
- **Related Cards** - Temporarily hide related new cards/review cards (avoid showing related content simultaneously)
- **Audio Settings** - Auto-play, answer audio
- **Timer** - Show timer, maximum answer time
- **Auto-advance** - Auto-show answer, auto-next card

**Database Management:**
- **High Performance** - Browser-based SQLite using SQL.js
- **Separated Storage** - Learning progress and card content separated for optimized queries
- **Complex Queries** - Filter by state, interval, difficulty, date
- **Auto-indexing** - Support large card collections (10000+)
- **Data Persistence** - Store in SiYuan `/data/storage/petal/siyuan-sireader/`
- **Dual Database** - Anki database and SiYuan database coexist

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
