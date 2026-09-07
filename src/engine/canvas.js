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
    /** Recompute the integer scale factor and display canvas size from the window. */
    resize() {
      // Integer scale is chosen in DEVICE pixels so HiDPI screens get crisp, evenly sized game pixels.
      const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
      const cw = Math.max(1, window.innerWidth || VIEW_W);
      const ch = Math.max(1, window.innerHeight || VIEW_H);
      const w = Math.round(cw * dpr), h = Math.round(ch * dpr);
      api.dpr = dpr;
      api.scale = Math.max(1, Math.floor(Math.min(w / VIEW_W, h / VIEW_H)));
      display.width = w;
      display.height = h;
      display.style.width = cw + 'px';
      display.style.height = ch + 'px';
      api.offsetX = Math.floor((w - VIEW_W * api.scale) / 2);
      api.offsetY = Math.floor((h - VIEW_H * api.scale) / 2);
      dctx.imageSmoothingEnabled = false;
    },
    /** Blit the internal canvas to the display canvas (letterboxed, pixelated). */
    present() {
      dctx.imageSmoothingEnabled = false;
      dctx.fillStyle = '#000';
      dctx.fillRect(0, 0, display.width, display.height);
      dctx.drawImage(canvas, 0, 0, VIEW_W, VIEW_H, api.offsetX, api.offsetY, VIEW_W * api.scale, VIEW_H * api.scale);
    },
    /** Map a client (mouse) coordinate to internal canvas space. */
    toInternal(clientX, clientY) {
      const r = display.getBoundingClientRect();
      return { x: ((clientX - r.left) * api.dpr - api.offsetX) / api.scale, y: ((clientY - r.top) * api.dpr - api.offsetY) / api.scale };
    },
  };
  api.resize();
  window.addEventListener('resize', api.resize);
  return api;
}
