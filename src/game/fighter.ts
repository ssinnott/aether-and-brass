// Fighter: shared state machine for players, enemies and bosses (ARCHITECTURE.md section 5, GDD section 7).
//
// ================================ CONTENT HOOK REFERENCE (def.hooks.*) — all optional ================================
// `f` = this fighter, `world` = the World. Return values matter only where noted.
//  onSpawn(f, world)                    first update after being added to the world
//  onUpdate(f, world)                   every step (skipped during hit-stop / time stop / world freeze)
//  onStateEnter(f, state, prev)         after any setState()
//  onAnimEvent(f, name, frame, world)   a frame's `event` fired (before the built-in handlers)        -> true = consumed
//  onHitDealt(f, target, hit, world)    one of my hits connected (after meter / combo bookkeeping); may set f.vy etc.
//  onHitTaken(f, hit, attacker, world)  before damage is applied                                       -> false = ignore the hit, or return a replacement hit object
//  onKill(f, target)                    something I hit died
//  onDeath(f, world)                    my hp reached 0 (once, at the moment of death)
//  onLanded(f, world, fromState)        feet touched the floor (any state)
//  onJumpPressed(f, world, air)         jump pressed on the ground / in the air                        -> true = consumed (custom double jump...)
//  onDodgePressed(f, world, air)        dodge pressed                                                  -> true = consumed (custom air dash...)
//  onAttackPressed(f, world, air)       attack pressed, before grab / combo / dash-attack logic       -> true = consumed (e.g. Rook's air shot)
//  onSpecial(f, world)                  special pressed (call f.paySpecial() yourself, returns false when unaffordable) -> true = consumed
//  onSuper(f, world)                    super pressed with a full meter (call f.beginSuper(world) for freeze + cut-in)  -> true = consumed
//  onGrab(f, target) / onGrabbed(f, by) a grab started (holder / held side)
//  onThrow(f, target, dir)              throw released (dir +1 forward / -1 back)
//  onParry(f, attacker, hit)            my parry (traits.parry) connected
//  onStatus(f, name, status, phase)     status 'apply' | 'tick' | 'end'
//  drawBefore(ctx, f, sx, sy, cam)      draw under the rig (trails, chains); sx/sy = feet screen px
//  drawAfter(ctx, f, sx, sy, cam)       draw over the rig (ponytail, gauge needle, aura)
// ================================ TRAITS (def.traits.*) read by the core =============================================
//  damageTakenMult 1     | fireDamageMult 1 (burn + hit.element 'fire') | jumpAttackTakenMult 1 (hits from airborne players)
//  superArmor false      permanent armor: no hitstun; launch / knockdown still work unless noLaunch (GDD Iron Warden)
//  noLaunch false        armored fighter also ignores launch / knockdown hits
//  armorHits 0           default hit count for `armor: true` frames (0 = unlimited); `armor: N` on a frame absorbs N hits per attack
//  armorFrontOnly false  armor only vs. hits from the front (Halberdier)
//  flinchEvery 0         only every Nth hit taken causes hitstun (Cinder Hulk 3)
//  staggerEveryNthHit 0  every Nth hit in one combo -> staggerFrames (30) stagger regardless of armor (Brassbound gear slip)
//  ignoreKnockdownBelow 0  knockdown / launch hits with damage below this become heavy flinches (Brunhild vs Sootborn lights)
//  grabbable true|false|fn(by, f) | grabbableByGrappler true | grabAll false (may grab anything grabbableByGrappler)
//  grabReach 20 | grabDamageMult 1 (hold hits + throws dealt) | throwDamageMult 1 (throws dealt) | throwDamageTakenMult 1 (Brassbound 1.5)
//  fleeHpFrac 0 / fleeChance 0  (enemies: see enemy.js ai.fleeLast) | weight 1 (knockback divisor)
//  extraJumps 0 | airDashes 0 | dodgeRecovery 8 | dodgeIFrames [2, 12] | parry { frames: 6, stun: 40, meter: 15, hitstop: 8 }
//  tauntMeter 25 (gained over the taunt animation)
//  shield { max, regen, delay, breakDelay, name }  regenerating buffer spent before hp (game/shield.js); absent = no shield
//  dummy false           training dummy (screens/training.js): Enemy stands / blocks / fights per e.dummyMode, never flees or ripostes
// ================================ FRAME FIELDS honoured by the core ==================================================
//  hitbox { x, y, w, h, z, type: light|medium|heavy|launch|knockdown|grab|throw, damage, kbX, kbY, hitstun, once, rehit, multiHit: N,
//           friendly, hitsBehind (mirrored copy), maxTargets, pierceDamage (damage for the 2nd+ target), reaction: flinch|stagger|launch|knockdown,
//           stagger, status: { burn: {...} }, element: 'fire', groundedOnly, otg, unblockable, breaksArmor, onHit: 'rebound'|name, sfx,
//           fromX (world x the hit came from: knockback pushes away from it instead of off the victim's facing — stage hazards),
//           groundBounce: true|vy (an airborne / knocked-down target bounces off the floor once more: Brunhild slam, Rook hip toss),
//           extinguish: true (removes fire puddles the box touches: Pip's Steam Vent), weapon: true (held pickup weapon swing: spends durability, player.js),
//           body: true (a thrown weapon/prop/enemy body's own hit: throwDamageTakenMult applies and it sets f.lastHitWasThrow, GDD 3/7, game/throwables.js) }
//  hitboxes [..] | move { x, z, y|vy } | armor: true|N | invuln: true | fx [{ kind, x, y, ... }] | sfx | cancel | event | tell: true
//  hurtboxScale 0..1   shrink the hurtbox height on this frame (Rook's slide passes under projectiles)
//  spawn { projectile: name|spec, x, y, z, count, aimAt }   spawn a projectile (name -> def.projectiles[name]) on frame entry
//  area { radius, damage, type, kbX, kbY, hitstun, x (offset), y, teams, friendly, status, shake, color, groundedOnly }  area hit on entry
//  teleport { toNearestEnemy: true, behind: true, range, offset, unique }   Aether Step / Sael blink on entry
//  lockOn { range: 60, snap: 0.5 }   turn + step toward the nearest enemy on entry (Tempest Waltz)
//  meter { amount }   meter gain on entry (taunts)
//  event names handled here: spawnProjectile (uses frame.projectile), shockwave/area, teleport, lockOn, meterGain
// ================================ DEF FIELDS ========================================================================
//  projectiles { name: spec } | hurtParts [{ name, y: [y0, y1], x: [x0, x1], damageMult, flag, when(f) }] | deathSpawn [{ projectile, dx, dz }]
//  explodeOnDeath { delay, radius, damage, friendly } | onSpawn/onUpdate/onDeath (legacy aliases of the hooks)
//  moves { throwFwd / throwBack: { damage, vx, vy, releaseAt, shockwave: { r, damage }, selfVy, bounce: true|vy }, grabHit: { damage, hits } }
import { ST, TEAM, GRAVITY, FLOOR_TOP, Z_MIN, Z_MAX, HITSTOP, FIGHTER_DEFAULTS, LAUNCH_VY, JUGGLE_VY, KNOCKDOWN_POP_VY, JUMP_VY, UI, VIEW_W } from '../constants.ts';
import { Entity, worldHitbox } from './entity.ts';
import { AnimPlayer } from '../lib/art/animation.ts';
import { buildRig, drawRig } from '../lib/art/rig.ts';
import { burstHit, burstDust, floatText } from '../art/fx.ts';
import { audio } from '../engine/audio.ts';
import { clamp, sign } from '../lib/engine/math.ts';
import { drawText, measureText } from '../engine/text.ts';
import { applyStatus, clearStatus, tickStatuses, tickFrozen, drawStatuses, statusTint } from './status.ts';
import { normalizeTraits } from './traits.ts';
import { initShield, syncShield, tickShield, absorbShield, drawShieldFx } from './shield.ts';
import { grabMethods, BOUNCE_VY } from './grabs.ts';
import { solidAt } from './hazards.ts';
import type { Rig } from '../lib/art/rig.ts';
import type { FrameFx, FrameMove, PlayOpts, PlayerFrame } from '../lib/art/animation.ts';
import type { Aabb, CameraView, EntityKind, EntityWorld, Team } from './entity.ts';
import type { StatusOpts } from './status.ts';

export { normalizeTraits };

// ================================ DECLARED SHAPES ===================================================================
// The interfaces below are this file's half of the two reference blocks above: the def, traits, frame and world fields
// the core actually reads. Where types/content.d.ts already declares a shape (Hit, Hitbox, Hooks, Frame and friends)
// it is used BY NAME, or reached through indexed access on `ContentFrame`, rather than described a second time — that
// file is derived from the blocks above and stays the authority for content.

/**
 * Every state the machine can be in, derived from ST (constants.ts) so the two can never drift and a misspelled state
 * name is a compile error. They are STRINGS on purpose: net/checksum.ts hashes `e.state` through mixAny, and a
 * number-only path would hash a constant and make the whole state machine invisible to the desync canary.
 */
export type FighterState = typeof ST[keyof typeof ST];

/** types/content.d.ts's global `Frame` under a name the module augmentation below can reach it by. */
type ContentFrame = Frame;

/**
 * The frame fields the core honours, merged into the shared player's `Frame`. lib/art/animation.ts declares the
 * presentation fields and asks each game to add its own by declaration merging (see its header and `FrameSlots`);
 * these are ours, and every shape is taken straight off types/content.d.ts so nothing is described twice. Fields the
 * player already declares (dur, pose, interp, move, fx, sfx, event, smear, ease, face) are deliberately absent:
 * merged declarations of the same property must be identical, and those are the player's own.
 */
declare module '../lib/art/animation.ts' {
  interface Frame {
    hitbox?: ContentFrame['hitbox'];
    hitboxes?: ContentFrame['hitboxes'];
    moveRecover?: ContentFrame['moveRecover'];
    hurtboxScale?: ContentFrame['hurtboxScale'];
    spawn?: ContentFrame['spawn'];
    area?: ContentFrame['area'];
    teleport?: ContentFrame['teleport'];
    lockOn?: ContentFrame['lockOn'];
    meter?: ContentFrame['meter'];
    amount?: ContentFrame['amount'];
    cancel?: ContentFrame['cancel'];
    tell?: ContentFrame['tell'];
    armor?: ContentFrame['armor'];
    invuln?: ContentFrame['invuln'];
    punish?: ContentFrame['punish'];
    projectile?: ContentFrame['projectile'];
    summon?: ContentFrame['summon'];
    radius?: ContentFrame['radius'];
    hit?: ContentFrame['hit'];
    shake?: ContentFrame['shake'];
    offset?: ContentFrame['offset'];
  }
}

/** A frame's `spawn` spec, as spawnFromFrame reads it. */
export type FrameSpawn = NonNullable<ContentFrame['spawn']>;
/** A frame's `teleport` spec (Aether Step / Sael blink), as teleportTo reads it. */
export type FrameTeleport = NonNullable<ContentFrame['teleport']>;
/** A frame's `lockOn` spec, as lockOn reads it. */
export type FrameLockOn = NonNullable<ContentFrame['lockOn']>;

/** `traits.shield`, normalised by game/shield.ts. Absent (null) = this fighter carries no shield. */
export interface ShieldSpec {
  /** Pool in HP. */
  max: number;
  /** HP per frame once the refill starts. */
  regen: number;
  /** Frames of not being damaged before the refill starts. */
  delay: number;
  /** The same wait after the pool is emptied. */
  breakDelay: number;
  /** What the float text calls it when it breaks ('BOILER PLATE DOWN'). */
  name: string;
}

/** `traits.parry` (Rook): the window, and what a parry costs the attacker. */
export interface ParrySpec {
  /** Frames from the start of the dodge in which a melee hit is parried (default 6). */
  frames?: number;
  /** Frames of `stunned` the attacker takes (default 40). */
  stun?: number;
  /** Meter the parrier gains (default 15). */
  meter?: number;
  /** Hit-stop granted to both sides (default 8). */
  hitstop?: number;
}

/** The attack instance this fighter parried: the rest of that swing whiffs (Duelist riposte, GDD 3). */
export interface ParriedRecord {
  by: Fighter;
  /** The attacker's `anim.instance` at the moment of the parry. */
  instance: number;
}

/**
 * One entry of `def.hurtParts`: a sub-box of the body with its own damage multiplier, matched by game/combat.ts and
 * left on `f.hitPart` for the hit that follows.
 */
export interface HurtPart {
  name?: string;
  /** [y0, y1] px above the feet; the whole body when absent. */
  y?: [number, number];
  /** [x0, x1] px from the body centre, mirrored with facing. */
  x?: [number, number];
  damageMult?: number;
  /** Active only while `f.flags[flag]` is set. */
  flag?: string;
  /** Active only while this returns true. */
  when?(f: Fighter): boolean;
}

/** The TRAITS table of the header block, as game/traits.ts normalizeTraits returns it: every field always present. */
export interface FighterTraits {
  damageTakenMult: number;
  /** burn + hit.element 'fire'. */
  fireDamageMult: number;
  /** Hits taken from airborne players. */
  jumpAttackTakenMult: number;
  /** Permanent armor: no hitstun; launch / knockdown still work unless noLaunch. */
  superArmor: boolean;
  /** An armored fighter also ignores launch / knockdown hits. */
  noLaunch: boolean;
  /** Default hit count for `armor: true` frames (0 = unlimited). */
  armorHits: number;
  /** Armor only vs. hits from the front (Halberdier). */
  armorFrontOnly: boolean;
  /** Only every Nth hit taken causes hitstun (Cinder Hulk 3). */
  flinchEvery: number;
  /** Every Nth hit in one combo staggers regardless of armor (Brassbound gear slip). */
  staggerEveryNthHit: number;
  /** Frames of that stagger. */
  staggerFrames: number;
  /** Knockdown / launch hits below this damage become heavy flinches. */
  ignoreKnockdownBelow: number;
  grabbable: boolean | ((by: Fighter, f: Fighter) => boolean);
  grabbableByGrappler: boolean;
  /** May grab anything grabbableByGrappler. */
  grabAll: boolean;
  grabReach: number;
  /** Hold hits + throws dealt. */
  grabDamageMult: number;
  /** Throws dealt. */
  throwDamageMult: number;
  /** Throws taken (Brassbound 1.5). */
  throwDamageTakenMult: number;
  fleeHpFrac: number;
  fleeChance: number;
  /** Knockback divisor. */
  weight: number;
  extraJumps: number;
  airDashes: number;
  dodgeRecovery: number;
  dodgeIFrames: [number, number];
  parry: ParrySpec | null;
  /** Meter gained over the taunt animation. */
  tauntMeter: number;
  /** Training dummy (screens/training.ts): never flees or ripostes. */
  dummy: boolean;
  shield: ShieldSpec | null;
}

/** `def.moves.throwFwd` / `throwBack` (game/grabs.ts). */
export interface ThrowMove {
  damage?: number;
  vx?: number;
  vy?: number;
  /** stateTimer the target is released at (default 5). */
  releaseAt?: number;
  shockwave?: { r?: number; damage?: number };
  /** Upward velocity the thrower gets (Brunhild's slam). */
  selfVy?: number;
  /** The thrown body bounces off the floor once more; a number is the pop velocity. */
  bounce?: boolean | number;
}

/**
 * A named hero move, as the character defs carry it (`moves.special`, `moves.super`). The core reads only
 * `name` — game/player.ts beginSuper announces it — and spends METER.special / METER.super itself rather than
 * the `cost` beside it, which is there for the moves screen (screens/moves.ts).
 */
export interface NamedMove {
  name: string;
  /** Advisory: what the moves screen prints. `paySpecial` / `startSuper` spend off METER directly. */
  cost?: number;
  damage?: number;
}

/** `def.moves.grabHit`: the hold hit and how many of them auto-throw. */
export interface GrabHitMove { damage?: number; hits?: number; }

/**
 * `def.moves`. The three throw / grab moves the core resolves, plus the two named moves it only takes a display
 * name off. Named moves beyond these belong to the content that reads them.
 */
export interface FighterMoves {
  special?: NamedMove;
  super?: NamedMove;
  throwFwd?: ThrowMove;
  throwBack?: ThrowMove;
  grabHit?: GrabHitMove;
}

/** A throw waiting on its release frame, or a held weapon / prop waiting on its own (game/throwables.ts). */
export interface ThrowPending {
  /** +1 forward, -1 back. */
  dir?: number;
  /** stateTimer the release happens at. */
  at: number;
  mv?: ThrowMove | null;
  /** Set for a held item instead of a held body. */
  kind?: 'weapon' | 'prop';
  /** Up / down throw: z drift per frame. */
  vzDir?: number;
}

/** One active status (game/status.ts): the defaults for its name, the options it was applied with, and its timers. */
export interface StatusRecord {
  name: string;
  source: Fighter | null;
  timer: number;
  age: number;
  mash: number;
  frames?: number;
  tint?: string;
  tintAlpha?: number;
  onTick?(f: Fighter, s: StatusRecord, world?: FighterWorld): void;
  onEnd?(f: Fighter, s: StatusRecord, world?: FighterWorld): void;
  draw?(ctx: CanvasRenderingContext2D, f: Fighter, sx: number, sy: number, s: StatusRecord): void;
  /** A custom status carries whatever fields its content author gave it (chandler.js LIMECRUST keeps `hits0`). */
  [k: string]: any;
}

/** One entry of `hitTargets`: which box of this attack already connected with a target, and when (game/combat.ts). */
export interface HitRecord { key: string | number; frame: number; }

/** `def.explodeOnDeath`: a fuse projectile spawned where the body fell. */
export interface ExplodeOnDeath {
  delay?: number;
  radius?: number;
  damage?: number;
  /** Default true: the blast damages the owner's own team as well. */
  friendly?: boolean;
  element?: string;
  color?: string;
}

/** One entry of `def.deathSpawn`: a projectile fired from the body as it dies. */
export interface DeathSpawn { projectile: any; dx?: number; dz?: number; y?: number; }

/** Offsets and aim handed to world.spawnProjectile (world space, already resolved off the frame's local offsets). */
export interface ProjectileSpawnOpts {
  x?: number;
  y?: number;
  z?: number;
  aimX?: number;
  aimZ?: number;
  /** Index of this projectile within a `count` burst. */
  index?: number;
}

/**
 * A content definition (content/characters, content/enemies). Only the fields the CORE reads are named; a def also
 * carries the faction's own (palette, ai, variant, role, drops, score, portrait...), which is what the index
 * signature is for — the content layer owns those and nothing here may pin them down.
 */
export interface FighterDef {
  id?: string;
  name?: string;
  /**
   * Rig build and animation table. `any`, not RigBuild / AnimSet: content authors both wider than the vendored
   * library declares them (an accessory's `attach` is a plain string, not `AccessoryAttach`), so naming those types
   * here would report that gap against every def that reaches the core rather than against the def that widened it.
   */
  build?: any;
  anims?: any;
  maxHp?: number;
  hp?: number;
  walkSpeed?: number;
  runSpeed?: number;
  jumpVy?: number;
  damageMult?: number;
  /** Legacy alias of traits.damageTakenMult. */
  damageTaken?: number;
  traits?: Partial<FighterTraits>;
  hooks?: Hooks;
  /** Named projectile specs a frame's `spawn` resolves against. */
  projectiles?: Record<string, any>;
  hurtParts?: HurtPart[];
  moves?: FighterMoves;
  /** Frames spent on the floor before getting up (FIGHTER_DEFAULTS.lyingFrames). */
  lyingFrames?: number;
  /** Frames a hold lasts before it auto-throws (FIGHTER_DEFAULTS.grabHoldFrames). */
  grabHoldFrames?: number;
  /** Where a held body sits, in px along facing / up. */
  grabOffset?: number;
  grabLift?: number;
  /**
   * Named sound overrides. `special` / `super` are played by game/player.ts, which falls back to
   * `'special_' + def.id` / `'super_' + def.id` when they are absent; a def may carry more that only its own
   * hooks play.
   */
  sfx?: { hurt?: string; death?: string; special?: string; super?: string };
  explodeOnDeath?: ExplodeOnDeath;
  deathSpawn?: DeathSpawn[];
  /** Legacy aliases of the hooks of the same name. */
  onSpawn?(f: Fighter, world?: FighterWorld): void;
  onUpdate?(f: Fighter, world?: FighterWorld): void;
  onDeath?(f: Fighter, world?: FighterWorld): void;
  /** Elite: a wider HP bar with the name over it. */
  elite?: boolean;
  /** Content-layer fields the core never reads. */
  [key: string]: any;
}

/** Where a fighter wakes up. */
export interface FighterOpts {
  team?: Team;
  x?: number;
  z?: number;
  facing?: number;
  kind?: EntityKind;
}

/** A hurtbox as `hurtboxes()` returns it: the body, or one `def.hurtParts` sub-box carrying the part it came from. */
export interface HurtboxBox extends Aabb { part?: HurtPart; }

/**
 * The part of game/world.ts's `World` the combat core reaches for, on top of what every entity uses. Structural for
 * the reason given in game/entity.ts: world.ts depends on this file, so the dependency must not run back the other
 * way. `World` satisfies it.
 */
export interface FighterWorld extends EntityWorld {
  /** Where this body may stand along x (camera / arena bounds). */
  boundsFor(e: Entity): { x0: number; x1: number };
  /** The floor band, or absent on a world that does not restrict z. */
  zBounds?(e: Entity): { z0: number; z1: number } | null;
  /**
   * `exclude` is `any` for the reason `addFx` gives in game/entity.ts: world.ts's own `NearestEnemyOpts` types it
   * `Entity | Set<number> | null` — one body to skip, or a set of ids — and importing that name here would run the
   * dependency back the way this interface exists to prevent. The duck-type test (`exclude.has`) lives in world.ts,
   * where the real type is in scope.
   */
  nearestEnemy(x: number, z: number, opts?: { team?: Team; maxDist?: number; exclude?: any; zWeight?: number }): Fighter | null;
  /** Opts bag left open for the same reason: world.ts owns `AreaHitOpts` and this file may not import it. */
  areaHit(x: number, z: number, r: number, hit: Hit, attacker?: Fighter | null, opts?: Record<string, any>): void;
  /** Returns the Projectile it spawned; its shape is game/projectile.ts's, not this file's to declare. */
  spawnProjectile(spec: any, owner: Fighter, x?: number, y?: number, z?: number, opts?: Record<string, any>): any;
  /** The combat log the trials (game/trials.ts) are matched against. */
  logEvent(kind: string, attacker: Fighter | null, target?: Fighter | null, o?: { hit?: Hit | null; anim?: string | null; air?: boolean }): void;
  /** A body reached 0 hp and landed: drops, score, kill credit, wave bookkeeping. */
  onDeath(f: Fighter): void;
}

/** States during which a fighter is "in hitstun" (cannot be grabbed, not actionable). */
export const HITSTUN_STATES = new Set<FighterState>([ST.HURT, ST.HURT_AIR, ST.KNOCKDOWN, ST.LYING, ST.GETUP, ST.GRABBED, ST.THROWN, ST.DEAD]);
/** States that finish when their animation finishes. */
const ACTION_STATES = new Set<FighterState>([ST.ATTACK, ST.JUMP_ATTACK, ST.DASH_ATTACK, ST.SPECIAL, ST.SUPER, ST.DODGE, ST.TAUNT, ST.GETUP]);
/** Airborne fall states that land as a knockdown. */
export const AIR_FALL_STATES = new Set<FighterState>([ST.KNOCKDOWN, ST.HURT_AIR, ST.THROWN]);
const GROUND_FRICTION = 0.82;
const HITSTUN_SCALE_AFTER = 5, HITSTUN_MIN = 8, STAGGER_EXTRA = 30;
const HP_BAR_FRAMES = 90;
/** Frames after which a looping animation in an action state is treated as finished (missing-anim safety net). */
const LOOP_ACTION_LIMIT = 60;
/** Extra i-frames players get after standing up (GDD 7: 30f after get-up). */
const PLAYER_GETUP_INVULN = 30;
/** Hit-stop granted to both sides when an attack passes through a dodge's i-frames (GDD 7). */
const DODGE_THROUGH_HITSTOP = 4;
const THROW_BODY_HIT: Hit = { damage: 15, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 20, friendly: true, body: true, sfx: 'hit_heavy' };
const NO_HITBOXES = Object.freeze([]);
const REACTION_TYPE: Record<Reaction, HitType> = { flinch: 'light', stagger: 'medium', launch: 'launch', knockdown: 'knockdown' };

/**
 * Shared fighter. `def` is a content definition: { id, name, build, anims, maxHp|hp, walkSpeed, runSpeed, jumpVy, moves, hooks, traits,
 * projectiles, hurtParts, lyingFrames, grabHoldFrames, grabOffset, drops, score, sfx: { hurt, death } } (+ the legacy flags of TRAITS).
 */
export class Fighter extends Entity {
  // The fields, for the checker only, in constructor order. `declare` because these are the constructor's own
  // assignments and nothing else: a plain field declaration would emit a class field per name (es2022 defines them
  // before the constructor body runs), and that is a runtime change this file cannot make — applyDef asks
  // `this.shield !== undefined` whether the shield has been initialised yet, and game/combat.ts asks
  // `t.hitPart !== undefined` whether a target is a fighter at all. `declare` erases under tsc, esbuild and
  // node --experimental-strip-types alike, the way lib/art/animation.ts's AnimPlayer does it.
  declare name: string;
  declare rig: Rig;
  declare anim: AnimPlayer;
  /** Narrower than Entity's: the core reads the combat services off it. */
  declare world: FighterWorld | null;

  // ---------- content def and the stats derived from it (applyDef) ----------
  declare def: FighterDef;
  declare traits: FighterTraits;
  declare maxHp: number;
  declare hp: number;
  declare walkSpeed: number;
  declare runSpeed: number;
  declare jumpVy: number;
  declare damageMult: number;
  /** traits.damageTakenMult, copied out for the hot path. */
  declare damageTaken: number;
  /** traits.noLaunch, likewise. */
  declare unlaunchable: boolean;

  // ---------- state machine ----------
  declare state: FighterState;
  declare stateTimer: number;
  /** Frames before this body may act again (landing recovery, parry recovery). */
  declare busy: number;
  declare invuln: number;
  declare hitstop: number;
  declare flashTimer: number;
  /** False until the first update: onSpawn fires there, not in the constructor. */
  declare spawned: boolean;
  /** Where this body stood before anything moved it this frame (hitSolid). */
  declare prevX: number;
  declare prevZ: number;

  // ---------- armor ----------
  declare armor: boolean;
  /** Frame-armor hits left in this attack instance. */
  declare armorHits: number;
  declare armorInstance: number;
  /** Set by content while armor must not apply at all (boss punish windows). */
  declare armorSuppressed: boolean;

  // ---------- taking hits ----------
  /** Last attack instance dodged through, PER attacker (see takeHit): one scalar cannot track two players at once. */
  declare dodgedInstances: WeakMap<Fighter, number>;
  declare juggleCount: number;
  declare juggleGravity: number;
  declare juggleImmune: boolean;
  /** Frames of hitstun left in ST.HURT. */
  declare hurtTimer: number;
  declare chainHits: number;
  declare chainTimer: number;
  declare hitCount: number;
  declare lastHitBy: Fighter | null;
  /** HP actually lost to the last hit (no overkill in the results tally). */
  declare lastDamage: number;
  declare lastHitPart: HurtPart | null;
  /** Sub-part hit by the CURRENT hit, set by game/combat.ts from def.hurtParts and consumed by takeHit. */
  declare hitPart: HurtPart | null;
  /** Boss punish window: extra damage, and grabs allowed regardless of armor. */
  declare punishable: boolean;
  declare punishMult: number;
  declare punishGrab: boolean;
  /** Attack instance this fighter parried; the rest of that swing whiffs. */
  declare parried: ParriedRecord | null;
  declare hpBarTimer: number;
  /** Rotates 0..2 so consecutive damage numbers do not stack (damageText). */
  declare textJitter: number;
  declare godmode: boolean;
  /** The last hit dealt / taken was a throw (GDD 7 scoring); hashed by net/checksum.ts. */
  declare lastHitWasThrow: boolean;

  // ---------- death ----------
  declare dead: boolean;
  declare deadTimer: number;
  /** The death hooks fire once, at the moment of death, however the body got there. */
  declare deathHooked: boolean;

  // ---------- shield (game/shield.ts owns these; initShield assigns them) ----------
  declare shield: number;
  declare shieldMax: number;
  declare shieldTimer: number;
  declare shieldFlash: number;
  declare shieldHit: number;

  // ---------- grabs and throws (game/grabs.ts) ----------
  declare grabTarget: Fighter | null;
  declare grabbedBy: Fighter | null;
  declare grabHits: number;
  declare grabTimer: number;
  declare throwPending: ThrowPending | null;
  declare throwDamage: number;
  declare thrownBy: Fighter | null;
  /** Ids this thrown body has already hit on its way (game/combat.ts resolveThrownBody). */
  declare thrownHit: Set<number>;
  /** Held pickup prop (issue #21, step 21.3): a Prop from game/items.ts while it is carried. */
  declare heldProp: Entity | null;

  // ---------- dealing hits ----------
  /** Targets this attack instance has connected with: id -> which box, and on which frame. */
  declare hitTargets: Map<number, HitRecord>;
  declare hitInstance: number;
  declare hitConfirmed: boolean;

  // ---------- air and physics ----------
  /** Pending ground bounce armed by hit.groundBounce / throw bounce; `bounced` = already used once this fall. */
  declare bounceOnLand: { vy?: number } | null;
  declare bounced: boolean;
  /** An air action (attack / dash) has been spent this jump. */
  declare airActed: boolean;
  /** Frames of suspended gravity (a hang, a float). */
  declare noGravity: number;
  declare superTimer: number;

  // ---------- statuses and flags ----------
  /** Active statuses by name (game/status.ts). */
  declare status: Record<string, StatusRecord>;
  /** Free-form flags content may toggle (hurtParts `flag`, rig visuals). */
  declare flags: Record<string, any>;

  // ---------- frame fields (syncFrameFields) ----------
  /** Aim override for the next projectile; null = fire along facing. */
  declare aimX: number | null;
  declare aimZ: number | null;
  /** Ids a `teleport: { unique: true }` blink has already visited. */
  declare blinkHit: Set<number>;
  declare ffInstance: number;
  declare ffIndex: number;

  // ---------- rendering ----------
  /** Rig tint, unless a status supplies one (statusTint). */
  declare tint: string | null;
  declare tintAlpha: number;

  // ---------- owned by a subclass or another module; named here because the core touches them ----------
  /** Meter, combo and held body: game/player.ts. resetBody clears all three. */
  declare meter: number;
  declare combo: number;
  declare comboTimer: number;
  declare heldBody: Fighter | null;
  /** The run is won: the player holds its victory pose and stops taking hits (game/player.ts). */
  declare victory: boolean;
  /** This dodge is an air dash, so it is not a parry window (game/player.ts). */
  declare airDash: boolean;
  /** A jump attack that wants its landAttack on touchdown (game/player.ts). */
  declare landAttackPending: boolean;
  /** Who this fighter is fighting (game/enemy.ts). */
  declare target: Fighter | null;
  // `addMeter`, `clearWeapon` and `thrown` are declared as METHODS, on the interface merged into this class at
  // the foot of the file, rather than as properties here: they live on the prototype (game/player.ts defines the
  // first two, the Object.assign installs the third), and a subclass cannot override a class PROPERTY with a
  // method, nor reach one through `super`.

  // ---------- installed on the prototype from game/grabs.ts (see the Object.assign at the end of this file) ----------
  declare grabbableBy: (by: Fighter, opts?: { ignoreHitstun?: boolean }) => boolean;
  declare startGrab: (target: Fighter) => void;
  declare updateGrab: (world: FighterWorld) => void;
  declare grabHit: () => boolean;
  declare throwTarget: (dir?: number) => void;
  declare doThrow: (tp: ThrowPending) => void;
  declare releaseGrab: (hurt?: boolean) => void;

  constructor(def: FighterDef, { team = TEAM.ENEMY, x = 0, z = 70, facing = 1, kind = 'enemy' }: FighterOpts = {}) {
    super(kind);
    this.name = def.name || def.id || 'fighter';
    this.team = team;
    this.x = x; this.z = z; this.facing = facing;
    this.rig = buildRig(def.build || {});
    this.anim = new AnimPlayer(def.anims || {});
    const sc = this.rig.scale;
    this.w = Math.round(28 * sc); this.h = Math.round((this.rig.height || 72) * sc); this.zSize = 20;
    this.shadowW = Math.round(34 * sc);
    this.applyDef(def);
    this.hp = this.maxHp;
    initShield(this);
    this.state = ST.IDLE; this.stateTimer = 0;
    this.invuln = 0; this.hitstop = 0; this.flashTimer = 0; this.busy = 0;
    /** Last attack instance dodged through, PER attacker (see takeHit): one scalar cannot track two players at once. */
    this.dodgedInstances = new WeakMap();
    this.armor = this.traits.superArmor; this.armorHits = 0; this.armorInstance = -1; this.armorSuppressed = false;
    this.juggleCount = 0; this.juggleGravity = 0; this.juggleImmune = false;
    this.hurtTimer = 0; this.chainHits = 0; this.chainTimer = 0; this.hitCount = 0;
    this.lastHitBy = null; this.dead = false; this.deadTimer = 0; this.deathHooked = false;
    this.grabTarget = null; this.grabbedBy = null; this.grabHits = 0; this.grabTimer = 0; this.throwPending = null;
    /** Held pickup prop (issue #21, step 21.3) and a note that the last hit dealt/taken was a throw (GDD 7 scoring). */
    this.heldProp = null; this.lastHitWasThrow = false;
    this.hitTargets = new Map(); this.hitInstance = -1; this.hitConfirmed = false;
    this.throwDamage = 0; this.thrownBy = null; this.thrownHit = new Set();
    /** Pending ground bounce ({ vy }) armed by hit.groundBounce / throw bounce; `bounced` = already used once this fall. */
    this.bounceOnLand = null; this.bounced = false;
    this.hpBarTimer = 0; this.airActed = false; this.godmode = false; this.superTimer = 0; this.noGravity = 0;
    /** Attack instance this fighter parried ({ by, instance }): the rest of that swing whiffs (Duelist riposte, GDD 3). */
    this.parried = null;
    /** Active statuses by name (see status.js). */
    this.status = {};
    /** Free-form flags content may toggle (hurtParts `flag`, rig visuals). */
    this.flags = {};
    /** Sub-part hit by the current hit (set by combat.js from hurtParts) and the punish window (bosses). */
    this.hitPart = null; this.punishable = false; this.punishMult = 1; this.punishGrab = false;
    this.aimX = null; this.aimZ = null; this.blinkHit = new Set();
    this.spawned = false; this.ffInstance = -1; this.ffIndex = -1;
    this.play('idle');
  }
  /** (Re)apply a content def: traits, stats, speeds. Bosses call this on phase changes. */
  applyDef(def: FighterDef): void {
    this.def = def;
    this.traits = normalizeTraits(def);
    this.maxHp = def.maxHp || def.hp || 100;
    this.walkSpeed = def.walkSpeed || 1.8;
    this.runSpeed = def.runSpeed || this.walkSpeed * 1.7;
    this.jumpVy = def.jumpVy || JUMP_VY;
    this.damageMult = def.damageMult || 1;
    this.damageTaken = this.traits.damageTakenMult;
    this.unlaunchable = this.traits.noLaunch;
    if (this.shield !== undefined) syncShield(this); // a phase change may raise, lower or remove the shield
  }

  // ---------- helpers ----------
  /** Play an animation (restart by default: every attack must restart). */
  play(name: string, opts: PlayOpts = {}): boolean { return this.anim.play(name, { restart: true, ...opts }); }
  /** Enter a state and play its animation. */
  setState(state: FighterState, animName: string | null = null, opts: PlayOpts = {}): void {
    const prev = this.state;
    this.state = state; this.stateTimer = 0;
    if (animName) this.play(animName, opts);
    if (prev !== state) this.callHook('onStateEnter', state, prev);
  }
  /**
   * Call def.hooks[name](this, ...args) when defined. Returns the hook's result (undefined when absent).
   *
   * `...args: any[]` and the `any` return are the erasure this one entry point costs: `name` is a runtime string, so
   * the arguments and the result cannot be tied to the matching member of `Hooks` without a mapped-type lookup that
   * every caller would then have to spell out. The per-hook contract is declared in types/content.d.ts and is what
   * checks the content that WRITES the hooks; this is only the core's dispatcher.
   */
  callHook(name: string, ...args: any[]): any { const h = this.def.hooks && this.def.hooks[name]; return h ? h(this, ...args) : undefined; }
  get airborne(): boolean { return this.y > 0 || this.vy > 0; }
  get inHitstun(): boolean { return HITSTUN_STATES.has(this.state); }
  /** True while the fighter may start an action from the ground. */
  get actionable(): boolean { return (this.state === ST.IDLE || this.state === ST.WALK || this.state === ST.RUN) && this.busy <= 0 && !this.airborne && !this.status.netted; }
  get scale(): number { return this.rig.scale; }
  /** Status API (status.js): burn / netted / stunned / timeStopped / custom. */
  applyStatus(name: string, opts: StatusOpts = {}, source: Fighter | null = null): StatusRecord { return applyStatus(this, name, opts, source); }
  hasStatus(name: string): boolean { return !!this.status[name]; }
  clearStatus(name: string): void { clearStatus(this, name, this.world); }

  // ---------- per-step update ----------
  override update(world: FighterWorld): void {
    this.world = world;
    if (!this.spawned) { this.spawned = true; this.callHook('onSpawn', world); if (this.def.onSpawn) this.def.onSpawn(this, world); }
    // where this body stood before anything moved it this frame. A solid obstacle (issue #31) is resolved against
    // it, because which SIDE of a wall you were on is the only thing that says which side to put you back on.
    this.prevX = this.x; this.prevZ = this.z;
    if (this.hitstop > 0) { this.hitstop--; return; }
    if (tickFrozen(this, world)) return;
    if (this.flashTimer > 0) this.flashTimer--;
    if (this.invuln > 0) this.invuln--;
    if (this.hpBarTimer > 0) this.hpBarTimer--;
    tickShield(this);
    if (this.chainTimer > 0 && --this.chainTimer === 0) this.chainHits = 0;
    this.stateTimer++;
    const f = this.anim.frame;
    this.refreshArmor(f);
    if (f && f.invuln) this.invuln = Math.max(this.invuln, 2);
    this.updateState(world);
    tickStatuses(this, world);
    if (!this.dead) { this.callHook('onUpdate', world); if (this.def.onUpdate) this.def.onUpdate(this, world); }
    this.think(world);
    this.physics(world);
    this.anim.tick();
    this.processEvents(world);
    this.syncFrameFields(world);
    this.refreshArmor(this.anim.frame);
  }
  /** Controller hook (input / AI). */
  think(world: FighterWorld): void {}
  /** Armor = super armor trait, SUPER state, or the current frame's `armor` (true / N hits per attack instance). */
  refreshArmor(f: PlayerFrame | null): void {
    let frameArmor = false;
    if (f && f.armor) {
      if (this.armorInstance !== this.anim.instance) { this.armorInstance = this.anim.instance; this.armorHits = typeof f.armor === 'number' ? f.armor : (this.traits.armorHits || Infinity); }
      frameArmor = this.armorHits > 0;
    }
    this.armor = !this.armorSuppressed && (this.traits.superArmor || frameArmor || this.state === ST.SUPER);
  }
  /** Apply the declarative fields of every frame entered since the last step (spawn / area / teleport / lockOn / meter). */
  syncFrameFields(world: FighterWorld): void {
    const a = this.anim;
    if (!a.def) return;
    if (a.instance !== this.ffInstance || a.frameIndex < this.ffIndex) { this.ffInstance = a.instance; this.ffIndex = -1; }
    for (let i = this.ffIndex + 1; i <= a.frameIndex; i++) this.applyFrameFields(a.def.frames[i], world);
    this.ffIndex = a.frameIndex;
  }
  applyFrameFields(f: PlayerFrame, world: FighterWorld): void {
    if (!f) return;
    if (f.spawn) this.spawnFromFrame(f.spawn, world);
    if (f.area) this.areaFromFrame(f.area, world);
    if (f.teleport) this.teleportTo(f.teleport, world);
    if (f.lockOn) this.lockOn(f.lockOn, world);
    // `meter` is `{ amount }` or a bare number and this line takes either; the assertions only say which of the
    // two each read is looking at.
    if (f.meter && this.addMeter) this.addMeter((f.meter as { amount?: number }).amount || (f.meter as number));
  }

  updateState(world: FighterWorld): void {
    const s = this.state, a = this.anim;
    if (this.busy > 0) this.busy--;
    if (s === ST.IDLE) { if (a.name !== 'idle' && a.done && !this.status.netted) this.play('idle'); return; }
    if (ACTION_STATES.has(s)) {
      if (s === ST.SUPER) this.invuln = Math.max(this.invuln, 2);
      // a looping fallback (missing anim -> idle) would never finish: bail out after a while (the victory 'win' loop is intentional)
      if (a.done || (a.def && a.def.loop && !this.victory && this.stateTimer > LOOP_ACTION_LIMIT)) this.onActionDone(world);
      return;
    }
    if (s === ST.JUMP) { if (this.vy < 0 && a.name === 'jump') this.play('fall', { fallback: 'jump' }); return; }
    if (s === ST.HURT) { if (--this.hurtTimer <= 0 && !this.status.stunned) this.setState(ST.IDLE, 'idle'); return; }
    if (s === ST.LYING) {
      const frames = this.def.lyingFrames || FIGHTER_DEFAULTS.lyingFrames;
      if (this.stateTimer >= frames) {
        this.setState(ST.GETUP, 'getup'); audio.play('getup');
        this.invuln = Math.max(this.invuln, this.kind === 'player' ? this.anim.length + PLAYER_GETUP_INVULN : FIGHTER_DEFAULTS.getupInvuln);
      }
      return;
    }
    if (s === ST.DEAD) { if (--this.deadTimer <= 0) { this.removeMe = true; this.alive = false; } return; }
    if (s === ST.GRAB) this.updateGrab(world);
    else if (s === ST.GRABBED) { const h = this.grabbedBy; if (!h || h.grabTarget !== this || (h.state !== ST.GRAB && h.state !== ST.SUPER)) { this.grabbedBy = null; this.setState(ST.IDLE, 'idle'); } }
  }
  /** Called when an action animation finishes. */
  onActionDone(world: FighterWorld): void {
    if (this.airborne) this.setState(ST.JUMP, 'fall', { fallback: 'jump' });
    else this.setState(ST.IDLE, 'idle');
  }

  physics(world: FighterWorld): void {
    const f = this.anim.frame;
    // `move` is declared `FrameMove | number` (lib/art/animation.ts and types/content.d.ts both), but only the
    // object form carries root motion and only the object form is honoured here; no content authors a bare number.
    if (f && f.move && !this.grabbedBy) {
      this.x += ((f.move as FrameMove).x || 0) * this.facing;
      if ((f.move as FrameMove).z) this.z += (f.move as FrameMove).z;
      const vy = (f.move as FrameMove).vy != null ? (f.move as FrameMove).vy : (f.move as FrameMove).y;
      if (vy != null && this.anim.newFrame) { this.vy = vy; if (this.y <= 0) this.y = 0.01; }
    }
    if (this.grabbedBy) { this.vx = this.vy = this.vz = 0; return; }
    if (this.airborne) {
      if (this.noGravity > 0) { this.noGravity--; this.vy = 0; }
      else { this.y += this.vy; this.vy -= GRAVITY + this.juggleGravity; }
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.onLand(world); }
    } else {
      this.vx *= GROUND_FRICTION; this.vz *= GROUND_FRICTION;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
      if (Math.abs(this.vz) < 0.05) this.vz = 0;
    }
    this.x += this.vx; this.z += this.vz;
    const zb = world.zBounds ? world.zBounds(this) : null;
    this.z = clamp(this.z, zb ? zb.z0 : Z_MIN, zb ? zb.z1 : Z_MAX);
    this.hitSolid(world);
    const b = world.boundsFor(this);
    if (this.x < b.x0) { this.x = b.x0; if (AIR_FALL_STATES.has(this.state) && this.vx < -4) this.vx *= -0.5; else if (this.vx < 0) this.vx = 0; }
    else if (this.x > b.x1) { this.x = b.x1; if (AIR_FALL_STATES.has(this.state) && this.vx > 4) this.vx *= -0.5; else if (this.vx > 0) this.vx = 0; }
  }

  /**
   * Solid obstacles (issue #31, hazards.js `solid` zones): the first thing in the game that blocks movement. A body
   * whose y clears the obstacle's `height` passes over it, which is what makes a jump the answer. Everyone else is
   * set back down on the side they came from — `prevX`, captured before anything moved them this frame.
   *
   * The reaction is deliberately the SAME one the camera bound already applies a few lines below: a knocked-down or
   * thrown body carrying real speed bounces off (`vx *= -0.5`), anything else just stops. A thrown body slamming
   * into a barricade should read exactly like one slamming into the edge of the screen, because it is the same hit.
   *
   * A held body is not checked at all: physics() returns before this for `grabbedBy`, and grabs.js writes the
   * victim's position directly every frame, so a carried victim is dragged through. That is a deliberate omission —
   * making a grab fail against geometry is a combat change, not an obstacle one.
   */
  hitSolid(world: FighterWorld): void {
    // A body that is RISING is measured by the apex its current jump will reach, not by where it is right now.
    // Without this a jump started next to a wall is blocked through the first frames of its own ascent -- vx is
    // zeroed against the face while y is still below `height`, and the jump goes straight up and comes back down
    // on the near side. Committing to a jump that clears the obstacle is what clears the obstacle.
    const reach = this.vy > 0 ? this.y + (this.vy * this.vy) / (2 * GRAVITY) : this.y;
    const s = solidAt(world, this.x, this.z, reach);
    if (!s) return;
    // WHICH AXIS did the body cross? A solid is a rectangle, not a line, and a fighter walks in z as freely as in x:
    // stepping up or down into a wall's z band while already inside its x range is ordinary play. Resolving that in x
    // would pick a face by `prevX` -- which was already between x0 and x1 -- and eject the body out of the FAR side,
    // teleporting it through the wall it just touched. So push back along the axis that was actually crossed.
    const wasInX = this.prevX > s.x0 && this.prevX < s.x1;
    const wasInZ = this.prevZ > s.z0 && this.prevZ < s.z1;
    if (wasInX && !wasInZ) {
      // came in along z: put it back on the z face it came from, and kill only the inward z velocity
      const fromBack = this.prevZ <= s.z0;
      this.z = fromBack ? s.z0 - 1 : s.z1 + 1;
      if ((fromBack && this.vz > 0) || (!fromBack && this.vz < 0)) this.vz = 0;
      return;
    }
    const fromLeft = this.prevX <= s.x0;
    this.x = fromLeft ? s.x0 - 1 : s.x1 + 1;
    if (AIR_FALL_STATES.has(this.state) && Math.abs(this.vx) > 4) {
      this.vx *= -0.5;
      if (world.camera) world.camera.shake(2, 5);
      burstDust(this.x, this.z, 4, 1.4);
      audio.play('land_heavy');
    } else if ((fromLeft && this.vx > 0) || (!fromLeft && this.vx < 0)) this.vx = 0;
  }

  /**
   * Put the body on the floor from OUTSIDE physics(). Anything that teleports or repositions a fighter must come
   * through here rather than writing `y = 0; vy = 0` itself. `airborne` is (y > 0 || vy > 0), so zeroing both takes a
   * body out of the air without ever landing it, and physics() only reaches onLand on the way DOWN. Every exit from
   * an air state lives inside onLand -- KNOCKDOWN/THROWN -> LYING -> GETUP, ST.JUMP -> IDLE, and hp 0 -> ST.DEAD --
   * so a body planted the naive way is frozen in its air state for good. Above 0 hp it also never leaves
   * world.waveEnemies, and a wave that cannot clear is a SOFT-LOCK: worse than a loss, and tools/winrate.js scores
   * an unfinished run as a failure.
   */
  plant(world?: FighterWorld): void {
    const air = this.airborne, w = world || this.world;
    this.y = 0; this.vy = 0;
    if (air && w) this.onLand(w);
  }

  onLand(world: FighterWorld): void {
    const s = this.state;
    // ground bounce (GDD 2.1 / 2.3): a knocked-down body armed by hit.groundBounce pops up once more instead of lying down
    if (AIR_FALL_STATES.has(s) && this.bounceOnLand && !this.dead && !this.bounced) {
      const b = this.bounceOnLand; this.bounceOnLand = null; this.bounced = true;
      this.vy = b.vy || BOUNCE_VY; this.vx *= 0.5; this.y = 0.01; this.juggleImmune = false;
      burstDust(this.x, this.z, 5, 1.6); audio.play('land_heavy');
      if (world.camera) world.camera.shake(3, 6);
      this.setState(ST.KNOCKDOWN, 'hurtAir', { fallback: 'knockdown' });
      this.callHook('onLanded', world, s);
      return;
    }
    this.juggleCount = 0; this.juggleGravity = 0; this.juggleImmune = false; this.airActed = false; this.noGravity = 0;
    this.bounceOnLand = null; this.bounced = false;
    this.callHook('onLanded', world, s);
    if (AIR_FALL_STATES.has(s)) {
      this.vx *= 0.3;
      burstDust(this.x, this.z, 6, 2);
      if (this.dead) { this.setState(ST.DEAD, 'dead'); this.deadTimer = FIGHTER_DEFAULTS.deadBlinkFrames; world.onDeath(this); audio.play(this.def.sfx && this.def.sfx.death || 'hit_knockdown'); }
      else { this.thrownBy = null; this.setState(ST.LYING, 'lying'); audio.play('land_heavy'); }
      if (world.camera) world.camera.shake(3, 6);
      return;
    }
    if (s === ST.JUMP || s === ST.JUMP_ATTACK || s === ST.DODGE) {
      burstDust(this.x, this.z, 4, 1.4);
      audio.play('land');
      const landAtk = s === ST.JUMP_ATTACK && this.anim.has('landAttack') && this.landAttackPending;
      this.landAttackPending = false;
      if (landAtk) { this.setState(ST.ATTACK, 'landAttack'); if (world.camera) world.camera.shake(4, 8); }
      else { this.setState(ST.IDLE, 'land', { fallback: 'idle' }); this.busy = 4; }
      return;
    }
    if (s === ST.HURT) { this.setState(ST.IDLE, 'idle'); }
  }

  /**
   * Put this body back in a clean, fightable state: full HP and a full shield, no death flags, every
   * combat counter at zero and every reference to another fighter dropped. WHERE the body wakes -- its
   * position, facing, state, lives -- is the caller's business; this is only the "nothing is still
   * holding it" half. Every revive path needs that half, and each used to spell it out by hand, which
   * is how GameplayScreen.continueRun came to miss the shield and `deathHooked`: a continued hero
   * returned with the broken shield they died holding, and with the death hook already spent so their
   * NEXT death skipped it (fighter.js onDeath early-returns on deathHooked).
   * Boss.nextPhase deliberately does NOT route through here -- a phase change is not a revive, and
   * applyPhase owns that rig's HP.
   */
  resetBody(): void {
    this.hp = this.maxHp; this.meter = 0;
    initShield(this);
    this.dead = false; this.deathHooked = false; this.alive = true; this.removeMe = false;
    this.combo = 0; this.comboTimer = 0; this.juggleCount = 0; this.juggleGravity = 0;
    this.juggleImmune = false; this.chainHits = 0;
    this.grabTarget = null; this.grabbedBy = null; this.heldBody = null; this.heldProp = null;
    this.hitstop = 0; this.flashTimer = 0; this.status = {};
    this.clearWeapon();
  }

  processEvents(world: FighterWorld): void {
    const ev = this.anim.events;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === 'sfx') audio.play(e.name);
      // `AnimEvent.value` is `string | FrameFx` and the type tag does not narrow it (lib/art/animation.ts declares
      // them as one shape, not a discriminated union), so the fx branch says which of the two this is.
      else if (e.type === 'fx') world.addFx((e.value as FrameFx).kind, this.x + ((e.value as FrameFx).x || 0) * this.facing, (e.value as FrameFx).y || 0, this.z, { facing: this.facing, ...(e.value as FrameFx) });
      else if (e.type === 'event') { const fr = this.anim.def ? this.anim.def.frames[e.frameIndex] : null; if (this.callHook('onAnimEvent', e.name, fr, world) !== true) this.onAnimEvent(e.name, fr, world); }
    }
    ev.length = 0;
  }
  /** Animation event hook: (name, frame, world). Handles the generic projectile / area / teleport / lock-on events for every fighter. */
  onAnimEvent(name: string, frame: PlayerFrame | null, world: FighterWorld): void {
    if (name === 'spawnProjectile') this.fireProjectile(frame && frame.projectile, world);
    else if (name === 'shockwave' || name === 'area') this.areaFromFrame((frame && frame.area) || frame || {}, world);
    else if (name === 'teleport' || name === 'teleportBehind') this.teleportTo((frame && frame.teleport) || { behind: true }, world);
    else if (name === 'lockOn') this.lockOn((frame && frame.lockOn) || { range: (frame && frame.radius) || 60 }, world);
    else if (name === 'meterGain' && this.addMeter) this.addMeter((frame && frame.amount) || 25);
  }
  /** Resolve a projectile spec: a string looks up def.projectiles[name]. */
  projectileSpec(spec: string | any): any { return typeof spec === 'string' ? (this.def.projectiles && this.def.projectiles[spec]) || null : spec; }
  /** Spawn the projectile(s) described by a frame's `projectile` spec (fields: see projectile.js / the FRAME FIELDS table). */
  fireProjectile(spec: string | any, world: FighterWorld, o: ProjectileSpawnOpts = {}): any {
    spec = this.projectileSpec(spec);
    if (!spec) return null;
    const count = spec.count || 1;
    let last = null;
    for (let i = 0; i < count; i++) {
      last = world.spawnProjectile(spec, this, o.x, o.y, o.z, { ...o, index: i });
      if (spec.muzzle !== false && !spec.fromSky && i === 0) world.addFx('muzzle', last.x, last.y, last.z, { facing: this.facing });
    }
    return last;
  }
  /** Frame `spawn: { projectile, x, y, z }` (offsets are local: x along facing, y up). */
  spawnFromFrame(sp: FrameSpawn, world: FighterWorld): void {
    const o: ProjectileSpawnOpts = {};
    if (sp.x != null) o.x = this.x + this.facing * sp.x;
    if (sp.y != null) o.y = this.y + sp.y;
    if (sp.z != null) o.z = this.z + sp.z;
    if (sp.aimAt && this.aimX == null && world.nearestEnemy) { const e = world.nearestEnemy(this.x, this.z, { team: this.team === TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER }); if (e) { o.aimX = e.x; o.aimZ = e.z; } }
    this.fireProjectile(sp.count ? { ...this.projectileSpec(sp.projectile), count: sp.count } : sp.projectile, world, o);
  }
  /** Frame `area` / 'shockwave' event: radius, offset (x), hit fields. */
  areaFromFrame(a: any, world: FighterWorld): void {
    const r = a.radius || 40, off = a.offset != null ? a.offset : (a.x || 0);
    const hit = a.hit || (a.damage != null ? { damage: a.damage, type: a.type || 'knockdown', kbX: a.kbX != null ? a.kbX : 4, kbY: a.kbY != null ? a.kbY : 4, hitstun: a.hitstun || 20, status: a.status, friendly: a.friendly, groundedOnly: a.groundedOnly, element: a.element }
      : { damage: 10, type: 'knockdown', kbX: 4, kbY: 4 });
    world.areaHit(this.x + this.facing * off, this.z, r, hit, this, { teams: a.teams, y: a.y, shake: a.shake != null ? a.shake : 4, color: a.color, silent: a.silent, exclude: this.grabTarget });
  }
  /** Teleport next to the nearest enemy: `behind` (default) lands at its back facing the same way. Returns the target or null. */
  teleportTo(spec: FrameTeleport, world: FighterWorld): Fighter | null {
    const range = spec.range || 400, other = this.team === TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
    const e = (this.target && this.target.alive && !this.target.dead && this.team !== TEAM.PLAYER) ? this.target
      : world.nearestEnemy(this.x, this.z, { team: other, maxDist: range, exclude: spec.unique ? this.blinkHit : null });
    if (!e) return null;
    if (spec.unique) this.blinkHit.add(e.id);
    const col = spec.color || (this.team === TEAM.PLAYER ? '#8FE3FF' : '#4DF0E0');
    world.addFx('ring', this.x, 30, this.z, { r0: 4, r1: 40, color: col }); world.addFx('steam', this.x, 30, this.z, { count: 6 });
    const b = world.boundsFor(this), off = spec.offset || 26;
    if (spec.behind !== false) { this.x = clamp(e.x - e.facing * off, b.x0, b.x1); this.facing = e.facing; }
    else { const dir = sign(e.x - this.x) || this.facing; this.x = clamp(e.x - dir * off, b.x0, b.x1); this.facing = dir; }
    this.z = e.z;
    // a blink sets x/z directly and never reaches physics()'s clamps, so it is the one path that can land a body
    // inside a wall (issue #31). Put it down on the side of the obstacle its target is on.
    const solid = solidAt(world, this.x, this.z, this.y);
    if (solid) this.x = e.x <= solid.x0 ? solid.x0 - 1 : solid.x1 + 1;
    world.addFx('ring', this.x, 30, this.z, { r0: 4, r1: 40, color: col });
    if (spec.sfx !== false) audio.play(spec.sfx || 'aether_step');
    return e;
  }
  /** Turn toward (and snap part of the way to) the nearest enemy within `range`. */
  lockOn(spec: FrameLockOn, world: FighterWorld): Fighter | null {
    const other = this.team === TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
    const e = world.nearestEnemy(this.x, this.z, { team: other, maxDist: spec.range || 60 });
    if (!e) return null;
    const k = spec.snap != null ? spec.snap : 0.5, gap = spec.gap || 30;
    this.facing = sign(e.x - this.x) || this.facing;
    this.x += (e.x - this.facing * gap - this.x) * k; this.z += (e.z - this.z) * k;
    return e;
  }

  // ---------- taking hits ----------
  /**
   * Apply a hit. Returns false when invulnerable, dead, friendly, parried or juggle-immune.
   * @param {{damage:number, type?:string, kbX?:number, kbY?:number, hitstun?:number, friendly?:boolean, sfx?:string}} hit
   */
  takeHit(hit: Hit, attacker: Fighter | null): boolean {
    if (!this.alive || this.dead || this.state === ST.DEAD || this.victory) return false;
    if (attacker && attacker.team === this.team && !hit.friendly) {
      // a teammate's swing cuts a netted ally free (GDD 4 B5 "freed by the partner")
      if (this.status.netted && attacker !== this) { this.clearStatus('netted'); floatText(this.x, this.y + this.h + 10, this.z, 'FREED!', UI.brassLight, 1); if (attacker.addMeter) attacker.addMeter(10); }
      return false;
    }
    if (this.parried && attacker && attacker.anim && this.parried.by === attacker && this.parried.instance === attacker.anim.instance) return false;
    // traits.parry (Rook): a melee attack that would connect during the roll's first `frames` is parried — checked BEFORE the dodge's own
    // i-frames so the parry window (1-6) actually overlaps the roll's i-frames (2-12)
    const pr = this.traits.parry;
    if (pr && this.state === ST.DODGE && !this.airDash && this.stateTimer <= (pr.frames || 6) && attacker && attacker.anim && attacker.team !== this.team && !hit.projectile && hit.type !== 'grab' && !hit.unparryable && !attacker.dead) {
      this.parry(attacker, hit); return false;
    }
    if (this.invuln > 0 && !hit.unblockable) {
      // dodging through an enemy's active frames: 4f hit-stop for both + meter (GDD 7), once per attack instance
      // Keyed by attacker: with a single shared field, two players alternating attacks each overwrite the other's
      // instance, so every frame counts as a fresh dodge-through and re-applies the hit-stop to both. That froze
      // the dodger's state timer indefinitely — a co-op soft-lock, most visibly on Grubbik's evade (tools/winrate.js).
      if (this.state === ST.DODGE && attacker && attacker.anim && this.dodgedInstances.get(attacker) !== attacker.anim.instance) {
        this.dodgedInstances.set(attacker, attacker.anim.instance);
        this.hitstop = Math.max(this.hitstop, DODGE_THROUGH_HITSTOP); attacker.hitstop = Math.max(attacker.hitstop, DODGE_THROUGH_HITSTOP);
        this.onDodged(attacker);
      }
      return false;
    }
    if (this.state === ST.LYING && !hit.otg) return false;
    if (this.juggleImmune && this.airborne) return false;
    if (hit.reaction && REACTION_TYPE[hit.reaction]) hit = { ...hit, type: REACTION_TYPE[hit.reaction], stagger: hit.reaction === 'stagger' || hit.stagger };
    const hr = this.callHook('onHitTaken', hit, attacker, this.world);
    if (hr === false) return false;
    if (hr && typeof hr === 'object') hit = hr;
    const tr = this.traits, air = this.airborne, part = this.hitPart; this.hitPart = null;
    let type = hit.type || 'light';
    // `hit.fromX` names the world x a hit came from. Ownerless stage hazards set it so their knockback throws the body
    // AWAY from the vent / piston / hook; without it an unowned hit fired off the victim's own facing, which routinely
    // launched them straight back down into the thing that just hit them.
    const face = hit.fromX != null ? (sign(this.x - hit.fromX) || -this.facing)
      : attacker ? (sign(this.x - attacker.x) || attacker.facing) : -this.facing;
    if ((type === 'knockdown' || type === 'launch') && tr.ignoreKnockdownBelow && (hit.damage || 0) < tr.ignoreKnockdownBelow && !air) type = 'heavy';
    // armor: super armor / frame armor (front-only variants), flinchEvery, launch / knockdown pass unless noLaunch
    // armor is evaluated fresh here (not this.armor from the last update): hits landing during hit-stop must still spend frame armor
    const f = this.anim.frame, frameArmor = !!(f && f.armor && this.armorInstance === this.anim.instance && this.armorHits > 0);
    this.armor = !this.armorSuppressed && (tr.superArmor || frameArmor || this.state === ST.SUPER);
    let armored = this.armor && !hit.breaksArmor;
    if (armored && tr.armorFrontOnly && attacker && -face !== this.facing) armored = false;
    if (!armored && tr.flinchEvery > 1 && !hit.breaksArmor && !this.armorSuppressed && (this.hitCount + 1) % tr.flinchEvery !== 0) armored = true;
    if (armored && (type === 'launch' || type === 'knockdown') && !this.unlaunchable) armored = false;
    let dmg = (hit.damage || 0) * (attacker && attacker.damageMult || 1) * tr.damageTakenMult;
    if (hit.element === 'fire' || hit.fire) dmg *= tr.fireDamageMult;
    // thrown bodies count as throws (Brassbound throwDamageTakenMult 1.5x, GDD 3); a thrown weapon's own hit.body
    // does too, and marks this hit as throw-scored (Player.onKill x1.5, GDD 7 decision 8 — the intentional scoring
    // extension: a target killed by a thrown BODY earns the bonus, not only the thrown body itself).
    this.lastHitWasThrow = !!(hit.body || hit.type === 'throw');
    if (hit.body || hit.type === 'throw') dmg *= tr.throwDamageTakenMult;
    if (attacker && attacker.kind === 'player' && attacker.airborne) dmg *= tr.jumpAttackTakenMult;
    if (part && part.damageMult) dmg *= part.damageMult;
    if (this.punishable && this.punishMult > 1) dmg *= this.punishMult;
    if (air) dmg *= 1.2;
    dmg = Math.max(0, Math.round(dmg));
    if (this.godmode) dmg = 0;
    // the shield (traits.shield) is spent first and changes nothing else about the hit: the reactions
    // below still read off `type`, so an absorbed launcher still launches (game/shield.js)
    const eaten = absorbShield(this, dmg, attacker);
    if (eaten > 0) dmg = Math.max(0, Math.round(dmg - eaten));
    const hpBefore = this.hp;
    this.hp = Math.max(0, this.hp - dmg);
    this.lastDamage = hpBefore - this.hp; // HP actually lost (no overkill in the results tally)
    this.lastHitPart = part; this.hitCount++;
    this.hpBarTimer = HP_BAR_FRAMES;
    this.flashTimer = 4;
    this.lastHitBy = attacker || this.lastHitBy;
    // a hit on a fighter holding someone frees the held target (GDD 7 "assist"; also clears a stale grabTarget)
    if (this.grabTarget && this.state === ST.GRAB) { const held = this.grabTarget; this.releaseGrab(false); if (attacker && attacker !== held && held.team === attacker.team) { if (attacker.addMeter) attacker.addMeter(10); if (held.addMeter) held.addMeter(10); } }
    const finisher = attacker && attacker.state === ST.SUPER && (type === 'knockdown' || type === 'launch' || hit.finisher);
    const stop = finisher ? HITSTOP.superFinisher : HITSTOP[type] != null ? HITSTOP[type] : HITSTOP.light;
    this.hitstop = Math.max(this.hitstop, stop);
    if (attacker) attacker.hitstop = Math.max(attacker.hitstop, stop);
    const cy = this.y + this.h * 0.6;
    burstHit(this.x - face * 6, cy, this.z, type, face);
    if (this.world) this.world.addFx('spark', this.x - face * 8, cy, this.z, { type });
    if (dmg > 0) this.damageText(dmg, type === 'light' ? '#fff8d0' : '#ffd050', type === 'light' ? 1 : 2);
    if (this.grabbedBy && this.grabbedBy !== attacker) this.grabbedBy.releaseGrab(false);
    if (this.def.sfx && this.def.sfx.hurt) audio.play(this.def.sfx.hurt);
    const cam = this.world ? this.world.camera : null;
    if (cam && (type === 'heavy' || type === 'launch')) cam.shake(3, 6);
    if (cam && type === 'knockdown') cam.shake(4, 8);
    if (hit.status) for (const n in hit.status) this.applyStatus(n, hit.status[n] || {}, attacker);
    if (hit.groundBounce && !this.bounced && (air || this.state === ST.KNOCKDOWN || type === 'knockdown' || type === 'launch')) this.bounceOnLand = { vy: typeof hit.groundBounce === 'number' ? hit.groundBounce : BOUNCE_VY };
    const kw = 1 / (tr.weight || 1), kbX = (hit.kbX != null ? hit.kbX : null);
    // reactions
    if (this.hp <= 0) { this.die(); this.knockDown(Math.max(hit.kbY || 0, KNOCKDOWN_POP_VY), (kbX != null ? Math.max(2, kbX) : 3) * face * kw); this.onHurt(hit, attacker); return true; }
    if (armored) {
      if (frameArmor && !tr.superArmor && --this.armorHits <= 0 && this.state !== ST.SUPER) this.armor = false;
      this.vx += face * 0.5; this.onHurt(hit, attacker); audio.play('armor');
      if (this.world) this.world.logEvent('armor', this, attacker, { hit });
      return true;
    }
    if (air || this.state === ST.KNOCKDOWN) {
      this.juggleCount++;
      // up to maxJuggles (4) air hits; the next one is a hard knockdown and the body is immune until it lands (RECONCILIATION physics row)
      if (this.juggleCount > FIGHTER_DEFAULTS.maxJuggles) { this.juggleImmune = true; this.knockDown(1, face * 3 * kw); }
      else { this.juggleGravity += 0.05; this.knockDown(Math.max(JUGGLE_VY, (hit.kbY || 0) * 0.8), face * (kbX != null ? kbX * 0.6 : 2) * kw, 'hurtAir'); }
    } else if (type === 'launch') {
      this.knockDown(hit.kbY || LAUNCH_VY, face * (kbX != null ? kbX * 0.5 : 1) * kw);
    } else if (type === 'knockdown') {
      this.knockDown(Math.max(hit.kbY || 0, KNOCKDOWN_POP_VY), face * (kbX != null ? kbX : 4) * kw);
    } else {
      // flinch / stagger on the ground
      this.chainHits++; this.chainTimer = 60;
      let stun = hit.hitstun || (type === 'heavy' ? FIGHTER_DEFAULTS.hitstunHeavy : FIGHTER_DEFAULTS.hitstunLight);
      if (this.chainHits > HITSTUN_SCALE_AFTER) stun = Math.max(HITSTUN_MIN, stun - 2 * (this.chainHits - HITSTUN_SCALE_AFTER));
      const gearSlip = tr.staggerEveryNthHit > 0 && this.chainHits % tr.staggerEveryNthHit === 0;
      if (hit.stagger || gearSlip) stun += gearSlip ? tr.staggerFrames : STAGGER_EXTRA;
      this.hurtTimer = stun;
      this.vx = face * (kbX != null ? kbX : 2) * kw;
      this.grabbedBy = null;
      this.setState(ST.HURT, hit.stagger || gearSlip ? 'stagger' : 'hurt', { fallback: 'hurt' });
      if (gearSlip) audio.play('gear_slip');
    }
    this.onHurt(hit, attacker);
    return true;
  }
  /** traits.parry: an enemy melee attack during the dodge's first frames is parried (GDD 2.3 Rook). */
  parry(attacker: Fighter, hit: Hit): void {
    const p = this.traits.parry;
    this.parried = { by: attacker, instance: attacker.anim.instance };
    this.setState(ST.IDLE, 'parry', { fallback: 'idle' }); this.busy = 6; this.invuln = Math.max(this.invuln, 10);
    this.hitstop = Math.max(this.hitstop, p.hitstop || 8); attacker.hitstop = Math.max(attacker.hitstop, p.hitstop || 8);
    if (attacker.applyStatus && !attacker.dead) attacker.applyStatus('stunned', { frames: p.stun || 40 }, this);
    if (this.addMeter) this.addMeter(p.meter || 15);
    if (this.world) { this.world.addFx('spark', this.x + this.facing * 14, this.y + this.h * 0.6, this.z, { type: 'heavy' }); this.world.addFx('ring', this.x + this.facing * 10, 40, this.z, { r0: 4, r1: 36, color: '#ffffff' }); }
    floatText(this.x, this.y + this.h + 10, this.z, 'PARRY!', '#ffffff', 2);
    audio.play('parry');
    if (this.world) this.world.logEvent('parry', this, attacker, {});
    this.callHook('onParry', attacker, hit);
  }
  /** Launch / knock down with a pop. */
  knockDown(vy: number, vx: number, animName: string = 'knockdown'): void {
    if (this.grabbedBy) { this.grabbedBy.grabTarget = null; this.grabbedBy = null; }
    this.vy = vy; this.vx = vx; if (this.y <= 0) this.y = 0.01;
    this.setState(ST.KNOCKDOWN, animName, { fallback: 'knockdown' });
  }
  /** Mark dead and fire the death hooks once (before the body lands). */
  die(): void {
    this.dead = true;
    if (this.deathHooked) return;
    this.deathHooked = true;
    this.onDied(this.world);
  }
  onDied(world: FighterWorld): void {
    this.callHook('onDeath', world);
    if (this.def.onDeath) this.def.onDeath(this, world);
    if (!world) return;
    const ex = this.def.explodeOnDeath;
    if (ex) world.spawnProjectile({ kind: 'fuse', style: 'bomb', life: ex.delay || 30, onExpire: 'explode', radius: ex.radius || 40, noContactHit: true, r: 7, color: ex.color || '#8a4a2a', offsetX: 0, offsetY: 0,
      explodeHit: { damage: ex.damage || 15, type: 'knockdown', kbX: 5, kbY: 5, friendly: ex.friendly !== false, element: ex.element } }, this, this.x, 0, this.z);
    if (this.def.deathSpawn) for (const d of this.def.deathSpawn) this.fireProjectile(d.projectile, world, { x: this.x + (d.dx || 0), y: d.y || 0, z: this.z + (d.dz || 0) });
  }
  /** Hook after any successful hit (players: combo drop, meter). */
  onHurt(hit: Hit, attacker: Fighter | null): void {}
  /** Hook when one of my hits connects (players: meter, combo). */
  onHitConfirmed(target: Fighter, hit: Hit): void { this.hitConfirmed = true; this.callHook('onHitDealt', target, hit, this.world); }
  /** Hook when I kill something. */
  onKill(target: Fighter): void { this.callHook('onKill', target); }

  // ---------- grabs & throws: see grabs.js (grabbableBy, startGrab, updateGrab, grabHit, throwTarget, doThrow, releaseGrab, thrown) ----------
  /** Damage without a state change (hold hits, throws, burns). opts: { noStop, fire, silent }. */
  takeHitRaw(damage: number, type: HitType = 'medium', attacker: Fighter | null = null, opts: { noStop?: boolean; fire?: boolean; silent?: boolean } = {}): void {
    if (!this.alive || this.dead) return;
    // 'throw' marks the thrown body itself (grabs.js `thrown`); anything else (a burn tick, a hold squeeze) resets
    // the note so it is not still credited as a throw kill after (GDD 7 decision 8, Player.onKill).
    this.lastHitWasThrow = type === 'throw';
    let dmg = Math.round(damage * this.damageTaken * (attacker && attacker.damageMult || 1));
    if (this.godmode) dmg = 0;
    const eaten = absorbShield(this, dmg, attacker);
    if (eaten > 0) dmg = Math.max(0, Math.round(dmg - eaten));
    const hpBefore = this.hp;
    this.hp = Math.max(0, this.hp - dmg);
    this.hpBarTimer = HP_BAR_FRAMES; this.flashTimer = 4; this.lastHitBy = attacker || this.lastHitBy;
    if (!opts.noStop) {
      const stop = HITSTOP[type] != null ? HITSTOP[type] : HITSTOP.medium;
      this.hitstop = Math.max(this.hitstop, stop); if (attacker) attacker.hitstop = Math.max(attacker.hitstop, stop);
    }
    this.lastDamage = hpBefore - this.hp;
    if (dmg > 0) this.damageText(dmg, opts.fire ? '#ff9a30' : '#ffd050', 2);
    if (this.hp <= 0 && !this.dead) {
      this.die();
      // A body that dies IN a hold must still fall. ST.DEAD is only ever entered from onLand() out of an
      // air-fall state, so a corpse left standing never finishes dying: world.onDeath never fires, so no
      // drop, no score, no kill credit and it is never removed -- and for a player, no respawn and no
      // `out`, which leaves a solo run unable to either continue or reach game over. knockDown() lets the
      // holder go for us. grabs.js, items.js ringOut and boss.js each patched their own path by hand;
      // this is the one that hits from outside them (a burn tick, the dais vents, the molten channel).
      if (this.state !== ST.KNOCKDOWN && this.state !== ST.THROWN) this.knockDown(KNOCKDOWN_POP_VY, -this.facing * 2);
    }
  }
  /** Floating damage number; consecutive numbers are staggered so multi-hits stay legible. */
  damageText(dmg: number, color: string, size: number): void {
    const j = this.textJitter = ((this.textJitter || 0) + 1) % 3;
    const spread = 9 * Math.max(1, this.scale); // big rigs (bosses) take many hits per second: fan the numbers wider
    floatText(this.x + (j - 1) * spread, this.y + this.h + 6 + j * 7, this.z, String(dmg), color, size);
  }
  /** Hook: an attack passed through this fighter's dodge i-frames (players gain meter). */
  onDodged(attacker: Fighter): void {}
  /** Hit data used when this thrown body collides with others. */
  get bodyHit(): Hit { return THROW_BODY_HIT; }

  // ---------- rendering ----------
  override hurtbox(): Aabb | null {
    if (!this.alive || this.state === ST.DEAD) return null;
    const lying = this.state === ST.LYING, fr = this.anim.frame;
    const k = fr && fr.hurtboxScale != null ? fr.hurtboxScale : 1;
    const h = lying ? Math.round(this.h * 0.3) : Math.round(this.h * k);
    return { x0: this.x - this.w / 2, x1: this.x + this.w / 2, y0: this.y, y1: this.y + h, z0: this.z - this.zSize / 2, z1: this.z + this.zSize / 2 };
  }
  /** Hittable boxes: the whole body, or the active `def.hurtParts` (each box carries `.part` for damage multipliers). */
  hurtboxes(): readonly HurtboxBox[] {
    const base = this.hurtbox();
    if (!base) return NO_HITBOXES;
    const parts = this.def.hurtParts;
    if (!parts || !parts.length || this.state === ST.LYING) return [base];
    const out = [];
    for (const p of parts) {
      if (p.flag && !this.flags[p.flag]) continue;
      if (p.when && !p.when(this)) continue;
      const y = p.y || [0, this.h], xr = p.x;
      const x0 = xr ? (this.facing > 0 ? xr[0] : -xr[1]) : -this.w / 2, x1 = xr ? (this.facing > 0 ? xr[1] : -xr[0]) : this.w / 2;
      out.push({ x0: this.x + x0, x1: this.x + x1, y0: this.y + y[0], y1: this.y + y[1], z0: base.z0, z1: base.z1, part: p });
    }
    return out;
  }
  override draw(ctx: CanvasRenderingContext2D, cam: CameraView): void {
    if (this.state === ST.DEAD && (this.deadTimer % 6) < 3) return;
    const sx = cam.toScreenX(this.x), sy = FLOOR_TOP + this.z - this.y + cam.shakeY;
    const hooks = this.def.hooks;
    if (hooks && hooks.drawBefore) hooks.drawBefore(ctx, this, sx, sy, cam);
    let alpha = 1;
    if (this.invuln > 0 && this.kind === 'player' && !this.armor && this.state !== ST.DODGE && (this.world.frame % 4) < 2) alpha = 0.45;
    if (this.state === ST.DEAD) alpha *= Math.max(0.2, this.deadTimer / FIGHTER_DEFAULTS.deadBlinkFrames);
    const st = statusTint(this);
    drawRig(ctx, this.rig, this.anim.pose, { x: sx, y: sy, facing: this.facing, flash: this.flashTimer > 0, alpha, tint: st ? st.tint : (this.tint || null), tintAlpha: st ? st.tintAlpha : this.tintAlpha });
    drawStatuses(ctx, this, sx, sy);
    drawShieldFx(ctx, this, sx, sy);
    if (hooks && hooks.drawAfter) hooks.drawAfter(ctx, this, sx, sy, cam);
    if (this.team === TEAM.ENEMY && this.hpBarTimer > 0 && !this.dead && this.kind !== 'boss') {
      const w = this.def.elite ? 60 : 40, hh = this.def.elite ? 4 : 3, top = Math.round(sy - this.h - 10);
      // an enemy at a screen edge would push its bar (and an elite's name) off-screen: keep both fully on
      const bx = clamp(sx, w / 2 + 2, VIEW_W - w / 2 - 2);
      ctx.fillStyle = '#120c14'; ctx.fillRect(bx - w / 2 - 1, top - 1, w + 2, hh + 2);
      ctx.fillStyle = '#5a1a1a'; ctx.fillRect(bx - w / 2, top, w, hh);
      ctx.fillStyle = this.hp / this.maxHp > 0.3 ? UI.hp : UI.hpLow; ctx.fillRect(bx - w / 2, top, Math.round(w * this.hp / this.maxHp), hh);
      if (this.def.elite) {
        // Two elites standing close would stamp their labels on the same row, so alternate the
        // row by entity id and back the text with a plate to keep it readable over anything behind.
        const ly = top - 9 - (this.id & 1) * 9;
        const lw = measureText(this.name, 1) + 4, lx = clamp(sx, lw / 2 + 2, VIEW_W - lw / 2 - 2);
        ctx.fillStyle = 'rgba(18,12,20,0.75)'; ctx.fillRect(Math.round(lx - lw / 2), ly - 1, lw, 9);
        drawText(ctx, this.name, lx, ly, { size: 1, color: UI.paper, align: 'center' });
      }
    }
  }
  /** Debug: draw hurtboxes and current hitboxes; `labels` false omits the state text (training room hitbox overlay). */
  drawDebug(ctx: CanvasRenderingContext2D, cam: CameraView, labels: boolean = true): void {
    for (const hb of this.hurtboxes()) { ctx.strokeStyle = hb.part ? 'rgba(255,220,80,0.9)' : 'rgba(80,200,255,0.8)'; ctx.strokeRect(cam.toScreenX(hb.x0), FLOOR_TOP + this.z - hb.y1, hb.x1 - hb.x0, hb.y1 - hb.y0); }
    const list = this.hitboxes();
    for (const h of list) { const b = worldHitbox(this, h); ctx.strokeStyle = 'rgba(255,80,80,0.9)'; ctx.strokeRect(cam.toScreenX(b.x0), FLOOR_TOP + this.z - b.y1, b.x1 - b.x0, b.y1 - b.y0); }
    if (!labels) return;
    const stn = Object.keys(this.status).join(',');
    drawText(ctx, `${this.state}${this.hitstop ? ' HS' : ''}${this.armor ? ' A' : ''}${stn ? ' ' + stn : ''}`, cam.toScreenX(this.x), FLOOR_TOP + this.z + 4, { size: 1, color: '#9f9', align: 'center' });
  }
  /** Current frame hitboxes (0, 1 or many); `hitsBehind` boxes add a mirrored copy, `multiHit: N` = once:false + rehit N. */
  hitboxes(): readonly Hitbox[] {
    const f = this.anim.frame;
    if (!f || this.hitstop > 0) return NO_HITBOXES;
    const list = f.hitboxes || (f.hitbox ? [f.hitbox] : null);
    if (!list) return NO_HITBOXES;
    let extra = null;
    for (const hb of list) {
      if (hb.multiHit && hb.once !== false) { hb.once = false; hb.rehit = hb.rehit || hb.multiHit; }
      if (hb.hitsBehind) { if (!hb._behind) hb._behind = { ...hb, x: -(hb.x + hb.w), hitsBehind: false, id: (hb.id || 'hb') + ':behind' }; (extra || (extra = [])).push(hb._behind); }
    }
    return extra ? list.concat(extra) : list;
  }
}

/**
 * The prototype members a subclass overrides with method syntax (game/player.ts). Merged in here rather than
 * declared in the class body because only a method can be overridden by a method, and only a method can be
 * reached through `super`.
 */
export interface Fighter {
  /** Players gain meter; everything else has no meter to gain, so the core always checks first. */
  addMeter?(amount: number): void;
  /** Drop the held pickup weapon (game/player.ts, game/weapons.ts). */
  clearWeapon?(): void;
  /** Become a thrown body; installed on the prototype from game/grabs.ts by the Object.assign below. */
  thrown(vx: number, vy: number, damage: number, thrower: Fighter): void;
}

Object.assign(Fighter.prototype, grabMethods);
