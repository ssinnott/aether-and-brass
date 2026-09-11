// Stage hazards (GDD section 6): steam / aether vents (rattle tell -> eruption -> launch), crushing pistons (shadow tell),
// the swinging cargo hook, funicular pylon crossbars (horn + shadow tell, back-lane sweep), the storm conductor, and the
// board 2-4 set (issue #27): run-out cannon, gas-cell cloud, lime pit, runaway wagon, tallow vat, kiln mouth, ledger /
// ballast drops, tailings gas seep. Plus environment ZONES: the Foundry Row molten channel (z < 20), the funicular
// railings (front/back 12px, throw-overs are ring-outs), the boss dais edge vents (shrinking band), the cargo-bay conveyor
// strip (drifts everything left, carries crates), the Mooring Spine gust (periodic z push), tailings spoil (damped
// footing) and Crop Loft net decking (marked squares give way under a heavy landing).
// Hazards hurt everyone (team NONE area hits); they are `fx` entities (never hit targets) drawn in depth order.
// Balance rule (GDD 6 "Hazard rules"): a hazard lands ONE hit per body per activation. Whoever it catches is immune to
// THAT hazard for `grace` frames — an airborne body cannot act, so re-hitting it every `every` frames only juggled it
// into the juggle cap. `every` is now just how often the active window re-scans for someone who has walked in.
//
// ================================ HAZARD TABLE (bots, tools/winrate.js and stage authors read this) ====================
// type          period tell active grace  hit (dmg / reaction / extra)             tell reads as            dangerBox while live (laneAroundHazards)
// steamVent      180    30    45    90    7 launch                                 grate rattle, vent_tell  x±r, z±r
// aetherVent     120    30    40   100    10 launch                                cyan pool + rattle       x±r, z±r
// piston         240    36    10   110    16 knockdown                             growing shadow, hydraulic x±r, z±r
// hook           120     0   120   100    10 knockdown (moving)                    always swinging          whole arc x±(swing+r), z±r
// crossbar       360    40    12   120    12 knockdown, back lane z<40             horn + lane shadow       null (takes the whole lane; step forward in z)
// lightning      220    40    12   120    12 knockdown + stunned 10                violet ring, coil_charge x±r, z±r
// cannon         300    45    10   120    12 knockdown, lane z±18 across `reach`   gun runs out, lane lights, hydraulic -> cannon   gun x .. x+dir*reach, z±lane/2
// gasCell        420    40   150   110    4 light + stunned 30; lit: 14 knockdown fire + burn   cell swells/hisses, vent_tell -> steam   cloud x±r (drifts `drift` px/f), z±r
// limePit        180    30    40    90    5 light + blinded 30                     rim rattle, vent_tell -> steam   x±r, z±r
// wagon          600    45  |x1-x|/speed 120  14 knockdown (moving)                brake lever hydraulic, wagon rocks -> crate_drop   tell: whole track; active: wagon x .. 120px ahead, z±r
// tallowVat      240    40    30   100    6 knockdown fire + burn                  boil-over bubbles, steam -> fire   x±r, z±r (fire source)
// kilnMouth      300    36    14   110    12 knockdown fire + burn, cone x±halfW, z..z+reach   mouth glows lime, coil_charge -> fire   x±halfW, z..z+reach (fire source)
// ledgerDrop     240    36     8   110    10 knockdown                             growing shadow, chime -> prop_break   x±r, z±r
// ballastDrop    240    36     8   110    14 knockdown                             growing shadow, hydraulic -> crate_drop   x±r, z±r
// gasSeep        360 (recharge) — 10  110  12 knockdown fire + burn, ONLY when lit  rose haze, harmless until any fire touches it -> explosion   null until lit, then x±r, z±r
// `drop` with look:'ledger'|'ballast' is an alias of ledgerDrop / ballastDrop. Every hit carries fromX where the hazard has
// a side (the knockback throws the body clear); the crossbar and kiln cone have none in x / throw sideways respectively.
// ================================ ZONE TABLE ==========================================================================
// molten  x0,x1 (z<20)        10 knockdown + burn, players ejected to z 32; airborne enemies ring out
// rails   x0,x1 (12px edges)  clamps; thrown / airborne-knockdown enemies over the edge ring out
// daisVents x0,x1 (+color)    4 dmg every 30f outside the shrunk floor band while the boss is up
// conveyor x0,x1,z0           drifts everything left 1px/f while the mid-boss is up, a crate every 240f
// gust    x0,x1 period 420 tell 45 active 40 push 1.3 dir 0|1|-1   grounded fighters drift `push` px/f in z (dir 0 alternates per cycle); gale
// spoil   x0,x1,z0,z1         per-frame movement of grounded fighters inside is damped to 55%
// netGive x0,x1 squares[{x,z,w 60,d 30}]   a knockdown / thrown landing in a square sags it 10f then opens it 60f: enemies standing
//                             in it ring out (+200), players lose 8% max HP, are knocked down and set on the nearest edge
import { FLOOR_TOP, TEAM, VIEW_W, ST, Z_MAX } from '../constants.js';
import { Entity } from './entity.js';
import { Projectile } from './projectile.js';
import { Prop, ringOut } from './items.js';
import { worldHitbox } from './fighter.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { rng, makeRng } from '../engine/rng.js';
import { clamp } from '../engine/math.js';
import { floatText } from '../art/fx.js';
import { rrect, circle, pathPoly, line } from '../art/shapes.js';
import { tones } from '../art/props.js';
import { dsin } from '../engine/trig.js';

// Visual-only PRNG for draw(). The gameplay `rng` singleton must never be touched from render code:
// draw runs once per rAF while update runs at a fixed 60Hz, so a 144Hz peer, a throttled tab or a
// single dropped frame would advance the shared stream a different number of times and desync it.
const vrng = makeRng(0x4a2d);

const OL = '#2B2B30';
const AIR_STATES = new Set([ST.KNOCKDOWN, ST.THROWN, ST.HURT_AIR]);
/** Board energy colours (docs/ART_STYLE 4): storm violet / gas green (board 2), rite lime / quicklime / tallow (board 3), tailings rose (board 4). */
const STORM = '#9B7BFF', GAS = '#7FD66B', LIME = '#D8FF6E', QUICKLIME = '#E6ECDC', TALLOW = '#C29B4A', ROSE = '#FF57B0';
const HOT_CORE = '#FFD27A', TELL_RED = '#ff5c5c';
const BURN = { frames: 60, every: 20, damage: 2 };
/**
 * Frames a body is immune to the hazard that just caught it (per-type `grace` overrides this).
 * A launch is ~32f of airtime, then 40f lying and a get-up, so ~90f is "one hit, then you are on
 * your feet with time to step clear". Without it an active window re-hit every `every` frames and
 * juggled whoever it launched until the juggle cap — a single vent could take half a health bar.
 */
const HAZARD_GRACE = 90;
/** Per-type defaults: period / tell / active frames, the hit applied while active, and the per-body grace after it. */
export const HAZARD_TYPES = {
  steamVent: { period: 180, tell: 30, active: 45, r: 26, every: 12, grace: 90, color: '#e8f0f4', hit: { damage: 7, type: 'launch', kbX: 6, kbY: 8, hitstun: 20 }, tellSfx: 'vent_tell', sfx: 'steam' },
  aetherVent: { period: 120, tell: 30, active: 40, r: 26, every: 12, grace: 100, color: '#4DF0E0', hit: { damage: 10, type: 'launch', kbX: 6, kbY: 8, hitstun: 20 }, tellSfx: 'vent_tell', sfx: 'steam' },
  piston: { period: 240, tell: 36, active: 10, r: 30, every: 10, grace: 110, color: '#4a4e58', hit: { damage: 16, type: 'knockdown', kbX: 5, kbY: 5, hitstun: 24 }, tellSfx: 'hydraulic', sfx: 'piston_crush' },
  hook: { period: 120, tell: 0, active: 120, r: 18, every: 10, grace: 100, color: '#9a9aa4', hit: { damage: 10, type: 'knockdown', kbX: 6, kbY: 4, hitstun: 22 }, sfx: null, swing: 70 },
  crossbar: { period: 360, tell: 40, active: 12, r: 340, every: 12, grace: 120, color: '#3A3F4B', hit: { damage: 12, type: 'knockdown', kbX: 3, kbY: 5, hitstun: 22, z: 40 }, tellSfx: 'roar', sfx: 'hammer_slam', lane: 40 },
  // Stage 2: a lightning conductor. The storm earths itself through the mast, so the deck around it is a bad place to
  // stand: a violet ring builds for 40f, then the strike knocks down and leaves you seeing stars for a moment.
  lightning: { period: 220, tell: 40, active: 12, r: 34, every: 12, grace: 120, color: STORM, hit: { damage: 12, type: 'knockdown', kbX: 5, kbY: 6, hitstun: 24, status: { stunned: { frames: 10 } } }, tellSfx: 'coil_charge', sfx: 'thunder_strike' },
  // ---- Board 2: Cold Sovereign / Gas-Halls (issue #27) ----
  // Run-out gun: the carriage rolls the barrel out over the tell while its lane lights up on the deck, then the ball
  // crosses `reach` px along that z-band in `active` frames (crossbar-style: the tell is the warning, the shot is
  // instant). `lane` is the band's full z width; `dir` the shot direction. fromX is the gun, so the body flies downrange.
  cannon: { period: 300, tell: 45, active: 10, r: 30, every: 1, grace: 120, color: '#3A3F4B', hit: { damage: 12, type: 'knockdown', kbX: 7, kbY: 5, hitstun: 22 }, tellSfx: 'hydraulic', sfx: 'cannon', lane: 36, reach: VIEW_W, dir: 1 },
  // Gas cell: the cell swells and hisses for 40f, ruptures, and a green cloud drifts `drift` px/f along its z-band for
  // 150f stunning whoever it rolls over (one stun per body). Any fire inside the cloud - a burn tick, a flame, a puddle,
  // a Powder Bosun's keg - ignites it: `burst` hits everyone in 1.6r (knockdown + burn) and the cell is empty until the next cycle.
  gasCell: { period: 420, tell: 40, active: 150, r: 30, every: 10, grace: 110, color: GAS, hit: { damage: 4, type: 'light', kbX: 1, kbY: 0, hitstun: 12, status: { stunned: { frames: 30 } } }, tellSfx: 'vent_tell', sfx: 'steam', drift: 2,
    burst: { damage: 14, type: 'knockdown', kbX: 5, kbY: 5, hitstun: 22, element: 'fire', status: { burn: BURN } } },
  // ---- Board 3: Lime Road / Tallow Works / Ledger House ----
  // Lime pit: a vent in the Chandlery's quicklime; it blinds for 30f (no attacking) instead of launching. Texture, not damage.
  limePit: { period: 180, tell: 30, active: 40, r: 26, every: 12, grace: 90, color: QUICKLIME, hit: { damage: 5, type: 'light', kbX: 2, kbY: 0, hitstun: 14, status: { blinded: { frames: 30 } } }, tellSfx: 'vent_tell', sfx: 'steam' },
  // Runaway wagon: parked at x, it rocks on its chocks for the tell then rolls to x1 at `speed` px/f (active = the travel
  // time, derived). The hit moves with it and throws the body on down the road (fromX trails the wagon).
  wagon: { period: 600, tell: 45, active: 0, r: 24, every: 6, grace: 120, color: '#8C5A2C', hit: { damage: 14, type: 'knockdown', kbX: 7, kbY: 5, hitstun: 22 }, tellSfx: 'hydraulic', sfx: 'crate_drop', speed: 4 },
  // Tallow vat: bubbles for 40f, then boils over for 30f - a splash of burning fat (knockdown + burn). A fire source while it boils.
  tallowVat: { period: 240, tell: 40, active: 30, r: 30, every: 12, grace: 100, color: TALLOW, hit: { damage: 6, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 20, element: 'fire', status: { burn: BURN } }, tellSfx: 'steam', sfx: 'fire' },
  // Draw-kiln mouth in the back wall: glows lime for 36f, then flashes a cone `reach` px forward (in z) and `halfW` wide.
  // There is no side in x to be thrown clear of along the cone, so fromX = the mouth throws bodies out sideways.
  kilnMouth: { period: 300, tell: 36, active: 14, r: 28, every: 7, grace: 110, color: LIME, hit: { damage: 12, type: 'knockdown', kbX: 6, kbY: 5, hitstun: 22, element: 'fire', status: { burn: BURN } }, tellSfx: 'coil_charge', sfx: 'fire', reach: 90, halfW: 28 },
  // Drops: a shadow grows on the floor for 36f (the piston's tell), the load appears in the last 14f and lands for an 8f hit.
  // `{ type: 'drop', look: 'ledger' | 'ballast' }` picks one of these two.
  ledgerDrop: { period: 240, tell: 36, active: 8, r: 26, every: 8, grace: 110, color: '#D8CFA8', hit: { damage: 10, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 20 }, tellSfx: 'chime', sfx: 'prop_break' },
  ballastDrop: { period: 240, tell: 36, active: 8, r: 26, every: 8, grace: 110, color: '#4a4e58', hit: { damage: 14, type: 'knockdown', kbX: 4, kbY: 5, hitstun: 22 }, tellSfx: 'hydraulic', sfx: 'crate_drop' },
  // ---- Board 4: Tailings ----
  // Gas seep: not on a timer. It seeps rose gas (phase 'tell', harmless, dangerBox null) until ANY fire touches it - then it
  // bursts for `active` frames (knockdown + burn for everyone in it, a fire source itself) and recharges for `period` frames.
  gasSeep: { period: 360, tell: 0, active: 10, r: 34, every: 10, grace: 110, color: ROSE, hit: { damage: 12, type: 'knockdown', kbX: 5, kbY: 5, hitstun: 22, element: 'fire', status: { burn: BURN } }, tellSfx: 'steam', sfx: 'explosion' },
};
const PISTON_UP = 130, CROSSBAR_UP = 260, DROP_UP = 230, DROP_FALL = 14, DROP_FADE = 30;
// Hook: pivot-to-eye chain length. Fixed, so the head swings on an arc (and rides up at the ends) instead of
// sliding sideways on a chain that stretches.
const HOOK_CHAIN = 172;
/** Wagon: how far ahead of the rolling wagon the dangerBox reaches (mobs clear the road in front of it, not behind). */
const WAGON_LOOKAHEAD = 120;

const HAZARD_CLEARANCE = 10;   // z margin an enemy leaves around a hazard footprint

/**
 * Steer a lane clear of any hazard footprint a walk from `fromX` to `toX` would cross (game/enemy.js).
 * Mobs used to march straight through the cargo hook's arc on their way to the player and grind themselves
 * down on it; they now aim for the nearer edge of the footprint, clamped to the floor band [zLo, zHi].
 * Returns `z` unchanged when the lane is clear. Every type's footprint is in the HAZARD TABLE above: the cannon's
 * lane and the drifting gas cloud are stepped around in z like the hook's arc; the crossbar reports nothing.
 */
export function laneAroundHazards(world, fromX, toX, z, zLo, zHi) {
  const x0 = Math.min(fromX, toX), x1 = Math.max(fromX, toX);
  let out = z;
  for (const e of world.entities) {
    if (!e.isHazard || e.removeMe) continue;
    const b = e.dangerBox();
    if (!b || x1 < b.x0 || x0 > b.x1 || out < b.z0 || out > b.z1) continue;
    const up = b.z0 - HAZARD_CLEARANCE, down = b.z1 + HAZARD_CLEARANCE;
    const upOk = up >= zLo, downOk = down <= zHi;
    out = !upOk && !downOk ? out : !upOk ? down : !downOk ? up : Math.abs(up - out) <= Math.abs(down - out) ? up : down;
  }
  return out;
}

/**
 * Is there fire at (x, z) within `r`? Reads the frame's registered fire sources (world.fires: burn ticks, fire
 * projectiles / puddles, a broken lantern, boiling vats) and any fighter swinging a `element: 'fire'` hitbox (the
 * Firebrand's flame cone). `keg` also counts a Powder Bosun standing in it - the keg on his back is a fuse.
 */
function fireIn(world, x, z, r, keg = false) {
  // this frame's fires AND last frame's: an entity later in the update order than this hazard registers after it has run
  for (const list of [world.fires, world.lastFires]) for (const f of list || []) { const dx = f.x - x, dz = f.z - z, rr = r + f.r; if (dx * dx + dz * dz <= rr * rr) return true; }
  for (const f of world.fighters) {
    const dz = Math.abs(f.z - z);
    if (keg && f.def && f.def.variant === 'bosun' && !f.dead && dz <= r && Math.abs(f.x - x) <= r) return true;
    if (!f.hitboxes) continue;
    for (const hb of f.hitboxes()) {
      if (hb.element !== 'fire') continue;
      const b = worldHitbox(f, hb);
      if (dz <= r + b.z && b.x0 <= x + r && b.x1 >= x - r) return true;
    }
  }
  return false;
}

/** A cyclic stage hazard placed at world (x, z). */
export class Hazard extends Entity {
  /**
   * @param {{ type: string, x: number, z: number, period?: number, active?: number, tell?: number, offset?: number, r?: number,
   *   lane?: number, dir?: number, reach?: number, halfW?: number, drift?: number, x1?: number, speed?: number, look?: 'ledger'|'ballast' }} spec
   *   type-specific: cannon { lane, dir, reach } | gasCell { drift } | wagon { x1, speed } | kilnMouth { reach, halfW } | drop { look }
   */
  constructor(spec) {
    super('fx');
    let type = spec.type;
    if (type === 'drop') type = spec.look === 'ballast' ? 'ballastDrop' : 'ledgerDrop';
    this.info = HAZARD_TYPES[type] || HAZARD_TYPES.steamVent;
    this.type = HAZARD_TYPES[type] ? type : 'steamVent';
    this.x = spec.x; this.z = spec.z != null ? spec.z : 100;
    this.period = spec.period || this.info.period;
    this.activeFrames = spec.active || this.info.active;
    this.tellFrames = spec.tell != null ? spec.tell : this.info.tell;
    this.offset = spec.offset || 0;
    this.r = spec.r || this.info.r;
    this.lane = spec.lane || this.info.lane || 0;
    this.dir = spec.dir != null ? spec.dir : (this.info.dir || 1);
    this.reach = spec.reach || this.info.reach || 0;
    this.halfW = spec.halfW || this.info.halfW || 0;
    this.drift = spec.drift != null ? spec.drift : (this.info.drift || 0);
    this.shadowW = 0;
    this.phase = 'idle'; this.t = 0; this.lastHit = -99;
    /** fighter id -> world frame this hazard may hit it again (see HAZARD_GRACE). */
    this.immune = new Map();
    this.zSize = this.r;
    this.isHazard = true;      // enemy pathing looks for these in world.entities (laneAroundHazards)
    // moving parts: the cannonball, the gas cloud, the wagon
    this.ballX = this.x; this.cloudX = this.x; this.wagonX = this.x;
    /** gasCell: ignited this cycle - the cell stays empty until the next one. */
    this.spent = false;
    if (this.type === 'wagon') {
      this.x1 = spec.x1 != null ? spec.x1 : this.x + 600;
      this.speed = spec.speed || this.info.speed;
      // the active window IS the run: derive it, and make sure a short period still fits a tell + the whole run + a pause
      this.activeFrames = Math.max(1, Math.ceil(Math.abs(this.x1 - this.x) / this.speed));
      this.period = Math.max(this.period, this.activeFrames + this.tellFrames + 60);
    }
    // the seep is event-driven (see updateSeep): it starts seeping, and `t` counts frames in the current phase
    if (this.type === 'gasSeep') this.phase = 'tell';
  }
  hurtbox() { return null; }
  /**
   * The floor patch this hazard threatens, for enemy pathing. The hook reports its WHOLE sweep rather than
   * where the head is this frame: walking into the far end of the arc is still walking into the hook.
   * null when there is nothing to walk around - the crossbar takes the entire back lane at once.
   */
  dangerBox() {
    // Only what is live now: a dormant vent is still bait (GDD 6 "hits enemies"), it is the tell that clears the lane.
    if (this.type === 'crossbar' || this.phase === 'idle') return null;
    const r = this.r;
    switch (this.type) {
      case 'cannon': { const xa = this.x, xb = this.x + this.dir * this.reach; return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: this.z - this.lane / 2, z1: this.z + this.lane / 2 }; }
      case 'gasCell': return { x0: this.cloudX - r, x1: this.cloudX + r, z0: this.z - r, z1: this.z + r };
      case 'wagon': {
        // telling: the whole track (clear the road before it rolls); rolling: the wagon and the stretch it is about to cover
        if (this.phase === 'tell') return { x0: Math.min(this.x, this.x1) - r, x1: Math.max(this.x, this.x1) + r, z0: this.z - r, z1: this.z + r };
        const ahead = this.wagonX + this.wagonDir * WAGON_LOOKAHEAD;
        return { x0: Math.min(this.wagonX, ahead) - r, x1: Math.max(this.wagonX, ahead) + r, z0: this.z - r, z1: this.z + r };
      }
      case 'kilnMouth': return { x0: this.x - this.halfW, x1: this.x + this.halfW, z0: this.z, z1: this.z + this.reach };
      case 'gasSeep': if (this.phase !== 'active') return null; break;   // harmless until lit
      default: break;
    }
    const sw = this.info.swing || 0;
    return { x0: this.x - sw - r, x1: this.x + sw + r, z0: this.z - r, z1: this.z + r };
  }
  /** Screen-relative sweep position for the hook (px from x). */
  get swingX() { return dsin((this.t / this.period) * Math.PI * 2) * (this.info.swing || 0); }
  get tellStart() { return this.period - this.activeFrames - this.tellFrames; }
  get activeStart() { return this.period - this.activeFrames; }
  /** Which way the wagon rolls (x -> x1). */
  get wagonDir() { return Math.sign(this.x1 - this.x) || 1; }
  /** World x of the part that matters for the camera's visibility gate (the moving bit, where there is one). */
  get liveX() { return this.type === 'wagon' ? this.wagonX : this.type === 'gasCell' ? this.cloudX : this.x; }
  update(world) {
    this.world = world;
    if (this.type === 'gasSeep') { this.updateSeep(world); return; }
    this.t = (world.frame + this.offset) % this.period;
    const prev = this.phase;
    this.phase = this.t >= this.activeStart ? 'active' : this.t >= this.tellStart ? 'tell' : 'idle';
    // a gas cell that was lit stays empty (idle) until its cycle comes round again
    if (this.spent) { if (this.t < this.tellStart) this.spent = false; else this.phase = 'idle'; }
    if (this.phase === 'idle') { this.wagonX = this.x; this.cloudX = this.x; }
    const visible = world.camera.isVisible(this.liveX, 120);
    if (!visible) return;
    if (this.phase === 'tell' && prev !== 'tell' && this.info.tellSfx) audio.play(this.info.tellSfx);
    if (this.phase === 'active' && prev !== 'active') this.onActiveStart(world);
    if (this.type === 'hook') { this.hitSweep(world); return; }
    if (this.phase === 'tell') { this.tellFx(world); return; }
    if (this.phase !== 'active') return;
    switch (this.type) {
      case 'crossbar': if (world.frame - this.lastHit >= this.info.every) { this.lastHit = world.frame; this.laneHit(world); } return;
      case 'cannon': this.updateCannon(world); return;
      case 'gasCell': this.updateGasCell(world); return;
      case 'wagon': this.updateWagon(world); return;
      case 'kilnMouth': this.updateKiln(world); return;
      default: break;
    }
    this.activeFx(world);
    if (world.frame - this.lastHit >= this.info.every) { this.lastHit = world.frame; this.arm(world, world.spawnAreaHit(null, this.x, this.z, this.r, this.hitFrom(this.x))); }
  }
  /** First active frame: the sound, the shake and the one-off burst of each type. */
  onActiveStart(world) {
    if (this.info.sfx) audio.play(this.info.sfx);
    switch (this.type) {
      case 'piston': case 'crossbar': world.camera.shake(this.type === 'piston' ? 4 : 6, 8); world.addFx('dust', this.type === 'piston' ? this.x : world.camera.x + VIEW_W / 2, 0, this.type === 'piston' ? this.z : 20, { count: 8 }); break;
      case 'lightning': world.camera.shake(5, 10); world.addFx('ring', this.x, 4, this.z, { r0: 6, r1: this.r * 2, color: this.info.color, flat: true }); break;
      case 'cannon': this.ballX = this.x; world.camera.shake(5, 8); world.addFx('muzzle', this.x + this.dir * 30, 12, this.z, { facing: this.dir }); particles.burst('smoke', this.x + this.dir * 30, 12, this.z, 8, { speed: 1.6, up: 1.2, vx: this.dir * 2 }); break;
      case 'gasCell': this.cloudX = this.x; particles.burst('steam', this.x, 10, this.z, 12, { speed: 1.4, up: 1, spread: 0.8, color: GAS, sizeJitter: 2 }); break;
      case 'wagon': this.wagonX = this.x; world.addFx('dust', this.x, 0, this.z, { count: 8 }); break;
      case 'kilnMouth': world.camera.shake(3, 6); particles.burst('ember', this.x, 20, this.z + 10, 10, { speed: 2, up: 1.5, vz: 2, color: LIME }); break;
      case 'tallowVat': particles.burst('ember', this.x, 36, this.z, 10, { speed: 2.4, up: 2, color: TALLOW }); break;
      case 'ledgerDrop': world.addFx('dust', this.x, 0, this.z, { count: 6 }); particles.burst('debris', this.x, 6, this.z, 10, { speed: 2.6, up: 2.4, color: '#D8CFA8' }); break;
      case 'ballastDrop': world.camera.shake(6, 8); world.addFx('dust', this.x, 0, this.z, { count: 10 }); break;
      default: break;
    }
  }
  /** Tell-phase particles: the fair warning, per type (GDD 6). */
  tellFx(world) {
    const t = this.t, k = (t - this.tellStart) / this.tellFrames;
    switch (this.type) {
      case 'steamVent': case 'aetherVent': if (t % 6 === 0) particles.burst('steam', this.x + (t % 12 ? 6 : -6), 4, this.z, 1, { speed: 0.4, up: 0.8, color: this.info.color }); break;
      case 'piston': case 'ledgerDrop': case 'ballastDrop': if (t % 8 === 0) particles.burst('dust', this.x + rng.range(-20, 20), 0, this.z + rng.range(-6, 6), 1, { speed: 0.5, up: 0.3 }); break;
      case 'lightning': if (t % 5 === 0) particles.burst('spark', this.x + rng.range(-14, 14), rng.range(0, 30), this.z + rng.range(-6, 6), 1, { speed: 1.2, up: 1, color: this.info.color }); break;
      case 'gasCell': if (t % 5 === 0) particles.burst('steam', this.x + rng.range(-10, 10), 14, this.z, 1, { speed: 0.5, up: 0.9, color: GAS, sizeJitter: 1 }); break;
      case 'limePit': if (t % 6 === 0) particles.burst('dust', this.x + rng.range(-16, 16), 2, this.z + rng.range(-6, 6), 1, { speed: 0.4, up: 0.6, color: QUICKLIME }); break;
      case 'wagon': if (t % 6 === 0) particles.burst('dust', this.x + rng.range(-20, 20), 0, this.z + 10, 1, { speed: 0.6, up: 0.4 }); break;
      case 'tallowVat': if (t % Math.max(2, 8 - Math.round(k * 6)) === 0) particles.burst('steam', this.x + rng.range(-18, 18), 40, this.z, 1, { speed: 0.3, up: 1.2, color: '#f0e2c0', sizeJitter: 1 }); break;
      case 'kilnMouth': if (t % 4 === 0) particles.burst('ember', this.x + rng.range(-12, 12), rng.range(10, 40), this.z + 4, 1, { speed: 0.8, up: 0.8, color: k > 0.5 ? LIME : '#ff9a30' }); break;
      case 'cannon': if (t % 10 === 0) particles.burst('smoke', this.x, 16, this.z, 1, { speed: 0.3, up: 0.8 }); break;
      default: break;
    }
  }
  /** Active-phase particles for the stationary area-hit types. */
  activeFx(world) {
    const t = this.t;
    switch (this.type) {
      case 'lightning': if (t % 3 === 0) particles.burst('spark', this.x, 12, this.z, 3, { speed: 2.6, up: 1.6, color: this.info.color }); break;
      case 'piston': case 'ledgerDrop': case 'ballastDrop': break;
      case 'limePit': if (t % 3 === 0) particles.burst('steam', this.x, 8, this.z, 2, { speed: 1, up: 3, spread: 0.6, color: QUICKLIME, sizeJitter: 1.5 }); break;
      case 'tallowVat':
        if (t % 3 === 0) particles.burst('ember', this.x + rng.range(-this.r, this.r), 4, this.z + rng.range(-8, 8), 1, { speed: 1, up: 1.6, color: TALLOW });
        if (world.addFire) world.addFire(this.x, this.z, this.r);
        break;
      default: if (t % 3 === 0) particles.burst('steam', this.x, 10, this.z, 2, { speed: 1, up: 3.5, spread: 0.6, color: this.info.color, sizeJitter: 1.5 }); break;
    }
  }
  /** Cannon: the ball crosses the lane in `active` frames; each frame's hit covers the stretch it just flew. */
  updateCannon(world) {
    const k0 = (this.t - this.activeStart) / this.activeFrames, k1 = (this.t - this.activeStart + 1) / this.activeFrames;
    const xa = this.x + this.dir * this.reach * k0, xb = this.x + this.dir * this.reach * k1;
    this.ballX = xb;
    const mid = (xa + xb) / 2, half = Math.abs(xb - xa) / 2 + this.r;
    if ((this.t & 1) === 0) particles.burst('smoke', xb, 14, this.z, 1, { speed: 0.6, up: 0.6 });
    // fromX = the gun: the knockback carries the body downrange, never back into the lane's mouth
    this.arm(world, this.boxHit(world, mid, this.z, half, this.lane / 2, this.hitFrom(this.x)));
  }
  /** Gas cell: the cloud drifts along its z-band, stuns what it rolls over, and goes up if anything in it is burning. */
  updateGasCell(world) {
    this.cloudX += this.drift;
    if (this.t % 3 === 0) particles.burst('steam', this.cloudX + rng.range(-this.r, this.r) * 0.6, 6, this.z + rng.range(-6, 6), 1, { speed: 0.5, up: 0.6, color: GAS, sizeJitter: 2 });
    if (world.frame - this.lastHit >= this.info.every) { this.lastHit = world.frame; this.arm(world, world.spawnAreaHit(null, this.cloudX, this.z, this.r, this.hitFrom(this.cloudX))); }
    if (fireIn(world, this.cloudX, this.z, this.r, true)) this.burstCloud(world);
  }
  /** The cloud ignites: one fire knockdown for EVERYONE in it (no grace - lighting it is the punishment), then the cell is spent. */
  burstCloud(world) {
    const R = Math.round(this.r * 1.6), cx = this.cloudX;
    world.spawnAreaHit(null, cx, this.z, R, { ...this.info.burst, fromX: cx });
    world.addFx('ring', cx, 0, this.z, { r1: R, flat: true, color: GAS });
    world.addFx('flash', cx, 0, this.z, { color: '#b8f09a', life: 5 });
    particles.burst('ember', cx, 12, this.z, 16, { speed: 3.5, up: 3, color: '#ff9a30' }); particles.burst('smoke', cx, 12, this.z, 10, { speed: 1.6, up: 1.4 });
    world.camera.shake(7, 10);
    audio.play('explosion');
    if (world.addFire) world.addFire(cx, this.z, R);
    this.spent = true; this.phase = 'idle';
  }
  /** Wagon: rolls x -> x1; a moving knockdown that throws the body on down the road. */
  updateWagon(world) {
    const dir = this.wagonDir;
    this.wagonX += dir * this.speed;
    if (this.t % 4 === 0) particles.burst('dust', this.wagonX - dir * 16, 0, this.z + 8, 1, { speed: 0.8, up: 0.5 });
    if (world.frame - this.lastHit >= this.info.every) { this.lastHit = world.frame; this.arm(world, world.spawnAreaHit(null, this.wagonX, this.z, this.r, this.hitFrom(this.wagonX - dir * this.r))); }
  }
  /** Kiln mouth: a rectangular flash x±halfW, z..z+reach (a box hit, not a circle), and a fire source while it burns. */
  updateKiln(world) {
    const cz = this.z + this.reach / 2;
    if ((this.t & 1) === 0) particles.burst('ember', this.x + rng.range(-this.halfW, this.halfW), 6, this.z + rng.range(0, this.reach), 1, { speed: 1.4, up: 2, color: LIME });
    if (world.frame - this.lastHit >= this.info.every) { this.lastHit = world.frame; this.arm(world, this.boxHit(world, this.x, cz, this.halfW, this.reach / 2, this.hitFrom(this.x))); }
    if (world.addFire) world.addFire(this.x, cz, this.reach / 2);
  }
  /**
   * Gas seep: event-driven, not periodic. 'tell' = seeping (harmless rose gas, the warning that fire will light it),
   * 'active' = the burst, 'idle' = recharging for `period` frames before it seeps again.
   */
  updateSeep(world) {
    this.t++;
    if (this.phase === 'idle') { if (this.t >= this.period) { this.phase = 'tell'; this.t = 0; if (world.camera.isVisible(this.x, 120)) audio.play(this.info.tellSfx, { volume: 0.4 }); } return; }
    if (!world.camera.isVisible(this.x, 120)) return;
    if (this.phase === 'tell') {
      if (this.t % 4 === 0) particles.burst('steam', this.x + ((this.t >> 2) % 3 - 1) * 8, 2, this.z + ((this.t >> 3) % 3 - 1) * 6, 1, { speed: 0.3, up: 0.7, color: ROSE, sizeJitter: 1.5 });
      if (fireIn(world, this.x, this.z, this.r)) {
        this.phase = 'active'; this.t = 0;
        audio.play(this.info.sfx); world.camera.shake(6, 10);
        world.addFx('ring', this.x, 0, this.z, { r1: this.r, flat: true, color: ROSE }); world.addFx('flash', this.x, 0, this.z, { color: ROSE, life: 5 });
        particles.burst('ember', this.x, 10, this.z, 14, { speed: 3.2, up: 2.8, color: ROSE }); particles.burst('smoke', this.x, 10, this.z, 8, { speed: 1.4, up: 1.2 });
      }
      return;
    }
    if ((this.t & 1) === 0) particles.burst('ember', this.x + rng.range(-10, 10), 8, this.z, 2, { speed: 2.4, up: 2, color: ROSE });
    if (world.frame - this.lastHit >= this.info.every) { this.lastHit = world.frame; this.arm(world, world.spawnAreaHit(null, this.x, this.z, this.r, this.hitFrom(this.x))); }
    if (world.addFire) world.addFire(this.x, this.z, this.r);
    if (this.t >= this.activeFrames) { this.phase = 'idle'; this.t = 0; }
  }
  /**
   * A rectangular ownerless hit: x±r, z±zTol, tall enough for a standing body (world.areaHit forces hit.z = r, so the
   * cannon's lane and the kiln's cone build their Projectile here).
   */
  boxHit(world, x, z, r, zTol, hit) {
    return world.add(new Projectile({ owner: null, team: TEAM.NONE, x, y: r * 0.5, z, r, life: 2, style: 'explosion', hit: { ...hit, friendly: true, z: zTol }, pierce: 99 }));
  }
  /** The hit this hazard deals, tagged with where it came from so the knockback throws the body clear (fighter.takeHit). */
  hitFrom(x) { return { ...this.info.hit, fromX: x }; }
  /**
   * Gate one of this hazard's area hits by the per-body grace window: anyone it caught recently is skipped, and
   * whoever it catches now is off-limits for `grace` frames. An active window therefore lands ONE hit per body
   * instead of re-hitting every `every` frames while the victim is still airborne and cannot act.
   */
  arm(world, p) {
    const grace = this.info.grace || HAZARD_GRACE;
    for (const [id, until] of this.immune) { if (world.frame >= until) this.immune.delete(id); else p.hitTargets.add(id); }
    p.onHit = (t) => { if (t.kind !== 'prop') this.immune.set(t.id, world.frame + grace); };
    return p;
  }
  /** Swinging hook: a moving area hit along its arc. */
  hitSweep(world) {
    if (world.frame - this.lastHit < this.info.every) return;
    this.lastHit = world.frame;
    const hx = this.x + this.swingX;
    const p = this.arm(world, world.spawnAreaHit(null, hx, this.z, this.r, this.hitFrom(hx)));
    p.y = 30;
  }
  /** Pylon crossbar: sweeps the back lane (z < lane) across the whole screen. */
  laneHit(world) {
    const cam = world.camera;
    // no `fromX`: the bar spans the screen, so there is no side to be thrown clear of — you step forward in z instead
    this.arm(world, world.add(new Projectile({ owner: null, team: TEAM.NONE, x: cam.x + VIEW_W / 2, y: 30, z: 0, r: this.r, life: 2, style: 'explosion', hit: this.info.hit, pierce: 99 })));
  }
  draw(ctx, cam) {
    const st = this.world && this.world.stage;
    if (st && st.transition && st.transition.kind === 'lift') return; // the dock hazards stay behind while the lift descends
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
        if (ph === 'active') this.drawPlume(ctx, sx, sy, f, info.color, '#ffffff');
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
        if (ph === 'tell' && (f & 4)) { ctx.strokeStyle = TELL_RED; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, sy, 32, 12, 0, 0, Math.PI * 2); ctx.stroke(); }
        const top = sy - 44 - h, shaft = tones('#3a3a44'), head = tones(ph === 'active' ? '#6a6e78' : info.color);
        rrect(ctx, sx - 8, top - 240, 16, 240, 2, shaft.base, OL, 1); ctx.fillStyle = shaft.sh; ctx.fillRect(sx + 2, top - 238, 5, 236); ctx.fillStyle = shaft.hi; ctx.fillRect(sx - 6, top - 238, 2, 236);
        rrect(ctx, sx - 32, top, 64, 44, 4, head.base, OL, 1);
        ctx.fillStyle = head.sh; ctx.fillRect(sx - 30, top + 28, 60, 14); ctx.fillStyle = head.hi; ctx.fillRect(sx - 30, top + 2, 60, 2);
        ctx.fillStyle = tones('#C9963A').base; ctx.fillRect(sx - 28, top + 8, 56, 4); ctx.fillStyle = tones('#C9963A').hi; for (let i = 0; i < 6; i++) ctx.fillRect(sx - 26 + i * 10, top + 16, 2, 2);
        if (ph === 'tell' && (f & 2)) { ctx.fillStyle = TELL_RED; ctx.fillRect(sx - 4, top + 34, 8, 4); }
        break;
      }
      case 'hook': {
        // A pendulum, not a slider: the eye stays HOOK_CHAIN from the pivot, so the head rides up at the ends of
        // the sweep, and the whole head (eye, shank, barb) is drawn in the chain's frame so it hangs off the chain
        // instead of standing bolt upright beside it.
        const top = sy - 230, dx = this.swingX;
        const a = Math.asin(Math.max(-1, Math.min(1, dx / HOOK_CHAIN)));
        const hx = Math.round(sx + dx), hy = Math.round(top + Math.sqrt(HOOK_CHAIN * HOOK_CHAIN - dx * dx));
        // gantry beam the chain runs from
        rrect(ctx, sx - 60, top - 8, 120, 10, 2, tones('#3A3F4B').base, OL, 1); ctx.fillStyle = tones('#C9963A').hi; for (let i = 0; i < 6; i++) ctx.fillRect(sx - 54 + i * 20, top - 4, 2, 2);
        ctx.strokeStyle = '#5a5a62'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = '#9a9aa4'; for (let i = 1; i < 10; i++) ctx.fillRect(Math.round(sx + (hx - sx) * i / 10) - 1, Math.round(top + (hy - top) * i / 10) - 2, 2, 4);
        // head, in the chain's frame: shank and barb are ONE path (ART_STYLE 0.7) running out of the eye at the
        // origin, so the steel is continuous from the chain to the point instead of a ring beside a loose curve
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(-a);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const hookPath = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 5); ctx.arc(0, 17, 12, Math.PI * 1.5, Math.PI * 0.3, true); ctx.stroke(); };
        ctx.strokeStyle = OL; ctx.lineWidth = 8; hookPath();
        ctx.strokeStyle = '#9a9aa4'; ctx.lineWidth = 5; hookPath();
        ctx.strokeStyle = '#c8d0d8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-1, 16, 12, Math.PI * 1.42, Math.PI * 0.9, true); ctx.stroke();
        circle(ctx, 0, 0, 6, tones('#C9963A').base, OL, 1);
        ctx.fillStyle = tones('#C9963A').hi; ctx.fillRect(-3, -4, 2, 3);
        ctx.restore();
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(hx, sy, 14, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        break;
      }
      case 'lightning': {
        // conductor mast: an iron rod with a copper coil head, and the ring on the deck the strike will fill
        const k = ph === 'tell' ? (this.t - this.tellStart) / this.tellFrames : ph === 'active' ? 1 : 0;
        if (k > 0) {
          ctx.globalAlpha = 0.18 + 0.5 * k;
          ctx.strokeStyle = info.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(sx, sy, this.r * (0.5 + 0.5 * k), this.r * 0.38 * (0.5 + 0.5 * k), 0, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 0.1 + 0.25 * k; ctx.fillStyle = info.color;
          ctx.beginPath(); ctx.ellipse(sx, sy, this.r * 0.9, this.r * 0.34, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        const mast = tones('#3A3F4B');
        rrect(ctx, sx - 4, sy - 96, 8, 96, 2, mast.base, OL, 1);
        ctx.fillStyle = mast.hi; ctx.fillRect(sx - 3, sy - 94, 2, 92);
        for (let i = 0; i < 3; i++) circle(ctx, sx, sy - 92 + i * 6, 5, tones('#B87333').base, OL, 1);
        circle(ctx, sx, sy - 104, 4 + k * 3, ph === 'active' ? '#ffffff' : info.color, OL, 1);
        if (ph === 'tell' && (f & 2)) { ctx.strokeStyle = info.color; ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { const a = f * 0.5 + i * 2.1; ctx.beginPath(); ctx.moveTo(sx, sy - 104); ctx.lineTo(sx + Math.cos(a) * (8 + k * 10), sy - 104 + Math.sin(a) * (8 + k * 10)); ctx.stroke(); } }
        if (ph === 'active') {
          // the strike: a forked bolt from off the top of the screen into the coil, redrawn every frame
          ctx.strokeStyle = 'rgba(230,238,255,0.95)'; ctx.lineWidth = 3;
          let bx = sx, by = -10;
          ctx.beginPath(); ctx.moveTo(bx, by);
          for (let i = 0; i < 8 && by < sy - 104; i++) { bx += ((f * 7 + i * 53) % 21) - 10; by += 26; ctx.lineTo(bx, Math.min(by, sy - 104)); }
          ctx.lineTo(sx, sy - 104); ctx.stroke();
          ctx.strokeStyle = 'rgba(155,123,255,0.5)'; ctx.lineWidth = 7; ctx.stroke();
          ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(sx, sy, this.r, this.r * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        }
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
          if (f % 10 < 5) { ctx.fillStyle = TELL_RED; ctx.fillRect(0, y0 + lane - 2, VIEW_W, 2); }
        }
        const by = y0 - 34 - h, bar = tones(info.color);
        rrect(ctx, -10, by, VIEW_W + 20, 26, 3, bar.base, OL, 1);
        ctx.fillStyle = bar.sh; ctx.fillRect(0, by + 16, VIEW_W, 9); ctx.fillStyle = bar.hi; ctx.fillRect(0, by + 1, VIEW_W, 2);
        ctx.fillStyle = tones('#C9963A').base; for (let x = 10; x < VIEW_W; x += 40) ctx.fillRect(x, by + 6, 8, 14);
        ctx.fillStyle = tones('#C9963A').hi; for (let x = 10; x < VIEW_W; x += 40) ctx.fillRect(x + 2, by + 8, 2, 2);
        if (ph === 'active' && (f & 1)) particles.burst('spark', cam.x + vrng.range(0, VIEW_W), 30, 10, 1, { speed: 3, up: 1 });
        break;
      }
      case 'cannon': this.drawCannon(ctx, cam, sx, sy, f); break;
      case 'gasCell': this.drawGasCell(ctx, cam, sx, sy, f); break;
      case 'limePit': this.drawLimePit(ctx, sx, sy, f); break;
      case 'wagon': this.drawWagon(ctx, cam, sy, f); break;
      case 'tallowVat': this.drawTallowVat(ctx, sx, sy, f); break;
      case 'kilnMouth': this.drawKiln(ctx, sx, sy, f); break;
      case 'ledgerDrop': case 'ballastDrop': this.drawDrop(ctx, sx, sy, f); break;
      case 'gasSeep': this.drawSeep(ctx, sx, sy, f); break;
      default: break;
    }
  }
  /** The vent eruption column (shared by the vents and the lime pit): a translucent outer jet with a hot white core. */
  drawPlume(ctx, sx, sy, f, color, core) {
    const k = Math.min(1, (this.t - this.activeStart) / 6), h = (58 + Math.sin(f * 0.5) * 8) * k;
    ctx.globalAlpha = 0.6; ctx.fillStyle = color;
    pathPoly(ctx, [sx - 12, sy - 2, sx + 12, sy - 2, sx + 20, sy - h, sx - 20, sy - h]); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.fillStyle = core; pathPoly(ctx, [sx - 5, sy - 2, sx + 5, sy - 2, sx + 7, sy - h * 0.7, sx - 7, sy - h * 0.7]); ctx.fill();
    ctx.globalAlpha = 1;
  }
  /** The piston-style tell on the floor: a shadow that fills in, ringed red on alternate frames. */
  drawTellShadow(ctx, sx, sy, f, k, rx, ry) {
    ctx.globalAlpha = k; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    if (this.phase === 'tell' && (f & 4)) { ctx.strokeStyle = TELL_RED; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); }
  }
  /** Run-out gun: a carriage on the deck, the barrel running out over the tell, the lane lit on the planks, then the shot. */
  drawCannon(ctx, cam, sx, sy, f) {
    const ph = this.phase, dir = this.dir, k = ph === 'tell' ? (this.t - this.tellStart) / this.tellFrames : 0;
    const y0 = FLOOR_TOP + cam.shakeY, half = this.lane / 2;
    // the lane: a violet band on the deck that fills in over the tell, red edge lines flashing (the crossbar's language)
    if (ph !== 'idle') {
      const lx0 = dir > 0 ? Math.max(0, sx) : Math.max(0, cam.toScreenX(this.x - this.reach)), lx1 = dir > 0 ? Math.min(VIEW_W, cam.toScreenX(this.x + this.reach)) : Math.min(VIEW_W, sx);
      if (lx1 > lx0) {
        ctx.globalAlpha = ph === 'active' ? 0.35 : 0.08 + 0.22 * k; ctx.fillStyle = STORM; ctx.fillRect(lx0, y0 + this.z - half, lx1 - lx0, this.lane); ctx.globalAlpha = 1;
        if (ph === 'active' || f % 10 < 5) { ctx.fillStyle = TELL_RED; ctx.fillRect(lx0, y0 + this.z - half, lx1 - lx0, 1); ctx.fillRect(lx0, y0 + this.z + half - 1, lx1 - lx0, 1); }
      }
    }
    // barrel length: parked 18, runs out to 40 over the tell, recoils to 26 on firing and creeps home over the idle
    let len = 18;
    if (ph === 'tell') len = 18 + 22 * k; else if (ph === 'active') len = 26 + 14 * Math.max(0, 1 - (this.t - this.activeStart) / 4); else if (this.t < 40) len = 26 - 8 * (this.t / 40);
    len = Math.round(len);
    const wood = tones('#5a3a22'), iron = tones(this.info.color), brass = tones('#C9963A');
    // carriage: a wooden block on two iron wheels, facing downrange
    ctx.save(); ctx.translate(sx, sy); ctx.scale(dir, 1);
    circle(ctx, -10, -6, 7, iron.base, OL, 1); circle(ctx, 10, -6, 7, iron.base, OL, 1);
    ctx.fillStyle = iron.hi; ctx.fillRect(-12, -10, 3, 1); ctx.fillRect(8, -10, 3, 1);
    rrect(ctx, -16, -20, 32, 12, 2, wood.base, OL, 1); ctx.fillStyle = wood.sh; ctx.fillRect(-15, -12, 30, 3); ctx.fillStyle = wood.hi; ctx.fillRect(-15, -19, 30, 1);
    // barrel: a tapered iron tube with a brass band, muzzle toward +x (downrange); breech stays over the carriage
    rrect(ctx, -10, -27, len + 10, 10, 3, iron.base, OL, 1); ctx.fillStyle = iron.sh; ctx.fillRect(-9, -20, len + 8, 2); ctx.fillStyle = iron.hi; ctx.fillRect(-9, -26, len + 6, 1);
    ctx.fillStyle = brass.base; ctx.fillRect(len - 6, -27, 3, 10); ctx.fillStyle = brass.hi; ctx.fillRect(len - 6, -27, 3, 1);
    circle(ctx, -10, -22, 4, iron.sh, OL, 1);                                       // breech knob
    if (ph === 'tell' && (f & 4)) { ctx.fillStyle = TELL_RED; ctx.fillRect(-4, -31, 8, 3); }   // slow match glows on the touch-hole
    if (ph === 'active') { const m = this.t - this.activeStart; if (m < 4) { ctx.globalAlpha = 0.9 - m * 0.2; circle(ctx, len + 6, -22, 8 - m, '#ffffff', null, 0); circle(ctx, len + 6, -22, 12 - m * 2, STORM, null, 0); ctx.globalAlpha = 1; } }
    ctx.restore();
    if (ph === 'active') {
      // the ball and its smear along the lane (a 2-frame trail at 64 px/f is a streak, not a dot)
      const bx = cam.toScreenX(this.ballX), by = sy - 22, tail = Math.round(this.reach / this.activeFrames);
      ctx.globalAlpha = 0.35; ctx.fillStyle = iron.base; ctx.fillRect(Math.min(bx, bx - dir * tail), by - 3, tail, 6); ctx.globalAlpha = 1;
      circle(ctx, bx, by, 7, iron.base, OL, 1); ctx.fillStyle = iron.hi; ctx.fillRect(bx - 3, by - 4, 2, 2);
      if (f & 1) particles.burst('spark', this.ballX, 20, this.z, 1, { speed: 2, up: 0.5, color: STORM });
    }
  }
  /** Gas cell: a riveted gas main junction on the floor; it swells and glows as it tells, and the cloud drifts off it. */
  drawGasCell(ctx, cam, sx, sy, f) {
    const ph = this.phase, k = ph === 'tell' ? (this.t - this.tellStart) / this.tellFrames : 0;
    const iron = tones(this.spent ? '#2e3038' : '#4a4e58'), brass = tones('#C9963A');
    const sw = Math.round(k * 3);   // the swell
    // the junction: a squat cylinder with two brass bands and a valve wheel; a green sight-glass on the front
    rrect(ctx, sx - 22 - sw, sy - 18 - sw, 44 + sw * 2, 18 + sw, 5, iron.base, OL, 1);
    ctx.fillStyle = iron.sh; ctx.fillRect(sx - 20 - sw, sy - 5, 40 + sw * 2, 4); ctx.fillStyle = iron.hi; ctx.fillRect(sx - 20 - sw, sy - 17 - sw, 40 + sw * 2, 1);
    ctx.fillStyle = brass.base; ctx.fillRect(sx - 14, sy - 18 - sw, 3, 18 + sw); ctx.fillRect(sx + 11, sy - 18 - sw, 3, 18 + sw);
    ctx.fillStyle = brass.hi; ctx.fillRect(sx - 14, sy - 18 - sw, 3, 1); ctx.fillRect(sx + 11, sy - 18 - sw, 3, 1);
    rrect(ctx, sx - 4, sy - 26 - sw, 8, 8, 2, iron.base, OL, 1); circle(ctx, sx, sy - 28 - sw, 5, brass.base, OL, 1); ctx.fillStyle = brass.hi; ctx.fillRect(sx - 1, sy - 31 - sw, 2, 2);
    // sight-glass: dark when spent, steady green, and flickering brighter as the pressure builds
    const glow = this.spent ? '#1a1418' : ph === 'tell' ? ((f & 2) ? '#c8ffb0' : GAS) : ph === 'active' ? '#1a1418' : GAS;
    rrect(ctx, sx - 5, sy - 14 - sw, 10, 7, 1, glow, OL, 1); if (glow !== '#1a1418') { ctx.fillStyle = HOT_CORE; ctx.fillRect(sx - 3, sy - 13 - sw, 2, 1); }
    if (ph === 'tell' && k > 0.3) { ctx.globalAlpha = 0.15 + 0.2 * k; ctx.fillStyle = GAS; ctx.beginPath(); ctx.ellipse(sx, sy, 26 + 10 * k, 9 + 4 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    if (ph === 'active') {
      // the cloud: a clump of soft green lobes (gas is the one place soft alpha is allowed, ART_STYLE 1) that breathes
      const cx = cam.toScreenX(this.cloudX), r = this.r, age = this.t - this.activeStart;
      const fade = Math.min(1, age / 10) * Math.min(1, (this.activeFrames - age) / 30 + 0.2);
      ctx.globalAlpha = 0.32 * fade; ctx.fillStyle = GAS;
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + f * 0.02, lx = cx + Math.cos(a) * r * 0.45, ly = sy - 12 + Math.sin(a) * 5 - (i % 2) * 8; ctx.beginPath(); ctx.ellipse(Math.round(lx), Math.round(ly), r * 0.6 + Math.sin(f * 0.1 + i) * 3, r * 0.3 + (i % 2) * 4, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 0.22 * fade; ctx.fillStyle = '#c8ffb0'; ctx.beginPath(); ctx.ellipse(cx, sy - 14, r * 0.5, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.2 * fade; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(cx, sy, r, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  /** Lime pit: a stone-rimmed pit of quicklime with rite-lime seams; the rim rattles on the tell and it blows a white plume. */
  drawLimePit(ctx, sx, sy, f) {
    const ph = this.phase, rattle = ph === 'tell' ? ((this.t >> 1) & 1 ? 1 : -1) : 0;
    const stone = tones('#6e6a5e'), lime = tones(QUICKLIME);
    rrect(ctx, sx - 28 + rattle, sy - 11, 56, 22, 3, stone.base, OL, 1);
    ctx.fillStyle = stone.sh; ctx.fillRect(sx - 26 + rattle, sy + 6, 52, 4); ctx.fillStyle = stone.hi; ctx.fillRect(sx - 26 + rattle, sy - 10, 52, 1);
    rrect(ctx, sx - 23 + rattle, sy - 7, 46, 14, 2, lime.sh, OL, 1); ctx.fillStyle = lime.base; ctx.fillRect(sx - 21 + rattle, sy - 5, 42, 8);
    ctx.fillStyle = lime.hi; ctx.fillRect(sx - 18 + rattle, sy - 4, 12, 2); ctx.fillRect(sx + 4 + rattle, sy - 2, 8, 2);
    // rite-lime seams in the powder: steady when dormant, flashing with the rattle
    ctx.fillStyle = ph === 'tell' ? ((f & 4) ? LIME : '#8a9a40') : ph === 'active' ? '#ffffff' : LIME;
    ctx.fillRect(sx - 12 + rattle, sy, 9, 1); ctx.fillRect(sx + 2 + rattle, sy - 3, 7, 1); ctx.fillRect(sx + 12 + rattle, sy + 2, 6, 1);
    if (ph === 'active') this.drawPlume(ctx, sx, sy, f, QUICKLIME, '#ffffff');
  }
  /** Runaway wagon: a wooden dray of tallow casks on iron wheels; chocked while parked, rocking on the tell, rolling when live. */
  drawWagon(ctx, cam, sy, f) {
    const ph = this.phase, wx = cam.toScreenX(ph === 'active' ? this.wagonX : this.x), dir = this.wagonDir;
    const rock = ph === 'tell' ? ((this.t >> 2) & 1 ? 1 : 0) : 0;
    const wood = tones(this.info.color), iron = tones('#3A3F4B'), cask = tones(TALLOW), brass = tones('#C9963A');
    // shadow, wheels, bed, casks: drawn back to front so the near wheel overlaps the bed's lip
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(wx, sy + 2, 34, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    const ang = (ph === 'active' ? this.wagonX : this.x) * 0.11;
    const wheel = (x) => {
      circle(ctx, x, sy - 9, 9, iron.base, OL, 1); circle(ctx, x, sy - 9, 6, wood.sh, OL, 1);
      ctx.strokeStyle = wood.hi; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < 4; i++) { const a = ang + i * Math.PI / 4; ctx.moveTo(x - Math.cos(a) * 5, sy - 9 - Math.sin(a) * 5); ctx.lineTo(x + Math.cos(a) * 5, sy - 9 + Math.sin(a) * 5); }
      ctx.stroke(); circle(ctx, x, sy - 9, 2, brass.base, OL, 1);
    };
    wheel(wx - 18);
    rrect(ctx, wx - 28, sy - 30 - rock, 56, 16, 2, wood.base, OL, 1);
    ctx.fillStyle = wood.sh; ctx.fillRect(wx - 26, sy - 18 - rock, 52, 3); ctx.fillStyle = wood.hi; ctx.fillRect(wx - 26, sy - 29 - rock, 52, 1);
    ctx.fillStyle = wood.sh; for (let i = -20; i <= 20; i += 10) ctx.fillRect(wx + i, sy - 28 - rock, 1, 12);       // plank seams
    ctx.fillStyle = brass.base; ctx.fillRect(wx - 28, sy - 22 - rock, 56, 2); ctx.fillStyle = brass.hi; ctx.fillRect(wx - 28, sy - 22 - rock, 56, 1);   // iron strap
    for (let i = -1; i <= 1; i++) { rrect(ctx, wx + i * 16 - 7, sy - 44 - rock, 14, 16, 4, cask.base, OL, 1); ctx.fillStyle = cask.sh; ctx.fillRect(wx + i * 16 - 5, sy - 32 - rock, 10, 3); ctx.fillStyle = cask.hi; ctx.fillRect(wx + i * 16 - 5, sy - 43 - rock, 10, 1); ctx.fillStyle = iron.base; ctx.fillRect(wx + i * 16 - 7, sy - 38 - rock, 14, 2); }
    wheel(wx + 18);
    if (ph !== 'active') {
      // chocks under the downhill wheel, and the brake lamp blinking red through the tell
      ctx.fillStyle = OL; pathPoly(ctx, [wx + dir * 27, sy, wx + dir * 33, sy, wx + dir * 27, sy - 6]); ctx.fill();
      if (ph === 'tell' && (f & 4)) { circle(ctx, wx - dir * 26, sy - 36 - rock, 3, TELL_RED, OL, 1); }
    } else if (f & 1) particles.burst('dust', this.wagonX - dir * 22, 2, this.z + 6, 1, { speed: 1, up: 0.6 });
  }
  /** Tallow vat: an iron cauldron over a grate fire; the fat rises and bubbles on the tell and pours over the lip when live. */
  drawTallowVat(ctx, sx, sy, f) {
    const ph = this.phase, k = ph === 'tell' ? (this.t - this.tellStart) / this.tellFrames : 0;
    const iron = tones('#3A3F4B'), fat = tones(TALLOW), brass = tones('#C9963A');
    // grate fire (always lit: it is what boils the vat) - flat glow triangles with a hot core
    ctx.fillStyle = iron.sh; ctx.fillRect(sx - 22, sy - 8, 44, 8);
    for (let i = -2; i <= 2; i++) { const h = 6 + ((f + i * 3) % 5); ctx.fillStyle = i % 2 ? '#ff9a30' : '#ff5a1f'; pathPoly(ctx, [sx + i * 8 - 3, sy - 1, sx + i * 8 + 3, sy - 1, sx + i * 8, sy - 1 - h]); ctx.fill(); }
    ctx.fillStyle = HOT_CORE; ctx.fillRect(sx - 1, sy - 5, 2, 2);
    if (ph === 'active') {
      // the boil-over: a pool of burning fat on the floor and runnels down the vat's sides
      const a = Math.min(1, (this.t - this.activeStart) / 6);
      ctx.globalAlpha = 0.75 * a; ctx.fillStyle = fat.base; ctx.beginPath(); ctx.ellipse(sx, sy + 2, this.r * a, this.r * 0.4 * a, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9 * a; ctx.fillStyle = fat.hi; ctx.beginPath(); ctx.ellipse(sx - 6, sy + 1, this.r * 0.4 * a, this.r * 0.14 * a, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    // the vat: a wide iron drum with a brass band, shaded on the right
    rrect(ctx, sx - 26, sy - 44, 52, 38, 6, iron.base, OL, 1);
    ctx.fillStyle = iron.sh; ctx.fillRect(sx + 12, sy - 40, 12, 30); ctx.fillStyle = iron.hi; ctx.fillRect(sx - 24, sy - 42, 3, 30);
    ctx.fillStyle = brass.base; ctx.fillRect(sx - 26, sy - 30, 52, 3); ctx.fillStyle = brass.hi; ctx.fillRect(sx - 26, sy - 30, 52, 1);
    // rim + surface: the surface climbs the rim over the tell, then the runnels pour off the lip
    const rise = Math.round(k * 4);
    ctx.fillStyle = OL; ctx.beginPath(); ctx.ellipse(sx, sy - 44, 27, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = iron.hi; ctx.beginPath(); ctx.ellipse(sx, sy - 45, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ph === 'active' ? fat.hi : fat.base; ctx.beginPath(); ctx.ellipse(sx, sy - 45 - rise, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fat.sh; ctx.beginPath(); ctx.ellipse(sx + 6, sy - 44 - rise, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
    if (ph === 'tell') { ctx.fillStyle = fat.hi; for (let i = 0; i < 1 + Math.round(k * 4); i++) { const bx = sx - 16 + ((f * 3 + i * 29) % 32), by = sy - 46 - rise - ((f + i * 7) % 4); circle(ctx, bx, by, 2, fat.hi, fat.sh, 1); } }
    if (ph === 'active') { ctx.fillStyle = fat.base; ctx.fillRect(sx - 24, sy - 44, 5, 30 + ((f >> 1) % 8)); ctx.fillRect(sx + 14, sy - 44, 4, 24 + ((f >> 1) % 6)); ctx.fillStyle = fat.hi; ctx.fillRect(sx - 23, sy - 44, 2, 20); }
  }
  /** Kiln mouth: a brick arch in the back wall; the throat glows rite-lime through the tell and flashes a cone down the floor. */
  drawKiln(ctx, sx, sy, f) {
    const ph = this.phase, k = ph === 'tell' ? (this.t - this.tellStart) / this.tellFrames : ph === 'active' ? 1 : 0;
    const brick = tones('#6b3b2a'), dark = tones('#2a1a18'), hw = this.halfW;
    if (ph === 'active') {
      // the flash: a lime cone x±halfW from the mouth `reach` px down the floor, white core, drawn under the arch
      const a = 0.45 + 0.2 * ((f & 2) ? 1 : 0);
      ctx.globalAlpha = a; ctx.fillStyle = LIME; ctx.fillRect(sx - hw, sy, hw * 2, this.reach);
      ctx.globalAlpha = 0.8; ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - Math.round(hw * 0.4), sy, Math.round(hw * 0.8), this.reach - 10); ctx.globalAlpha = 1;
      ctx.fillStyle = LIME; for (let i = 0; i < 3; i++) { const fh = 40 + ((f * 5 + i * 17) % 20); pathPoly(ctx, [sx - hw + i * hw, sy, sx - hw + i * hw + Math.round(hw * 0.9), sy, sx - hw + i * hw + Math.round(hw * 0.45), sy - fh]); ctx.fill(); }
    } else if (k > 0.4) { ctx.globalAlpha = 0.1 + 0.25 * k; ctx.fillStyle = LIME; ctx.fillRect(sx - hw, sy, hw * 2, Math.round(this.reach * k)); ctx.globalAlpha = 1; if (f & 4) { ctx.fillStyle = TELL_RED; ctx.fillRect(sx - hw, sy + Math.round(this.reach * k) - 1, hw * 2, 1); } }
    // arch: brick surround, dark throat, iron lintel with a brass plate
    rrect(ctx, sx - 34, sy - 74, 68, 74, 3, brick.base, OL, 1);
    ctx.fillStyle = brick.sh; ctx.fillRect(sx + 20, sy - 70, 12, 68); ctx.fillStyle = brick.hi; ctx.fillRect(sx - 32, sy - 72, 64, 1);
    ctx.fillStyle = brick.sh; for (let y = sy - 66; y < sy; y += 8) for (let x = sx - 32 + ((y >> 3) & 1) * 6; x < sx + 30; x += 12) ctx.fillRect(x, y, 1, 7);
    ctx.fillStyle = OL; ctx.beginPath(); ctx.moveTo(sx - 21, sy); ctx.lineTo(sx - 21, sy - 38); ctx.arc(sx, sy - 38, 21, Math.PI, 0); ctx.lineTo(sx + 21, sy); ctx.closePath(); ctx.fill();
    const glow = k <= 0 ? dark.base : k < 0.5 ? '#7a2a1a' : (f & 2) ? '#b8d85a' : '#8a6a2a';
    ctx.fillStyle = glow; ctx.beginPath(); ctx.moveTo(sx - 20, sy - 1); ctx.lineTo(sx - 20, sy - 38); ctx.arc(sx, sy - 38, 20, Math.PI, 0); ctx.lineTo(sx + 20, sy - 1); ctx.closePath(); ctx.fill();
    if (k > 0) { ctx.globalAlpha = 0.4 + 0.6 * k; ctx.fillStyle = ph === 'active' ? '#ffffff' : LIME; ctx.beginPath(); ctx.ellipse(sx, sy - 20, 10 + 8 * k, 14 + 8 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = HOT_CORE; ctx.fillRect(sx - 1, sy - 24, 2, 2); }
    rrect(ctx, sx - 36, sy - 80, 72, 8, 2, tones('#3A3F4B').base, OL, 1); ctx.fillStyle = tones('#C9963A').base; ctx.fillRect(sx - 8, sy - 78, 16, 4); ctx.fillStyle = tones('#C9963A').hi; ctx.fillRect(sx - 8, sy - 78, 16, 1);
  }
  /** Drops: the shadow grows over the tell, the load appears and falls in the last DROP_FALL frames, lands, and fades out. */
  drawDrop(ctx, sx, sy, f) {
    const ph = this.phase, ballast = this.type === 'ballastDrop';
    const tk = ph === 'tell' ? (this.t - this.tellStart) / this.tellFrames : 0;
    const falling = ph === 'tell' && this.t >= this.activeStart - DROP_FALL;
    const landed = ph === 'active' || (ph === 'idle' && this.t < DROP_FADE);
    const k = ph === 'tell' ? 0.2 + 0.5 * tk : ph === 'active' ? 0.7 : 0;
    if (k > 0) this.drawTellShadow(ctx, sx, sy, f, k, Math.round(this.r * (0.5 + 0.6 * tk + (ph === 'active' ? 0.6 : 0))), Math.round(this.r * 0.4 * (0.5 + 0.6 * tk + (ph === 'active' ? 0.6 : 0))));
    let h = -1;
    if (falling) { const q = (this.activeStart - this.t) / DROP_FALL; h = DROP_UP * q * q; }
    else if (landed) h = 0;
    if (h < 0) return;
    const y = Math.round(sy - h), fade = ph === 'idle' ? 1 - this.t / DROP_FADE : 1;
    ctx.globalAlpha = fade;
    if (ballast) {
      // an iron pig on a hoist rope: the rope only while it falls, a crack in the deck once it lands
      const iron = tones(this.info.color), rope = tones('#8a7040');
      if (h > 0) { line(ctx, sx, 0, sx, y - 24, rope.base, 3); line(ctx, sx, 0, sx, y - 24, rope.hi, 1); }
      rrect(ctx, sx - 22, y - 24, 44, 24, 3, iron.base, OL, 1);
      ctx.fillStyle = iron.sh; ctx.fillRect(sx - 20, y - 8, 40, 6); ctx.fillStyle = iron.hi; ctx.fillRect(sx - 20, y - 23, 40, 1);
      rrect(ctx, sx - 6, y - 30, 12, 7, 3, rope.base, OL, 1);
      ctx.fillStyle = tones('#C9963A').base; ctx.fillRect(sx - 16, y - 18, 8, 3); ctx.fillStyle = tones('#C9963A').hi; ctx.fillRect(sx - 16, y - 18, 8, 1);
      if (landed) { ctx.strokeStyle = OL; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - 30, sy + 2); ctx.lineTo(sx - 40, sy + 8); ctx.moveTo(sx + 28, sy + 3); ctx.lineTo(sx + 38, sy + 9); ctx.stroke(); }
    } else {
      // a stack of bound ledgers: neat while it falls, splayed with loose pages once it lands
      const leather = tones('#8a5a3a'), paper = tones(this.info.color), spl = landed ? 1 : 0;
      for (let i = 0; i < 4; i++) {
        const bx = sx - 20 + (landed ? ((i * 7) % 11) - 5 : 0), by = y - 6 - i * 6 + spl * i * 2;
        rrect(ctx, bx, by, 40, 7, 1, i % 2 ? leather.base : leather.sh, OL, 1);
        ctx.fillStyle = paper.base; ctx.fillRect(bx + 2, by + 2, 36, 2); ctx.fillStyle = paper.hi; ctx.fillRect(bx + 2, by + 2, 36, 1);
        ctx.fillStyle = tones('#C9963A').base; ctx.fillRect(bx + 4, by + 1, 3, 5);
      }
      if (landed) { ctx.fillStyle = paper.base; for (let i = 0; i < 5; i++) { const px = sx - 30 + i * 15 + ((f >> 3) % 2), pz = sy - 2 + ((i * 5) % 7); ctx.fillRect(px, pz, 9, 4); ctx.fillStyle = i % 2 ? paper.hi : paper.base; } }
    }
    ctx.globalAlpha = 1;
  }
  /** Gas seep: a fissure in the tailings floor breathing rose haze; dark while it recharges, a rose-white blast while it burns. */
  drawSeep(ctx, sx, sy, f) {
    const ph = this.phase, r = this.r;
    if (ph === 'tell') { ctx.globalAlpha = 0.16 + 0.08 * Math.sin(f * 0.08); ctx.fillStyle = ROSE; ctx.beginPath(); ctx.ellipse(sx, sy - 4, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    if (ph === 'active') {
      ctx.globalAlpha = 0.7; ctx.fillStyle = ROSE; ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(sx, sy, r * 0.5, r * 0.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = ROSE; for (let i = -2; i <= 2; i++) { const fh = 30 + ((f * 7 + i * 13) % 24); pathPoly(ctx, [sx + i * 12 - 5, sy, sx + i * 12 + 5, sy, sx + i * 12, sy - fh]); ctx.fill(); }
      ctx.fillStyle = HOT_CORE; ctx.fillRect(sx - 2, sy - 10, 4, 2);
    }
    // the fissure: a jagged crack, inked, with a rose glow line along its floor while there is gas in it
    ctx.fillStyle = OL; pathPoly(ctx, [sx - 22, sy - 1, sx - 10, sy - 5, sx + 2, sy - 2, sx + 14, sy - 6, sx + 24, sy - 1, sx + 12, sy + 3, sx - 2, sy + 1, sx - 14, sy + 4]); ctx.fill();
    ctx.fillStyle = ph === 'idle' ? '#3a2430' : (f & 4) || ph === 'active' ? ROSE : '#b03a7a';
    pathPoly(ctx, [sx - 16, sy - 1, sx - 8, sy - 3, sx + 2, sy - 1, sx + 12, sy - 4, sx + 18, sy - 1, sx + 10, sy + 1, sx, sy, sx - 10, sy + 2]); ctx.fill();
    if (ph !== 'idle') { ctx.fillStyle = HOT_CORE; ctx.fillRect(sx - 6, sy - 1, 3, 1); ctx.fillRect(sx + 8, sy - 3, 3, 1); }
  }
}

/** Build the Hazard entities for a section's `hazards` list. */
export function createHazards(list = []) { return list.map((h) => new Hazard(h)); }

// ---------------------------------------------------------------- environment zones
const MOLTEN_Z = 20, RAIL = 12, DAIS_EVERY = 30, DAIS_DMG = 4, CONVEYOR_EVERY = 240;
/** How far past the lip a scalded player is thrown, and the forward drift that carries them there. */
const MOLTEN_EJECT = 12, MOLTEN_EJECT_VZ = 4;
/** Edge shove: a body knocked down / thrown within EDGE_LANE px of a lethal edge by an attacker standing deeper in the lane drifts
 *  toward that edge at EDGE_VZ px/f while airborne (hits carry no z knockback, so this is what makes "knock them in" reachable). */
const EDGE_LANE = 30, EDGE_VZ = 2.4;
const MOLTEN_HIT = { damage: 10, type: 'knockdown', kbX: 0, kbY: 5, hitstun: 20, sfx: 'burn' };
/** Gust defaults (issue #27 Mooring Spine): a 45f rising wind, then 40f of `push` px/f drift in z for grounded fighters. */
const GUST = { period: 420, tell: 45, active: 40, push: 1.3 };
/** Spoil: grounded movement inside the patch keeps this fraction of itself per frame (the ground gives under every step). */
const SPOIL_DAMP = 0.55;
/** Net decking: a heavy landing sags a square NET_SAG frames, then it is open NET_OPEN frames. Players who drop lose NET_DROP_FRAC
 *  of max HP and are set NET_CLEAR px outside the square - health, not a life (issue #27 "a ring-out variant that costs health"). */
const NET_SAG = 10, NET_OPEN = 60, NET_DROP_FRAC = 0.08, NET_CLEAR = 10, NET_SQUARE = { w: 60, d: 30 };

/**
 * Open-rails edge loss (issue #21, GDD 7): a thrown weapon / prop still in flight is marked `lost` and made to
 * expire in place (its own onExpire — throwables.js landWeapon / landProp — reads `lost` and skips both the
 * pickup and the shatter FX, so it neither lands nor breaks, it is just gone); a resting weapon pickup that has
 * drifted past the edge is simply removed. Unlike `ringOut` this is cargo, not a body: no score, no death FX.
 */
function loseOverEdge(world, e) {
  if (e.kind === 'projectile') { e.lost = true; e.expire(world, false); } else e.removeMe = true;
  particles.burst('dust', e.x, 0, e.z, 6, { speed: 1.5, up: 1 });
}

/**
 * A floor zone with a rule: molten (Foundry Row back edge), rails (funicular railings / open decks), daisVents (boss dais edges),
 * conveyor (cargo-bay front strip), gust (Mooring Spine deck wind), spoil (tailings patches), netGive (Crop Loft net
 * squares). Drawn behind entities (z = -5).
 */
export class Zone extends Entity {
  /**
   * @param {{ type: 'molten'|'rails'|'daisVents'|'conveyor'|'gust'|'spoil'|'netGive', x0: number, x1: number, z0?: number, z1?: number, active?: boolean, color?: string, open?: boolean,
   *   period?: number, tell?: number, push?: number, dir?: number, offset?: number, squares?: {x:number, z:number, w?:number, d?:number}[] }} spec
   *   gust { period 420, tell 45, active (frames) 40, push 1.3, dir 0|1|-1 } | spoil { z0, z1 } | netGive { squares }
   *   rails { open: true } (issue #21) also discards thrown weapons / props and weapon pickups that drift over the edge (loseOverEdge)
   */
  constructor(spec) {
    super('fx');
    this.type = spec.type; this.x0 = spec.x0; this.x1 = spec.x1; this.z0 = spec.z0 != null ? spec.z0 : 100;
    this.x = (spec.x0 + spec.x1) / 2; this.z = -5; this.shadowW = 0;
    this.forced = !!spec.active;
    /** issue #21 GDD 7: a `rails` zone with no bulwark at all (open air past the edge, not a railing) also
     *  discards thrown weapons / props and dropped weapon pickups that drift past it (updateRails). */
    this.open = !!spec.open;
    this.color = spec.color || '';   // daisVents edge glow: the board's own energy colour (see draw())
    this.burns = new Map();        // fighter id -> { f, ticks, t }
    this.wasAir = new Map();       // enemy id -> was airborne last frame (edge shove detection)
    this.t = 0; this.lastCrate = 0;
    // gust: its own tell / active cycle (spec.active is the frame count here, not the molten/rails force flag)
    this.period = spec.period || GUST.period; this.tell = spec.tell != null ? spec.tell : GUST.tell;
    this.activeFrames = typeof spec.active === 'number' ? spec.active : GUST.active;
    this.push = spec.push != null ? spec.push : GUST.push; this.dir = spec.dir || 0; this.offset = spec.offset || 0;
    if (this.type === 'gust') this.forced = false;
    this.phase = 'idle'; this.phaseT = 0; this.gustDir = 1;
    // spoil: the z band, and where every grounded fighter inside it stood last frame
    this.z1 = spec.z1 != null ? spec.z1 : Z_MAX;
    this.last = new Map();
    // netGive: the marked squares and per-fighter "was falling" flags for landing detection
    this.squares = (spec.squares || []).map((s) => ({ x: s.x, z: s.z, w: s.w || NET_SQUARE.w, d: s.d || NET_SQUARE.d, sag: 0, open: 0 }));
    this.landing = new Map();
  }
  hurtbox() { return null; }
  inX(e) { return e.x >= this.x0 && e.x <= this.x1; }
  /** Enemy `f` just entered KNOCKDOWN / THROWN near a lethal edge (low = z of the back edge, high = z of the front edge, null = none):
   *  shove it over when the attacker stood deeper in the lane than the body. */
  edgeShove(f, low, high) {
    const air = f.state === ST.THROWN || f.state === ST.KNOCKDOWN;
    const was = this.wasAir.get(f.id);
    if (f.dead) this.wasAir.delete(f.id); else this.wasAir.set(f.id, air);
    if (!air || was || f.dead) return;
    const by = f.thrownBy || f.lastHitBy;
    if (!by || by.kind !== 'player') return;
    if (low != null && f.z < low + EDGE_LANE && by.z > f.z + 4) f.vz = -EDGE_VZ;
    else if (high != null && f.z > high - EDGE_LANE && by.z < f.z - 4) f.vz = EDGE_VZ;
  }
  /** The zone applies only while its arena's boss is up (conveyor / dais) or always (molten / rails). */
  get active() {
    if (this.forced) return true;
    const b = this.world && this.world.boss;
    if (this.type === 'conveyor') return !!(b && b.bossKind === 'midboss' && !b.defeated);
    if (this.type === 'daisVents') return !!(b && b.bossKind === 'boss' && !b.defeated);
    return true;
  }
  /** Is any of the zone's span on screen (sfx gate)? */
  onScreen(cam) { return this.x1 >= cam.x - 40 && this.x0 <= cam.x + VIEW_W + 40; }
  update(world) {
    this.world = world; this.t++;
    switch (this.type) {
      case 'molten': this.updateMolten(world); break;
      case 'rails': this.updateRails(world); break;
      case 'daisVents': this.updateDais(world); break;
      case 'conveyor': this.updateConveyor(world); break;
      case 'gust': this.updateGust(world); break;
      case 'spoil': this.updateSpoil(world); break;
      case 'netGive': this.updateNetGive(world); break;
      default: break;
    }
  }
  updateMolten(world) {
    for (const f of world.fighters) {
      if (!this.inX(f) || f.z >= MOLTEN_Z || f.grabbedBy) continue;
      if (f.kind === 'player') {
        // the burn rides on the scald landing: a player still invulnerable (get-up i-frames) is only shoved clear
        if (!f.dead && f.takeHit(MOLTEN_HIT, null)) this.burns.set(f.id, { f, ticks: 2, t: 0 });
        f.z = MOLTEN_Z + MOLTEN_EJECT; f.vz = MOLTEN_EJECT_VZ;
        particles.burst('ember', f.x, 6, f.z, 8, { speed: 3, up: 3, color: '#FFB347' });
      } else if (f.kind === 'boss') { f.z = MOLTEN_Z + 1; }
      else if (AIR_STATES.has(f.state) || f.airborne || f.state === ST.LYING) ringOut(world, f, 'molten');
      else f.z = MOLTEN_Z + 1;
    }
    for (const f of world.fighters) if (f.kind === 'enemy' && this.inX(f)) this.edgeShove(f, MOLTEN_Z, null);
    for (const b of this.burns.values()) {
      if (++b.t % 20 === 0) { b.f.takeHitRaw(2, 'light'); particles.burst('ember', b.f.x, 20, b.f.z, 3, { speed: 1.5, up: 2 }); if (--b.ticks <= 0 || b.f.dead) this.burns.delete(b.f.id); }
    }
    // items that fell into the channel drift back to the lip so drops from ring-outs stay collectable
    if ((this.t & 3) === 0) for (const e of world.entities) if (e.kind === 'item' && this.inX(e) && e.z < MOLTEN_Z + 4) e.z = MOLTEN_Z + 6;
  }
  updateRails(world) {
    for (const f of world.fighters) {
      if (!this.inX(f)) continue;
      if (f.kind === 'enemy') this.edgeShove(f, RAIL, Z_MAX - RAIL);
      const over = f.z < RAIL ? -1 : f.z > Z_MAX - RAIL ? 1 : 0;
      if (!over) continue;
      if (f.kind === 'enemy' && (f.state === ST.THROWN || (f.state === ST.KNOCKDOWN && f.y > 4))) { ringOut(world, f, 'rail', over); continue; }
      f.z = over < 0 ? RAIL : Z_MAX - RAIL;
      if (f.vz * over > 0) f.vz = 0;
    }
    // Open deck (no railing at all, issue #21 GDD 7): a thrown weapon / prop still in flight, or a weapon pickup
    // that has drifted, past the same front/back band falls off the edge instead of landing or staying collectable.
    if (!this.open) return;
    for (const e of world.entities) {
      if (e.removeMe || !this.inX(e)) continue;
      const cargo = (e.kind === 'projectile' && (e.thrownWeapon || e.thrownProp)) || (e.kind === 'item' && e.weaponId);
      if (!cargo) continue;
      if (e.z < RAIL || e.z > Z_MAX - RAIL) loseOverEdge(world, e);
    }
  }
  /** Boss dais (GDD 5.2): the world's floor band shrinks 20px per phase (stage.js calls shrinkBand); the closed strips are steam
   *  vents: 4 dmg every 30f to anyone inside, jets along both edges. It is a "get back on the dais" nudge, not a kill zone —
   *  the band can close faster than a knocked-down player can stand up. */
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
      // an always-on belt (`active: true`, board 3's cart lane) runs for the whole board: it only feeds crates and clunks
      // while the camera can see it, like every other periodic hazard, so the ledger house does not hear the yard
      if (!this.onScreen(world.camera)) return;
      world.add(new Prop('crate', this.x1 - 20, this.z0 + 20, { drops: rng.chance(0.25) ? 'meatPie' : ['brassCog', 'brassCog'], rider: true }));
      audio.play('hydraulic');
    }
  }
  /**
   * Gust (Mooring Spine): a rising wind for `tell` frames, then every grounded fighter in the span drifts `push` px/f in z
   * for `active` frames, clamped to the floor band. It never throws anyone: on a railed deck the rails zone clamps at the
   * rail (and only a THROWN / airborne knockdown body goes over), so the gust is what walks you toward the edge, not over it.
   * `dir` 0 alternates per cycle so the deck is never pushed the same way twice running.
   */
  updateGust(world) {
    const g = (world.frame + this.offset) % this.period, prev = this.phase;
    const tellAt = this.period - this.activeFrames - this.tell, activeAt = this.period - this.activeFrames;
    this.phase = g >= activeAt ? 'active' : g >= tellAt ? 'tell' : 'idle';
    this.phaseT = this.phase === 'active' ? g - activeAt : this.phase === 'tell' ? g - tellAt : g;
    if (this.phase !== 'idle' && prev === 'idle') this.gustDir = this.dir || ((Math.floor((world.frame + this.offset) / this.period) & 1) ? -1 : 1);
    const heard = this.onScreen(world.camera);
    if (this.phase === 'tell' && prev !== 'tell' && heard) audio.play('gale', { volume: 0.5 });
    if (this.phase === 'active' && prev !== 'active' && heard) audio.play('gale');
    if (this.phase !== 'active') return;
    const band = world.floorBand, dz = this.push * this.gustDir;
    for (const f of world.fighters) {
      if (!this.inX(f) || f.y > 0 || f.grabbedBy || f.dead || f.kind === 'boss' || f.status.netted) continue;
      f.z = clamp(f.z + dz, band.z0, band.z1);
    }
  }
  /**
   * Spoil (tailings): the ground gives under every step. Grounded fighters inside the patch keep only SPOIL_DAMP of the
   * distance they covered since last frame - walking, knockback slides and dash attacks alike - so the patch slows
   * without touching anyone's speed stat. Last positions are kept per fighter id and pruned as bodies leave or die.
   */
  updateSpoil(world) {
    const last = this.last;
    for (const f of world.fighters) {
      const inside = this.inX(f) && f.z >= this.z0 && f.z <= this.z1 && f.y <= 0 && !f.grabbedBy && f.kind !== 'boss';
      const p = last.get(f.id);
      if (!inside) { if (p) last.delete(f.id); continue; }
      if (p) {
        const dx = f.x - p.x, dz = f.z - p.z;
        if (dx || dz) {
          f.x = p.x + dx * SPOIL_DAMP; f.z = p.z + dz * SPOIL_DAMP;
          if ((world.frame + f.id) % 6 === 0 && Math.abs(dx) + Math.abs(dz) > 0.3) particles.burst('dust', f.x, 0, f.z + 4, 1, { speed: 0.6, up: 0.4, color: '#5a3a4a' });
        }
        p.x = f.x; p.z = f.z;
      } else last.set(f.id, { x: f.x, z: f.z });
    }
    if ((world.frame & 31) === 0) for (const id of last.keys()) { let seen = false; for (const f of world.fighters) if (f.id === id) { seen = true; break; } if (!seen) last.delete(id); }
  }
  /**
   * Net decking (Crop Loft): a knockdown / thrown body hitting the deck inside a marked square sags it for NET_SAG frames
   * and then it is open for NET_OPEN: enemies standing in it drop through (a ring-out, +200), players lose NET_DROP_FRAC of
   * max HP, are knocked down and set on the nearest edge. Airborne bodies over an open square are fine until they land.
   */
  updateNetGive(world) {
    for (const f of world.fighters) {
      if (f.dead) { this.landing.delete(f.id); continue; }
      const air = f.y > 0 && AIR_STATES.has(f.state);
      const was = this.landing.get(f.id);
      this.landing.set(f.id, air);
      if (!was || air || f.y > 0 || !this.inX(f)) continue;    // a falling body just hit the deck
      const sq = this.squareAt(f.x, f.z);
      if (sq && !sq.open && !sq.sag) { sq.sag = NET_SAG; audio.play('net'); particles.burst('dust', sq.x, 0, sq.z, 6, { speed: 1.2, up: 0.6 }); }
    }
    for (const sq of this.squares) {
      if (sq.sag > 0 && --sq.sag === 0) { sq.open = NET_OPEN; audio.play('prop_break'); particles.burst('debris', sq.x, 2, sq.z, 8, { speed: 2, up: 2, color: '#8a7040' }); }
      if (sq.open <= 0) continue;
      sq.open--;
      for (const f of world.fighters) {
        if (f.y > 0 || f.grabbedBy || f.dead || f.kind === 'boss' || !this.inSquare(sq, f.x, f.z)) continue;
        if (f.kind === 'player') this.dropPlayer(world, f, sq);
        else if (ringOut(world, f, 'rail', 0)) { f.vy = 2.5; f.vx = 0; f.vz = 0; }   // the rail pop is replaced by a short drop
      }
    }
  }
  inSquare(sq, x, z) { return Math.abs(x - sq.x) <= sq.w / 2 && Math.abs(z - sq.z) <= sq.d / 2; }
  squareAt(x, z) { for (const sq of this.squares) if (this.inSquare(sq, x, z)) return sq; return null; }
  /** A player fell through: knockdown that costs health (not a life) and a reposition to the nearest edge that is still floor. */
  dropPlayer(world, p, sq) {
    const band = world.floorBand;
    const edges = [
      { z: sq.z - sq.d / 2 - NET_CLEAR, d: p.z - (sq.z - sq.d / 2) }, { z: sq.z + sq.d / 2 + NET_CLEAR, d: (sq.z + sq.d / 2) - p.z },
      { x: sq.x - sq.w / 2 - NET_CLEAR, d: p.x - (sq.x - sq.w / 2) }, { x: sq.x + sq.w / 2 + NET_CLEAR, d: (sq.x + sq.w / 2) - p.x },
    ].filter((e) => e.z == null || (e.z >= band.z0 && e.z <= band.z1)).sort((a, b) => a.d - b.d);
    const e = edges[0] || { x: sq.x + sq.w / 2 + NET_CLEAR };
    if (e.z != null) p.z = e.z; else p.x = e.x;
    p.vx = 0; p.vz = 0;
    const dmg = Math.max(1, Math.round(p.maxHp * NET_DROP_FRAC));
    // otg: the body that opened the square is usually still LYING on it, and a lying fighter ignores hits without it
    p.takeHit({ damage: dmg, type: 'knockdown', kbX: 0, kbY: 5, hitstun: 20, fromX: sq.x, sfx: 'net', otg: true }, null);
    floatText(p.x, p.y + p.h + 14, p.z, 'THROUGH!', ROSE, 1);
    particles.burst('debris', sq.x, 2, sq.z, 6, { speed: 1.6, up: 1.8, color: '#8a7040' });
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
      // glow lines along the closed band edges (the world paints the vent strips themselves). The colour is the
      // BOARD's energy colour, not a constant: aether cyan is Concordat machinery (GDD 1), so a board that has no
      // Concordat left on it passes its own — `{ type: 'daisVents', color: '#D8FF6E' }` on the Chandlery's floor.
      const band = this.world.floorBand || { z0: 0, z1: Z_MAX };
      ctx.fillStyle = this.color || '#4DF0E0'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(f * 0.3);
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
    } else if (this.type === 'gust') {
      if (this.phase === 'idle') return;
      // wind streaks running the push direction (z = down the screen), thickening through the tell; chevrons on the
      // deck edges say which way before anyone moves. Deterministic per index: a flickering random field reads as noise.
      const k = this.phase === 'tell' ? this.phaseT / Math.max(1, this.tell) : 1, dir = this.gustDir, n = 8 + Math.round(16 * k);
      ctx.globalAlpha = 0.18 + 0.3 * k; ctx.strokeStyle = this.color || '#d8d0ff'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = x0 + ((i * 97 + 13) % Math.max(1, x1 - x0)), len = 8 + (i % 3) * 5, sp = 2 + (i % 3);
        const y = sy0 + (((f * sp * dir + i * 31) % Z_MAX) + Z_MAX) % Z_MAX;
        ctx.moveTo(x, y); ctx.lineTo(x + 2, y + dir * len);
      }
      ctx.stroke();
      if (this.phase === 'tell' && (f & 8)) { ctx.fillStyle = STORM; const ey = dir > 0 ? sy0 + Z_MAX - 6 : sy0 + 2; for (let x = x0 + 20; x < x1 - 10; x += 60) { pathPoly(ctx, dir > 0 ? [x, ey, x + 10, ey, x + 5, ey + 5] : [x, ey + 5, x + 10, ey + 5, x + 5, ey]); ctx.fill(); } }
      ctx.globalAlpha = 1;
    } else if (this.type === 'spoil') {
      // a patch of slumped tailings: dark slag with rose glints, inked like a prop so it reads as ground, not a shadow
      const y = sy0 + this.z0, h = this.z1 - this.z0, slag = tones('#4a2f3c');
      rrect(ctx, x0, y, x1 - x0, h, 6, slag.base, OL, 1);
      ctx.fillStyle = slag.sh; ctx.fillRect(x0 + 2, y + h - 5, x1 - x0 - 4, 3); ctx.fillStyle = slag.hi; ctx.fillRect(x0 + 3, y + 1, x1 - x0 - 6, 1);
      for (let x = x0 + 8; x < x1 - 8; x += 22) { const ly = y + 4 + ((x >> 2) % Math.max(1, h - 10)); rrect(ctx, x, ly, 8, 4, 2, slag.sh, OL, 1); ctx.fillStyle = (x >> 1) % 3 ? ROSE : '#b03a7a'; ctx.fillRect(x + 3, ly + 1, 2, 1); }
    } else if (this.type === 'netGive') {
      // marked net squares: a rope grid with rose tape at the corners; sagging squares bow, open squares are a dark hole
      const rope = tones('#8a7040');
      for (const sq of this.squares) {
        const sx = cam.toScreenX(sq.x), sxx0 = sx - sq.w / 2, syy0 = sy0 + sq.z - sq.d / 2;
        if (sxx0 + sq.w < 0 || sxx0 > VIEW_W) continue;
        if (sq.open > 0) {
          ctx.globalAlpha = 0.88; ctx.fillStyle = '#120c14'; ctx.fillRect(sxx0, syy0, sq.w, sq.d); ctx.globalAlpha = 1;
          ctx.strokeStyle = rope.base; ctx.lineWidth = 1; ctx.beginPath();
          for (let x = sxx0 + 5; x < sxx0 + sq.w; x += 10) { ctx.moveTo(x, syy0); ctx.lineTo(x + 1, syy0 + 4); ctx.moveTo(x, syy0 + sq.d); ctx.lineTo(x - 1, syy0 + sq.d - 4); }   // frayed ends
          ctx.stroke();
        } else {
          const sag = sq.sag > 0 ? 1 + ((f >> 1) & 1) : 0;
          ctx.globalAlpha = 0.8; ctx.strokeStyle = rope.base; ctx.lineWidth = 1; ctx.beginPath();
          for (let x = sxx0; x <= sxx0 + sq.w; x += 10) { ctx.moveTo(x, syy0); ctx.lineTo(x, syy0 + sq.d + sag); }
          for (let y = syy0; y <= syy0 + sq.d; y += 10) { ctx.moveTo(sxx0, y + (y > syy0 ? sag : 0)); ctx.lineTo(sxx0 + sq.w, y + (y > syy0 ? sag : 0)); }
          ctx.stroke(); ctx.globalAlpha = 1;
        }
        // rose tape on the border (flashing while the square is giving), knots at the corners
        ctx.strokeStyle = sq.sag > 0 && (f & 4) ? '#ffffff' : ROSE; ctx.lineWidth = 1; ctx.strokeRect(sxx0 + 0.5, syy0 + 0.5, sq.w - 1, sq.d - 1);
        for (const [kx, ky] of [[sxx0, syy0], [sxx0 + sq.w, syy0], [sxx0, syy0 + sq.d], [sxx0 + sq.w, syy0 + sq.d]]) circle(ctx, kx, ky, 2, rope.hi, OL, 1);
      }
    }
  }
}

/** Build the Zone entities for a section's `zones` list. */
export function createZones(list = []) { return list.map((z) => new Zone(z)); }
