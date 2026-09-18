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
import { Z_MIN, Z_MAX, VIEW_W, FLOOR_TOP, ST } from '../constants.ts';
import { clamp } from '../lib/engine/math.ts';
import { audio } from '../engine/audio.ts';
import { particles } from '../engine/particles.ts';
import { drawWind, windDrag, WIND_BANNER } from '../art/fx.ts';
import type { CameraView } from './entity.ts';
import type { Fighter } from './fighter.ts';
import type { HazardPhase } from './hazards.ts';

/** The three kinds in the PLATFORM TABLE above. */
export type PlatformKind = 'hoist' | 'pallet' | 'tilt';

/** Which axis a pallet slides along. Anything but `'z'` is read as `'x'` (updatePallet, onPallet). */
export type PlatformAxis = 'x' | 'z';

/**
 * One section's `platform` block — the PLATFORM TABLE above is the authority on which fields each kind reads, and
 * `PLATFORMS` below carries every default. Only `kind` is ever required.
 *
 * `kind` is `string` rather than `PlatformKind` because the constructor accepts anything and falls back to `tilt`
 * for a name it does not know; game/stage.ts's section spec declares the block the same way (`{ kind: string }`),
 * and content authors it by hand.
 */
export interface PlatformSpec {
  kind: string;
  /** hoist: how long the climb lasts, and the px/frame of extra downward velocity it puts on airborne bodies. */
  frames?: number;
  rise?: number;
  /**
   * hoist: named by the PLATFORM TABLE above, read by nothing today — a hoist announces itself by being a floor
   * that visibly moves. Kept so the table and this interface do not disagree.
   */
  banner?: string;
  /** pallet: the sub-rectangle of floor that slides, in world x and floor z. */
  x0?: number;
  x1?: number;
  z0?: number;
  z1?: number;
  /** pallet: how far it travels from centre, the frames of a full there-and-back, and which axis it runs on. */
  travel?: number;
  axis?: PlatformAxis;
  /** pallet and tilt both cycle on this. */
  period?: number;
  /** tilt: frames of lean before the shove, and frames of shove. */
  tell?: number;
  active?: number;
  /** tilt: px/frame a grounded body slides, and the side it goes toward (`0` alternates each cycle). */
  slide?: number;
  dir?: number;
  /** tilt: the once-per-section banner. `warn` is what a tilt owes the player — see the note at the top. */
  warn?: string;
  warnSub?: string;
}

/**
 * The part of game/world.ts's `World` a platform reaches for. Structural for the reason game/entity.ts gives for
 * `EntityWorld`: world.ts depends on this file (it holds the platform as `world.platform`), so the dependency must
 * not run back the other way. `World` satisfies it.
 */
export interface PlatformWorld {
  /** The frame count every platform's phase is a pure function of — see DETERMINISM at the top. */
  frame: number;
  /** Living fighters as of the last update (world.ts's `fighters` getter): the bodies a deck carries or shoves. */
  fighters: Fighter[];
  /** The hoist's steam puffs are placed off the camera, so they vent where the party can see them. */
  camera: CameraView;
  /** The band of z the floor occupies: a pallet running on z clamps its riders to it. */
  floorBand: { z0: number; z1: number };
  /**
   * The HUD banner a tilt names itself with (game/stage.ts installs it over hud.showBanner). Optional, and
   * `updateTilt` tests for it with `typeof` before calling, because a world stood up by a tool carries no HUD —
   * the same handshake game/zones.ts's gust uses.
   */
  announce?(text: string, sub?: string, life?: number): void;
}

/** Per-kind defaults. A section's `platform` block overrides any of these. */
export const PLATFORMS = Object.freeze({
  hoist: { frames: 900, rise: 1 },
  pallet: { travel: 90, period: 300, axis: 'x', z0: Z_MIN, z1: Z_MAX },
  tilt: { period: 420, tell: 45, active: 60, slide: 0.9, dir: 0, warn: 'SHE BANKS', warnSub: 'MIND YOUR FOOTING' },
});

/** A fighter that platform motion applies to: on its feet, in the fight, and not being carried by someone else. */
function rides(f: Fighter): boolean {
  return f.y <= 0 && !f.grabbedBy && !f.dead && f.kind !== 'boss' && f.state !== ST.DEAD && !(f.status && f.status.netted);
}

/**
 * One section's platform. Built on section entry and thrown away on exit, so it never outlives the band it moves.
 * @param {object} spec the section's `platform` block
 * @param {number} startFrame world.frame the section was entered on (both peers reach it on the same frame)
 */
export class Platform {
  // The fields, for the checker only. `declare` because these are the constructor's own assignments and nothing
  // else — including the ones `Object.assign` copies off the defaults and the spec: a plain field declaration would
  // emit a class field per name (es2022 defines them before the constructor body runs), which is a runtime change.
  // `declare` erases under tsc, esbuild and node --experimental-strip-types alike. Same reasoning, and the same
  // wording, as game/entity.ts, game/world.ts and game/zones.ts.
  //
  // The kind-specific fields are OPTIONAL because they genuinely are: `Object.assign(this, info, spec)` copies the
  // defaults for ONE kind, so a hoist carries no `slide` and a tilt no `travel`. Which kind reads which is the
  // PLATFORM TABLE at the top of this file.
  /** Which of the three this is. Never anything else: the constructor falls back to `tilt` for a name it does not know. */
  declare kind: PlatformKind;
  /** world.frame the section was entered on. Every phase is derived from it — see DETERMINISM at the top. */
  declare startFrame: number;
  /** The live frame count, mirrored here because draw() has no world and the streak drift wants a counter. */
  declare frame: number;
  /** tilt: where in its cycle it is, and how many frames into that phase. Idle for the other two kinds. */
  declare phase: HazardPhase;
  declare phaseT: number;
  /** tilt: which way the deck is rolling this cycle (`dir: 0` flips it each time). */
  declare tiltDir: number;
  /** hoist: the climb has finished and the arrival sound has been spent. */
  declare done: boolean;
  /** One-shot per section (a Platform is rebuilt on section entry, so this resets exactly when the board changes). */
  declare announced: boolean;
  /** hoist: how long the climb lasts, and the px/frame of extra downward velocity it puts on airborne bodies. */
  declare frames?: number;
  declare rise?: number;
  /** hoist: documented by the PLATFORM TABLE and read by nothing — see `PlatformSpec.banner`. */
  declare banner?: string;
  /** pallet: the sliding sub-rectangle, in world x and floor z. */
  declare x0?: number;
  declare x1?: number;
  declare z0?: number;
  declare z1?: number;
  /** pallet: how far it travels from centre, and which axis it runs on. */
  declare travel?: number;
  declare axis?: PlatformAxis;
  /** pallet and tilt both cycle on this. */
  declare period?: number;
  /** pallet: how far the deck has been carried from where it started, px along `axis`. Unset until the first
   *  updatePallet, which is why every read of it is `this.offset || 0`. */
  declare offset?: number;
  /** tilt: frames of lean before the shove, and frames of shove. */
  declare tell?: number;
  declare active?: number;
  /** tilt: px/frame a grounded body slides, and the side it goes toward (`0` alternates each cycle). */
  declare slide?: number;
  declare dir?: number;
  /** tilt: the once-per-section banner's words. */
  declare warn?: string;
  declare warnSub?: string;
  constructor(spec: PlatformSpec, startFrame: number) {
    const info = PLATFORMS[spec.kind] || PLATFORMS.tilt;
    // Inside the truthy branch `spec.kind` IS one of the three PLATFORMS keys — that is what the lookup just
    // established — but a string narrowed by an object lookup is not something tsc can follow, so the assertion
    // says it. Types only: it erases, and the fallback below is what actually runs for an unknown name.
    this.kind = PLATFORMS[spec.kind] ? spec.kind as PlatformKind : 'tilt';
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
  t(world: PlatformWorld): number { return world.frame - this.startFrame; }
  /** Fraction of a hoist's climb completed, 0..1. */
  progress(world: PlatformWorld): number { return this.kind === 'hoist' ? clamp(this.t(world) / Math.max(1, this.frames), 0, 1) : 0; }

  /**
   * @param {object} world
   * @param {boolean} [carry] false while a scripted transition holds the players: the ride's own clock keeps running
   *   (a hoist does not stop climbing because the party is boarding something) but nothing shoves a held body around.
   */
  update(world: PlatformWorld, carry: boolean = true): void {
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
  updateHoist(world: PlatformWorld, carry: boolean): void {
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
  updatePallet(world: PlatformWorld, carry: boolean): void {
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
  wave(world: PlatformWorld): number {
    const p = Math.max(2, this.period), u = ((this.t(world) % p) + p) % p / p;
    return u < 0.5 ? -1 + 4 * u : 3 - 4 * u;
  }
  /** Is `f` standing on the moving rectangle? Measured against the pallet's CURRENT position. */
  onPallet(f: Fighter): boolean {
    const ox = this.axis === 'z' ? 0 : (this.offset || 0), oz = this.axis === 'z' ? (this.offset || 0) : 0;
    return f.x >= this.x0 + ox && f.x <= this.x1 + ox && f.z >= this.z0 + oz && f.z <= this.z1 + oz;
  }

  /**
   * The deck banks: `tell` frames of the ship leaning, then `active` frames of every grounded body sliding toward the
   * low side. Same cycle shape as a Hazard (tell -> active -> idle, derived from the frame count), and the same
   * exclusion list as the Mooring Spine's gust, because it is the gust rotated into x.
   */
  updateTilt(world: PlatformWorld, carry: boolean): void {
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
  draw(ctx: CanvasRenderingContext2D, cam: CameraView): void {
    if (this.kind !== 'tilt' || this.phase === 'idle') return;
    drawWind(ctx, {
      x0: 0, x1: VIEW_W, y0: FLOOR_TOP + (cam.shakeY || 0), axis: 'x', dir: this.tiltDir,
      k: this.phase === 'tell' ? this.phaseT / Math.max(1, this.tell) : 1,
      active: this.phase === 'active', frame: this.frame,
    });
  }
}

/** Build a section's platform, or null when it declares none. */
export function createPlatform(section: { platform?: PlatformSpec | null } | null, startFrame: number): Platform | null {
  return section && section.platform ? new Platform(section.platform, startFrame) : null;
}
