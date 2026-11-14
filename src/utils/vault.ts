export interface VaultFileNode {
  kind: 'file';
  name: string;
  path: string;
  handle: FileSystemFileHandle;
}

export interface VaultDirNode {
  kind: 'directory';
  name: string;
  path: string;
  handle: FileSystemDirectoryHandle;
  children: VaultNode[];
}

export type VaultNode = VaultFileNode | VaultDirNode;

export interface VaultScanResult {
  tree: VaultNode[];
  flatFiles: VaultFileNode[];
  truncated: boolean;
}

const SKIP_ENTRIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.vscode',
  '.idea',
  '.DS_Store',
  'Thumbs.db',
]);

const MARKDOWN_EXT_RE = /\.(md|markdown|txt)$/i;
const RASTER_IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp)$/i;
const EXTERNAL_OR_URI_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export function isMarkdownOrTextFile(name: string): boolean {
  return MARKDOWN_EXT_RE.test(name);
}

export function isSafeRasterImageName(name: string): boolean {
  return RASTER_IMAGE_EXT_RE.test(name);
}

export function shouldSkipVaultEntry(name: string): boolean {
  if (!name) return true;
  if (SKIP_ENTRIES.has(name)) return true;
  // Skip hidden dotfiles/dotfolders (except .markdown if ever used)
  if (name.startsWith('.') && name !== '.markdown') return true;
  return false;
}

export async function scanVaultDirectory(
  root: FileSystemDirectoryHandle,
  maxEntries: number = 2000
): Promise<VaultScanResult> {
  const flatFiles: VaultFileNode[] = [];
  let count = 0;
  let truncated = false;

  async function walk(
    dir: FileSystemDirectoryHandle,
    prefix: string
  ): Promise<VaultNode[]> {
    const dirs: VaultDirNode[] = [];
    const files: VaultFileNode[] = [];

    for await (const [name, entry] of dir.entries()) {
      if (count >= maxEntries) {
        truncated = true;
        break;
      }
      if (shouldSkipVaultEntry(name)) continue;

      const entryPath = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'directory') {
        count++;
        const children = await walk(entry, entryPath);
        dirs.push({
          kind: 'directory',
          name,
          path: entryPath,
          handle: entry,
          children,
        });
      } else if (entry.kind === 'file' && isMarkdownOrTextFile(name)) {
        count++;
        const fileNode: VaultFileNode = {
          kind: 'file',
          name,
          path: entryPath,
          handle: entry,
        };
        files.push(fileNode);
        flatFiles.push(fileNode);
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return [...dirs, ...files];
  }

  const tree = await walk(root, '');
  flatFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));

  return { tree, flatFiles, truncated };
}

/**
 * Resolves a relative image/file src against an optional base file path inside the vault.
 * Returns null for external URLs, protocol-relative URLs, or paths escaping the vault root.
 */
export function resolveRelativePath(
  baseFilePath: string | undefined,
  relSrc: string
): string | null {
  const trimmed = relSrc.trim();
  if (!trimmed || EXTERNAL_OR_URI_RE.test(trimmed)) {
    return null;
  }

  // Strip query string or hash fragment if present
  const cleanSrc = trimmed.split(/[?#]/)[0];
  if (!cleanSrc) return null;

  const isRootRelative = cleanSrc.startsWith('/');
  const baseSegments =
    !isRootRelative && baseFilePath
      ? baseFilePath.split('/').slice(0, -1).filter(Boolean)
      : [];

  const relSegments = cleanSrc.replace(/^\/+/, '').split('/');
  const stack = [...baseSegments];

  for (const seg of relSegments) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (stack.length === 0) {
        // Escapes vault root
        return null;
      }
      stack.pop();
    } else {
      stack.push(seg);
    }
  }

  if (stack.length === 0) return null;
  return stack.join('/');
}

/**
 * Reads a raster image from the open vault DirectoryHandle and returns a blob: URL.
 * Caller is responsible for revoking the returned URL via URL.revokeObjectURL().
 */
export async function resolveVaultImageBlobUrl(
  root: FileSystemDirectoryHandle,
  resolvedPath: string
): Promise<string | null> {
  const segments = resolvedPath.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const fileName = segments[segments.length - 1];
  if (!isSafeRasterImageName(fileName)) {
    return null;
  }

  try {
    let currentDir = root;
    for (let i = 0; i < segments.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(segments[i]);
    }
    const fileHandle = await currentDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}
