import { gotoLine, openSearchPanel } from '@codemirror/search';
import { PithyxError, type FileRef, type PithyxApp } from '@pithyx/sdk';
import type { I18n } from '@pithyx/sdk/i18n';
import { Button, Dialog, IconButton, Menu, MenuItem, MenuPopover, MenuSeparator, MenuTrigger } from '@pithyx/ui';
import {
  IconBinary,
  IconChevronDown,
  IconDeviceFloppy,
  IconDots,
  IconFileText,
  IconFolderOpen,
  IconPlus,
  IconX,
} from '@tabler/icons-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { EditorSettings } from './editor';
import type { HexLabels } from './HexView';
import { languages } from './languages';
import { TextView } from './TextView';
import { EditorError, Workspace, type MarkdownView, type Tab } from './workspace';

export interface Settings extends EditorSettings {
  fontSize: number;
}

export const DEFAULT_SETTINGS: Settings = { wrap: false, tabSize: 2, fontSize: 14 };

interface Props {
  app: PithyxApp;
  i18n: I18n;
  workspace: Workspace;
  initialSettings: Settings;
  /** Names of the files of the last session that could not be opened again. */
  lostFiles: string[];
}

type Pending = { kind: 'closeTab'; tab: Tab } | { kind: 'closeWindow' } | null;

interface Notice {
  text: string;
  action?: { label: string; run: () => void };
}

const MARKDOWN_VIEWS: MarkdownView[] = ['edit', 'split', 'preview'];

const HexView = lazy(() => import('./HexView').then((module) => ({ default: module.HexView })));

export function App({ app, i18n, workspace, initialSettings, lostFiles }: Props) {
  const t = i18n.t;
  useSyncExternalStore(workspace.subscribe, workspace.snapshot);
  const [settings, setSettings] = useState(initialSettings);
  const [sizeClass, setSizeClass] = useState(app.context.sizeClass);
  const [locale, setLocale] = useState(app.context.locale);
  const [pending, setPending] = useState<Pending>(null);
  const [notice, setNotice] = useState<Notice | null>(
    lostFiles.length > 0
      ? { text: i18n.t('notice.lost', { count: lostFiles.length, names: app.format.list(lostFiles) }) }
      : null,
  );
  const [cursor, setCursor] = useState({ line: 1, column: 1, selected: 0 });
  const [dropping, setDropping] = useState(false);
  const canRead = app.context.permissions.includes('files.read');
  const [permissions, setPermissions] = useState(app.context.permissions);
  const tab = workspace.active;
  const compact = sizeClass === 'compact';
  const dirtyTabs = workspace.tabs.filter((each) => workspace.isDirty(each));
  const readOnly = tab?.file !== null && tab?.file !== undefined && !tab.file.writable;
  const mayWrite = permissions.includes('files.write');
  const mayRead = permissions.includes('files.read') || canRead;

  const report = useCallback(
    async (error: unknown) => {
      if (error instanceof EditorError) {
        error = new PithyxError({
          code: `editor.file.${error.code}`,
          params: error.params,
          detail: t(`errors.editor.file.${error.code}`, error.params),
        });
      }
      const code = error instanceof PithyxError ? error.code : 'unknown';
      app.log.error('Action failed', {
        code,
        requestId: error instanceof PithyxError ? (error.requestId ?? null) : null,
      });
      if (app.supports('ui.showError')) {
        await app.ui.showError(error);
        return;
      }
      const params = error instanceof PithyxError ? error.params : {};
      const text = t(`errors.${code}`, params);
      setNotice({ text: text === `errors.${code}` ? t('errors.unknown') : text });
    },
    [app, t],
  );

  const persistSettings = useCallback(
    (next: Settings) => {
      setSettings(next);
      workspace.applySettings(next);
      app.storage
        .set('settings', next)
        .catch((error: unknown) => app.log.warn('Settings not saved', { code: String(error) }));
    },
    [app, workspace],
  );

  const openFiles = useCallback(
    async (files: FileRef[]) => {
      for (const file of files) {
        try {
          await workspace.open(file);
        } catch (error) {
          await report(error);
        }
      }
    },
    [workspace, report],
  );

  const pick = useCallback(async () => {
    try {
      await openFiles(await app.files.pick({ multiple: true }));
    } catch (error) {
      await report(error);
    }
  }, [app, openFiles, report]);

  const save = useCallback(
    async (target: Tab | null, as = false): Promise<boolean> => {
      if (target === null) {
        return false;
      }
      try {
        return await workspace.save(target, as);
      } catch (error) {
        await report(error);
        return false;
      }
    },
    [workspace, report],
  );

  const requestClose = useCallback(
    (target: Tab) => {
      if (workspace.isDirty(target)) {
        workspace.activate(target.id);
        setPending({ kind: 'closeTab', tab: target });
      } else {
        workspace.close(target.id);
      }
    },
    [workspace],
  );

  const toggleHex = useCallback(
    (target: Tab) => {
      try {
        workspace.toggleHex(target);
      } catch (error) {
        void report(error);
      }
    },
    [workspace, report],
  );

  // Desktop events: launch files, theme and size, permissions, updates and the questions before closing.
  useEffect(() => {
    const off = [
      app.on('openFile', ({ file }) => void openFiles([file])),
      app.on('launch', (launch) => {
        if (launch.file !== undefined) {
          void openFiles([launch.file]);
        }
      }),
      app.on('sizeClassChange', () => setSizeClass(app.context.sizeClass)),
      app.on('localeChange', () => setLocale(app.context.locale)),
      app.on('permissionsChange', () => setPermissions(app.context.permissions)),
      app.on('appUpdated', () => {
        if (!workspace.anyDirty) {
          void workspace.saveSession().then(() => location.reload());
        } else {
          setNotice({ text: t('notice.updated'), action: { label: t('notice.reload'), run: () => location.reload() } });
        }
      }),
    ];
    app.answer('beforeClose', () => {
      if (!workspace.anyDirty) {
        return { allow: true };
      }
      setPending({ kind: 'closeWindow' });
      return { allow: false };
    });
    app.answer('beforeUnload', async () => {
      await workspace.saveSession();
      return {};
    });
    return () => off.forEach((unsubscribe) => unsubscribe());
  }, [app, workspace, openFiles, t]);

  // The window title names the file; the desktop asks before closing while anything is unsaved.
  const anyDirty = dirtyTabs.length > 0;
  const title = tab === null ? t('empty.title') : `${workspace.isDirty(tab) ? '• ' : ''}${tab.name}`;
  useEffect(() => {
    void app.window.setTitle(title.slice(0, 200)).catch(() => undefined);
  }, [app, title]);
  useEffect(() => {
    void app.window.setDirty(anyDirty).catch(() => undefined);
  }, [app, anyDirty]);

  // Shortcuts the browser leaves to pages; Ctrl+N, Ctrl+W and Ctrl+Tab belong to the browser.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      let run: (() => void) | null = null;
      if (ctrl && !event.altKey && key === 's') {
        run = () => void save(workspace.active, event.shiftKey);
      } else if (ctrl && !event.altKey && !event.shiftKey && key === 'o') {
        run = () => void pick();
      } else if (event.altKey && !ctrl && key === 'n') {
        run = () => workspace.newFile();
      } else if (event.altKey && !ctrl && key === 'w') {
        run = () => workspace.active !== null && requestClose(workspace.active);
      } else if (event.altKey && !ctrl && !event.shiftKey && event.key === 'PageDown') {
        run = () => workspace.cycle(1);
      } else if (event.altKey && !ctrl && !event.shiftKey && event.key === 'PageUp') {
        run = () => workspace.cycle(-1);
      }
      if (run !== null) {
        event.preventDefault();
        event.stopPropagation();
        run();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [workspace, save, pick, requestClose]);

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setDropping(false);
    for (const file of [...event.dataTransfer.files]) {
      try {
        await workspace.openLocal(file);
      } catch (error) {
        await report(error);
      }
    }
  };

  const hexLabels: HexLabels = useMemo(
    () => ({
      grid: t('hex.grid', { name: tab?.name ?? '' }),
      offset: t('hex.offset'),
      goTo: t('hex.goTo'),
      goToPlaceholder: t('hex.goToPlaceholder'),
      insert: t('hex.insert'),
      overwrite: t('hex.overwrite'),
      littleEndian: t('hex.littleEndian'),
      bigEndian: t('hex.bigEndian'),
      bytes: (count) => t('hex.bytes', { count }),
      selected: (count) => t('hex.selected', { count }),
      readOnly: t('hex.readOnly'),
      end: t('hex.end'),
    }),
    [t, tab?.name, locale],
  );

  // The status bar follows the cursor once per frame, not once per transaction.
  const cursorFrame = useRef(0);
  const onCursor = useCallback((line: number, column: number, selected: number) => {
    cancelAnimationFrame(cursorFrame.current);
    cursorFrame.current = requestAnimationFrame(() => setCursor({ line, column, selected }));
  }, []);
  const openUrl = useCallback((url: string) => void app.openUrl(url).catch(report), [app, report]);

  const resolvePending = async (choice: 'save' | 'discard' | 'cancel') => {
    const current = pending;
    setPending(null);
    if (current === null || choice === 'cancel') {
      return;
    }
    if (current.kind === 'closeTab') {
      if (choice === 'save' && !(await save(current.tab))) {
        return;
      }
      workspace.close(current.tab.id);
      return;
    }
    if (choice === 'save') {
      for (const each of workspace.tabs.filter((candidate) => workspace.isDirty(candidate))) {
        workspace.activate(each.id);
        if (!(await save(each))) {
          return;
        }
      }
    }
    await app.window.setDirty(false);
    await app.window.close();
  };

  const isMarkdown = tab?.mode === 'text' && tab.language === 'markdown';

  return (
    <div
      className={`editor-app${compact ? ' is-compact' : ''}`}
      style={{ '--editor-font-size': `${String(settings.fontSize)}px` } as React.CSSProperties}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setDropping(false);
        }
      }}
      onDrop={(event) => void onDrop(event)}
    >
      <div className="toolbar" role="toolbar" aria-label={t('app.toolbar')}>
        <div className="toolbar__group">
          <Button variant="quiet" size="sm" onPress={() => workspace.newFile()}>
            <IconPlus size={16} aria-hidden />
            {!compact && t('app.new')}
          </Button>
          <MenuTrigger>
            <IconButton label={t('app.newAs')} variant="quiet" size="sm">
              <IconChevronDown size={14} />
            </IconButton>
            <MenuPopover>
              <Menu onAction={(id) => workspace.newFile(String(id))} aria-label={t('app.newAs')}>
                {languages.map((language) => (
                  <MenuItem key={language.id} id={language.id}>
                    {language.label}
                  </MenuItem>
                ))}
              </Menu>
            </MenuPopover>
          </MenuTrigger>
          <Button variant="quiet" size="sm" onPress={() => void pick()} isDisabled={!mayRead}>
            <IconFolderOpen size={16} aria-hidden />
            {!compact && t('app.open')}
          </Button>
          <Button
            variant="quiet"
            size="sm"
            onPress={() => void save(tab, readOnly)}
            isDisabled={tab === null || tab.saving || !mayWrite}
          >
            <IconDeviceFloppy size={16} aria-hidden />
            {!compact && t('app.save')}
          </Button>
        </div>
        {isMarkdown && (
          <div className="segmented" role="radiogroup" aria-label={t('markdown.views')}>
            {MARKDOWN_VIEWS.filter((view) => !(compact && view === 'split')).map((view) => (
              <button
                key={view}
                type="button"
                role="radio"
                aria-checked={tab.markdownView === view || (compact && view === 'edit' && tab.markdownView === 'split')}
                onClick={() => workspace.setMarkdownView(tab, view)}
              >
                {t(`markdown.${view}`)}
              </button>
            ))}
          </div>
        )}
        <div className="toolbar__spacer" />
        <div className="toolbar__group">
          {tab !== null && (
            <IconButton
              label={tab.mode === 'hex' ? t('app.text') : t('app.hex')}
              variant="quiet"
              size="sm"
              onPress={() => toggleHex(tab)}
            >
              {tab.mode === 'hex' ? <IconFileText size={18} /> : <IconBinary size={18} />}
            </IconButton>
          )}
          <MenuTrigger>
            <IconButton label={t('app.more')} variant="quiet" size="sm">
              <IconDots size={18} />
            </IconButton>
            <MenuPopover placement="bottom end">
              <Menu
                aria-label={t('app.more')}
                onAction={(id) => {
                  const view = workspace.view;
                  switch (id) {
                    case 'saveAs':
                      void save(tab, true);
                      break;
                    case 'find':
                      if (view !== null) {
                        openSearchPanel(view);
                      }
                      break;
                    case 'goto':
                      if (view !== null) {
                        gotoLine(view);
                      }
                      break;
                    case 'wrap':
                      persistSettings({ ...settings, wrap: !settings.wrap });
                      break;
                    case 'tab2':
                    case 'tab4':
                    case 'tab8':
                      persistSettings({ ...settings, tabSize: Number(String(id).slice(3)) });
                      break;
                    case 'larger':
                      persistSettings({ ...settings, fontSize: Math.min(28, settings.fontSize + 1) });
                      break;
                    case 'smaller':
                      persistSettings({ ...settings, fontSize: Math.max(10, settings.fontSize - 1) });
                      break;
                  }
                }}
              >
                <MenuItem id="saveAs" shortcut="Ctrl+Shift+S" isDisabled={tab === null || !mayWrite}>
                  {t('app.saveAs')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem id="find" shortcut="Ctrl+F" isDisabled={tab?.mode !== 'text'}>
                  {t('app.find')}
                </MenuItem>
                <MenuItem id="goto" shortcut="Ctrl+Alt+G" isDisabled={tab?.mode !== 'text'}>
                  {t('app.goToLine')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem id="wrap">{`${settings.wrap ? '✓ ' : ''}${t('app.wrap')}`}</MenuItem>
                {[2, 4, 8].map((size) => (
                  <MenuItem key={size} id={`tab${String(size)}`}>
                    {`${settings.tabSize === size ? '✓ ' : ''}${t('app.tabSize', { size })}`}
                  </MenuItem>
                ))}
                <MenuSeparator />
                <MenuItem id="larger">{t('app.fontLarger')}</MenuItem>
                <MenuItem id="smaller">{t('app.fontSmaller')}</MenuItem>
              </Menu>
            </MenuPopover>
          </MenuTrigger>
        </div>
      </div>

      {workspace.tabs.length > 0 && (
        <div className="tabbar" role="tablist" aria-label={t('tabs.label')}>
          {workspace.tabs.map((each) => {
            const dirty = workspace.isDirty(each);
            return (
              <div
                key={each.id}
                className={`tab${each.id === workspace.activeId ? ' is-active' : ''}`}
                role="tab"
                aria-selected={each.id === workspace.activeId}
                tabIndex={each.id === workspace.activeId ? 0 : -1}
                title={each.name}
                onMouseDown={(event) => {
                  if (event.button === 1) {
                    event.preventDefault();
                    requestClose(each);
                  }
                }}
                onClick={() => workspace.activate(each.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                    const delta = event.key === 'ArrowRight' ? 1 : -1;
                    if (event.altKey) {
                      workspace.move(each.id, delta);
                    } else {
                      workspace.cycle(delta);
                    }
                    event.preventDefault();
                  } else if (event.key === 'Delete') {
                    requestClose(each);
                  }
                }}
              >
                {each.mode === 'hex' ? <IconBinary size={14} aria-hidden /> : <IconFileText size={14} aria-hidden />}
                <span className="tab__name">{each.name}</span>
                {dirty && <span className="tab__dirty" role="img" aria-label={t('tabs.unsaved')} />}
                <button
                  type="button"
                  className="tab__close"
                  aria-label={t('tabs.close', { name: each.name })}
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    requestClose(each);
                  }}
                >
                  <IconX size={12} />
                </button>
              </div>
            );
          })}
          <IconButton label={t('tabs.add')} variant="quiet" size="sm" onPress={() => workspace.newFile()}>
            <IconPlus size={14} />
          </IconButton>
        </div>
      )}

      {notice !== null && (
        <div className="notice" role="status">
          <span>{notice.text}</span>
          {notice.action !== undefined && (
            <Button size="sm" variant="secondary" onPress={notice.action.run}>
              {notice.action.label}
            </Button>
          )}
          <IconButton label={t('notice.dismiss')} size="sm" variant="quiet" onPress={() => setNotice(null)}>
            <IconX size={14} />
          </IconButton>
        </div>
      )}
      {tab?.mode === 'hex' && tab.binaryReason !== null && (
        <div className="notice notice--info" role="status">
          {t(tab.binaryReason === 'nul' ? 'hex.binaryNul' : 'hex.binaryEncoding')}
        </div>
      )}

      <main className="content">
        {tab === null && (
          <div className="empty">
            <IconFileText size={48} stroke={1.25} aria-hidden />
            <h1>{t('empty.title')}</h1>
            <p>{t('empty.body')}</p>
            <div className="empty__actions">
              <Button variant="primary" onPress={() => workspace.newFile()}>
                {t('app.new')}
              </Button>
              <Button variant="secondary" onPress={() => void pick()} isDisabled={!mayRead}>
                {t('app.open')}
              </Button>
            </div>
          </div>
        )}
        {tab?.mode === 'text' && (
          <TextView
            workspace={workspace}
            tab={tab}
            compact={compact}
            labels={{ editor: t('editor.label', { name: tab.name }), preview: t('markdown.previewLabel') }}
            openUrl={openUrl}
            onCursor={onCursor}
          />
        )}
        {tab?.mode === 'hex' && tab.hex !== null && (
          <Suspense>
            <HexView
              key={tab.id}
              buffer={tab.hex}
              readOnly={readOnly || !mayWrite}
              labels={hexLabels}
              onChange={() => workspace.changed()}
              copyText={(text) => void app.clipboard.writeText(text).catch(() => undefined)}
            />
          </Suspense>
        )}
        {dropping && <div className="dropzone">{t('empty.drop')}</div>}
      </main>

      {tab !== null && (
        <footer className="statusbar" aria-label={t('status.label')}>
          {tab.mode === 'text' && (
            <span className="statusbar__item">
              {t('status.position', cursor)}
              {cursor.selected > 0 && ` · ${t('status.selected', { count: cursor.selected })}`}
            </span>
          )}
          {readOnly && (
            <span className="statusbar__item statusbar__badge" title={t('status.readOnly')}>
              {t('tabs.readOnly')}
            </span>
          )}
          <span className="toolbar__spacer" />
          {tab.mode === 'text' && (
            <>
              <select
                aria-label={t('status.language')}
                value={tab.language}
                onChange={(event) => workspace.setLanguage(tab, event.target.value)}
              >
                {languages.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.label}
                  </option>
                ))}
              </select>
              <select
                aria-label={t('status.eol')}
                value={tab.eol === '\n' ? 'lf' : 'crlf'}
                onChange={(event) => workspace.setEol(tab, event.target.value === 'lf' ? '\n' : '\r\n')}
              >
                <option value="lf">LF</option>
                <option value="crlf">CRLF</option>
              </select>
              <select
                aria-label={t('status.encoding')}
                value={tab.bom ? 'bom' : 'utf8'}
                onChange={(event) => workspace.setBom(tab, event.target.value === 'bom')}
              >
                <option value="utf8">{t('status.utf8')}</option>
                <option value="bom">{t('status.utf8bom')}</option>
              </select>
            </>
          )}
        </footer>
      )}

      <Dialog
        title={
          pending?.kind === 'closeTab'
            ? t('dialog.closeTitle', { name: pending.tab.name })
            : t('dialog.windowTitle', { count: dirtyTabs.length })
        }
        role="alertdialog"
        isOpen={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
          }
        }}
        actions={
          <>
            <Button variant="secondary" onPress={() => void resolvePending('cancel')}>
              {t('dialog.cancel')}
            </Button>
            <Button variant="danger" onPress={() => void resolvePending('discard')}>
              {pending?.kind === 'closeWindow' ? t('dialog.discard') : t('dialog.dontSave')}
            </Button>
            <Button variant="primary" onPress={() => void resolvePending('save')} isDisabled={!mayWrite}>
              {pending?.kind === 'closeWindow' ? t('dialog.saveAll') : t('dialog.save')}
            </Button>
          </>
        }
      >
        {pending?.kind === 'closeWindow' ? (
          <ul className="dialog-list">
            {dirtyTabs.map((each) => (
              <li key={each.id}>{each.name}</li>
            ))}
          </ul>
        ) : (
          t('dialog.closeBody')
        )}
      </Dialog>
    </div>
  );
}
