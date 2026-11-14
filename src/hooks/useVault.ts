import { useState, useCallback, useEffect } from 'react';
import { useDocument } from '../context/DocumentContext';
import {
  VaultNode,
  VaultFileNode,
  isDirectoryPickerSupported,
  scanVaultDirectory,
} from '../utils/vault';
import {
  SavedVaultEntry,
  getSavedVaultHandle,
  setSavedVaultHandle,
  clearSavedVaultHandle,
} from '../utils/idb';

export function useVault(
  onOpenVaultFile: (handle: FileSystemFileHandle, filePath: string) => Promise<void>
) {
  const { showToast } = useDocument();

  const [vaultHandle, setVaultHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [vaultTree, setVaultTree] = useState<VaultNode[]>([]);
  const [vaultFlatFiles, setVaultFlatFiles] = useState<VaultFileNode[]>([]);
  const [savedVault, setSavedVault] = useState<SavedVaultEntry | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  useEffect(() => {
    getSavedVaultHandle().then((entry) => {
      if (entry) setSavedVault(entry);
    });
  }, []);

  const loadDirectoryHandle = useCallback(
    async (dirHandle: FileSystemDirectoryHandle, requestPerm: boolean = true) => {
      try {
        if (typeof dirHandle.queryPermission === 'function') {
          const state = await dirHandle.queryPermission({ mode: 'readwrite' });
          if (
            state !== 'granted' &&
            requestPerm &&
            typeof dirHandle.requestPermission === 'function'
          ) {
            const granted = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (granted !== 'granted') {
              // Try read-only fallback if readwrite was declined
              const readState = await dirHandle.requestPermission({ mode: 'read' });
              if (readState !== 'granted') {
                showToast('Folder access permission denied.');
                return;
              }
            }
          }
        }

        setIsScanning(true);
        const result = await scanVaultDirectory(dirHandle);
        setVaultHandle(dirHandle);
        setVaultTree(result.tree);
        setVaultFlatFiles(result.flatFiles);
        setSidebarOpen(true);
        await setSavedVaultHandle(dirHandle);
        setSavedVault({
          name: dirHandle.name,
          handle: dirHandle,
          lastOpenedAt: Date.now(),
        });
        showToast(
          `Opened folder "${dirHandle.name}" (${result.flatFiles.length} Markdown/text file${
            result.flatFiles.length === 1 ? '' : 's'
          }).`
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotFoundError') {
          await clearSavedVaultHandle();
          setSavedVault(null);
          showToast('Saved folder no longer exists on disk.');
          return;
        }
        showToast('Could not open folder.');
      } finally {
        setIsScanning(false);
      }
    },
    [showToast]
  );

  const openVaultPicker = useCallback(async () => {
    if (!isDirectoryPickerSupported() || !window.showDirectoryPicker) {
      showToast('Folder Vault access requires a Chromium browser (ChromeOS, Chrome, or Edge).');
      return;
    }
    try {
      const picked = await window.showDirectoryPicker({ mode: 'readwrite' });
      await loadDirectoryHandle(picked, false);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      showToast('Folder selection cancelled or failed.');
    }
  }, [loadDirectoryHandle, showToast]);

  const reconnectSavedVault = useCallback(async () => {
    if (!savedVault) return;
    await loadDirectoryHandle(savedVault.handle, true);
  }, [savedVault, loadDirectoryHandle]);

  const refreshVault = useCallback(async () => {
    if (!vaultHandle) return;
    setIsScanning(true);
    try {
      const result = await scanVaultDirectory(vaultHandle);
      setVaultTree(result.tree);
      setVaultFlatFiles(result.flatFiles);
    } catch {
      showToast('Failed to refresh folder contents.');
    } finally {
      setIsScanning(false);
    }
  }, [vaultHandle, showToast]);

  const closeVault = useCallback(() => {
    setVaultHandle(null);
    setVaultTree([]);
    setVaultFlatFiles([]);
    setSidebarOpen(false);
    showToast('Closed folder vault.');
  }, [showToast]);

  const createNewFileInVault = useCallback(
    async (rawName: string): Promise<boolean> => {
      if (!vaultHandle) return false;
      const trimmed = rawName.trim().replace(/^[\\/]+/, '');
      if (!trimmed) return false;
      const finalPath = /\.(md|markdown|txt)$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
      const segments = finalPath.split('/').filter(Boolean);
      if (segments.length === 0 || segments.some((s) => s === '.' || s === '..')) {
        showToast('Invalid file name.');
        return false;
      }

      try {
        let dir = vaultHandle;
        for (let i = 0; i < segments.length - 1; i++) {
          dir = await dir.getDirectoryHandle(segments[i], { create: true });
        }
        const leafName = segments[segments.length - 1];
        const fileHandle = await dir.getFileHandle(leafName, { create: true });
        const existingFile = await fileHandle.getFile();
        if (existingFile.size === 0) {
          const title = leafName.replace(/\.(md|markdown|txt)$/i, '');
          const initialText = `# ${title}\n\n`;
          const writable = await fileHandle.createWritable();
          await writable.write(initialText);
          await writable.close();
        }
        await refreshVault();
        await onOpenVaultFile(fileHandle, segments.join('/'));
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        showToast(`Could not create file: ${msg}`);
        return false;
      }
    },
    [vaultHandle, refreshVault, onOpenVaultFile, showToast]
  );

  return {
    vaultHandle,
    vaultName: vaultHandle?.name ?? null,
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
  };
}
