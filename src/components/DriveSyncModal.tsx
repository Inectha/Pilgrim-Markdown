import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useDocument } from '../context/DocumentContext';
import {
  DriveFileMetadata,
  getConfiguredGoogleClientId,
  setConfiguredGoogleClientId,
  requestGoogleDriveAccessToken,
  listDriveMarkdownFiles,
  downloadDriveMarkdownFile,
  uploadDriveMarkdownFile,
} from '../utils/googleDriveSync';
import {
  PendingDriveSyncItem,
  getDriveSyncQueue,
  enqueueDriveSyncItem,
  removeDriveSyncQueueItem,
} from '../utils/idb';

interface DriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenVaultPicker: () => void;
}

export const DriveSyncModal: React.FC<DriveSyncModalProps> = ({
  isOpen,
  onClose,
  onOpenVaultPicker,
}) => {
  const {
    tabs,
    activeTabId,
    fileName,
    content,
    openTab,
    markSaved,
    setConflictModal,
    showToast,
  } = useDocument();

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, isOpen);

  const [clientId, setClientId] = useState<string>(() => getConfiguredGoogleClientId());
  const [editingClientId, setEditingClientId] = useState<boolean>(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileMetadata[]>([]);
  const [pendingQueue, setPendingQueue] = useState<PendingDriveSyncItem[]>([]);
  const [busy, setBusy] = useState<boolean>(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  useEffect(() => {
    if (!isOpen) return;
    getDriveSyncQueue().then(setPendingQueue);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const refreshFiles = useCallback(
    async (token: string) => {
      setBusy(true);
      try {
        const list = await listDriveMarkdownFiles(token);
        setDriveFiles(list);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to list files';
        showToast(msg);
      } finally {
        setBusy(false);
      }
    },
    [showToast]
  );

  const handleConnect = async () => {
    const trimmed = clientId.trim();
    if (!trimmed) {
      setEditingClientId(true);
      showToast('Enter a Google OAuth 2.0 Web Client ID first.');
      return;
    }
    setConfiguredGoogleClientId(trimmed);
    setEditingClientId(false);
    setBusy(true);
    try {
      const token = await requestGoogleDriveAccessToken(trimmed);
      setAccessToken(token);
      showToast('Connected to Google Drive.');
      await refreshFiles(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed';
      showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDriveFile = async (fileMeta: DriveFileMetadata) => {
    if (!accessToken) return;
    setBusy(true);
    try {
      const { metadata, content: remoteText } = await downloadDriveMarkdownFile(
        accessToken,
        fileMeta.id
      );
      await openTab({
        fileName: metadata.name,
        driveFileId: metadata.id,
        driveModifiedTime: metadata.modifiedTime,
        content: remoteText,
        handle: null,
        lastModified: new Date(metadata.modifiedTime).getTime(),
      });
      showToast(`Opened "${metadata.name}" from Google Drive.`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleSyncActiveTab = async (ignoreConflict: boolean = false) => {
    // Offline fallback: queue in IndexedDB
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const queued = await enqueueDriveSyncItem({
        id: activeTab.id,
        driveFileId: activeTab.driveFileId ?? null,
        fileName,
        content,
        baseModifiedTime: activeTab.driveModifiedTime ?? null,
        queuedAt: Date.now(),
      });
      setPendingQueue(queued);
      showToast(`Offline — "${fileName}" queued for Google Drive sync.`);
      return;
    }

    if (!accessToken) {
      showToast('Connect to Google Drive first.');
      return;
    }

    setBusy(true);
    try {
      const outcome = await uploadDriveMarkdownFile({
        accessToken,
        fileId: activeTab.driveFileId,
        fileName,
        content,
        lastKnownModifiedTime: activeTab.driveModifiedTime,
        ignoreConflict,
      });

      if (outcome.status === 'conflict') {
        onClose();
        setConflictModal({
          kind: 'external-modification',
          title: 'Google Drive sync conflict',
          description: `"${outcome.remoteFile.name}" was modified in Google Drive at ${new Date(
            outcome.remoteFile.modifiedTime
          ).toLocaleTimeString()}. How would you like to resolve it?`,
          onSaveAndContinue: async () => {
            setConflictModal(null);
            await handleSyncActiveTab(true);
          },
          onDiscardAndContinue: async () => {
            setConflictModal(null);
            await handleOpenDriveFile(outcome.remoteFile);
          },
          onCancel: () => setConflictModal(null),
        });
        return;
      }

      markSaved({
        tabId: activeTab.id,
        fileName: outcome.file.name,
        driveFileId: outcome.file.id,
        driveModifiedTime: outcome.file.modifiedTime,
        lastModified: new Date(outcome.file.modifiedTime).getTime(),
        savedText: content,
      });
      showToast(`Synced "${outcome.file.name}" to Google Drive.`);
      await refreshFiles(accessToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleFlushQueue = async () => {
    if (!accessToken || pendingQueue.length === 0) return;
    setBusy(true);
    try {
      for (const item of pendingQueue) {
        const outcome = await uploadDriveMarkdownFile({
          accessToken,
          fileId: item.driveFileId,
          fileName: item.fileName,
          content: item.content,
          lastKnownModifiedTime: item.baseModifiedTime,
          ignoreConflict: true,
        });
        if (outcome.status === 'saved') {
          const updated = await removeDriveSyncQueueItem(item.id);
          setPendingQueue(updated);
        }
      }
      showToast('Synced all queued offline edits to Google Drive.');
      await refreshFiles(accessToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Queue sync failed';
      showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-sync-title"
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--md-outline-variant)] px-5 py-3.5">
          <div>
            <h2
              id="drive-sync-title"
              className="text-sm font-semibold text-[var(--md-on-surface)]"
            >
              ☁️ Google Drive & Folder Sync
            </h2>
            <p className="text-xs text-[var(--md-on-surface-variant)]">
              Zero-server sync via ChromeOS DriveFS or direct Google Drive API (`drive.file`)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Google Drive dialog"
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]"
          >
            Esc
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {/* Option 1: ChromeOS DriveFS / OS Folder Mount */}
          <div className="rounded-xl border border-[var(--md-outline-variant)] bg-[var(--md-surface)] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-[var(--md-on-surface)]">
                  1. ChromeOS Google Drive Folder Vault (Recommended)
                </h3>
                <p className="mt-1 leading-relaxed text-[var(--md-on-surface-variant)]">
                  On ChromeOS (or desktop Google Drive), open any folder inside{' '}
                  <strong>Google Drive</strong> via the native file picker. Pilgrim Markdown
                  automatically watches for external changes and works 100% offline with zero sign-in.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenVaultPicker();
                }}
                className="shrink-0 rounded-lg bg-[var(--md-secondary-container)] px-3 py-1.5 font-medium text-[var(--md-on-secondary-container)] hover:opacity-90"
              >
                Open Folder Vault…
              </button>
            </div>
          </div>

          {/* Option 2: Direct Google Drive REST API v3 */}
          <div className="rounded-xl border border-[var(--md-outline-variant)] bg-[var(--md-surface)] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-[var(--md-on-surface)]">
                2. Direct Browser Sync (Google Drive REST API v3)
              </h3>
              <button
                type="button"
                onClick={() => setEditingClientId((prev) => !prev)}
                className="text-[11px] font-medium text-[var(--md-primary)] hover:underline"
              >
                {editingClientId ? 'Hide OAuth Client ID' : 'Configure Client ID'}
              </button>
            </div>

            <p className="mt-1 leading-relaxed text-[var(--md-on-surface-variant)]">
              Syncs directly between your browser and Google Drive using the non-restricted{' '}
              <code>drive.file</code> scope (only files created or opened by this app).
            </p>

            {(editingClientId || !clientId) && (
              <div className="mt-3 rounded-lg border border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] p-2.5">
                <label className="block text-[11px] font-medium text-[var(--md-on-surface)]">
                  Google OAuth 2.0 Web Client ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="1234567890-abc.apps.googleusercontent.com"
                  className="mt-1 w-full rounded border border-[var(--md-outline)] bg-[var(--md-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--md-on-surface)] focus:border-[var(--md-primary)] focus:outline-none"
                />
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--md-on-surface-variant)]">
                  <span>Saved locally in your browser (or via VITE_GOOGLE_CLIENT_ID).</span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfiguredGoogleClientId(clientId);
                      setEditingClientId(false);
                      showToast('Saved Google OAuth Client ID.');
                    }}
                    className="rounded bg-[var(--md-primary)] px-2.5 py-1 font-medium text-[var(--md-on-primary)]"
                  >
                    Save ID
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!accessToken ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConnect}
                  className="rounded-lg bg-[var(--md-primary)] px-3.5 py-1.5 font-medium text-[var(--md-on-primary)] disabled:opacity-50"
                >
                  {busy ? 'Connecting…' : 'Connect Google Drive'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSyncActiveTab(false)}
                    className="rounded-lg bg-[var(--md-primary)] px-3.5 py-1.5 font-medium text-[var(--md-on-primary)] disabled:opacity-50"
                  >
                    {activeTab.driveFileId
                      ? `Update "${fileName}" on Drive`
                      : `Upload "${fileName}" to Drive`}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void refreshFiles(accessToken)}
                    className="rounded-lg border border-[var(--md-outline-variant)] px-3 py-1.5 font-medium text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
                  >
                    Refresh list
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccessToken(null);
                      setDriveFiles([]);
                      showToast('Disconnected from Google Drive.');
                    }}
                    className="rounded-lg px-2.5 py-1.5 text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]"
                  >
                    Disconnect
                  </button>
                </>
              )}

              {pendingQueue.length > 0 && (
                <button
                  type="button"
                  disabled={!accessToken || busy}
                  onClick={() => void handleFlushQueue()}
                  className="rounded-lg bg-amber-500/20 px-3 py-1.5 font-medium text-amber-900 dark:text-amber-200"
                >
                  Sync {pendingQueue.length} queued offline edit(s)
                </button>
              )}
            </div>

            {accessToken && (
              <div className="mt-3 border-t border-[var(--md-outline-variant)] pt-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--md-on-surface-variant)]">
                  App-Synced Drive Files ({driveFiles.length})
                </div>
                {driveFiles.length === 0 ? (
                  <p className="py-2 text-[var(--md-on-surface-variant)]">
                    No files uploaded via Pilgrim Markdown yet. Click{' '}
                    <strong>Upload "{fileName}" to Drive</strong> above to sync your first file.
                  </p>
                ) : (
                  <div className="max-h-44 space-y-1 overflow-y-auto">
                    {driveFiles.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-[var(--md-surface-variant)]/50"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-[var(--md-on-surface)]">
                            {f.name}
                          </div>
                          <div className="text-[10px] text-[var(--md-on-surface-variant)]">
                            Modified {new Date(f.modifiedTime).toLocaleString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleOpenDriveFile(f)}
                          className="ml-2 shrink-0 rounded-md bg-[var(--md-secondary-container)] px-2.5 py-1 text-[11px] font-medium text-[var(--md-on-secondary-container)]"
                        >
                          Open in Tab
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
