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
/** Local couch co-op slots (engine/input.js). */
export const MAX_PLAYERS = 4;
/** The lockstep session (docs/MULTIPLAYER.md): an online room holds this many players at most. */
export const NET_PLAYERS = 4;
/** ...and at least this many. Below it there is nobody to be in lockstep with. */
export const NET_MIN_PLAYERS = 2;
/** Default hitbox depth tolerance. */
export const HIT_Z_TOLERANCE = 24;

/** Simultaneous attackers allowed by party size (index = players standing; index 0 is the solo
 *  value so an all-dead party never reads undefined). GDD/ARCHITECTURE section 8. */
export const ATTACK_TOKENS_BY_PARTY = Object.freeze([2, 2, 3, 4, 4]);
/** Extra non-sky spawn clones `stage.js queueSpawns` appends for parties of 3 and 4 (index = party size). */
export const WAVE_EXTRA_BY_PARTY = Object.freeze([0, 0, 0, 1, 2]);
/** Delay (frames) added to a party-scaled spawn clone so it does not land on top of its original. */
export const PARTY_EXTRA_DELAY = 30;

/** Difficulty levels. The order is the wire index net/protocol.js encodeStart sends. */
export const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);

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
  comboTimer: 90, respawnDelay: 90, respawnInvuln: 120, hitstunLight: 14, hitstunHeavy: 22,
});

/** Meter economy: 3 bars x 100 (RECONCILIATION). special = 1 bar, super = full; HP fallback 8% max HP when no bar is full and HP > 15%. */
export const METER = Object.freeze({ max: 300, bar: 100, special: 100, super: 300, hpCostFrac: 0.08, hpCostMinFrac: 0.15, light: 4, heavy: 8, taunt: 25, damaged: 2 });

/** Thrown weapons / props (GDD 7, issue #21): `vz` z drift per frame from an up/down throw, `holdLift` / `holdWalk`
 *  a held prop's pose lift and walk-speed multiplier, `botRange` max gap a bot's throwChance may fire across,
 *  `life` max flight frames before a thrown item lands on its own, `weaponR` a thrown weapon's hit radius. */
export const THROW = Object.freeze({ vz: 2, holdLift: 30, holdWalk: 0.7, botRange: 200, life: 120, weaponR: 8 });

/** Reach window shared by Player.findGrabTarget (game/player.js) and findLiftProp (game/throwables.js, issue #21):
 *  a target/prop up to `GRAB_REACH_BEHIND`px behind the front foot, up to `traits.grabReach + GRAB_REACH_AHEAD_EXTRA`
 *  ahead of it, within `GRAB_Z_TOL`px of z -- kept in one place so a lift-range tweak can never silently drift from
 *  the grab range it is defined to mirror. */
export const GRAB_REACH_BEHIND = 4, GRAB_REACH_AHEAD_EXTRA = 28, GRAB_Z_TOL = 14;

/** UI colours shared by HUD / screens. */
export const UI = Object.freeze({
  brass: '#e2b34a', brassDark: '#8a5a1c', brassLight: '#fff0b0', copper: '#c96a3a', steel: '#9aa6b2',
  ink: '#120c14', shadow: '#000000', paper: '#f4e8c8', white: '#ffffff', red: '#e03a3a', green: '#59c85a',
  blue: '#4a9ce0', teal: '#35c8b8', purple: '#8f5bd6', hp: '#e8402c', hpLow: '#ff8a2a', meter: '#3fd0ff',
  meterFull: '#ffe45a', dim: 'rgba(0,0,0,0.55)', panel: 'rgba(18,12,20,0.85)',
  p1: '#4ac0ff', p2: '#ff8a4a', p3: '#b884ff', p4: '#ff6ad5',
});

/** Per-slot HUD/cursor colour, indexed by player slot 0..3. */
export const PLAYER_COLORS = Object.freeze([UI.p1, UI.p2, UI.p3, UI.p4]);
/** Bust tint for the Nth duplicate copy of a hero (index = other players already on that hero, capped at 3). */
export const DUP_TINTS = Object.freeze([null, '#1a1a2e', '#2e1a1a', '#1a2e1a']);
export const DUP_TINT_ALPHA = 0.3;
