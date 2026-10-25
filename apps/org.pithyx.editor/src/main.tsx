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
import { App, DEFAULT_SETTINGS } from './App';
import de from './i18n/de.json';
import en from './i18n/en.json';
import { phrasesDe } from './phrases';
import { Workspace } from './workspace';

const app = await connect();
const i18n = createI18n(app, { en, de });
const phrases = () => (app.context.language === 'de' ? phrasesDe : {});

const workspace = new Workspace(app, DEFAULT_SETTINGS, phrases(), (n) => i18n.t('app.untitled', { n }));
app.on('localeChange', () => workspace.updatePhrases(phrases()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UiProvider locale={app.context.locale}>
      <App app={app} i18n={i18n} workspace={workspace} />
    </UiProvider>
  </StrictMode>,
);
// The window is ready once it painted; files keep loading in it with their own line.
requestAnimationFrame(() => void app.window.ready());
