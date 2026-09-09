// Autopilot for players (?bot=1, ARCHITECTURE.md section 15): walk toward the nearest enemy (align z), attack in range,
// occasional jump attack / special / super / dodge, forward-throw held enemies, walk (run) right when no enemies remain.
import { ST, METER } from '../constants.js';
import { rng } from '../engine/rng.js';
import { laneAroundHazards } from './hazards.js';

const ATTACK_EVERY = 8, Z_TOL = 14, RUN_DIST = 170, STOP_RUN_DIST = 110;

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

/**
 * Compute a synthetic intent for `p` (same shape as Player.readIntent produces). Fields are edge-style (true = pressed this frame).
 * @returns {{x:number, y:number, attack:boolean, jump:boolean, special:boolean, super:boolean, dodge:boolean, taunt:boolean, run:boolean, start:boolean}}
 */
export function botIntent(p, world) {
  const it = { x: 0, y: 0, attack: false, jump: false, special: false, super: false, dodge: false, taunt: false, run: false, start: false };
  const f = world.frame + (p.index || 0) * 3;
  if (p.state === ST.LYING || p.state === ST.GETUP || p.state === ST.HURT) { if (f % 5 === 0) it.jump = true; return it; }
  if (p.state === ST.GRAB) { if (f % 10 === 0) { it.attack = true; it.x = p.facing; } return it; }
  if (p.state === ST.GRABBED) { if (f % 3 === 0) it.attack = true; return it; }
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
  const reach = (p.def.reach || 40) + 8;
  const dir = dx > 0 ? 1 : -1;
  if (Math.abs(dz) > 10) it.y = dz > 0 ? 1 : -1;
  if (gap > reach - 6) {
    it.x = dir;
    if (gap > RUN_DIST) it.run = true;
    else if (p.running && gap < STOP_RUN_DIST && f % 2 === 0) it.x = 0; // drop out of the run so the approach ends in a combo, not a dash attack
  } else {
    if (dir !== p.facing) it.x = dir;
    if (Math.abs(dz) <= Z_TOL) {
      if (p.meter >= METER.super && f % 20 === 0) it.super = true;
      else if (p.meter >= METER.special && f % 60 === 0 && rng.chance(0.5)) it.special = true;
      else if (f % ATTACK_EVERY === 0) it.attack = true;
    }
  }
  if (p.state === ST.JUMP && f % 4 === 0) it.attack = true;
  if (f % 300 === 150 && adx < 110 && Math.abs(dz) <= Z_TOL && rng.chance(0.5)) it.jump = true;
  if (e.hitboxes && e.hitboxes().length && adx < 70 && Math.abs(dz) < 20 && f % 3 === 0 && rng.chance(0.3)) it.dodge = true;
  return it;
}
