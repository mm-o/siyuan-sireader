<div align="center">

# 📖 SiReader

**Professional eBook Reader · Smart Annotation**

Transform SiYuan Notes into a professional eBook reader  
Professional eBook reader for EPUB/PDF/MOBI/TXT/online novels. PDFs support highlights, ink, shapes, forms, stamps, signatures, images, screenshots, search, printing, export, and backlinks, with annotation notes, dictionary, translation, themes, and bookshelf management.

[![Version](https://img.shields.io/badge/version-2.2.5-blue.svg)](https://github.com/your-repo/siyuan-sireader)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![SiYuan](https://img.shields.io/badge/SiYuan-3.0+-orange.svg)](https://github.com/siyuan-note/siyuan)

[🌐 Website](https://sireader.745201.xyz) · [📖 Documentation](https://my.feishu.cn/wiki/C3ULw8pM6iY2qgk3aGVc5eManZe) · [💎 Purchase](https://pay.ldxp.cn/shop/J7MJJ8YR/lillyt) · [👥 QQ Group](https://qm.qq.com/q/wpHDtsfxCw) · [📝 Changelog](https://my.feishu.cn/wiki/ZD81wv7fAiFnLckWWBycdmoTn7s)

</div>

---

## 📝 Latest Updates

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
