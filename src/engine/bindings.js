// Default keyboard/gamepad bindings and pure, Node-importable helpers over a bindings object
// (docs/ARCHITECTURE.md section 16). No `window` / `navigator` reference anywhere in this file:
// `tools/nettest.js` imports `engine/input.js`, which imports this module, under plain Node.
//
// The binding invariants enforced by `rebindKey` / `rebindPad` and re-enforced on load by
// `sanitiseBindings` (so a hand-edited save can never violate them):
//   (a) every action in every layout has at least one code;
//   (b) within a layout no code sits under two actions;
//   (c) across the side-0 pair (1P ARCADE `soloAliases` and P1 `keyboard[0]`) no code sits under
//       two *different* actions (the same action may share a code, e.g. Space jumps in both);
//   (d) no code of `keyboard[1]` appears on side 0 except the codes that are shared in the
//       defaults (the arrows) — a shared code may be rearranged inside the layout that owns it
//       but can never be *added* to the other side, so the P2 join set (`joinCodesFor`) can never
//       gain a side-0 key and J can never leave it;
//   (e) no global key (Escape / M / F1) is bound anywhere;
//   (f) gamepad: at least one button per action, no button under two actions, none of `gamepadRun`.

/**
 * @typedef {{ keyboard: Array<Record<string, string[]>>, soloAliases: Record<string, string[]>,
 *   gamepad: Record<string, number[]>, gamepadRun: number[], global: Record<string, string[]>,
 *   stickDeadzone: number }} Bindings
 */
/** @typedef {{ ok: true, swapped?: string } | { ok: false, reason: string }} RebindResult */

/** Default bindings. Keyboard entries are KeyboardEvent.code values; gamepad entries are standard-mapping button indices. */
export const DEFAULT_BINDINGS = {
  keyboard: [
    // Buttons form an R T Y / F G H block: one shifted-left right hand rests on it while the left hand holds WASD.
    // This mirrors P2's U I O / J K L block finger for finger (index attack, middle jump, ring special).
    { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], attack: ['KeyF'], jump: ['KeyG', 'Space'], dodge: ['KeyR'],
      special: ['KeyH'], super: ['KeyY'], taunt: ['KeyT'], start: ['Enter', 'NumpadEnter'] },
    { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], attack: ['KeyJ', 'Numpad1'],
      jump: ['KeyK', 'Numpad2'], dodge: ['KeyU', 'Numpad4'], special: ['KeyL', 'Numpad3'], super: ['KeyO', 'Numpad6'],
      taunt: ['KeyI', 'Numpad5'], start: ['Backspace', 'Numpad0'] },
  ],
  /**
   * Extra P1 keys, active only until P2 joins (`input.setJoined(1, true)`). This is the arcade layout the title
   * screen leads with for one player: arrows under the right hand, one contiguous Z X C V B N row under the left.
   * Arrows are shared with P2, so they never count as a P2 join key.
   */
  soloAliases: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], attack: ['KeyZ'], jump: ['KeyX', 'Space'],
    dodge: ['KeyC'], special: ['KeyV'], super: ['KeyN'], taunt: ['KeyB'], start: ['Enter', 'NumpadEnter'] },
  gamepad: { attack: [0], jump: [1], dodge: [2], special: [3], taunt: [4], super: [5], start: [9], up: [12], down: [13], left: [14], right: [15] },
  /** Held gamepad buttons that mean "run" (RT). Exposed as `input.runHeld(player)`. */
  gamepadRun: [7],
  global: { pause: ['Escape'], mute: ['KeyM'], debug: ['F1'] },
  stickDeadzone: 0.25,
};

/** Layout identifiers: 1P arcade aliases, per-slot keyboards, and the gamepad map. */
export const LAYOUTS = ['solo', 'p1', 'p2', 'pad'];

/**
 * The action->codes map a layout name addresses, or `null` for an unknown layout.
 * @param {Bindings} b
 * @param {string} layout
 * @returns {Record<string, string[]>|Record<string, number[]>|null}
 */
export function layoutMap(b, layout) {
  if (layout === 'solo') return b.soloAliases;
  if (layout === 'pad') return b.gamepad;
  if (layout[0] === 'p') {
    const i = Number(layout.slice(1)) - 1;
    if (Number.isInteger(i) && i >= 0 && i < b.keyboard.length) return b.keyboard[i];
  }
  return null;
}

/** Which physical side (0 = P1, 1 = P2, ...) a keyboard layout belongs to. @param {string} layout @returns {number} */
export function sideOf(layout) { return layout === 'solo' ? 0 : Number(layout.slice(1)) - 1; }

/**
 * The layout that shares side-0 keys with `layout` (solo <-> p1), or `null` (p2 / pad have none).
 * @param {Bindings} b
 * @param {string} layout
 * @returns {Record<string, string[]>|null}
 */
export function siblingMap(b, layout) {
  if (layout === 'solo') return b.keyboard[0];
  if (layout === 'p1') return b.soloAliases;
  return null;
}

/** @param {Record<string, Array<string|number>>} m @returns {Record<string, Array<string|number>>} */
function cloneActionMap(m) {
  /** @type {Record<string, Array<string|number>>} */
  const o = {};
  for (const k of Object.keys(m)) o[k] = m[k].slice();
  return o;
}

/** Deep copy of a bindings object (arrays sliced, maps copied per action). @param {Bindings} src @returns {Bindings} */
export function cloneBindings(src) {
  return {
    keyboard: src.keyboard.map((m) => /** @type {Record<string, string[]>} */ (cloneActionMap(m))),
    soloAliases: /** @type {Record<string, string[]>} */ (cloneActionMap(src.soloAliases)),
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

/** Short on-screen label for a `KeyboardEvent.code`. @param {string} code @returns {string} */
export function keyLabel(code) {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code);
  if (m) return 'NUM' + m[1];
  m = /^F(\d+)$/.exec(code);
  if (m) return code;
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  return code.toUpperCase().slice(0, 8);
}

/** Standard-mapping gamepad button labels by index. */
export const PAD_LABELS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'SELECT', 'START', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT'];
/** Short on-screen label for a gamepad button index. @param {number} i @returns {string} */
export function padLabel(i) { return PAD_LABELS[i] || 'B' + i; }

/**
 * Codes that count as "player `slot` pressed one of their own keys" (P2 drop-in). The single
 * definition of that rule: every code bound to `keyboard[slot]`, minus the codes shared with
 * `soloAliases` when `slot !== 0` (those keys are also P1's, so they can never trigger a P2 join).
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
  if (slot !== 0) for (const a of Object.keys(b.soloAliases)) for (const c of b.soloAliases[a]) set.delete(c);
  return set;
}

const LEGEND_BUTTONS = ['attack', 'jump', 'dodge', 'special', 'super', 'taunt', 'start'];

/**
 * Legend line for a layout, e.g. `'ARROWS MOVE  Z ATTACK  X JUMP  C DODGE  V SPECIAL  N SUPER  B TAUNT  ENTER START'`.
 * @param {Bindings} b
 * @param {string} layout
 * @returns {string}
 */
export function legendFor(b, layout) {
  if (layout === 'pad') {
    const map = /** @type {Record<string, number[]>} */ (layoutMap(b, layout));
    if (!map) return '';
    const parts = LEGEND_BUTTONS.map((a) => `${padLabel(map[a][0])} ${a.toUpperCase()}`);
    return `D-PAD MOVE  ${parts.join('  ')}`;
  }
  const map = /** @type {Record<string, string[]>|null} */ (layoutMap(b, layout));
  if (!map) return '';
  const up = map.up[0], left = map.left[0], down = map.down[0], right = map.right[0];
  let move;
  if (up === 'ArrowUp' && left === 'ArrowLeft' && down === 'ArrowDown' && right === 'ArrowRight') move = 'ARROWS';
  else if (up === 'KeyW' && left === 'KeyA' && down === 'KeyS' && right === 'KeyD') move = 'WASD';
  else {
    const labels = [up, left, down, right].map(keyLabel);
    move = labels.every((l) => l.length === 1) ? labels.join('') : labels.join('/');
  }
  const parts = LEGEND_BUTTONS.map((a) => `${keyLabel(map[a][0])} ${a.toUpperCase()}`);
  return `${move} MOVE  ${parts.join('  ')}`;
}

/**
 * The P2-join hint pieces for a keyboard slot: `key` is the single primary label shown in the
 * short hint, `keys` lists every joinable primary plus the alternate START label.
 * @param {Bindings} b
 * @param {number} slot
 * @returns {{ key: string, keys: string }}
 */
export function joinLabels(b, slot) {
  const join = joinCodesFor(b, slot);
  const map = b.keyboard[slot];
  const prim = (a) => { for (const c of map[a] || []) if (join.has(c)) return c; return ''; };
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
 * Rebind a keyboard action to `code`, mutating `b` in place. See the file header for the
 * invariants this enforces.
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
    if (side !== 0) for (const a of Object.keys(b.soloAliases)) if (b.soloAliases[a].includes(code)) return { ok: false, reason: `${L} IS PLAYER 1'S KEY` };
  }
  const sib = siblingMap(b, layout);
  /** @type {string[]} */
  const stripActions = [];
  if (sib) {
    for (const a of Object.keys(sib)) {
      if (a === action || !sib[a].includes(code)) continue;
      if (sib[a].length === 1) return { ok: false, reason: `${L} IS ${layout === 'solo' ? 'P1' : '1P ARCADE'}'S ${a.toUpperCase()}` };
      stripActions.push(a);
    }
  }
  const old = map[action].slice();
  let swapped = '';
  /** @type {Record<string, string[]>} */
  const updates = {};
  for (const a of Object.keys(map)) {
    if (a === action || !map[a].includes(code)) continue;
    let next = map[a].filter((c) => c !== code);
    if (next.length === 0) {
      const restore = old.filter((c) => !sib || !Object.keys(sib).some((x) => x !== a && sib[x].includes(c)));
      if (restore.length === 0) return { ok: false, reason: `REBIND ${a.toUpperCase()} FIRST` };
      next = restore;
      swapped = a;
    }
    updates[a] = next;
  }
  // Every check above passed: commit the sibling strips, the same-layout updates, then the new code.
  if (sib) for (const a of stripActions) sib[a] = sib[a].filter((c) => c !== code);
  for (const a of Object.keys(updates)) map[a] = updates[a];
  map[action] = [code];
  return swapped ? { ok: true, swapped } : { ok: true };
}

/**
 * Rebind a gamepad action to `button`, mutating `b` in place. No sibling layout for gamepad.
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

/** @param {Record<string, string[]>} m @returns {Set<string>} */
function allCodes(m) {
  /** @type {Set<string>} */
  const s = new Set();
  for (const a of Object.keys(m)) for (const c of m[a]) s.add(c);
  return s;
}

/** Codes present in both `defaults.keyboard[1]` and the default side-0 pair (the shared arrows). @param {Bindings} defaults */
function sharedCodes(defaults) {
  const side0 = new Set([...allCodes(defaults.soloAliases), ...allCodes(defaults.keyboard[0])]);
  const kb1 = allCodes(defaults.keyboard[1]);
  return new Set([...kb1].filter((c) => side0.has(c)));
}

/**
 * True if any code in `codes` (the current value of `map[action]`) violates a keyboard invariant,
 * read against the CURRENT (possibly still-invalid) state of `out` — callers batch every revert
 * this pass finds and apply them together, so a symmetric collision reverts both sides.
 * @param {Bindings} out
 * @param {Record<string, string[]>} map
 * @param {string[]} codes
 * @param {Record<string, string[]>|null} sib
 * @param {number} side
 * @param {Set<string>} shared
 * @param {string} action
 */
function codesInvalid(out, map, codes, sib, side, shared, action) {
  for (const code of codes) {
    if (isGlobalCode(out, code)) return true;
    if (Object.keys(map).some((a2) => a2 !== action && map[a2].includes(code))) return true;
    if (sib && Object.keys(sib).some((a2) => a2 !== action && sib[a2].includes(code))) return true;
    if (!shared.has(code)) {
      let otherSide = false;
      for (let i = 0; i < out.keyboard.length && !otherSide; i++) {
        if (i === side) continue;
        if (Object.keys(out.keyboard[i]).some((a2) => out.keyboard[i][a2].includes(code))) otherSide = true;
      }
      if (!otherSide && side !== 0 && Object.keys(out.soloAliases).some((a2) => out.soloAliases[a2].includes(code))) otherSide = true;
      if (otherSide) return true;
    }
  }
  return false;
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
 * default list until a pass finds nothing left to revert — bounded at
 * `(keyboard layouts + 1) * actions.length + 1` passes (each pass that changes anything reverts
 * at least one more keyboard or gamepad entry to its default, and there are at most that many
 * entries to revert), which is always enough because an all-default layout satisfies every rule.
 * @param {*} raw
 * @param {Bindings} [defaults]
 * @param {string[]} [actions]
 * @returns {Bindings}
 */
export function sanitiseBindings(raw, defaults = DEFAULT_BINDINGS, actions = Object.keys(DEFAULT_BINDINGS.gamepad)) {
  const out = cloneBindings(defaults);
  if (!raw || typeof raw !== 'object') return out;
  const isStr = (v) => typeof v === 'string' && v.length > 0;
  const isBtn = (v) => Number.isInteger(v) && /** @type {number} */ (v) >= 0;
  mergeAction(out.soloAliases, raw.solo, actions, isStr);
  if (Array.isArray(raw.keyboard)) for (let i = 0; i < out.keyboard.length && i < raw.keyboard.length; i++) mergeAction(out.keyboard[i], raw.keyboard[i], actions, isStr);
  mergeAction(out.gamepad, raw.pad, actions, isBtn);

  const shared = sharedCodes(defaults);
  const kbLayouts = ['solo'];
  for (let i = 0; i < out.keyboard.length; i++) kbLayouts.push('p' + (i + 1));
  const maxPasses = (kbLayouts.length + 1) * actions.length + 1;
  for (let pass = 0; pass < maxPasses; pass++) {
    /** @type {Array<{ map: Record<string, Array<string|number>>, a: string, value: Array<string|number> }>} */
    const reverts = [];
    for (const L of kbLayouts) {
      const map = /** @type {Record<string, string[]>} */ (layoutMap(out, L));
      const defMap = /** @type {Record<string, string[]>} */ (layoutMap(defaults, L));
      const sib = siblingMap(out, L);
      const side = sideOf(L);
      for (const a of actions) {
        if (!map[a]) continue;
        if (codesInvalid(out, map, map[a], sib, side, shared, a)) reverts.push({ map, a, value: defMap[a].slice() });
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
