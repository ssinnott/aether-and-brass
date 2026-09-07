// Stateless FX renderers + particle burst helpers (hit sparks, shockwaves, slash arcs, muzzle flash, shadows).
import { FLOOR_TOP } from '../constants.js';
import { rad } from '../engine/math.js';
import { particles } from '../engine/particles.js';
import { pathStar, pathEllipse, paint } from './shapes.js';

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
