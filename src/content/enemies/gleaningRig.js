// The Gleaning (faction rig): the salvage guild that hangs off tailings-gas bladders and strips whatever falls out of a
// fight. Shared cel-shaded parts + the hand-authored base animation set used by content/enemies/gleaning.js.
//
// Silhouette law (docs/ART_STYLE.md 0.1 / 0.6): a DARK RAG BODY HANGING UNDER A PALE BULB. The bladder is a `back`
// accessory (torso space, behind the body) so it legitimately rises clear above the skull with the dark sack hood
// silhouetted on it; the Gleaning is the only faction whose head is not the highest point. Value is placed by HEIGHT —
// night-rag at the floor, soot-plum at the chest, the mandatory sackcloth yoke at the shoulders, bladder silk above the
// head — so no Gleaner is a single-value blot on a dark floor and the biggest light shape sits against the backdrop.
//
// Tell (both channels above the head, where no other faction puts anything): the bag SWELLS (rig.swell) and the gas
// LIGHTS (rig.gas, strobing on rig.strobe) while the core sets rig.tell / rig.tellWarn. Death: the gas goes out of the
// colour over 12 draws (rig.gasOut), matching the dead-lens convention.
import { P, FK } from './common.js';
import { celRect, celPoly, celBall, celPath, celCapsule, tones } from '../../art/shading.js';
import { getChain } from '../../art/secondary.js';
import { pathEllipse } from '../../art/shapes.js';
import { drawFist, drawBoot } from '../../art/rigParts.js';
import { FACE } from '../../art/poses.js';
import { rad } from '../../engine/math.js';
import { particles } from '../../engine/particles.js';
import { ST } from '../../constants.js';

const R = Math.round;

// ---------------------------------------------------------------- palette (ART_STYLE 0.1: the ladder runs bottom to top)
/** Warm violet-black outline: distinct from Brassbound #1A1E24, Sootborn #1E1A14, Stormcrow #191E2A. */
export const GLEAN_OUTLINE = '#15121A';
export const GLEAN = {
  night: '#1D1826',   // L* 0.094 — hood, wraps, coat skirt, lower legs, boots: the value that touches the floor
  plum: '#453C52',    // 0.270 — the coat above the belt, at chest height where no floor is
  sack: '#8A7C64',    // 0.527 — upper arms, cuffs and the MANDATORY yoke: the de-blobbing win
  zinc: '#B9C3C9',    // 0.782 — hooks, gaffs, winch drums, clogs. Never above the shoulders
  silk: '#AFC4CE',    // 0.779 — the gasbag: lightest value, biggest shape, the only mass above the head
  rose: '#FF57B0',    // 0.627 — tailings gas. Flat, no ramp (ART_STYLE 4)
  hot: '#FFD27A',     // the mandated 1-2px hot core inside every glow
  skin: '#C9A98C',    // only the Harvestman shows a face
  rope: '#6B5B44',
};
/** Chalk crop-marks (guild tallies, not clan dye): high-value desaturated strokes on the bladder. */
export const CHALK = { chaff: '#E8E2D0', winnow: '#D2A44E', thresher: '#C4634E', sickle: '#6E86A8', harvestman: '#7E9E6A' };
/**
 * Value ladder: night-rag forearm wraps + legs + boots (0.094) < soot-plum coat (0.270) < sackcloth sleeves, cuffs and
 * yoke (0.527) < wet zinc tools and clog caps (0.782). `sleeve` is deliberately NOT `primary` (ART_STYLE 0.1).
 */
export const GLEAN_PAL = {
  skin: GLEAN.night, hair: GLEAN.night, primary: GLEAN.plum, sleeve: GLEAN.sack, secondary: GLEAN.night,
  accent: GLEAN.sack, metal: GLEAN.zinc, dark: GLEAN.night, glow: GLEAN.rose,
};
/** ~72px at scale 1: 16px head, 20x24 torso, long thin dangling legs, small pointed feet. */
export const GLEAN_PROPS = {
  headR: 8, neck: 3, neckR: 3, torsoW: 20, torsoH: 24, hip: 17, upperArm: 14, lowerArm: 14, armR: 4, handR: 4.5,
  upperLeg: 15, lowerLeg: 14, legR: 4, footL: 10, footH: 4, bulge: 0.25, shoulderX: 3, hipX: 4,
};

// ---------------------------------------------------------------- the bladder (back accessory, torso space)
/** Per-variant bag geometry: [rx, ry, dx, dy]. The bag never leaves the top of the silhouette — only its SHAPE changes. */
const BAG = {
  slack: [16, 11, -7, 4],   // Chaff: half-filled, flopping off one shoulder — the only asymmetric bag
  tall: [10, 20, 0, -5],    // Winnow: standing on end like a zeppelin upended
  twin: [19, 13, 0, 0],     // Thresher: two over-pressured bags in a rope net
  taut: [11, 12, 0, 2],     // Sickle: small and taut, with the grapnel crooked over it
  canopy: [20, 14, 0, -7],  // Harvestman: a canopy held clear on a four-spar yoke
};

/** One gas bladder: rubberised silk with a patch seam, the gas inside it, and the hot core. */
function bagBody(ctx, rig, cx, cy, rx, ry, gas) {
  pathEllipse(ctx, cx, cy, rx, ry);
  celPath(ctx, rig, GLEAN.silk, cx, cy, Math.max(rx, ry), 0.34, 0.3);
  if (rig.override) return;
  const t = tones(rig, GLEAN.silk);
  ctx.fillStyle = t.sh; ctx.fillRect(R(cx - rx * 0.75), R(cy + ry * 0.1), R(rx * 0.7), 3);   // patch
  ctx.fillStyle = t.deep; ctx.fillRect(R(cx - rx * 0.2), R(cy - ry * 0.8), 1, R(ry * 1.6));  // seam
  if (gas <= 0.02) return;
  const gr = Math.max(3, R(rx * 0.5)), gy = R(cy + ry * 0.18);
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * (0.14 + gas * 0.62);
  ctx.fillStyle = rig.col(GLEAN.rose);
  pathEllipse(ctx, cx, gy, gr, Math.max(2.5, R(ry * 0.45))); ctx.fill();
  ctx.globalAlpha = a0;
  if (gas > 0.6) { ctx.fillStyle = rig.col(GLEAN.hot); ctx.fillRect(R(cx) - 1, gy - 1, 2, 2); }
}
/** Chalk crop-cross guild mark, stretched by the swell so the mark distorts as a second read. */
function cropMark(ctx, rig, cx, cy, k, col, tally) {
  if (rig.override) return;
  ctx.fillStyle = rig.col(col);
  const w = R(9 * k), h = R(8 * k);
  ctx.fillRect(R(cx - w / 2), R(cy) - 1, w, 2);
  ctx.fillRect(R(cx) - 1, R(cy - h / 2), 2, h);
  ctx.fillRect(R(cx - w / 2), R(cy - h / 2) - 2, 2, 2);
  for (let i = 0; i < tally; i++) ctx.fillRect(R(cx) + 6, R(cy - h / 2) + i * 3, 2, 2);
}
/** Sackcloth-lashed yoke under the bag (never zinc: the bladder is rope and lath). */
function bagYoke(ctx, rig, cy, spars) {
  const p = rig.p, top = -p.torsoH + 1;
  ctx.strokeStyle = rig.col(GLEAN.sack); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < spars; i++) {
    const x = (i - (spars - 1) / 2) * (spars > 2 ? 11 : 9);
    ctx.moveTo(R(x * 0.55), top); ctx.lineTo(R(x), R(cy));
  }
  ctx.stroke();
}
/**
 * The gas bladder (back accessory): the faction's whole read. Reads rig.swell (tell inflation), rig.gas (0..1),
 * rig.strobe (last tell frames), rig.bags (Winnow's remaining ballast) and build.bagShape / build.chalk.
 */
export function drawBladder(ctx, rig, pose) {
  const p = rig.p, b = rig.build, s = BAG[b.bagShape] || BAG.taut;
  const dead = (pose.face | 0) === FACE.dazed;
  if (dead && rig.gasOut == null) rig.gasOut = 0;
  if (rig.gasOut != null && rig.gasOut < 12) rig.gasOut++;
  const out = rig.gasOut != null ? Math.max(0, 1 - rig.gasOut / 12) : 1;
  const k = (rig.swell || 1) * (dead ? 0.66 : 1);
  let gas = (rig.gas != null ? rig.gas : 0.25) * out;
  if (rig.strobe && (rig.tick & 2)) gas = Math.min(1, gas + 0.6);
  const rx = R(s[0] * k), ry = R(s[1] * k), cx = R(s[2]), cy = R(-(p.torsoH + 21) + s[3] - (ry - s[1]));
  bagYoke(ctx, rig, cy + ry * 0.5, b.bagShape === 'canopy' ? 4 : 2);
  if (b.bagShape === 'twin') {
    bagBody(ctx, rig, cx - R(rx * 0.48), cy + 1, R(rx * 0.56), ry, gas);
    bagBody(ctx, rig, cx + R(rx * 0.48), cy - 1, R(rx * 0.56), ry, gas);
    if (!rig.override) {  // the rope net: the only cross-hatched shape on any Gleaner
      ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2; ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        const hy = R(cy + i * 7), hw = R(rx * (i ? 0.72 : 0.98)), vx = R(cx + i * 11), vh = R(ry * (i ? 0.8 : 0.96));
        ctx.moveTo(cx - hw, hy); ctx.lineTo(cx + hw, hy); ctx.moveTo(vx, cy - vh); ctx.lineTo(vx, cy + vh);
      }
      ctx.stroke();
    }
  } else bagBody(ctx, rig, cx, cy, rx, ry, gas);
  if (b.bagShape === 'taut') grapnelCoil(ctx, rig, cx, cy - ry, rx);
  if (b.bags != null || rig.bags != null) bandolier(ctx, rig, cy + ry);
  cropMark(ctx, rig, cx + R(rx * (b.bagShape === 'taut' ? 0.4 : 0.15)), cy - R(ry * (b.bagShape === 'taut' ? 0.15 : 0.5)), k, b.chalk || CHALK.chaff, rig.tally || (b.bagShape === 'canopy' ? 4 : 0));
}
/** Sickle only: a rope coil with a three-fluke zinc grapnel crooked OVER the bag — nothing else has that overhead crook. */
function grapnelCoil(ctx, rig, cx, cy, rx) {
  const gx = R(cx + rx * 0.95), gy = R(cy + 3);
  ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx - 4, cy - 1, 5, -0.5, 3.4); ctx.stroke();          // the coil, over the bag's shoulder
  ctx.beginPath(); ctx.moveTo(cx - 1, cy - 5); ctx.lineTo(gx - 1, gy - 9); ctx.stroke();
  celCapsule(ctx, rig, gx, gy - 9, gx, gy, 2, GLEAN.zinc, 0.3);                  // shank, half off the silk
  if (rig.override) return;
  ctx.strokeStyle = rig.col(GLEAN.zinc); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(gx - 5, gy - 2); ctx.quadraticCurveTo(gx, gy + 3, gx + 5, gy - 2); ctx.stroke();
  ctx.fillStyle = tones(rig, GLEAN.zinc).deep; ctx.fillRect(gx - 1, gy - 9, 2, 3);
}
/** Winnow only: the ballast bandolier hanging down the BACK (never across the torso), emptying one bag at a time. */
function bandolier(ctx, rig, y0) {
  const n = rig.bags != null ? rig.bags : 6, ch = lineChain(rig);
  ctx.save(); ctx.translate(-15, R(y0)); ctx.rotate(rad(ch.ang[0] * 0.7));   // the load swings on its lines
  if (!rig.override) {
    ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(-3, 40); ctx.stroke();
  }
  for (let i = 0; i < n; i++) celBall(ctx, rig, R(-1 - (i & 1) * 3), R(8 + i * 6), 3, GLEAN.sack, false);
  ctx.restore();
}

// ---------------------------------------------------------------- parts
/** Sack hood (head space): a soft peaked bag over the skull, open only at the chin. No visible face on four of five. */
export function gleanHood(ctx, rig, pose, inf) {
  const r = inf.r, pal = inf.pal;
  celPoly(ctx, rig, [R(r * 0.95), R(r * 0.15), R(r * 0.8), R(r * 0.7), R(-r * 0.3), R(r * 0.95), R(-r * 1.1), R(r * 0.5),
    R(-r * 1.5), R(-r * 0.5), R(-r * 0.9), R(-r * 1.1), R(r * 0.2), R(-r * 1.25), R(r * 0.95), R(-r * 0.6)], pal.secondary, 0.36, 0.26);
  if (rig.override) return;
  const t = tones(rig, pal.secondary);
  ctx.fillStyle = t.deep; ctx.fillRect(R(r * 0.1), R(r * 0.05), R(r * 0.85), 2);          // brim shadow over the slot
  ctx.fillStyle = rig.col(pal.sleeve || GLEAN.sack); ctx.fillRect(R(-r * 1.0), R(-r * 0.1), R(r * 0.5), 3); // drawstring knot
}
/**
 * The lit chin-slot (face hook): the only opening in the hood. It tightens on `grit`, opens on `shout`, dims on `hurt`
 * and goes dark when dazed; `build.jawFace` (the Harvestman officer) draws a real old man's jaw instead.
 */
export function gleanSlot(ctx, rig, pose, inf) {
  const r = inf.r, face = pose.face | 0, look = rig.look;
  const dazed = face === FACE.dazed, hurt = face === FACE.hurt;
  const lx = look ? R(look.x) : 0;
  if (rig.build.jawFace) {
    celPoly(ctx, rig, [R(r * 0.2), R(r * 0.15), R(r * 0.95), R(r * 0.2), R(r * 0.85), R(r * 0.75), R(r * 0.15), R(r * 0.9)], GLEAN.skin, 0.36, 0.3);
    if (rig.override) return;
    ctx.fillStyle = rig.col(dazed ? '#3A3440' : '#2A2230');
    if (face === FACE.shout) ctx.fillRect(R(r * 0.4), R(r * 0.35), 5, 5);
    else if (hurt || dazed) ctx.fillRect(R(r * 0.4), R(r * 0.45), 5, 3);
    else ctx.fillRect(R(r * 0.35), R(r * 0.5), 6, 2);
    ctx.fillStyle = tones(rig, GLEAN.skin).deep; ctx.fillRect(R(r * 0.25), R(r * 0.72), 6, 2);   // jaw shadow
    ctx.fillStyle = rig.col(GLEAN.sack); ctx.fillRect(R(r * 0.15), R(-r * 0.1), 5, 3);           // one lit eye-slot under the brim
    return;
  }
  if (rig.override) return;
  const lit = dazed ? '#3A3440' : hurt ? tones(rig, GLEAN.sack).sh : GLEAN.sack;
  const w = face === FACE.shout ? 6 : 5, h = face === FACE.grit || face === FACE.angry ? 2 : 3;
  ctx.fillStyle = rig.col(lit); ctx.fillRect(R(r * 0.2) + lx, R(r * 0.25), w, h);
  if (dazed) return;
  ctx.fillStyle = rig.col(rig.tell ? GLEAN.rose : tones(rig, GLEAN.sack).deep);
  ctx.fillRect(R(r * 0.2) + lx, R(r * 0.25) + h, w, 1);
}
/**
 * Soot-plum coat (torso space) with the MANDATORY sackcloth yoke: a collar band plus a broad strap crossing the chest,
 * which is what separates the sackcloth sleeves from a near-black body and carries the chalk crop-marks.
 */
export function gleanCoat(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal;
  celPoly(ctx, rig, [-hw + 1, -H + 3, -hw + 5, -H, hw - 4, -H, hw, -H + 4, hw + 1, R(-H * 0.35), hw - 1, 3, -hw + 1, 3, -hw - 1, R(-H * 0.35)], pal.primary, 0.3, 0.3);
  if (rig.override) return;
  const t = tones(rig, pal.primary), ts = tones(rig, GLEAN.sack);
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 1, R(-H * 0.14), W - 2, 1);
  ctx.fillStyle = rig.col(GLEAN.night); ctx.fillRect(-hw + 1, R(-H * 0.1), W - 2, R(H * 0.1) + 3);      // coat skirt, night-rag
  ctx.fillStyle = ts.base; ctx.fillRect(-hw - 1, -H + 1, W + 2, 6);                                    // collar
  ctx.fillStyle = ts.sh; ctx.fillRect(-hw - 1, -H + 6, W + 2, 1);
  ctx.beginPath(); ctx.moveTo(hw - 2, -H + 5); ctx.lineTo(hw - 2, -H + 11); ctx.lineTo(-hw + 2, R(-H * 0.2)); ctx.lineTo(-hw + 2, R(-H * 0.2) - 6); ctx.closePath();
  ctx.fillStyle = ts.base; ctx.fill();                                                                 // 6px yoke strap
  ctx.fillStyle = ts.sh; ctx.fillRect(R(-hw * 0.4), R(-H * 0.45), 5, 2);
  ctx.fillStyle = rig.col(rig.build.chalk || CHALK.chaff);
  ctx.fillRect(R(hw * 0.1), -H + 2, 2, 4); ctx.fillRect(R(hw * 0.1) - 3, -H + 3, 2, 2);                // chalk tick on the yoke
}
/** Night-rag hips on a rope belt with a zinc ring (hip space). */
export function gleanHips(ctx, rig, pose, inf) {
  const hip = inf.w, hw = R(hip / 2);
  celRect(ctx, rig, -hw, -5, hip, 11, 3, GLEAN.night, 0.4, 0.2);
  if (rig.override) return;
  const t = tones(rig, GLEAN.rope);
  ctx.fillStyle = t.base; ctx.fillRect(-hw + 1, -5, hip - 2, 3);
  ctx.fillStyle = t.sh; ctx.fillRect(-hw + 1, -2, hip - 2, 1);
  ctx.fillStyle = rig.col(GLEAN.zinc); ctx.fillRect(1, -6, 4, 4);
}
/** Hooked hand (hand space): a sackcloth-wrapped mitt against the night-rag forearm, with a zinc lift-hook. */
export function gleanHand(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.pal.sleeve);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, inf.pal.sleeve).deep; ctx.fillRect(R(inf.r * 1.3), R(-inf.r * 0.8), 2, R(inf.r * 1.6));
  ctx.strokeStyle = rig.col(inf.pal.metal); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(R(inf.r * 1.5), R(inf.r * 0.9), 3.5, -1.4, 1.9); ctx.stroke();
}
/** Night-rag clog (ankle space): small pointed foot with a zinc cap and a sackcloth ankle wrap. */
export function gleanFoot(ctx, rig, pose, inf) {
  drawBoot(ctx, rig, inf.w, inf.h, inf.pal.dark, inf.pal.metal);
  if (rig.override) return;
  const toe = R(inf.w * 0.62);
  ctx.fillStyle = rig.col(inf.pal.metal); ctx.fillRect(toe - 4, -1, 4, 3);
  ctx.fillStyle = tones(rig, inf.pal.metal).sh; ctx.fillRect(toe - 4, 2, 4, 1);
  ctx.fillStyle = rig.col(inf.pal.sleeve); ctx.fillRect(R(-inf.w * 0.4), R(-inf.h) - 3, R(inf.w * 0.8), 3);
}
/** Complete Gleaning part table. Arms and legs use the defaults: sackcloth sleeve + cuff over night-rag wraps. */
export const GLEAN_PARTS = { head: gleanHood, face: gleanSlot, torso: gleanCoat, hips: gleanHips, hand: gleanHand, foot: gleanFoot };

// ---------------------------------------------------------------- the hanging tools (ONE chain per rig: 'line')
/** Rotate into root space (hand accessories are entered rotated by the forearm angle) so a tool hangs straight down. */
function hangSpace(ctx, rig, far) {
  ctx.rotate(rad((far ? rig.joints.armF.hand : rig.joints.armN.hand) - 90));
}
/** The 'line' chain: 3 lagging segments hanging from the torso (ART_STYLE 7). */
function lineChain(rig) {
  return getChain(rig, 'line', 3, { joint: 'torso', rest: [0, 1], stiffness: 0.12, damping: 0.68, gain: 1.6, rotGain: 0.4, maxAng: 40 });
}
/**
 * Whatever a Gleaner carries hangs BELOW the hand on a wrist loop, never levelled out front: build.tool selects
 * 'gaff' (Chaff), 'hook' (Sickle) or 'horn' (Harvestman, the one strapped tool).
 */
export function drawWristTool(ctx, rig, pose) {
  const tool = rig.build.tool;
  if (tool === 'horn') {   // brass hailing horn strapped along the forearm (no line, it is lashed on)
    celPoly(ctx, rig, [1, -2.5, 10, -4, 15, -7, 16, 7, 10, 4, 1, 2.5], GLEAN.zinc, 0.36, 0.3);
    if (!rig.override) { ctx.fillStyle = tones(rig, GLEAN.zinc).deep; ctx.fillRect(4, -2, 6, 2); }
    return;
  }
  const ch = lineChain(rig);
  ctx.save(); hangSpace(ctx, rig, false); ctx.translate(0, 4);
  ctx.rotate(rad(ch.ang[0]));
  ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 6); ctx.stroke();
  ctx.translate(0, 6); ctx.rotate(rad(ch.ang[1]));
  if (tool === 'hook') {
    celCapsule(ctx, rig, 0, 0, 0, 7, 2, GLEAN.zinc, 0.3);
    if (!rig.override) { ctx.strokeStyle = rig.col(GLEAN.zinc); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-3, 7, 4, -0.6, 2.6); ctx.stroke(); }
  } else {
    celCapsule(ctx, rig, 0, 0, 0, 12, 2, GLEAN.zinc, 0.3);
    if (!rig.override) { ctx.strokeStyle = rig.col(GLEAN.zinc); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(-4, 12, 4.5, -0.5, 2.2); ctx.stroke(); }
  }
  ctx.restore();
}
/** Hip gear on the same line: 'drum' (Winnow's hand-crank winch), 'apron' (Thresher's kettle ballast), 'tags' (claim tags). */
export function drawHipGear(ctx, rig) {
  const kind = rig.build.hipGear;
  if (!kind) return;
  const hw = R(rig.p.hip / 2);
  if (kind === 'drum') {
    celRect(ctx, rig, hw - 3, -6, 11, 12, 3, GLEAN.zinc, 0.36, 0.3);
    if (rig.override) return;
    ctx.fillStyle = tones(rig, GLEAN.zinc).deep; ctx.fillRect(hw - 1, -4, 7, 2); ctx.fillRect(hw - 1, 1, 7, 2);
    ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hw + 3, -6); ctx.lineTo(hw + 7, -13); ctx.stroke();
    return;
  }
  const ch = lineChain(rig);
  ctx.save(); ctx.translate(0, 4); ctx.rotate(rad(ch.ang[0] * 0.6));
  if (kind === 'apron') {
    celPoly(ctx, rig, [-hw - 1, 1, hw + 1, 1, hw - 2, 13, -hw + 2, 13], GLEAN.zinc, 0.36, 0.3);
    if (!rig.override) { ctx.fillStyle = tones(rig, GLEAN.zinc).deep; ctx.fillRect(-hw + 2, 5, hw * 2 - 4, 2); ctx.fillRect(-hw + 2, 9, hw * 2 - 4, 2); }
  } else {
    for (let i = 0; i < 3; i++) celRect(ctx, rig, -hw + 2 + i * 6, 3 + (i & 1) * 3, 5, 6, 1, GLEAN.sack, 0.4, 0);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- shared animation set
/** Body on its back, bag crushed under it, arms flung: root rot -88 puts body-space +y along the ground. */
const FLOOR = { armR: [-24, -8], armL: [28, 18], torso: 2, head: -10, legR: [12, 10], legL: [-4, 8], footR: 0, footL: 0, root: [16, -8, -88], face: 'dazed' };
const AD = (a, du, dl) => [a[0] + du, a[1] + dl];

/**
 * Base Gleaning animation set for a rest carry `c` ({ armR, armL }): idle 4 / walk 8 / run 8 / flee 6 / jump / fall /
 * land / hurt 3 / stagger 2 / hurtAir 2 / knockdown 2 / lying 2 / getup 3 / dead 2 / dodge 5 (the bag-vent back-hop the
 * Sickle and Harvestman need for ai.evadeChance). Ground keys hang the feet: toe planted, heel off (root.y -2).
 */
export function makeGleanBase(c, o = {}) {
  const K = (s) => ({ torso: -3, head: 6, legR: [9, 6], legL: [-10, 8], footR: -22, footL: -19, root: [0, -2], ...c, ...s });
  const aR = c.armR, aL = c.armL;
  const walk = (lr, ll, ar, al, ty, sq) => K({ legR: lr, legL: ll, armR: ar, armL: al, torso: -3, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1 });
  const run = (lr, ll, ar, al, ty, sq) => K({ legR: lr, legL: ll, armR: ar, armL: al, torso: 10, head: -2, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, face: 'angry' });
  const flee = (lr, ll, i, ty) => K({ legR: lr, legL: ll, armR: [-150 + i * 12, -24], armL: [-168 - i * 8, -20], torso: 4, head: -8 + i * 4, root: [0, ty], face: 'hurt' });
  const anims = {
    // idle: the whole body swings a little under the bag instead of breathing from the chest
    idle: { loop: true, frames: [
      FK(14, K({ root: [0, -2] }), { ease: 'inout' }),
      FK(13, K({ torso: -5, head: 8, root: [1, -3], armR: AD(aR, 3, 2), armL: AD(aL, -3, 2), squash: 0.99, stretch: 1.01 }), { ease: 'inout' }),
      FK(14, K({ torso: -2, head: 5, root: [0, -1], armR: AD(aR, -2, -1), armL: AD(aL, 2, -1) }), { ease: 'inout' }),
      FK(13, K({ torso: -4, head: 7, root: [-1, -2], armR: AD(aR, 1, 1), armL: AD(aL, -1, 1) }), { ease: 'inout' }),
    ] },
    // walk: a light, toe-first drift — contact / down / pass / up x2, the arms trailing rather than pumping
    walk: { loop: true, frames: [
      FK(4, walk([30, 4], [-24, 18], AD(aR, -8, 2), AD(aL, 10, 2), -2), { ease: 'out' }),
      FK(4, walk([22, 14], [-14, 30], AD(aR, -3, 0), AD(aL, 5, 0), -1, 1.03), { ease: 'out' }),
      FK(4, walk([6, 26], [2, 14], AD(aR, 5, -2), AD(aL, -3, -2), -3), { ease: 'inout' }),
      FK(4, walk([-10, 18], [20, 2], AD(aR, 10, -2), AD(aL, -8, -2), -5), { ease: 'in' }),
      FK(4, walk([-24, 18], [30, 4], AD(aR, 10, 2), AD(aL, -8, 2), -2), { ease: 'out' }),
      FK(4, walk([-14, 30], [22, 14], AD(aR, 5, 0), AD(aL, -3, 0), -1, 1.03), { ease: 'out' }),
      FK(4, walk([2, 14], [6, 26], AD(aR, -3, -2), AD(aL, 5, -2), -3), { ease: 'inout' }),
      FK(4, walk([20, 2], [-10, 18], AD(aR, -8, -2), AD(aL, 10, -2), -5), { ease: 'in' }),
    ] },
    run: { loop: true, frames: [
      FK(3, run([48, 12], [-38, 52], [40, -30], [-56, -20], -4), { ease: 'out' }),
      FK(3, run([36, 28], [-26, 66], [26, -28], [-44, -18], -1, 1.04), { ease: 'out' }),
      FK(3, run([8, 40], [8, 28], [-4, -26], [-20, -18], -6), { ease: 'inout' }),
      FK(3, run([-22, 48], [36, 8], [-34, -24], [4, -20], -5), { ease: 'in' }),
      FK(3, run([-38, 52], [48, 12], [-56, -20], [40, -30], -4), { ease: 'out' }),
      FK(3, run([-26, 66], [36, 28], [-44, -18], [26, -28], -1, 1.04), { ease: 'out' }),
      FK(3, run([8, 28], [8, 40], [-20, -18], [-4, -26], -6), { ease: 'inout' }),
      FK(3, run([36, 8], [-22, 48], [4, -20], [-34, -24], -5), { ease: 'in' }),
    ] },
    // bolting: arms up on the lines, hauling the bag along
    flee: { loop: true, frames: [
      FK(3, flee([46, 10], [-36, 50], 0, -4), { ease: 'out' }), FK(3, flee([28, 36], [-18, 56], 1, -1), { ease: 'out' }), FK(3, flee([-8, 40], [22, 18], 2, -6), { ease: 'in' }),
      FK(3, flee([-36, 50], [46, 10], 1, -4), { ease: 'out' }), FK(3, flee([-18, 56], [28, 36], 0, -1), { ease: 'out' }), FK(3, flee([22, 18], [-8, 40], 2, -6), { ease: 'in' }),
    ] },
    jump: { loop: false, frames: [
      FK(3, K({ legR: [28, 38], legL: [-18, 42], torso: 8, root: [0, 2], squash: 1.1, stretch: 0.9, armR: AD(aR, -20, 10), armL: AD(aL, -20, 10) }), { ease: 'out' }),
      FK(4, K({ legR: [26, -26], legL: [10, -18], torso: -10, head: 2, root: [0, -6], squash: 0.94, stretch: 1.08, armR: AD(aR, -50, -20), armL: AD(aL, -50, -20) }), { ease: 'out' }),
      FK(30, K({ legR: [34, -60], legL: [16, -44], torso: -8, head: 4, armR: AD(aR, -34, -16), armL: AD(aL, -34, -16) }), { ease: 'inout' }),
    ] },
    fall: { loop: true, frames: [
      FK(10, K({ legR: [22, -28], legL: [6, -18], torso: -12, head: 2, armR: AD(aR, -60, -18), armL: AD(aL, -60, -18), face: 'grit' }), { ease: 'inout' }),
      FK(10, K({ legR: [28, -38], legL: [2, -12], torso: -16, head: 0, armR: AD(aR, -72, -18), armL: AD(aL, -72, -18), face: 'grit' }), { ease: 'inout' }),
    ] },
    land: { loop: false, frames: [
      FK(3, K({ legR: [32, 44], legL: [-22, 46], torso: 12, head: 10, root: [0, 1], squash: 1.16, stretch: 0.86, armR: AD(aR, -14, 14), armL: AD(aL, -14, 14), face: 'grit' }), { ease: 'out' }),
      FK(5, K({ legR: [14, 16], legL: [-10, 18], torso: 0, root: [0, -1], squash: 1.02, stretch: 0.98 }), { ease: 'out' }),
    ] },
    hurt: { loop: false, frames: [
      FK(4, K({ torso: -22, head: -18, armR: AD(aR, -30, -20), armL: AD(aL, -34, -20), root: [-5, -1], legR: [20, 4], legL: [-14, 12], face: 'hurt' }), { ease: 'out' }),
      FK(10, K({ torso: -10, head: -4, armR: AD(aR, -12, -8), armL: AD(aL, -14, -8), root: [-2, -1], legR: [12, 2], legL: [-10, 8], face: 'hurt' }), { ease: 'out' }),
      FK(6, K({ torso: -3, face: 'angry' }), { ease: 'out' }),
    ] },
    stagger: { loop: true, frames: [
      FK(6, K({ torso: 4, head: -12, root: [-3, -1], armR: [-36, -28], armL: [-48, -26], legR: [20, 12], legL: [-20, 16], face: 'dazed' }), { ease: 'inout' }),
      FK(6, K({ torso: -14, head: 10, root: [3, -2], armR: [-18, -38], armL: [-64, -18], legR: [16, 14], legL: [-24, 12], face: 'dazed' }), { ease: 'inout' }),
    ] },
    hurtAir: { loop: true, frames: [
      FK(6, { armR: [-92, -36], armL: [-104, -28], torso: -30, head: -22, legR: [40, 40], legL: [10, 58], root: [0, 0, -15], face: 'hurt' }, { ease: 'inout' }),
      FK(6, { armR: [-104, -46], armL: [-114, -28], torso: -36, head: -28, legR: [50, 30], legL: [20, 48], root: [0, 0, -26], face: 'hurt' }, { ease: 'inout' }),
    ] },
    knockdown: { loop: true, frames: [
      FK(8, { armR: [-62, -38], armL: [-82, -28], torso: -50, head: -18, legR: [50, 30], legL: [30, 50], root: [0, -6, -26], face: 'hurt' }, { ease: 'inout' }),
      FK(8, { armR: [-72, -48], armL: [-92, -28], torso: -56, head: -24, legR: [60, 20], legL: [40, 40], root: [0, -6, -36], face: 'hurt' }, { ease: 'inout' }),
    ] },
    lying: { loop: true, frames: [
      FK(16, { ...FLOOR, face: 'hurt' }, { ease: 'inout' }),
      FK(16, { ...FLOOR, torso: 6, head: -13, legR: [16, 12], face: 'hurt' }, { ease: 'inout' }),
    ] },
    getup: { loop: false, frames: [
      FK(8, { ...FLOOR, face: 'hurt' }, { ease: 'in' }),
      FK(8, { armR: [58, 38], armL: [-28, 38], torso: 28, head: -8, legR: [68, 58], legL: [-18, 58], root: [8, 2, -20], face: 'grit', squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
      FK(6, K({ torso: 2, root: [0, -1], legR: [14, 18], legL: [-10, 14], face: 'angry' }), { ease: 'out' }),
    ] },
    // death: the bladder rips, the body drops out of the air and the gas goes out of the colour (drawBladder)
    dead: { loop: false, frames: [
      FK(7, { ...FLOOR, legR: [42, -26], legL: [30, -18], armR: [-38, -18], armL: [46, 12], torso: -4, root: [16, -12, -92], squash: 1.06, stretch: 0.94 }, { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }] }),
      FK(60, { ...FLOOR, torso: 7, head: -14, legR: [10, 2], legL: [-8, 6], armR: [-28, -10], armL: [38, 22], root: [16, -8, -92] }),
    ] },
    // dodge: a bag-vent back-hop (ai.evadeChance) — crouch, vent, tuck, land
    dodge: { loop: false, frames: [
      FK(4, K({ torso: 10, root: [0, 1], legR: [34, 38], legL: [-18, 38], armR: AD(aR, -10, 12), armL: AD(aL, -10, 12), face: 'grit', squash: 1.08, stretch: 0.92 }), { sfx: 'dodge', ease: 'in' }),
      FK(6, K({ torso: -12, head: -6, root: [0, -20], legR: [38, -56], legL: [28, -46], armR: AD(aR, -40, -22), armL: AD(aL, -40, -22), face: 'closed', squash: 0.94, stretch: 1.06 }),
        { sfx: 'steam_vent', fx: [{ kind: 'steam', x: -10, y: 30, count: 3 }], ease: 'out' }),
      FK(5, K({ torso: -8, head: -2, root: [0, -12], legR: [30, -30], legL: [20, -22], armR: AD(aR, -22, -12), armL: AD(aL, -22, -12), face: 'closed' }), { ease: 'in' }),
      FK(4, K({ torso: 8, root: [0, 1], legR: [28, 34], legL: [-16, 34], armR: AD(aR, -8, 10), armL: AD(aL, -8, 10), face: 'grit', squash: 1.1, stretch: 0.9 }), { ease: 'out' }),
      FK(4, K({ torso: -3, root: [0, -2] }), { ease: 'out' }),
    ] },
  };
  if (o.extra) Object.assign(anims, o.extra);
  return anims;
}

/**
 * Shared hooks (every variant merges these first): the two-channel tell state the bladder reads, and the faction rule.
 * SHOT DOWN — this 1.25x on top of the core's own 1.2x air bonus (fighter.js) makes any hit on an airborne Gleaner 1.5x,
 * and the engine's juggle branch has already turned it into a juggle before the hook returns. Air time is the liability.
 */
export const BASE_HOOKS = {
  onUpdate(f) {
    const r = f.rig;
    r.swell = r.tell ? (r.tellWarn ? 1.18 : 1.12) : 1;
    r.gas = r.tell ? 1 : 0.25;
    r.strobe = !!r.tellWarn;
    if (f.aiState === 'FLEE' && f.state === ST.RUN && f.anim.name === 'run') f.play('flee');
  },
  onHitTaken(f, h) {
    if (!f.airborne || f.dead) return undefined;
    return { ...h, damage: Math.round((h.damage || 0) * 1.25) };
  },
  onLanded(f, world) {
    if (f.dead) return;
    ventPuff(f, 4, 0.8);
    world.addFx('dust', f.x, 0, f.z, { count: 4 });
  },
};

/** Rose vapour vented out of the bag (release, landings, the airborne trail). */
export function ventPuff(f, count = 5, up = 1.2) {
  particles.burst('steam', f.x - f.facing * 8, f.y + f.h * 0.8, f.z, count, { speed: 1.2, up, color: GLEAN.rose, sizeJitter: 1.2 });
}

export { P, FK };
