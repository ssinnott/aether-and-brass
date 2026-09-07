// Pickups (food, score, meter, 1-UP) and breakable props (crates, barrels) — GDD section 7 pickups, ARCHITECTURE section 6.
import { FLOOR_TOP, GRAVITY, TEAM, HITSTOP, METER, UI } from '../constants.js';
import { Entity } from './entity.js';
import { audio } from '../engine/audio.js';
import { rng } from '../engine/rng.js';
import { floatText, burstBreak } from '../art/fx.js';
import { rrect, circle, gear, pathPoly, paint, line } from '../art/shapes.js';
import { PROP_TYPES, getPropType } from '../art/props.js';

/** Pickup catalogue (GDD 7). hp = fraction of max HP, meter = points, score = points, life = extra lives. */
export const PICKUPS = Object.freeze({
  meatPie: { name: 'MEAT PIE', hp: 0.25, sfx: 'pickup_food' },
  roastBird: { name: 'ROAST BIRD', hp: 0.6, sfx: 'pickup_food' },
  brassCog: { name: 'BRASS COG', score: 200, sfx: 'pickup_score' },
  coalScrip: { name: 'COAL SCRIP', score: 500, sfx: 'pickup_score' },
  aetherVial: { name: 'AETHER VIAL', meter: METER.bar, sfx: 'pickup_meter' },
  goldenSprocket: { name: 'GOLDEN SPROCKET', meter: METER.bar, score: 1000, sfx: 'pickup_meter' },
  brassHeart: { name: 'BRASS HEART', life: 1, sfx: 'pickup_life' },
});
/** Aliases used by enemy/stage `drops` fields. */
const DROP_ALIASES = { none: null, meter: 'aetherVial', food_small: 'meatPie', food_big: 'roastBird', food: 'meatPie', score: 'brassCog', score_big: 'coalScrip', life: 'brassHeart' };
const PICKUP_LIFE = 600, PICKUP_BLINK = 120;

/** Walk-over pickup. */
export class Pickup extends Entity {
  constructor(type, x, z, { pop = true } = {}) {
    super('item');
    this.type = PICKUPS[type] ? type : 'brassCog';
    this.info = PICKUPS[this.type];
    this.x = x; this.z = z; this.y = pop ? 1 : 0;
    this.vy = pop ? 4 : 0; this.vx = pop ? rng.range(-1.2, 1.2) : 0;
    this.life = PICKUP_LIFE; this.w = 16; this.h = 14; this.zSize = 24; this.shadowW = 16;
  }
  update(world) {
    this.world = world;
    if (--this.life <= 0) { this.removeMe = true; return; }
    if (this.y > 0 || this.vy > 0) { this.y += this.vy; this.vy -= GRAVITY; if (this.y <= 0) { this.y = 0; this.vy = this.vy < -1.5 ? -this.vy * 0.4 : 0; this.vx *= 0.5; } }
    this.x += this.vx; if (this.y <= 0) this.vx *= 0.9;
    const b = world.boundsFor(this); if (this.x < b.x0) this.x = b.x0; if (this.x > b.x1) this.x = b.x1;
    for (const p of world.players) {
      if (!p.alive || p.dead || p.removeMe || p.y > 24) continue;
      if (Math.abs(p.x - this.x) < 18 && Math.abs(p.z - this.z) < 14) { this.collect(p, world); return; }
    }
  }
  collect(p, world) {
    const i = this.info;
    let label = i.name;
    if (i.hp) { const heal = Math.round(p.maxHp * i.hp); p.hp = Math.min(p.maxHp, p.hp + heal); label = '+' + heal; }
    if (i.meter && p.addMeter) { p.addMeter(i.meter); label = '+1 BAR'; }
    if (i.score && p.addScore) { p.addScore(i.score, false); label = '+' + i.score; }
    if (i.life) { p.lives = (p.lives || 0) + 1; label = '1-UP'; }
    floatText(this.x, this.y + 20, this.z, label, i.life ? UI.green : i.meter ? UI.meter : UI.brassLight, 1);
    audio.play(i.sfx || 'pickup_score');
    this.removeMe = true;
  }
  hurtbox() { return null; }
  draw(ctx, cam) {
    if (this.life < PICKUP_BLINK && (this.life % 8) < 4) return;
    const bob = Math.round(Math.sin(this.life * 0.15) * 1.5);
    const sx = cam.toScreenX(this.x), sy = Math.round(FLOOR_TOP + this.z - this.y + cam.shakeY) - 8 + bob;
    const ol = '#1a1018';
    switch (this.type) {
      case 'meatPie': rrect(ctx, sx - 8, sy - 3, 16, 8, 3, '#c98a3a', ol, 1); rrect(ctx, sx - 6, sy - 6, 12, 5, 2, '#e8b060', ol, 1); ctx.fillStyle = '#8a4a1a'; ctx.fillRect(sx - 2, sy - 5, 4, 2); break;
      case 'roastBird': rrect(ctx, sx - 8, sy - 6, 14, 11, 5, '#c26a2a', ol, 1); line(ctx, sx + 4, sy - 1, sx + 10, sy - 6, '#f0e0c0', 3); circle(ctx, sx + 10, sy - 6, 2, '#f0e0c0', ol, 1); break;
      case 'brassCog': gear(ctx, sx, sy, 8, 8, UI.brass, ol, 1, this.life * 0.05, 2.5); break;
      case 'coalScrip': rrect(ctx, sx - 8, sy - 5, 16, 10, 1, '#d8cfa8', ol, 1); ctx.fillStyle = '#3a3a3a'; ctx.fillRect(sx - 5, sy - 2, 10, 1); ctx.fillRect(sx - 5, sy + 1, 7, 1); break;
      case 'aetherVial': rrect(ctx, sx - 4, sy - 6, 8, 12, 2, '#4DF0E0', ol, 1); rrect(ctx, sx - 2, sy - 9, 4, 4, 1, '#8a6a40', ol, 1); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(sx - 3, sy - 4, 1, 6); break;
      case 'goldenSprocket': gear(ctx, sx, sy, 9, 10, '#ffd84a', ol, 1, -this.life * 0.05, 3, '#fff4b0'); break;
      case 'brassHeart': pathPoly(ctx, [sx, sy + 7, sx - 8, sy - 1, sx - 5, sy - 6, sx, sy - 3, sx + 5, sy - 6, sx + 8, sy - 1]); paint(ctx, '#e8b040', ol, 1); ctx.fillStyle = '#fff0b0'; ctx.fillRect(sx - 4, sy - 3, 2, 2); break;
      default: circle(ctx, sx, sy, 6, '#ffffff', ol, 1);
    }
  }
}

/** Breakable (or static) stage prop from the art/props.js catalogue. Takes hits from any team, drops items. */
export class Prop extends Entity {
  constructor(type, x, z, { drops = null, hp = 0, solid = true } = {}) {
    super('prop');
    this.type = PROP_TYPES[type] ? type : 'crate';
    this.info = getPropType(this.type);
    this.team = TEAM.NONE;
    this.x = x; this.z = z;
    this.maxHp = hp || this.info.hp || 20;
    this.hp = this.maxHp;
    this.solid = solid && this.maxHp > 0;
    this.drops = drops;
    this.w = this.info.w; this.h = this.info.h; this.zSize = 18; this.shadowW = Math.min(40, this.w + 6);
    this.flashTimer = 0; this.wobble = 0; this.hitstop = 0;
  }
  update(world) { this.world = world; if (this.flashTimer > 0) this.flashTimer--; if (this.wobble > 0) this.wobble--; }
  hurtbox() { return this.solid && this.alive ? super.hurtbox() : null; }
  /** Damage the prop. Returns true when the hit counted. */
  takeHit(hit, attacker) {
    if (!this.alive || !this.solid) return false;
    this.hp -= Math.max(1, Math.round(hit.damage || 1));
    this.flashTimer = 4; this.wobble = 10;
    if (attacker) attacker.hitstop = Math.max(attacker.hitstop || 0, HITSTOP.light);
    if (this.hp <= 0) this.break(attacker);
    return true;
  }
  break(attacker) {
    this.alive = false; this.removeMe = true;
    burstBreak(this.x, this.y + 8, this.z, this.info.color || '#8a6a40', 8);
    audio.play('prop_break');
    if (attacker && attacker.addScore) attacker.addScore(50, true);
    if (this.world) {
      spawnDrops(this.world, this.x, this.z, this.drops || this.info.drops);
      const ex = this.info.explode;
      if (ex) this.world.spawnProjectile({ owner: null, team: TEAM.NONE, style: 'bomb', x: this.x, y: 0, z: this.z, life: ex.delay, rest: true, gravity: 0, hit: null, onExpire: 'explode',
        radius: ex.radius, explodeHit: { damage: ex.damage, type: 'knockdown', kbX: 5, kbY: 5, friendly: true }, color: '#8a2e2e', r: 7 });
    }
  }
  draw(ctx, cam) {
    const sx = cam.toScreenX(this.x), sy = Math.round(FLOOR_TOP + this.z - this.y + cam.shakeY);
    ctx.save();
    if (this.wobble > 0) ctx.translate(sx, sy), ctx.rotate(Math.sin(this.wobble * 1.2) * 0.06), ctx.translate(-sx, -sy);
    this.info.draw(ctx, sx, sy, this, this.world ? this.world.frame : 0);
    ctx.restore();
  }
}

/**
 * Spawn drops at (x, z). `drops` may be a pickup id, an alias ('meter', 'food_small', ...), an array of those, or null.
 */
export function spawnDrops(world, x, z, drops) {
  if (!drops) return;
  const list = Array.isArray(drops) ? drops : [drops];
  let i = 0;
  for (const d of list) {
    const id = DROP_ALIASES[d] !== undefined ? DROP_ALIASES[d] : d;
    if (!id || !PICKUPS[id]) continue;
    const p = new Pickup(id, x + i * 6, z);
    p.vx = (i % 2 ? 1 : -1) * (0.8 + i * 0.4);
    world.add(p);
    i++;
  }
}
