// Keyboard + gamepad -> per-player action state with edge detection and an input buffer.
// Bindings follow docs/RECONCILIATION.md "Final controls" (ARCHITECTURE.md section 16). The default
// table and the rebind / conflict / sanitise machinery live in engine/bindings.js (pure, no
// window/navigator); this file owns the mutable live `bindings` object, device polling and caching.
import { INPUT_BUFFER, MAX_PLAYERS } from '../constants.js';
import {
  DEFAULT_BINDINGS, LAYOUTS, layoutMap, cloneBindings, sanitiseBindings, rebindKey, rebindPad,
  joinCodesFor, keyLabel, padLabel, legendFor, joinLabels,
} from './bindings.js';

/** All per-player actions. */
export const ACTIONS = ['left', 'right', 'up', 'down', 'attack', 'jump', 'special', 'super', 'dodge', 'taunt', 'start'];

/** Live bindings, mutated in place by rebind() / importBindings() / resetBindings(). Same object forever. */
export const bindings = cloneBindings(DEFAULT_BINDINGS);

const NEVER = 1e9;
const keysDown = new Set();
const keysPressedPending = new Set(); // key codes that went down since the last update()
let anyKeyPending = false;
let anyKeyThisStep = false;
const globalPressed = { pause: false, mute: false, debug: false };
let boundCodes = null;
let joinCodes = null; // per player: keyboard codes that count as "this player pressed a key of their own"
let bindingsVersion = 0;
// Cached legend()/joinHint()/joinKeysHint()/keyText()/cellText() strings, cleared on refreshBindings().
// Keyed without template-string concatenation (layout/slot/action are looked up directly) so a cache
// HIT - the common case from per-frame draw paths (hud.js, pause.js, title.js, select.js) - allocates
// nothing; only a cache MISS (at most once per bindings change) builds a string.
const legendCache = new Map(); // layout -> string
const joinHintCache = []; // slot -> string
const joinKeysHintCache = []; // slot -> string
const keyTextCache = new Map(); // layout -> Map(action -> string)
const cellTextCache = new Map(); // layout -> Map(action -> string)
let padSnapshot = null; // Set of "padIndex:button" held at beginPadCapture(), used to find the NEW press
let virtualPads = null; // test hook: setPadVirtual() override for pollGamepads(), array indexed like navigator.getGamepads()

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
    joined: false, joinNow: false, run: false, gpAny: false, gpAnyPrev: false, pad: -1, kbSeen: false };
}
const players = Array.from({ length: MAX_PLAYERS }, makePlayer);
players[0].joined = true;

function rebuildBoundCodes() {
  boundCodes = new Set();
  joinCodes = [];
  for (let p = 0; p < bindings.keyboard.length; p++) {
    for (const a of ACTIONS) for (const c of bindings.keyboard[p][a] || []) boundCodes.add(c);
    joinCodes[p] = joinCodesFor(bindings, p);
  }
  for (const a of ACTIONS) for (const c of bindings.soloAliases[a] || []) boundCodes.add(c);
  for (const k of Object.keys(bindings.global)) for (const c of bindings.global[k]) boundCodes.add(c);
}
/** Invalidate everything that is derived from `bindings` (boundCodes, joinCodes, cached hint/legend strings). */
function refreshBindings() {
  boundCodes = null; joinCodes = null;
  legendCache.clear(); joinHintCache.length = 0; joinKeysHintCache.length = 0;
  keyTextCache.clear(); cellTextCache.clear();
  bindingsVersion++;
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
  try { pads = virtualPads || (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null); } catch { pads = null; }
}
function padButton(gp, b) { const btn = gp.buttons[b]; return !!btn && (btn.pressed || btn.value > 0.5); }

// --- Pad claiming (ARCHITECTURE.md section 3, docs/RECONCILIATION.md "Final controls"): an unbound
// pad's first BUTTON edge (axes ignored -- stick drift must never drop a phantom hero in) claims the
// lowest slot with no pad, whose keyboard half has not been used, and that is not netplay-virtual.
// A pad that disconnects releases its slot (the slot itself stays joined); on reconnect it claims
// again by the same rule, which can land it in a different slot. All claims are released wholesale by
// resetClaims() (called when the title screen is entered). Netplay turns claiming off with
// setPadClaiming(false): update() then merges every unbound pad into slot 0 and pollRaw(player) reads
// the pad bound to `player` plus every unbound pad, so a pad drives the local player online whether it
// was pressed before or after the keyboard, and can never claim the peer's slot mid-match.
/** pad index -> slot */
const padSlot = new Map();
/** @type {boolean[]} */
let padActivePrev = [];
let claiming = true;
let unboundPads = 0;

/** True if any button (not axis) of `gp` is currently pressed. */
function padActive(gp) {
  for (let b = 0; b < gp.buttons.length; b++) if (padButton(gp, b)) return true;
  return false;
}

/**
 * Release/claim pad->slot bindings for this step. Must run right after pollGamepads(), before the
 * per-slot loop. Returns the set of slots claimed THIS step (so their joinNow can be set).
 * @returns {Set<number>}
 */
function claimPads() {
  const claimed = new Set();
  unboundPads = 0;
  const n = pads ? pads.length : 0;
  for (let k = 0; k < n; k++) {
    const gp = pads[k];
    if (!gp || !gp.connected) {
      if (padSlot.has(k)) { players[padSlot.get(k)].pad = -1; padSlot.delete(k); }
      padActivePrev[k] = false;
      continue;
    }
    if (!padSlot.has(k)) unboundPads++;
    const active = padActive(gp), rising = active && !padActivePrev[k];
    padActivePrev[k] = active;
    // A press while the CONTROLS panel is capturing a gamepad button (padSnapshot != null between
    // beginPadCapture()/endPadCapture()) must rebind that pad, not silently claim a slot and drop an
    // unwanted player in on the button's NEXT press.
    if (rising && claiming && !padSnapshot && !padSlot.has(k)) {
      const s = players.findIndex((pl) => pl.pad < 0 && !pl.kbSeen && !pl.virtual);
      if (s >= 0) { players[s].pad = k; padSlot.set(k, s); claimed.add(s); unboundPads--; }
    }
  }
  return claimed;
}

/** OR-merge every CONNECTED pad whose index is not claimed to any slot into `out`. Returns true if any was active. */
function readUnboundPads(out, pl) {
  let any = false;
  const n = pads ? pads.length : 0;
  for (let k = 0; k < n; k++) {
    const gp = pads[k];
    if (!gp || !gp.connected || padSlot.has(k)) continue;
    if (readGamepad(k, out, pl)) any = true;
  }
  return any;
}
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

/** Input singleton (ARCHITECTURE.md section 3 / 16). Players are 0..3 (MAX_PLAYERS); gamepads claim
 *  slots on their first button press (never index-bound); claims reset when the title screen is
 *  entered (resetClaims()); netplay turns claiming off (setPadClaiming(false)) and reads unbound
 *  pads as slot 0's local player. */
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
    const claimed = claimPads();
    const soloActive = !players[1].joined;
    for (let p = 0; p < players.length; p++) {
      const pl = players[p];
      const map = bindings.keyboard[p];
      for (const a of ACTIONS) pl.prev[a] = pl.cur[a];
      pl.run = false;
      pl.gpAnyPrev = pl.gpAny;
      pl.joinNow = claimed.has(p);
      if (pl.virtual) {
        for (const a of ACTIONS) pl.cur[a] = !!pl.virtual[a];
        pl.run = !!pl.virtual.run;
        pl.device = 'virtual';
        pl.gpAny = false;
      } else {
        let kb = false;
        for (const a of ACTIONS) {
          let v = map ? keyHeld(map[a]) : false;
          if (!v && p === 0 && soloActive) v = keyHeld(bindings.soloAliases[a] || []);
          pl.cur[a] = v;
          if (v) kb = true;
        }
        if (p === 0 && kb) pl.kbSeen = true;
        pl.gpAny = pl.pad >= 0 ? readGamepad(pl.pad, pl.cur, pl) : (p === 0 && !claiming ? readUnboundPads(pl.cur, pl) : false);
        let touched = false;
        if (p === 0 && touchActions) {
          for (const a of ACTIONS) if (touchActions[a]) { pl.cur[a] = true; touched = true; }
          if (touchActions.run) pl.run = true;
        }
        pl.device = touched ? 'touch' : pl.gpAny ? 'gamepad' : kb ? 'keyboard' : pl.device;
        // "this player pressed one of their OWN keys" (used for P2+ drop-in): keyboard edge on a
        // non-shared key, or a gamepad edge. Slot 0's kbSeen comes from `kb` above (own map or solo
        // aliases); slots >= 1 set kbSeen ONLY here, inside their own join-code edge (decision #2:
        // P1 steering with the shared arrows must never mark slot 1 as used).
        for (const code of keysPressedPending) if (joinCodes[p] && joinCodes[p].has(code)) { pl.joinNow = true; if (p > 0) pl.kbSeen = true; break; }
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
  /** Gamepad index claimed by `player`'s slot, or -1 if none. */
  padOf(player) { return players[player].pad; },
  /** Does this slot have a keyboard half at all? (Slots 2/3 have none: gamepad or virtual only.) */
  hasKeyboard(player) { return !!bindings.keyboard[player]; },
  /** Slots 1..MAX_PLAYERS-1 that have not joined yet. Allocates -- call only on a joinState() change. */
  freeSlots() {
    const out = [];
    for (let p = 1; p < players.length; p++) if (!players[p].joined) out.push(p);
    return out;
  },
  /** Connected pads not yet claimed by any slot. 0 while claiming is off (netplay): no press can
   *  claim a slot then, so hints must not advertise "ANY PAD BUTTON" during that window. */
  get unboundPads() { return claiming ? unboundPads : 0; },
  /** Slot a fresh unbound pad press would claim right now (mirrors claimPads()'s own rule: the
   *  lowest slot with no pad, an unused keyboard half and not virtual), or -1 if none. Read-only --
   *  used to phrase join hints correctly when a keyboard slot (e.g. P2) is still poachable by a pad. */
  nextPadSlot() { return players.findIndex((pl) => pl.pad < 0 && !pl.kbSeen && !pl.virtual); },
  /** Small integer summarising joined slots (bit p) plus an unbound-pad bit (bit MAX_PLAYERS). No
   *  allocation -- screens compare this to a cached value and rebuild their hint strings on change. */
  joinState() {
    let m = 0;
    for (let p = 0; p < players.length; p++) if (this.joined(p)) m |= 1 << p;
    return m | (this.unboundPads > 0 ? 1 << MAX_PLAYERS : 0);
  },
  /** Release every pad claim and keyboard-seen flag and turn claiming back on. Called when the title
   *  screen is entered, so a pad that was P3 last run re-claims on its next press. padActivePrev is
   *  deliberately left alone: a button still held from before the reset must not read as a fresh
   *  rising edge and instantly re-claim slot 0 -- only a press that begins after the reset can claim. */
  resetClaims() {
    padSlot.clear();
    claiming = true;
    for (const pl of players) { pl.pad = -1; pl.kbSeen = false; }
  },
  /** Turn pad claiming on/off. Netplay turns it off for the lobby and the match's lifetime. */
  setPadClaiming(on) { claiming = !!on; },
  /** Global (non-player) key edge this step: 'pause' | 'mute' | 'debug'. */
  globalPressed(name) { return !!globalPressed[name]; },
  /**
   * Read the raw device state for a player WITHOUT touching the edge/buffer state machine.
   *
   * Netplay needs both: it must sample the local devices to send them, and simultaneously inject
   * the peer's delayed input into the same slot through setVirtual(). update() cannot do both, so
   * this reads devices and update() then computes edges from the injected virtuals.
   *
   * `solo` controls the P1 alias keys (arrows, Z X C V B N, Space). They are normally live only until
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
      let v = map ? keyHeld(map[a]) : false;
      if (!v && player === 0 && solo) v = keyHeld(bindings.soloAliases[a] || []);
      o[a] = v;
    }
    // Reads the pad bound to `player` (if any) plus every unbound pad -- readUnboundPads keys off
    // padSlot, not `claiming`, so this also covers the ended-session pump (claiming already back on).
    const pl = players[player];
    if (pl.pad >= 0) readGamepad(pl.pad, o, o);
    readUnboundPads(o, o);
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

  // --- Rebinding (engine/bindings.js does the work; this invalidates the derived caches). ---

  /** Bumped on every successful rebind / import / reset. Screens rebuild cached text when it changes. */
  get bindingsVersion() { return bindingsVersion; },
  /**
   * Rebind `action` of `layout` ('solo' | 'p1' | 'p2' | ... | 'pad') to `code`: a KeyboardEvent.code
   * string for a keyboard layout, or a gamepad button index for 'pad'.
   * @param {string} layout
   * @param {string} action
   * @param {string|number} code
   * @returns {import('./bindings.js').RebindResult}
   */
  rebind(layout, action, code) {
    const r = typeof code === 'number' && layout === 'pad' ? rebindPad(bindings, action, code)
      : typeof code === 'string' ? rebindKey(bindings, layout, action, code)
      : { ok: false, reason: 'BAD KEY' };
    if (r.ok) refreshBindings();
    return r;
  },
  /** Plain-object snapshot of the live bindings, shaped for persistence (game/options.js). */
  exportBindings() {
    const c = cloneBindings(bindings);
    return { solo: c.soloAliases, keyboard: c.keyboard, pad: c.gamepad };
  },
  /** Sanitise `raw` (a save's `bindings` field, or null) and copy it into the live bindings object. */
  importBindings(raw) {
    const s = sanitiseBindings(raw, DEFAULT_BINDINGS, ACTIONS);
    for (const a of ACTIONS) bindings.soloAliases[a] = s.soloAliases[a];
    for (let i = 0; i < bindings.keyboard.length; i++) for (const a of ACTIONS) bindings.keyboard[i][a] = s.keyboard[i][a];
    for (const a of ACTIONS) bindings.gamepad[a] = s.gamepad[a];
    refreshBindings();
  },
  /** Restore the default bindings. */
  resetBindings() { this.importBindings(null); },
  /** Cached legend line for a layout (see bindings.js legendFor). */
  legend(layout) {
    let v = legendCache.get(layout);
    if (v === undefined) { v = legendFor(bindings, layout); legendCache.set(layout, v); }
    return v;
  },
  /** Cached short "P{slot+1}: PRESS X TO JOIN" hint, or "P{slot+1}: ANY PAD BUTTON" for a slot with no keyboard half. */
  joinHint(slot = 1) {
    let v = joinHintCache[slot];
    if (v === undefined) {
      v = !bindings.keyboard[slot] ? `P${slot + 1}: ANY PAD BUTTON` : `P${slot + 1}: PRESS ${joinLabels(bindings, slot).key} TO JOIN`;
      joinHintCache[slot] = v;
    }
    return v;
  },
  /** Cached long "P{slot+1}: PRESS X/Y/Z OR W TO JOIN" hint (lists every joinable key). */
  joinKeysHint(slot = 1) {
    let v = joinKeysHintCache[slot];
    if (v === undefined) { v = `P${slot + 1}: PRESS ${joinLabels(bindings, slot).keys} TO JOIN`; joinKeysHintCache[slot] = v; }
    return v;
  },
  /** Cached label of the primary (first) code bound to `layout`/`action`, or '' if unbound. */
  keyText(layout, action) {
    let m = keyTextCache.get(layout);
    if (!m) { m = new Map(); keyTextCache.set(layout, m); }
    let v = m.get(action);
    if (v === undefined) {
      const map = layoutMap(bindings, layout);
      const code = map && map[action] ? map[action][0] : undefined;
      v = code === undefined ? '' : layout === 'pad' ? padLabel(/** @type {number} */ (code)) : keyLabel(/** @type {string} */ (code));
      m.set(action, v);
    }
    return v;
  },
  /** Cached labels of every code bound to `layout`/`action`, joined ' / '. */
  cellText(layout, action) {
    let m = cellTextCache.get(layout);
    if (!m) { m = new Map(); cellTextCache.set(layout, m); }
    let v = m.get(action);
    if (v === undefined) {
      const map = layoutMap(bindings, layout);
      const codes = map && map[action] ? map[action] : [];
      v = codes.map((c) => (layout === 'pad' ? padLabel(/** @type {number} */ (c)) : keyLabel(/** @type {string} */ (c)))).join(' / ');
      m.set(action, v);
    }
    return v;
  },
  /** Is `code` one of the codes bound to `layout`/`action`? Uncached (no allocation). */
  hasKey(layout, action, code) {
    const map = layoutMap(bindings, layout);
    const codes = /** @type {Array<string|number>|undefined|null} */ (map && map[action]);
    return !!(codes && codes.includes(code));
  },
  keyLabel,
  padLabel,
  LAYOUTS,
  /**
   * Drop the current edge for `code`: it neither fires an action / global this step nor backs out
   * of a panel via Escape. Used by the controls panel on the key it just captured.
   * @param {string} code
   */
  swallowKey(code) { keysDown.delete(code); keysPressedPending.delete(code); },

  // --- Gamepad button capture (controls panel), test-driven via setPadVirtual(). ---

  /** Snapshot every currently-held button of every connected pad, so capturePadButton() can find the new one. */
  beginPadCapture() {
    pollGamepads();
    padSnapshot = new Set();
    if (!pads) return;
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp || !gp.connected) continue;
      for (let b = 0; b < gp.buttons.length; b++) if (padButton(gp, b)) padSnapshot.add(`${i}:${b}`);
    }
  },
  /** First button (any pad, index order) pressed now that was not held at beginPadCapture(), else -1. */
  capturePadButton() {
    if (!padSnapshot) return -1;
    pollGamepads();
    if (pads) {
      for (let i = 0; i < pads.length; i++) {
        const gp = pads[i];
        if (!gp || !gp.connected) continue;
        for (let b = 0; b < gp.buttons.length; b++) {
          const k = `${i}:${b}`;
          // A button that was held at beginPadCapture() but has since been released no longer
          // blocks capture: forget it so pressing it again counts as a fresh press.
          if (!padButton(gp, b)) { padSnapshot.delete(k); continue; }
          if (!padSnapshot.has(k)) return b;
        }
      }
    }
    return -1;
  },
  /** End a capture session. */
  endPadCapture() { padSnapshot = null; },
  /**
   * Test hook: override `navigator.getGamepads()[index]` with a virtual pad reporting `buttons`
   * pressed (or remove the override with `buttons = null`), so the controls panel's gamepad column
   * and RT refusal are headless-testable.
   * @param {number} index
   * @param {number[]|null} buttons
   */
  setPadVirtual(index, buttons) {
    if (!virtualPads) virtualPads = [];
    virtualPads[index] = buttons === null ? null : {
      connected: true,
      buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })),
      axes: [0, 0],
    };
    if (virtualPads.every((p) => !p)) virtualPads = null;
  },
};
