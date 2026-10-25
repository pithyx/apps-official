import { syntaxTree } from '@codemirror/language';
import { type Diagnostic, linter, lintGutter } from '@codemirror/lint';
import type { Extension, Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/** Languages whose grammar marks syntax errors in the tree; their errors need no parser of their own. */
const treeChecked = new Set(['xml', 'html', 'css', 'javascript', 'typescript', 'python', 'sql']);

function offset(doc: Text, line: number, column: number): number {
  const target = doc.line(Math.min(Math.max(1, line), doc.lines));
  return Math.min(target.from + Math.max(0, column - 1), target.to);
}

/** A mark of one character or less (often at the end of a line) is hard to see; it covers its line's text instead. */
function visible(doc: Text, diagnostic: Diagnostic): Diagnostic {
  if (diagnostic.to - diagnostic.from > 1) {
    return diagnostic;
  }
  const line = doc.lineAt(Math.min(diagnostic.from, doc.length));
  const indent = line.text.length - line.text.trimStart().length;
  return line.text.trim() === '' ? diagnostic : { ...diagnostic, from: line.from + indent, to: line.to };
}

function checked(source: (view: EditorView) => Diagnostic[] | Promise<Diagnostic[]>) {
  return async (view: EditorView) => (await source(view)).map((diagnostic) => visible(view.state.doc, diagnostic));
}

function treeErrors(message: string) {
  return (view: EditorView): Diagnostic[] => {
    const found: Diagnostic[] = [];
    syntaxTree(view.state).iterate({
      enter: (node) => {
        if (node.type.isError && found.length < 100) {
          const to = node.to > node.from ? node.to : Math.min(node.from + 1, view.state.doc.length);
          found.push({ from: node.from, to, severity: 'error', message });
        }
      },
    });
    return found;
  };
}

async function yamlErrors(view: EditorView): Promise<Diagnostic[]> {
  const { parseAllDocuments } = await import('yaml');
  const doc = view.state.doc;
  const found: Diagnostic[] = [];
  for (const document of parseAllDocuments(doc.toString())) {
    for (const [problems, severity] of [
      [document.errors, 'error'],
      [document.warnings, 'warning'],
    ] as const) {
      for (const problem of problems) {
        const [from, to] = problem.pos;
        found.push({
          from: Math.min(from, doc.length),
          to: Math.min(Math.max(to, from + 1), doc.length),
          severity,
          message: problem.message.split('\n')[0] ?? problem.message,
        });
      }
    }
  }
  return found;
}

async function tomlErrors(view: EditorView): Promise<Diagnostic[]> {
  const { parse, TomlError } = await import('smol-toml');
  const doc = view.state.doc;
  try {
    parse(doc.toString());
    return [];
  } catch (error) {
    if (!(error instanceof TomlError)) {
      return [];
    }
    const from = offset(doc, error.line, error.column);
    return [
      {
        from,
        to: Math.min(from + 1, doc.length),
        severity: 'error',
        message: error.message.split('\n')[0] ?? error.message,
      },
    ];
  }
}

/** Error marks for a language: underlined in the text and listed in the gutter; none for languages without a check. */
export async function lintExtension(language: string, syntaxMessage: string): Promise<Extension> {
  const options = { delay: 400 };
  if (language === 'json') {
    const { jsonParseLinter } = await import('@codemirror/lang-json');
    return [linter(checked(jsonParseLinter()), options), lintGutter()];
  }
  if (language === 'yaml') {
    return [linter(checked(yamlErrors), options), lintGutter()];
  }
  if (language === 'toml') {
    return [linter(checked(tomlErrors), options), lintGutter()];
  }
  if (treeChecked.has(language)) {
    return [linter(checked(treeErrors(syntaxMessage)), options), lintGutter()];
  }
  return [];
}
