// Stage 2 final boss: ADMIRAL ODALINE KESTREL, THE NINTH WING (docs/STAGE2.md section 5.2).
// Three phases on the flagship's bridge, each one stripping something off her:
//   1. THE ADMIRAL   (420) — bicorne, storm lance, and the fleet at her back: thrusts, a sweeping cut, and a
//      BROADSIDE she calls down from the guns below; escorts board at 66% and 33%.
//   2. STORM-WING    (400) — the wing-harness opens. She steps through the air (a violet gale-step that always
//      answers a combo), throws chain lightning down a lane, and every 150 HP the coil VENTS: 2x damage, no attacks.
//   3. THE LAST CROW (260) — harness gone, no armour, grabbable. A five-hit lance string and one last powder keg.
//
// The three phases are three SILHOUETTES (docs/ART_STYLE section 0.6 / 11), and the shape shrinks every time:
//   1. WIDE — a bicorne worn athwart, heavy epaulettes and a floor-length storm cape on a 2-link chain: a triangle.
//   2. SPIKY — the hat is gone and her hair is standing up in the static; four harness vanes stand right off her
//      shoulders in a star, the cape is cut away and the coat is cropped to a flying jacket.
//   3. SMALL — nothing on her head but a torn ribbon, nothing on her back at all, the coat torn down to shirt
//      sleeves. Just a woman with a lance on a burning bridge.
// Rig and kit from ./stormcrowRig.js + ./stormcrowKit.js. Data + small hooks only (ARCHITECTURE.md section 14).
import { frontBox } from './common.js';
import {
  CROW, CROW_PAL, CROW_PROPS, crowTails, crowScarf, crowTell, FK, makeCrowBase, crowStrike,
} from './stormcrowRig.js';
import { CROW_PARTS } from './stormcrowKit.js';
import { celRect, celBall, celPoly, celCapsule, tones, rimTop, flat, band } from '../../art/shading.js';
import { getChain } from '../../art/secondary.js';
import { pathPoly, paint, circle } from '../../art/shapes.js';
import { rad } from '../../engine/math.js';
import { particles } from '../../engine/particles.js';

const R = Math.round, TAU = Math.PI * 2;
/** Torso outlines: the full admiral's coat, and the ragged waistcoat left of it in phase 3. */
const COAT_PTS = (hw, H) => [-hw - 3, -H + 4, -hw + 1, -H - 1, hw - 1, -H - 1, hw + 3, -H + 4, hw + 4, 2, -hw - 4, 2];
const TORN_PTS = (hw, H, W) => [-hw - 1, -H + 5, -hw + 2, -H - 1, hw - 2, -H - 1, hw + 1, -H + 5, hw + 2, R(-H * 0.2), hw - 1, 2, R(W * 0.2), R(-H * 0.12), R(-W * 0.12), 2, -hw - 2, R(-H * 0.16)];
// THE ADMIRAL'S COAT, hue held at 224 deg, chroma only. COAT_DK is 19.5% of the final boss - the cape, the bicorne and
// the coat's own dark panel - and at #1A2138 it was Oklab L* 25.3 against the outline #1B1E28 at L* 23.7, i.e. dL 1.6:
// the line under the largest mass on the rig was drawn and then swallowed, which is exactly the defect that makes a
// sealed Stormcrow read as one blob at squint. The instinct here is to push it DOWN to clear the Cold Sovereign's floor
// band from below; #101B38 measures Oklab L* 23.0, BELOW its own ink, which trades a stage collision for a self-
// collision. So the ladder moves UP and OUT instead: COAT_DK #223163 (L* 32.9, dL 9.2, C 9.0) and COAT #253A72
// (L* 36.3, dL 12.6, C 10.0) - two chromatic steps, both clear of the line, both out of the lattice's neutral core,
// and the coat's Rec-601 luminance still 0.547 clear of the trousers so the boss value ladder is unchanged.
const GOLD = '#D8AE52', GOLD_DK = '#8A6A26', COAT = '#253A72', COAT_DK = '#223163';
/**
 * FLAG RANK. The line rates climb a warm heat ramp and top out at the Ironwing Marine's signal gold on cloth
 * (stormcrow.js WATCH); flag rank does NOT continue that ramp, it steps out of it — the Wing's RED, in a gold
 * frame. Cloth alone = rated; cloth in a gold frame = flag rank, and no line trooper ever wears the frame.
 * Two reasons this beats putting the Admiral one rung further up the gold: a cloth gold on her would sit ~9 L*
 * from the Marine's and make the top line trooper read as a boss, and it would spend the one colour the phase
 * ladder needs held in reserve. Phase 2 strips the bicorne and the cape but KEEPS the sash and the epaulettes —
 * they are the only thing still saying she outranks everyone. Phase 3 strips even those, and the garment itself
 * becomes the mark: the ladder ends in red, on a bare head, which is what phase 1's sash has been promising.
 */
const SASH = '#C0392F';
/** The cape lining is the same red one value down, so the cape reads off the coat without being a rank mark. */
const LINING = '#8E2F38';
const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, once: true, ...(extra || {}) });

// ---------------------------------------------------------------- phase 1: the Admiral
/** Bicorne worn athwart — the widest thing on the bridge — with a gold cord, a cockade and the Wing's badge. */
function bicorne(ctx, rig, pose, inf) {
  const r = inf.r;
  celPoly(ctx, rig, [R(-r * 2.1), R(-r * 0.78), R(-r * 1.2), R(-r * 1.62), R(r * 0.1), R(-r * 1.9), R(r * 1.4), R(-r * 1.6), R(r * 2.2), R(-r * 0.74), R(r * 0.7), R(-r * 1.06), R(-r * 0.7), R(-r * 1.06)], COAT_DK, 0.34, 0.28);
  if (rig.override) return;
  // The gold lace band and the cockade are MATERIAL changes on felt and both take 1 px of ink (ART_STYLE 0.2, 0.7):
  // the cord was a bare 3 px fillRect (inking that leaves 1 px of gold, which fails 0.7 harder than the missing line),
  // so it is widened to 4 and drawn with band(); the cockade was a bare beginPath/fill and is the file's one
  // outline-stroke-contract error - flat() strokes the outline under it for the cost of one stroke.
  band(ctx, rig, R(-r * 1.5), R(-r * 1.04), R(r * 3), 4, GOLD);
  ctx.beginPath(); ctx.moveTo(R(r * 0.2), R(-r * 1.74)); ctx.lineTo(R(r * 0.85), R(-r * 1.12)); ctx.lineTo(R(-r * 0.45), R(-r * 1.12)); ctx.closePath();
  flat(ctx, rig, GOLD);
  ctx.fillStyle = rig.col(SASH); ctx.fillRect(R(r * 0.1), R(-r * 1.5), 4, 5);
  rimTop(ctx, rig, R(-r * 1.9), R(-r * 0.9), R(r * 0.1), R(-r * 1.82), '#3A4256');
  const cx = R(r * 0.45), cy = R(-r * 1.24);
  celBall(ctx, rig, cx, cy, 3.4, rig.tell ? CROW.glassHot : CROW.glass, true);
  crowTell(ctx, rig, r, cx, cy);
}
/** Admiral's coat (torso hook): gold frogging, a wine sash and heavy epaulettes over the Stormcrow cut. */
function admiralCoat(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal, torn = rig.build.crow && rig.build.crow.torn;
  celPoly(ctx, rig, torn ? TORN_PTS(hw, H, W) : COAT_PTS(hw, H), pal.primary, 0.36, 0.28);
  if (!torn) celPoly(ctx, rig, [-hw - 4, -H + 3, -hw + 1, -H - 2, R(-W * 0.18), R(-H * 0.5), R(W * 0.18), R(-H * 0.5), hw - 1, -H - 2, hw + 4, -H + 3, hw + 4, 2, hw - 3, 2, R(W * 0.2), R(-H * 0.34), R(-W * 0.2), R(-H * 0.34), -hw + 3, 2, -hw - 4, 2], COAT_DK, 0.4, 0.22);
  if (rig.override) return;
  const t = tones(rig, pal.primary);
  if (!torn) {
    // gold frogging: four bars down the chest, in the DARK gold with a bright cap - the sash beside them is now
    // the rate ladder's cloth gold, and two bright golds on one chest merge into a single slab
    ctx.fillStyle = rig.col(GOLD_DK);
    for (let i = 0; i < 4; i++) ctx.fillRect(R(-W * 0.2), -H + 6 + i * 6, R(W * 0.4), 3);
    ctx.fillStyle = rig.col(GOLD);
    for (let i = 0; i < 4; i++) ctx.fillRect(R(-W * 0.2), -H + 6 + i * 6, R(W * 0.4), 1);
  } else {
    // torn: the shirt shows through the front of the waistcoat, one gold bar left on the chest
    ctx.fillStyle = rig.col(CROW.canvas);
    ctx.beginPath(); ctx.moveTo(R(-W * 0.16), -H + 1); ctx.lineTo(R(W * 0.16), -H + 1); ctx.lineTo(0, R(-H * 0.44)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rig.col(GOLD); ctx.fillRect(R(-W * 0.2), R(-H * 0.7), R(W * 0.4), 2);
  }
  // the flag-rank sash across the body, in its gold frame, with a gold clasp. Phase 3 is the terminus and loses it
  // with the rest of the hardware: there the garment itself is the mark and the only rank left is the brow ribbon.
  if (!torn) {
    ctx.strokeStyle = rig.col(SASH); ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-hw + 1, -H + 6); ctx.lineTo(hw, R(-H * 0.2)); ctx.stroke();
    // the frame is BRIGHT gold with a dark-gold underside, at 3 units so it clears section 0.7 at scale 1.22.
    // GOLD_DK alone was 9.5% off the sash it framed and 2 units wide, i.e. indistinguishable from tones(SASH).sh:
    // the one device that says flag rank was reading as the sash's own shading.
    ctx.strokeStyle = rig.col(GOLD); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-hw + 1, -H + 10); ctx.lineTo(hw, R(-H * 0.2) + 4); ctx.stroke();
    ctx.strokeStyle = rig.col(GOLD_DK); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-hw + 1, -H + 12); ctx.lineTo(hw, R(-H * 0.2) + 6); ctx.stroke();
    celBall(ctx, rig, R(W * 0.3), R(-H * 0.26), 3, GOLD, false);
  }
  if (!torn) for (const sx of [-hw + 1, hw - 6]) { // epaulettes
    celRect(ctx, rig, sx - 1, -H - 3, 7, 6, 2, GOLD, 0.36, 0.32);
    ctx.fillStyle = rig.col(GOLD_DK); ctx.fillRect(sx, -H + 3, 6, 4);
  }
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 1, R(-H * 0.14), W - 2, 1);
}
/** Storm cape (back accessory): a floor-length panel on a 2-link chain, wine on the inside. */
function admiralCape(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2);
  const ch = getChain(rig, 'cape', 2, { joint: 'torso', rest: [0, 1], stiffness: 0.12, damping: 0.7, gain: 2.4, rotGain: 0.6, maxAng: 38 });
  ctx.save(); ctx.translate(0, -p.torsoH + 1); ctx.rotate(rad(ch.ang[0] * 0.6));
  celPoly(ctx, rig, [-hw - 2, 0, hw + 2, 0, hw + 7, 22, 0, 30, -hw - 7, 22], COAT_DK, 0.4, 0.18);
  // wine lining down the swept edge, so the cape separates from the coat instead of merging into one dark mass
  if (!rig.override) { ctx.fillStyle = rig.col(LINING); ctx.fillRect(hw, 2, 4, 20); ctx.fillRect(-hw - 5, 2, 3, 19); }
  ctx.translate(0, 26); ctx.rotate(rad(ch.ang[1]));
  celPoly(ctx, rig, [-hw - 5, -3, hw + 5, -3, hw + 8, 14, 0, 22, -hw - 8, 14], COAT_DK, 0.42, 0.16);
  if (!rig.override) { ctx.fillStyle = rig.col(LINING); ctx.fillRect(hw + 2, -1, 4, 13); }
  ctx.restore();
  if (rig.override) return;
  ctx.fillStyle = rig.col(LINING); ctx.fillRect(-hw + 1, -p.torsoH + 1, R(p.torsoW) - 2, 4);
}
// ---------------------------------------------------------------- phase 2: Storm-Wing
/** The hat is gone: her hair stands straight up in the static, with a violet corona (hat hook). */
function stormCrown(ctx, rig, pose, inf) {
  const r = inf.r, k = 1 + (rig.coil || 0) * 0.4, hair = rig.palette.hair;
  celPoly(ctx, rig, [R(-r * 1.1), R(-r * 0.45), R(-r * 1.3), R(-r * 1.5 * k), R(-r * 0.55), R(-r * 1.0), R(-r * 0.3), R(-r * 2.0 * k), R(r * 0.2), R(-r * 1.05), R(r * 0.6), R(-r * 1.7 * k), R(r * 1.05), R(-r * 0.9), R(r * 1.05), R(-r * 0.45)], hair, 0.4, 0.32);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CROW.sparkPale);
  ctx.fillRect(R(-r * 0.34), R(-r * 1.94 * k), 3, 4); ctx.fillRect(R(r * 0.56), R(-r * 1.64 * k), 3, 4);
  celBall(ctx, rig, R(r * 0.5), R(-r * 1.0), 3.2, rig.tell ? CROW.glassHot : CROW.glass, true);
  crowTell(ctx, rig, r, R(r * 0.5), R(-r * 1.0));
}
/** The open wing-harness of phase 2: four violet-lit vanes standing right off the shoulders in a star. */
function stormHarness(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), y = -R(p.torsoH * 0.78);
  for (let i = 0; i < 4; i++) {
    const a = -74 + i * 42 + Math.sin(rig.tick * 0.08 + i) * 3;
    ctx.save(); ctx.translate(-hw - 1, y + 2); ctx.rotate(rad(a));
    celPoly(ctx, rig, [0, -4, -20, -10, -40, -6, -50, 2, -36, 8, -16, 7, 0, 5], i & 1 ? CROW.pewterDark : COAT_DK, 0.36, 0.26);
    if (!rig.override) {
      ctx.fillStyle = rig.col(CROW.spark); ctx.fillRect(-44, -3, 30, 2);
      ctx.fillStyle = tones(rig, i & 1 ? CROW.pewterDark : COAT_DK).hi;
      for (let s = 0; s < 3; s++) ctx.fillRect(-10 - s * 13, -6 + s, 2, 10 - s * 2);
    }
    ctx.restore();
  }
  celCapsule(ctx, rig, -hw - 2, y - 6, -hw - 2, y + 14, 5, CROW.copper, 0.3);
  if (rig.override) return;
  // the coil core: a steady violet spark, blown wide open while the vent window is up (rig.venting)
  const vent = rig.venting ? 1 : 0;
  if (vent) { ctx.fillStyle = 'rgba(215,203,255,0.35)'; ctx.beginPath(); ctx.arc(-hw - 2, y + 4, 18, 0, TAU); ctx.fill(); }
  ctx.fillStyle = rig.col(vent ? '#FFFFFF' : CROW.sparkPale);
  ctx.beginPath(); ctx.arc(-hw - 2, y + 4, 3 + vent * 3 + (rig.tick % 8) * 0.2, 0, TAU); ctx.fill();
}
// ---------------------------------------------------------------- phase 3: the last crow
/** Nothing left but a torn wine ribbon knotted round her brow (hat hook). */
function tornRibbon(ctx, rig, pose, inf) {
  const r = inf.r;
  celRect(ctx, rig, R(-r * 1.05), R(-r * 1.12), R(r * 2.1), 5, 2, SASH, 0.4, 0.26);
  const ch = getChain(rig, 'ribbon', 2, { joint: 'head', rest: [-1, 0.4], stiffness: 0.16, damping: 0.66, gain: 2.2, rotGain: 0.5, maxAng: 40 });
  ctx.save(); ctx.translate(R(-r * 1.02), R(-r * 0.95));
  for (let i = 0; i < 2; i++) {
    ctx.rotate(rad(ch.ang[i] - (i ? 12 : 30)));
    celPoly(ctx, rig, [0, -3, -10, -5 - i, -11, 2, -1, 4], SASH, 0.42, 0);
    ctx.translate(-9, 0);
  }
  ctx.restore();
  if (rig.override) return;
  celBall(ctx, rig, R(r * 0.5), R(-r * 1.08), 3.2, rig.tell ? CROW.glassHot : CROW.glass, true);
  crowTell(ctx, rig, r, R(r * 0.5), R(-r * 1.08));
}
/** Storm lance: a long pewter haft with a gold cage and a coil head that lights while `rig.coil` climbs. */
function drawLance(ctx, rig) {
  const k = rig.coil || 0;
  celCapsule(ctx, rig, -18, 0, 44, 0, 3, CROW.pewterDark, 0.3);
  celBall(ctx, rig, -18, 0, 4.4, GOLD, false);
  celPoly(ctx, rig, [40, -7, 58, -3, 68, 0, 58, 3, 40, 7], CROW.pewter, 0.34, 0.32);
  for (let i = 0; i < 3; i++) celBall(ctx, rig, 42 + i * 5, 0, 3.6, GOLD, false);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CROW.rope); ctx.fillRect(-12, -3, 10, 6);
  ctx.fillStyle = rig.col(k > 0.05 ? CROW.sparkPale : CROW.glass);
  ctx.beginPath(); ctx.arc(65, 0, 3 + k * 3, 0, TAU); ctx.fill();
  if (k <= 0.05) return;
  ctx.strokeStyle = rig.col(CROW.spark); ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = rig.tick * 0.7 + i * 2.1;
    ctx.beginPath(); ctx.moveTo(65, 0); ctx.lineTo(65 + Math.cos(a) * (9 + k * 9), Math.sin(a) * (9 + k * 9)); ctx.stroke();
  }
}
/** Falling broadside shell: a ribbed iron shot with a violet fuse ring. */
function drawShell(ctx, p, sx, sy) {
  const y = sy - p.r;
  circle(ctx, sx, y, p.r, '#3A4150', CROW.outline, 1);
  circle(ctx, sx - 2, y - 2, p.r * 0.4, '#5C6675', null, 0);
  pathPoly(ctx, [sx - 3, y - p.r - 4, sx + 3, y - p.r - 4, sx + 2, y - p.r, sx - 2, y - p.r]); paint(ctx, CROW.spark, CROW.outline, 1);
}

// ---------------------------------------------------------------- builds
const ADM_PAL = { ...CROW_PAL, primary: COAT, sleeve: '#C6BCA0', secondary: '#77809A', accent: GOLD, metal: '#C2CCD8', hair: '#4A2E24', glow: CROW.spark, rank: SASH };
const BASE_BUILD = {
  scale: 1.22, palette: ADM_PAL, outline: CROW.outline, outlineWidth: 1, proportions: CROW_PROPS,
  parts: { ...CROW_PARTS, torso: admiralCoat, hat: bicorne }, clan: SASH, smearColor: '#E4ECFA',
  // NO rank cuff and NO trouser lace on phases 1-2: the flag rank rides the sash, the epaulettes and the frogging.
  // Red arms and red trouser seams from phase 1 onward spend the terminus early — phase 3 is where the GARMENT
  // goes red, and it can only land as new if the red has stayed on cloth-of-office until then.
  crow: { coat: 'admiral', hair: 'crop', flag: true },
  weapon: { attach: 'handR', length: 68, draw: drawLance, headAt: 58 },
};
/** Phase 1: bicorne athwart, epaulettes, floor-length cape. The widest silhouette in the game. */
const ADMIRAL_BUILD = { ...BASE_BUILD, accessories: [{ attach: 'back', draw: admiralCape }] };
/** Phase 2: hat off, hair up, four vanes standing off the shoulders; the cape is cut away. */
const WING_BUILD = {
  ...BASE_BUILD, parts: { ...CROW_PARTS, torso: admiralCoat, hat: stormCrown },
  crow: { coat: 'admiral', hair: 'loose', flag: true, tailLen: 18 },
  accessories: [{ attach: 'back', draw: stormHarness }, { attach: 'back', draw: crowTails }],
};
/**
 * Phase 3, THE LAST CROW: a torn ribbon, shirt sleeves, nothing on her back — and the terminus of the rate ladder.
 * The gold hardware is stripped to the single surviving frogging bar, and the GARMENT becomes the rank mark: her
 * waistcoat goes to the ladder's red, so the reddest thing on the bridge is the person. The brow ribbon keeps the
 * sash colour, because it is the one rank mark she has left.
 */
const CROW_BUILD = {
  ...BASE_BUILD, scale: 1.14,
  palette: { ...ADM_PAL, primary: '#A8362E', secondary: '#8C99AE' },
  parts: { ...CROW_PARTS, torso: admiralCoat, hat: tornRibbon },
  // the terminus, and the ONLY phase with red on the garment: waistcoat, cuffs and trouser lace all at once
  crow: { coat: 'admiral', hair: 'crop', flag: true, cuff: true, lace: true, torn: true, scarf: GOLD_DK, scarfLen: 3 },
  accessories: [{ attach: 'torso', draw: crowScarf }],
};

// ---------------------------------------------------------------- projectiles
/** BROADSIDE: four shells walk down the deck from the guns below (they hurt her own boarders too). */
const SHELL = {
  fromSky: true, style: 'shell', height: 240, gravity: 0.5, life: 220, count: 4, spacing: 62, ahead: 30,
  noContactHit: true, onExpire: 'explode', radius: 44, r: 8, muzzle: false, draw: drawShell,
  explodeHit: { damage: 18, type: 'knockdown', kbX: 4, kbY: 5, hitstun: 22, friendly: true },
};
/** The last keg she has: lobbed where a hero stood half a second ago. */
const KEG = {
  style: 'bomb', aimAt: true, flight: 44, gravity: 0.4, noContactHit: true, bounces: 1, rest: true, life: 90,
  onExpire: 'explode', radius: 38, r: 7, muzzle: false, offsetX: 6, offsetY: 60, color: '#4A3A2E',
  explodeHit: { damage: 16, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 22, friendly: true },
  reflectable: true, damageOnReflect: 24, reflectSpeed: 6,
};

// ---------------------------------------------------------------- animations
const AC = { armR: [28, 20], weapon: -18, armL: [-22, -14] };
const ADM_STANCE = { lean: 1, head: 1, legR: [10, 4], legL: [-10, 6] };
/** Chain lightning: a lane-wide bolt that leaves a hero stunned where they stood. */
const ARC_BOX = { ...frontBox(150, hit(20, 'heavy', 6, 0, 26, { status: { stunned: { frames: 34 } } })), z: 22 };
const common = {
  // intro: she looks the boarding party over, tips the bicorne with the lance and levels it
  intro: { loop: false, frames: [
    FK(28, { ...AC, torso: 0, head: 0, root: [0, 1], legR: [10, 6], legL: [-10, 6] }, { ease: 'out' }),
    FK(26, { ...AC, armR: [-140, -20], weapon: -50, armL: [-30, -20], torso: -8, head: -12, face: 'angry' }, { sfx: 'crow_call', ease: 'inout', fx: [{ kind: 'spark', x: 30, y: 76, count: 6 }] }),
    FK(24, { ...AC, armR: [70, -10], weapon: -80, torso: 12, head: 2, root: [2, 0], face: 'angry' }, { sfx: 'coil_charge', ease: 'overshoot' }),
  ] },
  phaseChange: { loop: false, frames: [
    FK(16, { ...AC, torso: -22, head: -22, armR: [-30, 40], armL: [-70, -30], root: [-4, 0], face: 'hurt' }, { sfx: 'gale', ease: 'out' }),
    FK(16, { ...AC, torso: 16, head: 4, root: [0, 3], legR: [30, 40], legL: [-22, 40], squash: 1.1, stretch: 0.92, face: 'grit' }, { ease: 'in', fx: [{ kind: 'ring', x: 0, y: 40, r0: 10, r1: 120, color: CROW.spark }, { kind: 'spark', x: 0, y: 50, count: 8 }] }),
    FK(14, { ...AC, torso: 4, head: -4, root: [0, 1], face: 'angry' }, { ease: 'out' }),
  ] },
  // defeat: the lance goes over the rail, the harness dies, she goes down on one knee and then the deck
  defeat: { loop: false, frames: [
    FK(22, { ...AC, torso: -18, head: -24, armR: [-20, 54], weapon: -60, armL: [-72, -50], root: [-4, 0], legR: [24, 6], legL: [-16, 14], face: 'hurt' }, { sfx: 'crow_death', ease: 'out' }),
    FK(20, { ...AC, torso: 26, head: -2, armR: [46, 40], armL: [26, 36], root: [0, 5], legR: [46, 40], legL: [-30, 50], squash: 1.12, stretch: 0.9, face: 'dazed' }, { ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }] }),
    FK(70, { armR: [-22, -6], weapon: -14, armL: [28, 18], torso: 8, head: -16, legR: [12, 10], legL: [-4, 8], root: [26, -8, -88], face: 'dazed' }, { ease: 'out' }),
  ] },
};
/** Lance thrust: 22f levelling the lance behind the hip -> 8f drive -> hold -> 26f punish. Shared by phases 1 and 2. */
const thrust = crowStrike({
  tell: 22, active: 8, recovery: 26, carry: AC, lean: 1, tellSfx: 'coil_charge', sfx: 'rapier',
  hitbox: frontBox(78, hit(16, 'medium', 6, 0, 20)), fx: [{ kind: 'spark', x: 74, y: 48, count: 3 }],
  w1: { armR: [-26, 72], weapon: -47, armL: [34, 26], torso: -6, head: -2, root: [-3, 0], legR: [12, 8], legL: [-14, 10], face: 'angry' },
  w2: { armR: [-40, 88], weapon: -53, armL: [46, 30], torso: -14, head: 0, root: [-7, 1], legR: [8, 8], legL: [-18, 14], squash: 0.97, stretch: 1.03, face: 'grit' },
  h: { armR: [66, -6], weapon: -7, armL: [-42, 22], torso: 20, head: 4, root: [7, 1], legR: [44, 10], legL: [-34, 36], face: 'shout', squash: 1.04, stretch: 0.97 },
  smear: { from: 56, to: 10, a: 0.35, r: 76 },
  hold: { armR: [67, -4], weapon: 2, armL: [-44, 22], torso: 23, head: 5, root: [8, 1], legR: [44, 10], legL: [-34, 36], face: 'shout' },
  r: { armR: [54, 8], weapon: -6, armL: [-32, 18], torso: 14, head: 2, root: [4, 1], legR: [36, 10], legL: [-28, 30], face: 'grit' },
});
/** Sweeping cut: the lance goes round her; both sides, and it puts you down. Shared by phases 1 and 2. */
const cut = crowStrike({
  tell: 26, active: 12, recovery: 30, carry: AC, lean: 1, tellSfx: 'crow_call', sfx: 'rapier_arc',
  hitbox: frontBox(74, hit(20, 'knockdown', 7, 3, 24), { behind: true }),
  fx: [{ kind: 'slash', x: 0, y: 50, radius: 62, angle: 0, sweep: 220 }],
  w1: { armR: [-54, -18], weapon: -60, armL: [-38, 16], torso: -4, head: -4, root: [0, 0, -8], legR: [12, 6], legL: [-12, 8], face: 'angry' },
  w2: { armR: [-148, -6], weapon: -180, armL: [-120, 10], torso: -2, head: -10, root: [0, -2, -16], legR: [10, 8], legL: [-14, 10], squash: 0.97, stretch: 1.03, face: 'grit' },
  h: { armR: [110, -12], weapon: -400, armL: [108, -10], torso: 10, head: 4, root: [3, -2, 16], legR: [24, 10], legL: [-24, 12], face: 'shout', squash: 1.05, stretch: 0.96 },
  smear: { from: -180, to: 66, a: 0.6, r: 84 },
  hold: { armR: [118, -8], weapon: -452, armL: [114, -8], torso: 14, head: 6, root: [4, -1, 18], legR: [24, 10], legL: [-24, 12], face: 'shout' },
  r: { armR: [92, 4], weapon: -470, armL: [-34, 12], torso: 12, head: 2, root: [2, 1, 0], legR: [22, 10], legL: [-22, 12], face: 'grit' },
});
const p1Anims = Object.assign(makeCrowBase(AC, ADM_STANCE), common, {
  thrust,
  cut,
  // BROADSIDE: lance overhead, and the guns below walk four shells down the deck
  broadside: crowStrike({
    tell: 34, active: 10, recovery: 34, carry: AC, lean: 1, tellSfx: 'coil_charge', sfx: 'cannons',
    event: 'spawnProjectile', projectile: SHELL, fx: [{ kind: 'spark', x: 0, y: 78, count: 6 }],
    w1: { armR: [-146, -18], weapon: 10, armL: [-54, -26], torso: -6, head: -10, root: [0, 1], legR: [10, 6], legL: [-14, 10], face: 'angry' },
    w2: { armR: [-176, -6], weapon: -18, armL: [-80, -38], torso: -16, head: -18, root: [0, -2], legR: [8, 6], legL: [-16, 12], squash: 0.96, stretch: 1.05, face: 'shout' },
    h: { armR: [-182, 2], weapon: -22, armL: [-96, -44], torso: -22, head: -24, root: [0, 1], legR: [14, 8], legL: [-18, 12], face: 'shout', squash: 0.94, stretch: 1.07 },
    hold: { armR: [-178, 4], weapon: -12, armL: [-92, -42], torso: -20, head: -22, root: [0, 1], legR: [14, 8], legL: [-18, 12], face: 'shout' },
    r: { armR: [-150, -6], weapon: 28, armL: [-60, -24], torso: -6, head: -10, root: [0, 1], legR: [12, 8], legL: [-16, 10], face: 'angry' },
  }),
  // boarders: she signals over the rail and two Crimpers come up the lines (Boss.afterDamage plays this at 66% / 33%)
  summonEscort: crowStrike({
    tell: 22, active: 8, recovery: 28, carry: AC, lean: 1, tellSfx: 'crow_call', sfx: 'crow_call',
    event: 'summon', summon: [{ type: 'stormcrow', variant: 'crimper' }, { type: 'stormcrow', variant: 'crimper' }],
    w1: { armR: [26, 22], weapon: -18, armL: [-110, -36], torso: -4, head: -4, root: [-2, 0], legR: [12, 6], legL: [-12, 8], face: 'angry' },
    w2: { armR: [24, 24], weapon: -18, armL: [-162, -18], torso: -12, head: -14, root: [-4, -1], legR: [10, 6], legL: [-14, 10], squash: 0.97, stretch: 1.04, face: 'grit' },
    h: { armR: [22, 26], weapon: -18, armL: [-180, -4], torso: -18, head: -20, root: [0, 1], legR: [14, 6], legL: [-16, 10], face: 'shout', squash: 0.94, stretch: 1.07 },
    hold: { armR: [22, 26], weapon: -18, armL: [-176, -2], torso: -16, head: -18, root: [0, 2], legR: [14, 6], legL: [-16, 10], face: 'shout' },
    r: { armR: [26, 24], weapon: -18, armL: [-116, -18], torso: -2, head: -6, root: [0, 1], legR: [12, 6], legL: [-12, 8], face: 'angry' },
  }),
});
const p2Anims = Object.assign(makeCrowBase(AC, ADM_STANCE), common, {
  thrust,
  cut,
  // chain lightning: 40f charge (the lance head lights, her hair stands up, the glass blinks) -> the bolt -> 40f punish
  chain: crowStrike({
    tell: 40, active: 12, recovery: 40, carry: AC, lean: 1, tellSfx: 'coil_charge', sfx: 'thunder_strike',
    hitbox: ARC_BOX, fx: [{ kind: 'spark', x: 70, y: 50, count: 8 }],
    w1: { armR: [-144, -20], weapon: 10, armL: [-52, -28], torso: -6, head: -10, root: [0, 1], legR: [10, 6], legL: [-14, 10], face: 'angry' },
    w2: { armR: [-174, -6], weapon: -16, armL: [-78, -40], torso: -16, head: -16, root: [0, -2], legR: [8, 6], legL: [-16, 12], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { armR: [71, -8], weapon: 3, armL: [-40, 20], torso: 22, head: 6, root: [6, 1], legR: [42, 10], legL: [-32, 34], face: 'shout', squash: 1.06, stretch: 0.95 },
    smear: { from: -74, to: 5, a: 0.55, r: 82 },
    hold: { armR: [71, -6], weapon: 12, armL: [-42, 20], torso: 25, head: 7, root: [7, 1], legR: [42, 10], legL: [-32, 34], face: 'shout' },
    r: { armR: [50, 10], weapon: 2, armL: [-32, 14], torso: 14, head: 2, root: [3, 1], legR: [32, 10], legL: [-26, 26], face: 'grit' },
  }),
  // gale step: she vanishes in a violet puff and reappears behind whoever hit her, already swinging
  galeStep: { loop: false, frames: [
    FK(8, { ...AC, torso: -14, head: -12, armR: [-40, 20], armL: [-60, -20], root: [-3, 0], legR: [12, 8], legL: [-14, 10], face: 'angry' }, { tell: true, sfx: 'gale', ease: 'in' }),
    FK(4, { ...AC, torso: 0, head: -4, root: [0, -6], legR: [30, -40], legL: [16, -30], squash: 0.9, stretch: 1.12, face: 'closed' },
      { teleport: { toNearestEnemy: true, behind: true, range: 260, offset: 40 }, invuln: true, sfx: 'aether_step', ease: 'out', fx: [{ kind: 'ring', x: 0, y: 40, r0: 6, r1: 70, color: CROW.spark }] }),
    FK(8, { ...AC, torso: 10, head: 0, root: [0, 1], legR: [16, 10], legL: [-16, 12], face: 'shout', squash: 1.06, stretch: 0.95 }, { ease: 'out' }),
  ] },
});
const p3Anims = Object.assign(makeCrowBase(AC, ADM_STANCE), common, {
  // lance string: three quick stabs that chain into the finisher
  jab: crowStrike({
    tell: 14, active: 6, recovery: 16, carry: AC, lean: 1, tellSfx: 'coil_charge', sfx: 'rapier',
    hitbox: frontBox(72, hit(10, 'light', 4, 0, 16)), fx: [{ kind: 'spark', x: 70, y: 46, count: 2 }],
    w1: { armR: [-18, 66], weapon: -43, armL: [30, 24], torso: -4, head: -2, root: [-2, 0], legR: [12, 8], legL: [-14, 10], face: 'angry' },
    w2: { armR: [-32, 80], weapon: -49, armL: [40, 28], torso: -10, head: 0, root: [-5, 1], legR: [8, 8], legL: [-18, 12], squash: 0.98, stretch: 1.02, face: 'grit' },
    h: { armR: [68, -6], weapon: -7, armL: [-40, 20], torso: 18, head: 4, root: [6, 1], legR: [40, 10], legL: [-30, 32], face: 'shout', squash: 1.03, stretch: 0.97 },
    smear: { from: 52, to: 10, a: 0.3, r: 76 },
    hold: { armR: [70, -4], weapon: 2, armL: [-42, 20], torso: 20, head: 5, root: [7, 1], legR: [40, 10], legL: [-30, 32], face: 'shout' },
    r: { armR: [58, 6], weapon: -6, armL: [-30, 16], torso: 12, head: 2, root: [4, 1], legR: [32, 10], legL: [-26, 28], face: 'grit' },
  }),
  // finisher: a rising cut that launches
  rise: crowStrike({
    tell: 16, active: 9, recovery: 30, carry: AC, lean: 1, tellSfx: 'crow_call', sfx: 'rapier_arc',
    hitbox: frontBox(62, hit(18, 'launch', 3, 8, 24)), fx: [{ kind: 'slash', x: 52, y: 54, radius: 34, angle: -70, sweep: 120 }],
    w1: { armR: [-32, 64], weapon: 4, armL: [30, 26], torso: 12, head: 4, root: [0, 4], legR: [30, 40], legL: [-10, 30], squash: 1.07, stretch: 0.94, face: 'angry' },
    w2: { armR: [-46, 76], weapon: 8, armL: [38, 30], torso: 18, head: 6, root: [-2, 6], legR: [34, 48], legL: [-14, 36], squash: 1.1, stretch: 0.91, face: 'grit' },
    h: { armR: [204, -30], weapon: -12, armL: [-32, 20], torso: -16, head: -10, root: [5, -9], legR: [20, 10], legL: [-26, 30], face: 'shout', squash: 0.92, stretch: 1.1 },
    smear: { from: 42, to: -68, a: 0.55, r: 78 },
    hold: { armR: [212, -26], weapon: 2, armL: [-34, 20], torso: -20, head: -12, root: [5, -7], legR: [20, 10], legL: [-26, 30], face: 'shout' },
    r: { armR: [186, -16], weapon: 6, armL: [-26, 16], torso: -8, head: -6, root: [4, -3], legR: [22, 12], legL: [-24, 28], face: 'grit' },
  }),
  keg: crowStrike({
    tell: 26, active: 8, recovery: 30, carry: AC, lean: 1, tellSfx: 'bomb_fuse', sfx: 'throw',
    aimEvent: 'aim', event: 'spawnProjectile', projectile: KEG,
    w1: { armR: [-28, 58], weapon: -35, armL: [-40, 56], torso: 10, head: 6, root: [-2, 2], legR: [16, 12], legL: [-14, 12], face: 'angry' },
    w2: { armR: [116, 90], weapon: 130, armL: [104, 80], torso: -6, head: -6, root: [-5, 1], legR: [10, 10], legL: [-16, 12], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { armR: [140, 4], weapon: 80, armL: [128, 14], torso: -14, head: -12, root: [3, -2], legR: [20, 6], legL: [-18, 12], face: 'shout', squash: 0.95, stretch: 1.06 },
    smear: { from: -110, to: -40, a: 0.4, r: 60 },
    hold: { armR: [110, 8], weapon: 55, armL: [98, 16], torso: -8, head: -8, root: [4, -1], legR: [20, 6], legL: [-18, 12], face: 'shout' },
    r: { armR: [36, 22], weapon: 0, armL: [24, 12], torso: 12, head: 4, root: [2, 1], legR: [16, 8], legL: [-16, 10], face: 'grit' },
  }),
});

/** Admiral Odaline Kestrel, the Ninth Wing — the Stage 2 final boss. */
export const boss2 = {
  id: 'boss2', type: 'boss2', variant: 'kestrel', name: 'ADMIRAL ODALINE KESTREL', subtitle: 'THE NINTH WING',
  role: 'boss', bossKind: 'boss', boss: true, music: 'stormboss',
  build: ADMIRAL_BUILD, anims: p1Anims, score: 15000, drops: ['food_big', 'meter', 'score_big'],
  grabbable: false, throwDamageMult: 1, sfx: { hurt: 'crow_hurt', death: 'crow_death' },
  hooks: {
    /** Art state: the lance head charges through every coil wind-up, the harness flares whenever she leaves the deck. */
    onUpdate(f) {
      const a = f.anim, n = a.name, charging = (n === 'chain' || n === 'broadside') && a.frameIndex <= 1;
      f.rig.coil = charging ? Math.min(1, (a.frameIndex + a.frameTime / Math.max(1, a.frame.dur)) / 2) : (n === 'chain' ? 1 : 0);
      f.rig.wings = n === 'galeStep' || f.airborne;
    },
    onPhase(f, i, world) {
      if (!world) return;
      particles.burst('spark', f.x, f.h * 0.6, f.z, 14, { speed: 3.4, up: 2.4, color: CROW.spark });
      if (i === 2) particles.burst('debris', f.x, f.h * 0.5, f.z, 10, { speed: 3, up: 2, color: CROW.pewter, sizeJitter: 2 });
    },
  },
  ai: { attackRange: 78, zTolerance: 18, attackCooldown: [46, 84], firstAttackDelay: 46, ignoresTokens: true, retreatChance: 0, tellWarnFrames: 14 },
  phases: [
    { name: 'THE ADMIRAL', hp: 420, color: '#D8AE52', armor: false, walkSpeed: 1.5,
      summonAt: [0.66, 0.33], summon: [{ type: 'stormcrow', variant: 'crimper' }, { type: 'stormcrow', variant: 'crimper' }],
      ai: { attacks: [{ anim: 'thrust', range: 92, weight: 4 }, { anim: 'cut', range: 80, weight: 3 }, { anim: 'broadside', range: 420, minRange: 90, weight: 2 }] } },
    { name: 'STORM-WING', hp: 400, color: CROW.spark, armor: true, unlaunchable: true, walkSpeed: 1.8,
      build: WING_BUILD, anims: p2Anims, bandShrink: 16,
      // the coil vents every 150 HP: she stops attacking and takes double damage until it closes
      vent: { everyHp: 150, frames: 110, flag: 'venting', damageMult: 2, grabbable: false, stall: true, text: 'COIL VENTING!' },
      ai: { attacks: [{ anim: 'chain', range: 170, minRange: 50, weight: 4 }, { anim: 'cut', range: 80, weight: 3 }, { anim: 'thrust', range: 92, weight: 2 }],
        blinkOnDamage: 60, blinkAnim: 'galeStep', blinkChain: 'cut', attackCooldown: [40, 74] } },
    { name: 'THE LAST CROW', hp: 260, color: '#E8E8F0', armor: false, unlaunchable: false, grabbable: true, walkSpeed: 2.4,
      build: CROW_BUILD, anims: p3Anims,
      ai: { attackRange: 66, zTolerance: 14, attackCooldown: [26, 56], evadeChance: 0.4, evadeCooldown: 90,
        attacks: [{ anim: 'jab', range: 84, weight: 5, chain: 'rise' }, { anim: 'rise', range: 70, weight: 2 }, { anim: 'keg', range: 300, minRange: 90, weight: 2 }] } },
  ],
};
