// Stormcrow rig: the shared cel-shaded aeronaut paper-doll used by content/enemies/stormcrow.js and the two
// Stage 2 bosses (midboss2.js, boss2.js). Pure art + animation data (ARCHITECTURE.md section 14).
//
// Faction read (docs/STAGE2.md section 2): the Ninth Aeronaut Wing flies black. Where the Brassbound are boxy steel
// and the Sootborn are round green, a Stormcrow is a TALL WEDGE: a high-collared storm coat that flares into two
// tails, a folded wing-pack on the back, and a beaked flight mask with one big sky-glass sighting lens. That lens is
// the universal tell — pale glass at rest, HOT WHITE while a wind-up runs (blinking in its last frames), dead grey
// once the body is down. Colour rules: storm slate coat + canvas straps + wine rank chevron + pewter metal; the only
// energy colour is STATIC VIOLET (never aether cyan, which belongs to the Concordat's machinery).
//
// Every hook draws in the local space art/rig.js sets up (limbs: origin at the joint, +y along the segment; hand and
// weapon: +x along the forearm; torso: origin at the hip centre, y up negative; head: origin at the head centre).
// Far-side parts colour from `inf.pal`; `rig.override` is the silhouette/smear pass, so detail passes return early.
import { P, FACE } from '../../art/poses.js';
import { celRect, celBall, celPoly, celCapsule, tones, rimTop } from '../../art/shading.js';
import { drawFist } from '../../art/rigParts.js';
import { getChain } from '../../art/secondary.js';
import { rad } from '../../engine/math.js';

const R = Math.round, TAU = Math.PI * 2;

/** Stormcrow colour constants. Value ladder: canvas straps (light) > slate coat > dark coat > near-black leather. */
export const CROW = {
  coat: '#44557A', coatDark: '#2C374F', leather: '#2A2430', canvas: '#D6CBB2', canvasSh: '#A79C86',
  pewter: '#9AA6B4', pewterDark: '#5C6675', copper: '#8A6A46', glass: '#BBD4E8', glassHot: '#FFFFFF',
  cap: '#3E3648', mask: '#4A4155',
  skin: '#D9A87E', hair: '#3A2E2A', wine: '#7C2B34', spark: '#9B7BFF', sparkPale: '#D7CBFF',
  rope: '#B9A47E', outline: '#191E2A',
};
/** Base value ladder: slate coat body + sleeves, canvas trim, pewter metal, violet "glow" (static). */
export const CROW_PAL = {
  skin: CROW.skin, hair: CROW.hair, primary: CROW.coat, sleeve: CROW.coat, secondary: CROW.coatDark,
  accent: CROW.canvas, metal: CROW.pewter, dark: CROW.leather, glow: CROW.spark,
};
/** Lean aeronaut build: small head under the mask, narrow shoulders, long legs (~74px tall at scale 1). */
export const CROW_PROPS = {
  headR: 8.5, neck: 3, neckR: 3.2, torsoW: 21, torsoH: 27, hip: 17, upperArm: 14, lowerArm: 13, armR: 4,
  handR: 4.5, upperLeg: 16, lowerLeg: 15, legR: 5, footL: 12, footH: 5, bulge: 0.45, shoulderX: 3, hipX: 4,
};
/** Keyframe shorthand: FK(dur, poseSpec, extraFrameFields). */
export const FK = (dur, spec, extra) => ({ dur, pose: P(spec), ...(extra || {}) });

// ---------------------------------------------------------------- head: flight cap + beaked mask
// Layer order in art/rig.js is head -> face -> hat, so the CAP MUST STOP ABOVE THE LENS ROW (y = -0.34r) or it
// paints over the only feature that identifies the faction. Everything below the brow belongs to crowMask().
const BROW = -0.58, EYE = -0.34;
/** Leather flight cap: a crown down to the brow line, a stitched seam, and a neck flap behind the skull (hat hook). */
export function crowCap(ctx, rig, pose, inf) {
  const r = inf.r;
  // neck flap first, behind everything: it hangs off the back of the skull, clear of the far lens
  celRect(ctx, rig, R(-r * 1.15), R(r * BROW), R(r * 0.5), R(r * 1.25), 2, CROW.leather, 0.42, 0);
  celPoly(ctx, rig, [-r - 2, R(r * BROW), -r - 1, R(-r * 1.05), R(-r * 0.35), R(-r * 1.45), R(r * 0.5), R(-r * 1.32), r + 2, R(-r * 0.72), r + 3, R(r * BROW)], CROW.cap, 0.4, 0.26);
  if (rig.override) return;
  const t = tones(rig, CROW.cap);
  ctx.fillStyle = t.deep;
  for (let x = -r; x < r; x += 4) ctx.fillRect(R(x), R(-r * 0.92), 2, 1);
  // the chin strap running down past the jaw from under the flap
  ctx.fillStyle = rig.col(CROW.rope); ctx.fillRect(R(-r * 0.95), R(r * 0.55), R(r * 0.5), 2);
  rimTop(ctx, rig, R(-r * 0.9), R(-r * 1.3), R(r * 0.3), R(-r * 1.38), '#4A4250');
}
/**
 * Beaked flight mask (face hook, head space): a wedge beak under one big sky-glass sighting lens. That lens is the
 * faction tell — pale glass at rest, HOT WHITE while `rig.tell` (blinking on `rig.tellWarn`), dead grey when `dazed`.
 */
export function crowMask(ctx, rig, pose, inf) {
  const r = inf.r, face = pose.face | 0, dead = face === FACE.dazed;
  const tell = !!rig.tell && !dead, blink = (rig.tick & 2) !== 0;
  const hot = tell && (!rig.tellWarn || blink);
  const lens = dead ? '#4A4E58' : hot ? CROW.glassHot : (face === FACE.hurt && blink ? '#7D93A6' : CROW.glass);
  const ey = R(r * EYE);
  // beak: a pewter wedge from the cheek line forward with a dark underside, well clear of the head silhouette
  celPoly(ctx, rig, [R(r * 0.05), R(-r * 0.1), R(r * 1.85), R(r * 0.24), R(r * 1.6), R(r * 0.6), R(r * 0.05), R(r * 0.78)], CROW.pewter, 0.36, 0.32);
  // mask plate across the eyes, a value step above the cap so the head never reads as one dark blob
  celPoly(ctx, rig, [-r - 1, R(r * BROW), r + 2, R(r * (BROW - 0.08)), R(r * 1.2), R(-r * 0.02), -r - 1, R(r * 0.02)], CROW.mask, 0.4, 0.3);
  if (tell && !rig.override) {
    ctx.fillStyle = hot ? 'rgba(255,255,255,0.32)' : 'rgba(155,123,255,0.32)';
    ctx.beginPath(); ctx.arc(R(r * 0.5), ey, 9, 0, TAU); ctx.fill();
  }
  // ONE big sighting lens on the near side (two would overlap into a single pale bar on a 16px head) and a dark
  // eye slot on the far side, so the tell is a single unmistakable light
  const cx = R(r * 0.5);
  celBall(ctx, rig, cx, ey, 5.4, CROW.pewter, false);
  ctx.beginPath(); ctx.arc(cx, ey, 4, 0, TAU); ctx.fillStyle = rig.col(lens); ctx.fill();
  if (rig.override) return;
  if (!dead) { ctx.fillStyle = rig.col('#FFFFFF'); ctx.fillRect(cx - 3, ey - 3, 2, 2); }
  ctx.fillStyle = rig.col(CROW.outline); ctx.fillRect(R(-r * 0.62), ey - 2, R(r * 0.45), 4);
  // nostril slot along the beak + the filter box under the jaw
  ctx.fillRect(R(r * 0.8), R(r * 0.26), R(r * 0.6), 1.5);
  ctx.fillStyle = rig.col(CROW.copper); ctx.fillRect(R(-r * 0.15), R(r * 0.62), R(r * 0.6), 3);
}

// ---------------------------------------------------------------- torso / limbs / hands
/**
 * Storm coat (torso hook): squared shoulders dropping into a flared chest, a deep lapel V over a canvas shirt,
 * the crossed boarding straps and the regiment chevron in `build.clan`.
 */
export function crowCoat(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal;
  celPoly(ctx, rig, [-hw - 2, -H + 4, -hw + 1, -H - 1, hw - 1, -H - 1, hw + 2, -H + 4, hw + 3, 2, -hw - 3, 2], pal.primary, 0.36, 0.28);
  if (rig.override) return;
  const t = tones(rig, pal.primary);
  // canvas shirt inside the lapel V
  ctx.beginPath(); ctx.moveTo(-R(W * 0.24), -H + 2); ctx.lineTo(R(W * 0.24), -H + 2); ctx.lineTo(0, -R(H * 0.42)); ctx.closePath();
  ctx.fillStyle = rig.col(CROW.canvas); ctx.fill();
  // high collar
  ctx.fillStyle = t.hi; ctx.fillRect(-hw + 1, -H - 1, W - 2, 3);
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 1, -H + 2, W - 2, 1);
  // crossed boarding straps
  ctx.strokeStyle = rig.col(CROW.canvasSh); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-hw + 2, -H + 4); ctx.lineTo(hw - 1, -R(H * 0.28)); ctx.stroke();
  ctx.strokeStyle = rig.col(CROW.rope); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(hw - 2, -H + 5); ctx.lineTo(-hw + 2, -R(H * 0.3)); ctx.stroke();
  // rank chevron + a pewter buckle
  const clan = rig.build.clan || CROW.wine;
  ctx.fillStyle = rig.col(clan);
  ctx.beginPath(); ctx.moveTo(-R(W * 0.3), -R(H * 0.62)); ctx.lineTo(0, -R(H * 0.78)); ctx.lineTo(R(W * 0.3), -R(H * 0.62));
  ctx.lineTo(R(W * 0.3), -R(H * 0.52)); ctx.lineTo(0, -R(H * 0.68)); ctx.lineTo(-R(W * 0.3), -R(H * 0.52)); ctx.closePath(); ctx.fill();
  celBall(ctx, rig, R(W * 0.1), -R(H * 0.2), 2.6, pal.metal, false);
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 1, -R(H * 0.16), W - 2, 1);
}
/** Coat tails: two swept panels on a 2-link chain so they lag behind the run (back accessory, torso space). */
export function crowTails(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2);
  const ch = getChain(rig, 'tails', 2, { joint: 'torso', rest: [0, 1], stiffness: 0.15, damping: 0.68, gain: 2.2, rotGain: 0.5, maxAng: 42 });
  for (let i = 0; i < 2; i++) {
    ctx.save(); ctx.translate(i ? -hw + 3 : hw - 5, -2); ctx.rotate(rad(ch.ang[0] * (i ? 1.15 : 0.85)));
    celPoly(ctx, rig, [-4, 0, 5, 0, 4, 20, -1, 26, -6, 20], i ? CROW.coatDark : rig.palette.primary, 0.4, 0.2);
    ctx.restore();
  }
}
/**
 * Folded wing-pack (back accessory, torso space): a copper canister with two swept vanes tucked along the spine.
 * The vanes flare open (and spark) while `rig.wings` is set by a hook — the faction's "I am about to move" read.
 */
export function crowWings(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), open = rig.wings ? 1 : 0;
  const x = -hw - 2, y = -R(p.torsoH * 0.72);
  for (let i = 0; i < 2; i++) {
    const a = -18 - i * 26 - open * 34;
    ctx.save(); ctx.translate(x + 1, y + i * 5); ctx.rotate(rad(a));
    celPoly(ctx, rig, [0, -3, -24 - open * 8, -7, -30 - open * 10, 0, -22 - open * 8, 5, 0, 4], i ? CROW.coatDark : CROW.pewterDark, 0.38, 0.24);
    if (!rig.override) { ctx.fillStyle = rig.col(CROW.canvasSh); ctx.fillRect(-20, -2, 16, 1.5); }
    ctx.restore();
  }
  celCapsule(ctx, rig, x, y - 2, x, y + 10, 4, CROW.copper, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(open ? CROW.sparkPale : CROW.spark);
  ctx.fillRect(x - 2, y + 3, 3, 3);
}
/** Gauntlet fist: a leather glove with a pewter knuckle band (hand hook). */
export function crowHand(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.pal.dark);
  if (rig.override) return;
  ctx.fillStyle = rig.col(inf.pal.metal); ctx.fillRect(R(inf.r * 0.2), -R(inf.r * 0.7), 2, R(inf.r * 1.4));
}
/** Flight boot: tall leather shaft with a canvas lace band and a pewter toe cap (foot hook, ankle space). */
export function crowBoot(ctx, rig, pose, inf) {
  const w = inf.w, h = inf.h, pal = inf.pal, heel = R(w * 0.38), toe = R(w * 0.66);
  celPoly(ctx, rig, [-heel, -h - 3, toe - 4, -h - 3, toe, -h + 1, toe, 2, -heel, 2], pal.dark, 0.36, 0.26);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CROW.rope); ctx.fillRect(-heel + 1, -h - 2, toe + heel - 2, 1.5);
  ctx.fillStyle = rig.col(pal.metal); ctx.fillRect(toe - 5, -h + 1, 5, 3);
  ctx.fillStyle = tones(rig, pal.dark).deep; ctx.fillRect(-heel, 1, toe + heel, 2);
}
/** Complete Stormcrow part table (everything else falls back to the shared humanoid defaults in art/rig.js). */
export const CROW_PARTS = { face: crowMask, hat: crowCap, torso: crowCoat, hand: crowHand, foot: crowBoot };
/** Standard back accessories: the wing-pack under the coat tails. */
export const CROW_BACK = [{ attach: 'back', draw: crowWings }, { attach: 'back', draw: crowTails }];

// ---------------------------------------------------------------- weapons (hand space: +x along the forearm)
/** Boat hook: an ash pole with a pewter hook and spike (Deck Crimper). */
export function drawBoatHook(ctx, rig) {
  celCapsule(ctx, rig, -12, 0, 34, 0, 2.5, CROW.copper, 0.3);
  celPoly(ctx, rig, [32, -3, 46, -4, 52, 1, 46, 4, 32, 3], CROW.pewter, 0.36, 0.3);
  if (rig.override) return;
  ctx.strokeStyle = rig.col(CROW.pewterDark); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(44, -2); ctx.arc(42, -9, 7, 1.3, 4.2); ctx.stroke();
  ctx.fillStyle = rig.col(CROW.rope); ctx.fillRect(-6, -3, 9, 6);
}
/** Line gun: a stubby harpoon launcher with a reel drum; the harpoon is seated until `rig.fired` (Line Corsair). */
export function drawLineGun(ctx, rig) {
  celRect(ctx, rig, -6, -5, 22, 10, 2, CROW.pewterDark, 0.36, 0.3);
  celBall(ctx, rig, 4, 5, 4.5, CROW.copper, false);
  if (!rig.fired) celPoly(ctx, rig, [14, -2, 34, -2, 38, 0, 34, 2, 14, 2], CROW.pewter, 0.34, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CROW.rope); ctx.fillRect(0, 3, 9, 1.5);
  ctx.fillStyle = rig.col(CROW.leather); ctx.fillRect(-6, -1, 7, 6);
}
/** Chain shot: a leather grip, four swinging links and two iron balls (Powder Bosun). */
export function drawChainShot(ctx, rig, pose) {
  celRect(ctx, rig, -5, -3, 12, 6, 2, CROW.leather, 0.4, 0);
  if (rig.override) return;
  const swing = (pose.weapon && pose.weapon.rot) || 0;
  ctx.strokeStyle = rig.col(CROW.pewterDark); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(7, 0);
  for (let i = 1; i <= 4; i++) ctx.lineTo(7 + i * 8, Math.sin(i * 1.2 + swing * 0.03 + rig.tick * 0.5) * (1 + i * 0.8));
  ctx.stroke();
  for (const d of [34, 42]) celBall(ctx, rig, d, Math.sin(d * 0.16 + swing * 0.03 + rig.tick * 0.5) * 3, 5, CROW.pewterDark, true);
}
/**
 * Storm coil: a rod wound with copper rings ending in a glass bulb. The bulb brightens and throws arcs as the
 * charge (`rig.coil`, written by the Galewright's onUpdate hook) climbs (Galewright).
 */
export function drawCoilRod(ctx, rig) {
  const k = rig.coil || 0;
  celCapsule(ctx, rig, -8, 0, 26, 0, 2.5, CROW.pewterDark, 0.3);
  for (let i = 0; i < 4; i++) celBall(ctx, rig, 6 + i * 5, 0, 3.2, CROW.copper, false);
  celBall(ctx, rig, 32, 0, 5 + k * 2, k > 0.05 ? CROW.sparkPale : CROW.glass, true);
  if (rig.override || k <= 0.05) return;
  ctx.strokeStyle = rig.col(CROW.spark); ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = rig.tick * 0.6 + i * 2.1;
    ctx.beginPath(); ctx.moveTo(32, 0);
    ctx.lineTo(32 + Math.cos(a) * (8 + k * 8), Math.sin(a) * (8 + k * 8));
    ctx.stroke();
  }
}
/** Boarding axe: a short haft with a crescent head and a back spike (Ironwing Marine). */
export function drawBoardingAxe(ctx, rig) {
  celCapsule(ctx, rig, -8, 0, 24, 0, 3, CROW.copper, 0.3);
  celPoly(ctx, rig, [22, -14, 34, -12, 38, -2, 34, 8, 22, 8, 24, -2], CROW.pewter, 0.34, 0.32);
  if (rig.override) return;
  celPoly(ctx, rig, [22, -2, 14, -8, 14, 2], CROW.pewterDark, 0.34, 0.3);
  ctx.fillStyle = tones(rig, CROW.pewter).deep; ctx.fillRect(26, 2, 9, 2);
}
/**
 * Wing-plate shield strapped to the off hand (handL accessory): three overlapping pewter vanes over a canvas backing.
 * Glows on the wind-up (`rig.tell`) and disappears for good once a launcher strips it (`rig.shieldStripped`).
 */
export function drawWingShield(ctx, rig) {
  if (rig.shieldStripped) return;
  const hot = rig.tell;
  celPoly(ctx, rig, [-4, -30, 12, -26, 16, 0, 12, 26, -4, 30, -8, 0], hot ? CROW.sparkPale : CROW.pewterDark, 0.34, 0.3);
  for (let i = 0; i < 3; i++) celPoly(ctx, rig, [0, -24 + i * 17, 12, -20 + i * 17, 13, -6 + i * 17, 0, -2 + i * 17], hot ? CROW.spark : CROW.pewter, 0.34, 0.34);
  if (rig.override) return;
  ctx.fillStyle = rig.col(rig.build.clan || CROW.wine); ctx.fillRect(2, -3, 8, 6);
}

// ---------------------------------------------------------------- shared animation set
/** Body face-up on the deck (root rot -88: the coat spreads, the mask points at the sky). */
const FLOOR = { armR: [-22, -6], weapon: -14, armL: [28, 18], torso: 3, head: -12, legR: [12, 10], legL: [-4, 8], root: [26, -8, -88], grip: 0, face: 'dazed' };
/** Arm shorthand: nudge an [upper, lower] pair. */
const AD = (a, du, dl) => [a[0] + du, a[1] + dl];

/**
 * Shared Stormcrow base animation set, parameterised by the rest carry `c` ({ armR, armL, weapon, grip? }).
 * A swaggering sea-legs gait: the torso counter-rotates on every step, the free arm swings wide and the coat tails
 * (a secondary chain) do the rest. Covers idle 4 / walk 8 / run 8 / jump / fall / land / hurt 3 / stagger 4 /
 * hurtAir / knockdown / lying 2 / getup 3 / dead 2 / dodge 5 (the wing-pack back-hop) / flee.
 * `o.holdOffArm` keeps the off arm in its carry while moving (a strapped shield must not wave about).
 */
export function makeCrowBase(c, o = {}) {
  const hold = !!o.holdOffArm, st = o.stagger || {};
  const K = (s) => ({ torso: 3, head: -2, legR: [8, 4], legL: [-8, 6], ...c, ...s });
  const walk = (lr, ll, al, ty, tw, sq, fr, fl) => K({ legR: lr, legL: ll, armL: hold ? c.armL : al, armR: AD(c.armR, 4, -4), torso: 3 + tw, head: -2 - tw * 0.5, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, footR: fr || 0, footL: fl || 0 });
  const run = (lr, ll, al, ty, sq) => K({ legR: lr, legL: ll, armL: hold ? AD(c.armL, 18, -18) : al, armR: AD(c.armR, -14, -6), torso: 22, head: -12, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, face: 'grit' });
  return {
    // idle: weight shifting from boot to boot, the coat settling, a slow scan of the deck
    idle: { loop: true, frames: [
      FK(16, K({ root: [0, 0] }), { ease: 'inout' }),
      FK(14, K({ torso: 5, head: [1, 1, 0], root: [0, 1], armR: AD(c.armR, 2, -2), armL: AD(c.armL, -3, -2), squash: 1.02, stretch: 0.98 }), { ease: 'inout' }),
      FK(16, K({ torso: 2, head: [-5, 0, 0], root: [0, 0], armR: AD(c.armR, 1, -1) }), { ease: 'inout' }),
      FK(14, K({ torso: 1, head: [3, -1, 0], root: [0, 1], armL: AD(c.armL, 3, 2) }), { ease: 'inout' }),
    ] },
    // walk: contact / down (squash) / pass / up, torso counter-rotating so the coat tails swing
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
      FK(3, K({ legR: [32, 42], legL: [-20, 46], torso: 12, root: [0, 4], squash: 1.1, stretch: 0.9, armL: [-28, 30] }), { ease: 'out' }),
      FK(4, K({ legR: [30, -30], legL: [10, -20], torso: -6, head: -8, root: [0, -2], squash: 0.94, stretch: 1.08, armL: [-70, -30] }), { ease: 'out' }),
      FK(30, K({ legR: [42, -70], legL: [20, -52], torso: -2, armL: [-52, -20], head: -6 }), { ease: 'inout' }),
    ] },
    fall: { loop: true, frames: [
      FK(10, K({ legR: [26, -32], legL: [8, -20], armL: [-82, -30], torso: -10, head: -10, face: 'grit' }), { ease: 'inout' }),
      FK(10, K({ legR: [32, -42], legL: [4, -14], armL: [-96, -30], torso: -14, head: -12, face: 'grit' }), { ease: 'inout' }),
    ] },
    land: { loop: false, frames: [
      FK(3, K({ legR: [36, 48], legL: [-26, 50], torso: 18, head: 4, root: [0, 3], squash: 1.16, stretch: 0.86, armL: [-28, 30], face: 'grit' }), { ease: 'out' }),
      FK(5, K({ legR: [14, 16], legL: [-10, 18], torso: 6, root: [0, 1], squash: 1.02, stretch: 0.98 }), { ease: 'out' }),
    ] },
    hurt: { loop: false, frames: [
      FK(4, K({ torso: -24, head: -22, armL: [-62, -30], armR: AD(c.armR, -22, -28), weapon: (c.weapon || 0) - 18, root: [-5, 1], legR: [22, 4], legL: [-14, 12], face: 'hurt' }), { ease: 'out' }),
      FK(10, K({ torso: -8, head: -12, armL: [-30, -10], armR: AD(c.armR, -8, -10), weapon: (c.weapon || 0) - 6, root: [-2, 1], legR: [14, 2], legL: [-10, 8], face: 'hurt' }), { ease: 'out' }),
      FK(6, K({ torso: 2, face: 'angry' }), { ease: 'out' }),
    ] },
    // stagger: knocked off balance, wings flaring for trim, the mask lenses dead
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
      FK(6, K({ torso: 8, root: [0, 1], legR: [15, 20], legL: [-10, 15], face: 'angry' }), { ease: 'out' }),
    ] },
    dead: { loop: false, frames: [
      FK(8, { ...FLOOR, legR: [40, -26], legL: [30, -18], armR: [-40, -20], armL: [48, 10], torso: -4, root: [26, -12, -92], squash: 1.05, stretch: 0.95 }, { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }] }),
      FK(60, { ...FLOOR, torso: 8, head: -16, legR: [10, 2], legL: [-8, 6], armR: [-28, -10], armL: [38, 22], root: [26, -8, -92] }),
    ] },
    // dodge: a wing-pack back-hop (the vanes flare: hooks set rig.wings from the anim name)
    dodge: { loop: false, frames: [
      FK(4, K({ torso: 14, root: [0, 3], legR: [36, 42], legL: [-20, 42], armL: [-30, 30], face: 'grit', squash: 1.08, stretch: 0.92 }), { sfx: 'dodge', ease: 'in' }),
      FK(6, K({ torso: -6, head: -10, root: [0, -20], legR: [40, -60], legL: [30, -50], armR: AD(c.armR, -28, -18), armL: [-64, -40], face: 'closed', squash: 0.94, stretch: 1.06 }), { ease: 'out', fx: [{ kind: 'spark', x: -14, y: 40, count: 2 }] }),
      FK(5, K({ torso: 0, head: -8, root: [0, -10], legR: [30, -30], legL: [20, -20], armR: AD(c.armR, -14, -10), armL: [-42, -30], face: 'closed' }), { ease: 'in' }),
      FK(4, K({ torso: 12, root: [0, 3], legR: [30, 38], legL: [-18, 38], armL: [-20, 20], face: 'grit', squash: 1.1, stretch: 0.9 }), { ease: 'out' }),
      FK(4, K({ torso: 3, root: [0, 1] }), { ease: 'out' }),
    ] },
  };
}
