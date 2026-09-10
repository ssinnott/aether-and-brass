// Stage 4 mid-boss: REEVE TANSY CULM & THE BALER (docs/STAGE4.md section 3).
// The guild officer who prices the crop, fighting inside the field baler she normally walks beside: a press drum
// lying across both shoulders on a hemp yoke, the ram cylinder standing off the near one, the bale chute hanging at
// her hip and a full bladder over all of it so the machine can be walked out to wherever the crop fell. Phase 1 is
// the Baler — armoured, unlaunchable, and every third attack it over-presses and stands open (the punish window).
// Phase 2 is Culm with the yoke blown: no drum, no armour, grabbable, and the fastest thing on the board.
//
// The two phases are two SILHOUETTES, not one silhouette minus a box (docs/ART_STYLE 0.6 / 11). Phase 1 is a machine
// wearing a woman: the drum is wider than her shoulders, the ram crosses the body at chest height, the bag over it
// is the guild's biggest canopy and the hook is carried short and locked. Phase 2 cuts every one of those away: the
// drum is gone, the bag is slack and half-empty, the hook is carried long and free, and the only thing above the
// shoulder line is her own hood. Rig, palette, parts, bladder and the six-key strike skeleton come from
// ./gleaningRig.js; the faction rules (SHOT DOWN, the bag weak point, the landing punish) are BASE_HOOKS' and are
// never overridden here — a boss of this guild obeys its own board.
//
// PALETTE NOTE (tools/art-check.js): both phases carry GLEAN_PAL unchanged, so the two pairs the boss-class baseline
// measures tighter than the enemy one — hair/torso (cowl 36.5 / plum 43.7, d 0.269 against a 0.327 boss baseline) and
// torso/hips (plum / night, d 0.320 against 0.525) — report as warnings here and do not on the five line variants.
// They are left standing rather than fixed: this faction's ladder is the same cloth on a boss as on a Chaff, and the
// separation these two pairs give up is bought back by the accessory that only a boss wears (see below). It is the
// same call midboss3/boss3 record for the Chandlery ladder, which carries exemptions for the same two pairs.
import { frontBox, areaBox } from './common.js';
import {
  GLEAN, GLEAN_OUTLINE, GLEAN_PAL, GLEAN_PROPS, GLEAN_PARTS, CHALK, FK,
  drawBladder, makeGleanBase, BASE_HOOKS, gleanStrike, ventPuff,
} from './gleaningRig.js';
import { celRect, celBall, celCapsule, tones, band, rimTop } from '../../art/shading.js';
import { clamp } from '../../engine/math.js';
import { particles } from '../../engine/particles.js';

const R = Math.round;
const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, once: true, ...(extra || {}) });
const LOW = { low: true };
/** The press is COLD IRON on a rag-and-silk faction: the one mass on the rig that was made in a factory. */
const PRESS = '#3A3F49';
/** The reeve's chalk: the guild marks a bale with the price it expects, and she is the one who writes it. */
const RANK = CHALK.winnow;

// ---------------------------------------------------------------- the baler (phase 1 only)
/**
 * The field baler (back accessory, torso space): a press drum lying across BOTH shoulders on a hemp yoke, the ram
 * cylinder standing off the near shoulder, and the bale chute down at the hip. `rig.pressing` (driven off the stall)
 * blows the relief: the chute stands open with a half-made bale jammed in it and the drum vents rose — the read that
 * says "hit me now", in the board's own energy colour.
 */
function drawBaler(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), H = p.torsoH, x = -hw - 20, y = -R(H * 0.72);
  // the hemp yoke the drum rides on, across the shoulders
  celRect(ctx, rig, x + 4, y + 2, R(p.torsoW) + 12, 8, 3, GLEAN.rope, 0.4, 0.24);
  // The press drum, in PRESS and not in zinc. It sits above the shoulder line, and the faction rig's note on
  // GLEAN.zinc is explicit that zinc never goes there: at L* 72.7 it is seven points under the bladder silk, which
  // is close enough that a 22x26 slab of it beside the bag reads as a second bag. In cold press iron it reads as
  // what it is — a factory machine bolted to a rag-picker — and it is the darkest mass on the rig, which is also
  // where the guild's own ladder wants a machine.
  // It sits BEHIND THE SHOULDER, not over the skull: the bladder owns the top of this silhouette on every rig in
  // the guild, and a drum that reached the head would put two big masses in one place.
  celRect(ctx, rig, x, y - 10, 22, 26, 5, PRESS, 0.38, 0.3);
  // the ram cylinder: it stands off the BACK of the drum and runs forward past the ribs, crossing the body
  celCapsule(ctx, rig, x + 4, y - 6, x + 26, R(-H * 0.44), 5, PRESS, 0.3);
  celBall(ctx, rig, x + 26, R(-H * 0.44), 5, PRESS, true);
  // the bale chute, down at the hip where a Winnow carries her winch drum
  celRect(ctx, rig, x + 3, R(-H * 0.12), 16, 18, 4, PRESS, 0.4, 0.28);
  if (rig.override) return;
  const t = tones(rig, PRESS);
  ctx.fillStyle = t.deep; ctx.fillRect(x, y - 1, 22, 2); ctx.fillRect(x, y + 9, 22, 2);   // the hoops
  band(ctx, rig, x + 2, y - 8, 15, 5, RANK, 1);              // the price she expects, chalked on the machine
  const open = !!rig.pressing;
  band(ctx, rig, x + 5, R(-H * 0.07), 11, 8, open ? GLEAN.rose : tones(rig, GLEAN.night).deep, 1);
  if (!open) { ctx.fillStyle = rig.col(GLEAN.rope); ctx.fillRect(x + 7, R(-H * 0.03), 7, 2); return; }
  // the relief has gone: gas out of the drum, and the half-made bale jammed in the chute
  ctx.fillStyle = 'rgba(255,87,176,0.32)';
  ctx.beginPath(); ctx.arc(x + 10, R(-H * 0.03), 17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rig.col(GLEAN.hot); ctx.fillRect(x + 8, R(-H * 0.01), 5, 3);
  ctx.fillStyle = rig.col(GLEAN.sack); ctx.fillRect(x + 4, R(H * 0.16), 14, 6);
  ctx.fillStyle = rig.col(GLEAN.silk); ctx.fillRect(x - 1, y - 13, 6, 4);   // vapour off the drum lip
}
/**
 * The bale hook: a 40px hemp-wrapped haft with an IRON hook head. `iron` and not `zinc`, which is the note the
 * faction rig already carries on that colour — it is the one dark metal in the guild, for the one job of
 * silhouetting ON pale bladder silk. In zinc this weapon measured as the brightest mass on the whole rig and it
 * hangs at hip height, which inverts the faction's own value ladder (the light lives above the shoulders, always).
 */
function drawBaleHook(ctx, rig) {
  celRect(ctx, rig, -10, -3, 30, 6, 2, GLEAN.rope, 0.4, 0.2);
  celCapsule(ctx, rig, 20, 0, 32, -8, 4, GLEAN.iron, 0.3);
  celCapsule(ctx, rig, 32, -8, 38, 4, 3, GLEAN.iron, 0.3);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, GLEAN.iron).deep; ctx.fillRect(22, -2, 10, 2);
  band(ctx, rig, 6, -3, 6, 6, GLEAN.sack, 1);     // the grip wrap
  rimTop(ctx, rig, 24, -5, 34, -10, GLEAN.iron);
}
/** Phase 2 hip gear: the price board on a rope, which is the only thing she keeps when the machine goes. */
function drawPriceBoard(ctx, rig) {
  const hw = R(rig.p.hip / 2);
  celRect(ctx, rig, hw - 2, -2, 12, 15, 3, GLEAN.sack, 0.4, 0.26);
  if (rig.override) return;
  band(ctx, rig, hw, 0, 8, 4, RANK, 1);
  ctx.fillStyle = tones(rig, GLEAN.sack).deep;
  for (let i = 0; i < 2; i++) ctx.fillRect(hw, 6 + i * 4, 8, 2);
}

// ---------------------------------------------------------------- CALL THE CROP (phase 2)
/**
 * The crop comes down from ABOVE, so this is a content-side spawn rather than the built-in `summon` event (which
 * spawns from the screen wings). `fromSky: true` is the exact Enemy-constructor path stage.js already uses for the
 * Iron Warden, and the Harvestman's own callDown uses it for the same reason: on this board reinforcements FALL.
 */
function callCrop(f, world) {
  if (!world.spawnEnemy) return;
  for (let s = -1; s <= 1; s += 2) {
    world.spawnEnemy('gleaning', 'chaff', f.x + s * 52, clamp(f.z + s * 18, world.floorBand.z0, world.floorBand.z1), { entered: true, facing: -s, fromSky: true });
  }
  if (world.camera) world.camera.shake(4, 8);
  particles.burst('steam', f.x, 26, f.z, 8, { speed: 1.8, up: 1.8, color: GLEAN.rose, sizeJitter: 1.4 });
}

// ---------------------------------------------------------------- builds
const HOOK = { attach: 'handR', length: 40, draw: drawBaleHook, headAt: 34 };
const BASE_BUILD = {
  palette: GLEAN_PAL, outline: GLEAN_OUTLINE, outlineWidth: 1, proportions: GLEAN_PROPS, parts: GLEAN_PARTS,
  smearColor: GLEAN.iron, hood: 'reeve', chalk: RANK, weapon: HOOK,
};
/** Phase 1: wide, machine-shouldered, under the guild's biggest bag — the drum and the ram are 40% of the shape. */
const BALER_BUILD = { ...BASE_BUILD, scale: 1.5, bagShape: 'canopy',
  accessories: [{ attach: 'back', draw: drawBaler }, { attach: 'back', draw: drawBladder }] };
/** Phase 2: the yoke is gone, the bag is slack and half-empty, and the price board is all she is still carrying. */
const CULM_BUILD = { ...BASE_BUILD, scale: 1.3, bagShape: 'slack',
  accessories: [{ attach: 'back', draw: drawBladder }, { attach: 'hip', draw: drawPriceBoard }] };

// ---------------------------------------------------------------- animations
/** The machine is carried PLANTED: knees bent, feet wide, no reach — a body under a load that walks itself. */
const BALER_STANCE = { stance: { torso: -10, head: 4, legR: [16, 16], legL: [-18, 18], footR: -8, footL: -6 }, stride: 0.7, bob: 1.35 };
/** Without it she stands like the officer she is: square, light, weight forward over the hook. */
const CULM_STANCE = { stance: { torso: -4, head: 8, legR: [17, 4], legL: [-19, 6], footR: -20, footL: -16 }, stride: 1.1, bob: 1 };
// The carry angle is measured against geom/rest-carry, exactly as boss4's three are: the Gleaning walk swings the
// weapon arm 20 degrees back on half its keys, and a 40 px hook carried at -28 dipped through the deck on walk #7.
const BC = { armR: [20, 30], weapon: -70, armL: [-24, -8] };
const CC = { armR: [24, 26], weapon: -60, armL: [-28, -12] };
const RAM_BOX = frontBox(64, hit(19, 'knockdown', 6, 3, 24));
const SWEEP_BOX = { ...frontBox(56, hit(15, 'knockdown', 4, 4, 20)), ...LOW };
const PRESS_BOX = areaBox(56, hit(20, 'knockdown', 5, 5, 24));
const common = {
  // intro: she sets the hook in the spoil, the press draws, and she prices the four of you without hurrying
  intro: { loop: false, frames: [
    FK(26, { ...BC, torso: -14, head: 6, root: [0, 1], legR: [16, 14], legL: [-18, 16] }, { sfx: 'steam_vent', ease: 'out' }),
    FK(24, { ...BC, armR: [-54, 62], weapon: -46, armL: [28, 20], torso: 4, head: -10, root: [-2, 0], legR: [18, 16], legL: [-20, 18], face: 'angry' },
      { sfx: 'grapple', ease: 'inout', fx: [{ kind: 'steam', x: -22, y: 44, count: 5 }] }),
    FK(22, { ...BC, torso: -12, head: 8, root: [1, 1], legR: [16, 14], legL: [-18, 16], face: 'angry' }, { ease: 'inout' }),
  ] },
  // defeat: the hook goes, the bag lets go over her head and she sits down in the crop she was pricing
  defeat: { loop: false, frames: [
    FK(22, { ...BC, torso: -20, head: -22, armR: [-26, 50], weapon: -58, armL: [-62, -42], root: [-4, 0], legR: [22, 8], legL: [-16, 14], face: 'hurt' },
      { sfx: 'prop_break', ease: 'out' }),
    FK(20, { ...BC, torso: 28, head: -2, armR: [42, 40], armL: [24, 34], root: [0, 4], legR: [44, 42], legL: [-30, 46], squash: 1.12, stretch: 0.9, face: 'dazed' },
      { ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }, { kind: 'steam', x: -18, y: 34, count: 6 }] }),
    FK(70, { armR: [-24, -8], weapon: -14, armL: [28, 18], torso: 2, head: -10, legR: [12, 10], legL: [-4, 8], footR: 0, footL: 0, root: [16, -4, -88], face: 'dazed' }, { ease: 'out' }),
  ] },
};
const balerAnims = Object.assign(makeGleanBase(BC, BALER_STANCE), common, {
  // phase change: the yoke straps part, the drum rolls off her back and she steps out from under it
  phaseChange: { loop: false, frames: [
    FK(16, { ...BC, torso: -20, head: -18, armR: [-36, 26], armL: [-62, -26], root: [-4, 0], legR: [16, 10], legL: [-18, 14], face: 'hurt' }, { sfx: 'prop_break', ease: 'out' }),
    FK(14, { ...BC, torso: 24, head: 8, root: [2, 3], legR: [36, 44], legL: [-26, 44], squash: 1.12, stretch: 0.9, face: 'grit' },
      { ease: 'in', fx: [{ kind: 'debris', x: -14, y: 46, count: 9 }, { kind: 'steam', x: -10, y: 34, count: 6 }, { kind: 'dust', x: 0, y: 0, count: 8 }] }),
    FK(14, { ...BC, torso: -4, head: 4, root: [0, 0], legR: [15, 6], legL: [-17, 8], face: 'angry' }, { ease: 'out' }),
  ] },
  // ram: the cylinder fires and the whole machine goes forward behind it. The board's heaviest ground hit.
  ram: gleanStrike({
    tell: 26, active: 10, recovery: 30, carry: BC, stance: BALER_STANCE.stance, tellSfx: 'hydraulic', sfx: 'hammer_slam',
    hitbox: RAM_BOX, move: { x: 5 }, smear: { from: -40, to: 30, a: 0.34, r: 62 },
    fx: [{ kind: 'dust', x: 62, y: 0, count: 8 }, { kind: 'ring', x: 62, y: 20, r0: 5, r1: 40, flat: true, color: GLEAN.sack }],
    w1: { ...BC, armR: [-58, -38], weapon: 26, armL: [24, 16], torso: -20, head: -8, root: [-4, 0], legR: [12, 12], legL: [-20, 18], face: 'angry' },
    w2: { ...BC, armR: [-96, -26], weapon: 12, armL: [30, 20], torso: -28, head: -16, root: [-7, -1], legR: [10, 12], legL: [-24, 20], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { ...BC, armR: [24, -6], weapon: -22, armL: [-30, 18], torso: 30, head: 10, root: [8, 2], legR: [46, 28], legL: [-34, 34], face: 'shout', squash: 1.08, stretch: 0.93 },
    hold: { ...BC, armR: [27, -4], weapon: -20, armL: [-32, 18], torso: 32, head: 11, root: [8, 2], legR: [46, 28], legL: [-34, 34], face: 'shout' },
    r: { ...BC, armR: [30, 8], weapon: -30, armL: [-24, 14], torso: 18, head: 6, root: [4, 2], legR: [36, 22], legL: [-28, 30], face: 'grit' },
  }),
  // sweep: a LOW hook sweep along the deck — jump it, which is also how you get over the ram
  sweep: gleanStrike({
    tell: 22, active: 8, recovery: 26, carry: BC, stance: BALER_STANCE.stance, tellSfx: 'whiff', sfx: 'whiff',
    hitbox: SWEEP_BOX, smear: { from: 190, to: 20, a: 0.42, r: 62 }, fx: [{ kind: 'dust', x: 50, y: 4, count: 5 }],
    w1: { ...BC, armR: [-44, -20], weapon: -16, armL: [24, 18], torso: -2, head: 0, root: [-2, 2], legR: [26, 30], legL: [-14, 30], face: 'angry' },
    w2: { ...BC, armR: [-60, -24], weapon: -10, armL: [30, 22], torso: 4, head: 2, root: [-4, 4], legR: [30, 38], legL: [-16, 38], squash: 1.06, stretch: 0.95, face: 'grit' },
    h: { ...BC, armR: [34, 12], weapon: 20, armL: [-28, 16], torso: 26, head: 8, root: [6, 4], legR: [42, 40], legL: [-32, 42], face: 'shout', squash: 1.05, stretch: 0.96 },
    hold: { ...BC, armR: [38, 14], weapon: 22, armL: [-30, 16], torso: 28, head: 8, root: [7, 4], legR: [42, 40], legL: [-32, 42], face: 'shout' },
    r: { ...BC, armR: [46, 18], weapon: -2, armL: [-24, 12], torso: 16, head: 4, root: [4, 3], legR: [36, 32], legL: [-28, 34], face: 'grit' },
  }),
  // press: the bag takes the machine to the hang line and the whole thing comes down on the spot you were standing.
  // `move.vy` on the hit key puts her in the AIR for the hold and most of the recovery — which is where this faction
  // is worth 1.5x, boss or not, and the landing is where she is worth grabbing.
  press: gleanStrike({
    tell: 30, active: 10, recovery: 34, carry: BC, stance: BALER_STANCE.stance, tellSfx: 'steam_vent', sfx: 'land_heavy',
    hitbox: PRESS_BOX, move: { x: 4, vy: 7 }, smear: { from: -30, to: 40, a: 0.3, r: 66 },
    fx: [{ kind: 'ring', x: 0, y: 24, r0: 6, r1: 74, flat: true, color: GLEAN.rose }, { kind: 'steam', x: -12, y: 30, count: 6 }],
    recoverFx: [{ kind: 'dust', x: 0, y: 0, count: 6 }],
    w1: { ...BC, armR: [-30, 54], weapon: -40, armL: [-40, 26], torso: -18, head: 10, root: [-2, 2], legR: [24, 26], legL: [-16, 28], face: 'angry' },
    w2: { ...BC, armR: [-46, 68], weapon: -54, armL: [-56, 38], torso: -26, head: 14, root: [-4, 3], legR: [30, 40], legL: [-20, 42], squash: 1.1, stretch: 0.9, face: 'shout' },
    h: { ...BC, armR: [-16, 24], weapon: -30, armL: [-22, 20], torso: 20, head: -6, root: [2, -6], legR: [40, 20], legL: [-30, 24], face: 'shout', squash: 0.94, stretch: 1.07 },
    hold: { ...BC, armR: [-10, 26], weapon: -26, armL: [-18, 20], torso: 24, head: -4, root: [3, -4], legR: [42, 22], legL: [-32, 26], face: 'shout' },
    r: { ...BC, armR: [18, 34], weapon: -18, armL: [-16, 24], torso: 26, head: 10, root: [2, 3], legR: [44, 38], legL: [-32, 40], squash: 1.12, stretch: 0.9, face: 'grit' },
  }),
});
const culmAnims = Object.assign(makeGleanBase(CC, CULM_STANCE), common, {
  phaseChange: balerAnims.phaseChange,
  // hook: the first half of a fast two-hit string, and it chains into the gaff
  hook: gleanStrike({
    tell: 16, active: 8, recovery: 20, carry: CC, stance: CULM_STANCE.stance, tellSfx: 'whiff', sfx: 'rapier',
    hitbox: frontBox(56, hit(13, 'medium', 5, 0, 18)), smear: { from: -70, to: 30, a: 0.42, r: 56 },
    fx: [{ kind: 'slash', x: 46, y: 46, radius: 24, angle: 35, sweep: 92 }],
    w1: { ...CC, armR: [-114, -26], weapon: 12, armL: [28, 18], torso: -12, head: -6, root: [-2, 0], legR: [14, 8], legL: [-18, 10], face: 'angry' },
    w2: { ...CC, armR: [-152, -10], weapon: -18, armL: [38, 22], torso: -20, head: -12, root: [-5, -1], legR: [10, 8], legL: [-20, 12], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { ...CC, armR: [28, 12], weapon: 4, armL: [-30, 16], torso: 26, head: 8, root: [6, 2], legR: [44, 22], legL: [-32, 32], face: 'shout', squash: 1.07, stretch: 0.94 },
    hold: { ...CC, armR: [30, 14], weapon: 14, armL: [-32, 16], torso: 28, head: 9, root: [6, 2], legR: [44, 22], legL: [-32, 32], face: 'shout' },
    r: { ...CC, armR: [28, 18], weapon: 6, armL: [-24, 12], torso: 12, head: 4, root: [4, 1], legR: [34, 14], legL: [-26, 26], face: 'grit' },
  }),
  // gaff: the hook comes up off the deck with the bag's lift behind it — the launcher, and the end of the string
  gaff: gleanStrike({
    tell: 16, active: 9, recovery: 30, carry: CC, stance: CULM_STANCE.stance, tellSfx: 'grapple', sfx: 'hammer_slam',
    hitbox: frontBox(52, hit(17, 'launch', 3, 8, 24)), smear: { from: 40, to: -66, a: 0.52, r: 56 },
    fx: [{ kind: 'slash', x: 40, y: 50, radius: 28, angle: -70, sweep: 108 }, { kind: 'steam', x: -8, y: 28, count: 3 }],
    w1: { ...CC, armR: [-28, 62], weapon: 8, armL: [28, 24], torso: 6, head: 4, root: [0, 3], legR: [30, 38], legL: [-10, 28], squash: 1.07, stretch: 0.94, face: 'angry' },
    w2: { ...CC, armR: [-44, 74], weapon: 12, armL: [36, 28], torso: 12, head: 6, root: [-2, 5], legR: [34, 46], legL: [-14, 34], squash: 1.1, stretch: 0.91, face: 'grit' },
    h: { ...CC, armR: [200, -28], weapon: -14, armL: [-32, 18], torso: -22, head: -10, root: [5, -8], legR: [20, 10], legL: [-26, 28], face: 'shout', squash: 0.92, stretch: 1.1 },
    hold: { ...CC, armR: [208, -24], weapon: 0, armL: [-34, 18], torso: -26, head: -12, root: [5, -6], legR: [20, 10], legL: [-26, 28], face: 'shout' },
    r: { ...CC, armR: [182, -14], weapon: 4, armL: [-26, 14], torso: -12, head: -6, root: [4, -2], legR: [22, 12], legL: [-24, 26], face: 'grit' },
  }),
  sweep: balerAnims.sweep,
  // CALL THE CROP: 34 frames of horn and blazing bag, and two Chaff come down on the wings of the arena. The tell is
  // long on purpose — this is the one attack of hers you are meant to be able to reach and cancel.
  callCrop: gleanStrike({
    tell: 34, active: 8, recovery: 32, carry: CC, stance: CULM_STANCE.stance, tellSfx: 'roar', sfx: 'steam_vent',
    event: 'callCrop', fx: [{ kind: 'ring', x: 0, y: 40, r0: 6, r1: 58, color: GLEAN.rose }, { kind: 'steam', x: 8, y: 34, count: 5 }],
    w1: { ...CC, armR: [-120, -28], weapon: 24, armL: [-30, 32], torso: -16, head: -4, root: [-3, 0], legR: [14, 10], legL: [-18, 12], face: 'shout' },
    w2: { ...CC, armR: [-156, -16], weapon: 10, armL: [-38, 36], torso: -24, head: -8, root: [-5, 1], legR: [12, 12], legL: [-20, 16], squash: 0.96, stretch: 1.05, face: 'shout' },
    h: { ...CC, armR: [-170, -8], weapon: 4, armL: [-50, 42], torso: -18, head: 12, root: [-1, -2], legR: [18, 14], legL: [-22, 18], face: 'shout', squash: 0.95, stretch: 1.06 },
    hold: { ...CC, armR: [-166, -10], weapon: 6, armL: [-46, 40], torso: -14, head: 10, root: [0, -1], legR: [18, 14], legL: [-22, 18], face: 'shout' },
    r: { ...CC, armR: [-40, 30], weapon: -16, armL: [-24, 30], torso: 6, head: 6, root: [1, 2], legR: [20, 12], legL: [-20, 14], face: 'grit' },
  }),
});

/** Reeve Tansy Culm & the Baler — the Stage 4 mid-boss. */
export const midboss4 = {
  id: 'midboss4', type: 'midboss4', variant: 'culm', name: 'REEVE TANSY CULM', subtitle: '& THE BALER',
  role: 'boss', bossKind: 'midboss', boss: true, music: 'midboss2',
  build: BALER_BUILD, anims: balerAnims, score: 5000, drops: ['food_big', 'meter', 'score_big'],
  grabbable: false, throwDamageMult: 1, sfx: { hurt: 'hydraulic', death: 'prop_break' },
  traits: { flinchEvery: 2, weight: 1.9 },
  /** The bag is the weak point on every rig in this guild, and a boss does not get an exemption from it. */
  hurtParts: [{ name: 'body', y: [0, 66] }, { name: 'bag', y: [66, 118], damageMult: 1.6 }],
  hooks: {
    // the faction contract first (the two tell channels, SHOT DOWN, the landing vent), then the three things of hers
    ...BASE_HOOKS,
    /** Art state: the chute stands open for exactly as long as the over-press stall does, and the bag holds its tell. */
    onUpdate(f, world) {
      BASE_HOOKS.onUpdate(f, world);
      f.rig.pressing = !!f.stalled;
      const a = f.anim;
      // the press leaves the ground on key 2 and is not back on it until the recovery is nearly out: hold both tell
      // channels across the airborne keys, exactly as every airborne variant in gleaning.js has to
      if (a.name === 'press' && a.frameIndex >= 2 && a.frameIndex <= 4) { f.rig.gas = 1; f.rig.swell = 1.16; }
      if (f.phaseIndex === 0 && (world.frame & 15) === 0) {
        particles.burst('steam', f.x - f.facing * 16, R(f.h * 0.92), f.z, 1, { speed: 0.7, up: 1.4, color: GLEAN.rose });
      }
    },
    onAnimEvent(f, name, frame, world) {
      if (name !== 'callCrop') return false;
      callCrop(f, world);
      return true;
    },
    onPhase(f, i, world) {
      if (!world || i !== 1) return;
      particles.burst('debris', f.x, f.h * 0.6, f.z, 14, { speed: 3.4, up: 2.6, color: PRESS, sizeJitter: 2 });
      ventPuff(f, 10, 2.2);
      world.addFx('ring', f.x, 44, f.z, { r0: 8, r1: 110, color: GLEAN.rose });
    },
  },
  ai: { attackRange: 64, zTolerance: 18, attackCooldown: [48, 88], firstAttackDelay: 44, ignoresTokens: true, retreatChance: 0, tellWarnFrames: 14, punishGrabbable: true },
  phases: [
    { name: 'THE BALER', hp: 320, color: GLEAN.silk, armor: true, unlaunchable: true, walkSpeed: 1,
      ai: { attacks: [{ anim: 'ram', range: 70, weight: 4 }, { anim: 'sweep', range: 60, weight: 3 },
        { anim: 'press', range: 150, minRange: 40, weight: 3, tellFrames: 30 }],
        // every third attack the press over-presses: the chute stands open for 80 frames at 3x damage and she can be grabbed
        stallEvery: 3, stallFrames: 80, stallDamageMult: 3, stallGrabbable: true } },
    { name: 'REEVE CULM', hp: 170, color: GLEAN.rose, armor: false, unlaunchable: false, grabbable: true, walkSpeed: 2.2,
      build: CULM_BUILD, anims: culmAnims, hurtParts: [{ name: 'body', y: [0, 58] }, { name: 'bag', y: [58, 100], damageMult: 1.6 }],
      ai: { attackRange: 56, zTolerance: 14, attackCooldown: [32, 66], evadeChance: 0.3, evadeCooldown: 110,
        attacks: [{ anim: 'hook', range: 62, weight: 4, chain: 'gaff' }, { anim: 'gaff', range: 56, weight: 2 },
          { anim: 'sweep', range: 60, weight: 2 }, { anim: 'callCrop', range: 300, minRange: 0, weight: 1, maxUses: 2, tellFrames: 34 }] } },
  ],
};
