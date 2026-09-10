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

// Only simulation kinds. 'fx' is deliberately absent: SceneLayer (transitions.js) is a bare draw
// function pushed into world.entities, so hashing it would report desyncs that are purely visual.
const KIND = { player: 1, enemy: 2, boss: 3, projectile: 4, item: 5, prop: 6 };

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

/** Hash a string, length-prefixed so 'AB','C' cannot collide with 'A','BC'. */
function mixStr(h, s) {
  h = mix(h, s.length);
  for (let i = 0; i < s.length; i++) h = mix(h, s.charCodeAt(i));
  return h;
}

/**
 * Hash any simulation field. State machines here are STRINGS (ST.IDLE === 'IDLE', constants.js:36),
 * so a number-only path would silently hash a constant and make the whole fighter state machine
 * invisible to the canary.
 */
function mixAny(h, v) {
  if (v === undefined || v === null) return mix(h, 0);
  if (typeof v === 'number') return mixNum(h, v);
  if (typeof v === 'string') return mixStr(h, v);
  if (typeof v === 'boolean') return mix(h, v ? 1 : 2);
  return mix(h, 3);
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
  // rng.state is the highest-signal field. mulberry32 advances by a fixed constant per draw
  // (rng.js:11), so it is effectively a call counter: if the two peers ever take a different branch
  // that consumes randomness, this diverges immediately, one frame before positions do.
  h = mix(h, rng.state >>> 0);
  h = mix(h, world.frame >>> 0);
  h = mix(h, world.freeze | 0);              // both early-return the entire world update, so a
  h = mix(h, world.cutsceneTimer | 0);       // divergence here silently stops one peer simulating
  let n = 0;
  for (const e of world.entities) {
    const kind = KIND[e.kind];
    if (kind === undefined) continue;        // visual-only entity (SceneLayer): never hash it
    n++;
    h = mix(h, kind);                        // makes the stream self-describing: a type swap is caught
    h = mixNum(h, e.x); h = mixNum(h, e.y); h = mixNum(h, e.z);
    h = mixNum(h, e.vx); h = mixNum(h, e.vy); h = mixNum(h, e.vz);
    h = mix(h, (e.facing | 0) & 0xffff);
    h = mix(h, (e.alive ? 1 : 0) | (e.removeMe ? 2 : 0));
    // These diverge one to several frames before x/y/z do, so they catch a desync earlier.
    h = mixAny(h, e.hp); h = mixAny(h, e.state); h = mixAny(h, e.stateTimer);
    h = mixAny(h, e.hitstop); h = mixAny(h, e.invuln); h = mixAny(h, e.life); h = mixAny(h, e.meter);
    h = mixAny(h, e.shield); h = mixAny(h, e.shieldTimer);   // the shield (game/shield.js) drains and refills a hit before hp does
    if (e.anim) { h = mix(h, e.anim.instance | 0); h = mix(h, e.anim.frameIndex | 0); h = mixNum(h, e.anim.frameTime); }
  }
  h = mix(h, n);                             // count of hashed entities, not entities.length
  return h >>> 0;
}
