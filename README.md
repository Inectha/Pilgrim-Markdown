# Pilgrim Markdown (`Pilgrim-Markdown`)

Fast, offline-first **Material Design 3 Markdown editor** for ChromeOS (and other desktop browsers).

## Features
- **ChromeOS Native PWA:** Open and save `.md`, `.markdown`, and `.txt` files directly from the ChromeOS Files app (local storage & Google Drive mount) with multi-window support (`multiple-clients`) and Window Controls Overlay.
- **100% Offline & Privacy-first:** No accounts, no servers, and no external CDN requests. Fully precached via Service Worker (`vite-plugin-pwa`).
- **Powerful Editor & Live Preview:** CodeMirror 6 with `/` slash-command autocompletion, Command Palette (`Ctrl+/` / `Ctrl+Shift+P`), Smart Link Paste, synchronized scrolling (`data-source-line`), clickable task lists, copy buttons on code blocks, YAML frontmatter cards, clickable Document Outline (`H1–H3`), and lazy-loaded KaTeX math.
- **Accessible & Beginner-friendly:** Full keyboard navigation, focus-trapped modals, ARIA support, and a searchable Help & Cheat Sheet modal (`F1`) with live snippet insertion.
- **Secure by Design:** Strict Content Security Policy (CSP) and HTML sanitization via `DOMPurify`.
- **Crash Recovery & Conflict Detection:** Multi-window-safe IndexedDB drafts using the Web Locks API and external file modification checks (`lastModified`) before overwriting.
- **Export & Clipboard:** Save directly to `.md`, export as standalone `.html` (with embedded CSS and native MathML), print to PDF (`@media print`), and one-click **"Copy for Google Docs / Gmail"**.

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
