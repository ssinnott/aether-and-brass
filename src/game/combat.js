// Hit resolution (ARCHITECTURE.md section 6): fighter hitboxes, thrown bodies and projectiles vs hurtboxes.
import { ST } from '../constants.js';
import { audio } from '../engine/audio.js';
import { worldHitbox } from './fighter.js';

const TARGET_KINDS = new Set(['player', 'enemy', 'boss', 'prop']);

/** Can `t` be a target of an attack by `attacker` with hit data `hit`? */
function isTarget(attacker, hit, t) {
  if (t === attacker || !t.alive || t.removeMe || !TARGET_KINDS.has(t.kind)) return false;
  if (t.kind === 'prop') return true;
  return t.team !== attacker.team || !!hit.friendly;
}

/** AABB overlap between a world hit box (x/y spans + z tolerance around zRef) and an entity's hurtbox. */
function overlaps(box, zRef, t) {
  const hb = t.hurtbox();
  if (!hb) return false;
  if (Math.abs(t.z - zRef) > box.z) return false;
  return box.x0 < hb.x1 && box.x1 > hb.x0 && box.y0 < hb.y1 && box.y1 > hb.y0;
}

function playHitSfx(hit) { audio.play(hit.sfx || ('hit_' + (hit.type === 'throw' ? 'heavy' : hit.type || 'light'))); }

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
        if (!isTarget(a, hb, t) || t.grabbedBy === a) continue;
        const rec = a.hitTargets.get(t.id);
        if (hb.once !== false) { if (rec && rec.key === key) continue; }
        else if (rec && world.frame - rec.frame < (hb.rehit || 6)) continue;
        if (!overlaps(box, a.z, t)) continue;
        if (hb.type === 'grab') {
          if (a.grabTarget || t.kind === 'prop' || !t.grabbableBy || !t.grabbableBy(a)) continue;
          a.hitTargets.set(t.id, { key, frame: world.frame });
          a.startGrab(t);
          break;
        }
        if (!t.takeHit(hb, a)) continue;
        a.hitTargets.set(t.id, { key, frame: world.frame });
        a.onHitConfirmed(t, hb);
        playHitSfx(hb);
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
    const tb = t.hurtbox();
    if (!tb || !(hb.x0 < tb.x1 && hb.x1 > tb.x0 && hb.y0 < tb.y1 && hb.y1 > tb.y0)) continue;
    if (!t.takeHit(hit, thrower)) continue;
    body.thrownHit.add(t.id);
    if (thrower) thrower.onHitConfirmed(t, hit);
    playHitSfx(hit);
  }
}

function resolveProjectile(world, p, ents) {
  if (!p.hit || p.removeMe) return;
  const box = p.box();
  for (let j = 0; j < ents.length; j++) {
    const t = ents[j];
    if (!isTarget(p, p.hit, t) || t === p.owner) continue;
    if (p.hitTargets.has(t.id)) continue;
    if (Math.abs(t.z - p.z) > (p.hit.z != null ? p.hit.z : 24)) continue;
    const tb = t.hurtbox();
    if (!tb || !(box.x0 < tb.x1 && box.x1 > tb.x0 && box.y0 < tb.y1 && box.y1 > tb.y0)) continue;
    if (!t.takeHit(p.hit, p.owner)) continue;
    p.hitTargets.add(t.id);
    if (p.owner && p.owner.onHitConfirmed) p.owner.onHitConfirmed(t, p.hit);
    playHitSfx(p.hit);
    p.onHitTarget(t, world);
    if (p.pierce-- <= 0) { p.expire(world, true); break; }
  }
}
