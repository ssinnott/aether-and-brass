// Fighter: shared state machine for players, enemies and bosses (ARCHITECTURE.md section 5, GDD section 7).
import { ST, TEAM, GRAVITY, FLOOR_TOP, Z_MIN, Z_MAX, HITSTOP, FIGHTER_DEFAULTS, LAUNCH_VY, JUGGLE_VY, KNOCKDOWN_POP_VY, JUMP_VY, UI } from '../constants.js';
import { Entity } from './entity.js';
import { AnimPlayer } from './animation.js';
import { buildRig, drawRig } from '../art/rig.js';
import { burstHit, burstDust, floatText } from '../art/fx.js';
import { audio } from '../engine/audio.js';
import { clamp, sign } from '../engine/math.js';
import { drawText } from '../engine/text.js';

/** States during which a fighter is "in hitstun" (cannot be grabbed, not actionable). */
export const HITSTUN_STATES = new Set([ST.HURT, ST.HURT_AIR, ST.KNOCKDOWN, ST.LYING, ST.GETUP, ST.GRABBED, ST.THROWN, ST.DEAD]);
/** States that finish when their animation finishes. */
const ACTION_STATES = new Set([ST.ATTACK, ST.JUMP_ATTACK, ST.DASH_ATTACK, ST.SPECIAL, ST.SUPER, ST.DODGE, ST.TAUNT, ST.GETUP]);
const AIR_FALL_STATES = new Set([ST.KNOCKDOWN, ST.HURT_AIR, ST.THROWN]);
const GROUND_FRICTION = 0.82;
const HITSTUN_SCALE_AFTER = 5, HITSTUN_MIN = 8;
const HP_BAR_FRAMES = 90;
/** Frames after which a looping animation in an action state is treated as finished (missing-anim safety net). */
const LOOP_ACTION_LIMIT = 60;
/** Extra i-frames players get after standing up (GDD 7: 30f after get-up). */
const PLAYER_GETUP_INVULN = 30;
/** Hit-stop granted to both sides when an attack passes through a dodge's i-frames (GDD 7). */
const DODGE_THROUGH_HITSTOP = 4;
const THROW_BODY_HIT = { damage: 15, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 20, friendly: true, sfx: 'hit_heavy' };

/**
 * Shared fighter. `def` is a content definition: { id, name, build, anims, maxHp|hp, walkSpeed, runSpeed, jumpVy, moves, grabbable,
 * armor, damageTaken, lyingFrames, grabHoldFrames, drops, score, sfx: { hurt, death } }.
 */
export class Fighter extends Entity {
  constructor(def, { team = TEAM.ENEMY, x = 0, z = 70, facing = 1, kind = 'enemy' } = {}) {
    super(kind);
    this.def = def;
    this.name = def.name || def.id || 'fighter';
    this.team = team;
    this.x = x; this.z = z; this.facing = facing;
    this.rig = buildRig(def.build || {});
    this.anim = new AnimPlayer(def.anims || {});
    this.maxHp = def.maxHp || def.hp || 100;
    this.hp = this.maxHp;
    this.walkSpeed = def.walkSpeed || 1.8;
    this.runSpeed = def.runSpeed || this.walkSpeed * 1.7;
    this.jumpVy = def.jumpVy || JUMP_VY;
    const sc = this.rig.scale;
    this.w = Math.round(28 * sc); this.h = Math.round((this.rig.height || 72) * sc); this.zSize = 20;
    this.shadowW = Math.round(34 * sc);
    this.state = ST.IDLE; this.stateTimer = 0;
    this.invuln = 0; this.hitstop = 0; this.flashTimer = 0; this.busy = 0;
    this.armor = !!def.armor;
    this.damageMult = def.damageMult || 1;
    this.damageTaken = def.damageTaken || 1;
    this.juggleCount = 0; this.juggleGravity = 0; this.juggleImmune = false;
    this.hurtTimer = 0; this.chainHits = 0; this.chainTimer = 0;
    this.lastHitBy = null; this.dead = false; this.deadTimer = 0;
    this.grabTarget = null; this.grabbedBy = null; this.grabHits = 0; this.grabTimer = 0; this.throwPending = null;
    this.hitTargets = new Map(); this.hitInstance = -1; this.hitConfirmed = false;
    this.throwDamage = 0; this.thrownBy = null; this.thrownHit = new Set();
    this.hpBarTimer = 0; this.airActed = false; this.godmode = false; this.superTimer = 0;
    /** Attack instance this fighter parried ({ by, instance }): the rest of that swing whiffs (Duelist riposte, GDD 3). */
    this.parried = null;
    /** Armored fighters with this flag shrug off launch/knockdown hits too (shielded Warden, bosses). */
    this.unlaunchable = !!def.unlaunchable;
    this.play('idle');
  }

  // ---------- helpers ----------
  /** Play an animation (restart by default: every attack must restart). */
  play(name, opts = {}) { return this.anim.play(name, { restart: true, ...opts }); }
  /** Enter a state and play its animation. */
  setState(state, animName = null, opts = {}) {
    this.state = state; this.stateTimer = 0;
    if (animName) this.play(animName, opts);
  }
  get airborne() { return this.y > 0 || this.vy > 0; }
  get inHitstun() { return HITSTUN_STATES.has(this.state); }
  /** True while the fighter may start an action from the ground. */
  get actionable() { return (this.state === ST.IDLE || this.state === ST.WALK || this.state === ST.RUN) && this.busy <= 0 && !this.airborne; }
  get scale() { return this.rig.scale; }

  // ---------- per-step update ----------
  update(world) {
    this.world = world;
    if (this.hitstop > 0) { this.hitstop--; return; }
    if (this.flashTimer > 0) this.flashTimer--;
    if (this.invuln > 0) this.invuln--;
    if (this.hpBarTimer > 0) this.hpBarTimer--;
    if (this.chainTimer > 0 && --this.chainTimer === 0) this.chainHits = 0;
    this.stateTimer++;
    const f = this.anim.frame;
    this.armor = !!(this.def.armor || (f && f.armor) || this.state === ST.SUPER);
    if (f && f.invuln) this.invuln = Math.max(this.invuln, 2);
    this.updateState(world);
    this.think(world);
    this.physics(world);
    this.anim.tick();
    this.processEvents(world);
  }
  /** Controller hook (input / AI). */
  think(world) {}

  updateState(world) {
    const s = this.state, a = this.anim;
    if (this.busy > 0) this.busy--;
    if (s === ST.IDLE) { if (a.name !== 'idle' && a.done) this.play('idle'); return; }
    if (ACTION_STATES.has(s)) {
      if (s === ST.SUPER) this.invuln = Math.max(this.invuln, 2);
      // a looping fallback (missing anim -> idle) would never finish: bail out after a while (the victory 'win' loop is intentional)
      if (a.done || (a.def && a.def.loop && !this.victory && this.stateTimer > LOOP_ACTION_LIMIT)) this.onActionDone(world);
      return;
    }
    if (s === ST.JUMP) { if (this.vy < 0 && a.name === 'jump') this.play('fall', { fallback: 'jump' }); return; }
    if (s === ST.HURT) { if (--this.hurtTimer <= 0) this.setState(ST.IDLE, 'idle'); return; }
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
      if (f.move.vy != null && this.anim.newFrame) { this.vy = f.move.vy; if (this.y <= 0) this.y = 0.01; }
    }
    if (this.grabbedBy) { this.vx = this.vy = this.vz = 0; return; }
    if (this.airborne) {
      this.y += this.vy;
      this.vy -= GRAVITY + this.juggleGravity;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.onLand(world); }
    } else {
      this.vx *= GROUND_FRICTION; this.vz *= GROUND_FRICTION;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
      if (Math.abs(this.vz) < 0.05) this.vz = 0;
    }
    this.x += this.vx; this.z += this.vz;
    this.z = clamp(this.z, Z_MIN, Z_MAX);
    const b = world.boundsFor(this);
    if (this.x < b.x0) { this.x = b.x0; if (AIR_FALL_STATES.has(this.state) && this.vx < -4) this.vx *= -0.5; else if (this.vx < 0) this.vx = 0; }
    else if (this.x > b.x1) { this.x = b.x1; if (AIR_FALL_STATES.has(this.state) && this.vx > 4) this.vx *= -0.5; else if (this.vx > 0) this.vx = 0; }
  }

  onLand(world) {
    const s = this.state;
    this.juggleCount = 0; this.juggleGravity = 0; this.juggleImmune = false; this.airActed = false;
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
      else if (e.type === 'event') this.onAnimEvent(e.name, this.anim.def ? this.anim.def.frames[e.frameIndex] : null, world);
    }
    ev.length = 0;
  }
  /** Animation event hook: (name, frame, world). Handles the generic projectile/shockwave events for every fighter. */
  onAnimEvent(name, frame, world) {
    if (name === 'spawnProjectile') this.fireProjectile(frame && frame.projectile, world);
    else if (name === 'shockwave') {
      const r = (frame && frame.radius) || 40, off = (frame && frame.offset) || 0;
      const hit = (frame && frame.hit) || { damage: 10, type: 'knockdown', kbX: 4, kbY: 4 };
      world.spawnAreaHit(this, this.x + this.facing * off, this.z, r, hit);
      world.addFx('ring', this.x + this.facing * off, 0, this.z, { r1: r, flat: true, color: (frame && frame.color) || '#ffd080' });
      world.addFx('dust', this.x + this.facing * off, 0, this.z, { count: 6 });
      if (world.camera) world.camera.shake((frame && frame.shake) || 4, 8);
    }
  }
  /**
   * Spawn a projectile described by a frame's `projectile` spec (see Player/enemy content for the fields).
   * `spec.aimAt` lobs toward this.aimX/aimZ (set by the AI) with gravity over `spec.flight` frames.
   */
  fireProjectile(spec, world) {
    if (!spec) return;
    const count = spec.count || 1;
    for (let i = 0; i < count; i++) {
      const idx = spec.index != null ? spec.index : i;
      const angle = ((spec.angle || 0) + (count > 1 ? (i - (count - 1) / 2) * (spec.spreadY || 0) : 0)) * Math.PI / 180;
      const speed = spec.speed != null ? spec.speed : 6;
      const o = {
        owner: this, style: spec.style || 'bullet', color: spec.color, life: spec.life, gravity: spec.gravity || 0, pierce: spec.pierce || 0, maxDist: spec.maxDist,
        hit: spec.noContactHit ? null : { damage: spec.damage || 6, type: spec.type || 'light', kbX: spec.kbX != null ? spec.kbX : 3, kbY: spec.kbY || 0, hitstun: spec.hitstun || 14, z: spec.zTol, friendly: spec.friendly },
        explodeHit: spec.explodeHit || null, bounces: spec.bounces || 0, rest: !!spec.rest,
        onExpire: spec.onExpire || null, radius: spec.radius || 40, facing: this.facing, chained: !!spec.chained, r: spec.r,
      };
      if (spec.fromSky) {
        o.x = spec.aimAt ? (this.aimX != null ? this.aimX : this.x) : this.x + this.facing * ((spec.ahead || 40) + idx * (spec.spacing || 40));
        o.y = spec.height || 200; o.z = spec.aimAt ? (this.aimZ != null ? this.aimZ : this.z) : this.z + (spec.zOffset || 0); o.vx = 0; o.vy = 0; o.gravity = spec.gravity || 0.5;
      } else if (spec.aimAt) {
        const T = spec.flight || 50, g = spec.gravity != null ? spec.gravity : 0.5;
        o.x = this.x + this.facing * (spec.offsetX != null ? spec.offsetX : 20); o.y = this.y + (spec.offsetY != null ? spec.offsetY : 40); o.z = this.z;
        const tx = this.aimX != null ? this.aimX : this.x + this.facing * 120, tz = this.aimZ != null ? this.aimZ : this.z;
        o.vx = (tx - o.x) / T; o.vz = (tz - o.z) / T; o.vy = (0.5 * g * T * T - o.y) / T; o.gravity = g;
      } else {
        o.x = this.x + this.facing * (spec.offsetX != null ? spec.offsetX : 20); o.y = this.y + (spec.offsetY != null ? spec.offsetY : 40); o.z = this.z;
        o.vx = Math.cos(angle) * speed * this.facing; o.vy = Math.sin(angle) * speed;
        o.vz = count > 1 ? (i - (count - 1) / 2) * (spec.spreadZ || 0) : (spec.vz || 0);
      }
      // reel: the tagged enemy is pulled into a grab (it is already in hitstun from the claw's own hit, hence ignoreHitstun)
      if (spec.onHit === 'reel') o.onHit = (t) => {
        if (t.kind === 'prop' || t.dead || !t.grabbableBy || !t.grabbableBy(this, { ignoreHitstun: true }) || this.grabTarget) return;
        if (this.state !== ST.DASH_ATTACK && this.state !== ST.ATTACK && !this.actionable) return;
        t.hurtTimer = 0; t.x = this.x + this.facing * (this.def.grabOffset || 24) * this.scale; t.z = this.z; this.startGrab(t);
      };
      else if (typeof spec.onHit === 'function') o.onHit = (t, w, proj) => spec.onHit(t, w, proj, this);
      if (typeof spec.onExpire === 'function') o.onExpire = (w, proj, byHit) => spec.onExpire(w, proj, byHit, this);
      world.spawnProjectile(o);
      if (spec.muzzle !== false && !spec.fromSky) world.addFx('muzzle', o.x, o.y, o.z, { facing: this.facing });
    }
  }

  // ---------- taking hits ----------
  /**
   * Apply a hit. Returns false when invulnerable, dead, friendly or juggle-immune.
   * @param {{damage:number, type?:string, kbX?:number, kbY?:number, hitstun?:number, friendly?:boolean, sfx?:string}} hit
   */
  takeHit(hit, attacker) {
    if (!this.alive || this.dead || this.state === ST.DEAD) return false;
    if (attacker && attacker.team === this.team && !hit.friendly) return false;
    if (this.parried && attacker && attacker.anim && this.parried.by === attacker && this.parried.instance === attacker.anim.instance) return false;
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
    const type = hit.type || 'light';
    const air = this.airborne;
    let dmg = (hit.damage || 0) * (attacker && attacker.damageMult || 1) * this.damageTaken;
    if (air) dmg *= 1.2;
    dmg = Math.max(0, Math.round(dmg));
    if (this.godmode) dmg = 0;
    const hpBefore = this.hp;
    this.hp = Math.max(0, this.hp - dmg);
    this.lastDamage = hpBefore - this.hp; // HP actually lost (no overkill in the results tally)
    this.hpBarTimer = HP_BAR_FRAMES;
    this.flashTimer = 4;
    this.lastHitBy = attacker || this.lastHitBy;
    // a hit on a fighter holding someone frees the held target (GDD 7 "assist"; also clears a stale grabTarget)
    if (this.grabTarget && this.state === ST.GRAB) this.releaseGrab(false);
    const finisher = attacker && attacker.state === ST.SUPER && (type === 'knockdown' || type === 'launch' || hit.finisher);
    const stop = finisher ? HITSTOP.superFinisher : HITSTOP[type] != null ? HITSTOP[type] : HITSTOP.light;
    this.hitstop = Math.max(this.hitstop, stop);
    if (attacker) attacker.hitstop = Math.max(attacker.hitstop, stop);
    const face = attacker ? (sign(this.x - attacker.x) || attacker.facing) : -this.facing;
    const cy = this.y + this.h * 0.6;
    burstHit(this.x - face * 6, cy, this.z, type, face);
    if (this.world) this.world.addFx('spark', this.x - face * 8, cy, this.z, { type });
    if (dmg > 0) this.damageText(dmg, type === 'light' ? '#fff8d0' : '#ffd050', type === 'light' ? 1 : 2);
    if (this.grabbedBy && this.grabbedBy !== attacker) this.grabbedBy.releaseGrab(false);
    if (this.def.sfx && this.def.sfx.hurt) audio.play(this.def.sfx.hurt);
    const cam = this.world ? this.world.camera : null;
    if (cam && (type === 'heavy' || type === 'launch')) cam.shake(3, 6);
    if (cam && type === 'knockdown') cam.shake(4, 8);
    // reactions
    if (this.hp <= 0) { this.dead = true; this.knockDown(Math.max(hit.kbY || 0, KNOCKDOWN_POP_VY), (hit.kbX != null ? Math.max(2, hit.kbX) : 3) * face); this.onHurt(hit, attacker); return true; }
    if (this.armor && ((type !== 'launch' && type !== 'knockdown') || this.unlaunchable) && !hit.breaksArmor) { this.vx += face * 0.5; this.onHurt(hit, attacker); audio.play('armor'); return true; }
    if (air || this.state === ST.KNOCKDOWN) {
      this.juggleCount++;
      // up to maxJuggles (4) air hits; the next one is a hard knockdown and the body is immune until it lands (RECONCILIATION physics row)
      if (this.juggleCount > FIGHTER_DEFAULTS.maxJuggles) { this.juggleImmune = true; this.knockDown(1, face * 3); }
      else { this.juggleGravity += 0.05; this.knockDown(Math.max(JUGGLE_VY, (hit.kbY || 0) * 0.8), face * (hit.kbX != null ? hit.kbX * 0.6 : 2), 'hurtAir'); }
    } else if (type === 'launch') {
      this.knockDown(hit.kbY || LAUNCH_VY, face * (hit.kbX != null ? hit.kbX * 0.5 : 1));
    } else if (type === 'knockdown') {
      this.knockDown(Math.max(hit.kbY || 0, KNOCKDOWN_POP_VY), face * (hit.kbX != null ? hit.kbX : 4));
    } else {
      // flinch / stagger on the ground
      this.chainHits++; this.chainTimer = 60;
      let stun = hit.hitstun || (type === 'heavy' ? FIGHTER_DEFAULTS.hitstunHeavy : FIGHTER_DEFAULTS.hitstunLight);
      if (this.chainHits > HITSTUN_SCALE_AFTER) stun = Math.max(HITSTUN_MIN, stun - 2 * (this.chainHits - HITSTUN_SCALE_AFTER));
      this.hurtTimer = stun;
      this.vx = face * (hit.kbX != null ? hit.kbX : 2);
      this.grabbedBy = null;
      this.setState(ST.HURT, 'hurt');
    }
    this.onHurt(hit, attacker);
    return true;
  }
  /** Launch / knock down with a pop. */
  knockDown(vy, vx, animName = 'knockdown') {
    if (this.grabbedBy) { this.grabbedBy.grabTarget = null; this.grabbedBy = null; }
    this.vy = vy; this.vx = vx; if (this.y <= 0) this.y = 0.01;
    this.setState(ST.KNOCKDOWN, animName, { fallback: 'knockdown' });
  }
  /** Hook after any successful hit (players: combo drop, meter). */
  onHurt(hit, attacker) {}
  /** Hook when one of my hits connects (players: meter, combo). */
  onHitConfirmed(target, hit) { this.hitConfirmed = true; }
  /** Hook when I kill something. */
  onKill(target) {}

  // ---------- grabs & throws ----------
  /**
   * True if this fighter can currently be grabbed by `by`. `ignoreHitstun` lets a grab follow the hit that opened it
   * (Pip's Grapple Shot reels the enemy it just tagged, GDD 2.4).
   */
  grabbableBy(by, { ignoreHitstun = false } = {}) {
    if (!this.alive || this.dead || this.airborne || this.grabbedBy) return false;
    if (!ignoreHitstun && this.inHitstun) return false;
    if (ignoreHitstun && this.state !== ST.HURT && this.inHitstun) return false;
    if (this.def.grabbable === false && !(by.def.grabAll && this.def.grabbableByGrappler !== false)) return false;
    if (this.armor && !by.def.grabAll && this.def.grabbable !== true) return false;
    return true;
  }
  /** Start holding `target`. */
  startGrab(target) {
    this.grabTarget = target; this.grabHits = 0; this.grabTimer = 0; this.throwPending = null;
    target.grabbedBy = this; target.vx = target.vy = target.vz = 0;
    target.setState(ST.GRABBED, 'hurt');
    target.anim.setStaticPose(target.anim.pose);
    this.setState(ST.GRAB, 'grab');
    this.invuln = Math.max(this.invuln, 8);
    audio.play('hit_grab');
  }
  updateGrab(world) {
    const t = this.grabTarget;
    if (t && t.grabbedBy === this && t.alive && !t.dead) {
      const off = (this.def.grabOffset || 24) * this.scale;
      t.x = this.x + this.facing * off; t.z = this.z; t.y = this.def.grabLift || 0; t.facing = -this.facing;
    }
    if (this.throwPending) {
      if (this.stateTimer >= this.throwPending.at) { const tp = this.throwPending; this.throwPending = null; this.doThrow(tp); }
      return;
    }
    if (!t || !t.alive || t.dead || t.grabbedBy !== this) {
      this.grabTarget = null;
      const a = this.anim, throwing = a.name === 'throw' || a.name === 'throwBack';
      if (!throwing || a.done) this.setState(ST.IDLE, 'idle');
      return;
    }
    this.grabTimer++;
    if ((this.anim.name === 'grab' || this.anim.name === 'grabHit') && this.anim.done) this.play('grabHold');
    if (this.grabTimer > (this.def.grabHoldFrames || FIGHTER_DEFAULTS.grabHoldFrames)) this.throwTarget(1);
  }
  /** Hold hit: damage the held target; auto-throws after the move's max hits. */
  grabHit() {
    // enemies without a grabHit move squeeze for 5 per hit, `ai.grabHoldHits` times (GDD 4: Cinder Hulk 4 x 5)
    const t = this.grabTarget, mv = (this.def.moves && this.def.moves.grabHit) || { damage: this.kind === 'player' ? 8 : 5, hits: (this.ai && this.ai.grabHoldHits) || 3 };
    if (!t || this.throwPending) return false;
    this.play('grabHit');
    this.grabHits++;
    t.takeHitRaw(Math.round(mv.damage * (this.def.grabDamageMult || 1) * (t.def.throwDamageMult || 1)), 'medium', this);
    if (this.world) this.world.addFx('spark', t.x, t.y + t.h * 0.6, t.z, { type: 'heavy' });
    this.onHitConfirmed(t, { type: 'heavy', damage: mv.damage });
    if (t.dead) { t.knockDown(KNOCKDOWN_POP_VY, this.facing * 3); this.grabTarget = null; this.setState(ST.IDLE, 'idle'); return true; }
    if (this.grabHits >= (mv.hits || 3)) this.throwTarget(1);
    return true;
  }
  /** Begin a throw (dir +1 forward, -1 back). The target is released a few frames into the throw animation. */
  throwTarget(dir = 1) {
    const mv = (this.def.moves && (dir > 0 ? this.def.moves.throwFwd : this.def.moves.throwBack)) || { damage: 15, vx: 9, vy: 5 };
    const anim = dir < 0 && this.anim.has('throwBack') ? 'throwBack' : 'throw';
    this.play(anim);
    this.stateTimer = 0;
    this.throwPending = { dir, at: mv.releaseAt != null ? mv.releaseAt : 5, mv };
  }
  doThrow({ dir, mv }) {
    const t = this.grabTarget;
    if (!t) { this.setState(ST.IDLE, 'idle'); return; }
    this.grabTarget = null;
    const dmg = Math.round((mv.damage || 15) * (this.def.grabDamageMult || 1));
    if (dir < 0) { t.x = this.x - this.facing * 20; }
    t.thrown(this.facing * dir * (mv.vx || 9), mv.vy != null ? mv.vy : 5, dmg, this);
    if (mv.shockwave && this.world) {
      this.world.addFx('ring', this.x + this.facing * dir * 20, 0, this.z, { r1: mv.shockwave.r || 40, flat: true });
      this.world.spawnAreaHit(this, this.x + this.facing * dir * 20, this.z, mv.shockwave.r || 40, { damage: mv.shockwave.damage || 10, type: 'knockdown', kbX: 4, kbY: 4 }, t);
      if (this.world.camera) this.world.camera.shake(4, 8);
    }
    audio.play('throw');
    this.onHitConfirmed(t, { type: 'throw', damage: dmg });
    if (mv.selfVy) { this.vy = mv.selfVy; this.y = 0.01; }
  }
  /** Let go without a throw (grab broken). */
  releaseGrab(hurt = true) {
    const t = this.grabTarget;
    this.grabTarget = null; this.throwPending = null;
    if (t && t.grabbedBy === this) { t.grabbedBy = null; if (hurt) { t.hurtTimer = 12; t.setState(ST.HURT, 'hurt'); } else t.setState(ST.IDLE, 'idle'); }
    if (this.state === ST.GRAB) this.setState(ST.IDLE, 'idle');
  }
  /** Become a thrown projectile body. */
  thrown(vx, vy, damage, thrower) {
    this.grabbedBy = null; this.thrownBy = thrower; this.thrownHit.clear();
    this.takeHitRaw(Math.round(damage * (this.def.throwDamageMult || 1)), 'throw', thrower);
    this.vx = vx; this.vy = vy; this.y = Math.max(this.y, 1);
    this.setState(ST.THROWN, 'knockdown');
  }
  /** Damage without a state change (hold hits, throws, burns). */
  takeHitRaw(damage, type = 'medium', attacker = null) {
    if (!this.alive || this.dead) return;
    let dmg = Math.round(damage * this.damageTaken * (attacker && attacker.damageMult || 1));
    if (this.godmode) dmg = 0;
    const hpBefore = this.hp;
    this.hp = Math.max(0, this.hp - dmg);
    this.hpBarTimer = HP_BAR_FRAMES; this.flashTimer = 4; this.lastHitBy = attacker || this.lastHitBy;
    const stop = HITSTOP[type] != null ? HITSTOP[type] : HITSTOP.medium;
    this.hitstop = Math.max(this.hitstop, stop); if (attacker) attacker.hitstop = Math.max(attacker.hitstop, stop);
    this.lastDamage = hpBefore - this.hp;
    if (dmg > 0) this.damageText(dmg, '#ffd050', 2);
    if (this.hp <= 0) this.dead = true;
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
    const lying = this.state === ST.LYING;
    const h = lying ? Math.round(this.h * 0.3) : this.h;
    return { x0: this.x - this.w / 2, x1: this.x + this.w / 2, y0: this.y, y1: this.y + h, z0: this.z - this.zSize / 2, z1: this.z + this.zSize / 2 };
  }
  draw(ctx, cam) {
    if (this.state === ST.DEAD && (this.deadTimer % 6) < 3) return;
    const sx = cam.toScreenX(this.x), sy = FLOOR_TOP + this.z - this.y + cam.shakeY;
    let alpha = 1;
    if (this.invuln > 0 && this.kind === 'player' && !this.armor && this.state !== ST.DODGE && (this.world.frame % 4) < 2) alpha = 0.45;
    if (this.state === ST.DEAD) alpha *= Math.max(0.2, this.deadTimer / FIGHTER_DEFAULTS.deadBlinkFrames);
    drawRig(ctx, this.rig, this.anim.pose, { x: sx, y: sy, facing: this.facing, flash: this.flashTimer > 0, alpha, tint: this.tint || null, tintAlpha: this.tintAlpha });
    if (this.team === TEAM.ENEMY && this.hpBarTimer > 0 && !this.dead && this.kind !== 'boss') {
      const w = this.def.elite ? 60 : 40, hh = this.def.elite ? 4 : 3, top = Math.round(sy - this.h - 10);
      ctx.fillStyle = '#120c14'; ctx.fillRect(sx - w / 2 - 1, top - 1, w + 2, hh + 2);
      ctx.fillStyle = '#5a1a1a'; ctx.fillRect(sx - w / 2, top, w, hh);
      ctx.fillStyle = this.hp / this.maxHp > 0.3 ? UI.hp : UI.hpLow; ctx.fillRect(sx - w / 2, top, Math.round(w * this.hp / this.maxHp), hh);
      if (this.def.elite) drawText(ctx, this.name, sx, top - 9, { size: 1, color: UI.paper, align: 'center' });
    }
  }
  /** Debug: draw hurtbox and current hitbox. */
  drawDebug(ctx, cam) {
    const hb = this.hurtbox();
    if (hb) { ctx.strokeStyle = 'rgba(80,200,255,0.8)'; ctx.strokeRect(cam.toScreenX(hb.x0), FLOOR_TOP + this.z - hb.y1, hb.x1 - hb.x0, hb.y1 - hb.y0); }
    const list = this.hitboxes();
    for (const h of list) { const b = worldHitbox(this, h); ctx.strokeStyle = 'rgba(255,80,80,0.9)'; ctx.strokeRect(cam.toScreenX(b.x0), FLOOR_TOP + this.z - b.y1, b.x1 - b.x0, b.y1 - b.y0); }
    drawText(ctx, `${this.state}${this.hitstop ? ' HS' : ''}`, cam.toScreenX(this.x), FLOOR_TOP + this.z + 4, { size: 1, color: '#9f9', align: 'center' });
  }
  /** Current frame hitboxes (0, 1 or many). */
  hitboxes() {
    const f = this.anim.frame;
    if (!f || this.hitstop > 0) return NO_HITBOXES;
    if (f.hitboxes) return f.hitboxes;
    return f.hitbox ? [f.hitbox] : NO_HITBOXES;
  }
}
const NO_HITBOXES = Object.freeze([]);

/** Convert a local hitbox (feet origin, y negative up, +x toward facing) to a world AABB. */
export function worldHitbox(owner, hb) {
  const f = owner.facing;
  const lx0 = f > 0 ? hb.x : -(hb.x + hb.w);
  return { x0: owner.x + lx0, x1: owner.x + lx0 + hb.w, y0: owner.y - (hb.y + hb.h), y1: owner.y - hb.y, z: hb.z != null ? hb.z : 24 };
}
