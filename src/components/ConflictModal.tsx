import React, { useEffect, useRef } from 'react';
import { useDocument } from '../context/DocumentContext';
import { useFocusTrap } from '../hooks/useFocusTrap';

export const ConflictModal: React.FC = () => {
  const { conflictModal } = useDocument();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, Boolean(conflictModal));

  useEffect(() => {
    if (!conflictModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        conflictModal.onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [conflictModal]);

  if (!conflictModal) return null;

  const isExternal = conflictModal.kind === 'external-modification';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] p-6 shadow-xl"
      >
        <h2
          id="conflict-modal-title"
          className="text-base font-semibold text-[var(--md-on-surface)]"
        >
          {conflictModal.title}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-[var(--md-on-surface-variant)]">
          {conflictModal.description}
        </p>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={conflictModal.onCancel}
            className="rounded-full px-3.5 py-1.5 text-xs font-medium text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={conflictModal.onDiscardAndContinue}
            className="rounded-full border border-rose-500/40 px-3.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
          >
            {isExternal ? 'Reload file' : 'Discard'}
          </button>

          {conflictModal.onSaveAsNew && (
            <button
              type="button"
              onClick={conflictModal.onSaveAsNew}
              className="rounded-full bg-[var(--md-secondary-container)] px-3.5 py-1.5 text-xs font-medium text-[var(--md-on-secondary-container)] hover:opacity-90"
            >
              Save as new
            </button>
          )}

          {conflictModal.onSaveAndContinue && (
            <button
              type="button"
              onClick={conflictModal.onSaveAndContinue}
              className="rounded-full bg-[var(--md-primary)] px-4 py-1.5 text-xs font-medium text-[var(--md-on-primary)] shadow-sm hover:opacity-90"
            >
              {isExternal ? 'Overwrite anyway' : 'Save & continue'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
