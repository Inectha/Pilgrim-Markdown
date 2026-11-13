import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { curatedCodeLanguages } from '../utils/languages';
import { SLASH_COMMANDS } from '../utils/commands';

export type FormattingAction =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bold'
  | 'italic'
  | 'inlineCode'
  | 'codeBlock'
  | 'link'
  | 'table'
  | 'taskList'
  | 'quote';

export interface EditorHandle {
  applyFormatting: (action: FormattingAction) => void;
  insertSnippet: (text: string, cursorBackOffset?: number) => void;
  toggleTaskAtLine: (zeroBasedLine: number) => void;
  scrollToLine: (zeroBasedLine: number) => void;
  focus: () => void;
}

interface EditorProps {
  value: string;
  onChange: (next: string) => void;
  onCursorChange: (pos: { line: number; col: number }) => void;
  onTopLineChange: (zeroBasedLine: number) => void;
}

const URL_PASTE_RE = /^https?:\/\/[^\s<>()]+$/i;

function slashCommandSource(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/(?:^|\s)\/[a-zA-Z0-9]*$/);
  if (!match) return null;

  const slashIdx = match.text.lastIndexOf('/');
  const from = match.from + slashIdx;

  return {
    from,
    options: SLASH_COMMANDS.map((cmd) => ({
      label: cmd.trigger,
      detail: cmd.syntax,
      info: `${cmd.label} — ${cmd.description}`,
      type: 'keyword',
      apply: (view, _completion, applyFrom, applyTo) => {
        const cursorPos = applyFrom + cmd.insert.length - (cmd.cursorBackOffset ?? 0);
        view.dispatch({
          changes: { from: applyFrom, to: applyTo, insert: cmd.insert },
          selection: { anchor: cursorPos },
        });
      },
    })),
    validFor: /^\/[a-zA-Z0-9]*$/,
  };
}

export const Editor = forwardRef<EditorHandle, EditorProps>(
  ({ value, onChange, onCursorChange, onTopLineChange }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const callbacksRef = useRef({ onChange, onCursorChange, onTopLineChange });
    callbacksRef.current = { onChange, onCursorChange, onTopLineChange };

    useImperativeHandle(ref, () => ({
      focus: () => {
        viewRef.current?.focus();
      },
      insertSnippet: (text: string, cursorBackOffset: number = 0) => {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        const nextCursor = from + text.length - cursorBackOffset;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: nextCursor },
          effects: EditorView.scrollIntoView(nextCursor, { y: 'center' }),
        });
        view.focus();
      },
      scrollToLine: (zeroBasedLine: number) => {
        const view = viewRef.current;
        if (!view) return;
        const lineNum = Math.max(1, Math.min(view.state.doc.lines, zeroBasedLine + 1));
        const lineInfo = view.state.doc.line(lineNum);
        view.dispatch({
          selection: { anchor: lineInfo.from },
          effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start', yMargin: 24 }),
        });
        view.focus();
      },
      toggleTaskAtLine: (zeroBasedLine: number) => {
        const view = viewRef.current;
        if (!view) return;
        const lineNum = zeroBasedLine + 1;
        if (lineNum < 1 || lineNum > view.state.doc.lines) return;
        const line = view.state.doc.line(lineNum);
        const match = line.text.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s+.*)$/);
        if (!match) return;
        const nextChar = match[2].toLowerCase() === 'x' ? ' ' : 'x';
        const replacement = `${match[1]}${nextChar}${match[3]}`;
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: replacement },
        });
      },
      applyFormatting: (action: FormattingAction) => {
        const view = viewRef.current;
        if (!view) return;
        const { state } = view;
        const range = state.selection.main;
        const selected = state.sliceDoc(range.from, range.to);

        const wrapSelection = (prefix: string, suffix: string, placeholder: string) => {
          const inner = selected || placeholder;
          const insert = `${prefix}${inner}${suffix}`;
          view.dispatch({
            changes: { from: range.from, to: range.to, insert },
            selection: {
              anchor: range.from + prefix.length,
              head: range.from + prefix.length + inner.length,
            },
          });
          view.focus();
        };

        const prefixLine = (prefix: string) => {
          const line = state.doc.lineAt(range.from);
          const cleanText = line.text.replace(/^(?:#{1,6}\s+|>\s+|-\s+\[[ xX]\]\s+)/, '');
          const insert = `${prefix}${cleanText}`;
          view.dispatch({
            changes: { from: line.from, to: line.to, insert },
            selection: { anchor: line.from + insert.length },
          });
          view.focus();
        };

        switch (action) {
          case 'h1':
            prefixLine('# ');
            break;
          case 'h2':
            prefixLine('## ');
            break;
          case 'h3':
            prefixLine('### ');
            break;
          case 'bold':
            wrapSelection('**', '**', 'bold');
            break;
          case 'italic':
            wrapSelection('*', '*', 'italic');
            break;
          case 'inlineCode':
            wrapSelection('`', '`', 'code');
            break;
          case 'codeBlock':
            wrapSelection('\n```javascript\n', '\n```\n', '// code here');
            break;
          case 'link':
            wrapSelection('[', '](https://)', selected || 'link text');
            break;
          case 'taskList':
            prefixLine('- [ ] ');
            break;
          case 'quote':
            prefixLine('> ');
            break;
          case 'table': {
            const tableTemplate =
              '\n| Column 1 | Column 2 | Column 3 |\n| :--- | :--- | :--- |\n| Content | Content | Content |\n';
            view.dispatch({
              changes: { from: range.from, to: range.to, insert: tableTemplate },
              selection: { anchor: range.from + tableTemplate.length },
            });
            view.focus();
            break;
          }
        }
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const smartLinkPasteHandler = EditorView.domEventHandlers({
        paste(event, view) {
          const range = view.state.selection.main;
          if (range.empty) return false;

          const pasted = event.clipboardData?.getData('text/plain')?.trim() || '';
          if (!URL_PASTE_RE.test(pasted)) return false;

          const selectedText = view.state.sliceDoc(range.from, range.to);
          if (selectedText.includes('\n') || URL_PASTE_RE.test(selectedText.trim())) {
            return false;
          }

          event.preventDefault();
          const replacement = `[${selectedText}](${pasted})`;
          view.dispatch({
            changes: { from: range.from, to: range.to, insert: replacement },
            selection: { anchor: range.from + replacement.length },
          });
          return true;
        },
      });

      const scrollListener = EditorView.domEventHandlers({
        scroll(_event, view) {
          const topBlock = view.lineBlockAtHeight(view.scrollDOM.scrollTop + 12);
          const lineZeroBased = view.state.doc.lineAt(topBlock.from).number - 1;
          callbacksRef.current.onTopLineChange(lineZeroBased);
        },
      });

      const customShortcuts = keymap.of([
        {
          key: 'Mod-b',
          run: (view) => {
            const { from, to } = view.state.selection.main;
            const sel = view.state.sliceDoc(from, to) || 'bold';
            view.dispatch({
              changes: { from, to, insert: `**${sel}**` },
              selection: { anchor: from + 2, head: from + 2 + sel.length },
            });
            return true;
          },
        },
        {
          key: 'Mod-i',
          run: (view) => {
            const { from, to } = view.state.selection.main;
            const sel = view.state.sliceDoc(from, to) || 'italic';
            view.dispatch({
              changes: { from, to, insert: `*${sel}*` },
              selection: { anchor: from + 1, head: from + 1 + sel.length },
            });
            return true;
          },
        },
        {
          key: 'Mod-k',
          run: (view) => {
            const { from, to } = view.state.selection.main;
            const sel = view.state.sliceDoc(from, to) || 'link text';
            const insert = `[${sel}](https://)`;
            view.dispatch({
              changes: { from, to, insert },
              selection: {
                anchor: from + sel.length + 3,
                head: from + insert.length - 1,
              },
            });
            return true;
          },
        },
      ]);

      const state = EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          markdown({ codeLanguages: curatedCodeLanguages }),
          autocompletion({
            override: [slashCommandSource],
            activateOnTyping: true,
            icons: false,
          }),
          customShortcuts,
          keymap.of([
            ...completionKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
          ]),
          smartLinkPasteHandler,
          scrollListener,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              callbacksRef.current.onChange(update.state.doc.toString());
            }
            if (update.selectionSet || update.docChanged) {
              const head = update.state.selection.main.head;
              const lineObj = update.state.doc.lineAt(head);
              callbacksRef.current.onCursorChange({
                line: lineObj.number,
                col: head - lineObj.from + 1,
              });
            }
          }),
        ],
      });

      const view = new EditorView({
        state,
        parent: containerRef.current,
      });

      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // Only initialize CodeMirror once; external value changes are synced below
    }, []);

    // Sync external document loads (e.g. file open, new document, draft restore) into CodeMirror
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const currentText = view.state.doc.toString();
      if (value !== currentText) {
        view.dispatch({
          changes: { from: 0, to: currentText.length, insert: value },
        });
      }
    }, [value]);

    return (
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden text-sm"
        aria-label="Markdown source editor"
      />
    );
  }
);

Editor.displayName = 'Editor';
