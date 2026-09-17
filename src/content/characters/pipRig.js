// Pip's rig: the palette, every part draw and the `build` that wires them together. Split from pip.js, which was
// the only over-cap hero file, following the *Rig.js convention the enemy factions already use (chandlerRig,
// gleaningRig, stormcrowRig). Only PAL, INK, R and `build` cross back to pip.js; nothing here needs the moveset.
import { celRect, celBall, celPoly, celCapsule, tones, flat, band, outlinePath } from '../../art/shading.js';
import { pathTaperedCapsule } from '../../art/shapes.js';
import { drawSkull, drawFace } from '../../art/rigParts.js';
import { getChain } from '../../art/secondary.js';
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

export { PAL, INK, R, build };
