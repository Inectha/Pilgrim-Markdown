<div align="center">
  <img src="./public/icons/icon-192.png" alt="Pilgrim Markdown logo" width="84" height="84" />
  <h1>Pilgrim Markdown</h1>
  <p><strong>Fast, offline-first Material Design 3 Markdown editor PWA for ChromeOS and desktop browsers.</strong></p>

  <p>
    <a href="https://inectha.github.io/Pilgrim-Markdown/">
      <img src="https://img.shields.io/badge/Launch_App-Pilgrim_Markdown-6750A4?style=plastic&logo=googlechrome&logoColor=white" alt="Launch Pilgrim Markdown" />
    </a>
  </p>

  <p>
    <a href="https://github.com/Inectha/Pilgrim-Markdown/actions/workflows/deploy.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/Inectha/Pilgrim-Markdown/deploy.yml?branch=main&style=plastic&logo=githubactions&logoColor=white&label=Build%20%26%20Deploy" alt="Build and Deploy status" />
    </a>
    <img src="https://img.shields.io/badge/ChromeOS-PWA_%26_Desktop-1A73E8?style=plastic&logo=googlechrome&logoColor=white" alt="ChromeOS PWA and Desktop" />
    <img src="https://img.shields.io/badge/Offline-100%25_Ready-2E7D32?style=plastic&logo=pwa&logoColor=white" alt="100% Offline Ready" />
    <img src="https://img.shields.io/badge/TypeScript-React_19-20232A?style=plastic&logo=react&logoColor=61DAFB" alt="TypeScript and React 19" />
  </p>

  <p>
    <a href="./LICENSE">
      <img src="https://img.shields.io/badge/License-MIT_(Code)-4A4458?style=plastic&logo=opensourceinitiative&logoColor=white" alt="MIT License (Code)" />
    </a>
    <a href="./TRADEMARKS.md">
      <img src="https://img.shields.io/badge/Brand_%26_Logo-All_Rights_Reserved-7C3AED?style=plastic&logo=shield&logoColor=white" alt="Brand and Logo All Rights Reserved" />
    </a>
  </p>
</div>

---

## Live App & Installation

Open **[https://inectha.github.io/Pilgrim-Markdown/](https://inectha.github.io/Pilgrim-Markdown/)** in Chrome or Edge and click the **Install** icon in the address bar.

- **ChromeOS / Chromebooks:** Installs as a native-feeling app with its own Launcher & Shelf icon, Window Controls Overlay, and automatic `.md` / `.markdown` / `.txt` association in the ChromeOS **Files** app (local storage & Google Drive mount).
- **School / Managed Chromebooks (Google Admin Console):** Admins can deploy it across student Chromebooks via *Devices → Chrome → Apps & extensions → Add by URL* using `https://inectha.github.io/Pilgrim-Markdown/`.

## Features

- **100% Offline & Privacy-First:** No accounts, no servers, no telemetry, and no external CDN requests. Fully precached via Service Worker (`vite-plugin-pwa`).
- **Beginner-Friendly & Fast:** Type `/` anywhere for **slash-command autocompletion**, press `Ctrl+/` (or `Ctrl+Shift+P`) for the **Command Palette**, or press `F1` for the searchable **Help & Cheat Sheet** with one-click snippet insertion.
- **Powerful Editor & Live Preview:** CodeMirror 6 with Smart Link Paste, synchronized scrolling (`data-source-line`), clickable task lists, copy buttons on code blocks, YAML frontmatter cards, clickable Document Outline (`H1–H3`), and lazy-loaded KaTeX math.
- **Multi-Tab Workspace & Folder Vault:** Open any local or ChromeOS **Google Drive** folder (`showDirectoryPicker`) in the collapsible sidebar explorer, edit multiple documents in tabs (preserving per-tab undo/redo history), quick-switch files with `Ctrl+P`, and automatically render relative local images (`./assets/diagram.png`) inside the open vault.
- **Google Drive Cloud Sync (2 Modes):**
  - **ChromeOS Native DriveFS Sync:** Open a Google Drive folder vault with automatic background change detection (`lastModified` watching) and conflict prompts.
  - **Direct Browser Cloud Sync:** Optional zero-server OAuth 2.0 + Google Drive REST API v3 (`drive.file` scope) sync with an offline IndexedDB sync queue and remote conflict detection.
- **Accessible by Design:** Keyboard-navigable UI, focus-trapped modals, ARIA roles, and high-contrast Material Design 3 light & dark themes.
- **Secure by Design:** Strict Content Security Policy (CSP) and HTML sanitization via `DOMPurify`.
- **Crash Recovery & Conflict Detection:** Multi-window-safe IndexedDB drafts using the Web Locks API and external file modification checks (`lastModified`) before overwriting.
- **Export & Clipboard:** Save directly to `.md`, export as standalone `.html` (with embedded CSS and native MathML), print to PDF (`@media print`), and one-click **Copy for Google Docs / Gmail**.

## Key Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `/` | Open inline Markdown slash-command menu |
| `Ctrl+P` / `Ctrl+/` / `Ctrl+Shift+P` | Quick-switch Vault files & Command Palette |
| `F1` | Open searchable Help & Cheat Sheet |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / Save As |
| `Ctrl+O` | Open file |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+K` | Bold / Italic / Insert link |

## Development

```bash
npm install
npm run dev
```

## Quality Checks & Build

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

See [BLUEPRINT.md](./BLUEPRINT.md) for the full technical architecture.

## License & Trademarks

- **Source code:** Licensed under the [MIT License](./LICENSE).
- **Names & Brand Assets (`Pilgrim Software`, `Pilgrim Markdown`, `Pilgrim MD`, and all logos/icons):** Copyright © 2026 Pilgrim Software — All Rights Reserved. See [TRADEMARKS.md](./TRADEMARKS.md). Forks and redistributions must use their own name and branding.
