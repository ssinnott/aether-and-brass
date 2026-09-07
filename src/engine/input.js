// Keyboard + gamepad -> per-player action state with edge detection and an input buffer.
// Bindings follow ARCHITECTURE.md section 16.
import { INPUT_BUFFER } from '../constants.js';

/** All per-player actions. */
export const ACTIONS = ['left', 'right', 'up', 'down', 'attack', 'jump', 'special', 'dodge', 'taunt', 'start'];

/** Default bindings. Keyboard entries are KeyboardEvent.code values; gamepad entries are standard-mapping button indices. */
export const bindings = {
  keyboard: [
    { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], attack: ['KeyF'], jump: ['KeyG'],
      special: ['KeyH'], dodge: ['KeyR'], taunt: ['KeyT'], start: ['Enter', 'NumpadEnter'] },
    { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], attack: ['KeyK', 'Numpad1'],
      jump: ['KeyL', 'Numpad2'], special: ['Semicolon', 'Numpad3'], dodge: ['KeyO', 'Numpad4'], taunt: ['KeyP', 'Numpad5'],
      start: ['Backspace', 'Numpad0'] },
  ],
  gamepad: { attack: [0], jump: [1], special: [2], taunt: [3], dodge: [5], start: [9], up: [12], down: [13], left: [14], right: [15] },
  global: { pause: ['Escape', 'Enter', 'NumpadEnter'], mute: ['KeyM'], debug: ['F1'] },
  stickDeadzone: 0.4,
};

const NEVER = 1e9;
const keysDown = new Set();
const keysPressedPending = new Set(); // key codes that went down since the last update()
let anyKeyPending = false;
let anyKeyThisStep = false;
const globalPressed = { pause: false, mute: false, debug: false };
let boundCodes = null;

function makeActionMap(v = false) {
  const o = {};
  for (const a of ACTIONS) o[a] = v;
  return o;
}
function makePlayer() {
  return { cur: makeActionMap(), prev: makeActionMap(), pressedNow: makeActionMap(), bufAge: makeActionMap(NEVER), virtual: null, device: 'none' };
}
const players = [makePlayer(), makePlayer()];

function rebuildBoundCodes() {
  boundCodes = new Set();
  for (const map of bindings.keyboard) for (const a of ACTIONS) for (const c of map[a] || []) boundCodes.add(c);
  for (const k of Object.keys(bindings.global)) for (const c of bindings.global[k]) boundCodes.add(c);
}

function onKeyDown(e) {
  if (!boundCodes) rebuildBoundCodes();
  if (boundCodes.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  keysDown.add(e.code);
  keysPressedPending.add(e.code);
  anyKeyPending = true;
}
function onKeyUp(e) {
  if (boundCodes && boundCodes.has(e.code)) e.preventDefault();
  keysDown.delete(e.code);
}
function onBlur() { keysDown.clear(); }

let pads = null;
function pollGamepads() {
  pads = null;
  try { pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null; } catch { pads = null; }
}
function readGamepad(index, out) {
  const gp = pads && pads[index];
  if (!gp || !gp.connected) return false;
  const dz = bindings.stickDeadzone;
  let any = false;
  for (const a of ACTIONS) {
    const btns = bindings.gamepad[a] || [];
    for (const b of btns) {
      const btn = gp.buttons[b];
      if (btn && (btn.pressed || btn.value > 0.5)) { out[a] = true; any = true; }
    }
  }
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  if (ax < -dz) { out.left = true; any = true; }
  if (ax > dz) { out.right = true; any = true; }
  if (ay < -dz) { out.up = true; any = true; }
  if (ay > dz) { out.down = true; any = true; }
  return any;
}

/** Input singleton (ARCHITECTURE.md section 3). Players are 0 and 1. */
export const input = {
  bindings,
  ACTIONS,
  /** Attach DOM listeners. `canvasEl` is focused so keys go to the game. */
  init(canvasEl) {
    rebuildBoundCodes();
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', onBlur);
    window.addEventListener('gamepadconnected', () => { /* polled in update() */ });
    if (canvasEl && canvasEl.focus) {
      canvasEl.addEventListener('pointerdown', () => canvasEl.focus());
      try { canvasEl.focus(); } catch { /* ignore */ }
    }
  },
  /** Poll devices once per fixed step; ages buffers; computes edges. */
  update() {
    anyKeyThisStep = anyKeyPending;
    anyKeyPending = false;
    for (const k of Object.keys(globalPressed)) {
      globalPressed[k] = false;
      for (const code of bindings.global[k]) if (keysPressedPending.has(code)) globalPressed[k] = true;
    }
    pollGamepads();
    for (let p = 0; p < players.length; p++) {
      const pl = players[p];
      const map = bindings.keyboard[p];
      for (const a of ACTIONS) pl.prev[a] = pl.cur[a];
      if (pl.virtual) {
        for (const a of ACTIONS) pl.cur[a] = !!pl.virtual[a];
        pl.device = 'virtual';
      } else {
        let kb = false;
        for (const a of ACTIONS) {
          let v = false;
          for (const c of map[a]) if (keysDown.has(c) || keysPressedPending.has(c)) { v = true; break; }
          pl.cur[a] = v;
          if (v) kb = true;
        }
        const gpAny = readGamepad(p, pl.cur);
        pl.device = gpAny ? 'gamepad' : kb ? 'keyboard' : pl.device;
      }
      for (const a of ACTIONS) {
        const pressed = pl.cur[a] && !pl.prev[a];
        pl.pressedNow[a] = pressed;
        pl.bufAge[a] = pressed ? 0 : Math.min(NEVER, pl.bufAge[a] + 1);
      }
    }
    keysPressedPending.clear();
  },
  /** Is the action currently held? */
  held(player, action) { return !!players[player].cur[action]; },
  /** True only on the step the action went down. */
  pressed(player, action) { return !!players[player].pressedNow[action]; },
  /** Pressed within the last `frames` steps (inclusive of this step). Use consume() to clear it. */
  buffered(player, action, frames = INPUT_BUFFER) { return players[player].bufAge[action] < frames; },
  /** Clear the buffer for an action (after acting on it). */
  consume(player, action) { players[player].bufAge[action] = NEVER; },
  /** Movement axis as {x, y} in -1|0|1. */
  axis(player) {
    const c = players[player].cur;
    return { x: (c.right ? 1 : 0) - (c.left ? 1 : 0), y: (c.down ? 1 : 0) - (c.up ? 1 : 0) };
  },
  /** Any action pressed by any player this step, or any key at all (title screen "press any key"). */
  anyPressed() {
    if (anyKeyThisStep) return true;
    for (const pl of players) for (const a of ACTIONS) if (pl.pressedNow[a]) return true;
    return false;
  },
  /** True if any action of this player was pressed this step (used for P2 join). */
  anyPressedBy(player) {
    const pl = players[player];
    for (const a of ACTIONS) if (pl.pressedNow[a]) return true;
    return false;
  },
  /** Global (non-player) key edge this step: 'pause' | 'mute' | 'debug'. */
  globalPressed(name) { return !!globalPressed[name]; },
  /** Test hook: override devices with { left:true, attack:true ... } until cleared. */
  setVirtual(player, actions) { players[player].virtual = actions ? { ...actions } : null; },
  /** Test hook: remove the virtual override. */
  clearVirtual(player) { players[player].virtual = null; },
  /** Last device that produced input for the player ('keyboard' | 'gamepad' | 'virtual' | 'none'). */
  device(player) { return players[player].device; },
  /** Number of players supported. */
  get playerCount() { return players.length; },
};
