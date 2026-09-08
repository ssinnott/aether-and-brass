// Stage 2 mid-boss: QUARTERMASTER SKREE & THE GRAPNEL WINCH (docs/STAGE2.md section 5.1).
// The Ninth Wing's quartermaster fights strapped into the freighter's cargo winch: a drum of chain on a harness with
// a grapnel on the end. Phase 1 is the winch — armoured, unlaunchable, and every third attack jams the drum wide open
// (the punish window). Phase 2 is Skree herself, cut loose from the harness: no armour, grabbable, and fast.
//
// The two phases are meant to be two SILHOUETTES, not one silhouette with a smaller bag on its back (docs/ART_STYLE
// section 0.6 / 11). Phase 1 is a machine wearing a woman: a chain drum across both shoulders, a boom arm arcing over
// her head to a fairlead out in front, chain hanging in a catenary, counterweight plates on the hips, a welding plate
// down over her face — top-heavy, hunched, faceless. Phase 2 cuts every one of those away: the plate is shoved up on
// her brow, the face and the braid are out, the coat is torn to a shirt, and all that is left is a fast woman with a
// boarding axe. Rig and kit from ./stormcrowRig.js + ./stormcrowKit.js.
import {
  CROW, CROW_PAL, CROW_PROPS, FK, makeCrowBase, crowStrike, crowWings, crowTails, crowScarf, crowRank,
} from './stormcrowRig.js';
import { CROW_PARTS, drawBoardingAxe, IRON } from './stormcrowKit.js';
import { frontBox, areaBox } from './common.js';
import { celRect, celBall, celPoly, celCapsule, tones, rimTop } from '../../art/shading.js';
import { pathPoly, paint, circle, capsule } from '../../art/shapes.js';
import { particles } from '../../engine/particles.js';

const R = Math.round, TAU = Math.PI * 2;
const DRUM = '#6A5E44', CHAIN = '#8A94A2', HOT = '#FFD27A';
/**
 * Flag rank (see boss2.js): the quartermaster is the first Stormcrow to wear the Wing's RED in a gold frame rather
 * than a line rate's heat-ramp colour. Hers is the lighter, hotter of the two boss reds; the Admiral's is deeper.
 */
const RANK = '#D8532C';
const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, once: true, ...(extra || {}) });

// ---------------------------------------------------------------- the harness (phase 1 only)
/**
 * The cargo winch (back accessory, torso space). A drum of chain lying across BOTH shoulders, a boom arm arcing over
 * her head to a fairlead out in front of her chest, and the chain hanging from it — the whole silhouette above the
 * waist is machine. The drum spins while the chain is out (`rig.chainOut`), and locks solid and vents while the winch
 * is jammed (`rig.jammed`) — the read that says "hit me now".
 */
function drawWinch(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), H = p.torsoH, x = -hw - 9, y = -R(H * 0.84);
  // drum cradle across the shoulders
  celRect(ctx, rig, x - 5, y - 3, R(p.torsoW) + 12, 13, 4, CROW.pewterDark, 0.36, 0.3);
  // the chain drum itself, spinning
  const a = rig.jammed ? 0 : (rig.chainOut ? rig.tick * 0.42 : rig.tick * 0.06);
  ctx.save(); ctx.translate(x + 4, y + 4); ctx.rotate(a);
  celBall(ctx, rig, 0, 0, 13, DRUM, true);
  if (!rig.override) {
    ctx.strokeStyle = rig.col(CHAIN); ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, 4.5 + i * 3.4, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = tones(rig, DRUM).deep; ctx.fillRect(-13, -2, 26, 3);
  }
  ctx.restore();
  // phase 1's rank rides the MACHINE, not the woman: a gold-framed strap over the drum's outer face. In phase 2 the
  // drum is gone and the same colour turns up on her sash, her braid tie and her cuffs — same rank, relocated,
  // which is the whole point of the phase change.
  // It has to sit here, on the drum and left of x = -hw - 2. The cradle is 100% hidden: the drum ball covers it out
  // to x -31 and the breastplate covers everything from -15 rightward, so the old band across the cradle top drew
  // nothing at all and phase 1 read as having no rank.
  if (!rig.override) {
    ctx.fillStyle = rig.col(crowRank(rig)); ctx.fillRect(x - 7, y + 1, 14, 5);
    ctx.fillStyle = rig.col(CROW.goldDark); ctx.fillRect(x - 7, y + 6, 14, 3);
  }
  // boom arm: up behind the shoulder, over the top of her head, out to a fairlead in front of the mask
  celCapsule(ctx, rig, x - 1, y, x + 3, -R(H * 2.05), 4.5, CROW.copper, 0.3);
  celCapsule(ctx, rig, x + 3, -R(H * 2.05), hw + 16, -R(H * 1.6), 4, CROW.copper, 0.3);
  celBall(ctx, rig, hw + 17, -R(H * 1.56), 5.5, IRON, true);
  // counterweight plates hung off the hips
  celRect(ctx, rig, x - 2, R(-H * 0.24), 11, 16, 3, IRON, 0.36, 0.3);
  if (rig.override) return;
  // chain running from the fairlead down across the chest to the drum
  ctx.strokeStyle = rig.col(CHAIN); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hw + 17, -R(H * 1.52)); ctx.quadraticCurveTo(R(hw * 0.8), -R(H * 0.72), x + 6, y + 6); ctx.stroke();
  ctx.strokeStyle = rig.col(tones(rig, CHAIN).sh); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(hw + 17, -R(H * 1.49)); ctx.quadraticCurveTo(R(hw * 0.8), -R(H * 0.69), x + 6, y + 9); ctx.stroke();
  ctx.fillStyle = tones(rig, CROW.copper).deep; ctx.fillRect(x + 6, y - 6, 12, 2);
  if (!rig.jammed) return;
  // jammed: the drum glows and blows steam out of the cradle
  ctx.fillStyle = 'rgba(255,210,122,0.35)';
  ctx.beginPath(); ctx.arc(x + 4, y + 4, 19, 0, TAU); ctx.fill();
  ctx.fillStyle = rig.col(HOT); ctx.fillRect(x - 4, y - 7, 10, 4); ctx.fillRect(x + R(p.torsoW) + 1, y - 7, 6, 4);
}
/** Phase 1 head: the welding plate down over her face, one violet slit for a tell (hat hook, head space). */
function skreePlate(ctx, rig, pose, inf) {
  const r = inf.r;
  celPoly(ctx, rig, [R(-r * 1.05), R(-r * 1.15), R(r * 1.1), R(-r * 1.15), R(r * 1.15), R(r * 0.5), R(r * 0.5), R(r * 1.05), R(-r * 0.8), R(r * 1.0), R(-r * 1.1), R(r * 0.35)], IRON, 0.34, 0.34);
  if (rig.override) return;
  const slit = rig.tell ? (rig.tellWarn && (rig.tick & 2) ? '#FFFFFF' : CROW.sparkPale) : '#2A3040';
  ctx.fillStyle = rig.col(slit); ctx.fillRect(R(-r * 0.85), R(-r * 0.42), R(r * 1.85), 5);
  if (rig.tell) {
    ctx.fillStyle = 'rgba(155,123,255,0.3)';
    ctx.beginPath(); ctx.arc(R(r * 0.2), R(-r * 0.4), r * 1.1, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = tones(rig, IRON).deep; ctx.fillRect(R(-r * 0.9), R(r * 0.32), R(r * 1.6), 3);
  rimTop(ctx, rig, R(-r * 0.95), R(-r * 1.1), R(r * 0.9), R(-r * 1.1), CROW.pewter);
}
/** Phase 2 head: the same plate shoved up onto her brow — the face, the scar and the braid are out (hat hook). */
function skreePlateUp(ctx, rig, pose, inf) {
  const r = inf.r;
  celRect(ctx, rig, R(-r * 1.05), R(-r * 1.62), R(r * 2.15), 9, 2, IRON, 0.34, 0.32);
  if (rig.override) return;
  ctx.fillStyle = rig.col(rig.tell ? CROW.sparkPale : '#2A3040'); ctx.fillRect(R(-r * 0.85), R(-r * 1.46), R(r * 1.7), 3);
  ctx.fillStyle = rig.col(CROW.leatherDark); ctx.fillRect(R(-r * 1.05), R(-r * 0.98), R(r * 2.1), 4);
  // the scar across the near cheek
  ctx.fillStyle = rig.col('#B4735A'); ctx.fillRect(R(r * 0.55), R(-r * 0.05), 2, 7);
  if (!rig.tell) return;
  ctx.fillStyle = 'rgba(155,123,255,0.28)';
  ctx.beginPath(); ctx.arc(R(r * 0.3), R(-r * 1.44), r * 0.9, 0, TAU); ctx.fill();
}
/** The grapnel projectile: three flukes on a chain running back to the winch. */
function drawGrapnel(ctx, p, sx, sy) {
  const y = sy - p.r, d = p.facing;
  ctx.save(); ctx.translate(sx, y); ctx.scale(d, 1);
  capsule(ctx, -12, 0, 6, 0, 3, CHAIN, CROW.outline, 1);
  for (let i = 0; i < 3; i++) {
    const a = -0.7 + i * 0.7;
    pathPoly(ctx, [4, 0, 4 + Math.cos(a) * 13, Math.sin(a) * 13, 8 + Math.cos(a) * 13, Math.sin(a) * 13 + 3, 6, 3]);
    paint(ctx, CHAIN, CROW.outline, 1);
  }
  circle(ctx, -12, 0, 4, CROW.pewterDark, CROW.outline, 1);
  ctx.restore();
}

// ---------------------------------------------------------------- builds
const SKREE_PAL = { ...CROW_PAL, primary: '#3A4256', sleeve: '#C9BDA0', secondary: '#7E8798', metal: '#B4BECA', hair: '#3A2620', rank: RANK };
/** Phase 1: the winch. Squat and top-heavy under the drum — short legs, wide hips, a barrel of a torso. */
const WINCH_BUILD = {
  scale: 1.5, palette: SKREE_PAL, outline: CROW.outline, outlineWidth: 1,
  proportions: { ...CROW_PROPS, headR: 9, torsoW: 26, torsoH: 26, hip: 22, upperLeg: 14, lowerLeg: 13, legR: 6, armR: 5, handR: 5.4, footL: 13, footH: 6, bulge: 0.5 },
  parts: { ...CROW_PARTS, hat: skreePlate }, clan: RANK, smearColor: '#DCE6F4',
  // no rank cuff and no trouser lace: phase 1's rank is on the WINCH. Warm cuffs and a red trouser seam put the
  // same loud band on the woman that phase 2 is supposed to introduce, and flattened the machine -> person read.
  crow: { coat: 'plate', hair: 'crop', flag: true },
  weapon: { attach: 'handR', length: 44, draw: drawBoardingAxe, headAt: 34 },
  accessories: [{ attach: 'back', draw: drawWinch }],
};
/** Phase 2: cut loose. Taller, leaner, faster — plate up, braid out, torn shirt, wing-pack and one axe. */
const SKREE_BUILD = {
  ...WINCH_BUILD, scale: 1.3,
  proportions: { ...CROW_PROPS, headR: 8.5, torsoW: 21, torsoH: 27, hip: 17, upperLeg: 17, lowerLeg: 16, armR: 4.2 },
  parts: { ...CROW_PARTS, hat: skreePlateUp },
  // cut loose: the rank comes off the drum and onto her — waist sash, braid tie, cuffs, and the flag-rank gold edge
  crow: { coat: 'jerkin', hair: 'queue', flag: true, sash: true, tie: true, cuff: true, lace: true,
    scarf: RANK, scarfLen: 3, tailLen: 18 },
  accessories: [{ attach: 'back', draw: crowWings }, { attach: 'back', draw: crowTails }, { attach: 'torso', draw: crowScarf }],
};

// ---------------------------------------------------------------- animations
const WC = { armR: [30, 20], weapon: -12, armL: [-20, -12] };
const WINCH_STANCE = { lean: 13, head: -4, legR: [16, 8], legL: [-16, 10] };
/** Grapnel: the chain runs out along the lane and yanks whoever it catches back toward the winch (negative kbX). */
const GRAPNEL = {
  style: 'claw', chained: true, speed: 6.5, maxDist: 300, life: 72,
  damage: 22, type: 'knockdown', kbX: -5, kbY: 4, hitstun: 24, offsetX: 34, offsetY: 58, r: 9, muzzle: false, draw: drawGrapnel,
};
const winchAnims = Object.assign(makeCrowBase(WC, WINCH_STANCE), {
  // grapnel shot: 30f hauling the drum round (the slit lights, the chain rattles) -> fire -> 40f reeling in (punish)
  grapnel: crowStrike({
    tell: 30, active: 8, recovery: 40, carry: WC, lean: 13, tellSfx: 'hook_yank', sfx: 'hook_yank',
    event: 'spawnProjectile', projectile: GRAPNEL, fx: [{ kind: 'spark', x: 46, y: 54, count: 3 }],
    w1: { armR: [36, 54], weapon: 19, armL: [-34, -18], torso: 4, head: -6, root: [-3, 1], legR: [18, 10], legL: [-18, 12], face: 'angry' },
    w2: { armR: [56, 44], weapon: 19, armL: [-46, -12], torso: -6, head: -8, root: [-7, 1], legR: [14, 12], legL: [-22, 14], squash: 0.98, stretch: 1.02, face: 'angry' },
    h: { armR: [64, -6], weapon: 5, armL: [-40, 20], torso: 22, head: 6, root: [7, 1], legR: [42, 12], legL: [-32, 32], face: 'shout', squash: 1.04, stretch: 0.97 },
    smear: { from: -4, to: 10, a: 0.4, r: 62 },
    hold: { armR: [65, -4], weapon: 11, armL: [-42, 20], torso: 25, head: 7, root: [8, 1], legR: [42, 12], legL: [-32, 32], face: 'shout' },
    r: { armR: [28, 30], weapon: -3, armL: [-26, 10], torso: 14, head: 0, root: [3, 2], legR: [30, 12], legL: [-26, 26], face: 'grit' },
  }),
  // chain sweep: the drum pays out and she swings the whole length in a circle — both lanes, both sides
  chainSweep: crowStrike({
    tell: 28, active: 14, recovery: 34, carry: WC, lean: 13, tellSfx: 'crow_call', sfx: 'whiff',
    hitbox: frontBox(96, hit(20, 'knockdown', 7, 3, 24), { behind: true }),
    fx: [{ kind: 'slash', x: 0, y: 52, radius: 74, angle: 0, sweep: 220 }],
    w1: { armR: [-56, -20], weapon: -70, armL: [-40, 16], torso: 2, head: -6, root: [0, 0, -8], legR: [18, 8], legL: [-18, 10], face: 'angry' },
    w2: { armR: [-152, -8], weapon: -190, armL: [-124, 10], torso: -4, head: -12, root: [0, -2, -16], legR: [14, 10], legL: [-20, 12], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { armR: [112, -12], weapon: -430, armL: [110, -10], torso: 10, head: 4, root: [3, -2, 16], legR: [26, 12], legL: [-26, 14], face: 'shout', squash: 1.05, stretch: 0.96 },
    smear: { from: -190, to: 70, a: 0.6, r: 92 },
    hold: { armR: [120, -8], weapon: -484, armL: [116, -8], torso: 14, head: 6, root: [4, -1, 18], legR: [26, 12], legL: [-26, 14], face: 'shout' },
    r: { armR: [94, 4], weapon: -500, armL: [-36, 12], torso: 12, head: 2, root: [2, 1, 0], legR: [24, 10], legL: [-24, 12], face: 'grit' },
  }),
  // drum slam: she drops the whole winch on the deck; a shockwave goes out along the plates
  slam: crowStrike({
    tell: 32, active: 10, recovery: 36, carry: WC, lean: 13, tellSfx: 'hydraulic', sfx: 'hammer_slam',
    hitbox: areaBox(72, hit(22, 'knockdown', 5, 5, 26)),
    fx: [{ kind: 'ring', x: 0, y: 6, r0: 8, r1: 74, color: '#DCE6F4' }, { kind: 'dust', x: 0, y: 0, count: 8 }],
    w1: { armR: [-120, -30], weapon: 20, armL: [-110, -30], torso: -10, head: -10, root: [-2, 0], legR: [16, 10], legL: [-16, 12], face: 'angry' },
    w2: { armR: [-174, -10], weapon: -26, armL: [-166, -14], torso: -22, head: -18, root: [-5, 2], legR: [12, 8], legL: [-18, 12], squash: 0.95, stretch: 1.06, face: 'grit' },
    h: { armR: [-3, 20], weapon: 25, armL: [-15, 22], torso: 38, head: 10, root: [4, 5], legR: [50, 34], legL: [-36, 40], face: 'shout', squash: 1.14, stretch: 0.9 },
    smear: { from: -64, to: 35, a: 0.6, r: 74 },
    hold: { armR: [-2, 24], weapon: 37, armL: [-14, 26], torso: 40, head: 11, root: [4, 5], legR: [50, 34], legL: [-36, 40], face: 'shout' },
    r: { armR: [8, 28], weapon: 31, armL: [-4, 30], torso: 30, head: 6, root: [3, 4], legR: [42, 26], legL: [-30, 34], face: 'grit' },
  }),
  // intro: she plants the axe, the drum spins up and she calls the deck to order
  intro: { loop: false, frames: [
    FK(26, { ...WC, torso: 4, head: -6, root: [0, 2], legR: [16, 10], legL: [-16, 10], squash: 1.04, stretch: 0.96 }, { sfx: 'hydraulic', ease: 'out' }),
    FK(24, { ...WC, armR: [-150, -20], weapon: -40, armL: [-40, -30], torso: -10, head: -14, root: [0, -1], face: 'shout' }, { sfx: 'crow_call', ease: 'inout', fx: [{ kind: 'spark', x: -12, y: 78, count: 5 }] }),
    FK(22, { ...WC, torso: 14, head: 4, root: [0, 1], face: 'angry' }, { ease: 'inout' }),
  ] },
  // phase change: the harness blows its pins, the drum drops off her back and she steps out of it
  phaseChange: { loop: false, frames: [
    FK(16, { ...WC, torso: -18, head: -20, armR: [-40, 30], armL: [-70, -30], root: [-4, 0], face: 'hurt' }, { sfx: 'prop_break', ease: 'out' }),
    FK(14, { ...WC, torso: 24, head: 6, root: [2, 4], legR: [36, 44], legL: [-26, 44], squash: 1.12, stretch: 0.9, face: 'grit' }, { ease: 'in', fx: [{ kind: 'debris', x: -10, y: 40, count: 8 }, { kind: 'dust', x: 0, y: 0, count: 8 }] }),
    FK(14, { ...WC, torso: 6, head: -6, root: [0, 1], face: 'angry' }, { ease: 'out' }),
  ] },
  // defeat: the axe goes, she folds over the rail and the wing-pack fizzles out
  defeat: { loop: false, frames: [
    FK(20, { ...WC, torso: -16, head: -22, armR: [-20, 50], armL: [-70, -50], weapon: -40, root: [-4, 0], legR: [24, 6], legL: [-16, 14], face: 'hurt' }, { sfx: 'crow_death', ease: 'out' }),
    FK(18, { ...WC, torso: 28, head: -4, armR: [40, 44], armL: [24, 38], root: [0, 5], legR: [40, 44], legL: [-28, 46], squash: 1.12, stretch: 0.9, face: 'dazed' }, { ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }] }),
    FK(60, { armR: [-22, -6], weapon: -14, armL: [28, 18], torso: 8, head: -16, legR: [12, 10], legL: [-4, 8], root: [26, -8, -88], face: 'dazed' }, { ease: 'out' }),
  ] },
});
const SC = { armR: [28, 22], weapon: -10, armL: [-24, -16] };
const SKREE_STANCE = { lean: 4, head: -2, legR: [10, 4], legL: [-10, 6] };
const skreeAnims = Object.assign(makeCrowBase(SC, SKREE_STANCE), {
  // axe combo: a chopping first hit that chains straight into a rising second
  chop: crowStrike({
    tell: 20, active: 9, recovery: 24, carry: SC, lean: 4, tellSfx: 'crow_call', sfx: 'hammer_slam',
    hitbox: frontBox(54, hit(16, 'medium', 5, 0, 20)), fx: [{ kind: 'slash', x: 44, y: 44, radius: 26, angle: 40, sweep: 90 }],
    w1: { armR: [-134, -30], weapon: 6, armL: [34, 20], torso: -10, head: -8, root: [-2, 0], legR: [12, 8], legL: [-16, 10], face: 'angry' },
    w2: { armR: [-172, -12], weapon: -24, armL: [46, 26], torso: -20, head: -12, root: [-5, -1], legR: [8, 8], legL: [-18, 12], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { armR: [26, 12], weapon: 5, armL: [-30, 18], torso: 32, head: 8, root: [6, 3], legR: [46, 24], legL: [-34, 36], face: 'shout', squash: 1.08, stretch: 0.93 },
    smear: { from: -66, to: 20, a: 0.55, r: 58 },
    hold: { armR: [27, 14], weapon: 18, armL: [-32, 18], torso: 35, head: 9, root: [7, 3], legR: [46, 24], legL: [-34, 36], face: 'shout' },
    r: { armR: [26, 18], weapon: 6, armL: [-24, 14], torso: 22, head: 4, root: [4, 2], legR: [36, 16], legL: [-28, 30], face: 'grit' },
  }),
  rip: crowStrike({
    tell: 16, active: 9, recovery: 30, carry: SC, lean: 4, tellSfx: 'crow_call', sfx: 'hammer_slam',
    hitbox: frontBox(48, hit(18, 'launch', 3, 8, 24)), fx: [{ kind: 'slash', x: 38, y: 50, radius: 28, angle: -70, sweep: 110 }],
    w1: { armR: [-30, 66], weapon: 8, armL: [30, 26], torso: 12, head: 4, root: [0, 4], legR: [30, 40], legL: [-10, 30], squash: 1.07, stretch: 0.94, face: 'angry' },
    w2: { armR: [-44, 78], weapon: 12, armL: [38, 30], torso: 18, head: 6, root: [-2, 6], legR: [34, 48], legL: [-14, 36], squash: 1.1, stretch: 0.91, face: 'grit' },
    h: { armR: [204, -32], weapon: -14, armL: [-34, 20], torso: -16, head: -10, root: [5, -9], legR: [20, 10], legL: [-26, 30], face: 'shout', squash: 0.92, stretch: 1.1 },
    smear: { from: 38, to: -66, a: 0.55, r: 56 },
    hold: { armR: [212, -28], weapon: 0, armL: [-36, 20], torso: -20, head: -12, root: [5, -7], legR: [20, 10], legL: [-26, 30], face: 'shout' },
    r: { armR: [186, -18], weapon: 4, armL: [-28, 16], torso: -8, head: -6, root: [4, -3], legR: [22, 12], legL: [-24, 28], face: 'grit' },
  }),
  // wing hop: she kicks the pack and crosses the deck, axe first
  swoop: crowStrike({
    tell: 22, active: 12, recovery: 30, carry: SC, lean: 4, tellSfx: 'gale', sfx: 'whiff',
    hitbox: frontBox(50, hit(18, 'knockdown', 7, 4, 24)), move: { x: 7 }, fx: [{ kind: 'spark', x: -14, y: 40, count: 4 }],
    w1: { armR: [-10, 30], weapon: -49, armL: [34, 30], torso: 16, head: -8, root: [-3, 3], legR: [28, 32], legL: [-16, 28], squash: 1.07, stretch: 0.94, face: 'angry' },
    w2: { armR: [-20, 34], weapon: -65, armL: [44, 34], torso: 6, head: -12, root: [-7, 4], legR: [24, 40], legL: [-20, 34], squash: 1.1, stretch: 0.91, face: 'grit' },
    h: { armR: [53, -12], weapon: 0, armL: [-62, 18], torso: 44, head: -8, root: [8, -2], legR: [58, 8], legL: [-48, 54], face: 'shout', squash: 0.94, stretch: 1.07 },
    smear: { from: 70, to: 5, a: 0.5, r: 60 },
    hold: { armR: [58, -8], weapon: 8, armL: [-54, 18], torso: 40, head: -6, root: [8, 0], legR: [44, 20], legL: [-34, 44], face: 'shout' },
    r: { armR: [44, 8], weapon: 0, armL: [-30, 14], torso: 26, head: -2, root: [4, 2], legR: [34, 12], legL: [-26, 28], face: 'grit' },
  }),
  // rally: two fingers to the plate and the watch below sends up two Crimpers
  rally: crowStrike({
    tell: 26, active: 8, recovery: 34, carry: SC, lean: 4, tellSfx: 'crow_call', sfx: 'crow_call',
    event: 'summon', summon: [{ type: 'stormcrow', variant: 'crimper' }, { type: 'stormcrow', variant: 'crimper' }],
    w1: { armR: [26, 24], weapon: -10, armL: [-120, -40], torso: -4, head: -6, root: [-2, 0], legR: [12, 8], legL: [-14, 10], face: 'angry' },
    w2: { armR: [24, 26], weapon: -10, armL: [-166, -20], torso: -12, head: -14, root: [-4, -1], legR: [10, 8], legL: [-16, 12], squash: 0.97, stretch: 1.04, face: 'grit' },
    h: { armR: [22, 28], weapon: -10, armL: [-178, -6], torso: -18, head: -20, root: [0, -3], legR: [14, 8], legL: [-18, 12], face: 'shout', squash: 0.94, stretch: 1.07 },
    hold: { armR: [22, 28], weapon: -10, armL: [-174, -4], torso: -16, head: -18, root: [0, -2], legR: [14, 8], legL: [-18, 12], face: 'shout' },
    r: { armR: [26, 26], weapon: -10, armL: [-120, -20], torso: -2, head: -8, root: [0, 1], legR: [12, 8], legL: [-14, 10], face: 'angry' },
  }),
  phaseChange: winchAnims.phaseChange,
  defeat: winchAnims.defeat,
});

/** Quartermaster Skree & the Grapnel Winch — the Stage 2 mid-boss. */
export const midboss2 = {
  id: 'midboss2', type: 'midboss2', variant: 'skree', name: 'QUARTERMASTER SKREE', subtitle: '& THE GRAPNEL WINCH',
  role: 'boss', bossKind: 'midboss', boss: true, music: 'midboss2',
  build: WINCH_BUILD, anims: winchAnims, score: 5000, drops: ['food_big', 'meter', 'score_big'],
  grabbable: false, throwDamageMult: 1, sfx: { hurt: 'crow_hurt', death: 'crow_death' },
  hooks: {
    /** Art state: the drum spins while the chain is out and locks, venting, while the winch is jammed. */
    onUpdate(f) {
      const n = f.anim.name;
      f.rig.chainOut = n === 'grapnel' && f.anim.frameIndex >= 2;
      f.rig.jammed = !!f.stalled;
      f.rig.wings = n === 'swoop' || f.airborne;
    },
    onPhase(f, i, world) {
      if (!world || i !== 1) return;
      particles.burst('debris', f.x, f.h * 0.6, f.z, 14, { speed: 3.6, up: 2.6, color: DRUM, sizeJitter: 2 });
      particles.burst('spark', f.x, f.h * 0.6, f.z, 10, { speed: 3, up: 2 });
      world.addFx('ring', f.x, 40, f.z, { r0: 8, r1: 110, color: '#DCE6F4' });
    },
  },
  ai: { attackRange: 80, zTolerance: 18, attackCooldown: [44, 84], firstAttackDelay: 40, ignoresTokens: true, retreatChance: 0, flank: false },
  phases: [
    { name: 'THE GRAPNEL WINCH', hp: 320, color: '#9AA6B4', armor: true, unlaunchable: true, walkSpeed: 1.1,
      ai: { attacks: [{ anim: 'chainSweep', range: 104, weight: 4 }, { anim: 'slam', range: 76, weight: 3 }, { anim: 'grapnel', range: 300, minRange: 90, weight: 3 }],
        // every third attack the drum jams wide open: 3x damage and she can be grabbed out of it
        stallEvery: 3, stallFrames: 80, stallDamageMult: 3, stallGrabbable: true } },
    { name: 'SKREE', hp: 160, color: '#C4913A', armor: false, unlaunchable: false, grabbable: true, walkSpeed: 2.2,
      build: SKREE_BUILD, anims: skreeAnims,
      ai: { attackRange: 54, zTolerance: 14, attackCooldown: [30, 64], evadeChance: 0.4, evadeCooldown: 100,
        attacks: [{ anim: 'chop', range: 60, weight: 4, chain: 'rip' }, { anim: 'rip', range: 56, weight: 2 },
          { anim: 'swoop', range: 190, minRange: 70, weight: 3 }, { anim: 'rally', range: 400, weight: 1, maxUses: 1 }] } },
  ],
};
