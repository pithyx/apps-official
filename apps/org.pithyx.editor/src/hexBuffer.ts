type Change = { id: number } & (
  | { kind: 'set'; offset: number; before: Uint8Array; after: Uint8Array }
  | { kind: 'insert'; offset: number; bytes: Uint8Array }
  | { kind: 'delete'; offset: number; bytes: Uint8Array }
);

type NewChange = Change extends infer C ? (C extends Change ? Omit<C, 'id'> : never) : never;

let nextId = 1;

/** The bytes of a file in the hex editor, with undo and a version that says whether it changed since saving. */
export class HexBuffer {
  private data: Uint8Array;
  private size: number;
  private undoStack: Change[] = [];
  private redoStack: Change[] = [];
  private savedId = 0;
  /** Grows with every change, for redrawing. */
  version = 0;

  constructor(bytes: Uint8Array) {
    this.data = new Uint8Array(Math.max(16, bytes.length + 64));
    this.data.set(bytes);
    this.size = bytes.length;
  }

  get length(): number {
    return this.size;
  }

  /** Whether the bytes differ from the saved ones; undoing back to them makes the buffer clean again. */
  get dirty(): boolean {
    return this.currentId() !== this.savedId;
  }

  at(offset: number): number {
    return this.data[offset] ?? 0;
  }

  slice(start: number, end: number): Uint8Array<ArrayBuffer> {
    return this.data.slice(Math.max(0, start), Math.min(end, this.size));
  }

  bytes(): Uint8Array<ArrayBuffer> {
    return this.data.slice(0, this.size);
  }

  /** Overwrites bytes from offset on; writing past the end appends. */
  set(offset: number, bytes: Uint8Array): void {
    const overlap = Math.max(0, Math.min(bytes.length, this.size - offset));
    if (overlap < bytes.length) {
      this.apply({ kind: 'insert', offset: offset + overlap, bytes: bytes.slice(overlap) });
    }
    if (overlap > 0) {
      const after = bytes.slice(0, overlap);
      const before = this.slice(offset, offset + overlap);
      this.apply({ kind: 'set', offset, before, after });
    }
  }

  insert(offset: number, bytes: Uint8Array): void {
    if (bytes.length > 0) {
      this.apply({ kind: 'insert', offset, bytes: bytes.slice() });
    }
  }

  delete(offset: number, count: number): void {
    const end = Math.min(this.size, offset + count);
    if (end > offset) {
      this.apply({ kind: 'delete', offset, bytes: this.slice(offset, end) });
    }
  }

  undo(): number | null {
    const change = this.undoStack.pop();
    if (change === undefined) {
      return null;
    }
    this.run(invert(change));
    this.redoStack.push(change);
    return change.offset;
  }

  redo(): number | null {
    const change = this.redoStack.pop();
    if (change === undefined) {
      return null;
    }
    this.run(change);
    this.undoStack.push(change);
    return change.offset;
  }

  markSaved(): void {
    this.savedId = this.currentId();
  }

  /** For bytes that came from unsaved text: dirty until saved. */
  markUnsaved(): void {
    this.savedId = -1;
  }

  private currentId(): number {
    return this.undoStack.at(-1)?.id ?? 0;
  }

  private apply(fresh: NewChange): void {
    const change = { ...fresh, id: nextId++ } as Change;
    this.run(change);
    this.undoStack.push(change);
    if (this.undoStack.length > 10000) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  private run(change: Change): void {
    switch (change.kind) {
      case 'set':
        this.data.set(change.after, change.offset);
        break;
      case 'insert':
        this.reserve(this.size + change.bytes.length);
        this.data.copyWithin(change.offset + change.bytes.length, change.offset, this.size);
        this.data.set(change.bytes, change.offset);
        this.size += change.bytes.length;
        break;
      case 'delete':
        this.data.copyWithin(change.offset, change.offset + change.bytes.length, this.size);
        this.size -= change.bytes.length;
        break;
    }
    this.version++;
  }

  private reserve(capacity: number): void {
    if (capacity <= this.data.length) {
      return;
    }
    const next = new Uint8Array(Math.max(capacity, this.data.length * 2));
    next.set(this.data.subarray(0, this.size));
    this.data = next;
  }
}

function invert(change: Change): Change {
  switch (change.kind) {
    case 'set':
      return { id: change.id, kind: 'set', offset: change.offset, before: change.after, after: change.before };
    case 'insert':
      return { id: change.id, kind: 'delete', offset: change.offset, bytes: change.bytes };
    case 'delete':
      return { id: change.id, kind: 'insert', offset: change.offset, bytes: change.bytes };
  }
}
