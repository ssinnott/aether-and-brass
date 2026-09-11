// Wave entrances (issue #30, ARCHITECTURE.md section 7): HOW a spawned unit arrives.
//
// `queueSpawns` (game/stage.js) drops a wave's units just outside the camera lock and walks them in from a
// `side` (left / right / sky). A spawn spec may instead carry `entrance: { kind, ... }`, which replaces that
// walk-on with an authored arrival. Every entrance has the same three parts, written in the hazard module's
// vocabulary so enemy pathing and the autopilot read them WITHOUT knowing the kind:
//
//   TELL      an EntranceTell placed before the unit exists. It sets `isHazard` and answers `dangerBox()`,
//             which is the whole contract `laneAroundHazards` (game/hazards.js) needs — so mobs walk around a
//             forming teleport ring and the autopilot steps out of a landing shadow with no code in either.
//   APPROACH  the unit exists, is drawn and is hittable, but sits in the ARRIVING ai state: on a scripted path,
//             taking no actions and holding no attack token. `entered` stays false exactly as a side spawn's
//             does while it walks in, so the wave lock and the enemies-remaining count behave as they always have.
//   ARRIVAL   a recovery window with `punishable` set — a free punish, and grabbable once it is on the floor.
//
// ================================ ENTRANCE TABLE (stage authors, bots and tools read this) ===================
// kind      tell  approach  arrive  path                                       tell reads as                  dangerBox while telling
// teleport   40      0        12    stands up inside the ring                  cyan floor ring, rising chime   x±22, z±22
// flyIn      30      60       20    shallow arc in from the far parallax       landing shadow, growing         x±20, z±20
// descend     0    derived    30    straight down under a bladder, slowly      none — it IS the tell, high and slow   null
// ropeDrop   20      20       18    slides down a line, hangs, lets go         the line paying out from above  x±14, z±14
// climbOut    0       0       26    stands up out of the thing it was in       the container's own tell        null (the prop is the tell)
//
// Shared spec fields: `x` (absolute landing x) or `dx` (offset from the lock centre — the convention a
// `side: 'sky'` spawn already uses in queueSpawns); `from` ('left' | 'right') picks the side a flyIn crosses
// from; `speed` overrides a descend's px/frame. `hang` (descend and ropeDrop only) holds the unit in the air for
// that many frames before it lets go — ropeDrop defaults to 30. It is a FRAME COUNT, not an open-ended hover:
// nothing in the roster sustains altitude on its own (the Gleaning pins `noGravity` only across its attack
// frames, gleaning.js), so a unit that never let go would simply stop being a wave enemy.
//
// Determinism: every path here is a pure function of the unit's own `arriveT` counter and its authored spec.
// Nothing in this module touches the `rng` singleton, so a wave's arrivals are byte-identical on both lockstep
// peers; `arriveT` is hashed by net/checksum.js so a divergence is caught the frame it happens.
import { ST, FLOOR_TOP, Z_MIN, Z_MAX } from '../constants.js';
import { Entity } from './entity.js';
import { audio } from '../engine/audio.js';
import { particles } from '../engine/particles.js';
import { clamp } from '../engine/math.js';
import { dsin } from '../engine/trig.js';
import { circle, line } from '../art/shapes.js';
import { drawShadowScreen } from '../art/fx.js';

/** Concordat aether cyan (docs/ART_STYLE 4): a teleport ring IS Concordat machinery, so it keeps the reserved colour. */
const AETHER = '#4DF0E0';
/** The Gleaning's tailings rose (ART_STYLE 4) for a bladder's vented gas, and the hemp of a dropped line. */
const ROSE = '#FF57B0', ROPE = '#9A8A63', OL = '#2B2B30';
/** Height a `descend` / `ropeDrop` starts at (the same 170 a `side: 'sky'` spawn falls from) and the height a hang holds. */
const SKY_Y = 170, HANG_Y = 96;
/** A flyIn crosses this far in x on its arc and peaks this high above the landing spot. */
const FLY_DX = 220, FLY_ARC = 74;
/** Slack over an entrance's own length before the watchdog in `stepArrival` ends it regardless (see there). */
const ARRIVE_WATCHDOG = 180;
/** Kinds that start ON THE FLOOR. Anything not listed here starts in the air, so a new grounded kind must join it. */
const GROUNDED = new Set(['teleport', 'climbOut', 'cargo']);

/**
 * Per-kind frame budgets and look. `tell` frames run BEFORE the unit exists (EntranceTell); `approach` is the
 * scripted path; `arrive` is the punishable recovery that ends the entrance.
 */
export const ENTRANCES = Object.freeze({
  // Concordat machinery re-forming on the spot: a ring on the floor, a rising chime, then the unit is standing in it.
  // Reuses the Regent Engine's timeStop ring + chime (content/enemies/boss.js) rather than inventing an FX.
  teleport: { tell: 40, approach: 0, arrive: 12, r: 22, look: 'ring', tellSfx: 'chime', sfx: 'aether_step', air: false, hang: 0 },
  // Stormcrows on the wing-pack: a shadow grows on the landing spot through the tell, then a shallow arc in.
  flyIn: { tell: 30, approach: 60, arrive: 20, r: 20, look: 'shadow', tellSfx: null, sfx: 'land_heavy', air: true, hang: 0 },
  // The Gleaning under its bladder: no floor tell — it IS the tell, and it takes the airborne 1.5x the whole way down.
  descend: { tell: 0, approach: 0, arrive: 30, r: 20, look: 'none', tellSfx: null, sfx: 'steam_vent', air: true, hang: 0, speed: 1.6 },
  // A line drops, the unit slides down it and hangs. A hit on the hanging unit cuts the line (see stepArrival).
  ropeDrop: { tell: 20, approach: 20, arrive: 18, r: 14, look: 'line', tellSfx: 'throw', sfx: 'land_heavy', air: true, hang: 30 },
  // Out of a crate, a cart, a hatch (issue #34). The container IS the tell -- it rattled, or it was broken open, or
  // the lid lifted -- so there is no floor ring to draw and no approach to walk: the unit is simply there, on its
  // feet, in a long recovery you can punish. The longest arrival in the table, because getting out of a box is slow.
  climbOut: { tell: 0, approach: 0, arrive: 26, r: 18, look: 'none', tellSfx: null, sfx: 'crate_drop', air: false, hang: 0 },
  // `cargo` is climbOut addressed at a NAMED PROP (issue #34): the stage runner resolves `prop` to that container and
  // hands the spawn to it, so the unit comes out wherever the box is standing rather than at a camera-relative spot.
  // It shares climbOut's budget because it IS a climb-out -- the only difference is who decides where.
  cargo: { tell: 0, approach: 0, arrive: 26, r: 18, look: 'none', tellSfx: null, sfx: 'crate_drop', air: false, hang: 0 },
});

/** Frames a `descend` takes to fall to its rest height at `speed` px/f — its approach length is derived, not authored. */
function descendFrames(ent) { return Math.max(1, Math.ceil((SKY_Y - restY(ent)) / (ent.speed || ENTRANCES.descend.speed))); }
/** Height the scripted approach ends at: a hang holds in the air, everything else arrives on the floor. */
function restY(ent) { return ent.hang > 0 && ent.kind !== 'flyIn' ? HANG_Y : 0; }
/** Frames of scripted path for this entrance (derived for `descend`, authored for the rest). */
function pathFrames(ent) { return ent.kind === 'descend' ? descendFrames(ent) : ent.approach; }

/** The entrance info for a spawn spec, or null when it walks on from a side as usual. */
export function entranceFor(spec) {
  const e = spec && spec.entrance;
  if (!e) return null;
  const info = ENTRANCES[e.kind];
  if (!info) return null;
  const ent = { ...info, ...e, kind: e.kind };
  ent.hang = Math.max(0, ent.hang | 0);
  if (ent.kind === 'flyIn') ent.hang = 0;   // a flyIn's whole point is the landing recovery
  return ent;
}

/** Total frames from the tell starting to the unit becoming actionable — what a playtest asserts against. */
export function entranceLength(ent) { return ent.tell + pathFrames(ent) + ent.hang + ent.arrive; }

/**
 * The floor spot an entrance delivers to. `x` is absolute; `dx` is measured from the centre of the camera lock,
 * the same convention a `side: 'sky'` spawn already uses in queueSpawns.
 */
export function entranceLanding(ent, left, right) {
  return ent.x != null ? ent.x : (left + right) / 2 + (ent.dx || 0);
}

/**
 * The tell: a floor ring / landing shadow / dropping line placed before the unit exists. It is an `fx` entity
 * (never hashed by net/checksum.js — see the KIND table there) that flags `isHazard` and answers `dangerBox()`,
 * so `laneAroundHazards` steers both mobs and the autopilot clear of it with no code of its own in either.
 */
export class EntranceTell extends Entity {
  /** @param {{kind: string, x: number, z: number, frames: number, r: number, look: string}} o */
  constructor({ kind, x, z, frames, r, look }) {
    super('fx');
    this.kind = kind; this.x = x; this.z = z;
    this.life = Math.max(1, frames); this.t = 0;
    this.r = r; this.look = look;
    this.zSize = r; this.shadowW = 0;
    this.isHazard = true;   // enemy pathing / bot lane steering look for this in world.entities
  }
  hurtbox() { return null; }
  /** The patch the arrival is about to take. A `descend` reports nothing: it is visible in the air the whole way. */
  dangerBox() {
    if (this.look === 'none') return null;
    return { x0: this.x - this.r, x1: this.x + this.r, z0: this.z - this.r, z1: this.z + this.r };
  }
  update() { if (++this.t >= this.life) { this.removeMe = true; this.alive = false; } }
  draw(ctx, cam) {
    const k = this.t / this.life, sx = cam.toScreenX(this.x), sy = Math.round(FLOOR_TOP + this.z + cam.shakeY);
    ctx.save();
    if (this.look === 'ring') {
      // a cyan ring closing on the spot, brightening as it completes; the last 8f go white so the arrival reads as imminent
      const r = this.r * (1 - 0.35 * k), late = this.life - this.t <= 8;
      ctx.globalAlpha = 0.35 + 0.5 * k;
      ctx.setLineDash([4, 3]); ctx.lineDashOffset = -this.t * 0.8;
      circle(ctx, sx, sy, Math.max(3, r), null, late ? '#ffffff' : AETHER, 2);
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.18 + 0.3 * k;
      circle(ctx, sx, sy, Math.max(2, r * 0.45), AETHER, null);
    } else if (this.look === 'shadow') {
      drawShadowScreen(ctx, sx, sy, Math.max(6, this.r * 2 * k), 0.15 + 0.35 * k);
    } else if (this.look === 'line') {
      // the line pays out from above and reaches the floor as the tell ends
      const top = Math.round(sy - SKY_Y - 10), drop = Math.round((sy - top) * k);
      ctx.globalAlpha = 0.9;
      line(ctx, sx, top, sx, top + drop, ROPE, 2);
      line(ctx, sx - 1, top, sx - 1, top + drop, OL, 1);
    }
    ctx.restore();
  }
}

/**
 * Put a freshly spawned enemy onto its entrance path. Called from the Enemy constructor (which has no world
 * yet), so it only sets fields — every moving part is stepped by `stepArrival` from `Enemy.think`.
 * @param {import('./enemy.js').Enemy} e
 * @param {object} ent resolved entrance (entranceFor)
 */
export function startArrival(e, ent) {
  e.entrance = ent;
  e.aiState = 'ARRIVING';
  e.entered = false;
  e.arriveT = 0;
  e.arriveX = e.x;
  e.arrivePath = pathFrames(ent);
  e.arriveLand = 0;
  e.cutLine = false;
  // grounded arrivals: already standing where they came out, straight into the recovery
  if (GROUNDED.has(ent.kind)) { e.y = 0; e.vy = 0; e.setState(ST.IDLE, 'idle'); return; }
  if (ent.kind === 'flyIn') {
    const dir = ent.from === 'left' ? 1 : -1;   // the side it crosses FROM, so it faces the way it is travelling
    e.x = e.arriveX - dir * FLY_DX; e.facing = dir; e.y = FLY_ARC;
  } else {
    e.y = SKY_Y;
  }
  e.vy = 0;
  e.setState(ST.JUMP, 'fall', { fallback: 'jump' });
}

/**
 * One frame of an arrival. Drives position directly and suppresses gravity through `noGravity` — the field the
 * Gleaning's own hover hooks already use — so the path is exactly what the table says rather than a ballistic
 * approximation. Returns true while the unit is still arriving.
 *
 * Interruption: a ropeDrop unit hit while it hangs has its line CUT (`cutLine`, set by Enemy.takeHit) — it
 * drops straight out of the sky, which is the whole point of the entrance. Every other kind rides its path out;
 * hitstun still lands on it as damage, it simply does not steer the arrival.
 */
export function stepArrival(e, world) {
  const ent = e.entrance;
  if (!ent) { finishArrival(e, world); return false; }
  const t = ++e.arriveT, path = e.arrivePath, hang = ent.hang;

  // Watchdog. checkOffscreen's 300-frame rescue (enemy.js) is deliberately switched off while a unit is
  // ARRIVING, so this is the only thing standing between a path that somehow cannot finish — a unit wedged
  // against a bound, a hang that never lands — and a wave lock that never clears. An arrival is bounded by
  // construction, so reaching this at all is a bug; ending it as an ordinary enemy is the safe failure.
  if (t > entranceLength(ent) + ARRIVE_WATCHDOG) { finishArrival(e, world); return false; }

  // the line is cut: skip whatever is left of the hang outright. Releasing gravity alone is not enough — the hang
  // branch below re-arms `noGravity` every frame, so the body would simply hang on to full term with no line.
  if (e.cutLine) { letGo(e); e.arriveT = path + hang + 1; return true; }

  if (t <= path) {
    const k = path > 0 ? t / path : 1, rest = restY(ent);
    if (ent.kind === 'flyIn') {
      const dir = ent.from === 'left' ? 1 : -1;
      e.x = e.arriveX - dir * FLY_DX * (1 - k);
      // a shallow arc: it rides the last of its height off as it closes, rather than dropping onto the spot
      e.y = FLY_ARC * (1 - k) * (0.35 + 0.65 * dsin(180 * k));
    } else if (ent.kind === 'descend') {
      e.y = SKY_Y - (SKY_Y - rest) * k;
      if (t % 14 === 0) particles.burst('steam', e.x, e.y + 30, e.z, 2, { speed: 0.8, up: 1, color: ROSE, sizeJitter: 1 });
    } else if (ent.kind === 'ropeDrop') {
      e.y = SKY_Y - (SKY_Y - HANG_Y) * k;
    }
    e.noGravity = 2; e.vx = 0; e.vz = 0;
    return true;
  }
  // the hang: held in the air, still hittable, before it lets go
  if (t <= path + hang) { e.noGravity = 2; e.vx = 0; e.vz = 0; return true; }
  if (t === path + hang + 1) letGo(e);
  // falling the last of the way: ordinary gravity finishes the job (physics() runs right after think())
  if (e.airborne) { e.arriveLand = 0; return true; }
  // The arrival recovery, measured from the frame the body actually TOUCHED DOWN rather than from the end of the
  // scripted path. A rope drop lets go 96px up and takes ~20 frames to fall; counting the recovery from the let-go
  // spent the whole window in mid-air and handed the unit back to its AI the instant it landed — no punish at all.
  if (!e.arriveLand) e.arriveLand = t;
  e.punishable = true;
  e.punishGrab = true;
  if (t - e.arriveLand >= ent.arrive) { finishArrival(e, world); return false; }
  return true;
}

/**
 * Is `e` hanging on a dropped line right now? A hit here cuts it (Enemy.takeHit rewrites the hit to a knockdown
 * and the unit drops out of the sky), and a grab on it is a throw from height.
 */
export function isHanging(e) {
  const ent = e.entrance;
  return !!ent && ent.kind === 'ropeDrop' && ent.hang > 0 && e.arriveT > e.arrivePath && e.arriveT <= e.arrivePath + ent.hang;
}

/** Let go of the line / end the hover: from here the unit falls under ordinary gravity into its recovery. */
function letGo(e) {
  if (e.noGravity) audio.play('throw');
  e.noGravity = 0; e.vy = 0; e.cutLine = false;
}

/** The entrance is over: the unit becomes an ordinary wave enemy from this frame on. */
export function finishArrival(e, world) {
  const ent = e.entrance;
  e.entrance = null;
  e.arriveT = 0;
  e.arriveLand = 0;
  e.entered = true;
  e.punishable = false;
  e.noGravity = 0;
  e.aiState = 'APPROACH';
  // Enemy.think decrements every cooldown before it reaches the ARRIVING gate, so an entrance long enough to
  // outlast `firstAttackDelay` (45 by default, 50 for Brassbound) would leave the unit free to swing the frame
  // it lands — the exact opposite of an arrival you get to punish. Re-arm the grace against the landing, not
  // the spawn, the way every other non-acting state hands back a fresh cooldown.
  if (e.ai) e.attackCooldown = Math.max(e.attackCooldown || 0, e.ai.firstAttackDelay);
  // Hand the body back in a GROUND state. An air entrance starts in ST.JUMP, and its scripted path ends at exactly
  // y = 0 with vy = 0 -- so the unit is not `airborne` (y > 0 || vy > 0), onLand never fires, and nothing else in the
  // engine ever leaves ST.JUMP. Enemy.think early-returns on ST.JUMP, so the unit would stand in its falling pose
  // for the rest of the wave: alive, hittable, and completely inert. Only `onLand` normally does this, and the whole
  // point of a scripted arrival is that it never falls the last pixel.
  if (e.y <= 0) {
    e.y = 0; e.vy = 0;
    if (e.state === ST.JUMP) e.setState(ST.IDLE, 'idle');
  }
  if (!ent || !world) return;
  if (ent.sfx) audio.play(ent.sfx);
  if (ent.kind === 'teleport') {
    world.addFx('ring', e.x, 0, e.z, { r0: ent.r, r1: 4, color: AETHER, flat: true, life: 12 });
    particles.burst('spark', e.x, 30, e.z, 6, { speed: 1.6, up: 1, color: AETHER });
  }
}

/**
 * A teleport ring that completes under a player shoves them clear: standing in it is punished, but it is never
 * a free hit on someone who could not see it coming — the ring told for `tell` frames first. Called by the
 * stage runner the frame the unit is placed.
 * @returns {boolean} true when a body was displaced (the runner staggers that arrival)
 */
export function teleportShove(world, x, z, r) {
  for (const p of world.players) {
    if (!p || !p.alive || p.dead || p.out) continue;
    if (Math.abs(p.x - x) > r || Math.abs(p.z - z) > r) continue;
    const dir = Math.sign(p.x - x) || 1;
    p.x = clamp(x + dir * (r + 10), 0, world.stageLength);
    p.z = clamp(p.z, Z_MIN, Z_MAX);
    p.vx = dir * 2;
    return true;
  }
  return false;
}
