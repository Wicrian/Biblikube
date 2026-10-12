import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

// `base: './'` permet d'héberger l'application n'importe où
// (GitHub Pages, sous-dossier d'un serveur, clé USB…).
export default defineConfig({
  base: './',
  plugins: [react()],
  // Numéro de version affiché dans l'application (bas de la FAQ).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: { environment: 'node' },
});
