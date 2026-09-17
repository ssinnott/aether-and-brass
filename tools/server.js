// Zero-dependency static file server for development and headless tests.
// Usage: node tools/server.js [port]   (default 8080)
import http from 'node:http';
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pwaAssets, MANIFEST_PATH, SW_PATH, ICONS } from './pwa.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  // Served transformed, never raw: see transformTs below.
  '.ts': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

// The installable-app files have no copy on disk (they are generated, and two of them are images
// in a repository that holds none). Render them once, on the first request, so `npm run dev` can
// be installed to a phone exactly like the deployed site — with the dev worker, which never caches.
const PWA_PATHS = new Set([MANIFEST_PATH, SW_PATH, ...ICONS.map((i) => i.path)]);
/** @type {Map<string, Buffer>|null} */
let pwa = null;
/** @returns {Buffer|null} bytes for a generated path, or null if this is not one. */
function generated(pathname) {
  const rel = pathname.replace(/^\/+/, '');
  if (!PWA_PATHS.has(rel)) return null;
  // A throw in here would take the server down from inside a request callback, and a dev server
  // that cannot render an icon should still serve the game.
  try { if (!pwa) pwa = pwaAssets(fs.readFileSync(path.join(ROOT, 'index.html')), { dev: true }); } catch { return null; }
  return pwa.get(rel) || null;
}

/**
 * Strip the types out of one module and hand back JavaScript.
 *
 * Import specifiers are left exactly as written, so the JS returned here still says
 * `from './game/world.ts'`. The browser requests THAT path, it lands back in this server, and it is
 * transformed the same way -- the served module graph closes on itself. That is what keeps
 * edit-and-reload working with no watcher and no output directory between saving a file and
 * reloading the page. transformSync is sub-millisecond per file.
 */
function transformTs(source, file) {
  const { code } = transformSync(source.toString('utf8'), {
    loader: 'ts', format: 'esm', target: 'es2022',
    sourcefile: path.relative(ROOT, file),
    sourcemap: 'inline',   // the browser debugger shows the .ts source, with no extra request
  });
  return Buffer.from(code, 'utf8');
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(file, (err, onDisk) => {
      const data = err ? generated(pathname) : onDisk;
      if (!data) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found: ' + pathname); return; }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Content-Length': data.length,
      });
      res.end(data);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => console.log(`Aether & Brass dev server: http://localhost:${PORT}/`));
}
