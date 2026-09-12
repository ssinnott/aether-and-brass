// The one menu control scheme, shared by every screen and plate in the game (GDD 8 "Menu navigation",
// docs/RECONCILIATION.md "Final controls"). Before this module each screen wired its own keys, and the
// two halves of the scheme had drifted into contradicting each other: `start` (ENTER) confirmed on the
// title, board select and OPTIONS but RESUMED on the pause plate, and `jump` confirmed on the title and
// board select but BACKED OUT of every overlay. Pressing ENTER on a highlighted pause row therefore
// closed the plate instead of picking the row.
//
//   CONFIRM  attack (Z / pad A) or start (ENTER / pad START)   picks the highlighted row
//   BACK     Escape, or jump (X / SPACE / pad B) or dodge (C / pad X)   closes the plate
//
// Escape and start both OPEN a pause plate, and every plate opens with its cursor on RESUME, so either
// key still closes a freshly opened one; after a cursor move, ENTER picks the row and Escape resumes.
// A plate with nothing to pick (MOVES, the gallery) treats CONFIRM as "done reading" and closes too, so
// ENTER is never a dead key.
//
// Netplay: Escape is a local keyboard edge, so every overlay that only one peer could pop reads it
// through `escapePressed(inp, online)` and gets `false` while a match is live (docs/MULTIPLAYER.md);
// net/session.js folds Escape into the `start` bit instead, which arrives here as a CONFIRM on the
// party's shared cursor -- the pause plate's own RESUME row while nobody has moved it, and `jump` /
// `dodge` (both in the input mask) stay a deterministic BACK on every row.
import { bindings } from '../engine/input.js';

/** The engine/input.js singleton (screens reach it as `this.game.input`). @typedef {typeof import('../engine/input.js').input} Input */

/**
 * CONFIRM: pick the highlighted row.
 * @param {Input} inp
 * @param {number} player
 * @returns {boolean}
 */
export function confirmPressed(inp, player) { return inp.pressed(player, 'attack') || inp.pressed(player, 'start'); }

/**
 * The per-player half of BACK (pad B / X). Escape is a global key, not a player action: a screen wants
 * `cancelPressed(inp, p) || escapePressed(inp, online)` for the whole of BACK.
 * @param {Input} inp
 * @param {number} player
 * @returns {boolean}
 */
export function cancelPressed(inp, player) { return inp.pressed(player, 'jump') || inp.pressed(player, 'dodge'); }

/**
 * The global half of BACK: the Escape edge, or `false` for an overlay that must not diverge between
 * netplay peers (see the file header).
 * @param {Input} inp
 * @param {boolean} [online]
 * @returns {boolean}
 */
export function escapePressed(inp, online = false) { return !online && inp.globalPressed('pause'); }

/** The keyboard half the local player is on right now: the 1P arcade aliases until P2 joins, P1's own keys after. */
export function menuLayout(inp) { return inp.joined(1) ? 'p1' : 'solo'; }

/**
 * Label of the CONFIRM key on the local keyboard half ('ENTER' by default, whatever `start` is bound to
 * after a remap -- screens never hard-code a key name, ARCHITECTURE.md section 16). Allocation-free
 * (input.keyText is cached), but hints built from it are not: build them in enter() and rebuild them
 * when `input.bindingsVersion` changes, never per frame in draw().
 * @param {Input} inp
 * @returns {string}
 */
export function confirmKey(inp) { return inp.keyText(menuLayout(inp), 'start') || 'ENTER'; }

/** Label of the global BACK key ('ESC'). Global keys are not remappable. @param {Input} inp @returns {string} */
export function backKey(inp) { return inp.keyLabel(bindings.global.pause[0]); }
