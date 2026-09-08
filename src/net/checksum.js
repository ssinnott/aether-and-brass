// Desync canary for lockstep netcode (docs/MULTIPLAYER.md section 6).
//
// Peers exchange this hash every N frames. It must have ZERO false positives: two correctly
// synchronised peers must never disagree, or the game hands P2 to the bot for no reason.
//
// Two traps, both handled below:
//   -0 and 0 are numerically equal but have different bit patterns, and -0 arises easily from
//     multiplying a velocity by zero. Hashing raw bits would report a desync that is not one.
//   NaN has many bit patterns. Any NaN is normalised to one sentinel.
//
// Entity `id` is deliberately NOT hashed. entity.js assigns ids from a module-level counter that is
// never reset, so a host who played a single-player run before hosting starts from a different base
// than a freshly loaded guest. Their simulations are identical but their ids are not. (Sim logic is
// unaffected: enemy.js:212 only compares ids relatively, which a constant offset preserves. Call
// Entity.resetIds() at session start anyway so the id-parity in fighter.js:615 renders alike.)

const KIND = { player: 1, enemy: 2, boss: 3, projectile: 4, item: 5, prop: 6, fx: 7 };

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/** FNV-1a over a uint32. */
function mix(h, v) {
  h ^= v & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 8) & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 16) & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 24) & 0xff; h = Math.imul(h, 16777619);
  return h >>> 0;
}

/** Hash a number by its exact bits, with -0 and NaN normalised so equal values always hash equally. */
function mixNum(h, n) {
  if (Number.isNaN(n)) return mix(h, 0x7ff80000);
  f64[0] = n === 0 ? 0 : n;                  // n === 0 is true for both 0 and -0
  return mix(mix(h, u32[0]), u32[1]);
}

/**
 * Hash the simulation state of a world. Visual-only state (fx, particles, camera shake) is excluded
 * deliberately: it is allowed to differ between peers and must never trip the canary.
 * @param {object} world
 * @param {object} rng the gameplay rng singleton
 * @returns {number} uint32
 */
export function worldChecksum(world, rng) {
  let h = 2166136261 >>> 0;
  h = mix(h, rng.state >>> 0);               // the highest-signal field: if the RNG streams diverge, everything will
  h = mix(h, world.frame >>> 0);
  h = mix(h, world.entities.length);
  for (const e of world.entities) {
    h = mix(h, KIND[e.kind] || 0);
    h = mixNum(h, e.x); h = mixNum(h, e.y); h = mixNum(h, e.z);
    h = mixNum(h, e.vx); h = mixNum(h, e.vy);
    h = mix(h, (e.facing | 0) & 0xffff);
    h = mix(h, (e.alive ? 1 : 0) | (e.removeMe ? 2 : 0));
    if (e.hp !== undefined) h = mixNum(h, e.hp);
    if (e.state !== undefined) h = mix(h, typeof e.state === 'number' ? e.state : 0);
    if (e.stateTimer !== undefined) h = mix(h, e.stateTimer | 0);
  }
  return h >>> 0;
}
