import { renderMarkdown } from './markdown';

const STANDALONE_CSS = `
  :root {
    color-scheme: light dark;
    --bg: #fffbfe;
    --fg: #1c1b1f;
    --muted: #49454f;
    --surface: #f4eff4;
    --border: #cac4d0;
    --accent: #6750a4;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1c1b1f;
      --fg: #e6e1e5;
      --muted: #cac4d0;
      --surface: #2b2930;
      --border: #49454f;
      --accent: #d0bcff;
    }
  }
  @media print {
    :root {
      --bg: #ffffff;
      --fg: #000000;
      --muted: #333333;
      --surface: #f5f5f5;
      --border: #cccccc;
    }
  }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.65;
    max-width: 820px;
    margin: 2rem auto;
    padding: 0 1.25rem;
    background: var(--bg);
    color: var(--fg);
  }
  h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin-top: 1.6em; margin-bottom: 0.6em; }
  h1 { font-size: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; }
  h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.25rem; }
  a { color: var(--accent); }
  pre, code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.9em;
  }
  code { background: var(--surface); padding: 0.15em 0.35em; border-radius: 4px; }
  pre {
    background: var(--surface);
    padding: 1rem;
    border-radius: 8px;
    overflow-x: auto;
    border: 1px solid var(--border);
    break-inside: avoid;
  }
  pre code { background: none; padding: 0; }
  blockquote {
    margin: 1rem 0;
    padding: 0.5rem 1rem;
    border-left: 4px solid var(--accent);
    background: var(--surface);
    color: var(--muted);
    break-inside: avoid;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    break-inside: avoid;
  }
  th, td {
    border: 1px solid var(--border);
    padding: 0.5rem 0.75rem;
    text-align: left;
  }
  th { background: var(--surface); }
  li.task-list-item { list-style: none; margin-left: -1.25rem; }
  .frontmatter-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 1.5rem;
    font-size: 0.875rem;
  }
  .frontmatter-badge {
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 0.4rem;
  }
  .frontmatter-row { display: flex; gap: 0.5rem; margin: 0.15rem 0; }
  .frontmatter-key { font-weight: 600; color: var(--muted); }
  .frontmatter-val { margin: 0; }
  .math-block { margin: 1rem 0; overflow-x: auto; text-align: center; }
  /* Lezer syntax highlighting classes */
  .tok-keyword { color: #b152c9; font-weight: 600; }
  .tok-string, .tok-string2 { color: #2e7d32; }
  .tok-number, .tok-bool, .tok-atom { color: #d84315; }
  .tok-comment { color: var(--muted); font-style: italic; }
  .tok-variableName, .tok-propertyName { color: #1565c0; }
  .tok-typeName, .tok-className { color: #00838f; }
`;

function escapeTitle(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function buildStandaloneHtml(markdown: string, title: string): Promise<string> {
  const { html } = await renderMarkdown(markdown, { mode: 'export' });
  const cleanTitle = escapeTitle(title.replace(/\.(md|markdown|txt)$/i, '') || 'Document');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${cleanTitle}</title>
  <style>${STANDALONE_CSS}</style>
</head>
<body>
${html}
</body>
</html>`;
}

export async function downloadStandaloneHtml(markdown: string, title: string): Promise<void> {
  const htmlDoc = await buildStandaloneHtml(markdown, title);
  const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/\.(md|markdown|txt)$/i, '') || 'document'}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyForGoogleDocs(markdown: string): Promise<'rich' | 'plain'> {
  const { html } = await renderMarkdown(markdown, { mode: 'clipboard' });
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([markdown], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        }),
      ]);
      return 'rich';
    } catch {
      // Fallback to writeText below
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(markdown);
  }
  return 'plain';
}
