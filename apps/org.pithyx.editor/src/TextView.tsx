import { EditorView } from '@codemirror/view';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Tab, Workspace } from './workspace';

interface Props {
  workspace: Workspace;
  tab: Tab;
  compact: boolean;
  labels: { editor: string; preview: string };
  openUrl: (url: string) => void;
  onCursor: (line: number, column: number, selected: number) => void;
}

// Marked and DOMPurify load with the first Markdown preview, not with every window.
const MarkdownPreview = lazy(() => import('./MarkdownPreview').then((module) => ({ default: module.MarkdownPreview })));

/** One CodeMirror view for the window; switching tabs swaps the tab's state into it. */
export function TextView({ workspace, tab, compact, labels, openUrl, onCursor }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const shownTab = useRef<Tab>(tab);
  const preview = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const markdown = tab.language === 'markdown';
  let mode = markdown ? tab.markdownView : 'edit';
  if (compact && mode === 'split') {
    mode = 'edit';
  }

  useEffect(() => {
    if (host.current === null || tab.state === null) {
      return;
    }
    const editor = new EditorView({
      state: tab.state,
      parent: host.current,
      dispatchTransactions: (transactions, target) => {
        target.update(transactions);
        const current = shownTab.current;
        workspace.updateState(current, target.state, true);
        const main = target.state.selection.main;
        const line = target.state.doc.lineAt(main.head);
        onCursor(line.number, main.head - line.from + 1, main.to - main.from);
      },
    });
    view.current = editor;
    workspace.view = editor;
    return () => {
      editor.destroy();
      view.current = null;
      workspace.view = null;
    };
    // The view lives as long as the component; state changes come in through the effect below.
  }, []);

  // A new active tab, or a state the workspace replaced (language, settings), goes into the view.
  useEffect(() => {
    const editor = view.current;
    const switched = shownTab.current !== tab;
    shownTab.current = tab;
    if (editor === null || tab.state === null || editor.state === tab.state) {
      return;
    }
    editor.setState(tab.state);
    const main = tab.state.selection.main;
    const line = tab.state.doc.lineAt(main.head);
    onCursor(line.number, main.head - line.from + 1, main.to - main.from);
    if (switched) {
      editor.focus();
    }
  });

  // The preview follows the text, and in split view the editor's scroll position.
  useEffect(() => {
    if (!markdown || mode === 'edit') {
      return;
    }
    setText(tab.state?.doc.toString() ?? '');
  }, [markdown, mode, tab.state?.doc, tab.state]);

  useEffect(() => {
    const editor = view.current;
    if (editor === null || mode !== 'split') {
      return;
    }
    const scroller = editor.scrollDOM;
    const sync = () => {
      const target = preview.current;
      if (target === null) {
        return;
      }
      const ratio = scroller.scrollTop / Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
    };
    scroller.addEventListener('scroll', sync, { passive: true });
    return () => scroller.removeEventListener('scroll', sync);
  }, [mode]);

  return (
    <div className={`text-view text-view--${mode}`}>
      <div className="text-view__editor" ref={host} aria-label={labels.editor} hidden={mode === 'preview'} />
      {mode !== 'edit' && (
        <Suspense fallback={<div className="markdown-preview" />}>
          <MarkdownPreview source={text} label={labels.preview} openUrl={openUrl} scrollRef={preview} />
        </Suspense>
      )}
    </div>
  );
}
