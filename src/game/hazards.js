// Stage hazards (GDD section 6): steam / aether vents (rattle tell -> eruption -> launch), crushing pistons (shadow tell),
// the swinging cargo hook, funicular pylon crossbars (horn + shadow tell, back-lane sweep) and environment ZONES:
// the Foundry Row molten channel (z < 20), the funicular railings (front/back 12px, throw-overs are ring-outs),
// the boss dais edge vents (shrinking band) and the cargo-bay conveyor strip (drifts everything left, carries crates).
// Hazards hurt everyone (team NONE area hits); they are `fx` entities (never hit targets) drawn in depth order.
import { FLOOR_TOP, TEAM, VIEW_W, ST, Z_MAX } from '../constants.js';
import { Entity } from './entity.js';
import { Projectile } from './projectile.js';
import { Prop, ringOut } from './items.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { rng } from '../engine/rng.js';
import { rrect, circle, pathPoly } from '../art/shapes.js';
import { tones } from '../art/props.js';

const OL = '#2B2B30';
const AIR_STATES = new Set([ST.KNOCKDOWN, ST.THROWN, ST.HURT_AIR]);
/** Per-type defaults: period / tell / active frames and the hit applied while active. */
export const HAZARD_TYPES = {
  steamVent: { period: 180, tell: 20, active: 60, r: 26, every: 8, color: '#e8f0f4', hit: { damage: 8, type: 'launch', kbX: 2, kbY: 8, hitstun: 20 }, tellSfx: 'vent_tell', sfx: 'steam' },
  aetherVent: { period: 120, tell: 30, active: 40, r: 26, every: 8, color: '#4DF0E0', hit: { damage: 12, type: 'launch', kbX: 2, kbY: 8, hitstun: 20 }, tellSfx: 'vent_tell', sfx: 'steam' },
  piston: { period: 240, tell: 30, active: 10, r: 30, every: 5, color: '#4a4e58', hit: { damage: 18, type: 'knockdown', kbX: 4, kbY: 5, hitstun: 24 }, tellSfx: 'hydraulic', sfx: 'piston_crush' },
  hook: { period: 120, tell: 0, active: 120, r: 18, every: 4, color: '#9a9aa4', hit: { damage: 12, type: 'knockdown', kbX: 5, kbY: 4, hitstun: 22 }, sfx: null, swing: 70 },
  crossbar: { period: 360, tell: 40, active: 12, r: 340, every: 6, color: '#3A3F4B', hit: { damage: 14, type: 'knockdown', kbX: 3, kbY: 5, hitstun: 22, z: 40 }, tellSfx: 'roar', sfx: 'hammer_slam', lane: 40 },
};
const PISTON_UP = 130, CROSSBAR_UP = 260;

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
  get tellStart() { return this.period - this.activeFrames - this.tellFrames; }
  get activeStart() { return this.period - this.activeFrames; }
  update(world) {
    this.world = world;
    this.t = (world.frame + this.offset) % this.period;
    const prev = this.phase;
    this.phase = this.t >= this.activeStart ? 'active' : this.t >= this.tellStart ? 'tell' : 'idle';
    const visible = world.camera.isVisible(this.x, 120);
    if (!visible) return;
    if (this.phase === 'tell' && prev !== 'tell' && this.info.tellSfx) audio.play(this.info.tellSfx);
    if (this.phase === 'active' && prev !== 'active') {
      if (this.info.sfx) audio.play(this.info.sfx);
      if (this.type === 'piston' || this.type === 'crossbar') { world.camera.shake(this.type === 'piston' ? 4 : 6, 8); world.addFx('dust', this.type === 'piston' ? this.x : world.camera.x + VIEW_W / 2, 0, this.type === 'piston' ? this.z : 20, { count: 8 }); }
    }
    if (this.type === 'hook') { this.hitSweep(world); return; }
    if (this.phase === 'tell') {
      if (this.t % 6 === 0 && (this.type === 'steamVent' || this.type === 'aetherVent')) particles.burst('steam', this.x + (this.t % 12 ? 6 : -6), 4, this.z, 1, { speed: 0.4, up: 0.8, color: this.info.color });
      if (this.type === 'piston' && this.t % 8 === 0) particles.burst('dust', this.x + rng.range(-20, 20), 0, this.z + rng.range(-6, 6), 1, { speed: 0.5, up: 0.3 });
      return;
    }
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
    const p = world.spawnAreaHit(null, this.x + this.swingX, this.z, this.info.r, this.info.hit);
    p.y = 30;
  }
  /** Pylon crossbar: sweeps the back lane (z < lane) across the whole screen. */
  laneHit(world) {
    const cam = world.camera;
    world.add(new Projectile({ owner: null, team: TEAM.NONE, x: cam.x + VIEW_W / 2, y: 30, z: 0, r: this.info.r, life: 2, style: 'explosion', hit: this.info.hit, pierce: 99 }));
  }
  draw(ctx, cam) {
    const sx = cam.toScreenX(this.x), sy = Math.round(FLOOR_TOP + this.z + cam.shakeY);
    const info = this.info, f = this.world ? this.world.frame : 0, ph = this.phase;
    switch (this.type) {
      case 'steamVent': case 'aetherVent': {
        const cyan = this.type === 'aetherVent', plate = cyan ? '#8a7a40' : '#4a4e58', tn = tones(plate);
        const rattle = ph === 'tell' ? ((this.t >> 1) & 1 ? 1 : -1) : 0;      // the grate rattles during the tell
        if (cyan && ph !== 'idle') { ctx.globalAlpha = ph === 'tell' ? 0.25 + 0.25 * Math.sin(f * 0.6) : 0.5; ctx.fillStyle = '#4DF0E0'; ctx.beginPath(); ctx.ellipse(sx, sy, 30, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
        rrect(ctx, sx - 20 + rattle, sy - 7, 40, 11, 2, tn.base, OL, 1);
        ctx.fillStyle = tn.sh; ctx.fillRect(sx - 19 + rattle, sy - 1, 38, 4); ctx.fillStyle = tn.hi; ctx.fillRect(sx - 19 + rattle, sy - 6, 38, 1);
        ctx.fillStyle = ph === 'tell' ? ((f & 4) ? (cyan ? '#4DF0E0' : '#ff8a4a') : '#1a1418') : ph === 'active' ? info.color : '#1a1418';
        for (let i = -1; i <= 1; i++) ctx.fillRect(sx + i * 11 - 3 + rattle, sy - 5, 6, 6);
        if (ph === 'active') {
          const k = Math.min(1, (this.t - this.activeStart) / 6), h = (58 + Math.sin(f * 0.5) * 8) * k;
          ctx.globalAlpha = 0.6; ctx.fillStyle = info.color;
          pathPoly(ctx, [sx - 12, sy - 2, sx + 12, sy - 2, sx + 20, sy - h, sx - 20, sy - h]); ctx.fill();
          ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff'; pathPoly(ctx, [sx - 5, sy - 2, sx + 5, sy - 2, sx + 7, sy - h * 0.7, sx - 7, sy - h * 0.7]); ctx.fill();
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'piston': {
        // head height: parked high, creeps down during the tell, slams to the floor, rises again over the next 40f
        let h = PISTON_UP;
        if (ph === 'tell') h = PISTON_UP - (this.t - this.tellStart) / this.tellFrames * 40;
        else if (ph === 'active') h = 0;
        else if (this.t < 40) { const k = this.t / 40; h = PISTON_UP * k * k; }
        const k = ph === 'tell' ? 0.2 + 0.5 * (this.t - this.tellStart) / this.tellFrames : ph === 'active' ? 0.7 : 0.15;
        ctx.globalAlpha = k; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, 32 - 8 * (h / PISTON_UP), 12 - 3 * (h / PISTON_UP), 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        if (ph === 'tell' && (f & 4)) { ctx.strokeStyle = '#ff5c5c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, sy, 32, 12, 0, 0, Math.PI * 2); ctx.stroke(); }
        const top = sy - 44 - h, shaft = tones('#3a3a44'), head = tones(ph === 'active' ? '#6a6e78' : info.color);
        rrect(ctx, sx - 8, top - 240, 16, 240, 2, shaft.base, OL, 1); ctx.fillStyle = shaft.sh; ctx.fillRect(sx + 2, top - 238, 5, 236); ctx.fillStyle = shaft.hi; ctx.fillRect(sx - 6, top - 238, 2, 236);
        rrect(ctx, sx - 32, top, 64, 44, 4, head.base, OL, 1);
        ctx.fillStyle = head.sh; ctx.fillRect(sx - 30, top + 28, 60, 14); ctx.fillStyle = head.hi; ctx.fillRect(sx - 30, top + 2, 60, 2);
        ctx.fillStyle = tones('#C9963A').base; ctx.fillRect(sx - 28, top + 8, 56, 4); ctx.fillStyle = tones('#C9963A').hi; for (let i = 0; i < 6; i++) ctx.fillRect(sx - 26 + i * 10, top + 16, 2, 2);
        if (ph === 'tell' && (f & 2)) { ctx.fillStyle = '#ff5c5c'; ctx.fillRect(sx - 4, top + 34, 8, 4); }
        break;
      }
      case 'hook': {
        const hx = Math.round(sx + this.swingX), top = sy - 230;
        // gantry beam + the chain to the swinging hook
        rrect(ctx, sx - 60, top - 8, 120, 10, 2, tones('#3A3F4B').base, OL, 1); ctx.fillStyle = tones('#C9963A').hi; for (let i = 0; i < 6; i++) ctx.fillRect(sx - 54 + i * 20, top - 4, 2, 2);
        ctx.strokeStyle = '#5a5a62'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(hx, sy - 62); ctx.stroke();
        ctx.fillStyle = '#9a9aa4'; for (let i = 1; i < 10; i++) ctx.fillRect(Math.round(sx + (hx - sx) * i / 10) - 1, Math.round(top + (sy - 62 - top) * i / 10), 2, 4);
        circle(ctx, hx, sy - 58, 6, tones('#C9963A').base, OL, 1);
        ctx.strokeStyle = OL; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(hx, sy - 44, 12, Math.PI * 1.1, Math.PI * 0.3, true); ctx.stroke();
        ctx.strokeStyle = '#9a9aa4'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(hx, sy - 44, 12, Math.PI * 1.1, Math.PI * 0.3, true); ctx.stroke();
        ctx.strokeStyle = '#c8d0d8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hx - 1, sy - 45, 12, Math.PI * 1.15, Math.PI * 0.85, true); ctx.stroke();
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(hx, sy, 14, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        break;
      }
      case 'crossbar': {
        if (ph === 'idle' && this.t >= 30) break;
        const y0 = FLOOR_TOP + cam.shakeY, lane = info.lane;
        let h = CROSSBAR_UP;
        if (ph === 'tell') { const k = (this.t - this.tellStart) / this.tellFrames; h = CROSSBAR_UP * (1 - k * k); }
        else if (ph === 'active') h = 0;
        else h = CROSSBAR_UP * (this.t / 30) * (this.t / 30);
        if (ph === 'tell') {
          ctx.globalAlpha = 0.3 + 0.25 * (1 - h / CROSSBAR_UP); ctx.fillStyle = '#000'; ctx.fillRect(0, y0, VIEW_W, lane); ctx.globalAlpha = 1;
          if (f % 10 < 5) { ctx.fillStyle = '#ff5c5c'; ctx.fillRect(0, y0 + lane - 2, VIEW_W, 2); }
        }
        const by = y0 - 34 - h, bar = tones(info.color);
        rrect(ctx, -10, by, VIEW_W + 20, 26, 3, bar.base, OL, 1);
        ctx.fillStyle = bar.sh; ctx.fillRect(0, by + 16, VIEW_W, 9); ctx.fillStyle = bar.hi; ctx.fillRect(0, by + 1, VIEW_W, 2);
        ctx.fillStyle = tones('#C9963A').base; for (let x = 10; x < VIEW_W; x += 40) ctx.fillRect(x, by + 6, 8, 14);
        ctx.fillStyle = tones('#C9963A').hi; for (let x = 10; x < VIEW_W; x += 40) ctx.fillRect(x + 2, by + 8, 2, 2);
        if (ph === 'active' && (f & 1)) particles.burst('spark', cam.x + rng.range(0, VIEW_W), 30, 10, 1, { speed: 3, up: 1 });
        break;
      }
      default: break;
    }
  }
}

/** Build the Hazard entities for a section's `hazards` list. */
export function createHazards(list = []) { return list.map((h) => new Hazard(h)); }

// ---------------------------------------------------------------- environment zones
const MOLTEN_Z = 20, RAIL = 12, DAIS_EVERY = 20, DAIS_DMG = 5, CONVEYOR_EVERY = 240;
const MOLTEN_HIT = { damage: 10, type: 'knockdown', kbX: 0, kbY: 5, hitstun: 20, sfx: 'burn' };

/**
 * A floor zone with a rule: molten (Foundry Row back edge), rails (funicular railings), daisVents (boss dais edges),
 * conveyor (cargo-bay front strip). Drawn behind entities (z = -5).
 */
export class Zone extends Entity {
  /** @param {{ type: 'molten'|'rails'|'daisVents'|'conveyor', x0: number, x1: number, z0?: number, active?: boolean }} spec */
  constructor(spec) {
    super('fx');
    this.type = spec.type; this.x0 = spec.x0; this.x1 = spec.x1; this.z0 = spec.z0 != null ? spec.z0 : 100;
    this.x = (spec.x0 + spec.x1) / 2; this.z = -5; this.shadowW = 0;
    this.forced = !!spec.active;
    this.burns = new Map();        // fighter id -> { f, ticks, t }
    this.t = 0; this.lastCrate = 0;
  }
  hurtbox() { return null; }
  inX(e) { return e.x >= this.x0 && e.x <= this.x1; }
  /** The zone applies only while its arena's boss is up (conveyor / dais) or always (molten / rails). */
  get active() {
    if (this.forced) return true;
    const b = this.world && this.world.boss;
    if (this.type === 'conveyor') return !!(b && b.bossKind === 'midboss' && !b.defeated);
    if (this.type === 'daisVents') return !!(b && b.bossKind === 'boss' && !b.defeated);
    return true;
  }
  update(world) {
    this.world = world; this.t++;
    switch (this.type) {
      case 'molten': this.updateMolten(world); break;
      case 'rails': this.updateRails(world); break;
      case 'daisVents': this.updateDais(world); break;
      case 'conveyor': this.updateConveyor(world); break;
      default: break;
    }
  }
  updateMolten(world) {
    for (const f of world.fighters) {
      if (!this.inX(f) || f.z >= MOLTEN_Z || f.grabbedBy) continue;
      if (f.kind === 'player') {
        if (!f.dead) { f.takeHit(MOLTEN_HIT, null); this.burns.set(f.id, { f, ticks: 3, t: 0 }); }
        f.z = MOLTEN_Z + 2; f.vz = 3;
        particles.burst('ember', f.x, 6, f.z, 8, { speed: 3, up: 3, color: '#FFB347' });
      } else if (f.kind === 'boss') { f.z = MOLTEN_Z + 1; }
      else if (AIR_STATES.has(f.state) || f.airborne || f.state === ST.LYING) ringOut(world, f, 'molten');
      else f.z = MOLTEN_Z + 1;
    }
    for (const b of this.burns.values()) {
      if (++b.t % 20 === 0) { b.f.takeHitRaw(2, 'light'); particles.burst('ember', b.f.x, 20, b.f.z, 3, { speed: 1.5, up: 2 }); if (--b.ticks <= 0 || b.f.dead) this.burns.delete(b.f.id); }
    }
    // items that fell into the channel drift back to the lip so drops from ring-outs stay collectable
    if ((this.t & 3) === 0) for (const e of world.entities) if (e.kind === 'item' && this.inX(e) && e.z < MOLTEN_Z + 4) e.z = MOLTEN_Z + 6;
  }
  updateRails(world) {
    for (const f of world.fighters) {
      if (!this.inX(f)) continue;
      const over = f.z < RAIL ? -1 : f.z > Z_MAX - RAIL ? 1 : 0;
      if (!over) continue;
      if (f.kind === 'enemy' && (f.state === ST.THROWN || (f.state === ST.KNOCKDOWN && f.y > 30))) { ringOut(world, f, 'rail', over); continue; }
      f.z = over < 0 ? RAIL : Z_MAX - RAIL;
      if (f.vz * over > 0) f.vz = 0;
    }
  }
  /** Boss dais (GDD 5.2): the world's floor band shrinks 20px per phase (stage.js calls shrinkBand); the closed strips are steam
   *  vents: 5 dmg every 20f to anyone inside, jets along both edges. */
  updateDais(world) {
    if (!this.active) return;
    const band = world.floorBand || { z0: 0, z1: Z_MAX };
    if (band.z0 <= 0 && band.z1 >= Z_MAX) return;
    if ((this.t & 1) === 0) {
      const x = world.camera.x + rng.range(10, VIEW_W - 10), back = rng.chance(0.5);
      particles.burst('steam', x, 4, back ? rng.range(0, band.z0) : rng.range(band.z1, Z_MAX), 1, { speed: 0.6, up: 2.4, color: '#d8fffb', sizeJitter: 1 });
    }
    if (this.t % DAIS_EVERY) return;
    for (const f of world.fighters) {
      if (f.kind === 'boss' || f.dead || !this.inX(f)) continue;
      if (f.z < band.z0 || f.z > band.z1) { f.takeHitRaw(DAIS_DMG, 'light'); particles.burst('steam', f.x, 20, f.z, 4, { speed: 1.5, up: 2.5 }); }
    }
  }
  updateConveyor(world) {
    if (!this.active) return;
    for (const e of world.entities) {
      if (e.removeMe || e.z < this.z0 || !this.inX(e)) continue;
      const k = e.kind;
      if (k === 'player' || k === 'enemy' || k === 'boss') { if (!e.grabbedBy && e.y <= 0 && e.state !== ST.DEAD) e.x -= 1; }
      else if (k === 'prop' || k === 'item') {
        if (k === 'prop' && (e.state === 'breaking' || e.state === 'rolling')) continue;
        e.x -= 1;
        if (e.rider && e.x < this.x0 + 8) { e.removeMe = true; particles.burst('dust', e.x, 0, e.z, 5, { speed: 1.5, up: 1 }); }
      }
    }
    if (this.t - this.lastCrate >= CONVEYOR_EVERY) {
      this.lastCrate = this.t;
      world.add(new Prop('crate', this.x1 - 20, this.z0 + 20, { drops: rng.chance(0.25) ? 'meatPie' : ['brassCog', 'brassCog'], rider: true }));
      audio.play('hydraulic');
    }
  }
  draw(ctx, cam) {
    const sy0 = FLOOR_TOP + cam.shakeY, f = this.t;
    const x0 = Math.max(0, cam.toScreenX(this.x0)), x1 = Math.min(VIEW_W, cam.toScreenX(this.x1));
    if (x1 <= x0) return;
    if (this.type === 'molten') {
      // heat haze + surface glints over the backdrop's channel band
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(f * 0.1); ctx.fillStyle = '#ffd27a'; ctx.fillRect(x0, sy0, x1 - x0, MOLTEN_Z); ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let x = x0 + ((f >> 1) % 40); x < x1; x += 40) ctx.fillRect(x, sy0 + 6 + ((x >> 3) & 6), 6, 1);
      if ((f & 7) === 0) { const ex = this.x0 + ((f * 37) % (this.x1 - this.x0)); if (cam.isVisible(ex, 0)) particles.burst('ember', ex, 4, 10, 1, { speed: 0.8, up: 1.4 }); }
    } else if (this.type === 'daisVents' && this.active) {
      // cyan glow lines along the closed band edges (the world paints the vent strips themselves)
      const band = this.world.floorBand || { z0: 0, z1: Z_MAX };
      ctx.fillStyle = '#4DF0E0'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(f * 0.3);
      if (band.z0 > 0) ctx.fillRect(x0, sy0 + band.z0 - 1, x1 - x0, 2);
      if (band.z1 < Z_MAX) ctx.fillRect(x0, sy0 + band.z1 - 1, x1 - x0, 2);
      ctx.globalAlpha = 1;
    } else if (this.type === 'conveyor') {
      // belt over the front strip: dark rubber with brass chevrons that scroll left while it runs, rollers at the edges
      const y = sy0 + this.z0, h = Z_MAX - this.z0, belt = tones('#2a2a30');
      ctx.globalAlpha = 0.9; ctx.fillStyle = belt.base; ctx.fillRect(x0, y, x1 - x0, h);
      ctx.fillStyle = belt.hi; ctx.fillRect(x0, y, x1 - x0, 2); ctx.fillStyle = belt.sh; ctx.fillRect(x0, y + h - 4, x1 - x0, 4);
      const off = this.active ? (f % 24) : 0;
      ctx.fillStyle = tones('#C9963A').sh;
      for (let x = x0 - 24 + (24 - off); x < x1; x += 24) { pathPoly(ctx, [x, y + 6, x + 8, y + 6, x + 16, y + h / 2, x + 8, y + h - 6, x, y + h - 6, x + 8, y + h / 2]); ctx.fill(); }
      for (let x = x0 + 4; x < x1; x += 60) rrect(ctx, x, y - 4, 8, h + 8, 3, '#4a4a52', OL, 1);
      ctx.globalAlpha = 1;
    }
  }
}

/** Build the Zone entities for a section's `zones` list. */
export function createZones(list = []) { return list.map((z) => new Zone(z)); }
