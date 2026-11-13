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

export function useFileSystem() {
  const {
    fileName,
    content,
    isDirty,
    handle,
    lastKnownModified,
    autoSaveToDisk,
    loadDocument,
    markSaved,
    showToast,
    setConflictModal,
    recordRecentHandle,
    forgetRecentHandle,
  } = useDocument();

  const stateRef = useRef({
    fileName,
    content,
    isDirty,
    handle,
    lastKnownModified,
  });
  stateRef.current = { fileName, content, isDirty, handle, lastKnownModified };

  const writeToHandle = useCallback(
    async (
      targetHandle: FileSystemFileHandle,
      textToWrite: string,
      ignoreConflict: boolean = false
    ): Promise<boolean> => {
      try {
        const hasPerm = await verifyReadWritePermission(targetHandle, true);
        if (!hasPerm) {
          showToast('Write permission denied for this file.');
          return false;
        }

        // Check for external modification on disk / Google Drive mount before writing
        const currentFile = await targetHandle.getFile();
        const expectedMod = stateRef.current.lastKnownModified;
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
              await writeToHandle(targetHandle, textToWrite, true);
            },
            onDiscardAndContinue: async () => {
              setConflictModal(null);
              const freshFile = await targetHandle.getFile();
              const freshText = await freshFile.text();
              loadDocument({
                fileName: targetHandle.name,
                content: freshText,
                handle: targetHandle,
                lastModified: freshFile.lastModified,
              });
              showToast(`Reloaded "${targetHandle.name}" from disk.`);
            },
            onSaveAsNew: async () => {
              setConflictModal(null);
              await saveFileAsInternal(textToWrite, `copy-${targetHandle.name}`);
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
    [loadDocument, markSaved, recordRecentHandle, setConflictModal, showToast]
  );

  const saveFileAsInternal = useCallback(
    async (textToSave: string, suggestedName?: string): Promise<boolean> => {
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

      // Fallback for Firefox / Safari
      downloadBlobFallback(textToSave, targetName);
      markSaved({
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

  const saveFile = useCallback(async (): Promise<boolean> => {
    const { handle: currentHandle, content: currentContent, fileName: currentName } = stateRef.current;
    if (currentHandle) {
      const ok = await writeToHandle(currentHandle, currentContent, false);
      if (ok) showToast(`Saved "${currentHandle.name}".`);
      return ok;
    }
    return saveFileAsInternal(currentContent, currentName);
  }, [writeToHandle, saveFileAsInternal, showToast]);

  const saveFileAs = useCallback(async (): Promise<boolean> => {
    return saveFileAsInternal(stateRef.current.content, stateRef.current.fileName);
  }, [saveFileAsInternal]);

  const guardDirtyAction = useCallback(
    (action: () => void) => {
      if (!stateRef.current.isDirty) {
        action();
        return;
      }
      setConflictModal({
        kind: 'unsaved-changes',
        title: 'Unsaved changes',
        description: `There are unsaved changes in "${stateRef.current.fileName}". Would you like to save them first?`,
        onSaveAndContinue: async () => {
          setConflictModal(null);
          const saved = await saveFile();
          if (saved) action();
        },
        onDiscardAndContinue: () => {
          setConflictModal(null);
          action();
        },
        onCancel: () => setConflictModal(null),
      });
    },
    [saveFile, setConflictModal]
  );

  const openFromHandle = useCallback(
    async (targetHandle: FileSystemFileHandle, requestPerm: boolean = true) => {
      const executeOpen = async () => {
        try {
          if (typeof targetHandle.queryPermission === 'function') {
            const state = await targetHandle.queryPermission({ mode: 'readwrite' });
            if (state !== 'granted' && requestPerm && typeof targetHandle.requestPermission === 'function') {
              await targetHandle.requestPermission({ mode: 'readwrite' });
            }
          }
          const file = await targetHandle.getFile();
          const text = await file.text();
          loadDocument({
            fileName: targetHandle.name,
            content: text,
            handle: targetHandle,
            lastModified: file.lastModified,
          });
          await recordRecentHandle(targetHandle);
          showToast(`Opened "${targetHandle.name}".`);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'NotFoundError') {
            await forgetRecentHandle(targetHandle);
            showToast(`"${targetHandle.name}" no longer exists and was removed from recent files.`);
            return;
          }
          showToast(`Could not open "${targetHandle.name}".`);
        }
      };

      guardDirtyAction(executeOpen);
    },
    [guardDirtyAction, loadDocument, recordRecentHandle, forgetRecentHandle, showToast]
  );

  const openFile = useCallback(() => {
    const executePicker = async () => {
      if (typeof window.showOpenFilePicker === 'function') {
        try {
          const [pickedHandle] = await window.showOpenFilePicker({
            multiple: false,
            types: FILE_PICKER_TYPES,
          });
          if (pickedHandle) {
            const file = await pickedHandle.getFile();
            const text = await file.text();
            loadDocument({
              fileName: pickedHandle.name,
              content: text,
              handle: pickedHandle,
              lastModified: file.lastModified,
            });
            await recordRecentHandle(pickedHandle);
            showToast(`Opened "${pickedHandle.name}".`);
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
      input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        loadDocument({
          fileName: file.name,
          content: text,
          handle: null,
          lastModified: file.lastModified,
        });
        showToast(`Opened "${file.name}" (Download mode).`);
      };
      input.click();
    };

    guardDirtyAction(executePicker);
  }, [guardDirtyAction, loadDocument, recordRecentHandle, showToast]);

  const newDocument = useCallback(() => {
    guardDirtyAction(() => {
      loadDocument({
        fileName: 'Untitled.md',
        content: '',
        handle: null,
        lastModified: null,
      });
      showToast('Started new document.');
    });
  }, [guardDirtyAction, loadDocument, showToast]);

  // Optional auto-save to disk (when enabled by user and a valid handle exists)
  useEffect(() => {
    if (!autoSaveToDisk || !isDirty || !handle) return;
    const timer = window.setTimeout(() => {
      writeToHandle(handle, content, false);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [autoSaveToDisk, isDirty, handle, content, writeToHandle]);

  // ChromeOS File Handling API & Shelf Shortcut (?action=new) consumer
  useEffect(() => {
    // Check initial URL query param on cold start
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

    window.launchQueue.setConsumer((launchParams) => {
      // 1. Incoming file(s) from ChromeOS Files app
      if (launchParams.files && launchParams.files.length > 0) {
        const firstHandle = launchParams.files[0];
        const multipleCount = launchParams.files.length;
        openFromHandle(firstHandle, false).then(() => {
          if (multipleCount > 1) {
            showToast(
              `Opened 1 of ${multipleCount} files (open additional files in separate windows).`
            );
          }
        });
        return;
      }

      // 2. Incoming targetURL with ?action=new from Shelf shortcut
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

      // 3. Regular focus-existing click on Shelf icon -> strict no-op
    });
  }, []);

  // Global keyboard shortcuts (Ctrl+S, Ctrl+Shift+S, Ctrl+O)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          saveFileAs();
        } else {
          saveFile();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openFile();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveFile, saveFileAs, openFile]);

  // Drag & Drop file handler on window (retains write handle via getAsFileSystemHandle on ChromeOS)
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
            if (droppedHandle && droppedHandle.kind === 'file') {
              await openFromHandle(droppedHandle as FileSystemFileHandle, true);
              return;
            }
          } catch {
            // Fall through to File API fallback
          }
        }
      }

      const droppedFile = e.dataTransfer?.files?.[0];
      if (!droppedFile) return;

      guardDirtyAction(async () => {
        const text = await droppedFile.text();
        loadDocument({
          fileName: droppedFile.name,
          content: text,
          handle: null,
          lastModified: droppedFile.lastModified,
        });
        showToast(`Opened "${droppedFile.name}" via Drag & Drop.`);
      });
    },
    [openFromHandle, guardDirtyAction, loadDocument, showToast]
  );

  return {
    openFile,
    openFromHandle,
    saveFile,
    saveFileAs,
    newDocument,
    handleFileDrop,
  };
}
