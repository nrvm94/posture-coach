// Builds the browser version (published to GitHub Pages) from the same renderer code as the desktop app.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));
const SITE_URL = 'https://nrvm94.github.io/posture-coach/';
const DESCRIPTION = 'Your webcam checks your posture and nudges you when you slouch. Runs entirely in your browser: video never leaves your computer.';

// Same policy as the desktop app: the page may only load its own files, so nothing can be
// sent anywhere. This also blocks MediaPipe's built-in usage logging to Google.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
].join('; ');

function webPage(): Plugin {
  return {
    name: 'posture-coach-web-page',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
      { tag: 'meta', attrs: { name: 'description', content: DESCRIPTION }, injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'icon', type: 'image/png', href: './icon.png' }, injectTo: 'head' },
      // Link preview when the URL is shared on LinkedIn and elsewhere.
      { tag: 'meta', attrs: { property: 'og:title', content: 'Posture Coach' }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:description', content: DESCRIPTION }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:url', content: SITE_URL }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:image', content: `${SITE_URL}icon.png` }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:type', content: 'website' }, injectTo: 'head' },
    ],
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'icon.png', source: readFileSync(resolve(__dirname, 'build/icon.png')) });
    },
  };
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react(), webPage()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
  },
});
