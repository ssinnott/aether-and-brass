// Grab / throw mechanics mixed into Fighter.prototype (fighter.js keeps the state machine, this file the hold / throw rules of
// GDD section 7 and the traits grabbable / grabAll / grabReach / grabDamageMult / throwDamageMult / throwDamageTakenMult).
import { ST, FIGHTER_DEFAULTS, KNOCKDOWN_POP_VY } from '../constants.js';
import { audio } from '../engine/audio.js';

/** Pop velocity of a ground bounce (hit.groundBounce / moves.throwBack.bounce). */
export const BOUNCE_VY = 5;

/** Methods installed on Fighter.prototype by fighter.js (`this` is the fighter). */
export const grabMethods = {
  /**
   * True if this fighter can currently be grabbed by `by`. `ignoreHitstun` lets a grab follow the hit that opened it
   * (Pip's Grapple Shot reels the enemy it just tagged, GDD 2.4). Boss punish windows (punishGrab) allow grabs regardless of armor.
   */
  grabbableBy(by, { ignoreHitstun = false } = {}) {
    if (!this.alive || this.dead || this.airborne || this.grabbedBy) return false;
    if (!ignoreHitstun && this.inHitstun) return false;
    if (ignoreHitstun && this.state !== ST.HURT && this.inHitstun) return false;
    if (this.punishable && this.punishGrab) return true;
    const g = this.traits.grabbable, bt = by.traits || {};
    if (typeof g === 'function') return !!g(by, this);
    if (g === false && !(bt.grabAll && this.traits.grabbableByGrappler !== false)) return false;
    if (this.armor && !bt.grabAll && g !== true) return false;
    return true;
  },
  /** Start holding `target`. */
  startGrab(target) {
    this.grabTarget = target; this.grabHits = 0; this.grabTimer = 0; this.throwPending = null;
    target.grabbedBy = this; target.vx = target.vy = target.vz = 0;
    target.setState(ST.GRABBED, 'hurt');
    target.anim.setStaticPose(target.anim.pose);
    this.setState(ST.GRAB, 'grab');
    this.invuln = Math.max(this.invuln, 8);
    audio.play('hit_grab');
    this.callHook('onGrab', target); target.callHook('onGrabbed', this);
  },
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
  },
  /** Hold hit: damage the held target; auto-throws after the move's max hits. */
  grabHit() {
    // enemies without a grabHit move squeeze for 5 per hit, `ai.grabHoldHits` times (GDD 4: Cinder Hulk 4 x 5)
    const t = this.grabTarget, mv = (this.def.moves && this.def.moves.grabHit) || { damage: this.kind === 'player' ? 8 : 5, hits: (this.ai && this.ai.grabHoldHits) || 3 };
    if (!t || this.throwPending) return false;
    this.play('grabHit');
    this.grabHits++;
    t.takeHitRaw(Math.round(mv.damage * this.traits.grabDamageMult * t.traits.throwDamageTakenMult), 'medium', this);
    if (this.world) this.world.addFx('spark', t.x, t.y + t.h * 0.6, t.z, { type: 'heavy' });
    this.onHitConfirmed(t, { type: 'heavy', damage: mv.damage });
    if (t.dead) { t.knockDown(KNOCKDOWN_POP_VY, this.facing * 3); this.grabTarget = null; this.setState(ST.IDLE, 'idle'); return true; }
    if (this.grabHits >= (mv.hits || 3)) this.throwTarget(1);
    return true;
  },
  /** Begin a throw (dir +1 forward, -1 back). The target is released a few frames into the throw animation. */
  throwTarget(dir = 1) {
    const mv = (this.def.moves && (dir > 0 ? this.def.moves.throwFwd : this.def.moves.throwBack)) || { damage: 15, vx: 9, vy: 5 };
    const anim = dir < 0 && this.anim.has('throwBack') ? 'throwBack' : 'throw';
    this.play(anim);
    this.stateTimer = 0;
    this.throwPending = { dir, at: mv.releaseAt != null ? mv.releaseAt : 5, mv };
  },
  doThrow({ dir, mv }) {
    const t = this.grabTarget;
    if (!t) { this.setState(ST.IDLE, 'idle'); return; }
    this.grabTarget = null;
    const dmg = Math.round((mv.damage || 15) * this.traits.grabDamageMult * this.traits.throwDamageMult);
    if (dir < 0) { t.x = this.x - this.facing * 20; }
    t.thrown(this.facing * dir * (mv.vx || 9), mv.vy != null ? mv.vy : 5, dmg, this);
    if (mv.bounce) { t.bounced = false; t.bounceOnLand = { vy: typeof mv.bounce === 'number' ? mv.bounce : BOUNCE_VY }; }
    if (mv.shockwave && this.world) {
      this.world.areaHit(this.x + this.facing * dir * 20, this.z, mv.shockwave.r || 40, { damage: mv.shockwave.damage || 10, type: 'knockdown', kbX: 4, kbY: 4 }, this, { exclude: t, shake: 4 });
    }
    audio.play('throw');
    this.onHitConfirmed(t, { type: 'throw', damage: dmg });
    if (mv.selfVy) { this.vy = mv.selfVy; this.y = 0.01; }
    this.callHook('onThrow', t, dir);
  },
  /** Let go without a throw (grab broken). */
  releaseGrab(hurt = true) {
    const t = this.grabTarget;
    this.grabTarget = null; this.throwPending = null;
    if (t && t.grabbedBy === this) { t.grabbedBy = null; if (hurt) { t.hurtTimer = 12; t.setState(ST.HURT, 'hurt'); } else t.setState(ST.IDLE, 'idle'); }
    if (this.state === ST.GRAB) this.setState(ST.IDLE, 'idle');
  },
  /** Become a thrown projectile body. */
  thrown(vx, vy, damage, thrower) {
    this.grabbedBy = null; this.thrownBy = thrower; this.thrownHit.clear();
    this.takeHitRaw(Math.round(damage * this.traits.throwDamageTakenMult), 'throw', thrower);
    this.vx = vx; this.vy = vy; this.y = Math.max(this.y, 1);
    this.setState(ST.THROWN, 'knockdown');
  }
};
