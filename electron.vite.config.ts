import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          popup: resolve(__dirname, 'src/renderer/popup.html'),
        },
      },
    },
  },
});
