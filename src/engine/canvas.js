// Internal 640x360 canvas + integer-scaled, letterboxed display canvas (ARCHITECTURE.md section 0/3).
import { VIEW_W, VIEW_H } from '../constants.js';

/**
 * Create the internal render canvas and hook the display canvas up to the window.
 * @param {HTMLCanvasElement|HTMLElement|string} mount a canvas element (used as display), a container, or an element id
 * @returns {{ ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, displayCanvas: HTMLCanvasElement,
 *   present(): void, resize(): void, scale: number (integer, in device px), dpr: number, offsetX: number, offsetY: number,
 *   toInternal(clientX:number, clientY:number): {x:number, y:number} }}
 */
export function createCanvas(mount) {
  let display = typeof mount === 'string' ? document.getElementById(mount) : mount;
  if (!display || display.tagName !== 'CANVAS') {
    const parent = display || document.body;
    display = document.createElement('canvas');
    display.id = 'game';
    parent.appendChild(display);
  }
  const canvas = document.createElement('canvas');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  const dctx = display.getContext('2d', { alpha: false });

  const api = {
    ctx, canvas, displayCanvas: display, scale: 1, dpr: 1, offsetX: 0, offsetY: 0,
    /** Size the display canvas to the window, keeping the 16:9 game rect and crisp pixels. */
    resize() {
      const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
      const cw = Math.max(1, window.innerWidth || VIEW_W);
      const ch = Math.max(1, window.innerHeight || VIEW_H);
      api.dpr = dpr;
      // CSS pixels per game pixel that would exactly fit the window.
      const fit = Math.min(cw / VIEW_W, ch / VIEW_H);
      // Prefer a whole number of CSS pixels per game pixel, but only when that still fills most of
      // the window: on a phone (fit < 1) the next whole step would overflow, and on a small window
      // it would waste half the screen, so there we scale to fit instead.
      const whole = Math.floor(fit);
      const cssScale = whole >= 1 && whole / fit >= 0.8 ? whole : fit;
      // The backing store keeps a whole number of device pixels per game pixel so the blit is exact.
      api.scale = Math.max(1, Math.min(8, Math.round(cssScale * dpr)));
      api.cssScale = cssScale;
      display.width = VIEW_W * api.scale;
      display.height = VIEW_H * api.scale;
      display.style.width = Math.round(VIEW_W * cssScale) + 'px';
      display.style.height = Math.round(VIEW_H * cssScale) + 'px';
      // The canvas is exactly the game rect now; the page centres it, so there is no inner letterbox.
      api.offsetX = 0;
      api.offsetY = 0;
      dctx.imageSmoothingEnabled = false;
    },
    /** Blit the internal canvas to the display canvas (pixelated). */
    present() {
      dctx.imageSmoothingEnabled = false;
      dctx.drawImage(canvas, 0, 0, VIEW_W, VIEW_H, 0, 0, display.width, display.height);
    },
    /** Map a client (pointer) coordinate to internal canvas space. */
    toInternal(clientX, clientY) {
      const r = display.getBoundingClientRect();
      if (!r.width || !r.height) return { x: 0, y: 0 };
      return { x: (clientX - r.left) * (VIEW_W / r.width), y: (clientY - r.top) * (VIEW_H / r.height) };
    },
  };
  api.resize();
  window.addEventListener('resize', api.resize);
  return api;
}
