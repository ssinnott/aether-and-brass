// Shared board-plaque art: everything both places a board is chosen have in common - the full-size
// BOARD SELECT plaques (screens/boardselect.js) and the compact row in the online co-op lobby
// (screens/lobby.js), which shows the group's boards on the same screen as the hero cards.
//
// A board reads the same in both: brass frame and rivets, STAGE N, a hand-drawn vignette of the
// board drawn from its `preview` block, or - when the board is still sealed - a riveted steel hatch
// with a padlock on it and '? ? ?' where the name goes. Only the size and the amount of detail
// differ; boardselect.js adds the unlock reveal (the hatch splitting into retracting doors) on top.
import { VIEW_W, UI } from '../../constants.js';
import { drawText, measureText } from '../../engine/text.js';
import { rrect, rivetLine, circle, poly, line, gear } from '../../art/shapes.js';

/** Fallback vignette for a board whose data carries no `preview` block. */
export const DEFAULT_PREVIEW = { skyTop: '#0E1424', skyBot: '#3A2E48', ground: '#2B211C', accent: '#FFB038', motif: 'city' };
/** Height of a compact plaque (the lobby row). The full BOARD SELECT plaque is taller. */
export const PLAQUE_H = 100;

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** One centred row of `n` cards: they shrink as boards are added rather than overflowing the view. */
export function rowMetrics(n, { maxW, gap, pad, minW = 96, viewW = VIEW_W } = {}) {
  const w = Math.max(minW, Math.min(maxW, Math.floor((viewW - pad - (n - 1) * gap) / Math.max(1, n))));
  return { w, gap, x0: Math.round((viewW - (n * w + (n - 1) * gap)) / 2) };
}

/** Split text into lines that fit `maxW` px at `size`, breaking on spaces (a single long word is left long). */
export function wrapText(text, maxW, size = 1) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && measureText(next, size) > maxW) { lines.push(cur); cur = word; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * A compact board plaque, sized for a row that shares the screen with something else. `board` is
 * `{ stage, index, unlocked, record, prev }` - the same shape BOARD SELECT builds.
 * @param {{ sel?: boolean, cursor?: string|null, deny?: number, bob?: boolean }} [o]
 */
export function drawBoardPlaque(ctx, board, x, y, w, h, f, o = {}) {
  const { sel = false, cursor = null, deny = 0, bob = true } = o;
  const st = board.stage, sealed = !board.unlocked;
  const frameCol = sealed ? '#6a6a72' : sel ? UI.brassLight : UI.brass;
  const shake = sel && deny > 0 ? Math.round(Math.sin(deny * 1.6) * (deny / 6)) : 0;
  // the chosen plaque lifts and bobs, as it does on BOARD SELECT - a brighter frame alone is too
  // quiet a signal at this size
  const lift = sel && bob ? -2 + Math.round(Math.sin(f * 0.06) * 1.5) : 0;
  ctx.save();
  ctx.translate(x + shake, y + lift);
  rrect(ctx, 0, 0, w, h, 5, sealed ? '#241e26' : '#3a2a18', frameCol, sel ? 2 : 1);
  rrect(ctx, 3, 3, w - 6, h - 6, 3, 'rgba(12,8,16,0.88)', sealed ? '#3c3a44' : UI.brassDark, 1);
  const rivets = Math.max(4, Math.round(w / 26));
  rivetLine(ctx, 8, 7, w - 8, 7, rivets, 1.2, frameCol);
  rivetLine(ctx, 8, h - 7, w - 8, h - 7, rivets, 1.2, frameCol);
  drawText(ctx, `STAGE ${st.number || board.index + 1}`, w / 2, 11, { size: 1, color: sealed ? UI.steel : UI.brassLight, align: 'center' });
  // the art window: the board's vignette, or the hatch and padlock that stand in for it while sealed
  const ax = 7, ay = 20, aw = w - 14, ah = h - 56;   // leaves room for two lines of name below
  if (sealed) {
    drawLockHatch(ctx, ax, ay, aw, ah);
    drawPadlock(ctx, ax + aw / 2, ay + ah / 2 + 3, { breathe: f });
  } else {
    drawVignette(ctx, ax, ay, aw, ah, st.preview || DEFAULT_PREVIEW, f);
    if (board.record) {
      // a clear is stamped on the picture: there is no room for the full CLEARED plate down here
      const label = board.record.rank ? `CLEARED ${board.record.rank}` : 'CLEARED';
      const cw = measureText(label, 1) + 8;
      rrect(ctx, ax + 3, ay + ah - 12, cw, 10, 2, 'rgba(60,40,24,0.85)', UI.brassDark, 1);
      drawText(ctx, label, ax + 3 + cw / 2, ay + ah - 10, { size: 1, color: UI.brassLight, align: 'center' });
    }
  }
  ctx.strokeStyle = sealed ? '#3c3a44' : UI.brassDark; ctx.lineWidth = 1;
  ctx.strokeRect(ax + 0.5, ay + 0.5, aw - 1, ah - 1);
  // the caption: the board's name, or '? ? ?' and what has to be cleared to open it
  const nameY = ay + ah + 6;
  if (sealed) {
    drawText(ctx, '? ? ?', w / 2, nameY, { size: 1, color: '#6a6a72', align: 'center' });
    const req = board.prev;
    drawText(ctx, req ? `CLEAR STAGE ${req.number || board.index}` : 'LOCKED', w / 2, nameY + 11, { size: 1, color: deny > 0 ? UI.red : UI.steel, align: 'center' });
  } else {
    wrapText(st.name, w - 12, 1).slice(0, 2).forEach((s, k) => {
      drawText(ctx, s, w / 2, nameY + k * 11, { size: 1, color: sel ? UI.white : UI.paper, align: 'center' });
    });
  }
  ctx.restore();
  // the cursor: a turning gear either side of the plaque, as on BOARD SELECT
  if (cursor) {
    const cy = y + lift + h / 2, col = deny > 0 ? UI.red : cursor;
    gear(ctx, x + shake - 8, cy, 5, 8, col, '#3a2010', 1, f * 0.05, 2);
    gear(ctx, x + shake + w + 8, cy, 5, 8, col, '#3a2010', 1, -f * 0.05, 2);
  }
}

/** The board's vignette: sky ramp, ground band and a motif silhouette drawn from the stage's `preview` block. */
export function drawVignette(ctx, x, y, w, h, pv, f) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, pv.skyTop); g.addColorStop(1, pv.skyBot);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  if (pv.motif === 'sky') drawSkyMotif(ctx, x, y, w, h, pv, f);
  else if (pv.motif === 'works') drawWorksMotif(ctx, x, y, w, h, pv, f);
  else if (pv.motif === 'crop') drawCropMotif(ctx, x, y, w, h, pv, f);
  else drawCityMotif(ctx, x, y, w, h, pv, f);
  const gh = pv.groundH == null ? 10 : pv.groundH;
  if (gh > 0) {
    ctx.fillStyle = pv.ground; ctx.fillRect(x, y + h - gh, w, gh);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + h - gh, w, 2);
  }
  ctx.restore();
}

/** Board 1: tiered Calderwick terraces under a moon and the lit summit, chimney stacks and window dots. */
function drawCityMotif(ctx, x, y, w, h, pv, f) {
  const base = y + h - 10;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 10; i++) ctx.fillRect(x + ((i * 53 + 9) % w), y + ((i * 29 + 3) % Math.max(1, h - 40)), 1, 1);
  circle(ctx, x + w * 0.74, y + 13, 6, '#F4E8C8', null, 0);
  ctx.globalAlpha = 0.22; circle(ctx, x + w * 0.44, y + h - 26, 13, '#4DF0E0', null, 0); ctx.globalAlpha = 1;
  ctx.fillStyle = '#241C34';
  for (let i = 0; i < 7; i++) {
    const tw = Math.round(w / 7), tx = x + i * tw, th = 16 + ((i * 13) % 5) * 5;
    ctx.fillRect(tx, base - th, tw - 2, th);
    ctx.fillRect(tx + 2, base - th - 4, tw - 6, 4);
  }
  ctx.fillStyle = '#150F20';
  for (let i = 0; i < 5; i++) {
    const tw = Math.round(w / 5), tx = x + i * tw, th = 10 + ((i * 7) % 4) * 4;
    ctx.fillRect(tx, base - th, tw - 3, th);
  }
  ctx.fillStyle = pv.accent;
  for (let i = 0; i < 14; i++) if (((i * 7 + (f >> 5)) % 4) !== 0) ctx.fillRect(x + 4 + (i * 11) % (w - 8), base - 8 - (i % 3) * 6, 2, 2);
  // two stacks trailing steam
  for (const sx of [x + w * 0.22, x + w * 0.72]) {
    ctx.fillStyle = '#150F20'; ctx.fillRect(sx, base - 34, 3, 34);
    for (let k = 0; k < 3; k++) circle(ctx, sx + 1.5 + k, base - 38 - k * 6 - ((f >> 3) % 6), 2 + k, 'rgba(220,220,230,0.22)', null, 0);
  }
}

/** Board 2: a cloud sea at dawn with the Ninth Wing's hulls over it and a lightning fork. */
function drawSkyMotif(ctx, x, y, w, h, pv, f) {
  const base = y + h - 10;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let i = 0; i < 4; i++) {
    const cy = y + 20 + i * 12, off = ((f >> 4) + i * 17) % (w + 40);
    ctx.fillRect(x - 20 + off, cy, 34 - i * 4, 3);
    ctx.fillRect(x - 20 + (off + w / 2) % (w + 40), cy + 4, 22 - i * 3, 2);
  }
  // cloud sea: jittered radii and heights so it reads as weather rather than a row of bubbles
  for (let i = 0; i < 11; i++) {
    const jitter = (i * 37) % 13;
    circle(ctx, x - 6 + (i * (w + 12)) / 10, base + 2 - (jitter % 5), 7 + (jitter % 7), 'rgba(240,220,220,0.28)', null, 0);
  }
  // two airship hulls, the near one lit by the accent
  const hull = (hx, hy, hw, hh, fill) => {
    poly(ctx, [hx, hy, hx + hw * 0.82, hy - hh * 0.5, hx + hw, hy, hx + hw * 0.82, hy + hh * 0.5, hx, hy], fill, null, 0);
  };
  hull(x + w * 0.08, y + 30, w * 0.34, 12, '#2A2438');
  hull(x + w * 0.5, y + 20, w * 0.44, 16, '#171426');
  ctx.fillStyle = pv.accent;
  for (let i = 0; i < 3; i++) ctx.fillRect(x + w * 0.56 + i * 8, y + 19, 2, 2);
  // lightning every ~2s
  if ((f % 130) < 6) {
    const lx = x + w * 0.3;
    line(ctx, lx, y + 2, lx + 5, y + 16, '#e8f0ff', 1.5);
    line(ctx, lx + 5, y + 16, lx - 2, y + 24, '#e8f0ff', 1.5);
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#e8f0ff'; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
  }
}

/** Board 3: the Chandlery's works under a chalk sky — a long roof, four chimneys smoking, kiln mouths lit lime. */
function drawWorksMotif(ctx, x, y, w, h, pv, f) {
  const base = y + h - 12;
  // the lime haze the works stands in: a bright band across the bottom of the sky
  ctx.fillStyle = 'rgba(244,240,226,0.5)'; ctx.fillRect(x, base - 22, w, 22);
  // the works: one long shed with a shallow roof, the widest flat shape on any plaque
  ctx.fillStyle = '#6E6759'; ctx.fillRect(x + 6, base - 26, w - 12, 26);
  poly(ctx, [x + 6, base - 26, x + 22, base - 34, x + w - 22, base - 34, x + w - 6, base - 26], '#565046', null, 0);
  // four draw-kiln chimneys, with smoke standing straight up off them (nothing on this board blows sideways)
  for (let i = 0; i < 4; i++) {
    const sx = x + 16 + i * ((w - 32) / 3.4);
    ctx.fillStyle = '#4A443B'; ctx.fillRect(sx, base - 56, 5, 30);
    for (let k = 0; k < 3; k++) {
      const sy = base - 60 - k * 7 - ((f >> 3) % 7);
      circle(ctx, sx + 2.5, sy, 2 + k, `rgba(238,236,226,${0.3 - k * 0.07})`, null, 0);
    }
  }
  // the kiln mouths along the ground: the board's one saturated colour, and the only light in the picture. The
  // fourth slot is left out on purpose — that is where the handcart stands, and a cart drawn ON a lit kiln mouth
  // reads as a vehicle with headlights.
  const slot = (w - 24) / 5;
  for (let i = 0; i < 5; i++) {
    if (i === 3) continue;
    const kx = x + 12 + i * slot;
    ctx.fillStyle = '#2A2620'; ctx.fillRect(kx, base - 12, 12, 12);
    ctx.fillStyle = pv.accent;
    if (((i * 5 + (f >> 4)) % 7) !== 0) ctx.fillRect(kx + 2, base - 9, 8, 6);
  }
  // THE ROAD IS PAINTED HERE, not by drawVignette (stage3's preview sets `groundH: 0` for exactly this reason), so
  // that the cart can be drawn ON TOP of it. Everything else on this plaque stops at the road line; the cart has to
  // cross it, because a wheel whose bottom edge is exactly on the line still reads as hovering — a wheel sits IN the
  // road it is standing on, with its bottom couple of pixels swallowed by the surface.
  const road = pv.ground || '#B9AF95';
  ctx.fillStyle = road; ctx.fillRect(x, base, w, y + h - base);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, base, w, 2);
  // A LOADED HANDCART, STANDING IN THE ROAD: a flat load under a tarpaulin with the shaft standing up out of it,
  // and both wheels sunk 3px past the road line. A rounded tarp over a body between two wheels, floating above the
  // line, drew a car in the middle of a Victorian lime works.
  const cx = Math.round(x + 12 + 3 * slot), top = base - 11;
  line(ctx, cx + 1, top + 1, cx - 9, top - 6, '#4A3E2E', 2);          // the shaft, up and out to the left
  ctx.fillStyle = '#4A3E2E'; ctx.fillRect(cx, top, 22, 7);            // the body
  ctx.fillStyle = '#2E2A24'; ctx.fillRect(cx, top + 5, 22, 2);
  ctx.fillStyle = '#B0AE96'; ctx.fillRect(cx + 3, top - 4, 16, 4);    // the load under its tarpaulin
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx + 3, top - 2, 16, 2);
  // the wheels, crossing the road line, with the cart's shadow pooled under the axle
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(cx + 2, base + 1, 19, 2);
  circle(ctx, cx + 5, base + 1, 4, '#2E2A24', null, 0);
  circle(ctx, cx + 17, base + 1, 4, '#2E2A24', null, 0);
  ctx.fillStyle = road; ctx.fillRect(x, base + 5, w, y + h - base - 5);   // the road surface closes over the tyres
}

/** Board 4: the tailings at dusk under a sky of the guild's bladders, with one loaded net crossing on its line. */
function drawCropMotif(ctx, x, y, w, h, pv, f) {
  const base = y + h - 12;
  // the gas sitting on the field: a rose band along the bottom of the sky, which is where this board's light is
  ctx.fillStyle = 'rgba(255,87,176,0.16)'; ctx.fillRect(x, base - 26, w, 26);
  // THE BLADDERS, which are the subject of the plaque: pale silk bulbs at three depths, each one on its own line
  // with something of somebody's hanging off the end of it. They drift, so the picture is never the same twice.
  const bags = [[0.18, 20, 9], [0.52, 13, 12], [0.82, 26, 7]];
  for (let i = 0; i < bags.length; i++) {
    const [fx, by, r] = bags[i];
    const bx = x + ((fx * w + (f >> (5 + i))) % (w + 40)) - 20;
    if (bx < x - 24 || bx > x + w + 24) continue;
    const bob = Math.sin((f + i * 90) * 0.03) * 1.5;
    circle(ctx, bx, by + y + bob, r, '#9CC4D6', '#171426', 1);
    ctx.fillStyle = 'rgba(255,87,176,0.32)';
    ctx.beginPath(); ctx.ellipse(bx, by + y + bob + r * 0.25, r * 0.6, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    line(ctx, bx, by + y + bob + r, bx + 1, base - 14, 'rgba(20,16,32,0.8)', 1);
    ctx.fillStyle = '#9C893F'; ctx.fillRect(Math.round(bx - 4), Math.round(base - 18), 9, 5);
  }
  // the heaps: a low sawtooth of spoil, dark, with the gas pooling in the hollow behind each one
  ctx.fillStyle = '#3A4240';
  for (let i = 0; i < 6; i++) {
    const hx = x + i * (w / 5.4), hh = 8 + ((i * 11) % 4) * 4;
    poly(ctx, [hx - 22, base, hx, base - hh, hx + 24, base], '#3A4240', null, 0);
  }
  ctx.fillStyle = 'rgba(255,87,176,0.18)';
  for (let i = 0; i < 5; i++) ctx.fillRect(x + 8 + i * (w / 5), base - 4, 14, 4);
  // THE FIELD IS PAINTED HERE, not by drawVignette (stage4's preview sets `groundH: 0` for exactly this reason), so
  // that the loaded net can hang ACROSS the line rather than sit on top of a band drawn over it. On this board the
  // crop is always leaving the ground, and a net whose bottom edge stops at the horizon reads as a crate on a shelf.
  const field = pv.ground || '#4E5A55';
  ctx.fillStyle = field; ctx.fillRect(x, base, w, y + h - base);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, base, w, 2);
  // a wreck or two still in the field, half-buried, so the ground reads as somewhere a war came down
  ctx.fillStyle = '#2E3438'; ctx.fillRect(x + Math.round(w * 0.16), base - 5, 13, 5);
  ctx.fillStyle = '#2E3438'; ctx.fillRect(x + Math.round(w * 0.68), base - 4, 17, 4);
  // THE LOADED NET, on the line that crosses the whole frame: the one thing on this plaque that is going UP
  const cx = Math.round(x + w * 0.42), top = base - 20;
  line(ctx, x - 4, base - 34, x + w + 4, base - 26, 'rgba(20,16,32,0.9)', 2);
  line(ctx, x - 4, base - 34, x + w + 4, base - 26, '#6E6942', 1);
  line(ctx, cx + 6, base - 30, cx + 6, top, 'rgba(20,16,32,0.9)', 1);
  ctx.fillStyle = '#9C893F'; ctx.fillRect(cx - 4, top, 22, 16);
  ctx.fillStyle = '#5A5348'; ctx.fillRect(cx - 1, top + 3, 16, 10);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
  for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(cx - 4 + k * 5.5, top); ctx.lineTo(cx - 4 + k * 5.5, top + 16); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx - 4, top + 13, 22, 3);
  // and its shadow on the field, because it is between you and the light
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(cx - 2, base + 2, 18, 2);
  // the guild's pole lamp, the one saturated mark on the ground
  const lx = x + Math.round(w * 0.86);
  ctx.fillStyle = '#4A4E56'; ctx.fillRect(lx, base - 22, 2, 22);
  ctx.fillStyle = pv.accent;
  if (((f >> 4) % 9) !== 0) ctx.fillRect(lx - 2, base - 26, 6, 5);
}

/** The sealed plate behind a locked board: hatched steel with rivets. */
export function drawLockHatch(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#1d1a24'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(120,120,140,0.16)'; ctx.lineWidth = 1;
  for (let i = -h; i < w; i += 8) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
  rivetLine(ctx, x + 6, y + 6, x + w - 6, y + 6, 5, 1.5, '#5a5a66');
  rivetLine(ctx, x + 6, y + h - 6, x + w - 6, y + h - 6, 5, 1.5, '#5a5a66');
  ctx.restore();
}

/**
 * The hatch splitting into two doors that retract off either side, uncovering the vignette already drawn beneath.
 * @param {number} k 0 = shut, 1 = fully open
 */
export function drawHatchDoors(ctx, x, y, w, h, k) {
  const half = w / 2, shift = Math.round(k * (half + 2));
  for (const side of [-1, 1]) {
    const dx = side * shift, doorX = side < 0 ? x : x + half;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();          // never spill outside the art window
    ctx.beginPath(); ctx.rect(doorX + dx, y, half, h); ctx.clip(); // this door where it currently sits
    ctx.translate(dx, 0);
    drawLockHatch(ctx, x, y, w, h);
    ctx.restore();
  }
  // hot seam where the doors part, fading as the gap widens
  if (k < 1) {
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.9;
    line(ctx, x + half - shift, y, x + half - shift, y + h, '#ffe45a', 1.5);
    line(ctx, x + half + shift, y, x + half + shift, y + h, '#ffe45a', 1.5);
    ctx.restore();
  }
}

/** A brass padlock. `strain` bows the shackle before it breaks; `open` draws it snapped, `rot`/`alpha` tumble it. */
export function drawPadlock(ctx, cx, cy, opts = {}) {
  const { breathe = null, strain = 0, open = false, rot = 0, alpha = 1 } = opts;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  if (breathe != null) { const s = 1 + Math.sin(breathe * 0.04) * 0.02; ctx.scale(s, s); }
  ctx.translate(-cx, -cy);
  ctx.strokeStyle = strain > 0.6 ? '#c8c8d4' : '#8a8a96'; ctx.lineWidth = 3;
  ctx.beginPath();
  if (open) ctx.arc(cx + 5, cy - 7, 7, Math.PI * 1.15, Math.PI * 2.1);  // snapped: the shackle has sprung
  else ctx.arc(cx, cy - 6 - strain, 7, Math.PI, 0);
  ctx.stroke();
  rrect(ctx, cx - 11, cy - 6, 22, 17, 3, '#7a5a26', '#c8964a', 1);
  circle(ctx, cx, cy + 1, 2.5, '#1d1a24', null, 0);
  ctx.fillStyle = '#1d1a24'; ctx.fillRect(cx - 1, cy + 1, 2, 6);
  ctx.restore();
}
