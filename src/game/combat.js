// Hit resolution (ARCHITECTURE.md section 6): fighter hitboxes, thrown bodies and projectiles vs hurtboxes (+ boss sub-parts),
// reflectable projectiles (a player attack bats a bomb / bolt back), hitbox maxTargets / pierceDamage, grounded-only area hits.
import { ST } from '../constants.js';
import { audio } from '../engine/audio.js';
import { worldHitbox } from './fighter.js';

const TARGET_KINDS = new Set(['player', 'enemy', 'boss', 'prop']);

/** Can `t` be a target of an attack by `attacker` with hit data `hit`? */
function isTarget(attacker, hit, t) {
  if (t === attacker || !t.alive || t.removeMe) return false;
  if (t.kind === 'projectile') return !!t.reflectable && t.team !== attacker.team && !hit.projectile;
  if (!TARGET_KINDS.has(t.kind)) return false;
  if (t.kind === 'prop') return true;
  if (attacker.canHit) return attacker.canHit(t);
  return t.team !== attacker.team || !!hit.friendly || (!!t.status && !!t.status.netted && t.team === attacker.team);
}

/** Hurt boxes of a target (sub-parts when defined). */
function boxesOf(t) { return t.hurtboxes ? t.hurtboxes() : (t.hurtbox() ? [t.hurtbox()] : []); }

/** First hurtbox of `t` overlapping the world hit box (x/y spans + z tolerance around zRef), or null. */
function overlapBox(box, zRef, t) {
  if (Math.abs(t.z - zRef) > box.z) return null;
  for (const hb of boxesOf(t)) if (box.x0 < hb.x1 && box.x1 > hb.x0 && box.y0 < hb.y1 && box.y1 > hb.y0) return hb;
  return null;
}

function playHitSfx(hit) { audio.play(hit.sfx || ('hit_' + (hit.type === 'throw' ? 'heavy' : hit.type || 'light'))); }

/** Deliver `hit` from `attacker` to `t` through the matched hurtbox (sub-part damage multipliers via t.hitPart). */
function deliver(t, hit, attacker, hb) {
  if (t.kind === 'projectile') { t.reflect(attacker, attacker.world); return true; }
  if (hb && hb.part && t.hitPart !== undefined) t.hitPart = hb.part;
  const ok = t.takeHit(hit, attacker);
  if (t.hitPart) t.hitPart = null;
  return ok;
}

/**
 * Resolve every hit for this fixed step. Called once per step after all entity updates.
 * @param {import('./world.js').World} world
 */
export function resolveHits(world) {
  const ents = world.entities;
  for (let i = 0; i < ents.length; i++) {
    const a = ents[i];
    if (!a.alive || a.removeMe) continue;
    if (a.kind === 'projectile') { resolveProjectile(world, a, ents); continue; }
    if (!a.hitboxes) continue;
    if (a.state === ST.THROWN && a.thrownBy && Math.abs(a.vx) > 2.5) resolveThrownBody(world, a, ents);
    if (a.hitstop > 0) continue;
    const hbs = a.hitboxes();
    if (!hbs.length) continue;
    if (a.anim.instance !== a.hitInstance) { a.hitInstance = a.anim.instance; a.hitTargets.clear(); a.hitConfirmed = false; }
    for (let k = 0; k < hbs.length; k++) {
      const hb = hbs[k];
      const box = worldHitbox(a, hb);
      const key = hb.id != null ? hb.id : (a.anim.frameIndex + ':' + k);
      for (let j = 0; j < ents.length; j++) {
        const t = ents[j];
        // hitbox.extinguish: fire puddles (and projectiles flagged extinguishable) inside the box are snuffed out (Pip's Steam Vent, GDD 2.4)
        if (hb.extinguish && t.kind === 'projectile' && !t.removeMe && (t.motion === 'puddle' || t.extinguishable) && Math.abs(t.z - a.z) <= box.z + t.r
          && box.x0 < t.x + t.r && box.x1 > t.x - t.r) { t.removeMe = true; world.addFx('steam', t.x, 6, t.z, { count: 6 }); continue; }
        if (!isTarget(a, hb, t) || t.grabbedBy === a) continue;
        const rec = a.hitTargets.get(t.id);
        if (hb.once !== false) { if (rec && rec.key === key) continue; }
        else if (rec && world.frame - rec.frame < (hb.rehit || 6)) continue;
        const maxTargets = hb.maxTargets || (hb.pierce != null ? hb.pierce + 1 : 0); // pierce: N = the first target + N more
        if (maxTargets && !rec && a.hitTargets.size >= maxTargets) continue;
        const ob = overlapBox(box, a.z + (hb.zOff || 0) * a.facing, t);
        if (!ob) continue;
        if (hb.type === 'grab') {
          if (a.grabTarget || t.kind === 'prop' || t.kind === 'projectile' || !t.grabbableBy || !t.grabbableBy(a)) continue;
          a.hitTargets.set(t.id, { key, frame: world.frame });
          a.startGrab(t);
          break;
        }
        let hit = hb;
        if (hb.pierceDamage != null && !rec && a.hitTargets.size >= 1) hit = { ...hb, damage: hb.pierceDamage };
        if (!deliver(t, hit, a, ob)) continue;
        a.hitTargets.set(t.id, { key, frame: world.frame });
        if (t.kind === 'projectile') { audio.play('parry'); continue; }
        a.onHitConfirmed(t, hit);
        playHitSfx(hit);
        if (hb.onHit && a.onHitEffect) a.onHitEffect(hb.onHit, t, hb);
      }
    }
  }
}

/** A thrown fighter is a projectile: it damages its own team (and props) once each. */
function resolveThrownBody(world, body, ents) {
  const hb = body.hurtbox();
  if (!hb) return;
  const hit = body.bodyHit, thrower = body.thrownBy;
  for (let j = 0; j < ents.length; j++) {
    const t = ents[j];
    if (t === body || t === thrower || !t.alive || t.removeMe) continue;
    if (!(t.kind === 'prop' || (t.team === body.team && (t.kind === 'enemy' || t.kind === 'boss')))) continue;
    if (body.thrownHit.has(t.id)) continue;
    if (Math.abs(t.z - body.z) > 24) continue;
    let ob = null;
    for (const tb of boxesOf(t)) if (hb.x0 < tb.x1 && hb.x1 > tb.x0 && hb.y0 < tb.y1 && hb.y1 > tb.y0) { ob = tb; break; }
    if (!ob) continue;
    if (!deliver(t, hit, thrower, ob)) continue;
    body.thrownHit.add(t.id);
    if (thrower) thrower.onHitConfirmed(t, hit);
    playHitSfx(hit);
  }
}

function resolveProjectile(world, p, ents) {
  if (!p.hit || p.removeMe || p.reelTarget) return;
  const box = p.box();
  for (let j = 0; j < ents.length; j++) {
    const t = ents[j];
    if (t === p.owner || t.kind === 'projectile' || !isTarget(p, p.hit, t)) continue;
    if (p.hitTargets.has(t.id)) continue;
    if (Math.abs(t.z - p.z) > (p.hit.z != null ? p.hit.z : 24)) continue;
    if (p.hit.groundedOnly && t.y > 8) continue;
    let ob = null;
    for (const tb of boxesOf(t)) if (box.x0 < tb.x1 && box.x1 > tb.x0 && box.y0 < tb.y1 && box.y1 > tb.y0) { ob = tb; break; }
    if (!ob) continue;
    if (!deliver(t, p.hit, p.owner, ob)) continue;
    p.hitTargets.add(t.id);
    if (p.owner && p.owner.onHitConfirmed) p.owner.onHitConfirmed(t, p.hit);
    playHitSfx(p.hit);
    p.onHitTarget(t, world);
    if (p.reelTarget) break;
    if (p.pierce-- <= 0) { p.expire(world, true); break; }
  }
}
