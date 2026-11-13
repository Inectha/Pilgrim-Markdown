import MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import DOMPurify from 'dompurify';
import { highlightCodeWithLezer, ensureParserLoaded } from './languages';

export interface TocItem {
  level: 1 | 2 | 3;
  text: string;
  line: number;
  id: string;
}

export interface BlockedImageItem {
  src: string;
  alt: string;
}

export interface RenderMarkdownOptions {
  mode?: 'preview' | 'export' | 'clipboard';
}

export interface RenderMarkdownResult {
  html: string;
  toc: TocItem[];
  blockedImages: BlockedImageItem[];
  hasMath: boolean;
}

interface MathEntry {
  expr: string;
  display: boolean;
}

interface RenderEnv {
  mode: 'preview' | 'export' | 'clipboard';
  mathMap: Map<string, MathEntry>;
  toc: TocItem[];
  blockedImages: BlockedImageItem[];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `m-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function slugify(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 48);
  return base ? `heading-${base}-${index}` : `heading-${index}`;
}

const SAFE_IMAGE_SRC_RE =
  /^(?:data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-zA-Z0-9+/=\s]+|blob:[^\s]+)$/i;

let katexCssLoaded = false;

async function loadKatex(mode: 'preview' | 'export' | 'clipboard') {
  if (mode === 'preview' && !katexCssLoaded && typeof document !== 'undefined') {
    katexCssLoaded = true;
    try {
      await import('katex/dist/katex.min.css');
    } catch {
      // Ignore in test environments without CSS loader
    }
  }
  const katexModule = await import('katex');
  return katexModule.default ?? katexModule;
}

function frontmatterRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  if (startLine !== 0) return false;
  const startPos = state.bMarks[0] + state.tShift[0];
  const maxPos = state.eMarks[0];
  const firstLine = state.src.slice(startPos, maxPos).trim();
  if (firstLine !== '---') return false;

  let nextLine = 1;
  let foundClosing = false;
  while (nextLine < endLine) {
    const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
    const lineEnd = state.eMarks[nextLine];
    const lineText = state.src.slice(lineStart, lineEnd).trim();
    if (lineText === '---' || lineText === '...') {
      foundClosing = true;
      break;
    }
    nextLine++;
  }

  if (!foundClosing) return false;
  if (silent) return true;

  const token = state.push('frontmatter', 'aside', 0);
  token.map = [0, nextLine + 1];
  token.content = state.getLines(1, nextLine, 0, false);
  state.line = nextLine + 1;
  return true;
}

function mathBlockRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  const maxPos = state.eMarks[startLine];
  if (startPos + 2 > maxPos) return false;
  if (state.src.slice(startPos, startPos + 2) !== '$$') return false;

  const restOfFirstLine = state.src.slice(startPos + 2, maxPos).trim();
  let nextLine = startLine;
  let expr = '';

  if (restOfFirstLine.endsWith('$$') && restOfFirstLine.length >= 2) {
    if (silent) return true;
    expr = restOfFirstLine.slice(0, -2).trim();
  } else {
    let found = false;
    nextLine = startLine + 1;
    while (nextLine < endLine) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      const lineText = state.src.slice(lineStart, lineEnd);
      if (lineText.trim().endsWith('$$')) {
        found = true;
        break;
      }
      nextLine++;
    }
    if (!found) return false;
    if (silent) return true;

    const lines: string[] = [];
    if (restOfFirstLine) lines.push(restOfFirstLine);
    for (let l = startLine + 1; l <= nextLine; l++) {
      const lStart = state.bMarks[l] + state.tShift[l];
      const lEnd = state.eMarks[l];
      const text = state.src.slice(lStart, lEnd);
      if (l === nextLine) {
        const trimmed = text.trim();
        const withoutClosing = trimmed.slice(0, -2).trim();
        if (withoutClosing) lines.push(withoutClosing);
      } else {
        lines.push(text);
      }
    }
    expr = lines.join('\n').trim();
  }

  const token = state.push('math_block', 'div', 0);
  token.block = true;
  token.content = expr;
  token.map = [startLine, nextLine + 1];
  state.line = nextLine + 1;
  return true;
}

function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false;

  // Reject $$ in inline rule (handled by block rule or inline $$...$$)
  if (start + 1 < max && state.src.charCodeAt(start + 1) === 0x24) {
    return false;
  }

  // Opening $ must not be followed immediately by whitespace
  const firstChar = state.src.charCodeAt(start + 1);
  if (
    start + 1 >= max ||
    firstChar === 0x20 /* space */ ||
    firstChar === 0x09 /* tab */ ||
    firstChar === 0x0a /* \n */
  ) {
    return false;
  }

  let match = start + 1;
  while (match < max) {
    const ch = state.src.charCodeAt(match);
    if (ch === 0x5c /* \ */) {
      match += 2;
      continue;
    }
    if (ch === 0x24 /* $ */) {
      break;
    }
    match++;
  }

  if (match >= max) return false;

  // Closing $ must not be preceded by whitespace
  const prevChar = state.src.charCodeAt(match - 1);
  if (prevChar === 0x20 || prevChar === 0x09 || prevChar === 0x0a) {
    return false;
  }

  // Closing $ must not be followed immediately by an ASCII digit (e.g. "$5/$10")
  if (match + 1 < max) {
    const nextChar = state.src.charCodeAt(match + 1);
    if (nextChar >= 0x30 && nextChar <= 0x39) {
      return false;
    }
  }

  const expr = state.src.slice(start + 1, match);
  if (!expr) return false;

  if (!silent) {
    const token = state.push('math_inline', 'span', 0);
    token.content = expr;
  }

  state.pos = match + 1;
  return true;
}

function taskListAndTocCoreRule(state: StateCore): void {
  const tokens = state.tokens;
  const env = state.env as RenderEnv;
  let headingCounter = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Add data-source-line to block tokens that have a line map
    if (token.map && token.nesting >= 0 && env.mode === 'preview') {
      token.attrSet('data-source-line', String(token.map[0]));
    }

    // Extract H1-H3 headings for TOC
    if (token.type === 'heading_open' && (token.tag === 'h1' || token.tag === 'h2' || token.tag === 'h3')) {
      const inlineToken = tokens[i + 1];
      if (inlineToken && inlineToken.type === 'inline') {
        const text = inlineToken.content.trim();
        const level = Number(token.tag.slice(1)) as 1 | 2 | 3;
        const line = token.map ? token.map[0] : 0;
        const id = slugify(text, headingCounter++);
        token.attrSet('id', id);
        env.toc.push({ level, text, line, id });
      }
    }

    // Transform GFM task lists: list_item_open -> paragraph_open -> inline
    if (
      token.type === 'inline' &&
      i >= 2 &&
      tokens[i - 1].type === 'paragraph_open' &&
      tokens[i - 2].type === 'list_item_open'
    ) {
      const match = token.content.match(/^\[([ xX])\]\s+/);
      if (match && token.children && token.children.length > 0) {
        const isChecked = match[1].toLowerCase() === 'x';
        const listItemToken = tokens[i - 2];
        const line = listItemToken.map ? listItemToken.map[0] : 0;

        const existingClass = listItemToken.attrGet('class') || '';
        listItemToken.attrSet(
          'class',
          existingClass ? `${existingClass} task-list-item` : 'task-list-item'
        );

        // Strip "[ ] " from first child text token
        for (const child of token.children) {
          if (child.type === 'text' && child.content.match(/^\[([ xX])\]\s+/)) {
            child.content = child.content.replace(/^\[([ xX])\]\s+/, '');
            break;
          }
        }
        token.content = token.content.replace(/^\[([ xX])\]\s+/, '');

        const checkboxToken = new state.Token('html_inline', '', 0);
        if (env.mode === 'preview') {
          checkboxToken.content = `<input type="checkbox" class="task-checkbox" data-task-line="${line}"${
            isChecked ? ' checked' : ''
          } /> `;
        } else {
          checkboxToken.content = `<input type="checkbox" class="task-checkbox" disabled${
            isChecked ? ' checked' : ''
          } /> `;
        }
        token.children.unshift(checkboxToken);
      }
    }
  }
}

function createMarkdownItInstance(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
  });

  md.block.ruler.before('hr', 'frontmatter', frontmatterRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.block.ruler.before('fence', 'math_block', mathBlockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.inline.ruler.after('escape', 'math_inline', mathInlineRule);
  md.core.ruler.after('inline', 'task_lists_and_toc', taskListAndTocCoreRule);

  md.renderer.rules.frontmatter = (tokens: Token[], idx: number, _options, env: RenderEnv) => {
    const raw = tokens[idx].content;
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const itemsHtml = lines
      .map((line) => {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) {
          return `<div class="frontmatter-row"><span class="frontmatter-val">${escapeHtml(line.trim())}</span></div>`;
        }
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        return `<div class="frontmatter-row"><dt class="frontmatter-key">${escapeHtml(key)}</dt><dd class="frontmatter-val">${escapeHtml(val)}</dd></div>`;
      })
      .join('');
    const lineAttr = env.mode === 'preview' ? ' data-source-line="0"' : '';
    return `<aside class="frontmatter-card"${lineAttr}><div class="frontmatter-badge">Frontmatter</div><dl class="frontmatter-list">${itemsHtml}</dl></aside>\n`;
  };

  md.renderer.rules.math_block = (tokens: Token[], idx: number, _options, env: RenderEnv) => {
    const token = tokens[idx];
    const id = createUuid();
    env.mathMap.set(id, { expr: token.content, display: true });
    const lineAttr =
      env.mode === 'preview' && token.map ? ` data-source-line="${token.map[0]}"` : '';
    return `<div class="math-block" data-math-id="${id}"${lineAttr}></div>\n`;
  };

  md.renderer.rules.math_inline = (tokens: Token[], idx: number, _options, env: RenderEnv) => {
    const token = tokens[idx];
    const id = createUuid();
    env.mathMap.set(id, { expr: token.content, display: false });
    return `<span class="math-inline" data-math-id="${id}"></span>`;
  };

  md.renderer.rules.fence = (tokens: Token[], idx: number, _options, env: RenderEnv) => {
    const token = tokens[idx];
    const info = token.info ? token.info.trim() : '';
    const langName = info.split(/\s+/)[0] || '';
    const highlighted = highlightCodeWithLezer(token.content, langName);
    const escapedLang = escapeHtml(langName);
    const lineAttr =
      env.mode === 'preview' && token.map ? ` data-source-line="${token.map[0]}"` : '';

    if (env.mode === 'preview') {
      return (
        `<div class="code-block-wrapper"${lineAttr}>` +
        `<div class="code-block-header">` +
        `<span class="code-lang">${escapedLang || 'code'}</span>` +
        `<button type="button" class="copy-code-btn" aria-label="Copy code">Copy</button>` +
        `</div>` +
        `<pre><code class="language-${escapedLang || 'plaintext'}">${highlighted}</code></pre>` +
        `</div>\n`
      );
    }

    return `<pre><code class="language-${escapedLang || 'plaintext'}">${highlighted}</code></pre>\n`;
  };

  md.renderer.rules.image = (tokens: Token[], idx: number, _options, env: RenderEnv) => {
    const token = tokens[idx];
    const src = (token.attrGet('src') || '').trim();
    const alt = token.content || token.attrGet('alt') || '';
    const title = token.attrGet('title') || '';

    if (SAFE_IMAGE_SRC_RE.test(src)) {
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${titleAttr} />`;
    }

    env.blockedImages.push({ src, alt });
    const label = alt ? `${alt} (${src})` : src || 'unknown path';
    return `<span class="blocked-img" data-blocked-src="${escapeHtml(src)}" title="Image blocked by offline/privacy policy">🔒 Image not loaded: ${escapeHtml(label)}</span>`;
  };

  return md;
}

const mdInstance = createMarkdownItInstance();

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'del',
  's',
  'ins',
  'mark',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
  'img',
  'span',
  'div',
  'aside',
  'dl',
  'dt',
  'dd',
  'sup',
  'sub',
  'kbd',
  'details',
  'summary',
  'input',
  'button',
];

const ALLOWED_ATTR = [
  'class',
  'id',
  'href',
  'src',
  'alt',
  'title',
  'type',
  'checked',
  'disabled',
  'aria-label',
  'data-source-line',
  'data-math-id',
  'data-task-line',
  'data-blocked-src',
  'align',
  'colspan',
  'rowspan',
];

function sanitizeAndPrepareTemplate(rawHtml: string, env: RenderEnv): HTMLTemplateElement {
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });

  const template = document.createElement('template');
  template.innerHTML = cleanHtml;

  // Enforce safe attributes on raw HTML tags that may have been written directly in Markdown
  const imgs = template.content.querySelectorAll('img');
  imgs.forEach((img) => {
    const src = (img.getAttribute('src') || '').trim();
    const alt = img.getAttribute('alt') || '';
    if (!SAFE_IMAGE_SRC_RE.test(src)) {
      env.blockedImages.push({ src, alt });
      const placeholder = document.createElement('span');
      placeholder.className = 'blocked-img';
      placeholder.setAttribute('data-blocked-src', src);
      placeholder.textContent = `🔒 Image not loaded: ${alt || src}`;
      img.replaceWith(placeholder);
    }
  });

  const inputs = template.content.querySelectorAll('input');
  inputs.forEach((input) => {
    if (input.getAttribute('type') !== 'checkbox') {
      input.remove();
    }
  });

  const links = template.content.querySelectorAll('a');
  links.forEach((a) => {
    const href = (a.getAttribute('href') || '').trim();
    if (
      href &&
      !/^(?:https?:\/\/|mailto:|#)/i.test(href)
    ) {
      a.removeAttribute('href');
    } else if (href) {
      a.setAttribute('rel', 'noopener noreferrer');
      if (!href.startsWith('#')) {
        a.setAttribute('target', '_blank');
      }
    }
  });

  return template;
}

export async function renderMarkdown(
  markdown: string,
  options: RenderMarkdownOptions = {}
): Promise<RenderMarkdownResult> {
  const mode = options.mode ?? 'preview';

  // Preload any fenced code block languages found in the document
  const fenceMatches = markdown.matchAll(/^[ \t]*```([a-zA-Z0-9_-]+)/gm);
  const langPromises: Promise<unknown>[] = [];
  for (const m of fenceMatches) {
    if (m[1]) {
      langPromises.push(ensureParserLoaded(m[1]));
    }
  }
  if (langPromises.length > 0) {
    await Promise.all(langPromises);
  }

  const env: RenderEnv = {
    mode,
    mathMap: new Map(),
    toc: [],
    blockedImages: [],
  };

  const rawHtml = mdInstance.render(markdown, env);
  const template = sanitizeAndPrepareTemplate(rawHtml, env);

  if (env.mathMap.size > 0) {
    const katex = await loadKatex(mode);
    const mathNodes = template.content.querySelectorAll('[data-math-id]');
    mathNodes.forEach((node) => {
      const id = node.getAttribute('data-math-id');
      if (!id) return;
      const entry = env.mathMap.get(id);
      if (!entry) return;

      const rendered = katex.renderToString(entry.expr, {
        displayMode: entry.display,
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        output: mode === 'preview' ? 'htmlAndMathml' : 'mathml',
      });
      node.innerHTML = rendered;
      if (mode !== 'preview') {
        node.removeAttribute('data-math-id');
      }
    });
  }

  return {
    html: template.innerHTML,
    toc: env.toc,
    blockedImages: env.blockedImages,
    hasMath: env.mathMap.size > 0,
  };
}
