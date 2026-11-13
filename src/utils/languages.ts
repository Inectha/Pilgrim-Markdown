import { LanguageDescription } from '@codemirror/language';
import { highlightTree, classHighlighter } from '@lezer/highlight';
import type { Parser } from '@lezer/common';

export const curatedCodeLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'javascript', 'mjs', 'cjs'],
    load: () => import('@codemirror/lang-javascript').then((m) => m.javascript()),
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts', 'typescript'],
    load: () =>
      import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true })),
  }),
  LanguageDescription.of({
    name: 'JSX',
    alias: ['jsx'],
    load: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true })),
  }),
  LanguageDescription.of({
    name: 'TSX',
    alias: ['tsx'],
    load: () =>
      import('@codemirror/lang-javascript').then((m) =>
        m.javascript({ jsx: true, typescript: true })
      ),
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['py', 'python'],
    load: () => import('@codemirror/lang-python').then((m) => m.python()),
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['html', 'htm', 'xml', 'svg'],
    load: () => import('@codemirror/lang-html').then((m) => m.html()),
  }),
  LanguageDescription.of({
    name: 'CSS',
    alias: ['css', 'scss'],
    load: () => import('@codemirror/lang-css').then((m) => m.css()),
  }),
  LanguageDescription.of({
    name: 'JSON',
    alias: ['json', 'jsonc'],
    load: () => import('@codemirror/lang-json').then((m) => m.json()),
  }),
  LanguageDescription.of({
    name: 'YAML',
    alias: ['yaml', 'yml'],
    load: () => import('@codemirror/lang-yaml').then((m) => m.yaml()),
  }),
  LanguageDescription.of({
    name: 'SQL',
    alias: ['sql'],
    load: () => import('@codemirror/lang-sql').then((m) => m.sql()),
  }),
];

const parserCache = new Map<string, Parser>();

export async function ensureParserLoaded(langRaw: string): Promise<Parser | null> {
  const lang = langRaw.trim().toLowerCase().split(/\s+/)[0] || '';
  if (!lang) return null;
  if (parserCache.has(lang)) return parserCache.get(lang)!;

  let parser: Parser | null = null;
  switch (lang) {
    case 'js':
    case 'javascript':
    case 'mjs':
    case 'cjs': {
      const m = await import('@codemirror/lang-javascript');
      parser = m.javascriptLanguage.parser;
      break;
    }
    case 'ts':
    case 'typescript': {
      const m = await import('@codemirror/lang-javascript');
      parser = m.typescriptLanguage.parser;
      break;
    }
    case 'jsx': {
      const m = await import('@codemirror/lang-javascript');
      parser = m.jsxLanguage.parser;
      break;
    }
    case 'tsx': {
      const m = await import('@codemirror/lang-javascript');
      parser = m.tsxLanguage.parser;
      break;
    }
    case 'py':
    case 'python': {
      const m = await import('@codemirror/lang-python');
      parser = m.pythonLanguage.parser;
      break;
    }
    case 'html':
    case 'htm':
    case 'xml':
    case 'svg': {
      const m = await import('@codemirror/lang-html');
      parser = m.htmlLanguage.parser;
      break;
    }
    case 'css':
    case 'scss': {
      const m = await import('@codemirror/lang-css');
      parser = m.cssLanguage.parser;
      break;
    }
    case 'json':
    case 'jsonc': {
      const m = await import('@codemirror/lang-json');
      parser = m.jsonLanguage.parser;
      break;
    }
    case 'yaml':
    case 'yml': {
      const m = await import('@codemirror/lang-yaml');
      parser = m.yamlLanguage.parser;
      break;
    }
    case 'sql': {
      const m = await import('@codemirror/lang-sql');
      parser = m.StandardSQL.language.parser;
      break;
    }
    default:
      return null;
  }

  if (parser) {
    parserCache.set(lang, parser);
  }
  return parser;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function highlightCodeWithLezer(code: string, langRaw: string): string {
  const lang = langRaw.trim().toLowerCase().split(/\s+/)[0] || '';
  const parser = parserCache.get(lang);
  if (!parser) {
    return escapeHtml(code);
  }

  try {
    const tree = parser.parse(code);
    let result = '';
    let pos = 0;

    highlightTree(tree, classHighlighter, (from, to, classes) => {
      if (from > pos) {
        result += escapeHtml(code.slice(pos, from));
      }
      result += `<span class="${escapeHtml(classes)}">${escapeHtml(code.slice(from, to))}</span>`;
      pos = to;
    });

    if (pos < code.length) {
      result += escapeHtml(code.slice(pos));
    }
    return result;
  } catch {
    return escapeHtml(code);
  }
}
