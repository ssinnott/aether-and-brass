// Enemy Type B: The Sootborn (GDD section 4). Cel-shaded goblin rig (parts in common.js: gobHead / gobFace / gobTorso / gobHips /
// gobFoot / gobHand) + 5 variants: Soot Cutthroat (knife, rust bandana), Scrap Slinger (olive skin, mustard cap, sling), Firebrand
// (singed skin, fuel tank + nozzle, welding goggles), Cinder Hulk (x1.6, wrist chains, anvil club, grabs), Gutter Wrangler (x0.9,
// oxblood waistcoat, top hat, monocle, 6-segment whip, net). Every state is hand-keyed (docs/ART_STYLE.md section 8): idle breathes,
// walk / run / flee are 8 / 8 / 6-key cycles with weight, attacks go anticipation -> smear hit -> hold -> follow-through -> settle,
// hurt / knockdown / lying / getup / dead (flop with X-eyes) and the panic / stagger loops all have their own keys.
// Type traits: fire x1.5, at most 2 attack at once (tokenGroup), last-enemy flee (ai.fleeLast). Numbers from the GDD 4 table.
import { P, frontBox, FK, GOB, GOB_PAL, GOB_PROPS, GOB_PARTS, gobCuffArm, gobRimTop, makeEnemyDef } from './common.js';
import { celRect, celBall, celPoly, tones, band } from '../../art/shading.js';
import { getChain } from '../../art/secondary.js';
import { jointScreen } from '../../art/rig.js';
import { pathPoly, paint } from '../../art/shapes.js';
import { rad } from '../../engine/math.js';
import { particles } from '../../engine/particles.js';
import { audio } from '../../engine/audio.js';
import { FLOOR_TOP, ST } from '../../constants.js';

const R = Math.round, TAU = Math.PI * 2;
/** Every goblin pose leans forward (GDD: hunched 15 deg). */
const HUNCH = 14;
const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, ...(extra || {}) });
const CLAN = { cutthroat: '#9A4A22', slinger: '#D9A62B', firebrand: '#F08A24', hulk: '#B8692E', wrangler: '#7A1E2A' };
// LEATHER and WOOD are the ONLY warm browns on a green faction, and this pass had desaturated both (Oklab C 4.63 ->
// 2.87 and 5.84 -> 3.20) at unchanged lightness, which merged their tone ramps into one another and into GOB.ragsDark:
// it dropped sootborn:slinger's surviving colour count at 0.5x from 81 to 77, under the render tier's floor of 78,
// and the slinger paints LEATHER on both of its accessories (drawSling, drawSatchel). The chroma is restored --
// which is the direction the saturation brief wants anyway -- and the lightness was never the problem.
const LEATHER = '#4A3020', WOOD = '#5A3A22', ANVIL = '#5A5E6A', COPPER = '#8C4A2A', HAT = '#35313A', NETC = '#C8B070', HOT = '#FFD27A';
const FLAME_COLS = ['#FF5A1F', '#FFB347', '#FFE070'];

// ---------------------------------------------------------------- weapons (hand space: +x along the forearm) and accessories
function drawKnife(ctx, rig) {
  celRect(ctx, rig, -5, -2, 9, 4, 1, LEATHER, 0.4, 0);
  celPoly(ctx, rig, [4, -3, 17, -2, 21, 0, 17, 2, 4, 3], GOB.scrap, 0.4, 0.3);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, GOB.scrap).deep; ctx.fillRect(5, 1, 12, 1);
}
/** Rust bandana: band above the brows + a knotted tail that lags on a 2-segment chain (head accessory). */
function drawBandana(ctx, rig) {
  const r = rig.p.headR, clan = rig.build.clan, y = R(-r * 0.95);
  celRect(ctx, rig, -r - 1, y - 3, r * 2 + 2, 5, 1, clan, 0.4, 0);
  const ch = getChain(rig, 'tail', 2, { joint: 'head', rest: [-1, 0.4], stiffness: 0.16, damping: 0.66, gain: 2, rotGain: 0.5, maxAng: 35 });
  ctx.save(); ctx.translate(-r - 1, y - 1);
  for (let i = 0; i < 2; i++) { ctx.rotate(rad(ch.ang[i])); celPoly(ctx, rig, [0, -2, -9, -4 - i, -10, 1, -1, 3], clan, 0.4, 0); ctx.translate(-9, 0); }
  ctx.restore();
}
/** Mustard flat cap with a forward peak, above the hairline (head accessory). */
function drawCap(ctx, rig) {
  const r = rig.p.headR, clan = rig.build.clan;
  celPoly(ctx, rig, [-r - 2, R(-r * 0.9), r + 7, R(-r * 0.9), r + 5, R(-r * 1.05), R(r * 0.4), R(-r * 1.32), R(-r * 0.5), R(-r * 1.3), -r - 3, R(-r * 1.05)], clan, 0.36, 0.3);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, clan).deep; ctx.fillRect(R(r * 0.3), R(-r * 0.9) - 2, R(r * 0.8), 2);
}
/** Welding goggles pushed up over the brow line: leather strap + two dark green lenses in brass rims (head accessory). */
function drawGoggles(ctx, rig) {
  const r = rig.p.headR, cy = R(-r * 1.05);
  if (!rig.override) { ctx.fillStyle = rig.col(LEATHER); ctx.fillRect(R(-r) + 1, cy - 1, R(r * 2) - 2, 3); }
  for (let i = 0; i < 2; i++) {
    const cx = i ? R(r * 0.5) : R(-r * 0.2);
    celBall(ctx, rig, cx, cy, 4.5, GOB.brass, false);
    ctx.beginPath(); ctx.arc(cx, cy, 2.8, 0, TAU); ctx.fillStyle = rig.col('#2F4A3A'); ctx.fill();
    if (!rig.override) { ctx.fillStyle = rig.col('#DDE6EE'); ctx.fillRect(cx - 2, cy - 2, 2, 1); }
  }
}
/** Copper fuel tank on the back with a clan-orange band and a rubber hose running down to the hip (back accessory, torso space). */
function drawTank(ctx, rig) {
  const p = rig.p, x0 = -R(p.torsoW / 2) - 10, y0 = -p.torsoH - 2, w = 11, h = p.torsoH + 4;
  if (!rig.override) { ctx.strokeStyle = rig.col('#2A2A30'); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0 + 5, y0 + h - 3); ctx.quadraticCurveTo(x0 - 2, y0 + h + 10, R(p.torsoW * 0.5), 4); ctx.stroke(); }
  celRect(ctx, rig, x0, y0, w, h, 4, COPPER, 0.4, 0.3);
  celBall(ctx, rig, x0 + w / 2, y0 + 1, 4, COPPER, false);
  if (rig.override) return;
  const tc = tones(rig, rig.build.clan);
  ctx.fillStyle = tc.base; ctx.fillRect(x0 + 1, y0 + 8, w - 2, 4); ctx.fillStyle = tc.sh; ctx.fillRect(x0 + 1, y0 + 11, w - 2, 1);
  ctx.fillStyle = rig.col('#241a1c'); ctx.fillRect(x0 + 3, y0 + h - 10, 5, 5); ctx.fillStyle = rig.col(GOB.warn); ctx.fillRect(x0 + 4, y0 + h - 9, 3, 3);
}
/** Brass nozzle on an iron tube with a hose stub; the pilot light grows with pose.grip (the flame tell) and flickers (hand space). */
function drawNozzle(ctx, rig, pose) {
  if (!rig.override) { ctx.strokeStyle = rig.col('#2A2A30'); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(-14, 2, -16, 12); ctx.stroke(); }
  celRect(ctx, rig, -6, -3, 20, 6, 2, GOB.iron, 0.4, 0.3);
  celPoly(ctx, rig, [12, -4, 21, -6, 23, 0, 21, 6, 12, 4], GOB.brass, 0.36, 0.3);
  if (rig.override) return;
  const k = pose.grip || 0, s = 3 + k * 7 + ((rig.tick & 2) ? 1 : 0);
  ctx.fillStyle = rig.col(FLAME_COLS[0]); ctx.beginPath(); ctx.moveTo(22, -s * 0.5); ctx.lineTo(23 + s * 1.7, 0); ctx.lineTo(22, s * 0.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rig.col(HOT); ctx.beginPath(); ctx.moveTo(22, -s * 0.25); ctx.lineTo(23 + s * 0.9, 0); ctx.lineTo(22, s * 0.25); ctx.closePath(); ctx.fill();
}
/** Anvil-headed club: leather-wrapped haft, iron anvil block with a horn (hand space). */
function drawAnvilClub(ctx, rig) {
  celRect(ctx, rig, -10, -3, 38, 6, 2, WOOD, 0.4, 0.2);
  if (!rig.override) { ctx.fillStyle = rig.col(LEATHER); ctx.fillRect(-8, -3, 12, 6); }
  celPoly(ctx, rig, [22, -9, 34, -12, 52, -11, 61, -5, 54, 4, 36, 8, 22, 6], ANVIL, 0.36, 0.28);
  if (rig.override) return;
  gobRimTop(ctx, rig, 25, -10, 51, -11, ANVIL);
  ctx.fillStyle = tones(rig, ANVIL).deep; ctx.fillRect(26, 2, 22, 3);
}
/** Copper slave collar with two dark studs (torso accessory). */
function drawCollar(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2);
  celRect(ctx, rig, -hw - 3, -p.torsoH - 3, p.torsoW + 6, 7, 3, rig.build.clan, 0.4, 0.25);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, rig.build.clan).deep; ctx.fillRect(-hw + 2, -p.torsoH - 1, 3, 3); ctx.fillRect(hw - 5, -p.torsoH - 1, 3, 3);
}
/** Sling: cord + pouch with a scrap stone; spins with pose.weapon.rot during the 3-loop wind-up (hand space). */
function drawSling(ctx, rig) {
  if (!rig.override) { ctx.strokeStyle = rig.col(LEATHER); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(16, -1); ctx.moveTo(0, 1); ctx.lineTo(16, 2); ctx.stroke(); }
  celBall(ctx, rig, 19, 0, 4.5, LEATHER, false);
  celBall(ctx, rig, 19, -1, 2.5, GOB.scrap, false);
}
/** Stone satchel on the back hip (hip accessory). */
function drawSatchel(ctx, rig) {
  const hw = R(rig.p.hip / 2);
  celRect(ctx, rig, -hw - 8, -7, 10, 11, 3, LEATHER, 0.4, 0.2);
  celBall(ctx, rig, -hw - 5, -8, 2.5, GOB.scrap, false); celBall(ctx, rig, -hw - 1, -9, 2.5, GOB.scrap, false);
}
/** Stolen top hat above the hairline with a clan band (head accessory). */
function drawTopHat(ctx, rig) {
  const r = rig.p.headR, y = R(-r * 1.02);
  celRect(ctx, rig, -r - 4, y - 2, r * 2 + 8, 4, 1, HAT, 0.4, 0);
  celRect(ctx, rig, -r + 1, y - 17, r * 2 - 2, 16, 1, HAT, 0.36, 0.3);
  if (rig.override) return;
  band(ctx, rig, -r + 1, y - 8, r * 2 - 2, 4, rig.build.clan);
  gobRimTop(ctx, rig, -r + 3, y - 17, r - 3, y - 17, '#4A4652');
}
/** Brass monocle over the near eye with a short chain (head accessory, after the face). */
function drawMonocle(ctx, rig) {
  if (rig.override) return;
  const r = rig.p.headR, cx = R(r * 0.25) + 2, cy = R(-r * 0.45) + 2;
  ctx.strokeStyle = rig.col(GOB.brass); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + 3, cy + 4); ctx.lineTo(cx + 5, cy + 9); ctx.stroke();
}
/** Whip: leather handle; the lash is 6 chained segments hanging at rest, straightened forward while pose.grip > 0.5 (the crack). */
function drawWhip(ctx, rig, pose) {
  celRect(ctx, rig, -4, -2.5, 12, 5, 1, LEATHER, 0.4, 0);
  if (rig.override) return;
  ctx.fillStyle = rig.col(GOB.brass); ctx.fillRect(-4, -2, 3, 4);
  ctx.strokeStyle = rig.col('#3A2A1A'); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if ((pose.grip || 0) > 0.5) {
    ctx.beginPath(); ctx.moveTo(8, 0);
    for (let i = 1; i <= 6; i++) ctx.lineTo(8 + i * 7.5, Math.sin(i * 1.5 + rig.tick * 0.9) * (1 + i * 0.4));
    ctx.stroke(); ctx.fillStyle = rig.col(GOB.wrap); ctx.fillRect(51, -2, 3, 3);
    return;
  }
  const ch = getChain(rig, 'whip', 6, { joint: 'torso', rest: [0, 1], stiffness: 0.16, damping: 0.68, gain: 1.8, rotGain: 0.4, maxAng: 40 });
  ctx.save(); ctx.translate(6, 0); ctx.rotate(rad(rig.joints.armN.hand - 90 - pose.weapon.rot));
  ctx.beginPath(); ctx.moveTo(0, 0);
  for (let i = 0; i < 6; i++) { ctx.rotate(rad(ch.ang[i] + (i ? 0 : 20))); ctx.lineTo(0, 7); ctx.translate(0, 7); }
  ctx.stroke(); ctx.restore();
}
/** Net in the off hand: a bundle at rest, an open spinning disc while the hand spins (handL.rot 60..990), gone once thrown (handL accessory). */
function drawNet(ctx, rig, pose) {
  const rot = pose.handL.rot;
  if (rot >= 990) return;
  if (rot <= 60) { celRect(ctx, rig, 2, -3, 8, 11, 3, NETC, 0.4, 0); if (!rig.override) { ctx.fillStyle = tones(rig, NETC).deep; ctx.fillRect(4, -1, 1, 7); ctx.fillRect(7, -2, 1, 8); } return; }
  ctx.save(); ctx.translate(14, 0);
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.strokeStyle = rig.col(rig.outline); ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = rig.col(NETC); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let k = -2; k <= 2; k++) { ctx.moveTo(k * 5, -13); ctx.lineTo(k * 5, 13); ctx.moveTo(-13, k * 5); ctx.lineTo(13, k * 5); }
  ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.stroke();
  ctx.restore();
}
/** Scrap bolt projectile: a spinning hex nut (pale once reflected). */
function drawBolt(ctx, p, sx, sy) {
  ctx.save(); ctx.translate(sx, sy - p.r); ctx.rotate(p.spin * 2);
  pathPoly(ctx, [-5, -3, 0, -6, 5, -3, 5, 3, 0, 6, -5, 3]); paint(ctx, p.reflected ? '#E8D8A0' : '#9A9A90', GOB.outline, 1);
  ctx.fillStyle = '#4A4A50'; ctx.fillRect(-2, -2, 3, 3); ctx.restore();
}

// ---------------------------------------------------------------- shared animation set
/** Body on the floor (root rot -88): on its back, head behind, weapon along the ground, X-eyes. */
const FLOOR = { armR: [-20, -6], weapon: -10, armL: [30, 20], torso: 2, head: -12, legR: [12, 10], legL: [-4, 8], root: [24, -8, -88], grip: 0, weaponBack: 0, face: 'dazed' };
/**
 * Base goblin animation set for a rest carry `c` ({ armR, armL, weapon, weaponBack? }): idle 4 / walk 8 / run 8 / flee 6 / panic 4 /
 * jump / fall / land / hurt 3 / stagger 2 / hurtAir / knockdown / lying 2 / getup 3 / dead 2 (flop) / dodge 5 (back-hop, used by the
 * Wrangler's whiff backstep) and, with o.grab, the Cinder Hulk grab set (grabTell / grab / grabHold / grabHit / throw).
 */
function gobAnims(c, o = {}) {
  const K = (s) => ({ torso: HUNCH, head: -7, legR: [8, 4], legL: [-8, 6], ...c, ...s });
  const aR = c.armR, aL = c.armL, A = (a, du, dl) => [a[0] + du, a[1] + dl];
  const walk = (lr, ll, al, ty, sq, fr, fl, hd) => K({ legR: lr, legL: ll, armL: al, armR: A(aR, 3, -3), torso: HUNCH + 3, head: -7 + (hd || 0), root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, footR: fr || 0, footL: fl || 0 });
  const run = (lr, ll, al, ty, sq) => K({ legR: lr, legL: ll, armL: al, armR: A(aR, -16, -8), torso: HUNCH + 18, head: -14, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, face: 'angry' });
  const flee = (lr, ll, i, ty) => K({ legR: lr, legL: ll, armR: [-150 + i * 10, -20 - i * 6], armL: [-172 - i * 8, -26], weapon: 0, torso: 4, head: -12 + i * 5, root: [0, ty], face: 'hurt' });
  const anims = {
    idle: { loop: true, frames: [
      FK(14, K({ root: [0, 0] }), { ease: 'inout' }),
      FK(12, K({ torso: HUNCH + 3, head: -4, root: [0, 1], armL: A(aL, 3, 2), armR: A(aR, 2, -2), squash: 1.02, stretch: 0.98 }), { ease: 'inout' }),
      FK(14, K({ torso: HUNCH + 1, head: [-9, -1, 0], root: [0, 0], armR: A(aR, 1, -1) }), { ease: 'inout' }),
      FK(12, K({ torso: HUNCH - 1, head: [-5, 1, 0], root: [0, 0], armL: A(aL, -3, -2), armR: A(aR, -1, 1) }), { ease: 'inout' }),
    ] },
    // scuttling walk: contact / down (+2, squash) / pass / up (-1) x2, free arm swinging biased back, head bobbing
    walk: { loop: true, frames: [
      FK(4, walk([30, 4], [-24, 16], [10, -6], 0, 0, -8, 0, 0), { ease: 'out' }),
      FK(4, walk([22, 12], [-14, 28], [4, -8], 2, 1.04, 0, 0, 2), { ease: 'out' }),
      FK(4, walk([6, 24], [2, 10], [-10, -10], 1, 0, 0, 0, 1), { ease: 'inout' }),
      FK(4, walk([-10, 12], [18, -2], [-26, -12], -1, 0, 0, -6, -2), { ease: 'in' }),
      FK(4, walk([-24, 16], [30, 4], [-40, -14], 0, 0, 0, -8, 0), { ease: 'out' }),
      FK(4, walk([-14, 28], [22, 12], [-34, -14], 2, 1.04, 0, 0, 2), { ease: 'out' }),
      FK(4, walk([2, 10], [6, 24], [-20, -12], 1, 0, 0, 0, 1), { ease: 'inout' }),
      FK(4, walk([18, -2], [-10, 12], [-4, -8], -1, 0, -6, 0, -2), { ease: 'in' }),
    ] },
    run: { loop: true, frames: [
      FK(3, run([54, 14], [-42, 58], [44, -50], -2), { ease: 'out' }),
      FK(3, run([42, 30], [-30, 72], [24, -46], 1, 1.05), { ease: 'out' }),
      FK(3, run([10, 42], [10, 30], [-10, -40], -4), { ease: 'inout' }),
      FK(3, run([-24, 52], [40, 8], [-44, -40], -3), { ease: 'in' }),
      FK(3, run([-42, 58], [54, 14], [-56, -44], -2), { ease: 'out' }),
      FK(3, run([-30, 72], [42, 30], [-40, -46], 1, 1.05), { ease: 'out' }),
      FK(3, run([10, 30], [10, 42], [0, -46], -4), { ease: 'inout' }),
      FK(3, run([40, 8], [-24, 52], [30, -50], -3), { ease: 'in' }),
    ] },
    // fleeing: upright, arms in the air, screaming
    flee: { loop: true, frames: [
      FK(3, flee([50, 12], [-40, 56], 0, -2), { ease: 'out' }), FK(3, flee([30, 40], [-20, 60], 1, 1), { ease: 'out' }), FK(3, flee([-10, 44], [24, 20], 2, -3), { ease: 'in' }),
      FK(3, flee([-40, 56], [50, 12], 1, -2), { ease: 'out' }), FK(3, flee([-20, 60], [30, 40], 0, 1), { ease: 'out' }), FK(3, flee([24, 20], [-10, 44], 2, -3), { ease: 'in' }),
    ] },
    // panic (Slinger with a player in its face): hopping in place, arms flailing
    panic: { loop: true, frames: [
      FK(4, K({ armR: [-140, -30], armL: [-160, -30], weapon: 0, torso: 0, head: -16, root: [-2, 0], legR: [20, 10], legL: [-20, 14], face: 'hurt' }), { ease: 'out' }),
      FK(4, K({ armR: [-170, -20], armL: [-130, -40], weapon: 0, torso: -4, head: -20, root: [2, -6], legR: [30, -30], legL: [20, -20], face: 'hurt', squash: 0.94, stretch: 1.06 }), { ease: 'out' }),
      FK(4, K({ armR: [-150, -40], armL: [-150, -20], weapon: 0, torso: 4, head: -12, root: [0, 2], legR: [24, 20], legL: [-24, 24], face: 'hurt', squash: 1.08, stretch: 0.92 }), { ease: 'out' }),
      FK(4, K({ armR: [-130, -30], armL: [-170, -30], weapon: 0, torso: -2, head: -18, root: [-2, -4], legR: [10, -20], legL: [34, -30], face: 'hurt', squash: 0.96, stretch: 1.04 }), { ease: 'out' }),
    ] },
    jump: { loop: false, frames: [
      FK(3, K({ legR: [30, 40], legL: [-20, 44], torso: HUNCH + 10, root: [0, 4], squash: 1.1, stretch: 0.9, armL: [-30, 30] }), { ease: 'out' }),
      FK(4, K({ legR: [30, -30], legL: [10, -20], torso: HUNCH - 10, root: [0, -2], squash: 0.94, stretch: 1.08, armL: [-70, -30], head: -10 }), { ease: 'out' }),
      FK(30, K({ legR: [40, -70], legL: [20, -50], torso: HUNCH - 6, armL: [-50, -20], head: -8 }), { ease: 'inout' }),
    ] },
    fall: { loop: true, frames: [
      FK(10, K({ legR: [24, -30], legL: [8, -20], armL: [-80, -30], torso: HUNCH - 14, head: -12, face: 'grit' }), { ease: 'inout' }),
      FK(10, K({ legR: [30, -40], legL: [4, -14], armL: [-95, -30], torso: HUNCH - 18, head: -14, face: 'grit' }), { ease: 'inout' }),
    ] },
    land: { loop: false, frames: [
      FK(3, K({ legR: [34, 46], legL: [-24, 48], torso: HUNCH + 12, head: 2, root: [0, 3], squash: 1.16, stretch: 0.86, armL: [-30, 30], face: 'grit' }), { ease: 'out' }),
      FK(5, K({ legR: [14, 16], legL: [-10, 18], torso: HUNCH + 2, root: [0, 1], squash: 1.02, stretch: 0.98 }), { ease: 'out' }),
    ] },
    hurt: { loop: false, frames: [
      FK(4, K({ torso: -10, head: -24, armL: [-64, -30], armR: A(aR, -24, -30), weapon: (c.weapon || 0) - 16, root: [-5, 1], legR: [22, 4], legL: [-14, 12], face: 'hurt' }), { ease: 'out' }),
      FK(10, K({ torso: 4, head: -14, armL: [-30, -10], armR: A(aR, -8, -10), weapon: (c.weapon || 0) - 6, root: [-2, 1], legR: [14, 2], legL: [-10, 8], face: 'hurt' }), { ease: 'out' }),
      FK(6, K({ face: 'angry' }), { ease: 'out' }),
    ] },
    // stagger / stun (Hulk launch-stun, stunned status): wobbling on wide legs, arms out, seeing stars
    stagger: { loop: true, frames: [
      FK(6, K({ torso: 2, head: -14, root: [-3, 2], armR: [-40, -30], armL: [-50, -30], weapon: 20, legR: [22, 12], legL: [-22, 16], face: 'dazed' }), { ease: 'inout' }),
      FK(6, K({ torso: 20, head: 10, root: [3, 1], armR: [-20, -40], armL: [-70, -20], weapon: 30, legR: [18, 14], legL: [-26, 12], face: 'dazed' }), { ease: 'inout' }),
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
      FK(16, { ...FLOOR, torso: 7, head: -14, legR: [16, 12], face: 'hurt' }, { ease: 'inout' }),
    ] },
    getup: { loop: false, frames: [
      FK(8, { ...FLOOR, face: 'hurt' }, { ease: 'in' }),
      FK(8, { armR: [60, 40], weapon: 30, armL: [-30, 40], torso: 30, head: -10, legR: [70, 60], legL: [-20, 60], root: [8, 4, -20], face: 'grit', squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
      FK(6, K({ torso: HUNCH + 6, root: [0, 1], legR: [15, 20], legL: [-10, 15], face: 'angry' }), { ease: 'out' }),
    ] },
    // death: the body flops (legs kick up, then drop), tongue out, X-eyes
    dead: { loop: false, frames: [
      FK(7, { ...FLOOR, legR: [46, -30], legL: [34, -20], armR: [-40, -20], armL: [50, 10], torso: -4, root: [24, -12, -92], squash: 1.06, stretch: 0.94 }, { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }] }),
      FK(60, { ...FLOOR, torso: 8, head: -16, legR: [10, 2], legL: [-8, 6], armR: [-30, -10], armL: [40, 24], root: [24, -8, -92] }),
    ] },
    // back-hop dodge (Wrangler whiff backstep): crouch, hop back with the legs tucked, land with a squash
    dodge: { loop: false, frames: [
      FK(4, K({ torso: HUNCH + 12, root: [0, 3], legR: [36, 40], legL: [-20, 40], armL: [-30, 30], face: 'grit', squash: 1.08, stretch: 0.92 }), { sfx: 'dodge', ease: 'in' }),
      FK(6, K({ torso: 4, head: -12, root: [0, -18], legR: [40, -60], legL: [30, -50], armR: A(aR, -30, -20), armL: [-60, -40], face: 'closed', squash: 0.94, stretch: 1.06 }), { ease: 'out' }),
      FK(5, K({ torso: 8, head: -10, root: [0, -10], legR: [30, -30], legL: [20, -20], armR: A(aR, -16, -10), armL: [-40, -30], face: 'closed' }), { ease: 'in' }),
      FK(4, K({ torso: HUNCH + 10, root: [0, 3], legR: [30, 36], legL: [-18, 36], armL: [-20, 20], face: 'grit', squash: 1.1, stretch: 0.9 }), { ease: 'out' }),
      FK(4, K({ torso: HUNCH + 2, root: [0, 1] }), { ease: 'out' }),
    ] },
  };
  if (o.grab) {
    const G = { armR: [84, 30], armL: [84, 30], weapon: -60, weaponBack: 0 };
    Object.assign(anims, {
      grabTell: { loop: false, frames: [
        FK(10, K({ armR: [-70, -30], armL: [-80, -30], weapon: 0, weaponBack: 0, torso: 2, head: -14, root: [-2, 0], legR: [10, 8], legL: [-16, 10], face: 'shout' }), { tell: true, sfx: 'roar', ease: 'out' }),
        FK(10, K({ armR: [-96, -20], armL: [-100, -24], weapon: 0, weaponBack: 0, torso: -4, head: -16, root: [-4, -1], legR: [8, 8], legL: [-18, 12], face: 'shout', squash: 0.97, stretch: 1.04 }), { tell: true, ease: 'inout' }),
      ] },
      grab: { loop: false, frames: [
        FK(4, K({ ...G, armR: [90, 10], armL: [90, 10], torso: HUNCH + 12, root: [4, 0], legR: [34, 8], legL: [-26, 24], face: 'shout', squash: 1.04, stretch: 0.97 }), { hitbox: { x: 4, y: -84, w: 46, h: 80, z: 22, type: 'grab', once: true, damage: 0 }, move: { x: 2 }, sfx: 'whiff', ease: 'overshoot' }),
        FK(6, K({ ...G, torso: HUNCH + 8, root: [3, 0], legR: [30, 8], legL: [-24, 22], face: 'angry' }), { ease: 'out' }),
        FK(10, K({ ...G, armR: [60, 30], armL: [60, 30], torso: HUNCH + 4, root: [2, 1], face: 'angry' }), { punish: true, ease: 'inout' }),
      ] },
      grabHold: { loop: true, frames: [
        FK(14, K({ ...G, torso: HUNCH, root: [0, 0], legR: [22, 6], legL: [-20, 12], face: 'angry' }), { ease: 'inout' }),
        FK(14, K({ ...G, armR: [86, 34], armL: [86, 34], torso: HUNCH + 3, root: [0, 1], legR: [22, 6], legL: [-20, 12], face: 'angry' }), { ease: 'inout' }),
      ] },
      grabHit: { loop: false, frames: [
        FK(4, K({ ...G, armR: [70, 40], armL: [70, 40], torso: HUNCH - 8, head: -14, root: [-2, 0], legR: [20, 6], legL: [-20, 12], face: 'angry' }), { ease: 'in' }),
        FK(4, K({ ...G, armR: [96, 44], armL: [96, 44], torso: HUNCH + 14, head: 8, root: [4, 1], legR: [30, 10], legL: [-24, 18], face: 'shout', squash: 1.06, stretch: 0.95 }), { sfx: 'hit_medium', ease: 'overshoot' }),
        FK(6, K({ ...G, torso: HUNCH, root: [0, 0], legR: [22, 6], legL: [-20, 12], face: 'angry' }), { ease: 'out' }),
      ] },
      throw: { loop: false, frames: [
        FK(5, K({ ...G, armR: [60, 30], armL: [60, 30], torso: HUNCH - 20, head: -10, root: [-3, 0], legR: [16, 6], legL: [-20, 14], face: 'angry', squash: 1.04, stretch: 0.96 }), { ease: 'in' }),
        FK(6, K({ ...G, armR: [140, -10], armL: [140, -10], torso: HUNCH + 22, head: 6, root: [6, 0], legR: [36, 8], legL: [-30, 30], face: 'shout', squash: 0.96, stretch: 1.04 }), { sfx: 'throw', ease: 'overshoot' }),
        FK(10, K({ ...G, armR: [130, 0], armL: [130, 0], torso: HUNCH + 16, head: 4, root: [6, 1], legR: [32, 8], legL: [-28, 26], face: 'grit' }), { ease: 'inout' }),
        FK(6, K({ torso: HUNCH + 4 }), { ease: 'out' }),
      ] },
    });
  }
  return anims;
}

// ---------------------------------------------------------------- shared def assembly + hooks
const BASE = {
  type: 'sootborn', faction: 'sootborn', walkSpeed: 1.7,
  build: { scale: 0.85, palette: GOB_PAL, outline: GOB.outline, outlineWidth: 1, proportions: GOB_PROPS, parts: GOB_PARTS, smearColor: '#D8D0B8', clan: CLAN.cutthroat, gob: { tunic: 'rags' } },
  sfx: { hurt: 'soot_hurt', death: 'soot_death' },
  ai: { attackRange: 34, zTolerance: 12, retreatChance: 0.35, attackCooldown: [35, 80], aggression: 0.7, firstAttackDelay: 40, flank: true, fleeLast: true, tokenGroup: 'sootborn', maxAttackers: 2 },
};
/**
 * Fleeing goblins use the arms-up `flee` cycle; a panicking Slinger the `panic` hop (both while the core keeps its
 * run / stagger states).
 * @type {Hooks}
 */
const BASE_HOOKS = {
  onUpdate(f) {
    if (f.aiState === 'FLEE' && f.state === ST.RUN && f.anim.name === 'run') f.play('flee');
    else if (f.panicFlee && f.aiState === 'STAGGER' && f.anim.name === 'stagger') f.play('panic');
  },
};
function def(v, hooks) {
  const d = makeEnemyDef(BASE, v);
  d.traits = { fireDamageMult: 1.5, ...(v.traits || {}) };
  d.hooks = { ...BASE_HOOKS, ...(hooks || {}) };
  if (v.grabOffset) d.grabOffset = v.grabOffset;
  return d;
}

// ---------------------------------------------------------------- B1 Soot Cutthroat: knife, rust bandana, charges in packs, flees under 10 HP
const CUT_CARRY = { armR: [22, 42], weapon: 0, armL: [-34, -22] };
const cutthroatAnims = Object.assign(gobAnims(CUT_CARRY), {
  // stab: 12f pull-back tell (the "hee!" chirp) -> 6f lunge with the knife -> hold -> 18f recovery
  stab: { loop: false, frames: [
    FK(7, { armR: [-30, -50], weapon: 0, armL: [40, 20], torso: 2, head: -2, root: [-3, 0], legR: [4, 6], legL: [-14, 10], face: 'angry' }, { tell: true, sfx: 'soot_flee', ease: 'in' }),
    FK(5, { armR: [-46, -56], weapon: 0, armL: [50, 24], torso: -4, head: 0, root: [-5, 1], legR: [0, 6], legL: [-18, 12], face: 'angry', squash: 0.97, stretch: 1.03 }, { tell: true, ease: 'out' }),
    FK(6, { armR: [104, -14], weapon: 0, armL: [-40, 20], torso: 34, head: 2, root: [5, 2], legR: [42, 8], legL: [-30, 30], face: 'shout', squash: 1.04, stretch: 0.97 },
      { hitbox: frontBox(30, hit(5, 'light', 2, 0, 14)), move: { x: 3 }, smear: { from: -25, to: 15, a: 0.4, r: 44 }, fx: [{ kind: 'slash', x: 30, y: 30, radius: 16, angle: 0, sweep: 40 }], sfx: 'whiff', ease: 'overshoot' }),
    FK(3, { armR: [108, -12], weapon: 0, armL: [-42, 20], torso: 36, head: 2, root: [6, 2], legR: [42, 8], legL: [-30, 30], face: 'shout' }, { ease: 'out' }),
    FK(14, { armR: [90, 0], weapon: 0, armL: [-34, 16], torso: 26, head: 0, root: [4, 2], legR: [36, 8], legL: [-26, 26], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...CUT_CARRY, torso: HUNCH + 4, head: -7, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
  // lunge: the pack charge from mid range (10f crouch -> 8f dash with the knife out)
  lunge: { loop: false, frames: [
    FK(10, { armR: [-20, -40], weapon: 0, armL: [30, 30], torso: HUNCH + 8, head: -8, root: [-2, 2], legR: [26, 30], legL: [-14, 26], face: 'angry', squash: 1.06, stretch: 0.95 }, { tell: true, sfx: 'soot_flee', ease: 'in' }),
    FK(8, { armR: [96, -10], weapon: 0, armL: [-60, 20], torso: 40, head: -6, root: [6, 0], legR: [56, 10], legL: [-46, 50], face: 'shout', squash: 0.96, stretch: 1.04 },
      { hitbox: frontBox(30, hit(5, 'light', 3, 0, 14)), move: { x: 6 }, fx: [{ kind: 'dust', x: -10, y: 0, count: 3 }], sfx: 'whiff', ease: 'out' }),
    FK(4, { armR: [100, -8], weapon: 0, armL: [-50, 20], torso: 36, head: -4, root: [6, 1], legR: [40, 20], legL: [-30, 40], face: 'shout' }, { ease: 'out' }),
    FK(16, { armR: [84, 4], weapon: 0, armL: [-30, 16], torso: 28, head: -2, root: [4, 2], legR: [34, 10], legL: [-24, 26], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...CUT_CARRY, torso: HUNCH + 4, head: -7, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
});
const cutthroat = def({
  variant: 'cutthroat', name: 'SOOT CUTTHROAT', role: 'rusher', hp: 30, damage: 1, speed: 1.3, score: 100, drops: 'none',
  build: { ...BASE.build, clan: CLAN.cutthroat, weapon: { attach: 'handR', length: 21, draw: drawKnife, headAt: 14 }, accessories: [{ attach: 'head', draw: drawBandana }] },
  anims: cutthroatAnims,
  ai: { attackRange: 34, attacks: [{ anim: 'stab', range: 44, weight: 4 }, { anim: 'lunge', range: 92, minRange: 60, weight: 1 }], fleeHp: 10, fleeDistance: 100, attackCooldown: [30, 70] },
});

// ---------------------------------------------------------------- B2 Scrap Slinger: olive skin, mustard cap, sling; keeps 140px, 3 loops then a reflectable bolt, panics when crowded
// GDD 4 B2: a 6 px bolt at 4 px/f for 8; ANY player attack bats it back for 12. The generic reflect gives a batted
// projectile a lob (it assumes a bomb), which sails a flat sling bolt clean over the Slinger's head; `onReflect` flattens
// it again so the bolt actually travels back down the lane and connects. Without this the Slinger is unpunishable at range.
const boltSpec = { style: 'stone', speed: 4, damage: 8, type: 'medium', kbX: 5, kbY: 0, hitstun: 18, maxDist: 320, life: 120, offsetX: 18, offsetY: 46, color: '#9a9a90', r: 5, muzzle: false,
  reflectable: true, damageOnReflect: 12, reflectSpeed: 7, draw: drawBolt,
  onReflect(p) { p.vy = 0; p.gravity = 0; p.maxDist = 320; p.startX = p.x; } };
const SLING_CARRY = { armR: [14, 36], weapon: -12, armL: [-30, -18] };
const slingerAnims = Object.assign(gobAnims(SLING_CARRY), {
  // sling: raise 6f, three overhead loops over 30f (weapon.rot 0 -> 1080), release the bolt, 24f recovery
  sling: { loop: false, frames: [
    FK(6, { armR: [-60, -30], weapon: 0, armL: [20, -10], torso: 4, head: -10, root: [-2, 0], legR: [8, 6], legL: [-14, 10], face: 'angry' }, { tell: true, sfx: 'sling', ease: 'in' }),
    FK(10, { armR: [-170, -10], weapon: 180, armL: [30, -20], torso: -2, head: -14, root: [-3, 0], legR: [10, 8], legL: [-16, 10], face: 'angry' }, { tell: true }),
    FK(10, { armR: [-176, -12], weapon: 480, armL: [32, -22], torso: -4, head: -15, root: [-3, 0], legR: [10, 8], legL: [-16, 10], face: 'angry', squash: 0.98, stretch: 1.02 }, { tell: true }),
    FK(10, { armR: [-170, -10], weapon: 780, armL: [30, -20], torso: -2, head: -14, root: [-3, 0], legR: [10, 8], legL: [-16, 10], face: 'grit' }, { tell: true }),
    FK(5, { armR: [98, -12], weapon: 1080, armL: [-44, 16], torso: 30, head: 0, root: [4, 1], legR: [36, 8], legL: [-26, 24], face: 'shout', squash: 1.04, stretch: 0.97 },
      { event: 'spawnProjectile', projectile: boltSpec, sfx: 'bolt', smear: { from: -160, to: 0, a: 0.4, r: 46 }, ease: 'overshoot' }),
    FK(4, { armR: [102, -10], weapon: 1080, armL: [-46, 16], torso: 32, head: 0, root: [5, 1], legR: [36, 8], legL: [-26, 24], face: 'shout' }, { ease: 'out' }),
    FK(20, { armR: [80, 10], weapon: 1080, armL: [-34, 10], torso: 24, head: -4, root: [3, 1], legR: [30, 8], legL: [-22, 22], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...SLING_CARRY, weapon: 1080, torso: HUNCH + 4, head: -7, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
  // bash: a panicky backhand with the loaded pouch when a player is on top of it
  bash: { loop: false, frames: [
    FK(7, { armR: [-70, -40], weapon: 0, armL: [40, 20], torso: 0, head: -8, root: [-2, 1], legR: [10, 10], legL: [-10, 10], face: 'angry' }, { tell: true, sfx: 'whiff', ease: 'in' }),
    FK(5, { armR: [-90, -40], weapon: 0, armL: [50, 24], torso: -4, head: -8, root: [-4, 1], legR: [8, 10], legL: [-12, 12], face: 'angry' }, { tell: true, ease: 'out' }),
    FK(6, { armR: [120, -10], weapon: 0, armL: [-30, 10], torso: 26, head: 2, root: [4, 0], legR: [30, 10], legL: [-20, 20], face: 'shout' },
      { hitbox: frontBox(28, hit(6, 'light', 2, 0, 14)), smear: { from: -120, to: 0, a: 0.4, r: 40 }, sfx: 'whiff', ease: 'overshoot' }),
    FK(3, { armR: [126, -8], weapon: 0, armL: [-32, 10], torso: 28, head: 2, root: [4, 0], legR: [30, 10], legL: [-20, 20], face: 'shout' }, { ease: 'out' }),
    FK(16, { armR: [110, 0], weapon: 0, armL: [-30, 10], torso: 20, head: -2, root: [3, 1], legR: [28, 10], legL: [-20, 20], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...SLING_CARRY, torso: HUNCH + 4, head: -7, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
});
/** GDD 4 B2: a player inside 50 px panics it into a 30f stagger that is a *free punish*, then it runs. The core's
 *  stagger only stops it acting, so flag the window punishable while it lasts (readable in the F1 overlay, and it makes
 *  any punish rule apply to the opening the GDD promises). */
const slingerHooks = {
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    if (f.panicFlee && f.aiState === 'STAGGER') f.punishable = true;
  },
};
const slinger = def({
  variant: 'slinger', name: 'SCRAP SLINGER', role: 'ranged', hp: 35, damage: 1, speed: 1.1, score: 150, drops: 'none',
  build: { ...BASE.build, clan: CLAN.slinger, palette: { ...GOB_PAL, skin: '#86A339', sleeve: '#86A339', secondary: '#8CC23C', hair: '#4E6218' },
    weapon: { attach: 'handR', length: 22, draw: drawSling, headAt: 19 }, accessories: [{ attach: 'head', draw: drawCap }, { attach: 'hip', draw: drawSatchel }] },
  anims: slingerAnims,
  ai: { attackRange: 30, attacks: [{ anim: 'bash', range: 36, weight: 1 }], ranged: { anim: 'sling', minRange: 100, maxRange: 300, cooldown: 150, zAlign: true, keep: 140 },
    panicRange: 50, panicFrames: 30, retreatBudget: 120, retreatChance: 0.2 },
}, slingerHooks);

// ---------------------------------------------------------------- B3 Firebrand: singed skin, orange clan colour, fuel tank + nozzle, welding goggles; flame cone + burn + fire puddle; tank explodes 30f after death
const FLAME_BOX = { ...frontBox(70, hit(5, 'light', 1, 0, 12)), once: false, rehit: 10, id: 'flame', element: 'fire', status: { burn: { frames: 60, every: 20, damage: 2 } } };
const PUDDLE = { kind: 'puddle', style: 'fire', r: 22, life: 180, every: 20, pierce: 99, damage: 4, type: 'light', kbX: 1, kbY: 0, hitstun: 12, friendly: true, teamNone: true, element: 'fire', muzzle: false };
const FIRE_CARRY = { armR: [30, 40], weapon: 0, armL: [-30, -30], grip: 0 };
const FLAME_POSE = { weapon: 4, grip: 1, torso: 26, head: -4, root: [3, 1], armL: [-24, 16], legR: [36, 8], legL: [-28, 26], face: 'shout' };
const firebrandAnims = Object.assign(gobAnims(FIRE_CARRY), {
  // flame: 24f tell (nozzle raised, pilot light pops bigger: grip 1) -> 3 x 9f cone sweeps (3 hits + burn) -> fire puddle -> 24f recovery
  flame: { loop: false, frames: [
    FK(10, { armR: [-10, 70], weapon: -20, grip: 1, torso: 6, head: -10, root: [-3, 0], armL: [20, 40], legR: [6, 6], legL: [-14, 10], face: 'angry' }, { tell: true, sfx: 'fire', ease: 'in' }),
    FK(14, { armR: [-4, 66], weapon: -16, grip: 1, torso: 8, head: -11, root: [-4, 1], armL: [26, 44], legR: [6, 6], legL: [-14, 10], face: 'angry', squash: 0.98, stretch: 1.02 }, { tell: true, ease: 'out' }),
    FK(9, { ...FLAME_POSE, armR: [86, 6] }, { hitbox: FLAME_BOX, sfx: 'burn', fx: [{ kind: 'steam', x: 34, y: 40, count: 2 }], ease: 'out' }),
    FK(9, { ...FLAME_POSE, armR: [92, 0], weapon: 8, root: [4, 1] }, { hitbox: FLAME_BOX, ease: 'inout' }),
    FK(9, { ...FLAME_POSE, armR: [80, 10], weapon: -4, root: [3, 1] }, { hitbox: FLAME_BOX, spawn: { projectile: PUDDLE, x: 48, y: 0, z: 0 }, ease: 'inout' }),
    FK(4, { ...FLAME_POSE, armR: [78, 12], weapon: -6, grip: 0.4, face: 'grit' }, { ease: 'out' }),
    FK(20, { armR: [60, 30], weapon: -10, grip: 0, torso: 20, head: -6, root: [2, 1], armL: [-20, 10], legR: [30, 8], legL: [-24, 22], face: 'grit' }, { punish: true, ease: 'inout', fx: [{ kind: 'steam', x: 30, y: 40, count: 2 }] }),
    FK(6, { ...FIRE_CARRY, torso: HUNCH + 4, head: -7, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
});
/** Visible flame cone from the nozzle tip while the flame hitbox is live (drawAfter). */
function drawFlameCone(ctx, f) {
  const fr = f.anim.frame;
  if (f.anim.name !== 'flame' || !fr.hitbox) return;
  const tip = jointScreen(f.rig, 'weaponTip'), t = f.world ? f.world.frame : 0, dir = f.facing, x0 = tip.x, y0 = tip.y;
  ctx.save(); ctx.globalAlpha = 0.85;
  for (let layer = 0; layer < 3; layer++) {
    const L = 68 * (1 - layer * 0.28), hw = 16 - layer * 5;
    ctx.fillStyle = FLAME_COLS[layer];
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (let i = 1; i <= 4; i++) { const u = i / 4; ctx.lineTo(x0 + dir * L * u, y0 - hw * u - Math.sin(t * 0.7 + i * 1.9 + layer) * 3 + 3); }
    ctx.lineTo(x0 + dir * (L + 8), y0 + 2);
    for (let i = 4; i >= 1; i--) { const u = i / 4; ctx.lineTo(x0 + dir * L * u, y0 + hw * 0.6 * u + Math.cos(t * 0.6 + i * 1.7 + layer) * 3 + 3); }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
/** Death: the tank glows and blinks on the body for 30f (following it even when thrown), then blows: r 40, 15 to everyone. */
function firebrandDeath(f, world) {
  world.spawnProjectile({ owner: f, x: f.x, y: 0, z: f.z, life: 30, rest: true, gravity: 0, hit: null, style: 'explosion', r: 0, draw: (ctx, p) => drawFuse(ctx, p, f), onExpire: (w) => tankBlast(f, w) });
}
function drawFuse(ctx, p, f) {
  const cam = p.world && p.world.camera; if (!cam) return;
  const bx = cam.toScreenX(f.x), by = R(FLOOR_TOP + f.z - f.y + cam.shakeY) - R(f.h * 0.45);
  const on = p.life < 12 ? (p.life & 1) === 0 : (p.life & 4) === 0;
  ctx.save(); ctx.globalAlpha = on ? 0.9 : 0.3;
  ctx.fillStyle = FLAME_COLS[0]; ctx.beginPath(); ctx.arc(bx, by, 6 + (30 - p.life) * 0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = HOT; ctx.beginPath(); ctx.arc(bx, by, 3, 0, TAU); ctx.fill();
  ctx.restore();
}
function tankBlast(f, w) {
  w.areaHit(f.x, f.z, 40, { damage: 15, type: 'knockdown', kbX: 5, kbY: 5, hitstun: 22, friendly: true, element: 'fire' }, f, { shake: 8, color: '#ff9a30' });
  const y = f.y + f.h * 0.4;
  particles.burst('ember', f.x, y, f.z, 14, { speed: 3.5, up: 2.5 }); particles.burst('smoke', f.x, y, f.z, 8, { speed: 1.4, up: 1 });
  particles.burst('debris', f.x, y, f.z, 5, { speed: 3, up: 3, color: COPPER });
  w.addFx('ring', f.x, 20, f.z, { r0: 6, r1: 44, color: '#ffb060' });
  audio.play('explosion');
}
const firebrand = def({
  variant: 'firebrand', name: 'FIREBRAND', role: 'bruiser', hp: 45, damage: 1, speed: 1.0, score: 200, drops: 'none',
  build: { ...BASE.build, clan: CLAN.firebrand, palette: { ...GOB_PAL, skin: '#8C3A2E', sleeve: '#8C3A2E', secondary: '#8C3A2E', hair: '#521F18', primary: '#7A6650' },
    parts: { ...GOB_PARTS, armLower: gobCuffArm }, weapon: { attach: 'handR', length: 24, draw: drawNozzle, headAt: 18 },
    accessories: [{ attach: 'back', draw: drawTank }, { attach: 'head', draw: drawGoggles }] },
  anims: firebrandAnims,
  ai: { attackRange: 56, zTolerance: 14, attacks: [{ anim: 'flame', range: 72, weight: 1 }], attackCooldown: [50, 100], retreatChance: 0.2 },
}, {
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f);
    if (f.anim.name === 'flame' && f.anim.frame.hitbox && world.frame % 3 === 0) particles.burst('ember', f.x + f.facing * (34 + (world.frame % 5) * 9), 30, f.z, 1, { speed: 1.5, up: 1.4 });
  },
  onDeath: firebrandDeath,
  drawAfter: (ctx, f) => drawFlameCone(ctx, f),
});

// ---------------------------------------------------------------- B4 Cinder Hulk: x1.6, copper collar, wrist chains, anvil club; overhead (36f tell) + grab (4x5 squeeze, mash out); flinches every 3rd hit; launchers stun 45f
const HULK_CARRY = { armR: [-34, -66], weapon: 74, weaponBack: 1, armL: [-24, -12] };
const HULK_UP = { weapon: 0, weaponBack: 0, armL: [-80, -50], head: -12, legR: [8, 6], legL: [-16, 10] };
const hulkAnims = Object.assign(gobAnims(HULK_CARRY, { grab: true }), {
  overhead: { loop: false, frames: [
    FK(12, { ...HULK_UP, armR: [-90, -70], armL: [-60, -40], torso: 2, head: -10, root: [-2, 0], face: 'angry' }, { tell: true, sfx: 'roar', fx: [{ kind: 'dust', x: 10, y: 0, count: 3 }], ease: 'in' }),
    FK(12, { ...HULK_UP, armR: [-140, -30], torso: -6, root: [-4, -1], squash: 0.97, stretch: 1.04, face: 'angry' }, { tell: true, fx: [{ kind: 'dust', x: -12, y: 0, count: 3 }], ease: 'inout' }),
    FK(12, { ...HULK_UP, armR: [-170, -6], weapon: -20, armL: [-90, -50], torso: -10, head: -14, root: [-5, -2], squash: 0.96, stretch: 1.05, face: 'shout' }, { tell: true, fx: [{ kind: 'dust', x: 14, y: 0, count: 4 }], ease: 'in' }),
    FK(8, { ...HULK_UP, armR: [16, -10], weapon: -30, armL: [60, 30], torso: 36, head: 6, root: [6, 3], squash: 1.1, stretch: 0.92, legR: [44, 30], legL: [-30, 34], face: 'shout' },
      { hitbox: frontBox(66, hit(18, 'knockdown', 5, 5, 22)), smear: { from: -170, to: 60, a: 0.55, r: 62 }, sfx: 'hammer_slam', event: 'slam',
        fx: [{ kind: 'dust', x: 100, y: 0, count: 8 }, { kind: 'ring', x: 100, y: 0, r0: 4, r1: 34, flat: true, color: '#ffd080' }], ease: 'overshoot' }),
    FK(4, { ...HULK_UP, armR: [18, -8], weapon: -30, armL: [62, 30], torso: 38, head: 6, root: [6, 3], squash: 1.08, stretch: 0.94, legR: [44, 30], legL: [-30, 34], face: 'grit' }, { ease: 'out' }),
    FK(30, { ...HULK_UP, armR: [20, -10], weapon: -40, armL: [50, 30], torso: 32, head: 4, root: [6, 3], legR: [42, 28], legL: [-30, 32], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(8, { ...HULK_CARRY, torso: HUNCH + 4, head: -7, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
});
const hulk = def({
  variant: 'hulk', name: 'CINDER HULK', role: 'grabber', hp: 160, damage: 1, speed: 0.6, score: 500, drops: 'food_small', elite: true,
  grabbable: false, grabbableByGrappler: true, lyingFrames: 50, grabOffset: 26,
  build: { ...BASE.build, scale: 1.36, clan: CLAN.hulk, palette: { ...GOB_PAL, skin: '#3C7A27', sleeve: '#3C7A27', secondary: '#48922F', hair: '#1E4A0F', primary: '#3C7A27' },
    proportions: { ...GOB_PROPS, headR: 11, torsoW: 26, torsoH: 24, hip: 22, armR: 6.5, handR: 6, legR: 7, upperLeg: 10, lowerLeg: 9, footL: 13, footH: 6, bulge: 0.5 },
    gob: { tunic: 'skin', chains: true, shorts: '#3A2E26' }, weapon: { attach: 'handR', length: 56, draw: drawAnvilClub, headAt: 40 },
    accessories: [{ attach: 'torso', draw: drawCollar }] },
  anims: hulkAnims,
  traits: { flinchEvery: 3, weight: 1.6 },
  moves: { grabHit: { damage: 5, hits: 4 }, throwFwd: { damage: 8, vx: 9, vy: 5 } },
  ai: { attackRange: 44, zTolerance: 14, attacks: [{ anim: 'overhead', range: 76, minRange: 36, weight: 3 }, { anim: 'grab', tell: 'grabTell', range: 44, weight: 3 }], attackCooldown: [60, 120],
    grabHoldHits: 4, grabHitEvery: 18, retreatChance: 0, flank: false, ignoresTokens: false },
}, {
  // GDD: a launcher stuns him 45f instead of launching (the core's ai.launchStun needs super armor, which would cancel "flinches every 3rd hit")
  onHitTaken(f, h) {
    if (h.type === 'launch' && !f.airborne && !f.dead && f.state !== ST.KNOCKDOWN && f.state !== ST.LYING) { audio.play('stagger'); return { ...h, type: 'heavy', stagger: true, hitstun: 15, breaksArmor: true }; }
    return undefined;
  },
  onAnimEvent(f, name, frame, world) { if (name === 'slam') { if (world.camera) world.camera.shake(8, 12); return true; } return false; },
});

// ---------------------------------------------------------------- B5 Gutter Wrangler: x0.9, oxblood waistcoat, top hat, monocle, 6-segment whip, net; backsteps after 2 whiffs
const netSpec = { style: 'net', speed: 5, damage: 4, type: 'medium', kbX: 0, kbY: 0, hitstun: 12, maxDist: 220, life: 80, offsetX: 16, offsetY: 50, color: NETC, r: 10, muzzle: false, status: { netted: { frames: 90 } } };
const WR_CARRY = { armR: [26, 30], weapon: 0, armL: [-30, -20], grip: 0, handL: 0 };
const wranglerAnims = Object.assign(gobAnims(WR_CARRY), {
  // whip crack: 14f arm-raised tell -> 6f snap forward (lash straightens: grip 1) -> hold -> 22f recovery
  whip: { loop: false, frames: [
    FK(8, { armR: [-150, -30], weapon: -10, grip: 0, handL: 0, armL: [30, 10], torso: 4, head: -10, root: [-2, 0], legR: [6, 6], legL: [-14, 10], face: 'angry' }, { tell: true, sfx: 'whip', ease: 'in' }),
    FK(6, { armR: [-165, -30], weapon: -14, grip: 0, handL: 0, armL: [36, 12], torso: -2, head: -12, root: [-4, 0], legR: [4, 6], legL: [-16, 12], face: 'angry', squash: 0.97, stretch: 1.03 }, { tell: true, ease: 'out' }),
    FK(6, { armR: [110, -20], weapon: 10, grip: 1, handL: 0, armL: [-36, 16], torso: 30, head: 4, root: [5, 1], squash: 1.04, stretch: 0.97, legR: [40, 8], legL: [-30, 30], face: 'shout' },
      { hitbox: frontBox(60, hit(8, 'medium', 3, 0, 18), { high: true }), smear: { from: -160, to: 10, a: 0.5, r: 74 }, fx: [{ kind: 'slash', x: 56, y: 46, radius: 22, angle: 0, sweep: 60 }], sfx: 'whip', ease: 'overshoot' }),
    FK(2, { armR: [114, -18], weapon: 12, grip: 1, handL: 0, armL: [-38, 16], torso: 32, head: 4, root: [5, 1], legR: [40, 8], legL: [-30, 30], face: 'shout' }, { ease: 'out' }),
    FK(20, { armR: [96, 0], weapon: 16, grip: 0.3, handL: 0, armL: [-30, 12], torso: 24, head: 0, root: [4, 1], legR: [34, 8], legL: [-26, 26], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...WR_CARRY, torso: HUNCH + 4, head: -7, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
  // net throw: 30f tell with the net spun overhead in the off hand (handL.rot 0 -> 1000) -> throw -> 26f recovery
  net: { loop: false, frames: [
    FK(6, { armL: [-60, -40], handL: 0, armR: [30, 40], weapon: 0, grip: 0, torso: 6, head: -10, root: [-2, 0], legR: [8, 6], legL: [-14, 10], face: 'angry' }, { tell: true, sfx: 'net', ease: 'in' }),
    FK(12, { armL: [-168, -20], handL: 380, armR: [34, 40], weapon: 0, grip: 0, torso: 0, head: -14, root: [-3, 0], legR: [10, 8], legL: [-16, 10], face: 'angry' }, { tell: true }),
    FK(12, { armL: [-172, -24], handL: 900, armR: [36, 42], weapon: 0, grip: 0, torso: -2, head: -15, root: [-3, 0], legR: [10, 8], legL: [-16, 10], face: 'grit', squash: 0.98, stretch: 1.02 }, { tell: true }),
    FK(5, { armL: [100, -10], handL: 1000, armR: [10, 30], weapon: 0, grip: 0, torso: 28, head: 0, root: [4, 1], legR: [36, 8], legL: [-26, 24], face: 'shout', squash: 1.04, stretch: 0.97 }, { event: 'spawnProjectile', projectile: netSpec, sfx: 'throw', ease: 'overshoot' }),
    FK(3, { armL: [104, -8], handL: 1000, armR: [10, 30], weapon: 0, grip: 0, torso: 30, head: 0, root: [5, 1], legR: [36, 8], legL: [-26, 24], face: 'shout' }, { ease: 'out' }),
    FK(22, { armL: [80, 10], handL: 1000, armR: [20, 34], weapon: 0, grip: 0, torso: 22, head: -4, root: [3, 1], legR: [30, 8], legL: [-22, 22], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...WR_CARRY, handL: 1000, torso: HUNCH + 4, head: -7, legR: [8, 4], legL: [-8, 6] }, { ease: 'out' }),
  ] },
});
/**
 * Backstep budget (GDD 4 B5: "backsteps 40 px after any 2 whiffed player attacks", with a cooldown). The cooldown alone
 * still lets him hop away for the whole fight, so he also tires: BACKSTEP_BUDGET hops without landing a whip and he has
 * to plant his feet for BACKSTEP_REST frames. Landing a hit means he has re-established the spacing he wanted, so the
 * budget refills. `backstepCooldown` is the core's own gate (enemy.js tryBackstep), so writing it is all this needs.
 */
const BACKSTEP_BUDGET = 3, BACKSTEP_REST = 210;
const wranglerHooks = {
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    const hopping = f.state === ST.DODGE;
    if (hopping && !f.wrHopping && ++f.wrHops >= BACKSTEP_BUDGET) { f.wrHops = 0; f.backstepCooldown = BACKSTEP_REST; }
    f.wrHopping = hopping;
  },
  onSpawn(f) { f.wrHops = 0; f.wrHopping = false; },
  onHitDealt(f) { f.wrHops = 0; },
};
const wrangler = def({
  variant: 'wrangler', name: 'GUTTER WRANGLER', role: 'elite', hp: 60, damage: 1, speed: 1.5, score: 400, drops: 'score',
  build: { ...BASE.build, scale: 0.77, clan: CLAN.wrangler, palette: { ...GOB_PAL, skin: '#8EC94A', sleeve: '#C9BB95', secondary: '#9FE153', hair: '#4A7A1B', primary: CLAN.wrangler, dark: '#3A3040' },
    gob: { tunic: 'waistcoat', shirt: '#C9BB95', shorts: '#3A3040' }, weapon: { attach: 'handR', length: 56, draw: drawWhip, headAt: 30 },
    accessories: [{ attach: 'head', draw: drawTopHat }, { attach: 'head', draw: drawMonocle }, { attach: 'handL', draw: drawNet }] },
  anims: wranglerAnims,
  // GDD 4 B5 gives him NO standoff distance: he is a fast melee elite who wants to be in whip range, and his defence is
  // the whiff backstep, not kiting. `ranged.keep: 110` had him park at 110-120 px — outside every hero's reach — and
  // shuffle there for the whole fight, so nothing could ever touch him. `keep: 16` (below `attackRange`, so the melee
  // fallback in thinkRanged always takes over first) makes him close and whip while the net keeps its own 240f cooldown,
  // and a 24-frame retreat budget leaves him only a short give-ground shuffle between attacks instead of endless kiting.
  ai: { attackRange: 56, zTolerance: 12, attacks: [{ anim: 'whip', range: 70, weight: 3 }],
    ranged: { anim: 'net', minRange: 70, maxRange: 210, cooldown: 240, zAlign: true, keep: 16 },
    backstepAfterWhiffs: { whiffs: 2, dist: 40, iframes: 8, cooldown: 90, range: 100 }, targetBy: 'highestCombo',
    retreatChance: 0.1, retreatBudget: 24, attackCooldown: [30, 70], ignoresTokens: false },
}, wranglerHooks);

/** Sootborn variants in GDD order. */
export const SOOTBORN = [cutthroat, slinger, firebrand, hulk, wrangler];
export { P };
