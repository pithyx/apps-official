import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { classHighlighter } from '@lezer/highlight';
import { languageById } from './languages';

export interface EditorSettings {
  wrap: boolean;
  tabSize: number;
}

export const languageSlot = new Compartment();
export const settingsSlot = new Compartment();
export const readOnlySlot = new Compartment();

// The editor's own phrases, translated through the app's texts.
export const phrasesSlot = new Compartment();

export function settingsExtension(settings: EditorSettings): Extension {
  return [
    settings.wrap ? EditorView.lineWrapping : [],
    EditorState.tabSize.of(settings.tabSize),
    indentUnit.of(' '.repeat(settings.tabSize)),
  ];
}

export function createEditorState(
  doc: string,
  settings: EditorSettings,
  phrases: Record<string, string>,
  extra: Extension,
): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(classHighlighter),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        indentWithTab,
      ]),
      languageSlot.of([]),
      settingsSlot.of(settingsExtension(settings)),
      readOnlySlot.of(EditorState.readOnly.of(false)),
      phrasesSlot.of(EditorState.phrases.of(phrases)),
      extra,
    ],
  });
}

/** Loads the grammar of a language and returns the effect that switches a state to it. */
export async function languageEffect(id: string) {
  return languageSlot.reconfigure(await languageById(id).load());
}
