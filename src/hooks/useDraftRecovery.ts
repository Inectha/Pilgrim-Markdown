import { useEffect, useRef, useState, useCallback } from 'react';
import { useDocument, DocumentTab } from '../context/DocumentContext';
import {
  DraftRecord,
  WorkspaceDraftRecord,
  deleteDraft,
  getAllDrafts,
  saveWorkspaceDraft,
  getWorkspaceDraft,
  deleteWorkspaceDraft,
  getAllWorkspaceDrafts,
} from '../utils/idb';

export interface RecoverableDraftBanner {
  id: string;
  fileName: string;
  updatedAt: number;
  kind: 'workspace' | 'legacy';
  workspaceDraft?: WorkspaceDraftRecord;
  legacyDraft?: DraftRecord;
}

function hydrateTabsFromDraft(record: WorkspaceDraftRecord): DocumentTab[] {
  return record.tabs.map((t) => ({
    id: t.id,
    fileName: t.fileName,
    filePath: t.filePath,
    content: t.content,
    savedContent: t.isDirty ? '' : t.content,
    handle: null,
    lastKnownModified: t.lastKnownModified,
    cursorPos: { line: 1, col: 1 },
  }));
}

function formatWorkspaceSummary(record: WorkspaceDraftRecord): string {
  const dirtyTabs = record.tabs.filter((t) => t.isDirty);
  if (dirtyTabs.length <= 1) {
    return (dirtyTabs[0] ?? record.tabs[0])?.fileName ?? 'Untitled.md';
  }
  return `${dirtyTabs[0].fileName} (+${dirtyTabs.length - 1} more unsaved tab${dirtyTabs.length - 1 > 1 ? 's' : ''})`;
}

export function useDraftRecovery() {
  const {
    docId,
    reassignDocId,
    tabs,
    activeTabId,
    anyDirty,
    loadDocument,
    restoreWorkspaceTabs,
    showToast,
  } = useDocument();

  const [recoverableDraft, setRecoverableDraft] = useState<RecoverableDraftBanner | null>(null);
  const bypassBeforeUnloadRef = useRef<boolean>(false);
  const activeDocIdRef = useRef<string>(docId);
  activeDocIdRef.current = docId;
  const startupCheckedRef = useRef<boolean>(false);

  const checkStartupDrafts = useCallback(
    async (allowOwnDraft: boolean, initialDocId: string) => {
      if (allowOwnDraft) {
        const ownWs = await getWorkspaceDraft(initialDocId);
        if (ownWs && ownWs.tabs.some((t) => t.isDirty)) {
          restoreWorkspaceTabs(hydrateTabsFromDraft(ownWs), ownWs.activeTabId);
          showToast(`Restored "${formatWorkspaceSummary(ownWs)}" after reload.`);
          return;
        }
      }

      const heldLockNames = new Set<string>();
      if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.query) {
        try {
          const snapshot = await navigator.locks.query();
          for (const held of snapshot.held ?? []) {
            if (held.name) heldLockNames.add(held.name);
          }
        } catch {
          // Ignore
        }
      }

      const allWsDrafts = await getAllWorkspaceDrafts();
      const orphanedWs = allWsDrafts.find(
        (d) =>
          d.workspaceId !== activeDocIdRef.current &&
          d.tabs.some((t) => t.isDirty) &&
          !heldLockNames.has(`draft-${d.workspaceId}`)
      );

      if (orphanedWs) {
        setRecoverableDraft({
          id: orphanedWs.workspaceId,
          fileName: formatWorkspaceSummary(orphanedWs),
          updatedAt: orphanedWs.updatedAt,
          kind: 'workspace',
          workspaceDraft: orphanedWs,
        });
        return;
      }

      // Check legacy single-document drafts
      const legacyDrafts = await getAllDrafts();
      const orphanedLegacy = legacyDrafts.find(
        (d) =>
          d.isDirty &&
          d.docId !== activeDocIdRef.current &&
          !heldLockNames.has(`draft-${d.docId}`)
      );
      if (orphanedLegacy) {
        setRecoverableDraft({
          id: orphanedLegacy.docId,
          fileName: orphanedLegacy.fileName,
          updatedAt: orphanedLegacy.updatedAt,
          kind: 'legacy',
          legacyDraft: orphanedLegacy,
        });
      }
    },
    [restoreWorkspaceTabs, showToast]
  );

  // Acquire an exclusive Web Lock for this window's docId (handles tab duplication safely)
  useEffect(() => {
    let releaseLock: (() => void) | null = null;
    let cancelled = false;
    const initialDocId = docId;

    async function acquireWindowLock(targetDocId: string, isReassigned: boolean) {
      if (typeof navigator === 'undefined' || !('locks' in navigator) || !navigator.locks) {
        if (!startupCheckedRef.current) {
          startupCheckedRef.current = true;
          void checkStartupDrafts(true, initialDocId);
        }
        return;
      }

      navigator.locks.request(
        `draft-${targetDocId}`,
        { ifAvailable: true },
        async (lock) => {
          if (cancelled) return;
          if (!lock) {
            const freshId = reassignDocId();
            acquireWindowLock(freshId, true);
            return;
          }
          if (!startupCheckedRef.current) {
            startupCheckedRef.current = true;
            void checkStartupDrafts(!isReassigned, initialDocId);
          }
          await new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
        }
      );
    }

    acquireWindowLock(docId, false);

    return () => {
      cancelled = true;
      if (releaseLock) releaseLock();
    };
  }, [docId, reassignDocId, checkStartupDrafts]);

  // Debounced workspace draft persistence (~500 ms)
  useEffect(() => {
    const buildRecord = (forceClean: boolean): WorkspaceDraftRecord => ({
      workspaceId: docId,
      activeTabId,
      tabs: tabs.map((t) => ({
        id: t.id,
        fileName: t.fileName,
        filePath: t.filePath,
        content: t.content,
        isDirty: forceClean ? false : t.content !== t.savedContent,
        lastKnownModified: t.lastKnownModified,
      })),
      updatedAt: Date.now(),
    });

    if (!anyDirty) {
      saveWorkspaceDraft(buildRecord(true)).then(() => deleteWorkspaceDraft(docId));
      return;
    }

    const timer = window.setTimeout(() => {
      void saveWorkspaceDraft(buildRecord(false));
    }, 500);

    return () => window.clearTimeout(timer);
  }, [docId, tabs, activeTabId, anyDirty]);

  // Warn before closing a window with unsaved changes across any tab
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (anyDirty && !bypassBeforeUnloadRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const onPageHide = () => {
      if (!anyDirty) {
        void saveWorkspaceDraft({
          workspaceId: activeDocIdRef.current,
          activeTabId,
          tabs: tabs.map((t) => ({
            id: t.id,
            fileName: t.fileName,
            filePath: t.filePath,
            content: t.content,
            isDirty: false,
            lastKnownModified: t.lastKnownModified,
          })),
          updatedAt: Date.now(),
        });
        void deleteWorkspaceDraft(activeDocIdRef.current);
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [anyDirty, tabs, activeTabId]);

  const restoreRecoverableDraft = useCallback(async () => {
    if (!recoverableDraft) return;
    if (recoverableDraft.kind === 'workspace' && recoverableDraft.workspaceDraft) {
      const ws = recoverableDraft.workspaceDraft;
      restoreWorkspaceTabs(hydrateTabsFromDraft(ws), ws.activeTabId);
      await deleteWorkspaceDraft(ws.workspaceId);
      setRecoverableDraft(null);
      showToast(`Restored unsaved draft "${recoverableDraft.fileName}".`);
      return;
    }
    if (recoverableDraft.kind === 'legacy' && recoverableDraft.legacyDraft) {
      const legacy = recoverableDraft.legacyDraft;
      loadDocument({
        fileName: legacy.fileName,
        content: legacy.content,
        handle: null,
        lastModified: legacy.lastKnownModified,
        markDirty: true,
      });
      await deleteDraft(legacy.docId);
      setRecoverableDraft(null);
      showToast(`Restored unsaved draft "${legacy.fileName}".`);
    }
  }, [recoverableDraft, restoreWorkspaceTabs, loadDocument, showToast]);

  const dismissRecoverableDraft = useCallback(async () => {
    if (!recoverableDraft) return;
    if (recoverableDraft.kind === 'workspace') {
      await deleteWorkspaceDraft(recoverableDraft.id);
    } else {
      await deleteDraft(recoverableDraft.id);
    }
    setRecoverableDraft(null);
  }, [recoverableDraft]);

  const flushDraftForReload = useCallback(async () => {
    bypassBeforeUnloadRef.current = true;
    if (anyDirty) {
      await saveWorkspaceDraft({
        workspaceId: docId,
        activeTabId,
        tabs: tabs.map((t) => ({
          id: t.id,
          fileName: t.fileName,
          filePath: t.filePath,
          content: t.content,
          isDirty: t.content !== t.savedContent,
          lastKnownModified: t.lastKnownModified,
        })),
        updatedAt: Date.now(),
      });
    }
  }, [docId, tabs, activeTabId, anyDirty]);

  return {
    recoverableDraft,
    restoreRecoverableDraft,
    dismissRecoverableDraft,
    flushDraftForReload,
  };
}
