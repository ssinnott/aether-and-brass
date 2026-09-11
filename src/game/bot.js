// Autopilot for players (?bot=1, ARCHITECTURE.md section 15): walk toward the nearest enemy (align z), attack in range,
// occasional jump attack / special / super / dodge, forward-throw held enemies, walk (run) right when no enemies remain.
//
// The autopilot has named STYLES (?botstyle=NAME, one per slot: `aggressive,defensive`). `balanced` is the default and
// is the behaviour every scenario in tools/playtest.js was written against; the others exist so tools/winrate.js can
// sweep a board against more than one kind of player before anyone calls it tuned.
import { ST, METER, THROW, TEAM } from '../constants.js';
import { rng } from '../engine/rng.js';
import { laneAroundHazards, solidBetween } from './hazards.js';
import { WEAPONS, nearestWeaponPickup, WEAPON_SEEK_DIST, WEAPON_SEEK_SAFE_X, WEAPON_SEEK_SAFE_Z } from './weapons.js';

const Z_TOL = 14, RUN_DIST = 170, STOP_RUN_DIST = 110;
/** Issue #31: how far ahead the autopilot looks for a solid obstacle, and how close it lets one get before jumping. */
const SOLID_LOOKAHEAD = 120, SOLID_JUMP_AT = 44;

/**
 * Autopilot styles. Each is a whole player archetype, not a difficulty knob:
 * - `attackEvery`   frames between attack presses in range (lower = faster buttons)
 * - `dodgeChance`   chance per eligible frame to dodge an incoming hitbox (0 = never dodges)
 * - `specialChance` chance to spend a full special meter when it is up
 * - `superEvery`    frames between super attempts once the meter allows it
 * - `jumpChance`    chance to throw the periodic jump-in
 * - `spacing`       extra px of reach kept before committing (positive = fights at range)
 * - `retreatHp`     fraction of max HP below which it backs off to heal/space (0 = never retreats)
 * - `throwChance`   chance per eligible frame to hurl a held weapon at a target out of swinging reach (issue #21;
 *                    0 = never throws, so aggressive keeps closing distance instead of spending its weapon at range)
 */
export const BOT_STYLES = {
  // the original autopilot, unchanged: trades freely, dodges when something is coming
  balanced: { attackEvery: 8, dodgeChance: 0.3, specialChance: 0.5, superEvery: 20, jumpChance: 0.5, spacing: 0, retreatHp: 0, throwChance: 0.4 },
  // buttons down, never blocks: the ceiling on how fast a board can be cleared and the floor on how much it costs
  aggressive: { attackEvery: 5, dodgeChance: 0, specialChance: 0.9, superEvery: 12, jumpChance: 0.8, spacing: -6, retreatHp: 0, throwChance: 0 },
  // fights at the tip of its reach, dodges hard, backs off when hurt: a cautious player
  defensive: { attackEvery: 12, dodgeChance: 0.65, specialChance: 0.35, superEvery: 40, jumpChance: 0.15, spacing: 10, retreatHp: 0.35, throwChance: 0.9 },
  // no spacing, no patience, mashes one button: a first-time player on a keyboard
  masher: { attackEvery: 3, dodgeChance: 0.05, specialChance: 0.15, superEvery: 90, jumpChance: 0.35, spacing: -10, retreatHp: 0, throwChance: 0.2 },
};
export const DEFAULT_BOT_STYLE = 'balanced';
/** @returns {typeof BOT_STYLES.balanced} the named style, falling back to `balanced`. */
export function botStyle(name) { return BOT_STYLES[name] || BOT_STYLES[DEFAULT_BOT_STYLE]; }

// A dodge is invulnerable, so a bot that re-presses it every eligible frame can stand in a crowd forever: it never
// takes a hit and never throws one, and a locked wave then never clears (a real soft-lock, not a loss). Every style
// therefore gets a hard ceiling on how much of any window it may spend dodging.
const DODGE_WINDOW = 90, DODGE_BUDGET = 6;
// `retreatHp` styles back off for RETREAT_FRAMES out of every RETREAT_CYCLE, then commit again.
const RETREAT_CYCLE = 240, RETREAT_FRAMES = 120;

/** Pick the most attackable enemy: standing targets first, then knocked-down ones; never ones fleeing off-screen. */
function pickTarget(p, world) {
  let best = null, bestD = Infinity;
  for (const e of world.enemies) {
    if (!e.alive || e.dead || e.removeMe || e.fleeOff) continue;
    let d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z) * 1.5;
    if (e.state === ST.LYING || e.state === ST.DEAD) d += 400;
    if (e.state === ST.KNOCKDOWN || e.state === ST.THROWN) d += 120;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** True while `p` may still spend a dodge in the current window (see DODGE_BUDGET). */
function dodgeAllowed(p, world) {
  const f = world.frame;
  if (p.botDodgeWindow === undefined || f - p.botDodgeWindow >= DODGE_WINDOW) { p.botDodgeWindow = f; p.botDodgeSpent = 0; }
  return p.botDodgeSpent < DODGE_BUDGET;
}

/**
 * Compute a synthetic intent for `p` (same shape as Player.readIntent produces). Fields are edge-style (true = pressed this frame).
 * @param {object} p player
 * @param {object} world
 * @param {string} [style] key into BOT_STYLES; defaults to `balanced`
 * @returns {{x:number, y:number, attack:boolean, jump:boolean, special:boolean, super:boolean, dodge:boolean, taunt:boolean, run:boolean, start:boolean}}
 */
export function botIntent(p, world, style) {
  const s = botStyle(style || p.botStyle);
  const it = { x: 0, y: 0, attack: false, jump: false, special: false, super: false, dodge: false, taunt: false, run: false, start: false };
  const f = world.frame + (p.index || 0) * 3;
  if (p.state === ST.LYING || p.state === ST.GETUP || p.state === ST.HURT) { if (f % 5 === 0) it.jump = true; return it; }
  if (p.state === ST.GRAB) { if (f % 10 === 0) { it.attack = true; it.x = p.facing; } return it; }
  if (p.state === ST.GRABBED) { if (f % 3 === 0) it.attack = true; return it; }
  // netted (Gutter Wrangler, Riggerman): a human mashes attack to tear out of it (player.js -> status.mashNet)
  if (p.status && p.status.netted) { if (f % 3 === 0) it.attack = true; return it; }
  // a netted partner within reach: a teammate's swing cuts them free (fighter.js takeHit), so walk over and cut
  const mate = nettedMate(p, world);
  if (mate) {
    const mx = mate.x - p.x, mz = mate.z - p.z;
    if (Math.abs(mx) > 34) it.x = Math.sign(mx); else if (Math.sign(mx) && Math.sign(mx) !== p.facing) it.x = Math.sign(mx);
    if (Math.abs(mz) > 8) it.y = Math.sign(mz);
    if (Math.abs(mx) <= 44 && Math.abs(mz) <= 12 && f % 6 === 0) it.attack = true;
    return it;
  }
  // issue #31: a barricade holding the wave lock open outranks everything — nothing else the autopilot could be
  // doing will ever clear the section, so walk onto it, align z with the prop, and hit it down.
  const bar = barricadeTarget(p, world);
  if (bar && p.actionable) {
    const bx = bar.x - p.x, bz = bar.z - p.z;
    if (Math.abs(bx) > 26) it.x = Math.sign(bx); else if (Math.sign(bx) && Math.sign(bx) !== p.facing) it.x = Math.sign(bx);
    if (Math.abs(bz) > 8) it.y = Math.sign(bz);
    if (Math.abs(bx) <= 40 && Math.abs(bz) <= 14 && f % 8 === 0) it.attack = true;
    return it;
  }
  const e = pickTarget(p, world);
  // weapon pickups (game/weapons.js): walk over one nearby while unarmed and nothing is close enough to punish it
  if (!p.weaponId && p.pickUpWeapon && !p.airborne) {
    const wp = nearestWeaponPickup(world, p.x, p.z, WEAPON_SEEK_DIST);
    const threatened = !!e && Math.abs(e.x - p.x) < WEAPON_SEEK_SAFE_X && Math.abs(e.z - p.z) < WEAPON_SEEK_SAFE_Z;
    if (wp && !threatened) {
      it.x = wp.x > p.x + 4 ? 1 : wp.x < p.x - 4 ? -1 : 0;
      it.y = wp.z > p.z + 4 ? 1 : wp.z < p.z - 4 ? -1 : 0;
      if (it.x || it.y) return it;
    }
  }
  if (!e) {
    it.x = 1;
    // a human steps round a live hazard; the autopilot has to be told to (walking into the dock's cargo
    // hook at its own z is a knockdown every pass, which stalls the walk to the next wave)
    const band = world.floorBand;
    const lane = laneAroundHazards(world, p.x, p.x + 120, p.z, band.z0, band.z1);
    if (Math.abs(lane - p.z) > 4) it.y = lane > p.z ? 1 : -1;
    // issue #31: an obstacle with no lane round it has to be jumped, or the walk to the next wave grinds into it and
    // the run never finishes (a soft-lock in the winrate sweep, not a loss). The lane step above already handles
    // anything side-steppable; this only fires for an obstacle that takes the whole band.
    if (jumpsSolid(p, world, lane)) { it.jump = true; it.run = true; return it; }
    if (!world.camera.locked && f % 90 < 80) it.run = true;
    else if (p.running) it.x = 0;
    return it;
  }
  const dx = e.x - p.x, dz = e.z - p.z, adx = Math.abs(dx);
  const gap = adx - (e.w || 28) / 2;               // distance to the target's hurtbox edge
  const reach = (p.weaponId && WEAPONS[p.weaponId] ? WEAPONS[p.weaponId].reach : (p.def.reach || 40)) + 8 + s.spacing;
  const dir = dx > 0 ? 1 : -1;
  if (Math.abs(dz) > 10) it.y = dz > 0 ? 1 : -1;
  // A bot's ONLY intentional weapon throw (issue #21 step 21.4): hurl a held weapon at a target that is out of
  // swinging reach but still within THROW.botRange, roughly every 20 frames per style's throwChance. This must
  // run before the retreat check below (a defensive bot backing off should still get to throw first) and the
  // in-range branch further down must never itself set it.attack alongside a turn / z-align while armed (see the
  // weaponId guard there) or it would throw by accident.
  if (p.weaponId && s.throwChance > 0 && gap > reach + 20 && gap < THROW.botRange && Math.abs(dz) <= Z_TOL && f % 20 < 2) {
    // Still running from an earlier approach (e.g. the target was out of THROW.botRange until just now): a throw
    // pressed while running dash-attacks instead (player.js thinkGround checks `running` before startWeaponThrow),
    // so drop out of the run first and let the throw roll happen the following frame instead (review finding 4).
    // The rng call stays out of this branch so an already-running bot does not spend an extra roll doing so.
    if (p.running) { it.x = 0; return it; }
    if (rng.chance(s.throwChance)) { it.x = dir; it.attack = true; return it; }
  }
  // hurt and cautious: give ground rather than trade, so the style actually reads as defensive. The retreat is
  // time-boxed — a wave that will not chase (a locked arena) must not turn into a standoff neither side can end.
  const hurt = s.retreatHp > 0 && p.hp > 0 && p.hp < (p.maxHp || 200) * s.retreatHp;
  if (hurt && gap < RUN_DIST && f % RETREAT_CYCLE < RETREAT_FRAMES && f % 3 !== 0) { it.x = -dir; return it; }
  if (gap > reach - 6) {
    it.x = dir;
    if (gap > RUN_DIST) it.run = true;
    else if (p.running && gap < STOP_RUN_DIST && f % 2 === 0) it.x = 0; // drop out of the run so the approach ends in a combo, not a dash attack
  } else {
    const turning = dir !== p.facing;
    if (turning) it.x = dir;
    // A held weapon throws on ANY direction pressed with attack (game/player.js startWeaponThrow), so an armed
    // bot must never combine a turn or a z-align step with an attack press here: without this it would hurl its
    // weapon away every time the target closed in from behind or off its z-band, in every style.
    if (Math.abs(dz) <= Z_TOL && !(p.weaponId && (turning || it.y))) {
      if (p.meter >= METER.super && f % s.superEvery === 0) it.super = true;
      else if (p.meter >= METER.special && f % 60 === 0 && rng.chance(s.specialChance)) it.special = true;
      else if (f % s.attackEvery === 0) it.attack = true;
    }
  }
  if (p.state === ST.JUMP && f % 4 === 0) it.attack = true;
  if (f % 300 === 150 && adx < 110 && Math.abs(dz) <= Z_TOL && rng.chance(s.jumpChance)) it.jump = true;
  // Something is coming: a live hitbox on the target, a GRAB wind-up (the Hulk, the Resurrection Man, the Grapnel Mate,
  // the Drayman, the Riggerman - a grab is the one hit a human never trades into), or an enemy projectile closing on
  // this lane (a reel line, a net, a harpoon). Every style dodges at its own rate; only the dodge budget is shared.
  const grabbing = !!(e.anim && (e.anim.name === 'grabTell' || e.pendingAttack === 'grab')) && adx < 90 && Math.abs(dz) < 24;
  const threat = (e.hitboxes && e.hitboxes().length && adx < 70 && Math.abs(dz) < 20) || grabbing || incomingShot(p, world);
  if (s.dodgeChance > 0 && threat && f % 3 === 0 && rng.chance(s.dodgeChance) && dodgeAllowed(p, world)) { it.dodge = true; p.botDodgeSpent++; }
  // a cautious player who is not going to dodge a grab still steps out of its reach
  else if (grabbing && s.spacing > 0 && f % 2 === 0) { it.x = -dir; it.attack = false; }
  return it;
}

/**
 * A barricade (issue #31) still standing inside the camera lock, or null. This is a SOFT-LOCK GUARD, not a nicety:
 * `StageRunner.barricadeHolding` refuses to clear the wave while one is up, and the autopilot is otherwise perfectly
 * happy to walk into the lock bound and stand there for the rest of the run. So a standing barricade outranks every
 * other goal below — the bot goes to the prop that holds it up, aligns z on it, and hits it down.
 * @returns {object|null} the barricade Prop
 */
function barricadeTarget(p, world) {
  if (!world.camera.locked) return null;
  for (const e of world.entities) {
    if (!e.isSolid || !e.breakable || e.removeMe || !e.blocking) continue;
    if (e.x1 < world.camera.left || e.x0 > world.camera.right) continue;
    return e.prop || null;
  }
  return null;
}

/**
 * Is a solid obstacle close enough ahead of `p` that it has to be jumped (issue #31)? Only fires for an obstacle
 * with no lane round it — the caller has already tried to side-step — and only while `p` is on the ground and
 * actionable, since a jump pressed mid-air is thrown away. Barricades are excluded: those are handled by
 * `barricadeTarget` above, because hopping one would leave the wave lock up forever.
 * @param {object} p @param {object} world @param {number} lane the z the bot is steering toward
 */
function jumpsSolid(p, world, lane) {
  if (p.airborne || !p.actionable) return false;
  const s = solidBetween(world, p.x, p.x + SOLID_LOOKAHEAD, lane);
  return !!s && !s.breakable && s.x0 - p.x <= SOLID_JUMP_AT;
}

/** A living teammate pinned under a net within 140px of `p` (the Wrangler's and the Riggerman's nets), or null. */
function nettedMate(p, world) {
  for (const q of world.players) {
    if (!q || q === p || !q.alive || q.dead || q.out || !q.status || !q.status.netted) continue;
    if (Math.abs(q.x - p.x) <= 140 && Math.abs(q.z - p.z) <= 40) return q;
  }
  return null;
}

/**
 * Something inbound in this z lane: an enemy projectile (team ENEMY, not yet spent) within 70px and moving toward the
 * player or falling on it, or a ROLLING prop (the Drayman's shoved handcart, a dumped chassis, a batted barrel) within
 * 90px coming this way — a rolling prop's hits belong to whoever rolled it, so the bot reads the cart, not the Drayman.
 */
function incomingShot(p, world) {
  for (const q of world.entities) {
    if (q.removeMe) continue;
    const dx = q.x - p.x;
    if (q.kind === 'prop') {
      if (q.state !== 'rolling' || Math.abs(dx) > 90 || Math.abs(q.z - p.z) > 24) continue;
      if (Math.sign(q.vx) === -Math.sign(dx)) return true;
      continue;
    }
    if (q.kind !== 'projectile' || q.team !== TEAM.ENEMY || q.style === 'explosion' || q.style === 'fire') continue;
    if (Math.abs(dx) > 70 || Math.abs(q.z - p.z) > 20) continue;
    if (!q.vx || Math.sign(q.vx) === -Math.sign(dx)) return true;   // heading at us, or falling on us
  }
  return false;
}
