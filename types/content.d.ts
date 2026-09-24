// Shapes the content layer conforms to by convention.
//
// `src/content/` is the largest layer in the game and the one where a mistake is quietest: a
// misspelled key in an animation frame or a hook object does not throw, it silently does nothing,
// and the symptom is an enemy that behaves subtly wrong three stages later. These declarations
// give tsc enough to catch that at the keystroke.
//
// Types-only, like types/globals.d.ts: never imported, never bundled, never loaded by the browser.
// They are global (this file has no top-level import/export), so JSDoc in `src/**.js` refers to
// them by bare name — `/** @type {Frame[]} */` — with no import ceremony in the source.
//
// Authority: the two reference blocks at the top of game/fighter.js — CONTENT HOOK REFERENCE and
// FRAME FIELDS honoured by the core — since those are what actually call into content.
// ARCHITECTURE.md section 4 covers the same ground more briefly and its lists are a subset (it
// omits the `medium` and `throw` hit types, and most of the hitbox fields); where the two differ,
// the core wins and it is marked below.

/**
 * Hit types. The core honours `medium` and `throw` as well as the five ARCHITECTURE.md section 4
 * lists — game/fighter.js line 40 is the authority and HITSTOP in constants.js keys off all seven.
 */
type HitType = 'light' | 'medium' | 'heavy' | 'launch' | 'knockdown' | 'grab' | 'throw';

/** How a target reacts, overriding what `type` would imply. */
type Reaction = 'flinch' | 'stagger' | 'launch' | 'knockdown';

/**
 * What one connecting hitbox does. Fields follow the FRAME FIELDS block at game/fighter.js line
 * 40, which lists more than ARCHITECTURE.md section 4 does; where the two differ the core wins.
 */
interface Hit {
  damage?: number;
  type?: HitType;
  /** Knockback along the attacker's facing / upward. `weight` on the target divides it. */
  kbX?: number;
  kbY?: number;
  hitstun?: number;
  /** Default true: one hit per target per attack. */
  once?: boolean;
  /** Re-hit interval in frames for multi-hit actives. */
  rehit?: number;
  multiHit?: number;
  /** Thrown bodies and explosions damage the attacker's own team. */
  friendly?: boolean;
  /** A mirrored copy of the box is added behind the attacker. */
  hitsBehind?: boolean;
  maxTargets?: number;
  /** Damage for the second and later targets. */
  pierceDamage?: number;
  reaction?: Reaction;
  stagger?: boolean;
  status?: Record<string, any>;
  element?: string;
  groundedOnly?: boolean;
  /** Off-the-ground: connects with a LYING target. */
  otg?: boolean;
  unblockable?: boolean;
  /** Ignores both frame armor and superArmor (fighter.js line 432). */
  breaksArmor?: boolean;
  onHit?: 'rebound' | string;
  sfx?: string;
  /** World x the hit came from: knockback pushes away from it rather than off the victim's facing. */
  fromX?: number;
  /** An airborne or knocked-down target bounces off the floor once more. */
  groundBounce?: boolean | number;
  /** Removes fire puddles the box touches (Pip's Steam Vent). */
  extinguish?: boolean;
  /** A held pickup weapon's swing: connecting spends one point of its durability (game/player.js). */
  weapon?: boolean;
  /**
   * An axe or shovel's swing or throw (game/weapons.ts `WeaponDef.chop`). Only Earth's Away reads it
   * (content/enemies/koopaEarth.ts): a chop is the one thing that cuts through his roots.
   */
  chop?: boolean;
  /**
   * A thrown body / weapon / prop's own hit (game/throwables.js). `throwDamageTakenMult` applies to it and it sets
   * `f.lastHitWasThrow`, which is what earns the x1.5 throw-kill score bonus (GDD 3/7). Listed in the FRAME FIELDS
   * block at the top of game/fighter.ts but not in ARCHITECTURE.md section 4: the core wins.
   */
  body?: boolean;
  /** Legacy alias of `element: 'fire'`: fighter.ts takes either (`hit.element === 'fire' || hit.fire`). */
  fire?: boolean;
  /** A super's killing blow: HITSTOP.superFinisher instead of the type's own (fighter.ts takeHit). */
  finisher?: boolean;
  /** Set by game/projectile.js on a ranged hit, so parries and ripostes can ignore it. */
  projectile?: boolean;
  ranged?: boolean;
  /** Never parried, whatever the window (fighter.ts takeHit). */
  unparryable?: boolean;
}

interface Hitbox extends Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  /** Identity of this box across frames: game/combat.js keys `once` / `rehit` off it (else frame index + slot). */
  id?: string;
  /** `pierce: N` = the first target plus N more; `maxTargets` wins when both are set (game/combat.js). */
  pierce?: number;
  /** z offset of the box from the attacker, along facing (game/combat.js). */
  zOff?: number;
  /** Internal: the mirrored copy `hitsBehind` builds, cached on the box so it is built once (fighter.ts hitboxes). */
  _behind?: Hitbox;
}

/** Root motion for a frame, px/frame along facing. */
interface FrameMove {
  x?: number;
  y?: number;
  z?: number;
  vy?: number;
}

/** One animation frame. `dur` is frames at 60 fps; everything else is optional. */
interface Frame {
  dur: number;
  pose?: any;
  /** Lerp toward the next frame's pose over `dur` (default true; false steps). */
  interp?: boolean;
  hitbox?: Hitbox | null;
  /** Several boxes on one frame; takes precedence over `hitbox`. */
  hitboxes?: Hitbox[];
  /** Root motion along facing, px/frame. */
  move?: FrameMove | number;
  moveRecover?: FrameMove | number;
  /** Shrink the hurtbox height on this frame, 0..1 (Rook's slide passes under projectiles). */
  hurtboxScale?: number;
  /** Spawn a projectile on frame entry; a name resolves against def.projectiles. */
  spawn?: { projectile: string | any; x?: number; y?: number; z?: number; count?: number; aimAt?: any };
  /** Area hit on frame entry. */
  area?: { radius: number; x?: number; y?: number; offset?: number; teams?: any; color?: string; shake?: number; silent?: boolean } & Hit;
  /** Aether Step / Sael blink on frame entry. `sfx: false` silences it; both are read by fighter.ts teleportTo. */
  teleport?: { toNearestEnemy?: boolean; behind?: boolean; range?: number; offset?: number; unique?: boolean; color?: string; sfx?: string | false };
  /** Turn + step toward the nearest enemy on frame entry (Tempest Waltz). In the FRAME FIELDS block, not in the doc. */
  lockOn?: { range?: number; snap?: number; gap?: number };
  /** Meter gain on frame entry (taunts): `{ amount }` or a bare number. Likewise core-only. */
  meter?: { amount?: number } | number;
  /** Meter gain for a `meterGain` event, which reads it off the frame itself (fighter.ts onAnimEvent). */
  amount?: number;
  fx?: Array<{ kind: string; x?: number; y?: number; [k: string]: any }>;
  sfx?: string;
  /**
   * Which buttons may cancel this frame. The core honours `jump` as well as the two ARCHITECTURE.md section 4
   * lists — game/player.ts thinkAttack tests for it beside `any` — though no content authors it today; where the
   * doc and the core differ the core wins.
   */
  cancel?: 'attack' | 'any' | 'jump' | null;
  /** Fires Fighter.onAnimEvent(name) before the built-in handlers. */
  event?: string;
  /** Wind-up: `tell: true` frames light the lens red (section 8). */
  tell?: boolean;
  /** true = unlimited armor hits; a number absorbs that many per attack. */
  armor?: boolean | number;
  invuln?: boolean | number;
  /** Recovery frames a player may punish. Not in the doc; used throughout content. */
  punish?: boolean;
  /** Motion smear and easing — rig-level presentation, not in the doc. */
  smear?: any;
  ease?: 'in' | 'out' | 'inout' | 'overshoot' | string;
  projectile?: any;
  summon?: any;
  radius?: number;
  /**
   * Read off the frame by the `wreckThrow` event (Pip's Wrecking Ball, game/player.ts releaseHeld): the hurl's
   * damage, its speed along facing, and how far the rubble ball flies before it stops.
   */
  damage?: number;
  vx?: number;
  maxDist?: number;
  /** The vertical velocity the `dive` event takes (game/player.ts); default -3. */
  vy?: number;
  /** `wreckGrab` (game/player.ts): false = swing nothing when there is no enemy in reach to grab. Default true. */
  rubble?: boolean;
  hit?: Hit;
  shake?: number;
  /**
   * The area's x offset along facing, px. `radius` / `hit` / `shake` / `offset` are the AREA SPEC written straight
   * onto the frame: the `shockwave` / `area` event falls back to the frame itself when it carries no `area` block
   * (game/fighter.ts onAnimEvent -> areaFromFrame, which reads `a.offset` as a number and defaults it to `a.x`), so
   * this is the same field `area.offset` above already declares as a number. It was `{ x?, y? }` here, which no
   * caller writes and no reader would understand; the core wins, as the header of this file says it does.
   */
  offset?: number;
}

/** One named animation. */
interface Anim {
  loop: boolean;
  frames: Frame[];
}

/**
 * A fighter's animation set. Keyed by name rather than a fixed list: content aliases entries
 * (`anims.run = anims.walk`), patches sets by spread, and plays names looked up at runtime
 * (`f.play('flee')`), so the key set is genuinely open.
 */
type AnimSet = Record<string, Anim>;

/**
 * Content hooks (`def.hooks.*`), all optional. Signatures mirror the reference block at the top
 * of game/fighter.js, which is what actually calls them. Annotate a faction's BASE_HOOKS with
 * this so a variant forwarding `(f, world)` is checked against the real contract.
 *
 * `f`, `world`, `target`, `attacker` and `source` are `any` throughout, and that is the whole file's constraint
 * rather than a choice per hook: as the header says, these declarations are global and this file has no top-level
 * import or export — that is what lets `src/**` name them bare. It therefore cannot name `Fighter` or
 * `FighterWorld`, which are exports of game/fighter.ts. What each hook IS given is written in its own line above.
 * Arity and the return type are checked, which is what catches the mistakes this file is here for: a hook that
 * forgets to return `true` to consume an event, or that is spelled wrong and so never fires at all.
 */
interface Hooks {
  onSpawn?(f: any, world?: any): void;
  onUpdate?(f: any, world?: any): void;
  onStateEnter?(f: any, state?: string, prev?: string): void;
  /** Return true to consume the event before the built-in handlers run. */
  onAnimEvent?(f: any, name?: string, frame?: Frame, world?: any): boolean | void;
  onHitDealt?(f: any, target?: any, hit?: Hit, world?: any): void;
  /** Return false to ignore the hit, or a replacement hit object. */
  onHitTaken?(f: any, hit?: Hit, attacker?: any, world?: any): Hit | false | void;
  onKill?(f: any, target?: any): void;
  onDeath?(f: any, world?: any): void;
  onLanded?(f: any, world?: any, fromState?: string): void;
  onJumpPressed?(f: any, world?: any, air?: boolean): boolean | void;
  onDodgePressed?(f: any, world?: any, air?: boolean): boolean | void;
  onAttackPressed?(f: any, world?: any, air?: boolean): boolean | void;
  onSpecial?(f: any, world?: any): boolean | void;
  onSuper?(f: any, world?: any): boolean | void;
  onGrab?(f: any, target?: any): void;
  onGrabbed?(f: any, by?: any): void;
  onThrow?(f: any, target?: any, dir?: number): void;
  onParry?(f: any, attacker?: any, hit?: Hit): void;
  onStatus?(f: any, name?: string, status?: any, phase?: 'apply' | 'tick' | 'end'): void;
  /**
   * The shielded brute's plate has been stripped for good by a launcher during its stagger (game/enemy.ts, which
   * sets rig.shieldStripped just before it calls this). In the CONTENT HOOK REFERENCE and called by the core, so it
   * belongs here: the Iron Warden and the Ironwing Marine both drop their plate from it.
   */
  onShieldStripped?(f: any, world?: any): void;
  /** A boss has entered phase `i` (game/boss.ts mergePhase); `phase[0]` goes up with the name plate. */
  onPhase?(f: any, i?: number, world?: any): void;
  /** A boss's stun window has opened for `frames` frames (game/boss.ts stun). */
  onStunned?(f: any, frames?: number, source?: any): void;
  /** A boss's vent has opened / closed (game/boss.ts). Neither takes an argument beyond the body. */
  onVentOpen?(f: any): void;
  onVentClose?(f: any): void;
  drawBefore?(ctx: CanvasRenderingContext2D, f: any, sx: number, sy: number, cam?: any): void;
  drawAfter?(ctx: CanvasRenderingContext2D, f: any, sx: number, sy: number, cam?: any): void;
}

/** Combat-log event kinds (game/world.js logEvent) a trial step may name. Area / shockwave hits are 'projectile'. */
type TrialKind = 'hit' | 'projectile' | 'body' | 'grab' | 'grabHit' | 'throw' | 'parry' | 'dodge' | 'cancel' | 'airDash' | 'armor';
/** One row of a hero's MOVES list (screens/moves.js). `anims` plays in sequence beside the row; `anim` is the one-anim shorthand. */
interface MoveEntry { id: string; name: string; input: string; desc: string; anim?: string; anims?: string[]; }
interface TrialStep { kind?: TrialKind | TrialKind[]; anim?: string | string[]; air?: boolean; type?: HitType; label: string; }
/** A combo trial: ordered steps matched against the combat log (game/trials.js). `spacing` = px between the two bodies. */
interface Trial { id: string; name: string; hint: string; steps: TrialStep[]; window?: number; strict?: boolean; bodies?: 1 | 2; spacing?: number; dummyMode?: 'stand' | 'block' | 'cpu'; }
/**
 * Spawn modifiers (issue #28 part 3; game/traits.js SPAWN_MODS). A stage spawn entry carries `mods: ['holdout']` and the
 * Enemy is built from the derived def (`applyMods`): spawn-time only, so lockstep netplay never sees a late coin flip.
 *  holdout   Brassbound: dead-grey lens, no wind-up key, walk/run x0.8, hp x1.3, score x1.2
 *  crusted   any: one hit of frame armour pre-applied (status 'crusted'), quicklime puff when it breaks
 *  scrip     Sootborn: lime-ringed company badge, never flees (flee / fleeLast / panic zeroed)
 *  winged    any grounded variant: salvage bladder, spawns from the sky, sinks slowly, x1.25 airborne, bag weak point x1.6
 *  salvaged  Brassbound: plum plating + hemp stripe and plate, drops a Brass Cog, gear-slip on the 3rd hit, score x1.1
 */
type SpawnModName = 'holdout' | 'crusted' | 'scrip' | 'winged' | 'salvaged';

/** One entry of SPAWN_MODS. `apply` patches the fresh derived copy `d` in place; `hooks` chain AFTER the def's own. */
interface SpawnMod {
  /** Display suffix: `TIN FOOTMAN (HOLDOUT)`. */
  label: string;
  /** Advisory: the factions the mod was drawn for. Never enforced. */
  factions?: string[];
  apply(d: any, base: any): void;
  hooks?: Hooks;
}

/**
 * Companion dialogue (issue #25, content/characters/lines.js). One two-line exchange: `a` is spoken by the hero
 * named first in the pairing key, `b` answers it. Both are drawn in the 5px pixel font on a plate over a fighter's
 * head, so both are capped at 42 characters — tools/simtest.js asserts it.
 */
interface Exchange { a: string; b: string; }

/**
 * One pairing's table, keyed by the seven triggers game/dialogue.js raises. Every key is optional: a pairing with
 * nothing written for a trigger falls back to the speaker's SOLO lines rather than to silence.
 */
interface CharacterLines {
  /** A new section of the board opened. Fires many times in a run, so it carries more than one row. */
  sectionStart?: Exchange[];
  midbossIntro?: Exchange[];
  bossIntro?: Exchange[];
  /** A hero has run out of lives. The one who went out is never a speaker — both lines are survivors. */
  partnerDown?: Exchange[];
  partnerContinue?: Exchange[];
  /** A combo crossed 20 (the BRASSY grade). Fires often, so it carries more than one row. */
  combo20?: Exchange[];
  results?: Exchange[];
  /** Raised by a board's opening beat, one row per board: `{ say: { trigger: 'boardOpen', row: 2 } }`. */
  boardOpen?: Exchange[];
  /** The same, later in the same walk — what the party is about to do rather than what they have arrived in. */
  boardWalk?: Exchange[];
}

/** A boss's own call-outs. `phase[i]` is spoken on entering phase i; `phase[0]` goes up with the name plate. */
interface BossLines { phase: string[]; defeat: string; }
