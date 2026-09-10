// Pip Gearlock & The Rig — Grappler (GDD 2.4). A gnome tinkerer riding a 7-foot exo-rig: her 18 px head (red hat, braid)
// sits in an open cockpit cage on top of a scaffold torso with a brass boiler and a pressure gauge (needle = her meter),
// oversized piston arms ending in two-prong claws, piston legs on plate feet, two exhaust stacks that puff every 20 frames
// and a lantern swinging from the rear strut. Hand-authored cel-shaded rig + full animation set.
//
// Moveset numbers come straight from GDD 2.4:
//   combo   claw swat 12 (8f startup, hitstun 18) -> double-claw clap 14 (front + back, stagger) -> piston uppercut 18 (launcher). Reach 40.
//   jump    butt-stomp 16 + 30 px landing shockwave (knockdown)      dash   Grapple Shot: chained claw 140 px at 6 px/f, 6 dmg, reels the
//           first enemy into her grab over 12f (projectile kind 'grapple', onHit 'reel')
//   special Steam Vent: 80 px cone, 4 x 6, ~20 px pushback per hit, extinguishes fire puddles, 10f startup
//   super   Wrecking Ball: grabs the nearest enemy (else a rubble ball), 3 vertical circles (r ~70, 20 per rotation to all touched),
//           hurls it 300 px for 40; 70f, invulnerable (the orbit is driven by hooks.onUpdate, the throw by the core's wreckThrow)
//   grab    forward = hurl 220 px as a projectile (20); back = piledriver (25 + 40 px shockwave); Attack while holding = Crush 3 x 8
//   trait   Grab Armor: armored grab startup, reach 30, grabAll (Wardens / Hulks), grab damage +25 %
//
// Readability (docs/ART_STYLE.md section 0) — the value ladder, darkest to brightest, so every touching pair separates and the
// eye lands on the PILOT first: recessed iron panel < dark gunmetal FRAME (chassis, cage posts, hips, stacks) < mid blue-slate
// PISTON LEGS on near-black plate feet with light-steel shin rods < warm brass CLAW ARMS (light cylinder, dark bronze piston
// sleeve, pale rod, brass claw) < Pip herself (oxblood coat < warm brown braid < red hat < the brightest thing on the rig,
// her face). The arms are the only warm metal and the legs the only cool one, so the two limb pairs never read as one
// scaffold; brass is spent on the claws and three small trims, never sprayed over the frame. The cockpit cage is two thin
// dark posts and a back rail — a window around her head, nothing across her face. Ground keys use G(): root.y is solved
// so the lowest foot plate sits on the floor (spec.root[1] is an extra sink), so the long piston legs never float.
import { speedFor, hpFor, areaBox, frontBox, P, F, hit } from './common.js';
import { JUMP_VY, METER, ST } from '../../constants.js';
import { celRect, celBall, celPoly, celCapsule, tones, flat, band, outlinePath } from '../../art/shading.js';
import { pathTaperedCapsule } from '../../art/shapes.js';
import { drawSkull, drawFace } from '../../art/rigParts.js';
import { getChain } from '../../art/secondary.js';
import { buildRig, computeJoints, jointScreen } from '../../art/rig.js';
import { makePose } from '../../art/poses.js';
import { drawHeadPortrait } from '../../art/portraits.js';
import { audio } from '../../engine/audio.js';
import { dsin, dcos } from '../../engine/trig.js';
import { rad } from '../../engine/math.js';

// GDD 2.4 hues, re-spaced for value (ART_STYLE section 0.1). Every extra key is part of the palette object so farPalette()
// darkens it on the far side too (a far claw or far shin must never take a module constant).
// skin: the brightest tone on the rig   hair: ginger braid   primary: FRAME, the mid-dark anchor (dark enough to sit under
// everything, light enough that the chassis still reads as a machine against a night backdrop instead of a black hole)
// secondary: mid blue-slate thigh   accent: brass claws + trims   metal: light steel shin rod / ball joints / trims   dark: foot plate
// iron: recessed panel / knee sleeves / stacks / lantern (the darkest band, always a joint or a recess)   bronze: dark brass (piston sleeves, demoted trims)
// rod: pale brass forearm piston rod   glow: boiler fire
// Saturation pass: primary is her single largest mass (18.4 % of painted area - chassis, cage posts, hips, stacks) and
// at #464F63 it was almost achromatic (Oklab C 3.5), so all of it fell in the low-chroma core of the colour lattice
// that every polychrome backdrop also occupies. #283A63 holds the hue (265 deg) and moves chroma (C 3.5 -> 7.5,
// s 29 -> 60) while dropping 7 L* to 35.5, which puts the frame under every stage floor band instead of inside the
// Foundry's (31), the Mooring's (33) and the Gas-Halls' (31). The frame still reads as a machine and not as a black
// hole: it clears the INK #1B1820 by 13.9 Oklab L*, and the iron recess panels that sit inside it (#2C3242, L* 31.8)
// separate from it on their own 1 px outline, which is what section 0.2 says a recess should do.
// EDIT AT SOURCE: the torso/hips/back hooks read this module constant directly, not info.pal, so a build.palette
// override would not reach them - the literal here is the only place primary can be changed.
// secondary (the thighs) #7C8AA4 -> #6E86AC for the same reason at the other end of the ladder: s 24 -> 36 with the
// lightness held (L* 63.1 -> 61.6), so the second-largest cool mass also leaves the neutral core. Still under the
// 40 % neutral ceiling, so it is still blue-slate machined metal and not a painted panel.
const PAL = {
  skin: '#FBE7CC', hair: '#6E3A1E', primary: '#283A63', sleeve: '#C89A3A', secondary: '#6E86AC', accent: '#D2A63E',
  metal: '#B8C6DE', dark: '#333A4A', glow: '#E86A1E', iron: '#2C3242', bronze: '#7A5824', rod: '#E8CE8C',
};
const HAT = '#D6483F', JACKET = '#7A3A34', GAUGE = '#59C3A0', STEAM = '#B9C6D0', HOT = '#FFD27A', BROW = '#4A2A16', LAMP = '#E0A038', INK = '#1B1820';
const R = Math.round, TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------------------
// Rig parts
// ---------------------------------------------------------------------------------------------------------------
/** One steam puff: three merged discs, no outline (fillStyle already set). */
function puff(ctx, x, y, r, alpha) {
  if (alpha <= 0.02) return;
  ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.arc(x - r * 0.8, y + r * 0.45, r * 0.7, 0, TAU); ctx.arc(x + r * 0.75, y + r * 0.5, r * 0.6, 0, TAU); ctx.fill();
}
/** Rising puff column from (x, y): one puff every 20 ticks (phase-shifted), bigger and denser while rig.vent > 0. */
function stackPuffs(ctx, rig, x, y, phase) {
  const f = (rig.tick + phase) % 20, k = f / 20, a0 = ctx.globalAlpha, big = rig.vent > 0 ? 1.9 : 1;
  ctx.fillStyle = tones(rig, STEAM).base;
  puff(ctx, x - k * 3, y - k * 14 * big, (1.5 + k * 3.5) * big, a0 * (0.42 - k * 0.36));
  if (f > 10) { const k2 = (f - 10) / 20; puff(ctx, x - k2 * 2, y - k2 * 9 * big, (1.2 + k2 * 2.5) * big, a0 * (0.3 - k2 * 0.26)); }
  ctx.globalAlpha = a0;
}
/**
 * Head: ginger braid (behind), skull with the pointed gnome ear, then her little body on the seat with one hand on the
 * drive lever. She is the focal point of the whole rig, so everything in here is warm and light against the dark frame and
 * the cockpit stays uncluttered: one jacket block, one arm, one lever — no red on anything but the hat.
 */
function drawHead(ctx, rig, pose, inf) {
  const r = inf.r;
  // braid: two lagging clumps hanging back from under the hat (rest [-0.7, 0.7]; stiff = the 2f lag of the GDD)
  const ch = getChain(rig, 'braid', 2, { joint: 'head', rest: [-0.7, 0.7], stiffness: 0.2, damping: 0.66, gain: 2.2, rotGain: 0.6, maxAng: 40 });
  ctx.save(); ctx.translate(R(-r * 0.8), R(r * 0.05)); ctx.rotate(Math.atan2(0.7, -0.7));
  for (let i = 0; i < 2; i++) {
    ctx.rotate(rad(ch.ang[i]));
    ctx.beginPath(); ctx.moveTo(0, -3 + i); ctx.lineTo(7, -2 + i); ctx.lineTo(8 + (i ? 2 : 0), 0); ctx.lineTo(7, 2 - i); ctx.lineTo(0, 3 - i); ctx.closePath(); flat(ctx, rig, PAL.hair);
    if (i === 0 && !rig.override) { ctx.fillStyle = rig.col(PAL.accent); ctx.fillRect(5, -2, 3, 4); }
    ctx.translate(7, 0);
  }
  ctx.restore();
  // her body under the chin: leather jacket block on the seat, one arm forward to a short bronze drive lever
  const by = R(r * 0.8);
  celRect(ctx, rig, -7, by, 14, 11, 2, JACKET, 0.36, 0.25);
  celCapsule(ctx, rig, 2, by + 3, R(r * 0.9), by + 6, 2.5, JACKET, 0);
  celBall(ctx, rig, R(r * 1.0), by + 6, 2.5, PAL.skin, false);
  ctx.beginPath(); ctx.rect(R(r * 1.1), by, 3, 7); flat(ctx, rig, PAL.bronze);
  drawSkull(ctx, rig, r, PAL.skin, PAL.hair, { jaw: 0.4 });
  // gnome ear: one pointed wedge sticking back under the hat brim
  ctx.beginPath(); ctx.moveTo(R(-r * 0.5), R(r * 0.05)); ctx.lineTo(R(-r * 1.3), R(-r * 0.35)); ctx.lineTo(R(-r * 0.6), R(r * 0.4)); ctx.closePath();
  flat(ctx, rig, PAL.skin);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, PAL.skin).sh; ctx.fillRect(R(-r * 0.95), R(-r * 0.05), 3, 2);
  ctx.fillStyle = tones(rig, JACKET).sh; ctx.fillRect(-6, by + 8, 12, 2);
}
/** Big-feature face (5x4 whites, 2 px brows) on the 18 px head. */
function drawFaceP(ctx, rig, pose, inf) {
  drawFace(ctx, rig, inf.r, pose.face | 0, { big: true, brow: BROW, eyeY: 1 });
}
/** Red pointed hat with one brass band, brim lifted clear of the brow row (head space, drawn after the face). */
function drawHat(ctx, rig, pose, inf) {
  const r = inf.r, brim = R(-r * 0.85);
  celPoly(ctx, rig, [R(-r * 1.15), brim + 2, R(-r * 0.9), brim - 3, R(-r * 0.55), -r - 10, R(r * 0.55), brim - 3, R(r * 1.15), brim + 2], HAT, 0.38, 0.28);
  if (rig.override) return;
  const tb = tones(rig, PAL.accent);
  band(ctx, rig, R(-r * 0.95), brim - 3, R(r * 1.9), 4, tb.base);   // brass on felt: inked (0.2), widened 3 -> 4 px (0.7)
  ctx.fillStyle = tb.sh; ctx.fillRect(R(-r * 0.95), brim, R(r * 1.9), 1);
}
/** Seat plate at the top of the frame (neck space). */
function drawSeat(ctx, rig) { ctx.beginPath(); ctx.rect(-7, -2, 14, 4); flat(ctx, rig, PAL.iron); }
/**
 * Scaffold torso: the dark gunmetal FRAME is the anchor of the whole value ladder, with a still darker recessed panel, a
 * bronze boiler drum with its fire window and the green pressure gauge (needle = her meter) as the one bright accent on it.
 */
function drawTorso(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2);
  celRect(ctx, rig, -hw, -H, W, H + 2, 3, PAL.primary, 0.36, 0.28);
  ctx.beginPath(); ctx.rect(-hw + 5, -H + 8, W - 10, H - 13); flat(ctx, rig, PAL.iron);
  celBall(ctx, rig, 0, -7, 6.5, PAL.bronze);
  celBall(ctx, rig, -2, -17, 5, PAL.bronze, false);
  if (rig.override) return;
  const tb = tones(rig, PAL.bronze), ti = tones(rig, PAL.iron);
  // one bronze collar band across the frame top; the panel keeps a single lit seam
  ctx.fillStyle = tb.base; ctx.fillRect(-hw + 1, -H + 1, W - 2, 3);
  ctx.fillStyle = tb.sh; ctx.fillRect(-hw + 1, -H + 3, W - 2, 1);
  ctx.fillStyle = ti.hi; ctx.fillRect(-hw + 5, -H + 8, 1, H - 13);
  // boiler fire window: dark slot, orange fire, hot core that pulses (rig.tick) and swells while venting
  const hot = rig.vent > 0 || (rig.tick % 16) < 8;
  ctx.fillStyle = rig.col('#241a1c'); ctx.fillRect(-4, -10, 8, 7);
  ctx.fillStyle = rig.col(PAL.glow); ctx.fillRect(-3, -9, 6, 5);
  ctx.fillStyle = rig.col(HOT); if (hot) ctx.fillRect(-2, -8, 4, 3); else ctx.fillRect(-1, -7, 2, 2);
  // gauge: green dial on the bronze bezel, needle sweeps -120..120 deg with the meter (rig.meterFrac, hooks.onUpdate)
  ctx.fillStyle = rig.col(GAUGE); ctx.beginPath(); ctx.arc(-2, -17, 3.8, 0, TAU); ctx.fill();
  ctx.fillStyle = tones(rig, GAUGE).sh; ctx.fillRect(-5, -15, 6, 2);
  const fr = rig.meterFrac != null ? rig.meterFrac : 0.35;
  ctx.save(); ctx.translate(-2, -17); ctx.rotate(rad(-120 + 240 * fr)); ctx.fillStyle = rig.col(INK); ctx.fillRect(-1, -4, 2, 5); ctx.restore();
}
/** Frame crossbar with a light-steel band and a dark iron hip block (hip space). Both are kept shallow on purpose: a deep
 *  hip swallowed the top half of each thigh and the legs lost their upper segment. */
function drawHips(ctx, rig, pose, inf) {
  const hw = R(inf.w / 2);
  celRect(ctx, rig, -hw, -5, inf.w, 8, 2, PAL.primary, 0.4, 0.25);
  ctx.beginPath(); ctx.rect(-5, -6, 10, 9); flat(ctx, rig, PAL.iron);
  if (rig.override) return;
  // The light-steel pelvis band stays a BARE fill. Inking it (the section 0.2 treatment every other boundary in the
  // cast got this pass) costs one stroke, and pip's idle #0 is at 52 cel shapes against a bound of 52: geom/draw-budget
  // goes red at 53. This is the one place where 0.2 and section 9 actually collide, and section 9 wins -- the band is
  // 3 px of light steel inside a light-steel hip plate, i.e. the cheapest boundary in the cast to leave un-inked.
  ctx.fillStyle = rig.col(PAL.metal); ctx.fillRect(-hw + 2, -3, inf.w - 4, 3);
  ctx.fillStyle = tones(rig, PAL.iron).hi; ctx.fillRect(-4, -5, 8, 1);
}
/**
 * Append one of Pip's square piston housings to the CURRENT path as a subpath (never begins a path of its own, so a
 * segment silhouette can be assembled from a housing plus its rod and stroked once). Deliberately a boxy rounded
 * rect and not a capsule: the frame is machinery bolted around a small person, and a housing that rounds off into a
 * tube stops reading as a bolted-on block. Winding matches pathTaperedCapsule's, so `fill()` unions the two.
 */
function pistonBlock(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
/**
 * The one shadow step a piston housing gets: the housing shrunk toward the far corner (celBall / celCapsule's own
 * idiom), so it touches the two edges away from the light and can never leave the block. One fillRect, no clip of
 * its own, and no line — a tone step INSIDE one material is form, not a boundary (ART_STYLE section 0.2).
 */
function blockShade(ctx, rig, x, y, w, h, hex) {
  const k = 0.62, hw = w / 2, hh = h / 2, cx = x + hw, cy = y + hh;
  ctx.fillStyle = tones(rig, hex).sh;
  ctx.fillRect(cx - rig.light.x * hw * (1 - k) - hw * k, cy - rig.light.y * hh * (1 - k) - hh * k, w * k, h * k);
}
/** Light-steel ball joint — the same machined metal as the shin rods, so the eye reads "this is where a limb starts".
 *  Cool and bright against both the dark frame behind it and the warm brass upper arm in front; small enough to stay a joint. */
function drawShoulder(ctx, rig, pose, inf) { celBall(ctx, rig, 0, 0, inf.r - 2.5, inf.pal.metal); }
/** Upper arm: one light brass cylinder. The dark bronze at the elbow belongs to the FOREARM (drawArmLower), where it is
 *  part of that segment's silhouette; this cylinder butts straight against it, so the only line between them is the
 *  forearm's own outline — one segment, one contour (section 0.2). */
function drawArmUpper(ctx, rig, pose, inf) {
  celRect(ctx, rig, -inf.r, -2, inf.r * 2, inf.len + 3, 3, inf.pal.sleeve, 0.36, 0.28);
}
/**
 * Forearm: ONE object — a square dark-bronze piston housing at the elbow with a long pale brass rod sliding out of it
 * to the wrist. The rod is the longer and lighter of the two on purpose: a piston reads as a limb, two equal blocks
 * read as a scaffold.
 *
 * It used to be a capsule and a rounded rect drawn as two separately outlined shapes, so the forearm wore an ink line
 * across itself where the rod met the housing and read as two parts bolted end to end. Housing and rod now go into
 * ONE path, stroked once and filled once (section 0.2), and the bronze is painted afterwards INSIDE that silhouette as
 * a colour change with no line of its own. The clip is what declares that: section 0.2's material-change exception
 * only accepts an unoutlined fill when it is clipped inside a path that has itself been inked, and "the block happens
 * to land inside the union anyway" is how a real boundary gets faked by accident later.
 *
 * The housing is deliberately KEPT, and kept square. It is this rig's ONE material crossing on the forearm (section
 * 0.7): ~7 x 10 px, well over the 4 px floor, and it sits ON the elbow, which is where a piston really does change
 * material. geom/limb-crossings used to read it the other way round — it scores "the limb's material" by the biggest
 * single recorded mark, and celRect's clipped tone band records its pre-clip rect, which made the 7 px housing measure
 * as the forearm and the whole rod measure as a band crossing it 9 px from the elbow. With the segment drawn as one
 * shape that inversion is gone: the rod is the limb, the housing is the crossing, and the crossing is on the joint.
 */
function drawArmLower(ctx, rig, pose, inf) {
  const r = inf.r, L = inf.len, pal = inf.pal, rr = r * 0.72;
  pathTaperedCapsule(ctx, 0, 3, 0, L + 1, rr, rr);   // the pale rod, out to the wrist
  pistonBlock(ctx, -r, -2, r * 2, 7, 2);             // the bronze housing, bolted over the elbow
  outlinePath(ctx, rig);
  ctx.fillStyle = rig.col(tones(rig, pal.rod).base);
  ctx.fill();
  if (rig.override) return;
  ctx.save(); ctx.clip();                            // the silhouette just stroked above is still the current path
  ctx.fillStyle = tones(rig, pal.bronze).base; ctx.fillRect(-r, -2, r * 2, 7);
  blockShade(ctx, rig, -r, -2, r * 2, 7, pal.bronze);
  ctx.restore();
}
/** Two-prong brass claw (hand space, origin at the wrist). Dark bronze wrist block, brass prongs; opens by rig.claw. */
function drawClaw(ctx, rig, pose, inf) {
  const pal = inf.pal;
  celRect(ctx, rig, -3, -5, 8, 10, 2, pal.bronze, 0.38, 0.25);
  if (rig.clawFired && !inf.far) { if (!rig.override) { ctx.fillStyle = rig.col(INK); ctx.fillRect(3, -3, 3, 6); } return; } // the claw is out on the chain
  // 15 px prongs, not 20: at rest the claws hang beside the shins, and a long splayed fan there buried both piston legs
  const open = rig.claw != null ? rig.claw : 0.3, g = 1.5 + 6 * open;
  celPoly(ctx, rig, [3, -5, 8, -6 - g * 0.6, 14, -3 - g, 15, -1 - g, 11, -1 - g * 0.4, 7, -1], pal.accent, 0.4, 0.25);
  celPoly(ctx, rig, [3, 5, 8, 6 + g * 0.6, 14, 3 + g, 15, 1 + g, 11, 1 + g * 0.4, 7, 1], pal.accent, 0.4, 0.25);
}
/** Thigh: the widest segment of the leg — mid blue-slate cylinder with a light steel collar at the hip (limb space).
 *  Thigh wider than knee sleeve wider than shin rod gives the leg a taper, so it reads as a piston and not as a stack. */
function drawLegUpper(ctx, rig, pose, inf) {
  const r = inf.r + 1.5, L = inf.len;
  celRect(ctx, rig, -r, -2, r * 2, L + 3, 2, inf.pal.secondary, 0.38, 0.25);
  if (rig.override) return;
  // steel collar on a slate thigh: a material change, so it takes its own ink (0.2) at 4 px rather than 3 (0.7)
  band(ctx, rig, -r + 1, 0, r * 2 - 2, 4, inf.pal.metal);
}
/**
 * Shin: the same one-object piston as the forearm, in the leg's cool metals — a long light-steel rod sliding out of a
 * short near-black knee sleeve. The rod is the brightest thing below the hip line, so both legs are findable in one
 * glance even with a claw hanging beside them, and the sleeve is the darkest band on the rig, which is what makes the
 * knee read as a knee.
 *
 * Sleeve and rod are one path, stroked once and filled once; the iron is painted inside that silhouette under a clip,
 * with no outline of its own (section 0.2 — see drawArmLower for the argument, which is the same one). The sleeve is
 * this rig's ONE crossing on the shin (section 0.7): 6 x 9 px, over the 4 px floor, sitting ON the knee. Before this it
 * was a separately outlined block butted against a separately outlined rod, and the shin carried an ink line across
 * itself mid-way down; geom/limb-crossings scored the 6 px sleeve as the shin's material and the whole rod as a band
 * crossing it 8.5 px from the knee.
 */
function drawLegLower(ctx, rig, pose, inf) {
  const r = inf.r + 1, L = inf.len, pal = inf.pal, rr = r * 0.7;
  pathTaperedCapsule(ctx, 0, 3, 0, L + 1, rr, rr);   // the light-steel rod, out to the ankle
  pistonBlock(ctx, -r, -2, r * 2, 6, 2);             // the iron knee sleeve the rod slides out of
  outlinePath(ctx, rig);
  ctx.fillStyle = rig.col(tones(rig, pal.metal).base);
  ctx.fill();
  if (rig.override) return;
  ctx.save(); ctx.clip();
  ctx.fillStyle = tones(rig, pal.iron).base; ctx.fillRect(-r, -2, r * 2, 6);
  blockShade(ctx, rig, -r, -2, r * 2, 6, pal.iron);
  ctx.restore();
}
/** Plate foot: near-black plate with a light steel toe cap and a 2 px sole (ankle space). */
function drawPlateFoot(ctx, rig, pose, inf) {
  const heel = R(inf.w * 0.4), toe = R(inf.w * 0.6), top = -inf.h, sole = 2;
  celPoly(ctx, rig, [-heel, top, toe - 3, top, toe, top + 3, toe, sole, -heel, sole], inf.pal.dark, 0.34, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(inf.pal.metal); ctx.fillRect(toe - 6, top + 1, 5, 4);
  ctx.fillStyle = tones(rig, inf.pal.dark).deep; ctx.fillRect(-heel, sole - 1, toe + heel, 2);
}
/** Cockpit cage, front half (torso space, front layer): two thin dark posts, nothing else. They stand outside the head
 *  circle so no bar ever crosses her face, and the frame's own bronze collar band closes the cockpit floor below her. */
function drawCageFront(ctx, rig) {
  const hw = R(rig.p.torsoW / 2), H = rig.p.torsoH, top = -H - 34;
  ctx.beginPath(); ctx.rect(-hw - 2, top, 2, 35); ctx.rect(hw, top, 2, 35); flat(ctx, rig, PAL.primary);
}
/** Cage back rail + shoulder exhaust stacks + hanging lantern (torso space, back layer) — all demoted: dark iron on the
 *  dark frame, no bright caps, the stacks kept down at shoulder height so they never crowd the hat. */
function drawBackGear(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), H = p.torsoH;
  // back rail of the cage, behind and above her head: the top edge of the cockpit window
  ctx.beginPath(); ctx.rect(-hw - 2, -H - 34, hw * 2 + 4, 3); flat(ctx, rig, tones(rig, PAL.primary).sh);
  // two exhaust stacks rising off the shoulder line behind the rear post
  for (let i = 0; i < 2; i++) {
    const x = -hw - 9 + i * 6;
    celRect(ctx, rig, x, -H - 11 + i * 3, 5, 15 - i * 3, 1, PAL.iron, 0.4, 0);
    if (!rig.override) { ctx.fillStyle = rig.col(PAL.bronze); ctx.fillRect(x - 1, -H - 12 + i * 3, 7, 3); }
  }
  // lantern: small bronze bracket, two-link chain that lags the torso, iron lantern with an amber window
  ctx.beginPath(); ctx.rect(-hw - 9, -14, 9, 3); flat(ctx, rig, PAL.bronze);
  const ch = getChain(rig, 'lantern', 2, { joint: 'torso', rest: [0, 1], stiffness: 0.12, damping: 0.72, gain: 1.8, rotGain: 0.5, maxAng: 40 });
  ctx.save(); ctx.translate(-hw - 8, -11);
  for (let i = 0; i < 2; i++) { ctx.rotate(rad(ch.ang[i])); ctx.beginPath(); ctx.rect(-1, 0, 2, 5); flat(ctx, rig, PAL.bronze); ctx.translate(0, 5); }
  celRect(ctx, rig, -4, 0, 7, 8, 1, PAL.iron, 0.4, 0);
  if (!rig.override) { ctx.fillStyle = rig.col(LAMP); ctx.fillRect(-2, 2 + ((rig.tick >> 3) & 1), 3, 4); }
  ctx.restore();
  if (rig.override) return;
  stackPuffs(ctx, rig, -hw - 6.5, -H - 13, 0);
  stackPuffs(ctx, rig, -hw - 0.5, -H - 10, 10);
}

const build = {
  scale: 1, palette: PAL, outline: INK, outlineWidth: 1, smearColor: '#E8D8A0',
  // the far claw arm and far piston leg are pushed 45 % darker and greyer (ART_STYLE 0.3) and every near limb crossing the
  // chassis gets a heavier contact shadow, so the two arms and the two legs never merge into one scaffold
  farShade: 0.55, farDesat: 0.32,
  // 85 px tall scaffold: 26 x 30 frame, 15 + 14 piston arms with 7 px claws, 13 + 13 piston legs on 13 px plates; the gnome's
  // 18 px head sits 10 px above the frame (neck) so her body fits inside the cage; bulge 0 = machine limbs
  // shoulderX 11 (torso half-width is 13): the claw arms are mounted on the OUTSIDE of the chassis, near arm in front of the
  // front plate and far arm behind the back plate, so neither one crosses the boiler or the gauge and the two never overlap
  proportions: { headR: 9, neck: 10, torsoW: 26, torsoH: 30, hip: 24, upperArm: 15, lowerArm: 14, armR: 5.5, handR: 7, upperLeg: 13, lowerLeg: 13, legR: 4.5, footL: 13, footH: 5, shoulderX: 11, hipX: 5, bulge: 0, neckR: 3 },
  parts: { head: drawHead, face: drawFaceP, hat: drawHat, neck: drawSeat, torso: drawTorso, hips: drawHips, shoulder: drawShoulder, armUpper: drawArmUpper, armLower: drawArmLower, hand: drawClaw, legUpper: drawLegUpper, legLower: drawLegLower, foot: drawPlateFoot },
  accessories: [{ attach: 'back', draw: drawBackGear }, { attach: 'torso', draw: drawCageFront }],
};

// ---------------------------------------------------------------------------------------------------------------
// Animation authoring
// ---------------------------------------------------------------------------------------------------------------
const auditRig = buildRig(build);
/** Ground key: like F() but root.y is solved so the lowest foot plate sits on the floor; spec.root[1] is an extra sink. */
function G(dur, spec, extra) {
  const pose = P(spec), full = makePose(pose), J = computeJoints(auditRig, full), fh = 2;
  const rr = rad(full.root.rot), c = Math.cos(rr), s = Math.sin(rr);
  const boot = Math.max(J.ankleN.x * s + (J.ankleN.y + fh) * c, J.ankleF.x * s + (J.ankleF.y + fh) * c);
  pose.root = { x: full.root.x, y: R(-boot) + (spec.root ? spec.root[1] || 0 : 0), rot: full.root.rot };
  return { dur, pose, ...(extra || {}) };
}
/** Rest carry (ART_STYLE 0.6, open silhouette): elbows bent so the near claw rests FORWARD of the front plate and the far
 *  claw swings BACK behind the hip, both at hip height. Straight-down arms parked the two claws on top of the piston legs
 *  and buried them; this way the leg column from hip to foot plate is clear and the two arms read at a glance. */
const CARRY = { armR: [16, 34], armL: [-26, 6], legR: [8, 0], legL: [-8, 0] };
/** Guard: claws up in front of the chest, knees soft (run / recovery keys). */
const READY = { armR: [70, 60], armL: [40, 70], legR: [14, 4], legL: [-14, 6] };
/** Butt-stomp hit data (shared id = one hit per target across the hit + held frames). */
const STOMP_HIT = { id: 'jumpAttack', x: -14, y: -44, w: 56, h: 72, z: 24, once: true, damage: 16, type: 'knockdown', kbX: 3, kbY: 4, hitstun: 20 };
/** On its back on the floor (root rot -88: body-space +y runs toward the feet along the ground). */
const FLOORED = { armR: [-30, -10], armL: [20, 20], torso: 4, head: -10, legR: [10, 8], legL: [-4, 6], root: [32, -13, -88], face: 'dazed' };
const CLAW = 'claw', PISTON = 'piston';
/** Steam Vent hit: light, 6 dmg, snuffs fire puddles the box touches. Ground friction is 0.82, so a kbX of 3.6
 *  slides a light enemy 3.6 / (1 - 0.82) = 20 px, the pushback per hit the GDD asks for. */
const VENT_HIT = hit(6, 'light', 3.6, 0, 12, { extinguish: true });
/**
 * One blast of the Steam Vent cone (GDD 2.4: 80 px, 40 deg). An AABB pair stands in for the cone: a tight box at the
 * claws and a wider, taller plume out to 80 px (+20 px of body, as `frontBox` allows). Both boxes carry the SAME id, so
 * one blast lands once per target no matter which half of the cone catches it, and the four blasts carry DIFFERENT ids,
 * so each of them re-hits the same enemy: 4 x 6 exactly. Both boxes start at floor level and the far one reaches 86 px
 * up, so anything standing (or freshly popped) between 0 and 100 px in front at the same z is caught.
 */
const ventBlast = (n) => [
  { id: 'vent' + n, x: 2, y: -76, w: 38, h: 76, z: 22, once: true, ...VENT_HIT },
  { id: 'vent' + n, x: 34, y: -86, w: 68, h: 86, z: 34, once: true, ...VENT_HIT },
];
/** Grapple Shot projectile: chained claw, reels the first enemy into her grab (projectile.js kind 'grapple'). */
const GRAPPLE = { kind: 'grapple', style: 'claw', speed: 6, maxDist: 140, damage: 6, type: 'light', hitstun: 14, kbX: 0, onHit: 'reel', muzzle: false, offsetX: 30, offsetY: 52, r: 8, life: 60, color: PAL.accent, draw: drawHook };
/** Wrecking Ball: swing keys start at animation time SWING_AT and turn SWING_DEG per frame (120 deg per 5f key, 3 turns = 45f). */
const SWING_AT = 10, SWING_DEG = 24, SWING_R = 44;

const anims = {
  idle: { loop: true, frames: [
    G(14, { ...CARRY, torso: 2, root: [0, 0] }, { ease: 'inout' }),
    G(14, { ...CARRY, torso: 4, head: 2, root: [0, 1], armR: [18, 16], armL: [-22, 12] }, { ease: 'inout' }),
    G(12, { ...CARRY, torso: 3, head: 1, root: [0, 1], armR: [17, 15] }, { ease: 'inout' }),
    G(14, { ...CARRY, torso: 1, head: -2, root: [0, 0], armR: [15, 13], armL: [-26, 8] }, { ease: 'inout' }),
  ] },
  // walk: heavy piston stride (contact / down / pass / up x2), root sinks 2 on the down keys, arms swing against the legs
  walk: { loop: true, frames: [
    G(4, { ...CARRY, legR: [30, 2], legL: [-22, 18], footR: -8, armR: [-6, 16], armL: [10, 14], torso: 6, head: 1 }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [24, 10], legL: [-14, 30], armR: [-10, 16], armL: [4, 14], torso: 8, head: 3, root: [0, 2], squash: 1.04, stretch: 0.96 }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [8, 22], legL: [0, 12], armR: [4, 14], armL: [-8, 12], torso: 6, head: 1 }, { ease: 'inout' }),
    G(4, { ...CARRY, legR: [-10, 12], legL: [18, -2], footL: -6, armR: [20, 14], armL: [-26, 10], torso: 4, head: -1 }, { ease: 'in' }),
    G(4, { ...CARRY, legR: [-22, 18], legL: [30, 2], footL: -8, armR: [30, 14], armL: [-36, 10], torso: 6, head: 1 }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [-14, 30], legL: [24, 10], armR: [34, 16], armL: [-40, 12], torso: 8, head: 3, root: [0, 2], squash: 1.04, stretch: 0.96 }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [0, 12], legL: [8, 22], armR: [22, 14], armL: [-28, 12], torso: 6, head: 1 }, { ease: 'inout' }),
    G(4, { ...CARRY, legR: [18, -2], legL: [-10, 12], footR: -6, armR: [8, 14], armL: [-6, 12], torso: 4, head: -1 }, { ease: 'in' }),
  ] },
  // run: 20 deg lean, claws pumping, both plates off the floor on the pass keys
  run: { loop: true, frames: [
    G(3, { ...READY, legR: [36, -2], legL: [-34, 46], armR: [50, 80], armL: [-30, 60], torso: 20, head: -4, face: 'angry' }, { ease: 'out' }),
    G(3, { ...READY, legR: [12, 12], legL: [-16, 64], armR: [30, 80], armL: [-10, 60], torso: 22, head: -4, squash: 1.04, stretch: 0.96, face: 'angry' }, { ease: 'out', sfx: PISTON }),
    F(3, { ...READY, legR: [-10, 30], legL: [22, 4], armR: [0, 80], armL: [20, 60], torso: 21, head: -3, root: [0, -4], face: 'angry' }, { ease: 'inout' }),
    F(3, { ...READY, legR: [-34, 46], legL: [44, -14], armR: [-30, 70], armL: [50, 60], torso: 20, head: -4, root: [0, -3], face: 'angry' }, { ease: 'in' }),
    G(3, { ...READY, legR: [-34, 46], legL: [36, -2], armR: [-30, 60], armL: [50, 80], torso: 20, head: -4, face: 'angry' }, { ease: 'out' }),
    G(3, { ...READY, legR: [-16, 64], legL: [12, 12], armR: [-10, 60], armL: [30, 80], torso: 22, head: -4, squash: 1.04, stretch: 0.96, face: 'angry' }, { ease: 'out', sfx: PISTON }),
    F(3, { ...READY, legR: [22, 4], legL: [-10, 30], armR: [20, 60], armL: [0, 80], torso: 21, head: -3, root: [0, -4], face: 'angry' }, { ease: 'inout' }),
    F(3, { ...READY, legR: [44, -14], legL: [-34, 46], armR: [50, 60], armL: [-30, 70], torso: 20, head: -4, root: [0, -3], face: 'angry' }, { ease: 'in' }),
  ] },
  jump: { loop: false, frames: [
    G(3, { ...CARRY, legR: [30, 40], legL: [-20, 44], torso: 14, root: [0, 2], squash: 1.1, stretch: 0.9, armL: [-30, 30], armR: [30, 10] }, { ease: 'out', sfx: PISTON }),
    F(4, { ...CARRY, legR: [30, -30], legL: [10, -20], torso: -4, root: [0, -2], squash: 0.94, stretch: 1.08, armL: [-70, -30], head: -4, armR: [60, -10] }, { ease: 'out' }),
    F(30, { ...CARRY, legR: [40, -70], legL: [20, -50], torso: 2, armL: [-50, -20], head: -2, armR: [50, -10] }),
  ] },
  fall: { loop: true, frames: [
    F(10, { ...CARRY, legR: [24, -30], legL: [8, -20], armL: [-80, -30], torso: -6, head: -6, face: 'grit', armR: [40, -10] }, { ease: 'inout' }),
    F(10, { ...CARRY, legR: [30, -40], legL: [4, -14], armL: [-95, -30], torso: -8, head: -8, face: 'grit', armR: [46, -14] }, { ease: 'inout' }),
  ] },
  land: { loop: false, frames: [
    G(3, { ...CARRY, legR: [34, 46], legL: [-24, 48], torso: 22, head: 4, root: [0, 2], squash: 1.16, stretch: 0.86, armL: [-30, 30], armR: [30, 10], face: 'grit' }, { ease: 'out' }),
    G(4, { ...CARRY, legR: [14, 16], legL: [-10, 18], torso: 8, squash: 1.02, stretch: 0.98 }, { ease: 'out' }),
  ] },

  // ---- ground combo: claw swat -> double-claw clap (front + back, stagger) -> piston uppercut (launcher) ----
  // anticipation (ease in, arm wound the opposite way) -> hit key (overshoot + smear + hitbox) -> hold (+4 deg) -> follow-through (cancel) -> return
  attack1: { loop: false, frames: [
    G(4, { armR: [-50, -70], armL: [30, 40], torso: -10, head: -4, root: [-2, 0], legR: [6, 4], legL: [-18, 12], face: 'angry' }, { ease: 'in' }),
    G(4, { armR: [-70, -80], armL: [40, 40], torso: -16, head: -8, root: [-3, 0], legR: [4, 6], legL: [-22, 16], face: 'angry' }, { ease: 'out', sfx: CLAW }),
    // hit: level swat across the chest line, claw wide open, body lunged onto the front plate
    G(3, { armR: [88, 4], armL: [-30, 30], torso: 22, head: 6, root: [5, 0], legR: [34, 8], legL: [-26, 22], face: 'shout' },
      { hitbox: frontBox(40, hit(12, 'light', 2, 0, 18)), smear: { from: -150, to: 10, a: 0.5, r: 52 }, fx: [{ kind: 'slash', x: 30, y: 46, radius: 28, angle: 10 }], ease: 'overshoot' }),
    G(2, { armR: [94, 6], armL: [-32, 30], torso: 24, head: 6, root: [6, 0], legR: [34, 8], legL: [-26, 22], face: 'shout' }, { ease: 'out' }),
    G(8, { armR: [84, 10], armL: [-26, 26], torso: 18, head: 4, root: [5, 0], legR: [32, 8], legL: [-26, 22], face: 'angry' }, { cancel: 'attack', ease: 'inout' }),
    G(4, { ...CARRY, torso: 8, root: [2, 0], face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack2: { loop: false, frames: [
    G(3, { armR: [50, 96], armL: [40, 90], torso: 6, head: 2, root: [0, 0], legR: [20, 6], legL: [-20, 10], face: 'angry' }, { ease: 'in' }),
    G(3, { armR: [60, 110], armL: [50, 100], torso: 10, head: 4, root: [0, 1], squash: 1.06, stretch: 0.94, legR: [22, 8], legL: [-22, 12], face: 'angry' }, { ease: 'out', sfx: CLAW }),
    // hit: both claws snap out flat — near arm forward, far arm straight back — hitting either side
    G(3, { armR: [98, -4], armL: [-98, -4], torso: 0, head: 0, root: [0, 0], legR: [26, 4], legL: [-26, 4], face: 'shout' },
      { hitbox: frontBox(40, hit(14, 'medium', 1, 0, 20, { stagger: true }), { behind: true }), smear: { from: -70, to: 10, a: 0.5, r: 52 },
        fx: [{ kind: 'slash', x: 30, y: 52, radius: 26, angle: 0, sweep: 80 }, { kind: 'slash', x: -30, y: 52, radius: 26, angle: 180, sweep: 80 }], ease: 'overshoot' }),
    G(2, { armR: [102, -4], armL: [-102, -4], torso: 0, head: 0, root: [0, 0], legR: [26, 4], legL: [-26, 4], face: 'shout' }, { ease: 'out' }),
    G(9, { armR: [90, 6], armL: [-84, 6], torso: 4, head: 2, root: [0, 0], legR: [24, 6], legL: [-24, 6], face: 'angry' }, { cancel: 'attack', ease: 'inout' }),
    G(4, { ...CARRY, torso: 6, face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack3: { loop: false, frames: [
    G(3, { armR: [-30, 60], armL: [30, 40], torso: 14, head: 4, root: [0, 2], squash: 1.06, stretch: 0.94, legR: [26, 30], legL: [-14, 26], face: 'angry' }, { ease: 'in' }),
    G(4, { armR: [-50, 90], armL: [40, 40], torso: 22, head: 6, root: [-1, 3], squash: 1.12, stretch: 0.88, legR: [32, 44], legL: [-16, 38], face: 'grit' }, { ease: 'out', sfx: PISTON }),
    // hit: the piston fires — arm rockets straight up through the high box, body pops off the floor
    F(4, { armR: [172, 4], armL: [-40, 20], torso: -14, head: -10, root: [4, -8], squash: 0.94, stretch: 1.08, legR: [26, 4], legL: [-30, 36], face: 'shout' },
      { hitbox: frontBox(40, hit(18, 'launch', 2, 8, 20), { high: true }), smear: { from: 60, to: -100, a: 0.55, r: 52 }, sfx: 'hit_launch',
        fx: [{ kind: 'ring', x: 22, y: 44, r0: 2, r1: 24, color: '#ffb060' }, { kind: 'steam', x: 10, y: 54, count: 4 }], ease: 'overshoot' }),
    F(3, { armR: [176, 4], armL: [-44, 20], torso: -16, head: -12, root: [4, -8], squash: 0.96, stretch: 1.05, legR: [26, 4], legL: [-30, 36], face: 'shout' }, { ease: 'out' }),
    G(12, { armR: [140, 40], armL: [-34, 20], torso: -8, head: -6, root: [3, 0], legR: [20, 10], legL: [-26, 30], face: 'angry' }, { cancel: 'any', ease: 'inout' }),
    G(4, { ...CARRY, torso: 6, root: [2, 0] }, { cancel: 'any', ease: 'out' }),
  ] },

  // ---- butt-stomp: legs tucked forward, whole rig drops onto the crowd; the plates hit the floor with a 30 px shockwave ----
  jumpAttack: { loop: false, frames: [
    F(4, { armR: [-120, 10], armL: [-110, 10], torso: -8, head: -6, legR: [70, -110], legL: [60, -100], face: 'angry' }, { sfx: PISTON, ease: 'in' }),
    F(5, { armR: [-150, 0], armL: [-140, 0], torso: 12, head: 6, root: [0, 0, 8], legR: [96, -104], legL: [86, -96], squash: 1.06, stretch: 0.94, face: 'shout' },
      { hitbox: STOMP_HIT, move: { vy: -4 }, fx: [{ kind: 'steam', x: -12, y: 60, count: 3 }], ease: 'overshoot' }),
    F(20, { armR: [-154, 0], armL: [-144, 0], torso: 14, head: 6, root: [0, 0, 10], legR: [98, -106], legL: [88, -98], face: 'grit' }, { hitbox: STOMP_HIT }),
  ] },
  landAttack: { loop: false, frames: [
    G(2, { armR: [-40, 30], armL: [-40, 30], legR: [30, 50], legL: [-20, 50], torso: 30, head: 6, root: [0, 3], squash: 1.2, stretch: 0.8, face: 'shout' },
      { event: 'shockwave', radius: 30, hit: hit(10, 'knockdown', 4, 4, 20), sfx: 'land_heavy', ease: 'out', fx: [{ kind: 'steam', x: -10, y: 30, count: 4 }] }),
    G(10, { armR: [-20, 30], armL: [-20, 30], legR: [20, 30], legL: [-15, 30], torso: 18, root: [0, 1], face: 'grit' }, { ease: 'inout' }),
    G(6, { ...CARRY, torso: 4 }, { cancel: 'any', ease: 'out' }),
  ] },
  // ---- Grapple Shot: the near claw fires down a chain (event 'grapple' -> hooks), arm stays extended while it is out ----
  dashAttack: { loop: false, frames: [
    G(4, { armR: [-60, -90], armL: [40, 40], torso: 26, head: -6, root: [-2, 0], squash: 1.05, stretch: 0.95, legR: [26, 12], legL: [-24, 14], face: 'angry' }, { sfx: 'grapple', ease: 'in' }),
    G(4, { armR: [96, -4], armL: [-40, 30], torso: 24, head: 4, root: [4, 0], legR: [40, 10], legL: [-30, 30], face: 'shout' },
      { event: 'grapple', smear: { from: -160, to: 0, a: 0.4, r: 52 }, fx: [{ kind: 'steam', x: 14, y: 54, count: 3 }], ease: 'overshoot' }),
    G(24, { armR: [92, 0], armL: [-40, 30], torso: 20, head: 2, root: [4, 0], legR: [40, 10], legL: [-30, 30], face: 'grit' }, { ease: 'inout' }),
    G(4, { ...CARRY, torso: 8 }, { cancel: 'any', ease: 'out' }),
  ] },

  // ---- Steam Vent: 10f startup (boiler winds up, claws pulled back), then 4 x 4f blasts from both claws (80 px cone), 8f recovery ----
  special: { loop: false, frames: [
    G(5, { armR: [-30, -40], armL: [-40, -30], torso: -10, head: -4, root: [-3, 0], legR: [12, 8], legL: [-18, 10], face: 'angry' }, { event: 'vent', vent: 40, ease: 'in' }),
    G(5, { armR: [40, -60], armL: [30, -50], torso: 14, head: 4, root: [0, 2], squash: 1.1, stretch: 0.9, legR: [30, 30], legL: [-20, 26], face: 'grit' }, { ease: 'out' }),
    G(4, { armR: [92, -4], armL: [88, -2], torso: 20, head: 4, root: [2, 0], legR: [36, 10], legL: [-30, 30], face: 'shout' },
      { hitboxes: ventBlast(1), sfx: 'steam_vent', fx: [{ kind: 'steam', x: 34, y: 50, count: 5 }, { kind: 'steam', x: 56, y: 44, count: 4 }, { kind: 'steam', x: 76, y: 40, count: 3 }], ease: 'out' }),
    G(4, { armR: [88, -2], armL: [84, 0], torso: 24, head: 6, root: [-1, 1], legR: [36, 10], legL: [-30, 30], face: 'shout' },
      { hitboxes: ventBlast(2), sfx: 'steam', fx: [{ kind: 'steam', x: 40, y: 54, count: 5 }, { kind: 'steam', x: 62, y: 46, count: 4 }, { kind: 'steam', x: 82, y: 42, count: 3 }], ease: 'out' }),
    G(4, { armR: [94, -4], armL: [90, -2], torso: 20, head: 4, root: [2, 0], legR: [36, 10], legL: [-30, 30], face: 'shout' },
      { hitboxes: ventBlast(3), sfx: 'steam', fx: [{ kind: 'steam', x: 34, y: 48, count: 5 }, { kind: 'steam', x: 58, y: 40, count: 4 }, { kind: 'steam', x: 78, y: 36, count: 3 }], ease: 'out' }),
    G(4, { armR: [88, -2], armL: [84, 0], torso: 24, head: 6, root: [-1, 1], legR: [36, 10], legL: [-30, 30], face: 'shout' },
      { hitboxes: ventBlast(4), sfx: 'steam', fx: [{ kind: 'steam', x: 40, y: 52, count: 5 }, { kind: 'steam', x: 64, y: 44, count: 4 }, { kind: 'steam', x: 84, y: 40, count: 3 }], ease: 'out' }),
    G(8, { armR: [70, 20], armL: [66, 20], torso: 14, head: 2, root: [0, 1], legR: [30, 10], legL: [-26, 24], face: 'grit' }, { ease: 'inout' }),
    G(4, { ...CARRY, torso: 6 }, { cancel: 'any', ease: 'out' }),
  ] },
  // ---- Wrecking Ball: grab (wreckGrab -> hooks), hoist, three 120-deg keys per turn x 3 turns (hitbox once per turn), hurl 300 px ----
  super: (() => {
    const turn = (a, k, dur = 5) => F(dur, { armR: [a, 0], armL: [a - 6, 0], torso: 0, head: k % 3 === 1 ? -8 : 4, root: [k % 3 === 2 ? -3 : 3, 0], legR: [26, 6], legL: [-26, 6], face: 'shout' },
      { hitbox: { ...areaBox(70, hit(20, 'knockdown', 3, 5, 24, { otg: true }), { y: -96, h: 96 }), id: 'turn' + Math.floor(k / 3) }, ease: 'linear',
        sfx: k % 3 === 0 ? 'hydraulic' : undefined, smear: { from: -a + 90 - 60, to: -a + 90 + 60, a: 0.35, r: 56 } });
    const frames = [
      G(4, { armR: [70, 30], armL: [64, 34], torso: 24, head: 6, root: [2, 2], squash: 1.1, stretch: 0.9, legR: [34, 30], legL: [-22, 26], face: 'angry' }, { event: 'wreckGrab', radius: 90, sfx: 'hit_grab', ease: 'in' }),
      G(6, { armR: [90, 0], armL: [84, 0], torso: 4, head: 2, root: [0, 0], legR: [26, 6], legL: [-26, 6], face: 'grit' }, { ease: 'out', sfx: 'super_pip' }),
    ];
    for (let k = 0; k < 9; k++) frames.push(turn(90 + 120 * k, k));
    frames.push(F(6, { armR: [110, 10], armL: [104, 10], torso: 26, head: 6, root: [6, 0], squash: 1.06, stretch: 0.94, legR: [40, 10], legL: [-30, 30], face: 'shout' },
      { event: 'wreckThrow', damage: 40, vx: 12, maxDist: 300, sfx: 'throw', smear: { from: -150, to: 10, a: 0.5, r: 56 }, ease: 'overshoot', fx: [{ kind: 'dust', x: 20, y: 0, count: 4 }] }));
    frames.push(G(9, { ...CARRY, torso: 10, root: [2, 1], face: 'happy' }, { ease: 'out' }));
    return { loop: false, frames };
  })(),

  // dodge: the rig tucks its legs and rolls around its centre (c = (0, -40)), lands with a squash
  dodge: { loop: false, frames: [
    G(4, { ...READY, torso: 30, root: [0, 2], legR: [40, 40], legL: [-20, 40], face: 'grit', squash: 1.08, stretch: 0.92 }, { sfx: 'dodge', ease: 'in' }),
    F(5, { torso: 30, head: 10, root: [-35, -60, 120], legR: [100, 70], legL: [80, 90], armR: [80, 60], armL: [60, 70], face: 'closed' }),
    F(5, { torso: 34, head: 12, root: [35, -60, 240], legR: [100, 70], legL: [80, 90], armR: [80, 60], armL: [60, 70], face: 'closed' }),
    F(5, { torso: 40, root: [6, -6, 360], legR: [60, 40], legL: [30, 40], armR: [60, 60], armL: [50, 60], face: 'closed' }, { ease: 'out' }),
    G(7, { ...CARRY, torso: 10, root: [0, 2, 360], legR: [18, 20], legL: [-12, 16], squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
  ] },
  // taunt: claws on the hips, she leans back and vents both stacks (event 'vent' -> big puffs); meter on the last key
  taunt: { loop: false, frames: [
    G(6, { armR: [10, 90], armL: [-10, 90], torso: 4, head: 2, legR: [12, 4], legL: [-12, 4], face: 'neutral' }, { ease: 'out' }),
    G(20, { armR: [12, 92], armL: [-12, 92], torso: -10, head: -14, legR: [10, 2], legL: [-14, 6], root: [0, 0], face: 'happy' }, { event: 'vent', vent: 50, sfx: 'steam', fx: [{ kind: 'steam', x: -18, y: 92, count: 6 }, { kind: 'steam', x: -12, y: 88, count: 4 }], ease: 'inout' }),
    G(18, { armR: [14, 92], armL: [-14, 92], torso: -6, head: -10, legR: [10, 2], legL: [-14, 6], root: [0, 1], face: 'happy' }, { sfx: 'steam', fx: [{ kind: 'steam', x: -16, y: 90, count: 4 }], ease: 'inout' }),
    G(16, { armR: [12, 92], armL: [-12, 92], torso: -8, head: -12, legR: [10, 2], legL: [-14, 6], root: [0, 0], face: 'happy' }, { event: 'meterGain', ease: 'inout' }),
  ] },

  // ---- grabs / throws (Grab Armor: the startup keys carry armor) ----
  grab: { loop: false, frames: [
    G(4, { armR: [60, 30], armL: [50, 40], torso: 8, root: [0, 0], legR: [14, 4], legL: [-14, 6], face: 'angry' }, { armor: true, ease: 'in' }),
    G(4, { armR: [84, 8], armL: [80, 12], torso: 16, root: [3, 0], legR: [26, 8], legL: [-20, 14], face: 'angry' },
      { hitbox: { x: 4, y: -66, w: 46, h: 62, z: 20, type: 'grab', once: true, damage: 0 }, armor: true, sfx: 'hit_grab', ease: 'out' }),
  ] },
  grabHold: { loop: true, frames: [
    G(16, { armR: [84, 8], armL: [80, 12], torso: 12, legR: [22, 6], legL: [-20, 12], face: 'angry' }, { ease: 'inout' }),
    G(16, { armR: [86, 10], armL: [82, 14], torso: 14, root: [0, 1], legR: [22, 6], legL: [-20, 12], face: 'angry' }, { ease: 'inout' }),
  ] },
  // Crush: both claws clench inward
  grabHit: { loop: false, frames: [
    G(4, { armR: [76, 18], armL: [72, 22], torso: 6, head: -4, root: [-2, 0], legR: [20, 6], legL: [-20, 12], face: 'angry' }, { ease: 'in' }),
    G(4, { armR: [94, -2], armL: [90, 2], torso: 20, head: 8, root: [4, 1], legR: [30, 10], legL: [-24, 18], face: 'shout' }, { sfx: 'hit_medium', ease: 'overshoot', fx: [{ kind: 'steam', x: 10, y: 60, count: 2 }] }),
    G(6, { armR: [84, 8], armL: [80, 12], torso: 12, legR: [22, 6], legL: [-20, 12], face: 'angry' }, { ease: 'out' }),
  ] },
  // forward throw: both arms wind back over the shoulders, then hurl (released on the fling key, frame 5)
  throw: { loop: false, frames: [
    G(5, { armR: [-140, -30], armL: [-130, -30], torso: -20, head: -8, root: [-3, 0], squash: 0.96, stretch: 1.05, legR: [10, 4], legL: [-14, 8], face: 'angry' }, { ease: 'in' }),
    G(6, { armR: [110, -6], armL: [104, -4], torso: 30, head: 8, root: [6, 0], squash: 1.06, stretch: 0.94, legR: [40, 10], legL: [-30, 30], face: 'shout' },
      { sfx: 'throw', smear: { from: -200, to: 0, a: 0.5, r: 56 }, ease: 'overshoot', fx: [{ kind: 'steam', x: -8, y: 60, count: 3 }] }),
    G(10, { armR: [116, 0], armL: [110, 0], torso: 24, head: 6, root: [6, 0], legR: [36, 10], legL: [-28, 28], face: 'angry' }, { ease: 'out' }),
    G(4, { ...CARRY, torso: 6 }, { ease: 'out' }),
  ] },
  // back throw: piledriver — hoist overhead with a hop, slam them down behind her (released mid-slam, frame 8) plus the shockwave
  throwBack: { loop: false, frames: [
    G(5, { armR: [-170, -6], armL: [-164, -6], torso: -12, head: -10, root: [-2, 0], squash: 0.94, stretch: 1.06, legR: [12, 4], legL: [-12, 4], face: 'angry' }, { ease: 'in' }),
    F(3, { armR: [-176, -6], armL: [-170, -6], torso: -20, head: -12, root: [-3, -10], squash: 0.9, stretch: 1.1, legR: [30, -30], legL: [10, -20], face: 'grit' }, { ease: 'in', sfx: PISTON }),
    G(6, { armR: [-64, 24], armL: [-58, 24], torso: -34, head: -6, root: [-6, 2], squash: 1.14, stretch: 0.86, legR: [-26, 36], legL: [30, 34], face: 'shout' },
      { sfx: 'throw', smear: { from: -100, to: -230, a: 0.5, r: 56 }, fx: [{ kind: 'dust', x: -40, y: 0, count: 6 }], ease: 'overshoot' }),
    G(8, { armR: [-66, 26], armL: [-60, 26], torso: -30, head: -4, root: [-6, 2], legR: [-26, 36], legL: [30, 34], face: 'grit' }, { ease: 'out' }),
    G(4, { ...CARRY, torso: 6 }, { ease: 'out' }),
  ] },

  // ---- damage / defeat ----
  hurt: { loop: false, frames: [
    G(4, { ...CARRY, torso: -26, head: -24, armL: [-60, -30], armR: [40, -10], root: [-5, 0], legR: [22, 4], legL: [-14, 12], face: 'hurt' }, { ease: 'out' }),
    G(10, { ...CARRY, torso: -12, head: -10, armL: [-30, -10], armR: [26, 0], root: [-2, 0], legR: [14, 2], legL: [-10, 8], face: 'hurt' }, { ease: 'out' }),
    G(6, { ...CARRY, torso: 0, face: 'angry' }, { ease: 'out' }),
  ] },
  stagger: { loop: false, frames: [
    G(4, { ...CARRY, torso: -30, head: -26, armL: [-70, -30], armR: [50, -20], root: [-6, 0], legR: [26, 6], legL: [-16, 14], face: 'hurt' }, { ease: 'out' }),
    G(14, { ...CARRY, torso: -18, head: 10, armL: [-40, -20], armR: [30, 10], root: [-4, 1], legR: [18, 10], legL: [-12, 12], face: 'dazed' }, { ease: 'inout' }),
    G(14, { ...CARRY, torso: -6, head: -12, armL: [-30, -10], armR: [20, 10], root: [-2, 1], legR: [14, 6], legL: [-10, 8], face: 'dazed' }, { ease: 'inout' }),
    G(8, { ...CARRY, torso: 0, face: 'angry' }, { ease: 'out' }),
  ] },
  hurtAir: { loop: true, frames: [
    F(6, { armR: [-90, -40], armL: [-100, -30], torso: -30, head: -25, legR: [40, 40], legL: [10, 60], root: [0, 0, -15], face: 'hurt' }, { ease: 'inout' }),
    F(6, { armR: [-100, -50], armL: [-110, -30], torso: -35, head: -30, legR: [50, 30], legL: [20, 50], root: [0, 0, -25], face: 'hurt' }, { ease: 'inout' }),
  ] },
  knockdown: { loop: true, frames: [
    F(8, { armR: [-60, -40], armL: [-80, -30], torso: -50, head: -20, legR: [50, 30], legL: [30, 50], root: [0, -6, -25], face: 'hurt' }, { ease: 'inout' }),
    F(8, { armR: [-70, -50], armL: [-90, -30], torso: -55, head: -25, legR: [60, 20], legL: [40, 40], root: [0, -6, -35], face: 'hurt' }, { ease: 'inout' }),
  ] },
  lying: { loop: true, frames: [
    F(16, { ...FLOORED }, { ease: 'inout' }),
    F(16, { ...FLOORED, torso: 6, head: -12, legR: [14, 10] }, { ease: 'inout' }),
  ] },
  // getup: the pistons push the frame up off its back
  getup: { loop: false, frames: [
    F(8, { ...FLOORED }, { ease: 'in' }),
    G(8, { armR: [60, 40], armL: [-30, 40], torso: 30, head: -10, legR: [70, 60], legL: [-20, 60], root: [8, 0, -20], face: 'grit', squash: 1.06, stretch: 0.94 }, { ease: 'out', sfx: PISTON, fx: [{ kind: 'steam', x: -10, y: 30, count: 3 }] }),
    G(6, { ...CARRY, torso: 8, legR: [16, 20], legL: [-10, 16], face: 'angry' }, { ease: 'out' }),
  ] },
  dead: { loop: false, frames: [
    F(60, { ...FLOORED, torso: 8, head: -14, legR: [6, 4], legL: [-6, 6], root: [32, -13, -90] }),
  ] },
  // win (GDD 6): the rig bows — claws sweep wide, the frame folds forward, then it straightens and she beams
  win: { loop: true, frames: [
    G(8, { armR: [60, 10], armL: [-40, 10], torso: 8, head: 2, legR: [12, 4], legL: [-12, 4], face: 'happy' }, { ease: 'inout' }),
    G(14, { armR: [120, 10], armL: [-110, 10], torso: 50, head: 8, root: [2, 1], squash: 1.04, stretch: 0.96, legR: [16, 6], legL: [-14, 8], face: 'happy' }, { ease: 'out', sfx: 'hydraulic' }),
    G(12, { armR: [124, 12], armL: [-114, 12], torso: 54, head: 6, root: [2, 2], legR: [16, 6], legL: [-14, 8], face: 'closed' }, { ease: 'inout' }),
    G(12, { armR: [30, 10], armL: [-30, 10], torso: -6, head: -8, root: [0, 0], squash: 0.98, stretch: 1.02, legR: [12, 4], legL: [-12, 4], face: 'happy' }, { ease: 'out', sfx: 'steam', fx: [{ kind: 'steam', x: -18, y: 92, count: 5 }] }),
    G(18, { armR: [40, -100], armL: [-30, 10], torso: -2, head: -4, root: [0, 1], legR: [12, 4], legL: [-12, 4], face: 'happy' }, { ease: 'inout' }),
  ] },
};

// ---------------------------------------------------------------------------------------------------------------
// Hooks: claw open/close, vent puffs, gauge meter, Grapple Shot, Wrecking Ball orbit
// ---------------------------------------------------------------------------------------------------------------
/** Grapple projectile renderer: chain links back to the near claw, then the flying two-prong claw. */
function drawHook(ctx, p, sx, sy) {
  const o = p.owner, r = p.r, cy = sy - r;
  if (o && o.rig) {
    const j = jointScreen(o.rig, 'handN');
    const dx = sx - j.x, dy = cy - j.y, len = Math.hypot(dx, dy) || 1, n = Math.max(1, Math.floor(len / 5));
    ctx.lineCap = 'butt'; ctx.lineWidth = 3;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      ctx.strokeStyle = i & 1 ? '#8A8A96' : '#3A3A44';
      ctx.beginPath(); ctx.moveTo(j.x + dx * t0, j.y + dy * t0); ctx.lineTo(j.x + dx * t1, j.y + dy * t1); ctx.stroke();
    }
  }
  ctx.save(); ctx.translate(sx, cy); ctx.scale(p.facing, 1);
  ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.rect(-8, -5, 8, 10); ctx.stroke(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-1, -5); ctx.lineTo(6, -8); ctx.lineTo(12, -3); ctx.lineTo(5, -1); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-1, 5); ctx.lineTo(6, 8); ctx.lineTo(12, 3); ctx.lineTo(5, 1); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#7A5A14'; ctx.fillRect(-6, -2, 3, 4);
  ctx.restore();
}
/** Wrecking Ball: hold the nearest enemy (else spawn a rubble ball) in `f.pipBall` / `f.pipProj` — the core's heldBody would pin it in front. */
function grabBall(f, world, frame) {
  const e = world.nearestEnemy(f.x, f.z, { maxDist: (frame && frame.radius) || 90 });
  if (e && !e.dead && !e.grabbedBy && (e.kind !== 'boss' || (e.punishable && e.punishGrab))) {
    if (e.grabTarget && e.releaseGrab) e.releaseGrab(false);
    f.pipBall = e; f.grabTarget = e; e.grabbedBy = f; e.vx = e.vy = e.vz = 0;
    e.setState(ST.GRABBED, 'hurtAir'); e.anim.setStaticPose(e.anim.pose);
    audio.play('hit_grab');
  } else {
    f.pipProj = world.spawnProjectile({ style: 'rubble', speed: 0, life: 600, noContactHit: true, r: 10, color: '#6a6a70', muzzle: false, offsetX: 34, offsetY: 30 }, f);
    world.addFx('dust', f.x + f.facing * 34, 0, f.z, { count: 6 });
  }
  f.rig.claw = 0;
}
/** Swing the held body / rubble in a vertical circle around the near shoulder, in step with the arm keys of the super anim. */
function swingBall(f) {
  const b = f.pipBall, pr = f.pipProj;
  if (b && (b.grabbedBy !== f || b.dead)) { f.pipBall = null; if (f.grabTarget === b) f.grabTarget = null; }
  if (pr && pr.removeMe) f.pipProj = null;
  const t = f.anim.time - SWING_AT;
  const a = rad(90 + SWING_DEG * Math.max(0, t));
  const cx = f.x + f.facing * (3 + SWING_R * dsin(a)), cy = 54 - SWING_R * dcos(a);
  if (f.pipBall) { const e = f.pipBall; e.x = cx; e.z = f.z; e.y = Math.max(0, cy - e.h * 0.5); e.facing = -f.facing; }
  if (f.pipProj) { const p = f.pipProj; p.x = cx; p.y = Math.max(2, cy); p.z = f.z; p.life = 600; p.facing = f.facing; }
}
/** Let go of a swung body without a throw (the super was interrupted or ended early). */
function dropBall(f) {
  const b = f.pipBall, pr = f.pipProj;
  f.pipBall = null; f.pipProj = null;
  if (b && b.grabbedBy === f) { b.grabbedBy = null; if (f.grabTarget === b) f.grabTarget = null; b.setState(ST.IDLE, 'idle'); }
  if (pr && !pr.removeMe) pr.removeMe = true;
}
const OPEN_STATES = new Set([ST.ATTACK, ST.DASH_ATTACK, ST.SPECIAL, ST.JUMP_ATTACK]);
/**
 * Frames a Grapple Shot reel-grab holds before it hurls on its own. A hand-made grab holds `grabHoldFrames` (60, GDD 7)
 * because the player chose to grab and is expected to follow up; the reel-grab is the tail of a *dash attack* the player
 * already committed to, so parking her for a full second of dead air (60f hold + 25f throw) leaves her helpless long
 * after the move reads as over. If the player does engage (Crush / a directional throw) `grabHits` is non-zero and the
 * normal 60f hold takes over again.
 */
const REEL_HOLD = 24;
const hooks = {
  onSpawn(f) { const rig = f.rig; rig.claw = 0.25; rig.vent = 0; rig.meterFrac = 0; rig.clawFired = false; f.pipHook = null; f.pipBall = null; f.pipProj = null; f.pipReel = false; },
  onUpdate(f, world) {
    const rig = f.rig, s = f.state;
    if (rig.vent > 0) rig.vent--;
    rig.meterFrac = (f.meter || 0) / METER.max;
    // claws: wide open while striking, clenched while holding, otherwise resting with an idle clack every 150 frames
    let target;
    if (s === ST.GRAB || s === ST.GRABBED) target = 0;
    else if (OPEN_STATES.has(s)) target = 1;
    else if (s === ST.SUPER) target = f.pipBall || f.pipProj ? 0 : 1;
    else if (s === ST.TAUNT) target = (world.frame % 20) < 10 ? 0.9 : 0.1;
    else target = (world.frame % 150) < 10 ? 0.9 : 0.25;
    rig.claw += (target - rig.claw) * 0.35;
    if (f.pipHook && (f.pipHook.removeMe || !f.pipHook.alive)) f.pipHook = null;
    rig.clawFired = !!f.pipHook;
    if (s === ST.SUPER) swingBall(f);
    // Grapple Shot reel-grab: hurl on its own after REEL_HOLD unless the player has started crushing / throwing.
    if (s === ST.GRAB) {
      if (f.pipReel && f.grabTarget && !f.throwPending && !f.grabHits && f.grabTimer >= REEL_HOLD) f.throwTarget(1);
    } else f.pipReel = false;
  },
  onStateEnter(f, state, prev) {
    if (prev === ST.SUPER && state !== ST.SUPER) dropBall(f);
    // the reel hands the enemy over from projectile.js the frame the hook is retired, so a live hook marks a reel-grab
    if (state === ST.GRAB) { f.rig.vent = Math.max(f.rig.vent, 12); f.pipReel = !!f.pipHook; }
  },
  onAnimEvent(f, name, frame, world) {
    if (name === 'grapple') { f.pipHook = f.fireProjectile(GRAPPLE, world); return true; }
    if (name === 'vent') { f.rig.vent = Math.max(f.rig.vent, (frame && frame.vent) || 30); return true; }
    if (name === 'wreckGrab') { grabBall(f, world, frame); return true; }
    if (name === 'wreckThrow') {
      // hand the swung body / rubble to the core's release (player.js wreckThrow: damage / vx / maxDist from the frame)
      if (f.pipBall && f.pipBall.grabbedBy === f) f.heldBody = f.pipBall;
      if (f.pipProj && !f.pipProj.removeMe) f.heldProj = f.pipProj;
      f.pipBall = null; f.pipProj = null; f.rig.vent = 20;
      return false;
    }
    return false;
  },
  onThrow(f) { f.rig.vent = Math.max(f.rig.vent, 16); },
  onDeath(f) { dropBall(f); },
};

/**
 * Select / HUD bust: the pilot, not the scaffold. The framing is tight enough on her 18 px head that the cage posts land at
 * the edges of the 24 px HUD square and read as the window they are, with the red hat and her face filling the middle.
 */
let portraitRig = null;
const PORTRAIT_POSE = P({ armR: [24, 40], armL: [-30, 20], legR: [8, 0], legL: [-8, 0], torso: 2, head: -2, face: 'angry' });
function portrait(ctx, x, y, s) {
  if (!portraitRig) portraitRig = buildRig(build);
  drawHeadPortrait(ctx, portraitRig, PORTRAIT_POSE, x, y, s, { bg: null, fill: 0.66, cy: 0.5 });
}

/** Pip Gearlock & The Rig character definition. */
export const pip = {
  id: 'pip', name: 'PIP', fullName: 'Pip Gearlock & The Rig', title: 'THE TINKERER', archetype: 'GRAPPLER',
  stats: { power: 4, speed: 2, health: 4, range: 3, technique: 3 },
  maxHp: hpFor(4), walkSpeed: speedFor(2), runSpeed: speedFor(2) * 1.7, jumpVy: JUMP_VY, reach: 40, grabReach: 30, grabOffset: 30, grabLift: 8, grabHoldFrames: 60,
  freeChain: true,
  // Grab Armor (GDD 2.4): reach 30 (standard 20), grabs Wardens / Hulks (grabAll), grab damage +25 %; the grab startup keys carry armor
  // Pressure Hull (GDD 2.4 / 7 shields): a grappler's walk-in budget — 28 points, 12/s after 2.2 s, so the rig
  // eats the hit that would otherwise interrupt the approach, then wants a breather before the next grab.
  traits: { grabReach: 30, grabAll: true, grabDamageMult: 1.25,
    shield: { name: 'PRESSURE HULL', max: 28, regen: 0.2, delay: 130, breakDelay: 260 } },
  build,
  anims,
  hooks,
  moves: {
    special: { name: 'STEAM VENT', cost: METER.special }, super: { name: 'WRECKING BALL', cost: METER.super, damage: 100 },
    // forward: hurled on the fling key (frame 5), ~220 px flight; back: piledriver released mid-slam (frame 8) + 40 px shockwave; Crush 3 x 8
    throwFwd: { damage: 20, vx: 10.5, vy: 5, releaseAt: 5 }, throwBack: { damage: 25, vx: 3, vy: 3, releaseAt: 8, shockwave: { r: 40, damage: 10 } }, grabHit: { damage: 8, hits: 3 },
  },
  sfx: { special: 'special_pip', super: 'super_pip', swing: 'piston' },
  portrait,
};
