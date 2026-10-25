import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-ext-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-ext-400.css';
import '@pithyx/ui/tokens.css';
import './styles.css';
import { connect } from '@pithyx/sdk';
import { createI18n } from '@pithyx/sdk/i18n';
import { UiProvider } from '@pithyx/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, DEFAULT_SETTINGS, type Settings } from './App';
import de from './i18n/de.json';
import en from './i18n/en.json';
import { phrasesDe } from './phrases';
import { Workspace } from './workspace';

const app = await connect();
const i18n = createI18n(app, { en, de });
const phrases = () => (app.context.language === 'de' ? phrasesDe : {});

let settings: Settings = DEFAULT_SETTINGS;
try {
  settings = { ...DEFAULT_SETTINGS, ...(await app.storage.get<Partial<Settings>>('settings')) };
} catch (error) {
  app.log.warn('Settings not loaded', { code: error instanceof Error ? error.message : 'unknown' });
}

const workspace = new Workspace(app, settings, phrases(), (n) => i18n.t('app.untitled', { n }));
app.on('localeChange', () => workspace.updatePhrases(phrases()));

// A reload brings back the tabs of this window; a file opened with the app from Files comes on top.
const lost = await workspace.restoreSession();
const launched = app.context.launch.file;
if (launched !== undefined) {
  try {
    await workspace.open(launched);
  } catch (error) {
    app.log.warn('Launch file not opened', { code: error instanceof Error ? error.message : 'unknown' });
  }
}
if (workspace.tabs.length === 0) {
  workspace.newFile();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UiProvider locale={app.context.locale}>
      <App app={app} i18n={i18n} workspace={workspace} initialSettings={settings} lostFiles={lost} />
    </UiProvider>
  </StrictMode>,
);
void app.window.ready();
