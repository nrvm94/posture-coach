// Serves the built renderer from disk over app://bundle/ in production.
// A custom scheme (instead of file://) gives the page a secure origin for the camera
// and lets MediaPipe fetch its WASM and model files. The CSP blocks all network access.
import { protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

export const appUrl = (page: string): string => `app://bundle/${page}`;

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
].join('; ');

/** Must run before the app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

export function serveRenderer(rootDir: string): void {
  const root = normalize(rootDir + sep);
  protocol.handle('app', async (req) => {
    const pathname = decodeURIComponent(new URL(req.url).pathname);
    const file = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(root)) return new Response('Forbidden', { status: 403 });
    try {
      const body = await readFile(file);
      const ext = extname(file);
      const headers: Record<string, string> = { 'content-type': MIME[ext] ?? 'application/octet-stream' };
      if (ext === '.html') headers['content-security-policy'] = CSP;
      return new Response(new Uint8Array(body), { headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
