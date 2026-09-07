// Pooled particle system with world-space projection (ARCHITECTURE.md section 3).
import { FLOOR_TOP } from '../constants.js';
import { drawText } from './text.js';
import { makeRng } from './rng.js';
import { gear as drawGear } from '../art/shapes.js';

const MAX = 600;
const prng = makeRng(0xbeef); // visual only: independent of gameplay rng
const pool = [];
for (let i = 0; i < MAX; i++) {
  pool.push({ active: false, kind: '', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 30, size: 2, size1: 0,
    color: '#fff', color2: '', gravity: 0, drag: 1, text: '', alpha: 1, rot: 0, vrot: 0, screen: false, width: 2, bounce: 0, flat: false });
}
let cursor = 0;
let liveCount = 0;

const DEFAULTS = {
  spark: { max: 14, size: 2, color: '#fff6c0', color2: '#ffb020', gravity: 0.25, drag: 0.92 },
  dust: { max: 26, size: 3, color: '#b8a88c', gravity: -0.02, drag: 0.94 },
  smoke: { max: 50, size: 4, color: '#5a5560', gravity: -0.05, drag: 0.97 },
  steam: { max: 40, size: 4, color: '#e8f0f4', gravity: -0.08, drag: 0.96 },
  ember: { max: 40, size: 2, color: '#ffb040', color2: '#e04020', gravity: -0.04, drag: 0.98 },
  debris: { max: 45, size: 4, color: '#8a6a40', gravity: 0.35, drag: 0.99, bounce: 0.4 },
  gear: { max: 60, size: 5, color: '#c8a050', gravity: 0.35, drag: 0.99, bounce: 0.35 },
  text: { max: 45, size: 1, color: '#ffffff', gravity: 0, drag: 0.9 },
  ring: { max: 18, size: 4, size1: 40, color: '#ffffff', gravity: 0, drag: 1, width: 3 },
};

function alloc() {
  for (let i = 0; i < MAX; i++) {
    cursor = (cursor + 1) % MAX;
    if (!pool[cursor].active) return pool[cursor];
  }
  return pool[(cursor = (cursor + 1) % MAX)]; // steal the oldest slot
}

/** Particle singleton. */
export const particles = {
  /**
   * Spawn one particle. World coords (x, y up, z depth) unless `opts.screen` (then x,y are screen px).
   * @param {'spark'|'dust'|'smoke'|'steam'|'ember'|'debris'|'gear'|'text'|'ring'} kind
   * @param {object} [opts] vx, vy, vz, life, size, size1 (ring end radius), color, color2, gravity, drag, text, rot, vrot, screen, width, bounce, flat, alpha
   * @returns {object} the particle (may be tweaked further)
   */
  spawn(kind, x, y, z = 0, opts = {}) {
    const d = DEFAULTS[kind] || DEFAULTS.spark;
    const p = alloc();
    p.active = true; p.kind = kind; p.x = x; p.y = y; p.z = z; p.life = 0;
    p.vx = opts.vx || 0; p.vy = opts.vy || 0; p.vz = opts.vz || 0;
    p.max = opts.life || d.max; p.size = opts.size != null ? opts.size : d.size; p.size1 = opts.size1 != null ? opts.size1 : (d.size1 || 0);
    p.color = opts.color || d.color; p.color2 = opts.color2 || d.color2 || p.color;
    p.gravity = opts.gravity != null ? opts.gravity : d.gravity; p.drag = opts.drag != null ? opts.drag : d.drag;
    p.text = opts.text || ''; p.alpha = opts.alpha != null ? opts.alpha : 1; p.rot = opts.rot || 0; p.vrot = opts.vrot != null ? opts.vrot : (kind === 'gear' || kind === 'debris' ? prng.range(-0.3, 0.3) : 0);
    p.screen = !!opts.screen; p.width = opts.width || d.width || 2; p.bounce = opts.bounce != null ? opts.bounce : (d.bounce || 0); p.flat = !!opts.flat;
    return p;
  },
  /**
   * Spawn `count` particles with randomised velocities. `opts.speed` (max), `opts.up` (vy bias), other opts as spawn().
   */
  burst(kind, x, y, z, count, opts = {}) {
    const speed = opts.speed != null ? opts.speed : 3;
    const up = opts.up != null ? opts.up : 1.5;
    for (let i = 0; i < count; i++) {
      const a = prng.range(0, Math.PI * 2);
      const s = prng.range(speed * 0.3, speed);
      const p = particles.spawn(kind, x, y, z, opts);
      p.vx = Math.cos(a) * s + (opts.vx || 0);
      p.vy = Math.abs(Math.sin(a)) * s * 0.7 + up + (opts.vy || 0);
      p.vz = prng.range(-1, 1) * (opts.spread != null ? opts.spread : 1) + (opts.vz || 0);
      if (opts.sizeJitter) p.size += prng.range(-opts.sizeJitter, opts.sizeJitter);
      p.max = Math.round(p.max * prng.range(0.7, 1.2));
    }
  },
  /** Advance all particles one fixed step. */
  update() {
    liveCount = 0;
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.active) continue;
      if (++p.life >= p.max) { p.active = false; continue; }
      liveCount++;
      p.vy -= p.gravity;
      p.vx *= p.drag; p.vy *= p.drag; p.vz *= p.drag;
      p.x += p.vx; p.y += p.vy; p.z += p.vz; p.rot += p.vrot;
      if (!p.screen && p.y < 0 && p.gravity > 0) {
        p.y = 0;
        if (p.bounce > 0 && p.vy < -0.5) { p.vy = -p.vy * p.bounce; p.vx *= 0.7; p.vrot *= 0.6; } else p.vy = 0;
      }
    }
  },
  /**
   * Draw particles. `layer`: undefined = all, 'back' = only dust (draw before entities), 'front' = all but dust.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x:number, shakeX?:number, shakeY?:number}|null} cam
   */
  draw(ctx, cam, layer) {
    const camX = cam ? cam.x - (cam.shakeX || 0) : 0;
    const camY = cam ? -(cam.shakeY || 0) : 0;
    const baseAlpha = ctx.globalAlpha; // per-particle alphas multiply the caller's (e.g. a screen fade)
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.active) continue;
      if (layer === 'back' && p.kind !== 'dust') continue;
      if (layer === 'front' && p.kind === 'dust') continue;
      const t = p.life / p.max;
      const sx = p.screen ? Math.round(p.x) : Math.round(p.x - camX);
      const sy = p.screen ? Math.round(p.y) : Math.round(FLOOR_TOP + p.z - p.y - camY);
      drawOne(ctx, p, sx, sy, t, baseAlpha);
    }
    ctx.globalAlpha = baseAlpha;
  },
  /** Remove all particles. */
  clear() { for (const p of pool) p.active = false; liveCount = 0; },
  /** Number of live particles (debug). */
  get count() { return liveCount; },
};

function drawOne(ctx, p, sx, sy, t, baseAlpha) {
  const fade = 1 - t;
  const A = baseAlpha;
  switch (p.kind) {
    case 'spark': {
      ctx.globalAlpha = A * p.alpha * Math.min(1, fade * 1.6);
      ctx.fillStyle = t < 0.4 ? p.color : p.color2;
      const len = Math.min(8, Math.hypot(p.vx, p.vy) * 2);
      const nx = p.vx, ny = -p.vy, m = Math.hypot(nx, ny) || 1;
      ctx.fillRect(sx - 1, sy - 1, p.size, p.size);
      ctx.fillRect(Math.round(sx - nx / m * len), Math.round(sy - ny / m * len), 1, 1);
      ctx.fillRect(Math.round(sx - nx / m * len * 0.5), Math.round(sy - ny / m * len * 0.5), 2, 2);
      break;
    }
    case 'dust': case 'smoke': case 'steam': {
      const grow = p.kind === 'dust' ? 0.6 + t * 1.2 : 0.5 + t * 1.8;
      ctx.globalAlpha = A * p.alpha * fade * (p.kind === 'steam' ? 0.7 : 0.55);
      ctx.fillStyle = p.color;
      const r = Math.max(1, p.size * grow);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'ember': {
      ctx.globalAlpha = A * p.alpha * (0.6 + 0.4 * Math.sin(p.life * 0.9)) * fade;
      ctx.fillStyle = t < 0.5 ? p.color : p.color2;
      const s = t < 0.3 ? p.size + 1 : p.size;
      ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
      break;
    }
    case 'debris': {
      ctx.globalAlpha = A * p.alpha * Math.min(1, fade * 3);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-p.size / 2, 0, p.size, p.size * 0.3);
      ctx.restore();
      break;
    }
    case 'gear': {
      ctx.globalAlpha = A * p.alpha * Math.min(1, fade * 3);
      drawGear(ctx, sx, sy, p.size, 6, p.color, '#241a14', 1, p.rot, p.size * 0.35);
      break;
    }
    case 'text': {
      ctx.globalAlpha = A * p.alpha * (t > 0.7 ? (1 - t) / 0.3 : 1);
      drawText(ctx, p.text, sx, sy, { size: p.size, color: p.color, align: 'center', shadow: true });
      break;
    }
    case 'ring': {
      const e = 1 - (1 - t) * (1 - t);
      const r = p.size + (p.size1 - p.size) * e;
      ctx.globalAlpha = A * p.alpha * fade;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, p.width * fade);
      ctx.beginPath();
      if (p.flat) ctx.ellipse(sx, sy, r, r * 0.45, 0, 0, Math.PI * 2); else ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    default: {
      ctx.globalAlpha = A * p.alpha * fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }
  }
}
