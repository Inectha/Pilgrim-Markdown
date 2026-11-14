import { useCallback, useEffect, useRef } from 'react';
import { useDocument } from '../context/DocumentContext';

const FILE_PICKER_TYPES = [
  {
    description: 'Markdown & Text Documents',
    accept: {
      'text/markdown': ['.md', '.markdown'],
      'text/plain': ['.txt'],
    },
  },
];

async function verifyReadWritePermission(
  handle: FileSystemFileHandle,
  requestIfPrompt: boolean
): Promise<boolean> {
  if (typeof handle.queryPermission !== 'function') {
    return true;
  }
  const state = await handle.queryPermission({ mode: 'readwrite' });
  if (state === 'granted') return true;
  if (requestIfPrompt && typeof handle.requestPermission === 'function') {
    const requested = await handle.requestPermission({ mode: 'readwrite' });
    return requested === 'granted';
  }
  return false;
}

function downloadBlobFallback(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'document.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useFileSystem(onDropDirectoryHandle?: (dirHandle: FileSystemDirectoryHandle) => void) {
  const {
    tabs,
    activeTabId,
    fileName,
    content,
    isDirty,
    handle,
    lastKnownModified,
    autoSaveToDisk,
    conflictModal,
    loadDocument,
    openTab,
    switchTab,
    newTab,
    closeTab,
    updateTabFromDisk,
    markSaved,
    showToast,
    setConflictModal,
    recordRecentHandle,
    forgetRecentHandle,
  } = useDocument();

  const stateRef = useRef({
    tabs,
    activeTabId,
    fileName,
    content,
    isDirty,
    handle,
    lastKnownModified,
    conflictModal,
  });
  stateRef.current = {
    tabs,
    activeTabId,
    fileName,
    content,
    isDirty,
    handle,
    lastKnownModified,
    conflictModal,
  };

  const writeToHandle = useCallback(
    async (
      targetHandle: FileSystemFileHandle,
      textToWrite: string,
      ignoreConflict: boolean = false,
      targetTabId?: string
    ): Promise<boolean> => {
      try {
        const hasPerm = await verifyReadWritePermission(targetHandle, true);
        if (!hasPerm) {
          showToast('Write permission denied for this file.');
          return false;
        }

        const currentFile = await targetHandle.getFile();
        const tab = targetTabId
          ? stateRef.current.tabs.find((t) => t.id === targetTabId)
          : undefined;
        const expectedMod = tab ? tab.lastKnownModified : stateRef.current.lastKnownModified;

        if (
          !ignoreConflict &&
          expectedMod !== null &&
          currentFile.lastModified !== expectedMod
        ) {
          setConflictModal({
            kind: 'external-modification',
            title: 'File modified externally',
            description: `"${targetHandle.name}" was modified outside this editor (e.g. via Google Drive or another window). What would you like to do?`,
            onSaveAndContinue: async () => {
              setConflictModal(null);
              await writeToHandle(targetHandle, textToWrite, true, targetTabId);
            },
            onDiscardAndContinue: async () => {
              setConflictModal(null);
              const freshFile = await targetHandle.getFile();
              const freshText = await freshFile.text();
              if (targetTabId) {
                updateTabFromDisk(targetTabId, {
                  content: freshText,
                  lastModified: freshFile.lastModified,
                  fileName: targetHandle.name,
                });
              } else {
                loadDocument({
                  fileName: targetHandle.name,
                  content: freshText,
                  handle: targetHandle,
                  lastModified: freshFile.lastModified,
                });
              }
              showToast(`Reloaded "${targetHandle.name}" from disk.`);
            },
            onSaveAsNew: async () => {
              setConflictModal(null);
              await saveFileAsInternal(textToWrite, `copy-${targetHandle.name}`, targetTabId);
            },
            onCancel: () => setConflictModal(null),
          });
          return false;
        }

        const writable = await targetHandle.createWritable();
        await writable.write(textToWrite);
        await writable.close();

        const updatedFile = await targetHandle.getFile();
        markSaved({
          tabId: targetTabId,
          fileName: targetHandle.name,
          handle: targetHandle,
          lastModified: updatedFile.lastModified,
          savedText: textToWrite,
        });
        await recordRecentHandle(targetHandle);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        showToast(`Save failed: ${message}`);
        return false;
      }
    },
    [loadDocument, updateTabFromDisk, markSaved, recordRecentHandle, setConflictModal, showToast]
  );

  const saveFileAsInternal = useCallback(
    async (
      textToSave: string,
      suggestedName?: string,
      targetTabId?: string
    ): Promise<boolean> => {
      const targetName = suggestedName || stateRef.current.fileName || 'Untitled.md';

      if (typeof window.showSaveFilePicker === 'function') {
        try {
          const newHandle = await window.showSaveFilePicker({
            suggestedName: targetName,
            types: FILE_PICKER_TYPES,
          });
          const writable = await newHandle.createWritable();
          await writable.write(textToSave);
          await writable.close();
          const savedFile = await newHandle.getFile();
          markSaved({
            tabId: targetTabId,
            fileName: newHandle.name,
            handle: newHandle,
            lastModified: savedFile.lastModified,
            savedText: textToSave,
          });
          await recordRecentHandle(newHandle);
          showToast(`Saved as "${newHandle.name}".`);
          return true;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return false;
          }
          showToast('Save As failed.');
          return false;
        }
      }

      downloadBlobFallback(textToSave, targetName);
      markSaved({
        tabId: targetTabId,
        fileName: targetName,
        handle: null,
        lastModified: Date.now(),
        savedText: textToSave,
      });
      showToast(`Downloaded "${targetName}".`);
      return true;
    },
    [markSaved, recordRecentHandle, showToast]
  );

  const saveTab = useCallback(
    async (tabId: string): Promise<boolean> => {
      const tab = stateRef.current.tabs.find((t) => t.id === tabId);
      if (!tab) return false;
      if (tab.handle) {
        const ok = await writeToHandle(tab.handle, tab.content, false, tab.id);
        if (ok) showToast(`Saved "${tab.handle.name}".`);
        return ok;
      }
      return saveFileAsInternal(tab.content, tab.fileName, tab.id);
    },
    [writeToHandle, saveFileAsInternal, showToast]
  );

  const saveFile = useCallback(async (): Promise<boolean> => {
    return saveTab(stateRef.current.activeTabId);
  }, [saveTab]);

  const saveFileAs = useCallback(async (): Promise<boolean> => {
    return saveFileAsInternal(
      stateRef.current.content,
      stateRef.current.fileName,
      stateRef.current.activeTabId
    );
  }, [saveFileAsInternal]);

  const requestCloseTab = useCallback(
    (tabId: string) => {
      const tab = stateRef.current.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const tabDirty = tab.content !== tab.savedContent;
      if (!tabDirty) {
        closeTab(tabId);
        return;
      }

      switchTab(tabId);
      setConflictModal({
        kind: 'unsaved-changes',
        title: 'Unsaved changes',
        description: `There are unsaved changes in "${tab.fileName}". Would you like to save them before closing this tab?`,
        onSaveAndContinue: async () => {
          setConflictModal(null);
          const saved = await saveTab(tabId);
          if (saved) closeTab(tabId);
        },
        onDiscardAndContinue: () => {
          setConflictModal(null);
          closeTab(tabId);
        },
        onCancel: () => setConflictModal(null),
      });
    },
    [closeTab, switchTab, saveTab, setConflictModal]
  );

  const openFromHandle = useCallback(
    async (
      targetHandle: FileSystemFileHandle,
      requestPerm: boolean = true,
      filePath?: string
    ) => {
      try {
        if (typeof targetHandle.queryPermission === 'function') {
          const state = await targetHandle.queryPermission({ mode: 'readwrite' });
          if (
            state !== 'granted' &&
            requestPerm &&
            typeof targetHandle.requestPermission === 'function'
          ) {
            await targetHandle.requestPermission({ mode: 'readwrite' });
          }
        }
        const file = await targetHandle.getFile();
        const text = await file.text();
        await openTab({
          fileName: targetHandle.name,
          filePath,
          content: text,
          handle: targetHandle,
          lastModified: file.lastModified,
        });
        await recordRecentHandle(targetHandle);
        showToast(`Opened "${targetHandle.name}".`);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotFoundError') {
          await forgetRecentHandle(targetHandle);
          showToast(
            `"${targetHandle.name}" no longer exists and was removed from recent files.`
          );
          return;
        }
        showToast(`Could not open "${targetHandle.name}".`);
      }
    },
    [openTab, recordRecentHandle, forgetRecentHandle, showToast]
  );

  const openFile = useCallback(async () => {
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const pickedHandles = await window.showOpenFilePicker({
          multiple: true,
          types: FILE_PICKER_TYPES,
        });
        for (const pickedHandle of pickedHandles) {
          const file = await pickedHandle.getFile();
          const text = await file.text();
          await openTab({
            fileName: pickedHandle.name,
            content: text,
            handle: pickedHandle,
            lastModified: file.lastModified,
          });
          await recordRecentHandle(pickedHandle);
        }
        if (pickedHandles.length === 1) {
          showToast(`Opened "${pickedHandles[0].name}".`);
        } else if (pickedHandles.length > 1) {
          showToast(`Opened ${pickedHandles.length} files in tabs.`);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        showToast('Open file cancelled or failed.');
      }
      return;
    }

    // Fallback <input type="file"> for Firefox / Safari
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) return;
      for (const file of files) {
        const text = await file.text();
        await openTab({
          fileName: file.name,
          content: text,
          handle: null,
          lastModified: file.lastModified,
        });
      }
      showToast(
        files.length === 1
          ? `Opened "${files[0].name}" (Download mode).`
          : `Opened ${files.length} files (Download mode).`
      );
    };
    input.click();
  }, [openTab, recordRecentHandle, showToast]);

  const newDocument = useCallback(() => {
    const { tabs: curTabs, activeTabId: curId } = stateRef.current;
    const current = curTabs.find((t) => t.id === curId) ?? curTabs[0];
    if (
      curTabs.length === 1 &&
      !current.handle &&
      !current.filePath &&
      current.content === current.savedContent
    ) {
      loadDocument({
        fileName: 'Untitled.md',
        content: '',
        handle: null,
        lastModified: null,
      });
    } else {
      newTab();
    }
    showToast('Started new document tab.');
  }, [loadDocument, newTab, showToast]);

  // Optional auto-save to disk (when enabled by user and a valid handle exists)
  useEffect(() => {
    if (!autoSaveToDisk || !isDirty || !handle) return;
    const timer = window.setTimeout(() => {
      void writeToHandle(handle, content, false, activeTabId);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [autoSaveToDisk, isDirty, handle, content, activeTabId, writeToHandle]);

  // External change watcher (Google Drive DriveFS / external editor sync)
  useEffect(() => {
    let checking = false;

    const checkExternalModifications = async () => {
      if (checking) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (stateRef.current.conflictModal) return;

      checking = true;
      try {
        for (const tab of stateRef.current.tabs) {
          if (!tab.handle || tab.lastKnownModified === null) continue;
          try {
            const diskFile = await tab.handle.getFile();
            if (diskFile.lastModified === tab.lastKnownModified) continue;

            const tabDirty = tab.content !== tab.savedContent;
            if (!tabDirty) {
              const freshText = await diskFile.text();
              updateTabFromDisk(tab.id, {
                content: freshText,
                lastModified: diskFile.lastModified,
                fileName: tab.handle.name,
              });
              showToast(`Synced external changes to "${tab.handle.name}".`);
            } else if (tab.id === stateRef.current.activeTabId) {
              const targetHandle = tab.handle;
              const targetTabId = tab.id;
              const currentTabContent = tab.content;
              setConflictModal({
                kind: 'external-modification',
                title: 'External sync conflict',
                description: `"${targetHandle.name}" was updated externally (e.g. via Google Drive) while you have unsaved local edits.`,
                onSaveAndContinue: async () => {
                  setConflictModal(null);
                  await writeToHandle(targetHandle, currentTabContent, true, targetTabId);
                },
                onDiscardAndContinue: async () => {
                  setConflictModal(null);
                  const freshFile = await targetHandle.getFile();
                  const freshText = await freshFile.text();
                  updateTabFromDisk(targetTabId, {
                    content: freshText,
                    lastModified: freshFile.lastModified,
                    fileName: targetHandle.name,
                  });
                  showToast(`Reloaded "${targetHandle.name}" from disk.`);
                },
                onSaveAsNew: async () => {
                  setConflictModal(null);
                  await saveFileAsInternal(
                    currentTabContent,
                    `copy-${targetHandle.name}`,
                    targetTabId
                  );
                },
                onCancel: () => setConflictModal(null),
              });
              break;
            }
          } catch {
            // Ignore transient file access errors
          }
        }
      } finally {
        checking = false;
      }
    };

    const onWindowFocus = () => {
      void checkExternalModifications();
    };

    window.addEventListener('focus', onWindowFocus);
    const interval = window.setInterval(() => {
      void checkExternalModifications();
    }, 8000);

    return () => {
      window.removeEventListener('focus', onWindowFocus);
      window.clearInterval(interval);
    };
  }, [updateTabFromDisk, setConflictModal, writeToHandle, saveFileAsInternal, showToast]);

  // ChromeOS File Handling API & Shelf Shortcut (?action=new) consumer
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'new') {
      window.history.replaceState({}, '', window.location.pathname);
      loadDocument({
        fileName: 'Untitled.md',
        content: '',
        handle: null,
        lastModified: null,
      });
    }

    if (typeof window === 'undefined' || !window.launchQueue) return;

    window.launchQueue.setConsumer(async (launchParams) => {
      if (launchParams.files && launchParams.files.length > 0) {
        for (const fileHandle of launchParams.files) {
          await openFromHandle(fileHandle, false);
        }
        return;
      }

      if (launchParams.targetURL) {
        try {
          const url = new URL(launchParams.targetURL, window.location.origin);
          if (url.searchParams.get('action') === 'new') {
            newDocument();
            return;
          }
        } catch {
          // Ignore malformed URL
        }
      }
    });
  }, []);

  // Global keyboard shortcuts (Ctrl+S, Ctrl+Shift+S, Ctrl+O)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          void saveFileAs();
        } else {
          void saveFile();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void openFile();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveFile, saveFileAs, openFile]);

  // Drag & Drop file or folder handler on window
  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const items = e.dataTransfer?.items;
      if (items && items.length > 0) {
        const firstItem = items[0];
        if (firstItem.kind === 'file' && typeof firstItem.getAsFileSystemHandle === 'function') {
          try {
            const droppedHandle = await firstItem.getAsFileSystemHandle();
            if (droppedHandle && droppedHandle.kind === 'directory' && onDropDirectoryHandle) {
              onDropDirectoryHandle(droppedHandle as FileSystemDirectoryHandle);
              return;
            }
            if (droppedHandle && droppedHandle.kind === 'file') {
              await openFromHandle(droppedHandle as FileSystemFileHandle, true);
              return;
            }
          } catch {
            // Fall through to File API fallback
          }
        }
      }

      const droppedFiles = Array.from(e.dataTransfer?.files ?? []);
      if (droppedFiles.length === 0) return;

      for (const droppedFile of droppedFiles) {
        const text = await droppedFile.text();
        await openTab({
          fileName: droppedFile.name,
          content: text,
          handle: null,
          lastModified: droppedFile.lastModified,
        });
      }
      showToast(
        droppedFiles.length === 1
          ? `Opened "${droppedFiles[0].name}" via Drag & Drop.`
          : `Opened ${droppedFiles.length} files via Drag & Drop.`
      );
    },
    [openFromHandle, openTab, onDropDirectoryHandle, showToast]
  );

  return {
    openFile,
    openFromHandle,
    saveFile,
    saveFileAs,
    newDocument,
    requestCloseTab,
    handleFileDrop,
  };
}
