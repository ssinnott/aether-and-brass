// Thrown weapons and props (issue #21, GDD section 7): a held weapon or throwable prop leaves the hand as a plain
// Projectile built from the weapon/prop's own `throw` spec, flies, hits like any other projectile (`body: true` so
// Brassbound's throwDamageTakenMult applies, fighter.js takeHit), and lands as a pickup (weapon: hits - 1) or
// shatters. This module OWNS the throw / land mechanics; it never imports fighter.js, player.js, grabs.js or
// bot.js (grabs.js imports this module for doThrow's kind branch, not the other way round — a back-import would
// cycle). Holding anything reuses the grab plumbing (game/grabs.js): the thrower enters ST.GRAB with
// grabTarget = null, plays its own forward `throw` anim, and `throwPending` gains `kind: 'weapon' | 'prop'` + `vzDir`.
import { ST, TEAM, THROW, UI, Z_SPEED_FACTOR, GRAB_REACH_BEHIND, GRAB_REACH_AHEAD_EXTRA, GRAB_Z_TOL } from '../constants.js';
import { audio } from '../engine/audio.js';
import { clamp } from '../engine/math.js';
import { burstBreak, floatText } from '../art/fx.js';
import { drawWeaponFloor, FLOOR_ANGLE } from '../art/weapons.js';
import { drawProp } from '../art/props.js';
import { projectileOptsFromSpec } from './projectile.js';
import { WEAPONS } from './weapons.js';
import { WeaponPickup, Prop } from './items.js';

/** Lateral offset (px) a held prop rides in front of the holder along its facing (game/grabs.js updateGrab, via
 *  updateHeldProp) -- smaller than a held ENEMY's def.grabOffset (24-34): props are small clutter, not a body. */
const HOLD_OFFSET = 14;

/**
 * @typedef {object} ThrowSpec per-weapon (or per-prop, step 21.3) throw feel:
 *   { speed, vy, gravity, damage, type, kbX, kbY, hitstun, pierce, maxDist, spin, patch? }
 *   spin is a visual rotation-rate multiplier (drawThrownWeapon); patch (limeRake only) is the lime-patch spec
 *   its landing spot leaves behind (step 21.2).
 */

/**
 * Frame the throw releases the held item on: the just-entered 'throw' anim's own first-frame duration — the same
 * default the existing held-enemy throw uses (grabs.js throwTarget: `mv.releaseAt != null ? mv.releaseAt : 5`).
 * Must be called right after `p.setState(ST.GRAB, 'throw')` while `p.anim.frame` is still frame 0.
 * @param {object} p the thrower
 * @returns {number}
 */
export function releaseAt(p) { return (p.anim.frame && p.anim.frame.dur) || 5; }

/**
 * Start a weapon throw (GDD 7): turn to the pressed direction, enter ST.GRAB (grabTarget stays null) and play the
 * hero's own forward `throw` anim. The weapon actually leaves the hand `releaseAt` frames later, at doThrow
 * (grabs.js), which routes here through `throwHeldItem` because `throwPending.kind` is set.
 * @param {object} p the thrower (Player)
 * @param {{x:number,y:number}} it the pressed direction: left/right turns + throws forward, up/down adds z drift
 * @returns {true} always starts; callers use the return value to short-circuit a swing
 */
export function startWeaponThrow(p, it) {
  if (it.x) p.facing = it.x;
  p.grabTarget = null;
  p.running = false;
  p.setState(ST.GRAB, 'throw');
  p.throwPending = { dir: 1, at: releaseAt(p), mv: null, kind: 'weapon', vzDir: it.y || 0 };
  return true;
}

/** grabs.js doThrow(tp): the `tp.kind` branch. Releases the held weapon or the held prop (issue #21). */
export function throwHeldItem(p, tp) {
  if (tp.kind === 'weapon') {
    const id = p.weaponId, hits = p.weaponHits - 1;
    p.clearWeapon();
    if (p.world) spawnThrownWeapon(p.world, p, id, hits, tp.vzDir);
    return;
  }
  if (tp.kind === 'prop') {
    const prop = p.heldProp;
    p.heldProp = null;
    if (prop && p.world) { prop.holder = null; prop.removeMe = true; spawnThrownProp(p.world, p, prop, tp.vzDir); }
  }
}

/**
 * Spawn a flying pickup weapon: a plain Projectile built from `WEAPONS[id].throw`, landing at `landWeapon` on
 * expiry (life, max distance, a hit that used up its pierce, or the camera/lock edge via `stopAtBounds`).
 * @param {object} world
 * @param {object} owner the thrower (credited with hits)
 * @param {string} id WEAPONS key
 * @param {number} hits durability the weapon lands with (already spent one for this throw)
 * @param {number} vzDir -1/0/1 z drift direction (it.y at release)
 * @returns {object|null} the spawned Projectile
 */
export function spawnThrownWeapon(world, owner, id, hits, vzDir) {
  const def = WEAPONS[id];
  if (!def || !def.throw) return null;
  const { speed, vy, gravity, damage, type, kbX, kbY, hitstun, pierce, maxDist, spin } = def.throw;
  const o = projectileOptsFromSpec({
    speed, angle: 0, gravity, life: THROW.life, maxDist, pierce, r: THROW.weaponR,
    damage, type, kbX, kbY, hitstun, hitSfx: 'hit_heavy', draw: drawThrownWeapon,
  }, owner);
  o.vy = vy;
  o.vz = vzDir * THROW.vz;
  o.hit.body = true;
  o.onExpire = (w, proj) => landWeapon(w, proj);
  o.stopAtBounds = true;
  const proj = world.spawnProjectile(o);
  proj.thrownWeapon = id;
  proj.weaponHits = hits;
  proj.spinRate = spin;
  proj.lost = false;
  return proj;
}

/**
 * onExpire hook (spawnThrownWeapon): the weapon settles as a fresh WeaponPickup with its post-throw durability, or
 * shatters if that reached zero. `proj.lost` (set by hazards.js's open-rails edge loss, step 21.2) skips both --
 * lost cargo neither lands nor breaks, it is just gone. A weapon whose `throw` spec carries a `patch` (limerake)
 * leaves a lime patch at the landing spot regardless of which of those two outcomes happened.
 */
export function landWeapon(world, proj) {
  if (proj.lost) return;
  if (proj.weaponHits > 0) world.add(new WeaponPickup(proj.thrownWeapon, proj.x, proj.z, { hits: proj.weaponHits, pop: false }));
  else shatterWeapon(world, proj.x, proj.y, proj.z, proj.thrownWeapon);
  const def = WEAPONS[proj.thrownWeapon];
  if (def && def.throw && def.throw.patch) spawnLimePatch(world, proj.owner, proj.x, proj.z, def.throw.patch);
}

/**
 * Lime patch (limerake only, GDD 7 / decision 10): the lime rake's landing spot leaves a `puddle` Projectile with
 * no direct hit (`hit: null`, `style: 'fire'` so it draws with zero shadow like every other fire-styled puddle) --
 * its `onTick` hook slows anyone standing in it instead of damaging them (`limeTick`).
 * @param {object} world
 * @param {object} owner credited as the slow's source (thrower)
 * @param {number} x
 * @param {number} z
 * @param {{life:number, r:number, mult:number, frames:number}} patch
 * @returns {object} the spawned Projectile
 */
export function spawnLimePatch(world, owner, x, z, patch) {
  const proj = world.spawnProjectile({
    owner, team: TEAM.NONE, kind: 'puddle', style: 'fire', color: '#D8FF6E', hit: null,
    every: 20, r: patch.r, life: patch.life, x, y: 0, z,
    onTick: (w, p) => limeTick(w, p, patch, owner), draw: drawLimePatch,
  });
  proj.limePatch = true;
  return proj;
}

/**
 * onTick hook (updatePuddle): slow every fighter standing in the patch by `patch.mult`. The pre-slow `walkSpeed`
 * is saved into the status record (never re-derived from `def.walkSpeed || 1.8`, which could already be wrong once
 * something else has touched walkSpeed) so `onEnd` restores it exactly, and re-entering the patch while already
 * `limed` reuses the SAME saved value instead of saving an already-slowed speed.
 *
 * Overlapping with the Chandler 'dosed' buff (content/enemies/chandler.js), which does the same absolute
 * save/restore on the SAME field, is handled two ways: `onEnd` only restores if walkSpeed still holds the exact
 * value THIS status set it to (a status that ended later never stomps a value some other status has since
 * changed), and if 'dosed' is already active when the patch first applies, the saved baseline is 'dosed's own
 * true pre-buff value (`f.status.dosed.pw`) rather than the current (already-boosted) walkSpeed -- otherwise the
 * two statuses would each save the other's temporary value as their own "true" baseline and the fighter would be
 * left permanently mis-sped once both wear off.
 */
function limeTick(world, proj, patch, owner) {
  for (const f of world.fighters) {
    if (!f.alive || f.dead || Math.abs(f.x - proj.x) > proj.r || Math.abs(f.z - proj.z) > proj.r) continue;
    const savedWalk = f.status.limed ? f.status.limed.savedWalk : (f.status.dosed ? f.status.dosed.pw : f.walkSpeed);
    const slowed = savedWalk * patch.mult;
    f.applyStatus('limed', {
      frames: patch.frames, tint: '#D8FF6E', tintAlpha: 0.2, savedWalk, slowed,
      onEnd: (ff, st) => { if (ff.walkSpeed === st.slowed) ff.walkSpeed = st.savedWalk; },
    }, owner);
    f.walkSpeed = slowed;
  }
}

/** Custom Projectile draw (lime patch): an outlined flat ellipse of lime residue on the floor. */
export function drawLimePatch(ctx, proj, sx, sy) {
  ctx.globalAlpha = 0.4; ctx.fillStyle = proj.color;
  ctx.beginPath(); ctx.ellipse(sx, sy, proj.r, proj.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = '#7a9a30'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(sx, sy, proj.r, proj.r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
}

/** The weapon shatters on landing: burst debris, a heavy spark and BROKEN! (mirrors Player.breakWeapon). */
export function shatterWeapon(world, x, y, z, id) {
  const w = WEAPONS[id];
  if (!w) return;
  burstBreak(x, y, z, w.color, 8);
  world.addFx('spark', x, y, z, { type: 'heavy' });
  floatText(x, y + 20, z, 'BROKEN!', UI.red, 1);
  audio.play('prop_break');
}

/** Custom Projectile draw: the weapon's own hand-space renderer lying flat, spinning at its own `spin` rate. */
export function drawThrownWeapon(ctx, proj, sx, sy) {
  const w = WEAPONS[proj.thrownWeapon];
  if (!w) return;
  drawWeaponFloor(ctx, sx, sy, w.rig, FLOOR_ANGLE + proj.spin * (proj.spinRate || 0));
}

// ==================================================================== Throwable props (step 21.3, GDD 7) ====================================================================
// A held prop stays a live `Prop` entity (game/items.js) the whole hold: liftProp puts it in state 'held' and
// enters the holder's ST.GRAB (grabTarget stays null, mirrors startWeaponThrow); updateHeldProp positions it every
// frame from the holder's own updateGrab (game/grabs.js), so there is no one-frame lag. Throwing it removes that
// Prop entity outright (spawnThrownProp) and flies a plain Projectile instead, exactly like a thrown weapon; landing
// (landProp) re-adds a FRESH Prop at the landing spot and immediately calls Prop.break on it -- a thrown bottle or
// lamp always shatters, whether or not it hit anything, because unlike a weapon it has no durability to spend.

/**
 * Nearest liftable prop in front of `p` (issue #21 decisions 4-5): idle, not already held, `throwable` (the stage
 * row) AND carrying a `throw` spec (Prop's own constructor already ANDs those two into `throwable`). Reach mirrors
 * Player.findGrabTarget's own check exactly, sharing its GRAB_REACH_* constants (constants.js) rather than
 * re-typing the same window so a future grab-range tweak can never silently drift from the lift range.
 * @param {object} p the would-be lifter (Player)
 * @param {object} world
 * @returns {object|null}
 */
export function findLiftProp(p, world) {
  let best = null, bestD = Infinity;
  for (const e of world.entities) {
    if (e.kind !== 'prop' || !e.throwable || e.state !== 'idle' || e.holder) continue;
    const dx = (e.x - p.x) * p.facing, dz = Math.abs(e.z - p.z);
    // p.traits.grabReach (traits.js default 20), not p.grabReach: that getter exists only on Player, so an Enemy
    // (?enemythrow=1) read undefined here and lifted a prop from any distance (review findings 3/8).
    if (dx < -GRAB_REACH_BEHIND || dx > p.traits.grabReach + GRAB_REACH_AHEAD_EXTRA || dz > GRAB_Z_TOL) continue;
    if (dx < bestD) { bestD = dx; best = e; }
  }
  return best;
}

/**
 * Lift `prop`: reuses ST.GRAB (grabTarget stays null) so grabs.js's updateGrab positions it every frame via
 * updateHeldProp, and player.js's thinkGrab routes movement + the throw through thinkHeld while it is set.
 * @param {object} p the lifter (Player)
 * @param {object} prop an idle, throwable Prop
 * @returns {true} always succeeds
 */
export function liftProp(p, prop) {
  p.heldProp = prop; prop.holder = p; prop.state = 'held';
  p.grabTarget = null; p.running = false;
  p.setState(ST.GRAB, 'idle', { restart: false });
  return true;
}

/**
 * Start throwing the held prop (player.js thinkHeld): turn to the pressed direction (left/right) or add z drift
 * (up/down) exactly like startWeaponThrow, playing the SAME forward `throw` anim -- a prop has no swing, so ANY
 * attack press while holding one throws it (GDD 7 decision 3), not only a directional one.
 * @param {object} p the thrower (Player)
 * @param {{x:number,y:number}} it the pressed direction
 * @returns {true} always starts
 */
export function startPropThrow(p, it) {
  if (it.x) p.facing = it.x;
  p.running = false;
  p.setState(ST.GRAB, 'throw');
  p.throwPending = { dir: 1, at: releaseAt(p), mv: null, kind: 'prop', vzDir: it.y || 0 };
  return true;
}

/**
 * Position a held prop: lifted THROW.holdLift px off the floor, HOLD_OFFSET px in front of the holder along its
 * facing. Called from the HOLDER's own updateGrab (grabs.js) AND again from player.js thinkHeld after it moves --
 * updateGrab runs before think() (Fighter.update), so the first call alone would draw the prop one frame behind a
 * moving holder (issue #21 decision 6: no one-frame lag). Idempotent, so calling it twice a frame is harmless.
 * @param {object} p the holder (Player); no-op once heldProp is cleared or no longer points back at this holder.
 */
export function updateHeldProp(p) {
  const prop = p.heldProp;
  if (!prop || prop.holder !== p) return;
  prop.x = p.x + p.facing * HOLD_OFFSET; prop.z = p.z; prop.y = THROW.holdLift; prop.facing = p.facing;
}

/**
 * Let go of a held prop WITHOUT throwing it (a hit mid-hold, GDD 7 decision 14): it drops to the floor exactly
 * where it was being carried, idle and liftable again.
 * @param {object} p the (former) holder
 */
export function dropHeldProp(p) {
  const prop = p.heldProp;
  if (!prop) return;
  p.heldProp = null;
  prop.holder = null; prop.state = 'idle'; prop.y = 0;
}

/**
 * Throw the held prop: a plain Projectile built from PROP_TYPES[type].throw (the SAME shape as a weapon's throw
 * spec), landing at `landProp` on expiry. The original Prop entity is already gone by the time this runs
 * (throwHeldItem marks it removeMe first) -- `prop` is kept only as a data source (type, w/h, drops) for the
 * flying draw and the fresh Prop landProp re-adds.
 * @param {object} world
 * @param {object} owner the thrower (credited with hits, and with breaking the prop on landing)
 * @param {object} prop the (already-removed) Prop instance that was thrown
 * @param {number} vzDir -1/0/1 z drift direction (it.y at release)
 * @returns {object|null} the spawned Projectile
 */
export function spawnThrownProp(world, owner, prop, vzDir) {
  const spec = prop.info.throw;
  if (!spec) return null;
  const { speed, vy, gravity, damage, type, kbX, kbY, hitstun, pierce, maxDist, spin } = spec;
  const o = projectileOptsFromSpec({
    speed, angle: 0, gravity, life: THROW.life, maxDist, pierce, r: Math.max(prop.w, prop.h) / 2,
    damage, type, kbX, kbY, hitstun, hitSfx: 'hit_light', draw: drawThrownProp,
  }, owner);
  o.vy = vy;
  o.vz = vzDir * THROW.vz;
  o.hit.body = true;
  o.onExpire = (w, proj) => landProp(w, proj);
  o.stopAtBounds = true;
  const proj = world.spawnProjectile(o);
  proj.thrownProp = prop;
  proj.spinRate = spin;
  proj.lost = false;
  return proj;
}

/**
 * onExpire hook (spawnThrownProp): re-add a fresh Prop at the landing spot and break it immediately -- a thrown
 * prop always shatters (Prop.break: debris, drops, score), whether it connected on the way or just ran out of
 * flight. `proj.lost` (hazards.js open-rails edge loss) skips this entirely: lost cargo is just gone, same as a
 * lost thrown weapon (landWeapon).
 */
export function landProp(world, proj) {
  if (proj.lost) return;
  const src = proj.thrownProp;
  if (!src) return;
  const prop = new Prop(src.type, proj.x, proj.z, { drops: src.drops, hp: src.maxHp });
  world.add(prop);
  prop.break(proj.owner);
}

/** Custom Projectile draw: the prop's own floor renderer, spun around its own vertical centre in this draw
 *  closure (never by writing `prop.angle` -- bottle/lamp renderers do not honour it, GDD 7 decision 7). */
export function drawThrownProp(ctx, proj, sx, sy) {
  const prop = proj.thrownProp;
  if (!prop) return;
  const frame = proj.world ? proj.world.frame : 0;
  const midY = sy - prop.h / 2;
  ctx.save();
  ctx.translate(sx, midY); ctx.rotate(proj.spin * (proj.spinRate || 0)); ctx.translate(-sx, -midY);
  drawProp(ctx, sx, sy, prop, frame);
  ctx.restore();
}

// ============================================ Enemy prop throw (step 21.6, optional stretch) ============================================
// Scrap Slinger and Soot Cutthroat only, dev-only behind `?enemythrow=1` (world.options.enemyThrow, main.js
// parseOptions), forced off in netplay (the START packet does not carry the flag, so a peer without it would
// desync -- checked here rather than in enemy.js so the whole feature stays a no-op call from a single hook).
// Reuses the SAME lift/hold/throw plumbing a player uses (findLiftProp/liftProp/startPropThrow/dropHeldProp all
// take a generic fighter-shaped `p`); neither variant has a `throw` anim, so `startPropThrow`'s `setState` falls
// back to 'idle' (animation.js `play`'s own default fallback) -- an accepted idle-pose stand-in (decision 16).

/** The only enemy variants (content/enemies/sootborn.js) eligible for this stretch. */
const ENEMY_PROP_VARIANTS = new Set(['cutthroat', 'slinger']);
/** Frames before an enemy that just lifted-then-threw (or gave up on) a prop may try again. Local to this stretch
 *  feature rather than THROW (constants.js): no other code reads it. */
const ENEMY_PROP_COOLDOWN = 240;

/**
 * Called once per think() from Enemy's AI loop while it has a target (issue #21 step 21.6): lifts a nearby
 * throwable prop exactly like a player would, spending an attack token so the attempt competes with the enemy's
 * own melee attacks instead of being free. A no-op whenever the dev flag is off, in netplay, while already holding
 * something, on cooldown, or for any variant other than Scrap Slinger / Soot Cutthroat.
 * @param {object} e the enemy (Enemy extends Fighter)
 * @param {object} world
 * @returns {boolean} true if a prop was lifted this frame (the caller returns early, skipping the rest of its AI)
 */
export function tryEnemyPropThrow(e, world) {
  if (!world.options.enemyThrow || (world.game && world.game.net && world.game.net.active)) return false;
  if (e.heldProp || e.propThrowCooldown > 0 || !ENEMY_PROP_VARIANTS.has(e.def.variant)) return false;
  const prop = findLiftProp(e, world);
  if (!prop || !e.acquireToken(world)) return false;
  liftProp(e, prop);
  return true;
}

/**
 * While holding a lifted prop (Enemy.thinkGrab): close on the current target and throw once in range, mirroring
 * player.js's thinkHeld but driven by the AI's own target/facing instead of a pressed direction.
 * @param {object} e the holder (Enemy)
 * @param {object} world
 */
export function thinkEnemyHeld(e, world) {
  if (e.throwPending) return;
  const t = e.target;
  if (!t || !t.alive || t.dead || t.removeMe || t.out) {
    dropHeldProp(e); e.releaseToken(world); e.propThrowCooldown = ENEMY_PROP_COOLDOWN;
    return;
  }
  e.face(t);
  if (Math.abs(t.x - e.x) <= THROW.botRange) {
    e.releaseToken(world); e.propThrowCooldown = ENEMY_PROP_COOLDOWN;
    startPropThrow(e, { x: e.facing, y: 0 });
    return;
  }
  // NOT e.moveToward: it writes this.state = WALK/RUN directly (enemy.js), which would knock the holder straight
  // out of ST.GRAB -- the next think() would then miss thinkGrab/thinkEnemyHeld entirely (enemy.js only routes
  // there while state === ST.GRAB) and leave the prop stuck in 'held' forever (issue #21 review finding 2).
  // Mirrors player.js thinkHeld's own manual walk instead.
  const spd = e.walkSpeed * THROW.holdWalk;
  const zb = world.zBounds(e);
  e.x += clamp(t.x - e.x, -spd, spd);
  e.z = clamp(e.z + clamp(t.z - e.z, -spd, spd) * Z_SPEED_FACTOR, zb.z0, zb.z1);
  if (e.anim.name !== 'walk') e.play('walk', { restart: false });
  updateHeldProp(e);
}
