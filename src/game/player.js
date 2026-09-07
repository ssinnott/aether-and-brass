// Player: input -> intent -> state transitions (ARCHITECTURE.md section 5, GDD section 7 combat rules).
import { ST, TEAM, METER, FIGHTER_DEFAULTS, VIEW_W, Z_SPEED_FACTOR, Z_MAX, KNOCKDOWN_POP_VY, UI } from '../constants.js';
import { Fighter } from './fighter.js';
import { botIntent } from './bot.js';
import { audio } from '../engine/audio.js';
import { clamp, sign } from '../engine/math.js';
import { floatText } from '../art/fx.js';

const DOUBLE_TAP_FRAMES = 12;
const DODGE_FRAMES = 20, DODGE_DIST = 60, DODGE_IFRAMES = 12, DODGE_COOLDOWN = 6;
const GRADES = [[60, 'AETHERIC', '#ffffff'], [35, 'STEAMED', '#4DF0E0'], [20, 'BRASSY', '#ff9a30'], [10, 'SPARKY', '#ffe45a'], [3, 'SOOTY', '#c8c8c8']];
const AIR_HIT_COMBO = 2;

/** Combo grade word + colour for a hit count (GDD 7): null below 3. */
export function comboGrade(n) { for (const g of GRADES) if (n >= g[0]) return { word: g[1], color: g[2] }; return null; }

/** A human (or bot) controlled fighter. */
export class Player extends Fighter {
  /**
   * @param {object} def character definition (content/characters)
   * @param {number} index player slot 0|1
   * @param {{ input: object, x?: number, z?: number, facing?: number, bot?: boolean, godmode?: boolean, lives?: number }} o
   */
  constructor(def, index, { input, x = 100, z = 70, facing = 1, bot = false, godmode = false, lives = 3 } = {}) {
    super(def, { team: TEAM.PLAYER, kind: 'player', x, z, facing });
    this.index = index;
    this.input = input;
    this.bot = bot;
    this.godmode = godmode;
    this.lives = lives;
    this.meter = 0; this.score = 0;
    this.combo = 0; this.comboTimer = 0; this.comboScale = 1; this.maxCombo = 0; this.grade = null; this.gradeTimer = 0;
    this.kills = 0; this.damageTakenTotal = 0; this.continuesUsed = 0;
    this.comboStep = 0;
    this.comboLength = 0; for (let i = 1; i <= 6; i++) if (this.anim.has('attack' + i)) this.comboLength = i;
    this.running = false; this.runDir = 0; this.tapDir = 0; this.tapFrame = -100; this.frameCount = 0;
    this.dodgeCooldown = 0; this.dodgeDx = 0; this.dodgeDz = 0;
    this.jumpsLeft = 0; this.airShotUsed = false;
    this.out = false; this.respawnTimer = 0;
    this.lastTarget = null; this.blinkHit = new Set(); this.heldBody = null;
    this.intent = { x: 0, y: 0, attack: false, jump: false, special: false, super: false, dodge: false, taunt: false, run: false, start: false };
    this.grabReach = def.grabReach || 20;
  }

  // ---------- intent ----------
  readIntent(world) {
    this.frameCount++;
    if (this.bot) { this.intent = botIntent(this, world); return; }
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
    for (const dir of [-1, 1]) {
      if (inp.pressed(p, dir < 0 ? 'left' : 'right')) {
        if (this.tapDir === dir && this.frameCount - this.tapFrame <= DOUBLE_TAP_FRAMES) { this.running = true; this.runDir = dir; }
        this.tapDir = dir; this.tapFrame = this.frameCount;
      }
    }
  }
  consume(action) { if (!this.bot) this.input.consume(this.index, action); else this.intent[action] = false; }

  // ---------- think ----------
  think(world) {
    this.readIntent(world);
    if (this.out || this.dead) return;
    const it = this.intent;
    if (this.dodgeCooldown > 0) this.dodgeCooldown--;
    if (it.run && it.x) { this.running = true; this.runDir = it.x; }
    if (this.running && it.x !== this.runDir) this.running = false;
    switch (this.state) {
      case ST.IDLE: case ST.WALK: case ST.RUN: this.thinkGround(world); break;
      case ST.ATTACK: case ST.DASH_ATTACK: this.thinkAttack(world); break;
      case ST.JUMP: this.thinkAir(world, true); break;
      case ST.JUMP_ATTACK: this.thinkAir(world, false); break;
      case ST.GRAB: this.thinkGrab(); break;
      case ST.DODGE: this.thinkDodge(); break;
      case ST.SUPER: this.thinkSuper(); break;
      default: break;
    }
  }
  thinkGround(world) {
    const it = this.intent;
    if (this.busy > 0) return;
    if (it.super && this.meter >= METER.super) { this.consume('super'); this.startSuper(world); return; }
    if (it.special) { this.consume('special'); this.trySpecial(world); return; }
    if (it.attack) {
      this.consume('attack');
      if (this.running && this.anim.has('dashAttack')) { this.startDashAttack(); return; }
      const g = this.findGrabTarget(world);
      if (g) { this.startGrab(g); return; }
      this.startAttack(1); return;
    }
    if (it.jump) { this.consume('jump'); this.jump(); return; }
    if (it.dodge && this.dodgeCooldown <= 0) { this.startDodge(); return; }
    if (it.taunt) { this.setState(ST.TAUNT, 'taunt'); return; }
    if (it.x || it.y) {
      const speed = this.running ? this.runSpeed : this.walkSpeed;
      this.x += it.x * speed;
      this.z = clamp(this.z + it.y * speed * Z_SPEED_FACTOR, 0, Z_MAX);
      if (it.x) this.facing = it.x;
      const st = this.running ? ST.RUN : ST.WALK;
      if (this.state !== st) { this.state = st; this.play(this.running ? 'run' : 'walk', { restart: false }); }
    } else if (this.state !== ST.IDLE) { this.running = false; this.setState(ST.IDLE, 'idle', { restart: false }); }
  }
  thinkAttack(world) {
    const it = this.intent, a = this.anim;
    const canCancel = !!a.cancel || a.done;
    if (!canCancel) return;
    if (it.super && this.meter >= METER.super) { this.consume('super'); this.startSuper(world); return; }
    if (it.attack && this.state === ST.ATTACK && this.comboStep > 0 && this.comboStep < this.comboLength && (this.hitConfirmed || this.def.freeChain !== false)) {
      this.consume('attack'); this.startAttack(this.comboStep + 1); return;
    }
    if (it.attack && this.state === ST.DASH_ATTACK && a.cancel === 'attack') { this.consume('attack'); this.startAttack(1); return; }
    if (it.dodge && this.dodgeCooldown <= 0) { this.startDodge(); return; }
    if (it.jump && (a.cancel === 'any' || a.cancel === 'jump')) { this.consume('jump'); this.jump(); return; }
    if (it.special && a.cancel === 'any') { this.consume('special'); this.trySpecial(world); }
  }
  thinkAir(world, canAttack) {
    const it = this.intent;
    if (it.x) { this.x += it.x * this.walkSpeed * 0.9; this.facing = this.airFacingLocked ? this.facing : it.x; }
    if (it.y) this.z = clamp(this.z + it.y * this.walkSpeed * 0.3, 0, Z_MAX);
    if (canAttack && it.attack && !this.airActed) { this.consume('attack'); this.jumpAttack(); return; }
    if (!canAttack && it.attack && !this.airShotUsed && this.anim.has('jumpAttack2') && this.anim.done) { this.consume('attack'); this.airShotUsed = true; this.play('jumpAttack2'); return; }
    if (it.jump && this.jumpsLeft > 0 && this.state === ST.JUMP) { this.consume('jump'); this.jumpsLeft--; this.vy = this.jumpVy * 0.9; this.play('jump'); audio.play('jump'); world.addFx('dust', this.x, 0, this.z, { count: 4 }); }
  }
  thinkGrab() {
    const it = this.intent;
    if (!this.grabTarget || this.throwPending || (this.anim.name === 'grab' && !this.anim.done)) return;
    if (!it.attack) return;
    this.consume('attack');
    if (it.x === this.facing) this.throwTarget(1);
    else if (it.x === -this.facing) this.throwTarget(-1);
    else this.grabHit();
  }
  thinkDodge() {
    if (this.stateTimer <= DODGE_FRAMES) { this.x += this.dodgeDx; this.z = clamp(this.z + this.dodgeDz, 0, Z_MAX); }
    if (this.stateTimer === 1) this.invuln = Math.max(this.invuln, DODGE_IFRAMES);
  }
  thinkSuper() {
    const b = this.heldBody;
    if (b && b.grabbedBy === this) { b.x = this.x + this.facing * 34; b.z = this.z; b.y = 30; b.facing = -this.facing; }
  }

  // ---------- actions ----------
  startAttack(step) {
    this.comboStep = step; this.hitConfirmed = false; this.running = false;
    this.setState(ST.ATTACK, 'attack' + step, { fallback: 'attack1' });
  }
  startDashAttack() { this.running = false; this.hitConfirmed = false; this.comboStep = 0; this.setState(ST.DASH_ATTACK, 'dashAttack'); }
  jump() {
    this.vy = this.jumpVy; this.y = 0.01; this.airActed = false; this.airShotUsed = false;
    this.jumpsLeft = this.def.doubleJump ? 1 : 0;
    this.setState(ST.JUMP, 'jump'); audio.play('jump');
  }
  jumpAttack() {
    this.airActed = true; this.hitConfirmed = false;
    this.landAttackPending = this.anim.has('landAttack');
    this.setState(ST.JUMP_ATTACK, 'jumpAttack');
  }
  trySpecial(world) {
    if (!this.anim.has('special')) return;
    if (this.meter >= METER.special) this.meter -= METER.special;
    else if (this.hp > this.maxHp * METER.hpCostMinFrac) { if (!this.godmode) this.hp = Math.max(1, this.hp - Math.round(this.maxHp * METER.hpCostFrac)); floatText(this.x, this.y + this.h + 10, this.z, 'HP!', UI.red, 1); }
    else { audio.play('whiff'); return; }
    this.running = false; this.hitConfirmed = false;
    this.setState(ST.SPECIAL, 'special');
    audio.play(this.def.sfx && this.def.sfx.special || 'special_' + this.def.id);
  }
  startSuper(world) {
    this.meter = 0; this.running = false; this.hitConfirmed = false; this.blinkHit.clear(); this.heldBody = null;
    this.setState(ST.SUPER, 'super');
    this.invuln = Math.max(this.invuln, this.anim.length + 4);
    world.freezeFrames(12, this);
    world.addFx('flash', this.x, 0, this.z, { color: '#ffffff' });
    if (world.camera) world.camera.shake(6, 20);
    audio.play('super_charge'); audio.play(this.def.sfx && this.def.sfx.super || 'super_' + this.def.id);
  }
  startDodge() {
    const it = this.intent;
    this.running = false;
    if (it.y) { this.dodgeDz = it.y * (DODGE_DIST * Z_SPEED_FACTOR) / DODGE_FRAMES; this.dodgeDx = 0; }
    else { const dir = it.x || this.facing; this.dodgeDx = dir * DODGE_DIST / DODGE_FRAMES; this.dodgeDz = 0; if (it.x) this.facing = it.x; }
    this.dodgeCooldown = DODGE_COOLDOWN + DODGE_FRAMES;
    this.setState(ST.DODGE, 'dodge');
    this.invuln = Math.max(this.invuln, DODGE_IFRAMES + 1);
  }
  /** Nearest enemy inside grab reach in front of the player that is idle (not in hitstun, not armored). */
  findGrabTarget(world) {
    let best = null, bestD = Infinity;
    for (const e of world.enemies) {
      if (!e.grabbableBy || !e.grabbableBy(this)) continue;
      const dx = (e.x - this.x) * this.facing, dz = Math.abs(e.z - this.z);
      if (dx < -4 || dx > this.grabReach + 28 || dz > 14) continue;
      if (dx < bestD) { bestD = dx; best = e; }
    }
    return best;
  }

  // ---------- hooks ----------
  onActionDone(world) {
    if (this.state === ST.TAUNT && this.anim.name === 'taunt') { /* meter granted by the 'meterGain' event or here as a fallback */ }
    if (this.state === ST.SUPER && this.heldBody) { this.releaseHeld(world, 40); }
    this.comboStep = 0;
    super.onActionDone(world);
  }
  onAnimEvent(name, frame, world) {
    switch (name) {
      case 'meterGain': this.addMeter(frame && frame.amount || METER.taunt); break;
      case 'lockOn': {
        const e = world.nearestEnemy(this.x, this.z, { maxDist: (frame && frame.radius) || 60 });
        if (e) { this.facing = sign(e.x - this.x) || this.facing; this.x += (e.x - this.facing * 30 - this.x) * 0.5; this.z += (e.z - this.z) * 0.5; }
        break;
      }
      case 'blink': {
        const e = world.nearestEnemy(this.x, this.z, { maxDist: 400, exclude: this.blinkHit });
        if (e) { this.blinkHit.add(e.id); world.addFx('dust', this.x, 0, this.z, { count: 4 }); this.facing = sign(e.x - this.x) || this.facing; this.x = e.x - this.facing * 26; this.z = e.z; world.addFx('ring', this.x, 30, this.z, { r0: 2, r1: 24, color: '#8FE3FF' }); }
        break;
      }
      case 'wreckGrab': {
        const e = world.nearestEnemy(this.x, this.z, { maxDist: (frame && frame.radius) || 80 });
        if (e && !e.dead && e.def.grabbable !== false) { this.heldBody = e; this.grabTarget = e; e.grabbedBy = this; e.vx = e.vy = e.vz = 0; e.setState(ST.GRABBED, 'hurtAir'); e.anim.setStaticPose(e.anim.pose); }
        break;
      }
      case 'wreckThrow': this.releaseHeld(world, (frame && frame.damage) || 40, (frame && frame.vx) || 16); break;
      case 'dive': if (frame) { this.vy = frame.vy != null ? frame.vy : -3; } break;
      default: super.onAnimEvent(name, frame, world); break;
    }
  }
  releaseHeld(world, damage, vx = 14) {
    const b = this.heldBody; this.heldBody = null; this.grabTarget = null;
    if (!b || b.grabbedBy !== this) return;
    b.thrown(this.facing * vx, 6, damage, this);
    this.onHitConfirmed(b, { type: 'throw', damage });
    audio.play('throw');
  }
  onHitEffect(name, target, hit) {
    if (name === 'rebound') { this.vy = 5; this.airActed = false; this.airShotUsed = false; this.setState(ST.JUMP, 'fall', { fallback: 'jump' }); }
  }
  onHitConfirmed(target, hit) {
    super.onHitConfirmed(target, hit);
    if (target.kind === 'prop') return;
    this.lastTarget = target;
    const type = hit.type || 'light';
    this.addMeter(type === 'light' || type === 'medium' ? METER.light : METER.heavy);
    this.combo += target.airborne ? AIR_HIT_COMBO : 1;
    this.comboTimer = FIGHTER_DEFAULTS.comboTimer;
    this.comboScale = 1.3;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
  }
  onHurt(hit, attacker) {
    this.damageTakenTotal += hit.damage || 0;
    if (this.combo > 0) this.dropCombo();
    this.addMeter(METER.damaged);
  }
  onKill(target) {
    this.kills++;
    this.addScore((target.def && target.def.score) || 100, true);
    this.addMeter(12);
  }
  /** Score multiplier from the current combo (GDD 7): 1 + combo/20, capped at 3. */
  get scoreMult() { return Math.min(3, 1 + this.combo / 20); }
  addScore(n, applyMult = true) { this.score += Math.round(n * (applyMult ? this.scoreMult : 1)); }
  addMeter(n) {
    const was = this.meter;
    this.meter = clamp(this.meter + n, 0, METER.max);
    if (was < METER.max && this.meter >= METER.max) audio.play('meter_full');
  }
  dropCombo() {
    this.grade = comboGrade(this.combo);
    this.gradeTimer = this.grade ? 90 : 0;
    this.combo = 0; this.comboTimer = 0;
  }

  // ---------- state overrides ----------
  updateState(world) {
    if (this.combo > 0 && --this.comboTimer <= 0) this.dropCombo();
    if (this.gradeTimer > 0) this.gradeTimer--;
    this.comboScale += (1 - this.comboScale) * 0.25;
    if (this.state === ST.DEAD) {
      if (this.deadTimer > 0) this.deadTimer--;
      if (this.stateTimer >= FIGHTER_DEFAULTS.respawnDelay) { if (this.lives > 0) this.respawn(world); else { this.out = true; this.removeMe = true; this.alive = false; } }
      return;
    }
    super.updateState(world);
  }
  /** Respawn from the top of the screen with i-frames. */
  respawn(world) {
    this.lives--;
    this.hp = this.maxHp; this.meter = 0; this.dead = false; this.alive = true; this.removeMe = false;
    this.combo = 0; this.comboTimer = 0; this.juggleCount = 0; this.juggleGravity = 0; this.juggleImmune = false; this.chainHits = 0;
    this.grabTarget = null; this.grabbedBy = null; this.heldBody = null; this.hitstop = 0; this.flashTimer = 0;
    const cam = world.camera;
    this.x = clamp(cam.x + VIEW_W / 2, cam.left + 20, cam.right - 20); this.z = 70; this.y = 160; this.vy = 0; this.vx = 0; this.facing = 1;
    this.invuln = FIGHTER_DEFAULTS.respawnInvuln;
    this.setState(ST.JUMP, 'fall', { fallback: 'jump' });
    if (!world.entities.includes(this)) world.add(this);
  }
  /** Debug helper: turn toward and step toward the nearest enemy. */
  faceNearestEnemy(world) {
    const e = world.nearestEnemy(this.x, this.z);
    if (!e) return;
    this.facing = sign(e.x - this.x) || this.facing;
    if (this.actionable) { const reach = (this.def.reach || 40) - 8; if (Math.abs(e.x - this.x) > reach) this.x += this.facing * Math.min(this.walkSpeed * 3, Math.abs(e.x - this.x) - reach); this.z += clamp(e.z - this.z, -4, 4); }
  }
}
