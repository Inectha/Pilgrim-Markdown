import { useEffect, useRef, useState, useCallback } from 'react';
import { useDocument } from '../context/DocumentContext';
import {
  DraftRecord,
  saveDraft,
  getDraft,
  deleteDraft,
  getAllDrafts,
} from '../utils/idb';

export function useDraftRecovery() {
  const {
    docId,
    reassignDocId,
    fileName,
    content,
    isDirty,
    lastKnownModified,
    loadDocument,
    showToast,
  } = useDocument();

  const [recoverableDraft, setRecoverableDraft] = useState<DraftRecord | null>(null);
  const bypassBeforeUnloadRef = useRef<boolean>(false);
  const activeDocIdRef = useRef<string>(docId);
  activeDocIdRef.current = docId;
  const startupCheckedRef = useRef<boolean>(false);

  const checkStartupDrafts = useCallback(
    async (allowOwnDraft: boolean, initialDocId: string) => {
      if (allowOwnDraft) {
        // 1. Check if this same sessionStorage docId has an active dirty draft (e.g. after SW reload)
        const ownDraft = await getDraft(initialDocId);
        if (ownDraft && ownDraft.isDirty) {
          loadDocument({
            fileName: ownDraft.fileName,
            content: ownDraft.content,
            handle: null,
            lastModified: ownDraft.lastKnownModified,
            markDirty: true,
          });
          showToast(`Restored draft "${ownDraft.fileName}" after reload.`);
          return;
        }
      }

      // 2. Otherwise inspect all drafts and filter out any draft locked by a live window
      const allDrafts = await getAllDrafts();
      const dirtyDrafts = allDrafts.filter((d) => d.isDirty && d.docId !== activeDocIdRef.current);
      if (dirtyDrafts.length === 0) return;

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

      const orphaned = dirtyDrafts.find((d) => !heldLockNames.has(`draft-${d.docId}`));
      if (orphaned) {
        setRecoverableDraft(orphaned);
      }
    },
    [loadDocument, showToast]
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
            // Another live tab/window holds this docId (e.g. duplicated tab) -> generate fresh docId
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

  // Debounced draft persistence (~500 ms)
  useEffect(() => {
    if (!isDirty) {
      // Immediately mark clean & delete draft so clean closes never trigger recovery
      saveDraft({
        docId,
        fileName,
        content,
        isDirty: false,
        lastKnownModified,
        updatedAt: Date.now(),
      }).then(() => deleteDraft(docId));
      return;
    }

    const timer = window.setTimeout(() => {
      saveDraft({
        docId,
        fileName,
        content,
        isDirty: true,
        lastKnownModified,
        updatedAt: Date.now(),
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [docId, fileName, content, isDirty, lastKnownModified]);

  // Warn before closing a window with unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !bypassBeforeUnloadRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const onPageHide = () => {
      if (!isDirty) {
        saveDraft({
          docId: activeDocIdRef.current,
          fileName,
          content,
          isDirty: false,
          lastKnownModified,
          updatedAt: Date.now(),
        });
        deleteDraft(activeDocIdRef.current);
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [isDirty, fileName, content, lastKnownModified]);

  const restoreRecoverableDraft = useCallback(async () => {
    if (!recoverableDraft) return;
    loadDocument({
      fileName: recoverableDraft.fileName,
      content: recoverableDraft.content,
      handle: null,
      lastModified: recoverableDraft.lastKnownModified,
      markDirty: true,
    });
    await deleteDraft(recoverableDraft.docId);
    setRecoverableDraft(null);
    showToast(`Restored unsaved draft "${recoverableDraft.fileName}".`);
  }, [recoverableDraft, loadDocument, showToast]);

  const dismissRecoverableDraft = useCallback(async () => {
    if (!recoverableDraft) return;
    await deleteDraft(recoverableDraft.docId);
    setRecoverableDraft(null);
  }, [recoverableDraft]);

  const flushDraftForReload = useCallback(async () => {
    bypassBeforeUnloadRef.current = true;
    if (isDirty) {
      await saveDraft({
        docId,
        fileName,
        content,
        isDirty: true,
        lastKnownModified,
        updatedAt: Date.now(),
      });
    }
  }, [docId, fileName, content, isDirty, lastKnownModified]);

  return {
    recoverableDraft,
    restoreRecoverableDraft,
    dismissRecoverableDraft,
    flushDraftForReload,
  };
}
