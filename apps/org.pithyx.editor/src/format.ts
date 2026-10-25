import type { Plugin } from 'prettier';

interface Formatter {
  parser: string;
  plugins: () => Promise<Plugin[]>;
}

const plugin = (module: Promise<{ default: unknown }>) => module.then((loaded) => loaded.default as Plugin);

// Prettier and each of its parsers load the first time a file of that language is formatted.
const babel = () => Promise.all([plugin(import('prettier/plugins/babel')), plugin(import('prettier/plugins/estree'))]);
const postcss = () => Promise.all([plugin(import('prettier/plugins/postcss'))]);

const formatters: Record<string, Formatter> = {
  json: { parser: 'json', plugins: babel },
  javascript: { parser: 'babel', plugins: babel },
  typescript: { parser: 'babel-ts', plugins: babel },
  yaml: { parser: 'yaml', plugins: () => Promise.all([plugin(import('prettier/plugins/yaml'))]) },
  markdown: { parser: 'markdown', plugins: () => Promise.all([plugin(import('prettier/plugins/markdown'))]) },
  css: { parser: 'css', plugins: postcss },
  sass: { parser: 'scss', plugins: postcss },
  html: {
    parser: 'html',
    plugins: async () => [await plugin(import('prettier/plugins/html')), ...(await postcss()), ...(await babel())],
  },
};

export function canFormat(language: string): boolean {
  return language in formatters;
}

/** The text formatted by Prettier with the editor's indentation; rejects with Prettier's message on a syntax error. */
export async function formatText(text: string, language: string, tabSize: number): Promise<string> {
  const formatter = formatters[language];
  if (formatter === undefined) {
    return text;
  }
  const [{ format }, plugins] = await Promise.all([import('prettier/standalone'), formatter.plugins()]);
  return format(text, { parser: formatter.parser, plugins, tabWidth: tabSize, printWidth: 100, proseWrap: 'preserve' });
}
