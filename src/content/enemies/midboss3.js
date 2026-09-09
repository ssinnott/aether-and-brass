// Stage 3 mid-boss: YARDMASTER MARL & THE LIME KILN (docs/STAGE3.md section 3).
// The works' yardmaster fights with the yard's own wheeled draw-kiln strapped across her back: a charge drum over
// both shoulders, a chimney standing off the near one, and the draw-door hanging at her hip. Phase 1 is the kiln —
// armoured, unlaunchable, and every third attack it over-draws and stands open (the punish window). Phase 2 is Marl
// with the straps blown, no armour, grabbable and fast.
//
// The two phases are two SILHOUETTES, not one silhouette minus a box (docs/ART_STYLE 0.6 / 11). Phase 1 is a machine
// wearing a woman: the drum is wider than her shoulders, the chimney takes the whole near side of the head, her hood
// is buckled under the kiln's collar and the shovel is carried across the body like a bar. Phase 2 cuts every one of
// those away: the hood comes off and the hair is out, the coat is torn to the waist, the only thing left above the
// shoulder line is her own head, and the shovel is carried low and free. Rig, parts and rite plumbing from
// ./chandlerRig.js; the limecrust status itself is the Limeburner's, imported from ./chandler.js so the mid-boss and
// the line variant can never drift apart.
import { frontBox, areaBox } from './common.js';
import {
  CH, CH_PAL, CH_PROPS, CH_PARTS, CLAN, BASE_HOOKS, makeChandlerBase, chandStrike, drawLamp, isClient, riteFlash,
  FK, celRect, celBall, celPoly, celCapsule, tones, rimTop, TAU,
} from './chandlerRig.js';
import { band } from '../../art/shading.js';
import { crust } from './chandler.js';
import { particles } from '../../engine/particles.js';

const R = Math.round;
const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, once: true, ...(extra || {}) });
const LOW = { low: true };
// The kiln is COLD IRON on a greened-pewter faction: the drum has to read as a machine bolted to a contractor, not as
// another pewter tool, and it is the biggest single shape on the rig. KILN is the Limeburner's own hip-kiln iron
// (#394249) so the two read as the same works; CHARGE is the burning lime seen through the draw-door, which is the
// only hot colour anywhere on this board and only shows while the kiln is open.
const KILN = '#394249', CHARGE = '#FFD27A';
/** The yardmaster's rank: the Limeburner's kiln red, carried in a pewter frame nothing on the line ever wears. */
const RANK = CLAN.limeburner;

// ---------------------------------------------------------------- the draw-kiln (phase 1 only)
/**
 * The yard's wheeled draw-kiln (back accessory, torso space): a charge drum lying across BOTH shoulders on a leather
 * yoke, a chimney standing off the near shoulder, the draw-door and its grate down at the hip, and the barrow wheel
 * it is normally pushed on still bolted to the frame. `rig.venting` (driven off the stall) opens the door: the charge
 * goes white-hot and the whole thing vents — the read that says "hit me now".
 */
function drawDrawKiln(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), H = p.torsoH, x = -hw - 20, y = -R(H * 0.72);
  // the yoke the drum rides on, across the shoulders
  celRect(ctx, rig, x + 4, y + 2, R(p.torsoW) + 12, 8, 3, CH.leather, 0.4, 0.24);
  // The charge drum. It sits BEHIND THE SHOULDER, not over the skull: at 24x30 centred on the spine it buried the
  // head in the silhouette test, which is the one thing §0.6 will not have. 22 wide, top at the shoulder line, and
  // its right edge stops 4 px short of the head circle (head centre 0, r 9) so the two masses never touch.
  celRect(ctx, rig, x, y - 12, 22, 28, 5, CH.pewter, 0.38, 0.3);
  // the chimney: it stands off the BACK of the drum and climbs past the ear on the far side of the head
  celCapsule(ctx, rig, x + 5, y - 10, x + 2, R(-H * 1.62), 4, KILN, 0.3);
  celBall(ctx, rig, x + 2, R(-H * 1.62), 5, KILN, true);
  // the draw-door and its grate, down at the hip where a Limeburner carries his
  celRect(ctx, rig, x + 3, R(-H * 0.14), 16, 19, 4, KILN, 0.4, 0.28);
  // the barrow wheel, still bolted to the frame it is normally pushed on
  celBall(ctx, rig, x + 1, R(H * 0.3), 7, CH.leather, false);
  if (rig.override) return;
  const t = tones(rig, CH.pewter);
  ctx.fillStyle = t.deep; ctx.fillRect(x, y - 2, 22, 2); ctx.fillRect(x, y + 8, 22, 2);   // the hoops
  band(ctx, rig, x + 2, y - 10, 15, 5, RANK, 1);              // her rung of the company ladder, on the machine
  band(ctx, rig, x - 2, R(H * 0.27), 7, 7, CH.pewter, 1);     // the hub
  const open = !!rig.venting;
  // the draw-door: shut it is a dark grate, open it is the charge
  band(ctx, rig, x + 5, R(-H * 0.09), 11, 9, open ? CHARGE : tones(rig, KILN).deep, 1);
  if (!open) { ctx.fillStyle = rig.col(CH.lime); ctx.fillRect(x + 7, R(-H * 0.05), 7, 2); return; }
  ctx.fillStyle = 'rgba(255,210,122,0.35)';
  ctx.beginPath(); ctx.arc(x + 10, R(-H * 0.05), 18, 0, TAU); ctx.fill();
  ctx.fillStyle = rig.col(CH.hot); ctx.fillRect(x + 8, R(-H * 0.03), 5, 3);
  ctx.fillStyle = rig.col(CH.quicklime); ctx.fillRect(x + 1, y - 14, 6, 4);   // steam off the drum lip
}
/** Phase 1 head: the yard hood — a lime-crusted canvas hood with a leather brow plate buckled under the kiln collar. */
function marlHood(ctx, rig, pose, inf) {
  const r = inf.r;
  // The hood is a HAT, and a hat on this faction sits ABOVE THE HAIRLINE (§0.5): the crown comes down to -r*0.45 and
  // stops, so the eye row, the respirator bar and the jaw the whole faction is drawn around are all still there. An
  // earlier pass had it closed to +r*0.25 and the mid-boss had no face at all at 1x.
  celPoly(ctx, rig, [R(-r * 1.1), R(-r * 0.45), R(-r * 1.0), R(-r * 1.3), R(r * 0.85), R(-r * 1.45), R(r * 1.15), R(-r * 0.5), R(r * 0.95), R(-r * 0.3), R(-r * 1.0), R(-r * 0.28)], CH.quicklime, 0.36, 0.3);
  // the neck curtain: canvas hanging down the BACK of the hood, never across the face
  celPoly(ctx, rig, [R(-r * 1.05), R(-r * 0.5), R(-r * 0.55), R(-r * 0.5), R(-r * 0.5), R(r * 0.5), R(-r * 1.05), R(r * 0.35)], CH.quicklime, 0.4, 0.26);
  if (rig.override) return;
  band(ctx, rig, R(-r * 1.0), R(-r * 0.72), R(r * 2.0), 5, CH.leather, 1);    // the brow plate
  ctx.fillStyle = tones(rig, CH.quicklime).deep; ctx.fillRect(R(-r * 0.8), R(-r * 1.24), R(r * 1.5), 2);
  rimTop(ctx, rig, R(-r * 0.9), R(-r * 1.34), R(r * 0.8), R(-r * 1.4), CH.quicklime);
}
/** The yard shovel: the Limeburner's, at boss length — a 52px haft with a slab blade caked in lime. */
function drawYardShovel(ctx, rig) {
  celRect(ctx, rig, -10, -3, 34, 6, 2, CH.leather, 0.4, 0.2);
  celPoly(ctx, rig, [22, -16, 44, -18, 52, 0, 44, 18, 22, 16], CH.pewter, 0.36, 0.3);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, CH.pewter).deep; ctx.fillRect(24, -2, 22, 3);
  band(ctx, rig, 34, -10, 7, 6, CH.quicklime, 1);
}
/** Phase 2 hip lamp: with the kiln gone her lamp is a bull's-eye on the belt, so the cone still starts at her boots. */
function drawYardLamp(ctx, rig) {
  const hw = R(rig.p.hip / 2);
  drawLamp(ctx, rig, hw + 7, 2, 1.2);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CH.leather); ctx.fillRect(hw - 1, -3, 7, 4);
}

// ---------------------------------------------------------------- rites
/**
 * SLAKE THE YARD: the boss-scale limecrust. The company does not insure its own (chandlerRig isClient), so this lands
 * on the re-crewed army she is standing in — every non-Chandlery fighter in the room — and, per the faction's last
 * rule, on HERSELF when there is nobody left to work on, which is what makes fighting her alone a different fight.
 */
function slakeYard(f, world) {
  let given = 0;
  for (const e of world.enemies) {
    if (!isClient(e, f) || Math.abs(e.x - f.x) > 260 || e.hasStatus('limecrust') || (e.ai && e.ai.shield)) continue;
    crust(e, f); given++;
    if (given >= 4) break;
  }
  if (!given) crust(f, f);
  particles.burst('steam', f.x, 24, f.z, 8, { speed: 1.8, up: 1.8 });
  if (world.camera) world.camera.shake(5, 10);
}

// ---------------------------------------------------------------- builds
const KILN_CHAND = {
  cap: 'flat', capCol: '#6A4F44', rites: ['slakeYard'], lampJoint: 'torso', lampDX: -30, lampDY: -6, selfConeDX: -34,
  find: (f, world) => {
    for (const e of world.enemies) if (isClient(e, f) && Math.abs(e.x - f.x) < 260 && !e.hasStatus('limecrust')) return e;
    return f;
  },
  cool: (f) => f.attackCooldown,
};
const MARL_CHAND = { ...KILN_CHAND, cap: 'none', rites: ['slakeSelf'], lampJoint: 'hip', lampDX: 12, lampDY: 2, selfConeDX: 26 };
const KILN_PARTS = { ...CH_PARTS, hat: marlHood };
const SHOVEL = { attach: 'handR', length: 52, draw: drawYardShovel, headAt: 40 };
const BASE_BUILD = {
  palette: CH_PAL, outline: CH.outline, outlineWidth: 1, proportions: CH_PROPS, parts: CH_PARTS,
  smearColor: CH.quicklime, clan: RANK, weapon: SHOVEL,
};
/** Phase 1: wide, hunched, faceless — the drum, the chimney and the hood are 40% of the silhouette. */
const KILN_BUILD = { ...BASE_BUILD, scale: 1.5, parts: KILN_PARTS, chand: KILN_CHAND,
  accessories: [{ attach: 'back', draw: drawDrawKiln }] };
/** Phase 2: nothing above the shoulder line but her own head, and one lamp on the belt. */
const MARL_BUILD = { ...BASE_BUILD, scale: 1.3, chand: MARL_CHAND,
  accessories: [{ attach: 'hip', draw: drawYardLamp }] };

// ---------------------------------------------------------------- animations
const KC = { armR: [22, 32], weapon: -30, armL: [-26, -10] };
const MC = { armR: [26, 28], weapon: -26, armL: [-30, -14] };
const SLAM_BOX = frontBox(66, hit(20, 'knockdown', 5, 5, 24));
const SCOOP_BOX = frontBox(58, hit(16, 'knockdown', 6, 0, 20), LOW);
const SLAKE_BOX = areaBox(60, hit(8, 'medium', 9, 0, 16));
const common = {
  // intro: she sets the shovel in the lime, the kiln draws, and she looks the four of you over without hurrying
  intro: { loop: false, frames: [
    FK(26, { ...KC, torso: 22, head: 4, root: [0, 2], legR: [12, 8], legL: [-12, 8] }, { sfx: 'steam_vent', ease: 'out' }),
    FK(24, { ...KC, armR: [-58, 66], weapon: -50, armL: [30, 22], torso: 4, head: -10, root: [-2, 1], legR: [14, 10], legL: [-14, 10], face: 'angry' },
      { sfx: 'chime', ease: 'inout', fx: [{ kind: 'steam', x: -24, y: 40, count: 5 }] }),
    FK(22, { ...KC, torso: 26, head: 6, root: [1, 1], legR: [12, 8], legL: [-12, 8], face: 'angry' }, { ease: 'inout' }),
  ] },
  // defeat: the shovel goes, the kiln blows what is left of its charge and she sits down in the lime
  defeat: { loop: false, frames: [
    FK(22, { ...KC, torso: -14, head: -22, armR: [-22, 54], weapon: -60, armL: [-64, -44], root: [-4, 0], legR: [22, 6], legL: [-16, 14], face: 'hurt' },
      { sfx: 'prop_break', ease: 'out' }),
    FK(20, { ...KC, torso: 30, head: -2, armR: [44, 42], armL: [26, 36], root: [0, 5], legR: [44, 42], legL: [-30, 48], squash: 1.12, stretch: 0.9, face: 'dazed' },
      { ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }, { kind: 'steam', x: -20, y: 30, count: 6 }] }),
    FK(70, { armR: [-20, -6], weapon: -14, armL: [30, 20], torso: 2, head: -12, legR: [12, 10], legL: [-4, 8], root: [24, -8, -88], face: 'dazed' }, { ease: 'out' }),
  ] },
};
const kilnAnims = Object.assign(makeChandlerBase(KC, { stoop: 22, head: 4, weaponFloor: -32, gait: 'work' }), common, {
  // phase change: the straps go, the drum comes off her back and she steps out from under it
  phaseChange: { loop: false, frames: [
    FK(16, { ...KC, torso: -16, head: -20, armR: [-38, 28], armL: [-66, -28], root: [-4, 0], legR: [16, 8], legL: [-18, 12], face: 'hurt' }, { sfx: 'prop_break', ease: 'out' }),
    FK(14, { ...KC, torso: 26, head: 8, root: [2, 4], legR: [36, 44], legL: [-26, 44], squash: 1.12, stretch: 0.9, face: 'grit' },
      { ease: 'in', fx: [{ kind: 'debris', x: -14, y: 44, count: 9 }, { kind: 'steam', x: -10, y: 30, count: 6 }, { kind: 'dust', x: 0, y: 0, count: 8 }] }),
    FK(14, { ...KC, torso: 8, head: -4, root: [0, 1], legR: [12, 8], legL: [-12, 8], face: 'angry' }, { ease: 'out' }),
  ] },
  // slam: the shovel goes up over the kiln collar and comes down on the floor line in front of her
  slam: chandStrike({
    tell: 26, active: 10, recovery: 30, carry: KC, stoop: 22, tellSfx: 'hammer_swing', sfx: 'hammer_slam',
    hitbox: SLAM_BOX, smear: { from: -160, to: 50, a: 0.44, r: 74 },
    fx: [{ kind: 'dust', x: 66, y: 0, count: 8 }, { kind: 'ring', x: 66, y: 0, r0: 5, r1: 40, flat: true, color: CH.quicklime }],
    w1: { ...KC, armR: [-66, -42], weapon: 30, armL: [26, 18], torso: 0, head: -8, root: [-3, 0], legR: [10, 6], legL: [-16, 12], face: 'angry' },
    w2: { ...KC, armR: [-122, -30], weapon: 14, armL: [32, 22], torso: -12, head: -16, root: [-6, -1], legR: [8, 6], legL: [-18, 14], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { ...KC, armR: [16, -8], weapon: -26, armL: [-32, 20], torso: 40, head: 10, root: [7, 3], legR: [46, 30], legL: [-34, 36], face: 'shout', squash: 1.09, stretch: 0.92 },
    hold: { ...KC, armR: [19, -6], weapon: -22, armL: [-34, 20], torso: 42, head: 11, root: [7, 3], legR: [46, 30], legL: [-34, 36], face: 'shout' },
    r: { ...KC, armR: [28, 8], weapon: -34, armL: [-26, 16], torso: 30, head: 6, root: [4, 3], legR: [38, 24], legL: [-30, 32], face: 'grit' },
  }),
  // scoop: a LOW quicklime scoop off the yard floor — jump it, which is also how you get over the shovel
  scoop: chandStrike({
    tell: 22, active: 8, recovery: 26, carry: KC, stoop: 22, tellSfx: 'whiff', sfx: 'whiff',
    hitbox: SCOOP_BOX, smear: { from: 190, to: 20, a: 0.4, r: 70 }, fx: [{ kind: 'steam', x: 52, y: 6, count: 4 }],
    w1: { ...KC, armR: [-42, -22], weapon: -18, armL: [26, 20], torso: 12, head: 0, root: [-2, 3], legR: [26, 32], legL: [-14, 32], face: 'angry' },
    w2: { ...KC, armR: [-58, -26], weapon: -12, armL: [32, 24], torso: 18, head: 2, root: [-4, 5], legR: [30, 40], legL: [-16, 40], squash: 1.06, stretch: 0.95, face: 'grit' },
    h: { ...KC, armR: [32, 10], weapon: 18, armL: [-30, 18], torso: 38, head: 8, root: [6, 5], legR: [42, 42], legL: [-32, 44], face: 'shout', squash: 1.05, stretch: 0.96 },
    hold: { ...KC, armR: [36, 12], weapon: 20, armL: [-32, 18], torso: 40, head: 8, root: [7, 5], legR: [42, 42], legL: [-32, 44], face: 'shout' },
    r: { ...KC, armR: [46, 18], weapon: -4, armL: [-26, 14], torso: 30, head: 4, root: [4, 4], legR: [36, 34], legL: [-28, 36], face: 'grit' },
  }),
  // SLAKE THE YARD: 34f with the kiln cracked wide open (frame armour worth 2 hits, the faction's one exception),
  // then a 60px shove that crusts everything of theirs in the room. One touch that beats the armour kills the rite.
  slakeYard: chandStrike({
    tell: 34, active: 10, recovery: 36, carry: KC, stoop: 22, tellSfx: 'steam_vent', sfx: 'steam_vent', armor: true,
    hitbox: SLAKE_BOX, event: 'slakeYard', smear: { from: -52, to: 12, a: 0.32, r: 72 },
    fx: [{ kind: 'ring', x: 0, y: 28, r0: 6, r1: 76, color: CH.quicklime }, { kind: 'steam', x: 12, y: 34, count: 6 }],
    recoverFx: [{ kind: 'steam', x: -8, y: 36, count: 3 }],
    w1: { ...KC, armR: [-64, 76], weapon: -44, armL: [46, 26], torso: 28, head: 12, root: [-1, 2], legR: [24, 18], legL: [-14, 20], face: 'angry' },
    w2: { ...KC, armR: [-18, 94], weapon: -72, armL: [-44, 52], torso: -8, head: -18, root: [-6, 1], legR: [8, 12], legL: [-28, 22], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { ...KC, armR: [-8, 42], weapon: -64, armL: [-6, 34], torso: 4, head: -6, root: [0, -1], legR: [22, 10], legL: [-24, 14], face: 'shout', squash: 0.95, stretch: 1.06 },
    hold: { ...KC, armR: [-4, 44], weapon: -60, armL: [-4, 34], torso: 6, head: -6, root: [0, -1], legR: [22, 10], legL: [-24, 14], face: 'shout' },
    r: { ...KC, armR: [10, 46], weapon: -40, armL: [-18, 30], torso: 24, head: 4, root: [1, 2], legR: [18, 12], legL: [-20, 16], face: 'grit' },
  }),
});
const marlAnims = Object.assign(makeChandlerBase(MC, { stoop: 14, head: 2, weaponFloor: -28, gait: 'work' }), common, {
  phaseChange: kilnAnims.phaseChange,
  // chop: a fast two-hit shovel string — the first half, which chains into the rise
  chop: chandStrike({
    tell: 16, active: 8, recovery: 22, carry: MC, stoop: 14, tellSfx: 'hammer_swing', sfx: 'hammer_slam',
    hitbox: frontBox(56, hit(14, 'medium', 5, 0, 18)), smear: { from: -70, to: 30, a: 0.42, r: 60 },
    fx: [{ kind: 'slash', x: 46, y: 46, radius: 26, angle: 35, sweep: 96 }],
    w1: { ...MC, armR: [-118, -28], weapon: 12, armL: [30, 20], torso: -6, head: -8, root: [-2, 0], legR: [12, 8], legL: [-16, 10], face: 'angry' },
    w2: { ...MC, armR: [-158, -12], weapon: -20, armL: [40, 24], torso: -16, head: -12, root: [-5, -1], legR: [8, 8], legL: [-18, 12], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { ...MC, armR: [28, 12], weapon: 4, armL: [-30, 18], torso: 32, head: 8, root: [6, 3], legR: [44, 24], legL: [-32, 34], face: 'shout', squash: 1.07, stretch: 0.94 },
    hold: { ...MC, armR: [30, 14], weapon: 16, armL: [-32, 18], torso: 34, head: 9, root: [6, 3], legR: [44, 24], legL: [-32, 34], face: 'shout' },
    r: { ...MC, armR: [28, 18], weapon: 6, armL: [-24, 14], torso: 22, head: 4, root: [4, 2], legR: [34, 16], legL: [-26, 28], face: 'grit' },
  }),
  // rise: the blade comes up off the floor with her whole back behind it — the launcher, and the end of the string
  rise: chandStrike({
    tell: 16, active: 9, recovery: 30, carry: MC, stoop: 14, tellSfx: 'whiff', sfx: 'hammer_slam',
    hitbox: frontBox(52, hit(18, 'launch', 3, 8, 24)), smear: { from: 40, to: -66, a: 0.55, r: 58 },
    fx: [{ kind: 'slash', x: 40, y: 50, radius: 30, angle: -70, sweep: 110 }],
    w1: { ...MC, armR: [-30, 66], weapon: 8, armL: [30, 26], torso: 14, head: 4, root: [0, 4], legR: [30, 40], legL: [-10, 30], squash: 1.07, stretch: 0.94, face: 'angry' },
    w2: { ...MC, armR: [-46, 78], weapon: 12, armL: [38, 30], torso: 20, head: 6, root: [-2, 6], legR: [34, 48], legL: [-14, 36], squash: 1.1, stretch: 0.91, face: 'grit' },
    h: { ...MC, armR: [202, -30], weapon: -14, armL: [-34, 20], torso: -14, head: -10, root: [5, -9], legR: [20, 10], legL: [-26, 30], face: 'shout', squash: 0.92, stretch: 1.1 },
    hold: { ...MC, armR: [210, -26], weapon: 0, armL: [-36, 20], torso: -18, head: -12, root: [5, -7], legR: [20, 10], legL: [-26, 30], face: 'shout' },
    r: { ...MC, armR: [184, -16], weapon: 4, armL: [-28, 16], torso: -6, head: -6, root: [4, -3], legR: [22, 12], legL: [-24, 28], face: 'grit' },
  }),
  scoop: kilnAnims.scoop,
  // SLAKE, on herself: there is nobody left in the yard to insure, and she knows exactly what that means
  slakeSelf: chandStrike({
    tell: 30, active: 8, recovery: 34, carry: MC, stoop: 14, tellSfx: 'steam_vent', sfx: 'steam_vent',
    event: 'slakeSelf', fx: [{ kind: 'ring', x: 0, y: 26, r0: 5, r1: 54, color: CH.quicklime }, { kind: 'steam', x: 8, y: 30, count: 5 }],
    w1: { ...MC, armR: [-56, 70], weapon: -40, armL: [44, 24], torso: 20, head: 10, root: [-1, 2], legR: [22, 16], legL: [-14, 18], face: 'angry' },
    w2: { ...MC, armR: [-14, 88], weapon: -68, armL: [-40, 48], torso: -10, head: -16, root: [-5, 1], legR: [8, 12], legL: [-26, 20], squash: 0.96, stretch: 1.05, face: 'shout' },
    h: { ...MC, armR: [-6, 40], weapon: -60, armL: [-4, 32], torso: 2, head: -4, root: [0, -1], legR: [20, 10], legL: [-22, 14], face: 'shout', squash: 0.95, stretch: 1.06 },
    hold: { ...MC, armR: [-2, 42], weapon: -56, armL: [-2, 32], torso: 4, head: -4, root: [0, -1], legR: [20, 10], legL: [-22, 14], face: 'shout' },
    r: { ...MC, armR: [12, 44], weapon: -38, armL: [-16, 28], torso: 18, head: 2, root: [1, 2], legR: [16, 12], legL: [-18, 14], face: 'grit' },
  }),
});

/** Yardmaster Marl & the Lime Kiln — the Stage 3 mid-boss. */
export const midboss3 = {
  id: 'midboss3', type: 'midboss3', variant: 'marl', name: 'YARDMASTER MARL', subtitle: '& THE LIME KILN',
  role: 'boss', bossKind: 'midboss', boss: true, music: 'midboss',
  build: KILN_BUILD, anims: kilnAnims, score: 5000, drops: ['food_big', 'meter', 'score_big'],
  grabbable: false, throwDamageMult: 1, sfx: { hurt: 'hydraulic', death: 'prop_break' },
  // armorHits is what makes the slake's `armor: true` a two-hit frame armour rather than an infinite one
  traits: { flinchEvery: 2, weight: 1.8, armorHits: 2 },
  hooks: {
    // the whole faction contract comes first: the lamp / recipient bookkeeping (onUpdate), ONE TOUCH BREAKS A RITE
    // (onHitTaken, which filters her frame armour itself), the floor cone and tether (drawAfter) and the lamp glass
    // going out on death. Only the three things that are hers are overridden below.
    ...BASE_HOOKS,
    /** Art state: the draw-door stands open for exactly as long as the over-draw stall does. */
    onUpdate(f, world) {
      BASE_HOOKS.onUpdate(f, world);
      f.rig.venting = !!f.stalled;
      if (f.phaseIndex === 0 && (world.frame & 15) === 0) {
        particles.burst('steam', f.x - f.facing * 18, R(f.h * 0.95), f.z, 1, { speed: 0.7, up: 1.5 });
      }
    },
    onAnimEvent(f, name, frame, world) {
      if (name === 'slakeYard') { riteFlash(f, world); slakeYard(f, world); return true; }
      if (name === 'slakeSelf') { riteFlash(f, world); crust(f, f); particles.burst('steam', f.x, 20, f.z, 6, { speed: 1.6, up: 1.8 }); return true; }
      return false;
    },
    onPhase(f, i, world) {
      if (!world || i !== 1) return;
      particles.burst('debris', f.x, f.h * 0.6, f.z, 14, { speed: 3.4, up: 2.6, color: KILN, sizeJitter: 2 });
      particles.burst('steam', f.x, f.h * 0.5, f.z, 10, { speed: 2, up: 2 });
      world.addFx('ring', f.x, 40, f.z, { r0: 8, r1: 110, color: CH.quicklime });
    },
  },
  ai: { attackRange: 66, zTolerance: 18, attackCooldown: [48, 88], firstAttackDelay: 44, ignoresTokens: true, retreatChance: 0, flank: false, tellWarnFrames: 14 },
  phases: [
    { name: 'THE LIME KILN', hp: 320, color: '#5E8072', armor: true, unlaunchable: true, walkSpeed: 1,
      ai: { attacks: [{ anim: 'slam', range: 72, weight: 4 }, { anim: 'scoop', range: 62, weight: 3 }, { anim: 'slakeYard', range: 240, minRange: 0, weight: 2, tellFrames: 34 }],
        // every third attack the kiln over-draws: it stands open for 80 frames at 3x damage and she can be grabbed
        stallEvery: 3, stallFrames: 80, stallDamageMult: 3, stallGrabbable: true } },
    { name: 'YARDMASTER MARL', hp: 170, color: '#C29B4A', armor: false, unlaunchable: false, grabbable: true, walkSpeed: 2.1,
      build: MARL_BUILD, anims: marlAnims,
      ai: { attackRange: 56, zTolerance: 14, attackCooldown: [32, 66], evadeChance: 0.3, evadeCooldown: 110,
        attacks: [{ anim: 'chop', range: 62, weight: 4, chain: 'rise' }, { anim: 'rise', range: 56, weight: 2 },
          { anim: 'scoop', range: 62, weight: 2 }, { anim: 'slakeSelf', range: 300, minRange: 0, weight: 1, maxUses: 2, tellFrames: 30 }] } },
  ],
};
