// Boss: Enemy + hp-threshold phase machine, intro / phase-change / defeat animations, HUD boss bar data, no attack tokens
// (ARCHITECTURE.md section 5/8, GDD section 5). `def.phases[]` entries override the base def per phase:
//  { name, hp, color, armor, unlaunchable, grabbable, walkSpeed, damageMult, build, anims, ai, traits, hooks, overheat, hurtboxScale, phaseIndex,
//    hurtParts [{ name, y: [y0, y1], x, damageMult, flag }]      hittable sub-parts (legs only / core window / cabin 1.5x)
//    vent { everyHp: 150, frames: 120, flag: 'coreOpen', damageMult: 1, grabbable: false, stall: true }   punishable window every N hp lost
//    summonAt [0.66, 0.33] + summon [{ type, variant }] (or a 'summonEscort' attack anim)   escorts at hp fractions
//    bandShrink 20        shrink the floor band by px on each edge when the phase starts (GDD 5.2 dais)
//    cutIn { frames, draw(ctx, boss, world, t) }   cutscene shown when the phase begins (world.cutscene / game.cutscene)
//    ai.valveStun, ai.stunDamageMult, ai.stunGrabbable   pressure valves (world.stunBoss)
//    ai.blinkOnDamage 60 + blinkAnim 'aetherStep' + blinkChain 'caneFlurry'   teleport away after N damage in one combo (Vane phase 3) }
//  def.introCutscene { frames, draw(ctx, boss, world, t) } plays on the boss' first update.
import { ST, UI } from '../constants.ts';
import { Enemy, normalizeAi } from './enemy.ts';
import { buildRig } from '../lib/art/rig.ts';
import { AnimPlayer } from '../lib/art/animation.ts';
import { audio } from '../engine/audio.ts';
import { particles } from '../engine/particles.ts';
import { floatText } from '../art/fx.ts';
import type { EnemyWorld, SummonSpec } from './enemy.ts';
import type { Fighter, FighterDef } from './fighter.ts';
import type { Aabb, Entity } from './entity.ts';

// ================================ DECLARED SHAPES ===================================================================
// The header block above, as types: one `def.phases[]` entry, the boss def that carries the list, and the world
// services the phase machine reaches for. Shapes that already exist elsewhere are used BY NAME rather than described
// a second time — Hit / HitType / BossLines from types/content.d.ts, Fighter / FighterDef from game/fighter.ts,
// EnemyWorld / SummonSpec from game/enemy.ts, Aabb / Entity from game/entity.ts, Rig from lib/art/rig.ts.

/**
 * The rig fields the phase machine drives, merged into the vendored library's `Rig` the same way game/enemy.ts
 * merges the AI's (lib/art/rig.ts declares no index signature on purpose, and asks a consumer to add its own fields
 * by declaration merging). All optional: only a boss rig carries them, and only a boss's part hooks read them.
 */
declare module '../lib/art/rig.ts' {
  interface Rig {
    /**
     * Which phase's body this is — the phase's own `phaseIndex` when it sets one, its index in `def.phases`
     * otherwise. Part hooks draw off it: the sheared leg and the bolt vents flanking the core are phase 2's
     * (content/enemies/boss.ts).
     */
    phaseIndex?: number;
    /** This phase runs hot: the plating glows and the vents blow harder (content/enemies/midboss.ts). */
    overheat?: boolean;
    /** Gear-saw angle, advanced every step here and again by the saw's own spin-up (content/enemies/boss.ts). */
    sawAngle?: number;
  }
}

/**
 * A punishable window that opens every `everyHp` damage taken (GDD 5.2): the machine stalls, its core is exposed
 * and the damage multiplier applies until `frames` are up. `flag` is raised on both `f.flags` and the rig, which is
 * what the cover / vent part hooks draw off.
 */
export interface BossVent {
  /** HP lost between windows; absent = the phase never vents on damage. */
  everyHp?: number;
  /** How long the window stays open (default 120). */
  frames?: number;
  /** Flag raised on `f.flags` and the rig while it is open ('coreOpen', 'venting'). */
  flag?: string;
  /** Damage multiplier while it is open (default 1). */
  damageMult?: number;
  /** Grabbable while it is open (default false). */
  grabbable?: boolean;
  /** Cancel an attack in progress when the window opens (default true; `false` lets the swing finish). */
  stall?: boolean;
  /** The float text raised over the body ('CORE EXPOSED!' when absent). */
  text?: string;
}

/** What a boss cutscene draws over the frozen scene; `t` runs 0..1 across its length (game/world.ts CutsceneDraw). */
export type BossCutsceneDraw = (ctx: CanvasRenderingContext2D, world: BossWorld, t: number) => void;

/**
 * A cutscene a phase (`phase.cutIn`) or the boss' arrival (`def.introCutscene`) plays. Authored with the boss as its
 * second argument rather than the world's `t`-only signature, because what it draws is this body: the wrappers below
 * are what close over `this` and hand `world.cutscene` the shape it takes.
 */
export interface BossCutscene {
  /** How long the scene is held for (default 120). */
  frames?: number;
  /** Absent / null freezes the scene with nothing drawn over it. */
  draw?: ((ctx: CanvasRenderingContext2D, boss: Boss, world: BossWorld, t: number) => void) | null;
}

/**
 * One `def.phases[]` entry: a per-phase override of the base def (mergePhase replaces every non-`ai` key of it),
 * plus the phase machine's own vocabulary. It extends `FighterDef` because that is what it becomes — `build`,
 * `anims`, `traits`, `hooks`, `hurtParts`, `walkSpeed`, `damageMult` and the legacy `armor` / `unlaunchable` /
 * `grabbable` flags all mean on a phase exactly what they mean on a def, and are declared there.
 */
export interface BossPhase extends FighterDef {
  /**
   * The phase's HP, which is also its share of the HUD bar. Required, unlike `FighterDef.hp`: `mergePhase` writes it
   * to both `hp` and `maxHp` unconditionally and `phaseHps` is summed from it, so a phase without one has no bar.
   */
  hp: number;
  /** The HUD bar's colour for this phase ('#e8402c' when absent). */
  color?: string;
  /** `rig.phaseIndex` for this phase; its index in `def.phases` when absent. */
  phaseIndex?: number;
  /** `rig.overheat`: the phase runs hot. */
  overheat?: boolean;
  /** Shrink the hurtbox height to this fraction for the whole phase, 0..1 (the Regent Engine's body is 0.7). */
  hurtboxScale?: number;
  /** The punishable vent window, or absent on a phase that never opens one. */
  vent?: BossVent;
  /** HP fractions at which escorts arrive, e.g. [0.66, 0.33]. Each fires once. */
  summonAt?: number[];
  /** What those escorts are; `def.summon` when the phase names none. */
  summon?: SummonSpec[];
  /** Shrink the floor band by this many px on each edge when the phase starts (GDD 5.2 dais). */
  bandShrink?: number;
  /** Cutscene shown when the phase begins. */
  cutIn?: BossCutscene;
}

/**
 * A boss content definition (content/enemies/midboss.ts, boss.ts ...): a fighter def plus the phase list. A def with
 * no `phases` still works — the constructor synthesises a single one from `name` / `hp` — which is why it is optional.
 */
export interface BossDef extends FighterDef {
  phases?: BossPhase[];
  /** Which trigger spawns it; 'boss' when absent. The board's own boss is the only one a pressure valve spends on. */
  bossKind?: 'midboss' | 'boss';
  /** Escorts for a phase that names none of its own. */
  summon?: SummonSpec[];
  /** Played on this body's first update, before anything else happens. */
  introCutscene?: BossCutscene;
  /**
   * The boss' own call-outs (issue #25), attached by content/enemies/index.ts from content/characters/lines.ts.
   * Read at runtime from `baseDef`, never `def`: `mergePhase` replaces every non-`ai` key of the def on a phase
   * change, so a lookup through `def` finds nothing from phase 2 onward.
   */
  lines?: BossLines;
}

/** Where a Boss wakes up. It takes no `mods` and no `entrance`: a boss spawns into its own intro, already inside. */
export interface BossOpts {
  x?: number;
  z?: number;
  facing?: number;
}

/**
 * The part of game/world.ts's `World` the phase machine reaches for, on top of what the AI framework already asks of
 * it. Structural for the reason given in game/entity.ts: world.ts depends on this file's base classes, so the
 * dependency must not run back the other way. `World` satisfies it — the four optional members are the ones
 * game/stage.ts installs on the world from outside, which is why each is tested for before it is called.
 */
export interface BossWorld extends EnemyWorld {
  /** Shrink the floor band by `px` on each edge (a phase's `bandShrink`); `resetBand` puts it back on defeat. */
  shrinkBand(px: number): void;
  resetBand(): void;
  /** Freeze every entity for `frames` and draw `drawFn` over the frozen scene (an intro or a phase cut-in). */
  cutscene(frames: number, drawFn?: BossCutsceneDraw | null): void;
  /** The HUD name plate (game/stage.ts installs it; a bare world has none). */
  announce?(text: string, sub?: string, life?: number): void;
  /** This body has arrived: the plate, the music and the camera lock (game/stage.ts). */
  onBossSpawn?(b: Boss): void;
  /** A phase has been REACHED: the bestiary reveals that phase's codex block (screens/gameplay.ts). */
  onBossPhase?(b: Boss, phase: number): void;
  /** Speak one of `baseDef.lines` over the body; false when there is nothing written (game/stage.ts). */
  bossLine?(b: Boss, key: 'phase' | 'defeat', phase?: number): boolean;
}

const DEFEAT_BLINK = 90;
const COMBO_WINDOW = 60;

/** Merge a phase override into the base def (ai tables merge, everything else replaces). */
function mergePhase(def: BossDef, phase: BossPhase): FighterDef {
  const { ai, build, anims, ...rest } = phase;
  return { ...def, ...rest, build: build || def.build, anims: anims || def.anims, ai: { ...(def.ai || {}), ...(ai || {}) }, hp: phase.hp, maxHp: phase.hp };
}

/** Multi-phase boss. Spawns into its intro animation and announces itself through `world.onBossSpawn`. */
export class Boss extends Enemy {
  // The fields, for the checker only, in constructor order (`applyPhase` runs from the constructor, so its own are
  // here too). `declare` because these are the constructor's own assignments and nothing else: a plain field
  // declaration would emit a class field per name (es2022 defines them before the constructor body runs), which is a
  // runtime change — and this class in particular calls `applyPhase` from inside the constructor, so a field
  // initialiser would run AFTER it and wipe what it wrote. `declare` erases under tsc, esbuild and
  // node --experimental-strip-types alike. Same reasoning (and wording) as game/enemy.ts and game/fighter.ts.

  /** Narrower than Enemy's: the phase machine reaches the band, the cutscenes and the plate through it. */
  declare world: BossWorld | null;

  /**
   * The def as authored, BEFORE any phase override was merged over it. Every read of a def field that must survive a
   * phase change goes through this and not `def`: `mergePhase` replaces every non-`ai` key, so `def.lines` and
   * `def.summon` are whatever phase 2's override happened to carry, which is nothing.
   */
  declare baseDef: BossDef;
  declare phaseDefs: BossPhase[];
  /** Which trigger spawned this body. Only the board's own boss ('boss') is what a pressure valve is spent on. */
  declare bossKind: 'midboss' | 'boss';
  /** Number of phases (HUD segments). */
  declare phases: number;
  /** 0-based index of the phase being fought; `phase` is the 1-based number the HUD prints. */
  declare phaseIndex: number;
  /** Each phase's HP, in order: the HUD steps the segment ticks back from the bar's right end through it. */
  declare phaseHps: number[];
  /** Total HP across every phase, for the bar's full width. */
  declare hpTotalMax: number;
  /** Frames of intro / phase-change the body is locked and invulnerable for; nothing acts while it runs. */
  declare transition: number;
  /** The last phase is down: the body is still on screen, playing its defeat out. */
  declare defeated: boolean;
  /** `world.onBossSpawn` has fired (first update, not the constructor). */
  declare announced: boolean;
  /** Damage taken inside one combo, and the frames left before it lapses (ai.blinkOnDamage). */
  declare comboDamage: number;
  declare comboDamageTimer: number;
  /** Frames left in the open vent window, and how many have opened this phase (BossVent.everyHp). */
  declare ventTimer: number;
  declare ventCount: number;
  /** Which `phase.summonAt` thresholds have already sent escorts, by index. */
  declare summonFired: Set<number>;
  /** A phase's `bandShrink` that arrived before there was a world to shrink; spent on the first update. */
  declare pendingShrink: number;
  /** The phase's hurtbox height as a fraction, 1 = the whole body (`phase.hurtboxScale`). */
  declare hurtboxScale: number;

  /**
   * @param {object} def boss definition (content/enemies/midboss.js, boss.js)
   * @param {{ x?: number, z?: number, facing?: number }} o
   */
  constructor(def: BossDef, o: BossOpts = {}) {
    const phases = def.phases && def.phases.length ? def.phases : [{ name: def.name, hp: def.hp || 500, color: '#e8402c' }];
    super(mergePhase(def, phases[0]), { ...o, kind: 'boss', entered: true });
    this.baseDef = def;
    this.name = def.name || this.name; // the plate keeps the boss name; phases show as phaseName
    this.phaseDefs = phases;
    this.bossKind = def.bossKind || 'boss';
    /** Number of phases (HUD segments). */
    this.phases = phases.length;
    this.phaseIndex = 0;
    this.phaseHps = phases.map((p) => p.hp);
    this.hpTotalMax = this.phaseHps.reduce((a, b) => a + b, 0);
    this.transition = 0; this.defeated = false; this.announced = false;
    this.comboDamage = 0; this.comboDamageTimer = 0;
    this.ventTimer = 0; this.ventCount = 0; this.summonFired = new Set(); this.pendingShrink = 0;
    this.applyPhase(0, true);
    if (this.anim.has('intro')) { this.setState(ST.SPECIAL, 'intro'); this.invuln = this.anim.length + 4; this.transition = this.anim.length; }
  }
  /** 1-based phase number (summary / HUD). */
  get phase(): number { return this.phaseIndex + 1; }
  /** Remaining hp across all phases (monotonic; used by the HUD bar and summary()). */
  get hpTotal(): number { let s = Math.max(0, this.hp); for (let i = this.phaseIndex + 1; i < this.phases; i++) s += this.phaseHps[i]; return s; }
  get phaseColor(): string { return this.phaseDefs[this.phaseIndex].color || '#e8402c'; }
  get phaseName(): string { return this.phaseDefs[this.phaseIndex].name || this.name; }
  get phaseDef(): BossPhase { return this.phaseDefs[this.phaseIndex]; }

  /** Switch to phase i: merged def, rig / anims swap, hp, AI table, traits, sub-parts, band shrink. */
  applyPhase(i: number, first: boolean = false): void {
    const pd = this.phaseDefs[i];
    this.phaseIndex = i;
    this.applyDef(mergePhase(this.baseDef, pd));
    if (!first) {
      if (pd.build) {
        this.rig = buildRig(pd.build);
        const sc = this.rig.scale;
        this.w = Math.round(28 * sc); this.h = Math.round((this.rig.height || 72) * sc); this.shadowW = Math.round(34 * sc);
      }
      if (pd.anims) this.anim = new AnimPlayer(pd.anims);
    }
    this.maxHp = pd.hp; this.hp = pd.hp;
    this.ai = normalizeAi(this.def); this.applyAiTraits();
    this.walkSpeed = this.def.walkSpeed || 1.2; this.runSpeed = this.walkSpeed * 1.5;
    this.armor = this.traits.superArmor; this.unlaunchable = this.traits.noLaunch; this.armorSuppressed = false;
    this.hurtboxScale = pd.hurtboxScale || 1;
    this.rig.phaseIndex = pd.phaseIndex != null ? pd.phaseIndex : i; this.rig.overheat = !!pd.overheat; this.rig.keyAngle = 0; this.rig.tell = false;
    this.attackUses.clear(); this.attackCount = 0; this.attackCooldown = this.ai.firstAttackDelay;
    this.pendingAttack = null; this.currentAttack = null; this.aiState = 'APPROACH'; this.staggerTimer = 0; this.stalled = false;
    this.punishable = false; this.punishMult = 1; this.punishGrab = false; this.status = {};
    this.ventTimer = 0; this.ventCount = 0; this.summonFired.clear();
    if (pd.vent && pd.vent.flag) { this.flags[pd.vent.flag] = false; this.rig[pd.vent.flag] = false; }
    if (pd.bandShrink) { if (this.world) this.world.shrinkBand(pd.bandShrink); else this.pendingShrink = pd.bandShrink; }
  }

  // ---------- per-step ----------
  override update(world: BossWorld): void {
    if (!this.announced) {
      this.announced = true;
      if (world.onBossSpawn) world.onBossSpawn(this);
      const ic = this.baseDef.introCutscene;
      if (ic) world.cutscene(ic.frames || 120, ic.draw ? (ctx, w, t) => ic.draw(ctx, this, w, t) : null);
      if (this.pendingShrink) { world.shrinkBand(this.pendingShrink); this.pendingShrink = 0; }
    }
    if (this.transition > 0) { this.transition--; this.y = 0; this.vy = 0; this.vx = 0; }
    if (this.comboDamageTimer > 0 && --this.comboDamageTimer === 0) this.comboDamage = 0;
    if (this.ventTimer > 0 && --this.ventTimer === 0) this.closeVent();
    if (this.defeated && this.state !== ST.DEAD) {
      this.y = 0; this.vy = 0; this.vx = 0; this.vz = 0;
      if (this.anim.name !== 'defeat' && this.anim.has('defeat')) this.setState(ST.SPECIAL, 'defeat');
      else if (!this.anim.has('defeat') && this.state !== ST.SPECIAL) this.setState(ST.SPECIAL, 'hurt');
      if (world.frame % 8 === 0) {
        particles.burst('ember', this.x + (world.frame % 3 - 1) * 20, this.h * 0.5, this.z, 6, { speed: 3, up: 3 });
        particles.burst('smoke', this.x, this.h * 0.6, this.z, 3, { speed: 1, up: 1.5 });
        world.camera.shake(6, 10);
      }
    }
    super.update(world);
    if (this.rig && this.rig.sawAngle != null) this.rig.sawAngle += this.state === ST.ATTACK ? 0.5 : 0.05;
    else if (this.rig) this.rig.sawAngle = 0;
  }
  override think(world: BossWorld): void {
    if (this.transition > 0 || this.defeated) { this.releaseToken(world); return; }
    if (this.ventTimer > 0) { // open core / vent window: the machine stalls and takes the punish multiplier
      const v: BossVent = this.phaseDef.vent || {};
      this.punishable = true; this.punishMult = v.damageMult || 1; this.punishGrab = !!v.grabbable; this.rig.tell = false;
      if (!this.inHitstun && this.state !== ST.ATTACK) this.stand();
      if (this.state === ST.ATTACK && v.stall !== false) { this.pendingAttack = null; this.currentAttack = null; this.setState(ST.IDLE, 'idle'); }
      return;
    }
    super.think(world);
  }
  override hurtbox(): Aabb | null {
    const hb = super.hurtbox();
    if (hb && this.hurtboxScale !== 1) hb.y1 = hb.y0 + (hb.y1 - hb.y0) * this.hurtboxScale;
    return hb;
  }
  /** Bosses ignore tokens and never flee / panic. */
  override acquireToken(): boolean { return true; }
  /** Stun window (pressure valves, stage events): stagger + punishable for `frames`. */
  stun(frames: number = 60, source: Entity | null = null): void {
    if (this.transition > 0 || this.defeated || this.state === ST.DEAD) return;
    if (this.grabTarget) this.releaseGrab(false);
    this.enterStall(frames, this.ai.stunDamageMult || 1.5, !!this.ai.stunGrabbable);
    this.hurtTimer = 0; this.vx = 0;
    floatText(this.x, this.y + this.h + 12, this.z, 'STUNNED!', UI.brassLight, 2);
    if (this.world) { this.world.addFx('ring', this.x, 40, this.z, { r0: 8, r1: 90, color: '#ffffff' }); this.world.addFx('steam', this.x, 40, this.z, { count: 10 }); this.world.camera.shake(8, 12); }
    audio.play('valve_blow');
    this.callHook('onStunned', frames, source);
  }
  openVent(): void {
    const v = this.phaseDef.vent;
    if (!v) return;
    this.ventTimer = v.frames || 120;
    if (v.flag) { this.flags[v.flag] = true; this.rig[v.flag] = true; }
    if (this.world) { this.world.addFx('ring', this.x, 60, this.z, { r0: 6, r1: 80, color: '#4DF0E0' }); this.world.addFx('steam', this.x, 60, this.z, { count: 12 }); }
    floatText(this.x, this.y + this.h + 12, this.z, v.text || 'CORE EXPOSED!', '#4DF0E0', 2);
    audio.play('valve_blow');
    this.callHook('onVentOpen');
  }
  closeVent(): void {
    const v = this.phaseDef.vent;
    if (v && v.flag) { this.flags[v.flag] = false; this.rig[v.flag] = false; }
    this.punishable = false; this.punishMult = 1; this.punishGrab = false;
    this.callHook('onVentClose');
  }

  // ---------- damage & phases ----------
  override takeHit(hit: Hit, attacker: Fighter | null): boolean {
    if (this.transition > 0 || this.defeated) return false;
    const ok = super.takeHit(hit, attacker);
    if (ok) this.afterDamage(hit, attacker);
    return ok;
  }
  override takeHitRaw(damage: number, type?: HitType, attacker?: Fighter | null, opts?: { noStop?: boolean; fire?: boolean; silent?: boolean }): void {
    if (this.transition > 0 || this.defeated) return;
    super.takeHitRaw(damage, type, attacker, opts);
    this.afterDamage({ damage }, attacker);
  }
  /** Death hooks fire only on the final defeat (earlier phase deaths are transitions). */
  override onDied(world: BossWorld): void {
    if (this.phaseIndex < this.phases - 1) { this.deathHooked = false; return; }
    super.onDied(world);
  }
  afterDamage(hit: Hit, attacker: Fighter | null): void {
    if (this.hp <= 0 || this.dead) {
      if (this.phaseIndex < this.phases - 1) this.nextPhase();
      else this.beginDefeat();
      return;
    }
    const ai = this.ai, pd = this.phaseDef, world = this.world;
    if (ai.blinkOnDamage && attacker) {
      this.comboDamage += hit.damage || 0; this.comboDamageTimer = COMBO_WINDOW;
      if (this.comboDamage >= ai.blinkOnDamage && !this.airborne && this.anim.has(ai.blinkAnim) && this.state !== ST.ATTACK) {
        this.comboDamage = 0;
        this.startAttack({ anim: ai.blinkAnim, range: 999, chain: ai.blinkChain }, attacker);
      }
    }
    if (pd.vent && pd.vent.everyHp && this.ventTimer <= 0 && Math.floor((this.maxHp - this.hp) / pd.vent.everyHp) > this.ventCount) { this.ventCount++; this.openVent(); }
    if (pd.summonAt && world) {
      const frac = this.hp / Math.max(1, this.maxHp);
      pd.summonAt.forEach((th, i) => {
        if (this.summonFired.has(i) || frac > th) return;
        this.summonFired.add(i);
        const list = pd.summon || this.baseDef.summon;
        if (this.anim.has('summonEscort') && this.state !== ST.ATTACK && !this.inHitstun) this.startAttack({ anim: 'summonEscort', range: 999 }, attacker);
        else if (list) this.summon(list, world);
      });
    }
  }
  nextPhase(): void {
    const world = this.world;
    if (this.grabTarget) this.releaseGrab(false);
    if (this.grabbedBy) { this.grabbedBy.releaseGrab(false); this.grabbedBy = null; }
    this.dead = false; this.deathHooked = false; this.thrownBy = null; this.juggleCount = 0; this.juggleImmune = false; this.hitstop = 0;
    this.closeVent();
    this.applyPhase(this.phaseIndex + 1);
    this.y = 0; this.vy = 0; this.vx = 0; this.vz = 0;
    this.setState(ST.SPECIAL, 'phaseChange', { fallback: 'hurt' });
    this.transition = Math.max(30, this.anim.length);
    this.invuln = this.transition + 6;
    audio.play('boss_phase');
    if (world) {
      world.addFx('flash', this.x, 0, this.z, { color: this.phaseColor });
      world.addFx('ring', this.x, 40, this.z, { r0: 10, r1: 120, color: this.phaseColor });
      world.camera.shake(8, 16);
      if (world.announce) world.announce(this.phaseName, this.bossKind === 'boss' ? 'PHASE ' + this.phase : '', 120);
      const ci = this.phaseDef.cutIn;
      if (ci) world.cutscene(ci.frames || 120, ci.draw ? (ctx, w, t) => ci.draw(ctx, this, w, t) : null);
      // The bestiary (issue #26) reveals a phase's codex block only once that phase has been REACHED, so the
      // person inside the machine is not spoiled by a card for a fight the player has only half seen.
      if (world.onBossPhase) world.onBossPhase(this, this.phaseIndex);
      // The boss says what breaking cost it (issue #25). After `announce`, so the name plate is what the player
      // reads first and the line arrives under it rather than competing with it.
      if (world.bossLine) world.bossLine(this, 'phase', this.phaseIndex);
    }
    this.callHook('onPhase', this.phaseIndex, world);
  }
  beginDefeat(): void {
    this.defeated = true; this.hp = 0;
    this.die();
    if (this.grabTarget) this.releaseGrab(false);
    if (this.grabbedBy) { this.grabbedBy.releaseGrab(false); this.grabbedBy = null; }
    this.thrownBy = null; this.hitstop = 0; this.invuln = 9999; this.status = {};
    this.releaseToken(this.world);
    this.y = 0; this.vy = 0; this.vx = 0;
    this.setState(ST.SPECIAL, 'defeat', { fallback: 'hurt' });
    audio.play('boss_defeat');
    if (this.world) {
      this.world.camera.shake(12, 16); this.world.addFx('flash', this.x, 0, this.z, { color: '#ffffff' }); this.world.resetBand();
      if (this.world.bossLine) this.world.bossLine(this, 'defeat');
    }
  }
  override onActionDone(world: BossWorld): void {
    if (this.defeated) {
      if (this.state !== ST.DEAD) { this.setState(ST.DEAD, 'dead', { fallback: 'lying' }); this.deadTimer = DEFEAT_BLINK; world.onDeath(this); }
      return;
    }
    super.onActionDone(world);
  }
}
