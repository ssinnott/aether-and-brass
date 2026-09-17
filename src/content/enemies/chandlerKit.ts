// The Chandlery's hand tools, waist loads and lamps: seventeen prop draws plus the timber, tarp, kiln, dram and
// cart colours they are painted in. Split out of chandler.js, which was the largest content file at 1119 lines,
// alongside the chandlerRig.js this faction already had -- a rig is the body, a kit is what the body carries.
import { CH, CLAN, drawLamp, lampGlass, lampState } from './chandlerRig.ts';
import { celRect, celBall, celPoly, tones, band } from '../../lib/art/shading.ts';
import { farShade } from '../../art/palettes.ts';
import { getChain } from '../../lib/art/secondary.ts';
import { pathPoly, paint } from '../../lib/art/shapes.ts';
import { rad } from '../../lib/engine/math.ts';

const R = Math.round;
const WOOD = '#D9C08E', TARP = '#B0AE96', KILN = '#394249', DRAM = '#2E4A38', CART = '#3E362C';
const LEDGER_FAR = farShade(CH.quicklime, 0.62, 0.25), LEDGER_CLAN = farShade(CLAN.tallyman, 0.62, 0.25);

// ================================================================ tools (hand space: +x along the forearm)
/** Wickboy: 56px lighting-pole, leather-bound, with the faction's only lamp carried ABOVE the head and a live wick. */
function drawPole(ctx, rig) {
  celRect(ctx, rig, -8, -2, 54, 4, 2, CH.leather, 0.4, 0.2);
  if (!rig.override) { const t = tones(rig, CH.pewter); ctx.fillStyle = t.base; ctx.fillRect(-7, -2, 4, 4); ctx.fillRect(24, -2, 3, 4); }
  drawLamp(ctx, rig, 48, 0, 1.1);   // k 0.85 gave a 5x5 glass, under §0.7's 6 px glow floor, on the faction's furthest lamp
  if (rig.override) return;
  const s = (rig.lamp | 0) === 0 ? 0 : 3 + ((rig.tick & 2) ? 1 : 0);
  if (!s) return;
  ctx.fillStyle = rig.col(CH.lime); ctx.fillRect(46, -8 - s, 4, s + 2);
  ctx.fillStyle = rig.col(CH.hot); ctx.fillRect(47, -7 - s, 2, s);
}
/** Tallyman: 44px chalk-stave — a plain pewter-ferruled measuring rod with chalk gradations. */
function drawStave(ctx, rig) {
  celRect(ctx, rig, -6, -2, 44, 4, 2, WOOD, 0.4, 0.25);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CH.pewter); ctx.fillRect(32, -3, 4, 6);
  // the gradations are the TALLYMAN'S rung of the company ladder: the rod is the only thing he carries that is his
  // own, and in chalk-white they were three more pale marks on the palest rig in the game (census: 208 px, the
  // second-lowest rank mark in the faction). Same three marks, 3 px wide, in the company's ledger blue.
  ctx.fillStyle = rig.col(CLAN.tallyman); ctx.fillRect(6, -2, 3, 4); ctx.fillRect(16, -2, 3, 4); ctx.fillRect(26, -2, 3, 4);
}
/** Limeburner: the wide lime shovel — the only Chandler tool that is a slab rather than a stick. */
export function drawShovel(ctx, rig) {
  celRect(ctx, rig, -8, -2.5, 28, 5, 2, CH.leather, 0.4, 0.2);
  celPoly(ctx, rig, [18, -13, 36, -15, 42, 0, 36, 15, 18, 13], CH.pewter, 0.36, 0.3);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, CH.pewter).deep; ctx.fillRect(20, -2, 18, 3);
  band(ctx, rig, 30, -8, 6, 5, CH.quicklime, 1);        // caked lime on the blade: quicklime on pewter takes the line
}
/** Purser: 38px pewter-ferruled swagger cane, dark shaft, knob at the pommel. */
function drawCane(ctx, rig) {
  celRect(ctx, rig, -8, -1.5, 42, 3, 1, CH.rubber, 0.4, 0.2);
  celBall(ctx, rig, -8, 0, 3.5, CH.pewter, false);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CH.pewter); ctx.fillRect(28, -2, 5, 4);
}
/** Resurrection Man: two-handed body-tongs, a scissor jaw on a 50px shaft (grip -8, the stacked bat grip of ART_STYLE 5). */
function drawTongs(ctx, rig, pose) {
  // a pewter shaft, not a leather one: a brown haft vanished into the coat and the thigh behind it
  celRect(ctx, rig, -15, -3, 37, 6, 2, CH.pewter, 0.4, 0.25);
  const open = 1 - Math.min(1, pose.grip || 0);
  const j = R(5 + open * 8);
  celPoly(ctx, rig, [20, -3, 34, -4 - j, 44, -2 - j, 37, 3 - j, 25, 1], CH.pewter, 0.38, 0.3);
  celPoly(ctx, rig, [20, 3, 34, 4 + j, 44, 2 + j, 37, -3 + j, 25, -1], CH.pewter, 0.38, 0.25);
  if (rig.override) return;
  band(ctx, rig, -14, -3, 18, 6, CH.rubber, 2);   // rubber grip — the biggest faked boundary on any Chandler tool
  band(ctx, rig, 16, -4, 5, 8, CH.leather, 1);    // the pivot collar
}
/**
 * Runner: a 26px ash splint in a pewter drip-cup — the faction's smallest light and its only NAKED flame. The flame is a
 * lamp with no glass: it takes the same three `rig.lamp` states (dead stub / idle / flooded with a hot core) so the boy
 * reads in the faction's language, and the glass-less shape is what says "taper, not lamp" at a glance.
 */
function drawTaper(ctx, rig) {
  celRect(ctx, rig, -6, -1.5, 24, 3, 1, WOOD, 0.4, 0.25);
  celRect(ctx, rig, 17, -3, 6, 6, 1, CH.pewter, 0.4, 0.3);
  if (rig.override) return;
  // flat, no ramp (ART_STYLE 4 glow rule). These are LOCAL units and the Runner is the smallest Chandler (scale 0.82),
  // so every mark is sized to clear its floor ON THE DEVICE GRID, which is where §0.7 measures: an 8x8 body is 6.6 device
  // px against the 6 px glow floor (the old 7x6 measured 5.7 and missed it), and the tongue flickers 3-4 local = 2.5-3.3
  // device against the flat 2 px detail floor (the old 2-3 measured 1.6). State 0 is a grey wick stub.
  const s = lampState(rig);
  ctx.fillStyle = rig.col(lampGlass(rig));
  if (s === 0) { ctx.fillRect(23, -2, 4, 4); return; }
  ctx.fillRect(22, -4, 8, 8); ctx.fillRect(29, -2, 3 + ((rig.tick >> 1) & 1), 4);
  if (s === 2) { ctx.fillStyle = rig.col(CH.hot); ctx.fillRect(23, -2, 5, 5); }
}
/**
 * Drayman: the cart hook — a 26px iron shaft with a curled bill and a short ash T-grip at the pommel. Two-handed for the
 * slam: the far hand stacks onto the T-grip (weapon.grip -9, the stacked bat grip of ART_STYLE 5), which keeps the grip
 * point inside the far arm's 28 px reach (+3 slack) on every slam key — measured 21.6 on the raised key and 28.7 on the
 * floor key with the near elbow bent (tools/art-check.js geom/pose-audit).
 */
function drawCartHook(ctx, rig) {
  celRect(ctx, rig, -13, -4, 6, 8, 1, WOOD, 0.4, 0.25);
  celRect(ctx, rig, -8, -2, 26, 4, 2, CH.pewter, 0.4, 0.25);
  celPoly(ctx, rig, [16, -3, 24, -6, 30, -1, 28, 6, 22, 8, 20, 4, 25, 3, 25, 0, 20, 1], CH.pewter, 0.38, 0.3);
  if (rig.override) return;
  band(ctx, rig, -7, -2, 8, 4, CH.leather, 1);   // the leather grip wrap: leather on iron is a material change, so it takes the line
}

// ================================================================ waist loads and lamps (accessories)
/** Wickboy: tallow bucket + hand bellows on a belt strap (hip space) — small, low, never above the shoulders. */
function drawBucket(ctx, rig) {
  const hw = R(rig.p.hip / 2);
  celPoly(ctx, rig, [-hw - 9, -2, -hw + 1, -3, -hw, 8, -hw - 8, 7], CH.pewter, 0.4, 0.25);
  celPoly(ctx, rig, [hw - 1, -1, hw + 10, -4, hw + 11, 4, hw, 6], CH.leather, 0.4, 0.2);
  if (rig.override) return;
  band(ctx, rig, -hw - 7, -2, 6, 4, CLAN.wickboy, 1);   // the Wickboy's rung: the smallest on the ladder, as fodder's should be
  ctx.fillStyle = rig.col(CH.rubber); ctx.fillRect(hw + 3, -2, 6, 3);
}
/** Tallyman: shepherd's crook over the right shoulder with the lamp swinging from the hook (back layer, torso space). */
function drawCrook(ctx, rig) {
  const p = rig.p, x = R(p.torsoW * 0.35), top = -p.torsoH - 16;
  celRect(ctx, rig, x - 2, top, 4, p.torsoH + 14, 2, WOOD, 0.4, 0.2);
  celPoly(ctx, rig, [x - 2, top, x + 12, top - 1, x + 12, top + 3, x - 2, top + 4], WOOD, 0.4, 0.2);
  const ch = getChain(rig, 'lamp', 2, { joint: 'torso', rest: [0, 1], stiffness: 0.18, damping: 0.64, gain: 1.4, rotGain: 0.4, maxAng: 26 });
  ctx.save(); ctx.translate(x + 10, top + 3);
  ctx.rotate(rad(ch.ang[0])); if (!rig.override) { ctx.fillStyle = rig.col(CH.pewter); ctx.fillRect(-1, 0, 2, 6); }
  ctx.translate(0, 6); ctx.rotate(rad(ch.ang[1]));
  drawLamp(ctx, rig, 0, 6, 1.05);   // 6x6 of glass: k 0.9 was 5x5, under the same §0.7 floor as the Wickboy's pole lamp
  ctx.restore();
}
/** Tallyman: ledger board strapped to the far forearm (handL space) — the only Chandler reading something. */
function drawLedger(ctx, rig) {
  // it hangs off the FAR forearm, so it takes far values: at CH.quicklime it sat at exactly the near sleeve's value,
  // and the closeup showed two identical white slabs on the chest with no way to tell the arm from the item (§5).
  celRect(ctx, rig, -1, -13, 11, 15, 1, LEDGER_FAR, 0.4, 0.25);
  if (rig.override) return;
  // the bound spine is the Tallyman's rung of the company ladder: 4 px of far-shaded ledger blue with the line
  // under it, not 3 px of unoutlined brown that read as the board's own shadow
  band(ctx, rig, -1, -13, 4, 15, LEDGER_CLAN, 1);
  ctx.fillStyle = tones(rig, LEDGER_FAR).sh;
  for (let i = 0; i < 3; i++) ctx.fillRect(3, -10 + i * 4, 6, 2);
}
/** Limeburner: the hip kiln drum, the lamp behind its grate (so his cone comes out STRIPED) and a puffing chimney. */
function drawKiln(ctx, rig) {
  const hw = R(rig.p.hip / 2);
  // greened pewter, not near-black: an 18x24 KILN drum plus the hose, the gauntlets and the boots stacked into a dark
  // upper body and grouped the Limeburner with the Sootborn silhouette mass at squint (§4 'SMALL AREAS ONLY')
  celRect(ctx, rig, hw - 2, -12, 18, 24, 4, CH.pewter, 0.4, 0.28);
  celRect(ctx, rig, hw + 2, -19, 6, 8, 2, KILN, 0.4, 0.3);              // the rubber chimney collar
  drawLamp(ctx, rig, hw + 7, 1, 1.3);                                    // 8x9 of glass, over §0.7's 6 px floor
  if (rig.override) return;
  band(ctx, rig, hw - 1, -12, 16, 4, CLAN.limeburner, 1);   // the Limeburner's rung: kiln red, 4 px, inked
  // ONE window in a grate frame instead of three 2px bars laid across a 6px glass (which read as a smudge at 1x);
  // cold iron on a greened pewter drum is a MATERIAL change, so both bars carry the line
  band(ctx, rig, hw + 1, -8, 13, 4, KILN, 1); band(ctx, rig, hw + 1, 7, 13, 4, KILN, 1);
}
/** Limeburner: the corrugated hose, a 3-segment chain from the respirator down over the shoulder into the kiln. */
function drawHose(ctx, rig) {
  // the early return used to sit HERE, above the segment loop, so a ~30x40 diagonal punched a hole in the Limeburner's
  // own hit flash and the chain stopped lagging on flash frames (§3 / §11: the flash draws the WHOLE silhouette).
  const p = rig.p, ch = getChain(rig, 'hose', 3, { joint: 'torso', rest: [0, 1], stiffness: 0.15, damping: 0.66, gain: 1.6, rotGain: 0.5, maxAng: 34 });
  const t = tones(rig, CH.rubber), flash = !!rig.override;
  // 6px segments routed DOWN THE SIDE of the shoulder (angle 26 -> 12) instead of a fat diagonal across the chest, so
  // the limedust coat keeps the shoulder mass and the darks stay at the extremities
  ctx.save(); ctx.translate(R(p.torsoW * 0.46), -p.torsoH + 3);
  for (let i = 0; i < ch.n; i++) {
    ctx.rotate(rad(ch.ang[i] + 12));
    band(ctx, rig, -3, 0, 6, 10, CH.rubber, 2);   // the halo used to be a hand-painted rect behind a bare fill
    if (!flash) {
      ctx.fillStyle = t.deep; ctx.fillRect(-3, 4, 6, 2); ctx.fillRect(-3, 8, 6, 2);
      ctx.fillStyle = t.hi; ctx.fillRect(-3, 0, 2, 4);
    }
    ctx.translate(0, 9);
  }
  ctx.restore();
}
/** Purser: the bandolier of eight glass drams — it EMPTIES as he spends them, so the silhouette reads his stock. */
function drawBandolier(ctx, rig) {
  const p = rig.p, H = p.torsoH, hw = R(p.torsoW / 2), left = rig.drams != null ? rig.drams : 8;
  celPoly(ctx, rig, [-hw - 2, -H + 3, -hw + 3, -H + 1, hw + 4, R(-H * 0.26), hw + 2, R(-H * 0.26) + 6], CH.leather, 0.4, 0.2);
  // the bottles are OUTLINED and stand proud of the coat edge, and they draw during the flash: filled black the Purser
  // used to be a torso with two bars and a cap tab, and the emptying row was a colour read only (§11 silhouette test).
  // band(), not celRect: eight 3x5 bottles cost eight CLIPS through celRect and put idle#0 at 29 against a bound of
  // 28, and a clipped tone band on a 3x5 mark buys nothing anyway (§0.7).
  for (let i = 0; i < 8; i++) {
    if (i >= left) continue;
    const u = i / 7;
    band(ctx, rig, R(-hw + 2 + u * (hw * 2 + 5)), R(-H + 2 + u * (H * 0.6)), 3, 5, DRAM, 1);
  }
  if (rig.override) return;
  ctx.fillStyle = tones(rig, CH.leather).deep; ctx.fillRect(R(-hw + 2), R(-H + 4), R(hw * 1.6), 1);
}
/** Purser: the bull's-eye lantern on the hip — the lowest lamp in the faction, so his cone starts at his own boots. */
function drawBullseye(ctx, rig) {
  const hw = R(rig.p.hip / 2);
  drawLamp(ctx, rig, hw + 6, 3, 1);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CH.leather); ctx.fillRect(hw - 1, -2, 6, 3);
}
/** Resurrection Man: the two-wheel handcart on a hip yoke, tarpaulin lump strapped down, lamp swinging from the shaft. */
function drawCart(ctx, rig) {
  const p = rig.p, x = -R(p.torsoW / 2) - 30, y = -4;
  // harness-leather planks with CART kept for the ironwork, the wheel and the hub. As one 34x16 near-black box (plus a
  // near-black wheel that its own outline could not bound) it dragged the faction's elite grabber to Sootborn value.
  celRect(ctx, rig, x, y - 12, 34, 16, 2, CH.leather, 0.4, 0.22);
  celPoly(ctx, rig, [x + 3, y - 12, x + 10, y - 21, x + 24, y - 22, x + 31, y - 12], TARP, 0.4, 0.25);
  celBall(ctx, rig, x + 8, y + 8, 8, CART, false);
  celRect(ctx, rig, x + 30, y - 8, 16, 4, 2, CH.leather, 0.4, 0.2);
  const ch = getChain(rig, 'lamp', 2, { joint: 'torso', rest: [0, 1], stiffness: 0.18, damping: 0.62, gain: 1.5, rotGain: 0.4, maxAng: 30 });
  // the lamp hangs on the cart's front board at torso y -16 (waist height). At -28 it was ABOVE the shoulder line and
  // level with his head, which stole the Wickboy's unique high light — the faction reads as four low lights and one high.
  ctx.save(); ctx.translate(x + 4, y - 12);
  ctx.rotate(rad(ch.ang[0])); if (!rig.override) { ctx.fillStyle = rig.col(CART); ctx.fillRect(-1, -4, 2, 4); }
  ctx.rotate(rad(ch.ang[1]));
  drawLamp(ctx, rig, 0, 0, 1.1);
  ctx.restore();
  if (rig.override) return;
  // his rung of the company ladder — a 14 px strap, not a 26 px stripe: at full cart width a flat saturated bar on
  // the biggest rig in the faction out-shouted the lime lamp, which is the one thing on a Chandler that must win
  band(ctx, rig, x + 9, y - 20, 14, 4, CLAN.resurrectionist, 1);
  band(ctx, rig, x + 5, y + 5, 6, 6, CH.pewter, 1);                // the wheel hub
  ctx.fillStyle = tones(rig, CH.leather).deep; ctx.fillRect(x + 2, y - 5, 30, 2); // the plank seam
}
/** Runner: a dirty-canvas taper bag on the back hip with two spare splints standing out of it (hip space). */
function drawSatchel(ctx, rig) {
  const hw = R(rig.p.hip / 2);
  // TARP canvas, not leather: the bag sits on a leather belt block and the rank band below needs pale ground (the clan
  // slate is L* 43.7 - 31 under the canvas, 4 under the leather it would otherwise have been painted on)
  celRect(ctx, rig, -hw - 13, -3, 12, 11, 2, TARP, 0.4, 0.25);
  // the splints are outlined and stand proud of the bag, so they survive the hit flash as silhouette (§11)
  band(ctx, rig, -hw - 11, -10, 3, 8, WOOD, 1); band(ctx, rig, -hw - 6, -11, 3, 9, WOOD, 1);
  if (rig.override) return;
  band(ctx, rig, -hw - 11, -1, 4, 4, CLAN.runner, 1);   // the Runner's rung: the smallest on the ladder, as the cheapest hand's should be
  ctx.fillStyle = tones(rig, TARP).deep; ctx.fillRect(-hw - 12, 3, 10, 2);   // the flap's fold
}
/**
 * Drayman: the ash yoke across the shoulders — a pushing harness, the one beam in the faction wider than the man under
 * it — with a pewter shaft-hook at each end and the lamp swinging from the rear hook (torso space, front layer).
 */
function drawYoke(ctx, rig) {
  // the beam sits ON the shoulder line (top edge 1 px above the coat), not across the chest: at -H + 1 it covered the
  // top half of the tally-tag, and the tag's wax seal is the rank carrier every Chandler must keep visible
  const p = rig.p, hw = R(p.torsoW / 2), y = -p.torsoH - 1;
  // bleached ash (WOOD), so the beam clears the coat (L* 70.9 vs 81.7) and the quicklime sleeves it crosses by hue
  celRect(ctx, rig, -hw - 12, y, p.torsoW + 24, 5, 2, WOOD, 0.4, 0.25);
  celRect(ctx, rig, -hw - 14, y + 3, 4, 7, 1, CH.pewter, 0.4, 0.2);
  celRect(ctx, rig, hw + 10, y + 3, 4, 7, 1, CH.pewter, 0.4, 0.2);
  // the lamp hangs from the REAR hook at chest height: one of the faction's low lights (the Wickboy's stays the high one)
  const ch = getChain(rig, 'lamp', 2, { joint: 'torso', rest: [0, 1], stiffness: 0.18, damping: 0.64, gain: 1.4, rotGain: 0.4, maxAng: 26 });
  ctx.save(); ctx.translate(-hw - 12, y + 7);
  ctx.rotate(rad(ch.ang[0])); if (!rig.override) { ctx.fillStyle = rig.col(CH.pewter); ctx.fillRect(-1, 0, 2, 4); }
  ctx.translate(0, 4); ctx.rotate(rad(ch.ang[1]));
  drawLamp(ctx, rig, 0, 5, 1.1);
  ctx.restore();
  if (rig.override) return;
  // his rung: the padded centre of the beam where it bears on the neck, 8x5 of claret, inked (cloth on ash)
  band(ctx, rig, -4, y, 8, 5, CLAN.drayman, 1);
}

export { drawPole, drawStave, drawCane, drawTongs, drawTaper, drawCartHook, drawBucket, drawCrook, drawLedger, drawKiln, drawHose, drawBandolier, drawBullseye, drawCart, drawSatchel, drawYoke };
