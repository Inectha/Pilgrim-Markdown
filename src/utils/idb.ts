import { get, set, del, entries } from 'idb-keyval';

export interface DraftRecord {
  docId: string;
  fileName: string;
  content: string;
  isDirty: boolean;
  lastKnownModified: number | null;
  updatedAt: number;
}

export interface RecentHandleEntry {
  name: string;
  handle: FileSystemFileHandle;
  lastOpenedAt: number;
}

const DRAFT_PREFIX = 'draft:';
const RECENT_HANDLES_KEY = 'recent-handles';
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
