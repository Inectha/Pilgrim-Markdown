import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';
import { buildStandaloneHtml } from './exportHtml';
import { SLASH_COMMANDS } from './commands';

describe('renderMarkdown security & parser pipeline', () => {
  it('neutralizes XSS payloads in raw HTML, links, and attributes', async () => {
    const malicious = [
      '# Hallo',
      '<script>window.xss = true;</script>',
      '<img src="x" onerror="alert(1)" />',
      '<a href="javascript:alert(1)">Klik hier</a>',
      '<a href="data:text/html,<script>alert(1)</script>">Data link</a>',
      '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=" />',
    ].join('\n\n');

    const res = await renderMarkdown(malicious);
    expect(res.html).not.toContain('<script');
    expect(res.html).not.toContain('onerror');
    expect(res.html).not.toContain('href="javascript:');
    expect(res.html).not.toContain('href="data:text/html');
    expect(res.html).not.toContain('<img');
  });

  it('escapes raw HTML inside fenced code blocks', async () => {
    const md = '```html\n<script>alert("xss")</script>\n```';
    const res = await renderMarkdown(md);
    expect(res.html).not.toContain('<script>alert');
    expect(res.html).toContain('&lt;');
    expect(res.html).toContain('script');
  });

  it('does not treat currency amounts or escaped dollars as math', async () => {
    const md = 'De prijs ligt tussen $5 en $10 (of \\$100 en $5/$10).';
    const res = await renderMarkdown(md);
    expect(res.hasMath).toBe(false);
    expect(res.html).toContain('$5 en $10');
    expect(res.html).toContain('$100');
  });

  it('renders inline and block LaTeX math with KaTeX safely', async () => {
    const md = 'Inline formule $a^2 + b^2 = c^2$ en blok:\n\n$$\n\\int_0^1 x^2 dx\n$$';
    const res = await renderMarkdown(md);
    expect(res.hasMath).toBe(true);
    expect(res.html).toContain('katex');
  });

  it('parses YAML frontmatter on line 0 into a metadata card', async () => {
    const md = '---\ntitle: Pilgrim Test\nauthor: Arjan\n---\n\n# Inhoud';
    const res = await renderMarkdown(md);
    expect(res.html).toContain('frontmatter-card');
    expect(res.html).toContain('Pilgrim Test');
    expect(res.toc).toHaveLength(1);
    expect(res.toc[0].text).toBe('Inhoud');
  });

  it('renders interactive task list checkboxes with data-task-line in preview mode', async () => {
    const md = '- [ ] Eerste taak\n- [x] Tweede taak';
    const res = await renderMarkdown(md, { mode: 'preview' });
    expect(res.html).toContain('data-task-line="0"');
    expect(res.html).toContain('data-task-line="1"');
    expect(res.html).toContain('checked');
  });

  it('rewrites external and relative images into blocked placeholders', async () => {
    const md = '![Extern](https://example.com/pic.png)\n\n![Lokaal](./diagram.png)';
    const res = await renderMarkdown(md);
    expect(res.html).not.toContain('<img');
    expect(res.blockedImages).toHaveLength(2);
    expect(res.html).toContain('blocked-img');
  });

  it('generates standalone HTML with MathML for offline portability', async () => {
    const md = '# Titel\n\nFormule: $E = mc^2$';
    const html = await buildStandaloneHtml(md, 'test.md');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<math');
  });

  it('highlights SQL fenced code blocks with Lezer tokens', async () => {
    const md = '```sql\nSELECT * FROM users WHERE id = 1;\n```';
    const res = await renderMarkdown(md);
    expect(res.html).toContain('language-sql');
    expect(res.html).toContain('tok-keyword');
    expect(res.html).toContain('SELECT');
  });
});

describe('SLASH_COMMANDS registry', () => {
  it('has unique ids and slash-prefixed triggers', () => {
    const ids = new Set(SLASH_COMMANDS.map((cmd) => cmd.id));
    expect(ids.size).toBe(SLASH_COMMANDS.length);
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.trigger.startsWith('/')).toBe(true);
      expect(cmd.insert.length).toBeGreaterThan(0);
    }
  });
});
