// Bundle src/main.js into self-contained pages (no external references).
//   dist/index.html    a complete standalone HTML file (open from disk or serve anywhere)
//   dist/artifact.html the same page as body-content only (no doctype/html/head/body wrapper),
//                      for hosts that supply their own document skeleton
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'dist');
fs.mkdirSync(OUT_DIR, { recursive: true });

const result = await build({
  entryPoints: [path.join(ROOT, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: false,
  legalComments: 'none',
  write: false,
  logLevel: 'error',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// Inline stylesheets.
html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (m, href) => {
  const file = path.join(ROOT, href);
  return fs.existsSync(file) ? `<style>\n${fs.readFileSync(file, 'utf8')}\n</style>` : m;
});
// Replace the module entry with the bundled script.
const tagRe = /<script[^>]*type=["']module["'][^>]*src=["'][^"']*main\.js["'][^>]*>\s*<\/script>/i;
if (!tagRe.test(html)) throw new Error('index.html: could not find <script type="module" src="src/main.js"> to inline');
html = html.replace(tagRe, () => `<script>\n${js}\n</script>`);
if (/src=["'](\.\/)?src\//.test(html)) throw new Error('dist/index.html still references src/');

fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
console.log(`built dist/index.html (${(html.length / 1024).toFixed(0)} KB)`);

// ---- body-only variant -------------------------------------------------
// Keep <title> and <style> from the head (hosts that wrap us still read a leading <title>),
// then everything inside <body>, plus a focus helper so keyboard input works inside an iframe.
const title = (html.match(/<title>[\s\S]*?<\/title>/i) || [''])[0];
const styles = (html.match(/<style>[\s\S]*?<\/style>/gi) || []).join('\n');
const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, ''])[1];
const focusHelper = `<script>
  // Keyboard input needs the frame focused; take focus on load and on any pointer press.
  (function () {
    var c = document.getElementById('game');
    function grab() { try { window.focus(); if (c) c.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    grab();
    window.addEventListener('load', grab);
    document.addEventListener('pointerdown', grab);
  })();
</script>`;
const artifact = `${title}\n${styles}\n<style>\n  /* The host supplies the document skeleton, so paint our own ground and fill it. */\n  :root { color-scheme: dark; }\n  html, body { background: #000; }\n  body { min-height: 100vh; }\n</style>\n${body.trim()}\n${focusHelper}\n`;
fs.writeFileSync(path.join(OUT_DIR, 'artifact.html'), artifact);
console.log(`built dist/artifact.html (${(artifact.length / 1024).toFixed(0)} KB)`);
