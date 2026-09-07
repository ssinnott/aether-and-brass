// Simple projectiles with hitboxes (bullets, bolts, bombs, cannonballs, grapple claws, explosions).
import { FLOOR_TOP, TEAM, VIEW_W } from '../constants.js';
import { Entity } from './entity.js';
import { particles } from '../engine/particles.js';
import { circle, rrect, pathPoly, paint, line } from '../art/shapes.js';
import { jointScreen } from '../art/rig.js';
import { audio } from '../engine/audio.js';

const STYLE_R = { bullet: 3, bolt: 3, bomb: 6, cannonball: 8, claw: 8, explosion: 20, shell: 5, hat: 8, crate: 12, net: 10, watch: 6, stone: 4 };

/**
 * @typedef {object} ProjectileOpts
 * @property {object} owner fighter that fired it (credited with hits)
 * @property {number} [team] defaults to owner.team
 * @property {object} hit { damage, type, kbX, kbY, hitstun, z }
 * @property {'bullet'|'bolt'|'bomb'|'cannonball'|'claw'|'explosion'|'shell'|'hat'} [style]
 */
export class Projectile extends Entity {
  /** @param {ProjectileOpts & { x, y, z, vx, vy, vz, gravity, life, r, pierce, maxDist, color, onHit, onExpire, radius }} o */
  constructor(o) {
    super('projectile');
    this.owner = o.owner || null;
    this.team = o.team != null ? o.team : (this.owner ? this.owner.team : TEAM.NONE);
    this.x = o.x || 0; this.y = o.y || 0; this.z = o.z || 0;
    this.vx = o.vx || 0; this.vy = o.vy || 0; this.vz = o.vz || 0;
    this.gravity = o.gravity || 0;
    this.life = o.life != null ? o.life : 90;
    this.style = o.style || 'bullet';
    this.r = o.r != null ? o.r : (STYLE_R[this.style] || 4);
    this.hit = o.hit ? { ...o.hit, projectile: true } : null; // flagged so parries (Duelist riposte) ignore ranged hits
    this.pierce = o.pierce || 0;
    this.maxDist = o.maxDist || 0;
    this.color = o.color || '#ffe070';
    this.onHit = o.onHit || null;           // (target, world, projectile) => void
    this.onExpire = o.onExpire || null;     // 'explode' | function(world, projectile)
    this.radius = o.radius || 40;           // explosion radius
    this.startX = this.x; this.startZ = this.z;
    this.hitTargets = new Set();
    this.facing = o.facing || (this.vx < 0 ? -1 : 1);
    this.shadowW = this.style === 'explosion' ? 0 : Math.max(8, this.r * 2);
    this.zSize = this.r * 2;
    this.chained = !!o.chained;             // draws a chain back to the owner (grapple)
    this.bounces = o.bounces || 0;          // floor bounces before expiring (lobbed bombs)
    this.rest = !!o.rest;                   // after the bounces, rest on the floor until life runs out (fuse)
    this.explodeHit = o.explodeHit || null; // hit data used by the explosion when different from the contact hit
    this.retract = false;
    this.spin = 0;
  }
  /** World-space AABB of the projectile body (y positive up). */
  box() { return { x0: this.x - this.r, x1: this.x + this.r, y0: Math.max(0, this.y - this.r), y1: this.y + this.r }; }
  update(world) {
    this.world = world;
    if (this.retract) {
      const o = this.owner, tx = o ? o.x + o.facing * 10 : this.x, ty = o ? o.y + 30 : 0;
      this.x += (tx - this.x) * 0.35; this.y += (ty - this.y) * 0.35;
      if (Math.abs(tx - this.x) < 6) this.removeMe = true;
      return;
    }
    this.life--;
    this.spin += 0.3;
    this.vy -= this.gravity;
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    if (this.y < 0) {
      this.y = 0;
      if (this.bounces > 0 && this.vy < -0.5) { this.bounces--; this.vy = -this.vy * 0.45; this.vx *= 0.6; this.vz *= 0.6; particles.burst('dust', this.x, 0, this.z, 3, { speed: 1.2 }); }
      else if (this.rest && this.life > 0) { this.vy = 0; this.gravity = 0; this.vx = 0; this.vz = 0; }
      else { this.expire(world, false); return; }
    }
    if (this.life <= 0) { this.expire(world, false); return; }
    if (this.maxDist && Math.abs(this.x - this.startX) >= this.maxDist) { this.expire(world, false); return; }
    const cam = world.camera;
    if (cam && (this.x < cam.x - 200 || this.x > cam.x + VIEW_W + 200)) this.removeMe = true;
  }
  /** Called by combat when the projectile damages a target. */
  onHitTarget(target, world) {
    if (this.style === 'bullet' || this.style === 'shell') particles.burst('spark', this.x, this.y, this.z, 5, { speed: 3 });
    if (typeof this.onHit === 'function') this.onHit(target, world, this);
  }
  /** End of life: explode (if configured), or vanish. */
  expire(world, byHit) {
    if (this.removeMe) return;
    if (this.onExpire === 'explode') {
      world.spawnAreaHit(this.owner, this.x, this.z, this.radius, this.explodeHit || this.hit, null, this.y);
      audio.play('explosion');
      world.addFx('ring', this.x, 0, this.z, { r1: this.radius, flat: true, color: '#ffb060' });
      particles.burst('ember', this.x, this.y + 4, this.z, 10, { speed: 3, up: 2 });
      particles.burst('smoke', this.x, this.y + 4, this.z, 6, { speed: 1.2, up: 1 });
      if (world.camera) world.camera.shake(8, 12); // GDD 7: explosions 8px / 12f
    } else if (typeof this.onExpire === 'function') this.onExpire(world, this, byHit);
    if (this.chained && !byHit) { this.retract = true; this.hit = null; return; }
    this.removeMe = true;
  }
  draw(ctx, cam) {
    const sx = cam.toScreenX(this.x), sy = Math.round(FLOOR_TOP + this.z - this.y + cam.shakeY);
    const ol = '#1a1018';
    switch (this.style) {
      case 'bullet': case 'shell': {
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(-this.vy, this.vx));
        rrect(ctx, -this.r - 6, -this.r * 0.6, this.r * 2 + 6, this.r * 1.2, 2, this.color, ol, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-1, -1, this.r, 1);
        ctx.restore(); break;
      }
      case 'bolt': { ctx.save(); ctx.translate(sx, sy); ctx.rotate(this.spin); rrect(ctx, -this.r, -this.r, this.r * 2, this.r * 2, 1, this.color, ol, 1); ctx.restore(); break; }
      case 'bomb': case 'cannonball': {
        circle(ctx, sx, sy - this.r, this.r, this.color, ol, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(sx - this.r * 0.35, sy - this.r * 1.35, this.r * 0.3, 0, Math.PI * 2); ctx.fill();
        if (this.style === 'bomb') { line(ctx, sx + 2, sy - this.r * 2, sx + 5, sy - this.r * 2 - 5, '#8a6a40', 2); if ((this.life & 4) === 0) circle(ctx, sx + 5, sy - this.r * 2 - 6, 2, '#ffe070', null, 0); }
        break;
      }
      case 'claw': {
        if (this.owner && this.owner.rig) {
          const j = jointScreen(this.owner.rig, 'handN');
          line(ctx, j.x, j.y, sx, sy - this.r, '#3a3a44', 4); line(ctx, j.x, j.y, sx, sy - this.r, '#9a9aa8', 2);
        }
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
      case 'stone': { circle(ctx, sx, sy - this.r, this.r, this.color, ol, 1); break; }
      case 'hat': { ctx.save(); ctx.translate(sx, sy - this.r); ctx.rotate(this.spin * 2); rrect(ctx, -9, -2, 18, 4, 1, this.color, ol, 1); rrect(ctx, -5, -9, 10, 8, 1, this.color, ol, 1); ctx.restore(); break; }
      case 'explosion': default: break; // explosion FX are spawned on creation
    }
  }
}
