// Brunhild Coalheart — move list + trials (issue #22). Numbers mirror the header comment in brunhild.js / GDD 2.1.
import { step, comboTrial, jumpGrabTrial, dodgeCancelTrial, throwBodyTrial } from './common.js';

/** @type {MoveEntry[]} */
export const moveList = [
  { id: 'combo', name: 'HAMMER COMBO', input: 'ATTACK x4', desc: 'SWIPE 10 > BACKHAND 10 (HITS BEHIND) > SLAM 15 KNOCKDOWN > UPPERCUT 20 LAUNCH', anims: ['attack1', 'attack2', 'attack3', 'attack4'] },
  { id: 'jump', name: 'DOWNWARD SLAM', input: 'JUMP, ATTACK', desc: '14 DMG. LANDING SHOCKWAVE 10 KNOCKDOWN, R40', anims: ['jumpAttack', 'landAttack'] },
  { id: 'dash', name: 'SHOULDER CHARGE', input: 'RUN + ATTACK', desc: '18 DMG, 120PX KNOCKBACK, 3-HIT ARMOR', anim: 'dashAttack' },
  { id: 'special', name: 'PISTON QUAKE', input: 'SPECIAL (1 BAR)', desc: 'R60 25 DMG KNOCKDOWN, GROUNDED ONLY. 8F STARTUP, INVULNERABLE', anim: 'special' },
  { id: 'super', name: 'OVERPRESSURE', input: 'SUPER (FULL METER)', desc: 'RINGS R60/100/140 FOR 30+30+40 KNOCKDOWN. INVULNERABLE', anim: 'super' },
  { id: 'grab', name: 'GRAB / HOLD HIT', input: 'ATTACK NEAR ENEMY, ATTACK', desc: 'HOLD HITS 8 x3, THEN AUTO-THROW', anims: ['grab', 'grabHit'] },
  { id: 'throw', name: 'HAMMER GOLF', input: 'HOLD: FWD + ATTACK', desc: '20 DMG, FLIES 200PX AS A PROJECTILE', anim: 'throw' },
  { id: 'throwBack', name: 'PILEDRIVER', input: 'HOLD: BACK + ATTACK', desc: '22 DMG + 40PX SHOCKWAVE 10', anim: 'throwBack' },
  { id: 'dodge', name: 'ROLL', input: 'DODGE', desc: 'I-FRAMES 2-12. CANCELS ATTACK RECOVERY', anim: 'dodge' },
  { id: 'taunt', name: 'TAUNT', input: 'TAUNT', desc: '+25 METER OVER THE ANIMATION. INTERRUPTIBLE', anim: 'taunt' },
];

/** @type {Trial[]} */
export const trials = [
  comboTrial(4),
  { id: 'landing', name: 'SLAM AND SHOCKWAVE', hint: 'JUMP ATTACK SO THE LANDING SHOCKWAVE ALSO CONNECTS', window: 40, steps: [step('DOWNWARD SLAM', 'hit', 'jumpAttack'), step('SHOCKWAVE', 'projectile', 'landAttack')] },
  jumpGrabTrial(),
  dodgeCancelTrial(),
  throwBodyTrial(),
  { id: 'armor', name: 'ARMOUR THROUGH', hint: 'LET THE DUMMY HIT YOU DURING SLAM OR UPPERCUT AND LAND IT ANYWAY', dummyMode: 'cpu', window: 30, steps: [step('ABSORB A HIT', 'armor'), step('LAND HIT 3 OR 4', 'hit', ['attack3', 'attack4'])] },
  { id: 'charge', name: 'SHOULDER CHARGE', hint: 'DOUBLE-TAP TOWARD THE DUMMY, THEN ATTACK', steps: [step('CHARGE HIT', 'hit', 'dashAttack')] },
];
