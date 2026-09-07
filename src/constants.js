// Shared constants (ARCHITECTURE.md sections 0, 2, 5). Never hardcode these numbers elsewhere.

/** Internal render width in px. */
export const VIEW_W = 640;
/** Internal render height in px. */
export const VIEW_H = 360;
/** Fixed timestep in seconds (logic runs at exactly 60 Hz). */
export const DT = 1 / 60;
/** Max fixed updates per animation frame (spiral-of-death clamp). */
export const MAX_STEPS_PER_FRAME = 5;
/** Screen row of the far edge of the floor band (z = 0). */
export const FLOOR_TOP = 200;
/** Floor band depth limits (z). */
export const Z_MIN = 0;
export const Z_MAX = 140;
/** Gravity in px/frame^2 and default jump velocity (docs/RECONCILIATION.md physics row). */
export const GRAVITY = 0.5;
export const JUMP_VY = 9.5;
/** Launcher / juggle re-hit / knockdown pop vertical velocities (RECONCILIATION). */
export const LAUNCH_VY = 8;
export const JUGGLE_VY = 5;
export const KNOCKDOWN_POP_VY = 4;
/** Vertical (z) movement is this fraction of horizontal walk speed. */
export const Z_SPEED_FACTOR = 0.6;
/** Camera clamp margin for entities inside lock bounds. */
export const CAMERA_MARGIN = 8;
/** Input buffer length in frames. */
export const INPUT_BUFFER = 8;
/** Default hitbox depth tolerance. */
export const HIT_Z_TOLERANCE = 24;

/** Teams. Players never hurt players; enemies never hurt enemies unless hit.friendly. */
export const TEAM = Object.freeze({ PLAYER: 0, ENEMY: 1, NONE: 2 });

/** Fighter state names (section 5). */
export const ST = Object.freeze({
  IDLE: 'IDLE', WALK: 'WALK', RUN: 'RUN', JUMP: 'JUMP', ATTACK: 'ATTACK', JUMP_ATTACK: 'JUMP_ATTACK',
  DASH_ATTACK: 'DASH_ATTACK', SPECIAL: 'SPECIAL', SUPER: 'SUPER', DODGE: 'DODGE', TAUNT: 'TAUNT',
  HURT: 'HURT', HURT_AIR: 'HURT_AIR', KNOCKDOWN: 'KNOCKDOWN', LYING: 'LYING', GETUP: 'GETUP',
  GRAB: 'GRAB', GRABBED: 'GRABBED', THROWN: 'THROWN', DEAD: 'DEAD',
});

/** Hitstop frames applied to both attacker and target per hit type (RECONCILIATION hit-stop row). */
export const HITSTOP = Object.freeze({ light: 3, medium: 5, heavy: 8, launch: 8, knockdown: 8, grab: 6, throw: 6, superFinisher: 14 });

/** Misc fighter defaults referenced by the contract. */
export const FIGHTER_DEFAULTS = Object.freeze({
  lyingFrames: 40, getupInvuln: 20, grabHoldFrames: 90, maxJuggles: 4, deadBlinkFrames: 60,
  comboTimer: 60, respawnDelay: 90, respawnInvuln: 120, hitstunLight: 14, hitstunHeavy: 22,
});

/** Meter economy: 3 bars x 100 (RECONCILIATION). special = 1 bar, super = full; HP fallback 8% max HP when no bar is full and HP > 15%. */
export const METER = Object.freeze({ max: 300, bar: 100, special: 100, super: 300, hpCostFrac: 0.08, hpCostMinFrac: 0.15, light: 4, heavy: 8, taunt: 25, damaged: 2 });

/** UI colours shared by HUD / screens. */
export const UI = Object.freeze({
  brass: '#e2b34a', brassDark: '#8a5a1c', brassLight: '#fff0b0', copper: '#c96a3a', steel: '#9aa6b2',
  ink: '#120c14', shadow: '#000000', paper: '#f4e8c8', white: '#ffffff', red: '#e03a3a', green: '#59c85a',
  blue: '#4a9ce0', teal: '#35c8b8', purple: '#8f5bd6', hp: '#e8402c', hpLow: '#ff8a2a', meter: '#3fd0ff',
  meterFull: '#ffe45a', dim: 'rgba(0,0,0,0.55)', panel: 'rgba(18,12,20,0.85)',
  p1: '#4ac0ff', p2: '#ff8a4a',
});
