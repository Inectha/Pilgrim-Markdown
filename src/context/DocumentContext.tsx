import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  RecentHandleEntry,
  getRecentHandles,
  addRecentHandle,
  removeRecentHandle,
  clearRecentHandles,
} from '../utils/idb';

export type ViewMode = 'editor' | 'split' | 'preview';

export interface DocumentTab {
  id: string;
  fileName: string;
  filePath?: string;
  driveFileId?: string | null;
  driveModifiedTime?: string | null;
  content: string;
  savedContent: string;
  handle: FileSystemFileHandle | null;
  lastKnownModified: number | null;
  cursorPos: { line: number; col: number };
}

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

function generateId(prefix: string): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function getOrCreateInitialDocId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_DOC_ID_KEY);
    if (existing) return existing;
    const next = generateId('ws');
    sessionStorage.setItem(SESSION_DOC_ID_KEY, next);
    return next;
  } catch {
    return generateId('ws');
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
- [ ] Open a **Folder Vault** (local or Google Drive) to browse files and work across multiple tabs

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
| \`Ctrl + P\` | Quick-switch files in Vault / Command Palette |
| \`Ctrl + B\` / \`Ctrl + I\` | **Bold** or *Italic* |
`;

interface DocumentContextValue {
  docId: string;
  reassignDocId: () => string;
  tabs: DocumentTab[];
  activeTabId: string;
  anyDirty: boolean;
  fileName: string;
  filePath?: string;
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
    filePath?: string;
    content: string;
    handle: FileSystemFileHandle | null;
    lastModified: number | null;
    markDirty?: boolean;
  }) => void;
  openTab: (params: {
    fileName: string;
    filePath?: string;
    driveFileId?: string | null;
    driveModifiedTime?: string | null;
    content: string;
    handle: FileSystemFileHandle | null;
    lastModified: number | null;
    markDirty?: boolean;
  }) => Promise<string>;
  switchTab: (tabId: string) => void;
  newTab: () => string;
  closeTab: (tabId: string) => void;
  restoreWorkspaceTabs: (restoredTabs: DocumentTab[], nextActiveTabId: string) => void;
  updateTabFromDisk: (
    tabId: string,
    params: { content: string; lastModified: number | null; fileName?: string }
  ) => void;
  markSaved: (params: {
    tabId?: string;
    fileName?: string;
    filePath?: string;
    driveFileId?: string | null;
    driveModifiedTime?: string | null;
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

function createEmptyTab(initialContent: string = ''): DocumentTab {
  return {
    id: generateId('tab'),
    fileName: 'Untitled.md',
    content: initialContent,
    savedContent: initialContent,
    handle: null,
    lastKnownModified: null,
    cursorPos: { line: 1, col: 1 },
  };
}

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [docId, setDocId] = useState<string>(getOrCreateInitialDocId);
  const [tabs, setTabs] = useState<DocumentTab[]>(() => [
    createEmptyTab(DEFAULT_WELCOME_MARKDOWN),
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(() => '');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [zenMode, setZenMode] = useState<boolean>(false);
  const [syncScroll, setSyncScroll] = useState<boolean>(true);
  const [autoSaveToDisk, setAutoSaveToDisk] = useState<boolean>(false);
  const [recentHandles, setRecentHandles] = useState<RecentHandleEntry[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [conflictModal, setConflictModal] = useState<ConflictModalState | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const resolvedActiveTabId = activeTab.id;
  const fileName = activeTab.fileName;
  const filePath = activeTab.filePath;
  const content = activeTab.content;
  const savedContent = activeTab.savedContent;
  const handle = activeTab.handle;
  const lastKnownModified = activeTab.lastKnownModified;
  const cursorPos = activeTab.cursorPos;
  const isDirty = content !== savedContent;
  const anyDirty = tabs.some((t) => t.content !== t.savedContent);

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
    const next = generateId('ws');
    try {
      sessionStorage.setItem(SESSION_DOC_ID_KEY, next);
    } catch {
      // Ignore
    }
    setDocId(next);
    return next;
  }, []);

  const updateActiveTab = useCallback(
    (updater: (tab: DocumentTab) => DocumentTab) => {
      setTabs((prev) => {
        const targetId = prev.some((t) => t.id === activeTabId) ? activeTabId : prev[0].id;
        return prev.map((t) => (t.id === targetId ? updater(t) : t));
      });
    },
    [activeTabId]
  );

  const setContent = useCallback(
    (next: string) => {
      updateActiveTab((t) => ({ ...t, content: next }));
    },
    [updateActiveTab]
  );

  const setFileName = useCallback(
    (name: string) => {
      updateActiveTab((t) => ({ ...t, fileName: name }));
    },
    [updateActiveTab]
  );

  const setCursorPos = useCallback(
    (pos: { line: number; col: number }) => {
      updateActiveTab((t) => ({ ...t, cursorPos: pos }));
    },
    [updateActiveTab]
  );

  const loadDocument = useCallback(
    (params: {
      fileName: string;
      filePath?: string;
      content: string;
      handle: FileSystemFileHandle | null;
      lastModified: number | null;
      markDirty?: boolean;
    }) => {
      updateActiveTab((t) => ({
        ...t,
        fileName: params.fileName,
        filePath: params.filePath,
        content: params.content,
        savedContent: params.markDirty ? '' : params.content,
        handle: params.handle,
        lastKnownModified: params.lastModified,
      }));
    },
    [updateActiveTab]
  );

  const openTab = useCallback(
    async (params: {
      fileName: string;
      filePath?: string;
      driveFileId?: string | null;
      driveModifiedTime?: string | null;
      content: string;
      handle: FileSystemFileHandle | null;
      lastModified: number | null;
      markDirty?: boolean;
    }): Promise<string> => {
      for (const existing of tabs) {
        if (params.driveFileId && existing.driveFileId === params.driveFileId) {
          setActiveTabId(existing.id);
          return existing.id;
        }
        if (params.filePath && existing.filePath === params.filePath) {
          setActiveTabId(existing.id);
          return existing.id;
        }
        if (params.handle && existing.handle) {
          try {
            if (await existing.handle.isSameEntry(params.handle)) {
              setActiveTabId(existing.id);
              return existing.id;
            }
          } catch {
            // Ignore handle comparison errors
          }
        }
      }

      const newId = generateId('tab');
      const nextTab: DocumentTab = {
        id: newId,
        fileName: params.fileName,
        filePath: params.filePath,
        driveFileId: params.driveFileId ?? null,
        driveModifiedTime: params.driveModifiedTime ?? null,
        content: params.content,
        savedContent: params.markDirty ? '' : params.content,
        handle: params.handle,
        lastKnownModified: params.lastModified,
        cursorPos: { line: 1, col: 1 },
      };

      setTabs((prev) => {
        const current = prev.find((t) => t.id === activeTabId) ?? prev[0];
        const isCleanPlaceholder =
          prev.length === 1 &&
          !current.handle &&
          !current.filePath &&
          !current.driveFileId &&
          current.content === current.savedContent &&
          (current.content === DEFAULT_WELCOME_MARKDOWN || current.content === '');
        if (isCleanPlaceholder) {
          return [nextTab];
        }
        return [...prev, nextTab];
      });
      setActiveTabId(newId);
      return newId;
    },
    [tabs, activeTabId]
  );

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const newTab = useCallback((): string => {
    const fresh = createEmptyTab('');
    setTabs((prev) => [...prev, fresh]);
    setActiveTabId(fresh.id);
    return fresh.id;
  }, []);

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        if (idx === -1) return prev;
        if (prev.length === 1) {
          const fresh = createEmptyTab('');
          setActiveTabId(fresh.id);
          return [fresh];
        }
        const next = prev.filter((t) => t.id !== tabId);
        if (tabId === resolvedActiveTabId) {
          const fallback = next[Math.min(idx, next.length - 1)];
          setActiveTabId(fallback.id);
        }
        return next;
      });
    },
    [resolvedActiveTabId]
  );

  const restoreWorkspaceTabs = useCallback(
    (restoredTabs: DocumentTab[], nextActiveTabId: string) => {
      if (restoredTabs.length === 0) return;
      setTabs(restoredTabs);
      setActiveTabId(
        restoredTabs.some((t) => t.id === nextActiveTabId)
          ? nextActiveTabId
          : restoredTabs[0].id
      );
    },
    []
  );

  const updateTabFromDisk = useCallback(
    (
      tabId: string,
      params: { content: string; lastModified: number | null; fileName?: string }
    ) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                fileName: params.fileName ?? t.fileName,
                content: params.content,
                savedContent: params.content,
                lastKnownModified: params.lastModified,
              }
            : t
        )
      );
    },
    []
  );

  const markSaved = useCallback(
    (params: {
      tabId?: string;
      fileName?: string;
      filePath?: string;
      driveFileId?: string | null;
      driveModifiedTime?: string | null;
      handle?: FileSystemFileHandle | null;
      lastModified: number | null;
      savedText?: string;
    }) => {
      setTabs((prev) => {
        const targetId =
          params.tabId ?? (prev.some((t) => t.id === activeTabId) ? activeTabId : prev[0].id);
        return prev.map((t) => {
          if (t.id !== targetId) return t;
          return {
            ...t,
            fileName: params.fileName !== undefined ? params.fileName : t.fileName,
            filePath: params.filePath !== undefined ? params.filePath : t.filePath,
            driveFileId: params.driveFileId !== undefined ? params.driveFileId : t.driveFileId,
            driveModifiedTime:
              params.driveModifiedTime !== undefined
                ? params.driveModifiedTime
                : t.driveModifiedTime,
            handle: params.handle !== undefined ? params.handle : t.handle,
            lastKnownModified: params.lastModified,
            savedContent: params.savedText !== undefined ? params.savedText : t.savedContent,
          };
        });
      });
    },
    [activeTabId]
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

  useEffect(() => {
    document.title = `${isDirty ? '● ' : ''}${fileName} — Pilgrim Markdown`;
  }, [fileName, isDirty]);

  return (
    <DocumentContext.Provider
      value={{
        docId,
        reassignDocId,
        tabs,
        activeTabId: resolvedActiveTabId,
        anyDirty,
        fileName,
        filePath,
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
        openTab,
        switchTab,
        newTab,
        closeTab,
        restoreWorkspaceTabs,
        updateTabFromDisk,
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
