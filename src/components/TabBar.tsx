import React from 'react';
import { DocumentTab } from '../context/DocumentContext';

interface TabBarProps {
  tabs: DocumentTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}) => {
  return (
    <div
      role="tablist"
      aria-label="Open documents"
      className="no-print flex items-center gap-1 overflow-x-auto border-b border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] px-2 py-1 select-none"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isDirty = tab.content !== tab.savedContent;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectTab(tab.id);
              }
            }}
            title={tab.filePath || tab.fileName}
            className={`group flex max-w-[200px] min-w-[110px] cursor-pointer items-center justify-between gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-[var(--md-surface)] text-[var(--md-on-surface)] shadow-sm ring-1 ring-[var(--md-outline-variant)]'
                : 'text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]/50 hover:text-[var(--md-on-surface)]'
            }`}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              {isDirty && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--md-primary)]"
                  title="Unsaved changes"
                  aria-label="Unsaved changes"
                />
              )}
              <span className="truncate">{tab.fileName}</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              aria-label={`Close ${tab.fileName}`}
              title={`Close ${tab.fileName}`}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-60 hover:bg-[var(--md-surface-variant)] hover:opacity-100"
            >
              ×
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onNewTab}
        aria-label="New tab"
        title="New document tab"
        className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm font-medium text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)] hover:text-[var(--md-on-surface)]"
      >
        +
      </button>
    </div>
  );
};
