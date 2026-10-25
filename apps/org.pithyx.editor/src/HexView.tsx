import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HexBuffer } from './hexBuffer';

const ROW = 16;
const ROW_HEIGHT = 22;
const OVERSCAN = 4;

export interface HexLabels {
  grid: string;
  offset: string;
  goTo: string;
  goToPlaceholder: string;
  insert: string;
  overwrite: string;
  littleEndian: string;
  bigEndian: string;
  bytes: (count: number) => string;
  selected: (count: number) => string;
  readOnly: string;
  end: string;
}

interface Props {
  buffer: HexBuffer;
  readOnly: boolean;
  labels: HexLabels;
  onChange: () => void;
  copyText: (text: string) => void;
}

type Pane = 'hex' | 'ascii';

const hex2 = (value: number) => value.toString(16).toUpperCase().padStart(2, '0');
const printable = (value: number) => (value >= 0x20 && value < 0x7f ? String.fromCharCode(value) : '.');

function parseOffset(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (/^(0x)?[0-9a-f]+h?$/.test(text) && (text.startsWith('0x') || text.endsWith('h') || /[a-f]/.test(text))) {
    return Number.parseInt(text.replace(/^0x/, '').replace(/h$/, ''), 16);
  }
  if (/^\d+$/.test(text)) {
    return Number.parseInt(text, 10);
  }
  return null;
}

function parseHexBytes(text: string): Uint8Array | null {
  const clean = text.replace(/0x/gi, '').replace(/[\s,;:-]/g, '');
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) {
    return null;
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** A virtualized hex grid: 16 bytes per row, hex and text side by side, overwrite or insert. */
export function HexView({ buffer, readOnly, labels, onChange, copyText }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(400);
  const [cursor, setCursor] = useState(0);
  const [nibble, setNibble] = useState(0);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [pane, setPane] = useState<Pane>('hex');
  const [insert, setInsert] = useState(false);
  const [littleEndian, setLittleEndian] = useState(true);
  const [goTo, setGoTo] = useState('');
  const [, redraw] = useState(0);

  const length = buffer.length;
  const rows = Math.floor(length / ROW) + 1;
  const selStart = anchor === null ? cursor : Math.min(anchor, cursor);
  const selEnd = anchor === null ? cursor : Math.max(anchor, cursor);
  const hasSelection = anchor !== null && anchor !== cursor;

  useLayoutEffect(() => {
    const element = scroller.current;
    if (element === null) {
      return;
    }
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    setHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  const changed = useCallback(() => {
    redraw((n) => n + 1);
    onChange();
  }, [onChange]);

  const moveTo = useCallback(
    (offset: number, extend: boolean) => {
      const next = Math.max(0, Math.min(length, offset));
      if (extend) {
        setAnchor((current) => current ?? cursor);
      } else {
        setAnchor(null);
      }
      setCursor(next);
      setNibble(0);
      const element = scroller.current;
      if (element !== null) {
        const top = Math.floor(next / ROW) * ROW_HEIGHT;
        if (top < element.scrollTop) {
          element.scrollTop = top;
        } else if (top + ROW_HEIGHT > element.scrollTop + element.clientHeight) {
          element.scrollTop = top + ROW_HEIGHT - element.clientHeight;
        }
      }
    },
    [length, cursor],
  );

  const removeSelection = (): number => {
    buffer.delete(selStart, selEnd - selStart + 1);
    setAnchor(null);
    return selStart;
  };

  const writeBytes = (bytes: Uint8Array) => {
    if (readOnly || bytes.length === 0) {
      return;
    }
    let at = cursor;
    if (hasSelection) {
      at = removeSelection();
      buffer.insert(at, bytes);
    } else if (insert) {
      buffer.insert(at, bytes);
    } else {
      buffer.set(at, bytes);
    }
    changed();
    moveTo(at + bytes.length, false);
  };

  const typeNibble = (digit: number) => {
    if (readOnly) {
      return;
    }
    if (hasSelection) {
      const at = removeSelection();
      buffer.insert(at, Uint8Array.of(digit << 4));
      setCursor(at);
      setNibble(1);
      changed();
      return;
    }
    if (nibble === 0) {
      if (insert || cursor >= length) {
        buffer.insert(cursor, Uint8Array.of(digit << 4));
      } else {
        buffer.set(cursor, Uint8Array.of((digit << 4) | (buffer.at(cursor) & 0x0f)));
      }
      setNibble(1);
      changed();
    } else {
      buffer.set(cursor, Uint8Array.of((buffer.at(cursor) & 0xf0) | digit));
      changed();
      moveTo(cursor + 1, false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const ctrl = event.ctrlKey || event.metaKey;
    const extend = event.shiftKey;
    const visibleRows = Math.max(1, Math.floor(height / ROW_HEIGHT) - 1);
    let handled = true;
    switch (event.key) {
      case 'ArrowLeft':
        moveTo(cursor - 1, extend);
        break;
      case 'ArrowRight':
        moveTo(cursor + 1, extend);
        break;
      case 'ArrowUp':
        moveTo(cursor - ROW, extend);
        break;
      case 'ArrowDown':
        moveTo(cursor + ROW, extend);
        break;
      case 'PageUp':
        moveTo(cursor - ROW * visibleRows, extend);
        break;
      case 'PageDown':
        moveTo(cursor + ROW * visibleRows, extend);
        break;
      case 'Home':
        moveTo(ctrl ? 0 : cursor - (cursor % ROW), extend);
        break;
      case 'End':
        moveTo(ctrl ? length : Math.min(length, cursor - (cursor % ROW) + ROW - 1), extend);
        break;
      case 'Tab':
        setPane((current) => (current === 'hex' ? 'ascii' : 'hex'));
        setNibble(0);
        break;
      case 'Insert':
        setInsert((current) => !current);
        break;
      case 'Escape':
        setAnchor(null);
        break;
      case 'Backspace':
        if (readOnly) {
          break;
        }
        if (hasSelection) {
          moveTo(removeSelection(), false);
        } else if (cursor > 0) {
          buffer.delete(cursor - 1, 1);
          moveTo(cursor - 1, false);
        }
        changed();
        break;
      case 'Delete':
        if (readOnly) {
          break;
        }
        if (hasSelection) {
          moveTo(removeSelection(), false);
        } else {
          buffer.delete(cursor, 1);
          setNibble(0);
        }
        changed();
        break;
      default:
        handled = false;
    }
    if (!handled && ctrl && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        const at = buffer.undo();
        if (at !== null) {
          changed();
          moveTo(at, false);
        }
        handled = true;
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        const at = buffer.redo();
        if (at !== null) {
          changed();
          moveTo(at, false);
        }
        handled = true;
      } else if (key === 'a') {
        setAnchor(0);
        setCursor(Math.max(0, length - 1));
        handled = true;
      }
    } else if (!handled && !ctrl && !event.altKey && event.key.length === 1) {
      if (pane === 'hex' && /^[0-9a-f]$/i.test(event.key)) {
        typeNibble(Number.parseInt(event.key, 16));
        handled = true;
      } else if (pane === 'ascii') {
        writeBytes(new TextEncoder().encode(event.key));
        handled = true;
      }
    }
    if (handled) {
      event.preventDefault();
    }
  };

  // Clipboard events reach the document, not a focused div: handle them while the grid has the focus.
  useEffect(() => {
    const inside = () => scroller.current !== null && scroller.current.contains(document.activeElement);
    const selectionBytes = () => buffer.slice(selStart, (hasSelection ? selEnd : selStart) + 1);
    const asText = (bytes: Uint8Array) =>
      pane === 'hex' ? [...bytes].map(hex2).join(' ') : new TextDecoder('utf-8').decode(bytes);
    const onCopy = (event: ClipboardEvent) => {
      if (!inside() || length === 0) {
        return;
      }
      event.preventDefault();
      const text = asText(selectionBytes());
      event.clipboardData?.setData('text/plain', text);
      if (event.clipboardData === null) {
        copyText(text);
      }
    };
    const onCut = (event: ClipboardEvent) => {
      if (!inside() || readOnly || !hasSelection) {
        return;
      }
      onCopy(event);
      moveTo(removeSelection(), false);
      changed();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!inside() || readOnly) {
        return;
      }
      event.preventDefault();
      const text = event.clipboardData?.getData('text/plain') ?? '';
      const bytes = pane === 'hex' ? parseHexBytes(text) : new TextEncoder().encode(text);
      if (bytes !== null) {
        writeBytes(bytes);
      }
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  });

  const onCellPointer = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-offset]');
    if (target === null) {
      return;
    }
    const offset = Number(target.dataset.offset);
    setPane(target.dataset.pane === 'ascii' ? 'ascii' : 'hex');
    if (event.type === 'mousedown') {
      moveTo(offset, event.shiftKey);
      scroller.current?.focus();
    } else if (event.buttons === 1) {
      setAnchor((current) => current ?? cursor);
      setCursor(Math.min(length, offset));
    }
  };

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
  const offsetDigits = Math.max(8, length.toString(16).length);
  const lines = [];
  for (let row = first; row < last; row++) {
    const base = row * ROW;
    const hexCells = [];
    const asciiCells = [];
    for (let i = 0; i < ROW; i++) {
      const offset = base + i;
      const exists = offset < length;
      const selected = exists && hasSelection && offset >= selStart && offset <= selEnd;
      const isCursor = offset === cursor;
      const cls = `hex-cell${selected ? ' is-selected' : ''}${isCursor ? ` is-cursor is-cursor--${pane === 'hex' ? 'main' : 'twin'}` : ''}${i === 8 ? ' hex-cell--gap' : ''}`;
      const value = exists ? buffer.at(offset) : null;
      hexCells.push(
        <span key={i} className={cls} data-offset={offset <= length ? offset : undefined} data-pane="hex">
          {value === null ? (
            offset === length ? (
              '__'
            ) : (
              '  '
            )
          ) : isCursor && pane === 'hex' && nibble === 1 ? (
            <>
              {hex2(value)[0]}
              <u>{hex2(value)[1]}</u>
            </>
          ) : (
            hex2(value)
          )}
        </span>,
      );
      asciiCells.push(
        <span
          key={i}
          className={`ascii-cell${selected ? ' is-selected' : ''}${isCursor ? ` is-cursor is-cursor--${pane === 'ascii' ? 'main' : 'twin'}` : ''}`}
          data-offset={offset <= length ? offset : undefined}
          data-pane="ascii"
        >
          {value === null ? ' ' : printable(value)}
        </span>,
      );
    }
    lines.push(
      <div key={row} className="hex-row" style={{ top: row * ROW_HEIGHT }}>
        <span className="hex-offset">{base.toString(16).toUpperCase().padStart(offsetDigits, '0')}</span>
        <span className="hex-bytes">{hexCells}</span>
        <span className="hex-ascii">{asciiCells}</span>
      </div>,
    );
  }

  const view = new DataView(buffer.slice(cursor, cursor + 8).buffer);
  const available = Math.min(8, length - cursor);
  const read = (size: number, fn: () => number | bigint) => (available >= size ? String(fn()) : '-');
  const byte = cursor < length ? buffer.at(cursor) : null;

  return (
    <div className="hex-view">
      <div className="hex-toolbar">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const offset = parseOffset(goTo);
            if (offset !== null) {
              moveTo(offset, false);
              scroller.current?.focus();
            }
          }}
        >
          <label className="hex-goto">
            <span>{labels.goTo}</span>
            <input
              value={goTo}
              onChange={(event) => setGoTo(event.target.value)}
              placeholder={labels.goToPlaceholder}
              spellCheck={false}
            />
          </label>
        </form>
        <button
          type="button"
          className="chip"
          onClick={() => setInsert((current) => !current)}
          aria-pressed={insert}
          disabled={readOnly}
        >
          {insert ? labels.insert : labels.overwrite}
        </button>
        <button type="button" className="chip" onClick={() => setLittleEndian((current) => !current)}>
          {littleEndian ? labels.littleEndian : labels.bigEndian}
        </button>
        <span className="hex-toolbar__info">
          {readOnly ? `${labels.readOnly} · ` : ''}
          {labels.bytes(length)}
          {hasSelection ? ` · ${labels.selected(selEnd - selStart + 1)}` : ''}
        </span>
      </div>
      <div
        ref={scroller}
        className="hex-scroller"
        tabIndex={0}
        role="grid"
        aria-label={labels.grid}
        aria-readonly={readOnly}
        onKeyDown={onKeyDown}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onMouseDown={onCellPointer}
        onMouseOver={onCellPointer}
      >
        <div className="hex-canvas" style={{ height: rows * ROW_HEIGHT }}>
          {lines}
        </div>
      </div>
      <dl className="hex-inspector" aria-live="polite">
        <div>
          <dt>{labels.offset}</dt>
          <dd>
            {cursor} · 0x{cursor.toString(16).toUpperCase()}
            {cursor >= length ? ` (${labels.end})` : ''}
          </dd>
        </div>
        <div>
          <dt>u8 / i8</dt>
          <dd>{byte === null ? '-' : `${String(byte)} / ${String((byte << 24) >> 24)}`}</dd>
        </div>
        <div>
          <dt>bin</dt>
          <dd>{byte === null ? '-' : byte.toString(2).padStart(8, '0')}</dd>
        </div>
        <div>
          <dt>u16 / i16</dt>
          <dd>
            {read(2, () => view.getUint16(0, littleEndian))} / {read(2, () => view.getInt16(0, littleEndian))}
          </dd>
        </div>
        <div>
          <dt>u32 / i32</dt>
          <dd>
            {read(4, () => view.getUint32(0, littleEndian))} / {read(4, () => view.getInt32(0, littleEndian))}
          </dd>
        </div>
        <div>
          <dt>i64</dt>
          <dd>{read(8, () => view.getBigInt64(0, littleEndian))}</dd>
        </div>
        <div>
          <dt>f32</dt>
          <dd>{read(4, () => Number(view.getFloat32(0, littleEndian).toPrecision(7)))}</dd>
        </div>
        <div>
          <dt>f64</dt>
          <dd>{read(8, () => view.getFloat64(0, littleEndian))}</dd>
        </div>
      </dl>
    </div>
  );
}
