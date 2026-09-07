// Stormcrow rig: the shared cel-shaded aeronaut paper-doll used by content/enemies/stormcrow.js and the two
// Stage 2 bosses (midboss2.js, boss2.js). Pure art + animation data (ARCHITECTURE.md section 14).
//
// Faction read (docs/STAGE2.md section 2, art direction "sky privateers"): the Ninth Aeronaut Wing is not a
// uniformed regiment — it is a press-ganged crew of aeronaut freebooters who bought their own kit. Where the
// Brassbound are boxy steel and the Sootborn are round green, a Stormcrow is a WEATHERED FLYER: bare face under
// goggles, a scarf streaming off the neck, oiled canvas sleeves, patched leather and brass. Silhouette, headgear
// and back piece change completely from variant to variant; what makes them one faction is the kit language —
// a wine WING ARMBAND on the upper arm, a brass wing badge, goggles/lenses somewhere on the head, and STATIC
// VIOLET as the only energy colour (never aether cyan, which belongs to the Concordat's machinery).
//
// Value ladder (docs/ART_STYLE.md section 0.1 / 3): light canvas sleeves > warm skin > pale slate trousers >
// slate/teal/violet coat > dark plum leather boots > near-black outline. Sleeves are NEVER the coat colour and the
// trousers, boots and every Stage 2 floor (grey grate, brown plank, pale timber) sit in three different bands.
//
// Every hook draws in the local space art/rig.js sets up (limbs: origin at the joint, +y along the segment; hand and
// weapon: +x along the forearm; torso: origin at the hip centre, y up negative; head: origin at the head centre).
// Far-side parts colour from `inf.pal` (module constants go through farTone once, at module level).
import { P, FACE } from '../../art/poses.js';
import { celRect, celBall, celPoly, celCapsule, celTaper, tones, rimTop } from '../../art/shading.js';
import { drawFist, drawSkull, drawFace, drawBelt } from '../../art/rigParts.js';
import { farShade } from '../../art/palettes.js';
import { getChain } from '../../art/secondary.js';
import { rad } from '../../engine/math.js';

const R = Math.round, TAU = Math.PI * 2;
const EMPTY = {};

/** Stormcrow colour constants. */
export const CROW = {
  coat: '#4C5C82', coatDark: '#33405C',
  leather: '#6A4C34', leatherDark: '#4A3524', strap: '#8A6A44',
  canvas: '#D8CDB2', canvasSh: '#A99C80', duck: '#8C99AE',
  pewter: '#9AA6B4', pewterDark: '#5C6675', copper: '#A8763F', brass: '#C89B3C',
  glass: '#BBD4E8', glassHot: '#FFF4CE',
  boot: '#4C3A44',
  skin: '#E2AE83', hair: '#3A2A24', beard: '#7A6E5E',
  wine: '#8E2F38', spark: '#9B7BFF', sparkPale: '#D7CBFF',
  rope: '#C0A87C', outline: '#1B1E28',
};
/** Far-side copies of the module constants (never darken twice: far parts pick these, near parts the originals). */
export const farTone = (hex) => farShade(hex, 0.62, 0.25);
const WINE_F = farTone(CROW.wine), LEATHER_F = farTone(CROW.leather), STRAP_F = farTone(CROW.strap),
  PEWTER_F = farTone(CROW.pewter), BOOT_F = farTone(CROW.boot), ROPE_F = farTone(CROW.rope);

/** Base value ladder: light canvas sleeves over a slate coat, pale slate trousers, dark plum boots, brass fittings. */
export const CROW_PAL = {
  skin: CROW.skin, hair: CROW.hair, primary: CROW.coat, sleeve: CROW.canvas, secondary: CROW.duck,
  accent: CROW.brass, metal: CROW.pewter, dark: CROW.boot, glow: CROW.spark,
};
/** Lean aeronaut build: the five variants each re-space this (see stormcrow.js). ~74px tall at scale 1. */
export const CROW_PROPS = {
  headR: 8.5, neck: 3, neckR: 3.2, torsoW: 21, torsoH: 27, hip: 17, upperArm: 14, lowerArm: 13, armR: 4,
  handR: 4.5, upperLeg: 16, lowerLeg: 15, legR: 5, footL: 12, footH: 5, bulge: 0.45, shoulderX: 3, hipX: 4,
};
/** Keyframe shorthand: FK(dur, poseSpec, extraFrameFields). */
export const FK = (dur, spec, extra) => ({ dur, pose: P(spec), ...(extra || {}) });

// ---------------------------------------------------------------- head, face, the faction tell
/**
 * Bare aeronaut skull (head hook). `build.crow.hair`: 'crop' (default cap), 'bald', 'loose' (drawn by the headgear),
 * 'queue' (a braid on a 2-link chain down the back).
 */
export function crowHead(ctx, rig, pose, inf) {
  const r = inf.r, k = rig.build.crow || EMPTY, pal = inf.pal;
  if (k.hair === 'queue' && !rig.override) drawQueue(ctx, rig, r, pal.hair);
  drawSkull(ctx, rig, r, pal.skin, k.hair === 'bald' || k.hair === 'loose' ? null : pal.hair, null);
  if (rig.override || !k.stubble) return;
  ctx.fillStyle = tones(rig, pal.skin).sh;
  ctx.fillRect(R(-r * 0.5), R(r * 0.52), R(r * 1.4), 3);
}
/** Tarred queue: a 2-segment braid hanging off the back of the skull (drawn under the skull). */
function drawQueue(ctx, rig, r, hair) {
  const ch = getChain(rig, 'queue', 2, { joint: 'head', rest: [-1, 0.5], stiffness: 0.15, damping: 0.66, gain: 2, rotGain: 0.5, maxAng: 34 });
  ctx.save(); ctx.translate(R(-r * 0.8), R(-r * 0.2));
  for (let i = 0; i < 2; i++) {
    ctx.rotate(rad(ch.ang[i] + (i ? 12 : 26)));
    celPoly(ctx, rig, [-2, 0, 3, 0, 2, 10, -2, 10], hair, 0.4, 0.25);
    ctx.translate(0, 10);
  }
  ctx.restore();
}
/**
 * Face (face hook): the eyes are the whole point of this pass — the Stormcrows are people, not masks. Pupils track
 * the target through `rig.look`; a wind-up floods the sockets with static (see crowTell, drawn over the headgear).
 */
export function crowFace(ctx, rig, pose, inf) {
  const r = inf.r, k = rig.build.crow || EMPTY;
  drawFace(ctx, rig, r, pose.face | 0, k.faceOpts || null);
  if (rig.override) return;
  const look = rig.look;
  if (!look || (pose.face | 0) === FACE.dazed || (pose.face | 0) === FACE.closed) return;
  // 1px pupil nudge toward the target (kept inside the whites drawn above)
  const ey = R(-r * 0.15) + (k.faceOpts && k.faceOpts.eyeY || 0), dx = look.x > 0.35 ? 1 : look.x < -0.35 ? -1 : 0;
  if (!dx) return;
  ctx.fillStyle = rig.col('#1a1418');
  ctx.fillRect(R(r * 0.45) + 1 + dx, ey, 2, 2); ctx.fillRect(R(-r * 0.12) - 1 + dx, ey, 2, 2);
}
/**
 * The faction tell, drawn by every headgear as its last mark: while `rig.tell` runs, static crawls off the goggle
 * glass in violet arcs (hot white and blinking once `rig.tellWarn` says the hit is about to land). One unmistakable
 * light per head, whatever the head is wearing.
 */
export function crowTell(ctx, rig, r, gx, gy) {
  if (rig.override || !rig.tell) return;
  const warn = rig.tellWarn && (rig.tick & 2) !== 0;
  ctx.fillStyle = warn ? 'rgba(255,255,255,0.4)' : 'rgba(155,123,255,0.3)';
  ctx.beginPath(); ctx.arc(gx, gy, r * 0.85, 0, TAU); ctx.fill();
  ctx.strokeStyle = rig.col(warn ? '#FFFFFF' : CROW.sparkPale); ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = rig.tick * 0.5 + i * 2.1;
    ctx.beginPath(); ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(a) * (r * 0.9), gy + Math.sin(a) * (r * 0.9));
    ctx.stroke();
  }
}
/** Goggle pair on a strap (head space, `cy` above the brow line): two brass rims with sky-glass, the shared kit mark. */
export function crowGoggles(ctx, rig, r, cy, glass) {
  if (!rig.override) { ctx.fillStyle = rig.col(CROW.leatherDark); ctx.fillRect(R(-r * 1.1), cy - 2, R(r * 2.2), 4); }
  const g = glass || CROW.glass;
  for (let i = 0; i < 2; i++) {
    const cx = i ? R(r * 0.55) : R(-r * 0.35);
    celBall(ctx, rig, cx, cy, 4.6, CROW.brass, false);
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fillStyle = rig.col(rig.tell ? CROW.glassHot : g); ctx.fill();
    if (!rig.override) { ctx.fillStyle = rig.col('#FFFFFF'); ctx.fillRect(cx - 2, cy - 2, 2, 1); }
  }
}
/** Grey privateer beard: ONE chain-sheared polygon in two segments, a value step off both skin and smock. */
export function crowBeard(ctx, rig, pose, inf) {
  const k = rig.build.crow || EMPTY;
  if (!k.beard) return;
  const r = inf.r, col = k.beard === true ? CROW.beard : k.beard;
  const ch = getChain(rig, 'beard', 2, { joint: 'head', rest: [0, 1], stiffness: 0.16, damping: 0.66, gain: 1.5, rotGain: 0.4, maxAng: 26 });
  ctx.save(); ctx.translate(R(r * 0.1), R(r * 0.5));
  for (let i = 0; i < 2; i++) {
    ctx.rotate(rad(ch.ang[i] + (i ? 5 : 0)));
    // jaw first (a wedge that follows the cheek down to the chin), then the hanging tip
    if (i) celPoly(ctx, rig, [-3, 0, 6, -2, 5, 8, -1, 9], col, 0.4, 0.3);
    else celPoly(ctx, rig, [-6, -2, 2, -4, 9, 0, 8, 6, -4, 7], col, 0.4, 0.3);
    ctx.translate(0, 6);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- torso / hips / limbs
/**
 * Body garment (torso hook). `build.crow.coat` picks the cut, and the cut is most of the silhouette:
 * 'jerkin' short cut-down leather bolero over a shirt | 'oilskin' long coat with a shoulder capelet |
 * 'smock' barrel-chested powder smock with a canvas apron | 'duster' narrow closed duster with a rubber gorget |
 * 'plate' riveted breastplate. Everyone wears the Wing badge; the watch chevron is `build.clan`.
 */
export function crowCoat(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal, k = rig.build.crow || EMPTY, cut = k.coat || 'oilskin';
  const t = tones(rig, pal.primary);
  if (cut === 'jerkin') {
    // shirt first (the whole trunk), then a short leather bolero that stops well above the belt
    celPoly(ctx, rig, [-hw + 1, -H + 3, hw - 1, -H + 3, hw + 2, 2, -hw - 2, 2], CROW.canvas, 0.36, 0.3);
    celPoly(ctx, rig, [-hw - 2, -H + 5, -hw + 2, -H - 1, hw - 2, -H - 1, hw + 2, -H + 5, hw + 1, R(-H * 0.34), R(W * 0.16), R(-H * 0.26), R(-W * 0.14), R(-H * 0.4), -hw - 1, R(-H * 0.3)], pal.primary, 0.36, 0.28);
    if (rig.override) return;
    ctx.fillStyle = rig.col(CROW.canvasSh); ctx.fillRect(-hw + 2, R(-H * 0.2), W - 4, 2);
  } else if (cut === 'smock') {
    celPoly(ctx, rig, [-hw - 3, -H + 6, -hw + 2, -H - 1, hw - 2, -H - 1, hw + 3, -H + 6, hw + 4, 2, -hw - 4, 2], pal.primary, 0.36, 0.28);
    // canvas powder apron: light, narrow, hung from a neck cord
    celPoly(ctx, rig, [R(-W * 0.22), R(-H * 0.6), R(W * 0.24), R(-H * 0.64), R(W * 0.3), 2, R(-W * 0.3), 2], CROW.canvasSh, 0.36, 0.24);
    if (rig.override) return;
    ctx.fillStyle = rig.col(CROW.leatherDark); ctx.fillRect(R(-W * 0.24), R(-H * 0.64), R(W * 0.5), 3);
    ctx.fillStyle = tones(rig, CROW.canvasSh).deep; ctx.fillRect(R(-W * 0.2), R(-H * 0.26), R(W * 0.44), 2);
  } else if (cut === 'duster') {
    celPoly(ctx, rig, [-hw - 1, -H + 4, -hw + 2, -H - 2, hw - 2, -H - 2, hw + 1, -H + 4, hw + 2, 2, -hw - 2, 2], pal.primary, 0.36, 0.28);
    // insulated rubber gorget standing up round the throat + a row of storm buttons
    celRect(ctx, rig, -hw + 1, -H - 5, W - 2, 7, 2, CROW.pewterDark, 0.36, 0.3);
    if (rig.override) return;
    ctx.fillStyle = rig.col(CROW.brass);
    for (let i = 0; i < 3; i++) ctx.fillRect(R(W * 0.06), -H + 6 + i * 7, 3, 3);
  } else if (cut === 'plate') {
    celPoly(ctx, rig, [-hw - 2, -H + 4, -hw + 2, -H - 1, hw - 2, -H - 1, hw + 2, -H + 4, hw + 3, 2, -hw - 3, 2], pal.primary, 0.36, 0.28);
    // riveted breastplate over the chest, two bands
    celPoly(ctx, rig, [R(-W * 0.42), -H + 2, R(W * 0.42), -H + 2, R(W * 0.46), R(-H * 0.3), 0, R(-H * 0.12), R(-W * 0.46), R(-H * 0.3)], CROW.pewterDark, 0.34, 0.34);
    if (rig.override) return;
    ctx.fillStyle = rig.col(rig.build.clan || CROW.wine); ctx.fillRect(R(-W * 0.4), R(-H * 0.52), R(W * 0.8), 3);
    rimTop(ctx, rig, R(-W * 0.4), -H + 3, R(W * 0.4), -H + 3, CROW.pewter);
  } else {
    // oilskin: long storm coat with a lapel V and a short shoulder capelet over it
    celPoly(ctx, rig, [-hw - 2, -H + 4, -hw + 1, -H - 1, hw - 1, -H - 1, hw + 2, -H + 4, hw + 3, 2, -hw - 3, 2], pal.primary, 0.36, 0.28);
    celPoly(ctx, rig, [-hw - 3, -H + 2, -hw + 2, -H - 2, hw - 2, -H - 2, hw + 3, -H + 2, hw + 2, R(-H * 0.52), -hw - 2, R(-H * 0.52)], CROW.coatDark, 0.4, 0.22);
    if (rig.override) return;
    ctx.fillStyle = rig.col(CROW.canvas);
    ctx.beginPath(); ctx.moveTo(R(-W * 0.2), -H + 1); ctx.lineTo(R(W * 0.2), -H + 1); ctx.lineTo(0, R(-H * 0.5)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tones(rig, CROW.coatDark).deep; ctx.fillRect(-hw + 1, R(-H * 0.52), W - 2, 1);
  }
  crowChest(ctx, rig, W, H, t);
}
/** The kit that says "Ninth Wing" on every cut: the watch chevron and the brass wing badge above it. */
function crowChest(ctx, rig, W, H, t) {
  if (rig.override) return;
  const clan = rig.build.clan || CROW.wine, hw = R(W / 2);
  ctx.fillStyle = rig.col(clan);
  ctx.beginPath(); ctx.moveTo(R(-W * 0.34), R(-H * 0.62)); ctx.lineTo(R(-W * 0.1), R(-H * 0.74)); ctx.lineTo(R(-W * 0.34), R(-H * 0.86)); ctx.lineTo(R(-W * 0.42), R(-H * 0.86)); ctx.lineTo(R(-W * 0.18), R(-H * 0.74)); ctx.lineTo(R(-W * 0.42), R(-H * 0.62)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rig.col(CROW.brass); ctx.fillRect(R(W * 0.2), R(-H * 0.76), 5, 3);
  ctx.fillStyle = tones(rig, CROW.brass).deep; ctx.fillRect(R(W * 0.2), R(-H * 0.73), 5, 1);
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 1, R(-H * 0.14), W - 2, 1);
}
/** Trousers + a broad leather belt with a brass buckle and one hip pouch (hips hook). */
export function crowHips(ctx, rig, pose, inf) {
  const hip = inf.w, hw = R(hip / 2), pal = inf.pal;
  drawBelt(ctx, rig, hip, pal.secondary, CROW.leatherDark, pal.accent);
  if (rig.override) return;
  const t = tones(rig, CROW.leather);
  ctx.fillStyle = t.base; ctx.fillRect(-hw - 2, -3, 7, 8);
  ctx.fillStyle = t.sh; ctx.fillRect(-hw - 2, 3, 7, 2);
}
/** Sleeve with the wine WING ARMBAND above the elbow — the faction marker every variant keeps (armUpper hook). */
export function crowArmUpper(ctx, rig, pose, inf) {
  const r = inf.r, len = inf.len, sleeve = inf.pal.sleeve || inf.pal.primary;
  celTaper(ctx, rig, 0, 0, 0, len, r * 1.12, r * 0.95, sleeve, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(inf.far ? WINE_F : CROW.wine); ctx.fillRect(-r, R(len * 0.5), r * 2, 4);
  ctx.fillStyle = rig.col(inf.far ? farTone(CROW.brass) : CROW.brass); ctx.fillRect(-1, R(len * 0.5) + 1, 2, 2);
}
/** Bare forearm rolled out of the sleeve, with the sleeve turned back into a 3px cuff (armLower hook). */
export function crowArmLower(ctx, rig, pose, inf) {
  const r = inf.r, len = inf.len, pal = inf.pal;
  celCapsule(ctx, rig, 0, 0, 0, len, r, pal.skin, 0.3);
  if (rig.override) return;
  const cuff = tones(rig, pal.sleeve || pal.primary);
  ctx.fillStyle = cuff.base; ctx.fillRect(R(-r) - 1, 0, r * 2 + 2, 4);
  ctx.fillStyle = cuff.sh; ctx.fillRect(R(-r) - 1, 3, r * 2 + 2, 1);
}
/** Fingerless flight glove: bare knuckles with a leather strap across the back of the hand (hand hook). */
export function crowHand(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.pal.skin);
  if (rig.override) return;
  ctx.fillStyle = rig.col(inf.far ? LEATHER_F : CROW.leather);
  ctx.fillRect(R(-inf.r * 0.5), R(-inf.r * 0.9), R(inf.r * 1.1), 3);
}
/** Thigh: tapered so it swells at the hip and narrows into the knee (legUpper hook). */
export function crowLegUpper(ctx, rig, pose, inf) {
  celTaper(ctx, rig, 0, 0, 0, inf.len, inf.r * 1.1, inf.r * 0.96, inf.pal.secondary, 0.3);
}
/** Shin with a strapped leather knee patch at the top so the leg reads as two bones, not one tube (legLower hook). */
export function crowLegLower(ctx, rig, pose, inf) {
  const r = inf.r, len = inf.len, pal = inf.pal;
  celCapsule(ctx, rig, 0, 0, 0, len, r, pal.secondary, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(inf.far ? LEATHER_F : CROW.leather); ctx.fillRect(R(-r) - 1, -1, r * 2 + 2, 4);
  ctx.fillStyle = rig.col(inf.far ? STRAP_F : CROW.strap); ctx.fillRect(R(-r) - 1, 3, r * 2 + 2, 1);
}
/** Flight boot: dark plum leather with a turned-down canvas cuff and a pewter toe cap (foot hook, ankle space). */
export function crowBoot(ctx, rig, pose, inf) {
  const w = inf.w, h = inf.h, pal = inf.pal, heel = R(w * 0.4), toe = R(w * 0.66);
  celPoly(ctx, rig, [-heel, -h - 3, toe - 5, -h - 3, toe, -h + 2, toe, 2, -heel, 2], pal.dark, 0.36, 0.26);
  if (rig.override) return;
  const t = tones(rig, pal.dark);
  ctx.fillStyle = rig.col(inf.far ? ROPE_F : CROW.rope); ctx.fillRect(-heel, -h - 3, toe + heel - 4, 3);
  ctx.fillStyle = rig.col(inf.far ? PEWTER_F : CROW.pewter); ctx.fillRect(toe - 6, -h + 2, 6, 4);
  ctx.fillStyle = t.deep; ctx.fillRect(-heel, 1, toe + heel, 2);
}

// ---------------------------------------------------------------- shared kit: scarf, coat tails
/** Neck scarf on a 3-link chain — the signature streamer of the freebooter silhouette (torso accessory). */
export function crowScarf(ctx, rig) {
  const p = rig.p, k = rig.build.crow || EMPTY, col = k.scarf || CROW.wine, n = k.scarfLen || 3;
  const ch = getChain(rig, 'scarf', n, { joint: 'torso', rest: [-1, 0.2], stiffness: 0.14, damping: 0.66, gain: 2.4, rotGain: 0.6, maxAng: 44 });
  const y = -p.torsoH + 1;
  celRect(ctx, rig, R(-p.torsoW * 0.32), y - 3, R(p.torsoW * 0.64), 5, 2, col, 0.4, 0.25);
  // the loose end streams back and down over the shoulder (never across the chest: ART_STYLE section 0.6)
  ctx.save(); ctx.translate(R(-p.torsoW * 0.28), y + 1);
  for (let i = 0; i < n; i++) {
    ctx.rotate(rad(ch.ang[i] + (i ? 8 : 46)));
    celPoly(ctx, rig, [-2, 0, 3, 0, 2, 8, -3, 7], col, 0.42, 0);
    ctx.translate(0, 7);
  }
  ctx.restore();
}
/** Coat tails: two swept panels on a 2-link chain so they lag behind the run (back accessory, torso space). */
export function crowTails(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), k = rig.build.crow || EMPTY, len = k.tailLen || 22;
  const ch = getChain(rig, 'tails', 2, { joint: 'torso', rest: [0, 1], stiffness: 0.15, damping: 0.68, gain: 2.2, rotGain: 0.5, maxAng: 42 });
  for (let i = 0; i < 2; i++) {
    ctx.save(); ctx.translate(i ? -hw + 3 : hw - 5, -2); ctx.rotate(rad(ch.ang[0] * (i ? 1.15 : 0.85)));
    celPoly(ctx, rig, [-4, 0, 5, 0, 4, len - 4, -1, len, -6, len - 4], i ? CROW.coatDark : rig.palette.primary, 0.4, 0.2);
    ctx.restore();
  }
}
/**
 * Folded wing-pack (back accessory, torso space): a copper spine canister and two RIBBED vanes with visible feather
 * spars, splayed even when stowed so the shape reads as a wing rather than a grey lozenge. The vanes snap open (and
 * spark violet) while `rig.wings` is set by a hook — the faction's "I am about to move" read.
 */
export function crowWings(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), open = rig.wings ? 1 : 0;
  const x = -hw - 2, y = -R(p.torsoH * 0.74);
  for (let i = 0; i < 2; i++) {
    const a = -26 - i * 34 - open * 30;
    ctx.save(); ctx.translate(x + 1, y + i * 6); ctx.rotate(rad(a));
    const L = 24 + open * 9;
    celPoly(ctx, rig, [0, -4, -L * 0.5, -8, -L, -5, -L - 5, 2, -L * 0.55, 5, 0, 5], i ? CROW.coatDark : CROW.pewterDark, 0.38, 0.24);
    if (!rig.override) {
      const t = tones(rig, i ? CROW.coatDark : CROW.pewterDark);
      ctx.fillStyle = t.hi;
      for (let s = 0; s < 3; s++) ctx.fillRect(R(-6 - s * (L / 3)), -4 + s, 2, 8 - s * 2);
      ctx.fillStyle = rig.col(CROW.canvasSh); ctx.fillRect(R(-L + 3), -3, R(L * 0.6), 2);
    }
    ctx.restore();
  }
  celCapsule(ctx, rig, x, y - 4, x, y + 12, 4, CROW.copper, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(open ? CROW.sparkPale : CROW.spark);
  ctx.fillRect(x - 2, y + 3, 3, 4);
}

// ---------------------------------------------------------------- shared animation set
/** Body face-up on the deck (root rot -88: the coat spreads, the goggles point at the sky). */
const FLOOR = { armR: [-22, -6], weapon: -14, armL: [28, 18], torso: 3, head: -12, legR: [12, 10], legL: [-4, 8], root: [26, -8, -88], grip: 0, face: 'dazed' };
/** Arm shorthand: nudge an [upper, lower] pair. */
export const AD = (a, du, dl) => [a[0] + du, a[1] + dl];

/**
 * Shared Stormcrow base animation set, parameterised by the rest carry `c` ({ armR, armL, weapon, grip? }) and the
 * variant's STANCE (`o.lean` torso angle, `o.legR` / `o.legL` planted legs, `o.head`) — the stance is half of what
 * makes five aeronauts read as five people rather than one uniform. Sea-legs gait: the torso counter-rotates on
 * every step, the free arm swings wide and the scarf / coat tails (secondary chains) do the rest.
 * Covers idle 4 / walk 8 / run 8 / jump / fall / land / hurt 3 / stagger 4 / hurtAir / knockdown / lying 2 /
 * getup 3 / dead 2 / dodge 5 (the wing-pack back-hop). `o.holdOffArm` keeps a strapped shield still while moving.
 */
export function makeCrowBase(c, o = {}) {
  const hold = !!o.holdOffArm, st = o.stagger || EMPTY;
  const lean = o.lean != null ? o.lean : 3, hd = o.head != null ? o.head : -2;
  const LR = o.legR || [8, 4], LL = o.legL || [-8, 6];
  const K = (s) => ({ torso: lean, head: hd, legR: LR, legL: LL, ...c, ...s });
  const walk = (lr, ll, al, ty, tw, sq, fr, fl) => K({ legR: lr, legL: ll, armL: hold ? c.armL : al, armR: AD(c.armR, 4, -4), torso: lean + tw, head: hd - tw * 0.5, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, footR: fr || 0, footL: fl || 0 });
  const run = (lr, ll, al, ty, sq) => K({ legR: lr, legL: ll, armL: hold ? AD(c.armL, 18, -18) : al, armR: AD(c.armR, -14, -6), torso: lean + 19, head: hd - 10, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, face: 'grit' });
  return {
    // idle: weight shifting from boot to boot, the coat settling, a slow scan of the deck
    idle: { loop: true, frames: [
      FK(16, K({ root: [0, 0] }), { ease: 'inout' }),
      FK(14, K({ torso: lean + 2, head: [hd + 3, 1, 0], root: [0, 1], armR: AD(c.armR, 2, -2), armL: AD(c.armL, -3, -2), squash: 1.02, stretch: 0.98 }), { ease: 'inout' }),
      FK(16, K({ torso: lean - 1, head: [hd - 3, 0, 0], root: [0, 0], armR: AD(c.armR, 1, -1) }), { ease: 'inout' }),
      FK(14, K({ torso: lean, head: [hd + 5, -1, 0], root: [0, 1], armL: AD(c.armL, 3, 2) }), { ease: 'inout' }),
    ] },
    // walk: contact / down (squash) / pass / up, torso counter-rotating so the scarf and tails swing
    walk: { loop: true, frames: [
      FK(4, walk([30, 4], [-24, 18], [10, -6], 0, 3, 0, -8, 0), { ease: 'out' }),
      FK(4, walk([24, 14], [-16, 30], [2, -8], 2, 2, 1.03, 0, 0), { ease: 'out' }),
      FK(4, walk([6, 26], [0, 10], [-14, -12], 1, 0, 0, 0, 0), { ease: 'inout' }),
      FK(4, walk([-10, 14], [18, -2], [-30, -14], -1, -2, 0, 0, -6), { ease: 'in' }),
      FK(4, walk([-24, 18], [30, 4], [-42, -16], 0, -3, 0, 0, -8), { ease: 'out' }),
      FK(4, walk([-16, 30], [24, 14], [-36, -16], 2, -2, 1.03, 0, 0), { ease: 'out' }),
      FK(4, walk([0, 10], [6, 26], [-22, -14], 1, 0, 0, 0, 0), { ease: 'inout' }),
      FK(4, walk([18, -2], [-10, 14], [-8, -10], -1, 2, 0, -6, 0), { ease: 'in' }),
    ] },
    run: { loop: true, frames: [
      FK(3, run([56, 14], [-44, 58], [44, -46], -2), { ease: 'out' }),
      FK(3, run([44, 30], [-32, 72], [26, -44], 1, 1.05), { ease: 'out' }),
      FK(3, run([12, 42], [10, 30], [-8, -40], -4), { ease: 'inout' }),
      FK(3, run([-26, 52], [42, 8], [-42, -40], -3), { ease: 'in' }),
      FK(3, run([-44, 58], [56, 14], [-54, -44], -2), { ease: 'out' }),
      FK(3, run([-32, 72], [44, 30], [-38, -46], 1, 1.05), { ease: 'out' }),
      FK(3, run([10, 30], [12, 42], [2, -44], -4), { ease: 'inout' }),
      FK(3, run([42, 8], [-26, 52], [30, -46], -3), { ease: 'in' }),
    ] },
    jump: { loop: false, frames: [
      FK(3, K({ legR: [32, 42], legL: [-20, 46], torso: lean + 9, root: [0, 4], squash: 1.1, stretch: 0.9, armL: [-28, 30] }), { ease: 'out' }),
      FK(4, K({ legR: [30, -30], legL: [10, -20], torso: lean - 9, head: hd - 6, root: [0, -2], squash: 0.94, stretch: 1.08, armL: [-70, -30] }), { ease: 'out' }),
      FK(30, K({ legR: [42, -70], legL: [20, -52], torso: lean - 5, armL: [-52, -20], head: hd - 4 }), { ease: 'inout' }),
    ] },
    fall: { loop: true, frames: [
      FK(10, K({ legR: [26, -32], legL: [8, -20], armL: [-82, -30], torso: lean - 13, head: hd - 8, face: 'grit' }), { ease: 'inout' }),
      FK(10, K({ legR: [32, -42], legL: [4, -14], armL: [-96, -30], torso: lean - 17, head: hd - 10, face: 'grit' }), { ease: 'inout' }),
    ] },
    land: { loop: false, frames: [
      FK(3, K({ legR: [36, 48], legL: [-26, 50], torso: lean + 15, head: hd + 6, root: [0, 3], squash: 1.16, stretch: 0.86, armL: [-28, 30], face: 'grit' }), { ease: 'out' }),
      FK(5, K({ legR: [14, 16], legL: [-10, 18], torso: lean + 3, root: [0, 1], squash: 1.02, stretch: 0.98 }), { ease: 'out' }),
    ] },
    hurt: { loop: false, frames: [
      FK(4, K({ torso: lean - 27, head: hd - 20, armL: [-62, -30], armR: AD(c.armR, -22, -28), weapon: (c.weapon || 0) - 18, root: [-5, 1], legR: [22, 4], legL: [-14, 12], face: 'hurt' }), { ease: 'out' }),
      FK(10, K({ torso: lean - 11, head: hd - 10, armL: [-30, -10], armR: AD(c.armR, -8, -10), weapon: (c.weapon || 0) - 6, root: [-2, 1], legR: [14, 2], legL: [-10, 8], face: 'hurt' }), { ease: 'out' }),
      FK(6, K({ torso: lean - 1, face: 'angry' }), { ease: 'out' }),
    ] },
    // stagger: knocked off balance, arms out for trim, eyes rolling
    stagger: { loop: true, frames: [
      FK(5, K({ torso: -12, head: -12, root: [-3, 2], armR: [10, 16], armL: [-20, 14], legR: [18, 12], legL: [-14, 14], weapon: (c.weapon || 0) + 26, face: 'dazed', ...st }), { ease: 'out' }),
      FK(5, K({ torso: 8, head: 10, root: [3, 1], armR: [16, 10], armL: [-8, 16], legR: [14, 14], legL: [-10, 12], weapon: (c.weapon || 0) + 30, face: 'dazed', ...st }), { ease: 'out' }),
      FK(5, K({ torso: -8, head: -8, root: [-2, 2], armR: [12, 14], armL: [-22, 10], legR: [20, 10], legL: [-16, 16], weapon: (c.weapon || 0) + 24, face: 'dazed', ...st }), { ease: 'out' }),
      FK(5, K({ torso: 6, head: 6, root: [2, 1], armR: [14, 16], armL: [-10, 14], legR: [14, 12], legL: [-10, 12], weapon: (c.weapon || 0) + 28, face: 'dazed', ...st }), { ease: 'out' }),
    ] },
    hurtAir: { loop: true, frames: [
      FK(6, { armR: [-90, -40], weapon: 40, armL: [-100, -30], torso: -30, head: -25, legR: [40, 40], legL: [10, 60], root: [0, 0, -15], face: 'hurt' }, { ease: 'inout' }),
      FK(6, { armR: [-100, -50], weapon: 50, armL: [-110, -30], torso: -35, head: -30, legR: [50, 30], legL: [20, 50], root: [0, 0, -25], face: 'hurt' }, { ease: 'inout' }),
    ] },
    knockdown: { loop: true, frames: [
      FK(8, { armR: [-60, -40], weapon: 40, armL: [-80, -30], torso: -50, head: -20, legR: [50, 30], legL: [30, 50], root: [0, -6, -25], face: 'hurt' }, { ease: 'inout' }),
      FK(8, { armR: [-70, -50], weapon: 50, armL: [-90, -30], torso: -55, head: -25, legR: [60, 20], legL: [40, 40], root: [0, -6, -35], face: 'hurt' }, { ease: 'inout' }),
    ] },
    lying: { loop: true, frames: [
      FK(16, { ...FLOOR, face: 'hurt' }, { ease: 'inout' }),
      FK(16, { ...FLOOR, torso: 8, head: -14, legR: [16, 12], face: 'hurt' }, { ease: 'inout' }),
    ] },
    getup: { loop: false, frames: [
      FK(8, { ...FLOOR, face: 'hurt' }, { ease: 'in' }),
      FK(8, { armR: [58, 40], weapon: 26, armL: [-30, 40], torso: 32, head: -10, legR: [70, 60], legL: [-20, 60], root: [8, 4, -20], face: 'grit', squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
      FK(6, K({ torso: lean + 5, root: [0, 1], legR: [15, 20], legL: [-10, 15], face: 'angry' }), { ease: 'out' }),
    ] },
    dead: { loop: false, frames: [
      FK(8, { ...FLOOR, legR: [40, -26], legL: [30, -18], armR: [-40, -20], armL: [48, 10], torso: -4, root: [26, -12, -92], squash: 1.05, stretch: 0.95 }, { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }] }),
      FK(60, { ...FLOOR, torso: 8, head: -16, legR: [10, 2], legL: [-8, 6], armR: [-28, -10], armL: [38, 22], root: [26, -8, -92] }),
    ] },
    // dodge: a wing-pack / kick-off back-hop (the vanes flare: hooks set rig.wings from the anim name)
    dodge: { loop: false, frames: [
      FK(4, K({ torso: lean + 11, root: [0, 3], legR: [36, 42], legL: [-20, 42], armL: [-30, 30], face: 'grit', squash: 1.08, stretch: 0.92 }), { sfx: 'dodge', ease: 'in' }),
      FK(6, K({ torso: lean - 9, head: hd - 8, root: [0, -20], legR: [40, -60], legL: [30, -50], armR: AD(c.armR, -28, -18), armL: [-64, -40], face: 'closed', squash: 0.94, stretch: 1.06 }), { ease: 'out', fx: [{ kind: 'spark', x: -14, y: 40, count: 2 }] }),
      FK(5, K({ torso: lean - 3, head: hd - 6, root: [0, -10], legR: [30, -30], legL: [20, -20], armR: AD(c.armR, -14, -10), armL: [-42, -30], face: 'closed' }), { ease: 'in' }),
      FK(4, K({ torso: lean + 9, root: [0, 3], legR: [30, 38], legL: [-18, 38], armL: [-20, 20], face: 'grit', squash: 1.1, stretch: 0.9 }), { ease: 'out' }),
      FK(4, K({ torso: lean, root: [0, 1] }), { ease: 'out' }),
    ] },
  };
}

/**
 * Hand-keyed telegraphed attack (docs/ART_STYLE.md section 8): anticipation -> deeper anticipation -> smeared hit key
 * -> hit hold -> punishable follow-through -> return, with an `ease` on every key. It replaces the parametric
 * `enemyAttack()` builder while keeping its FROZEN budget exactly: the two `tell: true` frames still sum to
 * `o.tell`, the hitbox still lives on a single `o.active`-frame key, and the `punish: true` recovery is still
 * `o.recovery` long. Poses are the caller's: `w1` / `w2` anticipation, `h` hit, `hold` (defaults to `h` nudged by
 * `hold` hit-hold (a few degrees past the hit key), `r` follow-through, and `carry` to return to.
 */
export function crowStrike(o) {
  const tell = o.tell || 20, t0 = Math.max(1, Math.round(tell * 0.55));
  const hold = o.hold || o.h, holdDur = o.holdDur || 3;
  const frames = [
    { dur: t0, pose: P(o.w1), tell: true, sfx: o.tellSfx, armor: o.armor || undefined, event: o.aimEvent, ease: 'in' },
    { dur: Math.max(1, tell - t0), pose: P(o.w2), tell: true, armor: o.armor || undefined, ease: 'out' },
  ];
  const h = { dur: o.active || 8, pose: P(o.h), sfx: o.sfx, fx: o.fx, move: o.move, smear: o.smear, ease: 'overshoot',
    armor: o.armor || undefined, invuln: o.invuln || undefined, event: o.event, projectile: o.projectile, summon: o.summon };
  if (o.hitboxes) h.hitboxes = o.hitboxes; else if (o.hitbox) h.hitbox = o.hitbox;
  frames.push(h);
  frames.push({ dur: holdDur, pose: P(hold), ease: 'out' });
  frames.push({ dur: o.recovery || 20, pose: P(o.r), punish: true, ease: 'inout', fx: o.recoverFx });
  frames.push({ dur: 6, pose: P({ ...o.carry, torso: (o.lean || 3) + 3 }), ease: 'out' });
  return { loop: false, frames };
}
