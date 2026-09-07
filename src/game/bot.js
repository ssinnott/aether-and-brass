// Autopilot for players (?bot=1): walk toward the nearest enemy, align z, attack in range, walk right when idle.
import { ST, METER } from '../constants.js';
import { rng } from '../engine/rng.js';

/**
 * Compute a synthetic intent for `p` (same shape as Player.readIntent produces). Fields are edge-style (true = pressed this frame).
 * @returns {{x:number, y:number, attack:boolean, jump:boolean, special:boolean, super:boolean, dodge:boolean, taunt:boolean, run:boolean, start:boolean}}
 */
export function botIntent(p, world) {
  const it = { x: 0, y: 0, attack: false, jump: false, special: false, super: false, dodge: false, taunt: false, run: false, start: false };
  const f = world.frame;
  const e = world.nearestEnemy(p.x, p.z, { maxDist: 900 });
  if (p.state === ST.LYING || p.state === ST.GETUP) { if (f % 5 === 0) it.jump = true; return it; }
  if (p.state === ST.GRAB) { if (f % 12 === 0) { it.attack = true; it.x = p.facing; } return it; }
  if (!e) { it.x = 1; if (world.boss && f % 40 === 0) it.attack = true; return it; }
  const dx = e.x - p.x, dz = e.z - p.z;
  const reach = (p.def.reach || 40) + 6;
  if (Math.abs(dz) > 10) it.y = dz > 0 ? 1 : -1;
  if (Math.abs(dx) > reach) { it.x = dx > 0 ? 1 : -1; if (Math.abs(dx) > 200) it.run = true; }
  else {
    if ((dx > 0 ? 1 : -1) !== p.facing) it.x = dx > 0 ? 1 : -1;
    if (Math.abs(dz) <= 14) {
      if (p.meter >= METER.super && f % 30 === 0) it.super = true;
      else if (p.meter >= METER.special && f % 120 === 0 && rng.chance(0.5)) it.special = true;
      else if (f % 9 === 0) it.attack = true;
    }
  }
  if (p.state === ST.JUMP && f % 4 === 0) it.attack = true;
  if (f % 240 === 120 && Math.abs(dx) < 120 && rng.chance(0.4)) it.jump = true;
  if (e.hitboxes && e.hitboxes().length && Math.abs(dx) < 60 && rng.chance(0.25)) it.dodge = true;
  return it;
}
