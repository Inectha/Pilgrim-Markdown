import React, { useState, useEffect, useRef } from 'react';
import { useDocument, ViewMode } from '../context/DocumentContext';
import { downloadStandaloneHtml, copyForGoogleDocs } from '../utils/exportHtml';

interface TitlebarProps {
  isDark: boolean;
  sidebarOpen: boolean;
  vaultName: string | null;
  onToggleSidebar: () => void;
  onOpenVaultPicker: () => void;
  onOpenDriveSync: () => void;
  onToggleTheme: () => void;
  onNewDocument: () => void;
  onOpenFile: () => void;
  onOpenRecent: (handle: FileSystemFileHandle) => void;
  onSaveFile: () => void;
  onSaveFileAs: () => void;
  onOpenHelp: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  isDark,
  sidebarOpen,
  vaultName,
  onToggleSidebar,
  onOpenVaultPicker,
  onOpenDriveSync,
  onToggleTheme,
  onNewDocument,
  onOpenFile,
  onOpenRecent,
  onSaveFile,
  onSaveFileAs,
  onOpenHelp,
}) => {
  const {
    fileName,
    setFileName,
    content,
    isDirty,
    handle,
    viewMode,
    setViewMode,
    autoSaveToDisk,
    setAutoSaveToDisk,
    recentHandles,
    wipeRecentHandles,
    showToast,
  } = useDocument();

  const [wcoVisible, setWcoVisible] = useState<boolean>(() =>
    Boolean(typeof navigator !== 'undefined' && navigator.windowControlsOverlay?.visible)
  );
  const [recentMenuOpen, setRecentMenuOpen] = useState<boolean>(false);
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const [editingName, setEditingName] = useState<boolean>(false);
  const [nameDraft, setNameDraft] = useState<string>(fileName);

  const recentRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setNameDraft(fileName);
  }, [fileName]);

  useEffect(() => {
    const wco = typeof navigator !== 'undefined' ? navigator.windowControlsOverlay : undefined;
    if (!wco) return;
    const onGeometryChange = (e: WindowControlsOverlayGeometryChangeEvent) => {
      setWcoVisible(e.visible);
    };
    wco.addEventListener('geometrychange', onGeometryChange);
    return () => wco.removeEventListener('geometrychange', onGeometryChange);
  }, []);

  // Close dropdowns on outside click or Escape
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (recentRef.current && !recentRef.current.contains(target)) {
        setRecentMenuOpen(false);
      }
      if (exportRef.current && !exportRef.current.contains(target)) {
        setExportMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRecentMenuOpen(false);
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const handleCommitName = () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(fileName);
      return;
    }
    const finalName = /\.(md|markdown|txt)$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
    setFileName(finalName);
  };

  const handleExportHtml = async () => {
    setExportMenuOpen(false);
    await downloadStandaloneHtml(content, fileName);
    showToast('Standalone HTML file exported.');
  };

  const handleCopyGoogleDocs = async () => {
    setExportMenuOpen(false);
    const result = await copyForGoogleDocs(content);
    if (result === 'rich') {
      showToast('Rich text copied — ready to paste into Google Docs or Gmail!');
    } else {
      showToast('Markdown copied to clipboard.');
    }
  };

  const handlePrintPdf = () => {
    setExportMenuOpen(false);
    window.print();
  };

  const handleWebShare = async () => {
    setExportMenuOpen(false);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: fileName,
          text: content,
        });
      } catch {
        // User cancelled share sheet
      }
    }
  };

  const statusText = isDirty
    ? '● Modified (draft saved locally)'
    : handle
      ? 'Saved'
      : 'Local draft';

  return (
    <header
      className={`no-print titlebar-drag flex h-12 shrink-0 select-none items-center justify-between gap-2 border-b border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] px-3 ${
        wcoVisible ? 'wco-active' : ''
      }`}
    >
      {/* Left: Sidebar toggle, Filename & save status */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Hide Folder Vault sidebar' : 'Show Folder Vault sidebar'}
          aria-expanded={sidebarOpen}
          title={
            vaultName
              ? `Folder Vault: ${vaultName} (click to toggle sidebar)`
              : 'Toggle Folder Vault sidebar'
          }
          className={`titlebar-no-drag flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
            sidebarOpen
              ? 'bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]'
              : 'text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)] hover:text-[var(--md-on-surface)]'
          }`}
        >
          <span>📁</span>
          {vaultName && <span className="hidden max-w-[110px] truncate lg:inline">{vaultName}</span>}
        </button>

        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            {editingName && !handle ? (
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleCommitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitName();
                  if (e.key === 'Escape') {
                    setNameDraft(fileName);
                    setEditingName(false);
                  }
                }}
                autoFocus
                aria-label="Rename file"
                className="titlebar-no-drag w-40 rounded border border-[var(--md-primary)] bg-[var(--md-surface)] px-1.5 py-0.5 text-xs font-semibold text-[var(--md-on-surface)] outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!handle) setEditingName(true);
                }}
                title={handle ? fileName : `${fileName} (click to rename)`}
                className="titlebar-no-drag truncate text-left text-sm font-semibold text-[var(--md-on-surface)] hover:underline"
              >
                {fileName}
              </button>
            )}

            <span
              className={`hidden truncate rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-block ${
                isDirty
                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                  : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
              }`}
            >
              {statusText}
            </span>
          </div>
        </div>
      </div>

      {/* Center: Mode switcher (Editor | Split | Preview) */}
      <div
        role="group"
        aria-label="View mode"
        className="titlebar-no-drag flex shrink-0 items-center rounded-full border border-[var(--md-outline-variant)] bg-[var(--md-surface)] p-0.5 text-xs"
      >
        {(['editor', 'split', 'preview'] as ViewMode[]).map((mode) => {
          const active = viewMode === mode;
          const label = mode === 'editor' ? 'Editor' : mode === 'split' ? 'Split' : 'Preview';
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                active
                  ? 'bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]'
                  : 'text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Right: File actions, Export/Overflow menu & Theme toggle */}
      <div className="titlebar-no-drag flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onNewDocument}
          title="New document"
          className="hidden rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)] md:inline-flex"
        >
          New
        </button>

        {/* Open + Recent Files Split Button */}
        <div ref={recentRef} className="relative flex items-center">
          <button
            type="button"
            onClick={onOpenFile}
            title="Open file (Ctrl+O)"
            className="rounded-l-lg px-2.5 py-1.5 text-xs font-medium text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => setRecentMenuOpen((prev) => !prev)}
            aria-label="Show recent files"
            aria-expanded={recentMenuOpen}
            aria-haspopup="menu"
            title="Recent files"
            className="rounded-r-lg border-l border-[var(--md-outline-variant)] px-1.5 py-1.5 text-xs text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]"
          >
            ▾
          </button>

          {recentMenuOpen && (
            <div className="absolute right-0 top-full z-40 mt-1.5 w-64 rounded-xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] p-1.5 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setRecentMenuOpen(false);
                  onOpenVaultPicker();
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-[var(--md-primary)] hover:bg-[var(--md-surface-variant)]"
              >
                <span>📁 Open Folder Vault…</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecentMenuOpen(false);
                  onOpenDriveSync();
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
              >
                <span>☁️ Google Drive Cloud Sync…</span>
              </button>
              <hr className="my-1 border-[var(--md-outline-variant)]" />
              <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--md-on-surface-variant)]">
                Recent files
              </div>
              {recentHandles.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-[var(--md-on-surface-variant)]">
                  No recent files saved yet.
                </div>
              ) : (
                <>
                  {recentHandles.map((item, idx) => (
                    <button
                      key={`${item.name}-${idx}`}
                      type="button"
                      onClick={() => {
                        setRecentMenuOpen(false);
                        onOpenRecent(item.handle);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
                    >
                      <span className="truncate font-medium">{item.name}</span>
                      <span className="ml-2 shrink-0 text-[10px] text-[var(--md-on-surface-variant)]">
                        Open
                      </span>
                    </button>
                  ))}
                  <hr className="my-1 border-[var(--md-outline-variant)]" />
                  <button
                    type="button"
                    onClick={() => {
                      wipeRecentHandles();
                      setRecentMenuOpen(false);
                      showToast('Cleared recent files list.');
                    }}
                    className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                  >
                    Clear list
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onSaveFile}
          title="Save (Ctrl+S)"
          className="rounded-full bg-[var(--md-primary)] px-3 py-1.5 text-xs font-medium text-[var(--md-on-primary)] shadow-sm transition-opacity hover:opacity-90"
        >
          Save
        </button>

        {/* Export, Share & Responsive Overflow Menu */}
        <div ref={exportRef} className="relative">
          <button
            type="button"
            onClick={() => setExportMenuOpen((prev) => !prev)}
            aria-label="Export and more options"
            aria-expanded={exportMenuOpen}
            aria-haspopup="menu"
            title="Export, Share & Options"
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
          >
            Export ▾
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 top-full z-40 mt-1.5 w-64 rounded-xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] p-1.5 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  onNewDocument();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)] md:hidden"
              >
                <span>📄 New document</span>
              </button>

              <button
                type="button"
                onClick={handleCopyGoogleDocs}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
              >
                <span>📋 Copy for Google Docs / Gmail</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  onSaveFileAs();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
              >
                <span>💾 Save As (.md)...</span>
              </button>

              <button
                type="button"
                onClick={handleExportHtml}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
              >
                <span>🌐 Export Standalone HTML (.html)</span>
              </button>

              <button
                type="button"
                onClick={handlePrintPdf}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
              >
                <span>🖨️ Print / Save as PDF</span>
              </button>

              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button
                  type="button"
                  onClick={handleWebShare}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
                >
                  <span>📤 Share via system...</span>
                </button>
              )}

              {handle && (
                <>
                  <hr className="my-1 border-[var(--md-outline-variant)]" />
                  <label className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]">
                    <span>Auto-save to file</span>
                    <input
                      type="checkbox"
                      checked={autoSaveToDisk}
                      onChange={(e) => setAutoSaveToDisk(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--md-primary)]"
                    />
                  </label>
                </>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenHelp}
          aria-label="Open Help and Markdown Cheat Sheet (F1)"
          title="Help & Markdown Cheat Sheet (F1)"
          className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
        >
          ? Help
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Light theme' : 'Dark theme'}
          className="rounded-lg p-1.5 text-sm text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  );
};
