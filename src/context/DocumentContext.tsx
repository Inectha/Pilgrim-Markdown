import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  RecentHandleEntry,
  getRecentHandles,
  addRecentHandle,
  removeRecentHandle,
  clearRecentHandles,
} from '../utils/idb';

export type ViewMode = 'editor' | 'split' | 'preview';

export interface ConflictModalState {
  kind: 'unsaved-changes' | 'external-modification';
  title: string;
  description: string;
  onSaveAndContinue?: () => void;
  onDiscardAndContinue: () => void;
  onSaveAsNew?: () => void;
  onCancel: () => void;
}

const SESSION_DOC_ID_KEY = 'pilgrim-md-doc-id';

function getOrCreateInitialDocId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_DOC_ID_KEY);
    if (existing) return existing;
    const next =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `doc-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    sessionStorage.setItem(SESSION_DOC_ID_KEY, next);
    return next;
  } catch {
    return `doc-${Math.random().toString(36).slice(2)}`;
  }
}

const DEFAULT_WELCOME_MARKDOWN = `---
title: Welcome to Pilgrim Markdown
platform: ChromeOS PWA
status: Offline-first
---

# Welcome to Pilgrim Markdown

A fast, **offline-first Material Design 3** Markdown editor for ChromeOS and desktop browsers.

## Quick Start

- [x] Open or edit local \`.md\`, \`.markdown\`, and \`.txt\` files
- [x] Click these task list checkboxes directly in the Live Preview
- [ ] Try **Smart Link Paste**: select a word in the editor and paste a URL (\`Ctrl+V\`)

## Code & Math

\`\`\`typescript
function greet(name: string): string {
  return \`Welcome to Pilgrim Markdown, \${name}!\`;
}
\`\`\`

Inline math like $E = mc^2$ or the Pythagorean theorem ($a^2 + b^2 = c^2$) renders automatically:

$$
\\int_{0}^{\\infty} e^{-x^2} \\, dx = \\frac{\\sqrt{\\pi}}{2}
$$

| Shortcut | Action |
| :--- | :--- |
| \`Ctrl + S\` | Save directly to file |
| \`Ctrl + O\` | Open file |
| \`Ctrl + B\` / \`Ctrl + I\` | **Bold** or *Italic* |
`;

interface DocumentContextValue {
  docId: string;
  reassignDocId: () => string;
  fileName: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
  handle: FileSystemFileHandle | null;
  lastKnownModified: number | null;
  viewMode: ViewMode;
  zenMode: boolean;
  syncScroll: boolean;
  autoSaveToDisk: boolean;
  cursorPos: { line: number; col: number };
  recentHandles: RecentHandleEntry[];
  toastMessage: string | null;
  conflictModal: ConflictModalState | null;
  setContent: (next: string) => void;
  setFileName: (name: string) => void;
  loadDocument: (params: {
    fileName: string;
    content: string;
    handle: FileSystemFileHandle | null;
    lastModified: number | null;
    markDirty?: boolean;
  }) => void;
  markSaved: (params: {
    fileName?: string;
    handle?: FileSystemFileHandle | null;
    lastModified: number | null;
    savedText?: string;
  }) => void;
  setViewMode: (mode: ViewMode) => void;
  setZenMode: React.Dispatch<React.SetStateAction<boolean>>;
  setSyncScroll: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoSaveToDisk: React.Dispatch<React.SetStateAction<boolean>>;
  setCursorPos: (pos: { line: number; col: number }) => void;
  showToast: (msg: string) => void;
  setConflictModal: (modal: ConflictModalState | null) => void;
  recordRecentHandle: (h: FileSystemFileHandle) => Promise<void>;
  forgetRecentHandle: (h: FileSystemFileHandle) => Promise<void>;
  wipeRecentHandles: () => Promise<void>;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [docId, setDocId] = useState<string>(getOrCreateInitialDocId);
  const [fileName, setFileName] = useState<string>('Untitled.md');
  const [content, setContentState] = useState<string>(DEFAULT_WELCOME_MARKDOWN);
  const [savedContent, setSavedContent] = useState<string>(DEFAULT_WELCOME_MARKDOWN);
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [lastKnownModified, setLastKnownModified] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [zenMode, setZenMode] = useState<boolean>(false);
  const [syncScroll, setSyncScroll] = useState<boolean>(true);
  const [autoSaveToDisk, setAutoSaveToDisk] = useState<boolean>(false);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const [recentHandles, setRecentHandles] = useState<RecentHandleEntry[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [conflictModal, setConflictModal] = useState<ConflictModalState | null>(null);

  const isDirty = content !== savedContent;

  useEffect(() => {
    getRecentHandles().then(setRecentHandles);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const reassignDocId = useCallback((): string => {
    const next =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `doc-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    try {
      sessionStorage.setItem(SESSION_DOC_ID_KEY, next);
    } catch {
      // Ignore
    }
    setDocId(next);
    return next;
  }, []);

  const setContent = useCallback((next: string) => {
    setContentState(next);
  }, []);

  const loadDocument = useCallback(
    (params: {
      fileName: string;
      content: string;
      handle: FileSystemFileHandle | null;
      lastModified: number | null;
      markDirty?: boolean;
    }) => {
      setFileName(params.fileName);
      setContentState(params.content);
      setSavedContent(params.markDirty ? '' : params.content);
      setHandle(params.handle);
      setLastKnownModified(params.lastModified);
    },
    []
  );

  const markSaved = useCallback(
    (params: {
      fileName?: string;
      handle?: FileSystemFileHandle | null;
      lastModified: number | null;
      savedText?: string;
    }) => {
      if (params.fileName !== undefined) setFileName(params.fileName);
      if (params.handle !== undefined) setHandle(params.handle);
      setLastKnownModified(params.lastModified);
      setSavedContent((prev) => (params.savedText !== undefined ? params.savedText : prev));
    },
    []
  );

  const recordRecentHandle = useCallback(async (h: FileSystemFileHandle) => {
    const updated = await addRecentHandle(h);
    setRecentHandles(updated);
  }, []);

  const forgetRecentHandle = useCallback(async (h: FileSystemFileHandle) => {
    const updated = await removeRecentHandle(h);
    setRecentHandles(updated);
  }, []);

  const wipeRecentHandles = useCallback(async () => {
    await clearRecentHandles();
    setRecentHandles([]);
  }, []);

  // Update window title with dirty indicator and filename
  useEffect(() => {
    document.title = `${isDirty ? '● ' : ''}${fileName} — Pilgrim Markdown`;
  }, [fileName, isDirty]);

  return (
    <DocumentContext.Provider
      value={{
        docId,
        reassignDocId,
        fileName,
        content,
        savedContent,
        isDirty,
        handle,
        lastKnownModified,
        viewMode,
        zenMode,
        syncScroll,
        autoSaveToDisk,
        cursorPos,
        recentHandles,
        toastMessage,
        conflictModal,
        setContent,
        setFileName,
        loadDocument,
        markSaved,
        setViewMode,
        setZenMode,
        setSyncScroll,
        setAutoSaveToDisk,
        setCursorPos,
        showToast,
        setConflictModal,
        recordRecentHandle,
        forgetRecentHandle,
        wipeRecentHandles,
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
};

export function useDocument(): DocumentContextValue {
  const ctx = useContext(DocumentContext);
  if (!ctx) {
    throw new Error('useDocument must be used inside DocumentProvider');
  }
  return ctx;
}
