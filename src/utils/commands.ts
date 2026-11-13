export interface SlashCommandDef {
  id: string;
  trigger: string;
  label: string;
  syntax: string;
  description: string;
  insert: string;
  cursorBackOffset?: number;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  {
    id: 'h1',
    trigger: '/h1',
    label: 'Heading 1',
    syntax: '# Title',
    description: 'Large top-level document heading',
    insert: '# ',
  },
  {
    id: 'h2',
    trigger: '/h2',
    label: 'Heading 2',
    syntax: '## Section',
    description: 'Medium section heading (appears in Outline)',
    insert: '## ',
  },
  {
    id: 'h3',
    trigger: '/h3',
    label: 'Heading 3',
    syntax: '### Subsection',
    description: 'Smaller subsection heading',
    insert: '### ',
  },
  {
    id: 'bold',
    trigger: '/bold',
    label: 'Bold Text',
    syntax: '**bold**',
    description: 'Emphasize text in bold',
    insert: '**bold**',
    cursorBackOffset: 2,
  },
  {
    id: 'italic',
    trigger: '/italic',
    label: 'Italic Text',
    syntax: '*italic*',
    description: 'Emphasize text in italics',
    insert: '*italic*',
    cursorBackOffset: 1,
  },
  {
    id: 'strike',
    trigger: '/strike',
    label: 'Strikethrough',
    syntax: '~~text~~',
    description: 'Cross out text',
    insert: '~~text~~',
    cursorBackOffset: 2,
  },
  {
    id: 'task',
    trigger: '/task',
    label: 'Task / Checklist',
    syntax: '- [ ] Task',
    description: 'Interactive checkbox item (clickable in Preview)',
    insert: '- [ ] ',
  },
  {
    id: 'list',
    trigger: '/list',
    label: 'Bullet List',
    syntax: '- Item',
    description: 'Unordered bullet list item',
    insert: '- ',
  },
  {
    id: 'numbered',
    trigger: '/numbered',
    label: 'Numbered List',
    syntax: '1. Item',
    description: 'Ordered numbered list item',
    insert: '1. ',
  },
  {
    id: 'link',
    trigger: '/link',
    label: 'Link',
    syntax: '[text](url)',
    description: 'Insert a hyperlink',
    insert: '[link text](https://)',
    cursorBackOffset: 1,
  },
  {
    id: 'code',
    trigger: '/code',
    label: 'Inline Code',
    syntax: '`code`',
    description: 'Format a short inline code snippet',
    insert: '`code`',
    cursorBackOffset: 1,
  },
  {
    id: 'codeblock',
    trigger: '/codeblock',
    label: 'Code Block',
    syntax: '```lang ... ```',
    description: 'Fenced code block with syntax highlighting',
    insert: '```typescript\n\n```',
    cursorBackOffset: 4,
  },
  {
    id: 'table',
    trigger: '/table',
    label: 'Table (3x3)',
    syntax: '| Col | Col |',
    description: 'Insert a GitHub Flavored Markdown table',
    insert:
      '| Column 1 | Column 2 | Column 3 |\n| :--- | :--- | :--- |\n| Value 1 | Value 2 | Value 3 |\n',
  },
  {
    id: 'quote',
    trigger: '/quote',
    label: 'Blockquote',
    syntax: '> Quote',
    description: 'Indented quote or callout block',
    insert: '> ',
  },
  {
    id: 'math',
    trigger: '/math',
    label: 'Math Block (LaTeX)',
    syntax: '$$ ... $$',
    description: 'Display math equation rendered with KaTeX',
    insert: '$$\n\n$$',
    cursorBackOffset: 3,
  },
  {
    id: 'frontmatter',
    trigger: '/frontmatter',
    label: 'YAML Frontmatter',
    syntax: '--- ... ---',
    description: 'Document metadata card (use at line 1)',
    insert: '---\ntitle: Document Title\nauthor: Your Name\n---\n\n',
  },
  {
    id: 'hr',
    trigger: '/hr',
    label: 'Divider Line',
    syntax: '---',
    description: 'Horizontal thematic break',
    insert: '\n---\n',
  },
];

export type HelpCategory = 'markdown' | 'shortcuts' | 'features';

export interface HelpTopic {
  id: string;
  category: HelpCategory;
  title: string;
  keywords: string[];
  summary: string;
  example?: string;
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'help-headings',
    category: 'markdown',
    title: 'Headings (H1 – H3)',
    keywords: ['heading', 'title', 'h1', 'h2', 'h3', 'outline', 'toc'],
    summary: 'Start a line with 1 to 3 # symbols followed by a space. H1–H3 headings automatically populate the Outline menu.',
    example: '# Main Title\n## Section\n### Subsection',
  },
  {
    id: 'help-emphasis',
    category: 'markdown',
    title: 'Bold, Italic & Strikethrough',
    keywords: ['bold', 'italic', 'strikethrough', 'format', 'emphasis'],
    summary: 'Wrap text with ** for bold, * for italic, or ~~ for strikethrough.',
    example: '**Bold text**, *italic text*, and ~~crossed out~~',
  },
  {
    id: 'help-lists',
    category: 'markdown',
    title: 'Lists & Interactive Task Lists',
    keywords: ['list', 'bullet', 'numbered', 'task', 'checkbox', 'todo'],
    summary: 'Use - or 1. for lists. Use - [ ] or - [x] for checklists—you can click checkboxes directly in the Live Preview!',
    example: '- [x] Completed task\n- [ ] Pending task',
  },
  {
    id: 'help-links',
    category: 'markdown',
    title: 'Links & Smart Link Paste',
    keywords: ['link', 'url', 'paste', 'hyperlink'],
    summary: 'Wrap link text in [ ] followed by (url). Tip: select any word in the editor and paste a URL (Ctrl+V) to wrap it automatically.',
    example: '[Pilgrim Markdown](https://github.com)',
  },
  {
    id: 'help-code',
    category: 'markdown',
    title: 'Inline Code & Fenced Code Blocks',
    keywords: ['code', 'syntax', 'highlight', 'javascript', 'typescript', 'python', 'html', 'css', 'json', 'sql', 'yaml'],
    summary: 'Use single backticks `code` inline, or triple backticks ```lang for syntax-highlighted blocks with a one-click Copy button.',
    example: '```python\ndef hello():\n    print("Hello!")\n```',
  },
  {
    id: 'help-tables',
    category: 'markdown',
    title: 'Tables',
    keywords: ['table', 'grid', 'columns', 'gfm'],
    summary: 'Separate columns with | and define alignment with :--- (left), :---: (center), or ---: (right).',
    example: '| Feature | Status |\n| :--- | :---: |\n| Offline | Ready |',
  },
  {
    id: 'help-math',
    category: 'markdown',
    title: 'LaTeX Math Equations',
    keywords: ['math', 'latex', 'katex', 'formula', 'equation', 'mathml'],
    summary: 'Use $...$ for inline math and $$...$$ for centered block equations. Regular currency like $5 and $10 is safely ignored.',
    example: 'Inline: $E = mc^2$\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$',
  },
  {
    id: 'help-frontmatter',
    category: 'markdown',
    title: 'YAML Frontmatter',
    keywords: ['yaml', 'frontmatter', 'metadata', 'header'],
    summary: 'Start line 1 with --- and end with --- to display structured metadata as a clean card at the top of the preview.',
    example: '---\ntitle: Meeting Notes\ndate: 2026-11-13\n---',
  },
  {
    id: 'help-slash',
    category: 'shortcuts',
    title: 'Slash Commands (/) Autocomplete',
    keywords: ['slash', '/', 'autocomplete', 'command', 'snippet', 'insert'],
    summary: 'Type / at the start of a line or after a space in the editor to open instant autocompletion for headings, tables, tasks, math, and code blocks.',
  },
  {
    id: 'help-palette',
    category: 'shortcuts',
    title: 'Command Palette (Ctrl+/ or Ctrl+Shift+P)',
    keywords: ['command', 'palette', 'quick', 'search', 'actions'],
    summary: 'Press Ctrl+/ (or Ctrl+Shift+P) anywhere to search and run any Markdown snippet or app action using only your keyboard.',
  },
  {
    id: 'help-keys',
    category: 'shortcuts',
    title: 'Essential Keyboard Shortcuts',
    keywords: ['keyboard', 'shortcut', 'ctrl', 'save', 'open', 'find', 'bold', 'italic', 'f1'],
    summary:
      'Ctrl+S: Save • Ctrl+Shift+S: Save As • Ctrl+O: Open • Ctrl+B: Bold • Ctrl+I: Italic • Ctrl+K: Link • Ctrl+F: Find/Replace • F1: Help',
  },
  {
    id: 'help-chromeos',
    category: 'features',
    title: 'ChromeOS Files App & Google Drive',
    keywords: ['chromeos', 'chromebook', 'files', 'drive', 'drag', 'drop', 'multi-window'],
    summary: 'Install Pilgrim Markdown as a PWA to open .md/.markdown/.txt files directly from the ChromeOS Files app (local or Google Drive) or by dragging files onto the window.',
  },
  {
    id: 'help-offline',
    category: 'features',
    title: '100% Offline & Multi-Window Crash Recovery',
    keywords: ['offline', 'pwa', 'draft', 'recovery', 'indexeddb', 'crash', 'autosave'],
    summary: 'Works completely offline. Unsaved edits are debounced to a window-isolated IndexedDB draft cache every 500ms and checked against external file changes before overwriting.',
  },
  {
    id: 'help-export',
    category: 'features',
    title: 'Google Docs Copy, Standalone HTML & PDF',
    keywords: ['export', 'google docs', 'gmail', 'html', 'pdf', 'print', 'clipboard'],
    summary: 'Use Export ▾ to copy formatted rich text directly into Google Docs/Gmail, download a self-contained offline .html file (with MathML), or print to PDF.',
  },
  {
    id: 'help-privacy',
    category: 'features',
    title: 'Privacy-First Image & Security Policy',
    keywords: ['privacy', 'security', 'xss', 'csp', 'images', 'blocked'],
    summary: 'All rendering happens locally and is sanitized with DOMPurify. Remote https:// images are blocked by default to prevent tracking pixels in untrusted Markdown files.',
  },
];
