// Config Vite du front LedgerPass. Lancé depuis la racine : `vite web` (root = web/).
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const API = process.env.LEDGERPASS_API || 'http://127.0.0.1:3000'; // l'API n'écoute que sur 127.0.0.1 par défaut

export default defineConfig({
  root: here,
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/metadata': { target: API, changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/metadata': { target: API, changeOrigin: true },
    },
  },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
        scan: resolve(here, 'scan.html'),
      },
    },
  },
});
