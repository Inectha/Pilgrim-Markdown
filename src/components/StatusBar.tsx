import React, { useMemo } from 'react';
import { useDocument } from '../context/DocumentContext';

export const StatusBar: React.FC = () => {
  const { content, cursorPos, handle, isDirty } = useDocument();

  const stats = useMemo(() => {
    const trimmed = content.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = content.length;
    const readMinutes = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readMinutes };
  }, [content]);

  return (
    <footer
      aria-label="Document status bar"
      className="no-print flex h-7 shrink-0 select-none items-center justify-between border-t border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] px-3 text-[11px] text-[var(--md-on-surface-variant)]"
    >
      <div className="flex items-center gap-4">
        <span>
          <strong>{stats.words}</strong> words
        </span>
        <span>
          <strong>{stats.chars}</strong> chars
        </span>
        <span className="hidden sm:inline">~{stats.readMinutes} min read</span>
      </div>

      <div className="flex items-center gap-4">
        <span>
          Line {cursorPos.line}, Col {cursorPos.col}
        </span>
        <span className="hidden md:inline">
          {handle
            ? `Local file (${isDirty ? 'modified' : 'synced'})`
            : 'IndexedDB Draft Cache'}
        </span>
      </div>
    </footer>
  );
};
