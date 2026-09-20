// Default keyboard/gamepad bindings and pure, Node-importable helpers over a bindings object
// (docs/ARCHITECTURE.md section 16). No `window` / `navigator` reference anywhere in this file:
// `tools/nettest.js` imports `engine/input.js`, which imports this module, under plain Node.
//
// ONE KEY SET PER PLAYER, ALWAYS. Each keyboard player owns a nine-key block: a 3x3 square of the
// main keyboard whose cross is movement and whose five remaining keys are the buttons, plus the two
// digits directly above the block for taunt and start. P1 takes the leftmost block; every further
// local player's block is the same nine keys shifted three columns right, finger for finger. P1's
// block never moves -- alone, in local co-op or online, the keys under your hand are the same nine,
// which is the whole point of the layout (it replaces the old "1P arcade" set that swapped itself
// out for a different one the moment a second player joined).
//
//     P1  Q W E / A S D / Z X C  + digits 1 2      P2  R T Y / F G H / V B N  + digits 4 5
//
// The binding invariants enforced by `rebindKey` / `rebindPad` and re-enforced on load by
// `sanitiseBindings` (so a hand-edited save can never violate them):
//   (a) every action in every layout has at least one code;
//   (b) within a layout no code sits under two actions;
//   (c) no code of one player's keyboard appears in another player's, under any action -- which is
//       what lets `joinCodesFor` say "this press was P2's own" with no exceptions to carve out;
//   (d) no global key (Escape / M / F1) is bound anywhere;
//   (e) gamepad: at least one button per action, no button under two actions, none of `gamepadRun`.

import { keyLabel as labelForKey, padLabel as labelForPad } from '../lib/input/labels.ts';

/**
 * @typedef {{ keyboard: Array<Record<string, string[]>>, gamepad: Record<string, number[]>,
 *   gamepadRun: number[], global: Record<string, string[]>, stickDeadzone: number }} Bindings
 */
/** @typedef {{ ok: true, swapped?: string } | { ok: false, reason: string }} RebindResult */

// The two `@typedef`s above are what this file documented itself with while it was `.js`. A `.ts`
// file ignores the JSDoc form, so they are restated below as real declarations -- the comments stay
// because they are what every `@param {Bindings}` in this file still points at.

/**
 * A whole bindings table: one action->codes map per keyboard player (index 0 is P1), the gamepad
 * map, the buttons that mean "run", the three global keys and the stick deadzone.
 */
export interface Bindings {
  /** One map per keyboard slot; `keyboard[0]` is P1's nine-key block. */
  keyboard: Array<Record<string, string[]>>;
  /** Standard-mapping button indices per action. */
  gamepad: Record<string, number[]>;
  /** Held gamepad buttons that mean "run" (RT). */
  gamepadRun: number[];
  /** The keys bound outside any player: pause / mute / debug. */
  global: Record<string, string[]>;
  stickDeadzone: number;
}

/** What `rebindKey` / `rebindPad` answer with: the swap they made, or the reason they refused. */
export type RebindResult = { ok: true; swapped?: string } | { ok: false; reason: string };

/** Default bindings. Keyboard entries are KeyboardEvent.code values; gamepad entries are standard-mapping button indices. */
export const DEFAULT_BINDINGS = {
  keyboard: [
    // P1 -- the block in the keyboard's first three columns. The cross of the square moves
    // (W up, A left, S down, D right); its corners and lid are the five buttons, with attack /
    // jump / dodge kept on Z X C where the arcade layout always had them and special / super on
    // the row above. Arrows are a second set of movement codes, live at all times: no other
    // player's block uses them, so nothing has to switch them off.
    { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
      attack: ['KeyZ'], jump: ['KeyX'], dodge: ['KeyC'], special: ['KeyQ'], super: ['KeyE'],
      taunt: ['Digit1'], start: ['Enter', 'Digit2'] },
    // P2 (local co-op) -- the same nine keys three columns right, finger for finger: T is P2's W,
    // F G H are P2's A S D, V B N are P2's Z X C, and digits 4 5 are P2's 1 2.
    { left: ['KeyF'], right: ['KeyH'], up: ['KeyT'], down: ['KeyG'],
      attack: ['KeyV'], jump: ['KeyB'], dodge: ['KeyN'], special: ['KeyR'], super: ['KeyY'],
      taunt: ['Digit4'], start: ['Digit5'] },
  ],
  gamepad: { attack: [0], jump: [1], dodge: [2], special: [3], taunt: [4], super: [5], start: [9], up: [12], down: [13], left: [14], right: [15] },
  /** Held gamepad buttons that mean "run" (RT). Exposed as `input.runHeld(player)`. */
  gamepadRun: [7],
  global: { pause: ['Escape'], mute: ['KeyM'], debug: ['F1'] },
  stickDeadzone: 0.25,
};

/** Layout identifiers: one per keyboard slot, plus the gamepad map. */
export const LAYOUTS = ['p1', 'p2', 'pad'];

/**
 * Stamp carried by a persisted bindings blob, bumped whenever the DEFAULT table is re-laid-out.
 * `sanitiseBindings` drops a save that does not carry the current stamp instead of merging it: the
 * old two-halves-of-one-keyboard table is itself internally consistent under the invariants above,
 * so not one action would revert and a returning player would silently keep a set of keys the game
 * no longer documents, teaches or shows a legend for.
 */
export const BINDINGS_LAYOUT = 2;

/**
 * The action->codes map a layout name addresses, or `null` for an unknown layout.
 * @param {Bindings} b
 * @param {string} layout
 * @returns {Record<string, string[]>|Record<string, number[]>|null}
 */
export function layoutMap(b, layout) {
  if (layout === 'pad') return b.gamepad;
  if (layout[0] === 'p') {
    const i = Number(layout.slice(1)) - 1;
    if (Number.isInteger(i) && i >= 0 && i < b.keyboard.length) return b.keyboard[i];
  }
  return null;
}

/** Which physical side (0 = P1, 1 = P2, ...) a keyboard layout belongs to. @param {string} layout @returns {number} */
export function sideOf(layout) { return Number(layout.slice(1)) - 1; }

/** @param {Record<string, Array<string|number>>} m @returns {Record<string, Array<string|number>>} */
// Generic over the code type so one helper serves both maps: a keyboard map's codes are
// KeyboardEvent.code strings, a gamepad map's are button indices, and the copy keeps whichever it
// was handed rather than widening both to `string | number`.
function cloneActionMap<T extends string | number>(m: Record<string, T[]>): Record<string, T[]> {
  /** @type {Record<string, Array<string|number>>} */
  const o: Record<string, T[]> = {};
  for (const k of Object.keys(m)) o[k] = m[k].slice();
  return o;
}

/** Deep copy of a bindings object (arrays sliced, maps copied per action). @param {Bindings} src @returns {Bindings} */
export function cloneBindings(src: Bindings): Bindings {
  return {
    keyboard: src.keyboard.map((m) => /** @type {Record<string, string[]>} */ (cloneActionMap(m))),
    gamepad: /** @type {Record<string, number[]>} */ (cloneActionMap(src.gamepad)),
    gamepadRun: src.gamepadRun.slice(),
    global: /** @type {Record<string, string[]>} */ (cloneActionMap(src.global)),
    stickDeadzone: src.stickDeadzone,
  };
}

/** Named labels for codes `engine/text.js` cannot spell out letter-for-letter. */
const KEY_NAMES = {
  Space: 'SPACE', Enter: 'ENTER', NumpadEnter: 'NUM ENTER', Backspace: 'BACKSPACE', Escape: 'ESC', Tab: 'TAB',
  CapsLock: 'CAPS', ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL',
  AltLeft: 'L ALT', AltRight: 'R ALT', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Minus: '-', Equal: '=', Backquote: 'TILDE', Backslash: 'BSLASH', Insert: 'INS', Delete: 'DEL', Home: 'HOME',
  End: 'END', PageUp: 'PGUP', PageDown: 'PGDN', NumpadAdd: 'NUM +', NumpadSubtract: 'NUM -',
  NumpadMultiply: 'NUM *', NumpadDivide: 'NUM /', NumpadDecimal: 'NUM .',
};

/**
 * How this game spells a key, handed to the library's label algorithm (lib/input/labels.js): the
 * table above first, then KeyA -> A and Digit1 -> 1 and Numpad7 -> NUM7 and F5 -> F5, then this
 * fallback. Eight characters is what a cell on the CONTROLS grid holds.
 *
 * The library checks the table BEFORE the patterns where this file used to check it after. That is
 * the same function: no entry in KEY_NAMES matches any of those four patterns, so neither order can
 * reach an entry the other would not.
 */
const KEY_LABEL_OPTS = { names: KEY_NAMES, fallback: (code) => code.toUpperCase().slice(0, 8) };

/** Short on-screen label for a `KeyboardEvent.code`. @param {string} code @returns {string} */
export function keyLabel(code) { return labelForKey(code, KEY_LABEL_OPTS); }

/** Standard-mapping gamepad button labels by index. */
export const PAD_LABELS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'SELECT', 'START', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT'];
const PAD_LABEL_OPTS = { labels: PAD_LABELS, fallback: (i) => 'B' + i };
/** Short on-screen label for a gamepad button index. @param {number} i @returns {string} */
export function padLabel(i) { return labelForPad(i, PAD_LABEL_OPTS); }

/**
 * Codes that count as "player `slot` pressed one of their own keys" (drop-in). The single definition
 * of that rule: every code bound to `keyboard[slot]`. Invariant (c) keeps the blocks disjoint, so
 * there is nothing to subtract -- a press on one of these keys can only ever have been this player.
 * @param {Bindings} b
 * @param {number} slot
 * @returns {Set<string>}
 */
export function joinCodesFor(b, slot) {
  /** @type {Set<string>} */
  const set = new Set();
  const map = b.keyboard[slot];
  if (!map) return set;
  for (const a of Object.keys(map)) for (const c of map[a]) set.add(c);
  return set;
}

const LEGEND_BUTTONS = ['attack', 'jump', 'dodge', 'special', 'super', 'taunt', 'start'];

/**
 * Short label for a layout's four direction keys: the two shipped sets are named ('ARROWS', 'WASD',
 * 'D-PAD'), anything remapped is spelled out up/left/down/right ('WASD' order), run together when
 * every label is one character and slash-separated otherwise. The single definition of that label:
 * `legendFor` below and `input.moveText()` (the COMMANDS plate's MOVE row) both read it from here.
 * @param {Bindings} b
 * @param {string} layout
 * @returns {string}
 */
export function moveLabelFor(b, layout) {
  if (layout === 'pad') return 'D-PAD';
  const map = /** @type {Record<string, string[]>|null} */ (layoutMap(b, layout));
  if (!map) return '';
  const up = map.up[0], left = map.left[0], down = map.down[0], right = map.right[0];
  if (up === 'ArrowUp' && left === 'ArrowLeft' && down === 'ArrowDown' && right === 'ArrowRight') return 'ARROWS';
  if (up === 'KeyW' && left === 'KeyA' && down === 'KeyS' && right === 'KeyD') return 'WASD';
  const labels = [up, left, down, right].map(keyLabel);
  return labels.every((l) => l.length === 1) ? labels.join('') : labels.join('/');
}

/**
 * Legend line for a layout, e.g. `'WASD MOVE  Z ATTACK  X JUMP  C DODGE  Q SPECIAL  E SUPER  1 TAUNT  ENTER START'`.
 * @param {Bindings} b
 * @param {string} layout
 * @returns {string}
 */
export function legendFor(b, layout) {
  if (layout === 'pad') {
    const map = /** @type {Record<string, number[]>} */ (layoutMap(b, layout));
    if (!map) return '';
    const parts = LEGEND_BUTTONS.map((a) => `${padLabel(map[a][0])} ${a.toUpperCase()}`);
    return `${moveLabelFor(b, layout)} MOVE  ${parts.join('  ')}`;
  }
  const map = /** @type {Record<string, string[]>|null} */ (layoutMap(b, layout));
  if (!map) return '';
  const parts = LEGEND_BUTTONS.map((a) => `${keyLabel(map[a][0])} ${a.toUpperCase()}`);
  return `${moveLabelFor(b, layout)} MOVE  ${parts.join('  ')}`;
}

/**
 * The join-hint pieces for a keyboard slot: `key` is the single primary label shown in the short
 * hint, `keys` lists every joinable primary plus the alternate START label. Both are '' for a slot
 * with no keyboard half at all (P3/P4), whose hint is "ANY PAD BUTTON" instead.
 * @param {Bindings} b
 * @param {number} slot
 * @returns {{ key: string, keys: string }}
 */
export function joinLabels(b, slot) {
  const map = b.keyboard[slot];
  if (!map) return { key: '', keys: '' };
  // Every code of the block is a join code (invariant (c)), so the primary one is simply the first.
  const prim = (a) => (map[a] && map[a][0]) || '';
  let key = '';
  for (const a of LEGEND_BUTTONS) { const c = prim(a); if (c) { key = keyLabel(c); break; } }
  const parts = [];
  for (const a of LEGEND_BUTTONS) { if (a === 'start') continue; const c = prim(a); if (c) parts.push(keyLabel(c)); }
  let keys = parts.join('/');
  const startCode = prim('start');
  if (startCode) keys += ' OR ' + keyLabel(startCode);
  return { key, keys };
}

/** True if `code` is bound to any global action (Escape / M / F1). @param {Bindings} b @param {string} code */
function isGlobalCode(b, code) {
  for (const k of Object.keys(b.global)) if (b.global[k].includes(code)) return true;
  return false;
}

/**
 * Rebind a keyboard action to `code`, mutating `b` in place. See the file header for the invariants
 * this enforces. A code already in this layout under another action swaps: that action takes the
 * codes this one is giving up (invariant (a) guarantees there is at least one).
 * @param {Bindings} b
 * @param {string} layout
 * @param {string} action
 * @param {string} code
 * @returns {RebindResult}
 */
export function rebindKey(b, layout, action, code) {
  const map = /** @type {Record<string, string[]>|null} */ (layoutMap(b, layout));
  if (!map || layout === 'pad' || !map[action]) return { ok: false, reason: 'BAD LAYOUT' };
  if (!code) return { ok: false, reason: 'UNKNOWN KEY' };
  if (isGlobalCode(b, code)) return { ok: false, reason: `${keyLabel(code)} IS A GLOBAL KEY` };
  if (map[action][0] === code) return { ok: true };
  const L = keyLabel(code);
  const own = new Set();
  for (const a of Object.keys(map)) for (const c of map[a]) own.add(c);
  if (!own.has(code)) {
    const side = sideOf(layout);
    for (let i = 0; i < b.keyboard.length; i++) {
      if (i === side) continue;
      for (const a of Object.keys(b.keyboard[i])) if (b.keyboard[i][a].includes(code)) return { ok: false, reason: `${L} IS PLAYER ${i + 1}'S KEY` };
    }
  }
  const old = map[action].slice();
  let swapped = '';
  /** @type {Record<string, string[]>} */
  const updates = {};
  for (const a of Object.keys(map)) {
    if (a === action || !map[a].includes(code)) continue;
    let next = map[a].filter((c) => c !== code);
    if (next.length === 0) { next = old; swapped = a; }
    updates[a] = next;
  }
  // Every check above passed: commit the same-layout updates, then the new code.
  for (const a of Object.keys(updates)) map[a] = updates[a];
  map[action] = [code];
  return swapped ? { ok: true, swapped } : { ok: true };
}

/**
 * Rebind a gamepad action to `button`, mutating `b` in place. Same swap rule as `rebindKey`, with
 * only the RT "run" button and a same-map collision to worry about -- the pad map is shared, so
 * there is no other player's layout to refuse against.
 * @param {Bindings} b
 * @param {string} action
 * @param {number} button
 * @returns {RebindResult}
 */
export function rebindPad(b, action, button) {
  if (!Number.isInteger(button) || button < 0 || button > 31) return { ok: false, reason: 'BAD BUTTON' };
  if (!b.gamepad[action]) return { ok: false, reason: 'BAD LAYOUT' };
  if (b.gamepad[action][0] === button) return { ok: true };
  if (b.gamepadRun.includes(button)) return { ok: false, reason: 'RT IS RUN' };
  const old = b.gamepad[action].slice();
  let swapped = '';
  /** @type {Record<string, number[]>} */
  const updates = {};
  for (const a of Object.keys(b.gamepad)) {
    if (a === action || !b.gamepad[a].includes(button)) continue;
    let next = b.gamepad[a].filter((x) => x !== button);
    if (next.length === 0) { next = old; swapped = a; }
    updates[a] = next;
  }
  for (const a of Object.keys(updates)) b.gamepad[a] = updates[a];
  b.gamepad[action] = [button];
  return swapped ? { ok: true, swapped } : { ok: true };
}

/** @param {Record<string, number[]>} gamepad @param {number[]} gamepadRun @param {number[]} codes @param {string} action */
function padInvalid(gamepad, gamepadRun, codes, action) {
  for (const btn of codes) {
    if (gamepadRun.includes(btn)) return true;
    if (Object.keys(gamepad).some((a2) => a2 !== action && gamepad[a2].includes(btn))) return true;
  }
  return false;
}

/**
 * True if any code in `codes` (the current value of `map[action]`) violates a keyboard invariant,
 * read against the CURRENT (possibly still-invalid) state of `out` -- callers batch every revert
 * this pass finds and apply them together, so a symmetric collision reverts both sides.
 * @param {Bindings} out
 * @param {Record<string, string[]>} map
 * @param {string[]} codes
 * @param {number} side
 * @param {string} action
 */
function codesInvalid(out, map, codes, side, action) {
  for (const code of codes) {
    if (isGlobalCode(out, code)) return true;
    if (Object.keys(map).some((a2) => a2 !== action && map[a2].includes(code))) return true;
    for (let i = 0; i < out.keyboard.length; i++) {
      if (i === side) continue;
      if (Object.keys(out.keyboard[i]).some((a2) => out.keyboard[i][a2].includes(code))) return true;
    }
  }
  return false;
}

/**
 * Merge `rawMap[a]` into `target[a]` for every action in `actions` that `target` already has,
 * accepting only a non-empty array whose every element passes `isValid`; otherwise `target[a]`
 * (already the default, from the caller's `cloneBindings`) is left alone.
 * @param {Record<string, Array<string|number>>} target
 * @param {*} rawMap
 * @param {string[]} actions
 * @param {(v: unknown) => boolean} isValid
 */
function mergeAction(target, rawMap, actions, isValid) {
  if (!rawMap || typeof rawMap !== 'object') return;
  for (const a of actions) {
    if (!(a in target)) continue;
    const v = rawMap[a];
    if (Array.isArray(v) && v.length > 0 && v.every(isValid)) target[a] = v.slice();
  }
}

/**
 * Sanitise a raw (possibly hand-edited, possibly garbage) save into a fully valid `Bindings`
 * object. Starts from a clone of `defaults`, merges in whatever of `raw` is well-shaped, then
 * repeatedly reverts any action whose codes violate an invariant (see file header) back to its
 * default list until a pass finds nothing left to revert -- bounded at
 * `(keyboard layouts + 1) * actions.length + 1` passes (each pass that changes anything reverts
 * at least one more keyboard or gamepad entry to its default, and there are at most that many
 * entries to revert), which is always enough because an all-default layout satisfies every rule.
 * A save that does not carry the current `BINDINGS_LAYOUT` stamp is dropped whole (see that
 * constant): it was written against a different default table, so it loads as today's defaults
 * rather than as a stale layout the game no longer teaches.
 * @param {*} raw
 * @param {Bindings} [defaults]
 * @param {string[]} [actions]
 * @returns {Bindings}
 */
export function sanitiseBindings(raw, defaults = DEFAULT_BINDINGS, actions = Object.keys(DEFAULT_BINDINGS.gamepad)) {
  const out = cloneBindings(defaults);
  if (!raw || typeof raw !== 'object' || raw.layout !== BINDINGS_LAYOUT) return out;
  const isStr = (v) => typeof v === 'string' && v.length > 0;
  const isBtn = (v) => Number.isInteger(v) && /** @type {number} */ (v) >= 0;
  if (Array.isArray(raw.keyboard)) for (let i = 0; i < out.keyboard.length && i < raw.keyboard.length; i++) mergeAction(out.keyboard[i], raw.keyboard[i], actions, isStr);
  mergeAction(out.gamepad, raw.pad, actions, isBtn);

  const kbLayouts = [];
  for (let i = 0; i < out.keyboard.length; i++) kbLayouts.push('p' + (i + 1));
  const maxPasses = (kbLayouts.length + 1) * actions.length + 1;
  for (let pass = 0; pass < maxPasses; pass++) {
    /** @type {Array<{ map: Record<string, Array<string|number>>, a: string, value: Array<string|number> }>} */
    const reverts = [];
    for (const L of kbLayouts) {
      const map = /** @type {Record<string, string[]>} */ (layoutMap(out, L));
      const defMap = /** @type {Record<string, string[]>} */ (layoutMap(defaults, L));
      const side = sideOf(L);
      for (const a of actions) {
        if (!map[a]) continue;
        if (codesInvalid(out, map, map[a], side, a)) reverts.push({ map, a, value: defMap[a].slice() });
      }
    }
    for (const a of actions) {
      if (!out.gamepad[a]) continue;
      if (padInvalid(out.gamepad, out.gamepadRun, out.gamepad[a], a)) reverts.push({ map: out.gamepad, a, value: defaults.gamepad[a].slice() });
    }
    if (reverts.length === 0) break;
    for (const r of reverts) r.map[r.a] = r.value;
  }
  return out;
}
