// Keyboard + gamepad -> per-player action state with edge detection and an input buffer.
// Bindings follow docs/RECONCILIATION.md "Final controls" (ARCHITECTURE.md section 16).
import { INPUT_BUFFER } from '../constants.js';

/** All per-player actions. */
export const ACTIONS = ['left', 'right', 'up', 'down', 'attack', 'jump', 'special', 'super', 'dodge', 'taunt', 'start'];

/** Default bindings. Keyboard entries are KeyboardEvent.code values; gamepad entries are standard-mapping button indices. */
export const bindings = {
  keyboard: [
    { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], attack: ['KeyF'], jump: ['KeyG'], dodge: ['KeyR'],
      special: ['KeyH'], super: ['Space'], taunt: ['KeyT'], start: ['Enter', 'NumpadEnter'] },
    { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], attack: ['KeyJ', 'Numpad1'],
      jump: ['KeyK', 'Numpad2'], dodge: ['KeyU', 'Numpad4'], special: ['KeyL', 'Numpad3'], super: ['KeyO', 'Numpad6'],
      taunt: ['KeyI', 'Numpad5'], start: ['Backspace', 'Numpad0'] },
  ],
  /** Extra P1 keys, active only until P2 joins (`input.setJoined(1, true)`). Arrows are shared with P2, so they never count as a P2 join key. */
  soloAliases: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], attack: ['KeyZ'], jump: ['KeyX'],
    dodge: ['KeyC'], special: ['KeyV'], super: ['Space'], taunt: ['KeyB'], start: ['Enter', 'NumpadEnter'] },
  gamepad: { attack: [0], jump: [1], dodge: [2], special: [3], taunt: [4], super: [5], start: [9], up: [12], down: [13], left: [14], right: [15] },
  /** Held gamepad buttons that mean "run" (RT). Exposed as `input.runHeld(player)`. */
  gamepadRun: [7],
  global: { pause: ['Escape'], mute: ['KeyM'], debug: ['F1'] },
  stickDeadzone: 0.25,
};

const NEVER = 1e9;
const keysDown = new Set();
const keysPressedPending = new Set(); // key codes that went down since the last update()
let anyKeyPending = false;
let anyKeyThisStep = false;
const globalPressed = { pause: false, mute: false, debug: false };
let boundCodes = null;
let joinCodes = null; // per player: keyboard codes that count as "this player pressed a key of their own"

/**
 * A per-action map. Pressed states hold booleans; the buffer map holds frame ages, so `v` is
 * whichever of the two the caller needs.
 * @param {boolean|number} [v]
 */
function makeActionMap(v = false) {
  const o = {};
  for (const a of ACTIONS) o[a] = v;
  return o;
}
function makePlayer() {
  return { cur: makeActionMap(), prev: makeActionMap(), pressedNow: makeActionMap(), bufAge: makeActionMap(NEVER), virtual: null, device: 'none',
    joined: false, joinNow: false, run: false, gpAny: false, gpAnyPrev: false };
}
const players = [makePlayer(), makePlayer()];
players[0].joined = true;

function rebuildBoundCodes() {
  boundCodes = new Set();
  joinCodes = [new Set(), new Set()];
  for (let p = 0; p < bindings.keyboard.length; p++) {
    for (const a of ACTIONS) for (const c of bindings.keyboard[p][a] || []) { boundCodes.add(c); joinCodes[p].add(c); }
  }
  for (const a of ACTIONS) for (const c of bindings.soloAliases[a] || []) { boundCodes.add(c); if (joinCodes[1]) joinCodes[1].delete(c); }
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
function padButton(gp, b) { const btn = gp.buttons[b]; return !!btn && (btn.pressed || btn.value > 0.5); }
/** OR-merge gamepad `index` into `out`; returns true if any button/axis is active. Sets pl.run for the RT "run" buttons. */
function readGamepad(index, out, pl) {
  const gp = pads && pads[index];
  if (!gp || !gp.connected) return false;
  const dz = bindings.stickDeadzone;
  let any = false;
  for (const a of ACTIONS) {
    const btns = bindings.gamepad[a] || [];
    for (const b of btns) if (padButton(gp, b)) { out[a] = true; any = true; }
  }
  for (const b of bindings.gamepadRun) if (padButton(gp, b)) { pl.run = true; any = true; }
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  if (ax < -dz) { out.left = true; any = true; }
  if (ax > dz) { out.right = true; any = true; }
  if (ay < -dz) { out.up = true; any = true; }
  if (ay > dz) { out.down = true; any = true; }
  return any;
}
function keyHeld(codes) {
  for (const c of codes) if (keysDown.has(c) || keysPressedPending.has(c)) return true;
  return false;
}

/** Touch-control state, OR-ed into player 1's input each step (see engine/touch.js). */
let touchActions = null;

/** Input singleton (ARCHITECTURE.md section 3 / 16). Players are 0 and 1. */
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
    if (!boundCodes) rebuildBoundCodes();
    anyKeyThisStep = anyKeyPending;
    anyKeyPending = false;
    for (const k of Object.keys(globalPressed)) {
      globalPressed[k] = false;
      for (const code of bindings.global[k]) if (keysPressedPending.has(code)) globalPressed[k] = true;
    }
    pollGamepads();
    const soloActive = !players[1].joined;
    for (let p = 0; p < players.length; p++) {
      const pl = players[p];
      const map = bindings.keyboard[p];
      for (const a of ACTIONS) pl.prev[a] = pl.cur[a];
      pl.run = false;
      pl.gpAnyPrev = pl.gpAny;
      pl.joinNow = false;
      if (pl.virtual) {
        for (const a of ACTIONS) pl.cur[a] = !!pl.virtual[a];
        pl.run = !!pl.virtual.run;
        pl.device = 'virtual';
        pl.gpAny = false;
      } else {
        let kb = false;
        for (const a of ACTIONS) {
          let v = keyHeld(map[a]);
          if (!v && p === 0 && soloActive) v = keyHeld(bindings.soloAliases[a] || []);
          pl.cur[a] = v;
          if (v) kb = true;
        }
        pl.gpAny = readGamepad(p, pl.cur, pl);
        let touched = false;
        if (p === 0 && touchActions) {
          for (const a of ACTIONS) if (touchActions[a]) { pl.cur[a] = true; touched = true; }
          if (touchActions.run) pl.run = true;
        }
        pl.device = touched ? 'touch' : pl.gpAny ? 'gamepad' : kb ? 'keyboard' : pl.device;
        // "this player pressed one of their OWN keys" (used for P2 drop-in): keyboard edge on a non-shared key, or a gamepad edge
        for (const code of keysPressedPending) if (joinCodes[p].has(code)) { pl.joinNow = true; break; }
        if (pl.gpAny && !pl.gpAnyPrev) pl.joinNow = true;
      }
      for (const a of ACTIONS) {
        const pressed = pl.cur[a] && !pl.prev[a];
        pl.pressedNow[a] = pressed;
        pl.bufAge[a] = pressed ? 0 : Math.min(NEVER, pl.bufAge[a] + 1);
      }
      if (pl.virtual) { for (const a of ACTIONS) if (pl.pressedNow[a]) { pl.joinNow = true; break; } }
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
  /** Gamepad RT (or virtual `run:true`) held: run without double-tapping. */
  runHeld(player) { return !!players[player].run; },
  /** Any action pressed by any player this step, or any key at all (title screen "press any key"). */
  anyPressed() {
    if (anyKeyThisStep) return true;
    for (const pl of players) for (const a of ACTIONS) if (pl.pressedNow[a]) return true;
    return false;
  },
  /** True if any action of this player was pressed this step. */
  anyPressedBy(player) {
    const pl = players[player];
    for (const a of ACTIONS) if (pl.pressedNow[a]) return true;
    return false;
  },
  /** True if this player pressed one of their OWN keys/buttons this step (P2 drop-in; arrows are shared so they do not count for P2). */
  joinPressed(player) { return !!players[player].joinNow; },
  /** Mark a player as joined. While P2 is not joined, P1 also accepts the solo alias keys. */
  setJoined(player, joined = true) { players[player].joined = !!joined; },
  /** Has the player joined? (P1 is always joined.) */
  joined(player) { return player === 0 || !!players[player].joined; },
  /** Global (non-player) key edge this step: 'pause' | 'mute' | 'debug'. */
  globalPressed(name) { return !!globalPressed[name]; },
  /**
   * Read the raw device state for a player WITHOUT touching the edge/buffer state machine.
   *
   * Netplay needs both: it must sample the local devices to send them, and simultaneously inject
   * the peer's delayed input into the same slot through setVirtual(). update() cannot do both, so
   * this reads devices and update() then computes edges from the injected virtuals.
   *
   * `solo` controls the P1 alias keys (arrows, Z X C V B, Space). They are normally live only until
   * P2 joins, but netplay must call setJoined(1, true) for the remote slot — which would silently
   * kill half of the local player's keyboard. Netplay passes solo:true to keep them.
   *
   * Mutates nothing: prev, pressedNow, bufAge, joinNow, device and keysPressedPending are all
   * written only inside update().
   * @returns {object} action map plus `run`
   */
  pollRaw(player = 0, { solo = !players[1].joined } = {}) {
    if (!boundCodes) rebuildBoundCodes();
    pollGamepads();
    const o = {};
    const map = bindings.keyboard[player];
    for (const a of ACTIONS) {
      let v = keyHeld(map[a]);
      if (!v && player === 0 && solo) v = keyHeld(bindings.soloAliases[a] || []);
      o[a] = v;
    }
    readGamepad(player, o, o);        // writes o[action] and o.run; passing `o` as both keeps the real record clean
    if (player === 0 && touchActions) {
      for (const a of ACTIONS) if (touchActions[a]) o[a] = true;
      if (touchActions.run) o.run = true;
    }
    o.run = !!o.run;
    return o;
  },
  /** Test hook: override devices with { left:true, attack:true, run:true ... } until cleared. */
  setVirtual(player, actions) { players[player].virtual = actions ? { ...actions } : null; },
  /** On-screen touch controls: merged into player 1 alongside the keyboard (engine/touch.js). */
  setTouch(actions) { touchActions = actions || null; },
  /** Test hook: remove the virtual override. */
  clearVirtual(player) { players[player].virtual = null; },
  /** Last device that produced input for the player ('keyboard' | 'gamepad' | 'virtual' | 'none'). */
  device(player) { return players[player].device; },
  /** Number of players supported. */
  get playerCount() { return players.length; },
};
