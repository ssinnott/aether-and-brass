// Moving platforms (issue #32, ARCHITECTURE.md section 7): the floor itself as a vehicle.
//
// The Brass Funicular (stage1 `s3`) has always been a section that MOVES — `mode: 'locked'` with `timedWaves`, and a
// backdrop that scrolls under you (`section.drift`, read by art/backgrounds/*). But only the scenery ever moved; the
// floor band you fight on was as fixed as any other. A section may now declare `platform: { kind, ... }`, which makes
// the band itself do something:
//
// ================================ PLATFORM TABLE (stage authors and tools read this) =========================
// kind    fields                                   what it does to the fight
// hoist   frames 900, rise 1, banner?              the deck climbs for `frames`. Airborne bodies take `rise` px/f of
//                                                  extra downward velocity -- the floor is coming UP to meet them, so
//                                                  a jump lands sooner than it looks like it should, which is the fun.
// pallet  x0, x1, z0, z1, travel 90, period 300,   a sub-rectangle of the floor slides back and forth. A grounded
//         axis 'x'|'z'                             fighter standing on it inherits its motion; step off and it leaves
//                                                  without you. Pair with a `solid` gap (issue #31) for the drop.
// tilt    period 420, tell 45, active 60,          the deck banks. Every grounded fighter slides `slide` px/f toward
//         slide 0.9, dir 0|1|-1,                   the low side; `dir: 0` alternates each cycle. The storm, in the legs.
//         warn 'SHE BANKS', warnSub
//
// A TILT HAS TO BE VISIBLE. It shoves every body on the deck and, unlike a hazard, it has no object to point at, so a
// player who cannot attribute the shove reads it as the controller rather than as the ship. A tilt therefore draws the
// same wind telegraph as the Mooring Spine's gust (art/fx.js `drawWind`) rotated into x — which is the axis it pushes
// on — and puts its name on the HUD once per section the first time it tells. Those two, plus `windDrag`'s dust off
// the feet of whoever is being moved, answer the three parts of the question: what, which way, and is it ME.
// `hoist` and `pallet` need none of it: a hoist only bends an arc you are already watching, and a pallet is a visible
// piece of floor you chose to stand on.
//
// DETERMINISM. Every platform's phase is a pure function of `world.frame` and the section's own data — the same
// contract Hazard uses (`(world.frame + offset) % period`) and for the same reason. The StageRunner's own state is
// NOT hashed by net/checksum.js (the canary walks world.entities), so a platform that stored its position would be a
// piece of simulation the desync check cannot see. Storing nothing but the frame the section was entered on — which
// both lockstep peers reach on the same frame — keeps the whole thing derivable and leaves the effect visible in the
// fighter positions the canary already hashes.
//
// RIDERS. Motion is written straight to `x` / `z`, never to `vx` / `vz`: the grounded branch of Fighter.physics
// applies GROUND_FRICTION (0.82) and snaps anything under 0.05 to zero, so a rider delta put in a velocity is decayed
// the same frame and the rider lags the floor. `Zone.updateConveyor` and `Zone.updateGust` (game/hazards.js) both
// already do it this way, and their exclusion list — airborne, held, dead, boss, netted — is the one reused here.
import { Z_MIN, Z_MAX, VIEW_W, FLOOR_TOP, ST } from '../constants.js';
import { clamp } from '../engine/math.js';
import { audio } from '../engine/audio.js';
import { particles } from '../engine/particles.js';
import { drawWind, windDrag, WIND_BANNER } from '../art/fx.js';

/** Per-kind defaults. A section's `platform` block overrides any of these. */
export const PLATFORMS = Object.freeze({
  hoist: { frames: 900, rise: 1 },
  pallet: { travel: 90, period: 300, axis: 'x', z0: Z_MIN, z1: Z_MAX },
  tilt: { period: 420, tell: 45, active: 60, slide: 0.9, dir: 0, warn: 'SHE BANKS', warnSub: 'MIND YOUR FOOTING' },
});

/** A fighter that platform motion applies to: on its feet, in the fight, and not being carried by someone else. */
function rides(f) {
  return f.y <= 0 && !f.grabbedBy && !f.dead && f.kind !== 'boss' && f.state !== ST.DEAD && !(f.status && f.status.netted);
}

/**
 * One section's platform. Built on section entry and thrown away on exit, so it never outlives the band it moves.
 * @param {object} spec the section's `platform` block
 * @param {number} startFrame world.frame the section was entered on (both peers reach it on the same frame)
 */
export class Platform {
  constructor(spec, startFrame) {
    const info = PLATFORMS[spec.kind] || PLATFORMS.tilt;
    this.kind = PLATFORMS[spec.kind] ? spec.kind : 'tilt';
    Object.assign(this, info, spec);
    this.startFrame = startFrame;
    this.frame = startFrame;
    this.phase = 'idle';
    this.phaseT = 0;
    this.tiltDir = 1;
    this.done = false;
    /** One-shot per section (a Platform is rebuilt on section entry, so this resets exactly when the board changes). */
    this.announced = false;
  }
  /** Frames since the section was entered. */
  t(world) { return world.frame - this.startFrame; }
  /** Fraction of a hoist's climb completed, 0..1. */
  progress(world) { return this.kind === 'hoist' ? clamp(this.t(world) / Math.max(1, this.frames), 0, 1) : 0; }

  /**
   * @param {object} world
   * @param {boolean} [carry] false while a scripted transition holds the players: the ride's own clock keeps running
   *   (a hoist does not stop climbing because the party is boarding something) but nothing shoves a held body around.
   */
  update(world, carry = true) {
    this.frame = world.frame;   // draw() has no world; the streak drift wants a counter that never resets
    if (this.kind === 'hoist') this.updateHoist(world, carry);
    else if (this.kind === 'pallet') this.updatePallet(world, carry);
    else this.updateTilt(world, carry);
  }

  /**
   * The deck climbs. Nothing on the floor moves — everyone is standing on the thing that is rising — but a body in
   * the AIR is not, and the floor closes on it: `rise` px/f of extra downward velocity while the hoist climbs. That
   * is the whole feel the issue asks for ("a jump on a rising hoist lands lower than expected") and it is the only
   * version of it that does not break `get airborne` (y > 0 || vy > 0), which every actionable / grabbable / gravity
   * check in fighter.js and grabs.js is built on.
   */
  updateHoist(world, carry) {
    const k = this.progress(world);
    if (k >= 1) { if (!this.done) { this.done = true; audio.play('hydraulic'); } return; }
    if ((this.t(world) % 90) === 0) { audio.play('steam'); particles.burst('steam', world.camera.x + 40, 20, Z_MAX - 10, 4, { speed: 1, up: 1.4 }); }
    if (!carry) return;
    for (const f of world.fighters) {
      if (f.y <= 0 || f.grabbedBy || f.dead || f.kind === 'boss') continue;
      f.vy -= this.rise;
    }
  }

  /**
   * A sub-rectangle of the floor slides and carries whoever is standing on it. The rectangle's own offset is a
   * triangle wave off the frame count, so the platform is wherever the frame says it is with nothing stored.
   */
  updatePallet(world, carry) {
    const prev = this.offset || 0;
    this.offset = this.wave(world) * this.travel;
    const d = this.offset - prev;
    if (!d || !carry) return;
    const ax = this.axis === 'z' ? 'z' : 'x';
    for (const f of world.fighters) {
      if (!rides(f) || !this.onPallet(f)) continue;
      if (ax === 'x') f.x += d;
      else f.z = clamp(f.z + d, world.floorBand.z0, world.floorBand.z1);
    }
  }
  /** Triangle wave in -1..1 over `period` frames: linear travel with a turn at each end, not a sine ease. */
  wave(world) {
    const p = Math.max(2, this.period), u = ((this.t(world) % p) + p) % p / p;
    return u < 0.5 ? -1 + 4 * u : 3 - 4 * u;
  }
  /** Is `f` standing on the moving rectangle? Measured against the pallet's CURRENT position. */
  onPallet(f) {
    const ox = this.axis === 'z' ? 0 : (this.offset || 0), oz = this.axis === 'z' ? (this.offset || 0) : 0;
    return f.x >= this.x0 + ox && f.x <= this.x1 + ox && f.z >= this.z0 + oz && f.z <= this.z1 + oz;
  }

  /**
   * The deck banks: `tell` frames of the ship leaning, then `active` frames of every grounded body sliding toward the
   * low side. Same cycle shape as a Hazard (tell -> active -> idle, derived from the frame count), and the same
   * exclusion list as the Mooring Spine's gust, because it is the gust rotated into x.
   */
  updateTilt(world, carry) {
    const p = Math.max(2, this.period), t = ((this.t(world) % p) + p) % p;
    const activeStart = p - this.active, tellStart = activeStart - this.tell;
    const was = this.phase;
    this.phase = t >= activeStart ? 'active' : t >= tellStart ? 'tell' : 'idle';
    this.phaseT = this.phase === 'active' ? t - activeStart : this.phase === 'tell' ? t - tellStart : t;
    if (this.phase === 'tell' && was !== 'tell') {
      // `dir: 0` alternates, so the deck rolls one way and then the other rather than always dumping you to one rail
      this.tiltDir = this.dir || -this.tiltDir || 1;
      audio.play('gale');
      if (!this.announced && this.warn && typeof world.announce === 'function') { this.announced = true; world.announce(this.warn, this.warnSub, WIND_BANNER); }
    }
    if (this.phase !== 'active' || !carry) return;
    const d = this.tiltDir * this.slide;
    for (const f of world.fighters) {
      if (!rides(f)) continue;
      f.x += d;
      windDrag(f, world.frame, this.tiltDir, 0);
    }
  }

  /**
   * The tilt's half of the read (World.draw calls this behind the entities, where a Zone's own floor art sits). It is
   * the gust's telegraph rotated into x: streaks across the deck and a chevron column on the side the ship is rolling
   * toward, held solid while bodies are actually sliding. The span is the VIEWPORT rather than the section, because a
   * tilt banks the whole deck rather than a rectangle of it — every banking section authored so far is `mode: 'locked'`
   * and exactly one screen wide anyway, so the two are the same pixels.
   */
  draw(ctx, cam) {
    if (this.kind !== 'tilt' || this.phase === 'idle') return;
    drawWind(ctx, {
      x0: 0, x1: VIEW_W, y0: FLOOR_TOP + (cam.shakeY || 0), axis: 'x', dir: this.tiltDir,
      k: this.phase === 'tell' ? this.phaseT / Math.max(1, this.tell) : 1,
      active: this.phase === 'active', frame: this.frame,
    });
  }
}

/** Build a section's platform, or null when it declares none. */
export function createPlatform(section, startFrame) {
  return section && section.platform ? new Platform(section.platform, startFrame) : null;
}
