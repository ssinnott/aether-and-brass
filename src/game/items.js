// Pickups (food, score, meter, 1-UP) and breakable props (GDD section 6 props, section 7 pickups; ARCHITECTURE section 6).
// Props take hits from any team, roll (barrels, coal carts), explode after breaking (oil drums), fall on a jump attack
// (chandelier), stun the Regent Engine (pressure valves), tip out a live enemy (`release`: the Chandlery's handcarts), dump a
// rolling load from overhead (`dump`: the Gleaning's cargo nets) and light gas (`fire`: lanterns, every explosion — world.addFire);
// every break plays a split-pieces animation + debris unless the type brings its own `pieces` drawing (a cut salvage line).
// Throwable clutter (issue #21, GDD 7): a `throwable: true` stage row + a `throw` spec on PROP_TYPES (bottle, lamp)
// lets a player lift it (state 'held'; game/throwables.js owns lift/hold/throw/land -- a thrown prop is removed
// outright and flies as a plain Projectile instead, so this file only carries the 'held' state and its guards).
import { FLOOR_TOP, GRAVITY, TEAM, HITSTOP, METER, UI, ST, Z_MIN, Z_MAX } from '../constants.js';
import { Entity } from './entity.js';
import { Projectile } from './projectile.js';
import { audio } from '../engine/audio.js';
import { rng } from '../engine/rng.js';
import { clamp } from '../engine/math.js';
import { particles } from '../engine/particles.js';
import { floatText, burstBreak } from '../art/fx.js';
import { rrect, circle, gear, pathPoly, paint, line } from '../art/shapes.js';
import { PROP_TYPES, getPropType, drawProp, drawPieces, tones } from '../art/props.js';
import { entranceFor } from './entrances.js';
import { WEAPONS } from './weapons.js';
import { drawWeaponFloor } from '../art/weapons.js';

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
/** What one unspent cargo entry is worth when the container is broken before it let that unit out (issue #34). */
const CARGO_LOOT = 'coalScrip';
/** How long a timer container rattles before it opens: its tell, and the window its dangerBox is live for. */
const CARGO_RATTLE = 40;
export const PICKUP_LIFE = 600, PICKUP_BLINK = 120;
/** Walk-over collection box (half-widths), shared by `Pickup` and `WeaponPickup`. */
export const PICKUP_DX = 18, PICKUP_DZ = 14;
const OL = '#2B2B30';
const BREAK_FRAMES = 16, ROLL_FRAMES = 20, PROP_SCORE = 50, RING_OUT_SCORE = 200;
/** Fire radius a breaking `fire` prop (a lantern's spilt oil) reports to world.addFire; explosions report their own radius. */
const FIRE_R = 40;
/** Rite lime (docs/STAGE3.md): the ring a released enemy climbs out of — the Chandlery's carts are how the Brassbound come back. */
const RELEASE_COLOR = '#D8FF6E';

/**
 * Shared pop-physics tick for walk-over pickups (`Pickup`, `WeaponPickup`): life countdown, bounce, ground friction
 * and the world-bounds clamp. Returns false when the caller should stop (the pickup expired this frame).
 */
export function tickPickupBody(p, world) {
  p.world = world;
  if (--p.life <= 0) { p.removeMe = true; return false; }
  if (p.y > 0 || p.vy > 0) { p.y += p.vy; p.vy -= GRAVITY; if (p.y <= 0) { p.y = 0; p.vy = p.vy < -1.5 ? -p.vy * 0.4 : 0; p.vx *= 0.5; } }
  p.x += p.vx; if (p.y <= 0) p.vx *= 0.9;
  const b = world.boundsFor(p); if (p.x < b.x0) p.x = b.x0; if (p.x > b.x1) p.x = b.x1;
  return true;
}

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
    if (!tickPickupBody(this, world)) return;
    for (const p of world.players) {
      if (!p.alive || p.dead || p.removeMe || p.y > 24) continue;
      if (Math.abs(p.x - this.x) < PICKUP_DX && Math.abs(p.z - this.z) < PICKUP_DZ) { this.collect(p, world); return; }
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

/**
 * A held pickup weapon lying on the floor (issue #20, GDD 7): dropped by an enemy on death or a player on knockdown,
 * walk-over collectable by any actionable player who is not already armed. `grace` (player drops only) blocks
 * collection for a few frames so the dropper does not instantly re-collect his own weapon. Both `weaponId` and
 * `weaponHits` and `grace` are hashed by net/checksum.js.
 */
export class WeaponPickup extends Entity {
  constructor(weaponId, x, z, { hits = null, pop = true, life = PICKUP_LIFE, grace = 0 } = {}) {
    super('item');
    this.weaponId = WEAPONS[weaponId] ? weaponId : 'halberd';
    this.info = WEAPONS[this.weaponId];
    this.weaponHits = hits != null ? hits : this.info.hits;
    this.grace = grace;
    this.x = x; this.z = clamp(z, Z_MIN, Z_MAX); this.y = pop ? 1 : 0;
    this.vy = pop ? 4 : 0; this.vx = pop ? rng.range(-1.2, 1.2) : 0;
    this.life = life; this.w = 24; this.h = 10; this.zSize = 24; this.shadowW = 22;
  }
  update(world) {
    if (!tickPickupBody(this, world)) return;
    if (this.grace > 0) { this.grace--; return; }
    for (const p of world.players) {
      if (!p.pickUpWeapon || p.weaponId || p.out || p.dead || p.removeMe || !p.actionable) continue;
      if (Math.abs(p.x - this.x) < PICKUP_DX && Math.abs(p.z - this.z) < PICKUP_DZ) {
        if (p.pickUpWeapon(this)) { this.removeMe = true; return; }
      }
    }
  }
  hurtbox() { return null; }
  draw(ctx, cam) {
    if (this.life < PICKUP_BLINK && (this.life % 8) < 4) return;
    drawWeaponFloor(ctx, cam.toScreenX(this.x), Math.round(FLOOR_TOP + this.z - this.y + cam.shakeY), this.info.rig);
  }
}

/** Breakable (or static) stage prop from the art/props.js catalogue. Takes hits from any team, drops items. */
export class Prop extends Entity {
  /**
   * Stage entries forward every extra field of a prop entry here, so these names are the stage-data contract.
   * @param {string} type PROP_TYPES key
   * @param {{ drops?: string|string[]|null, hp?: number, solid?: boolean, rider?: boolean, throwable?: boolean,
   *   release?: { type: string, variant?: string, mods?: string[] }|null, dump?: string|null, fire?: boolean,
   *   barricade?: boolean, name?: string, cargo?: object[]|null, cargoOn?: 'break'|'timer', cargoEvery?: number }} o
   *   rider = travels on the cargo-bay conveyor; release / dump / fire override the type's catalogue defaults
   *   (leave them out to keep the type's own, pass null / false to switch the behaviour off on one entry);
   *   throwable (issue #21, GDD 7) = the stage row allows lifting this instance, which only actually applies when the
   *   type also carries a `throw` spec (game/throwables.js findLiftProp).
   */
  constructor(type, x, z, { drops = null, hp = 0, solid = true, rider = false, throwable = false, release, dump, fire,
    barricade = false, name = '', cargo = null, cargoOn = 'break', cargoEvery = 180 } = {}) {
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
    /** A dumped cargo net: still hanging (drawn empty), never solid again. */
    this.spent = false;
    /** Issue #21 (GDD 7): liftable (throwable AND info.throw exists) and the Player currently holding this, if any.
     *  Both hashed by net/checksum.js (bitfield). State 'held' adds to idle/rolling/breaking/fuse/falling -- a
     *  thrown prop is removed outright (throwHeldItem) and flies as a plain Projectile, never a Prop state. */
    this.throwable = !!(throwable && this.info.throw);
    this.holder = null;
    /** Live enemy that tips out on break ({ type, variant, mods? }); the handcart's default is a Tin Footman. */
    this.release = release !== undefined ? release : (this.info.release || null);
    /** Prop type an overhead net dumps on the floor, rolling, when a jump attack opens it (the cargo net's 'chassis'). */
    this.dump = dump !== undefined ? dump : (this.info.dump || null);
    /** Fire source on break (lanterns): world.addFire gets the spill; explosions are fire sources regardless of this flag. */
    this.fire = fire !== undefined ? !!fire : !!this.info.fire;
    this.fireR = 0;                          // radius re-reported to world.addFire while the pieces fly (0 = not burning)
    /** Issue #31: this prop is what holds a breakable `solid` zone up. The Zone finds it by this flag and stops
     *  blocking when it dies, and the stage runner will not release the wave lock while it is standing. The health
     *  lives HERE rather than on the Zone because a Prop is kind 'prop' and its hp is hashed by net/checksum.js,
     *  while a Zone is kind 'fx' and its state is invisible to the desync canary. */
    this.barricade = !!barricade;
    /** Author key (issue #34): what a `entrance: { kind: 'cargo', prop: name }` spawn spec addresses this prop by.
     *  Entity.id cannot be used -- it differs between lockstep peers and is deliberately unhashed. */
    this.name = name || '';
    /**
     * CARGO (issue #34): spawn specs this prop is carrying, and how they come out.
     *   'break'  everything in it climbs out when the prop is broken (the generalisation of `release`, which is
     *            the same idea for exactly one unit and still works unchanged)
     *   'timer'  one every `cargoEvery` frames -- a deck hatch, a coal chute -- while the wave is live
     * Cargo that never comes out is LOOT: `spawnDrops` gets one drop per unspent entry instead (see `cargoLoot`).
     * Every unit arrives through the `climbOut` entrance (game/entrances.js): on its feet, in a long punishable
     * recovery, because getting out of a box is slow.
     */
    this.cargo = Array.isArray(cargo) && cargo.length ? cargo.slice() : null;
    this.cargoOn = cargoOn === 'timer' ? 'timer' : 'break';
    this.cargoEvery = Math.max(30, cargoEvery | 0);
    this.cargoT = 0;
    /** Frames the hatch is being STOOD ON and cannot open (issue #34): the co-op job. */
    this.cargoHeld = 0;
    /**
     * A timer container is a HAZARD in the last stretch before it opens (issue #34): it rattles, and a rattling
     * crate is a place not to stand. `isHazard` + `dangerBox()` is the whole contract laneAroundHazards needs, so
     * mobs and the autopilot step out of the lane for free -- and the box is null the rest of the time, because a
     * permanently dangerous crate would make every enemy refuse that lane for the whole board.
     */
    this.isHazard = !!(this.cargo && this.cargoOn === 'timer');
  }
  /** The patch a timer container is about to put somebody in, or null while it is quiet (issue #34). */
  dangerBox() {
    if (!this.isHazard || !this.alive || !this.cargo || !this.cargo.length) return null;
    if (this.cargoT < this.cargoEvery - CARGO_RATTLE) return null;
    const r = this.w / 2 + 14;
    return { x0: this.x - r, x1: this.x + r, z0: this.z - 20, z1: this.z + 20 };
  }
  update(world) {
    this.world = world;
    if (this.flashTimer > 0) this.flashTimer--;
    if (this.wobble > 0) this.wobble--;
    this.t++;
    switch (this.state) {
      case 'rolling': this.updateRoll(world); break;
      case 'breaking':
        // world.fires is a per-update list, so a fire source re-reports itself every frame the pieces fly: a one-shot entry
        // made during hit resolution would be cleared before a hazard earlier in the entity order ever read it
        if (this.fireR && world.addFire) world.addFire(this.x, this.z, this.fireR);
        if (this.t >= BREAK_FRAMES) this.removeMe = true;
        break;
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
      case 'held': this.updateHeld(); break;
      default: break;
    }
    if (this.cargo && this.cargoOn === 'timer' && this.alive && this.state === 'idle') this.updateCargoTimer(world);
  }
  /**
   * `cargoOn: 'timer'` (issue #34): a hatch or a chute lets one out every `cargoEvery` frames while the wave is live.
   *
   * STAND ON IT TO HOLD IT SHUT. A fighter on the lid stops the clock -- it rattles under them and the queued unit
   * waits -- which is the small job the second player gets on a hatch. It is deliberately not a lock: step off and
   * the timer picks up where it left off rather than resetting, so holding it buys time, it does not cancel the wave.
   */
  updateCargoTimer(world) {
    if (!world || !world.camera || !world.camera.isVisible(this.x, 120)) return;
    const stander = this.standingOn(world);
    if (stander) {
      this.cargoHeld = 6;
      if (this.t % 12 === 0) { this.wobble = 6; particles.burst('dust', this.x, 0, this.z, 2, { speed: 0.8, up: 0.6 }); }
      return;
    }
    if (this.cargoHeld > 0) { this.cargoHeld--; return; }
    if (++this.cargoT < this.cargoEvery) {
      // the tell: it rattles, and dangerBox() goes live with it (GDD 6 -- nothing arrives without a warning)
      if (this.cargoT >= this.cargoEvery - CARGO_RATTLE) {
        this.wobble = 4;
        if (this.cargoT % 10 === 0) { audio.play('hit_light'); particles.burst('dust', this.x, 2, this.z, 2, { speed: 0.7, up: 0.5 }); }
      }
      return;
    }
    this.cargoT = 0;
    this.releaseCargo(world, 1);
  }
  /** A living fighter standing on this prop's footprint (issue #34: holding a hatch shut). */
  standingOn(world) {
    for (const f of world.fighters) {
      if (f.dead || f.y > 6 || f.grabbedBy || f.kind === 'boss') continue;
      if (Math.abs(f.x - this.x) <= this.w / 2 + 6 && Math.abs(f.z - this.z) <= this.zSize / 2 + 8) return f;
    }
    return null;
  }
  /**
   * Let `n` cargo entries out (or all of them). Each one arrives through the `climbOut` entrance, so it stands up
   * out of the container into a recovery that can be hit and grabbed -- the same deal a teleport arrival gets.
   * @returns {number} how many actually came out
   */
  releaseCargo(world, n = Infinity) {
    if (!this.cargo || !this.cargo.length || !world.spawnEnemy) return 0;
    let out = 0;
    while (this.cargo.length && out < n) {
      const spec = this.cargo.shift();
      const z = clamp(this.z + (out % 2 ? 8 : -8), world.floorBand.z0, world.floorBand.z1);
      let near = null;
      for (const p of world.players) if (p.alive && !p.dead && !p.removeMe && (!near || Math.abs(p.x - this.x) < Math.abs(near.x - this.x))) near = p;
      const facing = near ? (Math.sign(near.x - this.x) || -1) : -1;
      world.spawnEnemy(spec.type, spec.variant, this.x + (out % 2 ? 10 : -10), z, {
        entered: false, facing, mods: spec.mods || null,
        // Resolved here rather than inline so a cargo entry may override the climb-out's own fields the same way a
        // wave spec can (`entrance: { arrive: 40 }` on a heavy unit that takes longer to get out of the box).
        // `kind` goes AFTER the spread deliberately: a wave-addressed spec carries `{ kind: 'cargo', prop }`, and
        // letting that through would have the unit resolve as a `cargo` entrance -- which startArrival does not
        // treat as grounded, so it would drop out of the SKY instead of climbing out of the box it is standing in.
        entrance: entranceFor({ entrance: { ...(spec.entrance || {}), kind: 'climbOut' } }),
      });
      out++;
    }
    if (!out) return 0;
    this.wobble = 12;
    particles.burst('debris', this.x, this.yOff * 0.5, this.z, 6, { speed: 2, up: 1.4, color: this.info.color || '#8a6a40' });
    world.addFx('dust', this.x, 0, this.z, { count: 8 });
    if (world.camera) world.camera.shake(3, 8);
    audio.play('crate_drop');
    return out;
  }
  /** Guard only (issue #21 decision 6): the real per-frame position comes from the HOLDER's own updateGrab
   *  (game/grabs.js -> throwables.js updateHeldProp) every frame while held. This just notices a holder that
   *  let go without going through dropHeldProp (dead, out, or otherwise reset) and settles back to idle in place. */
  updateHeld() {
    const h = this.holder;
    // Also self-heals a holder that stopped holding without going through dropHeldProp: grabbed out of ST.GRAB
    // (grabs.js startGrab drops it explicitly, but this is a second line of defence) or removed/killed by a path
    // that never calls onHurt (takeHitRaw death, review findings 1/10).
    if (!h || h.heldProp !== this || h.state !== ST.GRAB || !h.alive || h.dead) {
      if (h && h.heldProp === this) h.heldProp = null;
      this.holder = null; this.state = 'idle'; this.y = 0;
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
    if (!this.alive || !this.solid || this.state === 'breaking' || this.state === 'fuse' || this.state === 'falling'
      || this.state === 'held') return false;
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
    const puff = this.info.puff;   // quicklime / rose gas: a coloured cloud instead of just splinters
    if (puff) particles.burst('steam', this.x, this.h * 0.5, this.z, puff.count, { speed: 1.6, up: 1.2, spread: 1.2, sizeJitter: 1.5, color: puff.color });
    if (this.release && world && world.spawnEnemy) this.releaseEnemy(world);
    // Cargo (issue #34). A `break` container tips its whole load out; a `timer` one that is smashed before it has
    // finished letting them out is LOOT instead -- one drop per entry that never came out, plus the score. Breaking
    // the crate early is therefore always a decision rather than always the right answer: you trade the enemies you
    // would have had to fight for the pickups they were sitting on.
    if (this.cargo && this.cargo.length && world) {
      if (this.cargoOn === 'break') this.releaseCargo(world);
      else { for (let i = 0; i < this.cargo.length; i++) spawnDrops(world, this.x + (i % 2 ? 12 : -12), this.z, CARGO_LOOT); this.cargo.length = 0; }
    }
    if (this.fire) { this.lightFire(world, FIRE_R); particles.burst('ember', this.x, this.yOff + 8, this.z, 8, { speed: 2.5, up: 2.5 }); }
    if (this.info.fall) { this.state = 'falling'; this.t = 0; audio.play('hydraulic'); return; }
    if (this.info.explode) { this.state = 'fuse'; this.t = 0; audio.play('bomb_fuse'); return; }
    if (this.dump && world) { this.dumpLoad(world, attacker); return; }
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
    this.lightFire(world, ex.radius);   // a keg / tub / drum going off lights any gas seep under its blast
    this.finish();
  }
  /** Become a fire source of radius r: tell the world now (guarded — the hook is optional) and keep telling it while breaking. */
  lightFire(world, r) {
    this.fireR = r;
    if (world && world.addFire) world.addFire(this.x, this.z, r);
  }
  /**
   * `release`: a live enemy tips out of the broken prop — spawned at the prop, already entered, facing the nearest player and
   * knocked down so it climbs to its feet out of the wreck (the player gets the same beat a spawn gives). Spawn modifiers ride
   * through as opts.mods (traits.js SPAWN_MODS). A rite-lime ring + chime mark it: on board 3 this is a rite, not a spawn.
   */
  releaseEnemy(world) {
    const r = this.release;
    let near = null;
    for (const p of world.players) if (p.alive && !p.dead && !p.removeMe && (!near || Math.abs(p.x - this.x) < Math.abs(near.x - this.x))) near = p;
    const facing = near ? (Math.sign(near.x - this.x) || -1) : -1;
    const z = clamp(this.z, world.floorBand.z0, world.floorBand.z1);
    const e = world.spawnEnemy(r.type, r.variant, this.x, z, { entered: true, facing, mods: r.mods || null });
    if (e && e.knockDown) e.knockDown(3, facing * 1.2);
    world.addFx('ring', this.x, 8, this.z, { r0: 6, r1: 48, color: RELEASE_COLOR });
    world.addFx('dust', this.x, 0, this.z, { count: 10 });
    audio.play('chime');
    return e;
  }
  /**
   * `dump`: an overhead net opened by a jump attack drops its load as a new prop on the floor under it, rolling away from the
   * striker at once so it is a live hazard the moment it lands (credited to the striker like any shoved barrel). The emptied
   * net stays hanging, non-solid and `spent`, and drops nothing itself — the score and the pickups are on the load.
   */
  dumpLoad(world, striker) {
    const load = new Prop(this.dump, this.x, clamp(this.z, world.floorBand.z0, world.floorBand.z1));
    world.add(load);
    if (striker && load.info.roll) load.startRoll(striker);
    particles.burst('debris', this.x, this.yOff, this.z, 10, { speed: 3, up: 1, color: this.info.color || '#8a6a40', sizeJitter: 1.5 });
    particles.burst('gear', this.x, this.yOff, this.z, 4, { speed: 2.5, up: 1 });
    world.addFx('ring', this.x, 0, this.z, { r1: 50, flat: true, color: '#ffd080' });
    world.addFx('dust', this.x, 0, this.z, { count: 12 });
    if (world.camera) world.camera.shake(6, 10);
    audio.play('crate_drop');
    this.spent = true; this.drops = null; this.shadowW = 0;
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
    if (this.state === 'breaking') { (this.info.pieces || drawPieces)(ctx, sx, sy - this.yOff, this, this.t / BREAK_FRAMES); return; }
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
    if (!id) continue;
    if (WEAPONS[id]) { const wp = new WeaponPickup(id, x + i * 6, z); wp.vx = (i % 2 ? 1 : -1) * (0.8 + i * 0.4); world.add(wp); i++; continue; }
    if (!PICKUPS[id]) continue;
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
  // A ring-out is a defeat, but it never reaches world.onDeath: this function sets `dead` WITHOUT calling die(),
  // which is why onDeath hooks (and the enemy's own onDeath) do not fire for it. The bestiary (issue #26) wants it
  // both as a defeat and as a ring-out, so it gets its own hook rather than a die() call that would change what
  // every existing onDeath hook sees.
  if (world.onEnemyRungOut) world.onEnemyRungOut(e, killer);
  return true;
}
