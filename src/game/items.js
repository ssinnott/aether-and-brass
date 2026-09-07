// Pickups (food, score, meter, 1-UP) and breakable props (GDD section 6 props, section 7 pickups; ARCHITECTURE section 6).
// Props take hits from any team, roll (barrels, coal carts), explode after breaking (oil drums), fall on a jump attack
// (chandelier) and stun the Regent Engine (pressure valves); every break plays a split-pieces animation + debris.
import { FLOOR_TOP, GRAVITY, TEAM, HITSTOP, METER, UI, ST } from '../constants.js';
import { Entity } from './entity.js';
import { Projectile } from './projectile.js';
import { audio } from '../engine/audio.js';
import { rng } from '../engine/rng.js';
import { particles } from '../engine/particles.js';
import { floatText, burstBreak } from '../art/fx.js';
import { rrect, circle, gear, pathPoly, paint, line } from '../art/shapes.js';
import { PROP_TYPES, getPropType, drawProp, drawPieces, tones } from '../art/props.js';

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
const OL = '#2B2B30';
const BREAK_FRAMES = 16, ROLL_FRAMES = 20, PROP_SCORE = 50, RING_OUT_SCORE = 200;

/** Walk-over pickup. `life` in frames (GDD: vanish at 10s). */
export class Pickup extends Entity {
  constructor(type, x, z, { pop = true, life = PICKUP_LIFE } = {}) {
    super('item');
    this.type = PICKUPS[type] ? type : 'brassCog';
    this.info = PICKUPS[this.type];
    this.x = x; this.z = z; this.y = pop ? 1 : 0;
    this.vy = pop ? 4 : 0; this.vx = pop ? rng.range(-1.2, 1.2) : 0;
    this.life = life; this.w = 16; this.h = 14; this.zSize = 24; this.shadowW = 16;
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
    floatText(this.x, this.y + 20, this.z, label, i.life ? UI.green : i.meter ? UI.meter : i.hp ? UI.green : UI.brassLight, i.life || i.score >= 1000 ? 2 : 1);
    particles.burst('spark', this.x, this.y + 10, this.z, 6, { speed: 2, up: 1.5, color: i.meter ? '#4DF0E0' : '#fff6c0' });
    audio.play(i.sfx || 'pickup_score');
    this.removeMe = true;
  }
  hurtbox() { return null; }
  draw(ctx, cam) {
    if (this.life < PICKUP_BLINK && (this.life % 8) < 4) return;
    const bob = Math.round(Math.sin(this.life * 0.15) * 1.5);
    const sx = cam.toScreenX(this.x), sy = Math.round(FLOOR_TOP + this.z - this.y + cam.shakeY) - 8 + bob;
    switch (this.type) {
      case 'meatPie': { // golden crust with a shadow band, steam slit
        rrect(ctx, sx - 9, sy - 3, 18, 9, 3, '#c98a3a', OL, 1); ctx.fillStyle = tones('#c98a3a').sh; ctx.fillRect(sx - 8, sy + 2, 16, 3);
        rrect(ctx, sx - 7, sy - 7, 14, 6, 3, '#e8b060', OL, 1); ctx.fillStyle = tones('#e8b060').hi; ctx.fillRect(sx - 5, sy - 6, 6, 1);
        ctx.fillStyle = '#8a4a1a'; ctx.fillRect(sx - 2, sy - 5, 4, 2); break;
      }
      case 'roastBird': { // roast on a platter, drumstick bone
        rrect(ctx, sx - 10, sy + 2, 20, 4, 2, '#d8d8d8', OL, 1);
        rrect(ctx, sx - 8, sy - 8, 14, 12, 5, '#c26a2a', OL, 1); ctx.fillStyle = tones('#c26a2a').sh; ctx.fillRect(sx - 6, sy, 10, 3); ctx.fillStyle = tones('#c26a2a').hi; ctx.fillRect(sx - 5, sy - 7, 5, 1);
        line(ctx, sx + 4, sy - 3, sx + 10, sy - 9, '#f0e0c0', 3); circle(ctx, sx + 10, sy - 9, 2, '#f0e0c0', OL, 1); break;
      }
      case 'brassCog': gear(ctx, sx, sy, 8, 8, UI.brass, OL, 1, this.life * 0.05, 2.5, tones(UI.brass).sh); ctx.fillStyle = '#fff0b0'; ctx.fillRect(sx - 3, sy - 5, 2, 2); break;
      case 'coalScrip': { // paper note with a coal stamp
        rrect(ctx, sx - 9, sy - 6, 18, 12, 1, '#d8cfa8', OL, 1); ctx.fillStyle = tones('#d8cfa8').sh; ctx.fillRect(sx - 8, sy + 2, 16, 3);
        ctx.fillStyle = '#3a3a3a'; ctx.fillRect(sx - 6, sy - 3, 8, 1); ctx.fillRect(sx - 6, sy, 5, 1); circle(ctx, sx + 5, sy - 1, 2.5, '#1a1418', '#8a4a1a', 1); break;
      }
      case 'aetherVial': { // glass vial of cyan aether with a cork; Concordat cyan is allowed on pickups
        rrect(ctx, sx - 4, sy - 5, 8, 13, 3, '#4DF0E0', OL, 1); ctx.fillStyle = tones('#4DF0E0').sh; ctx.fillRect(sx + 1, sy - 2, 2, 8);
        rrect(ctx, sx - 2, sy - 9, 4, 5, 1, '#8a6a40', OL, 1); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(sx - 2, sy - 3, 1, 6);
        if ((this.life % 30) < 15) { ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 1, sy + 3, 2, 1); } break;
      }
      case 'goldenSprocket': gear(ctx, sx, sy, 10, 10, '#ffd84a', OL, 1, -this.life * 0.05, 3, '#fff4b0'); ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 4, sy - 6, 2, 2); break;
      case 'brassHeart': { // brass heart with a beating glow
        const k = (this.life % 40) < 6 ? 1 : 0;
        pathPoly(ctx, [sx, sy + 8 + k, sx - 9, sy - 1, sx - 6, sy - 7, sx, sy - 3, sx + 6, sy - 7, sx + 9, sy - 1]); paint(ctx, k ? '#ffd870' : '#e8b040', OL, 1);
        ctx.fillStyle = tones('#e8b040').sh; ctx.fillRect(sx - 3, sy + 2, 6, 3); ctx.fillStyle = '#fff0b0'; ctx.fillRect(sx - 5, sy - 4, 2, 2); break;
      }
      default: circle(ctx, sx, sy, 6, '#ffffff', OL, 1);
    }
  }
}

/** Breakable (or static) stage prop from the art/props.js catalogue. Takes hits from any team, drops items. */
export class Prop extends Entity {
  /**
   * @param {string} type PROP_TYPES key
   * @param {{ drops?: string|string[]|null, hp?: number, solid?: boolean, rider?: boolean }} o rider = travels on the cargo-bay conveyor
   */
  constructor(type, x, z, { drops = null, hp = 0, solid = true, rider = false } = {}) {
    super('prop');
    this.type = PROP_TYPES[type] ? type : 'crate';
    this.info = getPropType(this.type);
    this.team = TEAM.NONE;
    this.x = x; this.z = z;
    this.maxHp = hp || this.info.hp || 20;
    this.hp = this.maxHp;
    this.solid = solid && this.maxHp > 0;
    this.drops = drops !== null ? drops : this.info.drops;
    this.w = this.info.w; this.h = this.info.h; this.zSize = 18; this.shadowW = Math.min(44, this.w + 6);
    this.yOff = this.info.yOff || 0;
    this.hangY = this.yOff;                  // chandelier: current height of the body
    this.flashTimer = 0; this.wobble = 0; this.hitstop = 0;
    this.state = 'idle'; this.t = 0; this.angle = 0;
    this.vx = 0; this.rollLeft = 0; this.breaker = null; this.rider = rider;
    this.spent = false;
  }
  update(world) {
    this.world = world;
    if (this.flashTimer > 0) this.flashTimer--;
    if (this.wobble > 0) this.wobble--;
    this.t++;
    switch (this.state) {
      case 'rolling': this.updateRoll(world); break;
      case 'breaking': if (this.t >= BREAK_FRAMES) this.removeMe = true; break;
      case 'fuse': {
        const ex = this.info.explode;
        if (this.t % 4 === 0) particles.burst('smoke', this.x, this.h * 0.8, this.z, 1, { speed: 0.5, up: 1.2 });
        if (this.t % 3 === 0) particles.burst('ember', this.x + (this.t % 5 - 2) * 3, this.h * 0.6, this.z, 1, { speed: 1.2, up: 2 });
        if (this.t >= ex.delay) this.explode(world, ex);
        break;
      }
      case 'falling': {
        this.hangY -= 5 + this.t * 0.6;
        if (this.hangY <= 0) { this.hangY = 0; this.land(world); }
        break;
      }
      default: break;
    }
  }
  hurtbox() {
    if (!this.alive || !this.solid || (this.state !== 'idle' && this.state !== 'rolling')) return null;
    const y0 = this.yOff;
    return { x0: this.x - this.w / 2, x1: this.x + this.w / 2, y0, y1: y0 + this.h, z0: this.z - this.zSize / 2, z1: this.z + this.zSize / 2 };
  }
  /** Can `attacker` damage this prop right now (chandelier: jump attacks only; valves: only while the Regent Engine is in phase 1/2). */
  canBeHitBy(attacker) {
    const info = this.info;
    if (info.jumpOnly && !(attacker && (attacker.state === ST.JUMP_ATTACK || (attacker.kind === 'projectile' && attacker.owner && attacker.owner.state === ST.JUMP_ATTACK)))) return false;
    if (info.valve) {
      const b = this.world && this.world.boss, striker = attacker && attacker.kind === 'projectile' ? attacker.owner : attacker;
      if (!b || b.bossKind !== 'boss' || b.defeated || b.phaseIndex > 1) return false;
      if (!striker || striker.team !== TEAM.PLAYER) return false; // the Engine's own stomps must not waste the valves
    }
    return true;
  }
  /** Damage the prop. Returns true when the hit counted. */
  takeHit(hit, attacker) {
    if (!this.alive || !this.solid || this.state === 'breaking' || this.state === 'fuse' || this.state === 'falling') return false;
    if (!this.canBeHitBy(attacker)) return false;
    this.hp -= Math.max(1, Math.round(hit.damage || 1));
    this.flashTimer = 4; this.wobble = 10;
    if (attacker && attacker.kind !== 'projectile') attacker.hitstop = Math.max(attacker.hitstop || 0, HITSTOP.light);
    const striker = attacker && attacker.kind === 'projectile' ? attacker.owner : attacker;
    if (this.hp <= 0) { this.break(striker); return true; }
    if (this.info.roll && striker) this.startRoll(striker);
    else audio.play('hit_light');
    return true;
  }
  // ---------- rolling props (barrels, coal carts): shoved `info.roll` px, hitting enemies on the way ----------
  startRoll(striker) {
    const dir = Math.sign(this.x - striker.x) || striker.facing || 1;
    this.state = 'rolling'; this.t = 0; this.breaker = striker;
    this.rollLeft = this.info.roll; this.vx = dir * this.info.roll / ROLL_FRAMES;
    this.rollHit = new Set([this.id]);
    audio.play('throw');
  }
  updateRoll(world) {
    this.x += this.vx; this.rollLeft -= Math.abs(this.vx); this.angle += this.vx * 0.12;
    const b = world.boundsFor(this);
    if (this.x < b.x0 + this.w / 2) { this.x = b.x0 + this.w / 2; this.rollLeft = 0; }
    if (this.x > b.x1 - this.w / 2) { this.x = b.x1 - this.w / 2; this.rollLeft = 0; }
    if (this.t % 3 === 0) particles.burst('dust', this.x - this.vx * 3, 0, this.z, 1, { speed: 0.8, up: 0.4 });
    if (this.t % 2 === 0) {
      const p = new Projectile({ owner: this.breaker, x: this.x, y: 8, z: this.z, r: this.w / 2 + 6, life: 2, style: 'explosion', pierce: 99,
        hit: { damage: this.info.rollHit, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 20, z: 20, sfx: 'hit_heavy' } });
      for (const id of this.rollHit) p.hitTargets.add(id);
      p.onHit = (t) => { this.rollHit.add(t.id); };
      world.add(p);
    }
    if (this.rollLeft <= 0) { this.state = 'idle'; this.vx = 0; this.angle = Math.round(this.angle / (Math.PI * 2)) * Math.PI * 2; }
  }
  // ---------- breaking ----------
  break(attacker) {
    this.solid = false;
    burstBreak(this.x, this.yOff + this.h * 0.5, this.z, this.info.color || '#8a6a40', 8);
    audio.play('prop_break');
    if (attacker && attacker.addScore && this.info.score !== 0) attacker.addScore(PROP_SCORE, true);
    this.breaker = attacker || this.breaker;
    const world = this.world;
    if (world) spawnDrops(world, this.x, this.z, this.drops);
    if (this.info.fall) { this.state = 'falling'; this.t = 0; audio.play('hydraulic'); return; }
    if (this.info.explode) { this.state = 'fuse'; this.t = 0; audio.play('bomb_fuse'); return; }
    if (this.info.valve && world) this.blowValve(world);
    this.finish();
  }
  finish() { this.alive = false; this.state = 'breaking'; this.t = 0; }
  explode(world, ex) {
    world.spawnAreaHit(null, this.x, this.z, ex.radius, { damage: ex.damage, type: 'knockdown', kbX: 5, kbY: 5, friendly: true, hitstun: 24 });
    world.addFx('ring', this.x, 0, this.z, { r1: ex.radius, flat: true, color: '#ffb060' });
    world.addFx('flash', this.x, 0, this.z, { color: '#ffb060', life: 4 });
    particles.burst('ember', this.x, 10, this.z, 14, { speed: 4, up: 3 }); particles.burst('smoke', this.x, 10, this.z, 8, { speed: 1.5, up: 1.5 });
    if (world.camera) world.camera.shake(8, 12);
    audio.play('explosion');
    this.finish();
  }
  /** Chandelier hits the floor: 30 knockdown to enemies within 90px (credited to the jumper), once. */
  land(world) {
    const f = this.info.fall, owner = this.breaker;
    const p = new Projectile({ owner, team: owner ? owner.team : TEAM.PLAYER, x: this.x, y: 20, z: this.z, r: f.radius, life: 2, style: 'explosion', pierce: 99,
      hit: { damage: f.damage, type: 'knockdown', kbX: 5, kbY: 5, hitstun: 24, z: f.radius, sfx: 'hit_heavy' } });
    p.hitTargets.add(this.id);
    world.add(p);
    world.addFx('ring', this.x, 0, this.z, { r1: f.radius, flat: true, color: '#ffd080' });
    world.addFx('dust', this.x, 0, this.z, { count: 10 });
    particles.burst('gear', this.x, 10, this.z, 5, { speed: 3, up: 3 }); particles.burst('spark', this.x, 10, this.z, 12, { speed: 4, up: 2, color: '#FFD27A' });
    if (world.camera) world.camera.shake(8, 12);
    audio.play('explosion');
    this.finish();
  }
  /** Pressure valve: a jet of steam and a 60f stun on the Regent Engine (GDD 5.2). The world's valve hook (`stunBoss`) does the
   *  stun when the boss implements `stun`; otherwise the gear-slip stagger is used directly. */
  blowValve(world) {
    const b = world.boss;
    audio.play('valve_blow');
    particles.burst('steam', this.x, this.h, this.z, 24, { speed: 3, up: 4, spread: 1.2, sizeJitter: 2 });
    if (!b) return;
    if (typeof b.stun === 'function') return; // world._checkValves -> Boss.stun does the stun, ring, text and shake
    if (b.enterStagger) { b.enterStagger(60); b.rig.tell = false; }
    world.addFx('ring', b.x, 40, b.z, { r0: 10, r1: 90, color: '#4DF0E0' });
    floatText(b.x, b.y + b.h + 10, b.z, 'STUNNED!', '#4DF0E0', 2);
    if (world.camera) world.camera.shake(6, 12);
  }
  draw(ctx, cam) {
    const sx = cam.toScreenX(this.x), sy = Math.round(FLOOR_TOP + this.z - this.y + cam.shakeY);
    const frame = this.world ? this.world.frame : 0;
    if (this.state === 'breaking') { drawPieces(ctx, sx, sy - this.yOff, this, this.t / BREAK_FRAMES); return; }
    ctx.save();
    if (this.wobble > 0 && this.state === 'idle') { ctx.translate(sx, sy); ctx.rotate(Math.sin(this.wobble * 1.2) * 0.06); ctx.translate(-sx, -sy); }
    drawProp(ctx, sx, sy, this, frame);
    ctx.restore();
  }
  drawShadow(ctx, cam) { if (this.alive && this.state !== 'breaking') super.drawShadow(ctx, cam); }
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

/**
 * Ring-out: an enemy knocked into the molten channel / over the funicular railings dies instantly (+200 to the last hitter).
 * @param {'molten'|'rail'} kind
 */
export function ringOut(world, e, kind, dir = 0) {
  if (!e || e.dead || e.kind === 'boss' || !e.alive) return false;
  const killer = e.lastHitBy;
  e.hp = 0; e.dead = true; e.invuln = 0;
  if (e.grabbedBy && e.grabbedBy.releaseGrab) e.grabbedBy.releaseGrab(false);
  if (kind === 'molten') {
    e.z = 10; e.knockDown(2.5, e.vx * 0.3);
    particles.burst('ember', e.x, 6, e.z, 16, { speed: 3.5, up: 4, color: '#FFB347' });
    particles.burst('steam', e.x, 6, e.z, 8, { speed: 1.5, up: 2.5, color: '#ffd8b0' });
    audio.play('fire');
  } else {
    e.knockDown(7, e.vx * 0.5); e.vz = dir * 2.5;
    particles.burst('dust', e.x, 10, e.z, 6, { speed: 2, up: 1 });
    audio.play('throw');
  }
  audio.play((e.def && e.def.sfx && e.def.sfx.death) || 'soot_death');
  if (killer && killer.addScore) killer.addScore(RING_OUT_SCORE, false);
  floatText(e.x, e.y + e.h + 12, Math.max(24, e.z), 'RING OUT +' + RING_OUT_SCORE, UI.brassLight, 2);
  return true;
}
