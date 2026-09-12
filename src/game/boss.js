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
import { ST, UI } from '../constants.js';
import { Enemy, normalizeAi } from './enemy.js';
import { buildRig } from '../art/rig.js';
import { AnimPlayer } from './animation.js';
import { audio } from '../engine/audio.js';
import { particles } from '../engine/particles.js';
import { floatText } from '../art/fx.js';

const DEFEAT_BLINK = 90;
const COMBO_WINDOW = 60;

/** Merge a phase override into the base def (ai tables merge, everything else replaces). */
function mergePhase(def, phase) {
  const { ai, build, anims, ...rest } = phase;
  return { ...def, ...rest, build: build || def.build, anims: anims || def.anims, ai: { ...(def.ai || {}), ...(ai || {}) }, hp: phase.hp, maxHp: phase.hp };
}

/** Multi-phase boss. Spawns into its intro animation and announces itself through `world.onBossSpawn`. */
export class Boss extends Enemy {
  /**
   * @param {object} def boss definition (content/enemies/midboss.js, boss.js)
   * @param {{ x?: number, z?: number, facing?: number }} o
   */
  constructor(def, o = {}) {
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
  get phase() { return this.phaseIndex + 1; }
  /** Remaining hp across all phases (monotonic; used by the HUD bar and summary()). */
  get hpTotal() { let s = Math.max(0, this.hp); for (let i = this.phaseIndex + 1; i < this.phases; i++) s += this.phaseHps[i]; return s; }
  get phaseColor() { return this.phaseDefs[this.phaseIndex].color || '#e8402c'; }
  get phaseName() { return this.phaseDefs[this.phaseIndex].name || this.name; }
  get phaseDef() { return this.phaseDefs[this.phaseIndex]; }

  /** Switch to phase i: merged def, rig / anims swap, hp, AI table, traits, sub-parts, band shrink. */
  applyPhase(i, first = false) {
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
  update(world) {
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
  think(world) {
    if (this.transition > 0 || this.defeated) { this.releaseToken(world); return; }
    if (this.ventTimer > 0) { // open core / vent window: the machine stalls and takes the punish multiplier
      const v = this.phaseDef.vent || {};
      this.punishable = true; this.punishMult = v.damageMult || 1; this.punishGrab = !!v.grabbable; this.rig.tell = false;
      if (!this.inHitstun && this.state !== ST.ATTACK) this.stand();
      if (this.state === ST.ATTACK && v.stall !== false) { this.pendingAttack = null; this.currentAttack = null; this.setState(ST.IDLE, 'idle'); }
      return;
    }
    super.think(world);
  }
  hurtbox() {
    const hb = super.hurtbox();
    if (hb && this.hurtboxScale !== 1) hb.y1 = hb.y0 + (hb.y1 - hb.y0) * this.hurtboxScale;
    return hb;
  }
  /** Bosses ignore tokens and never flee / panic. */
  acquireToken() { return true; }
  /** Stun window (pressure valves, stage events): stagger + punishable for `frames`. */
  stun(frames = 60, source = null) {
    if (this.transition > 0 || this.defeated || this.state === ST.DEAD) return;
    if (this.grabTarget) this.releaseGrab(false);
    this.enterStall(frames, this.ai.stunDamageMult || 1.5, !!this.ai.stunGrabbable);
    this.hurtTimer = 0; this.vx = 0;
    floatText(this.x, this.y + this.h + 12, this.z, 'STUNNED!', UI.brassLight, 2);
    if (this.world) { this.world.addFx('ring', this.x, 40, this.z, { r0: 8, r1: 90, color: '#ffffff' }); this.world.addFx('steam', this.x, 40, this.z, { count: 10 }); this.world.camera.shake(8, 12); }
    audio.play('valve_blow');
    this.callHook('onStunned', frames, source);
  }
  openVent() {
    const v = this.phaseDef.vent;
    if (!v) return;
    this.ventTimer = v.frames || 120;
    if (v.flag) { this.flags[v.flag] = true; this.rig[v.flag] = true; }
    if (this.world) { this.world.addFx('ring', this.x, 60, this.z, { r0: 6, r1: 80, color: '#4DF0E0' }); this.world.addFx('steam', this.x, 60, this.z, { count: 12 }); }
    floatText(this.x, this.y + this.h + 12, this.z, v.text || 'CORE EXPOSED!', '#4DF0E0', 2);
    audio.play('valve_blow');
    this.callHook('onVentOpen');
  }
  closeVent() {
    const v = this.phaseDef.vent;
    if (v && v.flag) { this.flags[v.flag] = false; this.rig[v.flag] = false; }
    this.punishable = false; this.punishMult = 1; this.punishGrab = false;
    this.callHook('onVentClose');
  }

  // ---------- damage & phases ----------
  takeHit(hit, attacker) {
    if (this.transition > 0 || this.defeated) return false;
    const ok = super.takeHit(hit, attacker);
    if (ok) this.afterDamage(hit, attacker);
    return ok;
  }
  takeHitRaw(damage, type, attacker, opts) {
    if (this.transition > 0 || this.defeated) return;
    super.takeHitRaw(damage, type, attacker, opts);
    this.afterDamage({ damage }, attacker);
  }
  /** Death hooks fire only on the final defeat (earlier phase deaths are transitions). */
  onDied(world) {
    if (this.phaseIndex < this.phases - 1) { this.deathHooked = false; return; }
    super.onDied(world);
  }
  afterDamage(hit, attacker) {
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
  nextPhase() {
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
    }
    this.callHook('onPhase', this.phaseIndex, world);
  }
  beginDefeat() {
    this.defeated = true; this.hp = 0;
    this.die();
    if (this.grabTarget) this.releaseGrab(false);
    if (this.grabbedBy) { this.grabbedBy.releaseGrab(false); this.grabbedBy = null; }
    this.thrownBy = null; this.hitstop = 0; this.invuln = 9999; this.status = {};
    this.releaseToken(this.world);
    this.y = 0; this.vy = 0; this.vx = 0;
    this.setState(ST.SPECIAL, 'defeat', { fallback: 'hurt' });
    audio.play('boss_defeat');
    if (this.world) { this.world.camera.shake(12, 16); this.world.addFx('flash', this.x, 0, this.z, { color: '#ffffff' }); this.world.resetBand(); }
  }
  onActionDone(world) {
    if (this.defeated) {
      if (this.state !== ST.DEAD) { this.setState(ST.DEAD, 'dead', { fallback: 'lying' }); this.deadTimer = DEFEAT_BLINK; world.onDeath(this); }
      return;
    }
    super.onActionDone(world);
  }
}
