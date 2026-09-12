// Enemy: Fighter + the AI framework of ARCHITECTURE.md section 8 (ARRIVING / ENTER / APPROACH / HOVER / ATTACK / RECOVER /
// KEEP_DISTANCE, attack tokens, z alignment, target selection, separation, off-screen teleport, ranged behaviour, armor/stagger,
// flee, panic, evade, riposte, whiff backsteps, shields, punish windows, tells).
//
// ARRIVING (issue #30, game/entrances.js) is the state a unit spawned with an authored `entrance` sits in before
// ENTER/APPROACH: on screen, drawn and hittable, but on a scripted path, taking no actions and holding no attack
// token. `entered` stays false throughout — exactly as it does while a side spawn walks in — so the wave lock and
// the enemies-remaining count are unchanged. It ends in a punishable, grabbable recovery.
//
// ================================ AI FLAG REFERENCE (def.ai.*) — all optional, defaults in AI_DEFAULTS ================================
//  role (def.role) fodder|bruiser|ranged|rusher|elite|grabber   role defaults (ROLE_DEFAULTS) are applied under def.ai
//  attackRange 40 | zTolerance 12 | attacks [{ anim, range, minRange, weight, maxUses, tell (tell anim), chain (follow-up anim), tellFrames }]
//  attackCooldown [40, 90] | firstAttackDelay 45 | retreatChance 0.25 | retreatBudget 90 | flank false (both z lanes) | hoverCircle / circle (orbit)
//  ranged { anim, minRange, maxRange, cooldown, keep, zAlign, aimDelay }  ranged attack + KEEP_DISTANCE; aimDelay = lob at the target's
//                                                                         position N frames ago (Sapper 24) | keepDistance px (ranged.keep shorthand)
//  ignoresTokens false | maxAttackers N (cap for this faction, e.g. 2 Footmen / Sootborn) | tokenGroup 'name' (custom token pool)
//  staggerEvery N + staggerFrames 30  every Nth hit taken staggers (Brassbound gear slip) — also traits.staggerEveryNthHit
//  shield true | { hitsToStagger: 4, staggerFrames: 30, stripOnLauncher: true, frontOnly: false, dropProp: 'crate' }  super armor + no launch while
//                shielded; Nth hit staggers, a launcher during the stagger strips the shield for good (rig.shieldStripped, hooks.onShieldStripped(f, world),
//                dropProp = prop type left on the floor); frontOnly = armor only from the front
//  launchStun N   armored brute: a launcher stuns for N frames instead of launching (Cinder Hulk 45)
//  flee N / fleeHp N + fleeDistance 100   run away when hp < N (Cutthroat) | fleeLast true  last enemy at <= fleeHpFrac (0.3): fleeChance (0.5) flees off-screen
//  panicRange / panicWhenClose px + panicFrames 30   a player inside the range -> stagger then run (Slinger)
//  evadeChance 0 + evadeCooldown 90   dodge a player's attack | backstepAfterWhiffs { whiffs: 2, dist: 40, iframes: 8, cooldown: 60 } (Wrangler)
//  riposteStance { afterPlayerAttacks: 3, frames: 30, flurryAnim, stanceAnim, range: 120, cooldown: 150 }  deterministic Duelist stance;
//  riposteChance + riposteAnim + riposteCooldown   random riposte on a melee hit
//  stallEvery N + stallFrames 70 + stallDamageMult 3 + stallGrabbable true   every Nth attack ends in a punishable stall (Hoister overheat)
//  punishDamageMult 1 + punishGrabbable false   applied while the current frame has `punish: true` (recovery frames)
//  tellScale 1 | attackSpeed 1   speed of tell / active frames (difficulty: world.options.tellScale) | tellWarnFrames 10 (rig.tellWarn)
//  targetBy 'nearest'|'highestCombo'|'lowestHp' | grabHoldHits 3 + grabHitEvery 18 (frames between hold squeezes: Hook Yank crush 25)
//  blinkOnDamage N + blinkAnim 'aetherStep' + blinkChain 'caneFlurry' (teleport away after N damage in one combo, bosses)
//  rig.look = { x, y } (-1..1 toward the target) is refreshed every step for part hooks (Sootborn eyes track the nearest player)
//  valveStun true (bosses: pressure valves may stun) | stunDamageMult 1.5 + stunGrabbable (boss stun windows)
//  traits.dummy + e.dummyMode 'stand'|'block'|'cpu' + e.dummyFaceLock   training dummy (thinkDummy): no attacks / tokens / ripostes / fleeing unless cpu
//  Frame events handled here: aim (lob target), summon (frame.summon [{ type, variant }]), crateDrop, timeStop (frame.freeze; a dodge in the last
//  tellWarnFrames of the tell escapes), teleportBehind. Enemy content may also use every def.hooks / traits / frame field of fighter.js.
import { ST, TEAM, VIEW_W, Z_SPEED_FACTOR, FLOOR_TOP, UI } from '../constants.js';
import { Fighter } from './fighter.js';
import { rng } from '../engine/rng.js';
import { audio } from '../engine/audio.js';
import { clamp, sign } from '../engine/math.js';
import { drawText } from '../engine/text.js';
import { floatText } from '../art/fx.js';
import { Prop } from './items.js';
import { laneAroundHazards, solidBetween } from './hazards.js';
import { tryEnemyPropThrow, thinkEnemyHeld, dropHeldProp } from './throwables.js';
import { applyMods } from './traits.js';
import { startArrival, stepArrival, finishArrival, isHanging } from './entrances.js';

/** Defaults for `def.ai` (content overrides per type / variant). */
export const AI_DEFAULTS = Object.freeze({
  attackRange: 40, zTolerance: 12, retreatChance: 0.25, attackCooldown: [40, 90], aggression: 0.5, attacks: [], ranged: null,
  staggerEvery: 0, staggerFrames: 30, firstAttackDelay: 45, flank: false, hoverCircle: false, fleeLast: false, fleeHp: 0, fleeDistance: 100,
  retreatBudget: 90, evadeChance: 0, evadeCooldown: 90, riposteChance: 0, riposteCooldown: 150, riposteAnim: 'riposte', panicRange: 0, panicFrames: 30,
  ignoresTokens: false, shield: false, launchStun: 0, stallEvery: 0, stallFrames: 70, stallDamageMult: 3, stallGrabbable: true, grabHoldHits: 3, grabHitEvery: 18,
  blinkOnDamage: 0, blinkAnim: 'aetherStep', blinkChain: 'caneFlurry',
  backstepAfterWhiffs: null, riposteStance: null, punishDamageMult: 1, punishGrabbable: false, tellScale: 1, attackSpeed: 1, tellWarnFrames: 10, targetBy: 'nearest',
});
/** Per-role defaults layered under def.ai (ARCHITECTURE 8 roles). */
export const ROLE_DEFAULTS = Object.freeze({
  fodder: {}, rusher: { flank: true }, bruiser: {}, ranged: {}, elite: { ignoresTokens: true }, grabber: { ignoresTokens: true, retreatChance: 0 },
});
const OFFSCREEN_MARGIN = 200, OFFSCREEN_FRAMES = 300, SEP_X = 18, SEP_Z = 10, RETARGET = 90, HOVER_MAX = 240, HIST = 48;
/** Jump-over (issue #31): how close to a solid's near face a mob must be before it commits to the jump, the pop it
 *  leaves the ground with, and how long it may fail to close on its target with an obstacle between before it jumps
 *  regardless of lane. The last one is the anti-stick rule: nothing may stand grinding against a wall forever. */
const JUMP_OVER_RANGE = 30, JUMP_OVER_VY = 8, JUMP_OVER_VX = 2.6, STUCK_FRAMES = 90, STUCK_EPS = 6;
const SPD_Z = Z_SPEED_FACTOR;

/** Resolve the alias flags of an ai table into the canonical names. */
export function normalizeAi(def) {
  const ai = { ...AI_DEFAULTS, ...(ROLE_DEFAULTS[def.role] || {}), ...(def.ai || {}) };
  if (ai.circle) ai.hoverCircle = true;
  if (ai.panicWhenClose) ai.panicRange = ai.panicWhenClose;
  if (ai.flee) { if (typeof ai.flee === 'object') { ai.fleeHp = ai.flee.hp || ai.fleeHp; ai.fleeDistance = ai.flee.distance || ai.fleeDistance; } else ai.fleeHp = ai.flee; }
  if (ai.ranged && ai.keepDistance && ai.ranged.keep == null) ai.ranged = { ...ai.ranged, keep: ai.keepDistance };
  if (ai.shield) {
    const s = typeof ai.shield === 'object' ? ai.shield : {};
    ai.shield = { hitsToStagger: s.hitsToStagger || ai.staggerEvery || 4, staggerFrames: s.staggerFrames || ai.staggerFrames || 30, stripOnLauncher: s.stripOnLauncher !== false, frontOnly: !!s.frontOnly, dropProp: s.dropProp || null };
    if (!ai.staggerEvery) ai.staggerEvery = ai.shield.hitsToStagger;
    ai.staggerFrames = ai.shield.staggerFrames;
  }
  const t = def.traits || {};
  if (t.staggerEveryNthHit && !ai.staggerEvery) { ai.staggerEvery = t.staggerEveryNthHit; ai.staggerFrames = t.staggerFrames || 30; }
  if (t.fleeHpFrac || t.fleeChance) ai.fleeLast = true;
  return ai;
}

/** AI-controlled fighter. `def` comes from content/enemies (see the header table for the fields). */
export class Enemy extends Fighter {
  /**
   * @param {object} def enemy definition
   * @param {{ x?: number, z?: number, facing?: number, entered?: boolean, kind?: string, fromSky?: boolean, mods?: string[],
   *   entrance?: object }} o
   *   mods = spawn modifiers (traits.js SPAWN_MODS: holdout / crusted / scrip / winged / salvaged) applied to the def before the rig is built
   *   entrance = a resolved entrance (game/entrances.js entranceFor): an authored arrival that replaces the walk-on
   */
  constructor(def, { x = 0, z = 70, facing = -1, entered = true, kind = 'enemy', fromSky = false, mods = null, entrance = null } = {}) {
    // the derived def is computed BEFORE super() (no `this` needed): the rig, traits and stats all come from the patched def
    const d = mods && mods.length ? applyMods(def, mods) : def;
    super(d, { team: TEAM.ENEMY, kind, x, z, facing });
    /** Spawn modifiers this enemy carries (names), [] when plain. */
    this.mods = d.mods || [];
    if (this.mods.includes('winged')) fromSky = true;  // a bladder-borne body arrives from above
    this.ai = normalizeAi(d);
    this.applyAiTraits();
    // training room (screens/training.js): traits.dummy set per instance via spawnDummy's def spread; dummyMode/
    // dummyFaceLock are read only when traits.dummy is true, so every non-training spawn ignores them.
    this.dummyMode = 'stand'; this.dummyFaceLock = false;
    this.entered = entered;
    this.aiState = entered ? 'APPROACH' : 'ENTER';
    this.aiTimer = 0; this.target = null; this.retargetTimer = 0;
    this.attackCooldown = this.ai.firstAttackDelay; this.rangedCooldown = Math.round(this.ai.firstAttackDelay * 0.8);
    this.hoverSide = rng.sign(); this.hoverDist = 60; this.hoverZ = 0; this.flankZ = this.ai.flank ? rng.range(-40, 40) : 0;
    this.offscreenTimer = 0; this.enterTimer = 0; this.staggerTimer = 0; this.shieldStripped = false;
    this.fled = false; this.fleeTimer = 0; this.fleeing = false; this.fleeOff = false; this.fleeDir = 1; this.fleeChecked = false;
    this.pendingAttack = null; this.currentAttack = null; this.attackUses = new Map(); this.hasToken = false; this.attackCount = 0;
    this.retreatBudget = this.ai.retreatBudget; this.panicCooldown = 0; this.panicFlee = false; this.evadeTimer = 0; this.lastSeenAttack = -1; this.riposteTimer = 0;
    // optional stretch, step 21.6, dev-only ?enemythrow=1 (game/throwables.js tryEnemyPropThrow): Scrap Slinger /
    // Soot Cutthroat throttle between prop-throw attempts on this cooldown (hashed in net/checksum.js).
    this.propThrowCooldown = 0;
    this.retreating = false; this.grabHitTimer = 0; this.stalled = false;
    /** Anti-stall (StageRunner.checkWaveStall): this unit has been told to stop keeping its distance. */
    this.pressed = false;
    // issue #31 jump-over: frames spent failing to close on the target with a solid in the way, and the x it last
    // made progress from. Both are plain counters off the sim, so they cost the rng stream nothing.
    this.stuckT = 0; this.lastGapX = null;
    // whiff backsteps / riposte stance bookkeeping
    this.watchInst = -1; this.watchNear = false; this.hitByInst = -1; this.whiffs = 0; this.backstepCooldown = 0;
    this.inStance = false; this.stanceTimer = 0; this.stanceCooldown = 0; this.playerAttacks = 0; this.lastPlayerAttack = -1; this.noAttackTimer = 0;
    // target position history (ranged.aimDelay)
    this.histX = new Float32Array(HIST); this.histZ = new Float32Array(HIST); this.histI = 0; this.histN = 0;
    this.rig.keyAngle = 0; this.rig.tell = false; this.rig.tellWarn = false; this.rig.look = { x: 0, y: 0 };
    if (fromSky) { this.y = 170; this.vy = 0; this.entered = true; this.aiState = 'APPROACH'; this.setState(ST.JUMP, 'fall', { fallback: 'jump' }); }
    /** Authored entrance (issue #30) and its frame counter; null / 0 for every unit that walks on from a side. */
    this.entrance = null; this.arriveT = 0; this.arrivePath = 0; this.arriveLand = 0; this.arriveX = this.x; this.cutLine = false;
    // an entrance replaces the walk-on and the sky fall alike: it sets its own start pose, state and aiState
    if (entrance) startArrival(this, entrance);
  }
  /** Shield / role flags that live in the traits the core reads. */
  applyAiTraits() {
    const ai = this.ai;
    if (ai.shield) { this.traits.superArmor = true; this.traits.noLaunch = true; this.unlaunchable = true; if (ai.shield.frontOnly) this.traits.armorFrontOnly = true; }
    this.armor = this.traits.superArmor;
  }
  /** traits.dummy (training room) and not put into CPU mode: never attacks, takes no token, never flees or ripostes. */
  get passiveDummy() { return !!this.traits.dummy && this.dummyMode !== 'cpu'; }

  // ---------- per-step ----------
  update(world) {
    this.armorSuppressed = this.staggerTimer > 0 || this.shieldStripped || !!this.status.stunned;
    super.update(world);
    // dynamic armor: staggered (gear slip), stunned or shield-stripped automatons lose their armor
    if (this.staggerTimer > 0 || this.shieldStripped || this.status.stunned) { this.armor = false; this.unlaunchable = false; }
    else this.unlaunchable = this.traits.noLaunch;
  }

  think(world) {
    // A passive training dummy (STAND / BLOCK-STAGGER) must never act on its own, but Fighter.update calls a
    // content onUpdate hook BEFORE think() runs (chandler.js tallyman's rite is the one offender today), so
    // the hook can already have pushed this dummy into ATTACK/SPECIAL by the time we get here. Bounce it
    // straight back to idle before the ATTACK/SPECIAL early-return a few lines down would otherwise skip the
    // passiveDummy branch below forever (issue #22 review).
    if (this.passiveDummy && (this.state === ST.ATTACK || this.state === ST.SPECIAL)) {
      this.currentAttack = null; this.pendingAttack = null; this.setState(ST.IDLE, 'idle');
    }
    const ai = this.ai, f = this.anim.frame;
    this.rig.tell = !!(f && f.tell) || this.inStance;
    this.updateTellSpeed(world, f);
    if (this.state === ST.ATTACK || this.state === ST.WALK || this.state === ST.RUN) this.rig.keyAngle += 0.2;
    if (this.staggerTimer > 0) this.staggerTimer--;
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.rangedCooldown > 0) this.rangedCooldown--;
    if (this.panicCooldown > 0) this.panicCooldown--;
    if (this.evadeTimer > 0) this.evadeTimer--;
    if (this.riposteTimer > 0) this.riposteTimer--;
    if (this.retargetTimer > 0) this.retargetTimer--;
    if (this.backstepCooldown > 0) this.backstepCooldown--;
    if (this.propThrowCooldown > 0) this.propThrowCooldown--;
    if (this.stanceCooldown > 0) this.stanceCooldown--;
    if (this.stanceTimer > 0 && --this.stanceTimer === 0) this.inStance = false;
    // punish window: stalls (STAGGER) or frames flagged punish:true
    if (this.aiState !== 'STAGGER') { this.punishable = !!(f && f.punish); this.punishMult = ai.punishDamageMult; this.punishGrab = ai.punishGrabbable; }
    this.checkOffscreen(world);
    // ARRIVING (issue #30, game/entrances.js): step the scripted entrance path. This runs BEFORE the hitstun and
    // airborne early-returns below, because most entrances ARE airborne and because a hit landing mid-arrival is
    // exactly what cuts a rope drop's line. A hit heavy enough to put the unit into an air-hurt state ends the
    // entrance outright: being knocked out of the sky is the punish, not a scripted path still running underneath it.
    if (this.aiState === 'ARRIVING') {
      const s = this.state;
      if (this.dead || this.grabbedBy || s === ST.HURT_AIR || s === ST.KNOCKDOWN || s === ST.THROWN) finishArrival(this, world);
      else if (stepArrival(this, world)) return;
    }
    if (this.dead || this.inHitstun || this.grabbedBy || this.status.netted) { this.releaseToken(world); this.pendingAttack = null; this.inStance = false; return; }
    if (this.state === ST.GRAB) { this.thinkGrab(world); return; }
    if (this.state === ST.DODGE) { if (this.stateTimer <= 12) this.x -= this.facing * (this.backstepDist || 42) / 12; return; }
    if (this.state === ST.ATTACK || this.state === ST.SPECIAL || this.state === ST.JUMP || this.airborne) return;
    this.pickTarget(world);
    if (this.aiState === 'STAGGER') { if (--this.aiTimer <= 0) this.endStagger(); return; }
    if (this.aiState === 'FLEE') { this.thinkFlee(world); return; }
    if (this.passiveDummy) { this.thinkDummy(world); return; }
    // an enemy that has not walked inside the lock yet always keeps entering (a hit while entering must not park it outside the arena)
    if (this.aiState === 'ENTER' || !this.entered) { this.thinkEnter(world); return; }
    const t = this.target;
    if (!t) { this.stand(); return; }
    this.recordHistory(t);
    const look = this.rig.look || (this.rig.look = { x: 0, y: 0 });
    look.x = clamp((t.x - this.x) * this.facing / 80, -1, 1); look.y = clamp((this.z - t.z) / 60, -1, 1);
    if (this.inStance) { this.face(t); this.stand(); return; }
    if (this.tryEvade(world, t) || this.tryPanic(world, t) || this.tryBackstep(world, t) || this.tryStance(world, t)) return;
    this.separate(world);
    if (tryEnemyPropThrow(this, world)) return; // optional stretch, step 21.6: ?enemythrow=1 (no-op otherwise)
    switch (this.aiState) {
      case 'KEEP_DISTANCE': this.thinkRanged(world, t); break;
      case 'HOVER': this.thinkHover(world, t); break;
      case 'RECOVER': this.thinkRecover(world, t); break;
      default: this.thinkApproach(world, t);
    }
  }
  /** Tell frames play at 1 / (ai.tellScale * options.tellScale) speed (or stretch to attack.tellFrames); active frames at ai.attackSpeed. */
  updateTellSpeed(world, f) {
    const ai = this.ai, a = this.anim;
    if (f && f.tell && this.state === ST.ATTACK) {
      let k = ai.tellScale * ((world.options && world.options.tellScale) || 1);
      const atk = this.currentAttack;
      if (atk && atk.tellFrames && a.def) { let tot = 0; for (const fr of a.def.frames) if (fr.tell) tot += fr.dur || 1; if (tot > 0) k = atk.tellFrames / tot; }
      a.speed = 1 / Math.max(0.1, k);
      const remaining = ((f.dur || 1) - a.frameTime) * k, next = a.def ? a.def.frames[a.frameIndex + 1] : null;
      this.rig.tellWarn = !(next && next.tell) && remaining <= ai.tellWarnFrames;
    } else { a.speed = this.state === ST.ATTACK ? ai.attackSpeed : 1; this.rig.tellWarn = false; }
  }
  recordHistory(t) { this.histX[this.histI] = t.x; this.histZ[this.histI] = t.z; this.histI = (this.histI + 1) % HIST; if (this.histN < HIST) this.histN++; }
  /** Target position `delay` frames ago (clamped to what has been recorded). */
  historyAt(delay) { const d = Math.min(delay | 0, Math.max(0, this.histN - 1)); const i = (this.histI - 1 - d + HIST * 2) % HIST; return { x: this.histX[i], z: this.histZ[i] }; }

  // ---------- targeting & movement helpers ----------
  pickTarget(world) {
    const t = this.target;
    const valid = t && t.alive && !t.dead && !t.removeMe && !t.out;
    if (valid && this.retargetTimer > 0) return;
    let best = null, bestD = Infinity;
    const by = this.ai.targetBy;
    for (const p of world.players) {
      if (!p.alive || p.dead || p.removeMe || p.out) continue;
      let d = Math.abs(p.x - this.x) + Math.abs(p.z - this.z) * 1.5;
      if (by === 'highestCombo') d -= (p.combo || 0) * 100;
      else if (by === 'lowestHp') d += (p.hp / Math.max(1, p.maxHp)) * 1000;
      if (d < bestD) { bestD = d; best = p; }
    }
    this.target = best; this.retargetTimer = RETARGET;
  }
  face(t) { const d = t.x - this.x; if (Math.abs(d) > 4) this.facing = sign(d); }
  /** Walk toward a local offset (dx, dz). `back` keeps the current facing (backpedal). */
  moveToward(dx, dz, mult = 1, back = false, run = false) {
    const spd = (run ? this.runSpeed : this.walkSpeed) * mult;
    const mx = clamp(dx, -spd, spd), mz = clamp(dz, -spd * SPD_Z, spd * SPD_Z);
    const zb = this.world ? this.world.zBounds(this) : { z0: 0, z1: 140 };
    this.x += mx; this.z = clamp(this.z + mz, zb.z0, zb.z1);
    if (!back && Math.abs(mx) > 0.2) this.facing = sign(mx);
    const st = run ? ST.RUN : ST.WALK, an = run ? 'run' : 'walk';
    if (this.state !== st || (this.anim.name !== an && this.anim.name !== 'flee')) { this.state = st; this.stateTimer = 0; this.play(an, { restart: false }); }
  }
  stand() {
    if (this.state !== ST.IDLE) this.setState(ST.IDLE, 'idle', { restart: false });
    else if (this.anim.name !== 'idle' && this.anim.name !== 'land' && this.anim.name !== 'riposteStance' && (this.anim.done || (this.anim.def && this.anim.def.loop))) this.play('idle');
  }
  separate(world) {
    for (const e of world.enemies) {
      if (e === this || e.dead) continue;
      const dx = this.x - e.x, dz = this.z - e.z;
      if (Math.abs(dx) < SEP_X && Math.abs(dz) < SEP_Z) { this.x += (sign(dx) || (this.id > e.id ? 1 : -1)) * 0.5; this.z = clamp(this.z + (sign(dz) || 1) * 0.3, world.floorBand.z0, world.floorBand.z1); }
    }
  }
  checkOffscreen(world) {
    const cam = world.camera;
    if (this.fleeOff) return;
    // an arrival is a bounded, authored path (game/entrances.js): never yank it to a lock edge part-way through
    if (this.aiState === 'ARRIVING') { this.enterTimer = 0; this.offscreenTimer = 0; return; }
    // still walking in: after OFFSCREEN_FRAMES outside the arena, teleport to the nearest lock edge (prevents stuck waves)
    if (!this.entered) {
      if (++this.enterTimer > OFFSCREEN_FRAMES) {
        const lo = cam.locked ? cam.left : cam.x, hi = cam.locked ? cam.right : cam.x + VIEW_W;
        // `plant`, not `y = 0; vy = 0`: the rescue was written for a unit WALKING in, but a wave enemy can be
        // knocked down before it ever reaches the arena -- the timer keeps running because `entered` is still false --
        // and planting a KNOCKDOWN body flat strands it out of the air with no landing, alive and inert, forever.
        this.x = this.x < (lo + hi) / 2 ? lo + 16 : hi - 16; this.vx = 0;
        this.plant(world);
        this.entered = true; this.enterTimer = 0; this.offscreenTimer = 0;
        if (this.aiState === 'ENTER') this.aiState = 'APPROACH';
      }
      return;
    }
    if (this.x < cam.x - OFFSCREEN_MARGIN || this.x > cam.x + VIEW_W + OFFSCREEN_MARGIN) {
      if (++this.offscreenTimer > OFFSCREEN_FRAMES) {
        this.x = this.x < cam.x ? cam.x + 16 : cam.x + VIEW_W - 16; this.entered = true; this.offscreenTimer = 0;
        if (this.aiState === 'ENTER') this.aiState = 'APPROACH';
      }
    } else this.offscreenTimer = 0;
  }
  acquireToken(world) {
    if (this.ai.ignoresTokens) return true;
    this.hasToken = world.requestToken(this);
    return this.hasToken;
  }
  releaseToken(world) { if (this.hasToken) { (world || this.world).releaseToken(this); this.hasToken = false; } }
  get maxAttackRange() { let m = 0; for (const a of this.ai.attacks) if (a.range > m) m = a.range; return m; }

  // ---------- AI states ----------
  thinkEnter(world) {
    const cam = world.camera;
    const lo = cam.locked ? cam.left : cam.x, hi = cam.locked ? cam.right : cam.x + VIEW_W;
    if (this.x > lo + 30 && this.x < hi - 30) { this.entered = true; this.aiState = 'APPROACH'; return; }
    this.moveToward((lo + hi) / 2 - this.x, 0, 1);
  }
  thinkApproach(world, t) {
    const ai = this.ai;
    const dx = t.x - this.x, adx = Math.abs(dx), adz = Math.abs(t.z - this.z);
    if (ai.ranged && !this.pressed && this.retreatBudget > 0 && adx <= ai.ranged.maxRange + 40 && adx > ai.attackRange + 10) { this.aiState = 'KEEP_DISTANCE'; return; }
    this.face(t);
    if (adx <= ai.attackRange && adz <= ai.zTolerance) {
      if (this.attackCooldown <= 0 && this.acquireToken(world)) {
        const atk = this.chooseAttack(adx);
        if (atk) { this.startAttack(atk, t); return; }
        this.releaseToken(world); // nothing fits at this distance (e.g. inside a lunge's minRange): do not hog the token
      }
      if (!ai.ignoresTokens && !this.hasToken) { this.aiState = 'HOVER'; this.hoverDist = ai.attackRange + rng.range(30, 60); this.aiTimer = 0; return; }
      this.stand(); return;
    }
    if (this.attackCooldown <= 0 && adz <= ai.zTolerance && adx <= this.maxAttackRange && this.acquireToken(world)) {
      const atk = this.chooseAttack(adx); if (atk) { this.startAttack(atk, t); return; }
      this.releaseToken(world);
    }
    const standoff = Math.max(10, ai.attackRange - 8);
    const wantX = t.x - sign(dx || this.facing) * standoff;
    const band = world.floorBand;
    let laneZ = (ai.flank && adx > 70) ? clamp(t.z + this.flankZ, band.z0, band.z1) : t.z;
    // GDD 6: walk AROUND a hazard the approach would cross (the dock's cargo hook sweeps a 176px arc)
    laneZ = laneAroundHazards(world, this.x, wantX, laneZ, band.z0, band.z1);
    // issue #31: laneAroundHazards steers around a solid the same way it steers around a vent, but a wall that spans
    // the whole floor band has no lane left to take — it returns z unchanged and the mob would walk into it forever.
    // That is the case, and only that case, where the answer is to go over the top.
    if (this.tryJumpOver(world, laneZ)) return;
    const mz = laneZ - this.z;
    this.moveToward(wantX - this.x, Math.abs(mz) > 3 ? mz : 0, 1, false, adx > 260);
  }
  /**
   * Jump a solid obstacle that is between this enemy and where it is trying to walk (issue #31). Two triggers:
   * being close enough to its near face to clear it, or the anti-stick rule — STUCK_FRAMES of failing to close on
   * the target with an obstacle in the way, at which point it jumps from wherever it is rather than grinding.
   *
   * Flyers skip all of this: a Gleaner or a Stormcrow that is already off the ground clears the obstacle by being
   * airborne, which is the same rule the player gets.
   * @returns {boolean} true when a jump was started this frame
   */
  tryJumpOver(world, laneZ) {
    if (this.airborne || this.grabbedBy || this.state === ST.ATTACK) return false;
    const t = this.target;
    if (!t) { this.stuckT = 0; return false; }
    const s = solidBetween(world, this.x, t.x, laneZ);
    if (!s) { this.stuckT = 0; this.lastGapX = this.x; return false; }
    // still closing on the far side? then it is walking round, not stuck
    const moved = Math.abs(this.x - (this.lastGapX != null ? this.lastGapX : this.x));
    if (moved > STUCK_EPS) { this.stuckT = 0; this.lastGapX = this.x; } else this.stuckT = (this.stuckT || 0) + 1;
    const face = sign(t.x - this.x) || this.facing;
    const nearFace = face > 0 ? s.x0 : s.x1;
    // not close enough to commit yet: fall through and let the ordinary approach walk it up to the face
    const close = Math.abs(nearFace - this.x) <= JUMP_OVER_RANGE;
    if (!close && this.stuckT < STUCK_FRAMES) return false;
    this.stuckT = 0; this.lastGapX = this.x;
    this.facing = face;
    this.vy = JUMP_OVER_VY; this.y = 0.01;
    this.vx = face * Math.max(JUMP_OVER_VX, this.runSpeed || JUMP_OVER_VX);
    this.setState(ST.JUMP, 'jump', { fallback: 'fall' });
    audio.play('jump');
    return true;
  }
  thinkHover(world, t) {
    this.face(t);
    this.aiTimer++;
    if (this.aiTimer % 30 === 0 && this.attackCooldown <= 0 && this.acquireToken(world)) { this.aiState = 'APPROACH'; return; }
    const curSide = sign(this.x - t.x) || this.hoverSide;
    if (this.ai.hoverCircle && this.aiTimer % 120 === 0) this.hoverSide = -curSide;
    const wantX = t.x + (this.ai.hoverCircle ? this.hoverSide : curSide) * this.hoverDist;
    if (this.aiTimer % 90 === 45) this.hoverZ = rng.range(-30, 30);
    const band = world.floorBand;
    const wantZ = laneAroundHazards(world, this.x, wantX, clamp(t.z + this.hoverZ, band.z0, band.z1), band.z0, band.z1);
    const mx = wantX - this.x, mz = wantZ - this.z;
    if (Math.abs(mx) > 4 || Math.abs(mz) > 4) this.moveToward(mx, mz, 0.7, Math.abs(mx) < 30); else this.stand();
    if (this.aiTimer > HOVER_MAX) this.aiState = 'APPROACH';
  }
  thinkRecover(world, t) {
    this.face(t);
    if (--this.aiTimer <= 0) { this.aiState = 'APPROACH'; this.retreating = false; return; }
    if (this.retreating) this.moveToward(-sign(t.x - this.x || this.facing) * 40, 0, 0.7, true); else this.stand();
  }
  thinkRanged(world, t) {
    const ai = this.ai, r = ai.ranged, cam = world.camera;
    const dx = t.x - this.x, adx = Math.abs(dx), adz = Math.abs(t.z - this.z);
    this.face(t);
    if (this.pressed || adx > r.maxRange + 40 || this.retreatBudget <= 0) { this.aiState = 'APPROACH'; return; }
    // melee fallback when the player is on top of us
    if (adx <= ai.attackRange + 6 && adz <= ai.zTolerance && this.attackCooldown <= 0 && ai.attacks.length) {
      const atk = this.chooseAttack(adx); if (atk && this.acquireToken(world)) { this.startAttack(atk, t); return; }
    }
    const keep = r.keep || (r.minRange + r.maxRange) / 2;
    const lim = world.boundsFor(this), scrLo = Math.max(lim.x0, cam.x + 24), scrHi = Math.min(lim.x1, cam.x + VIEW_W - 24);
    if (adx < r.minRange - 20) {
      const away = -sign(dx || this.facing), nx = this.x + away * this.walkSpeed * 0.75;
      if (nx > scrLo && nx < scrHi) { this.retreatBudget--; this.moveToward(away * 40, 0, 0.75, true); return; }
    }
    if (r.zAlign && adz > 6) { this.moveToward(0, t.z - this.z, 0.8); return; }
    if (this.rangedCooldown <= 0 && adx >= r.minRange * 0.5 && adx <= r.maxRange) { this.startRanged(r, t); return; }
    if (adx < keep - 30 && this.retreatBudget > 0) {
      const away = -sign(dx || this.facing), nx = this.x + away * this.walkSpeed * 0.6;
      if (nx > scrLo && nx < scrHi) { this.retreatBudget--; this.moveToward(away * 40, 0, 0.6, true); return; }
    } else if (adx > keep + 40) { this.moveToward(dx, 0, 0.8); return; }
    this.stand();
  }
  /**
   * Come in and fight (StageRunner.checkWaveStall). A wave holds the camera lock until it is empty, and a ranged
   * variant tops its retreat budget back up on every shot it lands, so one left alone with the party inside a lock
   * can keep its distance for the rest of the run: the section never clears and there is nowhere to walk. Pressed, it
   * gives up the stand-off and approaches like anything else — it keeps its ranged attack, it just stops backing away
   * to buy room for it. Nothing un-presses it: the stand-off is what stalled, and a wave only gets told once.
   */
  pressIn() {
    if (this.pressed) return;
    this.pressed = true;
    this.retreatBudget = 0;
    if (this.aiState === 'KEEP_DISTANCE' || this.aiState === 'HOVER') this.aiState = 'APPROACH';
  }
  thinkFlee(world) {
    const cam = world.camera;
    this.facing = this.fleeDir;
    this.moveToward(this.fleeDir * 100, 0, 1.15, false, true);
    if (this.fleeOff) {
      if (this.x < cam.x - 60 || this.x > cam.x + VIEW_W + 60 || this.x <= 2 || this.x >= world.stageLength - 2) { this.removeMe = true; this.alive = false; this.releaseToken(world); }
      return;
    }
    if (--this.fleeTimer <= 0) { this.aiState = 'APPROACH'; this.fleeing = false; }
  }
  /** traits.dummy (training room): never attacks, never takes a token; faces the nearest player (unless dummyFaceLock) and stands. CPU mode never gets here. */
  thinkDummy(world) {
    this.aiState = 'DUMMY';
    const t = this.target;
    if (t) {
      if (!this.dummyFaceLock) this.face(t);
      const look = this.rig.look || (this.rig.look = { x: 0, y: 0 });
      look.x = clamp((t.x - this.x) * this.facing / 80, -1, 1); look.y = clamp((this.z - t.z) / 60, -1, 1);
    }
    this.stand();
  }
  thinkGrab(world) {
    if (this.heldProp) { thinkEnemyHeld(this, world); return; } // step 21.6 stretch
    if (!this.grabTarget || this.throwPending) return;
    if (this.anim.name === 'grab' && !this.anim.done) return;
    if (++this.grabHitTimer >= this.ai.grabHitEvery) { this.grabHitTimer = 0; this.grabHit(); }
  }
  endStagger() {
    this.stalled = false; this.punishable = false; this.punishMult = 1; this.punishGrab = false;
    if (this.panicFlee) { this.panicFlee = false; this.aiState = 'FLEE'; this.fleeTimer = 50; this.fleeDir = this.target ? -(sign(this.target.x - this.x) || this.facing) : -this.facing; audio.play('soot_flee'); }
    else this.aiState = 'APPROACH';
  }
  /** Stagger / stall for `frames` (AI state STAGGER, armor off). */
  enterStagger(frames, anim = 'stagger') {
    this.aiState = 'STAGGER'; this.aiTimer = frames; this.staggerTimer = Math.max(this.staggerTimer, frames);
    this.pendingAttack = null; this.inStance = false; this.releaseToken();
    this.setState(ST.IDLE, anim, { fallback: 'hurt' });
  }
  /** Punishable stall window: damage x mult, grabbable (Hoister overheat, boss valve stuns). */
  enterStall(frames, mult, grabbable) {
    this.enterStagger(frames);
    this.stalled = true; this.punishable = true; this.punishMult = mult; this.punishGrab = grabbable;
  }
  tryEvade(world, t) {
    const ai = this.ai;
    if (!ai.evadeChance || this.evadeTimer > 0 || !t.anim) return false;
    const attacking = t.state === ST.ATTACK || t.state === ST.DASH_ATTACK || t.state === ST.JUMP_ATTACK;
    if (!attacking || t.anim.instance === this.lastSeenAttack) return false;
    this.lastSeenAttack = t.anim.instance;
    if (Math.abs(t.x - this.x) > 80 || Math.abs(t.z - this.z) > 24 || !rng.chance(ai.evadeChance)) return false;
    this.evadeTimer = ai.evadeCooldown; this.face(t); this.backstepDist = 42;
    this.setState(ST.DODGE, 'dodge'); this.invuln = Math.max(this.invuln, 10); this.releaseToken(world);
    return true;
  }
  tryPanic(world, t) {
    const ai = this.ai;
    if (!ai.panicRange || this.panicCooldown > 0) return false;
    if (Math.abs(t.x - this.x) > ai.panicRange || Math.abs(t.z - this.z) > 30) return false;
    this.panicCooldown = 240; this.panicFlee = true;
    this.enterStagger(ai.panicFrames); audio.play('soot_hurt');
    return true;
  }
  /** ai.backstepAfterWhiffs: after N player attacks in a row that missed us nearby, hop back with i-frames (Gutter Wrangler). */
  tryBackstep(world, t) {
    const bs = this.ai.backstepAfterWhiffs;
    if (!bs || !t.anim) return false;
    const attacking = t.state === ST.ATTACK || t.state === ST.DASH_ATTACK || t.state === ST.JUMP_ATTACK, inst = t.anim.instance;
    if (attacking && inst !== this.watchInst) {
      if (this.watchInst >= 0 && this.watchNear) this.whiffs = this.hitByInst === this.watchInst ? 0 : this.whiffs + 1;
      this.watchInst = inst; this.watchNear = Math.abs(t.x - this.x) < (bs.range || 110) && Math.abs(t.z - this.z) < 30;
    }
    if (this.whiffs < (bs.whiffs || 2) || this.backstepCooldown > 0) return false;
    this.whiffs = 0; this.backstepCooldown = bs.cooldown || 60; this.face(t); this.backstepDist = bs.dist || 40;
    this.setState(ST.DODGE, 'dodge'); this.invuln = Math.max(this.invuln, bs.iframes || 8); this.releaseToken(world);
    return true;
  }
  /** ai.riposteStance: after the player presses Attack N times in a row nearby, hold a parry stance for `frames` (Chrome Duelist). */
  tryStance(world, t) {
    const rs = this.ai.riposteStance;
    if (!rs || !t.anim) return false;
    const attacking = t.state === ST.ATTACK || t.state === ST.DASH_ATTACK || t.state === ST.JUMP_ATTACK, inst = t.anim.instance;
    if (attacking) { this.noAttackTimer = 0; if (inst !== this.lastPlayerAttack && Math.abs(t.x - this.x) < (rs.range || 120)) { this.lastPlayerAttack = inst; this.playerAttacks++; } }
    else if (++this.noAttackTimer > 90) this.playerAttacks = 0;
    if (this.playerAttacks < (rs.afterPlayerAttacks || 3) || this.stanceCooldown > 0 || this.attackCooldown > 20) return false;
    this.playerAttacks = 0; this.stanceCooldown = rs.cooldown || 150; this.stanceTimer = rs.frames || 30; this.inStance = true;
    this.face(t); this.releaseToken(world);
    this.setState(ST.IDLE, rs.stanceAnim || 'riposteStance', { fallback: 'idle' });
    audio.play('chime');
    return true;
  }

  // ---------- attacks ----------
  chooseAttack(adx) {
    const list = this.ai.attacks;
    let total = 0; const cands = [];
    for (const a of list) {
      if (adx > a.range || adx < (a.minRange || 0)) continue;
      if (a.maxUses && (this.attackUses.get(a.anim) || 0) >= a.maxUses) continue;
      if (!this.anim.has(a.anim)) continue;
      cands.push(a); total += a.weight || 1;
    }
    if (!cands.length) return null;
    let r = rng.next() * total;
    for (const a of cands) { r -= a.weight || 1; if (r <= 0) return a; }
    return cands[cands.length - 1];
  }
  startAttack(atk, t) {
    if (t) { this.face(t); this.aimX = t.x; this.aimZ = t.z; }
    this.currentAttack = atk; this.attackUses.set(atk.anim, (this.attackUses.get(atk.anim) || 0) + 1);
    this.attackCooldown = 0; this.retreating = false; this.inStance = false;
    if (atk.tell && this.anim.has(atk.tell)) { this.pendingAttack = atk.anim; this.setState(ST.ATTACK, atk.tell); }
    else this.setState(ST.ATTACK, atk.anim);
  }
  startRanged(r, t) {
    this.face(t); this.aimAtTarget(t);
    this.currentAttack = { anim: r.anim, ranged: true }; this.rangedCooldown = r.cooldown || 150;
    this.setState(ST.ATTACK, r.anim);
  }
  /** Aim at the target (or where it was `ranged.aimDelay` frames ago: Copper Sapper lobs at 0.4s-old positions). */
  aimAtTarget(t) {
    const d = this.ai.ranged && this.ai.ranged.aimDelay;
    if (d && this.histN > 0) { const h = this.historyAt(d); this.aimX = h.x; this.aimZ = h.z; } else { this.aimX = t.x; this.aimZ = t.z; }
  }
  onActionDone(world) {
    if (this.pendingAttack) { const a = this.pendingAttack; this.pendingAttack = null; this.setState(ST.ATTACK, a); return; }
    if (this.state === ST.ATTACK) {
      const atk = this.currentAttack; this.currentAttack = null;
      this.finishAttack(world);
      if (atk && atk.chain && this.anim.has(atk.chain) && this.aiState !== 'STAGGER') { this.startAttack({ anim: atk.chain, range: 999 }, this.target); return; }
    }
    super.onActionDone(world);
  }
  finishAttack(world) {
    const ai = this.ai, cd = ai.attackCooldown;
    this.attackCooldown = rng.int(cd[0], cd[1]);
    if (!this.pressed) this.retreatBudget = Math.min(ai.retreatBudget, this.retreatBudget + 40);
    this.attackCount++;
    this.releaseToken(world);
    if (ai.stallEvery && this.attackCount % ai.stallEvery === 0) { this.enterStall(ai.stallFrames, ai.stallDamageMult, ai.stallGrabbable); audio.play('valve_blow'); return; }
    if (ai.retreatChance > 0 && rng.chance(ai.retreatChance)) { this.aiState = 'RECOVER'; this.aiTimer = rng.int(20, 40); this.retreating = true; }
    else { this.aiState = ai.ranged && !this.pressed && this.retreatBudget > 0 ? 'KEEP_DISTANCE' : 'APPROACH'; }
  }
  onAnimEvent(name, frame, world) {
    if (name === 'aim') { const t = this.target; if (t) this.aimAtTarget(t); return; }
    if (name === 'summon') { this.summon(frame && frame.summon, world); return; }
    if (name === 'crateDrop') { this.crateDrop(frame && frame.projectile, world); return; }
    if (name === 'timeStop') { this.timeStop((frame && frame.freeze) || 60, world); return; }
    super.onAnimEvent(name, frame, world);
  }
  /** Time Stop (GDD 5.2): players freeze for `frames` unless they pressed Dodge in the last tellWarnFrames of the tell. */
  timeStop(frames, world) {
    for (const p of world.players) {
      if (!p.alive || p.dead || p.out) continue;
      if (p.dodgedRecently && p.dodgedRecently(this.ai.tellWarnFrames)) { floatText(p.x, p.y + p.h + 10, p.z, 'DODGED!', UI.meter, 1); if (p.addMeter) p.addMeter(10); continue; }
      p.applyStatus('timeStopped', { frames }, this);
    }
    world.addFx('flash', this.x, 0, this.z, { color: '#4DF0E0' }); audio.play('time_stop_tick');
  }
  /** Hoister crate drop (GDD 5.1): a crate falls on the aimed spot, lands as an area knockdown and leaves a breakable crate with food. */
  crateDrop(spec, world) {
    if (!spec) return;
    const hit = { damage: spec.damage || 24, type: spec.type || 'knockdown', kbX: spec.kbX != null ? spec.kbX : 4, kbY: spec.kbY || 5, hitstun: spec.hitstun || 24 };
    const r = spec.radius || 60;
    this.fireProjectile({ ...spec, noContactHit: true, onExpire: (w, proj) => {
      w.areaHit(proj.x, proj.z, r, hit, this, { shake: 8 });
      w.addFx('dust', proj.x, 0, proj.z, { count: 8 });
      audio.play('crate_drop');
      const drop = spec.drops || (rng.chance(0.5) ? 'meatPie' : 'aetherVial');
      w.add(new Prop('crate', proj.x, clamp(proj.z, w.floorBand.z0, w.floorBand.z1), { drops: drop }));
    } }, world);
  }
  /** Summon escorts just outside the lock (frame.summon = [{ type, variant }]). */
  summon(list, world) {
    if (!list || !world.spawnEnemy) return;
    const cam = world.camera;
    list.forEach((s, i) => {
      const side = i % 2 ? -1 : 1;
      const x = side > 0 ? cam.x + VIEW_W + 30 + i * 20 : cam.x - 30 - i * 20;
      world.spawnEnemy(s.type, s.variant, x, clamp(this.z + (i - 1) * 30, world.floorBand.z0, world.floorBand.z1), { entered: false, facing: -side });
    });
    audio.play('brass_tell');
  }

  // ---------- reactions ----------
  takeHit(hit, attacker) {
    const ai = this.ai;
    const melee = attacker && attacker.kind === 'player' && attacker.state !== ST.SUPER && !hit.projectile && hit.type !== 'grab';
    // Riposte stance (GDD 3 A5): any melee into the stance is parried and answered with the flurry
    if (this.inStance && melee && !this.dead && !this.passiveDummy) { this.riposte(attacker, ai.riposteStance.flurryAnim || ai.riposteAnim); return false; }
    // Random riposte: a melee hit from a player is parried and answered; the rest of that swing whiffs (Fighter.parried)
    if (ai.riposteChance && !this.passiveDummy && this.riposteTimer <= 0 && !this.dead && !this.inHitstun && !this.airborne && (this.state === ST.IDLE || this.state === ST.WALK)
      && melee && this.anim.has(ai.riposteAnim) && rng.chance(ai.riposteChance)) { this.riposteTimer = ai.riposteCooldown; this.riposte(attacker, ai.riposteAnim); return false; }
    // launchStun (Cinder Hulk): an armored brute is stunned by launchers instead of launched
    if (ai.launchStun && hit.type === 'launch' && this.armor && !this.unlaunchable && !this.airborne && !this.dead && this.state !== ST.KNOCKDOWN) {
      hit = { ...hit, type: 'heavy', stagger: true, hitstun: Math.max(8, ai.launchStun - 30), breaksArmor: true };
    }
    // issue #30 ropeDrop: ANY hit on a unit still hanging on its line cuts it. The hit becomes a knockdown whatever
    // it was, so a jab is enough to drop the body out of the sky -- that punish is the entrance's whole point.
    if (!this.dead && hit.type !== 'grab' && isHanging(this)) {
      hit = { ...hit, type: 'knockdown' };
      this.cutLine = true;
    }
    return super.takeHit(hit, attacker);
  }
  riposte(attacker, anim) {
    this.face(attacker); this.pendingAttack = null; this.inStance = false; this.stanceTimer = 0;
    this.parried = { by: attacker, instance: attacker.anim.instance };
    this.currentAttack = { anim, range: 999 };
    this.setState(ST.ATTACK, anim, { fallback: 'attack1' }); this.invuln = Math.max(this.invuln, 6);
    attacker.hitstop = Math.max(attacker.hitstop, 8);
    if (this.world) this.world.addFx('spark', this.x + this.facing * 14, this.y + this.h * 0.6, this.z, { type: 'heavy' });
    audio.play('parry');
  }
  onHurt(hit, attacker) {
    // A STAND/BLOCK dummy is pinned by traits.weight (every knockback path above divides by it), except the
    // armored branch (Fighter.takeHit), which applies a flat `face * 0.5` nudge with no weight divisor at all --
    // over a drill of absorbed hits that walks a BLOCK dummy out of the attack band (review finding).
    if (this.passiveDummy) this.vx = 0;
    const ai = this.ai, world = this.world;
    this.pendingAttack = null; this.releaseToken(world); this.inStance = false;
    this.throwPending = null; dropHeldProp(this); // a hit mid-hold drops a held prop (step 21.6, GDD 7 decision 14)
    // ARRIVING is preserved like FLEE / ENTER / STAGGER: a hit taken mid-entrance must not drop the unit into
    // APPROACH with a half-run path still on it (game/entrances.js decides when an arrival ends).
    if (this.aiState !== 'FLEE' && this.aiState !== 'ENTER' && this.aiState !== 'STAGGER' && this.aiState !== 'ARRIVING') { this.aiState = 'APPROACH'; this.retreating = false; }
    this.attackCooldown = Math.max(this.attackCooldown, 25);
    if (attacker && attacker.kind === 'player') { this.target = attacker; this.retargetTimer = RETARGET; if (attacker.anim) this.hitByInst = attacker.anim.instance; }
    const grounded = !this.airborne && this.state !== ST.KNOCKDOWN && this.state !== ST.LYING;
    const shieldUp = ai.shield && !this.shieldStripped;
    if (!this.dead && ai.staggerEvery && this.hitCount % ai.staggerEvery === 0 && grounded && this.state !== ST.THROWN && !this.traits.staggerEveryNthHit) {
      this.staggerTimer = ai.staggerFrames; this.hurtTimer = ai.staggerFrames; this.chainHits = 0;
      this.setState(ST.HURT, 'stagger', { fallback: 'hurt' });
      audio.play('gear_slip');
    } else if (!this.dead && shieldUp && ai.shield.stripOnLauncher && this.staggerTimer > 0 && hit.type === 'launch') {
      this.shieldStripped = true; this.rig.shieldStripped = true; this.flags.shieldStripped = true; audio.play('prop_break');
      this.traits.superArmor = false; this.traits.noLaunch = false; this.traits.armorFrontOnly = false;
      if (world) {
        world.addFx('ring', this.x, 30, this.z, { r0: 6, r1: 50, color: '#4DF0E0' });
        if (ai.shield.dropProp) world.add(new Prop(ai.shield.dropProp, this.x - this.facing * 24, clamp(this.z + 6, world.floorBand.z0, world.floorBand.z1), { drops: 'none' }));
      }
      this.callHook('onShieldStripped', world);
    }
    const fleeFrac = this.traits.fleeHpFrac || 0.3, fleeChance = this.traits.fleeChance || 0.5;
    if (!this.dead && !this.passiveDummy && ai.fleeHp && this.hp < ai.fleeHp && !this.fled && attacker) {
      this.fled = true; this.fleeTimer = Math.round(ai.fleeDistance / Math.max(1, this.runSpeed * 1.15)); this.fleeDir = -(sign(attacker.x - this.x) || this.facing); this.aiState = 'FLEE';
      audio.play('soot_flee');
    } else if (!this.dead && !this.passiveDummy && ai.fleeLast && !this.fleeChecked && world && this.hp <= this.maxHp * fleeFrac && world.waveEnemies.length === 1 && world.camera.locked) {
      this.fleeChecked = true;
      if (rng.chance(fleeChance)) { this.fleeOff = true; this.fleeing = true; this.entered = false; this.aiState = 'FLEE'; this.fleeDir = (this.x - world.camera.x) < VIEW_W / 2 ? -1 : 1; this.invuln = 30; audio.play('soot_flee'); }
    }
  }

  drawDebug(ctx, cam, labels = true) {
    super.drawDebug(ctx, cam, labels);
    if (!labels) return;
    drawText(ctx, this.aiState + (this.hasToken ? '*' : '') + (this.inStance ? ' RIPOSTE' : '') + (this.punishable ? ' PUNISH' : ''), cam.toScreenX(this.x), FLOOR_TOP + this.z + 12, { size: 1, color: '#ff9', align: 'center' });
  }
}
