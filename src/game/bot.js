// Autopilot for players (?bot=1, ARCHITECTURE.md section 15): walk toward the nearest enemy (align z), attack in range,
// occasional jump attack / special / super / dodge, forward-throw held enemies, walk (run) right when no enemies remain.
//
// The autopilot has named STYLES (?botstyle=NAME, one per slot: `aggressive,defensive`). `balanced` is the default and
// is the behaviour every scenario in tools/playtest.js was written against; the others exist so tools/winrate.js can
// sweep a board against more than one kind of player before anyone calls it tuned.
import { ST, METER, TEAM } from '../constants.js';
import { rng } from '../engine/rng.js';
import { laneAroundHazards } from './hazards.js';

const Z_TOL = 14, RUN_DIST = 170, STOP_RUN_DIST = 110;

/**
 * Autopilot styles. Each is a whole player archetype, not a difficulty knob:
 * - `attackEvery`   frames between attack presses in range (lower = faster buttons)
 * - `dodgeChance`   chance per eligible frame to dodge an incoming hitbox (0 = never dodges)
 * - `specialChance` chance to spend a full special meter when it is up
 * - `superEvery`    frames between super attempts once the meter allows it
 * - `jumpChance`    chance to throw the periodic jump-in
 * - `spacing`       extra px of reach kept before committing (positive = fights at range)
 * - `retreatHp`     fraction of max HP below which it backs off to heal/space (0 = never retreats)
 */
export const BOT_STYLES = {
  // the original autopilot, unchanged: trades freely, dodges when something is coming
  balanced: { attackEvery: 8, dodgeChance: 0.3, specialChance: 0.5, superEvery: 20, jumpChance: 0.5, spacing: 0, retreatHp: 0 },
  // buttons down, never blocks: the ceiling on how fast a board can be cleared and the floor on how much it costs
  aggressive: { attackEvery: 5, dodgeChance: 0, specialChance: 0.9, superEvery: 12, jumpChance: 0.8, spacing: -6, retreatHp: 0 },
  // fights at the tip of its reach, dodges hard, backs off when hurt: a cautious player
  defensive: { attackEvery: 12, dodgeChance: 0.65, specialChance: 0.35, superEvery: 40, jumpChance: 0.15, spacing: 10, retreatHp: 0.35 },
  // no spacing, no patience, mashes one button: a first-time player on a keyboard
  masher: { attackEvery: 3, dodgeChance: 0.05, specialChance: 0.15, superEvery: 90, jumpChance: 0.35, spacing: -10, retreatHp: 0 },
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
  const e = pickTarget(p, world);
  if (!e) {
    it.x = 1;
    // a human steps round a live hazard; the autopilot has to be told to (walking into the dock's cargo
    // hook at its own z is a knockdown every pass, which stalls the walk to the next wave)
    const band = world.floorBand;
    const lane = laneAroundHazards(world, p.x, p.x + 120, p.z, band.z0, band.z1);
    if (Math.abs(lane - p.z) > 4) it.y = lane > p.z ? 1 : -1;
    if (!world.camera.locked && f % 90 < 80) it.run = true;
    else if (p.running) it.x = 0;
    return it;
  }
  const dx = e.x - p.x, dz = e.z - p.z, adx = Math.abs(dx);
  const gap = adx - (e.w || 28) / 2;               // distance to the target's hurtbox edge
  const reach = (p.def.reach || 40) + 8 + s.spacing;
  const dir = dx > 0 ? 1 : -1;
  if (Math.abs(dz) > 10) it.y = dz > 0 ? 1 : -1;
  // hurt and cautious: give ground rather than trade, so the style actually reads as defensive. The retreat is
  // time-boxed — a wave that will not chase (a locked arena) must not turn into a standoff neither side can end.
  const hurt = s.retreatHp > 0 && p.hp > 0 && p.hp < (p.maxHp || 200) * s.retreatHp;
  if (hurt && gap < RUN_DIST && f % RETREAT_CYCLE < RETREAT_FRAMES && f % 3 !== 0) { it.x = -dir; return it; }
  if (gap > reach - 6) {
    it.x = dir;
    if (gap > RUN_DIST) it.run = true;
    else if (p.running && gap < STOP_RUN_DIST && f % 2 === 0) it.x = 0; // drop out of the run so the approach ends in a combo, not a dash attack
  } else {
    if (dir !== p.facing) it.x = dir;
    if (Math.abs(dz) <= Z_TOL) {
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

/** An enemy projectile (team ENEMY, not yet spent) within 70px of the player and moving toward it in this z lane. */
function incomingShot(p, world) {
  for (const q of world.entities) {
    if (q.kind !== 'projectile' || q.team !== TEAM.ENEMY || q.removeMe || q.style === 'explosion' || q.style === 'fire') continue;
    const dx = q.x - p.x;
    if (Math.abs(dx) > 70 || Math.abs(q.z - p.z) > 20) continue;
    if (!q.vx || Math.sign(q.vx) === -Math.sign(dx)) return true;   // heading at us, or falling on us
  }
  return false;
}
