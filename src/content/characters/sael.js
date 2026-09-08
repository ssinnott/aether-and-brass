// Sael Windwright — Speed (GDD 2.2). High-elf sky-courier: tall, thin, long legs, electro-rapier, aviator cap with goggles,
// white ponytail (3-segment chain), trailing red scarf (chain), jet boots (flame on jump / dash / kick), letter satchel.
// Hand-authored cel-shaded rig + full animation set. Numbers (damage, timings, hitboxes) follow the GDD.
//
// Readability (docs/ART_STYLE.md section 0): light warm skin / near-white hair / cool light sleeves / mid-dark teal coat /
// slate trousers / near-black boots with a light steel toe and brass nozzle / light steel blade on a leather grip. Ground
// keys are authored with G(): the pose is grounded automatically (root.y solved so the lowest boot sole sits on the floor),
// so long-legged stances never float; root[1] in a G() spec is an EXTRA sink (breathing / squash), not an absolute offset.
import { speedFor, hpFor, areaBox, frontBox, P, F, hit } from './common.js';
import { METER, FLOOR_TOP, ST } from '../../constants.js';
import { celBall, celPoly, tones, flat } from '../../art/shading.js';
import { drawSkull, drawBoot, drawBelt } from '../../art/rigParts.js';
import { getChain } from '../../art/secondary.js';
import { buildRig, computeJoints, drawRig } from '../../art/rig.js';
import { makePose } from '../../art/poses.js';
import { drawHeadPortrait } from '../../art/portraits.js';
import { farShade } from '../../art/palettes.js';
import { rad } from '../../engine/math.js';

// skin: light warm  hair: near-white  primary: teal coat  sleeve: cool light shirt  secondary: slate trousers
// accent: brass trim  metal: light steel blade  dark: near-black boots  glow: electro-arc
// Saturation pass: teal is her whole identity and it was carrying almost none of it. Hue and Oklab lightness are held
// and only CHROMA moves - coat #2F6F8F -> #1D698F (s 67 -> 80, L* 51.4 -> 49.4) and shirt #A9C8D6 -> #78B9D6
// (s 21 -> 44, L* 81.4 -> 75.3), so the coat is still the same teal and the sleeve still the light de-blobbing mass.
// Two consequences were then forced by measurement rather than taste:
//   trousers #4A5A72 -> #384860, because a darker coat left the two masses at the same luma (palette/value-ladder
//     -adjacent primary/secondary fell to 0.015 against the hero baseline 0.059); at L* 39.8 they are also the dark
//     anchor the section floor bands never occupy, and they are still a near-neutral slate (C 4.6).
//   boots #1C2A33 -> #1A3746, because at Oklab L* 27.6 they sat 5.0 L* off the #1E1A22 outline: the line was drawn
//     round the boot and then swallowed by it. #1A3746 clears the ink by 9.5 L* and is still a near-black boot.
// LEATHER #6B4A2E -> #6B5542: a strap is a NEUTRAL and had no business carrying 57 % saturation next to a 21 % shirt.
const PAL = { skin: '#F5E0C8', hair: '#EAF2F7', primary: '#1D698F', sleeve: '#78B9D6', secondary: '#384860', accent: '#D9B45B', metal: '#D8DCE0', dark: '#1A3746', glow: '#8FE3FF' };
const LEATHER = '#6B5542', GLOVE = '#7A4E2E', GLOVE_FAR = farShade(GLOVE, 0.62, 0.25), LENS = '#9BC1E8', SCARF = '#C74E4E', ARC = '#8FE3FF', WHITE = '#FFFFFF', BROW = '#8A9AA8';
const R = Math.round, TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------------------
// Rig parts
// ---------------------------------------------------------------------------------------------------------------
/** Electro-rapier (hand space, +x along the blade): leather grip, brass pommel + round guard, 37px steel blade, arcing tip. */
function drawRapier(ctx, rig) {
  ctx.beginPath(); ctx.rect(-7, -2, 10, 4); flat(ctx, rig, LEATHER);
  celPoly(ctx, rig, [6, -2, 40, -1, 44, 0, 40, 1, 6, 2], PAL.metal, 0.4, 0.3);
  celBall(ctx, rig, 3, 0, 3.5, PAL.accent, false);
  if (rig.override) return;
  ctx.fillStyle = rig.col(PAL.accent); ctx.fillRect(-8, -2, 3, 4);
  ctx.fillStyle = tones(rig, PAL.metal).sh; ctx.fillRect(9, 0, 28, 1);
  // electro-arc: flickers along the last third of the blade (rig.tick), bigger while charged (special / super)
  const k = rig.tick % 4, big = rig.charge > 0;
  ctx.fillStyle = rig.col(ARC);
  ctx.fillRect(30 + k * 2, k & 1 ? -3 : 2, 4, 2); ctx.fillRect(36 - k, k & 1 ? 2 : -3, 3, 2);
  if (big) { ctx.fillRect(12 + k * 3, -4, 5, 2); ctx.fillRect(20 - k, 3, 6, 2); ctx.fillRect(26, k & 2 ? -5 : 4, 3, 3); }
  ctx.fillStyle = rig.col(WHITE); ctx.fillRect(41, -1, 3, 2);
}
/** One chain segment along +x (two tones, no clip): outlined flat quad + a 1 px shadow along its lower edge. */
function segment(ctx, rig, L, w0, w1, hex, tip) {
  ctx.beginPath(); ctx.moveTo(0, -w0 * 0.5); ctx.lineTo(L, -w1 * 0.5); ctx.lineTo(L + (tip ? 3 : 0), tip ? 1 : 0); ctx.lineTo(L, w1 * 0.5); ctx.lineTo(0, w0 * 0.5); ctx.closePath();
  flat(ctx, rig, hex);
  if (!rig.override) { ctx.fillStyle = tones(rig, hex).sh; ctx.fillRect(1, R(w0 * 0.5) - 2, L - 2, 2); }
}
/** Head: ponytail chain (behind), skull, white fringe + nape, leather aviator cap with ear flap, elf ear, goggles on the cap. */
function drawHead(ctx, rig, pose, inf) {
  const r = inf.r;
  // ponytail: 3 lagging clumps hanging back/down from the nape (ART_STYLE 7: rest [-1, 0.3], gain 2.5)
  const ch = getChain(rig, 'tail', 3, { joint: 'head', rest: [-0.7, 0.75], stiffness: 0.12, damping: 0.7, gain: 2.5, rotGain: 0.6, maxAng: 48 });
  ctx.save(); ctx.translate(R(-r * 0.85), R(r * 0.05)); ctx.rotate(Math.atan2(0.75, -0.7));
  for (let i = 0; i < 3; i++) {
    ctx.rotate(rad(ch.ang[i]));
    const w0 = 7 - i, w1 = 6 - i, L = 10 - i;
    segment(ctx, rig, L, w0, w1, PAL.hair, i === 2);
    if (i === 0 && !rig.override) { ctx.fillStyle = rig.col(PAL.accent); ctx.fillRect(1, -3, 3, 7); }
    ctx.translate(L - 1, 0);
  }
  ctx.restore();
  drawSkull(ctx, rig, r, PAL.skin, null, { jaw: 0.4 });
  // hair: fringe under the cap brim + nape mass over the tail root
  ctx.beginPath(); ctx.moveTo(R(r * 0.95), R(-r * 0.62)); ctx.lineTo(R(r * 0.3), R(-r * 0.75)); ctx.lineTo(R(-r * 0.2), R(-r * 0.68)); ctx.lineTo(R(-r * 0.1), R(-r * 0.4));
  ctx.lineTo(R(r * 0.55), R(-r * 0.35)); ctx.lineTo(R(r * 0.95), R(-r * 0.45)); ctx.closePath(); flat(ctx, rig, PAL.hair);
  // aviator cap: one leather shape over the top of the skull with a flap down the back of the jaw
  celPoly(ctx, rig, [R(r * 1.0), R(-r * 0.62), R(r * 0.7), R(-r * 0.95), R(r * 0.1), R(-r * 1.12), R(-r * 0.55), R(-r * 1.05), R(-r * 1.02), R(-r * 0.6), R(-r * 1.08), R(r * 0.2), R(-r * 0.95), R(r * 0.72), R(-r * 0.55), R(r * 0.7), R(-r * 0.5), R(-r * 0.35), R(r * 0.2), R(-r * 0.62)], LEATHER, 0.36, 0.28);
  // elf ear: one pointed wedge sticking out of the flap, pointing back-up
  ctx.beginPath(); ctx.moveTo(R(-r * 0.5), R(r * 0.05)); ctx.lineTo(R(-r * 1.4), R(-r * 0.4)); ctx.lineTo(R(-r * 0.55), R(r * 0.45)); ctx.closePath();
  flat(ctx, rig, PAL.skin);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, PAL.skin).sh; ctx.fillRect(R(-r * 0.95), R(-r * 0.05), 4, 2);
  ctx.fillStyle = tones(rig, LEATHER).deep; ctx.fillRect(R(-r * 0.4), R(-r * 0.58), R(r * 1.3), 1);
}
/** Goggles on the cap front, 2 px clear of the brows (head accessory). */
function drawGoggles(ctx, rig) {
  const r = rig.p.headR, cy = R(-r * 1.15);
  if (!rig.override) { ctx.fillStyle = rig.col(tones(rig, LEATHER).sh); ctx.fillRect(R(-r * 0.9), cy - 1, R(r * 1.8), 3); }
  for (let i = 0; i < 2; i++) {
    const cx = i ? R(r * 0.55) : R(-r * 0.15);
    celBall(ctx, rig, cx, cy, 4, PAL.accent, false);
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TAU); ctx.fillStyle = rig.col(LENS); ctx.fill();
    if (!rig.override) { ctx.fillStyle = rig.col(WHITE); ctx.fillRect(cx - 2, cy - 2, 2, 1); }
  }
}
/** Teal courier coat: slim shaped body, light shirt V at the collar, satchel strap across the chest, two brass buttons, wing badge. */
function drawTorso(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2);
  celPoly(ctx, rig, [-hw - 1, -H + 4, -hw + 3, -H, hw - 3, -H, hw + 1, -H + 4, hw, R(-H * 0.5), hw - 2, 3, -hw + 2, 3, -hw, R(-H * 0.5)], PAL.primary, 0.36, 0.28);
  ctx.beginPath(); ctx.moveTo(-4, -H + 1); ctx.lineTo(4, -H + 1); ctx.lineTo(1, -H + 8); ctx.lineTo(-1, -H + 8); ctx.closePath(); flat(ctx, rig, PAL.sleeve);
  ctx.beginPath(); ctx.moveTo(hw - 3, -H + 2); ctx.lineTo(hw, -H + 4); ctx.lineTo(-hw + 4, 2); ctx.lineTo(-hw + 1, 0); ctx.closePath(); flat(ctx, rig, LEATHER);
  if (rig.override) return;
  ctx.fillStyle = rig.col(PAL.accent); ctx.fillRect(2, -H + 9, 3, 3); ctx.fillRect(2, -H + 15, 3, 3);
  ctx.fillRect(-7, -H + 8, 5, 2); ctx.fillRect(-6, -H + 10, 3, 1);
  ctx.fillStyle = tones(rig, PAL.primary).sh; ctx.fillRect(-hw + 2, R(-H * 0.5), W - 4, 1);
}
/** Belt over slate trousers with a brass buckle and a short coat skirt flaring behind the hip. */
function drawHips(ctx, rig, pose, inf) {
  ctx.beginPath(); ctx.moveTo(-inf.w / 2 - 1, -4); ctx.lineTo(inf.w / 2 - 4, -4); ctx.lineTo(inf.w / 2 - 6, 5); ctx.lineTo(-inf.w / 2 - 5, 7); ctx.closePath(); flat(ctx, rig, PAL.primary);
  drawBelt(ctx, rig, inf.w, PAL.secondary, LEATHER, PAL.accent);
}
/** Jet boot: near-black tall boot (default) + light steel toe, brass heel nozzle and a blue flame while rig.jet > 0. */
function drawJetBoot(ctx, rig, pose, inf) {
  const heel = R(inf.w * 0.42), toe = R(inf.w * 0.62);
  drawBoot(ctx, rig, inf.w, inf.h, inf.pal.dark, inf.pal.accent);
  ctx.beginPath(); ctx.rect(-heel - 4, -2, 5, 5); flat(ctx, rig, inf.pal.accent);
  if (rig.override) return;
  ctx.fillStyle = rig.col(inf.pal.metal); ctx.fillRect(toe - 4, 0, 4, 3);
  ctx.fillStyle = tones(rig, inf.pal.accent).deep; ctx.fillRect(-heel - 4, -1, 2, 3);
  if (rig.jet > 0) {
    const L = 7 + (rig.tick % 3) * 3, a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * 0.85; ctx.fillStyle = rig.col(ARC);
    ctx.beginPath(); ctx.moveTo(-heel - 4, -3); ctx.lineTo(-heel - 4 - L, 0); ctx.lineTo(-heel - 4, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rig.col(WHITE);
    ctx.beginPath(); ctx.moveTo(-heel - 4, -1); ctx.lineTo(-heel - 4 - L * 0.5, 0); ctx.lineTo(-heel - 4, 2); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = a0;
  }
}
/** Leather courier gloves (hand space). Far hand pre-darkened (never draw the far fist as bright as the near one). */
function drawGlove(ctx, rig, pose, inf) {
  const g = inf.far ? GLOVE_FAR : GLOVE, r = inf.r;
  celBall(ctx, rig, R(r * 0.5), 0, r, g, false);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, g).hi; ctx.fillRect(R(r * 0.2), -r + 1, 3, 2);
  ctx.fillStyle = rig.col(inf.pal.accent); ctx.fillRect(R(-r * 0.6) - 1, -r + 1, 2, r * 2 - 2);
}
/** Red scarf: knot at the collar, 3-segment tail trailing back from the torso (torso space, front layer). */
function drawScarf(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), H = p.torsoH;
  const ch = getChain(rig, 'scarf', 3, { joint: 'torso', rest: [-0.8, 0.6], stiffness: 0.1, damping: 0.72, gain: 2.2, rotGain: 0.5, maxAng: 50 });
  ctx.save(); ctx.translate(-hw + 1, -H + 3); ctx.rotate(Math.atan2(0.6, -0.8));
  for (let i = 0; i < 3; i++) { ctx.rotate(rad(ch.ang[i])); segment(ctx, rig, 9, 7 - i, 6 - i, SCARF, i === 2); ctx.translate(8, 0); }
  ctx.restore();
  ctx.beginPath(); ctx.rect(-hw - 1, -H - 2, p.torsoW + 2, 6); flat(ctx, rig, SCARF);
  if (!rig.override) { ctx.fillStyle = tones(rig, SCARF).sh; ctx.fillRect(-hw, -H + 2, p.torsoW, 2); }
}
/** Letter satchel on the far hip (hip space, back layer): leather bag, flap, brass buckle, two letters poking out. */
function drawSatchel(ctx, rig) {
  const x0 = -rig.p.hip / 2 - 12, y0 = -7;
  ctx.beginPath(); ctx.rect(x0, y0, 11, 10); flat(ctx, rig, LEATHER);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, LEATHER).sh; ctx.fillRect(x0 + 1, y0 + 6, 9, 3);
  ctx.fillStyle = rig.col(PAL.hair); ctx.fillRect(x0 + 2, y0 - 3, 3, 4); ctx.fillRect(x0 + 6, y0 - 2, 3, 3);
  ctx.fillStyle = tones(rig, LEATHER).hi; ctx.fillRect(x0 + 1, y0 + 1, 9, 3);
  ctx.fillStyle = rig.col(PAL.accent); ctx.fillRect(x0 + 4, y0 + 4, 3, 3);
}

const build = {
  scale: 1, palette: PAL, outline: '#1E1A22', outlineWidth: 1, smearColor: '#BFEFFF', farShade: 0.62, farDesat: 0.25,
  face: { brow: BROW, big: true },
  // 81 px tall, ~4 heads: long legs (17 + 17), slim 17 px torso, thin limbs, big 19 px head so the goggles and face get their rows
  proportions: { headR: 9.5, neck: 3, torsoW: 17, torsoH: 24, hip: 14, upperArm: 14, lowerArm: 13, armR: 3.5, handR: 4.5, upperLeg: 17, lowerLeg: 17, legR: 4.5, footL: 11, footH: 5, shoulderX: 2, hipX: 3, bulge: 0.55, neckR: 3 },
  parts: { head: drawHead, torso: drawTorso, hips: drawHips, foot: drawJetBoot, hand: drawGlove },
  weapon: { attach: 'handR', length: 44, draw: drawRapier, headAt: 30 },
  accessories: [{ attach: 'head', draw: drawGoggles }, { attach: 'hip', layer: 'back', draw: drawSatchel }, { attach: 'torso', draw: drawScarf }],
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
/** Rest carry: rapier low at the side, tip forward-down (blade angle ~70 deg), free arm hanging back so both hands show. */
const CARRY = { armR: [18, -6], weapon: -58, armL: [-28, -18], legR: [10, 2], legL: [-10, 4] };
/** En garde: blade forward at chest height, rear arm raised behind (fencer's balance), knees soft. */
const GARDE = { armR: [62, -46], weapon: -70, armL: [-70, -60], legR: [18, -6], legL: [-14, 10] };
const SW = 'rapier', ARC_SFX = 'rapier_arc';
const SLASH = (x, y, radius, angle, sweep) => [{ kind: 'slash', x, y, radius, angle, sweep, color: ARC }];
/** Dive kick hit data (shared id = one hit per target across the hit + held frames); rebound on hit (GDD 2.2). */
const DIVE_HIT = { id: 'jumpAttack', x: -6, y: -50, w: 56, h: 78, z: 24, once: true, damage: 12, type: 'medium', kbX: 3, kbY: 0, hitstun: 20, onHit: 'rebound' };
/** Rapier dropped along the floor while lying (root rot -88: body-space +y runs toward the feet along the ground). */
const FLOORED = { armR: [-20, -6], weapon: -30, armL: [26, 18], torso: 4, head: -10, legR: [12, 6], legL: [-4, 8], root: [32, -9, -88], face: 'dazed' };
const thrustHit = hit(5, 'light', 1.5, 0, 14);

const anims = {
  idle: { loop: true, frames: [
    G(14, { ...CARRY, torso: 2, root: [0, 0] }, { ease: 'inout' }),
    G(14, { ...CARRY, torso: 4, head: 2, root: [0, 1], armR: [19, -7], weapon: -59, armL: [-26, -16] }, { ease: 'inout' }),
    G(12, { ...CARRY, torso: 3, head: 1, root: [0, 1], armR: [18, -6], weapon: -60 }, { ease: 'inout' }),
    G(14, { ...CARRY, torso: 1, head: -2, root: [0, 0], armR: [17, -5], weapon: -57, armL: [-30, -20] }, { ease: 'inout' }),
  ] },
  // walk: light, long stride; the rapier rides low in the near hand while the free arm swings biased back
  walk: { loop: true, frames: [
    G(4, { ...CARRY, legR: [30, 0], legL: [-24, 16], footR: -8, armL: [6, -8], torso: 5, armR: [22, -10], weapon: -62 }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [24, 8], legL: [-16, 30], armL: [0, -10], torso: 6, head: 2, armR: [24, -12], weapon: -64, squash: 1.03, stretch: 0.97 }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [8, 22], legL: [0, 12], armL: [-14, -14], torso: 4, armR: [20, -8], weapon: -62 }, { ease: 'inout' }),
    G(4, { ...CARRY, legR: [-12, 14], legL: [20, -4], footL: -6, armL: [-30, -18], torso: 3, head: -1, armR: [16, -4], weapon: -60 }, { ease: 'in' }),
    G(4, { ...CARRY, legR: [-24, 16], legL: [30, 0], footL: -8, armL: [-46, -20], torso: 5, armR: [18, -6], weapon: -62 }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [-16, 30], legL: [24, 8], armL: [-40, -20], torso: 6, head: 2, armR: [20, -8], weapon: -64, squash: 1.03, stretch: 0.97 }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [0, 12], legL: [8, 22], armL: [-26, -18], torso: 4, armR: [20, -8], weapon: -62 }, { ease: 'inout' }),
    G(4, { ...CARRY, legR: [20, -4], legL: [-12, 14], footR: -6, armL: [-10, -12], torso: 3, head: -1, armR: [20, -8], weapon: -60 }, { ease: 'in' }),
  ] },
  // run: 20 deg lean, blade held forward en garde, both feet off the floor on the pass keys
  run: { loop: true, frames: [
    G(3, { ...GARDE, legR: [54, 12], legL: [-42, 60], armL: [-60, -70], torso: 20, head: -4, face: 'angry' }, { ease: 'out' }),
    G(3, { ...GARDE, legR: [40, 30], legL: [-30, 74], armL: [-70, -60], torso: 22, head: -4, squash: 1.04, stretch: 0.96, face: 'angry' }, { ease: 'out' }),
    F(3, { ...GARDE, legR: [12, 40], legL: [10, 30], armL: [-80, -50], torso: 21, head: -3, root: [0, -4], face: 'angry' }, { ease: 'inout' }),
    F(3, { ...GARDE, legR: [-24, 54], legL: [42, 6], armL: [-70, -60], torso: 20, head: -4, root: [0, -3], face: 'angry' }, { ease: 'in' }),
    G(3, { ...GARDE, legR: [-42, 60], legL: [54, 12], armL: [-60, -70], torso: 20, head: -4, face: 'angry' }, { ease: 'out' }),
    G(3, { ...GARDE, legR: [-30, 74], legL: [40, 30], armL: [-70, -60], torso: 22, head: -4, squash: 1.04, stretch: 0.96, face: 'angry' }, { ease: 'out' }),
    F(3, { ...GARDE, legR: [10, 30], legL: [12, 40], armL: [-80, -50], torso: 21, head: -3, root: [0, -4], face: 'angry' }, { ease: 'inout' }),
    F(3, { ...GARDE, legR: [42, 6], legL: [-24, 54], armL: [-70, -60], torso: 20, head: -4, root: [0, -3], face: 'angry' }, { ease: 'in' }),
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

  // ---- ground combo (GDD 2.2): thrust -> thrust -> spinning slash (front + back) -> rising lunge (launcher, 20px up-forward) ----
  // anticipation (ease in, blade drawn back to the ribs) -> hit key (overshoot + smear + hitbox) -> hold (+4 deg) -> follow-through (cancel) -> return
  attack1: { loop: false, frames: [
    G(2, { armR: [12, -110], weapon: -176, armL: [-50, -40], torso: -8, head: -4, root: [-2, 0], legR: [16, -4], legL: [-16, 10], face: 'angry' }, { sfx: SW, ease: 'in' }),
    G(2, { armR: [8, -118], weapon: -180, armL: [-60, -50], torso: -12, head: -6, root: [-3, 0], legR: [14, -4], legL: [-20, 14], face: 'angry' }, { ease: 'out' }),
    // hit: full lunge, blade level at chest height, back leg straight, front knee bent
    G(2, { armR: [96, -4], weapon: 22, armL: [-100, -30], torso: 22, head: 4, root: [8, 0], legR: [48, -40], legL: [-36, 6], face: 'shout' },
      { hitbox: frontBox(38, thrustHit), smear: { from: -30, to: 8, a: 0.4, r: 62 }, fx: SLASH(30, 44, 22, 0, 40), ease: 'overshoot' }),
    G(2, { armR: [100, -4], weapon: 26, armL: [-104, -30], torso: 24, head: 4, root: [9, 0], legR: [48, -40], legL: [-36, 6], face: 'shout' }, { ease: 'out' }),
    G(6, { armR: [86, -10], weapon: 16, armL: [-90, -30], torso: 18, head: 2, root: [6, 0], legR: [40, -30], legL: [-30, 8], face: 'angry' }, { cancel: 'attack', ease: 'inout' }),
    G(4, { ...GARDE, torso: 10, root: [2, 0], face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack2: { loop: false, frames: [
    G(2, { armR: [60, -60], weapon: -80, armL: [-80, -40], torso: 6, head: -2, root: [0, 0], legR: [30, -20], legL: [-28, 10], face: 'angry' }, { sfx: SW, ease: 'in' }),
    G(2, { armR: [34, -120], weapon: -150, armL: [-90, -50], torso: -6, head: -6, root: [-2, 0], legR: [24, -16], legL: [-30, 12], face: 'angry' }, { ease: 'out' }),
    // hit: low thrust from a deep crouch, blade angled down at the belly
    G(2, { armR: [78, -10], weapon: -12, armL: [-110, -20], torso: 30, head: 6, root: [10, 0], legR: [56, -60], legL: [-44, 2], face: 'shout' },
      { hitbox: frontBox(38, { ...thrustHit, hitstun: 16 }), smear: { from: -10, to: 25, a: 0.4, r: 60 }, fx: SLASH(30, 36, 22, 8, 40), ease: 'overshoot' }),
    G(2, { armR: [82, -10], weapon: -8, armL: [-114, -20], torso: 32, head: 6, root: [11, 0], legR: [56, -60], legL: [-44, 2], face: 'shout' }, { ease: 'out' }),
    G(6, { armR: [70, -14], weapon: -20, armL: [-100, -20], torso: 24, head: 4, root: [8, 0], legR: [48, -50], legL: [-36, 4], face: 'angry' }, { cancel: 'attack', ease: 'inout' }),
    G(4, { ...GARDE, torso: 12, root: [2, 0], face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack3: { loop: false, frames: [
    G(3, { armR: [110, 10], weapon: 20, armL: [-60, -30], torso: 8, head: 6, root: [0, 0], legR: [20, -6], legL: [-16, 8], face: 'angry' }, { sfx: SW, ease: 'in' }),
    G(2, { armR: [130, 10], weapon: 30, armL: [-70, -30], torso: 12, head: 10, root: [2, 0], legR: [22, -8], legL: [-16, 8], face: 'angry' }, { ease: 'out' }),
    // hit: the blade whips from front to back through the low arc (smear 0 -> 180 via down); head turns to look behind
    G(3, { armR: [-74, -20], weapon: -14, armL: [80, 20], torso: -14, head: -22, root: [-2, 0], legR: [-6, 6], legL: [24, -10], face: 'shout' },
      { hitbox: frontBox(36, hit(8, 'light', 2, 0, 16), { behind: true }), smear: { from: 0, to: 180, a: 0.5, r: 64 }, sfx: ARC_SFX,
        fx: [{ kind: 'ring', x: 0, y: 40, r0: 6, r1: 42, color: ARC }], ease: 'overshoot' }),
    G(2, { armR: [-80, -20], weapon: -18, armL: [84, 20], torso: -16, head: -24, root: [-3, 0], legR: [-6, 6], legL: [24, -10], face: 'shout' }, { ease: 'out' }),
    G(8, { armR: [-50, -30], weapon: -30, armL: [50, 10], torso: -6, head: -10, root: [-1, 0], legR: [4, 4], legL: [10, 0], face: 'angry' }, { cancel: 'attack', ease: 'inout' }),
    G(4, { ...GARDE, torso: 8, face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack4: { loop: false, frames: [
    G(3, { armR: [-10, -60], weapon: -80, armL: [-40, -60], torso: 24, head: 4, root: [-2, 0], squash: 1.1, stretch: 0.9, legR: [40, -40], legL: [-30, 30], face: 'angry' }, { sfx: SW, ease: 'in' }),
    G(2, { armR: [-16, -70], weapon: -90, armL: [-50, -70], torso: 30, head: 6, root: [-3, 0], squash: 1.14, stretch: 0.86, legR: [44, -46], legL: [-34, 34], face: 'grit' }, { ease: 'out' }),
    // hit: rising lunge — the whole body launches up-forward on the jet boots, blade thrust at 45 deg through the high box
    F(5, { armR: [150, -10], weapon: 8, armL: [-110, -30], torso: -14, head: -10, root: [6, -16], squash: 0.92, stretch: 1.1, legR: [50, -20], legL: [-50, 10], face: 'shout' },
      { hitbox: frontBox(38, hit(10, 'launch', 2, 8, 20), { high: true }), move: { x: 4 }, event: 'jet', jet: 14, smear: { from: 40, to: -70, a: 0.5, r: 66 }, sfx: ARC_SFX,
        fx: [{ kind: 'ring', x: 24, y: 40, r0: 2, r1: 26, color: ARC }, { kind: 'steam', x: -12, y: 8, count: 3 }], ease: 'overshoot' }),
    F(3, { armR: [154, -10], weapon: 10, armL: [-114, -30], torso: -16, head: -12, root: [6, -18], squash: 0.94, stretch: 1.06, legR: [50, -20], legL: [-50, 10], face: 'shout' }, { ease: 'out' }),
    F(4, { armR: [130, -20], weapon: 0, armL: [-90, -30], torso: -6, head: -6, root: [4, -8], legR: [40, -10], legL: [-40, 16], face: 'angry' }, { cancel: 'any', ease: 'in' }),
    G(6, { ...GARDE, torso: 14, root: [2, 0], squash: 1.08, stretch: 0.92, legR: [30, -10], legL: [-24, 20], face: 'angry' }, { cancel: 'any', ease: 'out' }),
    G(4, { ...GARDE, torso: 8, root: [1, 0] }, { cancel: 'any', ease: 'out' }),
  ] },

  // ---- 45 deg dive kick (12): jet boot leads, blade trailing; rebounds 30px up on hit and she can act again ----
  jumpAttack: { loop: false, frames: [
    F(3, { armR: [-40, -60], weapon: -60, armL: [-80, -40], torso: -10, head: -6, legR: [70, -110], legL: [30, -60], face: 'angry' }, { sfx: SW, event: 'jet', jet: 26, ease: 'in' }),
    F(5, { armR: [-90, -20], weapon: -30, armL: [-110, -20], torso: 48, head: -12, legR: [96, -6], legL: [20, -70], footR: 20, face: 'shout', stretch: 1.06, squash: 0.96 },
      { hitbox: DIVE_HIT, move: { x: 3, vy: -4 }, fx: [{ kind: 'steam', x: -14, y: 30, count: 3 }], ease: 'overshoot' }),
    F(20, { armR: [-96, -20], weapon: -30, armL: [-116, -20], torso: 50, head: -14, legR: [100, -4], legL: [22, -74], footR: 22, face: 'grit' }, { hitbox: DIVE_HIT, move: { x: 3 } }),
  ] },
  // ---- Arc Dash: 60px jet dash straight through the crowd (i-frames 8f, 8 to everyone passed), cancellable into the combo ----
  dashAttack: { loop: false, frames: [
    G(2, { ...GARDE, armR: [30, -100], weapon: -160, torso: 30, head: -6, root: [-3, 0], squash: 1.08, stretch: 0.92, legR: [36, -30], legL: [-30, 30], face: 'angry' },
      { sfx: 'aether_step', invuln: true, event: 'jet', jet: 12, ease: 'in', fx: [{ kind: 'steam', x: -10, y: 10, count: 3 }] }),
    F(6, { armR: [100, -6], weapon: 30, armL: [-120, -30], torso: 54, head: -18, root: [4, -6], squash: 0.9, stretch: 1.08, legR: [40, -10], legL: [-60, 10], face: 'shout' },
      { hitbox: { ...areaBox(30, hit(8, 'light', 2, 0, 14)), id: 'arc' }, move: { x: 10 }, invuln: true, smear: { from: -14, to: 14, a: 0.35, r: 70 },
        fx: [{ kind: 'ring', x: 0, y: 40, r0: 2, r1: 34, color: ARC }] }),
    G(6, { armR: [90, -10], weapon: 24, armL: [-100, -30], torso: 34, head: -8, root: [4, 0], legR: [-30, 40], legL: [46, 10], face: 'grit' }, { cancel: 'attack', ease: 'out', fx: [{ kind: 'dust', x: -8, y: 0 }] }),
    G(4, { ...GARDE, torso: 10 }, { cancel: 'any', ease: 'out' }),
  ] },

  // ---- Tempest Waltz: lock onto the nearest enemy (60px), 6 thrusts (4 each) + thunderclap (10, knockdown); 36f, i-frames 1-20 ----
  special: (() => {
    const th = (i, ex) => {
      const hi = i % 3 === 1, lo = i % 3 === 2, dx = [8, 6, 10, 7, 9, 11][i];
      const pose = hi ? { armR: [126, -20], weapon: 26, armL: [-100, -40], torso: 14, head: -2, root: [dx, 0], legR: [40, -30], legL: [-34, 8], face: 'shout' }
        : lo ? { armR: [76, -6], weapon: -14, armL: [-110, -20], torso: 30, head: 6, root: [dx, 0], legR: [54, -58], legL: [-44, 2], face: 'shout' }
          : { armR: [98, -4], weapon: 22, armL: [-96, -30], torso: 22, head: 4, root: [dx, 0], legR: [48, -40], legL: [-36, 6], face: 'shout' };
      return G(4, pose, { hitbox: frontBox(40, hit(4, 'light', 0.4, 0, 12)), invuln: i < 5, sfx: SW, ease: i % 2 ? 'out' : 'overshoot',
        smear: { from: hi ? -40 : lo ? 10 : -20, to: hi ? -10 : lo ? 40 : 10, a: 0.35, r: 62 }, fx: SLASH(30, hi ? 52 : lo ? 32 : 44, 20, hi ? -20 : lo ? 15 : 0, 36), ...(ex || {}) });
    };
    return { loop: false, frames: [
      G(2, { armR: [10, -116], weapon: -178, armL: [-60, -50], torso: -10, head: -6, root: [-3, 0], legR: [16, -4], legL: [-20, 14], face: 'angry' },
        { lockOn: { range: 70, snap: 0.7, gap: 34 }, invuln: true, sfx: 'special_sael', event: 'charge', charge: 40, ease: 'in', fx: [{ kind: 'ring', x: 0, y: 40, r0: 30, r1: 4, color: ARC }] }),
      th(0), th(1), th(2), th(3), th(4), th(5),
      // thunderclap: blade flung up, arms wide, ring bursts out of the guard
      G(4, { armR: [170, -20], weapon: 30, armL: [-150, -20], torso: -8, head: -12, root: [4, 0], squash: 0.94, stretch: 1.06, legR: [30, -10], legL: [-36, 12], face: 'shout' },
        { hitbox: areaBox(50, hit(10, 'knockdown', 5, 4, 24)), sfx: ARC_SFX, smear: { from: 30, to: -100, a: 0.5, r: 66 },
          fx: [{ kind: 'ring', x: 0, y: 40, r0: 4, r1: 50, color: ARC }, { kind: 'ring', x: 0, y: 0, r1: 50, flat: true, color: WHITE }, { kind: 'flash', x: 0, y: 0, color: '#BFEFFF' }], ease: 'overshoot' }),
      G(4, { armR: [160, -20], weapon: 26, armL: [-140, -20], torso: -4, head: -8, root: [4, 0], legR: [26, -8], legL: [-32, 12], face: 'grit' }, { ease: 'inout' }),
      G(2, { ...GARDE, torso: 8, root: [2, 0] }, { cancel: 'any', ease: 'out' }),
    ] };
  })(),
  // ---- Sky Lane: blink to up to 8 enemies (12 each, 6f per hop), then a 30 dmg thunderclap; invulnerable throughout ----
  super: (() => {
    const frames = [G(6, { armR: [10, -116], weapon: -178, armL: [-80, -60], torso: 26, head: -8, root: [-2, 0], squash: 1.12, stretch: 0.88, legR: [40, -40], legL: [-34, 30], face: 'angry' },
      { sfx: 'super_sael', event: 'charge', charge: 80, ease: 'in', fx: [{ kind: 'ring', x: 0, y: 40, r0: 40, r1: 4, color: ARC }] })];
    for (let i = 0; i < 8; i++) {
      const hi = i & 1;
      frames.push(F(2, { armR: [40, -120], weapon: -160, armL: [-100, -40], torso: 40, head: -10, root: [0, -10], squash: 0.86, stretch: 1.16, legR: [60, -30], legL: [-50, 10], face: 'grit' },
        { event: 'blink', radius: 400, ease: 'in', fx: [{ kind: 'steam', x: 0, y: 30, count: 3 }] }));
      frames.push(G(4, hi ? { armR: [124, -16], weapon: 24, armL: [-110, -30], torso: 10, head: -4, root: [8, 0], legR: [42, -30], legL: [-36, 8], face: 'shout' }
        : { armR: [98, -4], weapon: 22, armL: [-100, -30], torso: 24, head: 4, root: [10, 0], legR: [50, -44], legL: [-38, 6], face: 'shout' },
      { hitbox: frontBox(40, hit(12, 'medium', 1, 0, 20)), sfx: SW, smear: { from: hi ? -50 : -20, to: hi ? -10 : 12, a: 0.45, r: 64 }, fx: SLASH(30, hi ? 50 : 44, 24, hi ? -15 : 0, 60), ease: 'overshoot' }));
    }
    frames.push(G(6, { armR: [172, -20], weapon: 30, armL: [-150, -20], torso: -8, head: -12, root: [4, 0], squash: 0.92, stretch: 1.08, legR: [30, -10], legL: [-36, 12], face: 'shout' },
      { hitbox: areaBox(60, hit(30, 'knockdown', 6, 5, 24), { y: -90, h: 90 }), sfx: ARC_SFX, smear: { from: 40, to: -110, a: 0.55, r: 70 },
        fx: [{ kind: 'ring', x: 0, y: 40, r0: 4, r1: 60, color: WHITE }, { kind: 'ring', x: 0, y: 0, r1: 60, flat: true, color: ARC }, { kind: 'flash', x: 0, y: 0, color: '#BFEFFF' }], ease: 'overshoot' }));
    frames.push(G(10, { armR: [150, -30], weapon: 20, armL: [-120, -30], torso: -2, head: -6, root: [3, 0], legR: [24, -6], legL: [-28, 10], face: 'happy' }, { ease: 'inout' }));
    frames.push(G(4, { ...GARDE, torso: 6 }, { ease: 'out' }));
    return { loop: false, frames };
  })(),

  // dodge: 20f roll around the body centre + 5f recovery (traits.dodgeRecovery)
  dodge: { loop: false, frames: [
    G(4, { ...GARDE, armR: [40, -60], weapon: -80, torso: 30, root: [0, 2], legR: [40, 40], legL: [-20, 40], face: 'grit', squash: 1.08, stretch: 0.92 }, { sfx: 'dodge', ease: 'in' }),
    // tuck keys rotate about the body centre (root = c - R(rot)*c for c = (0, -36)), not the feet
    F(5, { torso: 40, head: 24, root: [-26, -52, 120], legR: [110, 90], legL: [90, 110], armR: [90, -110], weapon: -20, armL: [70, 70], face: 'closed' }),
    F(5, { torso: 40, head: 24, root: [36, -52, 240], legR: [110, 90], legL: [90, 110], armR: [90, -110], weapon: -20, armL: [70, 70], face: 'closed' }),
    F(5, { torso: 36, head: 10, root: [8, -6, 360], legR: [60, 40], legL: [30, 40], armR: [60, -100], weapon: -60, armL: [50, 60], face: 'closed' }, { ease: 'out' }),
    G(6, { ...GARDE, torso: 10, root: [0, 1, 360], legR: [22, 10], legL: [-16, 14], squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
  ] },
  // air dash (traits.airDashes): 12f horizontal jet burst, body stretched flat
  airDash: { loop: false, frames: [
    F(2, { armR: [40, -100], weapon: -150, armL: [-80, -50], torso: 20, head: -6, legR: [50, -40], legL: [20, -30], squash: 1.1, stretch: 0.9, face: 'grit' }, { ease: 'in' }),
    F(8, { armR: [14, -6], weapon: -4, armL: [-30, -20], torso: 78, head: -30, root: [0, -6], legR: [-80, 6], legL: [-88, 10], footR: -20, footL: -20, squash: 0.9, stretch: 1.12, face: 'shout' }, { ease: 'out', fx: [{ kind: 'ring', x: -10, y: 40, r0: 2, r1: 28, color: ARC }] }),
    F(2, { armR: [60, -60], weapon: -70, armL: [-90, -30], torso: 20, head: -8, legR: [30, -30], legL: [10, -20], face: 'grit' }, { ease: 'out' }),
  ] },
  // taunt: flips the rapier (weapon spins in hand through 360), catches it with a hop and a grin; meter on the last key
  taunt: { loop: false, frames: [
    G(6, { armR: [40, -60], weapon: -60, armL: [-30, -20], torso: 4, head: 2, legR: [12, 2], legL: [-12, 4], face: 'neutral' }, { ease: 'in' }),
    G(6, { armR: [150, -40], weapon: 60, armL: [-40, -30], torso: -6, head: -10, root: [0, 0], legR: [12, 2], legL: [-12, 4], face: 'happy', squash: 0.96, stretch: 1.04 }, { ease: 'out', sfx: 'whiff' }),
    G(8, { armR: [140, -30], weapon: 240, armL: [-40, -30], torso: -4, head: -14, legR: [12, 2], legL: [-12, 4], face: 'happy' }, { ease: 'linear' }),
    G(8, { armR: [130, -30], weapon: 420, armL: [-40, -30], torso: -2, head: -12, legR: [12, 2], legL: [-12, 4], face: 'happy' }, { ease: 'linear' }),
    G(6, { armR: [60, -50], weapon: 290, armL: [-30, -30], torso: 6, head: 2, root: [0, 1], legR: [18, 8], legL: [-14, 10], face: 'happy', squash: 1.08, stretch: 0.92 }, { ease: 'out', sfx: SW }),
    G(16, { ...CARRY, torso: 2, head: -4, weapon: -58, face: 'happy' }, { event: 'meterGain', ease: 'inout' }),
  ] },

  // ---- grabs / throws ----
  grab: { loop: false, frames: [
    G(4, { ...GARDE, armL: [30, 30], torso: 6, face: 'angry' }, { ease: 'in' }),
    G(4, { armR: [70, 30], weapon: -110, armL: [84, 10], torso: 16, root: [3, 0], legR: [28, 6], legL: [-22, 14], face: 'angry' },
      { hitbox: { x: 4, y: -60, w: 36, h: 56, z: 20, type: 'grab', once: true, damage: 0 }, sfx: 'hit_grab', ease: 'out' }),
  ] },
  grabHold: { loop: true, frames: [
    G(16, { armR: [70, 30], weapon: -110, armL: [84, 10], torso: 12, legR: [24, 4], legL: [-20, 12], face: 'angry' }, { ease: 'inout' }),
    G(16, { armR: [72, 32], weapon: -112, armL: [86, 12], torso: 14, root: [0, 1], legR: [24, 4], legL: [-20, 12], face: 'angry' }, { ease: 'inout' }),
  ] },
  // hold hit: pommel jab to the ribs
  grabHit: { loop: false, frames: [
    G(4, { armR: [20, -110], weapon: -150, armL: [84, 10], torso: -6, head: -8, root: [-2, 0], legR: [22, 4], legL: [-20, 12], face: 'angry' }, { ease: 'in' }),
    G(4, { armR: [90, -60], weapon: -140, armL: [84, 10], torso: 26, head: 10, root: [4, 0], legR: [30, 8], legL: [-24, 16], face: 'shout' }, { sfx: 'hit_medium', ease: 'overshoot' }),
    G(6, { armR: [70, 30], weapon: -110, armL: [84, 10], torso: 12, legR: [24, 4], legL: [-20, 12], face: 'angry' }, { ease: 'out' }),
  ] },
  // forward throw: jet-boot kick — she hops off the ground with the kick (moves.throwFwd.selfVy) and the enemy flies 160px
  throw: { loop: false, frames: [
    G(5, { armR: [40, -60], weapon: -80, armL: [70, 10], torso: 20, head: 6, root: [-2, 0], squash: 1.08, stretch: 0.92, legR: [-30, 60], legL: [-20, 30], face: 'angry' }, { ease: 'in' }),
    F(6, { armR: [-70, -30], weapon: -40, armL: [-100, -20], torso: -18, head: -8, root: [6, -14], squash: 0.94, stretch: 1.06, legR: [98, -4], legL: [-30, 20], footR: 24, face: 'shout' },
      { sfx: 'throw', event: 'jet', jet: 16, fx: [{ kind: 'ring', x: 26, y: 44, r0: 2, r1: 30, color: ARC }, { kind: 'steam', x: -8, y: 20, count: 3 }], ease: 'overshoot' }),
    F(8, { armR: [-60, -30], weapon: -40, armL: [-90, -20], torso: -12, head: -6, root: [6, -8], legR: [80, -10], legL: [-24, 20], face: 'grit' }, { ease: 'out' }),
    G(5, { ...GARDE, torso: 10, root: [4, 0], squash: 1.06, stretch: 0.94, legR: [26, 10], legL: [-20, 16] }, { ease: 'out' }),
  ] },
  // back throw: vault-over kick — a full flip over the held enemy, boot landing on the way down (enemy sent 90px behind)
  throwBack: { loop: false, frames: [
    G(5, { armR: [80, 20], weapon: -100, armL: [80, 20], torso: 26, head: 6, root: [-2, 0], squash: 1.12, stretch: 0.88, legR: [34, -20], legL: [-30, 30], face: 'angry' }, { ease: 'in' }),
    // forward vault: three keys rotating about the body centre (c = (0, -38)); the boot lands on the enemy on the way over
    F(4, { armR: [150, -10], weapon: 20, armL: [140, -10], torso: 10, head: 6, root: [-30, -66, 110], legR: [40, 30], legL: [10, 50], squash: 0.9, stretch: 1.1, face: 'grit' }, { sfx: 'throw', event: 'jet', jet: 14, ease: 'out' }),
    F(4, { armR: [110, 20], weapon: -60, armL: [100, 20], torso: 10, head: 4, root: [30, -76, 230], legR: [100, -10], legL: [30, 20], footR: 20, face: 'shout' }, { fx: [{ kind: 'ring', x: -22, y: 50, r0: 2, r1: 30, color: ARC }], ease: 'linear' }),
    F(4, { armR: [60, -30], weapon: -70, armL: [-60, -30], torso: 20, head: 0, root: [6, -12, 350], legR: [50, -30], legL: [-20, 30], face: 'grit' }, { ease: 'in' }),
    G(7, { ...GARDE, torso: 16, root: [4, 0, 360], squash: 1.1, stretch: 0.9, legR: [30, -6], legL: [-22, 20] }, { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0 }] }),
  ] },

  // ---- damage / defeat ----
  hurt: { loop: false, frames: [
    G(4, { ...CARRY, torso: -28, head: -24, armL: [-70, -30], armR: [36, -10], weapon: -80, root: [-5, 0], legR: [24, 2], legL: [-14, 12], face: 'hurt' }, { ease: 'out' }),
    G(10, { ...CARRY, torso: -12, head: -10, armL: [-36, -12], armR: [26, -6], weapon: -66, root: [-2, 0], legR: [14, 2], legL: [-10, 8], face: 'hurt' }, { ease: 'out' }),
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
  // win: flings the letters — a hop with the rapier raised and the free hand tossing the satchel's mail into the air
  win: { loop: true, frames: [
    G(6, { armR: [-150, -20], weapon: -30, armL: [40, 20], torso: -4, head: -6, root: [0, 2], squash: 1.08, stretch: 0.92, legR: [12, 10], legL: [-12, 10], face: 'happy' }, { ease: 'out' }),
    F(10, { armR: [-170, -20], weapon: -30, armL: [-160, -30], torso: -8, head: -12, root: [0, -10], squash: 0.96, stretch: 1.06, legR: [30, -50], legL: [-10, -30], face: 'happy' }, { ease: 'out', fx: [{ kind: 'ring', x: -10, y: 70, r0: 4, r1: 30, color: WHITE }] }),
    F(6, { armR: [-166, -16], weapon: -26, armL: [-140, -30], torso: -6, head: -10, root: [0, -3], legR: [20, -20], legL: [-10, -10], face: 'happy' }, { ease: 'in' }),
    G(4, { armR: [-150, -20], weapon: -30, armL: [-60, -30], torso: -4, head: -6, root: [0, 2], squash: 1.1, stretch: 0.9, legR: [14, 14], legL: [-14, 14], face: 'happy' }, { ease: 'out' }),
    G(14, { armR: [-154, -20], weapon: -30, armL: [-40, -20], torso: -5, head: -8, legR: [10, 4], legL: [-10, 4], face: 'happy' }, { ease: 'inout' }),
  ] },
};

// ---------------------------------------------------------------------------------------------------------------
// Hooks: jet-boot flames, blade charge, arc-dash afterimages, double-jump flash
// ---------------------------------------------------------------------------------------------------------------
const TRAIL_N = 6;
/** Reused drawRig options for the afterimages (no per-frame allocation). */
const GHOST = { x: 0, y: 0, facing: 1, alpha: 0.3, tint: ARC, tintAlpha: 0.8, still: true };
function trailOf(f) { if (!f.saelTrail) { f.saelTrail = { n: 0, head: 0, pts: Array.from({ length: TRAIL_N }, () => ({ x: 0, y: 0, z: 0, facing: 1 })) }; } return f.saelTrail; }
const hooks = {
  onSpawn(f) { f.rig.jet = 0; f.rig.charge = 0; trailOf(f).n = 0; },
  onUpdate(f) {
    const rig = f.rig;
    if (rig.jet > 0) rig.jet--;
    if (rig.charge > 0) rig.charge--;
    const tr = trailOf(f), dashing = f.state === ST.DASH_ATTACK && !!f.anim.move;
    if (dashing) { const p = tr.pts[tr.head]; p.x = f.x; p.y = f.y; p.z = f.z; p.facing = f.facing; tr.head = (tr.head + 1) % TRAIL_N; if (tr.n < TRAIL_N) tr.n++; }
    else if (tr.n > 0 && (f.world.frame & 1)) tr.n--;
  },
  onStateEnter(f, state) {
    const rig = f.rig;
    if (state === ST.JUMP || (state === ST.DODGE && f.airDash) || state === ST.DASH_ATTACK) rig.jet = Math.max(rig.jet, state === ST.JUMP ? 8 : 12);
    if (state === ST.SPECIAL) rig.charge = 40;
    if (state === ST.SUPER) rig.charge = 80;
    if (state === ST.HURT || state === ST.KNOCKDOWN) rig.charge = 0;
  },
  onJumpPressed(f, world, air) {
    if (air && f.jumpsLeft > 0) { f.rig.jet = 10; world.addFx('ring', f.x, f.y + 8, f.z, { r0: 4, r1: 26, color: ARC }); }
    return false;
  },
  onAnimEvent(f, name, frame) {
    if (name === 'jet') { f.rig.jet = Math.max(f.rig.jet, (frame && frame.jet) || 8); return true; }
    if (name === 'charge') { f.rig.charge = Math.max(f.rig.charge, (frame && frame.charge) || 40); return true; }
    return false;
  },
  onThrow(f, target, dir) { f.rig.jet = 16; },
  /** Arc-dash afterimages: the last positions of the dash drawn as fading electro-blue ghosts under the rig. */
  drawBefore(ctx, f, sx, sy, cam) {
    const tr = f.saelTrail;
    if (!tr || tr.n === 0) return;
    for (let i = 0; i < tr.n; i += 2) {
      const p = tr.pts[(tr.head - 1 - i + TRAIL_N * 2) % TRAIL_N], o = GHOST;
      o.x = cam.toScreenX(p.x); o.y = FLOOR_TOP + p.z - p.y + cam.shakeY; o.facing = p.facing; o.alpha = 0.3 - i * 0.04;
      drawRig(ctx, f.rig, f.anim.pose, o);
    }
  },
};

/** Select / HUD bust: the rig's head and shoulders in the idle pose. */
const portraitRig = buildRig(build);
function portrait(ctx, x, y, s) { drawHeadPortrait(ctx, portraitRig, anims.idle.frames[0].pose, x, y, s, { fill: 0.62 }); }

/** Sael Windwright character definition. */
export const sael = {
  id: 'sael', name: 'SAEL', fullName: 'Sael Windwright', title: 'THE SKY-COURIER', archetype: 'SPEED',
  stats: { power: 2, speed: 5, health: 2, range: 2, technique: 5 },
  maxHp: hpFor(2), walkSpeed: speedFor(5), runSpeed: speedFor(5) * 1.7, jumpVy: 8.5, reach: 38, grabReach: 20, grabOffset: 24,
  freeChain: true,
  // Double Jump + one air dash per airborne state, dodge recovery 5f, takes 15% more damage (GDD 2.2 unique trait)
  traits: { extraJumps: 1, airDashes: 1, dodgeRecovery: 5, damageTakenMult: 1.15 },
  build,
  anims,
  hooks,
  moves: {
    special: { name: 'TEMPEST WALTZ', cost: METER.special }, super: { name: 'SKY LANE', cost: METER.super, damage: 126 },
    throwFwd: { damage: 12, vx: 10, vy: 5, selfVy: 4, releaseAt: 6 }, throwBack: { damage: 12, vx: 6, vy: 4, releaseAt: 6 }, grabHit: { damage: 5, hits: 3 },
  },
  sfx: { special: 'special_sael', super: 'super_sael', swing: 'rapier' },
  portrait,
};
