// Captain Rook Halloway — move list + trials (issue #22). Numbers mirror the header comment in rook.js / GDD 2.3.
import { step, comboTrial, jumpGrabTrial, dodgeCancelTrial, throwBodyTrial } from './common.js';

/** @type {MoveEntry[]} */
export const moveList = [
  { id: 'combo', name: 'CUTLASS COMBO', input: 'ATTACK x4', desc: 'SLASH 8 > REVERSE 8 > POMMEL 10 STAGGER > POINT-BLANK SHOT 14 KNOCKDOWN, PIERCES FOR 8', anims: ['attack1', 'attack2', 'attack3', 'attack4'] },
  { id: 'jump', name: 'DOWNWARD SLASH', input: 'JUMP, ATTACK', desc: '12 DMG DOWNWARD SLASH', anim: 'jumpAttack' },
  { id: 'airShot', name: 'AIR SHOT', input: 'AIR: ATTACK AGAIN', desc: '8 DMG DOWNWARD SHOT AFTER THE SLASH', anim: 'jumpAttack2' },
  { id: 'dash', name: 'BASEBALL SLIDE', input: 'RUN + ATTACK', desc: '12 DMG, TRIPS, HURTBOX 45% (PASSES UNDER PROJECTILES)', anim: 'dashAttack' },
  { id: 'special', name: 'FAN THE HAMMER', input: 'SPECIAL (1 BAR)', desc: '5 SHOTS x6 IN A 30 DEG FAN, 200PX RANGE', anim: 'special' },
  { id: 'super', name: 'BROADSIDE', input: 'SUPER (FULL METER)', desc: '6 CANNONBALLS x25 R40 KNOCKDOWN. INVULNERABLE', anim: 'super' },
  { id: 'grab', name: 'GRAB / POMMEL HITS', input: 'ATTACK NEAR ENEMY, ATTACK', desc: 'POMMEL HITS 6 x3, THEN BOOT KICK', anims: ['grab', 'grabHit'] },
  { id: 'throw', name: 'BOOT KICK', input: 'HOLD: FWD + ATTACK', desc: '12 DMG', anim: 'throw' },
  { id: 'throwBack', name: 'HIP TOSS', input: 'HOLD: BACK + ATTACK', desc: '12 DMG, LANDS 90PX BEHIND AND BOUNCES', anim: 'throwBack' },
  { id: 'parry', name: 'PARRY', input: 'DODGE (FRAMES 1-6)', desc: 'AN ENEMY MELEE HIT IN THE FIRST 6F IS PARRIED: STUN 40F, +15 METER', anims: ['dodge', 'parry'] },
  { id: 'dodge', name: 'ROLL', input: 'DODGE', desc: 'I-FRAMES 2-12', anim: 'dodge' },
  { id: 'taunt', name: 'TAUNT', input: 'TAUNT', desc: '+25 METER OVER THE ANIMATION. INTERRUPTIBLE', anim: 'taunt' },
];

/** @type {Trial[]} */
export const trials = [
  comboTrial(4),
  { id: 'airshot', name: 'SLASH AND SHOT', hint: 'JUMP ATTACK, THEN ATTACK AGAIN IN THE AIR', window: 60, steps: [step('DOWNWARD SLASH', 'hit', 'jumpAttack'), step('AIR SHOT', 'projectile', 'jumpAttack2')] },
  { id: 'parry', name: 'PARRY RIPOSTE', hint: 'DODGE INTO THE SWING, THEN PUNISH', dummyMode: 'cpu', window: 60, steps: [step('PARRY', 'parry'), step('PUNISH', 'hit', 'attack1')] },
  { id: 'pierce', name: 'PIERCING SHOT', hint: 'LINE BOTH DUMMIES UP FOR THE COMBO ENDER', bodies: 2, spacing: 44, steps: [step('SHOT', 'hit', 'attack4'), step('PIERCE', 'hit', 'attack4')] },
  jumpGrabTrial(),
  dodgeCancelTrial(),
  throwBodyTrial(),
];
