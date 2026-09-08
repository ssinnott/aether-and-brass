// Before/after review sheets: the same rigs, in the same pose, rendered by TWO OR MORE git refs into one labelled
// PNG. This is the instrument the sprite-quality pass is judged with — "looks calmer" is an argument, a sheet with
// the old renderer on one row and the new one below it is evidence.
//
//   NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//     node tools/compare.js <ref> <ref> [<ref>...] [options]
//
//   node tools/compare.js main WORKTREE --subject=brunhild,stormcrow:bosun
//   node tools/compare.js main HEAD --pick=idle:0,walk:4,attack1:hit --zoom=6      one PNG per pick
//   node tools/compare.js main HEAD --view=normal,edges,squint                     one PNG per view
//   node tools/compare.js main HEAD --head --zoom=10 --cell=42x40                  head framing
//
// WORKTREE (or '.') is the files on disk right now — the form used while iterating, and the only one that works
// before the change is committed. Every other ref is anything `git rev-parse` accepts.
//
// Each ref's src/ is extracted with `git archive <sha>:src` into tools/.compare/<sha12>/src (content-addressed, so
// a repeat run is free) because tools/server.js only serves paths under the repo root. The page then dynamically
// imports one module graph per ref; ES module identity is keyed by URL, so the trees stay independent.
//
// Exit code: 1 if the page errored, or if a subject resolved to a DIFFERENT rig in different refs. That last case
// is the trap this tool exists to not fall into: getEnemyDef / getCharacter never throw, they substitute the Tin
// Footman / Brunhild, so comparing against a ref that predates a rig renders two different characters and reads as
// "the pass changed everything".
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from './server.js';
import { collectSubjects, filterSubjects } from './art-invariants/subjects.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAP = path.join(ROOT, 'tools', '.compare');
const DEFAULT_CAST = 'brunhild,rook,sootborn:cutthroat,chandler:wickboy,brassbound:sapper,stormcrow:bosun';

const USAGE = `Usage: node tools/compare.js <ref> <ref> [<ref>...] [options]

  <ref>                two or more refs, in row order (top row first). WORKTREE (or .) = the files on disk now.

  --subject=<sel,...>  columns, in the order given. An id (sootborn:cutthroat), a character id (brunhild),
                       a faction prefix (stormcrow), a kind (character) or a class (boss).
                       default: ${DEFAULT_CAST}
  --pick=<a:b,...>     animation and frame: idle:0, walk:6, attack1:hit. A list renders one PNG per pick.
  --view=<v,...>       normal | edges | squint (default normal). A list renders one PNG per view.
  --zoom=<n>           integer nearest-neighbour magnification (default 6)
  --cell=<w>x<h>       cell size in game pixels (default 84x104; the head sheets use 42x40)
  --feet=<n>           floor line, px above the cell bottom (default 12)
  --head               frame on the head instead of the whole body
  --facing=<1|-1>      default 1
  --bg=<#hex>          cell background (default #3a3446)
  --tick=<n>           pin rig.tick before the final draw so blinks are in phase across rows (default 0)
  --still              do not step secondary-motion chains
  --label=<a|b|...>    row labels, '|'-separated (default: '<ref> <shortsha>')
  --out=<path>         output PNG (default tools/screens/compare-<refs>[-<pick>][-<view>].png)
  --keep               keep tools/.compare/ after the run
  --fresh              re-extract even when a snapshot for that sha exists
  --json               print { out, cells, substitutions } instead of the human summary
  --help               this text

Environment: NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`;

// ---------------------------------------------------------------------------- args
function parseArgs(argv) {
  const o = {
    refs: [], subject: [], pick: [], view: [], zoom: 6, cell: '84x104', feet: 12, head: false, facing: 1,
    bg: '#3a3446', tick: 0, still: false, label: '', out: '', keep: false, fresh: false, json: false, help: false, bad: [],
  };
  for (const a of argv) {
    if (!a.startsWith('-')) { o.refs.push(a); continue; }
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) { o.bad.push(a); continue; }
    const [, k, v] = m;
    if (k === 'head' || k === 'still' || k === 'keep' || k === 'fresh' || k === 'json' || k === 'help') o[k] = true;
    else if (k === 'subject' || k === 'pick' || k === 'view') o[k].push(...String(v || '').split(',').map((s) => s.trim()).filter(Boolean));
    else if (k === 'zoom' || k === 'feet' || k === 'tick' || k === 'facing') o[k] = Number(v);
    else if (k === 'cell' || k === 'bg' || k === 'label' || k === 'out') o[k] = String(v || '');
    else o.bad.push(a);
  }
  if (!o.pick.length) o.pick = ['idle:0'];
  if (!o.view.length) o.view = ['normal'];
  if (!o.subject.length) o.subject = DEFAULT_CAST.split(',');
  return o;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) { console.log(USAGE); process.exit(0); }
if (opts.bad.length) { console.error(`unknown option(s): ${opts.bad.join(' ')}\n\n${USAGE}`); process.exit(2); }
if (opts.refs.length < 2) { console.error(`need at least two refs\n\n${USAGE}`); process.exit(2); }
if (opts.refs.length > 6) { console.error('at most six refs (the sheet stops being readable)'); process.exit(2); }
if (!Number.isInteger(opts.zoom) || opts.zoom < 1) { console.error('--zoom must be a positive integer: a fractional zoom gives unevenly wide sprite pixels, and judging 1 px outlines is the point'); process.exit(2); }
const cellM = /^(\d+)x(\d+)$/.exec(opts.cell);
if (!cellM) { console.error('--cell must look like 84x104'); process.exit(2); }
const CELL_W = Number(cellM[1]), CELL_H = Number(cellM[2]);

// ---------------------------------------------------------------------------- refs
/** Resolve a ref to { ref, sha, slug }. WORKTREE / . means the files on disk (git archive cannot read those). */
function resolveRef(ref) {
  if (ref === 'WORKTREE' || ref === '.') return { ref: 'WORKTREE', sha: 'worktree', slug: 'worktree', short: 'worktree' };
  const r = spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { console.error(`unknown ref '${ref}': ${(r.stderr || '').trim()}`); process.exit(2); }
  const sha = r.stdout.trim();
  return { ref, sha, slug: sha.slice(0, 12), short: sha.slice(0, 7) };
}

/** Materialise one ref's src/ under tools/.compare/<slug>/src. `.ok` marks a complete extract. */
async function snapshot(r) {
  const dir = path.join(SNAP, r.slug), src = path.join(dir, 'src'), ok = path.join(dir, '.ok');
  if (r.slug === 'worktree') {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(src, { recursive: true });
    fs.cpSync(path.join(ROOT, 'src'), src, { recursive: true });
    fs.writeFileSync(ok, '');
    return dir;
  }
  if (!opts.fresh && fs.existsSync(ok)) return dir;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(src, { recursive: true });
  await new Promise((res, rej) => {
    const arc = spawn('git', ['archive', '--format=tar', `${r.sha}:src`], { cwd: ROOT });
    const tar = spawn('tar', ['-x', '-C', src]);
    let err = '';
    arc.stderr.on('data', (d) => { err += d; });
    arc.on('error', rej); tar.on('error', rej);
    arc.stdout.pipe(tar.stdin);
    tar.on('close', (c) => (c === 0 && !err ? res() : rej(new Error(`git archive ${r.sha}:src -> ${err.trim() || 'tar exit ' + c}`))));
  });
  fs.writeFileSync(ok, '');
  return dir;
}

// ---------------------------------------------------------------------------- subjects
// Registry order is not review order (the reviewed sheets deliberately lead with the worst offender), so expand
// selector by selector and keep first-seen order. Subjects are enumerated from the WORKING TREE on purpose: it is
// the only tree whose registry this process can import.
const all = collectSubjects();
const seen = new Set(), cols = [];
for (const sel of opts.subject) {
  const hit = filterSubjects(all, [sel]);
  if (!hit.length) { console.error(`--subject=${sel} matched no rig`); process.exit(2); }
  for (const s of hit) if (!seen.has(s.id)) { seen.add(s.id); cols.push(s); }
}
const phases = cols.filter((s) => s.kind === 'boss-phase');
const usable = cols.filter((s) => s.kind !== 'boss-phase');
if (phases.length) console.log(`note: skipping ${phases.length} boss-phase subject(s) (${phases.map((s) => s.id).join(', ')}) — getEnemyDef resolves the base rig, so they would render phase 0 in every row`);
if (!usable.length) { console.error('no renderable subjects left'); process.exit(2); }
const specs = usable.map((s) => (s.kind === 'character' ? `char:${s.id}` : `enemy:${s.type}:${s.variant}`));

// ---------------------------------------------------------------------------- run
const refs = opts.refs.map(resolveRef);
const labels = opts.label ? opts.label.split('|') : refs.map((r) => `${r.ref} ${r.short}`);

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const c of ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright']) { try { return require(c); } catch { /* next */ } }
  throw new Error('Playwright not found (set NODE_PATH to the global node_modules)');
}

let cleanup = () => { if (!opts.keep) fs.rmSync(SNAP, { recursive: true, force: true }); };
process.on('exit', () => cleanup());

for (const r of refs) {
  try {
    await snapshot(r);
  } catch (e) {
    console.error(`cannot snapshot '${r.ref}': ${(e && e.message) || e}`);
    console.error("(a ref with no src/ tree cannot be compared — check it is a commit from this project's history)");
    process.exit(2);
  }
}

const { chromium } = loadPlaywright();
const server = createServer();
await new Promise((res) => server.listen(0, res));
const port = server.address().port;
const browser = await chromium.launch();
// deviceScaleFactor 1, or every PNG comes back at 2x and the pixel grid being inspected is a lie
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

const outDir = path.join(ROOT, 'tools', 'screens');
fs.mkdirSync(outDir, { recursive: true });
const slug = (s) => String(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
const jobs = [];
for (const pick of opts.pick) for (const view of opts.view) jobs.push({ pick, view });

const results = [];
let failed = false;
for (const job of jobs) {
  const params = new URLSearchParams({
    refs: refs.map((r) => r.slug).join(','), titles: labels.join('|'), who: specs.join(','),
    pick: job.pick, zoom: String(opts.zoom), cw: String(CELL_W), ch: String(CELL_H), feet: String(opts.feet),
    bg: opts.bg, facing: String(opts.facing), view: job.view, tick: String(opts.tick),
  });
  if (opts.head) params.set('head', '1');
  if (opts.still) params.set('still', '1');
  pageErrors.length = 0;
  await page.goto(`http://localhost:${port}/tools/compare.html?${params}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__cmp && window.__cmp.ready, null, { timeout: 120000 });
  const info = await page.evaluate(() => ({ error: window.__cmp.error, w: window.__cmp.w, h: window.__cmp.h, cells: window.__cmp.cells }));
  if (info.error) {
    console.error(`RENDER FAILED (${job.pick} ${job.view}): ${info.error}`);
    if (pageErrors.length) console.error(pageErrors.join('\n'));
    failed = true;
    continue;
  }

  // --- substitution guard: did every ref resolve the same rig for a column? ---
  const subs = [];
  for (const c of info.cells) {
    const p = c.spec.split(':');
    const wrong = p[0] === 'char' ? c.id !== p[1] : (c.type !== p[1] || c.variant !== p[2]);
    if (wrong) subs.push({ ...c, why: `resolved to ${c.type || 'char'}:${c.variant || c.id}` });
  }
  const byCol = new Map();
  for (const c of info.cells) {
    if (!byCol.has(c.col)) byCol.set(c.col, new Set());
    byCol.get(c.col).add(`${c.type}:${c.variant}:${c.id}`);
  }
  for (const [col, set] of byCol) {
    if (set.size > 1 && !subs.some((s) => s.col === col)) {
      for (const c of info.cells.filter((x) => x.col === col)) subs.push({ ...c, why: 'rows disagree on which rig this column is' });
    }
  }
  if (subs.length) {
    failed = true;
    for (const s of subs) await page.evaluate(([r, c]) => window.__cmpMark(r, c), [s.row, s.col]);
  }

  const suffix = [jobs.length > 1 || opts.pick[0] !== 'idle:0' ? slug(job.pick) : '', job.view !== 'normal' ? job.view : ''].filter(Boolean).join('-');
  const base = opts.out
    ? (jobs.length > 1 ? opts.out.replace(/\.png$/i, '') + (suffix ? '-' + suffix : '') + '.png' : opts.out)
    : path.join(outDir, `compare-${refs.map((r) => slug(r.short)).join('-')}${suffix ? '-' + suffix : ''}.png`);
  const file = path.resolve(ROOT, base);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const el = await page.$('#sheet');
  await el.screenshot({ path: file });
  results.push({ out: path.relative(ROOT, file), pick: job.pick, view: job.view, w: info.w, h: info.h, cells: info.cells.length, substitutions: subs });
  if (!opts.json) {
    console.log(`wrote ${path.relative(ROOT, file)}  ${info.w}x${info.h}  ${refs.length} refs x ${specs.length} subjects  (${job.pick}, ${job.view})`);
    for (const s of subs) console.log(`  SUBSTITUTED  row ${s.row} (${labels[s.row]}) col ${s.col} asked ${s.spec}: ${s.why}`);
  }
  if (pageErrors.length) { console.error(pageErrors.join('\n')); failed = true; }
}

await browser.close();
server.close();
cleanup(); cleanup = () => {};

if (opts.json) console.log(JSON.stringify({ refs: refs.map((r) => ({ ref: r.ref, sha: r.sha })), subjects: specs, results }, null, 2));
process.exit(failed ? 1 : 0);
