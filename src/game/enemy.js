// Enemy: Fighter + the AI framework of ARCHITECTURE.md section 8 (ENTER / APPROACH / HOVER / ATTACK / RECOVER / KEEP_DISTANCE,
// attack tokens, z alignment, target selection, separation, off-screen teleport, ranged behaviour, armor/stagger, flee, panic, evade, riposte).
import { ST, TEAM, VIEW_W, Z_MIN, Z_MAX, Z_SPEED_FACTOR } from '../constants.js';
import { Fighter } from './fighter.js';
import { rng } from '../engine/rng.js';
import { audio } from '../engine/audio.js';
import { clamp, sign } from '../engine/math.js';
import { drawText } from '../engine/text.js';
import { FLOOR_TOP } from '../constants.js';

/** Defaults for `def.ai` (content overrides per type / variant). */
export const AI_DEFAULTS = Object.freeze({
  attackRange: 40, zTolerance: 12, retreatChance: 0.25, attackCooldown: [40, 90], aggression: 0.5, attacks: [], ranged: null,
  staggerEvery: 0, staggerFrames: 30, firstAttackDelay: 45, flank: false, hoverCircle: false, fleeLast: false, fleeHp: 0, fleeDistance: 100,
  retreatBudget: 90, evadeChance: 0, evadeCooldown: 90, riposteChance: 0, riposteCooldown: 150, riposteAnim: 'riposte', panicRange: 0, panicFrames: 30,
  ignoresTokens: false, shield: false, launchStun: 0, stallEvery: 0, stallFrames: 70, grabHoldHits: 3,
});
const OFFSCREEN_MARGIN = 200, OFFSCREEN_FRAMES = 300, SEP_X = 18, SEP_Z = 10, RETARGET = 90, HOVER_MAX = 240;
const SPD_Z = Z_SPEED_FACTOR;

/** AI-controlled fighter. `def` comes from content/enemies (see ARCHITECTURE section 8 for the fields). */
export class Enemy extends Fighter {
  /**
   * @param {object} def enemy definition
   * @param {{ x?: number, z?: number, facing?: number, entered?: boolean, kind?: string, fromSky?: boolean }} o
   */
  constructor(def, { x = 0, z = 70, facing = -1, entered = true, kind = 'enemy', fromSky = false } = {}) {
    super(def, { team: TEAM.ENEMY, kind, x, z, facing });
    this.ai = { ...AI_DEFAULTS, ...(def.ai || {}) };
    this.entered = entered;
    this.aiState = entered ? 'APPROACH' : 'ENTER';
    this.aiTimer = 0; this.target = null; this.retargetTimer = 0;
    this.attackCooldown = this.ai.firstAttackDelay; this.rangedCooldown = Math.round(this.ai.firstAttackDelay * 0.8);
    this.hoverSide = rng.sign(); this.hoverDist = 60; this.hoverZ = 0; this.flankZ = this.ai.flank ? rng.range(-40, 40) : 0;
    this.offscreenTimer = 0; this.hitCount = 0; this.staggerTimer = 0; this.shieldStripped = false;
    this.fled = false; this.fleeTimer = 0; this.fleeing = false; this.fleeOff = false; this.fleeDir = 1; this.fleeChecked = false;
    this.pendingAttack = null; this.currentAttack = null; this.attackUses = new Map(); this.hasToken = false; this.attackCount = 0;
    this.retreatBudget = this.ai.retreatBudget; this.panicCooldown = 0; this.panicFlee = false; this.evadeTimer = 0; this.lastSeenAttack = -1; this.riposteTimer = 0;
    this.retreating = false; this.spawned = false; this.aimX = null; this.aimZ = null; this.grabHitTimer = 0;
    this.rig.keyAngle = 0; this.rig.tell = false;
    if (fromSky) { this.y = 170; this.vy = 0; this.entered = true; this.aiState = 'APPROACH'; this.setState(ST.JUMP, 'fall', { fallback: 'jump' }); }
  }

  // ---------- per-step ----------
  update(world) {
    super.update(world);
    // dynamic armor: staggered (gear slip) or shield-stripped automatons lose their armor
    if (this.staggerTimer > 0 || this.shieldStripped) { this.armor = false; this.unlaunchable = false; }
    else this.unlaunchable = !!this.def.unlaunchable;
    if (this.def.onUpdate) this.def.onUpdate(this, world);
  }

  think(world) {
    if (!this.spawned) { this.spawned = true; if (this.def.onSpawn) this.def.onSpawn(this, world); }
    const f = this.anim.frame;
    this.rig.tell = !!(f && f.tell);
    if (this.state === ST.ATTACK || this.state === ST.WALK || this.state === ST.RUN) this.rig.keyAngle += 0.2;
    if (this.staggerTimer > 0) this.staggerTimer--;
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.rangedCooldown > 0) this.rangedCooldown--;
    if (this.panicCooldown > 0) this.panicCooldown--;
    if (this.evadeTimer > 0) this.evadeTimer--;
    if (this.riposteTimer > 0) this.riposteTimer--;
    if (this.retargetTimer > 0) this.retargetTimer--;
    this.checkOffscreen(world);
    if (this.dead || this.inHitstun || this.grabbedBy) { this.releaseToken(world); this.pendingAttack = null; return; }
    if (this.state === ST.GRAB) { this.thinkGrab(world); return; }
    if (this.state === ST.DODGE) { if (this.stateTimer <= 12) this.x -= this.facing * 3.5; return; }
    if (this.state === ST.ATTACK || this.state === ST.SPECIAL || this.state === ST.JUMP || this.airborne) return;
    this.pickTarget(world);
    if (this.aiState === 'STAGGER') { if (--this.aiTimer <= 0) this.endStagger(); return; }
    if (this.aiState === 'FLEE') { this.thinkFlee(world); return; }
    if (this.aiState === 'ENTER') { this.thinkEnter(world); return; }
    const t = this.target;
    if (!t) { this.stand(); return; }
    if (this.tryEvade(world, t) || this.tryPanic(world, t)) return;
    this.separate(world);
    switch (this.aiState) {
      case 'KEEP_DISTANCE': this.thinkRanged(world, t); break;
      case 'HOVER': this.thinkHover(world, t); break;
      case 'RECOVER': this.thinkRecover(world, t); break;
      default: this.thinkApproach(world, t);
    }
  }

  // ---------- targeting & movement helpers ----------
  pickTarget(world) {
    const t = this.target;
    const valid = t && t.alive && !t.dead && !t.removeMe && !t.out;
    if (valid && this.retargetTimer > 0) return;
    let best = null, bestD = Infinity;
    for (const p of world.players) {
      if (!p.alive || p.dead || p.removeMe || p.out) continue;
      const d = Math.abs(p.x - this.x) + Math.abs(p.z - this.z) * 1.5;
      if (d < bestD) { bestD = d; best = p; }
    }
    this.target = best; this.retargetTimer = RETARGET;
  }
  face(t) { const d = t.x - this.x; if (Math.abs(d) > 4) this.facing = sign(d); }
  /** Walk toward a local offset (dx, dz). `back` keeps the current facing (backpedal). */
  moveToward(dx, dz, mult = 1, back = false, run = false) {
    const spd = (run ? this.runSpeed : this.walkSpeed) * mult;
    const mx = clamp(dx, -spd, spd), mz = clamp(dz, -spd * SPD_Z, spd * SPD_Z);
    this.x += mx; this.z = clamp(this.z + mz, Z_MIN, Z_MAX);
    if (!back && Math.abs(mx) > 0.2) this.facing = sign(mx);
    const st = run ? ST.RUN : ST.WALK, an = run ? 'run' : 'walk';
    if (this.state !== st || (this.anim.name !== an && this.anim.name !== 'flee')) { this.state = st; this.stateTimer = 0; this.play(an, { restart: false }); }
  }
  stand() {
    if (this.state !== ST.IDLE) this.setState(ST.IDLE, 'idle', { restart: false });
    else if (this.anim.name !== 'idle' && this.anim.name !== 'land' && (this.anim.done || (this.anim.def && this.anim.def.loop))) this.play('idle');
  }
  separate(world) {
    for (const e of world.enemies) {
      if (e === this || e.dead) continue;
      const dx = this.x - e.x, dz = this.z - e.z;
      if (Math.abs(dx) < SEP_X && Math.abs(dz) < SEP_Z) { this.x += (sign(dx) || (this.id > e.id ? 1 : -1)) * 0.5; this.z = clamp(this.z + (sign(dz) || 1) * 0.3, Z_MIN, Z_MAX); }
    }
  }
  checkOffscreen(world) {
    const cam = world.camera;
    if (this.fleeOff) return;
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
    if (ai.ranged && this.retreatBudget > 0 && adx <= ai.ranged.maxRange + 40 && adx > ai.attackRange + 10) { this.aiState = 'KEEP_DISTANCE'; return; }
    this.face(t);
    if (adx <= ai.attackRange && adz <= ai.zTolerance) {
      if (this.attackCooldown <= 0 && this.acquireToken(world)) { const atk = this.chooseAttack(adx); if (atk) { this.startAttack(atk, t); return; } }
      if (!ai.ignoresTokens && !this.hasToken) { this.aiState = 'HOVER'; this.hoverDist = ai.attackRange + rng.range(30, 60); this.aiTimer = 0; return; }
      this.stand(); return;
    }
    if (this.attackCooldown <= 0 && adz <= ai.zTolerance && adx <= this.maxAttackRange && this.acquireToken(world)) {
      const atk = this.chooseAttack(adx); if (atk) { this.startAttack(atk, t); return; }
    }
    const standoff = Math.max(10, ai.attackRange - 8);
    const wantX = t.x - sign(dx || this.facing) * standoff;
    const laneZ = (ai.flank && adx > 70) ? clamp(t.z + this.flankZ, Z_MIN, Z_MAX) : t.z;
    const mz = laneZ - this.z;
    this.moveToward(wantX - this.x, Math.abs(mz) > 3 ? mz : 0, 1, false, adx > 260);
  }
  thinkHover(world, t) {
    this.face(t);
    this.aiTimer++;
    if (this.aiTimer % 30 === 0 && this.attackCooldown <= 0 && this.acquireToken(world)) { this.aiState = 'APPROACH'; return; }
    const curSide = sign(this.x - t.x) || this.hoverSide;
    if (this.ai.hoverCircle && this.aiTimer % 120 === 0) this.hoverSide = -curSide;
    const wantX = t.x + (this.ai.hoverCircle ? this.hoverSide : curSide) * this.hoverDist;
    if (this.aiTimer % 90 === 45) this.hoverZ = rng.range(-30, 30);
    const wantZ = clamp(t.z + this.hoverZ, Z_MIN, Z_MAX);
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
    if (adx > r.maxRange + 40 || this.retreatBudget <= 0) { this.aiState = 'APPROACH'; return; }
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
  thinkGrab(world) {
    if (!this.grabTarget || this.throwPending) return;
    if (this.anim.name === 'grab' && !this.anim.done) return;
    if (++this.grabHitTimer >= 18) { this.grabHitTimer = 0; this.grabHit(); }
  }
  endStagger() {
    this.damageTaken = this.def.damageTaken || 1;
    if (this.panicFlee) { this.panicFlee = false; this.aiState = 'FLEE'; this.fleeTimer = 50; this.fleeDir = this.target ? -(sign(this.target.x - this.x) || this.facing) : -this.facing; audio.play('soot_flee'); }
    else this.aiState = 'APPROACH';
  }
  enterStagger(frames, anim = 'stagger') {
    this.aiState = 'STAGGER'; this.aiTimer = frames; this.staggerTimer = Math.max(this.staggerTimer, frames);
    this.pendingAttack = null; this.releaseToken();
    this.setState(ST.IDLE, anim, { fallback: 'hurt' });
  }
  tryEvade(world, t) {
    const ai = this.ai;
    if (!ai.evadeChance || this.evadeTimer > 0 || !t.anim) return false;
    const attacking = t.state === ST.ATTACK || t.state === ST.DASH_ATTACK || t.state === ST.JUMP_ATTACK;
    if (!attacking || t.anim.instance === this.lastSeenAttack) return false;
    this.lastSeenAttack = t.anim.instance;
    if (Math.abs(t.x - this.x) > 80 || Math.abs(t.z - this.z) > 24 || !rng.chance(ai.evadeChance)) return false;
    this.evadeTimer = ai.evadeCooldown; this.face(t);
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
    this.attackCooldown = 0; this.retreating = false;
    if (atk.tell && this.anim.has(atk.tell)) { this.pendingAttack = atk.anim; this.setState(ST.ATTACK, atk.tell); }
    else this.setState(ST.ATTACK, atk.anim);
  }
  startRanged(r, t) {
    this.face(t); this.aimX = t.x; this.aimZ = t.z;
    this.currentAttack = { anim: r.anim, ranged: true }; this.rangedCooldown = r.cooldown || 150;
    this.setState(ST.ATTACK, r.anim);
  }
  onActionDone(world) {
    if (this.pendingAttack) { const a = this.pendingAttack; this.pendingAttack = null; this.setState(ST.ATTACK, a); return; }
    if (this.state === ST.ATTACK) {
      const atk = this.currentAttack; this.currentAttack = null;
      this.finishAttack(world);
      if (atk && atk.chain && this.anim.has(atk.chain)) { this.startAttack({ anim: atk.chain, range: 999 }, this.target); return; }
    }
    super.onActionDone(world);
  }
  finishAttack(world) {
    const ai = this.ai, cd = ai.attackCooldown;
    this.attackCooldown = rng.int(cd[0], cd[1]);
    this.retreatBudget = Math.min(ai.retreatBudget, this.retreatBudget + 40);
    this.attackCount++;
    this.releaseToken(world);
    if (ai.stallEvery && this.attackCount % ai.stallEvery === 0) { this.enterStagger(ai.stallFrames); this.damageTaken = 3; audio.play('valve_blow'); return; }
    if (ai.retreatChance > 0 && rng.chance(ai.retreatChance)) { this.aiState = 'RECOVER'; this.aiTimer = rng.int(20, 40); this.retreating = true; }
    else { this.aiState = ai.ranged && this.retreatBudget > 0 ? 'KEEP_DISTANCE' : 'APPROACH'; }
  }
  onAnimEvent(name, frame, world) {
    if (name === 'aim') { const t = this.target; if (t) { this.aimX = t.x; this.aimZ = t.z; } return; }
    if (name === 'summon') { this.summon(frame && frame.summon, world); return; }
    if (name === 'timeStop') { for (const p of world.players) if (p.alive && !p.dead) { p.hitstop = Math.max(p.hitstop, (frame && frame.freeze) || 60); p.flashTimer = 2; } world.addFx('flash', this.x, 0, this.z, { color: '#4DF0E0' }); audio.play('time_stop_tick'); return; }
    if (name === 'teleportBehind') {
      const t = this.target; if (!t) return;
      world.addFx('ring', this.x, 30, this.z, { r0: 4, r1: 40, color: '#4DF0E0' }); world.addFx('steam', this.x, 30, this.z, { count: 6 });
      const b = world.boundsFor(this);
      this.x = clamp(t.x - t.facing * 44, b.x0, b.x1); this.z = t.z; this.facing = t.facing;
      world.addFx('ring', this.x, 30, this.z, { r0: 4, r1: 40, color: '#4DF0E0' });
      return;
    }
    super.onAnimEvent(name, frame, world);
  }
  summon(list, world) {
    if (!list || !world.spawnEnemy) return;
    const cam = world.camera;
    list.forEach((s, i) => {
      const side = i % 2 ? -1 : 1;
      const x = side > 0 ? cam.x + VIEW_W + 30 + i * 20 : cam.x - 30 - i * 20;
      world.spawnEnemy(s.type, s.variant, x, clamp(this.z + (i - 1) * 30, Z_MIN, Z_MAX), { entered: false, facing: -side });
    });
    audio.play('brass_tell');
  }

  // ---------- reactions ----------
  takeHit(hit, attacker) {
    const ai = this.ai;
    if (ai.riposteChance && this.riposteTimer <= 0 && !this.dead && !this.inHitstun && !this.airborne && (this.state === ST.IDLE || this.state === ST.WALK)
      && hit.type !== 'grab' && attacker && attacker.kind === 'player' && this.anim.has(ai.riposteAnim) && rng.chance(ai.riposteChance)) {
      this.riposteTimer = ai.riposteCooldown; this.face(attacker); this.pendingAttack = null;
      this.currentAttack = { anim: ai.riposteAnim, range: 999 };
      this.setState(ST.ATTACK, ai.riposteAnim); this.invuln = Math.max(this.invuln, 6);
      attacker.hitstop = Math.max(attacker.hitstop, 8);
      if (this.world) this.world.addFx('spark', this.x + this.facing * 14, this.y + this.h * 0.6, this.z, { type: 'heavy' });
      audio.play('parry');
      return false;
    }
    return super.takeHit(hit, attacker);
  }
  onHurt(hit, attacker) {
    const ai = this.ai, world = this.world;
    this.pendingAttack = null; this.releaseToken(world);
    if (this.aiState !== 'FLEE') { this.aiState = 'APPROACH'; this.retreating = false; }
    this.attackCooldown = Math.max(this.attackCooldown, 25);
    if (attacker && attacker.kind === 'player') { this.target = attacker; this.retargetTimer = RETARGET; }
    this.hitCount++;
    const grounded = !this.airborne && this.state !== ST.KNOCKDOWN && this.state !== ST.LYING;
    if (!this.dead && ai.staggerEvery && this.hitCount % ai.staggerEvery === 0 && grounded && this.state !== ST.THROWN) {
      this.staggerTimer = ai.staggerFrames; this.hurtTimer = ai.staggerFrames; this.chainHits = 0;
      this.setState(ST.HURT, 'stagger', { fallback: 'hurt' });
      audio.play('gear_slip');
    } else if (!this.dead && ai.shield && !this.shieldStripped && this.staggerTimer > 0 && hit.type === 'launch') {
      this.shieldStripped = true; this.rig.shieldStripped = true; audio.play('prop_break');
      if (world) world.addFx('ring', this.x, 30, this.z, { r0: 6, r1: 50, color: '#4DF0E0' });
    }
    if (!this.dead && ai.fleeHp && this.hp < ai.fleeHp && !this.fled && attacker) {
      this.fled = true; this.fleeTimer = Math.round(ai.fleeDistance / Math.max(1, this.runSpeed * 1.15)); this.fleeDir = -(sign(attacker.x - this.x) || this.facing); this.aiState = 'FLEE';
      audio.play('soot_flee');
    } else if (!this.dead && ai.fleeLast && !this.fleeChecked && world && this.hp <= this.maxHp * 0.3 && world.waveEnemies.length === 1 && world.camera.locked) {
      this.fleeChecked = true;
      if (rng.chance(0.5)) { this.fleeOff = true; this.fleeing = true; this.entered = false; this.aiState = 'FLEE'; this.fleeDir = (this.x - world.camera.x) < VIEW_W / 2 ? -1 : 1; this.invuln = 30; audio.play('soot_flee'); }
    }
  }

  drawDebug(ctx, cam) {
    super.drawDebug(ctx, cam);
    drawText(ctx, this.aiState + (this.hasToken ? '*' : ''), cam.toScreenX(this.x), FLOOR_TOP + this.z + 12, { size: 1, color: '#ff9', align: 'center' });
  }
}
