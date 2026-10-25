import type { Extension } from '@codemirror/state';
import type { StreamParser } from '@codemirror/language';

export interface Language {
  id: string;
  label: string;
  /** Extension for a new file in this language, without the dot. */
  extension: string;
  load: () => Promise<Extension>;
}

// Each language loads its own chunk, so a window only fetches the grammar of the files it opens.
async function legacy(parser: Promise<StreamParser<unknown>>): Promise<Extension> {
  const [{ StreamLanguage }, mode] = await Promise.all([import('@codemirror/language'), parser]);
  return StreamLanguage.define(mode);
}

export const languages: Language[] = [
  { id: 'text', label: 'Plain text', extension: 'txt', load: async () => [] },
  {
    id: 'markdown',
    label: 'Markdown',
    extension: 'md',
    load: async () => {
      // Fenced code blocks load the grammar of their language on demand.
      const [{ markdown, markdownLanguage }, { languages: nested }] = await Promise.all([
        import('@codemirror/lang-markdown'),
        import('@codemirror/language-data'),
      ]);
      return markdown({ base: markdownLanguage, codeLanguages: nested });
    },
  },
  { id: 'yaml', label: 'YAML', extension: 'yaml', load: async () => (await import('@codemirror/lang-yaml')).yaml() },
  {
    id: 'toml',
    label: 'TOML',
    extension: 'toml',
    load: () => legacy(import('@codemirror/legacy-modes/mode/toml').then((m) => m.toml)),
  },
  { id: 'json', label: 'JSON', extension: 'json', load: async () => (await import('@codemirror/lang-json')).json() },
  {
    id: 'ini',
    label: 'INI / conf',
    extension: 'conf',
    load: () => legacy(import('@codemirror/legacy-modes/mode/properties').then((m) => m.properties)),
  },
  {
    id: 'shell',
    label: 'Shell',
    extension: 'sh',
    load: () => legacy(import('@codemirror/legacy-modes/mode/shell').then((m) => m.shell)),
  },
  {
    id: 'dockerfile',
    label: 'Dockerfile',
    extension: 'dockerfile',
    load: () => legacy(import('@codemirror/legacy-modes/mode/dockerfile').then((m) => m.dockerFile)),
  },
  {
    id: 'nginx',
    label: 'nginx',
    extension: 'conf',
    load: () => legacy(import('@codemirror/legacy-modes/mode/nginx').then((m) => m.nginx)),
  },
  { id: 'xml', label: 'XML', extension: 'xml', load: async () => (await import('@codemirror/lang-xml')).xml() },
  { id: 'html', label: 'HTML', extension: 'html', load: async () => (await import('@codemirror/lang-html')).html() },
  { id: 'css', label: 'CSS', extension: 'css', load: async () => (await import('@codemirror/lang-css')).css() },
  {
    id: 'javascript',
    label: 'JavaScript',
    extension: 'js',
    load: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true }),
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    extension: 'ts',
    load: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true }),
  },
  {
    id: 'python',
    label: 'Python',
    extension: 'py',
    load: async () => (await import('@codemirror/lang-python')).python(),
  },
  { id: 'sql', label: 'SQL', extension: 'sql', load: async () => (await import('@codemirror/lang-sql')).sql() },
  {
    id: 'diff',
    label: 'Diff',
    extension: 'diff',
    load: () => legacy(import('@codemirror/legacy-modes/mode/diff').then((m) => m.diff)),
  },
  {
    id: 'powershell',
    label: 'PowerShell',
    extension: 'ps1',
    load: () => legacy(import('@codemirror/legacy-modes/mode/powershell').then((m) => m.powerShell)),
  },
  {
    id: 'lua',
    label: 'Lua',
    extension: 'lua',
    load: () => legacy(import('@codemirror/legacy-modes/mode/lua').then((m) => m.lua)),
  },
  {
    id: 'go',
    label: 'Go',
    extension: 'go',
    load: () => legacy(import('@codemirror/legacy-modes/mode/go').then((m) => m.go)),
  },
  {
    id: 'rust',
    label: 'Rust',
    extension: 'rs',
    load: () => legacy(import('@codemirror/legacy-modes/mode/rust').then((m) => m.rust)),
  },
  {
    id: 'c',
    label: 'C / C++',
    extension: 'c',
    load: () => legacy(import('@codemirror/legacy-modes/mode/clike').then((m) => m.cpp)),
  },
  {
    id: 'java',
    label: 'Java',
    extension: 'java',
    load: () => legacy(import('@codemirror/legacy-modes/mode/clike').then((m) => m.java)),
  },
  {
    id: 'kotlin',
    label: 'Kotlin',
    extension: 'kt',
    load: () => legacy(import('@codemirror/legacy-modes/mode/clike').then((m) => m.kotlin)),
  },
  {
    id: 'csharp',
    label: 'C#',
    extension: 'cs',
    load: () => legacy(import('@codemirror/legacy-modes/mode/clike').then((m) => m.csharp)),
  },
  {
    id: 'ruby',
    label: 'Ruby',
    extension: 'rb',
    load: () => legacy(import('@codemirror/legacy-modes/mode/ruby').then((m) => m.ruby)),
  },
  {
    id: 'perl',
    label: 'Perl',
    extension: 'pl',
    load: () => legacy(import('@codemirror/legacy-modes/mode/perl').then((m) => m.perl)),
  },
  {
    id: 'r',
    label: 'R',
    extension: 'r',
    load: () => legacy(import('@codemirror/legacy-modes/mode/r').then((m) => m.r)),
  },
  {
    id: 'swift',
    label: 'Swift',
    extension: 'swift',
    load: () => legacy(import('@codemirror/legacy-modes/mode/swift').then((m) => m.swift)),
  },
  {
    id: 'cmake',
    label: 'CMake',
    extension: 'cmake',
    load: () => legacy(import('@codemirror/legacy-modes/mode/cmake').then((m) => m.cmake)),
  },
  {
    id: 'sass',
    label: 'Sass / SCSS',
    extension: 'scss',
    load: () => legacy(import('@codemirror/legacy-modes/mode/sass').then((m) => m.sass)),
  },
  {
    id: 'latex',
    label: 'LaTeX',
    extension: 'tex',
    load: () => legacy(import('@codemirror/legacy-modes/mode/stex').then((m) => m.stex)),
  },
];

const byExtension: Record<string, string> = {
  md: 'markdown',
  markdown: 'markdown',
  mdown: 'markdown',
  mkd: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  webmanifest: 'json',
  ini: 'ini',
  conf: 'ini',
  cfg: 'ini',
  cnf: 'ini',
  properties: 'ini',
  env: 'ini',
  service: 'ini',
  timer: 'ini',
  socket: 'ini',
  mount: 'ini',
  network: 'ini',
  netdev: 'ini',
  link: 'ini',
  desktop: 'ini',
  editorconfig: 'ini',
  gitconfig: 'ini',
  npmrc: 'ini',
  rules: 'ini',
  tf: 'ini',
  hcl: 'ini',
  nix: 'ini',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ksh: 'shell',
  bashrc: 'shell',
  profile: 'shell',
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  nginx: 'nginx',
  xml: 'xml',
  svg: 'xml',
  plist: 'xml',
  xsd: 'xml',
  xsl: 'xml',
  xslt: 'xml',
  rss: 'xml',
  atom: 'xml',
  xhtml: 'html',
  html: 'html',
  htm: 'html',
  vue: 'html',
  svelte: 'html',
  css: 'css',
  scss: 'sass',
  sass: 'sass',
  less: 'css',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  pyw: 'python',
  pyi: 'python',
  sql: 'sql',
  diff: 'diff',
  patch: 'diff',
  ps1: 'powershell',
  psm1: 'powershell',
  lua: 'lua',
  go: 'go',
  rs: 'rust',
  c: 'c',
  h: 'c',
  cpp: 'c',
  hpp: 'c',
  cc: 'c',
  cxx: 'c',
  hh: 'c',
  java: 'java',
  gradle: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  cs: 'csharp',
  php: 'html',
  rb: 'ruby',
  pl: 'perl',
  pm: 'perl',
  r: 'r',
  swift: 'swift',
  cmake: 'cmake',
  tex: 'latex',
  mk: 'shell',
  makefile: 'shell',
};

const byName: Record<string, string> = {
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  makefile: 'shell',
  gnumakefile: 'shell',
  'cmakelists.txt': 'cmake',
  'nginx.conf': 'nginx',
  '.env': 'ini',
  '.bashrc': 'shell',
  '.profile': 'shell',
  '.zshrc': 'shell',
  '.gitignore': 'text',
  '.dockerignore': 'text',
  caddyfile: 'text',
  'compose.yaml': 'yaml',
};

export function languageById(id: string): Language {
  return languages.find((language) => language.id === id) ?? languages[0]!;
}

/** The language for a file name: whole names like Dockerfile first, then the last extension. */
export function detectLanguage(fileName: string): Language {
  const name = fileName.toLowerCase();
  const exact = byName[name];
  if (exact !== undefined) {
    return languageById(exact);
  }
  if (name.startsWith('dockerfile.') || name.endsWith('.dockerfile')) {
    return languageById('dockerfile');
  }
  if (name.startsWith('.env.')) {
    return languageById('ini');
  }
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 ? name.slice(dot + 1) : name;
  return languageById(byExtension[extension] ?? 'text');
}

/** Whether a name, by its extension, is meant to be edited as bytes. */
export function looksBinary(fileName: string): boolean {
  return /\.(bin|dat|rom|dump|img|exe|dll|so|o|a|class|pyc|wasm|zip|gz|xz|zst|7z|tar|png|jpe?g|gif|webp|ico|pdf|mp[34]|mkv|sqlite|db)$/i.test(
    fileName,
  );
}
