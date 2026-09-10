// Final boss: Chancellor Aurelius Vane, the Aetherwright (GDD 5.2) on the cel-shaded rig pass (docs/ART_STYLE.md).
// Phase 1/2 = the REGENT ENGINE, a tripod walker bolted onto the Heart-Engine: three piston legs (near, far and a rear leg
// that walks in counter-phase, drawn in the back layer), a riveted brass barrel body with iron ribs, a 60px aether core
// window whose brass iris slides open during Core Vent, a glass cockpit dome with Vane visible inside at the levers, a
// steam-cannon far arm and a spinning gear-saw near arm. Phase 3 = VANE ON FOOT: a lean 1.15-scale figure in a near-black
// frock coat with cyan piping, cream cravat, chain-lagged grey queue, spectacles, a top hat with a brass gauge, a
// cane-sword whose blade slides out during the flurry and a clockwork left arm that pistons out 100px.
// Every state is hand-keyed (anticipation -> smear hit -> hold -> punish recovery) with secondary motion on the queue and
// coat tails. Gameplay numbers, hitboxes, events, timings, phases and AI tables are frame-for-frame unchanged.
// Rig channels used as animation data: pose.grip = core iris (Engine) / cane blade drawn (Vane); pose.handL.rot = Vane's
// clockwork fist ratchet. Rig flags set by hooks.onUpdate: sawFast, sawJam, cannonCharge, cannonVent, watch, boltTell,
// fistOut, coreT (eased core-cover opening). `face: dazed` is the "down and out" read: Vane's hat and cane drop.
import { FK, frontBox, makeBrassBase, noFace } from './common.js';
import { celRect, celBall, celPoly, celCapsule, celPath, tones, flat, rimTop, pathRR, pathCap } from '../../art/shading.js';
import { pathTaperedCapsule } from '../../art/shapes.js';
import { drawFist, drawBoot, drawSkull, drawFace } from '../../art/rigParts.js';
import { getChain } from '../../art/secondary.js';
import { FACE } from '../../art/poses.js';
import { farShade } from '../../art/palettes.js';
import { rad } from '../../engine/math.js';
import { particles } from '../../engine/particles.js';

const R = Math.round, TAU = Math.PI * 2;
/**
 * Two or more INKED detail bands of the same colour in ONE path (ART_STYLE 0.2 for the line, section 9 for the cost):
 * ctx.rect adds a subpath without clearing the path, so a single outlinePath + fill inks every band in the group.
 * One stroke and one fill for the pair instead of two of each — the difference between this walker fitting the
 * boss cel-shape budget and blowing it. Integer coordinates, no clip, no rounding: these are machine bands.
 * The two bands are passed as SCALARS, not as an array of arrays: ART_STYLE section 9 forbids allocation inside a
 * draw, and the array form built three arrays plus an iterator on every one of the four calls per boss frame.
 */
function inkBands(ctx, rig, hex, x0, y0, w0, h0, x1, y1, w1, h1) {
  ctx.beginPath();
  ctx.rect(R(x0), R(y0), R(w0), R(h0));
  ctx.rect(R(x1), R(y1), R(w1), R(h1));
  flat(ctx, rig, hex);
}
// Value ladder (ART_STYLE 0.1): light steel piston rods > brass barrel > mid gunmetal cannon > dark iron frame >
// near-black slate foot plates. Aether cyan is the only glow; red is the tell.
// IRON and SLATE hold their hue (264 deg) and very nearly their lightness and move CHROMA only (Oklab C 2.6 -> 7.1 and
// 2.3 -> 5.0). Two things come out of it at once. (1) THE INK FLOOR: SLATE was Oklab L* 27.7 against this rig's outline
// #1A1E24 at L* 23.4 - dL 4.3 - so the line under every foot plate was drawn and then swallowed, which is most of what
// "the models blend together" means. It is now L* 32.5, dL 9.1. (2) RESERVATION: at C 2.6 the iron frame (13.7% of the
// painted area) sat in the low-chroma core of the colour lattice that every polychrome backdrop also occupies. It now
// has chroma to be separated BY. Neither is a hue change: this is still dark iron, not a blue uniform, and BRASSB stays
// the only warm on the machine.
const BRASSB = '#C9963A', IRON = '#2F4269', GUN = '#44506E', STEEL = '#C2CCEA', SLATE = '#26344E', RUST = '#8A5A24';
const CYAN = '#4DF0E0', CYAN_HOT = '#EAFFFB', RED = '#FF5C5C', HOT = '#FFD27A', STEAM = '#DDE6EC', GLASS = '#A6DCE6';
// GUN, STEEL and WELL hold their Oklab lightness to 0.2 L* and move chroma only (C 2.6 -> 5.2, 1.9 -> 4.3, 3.2 -> 5.2):
// they stay neutrals well under the 40% ceiling - light steel is still light steel - but they leave the achromatic core
// of the colour lattice, where a quarter of this machine's painted area was landing in cells the polychrome
// Heart-Engine backdrop also occupies. Chroma says which faction; lightness says "not the stage".
const WELL = '#465A76', DARK = '#101A22', OL = '#1A1E24';
/** Far-side copies of the module constants (ART_STYLE 0.3: far parts never colour from the near palette). */
const GUN_F = farShade(GUN, 0.62), DARK_F = farShade(DARK, 0.62);
// Vane: near-black coat over a lighter charcoal sleeve, cream cravat, pale skin, grey queue, mid-grey trousers, dark boots.
// Vane's frock coat was the worst ink-floor failure on this rig and it is his LARGEST mass: #1B1E2B is Oklab L* 23.8
// against his outline #191622 at L* 21.0 - dL 2.8 - so the Chancellor's coat sat at its own line over its whole area and
// the outline that describes him was invisible. Hue held (229 deg), lifted the minimum that clears dL 9 and paid for in
// chroma, not value (C 2.5 -> 5.1): #202E48, L* 30.2, dL 9.2. The sleeve steps up with it so the arm still reads off the
// torso (L* 36.9, a 6.7 L* step; sleeve/primary luminance separation 0.264, over the 0.18 bound), and the hat and boots
// clear the line too. Everything here is still near-black cloth at arm's length; it is only no longer darker than its
// own ink.
const COAT = '#202E48', SLEEVE = '#2A3E68', CREAM = '#F4F1E8', SKIN = '#E8CDB5', QUEUE = '#9AA0AE', HATC = '#282C44',
  TROUSER = '#5B6274', BOOTC = '#2A2E46', BLADE = '#D8DCE0', WINE = '#5E2733';

/** One soft steam puff: three merged discs, no outline (fillStyle set by the caller). */
function puff(ctx, x, y, r, a) {
  if (a <= 0.02) return;
  const p = ctx.globalAlpha; ctx.globalAlpha = p * a;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.arc(x - r * 0.8, y + r * 0.45, r * 0.7, 0, TAU); ctx.arc(x + r * 0.75, y + r * 0.5, r * 0.6, 0, TAU); ctx.fill();
  ctx.globalAlpha = p;
}

// ================================================================ the Regent Engine (scale 2.8 -> ~207 px)
// The walker has three materials, not nine: light steel, dark iron and brass. The humanoid palette keys it has to
// fill are ALIASES onto those - `skin` and `metal` are both the steel, `hair`, `sleeve` and `secondary` are all the
// iron - because a tripod walker has no skin and no hair. Worth knowing when reading a tool report: the invariant
// suite maps a colour back to the FIRST key that carries it, so a finding about the leg says "skin over its own
// hair" when what it means is "the steel piston over its own iron cylinder". It is naming an alias, not a defect.
const ENGINE_PAL = { skin: STEEL, hair: IRON, primary: BRASSB, sleeve: IRON, secondary: IRON, accent: BRASSB, metal: STEEL, dark: SLATE, glow: CYAN };

/** Aether core (torso space): iron bezel, cyan window, and the two brass iris plates that slide apart as `open` (0..1) grows (Core Vent). */
function drawCore(ctx, rig, cx, cy, r, open) {
  celBall(ctx, rig, cx, cy, r, IRON, false);
  ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, TAU); flat(ctx, rig, DARK);
  if (rig.override) return;
  if (open > 0.05 || rig.boltTell) { ctx.fillStyle = rig.boltTell ? 'rgba(255,92,92,0.24)' : 'rgba(77,240,224,0.20)'; ctx.beginPath(); ctx.arc(cx, cy, r + 3 + open * 5, 0, TAU); ctx.fill(); }
  const rr = r - 3.5, hot = rig.boltTell;   // the core runs red through the Bolt Spray tell (GDD 5.2 p2.2)
  ctx.fillStyle = rig.col(hot ? RED : CYAN); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.fill();
  ctx.fillStyle = rig.col(hot ? '#FFE0D8' : CYAN_HOT); ctx.beginPath(); ctx.arc(cx, cy, rr * (0.3 + 0.25 * open), 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(R(cx - rr * 0.6), R(cy - rr * 0.6), 3, 3);
  if (open > 0.96) return;
  const t = tones(rig, rig.palette.accent), d = R((r - 2) * (0.34 + 0.66 * open));
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 2.5, 0, TAU); ctx.clip();
  ctx.fillStyle = t.base; ctx.fillRect(cx - r, cy - r - d, r * 2, r); ctx.fillRect(cx - r, cy + d, r * 2, r);
  ctx.fillStyle = t.sh; ctx.fillRect(cx - r, cy - d - 3, r * 2, 3); ctx.fillRect(cx - r, cy + d, r * 2, 3);
  ctx.fillStyle = t.hi; ctx.fillRect(cx - r + 3, cy - d - 5, r * 2 - 6, 2);
  ctx.restore();
}
/** Barrel body (torso space): brass barrel banded by iron ribs, the core window, the phase-2 bolt slit and the tell lamp. */
function engineBarrel(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal;
  celRect(ctx, rig, -hw, -H, W, H + 3, 11, pal.primary, 0.3, 0.32);
  if (rig.override) return;
  const t = tones(rig, pal.primary), ti = tones(rig, IRON);
  // The two iron ribs are a MATERIAL change on the brass barrel (iron over brass) and each one introduced a new
  // internal boundary with no line under it - 100+ of this rig's 606 unoutlined rects, on the largest humanoid in the
  // game. Inked with band(): one stroke, one fill, no clip. Widened 5 -> 7 so 1 px of ink on each long edge still
  // leaves 4 px of iron (ART_STYLE 0.7), and the old `deep` seam along the bottom goes - the outline is that line now.
  inkBands(ctx, rig, IRON, -hw + 1, -H + 1, W - 2, 7, -hw + 1, -6, W - 2, 7);
  ctx.fillStyle = ti.hi;
  ctx.fillRect(-hw + 3, -H + 2, W - 6, 1); ctx.fillRect(-hw + 3, -5, W - 6, 1);
  const open = Math.max(pose.grip || 0, rig.coreT || 0);
  drawCore(ctx, rig, 0, -R(H * 0.46), R(H * 0.4), open);
  // phase-2 chest slit (Bolt Spray) under the core: dark slot that fills red through the tell
  if (rig.phaseIndex === 1) {   // phase-2 bolt vents flanking the core (they fire the 8-bolt fan)
    ctx.fillStyle = rig.col(DARK); ctx.fillRect(R(W * 0.3), -R(H * 0.62), 5, 14);
    ctx.fillStyle = rig.col(rig.boltTell ? RED : '#3A2A2E'); ctx.fillRect(R(W * 0.3) + 1, -R(H * 0.62) + 1, 3, 12);
  }
  // warning lamp: cyan at rest, red on tells, white blink in the last tell frames
  const lx = -hw + 7, ly = -H + 12, blink = (rig.tick & 2) !== 0;
  const lit = rig.tell ? (rig.tellWarn && blink ? '#FFFFFF' : RED) : '#7A6438';
  if (rig.tell) { ctx.fillStyle = rig.tellWarn && blink ? 'rgba(255,255,255,0.3)' : 'rgba(255,92,92,0.3)'; ctx.beginPath(); ctx.arc(lx, ly, 9, 0, TAU); ctx.fill(); }
  celBall(ctx, rig, lx, ly, 4, pal.accent, false);
  ctx.beginPath(); ctx.arc(lx, ly, 2.4, 0, TAU); ctx.fillStyle = rig.col(lit); ctx.fill();
  if (rig.tell) { ctx.fillStyle = rig.col('#FFFFFF'); ctx.fillRect(lx - 2, ly - 2, 2, 2); }
}
/** Brass collar ring between the barrel and the cockpit dome (neck space). */
function engineCollar(ctx, rig, pose, inf) {
  celPoly(ctx, rig, [-6, 3, -4, -4, 4, -4, 6, 3], inf.pal.accent, 0.4, 0.25);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, inf.pal.accent).deep; ctx.fillRect(-4, 0, 8, 2);
}
/** Vane at the levers inside the dome (head space, under the glass): coat, cravat, top hat, spectacle glint, pocket watch. */
function domeVane(ctx, rig, pose) {
  const watch = rig.watch, face = pose.face | 0;
  if (!rig.override) { ctx.fillStyle = tones(rig, WELL).deep; ctx.fillRect(-9, -11, 17, 15); }
  celPoly(ctx, rig, [-7, 4, -6, -2, -2, -5, 3, -5, 7, -1, 8, 4], COAT, 0.34, 0.28);
  celBall(ctx, rig, 0, -8, 3.6, SKIN, false);
  // arm: on the control lever, or raised with the pocket watch during Time Stop
  if (watch) {
    celCapsule(ctx, rig, 4, -3, 7, -9, 1.7, COAT, 0);
    celBall(ctx, rig, 8, -11, 2.8, rig.palette.accent, false);
    if (!rig.override) { ctx.fillStyle = rig.col(CYAN_HOT); ctx.fillRect(7, -12, 2, 2); }
  } else {
    celCapsule(ctx, rig, 4, -2, 9, 1, 1.7, COAT, 0);
    if (!rig.override) { ctx.fillStyle = rig.col(BRASSB); ctx.fillRect(9, -5, 3, 8); }
  }
  if (rig.override) return;
  ctx.fillStyle = rig.col(CREAM); ctx.fillRect(-3, -5, 5, 4);            // cravat
  ctx.fillStyle = rig.col(QUEUE); ctx.fillRect(-7, -9, 4, 6);            // queue
  ctx.fillStyle = rig.col(HATC); ctx.fillRect(-7, -12, 13, 3); ctx.fillRect(-4, -16, 8, 4);
  ctx.fillStyle = rig.col(BRASSB); ctx.fillRect(-4, -13, 8, 1);
  ctx.fillStyle = rig.col(face === FACE.hurt ? '#FFFFFF' : CYAN_HOT); ctx.fillRect(1, -9, 3, 2);   // spectacles
  ctx.fillStyle = rig.col('#2A2028'); ctx.fillRect(-2, -9, 2, 2);
}
/** Glass cockpit dome (head hook): lit well, Vane inside, then tinted glass (red on tells, cyan flash on the cannon charge). */
function engineDome(ctx, rig, pose, inf) {
  const r = inf.r, DR = R(r * 2.2), base = R(r * 0.5);
  ctx.beginPath(); ctx.moveTo(-DR, base); ctx.arc(0, base, DR, Math.PI, 0); ctx.closePath();
  celPath(ctx, rig, WELL, 0, base - DR * 0.4, DR, 0.34, 0.22);
  domeVane(ctx, rig, pose);
  if (!rig.override) {
    ctx.beginPath(); ctx.moveTo(-DR, base); ctx.arc(0, base, DR, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = rig.cannonCharge ? ((rig.tick & 4) ? 'rgba(77,240,224,0.34)' : 'rgba(166,220,230,0.20)')
      : rig.tell ? 'rgba(255,92,92,0.11)' : 'rgba(166,220,230,0.22)'; ctx.fill();
    ctx.strokeStyle = rig.col(OL); ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = tones(rig, GLASS).rim; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, base, DR - 3, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
  }
  const br = R(DR * 0.78);
  celRect(ctx, rig, -br, base - 1, br * 2, 5, 2, rig.palette.accent, 0.4, 0.25);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, rig.palette.accent).deep; ctx.fillRect(-br + 2, base + 2, br * 2 - 4, 1);
  rimTop(ctx, rig, -br + 2, base - 1, R(br * 0.5), base - 1, rig.palette.accent);
}
/** Iron pelvis hub the three legs pivot on (hip space), with brass bosses. */
function engineHub(ctx, rig, pose, inf) {
  const hw = R(inf.w / 2);
  celRect(ctx, rig, -hw, -6, hw * 2, 12, 4, IRON, 0.42, 0.24);
  if (rig.override) return;
  const t = tones(rig, rig.palette.accent);
  ctx.fillStyle = t.base; ctx.fillRect(-hw + 1, -3, 5, 6); ctx.fillRect(hw - 6, -3, 5, 6);
  ctx.fillStyle = t.sh; ctx.fillRect(-hw + 1, 1, 5, 2); ctx.fillRect(hw - 6, 1, 5, 2);
  ctx.fillStyle = tones(rig, IRON).hi; ctx.fillRect(-hw + 7, -6, hw * 2 - 14, 1);
}
/** Brass pivot disc where an arm meets the barrel (shoulder hook, torso space). */
function engineShoulder(ctx, rig, pose, inf) {
  celBall(ctx, rig, 0, 0, inf.r + 1, inf.pal.accent, false);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, inf.pal.accent).deep; ctx.fillRect(-2, -2, 4, 4);
}
/**
 * ONE hydraulic segment of the walker (limb space, +y along the limb): a dark iron cylinder whose brass gland
 * collar at the far joint is part of the SAME shape. Shared by the boom, the thigh and the rear leg's thigh.
 *
 * It used to be a cylinder with a separately inked band painted on top, so every boom and every thigh wore a dark
 * ring at the elbow / knee and the limb read as a bar with a part bolted to it. The cylinder and the collar now go
 * into one path, stroked once and filled once (ART_STYLE 0.2), and the brass is painted inside that silhouette
 * afterwards under a clip. The clip is what DECLARES the material change: 0.2's exception, and
 * geom/outline-stroke-contract with it, only accepts an unoutlined fill when it is clipped inside a path that has
 * itself been inked - "it lands inside the cylinder anyway" is rejected on purpose.
 *
 * The brass is deliberately KEPT and made bigger, not simplified away. It is this machine's ONE material crossing
 * per segment (0.7): 5 px of it at scale 2.45 is 12 device px, three times the 4 px floor, it stands 1.5 px proud
 * of the cylinder on each side so the joint has a profile, and it sits ON the joint. Brass is the only warm on the Regent; losing it would cost
 * the walker the thing that says "Aetherwright machine" at a glance.
 */
function engineHydraulic(ctx, rig, r, L, pal) {
  // the collar stops 1 px short of the joint: the segment BELOW is drawn after it, so a collar that ran to the joint
  // would be half covered by the piston rod / the forearm and the brass would read as two slivers, not a gland.
  const cx = -(r + 1.5), cw = r * 2 + 3, cy = L - 6, ch = 5;
  ctx.beginPath();
  // the cylinder flares 0.86r -> r toward the gland: form inside ONE material, so it costs a taper and no line.
  pathTaperedCapsule(ctx, 0, -1, 0, L, r * 0.86, r, true);
  ctx.rect(cx, cy, cw, ch);                                  // the gland collar, in the same path as the cylinder
  celPath(ctx, rig, pal.secondary, 0, R(L * 0.5), (L + r * 2 + 6) * 0.5, 0.38, 0.26);
  if (rig.override) return;
  ctx.save(); ctx.clip();                                    // still the silhouette path celPath just inked
  ctx.beginPath(); ctx.rect(cx, cy, cw, ch);
  ctx.fillStyle = tones(rig, pal.accent).base; ctx.fill();
  ctx.restore();
}
/** Upper arm / boom (limb space, +y along the limb): dark iron hydraulic barrel with a brass collar at the elbow. */
function engineArmUpper(ctx, rig, pose, inf) {
  engineHydraulic(ctx, rig, inf.r, inf.len, inf.pal);
}
/** Forearm: near = the saw arm's light-steel ram, far = the steam cannon's gunmetal barrel with brass bands. */
function engineArmLower(ctx, rig, pose, inf) {
  const r = inf.r, L = inf.len, pal = inf.pal;
  if (!inf.far) {
    // The saw arm's ram: the steel ram and the iron elbow sleeve are ONE object, the same way the thigh and its
    // gland are. They used to be a capsule and a rounded rect stroked separately, so the ram wore a dark ring where
    // it left the sleeve -- the seam that made a limb read as two parts stacked end to end (ART_STYLE 0.2).
    ctx.beginPath();
    pathTaperedCapsule(ctx, 0, 4, 0, L + 2, r * 0.62, r * 0.62, true);
    ctx.rect(-r, -3, r * 2, 9);                              // the iron sleeve, in the same path as the ram
    // ext/centre are the SLEEVE's, not the union's: the sleeve is the mass that carries the cel bands and it keeps
    // exactly the shading celRect gave it before. The ram is the flat light-steel it always was (r is under flatR).
    celPath(ctx, rig, pal.secondary, 0, 1.5, Math.hypot(r * 2, 9) * 0.5, 0.4, 0.24);
    if (rig.override) return;
    ctx.save(); ctx.clip();
    pathTaperedCapsule(ctx, 0, 4, 0, L + 2, r * 0.62, r * 0.62);
    ctx.fillStyle = tones(rig, pal.metal).base; ctx.fill();
    ctx.restore();
    return;   // the old 3 px brass wrist collar is gone: under the 0.7 floor, it could not carry a line and did not read
  }
  celRect(ctx, rig, -r - 1, -3, r * 2 + 2, L + 3, 4, pal.metal, 0.38, 0.28);
  if (rig.override) return;
  const gun = inf.far ? GUN_F : GUN;
  // Gunmetal reinforcing rings on the steel barrel. These stay INKED rather than becoming clipped fills like the
  // boom's collar: a ring fitted around a barrel is a second object by 0.2's own test ("would a reader call these
  // two things separate objects?"), and it is the same language as the barrel body's ribs and the boiler's hoops.
  // The collar at a JOINT is part of the casting; a band along a barrel is a fitting.
  inkBands(ctx, rig, gun, -r - 1, R(L * 0.3), r * 2 + 2, 6, -r - 1, R(L * 0.68), r * 2 + 2, 6);
  // The 2 px "rim band" that used to sit under each band is gone. It was described as form inside one material, but
  // it was painted OUTSIDE the band, on the steel barrel, in a third colour - so the forearm carried two material
  // crossings (gunmetal + gunmetal-highlight) where 0.7 allows one, and the second one was two pixels of it. The
  // band is inked; the outline IS that edge now, exactly as the barrel's iron ribs were fixed above.
  ctx.fillStyle = tones(rig, pal.metal).hi; ctx.fillRect(-r, 0, 1, R(L * 0.3));
}
/** Near hand = the brass hub the gear-saw spins on; far hand = the steam cannon's muzzle bell (hand space, +x forward). */
function engineHand(ctx, rig, pose, inf) {
  const pal = inf.pal;
  if (!inf.far) { celBall(ctx, rig, 2, 0, inf.r - 0.5, pal.accent, false); if (!rig.override) { ctx.fillStyle = tones(rig, pal.accent).deep; ctx.fillRect(0, -2, 4, 4); } return; }
  ctx.save(); ctx.rotate(rad(pose.handL.rot));   // handL.rot is a free animation channel on this rig: keep the bell steady
  celPoly(ctx, rig, [-2, -7, 8, -10, 17, -11, 18, 11, 8, 10, -2, 7], pal.metal, 0.36, 0.3);
  if (!rig.override) {
    const charge = rig.cannonCharge, blink = (rig.tick & 2) !== 0;
    ctx.fillStyle = rig.col(inf.far ? DARK_F : DARK); ctx.fillRect(12, -8, 7, 16);
    ctx.fillStyle = rig.col(charge ? (blink ? CYAN_HOT : CYAN) : '#1A2430'); ctx.fillRect(13, -7, 6, 14);
    // the two brass reinforcing rings on the steel bell: a material change, so each takes 1 px of ink. Widened
    // 4 -> 5 first, or the line would leave 2 px of brass (ART_STYLE 0.7); the shade seams inset to match.
    inkBands(ctx, rig, pal.accent, 8, -11, 5, 22, -1, -9, 5, 18);
    ctx.fillStyle = tones(rig, pal.accent).sh; ctx.fillRect(9, 6, 3, 5); ctx.fillRect(0, 5, 3, 4);
    if (charge) { ctx.fillStyle = 'rgba(77,240,224,0.28)'; ctx.beginPath(); ctx.arc(17, 0, 11, 0, TAU); ctx.fill(); }
    if (rig.cannonVent) {
      ctx.fillStyle = tones(rig, STEAM).base;
      const k = (rig.tick % 18) / 18;
      puff(ctx, 4 + k * 8, -12 - k * 8, 3 + k * 4, 0.5 - k * 0.45);
      puff(ctx, 2, 12 + k * 6, 2.5 + k * 3, 0.4 - k * 0.36);
    }
  }
  ctx.restore();
}
/** Gear-saw (weapon, near hand space): brass hub, 8 steel teeth spinning on rig.sawAngle, blur ring at speed, jam sparks. */
function drawSaw(ctx, rig) {
  const cx = 11, a = rig.sawAngle || 0, fast = rig.sawFast, RS = 12;
  if (!rig.override && fast) {
    ctx.fillStyle = 'rgba(198,206,218,0.30)'; ctx.beginPath(); ctx.arc(cx, 0, RS + 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, 0, RS - 2, a * 3, a * 3 + 1.4); ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const t0 = a + i * TAU / 8;
    ctx.moveTo(cx + Math.cos(t0) * (RS - 4), Math.sin(t0) * (RS - 4));
    ctx.lineTo(cx + Math.cos(t0 + 0.2) * (RS + 3.5), Math.sin(t0 + 0.2) * (RS + 3.5));
    ctx.lineTo(cx + Math.cos(t0 + 0.46) * (RS - 4), Math.sin(t0 + 0.46) * (RS - 4));
    ctx.closePath();
  }
  celPath(ctx, rig, rig.palette.metal, cx, 0, RS + 3.5, 0.38, 0.3);
  celBall(ctx, rig, cx, 0, RS - 3, rig.palette.metal, true);
  celBall(ctx, rig, cx, 0, 4.5, rig.palette.accent, false);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, rig.palette.metal).sh;
  ctx.beginPath(); ctx.arc(cx, 0, RS - 6, 0, TAU); ctx.stroke();
  if (rig.sawJam) { ctx.fillStyle = rig.col(RED); ctx.fillRect(cx + R(Math.cos(a) * (RS - 3)) - 2, R(Math.sin(a) * (RS - 3)) - 2, 4, 4); }
}
/**
 * Thigh: the leg's hydraulic cylinder, with the brass gland collar at the knee (limb space, +y along the limb).
 *
 * The leg used to be FOUR outlined objects across its two segments - an iron sleeve with a steel piston capsule
 * poking out of it, a brass sliver painted on top, then a steel rod with a second iron sleeve and a second brass
 * sliver on the shin - so each leg read as a chain of blocks with a dark ring at every seam, which is most of what
 * "the models blend together" meant at the knee. It is now ONE machine read: a dark iron cylinder, a brass gland
 * at the knee, and a light-steel piston rod sliding out of it (ART_STYLE 0.1's value ladder in three steps, and
 * 0.7's one material crossing per segment - the brass on the thigh, nothing on the rod).
 */
function engineLegUpper(ctx, rig, pose, inf) {
  engineHydraulic(ctx, rig, inf.r, inf.len, inf.pal);
}
/** Shin: the light-steel piston rod that slides out of the thigh's gland — the walker's "idling piston" read. */
function engineLegLower(ctx, rig, pose, inf) {
  const r = inf.r, L = inf.len, pal = inf.pal;
  celCapsule(ctx, rig, 0, 0, 0, L + 2, r * 0.72, pal.metal, 0.3);
  if (rig.override) return;
  // the rod is under flatR, so the renderer gives it one flat tone; the 1 px glint is its only form mark, and it is
  // the rod's OWN highlight - form inside one material, so it takes no ink and is not a second crossing (0.2, 0.7).
  ctx.fillStyle = tones(rig, pal.metal).hi; ctx.fillRect(-2, 3, 1, L - 3);
  if (rig.phaseIndex === 1) { ctx.fillStyle = rig.col(RED); ctx.fillRect(-2, L - 2, 4, 4); }   // sheared, still glowing
}
/** Splayed plate foot: slate pad with a brass toe cap, deep sole and two grousers (ankle space, toe toward +x). */
function engineFoot(ctx, rig, pose, inf) {
  const heel = R(inf.w * 0.4), toe = R(inf.w * 0.66), top = -inf.h, pal = inf.pal;
  celPoly(ctx, rig, [-heel, top, toe - 5, top, toe, top + 5, toe, 4, -heel, 4], pal.dark, 0.34, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(toe - 7, top + 1, 6, 4);
  const t = tones(rig, pal.dark);
  ctx.fillStyle = t.deep; ctx.fillRect(-heel, 2, toe + heel, 3);
  ctx.fillStyle = t.hi; ctx.fillRect(-heel + 3, top, R(inf.w * 0.5), 1);
  ctx.fillStyle = t.deep; ctx.fillRect(-heel + 2, -1, 3, 4); ctx.fillRect(R(toe * 0.4), -1, 3, 4);
}
/** Third tripod leg (hip space, back layer): walks in counter-phase to the other two (angles derived from the pose); a snapped stub in phase 2. */
function engineRearLeg(ctx, rig, pose) {
  const p = rig.p, pal = rig.paletteFar, broken = rig.phaseIndex === 1;
  const u = broken ? 24 : -(pose.legR.upper + pose.legL.upper) * 0.5;
  const l = broken ? 40 : -(pose.legR.lower + pose.legL.lower) * 0.5;
  ctx.save(); ctx.translate(-7, 1); ctx.rotate(rad(-u));
  engineHydraulic(ctx, rig, p.legR - 1, p.upperLeg, pal);   // same cylinder + gland as the other two legs
  ctx.translate(0, p.upperLeg); ctx.rotate(rad(-l));
  if (broken) {
    celPoly(ctx, rig, [-4, -2, 4, -2, 3, 8, -2, 11, -5, 6], pal.secondary, 0.4, 0.2);
    if (!rig.override) { ctx.fillStyle = rig.col(HOT); ctx.fillRect(-2, 7, 3, 3); }
    ctx.restore(); return;
  }
  celCapsule(ctx, rig, 0, 0, 0, p.lowerLeg, (p.legR - 1) * 0.72, pal.metal, 0.3);
  ctx.translate(0, p.lowerLeg + 2);
  celPoly(ctx, rig, [-6, -5, 9, -5, 12, 0, 12, 3, -6, 3], pal.dark, 0.34, 0.24);
  if (!rig.override) { ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(6, -4, 5, 3); }
  ctx.restore();
}
/** Heart-Engine boiler bolted to the walker's back (back accessory): riveted drum, fire slot, two chimneys chuffing steam. */
function engineBoiler(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), H = p.torsoH;
  const x0 = -hw - 13, y0 = -H + 2, w = 15, h = H - 2;
  celRect(ctx, rig, x0 + 2, y0 - 12, 6, 13, 1, IRON, 0.4, 0.2);
  celRect(ctx, rig, x0 + 9, y0 - 8, 5, 9, 1, IRON, 0.4, 0.2);
  celRect(ctx, rig, x0, y0 - 15, 9, 4, 1, RUST, 0.4, 0);
  celRect(ctx, rig, x0, y0, w, h, 6, IRON, 0.36, 0.26);
  if (rig.override) return;
  // the boiler's two brass hoops: brass on iron, a material change, so each takes ink. 4 + a 1 px shade seam
  // becomes one inked 6 px hoop - the outline IS the seam now (ART_STYLE 0.2, 0.7).
  inkBands(ctx, rig, BRASSB, x0, y0 + 4, w, 6, x0, y0 + h - 12, w, 6);
  ctx.fillStyle = rig.col(DARK); ctx.fillRect(x0 + 4, y0 + 16, 7, 6);
  ctx.fillStyle = rig.col('#2A7A78'); ctx.fillRect(x0 + 5, y0 + 17, 5, 4);
  ctx.fillStyle = rig.col(CYAN); ctx.fillRect(x0 + 5, y0 + 18 + ((rig.tick % 20) < 10 ? 0 : 1), 5, 2);
  const f = rig.tick % 24, k = f / 24, big = rig.coreT > 0.3 ? 1.8 : 1;
  ctx.fillStyle = tones(rig, STEAM).base;
  puff(ctx, x0 + 5 - k * 4, y0 - 17 - k * 16 * big, (2 + k * 4) * big, 0.5 - k * 0.46);
  if (f > 11) { const k2 = (f - 11) / 24; puff(ctx, x0 + 11 - k2 * 3, y0 - 12 - k2 * 12 * big, (1.6 + k2 * 3) * big, 0.4 - k2 * 0.36); }
}

const ENGINE_BUILD = {
  scale: 2.45, palette: ENGINE_PAL, outline: OL, outlineWidth: 1, ramp: { sh: 0.6 }, smearColor: STEEL,
  proportions: { headR: 8, neck: 3, neckR: 5, torsoW: 32, torsoH: 31, hip: 22, upperArm: 15, lowerArm: 13, armR: 5.5, handR: 5.5,
    upperLeg: 16, lowerLeg: 15, legR: 5.5, footL: 16, footH: 6, shoulderX: 15, hipX: 6, bulge: 0 },
  parts: { torso: engineBarrel, hips: engineHub, neck: engineCollar, head: engineDome, face: noFace, shoulder: engineShoulder,
    armUpper: engineArmUpper, armLower: engineArmLower, hand: engineHand, legUpper: engineLegUpper, legLower: engineLegLower, foot: engineFoot },
  weapon: { attach: 'handR', length: 27, draw: drawSaw, headAt: 12 },
  accessories: [{ attach: 'back', draw: engineBoiler }, { attach: 'hip', layer: 'back', draw: engineRearLeg }],
};

// ---------------------------------------------------------------- Regent Engine animations
/** Rest carry: saw arm forward-high on the near side, steam cannon lower on the far side, legs in the tripod A-stance. */
const EC = { armR: [64, 22], armL: [50, 24], weapon: 0, torso: 2, head: 0, legR: [11, 5], legL: [-11, 5], grip: 0, handL: 0 };
/** Phase 2: the legs have buckled, the barrel sits on the dais (feet stay on the floor line: root +20 with splayed legs). */
const LOW = { ...EC, root: [0, 25], legR: [80, -8], legL: [-80, 8], torso: 6, armR: [70, 10], armL: [52, 22] };
const EBASE = makeBrassBase(EC);
const ED = (x, y) => ({ kind: 'dust', x, y: y || 0, count: 3 });
const ESTEAM = (x, y, n) => ({ kind: 'steam', x, y, count: n || 4 });
/** Engine walk key: heavy tripod stomp — contact / down (root +2, squash) / pass / up. */
const ew = (lr, ll, ty, sq, aR, aL) => ({ ...EC, legR: lr, legL: ll, armR: aR || EC.armR, armL: aL || EC.armL, torso: 4, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1 });

const SHELL = { style: 'shell', speed: 6, damage: 18, type: 'knockdown', kbX: 5, kbY: 4, hitstun: 22, maxDist: 500, life: 110, offsetX: 62, offsetY: 100, color: CYAN, r: 6, muzzle: false, draw: drawShell };
const BOLTS = { style: 'bolt', speed: 5, damage: 8, type: 'light', kbX: 3, hitstun: 14, count: 8, spreadZ: 4, spreadY: 3, maxDist: 400, life: 100, offsetX: 30, offsetY: 40, color: RED, r: 3, muzzle: false };
const STOMP_HIT = { damage: 20, type: 'knockdown', kbX: 5, kbY: 5 };
const sawHit = (zOff) => ({ x: -420, y: -50, w: 840, h: 50, z: 30, zOff, once: true, damage: 28, type: 'knockdown', kbX: 6, kbY: 5, id: 'saw' + zOff });
const ESCORT = [{ type: 'brassbound', variant: 'footman' }, { type: 'brassbound', variant: 'footman' }];
const FX_MUZZLE = [{ kind: 'ring', x: 46, y: 58, r0: 4, r1: 26, color: CYAN }];
const FX_SLAM = [{ kind: 'dust', x: 24, y: 0, count: 9 }, { kind: 'ring', x: 20, y: 0, r0: 6, r1: 60, flat: true, color: HOT }];
/** The Stomp impact key and its shockwave, reused by Time Stop's free stomp. */
const SLAM_POSE = { ...EC, legR: [22, 8], legL: [-20, 10], torso: 10, head: 4, root: [3, 3], squash: 1.09, stretch: 0.91, armR: [64, 12], armL: [42, 18], face: 'shout' };
const SHOT_POSE = { ...EC, armL: [70, 8], armR: [38, 34], torso: -10, head: -6, root: [-7, 1], legR: [16, 8], legL: [-20, 12], face: 'shout' };
const SHOT_FX = { event: 'spawnProjectile', projectile: SHELL, sfx: 'cannon', ease: 'out', fx: FX_MUZZLE };

/** @type {AnimSet} */
const engineAnims = {
  ...EBASE,
  // idle: the pistons breathe, the barrel rocks 3 deg, the boiler chuffs and the saw idles over (drawSaw / rig.tick)
  idle: { loop: true, frames: [
    FK(14, { ...EC, torso: 2, root: [0, 0] }, { ease: 'inout' }),
    FK(12, { ...EC, torso: 4, head: 2, root: [0, 1], armR: [58, 18], armL: [32, 28], legR: [12, 7], legL: [-12, 7], squash: 1.01, stretch: 0.99 }, { ease: 'inout' }),
    FK(14, { ...EC, torso: 3, head: 1, root: [0, 1], armR: [55, 22], armL: [35, 25], legR: [11, 6], legL: [-11, 6] }, { ease: 'inout' }),
    FK(12, { ...EC, torso: 1, head: -1, root: [0, 0], armR: [54, 21], armL: [36, 24], legR: [10, 4], legL: [-10, 4] }, { ease: 'inout' }),
  ] },
  // walk: eight keys of tripod stomp, dust off each planted foot
  walk: { loop: true, frames: [
    FK(5, ew([26, 2], [-22, 16], 0, 0, [52, 24]), { ease: 'out' }),
    FK(5, ew([18, 12], [-12, 30], 2, 1.04, [50, 26]), { ease: 'out', fx: [ED(-16)], sfx: 'piston' }),
    FK(5, ew([6, 22], [2, 10], 1, 0, [56, 20]), { ease: 'inout' }),
    FK(5, ew([-8, 12], [16, 0], -1, 0, [60, 16]), { ease: 'in' }),
    FK(5, ew([-22, 16], [26, 2], 0, 0, [58, 18], [36, 22]), { ease: 'out' }),
    FK(5, ew([-12, 30], [18, 12], 2, 1.04, [54, 22], [38, 20]), { ease: 'out', fx: [ED(18)], sfx: 'piston' }),
    FK(5, ew([2, 10], [6, 22], 1, 0, [56, 20], [34, 26]), { ease: 'inout' }),
    FK(5, ew([16, 0], [-8, 12], -1, 0, [58, 18], [32, 28]), { ease: 'in' }),
  ] },
  // hurt: the barrel rocks back on the rear leg, the saw arm flies wide, steam spits from a joint
  hurt: { loop: false, frames: [
    FK(4, { ...EC, torso: -12, head: -8, armR: [24, 50], armL: [12, 40], root: [-5, 1], legR: [20, 6], legL: [-16, 12], face: 'hurt' }, { ease: 'out', fx: [ESTEAM(-12, 70, 2)] }),
    FK(10, { ...EC, torso: -5, head: -4, armR: [42, 34], armL: [22, 32], root: [-2, 1], legR: [15, 5], legL: [-13, 8], face: 'hurt' }, { ease: 'out' }),
    FK(6, { ...EC, torso: 2 }, { ease: 'out' }),
  ] },
  // valve stun / stall: the frame judders, the arms droop and the core cover bangs part-way open (the punish window)
  stagger: { loop: true, frames: [
    FK(6, { ...EC, grip: 0.55, torso: -10, head: 10, armR: [30, 46], armL: [16, 40], root: [-3, 3], legR: [22, 12], legL: [-18, 14], face: 'hurt' }, { ease: 'out', fx: [ESTEAM(-10, 60, 3)] }),
    FK(6, { ...EC, grip: 0.6, torso: 8, head: 12, armR: [38, 40], armL: [24, 34], root: [3, 2], legR: [18, 14], legL: [-14, 12], face: 'hurt' }, { ease: 'out' }),
    FK(6, { ...EC, grip: 0.55, torso: -8, head: 8, armR: [32, 44], armL: [18, 38], root: [-3, 3], legR: [24, 10], legL: [-20, 16], face: 'dazed' }, { ease: 'out', fx: [ESTEAM(12, 52, 3)] }),
    FK(6, { ...EC, grip: 0.6, torso: 6, head: 10, armR: [36, 42], armL: [22, 36], root: [2, 2], legR: [20, 12], legL: [-16, 14], face: 'dazed' }, { ease: 'out' }),
  ] },
  // 1. STOMP (GDD 5.2 p1.1) — 30f tell: the near leg rises and hangs; 6f slam with an r40 shockwave; 30f punish
  stomp: { loop: false, frames: [
    FK(18, { ...EC, legR: [58, -80], legL: [-14, 6], torso: -5, head: -4, root: [-2, -1], armR: [46, 30], armL: [26, 32], face: 'angry' }, { tell: true, sfx: 'hydraulic', ease: 'in' }),
    FK(12, { ...EC, legR: [72, -112], legL: [-15, 6], torso: -9, head: -6, root: [-4, -1], armR: [40, 34], armL: [22, 36], squash: 0.97, stretch: 1.04, face: 'angry' }, { tell: true, ease: 'out' }),
    FK(6, SLAM_POSE, { event: 'shockwave', radius: 40, offset: 30, hit: STOMP_HIT, shake: 12, sfx: 'piston_crush', ease: 'overshoot', fx: FX_SLAM }),
    FK(30, { ...EC, legR: [18, 10], legL: [-18, 10], torso: 6, head: 2, root: [2, 3], armR: [60, 16], armL: [40, 22], face: 'grit' }, { punish: true, ease: 'inout', fx: [ESTEAM(-14, 64, 2)] }),
    FK(6, { ...EC, torso: 3 }, { ease: 'out' }),
  ] },
  // 2. CANNON VOLLEY (p1.2) — 40f tell: the cannon levels and the muzzle charges cyan; three shells 10f apart; 60f vent punish
  cannonVolley: { loop: false, frames: [
    FK(24, { ...EC, armL: [66, 6], armR: [40, 34], torso: -4, head: -3, root: [-3, 0], legR: [14, 6], legL: [-16, 8], face: 'angry' }, { tell: true, sfx: 'brass_tell', ease: 'in' }),
    FK(16, { ...EC, armL: [78, 2], armR: [36, 36], torso: -7, head: -5, root: [-5, 0], legR: [12, 6], legL: [-18, 10], squash: 0.98, stretch: 1.02, face: 'angry' }, { tell: true, ease: 'out' }),
    FK(6, SHOT_POSE, SHOT_FX),
    FK(10, { ...EC, armL: [78, 2], armR: [38, 34], torso: -5, head: -4, root: [-4, 0], legR: [14, 6], legL: [-18, 10] }, { ease: 'inout' }),
    FK(6, SHOT_POSE, SHOT_FX),
    FK(10, { ...EC, armL: [78, 2], armR: [38, 34], torso: -5, head: -4, root: [-4, 0], legR: [14, 6], legL: [-18, 10] }, { ease: 'inout' }),
    FK(6, SHOT_POSE, SHOT_FX),
    FK(60, { ...EC, armL: [46, 30], armR: [46, 28], torso: 4, head: 2, root: [0, 1], legR: [12, 6], legL: [-12, 6], face: 'grit' }, { punish: true, ease: 'inout', fx: [ESTEAM(-20, 40, 4)] }),
    FK(6, { ...EC, torso: 3 }, { ease: 'out' }),
  ] },
  // 3. SUMMON ESCORT (p1.3) — the saw arm goes up as a signal, the dome flashes and two Tin Footmen march in
  summonEscort: { loop: false, frames: [
    FK(18, { ...EC, armR: [-40, -30], armL: [20, 30], torso: -4, head: -6, root: [-2, 0], legR: [12, 6], legL: [-14, 8], face: 'angry' }, { tell: true, sfx: 'brass_tell', ease: 'in' }),
    FK(12, { ...EC, armR: [-120, -30], armL: [16, 32], torso: -8, head: -8, root: [-3, 0], legR: [10, 6], legL: [-16, 10], face: 'angry' }, { tell: true, ease: 'out' }),
    FK(10, { ...EC, armR: [-160, -14], armL: [14, 34], torso: -10, head: -10, root: [-2, 0], legR: [12, 6], legL: [-16, 10], face: 'shout' },
      { event: 'summon', summon: ESCORT, sfx: 'chime', ease: 'out', fx: [{ kind: 'ring', x: 0, y: 190, r0: 8, r1: 70, color: CYAN }] }),
    FK(40, { ...EC, armR: [-40, 20], armL: [26, 30], torso: 2, head: -2, root: [0, 1], legR: [12, 6], legL: [-12, 6], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...EC, torso: 3 }, { ease: 'out' }),
  ] },
  // 4. TIME STOP (p1.4) — Vane lifts the pocket watch (rig.watch), the machine holds dead still, then a free Stomp lands
  timeStop: { loop: false, frames: [
    FK(24, { ...EC, torso: 0, head: -3, root: [0, 0], armR: [50, 26], armL: [30, 30], legR: [12, 6], legL: [-12, 6], face: 'angry' }, { tell: true, sfx: 'time_stop_tick', ease: 'inout' }),
    FK(16, { ...EC, torso: -2, head: -5, root: [0, -1], armR: [48, 28], armL: [28, 32], legR: [11, 6], legL: [-13, 8], face: 'angry' }, { tell: true, ease: 'inout' }),
    FK(6, { ...EC, torso: -3, head: -6, root: [0, -1], armR: [46, 30], armL: [26, 34], legR: [10, 6], legL: [-14, 8], face: 'shout' },
      { event: 'timeStop', sfx: 'chime', ease: 'out', fx: [{ kind: 'ring', x: 0, y: 150, r0: 10, r1: 120, color: '#FFFFFF' }] }),
    FK(30, { ...EC, legR: [70, -108], legL: [-13, 6], torso: -8, head: -6, root: [-3, 0], armR: [44, 32], armL: [24, 34], face: 'shout' }, { ease: 'in' }),
    FK(6, SLAM_POSE, { event: 'shockwave', radius: 44, hit: STOMP_HIT, shake: 12, sfx: 'piston_crush', ease: 'overshoot', fx: FX_SLAM }),
    FK(20, { ...EC, legR: [18, 10], legL: [-18, 10], torso: 6, root: [2, 3], armR: [60, 16], armL: [40, 22], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...EC, torso: 3 }, { ease: 'out' }),
  ] },
  // 5. SAW SWEEP (p2.1) — 36f spin-up whine with the saw hauled back, a full-width sweep, 40f hold, the return sweep, 50f jam
  sawSweep: { loop: false, frames: [
    FK(22, { ...LOW, armR: [-46, -26], torso: -4, head: -6, root: [-4, 25], legR: [76, -6], legL: [-84, 10], face: 'angry' }, { tell: true, sfx: 'saw_whine', ease: 'in' }),
    FK(14, { ...LOW, armR: [-72, -34], torso: -9, head: -9, root: [-7, 24], legR: [74, -8], legL: [-86, 12], squash: 0.97, stretch: 1.03, face: 'angry' }, { tell: true, ease: 'out' }),
    FK(8, { ...LOW, armR: [96, 6], torso: 12, head: 5, root: [5, 26], squash: 1.05, stretch: 0.95, legR: [84, -10], legL: [-76, 6], face: 'shout' },
      { hitboxes: [sawHit(0)], sfx: 'saw_whine', smear: { from: -150, to: 40, a: 0.45, r: 46 }, ease: 'overshoot', fx: [{ kind: 'slash', x: 60, y: 40, radius: 60, angle: 6 }] }),
    FK(40, { ...LOW, armR: [104, 10], torso: 10, head: 3, root: [4, 26], legR: [82, -10], legL: [-78, 8], face: 'grit' }, { ease: 'inout' }),
    FK(8, { ...LOW, armR: [-30, -20], torso: -6, head: -4, root: [-4, 25], squash: 1.03, stretch: 0.97, legR: [78, -8], legL: [-82, 10], face: 'shout' },
      { hitboxes: [sawHit(-60), sawHit(60)], sfx: 'saw_whine', smear: { from: 60, to: -140, a: 0.45, r: 46 }, ease: 'overshoot', fx: [{ kind: 'slash', x: -20, y: 40, radius: 60, angle: -20 }] }),
    FK(50, { ...LOW, armR: [26, 54], torso: 2, head: 6, root: [0, 26], legR: [80, -8], legL: [-80, 8], face: 'dazed' }, { punish: true, ease: 'inout', fx: [ESTEAM(20, 46, 4)] }),
    FK(6, { ...LOW, torso: 6 }, { ease: 'out' }),
  ] },
  // 6. BOLT SPRAY (p2.2) — the chest slit runs red for 30f, the barrel snaps forward and fans 8 bolts
  boltSpray: { loop: false, frames: [
    FK(18, { ...LOW, torso: -8, head: -6, root: [-4, 25], armR: [52, 30], armL: [40, 30], legR: [78, -8], legL: [-82, 10], face: 'angry' }, { tell: true, sfx: 'brass_tell', ease: 'in' }),
    FK(12, { ...LOW, torso: -14, head: -10, root: [-7, 24], armR: [44, 36], armL: [34, 36], legR: [76, -6], legL: [-84, 12], squash: 0.97, stretch: 1.03, face: 'angry' }, { tell: true, ease: 'out' }),
    FK(8, { ...LOW, torso: 12, head: 6, root: [4, 26], armR: [70, 14], armL: [58, 16], legR: [84, -10], legL: [-76, 6], squash: 1.04, stretch: 0.96, face: 'shout' },
      { event: 'spawnProjectile', projectile: BOLTS, sfx: 'revolver_fan', ease: 'overshoot', fx: [{ kind: 'ring', x: 26, y: 34, r0: 4, r1: 30, color: RED }] }),
    FK(40, { ...LOW, torso: 6, head: 2, root: [1, 26], armR: [64, 18], armL: [52, 22], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...LOW, torso: 6 }, { ease: 'out' }),
  ] },
  // intro: the walker plants a leg, rears up over the dais and vents both boilers
  intro: { loop: false, frames: [
    FK(30, { ...EC, torso: -3, head: -2, root: [0, 3], legR: [16, 12], legL: [-16, 12], squash: 1.05, stretch: 0.95 }, { sfx: 'hydraulic', ease: 'out', fx: [ED(0)] }),
    FK(26, { ...EC, armR: [-130, -20], armL: [-40, 30], torso: -9, head: -8, root: [0, -1], legR: [10, 4], legL: [-10, 4], squash: 0.96, stretch: 1.05, face: 'angry' }, { sfx: 'roar', ease: 'inout', fx: [ESTEAM(-16, 120, 8)] }),
    FK(24, { ...EC, armR: [40, 34], armL: [26, 32], torso: 5, head: 3, root: [0, 1] }, { ease: 'inout' }),
    FK(20, { ...EC }, { ease: 'out' }),
  ] },
  // phase change: the legs buckle over 30f, the pistons blow out and the barrel drops onto the dais
  phaseChange: { loop: false, frames: [
    FK(16, { ...EC, torso: -10, head: -8, armR: [30, 46], armL: [20, 40], root: [-4, 0], legR: [22, 14], legL: [-20, 14], face: 'hurt' }, { sfx: 'explosion', ease: 'out', fx: [ESTEAM(-14, 70, 8)] }),
    FK(16, { ...EC, torso: 8, head: 6, armR: [44, 40], armL: [34, 34], root: [2, 9], legR: [46, -20], legL: [-48, 22], squash: 1.06, stretch: 0.94, face: 'hurt' }, { sfx: 'explosion', ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 10 }] }),
    FK(18, { ...LOW, torso: 14, head: 10, armR: [64, 20], armL: [50, 26], root: [0, 27], squash: 1.1, stretch: 0.9, face: 'dazed' }, { sfx: 'explosion_big', ease: 'in', fx: [{ kind: 'ring', x: 0, y: 40, r0: 8, r1: 110, color: HOT }, ESTEAM(0, 60, 10)] }),
    FK(20, { ...LOW, face: 'angry' }, { ease: 'out' }),
  ] },
};
engineAnims.run = engineAnims.walk;
engineAnims.flee = engineAnims.walk;
/**
 * Phase 2: the same rig with the collapsed rest poses (the legs are down; the barrel is at floor height and hittable).
 * @type {AnimSet}
 */
const engineBodyAnims = { ...engineAnims,
  idle: { loop: true, frames: [
    FK(16, { ...LOW, torso: 6, root: [0, 25] }, { ease: 'inout' }),
    FK(14, { ...LOW, torso: 9, head: 3, root: [0, 26], armR: [72, 8], armL: [54, 20], squash: 1.01, stretch: 0.99 }, { ease: 'inout' }),
    FK(16, { ...LOW, torso: 7, head: 1, root: [0, 26], armR: [68, 12], armL: [50, 24] }, { ease: 'inout' }),
    FK(14, { ...LOW, torso: 5, head: -1, root: [0, 25], armR: [70, 10], armL: [52, 22] }, { ease: 'inout' }),
  ] },
  // the wreck drags itself along on its buckled legs
  walk: { loop: true, frames: [
    FK(8, { ...LOW, torso: 8, root: [0, 26], legR: [84, -12], legL: [-76, 4], armR: [74, 6] }, { ease: 'inout', fx: [ED(-14)] }),
    FK(8, { ...LOW, torso: 5, root: [0, 24], legR: [76, -4], legL: [-84, 12], armR: [68, 12] }, { ease: 'inout' }),
    FK(8, { ...LOW, torso: 8, root: [0, 26], legR: [78, -8], legL: [-80, 8], armR: [72, 8] }, { ease: 'inout', fx: [ED(16)] }),
    FK(8, { ...LOW, torso: 5, root: [0, 24], legR: [82, -10], legL: [-78, 6], armR: [70, 10] }, { ease: 'inout' }),
  ] },
  hurt: { loop: false, frames: [
    FK(4, { ...LOW, torso: -4, head: -8, armR: [46, 40], armL: [36, 38], root: [-5, 26], face: 'hurt' }, { ease: 'out', fx: [ESTEAM(-10, 40, 2)] }),
    FK(10, { ...LOW, torso: 2, head: -4, armR: [58, 24], armL: [46, 26], root: [-2, 25], face: 'hurt' }, { ease: 'out' }),
    FK(6, { ...LOW, torso: 6 }, { ease: 'out' }),
  ] },
  stagger: { loop: true, frames: [
    FK(6, { ...LOW, grip: 0.6, torso: -2, head: 8, armR: [48, 40], armL: [38, 36], root: [-3, 27], face: 'hurt' }, { ease: 'out', fx: [ESTEAM(-8, 44, 3)] }),
    FK(6, { ...LOW, grip: 0.65, torso: 10, head: 10, armR: [60, 28], armL: [48, 26], root: [3, 25], face: 'hurt' }, { ease: 'out' }),
    FK(6, { ...LOW, grip: 0.6, torso: -1, head: 6, armR: [50, 38], armL: [40, 34], root: [-3, 27], face: 'dazed' }, { ease: 'out', fx: [ESTEAM(10, 40, 3)] }),
    FK(6, { ...LOW, grip: 0.65, torso: 9, head: 8, armR: [58, 30], armL: [46, 28], root: [2, 25], face: 'dazed' }, { ease: 'out' }),
  ] },
};
engineBodyAnims.run = engineBodyAnims.walk;
engineBodyAnims.flee = engineBodyAnims.walk;

// ---------------------------------------------------------------- projectile art
/** Cannon shell: brass casing with a cyan aether head and a hot tail. */
function drawShell(ctx, p, sx, sy) {
  const r = p.r, y = sy - r, f = p.facing;
  ctx.save(); ctx.translate(sx, y); ctx.scale(f, 1);
  ctx.fillStyle = 'rgba(77,240,224,0.30)'; ctx.beginPath(); ctx.ellipse(-r * 2, 0, r * 2.4, r * 0.9, 0, 0, TAU); ctx.fill();
  pathRR(ctx, -r * 1.6, -r * 0.8, r * 2.6, r * 1.6, r * 0.6);
  ctx.fillStyle = BRASSB; ctx.strokeStyle = OL; ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r, -r * 0.8); ctx.lineTo(r * 2.1, 0); ctx.lineTo(r, r * 0.8); ctx.closePath();
  ctx.fillStyle = CYAN; ctx.fill(); ctx.stroke();
  ctx.fillStyle = CYAN_HOT; ctx.fillRect(R(r * 1.1), -1, 3, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(R(-r * 1.4), R(-r * 0.7), R(r * 2), 1);
  ctx.restore();
}
/** Pocket-watch bomb: brass case, white dial, a hand that spins faster as the fuse runs out, blinking rim. */
function drawWatch(ctx, p, sx, sy) {
  const r = p.r, y = sy - r, hot = p.life < 40, blink = hot ? (p.life & 2) === 0 : (p.life & 8) === 0;
  ctx.beginPath(); ctx.arc(sx, y, r, 0, TAU);
  ctx.fillStyle = blink ? HOT : BRASSB; ctx.strokeStyle = OL; ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(sx, y, r - 2, 0, TAU); ctx.fillStyle = CREAM; ctx.fill();
  const a = (200 - p.life) * (hot ? 0.5 : 0.16);
  ctx.strokeStyle = '#2A2028'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + Math.cos(a) * (r - 3), y + Math.sin(a) * (r - 3)); ctx.stroke();
  ctx.fillStyle = BRASSB; ctx.fillRect(R(sx) - 2, R(y - r) - 3, 4, 3);
  if (blink) { ctx.fillStyle = 'rgba(255,210,122,0.35)'; ctx.beginPath(); ctx.arc(sx, y, r + 4, 0, TAU); ctx.fill(); }
}

// ================================================================ Vane on foot (hero rig x1.15, GDD 5.2 phase 3)
const VANE_PAL = { skin: SKIN, hair: QUEUE, primary: COAT, sleeve: SLEEVE, secondary: TROUSER, accent: BRASSB, metal: BLADE, dark: BOOTC, glow: CYAN };

/** Frock coat (torso space): near-black coat, cyan piping down the breast, wine waistcoat sliver and the cream cravat. */
function vaneCoat(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal;
  celPoly(ctx, rig, [-hw - 1, -H + 4, -hw + 3, -H, hw - 3, -H, hw + 2, -H + 4, hw + 1, R(-H * 0.45), hw - 1, 3, -hw + 1, 3, -hw - 2, R(-H * 0.45)], pal.primary, 0.36, 0.26);
  if (rig.override) return;
  const t = tones(rig, pal.primary);
  ctx.fillStyle = rig.col(WINE); ctx.fillRect(-3, -H + 7, 7, H - 6);                    // waistcoat under the lapels
  ctx.fillStyle = t.base; ctx.fillRect(-hw, -H + 3, R(W * 0.45), H);                    // near lapel over it
  ctx.fillStyle = t.deep; ctx.fillRect(R(-W * 0.06), -H + 5, 1, H - 4);
  ctx.fillStyle = rig.col(CYAN); ctx.fillRect(R(W * 0.14), -H + 6, 2, H - 5);           // cyan piping
  ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(R(W * 0.2), R(-H * 0.5), 3, 3); ctx.fillRect(R(W * 0.2), R(-H * 0.25), 3, 3);
  ctx.fillStyle = t.deep; ctx.fillRect(-6, -H, 12, 3);                                                // collar
  celPoly(ctx, rig, [-4, -H + 1, 4, -H + 1, 5, -H + 5, 0, -H + 8, -5, -H + 5], CREAM, 0.34, 0.3);      // cravat
}
/** Coat skirt over the hips (hip space): the coat front hangs to mid-thigh; the tails are the chains in the back layer. */
function vaneHips(ctx, rig, pose, inf) {
  const hw = R(inf.w / 2);
  celPoly(ctx, rig, [-hw - 1, -6, hw + 1, -6, hw + 3, 9, -hw - 3, 9], rig.palette.primary, 0.4, 0.2);
  if (rig.override) return;
  ctx.fillStyle = rig.col(CYAN); ctx.fillRect(-hw - 2, 6, hw * 2 + 5, 1);
  ctx.fillStyle = tones(rig, rig.palette.primary).deep; ctx.fillRect(-1, -6, 1, 15);
}
/**
 * Upper arm: charcoal coat sleeve with its cyan-piped cuff (near) / the clockwork arm's brass elbow collar (far).
 *
 * Both marks used to be painted flat on top of the sleeve: the cyan was 1 px, the brass was 3 px and sat at 0.45 of
 * the bone - mid-humerus, where a sleeve does not change - so neither could carry a line and neither was at a joint
 * (ART_STYLE 0.7 wants >= 4 px, on a joint). Each is now 4-5 px, sits ON the elbow, and is painted INSIDE the
 * sleeve's own inked silhouette under a clip, which is what 0.2's material-change exception asks for: a cuff is not
 * a second object stacked on an arm, it is the same arm changing material.
 * The cyan is kept, not dropped for being small: the piping is what says "Aetherwright" on a near-black coat, and
 * it is the same mark as the coat's breast piping and the hip hem.
 */
function vaneArmUpper(ctx, rig, pose, inf) {
  const r = inf.r, L = inf.len, pal = inf.pal;
  celCapsule(ctx, rig, 0, 0, 0, L, r, pal.sleeve);
  if (rig.override) return;
  ctx.save(); pathCap(ctx, 0, 0, 0, L, r); ctx.clip();
  if (!inf.far) { ctx.fillStyle = rig.col(CYAN); ctx.fillRect(-r, L - 4, r * 2, 4); }
  else { ctx.fillStyle = tones(rig, pal.accent).base; ctx.fillRect(-r, L - 5, r * 2, 5); }
  ctx.restore();
}
/**
 * Forearm: near = shirt cuff + skin; far = the clockwork arm (brass elbow gear, steel shaft, and the ram extended
 * while rig.fistOut). Both sides are ONE object per ART_STYLE 0.2.
 *
 * Near: the cream cuff had a 1 px shade seam under it, which is a faked boundary (0.2 forbids inking a material
 * change with a tone seam) and measured as a second 1.5 px crossing mid-forearm. The seam is gone - the cuff is now
 * clipped inside the arm's own inked silhouette, so the silhouette carries the ink and the cuff carries none.
 *
 * Far: the ram, the shaft and the brass elbow gear were three separately outlined objects, so the clockwork arm wore
 * a dark ring at the elbow and another where the ram left the shaft. They are one path now, stroked once and filled
 * once in steel, with the brass gear painted inside it under a clip. The 26 px ram offset is untouched: it is the
 * hardcoded coupling to vaneHand's fist.
 * The cyan moved from a 2 px stripe at 0.6 of the bone - mid-forearm, and only 2.3 px so it could not carry a line -
 * into the middle of the brass gear, where it reads as the aether core driving the arm and sits on the elbow. It is
 * a 4 px disc: kept, moved and made round so it stays a detail rather than a second band across the limb (0.7).
 */
function vaneArmLower(ctx, rig, pose, inf) {
  const r = inf.r, L = inf.len, pal = inf.pal;
  if (!inf.far) {
    celCapsule(ctx, rig, 0, 2, 0, L, r, pal.skin);
    if (rig.override) return;
    ctx.save(); pathCap(ctx, 0, 2, 0, L, r); ctx.clip();
    ctx.fillStyle = rig.col(CREAM); ctx.fillRect(-r, -1, r * 2, 5);
    ctx.restore();
    return;
  }
  const out = rig.fistOut ? 26 : 0, gr = r + 1;
  ctx.beginPath();
  if (out) pathTaperedCapsule(ctx, 0, L * 0.5, 0, L + out, r * 0.7, r * 0.7, true);
  ctx.rect(-r - 0.5, 0, r * 2 + 1, L);
  ctx.moveTo(gr, 0); ctx.arc(0, 0, gr, 0, TAU);
  celPath(ctx, rig, pal.metal, 0, R((L + out) * 0.5), (L + out + gr * 2) * 0.5, 0.38, 0.28);
  if (rig.override) return;
  ctx.save(); ctx.clip();                                    // still the silhouette path celPath just inked
  ctx.beginPath(); ctx.arc(0, 0, gr, 0, TAU);
  ctx.fillStyle = tones(rig, pal.accent).base; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU);
  ctx.fillStyle = rig.col(CYAN); ctx.fill();
  ctx.restore();
}
/** Hands: near = bare hand on the cane; far = the clockwork brass fist (ratchets on pose.handL.rot, rides the piston out). */
function vaneHand(ctx, rig, pose, inf) {
  if (!inf.far) { drawFist(ctx, rig, inf.r, inf.pal.skin); return; }
  const out = rig.fistOut ? 26 : 0;
  ctx.save(); ctx.translate(out, 0);
  drawFist(ctx, rig, inf.r, inf.pal.accent);
  if (!rig.override) {
    ctx.fillStyle = tones(rig, inf.pal.accent).deep; ctx.fillRect(R(inf.r * 0.4), R(-inf.r * 0.9), 2, R(inf.r * 1.8));
    ctx.fillStyle = rig.col(BLADE); ctx.fillRect(R(-inf.r * 0.5), R(-inf.r * 0.6), 3, 3);
  }
  if (rig.watch) {
    ctx.strokeStyle = rig.col(BRASSB); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(2, 3); ctx.lineTo(4, 9); ctx.stroke();
    celBall(ctx, rig, 4, 12, 3.4, BRASSB, false);
    if (!rig.override) { ctx.fillStyle = rig.col(CREAM); ctx.fillRect(2, 10, 4, 4); ctx.fillStyle = rig.col('#2A2028'); ctx.fillRect(4, 11, 1, 3); }
  }
  ctx.restore();
}
/** Head: lean skull with grey hair swept back to the queue (the chain is drawn by the hair hook). */
function vaneHead(ctx, rig, pose, inf) {
  drawSkull(ctx, rig, inf.r, inf.pal.skin, null, rig.build);
  if (rig.override) return;
  const r = inf.r;
  celPoly(ctx, rig, [r * 0.6, -r * 0.66, r * 0.2, -r * 1.0, -r * 0.5, -r * 0.95, -r * 0.92, -r * 0.55, -r * 0.86, -r * 0.15, -r * 0.5, -r * 0.42, r * 0.2, -r * 0.6], QUEUE, 0.4, 0.28);
}
/** Grey queue: a 3-segment chain hanging down the back of the neck (head space). */
function vaneQueue(ctx, rig, pose, inf) {
  const r = inf.r;
  const ch = getChain(rig, 'queue', 3, { joint: 'head', rest: [-0.4, 1], stiffness: 0.15, damping: 0.68, gain: 2.2, rotGain: 0.7, maxAng: 30 });
  ctx.save(); ctx.translate(R(-r * 1.0), R(r * 0.2));
  for (let i = 0; i < ch.n; i++) {
    ctx.rotate(rad(ch.ang[i] + (i ? 0 : 10)));
    celPoly(ctx, rig, [-2, 0, 2, 0, 1.6, 6, -1.6, 6], i ? QUEUE : tones(rig, QUEUE).sh, 0.42, 0);
    ctx.translate(0, 5);
  }
  if (!rig.override) { ctx.fillStyle = rig.col(CYAN); ctx.fillRect(-2, 0, 4, 2); }
  ctx.restore();
}
/** Face: the standard big-feature face plus brass spectacles with a glint (never on the eye row: the rims frame it). */
function vaneFace(ctx, rig, pose, inf) {
  const r = inf.r;
  drawFace(ctx, rig, r, pose.face | 0, rig.faceOpts);
  if (rig.override) return;
  const ey = R(-r * 0.15) - 1, ex = R(r * 0.45), fx = R(-r * 0.12);
  ctx.strokeStyle = rig.col(BRASSB); ctx.lineWidth = 1;
  ctx.strokeRect(ex - 2.5, ey - 2.5, 7, 7); ctx.strokeRect(fx - 2.5, ey - 2.5, 6, 7);
  ctx.beginPath(); ctx.moveTo(fx + 3.5, ey + 0.5); ctx.lineTo(ex - 2.5, ey + 0.5); ctx.moveTo(ex + 4.5, ey - 1.5); ctx.lineTo(R(r * 1.05), ey - 3.5); ctx.stroke();
  ctx.fillStyle = rig.col((pose.face | 0) === FACE.dazed ? '#8A96A4' : '#FFFFFF'); ctx.fillRect(ex + 1, ey - 2, 2, 2);
}
/** Top hat with a brass gauge on the band; it comes off when he goes down (face: dazed) — see vaneDropped. */
function vaneHat(ctx, rig, pose, inf) {
  if ((pose.face | 0) === FACE.dazed) return;
  const r = inf.r, brim = R(-r * 0.98), h = R(r * 1.9);
  celRect(ctx, rig, -r - 4, brim - 2, r * 2 + 8, 4, 1, HATC, 0.42, 0);
  celRect(ctx, rig, -r + 1, brim - h, r * 2 - 2, h, 1, HATC, 0.32, 0.26);
  if (rig.override) return;
  ctx.fillStyle = rig.col('#0B0C12'); ctx.fillRect(-r + 1, brim - 7, r * 2 - 2, 5);
  celBall(ctx, rig, R(r * 0.35), brim - 5, 3, BRASSB, false);
  ctx.fillStyle = rig.col(CYAN); ctx.fillRect(R(r * 0.35) - 1, brim - 6, 2, 2);
  rimTop(ctx, rig, -r + 3, brim - h, R(r * 0.6), brim - h, '#3A3A46');
}
/** Boot: dark leather with a light-steel toe cap and one brass buckle (ankle space). */
function vaneBoot(ctx, rig, pose, inf) {
  drawBoot(ctx, rig, inf.w, inf.h, inf.pal.dark, inf.pal.accent);
  if (rig.override) return;
  const toe = R(inf.w * 0.62);
  ctx.fillStyle = rig.col(inf.pal.metal); ctx.fillRect(toe - 5, -1, 5, 4);
  ctx.fillStyle = tones(rig, inf.pal.metal).sh; ctx.fillRect(toe - 5, 2, 5, 1);
}
/** Cane-sword (hand space, +x along the shaft): brass knob and ferrule; pose.grip slides the bright blade out of the cane. */
function vaneCane(ctx, rig, pose) {
  const g = pose.grip || 0;
  if ((pose.face | 0) === FACE.dazed) return;                     // dropped when he goes down
  const L = g > 0.02 ? 30 - g * 9 : 30;                           // the sheath shortens as the blade slides out
  celRect(ctx, rig, -3, -2.5, L, 5, 2, '#2A2C38', 0.4, 0.24);
  if (g > 0.02) {
    celRect(ctx, rig, L - 4, -2, 8 + g * 24, 4, 1, BLADE, 0.4, 0.3);
    if (!rig.override) { ctx.fillStyle = tones(rig, BLADE).hi; ctx.fillRect(R(L), -1, R(4 + g * 20), 1); }
  }
  celBall(ctx, rig, -3, 0, 4, BRASSB, false);
  if (rig.override) return;
  ctx.fillStyle = rig.col(BRASSB); ctx.fillRect(4, -3, 3, 6); ctx.fillRect(R(L) - 6, -3, 3, 6);
  ctx.fillStyle = rig.col(CYAN); ctx.fillRect(-4, -1, 2, 2);
}
/** Coat tails: two 2-segment chains off the back of the coat (back accessory, torso space). */
function vaneTails(ctx, rig) {
  const p = rig.p, H = p.torsoH, hw = R(p.torsoW / 2);
  const ch = getChain(rig, 'tails', 2, { joint: 'torso', rest: [-0.35, 1], stiffness: 0.14, damping: 0.7, gain: 2.4, rotGain: 0.5, maxAng: 34 });
  for (let s = 0; s < 2; s++) {
    ctx.save(); ctx.translate(s ? -hw + 3 : hw - 5, R(-H * 0.2));
    for (let i = 0; i < ch.n; i++) {
      ctx.rotate(rad(ch.ang[i] * (s ? 1.15 : 0.85) + (i ? 2 : 6)));
      celPoly(ctx, rig, [-4, 0, 4, 0, 3, 11, -4, 11], s ? COAT : SLEEVE, 0.42, 0.18);
      if (!rig.override) { ctx.fillStyle = rig.col(s ? '#1E5E5C' : CYAN); ctx.fillRect(2, 1, 1, 10); }
      ctx.translate(0, 10);
    }
    ctx.restore();
  }
}
/** Pocket watch on its chain at the hip (hip accessory); it is in his hand instead while rig.watch. */
function vaneWatch(ctx, rig) {
  if (rig.watch || rig.override) return;
  const hw = R(rig.p.hip / 2);
  ctx.strokeStyle = rig.col(BRASSB); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hw - 6, -2); ctx.quadraticCurveTo(hw - 1, 3, hw - 3, 6); ctx.stroke();
  celBall(ctx, rig, hw - 3, 8, 3, BRASSB, false);
  ctx.fillStyle = rig.col(CREAM); ctx.fillRect(hw - 5, 7, 3, 3);
}
/** The hat and cane on the floor once he is down (root accessory, face: dazed). */
function vaneDropped(ctx, rig, pose) {
  if ((pose.face | 0) !== FACE.dazed || rig.override) return;
  // undo the root offset / rotation so the hat and cane lie on the floor where they fell, not on the falling body
  ctx.save(); ctx.rotate(-rad(pose.root.rot)); ctx.translate(-pose.root.x, -pose.root.y);
  celRect(ctx, rig, -30, -4, 15, 4, 1, HATC, 0.4, 0.2);
  celRect(ctx, rig, -28, -11, 10, 8, 2, HATC, 0.34, 0.26);
  ctx.fillStyle = rig.col(BRASSB); ctx.fillRect(-26, -8, 3, 3);
  celRect(ctx, rig, 16, -4, 28, 4, 2, '#2A2C38', 0.4, 0.2);
  celBall(ctx, rig, 16, -2, 4, BRASSB, false);
  ctx.restore();
}

const VANE_BUILD = {
  scale: 1.15, palette: VANE_PAL, outline: '#191622', outlineWidth: 1, smearColor: BLADE,
  face: { brow: '#6E6E7A', eyeY: -1 }, hairStyle: 'bald', jaw: 0.3,
  proportions: { headR: 8.5, neck: 3.5, neckR: 3, torsoW: 19, torsoH: 27, hip: 15, upperArm: 14, lowerArm: 13, armR: 3.8, handR: 4.6,
    upperLeg: 17, lowerLeg: 17, legR: 4.6, footL: 11, footH: 5, shoulderX: 3, hipX: 4, bulge: 0.35 },
  parts: { torso: vaneCoat, hips: vaneHips, head: vaneHead, hair: vaneQueue, face: vaneFace, hat: vaneHat,
    armUpper: vaneArmUpper, armLower: vaneArmLower, hand: vaneHand, foot: vaneBoot },
  weapon: { attach: 'handR', length: 30, draw: vaneCane, headAt: 24 },
  accessories: [{ attach: 'back', draw: vaneTails }, { attach: 'hip', draw: vaneWatch }, { attach: 'root', draw: vaneDropped }],
};

// ---------------------------------------------------------------- Vane animations
/** Rest carry: the cane held low at the side, ferrule just off the floor in front; the clockwork arm hangs back and visible. */
const VC = { armR: [30, 30], weapon: 40, armL: [-26, 16], grip: 0, handL: 0, legR: [8, 3], legL: [-8, 3], torso: -1, head: 0 };
const VBASE = makeBrassBase(VC, { weaponFloor: 10 });
const AD = (a, du, dl) => [a[0] + du, a[1] + dl];
/** Vane walk / run key. */
const vw = (lr, ll, al, ty, sq, hd) => ({ ...VC, legR: lr, legL: ll, armL: al, armR: AD(VC.armR, 2, -2), torso: 2, head: hd || 0, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1 });
const vr = (lr, ll, al, ty, sq) => ({ ...VC, legR: lr, legL: ll, armL: al, armR: [50, -10], weapon: 20, torso: 20, head: -8, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, face: 'angry' });
const flurryHit = (dmg, type, kbY) => frontBox(44, { damage: dmg, type, kbX: 2, kbY: kbY || 0, hitstun: 14 });
const SLASH_UP = { kind: 'slash', x: 30, y: 60, radius: 34, angle: -70 };
const FIST_BOX = frontBox(100, { damage: 18, type: 'knockdown', kbX: 6, kbY: 4, hitstun: 16 });
const WATCH_SPEC = { style: 'watch', aimAt: true, flight: 40, gravity: 0.4, noContactHit: true, bounces: 0, rest: true, life: 130, onExpire: 'explode', radius: 40,
  explodeHit: { damage: 16, type: 'knockdown', kbX: 5, kbY: 5 }, color: BRASSB, r: 7, muzzle: false, offsetX: 10, offsetY: 50, draw: drawWatch };
/** Cane Flurry thrust / recovery pair (the string alternates them; `k` nudges the lunge deeper each time). */
const vThrust = (k) => ({ ...VC, grip: 1, armR: [96, -8], weapon: 8, armL: [-46, 24], torso: 16, head: 4, root: [4 + k, 0], legR: [40, 8], legL: [-30, 26], face: 'shout' });
const vCoil = (k) => ({ ...VC, grip: 1, armR: [32, 40], weapon: -8, armL: [-38, 20], torso: 6, head: -2, root: [1 + k, 0], legR: [26, 14], legL: [-22, 22], face: 'angry' });

/** @type {AnimSet} */
const vaneAnims = {
  ...VBASE,
  // idle: an unhurried fencer's rest — weight on the back foot, cane at the side, coat tails and queue drifting
  idle: { loop: true, frames: [
    FK(14, { ...VC, torso: -1, root: [0, 0] }, { ease: 'inout' }),
    FK(12, { ...VC, torso: 1, head: 2, root: [0, 1], armR: AD(VC.armR, 2, -2), armL: AD(VC.armL, -3, -2), weapon: 44, squash: 1.01, stretch: 0.99 }, { ease: 'inout' }),
    FK(14, { ...VC, torso: 0, head: 1, root: [0, 1], armR: AD(VC.armR, 1, -1), weapon: 42 }, { ease: 'inout' }),
    FK(12, { ...VC, torso: -2, head: -1, root: [0, 0], armR: AD(VC.armR, -1, 1), armL: AD(VC.armL, 3, 2), weapon: 38 }, { ease: 'inout' }),
  ] },
  walk: { loop: true, frames: [
    FK(4, vw([30, 4], [-26, 18], [16, 8], 0, 0, 0), { ease: 'out' }),
    FK(4, vw([22, 14], [-16, 30], [8, 6], 2, 1.03, 1), { ease: 'out' }),
    FK(4, vw([6, 26], [0, 12], [-8, 4], 1, 0, 1), { ease: 'inout' }),
    FK(4, vw([-10, 14], [18, 0], [-24, 2], -1, 0, -1), { ease: 'in' }),
    FK(4, vw([-26, 18], [30, 4], [-36, 0], 0, 0, 0), { ease: 'out' }),
    FK(4, vw([-16, 30], [22, 14], [-30, 2], 2, 1.03, 1), { ease: 'out' }),
    FK(4, vw([0, 12], [6, 26], [-18, 4], 1, 0, 1), { ease: 'inout' }),
    FK(4, vw([18, 0], [-10, 14], [0, 6], -1, 0, -1), { ease: 'in' }),
  ] },
  run: { loop: true, frames: [
    FK(3, vr([44, 10], [-34, 44], [-70, 30], -2), { ease: 'out' }),
    FK(3, vr([44, 30], [-32, 74], [-50, 34], 1, 1.04), { ease: 'out' }),
    FK(3, vr([10, 44], [10, 30], [-20, 40], -4), { ease: 'inout' }),
    FK(3, vr([-24, 44], [36, 6], [10, 44], -3), { ease: 'in' }),
    FK(3, vr([-34, 44], [44, 10], [30, 40], -2), { ease: 'out' }),
    FK(3, vr([-32, 74], [44, 30], [10, 36], 1, 1.04), { ease: 'out' }),
    FK(3, vr([10, 30], [10, 44], [-20, 34], -4), { ease: 'inout' }),
    FK(3, vr([36, 6], [-24, 44], [-50, 30], -3), { ease: 'in' }),
  ] },
  hurt: { loop: false, frames: [
    FK(4, { ...VC, torso: -26, head: -24, armL: [-70, -26], armR: [4, 60], weapon: 10, root: [-5, 1], legR: [22, 4], legL: [-14, 12], face: 'hurt' }, { ease: 'out' }),
    FK(10, { ...VC, torso: -12, head: -10, armL: [-44, -12], armR: [16, 46], weapon: 26, root: [-2, 1], legR: [14, 2], legL: [-10, 8], face: 'hurt' }, { ease: 'out' }),
    FK(6, { ...VC, torso: -1 }, { ease: 'out' }),
  ] },
  // 1. CANE FLURRY (p3.1) — a 20f bow with a flourish, then five thrusts, the last one launching; 30f recovery
  caneFlurry: { loop: false, frames: [
    FK(12, { ...VC, grip: 0, armR: [-30, 40], weapon: 80, armL: [-60, -30], torso: 18, head: 10, root: [-2, 1], legR: [18, 8], legL: [-14, 12], face: 'happy' }, { tell: true, sfx: 'chime', ease: 'in' }),
    FK(8, { ...VC, grip: 1, armR: [4, 70], weapon: 30, armL: [-52, 26], torso: -6, head: -6, root: [-4, 0], legR: [24, 10], legL: [-20, 18], squash: 0.97, stretch: 1.03, face: 'angry' }, { tell: true, ease: 'out' }),
    FK(5, vThrust(0), { hitbox: flurryHit(8, 'light'), sfx: 'rapier', smear: { from: -6, to: 16, a: 0.3, r: 36 }, ease: 'overshoot' }),
    FK(5, vCoil(0), { ease: 'in' }),
    FK(5, vThrust(1), { hitbox: flurryHit(8, 'light'), sfx: 'rapier', smear: { from: -4, to: 18, a: 0.3, r: 36 }, ease: 'overshoot' }),
    FK(5, vCoil(1), { ease: 'in' }),
    FK(5, vThrust(2), { hitbox: flurryHit(8, 'light'), sfx: 'rapier', smear: { from: -6, to: 16, a: 0.3, r: 36 }, ease: 'overshoot' }),
    FK(5, vCoil(2), { ease: 'in' }),
    FK(5, { ...vThrust(3), armR: [104, -12], torso: 20, face: 'shout' }, { hitbox: flurryHit(8, 'medium'), sfx: 'rapier', smear: { from: -8, to: 20, a: 0.35, r: 38 }, ease: 'overshoot' }),
    FK(5, { ...VC, grip: 1, armR: [-20, 80], weapon: 40, armL: [-40, 20], torso: -14, head: -8, root: [2, 1], legR: [30, 12], legL: [-24, 20], face: 'angry' }, { ease: 'in' }),
    FK(6, { ...VC, grip: 1, armR: [186, -34], weapon: -30, armL: [-30, 18], torso: -18, head: -12, root: [5, -6], legR: [34, 6], legL: [-26, 16], face: 'shout' },
      { hitbox: flurryHit(8, 'launch', 8), sfx: 'rapier_arc', smear: { from: 70, to: -110, a: 0.55, r: 50 }, ease: 'overshoot', fx: [SLASH_UP] }),
    FK(30, { ...VC, grip: 1, armR: [150, -10], weapon: 40, armL: [-24, 20], torso: -6, head: -4, root: [3, 1], legR: [24, 10], legL: [-20, 16], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...VC, torso: 2 }, { ease: 'out' }),
  ] },
  // 2. CLOCKWORK FIST (p3.2) — the arm ratchets 360 deg over 30f (pose.handL.rot), then pistons 100px out; 40f extended punish
  clockworkFist: { loop: false, frames: [
    FK(18, { ...VC, armL: [-60, 30], handL: 260, armR: [26, 40], weapon: 60, torso: -6, head: -4, root: [-3, 0], legR: [18, 8], legL: [-16, 12], face: 'angry' }, { tell: true, sfx: 'gear_slip', ease: 'in' }),
    FK(12, { ...VC, armL: [-96, 46], handL: 620, armR: [22, 44], weapon: 66, torso: -12, head: -8, root: [-6, 0], legR: [14, 8], legL: [-20, 14], squash: 0.97, stretch: 1.03, face: 'angry' }, { tell: true, ease: 'out' }),
    FK(10, { ...VC, armL: [68, -4], handL: 720, armR: [10, 50], weapon: 40, torso: 22, head: 6, root: [6, 1], legR: [42, 8], legL: [-32, 28], squash: 1.04, stretch: 0.96, face: 'shout' },
      { hitbox: FIST_BOX, move: { x: 4 }, sfx: 'piston', ease: 'overshoot', fx: [{ kind: 'slash', x: 76, y: 48, radius: 22, angle: 0, sweep: 30 }, { kind: 'steam', x: 40, y: 46, count: 3 }] }),
    FK(40, { ...VC, armL: [70, -2], handL: 720, armR: [12, 48], weapon: 42, torso: 16, head: 2, root: [5, 1], legR: [36, 8], legL: [-28, 24], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...VC, torso: 2 }, { ease: 'out' }),
  ] },
  // 3. POCKET-WATCH BOMB (p3.3) — he plucks the watch from the waistcoat (rig.watch) and lobs it underarm
  watchBomb: { loop: false, frames: [
    FK(12, { ...VC, armL: [-44, 70], armR: [24, 36], torso: 4, head: 6, root: [-2, 0], legR: [14, 6], legL: [-12, 10], face: 'happy' }, { tell: true, sfx: 'time_stop_tick', event: 'aim', ease: 'in' }),
    FK(8, { ...VC, armL: [-84, 40], armR: [20, 40], torso: -8, head: -4, root: [-4, 0], legR: [12, 6], legL: [-16, 12], squash: 0.98, stretch: 1.02, face: 'angry' }, { tell: true, ease: 'out' }),
    FK(6, { ...VC, armL: [86, -14], armR: [14, 44], torso: 18, head: 4, root: [4, 1], legR: [34, 8], legL: [-26, 22], squash: 1.03, stretch: 0.97, face: 'shout' },
      { event: 'spawnProjectile', projectile: WATCH_SPEC, sfx: 'throw', smear: { from: -110, to: 20, a: 0.35, r: 40 }, ease: 'overshoot' }),
    FK(26, { ...VC, armL: [60, 6], armR: [18, 40], torso: 10, head: 0, root: [2, 1], legR: [26, 8], legL: [-22, 18], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...VC, torso: 2 }, { ease: 'out' }),
  ] },
  // 4. AETHER STEP (p3.4) — a cyan puff, he folds into the coat and is gone; he reappears behind with the cane already up
  aetherStep: { loop: false, frames: [
    FK(6, { ...VC, armR: [-40, 50], weapon: 60, armL: [-50, -20], torso: -8, head: -6, root: [0, 2], legR: [20, 14], legL: [-16, 16], face: 'closed' }, { tell: true, sfx: 'aether_step', ease: 'in', fx: [{ kind: 'ring', x: 0, y: 30, r0: 4, r1: 40, color: CYAN }] }),
    FK(4, { ...VC, armR: [-70, 70], weapon: 40, armL: [-70, -10], torso: -16, head: -10, root: [0, 6], legR: [34, 30], legL: [-26, 30], squash: 1.06, stretch: 0.94, face: 'closed' }, { tell: true, ease: 'out' }),
    FK(20, { ...VC, grip: 1, armR: [-10, 86], weapon: -20, armL: [-56, 30], torso: -10, head: -6, root: [0, 3], legR: [26, 16], legL: [-22, 20], face: 'angry' },
      { event: 'teleportBehind', invuln: true, sfx: 'aether_step', ease: 'out', fx: [{ kind: 'ring', x: 0, y: 40, r0: 6, r1: 56, color: CYAN }, { kind: 'steam', x: 0, y: 30, count: 5 }] }),
    FK(6, { ...VC, grip: 1, armR: [10, 70], weapon: 10, armL: [-40, 22], torso: -4, head: -2, root: [0, 1], legR: [18, 10], legL: [-14, 14], face: 'angry' }, { punish: true, ease: 'out' }),
    FK(6, { ...VC, torso: 2 }, { ease: 'out' }),
  ] },
  // phase change: the Regent Engine goes up, Vane leaps clear of the wreck and lands on the dais with the cane drawn
  phaseChange: { loop: false, frames: [
    FK(14, { ...VC, root: [-4, -46], legR: [46, -54], legL: [16, -44], armR: [-70, 30], weapon: 70, armL: [-150, -30], torso: -10, head: -14, face: 'angry' }, { sfx: 'explosion_big', ease: 'out' }),
    FK(10, { ...VC, root: [-2, -18], legR: [28, -22], legL: [8, -18], armR: [-30, 44], weapon: 60, armL: [-110, -20], torso: 4, head: -8, face: 'angry' }, { ease: 'in' }),
    FK(10, { ...VC, root: [0, 5], legR: [34, 48], legL: [-26, 50], armR: [10, 60], weapon: 30, armL: [-60, 20], torso: 22, head: 4, squash: 1.14, stretch: 0.88, face: 'grit' }, { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }] }),
    FK(12, { ...VC, grip: 1, torso: -6, head: -6, armR: [-20, 76], weapon: 20, armL: [-40, 20], root: [0, 1], legR: [20, 10], legL: [-16, 14], face: 'angry' }, { ease: 'out', sfx: 'chime' }),
    FK(10, { ...VC }, { ease: 'out' }),
  ] },
  // defeat: the cane and hat drop (face: dazed -> vaneDropped), he goes to one knee under the blowing valves, then falls
  defeat: { loop: false, frames: [
    FK(24, { ...VC, torso: -16, head: -20, armR: [-16, 70], weapon: 20, armL: [-70, -40], root: [-3, 0], legR: [24, 6], legL: [-18, 14], face: 'hurt' }, { sfx: 'boss_defeat', ease: 'out' }),
    FK(20, { ...VC, torso: 20, head: 12, armR: [40, 40], armL: [30, 30], root: [0, 8], legR: [66, 66], legL: [-24, 40], squash: 1.08, stretch: 0.92, face: 'dazed' }, { ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }, { kind: 'steam', x: -30, y: 0, count: 6 }] }),
    FK(24, { ...VC, torso: 30, head: 16, armR: [64, 30], armL: [54, 26], root: [0, 12], legR: [78, 70], legL: [-20, 44], face: 'dazed' }, { ease: 'inout', fx: [{ kind: 'steam', x: 34, y: 0, count: 6 }] }),
    FK(60, { armR: [-24, -6], weapon: 0, armL: [26, 18], torso: 4, head: -12, legR: [12, 10], legL: [-4, 8], root: [-28, -9, 88], face: 'dazed' }, { ease: 'in' }),
  ] },
};
vaneAnims.flee = vaneAnims.run;

/** Chancellor Aurelius Vane definition (gameplay data unchanged; art + animation pass only). */
export const boss = {
  id: 'boss', type: 'boss', variant: 'vane', name: 'CHANCELLOR AURELIUS VANE', subtitle: 'THE AETHERWRIGHT', role: 'boss', bossKind: 'boss', boss: true, music: 'boss',
  build: ENGINE_BUILD, anims: engineAnims, score: 15000, drops: ['food_big', 'meter', 'score_big'], grabbable: false, throwDamageMult: 1,
  sfx: { hurt: 'brass_hit', death: 'boss_defeat' },
  hooks: {
    // art-only rig state: saw spin-up / jam, cannon charge and vent, Vane's pocket watch, the chest slit, the fist piston,
    // and the eased core-cover opening (Core Vent) that the barrel hook draws.
    onUpdate(f) {
      const rig = f.rig, a = f.anim, n = a.name, i = a.frameIndex;
      const target = f.flags && f.flags.coreOpen ? 1 : 0;
      rig.coreT = (rig.coreT || 0) + (target - (rig.coreT || 0)) * 0.12;
      rig.watch = n === 'timeStop' || n === 'watchBomb';
      rig.boltTell = n === 'boltSpray' && i <= 1;
      rig.cannonCharge = n === 'cannonVolley' && i <= 1;
      rig.cannonVent = n === 'cannonVolley' && i >= 7;
      rig.sawFast = n === 'sawSweep' && i >= 1 && i <= 4;
      rig.sawJam = n === 'sawSweep' && i === 5;
      rig.fistOut = n === 'clockworkFist' && i >= 2 && i <= 3;
      if (rig.sawFast) rig.sawAngle = (rig.sawAngle || 0) + 0.4;
      if (rig.coreT > 0.4 && f.world && (f.world.frame & 7) === 0) particles.burst('steam', f.x, f.h * 0.5, f.z, 3, { speed: 1.2, up: 1.6, sizeJitter: 2 });
    },
    // the Regent Engine tears itself apart between phases (GDD 5.2: legs collapse, then the body explodes and Vane leaps clear)
    onPhase(f, i, world) {
      if (!world) return;
      const y = f.h * 0.5;
      if (i === 1) {
        particles.burst('steam', f.x, y, f.z, 12, { speed: 1.8, up: 2, sizeJitter: 2 });
        particles.burst('gear', f.x, y * 0.6, f.z, 5, { speed: 3, up: 3.5, color: BRASSB });
        world.addFx('ring', f.x, 30, f.z, { r0: 10, r1: 130, color: HOT });
        return;
      }
      particles.burst('ember', f.x, y, f.z, 24, { speed: 4.5, up: 4 });
      particles.burst('smoke', f.x, y, f.z, 14, { speed: 1.5, up: 2, sizeJitter: 2 });
      particles.burst('gear', f.x, y, f.z, 6, { speed: 3.5, up: 4.5, color: BRASSB });
      world.addFx('ring', f.x, 40, f.z, { r0: 12, r1: 160, color: CYAN });
    },
  },
  ai: { attackRange: 70, zTolerance: 20, attackCooldown: [50, 90], firstAttackDelay: 40, ignoresTokens: true, retreatChance: 0, staggerEvery: 0, flank: false },
  phases: [
    { name: 'REGENT ENGINE - LEGS', hp: 450, color: '#4DF0E0', armor: true, unlaunchable: true, walkSpeed: 0.9, phaseIndex: 0,
      ai: { attacks: [{ anim: 'stomp', range: 90, weight: 4 }, { anim: 'cannonVolley', range: 420, minRange: 70, weight: 3 }, { anim: 'timeStop', range: 120, weight: 2 }, { anim: 'summonEscort', range: 500, weight: 2, maxUses: 2 }] } },
    { name: 'REGENT ENGINE - BODY', hp: 450, color: '#C9963A', armor: true, unlaunchable: true, walkSpeed: 0.7, phaseIndex: 1, anims: engineBodyAnims, hurtboxScale: 0.7,
      vent: { everyHp: 150, frames: 120, flag: 'coreOpen', damageMult: 2, stall: true, text: 'CORE EXPOSED!' },
      ai: { attacks: [{ anim: 'sawSweep', range: 500, weight: 4 }, { anim: 'boltSpray', range: 420, minRange: 50, weight: 3 }, { anim: 'cannonVolley', range: 420, minRange: 70, weight: 2 }], attackCooldown: [45, 80] } },
    { name: 'CHANCELLOR VANE', hp: 250, color: '#F4F1E8', armor: false, unlaunchable: false, grabbable: true, walkSpeed: 2.6, build: VANE_BUILD, anims: vaneAnims, phaseIndex: 2, damageMult: 1,
      ai: { attackRange: 46, zTolerance: 12, attacks: [{ anim: 'caneFlurry', range: 60, weight: 4 }, { anim: 'clockworkFist', range: 120, minRange: 40, weight: 3 }, { anim: 'watchBomb', range: 300, minRange: 60, weight: 2 }, { anim: 'aetherStep', range: 400, minRange: 50, weight: 2 }],
        attackCooldown: [30, 60], hoverCircle: true, blinkOnDamage: 60 } },
  ],
};
