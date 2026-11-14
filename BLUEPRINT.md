# Pilgrim Markdown (`Pilgrim-Markdown`) — Technical Blueprint (v4)

**Repository:** `Pilgrim-Markdown` (GitHub Pages URL: `https://<username>.github.io/Pilgrim-Markdown/`)  
**License:** MIT License (source code) — Brand & logo assets All Rights Reserved by **Pilgrim Software** (see [TRADEMARKS.md](./TRADEMARKS.md))  
**Primary Target Platform:** ChromeOS Progressive Web App (Launcher, Shelf, Files app) with progressive enhancement for other desktop browsers  
**Hosting & CI/CD:** GitHub Pages via GitHub Actions (optional Phase 2/3: TWA for Google Play Store)  

---

## 1. Product Vision & Scope

### 1.1 Problem & Positioning
ChromeOS lacks a lightweight, fast, offline-first Markdown editor that opens `.md`, `.markdown`, and `.txt` files directly from the native **Files app** (local storage and Google Drive mount) without mandatory cloud accounts, subscriptions, or heavy Electron/Android runtimes.

### 1.2 Phase 1 Scope (MVP) vs. Future Phases
| In Scope (Phase 1 & Phase 2) | Out of Scope (Phase 3+) |
| :--- | :--- |
| Local & DriveFS `.md`/`.markdown`/`.txt` open, save & drag-and-drop (with handle) | Custom Pilgrim-hosted backend / real-time multiplayer |
| Multi-tab workspace (per-tab CodeMirror `EditorState`) + Folder Vault explorer (`showDirectoryPicker`) + `Ctrl+P` Quick Switcher | Full PKM / wiki-graph / backlinks (Obsidian-style) |
| Zero-server Google Drive Cloud Sync (DriveFS live change watcher + direct Drive REST API v3 `drive.file` client with offline queue) | `share_target` (incoming share via Service Worker POST route) |
| Split-pane CodeMirror 6 editor (incl. Smart Link Paste, `/` slash commands, Command Palette) + sanitized Live Preview (with vault relative `blob:` image resolution) | Trusted Web Activity (TWA) + Digital Asset Links for Play Store |
| GFM (tables, clickable task lists, code blocks with copy button), YAML frontmatter & lazy KaTeX | Heavy diagram libraries such as Mermaid (> 1 MB, lazy plugin) |
| Clickable Document Outline (TOC `H1–H3`), Recent Files menu (`recent-handles`) & searchable Help modal (`F1`) | WYSIWYG rich-text editing (remains pure Markdown source) |
| Material Design 3 light/dark mode + WCO titlebar + keyboard accessibility (focus-trapped modals) | |
| Multi-window-safe IndexedDB workspace crash recovery + conflict detection | |
| Export to `.md`, standalone `.html`, PDF (`@media print`) & "Copy for Google Docs / Gmail" | |

---

## 2. Platform Strategy & Browser APIs (Progressive Enhancement)

ChromeOS treats a properly configured PWA as a first-class application via **Project Fugu** APIs. Because not every browser or context (e.g., Firefox, Safari, Chrome Incognito) supports every API, each capability has an explicit fallback:

| Capability | Primary API (ChromeOS / Chromium) | Fallback (Other browsers / contexts) |
| :--- | :--- | :--- |
| **Open/Save Files** | File System Access API (`showOpenFilePicker`, `showSaveFilePicker`, `DataTransferItem.getAsFileSystemHandle`) | `<input type="file" accept=".md,.markdown,.txt">`, `DataTransfer.files` & `<a download>` (Blob) |
| **OS File Association** | File Handling API (`window.launchQueue`) | Standard open via UI "Open" button, Recent files, or drag-and-drop |
| **Titlebar Integration** | Window Controls Overlay (`navigator.windowControlsOverlay`) | Standard in-app header bar when WCO is disabled or unsupported |
| **Offline & App Shell** | Service Worker via `vite-plugin-pwa` (Workbox precaching) | Online usage + local IndexedDB drafts |
| **Share & Clipboard** | Web Share API (`navigator.share`) & `ClipboardItem` (`text/html` + `text/plain`) | `navigator.clipboard.writeText()` / download as `.md` or `.html` |

---

## 3. Document, Storage & Concurrency Model

### 3.1 Window Model & `launchQueue` Handling
- `file_handlers` uses `"launch_type": "multiple-clients"` so double-clicking a second `.md` file in the ChromeOS Files app opens a separate PWA window.
- `launch_handler` uses `"client_mode": "focus-existing"` for regular app launches (so clicking the Shelf icon brings the active window back into focus).
- **`launchQueue.setConsumer(launchParams)`** explicitly handles both files and shortcut URLs:
  1. **Files (`launchParams.files?.length > 0`):** Opens `files[0]`. If `isDirty === true`, the app first shows `ConflictModal` (*Save / Discard / Cancel*). If multiple files are selected (`files.length > 1`), `files[0]` is opened with a notice that Phase 1 opens one file per window.
  2. **Shelf shortcut (`launchParams.targetURL` with `?action=new`):** Checks `isDirty`; when `false`, starts a clean document; when `true`, shows `ConflictModal` before clearing the editor.
  3. **Regular focus (`files` empty and no `action=new`):** Complete *no-op* (leaves the current document untouched when the user simply clicks the Shelf icon to focus the window).

### 3.2 Multi-Window Draft Cache vs. Disk Storage
1. **Window-Isolated Crash Recovery (`IndexedDB` + `Web Locks API`):**
   - On initialization, each window reads or generates a `docId` (stored in `sessionStorage` for page reloads).
   - When `'locks' in navigator` is available, the window requests an exclusive lock with `{ ifAvailable: true }`:
     ```ts
     navigator.locks.request(`draft-${docId}`, { ifAvailable: true }, (lock) => { ... })
     ```
     If `lock === null` (e.g., after *Duplicate tab*, where `sessionStorage` is copied by the browser), the new window immediately generates a fresh `docId`, acquires a lock on it, and skips restoring the original tab's `ownDraft`. Two tabs/windows can never share the same lock or draft.
   - Every edit is saved with a ~500 ms debounce under `draft:<docId>` (`{ docId, fileName, content, isDirty, lastKnownModified, updatedAt }`). File handles are stored separately under `recent-handles`.
   - **Safe cleanup & recovery:** On a clean close (`isDirty === false` or after explicit discard), `draft:<docId>` is deleted (after synchronously persisting `isDirty: false` so `useDraftRecovery` never restores a closed clean document if an async `del()` is interrupted during `pagehide`). On same-window reload (e.g., after a SW update), the window's own `sessionStorage` draft is restored immediately. On a fresh launch with no active file, `useDraftRecovery` checks `navigator.locks.query()` to find `draft:*` records with `isDirty === true` that have **no active lock**; only those orphaned drafts are offered for crash recovery.
2. **Disk Storage (`FileSystemWritableFileStream` & Fallback):**
   - With a valid `FileSystemFileHandle`: writes **only** to the actual `.md` file on explicit user action (`Ctrl+S` / Save button) or via an optional *"Auto-save to file"* toggle (default **OFF** to avoid unintended overwrites on Google Drive mounts).
   - Without File System Access API (fallback mode, `handle === null`): `Save` (`Ctrl+S`) triggers *"Save As"* (or a Blob download of `<fileName>` in Firefox/Safari) and marks the current snapshot as exported.
   - Status indicator in the titlebar distinguishes: `Saved`, `● Unsaved (draft cached locally)`, and `Download mode` / `Read-only`.
3. **Recent Files (`recent-handles`) & Permission Handling (`FileSystemFileHandle`):**
   - The 8 most recently opened files are stored in IndexedDB under `recent-handles` (deduplicated via `await handle.isSameEntry(other)`) and displayed in a dropdown next to *Open* as well as on the empty start screen (with a *"Clear list"* option).
   - Clicking a recent file calls `queryPermission({ mode: 'readwrite' })` and, if needed, `requestPermission({ mode: 'readwrite' })` directly within that same user click (*user activation*). If a file was deleted on disk (`NotFoundError`), the handle is automatically removed from `recent-handles` with a clear toast message.
   - Dragging & dropping an `.md` file from ChromeOS Files onto the window also obtains a full read-write handle via `DataTransferItem.getAsFileSystemHandle()` (guarded by `isDirty`).
4. **Conflict Detection (DriveFS / external modifications):**
   - Right before writing to disk, the engine reads `const current = await handle.getFile()`.
   - If `current.lastModified !== lastKnownModified`, the write is aborted and the user chooses between *Reload file*, *Overwrite anyway*, or *Save as new*.
5. **Unload Protection:** `beforeunload` warning while `isDirty === true` (only bypassed during a deliberate SW-update reload after flushing the active draft to IndexedDB).

---

## 4. Tech Stack & Performance Budgets

### 4.1 Tech Stack
- **Core UI & Build:** React 19 + TypeScript (`strict: true`) + Vite + `vite-plugin-pwa`
- **State Management:** React Context + `useReducer` (no external state library needed in Phase 1)
- **Editor Engine & Code Highlighting:**
  - CodeMirror 6 (`@codemirror/view`, `@codemirror/state`, `@codemirror/commands`, `@codemirror/search`, `@codemirror/autocomplete`, `@codemirror/lang-markdown`)
  - **Curated lazy language pack (no full `@codemirror/language-data`):** Only a compact set of common languages (JS/TS/JSX/TSX, Python, HTML, CSS, JSON, YAML, SQL) is dynamically imported on demand.
  - **Preview code highlighting:** `@lezer/highlight` reuses the exact same Lezer grammars as CodeMirror 6, avoiding any duplicate syntax highlighter (`Prism.js` or `highlight.js`) in the bundle.
- **Markdown & Render Pipeline:**
  - `markdown-it` (~30 KB gz) chosen over `marked` because it provides `token.map = [startLine, endLine]` out of the box for accurate `data-source-line` sync-scroll and a clean `block.ruler` / `inline.ruler` plugin system for math tokens and GFM task lists (`- [ ]` / `- [x]`).
  - `DOMPurify` for mandatory HTML sanitization.
  - `KaTeX` via **dynamic `import()`** (loaded only when the document actually contains math tokens; CSS and `.woff2` fonts are bundled and precached locally for offline use).
- **Styling:** Tailwind CSS + Material Design 3 CSS tokens (light/dark via `prefers-color-scheme` + manual override)
- **Storage:** `idb-keyval` (IndexedDB wrapper)

### 4.2 Performance Budgets
| Metric | Target | Strategy |
| :--- | :--- | :--- |
| **Initial JS bundle** | **< 220 KB (gzipped)** | Lazy curated Lezer languages (reused in preview), no Zustand, KaTeX dynamic import |
| **Total SW precache** | **< 2.0 MB** | Local KaTeX fonts & bundled assets, local system fonts for UI |
| **Cold start (from SW cache)** | **< 1.0 second** | Cache-First app shell, minimal initial render |
| **JS Heap (document < 50 KB)** | **< 40 MB** | Virtualized viewport in CodeMirror 6; debounced preview render (~150 ms) |

*(Note: total Chromium process memory is higher due to the browser runtime and is outside application control.)*

---

## 5. Architecture & Key Subsystems

### 5.1 Parser-Integrated Math, Frontmatter, Code Highlighting & XSS Pipeline
To avoid regex edge-case bugs (`\$100`, `"$5 to $10"`, code blocks, blockquotes) and DOMPurify/KaTeX conflicts, all rendering flows through a strict 4-step pipeline:
1. **Tokenization in `markdown-it`:**
   - **YAML Frontmatter:** A block rule on line 0 detects opening and closing `---` fences and renders properties as a compact, escaped metadata card (`<aside class="frontmatter-card" data-source-line="0">`) instead of `<hr>` + `<h2>`.
   - **Math:** Custom `block.ruler` (`$$...$$`) and `inline.ruler` (`$...$`) plugins automatically respect CommonMark code blocks, escapes (`\$`), and blockquotes, and enforce strict inline boundaries (no space immediately after opening `$` or before closing `$`). Each valid math expression is stored in a per-render `Map<string, { expr: string; display: boolean }>` (key = `crypto.randomUUID()`), emitting an empty placeholder `<span data-math-id="<uuid>"></span>` (or `<div>`).
   - **Interactive Task Lists & Heading Extraction (TOC):** Task list items (`- [ ]` / `- [x]`) receive `<input type="checkbox" data-task-line="<line>">`. In the same render pass, all `H1–H3` headings with their `data-source-line` are collected for the clickable Document Outline (TOC).
   - **Code Block Highlighting & Copy Button:** `@lezer/highlight` adds `.tok-*` spans for supported languages and always escapes unknown languages via `md.utils.escapeHtml()`. Each `<pre>` block in preview mode gets `<button type="button" class="copy-code-btn" aria-label="Copy code">`.
   - **Image Filter:** External/relative images (anything other than safe `data:image/(png|jpeg|gif|webp);base64,` or `blob:`) are rewritten inside the `markdown-it` `image` renderer to a safe `<span class="blocked-img" data-blocked-src="...">` placeholder so no CSP violations or 404 requests occur.
2. **Sanitization (`DOMPurify`):** Cleans all generated HTML (including frontmatter and code-highlight HTML):
   - Task list checkboxes (`<input type="checkbox" data-task-line>`), `button.copy-code-btn`, `class` on code/highlight/frontmatter elements, `data-source-line`, `data-math-id`, and `data-blocked-src` are explicitly allowlisted.
   - `<a href>` receives `rel="noopener noreferrer"`; unsafe schemes (`javascript:`, `data:text/html`) and `data:image/svg+xml` are stripped.
3. **Safe DOM Insertion via `<template>`:** Sanitized HTML is parsed inside an in-memory `<template>` (no fragile string replacement).
4. **Lazy Math Substitution:** Only when the `Map` is non-empty, `await import('katex')` is executed and `[data-math-id]` nodes in the fragment are populated via `katex.renderToString(expr, { displayMode, throwOnError: false, trust: false, strict: 'ignore' })` (`strict: 'ignore'` prevents console spam while typing incomplete formulas).

### 5.2 Content Security Policy & Image Policy
Because GitHub Pages does not support custom HTTP headers, the CSP is declared via `<meta http-equiv="Content-Security-Policy">` in `index.html`:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self';">
```
- **Privacy-first image policy:** External `https://` images (tracking pixels / unexpected network traffic) and relative local paths (`./photo.png`, inaccessible in single-file mode without a DirectoryHandle) are replaced before DOM insertion with a placeholder showing `alt` text and a subtle info banner.
- `script-src 'self'` disallows inline scripts and `eval`; `style-src 'self' 'unsafe-inline'` is required for dynamic styles from CodeMirror 6 and KaTeX.

### 5.3 Window Controls Overlay (WCO), Responsive Layout & `theme-color`
- **WCO CSS:** The titlebar uses `env(titlebar-area-x, 0px)`, `env(titlebar-area-y, 0px)`, `env(titlebar-area-width, 100%)`, and `env(titlebar-area-height, 44px)`.
- **Overflow protection on narrow screens:** File names use `min-width: 0` + `truncate`; on Chromebook split-screen (`< 768px`), secondary buttons (Export, Theme) collapse into a compact overflow menu so nothing collides with ChromeOS window controls.
- **Drag regions:** Empty titlebar space uses `-webkit-app-region: drag`; all interactive elements (including the overflow menu) use `-webkit-app-region: no-drag`, listening to `navigator.windowControlsOverlay?.addEventListener('geometrychange', ...)`.
- **Light/Dark `theme-color` sync:** `index.html` includes dual `<meta name="theme-color">` tags with `media="(prefers-color-scheme: light)"` (`#FFFBFE`) and `media="(prefers-color-scheme: dark)"` (`#1C1B1F`). On manual theme toggle, `useTheme.ts` updates them dynamically.

### 5.4 Editor UX, Sync-Scroll, Google Docs Copy, HTML Export & Print/PDF
- **Editor productivity (`/` Slash Commands, Command Palette, Smart Link Paste & Clickable Checkboxes):**
  - *`/` Slash Commands:* Typing `/` at the start of a line or after whitespace opens CodeMirror autocompletion with Markdown blocks (headings, tables, task lists, code blocks, math, callouts, frontmatter).
  - *Command Palette (`Ctrl+/` or `Ctrl+Shift+P`):* Quick fuzzy search across all Markdown insertions, file actions, view toggles, and Help.
  - *Searchable Help & Cheat Sheet (`F1`):* Built-in modal with categorized syntax guides, shortcuts, and one-click snippet insertion.
  - *Smart Link Paste:* Pasting (`Ctrl+V`) a valid `http(s)://` URL while single-line text is selected in CodeMirror automatically creates `[selected text](url)`.
  - *Clickable task lists in Preview:* Clicking a checkbox in `Preview.tsx` reads `data-task-line` and dispatches a CodeMirror transaction toggling `- [ ]` and `- [x]` on that source line (fully compatible with `Ctrl+Z` undo/redo).
  - *Document Outline (TOC):* Toolbar popover displays the `H1–H3` hierarchy; clicking scrolls both CodeMirror and Preview to the matching `data-source-line`.
- **Sync-scroll:** `markdown-it` core/renderer hook attaches `data-source-line` on top-level blocks from `token.map[0]`. Scrolling in CodeMirror (`view.lineBlockAtHeight`) maps to the nearest `data-source-line` element in the preview (with a toolbar toggle to disable sync).
- **"Copy for Google Docs / Gmail" (`ClipboardItem`):** Places sanitized rich HTML (`text/html`, stripped of internal `data-*` attributes and copy buttons, with `disabled` on checkboxes) alongside raw Markdown (`text/plain`) on the clipboard so pasting into Google Docs or Gmail preserves formatted headings, tables, and lists.
- **Standalone `.html` Export (`exportHtml.ts`):** Generates a self-contained offline `<!doctype html>` document with embedded readable CSS (typography, tables, and `.tok-*` syntax-highlighting colors from `@lezer/highlight`, without interactive UI buttons). When the document contains math, the exporter renders formulas using KaTeX `output: 'mathml'` (native browser MathML in ChromeOS 109+, Firefox, and Safari) so the exported `.html` file requires **no** external or relative `.woff2` font paths.
- **PDF / Print (`@media print`):** Hides UI chrome, copy buttons, and the editor pane; enforces high-contrast light colors (even from dark mode); prevents page splits inside `<pre>`, `<blockquote>`, and `<table>` via `break-inside: avoid`.

### 5.5 Service Worker & `vite-plugin-pwa` Configuration
- `vite.config.ts` sets `base: './'` and configures:
  ```ts
  VitePWA({
    registerType: 'prompt',
    manifest: false,
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,woff2,webmanifest}'],
      navigateFallback: 'index.html',
      ignoreURLParametersMatching: [/^action$/],
    },
  })
  ```
- `manifest: false` keeps `public/manifest.webmanifest` as the single source of truth (note: `<link rel="manifest" href="./manifest.webmanifest">` must be present manually in `index.html` because `vite-plugin-pwa` does not inject it when `manifest: false`).
- `navigateFallback: 'index.html'` (without a leading slash, safe for GitHub Pages subpaths) + `ignoreURLParametersMatching: [/^action$/]` ensures the Shelf shortcut `./index.html?action=new` also works 100% offline.
- `registerType: 'prompt'` prevents unexpected reloads while typing; on update, a toast shows *"New version available — Reload"* (flushing any active draft to IndexedDB before calling `updateServiceWorker(true)`).

---

## 6. PWA Manifest & Directory Structure

### 6.1 `public/manifest.webmanifest`
```json
{
  "id": "./",
  "name": "Pilgrim Markdown",
  "short_name": "Pilgrim MD",
  "description": "Fast, offline-first Material 3 Markdown editor",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone"],
  "launch_handler": {
    "client_mode": "focus-existing"
  },
  "background_color": "#1C1B1F",
  "theme_color": "#1C1B1F",
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "./icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "file_handlers": [
    {
      "action": "./index.html",
      "name": "Markdown Documents",
      "launch_type": "multiple-clients",
      "icons": [{ "src": "./icons/file-md.png", "sizes": "96x96", "type": "image/png" }],
      "accept": {
        "text/markdown": [".md", ".markdown"],
        "text/plain": [".txt"]
      }
    }
  ],
  "shortcuts": [
    {
      "name": "New Document",
      "url": "./index.html?action=new",
      "icons": [{ "src": "./icons/shortcut-new.png", "sizes": "96x96", "type": "image/png" }]
    }
  ]
}
```

### 6.2 Directory Structure
```text
Pilgrim-Markdown/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Typecheck, Lint, Test, Build & Pages Deploy
├── public/
│   ├── favicon.ico
│   ├── manifest.webmanifest    # Single source of truth (VitePWA manifest: false)
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       ├── icon-maskable-512.png
│       ├── file-md.png
│       └── shortcut-new.png
├── src/
│   ├── components/
│   │   ├── Titlebar.tsx        # WCO integration + Recent Files menu + responsive overflow
│   │   ├── Toolbar.tsx         # MD3 formatting buttons + Command Palette + TOC outline + Focus mode
│   │   ├── Editor.tsx          # CodeMirror 6 + slash commands + Smart Link Paste
│   │   ├── Preview.tsx         # Sanitized preview + clickable checkboxes + code copy + sync-scroll
│   │   ├── StatusBar.tsx       # Words, characters, cursor position, save status
│   │   ├── ConflictModal.tsx   # Dialog for external modification / dirty launch
│   │   ├── CommandPalette.tsx  # Ctrl+/ / Ctrl+Shift+P quick command launcher
│   │   └── HelpModal.tsx       # F1 searchable help & cheat sheet
│   ├── context/
│   │   └── DocumentContext.tsx # Document state, dirty tracking, active handle, recent-handles
│   ├── hooks/
│   │   ├── useFileSystem.ts    # File System Access, LaunchQueue, Drag&Drop handles & Fallbacks
│   │   ├── useDraftRecovery.ts # Multi-window-safe IndexedDB drafts (Web Locks ifAvailable)
│   │   ├── useFocusTrap.ts     # Modal Tab/Shift+Tab focus trap & focus restoration
│   │   └── useTheme.ts         # MD3 light/dark + meta theme-color sync
│   ├── utils/
│   │   ├── commands.ts         # Slash commands & searchable Help topics registry
│   │   ├── languages.ts        # Lazy-loaded curated Lezer language parsers
│   │   ├── markdown.ts         # markdown-it (frontmatter, math, tasklist, TOC, Lezer, blocked-img), DOMPurify, lazy KaTeX
│   │   ├── exportHtml.ts       # Standalone HTML export (CSS + KaTeX MathML) & Rich Text Copy helper
│   │   ├── markdown.test.ts    # Vitest unit, frontmatter, math edge-case, SQL & XSS regression tests
│   │   └── idb.ts              # IndexedDB storage for recent-handles & drafts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css               # MD3 CSS variables & @media print
├── index.html                  # Includes CSP meta tag & dual media theme-color
├── package.json
├── tsconfig.json               # strict: true
├── vite.config.ts              # base: './' + VitePWA plugin (manifest: false)
├── LICENSE                     # MIT (source code)
├── TRADEMARKS.md               # Pilgrim Software brand & logo All Rights Reserved policy
└── README.md
```

---

## 7. CI/CD & Quality Assurance

### 7.1 GitHub Actions Pipeline (`.github/workflows/deploy.yml`)
1. `npm ci`
2. `npx tsc --noEmit` (strict TypeScript check; `vite build` does not run typechecking)
3. `npm run lint` (ESLint)
4. `npm test` (Vitest: Markdown pipeline, math edge cases, XSS payloads, blocked-image rewrite, SQL highlighting, slash commands)
5. `npm run build` (Vite production build + Workbox PWA precache)
6. Deploy to GitHub Pages (only on `main` after checks 1–5 pass)

### 7.2 Mandatory Acceptance Criteria Before v1.0 Release
- [ ] **Naming & Brand check complete:** App name `Pilgrim Markdown` and repo `Pilgrim-Markdown` verified on GitHub (note case-sensitivity of `/Pilgrim-Markdown/` on GitHub Pages); `TRADEMARKS.md` in place.
- [ ] **XSS & Math suite green:** Vitest confirms `<script>`, `onerror=`, `javascript:` links, code-block HTML, and `data:image/svg+xml` are neutralized, and `$5 to $10` / `\$100` are not parsed as math.
- [ ] **Multi-window, Tab Duplication & Offline verification:** Open two `.md` files simultaneously on ChromeOS without draft collision; duplicating a tab assigns a separate lock/draft; `?action=new` works offline; full offline functionality without Wi-Fi.
- [ ] **File Handling & Conflict test:** Open `.md` file from ChromeOS Files app (local + Google Drive mount), `?action=new` with `isDirty` guard, and conflict prompt after external modification.
- [ ] **HTML Export & Fallback test:** Exported `.html` (including math via MathML) opens standalone without broken fonts; basic workflow works in Firefox or Safari.
- [ ] **Lighthouse & Split-screen:** PWA installability & Accessibility >= 95; WCO titlebar remains usable at 680 px width.
