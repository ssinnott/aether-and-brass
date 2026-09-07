// Stage hazards (GDD section 6): steam / aether vents, crushing pistons, swinging cargo hook, funicular pylon crossbars.
// Hazards hurt everyone (team NONE area hits); they are `fx` entities (never hit targets) drawn in depth order.
import { FLOOR_TOP, TEAM, VIEW_W } from '../constants.js';
import { Entity } from './entity.js';
import { Projectile } from './projectile.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { rrect, circle, line, pathPoly, paint } from '../art/shapes.js';

const OL = '#2B2B30';
/** Per-type defaults: period / tell / active frames and the hit applied while active. */
export const HAZARD_TYPES = {
  steamVent: { period: 180, tell: 20, active: 60, r: 26, every: 8, color: '#e8f0f4', hit: { damage: 8, type: 'launch', kbX: 2, kbY: 8, hitstun: 20 }, tellSfx: 'vent_tell', sfx: 'steam' },
  aetherVent: { period: 180, tell: 30, active: 40, r: 26, every: 8, color: '#4DF0E0', hit: { damage: 12, type: 'launch', kbX: 2, kbY: 8, hitstun: 20 }, tellSfx: 'vent_tell', sfx: 'steam' },
  piston: { period: 240, tell: 30, active: 10, r: 30, every: 5, color: '#4a4e58', hit: { damage: 18, type: 'knockdown', kbX: 4, kbY: 5, hitstun: 24 }, tellSfx: 'hydraulic', sfx: 'piston_crush' },
  hook: { period: 120, tell: 0, active: 120, r: 18, every: 4, color: '#9a9aa4', hit: { damage: 12, type: 'knockdown', kbX: 5, kbY: 4, hitstun: 22 }, sfx: null, swing: 70 },
  crossbar: { period: 360, tell: 40, active: 12, r: 340, every: 6, color: '#3A3F4B', hit: { damage: 14, type: 'knockdown', kbX: 3, kbY: 5, hitstun: 22, z: 40 }, tellSfx: 'roar', sfx: 'hammer_slam', lane: 40 },
};

/** A cyclic stage hazard placed at world (x, z). */
export class Hazard extends Entity {
  /**
   * @param {{ type: string, x: number, z: number, period?: number, active?: number, tell?: number, offset?: number }} spec
   */
  constructor(spec) {
    super('fx');
    this.info = HAZARD_TYPES[spec.type] || HAZARD_TYPES.steamVent;
    this.type = spec.type;
    this.x = spec.x; this.z = spec.z != null ? spec.z : 100;
    this.period = spec.period || this.info.period;
    this.activeFrames = spec.active || this.info.active;
    this.tellFrames = spec.tell != null ? spec.tell : this.info.tell;
    this.offset = spec.offset || 0;
    this.shadowW = 0;
    this.phase = 'idle'; this.t = 0; this.lastHit = -99;
    this.zSize = this.info.r;
  }
  hurtbox() { return null; }
  /** Screen-relative sweep position for the hook (px from x). */
  get swingX() { return Math.sin((this.t / this.period) * Math.PI * 2) * (this.info.swing || 0); }
  update(world) {
    this.world = world;
    this.t = (world.frame + this.offset) % this.period;
    const tellStart = this.period - this.activeFrames - this.tellFrames, activeStart = this.period - this.activeFrames;
    const prev = this.phase;
    this.phase = this.t >= activeStart ? 'active' : this.t >= tellStart ? 'tell' : 'idle';
    const visible = world.camera.isVisible(this.x, 120);
    if (!visible) return;
    if (this.phase === 'tell' && prev !== 'tell' && this.info.tellSfx) audio.play(this.info.tellSfx);
    if (this.phase === 'active' && prev !== 'active') {
      if (this.info.sfx) audio.play(this.info.sfx);
      if (this.type === 'piston' || this.type === 'crossbar') world.camera.shake(this.type === 'piston' ? 4 : 6, 8);
    }
    if (this.type === 'hook') { this.hitSweep(world); return; }
    if (this.phase === 'tell' && this.t % 6 === 0 && this.type !== 'piston' && this.type !== 'crossbar') particles.burst('steam', this.x, 4, this.z, 1, { speed: 0.4, up: 0.8, color: this.info.color });
    if (this.phase === 'active') {
      if (this.type === 'crossbar') { if (world.frame - this.lastHit >= this.info.every) { this.lastHit = world.frame; this.laneHit(world); } return; }
      if (this.type !== 'piston' && this.t % 3 === 0) particles.burst('steam', this.x, 10, this.z, 2, { speed: 1, up: 3.5, spread: 0.6, color: this.info.color, sizeJitter: 1.5 });
      if (world.frame - this.lastHit >= this.info.every) { this.lastHit = world.frame; world.spawnAreaHit(null, this.x, this.z, this.info.r, this.info.hit); }
    }
  }
  /** Swinging hook: a moving area hit along its arc. */
  hitSweep(world) {
    if (world.frame - this.lastHit < this.info.every) return;
    this.lastHit = world.frame;
    const hx = this.x + this.swingX;
    const p = world.spawnAreaHit(null, hx, this.z, this.info.r, this.info.hit);
    p.y = 30;
  }
  /** Pylon crossbar: sweeps the back lane (z < lane) across the whole screen. */
  laneHit(world) {
    const cam = world.camera;
    world.add(new Projectile({ owner: null, team: TEAM.NONE, x: cam.x + VIEW_W / 2, y: 30, z: 0, r: this.info.r, life: 2, style: 'explosion', hit: this.info.hit, pierce: 99 }));
  }
  draw(ctx, cam) {
    const sx = cam.toScreenX(this.x), sy = Math.round(FLOOR_TOP + this.z + cam.shakeY);
    const info = this.info, f = this.world ? this.world.frame : 0;
    switch (this.type) {
      case 'steamVent': case 'aetherVent': {
        const cyan = this.type === 'aetherVent';
        rrect(ctx, sx - 16, sy - 6, 32, 10, 3, cyan ? '#8a7a40' : '#4a4e58', OL, 2);
        ctx.fillStyle = this.phase === 'tell' ? (f % 8 < 4 ? (cyan ? '#4DF0E0' : '#ff8a4a') : '#1a1418') : this.phase === 'active' ? info.color : '#1a1418';
        for (let i = -1; i <= 1; i++) ctx.fillRect(sx + i * 8 - 2, sy - 4, 4, 5);
        if (this.phase === 'active') {
          const h = 60 + Math.sin(f * 0.5) * 8;
          ctx.globalAlpha = 0.55; ctx.fillStyle = info.color;
          pathPoly(ctx, [sx - 10, sy - 2, sx + 10, sy - 2, sx + 16, sy - h, sx - 16, sy - h]); ctx.fill();
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'piston': {
        const drop = this.phase === 'active' ? 0 : this.phase === 'tell' ? 120 - (this.t - (this.period - this.activeFrames - this.tellFrames)) * 0.5 : 120;
        // shadow tell
        const k = this.phase === 'tell' ? 0.25 + 0.5 * (1 - drop / 120) : this.phase === 'active' ? 0.6 : 0.15;
        ctx.globalAlpha = k; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, 30, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        const top = sy - 40 - drop;
        rrect(ctx, sx - 6, top - 200, 12, 200, 2, '#3a3a44', OL, 2);
        rrect(ctx, sx - 28, top, 56, 40, 4, this.phase === 'active' ? '#6a6e78' : info.color, OL, 2);
        ctx.fillStyle = '#C9963A'; ctx.fillRect(sx - 24, top + 4, 48, 3);
        break;
      }
      case 'hook': {
        const hx = Math.round(sx + this.swingX);
        line(ctx, sx, sy - 220, hx, sy - 60, '#5a5a62', 3);
        ctx.strokeStyle = '#9a9aa4'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(hx, sy - 44, 12, Math.PI * 1.1, Math.PI * 0.3, true); ctx.stroke();
        circle(ctx, hx, sy - 56, 5, '#C9963A', OL, 1);
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(hx, sy, 14, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        break;
      }
      case 'crossbar': {
        if (this.phase === 'idle') break;
        const y0 = FLOOR_TOP + cam.shakeY;
        if (this.phase === 'tell') {
          ctx.globalAlpha = 0.25 + 0.2 * Math.sin(f * 0.6); ctx.fillStyle = '#000'; ctx.fillRect(0, y0, VIEW_W, info.lane); ctx.globalAlpha = 1;
          if (f % 10 < 5) { ctx.fillStyle = '#ff5c5c'; ctx.fillRect(0, y0 + info.lane - 2, VIEW_W, 2); }
        } else {
          rrect(ctx, -10, y0 - 40, VIEW_W + 20, 24, 3, info.color, OL, 2);
          ctx.fillStyle = '#C9963A'; for (let x = 10; x < VIEW_W; x += 40) ctx.fillRect(x, y0 - 34, 6, 12);
        }
        break;
      }
      default: break;
    }
  }
}

/** Build the Hazard entities for a section's `hazards` list. */
export function createHazards(list = []) { return list.map((h) => new Hazard(h)); }
