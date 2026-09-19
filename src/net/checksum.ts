// Desync canary for lockstep netcode (docs/MULTIPLAYER.md section 6). The hashing kernel (FNV-1a, the -0 and NaN
// rules, the type tags) is the library's, src/lib/net/checksum.ts; the walk over the world below is this game's.
//
// Peers exchange this hash every N frames. It must have ZERO false positives: two correctly
// synchronised peers must never disagree, or the game hands P2 to the bot for no reason.
//
// Entity `id` is deliberately NOT hashed. entity.js assigns ids from a module-level counter that is
// never reset, so a host who played a single-player run before hosting starts from a different base
// than a freshly loaded guest. Their simulations are identical but their ids are not. (Sim logic is
// unaffected: enemy.js:212 only compares ids relatively, which a constant offset preserves. Call
// Entity.resetIds() at session start anyway so the id-parity in fighter.js:615 renders alike.)

// Only simulation kinds. 'fx' is deliberately absent: SceneLayer (transitions.js) is a bare draw
// function pushed into world.entities, so hashing it would report desyncs that are purely visual.
const KIND = { player: 1, enemy: 2, boss: 3, projectile: 4, item: 5, prop: 6 };

import { FNV_OFFSET, mix, mixNum, mixAny } from '../lib/net/checksum.ts';

/**
 * Hash the simulation state of a world. Visual-only state (fx, particles, camera shake) is excluded
 * deliberately: it is allowed to differ between peers and must never trip the canary.
 * @param {object} world
 * @param {object} rng the gameplay rng singleton
 * @returns {number} uint32
 */
export function worldChecksum(world, rng) {
  let h = FNV_OFFSET;
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
    h = mixAny(h, e.weaponId); h = mixAny(h, e.weaponHits); h = mixAny(h, e.grace);   // held / dropped pickup weapons (game/weapons.js): the overlay swaps the whole ground combo
    // Thrown weapons / props (issue #21): a held prop / holder / lost-over-an-edge flag / liftable prop / thrown-hit
    // note packed into one bitfield (same pattern as the alive/removeMe bitfield above), plus the string/id fields a
    // bitfield cannot carry -- a divergence in any of these swaps a whole player's held-item state, a projectile's
    // landing outcome, or (lastHitWasThrow) the x1.5 throw-kill score bonus (player.js onKill).
    h = mix(h, (e.heldProp ? 1 : 0) | (e.holder ? 2 : 0) | (e.lost ? 4 : 0) | (e.throwable ? 8 : 0) | (e.lastHitWasThrow ? 16 : 0));
    h = mixAny(h, e.throwPending && e.throwPending.kind); h = mixAny(h, e.thrownWeapon); h = mixAny(h, e.thrownProp);
    h = mixAny(h, e.propThrowCooldown); // enemy prop-throw cooldown (issue #21 step 21.6, dev-only ?enemythrow=1)
    // Wave entrances (issue #30, game/entrances.js): the arrival's own frame counter, plus the two AI fields that
    // decide where a spawned unit may stand at all. `arriveT` drives the whole scripted path and `entered` picks
    // which interval World.boundsFor clamps to, so both diverge a frame before x/y/z would; `aiState` is a plain
    // sim string (mixAny handles strings) and catches a state-machine split the positions would only hint at.
    h = mixAny(h, e.arriveT);
    h = mixAny(h, e.aiState); h = mix(h, e.entered === false ? 1 : 2);
    if (e.anim) { h = mix(h, e.anim.instance | 0); h = mix(h, e.anim.frameIndex | 0); h = mixNum(h, e.anim.frameTime); }
  }
  h = mix(h, n);                             // count of hashed entities, not entities.length
  return h >>> 0;
}
