// Stateless FX renderers + particle burst helpers (hit sparks, shockwaves, slash arcs, muzzle flash, shadows).
import { FLOOR_TOP, Z_MAX } from '../constants.js';
import { rad } from '../engine/math.js';
import { particles } from '../engine/particles.js';
import { pathStar, pathEllipse, pathPoly, paint } from './shapes.js';

/**
 * Floor drop shadow at world (x, z) for an entity at height y (shrinks with height).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number, shakeX?:number, shakeY?:number}} cam
 */
export function drawShadow(ctx, cam, x, y, z, w = 30, alpha = 0.4) {
  const sx = Math.round(x - cam.x + (cam.shakeX || 0)), sy = Math.round(FLOOR_TOP + z + (cam.shakeY || 0));
  const k = Math.max(0.45, 1 - y / 160);
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha * k;
  ctx.fillStyle = '#000';
  pathEllipse(ctx, sx, sy, w * 0.5 * k, w * 0.22 * k);
  ctx.fill();
  ctx.globalAlpha = prev;
}
/** Screen-space shadow ellipse (for menus/gallery). */
export function drawShadowScreen(ctx, sx, sy, w = 30, alpha = 0.4) {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha; ctx.fillStyle = '#000';
  pathEllipse(ctx, Math.round(sx), Math.round(sy), w * 0.5, w * 0.22); ctx.fill();
  ctx.globalAlpha = prev;
}

/**
 * Hit spark burst (screen coords): a starburst that grows then fades. t in [0,1].
 * @param {'light'|'heavy'|'launch'|'knockdown'|'grab'} type
 */
export function drawHitSpark(ctx, sx, sy, t, type = 'light', rot = 0) {
  const big = type === 'heavy' || type === 'launch' || type === 'knockdown';
  const r = (big ? 18 : 12) * (0.6 + 0.6 * Math.sin(Math.min(1, t) * Math.PI));
  ctx.save();
  ctx.globalAlpha = 1 - t * t;
  pathStar(ctx, sx, sy, r, r * 0.4, big ? 8 : 6, rot);
  paint(ctx, '#fff8d0', big ? '#ff9a30' : '#ffd050', 1.5);
  pathStar(ctx, sx, sy, r * 0.45, r * 0.2, big ? 8 : 6, rot + 0.4);
  paint(ctx, '#ffffff', null, 0);
  ctx.restore();
}

/** Expanding ring shockwave (screen coords). `flat` draws it as a floor ellipse. */
export function drawRing(ctx, sx, sy, t, r0 = 4, r1 = 60, color = '#ffffff', width = 3, flat = false) {
  const e = 1 - (1 - t) * (1 - t), r = r0 + (r1 - r0) * e;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, width * (1 - t));
  ctx.beginPath();
  if (flat) ctx.ellipse(sx, sy, r, r * 0.4, 0, 0, Math.PI * 2); else ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Slash arc: a crescent sweeping through `sweep` degrees around (sx, sy) at `radius`, facing-mirrored by `facing`.
 * `angle` = centre direction in degrees (0 = toward facing, negative = up).
 */
export function drawSlash(ctx, sx, sy, t, radius = 34, angle = 0, sweep = 110, facing = 1, color = '#e8f4ff', thickness = 7) {
  ctx.save();
  ctx.translate(sx, sy); ctx.scale(facing, 1);
  const a0 = rad(angle - sweep / 2), a1 = rad(angle + sweep / 2);
  const head = a0 + (a1 - a0) * Math.min(1, t * 1.6);
  const tail = a0 + (a1 - a0) * Math.max(0, t * 1.6 - 0.45);
  const th = thickness * (1 - t * 0.6);
  ctx.globalAlpha = 1 - t * t;
  ctx.beginPath();
  ctx.arc(0, 0, radius, tail, head);
  ctx.arc(0, 0, radius - th, head, tail, true);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
  ctx.restore();
}

/** Muzzle flash cone at (sx, sy) pointing along facing. */
export function drawMuzzleFlash(ctx, sx, sy, t, facing = 1, size = 14) {
  ctx.save();
  ctx.translate(sx, sy); ctx.scale(facing, 1);
  ctx.globalAlpha = 1 - t;
  const s = size * (0.7 + 0.5 * (1 - t));
  pathStar(ctx, s * 0.4, 0, s, s * 0.35, 5, t * 2);
  paint(ctx, '#fff0a0', '#ff8020', 1);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Spawn the standard particle burst for a hit at world coords. */
export function burstHit(x, y, z, type = 'light', facing = 1) {
  const big = type !== 'light';
  particles.burst('spark', x, y, z, big ? 12 : 7, { speed: big ? 5 : 3.5, up: 1, vx: facing * (big ? 1.5 : 0.8) });
  if (big) particles.spawn('ring', x, y, z, { size: 6, size1: big ? 46 : 26, color: type === 'launch' ? '#9ae8ff' : '#ffd080', width: 3, life: 16 });
  if (type === 'knockdown' || type === 'launch') particles.burst('dust', x, 0, z, 5, { speed: 2, up: 0.6 });
}
/** Landing / footstep dust puff at world coords. */
export function burstDust(x, z, count = 5, speed = 1.6) {
  particles.burst('dust', x, 0, z, count, { speed, up: 0.5, spread: 1.5 });
}
/** Prop break: debris + gear pieces + dust. */
export function burstBreak(x, y, z, color = '#8a6a40', count = 8) {
  particles.burst('debris', x, y, z, count, { speed: 3.5, up: 3, color, sizeJitter: 1.5 });
  particles.burst('gear', x, y, z, 2, { speed: 2.5, up: 3.5 });
  particles.burst('dust', x, 0, z, 6, { speed: 2, up: 0.8 });
}
/** Steam vent puff at world coords. */
export function burstSteam(x, y, z, count = 4) {
  particles.burst('steam', x, y, z, count, { speed: 0.8, up: 1.8, spread: 0.5, sizeJitter: 1.5 });
}
/** Floating damage / combo text. */
export function floatText(x, y, z, text, color = '#ffffff', size = 1) {
  particles.spawn('text', x, y, z, { text, color, size, vy: 1.1, life: 40 });
}

/** The wind's own colour: pale storm violet, so a gale reads as weather rather than as a hazard's tell. */
export const WIND_COLOR = '#d8d0ff';
/** Frames the once-per-section "this is the wind" banner holds: long enough to read over the first shove itself. */
export const WIND_BANNER = 80;

/**
 * WIND TELEGRAPH — the one renderer behind every whole-band shove on the boards: the Mooring Spine's `gust`
 * (game/hazards.js, which pushes along z) and a banking deck's `tilt` (game/platforms.js, which pushes along x).
 * Both go through here so that the two read as the same weather doing the same thing on two axes, rather than as
 * two unrelated forces that move you for no stated reason.
 *
 * Three things make a shove legible, and the first version of the gust only had the first of them:
 *  - STREAKS running the push direction, thickening through the tell, so the air itself is visibly moving.
 *  - A CHEVRON ROW pinned to the edge the wind is pushing TOWARD, so "which way" is answered before anyone moves.
 *  - The chevrons stay up — solid rather than blinking — THROUGH THE ACTIVE PHASE. The frames a body is actually
 *    being dragged are exactly the frames "what is moving me?" gets asked, and a telegraph that switches off at the
 *    moment of effect is not a telegraph. This is the whole fix; the rest is volume.
 *
 * Screen coords throughout: `x0`/`x1` already clamped to the viewport, `y0` = FLOOR_TOP + cam.shakeY.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x0:number, x1:number, y0:number, axis?:'x'|'z', dir?:number, k?:number, active?:boolean, frame?:number, color?:string}} o
 *   `axis` which way the wind pushes ('z' = up/down the screen, 'x' = across it); `dir` its sign; `k` 0..1 how far
 *   through the tell it is (1 while active); `frame` any monotonic counter, for the streak drift.
 */
export function drawWind(ctx, o) {
  const x0 = o.x0, x1 = o.x1, y0 = o.y0, w = x1 - x0;
  if (w <= 0) return;
  const axis = o.axis === 'x' ? 'x' : 'z';
  const dir = o.dir < 0 ? -1 : 1;
  const k = Math.max(0, Math.min(1, o.k == null ? 1 : o.k));
  const f = o.frame | 0, color = o.color || WIND_COLOR, active = !!o.active;
  const wrap = (v, m) => ((v % m) + m) % m;
  ctx.save();
  // Deterministic per index: a re-rolled random field reads as television noise rather than as moving air. The count
  // and the weight both climb with the tell, and the active streak is 2px: a 1px line at half alpha is invisible
  // against a wet deck in a rainstorm, which is what the first version of this was and why nobody could see it.
  const n = 12 + Math.round(28 * k);
  ctx.globalAlpha = 0.3 + 0.45 * k; ctx.strokeStyle = color; ctx.lineWidth = active ? 2 : 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const len = 8 + (i % 3) * 5, sp = 2 + (i % 3);
    if (axis === 'z') {
      const x = x0 + ((i * 97 + 13) % w), y = y0 + wrap(f * sp * dir + i * 31, Z_MAX);
      ctx.moveTo(x, y); ctx.lineTo(x + 2, y + dir * len);
    } else {
      const y = y0 + ((i * 53 + 7) % Z_MAX), x = x0 + wrap(f * sp * dir + i * 71, w);
      ctx.moveTo(x, y); ctx.lineTo(x + dir * len, y + 1);
    }
  }
  ctx.stroke();
  // The chevron row, inked like everything else on these boards so it survives whatever it lands on: pale violet on
  // a dark outline, blinking while the wind builds and solid the whole time it is actually moving bodies.
  ctx.globalAlpha = active ? 0.95 : (f & 8) ? 0.8 : 0.25;
  ctx.fillStyle = color; ctx.strokeStyle = 'rgba(8,4,14,0.7)'; ctx.lineWidth = 1;
  const tip = active ? 7 : 5;
  if (axis === 'z') {
    const y = dir > 0 ? y0 + Z_MAX - tip - 2 : y0 + 2;
    for (let x = x0 + 18; x < x1 - 12; x += 52) {
      pathPoly(ctx, dir > 0 ? [x, y, x + 12, y, x + 6, y + tip] : [x, y + tip, x + 12, y + tip, x + 6, y]);
      ctx.fill(); ctx.stroke();
    }
  } else {
    const x = dir > 0 ? x1 - tip - 2 : x0 + 2;
    for (let y = y0 + 12; y < y0 + Z_MAX - 12; y += 30) {
      pathPoly(ctx, dir > 0 ? [x, y, x, y + 12, x + tip, y + 6] : [x + tip, y, x + tip, y + 12, x, y + 6]);
      ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * The other half of the read: dust torn off the feet of a body the wind is actually moving. The streaks say the air
 * is moving, this says YOU are — which is the question the player asks — and it is per-body, so a fighter standing
 * in a lee (held, airborne, netted) visibly does not get it.
 * @param {object} f the fighter being pushed
 * @param {number} frame world frame (the emit is thinned per body so a crowded deck is not a dust storm)
 * @param {number} [dx] push direction along x, if any
 * @param {number} [dz] push direction along z, if any
 */
export function windDrag(f, frame, dx = 0, dz = 0) {
  if ((frame + f.id) % 5) return;
  particles.burst('dust', f.x - dx * 5, 0, f.z - dz * 5, 1, { speed: 0.6, up: 0.35, spread: 0.4, color: WIND_COLOR });
}
