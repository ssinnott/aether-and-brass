// Brunhild Coalheart — Tank (GDD 2.1). Dwarf boilerwright with a two-handed steam hammer, boiler backpack,
// forehead goggles, gear pauldron and a big braided beard. Hand-authored 16-bit style sprite rig + full animation set.
//
// Moveset numbers come straight from GDD 2.1 (timings inside the startup budgets, ART_STYLE section 8):
//   combo   swipe 10 (6f startup, hitstun 16) -> backhand 10 (hits behind) -> overhead slam 15 (knockdown, ground-bounces an
//           airborne body once, 1-hit armor) -> steam uppercut 20 (launcher, flame ring, 1-hit armor). Reach 40.
//   jump    downward slam 14 + 40 px landing shockwave (10, knockdown)         dash   shoulder charge 14f, 18, ~120 px, 3-hit armor
//   special Piston Quake r 60, 25, knockdown to GROUNDED enemies only, 8f startup / 4f active / 12f recovery, invulnerable
//   super   Overpressure: three rings r 60 / 100 / 140 for 30 + 30 + 40 (knockdown), 45f, invulnerable (SUPER state)
//   grab    forward = hammer-golf swing (20, flies ~200 px as a projectile); back = piledriver (22 + 40 px shockwave 10)
//   trait   Heavy Frame: 15 % less damage taken, light (< 10 dmg) knockdowns become flinches, combo hits 3-4 absorb 1 hit each
//
// Readability pass (docs/ART_STYLE.md section 0): every adjacent pair of parts differs in value or hue family (tan skin /
// cream sleeves / bright rust beard / dark oxblood apron / blue-grey trousers / cool slate boots with a steel toe /
// light steel hammer head on a mid wood handle / dark iron boiler with brass bands), micro-details under 2 px are gone,
// the 22 px head is laid out in rows (goggles / brows / eyes / nose / beard) with the beard as ONE chain-sheared
// polygon, and the rest poses hold the hammer LOW at the side with the head lifted in front of the hip (never on the
// floor, never across the face) while the free arm hangs back so both arms show. The renderer does the rest: contact
// shadows under limbs, far-limb darkening, thin-part two-tone shading.
import { speedFor, hpFor, areaBox, frontBox, P, F, hit } from './common.js';
import { JUMP_VY, METER } from '../../constants.js';
import { celRect, celBall, celPoly, celPath, tones, flat, band } from '../../art/shading.js';
import { drawSkull, drawFace, drawBoot, drawFist, drawBelt } from '../../art/rigParts.js';
import { getChain } from '../../art/secondary.js';
import { buildRig } from '../../art/rig.js';
import { drawHeadPortrait } from '../../art/portraits.js';
import { rad } from '../../engine/math.js';

// ---------------------------------------------------------------------------------------------------------------
// Palette (GDD 2.1 hue families, re-picked for value separation) and rig build
// ---------------------------------------------------------------------------------------------------------------
// skin: tan (light warm)  hair/beard: bright rust  primary: dark oxblood apron  sleeve: brass-cream linen shirt
// secondary: blue-grey trousers  accent: brass  metal: light steel (hammer head + boot toe)  dark: slate boots  glow: boiler fire
// dark = boots: SLATE (cool) so they separate from the warm dock planks and the blue-grey trousers by value
// Saturation pass, and the one place a proposed target had to be REJECTED on measurement. Her sleeve at 10.1 % of
// painted area was the biggest colourless mass on the rig (#D9CDAE, s 20), but the brass-cream #D9B65D that would
// have fixed the mean lands 1 hue degree and 3.9 Oklab L* from the GEAR PAULDRON's own brass #D4A72C, which sits
// directly on top of it: rendered, the shoulder and the sleeve fused into one gold blob. On that shoulder the
// separator has always been CHROMA, not value (the old cream read against the brass at 59 saturation points of
// difference, not 19 % luminance). So the shirt goes to #E4CE9A: s 20 -> 33, hue and lightness held (L* 85.0 ->
// 85.7), which reads FURTHER from the brass than the cream did (relDiff 0.195 vs 0.188, dSat 47) and further from
// the skin too, and still leaves the section 0.1 ladder skin > sleeve > beard #D4562A > apron #6B2419 intact.
// The chroma the sleeve cannot safely carry is spent instead where nothing on this rig competes - the BLUE half of
// her, which no other Brunhild mass and none of the six warm stages occupy: trousers #566070 -> #4E5E82 (s 23 ->
// 40, Oklab lightness held at 48.5, C 2.9 -> 6.2, i.e. out of the low-chroma core every polychrome backdrop also
// claims), boots #454C60 -> #3A4560 (s 28 -> 40, L* 41.8 -> 39.3, so she finally has a dark anchor below L* 40
// besides the apron) and the boiler IRON #545A6A -> #4C5A78 (s 21 -> 37 at the same lightness). All three stay at
// or under the 40 % neutral ceiling, so they are still slate and iron and not a blue uniform. Light steel
// #9AA0AE -> #92A2BA for the same reason and to the same limit (s 12 -> 22, L* 70.5 held): the hammer head is one
// of the largest single shapes in the cast and at Oklab C 2.2 all of it sat on the neutral axis of the lattice.
const PAL = { skin: '#ECBA8C', hair: '#D4562A', primary: '#6B2419', sleeve: '#E4CE9A', secondary: '#4E5E82', accent: '#D4A72C', metal: '#92A2BA', dark: '#3A4560', glow: '#E86A1E' };
const LEATHER = '#4A3020', IRON = '#4C5A78', LENS = '#9BC1E8', STEAM = '#E8F0F4', WOOD = '#8C5A2C', HOT = '#FFD27A', BROW = '#7A2E12';
const R = Math.round;

/** Two-handed steam hammer (hand space: +x along the handle). Light steel head with dark striking faces, two brass bands, chimney, fire slot. */
function drawHammer(ctx, rig) {
  // handle: pommel 12px behind the near hand (the rear hand stacks there), brass pommel cap, one leather grip band
  celRect(ctx, rig, -12, -2, 44, 4, 1, WOOD, 0.4, 0);
  if (!rig.override) {
    ctx.fillStyle = rig.col(PAL.accent); ctx.fillRect(-12, -2, 3, 4);
    ctx.fillStyle = rig.col(LEATHER); ctx.fillRect(-8, -2, 14, 4);
  }
  // head: tall steel block perpendicular to the handle, bevelled ends
  celPoly(ctx, rig, [24, -15, 36, -15, 38, -13, 38, 13, 36, 15, 24, 15, 22, 13, 22, -13], PAL.metal, 0.36, 0.3);
  if (rig.override) return;
  const ti = tones(rig, PAL.metal), tb = tones(rig, PAL.accent);
  // dark striking faces (2px), two brass bands (3px), fire slot with a hot core
  ctx.fillStyle = ti.deep; ctx.fillRect(22, -13, 2, 26); ctx.fillRect(36, -13, 2, 26);
  // brass on steel is a MATERIAL change, so each band takes its own 1 px of ink (section 0.2); widened 3 -> 4 px so the
  // inked band still carries 4 px of colour (section 0.7). The 1 px sh line inside it is FORM, and stays a tone seam.
  band(ctx, rig, 23, -11, 14, 4, tb.base); band(ctx, rig, 23, 7, 14, 4, tb.base);
  ctx.fillStyle = tb.sh; ctx.fillRect(23, -8, 14, 1); ctx.fillRect(23, 9, 14, 1);
  ctx.fillStyle = rig.col('#2a1a18'); ctx.fillRect(27, -4, 6, 8);
  ctx.fillStyle = rig.col(PAL.glow); ctx.fillRect(28, -3, 4, 6);
  ctx.fillStyle = rig.col(HOT); ctx.fillRect(29, -1, 2, 2);
  // chimney stub on the back face (top of the head when raised)
  ctx.beginPath(); ctx.rect(27, -21, 6, 6); flat(ctx, rig, ti.sh);
}

/** Head: skull (no default nose) + hair cap and bun, big dwarven nose BELOW the eye row (head space). */
function drawHead(ctx, rig, pose, inf) {
  const r = inf.r;
  drawSkull(ctx, rig, r, PAL.skin, PAL.hair, { jaw: 0.3, hairStyle: 'short', noNose: true });
  // hair bun at the back
  celBall(ctx, rig, -r * 0.9, -r * 0.45, 4, PAL.hair, false);
  // big dwarven nose: one flat outlined wedge from y 0.25r (under the eyes) to 0.85r (under the moustache), tip at 1.3r
  ctx.beginPath(); ctx.moveTo(r * 0.65, r * 0.25); ctx.lineTo(r * 1.3, r * 0.55); ctx.lineTo(r * 0.9, r * 0.85); ctx.lineTo(r * 0.6, r * 0.8); ctx.closePath();
  flat(ctx, rig, PAL.skin);
}
/**
 * Eyes + brows (mouth hidden under the beard), then the beard as ONE polygon whose lower vertices swing with a
 * 2-segment chain (a shear, not a seam), with a single 5x3 brass braid ring. Vertical layout of the 22 px head:
 * goggles -16..-8 | brows -5..-4 | eyes -2..1 | nose 3..9 | beard 5..20 — nothing sits on the eye row.
 */
function drawFaceBeard(ctx, rig, pose, inf) {
  const r = inf.r;
  drawFace(ctx, rig, r, pose.face | 0, { noMouth: true, eyeY: 1, brow: BROW, big: true });
  const ch = getChain(rig, 'beard', 2, { joint: 'head', rest: [0, 1], stiffness: 0.16, damping: 0.66, gain: 1.6, rotGain: 0.5, maxAng: 24 });
  const top = R(r * 0.5) - 1, len = 15, a = rad(ch.ang[0] + ch.ang[1] * 0.6), sx = Math.sin(a) * len, dy = Math.cos(a) * len;
  const w = R(r * 0.9), x0 = R(-r * 0.7), x1 = R(r * 1.0);
  ctx.beginPath();
  ctx.moveTo(x0, top); ctx.lineTo(x1 + 1, top); ctx.lineTo(x1 - 1, top + 6);
  ctx.lineTo(sx + w * 0.55, top + dy - 1); ctx.lineTo(sx + w * 0.2, top + dy + 2); ctx.lineTo(sx - w * 0.2, top + dy - 1); ctx.lineTo(sx - w * 0.55, top + dy - 3);
  ctx.lineTo(x0 - 1, top + 6);
  ctx.closePath();
  celPath(ctx, rig, PAL.hair, 2, top + 8, 11, 0.34, 0.2);
  if (rig.override) return;
  ctx.fillStyle = rig.col(PAL.accent); ctx.fillRect(R(sx * 0.6) + 1, top + 9, 5, 3);
  ctx.fillStyle = tones(rig, PAL.accent).sh; ctx.fillRect(R(sx * 0.6) + 1, top + 11, 5, 1);
}
/** Goggles pushed up over the hairline: leather strap + two brass-rimmed blue lenses (head space), 2 px clear of the brows. */
function drawGoggles(ctx, rig) {
  const r = rig.p.headR, cy = R(-r * 1.05);
  if (!rig.override) { ctx.fillStyle = rig.col(LEATHER); ctx.fillRect(R(-r) + 1, cy - 1, R(r * 2) - 2, 3); }
  for (let i = 0; i < 2; i++) {
    const cx = i ? R(r * 0.5) : R(-r * 0.2);
    celBall(ctx, rig, cx, cy, 4.5, PAL.accent, false);
    ctx.beginPath(); ctx.arc(cx, cy, 2.8, 0, Math.PI * 2); ctx.fillStyle = rig.col(LENS); ctx.fill();
    if (!rig.override) { ctx.fillStyle = rig.col('#ffffff'); ctx.fillRect(cx - 2, cy - 2, 2, 1); }
  }
}
/** Cream shirt with a dark oxblood apron over it: two shapes, bib straps, one seam (torso space). */
function drawTorso(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2);
  celPoly(ctx, rig, [-hw - 1, -H + 4, -hw + 4, -H, hw - 4, -H, hw + 1, -H + 4, hw, R(-H * 0.5), hw - 2, 2, -hw + 2, 2, -hw, R(-H * 0.5)], PAL.sleeve, 0.34, 0);
  celPoly(ctx, rig, [-hw + 5, -H + 7, hw - 5, -H + 7, hw - 2, R(-H * 0.4), hw - 3, 3, -hw + 3, 3, -hw + 2, R(-H * 0.4)], PAL.primary, 0.38, 0.25);
  if (rig.override) return;
  // bib straps up to the shoulders (3px leather) with a brass rivet each, one apron seam
  ctx.fillStyle = rig.col(LEATHER); ctx.fillRect(-hw + 7, -H + 1, 3, 7); ctx.fillRect(hw - 10, -H + 1, 3, 7);
  ctx.fillStyle = rig.col(PAL.accent); ctx.fillRect(-hw + 7, -H + 7, 3, 2); ctx.fillRect(hw - 10, -H + 7, 3, 2);
  ctx.fillStyle = tones(rig, PAL.primary).sh; ctx.fillRect(-hw + 5, -H + 11, W - 10, 1);
}
/** Heavy belt with a big brass buckle over blue-grey trousers (hip space). */
function drawHips(ctx, rig, pose, inf) {
  drawBelt(ctx, rig, inf.w, PAL.secondary, LEATHER, PAL.accent);
  if (rig.override) return;
  ctx.fillStyle = rig.col(PAL.accent); ctx.fillRect(0, -6, 6, 5);
  ctx.fillStyle = tones(rig, PAL.accent).sh; ctx.fillRect(1, -5, 4, 3);
}
/** Slate boots (cool, against the warm floor) with a light steel toe cap and one brass buckle (ankle space). */
function drawBootB(ctx, rig, pose, inf) {
  drawBoot(ctx, rig, inf.w, inf.h, inf.pal.dark, inf.pal.accent);
  if (rig.override) return;
  const toe = R(inf.w * 0.62);
  ctx.fillStyle = rig.col(inf.pal.metal); ctx.fillRect(toe - 5, -1, 5, 4);
  ctx.fillStyle = tones(rig, inf.pal.metal).sh; ctx.fillRect(toe - 5, 2, 5, 1);
}
/** Thick fists with a dark leather bracer on the forearm side (hand space). */
function drawHand(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.pal.skin);
  if (rig.override) return;
  ctx.fillStyle = rig.col(inf.far ? tones(rig, LEATHER).sh : LEATHER); ctx.fillRect(R(-inf.r * 0.6) - 3, -inf.r, 3, inf.r * 2);
}
/** Boiler backpack: iron cylinder with two brass bands, a fire window and a chimney puffing every 20 frames (torso space, back layer). */
function drawBoiler(ctx, rig) {
  const p = rig.p, x0 = -p.torsoW / 2 - 9, y0 = -p.torsoH - 4, w = 13, h = p.torsoH + 2;
  if (!rig.override) { ctx.fillStyle = rig.col(LEATHER); ctx.fillRect(x0 + w - 3, y0 + 6, 8, 3); ctx.fillRect(x0 + w - 3, y0 + h - 8, 8, 3); }
  celRect(ctx, rig, x0, y0, w, h, 4, IRON, 0.4, 0.3);
  celBall(ctx, rig, x0 + w / 2, y0 + 1, 5, IRON, false);
  celRect(ctx, rig, x0 + 3, y0 - 9, 4, 9, 1, IRON, 0.4, 0);
  if (rig.override) return;
  const tb = tones(rig, PAL.accent);
  // brass hoops on the iron cylinder: inked, 4 px (section 0.2 / 0.7), with the sh line inside them as the form seam
  band(ctx, rig, x0 + 1, y0 + 8, w - 2, 4, tb.base); band(ctx, rig, x0 + 1, y0 + h - 8, w - 2, 4, tb.base);
  ctx.fillStyle = tb.sh; ctx.fillRect(x0 + 1, y0 + 10, w - 2, 1); ctx.fillRect(x0 + 1, y0 + h - 6, w - 2, 1);
  // fire window
  ctx.fillStyle = rig.col('#241a1c'); ctx.fillRect(x0 + 3, y0 + 13, 7, 6);
  ctx.fillStyle = rig.col(PAL.glow); ctx.fillRect(x0 + 4, y0 + 14, 5, 4);
  ctx.fillStyle = rig.col(HOT); ctx.fillRect(x0 + 5, y0 + 15, 2, 2);
  // chimney puffs: one puff every 20 frames, rises, swells and fades over 20 frames (draw counter lives on the rig).
  // Steam is the one soft thing on the rig: no outline, three merged discs, alpha fading with height (ART_STYLE 3).
  const f = rig.tick % 20, k = f / 20, a0 = ctx.globalAlpha;
  ctx.fillStyle = tones(rig, STEAM).base;
  puff(ctx, x0 + 5 - k * 3, y0 - 11 - k * 13, 1.5 + k * 3.5, a0 * (0.6 - k * 0.5));
  if (f > 10) { const k2 = (f - 10) / 20; puff(ctx, x0 + 5 - k2 * 2, y0 - 10 - k2 * 9, 1.2 + k2 * 2.5, a0 * (0.45 - k2 * 0.4)); }
  ctx.globalAlpha = a0;
}
const TAU = Math.PI * 2;
/** One steam puff: three merged discs, no outline (fillStyle already set). */
function puff(ctx, x, y, r, alpha) {
  if (alpha <= 0.02) return;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU); ctx.arc(x - r * 0.8, y + r * 0.45, r * 0.7, 0, TAU); ctx.arc(x + r * 0.75, y + r * 0.5, r * 0.6, 0, TAU);
  ctx.fill();
}
/** Gear pauldron on the near shoulder: six big teeth, flat hub dot (torso space, drawn in front of the near arm). */
function drawPauldron(ctx, rig) {
  const p = rig.p, cx = p.torsoW / 2 - 1, cy = -p.torsoH + 3;
  ctx.beginPath();
  const n = 6, ro = 7.5, ri = 5.5;
  for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU, rr = i % 2 ? ri : ro; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.closePath();
  celPath(ctx, rig, PAL.accent, cx, cy, ro, 0.38, 0.3);
  if (!rig.override) { ctx.fillStyle = tones(rig, PAL.accent).deep; ctx.fillRect(R(cx) - 1, R(cy) - 1, 3, 3); }
}
/** Bust portrait (select cards / HUD): the real rig's head and shoulders in the idle carry, so it matches the sprite. */
let portraitRig = null;
const PORTRAIT_POSE = P({ armR: [24, -10], weapon: -99, armL: [-36, -30], legR: [8, 0], legL: [-8, 0], torso: 2, head: -2, face: 'angry' });
function portrait(ctx, x, y, s) {
  if (!portraitRig) portraitRig = buildRig(build);
  drawHeadPortrait(ctx, portraitRig, PORTRAIT_POSE, x, y, s, { bg: null, fill: 0.62, cy: 0.5 });
}

const build = {
  scale: 1, palette: PAL, outline: '#1E1A22', outlineWidth: 1, smearColor: '#D9C9A8',
  // readability knobs at their defaults, spelled out because this file is the reference (ART_STYLE section 0):
  // contact shadow under every limb, far limbs 38 % darker / 25 % greyer, two tones on parts thinner than 8 px
  farShade: 0.62, farDesat: 0.25,
  // 68 px tall, 3 heads: a 22 px head so the big-face features (5x4 eyes, 2 px brows) and the goggles get their rows
  proportions: { headR: 11, neck: 2, torsoW: 30, torsoH: 22, hip: 26, upperArm: 12, lowerArm: 11, armR: 6, handR: 5, upperLeg: 10, lowerLeg: 10, legR: 6.5, footL: 13, footH: 6, shoulderX: 3, hipX: 5 },
  parts: { head: drawHead, face: drawFaceBeard, torso: drawTorso, hips: drawHips, foot: drawBootB, hand: drawHand },
  // grip -8: the far hand holds the handle 8px BEHIND the near hand (stacked bat grip). That keeps the grip point within
  // the far arm's 23px reach in every two-handed key; see the audit notes in docs/ART_STYLE.md section 5.
  // headAt 30: the hammer-head centre sits 30 px along the handle from the near hand (tools/sheet.js audit).
  weapon: { attach: 'handR', length: 40, draw: drawHammer, twoHanded: true, grip: -8, headAt: 30 },
  accessories: [{ attach: 'head', draw: drawGoggles }, { attach: 'back', draw: drawBoiler }, { attach: 'torso', draw: drawPauldron }],
};

// ---------------------------------------------------------------------------------------------------------------
// Animation authoring
// ---------------------------------------------------------------------------------------------------------------
/**
 * Rest carry: hammer held LOW in the near hand with the head LIFTED in front of the hip (weapon limb angle ~115 deg =
 * torso + armR.upper + armR.lower - weapon.rot): the steel head sits ~27 px in front of the torso between chin and
 * knee height, its bottom 12 px off the floor, so the squint test reads "person holding a hammer" rather than a
 * canister standing on the ground. The far arm hangs BACK (-36/-30) so its fist emerges below the boiler behind the hip
 * and both arms show; feet planted wide. Face, beard, torso, both arms and both legs stay open (readability pass).
 */
const CARRY = { armR: [24, -10], weapon: -99, armL: [-36, -30], legR: [8, 0], legL: [-8, 0] };
/**
 * Hammer held ready in front of the chest, both hands on the handle (pose.grip = 1 solves the far arm onto it).
 * Two-handed keys were fitted so the grip point stays within the far arm's reach (see docs/ART_STYLE.md section 5):
 * every `grip: 1` key below keeps the far-shoulder -> grip distance under 25px.
 */
const READY = { armR: [88, -130], weapon: -130, armL: [30, -60], grip: 1, legR: [14, 4], legL: [-14, 6] };
const SW = 'hammer_swing';
/** Hit data of the jump slam (shared id = one hit per target across the hit + held frames). */
const JUMP_HIT = { id: 'jumpAttack', x: -6, y: -50, w: 60, h: 78, z: 24, once: true, damage: 14, type: 'knockdown', kbX: 3, kbY: 4, hitstun: 20 };
/** Hammer dropped along the floor while lying (root rot -88: body-space +y runs toward the feet along the ground). */
const FLOORED = { armR: [-24, -4], weapon: -24, armL: [25, 20], torso: 4, head: -10, legR: [10, 8], legL: [-4, 6], root: [30, -9, -88], face: 'dazed' };

const anims = {
  idle: { loop: true, frames: [
    F(14, { ...CARRY, torso: 2, root: [0, 0] }, { ease: 'inout' }),
    F(14, { ...CARRY, torso: 4, head: 2, root: [0, 1], armR: [25, -11], weapon: -100, armL: [-34, -28] }, { ease: 'inout' }),
    F(12, { ...CARRY, torso: 3, head: 1, root: [0, 1], armR: [24, -10], weapon: -99 }, { ease: 'inout' }),
    F(14, { ...CARRY, torso: 1, head: -1, root: [0, 0], armR: [23, -9], weapon: -98, armL: [-38, -32] }, { ease: 'inout' }),
  ] },
  // walk: the lifted carry rides along (limb angle ~120) in the near hand while the far arm swings, biased back so it
  // shows behind the body on the back half of the stride
  walk: { loop: true, frames: [
    F(4, { ...CARRY, legR: [30, 2], legL: [-22, 18], footR: -8, armL: [4, -6], torso: 7, root: [0, 0], armR: [26, -14], weapon: -103 }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [24, 10], legL: [-14, 30], armL: [-2, -8], torso: 8, root: [0, 2], armR: [28, -16], weapon: -105, head: 2, squash: 1.03, stretch: 0.97 }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [8, 22], legL: [0, 12], armL: [-14, -12], torso: 6, root: [0, 1], armR: [24, -12], weapon: -103 }, { ease: 'inout' }),
    F(4, { ...CARRY, legR: [-10, 12], legL: [18, -2], footL: -6, armL: [-30, -14], torso: 5, root: [0, -1], armR: [20, -8], weapon: -103, head: -1 }, { ease: 'in' }),
    F(4, { ...CARRY, legR: [-22, 18], legL: [30, 2], footL: -8, armL: [-44, -16], torso: 7, root: [0, 0], armR: [22, -12], weapon: -103 }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [-14, 30], legL: [24, 10], armL: [-38, -16], torso: 8, root: [0, 2], armR: [24, -14], weapon: -105, head: 2, squash: 1.03, stretch: 0.97 }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [0, 12], legL: [8, 22], armL: [-24, -14], torso: 6, root: [0, 1], armR: [24, -12], weapon: -103 }, { ease: 'inout' }),
    F(4, { ...CARRY, legR: [18, -2], legL: [-10, 12], footR: -6, armL: [-8, -10], torso: 5, root: [0, -1], armR: [24, -10], weapon: -103, head: -1 }, { ease: 'in' }),
  ] },
  // run: 8 keys x 3f, lean 20-22. contact (front foot planted, root +4) -> down (support leg under the body, root +3, squash)
  // -> pass (push-off, both feet off, root -2) -> reach (front leg reaching, airborne) x2; feet checked with the pose audit
  run: { loop: true, frames: [
    F(3, { ...READY, legR: [34, -2], legL: [-34, 46], armR: [90, -128], weapon: -106, torso: 20, head: -4, root: [0, 4], face: 'angry' }, { ease: 'out' }),
    F(3, { ...READY, legR: [12, 12], legL: [-16, 64], armR: [88, -126], weapon: -104, torso: 22, head: -4, root: [0, 3], squash: 1.04, stretch: 0.96, face: 'angry' }, { ease: 'out' }),
    F(3, { ...READY, legR: [-10, 30], legL: [22, 4], armR: [86, -124], weapon: -102, torso: 21, head: -3, root: [0, -2], face: 'angry' }, { ease: 'inout' }),
    F(3, { ...READY, legR: [-34, 46], legL: [44, -14], armR: [88, -126], weapon: -104, torso: 20, head: -4, root: [0, 0], face: 'angry' }, { ease: 'in' }),
    F(3, { ...READY, legR: [-34, 46], legL: [34, -2], armR: [90, -128], weapon: -106, torso: 20, head: -4, root: [0, 4], face: 'angry' }, { ease: 'out' }),
    F(3, { ...READY, legR: [-16, 64], legL: [12, 12], armR: [88, -126], weapon: -104, torso: 22, head: -4, root: [0, 3], squash: 1.04, stretch: 0.96, face: 'angry' }, { ease: 'out' }),
    F(3, { ...READY, legR: [22, 4], legL: [-10, 30], armR: [86, -124], weapon: -102, torso: 21, head: -3, root: [0, -2], face: 'angry' }, { ease: 'inout' }),
    F(3, { ...READY, legR: [44, -14], legL: [-34, 46], armR: [88, -126], weapon: -104, torso: 20, head: -4, root: [0, 0], face: 'angry' }, { ease: 'in' }),
  ] },
  jump: { loop: false, frames: [
    F(3, { ...CARRY, legR: [30, 40], legL: [-20, 44], torso: 14, root: [0, 4], squash: 1.1, stretch: 0.9, armL: [-30, 30], armR: [30, -10], weapon: -90 }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [30, -30], legL: [10, -20], torso: -4, root: [0, -2], squash: 0.94, stretch: 1.08, armL: [-70, -30], head: -4, armR: [36, -16], weapon: -100 }, { ease: 'out' }),
    F(30, { ...CARRY, legR: [40, -70], legL: [20, -50], torso: 2, armL: [-50, -20], head: -2, squash: 1, stretch: 1, armR: [34, -14], weapon: -96 }),
  ] },
  fall: { loop: true, frames: [
    F(10, { ...CARRY, legR: [24, -30], legL: [8, -20], armL: [-80, -30], torso: -6, head: -6, face: 'grit', armR: [34, -14], weapon: -96 }, { ease: 'inout' }),
    F(10, { ...CARRY, legR: [30, -40], legL: [4, -14], armL: [-95, -30], torso: -8, head: -8, face: 'grit', armR: [36, -16], weapon: -100 }, { ease: 'inout' }),
  ] },
  land: { loop: false, frames: [
    F(3, { ...CARRY, legR: [34, 46], legL: [-24, 48], torso: 22, head: 4, root: [0, 3], squash: 1.16, stretch: 0.86, armL: [-30, 30], armR: [30, -10], weapon: -100, face: 'grit' }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [14, 16], legL: [-10, 18], torso: 8, root: [0, 1], squash: 1.02, stretch: 0.98 }, { ease: 'out' }),
  ] },

  // ---- ground combo: swipe -> backhand -> overhead slam -> steam uppercut (GDD 2.1) ----
  // Every attack: anticipation (ease in, hammer wound the opposite way) -> hit key (overshoot + smear + hitbox) ->
  // hit hold (+4 deg) -> follow-through (inout, cancel window) -> return to CARRY.
  attack1: { loop: false, frames: [
    F(3, { grip: 1, armR: [-44, -146], weapon: -72, armL: [40, -50], torso: -12, head: -6, root: [-2, 1], legR: [4, 4], legL: [-18, 12], face: 'angry' }, { sfx: SW, ease: 'in' }),
    F(3, { grip: 1, armR: [-52, -150], weapon: -76, armL: [50, -60], torso: -18, head: -8, root: [-3, 1], legR: [2, 6], legL: [-22, 16], face: 'angry' }, { ease: 'out' }),
    // hit: level swipe, near arm bent, both fists in front of the chest BELOW the chin (hand y -37, chin -42) so the eyes stay clear
    F(3, { grip: 1, armR: [44, 30], weapon: 15, armL: [-24, 16], torso: 26, head: 6, root: [5, 2], legR: [34, 8], legL: [-26, 22], face: 'shout' },
      { hitbox: frontBox(40, hit(10, 'light', 2, 0, 16)), smear: { from: -160, to: 0, a: 0.5 }, fx: [{ kind: 'slash', x: 30, y: 40, radius: 30, angle: 10 }], ease: 'overshoot' }),
    F(2, { grip: 1, armR: [38, 42], weapon: 23, armL: [-26, 16], torso: 28, head: 6, root: [6, 2], legR: [34, 8], legL: [-26, 22], face: 'shout' }, { ease: 'out' }),
    F(6, { grip: 1, armR: [34, 42], weapon: 19, armL: [-22, 14], torso: 24, head: 4, root: [5, 2], legR: [32, 8], legL: [-26, 22], face: 'angry' }, { cancel: 'attack', ease: 'inout' }),
    F(4, { ...CARRY, torso: 8, root: [2, 0], face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack2: { loop: false, frames: [
    F(3, { grip: 1, armR: [34, 42], weapon: 22, armL: [-30, 20], torso: 22, head: 4, root: [2, 2], legR: [30, 8], legL: [-24, 20], face: 'angry' }, { sfx: SW, ease: 'in' }),
    F(2, { grip: 1, armR: [48, 36], weapon: 28, armL: [-34, 22], torso: 26, head: 6, root: [3, 2], legR: [30, 8], legL: [-24, 20], face: 'angry' }, { ease: 'out' }),
    F(3, { grip: 1, armR: [-56, -90], weapon: -80, armL: [50, -40], torso: -16, head: -10, root: [-4, 1], legR: [-10, 10], legL: [20, 6], face: 'shout' },
      { hitbox: frontBox(40, hit(10, 'light', 2, 0, 16), { behind: true }), smear: { from: 5, to: -200, a: 0.5 }, fx: [{ kind: 'slash', x: -6, y: 46, radius: 34, angle: -110 }], ease: 'overshoot' }),
    F(2, { grip: 1, armR: [-60, -94], weapon: -84, armL: [54, -44], torso: -18, head: -12, root: [-5, 1], legR: [-10, 10], legL: [20, 6], face: 'shout' }, { ease: 'out' }),
    F(6, { grip: 1, armR: [-50, -86], weapon: -76, armL: [40, -30], torso: -10, head: -6, root: [-3, 1], legR: [-6, 8], legL: [16, 6], face: 'angry' }, { cancel: 'attack', ease: 'inout' }),
    F(4, { ...CARRY, torso: 6, face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack3: { loop: false, frames: [
    F(4, { grip: 1, armR: [-120, -60], weapon: -56, armL: [-10, -150], torso: -18, head: -10, root: [-2, 1], legR: [6, 4], legL: [-20, 14], face: 'angry' }, { sfx: SW, armor: 1, ease: 'in' }),
    F(3, { grip: 1, armR: [-130, -66], weapon: -60, armL: [-30, -150], torso: -26, head: -12, root: [-3, -1], squash: 0.96, stretch: 1.05, legR: [4, 2], legL: [-24, 18], face: 'shout' }, { armor: 1, ease: 'out' }),
    // hit: the head lands on the floor line in front; groundBounce pops an airborne / falling body off the floor once (GDD 2.1)
    F(3, { grip: 1, armR: [84, -100], weapon: -20, armL: [100, 10], torso: 40, head: 8, root: [6, 2], squash: 1.1, stretch: 0.9, legR: [44, 30], legL: [-30, 34], face: 'shout' },
      { hitbox: frontBox(40, hit(15, 'knockdown', 3, 4, 20, { groundBounce: true })), smear: { from: -175, to: 60, a: 0.55 }, sfx: 'hammer_slam', armor: 1,
        fx: [{ kind: 'dust', x: 30, y: 0, count: 6 }, { kind: 'ring', x: 34, y: 0, r0: 4, r1: 26, flat: true, color: '#ffd080' }], ease: 'overshoot' }),
    F(3, { grip: 1, armR: [86, -98], weapon: -18, armL: [102, 12], torso: 42, head: 8, root: [6, 2], squash: 1.08, stretch: 0.92, legR: [44, 30], legL: [-30, 34], face: 'grit' }, { ease: 'out' }),
    F(10, { grip: 1, armR: [106, -100], weapon: -10, armL: [90, 20], torso: 30, head: 6, root: [5, 2], legR: [38, 22], legL: [-28, 28], face: 'grit' }, { cancel: 'attack', ease: 'inout' }),
    F(4, { ...CARRY, torso: 8, root: [2, 1], face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack4: { loop: false, frames: [
    F(4, { grip: 1, armR: [-84, 100], weapon: 110, armL: [40, 20], torso: 24, head: 6, root: [0, 2], squash: 1.08, stretch: 0.92, legR: [30, 40], legL: [-14, 34], face: 'angry' }, { sfx: 'steam', armor: 1, ease: 'in' }),
    F(3, { grip: 1, armR: [-90, 104], weapon: 114, armL: [46, 24], torso: 28, head: 8, root: [-1, 3], squash: 1.12, stretch: 0.88, legR: [32, 44], legL: [-16, 38], face: 'grit' }, { armor: 1, ease: 'out' }),
    F(4, { grip: 1, armR: [160, 8], weapon: -2, armL: [-40, 20], torso: -16, head: -10, root: [5, -6], squash: 0.94, stretch: 1.08, legR: [26, 4], legL: [-30, 36], face: 'shout' },
      { hitbox: frontBox(40, hit(20, 'launch', 2, 8, 20), { high: true }), smear: { from: 130, to: -80, a: 0.55 }, sfx: 'steam', armor: 1,
        fx: [{ kind: 'ring', x: 26, y: 40, r0: 2, r1: 24, color: '#ffb060' }, { kind: 'steam', x: 26, y: 40, count: 3 }], ease: 'overshoot' }),
    F(3, { grip: 1, armR: [164, 10], weapon: -4, armL: [-44, 20], torso: -18, head: -12, root: [5, -6], squash: 0.96, stretch: 1.05, legR: [26, 4], legL: [-30, 36], face: 'shout' }, { ease: 'out' }),
    F(12, { grip: 1, armR: [130, 58], weapon: 20, armL: [-34, 20], torso: -10, head: -6, root: [4, -1], legR: [20, 10], legL: [-26, 30], face: 'angry' }, { cancel: 'any', ease: 'inout' }),
    F(4, { ...CARRY, torso: 6, root: [2, 0] }, { cancel: 'any', ease: 'out' }),
  ] },

  jumpAttack: { loop: false, frames: [
    F(4, { grip: 1, armR: [-104, -120], weapon: -82, armL: [40, -40], torso: -12, head: -6, legR: [56, -100], legL: [14, -56], face: 'angry' }, { sfx: SW, ease: 'in' }),
    F(5, { grip: 1, armR: [110, -100], weapon: 4, armL: [-30, 10], torso: 26, head: 6, legR: [60, -106], legL: [16, -60], face: 'shout' },
      { hitbox: JUMP_HIT, smear: { from: -170, to: 70, a: 0.5 }, ease: 'overshoot' }),
    F(20, { grip: 1, armR: [114, -98], weapon: 8, armL: [-30, 10], torso: 28, head: 6, legR: [56, -100], legL: [14, -56], face: 'grit' }, { hitbox: JUMP_HIT }),
  ] },
  landAttack: { loop: false, frames: [
    F(2, { grip: 1, armR: [78, -100], weapon: -38, armL: [90, 20], legR: [30, 50], legL: [-20, 50], torso: 30, head: 6, root: [0, 3], squash: 1.18, stretch: 0.82, face: 'shout' },
      { event: 'shockwave', radius: 40, hit: hit(10, 'knockdown', 4, 4, 20), sfx: 'land_heavy', ease: 'out' }),
    F(10, { grip: 1, armR: [90, -100], weapon: -26, armL: [86, 20], legR: [20, 30], legL: [-15, 30], torso: 18, root: [0, 1], face: 'grit' }, { ease: 'inout' }),
    F(6, { ...CARRY, torso: 4 }, { cancel: 'any', ease: 'out' }),
  ] },
  // ---- shoulder charge: 4f crouch, 14f charge with the hammer held high and 3-hit armor, ~120 px knockback (GDD 2.1) ----
  dashAttack: { loop: false, frames: [
    F(4, { armR: [-30, -150], weapon: 30, armL: [-50, 20], torso: 26, head: -6, root: [-2, 2], squash: 1.05, stretch: 0.95, legR: [26, 12], legL: [-24, 14], face: 'angry' }, { sfx: 'steam', armor: 3, ease: 'in' }),
    F(14, { armR: [-40, -150], weapon: 30, armL: [-70, 30], torso: 48, head: -14, root: [6, 2], legR: [60, 20], legL: [-50, 60], face: 'shout' },
      { hitbox: frontBox(40, hit(18, 'knockdown', 6.5, 4, 20)), move: { x: 8 }, armor: 3, fx: [{ kind: 'dust', x: -10, y: 0 }, { kind: 'steam', x: -16, y: 44, count: 2 }] }),
    F(10, { armR: [-30, -150], weapon: 30, armL: [-40, 30], torso: 36, head: -8, root: [6, 2], legR: [-40, 60], legL: [50, 20], face: 'grit' }, { ease: 'out' }),
    F(4, { ...CARRY, torso: 8 }, { cancel: 'any', ease: 'out' }),
  ] },

  // ---- Piston Quake: two-handed overhead slam into the ground, r 60, knockdown to grounded enemies only ----
  // 8f startup (4 in + 4 out) / 4f active / 12f recovery (3 hold + 6 follow-through + 3 return); invulnerable through the active frames
  special: { loop: false, frames: [
    F(4, { grip: 1, armR: [-120, -60], weapon: -56, armL: [-30, -170], torso: -14, head: -8, root: [-2, 1], legR: [10, 6], legL: [-18, 10], face: 'angry' }, { sfx: SW, invuln: true, ease: 'in' }),
    F(4, { grip: 1, armR: [-134, -70], weapon: -62, armL: [-60, -160], torso: -26, head: -14, root: [-3, -2], squash: 0.94, stretch: 1.08, legR: [6, 2], legL: [-22, 16], face: 'shout' }, { invuln: true, ease: 'out' }),
    F(4, { grip: 1, armR: [92, -100], weapon: 6, armL: [106, 8], torso: 44, head: 8, root: [6, 3], squash: 1.14, stretch: 0.86, legR: [48, 34], legL: [-34, 40], face: 'shout' },
      { hitbox: areaBox(60, hit(25, 'knockdown', 5, 4, 24, { groundedOnly: true, otg: true })), invuln: true, sfx: 'hammer_slam', smear: { from: -175, to: 62, a: 0.6 },
        fx: [{ kind: 'ring', x: 0, y: 0, r1: 60, flat: true, color: '#ffb060' }, { kind: 'dust', x: 0, y: 0, count: 8 }, { kind: 'steam', x: 34, y: 6, count: 4 }], ease: 'overshoot' }),
    F(3, { grip: 1, armR: [94, -98], weapon: 8, armL: [104, 12], torso: 42, head: 6, root: [6, 3], squash: 1.1, stretch: 0.9, legR: [48, 34], legL: [-34, 40], face: 'grit' }, { ease: 'out' }),
    F(6, { grip: 1, armR: [106, -100], weapon: -8, armL: [90, 20], torso: 26, head: 4, root: [4, 2], legR: [36, 22], legL: [-26, 26], face: 'grit' }, { ease: 'inout' }),
    F(3, { ...CARRY, torso: 6 }, { cancel: 'any', ease: 'out' }),
  ] },
  // ---- Overpressure: hammer thrust straight up, boiler blows three expanding rings (r 60 / 100 / 140 for 30 + 30 + 40), 45f ----
  // 5 wind-up + 4 thrust + (6 ring + 4 rise) x 2 + 6 ring + 6 settle + 4 return = 45; the SUPER state is invulnerable throughout
  super: (() => {
    // rings 1-2 barely push (kbX 1 / 2) so a body knocked down by ring 1 is still inside rings 2 and 3; otg: a body that already
    // landed (a straggler walking into ring 1 late re-freezes her while the first victims keep falling) is popped up again
    const ring = (r, dmg, kbX, dur = 6) => F(dur, { grip: 1, armR: [148, 56], weapon: 18, armL: [-40, 30], torso: -8, head: -12, root: [0, 2], squash: 1.08, stretch: 0.94, legR: [24, 12], legL: [-24, 12], face: 'shout' },
      { hitbox: areaBox(r, hit(dmg, 'knockdown', kbX, 4, 24, { otg: true }), { y: -90, h: 90 }), sfx: 'steam', ease: 'out',
        fx: [{ kind: 'ring', x: 0, y: 0, r1: r, flat: true, color: '#e8f0f4' }, { kind: 'ring', x: 0, y: 30, r1: r * 0.8, color: '#ffb060' }, { kind: 'steam', x: -12, y: 60, count: 6 }] });
    const rise = (dur) => F(dur, { grip: 1, armR: [144, 52], weapon: 14, armL: [-30, 30], torso: -4, head: -8, root: [0, 1], squash: 0.96, stretch: 1.05, legR: [16, 6], legL: [-16, 6], face: 'grit' }, { ease: 'in' });
    return { loop: false, frames: [
      F(5, { grip: 1, armR: [-84, 100], weapon: 110, armL: [30, 30], torso: 20, head: 6, root: [0, 2], squash: 1.1, stretch: 0.9, legR: [26, 30], legL: [-20, 30], face: 'angry' }, { sfx: 'super_brunhild', ease: 'in' }),
      F(4, { grip: 1, armR: [144, 54], weapon: 16, armL: [-30, 30], torso: -6, head: -10, root: [0, 0], squash: 0.94, stretch: 1.08, legR: [14, 4], legL: [-14, 4], face: 'shout' }, { smear: { from: 110, to: -95, a: 0.5 }, ease: 'overshoot' }),
      ring(60, 30, 1), rise(4), ring(100, 30, 2), rise(4), ring(140, 40, 7),
      F(6, { grip: 1, armR: [136, 50], weapon: 12, armL: [-30, 20], torso: 0, head: -6, root: [0, 1], face: 'happy' }, { ease: 'inout' }),
      F(4, { ...CARRY, torso: 6 }, { ease: 'out' }),
    ] };
  })(),

  dodge: { loop: false, frames: [
    F(4, { ...READY, armR: [58, -130], weapon: -122, torso: 30, root: [0, 3, 0], legR: [40, 40], legL: [-20, 40], face: 'grit', squash: 1.08, stretch: 0.92 }, { sfx: 'dodge', ease: 'in' }),
    F(5, { torso: 24, head: 6, root: [4, -54, 120], legR: [100, 70], legL: [80, 90], armR: [70, -110], weapon: -30, armL: [60, 60], face: 'closed' }),
    F(5, { torso: 30, head: 10, root: [12, -40, 240], legR: [100, 70], legL: [80, 90], armR: [70, -110], weapon: -30, armL: [60, 60], face: 'closed' }),
    F(5, { torso: 40, root: [6, -6, 360], legR: [60, 40], legL: [30, 40], armR: [60, -110], weapon: -30, armL: [50, 60], face: 'closed' }, { ease: 'out' }),
    F(7, { ...CARRY, torso: 10, root: [0, 2, 360], legR: [18, 20], legL: [-12, 16], squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
  ] },
  taunt: { loop: false, frames: [
    F(8, { armR: [80, 30], weapon: 80, armL: [-12, 20], torso: 6, head: 2, legR: [12, 4], legL: [-12, 4], face: 'neutral' }, { ease: 'out' }),
    F(18, { armR: [78, 34], weapon: 84, armL: [-30, -80], torso: 8, head: -8, legR: [10, 2], legL: [-14, 6], root: [1, 1], face: 'happy' }, { sfx: 'steam', fx: [{ kind: 'steam', x: -16, y: 62, count: 3 }], ease: 'inout' }),
    F(18, { armR: [80, 32], weapon: 82, armL: [-34, -76], torso: 10, head: -4, legR: [10, 2], legL: [-14, 6], root: [1, 2], face: 'happy' }, { ease: 'inout' }),
    F(16, { armR: [78, 34], weapon: 84, armL: [-30, -80], torso: 8, head: -8, legR: [10, 2], legL: [-14, 6], root: [1, 1], face: 'happy' }, { event: 'meterGain', ease: 'inout' }),
  ] },

  // ---- grabs / throws ----
  grab: { loop: false, frames: [
    F(4, { ...CARRY, armL: [40, 40], torso: 6, root: [0, 0], face: 'angry' }, { ease: 'in' }),
    F(4, { armR: [76, 24], weapon: -100, armL: [84, 16], torso: 16, root: [3, 0], legR: [26, 8], legL: [-20, 14], face: 'angry' },
      { hitbox: { x: 4, y: -60, w: 36, h: 56, z: 20, type: 'grab', once: true, damage: 0 }, sfx: 'hit_grab', ease: 'out' }),
  ] },
  grabHold: { loop: true, frames: [
    F(16, { armR: [76, 24], weapon: -100, armL: [84, 16], torso: 12, root: [0, 0], legR: [22, 6], legL: [-20, 12], face: 'angry' }, { ease: 'inout' }),
    F(16, { armR: [78, 26], weapon: -100, armL: [86, 18], torso: 14, root: [0, 1], legR: [22, 6], legL: [-20, 12], face: 'angry' }, { ease: 'inout' }),
  ] },
  grabHit: { loop: false, frames: [
    F(4, { armR: [76, 24], weapon: -100, armL: [84, 16], torso: -8, head: -14, root: [-2, 0], legR: [20, 6], legL: [-20, 12], face: 'angry' }, { ease: 'in' }),
    F(4, { armR: [76, 24], weapon: -100, armL: [84, 16], torso: 28, head: 14, root: [4, 1], legR: [30, 10], legL: [-24, 18], face: 'shout' }, { sfx: 'hit_medium', ease: 'overshoot' }),
    F(6, { armR: [76, 24], weapon: -100, armL: [84, 16], torso: 12, root: [0, 0], legR: [22, 6], legL: [-20, 12], face: 'angry' }, { ease: 'out' }),
  ] },
  // forward throw: hammer-golf swing from the ground up
  throw: { loop: false, frames: [
    F(5, { grip: 1, armR: [-22, -96], weapon: -46, armL: [-20, 40], torso: 20, head: 6, root: [-2, 1], squash: 1.06, stretch: 0.94, legR: [28, 34], legL: [-14, 30], face: 'angry' }, { ease: 'in' }),
    F(6, { grip: 1, armR: [120, 60], weapon: 30, armL: [-40, 20], torso: -12, head: -8, root: [6, -2], squash: 0.96, stretch: 1.06, legR: [24, 6], legL: [-30, 34], face: 'shout' },
      { sfx: 'throw', smear: { from: 120, to: -60, a: 0.5 }, ease: 'overshoot' }),
    F(10, { grip: 1, armR: [132, 50], weapon: 28, armL: [-34, 20], torso: -8, head: -6, root: [6, 0], legR: [20, 8], legL: [-26, 30], face: 'angry' }, { ease: 'out' }),
    F(4, { ...CARRY, torso: 6 }, { ease: 'out' }),
  ] },
  // back throw: piledriver — hoist the hammer straight up (both hands), then slam its head onto the floor behind her
  // (pose audit: head at (-42, -3), grip reachable, face clear of the near arm); the body is released mid-slam (releaseAt 8)
  throwBack: { loop: false, frames: [
    F(5, { grip: 1, armR: [-165, 10], weapon: 10, armL: [-150, -10], torso: -22, head: -10, root: [-3, 1], squash: 0.95, stretch: 1.06, legR: [10, 4], legL: [-10, 4], face: 'angry' }, { ease: 'in' }),
    F(6, { grip: 1, armR: [-60, 20], weapon: -60, armL: [-120, -20], torso: -30, head: -8, root: [-6, 2], squash: 1.12, stretch: 0.88, legR: [-26, 36], legL: [30, 34], face: 'shout' },
      { sfx: 'throw', smear: { from: -90, to: -230, a: 0.5 }, fx: [{ kind: 'dust', x: -42, y: 0, count: 6 }], ease: 'overshoot' }),
    F(10, { grip: 1, armR: [-62, 22], weapon: -58, armL: [-120, -20], torso: -32, head: -6, root: [-6, 2], legR: [-26, 36], legL: [30, 34], face: 'grit' }, { ease: 'out' }),
    F(4, { ...CARRY, torso: 6 }, { ease: 'out' }),
  ] },

  // ---- damage / defeat ----
  hurt: { loop: false, frames: [
    F(4, { ...CARRY, torso: -26, head: -24, armL: [-60, -30], armR: [34, -10], weapon: -50, root: [-5, 1], legR: [22, 4], legL: [-14, 12], face: 'hurt' }, { ease: 'out' }),
    F(10, { ...CARRY, torso: -12, head: -10, armL: [-30, -10], armR: [26, -4], weapon: -58, root: [-2, 1], legR: [14, 2], legL: [-10, 8], face: 'hurt' }, { ease: 'out' }),
    F(6, { ...CARRY, torso: 0, face: 'angry' }, { ease: 'out' }),
  ] },
  hurtAir: { loop: true, frames: [
    F(6, { armR: [-90, -40], weapon: 40, armL: [-100, -30], torso: -30, head: -25, legR: [40, 40], legL: [10, 60], root: [0, 0, -15], face: 'hurt' }, { ease: 'inout' }),
    F(6, { armR: [-100, -50], weapon: 50, armL: [-110, -30], torso: -35, head: -30, legR: [50, 30], legL: [20, 50], root: [0, 0, -25], face: 'hurt' }, { ease: 'inout' }),
  ] },
  knockdown: { loop: true, frames: [
    F(8, { armR: [-60, -40], weapon: 40, armL: [-80, -30], torso: -50, head: -20, legR: [50, 30], legL: [30, 50], root: [0, -6, -25], face: 'hurt' }, { ease: 'inout' }),
    F(8, { armR: [-70, -50], weapon: 50, armL: [-90, -30], torso: -55, head: -25, legR: [60, 20], legL: [40, 40], root: [0, -6, -35], face: 'hurt' }, { ease: 'inout' }),
  ] },
  lying: { loop: true, frames: [
    F(16, { ...FLOORED }, { ease: 'inout' }),
    F(16, { ...FLOORED, torso: 6, head: -12 }, { ease: 'inout' }),
  ] },
  getup: { loop: false, frames: [
    F(8, { ...FLOORED }, { ease: 'in' }),
    F(8, { armR: [60, 40], weapon: 30, armL: [-30, 40], torso: 30, head: -10, legR: [70, 60], legL: [-20, 60], root: [8, 4, -20], face: 'grit', squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
    F(6, { ...CARRY, torso: 8, root: [0, 1], legR: [15, 20], legL: [-10, 15], face: 'angry' }, { ease: 'out' }),
  ] },
  dead: { loop: false, frames: [
    F(60, { ...FLOORED, torso: 8, head: -14, legR: [6, 4], legL: [-6, 6], root: [30, -9, -90] }),
  ] },
  // win (GDD 6 results poses): a hop with the hammer raised, then she reaches back and opens the boiler valve — and gets
  // the steam in the face (eyes shut, head snapped back, beard chain swings)
  win: { loop: true, frames: [
    F(6, { armR: [-160, -10], weapon: -20, armL: [-20, 10], torso: -4, head: -6, root: [0, 3], squash: 1.08, stretch: 0.92, legR: [12, 10], legL: [-12, 10], face: 'happy' }, { ease: 'out' }),
    F(10, { armR: [-176, -20], weapon: -30, armL: [-40, -60], torso: -8, head: -12, root: [0, -8], squash: 0.96, stretch: 1.06, legR: [30, -50], legL: [-10, -30], face: 'happy' }, { ease: 'out' }),
    F(6, { armR: [-170, -16], weapon: -26, armL: [-30, -40], torso: -6, head: -10, root: [0, -3], legR: [20, -20], legL: [-10, -10], face: 'happy' }, { ease: 'in' }),
    F(4, { armR: [-160, -10], weapon: -20, armL: [-20, 10], torso: -4, head: -6, root: [0, 4], squash: 1.1, stretch: 0.9, legR: [14, 14], legL: [-14, 14], face: 'happy' }, { ease: 'out' }),
    F(12, { armR: [-164, -12], weapon: -22, armL: [-24, 8], torso: -5, head: -8, root: [0, 1], legR: [10, 4], legL: [-10, 4], face: 'happy' }, { ease: 'inout' }),
    // reach back to the valve
    F(10, { armR: [40, -30], weapon: -110, armL: [-140, 20], torso: -8, head: 8, root: [0, 1], legR: [10, 4], legL: [-10, 4], face: 'neutral' }, { ease: 'inout' }),
    // valve opens: the boiler blasts, she flinches away from it with her eyes shut
    F(14, { armR: [46, -34], weapon: -112, armL: [-144, 24], torso: 10, head: -26, root: [2, 2], squash: 1.05, stretch: 0.95, legR: [14, 6], legL: [-12, 6], face: 'closed' },
      { sfx: 'steam', fx: [{ kind: 'steam', x: -20, y: 62, count: 8 }, { kind: 'steam', x: -4, y: 66, count: 4 }], ease: 'out' }),
    F(12, { armR: [30, -20], weapon: -104, armL: [-60, -40], torso: 2, head: -8, root: [0, 1], legR: [10, 4], legL: [-10, 4], face: 'happy' }, { ease: 'inout' }),
  ] },
};

/** Brunhild Coalheart character definition. */
export const brunhild = {
  id: 'brunhild', name: 'BRUNHILD', fullName: 'Brunhild Coalheart', title: 'THE BOILERWRIGHT', archetype: 'TANK',
  stats: { power: 5, speed: 2, health: 5, range: 3, technique: 2 },
  maxHp: hpFor(5), walkSpeed: speedFor(2), runSpeed: speedFor(2) * 1.7, jumpVy: JUMP_VY, reach: 40, grabReach: 20, grabOffset: 26,
  freeChain: true,
  // Heavy Frame (GDD 2.1): 15 % less damage taken; knockdown / launch hits under 10 dmg (Sootborn lights) become heavy flinches
  // instead of knocking her down; `armor: 1` on combo hits 3-4 absorbs one hit each (armorHits is the default for `armor: true`)
  traits: { damageTakenMult: 0.85, ignoreKnockdownBelow: 10, armorHits: 1, grabReach: 20 },
  build,
  anims,
  moves: {
    special: { name: 'PISTON QUAKE', cost: METER.special }, super: { name: 'OVERPRESSURE', cost: METER.super, damage: 100 },
    // forward: hammer-golf swing released on the smear key (frame 5), ~200 px flight (measured 203); back: piledriver released
    // mid-slam (frame 8) — a short, hard drop right behind her (vx 3 still counts as a thrown body) plus the 40 px shockwave
    throwFwd: { damage: 20, vx: 9, vy: 5, releaseAt: 5 }, throwBack: { damage: 22, vx: 3, vy: 3, releaseAt: 8, shockwave: { r: 40, damage: 10 } }, grabHit: { damage: 8, hits: 3 },
  },
  sfx: { special: 'special_brunhild', super: 'super_brunhild', swing: 'hammer_swing' },
  portrait,
};
