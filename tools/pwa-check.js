// Gate for the installable-app layer: everything the page links must actually be in dist/, and
// everything the worker precaches must actually be there to cache. None of it is imported by the
// game, so nothing else would notice a broken manifest, a missing icon or a worker that installs a
// file that no longer exists — the failure would be a phone that silently refuses to install, or
// an installed copy stuck on a cached page it can never replace.
//
//   node tools/pwa-check.js            check ./dist (run `npm run build` first)
//   node tools/pwa-check.js <dir>      check another directory (CI checks the assembled _site)
//
// Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { ICONS, MANIFEST_PATH, SW_PATH, PRECACHE } from './pwa.js';

const DIR = path.resolve(process.argv[2] || 'dist');
const problems = [];
const fail = (msg) => problems.push(msg);
const read = (rel) => {
  const file = path.join(DIR, rel);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
};

/** Width and height out of a PNG's IHDR, or null if this is not a PNG. */
function pngSize(buf) {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf || buf.length < 24 || !buf.subarray(0, 8).equals(SIG)) return null;
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// ---- the page ----------------------------------------------------------
const html = read('index.html');
if (!html) fail('index.html is missing — run `npm run build` first');
else {
  const page = html.toString('utf8');
  for (const ref of [`href="${MANIFEST_PATH}"`, 'href="icons/icon-32.png"', 'href="icons/icon-180.png"', `register('${SW_PATH}')`]) {
    if (!page.includes(ref)) fail(`index.html no longer contains ${ref} — the page and tools/pwa.js have drifted apart`);
  }
}

// The embed build must stay free of the app layer: it lives inside somebody else's document, where
// registering a worker would claim a scope that is not ours.
const artifact = read('artifact.html');
if (artifact) {
  const page = artifact.toString('utf8');
  if (page.includes('serviceWorker')) fail('artifact.html registers a service worker; keep that script in the <head>, which the body-only build drops');
  if (page.includes(MANIFEST_PATH)) fail(`artifact.html links ${MANIFEST_PATH}; the embed build must not claim an app scope`);
}

// ---- the manifest ------------------------------------------------------
const manifestBytes = read(MANIFEST_PATH);
if (!manifestBytes) fail(`${MANIFEST_PATH} is missing`);
else {
  let manifest = null;
  try { manifest = JSON.parse(manifestBytes.toString('utf8')); } catch (e) { fail(`${MANIFEST_PATH} is not valid JSON: ${e.message}`); }
  if (manifest) {
    for (const key of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons', 'background_color']) {
      if (!manifest[key]) fail(`${MANIFEST_PATH} has no ${key}`);
    }
    if (manifest.orientation !== 'landscape') fail(`${MANIFEST_PATH} orientation is ${manifest.orientation}; a 640x360 game installs landscape`);
    // Published under /aether-and-brass/, so an absolute URL would scope the app to the domain root.
    for (const key of ['start_url', 'scope', 'id']) {
      if (manifest[key] && !String(manifest[key]).startsWith('.')) fail(`${MANIFEST_PATH} ${key} is "${manifest[key]}"; it must be relative for a project-path deploy`);
    }
    const declared = new Set((manifest.icons || []).map((i) => i.src));
    for (const icon of ICONS) {
      if (!declared.has(icon.path)) fail(`${MANIFEST_PATH} does not list ${icon.path}`);
    }
    for (const icon of manifest.icons || []) {
      const size = pngSize(read(icon.src));
      if (!size) { fail(`${icon.src} is missing or is not a PNG`); continue; }
      const [w, h] = String(icon.sizes).split('x').map(Number);
      if (size.w !== w || size.h !== h) fail(`${icon.src} is ${size.w}x${size.h} but the manifest says ${icon.sizes}`);
    }
    if (!(manifest.icons || []).some((i) => i.purpose === 'maskable')) fail(`${MANIFEST_PATH} has no maskable icon; Android will letterbox the emblem`);
  }
}

// ---- the worker --------------------------------------------------------
const swBytes = read(SW_PATH);
if (!swBytes) fail(`${SW_PATH} is missing`);
else {
  const sw = swBytes.toString('utf8');
  const version = (sw.match(/const VERSION = "([^"]*)"/) || [])[1];
  if (!version) fail(`${SW_PATH} declares no VERSION`);
  else if (version === 'dev') fail(`${SW_PATH} is the dev worker (it caches nothing); this build would never work offline`);
  for (const rel of PRECACHE) {
    if (!sw.includes(JSON.stringify(rel))) fail(`${SW_PATH} does not precache ${rel}`);
    if (!read(rel.replace(/^\.\//, ''))) fail(`${SW_PATH} precaches ${rel}, which is not in ${path.basename(DIR)}/`);
  }
}

if (problems.length) {
  console.error(`pwa-check: ${problems.length} problem(s) in ${DIR}`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`pwa-check: ${DIR} is installable (manifest, ${ICONS.length} icons, worker precaching ${PRECACHE.length} files)`);
