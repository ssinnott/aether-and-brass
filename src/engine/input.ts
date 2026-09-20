// Keyboard + gamepad -> per-player action state with edge detection and an input buffer.
// Bindings follow docs/RECONCILIATION.md "Final controls" (ARCHITECTURE.md section 16). The default
// table and the rebind / conflict / sanitise machinery live in engine/bindings.js (pure, no
// window/navigator); this file owns the mutable live `bindings` object, device polling and caching.
import { INPUT_BUFFER, MAX_PLAYERS, LOCAL_PLAYERS } from '../constants.ts';
import {
  DEFAULT_BINDINGS, BINDINGS_LAYOUT, LAYOUTS, layoutMap, cloneBindings, sanitiseBindings, rebindKey,
  rebindPad, joinCodesFor, keyLabel, padLabel, legendFor, moveLabelFor, joinLabels,
} from './bindings.ts';
import { createPadSource, createPadSeats, DIR } from '../lib/input/pad.ts';

/** All per-player actions. */
export const ACTIONS: Action[] = ['left', 'right', 'up', 'down', 'attack', 'jump', 'special', 'super', 'dodge', 'taunt', 'start'];

/**
 * One of ACTIONS -- annotated onto the array above rather than inferred from it, so the union and
 * the array cannot drift apart. The ORDER of ACTIONS is the wire order net/protocol.ts packs into
 * the uint16 input mask, so this is those same eleven names and nothing else: adding one is a wire
 * break (bump PROTOCOL_VERSION and RUN_BIT).
 */
export type Action = 'left' | 'right' | 'up' | 'down' | 'attack' | 'jump' | 'special' | 'super' | 'dodge' | 'taunt' | 'start';

/**
 * A per-action map. Pressed states hold booleans; the buffer map holds frame ages, so `V` is
 * whichever of the two the caller needs.
 */
export type ActionMap<V = boolean> = Record<Action, V>;

/**
 * A raw device read: every action, plus the `run` trigger that is NOT one of ACTIONS (gamepad RT,
 * or a full touch tilt). What `pollRaw` returns, what engine/touch.ts hands to `setTouch`, and what
 * net/protocol.ts packActions() takes -- `run` rides the mask in its own bit, RUN_BIT.
 */
export type RawActions = ActionMap<boolean> & { run: boolean };

/** Which device last drove a seat (`input.device(player)`). */
export type InputDevice = 'none' | 'keyboard' | 'gamepad' | 'touch' | 'virtual';

/**
 * A `setVirtual` override: netplay's injected mask or a test hook. Partial because a caller writes
 * only the actions it means to hold -- every absent key reads as not held.
 */
export type VirtualActions = Partial<RawActions>;

/**
 * One seat's live input state. One of these per slot, allocated once by makePlayer() and mutated in
 * place for the life of the process, so nothing here is ever reallocated mid-match.
 */
export interface PlayerInput {
  /** Every device OR-ed together: what held() reads. */
  cur: ActionMap<boolean>;
  /** `cur` as it was last step; the two together are the edge. */
  prev: ActionMap<boolean>;
  pressedNow: ActionMap<boolean>;
  /** Frames since each action's last edge, or NEVER when it has none buffered. */
  bufAge: ActionMap<number>;
  virtual: VirtualActions | null;
  device: InputDevice;
  /** The same three again for the devices that CANNOT type: pad, touch and the test virtual. */
  offKey: ActionMap<boolean>;
  offKeyPrev: ActionMap<boolean>;
  offKeyPressed: ActionMap<boolean>;
  joined: boolean;
  /** This seat joined (or re-claimed a pad) THIS step. */
  joinNow: boolean;
  /** Gamepad RT (or virtual / touch `run`) held: run without double-tapping. Not one of ACTIONS. */
  run: boolean;
  /** Any button of this seat's pad is active, and the same last step (the join edge). */
  gpAny: boolean;
  gpAnyPrev: boolean;
  /** This seat's own keyboard half has been used, so a pad may no longer claim it. */
  kbSeen: boolean;
  idleFrames: number;
}

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
// Cached legend()/moveText()/joinHint()/joinKeysHint()/keyText()/cellText() strings, cleared on refreshBindings().
// Keyed without template-string concatenation (layout/slot/action are looked up directly) so a cache
// HIT - the common case from per-frame draw paths (hud.js, pause.js, title.js, select.js) - allocates
// nothing; only a cache MISS (at most once per bindings change) builds a string.
const legendCache = new Map(); // layout -> string
const moveTextCache = new Map(); // layout -> string
const joinHintCache = []; // slot -> string
const joinKeysHintCache = []; // slot -> string
const keyTextCache = new Map(); // layout -> Map(action -> string)
const cellTextCache = new Map(); // layout -> Map(action -> string)
let virtualPads = null; // test hook: setPadVirtual() override, array indexed like navigator.getGamepads()

/**
 * A per-action map. Pressed states hold booleans; the buffer map holds frame ages, so `v` is
 * whichever of the two the caller needs.
 * @param {boolean|number} [v]
 */
function makeActionMap<V = boolean>(v: V | boolean = false): ActionMap<V> {
  const o = {} as ActionMap<V>;
  // `v as V`: the parameter is widened to `V | boolean` only so that the no-argument call defaults
  // V to boolean; every caller passes a V (or nothing), so the two are the same type in practice.
  for (const a of ACTIONS) o[a] = v as V;
  return o;
}
function makePlayer(): PlayerInput {
  return { cur: makeActionMap(), prev: makeActionMap(), pressedNow: makeActionMap(), bufAge: makeActionMap(NEVER), virtual: null, device: 'none',
    // The same state again for the devices that CANNOT type: pad, touch and the test virtual. A
    // screen that reads the keyboard raw (the lobby's room code) drives its cursor off these, so
    // typing a C is not also a dodge. See offKeyPressed() below.
    offKey: makeActionMap(), offKeyPrev: makeActionMap(), offKeyPressed: makeActionMap(),
    joined: false, joinNow: false, run: false, gpAny: false, gpAnyPrev: false, kbSeen: false, idleFrames: 0 };
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
  for (const k of Object.keys(bindings.global)) for (const c of bindings.global[k]) boundCodes.add(c);
}
/** Invalidate everything that is derived from `bindings` (boundCodes, joinCodes, cached hint/legend strings). */
function refreshBindings() {
  boundCodes = null; joinCodes = null;
  legendCache.clear(); moveTextCache.clear(); joinHintCache.length = 0; joinKeysHintCache.length = 0;
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

/**
 * The pads themselves (lib/input/pad.js): polling, held and pressed button masks, the stick past the
 * deadzone, the capture the CONTROLS panel binds from, and the pad-to-slot table. What is NOT in
 * there is which button is which action, because the eleven-action mask and its `run` bit are this
 * game's wire format.
 *
 * Thirty-two buttons, because `rebindPad` accepts any index up to 31 and a pad that reports more
 * than the standard sixteen must be bindable on all of them.
 *
 * The deadzone is read once, from the defaults, and that is exactly as live as it has ever been:
 * `sanitiseBindings` builds every result from `cloneBindings(defaults)` and merges only action maps
 * into it, so `bindings.stickDeadzone` can never hold anything but this number.
 */
const padSource = createPadSource({ buttons: 32, deadzone: DEFAULT_BINDINGS.stickDeadzone });
const padSeats = createPadSeats();

// --- Pad claiming (ARCHITECTURE.md section 3, docs/RECONCILIATION.md "Final controls"): an unbound
// pad's first BUTTON edge (axes ignored -- stick drift must never drop a phantom hero in) claims the
// lowest LOCAL slot (below LOCAL_PLAYERS) with no pad, whose keyboard half has not been used, and
// that is not netplay-virtual. The cap is what keeps couch play at two: a third pad finds no slot to
// claim rather than seating a player nobody can hand a keyboard to, and it is the single reason the
// old "is this press a join, a menu confirm or somebody else's hero lock?" ambiguity cannot arise
// for slots 2/3 -- those seats now only ever come from the lobby.
// A pad that disconnects releases its slot (the slot itself stays joined); on reconnect it claims
// again by the same rule, which can land it in a different slot. All claims are released wholesale by
// resetClaims() (called when the title screen is entered). Netplay turns claiming off with
// setPadClaiming(false): update() then merges every unbound pad into slot 0 and pollRaw(player) reads
// the pad bound to `player` plus every unbound pad, so a pad drives the local player online whether it
// was pressed before or after the keyboard, and can never claim the peer's slot mid-match.
/**
 * Whether each pad had ANY button down last step. This is the join gesture and it is this game's own
 * rule, not the library's: a pad claims a slot when it goes from holding nothing to holding
 * something, so a player who is already holding attack and then presses jump does not claim a second
 * time. (Axes are deliberately not in it -- stick drift must never drop a phantom hero in.)
 * @type {boolean[]}
 */
let padActivePrev = [];
let unboundPads = 0;

/**
 * OR-merge one pad's held buttons and stick into `out`; returns true if any of it was active. Takes
 * masks rather than a gamepad so the same rule serves both the step's poll and pollRaw's live read.
 * Sets pl.run for the RT "run" buttons, which are not one of ACTIONS.
 */
function applyPad(raw, dirs, out, pl) {
  let any = false;
  for (const a of ACTIONS) {
    const btns = bindings.gamepad[a] || [];
    for (const b of btns) if (raw & (1 << b)) { out[a] = true; any = true; }
  }
  for (const b of bindings.gamepadRun) if (raw & (1 << b)) { pl.run = true; any = true; }
  if (dirs & DIR.left) { out.left = true; any = true; }
  if (dirs & DIR.right) { out.right = true; any = true; }
  if (dirs & DIR.up) { out.up = true; any = true; }
  if (dirs & DIR.down) { out.down = true; any = true; }
  return any;
}

/**
 * Release/claim pad->slot bindings for this step. Must run right after padSource.poll(), before the
 * per-slot loop. Returns the set of slots claimed THIS step (so their joinNow can be set).
 * @returns {Set<number>}
 */
function claimPads() {
  const claimed = new Set();
  unboundPads = 0;
  // A pad that has been unplugged gives its slot back; the slot itself stays joined.
  padSeats.dropDisconnected(padSource);
  for (let k = 0; k < padSource.count(); k++) {
    if (!padSource.pad(k)) { padActivePrev[k] = false; continue; }
    const seated = padSeats.seatOf(k) >= 0;
    if (!seated) unboundPads++;
    const active = padSource.anyHeld(k), rising = active && !padActivePrev[k];
    padActivePrev[k] = active;
    // A press while the CONTROLS panel is capturing a gamepad button must rebind that pad, not
    // silently claim a slot and drop an unwanted player in on the button's NEXT press.
    if (rising && !padSource.capturing() && !seated) {
      // The table and "the lowest free slot" are the library's; which slots this game will give away
      // is the callback. (That the slot has no pad already is the library's own check.)
      const s = padSeats.claim(k, LOCAL_PLAYERS, (i) => !players[i].kbSeen && !players[i].virtual);
      if (s >= 0) { claimed.add(s); unboundPads--; }
    }
  }
  return claimed;
}

/** OR-merge every CONNECTED pad whose index is not claimed to any slot into `out`. Returns true if any was active. */
function readUnboundPads(out, pl) {
  let any = false;
  for (let k = 0; k < padSource.count(); k++) {
    if (!padSource.pad(k) || padSeats.seatOf(k) >= 0) continue;
    if (readGamepad(k, out, pl)) any = true;
  }
  return any;
}
/** OR-merge gamepad `index` into `out`; returns true if any button/axis is active. Sets pl.run for the RT "run" buttons. */
function readGamepad(index, out, pl) {
  if (!padSource.pad(index)) return false;
  return applyPad(padSource.rawMask(index), padSource.dirMask(index), out, pl);
}
function keyHeld(codes) {
  for (const c of codes) if (keysDown.has(c) || keysPressedPending.has(c)) return true;
  return false;
}

/** Touch-control state, OR-ed into player 1's input each step (see engine/touch.js). */
let touchActions: RawActions | null = null;

/** Input singleton (ARCHITECTURE.md section 3 / 16). Players are 0..3 (MAX_PLAYERS), but couch play
 *  fills only the first LOCAL_PLAYERS of them: slots 0 and 1 own a nine-key keyboard block each and
 *  a pad claims one of those two, never beyond. Slots 2/3 are an online room's seats (or a test
 *  virtual). Gamepads are not index-bound -- they claim on their first button press; claims reset
 *  when the title screen is entered (resetClaims()); netplay turns claiming off (setPadClaiming(false))
 *  and reads unbound pads as slot 0's local player. */
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
    // One device read a step, before anything else looks at a pad: this is what turns "held now"
    // into "held last step", which is where the claim's rising edge and the panel's capture both
    // come from.
    padSource.poll();
    const claimed = claimPads();
    for (let p = 0; p < players.length; p++) {
      const pl = players[p];
      const map = bindings.keyboard[p];
      for (const a of ACTIONS) { pl.prev[a] = pl.cur[a]; pl.offKeyPrev[a] = pl.offKey[a]; pl.offKey[a] = false; }
      pl.run = false;
      pl.gpAnyPrev = pl.gpAny;
      pl.joinNow = claimed.has(p);
      if (pl.virtual) {
        // A virtual slot is netplay's injected mask or a test hook -- never this machine's keyboard,
        // so it counts as off-keyboard too and the harness can drive a picker with setInput().
        for (const a of ACTIONS) pl.cur[a] = pl.offKey[a] = !!pl.virtual[a];
        pl.run = !!pl.virtual.run;
        pl.device = 'virtual';
        pl.gpAny = false;
      } else {
        let kb = false;
        for (const a of ACTIONS) {
          const v = map ? keyHeld(map[a]) : false;
          pl.cur[a] = v;
          if (v) kb = true;
        }
        if (p === 0 && kb) pl.kbSeen = true;
        // Pad and touch land in `offKey` first and are OR-ed into `cur` after, so both reads stay
        // available: `cur` is every device at once, `offKey` only the ones with no letters on them.
        const own = padSeats.padOf(p);
        pl.gpAny = own >= 0 ? readGamepad(own, pl.offKey, pl) : (p === 0 && !padSeats.claiming() ? readUnboundPads(pl.offKey, pl) : false);
        let touched = false;
        if (p === 0 && touchActions) {
          for (const a of ACTIONS) if (touchActions[a]) { pl.offKey[a] = true; touched = true; }
          if (touchActions.run) pl.run = true;
        }
        for (const a of ACTIONS) if (pl.offKey[a]) pl.cur[a] = true;
        pl.device = touched ? 'touch' : pl.gpAny ? 'gamepad' : kb ? 'keyboard' : pl.device;
        // "this player pressed one of their OWN keys" (used for P2+ drop-in): an edge on any key of
        // this player's own block (the blocks are disjoint, invariant (c) in bindings.js, so there
        // is nothing to exclude), or a gamepad edge. Slot 0's kbSeen comes from `kb` above; slots
        // >= 1 set kbSeen ONLY here, inside their own join-code edge.
        for (const code of keysPressedPending) if (joinCodes[p] && joinCodes[p].has(code)) { pl.joinNow = true; if (p > 0) pl.kbSeen = true; break; }
        if (pl.gpAny && !pl.gpAnyPrev) pl.joinNow = true;
      }
      for (const a of ACTIONS) {
        const pressed = pl.cur[a] && !pl.prev[a];
        pl.pressedNow[a] = pressed;
        pl.offKeyPressed[a] = pl.offKey[a] && !pl.offKeyPrev[a];
        pl.bufAge[a] = pressed ? 0 : Math.min(NEVER, pl.bufAge[a] + 1);
      }
      // The press that CLAIMS a pad to a slot is spent on the claim and produces no action edge for
      // it. Without this the same button reads as that slot's attack on the same step, which is a
      // confirm everywhere the menus are (game/menuinput.js): on the title it launches a run, and on
      // CHOOSE YOUR FIGHTER it LOCKS that slot's hero -- so somebody reconnecting a pad, or picking
      // up a spare one, chose a hero for whoever already holds that seat. `cur` is left alone (the
      // button is genuinely held), so only the edge is spent: releasing and pressing again acts
      // normally. screens/title.js guards the same hazard for a slot that JOINS this step with its
      // own `joinedNow` mask; a re-claim of a slot that was already joined never reached that mask.
      if (claimed.has(p)) for (const a of ACTIONS) { pl.pressedNow[a] = false; pl.offKeyPressed[a] = false; pl.bufAge[a] = NEVER; }
      // Frames of total silence from this seat. HELD counts, not just edges: somebody walking right
      // for ten seconds presses nothing new the whole time, and `bufAge` (per action, edge-only)
      // would call them idle. Reset by any held action or the pad's run trigger.
      let live = pl.run;
      for (const a of ACTIONS) if (pl.cur[a]) { live = true; break; }
      pl.idleFrames = live ? 0 : pl.idleFrames + 1;
      if (pl.virtual) { for (const a of ACTIONS) if (pl.pressedNow[a]) { pl.joinNow = true; break; } }
    }
    keysPressedPending.clear();
  },
  /** Is the action currently held? */
  held(player, action) { return !!players[player].cur[action]; },
  /** True only on the step the action went down. */
  pressed(player, action) { return !!players[player].pressedNow[action]; },
  /**
   * The same edge, but only from a device with no letters on it: a gamepad, the on-screen touch
   * buttons, or a test virtual. The keyboard is excluded on purpose.
   *
   * For the one screen that reads the keyboard RAW - the lobby typing a room code, where C X Z are
   * also P1's dodge, jump and attack - this is how its on-screen picker can still be driven by a
   * thumb or a pad while every keypress goes to the code being typed and nowhere else.
   */
  offKeyPressed(player, action) { return !!players[player].offKeyPressed[action]; },
  /** Pressed within the last `frames` steps (inclusive of this step). Use consume() to clear it. */
  buffered(player, action, frames = INPUT_BUFFER) { return players[player].bufAge[action] < frames; },
  /** Clear the buffer for an action (after acting on it). */
  consume(player, action) { players[player].bufAge[action] = NEVER; },
  /**
   * Forget every pending edge and buffered press, for one slot or (with no argument) all of them.
   *
   * A boundary that hands the slots to somebody else has to do this or the press that CROSSED it
   * arrives as gameplay: the buffer is INPUT_BUFFER frames deep, so a menu confirm still reads as
   * `buffered('attack')` on the far side. Online that is a desync, not a quirk - net/session.js
   * beginMatch calls it because the READY press lands in slot 0's buffer on every machine, and on
   * everyone but the host slot 0 is somebody else's character (net/protocol.js is not involved: no
   * mask ever said attack).
   */
  clearBuffers(player = -1) {
    const list = player < 0 ? players : [players[player]];
    for (const pl of list) for (const a of ACTIONS) { pl.bufAge[a] = NEVER; pl.pressedNow[a] = false; pl.offKeyPressed[a] = false; }
  },
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
  /** True if this player pressed one of their OWN keys/buttons this step (P2 drop-in; the blocks are
   *  disjoint, so no key is ambiguous). Always false for a slot beyond the couch cap: those seats are
   *  the lobby's to hand out, and every caller of this is a local drop-in path. */
  joinPressed(player) { return player < LOCAL_PLAYERS && !!players[player].joinNow; },
  /** Mark a player as joined. P1's own keys are the same either way -- joining changes nothing about them. */
  setJoined(player, joined = true) { players[player].joined = !!joined; },
  /** Has the player joined? (P1 is always joined.) */
  joined(player) { return player === 0 || !!players[player].joined; },
  /** Gamepad index claimed by `player`'s slot, or -1 if none. */
  padOf(player) { return padSeats.padOf(player); },
  /** Does this slot have a keyboard block at all? (Slots 2/3 have none: they are an online room's
   *  seats, so nobody is ever sat at this machine's keyboard on one.) */
  hasKeyboard(player) { return !!bindings.keyboard[player]; },
  /** Local slots (1..LOCAL_PLAYERS-1) that have not joined yet -- the ones a hint may still invite.
   *  Allocates -- call only on a joinState() change. */
  freeSlots() {
    const out = [];
    for (let p = 1; p < LOCAL_PLAYERS; p++) if (!players[p].joined) out.push(p);
    return out;
  },
  /** Connected pads not yet claimed by any slot. 0 while claiming is off (netplay): no press can
   *  claim a slot then, so hints must not advertise "ANY PAD BUTTON" during that window. */
  get unboundPads() { return padSeats.claiming() ? unboundPads : 0; },
  /** Slot a fresh unbound pad press would claim right now (mirrors claimPads()'s own rule: the lowest
   *  LOCAL slot with no pad, an unused keyboard half and not virtual), or -1 if none. Read-only --
   *  used to phrase join hints correctly when a keyboard slot (e.g. P2) is still poachable by a pad. */
  nextPadSlot() { return players.findIndex((pl, i) => i < LOCAL_PLAYERS && padSeats.padOf(i) < 0 && !pl.kbSeen && !pl.virtual); },
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
    padSeats.releaseAll();
    padSeats.setClaiming(true);
    for (const pl of players) pl.kbSeen = false;
  },
  /** Turn pad claiming on/off. Netplay turns it off for the lobby and the match's lifetime. */
  setPadClaiming(on) { padSeats.setClaiming(!!on); },
  /** Global (non-player) key edge this step: 'pause' | 'mute' | 'debug'. */
  globalPressed(name) { return !!globalPressed[name]; },
  /**
   * Read the raw device state for a player WITHOUT touching the edge/buffer state machine.
   *
   * Netplay needs both: it must sample the local devices to send them, and simultaneously inject
   * the peer's delayed input into the same slot through setVirtual(). update() cannot do both, so
   * this reads devices and update() then computes edges from the injected virtuals.
   *
   * There is no longer a second, conditional keyboard half to keep alive: slot 0's block is the same
   * whether anyone else has joined or not, so netplay's setJoined(1, true) for a remote slot cannot
   * take any of the local player's keys away.
   *
   * Mutates nothing: prev, pressedNow, bufAge, joinNow, device and keysPressedPending are all
   * written only inside update().
   * @returns {object} action map plus `run`
   */
  pollRaw(player: number = 0): RawActions {
    if (!boundCodes) rebuildBoundCodes();
    const o = {} as RawActions;
    const map = bindings.keyboard[player];
    for (const a of ACTIONS) o[a] = map ? keyHeld(map[a]) : false;
    // Reads the pad bound to `player` (if any) plus every unbound pad -- it keys off the slot table,
    // not the claiming flag, so this also covers the ended-session pump (claiming already back on).
    //
    // LIVE, not the step's poll: net/session.js samples this in beforeStep(), which runs BEFORE
    // input.update() has polled for the step, and reading a snapshot there would put a frame of lag
    // on everything the local player does.
    const own = padSeats.padOf(player);
    const list = padSource.readPads();
    for (let k = 0; k < list.length; k++) {
      const gp = list[k];
      if (!gp || (k !== own && padSeats.seatOf(k) >= 0)) continue;
      applyPad(padSource.maskOf(gp), padSource.dirMaskOf(gp), o, o);
    }
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
  setTouch(actions: RawActions | null) { touchActions = actions || null; },
  /** Test hook: remove the virtual override. */
  clearVirtual(player) { players[player].virtual = null; },
  /** Last device that produced input for the player ('keyboard' | 'gamepad' | 'virtual' | 'none'). */
  device(player) { return players[player].device; },
  /** Frames since this seat last held or pressed anything; 0 while it is being played. */
  idleFrames(player) { return players[player].idleFrames; },
  /** Number of player slots the engine holds (four: an online room seats four). */
  get playerCount() { return players.length; },
  /** How many of them couch play may fill. Slots at or above this only ever hold a remote peer. */
  get localPlayers() { return LOCAL_PLAYERS; },

  // --- Rebinding (engine/bindings.js does the work; this invalidates the derived caches). ---

  /** Bumped on every successful rebind / import / reset. Screens rebuild cached text when it changes. */
  get bindingsVersion() { return bindingsVersion; },
  /**
   * Rebind `action` of `layout` ('p1' | 'p2' | ... | 'pad') to `code`: a KeyboardEvent.code
   * string for a keyboard layout, or a gamepad button index for 'pad'.
   * @param {string} layout
   * @param {string} action
   * @param {string|number} code
   * @returns {import('./bindings.ts').RebindResult}
   */
  rebind(layout, action, code) {
    const r = typeof code === 'number' && layout === 'pad' ? rebindPad(bindings, action, code)
      : typeof code === 'string' ? rebindKey(bindings, layout, action, code)
      : { ok: false, reason: 'BAD KEY' };
    if (r.ok) refreshBindings();
    return r;
  },
  /** Plain-object snapshot of the live bindings, shaped for persistence (game/options.js). The
   *  `layout` stamp is what lets a save written against an older default table be dropped rather
   *  than merged (engine/bindings.js BINDINGS_LAYOUT). */
  exportBindings() {
    const c = cloneBindings(bindings);
    return { layout: BINDINGS_LAYOUT, keyboard: c.keyboard, pad: c.gamepad };
  },
  /** Sanitise `raw` (a save's `bindings` field, or null) and copy it into the live bindings object. */
  importBindings(raw) {
    const s = sanitiseBindings(raw, DEFAULT_BINDINGS, ACTIONS);
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
  /** Cached label for a layout's four direction keys ('ARROWS' / 'WASD' / 'D-PAD'; see bindings.js moveLabelFor). */
  moveText(layout) {
    let v = moveTextCache.get(layout);
    if (v === undefined) { v = moveLabelFor(bindings, layout); moveTextCache.set(layout, v); }
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
  /** Cached long "P{slot+1}: PRESS X/Y/Z OR W TO JOIN" hint (lists every joinable key), falling back to
   *  joinHint()'s pad form for a slot with no keyboard block -- there is no key list to spell out there,
   *  and the two hints must never disagree about how that slot joins. */
  joinKeysHint(slot = 1) {
    let v = joinKeysHintCache[slot];
    if (v === undefined) {
      v = !bindings.keyboard[slot] ? this.joinHint(slot) : `P${slot + 1}: PRESS ${joinLabels(bindings, slot).keys} TO JOIN`;
      joinKeysHintCache[slot] = v;
    }
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

  /**
   * Begin a capture: every button held right now is ignored until it is released, so only a fresh
   * press can be bound. Reads the step's poll rather than the device -- update() has already polled
   * for this step by the time a panel calls this, and polling again would spend the step's edges.
   */
  beginPadCapture() { padSource.beginCapture(); },
  /** First button (any pad, index order) pressed since beginPadCapture(), else -1. */
  capturePadButton() { return padSource.capturing() ? padSource.captureButton() : -1; },
  /** End a capture session. */
  endPadCapture() { padSource.endCapture(); },
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
    padSource.setPads(virtualPads);
  },
};
