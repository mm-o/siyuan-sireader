# AGENTS.md

## Purpose

This repository is a SiYuan plugin named `siyuan-sireader` (`SiReader`).
It turns SiYuan into an ebook reader with bookshelf management, PDF/EPUB/TXT reading, annotation, TTS, dictionary/translation, online sources, and WeRead integration.

Use this file as the first-stop map before opening large Vue files.

## Tech Stack

- Runtime: SiYuan plugin API
- Language: TypeScript
- UI: Vue 3 single-file components
- Build: Vite library build, output as a CommonJS SiYuan plugin bundle
- Storage: SiYuan plugin `loadData/saveData/removeData` plus files under `/public/siyuan-sireader`
- Local data layer: JSON-backed `ReaderDatabase` in [`src/core/database.ts`](../src/core/database.ts)
- Ebook parsing/rendering: `foliate-js`, EmbedPDF, `jszip`
- Tests: Vitest

## Primary Entry Points

- Plugin lifecycle: [`src/index.ts`](../src/index.ts)
- App bootstrap and Vue mount: [`src/main.ts`](../src/main.ts)
- Root app shell and tab registration: [`src/App.vue`](../src/App.vue)
- Main reader UI: [`src/components/Reader.vue`](../src/components/Reader.vue)
- Bookshelf UI: [`src/components/Bookshelf.vue`](../src/components/Bookshelf.vue)
- Bookshelf split view: [`src/components/bookshelf/View.vue`](../src/components/bookshelf/View.vue)
- Shared shell UI: [`src/components/ui/DockShell.vue`](../src/components/ui/DockShell.vue)
- Build config: [`vite.config.ts`](../vite.config.ts)
- Plugin manifest: [`plugin.json`](../plugin.json)

## Directory Map

- [`src/components`](../src/components): Vue UI for reader, bookshelf, settings, search, stats, translation, annotations, TTS.
- [`src/components/bookshelf`](../src/components/bookshelf): bookshelf presentation components.
- [`src/components/ui`](../src/components/ui): shared UI shell/splash components.
- [`src/composables`](../src/composables): settings, stats, license, reader marks, import hooks.
- [`src/core`](../src/core): core reader, storage, bookshelf, EPUB/TXT, mark, license logic.
- [`src/components/EmbedPdfReader.vue`](../src/components/EmbedPdfReader.vue): EmbedPDF wrapper for PDF reading.
- [`src/core/epub`](../src/core/epub): EPUB reader/search/types.
- [`src/core/txt`](../src/core/txt): TXT import and reading helpers.
- [`src/services`](../src/services): TTS and translation services.
- [`src/utils`](../src/utils): book opening, copy/import helpers, dictionary, keyboard, mobile, source utilities.
- [`src/weread`](../src/weread): WeRead agent, context bridge, opening logic, and UI.
- [`src/i18n`](../src/i18n): locale JSON copied into the plugin package.
- [`docs`](.): supplementary documentation.
- [`patches`](../patches): patched dependency files used by pnpm.

## Runtime Flow

1. [`src/index.ts`](../src/index.ts)
   Detects SiYuan frontend/platform flags, stores the plugin singleton, mounts the app, registers hotkeys, listens for sync/reload events, and cleans up on unload.
2. [`src/main.ts`](../src/main.ts)
   Initializes dictionary/mobile/icon hooks, appends the Vue mount node, creates the Vue app, and owns cleanup callbacks.
3. [`src/App.vue`](../src/App.vue)
   Registers custom tabs, exposes `window.sireader`, intercepts ebook links and `sireader://open` links, opens settings/stats/WeRead/mobile reader views.
4. [`src/utils/bookOpen.ts`](../src/utils/bookOpen.ts)
   Centralizes book opening: online URLs, mobile events, native SiYuan PDF tabs, existing reader tab activation, and custom reader tabs.
5. [`src/components/Reader.vue`](../src/components/Reader.vue)
   Hosts format-specific reader setup, toolbar events, position saving, mark managers, TTS, and cleanup.

## Core Data Model

The plugin revolves around two concepts:

- Books: indexed by URL in `bookshelf.json`, hydrated from per-book records.
- Annotations: EPUB highlights, notes, bookmarks, vocab, plus EmbedPDF native annotation state.

Important files:

- Book and annotation schema/types: [`src/core/database.ts`](../src/core/database.ts)
- Bookshelf operations: [`src/core/bookshelf.ts`](../src/core/bookshelf.ts)
- Managed file/storage helpers: [`src/core/bookStore.ts`](../src/core/bookStore.ts)
- PDF migration/EmbedPDF annotation normalization: [`src/core/dataMigration.ts`](../src/core/dataMigration.ts)
- Mark manager: [`src/core/MarkManager.ts`](../src/core/MarkManager.ts)

## Storage Model

There are two storage layers:

- Structured plugin data via `plugin.loadData/saveData/removeData`
  - main keys: `bookshelf.json`, `settings.json`, `daily.json`
  - per-book records: `records/<hash>.json`
  - other feature keys include license/OCR/source/settings records
- Binary/public assets under `/public/siyuan-sireader`
  - stored book files: `/public/siyuan-sireader/books`
  - covers/backgrounds: `/public/siyuan-sireader/covers` and related folders

`bookStore.ts` intentionally reads critical storage through `/api/file/getFile` so SiYuan sync changes are visible without trusting only the in-memory plugin data cache.

When modifying import/storage logic, preserve the current `/public/siyuan-sireader` managed-file model and backward compatibility for old stored paths.

Bookshelf import should stay lightweight. Local batch preview must not read whole native files just to fingerprint or parse basic metadata; use native file path, size, and modified time when available, and only materialize file content when a format-specific parser truly needs it. Keep file import writes conservative for large files so one large book does not freeze the whole batch UI.

Bookshelf remove/delete semantics:

- `移除` removes plugin-managed book files and covers, but keeps per-book reading data and annotations for future re-import matching.
- `彻底删除` removes the book plus reading/annotation data.
- Original external files, remote URLs, `asset://` files, and plugin-private paths should not be deleted by managed-file cleanup.

PDF data also lives in the normal per-book JSON record. Active PDF state should not use `.bin`; old `.bin` files are migration input only and are removed only after all legacy annotations are accounted for.

## Reader Modes

- EPUB/MOBI/AZW3-like flow: [`src/core/epub`](../src/core/epub)
- PDF flow: [`src/components/EmbedPdfReader.vue`](../src/components/EmbedPdfReader.vue)
- TXT flow: [`src/core/txt`](../src/core/txt)
- Online reading: [`src/components/OnlineReader.vue`](../src/components/OnlineReader.vue), [`src/utils/HttpSources.ts`](../src/utils/HttpSources.ts)
- WeRead: [`src/weread`](../src/weread)

Opening behavior is centralized in [`src/utils/bookOpen.ts`](../src/utils/bookOpen.ts). If a change affects opening, check bookshelf open, document asset links, `sireader://` custom links, mobile open, and `window.sireader` calls.

## Settings and Global State

- Settings composable: [`src/composables/useSetting.ts`](../src/composables/useSetting.ts)
- Stats composable: [`src/composables/useStats.ts`](../src/composables/useStats.ts)
- License composable: [`src/composables/useLicense.ts`](../src/composables/useLicense.ts)

Settings are persisted under `reader_settings`, mirrored to `window.__sireader_settings`, and broadcast with `sireaderSettingsUpdated`.

If you add a setting, verify default value, save/load merge behavior, UI binding, runtime update behavior, and compatibility with old config shapes.

## Online Sources and WeRead

- HTTP source manager: [`src/utils/HttpSources.ts`](../src/utils/HttpSources.ts)
- Search/import UI: [`src/components/BookSearch.vue`](../src/components/BookSearch.vue)
- Online reader shell: [`src/components/OnlineReader.vue`](../src/components/OnlineReader.vue)
- WeRead agent/context/UI: [`src/weread`](../src/weread)

Online books can be stored as link-only shelf entries. Do not assume every shelf item has a managed local file.

## Build and Dev Commands

From repository root:

```powershell
pnpm install
pnpm build
pnpm dev
pnpm test
pnpm test:run
pnpm test:coverage
```

Notes:

- `pnpm dev` runs `vite build --watch`.
- In watch mode, output targets `./dev` unless `VITE_SIYUAN_WORKSPACE_PATH` is set in `.env`, then it writes to `<workspace>/data/plugins/siyuan-sireader`.
- Production build outputs to `dist/` and packs `package.zip`.
- This repo uses pnpm patched dependencies. The active foliate patch is configured in [`pnpm-workspace.yaml`](../pnpm-workspace.yaml), not `package.json`; keep [`patches/foliate-js@0.0.0.patch`](../patches/foliate-js@0.0.0.patch) when updating EPUB dependencies.

## Files Usually Safe to Ignore

- `dist/`: generated build output, if present.
- `dev/`: watch-mode build output, if present.
- `node_modules/`: dependencies, if present.
- `package.zip`: generated package artifact.

## Change Strategy

For most tasks, read in this order:

1. `docs/AGENTS.md`
2. nearest entry point
3. directly referenced composable/core module
4. only then large UI/component files

Examples:

- Reader bug: `Reader.vue` -> relevant EmbedPDF wrapper, `src/core/epub`, or `src/core/txt` module -> `jump.ts` / `keyboard.ts`.
- PDF/EmbedPDF bug: read `docs/embedpdf.md` first, then `EmbedPdfReader.vue`, `Reader.vue`, `bookStore.ts`, and `dataMigration.ts`.
- Import/open bug: `bookOpen.ts` -> `bookshelf.ts` -> `bookStore.ts`.
- Settings bug: `useSetting.ts` -> impacted component.
- Annotation bug: `MarkManager.ts` -> `MarkPanel.vue` / `useReaderMarks.ts` -> format-specific code.
- Online/WeRead bug: `BookSearch.vue` / `OnlineReader.vue` -> `HttpSources.ts` or `src/weread`.

## Risk Areas

- Storage code can break existing user libraries.
- Reader open-position logic affects bookshelf, links, tabs, native PDF open, and resume behavior.
- PDF annotation state belongs to EmbedPDF; avoid rebuilding PDF tools in SiReader.
- PDF bookmarks should follow the same EmbedPDF annotation read/write/edit/delete path as normal PDF annotations.
- PDF migration must be idempotent; current records use `migration.pdfAnnotations` to avoid rerunning on every open.
- Settings persistence assumes immediate runtime sync through global events.
- License gating intentionally controls some features.
- Mobile behavior has a separate event path from desktop tabs.
- Online reader scripts execute in webview/browser contexts; treat injected scripts and remote pages as trust boundaries.

## Conventions Observed

- Alias `@` points to `src/`.
- Many modules are lazily imported to reduce startup cost.
- Plugin-global access is provided through `usePlugin()`.
- Cleanup hooks are registered through `registerCleanup()`.
- Runtime events use names like `sireader:*`, `reader:*`, `tts:*`, and `stats:*`.
- Prefer existing helpers in `bookStore.ts`, `bookshelf.ts`, `useSetting.ts`, and `bookOpen.ts` before adding new storage/opening utilities.

## Current Audit Notes

- Flashcard/deck code has been split out to the separate Sideck plugin; do not look for `src/components/deck` in this repo.
- The manifest and package metadata contain mojibake in some Chinese fields when viewed through the current PowerShell output; verify file encoding before editing those strings.
- `pnpm-lock.yaml` is present. Do not change package managers.
