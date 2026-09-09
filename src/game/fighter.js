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
// ================================ FRAME FIELDS honoured by the core ==================================================
//  hitbox { x, y, w, h, z, type: light|medium|heavy|launch|knockdown|grab|throw, damage, kbX, kbY, hitstun, once, rehit, multiHit: N,
//           friendly, hitsBehind (mirrored copy), maxTargets, pierceDamage (damage for the 2nd+ target), reaction: flinch|stagger|launch|knockdown,
//           stagger, status: { burn: {...} }, element: 'fire', groundedOnly, otg, unblockable, breaksArmor, onHit: 'rebound'|name, sfx,
//           fromX (world x the hit came from: knockback pushes away from it instead of off the victim's facing — stage hazards),
//           groundBounce: true|vy (an airborne / knocked-down target bounces off the floor once more: Brunhild slam, Rook hip toss),
//           extinguish: true (removes fire puddles the box touches: Pip's Steam Vent) }
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
import { ST, TEAM, GRAVITY, FLOOR_TOP, Z_MIN, Z_MAX, HITSTOP, FIGHTER_DEFAULTS, LAUNCH_VY, JUGGLE_VY, KNOCKDOWN_POP_VY, JUMP_VY, UI, VIEW_W } from '../constants.js';
import { Entity } from './entity.js';
import { AnimPlayer } from './animation.js';
import { buildRig, drawRig } from '../art/rig.js';
import { burstHit, burstDust, floatText } from '../art/fx.js';
import { audio } from '../engine/audio.js';
import { clamp, sign } from '../engine/math.js';
import { drawText, measureText } from '../engine/text.js';
import { applyStatus, clearStatus, tickStatuses, tickFrozen, drawStatuses, statusTint } from './status.js';
import { normalizeTraits } from './traits.js';
import { grabMethods, BOUNCE_VY } from './grabs.js';

export { normalizeTraits };

/** States during which a fighter is "in hitstun" (cannot be grabbed, not actionable). */
export const HITSTUN_STATES = new Set([ST.HURT, ST.HURT_AIR, ST.KNOCKDOWN, ST.LYING, ST.GETUP, ST.GRABBED, ST.THROWN, ST.DEAD]);
/** States that finish when their animation finishes. */
const ACTION_STATES = new Set([ST.ATTACK, ST.JUMP_ATTACK, ST.DASH_ATTACK, ST.SPECIAL, ST.SUPER, ST.DODGE, ST.TAUNT, ST.GETUP]);
/** Airborne fall states that land as a knockdown. */
export const AIR_FALL_STATES = new Set([ST.KNOCKDOWN, ST.HURT_AIR, ST.THROWN]);
const GROUND_FRICTION = 0.82;
const HITSTUN_SCALE_AFTER = 5, HITSTUN_MIN = 8, STAGGER_EXTRA = 30;
const HP_BAR_FRAMES = 90;
/** Frames after which a looping animation in an action state is treated as finished (missing-anim safety net). */
const LOOP_ACTION_LIMIT = 60;
/** Extra i-frames players get after standing up (GDD 7: 30f after get-up). */
const PLAYER_GETUP_INVULN = 30;
/** Hit-stop granted to both sides when an attack passes through a dodge's i-frames (GDD 7). */
const DODGE_THROUGH_HITSTOP = 4;
const THROW_BODY_HIT = { damage: 15, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 20, friendly: true, body: true, sfx: 'hit_heavy' };
const NO_HITBOXES = Object.freeze([]);
const REACTION_TYPE = { flinch: 'light', stagger: 'medium', launch: 'launch', knockdown: 'knockdown' };

/**
 * Shared fighter. `def` is a content definition: { id, name, build, anims, maxHp|hp, walkSpeed, runSpeed, jumpVy, moves, hooks, traits,
 * projectiles, hurtParts, lyingFrames, grabHoldFrames, grabOffset, drops, score, sfx: { hurt, death } } (+ the legacy flags of TRAITS).
 */
export class Fighter extends Entity {
  constructor(def, { team = TEAM.ENEMY, x = 0, z = 70, facing = 1, kind = 'enemy' } = {}) {
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
    this.state = ST.IDLE; this.stateTimer = 0;
    this.invuln = 0; this.hitstop = 0; this.flashTimer = 0; this.busy = 0;
    this.armor = this.traits.superArmor; this.armorHits = 0; this.armorInstance = -1; this.armorSuppressed = false;
    this.juggleCount = 0; this.juggleGravity = 0; this.juggleImmune = false;
    this.hurtTimer = 0; this.chainHits = 0; this.chainTimer = 0; this.hitCount = 0;
    this.lastHitBy = null; this.dead = false; this.deadTimer = 0; this.deathHooked = false;
    this.grabTarget = null; this.grabbedBy = null; this.grabHits = 0; this.grabTimer = 0; this.throwPending = null;
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
  applyDef(def) {
    this.def = def;
    this.traits = normalizeTraits(def);
    this.maxHp = def.maxHp || def.hp || 100;
    this.walkSpeed = def.walkSpeed || 1.8;
    this.runSpeed = def.runSpeed || this.walkSpeed * 1.7;
    this.jumpVy = def.jumpVy || JUMP_VY;
    this.damageMult = def.damageMult || 1;
    this.damageTaken = this.traits.damageTakenMult;
    this.unlaunchable = this.traits.noLaunch;
  }

  // ---------- helpers ----------
  /** Play an animation (restart by default: every attack must restart). */
  play(name, opts = {}) { return this.anim.play(name, { restart: true, ...opts }); }
  /** Enter a state and play its animation. */
  setState(state, animName = null, opts = {}) {
    const prev = this.state;
    this.state = state; this.stateTimer = 0;
    if (animName) this.play(animName, opts);
    if (prev !== state) this.callHook('onStateEnter', state, prev);
  }
  /** Call def.hooks[name](this, ...args) when defined. Returns the hook's result (undefined when absent). */
  callHook(name, ...args) { const h = this.def.hooks && this.def.hooks[name]; return h ? h(this, ...args) : undefined; }
  get airborne() { return this.y > 0 || this.vy > 0; }
  get inHitstun() { return HITSTUN_STATES.has(this.state); }
  /** True while the fighter may start an action from the ground. */
  get actionable() { return (this.state === ST.IDLE || this.state === ST.WALK || this.state === ST.RUN) && this.busy <= 0 && !this.airborne && !this.status.netted; }
  get scale() { return this.rig.scale; }
  /** Status API (status.js): burn / netted / stunned / timeStopped / custom. */
  applyStatus(name, opts = {}, source = null) { return applyStatus(this, name, opts, source); }
  hasStatus(name) { return !!this.status[name]; }
  clearStatus(name) { clearStatus(this, name, this.world); }

  // ---------- per-step update ----------
  update(world) {
    this.world = world;
    if (!this.spawned) { this.spawned = true; this.callHook('onSpawn', world); if (this.def.onSpawn) this.def.onSpawn(this, world); }
    if (this.hitstop > 0) { this.hitstop--; return; }
    if (tickFrozen(this, world)) return;
    if (this.flashTimer > 0) this.flashTimer--;
    if (this.invuln > 0) this.invuln--;
    if (this.hpBarTimer > 0) this.hpBarTimer--;
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
  think(world) {}
  /** Armor = super armor trait, SUPER state, or the current frame's `armor` (true / N hits per attack instance). */
  refreshArmor(f) {
    let frameArmor = false;
    if (f && f.armor) {
      if (this.armorInstance !== this.anim.instance) { this.armorInstance = this.anim.instance; this.armorHits = typeof f.armor === 'number' ? f.armor : (this.traits.armorHits || Infinity); }
      frameArmor = this.armorHits > 0;
    }
    this.armor = !this.armorSuppressed && (this.traits.superArmor || frameArmor || this.state === ST.SUPER);
  }
  /** Apply the declarative fields of every frame entered since the last step (spawn / area / teleport / lockOn / meter). */
  syncFrameFields(world) {
    const a = this.anim;
    if (!a.def) return;
    if (a.instance !== this.ffInstance || a.frameIndex < this.ffIndex) { this.ffInstance = a.instance; this.ffIndex = -1; }
    for (let i = this.ffIndex + 1; i <= a.frameIndex; i++) this.applyFrameFields(a.def.frames[i], world);
    this.ffIndex = a.frameIndex;
  }
  applyFrameFields(f, world) {
    if (!f) return;
    if (f.spawn) this.spawnFromFrame(f.spawn, world);
    if (f.area) this.areaFromFrame(f.area, world);
    if (f.teleport) this.teleportTo(f.teleport, world);
    if (f.lockOn) this.lockOn(f.lockOn, world);
    if (f.meter && this.addMeter) this.addMeter(f.meter.amount || f.meter);
  }

  updateState(world) {
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
  onActionDone(world) {
    if (this.airborne) this.setState(ST.JUMP, 'fall', { fallback: 'jump' });
    else this.setState(ST.IDLE, 'idle');
  }

  physics(world) {
    const f = this.anim.frame;
    if (f && f.move && !this.grabbedBy) {
      this.x += (f.move.x || 0) * this.facing;
      if (f.move.z) this.z += f.move.z;
      const vy = f.move.vy != null ? f.move.vy : f.move.y;
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
    const b = world.boundsFor(this);
    if (this.x < b.x0) { this.x = b.x0; if (AIR_FALL_STATES.has(this.state) && this.vx < -4) this.vx *= -0.5; else if (this.vx < 0) this.vx = 0; }
    else if (this.x > b.x1) { this.x = b.x1; if (AIR_FALL_STATES.has(this.state) && this.vx > 4) this.vx *= -0.5; else if (this.vx > 0) this.vx = 0; }
  }

  onLand(world) {
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

  processEvents(world) {
    const ev = this.anim.events;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === 'sfx') audio.play(e.name);
      else if (e.type === 'fx') world.addFx(e.value.kind, this.x + (e.value.x || 0) * this.facing, -(e.value.y || 0), this.z, { facing: this.facing, ...e.value });
      else if (e.type === 'event') { const fr = this.anim.def ? this.anim.def.frames[e.frameIndex] : null; if (this.callHook('onAnimEvent', e.name, fr, world) !== true) this.onAnimEvent(e.name, fr, world); }
    }
    ev.length = 0;
  }
  /** Animation event hook: (name, frame, world). Handles the generic projectile / area / teleport / lock-on events for every fighter. */
  onAnimEvent(name, frame, world) {
    if (name === 'spawnProjectile') this.fireProjectile(frame && frame.projectile, world);
    else if (name === 'shockwave' || name === 'area') this.areaFromFrame((frame && frame.area) || frame || {}, world);
    else if (name === 'teleport' || name === 'teleportBehind') this.teleportTo((frame && frame.teleport) || { behind: true }, world);
    else if (name === 'lockOn') this.lockOn((frame && frame.lockOn) || { range: (frame && frame.radius) || 60 }, world);
    else if (name === 'meterGain' && this.addMeter) this.addMeter((frame && frame.amount) || 25);
  }
  /** Resolve a projectile spec: a string looks up def.projectiles[name]. */
  projectileSpec(spec) { return typeof spec === 'string' ? (this.def.projectiles && this.def.projectiles[spec]) || null : spec; }
  /** Spawn the projectile(s) described by a frame's `projectile` spec (fields: see projectile.js / the FRAME FIELDS table). */
  fireProjectile(spec, world, o = {}) {
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
  spawnFromFrame(sp, world) {
    const o = {};
    if (sp.x != null) o.x = this.x + this.facing * sp.x;
    if (sp.y != null) o.y = this.y + sp.y;
    if (sp.z != null) o.z = this.z + sp.z;
    if (sp.aimAt && this.aimX == null && world.nearestEnemy) { const e = world.nearestEnemy(this.x, this.z, { team: this.team === TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER }); if (e) { o.aimX = e.x; o.aimZ = e.z; } }
    this.fireProjectile(sp.count ? { ...this.projectileSpec(sp.projectile), count: sp.count } : sp.projectile, world, o);
  }
  /** Frame `area` / 'shockwave' event: radius, offset (x), hit fields. */
  areaFromFrame(a, world) {
    const r = a.radius || 40, off = a.offset != null ? a.offset : (a.x || 0);
    const hit = a.hit || (a.damage != null ? { damage: a.damage, type: a.type || 'knockdown', kbX: a.kbX != null ? a.kbX : 4, kbY: a.kbY != null ? a.kbY : 4, hitstun: a.hitstun || 20, status: a.status, friendly: a.friendly, groundedOnly: a.groundedOnly, element: a.element }
      : { damage: 10, type: 'knockdown', kbX: 4, kbY: 4 });
    world.areaHit(this.x + this.facing * off, this.z, r, hit, this, { teams: a.teams, y: a.y, shake: a.shake != null ? a.shake : 4, color: a.color, silent: a.silent, exclude: this.grabTarget });
  }
  /** Teleport next to the nearest enemy: `behind` (default) lands at its back facing the same way. Returns the target or null. */
  teleportTo(spec, world) {
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
    world.addFx('ring', this.x, 30, this.z, { r0: 4, r1: 40, color: col });
    if (spec.sfx !== false) audio.play(spec.sfx || 'aether_step');
    return e;
  }
  /** Turn toward (and snap part of the way to) the nearest enemy within `range`. */
  lockOn(spec, world) {
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
  takeHit(hit, attacker) {
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
      if (this.state === ST.DODGE && attacker && attacker.anim && this.dodgedInstance !== attacker.anim.instance) {
        this.dodgedInstance = attacker.anim.instance;
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
    if (hit.body || hit.type === 'throw') dmg *= tr.throwDamageTakenMult; // thrown bodies count as throws (Brassbound 1.5x, GDD 3)
    if (attacker && attacker.kind === 'player' && attacker.airborne) dmg *= tr.jumpAttackTakenMult;
    if (part && part.damageMult) dmg *= part.damageMult;
    if (this.punishable && this.punishMult > 1) dmg *= this.punishMult;
    if (air) dmg *= 1.2;
    dmg = Math.max(0, Math.round(dmg));
    if (this.godmode) dmg = 0;
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
      this.vx += face * 0.5; this.onHurt(hit, attacker); audio.play('armor'); return true;
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
  parry(attacker, hit) {
    const p = this.traits.parry;
    this.parried = { by: attacker, instance: attacker.anim.instance };
    this.setState(ST.IDLE, 'parry', { fallback: 'idle' }); this.busy = 6; this.invuln = Math.max(this.invuln, 10);
    this.hitstop = Math.max(this.hitstop, p.hitstop || 8); attacker.hitstop = Math.max(attacker.hitstop, p.hitstop || 8);
    if (attacker.applyStatus && !attacker.dead) attacker.applyStatus('stunned', { frames: p.stun || 40 }, this);
    if (this.addMeter) this.addMeter(p.meter || 15);
    if (this.world) { this.world.addFx('spark', this.x + this.facing * 14, this.y + this.h * 0.6, this.z, { type: 'heavy' }); this.world.addFx('ring', this.x + this.facing * 10, 40, this.z, { r0: 4, r1: 36, color: '#ffffff' }); }
    floatText(this.x, this.y + this.h + 10, this.z, 'PARRY!', '#ffffff', 2);
    audio.play('parry');
    this.callHook('onParry', attacker, hit);
  }
  /** Launch / knock down with a pop. */
  knockDown(vy, vx, animName = 'knockdown') {
    if (this.grabbedBy) { this.grabbedBy.grabTarget = null; this.grabbedBy = null; }
    this.vy = vy; this.vx = vx; if (this.y <= 0) this.y = 0.01;
    this.setState(ST.KNOCKDOWN, animName, { fallback: 'knockdown' });
  }
  /** Mark dead and fire the death hooks once (before the body lands). */
  die() {
    this.dead = true;
    if (this.deathHooked) return;
    this.deathHooked = true;
    this.onDied(this.world);
  }
  onDied(world) {
    this.callHook('onDeath', world);
    if (this.def.onDeath) this.def.onDeath(this, world);
    if (!world) return;
    const ex = this.def.explodeOnDeath;
    if (ex) world.spawnProjectile({ kind: 'fuse', style: 'bomb', life: ex.delay || 30, onExpire: 'explode', radius: ex.radius || 40, noContactHit: true, r: 7, color: ex.color || '#8a4a2a', offsetX: 0, offsetY: 0,
      explodeHit: { damage: ex.damage || 15, type: 'knockdown', kbX: 5, kbY: 5, friendly: ex.friendly !== false, element: ex.element } }, this, this.x, 0, this.z);
    if (this.def.deathSpawn) for (const d of this.def.deathSpawn) this.fireProjectile(d.projectile, world, { x: this.x + (d.dx || 0), y: d.y || 0, z: this.z + (d.dz || 0) });
  }
  /** Hook after any successful hit (players: combo drop, meter). */
  onHurt(hit, attacker) {}
  /** Hook when one of my hits connects (players: meter, combo). */
  onHitConfirmed(target, hit) { this.hitConfirmed = true; this.callHook('onHitDealt', target, hit, this.world); }
  /** Hook when I kill something. */
  onKill(target) { this.callHook('onKill', target); }

  // ---------- grabs & throws: see grabs.js (grabbableBy, startGrab, updateGrab, grabHit, throwTarget, doThrow, releaseGrab, thrown) ----------
  /** Damage without a state change (hold hits, throws, burns). opts: { noStop, fire, silent }. */
  takeHitRaw(damage, type = 'medium', attacker = null, opts = {}) {
    if (!this.alive || this.dead) return;
    let dmg = Math.round(damage * this.damageTaken * (attacker && attacker.damageMult || 1));
    if (this.godmode) dmg = 0;
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
      if (!this.grabbedBy && this.state !== ST.KNOCKDOWN && this.state !== ST.THROWN) this.knockDown(KNOCKDOWN_POP_VY, -this.facing * 2);
    }
  }
  /** Floating damage number; consecutive numbers are staggered so multi-hits stay legible. */
  damageText(dmg, color, size) {
    const j = this.textJitter = ((this.textJitter || 0) + 1) % 3;
    const spread = 9 * Math.max(1, this.scale); // big rigs (bosses) take many hits per second: fan the numbers wider
    floatText(this.x + (j - 1) * spread, this.y + this.h + 6 + j * 7, this.z, String(dmg), color, size);
  }
  /** Hook: an attack passed through this fighter's dodge i-frames (players gain meter). */
  onDodged(attacker) {}
  /** Hit data used when this thrown body collides with others. */
  get bodyHit() { return THROW_BODY_HIT; }

  // ---------- rendering ----------
  hurtbox() {
    if (!this.alive || this.state === ST.DEAD) return null;
    const lying = this.state === ST.LYING, fr = this.anim.frame;
    const k = fr && fr.hurtboxScale != null ? fr.hurtboxScale : 1;
    const h = lying ? Math.round(this.h * 0.3) : Math.round(this.h * k);
    return { x0: this.x - this.w / 2, x1: this.x + this.w / 2, y0: this.y, y1: this.y + h, z0: this.z - this.zSize / 2, z1: this.z + this.zSize / 2 };
  }
  /** Hittable boxes: the whole body, or the active `def.hurtParts` (each box carries `.part` for damage multipliers). */
  hurtboxes() {
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
  draw(ctx, cam) {
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
  /** Debug: draw hurtboxes and current hitboxes. */
  drawDebug(ctx, cam) {
    for (const hb of this.hurtboxes()) { ctx.strokeStyle = hb.part ? 'rgba(255,220,80,0.9)' : 'rgba(80,200,255,0.8)'; ctx.strokeRect(cam.toScreenX(hb.x0), FLOOR_TOP + this.z - hb.y1, hb.x1 - hb.x0, hb.y1 - hb.y0); }
    const list = this.hitboxes();
    for (const h of list) { const b = worldHitbox(this, h); ctx.strokeStyle = 'rgba(255,80,80,0.9)'; ctx.strokeRect(cam.toScreenX(b.x0), FLOOR_TOP + this.z - b.y1, b.x1 - b.x0, b.y1 - b.y0); }
    const stn = Object.keys(this.status).join(',');
    drawText(ctx, `${this.state}${this.hitstop ? ' HS' : ''}${this.armor ? ' A' : ''}${stn ? ' ' + stn : ''}`, cam.toScreenX(this.x), FLOOR_TOP + this.z + 4, { size: 1, color: '#9f9', align: 'center' });
  }
  /** Current frame hitboxes (0, 1 or many); `hitsBehind` boxes add a mirrored copy, `multiHit: N` = once:false + rehit N. */
  hitboxes() {
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

Object.assign(Fighter.prototype, grabMethods);

/** Convert a local hitbox (feet origin, y negative up, +x toward facing) to a world AABB. */
export function worldHitbox(owner, hb) {
  const f = owner.facing;
  const lx0 = f > 0 ? hb.x : -(hb.x + hb.w);
  return { x0: owner.x + lx0, x1: owner.x + lx0 + hb.w, y0: owner.y - (hb.y + hb.h), y1: owner.y - hb.y, z: hb.z != null ? hb.z : 24 };
}
