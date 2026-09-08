// The Chandlery of Calderwick — a ship's chandler supplies an army; a tallow chandler makes its light. Under charter
// to whoever holds the ledger, and Vane signed them in the first week. They walk behind the fighting with handcarts of
// grease and quicklime, patching up whatever is still standing and invoicing the estate: they are the reason the
// Brassbound are still wound and the Sootborn still standing. Five variants (rig + shared hooks in ./chandlerRig.js):
//   WICKBOY  fodder   pole poke / low wick singe / RELIGHT — heals 4 every 20f AND cancels a stagger (steals your punish)
//   TALLYMAN ranged   chalk-stave rap / reflectable plumb-weight lob / TALLY — marks a hero, the whole board re-targets
//   LIMEBURNER bruiser shovel slam / low quicklime scoop / SLAKE — hands an ally an Iron Warden's 4-hit LIMECRUST
//   PURSER   elite    cane into a behind-hitting backhand flick / DRAM — doses 2 allies (+35% dmg, +25% speed, -40% cd)
//   RESURRECTIONIST grabber tong hook (drags you in) / grab / RECREW — tips whatever army is already on this board out of his cart
// FACTION RULE: the rite dies with the ritualist, HOWEVER it died — every rite's onTick checks the source first, so a
// Chandler rung out over a railing (items.js ringOut sets dead without calling die(), so onDeath never fires) still pops
// every crust, dose and mend on the field in the same frame. ONE TOUCH BREAKS A RITE (BASE_HOOKS.onHitTaken). THE
// COMPANY DOES NOT INSURE ITS OWN (every rite filters faction !== 'chandler'). NO RITE TARGET, TAKE IT YOURSELF.
import { P, FK, frontBox, areaBox, makeEnemyDef } from './common.js';
import {
  CH, CH_PAL, CH_PROPS, CH_PARTS, CLAN, BASE_HOOKS, makeChandlerBase, drawLamp, drawRiteRim, riteSourceGone, isClient, riteFlash,
} from './chandlerRig.js';
import { celRect, celBall, celPoly, tones, band } from '../../art/shading.js';
import { farShade } from '../../art/palettes.js';
import { getChain } from '../../art/secondary.js';
import { pathPoly, paint } from '../../art/shapes.js';
import { rad, clamp } from '../../engine/math.js';
import { particles } from '../../engine/particles.js';
import { audio } from '../../engine/audio.js';
import { ST } from '../../constants.js';

const R = Math.round;
const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, ...(extra || {}) });
const LOW = { low: true }, BEHIND = { behind: true };
// WOOD is a BLEACHED ash, 11 Oklab L* over the tallow coat and 40 over harness leather. #B79A6A sat at L* 70.1
// against a coat that is now L* 70.9, so the stave and the crook would have vanished into the shoulder they are
// carried across; #D3C2A0 also drops it from s42 to s24, back under the neutral ceiling where a tool belongs.
// TARP is dirty canvas, 19 pts under quicklime, so the cart's cargo does not read as more apron.
// KILN / CART are ACCENT hexes — the ironwork, the chimney collar, the grate frame, the hub — not the drum and box
// bodies, which are pewter and leather (§4: this faction is pale, the darks live at the extremities). KILN moves to
// a COLD iron so it no longer sits within 0.4 L* of the (newly lifted) rubber it is bolted to, and CART lifts from
// L* 29.8 to 33.8 so the cart ironwork clears the #20180F outline by more than 9 L* like every other base tone.
const WOOD = '#D9C08E', TARP = '#B0AE96', KILN = '#394249', DRAM = '#2E4A38', CART = '#3E362C';
/** The far-side value of the Tallyman's ledger board and its bound spine: accessories get no `info`, so both are
 * precomputed (a module constant painted at full strength on a far part is exactly what far-palette-leak catches). */
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
function drawShovel(ctx, rig) {
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

// ================================================================ the four rites (all content-side statuses)
/** mended (Wickboy): 6 ticks x 4 HP with the bar visibly running backwards. */
const MENDED = {
  frames: 120, every: 20, heal: 4, tint: CH.lime, tintAlpha: 0.12, rim: CH.lime, draw: drawRiteRim,
  onTick(a, s) {
    if (riteSourceGone(a, s)) return;
    if (s.age % (s.every || 20)) return;
    a.hp = Math.min(a.maxHp, a.hp + (s.heal || 4)); a.hpBarTimer = 90;
    particles.burst('spark', a.x, a.y + a.h * 0.6, a.z, 2, { speed: 1.2, up: 1.6, color: CH.lime });
  },
};
/** limecrust (Limeburner): an Iron Warden's shield handed to somebody who never had one; the FOURTH hit breaks it. */
const LIMECRUST = {
  frames: 300, hits: 4, tint: CH.quicklime, tintAlpha: 0.2, rim: CH.quicklime, draw: drawRiteRim,
  onTick(a, s) {
    if (riteSourceGone(a, s)) return;
    // hitCount is incremented at fighter.js:443, BEFORE the armour branch, so armoured hits count the crust down
    if (s.hits0 != null && a.hitCount - s.hits0 >= (s.hits || 4)) {
      a.clearStatus('limecrust');
      if (a.enterStagger) a.enterStagger(30);
    }
  },
  onEnd(a, s) {
    if (s.hits0 == null) return;
    a.traits.superArmor = !!s.prevArmor; a.traits.noLaunch = !!s.prevNoLaunch; a.unlaunchable = !!s.prevUnlaunch; a.armor = !!s.prevArmor;
    particles.burst('debris', a.x, a.y + a.h * 0.5, a.z, 5, { speed: 2.2, up: 2, color: CH.quicklime });
    audio.play('prop_break');
  },
};
/** normalizeTraits builds a FRESH per-instance traits object, so nothing here leaks into the shared def. */
function crust(a, f) {
  if (a.hasStatus('limecrust')) return;
  const s = a.applyStatus('limecrust', LIMECRUST, f);
  s.prevArmor = a.traits.superArmor; s.prevNoLaunch = a.traits.noLaunch; s.prevUnlaunch = a.unlaunchable; s.hits0 = a.hitCount;
  a.traits.superArmor = true; a.traits.noLaunch = true; a.unlaunchable = true; a.armor = true;
}
/** dosed (Purser): +35% damage, +25% walk/run, cooldowns cut 40%. DELIBERATELY not tellScale and not attackSpeed —
 *  every wind-up on the board still runs at its authored length, so he raises pressure without re-tuning the wave. */
const DOSED = {
  frames: 240, tint: CH.lime, tintAlpha: 0.14, rim: CH.hot, draw: drawRiteRim,
  onTick(a, s) {
    if (riteSourceGone(a, s)) return;
    if (s.age % 6 === 0) particles.burst('ember', a.x + (s.age % 5 - 2) * 3, a.y + a.h * 0.75, a.z, 1, { speed: 1, up: 1.4, color: CH.lime });
  },
  onEnd(a, s) {
    if (s.pd == null) return;
    a.damageMult = s.pd; a.walkSpeed = s.pw; a.runSpeed = s.pr;
    if (s.pcd && a.ai) a.ai.attackCooldown = s.pcd;
  },
};
function dose(a, f) {
  if (a.hasStatus('dosed')) return false;
  const s = a.applyStatus('dosed', DOSED, f);
  s.pd = a.damageMult; s.pw = a.walkSpeed; s.pr = a.runSpeed; s.pcd = a.ai ? a.ai.attackCooldown : null;
  a.damageMult *= 1.35; a.walkSpeed *= 1.25; a.runSpeed *= 1.25;
  // a NEW array, never an in-place mutation: normalizeAi spreads def.ai but keeps arrays by reference
  if (s.pcd) a.ai.attackCooldown = [Math.round(s.pcd[0] * 0.6), Math.round(s.pcd[1] * 0.6)];
  return true;
}
/** The chalk numeral a tallied hero wears (status.draw, screen space). */
function drawNumeral(ctx, f, sx, sy, s) {
  drawRiteRim(ctx, f, sx, sy, s);
  const x = R(sx) + 8, y = R(sy - f.h) - 10;
  ctx.save(); ctx.fillStyle = CH.quicklime;
  for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 3, y, 2, 8);
  ctx.fillRect(x - 2, y + 3, 13, 2);
  ctx.restore();
}
/** tallied (Tallyman): every enemy on the board re-points at the marked hero every 60 frames while he lives. */
const TALLIED = {
  frames: 300, tint: CH.lime, tintAlpha: 0.1, draw: drawNumeral,
  onTick(p, s, world) {
    if (riteSourceGone(p, s)) return;
    if (s.age % 60 || !world) return;
    const src = s.source;
    for (const e of world.enemies) { if (e === src || e.dead) continue; if (Math.abs(e.x - src.x) < 220) { e.target = p; e.retargetTimer = 120; } }
  },
};

// ================================================================ recipient finders (the company does not insure its own)
function findMend(f, world) {
  let best = null, bv = 0.85;
  for (const e of world.enemies) {
    if (!isClient(e, f) || Math.abs(e.x - f.x) > 140 || Math.abs(e.z - f.z) > 60) continue;
    const v = (e.staggerTimer > 0 || e.hasStatus('stunned')) ? -1 : e.hp / Math.max(1, e.maxHp);
    if (v < bv) { bv = v; best = e; }
  }
  return best || f;
}
function mendWork(f, world) {
  if (f.hp < f.maxHp * 0.85) return true;
  for (const e of world.enemies) {
    if (!isClient(e, f) || Math.abs(e.x - f.x) > 140 || Math.abs(e.z - f.z) > 60) continue;
    if (e.hp < e.maxHp * 0.85 || e.staggerTimer > 0 || e.hasStatus('stunned')) return true;
  }
  return false;
}
/** Never crust a fighter that already has ai.shield: the two armour systems fight each other. */
function findCrust(f, world) {
  let best = null, bv = -1;
  for (const e of world.enemies) {
    if (!isClient(e, f) || Math.abs(e.x - f.x) > 150 || e.hasStatus('limecrust') || (e.ai && e.ai.shield)) continue;
    if (e.maxHp > bv) { bv = e.maxHp; best = e; }
  }
  return best || f;
}
function findDose(f, world, skip) {
  for (const e of world.enemies) if (e !== skip && isClient(e, f) && Math.abs(e.x - f.x) < 170 && !e.hasStatus('dosed')) return e;
  return skip ? null : f;
}
/** The dram doses TWO allies, so it needs two cone/tether slots — the same scan the dose loop uses (chandlerRig BASE_HOOKS). */
function findDose2(f, world, first) { return findDose(f, world, first); }

// ================================================================ shared def assembly
const BASE = {
  type: 'chandler', faction: 'chandler', walkSpeed: 1.6,
  build: {
    scale: 1, palette: CH_PAL, outline: CH.outline, outlineWidth: 1, proportions: CH_PROPS, parts: CH_PARTS,
    smearColor: CH.limedust, contactShadow: true, thinR: 4.5, clan: CLAN.wickboy,
  },
  // no new CANONICAL_SFX: the respirator-muffled voice is the lowpassed 'hydraulic' wheeze, the death is the lamp glass
  sfx: { hurt: 'hydraulic', death: 'prop_break' },
  ai: { attackRange: 44, zTolerance: 12, attackCooldown: [40, 90], firstAttackDelay: 45, tokenGroup: 'chandler', tellWarnFrames: 12 },
};
/** makeEnemyDef copies neither traits nor hooks, so attach them here; every variant hook calls BASE_HOOKS first. */
function def(v, hooks) {
  const d = makeEnemyDef(BASE, v);
  d.traits = { ...(v.traits || {}) };
  d.hooks = { ...BASE_HOOKS, ...(hooks || {}) };
  if (v.grabOffset) d.grabOffset = v.grabOffset;
  return d;
}
const mkBuild = (o) => ({ ...BASE.build, ...o });

// ================================================================ C1 WICKBOY: the one that steals your punish
const WICK_CARRY = { armR: [32, 26], weapon: -78, armL: [-34, -20] };
// capCol was '#6A5A44' against CH.hair '#6B5A44' — a 0.3 % separation between two directly adjacent parts, so the
// crown and the hair merged into one brown lump and he lost his only headgear cue. '#4A3E30' is ~29 % under the hair.
const WICK_CHAND = { face: 'bare', cap: 'flat', capCol: '#4A3E30', rites: ['relight'], lampJoint: 'weaponTip', lampDX: -2, lampDY: 2, selfConeDX: 24, find: findMend, cool: (f) => f.rangedCooldown };
const POKE_BOX = frontBox(50, hit(6, 'light', 4, 0, 16, { id: 'poke' }));
const SINGE_BOX = frontBox(44, hit(5, 'knockdown', 3, 4, 20, { id: 'singe' }), LOW);
const wickboyAnims = Object.assign(makeChandlerBase(WICK_CARRY, { stoop: 12, head: 1, weaponFloor: -18, gait: 'scamper' }), {
  // poke: 16f pole drawn back (light bobbing at his shoulder) -> smear thrust -> hold -> 20f punishable recovery
  poke: { loop: false, frames: [
    // ANTICIPATION, not the idle carry: the old tell keys moved the pole from -58 to -40 canvas degrees, i.e. TOWARD
    // the player, so 16 frames of telegraph on the introduction-wave fodder unit said nothing (§8 / §11).
    FK(10, { armR: [-40, 96], weapon: -120, armL: [40, 8], torso: -6, head: -6, root: [-6, 0], legR: [4, 10], legL: [-20, 16], face: 'angry' }, { tell: true, sfx: 'whiff', ease: 'in' }),
    FK(6, { armR: [-58, 118], weapon: -142, armL: [46, 6], torso: -12, head: -8, root: [-9, 1], legR: [2, 12], legL: [-24, 18], face: 'angry', squash: 0.97, stretch: 1.03 }, { tell: true, ease: 'out' }),
    FK(6, { armR: [86, -6], weapon: 18, armL: [-36, 18], torso: 30, head: 4, root: [5, 1], legR: [40, 8], legL: [-30, 28], face: 'shout', squash: 1.04, stretch: 0.96 },
      { hitbox: POKE_BOX, move: { x: 3 }, smear: { from: -125, to: -2, a: 0.34, r: 54 }, fx: [{ kind: 'slash', x: 46, y: 40, radius: 16, angle: 0, sweep: 40 }], sfx: 'whiff', ease: 'overshoot' }),
    FK(3, { armR: [90, -4], weapon: 22, armL: [-38, 18], torso: 32, head: 4, root: [6, 1], legR: [40, 8], legL: [-30, 28], face: 'shout' }, { ease: 'out' }),
    FK(20, { armR: [72, 8], weapon: -12, armL: [-30, 14], torso: 22, head: 0, root: [4, 2], legR: [34, 8], legL: [-26, 24], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...WICK_CARRY, torso: 12, head: 1, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
  // singe: the burning wick swept along the deck at your ankles (jump it) — 18f tell, low box, 22f recovery
  singe: { loop: false, frames: [
    FK(11, { armR: [-52, -26], weapon: -34, armL: [30, 14], torso: -6, head: -8, root: [-3, 0], legR: [8, 8], legL: [-14, 12], face: 'angry' }, { tell: true, sfx: 'fire', ease: 'in' }),
    FK(7, { armR: [-70, -34], weapon: -56, armL: [38, 16], torso: -12, head: -10, root: [-5, 0], legR: [6, 8], legL: [-16, 14], face: 'angry', squash: 0.96, stretch: 1.04 }, { tell: true, ease: 'out' }),
    FK(8, { armR: [30, 26], weapon: 35, armL: [-34, 16], torso: 34, head: 8, root: [5, 3], legR: [44, 26], legL: [-32, 34], face: 'shout', squash: 1.06, stretch: 0.95 },
      { hitbox: SINGE_BOX, smear: { from: 160, to: 30, a: 0.38, r: 56 }, fx: [{ kind: 'ring', x: 40, y: 0, r0: 4, r1: 30, flat: true, color: CH.lime }], sfx: 'burn', ease: 'overshoot' }),
    FK(3, { armR: [34, 28], weapon: 38, armL: [-36, 16], torso: 36, head: 8, root: [6, 3], legR: [44, 26], legL: [-32, 34], face: 'shout' }, { ease: 'out' }),
    FK(22, { armR: [50, 20], weapon: -6, armL: [-28, 12], torso: 24, head: 2, root: [4, 2], legR: [36, 16], legL: [-28, 28], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...WICK_CARRY, torso: 12, head: 1, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
  // RELIGHT: 26f of pole-up, bellows wheeze, floor cone on a hurt ally — and NO HITBOX at any point. 62 frames of invitation.
  relight: { loop: false, frames: [
    FK(16, { armR: [110, 26], weapon: -34, armL: [-40, -10], torso: 2, head: -10, root: [-2, 0], legR: [10, 8], legL: [-16, 10], face: 'angry' }, { tell: true, sfx: 'steam', ease: 'in' }),
    FK(10, { armR: [136, 12], weapon: -18, armL: [-48, -6], torso: -4, head: -14, root: [-3, -1], legR: [8, 8], legL: [-18, 12], face: 'shout', squash: 0.97, stretch: 1.04 },
      { tell: true, smear: { from: -55, to: -88, a: 0.3, r: 70 }, ease: 'out' }),
    FK(6, { armR: [142, 8], weapon: -14, armL: [-52, -4], torso: -6, head: -16, root: [-3, -1], legR: [8, 8], legL: [-18, 12], face: 'shout' },
      { event: 'relight', sfx: 'steam', fx: [{ kind: 'steam', x: 20, y: 62, count: 3 }], ease: 'out' }),
    FK(30, { armR: [96, 18], weapon: -46, armL: [-36, -12], torso: 14, head: -4, root: [1, 1], legR: [12, 8], legL: [-14, 10], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...WICK_CARRY, torso: 12, head: 1, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
});
const wickboy = def({
  variant: 'wickboy', name: 'WICKBOY', role: 'fodder', hp: 40, damage: 1, speed: 1.25, score: 150, drops: 'none',
  build: mkBuild({ scale: 0.88, clan: CLAN.wickboy, chand: WICK_CHAND, weapon: { attach: 'handR', length: 56, draw: drawPole, headAt: 48 }, accessories: [{ attach: 'hip', draw: drawBucket }] }),
  anims: wickboyAnims,
  traits: { weight: 0.75 },
  ai: {
    attackRange: 44, zTolerance: 12, flank: true, attackCooldown: [34, 72], firstAttackDelay: 40, retreatChance: 0.4,
    tokenGroup: 'chandler', maxAttackers: 2, panicRange: 34, panicFrames: 26, fleeHp: 8, fleeDistance: 110, tellWarnFrames: 12,
    attacks: [{ anim: 'poke', range: 50, weight: 3 }, { anim: 'singe', range: 44, weight: 2 }],
    // `keep` must sit BELOW attackRange or thinkRanged parks him at that distance for the whole fight, outside every
    // hero's reach (the Gutter Wrangler bug documented in sootborn.js). At 20 the melee fallback always takes over
    // first, so he closes and pokes while the relight keeps its own 150-frame cooldown.
    ranged: { anim: 'relight', minRange: 0, maxRange: 300, cooldown: 150, keep: 20, zAlign: false },
  },
}, {
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    // never cast into an empty room: with nothing hurt and nothing staggered nearby the lamp stays dark
    if (f.rangedCooldown <= 0 && !mendWork(f, world)) { f.rangedCooldown = 20; f.rig.lamp = 0; }
  },
  onAnimEvent(f, name, frame, world) {
    if (name !== 'relight') return false;
    const a = findMend(f, world);
    riteFlash(f, world);
    a.applyStatus('mended', MENDED, f);
    // THE CRIME: the relight cancels a stagger. It does NOT restore a stripped shield (permanent) or clear a net.
    // THE CRIME IS THE STAGGER CANCEL, NOT A COMBO BREAKER: clearing hurtTimer unconditionally let a Wickboy 140px
    // away pull an ally out of ordinary hitstun mid-combo, which is a strictly larger effect than the tell promises.
    if (a.staggerTimer > 0 || a.hasStatus('stunned') || a.punishable) a.hurtTimer = 0;
    a.staggerTimer = 0; a.clearStatus('stunned');
    a.punishable = false; a.punishMult = 1; a.punishGrab = false;
    if (a.aiState === 'STAGGER' && a.endStagger) a.endStagger();
    return true;
  },
});

// ================================================================ C2 TALLYMAN: the one that points at you
const TAL_CARRY = { armR: [30, 28], weapon: 1, armL: [18, 44] };
// capCol per variant: the three caps that used to be limedust are now four different DARK near-neutrals (all under
// the 40 % ceiling), so the head separates from a torso that is the same garment, and five men in one coat still
// read as five men. The chroma stays on the company ladder (build.clan), never on the hat.
const TAL_CHAND = { cap: 'flat', capCol: '#46505E', shade: true, rites: ['tally'], lampJoint: 'shoulderN', lampDX: 5, lampDY: -15, selfConeDX: 26, cool: (f) => f.tallyCd, find: (f) => f.target || null };
const RAP_BOX = frontBox(42, hit(9, 'medium', 5, 0, 16, { id: 'rap' }));
/** The plumb-weight lands where you WERE 18 frames ago; friendly, so you can bait it onto a Limeburner, and reflectable
 *  for 16 — onReflect flattens the lob so a batted weight actually travels back down the lane. */
const CHALKWEIGHT = {
  style: 'stone', kind: 'lob', aimAt: true, flight: 34, gravity: 0.5, bounces: 0, rest: false, offsetX: 10, offsetY: 48, r: 6, muzzle: false,
  color: CH.quicklime, damage: 9, type: 'knockdown', kbX: 3, kbY: 4, hitstun: 20, friendly: true,
  reflectable: true, damageOnReflect: 16, reflectSpeed: 7,
  onReflect(p) { p.vy = 0; p.gravity = 0; p.startX = p.x; p.maxDist = 300; },
  draw(ctx, p, sx, sy) {
    ctx.save(); ctx.translate(sx, sy - p.r); ctx.rotate(p.spin * 1.5);
    pathPoly(ctx, [-4, -6, 4, -6, 5, 2, 0, 7, -5, 2]); paint(ctx, p.reflected ? CH.lime : CH.quicklime, CH.outline, 1);
    ctx.fillStyle = CH.leather; ctx.fillRect(-2, -7, 4, 3); ctx.restore();
  },
};
// The three used to be ONE animation with three durations: all three cocked the stave overhead to the same canvas
// angle, all three threw it through the same arc, and rap #2 / weight #2 / tally #2 shared a copy-pasted lower body.
// Now each has its own shape AND its own stance (§10 'parametric/canned'): rap is an elbow crack from a narrow stance,
// weight is an off-hand lob loaded onto the back foot, tally is the only overhead travel and the only held finish.
const tallymanAnims = Object.assign(makeChandlerBase(TAL_CARRY, { stoop: 13, head: 4, weaponFloor: -20 }), {
  // rap: a sideways knuckle-crack — the stave never leaves waist height, the ELBOW does all the work, feet planted
  rap: { loop: false, frames: [
    FK(8, { armR: [26, 76], weapon: 10, armL: [22, 42], torso: 6, head: -2, root: [-2, 0], legR: [16, 6], legL: [-14, 10], face: 'angry' }, { tell: true, sfx: 'whiff', ease: 'in' }),
    FK(6, { armR: [22, 100], weapon: 20, armL: [26, 44], torso: 2, head: -4, root: [-3, 0], legR: [14, 6], legL: [-12, 10], face: 'angry', squash: 0.98, stretch: 1.02 }, { tell: true, ease: 'out' }),
    FK(6, { armR: [36, 2], weapon: -8, armL: [10, 40], torso: 16, head: 4, root: [3, 0], legR: [20, 6], legL: [-16, 12], face: 'shout', squash: 1.03, stretch: 0.97 },
      { hitbox: RAP_BOX, smear: { from: -16, to: 30, a: 0.3, r: 44 }, sfx: 'whiff', ease: 'overshoot' }),
    FK(3, { armR: [38, 0], weapon: -10, armL: [8, 40], torso: 18, head: 4, root: [4, 0], legR: [20, 6], legL: [-16, 12], face: 'shout' }, { ease: 'out' }),
    FK(18, { armR: [32, 16], weapon: -2, armL: [14, 42], torso: 14, head: 2, root: [2, 0], legR: [16, 6], legL: [-14, 10], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...TAL_CARRY, torso: 13, head: 4, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
  // weight: a LOB. The plumb-weight is in the off hand (armL) and does all the travel; the stave stays tucked under the
  // near arm and the weight loads onto the back foot. The aim event on the first tell frame samples 18f of history.
  weight: { loop: false, frames: [
    FK(13, { armR: [20, 50], weapon: 22, armL: [-86, -8], torso: -2, head: -6, root: [-6, 0], legR: [2, 10], legL: [-22, 22], face: 'angry' }, { tell: true, event: 'aim', sfx: 'sling', ease: 'in' }),
    FK(9, { armR: [24, 56], weapon: 26, armL: [-130, -22], torso: -12, head: -14, root: [-9, 1], legR: [0, 12], legL: [-28, 26], face: 'grit', squash: 0.97, stretch: 1.03 }, { tell: true, ease: 'out' }),
    FK(6, { armR: [18, 44], weapon: 16, armL: [66, -20], torso: 18, head: 6, root: [5, 1], legR: [28, 8], legL: [-20, 20], face: 'shout', squash: 1.04, stretch: 0.96 },
      { event: 'spawnProjectile', projectile: CHALKWEIGHT, smear: { from: 20, to: 52, a: 0.28, r: 46 }, sfx: 'throw', ease: 'overshoot' }),
    FK(3, { armR: [18, 42], weapon: 14, armL: [78, -14], torso: 20, head: 6, root: [6, 1], legR: [28, 8], legL: [-20, 20], face: 'shout' }, { ease: 'out' }),
    FK(24, { armR: [22, 40], weapon: 10, armL: [48, 6], torso: 16, head: 2, root: [4, 1], legR: [22, 8], legL: [-18, 18], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...TAL_CARRY, torso: 13, head: 4, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
  // TALLY: the only overhead travel he has, no hitbox anywhere, and the only anim that HOLDS its finish — the stave
  // stays out at the end of the stroke, pointing at the hero he just marked, for the whole 34f recovery.
  tally: { loop: false, frames: [
    FK(20, { armR: [-40, -50], weapon: 59, armL: [40, 30], torso: -6, head: -12, root: [-3, 0], legR: [10, 8], legL: [-16, 10], face: 'angry' }, { tell: true, sfx: 'chime', ease: 'in' }),
    FK(14, { armR: [-120, -40], weapon: -41, armL: [50, 24], torso: -16, head: -18, root: [-5, -1], legR: [8, 8], legL: [-18, 12], face: 'shout', squash: 0.96, stretch: 1.05 },
      { tell: true, ease: 'out' }),
    FK(8, { armR: [56, 8], weapon: 49, armL: [-24, 30], torso: 30, head: 8, root: [5, 1], legR: [36, 10], legL: [-28, 26], face: 'shout', squash: 1.05, stretch: 0.96 },
      { event: 'tally', smear: { from: -140, to: 48, a: 0.42, r: 56 }, sfx: 'chime', fx: [{ kind: 'slash', x: 40, y: 50, radius: 24, angle: 0, sweep: 90 }], ease: 'overshoot' }),
    FK(34, { armR: [70, -12], weapon: 30, armL: [-30, 26], torso: 24, head: 10, root: [6, 1], legR: [34, 10], legL: [-26, 24], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...TAL_CARRY, torso: 13, head: 4, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
});
const tallyman = def({
  variant: 'tallyman', name: 'TALLYMAN', role: 'ranged', hp: 45, damage: 1, speed: 1.05, score: 250, drops: 'none',
  build: mkBuild({ clan: CLAN.tallyman, chand: TAL_CHAND, weapon: { attach: 'handR', length: 44, draw: drawStave, headAt: 34 },
    accessories: [{ attach: 'back', draw: drawCrook }, { attach: 'handL', draw: drawLedger }] }),
  anims: tallymanAnims,
  traits: { weight: 0.9 },
  ai: {
    targetBy: 'highestCombo', attackRange: 36, zTolerance: 12, attackCooldown: [40, 80], retreatChance: 0.2, retreatBudget: 140,
    evadeChance: 0.25, evadeCooldown: 120, tellWarnFrames: 14, tokenGroup: 'chandler',
    attacks: [{ anim: 'rap', range: 42, weight: 1 }],
    ranged: { anim: 'weight', minRange: 90, maxRange: 300, cooldown: 180, aimDelay: 18, zAlign: true, keep: 150 },
  },
}, {
  onSpawn(f) { BASE_HOOKS.onSpawn(f); f.tallies = 0; f.tallyCd = 240; },
  // THE TALLY IS DRIVEN FROM onUpdate, not the attack table: an `attacks` entry with a wide range would be intercepted
  // by KEEP_DISTANCE (thinkApproach hands off to thinkRanged whenever adx > attackRange + 10) and `maxUses` does not
  // exist on ai.ranged. setState from content is the established pattern; setting currentAttack keeps the tellFrames
  // stretch and the difficulty tellScale working.
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    if (f.tallyCd > 0) { f.tallyCd--; return; }
    if (f.tallies >= 2 || !f.actionable || f.inHitstun || !f.target || f.aiState === 'STAGGER' || f.riteBroken) return;
    f.face(f.target);
    f.currentAttack = { anim: 'tally', tellFrames: 34 };
    f.setState(ST.ATTACK, 'tally');
    f.tallyCd = 600; f.tallies++;
  },
  onAnimEvent(f, name, frame, world) {
    if (name !== 'tally') return false;
    const t = f.target;
    riteFlash(f, world);
    if (!t) return true;
    t.applyStatus('tallied', TALLIED, f);
    for (const e of world.enemies) { if (e === f || e.dead) continue; if (Math.abs(e.x - f.x) < 220) { e.target = t; e.retargetTimer = 120; e.attackCooldown = 0; } }
    return true;
  },
});

// ================================================================ C3 LIMEBURNER: the one that hands your target a shield
// weapon -46 -> -31: at -46 the shovel blade lay straight across the hip kiln in every rest pose, hiding the one
// thing that identifies him (§0.6: nothing crosses the load in a rest pose).
const LIM_CARRY = { armR: [24, 30], weapon: -31, armL: [-28, -12] };
const LIM_CHAND = { cap: 'flat', capCol: '#6A4F44', rites: ['slake'], lampJoint: 'torso', lampDX: 16, lampDY: 0, selfConeDX: 30, find: findCrust, cool: (f) => f.attackCooldown };
const SLAM_BOX = frontBox(58, hit(14, 'knockdown', 5, 5, 24, { id: 'slam' }));
const SCOOP_BOX = frontBox(50, hit(10, 'medium', 6, 0, 18, { id: 'scoop' }), LOW);
const SLAKE_BOX = areaBox(46, hit(6, 'medium', 8, 0, 16, { id: 'slake' }));
const limeburnerAnims = Object.assign(makeChandlerBase(LIM_CARRY, { stoop: 20, head: 4, weaponFloor: -30 }), {
  // slam: the shovel goes up over the shoulder and comes down on the floor line in front (26f tell, 30f recovery)
  slam: { loop: false, frames: [
    FK(16, { armR: [-64, -40], weapon: 30, armL: [24, 18], torso: 0, head: -8, root: [-3, 0], legR: [10, 6], legL: [-16, 12], face: 'angry' }, { tell: true, sfx: 'hammer_swing', ease: 'in' }),
    FK(10, { armR: [-118, -30], weapon: 15, armL: [30, 22], torso: -10, head: -14, root: [-5, -1], legR: [8, 6], legL: [-18, 14], face: 'angry', squash: 0.96, stretch: 1.05 }, { tell: true, ease: 'out' }),
    FK(10, { armR: [16, -8], weapon: -26, armL: [-30, 20], torso: 38, head: 10, root: [6, 3], legR: [44, 28], legL: [-32, 34], face: 'shout', squash: 1.08, stretch: 0.93 },
      { hitbox: SLAM_BOX, smear: { from: -160, to: 50, a: 0.42, r: 62 }, sfx: 'hammer_slam',
        fx: [{ kind: 'dust', x: 60, y: 0, count: 7 }, { kind: 'ring', x: 60, y: 0, r0: 4, r1: 34, flat: true, color: CH.quicklime }], ease: 'overshoot' }),
    FK(4, { armR: [18, -6], weapon: -24, armL: [-32, 20], torso: 40, head: 10, root: [6, 3], legR: [44, 28], legL: [-32, 34], face: 'grit' }, { ease: 'out' }),
    FK(30, { armR: [26, 6], weapon: -34, armL: [-26, 16], torso: 30, head: 6, root: [4, 3], legR: [38, 22], legL: [-28, 30], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...LIM_CARRY, torso: 20, head: 4, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
  // scoop: a low quicklime scoop along the deck — jump it, which is also how you get over the shovel
  scoop: { loop: false, frames: [
    FK(12, { armR: [-40, -20], weapon: -20, armL: [26, 20], torso: 10, head: 0, root: [-2, 3], legR: [24, 30], legL: [-14, 30], face: 'angry' }, { tell: true, sfx: 'whiff', ease: 'in' }),
    FK(8, { armR: [-56, -24], weapon: -14, armL: [32, 24], torso: 16, head: 2, root: [-4, 5], legR: [28, 38], legL: [-16, 38], face: 'angry', squash: 1.06, stretch: 0.95 }, { tell: true, ease: 'out' }),
    FK(8, { armR: [30, 10], weapon: 16, armL: [-28, 18], torso: 36, head: 8, root: [5, 5], legR: [40, 40], legL: [-30, 42], face: 'shout', squash: 1.04, stretch: 0.96 },
      { hitbox: SCOOP_BOX, smear: { from: 190, to: 20, a: 0.38, r: 58 }, fx: [{ kind: 'steam', x: 46, y: 6, count: 3 }], sfx: 'whiff', ease: 'overshoot' }),
    FK(3, { armR: [34, 12], weapon: 18, armL: [-30, 18], torso: 38, head: 8, root: [6, 5], legR: [40, 40], legL: [-30, 42], face: 'shout' }, { ease: 'out' }),
    FK(24, { armR: [44, 18], weapon: -4, armL: [-24, 14], torso: 28, head: 4, root: [4, 4], legR: [34, 32], legL: [-26, 34], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...LIM_CARRY, torso: 20, head: 4, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
  // SLAKE: the only armoured tell in the faction (and the only exception to "one touch breaks a rite"). Plant the
  // shovel, crack the kiln, 30f of hiss with frame armour worth 2 hits, then a 46px shove and the crust.
  slake: { loop: false, frames: [
    // A REAL WIND-UP. The old two tell keys moved armR 10 degrees and the torso 6 across the whole 30f armoured tell,
    // and the audit had the shovel head sitting at the SAME point on all three keys — a player standing next to him
    // could not tell 'venting' from 'standing there'. Now: plant the blade on the floor line in front (key 0), then
    // rear back over the hip drum so the kiln lid visibly opens (key 1). Same 18+12 budget, same armor, same box.
    FK(18, { armR: [-62, 74], weapon: -42, armL: [46, 26], torso: 26, head: 12, root: [-1, 2], legR: [24, 18], legL: [-14, 20], face: 'angry' }, { tell: true, armor: true, sfx: 'steam_vent', ease: 'in' }),
    FK(12, { armR: [-16, 92], weapon: -70, armL: [-42, 52], torso: -8, head: -16, root: [-6, 1], legR: [8, 12], legL: [-28, 22], face: 'grit', squash: 0.96, stretch: 1.05 },
      { tell: true, armor: true, fx: [{ kind: 'steam', x: 14, y: 20, count: 3 }], ease: 'out' }),
    FK(10, { armR: [-8, 40], weapon: -64, armL: [-6, 34], torso: 4, head: -6, root: [0, -1], legR: [20, 10], legL: [-22, 14], face: 'shout', squash: 0.95, stretch: 1.06 },
      { hitbox: SLAKE_BOX, event: 'slake', sfx: 'steam_vent', smear: { from: -52, to: 12, a: 0.32, r: 60 },
        fx: [{ kind: 'ring', x: 0, y: 26, r0: 6, r1: 62, color: CH.quicklime }, { kind: 'steam', x: 10, y: 30, count: 5 }], ease: 'overshoot' }),
    FK(34, { armR: [10, 44], weapon: -40, armL: [-18, 30], torso: 22, head: 4, root: [1, 2], legR: [16, 12], legL: [-18, 16], face: 'grit' },
      { punish: true, fx: [{ kind: 'steam', x: -6, y: 34, count: 2 }], ease: 'inout' }),
    FK(6, { ...LIM_CARRY, torso: 20, head: 4, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
});
const limeburner = def({
  variant: 'limeburner', name: 'LIMEBURNER', role: 'bruiser', hp: 90, damage: 1, speed: 0.8, score: 400, drops: 'none',
  build: mkBuild({ scale: 1.15, clan: CLAN.limeburner, chand: LIM_CHAND, weapon: { attach: 'handR', length: 44, draw: drawShovel, headAt: 32 },
    accessories: [{ attach: 'hip', draw: drawKiln }, { attach: 'torso', draw: drawHose }] }),
  anims: limeburnerAnims,
  // armorHits is what makes the slake's `armor: true` a two-hit frame armour rather than an infinite one
  traits: { flinchEvery: 2, weight: 1.4, armorHits: 2 },
  ai: {
    attackRange: 54, zTolerance: 15, attackCooldown: [50, 95], retreatChance: 0.15, tellWarnFrames: 12, tokenGroup: 'chandler',
    // the wide `range` on slake raises maxAttackRange and he has NO ai.ranged, so thinkApproach fires it from across
    // the arena while chooseAttack(adx) still picks the slam and the scoop up close (KEEP_DISTANCE never intercepts)
    attacks: [{ anim: 'slam', range: 58, weight: 3 }, { anim: 'scoop', range: 50, weight: 2 }, { anim: 'slake', range: 210, minRange: 0, weight: 2, tellFrames: 30 }],
  },
}, {
  onAnimEvent(f, name, frame, world) {
    if (name !== 'slake') return false;
    riteFlash(f, world);
    crust(findCrust(f, world), f);
    particles.burst('steam', f.x, 20, f.z, 6, { speed: 1.6, up: 1.8 });
    return true;
  },
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    if ((world.frame & 15) === 0) particles.burst('steam', f.x + f.facing * 12, R(f.h * 0.55), f.z, 1, { speed: 0.8, up: 1.4 });
  },
});

// ================================================================ C4 PURSER: the one that makes the crowd swing harder
const PUR_CARRY = { armR: [30, 24], weapon: -21, armL: [-40, -60] };
const PUR_CHAND = { cap: 'peaked', capCol: '#3E4A42', rites: ['dram'], lampJoint: 'torso', lampDX: 13, lampDY: 4, selfConeDX: 28, find: findDose, find2: findDose2, cool: (f) => f.attackCooldown };
const CANE_BOX = frontBox(50, hit(12, 'light', 4, 0, 16, { id: 'cane' }));
const FLICK_BOX = frontBox(46, hit(10, 'medium', 5, 0, 18, { id: 'flick' }), BEHIND);
const purserAnims = Object.assign(makeChandlerBase(PUR_CARRY, { stoop: 0, head: 0, weaponFloor: -26, gait: 'parade' }), {
  // cane: a fast fencer's thrust that CHAINS into the flick (ai entry chain: 'flick', run by onActionDone)
  cane: { loop: false, frames: [
    FK(8, { armR: [-24, 66], weapon: -66, armL: [-44, -56], torso: -8, head: -2, root: [-3, 0], legR: [12, 8], legL: [-12, 10], face: 'angry' }, { tell: true, sfx: 'rapier', ease: 'in' }),
    FK(6, { armR: [-34, 74], weapon: -79, armL: [-48, -54], torso: -14, head: -4, root: [-5, 0], legR: [10, 8], legL: [-14, 12], face: 'angry', squash: 0.97, stretch: 1.03 }, { tell: true, ease: 'out' }),
    FK(6, { armR: [92, -6], weapon: 18, armL: [-44, -10], torso: 22, head: 2, root: [6, 0], legR: [42, 8], legL: [-32, 30], face: 'shout', squash: 1.03, stretch: 0.97 },
      { hitbox: CANE_BOX, move: { x: 3 }, smear: { from: -20, to: 25, a: 0.4, r: 56 }, fx: [{ kind: 'slash', x: 46, y: 46, radius: 15, angle: 0, sweep: 34 }], sfx: 'rapier', ease: 'overshoot' }),
    FK(3, { armR: [96, -8], weapon: 20, armL: [-46, -10], torso: 24, head: 2, root: [7, 0], legR: [42, 8], legL: [-32, 30], face: 'shout' }, { ease: 'out' }),
    FK(18, { armR: [70, 10], weapon: -18, armL: [-38, -52], torso: 12, head: 0, root: [4, 1], legR: [30, 8], legL: [-24, 24], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...PUR_CARRY, torso: 0, head: 0, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
  // flick: a 10f backhand that hits BEHIND as well as in front — walking through him does not solve him
  flick: { loop: false, frames: [
    FK(6, { armR: [-76, -30], weapon: -20, armL: [-40, -14], torso: -6, head: -4, root: [-2, 0], legR: [10, 8], legL: [-10, 10], face: 'angry' }, { tell: true, ease: 'in' }),
    FK(4, { armR: [-92, -34], weapon: -14, armL: [-36, -12], torso: -10, head: -6, root: [-4, 0], legR: [8, 8], legL: [-12, 12], face: 'grit', squash: 0.97, stretch: 1.03 }, { tell: true, ease: 'out' }),
    FK(6, { armR: [126, -14], weapon: 26, armL: [-30, -8], torso: 18, head: 4, root: [4, 0], legR: [32, 10], legL: [-24, 22], face: 'shout', squash: 1.04, stretch: 0.96 },
      { hitbox: FLICK_BOX, smear: { from: -150, to: 40, a: 0.38, r: 50 }, fx: [{ kind: 'slash', x: -20, y: 46, radius: 20, angle: 0, sweep: 120 }], sfx: 'rapier_arc', ease: 'overshoot' }),
    FK(3, { armR: [130, -12], weapon: 28, armL: [-32, -8], torso: 20, head: 4, root: [5, 0], legR: [32, 10], legL: [-24, 22], face: 'shout' }, { ease: 'out' }),
    FK(22, { armR: [104, 0], weapon: 0, armL: [-46, -18], torso: 10, head: 0, root: [3, 1], legR: [28, 8], legL: [-22, 20], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...PUR_CARRY, torso: 0, head: 0, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
  // DRAM: thumb a cork, the hip lantern flares, two cones land at once. 32f tell, no hitbox, 32f punishable recovery.
  // A REAL RAISE (the spec's `style: 'raise'`). The three old tell/active keys moved the cane 4 canvas degrees and the
  // dram hand not at all across 40 frames — the elite whose whole counterplay is "one touch during the tell breaks the
  // rite" gave the player nothing to see, and the floor cone did 100 % of the work. Same 19/13/8 budget, no hitbox.
  dram: { loop: false, frames: [
    // the cane drops to a low guard while the off hand goes ACROSS to the bandolier
    FK(19, { armR: [16, 24], weapon: 0, armL: [52, 44], torso: -8, head: -4, root: [-3, 0], legR: [10, 8], legL: [-14, 12], face: 'angry' }, { tell: true, sfx: 'bomb_bat', ease: 'in' }),
    // the dram snaps up CLEAR OF THE PEAKED CAP (far hand at y -73 against a skull centre of -66) and the back
    // straightens under it — the one silhouette in the faction with a hand above the head
    FK(13, { armR: [34, 30], weapon: -4, armL: [142, -14], torso: 4, head: -12, root: [-1, -1], legR: [8, 6], legL: [-10, 8], face: 'shout', squash: 0.94, stretch: 1.07 }, { tell: true, ease: 'out' }),
    FK(8, { armR: [38, 26], weapon: -6, armL: [152, -20], torso: 6, head: -14, root: [-1, -1], legR: [8, 6], legL: [-10, 8], face: 'shout' },
      { event: 'dram', sfx: 'chime', fx: [{ kind: 'ring', x: 8, y: 24, r0: 4, r1: 40, color: CH.lime }], ease: 'out' }),
    // the off arm is CARRIED down through the recovery instead of teleporting 120 degrees to parade rest in one frame
    FK(32, { armR: [30, 26], weapon: -14, armL: [0, -46], torso: 2, head: -2, root: [1, 1], legR: [12, 8], legL: [-12, 10], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...PUR_CARRY, torso: 0, head: 0, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
});
const purser = def({
  variant: 'purser', name: 'PURSER', role: 'elite', hp: 95, damage: 1, speed: 1.15, score: 600, drops: 'meter',
  build: mkBuild({ scale: 1.05, clan: CLAN.purser, chand: PUR_CHAND, weapon: { attach: 'handR', length: 42, draw: drawCane, headAt: 30 },
    accessories: [{ attach: 'torso', draw: drawBandolier }, { attach: 'hip', draw: drawBullseye }] }),
  anims: purserAnims,
  // no armour anywhere: the shield-and-strip lane belongs to the Iron Warden and this faction does not take it again
  traits: { flinchEvery: 2, weight: 1.2 },
  ai: {
    // role 'elite' supplies ignoresTokens: true, and enemy.js only enters HOVER when a fighter is REFUSED a token — so
    // hoverCircle was dead configuration and he walked into the line like fodder. He takes a token now and hovers when
    // the chandler pool (3) is full, which is the spacing the spec describes without a KEEP_DISTANCE park.
    attackRange: 46, zTolerance: 13, hoverCircle: true, ignoresTokens: false, tokenGroup: 'chandler', maxAttackers: 3,
    attackCooldown: [70, 110], evadeChance: 0.3, evadeCooldown: 110,
    retreatChance: 0.25, tellWarnFrames: 14, backstepAfterWhiffs: null, // the whiff backstep is somebody else's signature
    // NO standalone flick: a 10f tell on the game's only `behind: true` hitbox is inside human reaction time, and the
    // spec's own counterplay text ("the second half of a chain you can see starting") is only true of the chained one.
    attacks: [{ anim: 'cane', range: 50, weight: 3, chain: 'flick' }, { anim: 'dram', range: 240, minRange: 0, weight: 3, tellFrames: 32 }],
  },
}, {
  onSpawn(f) { BASE_HOOKS.onSpawn(f); f.drams = 8; f.rig.drams = 8; },
  onAnimEvent(f, name, frame, world) {
    if (name !== 'dram') return false;
    riteFlash(f, world);
    let live = 0;
    for (const e of world.enemies) if (e.hasStatus && e.hasStatus('dosed')) live++;
    let given = 0;
    for (const e of world.enemies) {
      if (given >= 2 || live + given >= 3) break;
      if (isClient(e, f) && Math.abs(e.x - f.x) < 170 && !e.hasStatus('dosed') && dose(e, f)) given++;
    }
    if (!given) dose(f, f);
    f.drams = Math.max(0, (f.drams || 8) - Math.max(1, given));
    f.rig.drams = f.drams;
    return true;
  },
});

// ================================================================ C5 RESURRECTION MAN: the one that refills the wave
const RES_CARRY = { armR: [10, 30], weapon: -17, armL: [6, 34], grip: 1 };
const RES_CHAND = { face: 'none', cap: 'none', rites: ['recrew'], lampJoint: 'torso', lampDX: -34, lampDY: -22, selfConeDX: -38, find: () => null, cool: (f) => f.attackCooldown };
const HOOK_BOX = frontBox(92, hit(10, 'medium', -6, 0, 20, { id: 'hook' }));
/** THE CREW HE TIPS OUT IS WHATEVER ARMY IS ALREADY ON THIS BOARD — one def, every board, no board-specific content. */
const CREW = { brassbound: 'footman', sootborn: 'cutthroat', stormcrow: 'crimper', gleaning: 'chaff', chandler: 'wickboy' };
const TALLY_MAP = new Map();
function recrew(f, world) {
  // the hard gate: a wave lock counts world.waveEnemies, so this can never soft-lock a room
  if (!world.spawnEnemy || world.waveEnemies.length >= 7) { f.attackCooldown = Math.max(f.attackCooldown, 120); return; }
  TALLY_MAP.clear();
  let type = 'chandler', best = 0;
  for (const e of world.enemies) {
    if (e.dead || !e.def || e.def.faction === 'chandler') continue;
    const n = (TALLY_MAP.get(e.def.type) || 0) + 1;
    TALLY_MAP.set(e.def.type, n);
    if (n > best) { best = n; type = e.def.type; }
  }
  const z = clamp(f.z + 8, world.floorBand.z0, world.floorBand.z1);
  world.spawnEnemy(type, CREW[type] || 'wickboy', f.x - f.facing * 26, z, { entered: true, facing: f.facing });
  if (world.camera) world.camera.shake(4, 8);
  audio.play('chime');
}
const resAnims = Object.assign(makeChandlerBase(RES_CARRY, { stoop: 18, head: 4, weaponFloor: -34, grab: true, gait: 'trudge' }), {
  // hook: a 92px tong-sweep with NEGATIVE knockback that DRAGS you in, chaining straight into the grab
  hook: { loop: false, frames: [
    FK(13, { armR: [-40, 60], weapon: -134, armL: [-30, 62], grip: 0, torso: -4, head: -8, root: [-3, 0], legR: [12, 8], legL: [-16, 12], face: 'angry' }, { tell: true, sfx: 'hydraulic', ease: 'in' }),
    FK(9, { armR: [-54, 70], weapon: -156, armL: [-44, 70], grip: 0, torso: -12, head: -12, root: [-5, 0], legR: [10, 8], legL: [-18, 14], face: 'angry', squash: 0.97, stretch: 1.04 }, { tell: true, ease: 'out' }),
    FK(10, { armR: [96, -8], weapon: 29, armL: [92, -6], grip: 1, torso: 26, head: 6, root: [5, 1], legR: [40, 10], legL: [-30, 30], face: 'shout', squash: 1.04, stretch: 0.96 },
      { hitbox: HOOK_BOX, move: { x: 2 }, smear: { from: -30, to: 30, a: 0.36, r: 74 }, fx: [{ kind: 'slash', x: 70, y: 44, radius: 22, angle: 0, sweep: 46 }], sfx: 'grapple', ease: 'overshoot' }),
    FK(4, { armR: [100, -6], weapon: 34, armL: [96, -4], grip: 1, torso: 28, head: 6, root: [6, 1], legR: [40, 10], legL: [-30, 30], face: 'shout' }, { ease: 'out' }),
    FK(26, { armR: [76, 12], weapon: 8, armL: [72, 14], grip: 1, torso: 20, head: 2, root: [4, 1], legR: [32, 10], legL: [-24, 26], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...RES_CARRY, torso: 18, head: 4, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
  // RECREW: 40f of tell (the yoke goes down, the tarp goes back, the hand-bell rings), no hitbox, 40f free punish
  // THE FACTION'S MOST IMPORTANT TELEGRAPH. It used to sweep the 44px two-handed tongs UP ACROSS THE COWL — the shaft
  // and the jaws covered the head, the cart lamp was occluded and torso -22 / head -22 folded the whole thing into one
  // brown lump — and it keyed the same 'tongs up in front, jaws open, reared back' shape as grabTell two rows above,
  // so a 40f summon and a 20f grab (rush him vs back off) read identically. Now he turns and works the CART: torso
  // forward over the yoke, both arms low and BEHIND him, the jaws pointed down-back at the tarp where the cone lands,
  // and the head, the shoulders and the cart lamp all clear of the tool (§0 / §0.6).
  recrew: { loop: false, frames: [
    FK(24, { armR: [-4, 34], weapon: 16, armL: [2, 30], grip: 0, torso: -6, head: 4, root: [-2, 1], legR: [14, 10], legL: [-16, 14], face: 'angry' }, { tell: true, sfx: 'chime', ease: 'in' }),
    FK(16, { armR: [-16, 30], weapon: 28, armL: [-10, 26], grip: 0, torso: -12, head: 8, root: [-5, 1], legR: [18, 12], legL: [-14, 16], face: 'shout', squash: 1.05, stretch: 0.96 },
      { tell: true, fx: [{ kind: 'dust', x: -30, y: 0, count: 4 }], ease: 'out' }),
    // jaws at (-43, 2): down and BEHIND, on the tarp where the cone lands, 65 px below the skull
    FK(10, { armR: [-22, 28], weapon: 34, armL: [-16, 24], grip: 0, torso: -16, head: 10, root: [-6, 1], legR: [20, 12], legL: [-12, 16], face: 'shout' },
      { event: 'recrew', sfx: 'chime', fx: [{ kind: 'ring', x: -34, y: 10, r0: 6, r1: 44, flat: true, color: CH.lime }, { kind: 'dust', x: -34, y: 0, count: 6 }], ease: 'out' }),
    FK(40, { armR: [6, 32], weapon: 8, armL: [10, 28], grip: 0, torso: 4, head: 2, root: [-1, 1], legR: [14, 8], legL: [-16, 12], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(8, { ...RES_CARRY, torso: 18, head: 4, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
});
const resurrectionist = def({
  variant: 'resurrectionist', name: 'RESURRECTION MAN', role: 'grabber', hp: 165, damage: 1, speed: 0.65, score: 1000, drops: 'food_small',
  elite: true, grabbable: false, grabbableByGrappler: true, lyingFrames: 55, grabOffset: 26,
  build: mkBuild({ scale: 1.35, clan: CLAN.resurrectionist, chand: RES_CHAND,
    weapon: { attach: 'handR', length: 44, draw: drawTongs, twoHanded: true, grip: -13, headAt: 32 },
    accessories: [{ attach: 'back', draw: drawCart }] }),
  anims: resAnims,
  traits: { flinchEvery: 3, weight: 1.7 },
  moves: { grabHit: { damage: 6, hits: 4 }, throwFwd: { damage: 18, vx: 7, vy: 4 }, throwBack: { damage: 20, vx: 6, vy: 5 } },
  ai: {
    attackRange: 46, zTolerance: 15, attackCooldown: [60, 120], grabHoldHits: 4, grabHitEvery: 18, flank: false, tellWarnFrames: 14,
    attacks: [{ anim: 'grab', tell: 'grabTell', range: 46, weight: 3 }, { anim: 'hook', range: 92, minRange: 50, weight: 2, chain: 'grab' },
      { anim: 'recrew', range: 300, minRange: 70, weight: 2, maxUses: 3, tellFrames: 40 }],
  },
}, {
  onAnimEvent(f, name, frame, world) {
    if (name !== 'recrew') return false;
    riteFlash(f, world);
    recrew(f, world);
    return true;
  },
  // ai.launchStun is gated on `this.armor` in enemy.js takeHit and he has none, so the flag would silently never fire:
  // this is the Cinder Hulk's documented workaround, run after the shared rite-break hook.
  onHitTaken(f, h, attacker, world) {
    BASE_HOOKS.onHitTaken(f, h, attacker, world);
    if (h.type === 'launch' && !f.airborne && !f.dead && f.state !== ST.KNOCKDOWN && f.state !== ST.LYING) {
      audio.play('stagger');
      return { ...h, type: 'heavy', stagger: true, hitstun: 15, breaksArmor: true };
    }
    return undefined;
  },
});

/** The Chandlery, in wave order: two Wickboys and a Tallyman teach the tell; the rest are what they are for. */
export const CHANDLERS = [wickboy, tallyman, limeburner, purser, resurrectionist];
export { P };
