// Shared helpers for the per-section backdrops (art/backgrounds/section1..4.js).
// Conventions (docs/RECONCILIATION.md "Backdrop API"):
// - Everything is drawn in 640x360 screen space. The floor band is rows FLOOR_TOP..FLOOR_TOP+Z_MAX (200..340);
//   rows 340..360 are a dark band (the boss bar sits there). Sky / far layers must cover rows 0..200.
// - Static layers are pre-rendered ONCE into offscreen canvases and blitted with a parallax factor
//   (PARALLAX.far 0.2, mid 0.5, floor 1.0, near 1.2). Only cheap elements animate per frame.
// - A section may be drawn for cam.x anywhere in [x0 - 640, x1]; world-anchored layers therefore span
//   world x [x0 - 640, x1 + 640] (see layerSpace) so the edge columns never run out of art.
import { VIEW_W, VIEW_H, FLOOR_TOP, Z_MAX } from '../../constants.js';
import { makeRng } from '../../engine/rng.js';

export const PARALLAX = Object.freeze({ far: 0.2, mid: 0.5, floor: 1, near: 1.2 });
/** Screen row of the front edge of the floor band (340). */
export const BAND_TOP = FLOOR_TOP + Z_MAX;
/** Extra rows painted above/below sky and floor layers so camera shake never reveals a gap. */
export const BLEED = 16;
/** Sky layers are painted from row -BLEED to FLOOR_TOP + BLEED (216 + 16 rows tall). */
export const SKY_H = FLOOR_TOP + BLEED * 2;
/** Floor layers are painted from row FLOOR_TOP to BAND_TOP + BLEED. */
export const FLOOR_H = Z_MAX + BLEED;
/** Colour of the strip below the floor band (rows 340..360). */
export const BAND_COLOR = '#0a0a0e';
/** Outline colour used by the rig renderer; backdrops use it (or darker) for chunky outlines. */
export const INK = '#2B2B30';

/** Create an offscreen canvas. */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/**
 * Pre-render a layer once. `paint(g, w, h, rnd)` draws into the layer's context; `rnd()` is a seeded
 * random so the art is deterministic between runs.
 * @returns {{canvas: HTMLCanvasElement, w: number, h: number}}
 */
export function makeLayer(w, h, paint, seed = 1) {
  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  paint(g, canvas.width, canvas.height, makeRng(seed));
  return { canvas, w: canvas.width, h: canvas.height };
}

/** Blit a layer tiled horizontally so it covers the whole screen width. `originX` = screen x where layer x 0 lands. */
export function blitTiled(ctx, L, originX, y) {
  const w = L.w;
  let x = ((Math.round(originX) % w) + w) % w - w;
  const yy = Math.round(y);
  for (; x < VIEW_W; x += w) ctx.drawImage(L.canvas, x, yy);
}
/** Blit a layer once at an integer position (the canvas clips whatever is off screen). */
export function blitAt(ctx, L, x, y) { ctx.drawImage(L.canvas, Math.round(x), Math.round(y)); }
/** Blit a layer tiled vertically (used by the auto-scrolling funicular layers). `originY` = screen y of layer y 0. */
export function blitTiledV(ctx, L, x, originY, top = 0, bottom = VIEW_H) {
  const h = L.h;
  let y = ((Math.round(originY) % h) + h) % h - h;
  const xx = Math.round(x);
  for (; y < bottom; y += h) if (y + h > top) ctx.drawImage(L.canvas, xx, y);
}

/**
 * Layer-space bookkeeping for a world-anchored parallax layer of a section.
 * Layer x 0 corresponds to world x (section.x0 - 640); the layer is wide enough for the camera to sit
 * anywhere in [x0 - 640, x1 + 640].
 */
export function layerSpace(section, f) {
  const worldStart = section.x0 - VIEW_W;
  const worldEnd = section.x1 + VIEW_W;
  return {
    f,
    worldStart,
    worldEnd,
    width: Math.ceil((worldEnd - worldStart) * f) + VIEW_W,
    /** Screen x where layer x 0 lands for this camera (includes shake). */
    originX(cam) { return Math.round((worldStart - cam.x) * f + (cam.shakeX || 0)); },
    /** World x -> layer x. */
    lx(wx) { return Math.round((wx - worldStart) * f); },
  };
}

/** Fill the dark strip under the floor band (rows 340..360). Always screen-fixed (no shake). */
export function drawDarkBand(ctx, color = BAND_COLOR) {
  ctx.fillStyle = color;
  ctx.fillRect(0, BAND_TOP, VIEW_W, VIEW_H - BAND_TOP);
}

/** Vertical gradient fill helper (pre-render only: allocates a gradient). */
export function vGradient(g, x, y, w, h, stops) {
  const grad = g.createLinearGradient(0, y, 0, y + h);
  for (const [t, c] of stops) grad.addColorStop(t, c);
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
}
/** Radial glow fill helper (pre-render only). */
export function radialGlow(g, cx, cy, r, inner, outer = 'rgba(0,0,0,0)') {
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
}
/** Pre-render a soft glow sprite (radial gradient) so per-frame glows are a single drawImage. */
export function makeGlowSprite(r, inner, mid = null) {
  return makeLayer(r * 2, r * 2, (g) => {
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, inner);
    if (mid) grad.addColorStop(0.45, mid);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, r * 2, r * 2);
  });
}

/** Outlined rectangle: 2px ink border outside the fill (the rig renderer look). */
export function boxOutlined(g, x, y, w, h, fill, ink = INK, lw = 2) {
  g.fillStyle = ink;
  g.fillRect(x - lw, y - lw, w + lw * 2, h + lw * 2);
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
}
/** Rectangle with a darker lower half (torso-style shade band). */
export function boxShaded(g, x, y, w, h, fill, shade, ink = INK, lw = 2) {
  boxOutlined(g, x, y, w, h, fill, ink, lw);
  g.fillStyle = shade;
  g.fillRect(x, y + Math.floor(h / 2), w, h - Math.floor(h / 2));
}
/** Row of small rivet dots. */
export function rivets(g, x0, y, x1, step, color = '#c8a050', dark = 'rgba(0,0,0,0.45)') {
  for (let x = x0; x <= x1; x += step) {
    g.fillStyle = dark; g.fillRect(x, y + 1, 2, 2);
    g.fillStyle = color; g.fillRect(x, y, 2, 2);
  }
}
/** Window dots on a silhouette: a grid of tiny lit rectangles, skipping some for variety. */
export function windowDots(g, x, y, w, h, rnd, color = '#e8c070', sx = 6, sy = 8, litChance = 0.55, wx = 2, wy = 3) {
  g.fillStyle = color;
  for (let yy = y + 4; yy < y + h - wy; yy += sy) {
    for (let xx = x + 3; xx < x + w - wx; xx += sx) if (rnd() < litChance) g.fillRect(xx, yy, wx, wy);
  }
}
/** Stepped city silhouette (terraces of flat-roofed blocks) drawn along a baseline, filled with `color`. */
export function skyline(g, x0, x1, baseY, minH, maxH, rnd, color, opts = {}) {
  const { minW = 18, maxW = 48, windows = null, chimneys = 0.3, step = 0 } = opts;
  let x = x0;
  g.fillStyle = color;
  while (x < x1) {
    const w = Math.round(minW + rnd() * (maxW - minW));
    const h = Math.round(minH + rnd() * (maxH - minH));
    const top = baseY - h;
    g.fillStyle = color;
    g.fillRect(x, top, w, h + 2);
    if (step) g.fillRect(x + 3, top - step, w - 6, step);
    if (rnd() < chimneys) g.fillRect(x + w - 8, top - 10, 4, 10);
    if (windows) windowDots(g, x, top, w, h, rnd, windows.color, windows.sx, windows.sy, windows.chance);
    x += w + Math.round(rnd() * 4);
  }
}

/** Simple particle pool backed by typed arrays (no per-frame allocation). */
export function makePool(n) {
  return { n, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), life: new Float32Array(n), seed: new Float32Array(n) };
}

/** Frame-based pulse in 0..1 with period `period` frames (0 at frame 0, peak mid-period). */
export function pulse(frame, period) { return 0.5 - 0.5 * Math.cos((frame % period) / period * Math.PI * 2); }
/** Sharp heartbeat pulse in 0..1: quick attack, slow decay, period frames. */
export function beat(frame, period) { const t = (frame % period) / period; return t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.6); }

export { VIEW_W, VIEW_H, FLOOR_TOP, Z_MAX };
