import { get, set, del, entries } from 'idb-keyval';

export interface DraftRecord {
  docId: string;
  fileName: string;
  content: string;
  isDirty: boolean;
  lastKnownModified: number | null;
  updatedAt: number;
}

export interface WorkspaceDraftTab {
  id: string;
  fileName: string;
  filePath?: string;
  content: string;
  isDirty: boolean;
  lastKnownModified: number | null;
}

export interface WorkspaceDraftRecord {
  workspaceId: string;
  activeTabId: string;
  tabs: WorkspaceDraftTab[];
  updatedAt: number;
}

export interface RecentHandleEntry {
  name: string;
  handle: FileSystemFileHandle;
  lastOpenedAt: number;
}

export interface SavedVaultEntry {
  name: string;
  handle: FileSystemDirectoryHandle;
  lastOpenedAt: number;
}

export interface PendingDriveSyncItem {
  id: string;
  driveFileId: string | null;
  fileName: string;
  content: string;
  baseModifiedTime: string | null;
  queuedAt: number;
}

const DRAFT_PREFIX = 'draft:';
const WORKSPACE_DRAFT_PREFIX = 'workspace-draft:';
const RECENT_HANDLES_KEY = 'recent-handles';
const VAULT_HANDLE_KEY = 'vault-handle';
const DRIVE_SYNC_QUEUE_KEY = 'drive-sync-queue';
const MAX_RECENT_HANDLES = 8;

function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function saveDraft(record: DraftRecord): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    await set(`${DRAFT_PREFIX}${record.docId}`, record);
  } catch {
    // Ignore quota or private-browsing IDB errors gracefully
  }
}

export async function getDraft(docId: string): Promise<DraftRecord | undefined> {
  if (!isIndexedDBAvailable()) return undefined;
  try {
    return await get<DraftRecord>(`${DRAFT_PREFIX}${docId}`);
  } catch {
    return undefined;
  }
}

export async function deleteDraft(docId: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    await del(`${DRAFT_PREFIX}${docId}`);
  } catch {
    // Ignore
  }
}

export async function getAllDrafts(): Promise<DraftRecord[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const allEntries = await entries<IDBValidKey, unknown>();
    const drafts: DraftRecord[] = [];
    for (const [key, val] of allEntries) {
      if (typeof key === 'string' && key.startsWith(DRAFT_PREFIX) && val && typeof val === 'object') {
        drafts.push(val as DraftRecord);
      }
    }
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function getRecentHandles(): Promise<RecentHandleEntry[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const list = await get<RecentHandleEntry[]>(RECENT_HANDLES_KEY);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function addRecentHandle(handle: FileSystemFileHandle): Promise<RecentHandleEntry[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const current = await getRecentHandles();
    const filtered: RecentHandleEntry[] = [];
    for (const item of current) {
      try {
        const same = await item.handle.isSameEntry(handle);
        if (!same) {
          filtered.push(item);
        }
      } catch {
        filtered.push(item);
      }
    }
    const next: RecentHandleEntry[] = [
      { name: handle.name, handle, lastOpenedAt: Date.now() },
      ...filtered,
    ].slice(0, MAX_RECENT_HANDLES);
    await set(RECENT_HANDLES_KEY, next);
    return next;
  } catch {
    return [];
  }
}

export async function removeRecentHandle(handle: FileSystemFileHandle): Promise<RecentHandleEntry[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const current = await getRecentHandles();
    const next: RecentHandleEntry[] = [];
    for (const item of current) {
      try {
        const same = await item.handle.isSameEntry(handle);
        if (!same) next.push(item);
      } catch {
        // Skip invalid handle
      }
    }
    await set(RECENT_HANDLES_KEY, next);
    return next;
  } catch {
    return [];
  }
}

export async function clearRecentHandles(): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    await del(RECENT_HANDLES_KEY);
  } catch {
    // Ignore
  }
}

export async function saveWorkspaceDraft(record: WorkspaceDraftRecord): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    await set(`${WORKSPACE_DRAFT_PREFIX}${record.workspaceId}`, record);
  } catch {
    // Ignore quota or private-browsing IDB errors gracefully
  }
}

export async function getWorkspaceDraft(
  workspaceId: string
): Promise<WorkspaceDraftRecord | undefined> {
  if (!isIndexedDBAvailable()) return undefined;
  try {
    return await get<WorkspaceDraftRecord>(`${WORKSPACE_DRAFT_PREFIX}${workspaceId}`);
  } catch {
    return undefined;
  }
}

export async function deleteWorkspaceDraft(workspaceId: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    await del(`${WORKSPACE_DRAFT_PREFIX}${workspaceId}`);
  } catch {
    // Ignore
  }
}

export async function getAllWorkspaceDrafts(): Promise<WorkspaceDraftRecord[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const allEntries = await entries<IDBValidKey, unknown>();
    const drafts: WorkspaceDraftRecord[] = [];
    for (const [key, val] of allEntries) {
      if (
        typeof key === 'string' &&
        key.startsWith(WORKSPACE_DRAFT_PREFIX) &&
        val &&
        typeof val === 'object'
      ) {
        drafts.push(val as WorkspaceDraftRecord);
      }
    }
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function getSavedVaultHandle(): Promise<SavedVaultEntry | undefined> {
  if (!isIndexedDBAvailable()) return undefined;
  try {
    return await get<SavedVaultEntry>(VAULT_HANDLE_KEY);
  } catch {
    return undefined;
  }
}

export async function setSavedVaultHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const entry: SavedVaultEntry = {
      name: handle.name,
      handle,
      lastOpenedAt: Date.now(),
    };
    await set(VAULT_HANDLE_KEY, entry);
  } catch {
    // Ignore
  }
}

export async function clearSavedVaultHandle(): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    await del(VAULT_HANDLE_KEY);
  } catch {
    // Ignore
  }
}

export async function getDriveSyncQueue(): Promise<PendingDriveSyncItem[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const list = await get<PendingDriveSyncItem[]>(DRIVE_SYNC_QUEUE_KEY);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function enqueueDriveSyncItem(
  item: PendingDriveSyncItem
): Promise<PendingDriveSyncItem[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const current = await getDriveSyncQueue();
    const filtered = current.filter(
      (existing) =>
        existing.id !== item.id &&
        !(item.driveFileId && existing.driveFileId === item.driveFileId)
    );
    const next = [...filtered, item];
    await set(DRIVE_SYNC_QUEUE_KEY, next);
    return next;
  } catch {
    return [];
  }
}

export async function removeDriveSyncQueueItem(id: string): Promise<PendingDriveSyncItem[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const current = await getDriveSyncQueue();
    const next = current.filter((item) => item.id !== id);
    await set(DRIVE_SYNC_QUEUE_KEY, next);
    return next;
  } catch {
    return [];
  }
}
