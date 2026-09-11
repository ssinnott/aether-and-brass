// Shared authoring helpers for placeholder character content. Each character file passes its GDD numbers here and
// receives a complete animation table (every state the Fighter state machine needs). Pure data assembly, no game logic.
import { makeBaseAnims, strike, frontBox, areaBox, STYLES } from '../../art/animLib.js';
import { P } from '../../art/poses.js';

export { strike, frontBox, areaBox, STYLES, P };

/** Keyframe shorthand for hand-authored anims: F(dur, poseSpec, extraFrameFields) -> { dur, pose: P(spec), ...extra }. */
export const F = (dur, spec, extra) => ({ dur, pose: P(spec), ...(extra || {}) });
/** Hit data shorthand: hit(damage, type, kbX, kbY, hitstun, extra). */
export const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, ...(extra || {}) });

/**
 * Animation names that are moves (issue #22 acceptance 1): every hero anim key in this list must appear in some
 * moveList entry's `anims` / `anim` (checked by the training scenario's coverage assertion, window.__game.moveAnims).
 */
export const MOVE_ANIMS = Object.freeze(['attack1', 'attack2', 'attack3', 'attack4', 'jumpAttack', 'jumpAttack2', 'landAttack', 'dashAttack', 'special', 'super', 'dodge', 'airDash', 'parry', 'taunt', 'grab', 'grabHit', 'throw', 'throwBack']);

/** @param {string} label @param {TrialKind|TrialKind[]} [kind] @param {string|string[]} [anim] @param {Partial<TrialStep>} [extra] @returns {TrialStep} */
export const step = (label, kind = 'hit', anim = undefined, extra = {}) => ({ label, kind, ...(anim ? { anim } : {}), ...extra });
/** @param {number} n @returns {Trial} */
export function comboTrial(n) {
  const steps = Array.from({ length: n }, (_, i) => step(`HIT ${i + 1}`, 'hit', `attack${i + 1}`));
  return { id: 'combo', name: `${n}-HIT COMBO`, hint: 'PRESS ATTACK IN THE RECOVERY OF EACH HIT', strict: true, window: 60, steps };
}
/** @returns {Trial} */
export function jumpGrabTrial() { return { id: 'jumpgrab', name: 'JUMP-IN GRAB', hint: 'JUMP ATTACK, THEN GRAB WHEN IT STANDS', window: 150, steps: [step('JUMP ATTACK', 'hit', 'jumpAttack'), step('GRAB', 'grab')] }; }
/** @returns {Trial} */
export function dodgeCancelTrial() { return { id: 'dodgecancel', name: 'DODGE-CANCEL SPECIAL', hint: 'HIT, DODGE OUT OF THE RECOVERY, SPECIAL', window: 60, steps: [step('COMBO HIT', 'hit', ['attack1', 'attack2', 'attack3', 'attack4']), step('DODGE CANCEL', 'cancel'), step('SPECIAL', ['hit', 'projectile'], 'special')] }; }
/** @returns {Trial} */
export function throwBodyTrial() { return { id: 'throwbody', name: 'BODY THROW', hint: 'GRAB ONE, THROW IT INTO THE OTHER', window: 150, bodies: 2, steps: [step('GRAB', 'grab'), step('THROW', 'throw'), step('BODY HIT', 'body')] }; }

/** GDD stat -> movement mapping (GDD 2: walk 1.7 / 2.2 / 2.8 px/f for Speed 2 / 3 / 5; run = walk x 1.7). */
export function speedFor(speedStat) { return speedStat >= 5 ? 2.8 : speedStat >= 3 ? 2.2 : 1.7; }
/** Health stat -> max HP. */
export function hpFor(healthStat) { return 95 + healthStat * 21; }

/**
 * Build the standard hero animation set.
 * @param {object} o
 *   carry: rest pose of the weapon arm; reach: px;
 *   combo: [{ style, dmg, type, startup, active, recovery, hitstun, kbX, kbY, behind, high, armor, fx, sfx, event, move, hitSfx }]
 *   jumpAttack: { style, dmg, type, kbX, kbY, hitstun, onHit, move, event, active }
 *   jumpAttack2: optional second air attack (shot)
 *   landAttack: { radius, dmg } optional landing shockwave
 *   dashAttack: { style, dmg, type, startup, active, recovery, move, armor, invuln, behind, area, kbX, kbY, event, projectile, cancel }
 *   special, super: full animation entries (built by the character file)
 *   extra: additional named anims
 */
export function makeHeroAnims(o) {
  const carry = o.carry || {}, reach = o.reach || 40;
  const anims = makeBaseAnims(carry);
  o.combo.forEach((c, i) => {
    anims['attack' + (i + 1)] = strike({
      style: c.style, startup: c.startup || 5, active: c.active || 3, recovery: c.recovery || 8, ret: c.ret || 4, carry,
      reach: c.reach || reach, behind: c.behind, high: c.high, low: c.low, area: c.area, armor: c.armor, move: c.move, event: c.event,
      sfx: c.sfx || o.swingSfx, hitSfx: c.hitSfx, fx: c.fx || [{ kind: 'slash', x: 22, y: 40, radius: 30, angle: c.style === 'uppercut' ? -60 : 10 }],
      hit: { damage: c.dmg, type: c.type || 'light', kbX: c.kbX != null ? c.kbX : 2, kbY: c.kbY || 0, hitstun: c.hitstun || 16, onHit: c.onHit },
      cancel: i === o.combo.length - 1 ? 'any' : 'attack',
    });
  });
  const ja = o.jumpAttack;
  // the air hitbox reaches below the feet and stays live through the descent (shared id = one hit per target)
  const jaBox = { id: 'jumpAttack', x: -6, y: -50, w: (ja.reach || reach) + 20, h: 78, z: 24, once: true, damage: ja.dmg, type: ja.type || 'knockdown',
    kbX: ja.kbX != null ? ja.kbX : 4, kbY: ja.kbY != null ? ja.kbY : 4, hitstun: ja.hitstun || 20, onHit: ja.onHit };
  anims.jumpAttack = {
    loop: false, frames: [
      { dur: ja.startup || 4, pose: STYLES[ja.style || 'airslam'].w, sfx: o.swingSfx, event: ja.windupEvent },
      { dur: ja.active || 5, pose: STYLES[ja.style || 'airslam'].h, move: ja.move, event: ja.event, hitbox: jaBox },
      { dur: ja.recovery || 20, pose: STYLES[ja.style || 'airslam'].r, move: ja.moveRecover, hitbox: ja.persist === false ? undefined : jaBox },
    ],
  };
  if (o.jumpAttack2) {
    const j2 = o.jumpAttack2;
    anims.jumpAttack2 = { loop: false, frames: [
      { dur: 3, pose: STYLES.shot.w }, { dur: 3, pose: P({ armL: [140, -10], armR: [20, 40], torso: 10, legR: [30, -50], legL: [10, -30], weapon: -80 }), event: 'spawnProjectile', projectile: j2.projectile, sfx: j2.sfx },
      { dur: 12, pose: P({ armL: [130, -10], armR: [20, 40], torso: 8, legR: [30, -50], legL: [10, -30], weapon: -80 }) },
    ] };
  }
  if (o.landAttack) {
    anims.landAttack = { loop: false, frames: [
      { dur: 2, pose: P({ ...carry, legR: [30, 50], legL: [-20, 50], torso: 24, root: [0, 8], squash: 1.15, stretch: 0.85 }), event: 'shockwave', radius: o.landAttack.radius, hit: { damage: o.landAttack.dmg, type: 'knockdown', kbX: 4, kbY: 4 }, sfx: 'land_heavy' },
      { dur: 10, pose: P({ ...carry, legR: [20, 30], legL: [-15, 30], torso: 12, root: [0, 4] }) },
      { dur: 6, pose: P({ ...carry, torso: 4 }), cancel: 'any' },
    ] };
  }
  const d = o.dashAttack;
  /** @type {Frame[]} */
  const dFrames = [{ dur: d.startup || 4, pose: STYLES[d.style].w, sfx: d.sfx || o.swingSfx, invuln: d.invuln || undefined, armor: d.armor || undefined }];
  const dHit = d.projectile ? null : (d.area ? areaBox(d.area, { damage: d.dmg, type: d.type || 'knockdown', kbX: d.kbX != null ? d.kbX : 6, kbY: d.kbY || 4, hitstun: d.hitstun || 20 })
    : frontBox(d.reach || reach, { damage: d.dmg, type: d.type || 'knockdown', kbX: d.kbX != null ? d.kbX : 6, kbY: d.kbY || 4, hitstun: d.hitstun || 20 }, { low: d.low, behind: d.behind }));
  dFrames.push({ dur: d.active || 8, pose: STYLES[d.style].h, hitbox: dHit || undefined, move: d.move, armor: d.armor || undefined, invuln: d.invuln || undefined,
    event: d.projectile ? 'spawnProjectile' : d.event, projectile: d.projectile, fx: d.fx || (d.projectile ? undefined : [{ kind: 'dust', x: -10, y: 0 }]) });
  dFrames.push({ dur: d.recovery || 10, pose: STYLES[d.style].r, cancel: d.cancel === false ? null : (d.cancel || 'attack'), move: d.moveRecover });
  dFrames.push({ dur: 4, pose: P({ ...carry, torso: 6 }), cancel: 'any' });
  anims.dashAttack = { loop: false, frames: dFrames };
  anims.special = o.special;
  anims.super = o.super;
  if (o.taunt) anims.taunt = o.taunt;
  if (o.extra) Object.assign(anims, o.extra);
  return anims;
}
