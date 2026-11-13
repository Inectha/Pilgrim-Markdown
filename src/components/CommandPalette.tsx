import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface PaletteCommand {
  id: string;
  label: string;
  category: 'Markdown' | 'File' | 'View' | 'Help';
  shortcut?: string;
  description: string;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  commands,
}) => {
  const [query, setQuery] = useState<string>('');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 15);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q)
    );
  }, [query, commands]);

  useEffect(() => {
    setActiveIndex(0);
  }, [filtered.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) =>
          filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
        );
      } else if (e.key === 'Enter' && filtered[activeIndex]) {
        e.preventDefault();
        const chosen = filtered[activeIndex];
        onClose();
        chosen.run();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, filtered, activeIndex, onClose]);

  if (!isOpen) return null;

  const activeItem = filtered[activeIndex];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="no-print fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 pt-[12vh] backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] shadow-2xl"
      >
        <div className="border-b border-[var(--md-outline-variant)] p-3">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={activeItem ? `cmd-${activeItem.id}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or Markdown block (e.g. table, math, export, theme)..."
            className="w-full rounded-xl border border-[var(--md-outline-variant)] bg-[var(--md-surface)] px-3.5 py-2 text-xs text-[var(--md-on-surface)] placeholder-[var(--md-on-surface-variant)] outline-none focus:border-[var(--md-primary)]"
          />
        </div>

        <ul
          id="command-palette-list"
          role="listbox"
          className="max-h-80 overflow-y-auto p-1.5"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-[var(--md-on-surface-variant)]">
              No commands found.
            </li>
          ) : (
            filtered.map((cmd, idx) => {
              const selected = idx === activeIndex;
              return (
                <li
                  key={cmd.id}
                  id={`cmd-${cmd.id}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    onClose();
                    cmd.run();
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs ${
                    selected
                      ? 'bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]'
                      : 'text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[var(--md-surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--md-on-surface-variant)]">
                        {cmd.category}
                      </span>
                      <span className="truncate font-medium">{cmd.label}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] opacity-80">{cmd.description}</p>
                  </div>
                  {cmd.shortcut && (
                    <kbd className="shrink-0 rounded border border-[var(--md-outline-variant)] bg-[var(--md-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--md-on-surface-variant)]">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
};
