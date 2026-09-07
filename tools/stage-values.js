// Stage/actor separation measurement (headless Playwright + tools/server.js).
//
//   NODE_PATH=/opt/node22/lib/node_modules node tools/stage-values.js [options]
//
// For every section of every registered stage (content/stage/index.js) it renders the section in game and reports
//   (a) BACKDROP BANDS  - mean HSV value + saturation of the sky band and the floor band of the actor-free stage,
//   (b) SEPARATION      - for a representative squad of each enemy faction, how far the ACTOR pixels sit from the
//                         backdrop pixels they cover, in value, saturation and perceptual (Oklab) distance.
//
// Actor pixels are isolated by DIFFERENCING three renders of the same frame, not by guessing:
//   A = the frame with the squad, B = the same frame with the enemies deleted, C = B with the player deleted too.
// No world update runs between the three renders (loop.step(0) re-renders), so the backdrop, the FX, the props and
// the HUD are pixel-identical in all three; A-B is therefore exactly the enemy silhouettes (HUD excluded by
// construction) and C is exactly the backdrop that sits behind each of those pixels.
//
// Options:
//   --json                 emit machine-readable JSON instead of the tables
//   --stage=N              only board N (1-based, repeatable as a comma list)
//   --section=M            only section M (0-based, comma list)
//   --faction=brassbound   only these factions (comma list of brassbound,sootborn,stormcrow)
//   --ref=<img>            also measure a reference frame (jpg/png) with the proxy estimator; repeatable
//   --out=<dir>            write the A/B/C renders as PNGs for eyeballing
//   --settle=160           frames to run before the squad is spawned (clears the section banner)
//   --frames=6             frames to run after the squad is spawned, before the capture
//   --url-spawn            spawn through the `spawn=` URL param at load time instead of after the settle
//                          (same grammar; the squad has then had `--settle` frames of AI and has usually clumped
//                          onto the player, so the default is the post-settle spawn at fixed screen positions)
//   --seed=1               rng seed
//
// Bands follow the project's measurement convention on the 1280x720 display canvas: sky rows 90-270, floor rows
// 300-640, plus `floorRows` 400-680 which is the engine's real floor band (internal rows FLOOR_TOP..FLOOR_TOP+Z_MAX).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from './server.js';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const c of ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright']) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error('Playwright not found. Install with `npm i -D playwright-core` or set NODE_PATH to the global node_modules.');
}
const { chromium } = loadPlaywright();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const a = argv.find((s) => s.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const list = (n) => { const v = opt(n, ''); return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null; };
const CFG = {
  json: flag('json'),
  stages: (list('stage') || []).map(Number),
  sections: (list('section') || []).map(Number),
  factions: list('faction'),
  refs: argv.filter((s) => s.startsWith('--ref=')).map((s) => s.slice(6)),
  out: opt('out', ''),
  settle: Number(opt('settle', 160)),
  frames: Number(opt('frames', 6)),
  urlSpawn: flag('url-spawn'),
  seed: Number(opt('seed', 1)),
};
if (CFG.out) fs.mkdirSync(path.resolve(ROOT, CFG.out), { recursive: true });

// ---------------------------------------------------------------- squads
/**
 * A representative squad per faction: one fodder, one ranged, one bruiser and the elite, so the measurement sees
 * the faction's whole value/chroma range and not just its most common grunt.
 */
const SQUADS = {
  brassbound: ['footman', 'sapper', 'halberdier', 'warden'],
  sootborn: ['cutthroat', 'slinger', 'firebrand', 'hulk'],
  stormcrow: ['crimper', 'corsair', 'bosun', 'marine'],
};
/** Where the squad stands: internal (640x360) screen x, and the depth z (0 = far, 140 = near). Spread across the frame
 *  and across the floor band so every actor sits over a different passage of backdrop. */
const SLOTS = [{ sx: 170, z: 30 }, { sx: 295, z: 105 }, { sx: 415, z: 55 }, { sx: 530, z: 130 }];
const VIEW_W = 640, SCALE = 2; // display canvas is 1280x720 = the 640x360 internal canvas at an exact 2x nearest-neighbour blit

// ---------------------------------------------------------------- in-page measurement library
// Injected into every page (game pages and the reference-image page) so ours and the reference are measured by
// exactly the same code.
const ANALYSIS = String.raw`
window.__sv = (function () {
  var LOST = 10;           // Oklab dE (x100) below which an actor pixel reads as merged into the ground
  var DIFF = 10;           // per-channel 0-255 difference that counts as "this pixel changed"
  var EDGE = 2;            // px: an actor pixel this close to a non-actor pixel is a silhouette pixel

  function hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return { s: mx === 0 ? 0 : (mx - mn) / mx, v: mx };
  }
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  // sRGB -> Oklab (Bjorn Ottosson). L is perceptual lightness, (a,b) the chroma plane.
  function oklab(r, g, b) {
    var R = lin(r), G = lin(g), B = lin(b);
    var l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    var m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    var s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return {
      L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    };
  }
  function stats(a) {
    if (!a.length) return { n: 0, mean: 0, p10: 0, p50: 0, p90: 0 };
    var s = Float64Array.from(a); s.sort();
    var sum = 0; for (var i = 0; i < s.length; i++) sum += s[i];
    var pct = function (p) { return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
    return { n: s.length, mean: sum / s.length, p10: pct(0.10), p50: pct(0.50), p90: pct(0.90) };
  }

  /** Mean HSV value + saturation of a horizontal band, sampled on a 2px lattice. */
  function band(px, w, y0, y1) {
    var S = 0, V = 0, n = 0;
    for (var y = Math.max(0, y0 | 0); y < y1; y += 2) for (var x = 0; x < w; x += 2) {
      var i = (y * w + x) * 4, c = hsv(px[i], px[i + 1], px[i + 2]);
      S += c.s; V += c.v; n++;
    }
    return { n: n, satMean: n ? S / n : 0, valMean: n ? V / n : 0 };
  }

  /** Actor mask from differencing two renders of the same frame. Returns a Uint8Array (1 = actor). */
  function maskFromDiff(A, B, w, h, y0, y1) {
    var m = new Uint8Array(w * h);
    for (var y = Math.max(0, y0 | 0); y < Math.min(h, y1); y++) for (var x = 0; x < w; x++) {
      var p = y * w + x, i = p * 4;
      if (Math.abs(A[i] - B[i]) > DIFF || Math.abs(A[i + 1] - B[i + 1]) > DIFF || Math.abs(A[i + 2] - B[i + 2]) > DIFF) m[p] = 1;
    }
    return despeckle(m, w, h);
  }
  /** Drop lone pixels (a real actor pixel has neighbours; the render is a 2x nearest-neighbour blit so it always does). */
  function despeckle(m, w, h) {
    var o = new Uint8Array(m);
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
      var p = y * w + x; if (!m[p]) continue;
      var n = m[p - 1] + m[p + 1] + m[p - w] + m[p + w] + m[p - w - 1] + m[p - w + 1] + m[p + w - 1] + m[p + w + 1];
      if (n < 3) o[p] = 0;
    }
    return o;
  }

  /**
   * Proxy actor mask for an image with no clean plate (the reference frame): the most saturated 'frac' of the
   * pixels between y0 and y1. In a beat-em-up those are the actors.
   */
  function maskFromSaturation(px, w, h, y0, y1, frac) {
    var vals = [];
    for (var y = y0; y < y1; y++) for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4; vals.push(hsv(px[i], px[i + 1], px[i + 2]).s);
    }
    var srt = Float64Array.from(vals); srt.sort();
    var cut = srt[Math.max(0, Math.floor(srt.length * (1 - frac)))];
    var m = new Uint8Array(w * h), k = 0;
    for (var y2 = y0; y2 < y1; y2++) for (var x2 = 0; x2 < w; x2++, k++) if (vals[k] >= cut) m[y2 * w + x2] = 1;
    return despeckle(m, w, h);
  }

  /**
   * Local backdrop for every masked pixel, estimated from the image itself: the component-wise median of the
   * UNMASKED pixels in a box of radius R around it (sub-sampled). Used for the reference frame, and run on our own
   * frames as a cross-check on the exact clean-plate answer.
   */
  function localBackdrop(px, m, w, h, R) {
    var out = new Uint8ClampedArray(w * h * 4);
    var rs = [], gs = [], bs = [], step = 3;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var p = y * w + x; if (!m[p]) continue;
      rs.length = 0; gs.length = 0; bs.length = 0;
      for (var dy = -R; dy <= R; dy += step) {
        var yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (var dx = -R; dx <= R; dx += step) {
          var xx = x + dx; if (xx < 0 || xx >= w) continue;
          var q = yy * w + xx; if (m[q]) continue;
          var j = q * 4; rs.push(px[j]); gs.push(px[j + 1]); bs.push(px[j + 2]);
        }
      }
      var o = p * 4;
      if (!rs.length) { out[o] = px[o]; out[o + 1] = px[o + 1]; out[o + 2] = px[o + 2]; continue; }
      rs.sort(function (a, b) { return a - b; }); gs.sort(function (a, b) { return a - b; }); bs.sort(function (a, b) { return a - b; });
      var mid = rs.length >> 1;
      out[o] = rs[mid]; out[o + 1] = gs[mid]; out[o + 2] = bs[mid];
    }
    return out;
  }

  /**
   * Actor-cast shadows are an alpha-black ellipse painted UNDER the actor (art/fx.js drawShadow), so they vanish
   * with the actor and land in the difference mask even though they are not the character's body. A shadow pixel is
   * exactly the backdrop pixel multiplied by one scalar, so it is identifiable and can be split back out.
   */
  function classifyShadow(A, back, m, w, h) {
    var sh = new Uint8Array(w * h);
    for (var p = 0; p < m.length; p++) {
      if (!m[p]) continue;
      var i = p * 4;
      var cr = back[i], cg = back[i + 1], cb = back[i + 2];
      if (cr < 20 || cg < 20 || cb < 20) continue;               // too dark to tell a multiply from a repaint
      var kr = A[i] / cr, kg = A[i + 1] / cg, kb = A[i + 2] / cb;
      var mx = Math.max(kr, kg, kb), mn = Math.min(kr, kg, kb);
      if (mx < 0.97 && mx > 0.2 && (mx - mn) < 0.06) sh[p] = 1;  // one scalar across all three channels = a multiply
    }
    return sh;
  }

  /**
   * The separation metric. For every actor pixel compare it with the backdrop pixel BEHIND IT:
   *   dV / dS   signed HSV value + saturation deltas (the units the art brief is written in)
   *   dE        Oklab distance x100 - the honest "is this readable" number, lightness and chroma together
   *   edge dE   dE restricted to silhouette pixels (within EDGE px of a non-actor pixel): reading a character at
   *             speed is mostly reading its outline against the ground
   *   p10 dE    the 10th percentile: the part of the actor that disappears
   *   lost%     share of actor pixels under dE 10 (see LOST)
   */
  function separation(A, back, m, w, h, skip) {
    var dV = [], dS = [], dE = [], edge = [], av = [], as = [], bv = [], bs2 = [], dL = [], dC = [];
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
      var p = y * w + x; if (!m[p] || (skip && skip[p])) continue;
      var i = p * 4;
      var ca = hsv(A[i], A[i + 1], A[i + 2]), cb = hsv(back[i], back[i + 1], back[i + 2]);
      var oa = oklab(A[i], A[i + 1], A[i + 2]), ob = oklab(back[i], back[i + 1], back[i + 2]);
      var l = (oa.L - ob.L), aa = (oa.a - ob.a), bb = (oa.b - ob.b);
      var e = Math.sqrt(l * l + aa * aa + bb * bb) * 100;
      av.push(ca.v); as.push(ca.s); bv.push(cb.v); bs2.push(cb.s);
      dV.push(ca.v - cb.v); dS.push(ca.s - cb.s); dE.push(e);
      dL.push(Math.abs(l) * 100); dC.push(Math.sqrt(aa * aa + bb * bb) * 100);
      var isEdge = false;
      for (var dy = -EDGE; dy <= EDGE && !isEdge; dy++) for (var dx = -EDGE; dx <= EDGE; dx++) {
        var yy = y + dy, xx = x + dx; if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
        if (!m[yy * w + xx]) { isEdge = true; break; }
      }
      if (isEdge) edge.push(e);
    }
    var lost = 0; for (var k = 0; k < dE.length; k++) if (dE[k] < LOST) lost++;
    var mean = function (a) { var s = 0; for (var q = 0; q < a.length; q++) s += a[q]; return a.length ? s / a.length : 0; };
    var st = stats(dE);
    return {
      pixels: dE.length,
      actorVal: mean(av), actorSat: mean(as), bgVal: mean(bv), bgSat: mean(bs2),
      dVal: mean(dV), dSat: mean(dS), absVal: mean(dV.map(Math.abs)), absSat: mean(dS.map(Math.abs)),
      dE: st.mean, dEp10: st.p10, dEp50: st.p50, dEp90: st.p90,
      edgeDE: mean(edge), dL: mean(dL), dC: mean(dC),
      lostPct: dE.length ? (100 * lost / dE.length) : 0,
      lostThreshold: LOST,
    };
  }

  function grab(canvas) {
    var g = canvas.getContext('2d', { willReadFrequently: true });
    var d = g.getImageData(0, 0, canvas.width, canvas.height);
    return { px: d.data, w: canvas.width, h: canvas.height };
  }
  return { hsv: hsv, oklab: oklab, band: band, maskFromDiff: maskFromDiff, maskFromSaturation: maskFromSaturation,
    localBackdrop: localBackdrop, separation: separation, classifyShadow: classifyShadow, grab: grab, stats: stats, LOST: LOST };
})();
`;

// ---------------------------------------------------------------- helpers
const server = createServer();
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript({ content: ANALYSIS });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

/** Bands, as display rows on the 1280x720 canvas, and as fractions of height for images of another size. */
const BANDS = { sky: [90, 270], floor: [300, 640], floorRows: [400, 680] };
const bandRows = (h) => ({
  sky: [Math.round(BANDS.sky[0] / 720 * h), Math.round(BANDS.sky[1] / 720 * h)],
  floor: [Math.round(BANDS.floor[0] / 720 * h), Math.round(BANDS.floor[1] / 720 * h)],
  floorRows: [Math.round(BANDS.floorRows[0] / 720 * h), Math.round(BANDS.floorRows[1] / 720 * h)],
});

async function savePng(dataUrl, file) {
  fs.writeFileSync(path.resolve(ROOT, CFG.out, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
}

// ---------------------------------------------------------------- enumerate stages
await page.goto(`http://localhost:${port}/index.html?autotest=1&seed=1&skipTo=gameplay&nowaves=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 20000 });
const STAGE_LIST = await page.evaluate(async () => {
  const m = await import('/src/content/stage/index.js');
  return m.STAGES.map((s, i) => ({
    number: i + 1, id: s.id, name: s.name,
    sections: s.sections.map((sec, j) => ({ index: j, id: sec.id, name: sec.name, backdrop: sec.backdrop, floor: sec.floor })),
  }));
});

const factions = CFG.factions || Object.keys(SQUADS);
const results = { bands: [], separation: [], reference: [], meta: { settle: CFG.settle, frames: CFG.frames, seed: CFG.seed, bands: BANDS, slots: SLOTS, squads: SQUADS, urlSpawn: CFG.urlSpawn } };

/** Run one (stage, section, faction) measurement. */
async function measure(stage, sec, faction) {
  const squad = SQUADS[faction];
  // dx is relative to P1; at load time P1 sits at internal screen x 100, which is what the `spawn=` URL string assumes.
  const urlSpawn = squad.map((v, i) => `${faction}:${v}@${SLOTS[i].sx - 100},${SLOTS[i].z - 70}`).join(',');
  const q = [`autotest=1`, `seed=${CFG.seed}`, `skipTo=gameplay`, `nowaves=1`, `godmode=1`, `chars=0`,
    `stage=${stage.number}`, `section=${sec.index}`];
  if (CFG.urlSpawn) q.push(`spawn=${urlSpawn}`);
  await page.goto(`http://localhost:${port}/index.html?${q.join('&')}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 20000 });

  const shot = await page.evaluate(async ([faction, squad, slots, settle, frames, urlSpawn, wantPng]) => {
    const G = window.__game, SV = window.__sv;
    G.step(settle);                                  // clear the section banner and let the backdrop settle
    const world = G.world;
    const cam = world.camera, p1 = world.players[0];
    let placed = [];
    if (!urlSpawn) {
      // Same code path as the `spawn=` URL param (gameplay.spawnEnemy: P1.x + dx, P1.z + dz), but issued after the
      // settle so the squad stands where we put it instead of where 160 frames of AI dragged it.
      const px = p1.x - cam.x;
      placed = squad.map((v, i) => ({ variant: v, dx: Math.round(slots[i].sx - px), dz: Math.round(slots[i].z - p1.z) }));
      for (const s of placed) G.spawnEnemy(faction, s.variant, s.dx, s.dz);
    }
    G.step(frames);
    const canvas = document.getElementById('game');
    const A = SV.grab(canvas);
    const pngA = wantPng ? canvas.toDataURL('image/png') : '';
    // --- B: same frame, enemies deleted. loop.step(0) re-renders with no world update, so everything else is identical.
    const drop = (kinds) => { for (const e of world.entities.slice()) if (kinds.includes(e.kind)) world.remove(e); };
    drop(['enemy', 'boss', 'projectile']);
    G.step(0);
    const B = SV.grab(canvas);
    const pngB = wantPng ? canvas.toDataURL('image/png') : '';
    // --- C: the player deleted too -> the pure stage (props, hazards, FX, backdrop, HUD).
    drop(['player']);
    G.step(0);
    const C = SV.grab(canvas);
    const pngC = wantPng ? canvas.toDataURL('image/png') : '';

    const w = A.w, h = A.h;
    const rows = { sky: [90, 270], floor: [300, 640], floorRows: [400, 680] };
    const mask = SV.maskFromDiff(A.px, B.px, w, h, rows.sky[0], 700);
    const shadow = SV.classifyShadow(A.px, C.px, mask, w, h);       // the actors' own cast shadows, not their bodies
    let nMask = 0, nShadow = 0;
    for (let p = 0; p < mask.length; p++) { if (mask[p]) { nMask++; if (shadow[p]) nShadow++; } }
    const exact = SV.separation(A.px, C.px, mask, w, h, shadow);
    const shadowOnly = SV.separation(A.px, C.px, shadow, w, h, null);
    // cross-check with the estimator the reference frame has to use (no clean plate available there)
    const proxyBack = SV.localBackdrop(A.px, mask, w, h, 24);
    const proxy = SV.separation(A.px, proxyBack, mask, w, h, shadow);
    // fingerprint of the clean plate: proves the stage render is identical across the faction runs
    let fp = 0; for (let i = 0; i < C.px.length; i += 997) fp = (fp * 31 + C.px[i]) >>> 0;
    // optional mask overlay so the isolation can be eyeballed: magenta = actor body, cyan = the actor's cast shadow
    let pngM = '';
    if (wantPng) {
      const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
      const mg = mc.getContext('2d');
      const id = mg.createImageData(w, h);
      for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
        const j = p * 4;
        const dim = (v) => (v * 0.35) | 0;
        if (mask[p] && shadow[p]) { id.data[i] = 0; id.data[i + 1] = 255; id.data[i + 2] = 255; }
        else if (mask[p]) { id.data[i] = 255; id.data[i + 1] = 0; id.data[i + 2] = 255; }
        else { id.data[i] = dim(C.px[j]); id.data[i + 1] = dim(C.px[j + 1]); id.data[i + 2] = dim(C.px[j + 2]); }
        id.data[i + 3] = 255;
      }
      mg.putImageData(id, 0, 0);
      pngM = mc.toDataURL('image/png');
    }
    const enemies = G.summary().enemies.map((e) => ({ variant: e.variant, x: Math.round(e.x), z: Math.round(e.z), state: e.state }));
    return {
      bands: {
        sky: SV.band(C.px, w, rows.sky[0], rows.sky[1]),
        floor: SV.band(C.px, w, rows.floor[0], rows.floor[1]),
        floorRows: SV.band(C.px, w, rows.floorRows[0], rows.floorRows[1]),
      },
      exact, proxy, shadowOnly, shadowPct: nMask ? 100 * nShadow / nMask : 0, placed, enemies, cleanFingerprint: fp, urlSpawnString: null,
      png: { A: pngA, B: pngB, C: pngC, M: pngM },
      errors: G.summary().errors.slice(0, 3),
    };
  }, [faction, squad, SLOTS, CFG.settle, CFG.frames, CFG.urlSpawn, !!CFG.out]);

  shot.urlSpawnString = urlSpawn;
  if (CFG.out) {
    const base = `s${stage.number}-${sec.id}-${faction}`;
    await savePng(shot.png.A, `${base}-actors.png`);
    await savePng(shot.png.B, `${base}-noenemies.png`);
    await savePng(shot.png.C, `${base}-stage.png`);
    await savePng(shot.png.M, `${base}-mask.png`);
  }
  delete shot.png;
  return shot;
}

// ---------------------------------------------------------------- run
for (const stage of STAGE_LIST) {
  if (CFG.stages.length && !CFG.stages.includes(stage.number)) continue;
  for (const sec of stage.sections) {
    if (CFG.sections.length && !CFG.sections.includes(sec.index)) continue;
    let bandsRow = null;
    for (const faction of factions) {
      const r = await measure(stage, sec, faction);
      if (!bandsRow) {
        bandsRow = { stage: stage.number, stageName: stage.name, section: sec.index, id: sec.id, name: sec.name,
          backdrop: sec.backdrop, floor: sec.floor, ...r.bands, cleanFingerprint: r.cleanFingerprint };
        results.bands.push(bandsRow);
      } else if (bandsRow.cleanFingerprint !== r.cleanFingerprint) {
        bandsRow.warning = 'clean plate differed between faction runs';
      }
      results.separation.push({ stage: stage.number, section: sec.index, id: sec.id, name: sec.name, faction,
        squad: SQUADS[faction], spawn: r.urlSpawnString, placed: r.placed, enemies: r.enemies,
        exact: r.exact, proxy: r.proxy, shadowOnly: r.shadowOnly, shadowPct: r.shadowPct, errors: r.errors });
      if (!CFG.json) process.stderr.write(`  measured ${stage.number}/${sec.id} ${faction} (${r.exact.pixels} actor px)\n`);
    }
  }
}

// ---------------------------------------------------------------- reference frames
for (const ref of CFG.refs) {
  const file = path.resolve(ref);
  const ext = /\.jpe?g$/i.test(file) ? 'jpeg' : 'png';
  const src = `data:image/${ext};base64,` + fs.readFileSync(file).toString('base64');
  await page.goto('about:blank');
  const r = await page.evaluate(async ([src, bands]) => {
    const SV = window.__sv;
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const { px, w, h } = SV.grab(c);
    const rows = {
      sky: [Math.round(bands.sky[0] / 720 * h), Math.round(bands.sky[1] / 720 * h)],
      floor: [Math.round(bands.floor[0] / 720 * h), Math.round(bands.floor[1] / 720 * h)],
      floorRows: [Math.round(bands.floorRows[0] / 720 * h), Math.round(bands.floorRows[1] / 720 * h)],
    };
    // no clean plate for someone else's screenshot: the most saturated 4% of the pixels below the HUD are the actors
    const mask = SV.maskFromSaturation(px, w, h, rows.sky[0], Math.round(h * 0.96), 0.04);
    const back = SV.localBackdrop(px, mask, w, h, Math.round(h * 0.034));
    return {
      size: [w, h], rows,
      bands: { sky: SV.band(px, w, rows.sky[0], rows.sky[1]), floor: SV.band(px, w, rows.floor[0], rows.floor[1]),
        floorRows: SV.band(px, w, rows.floorRows[0], rows.floorRows[1]) },
      proxy: SV.separation(px, back, mask, w, h, null),
    };
  }, [src, BANDS]);
  results.reference.push({ file, ...r });
}

// ---------------------------------------------------------------- report
const pc = (n) => (n * 100).toFixed(0).padStart(3) + '%';
const f1 = (n) => n.toFixed(1).padStart(5);
const sgn = (n) => (n >= 0 ? '+' : '') + (n * 100).toFixed(0);

if (CFG.json) {
  console.log(JSON.stringify({ ...results, pageErrors }, null, 2));
} else {
  console.log('\n=== BACKDROP BANDS (actor-free stage render) ==========================================================');
  console.log('                                       sky 90-270      floor 300-640    floor rows 400-680');
  console.log('BOARD SECTION                          val   sat        val   sat        val   sat');
  for (const b of results.bands) {
    console.log(`  ${b.stage}   ${(b.section + ' ' + b.name).padEnd(34)} ${pc(b.sky.valMean)}  ${pc(b.sky.satMean)}      ${pc(b.floor.valMean)}  ${pc(b.floor.satMean)}      ${pc(b.floorRows.valMean)}  ${pc(b.floorRows.satMean)}${b.warning ? '   ** ' + b.warning : ''}`);
  }
  console.log('\n=== ACTOR / STAGE SEPARATION (actor pixels vs the backdrop directly behind them) ======================');
  console.log('  dE = Oklab distance x100 (all-pixel mean) | edge = dE on silhouette pixels | p10 = the 10th percentile');
  console.log(`  lost% = share of actor pixels under dE ${results.separation[0] ? results.separation[0].exact.lostThreshold : 10} (they merge into the ground)`);
  console.log('');
  console.log('BOARD SECTION                     FACTION      actV  bgV   dV    actS  bgS   dS      dE   edge   p10  lost%');
  for (const s of results.separation) {
    const e = s.exact;
    console.log(`  ${s.stage}   ${(s.section + ' ' + s.name).padEnd(28)} ${s.faction.padEnd(11)} ${pc(e.actorVal)} ${pc(e.bgVal)} ${sgn(e.dVal).padStart(4)}  ${pc(e.actorSat)} ${pc(e.bgSat)} ${sgn(e.dSat).padStart(4)}   ${f1(e.dE)} ${f1(e.edgeDE)} ${f1(e.dEp10)} ${f1(e.lostPct)}`);
  }
  console.log('\n=== WORST FIRST (least separation) ===================================================================');
  const ranked = results.separation.slice().sort((a, b) => a.exact.dE - b.exact.dE);
  console.log('RANK  BOARD SECTION                     FACTION       dE   edge   p10  lost%   dV     dS');
  ranked.forEach((s, i) => {
    const e = s.exact;
    console.log(`  ${String(i + 1).padStart(2)}    ${s.stage}   ${(s.section + ' ' + s.name).padEnd(28)} ${s.faction.padEnd(11)} ${f1(e.dE)} ${f1(e.edgeDE)} ${f1(e.dEp10)} ${f1(e.lostPct)}  ${sgn(e.dVal).padStart(4)}  ${sgn(e.dSat).padStart(4)}`);
  });
  for (const r of results.reference) {
    console.log(`\n=== REFERENCE ${path.basename(r.file)} (${r.size[0]}x${r.size[1]}) ==============================`);
    console.log(`  sky   val ${pc(r.bands.sky.valMean)}  sat ${pc(r.bands.sky.satMean)}`);
    console.log(`  floor val ${pc(r.bands.floor.valMean)}  sat ${pc(r.bands.floor.satMean)}`);
    console.log(`  actors (top 4% saturated proxy): val ${pc(r.proxy.actorVal)}  sat ${pc(r.proxy.actorSat)}  vs local backdrop val ${pc(r.proxy.bgVal)} sat ${pc(r.proxy.bgSat)}`);
    console.log(`  separation: dE ${f1(r.proxy.dE)}  edge ${f1(r.proxy.edgeDE)}  p10 ${f1(r.proxy.dEp10)}  lost% ${f1(r.proxy.lostPct)}   dV ${sgn(r.proxy.dVal)}  dS ${sgn(r.proxy.dSat)}`);
  }
  if (results.separation.length && results.reference.length) {
    console.log('\n  (our rows carry a `proxy` block measured with the same estimator as the reference; use --json to see it)');
  }
  if (pageErrors.length) console.log('\nPAGE ERRORS', pageErrors.slice(0, 5));
}

await browser.close();
server.close();
