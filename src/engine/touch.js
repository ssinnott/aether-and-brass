// On-screen touch controls: a floating movement stick under the left thumb and action buttons
// under the right. Enabled the first time a touch reaches the canvas (or with ?touch=1), so a
// desktop with a touchscreen still behaves like a keyboard game until someone actually taps.
import { VIEW_W, VIEW_H, UI } from '../constants.js';
import { input } from './input.js';
import { drawText } from './text.js';

/** Deflection (internal px) that counts as full tilt, and the dead zone around the origin. */
const STICK_MAX = 32;
const STICK_DEAD = 7;
/** Tilt fraction that also means "run" (so there is no double-tap on a touchscreen). */
const RUN_AT = 0.72;
/** Everything left of this x starts the movement stick; everything right of it hits buttons. */
const STICK_ZONE_X = 300;

/** Action buttons in internal 640x360 space, ordered back-to-front for drawing. */
const BUTTONS = [
  { action: 'start', x: 616, y: 62, r: 15, label: 'II', color: '#9aa6b2' },
  { action: 'super', x: 592, y: 168, r: 24, label: 'SUP', color: '#e8c23a' },
  { action: 'special', x: 506, y: 212, r: 24, label: 'SPC', color: '#c86ad6' },
  { action: 'dodge', x: 590, y: 238, r: 26, label: 'DDG', color: '#59c85a' },
  { action: 'jump', x: 510, y: 290, r: 27, label: 'JMP', color: '#3fa9e0' },
  { action: 'attack', x: 588, y: 306, r: 33, label: 'ATK', color: '#e8623a' },
];

const OCTANTS = [
  ['right'], ['right', 'down'], ['down'], ['left', 'down'],
  ['left'], ['left', 'up'], ['up'], ['right', 'up'],
];

function emptyActions() {
  return { left: false, right: false, up: false, down: false, attack: false, jump: false, special: false, super: false, dodge: false, taunt: false, start: false, run: false };
}

/** Pointers currently down, keyed by pointerId. */
const pointers = new Map();
/** Buttons pressed since the last update, so a tap shorter than one step still registers. */
const latched = new Set();
const actions = emptyActions();

export const touch = {
  /** True once the controls are showing (a touch happened, or they were forced on). */
  enabled: false,
  /** The stick's current origin and thumb position, for drawing. */
  stick: null,

  /**
   * Attach pointer listeners to the display canvas.
   * @param {{displayCanvas: HTMLCanvasElement, toInternal(x:number,y:number):{x:number,y:number}}} view
   * @param {boolean} force show the controls immediately (?touch=1) instead of waiting for a touch
   */
  init(view, force = false) {
    const el = view.displayCanvas;
    if (!el || !el.addEventListener) return;
    if (force) touch.enabled = true;

    const hitButton = (p) => {
      for (let i = BUTTONS.length - 1; i >= 0; i--) {
        const b = BUTTONS[i];
        const dx = p.x - b.x, dy = p.y - b.y;
        // A slightly generous radius: thumbs are imprecise and the buttons do not overlap.
        if (dx * dx + dy * dy <= (b.r * 1.3) * (b.r * 1.3)) return b;
      }
      return null;
    };

    const down = (e) => {
      if (e.pointerType === 'mouse') return;
      touch.enabled = true;
      const p = view.toInternal(e.clientX, e.clientY);
      const b = p.x >= STICK_ZONE_X ? hitButton(p) : null;
      if (b) {
        pointers.set(e.pointerId, { kind: 'button', button: b });
        latched.add(b.action);
      } else if (p.x < STICK_ZONE_X) {
        pointers.set(e.pointerId, { kind: 'stick', ox: p.x, oy: p.y, x: p.x, y: p.y });
      } else {
        return; // an empty patch of the right-hand side: ignore rather than steal the touch
      }
      if (e.cancelable) e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
    };

    const move = (e) => {
      const t = pointers.get(e.pointerId);
      if (!t) return;
      if (t.kind === 'stick') {
        const p = view.toInternal(e.clientX, e.clientY);
        t.x = p.x; t.y = p.y;
      }
      if (e.cancelable) e.preventDefault();
    };

    const up = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (e.cancelable) e.preventDefault();
    };

    el.addEventListener('pointerdown', down, { passive: false });
    el.addEventListener('pointermove', move, { passive: false });
    el.addEventListener('pointerup', up, { passive: false });
    el.addEventListener('pointercancel', up, { passive: false });
    el.addEventListener('pointerleave', up, { passive: false });
    // Stop the browser from panning, zooming or firing synthetic mouse events over the canvas.
    el.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    el.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  /** Fold the current touch state into player 1's input. Call once per fixed step, before input.update(). */
  update() {
    if (!touch.enabled) return;
    for (const k of Object.keys(actions)) actions[k] = false;
    touch.stick = null;

    for (const t of pointers.values()) {
      if (t.kind === 'button') { actions[t.button.action] = true; continue; }
      const dx = t.x - t.ox, dy = t.y - t.oy;
      const mag = Math.hypot(dx, dy);
      touch.stick = t;
      if (mag < STICK_DEAD) continue;
      // Snap to one of eight directions so diagonals are reachable but a shaky thumb is not.
      const oct = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      for (const dir of OCTANTS[oct]) actions[dir] = true;
      if (mag >= STICK_MAX * RUN_AT) actions.run = true;
    }
    // A tap that began and ended between two steps still counts for one step.
    for (const a of latched) actions[a] = true;
    latched.clear();

    input.setTouch(actions);
  },

  /** Draw the controls over the game. */
  draw(ctx) {
    if (!touch.enabled) return;
    ctx.save();
    for (const b of BUTTONS) {
      const held = actions[b.action];
      ctx.globalAlpha = held ? 0.85 : 0.34;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = held ? b.color : 'rgba(20,14,22,0.7)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = b.color;
      ctx.stroke();
      ctx.globalAlpha = held ? 1 : 0.75;
      drawText(ctx, b.label, b.x, b.y - 3, { size: 1, color: held ? UI.ink : b.color, align: 'center', shadow: false });
    }
    // Movement stick: a ring at the thumb's origin with the current tilt inside it.
    const s = touch.stick;
    const ox = s ? s.ox : 76, oy = s ? s.oy : 286;
    ctx.globalAlpha = s ? 0.5 : 0.26;
    ctx.beginPath();
    ctx.arc(ox, oy, STICK_MAX, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = UI.brass;
    ctx.stroke();
    if (s) {
      const dx = s.x - s.ox, dy = s.y - s.oy;
      const mag = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, STICK_MAX / mag);
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(ox + dx * k, oy + dy * k, 14, 0, Math.PI * 2);
      ctx.fillStyle = UI.brass;
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.4;
      drawText(ctx, 'MOVE', ox, oy - 3, { size: 1, color: UI.brass, align: 'center', shadow: false });
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  },
};
