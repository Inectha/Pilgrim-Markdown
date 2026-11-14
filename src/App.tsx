import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { DocumentProvider, useDocument } from './context/DocumentContext';
import { useTheme } from './hooks/useTheme';
import { useDraftRecovery } from './hooks/useDraftRecovery';
import { useFileSystem } from './hooks/useFileSystem';
import { useVault } from './hooks/useVault';
import { Titlebar } from './components/Titlebar';
import { Toolbar } from './components/Toolbar';
import { TabBar } from './components/TabBar';
import { VaultSidebar } from './components/VaultSidebar';
import { Editor, EditorHandle, FormattingAction } from './components/Editor';
import { Preview, PreviewHandle } from './components/Preview';
import { StatusBar } from './components/StatusBar';
import { ConflictModal } from './components/ConflictModal';
import { HelpModal } from './components/HelpModal';
import { DriveSyncModal } from './components/DriveSyncModal';
import { CommandPalette, PaletteCommand } from './components/CommandPalette';
import { TocItem } from './utils/markdown';
import { SLASH_COMMANDS } from './utils/commands';
import { downloadStandaloneHtml, copyForGoogleDocs } from './utils/exportHtml';

const WorkspaceShell: React.FC = () => {
  const {
    tabs,
    activeTabId,
    switchTab,
    newTab,
    fileName,
    filePath,
    content,
    setContent,
    viewMode,
    setViewMode,
    zenMode,
    setZenMode,
    syncScroll,
    setSyncScroll,
    setCursorPos,
    toastMessage,
    showToast,
  } = useDocument();

  const { isDark, cycleTheme } = useTheme();
  const {
    recoverableDraft,
    restoreRecoverableDraft,
    dismissRecoverableDraft,
    flushDraftForReload,
  } = useDraftRecovery();

  const openVaultFileRef = useRef<
    (handle: FileSystemFileHandle, relPath: string) => Promise<void>
  >(async () => {});

  const {
    vaultHandle,
    vaultName,
    vaultTree,
    vaultFlatFiles,
    savedVault,
    sidebarOpen,
    setSidebarOpen,
    isScanning,
    openVaultPicker,
    loadDirectoryHandle,
    reconnectSavedVault,
    refreshVault,
    closeVault,
    createNewFileInVault,
  } = useVault((handle, relPath) => openVaultFileRef.current(handle, relPath));

  const {
    openFile,
    openFromHandle,
    saveFile,
    saveFileAs,
    newDocument,
    requestCloseTab,
    handleFileDrop,
  } = useFileSystem((droppedDir) => {
    void loadDirectoryHandle(droppedDir, true);
  });

  openVaultFileRef.current = async (handle: FileSystemFileHandle, relPath: string) => {
    await openFromHandle(handle, true, relPath);
  };

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const editorRef = useRef<EditorHandle | null>(null);
  const previewRef = useRef<PreviewHandle | null>(null);

  const [toc, setToc] = useState<TocItem[]>([]);
  const [topVisibleLine, setTopVisibleLine] = useState<number>(0);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [helpOpen, setHelpOpen] = useState<boolean>(false);
  const [driveSyncOpen, setDriveSyncOpen] = useState<boolean>(false);
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);
  const [zenHintVisible, setZenHintVisible] = useState<boolean>(false);
  const [zenScrollbarVisible, setZenScrollbarVisible] = useState<boolean>(false);
  const scrollbarHideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!zenMode) {
      setZenHintVisible(false);
      setZenScrollbarVisible(false);
      if (scrollbarHideTimerRef.current !== null) {
        window.clearTimeout(scrollbarHideTimerRef.current);
        scrollbarHideTimerRef.current = null;
      }
      return;
    }
    setZenHintVisible(true);
    const timer = window.setTimeout(() => setZenHintVisible(false), 2500);
    return () => window.clearTimeout(timer);
  }, [zenMode]);

  const scheduleScrollbarHide = useCallback(() => {
    if (scrollbarHideTimerRef.current !== null) return;
    scrollbarHideTimerRef.current = window.setTimeout(() => {
      scrollbarHideTimerRef.current = null;
      setZenScrollbarVisible(false);
    }, 1200);
  }, []);

  const handleWorkspaceMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!zenMode) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const nearRightEdge = rect.right - e.clientX <= 24;
      const nearSplitEdge =
        viewMode === 'split' &&
        e.clientX <= rect.left + rect.width / 2 &&
        rect.left + rect.width / 2 - e.clientX <= 24;

      if (nearRightEdge || nearSplitEdge) {
        if (scrollbarHideTimerRef.current !== null) {
          window.clearTimeout(scrollbarHideTimerRef.current);
          scrollbarHideTimerRef.current = null;
        }
        setZenScrollbarVisible(true);
      } else if (zenScrollbarVisible) {
        scheduleScrollbarHide();
      }
    },
    [zenMode, viewMode, zenScrollbarVisible, scheduleScrollbarHide]
  );

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setPaletteOpen(false);
        setHelpOpen((prev) => !prev);
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === '/' || e.key.toLowerCase() === 'p')
      ) {
        e.preventDefault();
        setHelpOpen(false);
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onGlobalKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    if (!zenMode) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !helpOpen && !paletteOpen) {
        setZenMode(false);
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [zenMode, helpOpen, paletteOpen, setZenMode]);

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const vaultCmds: PaletteCommand[] = vaultFlatFiles.map((node) => ({
      id: `vault-file-${node.path}`,
      label: node.name,
      category: 'Vault',
      description: `Open ${node.path} from folder "${vaultName}"`,
      run: () => {
        void openFromHandle(node.handle, true, node.path);
      },
    }));

    const markdownCmds: PaletteCommand[] = SLASH_COMMANDS.map((cmd) => ({
      id: `md-${cmd.id}`,
      label: `Insert ${cmd.label}`,
      category: 'Markdown',
      shortcut: cmd.trigger,
      description: `${cmd.syntax} — ${cmd.description}`,
      run: () => editorRef.current?.insertSnippet(cmd.insert, cmd.cursorBackOffset ?? 0),
    }));

    const appCmds: PaletteCommand[] = [
      {
        id: 'app-new',
        label: 'New Document Tab',
        category: 'File',
        description: 'Open an empty Markdown document tab',
        run: newDocument,
      },
      {
        id: 'app-open',
        label: 'Open File(s)...',
        category: 'File',
        shortcut: 'Ctrl+O',
        description: 'Open local or Google Drive Markdown files in tabs',
        run: () => {
          void openFile();
        },
      },
      {
        id: 'app-open-vault',
        label: 'Open Folder Vault...',
        category: 'File',
        description: 'Open a local or Google Drive folder in the sidebar explorer',
        run: () => {
          void openVaultPicker();
        },
      },
      {
        id: 'app-drive-sync',
        label: 'Google Drive Cloud Sync...',
        category: 'File',
        description: 'Sync Markdown files via Google Drive Folder Vault or Drive REST API',
        run: () => setDriveSyncOpen(true),
      },
      {
        id: 'app-toggle-sidebar',
        label: 'Toggle Folder Vault Sidebar',
        category: 'View',
        description: 'Show or hide the folder file tree sidebar',
        run: () => setSidebarOpen((prev) => !prev),
      },
      {
        id: 'app-save',
        label: 'Save File',
        category: 'File',
        shortcut: 'Ctrl+S',
        description: 'Save changes to disk',
        run: () => {
          void saveFile();
        },
      },
      {
        id: 'app-save-as',
        label: 'Save As...',
        category: 'File',
        shortcut: 'Ctrl+Shift+S',
        description: 'Save document under a new filename',
        run: () => {
          void saveFileAs();
        },
      },
      {
        id: 'app-copy-docs',
        label: 'Copy for Google Docs / Gmail',
        category: 'File',
        description: 'Copy formatted rich text + plain Markdown to clipboard',
        run: async () => {
          const res = await copyForGoogleDocs(content);
          showToast(
            res === 'rich'
              ? 'Rich text copied — ready to paste into Google Docs or Gmail!'
              : 'Markdown copied to clipboard.'
          );
        },
      },
      {
        id: 'app-export-html',
        label: 'Export Standalone HTML (.html)',
        category: 'File',
        description: 'Download a self-contained offline HTML document',
        run: async () => {
          await downloadStandaloneHtml(content, fileName);
          showToast('Standalone HTML file exported.');
        },
      },
      {
        id: 'app-print',
        label: 'Print / Save as PDF',
        category: 'File',
        description: 'Open system print dialog for PDF export',
        run: () => window.print(),
      },
      {
        id: 'view-split',
        label: 'Switch to Split View',
        category: 'View',
        description: 'Show Editor and Live Preview side by side',
        run: () => setViewMode('split'),
      },
      {
        id: 'view-editor',
        label: 'Switch to Editor Only',
        category: 'View',
        description: 'Maximize the Markdown source editor',
        run: () => setViewMode('editor'),
      },
      {
        id: 'view-preview',
        label: 'Switch to Preview Only',
        category: 'View',
        description: 'Maximize the rendered Live Preview',
        run: () => setViewMode('preview'),
      },
      {
        id: 'view-focus',
        label: 'Toggle Focus / Zen Mode',
        category: 'View',
        description: 'Hide titlebar and statusbar for distraction-free writing',
        run: () => setZenMode((prev) => !prev),
      },
      {
        id: 'view-sync',
        label: 'Toggle Synchronized Scrolling',
        category: 'View',
        description: 'Sync Preview scroll position with Editor',
        run: () => setSyncScroll((prev) => !prev),
      },
      {
        id: 'view-theme',
        label: 'Toggle Light / Dark Theme',
        category: 'View',
        description: 'Switch between Material 3 light and dark mode',
        run: cycleTheme,
      },
      {
        id: 'app-help',
        label: 'Open Help & Markdown Cheat Sheet',
        category: 'Help',
        shortcut: 'F1',
        description: 'Search syntax, shortcuts, and app features',
        run: () => setHelpOpen(true),
      },
    ];

    return [...vaultCmds, ...appCmds, ...markdownCmds];
  }, [
    vaultFlatFiles,
    vaultName,
    openFromHandle,
    openVaultPicker,
    setSidebarOpen,
    content,
    fileName,
    newDocument,
    openFile,
    saveFile,
    saveFileAs,
    setViewMode,
    setZenMode,
    setSyncScroll,
    cycleTheme,
    showToast,
  ]);

  const handleFormat = useCallback((action: FormattingAction) => {
    editorRef.current?.applyFormatting(action);
  }, []);

  const handleSelectTocLine = useCallback((zeroBasedLine: number) => {
    editorRef.current?.scrollToLine(zeroBasedLine);
    previewRef.current?.scrollToSourceLine(zeroBasedLine);
  }, []);

  const handleToggleTaskLine = useCallback((zeroBasedLine: number) => {
    editorRef.current?.toggleTaskAtLine(zeroBasedLine);
  }, []);

  const handleServiceWorkerReload = async () => {
    await flushDraftForReload();
    await updateServiceWorker(true);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingOver) setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDraggingOver(false);
      }}
      onDrop={(e) => {
        setIsDraggingOver(false);
        void handleFileDrop(e);
      }}
      className={`flex h-screen w-screen flex-col overflow-hidden bg-[var(--md-surface)] text-[var(--md-on-surface)] ${
        zenMode ? (zenScrollbarVisible ? 'zen-mode zen-scrollbar-visible' : 'zen-mode') : ''
      }`}
    >
      <a
        href="#editor-workspace"
        onClick={(e) => {
          e.preventDefault();
          editorRef.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--md-primary)] focus:px-3 focus:py-1.5 focus:text-xs focus:font-semibold focus:text-[var(--md-on-primary)]"
      >
        Skip to editor
      </a>

      {!zenMode && (
        <>
          <Titlebar
            isDark={isDark}
            sidebarOpen={sidebarOpen}
            vaultName={vaultName}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            onOpenVaultPicker={() => {
              void openVaultPicker();
            }}
            onOpenDriveSync={() => setDriveSyncOpen(true)}
            onToggleTheme={cycleTheme}
            onNewDocument={newDocument}
            onOpenFile={() => {
              void openFile();
            }}
            onOpenRecent={(h) => {
              void openFromHandle(h, true);
            }}
            onSaveFile={() => {
              void saveFile();
            }}
            onSaveFileAs={() => {
              void saveFileAs();
            }}
            onOpenHelp={() => setHelpOpen(true)}
          />

          <Toolbar
            toc={toc}
            onFormat={handleFormat}
            onSelectTocLine={handleSelectTocLine}
            onOpenPalette={() => setPaletteOpen(true)}
          />

          {(tabs.length > 1 || vaultName !== null) && (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={switchTab}
              onCloseTab={requestCloseTab}
              onNewTab={() => {
                newTab();
              }}
            />
          )}
        </>
      )}

      {/* Crash-recovery banner for orphaned drafts */}
      {recoverableDraft && (
        <div className="no-print flex items-center justify-between gap-3 border-b border-[var(--md-outline-variant)] bg-[var(--md-secondary-container)] px-4 py-2 text-xs text-[var(--md-on-secondary-container)]">
          <span>
            💡 Found an unsaved draft of <strong>{recoverableDraft.fileName}</strong> (last modified
            at {new Date(recoverableDraft.updatedAt).toLocaleTimeString()}).
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={restoreRecoverableDraft}
              className="rounded-full bg-[var(--md-primary)] px-3 py-1 font-medium text-[var(--md-on-primary)]"
            >
              Restore draft
            </button>
            <button
              type="button"
              onClick={dismissRecoverableDraft}
              className="rounded-full px-2.5 py-1 font-medium hover:bg-black/10 dark:hover:bg-white/10"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace (Optional Vault Sidebar + Dual-Pane Editor/Preview) */}
      <main
        id="editor-workspace"
        onMouseMove={handleWorkspaceMouseMove}
        onMouseLeave={() => {
          if (zenMode && zenScrollbarVisible) scheduleScrollbarHide();
        }}
        className="relative flex min-h-0 flex-1 overflow-hidden"
      >
        {!zenMode && sidebarOpen && (
          <VaultSidebar
            vaultName={vaultName}
            vaultTree={vaultTree}
            vaultFlatFiles={vaultFlatFiles}
            savedVault={savedVault}
            activeFilePath={filePath}
            isScanning={isScanning}
            onOpenVaultPicker={() => {
              void openVaultPicker();
            }}
            onReconnectSavedVault={() => {
              void reconnectSavedVault();
            }}
            onSelectFile={(node) => {
              void openFromHandle(node.handle, true, node.path);
            }}
            onCreateFile={createNewFileInVault}
            onRefreshVault={() => {
              void refreshVault();
            }}
            onCloseVault={closeVault}
            onCollapseSidebar={() => setSidebarOpen(false)}
          />
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {isDraggingOver && (
            <div className="no-print pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--md-primary)] bg-[var(--md-surface)]/85 backdrop-blur-xs">
              <div className="text-center">
                <p className="text-sm font-semibold text-[var(--md-primary)]">
                  Drop Markdown files or a folder here to open
                </p>
                <p className="mt-1 text-xs text-[var(--md-on-surface-variant)]">
                  Supports direct write access and Folder Vaults from ChromeOS Files
                </p>
              </div>
            </div>
          )}

          {/* Left Pane: CodeMirror 6 Editor */}
          {viewMode !== 'preview' && (
            <section
              className={`no-print h-full overflow-hidden ${
                viewMode === 'split'
                  ? 'w-1/2 border-r border-[var(--md-outline-variant)]'
                  : 'editor-only w-full'
              }`}
            >
              <Editor
                ref={editorRef}
                tabId={activeTabId}
                value={content}
                onChange={setContent}
                onCursorChange={setCursorPos}
                onTopLineChange={setTopVisibleLine}
              />
            </section>
          )}

          {/* Right Pane: Sanitized Live Preview */}
          {viewMode !== 'editor' && (
            <section
              className={`preview-section h-full overflow-hidden ${
                viewMode === 'split' ? 'w-1/2' : 'w-full'
              }`}
            >
              <Preview
                ref={previewRef}
                markdown={content}
                syncScroll={syncScroll}
                topVisibleLine={topVisibleLine}
                vaultHandle={vaultHandle}
                activeFilePath={filePath}
                onTocUpdate={setToc}
                onToggleTaskLine={handleToggleTaskLine}
              />
            </section>
          )}
        </div>

        {/* Floating exit Zen mode button (fades out after 2.5s; reappears on corner hover/focus) */}
        {zenMode && (
          <div
            onMouseEnter={() => setZenHintVisible(true)}
            onMouseLeave={() => setZenHintVisible(false)}
            className="no-print fixed right-0 top-0 z-30 p-3 pr-4"
          >
            <button
              type="button"
              onClick={() => setZenMode(false)}
              onFocus={() => setZenHintVisible(true)}
              onBlur={() => setZenHintVisible(false)}
              title="Exit Focus Mode (Esc)"
              className={`rounded-full border border-[var(--md-outline-variant)] bg-[var(--md-surface-container)]/90 px-3 py-1 text-xs font-medium text-[var(--md-on-surface)] shadow-md backdrop-blur-xs transition-opacity duration-500 hover:bg-[var(--md-surface-variant)] ${
                zenHintVisible ? 'opacity-90' : 'pointer-events-none opacity-0'
              }`}
            >
              Exit Focus Mode (Esc)
            </button>
          </div>
        )}
      </main>

      {!zenMode && <StatusBar />}

      {/* Service Worker Prompt Toast */}
      {needRefresh && (
        <div
          role="status"
          className="no-print fixed bottom-10 left-4 z-50 flex items-center gap-3 rounded-xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] px-4 py-2.5 text-xs text-[var(--md-on-surface)] shadow-lg"
        >
          <span>New version of Pilgrim Markdown available.</span>
          <button
            type="button"
            onClick={handleServiceWorkerReload}
            className="rounded-full bg-[var(--md-primary)] px-3 py-1 font-medium text-[var(--md-on-primary)]"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="rounded px-2 py-1 text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]"
          >
            Later
          </button>
        </div>
      )}

      {/* Feedback Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-10 right-4 z-50 rounded-full bg-[var(--md-on-surface)] px-4 py-2 text-xs font-medium text-[var(--md-surface)] shadow-lg"
        >
          {toastMessage}
        </div>
      )}

      <ConflictModal />

      <HelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        onInsertExample={(snippet) => editorRef.current?.insertSnippet(snippet)}
      />

      <DriveSyncModal
        isOpen={driveSyncOpen}
        onClose={() => setDriveSyncOpen(false)}
        onOpenVaultPicker={() => {
          void openVaultPicker();
        }}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <DocumentProvider>
      <WorkspaceShell />
    </DocumentProvider>
  );
};

export default App;
