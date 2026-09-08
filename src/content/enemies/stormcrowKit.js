// Stormcrow kit: the per-aeronaut gear that makes five freebooters read as five different people — headgear, back
// pieces and weapons — plus the shared part table. Art only (ARCHITECTURE.md section 14); the rig, palette and base
// animation set live in ./stormcrowRig.js.
//
// Headgear is the single biggest silhouette lever (docs/ART_STYLE.md section 0.6 / 11), and it is also the RATE
// ladder: a knotted bandana, a wide slouch hat, a bald head with a brass loupe, a sealed keel visor and a sealed
// iron muzzle. THE HIGHER THE RATE, THE MORE SEALED THE MASK — the bottom three keep their faces, the two elites
// are welded shut. Every one of them carries a piece of glass — goggles, a loupe, a sighting lens — and every one
// of them ends with ONE crowTell() on that glass, so the wind-up tell is the same violet light on all five heads.
// On the two sealed heads the dome, the crest and the mask belong to crowHelmShell / crowVisorMask (they must sit
// BEHIND the mask plate, and the hat hook draws last); `hatVisor` / `hatHelm` keep only what goes above the
// hairline and on top of the dome (the Galewright's storm ridge and rank brow strap, the Marine's dome rim).
// On a sealed head the hat is the LAST thing drawn over the lens, so its geometry is a hard constraint, not a
// preference: nothing a hat draws may reach the eye row, or it buries the lens shutter that is the helm's only
// expression and the head renders identically in idle, angry and shout.
// Back pieces are the second lever: a rope coil, a line drum, a powder keg, two lightning rods and the wing-pack.
import { celRect, celBall, celPoly, celCapsule, tones, rimTop, band } from '../../art/shading.js';
import { getChain } from '../../art/secondary.js';
import { rad } from '../../engine/math.js';
import {
  CROW, farTone, crowHead, crowFace, crowBeard, crowCoat, crowHips, crowArmUpper, crowArmLower, crowHand,
  crowLegUpper, crowLegLower, crowBoot, crowTell, crowGoggles, crowWings, crowTails, crowRank, rankBand, rankH,
} from './stormcrowRig.js';

const R = Math.round, TAU = Math.PI * 2;
const EMPTY = {};
const WOOD = '#7A5230', WOOD_D = '#54371F', IRON = '#647294', KEG = '#584038';   // the keg down to the neutral ceiling and out of the stages' amber cells
const WOOD_F = farTone(WOOD);

// ---------------------------------------------------------------- headgear (head space, facing right)
/**
 * C1 Deck Crimper: a knotted bandana over the crown with two tails on a chain, goggles shoved up onto the knot.
 * The rag is deliberately NEUTRAL canvas: the lowest rate carries its rank on the armband and nowhere else, and a
 * warm bandana would be a second high-chroma warm competing with the ladder (see stormcrowRig.js header).
 */
function hatBandana(ctx, rig, r) {
  const col = CROW.canvasSh;
  celPoly(ctx, rig, [-r - 2, R(-r * 0.82), -r - 1, R(-r * 1.12), R(-r * 0.5), R(-r * 1.44), R(r * 0.5), R(-r * 1.4), r + 2, R(-r * 1.0), r + 2, R(-r * 0.8)], col, 0.4, 0.28);
  if (!rig.override) {
    ctx.fillStyle = tones(rig, col).deep;
    for (let x = -r; x < r; x += 5) ctx.fillRect(R(x), R(-r * 0.95), 3, 1);
  }
  // knot + one short tail off the back of the skull
  const ch = getChain(rig, 'tail', 2, { joint: 'head', rest: [-1, 0.5], stiffness: 0.16, damping: 0.66, gain: 2.2, rotGain: 0.5, maxAng: 38 });
  ctx.save(); ctx.translate(R(-r * 1.02), R(-r * 0.95));
  celBall(ctx, rig, 0, 0, 3, col, false);
  for (let i = 0; i < 2; i++) {
    ctx.rotate(rad(ch.ang[i] - (i ? 14 : 36)));
    celPoly(ctx, rig, [0, -2, -8, -3, -8, 2, 0, 3], col, 0.42, 0);
    ctx.translate(-7, 0);
  }
  ctx.restore();
  crowGoggles(ctx, rig, r, R(-r * 1.15));
  crowTell(ctx, rig, r, R(r * 0.55), R(-r * 1.15));
}
/** C2 Line Corsair: a wide slouch hat, brim pinned up at the back, one long feather; goggles under the brim. */
function hatSlouch(ctx, rig, r) {
  crowGoggles(ctx, rig, r, R(-r * 0.92));
  const col = CROW.leatherDark;
  // feather first, behind the crown
  celPoly(ctx, rig, [R(-r * 0.4), R(-r * 1.3), R(-r * 2.2), R(-r * 2.5), R(-r * 2.5), R(-r * 2.1), R(-r * 0.5), R(-r * 1.1)], CROW.canvas, 0.4, 0.3);
  celPoly(ctx, rig, [R(-r * 0.9), R(-r * 1.5), R(-r * 0.2), R(-r * 2.1), R(r * 0.7), R(-r * 2.0), R(r * 1.0), R(-r * 1.42)], col, 0.38, 0.28);
  // brim: swept forward and down, tacked up over the back of the crown
  celPoly(ctx, rig, [R(-r * 2.0), R(-r * 1.24), R(-r * 0.3), R(-r * 1.6), R(r * 1.1), R(-r * 1.56), R(r * 2.3), R(-r * 1.16), R(r * 1.2), R(-r * 1.06), R(-r * 1.0), R(-r * 1.02)], col, 0.36, 0.3);
  if (rig.override) return;
  // rank hatband: the first rate whose colour reaches the head (and 3 local units failed the 3px floor at 0.93)
  rankBand(ctx, rig, R(-r * 0.85), R(-r * 1.58), R(r * 1.7), rankH(rig, 5));
  rimTop(ctx, rig, R(-r * 1.6), R(-r * 1.2), R(r * 1.6), R(-r * 1.36), CROW.strap);
  crowTell(ctx, rig, r, R(r * 0.55), R(-r * 0.92));
}
/** C3 Powder Bosun: bald, a leather brow band and a brass powder-loupe screwed over the near eye. */
function hatLoupe(ctx, rig, r) {
  celRect(ctx, rig, R(-r) - 1, R(-r * 1.12), R(r * 2) + 2, 6, 2, CROW.leatherDark, 0.4, 0.24);
  const cx = R(r * 0.5), cy = R(-r * 1.06);
  celBall(ctx, rig, cx, cy, 5.4, CROW.brass, true);
  ctx.beginPath(); ctx.arc(cx, cy, 3.4, 0, TAU); ctx.fillStyle = rig.col(rig.tell ? CROW.glassHot : '#5B7A6A'); ctx.fill();
  if (rig.override) return;
  ctx.fillStyle = rig.col('#FFFFFF'); ctx.fillRect(cx - 3, cy - 3, 2, 2);
  // the brow strap is his rank band, laid INTO the leather so the strap frames it on all four sides. It is kept to
  // strap width on purpose: at full head width x 5 units on a 1.15-scale 9.5r head it was a ~22x6px bar, the
  // biggest rank field on the deck, and a rate-3 line trooper out-signalled the rate-4 elite above him.
  rankBand(ctx, rig, R(-r * 0.68), R(-r * 1.12) + 1, R(r * 1.36), rankH(rig, 3));
  crowTell(ctx, rig, r, cx, cy);
}
/**
 * C4 Galewright, ABOVE THE HAIRLINE ONLY: a pewter storm ridge on the crown and a brow strap carrying her rank band.
 * The dome, the storm cowl, the keel beak and the lens are crowHelmShell / crowVisorMask.
 * Three things are load-bearing here and none of them may be walked back:
 *  - EVERYTHING CLEARS THE EYE ROW. The furniture sits at local y -14..-9 on her r=8 head, so the lens (-6..4, and
 *    -8..6 at full coil), its 2x2 specular and the pewterDark shutter that IS her expression are all uncovered.
 *    Laid at -r*1.06 it covered the shutter outright and her idle / angry / shout heads rendered byte-identical.
 *  - THE STRAP IS COLD. A's brass fitting is gone: rank amber (40.2), brass (36.0) and the pewter dome (37.4) are
 *    three values inside 11% of each other, so a band dropped into a brass frame made one warm slab and the head
 *    stopped reading as sealed. On CROW.pewterDark (13.1) the band is 67% off its frame and the lens still wins.
 *  - THE RIDGE IS THE TELL. It rears up with `rig.coil` across the 36-frame gale charge, which is the SILHOUETTE
 *    component A carried on her standing hair; a lens that only grows two rows is not a lane-wide wind-up.
 */
function hatVisor(ctx, rig, r) {
  if (!(rig.build.crow || EMPTY).sealed) return;
  const k = 1 + (rig.coil || 0) * 0.55;
  celPoly(ctx, rig, [R(-r * 0.45), R(-r * 1.45), R(-r * 0.2), R(-r * 2.2 * k), R(r * 0.3), R(-r * 2.3 * k), R(r * 0.6), R(-r * 1.45)], CROW.pewter, 0.34, 0.3);
  celRect(ctx, rig, R(-r * 0.95), R(-r * 1.75), R(r * 1.9), 6, 2, CROW.pewterDark, 0.34, 0.3);
  if (rig.override) return;
  // WIDENED 1.4r -> 1.6r (the pewterDark frame runs -0.95r..0.95r, so it still frames the band on all four sides).
  // tools/stormcrow-pixels.mjs is the arbiter and it is measured in RATE order, not registry order: her rank field
  // has to out-signal the Bosun below her, and at 1.4r it did not (galewright 1.285 % of actor pixels against his
  // 1.320 %). Re-run that census after touching any rank carrier on any rate.
  rankBand(ctx, rig, R(-r * 0.8), R(-r * 1.64), R(r * 1.6), rankH(rig, 4));
}
/**
 * C5 Ironwing Marine, ABOVE THE HAIRLINE ONLY: the dome rim light and the rank brow band. The crest, the dome, the
 * nape plate, the iron muzzle and the lens all moved into crowHelmShell / crowVisorMask; there is no second lamp
 * and no second crowTell here — one unmistakable light per head.
 */
function hatHelm(ctx, rig, r) {
  if (rig.override || !(rig.build.crow || EMPTY).sealed) return;
  rimTop(ctx, rig, R(-r * 1.0), R(-r * 1.05), R(r * 0.4), R(-r * 1.34), CROW.pewter);
}
const HATS = { bandana: hatBandana, slouch: hatSlouch, loupe: hatLoupe, visor: hatVisor, helm: hatHelm };
/** Headgear dispatch (hat hook, drawn last in head space so the tell sits over everything). */
export function crowHat(ctx, rig, pose, inf) {
  const f = HATS[(rig.build.crow || 0).head];
  if (f) f(ctx, rig, inf.r);
}

// ---------------------------------------------------------------- back pieces (torso space, back layer)
/** C1: a coil of boarding line with the grapnel hooked through it, slung on the shoulder. */
export function crowLines(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), x = -hw - 3, y = -R(p.torsoH * 0.5);
  celBall(ctx, rig, x, y, 8, CROW.rope, false);
  if (!rig.override) {
    // the coil's eye. The two 1px winding lines that used to sit across it are gone: 14x1 and 12x1 marks are under
    // section 0.7's floor, they were the largest single source of sub-2px noise on the Crimper, and the ball's own
    // cel shadow already says "wound rope".
    ctx.fillStyle = rig.col(CROW.coatDark); ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
  }
  celPoly(ctx, rig, [x - 2, y - 12, x + 3, y - 13, x + 4, y - 6, x - 1, y - 6], CROW.pewter, 0.34, 0.3);
  if (rig.override) return;
  ctx.strokeStyle = rig.col(CROW.pewterDark); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x + 4, y - 12, 5, 1.2, 4.4); ctx.stroke();
}
/** C2: the harpoon reel — a wound line drum with the rope running forward to the gun. */
export function crowReel(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), x = -hw - 4, y = -R(p.torsoH * 0.62);
  celRect(ctx, rig, x - 4, y, 13, 18, 3, IRON, 0.36, 0.3);
  celBall(ctx, rig, x + 2, y + 2, 6, CROW.rope, false);
  if (rig.override) return;
  // (the three 1px drum windings are gone with the Crimper's: under the 2px floor, and the drum's cel shadow does it)
  ctx.strokeStyle = rig.col(CROW.rope); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 8, y + 4); ctx.quadraticCurveTo(0, y - 4, R(p.torsoW * 0.5), R(-p.torsoH * 0.3)); ctx.stroke();
  band(ctx, rig, x - 4, y + 14, 13, 4, CROW.brass);   // drum band: brass on iron, INKED and at the 4px floor
}
/** C3: a half-keg of powder strapped across the back with two iron hoops and a slow match. */
export function crowKeg(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), x = -hw - 5, y = -R(p.torsoH * 0.86);
  celRect(ctx, rig, x - 4, y, 16, R(p.torsoH * 0.72), 6, KEG, 0.4, 0.28);
  if (rig.override) return;
  band(ctx, rig, x - 4, y + 3, 16, 4, IRON);
  band(ctx, rig, x - 4, y + R(p.torsoH * 0.52), 16, 4, IRON);
  ctx.strokeStyle = rig.col(CROW.rope); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 8, y + 1); ctx.quadraticCurveTo(x + 16, y - 8, x + 10, y - 12); ctx.stroke();
  ctx.fillStyle = rig.col('#FF9A30'); ctx.fillRect(x + 8, y - 14, 3, 3);
}
/** C3 front: the charge bandolier across the chest (torso accessory, front layer). */
export function crowBandolier(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), H = p.torsoH;
  ctx.save();
  ctx.strokeStyle = rig.col(CROW.leather); ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-hw + 1, -H + 3); ctx.lineTo(hw + 1, R(-H * 0.16)); ctx.stroke();
  if (!rig.override) {
    ctx.strokeStyle = rig.col(tones(rig, CROW.leather).sh); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-hw + 1, -H + 6); ctx.lineTo(hw + 1, R(-H * 0.16) + 3); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const u = 0.24 + i * 0.24, cx = R(-hw + 1 + (hw * 2) * u), cy = R(-H + 3 + (H * 0.84) * u);
      ctx.fillStyle = rig.col(CROW.brass); ctx.fillRect(cx - 2, cy - 1, 4, 6);
      ctx.fillStyle = tones(rig, CROW.brass).deep; ctx.fillRect(cx - 2, cy + 3, 4, 2);
    }
  }
  ctx.restore();
}
/** C4: the storm battery — a copper canister with two ribbed lightning rods that bead violet as `rig.coil` climbs. */
export function crowRods(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), x = -hw - 3, y = -R(p.torsoH * 0.55), k = rig.coil || 0;
  celCapsule(ctx, rig, x, y - 2, x, y + 14, 5, CROW.copper, 0.3);
  for (let i = 0; i < 2; i++) {
    const dx = i ? 6 : -4, top = y - 26 - i * 7;
    celCapsule(ctx, rig, x + dx, y, x + dx + (i ? 9 : -7), top, 2.6, CROW.pewterDark, 0.3);
    if (rig.override) continue;
    ctx.fillStyle = rig.col(k > 0.05 ? CROW.sparkPale : CROW.spark);
    ctx.fillRect(x + dx + (i ? 7 : -9), top - 3, 5, 5);
  }
  if (rig.override) return;
  const t = tones(rig, CROW.copper);
  ctx.fillStyle = t.hi; ctx.fillRect(x - 4, y + 2, 9, 3);
  ctx.fillStyle = t.deep; ctx.fillRect(x - 4, y + 8, 9, 3);
  if (k <= 0.05) return;
  ctx.strokeStyle = rig.col(CROW.spark); ctx.lineWidth = 1.5;
  for (let i = 0; i < 2; i++) {
    const a = rig.tick * 0.5 + i * 3;
    ctx.beginPath(); ctx.moveTo(x + 2, y - 26);
    ctx.lineTo(x + 2 + Math.cos(a) * (7 + k * 7), y - 26 + Math.sin(a) * (7 + k * 7)); ctx.stroke();
  }
}

// ---------------------------------------------------------------- weapons (hand space: +x along the forearm)
/** Boat hook: an ash pole with a whipped grip, a pewter spike and a proper backward-curling hook (Deck Crimper). */
export function drawBoatHook(ctx, rig, pose, inf) {
  const far = inf && inf.far;
  celCapsule(ctx, rig, -14, 0, 36, 0, 3, far ? WOOD_F : WOOD, 0.3);
  celPoly(ctx, rig, [34, -3, 48, -4, 55, 0, 48, 4, 34, 3], CROW.pewter, 0.36, 0.32);
  celPoly(ctx, rig, [40, -3, 41, -14, 47, -16, 50, -11, 45, -10, 44, -2], CROW.pewter, 0.34, 0.3);
  if (rig.override) return;
  band(ctx, rig, -8, -3, 10, 6, CROW.rope); ctx.fillStyle = rig.col(CROW.rope); ctx.fillRect(24, -3, 4, 6);
  ctx.fillStyle = tones(rig, far ? WOOD_F : WOOD).deep; ctx.fillRect(2, -1, 22, 3);
}
/** Line gun: a stubby harpoon launcher with a wooden stock and a reel drum; the harpoon seats until `rig.fired`. */
export function drawLineGun(ctx, rig) {
  celPoly(ctx, rig, [-12, -2, -4, -6, 16, -6, 18, 6, -4, 6, -10, 3], WOOD, 0.38, 0.3);
  celRect(ctx, rig, 2, -6, 20, 8, 2, IRON, 0.36, 0.32);
  celBall(ctx, rig, 4, 5, 5, CROW.brass, false);   // its 2x2 cel dot is a stud under the floor at 0.93 scale
  if (!rig.fired) celPoly(ctx, rig, [18, -3, 38, -3, 44, 0, 38, 3, 18, 3], CROW.pewter, 0.34, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CROW.rope); ctx.fillRect(2, 3, 10, 3);
  ctx.fillStyle = tones(rig, IRON).deep; ctx.fillRect(6, -4, 14, 3);
}
/** Chain shot: a leather grip, four swinging links and two iron balls (Powder Bosun). */
export function drawChainShot(ctx, rig, pose) {
  celRect(ctx, rig, -6, -3.5, 14, 7, 2, CROW.leather, 0.4, 0.2);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CROW.brass); ctx.fillRect(-6, -3, 3, 6);
  const swing = (pose.weapon && pose.weapon.rot) || 0;
  ctx.strokeStyle = rig.col(CROW.pewterDark); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(8, 0);
  for (let i = 1; i <= 4; i++) ctx.lineTo(8 + i * 8, Math.sin(i * 1.2 + swing * 0.03 + rig.tick * 0.5) * (1 + i * 0.8));
  ctx.stroke();
  for (const d of [34, 43]) celBall(ctx, rig, d, Math.sin(d * 0.16 + swing * 0.03 + rig.tick * 0.5) * 3, 5.5, IRON, true);
}
/** Storm coil: a rod of copper rings ending in a glass bulb that brightens and arcs with `rig.coil` (Galewright). */
export function drawCoilRod(ctx, rig) {
  const k = rig.coil || 0;
  celCapsule(ctx, rig, -9, 0, 26, 0, 3, CROW.pewterDark, 0.3);
  for (let i = 0; i < 3; i++) celBall(ctx, rig, 8 + i * 6, 0, 3.4, CROW.copper, false);
  celBall(ctx, rig, 33, 0, 5 + k * 2.5, k > 0.05 ? CROW.sparkPale : CROW.glass, false);
  if (rig.override || k <= 0.05) return;
  ctx.strokeStyle = rig.col(CROW.spark); ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = rig.tick * 0.6 + i * 2.1;
    ctx.beginPath(); ctx.moveTo(33, 0);
    ctx.lineTo(33 + Math.cos(a) * (8 + k * 8), Math.sin(a) * (8 + k * 8));
    ctx.stroke();
  }
}
/** Boarding axe: a short haft with a bearded crescent head and a back spike (Ironwing Marine, Skree). */
export function drawBoardingAxe(ctx, rig, pose, inf) {
  const far = inf && inf.far;
  celCapsule(ctx, rig, -9, 0, 26, 0, 3, far ? WOOD_F : WOOD, 0.3);
  celPoly(ctx, rig, [22, -15, 33, -14, 39, -4, 36, 7, 28, 12, 22, 6, 25, -3], CROW.pewter, 0.34, 0.34);
  celPoly(ctx, rig, [22, -3, 12, -9, 12, 3], CROW.pewterDark, 0.34, 0.3);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, CROW.pewter).deep; ctx.fillRect(26, 1, 9, 3);
  band(ctx, rig, -6, -3, 8, 6, CROW.rope);
  rimTop(ctx, rig, 25, -13, 35, -5, CROW.pewter);
}
/**
 * Wing-plate shield on the off hand (handL accessory): a fan of three feathered pewter vanes on a canvas backing,
 * lit violet on a wind-up (`rig.tell`) and gone for good once a launcher strips it (`rig.shieldStripped`).
 */
export function drawWingShield(ctx, rig) {
  if (rig.shieldStripped) return;
  const hot = rig.tell;
  celPoly(ctx, rig, [-5, -22, 7, -19, 13, -6, 12, 8, 5, 21, -5, 22, -8, 0], CROW.leatherDark, 0.34, 0.3);
  for (let i = 0; i < 3; i++) {
    const y = -18 + i * 13;
    celPoly(ctx, rig, [-1, y, 9, y + 2, 11, y + 9, -1, y + 11], hot ? CROW.sparkPale : CROW.pewter, 0.34, 0.34);
    if (!rig.override) { ctx.fillStyle = tones(rig, hot ? CROW.sparkPale : CROW.pewter).deep; ctx.fillRect(1, y + 5, 8, 3); }
  }
  if (rig.override) return;
  band(ctx, rig, 0, -3, 7, 7, crowRank(rig));
  ctx.fillStyle = rig.col(CROW.brass); ctx.fillRect(1, -1, 4, 3);
}

/** Complete Stormcrow part table (everything else falls back to the shared humanoid defaults in art/rig.js). */
export const CROW_PARTS = {
  head: crowHead, face: crowFace, beard: crowBeard, hat: crowHat, torso: crowCoat, hips: crowHips,
  armUpper: crowArmUpper, armLower: crowArmLower, hand: crowHand,
  legUpper: crowLegUpper, legLower: crowLegLower, foot: crowBoot,
};
/** Wing-pack + coat tails: the boss back kit (line troops each carry their own piece instead). */
export const CROW_BACK = [{ attach: 'back', draw: crowWings }, { attach: 'back', draw: crowTails }];
export { IRON, WOOD, KEG };
