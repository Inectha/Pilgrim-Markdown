import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { renderMarkdown, TocItem, BlockedImageItem } from '../utils/markdown';
import { resolveRelativePath, resolveVaultImageBlobUrl } from '../utils/vault';

export interface PreviewHandle {
  scrollToSourceLine: (zeroBasedLine: number) => void;
}

interface PreviewProps {
  markdown: string;
  syncScroll: boolean;
  topVisibleLine: number;
  vaultHandle?: FileSystemDirectoryHandle | null;
  activeFilePath?: string;
  onTocUpdate: (toc: TocItem[]) => void;
  onToggleTaskLine: (zeroBasedLine: number) => void;
}

export const Preview = forwardRef<PreviewHandle, PreviewProps>(
  (
    {
      markdown,
      syncScroll,
      topVisibleLine,
      vaultHandle,
      activeFilePath,
      onTocUpdate,
      onToggleTaskLine,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [html, setHtml] = useState<string>('');
    const [blockedImages, setBlockedImages] = useState<BlockedImageItem[]>([]);
    const [hideImageNotice, setHideImageNotice] = useState<boolean>(false);

    const scrollToLineInternal = (zeroBasedLine: number, smooth: boolean) => {
      const container = containerRef.current;
      if (!container) return;

      if (zeroBasedLine <= 0) {
        container.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
        return;
      }

      const nodes = container.querySelectorAll<HTMLElement>('[data-source-line]');
      let bestNode: HTMLElement | null = null;
      let bestLine = -1;

      nodes.forEach((node) => {
        const lineAttr = Number(node.getAttribute('data-source-line'));
        if (!Number.isNaN(lineAttr) && lineAttr <= zeroBasedLine && lineAttr >= bestLine) {
          bestLine = lineAttr;
          bestNode = node;
        }
      });

      if (bestNode) {
        const target = bestNode as HTMLElement;
        const topOffset = target.offsetTop - container.offsetTop - 16;
        container.scrollTo({
          top: Math.max(0, topOffset),
          behavior: smooth ? 'smooth' : 'auto',
        });
      }
    };

    useImperativeHandle(ref, () => ({
      scrollToSourceLine: (zeroBasedLine: number) => {
        scrollToLineInternal(zeroBasedLine, true);
      },
    }));

    // Debounced Markdown -> sanitized HTML + lazy KaTeX render + Vault relative image resolution
    useEffect(() => {
      let cancelled = false;
      const createdBlobUrls: string[] = [];

      const timer = window.setTimeout(async () => {
        const res = await renderMarkdown(markdown, { mode: 'preview' });
        if (cancelled) return;

        let finalHtml = res.html;
        let remainingBlocked = res.blockedImages;

        if (vaultHandle && res.blockedImages.length > 0 && typeof document !== 'undefined') {
          const tpl = document.createElement('template');
          tpl.innerHTML = res.html;
          const placeholders = tpl.content.querySelectorAll<HTMLElement>(
            'span.blocked-img[data-blocked-src]'
          );
          const stillBlocked: BlockedImageItem[] = [];

          for (const span of Array.from(placeholders)) {
            const rawSrc = span.getAttribute('data-blocked-src') || '';
            const altText = (span.textContent || '').replace(/^🖼\s*/, '').trim();
            const relPath = resolveRelativePath(activeFilePath, rawSrc);
            let blobUrl: string | null = null;

            if (relPath) {
              blobUrl = await resolveVaultImageBlobUrl(vaultHandle, relPath);
            }

            if (cancelled) {
              if (blobUrl) URL.revokeObjectURL(blobUrl);
              return;
            }

            if (blobUrl) {
              createdBlobUrls.push(blobUrl);
              const img = document.createElement('img');
              img.src = blobUrl;
              img.alt = altText;
              img.loading = 'lazy';
              span.replaceWith(img);
            } else {
              stillBlocked.push({ src: rawSrc, alt: altText });
            }
          }

          finalHtml = tpl.innerHTML;
          remainingBlocked = stillBlocked;
        }

        setHtml(finalHtml);
        setBlockedImages(remainingBlocked);
        onTocUpdate(res.toc);
      }, 90);

      return () => {
        cancelled = true;
        window.clearTimeout(timer);
        for (const url of createdBlobUrls) {
          URL.revokeObjectURL(url);
        }
      };
    }, [markdown, vaultHandle, activeFilePath, onTocUpdate]);

    // Sync scroll with Editor top visible line
    useEffect(() => {
      if (!syncScroll) return;
      scrollToLineInternal(topVisibleLine, false);
    }, [topVisibleLine, syncScroll]);

    // Event delegation for interactive task checkboxes & code block copy buttons
    const handleContainerClick = async (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;

      if (target instanceof HTMLInputElement && target.classList.contains('task-checkbox')) {
        const lineAttr = target.getAttribute('data-task-line');
        if (lineAttr !== null) {
          const lineNum = Number(lineAttr);
          if (!Number.isNaN(lineNum)) {
            onToggleTaskLine(lineNum);
          }
        }
        return;
      }

      const copyBtn = target.closest<HTMLButtonElement>('.copy-code-btn');
      if (copyBtn) {
        const wrapper = copyBtn.closest('.code-block-wrapper');
        const codeEl = wrapper?.querySelector('pre code');
        const codeText = codeEl?.textContent ?? '';
        if (codeText && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(codeText);
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied ✓';
            window.setTimeout(() => {
              copyBtn.textContent = originalText || 'Copy';
            }, 1500);
          } catch {
            // Ignore clipboard permission errors
          }
        }
      }
    };

    return (
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        className="preview-pane h-full w-full overflow-y-auto px-6 py-5"
        aria-label="Live Markdown preview"
      >
        {blockedImages.length > 0 && !hideImageNotice && (
          <div className="no-print mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-900 dark:text-amber-200">
            <span>
              🔒 <strong>Privacy & Offline mode:</strong> {blockedImages.length} external or
              unresolved image(s) are not loaded. Open a Folder Vault to load relative local images.
            </span>
            <button
              type="button"
              onClick={() => setHideImageNotice(true)}
              className="rounded px-2 py-0.5 font-medium hover:bg-amber-500/20"
            >
              Dismiss
            </button>
          </div>
        )}

        <article
          className="markdown-body mx-auto max-w-3xl"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );
  }
);

Preview.displayName = 'Preview';
