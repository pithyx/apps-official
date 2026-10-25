import { highlightCode, classHighlighter } from '@lezer/highlight';
import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import { useEffect, useRef, type RefObject } from 'react';

const marked = new Marked({ gfm: true, breaks: false });

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      return `<h${String(depth)} id="${slug(html)}">${html}</h${String(depth)}>\n`;
    },
  },
});

/** Markdown as sanitized HTML: no scripts, no event handlers, no forms. */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form'] });
}

async function highlightBlocks(root: HTMLElement, isCurrent: () => boolean): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>('pre > code[class*="language-"]')];
  if (blocks.length === 0) {
    return;
  }
  const { languages } = await import('@codemirror/language-data');
  const { LanguageDescription } = await import('@codemirror/language');
  for (const block of blocks) {
    const name = /language-([\w+#.-]+)/.exec(block.className)?.[1];
    const description = name === undefined ? null : LanguageDescription.matchLanguageName(languages, name, true);
    if (description === null) {
      continue;
    }
    const support = await description.load();
    if (!isCurrent()) {
      return;
    }
    const code = block.textContent ?? '';
    const tree = support.language.parser.parse(code);
    const out = document.createDocumentFragment();
    highlightCode(
      code,
      tree,
      classHighlighter,
      (text, classes) => {
        if (classes === '') {
          out.append(text);
        } else {
          const span = document.createElement('span');
          span.className = classes;
          span.textContent = text;
          out.append(span);
        }
      },
      () => out.append('\n'),
    );
    block.replaceChildren(out);
  }
}

interface Props {
  source: string;
  label: string;
  openUrl: (url: string) => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
}

export function MarkdownPreview({ source, label, openUrl, scrollRef }: Props) {
  const own = useRef<HTMLDivElement>(null);
  const ref = scrollRef ?? own;
  const generation = useRef(0);

  useEffect(() => {
    const root = ref.current;
    if (root === null) {
      return;
    }
    // Large documents render after a short pause in typing.
    const delay = source.length > 200_000 ? 400 : source.length > 20_000 ? 120 : 0;
    const current = ++generation.current;
    const timer = setTimeout(() => {
      root.innerHTML = renderMarkdown(source);
      void highlightBlocks(root, () => current === generation.current);
    }, delay);
    return () => clearTimeout(timer);
  }, [source, ref]);

  // The window is sandboxed without popups: links to other pages go through the desktop, anchors scroll here.
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a');
    if (anchor === null) {
      return;
    }
    event.preventDefault();
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      const target = ref.current?.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`);
      target?.scrollIntoView({ block: 'start' });
    } else if (/^(https?:|mailto:)/i.test(href)) {
      openUrl(href);
    }
  };

  return (
    <div ref={ref} className="markdown-preview" role="document" aria-label={label} tabIndex={0} onClick={onClick} />
  );
}
