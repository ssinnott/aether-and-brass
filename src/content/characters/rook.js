// Captain Rook Halloway — Balanced ranged hybrid (GDD 2.3). Human airship captain: oxblood frock coat over a cream
// waistcoat, tricorne, gear eye-patch, short dark beard, fringed epaulettes, two lagging coat tails; cutlass in the near
// hand, clockwork revolver in the far hand. Hand-authored cel-shaded rig + full animation set.
//
// Moveset (GDD 2.3, timings inside the startup budgets, ART_STYLE section 8):
//   combo   slash 8 (5f startup, hitstun 16) -> reverse slash 8 -> pommel bash 10 (stagger) -> point-blank shot 14 (knockdown,
//           ~80 px knockback, pierces to a second enemy behind for 8). Reach 40.
//   jump    downward slash 12; Attack again in the air = downward shot 8 (jumpAttack2)
//   dash    baseball slide 12, trips (low knockdown), hurtbox shrunk to 45 % so it passes under projectiles
//   special Fan the Hammer: 5 revolver shots in a 30 deg z-fan, 6 each, 200 px range (33f)
//   super   Broadside: the Stubborn Kettle crosses the far layer dropping 6 cannonballs (25, r 40, knockdown) 6f apart; invulnerable
//   grab    forward = 3 pommel hits (6 each) then a boot kick (12); back = hip toss, lands ~90 px behind and bounces (juggle-able)
//   trait   Parry: dodge frames 1-6 parry an enemy melee attack (enemy stunned 40f, +15 meter, 8f hit-stop)
//
// Readability ladder (ART_STYLE section 0): light warm skin / cream waistcoat + cravat / mid oxblood sleeves over a darker
// oxblood coat / dark brown beard / slate trousers / warm leather boots with a steel toe / light steel blade on a brass
// guard / dark felt tricorne with a brass band. Ground keys use G(): root.y is solved so the lowest sole sits on the floor.
import { speedFor, hpFor, areaBox, frontBox, P, F, hit } from './common.js';
import { JUMP_VY, METER, ST } from '../../constants.js';
import { celRect, celBall, celPoly, celPath, tones, flat, band } from '../../art/shading.js';
import { drawSkull, drawFace, drawBoot, drawFist, drawBelt } from '../../art/rigParts.js';
import { getChain } from '../../art/secondary.js';
import { buildRig, computeJoints } from '../../art/rig.js';
import { makePose } from '../../art/poses.js';
import { drawHeadPortrait } from '../../art/portraits.js';
import { pathGear, rrect, circle, pathPoly, paint, line } from '../../art/shapes.js';
import { rad } from '../../engine/math.js';

// skin: light warm  hair/beard: dark brown  primary: oxblood coat  sleeve: lighter oxblood  secondary: slate trousers
// accent: brass  metal: light steel  dark: leather boots  glow: muzzle flash
// Saturation pass. His defect was never the hue, it was that the coat and the sleeve were the same oxblood five Oklab
// L* apart, so the whole torso read as one blot. They are split by VALUE, not by a second red: coat #5A2A2A ->
// #5A1919 (L* 35.0 -> 32.0, s 53 -> 72) and sleeve #743434 -> #8C1F1F (L* 41.1 -> 42.3, s 55 -> 78) - a 10 L* step
// that keeps palette/sleeve-vs-primary green with room to spare. Trousers #3C4258 -> #283A63 (L* 38.3 -> 35.5,
// s 32 -> 60): the old slate was almost achromatic and lived in the low-chroma core every polychrome backdrop also
// occupies. Beard #3A2A1E -> #46301C and tricorne felt #2A2028 -> #382E40 are the INK FLOOR: at Oklab L* 30.0 and
// 25.9 against the #1E1A22 outline (L* 22.6) both were within 9 L* of their own line, i.e. the outline round the
// beard and round the hat was drawn and then swallowed. Both now clear the ink by 9+ L* and both are still dark.
// Blade #D8D8D8 -> #CFD7E2 and revolver IRON #4A4A58 -> #414A62: the blade was a PURE grey (Oklab C 0.0, the exact
// centre of the colour lattice) on one of his biggest shapes. Both are still light steel and dark iron; they are
// simply cool now, like every other steel in the cast, instead of sitting on the neutral axis.
// TROUSERS: #283A63 -> #394C76. The hex itself was the defect -- pip.js painted the SAME #283A63 as her chassis,
// her single largest mass, and ART_STYLE 4's cast-readability test says no two of the four heroes may share a
// large-mass colour. The move is 6.5 Oklab L* up at held hue and chroma, which also puts Rook's dark coat on a
// mid trouser instead of two darks, and takes one more hex off the L* 35 rung the whole cast's shadow layer had
// converged on. Measured over all seven sections: lost% 31.50 -> 31.72, reservation overlap 31.17 -> 31.12.
// The COAT is left at #5A1919 deliberately. A review asked for ~4 more Oklab L* of separation from the Sootfoot
// plank (#443629, L* 34.4) on the grounds that Rook's coat is why heroes-rp loses 48.5 % of its pixels there. It
// is not: a 12-point sweep of the coat over L* 32-44 and the trousers over L* 35-48, measured on all seven
// sections, moves that row between 47.5 % and 48.5 % -- one point, at L* 44, where the coat is a mid brick and no
// longer an oxblood. The docks row is an INK problem: 23.5 % of these two rigs' pixels are the mandated #1E1A22
// outline, its edge dE against the plank is 7.4, and the coat cannot go below L* 31.6 without that outline dying
// inside it. Lightening the bodies to move the number is the mechanism the brief itself names as what loses a cast.
const PAL = { skin: '#F0D9B5', hair: '#46301C', primary: '#5A1919', sleeve: '#8C1F1F', secondary: '#394C76', accent: '#C9A227', metal: '#CFD7E2', dark: '#6B3E24', glow: '#F2C94C' };
const CREAM = '#E8DCC0', FELT = '#382E40', LEATHER = '#3A2418', IRON = '#414A62', BROW = '#2A1A12', HOT = '#FFD27A', WHITE = '#FFFFFF';
const KETTLE = '#B86A3A', BALLOON = '#6B4A3A', SAIL = '#D9CDAE';
const R = Math.round, TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------------------
// Rig parts (all in the local spaces set up by rig.js; allocation-free)
// ---------------------------------------------------------------------------------------------------------------
/** Cutlass (hand space, +x along the blade): leather grip, brass pommel + knuckle guard, curved 34 px steel blade. */
function drawCutlass(ctx, rig) {
  ctx.beginPath(); ctx.rect(-7, -2, 11, 4); flat(ctx, rig, LEATHER);
  celPoly(ctx, rig, [-8, 2, -8, 7, 2, 8, 6, 3, 6, 1, 3, 4, -5, 3], PAL.accent, 0.36, 0.3);
  celPoly(ctx, rig, [4, -2, 18, -3, 30, -8, 37, -4, 35, 0, 22, 2, 4, 2], PAL.metal, 0.34, 0.32);
  if (rig.override) return;
  ctx.fillStyle = rig.col(PAL.accent); ctx.fillRect(-10, -2, 3, 4);
  ctx.fillStyle = tones(rig, PAL.metal).sh; ctx.fillRect(6, 1, 16, 1);
  ctx.fillStyle = rig.col(WHITE); ctx.fillRect(12, -3, 10, 1);
}
/** Clockwork revolver, drawn in the far hand right after the fist (hand space): iron frame, brass cylinder, steel barrel. */
function drawRevolver(ctx, rig, inf) {
  const pal = inf.pal;
  if (rig.spin > 0) ctx.rotate(rig.tick * 0.55);
  ctx.beginPath(); ctx.rect(10, -2, 6, 3); flat(ctx, rig, pal.metal);
  ctx.beginPath(); ctx.rect(1, -3, 10, 6); flat(ctx, rig, IRON);
  celBall(ctx, rig, 5, 0, 3, pal.accent, false);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, IRON).sh; ctx.fillRect(2, 1, 8, 1);
  ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(0, -5, 2, 2);
}
/** Fists; the far fist carries the revolver (so it draws in the far arm's layer, never over the torso). */
function drawHand(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.pal.skin);
  if (inf.far) drawRevolver(ctx, rig, inf);
}
/** Head: skull with dark hair under the hat, a sideburn and a short queue tied with brass at the nape. */
function drawHead(ctx, rig, pose, inf) {
  const r = inf.r;
  drawSkull(ctx, rig, r, PAL.skin, PAL.hair, { jaw: 0.4, hairStyle: 'short' });
  ctx.beginPath(); ctx.rect(R(-r * 0.9), -1, 2, 9); flat(ctx, rig, PAL.hair);
}
/** Face rows (20 px head): brows -6 | eyes -2..2 | nose 1..5 | moustache 2..4 | mouth 5..9 | beard 8..16. Gear eye-patch on the far eye. */
function drawFaceRook(ctx, rig, pose, inf) {
  const r = inf.r;
  drawFace(ctx, rig, r, pose.face | 0, { big: true, brow: BROW });
  // moustache under the nose, over the mouth corners
  ctx.beginPath(); ctx.rect(2, 2, 8, 2); flat(ctx, rig, PAL.hair);
  // eye-patch strap up and back under the hat, then the brass gear patch over the far eye
  if (!rig.override) { ctx.strokeStyle = rig.col(LEATHER); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(-9, -8); ctx.stroke(); }
  pathGear(ctx, -2, -1, 4.5, 6, rig.tick * 0.02, 1.4);
  flat(ctx, rig, PAL.accent);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, PAL.accent).sh; ctx.fillRect(-4, 0, 4, 2);
  ctx.fillStyle = tones(rig, PAL.accent).deep; ctx.fillRect(-3, -2, 2, 2);
}
/** Short dark beard: ONE polygon around the jaw, the chin swinging on a 2-segment chain; moustache and mouth stay clear. */
function drawBeard(ctx, rig, pose, inf) {
  const r = inf.r;
  const ch = getChain(rig, 'beard', 2, { joint: 'head', rest: [0, 1], stiffness: 0.16, damping: 0.66, gain: 1.4, rotGain: 0.5, maxAng: 22 });
  const a = rad(ch.ang[0] + ch.ang[1] * 0.6), len = 6, sx = Math.sin(a) * len, dy = Math.cos(a) * len;
  const x0 = R(-r * 0.8), x1 = R(r * 0.95);
  ctx.beginPath();
  ctx.moveTo(x0, 3); ctx.lineTo(x0 + 1, 9); ctx.lineTo(-3 + sx * 0.5, 11 + dy * 0.7); ctx.lineTo(2 + sx, 9 + dy); ctx.lineTo(7 + sx * 0.5, 11 + dy * 0.6);
  ctx.lineTo(x1, 9); ctx.lineTo(x1, 5); ctx.lineTo(8, 8); ctx.lineTo(-5, 8);
  ctx.closePath();
  celPath(ctx, rig, PAL.hair, 1, 10, 9, 0.34, 0.2);
}
/** Tricorne: dark felt with a cocked front and back brim, brass band and a brass cockade; sits above the hairline. */
function drawTricorne(ctx, rig) {
  celPoly(ctx, rig, [-15, -9, 15, -9, 17, -17, 8, -19, -9, -19, -15, -16], FELT, 0.34, 0.26);
  if (rig.override) return;
  // brass band on felt is a MATERIAL change and takes ink (section 0.2), widened 3 -> 4 px so the inked band still
  // carries its colour (section 0.7); its lower ink row lands on the hat's own bottom outline instead of below it.
  band(ctx, rig, -13, -13, 26, 4, PAL.accent);
  ctx.fillStyle = tones(rig, PAL.accent).sh; ctx.fillRect(-13, -10, 26, 1);
  ctx.beginPath(); ctx.arc(10, -14, 3, 0, TAU); flat(ctx, rig, PAL.accent);
  ctx.fillStyle = tones(rig, FELT).hi; ctx.fillRect(-7, -18, 12, 1);
}
/** Oxblood coat (open) over a cream waistcoat with one column of brass buttons, cravat at the collar (torso space). */
function drawTorso(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2);
  celPoly(ctx, rig, [-hw - 1, -H + 4, -hw + 4, -H, hw - 4, -H, hw + 1, -H + 4, hw, R(-H * 0.5), hw - 2, 2, -hw + 2, 2, -hw, R(-H * 0.5)], PAL.primary, 0.36, 0.26);
  celPoly(ctx, rig, [-6, -H + 4, 6, -H + 4, 7, 1, -7, 1], CREAM, 0.34, 0.2);
  ctx.beginPath(); ctx.rect(-4, -H - 1, 8, 4); flat(ctx, rig, CREAM);
  if (rig.override) return;
  const tb = tones(rig, PAL.accent);
  ctx.fillStyle = tb.base; ctx.fillRect(-1, -H + 7, 3, 3); ctx.fillRect(-1, -H + 12, 3, 3); ctx.fillRect(-1, -H + 17, 3, 3);
  ctx.fillStyle = tb.sh; ctx.fillRect(-1, -H + 9, 3, 1); ctx.fillRect(-1, -H + 14, 3, 1); ctx.fillRect(-1, -H + 19, 3, 1);
  ctx.fillStyle = tones(rig, PAL.primary).sh; ctx.fillRect(-hw + 2, R(-H * 0.5), 3, 1); ctx.fillRect(hw - 5, R(-H * 0.5), 3, 1);
}
/** Belt with a brass buckle over slate trousers (hip space). */
function drawHips(ctx, rig, pose, inf) { drawBelt(ctx, rig, inf.w, PAL.secondary, LEATHER, PAL.accent); }
/** Fringed epaulette at each shoulder joint (torso space, over the upper arm); far side arrives pre-darkened in inf.pal. */
function drawEpaulette(ctx, rig, pose, inf) {
  const x = inf.far ? -10 : 2;
  ctx.beginPath(); ctx.rect(x, -5, 10, 4); flat(ctx, rig, inf.pal.accent);
  if (rig.override) return;
  const t = tones(rig, inf.pal.accent);
  ctx.fillStyle = t.hi; ctx.fillRect(x + 1, -5, 8, 1);
  ctx.fillStyle = t.sh; ctx.fillRect(x + 1, -1, 2, 3); ctx.fillRect(x + 4, -1, 2, 3); ctx.fillRect(x + 7, -1, 2, 3);
}
/** Leather boots with a folded cuff and a light steel toe (ankle space). */
function drawBootR(ctx, rig, pose, inf) {
  drawBoot(ctx, rig, inf.w, inf.h, inf.pal.dark, inf.pal.accent);
  if (rig.override) return;
  const toe = R(inf.w * 0.62);
  ctx.fillStyle = rig.col(inf.pal.metal); ctx.fillRect(toe - 5, -1, 5, 4);
  ctx.fillStyle = tones(rig, inf.pal.metal).sh; ctx.fillRect(toe - 5, 2, 5, 1);
}
/** One coat tail: two lagging oxblood segments with a cream lining edge (torso space, hanging down-back from the hip). */
function drawTail(ctx, rig, name, x, y, hex, edge) {
  const ch = getChain(rig, name, 2, { joint: 'torso', rest: [-0.4, 0.92], stiffness: 0.13, damping: 0.68, gain: 2.0, rotGain: 0.55, maxAng: 40 });
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(0.92, -0.4) - Math.PI / 2);
  for (let i = 0; i < 2; i++) {
    ctx.rotate(rad(ch.ang[i]));
    const w = 9 - i * 2;
    ctx.beginPath(); ctx.moveTo(-w * 0.5, 0); ctx.lineTo(w * 0.5, 0); ctx.lineTo(w * 0.5 - 1, 9); ctx.lineTo(-w * 0.5 + 1, 9); ctx.closePath();
    flat(ctx, rig, hex);
    if (!rig.override) { ctx.fillStyle = rig.col(edge); ctx.fillRect(R(w * 0.5) - 3, 1, 2, 7); }
    ctx.translate(0, 8);
  }
  ctx.restore();
}
function drawCoatTails(ctx, rig) {
  const t = tones(rig, PAL.primary);
  drawTail(ctx, rig, 'tailF', -R(rig.p.torsoW / 2) - 3, 0, t.sh, tones(rig, CREAM).sh);
  drawTail(ctx, rig, 'tailN', -R(rig.p.torsoW / 2) + 4, 1, PAL.primary, CREAM);
}
/** Bust portrait (select cards / HUD): the rig's head and shoulders in the idle carry. */
let portraitRig = null;
const PORTRAIT_POSE = P({ armR: [16, -4], weapon: -60, armL: [-30, -16], legR: [10, 2], legL: [-10, 4], torso: 2, head: -2, face: 'angry' });
function portrait(ctx, x, y, s) {
  if (!portraitRig) portraitRig = buildRig(build);
  drawHeadPortrait(ctx, portraitRig, PORTRAIT_POSE, x, y, s, { bg: null, fill: 0.6, cy: 0.52 });
}

const build = {
  scale: 1, palette: PAL, outline: '#1E1A22', outlineWidth: 1, smearColor: '#E8E8F0',
  farShade: 0.62, farDesat: 0.25,
  // 79 px tall, ~4 heads: 20 px head (big-face rows + hat), broad-shouldered 24 px coat, long legs
  proportions: { headR: 10, neck: 3, torsoW: 24, torsoH: 25, hip: 20, upperArm: 13, lowerArm: 12, armR: 4.5, handR: 5, upperLeg: 15, lowerLeg: 15, legR: 5.5, footL: 12, footH: 5, shoulderX: 3, hipX: 4, bulge: 0.5, neckR: 3.5 },
  parts: { head: drawHead, face: drawFaceRook, beard: drawBeard, hat: drawTricorne, torso: drawTorso, hips: drawHips, foot: drawBootR, hand: drawHand, shoulder: drawEpaulette },
  weapon: { attach: 'handR', length: 37, draw: drawCutlass, headAt: 24 },
  accessories: [{ attach: 'torso', layer: 'back', draw: drawCoatTails }],
};

// ---------------------------------------------------------------------------------------------------------------
// Animation authoring
// ---------------------------------------------------------------------------------------------------------------
const auditRig = buildRig(build);
/** Ground key: like F() but root.y is solved so the lowest boot sole sits on the floor; spec.root[1] is an extra sink. */
function G(dur, spec, extra) {
  const pose = P(spec), full = makePose(pose), J = computeJoints(auditRig, full), fh = auditRig.p.footH * 0.5;
  const rr = rad(full.root.rot), c = Math.cos(rr), s = Math.sin(rr);
  const boot = Math.max(J.ankleN.x * s + (J.ankleN.y + fh) * c, J.ankleF.x * s + (J.ankleF.y + fh) * c);
  pose.root = { x: full.root.x, y: R(-boot) + (spec.root ? spec.root[1] || 0 : 0), rot: full.root.rot };
  return { dur, pose, ...(extra || {}) };
}
/** Rest carry: cutlass low at the side, tip forward-down (blade ~72 deg), revolver arm hanging back so both fists show. */
const CARRY = { armR: [16, -4], weapon: -60, armL: [-30, -16], legR: [10, 2], legL: [-10, 4] };
/** Guard: cutlass up-forward in front of the chest, revolver up at the ribs, knees soft. */
const GUARD = { armR: [30, 70], weapon: -50, armL: [-16, 92], legR: [14, 2], legL: [-12, 6] };
const SW = 'whiff', GUN = 'revolver';
const SLASH = (x, y, radius, angle, sweep) => [{ kind: 'slash', x, y, radius, angle, sweep, color: '#F4F4FF' }];
/** Downward slash hit data (shared id = one hit per target across the hit + held frames). */
const JUMP_HIT = { id: 'jumpAttack', x: -6, y: -50, w: 58, h: 78, z: 24, once: true, damage: 12, type: 'medium', kbX: 3, kbY: 0, hitstun: 20 };
/** Cutlass dropped along the floor while lying (root rot -88: body-space +y runs toward the feet along the ground). */
const FLOORED = { armR: [-20, -6], weapon: -24, armL: [26, 18], torso: 4, head: -10, legR: [12, 6], legL: [-4, 8], root: [32, -9, -88], face: 'dazed' };
const BULLET = { style: 'bullet', damage: 6, type: 'light', hitstun: 14, kbX: 2, speed: 8, maxDist: 200, offsetX: 26, offsetY: 52, color: PAL.glow, r: 3 };
const shotFrame = (i, vz) => G(3, i & 1 ? { armR: [-46, -30], weapon: 24, armL: [104, -18], torso: 4, head: -6, root: [-2, 0], legR: [26, -12], legL: [-26, 22], face: 'shout' }
  : { armR: [-40, -30], weapon: 20, armL: [94, 2], torso: 8, head: -2, root: [0, 0], legR: [26, -12], legL: [-26, 22], face: 'grit' },
{ event: 'spawnProjectile', sfx: GUN, projectile: { ...BULLET, vz }, ease: 'out', fx: [{ kind: 'spark', x: 36, y: 50, type: 'light' }] });
const cannonball = (i) => G(6, i & 1 ? { armR: [166, -14], weapon: -22, armL: [84, -6], torso: -4, head: -10, root: [0, 0], legR: [22, 4], legL: [-22, 10], face: 'shout', squash: 0.98, stretch: 1.02 }
  : { armR: [172, -12], weapon: -18, armL: [92, -2], torso: -8, head: -14, root: [0, 1], legR: [24, 6], legL: [-24, 12], face: 'shout', squash: 1.03, stretch: 0.97 },
{ event: 'spawnProjectile', sfx: 'cannon', ease: 'inout', projectile: { fromSky: true, style: 'cannonball', noContactHit: true, onExpire: 'explode', radius: 40, index: i, ahead: 30, spacing: 40, height: 220, gravity: 0.6, life: 200, muzzle: false, color: '#2A2A30', r: 7,
  explodeHit: { damage: 25, type: 'knockdown', kbX: 5, kbY: 5, hitstun: 24 } } });

const anims = {
  idle: { loop: true, frames: [
    G(14, { ...CARRY, torso: 2, root: [0, 0] }, { ease: 'inout' }),
    G(14, { ...CARRY, torso: 4, head: 2, root: [0, 1], armR: [17, -5], weapon: -61, armL: [-28, -14] }, { ease: 'inout' }),
    G(12, { ...CARRY, torso: 3, head: 1, root: [0, 1], armR: [16, -4], weapon: -62 }, { ease: 'inout' }),
    G(14, { ...CARRY, torso: 1, head: -2, root: [0, 0], armR: [15, -3], weapon: -59, armL: [-32, -18] }, { ease: 'inout' }),
  ] },
  // walk: rolling captain's stride; the cutlass rides low in the near hand, the revolver arm swings biased back
  walk: { loop: true, frames: [
    G(4, { ...CARRY, legR: [30, 0], legL: [-24, 16], footR: -8, armL: [4, -6], torso: 5, armR: [20, -8], weapon: -64 }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [24, 8], legL: [-16, 30], armL: [-2, -8], torso: 6, head: 2, armR: [22, -10], weapon: -66, squash: 1.03, stretch: 0.97 }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [8, 22], legL: [0, 12], armL: [-14, -12], torso: 4, armR: [18, -6], weapon: -64 }, { ease: 'inout' }),
    G(4, { ...CARRY, legR: [-12, 14], legL: [20, -4], footL: -6, armL: [-30, -16], torso: 3, head: -1, armR: [14, -2], weapon: -62 }, { ease: 'in' }),
    G(4, { ...CARRY, legR: [-24, 16], legL: [30, 0], footL: -8, armL: [-46, -18], torso: 5, armR: [16, -4], weapon: -64 }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [-16, 30], legL: [24, 8], armL: [-40, -18], torso: 6, head: 2, armR: [18, -6], weapon: -66, squash: 1.03, stretch: 0.97 }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [0, 12], legL: [8, 22], armL: [-26, -16], torso: 4, armR: [18, -6], weapon: -64 }, { ease: 'inout' }),
    G(4, { ...CARRY, legR: [20, -4], legL: [-12, 14], footR: -6, armL: [-10, -10], torso: 3, head: -1, armR: [18, -6], weapon: -62 }, { ease: 'in' }),
  ] },
  // run: 20 deg lean, cutlass trailing flat behind, revolver arm pumping; both feet off the floor on the pass keys
  run: { loop: true, frames: [
    G(3, { armR: [-50, -40], weapon: 22, armL: [60, 60], legR: [54, 12], legL: [-42, 60], torso: 20, head: -4, face: 'angry' }, { ease: 'out' }),
    G(3, { armR: [-54, -40], weapon: 24, armL: [40, 70], legR: [40, 30], legL: [-30, 74], torso: 22, head: -4, squash: 1.04, stretch: 0.96, face: 'angry' }, { ease: 'out' }),
    F(3, { armR: [-50, -44], weapon: 20, armL: [10, 80], legR: [12, 40], legL: [10, 30], torso: 21, head: -3, root: [0, -4], face: 'angry' }, { ease: 'inout' }),
    F(3, { armR: [-46, -46], weapon: 18, armL: [-20, 80], legR: [-24, 54], legL: [42, 6], torso: 20, head: -4, root: [0, -3], face: 'angry' }, { ease: 'in' }),
    G(3, { armR: [-50, -40], weapon: 22, armL: [-36, 70], legR: [-42, 60], legL: [54, 12], torso: 20, head: -4, face: 'angry' }, { ease: 'out' }),
    G(3, { armR: [-54, -40], weapon: 24, armL: [-20, 70], legR: [-30, 74], legL: [40, 30], torso: 22, head: -4, squash: 1.04, stretch: 0.96, face: 'angry' }, { ease: 'out' }),
    F(3, { armR: [-50, -44], weapon: 20, armL: [10, 70], legR: [10, 30], legL: [12, 40], torso: 21, head: -3, root: [0, -4], face: 'angry' }, { ease: 'inout' }),
    F(3, { armR: [-46, -46], weapon: 18, armL: [40, 60], legR: [42, 6], legL: [-24, 54], torso: 20, head: -4, root: [0, -3], face: 'angry' }, { ease: 'in' }),
  ] },
  jump: { loop: false, frames: [
    G(3, { ...CARRY, legR: [30, 44], legL: [-22, 46], torso: 14, root: [0, 2], squash: 1.1, stretch: 0.9, armL: [-30, 30], armR: [30, -10], weapon: -80 }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [24, -34], legL: [8, -20], torso: -4, root: [0, -2], squash: 0.94, stretch: 1.08, armL: [-90, -30], head: -4, armR: [40, -16], weapon: -90 }, { ease: 'out' }),
    F(30, { ...CARRY, legR: [46, -76], legL: [16, -50], torso: 2, armL: [-70, -20], head: -2, armR: [36, -14], weapon: -84 }),
  ] },
  fall: { loop: true, frames: [
    F(10, { ...CARRY, legR: [26, -30], legL: [8, -20], armL: [-90, -30], torso: -6, head: -6, face: 'grit', armR: [36, -14], weapon: -84 }, { ease: 'inout' }),
    F(10, { ...CARRY, legR: [32, -40], legL: [4, -14], armL: [-104, -30], torso: -8, head: -8, face: 'grit', armR: [40, -18], weapon: -90 }, { ease: 'inout' }),
  ] },
  land: { loop: false, frames: [
    G(3, { ...CARRY, legR: [36, 48], legL: [-26, 50], torso: 22, head: 4, root: [0, 2], squash: 1.16, stretch: 0.86, armL: [-30, 30], armR: [30, -10], weapon: -92, face: 'grit' }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [16, 16], legL: [-12, 18], torso: 8, squash: 1.02, stretch: 0.98 }, { ease: 'out' }),
  ] },

  // ---- ground combo (GDD 2.3): slash -> reverse slash -> pommel bash (stagger) -> point-blank shot (knockdown, pierces) ----
  // anticipation (ease in, blade wound the other way) -> hit key (overshoot + smear + hitbox) -> hold (+4 deg) -> follow-through (cancel) -> return
  attack1: { loop: false, frames: [
    G(2, { armR: [-40, -90], weapon: -20, armL: [40, -30], torso: -8, head: -4, root: [-2, 0], legR: [12, 0], legL: [-16, 10], face: 'angry' }, { sfx: SW, ease: 'in' }),
    G(3, { armR: [-52, -100], weapon: -12, armL: [50, -36], torso: -12, head: -6, root: [-3, 0], legR: [10, 2], legL: [-20, 14], face: 'angry' }, { ease: 'out' }),
    // hit: level cut from behind the head to full extension in front, blade at chest height inside the 40 px box
    G(3, { armR: [70, 22], weapon: 12, armL: [-30, 10], torso: 22, head: 5, root: [5, 0], legR: [34, 6], legL: [-28, 22], face: 'shout' },
      { hitbox: frontBox(40, hit(8, 'light', 2, 0, 16)), smear: { from: -160, to: 0, a: 0.5 }, fx: SLASH(30, 44, 30, 6, 110), ease: 'overshoot' }),
    G(2, { armR: [74, 26], weapon: 16, armL: [-32, 10], torso: 24, head: 5, root: [6, 0], legR: [34, 6], legL: [-28, 22], face: 'shout' }, { ease: 'out' }),
    G(6, { armR: [70, 30], weapon: 24, armL: [-28, 10], torso: 20, head: 4, root: [5, 0], legR: [32, 6], legL: [-26, 20], face: 'angry' }, { cancel: 'attack', ease: 'inout' }),
    G(4, { ...GUARD, torso: 8, root: [2, 0], face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack2: { loop: false, frames: [
    G(2, { armR: [60, 60], weapon: -4, armL: [-30, 10], torso: 14, head: 2, root: [2, 0], legR: [30, 6], legL: [-24, 20], face: 'angry' }, { sfx: SW, ease: 'in' }),
    G(3, { armR: [70, 70], weapon: 0, armL: [-36, 14], torso: 18, head: 4, root: [3, 0], legR: [30, 6], legL: [-24, 20], face: 'angry' }, { ease: 'out' }),
    // hit: backhand rising cut from the knee to over the shoulder
    G(3, { armR: [110, -40], weapon: -41, armL: [-50, 10], torso: 4, head: -6, root: [4, 0], legR: [30, 6], legL: [-26, 22], face: 'shout' },
      { hitbox: frontBox(40, hit(8, 'light', 2, 0, 16)), smear: { from: 40, to: -70, a: 0.5 }, fx: SLASH(30, 46, 30, -30, 110), ease: 'overshoot' }),
    G(2, { armR: [114, -44], weapon: -45, armL: [-52, 10], torso: 2, head: -8, root: [4, 0], legR: [30, 6], legL: [-26, 22], face: 'shout' }, { ease: 'out' }),
    G(6, { armR: [100, -50], weapon: -50, armL: [-44, 10], torso: 0, head: -6, root: [3, 0], legR: [28, 6], legL: [-24, 20], face: 'angry' }, { cancel: 'attack', ease: 'inout' }),
    G(4, { ...GUARD, torso: 6, root: [2, 0], face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack3: { loop: false, frames: [
    // pommel bash: the cutlass flips point-up, the fist pulls back to the ribs and punches the pommel into the face
    G(3, { armR: [-20, 100], weapon: -76, armL: [-40, 20], torso: -6, head: -2, root: [-2, 0], legR: [14, 2], legL: [-16, 10], face: 'angry' }, { sfx: SW, ease: 'in' }),
    G(3, { armR: [-26, 104], weapon: -80, armL: [-46, 24], torso: -10, head: -4, root: [-3, 0], legR: [12, 2], legL: [-20, 14], face: 'angry' }, { ease: 'out' }),
    G(3, { armR: [54, 34], weapon: -85, armL: [-30, 10], torso: 14, head: 4, root: [6, 0], legR: [36, 4], legL: [-30, 24], face: 'shout' },
      { hitbox: frontBox(32, hit(10, 'medium', 1.5, 0, 20, { stagger: true, sfx: 'hit_medium' })), smear: { from: -30, to: 20, a: 0.35, r: 46 },
        fx: [{ kind: 'ring', x: 34, y: 48, r0: 2, r1: 18, color: HOT }], ease: 'overshoot' }),
    G(3, { armR: [58, 36], weapon: -89, armL: [-32, 10], torso: 16, head: 4, root: [7, 0], legR: [36, 4], legL: [-30, 24], face: 'shout' }, { ease: 'out' }),
    G(6, { armR: [50, 40], weapon: -84, armL: [-28, 10], torso: 12, head: 2, root: [5, 0], legR: [32, 4], legL: [-28, 22], face: 'angry' }, { cancel: 'attack', ease: 'inout' }),
    G(4, { ...GUARD, torso: 6, root: [2, 0], face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack4: { loop: false, frames: [
    // point-blank shot: the cutlass sweeps back and down out of the way while the revolver comes up to the enemy's face
    G(3, { armR: [10, 20], weapon: -30, armL: [40, 60], torso: 2, head: 2, root: [0, 0], legR: [16, 2], legL: [-18, 12], face: 'angry' }, { ease: 'in' }),
    G(3, { armR: [-36, 20], weapon: -14, armL: [80, 20], torso: 8, head: 4, root: [2, 0], legR: [20, 0], legL: [-22, 16], face: 'grit' }, { ease: 'out' }),
    G(3, { armR: [-44, 24], weapon: -10, armL: [96, -4], torso: 10, head: 2, root: [-3, 0], legR: [22, 0], legL: [-26, 18], face: 'shout', squash: 1.02, stretch: 0.98 },
      { hitbox: { ...frontBox(60, hit(14, 'knockdown', 5, 4, 20, { sfx: GUN })), maxTargets: 2, pierceDamage: 8 }, sfx: GUN, ease: 'overshoot',
        fx: [{ kind: 'muzzle', x: 38, y: 58 }, { kind: 'spark', x: 44, y: 54, type: 'heavy' }] }),
    G(3, { armR: [-44, 24], weapon: -10, armL: [106, -22], torso: 4, head: -4, root: [-5, 0], legR: [20, 0], legL: [-26, 18], face: 'shout' }, { ease: 'out' }),
    G(9, { armR: [-40, 22], weapon: -14, armL: [96, -8], torso: 6, head: -2, root: [-3, 0], legR: [20, 0], legL: [-24, 18], face: 'angry' }, { cancel: 'any', ease: 'inout' }),
    G(4, { ...GUARD, torso: 6, root: [0, 0] }, { cancel: 'any', ease: 'out' }),
  ] },

  // ---- downward slash (12): cutlass over the head, whipped down and forward; the box stays live through the descent ----
  jumpAttack: { loop: false, frames: [
    F(4, { armR: [-60, -80], weapon: -10, armL: [50, -30], torso: -10, head: -6, legR: [50, -90], legL: [16, -50], face: 'angry' }, { sfx: SW, ease: 'in' }),
    F(5, { armR: [80, -30], weapon: 34, armL: [-40, 10], torso: 24, head: 6, legR: [56, -100], legL: [16, -56], face: 'shout' },
      { hitbox: JUMP_HIT, smear: { from: -170, to: 60, a: 0.5 }, fx: SLASH(24, 30, 32, 50, 120), ease: 'overshoot' }),
    F(20, { armR: [84, -28], weapon: 38, armL: [-44, 10], torso: 26, head: 6, legR: [52, -96], legL: [14, -52], face: 'grit' }, { hitbox: JUMP_HIT }),
  ] },
  // second air action: downward revolver shot (8)
  jumpAttack2: { loop: false, frames: [
    F(3, { armR: [70, -60], weapon: -20, armL: [70, -20], torso: 10, head: 6, legR: [40, -70], legL: [10, -40], face: 'angry' }, { ease: 'in' }),
    F(3, { armR: [76, -66], weapon: -20, armL: [32, 0], torso: 16, head: 10, legR: [44, -76], legL: [12, -44], face: 'shout' },
      { event: 'spawnProjectile', sfx: GUN, projectile: { ...BULLET, damage: 8, speed: 7, angle: -60, offsetX: 14, offsetY: 30, maxDist: 0, life: 60 }, ease: 'out' }),
    F(12, { armR: [72, -62], weapon: -20, armL: [38, -6], torso: 12, head: 6, legR: [40, -70], legL: [10, -40], face: 'grit' }, { ease: 'inout' }),
  ] },
  // ---- baseball slide: 3f crouch, 10f slide on the hip (60 px, hurtbox 45 %: passes under projectiles), trips low ----
  dashAttack: { loop: false, frames: [
    G(3, { ...GUARD, armR: [-30, -60], weapon: 30, armL: [-50, 20], torso: 28, head: -8, root: [-2, 0], squash: 1.08, stretch: 0.92, legR: [40, 30], legL: [-30, 30], face: 'angry' }, { sfx: 'dodge', ease: 'in' }),
    F(10, { armR: [-50, -50], weapon: 60, armL: [-70, 30], torso: 12, head: -10, root: [18, 15, -50], legR: [40, 0], legL: [30, 10], footR: 20, footL: 20, face: 'shout' },
      { hitbox: frontBox(40, hit(12, 'knockdown', 4, 3, 20), { low: true }), move: { x: 6 }, hurtboxScale: 0.45, fx: [{ kind: 'dust', x: -14, y: 0, count: 6 }], ease: 'linear' }),
    G(8, { armR: [-20, -60], weapon: 20, armL: [-60, 30], torso: 30, head: -6, root: [4, 0], legR: [50, 20], legL: [-20, 50], face: 'grit', squash: 1.04, stretch: 0.96 }, { cancel: 'attack', ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0 }] }),
    G(4, { ...GUARD, torso: 8 }, { cancel: 'any', ease: 'out' }),
  ] },

  // ---- Fan the Hammer: crouched stance, cutlass out behind for balance, 5 shots fanned across the lanes (3f each) ----
  special: { loop: false, frames: [
    G(3, { armR: [-20, -20], weapon: 0, armL: [40, 40], torso: -4, head: -2, root: [-2, 0], legR: [14, 2], legL: [-16, 10], face: 'angry' }, { sfx: 'revolver_fan', ease: 'in' }),
    G(3, { armR: [-40, -30], weapon: 20, armL: [70, 20], torso: 6, head: 0, root: [-3, 0], squash: 1.06, stretch: 0.94, legR: [24, -10], legL: [-24, 20], face: 'grit' }, { ease: 'out' }),
    shotFrame(0, -1.2), shotFrame(1, -0.6), shotFrame(2, 0), shotFrame(3, 0.6), shotFrame(4, 1.2),
    G(8, { armR: [-36, -30], weapon: 20, armL: [90, 4], torso: 6, head: -2, root: [-2, 0], legR: [24, -10], legL: [-26, 22], face: 'angry' }, { ease: 'inout', fx: [{ kind: 'steam', x: 34, y: 54, count: 3 }] }),
    G(4, { ...GUARD, torso: 6 }, { cancel: 'any', ease: 'out' }),
  ] },
  // ---- Broadside: cutlass thrust at the sky, the Stubborn Kettle crosses the far layer (hooks.drawBefore) and drops 6 cannonballs ----
  super: { loop: false, frames: [
    G(6, { armR: [-30, -110], weapon: -30, armL: [40, 40], torso: 12, head: 4, root: [-2, 0], squash: 1.08, stretch: 0.92, legR: [26, 10], legL: [-24, 20], face: 'angry' }, { sfx: 'super_rook', ease: 'in' }),
    G(6, { armR: [170, -10], weapon: -20, armL: [90, 0], torso: -8, head: -14, root: [0, 0], squash: 0.96, stretch: 1.05, legR: [22, 4], legL: [-22, 10], face: 'shout' },
      { smear: { from: -200, to: -90, a: 0.45 }, fx: [{ kind: 'ring', x: 0, y: 40, r0: 6, r1: 50, color: HOT }], ease: 'overshoot' }),
    cannonball(0), cannonball(1), cannonball(2), cannonball(3), cannonball(4), cannonball(5),
    G(8, { armR: [150, -20], weapon: -10, armL: [60, 20], torso: -2, head: -8, root: [0, 1], legR: [20, 4], legL: [-20, 10], face: 'happy' }, { ease: 'inout' }),
    G(4, { ...GUARD, torso: 6 }, { ease: 'out' }),
  ] },

  // dodge: 20f roll around the body centre (c = (0, -38)) + 8f recovery; frames 1-6 parry an enemy melee attack (traits.parry)
  dodge: { loop: false, frames: [
    G(4, { ...GUARD, armR: [40, -60], weapon: -70, torso: 30, root: [0, 2], legR: [40, 40], legL: [-20, 40], face: 'grit', squash: 1.08, stretch: 0.92 }, { sfx: 'dodge', ease: 'in' }),
    F(5, { torso: 40, head: 24, root: [-25, -50, 120], legR: [110, 90], legL: [90, 110], armR: [90, -110], weapon: -20, armL: [70, 70], face: 'closed' }),
    F(5, { torso: 40, head: 24, root: [34, -50, 240], legR: [110, 90], legL: [90, 110], armR: [90, -110], weapon: -20, armL: [70, 70], face: 'closed' }),
    F(5, { torso: 36, head: 10, root: [8, -6, 360], legR: [60, 40], legL: [30, 40], armR: [60, -100], weapon: -60, armL: [50, 60], face: 'closed' }, { ease: 'out' }),
    G(6, { ...GUARD, torso: 10, root: [0, 1, 360], legR: [22, 10], legL: [-16, 14], squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
  ] },
  // parry (traits.parry): the roll cancels into a blade-up block, sparks, then back to guard
  parry: { loop: false, frames: [
    G(3, { armR: [60, -60], weapon: -165, armL: [-40, 40], torso: 6, head: -4, root: [-2, 0], legR: [24, 4], legL: [-24, 18], face: 'grit', squash: 1.06, stretch: 0.94 },
      { fx: [{ kind: 'ring', x: 22, y: 50, r0: 2, r1: 30, color: WHITE }], ease: 'out' }),
    G(5, { armR: [64, -62], weapon: -167, armL: [-44, 40], torso: 2, head: -6, root: [-3, 0], legR: [24, 4], legL: [-24, 18], face: 'angry' }, { ease: 'inout' }),
    G(4, { ...GUARD, torso: 6, face: 'angry' }, { ease: 'out' }),
  ] },
  // taunt: tips the tricorne with the revolver hand, then spins the revolver (rig.spin) with a grin; meter on the last key
  taunt: { loop: false, frames: [
    G(8, { ...CARRY, armL: [150, 0], torso: -4, head: -8, face: 'neutral' }, { ease: 'out' }),
    G(10, { ...CARRY, armL: [156, -6], torso: -6, head: -14, root: [0, 1], face: 'happy' }, { ease: 'inout' }),
    G(8, { ...CARRY, armL: [60, 40], torso: 2, head: -2, face: 'happy' }, { event: 'spin', spin: 30, sfx: 'chime', ease: 'out' }),
    G(14, { ...CARRY, armL: [64, 44], torso: 4, head: 0, root: [0, 1], face: 'happy' }, { ease: 'inout' }),
    G(14, { ...CARRY, armL: [-30, -16], torso: 2, head: -4, face: 'happy' }, { event: 'meterGain', ease: 'inout' }),
  ] },

  // ---- grabs / throws ----
  grab: { loop: false, frames: [
    G(4, { ...GUARD, armL: [30, 30], torso: 6, face: 'angry' }, { ease: 'in' }),
    G(4, { armR: [30, 70], weapon: -50, armL: [84, 10], torso: 16, root: [3, 0], legR: [28, 6], legL: [-22, 14], face: 'angry' },
      { hitbox: { x: 4, y: -60, w: 36, h: 56, z: 20, type: 'grab', once: true, damage: 0 }, sfx: 'hit_grab', ease: 'out' }),
  ] },
  grabHold: { loop: true, frames: [
    G(16, { armR: [30, 70], weapon: -50, armL: [84, 10], torso: 12, legR: [24, 4], legL: [-20, 12], face: 'angry' }, { ease: 'inout' }),
    G(16, { armR: [32, 72], weapon: -52, armL: [86, 12], torso: 14, root: [0, 1], legR: [24, 4], legL: [-20, 12], face: 'angry' }, { ease: 'inout' }),
  ] },
  // hold hit: pommel strike to the face (3 x 6, then the boot kick throw)
  grabHit: { loop: false, frames: [
    G(4, { armR: [-20, 100], weapon: -80, armL: [84, 10], torso: -6, head: -8, root: [-2, 0], legR: [22, 4], legL: [-20, 12], face: 'angry' }, { ease: 'in' }),
    G(4, { armR: [56, 34], weapon: -86, armL: [84, 10], torso: 24, head: 10, root: [5, 0], legR: [30, 8], legL: [-24, 16], face: 'shout' }, { sfx: 'hit_medium', fx: [{ kind: 'ring', x: 34, y: 50, r0: 2, r1: 16, color: HOT }], ease: 'overshoot' }),
    G(6, { armR: [30, 70], weapon: -50, armL: [84, 10], torso: 12, legR: [24, 4], legL: [-20, 12], face: 'angry' }, { ease: 'out' }),
  ] },
  // forward throw: boot kick — lets go and plants the near boot in the enemy's chest
  throw: { loop: false, frames: [
    G(5, { armR: [40, 40], weapon: -60, armL: [70, 10], torso: 20, head: 6, root: [-2, 0], squash: 1.08, stretch: 0.92, legR: [-30, 60], legL: [-20, 30], face: 'angry' }, { ease: 'in' }),
    G(6, { armR: [-60, -30], weapon: 0, armL: [-80, -20], torso: -16, head: -6, root: [4, 0], squash: 0.96, stretch: 1.04, legR: [92, -4], legL: [-20, 14], footR: 20, face: 'shout' },
      { sfx: 'throw', fx: [{ kind: 'ring', x: 30, y: 44, r0: 2, r1: 26, color: HOT }, { kind: 'dust', x: 10, y: 0 }], ease: 'overshoot' }),
    G(8, { armR: [-50, -30], weapon: 0, armL: [-70, -20], torso: -10, head: -4, root: [4, 0], legR: [80, -6], legL: [-20, 14], face: 'grit' }, { ease: 'out' }),
    G(5, { ...GUARD, torso: 10, root: [2, 0], squash: 1.04, stretch: 0.96, legR: [26, 10], legL: [-20, 16] }, { ease: 'out' }),
  ] },
  // back throw: hip toss — hoists the enemy over the hip and slams it down behind him (it bounces: moves.throwBack.bounce)
  throwBack: { loop: false, frames: [
    G(5, { armR: [70, 30], weapon: -100, armL: [80, 20], torso: 24, head: 6, root: [-2, 0], squash: 1.1, stretch: 0.9, legR: [30, -10], legL: [-26, 26], face: 'angry' }, { ease: 'in' }),
    G(6, { armR: [-120, -20], weapon: -60, armL: [-130, -20], torso: -34, head: -10, root: [-6, 0], squash: 0.94, stretch: 1.06, legR: [-20, 30], legL: [30, 20], face: 'shout' },
      { sfx: 'throw', smear: { from: 20, to: -200, a: 0.4 }, ease: 'overshoot' }),
    G(8, { armR: [-140, -10], weapon: -50, armL: [-150, -10], torso: -40, head: -6, root: [-8, 0], legR: [-24, 34], legL: [34, 22], face: 'grit' }, { ease: 'out', fx: [{ kind: 'dust', x: -40, y: 0, count: 6 }] }),
    G(5, { ...GUARD, torso: 6, root: [0, 0], squash: 1.04, stretch: 0.96 }, { ease: 'out' }),
  ] },

  // ---- damage / defeat ----
  hurt: { loop: false, frames: [
    G(4, { ...CARRY, torso: -26, head: -24, armL: [-70, -30], armR: [36, -10], weapon: -80, root: [-5, 0], legR: [24, 2], legL: [-14, 12], face: 'hurt' }, { ease: 'out' }),
    G(10, { ...CARRY, torso: -12, head: -10, armL: [-36, -12], armR: [26, -6], weapon: -66, root: [-2, 0], legR: [14, 2], legL: [-10, 8], face: 'hurt' }, { ease: 'out' }),
    G(6, { ...CARRY, torso: 0, face: 'angry' }, { ease: 'out' }),
  ] },
  stagger: { loop: false, frames: [
    G(4, { ...CARRY, torso: -30, head: -26, armL: [-80, -30], armR: [50, -20], weapon: -90, root: [-6, 0], legR: [26, 4], legL: [-16, 14], face: 'hurt' }, { ease: 'out' }),
    G(10, { ...CARRY, torso: 14, head: 10, armL: [-40, -20], armR: [30, -10], weapon: -70, root: [-2, 1], legR: [20, 8], legL: [-12, 10], face: 'dazed' }, { ease: 'inout' }),
    G(10, { ...CARRY, torso: -14, head: -12, armL: [-60, -30], armR: [40, -16], weapon: -80, root: [-4, 0], legR: [22, 4], legL: [-14, 12], face: 'dazed' }, { ease: 'inout' }),
    G(8, { ...CARRY, torso: 6, head: 4, root: [-1, 1], face: 'dazed' }, { ease: 'inout' }),
    G(6, { ...CARRY, torso: 0, face: 'angry' }, { ease: 'out' }),
  ] },
  hurtAir: { loop: true, frames: [
    F(6, { armR: [-100, -40], weapon: 30, armL: [-110, -30], torso: -30, head: -25, legR: [40, 40], legL: [10, 60], root: [0, 0, -15], face: 'hurt' }, { ease: 'inout' }),
    F(6, { armR: [-110, -50], weapon: 40, armL: [-120, -30], torso: -35, head: -30, legR: [50, 30], legL: [20, 50], root: [0, 0, -25], face: 'hurt' }, { ease: 'inout' }),
  ] },
  knockdown: { loop: true, frames: [
    F(8, { armR: [-60, -40], weapon: 30, armL: [-80, -30], torso: -50, head: -20, legR: [50, 30], legL: [30, 50], root: [0, -6, -25], face: 'hurt' }, { ease: 'inout' }),
    F(8, { armR: [-70, -50], weapon: 40, armL: [-90, -30], torso: -55, head: -25, legR: [60, 20], legL: [40, 40], root: [0, -6, -35], face: 'hurt' }, { ease: 'inout' }),
  ] },
  lying: { loop: true, frames: [
    F(16, { ...FLOORED }, { ease: 'inout' }),
    F(16, { ...FLOORED, torso: 6, head: -12 }, { ease: 'inout' }),
  ] },
  getup: { loop: false, frames: [
    F(8, { ...FLOORED }, { ease: 'in' }),
    G(8, { armR: [60, 40], weapon: 20, armL: [-30, 40], torso: 30, head: -10, legR: [70, 60], legL: [-20, 60], root: [8, 0, -20], face: 'grit', squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
    G(6, { ...CARRY, torso: 8, legR: [16, 20], legL: [-10, 16], face: 'angry' }, { ease: 'out' }),
  ] },
  dead: { loop: false, frames: [
    F(60, { ...FLOORED, torso: 8, head: -14, legR: [6, 4], legL: [-6, 6], root: [32, -9, -90] }),
  ] },
  // win: a sword salute to the Stubborn Kettle as it crosses the sky (hooks.drawBefore), heels together, revolver hand behind the back
  win: { loop: true, frames: [
    G(6, { armR: [40, 20], weapon: -80, armL: [-40, -20], torso: 4, head: 2, root: [0, 2], squash: 1.06, stretch: 0.94, legR: [12, 6], legL: [-12, 8], face: 'neutral' }, { ease: 'in' }),
    G(8, { armR: [100, -110], weapon: -185, armL: [-50, -70], torso: -4, head: -10, root: [0, -2], squash: 0.98, stretch: 1.02, legR: [6, 0], legL: [-6, 2], face: 'happy' }, { ease: 'overshoot', sfx: SW }),
    G(26, { armR: [102, -112], weapon: -187, armL: [-52, -72], torso: -5, head: -12, root: [0, 0], legR: [6, 0], legL: [-6, 2], face: 'happy' }, { ease: 'inout' }),
    G(26, { armR: [98, -108], weapon: -183, armL: [-50, -70], torso: -3, head: -9, root: [0, 1], legR: [6, 0], legL: [-6, 2], face: 'happy' }, { ease: 'inout' }),
    G(30, { armR: [100, -110], weapon: -185, armL: [-52, -72], torso: -5, head: -12, root: [0, 0], legR: [6, 0], legL: [-6, 2], face: 'happy' }, { ease: 'inout' }),
  ] },
};

// ---------------------------------------------------------------------------------------------------------------
// Hooks: revolver spin, the Stubborn Kettle fly-by (Broadside + victory salute)
// ---------------------------------------------------------------------------------------------------------------
/** The Stubborn Kettle: dented leather gasbag, copper kettle gondola with a spout, rigging, a spinning prop (screen space). */
function drawShip(ctx, x, y, facing, t, alpha) {
  const ol = '#1E1A22';
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(R(x), R(y)); ctx.scale(facing, 1);
  // rigging under the bag, then the kettle gondola
  line(ctx, -18, 10, -12, 22, ol, 1); line(ctx, 18, 10, 12, 22, ol, 1);
  rrect(ctx, -16, 20, 32, 12, 4, KETTLE, ol, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-13, 22, 22, 2);
  pathPoly(ctx, [16, 24, 26, 18, 24, 28]); paint(ctx, KETTLE, ol, 1);           // spout
  ctx.strokeStyle = ol; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 20, 7, Math.PI, 0); ctx.stroke(); // handle
  circle(ctx, -4, 33, 3, HOT, null, 0); circle(ctx, 4, 33, 2, '#FF7A1F', null, 0); // burner glow
  // gasbag with a cream stripe and a patch, prop at the stern
  pathPoly(ctx, [-34, 0, -30, -8, 0, -12, 30, -8, 36, 0, 30, 8, 0, 12, -30, 8]); paint(ctx, BALLOON, ol, 1);
  ctx.fillStyle = SAIL; ctx.fillRect(-26, -2, 56, 4);
  ctx.fillStyle = ol; ctx.fillRect(10, -9, 8, 5); ctx.fillStyle = '#8C6A4A'; ctx.fillRect(11, -8, 6, 3);
  ctx.save(); ctx.translate(-36, 0); ctx.rotate(t * 0.9); ctx.fillStyle = '#9AA0AE'; ctx.fillRect(-1, -8, 2, 16); ctx.fillRect(-8, -1, 16, 2); ctx.restore();
  ctx.restore();
}
const hooks = {
  onSpawn(f) { f.rig.spin = 0; f.rookShip = -1; f.rookShipMode = 0; f.rookSaluted = false; },
  onUpdate(f) {
    if (f.rig.spin > 0) f.rig.spin--;
    if (f.rookShip >= 0 && ++f.rookShip > (f.rookShipMode ? 420 : 130)) f.rookShip = -1;
    if (f.victory && f.anim.name === 'win' && !f.rookSaluted) { f.rookSaluted = true; f.rookShip = 0; f.rookShipMode = 1; }
  },
  onStateEnter(f, state) { if (state === ST.SUPER) { f.rookShip = 0; f.rookShipMode = 0; } },
  onAnimEvent(f, name, frame) { if (name === 'spin') { f.rig.spin = (frame && frame.spin) || 30; return true; } return false; },
  /** Broadside: the ship crosses the far layer at 40 px per cannonball (6f), above the drop points; victory: a slow fly-past. */
  drawBefore(ctx, f, sx, sy, cam) {
    const t = f.rookShip;
    if (t < 0) return;
    const off = f.rookShipMode ? -220 + t * 1.6 : t * (40 / 6) - 50;
    const y = (f.rookShipMode ? 64 : 58) + Math.sin(t * 0.08) * 3;
    const fade = f.rookShipMode ? Math.min(1, t / 30, (420 - t) / 40) : Math.min(1, t / 8, (130 - t) / 20);
    drawShip(ctx, sx + f.facing * off, y, f.facing, t, Math.max(0, fade));
  },
};

/** Captain Rook Halloway character definition. */
export const rook = {
  id: 'rook', name: 'ROOK', fullName: 'Captain Rook Halloway', title: 'THE CAPTAIN', archetype: 'BALANCED',
  stats: { power: 3, speed: 3, health: 3, range: 4, technique: 3 },
  maxHp: hpFor(3), walkSpeed: speedFor(3), runSpeed: speedFor(3) * 1.7, jumpVy: JUMP_VY, reach: 40, grabReach: 20, grabOffset: 24,
  freeChain: true,
  // Parry (GDD 2.3): an enemy melee attack that would connect during frames 1-6 of the roll is parried instead (enemy stunned 40f,
  // +15 meter, 8f hit-stop); a mistimed press is still a full roll
  // Bulwark (GDD 2.3 / 7 shields): the middle of the cast in every number — 22 points, 18/s after 1.7 s — the
  // baseline the other three are read against, and one more thing a well-timed parry keeps intact.
  traits: { parry: { frames: 6, stun: 40, meter: 15, hitstop: 8 }, grabReach: 20,
    shield: { name: 'BULWARK', max: 22, regen: 0.3, delay: 100, breakDelay: 200 } },
  build,
  anims,
  hooks,
  moves: {
    special: { name: 'FAN THE HAMMER', cost: METER.special }, super: { name: 'BROADSIDE', cost: METER.super, damage: 150 },
    // forward: boot kick released as the boot lands (frame 6); back: hip toss dropped ~90 px behind (vx 4 / vy 5.5) and bounced once
    throwFwd: { damage: 12, vx: 9, vy: 4, releaseAt: 6 }, throwBack: { damage: 12, vx: 4, vy: 5.5, releaseAt: 7, bounce: true }, grabHit: { damage: 6, hits: 3 },
  },
  sfx: { special: 'special_rook', super: 'super_rook', swing: 'whiff' },
  portrait,
};
