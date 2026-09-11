// Small couch-coop helper shared by screens that show join hints, drop-in characters or duplicate-hero
// tints, so no screen re-derives these rules (ARCHITECTURE.md section 3 / 9, issue #23).
import { DUP_TINTS, DUP_TINT_ALPHA } from '../constants.js';

/**
 * Composite "how to join" hint for every free slot: keyboard slots (1) get their own key hint;
 * remaining free pad-only slots (2/3) collapse into one "P3-P4: ANY PAD BUTTON" (or the single-slot
 * form) and are omitted entirely once every pad is already claimed, so a two-pad household never
 * sees an eternal blink for a slot nothing can join. `''` under netplay (drop-in is disabled online).
 * Two parts join on their own line (screens draw '\n' as a line break) rather than one wide string,
 * so neither line runs as long as the old worst-case composite (review major: the single-line form
 * overflowed the pause plate and clipped the title's hero rigs). Allocates -- call only when
 * `input.joinState()` has changed.
 * @param {typeof import('../engine/input.js').input} input
 * @param {boolean} [online]
 * @returns {string}
 */
export function joinHint(input, online = false) {
  if (online) return '';
  const free = input.freeSlots();
  const parts = [];
  // The slot a stray pad press would actually claim right now (lowest free slot with kbSeen false --
  // engine/input.js claimPads()'s own rule), but only if that is one of THESE free slots (P1's own
  // slot 0 is always already joined, so a pad settling there first -- decision 1, "solo pad stays P1"
  // -- says nothing about who's next to join and must not suppress the pad-only hint below). It may
  // be a keyboard slot (P2) that just has not used its own key yet, in which case "P3-P4: ANY PAD
  // BUTTON" would be a lie: the press lands on P2 first, ahead of any pad-only slot (review minor).
  const claim = input.unboundPads > 0 && typeof input.nextPadSlot === 'function' ? input.nextPadSlot() : -1;
  const nextPad = free.includes(claim) ? claim : -1;
  for (const s of free) {
    if (!input.hasKeyboard(s)) continue;
    parts.push(s === nextPad ? input.joinHint(s).replace(' TO JOIN', ' OR ANY PAD BUTTON') : input.joinHint(s));
  }
  const pads = free.filter((s) => !input.hasKeyboard(s));
  if (pads.length && input.unboundPads > 0 && !(nextPad >= 0 && input.hasKeyboard(nextPad))) {
    parts.push(pads.length > 1 ? `P${pads[0] + 1}-P${pads[pads.length - 1] + 1}: ANY PAD BUTTON` : input.joinHint(pads[0]));
  }
  return parts.join(parts.length > 1 ? '\n' : '');
}

/**
 * Which character a drop-in player at `slot` gets: the option's saved pick for that slot if any,
 * else a cycling default so an unconfigured party still gets distinct heroes.
 * @param {{ chars?: Array<number|null> }} options game.options
 * @param {Array<object>} characters
 * @param {number} slot
 * @returns {number}
 */
export function dropInChar(options, characters, slot) {
  const c = options.chars && options.chars[slot];
  return c != null && c >= 0 ? c : slot % Math.max(1, characters.length);
}

/**
 * Bust tint for a duplicate hero: copy k (number of OTHER players already on the same `def`, capped
 * at `DUP_TINTS.length - 1`) wears `DUP_TINTS[k]` at `DUP_TINT_ALPHA`; the first copy (k === 0, tint
 * null) gets no tint.
 * @param {Array<{def: object}|null>} players
 * @param {object} def
 * @param {number} slot
 * @returns {{tint: string, tintAlpha: number}|null}
 */
export function dupTint(players, def, slot) {
  const k = Math.min(DUP_TINTS.length - 1, players.filter((o, i) => o && i !== slot && o.def === def).length);
  return DUP_TINTS[k] ? { tint: DUP_TINTS[k], tintAlpha: DUP_TINT_ALPHA } : null;
}
