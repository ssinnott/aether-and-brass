// render tier: the four art invariants that genuinely need pixels or a real browser.
//
// Everything else in the ART_STYLE catalogue is cheaper (and quieter) as a data or geometry rule, so this tier is
// deliberately small and opt-in behind `node tools/art-check.js --render`. The runner owns the browser: it serves
// the repo with tools/server.js, opens one page whose baseURL is that server (the tools/sheet-capture.js pattern)
// and hands it to checkAll(). If Playwright cannot be loaded the runner turns that into a loud error finding with
// the NODE_PATH hint - this tier never passes quietly.
//
// HOW THE PIXELS ARE MADE. One navigation installs BOOTSTRAP into the page; it resolves a subject spec back to its
// def through the content registries (the page cannot receive the node-side def - it is full of functions), builds
// the rig, drives an AnimPlayer exactly the way tools/sheet.js does (play through once to warm the secondary-motion
// chains, then replay and step to the wanted key) and draws through drawRig into an offscreen canvas at 1x. All the
// per-pixel work happens in the page and only numbers cross the CDP boundary.
//
// CALIBRATION (every number below was measured on the 28 subjects before it was written down; ranges are in the
// rule comments). Two of the plan's proposed squint proxies - connected-component count and the "largest non-body
// component" weapon proxy - were measured to have NO separating power: reference rigs legitimately measure a single
// component (a paper-doll silhouette is connected by construction) and the weapon is part of that same blob. They
// are reported as metrics and are NOT asserted, because a bound that fires on sael, the halberdier, the sapper, the
// cutthroat and the hulk would be a wrong rule, not bad art.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { isReference } from '../subjects.js';

export const TIER = 'render';

/** Frames every pixel rule samples. walk#4 is the far-foot-forward key of the 8-key walk (ART_STYLE section 8). */
const IDLE = ['idle', 0];
const WALK = ['walk', 4];

/**
 * Within-faction silhouette IoU bound.
 * Measured (best of a +/-2 px translation search, idle#0 and walk#4, 1x and the 0.5x box-downsample):
 *   hero        max 0.673  (sael vs rook, idle#0)
 *   brassbound  max 0.745  (footman vs duelist, walk#4)   <- the "close but legal" pair the plan predicted
 *   sootborn    max 0.757  (cutthroat vs slinger, walk#4) <- the reference maximum
 * Reference maximum over both scales = 0.758. Bound = 0.758 + 0.03 = 0.79.
 * Control: stormcrow crimper/galewright 0.938, corsair/galewright 0.915, crimper/corsair 0.885 - well clear.
 */
const IOU_MAX = 0.79;

/**
 * Distinct 4-bit-quantised colours surviving the 0.5x downsample, inside the silhouette: the value ladder in pixels.
 * Measured over idle / walk / attack-hit of all 28 subjects: 81 (sootborn:slinger walk#4) .. 222 (midboss:grubbik).
 * Floor 78 sits just under the reference minimum. It is a regression guard, not a discriminator - the Stormcrows
 * measure 85..115 and are caught by render/silhouette-distinctness, not here. Warn severity, deliberately.
 */
const SQUINT_COLOURS_MIN = 78;

/**
 * Scale-normalised per-draw budget: this many times the slowest REFERENCE subject measured in the same run.
 * There is no checked-in millisecond number on purpose - SwiftShader throughput varies several-fold with the host.
 * Measured here (median of 3 x 300 draws, ms per draw divided by rig.scale^2): reference 0.32 (boss:vane, scale
 * 2.45) .. 1.14 (brunhild), controls 0.65 (midboss2:skree) .. 1.04 (stormcrow:galewright), so nothing is over the
 * 1.5x bound today - this rule is a cost regression guard, not a Stormcrow detector. Sanity check against
 * ART_STYLE section 9's stated points (sael 0.87, rook 0.79, pip 0.87, brunhild 1.25): measured 0.90 / 1.01 /
 * 1.14 / 1.12 on this host, the same ballpark.
 */
const BENCH_FACTOR = 1.5;
/** Draw counts for the microbenchmark (mirrors tools/sheet.js bench(): warm, then `runs` timed passes). */
const BENCH_WARM = 100, BENCH_N = 300, BENCH_RUNS = 3;
/** ART_STYLE section 9's calibrated headless ceiling, reported for context only (see the rule comment). */
const HEADLESS_MS = 1.3;

export const RULES = [
  {
    id: 'render/silhouette-distinctness',
    section: 'ART_STYLE §0.8, §4, §11',
    severity: 'error',
    describe: 'Make every variant in a faction read as a different silhouette.',
  },
  {
    id: 'render/squint-readability',
    section: 'ART_STYLE §0.8, §11',
    severity: 'warn',
    describe: 'Keep the rig readable as a person with a weapon at half scale.',
  },
  {
    id: 'render/bench-budget',
    section: 'ART_STYLE §9',
    severity: 'warn',
    describe: 'Keep per-draw cost inside the calibrated headless ceiling.',
  },
  {
    id: 'render/sheets-and-playtest-green',
    section: 'ART_STYLE §10, §11',
    severity: 'error',
    describe: 'Render every subject in a real canvas without errors, and keep the syntax and playtest gates green.',
  },
];

// ---------------------------------------------------------------------------
// the page-side harness
// ---------------------------------------------------------------------------

/**
 * Source of the in-page harness, evaluated once per navigation as `(BOOTSTRAP)()`. It may only use page globals and
 * dynamic imports of the served repo - nothing crosses from node except plain JSON specs.
 */
const BOOTSTRAP = `async () => {
  const rigM = await import('/src/art/rig.js');
  const chars = await import('/src/content/characters/index.js');
  const enemies = await import('/src/content/enemies/index.js');
  const anim = await import('/src/game/animation.js');
  // spawn modifiers live in the game layer and are applied at spawn, so a modded subject's rig only exists once
  // applyMods has run. Without this the page rebuilt every 'enemy-mod' subject from its BASE def and all four pixel
  // rules silently measured the unmodded rig — two subjects with byte-identical readings and nothing to show for it.
  const traits = await import('/src/game/traits.js');

  // One canvas, big enough for the tallest rig (boss:vane, 203 device px) plus its weapon and accessories.
  const W = 256, H = 288, FX = 128, FY = 256;
  const BG = [0x3a, 0x34, 0x46];                 // pinned flat backdrop: component counts and IoU both move with it
  const ALPHA_ON = 200, BG_DIST = 24;
  const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });

  function resolve(spec) {
    if (spec.kind === 'character') { const d = chars.getCharacter(spec.id); return { def: d, build: d.build, anims: d.anims }; }
    const base = enemies.getEnemyDef(spec.type, spec.variant);
    if (spec.kind === 'boss-phase') { const ph = (base.phases || [])[spec.phase] || {}; return { def: base, build: ph.build || base.build, anims: ph.anims || base.anims }; }
    const d = spec.mods && spec.mods.length ? traits.applyMods(base, spec.mods) : base;
    return { def: d, build: d.build, anims: d.anims };
  }
  function entry(spec) {
    const r = resolve(spec);
    return { def: r.def, anims: r.anims || {}, rig: rigM.buildRig(r.build || {}), anim: new anim.AnimPlayer(r.anims || {}) };
  }
  function draw(e, o) { rigM.drawRig(ctx, e.rig, e.anim.pose, Object.assign({ x: FX, y: FY, facing: 1 }, o)); }
  /** Warm the chains by playing the anim through once (drawing each tick), then replay and step to key \`key\`. */
  function seek(e, name, key) {
    e.anim.play(name, { restart: true, fallback: 'idle' });
    const len = Math.max(8, e.anim.length);
    for (let i = 0; i < len; i++) { e.anim.tick(); draw(e); }
    e.anim.play(name, { restart: true, fallback: 'idle' });
    let g = 0;
    while (e.anim.frameIndex < key && g++ < 600 && !e.anim.done) { e.anim.tick(); draw(e); }
    return { anim: e.anim.name, key: e.anim.frameIndex };
  }

  // --- silhouettes -------------------------------------------------------
  /** Flat black silhouette mask: rig.override collapses every part to one fill (and suppresses the contact shadow). */
  function silhouette(spec, name, key) {
    const e = entry(spec);
    seek(e, name, key);
    ctx.clearRect(0, 0, W, H);
    e.rig.override = '#000000';
    draw(e);
    e.rig.override = null;
    const d = ctx.getImageData(0, 0, W, H).data;
    const m = new Uint8Array(W * H);
    for (let i = 0, n = W * H; i < n; i++) m[i] = d[i * 4 + 3] >= ALPHA_ON ? 1 : 0;
    return m;
  }
  function shift(m, dx, dy) {
    const o = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const ty = y + dy; if (ty < 0 || ty >= H) continue;
      for (let x = 0; x < W; x++) { const tx = x + dx; if (tx < 0 || tx >= W) continue; o[ty * W + tx] = m[y * W + x]; }
    }
    return o;
  }
  function iou(a, b) { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { const p = a[k], q = b[k]; if (p & q) i++; if (p | q) u++; } return u ? i / u : 1; }
  function area(m) { let n = 0; for (let k = 0; k < m.length; k++) n += m[k]; return n; }
  /** Best IoU over a +/-2 px translation search, so a sub-pixel offset cannot fake a difference. */
  function bestIou(a, b) {
    let best = 0, at = [0, 0];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const v = iou(a, shift(b, dx, dy)); if (v > best) { best = v; at = [dx, dy]; } }
    return { iou: best, at };
  }
  /** 2x2 box downsample of a mask: a pixel survives when at least half its box was filled. */
  function halve(m) {
    const w2 = W >> 1, h2 = H >> 1, o = new Uint8Array(w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      const s = m[(y * 2) * W + x * 2] + m[(y * 2) * W + x * 2 + 1] + m[(y * 2 + 1) * W + x * 2] + m[(y * 2 + 1) * W + x * 2 + 1];
      o[y * w2 + x] = s >= 2 ? 1 : 0;
    }
    return o;
  }
  function pairs(list, frames) {
    const out = [];
    for (const fr of frames) {
      const masks = list.map((s) => silhouette(s, fr[0], fr[1]));
      const half = masks.map(halve);
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const b = bestIou(masks[i], masks[j]);
        out.push({ frame: fr[0] + '#' + fr[1], a: list[i].id, b: list[j].id, iou: b.iou, at: b.at,
          iouHalf: iou(half[i], half[j]), areaA: area(masks[i]), areaB: area(masks[j]) });
      }
    }
    return out;
  }

  // --- squint ------------------------------------------------------------
  function components(m, w, h) {
    const seen = new Uint8Array(m.length), sizes = [], stack = [];
    for (let s = 0; s < m.length; s++) {
      if (!m[s] || seen[s]) continue;
      let sz = 0; stack.push(s); seen[s] = 1;
      while (stack.length) {
        const k = stack.pop(); sz++;
        const x = k % w, y = (k / w) | 0;
        if (x > 0 && m[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; stack.push(k - 1); }
        if (x < w - 1 && m[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; stack.push(k + 1); }
        if (y > 0 && m[k - w] && !seen[k - w]) { seen[k - w] = 1; stack.push(k - w); }
        if (y < h - 1 && m[k + w] && !seen[k + w]) { seen[k + w] = 1; stack.push(k + w); }
      }
      sizes.push(sz);
    }
    sizes.sort((a, b) => b - a);
    return { n: sizes.length, sizes };
  }
  /** Capture at 1x on the pinned backdrop, box-downsample to 0.5x, then measure. */
  function squint(spec, name, key) {
    const e = entry(spec);
    const at = seek(e, name, key);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgb(' + BG[0] + ',' + BG[1] + ',' + BG[2] + ')'; ctx.fillRect(0, 0, W, H);
    draw(e);
    const d = ctx.getImageData(0, 0, W, H).data;
    const w2 = W >> 1, h2 = H >> 1, px = new Uint32Array(w2 * h2), mask = new Uint8Array(w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const o = ((y * 2 + j) * W + x * 2 + i) * 4; r += d[o]; g += d[o + 1]; b += d[o + 2]; }
      r = (r / 4) | 0; g = (g / 4) | 0; b = (b / 4) | 0;
      px[y * w2 + x] = (r << 16) | (g << 8) | b;
      mask[y * w2 + x] = Math.abs(r - BG[0]) + Math.abs(g - BG[1]) + Math.abs(b - BG[2]) > BG_DIST ? 1 : 0;
    }
    const comp = components(mask, w2, h2);
    const cols = new Set();
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      const k = y * w2 + x; if (!mask[k]) continue;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const v = px[k];
      cols.add((((v >> 20) & 15) << 8) | (((v >> 12) & 15) << 4) | ((v >> 4) & 15));   // 4 bits per channel
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    return { at, comps: comp.n, sizes: comp.sizes.slice(0, 4), colours: cols.size, area: n,
      bw: n ? bw : 0, bh: n ? bh : 0, fill: n ? n / (bw * bh) : 0, otherFrac: n ? (comp.sizes[1] || 0) / n : 0 };
  }

  // --- bench -------------------------------------------------------------
  /** Mirrors tools/sheet.js bench(): cycle attack/walk poses and time drawRig. */
  function benchOnce(spec, n) {
    const e = entry(spec);
    e.anim.play('attack1', { restart: true, fallback: 'idle' });
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      e.anim.tick();
      if (e.anim.done) e.anim.play(i % 2 ? 'walk' : 'attack3', { restart: true, fallback: 'idle' });
      rigM.drawRig(ctx, e.rig, e.anim.pose, { x: FX, y: FY, facing: i & 1 ? 1 : -1 });
    }
    return (performance.now() - t0) / n;
  }
  function bench(spec, warm, n, runs) {
    benchOnce(spec, warm);
    const r = [];
    for (let k = 0; k < runs; k++) r.push(benchOnce(spec, n));
    const sorted = r.slice().sort((a, b) => a - b);
    return { ms: sorted[sorted.length >> 1], runs: r };
  }

  // --- real-canvas sweep -------------------------------------------------
  /** Play every keyframe of every anim against a real CanvasRenderingContext2D; returns the first throw, if any. */
  function sweep(spec) {
    try {
      const e = entry(spec);
      let frames = 0;
      for (const name of Object.keys(e.anims)) {
        const a = e.anims[name];
        if (!a || !a.frames || !a.frames.length) continue;
        e.anim.play(name, { restart: true, fallback: 'idle' });
        const len = Math.max(1, Math.min(e.anim.length, 600));
        for (let i = 0; i < len; i++) { e.anim.tick(); draw(e); frames++; }
        for (const facing of [-1, 1]) draw(e, { facing });
      }
      return { ok: true, frames, error: null };
    } catch (err) { return { ok: false, frames: 0, error: String((err && err.stack) || err) }; }
  }

  window.__artRender = { W, H, pairs, squint, bench, sweep, silhouette };
  return 'ok';
}`;

// ---------------------------------------------------------------------------
// node-side helpers
// ---------------------------------------------------------------------------

/** The JSON-safe description of a subject the page needs to rebuild its rig. */
function specOf(s) {
  return { id: s.id, kind: s.kind, type: s.type, variant: s.variant, phase: s.phase, scale: (s.rig && s.rig.scale) || 1,
    // an 'enemy-mod' subject is a base def plus these; the page re-applies them, or it draws the wrong rig
    mods: (s.def && s.def.mods) || null };
}

/** Group key for silhouette distinctness: heroes are one faction, every enemy type is its own. */
function factionOf(s) { return s.kind === 'character' ? 'hero' : s.type; }

/**
 * The frame every squint capture samples: idle, walk and the first hit key of the subject's first attack.
 * Uses helpers.attackAnims / helpers.hitKeys so "attack" means "carries a damaging hitbox", not "is named attack1".
 */
function squintFrames(subject, H) {
  const frames = [IDLE, WALK];
  for (const [name, anim] of H.attackAnims(subject)) {
    const keys = H.hitKeys(anim);
    if (keys.length) { frames.push([name, keys[0]]); break; }
  }
  return frames;
}

function fixed(v, n = 3) { return Number(v).toFixed(n); }

/** Every .js file under the given repo-relative directories, ignoring build output and dependencies. */
function jsFiles(root, dirs) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist' && e.name[0] !== '.') walk(p); }
      else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
    }
  };
  for (const d of dirs) walk(path.join(root, d));
  return out.sort();
}

/**
 * Run a command to completion.
 * @returns {Promise<{code:number, out:string}>} merged stdout+stderr, trimmed to the last 4 kB
 */
export function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) } });
    let out = '';
    const take = (b) => { out += b; if (out.length > 8192) out = out.slice(-4096); };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (e) => resolve({ code: -1, out: String(e && e.message) }));
    child.on('close', (code) => resolve({ code: code == null ? -1 : code, out: out.trim() }));
  });
}

// ---------------------------------------------------------------------------
// the rules
// ---------------------------------------------------------------------------

/** render/silhouette-distinctness: pairwise IoU inside every faction, at 1x and 0.5x. */
async function silhouetteDistinctness(subjects, page, findings) {
  const id = 'render/silhouette-distinctness';
  // A boss is one character, so its base rig and its phase rigs are NOT variants of each other: scope the rule to
  // the multi-variant mook factions and the hero cast, which is what ART_STYLE section 0.8 is about.
  const groups = new Map();
  for (const s of subjects) {
    if (s.class === 'boss' || s.kind === 'boss-phase') continue;
    // A modded rig is not a SIBLING VARIANT, which is the only thing §0.8 is about: "five variants, one silhouette" is
    // a complaint that you cannot tell a Crimper from a Corsair, and a holdout Footman is not something you are meant to
    // tell from a Footman — it IS one, re-dressed at spawn. Comparing the two only ever reports the mod's own base
    // (IoU 1.000 for holdout / crusted / scrip / salvaged, which repaint without touching the outline), which would bury
    // the authored pairs the rule exists to find. Note this is the not-a-variant argument, NOT "mods never change the
    // shape": the winged bladder does (idle#0 bbox 33x37 -> 33x48), and the other pixel rules still measure it.
    if (s.kind === 'enemy-mod') continue;
    const k = factionOf(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const thin = [...groups].filter(([, l]) => l.length < 2).map(([k]) => k);
  if (thin.length) {
    findings.push({ ruleId: id, subjectId: '*', severity: 'info',
      message: `${thin.length} faction(s) have fewer than two variants in this run and were not compared`,
      detail: `not compared: ${thin.join(', ')} (a subject filter narrowed the run; boss rigs are excluded by design - a boss phase is the same character, not a sibling variant)` });
  }
  for (const [faction, list] of groups) {
    if (list.length < 2) continue;
    const rows = await page.evaluate(([specs, frames]) => window.__artRender.pairs(specs, frames),
      [list.map(specOf), [IDLE, WALK]]);
    rows.sort((a, b) => b.iou - a.iou);
    const table = rows.map((r) => `  ${fixed(r.iou)} 1x / ${fixed(r.iouHalf)} 0.5x  ${r.frame}  ${r.a} vs ${r.b}  (areas ${r.areaA}/${r.areaB}px, aligned ${r.at.join(',')})`);
    findings.push({ ruleId: id, subjectId: list[0].id, severity: 'info',
      message: `${faction}: ${rows.length} pairwise silhouette comparisons, worst IoU ${fixed(rows[0].iou)} (bound ${IOU_MAX})`,
      where: faction, detail: [`pairwise silhouette IoU, worst first (bound ${IOU_MAX}; measured reference maximum 0.758 + 0.03):`, ...table] });
    for (const r of rows) {
      const worst = Math.max(r.iou, r.iouHalf);
      if (worst < IOU_MAX) continue;
      findings.push({ ruleId: id, subjectId: r.a, severity: 'error', where: `${r.frame} vs ${r.b}`,
        message: `${r.a} and ${r.b} read as the same silhouette (IoU ${fixed(worst)} >= ${IOU_MAX})`,
        detail: [`${r.frame}: IoU ${fixed(r.iou)} at 1x, ${fixed(r.iouHalf)} at 0.5x, best of a +/-2 px alignment search (offset ${r.at.join(',')}).`,
          `silhouette areas ${r.areaA} and ${r.areaB} device px.`,
          `bound ${IOU_MAX} = the measured reference maximum 0.758 (sootborn cutthroat vs slinger, walk#4) + 0.03.`,
          'ART_STYLE section 0.8: two variants of one faction must differ in outline, not only in palette.'].join('\n') });
    }
  }
}

/** render/squint-readability: the 0.5x metric table, with a floor on the surviving colour count. */
async function squintReadability(subjects, page, findings, H) {
  const id = 'render/squint-readability';
  findings.push({ ruleId: id, subjectId: '*', severity: 'info',
    message: `0.5x squint metrics follow for every subject; only the surviving colour count is asserted (floor ${SQUINT_COLOURS_MIN})`,
    detail: ['component count and the largest-other (weapon-presence) fraction are REPORTED, not asserted: measured across',
      'the reference cast they have no separating power - a paper-doll silhouette is one connected blob by construction',
      '(sael, the halberdier, the sapper, the cutthroat and the hulk all measure a single component) and the weapon is',
      'part of that same blob. A bound on either would condemn correct reference art, so the rule does not carry one.',
      'captures: idle#0, walk#4 and the first damaging hit key of the subject\'s first attack, at 1x on a pinned flat',
      `backdrop (#3a3446), box-downsampled to 0.5x; colours are quantised to 4 bits per channel inside the silhouette.`].join('\n') });
  for (const s of subjects) {
    const frames = squintFrames(s, H);
    const rows = await page.evaluate(([spec, fr]) => fr.map((f) => window.__artRender.squint(spec, f[0], f[1])),
      [specOf(s), frames]);
    const lines = rows.map((r, i) => `  ${frames[i][0]}#${frames[i][1]}${r.at.anim !== frames[i][0] ? ` (played ${r.at.anim}#${r.at.key})` : ''}: `
      + `colours ${r.colours}, components ${r.comps} (${r.sizes.join('/')}), area ${r.area}px, bbox ${r.bw}x${r.bh}, fill ${fixed(r.fill, 2)}, largest-other ${fixed(r.otherFrac, 3)}`);
    const worst = rows.reduce((a, b) => (b.colours < a.colours ? b : a), rows[0]);
    findings.push({ ruleId: id, subjectId: s.id, severity: 'info',
      message: `0.5x squint metrics (worst surviving colour count ${worst.colours}, floor ${SQUINT_COLOURS_MIN})`,
      detail: lines.join('\n') });
    rows.forEach((r, i) => {
      if (r.colours >= SQUINT_COLOURS_MIN) return;
      findings.push({ ruleId: id, subjectId: s.id, severity: 'warn', where: `${frames[i][0]}#${frames[i][1]}`,
        message: `only ${r.colours} distinct colours survive the 0.5x downsample (floor ${SQUINT_COLOURS_MIN})`,
        detail: [`measured reference range 81 (sootborn:slinger walk#4) .. 222 (midboss:grubbik idle#0); the floor sits just under it.`,
          `the value ladder is collapsing at squint scale: ART_STYLE section 0.8 asks the rig to still read as a person with a weapon at half size.`,
          `area ${r.area}px, bbox ${r.bw}x${r.bh}, components ${r.comps}.`].join('\n') });
    });
  }
}

/** render/bench-budget: scale-normalised drawRig cost, against a bound derived from the reference cast in this run. */
async function benchBudget(subjects, page, findings, isRef, h = {}) {
  const id = 'render/bench-budget';
  const rows = [];
  for (const s of subjects) {
    const r = await page.evaluate(([spec, w, n, k]) => window.__artRender.bench(spec, w, n, k),
      [specOf(s), BENCH_WARM, BENCH_N, BENCH_RUNS]);
    const scale = (s.rig && s.rig.scale) || 1;
    rows.push({ id: s.id, ref: isRef(s), scale, ms: r.ms, runs: r.runs, norm: r.ms / (scale * scale) });
  }
  rows.sort((a, b) => b.norm - a.norm);
  const refs = rows.filter((r) => r.ref);
  const table = rows.map((r) => `  ${r.ref ? 'ref' : '   '} ${r.id.padEnd(22)} scale ${r.scale}  ${fixed(r.ms)} ms/draw  ${fixed(r.norm)} scale-normalised  (runs ${r.runs.map((v) => fixed(v, 2)).join('/')})`);
  const head = [`median of ${BENCH_RUNS} x ${BENCH_N} draws after ${BENCH_WARM} warm-up draws, cost normalised by rig.scale^2`,
    'THIS IS THE ONLY MACHINE-DEPENDENT CHECK IN THE SUITE: headless Chromium rasterises in software (SwiftShader) and',
    `its throughput varies several-fold with core count, so the bound is derived from the reference cast IN THIS RUN,`,
    `not from a number checked into the file. ART_STYLE section 9's calibrated headless ceiling of ${HEADLESS_MS} ms/draw is`,
    'reported alongside for a sanity check (its stated points: sael 0.87, rook 0.79, pip 0.87, brunhild 1.25).'];
  if (!refs.length) {
    // Nothing was asserted, so this is a SKIP, not a pass - announce it in the block that is always printed.
    if (typeof h.skip === 'function') h.skip(id, 'no reference subject in this run, so the per-draw budget could not be derived - nothing was asserted (the bound is 1.5x the slowest reference measured in the same run)');
    findings.push({ ruleId: id, subjectId: '*', severity: 'info',
      message: 'no reference subject in this run, so the per-draw budget could not be derived - nothing was asserted',
      detail: [...head, '', ...table].join('\n') });
    return;
  }
  const slowest = refs[0];
  const bound = slowest.norm * BENCH_FACTOR;
  findings.push({ ruleId: id, subjectId: slowest.id, severity: 'info',
    message: `per-draw budget ${fixed(bound)} ms scale-normalised (${BENCH_FACTOR}x the slowest reference, ${slowest.id} at ${fixed(slowest.norm)})`,
    detail: [...head, '', ...table].join('\n') });
  for (const r of rows) {
    if (r.norm <= bound) continue;
    findings.push({ ruleId: id, subjectId: r.id, severity: 'warn',
      message: `${fixed(r.norm)} ms per draw scale-normalised, over the ${fixed(bound)} ms budget`,
      detail: [`raw ${fixed(r.ms)} ms/draw at scale ${r.scale}; runs ${r.runs.map((v) => fixed(v, 2)).join('/')}.`,
        `budget = ${BENCH_FACTOR}x the slowest reference subject in this run (${slowest.id}, ${fixed(slowest.norm)} ms).`,
        `for context, ART_STYLE section 9's headless ceiling is ${HEADLESS_MS} ms/draw unnormalised; this subject raw is ${fixed(r.ms)}.`,
        're-baseline on the CI host before treating this as an art regression - the measurement is machine-dependent.'].join('\n') });
  }
}

/** render/sheets-and-playtest-green: real-canvas sheets, the cast sheet, `node --check` and (opt-in) the playtest. */
async function sheetsAndPlaytestGreen(subjects, page, findings, helpers) {
  const id = 'render/sheets-and-playtest-green';
  const repo = helpers.repoRoot || process.cwd();

  // (a1) boss-phase rigs first, while the bootstrap is still installed: tools/sheet.html has no query that can
  // address a phase (?enemy=<type>:<variant> always resolves to the boss's base def), so they are swept here.
  for (const s of subjects.filter((x) => x.kind === 'boss-phase')) {
    const r = await page.evaluate((spec) => window.__artRender.sweep(spec), specOf(s));
    if (r.ok) {
      findings.push({ ruleId: id, subjectId: s.id, severity: 'info',
        message: `swept ${r.frames} real-canvas frames clean (boss phases have no tools/sheet.html query)`, where: 'in-page sweep' });
    } else {
      findings.push({ ruleId: id, subjectId: s.id, severity: 'error', where: 'in-page sweep',
        message: 'drawing this phase against a real canvas threw', detail: r.error });
    }
  }

  // (a2) every addressable subject through tools/sheet.html?mode=anims, the sheet-capture.js pattern.
  const seen = new Set();
  for (const s of subjects) {
    if (s.kind === 'boss-phase') continue;
    const q = s.kind === 'character' ? `char=${s.id}` : `enemy=${s.type}:${s.variant}`;
    if (seen.has(q)) continue;
    seen.add(q);
    const r = await visitSheet(page, `${q}&mode=anims&zoom=1&cols=8`);
    if (r.ok) continue;
    findings.push({ ruleId: id, subjectId: s.id, severity: 'error', where: `sheet.html?${q}&mode=anims`,
      message: 'the contact sheet did not render clean', detail: r.detail });
  }
  // the cast sheet ART_STYLE section 0.8 names, on the docks backdrop
  const cast = await visitSheet(page, 'mode=cast&enemies=1&bg=docks&zoom=1');
  if (!cast.ok) {
    findings.push({ ruleId: id, subjectId: '*', severity: 'error', where: 'sheet.html?mode=cast&enemies=1&bg=docks',
      message: 'the cast sheet did not render clean', detail: cast.detail });
  }

  // (b) node --check over every source and tool file (npm run lint only checks src/main.js).
  const files = jsFiles(repo, ['src', 'tools']);
  const bad = [];
  for (const f of files) {
    const r = await runCommand(process.execPath, ['--check', f], { cwd: repo });
    if (r.code !== 0) bad.push(`${path.relative(repo, f)}: ${r.out.split('\n').slice(0, 3).join(' ')}`);
  }
  if (bad.length) {
    findings.push({ ruleId: id, subjectId: '*', severity: 'error', where: 'node --check',
      message: `${bad.length} of ${files.length} files under src/ and tools/ do not parse`, detail: bad.slice(0, 12).join('\n') });
  } else {
    findings.push({ ruleId: id, subjectId: '*', severity: 'info', where: 'node --check',
      message: `${files.length} files under src/ and tools/ parse clean` });
  }

  // (c) the playtest harness. Kept behind an explicit opt-in: ART_STYLE's own plan asks for the playtest to live in
  // its own job so a gameplay or browser flake can never be mistaken for - or mask - an art regression, and it is a
  // game-logic gate rather than an art one. The skip is announced, never silent.
  const cmd = 'NODE_PATH=/opt/node22/lib/node_modules node tools/playtest.js boot select combat gallery';
  if (process.env.ART_CHECK_PLAYTEST !== '1') {
    const why = `set ART_CHECK_PLAYTEST=1 to include it; it runs \`${cmd}\` (about 60 s). It is opt-in so a gameplay or `
      + 'browser flake cannot be mistaken for - or mask - an art regression; run it as its own CI job.';
    // Announced in the report's SKIPPED block (always printed) as well as a note, so it can never pass quietly.
    if (typeof helpers.skip === 'function') helpers.skip(`${id} (playtest half)`, why);
    findings.push({ ruleId: id, subjectId: '*', severity: 'info', where: 'playtest',
      message: 'the playtest half of this rule did NOT run', detail: why });
  } else {
    const r = await runCommand(process.execPath, ['tools/playtest.js', 'boot', 'select', 'combat', 'gallery'],
      { cwd: repo, env: { NODE_PATH: process.env.NODE_PATH || '/opt/node22/lib/node_modules' } });
    if (r.code === 0) findings.push({ ruleId: id, subjectId: '*', severity: 'info', where: 'playtest', message: 'the playtest harness exited 0' });
    else findings.push({ ruleId: id, subjectId: '*', severity: 'error', where: 'playtest',
      message: `the playtest harness exited ${r.code}`, detail: [`command: ${cmd}`, r.out].join('\n') });
  }
}

/**
 * Load one tools/sheet.html query and report the sheet's own error plus any page or console error it raised.
 * @param {import('playwright').Page} page a page whose context baseURL is the served repo
 * @param {string} query the sheet.html query string, without the leading '?'
 * @returns {Promise<{ok: boolean, detail: string|null}>}
 */
export async function visitSheet(page, query) {
  page.clearArtErrors();
  let err = null;
  try {
    await page.goto(`/tools/sheet.html?${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__sheet && window.__sheet.ready, null, { timeout: 60000 });
    err = await page.evaluate(() => window.__sheet.error);
  } catch (e) { err = String((e && e.message) || e); }
  const pageErrors = page.artErrors.slice(0, 6);
  page.clearArtErrors();
  if (!err && !pageErrors.length) return { ok: true, detail: null };
  return { ok: false, detail: [err ? `window.__sheet.error: ${err}` : null, ...pageErrors].filter(Boolean).join('\n') };
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

/**
 * Which of this module's rules to run. The runner hands checkAll() its `--only` selection on `helpers.only`, so a
 * bare `--only=render/bench-budget` does not pay for - or report on - the whole tier. An empty or absent selection
 * runs everything; a selection that matches nothing here also runs everything, never nothing.
 * @returns {Set<string>} the rule ids to run
 */
export function selectedRules(helpers = {}) {
  const all = new Set(RULES.map((r) => r.id));
  const only = Array.isArray(helpers.only) ? helpers.only : null;
  if (!only || !only.length) return all;
  const picked = new Set([...all].filter((id) => only.some((o) => id === o || id.startsWith(o))));
  return picked.size ? picked : all;
}

/** Drain the page's error log into one finding, so an error raised by the in-page work is never lost. */
function drainPageErrors(page, findings, ruleId, where) {
  const errs = page.artErrors.slice();
  page.clearArtErrors();
  if (!errs.length) return;
  findings.push({ ruleId, subjectId: '*', severity: 'error', where,
    message: `${errs.length} page/console error(s) fired while rendering`, detail: errs.slice(0, 8).join('\n') });
}

/**
 * Run the render tier. The runner owns the browser and the server; `page` is already on the repo's origin, carries
 * `page.artErrors` / `page.clearArtErrors()` and a context baseURL, and `helpers` is the shared helper module plus
 * `baseUrl` and `repoRoot`.
 * @param {object[]} subjects every subject in the run
 * @param {import('playwright').Page} page
 * @param {object} helpers tools/art-invariants/helpers.js plus { baseUrl, repoRoot }
 * @returns {Promise<object[]>} flat findings { ruleId, subjectId, severity, message, detail, where }
 */
export async function checkAll(subjects, page, helpers) {
  const findings = [];
  if (!subjects.length) return findings;
  const run = selectedRules(helpers);

  page.clearArtErrors();
  await page.goto('/tools/sheet.html?char=brunhild&mode=closeup&zoom=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sheet && window.__sheet.ready, null, { timeout: 60000 });
  const boot = await page.evaluate(`(${BOOTSTRAP})()`);
  if (boot !== 'ok') throw new Error(`the in-page render harness did not install (returned ${JSON.stringify(boot)})`);

  // in-page tiers first, while the bootstrap is installed (a navigation drops it)
  if (run.has('render/silhouette-distinctness')) await silhouetteDistinctness(subjects, page, findings);
  if (run.has('render/squint-readability')) await squintReadability(subjects, page, findings, helpers);
  if (run.has('render/bench-budget')) await benchBudget(subjects, page, findings, isReference, helpers);
  drainPageErrors(page, findings, 'render/sheets-and-playtest-green', 'in-page harness');
  if (run.has('render/sheets-and-playtest-green')) await sheetsAndPlaytestGreen(subjects, page, findings, helpers);
  return findings;
}
