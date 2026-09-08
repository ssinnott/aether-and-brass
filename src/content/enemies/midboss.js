// Mid-boss: Foreman Grubbik & the Hoister (GDD 5.1) on the cel-shaded rig pass (docs/ART_STYLE.md).
// Phase 1/2 = the Hoister, a stolen cargo-loader exosuit: a 40x30 hazard-orange chassis with black stripes, a riveted boiler
// and chimney behind it, an open cockpit cage on top holding Grubbik (goblin parts from ./common.js, stovepipe hat, monocle,
// cigar), two piston legs on plate feet, a 2-prong crane CLAW on the near arm and a 5-link CHAIN HOOK hanging off the far arm.
// Phase 3 = Grubbik on foot (100 HP), a Gutter-Wrangler-style goblin with the same hat / monocle / cigar and a whip.
// Every state is hand-keyed: idle breathes on the pistons with boiler smoke, the walk stomps with dust, each attack runs
// anticipation -> smear hit -> hold -> punish recovery, the overheat phase glows red, the stall opens the cockpit cage
// (pose.grip), and hurt / stagger / collapse / defeat all have their own keys. Gameplay numbers, hitboxes, events, phases and
// AI tables are unchanged from the design pass; this file is art + animation only.
// Rig channels used as animation data: pose.grip = cockpit cage opening (0 shut .. 1 wide), pose.handL.rot = Grubbik's hat tip
// (the far hand draws nothing on the Hoister; on foot it also throws the hat). Rig flags set by hooks.onUpdate:
// clawOpen, hookOut, hookTell, stalled, lever (Grubbik hauling the crate lever), netSpin / netThrown.
import { FK, frontBox, GOB, GOB_PAL, GOB_PROPS, GOB_PARTS, gobHead, gobFace, gobCuffArm, makeBrassBase } from './common.js';
import { celRect, celBall, celPoly, celCapsule, celPath, tones, flat, rimTop, pathRR, band } from '../../art/shading.js';
import { getChain } from '../../art/secondary.js';
import { jointScreen } from '../../art/rig.js';
import { rrect, pathPoly, paint } from '../../art/shapes.js';
import { rad } from '../../engine/math.js';
import { particles } from '../../engine/particles.js';

const R = Math.round, TAU = Math.PI * 2;
// Value ladder (ART_STYLE 0.1): bright hazard orange chassis > light steel booms / piston rods / chain links >
// dark iron boiler, cage uprights and leg sleeves > near-black slate foot plates and hazard tape. Brass is the only warm metal.
// IRON and SLATE hold their hue (265 deg) and their lightness to within 1 L* and move CHROMA only (Oklab C 2.7 -> 7.1
// and 2.4 -> 5.0) - the same move, and the same two hexes, as the Regent Engine's frame in boss.js, because it is the
// same material on the same class of machine. IRON's Rec-601 luminance is unchanged to three places (0.2531 -> 0.2540),
// so the secondary/dark step the boss ladder measures is untouched; SLATE rises from Oklab L* 32.2 to 32.5, which is
// what puts it 9.1 L* clear of the outline #1A1E24 instead of 8.8. HAZ is the best-placed boss colour in the game and
// does not move; brass stays the only warm metal.
const HAZ = '#E07A1F', STRIPE = '#241C18', IRON = '#2F4269', STEEL = '#C0C8D4', BRASSY = '#C89B3C';
const SLATE = '#26344E', LINK = '#4A5060', FIRE = '#FF7A1F', HOT = '#FFD27A', RED = '#FF5C5C', STEAM = '#DDE6EC';
const HAT = '#1A1418', BAND = '#7A1E2A', CIGAR = '#C8A070', SHIRT = '#C9BB95', SHORTS = '#3A3040';
const OL = '#1A1E24';
const OVER_A = 'rgba(255,74,40,0.20)', OVER_B = 'rgba(255,74,40,0.34)', DARKSLOT = '#241A1C';
const hitOf = (damage, type, kbX, kbY, hitstun) => ({ damage, type, kbX, kbY, hitstun, once: true });

// ---------------------------------------------------------------- shared bits (both rigs)
/** One soft steam puff: three merged discs, no outline (fillStyle set by the caller). */
function puff(ctx, x, y, r, a) {
  if (a <= 0.02) return;
  const p = ctx.globalAlpha; ctx.globalAlpha = p * a;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.arc(x - r * 0.8, y + r * 0.45, r * 0.7, 0, TAU); ctx.arc(x + r * 0.75, y + r * 0.5, r * 0.6, 0, TAU); ctx.fill();
  ctx.globalAlpha = p;
}
/** Stovepipe hat above the hairline; tips forward on pose.handL.rot (the hat-tip intro / taunt). Head space. */
function drawStovepipe(ctx, rig, r, pose) {
  const tip = pose ? pose.handL.rot : 0;
  if (tip > 300) return; // thrown (Hat Toss)
  const brim = R(-r * 0.95), h = R(r * 2.1);
  ctx.save(); ctx.translate(R(-r * 0.45), brim); ctx.rotate(rad(-tip));
  celRect(ctx, rig, -r - 3, -2, r * 2 + 9, 4, 1, HAT, 0.42, 0);
  celRect(ctx, rig, -r + 2, -h - 1, r * 2 - 3, h, 1, HAT, 0.34, 0.3);
  if (!rig.override) {
    // the clan band is cloth on felt - a material change, so it carries the line (ART_STYLE 0.2). It was a bare
    // 4 px fillRect plus a 1 px shade seam; inked and widened to 6 it keeps 4 px of wine and drops the seam.
    band(ctx, rig, -r + 2, -8, r * 2 - 3, 6, BAND, 2);
    rimTop(ctx, rig, -r + 4, -h - 1, R(r * 0.7), -h - 1, '#4A4652');
  }
  ctx.restore();
}
/** Brass monocle over the near eye with a short chain (head space, after the face). */
function drawMonocle(ctx, rig, r) {
  if (rig.override) return;
  const cx = R(r * 0.35), cy = R(-r * 0.4), rr = Math.max(4, R(r * 0.45));
  ctx.strokeStyle = rig.col(BRASSY); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
  ctx.strokeStyle = rig.col('#8A6A26'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx + rr - 1, cy + rr - 1); ctx.lineTo(cx + rr, cy + rr + 6); ctx.stroke();
}
/** Cigar clamped in the grin with a hot tip and a two-puff smoke column that lags the head (head space). */
function drawCigar(ctx, rig, r) {
  const x = R(r * 0.5), y = R(r * 0.62), L = Math.max(8, R(r * 1.1));
  celCapsule(ctx, rig, x, y, x + L, y - 3, 2.4, CIGAR, 0);
  if (rig.override) return;
  ctx.fillStyle = rig.col(HAT); ctx.fillRect(x - 1, y - 2, 3, 4);
  const tx = x + L + 1, ty = y - 3;
  ctx.fillStyle = rig.col((rig.tick & 8) ? FIRE : HOT); ctx.fillRect(tx - 1, ty - 2, 3, 3);
  const ch = getChain(rig, 'smoke', 2, { joint: 'head', rest: [0, -1], stiffness: 0.1, damping: 0.74, gain: 2.4, rotGain: 0.4, maxAng: 42 });
  ctx.save(); ctx.translate(tx, ty - 2);
  ctx.fillStyle = tones(rig, STEAM).base;
  for (let i = 0; i < 2; i++) {
    ctx.rotate(rad(ch.ang[i]));
    const k = ((rig.tick + i * 15) % 30) / 30;
    puff(ctx, 1, -3 - i * 5 - k * 7, 1.6 + i * 0.6 + k * 2, 0.45 - k * 0.4);
    ctx.translate(0, -7);
  }
  ctx.restore();
}
/** Hat + monocle + cigar as one `hat` part hook (drawn after the face on both rigs). */
function grubGear(ctx, rig, pose, inf) { drawStovepipe(ctx, rig, inf.r, pose); drawMonocle(ctx, rig, inf.r); drawCigar(ctx, rig, inf.r); }

// ================================================================ the Hoister (chassis rig, scale 1.9 -> ~133 px)
const HOISTER_PAL = { skin: GOB.skin, hair: GOB.shade, primary: HAZ, sleeve: STEEL, secondary: IRON, accent: BRASSY, metal: STEEL, dark: SLATE, glow: GOB.eye };

/** Chassis (torso space): the hazard-orange cab shell — dark cockpit notch on top, hazard tape at the foot, lamp, panel. */
function hoistChassis(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), top = -H - 8, pal = inf.pal;
  celRect(ctx, rig, -hw, top, W, -top + 1, 5, pal.primary, 0.3, 0.34);
  if (rig.override) return;
  const t = tones(rig, pal.primary), tb = tones(rig, pal.accent);
  ctx.save(); pathRR(ctx, -hw, top, W, -top + 1, 5); ctx.clip();
  // hazard tape along the foot of the cab: a black band with orange diagonal ticks cut back out of it
  ctx.fillStyle = rig.col(STRIPE); ctx.fillRect(-hw, -10, W, 11);
  ctx.fillStyle = rig.col(pal.primary);
  for (let i = 0; i < 5; i++) {
    const x = -hw + 2 + i * 7;
    ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x + 3, -10); ctx.lineTo(x - 3, 1); ctx.lineTo(x - 6, 1); ctx.closePath(); ctx.fill();
  }
  if (rig.overheat) { ctx.fillStyle = ((rig.tick >> 2) & 1) ? OVER_B : OVER_A; ctx.fillRect(-hw, top, W, -top + 1); }
  ctx.restore();
  // cockpit notch cut out of the cab roof: Grubbik's green head and hat read against this dark well
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 5, top, W - 10, 12);
  ctx.fillStyle = rig.col(STRIPE); ctx.fillRect(-hw + 5, top + 11, W - 10, 2);
  rimTop(ctx, rig, -hw + 3, top, -hw + 5, top, pal.primary);
  rimTop(ctx, rig, hw - 5, top, hw - 3, top, pal.primary);
  // inspection panel (left) and the warning lamp (right) on the open orange band
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 3, -18, 14, 7);
  ctx.fillStyle = tb.base; ctx.fillRect(-hw + 5, -16, 3, 3); ctx.fillRect(-hw + 10, -16, 3, 3);
  ctx.fillStyle = tb.sh; ctx.fillRect(-hw + 3, -12, 14, 1);
}
/** Warning beacon on top of the near cage post: amber at rest, red through every wind-up, white blink on the last tell frames. */
function drawBeacon(ctx, rig, x, y) {
  const blink = (rig.tick & 2) !== 0;
  const lit = rig.tell ? (rig.tellWarn && blink ? '#FFFFFF' : RED) : (rig.overheat ? FIRE : HOT);
  if (rig.tell && !rig.override) { ctx.fillStyle = rig.tellWarn && blink ? 'rgba(255,255,255,0.3)' : 'rgba(255,92,92,0.3)'; ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill(); }
  celBall(ctx, rig, x, y, 5, BRASSY, false);
  if (rig.override) return;
  ctx.beginPath(); ctx.arc(x, y, 3.4, 0, TAU); ctx.fillStyle = rig.col(lit); ctx.fill();
  ctx.fillStyle = rig.col('#FFFFFF'); ctx.fillRect(x - 2, y - 3, 2, 2);
}
/** Pelvis beam (hip space): brass crossbar with a dark iron hub the legs pivot on. */
function hoistHips(ctx, rig, pose, inf) {
  const hw = R(inf.w / 2) - 2, pal = inf.pal;
  celRect(ctx, rig, -hw, 0, hw * 2, 9, 3, IRON, 0.42, 0.2);
  if (rig.override) return;
  const tb = tones(rig, pal.accent);
  ctx.fillStyle = tb.base; ctx.fillRect(-hw, 2, 4, 5); ctx.fillRect(hw - 4, 2, 4, 5);
  ctx.fillStyle = tones(rig, IRON).hi; ctx.fillRect(-hw + 5, 1, hw * 2 - 10, 1);
}
/** Brass pivot disc where an arm meets the chassis (shoulder space, over the upper arm). */
function hoistShoulder(ctx, rig, pose, inf) {
  celBall(ctx, rig, 0, 0, inf.r - 2, inf.pal.accent, false);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, inf.pal.accent).deep; ctx.fillRect(-2, -2, 4, 4);
}
/** Upper arm / boom (limb space, +y along the limb): light-steel hydraulic barrel with a brass collar at the elbow. */
function hoistArmUpper(ctx, rig, pose, inf) {
  const r = inf.r, L = inf.len, pal = inf.pal;
  celRect(ctx, rig, -r, -2, r * 2, L + 4, 3, pal.sleeve, 0.36, 0.28);
  if (rig.override) return;
  band(ctx, rig, -r, L - 4, r * 2, 6, pal.accent, 2);   // brass collar on a steel barrel: material change, takes ink
}
/**
 * Far arm = the chain hook (GDD: 5 line segments). The links hang straight down from the elbow whatever the boom does
 * (the forearm rotation is undone), lag on a secondary-motion chain, rattle through the Hook Yank tell and shorten to a
 * stub while the hook is out on its chain (rig.hookOut, the projectile draws the rest).
 */
function drawChainHook(ctx, rig, pose, inf) {
  const pal = inf.pal, n = rig.hookOut ? 2 : 5;
  // the chain pays out so the hook always dangles just above the deck, however high the boom swings
  const drop = Math.max(15, Math.min(42, -rig.joints.elbowF.y - 5));
  const pitch = rig.hookOut ? 5 : Math.max(3, (drop - 13) / 5);
  const ch = getChain(rig, 'hook', 5, { joint: 'torso', rest: [0, 1], stiffness: 0.15, damping: 0.68, gain: 1.5, rotGain: 0.35, maxAng: 32 });
  const rattle = rig.hookTell && rig.tell ? ((rig.tick & 1) ? 3 : -3) : 0;
  ctx.save(); ctx.rotate(rad(rig.joints.armF.lower));
  for (let i = 0; i < n; i++) {
    ctx.rotate(rad(ch.ang[i] + rattle));
    celRect(ctx, rig, -4, 0, 8, pitch + 1, 3, pal.metal, 0.42, 0);
    if (!rig.override) { ctx.fillStyle = tones(rig, pal.metal).deep; ctx.fillRect(-2, 1, 4, pitch - 1); }
    ctx.translate(0, pitch);
  }
  if (rig.hookOut) { ctx.restore(); return; }
  // hook head: light-steel shank and a barbed J so it reads against the dark links
  celRect(ctx, rig, -3, 0, 6, 5, 2, pal.accent, 0.4, 0);
  ctx.beginPath(); ctx.moveTo(-2, 3); ctx.lineTo(6, 5); ctx.lineTo(9, 12); ctx.lineTo(3, 18); ctx.lineTo(-4, 13); ctx.lineTo(0, 11); ctx.lineTo(3, 13); ctx.lineTo(4, 8); ctx.closePath();
  if (rig.hookTell && rig.tell && !rig.override) { ctx.fillStyle = 'rgba(255,92,92,0.35)'; ctx.fill(); }
  celPoly(ctx, rig, [-2, 3, 7, 6, 9, 12, 3, 18, -4, 13, 0, 11, 4, 13, 5, 7], pal.accent, 0.4, 0.28);
  ctx.restore();
}
/** Near forearm: dark iron piston sleeve at the elbow with a light steel ram sliding out to the claw wrist. */
function hoistArmLower(ctx, rig, pose, inf) {
  if (inf.far) { drawChainHook(ctx, rig, pose, inf); return; }
  const r = inf.r, L = inf.len, pal = inf.pal;
  celCapsule(ctx, rig, 0, 5, 0, L + 3, r * 0.6, pal.metal, 0.3);
  celRect(ctx, rig, -r - 1, -2, r * 2 + 2, 11, 3, pal.secondary, 0.4, 0.25);
  if (rig.override) return;
}   // the old 3 px brass wrist collar is gone: under the 0.7 floor, it could not carry a line and did not read
/** Two-prong crane claw on the near hand (hand space, +x along the forearm). Jaws open by rig.clawOpen (0 shut .. 1 wide). */
function hoistClaw(ctx, rig, pose, inf) {
  if (inf.far) return; // the far arm ends in the chain hook instead
  const pal = inf.pal, open = rig.clawOpen != null ? rig.clawOpen : 0.35, g = 5 + 11 * open;
  celRect(ctx, rig, -5, -7, 12, 14, 3, pal.accent, 0.38, 0.25);
  celPoly(ctx, rig, [5, -6, 13, -8 - g * 0.7, 22, -5 - g, 25, -1 - g, 17, -1 - g * 0.45, 10, -2], pal.metal, 0.4, 0.28);
  celPoly(ctx, rig, [5, 6, 13, 8 + g * 0.7, 22, 5 + g, 25, 1 + g, 17, 1 + g * 0.45, 10, 2], pal.metal, 0.4, 0.28);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, pal.accent).deep; ctx.fillRect(-2, -4, 5, 8);
}
/** Thigh: dark iron cylinder with a brass knee collar (limb space, +y along the limb). */
function hoistLegUpper(ctx, rig, pose, inf) {
  const r = inf.r, L = inf.len, pal = inf.pal;
  celRect(ctx, rig, -r, -2, r * 2, L + 5, 3, pal.secondary, 0.4, 0.25);
  if (rig.override) return;
  band(ctx, rig, -r, L - 2, r * 2, 6, pal.accent, 2);   // brass knee collar on the iron thigh: material change, takes ink
}
/** Shin: a light-steel piston rod sliding out of a short iron sleeve — the "idling piston" read. */
function hoistLegLower(ctx, rig, pose, inf) {
  const r = inf.r + 1, L = inf.len, pal = inf.pal;
  celCapsule(ctx, rig, 0, 3, 0, L + 2, r * 0.72, pal.metal, 0.3);
  celRect(ctx, rig, -r, -3, r * 2, 8, 3, pal.secondary, 0.4, 0.25);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, pal.secondary).hi; ctx.fillRect(-r + 1, -2, 1, 7);
}
/** Plate foot: slate pad with a brass toe cap and a deep sole (ankle space, toe toward +x). */
function hoistFoot(ctx, rig, pose, inf) {
  const heel = R(inf.w * 0.42), toe = R(inf.w * 0.62), top = -inf.h, pal = inf.pal;
  celPoly(ctx, rig, [-heel, top, toe - 4, top, toe, top + 4, toe, 3, -heel, 3], pal.dark, 0.34, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(toe - 6, top + 1, 5, 4);
  ctx.fillStyle = tones(rig, pal.dark).deep; ctx.fillRect(-heel, 1, toe + heel, 3);
}
/** Boiler, chimney and the cage's back rail (back accessory, torso space): everything behind the chassis. */
function drawBoiler(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), H = p.torsoH;
  const x0 = -hw - 12, y0 = -H - 9, w = 14, h = H + 13;
  // cage back rail behind Grubbik's shoulders
  celRect(ctx, rig, -hw + 3, -H - 28, R(p.torsoW * 0.8), 4, 1, IRON, 0.4, 0);
  celRect(ctx, rig, x0 + 3, y0 - 15, 8, 16, 1, IRON, 0.4, 0.2);
  celRect(ctx, rig, x0 + 1, y0 - 18, 12, 4, 1, BRASSY, 0.4, 0);
  celRect(ctx, rig, x0, y0, w, h, 6, IRON, 0.38, 0.28);
  if (rig.override) return;
  const tb = tones(rig, BRASSY);
  ctx.fillStyle = tb.base; ctx.fillRect(x0, y0 + 5, w, 4); ctx.fillRect(x0, y0 + h - 10, w, 4);
  ctx.fillStyle = tb.sh; ctx.fillRect(x0, y0 + 9, w, 1); ctx.fillRect(x0, y0 + h - 6, w, 1);
  // fire window: dark slot, flame, hot core pulsing on rig.tick (red and always hot while overheating)
  const hot = rig.overheat || (rig.tick % 20) < 10;
  const fy = y0 + h - 15;
  ctx.fillStyle = rig.col(DARKSLOT); ctx.fillRect(x0 + 2, fy, 10, 9);
  ctx.fillStyle = rig.col(rig.overheat ? RED : FIRE); ctx.fillRect(x0 + 3, fy + 1, 8, 7);
  ctx.fillStyle = rig.col(HOT); if (hot) ctx.fillRect(x0 + 4, fy + 2, 6, 5); else ctx.fillRect(x0 + 5, fy + 3, 4, 3);
  // smoke column out of the chimney (thicker and faster while overheating)
  const big = rig.overheat ? 1.7 : 1, f = rig.tick % 20, k = f / 20;
  ctx.fillStyle = tones(rig, rig.overheat ? '#6A5A58' : STEAM).base;
  puff(ctx, x0 + 7 - k * 4, y0 - 22 - k * 16 * big, (2 + k * 4) * big, 0.6 - k * 0.5);
  if (f > 9) { const k2 = (f - 9) / 20; puff(ctx, x0 + 7 - k2 * 3, y0 - 20 - k2 * 11 * big, (1.5 + k2 * 3) * big, 0.45 - k2 * 0.4); }
}
/**
 * Open cockpit cage (torso accessory, front layer): brass floor sill, two frame posts and a front rail hinged on the near
 * post. pose.grip swings the rail open — the overheat stall, where the cockpit is grabbable for 3x damage.
 */
function drawCage(ctx, rig, pose) {
  const p = rig.p, hw = R(p.torsoW / 2), H = p.torsoH, top = -H - 27, open = pose.grip || 0;
  // dark iron uprights either side of the cockpit notch, brass capped: they frame Grubbik, never cross him.
  // Both posts are ONE cel path (two subpaths, one outline stroke, one clip): they are the same iron at the same
  // depth lit by the same lamp, so a single shadow half-plane across the pair is the correct read and it pays for
  // the arm and knee collars now carrying their outlines (ART_STYLE section 9 draw budget).
  ctx.beginPath();
  ctx.rect(R(hw - 4), R(top), 5, R(-top - H - 6));
  ctx.rect(R(-hw - 1), R(top + 5), 5, R(-top - H - 11));
  celPath(ctx, rig, IRON, 0, R(top + (-H - 6) / 2), Math.hypot(p.torsoW + 6, -top - H - 6) / 2, 0.4, 0.2);
  if (!rig.override) {
    const tb = tones(rig, BRASSY);
    ctx.fillStyle = tb.base; ctx.fillRect(hw - 5, top, 7, 3); ctx.fillRect(-hw - 2, top + 5, 7, 3);
  }
  drawBeacon(ctx, rig, hw - 2, top - 3);
  // cockpit hatch across the front of the notch; pose.grip drops it open (the overheat stall)
  ctx.save(); ctx.translate(hw - 6, -H + 5); ctx.rotate(rad(-open * 105));
  celRect(ctx, rig, -p.torsoW + 11, -7, p.torsoW - 11, 7, 2, IRON, 0.4, 0.2);
  if (!rig.override) { ctx.fillStyle = tones(rig, BRASSY).base; ctx.fillRect(-p.torsoW + 12, -7, p.torsoW - 13, 3); }
  ctx.restore();
  if (rig.override) return;
  // open hatch + stall: four hot corner brackets blink around the cockpit mouth (grab me) without masking his face
  if (open > 0.4 && rig.stalled && (rig.tick & 4)) {
    const x0 = -hw + 2, x1 = hw - 2, y0 = top + 2, y1 = -H - 2;
    ctx.fillStyle = rig.col(HOT);
    ctx.fillRect(x0, y0, 7, 2); ctx.fillRect(x0, y0, 2, 7); ctx.fillRect(x1 - 7, y0, 7, 2); ctx.fillRect(x1 - 2, y0, 2, 7);
    ctx.fillRect(x0, y1 - 2, 7, 2); ctx.fillRect(x0, y1 - 7, 2, 7); ctx.fillRect(x1 - 7, y1 - 2, 7, 2); ctx.fillRect(x1 - 2, y1 - 7, 2, 7);
  }
}
/** Cockpit seat plate at the top of the chassis (neck space) — Grubbik sits on this, not on a bare neck. */
function hoistSeat(ctx, rig) { ctx.beginPath(); ctx.rect(-9, -3, 18, 6); flat(ctx, rig, IRON); }
/** Grubbik in the cockpit: his waistcoat and one green arm on the brass control lever, then the goblin skull. Head space. */
function hoistCockpit(ctx, rig, pose, inf) {
  const r = inf.r, by = R(r * 0.72), pull = rig.lever ? 1 : 0;
  celRect(ctx, rig, -9, by, 16, 12, 4, SHIRT, 0.34, 0.3);
  celPoly(ctx, rig, [-9, by + 2, -5, by, 1, by + 6, 6, by, 7, by + 3, 7, by + 12, -9, by + 12], BAND, 0.38, 0.24);
  const hx = R(r * 1.8) - pull * 5, hy = by + 4 + pull * 5;
  celCapsule(ctx, rig, 6, by + 4, hx, hy, 3, GOB.skin, 0);
  celBall(ctx, rig, hx, hy, 3, GOB.skin, false);
  ctx.save(); ctx.translate(R(r * 1.75), by + 8); ctx.rotate(rad(pull * 40));
  ctx.beginPath(); ctx.rect(-1.5, -10, 3, 10); flat(ctx, rig, BRASSY);
  ctx.restore();
  if (!rig.override) {
    ctx.fillStyle = rig.col(HAT); ctx.fillRect(-2, by + 1, 5, 4);
    ctx.fillStyle = rig.col(BRASSY); ctx.fillRect(-7, by + 6, 3, 3);
  }
  gobHead(ctx, rig, pose, inf);
}

const HOISTER_BUILD = {
  scale: 1.9, palette: HOISTER_PAL, outline: OL, outlineWidth: 1, ramp: { sh: 0.6 }, thinR: 5, hiMin: 7, contactShadow: true, smearColor: STEEL,
  proportions: { headR: 8, neck: 10, torsoW: 30, torsoH: 22, hip: 26, upperArm: 13, lowerArm: 12, armR: 6, handR: 5, upperLeg: 10, lowerLeg: 10, legR: 6, footL: 14, footH: 6, shoulderX: 15, hipX: 8, bulge: 0, neckR: 3 },
  parts: { torso: hoistChassis, hips: hoistHips, neck: hoistSeat, head: hoistCockpit, face: gobFace, hat: grubGear, shoulder: hoistShoulder,
    armUpper: hoistArmUpper, armLower: hoistArmLower, hand: hoistClaw, legUpper: hoistLegUpper, legLower: hoistLegLower, foot: hoistFoot },
  accessories: [{ attach: 'back', draw: drawBoiler }, { attach: 'torso', draw: drawCage }],
};

// ---------------------------------------------------------------- Hoister animations
const HC = { armR: [58, -8], armL: [-57, 22], weapon: -90, torso: 3, head: 0, legR: [7, 2], legL: [-7, 2], grip: 0, handL: 0 };
const HBASE = makeBrassBase(HC);
const HD = (t, y) => ({ kind: 'dust', x: t, y: y || 0, count: 2 });
/** Chassis walk key: heavy contact / down / pass / up, dust on the two down keys. */
const hw8 = (lr, ll, aR, aL, ty, sq) => ({ ...HC, legR: lr, legL: ll, armR: aR, armL: aL, torso: 5, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1 });

const CLAW_BOX = frontBox(100, hitOf(22, 'knockdown', 6, 4, 16));
const POUND_HIT = { damage: 18, type: 'knockdown', kbX: 5, kbY: 5, hitstun: 16, once: true };
const CRATE_SPEC = { fromSky: true, aimAt: true, style: 'crate', height: 230, gravity: 0.55, life: 200, damage: 24, type: 'knockdown', kbX: 4, kbY: 5, radius: 60, color: '#9a7040', r: 12, muzzle: false, draw: drawCrate };
const HOOK_SPEC = { style: 'claw', chained: true, speed: 6, maxDist: 320, damage: 30, type: 'knockdown', kbX: -4, kbY: 4, hitstun: 24, offsetX: 40, offsetY: 50, color: STEEL, r: 9, life: 70, muzzle: false, draw: drawHookShot };

const hoisterAnims = {
  ...HBASE,
  // idle: the pistons breathe, the chassis rocks 3 deg and the boiler chuffs (drawBoiler / rig.tick)
  idle: { loop: true, frames: [
    FK(14, { ...HC, torso: 3, root: [0, 0], legR: [7, 2], legL: [-7, 2] }, { ease: 'inout' }),
    FK(12, { ...HC, torso: 5, head: 2, root: [0, 1], armR: [60, -10], armL: [-55, 25], legR: [8, 4], legL: [-8, 4], squash: 1.01, stretch: 0.99 }, { ease: 'inout' }),
    FK(14, { ...HC, torso: 4, head: 1, root: [0, 1], armR: [57, -6], armL: [-58, 23], legR: [7, 3], legL: [-7, 3] }, { ease: 'inout' }),
    FK(12, { ...HC, torso: 2, head: -1, root: [0, 0], armR: [59, -9], armL: [-60, 20], legR: [6, 1], legL: [-6, 1] }, { ease: 'inout' }),
  ] },
  // walk: eight keys of loader stomp, root +2 and squash on the down keys, dust off the landing foot
  walk: { loop: true, frames: [
    FK(5, hw8([30, 2], [-24, 20], [66, -12], [-34, 24], 0), { ease: 'out' }),
    FK(5, hw8([22, 12], [-14, 34], [60, -8], [-28, 26], 2, 1.04), { ease: 'out', fx: [HD(-14)], sfx: 'piston' }),
    FK(5, hw8([6, 26], [2, 12], [54, -4], [-40, 24], 1), { ease: 'inout' }),
    FK(5, hw8([-10, 14], [18, 0], [50, -6], [-54, 22], -1), { ease: 'in' }),
    FK(5, hw8([-24, 20], [30, 2], [48, -8], [-60, 20], 0), { ease: 'out' }),
    FK(5, hw8([-14, 34], [22, 12], [52, -10], [-56, 22], 2, 1.04), { ease: 'out', fx: [HD(16)], sfx: 'piston' }),
    FK(5, hw8([2, 12], [6, 26], [58, -10], [-46, 24], 1), { ease: 'inout' }),
    FK(5, hw8([18, 0], [-10, 14], [64, -12], [-38, 24], -1), { ease: 'in' }),
  ] },
  // hurt: the chassis rocks back on its heels, the claw flies wide, steam spits from a joint
  hurt: { loop: false, frames: [
    FK(4, { ...HC, torso: -14, head: -10, armR: [30, 30], armL: [-72, 10], root: [-5, 1], legR: [18, 6], legL: [-14, 10], face: 'hurt' }, { ease: 'out', fx: [{ kind: 'steam', x: -10, y: 50, count: 2 }] }),
    FK(10, { ...HC, torso: -6, head: -5, armR: [44, 8], armL: [-60, 18], root: [-2, 1], legR: [12, 4], legL: [-10, 6], face: 'hurt' }, { ease: 'out' }),
    FK(6, { ...HC, torso: 3 }, { ease: 'out' }),
  ] },
  // overheat stall (enterStall plays 'stagger'): the frame judders, the cage bangs open and Grubbik ducks — the punish window
  stagger: { loop: true, frames: [
    FK(6, { ...HC, grip: 1, torso: -12, head: 14, armR: [26, 34], armL: [-70, 8], root: [-3, 2], legR: [20, 14], legL: [-16, 16], face: 'hurt' }, { ease: 'out', fx: [{ kind: 'steam', x: -10, y: 60, count: 3 }] }),
    FK(6, { ...HC, grip: 1, torso: 6, head: 18, armR: [36, 20], armL: [-58, 16], root: [3, 1], legR: [16, 16], legL: [-12, 14], face: 'hurt' }, { ease: 'out' }),
    FK(6, { ...HC, grip: 1, torso: -8, head: 12, armR: [28, 32], armL: [-68, 10], root: [-3, 2], legR: [22, 12], legL: [-18, 18], face: 'dazed' }, { ease: 'out', fx: [{ kind: 'steam', x: 12, y: 46, count: 3 }] }),
    FK(6, { ...HC, grip: 1, torso: 4, head: 16, armR: [34, 24], armL: [-62, 14], root: [2, 1], legR: [18, 14], legL: [-14, 16], face: 'dazed' }, { ease: 'out' }),
  ] },
  // 1. Claw Sweep — 24f tell (claw hauled back over the shoulder, jaws yawning), 10f active through a 100px arc, 30f stuck-claw punish
  clawSweep: { loop: false, frames: [
    FK(14, { ...HC, armR: [-58, -22], armL: [-56, 16], torso: -10, head: -6, root: [-3, 0], legR: [11, 6], legL: [-15, 8], face: 'angry' }, { tell: true, sfx: 'hydraulic', ease: 'in' }),
    FK(10, { ...HC, armR: [-80, -22], armL: [-62, 14], torso: -16, head: -9, root: [-6, 0], squash: 0.97, stretch: 1.03, legR: [9, 6], legL: [-17, 10], face: 'angry' }, { tell: true, ease: 'out' }),
    FK(3, { ...HC, armR: [92, 8], armL: [-24, 26], torso: 24, head: 7, root: [5, 2], squash: 1.05, stretch: 0.95, legR: [32, 12], legL: [-26, 22], face: 'shout' },
      { hitbox: CLAW_BOX, smear: { from: -150, to: 12, a: 0.55, r: 78 }, sfx: 'hammer_swing', hitSfx: 'hit_heavy', fx: [{ kind: 'slash', x: 60, y: 50, radius: 60, angle: 10 }], ease: 'overshoot' }),
    FK(7, { ...HC, armR: [100, 12], armL: [-26, 26], torso: 27, head: 7, root: [6, 3], legR: [34, 12], legL: [-28, 24], face: 'shout' }, { hitbox: CLAW_BOX, hitSfx: 'hit_heavy', ease: 'out' }),
    FK(30, { ...HC, armR: [42, 4], armL: [-34, 24], torso: 22, head: 4, root: [5, 3], legR: [30, 12], legL: [-24, 22], face: 'grit' }, { punish: true, ease: 'inout', fx: [HD(52)] }),
    FK(6, { ...HC, torso: 6 }, { ease: 'out' }),
  ] },
  // 2. Ground Pound — 30f tell with both arms overhead, 6f slam, r60 shockwave, 34f punish
  groundPound: { loop: false, frames: [
    FK(18, { ...HC, armR: [-150, -20], armL: [-160, -14], torso: -12, head: -8, root: [0, 2], legR: [12, 8], legL: [-14, 8], face: 'angry' }, { tell: true, sfx: 'hydraulic', ease: 'in' }),
    FK(12, { ...HC, armR: [-174, -22], armL: [-180, -16], torso: -18, head: -12, root: [0, -3], squash: 0.95, stretch: 1.06, legR: [10, 4], legL: [-12, 4], face: 'angry' }, { tell: true, ease: 'out' }),
    FK(6, { ...HC, armR: [18, 10], armL: [14, 14], torso: 30, head: 8, root: [2, 6], squash: 1.1, stretch: 0.9, legR: [42, 34], legL: [-32, 34], face: 'shout' },
      { event: 'shockwave', radius: 60, hit: POUND_HIT, shake: 12, sfx: 'piston_crush', smear: { from: -170, to: 60, a: 0.5, r: 70 }, fx: [{ kind: 'dust', x: 20, y: 0, count: 9 }, { kind: 'ring', x: 16, y: 0, r0: 6, r1: 60, flat: true, color: HOT }], ease: 'overshoot' }),
    FK(34, { ...HC, armR: [22, 8], armL: [18, 12], torso: 24, head: 5, root: [2, 5], legR: [38, 32], legL: [-28, 32], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...HC, torso: 6 }, { ease: 'out' }),
  ] },
  // 3. Crate Drop — Grubbik hauls the cockpit lever 40f (the claw swings up as a crane) then the crate falls on the target
  crateDrop: { loop: false, frames: [
    FK(24, { ...HC, armR: [-130, -30], armL: [-52, 16], torso: -6, head: 10, root: [-2, 0], legR: [10, 6], legL: [-12, 6], face: 'angry' }, { tell: true, sfx: 'crate_drop', event: 'aim', ease: 'in' }),
    FK(16, { ...HC, armR: [-152, -26], armL: [-56, 14], torso: -10, head: 14, root: [-4, 0], squash: 0.98, stretch: 1.02, legR: [8, 6], legL: [-14, 8], face: 'grit' }, { tell: true, ease: 'out' }),
    FK(6, { ...HC, armR: [-178, -6], armL: [-64, 18], torso: -4, head: -6, root: [2, -2], squash: 0.96, stretch: 1.05, legR: [14, 8], legL: [-16, 10], face: 'shout' },
      { event: 'crateDrop', projectile: CRATE_SPEC, sfx: 'hydraulic', fx: [{ kind: 'steam', x: -12, y: 74, count: 4 }], ease: 'overshoot' }),
    FK(30, { ...HC, armR: [-156, -14], armL: [-58, 18], torso: 2, head: -2, root: [0, 1], legR: [10, 6], legL: [-12, 6], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...HC, torso: 6 }, { ease: 'out' }),
  ] },
  // 4. Hook Yank (phase 2) — 20f rattling, glowing tell on the far arm, then the hook fires down the lane on its chain
  hookYank: { loop: false, frames: [
    FK(12, { ...HC, armL: [-96, -6], armR: [50, 6], torso: -8, head: -6, root: [-3, 0], legR: [12, 6], legL: [-16, 8], face: 'angry' }, { tell: true, sfx: 'hook_yank', ease: 'in' }),
    FK(8, { ...HC, armL: [-120, -4], armR: [46, 10], torso: -13, head: -8, root: [-5, 0], squash: 0.97, stretch: 1.03, legR: [10, 6], legL: [-18, 10], face: 'angry' }, { tell: true, ease: 'out' }),
    FK(8, { ...HC, armL: [64, 16], armR: [54, 2], torso: 20, head: 6, root: [5, 1], squash: 1.04, stretch: 0.96, legR: [30, 10], legL: [-24, 22], face: 'shout' },
      { event: 'spawnProjectile', projectile: HOOK_SPEC, sfx: 'hook_yank', fx: [{ kind: 'slash', x: 46, y: 48, radius: 20, angle: 0, sweep: 40 }], ease: 'overshoot' }),
    FK(40, { ...HC, armL: [56, 20], armR: [56, 0], torso: 14, head: 2, root: [4, 1], legR: [26, 10], legL: [-20, 20], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...HC, torso: 6 }, { ease: 'out' }),
  ] },
  // intro: the loader settles, Grubbik lifts his stovepipe (pose.handL.rot) and the boiler roars
  intro: { loop: false, frames: [
    FK(30, { ...HC, torso: -4, head: -3, root: [0, 2], legR: [14, 10], legL: [-14, 10], squash: 1.05, stretch: 0.95 }, { sfx: 'hydraulic', ease: 'out' }),
    FK(26, { ...HC, handL: 46, torso: -2, head: -6, root: [0, 0], armR: [-40, 20], armL: [-120, 10], face: 'happy' }, { sfx: 'roar', ease: 'inout', fx: [{ kind: 'steam', x: -14, y: 96, count: 6 }] }),
    FK(24, { ...HC, handL: 40, torso: 6, head: 4, armR: [50, -4], armL: [-60, 20], face: 'happy' }, { ease: 'inout' }),
    FK(20, { ...HC }, { ease: 'out' }),
  ] },
  // phase change into OVERHEAT: a valve blows, the chassis judders and the boiler runs red
  phaseChange: { loop: false, frames: [
    FK(16, { ...HC, torso: -12, head: -10, armR: [10, 54], armL: [-44, 4], root: [-5, 2], legR: [18, 12], legL: [-16, 12], face: 'hurt' }, { sfx: 'explosion', ease: 'out', fx: [{ kind: 'steam', x: -14, y: 74, count: 8 }] }),
    FK(16, { ...HC, torso: 10, head: 8, armR: [44, 10], armL: [-58, 18], root: [5, 2], legR: [14, 14], legL: [-12, 12], face: 'angry' }, { ease: 'out', fx: [{ kind: 'ring', x: 0, y: 60, r0: 8, r1: 70, color: RED }] }),
    FK(14, { ...HC, torso: -6, head: -4, armR: [-50, 20], armL: [-70, 14], root: [-3, -2], squash: 0.96, stretch: 1.05, face: 'shout' }, { sfx: 'roar', ease: 'inout' }),
    FK(14, { ...HC, torso: 4 }, { ease: 'out' }),
  ] },
  // defeat: the legs buckle over 30f, three boiler pops, then the wreck lies over on its side
  defeat: { loop: false, frames: [
    FK(16, { ...HC, torso: -14, head: -12, armR: [24, 34], armL: [-74, 10], root: [-4, 2], legR: [16, 16], legL: [-14, 14], face: 'hurt' }, { sfx: 'explosion', ease: 'out', fx: [{ kind: 'steam', x: -12, y: 80, count: 8 }] }),
    FK(16, { ...HC, grip: 1, torso: 12, head: 14, armR: [40, 26], armL: [-30, 26], root: [4, 8, 8], legR: [42, 40], legL: [-30, 46], squash: 1.08, stretch: 0.92, face: 'dazed' }, { sfx: 'explosion', ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }] }),
    FK(20, { ...HC, grip: 1, torso: 22, head: 18, armR: [56, 20], armL: [10, 30], root: [8, 14, 18], legR: [58, 50], legL: [-38, 56], face: 'dazed' }, { sfx: 'explosion_big', ease: 'in', fx: [{ kind: 'steam', x: 0, y: 70, count: 10 }] }),
    FK(60, { ...HC, grip: 1, torso: 26, head: 20, armR: [62, 16], armL: [22, 28], root: [10, 18, 25], legR: [64, 54], legL: [-42, 60], face: 'dazed' }, { ease: 'out' }),
  ] },
};
hoisterAnims.flee = hoisterAnims.walk;

// ---------------------------------------------------------------- projectile art
const JS = { x: 0, y: 0 };
/** Hazard cargo crate: crating brown box with an orange hazard band, black ticks and brass corners. */
function drawCrate(ctx, p, sx, sy) {
  const r = p.r, x = sx - r, y = sy - r * 2;
  rrect(ctx, x, y, r * 2, r * 2, 2, '#9A6A38', OL, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x + 1, y + r + 1, r * 2 - 2, r - 2);
  ctx.fillStyle = HAZ; ctx.fillRect(x + 1, y + r - 4, r * 2 - 2, 7);
  ctx.fillStyle = STRIPE;
  for (let i = 0; i < 4; i++) { const bx = x + 2 + i * 6; ctx.beginPath(); ctx.moveTo(bx, y + r - 4); ctx.lineTo(bx + 3, y + r - 4); ctx.lineTo(bx - 1, y + r + 3); ctx.lineTo(bx - 4, y + r + 3); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = BRASSY; ctx.fillRect(x + 1, y + 1, 4, 4); ctx.fillRect(x + r * 2 - 5, y + 1, 4, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x + 2, y + 1, r * 2 - 4, 1);
}
/** Hook Yank shot: the chain runs back to the Hoister's far hand, the barbed hook head spins on the way out. */
function drawHookShot(ctx, p, sx, sy) {
  const cy = sy - p.r;
  if (p.owner && p.owner.rig) {
    jointScreen(p.owner.rig, 'handF', JS);
    ctx.lineCap = 'round';
    ctx.strokeStyle = SLATE; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(JS.x, JS.y); ctx.lineTo(sx, cy); ctx.stroke();
    ctx.strokeStyle = LINK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(JS.x, JS.y); ctx.lineTo(sx, cy); ctx.stroke();
    ctx.strokeStyle = '#9AA4B4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(JS.x, JS.y - 1); ctx.lineTo(sx, cy - 1); ctx.stroke();
  }
  ctx.save(); ctx.translate(sx, cy); ctx.scale(p.facing, 1);
  pathPoly(ctx, [-9, -4, -1, -4, 4, -9, 11, -2, 9, 7, 1, 11, -5, 6, 1, 5, 5, 7, 6, 0, 0, 2, -9, 4]);
  paint(ctx, STEEL, OL, 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-7, -3, 8, 2);
  ctx.restore();
}

// ================================================================ Grubbik on foot (goblin rig, GDD 5.1 phase 2)
// Grubbik's green tracks the Sootborn push (sootborn.js / common.js GOB.skin): hue 97 and Oklab L* held to within
// 1 L*, chroma only, so the Foreman still reads as the biggest goblin in the room and not as a different species.
// #7AA848 -> #6BB83A is s57 -> s68; the hair follows it so the head does not separate from its own shadow.
const GRUBBIK_PAL = { ...GOB_PAL, skin: '#6BB83A', hair: '#3D6B18', primary: BAND, sleeve: SHIRT, secondary: '#6BB83A', accent: BRASSY, metal: GOB.scrap, dark: SHORTS, glow: GOB.eye };
/** Foreman's whip: brass-ferruled grip; the lash is coiled at rest (it lags on a chain) and snaps straight while pose.grip > 0.5. */
function drawWhip(ctx, rig, pose) {
  celRect(ctx, rig, -5, -2.5, 14, 5, 1, '#4A3020', 0.4, 0);
  if (rig.override) return;
  ctx.fillStyle = rig.col(BRASSY); ctx.fillRect(-5, -2, 4, 4);
  ctx.strokeStyle = rig.col('#5A4028'); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if ((pose.grip || 0) > 0.5) {
    ctx.beginPath(); ctx.moveTo(9, 0);
    for (let i = 1; i <= 6; i++) ctx.lineTo(9 + i * 7.5, Math.sin(i * 1.5 + rig.tick * 0.9) * (1 + i * 0.4));
    ctx.stroke();
    ctx.fillStyle = rig.col(GOB.wrap); ctx.fillRect(52, -2, 3, 3);
    return;
  }
  const ch = getChain(rig, 'whip', 2, { joint: 'torso', rest: [0, 1], stiffness: 0.16, damping: 0.68, gain: 1.6, rotGain: 0.4, maxAng: 30 });
  ctx.save(); ctx.translate(8, 0); ctx.rotate(rad(rig.joints.armN.hand - 90 - pose.weapon.rot + ch.ang[0]));
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, 4 + i * 3.5, 6 - i * 1.2, 3, 0, 0, TAU); ctx.stroke(); }
  ctx.rotate(rad(ch.ang[1]));
  ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(4, 15); ctx.lineTo(-2, 18); ctx.stroke();
  ctx.restore();
}
/** Net in the off hand: a rope bundle at rest, an open spinning disc through the throw tell, gone once thrown (handL accessory). */
function drawNetHand(ctx, rig) {
  if (rig.netThrown) return;
  if (!rig.netSpin) {
    celRect(ctx, rig, 2, -4, 9, 12, 4, '#C8B070', 0.4, 0);
    if (!rig.override) { ctx.fillStyle = tones(rig, '#C8B070').deep; ctx.fillRect(4, -2, 1, 8); ctx.fillRect(8, -3, 1, 9); }
    return;
  }
  ctx.save(); ctx.translate(15, 0); ctx.rotate(rig.tick * 0.9);
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.strokeStyle = rig.col(rig.outline); ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = rig.col('#C8B070'); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let k = -2; k <= 2; k++) { ctx.moveTo(k * 5, -13); ctx.lineTo(k * 5, 13); ctx.moveTo(-13, k * 5); ctx.lineTo(13, k * 5); }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.stroke();
  ctx.restore();
}
/** Foreman's coal-scrip ledger hanging off the hip (hip accessory) — the goblin who sells his own clans. */
function drawLedger(ctx, rig) {
  const hw = R(rig.p.hip / 2);
  celRect(ctx, rig, -hw - 9, -6, 11, 13, 2, '#5A3A22', 0.4, 0.25);
  if (rig.override) return;
  ctx.fillStyle = rig.col('#D9CDAE'); ctx.fillRect(-hw - 7, -4, 8, 9);
  ctx.fillStyle = tones(rig, '#D9CDAE').sh; ctx.fillRect(-hw - 7, 2, 8, 2);
  band(ctx, rig, -hw - 9, -2, 11, 4, BRASSY, 1);   // brass clasp on leather: a material change, widened 2 -> 4 to take ink
}
const GRUBBIK_BUILD = {
  scale: 1.0, palette: GRUBBIK_PAL, outline: GOB.outline, outlineWidth: 1, thinR: 4, contactShadow: true, clan: BAND, smearColor: '#E8D8A0',
  gob: { tunic: 'waistcoat', shirt: SHIRT, shorts: SHORTS },
  proportions: { ...GOB_PROPS, headR: 11, neck: 2, torsoW: 22, torsoH: 22, hip: 18, upperArm: 15, lowerArm: 14, armR: 4.2, handR: 5, upperLeg: 11, lowerLeg: 10, legR: 5, footL: 10, footH: 5 },
  parts: { ...GOB_PARTS, armLower: gobCuffArm, hat: grubGear },
  weapon: { attach: 'handR', length: 56, draw: drawWhip, headAt: 30 },
  accessories: [{ attach: 'hip', draw: drawLedger }, { attach: 'handL', draw: drawNetHand }],
};

// ---------------------------------------------------------------- Grubbik animations (hunched goblin base + his four moves)
const HUNCH = 15;
const GC = { armR: [26, 30], weapon: 0, armL: [-30, -18], grip: 0, handL: 0 };
const K = (s) => ({ torso: HUNCH, head: -7, legR: [8, 4], legL: [-8, 6], ...GC, ...s });
const AD = (a, du, dl) => [a[0] + du, a[1] + dl];
const gw = (lr, ll, al, ty, sq, hd) => K({ legR: lr, legL: ll, armL: al, armR: AD(GC.armR, 3, -3), torso: HUNCH + 3, head: -7 + (hd || 0), root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1 });
const gr = (lr, ll, al, ty, sq) => K({ legR: lr, legL: ll, armL: al, armR: AD(GC.armR, -16, -8), torso: HUNCH + 18, head: -14, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, face: 'angry' });
const GFLOOR = { armR: [-20, -6], weapon: -10, armL: [30, 20], torso: 2, head: -12, legR: [12, 10], legL: [-4, 8], root: [24, -8, -88], grip: 0, handL: 0 };
const NET_SPEC = { style: 'net', speed: 5, damage: 4, type: 'medium', kbX: 0, hitstun: 70, maxDist: 220, life: 80, offsetX: 16, offsetY: 50, color: '#c8b070', r: 10, muzzle: false };
const HAT_SPEC = { style: 'hat', speed: 5, damage: 8, type: 'medium', kbX: 3, hitstun: 16, maxDist: 220, life: 90, offsetX: 10, offsetY: 60, color: HAT, r: 8, muzzle: false, pierce: 2 };
const WHIP_BOX = frontBox(60, hitOf(8, 'medium', 3, 0, 18), { high: true });

const grubbikAnims = {
  idle: { loop: true, frames: [
    FK(14, K({ root: [0, 0] }), { ease: 'inout' }),
    FK(12, K({ torso: HUNCH + 3, head: -4, root: [0, 1], armL: AD(GC.armL, 4, 2), armR: AD(GC.armR, 2, -2), squash: 1.02, stretch: 0.98 }), { ease: 'inout' }),
    FK(14, K({ torso: HUNCH + 1, head: [-9, -1, 0], root: [0, 0], armR: AD(GC.armR, 1, -1) }), { ease: 'inout' }),
    FK(12, K({ torso: HUNCH - 1, head: [-5, 1, 0], root: [0, 0], armL: AD(GC.armL, -4, -2), armR: AD(GC.armR, -1, 1) }), { ease: 'inout' }),
  ] },
  walk: { loop: true, frames: [
    FK(4, gw([30, 4], [-24, 16], [10, -6], 0, 0, 0), { ease: 'out' }),
    FK(4, gw([22, 12], [-14, 28], [4, -8], 2, 1.04, 2), { ease: 'out' }),
    FK(4, gw([6, 24], [2, 10], [-10, -10], 1, 0, 1), { ease: 'inout' }),
    FK(4, gw([-10, 12], [18, -2], [-26, -12], -1, 0, -2), { ease: 'in' }),
    FK(4, gw([-24, 16], [30, 4], [-40, -14], 0, 0, 0), { ease: 'out' }),
    FK(4, gw([-14, 28], [22, 12], [-34, -14], 2, 1.04, 2), { ease: 'out' }),
    FK(4, gw([2, 10], [6, 24], [-20, -12], 1, 0, 1), { ease: 'inout' }),
    FK(4, gw([18, -2], [-10, 12], [-4, -8], -1, 0, -2), { ease: 'in' }),
  ] },
  run: { loop: true, frames: [
    FK(3, gr([54, 14], [-42, 58], [44, -50], -2), { ease: 'out' }),
    FK(3, gr([42, 30], [-30, 72], [24, -46], 1, 1.05), { ease: 'out' }),
    FK(3, gr([10, 42], [10, 30], [-10, -40], -4), { ease: 'inout' }),
    FK(3, gr([-24, 52], [40, 8], [-44, -40], -3), { ease: 'in' }),
    FK(3, gr([-42, 58], [54, 14], [-56, -44], -2), { ease: 'out' }),
    FK(3, gr([-30, 72], [42, 30], [-40, -46], 1, 1.05), { ease: 'out' }),
    FK(3, gr([10, 30], [10, 42], [0, -46], -4), { ease: 'inout' }),
    FK(3, gr([40, 8], [-24, 52], [30, -50], -3), { ease: 'in' }),
  ] },
  jump: { loop: false, frames: [
    FK(3, K({ legR: [30, 40], legL: [-20, 44], torso: HUNCH + 10, root: [0, 4], squash: 1.1, stretch: 0.9, armL: [-30, 30] }), { ease: 'out' }),
    FK(30, K({ legR: [40, -70], legL: [20, -50], torso: HUNCH - 8, armL: [-50, -20], head: -10, squash: 0.96, stretch: 1.05 }), { ease: 'inout' }),
  ] },
  fall: { loop: true, frames: [
    FK(10, K({ legR: [26, -32], legL: [8, -22], armL: [-80, -30], torso: 2, head: -12, face: 'hurt' }), { ease: 'inout' }),
    FK(10, K({ legR: [32, -42], legL: [4, -16], armL: [-96, -30], torso: -2, head: -14, face: 'hurt' }), { ease: 'inout' }),
  ] },
  land: { loop: false, frames: [
    FK(3, K({ legR: [34, 46], legL: [-24, 48], torso: HUNCH + 12, head: 0, root: [0, 3], squash: 1.16, stretch: 0.86 }), { ease: 'out' }),
    FK(5, K({ legR: [14, 16], legL: [-10, 18], torso: HUNCH + 4, root: [0, 1], squash: 1.02, stretch: 0.98 }), { ease: 'out' }),
  ] },
  hurt: { loop: false, frames: [
    FK(4, K({ torso: -16, head: -24, armL: [-64, -30], armR: [10, 60], weapon: -30, root: [-5, 1], legR: [22, 4], legL: [-14, 12], face: 'hurt' }), { ease: 'out' }),
    FK(10, K({ torso: 2, head: -14, armL: [-36, -14], armR: [18, 46], weapon: -14, root: [-2, 1], legR: [14, 2], legL: [-10, 8], face: 'hurt' }), { ease: 'out' }),
    FK(6, K({ torso: HUNCH }), { ease: 'out' }),
  ] },
  stagger: { loop: true, frames: [
    FK(6, K({ torso: -6, head: -14, root: [-2, 2], armR: [8, 50], armL: [-24, 6], legR: [16, 12], legL: [-14, 14], face: 'hurt' }), { ease: 'out' }),
    FK(6, K({ torso: 10, head: 6, root: [2, 1], armR: [18, 44], armL: [-12, 12], legR: [14, 14], legL: [-10, 12], face: 'dazed' }), { ease: 'out' }),
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
    FK(16, { ...GFLOOR, face: 'hurt' }, { ease: 'inout' }),
    FK(16, { ...GFLOOR, torso: 6, head: -15, legR: [14, 12], face: 'hurt' }, { ease: 'inout' }),
  ] },
  getup: { loop: false, frames: [
    FK(8, { ...GFLOOR, face: 'hurt' }, { ease: 'in' }),
    FK(8, { armR: [60, 40], weapon: 30, armL: [-30, 40], torso: 34, head: -12, legR: [70, 60], legL: [-20, 60], root: [8, 4, -20], squash: 1.06, stretch: 0.94, face: 'angry' }, { ease: 'out' }),
    FK(6, K({ torso: HUNCH + 4, root: [0, 1], legR: [15, 20], legL: [-10, 15] }), { ease: 'out' }),
  ] },
  dead: { loop: false, frames: [
    FK(8, { ...GFLOOR, torso: 8, head: -18, legR: [20, 14], legL: [-10, 12], face: 'dazed' }, { ease: 'out' }),
    FK(60, { ...GFLOOR, torso: 6, head: -16, legR: [8, 6], legL: [-6, 8], face: 'dazed' }),
  ] },
  // back-hop dodge (ai.evadeChance): duck, hop back with the coat-tails flying, land small
  dodge: { loop: false, frames: [
    FK(4, K({ torso: HUNCH + 8, root: [0, 4], legR: [30, 46], legL: [-16, 46], armL: [-40, -30], face: 'grit' }), { ease: 'in', sfx: 'dodge' }),
    FK(5, K({ torso: 4, root: [-6, -12], legR: [-30, 60], legL: [-40, 50], armR: [-30, 40], armL: [-80, -20], squash: 0.94, stretch: 1.07, face: 'grit' }), { ease: 'out' }),
    FK(5, K({ torso: 0, root: [-10, -8], legR: [-10, 50], legL: [-24, 46], armR: [-10, 44], armL: [-60, -20], face: 'grit' }), { ease: 'inout' }),
    FK(6, K({ torso: HUNCH + 6, root: [-12, 3], legR: [24, 40], legL: [-18, 40], squash: 1.06, stretch: 0.95 }), { ease: 'out' }),
  ] },
  taunt: { loop: false, frames: [
    FK(18, K({ handL: 40, armL: [-70, -60], torso: HUNCH - 4, head: -12, face: 'happy' }), { ease: 'out' }),
    FK(22, K({ handL: 55, armL: [-96, -50], torso: HUNCH - 8, head: -16, root: [0, -1], face: 'happy' }), { ease: 'inout' }),
    FK(20, K({ handL: 0, armL: [-40, -30], torso: HUNCH, head: -8, face: 'happy' }), { ease: 'out', event: 'meterGain' }),
  ] },
  win: { loop: true, frames: [
    FK(20, K({ armR: [-160, -10], weapon: -20, armL: [-20, 10], torso: HUNCH - 6, head: -10, face: 'happy' }), { ease: 'inout' }),
    FK(20, K({ armR: [-172, -20], weapon: -30, armL: [-26, 16], torso: HUNCH - 9, head: -14, root: [0, -2], face: 'happy' }), { ease: 'inout' }),
  ] },
  // whip crack: 14f arm-raised tell -> 6f snap (the lash straightens: grip 1) -> hold -> 22f punish
  whip: { loop: false, frames: [
    FK(8, K({ armR: [-150, -30], weapon: -10, armL: [30, 10], torso: 4, head: -10, root: [-2, 0], legR: [6, 6], legL: [-14, 10], face: 'angry' }), { tell: true, sfx: 'whip', ease: 'in' }),
    FK(6, K({ armR: [-166, -30], weapon: -14, armL: [36, 12], torso: -2, head: -12, root: [-4, 0], legR: [4, 6], legL: [-16, 12], squash: 0.97, stretch: 1.03, face: 'angry' }), { tell: true, ease: 'out' }),
    FK(6, K({ armR: [110, -20], weapon: 10, grip: 1, armL: [-36, 16], torso: 30, head: 4, root: [5, 1], squash: 1.04, stretch: 0.97, legR: [40, 8], legL: [-30, 30], face: 'shout' }),
      { hitbox: WHIP_BOX, smear: { from: -160, to: 10, a: 0.5, r: 74 }, fx: [{ kind: 'slash', x: 56, y: 46, radius: 22, angle: 0, sweep: 60 }], sfx: 'whip', ease: 'overshoot' }),
    FK(2, K({ armR: [114, -18], weapon: 12, grip: 1, armL: [-38, 16], torso: 32, head: 4, root: [5, 1], legR: [40, 8], legL: [-30, 30], face: 'shout' }), { ease: 'out' }),
    FK(20, K({ armR: [96, 0], weapon: 16, grip: 0.3, armL: [-30, 12], torso: 24, head: 0, root: [4, 1], legR: [34, 8], legL: [-26, 26], face: 'grit' }), { punish: true, ease: 'inout' }),
    FK(6, K({ torso: HUNCH + 4 }), { ease: 'out' }),
  ] },
  // net throw: 30f tell with the net spun overhead (handL.rot 0 -> 1000) -> throw -> 26f punish
  net: { loop: false, frames: [
    FK(6, K({ armL: [-60, -40], armR: [30, 40], torso: 6, head: -10, root: [-2, 0], legR: [8, 6], legL: [-14, 10], face: 'angry' }), { tell: true, sfx: 'net', ease: 'in' }),
    FK(12, K({ armL: [-168, -20], armR: [34, 40], torso: 0, head: -14, root: [-3, 0], legR: [10, 8], legL: [-16, 10], face: 'angry' }), { tell: true }),
    FK(12, K({ armL: [-172, -24], armR: [36, 42], torso: -2, head: -15, root: [-3, 0], legR: [10, 8], legL: [-16, 10], squash: 0.98, stretch: 1.02, face: 'grit' }), { tell: true }),
    FK(6, K({ armL: [100, -10], armR: [10, 30], torso: 28, head: 0, root: [4, 1], legR: [36, 8], legL: [-26, 24], squash: 1.04, stretch: 0.97, face: 'shout' }),
      { event: 'spawnProjectile', projectile: NET_SPEC, sfx: 'throw', ease: 'overshoot' }),
    FK(26, K({ armL: [80, 10], armR: [20, 34], torso: 22, head: -4, root: [3, 1], legR: [30, 8], legL: [-22, 22], face: 'grit' }), { punish: true, ease: 'inout' }),
    FK(6, K({ torso: HUNCH + 4 }), { ease: 'out' }),
  ] },
  // hat toss: he sweeps the stovepipe off (handL.rot lifts it) and skims it out as a boomerang
  hatToss: { loop: false, frames: [
    FK(10, K({ armL: [-80, -50], handL: 60, armR: [24, 34], torso: 2, head: -12, root: [-3, 0], legR: [8, 6], legL: [-14, 10], face: 'angry' }), { tell: true, sfx: 'whiff', ease: 'in' }),
    FK(6, K({ armL: [-120, -40], handL: 95, armR: [26, 36], torso: -4, head: -14, root: [-4, 0], squash: 0.97, stretch: 1.03, legR: [8, 6], legL: [-16, 10], face: 'grit' }), { tell: true, ease: 'out' }),
    FK(6, K({ armL: [110, -20], handL: 999, armR: [16, 32], torso: 30, head: 2, root: [5, 1], squash: 1.04, stretch: 0.97, legR: [36, 8], legL: [-26, 24], face: 'shout' }),
      { event: 'spawnProjectile', projectile: HAT_SPEC, sfx: 'throw', smear: { from: -120, to: 20, a: 0.4, r: 50 }, ease: 'overshoot' }),
    FK(24, K({ armL: [86, 0], handL: 999, armR: [22, 34], torso: 22, head: -2, root: [3, 1], legR: [30, 8], legL: [-22, 22], face: 'grit' }), { punish: true, ease: 'inout' }),
    FK(6, K({ torso: HUNCH + 4 }), { ease: 'out' }),
  ] },
  // whistle rally: two fingers in the mouth, chest out, three Cutthroats come running
  whistle: { loop: false, frames: [
    FK(18, K({ armL: [-130, -60], armR: [24, 36], torso: 2, head: -14, root: [-2, 0], legR: [8, 6], legL: [-12, 8], face: 'grit' }), { tell: true, sfx: 'soot_flee', ease: 'in' }),
    FK(12, K({ armL: [-146, -70], armR: [26, 38], torso: -6, head: -18, root: [-3, -1], squash: 0.97, stretch: 1.03, legR: [8, 6], legL: [-14, 10], face: 'shout' }), { tell: true, ease: 'out' }),
    FK(10, K({ armL: [-150, -74], armR: [30, 40], torso: -8, head: -20, root: [-2, -1], legR: [10, 6], legL: [-14, 10], face: 'shout' }),
      { event: 'summon', summon: [{ type: 'sootborn', variant: 'cutthroat' }, { type: 'sootborn', variant: 'cutthroat' }, { type: 'sootborn', variant: 'cutthroat' }], sfx: 'soot_flee' }),
    FK(30, K({ armL: [-60, -30], armR: [26, 34], torso: 10, head: -6, root: [0, 1], legR: [10, 6], legL: [-12, 8], face: 'happy' }), { punish: true, ease: 'inout' }),
    FK(6, K({ torso: HUNCH + 4 }), { ease: 'out' }),
  ] },
  // phase change: he bails out of the burning cab, lands in a crouch and dusts off the waistcoat
  phaseChange: { loop: false, frames: [
    FK(14, K({ root: [0, -34], legR: [40, -50], legL: [14, -40], armR: [-60, 30], armL: [-150, -30], torso: -6, head: -14, face: 'hurt' }), { sfx: 'soot_flee', ease: 'out' }),
    FK(10, K({ root: [-2, -12], legR: [26, -20], legL: [6, -16], armR: [-20, 40], armL: [-110, -20], torso: 6, head: -10, face: 'hurt' }), { ease: 'in' }),
    FK(10, K({ root: [0, 5], legR: [34, 48], legL: [-24, 50], torso: HUNCH + 14, head: 2, squash: 1.14, stretch: 0.88, face: 'grit' }), { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }] }),
    FK(12, K({ torso: HUNCH + 6, head: -4, root: [0, 1], legR: [16, 20], legL: [-12, 16], face: 'angry' }), { ease: 'out' }),
    FK(10, K({}), { ease: 'out' }),
  ] },
  // defeat: hat and monocle come off, he flops, then scrambles up and legs it (the badge drop is in hooks.onDeath)
  defeat: { loop: false, frames: [
    FK(20, K({ torso: -14, head: -22, armL: [-70, -60], armR: [-10, 60], weapon: -30, root: [-4, 0], legR: [24, 6], legL: [-16, 14], face: 'hurt' }), { sfx: 'soot_death', ease: 'out' }),
    FK(16, K({ torso: 26, head: -6, armR: [40, 50], armL: [20, 40], root: [0, 5], legR: [40, 44], legL: [-28, 46], squash: 1.12, stretch: 0.9, face: 'dazed' }), { ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }] }),
    FK(60, { ...GFLOOR, torso: 6, head: -16, legR: [12, 8], legL: [-8, 10], face: 'dazed' }, { ease: 'out' }),
  ] },
};
grubbikAnims.flee = grubbikAnims.run;
grubbikAnims.panic = grubbikAnims.stagger;

/** Foreman Grubbik & the Hoister definition (gameplay data unchanged; art/animation pass only). */
export const midboss = {
  id: 'midboss', type: 'midboss', variant: 'grubbik', name: 'FOREMAN GRUBBIK', subtitle: '& THE HOISTER', role: 'boss', bossKind: 'midboss', boss: true, music: 'midboss',
  build: HOISTER_BUILD, anims: hoisterAnims, score: 5000, drops: ['food_big', 'meter', 'score_big'], grabbable: false, throwDamageMult: 1,
  sfx: { hurt: 'brass_hit', death: 'boss_defeat' },
  hooks: {
    // art-only rig state: claw jaws, the hook on its chain, the stall's open cage
    onUpdate(f) {
      const rig = f.rig, a = f.anim, n = a.name;
      rig.stalled = !!f.stalled;
      rig.hookTell = n === 'hookYank';
      rig.hookOut = n === 'hookYank' && a.frameIndex >= 2 && a.frameIndex <= 3;
      rig.clawOpen = n === 'clawSweep' ? (a.frameIndex <= 1 ? 1 : 0.05) : (n === 'groundPound' || n === 'crateDrop' ? 0.12 : 0.3);
      rig.lever = n === 'crateDrop' && a.frameIndex <= 1;
      rig.netSpin = n === 'net' && a.frameIndex >= 1 && a.frameIndex <= 2;
      rig.netThrown = n === 'net' && a.frameIndex >= 3;
    },
    // the boiler lets go when the Hoister dies and Grubbik bails out (GDD 5.1 defeat spectacle)
    onPhase(f, i, world) {
      if (!world) return;
      const y = f.h * 0.55;
      if (i === 1) { particles.burst('steam', f.x, y, f.z, 10, { speed: 1.6, up: 2, sizeJitter: 2 }); particles.burst('ember', f.x, y, f.z, 8, { speed: 3, up: 2.5 }); return; }
      particles.burst('ember', f.x, y, f.z, 20, { speed: 4, up: 3.5 });
      particles.burst('smoke', f.x, y, f.z, 12, { speed: 1.4, up: 1.8, sizeJitter: 2 });
      particles.burst('gear', f.x, y, f.z, 4, { speed: 3.2, up: 4, color: BRASSY });
      world.addFx('ring', f.x, 40, f.z, { r0: 8, r1: 120, color: FIRE });
    },
  },
  ai: { attackRange: 90, zTolerance: 18, attackCooldown: [40, 80], firstAttackDelay: 40, ignoresTokens: true, retreatChance: 0, staggerEvery: 0, flank: false, tellScale: 1 },
  phases: [
    { name: 'THE HOISTER', hp: 300, color: '#E07A1F', armor: true, unlaunchable: true, walkSpeed: 1.1,
      ai: { attacks: [{ anim: 'clawSweep', range: 110, weight: 4 }, { anim: 'groundPound', range: 80, weight: 3 }, { anim: 'crateDrop', range: 400, minRange: 60, weight: 2 }] } },
    { name: 'OVERHEAT', hp: 300, color: '#FF5C5C', armor: true, unlaunchable: true, walkSpeed: 1.3, overheat: true,
      ai: { attacks: [{ anim: 'clawSweep', range: 110, weight: 3 }, { anim: 'groundPound', range: 80, weight: 3 }, { anim: 'crateDrop', range: 400, minRange: 60, weight: 2 }, { anim: 'hookYank', range: 330, minRange: 80, weight: 4 }],
        attackCooldown: [30, 60], stallEvery: 3, stallFrames: 70 } },
    { name: 'GRUBBIK', hp: 100, color: '#F2C94C', armor: false, unlaunchable: false, grabbable: true, walkSpeed: 2.4, build: GRUBBIK_BUILD, anims: grubbikAnims, damageMult: 1,
      ai: { attackRange: 56, zTolerance: 12, attacks: [{ anim: 'whip', range: 70, weight: 4 }, { anim: 'hatToss', range: 220, minRange: 60, weight: 2 }, { anim: 'whistle', range: 400, weight: 1, maxUses: 1 }],
        ranged: { anim: 'net', minRange: 80, maxRange: 220, cooldown: 240, zAlign: true, keep: 100 }, evadeChance: 0.5, evadeCooldown: 90, retreatBudget: 60, attackCooldown: [30, 70] } },
  ],
};
