import React, { useState } from 'react';
import { VaultNode, VaultFileNode } from '../utils/vault';
import { SavedVaultEntry } from '../utils/idb';

interface VaultSidebarProps {
  vaultName: string | null;
  vaultTree: VaultNode[];
  vaultFlatFiles: VaultFileNode[];
  savedVault: SavedVaultEntry | null;
  activeFilePath?: string;
  isScanning: boolean;
  onOpenVaultPicker: () => void;
  onReconnectSavedVault: () => void;
  onSelectFile: (node: VaultFileNode) => void;
  onCreateFile: (name: string) => Promise<boolean>;
  onRefreshVault: () => void;
  onCloseVault: () => void;
  onCollapseSidebar: () => void;
}

const TreeNodeItem: React.FC<{
  node: VaultNode;
  depth: number;
  activeFilePath?: string;
  expandedPaths: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (node: VaultFileNode) => void;
}> = ({ node, depth, activeFilePath, expandedPaths, onToggleDir, onSelectFile }) => {
  if (node.kind === 'directory') {
    const isExpanded = expandedPaths.has(node.path);
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggleDir(node.path)}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs font-medium text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]/50 hover:text-[var(--md-on-surface)]"
        >
          <span className="w-3 text-center text-[10px] opacity-75">
            {isExpanded ? '▾' : '▸'}
          </span>
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && (
          <div>
            {node.children.map((child) => (
              <TreeNodeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFilePath={activeFilePath}
                expandedPaths={expandedPaths}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = activeFilePath === node.path;
  return (
    <button
      type="button"
      onClick={() => onSelectFile(node)}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      title={node.path}
      className={`flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors ${
        isActive
          ? 'bg-[var(--md-primary-container)] font-semibold text-[var(--md-on-primary-container)]'
          : 'text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]/50'
      }`}
    >
      <span className="truncate">{node.name}</span>
    </button>
  );
};

export const VaultSidebar: React.FC<VaultSidebarProps> = ({
  vaultName,
  vaultTree,
  vaultFlatFiles,
  savedVault,
  activeFilePath,
  isScanning,
  onOpenVaultPicker,
  onReconnectSavedVault,
  onSelectFile,
  onCreateFile,
  onRefreshVault,
  onCloseVault,
  onCollapseSidebar,
}) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [creatingFile, setCreatingFile] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('');
  const [filterText, setFilterText] = useState<string>('');

  const toggleDir = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    const ok = await onCreateFile(newFileName);
    if (ok) {
      setNewFileName('');
      setCreatingFile(false);
    }
  };

  const filteredFlatFiles = filterText.trim()
    ? vaultFlatFiles.filter((f) =>
        f.path.toLowerCase().includes(filterText.trim().toLowerCase())
      )
    : null;

  return (
    <aside
      aria-label="Folder Vault Explorer"
      className="no-print flex h-full w-60 shrink-0 flex-col border-r border-[var(--md-outline-variant)] bg-[var(--md-surface-container)] select-none"
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between gap-1 border-b border-[var(--md-outline-variant)] px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold tracking-wide text-[var(--md-on-surface)] uppercase">
            {vaultName || 'Folder Vault'}
          </div>
          {vaultName && (
            <div className="text-[10px] text-[var(--md-on-surface-variant)]">
              {vaultFlatFiles.length} file{vaultFlatFiles.length === 1 ? '' : 's'}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {vaultName && (
            <>
              <button
                type="button"
                onClick={() => setCreatingFile((prev) => !prev)}
                title="New Markdown file in folder"
                aria-label="New Markdown file in folder"
                className="rounded p-1 text-xs text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)] hover:text-[var(--md-on-surface)]"
              >
                +
              </button>
              <button
                type="button"
                onClick={onRefreshVault}
                disabled={isScanning}
                title="Refresh folder"
                aria-label="Refresh folder"
                className="rounded p-1 text-xs text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)] hover:text-[var(--md-on-surface)] disabled:opacity-40"
              >
                ↻
              </button>
              <button
                type="button"
                onClick={onCloseVault}
                title="Close folder vault"
                aria-label="Close folder vault"
                className="rounded p-1 text-xs text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)] hover:text-[var(--md-on-surface)]"
              >
                ⏏
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onCollapseSidebar}
            title="Hide sidebar"
            aria-label="Hide sidebar"
            className="rounded p-1 text-xs text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)] hover:text-[var(--md-on-surface)]"
          >
            «
          </button>
        </div>
      </div>

      {/* New File Inline Prompt */}
      {vaultName && creatingFile && (
        <form
          onSubmit={handleCreateSubmit}
          className="border-b border-[var(--md-outline-variant)] p-2"
        >
          <input
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder="notes/todo.md"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setCreatingFile(false);
                setNewFileName('');
              }
            }}
            className="w-full rounded border border-[var(--md-outline)] bg-[var(--md-surface)] px-2 py-1 text-xs text-[var(--md-on-surface)] focus:border-[var(--md-primary)] focus:outline-none"
          />
          <div className="mt-1.5 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setCreatingFile(false);
                setNewFileName('');
              }}
              className="rounded px-2 py-0.5 text-[11px] text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-variant)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-[var(--md-primary)] px-2 py-0.5 text-[11px] font-medium text-[var(--md-on-primary)]"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {/* Filter Input */}
      {vaultName && vaultFlatFiles.length > 3 && (
        <div className="border-b border-[var(--md-outline-variant)] px-2 py-1.5">
          <input
            type="search"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter files..."
            aria-label="Filter files in folder"
            className="w-full rounded border border-[var(--md-outline-variant)] bg-[var(--md-surface)] px-2 py-1 text-xs text-[var(--md-on-surface)] focus:border-[var(--md-primary)] focus:outline-none"
          />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {!vaultName ? (
          <div className="flex flex-col gap-2.5 p-2 text-xs text-[var(--md-on-surface-variant)]">
            <p className="leading-relaxed">
              Open a local folder or <strong>Google Drive</strong> folder to browse notes, switch
              files with <kbd className="rounded border px-1 py-0.5 text-[10px]">Ctrl+P</kbd>, and
              render relative images.
            </p>
            <button
              type="button"
              onClick={onOpenVaultPicker}
              className="w-full rounded-lg bg-[var(--md-primary)] px-3 py-2 text-xs font-medium text-[var(--md-on-primary)] shadow-sm transition-opacity hover:opacity-95"
            >
              Open Folder Vault…
            </button>
            {savedVault && (
              <button
                type="button"
                onClick={onReconnectSavedVault}
                className="w-full truncate rounded-lg border border-[var(--md-outline-variant)] bg-[var(--md-surface)] px-3 py-1.5 text-left text-xs font-medium text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]/50"
                title={`Reopen ${savedVault.name}`}
              >
                ↻ Reopen "{savedVault.name}"
              </button>
            )}
          </div>
        ) : filteredFlatFiles ? (
          filteredFlatFiles.length === 0 ? (
            <div className="p-3 text-center text-xs text-[var(--md-on-surface-variant)]">
              No matching files
            </div>
          ) : (
            filteredFlatFiles.map((fileNode) => (
              <button
                key={fileNode.path}
                type="button"
                onClick={() => onSelectFile(fileNode)}
                className={`flex w-full flex-col rounded-md px-2.5 py-1.5 text-left text-xs ${
                  activeFilePath === fileNode.path
                    ? 'bg-[var(--md-primary-container)] font-semibold text-[var(--md-on-primary-container)]'
                    : 'text-[var(--md-on-surface)] hover:bg-[var(--md-surface-variant)]/50'
                }`}
              >
                <span className="truncate">{fileNode.name}</span>
                {fileNode.path !== fileNode.name && (
                  <span className="truncate text-[10px] opacity-70">{fileNode.path}</span>
                )}
              </button>
            ))
          )
        ) : vaultTree.length === 0 ? (
          <div className="p-3 text-center text-xs text-[var(--md-on-surface-variant)]">
            No Markdown or text files in this folder yet. Click <strong>+</strong> to create one.
          </div>
        ) : (
          vaultTree.map((node) => (
            <TreeNodeItem
              key={node.path}
              node={node}
              depth={0}
              activeFilePath={activeFilePath}
              expandedPaths={expandedPaths}
              onToggleDir={toggleDir}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </div>
    </aside>
  );
};
