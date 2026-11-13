import React, { useState, useEffect, useRef, useMemo } from 'react';
import { HELP_TOPICS, HelpCategory } from '../utils/commands';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertExample: (snippet: string) => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, onInsertExample }) => {
  const [query, setQuery] = useState<string>('');
  const [category, setCategory] = useState<'all' | HelpCategory>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      window.setTimeout(() => searchInputRef.current?.focus(), 20);
    }
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

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HELP_TOPICS.filter((topic) => {
      if (category !== 'all' && topic.category !== category) return false;
      if (!q) return true;
      return (
        topic.title.toLowerCase().includes(q) ||
        topic.summary.toLowerCase().includes(q) ||
        (topic.example?.toLowerCase().includes(q) ?? false) ||
        topic.keywords.some((kw) => kw.includes(q))
      );
    });
  }, [query, category]);

  if (!isOpen) return null;

  const categories: { id: 'all' | HelpCategory; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'markdown', label: 'Markdown Syntax' },
    { id: 'shortcuts', label: 'Shortcuts & / Commands' },
    { id: 'features', label: 'App & ChromeOS' },
  ];

  const handleCopyExample = async (id: string, example: string) => {
    try {
      await navigator.clipboard?.writeText(example);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--md-outline-variant)] px-5 py-3.5">
          <div>
            <h2 id="help-modal-title" className="text-base font-semibold text-[var(--md-on-surface)]">
              Pilgrim Markdown Help & Cheat Sheet
            </h2>
            <p className="text-xs text-[var(--md-on-surface-variant)]">
              Search syntax, shortcuts, slash commands, and offline features
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="rounded-lg px-2.5 py-1 text-sm text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]"
          >
            ✕
          </button>
        </div>

        {/* Search & Category Tabs */}
        <div className="border-b border-[var(--md-outline-variant)] bg-[var(--md-surface)] px-5 py-3">
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help (e.g. table, math, shortcut, google docs, slash)..."
            aria-label="Search help topics and Markdown syntax"
            className="w-full rounded-xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] px-3.5 py-2 text-xs text-[var(--md-on-surface)] placeholder-[var(--md-on-surface-variant)] outline-none focus:border-[var(--md-primary)]"
          />

          <div className="mt-2.5 flex flex-wrap gap-1.5" role="tablist" aria-label="Help categories">
            {categories.map((cat) => {
              const active = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategory(cat.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]'
                      : 'text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {filteredTopics.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--md-on-surface-variant)]">
              No help topics matched &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filteredTopics.map((topic) => (
              <div
                key={topic.id}
                className="rounded-xl border border-[var(--md-outline-variant)] bg-[var(--md-surface)] p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xs font-semibold text-[var(--md-on-surface)]">
                    {topic.title}
                  </h3>
                  <span className="shrink-0 rounded-full bg-[var(--md-surface-container)] px-2 py-0.5 text-[10px] font-medium uppercase text-[var(--md-on-surface-variant)]">
                    {topic.category}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--md-on-surface-variant)]">
                  {topic.summary}
                </p>

                {topic.example && (
                  <div className="mt-2.5 overflow-hidden rounded-lg border border-[var(--md-outline-variant)] bg-[var(--md-surface-container)]">
                    <pre className="overflow-x-auto px-3 py-2 font-mono text-[11px] text-[var(--md-on-surface)]">
                      <code>{topic.example}</code>
                    </pre>
                    <div className="flex items-center justify-end gap-2 border-t border-[var(--md-outline-variant)] px-2.5 py-1">
                      <button
                        type="button"
                        onClick={() => handleCopyExample(topic.id, topic.example!)}
                        className="rounded px-2 py-0.5 text-[11px] font-medium text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]"
                      >
                        {copiedId === topic.id ? 'Copied ✓' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onInsertExample(topic.example!);
                          onClose();
                        }}
                        className="rounded bg-[var(--md-primary)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--md-on-primary)] hover:opacity-90"
                      >
                        Insert into editor
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
