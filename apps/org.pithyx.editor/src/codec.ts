export type Eol = '\n' | '\r\n';

export type Decoded =
  { kind: 'text'; text: string; eol: Eol; bom: boolean } | { kind: 'binary'; reason: 'nul' | 'encoding' };

const BOM = [0xef, 0xbb, 0xbf];

function hasBom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === BOM[0] && bytes[1] === BOM[1] && bytes[2] === BOM[2];
}

/** Line breaks normalized to \n, with the file's own style remembered for saving. */
export function decode(bytes: Uint8Array): Decoded {
  const bom = hasBom(bytes);
  const body = bom ? bytes.subarray(3) : bytes;
  // A NUL byte in the first 64 KiB marks a binary file, as most editors and git decide.
  const head = body.subarray(0, 65536);
  if (head.includes(0)) {
    return { kind: 'binary', reason: 'nul' };
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body);
  } catch {
    return { kind: 'binary', reason: 'encoding' };
  }
  return { kind: 'text', text: text.replace(/\r\n/g, '\n'), eol: detectEol(text), bom };
}

function detectEol(text: string): Eol {
  let crlf = 0;
  let lf = 0;
  for (let i = text.indexOf('\n'); i !== -1 && crlf + lf < 10000; i = text.indexOf('\n', i + 1)) {
    if (i > 0 && text.charCodeAt(i - 1) === 13) {
      crlf++;
    } else {
      lf++;
    }
  }
  return crlf > lf ? '\r\n' : '\n';
}

export function encode(text: string, eol: Eol, bom: boolean): Uint8Array<ArrayBuffer> {
  const body = new TextEncoder().encode(eol === '\n' ? text : text.replace(/\n/g, eol));
  if (!bom) {
    return body;
  }
  const out = new Uint8Array(body.length + 3);
  out.set(BOM, 0);
  out.set(body, 3);
  return out;
}
