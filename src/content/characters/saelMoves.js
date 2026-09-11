// Sael Windwright — move list + trials (issue #22). Numbers mirror the header comment in sael.js / GDD 2.2.
import { step, comboTrial, jumpGrabTrial, dodgeCancelTrial, throwBodyTrial } from './common.js';

/** @type {MoveEntry[]} */
export const moveList = [
  { id: 'combo', name: 'RAPIER COMBO', input: 'ATTACK x4', desc: 'THRUST 5 > THRUST 5 > SPIN SLASH 8 FRONT+BACK > RISING LUNGE 10 LAUNCH', anims: ['attack1', 'attack2', 'attack3', 'attack4'] },
  { id: 'jump', name: 'DIVE KICK', input: 'JUMP, ATTACK', desc: '12 DMG. ON HIT SHE REBOUNDS AND CAN ACT AGAIN', anim: 'jumpAttack' },
  { id: 'dash', name: 'ARC DASH', input: 'RUN + ATTACK', desc: '60PX DASH THROUGH ENEMIES, 8 TO EACH, CANCELS INTO THE COMBO', anim: 'dashAttack' },
  { id: 'airDash', name: 'AIR DASH', input: 'AIR: DODGE', desc: 'ONE PER JUMP, WITH I-FRAMES', anim: 'airDash' },
  { id: 'doubleJump', name: 'DOUBLE JUMP', input: 'AIR: JUMP', desc: 'ONE EXTRA JUMP PER AIRBORNE STATE', anim: 'jump' },
  { id: 'special', name: 'TEMPEST WALTZ', input: 'SPECIAL (1 BAR)', desc: 'LOCKS ON WITHIN 60PX: 6 THRUSTS x4 + THUNDERCLAP 10 KNOCKDOWN', anim: 'special' },
  { id: 'super', name: 'SKY LANE', input: 'SUPER (FULL METER)', desc: 'UP TO 8 HOPS x12, THUNDERCLAP 30. INVULNERABLE', anim: 'super' },
  { id: 'grab', name: 'GRAB / HOLD HIT', input: 'ATTACK NEAR ENEMY, ATTACK', desc: 'HOLD HITS 5 x3, THEN AUTO-THROW', anims: ['grab', 'grabHit'] },
  { id: 'throw', name: 'JET-BOOT KICK', input: 'HOLD: FWD + ATTACK', desc: '12 DMG, FLIES 160PX, SHE GAINS HEIGHT', anim: 'throw' },
  { id: 'throwBack', name: 'VAULT KICK', input: 'HOLD: BACK + ATTACK', desc: '12 DMG, SENT 90PX BEHIND', anim: 'throwBack' },
  { id: 'dodge', name: 'ROLL', input: 'DODGE', desc: 'I-FRAMES 2-12, RECOVERY 5F', anim: 'dodge' },
  { id: 'taunt', name: 'TAUNT', input: 'TAUNT', desc: '+25 METER OVER THE ANIMATION. INTERRUPTIBLE', anim: 'taunt' },
];

/** @type {Trial[]} */
export const trials = [
  comboTrial(4),
  { id: 'airdash', name: 'AIR DASH KICK', hint: 'JUMP, DODGE IN THE AIR, THEN ATTACK', window: 60, steps: [step('AIR DASH', 'airDash'), step('DIVE KICK', 'hit', 'jumpAttack')] },
  { id: 'rebound', name: 'DOUBLE DIVE', hint: 'DIVE KICK, REBOUND, DIVE KICK AGAIN', window: 60, steps: [step('DIVE KICK', 'hit', 'jumpAttack'), step('DIVE KICK AGAIN', 'hit', 'jumpAttack')] },
  jumpGrabTrial(),
  dodgeCancelTrial(),
  { id: 'waltz', name: 'TEMPEST WALTZ', hint: 'SPECIAL WITHIN 60PX', window: 30, steps: [step('THRUST', ['hit', 'projectile'], 'special'), step('THRUST', ['hit', 'projectile'], 'special'), step('THRUST', ['hit', 'projectile'], 'special')] },
  throwBodyTrial(),
];
