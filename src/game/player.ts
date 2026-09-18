// Player: input -> intent -> state transitions (ARCHITECTURE.md section 5, GDD section 7 combat rules).
// Character-specific behaviour comes from def.traits (extraJumps, airDashes, dodgeRecovery, dodgeIFrames, parry, grabReach...) and
// def.hooks (onAttackPressed / onJumpPressed / onDodgePressed / onSpecial / onSuper / onHitDealt ...) — see the tables in fighter.js.
import { ST, TEAM, METER, FIGHTER_DEFAULTS, VIEW_W, Z_SPEED_FACTOR, KNOCKDOWN_POP_VY, UI, THROW, GRAB_REACH_BEHIND, GRAB_REACH_AHEAD_EXTRA, GRAB_Z_TOL } from '../constants.ts';
import { Fighter, AIR_FALL_STATES } from './fighter.ts';
import { mashNet } from './status.ts';
import { botIntent } from './bot.ts';
import { audio } from '../engine/audio.ts';
import { clamp, sign } from '../lib/engine/math.ts';
import { floatText, burstBreak } from '../art/fx.ts';
import { WEAPONS, WEAPON_DROP_VX, WEAPON_DROP_GRACE } from './weapons.ts';
import { WeaponPickup } from './items.ts';
import { startWeaponThrow, findLiftProp, liftProp, startPropThrow, dropHeldProp, updateHeldProp } from './throwables.ts';
import type { FighterDef, FighterWorld } from './fighter.ts';
import type { CameraView, Entity } from './entity.ts';
import type { Game } from './game.ts';
import type { PlayerFrame } from '../lib/art/animation.ts';
import type { input as inputService } from '../engine/input.ts';

const DOUBLE_TAP_FRAMES = 12;
const DODGE_FRAMES = 20, DODGE_DIST = 60, DODGE_COOLDOWN = 6, DODGE_BASE_RECOVERY = 8;
const AIR_DASH_FRAMES = 12, AIR_DASH_DIST = 60;
const DODGE_METER = 10, GRAB_MASH_OUT = 6, MASH_OUT_INVULN = 20;
const TECH_WINDOW = 6, TECH_INVULN = 20;
const CROWD_CLEAR_HITS = 3, CROWD_CLEAR_FRAMES = 90;
/** [hits, word, colour], highest first. Tuples, not a bare mixed literal: that widens to (string | number)[] and
 *  the colour then reaches game/hud.ts's drawTextOutlined as string | number. */
const GRADES: Array<[number, string, string]> = [[60, 'AETHERIC', '#ffffff'], [35, 'STEAMED', '#4DF0E0'], [20, 'BRASSY', '#ff9a30'], [10, 'SPARKY', '#ffe45a'], [3, 'SOOTY', '#c8c8c8']];
const AIR_HIT_COMBO = 2;

// ================================ DECLARED SHAPES ===================================================================
// What a Player carries that exists nowhere else: the intent it reads each step, the grade it freezes on screen, the
// bag it is built with and the slice of the world it reaches for. Shapes game/fighter.ts, game/entity.ts or
// types/content.d.ts already declare are used BY NAME rather than described a second time.

/** types/content.d.ts's global `Frame` under a name the module augmentation below can reach it by (as game/fighter.ts does). */
type ContentFrame = Frame;

/**
 * The frame fields the hero moves in THIS file read off their own frame, merged into the shared player's `Frame`
 * beside the core's (see the same block at the top of game/fighter.ts). Each shape is reached through indexed access
 * on `ContentFrame` so nothing is described twice; types/content.d.ts stays the authority.
 */
declare module '../lib/art/animation.ts' {
  interface Frame {
    damage?: ContentFrame['damage'];
    vx?: ContentFrame['vx'];
    vy?: ContentFrame['vy'];
    maxDist?: ContentFrame['maxDist'];
    rubble?: ContentFrame['rubble'];
  }
}

/** A combo grade: the word `dropCombo` freezes on screen and the colour game/hud.ts draws it in. */
export interface ComboGrade {
  /** The word alone; the HUD appends the '!'. */
  word: string;
  color: string;
}

/**
 * One step's worth of intent. `readIntent` fills it from the input service, and game/bot.ts's `botIntent` returns
 * the same shape for an autopilot slot. `x` / `y` are the -1|0|1 axes; the eight buttons are edge-style (true =
 * pressed this step) and are cleared one at a time by `consume`.
 */
export interface PlayerIntent {
  x: number;
  y: number;
  attack: boolean;
  jump: boolean;
  special: boolean;
  super: boolean;
  dodge: boolean;
  taunt: boolean;
  run: boolean;
  start: boolean;
}

/** What `consume` may clear: the eight buttons of a `PlayerIntent`, never the two axes. */
export type PlayerAction = Exclude<keyof PlayerIntent, 'x' | 'y'>;

/**
 * What a Player is built with beyond its def and slot index (screens/gameplay.ts). Every field is optional because
 * the bag itself defaults to `{}`; `input` is the one a human slot cannot do without.
 */
export interface PlayerOpts {
  /** The engine input service, as the screens pass `game.input`. A bot slot carries it but never reads it (`readIntent`). */
  input?: typeof inputService;
  x?: number;
  z?: number;
  facing?: number;
  /** This slot is on autopilot (game/bot.ts). */
  bot?: boolean;
  /** Which BOT_STYLES entry the autopilot plays as; '' = the default. */
  botStyle?: string;
  godmode?: boolean;
  lives?: number;
}

/**
 * The part of game/world.ts's `World` the player reaches for, on top of what the combat core already uses.
 * Structural, and declared here for the reason game/entity.ts gives: world.ts depends on this file, so the
 * dependency must not run back the other way. `World` satisfies it.
 */
export interface PlayerWorld extends FighterWorld {
  /** Everything in the playfield, in update order; `respawn` asks whether this body is still in it. */
  entities: Entity[];
  /** Living enemies as of the last update (world.ts's `enemies` getter). */
  enemies: Fighter[];
  /** Put an entity in the playfield and hand it back. */
  add<T extends Entity>(e: T): T;
  /** Hit-stop the whole world for `n` steps, focused on `focus` (the super freeze). */
  freezeFrames(n: number, focus?: Entity | null): void;
  /** Wider than the core's: `respawn` drops a new life inside the camera's current bounds. */
  camera: CameraView & { left: number; right: number };
  /**
   * The shell that owns this world, when one does. `cutIn` is installed on the shell rather than declared on `Game`
   * — the same arrangement as `net` / `createNet` there — which is why `beginSuper` tests it with `typeof`.
   */
  game?: Game & { cutIn?(index: number, player: Player, name: string): void };
  /** Centre banner (game/hud.ts showBanner). Installed on the world by the stage runner (game/stage.ts), so absent on a bare one. */
  announce?(text: string, sub?: string, life?: number): void;
}

/** Combo grade word + colour for a hit count (GDD 7): null below 3. */
export function comboGrade(n: number): ComboGrade | null { for (const g of GRADES) if (n >= g[0]) return { word: g[1], color: g[2] }; return null; }

/** A human (or bot) controlled fighter. */
export class Player extends Fighter {
  // The fields, for the checker only, in constructor order. `declare` because these are the constructor's own
  // assignments and nothing else: a plain field declaration would emit a class field per name (es2022 defines them
  // before the constructor body runs), which is a runtime change — and net/checksum.ts hashes `weaponId` and
  // `weaponHits` off this body, so a field that starts existing a step earlier than it used to is a desync rather
  // than a detail. `declare` erases under tsc, esbuild and node --experimental-strip-types alike. Same reasoning
  // (and the same wording) as game/entity.ts and game/fighter.ts.

  /** Narrower than Fighter's: the player reads the entity list, the enemy list and the shell off the world. */
  declare world: PlayerWorld | null;

  // ---------- slot ----------
  /** Player slot 0..3: the input device, the HUD corner and the bot-style index all key off it. */
  declare index: number;
  /** The engine input service. A bot slot never reads it — `readIntent` swaps in `botIntent` before it would. */
  declare input: typeof inputService;
  declare bot: boolean;
  /** Which BOT_STYLES entry this slot's autopilot plays as (game/bot.js); '' = the default. */
  declare botStyle: string;
  /** Lives left; `respawn` spends one, and the slot goes `out` when it runs dry. */
  declare lives: number;
  /** Out of lives: removed from the world, no longer respawning. */
  declare out: boolean;
  declare respawnTimer: number;

  // ---------- score / combo (results screen, game/hud.ts) ----------
  declare score: number;
  /** Longest combo of the run, and the pop the HUD counter is drawn at (eased back to 1 every step). */
  declare maxCombo: number;
  declare comboScale: number;
  /** The grade frozen on screen when a combo drops, and how long it stays up. */
  declare grade: ComboGrade | null;
  declare gradeTimer: number;
  declare kills: number;
  declare damageTakenTotal: number;
  declare continuesUsed: number;

  // ---------- ground chain ----------
  /** Which attackN of the chain is playing (0 = none). */
  declare comboStep: number;
  /** How many attackN anims are reachable now; a pickup weapon swaps in its own and `baseComboLength` restores it. */
  declare comboLength: number;
  declare baseComboLength: number;

  // ---------- pickup weapon (issue #20) ----------
  /** Held pickup weapon id ('' = none) and its remaining hits (game/weapons.js); both hashed by net/checksum.js. */
  declare weaponId: string;
  declare weaponHits: number;

  // ---------- movement ----------
  /** Running, and the direction it was started in: a change of direction ends it. */
  declare running: boolean;
  declare runDir: number;
  /** The last direction tapped and the step it was tapped on; a second tap within DOUBLE_TAP_FRAMES runs. */
  declare tapDir: number;
  declare tapFrame: number;
  /** Steps this body has read intent for — the double-tap clock, independent of world.frame. */
  declare frameCount: number;

  // ---------- dodge / air ----------
  declare dodgeCooldown: number;
  /** Per-step travel of the roll or air dash in progress, along x and along z. */
  declare dodgeDx: number;
  declare dodgeDz: number;
  /** The step dodge was last pressed on (world.frame), for `dodgedRecently`. */
  declare lastDodgeFrame: number;
  /** Air jumps and air dashes left this jump (traits.extraJumps / traits.airDashes). */
  declare jumpsLeft: number;
  declare airDashesLeft: number;
  /** The second air action (Rook's downward shot) has been spent this jump. */
  declare airShotUsed: boolean;
  /** Last dodge attempt was through an attack's active frames (fighter.js onDodged), else a clean roll (training readout). */
  declare dodgeThrough: boolean;
  /**
   * Read by `thinkAir` and set by nothing in this repo, so the body always turns with the stick in the air.
   * Optional because that is the truth of it; left exactly as it stands rather than folded away, since a hero that
   * must not turn mid-air would set it and removing the branch is a behaviour change to prove, not to assume.
   */
  declare airFacingLocked?: boolean;

  // ---------- held things ----------
  /** The last body this player connected with (training readout, game/hud.ts). */
  declare lastTarget: Fighter | null;
  /**
   * The rubble ball Pip's Wrecking Ball swings when there is no body in reach to grab. `any`: it is
   * game/projectile.ts's Projectile, whose shape that file owns and has not declared yet — the same reason
   * FighterWorld.spawnProjectile returns `any`.
   */
  declare heldProj: any;

  // ---------- crowd clear (GDD 7) ----------
  /** The attack instance the crowd count belongs to, the distinct bodies it has reached, and how long the x2 runs. */
  declare crowdInst: number;
  declare crowdHits: number;
  declare crowdSeen: Set<number>;
  declare crowdClearUntil: number;

  // ---------- taunt ----------
  /** Fractional meter carried between steps while a taunt trickles it in. */
  declare tauntAcc: number;
  /** This hero's taunt grants its own meter with a `meterGain` event, so `updateState` must not trickle it as well. */
  declare tauntHasEvent: boolean;

  // ---------- input ----------
  declare intent: PlayerIntent;
  /** Attack presses banked against a hold. Seeded by `think` every step before `thinkGrabbed` can read it. */
  declare mashCount: number;

  /**
   * @param {object} def character definition (content/characters)
   * @param {number} index player slot 0..3
   * @param {{ input: object, x?: number, z?: number, facing?: number, bot?: boolean, botStyle?: string, godmode?: boolean, lives?: number }} o
   */
  constructor(def: FighterDef, index: number, { input, x = 100, z = 70, facing = 1, bot = false, botStyle = '', godmode = false, lives = 3 }: PlayerOpts = {}) {
    super(def, { team: TEAM.PLAYER, kind: 'player', x, z, facing });
    this.index = index;
    this.input = input;
    this.bot = bot;
    /** Which BOT_STYLES entry this slot's autopilot plays as (game/bot.js); '' = the default. */
    this.botStyle = botStyle;
    this.godmode = godmode;
    this.lives = lives;
    this.meter = 0; this.score = 0;
    this.combo = 0; this.comboTimer = 0; this.comboScale = 1; this.maxCombo = 0; this.grade = null; this.gradeTimer = 0;
    this.kills = 0; this.damageTakenTotal = 0; this.continuesUsed = 0;
    this.comboStep = 0;
    this.comboLength = 0; for (let i = 1; i <= 6; i++) if (this.anim.has('attack' + i)) this.comboLength = i;
    this.baseComboLength = this.comboLength;
    /** Held pickup weapon id ('' = none) and its remaining hits (game/weapons.js); both hashed by net/checksum.js. */
    this.weaponId = ''; this.weaponHits = 0;
    this.running = false; this.runDir = 0; this.tapDir = 0; this.tapFrame = -100; this.frameCount = 0;
    this.dodgeCooldown = 0; this.dodgeDx = 0; this.dodgeDz = 0; this.airDash = false; this.lastDodgeFrame = -100;
    this.jumpsLeft = 0; this.airDashesLeft = 0; this.airShotUsed = false;
    this.out = false; this.respawnTimer = 0;
    /** Last dodge attempt was through an attack's active frames (fighter.js onDodged), else a clean roll (training readout). */
    this.dodgeThrough = false;
    this.lastTarget = null; this.heldBody = null; this.heldProj = null; this.victory = false;
    this.crowdInst = -1; this.crowdHits = 0; this.crowdSeen = new Set(); this.crowdClearUntil = -1; this.tauntAcc = 0;
    this.intent = { x: 0, y: 0, attack: false, jump: false, special: false, super: false, dodge: false, taunt: false, run: false, start: false };
    const taunt = def.anims && def.anims.taunt;
    this.tauntHasEvent = !!(taunt && taunt.frames && taunt.frames.some((f) => f.event === 'meterGain' || f.meter));
  }
  get grabReach(): number { return this.traits.grabReach; }

  // ---------- intent ----------
  readIntent(world: PlayerWorld): void {
    this.frameCount++;
    if (this.bot) { this.intent = botIntent(this, world); if (this.intent.dodge) this.lastDodgeFrame = world.frame; return; }
    const inp = this.input, p = this.index, it = this.intent;
    const ax = inp.axis(p);
    it.x = ax.x; it.y = ax.y;
    it.attack = inp.buffered(p, 'attack', 8);
    it.jump = inp.buffered(p, 'jump', 6);
    it.special = inp.buffered(p, 'special', 8);
    it.super = inp.buffered(p, 'super', 8);
    it.dodge = inp.pressed(p, 'dodge');
    it.taunt = inp.pressed(p, 'taunt');
    it.run = inp.runHeld(p);
    it.start = inp.pressed(p, 'start');
    if (it.dodge) this.lastDodgeFrame = world.frame;
    for (const dir of [-1, 1]) {
      if (inp.pressed(p, dir < 0 ? 'left' : 'right')) {
        if (this.tapDir === dir && this.frameCount - this.tapFrame <= DOUBLE_TAP_FRAMES) { this.running = true; this.runDir = dir; }
        this.tapDir = dir; this.tapFrame = this.frameCount;
      }
    }
  }
  consume(action: PlayerAction): void { if (!this.bot) this.input.consume(this.index, action); else this.intent[action] = false; }
  /** True if dodge was pressed within the last `frames` steps (Time Stop escape, GDD 5.2). */
  dodgedRecently(frames: number = 10): boolean { return this.world && this.world.frame - this.lastDodgeFrame <= frames; }

  // ---------- think ----------
  override think(world: PlayerWorld): void {
    if (this.victory) { if (!this.airborne && (this.state === ST.IDLE || this.state === ST.WALK || this.state === ST.RUN)) { this.state = ST.TAUNT; this.play('win', { restart: false }); } return; }
    this.readIntent(world);
    if (this.out || this.dead) return;
    const it = this.intent;
    if (this.dodgeCooldown > 0) this.dodgeCooldown--;
    if (this.state !== ST.GRABBED) this.mashCount = 0;
    if (this.status.netted) { this.running = false; if (it.attack) { this.consume('attack'); mashNet(this); } return; }
    // blinded (hazards.js limePit): the attack buttons go dead for the duration, the feet still work (status.js). A held
    // grab still mashes out - being blind is no reason to stop struggling.
    if (this.status.blinded && this.state !== ST.GRABBED) {
      if (it.attack) this.consume('attack'); if (it.special) this.consume('special'); if (it.super) this.consume('super');
      it.attack = it.special = it.super = false;
    }
    if (it.run && it.x) { this.running = true; this.runDir = it.x; }
    if (this.running && it.x !== this.runDir) this.running = false;
    switch (this.state) {
      case ST.IDLE: case ST.WALK: case ST.RUN: this.thinkGround(world); break;
      case ST.ATTACK: case ST.DASH_ATTACK: this.thinkAttack(world); break;
      case ST.JUMP: this.thinkAir(world, true); break;
      case ST.JUMP_ATTACK: this.thinkAir(world, false); break;
      case ST.GRAB: this.thinkGrab(world); break;
      case ST.GRABBED: this.thinkGrabbed(); break;
      case ST.DODGE: this.thinkDodge(world); break;
      case ST.SUPER: this.thinkSuper(); break;
      case ST.TAUNT: // interruptible (ARCHITECTURE 5): any action or movement input cancels it
        if (it.attack || it.jump || it.dodge || it.special || it.super || it.x || it.y) { this.setState(ST.IDLE, 'idle'); this.thinkGround(world); }
        break;
      default: break;
    }
  }
  thinkGround(world: PlayerWorld): void {
    const it = this.intent;
    if (this.busy > 0) return;
    if (it.super && this.meter >= METER.super) { this.consume('super'); if (this.callHook('onSuper', world) !== true) this.startSuper(world); return; }
    if (it.special) { this.consume('special'); if (this.callHook('onSpecial', world) !== true) this.trySpecial(world); return; }
    if (it.attack) {
      this.consume('attack');
      if (this.callHook('onAttackPressed', world, false) === true) return;
      if (this.running && this.anim.has('dashAttack')) { this.startDashAttack(); return; }
      const g = this.findGrabTarget(world);
      if (g) { this.startGrab(g); world.logEvent('grab', this, g, {}); return; }
      // A held weapon with a direction pressed throws instead of swinging (GDD 7 / issue #21); a neutral attack
      // with no direction stays the ordinary swing so an armed hero standing still can still fight.
      if (this.weaponId && (it.x || it.y) && startWeaponThrow(this, it)) return;
      // Bare-handed, an idle liftable prop in reach is lifted instead of swung (GDD 7 decision 4/5): one hand,
      // one held thing, so an armed hero leaves props alone entirely.
      if (!this.weaponId) { const prop = findLiftProp(this, world); if (prop) { liftProp(this, prop); return; } }
      this.startAttack(1); return;
    }
    if (it.jump) { this.consume('jump'); if (this.callHook('onJumpPressed', world, false) !== true) this.jump(); return; }
    if (it.dodge && this.dodgeCooldown <= 0) { if (this.callHook('onDodgePressed', world, false) !== true) this.startDodge(); return; }
    if (it.taunt) { this.tauntAcc = 0; this.setState(ST.TAUNT, 'taunt'); return; }
    if (it.x || it.y) {
      const speed = this.running ? this.runSpeed : this.walkSpeed;
      this.x += it.x * speed;
      const zb = world.zBounds(this);
      this.z = clamp(this.z + it.y * speed * Z_SPEED_FACTOR, zb.z0, zb.z1);
      if (it.x) this.facing = it.x;
      const st = this.running ? ST.RUN : ST.WALK;
      if (this.state !== st) { this.state = st; this.play(this.running ? 'run' : 'walk', { restart: false }); }
    } else if (this.state !== ST.IDLE) { this.running = false; this.setState(ST.IDLE, 'idle', { restart: false }); }
  }
  thinkAttack(world: PlayerWorld): void {
    const it = this.intent, a = this.anim;
    const canCancel = !!a.cancel || a.done;
    if (!canCancel) return;
    if (it.super && this.meter >= METER.super) { this.consume('super'); if (this.callHook('onSuper', world) !== true) this.startSuper(world); return; }
    if (it.attack && this.state === ST.ATTACK && this.comboStep > 0 && this.comboStep < this.comboLength && (this.hitConfirmed || this.def.freeChain !== false)) {
      this.consume('attack'); this.startAttack(this.comboStep + 1); return;
    }
    if (it.attack && this.state === ST.DASH_ATTACK && a.cancel === 'attack') { this.consume('attack'); this.startAttack(1); return; }
    if (it.dodge && this.dodgeCooldown <= 0) { if (this.callHook('onDodgePressed', world, false) !== true) { this.startDodge(); world.logEvent('cancel', this, null, { anim: 'dodge' }); } return; }
    if (it.jump && (a.cancel === 'any' || a.cancel === 'jump')) { this.consume('jump'); if (this.callHook('onJumpPressed', world, false) !== true) this.jump(); return; }
    if (it.special && a.cancel === 'any') { this.consume('special'); if (this.callHook('onSpecial', world) !== true) this.trySpecial(world); }
  }
  thinkAir(world: PlayerWorld, canAttack: boolean): void {
    const it = this.intent;
    if (it.x) { this.x += it.x * this.walkSpeed * 0.9; this.facing = this.airFacingLocked ? this.facing : it.x; }
    if (it.y) { const zb = world.zBounds(this); this.z = clamp(this.z + it.y * this.walkSpeed * 0.3, zb.z0, zb.z1); }
    if (it.attack && this.callHook('onAttackPressed', world, true) === true) { this.consume('attack'); return; }
    if (canAttack && it.attack && !this.airActed) { this.consume('attack'); this.jumpAttack(); return; }
    // second air action (Rook's downward shot, GDD 2.3): once the jump attack has finished (state is back to JUMP) and still airborne
    const inRecovery = this.state === ST.JUMP_ATTACK && this.anim.name === 'jumpAttack' && this.anim.frameIndex >= 2;
    if ((canAttack || inRecovery) && it.attack && this.airActed && !this.airShotUsed && this.anim.has('jumpAttack2')) { this.consume('attack'); this.airShotUsed = true; this.setState(ST.JUMP_ATTACK, 'jumpAttack2'); return; }
    if (it.jump && this.state === ST.JUMP) {
      if (this.callHook('onJumpPressed', world, true) === true) { this.consume('jump'); return; }
      if (this.jumpsLeft > 0) { this.consume('jump'); this.jumpsLeft--; this.vy = this.jumpVy * 0.9; this.airActed = false; this.play('jump'); audio.play('jump'); world.addFx('dust', this.x, 0, this.z, { count: 4 }); return; }
    }
    if (it.dodge && this.state === ST.JUMP) {
      if (this.callHook('onDodgePressed', world, true) === true) return;
      if (this.airDashesLeft > 0) this.startAirDash();
    }
  }
  thinkGrab(world: PlayerWorld): void {
    if (this.heldProp) { this.thinkHeld(world); return; }
    const it = this.intent;
    if (!this.grabTarget || this.throwPending || (this.anim.name === 'grab' && !this.anim.done)) return;
    if (!it.attack) return;
    this.consume('attack');
    if (it.x === this.facing) this.throwTarget(1);
    else if (it.x === -this.facing) this.throwTarget(-1);
    else this.grabHit();
  }
  /** Holding a liftable prop (GDD 7 decision 14): stays in ST.GRAB the whole hold (grabs.js updateGrab positions
   *  it every frame via throwables.updateHeldProp, BEFORE this runs), so movement runs here instead of
   *  thinkGround. Slow walk only (holdWalk 0.7x, no run/jump/dodge); a prop has no swing, so ANY attack press
   *  throws it (decision 3). Repositions once more after moving: updateGrab ran before this (Fighter.update calls
   *  updateState, then think), so without this second call the drawn prop would lag the mover by one frame. */
  thinkHeld(world: PlayerWorld): void {
    const it = this.intent;
    if (this.throwPending) return;
    if (it.attack) { this.consume('attack'); startPropThrow(this, it); return; }
    if (it.x || it.y) {
      const speed = this.walkSpeed * THROW.holdWalk;
      this.x += it.x * speed;
      const zb = world.zBounds(this);
      this.z = clamp(this.z + it.y * speed * Z_SPEED_FACTOR, zb.z0, zb.z1);
      if (it.x) this.facing = it.x;
      if (this.anim.name !== 'walk') this.play('walk', { restart: false });
    } else if (this.anim.name !== 'idle') this.play('idle', { restart: false });
    updateHeldProp(this);
  }
  thinkDodge(world: PlayerWorld): void {
    const tr = this.traits;
    if (this.airDash) {
      if (this.stateTimer <= AIR_DASH_FRAMES) this.x += this.dodgeDx;
      else { this.airDash = false; this.setState(ST.JUMP, 'fall', { fallback: 'jump' }); }
      return;
    }
    if (this.stateTimer <= DODGE_FRAMES) { this.x += this.dodgeDx; const zb = world.zBounds(this); this.z = clamp(this.z + this.dodgeDz, zb.z0, zb.z1); }
    // i-frames start..end (GDD 7 2..12): invuln is decremented at the top of each update, so this covers exactly those frames
    const [i0, i1] = tr.dodgeIFrames;
    if (this.stateTimer === i0) this.invuln = Math.max(this.invuln, i1 - i0 + 1);
    // recovery: the roll is 20f; the fighter is actionable again `dodgeRecovery` frames later (8 default, Sael 5)
    if (this.stateTimer >= DODGE_FRAMES + tr.dodgeRecovery && !this.airborne) this.setState(ST.IDLE, 'idle');
  }
  /** Held by an enemy: mashing attack 6 times breaks free (GDD 4 / 7). */
  thinkGrabbed(): void {
    const it = this.intent, h = this.grabbedBy;
    if (!it.attack || !h) return;
    this.consume('attack');
    if (++this.mashCount < GRAB_MASH_OUT) return;
    this.mashCount = 0;
    h.releaseGrab(false);
    this.invuln = Math.max(this.invuln, MASH_OUT_INVULN);
    this.vx = -h.facing * 4;
    this.setState(ST.IDLE, 'idle');
    floatText(this.x, this.y + this.h + 10, this.z, 'BREAK!', UI.brassLight, 1);
    audio.play('hit_grab');
  }
  thinkSuper(): void {
    const b = this.heldBody, pr = this.heldProj;
    if (b && b.grabbedBy === this) { b.x = this.x + this.facing * 34; b.z = this.z; b.y = 30; b.facing = -this.facing; }
    if (pr && !pr.removeMe) { pr.x = this.x + this.facing * 34; pr.z = this.z; pr.y = 30; pr.life = 600; }
  }

  // ---------- actions ----------
  startAttack(step: number): void {
    this.comboStep = step; this.hitConfirmed = false; this.running = false;
    this.setState(ST.ATTACK, 'attack' + step, { fallback: 'attack1' });
  }
  startDashAttack(): void { this.running = false; this.hitConfirmed = false; this.comboStep = 0; this.setState(ST.DASH_ATTACK, 'dashAttack'); }
  jump(): void {
    this.vy = this.jumpVy; this.y = 0.01; this.airActed = false; this.airShotUsed = false;
    this.jumpsLeft = this.traits.extraJumps; this.airDashesLeft = this.traits.airDashes;
    this.setState(ST.JUMP, 'jump'); audio.play('jump');
  }
  jumpAttack(): void {
    this.airActed = true; this.hitConfirmed = false;
    this.landAttackPending = this.anim.has('landAttack');
    this.setState(ST.JUMP_ATTACK, 'jumpAttack');
  }
  /** traits.airDashes: a horizontal dash in the air with the dodge's i-frames (Sael, GDD 2.2). */
  startAirDash(): void {
    this.airDashesLeft--;
    const dir = this.intent.x || this.facing;
    this.facing = dir; this.dodgeDx = dir * AIR_DASH_DIST / AIR_DASH_FRAMES; this.dodgeDz = 0;
    this.airDash = true; this.noGravity = AIR_DASH_FRAMES; this.vy = 0; this.dodgeThrough = false;
    this.setState(ST.DODGE, 'airDash', { fallback: 'dodge' });
    this.invuln = Math.max(this.invuln, this.traits.dodgeIFrames[1] - 2);
    if (this.world) this.world.addFx('steam', this.x - dir * 10, this.y + 20, this.z, { count: 4 });
    audio.play('dodge');
    if (this.world) this.world.logEvent('airDash', this, null, { anim: 'airDash' });
  }
  /** Pay for a special: one meter bar, else 8% max HP above 15% HP (GDD 7). Returns false (and whiffs) when unaffordable. */
  paySpecial(): boolean {
    if (this.meter >= METER.special) { this.meter -= METER.special; return true; }
    if (this.hp > this.maxHp * METER.hpCostMinFrac) { if (!this.godmode) this.hp = Math.max(1, this.hp - Math.round(this.maxHp * METER.hpCostFrac)); floatText(this.x, this.y + this.h + 10, this.z, 'HP!', UI.red, 1); return true; }
    audio.play('whiff'); return false;
  }
  trySpecial(world: PlayerWorld): void {
    if (!this.anim.has('special')) return;
    if (!this.paySpecial()) return;
    this.running = false; this.hitConfirmed = false;
    this.setState(ST.SPECIAL, 'special');
    audio.play(this.def.sfx && this.def.sfx.special || 'special_' + this.def.id);
  }
  /** Super presentation: 12f screen freeze + portrait cut-in (`game.cutIn(playerIndex, player)` when the shell provides it), shake, sfx. */
  beginSuper(world: PlayerWorld, name: string | null = null): void {
    world.freezeFrames(12, this);
    world.addFx('flash', this.x, 0, this.z, { color: '#ffffff' });
    const g = world.game, superName = name || (this.def.moves && this.def.moves.super && this.def.moves.super.name) || 'SUPER';
    if (g && typeof g.cutIn === 'function') g.cutIn(this.index, this, superName);
    else if (world.announce) world.announce(superName, this.def.fullName ? this.def.fullName.toUpperCase() : this.def.name, 50);
    if (world.camera) world.camera.shake(6, 20);
    audio.play('super_charge'); audio.play(this.def.sfx && this.def.sfx.super || 'super_' + this.def.id);
  }
  startSuper(world: PlayerWorld): void {
    this.meter = 0; this.running = false; this.hitConfirmed = false; this.blinkHit.clear(); this.heldBody = null; this.heldProj = null; this.heldProp = null;
    this.setState(ST.SUPER, 'super');
    this.invuln = Math.max(this.invuln, this.anim.length + 4);
    this.beginSuper(world);
  }
  startDodge(): void {
    const it = this.intent;
    this.running = false; this.airDash = false; this.dodgeThrough = false;
    if (it.y) { this.dodgeDz = it.y * (DODGE_DIST * Z_SPEED_FACTOR) / DODGE_FRAMES; this.dodgeDx = 0; }
    else { const dir = it.x || this.facing; this.dodgeDx = dir * DODGE_DIST / DODGE_FRAMES; this.dodgeDz = 0; if (it.x) this.facing = it.x; }
    this.dodgeCooldown = DODGE_COOLDOWN + DODGE_FRAMES;
    this.setState(ST.DODGE, 'dodge');
  }
  /** Nearest enemy inside grab reach in front of the player that is idle (not in hitstun, not armored). */
  findGrabTarget(world: PlayerWorld): Fighter | null {
    let best = null, bestD = Infinity;
    for (const e of world.enemies) {
      if (!e.grabbableBy || !e.grabbableBy(this)) continue;
      const dx = (e.x - this.x) * this.facing, dz = Math.abs(e.z - this.z);
      if (dx < -GRAB_REACH_BEHIND || dx > this.grabReach + GRAB_REACH_AHEAD_EXTRA || dz > GRAB_Z_TOL) continue;
      if (dx < bestD) { bestD = dx; best = e; }
    }
    return best;
  }

  // ---------- hooks ----------
  override onActionDone(world: PlayerWorld): void {
    if (this.state === ST.SUPER && (this.heldBody || this.heldProj)) { this.releaseHeld(world, 40); }
    if (this.state === ST.DODGE) this.airDash = false;
    this.comboStep = 0;
    super.onActionDone(world);
  }
  /** Tech roll (GDD 7): Jump within 6f of landing from a knockdown rolls 60px and stands instantly. */
  override onLand(world: PlayerWorld): void {
    const s = this.state;
    const wantsTech = this.bot ? this.intent.jump : this.input.buffered(this.index, 'jump', TECH_WINDOW);
    if (AIR_FALL_STATES.has(s) && s !== ST.THROWN && !this.dead && !this.out && wantsTech) {
      if (!this.bot) this.input.consume(this.index, 'jump');
      this.juggleCount = 0; this.juggleGravity = 0; this.juggleImmune = false; this.thrownBy = null;
      const dir = sign(this.vx) || -this.facing;
      this.vx = 0; this.dodgeDx = dir * DODGE_DIST / DODGE_FRAMES; this.dodgeDz = 0; this.airDash = false;
      this.setState(ST.DODGE, 'dodge');
      this.invuln = Math.max(this.invuln, TECH_INVULN); this.dodgeCooldown = DODGE_COOLDOWN + DODGE_FRAMES;
      floatText(this.x, this.y + this.h + 10, this.z, 'TECH', UI.meter, 1);
      world.addFx('dust', this.x, 0, this.z, { count: 6 }); audio.play('dodge');
      this.callHook('onLanded', world, s);
      return;
    }
    super.onLand(world);
  }
  override onAnimEvent(name: string, frame: PlayerFrame | null, world: PlayerWorld): void {
    switch (name) {
      case 'blink': this.teleportTo({ behind: false, unique: true, range: (frame && frame.radius) || 400, offset: 26, color: '#8FE3FF', sfx: false }, world); break;
      case 'wreckGrab': {
        // Wrecking Ball (GDD 2.4): grab the nearest enemy, else (frame.rubble !== false) swing a rubble ball projectile instead
        const e = world.nearestEnemy(this.x, this.z, { maxDist: (frame && frame.radius) || 80 });
        if (e && !e.dead && e.traits.grabbable !== false) { this.heldBody = e; this.grabTarget = e; e.grabbedBy = this; e.vx = e.vy = e.vz = 0; e.setState(ST.GRABBED, 'hurtAir'); e.anim.setStaticPose(e.anim.pose); }
        else if (!frame || frame.rubble !== false) {
          this.heldProj = world.spawnProjectile({ style: 'rubble', speed: 0, life: 600, noContactHit: true, r: 10, color: '#6a6a70', muzzle: false, offsetX: 34, offsetY: 30 }, this);
          world.addFx('dust', this.x + this.facing * 34, 0, this.z, { count: 6 });
        }
        break;
      }
      case 'wreckThrow': this.releaseHeld(world, (frame && frame.damage) || 40, (frame && frame.vx) || 16, frame); break;
      case 'dive': if (frame) { this.vy = frame.vy != null ? frame.vy : -3; } break;
      default: super.onAnimEvent(name, frame, world); break;
    }
  }
  releaseHeld(world: PlayerWorld, damage: number, vx: number = 14, frame: PlayerFrame | null = null): void {
    const b = this.heldBody, pr = this.heldProj; this.heldBody = null; this.grabTarget = null; this.heldProj = null; this.heldProp = null;
    if (pr && !pr.removeMe) { // hurl the rubble ball: a knockdown projectile that flies `maxDist` (300px) and hits everything on the way
      pr.vx = this.facing * vx; pr.vy = 2; pr.gravity = 0.25; pr.facing = this.facing; pr.startX = pr.x; pr.maxDist = (frame && frame.maxDist) || 300; pr.life = 90; pr.pierce = 99;
      pr.hit = { damage, type: 'knockdown', kbX: 6, kbY: 5, hitstun: 24, projectile: true, ranged: true };
      audio.play('throw');
    }
    if (!b || b.grabbedBy !== this) return;
    b.thrown(this.facing * vx, 6, damage, this);
    this.onHitConfirmed(b, { type: 'throw', damage });
    audio.play('throw');
  }
  /** hitbox.onHit names: 'rebound' (Sael dive kick: bounce up and act again). Other names reach def.hooks.onHitDealt via hit.onHit. */
  onHitEffect(name: string, target: Fighter, hit: Hitbox): void {
    if (name === 'rebound') { this.vy = 5; this.airActed = false; this.airShotUsed = false; this.setState(ST.JUMP, 'fall', { fallback: 'jump' }); }
  }
  override onHitConfirmed(target: Fighter, hit: Hit): void {
    if (target.kind === 'prop') { this.hitConfirmed = true; return; }
    if (this.weaponId && hit.weapon) this.spendWeapon();
    this.lastTarget = target;
    const type = hit.type || 'light';
    this.addMeter(type === 'light' || type === 'medium' ? METER.light : METER.heavy);
    this.combo += target.airborne ? AIR_HIT_COMBO : 1;
    this.comboTimer = FIGHTER_DEFAULTS.comboTimer;
    this.comboScale = 1.3;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    // crowd clear (GDD 7): 3+ enemies in one hit -> kills from it score x2. Counted per DISTINCT body: a
    // multi-hit move confirms several hits inside ONE attack instance, and one enemy hit six times by
    // Sael's Tempest Waltz is not a crowd.
    if (this.crowdInst !== this.anim.instance) { this.crowdInst = this.anim.instance; this.crowdHits = 0; this.crowdSeen.clear(); }
    if (!this.crowdSeen.has(target.id)) {
      this.crowdSeen.add(target.id);
      if (++this.crowdHits === CROWD_CLEAR_HITS && this.world) { this.crowdClearUntil = this.world.frame + CROWD_CLEAR_FRAMES; floatText(this.x, this.y + this.h + 24, this.z, 'CROWD CLEAR!', UI.brassLight, 2); }
    }
    super.onHitConfirmed(target, hit);
  }
  override onDodged(attacker: Fighter): void { this.addMeter(DODGE_METER); this.dodgeThrough = true; floatText(this.x, this.y + this.h + 10, this.z, 'DODGE', UI.meter, 1); if (this.world) this.world.logEvent('dodge', this, attacker, {}); }
  override onHurt(hit: Hit, attacker: Fighter | null): void {
    this.throwPending = null; // a hit mid-windup cancels a pending weapon/prop throw (issue #21)
    dropHeldProp(this); // a hit mid-hold drops a held prop where it was being carried (GDD 7 decision 14)
    this.damageTakenTotal += this.lastDamage != null ? this.lastDamage : (hit.damage || 0);
    if (this.combo > 0) this.dropCombo();
    this.addMeter(METER.damaged);
  }
  override onKill(target: Fighter): void {
    this.kills++;
    const base = (target.def && target.def.score) || 100;
    // GDD 7: throw kill x1.5 -- the thrown body itself (thrownBy) OR anyone killed by a thrown body / weapon's
    // last hit (lastHitWasThrow, fighter.js takeHit/takeHitRaw; issue #21 decision 8).
    let n = (target.thrownBy === this || target.lastHitWasThrow) ? Math.round(base * 1.5) : base;
    if (this.world && this.world.frame <= this.crowdClearUntil) n *= 2;
    this.addScore(n, true);
    this.addMeter(12);
    super.onKill(target);
  }
  /** Score multiplier from the current combo (GDD 7): 1 + combo/20, capped at 3. */
  get scoreMult(): number { return Math.min(3, 1 + this.combo / 20); }
  addScore(n: number, applyMult: boolean = true): void { this.score += Math.round(n * (applyMult ? this.scoreMult : 1)); }
  override addMeter(n: number): void {
    const was = this.meter;
    this.meter = clamp(this.meter + n, 0, METER.max);
    if (was < METER.max && this.meter >= METER.max) audio.play('meter_full');
  }
  dropCombo(): void {
    this.grade = comboGrade(this.combo);
    this.gradeTimer = this.grade ? 90 : 0;
    this.combo = 0; this.comboTimer = 0;
  }

  // ---------- state overrides ----------
  override updateState(world: PlayerWorld): void {
    if (this.combo > 0 && --this.comboTimer <= 0) this.dropCombo();
    if (this.gradeTimer > 0) this.gradeTimer--;
    this.comboScale += (1 - this.comboScale) * 0.25;
    if (this.state === ST.DEAD) {
      if (this.deadTimer > 0) this.deadTimer--;
      if (this.stateTimer >= FIGHTER_DEFAULTS.respawnDelay) { if (this.lives > 0) this.respawn(world); else { this.out = true; this.removeMe = true; this.alive = false; } }
      return;
    }
    // taunt meter trickles in over the animation (GDD 7: +20 over 60f) unless the taunt anim grants it with a meterGain event
    if (this.state === ST.TAUNT && this.anim.name === 'taunt' && !this.tauntHasEvent && this.anim.length > 0) {
      this.tauntAcc += (this.traits.tauntMeter || METER.taunt) / this.anim.length;
      if (this.tauntAcc >= 1) { const n = Math.floor(this.tauntAcc); this.tauntAcc -= n; this.addMeter(n); }
    }
    super.updateState(world);
  }
  /** Respawn from the top of the screen with i-frames. */
  respawn(world: PlayerWorld): void {
    this.lives--;
    this.resetBody(); // a new life drops in whole, with a full shield
    const cam = world.camera;
    this.x = clamp(cam.x + VIEW_W / 2, cam.left + 20, cam.right - 20); this.z = 70; this.y = 160; this.vy = 0; this.vx = 0; this.facing = 1;
    this.invuln = FIGHTER_DEFAULTS.respawnInvuln;
    this.setState(ST.JUMP, 'fall', { fallback: 'jump' });
    if (!world.entities.includes(this)) world.add(this);
  }
  /** Debug helper: turn toward and step toward the nearest enemy. */
  faceNearestEnemy(world: PlayerWorld): void {
    const e = world.nearestEnemy(this.x, this.z);
    if (!e) return;
    this.facing = sign(e.x - this.x) || this.facing;
    if (this.actionable) {
      const reach = (this.def.reach || 40) - 8, gap = Math.abs(e.x - this.x) - (e.w || 28) / 2;
      if (gap > reach) this.x += this.facing * Math.min(40, gap - reach); // big steps: kiting ranged enemies must not outrun the hook
      this.z += clamp(e.z - this.z, -8, 8);
    }
  }

  // ---------- pickup weapons (issue #20, GDD 7) ----------
  /** Wield a picked-up weapon: swap the held rig, swap the ground combo, restart comboLength. False if already armed. */
  // `pickup`: a WeaponPickup (game/items.ts). `any` rather than the class, whose fields that file owns and has
  // not declared yet — naming it here would check these two reads against a shape it does not carry.
  pickUpWeapon(pickup: any): boolean {
    const w = WEAPONS[pickup.weaponId];
    if (!w || this.weaponId) return false;
    this.weaponId = w.id;
    this.weaponHits = pickup.weaponHits;
    this.anim.setOverlay(w.anims);
    this.rig.weapon = w.rig;
    this.comboLength = w.swings.length;
    floatText(this.x, this.y + this.h + 10, this.z, w.name, UI.brassLight, 1);
    audio.play('pickup_score');
    return true;
  }
  /** Drop the overlay / rig swap and go back to the hero's own weapon (or bare hands). */
  override clearWeapon(): void {
    if (!this.weaponId) return;
    this.weaponId = ''; this.weaponHits = 0;
    this.anim.setOverlay(null);
    this.rig.weapon = this.rig.build.weapon || null;
    this.comboLength = this.baseComboLength;
  }
  /** Section entry (GDD 7): the weapon is not carried into the next section, with feedback (no pickup left behind). */
  discardWeapon(): void {
    if (!this.weaponId) return;
    floatText(this.x, this.y + this.h + 10, this.z, 'LEFT BEHIND', UI.paper, 1);
    if (this.world) this.world.addFx('dust', this.x, 0, this.z, { count: 4 });
    this.clearWeapon();
  }
  /** Knockdown / throw (GDD 7): the weapon falls to the floor as a WeaponPickup, free after a short grace. */
  dropWeapon(): void {
    if (!this.weaponId || !this.world) return;
    const wp = new WeaponPickup(this.weaponId, this.x, this.z, { hits: this.weaponHits, grace: WEAPON_DROP_GRACE });
    wp.vx = -this.facing * WEAPON_DROP_VX;
    this.world.add(wp);
    this.clearWeapon();
  }
  /** The weapon shatters: burst debris, a heavy spark and BROKEN! (plays prop_break; `break` is only a legacy alias
   *  of the same definition, sfx.js). Clearing here restores comboLength while the last swing's anim finishes; a
   *  buffered chain then plays the hero's own attackN — harmless. */
  breakWeapon(): void {
    const w = WEAPONS[this.weaponId];
    if (!w) return;
    const hx = this.x + this.facing * 20, hy = this.y + this.h * 0.6;
    burstBreak(hx, hy, this.z, w.color, 8);
    if (this.world) this.world.addFx('spark', hx, hy, this.z, { type: 'heavy' });
    floatText(this.x, this.y + this.h + 10, this.z, 'BROKEN!', UI.red, 1);
    audio.play('prop_break');
    this.clearWeapon();
  }
  /** Spend one point of durability on a connecting weapon swing; breaks the weapon at 0. */
  spendWeapon(): void { if (--this.weaponHits <= 0) this.breakWeapon(); }
  /** Drop the held weapon before going down (fighter.js:529); every hit/launch/juggle reaches this through knockDown. */
  override knockDown(vy: number, vx: number, animName: string = 'knockdown'): void { this.dropWeapon(); super.knockDown(vy, vx, animName); }
  /** Drop the held weapon before becoming a thrown body (grabs.js:103, installed on Fighter.prototype). */
  override thrown(vx: number, vy: number, damage: number, thrower: Fighter): void { this.dropWeapon(); super.thrown(vx, vy, damage, thrower); }
}
