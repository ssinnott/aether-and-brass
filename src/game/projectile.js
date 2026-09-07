// Projectiles: bullets / bolts / shells (straight), bombs (lob + bounce + fuse + explode), boomerangs (return to the owner),
// grapples (chain out, reel the first enemy hit into the owner's grab), fire puddles (area hazards), reflectable bombs / bolts,
// custom-drawn projectiles. Built from content specs by `projectileOptsFromSpec` (frame `projectile`, `spawn.projectile`,
// def.projectiles[name]); see the FRAME FIELDS / PROJECTILE SPEC tables at the top of fighter.js.
import { FLOOR_TOP, TEAM, VIEW_W, ST } from '../constants.js';
import { Entity } from './entity.js';
import { particles } from '../engine/particles.js';
import { circle, rrect, pathPoly, paint, line } from '../art/shapes.js';
import { jointScreen } from '../art/rig.js';
import { audio } from '../engine/audio.js';

const STYLE_R = { bullet: 3, bolt: 3, bomb: 6, cannonball: 8, claw: 8, explosion: 20, shell: 5, hat: 8, crate: 12, net: 10, watch: 6, stone: 4, fire: 22, rubble: 10 };
const KIND_DEFAULTS = {
  lob: { gravity: 0.5, bounces: 1, rest: true },
  fuse: { rest: true, gravity: 0 },
  boomerang: { maxDist: 160, pierce: 99 },
  grapple: { chained: true, pierce: 0, reelFrames: 12 },
  puddle: { every: 20, gravity: 0, life: 180, style: 'fire' },
};

/**
 * @typedef {object} ProjectileOpts
 * @property {object} owner fighter that fired it (credited with hits)
 * @property {number} [team] defaults to owner.team (TEAM.NONE + hit.friendly hits everyone)
 * @property {object} hit { damage, type, kbX, kbY, hitstun, z, status, element }
 * @property {'straight'|'lob'|'fuse'|'boomerang'|'grapple'|'puddle'} [kind] motion kind (default straight)
 * @property {'bullet'|'bolt'|'bomb'|'cannonball'|'claw'|'explosion'|'shell'|'hat'|'crate'|'net'|'watch'|'stone'|'fire'|'rubble'} [style]
 * @property {boolean} [reflectable] a hit from the other team reverses it (team + owner swap, `damageOnReflect`)
 * @property {function} [draw] custom renderer (ctx, projectile, sx, sy)
 */
export class Projectile extends Entity {
  /** @param {ProjectileOpts & { x, y, z, vx, vy, vz, gravity, life, r, pierce, maxDist, color, onHit, onExpire, radius, every, hitsTeams, reelFrames }} o */
  constructor(o) {
    super('projectile');
    this.owner = o.owner || null;
    this.team = o.team != null ? o.team : (this.owner ? this.owner.team : TEAM.NONE);
    this.motion = o.kind || 'straight';
    const kd = KIND_DEFAULTS[this.motion] || {};
    this.x = o.x || 0; this.y = o.y || 0; this.z = o.z || 0;
    this.vx = o.vx || 0; this.vy = o.vy || 0; this.vz = o.vz || 0;
    this.gravity = o.gravity != null ? o.gravity : (kd.gravity || 0);
    this.life = o.life != null ? o.life : (kd.life || 90);
    this.style = o.style || kd.style || 'bullet';
    this.r = o.r != null ? o.r : (STYLE_R[this.style] || 4);
    this.hit = o.hit ? { ...o.hit, projectile: true, ranged: true } : null; // flagged so parries / ripostes ignore ranged hits
    this.pierce = o.pierce != null ? o.pierce : (kd.pierce || 0);
    this.maxDist = o.maxDist != null ? o.maxDist : (kd.maxDist || 0);
    this.color = o.color || '#ffe070';
    this.onHit = o.onHit || null;           // 'reel' | (target, world, projectile) => void
    this.onExpire = o.onExpire || null;     // 'explode' | function(world, projectile, byHit)
    this.onReflect = o.onReflect || null;   // (projectile, attacker, world) => void
    this.radius = o.radius || 40;           // explosion radius
    this.startX = this.x; this.startZ = this.z;
    this.hitTargets = new Set();
    this.facing = o.facing || (this.vx < 0 ? -1 : 1);
    this.shadowW = this.style === 'explosion' || this.style === 'fire' ? 0 : Math.max(8, this.r * 2);
    this.zSize = this.r * 2;
    this.chained = o.chained != null ? !!o.chained : !!kd.chained;    // draws a chain back to the owner (grapple)
    this.bounces = o.bounces != null ? o.bounces : (kd.bounces || 0);  // floor bounces before expiring (lobbed bombs)
    this.rest = o.rest != null ? !!o.rest : !!kd.rest;                 // after the bounces, rest on the floor until life runs out (fuse)
    this.explodeHit = o.explodeHit || null; // hit data used by the explosion when different from the contact hit
    this.reflectable = !!o.reflectable;
    this.damageOnReflect = o.damageOnReflect || 0;
    this.reflectSpeed = o.reflectSpeed || 0;
    this.reflected = false;
    this.hitsTeams = o.hitsTeams || null;   // optional array of TEAM values this projectile may damage
    this.every = o.every || kd.every || 0;  // puddle: area hit every N frames
    this.reelFrames = o.reelFrames || kd.reelFrames || 12;
    this.reelTarget = null; this.reelT = 0;
    this.drawFn = typeof o.draw === 'function' ? o.draw : null;
    this.retract = false; this.returning = false;
    this.spin = 0; this.lastTick = -99;
  }
  /** World-space AABB of the projectile body (y positive up). */
  box() { return { x0: this.x - this.r, x1: this.x + this.r, y0: Math.max(0, this.y - this.r), y1: this.y + this.r }; }
  /** Reflectable projectiles are hittable by the other team (combat.js). */
  hurtbox() { if (!this.reflectable || !this.alive || this.removeMe) return null; const b = this.box(); return { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: this.z - this.r, z1: this.z + this.r }; }
  /** May this projectile damage `t`? (team filtering) */
  canHit(t) {
    if (this.hitsTeams) return this.hitsTeams.includes(t.team) || t.kind === 'prop';
    return t.kind === 'prop' || t.team !== this.team || !!(this.hit && this.hit.friendly);
  }
  update(world) {
    this.world = world;
    if (this.reelTarget) { this.updateReel(world); return; }
    if (this.retract) {
      const o = this.owner, tx = o ? o.x + o.facing * 10 : this.x, ty = o ? o.y + 30 : 0;
      this.x += (tx - this.x) * 0.35; this.y += (ty - this.y) * 0.35;
      if (Math.abs(tx - this.x) < 6) this.removeMe = true;
      return;
    }
    this.life--;
    this.spin += 0.3;
    if (this.motion === 'puddle') { this.updatePuddle(world); return; }
    if (this.returning) {
      const o = this.owner;
      if (!o || !o.alive) { this.removeMe = true; return; }
      const dx = o.x - this.x, dy = (o.y + 40) - this.y, dz = o.z - this.z, d = Math.hypot(dx, dy) || 1;
      const s = Math.max(4, Math.abs(this.vx) || 5);
      this.x += dx / d * s; this.y += dy / d * s; this.z += dz * 0.2;
      if (d < 12 || this.life < -120) { this.expire(world, false); return; }
      return;
    }
    this.vy -= this.gravity;
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    if (this.y < 0) {
      this.y = 0;
      if (this.bounces > 0 && this.vy < -0.5) { this.bounces--; this.vy = -this.vy * 0.45; this.vx *= 0.6; this.vz *= 0.6; particles.burst('dust', this.x, 0, this.z, 3, { speed: 1.2 }); }
      else if (this.rest && this.life > 0) { this.vy = 0; this.gravity = 0; this.vx = 0; this.vz = 0; }
      else { this.expire(world, false); return; }
    }
    if (this.life <= 0) { if (this.motion === 'boomerang') { this.turnBack(); return; } this.expire(world, false); return; }
    if (this.maxDist && Math.abs(this.x - this.startX) >= this.maxDist) {
      if (this.motion === 'boomerang') { this.turnBack(); return; }
      this.expire(world, false); return;
    }
    const cam = world.camera;
    if (cam && (this.x < cam.x - 200 || this.x > cam.x + VIEW_W + 200)) this.removeMe = true;
  }
  turnBack() { this.returning = true; this.hitTargets.clear(); this.vx = -this.vx; this.life = 0; }
  /** Fire puddle / area hazard: hits everything inside every `every` frames. */
  updatePuddle(world) {
    if (this.life <= 0) { this.expire(world, false); return; }
    if (this.life % 4 === 0) particles.burst('ember', this.x + (this.life % 7 - 3) * this.r * 0.25, 2, this.z, 1, { speed: 0.6, up: 1.6, color: this.color === '#ffe070' ? '#ff9a30' : this.color });
    if (this.every && world.frame - this.lastTick >= this.every && this.hit) {
      this.lastTick = world.frame;
      world.areaHit(this.x, this.z, this.r, this.hit, this.owner, { team: this.team, y: 0, silent: true, hitsTeams: this.hitsTeams });
    }
  }
  /** Grapple: drag the hooked fighter to the owner, then hand it to the owner's grab. */
  updateReel(world) {
    const t = this.reelTarget, o = this.owner;
    if (!o || !o.alive || o.dead || !t.alive || t.dead || o.grabTarget || o.inHitstun) { this.reelTarget = null; this.removeMe = true; return; }
    const off = ((o.def && o.def.grabOffset) || 24) * (o.scale || 1);
    const gx = o.x + o.facing * off;
    t.x += (gx - t.x) * 0.3; t.z += (o.z - t.z) * 0.3; t.y = Math.max(0, t.y * 0.7); t.vx = 0; t.vy = 0;
    t.hurtTimer = Math.max(t.hurtTimer || 0, 3); t.facing = -o.facing;
    if (t.state !== ST.HURT) t.setState(ST.HURT, 'hurt');
    this.x = t.x; this.y = t.y + 30; this.z = t.z;
    if (++this.reelT >= this.reelFrames || Math.abs(gx - t.x) < 4) {
      this.reelTarget = null; this.removeMe = true;
      if (t.grabbableBy && t.grabbableBy(o, { ignoreHitstun: true }) && !t.grabbedBy) { t.x = gx; t.z = o.z; t.hurtTimer = 0; o.startGrab(t); }
      else t.hurtTimer = 8;
    }
  }
  /** Called by combat when the projectile damages a target. */
  onHitTarget(target, world) {
    if (this.style === 'bullet' || this.style === 'shell') particles.burst('spark', this.x, this.y, this.z, 5, { speed: 3 });
    if (this.onHit === 'reel') {
      const o = this.owner;
      if (target.kind !== 'prop' && !target.dead && target.grabbableBy && o && !o.grabTarget && target.grabbableBy(o, { ignoreHitstun: true })
        && (o.state === ST.DASH_ATTACK || o.state === ST.ATTACK || o.state === ST.SPECIAL || o.actionable)) {
        this.reelTarget = target; this.reelT = 0; this.hit = null; this.pierce = 99;
        audio.play('hook_yank');
      }
      return;
    }
    if (typeof this.onHit === 'function') this.onHit(target, world, this);
  }
  /**
   * Reflect (bat back) this projectile: reversed along the attacker's facing, swaps team + owner, applies `damageOnReflect`.
   * Fuse bombs become contact-hitting missiles that explode on impact (GDD 3 A3 "any player attack bats the bomb").
   */
  reflect(attacker, world) {
    this.reflected = true; this.reflectable = false;
    this.team = attacker.team; this.owner = attacker;
    this.hitTargets.clear();
    const spd = this.reflectSpeed || Math.max(5, Math.abs(this.vx) * 1.4);
    this.facing = attacker.facing; this.vx = attacker.facing * spd; this.vz = 0;
    this.gravity = this.gravity || (this.motion === 'lob' || this.motion === 'fuse' ? 0.3 : 0);
    this.rest = false; this.bounces = 0; this.startX = this.x; this.maxDist = this.maxDist || 150;
    // lofted bombs get enough lift to actually fly `maxDist` before touching down (GDD 3 A3: batted 150px)
    this.vy = Math.max(this.vy, this.gravity > 0 ? this.gravity * (this.maxDist / spd) / 2 : 2.5);
    this.life = Math.max(this.life, 60); this.retract = false; this.returning = false;
    const base = this.hit || this.explodeHit || { damage: 8, type: 'medium', kbX: 5, kbY: 2, hitstun: 18 };
    this.hit = { ...base, projectile: true, ranged: true, friendly: true, damage: this.damageOnReflect || Math.round((base.damage || 8) * 1.5), reflected: true };
    if (this.explodeHit) this.explodeHit = { ...this.explodeHit, friendly: true };
    if (this.onExpire === 'explode') this.pierce = 0;
    particles.burst('spark', this.x, this.y, this.z, 8, { speed: 4 });
    audio.play(this.style === 'bomb' ? 'bomb_bat' : 'parry');
    if (typeof this.onReflect === 'function') this.onReflect(this, attacker, world);
  }
  /** End of life: explode (if configured), or vanish. */
  expire(world, byHit) {
    if (this.removeMe) return;
    if (this.onExpire === 'explode') {
      const hit = this.explodeHit || this.hit;
      world.areaHit(this.x, this.z, this.radius, hit, this.owner, { team: this.team, y: this.y, shake: 8, hitsTeams: this.hitsTeams });
      audio.play('explosion');
      particles.burst('ember', this.x, this.y + 4, this.z, 10, { speed: 3, up: 2 });
      particles.burst('smoke', this.x, this.y + 4, this.z, 6, { speed: 1.2, up: 1 });
    } else if (typeof this.onExpire === 'function') this.onExpire(world, this, byHit);
    if (this.chained && !byHit && !this.reelTarget) { this.retract = true; this.hit = null; return; }
    this.removeMe = true;
  }
  draw(ctx, cam) {
    const sx = cam.toScreenX(this.x), sy = Math.round(FLOOR_TOP + this.z - this.y + cam.shakeY);
    if (this.drawFn) { this.drawFn(ctx, this, sx, sy); return; }
    const ol = '#1a1018';
    if (this.chained && this.owner && this.owner.rig) {
      const j = jointScreen(this.owner.rig, 'handN');
      line(ctx, j.x, j.y, sx, sy - this.r, '#3a3a44', 4); line(ctx, j.x, j.y, sx, sy - this.r, '#9a9aa8', 2);
    }
    switch (this.style) {
      case 'bullet': case 'shell': {
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(-this.vy, this.vx));
        rrect(ctx, -this.r - 6, -this.r * 0.6, this.r * 2 + 6, this.r * 1.2, 2, this.color, ol, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-1, -1, this.r, 1);
        ctx.restore(); break;
      }
      case 'bolt': { ctx.save(); ctx.translate(sx, sy); ctx.rotate(this.spin); rrect(ctx, -this.r, -this.r, this.r * 2, this.r * 2, 1, this.color, ol, 1); ctx.restore(); break; }
      case 'bomb': case 'cannonball': case 'rubble': {
        circle(ctx, sx, sy - this.r, this.r, this.color, ol, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(sx - this.r * 0.35, sy - this.r * 1.35, this.r * 0.3, 0, Math.PI * 2); ctx.fill();
        if (this.style === 'bomb') { line(ctx, sx + 2, sy - this.r * 2, sx + 5, sy - this.r * 2 - 5, '#8a6a40', 2); if ((this.life & 4) === 0 || (this.life < 40 && (this.life & 2) === 0)) circle(ctx, sx + 5, sy - this.r * 2 - 6, 2, this.life < 40 ? '#ffffff' : '#ffe070', null, 0); }
        break;
      }
      case 'claw': {
        ctx.save(); ctx.translate(sx, sy - this.r); ctx.scale(this.facing, 1);
        pathPoly(ctx, [-6, -6, 8, -2, 2, 0, 8, 2, -6, 6, -2, 0]); paint(ctx, this.color, ol, 1.5);
        ctx.restore(); break;
      }
      case 'crate': {
        rrect(ctx, sx - this.r, sy - this.r * 2, this.r * 2, this.r * 2, 2, this.color === '#ffe070' ? '#9a7040' : this.color, ol, 1);
        ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - this.r + 2, sy - this.r * 2 + 2); ctx.lineTo(sx + this.r - 2, sy - 2); ctx.stroke();
        break;
      }
      case 'net': {
        ctx.save(); ctx.translate(sx, sy - this.r); ctx.rotate(this.spin);
        ctx.strokeStyle = this.color; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let k = -2; k <= 2; k++) { ctx.moveTo(k * 4, -this.r); ctx.lineTo(k * 4, this.r); ctx.moveTo(-this.r, k * 4); ctx.lineTo(this.r, k * 4); }
        ctx.stroke(); ctx.restore(); break;
      }
      case 'watch': {
        circle(ctx, sx, sy - this.r, this.r, (this.life & 8) && this.life < 40 ? '#ffffff' : this.color, ol, 1);
        line(ctx, sx, sy - this.r, sx + this.r * 0.6 * Math.cos(this.spin * 3), sy - this.r + this.r * 0.6 * Math.sin(this.spin * 3), ol, 1);
        break;
      }
      case 'fire': {
        const k = 0.8 + 0.2 * Math.sin(this.spin * 4), a = Math.min(1, this.life / 30);
        ctx.save(); ctx.globalAlpha = 0.75 * a;
        ctx.fillStyle = '#ff5a1f'; ctx.beginPath(); ctx.ellipse(sx, sy, this.r * k, this.r * 0.4 * k, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(sx, sy, this.r * 0.55 * k, this.r * 0.22 * k, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 4; i++) { const px = sx + Math.sin(this.spin * 2 + i * 1.7) * this.r * 0.6, ph = 6 + Math.sin(this.spin * 3 + i) * 4; pathPoly(ctx, [px - 3, sy, px + 3, sy, px, sy - ph]); ctx.fillStyle = i % 2 ? '#ff9a30' : '#ffe070'; ctx.fill(); }
        ctx.restore(); break;
      }
      case 'stone': { circle(ctx, sx, sy - this.r, this.r, this.color, ol, 1); break; }
      case 'hat': { ctx.save(); ctx.translate(sx, sy - this.r); ctx.rotate(this.spin * 2); rrect(ctx, -9, -2, 18, 4, 1, this.color, ol, 1); rrect(ctx, -5, -9, 10, 8, 1, this.color, ol, 1); ctx.restore(); break; }
      case 'explosion': default: break; // explosion FX are spawned on creation
    }
  }
}

/**
 * Build Projectile options from a content spec (frame `projectile`, `spawn.projectile`, or def.projectiles[name]).
 * Spec fields: kind, style, speed, angle, count, spreadY, spreadZ, vz, damage, type, kbX, kbY, hitstun, zTol, friendly, status, element,
 *   hitSfx, noContactHit, explodeHit, radius, bounces, rest, life, gravity, maxDist, pierce, chained, r, color, aimAt, flight, fromSky,
 *   height, ahead, spacing, zOffset, offsetX, offsetY, muzzle, reflectable, damageOnReflect, reflectSpeed, onReflect, onHit ('reel' | fn),
 *   onExpire ('explode' | fn), reelFrames, every (puddle tick), hitsTeams, teamNone, draw(ctx, proj, sx, sy).
 * `o` overrides: x, y, z (world), index/count (fan spreads), aimX/aimZ (lob target), facing.
 * @returns {ProjectileOpts}
 */
export function projectileOptsFromSpec(spec, owner, o = {}) {
  const facing = o.facing || (owner ? owner.facing : 1);
  const count = spec.count || 1, i = o.index || 0, idx = spec.index != null ? spec.index : i;
  const angle = ((spec.angle || 0) + (count > 1 ? (i - (count - 1) / 2) * (spec.spreadY || 0) : 0)) * Math.PI / 180;
  const stationary = spec.kind === 'fuse' || spec.kind === 'puddle';
  const speed = spec.speed != null ? spec.speed : (stationary ? 0 : 6);
  const out = {
    owner, team: spec.team != null ? spec.team : (spec.teamNone ? TEAM.NONE : undefined), kind: spec.kind, style: spec.style || 'bullet', color: spec.color, life: spec.life, gravity: spec.gravity,
    pierce: spec.pierce, maxDist: spec.maxDist, bounces: spec.bounces, rest: spec.rest, radius: spec.radius || 40, facing, chained: spec.chained, r: spec.r,
    hit: spec.noContactHit ? null : { damage: spec.damage || 6, type: spec.type || 'light', kbX: spec.kbX != null ? spec.kbX : 3, kbY: spec.kbY || 0, hitstun: spec.hitstun || 14, z: spec.zTol,
      friendly: spec.friendly, status: spec.status, element: spec.element, sfx: spec.hitSfx },
    explodeHit: spec.explodeHit || null, onExpire: spec.onExpire || null, every: spec.every, hitsTeams: spec.hitsTeams,
    reflectable: spec.reflectable, damageOnReflect: spec.damageOnReflect, reflectSpeed: spec.reflectSpeed, reelFrames: spec.reelFrames, draw: spec.draw,
  };
  const ox = owner ? owner.x : 0, oy = owner ? owner.y : 0, oz = owner ? owner.z : 0;
  const aimX = o.aimX != null ? o.aimX : (owner && owner.aimX != null ? owner.aimX : null);
  const aimZ = o.aimZ != null ? o.aimZ : (owner && owner.aimZ != null ? owner.aimZ : null);
  if (spec.fromSky) {
    out.x = spec.aimAt ? (aimX != null ? aimX : ox) : ox + facing * ((spec.ahead || 40) + idx * (spec.spacing || 40));
    out.y = spec.height || 200; out.z = spec.aimAt ? (aimZ != null ? aimZ : oz) : oz + (spec.zOffset || 0); out.vx = 0; out.vy = 0; out.gravity = spec.gravity || 0.5;
  } else if (spec.aimAt) {
    const T = spec.flight || 50, g = spec.gravity != null ? spec.gravity : 0.5;
    out.x = ox + facing * (spec.offsetX != null ? spec.offsetX : 20); out.y = oy + (spec.offsetY != null ? spec.offsetY : 40); out.z = oz;
    const tx = aimX != null ? aimX : ox + facing * 120, tz = aimZ != null ? aimZ : oz;
    out.vx = (tx - out.x) / T; out.vz = (tz - out.z) / T; out.vy = (0.5 * g * T * T - out.y) / T; out.gravity = g;
  } else {
    out.x = ox + facing * (spec.offsetX != null ? spec.offsetX : 20); out.y = oy + (spec.offsetY != null ? spec.offsetY : 40); out.z = oz;
    out.vx = Math.cos(angle) * speed * facing; out.vy = Math.sin(angle) * speed;
    out.vz = count > 1 ? (i - (count - 1) / 2) * (spec.spreadZ || 0) : (spec.vz || 0);
  }
  if (o.x != null) out.x = o.x; if (o.y != null) out.y = o.y; if (o.z != null) out.z = o.z;
  if (spec.onHit === 'reel') out.onHit = 'reel';
  else if (typeof spec.onHit === 'function') out.onHit = (t, w, proj) => spec.onHit(t, w, proj, owner);
  if (typeof spec.onExpire === 'function') out.onExpire = (w, proj, byHit) => spec.onExpire(w, proj, byHit, owner);
  if (typeof spec.onReflect === 'function') out.onReflect = spec.onReflect;
  return out;
}
