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
}

interface Hitbox extends Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
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
  area?: { radius: number; x?: number; y?: number; teams?: any; color?: string } & Hit;
  /** Aether Step / Sael blink on frame entry. */
  teleport?: { toNearestEnemy?: boolean; behind?: boolean; range?: number; offset?: number; unique?: boolean };
  fx?: Array<{ kind: string; x?: number; y?: number; [k: string]: any }>;
  sfx?: string;
  hitSfx?: string;
  cancel?: 'attack' | 'any' | null;
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
  hit?: Hit;
  shake?: number;
  offset?: { x?: number; y?: number };
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
  drawBefore?(ctx: CanvasRenderingContext2D, f: any, sx: number, sy: number, cam?: any): void;
  drawAfter?(ctx: CanvasRenderingContext2D, f: any, sx: number, sy: number, cam?: any): void;
}

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
