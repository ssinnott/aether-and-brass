// Playable character registry (GDD section 2 order). Each entry is pure data + small draw hooks.
import { brunhild } from './brunhild.js';
import { sael } from './sael.js';
import { rook } from './rook.js';
import { pip } from './pip.js';

/** All playable characters in GDD order: Brunhild, Sael, Rook, Pip. */
export const CHARACTERS = [brunhild, sael, rook, pip];

/** Look up a character by index or id (falls back to the first). */
export function getCharacter(key) {
  if (typeof key === 'number') return CHARACTERS[key] || CHARACTERS[0];
  return CHARACTERS.find((c) => c.id === key) || CHARACTERS[0];
}
