import React, { useState, useRef, useEffect } from 'react';
import { FormattingAction } from './Editor';
import { TocItem } from '../utils/markdown';
import { useDocument } from '../context/DocumentContext';

interface ToolbarProps {
  toc: TocItem[];
  onFormat: (action: FormattingAction) => void;
  onSelectTocLine: (zeroBasedLine: number) => void;
  onOpenPalette: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  toc,
  onFormat,
  onSelectTocLine,
  onOpenPalette,
}) => {
  const { syncScroll, setSyncScroll, zenMode, setZenMode } = useDocument();
  const [tocOpen, setTocOpen] = useState<boolean>(false);
  const tocRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (tocRef.current && !tocRef.current.contains(e.target as Node)) {
        setTocOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tocOpen) {
        setTocOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [tocOpen]);

  const buttons: { action: FormattingAction; label: string; title: string; className?: string }[] = [
    { action: 'h1', label: 'H1', title: 'Heading 1', className: 'font-bold' },
    { action: 'h2', label: 'H2', title: 'Heading 2', className: 'font-bold' },
    { action: 'h3', label: 'H3', title: 'Heading 3', className: 'font-bold' },
    { action: 'bold', label: 'B', title: 'Bold (Ctrl+B)', className: 'font-bold' },
    { action: 'italic', label: 'I', title: 'Italic (Ctrl+I)', className: 'italic font-serif' },
    { action: 'inlineCode', label: '<>', title: 'Inline code', className: 'font-mono text-[11px]' },
    { action: 'codeBlock', label: '{ }', title: 'Code block', className: 'font-mono text-[11px]' },
    { action: 'link', label: '🔗', title: 'Insert link (Ctrl+K)' },
    { action: 'table', label: '⊞', title: 'Insert table' },
    { action: 'taskList', label: '☑', title: 'Task list / Checklist' },
    { action: 'quote', label: '❝', title: 'Blockquote' },
  ];

  return (
    <nav
      aria-label="Markdown formatting toolbar"
      className="no-print relative z-20 flex h-10 shrink-0 select-none items-center justify-between gap-2 border-b border-[var(--md-outline-variant)] bg-[var(--md-surface)] px-3"
    >
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {buttons.map((btn) => (
          <button
            key={btn.action}
            type="button"
            onClick={() => onFormat(btn.action)}
            title={btn.title}
            aria-label={btn.title}
            className={`rounded-md px-2 py-1 text-xs text-[var(--md-on-surface)] transition-colors hover:bg-[var(--md-surface-variant)] ${
              btn.className || ''
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenPalette}
          title="Command Palette (Ctrl+/ or Ctrl+Shift+P) — or type / in editor"
          aria-label="Open Command Palette"
          className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--md-on-surface-variant)] transition-colors hover:bg-[var(--md-surface-variant)]"
        >
          ⌘ Commands
        </button>

        {/* Clickable Document Outline (TOC) Popover */}
        <div ref={tocRef} className="relative">
          <button
            type="button"
            onClick={() => setTocOpen((prev) => !prev)}
            title="Table of Contents (H1–H3)"
            aria-label="Show Table of Contents"
            aria-expanded={tocOpen}
            aria-haspopup="true"
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              tocOpen
                ? 'bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]'
                : 'text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]'
            }`}
          >
            ☰ Outline ({toc.length})
          </button>

          {tocOpen && (
            <div className="absolute right-0 top-full z-40 mt-1.5 max-h-72 w-64 overflow-y-auto rounded-xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] p-1.5 shadow-lg">
              <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--md-on-surface-variant)]">
                Document Outline
              </div>
              {toc.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-[var(--md-on-surface-variant)]">
                  No headings (H1–H3) found.
                </div>
              ) : (
                toc.map((item, index) => (
                  <button
                    key={`${item.id}-${index}`}
                    type="button"
                    onClick={() => {
                      setTocOpen(false);
                      onSelectTocLine(item.line);
                    }}
                    style={{ paddingLeft: `${(item.level - 1) * 12 + 10}px` }}
                    className="flex w-full items-center justify-between rounded-lg py-1.5 pr-2.5 text-left text-xs text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]"
                  >
                    <span className="truncate">{item.text}</span>
                    <span className="ml-2 shrink-0 text-[10px] text-[var(--md-on-surface-variant)]">
                      L{item.line + 1}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSyncScroll((prev) => !prev)}
          title="Toggle synchronized scrolling"
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            syncScroll
              ? 'bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]'
              : 'text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]'
          }`}
        >
          ⇅ Sync
        </button>

        <button
          type="button"
          onClick={() => setZenMode((prev) => !prev)}
          title="Toggle Focus / Zen mode"
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            zenMode
              ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
              : 'text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]'
          }`}
        >
          {zenMode ? '🧘 Focus On' : '🧘 Focus'}
        </button>
      </div>
    </nav>
  );
};
