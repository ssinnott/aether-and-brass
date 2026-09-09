// Stage 3 final boss: FACTOR ORIEL HASP, THE CHANDLERY OF CALDERWICK (docs/STAGE3.md section 4).
// Three phases on the counting floor, each one taking the company off him:
//   1. THE FACTOR      (400) — cap, coat, ledger, cane: a fast cane string that chains into a behind-hitting flick,
//      the Tallyman's TALLY at boss length, and a hand-bell that brings the company in at 66% and 33%.
//   2. THE COMPANY MAN (360) — cap off, sleeves rolled, the yard's kiln-lamp harness lit on his chest. He doses
//      HIMSELF with the Purser's dram, throws a quicklime cone off the harness, and every 150 HP the harness blows
//      its relief and he stalls at 2x damage.
//   3. THE LEDGER      (240) — no harness, no rites, no armour, grabbable: cane raps into a ledger-spine slam and
//      two lobbed wax seals you can bat back at him.
//
// The three phases are three SILHOUETTES (docs/ART_STYLE 0.6 / 11), and each one is narrower than the last:
//   1. TALL — peaked company cap, floor-length coat, the ledger held out on the far forearm, cane at the carry.
//   2. WIDE — the cap is gone and the hair is out, and the harness puts a lit kiln drum and two shoulder straps
//      across the chest: the only phase where he is carrying anything himself.
//   3. SMALL — shirt sleeves, nothing on his head, nothing on his chest, the book in one hand and the cane in the
//      other. The palette does the last step: the coat's tallow gold gives way to a quicklime shirt.
// Rig, parts and rite plumbing from ./chandlerRig.js; the rites themselves (dram, tally, limecrust) are the line
// variants' own, imported from ./chandler.js — the company runs one set of books.
import { frontBox } from './common.js';
import {
  CH, CH_PAL, CH_PROPS, CH_PARTS, CLAN, BASE_HOOKS, makeChandlerBase, chandStrike, drawLamp, isClient, riteFlash,
  FK, celRect, celBall, celPoly, celCapsule, tones, TAU,
} from './chandlerRig.js';
import { band } from '../../art/shading.js';
import { farShade } from '../../art/palettes.js';
import { pathPoly, paint } from '../../art/shapes.js';
import { dose, TALLIED } from './chandler.js';
import { floatText } from '../../art/fx.js';
import { particles } from '../../engine/particles.js';
import { audio } from '../../engine/audio.js';

const R = Math.round;
const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, once: true, ...(extra || {}) });
const BEHIND = { behind: true };
/** The factor's rank: the Purser's officer amber, which is the highest colour on the company ladder. */
const RANK = CLAN.purser;
const KILN = '#394249', WAX = '#8E2F38';
/** The ledger rides the FAR forearm, so its board and its clasp are precomputed far tones (ART_STYLE 0.3 / 5). */
const BOOK_FAR = farShade(CH.quicklime, 0.62, 0.25), CLASP_FAR = farShade(CH.pewter, 0.62, 0.25), SPINE_FAR = farShade(RANK, 0.62, 0.25);

// ---------------------------------------------------------------- the company's things
/** The ledger itself (handL space): a heavy bound board with a brass clasp and the chain that keeps it in the house. */
function drawFactorLedger(ctx, rig) {
  celRect(ctx, rig, -2, -17, 15, 21, 1, BOOK_FAR, 0.4, 0.25);
  if (rig.override) return;
  band(ctx, rig, -2, -17, 5, 21, SPINE_FAR, 1);                 // the bound spine, in his own rank colour
  band(ctx, rig, 8, -10, 5, 6, CLASP_FAR, 1);                   // the clasp
  ctx.fillStyle = tones(rig, BOOK_FAR).sh;
  for (let i = 0; i < 3; i++) ctx.fillRect(4, -14 + i * 5, 8, 2);
}
/** The dram flask on a hip strap: the Purser's bottle, at the rank that never has to pour one for itself. */
function drawFlask(ctx, rig) {
  const hw = R(rig.p.hip / 2);
  celRect(ctx, rig, hw - 1, -6, 9, 14, 3, CH.pewter, 0.4, 0.26);
  if (rig.override) return;
  band(ctx, rig, hw, -6, 7, 4, RANK, 1);
  ctx.fillStyle = rig.col(CH.leather); ctx.fillRect(hw - 3, -4, 4, 3);
}
/**
 * Phase 2 only: the yard's kiln-lamp harness (torso space) — a small charge drum on his chest between two shoulder
 * straps, with the lamp burning in its grate. `rig.venting` blows the relief: the drum goes white and steams, which
 * is the tell for the 110-frame double-damage window.
 */
function drawHarness(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), H = p.torsoH;
  celPoly(ctx, rig, [-hw - 1, -H + 4, -hw + 4, -H + 1, hw + 2, R(-H * 0.5), hw, R(-H * 0.5) + 6, -hw - 1, -H + 10], CH.leather, 0.4, 0.22);
  celRect(ctx, rig, R(-hw * 0.5), R(-H * 0.62), 17, 19, 4, CH.pewter, 0.38, 0.3);
  celCapsule(ctx, rig, R(hw * 0.4), R(-H * 0.62), R(hw * 0.5), R(-H * 1.02), 3, KILN, 0.3);
  drawLamp(ctx, rig, R(-hw * 0.5) + 8, R(-H * 0.42), 1.15);
  if (rig.override) return;
  band(ctx, rig, R(-hw * 0.5) + 1, R(-H * 0.6), 15, 4, RANK, 1);
  if (!rig.venting) return;
  ctx.fillStyle = 'rgba(230,236,220,0.4)';
  ctx.beginPath(); ctx.arc(R(-hw * 0.5) + 8, R(-H * 0.48), 18, 0, TAU); ctx.fill();
  ctx.fillStyle = rig.col(CH.hot); ctx.fillRect(R(-hw * 0.5) + 6, R(-H * 0.52), 5, 3);
  ctx.fillStyle = rig.col(CH.quicklime); ctx.fillRect(R(hw * 0.4) - 2, R(-H * 1.02), 6, 4);
}
/** The company cane: the Purser's, at the length a man carries who has never had to hit anybody with it. */
function drawFactorCane(ctx, rig) {
  celRect(ctx, rig, -10, -2, 48, 4, 1, CH.rubber, 0.4, 0.2);
  celBall(ctx, rig, -10, 0, 4, CH.pewter, false);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CH.pewter); ctx.fillRect(32, -2.5, 6, 5);
  band(ctx, rig, 8, -2, 5, 4, RANK, 1);
}
/** The wax seals of phase 3: a lead disc in a wax collar, lobbed underarm and REFLECTABLE for 26 back at him. */
const WAXSEAL = {
  style: 'stone', kind: 'lob', aimAt: true, flight: 30, gravity: 0.5, bounces: 0, rest: false, offsetX: 10, offsetY: 46, r: 6, muzzle: false,
  color: WAX, damage: 12, type: 'knockdown', kbX: 3, kbY: 4, hitstun: 20, friendly: true,
  reflectable: true, damageOnReflect: 26, reflectSpeed: 7,
  onReflect(p) { p.vy = 0; p.gravity = 0; p.startX = p.x; p.maxDist = 320; },
  draw(ctx, p, sx, sy) {
    ctx.save(); ctx.translate(sx, sy - p.r); ctx.rotate(p.spin * 1.4);
    pathPoly(ctx, [-6, -3, -3, -6, 3, -6, 6, -3, 6, 3, 3, 6, -3, 6, -6, 3]);
    paint(ctx, p.reflected ? CH.lime : WAX, CH.outline, 1);
    ctx.fillStyle = p.reflected ? CH.hot : CH.pewter; ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  },
};

// ---------------------------------------------------------------- rites
/** TALLY, at boss length: the numeral lands and the whole room re-points at whoever is wearing it. */
function tally(f, world) {
  const t = f.target;
  if (!t) return;
  t.applyStatus('tallied', TALLIED, f);
  for (const e of world.enemies) {
    if (e === f || e.dead) continue;
    if (Math.abs(e.x - f.x) < 260) { e.target = t; e.retargetTimer = 120; e.attackCooldown = 0; }
  }
}
/**
 * THE ACCOUNT IS CLOSED. The rite dies with the ritualist however it died, and he is holding the whole ledger: when
 * the Factor goes down, every rite on the field pops in the same frame — crust, dose, mend and tally, on everything
 * still standing, whoever wrote it. clearStatus runs each rite's own onEnd, so the armour, the damage multipliers and
 * the walk speeds all go back exactly the way the Limeburner's and the Purser's do.
 */
const RITES = ['limecrust', 'dosed', 'mended', 'tallied'];
function closeTheAccount(f, world) {
  if (!world) return;
  let n = 0;
  for (const list of [world.enemies, world.players]) {
    for (const e of list || []) {
      if (!e || !e.status) continue;
      for (const r of RITES) if (e.hasStatus(r)) { e.clearStatus(r); n++; }
    }
  }
  if (!n) return;
  floatText(f.x, f.y + f.h + 16, f.z, 'ACCOUNT CLOSED', CH.lime, 2);
  world.addFx('ring', f.x, 40, f.z, { r0: 10, r1: 160, color: CH.lime });
  audio.play('chime');
}

// ---------------------------------------------------------------- builds
const CANE = { attach: 'handR', length: 48, draw: drawFactorCane, headAt: 36 };
const FACTOR_CHAND = {
  cap: 'peaked', capCol: '#3E4A42', rites: ['tally'], lampJoint: 'torso', lampDX: 15, lampDY: 4, selfConeDX: 30,
  find: (f) => f.target || null, cool: (f) => f.attackCooldown,
};
const MAN_CHAND = { ...FACTOR_CHAND, cap: 'none', rites: ['dram'], lampJoint: 'torso', lampDX: 4, lampDY: -14, selfConeDX: 26, find: (f, world) => {
  for (const e of world.enemies) if (isClient(e, f) && Math.abs(e.x - f.x) < 200 && !e.hasStatus('dosed')) return e;
  return f;
} };
const LEDGER_CHAND = { ...FACTOR_CHAND, cap: 'none', rites: [], find: () => null };
const BASE_BUILD = {
  palette: CH_PAL, outline: CH.outline, outlineWidth: 1, proportions: CH_PROPS, parts: CH_PARTS,
  smearColor: CH.limedust, clan: RANK, weapon: CANE,
};
/** Phase 1: the tallest, widest shape — cap, coat, book held out on the far arm. */
const FACTOR_BUILD = { ...BASE_BUILD, scale: 1.3, chand: FACTOR_CHAND,
  accessories: [{ attach: 'handL', draw: drawFactorLedger }, { attach: 'hip', draw: drawFlask }] };
/** Phase 2: no cap, and the one phase where the company's own machine is strapped to him. */
const MAN_BUILD = { ...BASE_BUILD, scale: 1.3, chand: MAN_CHAND,
  accessories: [{ attach: 'torso', draw: drawHarness }, { attach: 'hip', draw: drawFlask }] };
/** Phase 3: the coat's tallow gold goes to a quicklime shirt — the last thing the company owns coming off. */
const LEDGER_BUILD = { ...BASE_BUILD, scale: 1.25, chand: LEDGER_CHAND,
  palette: { ...CH_PAL, primary: CH.quicklime, sleeve: CH.limedust },
  accessories: [{ attach: 'handL', draw: drawFactorLedger }] };

// ---------------------------------------------------------------- animations
const FC = { armR: [28, 26], weapon: -22, armL: [-38, -56] };
const CANE_BOX = frontBox(58, hit(12, 'light', 4, 0, 16));
const FLICK_BOX = frontBox(54, hit(14, 'medium', 5, 0, 18), BEHIND);
const CONE_BOX = frontBox(72, hit(18, 'knockdown', 6, 3, 22));
const SPINE_BOX = frontBox(54, hit(22, 'knockdown', 5, 5, 24));
const common = {
  // intro: he finishes the line he was writing, closes the book and looks up. He does not stand up out of a chair;
  // he was always going to be standing here.
  intro: { loop: false, frames: [
    FK(26, { ...FC, armL: [-14, 40], torso: 6, head: 10, root: [0, 1], legR: [10, 6], legL: [-10, 6] }, { sfx: 'chime', ease: 'out' }),
    FK(24, { ...FC, armL: [-46, -40], torso: -6, head: -10, root: [-1, 0], legR: [10, 8], legL: [-12, 8], face: 'angry' }, { sfx: 'prop_break', ease: 'inout' }),
    FK(22, { ...FC, armR: [46, 14], weapon: -6, torso: 4, head: 0, root: [1, 0], legR: [10, 6], legL: [-10, 6], face: 'angry' }, { ease: 'inout' }),
  ] },
  phaseChange: { loop: false, frames: [
    FK(16, { ...FC, torso: -20, head: -20, armR: [-32, 36], armL: [-70, -30], root: [-4, 0], legR: [14, 8], legL: [-16, 12], face: 'hurt' }, { sfx: 'prop_break', ease: 'out' }),
    FK(16, { ...FC, torso: 18, head: 4, root: [0, 3], legR: [30, 40], legL: [-22, 40], squash: 1.1, stretch: 0.92, face: 'grit' },
      { ease: 'in', fx: [{ kind: 'ring', x: 0, y: 40, r0: 10, r1: 120, color: CH.lime }, { kind: 'steam', x: 0, y: 40, count: 6 }] }),
    FK(14, { ...FC, torso: 4, head: -4, root: [0, 1], legR: [10, 6], legL: [-10, 6], face: 'angry' }, { ease: 'out' }),
  ] },
  // defeat: the cane goes one way, the book the other, and the man who has never been in a fight sits down in one
  defeat: { loop: false, frames: [
    FK(22, { ...FC, torso: -16, head: -24, armR: [-18, 52], weapon: -60, armL: [-74, -48], root: [-4, 0], legR: [24, 6], legL: [-16, 14], face: 'hurt' },
      { sfx: 'prop_break', ease: 'out' }),
    FK(20, { ...FC, torso: 28, head: -2, armR: [44, 42], armL: [26, 36], root: [0, 5], legR: [46, 42], legL: [-30, 50], squash: 1.12, stretch: 0.9, face: 'dazed' },
      { ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }, { kind: 'spark', x: 0, y: 30, count: 8 }] }),
    FK(70, { armR: [-22, -6], weapon: -14, armL: [28, 18], torso: 8, head: -16, legR: [12, 10], legL: [-4, 8], root: [26, -8, -88], face: 'dazed' }, { ease: 'out' }),
  ] },
};
/** The cane string: a fencer's rap that chains into the flick. Shared by all three phases (it is all he ever had). */
const cane = chandStrike({
  tell: 14, active: 6, recovery: 18, carry: FC, tellSfx: 'rapier', sfx: 'rapier',
  hitbox: CANE_BOX, move: { x: 3 }, smear: { from: -20, to: 25, a: 0.4, r: 60 },
  fx: [{ kind: 'slash', x: 50, y: 46, radius: 16, angle: 0, sweep: 36 }],
  w1: { ...FC, armR: [-24, 66], weapon: -66, armL: [-44, -56], torso: -8, head: -2, root: [-3, 0], legR: [12, 8], legL: [-12, 10], face: 'angry' },
  w2: { ...FC, armR: [-36, 76], weapon: -80, armL: [-48, -54], torso: -14, head: -4, root: [-5, 0], legR: [10, 8], legL: [-14, 12], squash: 0.97, stretch: 1.03, face: 'grit' },
  h: { ...FC, armR: [94, -6], weapon: 18, armL: [-44, -10], torso: 22, head: 2, root: [6, 0], legR: [42, 8], legL: [-32, 30], face: 'shout', squash: 1.03, stretch: 0.97 },
  hold: { ...FC, armR: [98, -8], weapon: 20, armL: [-46, -10], torso: 24, head: 2, root: [7, 0], legR: [42, 8], legL: [-32, 30], face: 'shout' },
  r: { ...FC, armR: [72, 10], weapon: -18, armL: [-38, -52], torso: 12, head: 0, root: [4, 1], legR: [30, 8], legL: [-24, 24], face: 'grit' },
});
/** The flick: the Purser's backhand, and the reason walking through him does not solve him. */
const flick = chandStrike({
  tell: 10, active: 6, recovery: 22, carry: FC, tellSfx: 'whiff', sfx: 'rapier_arc',
  hitbox: FLICK_BOX, smear: { from: -150, to: 40, a: 0.38, r: 54 },
  fx: [{ kind: 'slash', x: -22, y: 46, radius: 22, angle: 0, sweep: 120 }],
  w1: { ...FC, armR: [-78, -30], weapon: -20, armL: [-40, -14], torso: -6, head: -4, root: [-2, 0], legR: [10, 8], legL: [-10, 10], face: 'angry' },
  w2: { ...FC, armR: [-94, -34], weapon: -14, armL: [-36, -12], torso: -10, head: -6, root: [-4, 0], legR: [8, 8], legL: [-12, 12], squash: 0.97, stretch: 1.03, face: 'grit' },
  h: { ...FC, armR: [128, -14], weapon: 26, armL: [-30, -8], torso: 18, head: 4, root: [4, 0], legR: [32, 10], legL: [-24, 22], face: 'shout', squash: 1.04, stretch: 0.96 },
  hold: { ...FC, armR: [132, -12], weapon: 28, armL: [-32, -8], torso: 20, head: 4, root: [5, 0], legR: [32, 10], legL: [-24, 22], face: 'shout' },
  r: { ...FC, armR: [106, 0], weapon: 0, armL: [-46, -18], torso: 10, head: 0, root: [3, 1], legR: [28, 8], legL: [-22, 20], face: 'grit' },
});
const p1Anims = Object.assign(makeChandlerBase(FC, { stoop: 2, head: 0, weaponFloor: -26, gait: 'parade' }), common, {
  cane,
  flick,
  // TALLY: the chalk comes out over the shoulder and the numeral goes onto whoever he is looking at. No hitbox, and
  // the finish HOLDS — the cane stays out, pointing at the hero he has just written down, for the whole recovery.
  tally: chandStrike({
    tell: 34, active: 8, recovery: 34, carry: FC, tellSfx: 'chime', sfx: 'chime', event: 'tally',
    smear: { from: -140, to: 48, a: 0.4, r: 58 }, fx: [{ kind: 'slash', x: 44, y: 50, radius: 24, angle: 0, sweep: 90 }],
    w1: { ...FC, armR: [-44, -48], weapon: 58, armL: [-30, -30], torso: -6, head: -12, root: [-3, 0], legR: [10, 8], legL: [-16, 10], face: 'angry' },
    w2: { ...FC, armR: [-124, -38], weapon: -40, armL: [-24, -22], torso: -18, head: -20, root: [-5, -1], legR: [8, 8], legL: [-18, 12], squash: 0.96, stretch: 1.05, face: 'shout' },
    h: { ...FC, armR: [58, 8], weapon: 48, armL: [-30, -18], torso: 30, head: 8, root: [5, 1], legR: [36, 10], legL: [-28, 26], face: 'shout', squash: 1.05, stretch: 0.96 },
    hold: { ...FC, armR: [66, -6], weapon: 36, armL: [-32, -16], torso: 28, head: 10, root: [6, 1], legR: [36, 10], legL: [-28, 26], face: 'shout' },
    r: { ...FC, armR: [70, -12], weapon: 30, armL: [-34, -24], torso: 24, head: 10, root: [6, 1], legR: [34, 10], legL: [-26, 24], face: 'grit' },
  }),
  // the hand-bell: he does not shout for help, he rings for it (Boss.afterDamage plays this at 66% and 33%)
  summonEscort: chandStrike({
    tell: 24, active: 8, recovery: 30, carry: FC, tellSfx: 'chime', sfx: 'chime',
    event: 'summon', summon: [{ type: 'chandler', variant: 'wickboy' }, { type: 'chandler', variant: 'limeburner' }],
    fx: [{ kind: 'ring', x: 0, y: 40, r0: 4, r1: 46, color: CH.lime }],
    w1: { ...FC, armR: [30, 24], weapon: -22, armL: [-96, -40], torso: -4, head: -4, root: [-2, 0], legR: [12, 6], legL: [-12, 8], face: 'angry' },
    w2: { ...FC, armR: [28, 26], weapon: -22, armL: [-152, -20], torso: -12, head: -14, root: [-4, -1], legR: [10, 6], legL: [-14, 10], squash: 0.97, stretch: 1.04, face: 'grit' },
    h: { ...FC, armR: [26, 28], weapon: -22, armL: [-172, -6], torso: -16, head: -18, root: [0, 1], legR: [14, 6], legL: [-16, 10], face: 'shout', squash: 0.95, stretch: 1.06 },
    hold: { ...FC, armR: [26, 28], weapon: -22, armL: [-168, -4], torso: -14, head: -16, root: [0, 2], legR: [14, 6], legL: [-16, 10], face: 'shout' },
    r: { ...FC, armR: [30, 26], weapon: -22, armL: [-104, -16], torso: -2, head: -6, root: [0, 1], legR: [12, 6], legL: [-12, 8], face: 'angry' },
  }),
});
const p2Anims = Object.assign(makeChandlerBase(FC, { stoop: 6, head: 0, weaponFloor: -26, gait: 'work' }), common, {
  cane,
  flick,
  // DRAM, on himself: the cork comes off with his teeth and the harness floods. One touch in the 32f pour and it is
  // gone for 90 frames, which is the single most valuable interrupt on the board.
  dram: chandStrike({
    tell: 32, active: 8, recovery: 32, carry: FC, tellSfx: 'bomb_bat', sfx: 'chime', event: 'dram',
    fx: [{ kind: 'ring', x: 8, y: 26, r0: 4, r1: 44, color: CH.lime }, { kind: 'spark', x: 6, y: 40, count: 5 }],
    w1: { ...FC, armR: [16, 24], weapon: 0, armL: [54, 44], torso: -8, head: -4, root: [-3, 0], legR: [10, 8], legL: [-14, 12], face: 'angry' },
    w2: { ...FC, armR: [34, 30], weapon: -4, armL: [144, -14], torso: 4, head: -12, root: [-1, -1], legR: [8, 6], legL: [-10, 8], squash: 0.94, stretch: 1.07, face: 'shout' },
    h: { ...FC, armR: [38, 26], weapon: -6, armL: [154, -20], torso: 6, head: -14, root: [-1, -1], legR: [8, 6], legL: [-10, 8], face: 'shout' },
    hold: { ...FC, armR: [36, 26], weapon: -6, armL: [150, -18], torso: 6, head: -12, root: [-1, 0], legR: [8, 6], legL: [-10, 8], face: 'shout' },
    r: { ...FC, armR: [30, 26], weapon: -14, armL: [0, -46], torso: 2, head: -2, root: [1, 1], legR: [12, 8], legL: [-12, 10], face: 'grit' },
  }),
  // lime cone: he opens the harness grate and throws a 72px wedge of quicklime off his own chest
  limeCone: chandStrike({
    tell: 30, active: 10, recovery: 32, carry: FC, tellSfx: 'steam_vent', sfx: 'steam',
    hitbox: CONE_BOX, smear: { from: -40, to: 30, a: 0.3, r: 70 },
    fx: [{ kind: 'ring', x: 40, y: 24, r0: 6, r1: 74, flat: true, color: CH.quicklime }, { kind: 'steam', x: 46, y: 20, count: 6 }],
    w1: { ...FC, armR: [-30, 60], weapon: -40, armL: [-52, 30], torso: 10, head: 4, root: [-2, 1], legR: [14, 10], legL: [-14, 12], face: 'angry' },
    w2: { ...FC, armR: [-52, 74], weapon: -58, armL: [-70, 44], torso: -8, head: -12, root: [-5, 0], legR: [10, 8], legL: [-18, 14], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { ...FC, armR: [40, 20], weapon: -10, armL: [46, 26], torso: 26, head: 6, root: [5, 1], legR: [38, 14], legL: [-30, 30], face: 'shout', squash: 1.05, stretch: 0.96 },
    hold: { ...FC, armR: [44, 22], weapon: -6, armL: [50, 26], torso: 28, head: 6, root: [6, 1], legR: [38, 14], legL: [-30, 30], face: 'shout' },
    r: { ...FC, armR: [34, 24], weapon: -18, armL: [20, 10], torso: 18, head: 2, root: [3, 1], legR: [26, 12], legL: [-22, 24], face: 'grit' },
  }),
  // ledger slam: the book, two-handed, straight down. The only thing he owns that weighs anything.
  ledgerSlam: chandStrike({
    tell: 22, active: 9, recovery: 28, carry: FC, tellSfx: 'hammer_swing', sfx: 'hammer_slam',
    hitbox: SPINE_BOX, smear: { from: -150, to: 46, a: 0.42, r: 60 },
    fx: [{ kind: 'dust', x: 52, y: 0, count: 6 }, { kind: 'ring', x: 52, y: 0, r0: 4, r1: 32, flat: true, color: CH.quicklime }],
    w1: { ...FC, armR: [-70, -34], weapon: 24, armL: [-84, -28], torso: -8, head: -10, root: [-3, 0], legR: [10, 6], legL: [-16, 12], face: 'angry' },
    w2: { ...FC, armR: [-126, -24], weapon: 10, armL: [-134, -20], torso: -18, head: -18, root: [-6, -1], legR: [8, 6], legL: [-18, 14], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { ...FC, armR: [20, -6], weapon: -24, armL: [26, -4], torso: 36, head: 10, root: [6, 3], legR: [44, 26], legL: [-32, 34], face: 'shout', squash: 1.08, stretch: 0.93 },
    hold: { ...FC, armR: [22, -4], weapon: -22, armL: [28, -2], torso: 38, head: 10, root: [6, 3], legR: [44, 26], legL: [-32, 34], face: 'shout' },
    r: { ...FC, armR: [30, 8], weapon: -30, armL: [8, -20], torso: 26, head: 4, root: [4, 2], legR: [34, 20], legL: [-26, 28], face: 'grit' },
  }),
});
const p3Anims = Object.assign(makeChandlerBase(FC, { stoop: 4, head: 0, weaponFloor: -26, gait: 'work' }), common, {
  // rap: the cane string again, faster, chaining into the spine slam
  rap: chandStrike({
    tell: 10, active: 5, recovery: 14, carry: FC, tellSfx: 'rapier', sfx: 'rapier',
    hitbox: frontBox(56, hit(10, 'light', 4, 0, 14)), move: { x: 3 }, smear: { from: -18, to: 26, a: 0.36, r: 58 },
    fx: [{ kind: 'slash', x: 48, y: 46, radius: 15, angle: 0, sweep: 34 }],
    w1: { ...FC, armR: [-22, 64], weapon: -64, armL: [-40, -50], torso: -6, head: -2, root: [-3, 0], legR: [12, 8], legL: [-12, 10], face: 'angry' },
    w2: { ...FC, armR: [-32, 74], weapon: -78, armL: [-44, -48], torso: -12, head: -4, root: [-5, 0], legR: [10, 8], legL: [-14, 12], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...FC, armR: [92, -6], weapon: 16, armL: [-40, -8], torso: 20, head: 2, root: [6, 0], legR: [40, 8], legL: [-30, 28], face: 'shout', squash: 1.03, stretch: 0.97 },
    hold: { ...FC, armR: [96, -8], weapon: 18, armL: [-42, -8], torso: 22, head: 2, root: [7, 0], legR: [40, 8], legL: [-30, 28], face: 'shout' },
    r: { ...FC, armR: [68, 10], weapon: -16, armL: [-34, -46], torso: 10, head: 0, root: [4, 1], legR: [28, 8], legL: [-22, 22], face: 'grit' },
  }),
  spine: p2Anims.ledgerSlam,
  flick,
  // the seals: he lobs them underarm off the desk, and they come back for 26 if you send one home
  seal: chandStrike({
    tell: 24, active: 6, recovery: 28, carry: FC, tellSfx: 'sling', sfx: 'throw',
    aimEvent: 'aim', event: 'spawnProjectile', projectile: WAXSEAL, smear: { from: 20, to: 52, a: 0.28, r: 48 },
    w1: { ...FC, armR: [22, 48], weapon: 20, armL: [-84, -10], torso: -2, head: -6, root: [-6, 0], legR: [2, 10], legL: [-22, 22], face: 'angry' },
    w2: { ...FC, armR: [26, 54], weapon: 24, armL: [-128, -22], torso: -12, head: -14, root: [-9, 1], legR: [0, 12], legL: [-28, 26], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...FC, armR: [20, 44], weapon: 14, armL: [68, -20], torso: 18, head: 6, root: [5, 1], legR: [28, 8], legL: [-20, 20], face: 'shout', squash: 1.04, stretch: 0.96 },
    hold: { ...FC, armR: [20, 42], weapon: 12, armL: [78, -14], torso: 20, head: 6, root: [6, 1], legR: [28, 8], legL: [-20, 20], face: 'shout' },
    r: { ...FC, armR: [24, 40], weapon: 8, armL: [48, 6], torso: 16, head: 2, root: [4, 1], legR: [22, 8], legL: [-18, 18], face: 'grit' },
  }),
});

/** Factor Oriel Hasp, the Chandlery of Calderwick — the Stage 3 final boss. */
export const boss3 = {
  id: 'boss3', type: 'boss3', variant: 'hasp', name: 'FACTOR ORIEL HASP', subtitle: 'THE CHANDLERY OF CALDERWICK',
  role: 'boss', bossKind: 'boss', boss: true, music: 'ledgerboss',
  build: FACTOR_BUILD, anims: p1Anims, score: 15000, drops: ['food_big', 'meter', 'score_big'],
  grabbable: false, throwDamageMult: 1, sfx: { hurt: 'hydraulic', death: 'prop_break' },
  traits: { flinchEvery: 2, weight: 1.3 },
  hooks: {
    // the faction contract first (lamp, recipient, ONE TOUCH BREAKS A RITE, the floor cone and tether), then his own
    ...BASE_HOOKS,
    /** Art state: the harness relief stands open for exactly as long as the vent window does. */
    onUpdate(f, world) {
      BASE_HOOKS.onUpdate(f, world);
      f.rig.venting = f.ventTimer > 0;
    },
    onAnimEvent(f, name, frame, world) {
      if (name === 'tally') { riteFlash(f, world); tally(f, world); return true; }
      if (name === 'dram') {
        riteFlash(f, world);
        // he is the only Chandler in the game who doses HIMSELF first: the company does not insure its own, and by
        // this phase he is the company. An ally within reach gets the second measure.
        dose(f, f);
        for (const e of world.enemies) if (isClient(e, f) && Math.abs(e.x - f.x) < 200 && dose(e, f)) break;
        return true;
      }
      return false;
    },
    onPhase(f, i, world) {
      if (!world) return;
      particles.burst('spark', f.x, f.h * 0.6, f.z, 12, { speed: 3, up: 2.4, color: CH.lime });
      if (i === 2) particles.burst('debris', f.x, f.h * 0.5, f.z, 10, { speed: 3, up: 2, color: CH.pewter, sizeJitter: 2 });
    },
    /** THE ACCOUNT IS CLOSED: the whole ledger pops with him. */
    onDeath(f, world) { BASE_HOOKS.onDeath(f, world); closeTheAccount(f, world); },
  },
  ai: { attackRange: 58, zTolerance: 16, attackCooldown: [44, 82], firstAttackDelay: 44, ignoresTokens: true, retreatChance: 0, tellWarnFrames: 14 },
  phases: [
    { name: 'THE FACTOR', hp: 400, color: '#D68C24', armor: false, walkSpeed: 1.6,
      summonAt: [0.66, 0.33], summon: [{ type: 'chandler', variant: 'wickboy' }, { type: 'chandler', variant: 'limeburner' }],
      ai: { attacks: [{ anim: 'cane', range: 64, weight: 4, chain: 'flick' }, { anim: 'flick', range: 58, weight: 2 },
        { anim: 'tally', range: 260, minRange: 0, weight: 2, tellFrames: 34 }] } },
    { name: 'THE COMPANY MAN', hp: 360, color: CH.lime, armor: false, walkSpeed: 1.9,
      build: MAN_BUILD, anims: p2Anims, bandShrink: 16,
      // the harness blows its relief every 150 HP: he stops attacking and takes double damage until it closes
      vent: { everyHp: 150, frames: 110, flag: 'venting', damageMult: 2, grabbable: false, stall: true, text: 'HARNESS VENTING!' },
      ai: { attackCooldown: [40, 74],
        attacks: [{ anim: 'limeCone', range: 84, weight: 4 }, { anim: 'ledgerSlam', range: 62, weight: 3 },
          { anim: 'cane', range: 64, weight: 2, chain: 'flick' }, { anim: 'dram', range: 300, minRange: 0, weight: 2, tellFrames: 32 }] } },
    { name: 'THE LEDGER', hp: 240, color: '#E6ECDC', armor: false, unlaunchable: false, grabbable: true, walkSpeed: 2.4,
      build: LEDGER_BUILD, anims: p3Anims,
      ai: { attackRange: 54, zTolerance: 14, attackCooldown: [26, 56], evadeChance: 0.4, evadeCooldown: 90,
        attacks: [{ anim: 'rap', range: 62, weight: 5, chain: 'spine' }, { anim: 'spine', range: 58, weight: 2 },
          { anim: 'flick', range: 56, weight: 2 }, { anim: 'seal', range: 300, minRange: 90, weight: 3 }] } },
  ],
};
