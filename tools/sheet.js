// Contact-sheet generator for rigs (dev tool). Open tools/sheet.html (served by tools/server.js) with:
//   ?char=<id>                  a playable character (content/characters), default brunhild
//   ?enemy=<type>:<variant>     an enemy from content/enemies (falls back to the dummy def when the registry is missing)
//   &mode=anims|strip|attacks|closeup|cast   (default anims)
//     anims    every keyframe of every animation (or &anims=a,b), one row per animation
//     strip    N evenly spaced samples of looping animations (&anims=walk,run &samples=8): the motion test
//     attacks  every &step frames of the attack animations, hit frames marked red
//     closeup  a few picks at high zoom (&anims=idle:0,attack1:hit,attack3:hit &zoom=6)
//     cast     every playable character (and &enemies=1 every registered enemy) in the same 4 picks
//   &zoom=3 &cols=9 &cw=100 &ch=124 &bg=docks|#hex &facing=-1 (mirror test)
// Every cell is rendered at 1x through drawRig (chains, snapping and smears behave exactly as in game), then
// pixel-zoomed. window.__sheet = { ready, error, bench(n), audit() } for headless capture (tools/sheet-capture.js).
import { CHARACTERS, getCharacter } from '../src/content/characters/index.js';
import { buildRig, drawRig, computeJoints } from '../src/art/rig.js';
import { makePose } from '../src/art/poses.js';
import { rad } from '../src/engine/math.js';
import { AnimPlayer } from '../src/game/animation.js';
import { drawShadowScreen } from '../src/art/fx.js';
import { PALETTES } from '../src/art/palettes.js';
import { makeBaseAnims } from '../src/art/animLib.js';

/** Plain generic rig used when an enemy is not in the registry (default parts, base anims). */
function makeDummyDef(type, variant) {
  const pal = PALETTES[variant] || (type === 'typeB' || type === 'sootborn' ? PALETTES.goblin : PALETTES.automaton);
  return { id: `${type}:${variant}`, type, variant, name: `DUMMY ${variant || ''}`.toUpperCase(), build: { palette: pal, weapon: { attach: 'handR', length: 24 } }, anims: makeBaseAnims({ armR: [25, 10], weapon: -20 }) };
}

const q = new URLSearchParams(location.search);
const mode = q.get('mode') || 'anims';
const zoom = Number(q.get('zoom') || 3);
const FACING = Number(q.get('facing') || 1) < 0 ? -1 : 1;
const CELL_W = Number(q.get('cw') || 100), CELL_H = Number(q.get('ch') || 124), FEET = CELL_H - 16, LABEL_W = 64;
const BG = ['#3a3446', '#332e3e'];
const bgOpt = q.get('bg');
const ALL = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'attack1', 'attack2', 'attack3', 'attack4', 'jumpAttack', 'landAttack', 'dashAttack', 'special', 'super',
  'dodge', 'taunt', 'grab', 'grabHold', 'grabHit', 'throw', 'throwBack', 'hurt', 'hurtAir', 'knockdown', 'lying', 'getup', 'dead', 'win'];

const scratch = document.createElement('canvas'); scratch.width = CELL_W; scratch.height = CELL_H;
const sctx = scratch.getContext('2d');
const sheet = document.getElementById('sheet');
const out = sheet.getContext('2d');

/** Resolve an enemy def from content/enemies (any of: getEnemyDef(type, variant), an exported array of defs) or the dummy. */
async function resolveEnemy(spec) {
  const [type, variant] = spec.split(':');
  try {
    const m = await import('../src/content/enemies/index.js');
    const fn = m.getEnemyDef || m.getEnemy || m.enemyDef || (typeof m.default === 'function' ? m.default : null);
    if (fn) { const d = fn(type, variant); if (d && d.build) return d; }
    for (const k of Object.keys(m)) {
      const v = m[k];
      if (Array.isArray(v)) { const d = v.find((e) => e && e.type === type && (!variant || e.variant === variant)); if (d && d.build) return d; }
    }
  } catch (e) { console.warn('enemy registry not available; using the dummy def', e && e.message); }
  return makeDummyDef(type, variant);
}
/** Every registered enemy rig (ENEMY_GALLERY, else any exported def array) for cast mode, or [] when the registry is missing. */
async function allEnemies() {
  try {
    const m = await import('../src/content/enemies/index.js');
    if (Array.isArray(m.ENEMY_GALLERY)) return m.ENEMY_GALLERY.filter((e) => e && e.build);
    const all = [];
    for (const k of Object.keys(m)) { const v = m[k]; if (Array.isArray(v) && v.length && v[0] && v[0].build) all.push(...v); }
    return all;
  } catch { /* not there yet */ }
  return [];
}

function makeEntry(def) { return { def, rig: buildRig(def.build || {}), anim: new AnimPlayer(def.anims || {}) }; }
function drawFloor(alt) {
  if (bgOpt === 'docks') {
    sctx.fillStyle = '#1f2a44'; sctx.fillRect(0, 0, CELL_W, CELL_H);
    for (let y = FEET - 24; y < CELL_H; y += 6) { sctx.fillStyle = (y / 6 | 0) % 2 ? '#3A2E24' : '#443629'; sctx.fillRect(0, y, CELL_W, 6); }
    return;
  }
  sctx.fillStyle = bgOpt && bgOpt[0] === '#' ? bgOpt : BG[alt ? 1 : 0]; sctx.fillRect(0, 0, CELL_W, CELL_H);
  sctx.fillStyle = 'rgba(0,0,0,0.25)'; sctx.fillRect(0, FEET, CELL_W, CELL_H - FEET);
}
/** Rigs larger than the cell (Hoister x2, Regent Engine x2.8) would clip: fit them to the cell instead. */
function cellFit(e) { return Math.min(1, (FEET - 4) / (80 * e.rig.scale), (CELL_W - 4) / (72 * e.rig.scale)); }
function drawFit(e) {
  const f = cellFit(e);
  if (f >= 1) { drawRig(sctx, e.rig, e.anim.pose, { x: CELL_W / 2, y: FEET, facing: FACING }); return; }
  sctx.save(); sctx.translate(CELL_W / 2, FEET); sctx.scale(f, f);
  drawRig(sctx, e.rig, e.anim.pose, { x: 0, y: 0, facing: FACING });
  sctx.restore();
}
function renderCell(e, opts = {}) {
  drawFloor(opts.alt);
  drawShadowScreen(sctx, CELL_W / 2, FEET, 34 * e.rig.scale * cellFit(e), 0.45);
  drawFit(e);
}
function blit(x, y, z = zoom) { out.imageSmoothingEnabled = false; out.drawImage(scratch, 0, 0, CELL_W, CELL_H, x, y, CELL_W * z, CELL_H * z); }
function label(text, x, y, color = '#f4e8c8', size = 12) { out.fillStyle = color; out.font = `bold ${size}px monospace`; out.textBaseline = 'top'; out.fillText(text, x, y); }
/** Advance n ticks, drawing each into the scratch so secondary motion (chains, puffs) integrates like in game. */
function tickDraw(e, n) { for (let i = 0; i < n; i++) { e.anim.tick(); drawFit(e); } }
/** Warm the chains: play the anim through once (drawing into the scratch) then restart it. */
function warm(e, name) {
  e.anim.play(name, { restart: true, fallback: 'idle' }); tickDraw(e, Math.max(8, e.anim.length));
  e.anim.play(name, { restart: true, fallback: 'idle' }); drawFit(e);
}
function seekHit(e) { let g = 0; while (!(e.anim.frame.hitbox || e.anim.frame.hitboxes) && g++ < 200 && !e.anim.done) tickDraw(e, 1); tickDraw(e, 1); }
function sizeSheet(w, h) { sheet.width = w; sheet.height = h; out.fillStyle = '#1c1822'; out.fillRect(0, 0, w, h); }
const hasHit = (f) => !!(f.hitbox || f.hitboxes);

function modeAnims(def) {
  const e = makeEntry(def);
  const names = (q.get('anims') ? q.get('anims').split(',') : ALL).filter((n) => def.anims && def.anims[n]);
  let maxKeys = 1; for (const n of names) maxKeys = Math.max(maxKeys, def.anims[n].frames.length);
  const cols = Math.min(maxKeys, Number(q.get('cols') || 9));
  const rowsPer = names.map((n) => Math.ceil(def.anims[n].frames.length / cols));
  const totalRows = rowsPer.reduce((a, b) => a + b, 0);
  sizeSheet(LABEL_W * zoom / 2 + cols * CELL_W * zoom, totalRows * (CELL_H * zoom + 4) + 8);
  let y = 4;
  names.forEach((n, ni) => {
    const frames = def.anims[n].frames;
    warm(e, n);
    const L = e.anim.length;
    let captured = 0, guard = 0;
    label(n, 4, y + 4, '#e2b34a', 14);
    label(`${frames.length} keys / ${L}f`, 4, y + 22, '#9a8f7a', 11);
    while (captured < frames.length && guard++ < 4000) {
      if (e.anim.newFrame && e.anim.frameIndex === captured) {
        const f = frames[captured];
        renderCell(e, { alt: captured % 2 });
        const cx = LABEL_W * zoom / 2 + (captured % cols) * CELL_W * zoom, cy = y + Math.floor(captured / cols) * (CELL_H * zoom + 4);
        blit(cx, cy);
        label(`#${captured} ${f.dur}f${f.ease ? ' ' + f.ease : ''}`, cx + 3, cy + 2, '#f4e8c8', 11);
        if (hasHit(f)) { out.fillStyle = '#e03a3a'; out.fillRect(cx, cy + CELL_H * zoom - 4, CELL_W * zoom, 4); }
        if (f.smear) label('smear', cx + 3, cy + 14, '#8fe3ff', 10);
        if (f.armor) label('armor', cx + CELL_W * zoom - 40, cy + 14, '#ffb060', 10);
        if (f.invuln) label('invuln', cx + CELL_W * zoom - 44, cy + 26, '#a0ffa0', 10);
        captured++;
        if (captured >= frames.length) break;
      }
      if (e.anim.done) break;
      e.anim.tick(); drawRig(sctx, e.rig, e.anim.pose, { x: CELL_W / 2, y: FEET, facing: FACING });
    }
    y += rowsPer[ni] * (CELL_H * zoom + 4);
  });
}

function modeStrip(def) {
  const e = makeEntry(def);
  const names = (q.get('anims') || 'walk,run').split(',').filter((n) => def.anims[n]);
  const samples = Number(q.get('samples') || 8);
  sizeSheet(LABEL_W * zoom / 2 + samples * CELL_W * zoom, names.length * (CELL_H * zoom + 4) + 8);
  names.forEach((n, ni) => {
    warm(e, n);
    const L = e.anim.length, y = 4 + ni * (CELL_H * zoom + 4);
    label(n, 4, y + 4, '#e2b34a', 14); label(`${L}f loop`, 4, y + 22, '#9a8f7a', 11);
    let t = 0;
    for (let i = 0; i < samples; i++) {
      const target = Math.round(i * L / samples);
      tickDraw(e, target - t); t = target;
      renderCell(e, { alt: i % 2 });
      const cx = LABEL_W * zoom / 2 + i * CELL_W * zoom;
      blit(cx, y);
      label(`t=${target}`, cx + 3, y + 2, '#f4e8c8', 11);
    }
  });
}

function modeAttacks(def) {
  const e = makeEntry(def);
  const names = (q.get('anims') || 'attack1,attack2,attack3,attack4,jumpAttack,dashAttack,special,super').split(',').filter((n) => def.anims[n]);
  const step = Number(q.get('step') || 3), maxCols = Number(q.get('cols') || 16);
  sizeSheet(LABEL_W * zoom / 2 + maxCols * CELL_W * zoom, names.length * (CELL_H * zoom + 4) + 8);
  names.forEach((n, ni) => {
    warm(e, n);
    const L = e.anim.length, y = 4 + ni * (CELL_H * zoom + 4);
    label(n, 4, y + 4, '#e2b34a', 14); label(`${L}f`, 4, y + 22, '#9a8f7a', 11);
    let t = 0, col = 0;
    while (col < maxCols && !(e.anim.done && t > 0)) {
      renderCell(e, { alt: col % 2 });
      const cx = LABEL_W * zoom / 2 + col * CELL_W * zoom;
      blit(cx, y);
      const f = e.anim.frame;
      label(`t=${t} #${e.anim.frameIndex}`, cx + 3, y + 2, '#f4e8c8', 11);
      if (hasHit(f)) { out.fillStyle = '#e03a3a'; out.fillRect(cx, y + CELL_H * zoom - 4, CELL_W * zoom, 4); label('HIT', cx + 3, y + 14, '#ff6a5a', 11); }
      tickDraw(e, step); t += step; col++;
      if (t >= L + step) break;
    }
  });
}

function pick(e, pk) {
  const [n, sel] = pk.split(':');
  warm(e, n);
  if (sel === 'hit') seekHit(e); else tickDraw(e, Number(sel || 0));
  return n + (sel ? ':' + sel : '');
}

function modeCloseup(def) {
  const e = makeEntry(def);
  const picks = (q.get('anims') || 'idle:0,walk:6,attack1:hit,attack3:hit,attack4:hit,hurt:2').split(',');
  sizeSheet(picks.length * CELL_W * zoom, CELL_H * zoom + 24);
  picks.forEach((pk, i) => {
    const name = pick(e, pk);
    renderCell(e, { alt: i % 2 });
    blit(i * CELL_W * zoom, 20);
    label(name, i * CELL_W * zoom + 4, 2, '#e2b34a', 14);
  });
}

async function modeCast() {
  const picks = (q.get('anims') || 'idle:0,walk:8,attack1:hit,hurt:2').split(',');
  const defs = CHARACTERS.slice();
  if (q.get('enemies')) for (const d of await allEnemies()) defs.push(d);
  sizeSheet(picks.length * CELL_W * zoom, defs.length * (CELL_H * zoom + 4) + 8);
  defs.forEach((def, ci) => {
    const e = makeEntry(def);
    picks.forEach((pk, i) => {
      const name = pick(e, pk);
      renderCell(e, { alt: i % 2 });
      const y = 4 + ci * (CELL_H * zoom + 4);
      blit(i * CELL_W * zoom, y);
      label(`${def.name || def.id} ${name}`, i * CELL_W * zoom + 4, y + 2, '#e2b34a', 12);
    });
  });
}

/**
 * Pose audit (window.__sheet.audit()): for every keyframe print the far-shoulder -> grip distance on two-handed keys
 * (must be <= upperArm + lowerArm + 2, else GRIP), the weapon-head centre (`weapon.headAt` px along the weapon from the near hand, default 32,
 * root space after root offset/rotation) and the lowest boot sole (must be within 2 px of the floor on ground keys,
 * else FLOOR). See docs/ART_STYLE.md section 5. Returns the lines; also logs them.
 */
function audit(def) {
  const rig = buildRig(def.build || {}), p = rig.p, reach = p.upperArm + p.lowerArm, lines = [];
  const air = /jump|fall|hurtAir|knockdown|lying|dead|dodge|win/;
  for (const name of Object.keys(def.anims || {})) (def.anims[name].frames || []).forEach((fr, i) => {
    const pose = makePose(fr.pose), J = computeJoints(rig, pose);
    const rr = rad(pose.root.rot), c = Math.cos(rr), s = Math.sin(rr), a = rad(J.weaponAngle);
    const scr = (x, y) => ({ x: x * c - y * s + pose.root.x, y: x * s + y * c + pose.root.y });
    const hAt = rig.weapon && rig.weapon.headAt != null ? rig.weapon.headAt : 32;
    const head = scr(J.handN.x + Math.sin(a) * hAt, J.handN.y + Math.cos(a) * hAt);
    const boot = Math.max(scr(J.ankleN.x, J.ankleN.y + p.footH * 0.5).y, scr(J.ankleF.x, J.ankleF.y + p.footH * 0.5).y);
    const d = pose.grip > 0 ? Math.hypot(J.grip.x - J.shoulderF.x, J.grip.y - J.shoulderF.y) : 0;
    const flags = (pose.grip > 0 && d > reach + 2 ? ' GRIP' : '') + (!air.test(name) && Math.abs(boot) > 2.5 ? ' FLOOR' : '');
    lines.push(`${name} #${i} grip=${pose.grip} d=${d.toFixed(0)} head(${head.x.toFixed(0)},${head.y.toFixed(0)}) boot=${boot.toFixed(1)}${flags}`);
  });
  console.log(lines.join('\n'));
  return lines;
}

/** Microbenchmark: average drawRig cost in ms over `n` draws cycling attack/walk poses (window.__sheet.bench). */
function bench(def, n = 2000) {
  const e = makeEntry(def);
  e.anim.play('attack1', { restart: true, fallback: 'idle' });
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { e.anim.tick(); if (e.anim.done) e.anim.play(i % 2 ? 'walk' : 'attack3', { restart: true, fallback: 'idle' }); drawRig(sctx, e.rig, e.anim.pose, { x: 50, y: 100, facing: i & 1 ? 1 : -1 }); }
  return (performance.now() - t0) / n;
}

(async () => {
  try {
    const def = q.get('enemy') ? await resolveEnemy(q.get('enemy')) : getCharacter(q.get('char') || 'brunhild');
    if (mode === 'anims') modeAnims(def);
    else if (mode === 'strip') modeStrip(def);
    else if (mode === 'attacks') modeAttacks(def);
    else if (mode === 'closeup') modeCloseup(def);
    else if (mode === 'cast') await modeCast();
    else throw new Error('unknown mode ' + mode);
    window.__sheet = { ready: true, error: null, width: sheet.width, height: sheet.height, bench: (n) => bench(def, n), audit: () => audit(def) };
  } catch (e) {
    window.__sheet = { ready: true, error: String(e && e.stack || e) };
    console.error(e);
  }
  window.__sheetReady = true;
})();
