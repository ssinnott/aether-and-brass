// Playable character registry (GDD section 2 order). Each entry is pure data + small draw hooks.
import { brunhild } from './brunhild.js';
import { sael } from './sael.js';
import { rook } from './rook.js';
import { pip } from './pip.js';
// Pip's move list / trials (issue #22) live in a sibling file and are attached here rather than imported by
// pip.js, which was already over the ~700-line file cap and must not grow further (review finding).
import { moveList as pipMoveList, trials as pipTrials } from './pipMoves.js';
Object.assign(pip, { moveList: pipMoveList, trials: pipTrials });

/** All playable characters in GDD order: Brunhild, Sael, Rook, Pip. */
export const CHARACTERS = [brunhild, sael, rook, pip];

/** Look up a character by index or id (falls back to the first). */
export function getCharacter(key) {
  if (typeof key === 'number') return CHARACTERS[key] || CHARACTERS[0];
  return CHARACTERS.find((c) => c.id === key) || CHARACTERS[0];
}
