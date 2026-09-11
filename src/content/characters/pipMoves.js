// Pip Gearlock & The Rig — move list + trials (issue #22). Numbers mirror the header comment in pip.js / GDD 2.4.
import { step, comboTrial, jumpGrabTrial, dodgeCancelTrial, throwBodyTrial } from './common.js';

/** @type {MoveEntry[]} */
export const moveList = [
  { id: 'combo', name: 'CLAW COMBO', input: 'ATTACK x3', desc: 'CLAW SWAT 12 > DOUBLE CLAP 14 FRONT+BACK STAGGER > PISTON UPPERCUT 18 LAUNCH', anims: ['attack1', 'attack2', 'attack3'] },
  { id: 'jump', name: 'BUTT-STOMP', input: 'JUMP, ATTACK', desc: '16 DMG + 30PX SHOCKWAVE KNOCKDOWN', anims: ['jumpAttack', 'landAttack'] },
  { id: 'dash', name: 'GRAPPLE SHOT', input: 'RUN + ATTACK', desc: 'CHAINED CLAW 140PX, 6 DMG, REELS THE FIRST ENEMY INTO A GRAB', anim: 'dashAttack' },
  { id: 'special', name: 'STEAM VENT', input: 'SPECIAL (1 BAR)', desc: '80PX CONE, 4 x6, PUSHBACK, PUTS OUT FIRE', anim: 'special' },
  { id: 'super', name: 'WRECKING BALL', input: 'SUPER (FULL METER)', desc: 'SWINGS THE NEAREST ENEMY, 20 PER TURN TO ALL TOUCHED, HURLS IT 300PX FOR 40', anim: 'super' },
  { id: 'grab', name: 'GRAB / CRUSH', input: 'ATTACK NEAR ENEMY, ATTACK', desc: 'REACH 30, GRABS ARMORED ENEMIES, CRUSH 8 x3', anims: ['grab', 'grabHit'] },
  { id: 'throw', name: 'HURL', input: 'HOLD: FWD + ATTACK', desc: '20 DMG, FLIES 220PX', anim: 'throw' },
  { id: 'throwBack', name: 'PILEDRIVER', input: 'HOLD: BACK + ATTACK', desc: '25 DMG + 40PX SHOCKWAVE', anim: 'throwBack' },
  { id: 'dodge', name: 'ROLL', input: 'DODGE', desc: 'I-FRAMES 2-12', anim: 'dodge' },
  { id: 'taunt', name: 'TAUNT', input: 'TAUNT', desc: '+25 METER OVER THE ANIMATION. INTERRUPTIBLE', anim: 'taunt' },
];

/** @type {Trial[]} */
export const trials = [
  comboTrial(3),
  { id: 'grapple', name: 'GRAPPLE PULL', hint: 'RUN + ATTACK FROM RANGE: THE HOOK REELS IT IN', window: 40, steps: [step('HOOK', 'projectile', 'dashAttack'), step('REEL GRAB', 'grab')] },
  { id: 'crush', name: 'CRUSH AND HURL', hint: 'GRAB, ATTACK THREE TIMES', window: 90, steps: [step('GRAB', 'grab'), step('CRUSH', 'grabHit'), step('CRUSH', 'grabHit'), step('CRUSH', 'grabHit'), step('HURL', 'throw')] },
  jumpGrabTrial(),
  dodgeCancelTrial(),
  { id: 'vent', name: 'STEAM VENT', hint: 'SPECIAL POINT-BLANK', window: 30, steps: [step('VENT', ['hit', 'projectile'], 'special'), step('VENT', ['hit', 'projectile'], 'special'), step('VENT', ['hit', 'projectile'], 'special')] },
  throwBodyTrial(),
];
