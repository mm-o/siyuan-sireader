<div class="sy__outline" style="max-width: 900px; margin: 0 auto;">
<div style="text-align: center; padding: 2.5em 1.5em; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); margin-bottom: 2em;">
<h1 style="color: white; margin: 0 0 0.3em; font-size: 2.5em; font-weight: 600;">📖 SiReader</h1>
<p style="color: rgba(255,255,255,0.9); margin: 0 0 1.5em; font-size: 1.1em;">Professional eBook Reader · Smart Annotation · Multi-format Support</p>
<p style="color: rgba(255,255,255,0.85); margin: 0 0 1.5em; line-height: 1.6; font-size: 0.95em;">Transform SiYuan Notes into a professional eBook reader<br>Support EPUB/PDF/TXT/Online novels with smart annotation, multi-theme switching, dictionary lookup, AI translation, deck system, and more for an immersive reading experience</p>
<p style="margin: 0;">
<img src="https://img.shields.io/badge/version-0.6.4-blue.svg" alt="Version" style="display: inline-block; margin: 0 4px;">
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

### v0.6.4 (2025.12.27)

#### 🔍 Book Source Enhancement
- **Rule Parser Refactor** - Full support for JSONPath, CSS selectors, XPath, JavaScript, Regex with `&&`/`||`/`%%` combination, `{$.path}` nesting, `@put/@get` data sharing
- **Smart Content Processing** - Auto-clean useless tags, convert HTML entities, smart paragraph splitting, image recognition with chain selection, index filtering, attribute extraction

#### ⚡ Performance Optimization
- **Size Optimization** - Use SiYuan built-in PDF.js, remove redundant dependencies
- **Uninstall Optimization** - Add refresh method on plugin uninstall

#### 🎨 UI Optimization
- **Navigation System** - Support left, right, top, bottom positions with smart tooltip direction, unified visual style, 8px border radius
- **Source Manager** - Fix Dialog close issue, use Set for selection state, performance improvement
- **Selection Menu** - Limit to reader container, unified 8px border radius
- **Settings Panel** - Remove redundant nesting, use semantic tags, fully reuse SiYuan b3 styles

#### 🔧 Code Optimization
- **Extreme Simplification** - 30% less HTML, 40% less CSS, shallower DOM hierarchy
- **SiYuan Style Unified** - Navigation, settings group, book cards use unified visual style

#### 🐛 Bug Fixes
- **Dialog Close** - Fix close button hidden in some themes
- **Menu Position** - Fix selection menu exceeding reader container
- **Border Radius** - Unify all components to 8px border radius
- **Annotation Icon** - Fix duplicate icon display after annotation operation

---

### v0.6.3 (2025.12.24)

#### 📚 Bookshelf Enhancement
- **Text Overflow Fix** - Fix text overflow in list and compact view
- **New Sort Methods** - Recently added, recently read, reading progress
- **State Persistence** - Auto-save sort method, filter tags, view mode

#### 🖊️ PDF Shape Annotation
- **Fill Function** - Support rectangle, circle, triangle fill (solid/hollow toggle)
- **Auto Popup** - Auto popup edit window after shape annotation
- **Smart Interaction** - Optimize ink and shape annotation interaction

#### 🔗 PDF Link & Jump
- **Precise Location** - Use page number and rectangle coordinates
- **Blink Hint** - Highlight blink effect after jump
- **Unified Logic** - Unify jump highlight and copy method

#### ⚡ PDF Rendering
- **Rewrite Rendering** - Fix rendering delay and annotation misalignment
- **Coordinate Transform** - Optimize coordinate system conversion
- **Canvas Management** - Improve Canvas layer management

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
