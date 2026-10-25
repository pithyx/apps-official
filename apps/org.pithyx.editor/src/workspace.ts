import type { EditorState, StateEffect, Text } from '@codemirror/state';
import { EditorState as State } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { FileRef, PithyxApp } from '@pithyx/sdk';
import { decode, encode, type Eol } from './codec';
import {
  createEditorState,
  languageEffect,
  readOnlySlot,
  settingsExtension,
  settingsSlot,
  type EditorSettings,
} from './editor';
import { HexBuffer } from './hexBuffer';
import { detectLanguage, languageById, looksBinary } from './languages';

export type MarkdownView = 'edit' | 'split' | 'preview';

export interface Tab {
  id: string;
  name: string;
  /** The handle of the file on the box; null for a new file that was never saved. */
  file: FileRef | null;
  mode: 'text' | 'hex';
  language: string;
  markdownView: MarkdownView;
  eol: Eol;
  bom: boolean;
  /** Text tabs: the editor state, kept per tab so undo history survives switching tabs. */
  state: EditorState | null;
  hex: HexBuffer | null;
  saved: { doc: Text | null; eol: Eol; bom: boolean };
  /** Why a file opened in the hex editor although it was not asked for. */
  binaryReason: 'nul' | 'encoding' | null;
  saving: boolean;
}

/** What a window keeps across reloads with app.session (16 KB at most). */
interface SessionTab {
  name: string;
  file: FileRef | null;
  mode: 'text' | 'hex';
  language: string;
  markdownView: MarkdownView;
  eol: Eol;
  bom: boolean;
  /** Unsaved text, only while it fits. */
  text?: string;
}

interface Session {
  v: 1;
  active: number;
  tabs: SessionTab[];
}

const SESSION_LIMIT = 15000;

export class EditorError extends Error {
  constructor(
    readonly code: 'not_text' | 'too_large',
    readonly params: Record<string, string | number> = {},
  ) {
    super(code);
  }
}

/** Largest file the editor reads into memory. */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;

let counter = 0;
const newId = () => `t${String(++counter)}`;

/** The tabs of one window. React subscribes to it; CodeMirror states and hex buffers live here, not in React. */
export class Workspace {
  tabs: Tab[] = [];
  activeId: string | null = null;
  private version = 0;
  private listeners = new Set<() => void>();
  private untitled = 0;
  private sessionTimer: ReturnType<typeof setTimeout> | undefined;
  private notifying = false;
  /** The window's editor view while a text tab is shown; effects for the shown tab go through it. */
  view: EditorView | null = null;

  constructor(
    private readonly app: PithyxApp,
    public settings: EditorSettings,
    private phrases: Record<string, string>,
    private readonly untitledName: (n: number) => string,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  snapshot = () => this.version;

  get active(): Tab | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null;
  }

  changed(persist = true): void {
    this.version++;
    // CodeMirror dispatches typing from a MutationObserver; React hears about changes in a task of their own, once for
    // a burst of changes, so fast typing never piles up synchronous renders.
    if (!this.notifying) {
      this.notifying = true;
      setTimeout(() => {
        this.notifying = false;
        for (const listener of this.listeners) {
          listener();
        }
      }, 0);
    }
    if (persist) {
      this.scheduleSession();
    }
  }

  isDirty(tab: Tab): boolean {
    if (tab.mode === 'hex') {
      return tab.hex?.dirty ?? false;
    }
    if (tab.state === null) {
      return false;
    }
    if (tab.saved.doc === null) {
      return tab.state.doc.length > 0;
    }
    return !tab.state.doc.eq(tab.saved.doc) || tab.eol !== tab.saved.eol || tab.bom !== tab.saved.bom;
  }

  get anyDirty(): boolean {
    return this.tabs.some((tab) => this.isDirty(tab));
  }

  activate(id: string): void {
    if (this.activeId !== id) {
      this.activeId = id;
      this.changed();
    }
  }

  /** The only tab, when it is a new file nobody typed into yet. */
  private blankTab(): Tab | null {
    const only = this.tabs.length === 1 ? this.tabs[0]! : null;
    return only !== null && only.file === null && only.mode === 'text' && only.state?.doc.length === 0 ? only : null;
  }

  newFile(languageId = 'text'): Tab {
    const language = languageById(languageId);
    // A fresh window's empty file takes the language instead of standing next to the new one.
    const blank = this.blankTab();
    if (blank !== null && blank.language !== language.id) {
      blank.name = blank.name.replace(/\.[^.]*$/, `.${language.extension}`);
      this.setLanguage(blank, language.id);
      return blank;
    }
    this.untitled++;
    const tab = this.addText(
      `${this.untitledName(this.untitled)}.${language.extension}`,
      null,
      '',
      language.id,
      '\n',
      false,
    );
    tab.saved.doc = null;
    return tab;
  }

  /** Opens a file the user picked or opened with the app; a file that is open already gets the focus. */
  async open(file: FileRef, forceHex = false): Promise<Tab> {
    const existing = this.tabs.find((tab) => tab.file?.ref === file.ref);
    if (existing !== undefined) {
      this.activate(existing.id);
      return existing;
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new EditorError('too_large', { maxMb: MAX_FILE_BYTES / 1024 / 1024 });
    }
    const bytes = new Uint8Array(await (await this.app.files.read(file)).arrayBuffer());
    return this.fromBytes(file.name, file, bytes, forceHex || looksBinary(file.name));
  }

  /** A file dropped from the computer: a new tab without a handle, saved through the save dialog. */
  async openLocal(file: File): Promise<Tab> {
    if (file.size > MAX_FILE_BYTES) {
      throw new EditorError('too_large', { maxMb: MAX_FILE_BYTES / 1024 / 1024 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const tab = this.fromBytes(file.name, null, bytes, looksBinary(file.name));
    if (tab.mode === 'text') {
      tab.saved.doc = null;
    }
    return tab;
  }

  private fromBytes(name: string, file: FileRef | null, bytes: Uint8Array, hex: boolean): Tab {
    const decoded = hex ? null : decode(bytes);
    if (decoded === null || decoded.kind === 'binary') {
      const tab = this.addTab({
        name,
        file,
        mode: 'hex',
        language: detectLanguage(name).id,
        hex: new HexBuffer(bytes),
        binaryReason: decoded?.kind === 'binary' ? decoded.reason : null,
      });
      return tab;
    }
    return this.addText(name, file, decoded.text, detectLanguage(name).id, decoded.eol, decoded.bom);
  }

  private addText(name: string, file: FileRef | null, text: string, language: string, eol: Eol, bom: boolean): Tab {
    const state = createEditorState(text, this.settings, this.phrases, []);
    const tab = this.addTab({
      name,
      file,
      mode: 'text',
      language,
      state,
      eol,
      bom,
      saved: { doc: state.doc, eol, bom },
    });
    void this.loadLanguage(tab);
    this.applyReadOnly(tab);
    return tab;
  }

  private addTab(fields: Partial<Tab> & Pick<Tab, 'name' | 'file' | 'mode' | 'language'>): Tab {
    const tab: Tab = {
      id: newId(),
      markdownView: 'split',
      eol: '\n',
      bom: false,
      state: null,
      hex: null,
      saved: { doc: null, eol: '\n', bom: false },
      binaryReason: null,
      saving: false,
      ...fields,
    };
    if (tab.language !== 'markdown') {
      tab.markdownView = 'edit';
    }
    // A fresh window's empty file gives way to the first file the user opens.
    if (tab.file !== null && this.blankTab() !== null) {
      this.tabs = [];
    }
    this.tabs.push(tab);
    this.activeId = tab.id;
    this.changed();
    return tab;
  }

  private async loadLanguage(tab: Tab): Promise<void> {
    const language = tab.language;
    const effect = await languageEffect(language);
    // The tab may have changed its language or mode while the grammar loaded.
    if (tab.state === null || tab.language !== language) {
      return;
    }
    this.reconfigure(tab, [effect]);
  }

  /** Applies effects to a tab's state, through the view when the tab is shown so it keeps its scroll position. */
  private reconfigure(tab: Tab, effects: StateEffect<unknown>[], notify = true): void {
    if (tab.state === null) {
      return;
    }
    if (this.view !== null && this.view.state === tab.state) {
      this.view.dispatch({ effects });
    } else {
      tab.state = tab.state.update({ effects }).state;
    }
    if (notify) {
      this.changed(false);
    }
  }

  /** Replaces a tab's editor state; the editor view picks it up for the active tab. */
  updateState(tab: Tab, state: EditorState, fromView = false): void {
    const docChanged = tab.state !== null && !tab.state.doc.eq(state.doc);
    tab.state = state;
    if (!fromView) {
      this.changed();
    } else if (docChanged) {
      this.changed();
    }
  }

  setLanguage(tab: Tab, id: string): void {
    tab.language = id;
    tab.markdownView = id === 'markdown' ? 'split' : 'edit';
    void this.loadLanguage(tab);
    this.changed();
  }

  setMarkdownView(tab: Tab, view: MarkdownView): void {
    tab.markdownView = view;
    this.changed();
  }

  setEol(tab: Tab, eol: Eol): void {
    tab.eol = eol;
    this.changed();
  }

  setBom(tab: Tab, bom: boolean): void {
    tab.bom = bom;
    this.changed();
  }

  applySettings(settings: EditorSettings): void {
    this.settings = settings;
    for (const tab of this.tabs) {
      this.reconfigure(tab, [settingsSlot.reconfigure(settingsExtension(settings))], false);
    }
    this.changed(false);
  }

  private applyReadOnly(tab: Tab): void {
    if (tab.state === null) {
      return;
    }
    const readOnly = tab.file !== null && !tab.file.writable;
    this.reconfigure(tab, [readOnlySlot.reconfigure(State.readOnly.of(readOnly))], false);
  }

  /** Switches between text and hex; text that is not UTF-8 stays in the hex editor. */
  toggleHex(tab: Tab): void {
    if (tab.mode === 'text' && tab.state !== null) {
      const dirty = this.isDirty(tab);
      const bytes = encode(tab.state.doc.toString(), tab.eol, tab.bom);
      const buffer = new HexBuffer(bytes);
      if (dirty) {
        buffer.markUnsaved();
      }
      tab.hex = buffer;
      tab.state = null;
      tab.mode = 'hex';
      tab.binaryReason = null;
    } else if (tab.mode === 'hex' && tab.hex !== null) {
      const decoded = decode(tab.hex.bytes());
      if (decoded.kind === 'binary') {
        throw new EditorError('not_text', { reason: decoded.reason });
      }
      const dirty = tab.hex.dirty;
      const state = createEditorState(decoded.text, this.settings, this.phrases, []);
      tab.state = state;
      tab.saved = dirty
        ? { doc: null, eol: decoded.eol, bom: decoded.bom }
        : { doc: state.doc, eol: decoded.eol, bom: decoded.bom };
      tab.eol = decoded.eol;
      tab.bom = decoded.bom;
      tab.hex = null;
      tab.mode = 'text';
      if (tab.language === 'text') {
        tab.language = detectLanguage(tab.name).id;
      }
      void this.loadLanguage(tab);
      this.applyReadOnly(tab);
    }
    this.changed();
  }

  private contentOf(tab: Tab): Blob {
    if (tab.mode === 'hex' && tab.hex !== null) {
      return new Blob([tab.hex.bytes()], { type: 'application/octet-stream' });
    }
    const text = tab.state?.doc.toString() ?? '';
    return new Blob([encode(text, tab.eol, tab.bom)], { type: 'text/plain' });
  }

  /** Saves into the tab's file, or asks where with the desktop's save dialog. False when the user cancelled. */
  async save(tab: Tab, as = false): Promise<boolean> {
    const blob = this.contentOf(tab);
    const doc = tab.state?.doc ?? null;
    tab.saving = true;
    this.changed(false);
    try {
      let file: FileRef | null;
      if (!as && tab.file !== null && tab.file.writable) {
        file = await this.app.files.write(tab.file, blob);
      } else {
        file = await this.app.files.saveAs(tab.name, blob);
        if (file === null) {
          return false;
        }
      }
      const renamed = file.name !== tab.name;
      tab.file = file;
      tab.name = file.name;
      tab.saved = { doc, eol: tab.eol, bom: tab.bom };
      tab.hex?.markSaved();
      if (renamed && tab.mode === 'text') {
        const detected = detectLanguage(file.name).id;
        if (detected !== tab.language && detected !== 'text') {
          this.setLanguage(tab, detected);
        }
      }
      this.applyReadOnly(tab);
      return true;
    } finally {
      tab.saving = false;
      this.changed();
    }
  }

  close(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) {
      return;
    }
    this.tabs.splice(index, 1);
    if (this.activeId === id) {
      this.activeId = this.tabs[Math.min(index, this.tabs.length - 1)]?.id ?? null;
    }
    this.changed();
  }

  move(id: string, delta: number): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= this.tabs.length) {
      return;
    }
    const [tab] = this.tabs.splice(index, 1);
    this.tabs.splice(target, 0, tab!);
    this.changed();
  }

  cycle(delta: number): void {
    if (this.tabs.length === 0) {
      return;
    }
    const index = this.tabs.findIndex((tab) => tab.id === this.activeId);
    const next = this.tabs[(index + delta + this.tabs.length) % this.tabs.length];
    if (next !== undefined) {
      this.activate(next.id);
    }
  }

  private scheduleSession(): void {
    clearTimeout(this.sessionTimer);
    this.sessionTimer = setTimeout(() => void this.saveSession(), 1000);
  }

  /** Writes the open tabs to the window's session; unsaved texts only while everything fits in its 16 KB. */
  async saveSession(): Promise<void> {
    clearTimeout(this.sessionTimer);
    const session: Session = {
      v: 1,
      active: Math.max(
        0,
        this.tabs.findIndex((tab) => tab.id === this.activeId),
      ),
      tabs: this.tabs.map((tab) => ({
        name: tab.name,
        file: tab.file,
        mode: tab.mode,
        language: tab.language,
        markdownView: tab.markdownView,
        eol: tab.eol,
        bom: tab.bom,
      })),
    };
    const encoder = new TextEncoder();
    let size = encoder.encode(JSON.stringify(session)).length;
    this.tabs.forEach((tab, index) => {
      if (tab.mode !== 'text' || tab.state === null || !this.isDirty(tab)) {
        return;
      }
      const text = tab.state.doc.toString();
      const extra = encoder.encode(JSON.stringify(text)).length + 10;
      if (size + extra <= SESSION_LIMIT) {
        session.tabs[index]!.text = text;
        size += extra;
      }
    });
    if (size > SESSION_LIMIT) {
      // Too many tabs to remember with their handles: keep the first ones.
      while (session.tabs.length > 1 && encoder.encode(JSON.stringify(session)).length > SESSION_LIMIT) {
        session.tabs.pop();
      }
    }
    try {
      await this.app.session.save(session);
    } catch (error) {
      this.app.log.warn('Session not saved', { code: error instanceof Error ? error.message : 'unknown' });
    }
  }

  /**
   * Reopens the tabs of the last session and returns the names of files that could not be read again. File handles
   * belong to the window that got them, so after a reload of the desktop only unsaved text comes back.
   */
  async restoreSession(): Promise<string[]> {
    let saved: unknown;
    try {
      saved = await this.app.session.restore();
    } catch {
      return [];
    }
    if (!isSession(saved)) {
      return [];
    }
    const lost: string[] = [];
    for (const entry of saved.tabs) {
      let tab: Tab | null = null;
      if (entry.file !== null) {
        try {
          tab = await this.open(entry.file, entry.mode === 'hex');
        } catch (error) {
          this.app.log.debug('Session file not reopened', { code: errorCode(error) });
          tab = null;
        }
      }
      if (tab === null && entry.text !== undefined) {
        tab = this.addText(entry.name, null, entry.text, entry.language, entry.eol, entry.bom);
        tab.saved.doc = null;
      } else if (tab === null) {
        if (entry.file !== null) {
          lost.push(entry.name);
        }
        continue;
      } else if (entry.text !== undefined && tab.state !== null) {
        this.updateState(
          tab,
          tab.state.update({ changes: { from: 0, to: tab.state.doc.length, insert: entry.text } }).state,
        );
      }
      if (tab.mode === 'text') {
        tab.eol = entry.eol;
        tab.bom = entry.bom;
        if (tab.language !== entry.language) {
          this.setLanguage(tab, entry.language);
        }
      }
      tab.markdownView = entry.markdownView;
    }
    const active = this.tabs[saved.active];
    if (active !== undefined) {
      this.activeId = active.id;
    }
    this.changed(false);
    return lost;
  }

  updatePhrases(phrases: Record<string, string>): void {
    this.phrases = phrases;
  }
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'unknown';
}

function isSession(value: unknown): value is Session {
  return (
    typeof value === 'object' && value !== null && (value as Session).v === 1 && Array.isArray((value as Session).tabs)
  );
}
