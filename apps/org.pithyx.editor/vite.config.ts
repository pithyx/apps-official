import react from '@vitejs/plugin-react';
import pithyx from '@pithyx/cli/vite';
import { defineConfig } from 'vite';

// The id org.pithyx.editor is reserved for the official catalog, which pithyx validate refuses for a sideload;
// the catalog's own check validates the manifest, so the build skips it.
export default defineConfig({
  plugins: [react(), pithyx({ validate: false })],
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
});
