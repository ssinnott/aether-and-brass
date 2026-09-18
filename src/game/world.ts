// World: entity list, spawn/despawn, update order, depth-sorted draw with shadows first, FX, attack tokens (per faction group),
// camera bounds, floor band (boss arena shrink), area hits, spec-based projectile spawning, cutscenes, boss stun (pressure valves).
import { VIEW_W, VIEW_H, FLOOR_TOP, Z_MIN, Z_MAX, CAMERA_MARGIN, TEAM, ST, ATTACK_TOKENS_BY_PARTY } from '../constants.ts';
import { Camera } from '../engine/camera.ts';
import { particles } from '../engine/particles.ts';
import { resolveHits } from './combat.ts';
import { Projectile, projectileOptsFromSpec } from './projectile.ts';
import { spawnDrops, Prop } from './items.ts';
import { drawHitSpark, drawRing, drawSlash, drawMuzzleFlash, burstDust, burstSteam } from '../art/fx.ts';
import { audio } from '../engine/audio.ts';
import type { Entity, CameraView, Team } from './entity.ts';
import type { Fighter } from './fighter.ts';
import type { Player } from './player.ts';
import type { AiConfig, ArenaCamera, Enemy } from './enemy.ts';
import type { Game, GameOptions } from './game.ts';
import type { HazardCamera } from './hazards.ts';
import type { StageCamera, StageRunner } from './stage.ts';
import type { Platform } from './platforms.ts';
import type { FireSource } from './hazards.ts';
import type { ProjectileOpts, ProjectileSpec, ProjectileSpawnOverrides } from './projectile.ts';
import type { PropOpts } from './items.ts';

const FX_LIFE = { spark: 10, slash: 10, ring: 16, muzzle: 6, flash: 8 };
const FIGHTER_KINDS = new Set(['player', 'enemy', 'boss']);
/** Capped combat log length (World.log): oldest entries drop first. */
const LOG_MAX = 64;

// ================================ DECLARED SHAPES ===================================================================
// The playfield's own vocabulary: the bag a World is built with, the mixed entity list it walks, the two derived
// lists it keeps (FX and the combat log) and the option bags its spawn helpers take. Shapes another layer already
// declares are used BY NAME rather than described a second time — the layer world.ts serves declares the slice of
// this class it reaches for (game/entity.ts EntityWorld, game/fighter.ts FighterWorld, game/enemy.ts EnemyWorld,
// game/player.ts PlayerWorld, game/items.ts ItemWorld, game/hazards.ts HazardWorld, game/stage.ts StageWorld,
// game/projectile.ts ProjectileWorld) and those stay the authority for what each of them needs.

/**
 * The camera this world drives. Structural rather than engine/camera.ts's `Camera` for the reason game/entity.ts
 * gives for `CameraView`: every layer above reaches the camera through its own declaration (game/enemy.ts's
 * `ArenaCamera`, game/hazards.ts's `HazardCamera`, game/stage.ts's `StageCamera`), and this is those three plus the
 * two calls the world itself makes. engine/camera.ts's `Camera` satisfies it.
 */
export interface WorldCamera extends StageCamera, ArenaCamera, HazardCamera {
  /** Ease toward the party, never letting the leader be held against the right edge (engine/camera.ts). */
  follow(players: Player[]): void;
  /** Fixed step: the ease and the shake decay. */
  update(): void;
}

/** World-space x bounds a body is clamped to (`boundsFor`). */
export interface XBounds { x0: number; x1: number; }
/** The band of z the floor occupies (`floorBand`, `zBounds`); a boss arena shrinks it. */
export interface ZBand { z0: number; z1: number; }

/**
 * A stage backdrop, as art/backgrounds/index.ts createBackdrop hands one over (its own header block is the
 * contract). Every method is optional because `draw` tests for each: the flat two-band fallback below is what a
 * world with no backdrop at all draws.
 */
export interface Backdrop {
  /** Advance animated elements (gears, airships, drifting lava, the section-3 auto-scroll). */
  update?(frame: number, cam: WorldCamera): void;
  /** Everything behind the entities: sky, parallax layers and the floor band. */
  drawBack?(ctx: CanvasRenderingContext2D, cam: WorldCamera, frame: number): void;
  /** Near-parallax overlays and weather, over the entities. */
  drawFront?(ctx: CanvasRenderingContext2D, cam: WorldCamera, frame: number): void;
}

/** What a cutscene draws over the frozen scene; `t` runs 0..1 across `cutsceneLen`. */
export type CutsceneDraw = (ctx: CanvasRenderingContext2D, world: World, t: number) => void;

/**
 * The shell that owns this world. `cutscene` is installed on the shell rather than declared on `Game` — the same
 * arrangement as `net` / `createNet` there, and as `cutIn` in game/player.ts's PlayerWorld — which is why
 * `World.cutscene` tests it with `typeof` before preferring it.
 */
export interface WorldGame extends Game {
  cutscene?(frames: number, drawFn?: CutsceneDraw | null): void;
}

/** What a World is built with. Every field is optional: a bare world (the gallery, a test bed) takes none of them. */
export interface WorldOpts {
  /** Total stage width in px; the camera's right bound while unlocked. */
  stageLength?: number;
  /** The shell that owns this world; null on a bare one. */
  game?: WorldGame | null;
  /** The section's parallax art; null draws the flat two-band fallback. */
  backdrop?: Backdrop | null;
  /** The run options as main.ts parsed them off the URL; `Partial` because a bare world is handed none. */
  options?: Partial<GameOptions>;
}

/**
 * An entry of the entity list as the world itself reads one: game/entity.ts's `Entity`, plus the members the layers
 * above it add and the world looks for on SOME entities and not others. Every addition is optional because the list
 * is mixed — the world tests each before it uses it, and the class that owns a member declares it properly on its
 * own side (a Fighter's `state` and `dead`, a Prop's `type` and `info`, a Zone's `drawWeather`).
 */
export interface WorldEntity extends Entity {
  /** Fighters and props: the state-machine name. Only compared here, never dispatched on. */
  state?: string;
  /** Fighter: hp reached 0 (still on screen, playing the death out). */
  dead?: boolean;
  /** Player / enemy: out of lives, or gone from the run. Still listed so the HUD can show it. */
  out?: boolean;
  /** Enemy: running off the board (`ai.fleeLast`), so no longer part of the wave. */
  fleeing?: boolean;
  /** Enemy: false = still walking in from outside the arena, so the camera lock does not clamp it yet. */
  entered?: boolean;
  /** Prop / pickup: which catalogue entry it is. A 'valve' in the name flags a pressure valve (GDD 5.2). */
  type?: string;
  /**
   * Prop / pickup: the catalogue row behind `type` (game/items.ts `PropTypeInfo` / `PickupInfo`). Only the valve
   * flag is read off it here. `object &` rather than the flag on its own so BOTH rows satisfy it: an interface
   * never gains an implicit index signature, and a lone optional field is a weak type nothing would match.
   */
  info?: object & { stunsBoss?: boolean };
  /** Prop: this one breaks into a boss stun (GDD 5.2), whatever the catalogue says. */
  stunsBoss?: boolean;
  /** Prop: how long that stun lasts; 60 when it does not say. */
  stunFrames?: number;
  /** Drawn over the backdrop's front layer rather than in the depth-sorted pass — see `drawWeather` below. */
  drawWeather?(ctx: CanvasRenderingContext2D, cam: CameraView): void;
  /** Hitboxes, hurtboxes and state text (`drawDebug`). */
  drawDebug?(ctx: CanvasRenderingContext2D, cam: CameraView, labels?: boolean): void;
}

/**
 * A fighter as the world's own lists see one: game/fighter.ts's `Fighter`, plus the four members the layers above it
 * add and the world reads back. Optional for the same reason as `WorldEntity`'s: every body in `fighters` is a
 * Fighter, but only a Player carries `index` and only an Enemy carries `fleeing` and `ai`.
 */
export interface WorldFighter extends Fighter {
  /** Player slot (game/player.ts): which hero the combat log credits a hit to. */
  index?: number;
  /** Out of lives (game/player.ts) or gone from the run (game/enemy.ts): never a target again. */
  out?: boolean;
  /** Running off the board (game/enemy.ts `ai.fleeLast`). */
  fleeing?: boolean;
  /** The resolved ai table (game/enemy.ts): `tokenGroup` / `maxAttackers` are what cap a faction's attackers. */
  ai?: AiConfig;
}

/**
 * The boss a pressure valve or a stage event stuns (GDD 5.2). game/items.ts declares the props' half of the same
 * handshake as `BossLike`; this is the world's, and it reaches the phase's `ai.valveStun` through `WorldFighter`.
 * game/boss.ts's `Boss` satisfies both. Everything past the body is optional: a midboss carries no `stun` at all.
 */
export interface WorldBoss extends WorldFighter {
  /** The last phase is down: the body is still on screen, playing its defeat out. */
  defeated?: boolean;
  /** The stun, the ring, the text and the shake in one (game/boss.ts). */
  stun?(frames?: number, source?: Entity | null): void;
}

/**
 * Attack tokens (ARCHITECTURE.md section 8): at most `max` enemies swing at once, and a faction / `ai.tokenGroup`
 * may cap itself lower still.
 */
export interface AttackTokens {
  /** Overall cap; `_refreshLists` sets it from the party size (ATTACK_TOKENS_BY_PARTY). */
  max: number;
  /** Who holds one right now. */
  holders: Set<WorldFighter>;
  /**
   * Per-group caps by name. Kept beside `max` since the first version of this table and still written by nothing:
   * a group's cap is read off `ai.maxAttackers` in `requestToken`, which is where the count is done.
   */
  groups: Record<string, number>;
}

/** One transient screen effect. Derived state like `log`: never hashed by net/checksum.ts. */
export interface WorldFx {
  /** One of the five FX_LIFE keys; `addFx` drops anything else before the push, and `drawFx` dispatches on it. */
  kind: string;
  x: number;
  y: number;
  z: number;
  /** Frames elapsed, and how many it lives for: `t / life` is the 0..1 every draw is keyed off. */
  t: number;
  life: number;
  facing: number;
  /** Spark flavour: the `Hit` type it came from. */
  type: string;
  /** slash: sweep radius, start angle and arc in degrees. */
  radius: number;
  angle: number;
  sweep: number;
  color: string;
  /** ring: start and end radius. */
  r0: number;
  r1: number;
  /** ring: lies flat on the floor rather than facing the camera. */
  flat: boolean;
  /** Spark rotation 0..5, picked off the spawn position so one spark does not spin frame to frame. */
  rot: number;
}

/** What `addFx` takes beside the position. Every default is in `addFx` itself. */
export interface FxOpts {
  /** dust / steam: how many particles to burst. */
  count?: number;
  /** Frames to live; FX_LIFE[kind] when absent. */
  life?: number;
  facing?: number;
  /** Spark flavour (the hit type it came from). */
  type?: string;
  radius?: number;
  angle?: number;
  sweep?: number;
  color?: string;
  r0?: number;
  r1?: number;
  flat?: boolean;
}

/**
 * One row of the capped combat log. Derived state like `fx`: never hashed by net/checksum.ts, read only by the
 * training room (game/trials.ts matches its steps against these, screens/training.ts prints them).
 */
export interface CombatLogEntry {
  /** Monotonic across the run, so a reader can tell a new row from one it has already matched. */
  seq: number;
  frame: number;
  /** The dealing player's slot (game/player.ts `index`). */
  p: number;
  /** What happened; one of types/content.d.ts's `TrialKind` values, which is what a trial step names. */
  kind: string;
  /** The attacker's animation at the moment of the event. */
  anim: string;
  /** The hit's type, or '' for an event that carried no hit. */
  type: HitType | '';
  /** HP the target actually lost, and the hitstun it is left standing in. */
  damage: number;
  hitstun: number;
  /** The attacker was airborne. */
  air: boolean;
  targetId: number;
}

/** What `logEvent` takes beside the two bodies. */
export interface LogEventOpts {
  hit?: Hit | null;
  anim?: string | null;
  air?: boolean;
}

/** What `stunBoss` takes beside the length: the valve or the event that spent it. */
export interface StunBossOpts { source?: Entity | null; }

/**
 * What `spawnProjectile` takes in its content-spec form: game/projectile.ts's own spawn overrides (index, aim,
 * facing) plus the raw-option patch applied after the spec has been resolved. The index signature is for the rest
 * of the spec vocabulary a caller may pass straight through — game/projectile.ts owns it.
 */
export interface SpawnProjectileOpts extends ProjectileSpawnOverrides {
  /** How many go out in this burst; the spec's own `count` when absent. */
  count?: number;
  /** Raw `ProjectileOpts` assigned over the resolved options, for what a content spec cannot say. */
  overrides?: Partial<ProjectileOpts>;
  /** The rest of the spawn vocabulary, forwarded to `projectileOptsFromSpec` untouched. */
  [key: string]: any;
}

/** What `areaHit` takes beside the blast itself. */
export interface AreaHitOpts {
  /** Force the hit's type; `knockdown` wins over `launch`, as the order below has always had it. */
  knockdown?: boolean;
  launch?: boolean;
  /** The blast's own team; the attacker's when absent, TEAM.NONE with no attacker. */
  team?: Team;
  /** Which teams may be hit; everyone when null. `hitsTeams` is the older spelling and still taken. */
  teams?: Team[] | null;
  hitsTeams?: Team[] | null;
  /** A body the blast skips (usually the thrower). */
  exclude?: Entity | null;
  /** Height of the blast centre; it never sits below half the radius. */
  y?: number;
  /** Camera shake in px; 8 and over shakes for longer. */
  shake?: number;
  /** Ring colour. */
  color?: string;
  /** No ring and no shake (the legacy `spawnAreaHit` path). */
  silent?: boolean;
}

/** What `nearestEnemy` takes beside the point to measure from. */
export interface NearestEnemyOpts {
  /** Which team counts as an enemy; TEAM.ENEMY by default. */
  team?: Team;
  maxDist?: number;
  /** One body to skip, or a set of entity ids to skip: `exclude.has` is what tells the two apart. */
  exclude?: Entity | Set<number> | null;
  /** How much a difference in z counts for beside a difference in x. */
  zWeight?: number;
}

/**
 * The hook the gameplay screen installs to spawn from the content registry (bosses, stage events, containers). The
 * `opts` values are `any` because that bag belongs to the spawner (screens/gameplay.ts spawnEnemyAt) and nothing
 * here fills one in — the same wording game/enemy.ts's EnemyWorld and game/items.ts's ItemWorld use for it.
 */
export type SpawnEnemyFn = (type: string, variant: string, x: number, z: number, opts?: Record<string, any>) => Fighter;

/** The playfield: owns entities, the camera, transient FX and the hit resolution pass. */
export class World {
  // The fields, for the checker only, in constructor order. `declare` because these are the constructor's own
  // assignments and nothing else: a plain field declaration would emit a class field per name (es2022 defines them
  // before the constructor body runs), which is a runtime change — game/combat.ts tells a fighter from a prop by
  // `t.hitPart !== undefined`, so what an object carries, and when, is load-bearing here. `declare` erases under
  // tsc, esbuild and node --experimental-strip-types alike. Same reasoning (and the same wording) as
  // game/entity.ts's Entity and game/fighter.ts's Fighter.
  declare game: WorldGame | null;
  declare options: Partial<GameOptions>;
  declare entities: WorldEntity[];
  /** Reused by draw() for the depth-sorted pass, re-filled every frame (never read outside draw()). */
  declare _sorted: WorldEntity[];
  /** Player fighters (kept even while dead/out so the HUD can show them). */
  declare players: Player[];
  declare camera: WorldCamera;
  declare stageLength: number;
  declare backdrop: Backdrop | null;
  declare frame: number;
  /** Capped combat log of player-dealt hits (training room: game/trials.js, screens/training.js). Derived state
   *  like `fx`: never hashed by net/checksum.js. */
  declare log: CombatLogEntry[];
  declare logSeq: number;
  declare fx: WorldFx[];
  declare freeze: number;
  declare freezeFocus: Entity | null;
  declare boss: WorldBoss | null;
  declare wavesCleared: number;
  declare sectionIndex: number;
  /** Attack tokens: at most `max` enemies attack at once overall; `groups` caps a faction / ai.tokenGroup (Sootborn 2). */
  declare attackTokens: AttackTokens;
  /** Optional narrower fighter bounds inside the camera lock (boss dais). */
  declare arenaBounds: XBounds | null;
  /** Floor band in z every fighter is clamped to (boss arenas shrink it: `shrinkBand`). */
  declare floorBand: ZBand;
  /** Hook installed by the gameplay screen: (type, variant, x, z, opts) => Enemy (used by bosses / stage events). */
  declare spawnEnemy: SpawnEnemyFn | null;
  /** Stage runner (when running a real stage). */
  declare stage: StageRunner | null;
  /** Cutscene: entities freeze while `cutsceneTimer` > 0; `cutsceneDraw(ctx, world, t)` draws over the scene. */
  declare cutsceneTimer: number;
  declare cutsceneDraw: CutsceneDraw | null;
  declare cutsceneLen: number;
  declare _fighters: WorldFighter[];
  declare _enemies: Enemy[];
  declare _valves: Set<WorldEntity>;
  /**
   * Fire sources registered THIS frame as { x, z, r }, cleared at the top of every update. Burn ticks (status.js),
   * fire projectiles / puddles (projectile.js), a breaking lantern (items.js) and boiling vats call `addFire`; the gas
   * hazards (hazards.js gasSeep / gasCell) read it to decide whether they ignite. A per-frame list, not a flag, so a
   * hazard can ask "is there fire HERE" without every fire source knowing about every hazard. `lastFires` is the
   * previous frame's list: entities update in list order, so a hazard placed before a burning fighter would otherwise
   * never see its fire (the list is empty when the hazard runs and cleared again before it runs next).
   */
  declare fires: FireSource[];
  declare lastFires: FireSource[];

  // ---------- installed from outside, and so never assigned here ----------
  /** The section's moving floor, hung here by game/stage.ts so `drawWeather` can draw it (issue #32). */
  declare platform: Platform | null;
  /** Kill credit for the run tally and the bestiary, installed by screens/gameplay.ts. */
  declare onEnemyKilled: ((f: Fighter, killer: Fighter | null) => void) | null;

  /**
   * @param {{ stageLength?: number, game?: object, backdrop?: object, options?: object }} o
   */
  constructor({ stageLength = 2000, game = null, backdrop = null, options = {} }: WorldOpts = {}) {
    this.game = game;
    this.options = options;
    this.entities = [];
    /** Reused by draw() for the depth-sorted pass, re-filled every frame (never read outside draw()). */
    this._sorted = [];
    /** Player fighters (kept even while dead/out so the HUD can show them). */
    this.players = [];
    // `as WorldCamera`, type-only: engine/camera.ts has not declared its constructor-assigned fields yet, so the
    // checker cannot see that `Camera` already answers the interface above. It comes out the day that file does.
    this.camera = new Camera(stageLength) as WorldCamera;
    this.stageLength = stageLength;
    this.backdrop = backdrop;
    this.frame = 0;
    /** Capped combat log of player-dealt hits (training room: game/trials.js, screens/training.js). Derived state
     *  like `fx`: never hashed by net/checksum.js. */
    this.log = []; this.logSeq = 0;
    this.fx = [];
    this.freeze = 0;
    this.freezeFocus = null;
    this.boss = null;
    this.wavesCleared = 0;
    this.sectionIndex = 0;
    /** Attack tokens: at most `max` enemies attack at once overall; `groups` caps a faction / ai.tokenGroup (Sootborn 2). */
    this.attackTokens = { max: 2, holders: new Set(), groups: {} };
    /** Optional narrower fighter bounds inside the camera lock (boss dais). */
    this.arenaBounds = null;
    /** Floor band in z every fighter is clamped to (boss arenas shrink it: `shrinkBand`). */
    this.floorBand = { z0: Z_MIN, z1: Z_MAX };
    /** Hook installed by the gameplay screen: (type, variant, x, z, opts) => Enemy (used by bosses / stage events). */
    this.spawnEnemy = null;
    /** Stage runner (when running a real stage). */
    this.stage = null;
    /** Cutscene: entities freeze while `cutsceneTimer` > 0; `cutsceneDraw(ctx, world, t)` draws over the scene. */
    this.cutsceneTimer = 0; this.cutsceneDraw = null; this.cutsceneLen = 0;
    this._fighters = [];
    this._enemies = [];
    this._valves = new Set();
    /**
     * Fire sources registered THIS frame as { x, z, r }, cleared at the top of every update. Burn ticks (status.js),
     * fire projectiles / puddles (projectile.js), a breaking lantern (items.js) and boiling vats call `addFire`; the gas
     * hazards (hazards.js gasSeep / gasCell) read it to decide whether they ignite. A per-frame list, not a flag, so a
     * hazard can ask "is there fire HERE" without every fire source knowing about every hazard. `lastFires` is the
     * previous frame's list: entities update in list order, so a hazard placed before a burning fighter would otherwise
     * never see its fire (the list is empty when the hazard runs and cleared again before it runs next).
     */
    this.fires = [];
    this.lastFires = [];
  }
  /** Register a fire at (x, z) with radius r for this frame (see `fires`). */
  addFire(x: number, z: number, r: number = 16): void { this.fires.push({ x, z, r }); }
  /** Add an entity. */
  add<T extends WorldEntity>(e: T): T {
    e.world = this;
    this.entities.push(e);
    // The `kind` tests are what say which body this is: a mixed list carries no narrowing of its own, so each
    // branch casts to the shape its own test has just established. Through `WorldEntity` because `e` is the
    // generic that keeps `add`'s return type: a bare type parameter is comparable only to its own constraint.
    if (e.kind === 'player' && !this.players.includes(e as WorldEntity as Player)) this.players.push(e as WorldEntity as Player);
    if (e.kind === 'boss') this.boss = e as WorldEntity as WorldBoss;
    if (e.kind === 'prop' && (e.stunsBoss || (e.info && e.info.stunsBoss) || /valve/i.test(e.type || ''))) this._valves.add(e);
    return e;
  }
  /** Remove an entity immediately. */
  remove(e: WorldEntity): void { e.removeMe = true; const i = this.entities.indexOf(e); if (i >= 0) this.entities.splice(i, 1); if (this.boss === e) this.boss = null; }
  /** Living fighters (players, enemies, bosses) as of the last update. */
  get fighters(): WorldFighter[] { return this._fighters; }
  /** Living enemies + bosses as of the last update. */
  get enemies(): Enemy[] { return this._enemies; }
  /** Living players. */
  get alivePlayers(): Player[] { return this.players.filter((p) => p.alive && !p.dead && !p.removeMe); }
  /** Players still in the run (alive or respawning, not out): the party size waves scale to (issue #23). */
  get partySize(): number { let n = 0; for (const p of this.players) if (p && !p.out) n++; return n; }
  _refreshLists(): void {
    this._fighters.length = 0; this._enemies.length = 0;
    for (const e of this.entities) {
      // Same reasoning as `add`: the FIGHTER_KINDS test above is what says this body is a fighter, and the team
      // test what says the enemy list may have it.
      if (!FIGHTER_KINDS.has(e.kind) || e.removeMe || !e.alive) continue;
      this._fighters.push(e as WorldFighter);
      if (e.team === TEAM.ENEMY) this._enemies.push(e as Enemy);
    }
    const n = this.alivePlayers.length;
    this.attackTokens.max = ATTACK_TOKENS_BY_PARTY[Math.min(n, ATTACK_TOKENS_BY_PARTY.length - 1)];
  }
  /** Freeze the world for n frames (super cut-in); `focus` keeps drawing on top. */
  freezeFrames(n: number, focus: Entity | null = null): void { this.freeze = Math.max(this.freeze, n); this.freezeFocus = focus; }
  /**
   * Cutscene: freeze gameplay for `frames` and draw `drawFn(ctx, world, t01)` over the scene (boss entrances, phase cut-ins).
   * Prefers `game.cutscene(frames, drawFn)` when the shell implements it.
   */
  cutscene(frames: number, drawFn: CutsceneDraw | null = null): void {
    if (this.game && typeof this.game.cutscene === 'function') { this.game.cutscene(frames, drawFn); return; }
    this.cutsceneTimer = Math.max(this.cutsceneTimer, frames | 0); this.cutsceneLen = this.cutsceneTimer; this.cutsceneDraw = drawFn;
  }
  get inCutscene(): boolean { return this.cutsceneTimer > 0; }

  /** Fixed step. */
  update(): void {
    this.frame++;
    // fire sources re-register every step (a puddle that burned out last frame lights nothing two frames on); the swap keeps
    // last frame's list readable for hazards that update earlier in the entity order than the fire that reached them
    const swap = this.lastFires; this.lastFires = this.fires; this.fires = swap; this.fires.length = 0;
    if (this.cutsceneTimer > 0) { this.cutsceneTimer--; this.camera.update(); this._tickFx(); particles.update(); if (this.cutsceneTimer === 0) this.cutsceneDraw = null; return; }
    if (this.freeze > 0) { this.freeze--; this.camera.update(); this._tickFx(); if (this.freeze === 0) this.freezeFocus = null; return; }
    this._refreshLists();
    const list = this.entities.slice();
    for (const e of list) if (!e.removeMe) e.update(this);
    resolveHits(this);
    this._tickFx();
    particles.update();
    for (const h of this.attackTokens.holders) if (!h.alive || h.removeMe) this.releaseToken(h);
    this._checkValves();
    this.camera.follow(this.players);
    this.camera.update();
    if (this.backdrop && this.backdrop.update) this.backdrop.update(this.frame, this.camera);
    let n = 0;
    for (let i = 0; i < this.entities.length; i++) { const e = this.entities[i]; if (!e.removeMe) this.entities[n++] = e; else if (this.boss === e) this.boss = null; }
    this.entities.length = n;
    this._refreshLists();
  }
  _tickFx(): void { let n = 0; for (const f of this.fx) { f.t++; if (f.t < f.life) this.fx[n++] = f; } this.fx.length = n; }
  /** Pressure valves (GDD 5.2): a flagged prop that breaks stuns the boss once (props flag themselves with `stunsBoss` or a 'valve' type). */
  _checkValves(): void {
    if (!this._valves.size) return;
    for (const v of this._valves) {
      if (v.alive && !v.removeMe) continue;
      this._valves.delete(v);
      this.stunBoss(v.stunFrames || 60, { source: v });
    }
  }
  /**
   * Stun the active boss for `frames` (pressure valves, stage events). Honoured unless the boss' current phase sets ai.valveStun = false.
   * @returns {boolean} true when a boss was stunned
   */
  stunBoss(frames: number = 60, { source = null }: StunBossOpts = {}): boolean {
    const b = this.boss;
    if (!b || !b.alive || b.dead || b.defeated || (b.ai && b.ai.valveStun === false) || typeof b.stun !== 'function') return false;
    b.stun(frames, source);
    return true;
  }
  /**
   * Record a player-dealt combat event. Derived state like `fx`: never hashed by net/checksum.js, read only by the
   * training room (screens/training.js, game/trials.js). Area / shockwave hits arrive here as kind 'projectile'
   * because world.areaHit builds a Projectile. opts: { hit, anim, air }
   */
  logEvent(kind: string, attacker: WorldFighter | null, target?: WorldFighter | null, { hit = null, anim = null, air = false }: LogEventOpts = {}): void {
    if (!attacker || attacker.kind !== 'player') return;
    if (target && target.kind !== 'enemy' && target.kind !== 'boss') return;
    if (this.log.length >= LOG_MAX) this.log.shift();
    this.log.push({ seq: ++this.logSeq, frame: this.frame, p: attacker.index, kind, anim: anim || (attacker.anim ? attacker.anim.name : ''),
      type: hit ? (hit.type || 'light') : '', damage: target ? (target.lastDamage || 0) : 0, hitstun: target && target.state === ST.HURT ? target.hurtTimer : 0,
      air: !!air, targetId: target ? target.id : 0 });
  }

  /** Draw everything: backdrop, shadows, depth-sorted entities, FX, particles, foreground, cutscene overlay. */
  draw(ctx: CanvasRenderingContext2D): void {
    const cam = this.camera;
    if (this.backdrop && this.backdrop.drawBack) this.backdrop.drawBack(ctx, cam, this.frame);
    else { ctx.fillStyle = '#202030'; ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP); ctx.fillStyle = '#4a4650'; ctx.fillRect(0, FLOOR_TOP, VIEW_W, VIEW_H - FLOOR_TOP); }
    this.drawBandEdges(ctx, cam);
    // One pass draws the shadows and fills the reusable depth-sort array (this ran `entities.slice().sort()`
    // every frame, allocating a fresh array 60 times a second for the GC to take back again).
    const sorted = this._sorted;
    let n = 0;
    for (const e of this.entities) {
      sorted[n++] = e;
      if (e.alive || e.kind === 'player' || e.state === ST.DEAD) e.drawShadow(ctx, cam);
    }
    sorted.length = n;
    particles.draw(ctx, cam, 'back');
    sorted.sort(depthCompare);
    for (const e of sorted) e.draw(ctx, cam);
    this.drawFx(ctx, cam);
    particles.draw(ctx, cam, 'front');
    if (this.backdrop && this.backdrop.drawFront) this.backdrop.drawFront(ctx, cam, this.frame);
    this.drawWeather(ctx, cam);
    if (this.cutsceneTimer > 0 && this.cutsceneDraw) this.cutsceneDraw(ctx, this, 1 - this.cutsceneTimer / Math.max(1, this.cutsceneLen));
  }
  /**
   * Weather between the camera and the deck: a gale's streaks and the chevrons that say which way it is pushing —
   * a `gust` Zone (game/hazards.js) or a banking `tilt` (game/platforms.js).
   *
   * It goes OVER the backdrop's own front layer, not into the depth-sorted pass with everything else, and that is
   * deliberate: storm1's front rope rail occupies the bottom third of the floor band, which is exactly where a
   * chevron row pinned to the front edge sits, so a wind drawn underneath it is a telegraph the scenery can hide.
   * The backdrops already draw their rain here for the same reason. The platform comes along because the StageRunner
   * owns it rather than the entity list, so it has nowhere else to be drawn.
   */
  drawWeather(ctx: CanvasRenderingContext2D, cam: WorldCamera): void {
    for (const e of this.entities) if (e.drawWeather) e.drawWeather(ctx, cam);
    if (this.platform && this.platform.draw) this.platform.draw(ctx, cam);
  }
  /** Shrunk floor band: steam-vent strips along the closed edges (GDD 5.2 dais). */
  drawBandEdges(ctx: CanvasRenderingContext2D, cam: WorldCamera): void {
    const b = this.floorBand;
    if (b.z0 <= Z_MIN && b.z1 >= Z_MAX) return;
    ctx.save(); ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.frame * 0.2); ctx.fillStyle = '#e8f0f4';
    if (b.z0 > Z_MIN) ctx.fillRect(0, FLOOR_TOP + Z_MIN + cam.shakeY, VIEW_W, b.z0 - Z_MIN);
    if (b.z1 < Z_MAX) ctx.fillRect(0, FLOOR_TOP + b.z1 + cam.shakeY, VIEW_W, Z_MAX - b.z1);
    ctx.restore();
  }
  /** Debug overlay: hitboxes, hurtboxes, states (`labels` false = boxes only, no state text). */
  drawDebug(ctx: CanvasRenderingContext2D, labels: boolean = true): void { for (const e of this.entities) if (e.drawDebug) e.drawDebug(ctx, this.camera, labels); }

  // ---------- FX ----------
  /**
   * Add a transient screen effect at world coords. kinds: spark {type}, slash {radius, angle, sweep, color}, ring {r0, r1, color, flat},
   * muzzle, dust, steam (the last two spawn particles immediately).
   */
  addFx(kind: string, x: number, y: number, z: number, opts: FxOpts = {}): void {
    if (kind === 'dust') { burstDust(x, z, opts.count || 5); return; }
    if (kind === 'steam') { burstSteam(x, y, z, opts.count || 4); return; }
    if (!FX_LIFE[kind]) return;
    this.fx.push({ kind, x, y, z, t: 0, life: opts.life || FX_LIFE[kind], facing: opts.facing || 1, type: opts.type || 'light', radius: opts.radius || 34,
      angle: opts.angle || 0, sweep: opts.sweep || 110, color: opts.color || '#ffffff', r0: opts.r0 || 4, r1: opts.r1 || 60, flat: !!opts.flat, rot: (x * 7 + z) % 6 });
  }
  drawFx(ctx: CanvasRenderingContext2D, cam: WorldCamera): void {
    for (const f of this.fx) {
      const t = f.t / f.life, sx = cam.toScreenX(f.x), sy = Math.round(FLOOR_TOP + f.z - f.y + cam.shakeY);
      if (f.kind === 'spark') drawHitSpark(ctx, sx, sy, t, f.type, f.rot);
      else if (f.kind === 'slash') drawSlash(ctx, sx, sy, t, f.radius, f.angle, f.sweep, f.facing, f.color === '#ffffff' ? '#e8f4ff' : f.color);
      else if (f.kind === 'ring') drawRing(ctx, sx, sy, t, f.r0, f.r1, f.color, 3, f.flat);
      else if (f.kind === 'muzzle') drawMuzzleFlash(ctx, sx, sy, t, f.facing);
      else if (f.kind === 'flash') { ctx.fillStyle = f.color; ctx.globalAlpha = 0.7 * (1 - t); ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1; }
    }
  }

  // ---------- spawning helpers ----------
  /**
   * Spawn a projectile. Two forms:
   *  spawnProjectile(rawOpts)                              raw Projectile options (see projectile.js)
   *  spawnProjectile(spec, owner, x, y, z, opts)           content spec (or a name in owner.def.projectiles); x/y/z override the spec's
   *                                                        offsets when given; opts: { index, count, aimX, aimZ, facing, ...overrides }
   */
  spawnProjectile(spec: ProjectileSpec | ProjectileOpts | Projectile | string, owner?: Fighter | null, x?: number, y?: number, z?: number, opts: SpawnProjectileOpts = {}): Projectile | null {
    if (arguments.length <= 1 || spec instanceof Projectile) return this.add(spec instanceof Projectile ? spec : new Projectile(spec as ProjectileOpts));
    const s = typeof spec === 'string' ? (owner && owner.def && owner.def.projectiles && owner.def.projectiles[spec]) : spec;
    if (!s) return null;
    const o = projectileOptsFromSpec(s as ProjectileSpec, owner || null, { ...opts, x, y, z });
    if (opts.overrides) Object.assign(o, opts.overrides);
    if (!owner && o.team == null) o.team = TEAM.NONE;
    return this.add(new Projectile(o));
  }
  /**
   * One-frame area hit centred at (x, z) with radius r, credited to `attacker` (null = stage hazard, hits everyone).
   * opts: { teams: [TEAM..] (who may be hit; default = the attacker's enemies, or everyone when null), team (projectile team),
   *         exclude (entity), y (height), shake (px), color (ring), silent (no ring / shake), knockdown / launch (set hit.type) }
   * @returns {Projectile}
   */
  areaHit(x: number, z: number, r: number, hit: Hit, attacker: Fighter | null = null, opts: AreaHitOpts = {}): Projectile {
    const h = { ...hit };
    if (opts.knockdown) h.type = 'knockdown'; else if (opts.launch) h.type = 'launch';
    if (!attacker && h.friendly == null) h.friendly = true;
    const team = opts.team != null ? opts.team : (attacker ? attacker.team : TEAM.NONE);
    const p = new Projectile({ owner: attacker, team, x, y: Math.max(opts.y || 0, r * 0.5), z, r, life: 2, style: 'explosion', hit: { ...h, z: r }, pierce: 99, hitsTeams: opts.teams || opts.hitsTeams || null });
    if (opts.exclude) p.hitTargets.add(opts.exclude.id);
    if (!opts.silent) {
      this.addFx('ring', x, 0, z, { r1: r, flat: true, color: opts.color || '#ffd080' });
      if (opts.shake && this.camera) this.camera.shake(opts.shake, opts.shake >= 8 ? 12 : 8);
    }
    return this.add(p);
  }
  /**
   * Spawn a breakable prop from the art/props.js catalogue at world (x, z) — the content-side way to put a prop down
   * (the Drayman shoves a handcart, a Hoister drops a crate): content never imports game/items.js, it asks the world.
   * @param {string} type PROP_TYPES key  @param {object} [opts] Prop constructor opts ({ drops, hp, release, dump, fire, solid, rider })
   * @returns {Prop}
   */
  spawnProp(type: string, x: number, z: number, opts: PropOpts = {}): Prop { return this.add(new Prop(type, x, z, opts)); }
  /** Legacy alias of areaHit(x, z, r, hit, owner, { exclude, y }). */
  spawnAreaHit(owner: Fighter | null, x: number, z: number, r: number, hit: Hit, exclude: Entity | null = null, y: number = 0): Projectile { return this.areaHit(x, z, r, hit, owner, { exclude, y, silent: true }); }
  /** Nearest living enemy fighter to (x, z). */
  nearestEnemy(x: number, z: number, { team = TEAM.ENEMY, maxDist = Infinity, exclude = null, zWeight = 1.5 }: NearestEnemyOpts = {}): WorldFighter | null {
    let best: WorldFighter | null = null, bestD = maxDist;
    for (const e of this._fighters) {
      // `exclude` is one body or a set of ids; `exclude.has` is the duck-type test that tells them apart.
      if (e.team !== team || e.dead || (e.out) || (exclude && (exclude === e || ((exclude as Set<number>).has && (exclude as Set<number>).has(e.id))))) continue;
      const d = Math.abs(e.x - x) + Math.abs(e.z - z) * zWeight;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
  /** World x bounds an entity is clamped to (ARCHITECTURE section 2). */
  boundsFor(e: WorldEntity): XBounds {
    const cam = this.camera, m = CAMERA_MARGIN;
    const ab = this.arenaBounds;
    if (e.kind === 'player') return ab ? { x0: Math.max(ab.x0, cam.x) + m, x1: Math.min(ab.x1, cam.x + VIEW_W) - m } : { x0: Math.max(cam.left, cam.x) + m, x1: Math.min(cam.right, cam.x + VIEW_W) - m };
    if (cam.locked && e.entered !== false) return ab ? { x0: ab.x0 + m, x1: ab.x1 - m } : { x0: cam.left + m, x1: cam.right - m };
    return { x0: 0, x1: this.stageLength };
  }
  /** Floor band (z) a fighter is clamped to. */
  zBounds(e: Entity): ZBand { return this.floorBand; }
  /** Shrink the floor band by `px` on each edge (boss phases); resetBand() restores it. */
  shrinkBand(px: number): void { const b = this.floorBand; b.z0 = Math.min(b.z0 + px, 60); b.z1 = Math.max(b.z1 - px, 80); audio.play('steam'); }
  resetBand(): void { this.floorBand.z0 = Z_MIN; this.floorBand.z1 = Z_MAX; }
  /** Attack tokens: at most `max` enemies attack at once; a faction / ai.tokenGroup may cap itself lower (ai.maxAttackers). */
  requestToken(e: WorldFighter): boolean {
    const t = this.attackTokens;
    if (t.holders.has(e)) return true;
    const group = e.ai && (e.ai.tokenGroup || (e.ai.maxAttackers && e.def && e.def.faction)) || null;
    if (group) {
      let n = 0; for (const h of t.holders) if (h.ai && (h.ai.tokenGroup || (h.ai.maxAttackers && h.def && h.def.faction)) === group) n++;
      if (n >= (e.ai.maxAttackers || t.max)) return false;
    }
    if (t.holders.size >= t.max) return false;
    t.holders.add(e); return true;
  }
  releaseToken(e: WorldFighter): void { this.attackTokens.holders.delete(e); }
  /** Called when a fighter dies (lands dead): drops + score credit. */
  onDeath(f: Fighter): void {
    if (f.team === TEAM.ENEMY) {
      spawnDrops(this, f.x, f.z, f.def.drops);
      const killer = f.lastHitBy;
      if (killer && killer.onKill) killer.onKill(f);
      if (this.onEnemyKilled) this.onEnemyKilled(f, killer);
    }
    if (f.kind === 'boss' && this.boss === f) this.boss = null;
  }
  /** Reset for a new run. */
  clear(): void { this.entities.length = 0; this.players.length = 0; this.fx.length = 0; this.log.length = 0; this.fires.length = 0; this.lastFires.length = 0; this.boss = null; this.attackTokens.holders.clear(); this._valves.clear(); this.resetBand(); this.cutsceneTimer = 0; particles.clear(); }
  /** Living enemies excluding bosses (wave bookkeeping). */
  get waveEnemies(): Enemy[] { return this._enemies.filter((e) => e.kind !== 'boss' && !e.fleeing && !e.dead); }
}

function depthCompare(a: Entity, b: Entity): number {
  if (a.z !== b.z) return a.z - b.z;
  if (a.y !== b.y) return b.y - a.y;
  return a.id - b.id;
}
