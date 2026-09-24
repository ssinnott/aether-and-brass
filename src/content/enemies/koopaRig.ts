// THE KOOPA TRIO: shared rig, base animation set and strike skeleton for the three shell-backed dragon-turtle
// kings (content/enemies/koopaVolcano.ts, koopaTin.ts, koopaEarth.ts). They are drawn after the Super Mario Bros.
// king of the koopas — horned snouted head, spiked shell on the back, pale belly plates, spiked cuffs and collar,
// clawed hands and feet, a short tail — and each one is that same body built out of a different material:
//   volcano  basalt-red scales, an obsidian shell whose spikes are little volcanoes, a mane of flame
//   tin      a riveted tin body (the Wizard of Oz's Tin Man): funnel hat, a red heart behind the belly plate
//   earth    a body of vines, a head made entirely of DIRT, a STONE shell, and spikes, horns and claws of thorny vine
// One body plan, three materials: the build's `koopa` block (KoopaLook) is the only thing the part hooks read to
// tell them apart, so the three read as one family when they come on together, which is how the stage will field them.
//
// Every part here is a lib/art/rig.ts part hook or accessory, so the trio shades, flashes and far-shades exactly like
// the rest of the cast: cel fills through lib/art/shading.ts, `rig.override` honoured before any detail mark, and
// every far-side colour taken from `inf.pal` rather than the near palette.
import { celPoly, celCapsule, celTaper, celBall, tones, band, rimTop, flat } from '../../lib/art/shading.ts';
import { drawFist } from '../../lib/art/rigParts.ts';
import { FACE } from '../../lib/art/poses.ts';
import { FK, P } from './common.ts';

const R = Math.round;

/**
 * What makes one king out of the shared body (`build.koopa`). Colours only, plus the three switches the parts branch
 * on: `kind` picks the material family, `funnel` puts the Tin Man's hat on, `dirtHead` swaps the scaled skull for a
 * clod of earth.
 */
export interface KoopaLook {
  kind: 'volcano' | 'tin' | 'earth';
  /** The shell dome, and its rim band. */
  shell: string;
  rim: string;
  /** Shell spikes, collar spikes and cuff spikes. */
  spike: string;
  /** The spike tips (a volcano's crater glow, a vine's thorn point). */
  tip: string;
  /** Horns and claws. */
  horn: string;
  claw: string;
  /** The collar and the wrist cuffs. */
  cuff: string;
  /** The pupil. */
  eye: string;
  /** Inside of the open mouth. */
  maw: string;
  /** Lower jaw / muzzle (Bowser's pale jaw). */
  jaw: string;
  funnel?: boolean;
  dirtHead?: boolean;
}

/** An ellipse as a flat [x, y, ...] polygon (celPoly takes points, not arcs, so the cel ramp can clip it). */
function ell(cx: number, cy: number, rx: number, ry: number, n = 14, a0 = 0, a1 = Math.PI * 2): number[] {
  const out = [];
  const closed = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  const steps = closed ? n : n - 1;
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    out.push(R(cx + Math.cos(a) * rx), R(cy + Math.sin(a) * ry));
  }
  return out;
}
/** Scale a flat point list given in head radii. */
const S = (r: number, pts: number[]) => pts.map((v) => R(v * r));
const K = (rig): KoopaLook => rig.build.koopa;

// ---------------------------------------------------------------- the head
/**
 * The skull (head hook, head space: origin at the head centre, +x toward the facing, y down). Drawn back to front:
 * the far horn, the mane, the near horn, the cranium, the snout and the jaw. The jaw drops on `shout` (the roar every
 * king opens his fights with) and a little on `angry`, so the face reads at 1x without a mouth line.
 */
export function koopaHead(ctx, rig, pose, inf) {
  const r = inf.r, k = K(rig), skin = inf.pal.skin, face = pose.face | 0;
  const open = face === FACE.shout ? 0.34 : face === FACE.angry || face === FACE.grit ? 0.1 : 0;
  // far horn first: it sits behind everything and takes the horn's shadow tone so the pair reads as two
  const hornFar = tones(rig, k.horn).sh;
  celPoly(ctx, rig, S(r, [-0.55, -0.72, -0.22, -0.84, -0.42, -1.3, -0.9, -1.74, -0.68, -1.22]), hornFar, 0.34, 0);
  // the mane: flame on the volcano, leaves on the earth king, nothing at all on the tin man (his funnel is the crown)
  if (k.kind !== 'tin') {
    celPoly(ctx, rig, S(r, [-0.15, -0.92, -0.58, -1.36, -0.66, -0.98, -1.24, -1.12, -1.02, -0.64, -1.6, -0.46, -1.12, -0.2,
      -1.42, 0.18, -0.9, 0.24, -0.5, -0.22]), inf.pal.hair, 0.3, 0.3);
  }
  // cranium: a clod of dirt on the earth king (the palette's `dark`), scales on the other two
  const crown = k.dirtHead ? inf.pal.dark : skin;
  celPoly(ctx, rig, ell(R(-0.12 * r), R(-0.12 * r), R(r), R(r * 0.94), 14), crown, 0.34, 0.3);
  // the snout: the broad, flat, forward muzzle that makes the silhouette a koopa's and not a man's
  celPoly(ctx, rig, S(r, [0.12, -0.58, 1.02, -0.52, 1.5, -0.28, 1.64, 0.04, 1.48, 0.32, 0.22, 0.36]), crown, 0.34, 0.28);
  // mouth interior, then the lower jaw hinged under it
  if (open > 0) celPoly(ctx, rig, S(r, [0.24, 0.3, 1.4, 0.28, 1.34, 0.3 + open, 0.24, 0.36 + open * 0.3]), k.maw, 0.2, 0);
  celPoly(ctx, rig, S(r, [0.06, 0.3 + open * 0.3, 1.36, 0.3 + open, 1.28, 0.62 + open, 0.86, 0.8 + open * 0.8, 0.06, 0.78]), k.jaw, 0.34, 0.24);
  // near horn, over the cranium: the one that carries the silhouette's two points
  celPoly(ctx, rig, S(r, [-0.08, -0.78, 0.28, -0.88, 0.08, -1.36, -0.34, -1.84, -0.18, -1.3]), k.horn, 0.34, 0.3);
  if (rig.override) return;
  const t = tones(rig, crown);
  // brow ridge: the heavy scowl the whole face hangs off, as a tone step (one material, no ink)
  ctx.fillStyle = t.sh; ctx.fillRect(R(0.02 * r), R(-0.66 * r), R(0.9 * r), 3);
  ctx.fillStyle = t.deep; ctx.fillRect(R(0.2 * r), R(0.3 * r), R(1.2 * r), 1);   // the lip line over the jaw
  if (k.dirtHead) {
    // pebbles pressed into the clod: the read that says "earth", not "brown skin"
    ctx.fillStyle = rig.col(inf.pal.metal);
    ctx.fillRect(R(-0.6 * r), R(-0.5 * r), 3, 2); ctx.fillRect(R(-0.3 * r), R(0.3 * r), 2, 2); ctx.fillRect(R(0.9 * r), R(-0.12 * r), 2, 2);
    ctx.fillStyle = t.deep; ctx.fillRect(R(-0.75 * r), R(0.05 * r), 2, 2); ctx.fillRect(R(0.4 * r), R(-0.82 * r), 2, 1);
  }
  if (k.kind === 'tin') {
    // rivets down the snout seam and round the back of the skull
    ctx.fillStyle = rig.col(inf.pal.metal);
    for (const [x, y] of [[0.3, -0.5], [0.7, -0.46], [1.1, -0.36], [-0.7, -0.4], [-0.9, 0.1]]) ctx.fillRect(R(x * r), R(y * r), 2, 2);
  }
  rimTop(ctx, rig, R(-0.7 * r), R(-0.98 * r), R(0.2 * r), R(-1.02 * r), crown);
}
/**
 * The face (face hook): one deep-set eye under the brow, a nostril at the end of the snout and two fangs over the jaw.
 * The pupil burns in the palette's glow while `rig.tell` is up — the trio's wind-up channel, lit on the same keys the
 * AI flags as the tell.
 */
export function koopaFace(ctx, rig, pose, inf) {
  if (rig.override) return;
  const r = inf.r, k = K(rig), face = pose.face | 0;
  const ex = R(0.36 * r), ey = R(-0.44 * r), ew = Math.max(5, R(0.44 * r)), eh = Math.max(4, R(0.28 * r));
  if (face === FACE.closed || face === FACE.dazed) {
    ctx.fillStyle = rig.col(tones(rig, inf.pal.skin).deep); ctx.fillRect(ex, ey + 2, ew, 2);
    if (face === FACE.dazed) { ctx.fillRect(ex + 1, ey, 2, 2); ctx.fillRect(ex + ew - 3, ey + 4, 2, 2); }
  } else {
    band(ctx, rig, ex, ey, ew, eh, '#F4ECD8', 1);
    const hot = rig.tell ? inf.pal.glow : k.eye;
    const squint = face === FACE.hurt ? 2 : 0;
    ctx.fillStyle = rig.col(hot); ctx.fillRect(ex + ew - 3, ey + 1 + squint, 2, eh - 2 - squint);
    // the brow comes down over the white: angry and grit press it, hurt lifts it
    ctx.fillStyle = rig.col(tones(rig, inf.pal.skin).deep);
    if (face === FACE.angry || face === FACE.grit || face === FACE.shout) { ctx.fillRect(ex - 1, ey - 1, ew + 2, 2); ctx.fillRect(ex + ew - 2, ey + 1, 3, 1); }
    else ctx.fillRect(ex, ey - 2, ew, 1);
  }
  // nostril near the tip of the snout
  ctx.fillStyle = rig.col(tones(rig, inf.pal.skin).deep); ctx.fillRect(R(1.3 * r), R(-0.24 * r), 2, 2);
  // two fangs down over the jaw line (Bowser's overbite): claw-white on every king
  ctx.fillStyle = rig.col(k.claw);
  const fy = R(0.3 * r);
  ctx.fillRect(R(0.62 * r), fy, 2, 3); ctx.fillRect(R(1.08 * r), fy, 2, 3);
}

/** The Tin Man's funnel (hat hook): a tin cone standing up off the crown, tipped back, with a rolled rim. */
export function koopaFunnel(ctx, rig, pose, inf) {
  if (!K(rig).funnel) return;
  const r = inf.r, tin = inf.pal.metal;
  celPoly(ctx, rig, S(r, [-0.72, -0.78, 0.36, -0.9, 0.02, -1.44, -0.1, -2.02, -0.24, -2.02, -0.38, -1.42]), tin, 0.36, 0.3);
  band(ctx, rig, R(-0.8 * r), R(-0.96 * r), R(1.24 * r), 4, tin, 2);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, tin).deep; ctx.fillRect(R(-0.16 * r), R(-1.9 * r), 2, R(0.4 * r));
}

// ---------------------------------------------------------------- the body
/**
 * Barrel body + belly plastron + spiked collar (torso hook, torso space: origin at the hip centre, y up negative).
 * The plastron is the king's pale belly in the palette's `primary`, and it is the one mark every material keeps:
 * scaled plates on the volcano, a riveted plate with the heart behind it on the tin man, woven bark on the earth king.
 */
export function koopaBody(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal, k = K(rig);
  celPoly(ctx, rig, [-hw + 2, -H + 4, -hw + 8, -H, hw - 6, -H, hw + 1, -H + 6, hw + 5, R(-H * 0.45), hw + 3, -2, hw - 4, 4, -hw + 3, 4, -hw, R(-H * 0.4)], pal.skin, 0.32, 0.3);
  // the plastron
  const px0 = R(-hw * 0.12);
  celPoly(ctx, rig, [px0, -H + 7, hw - 2, -H + 7, hw + 3, R(-H * 0.45), hw + 1, -3, R(hw * 0.2), 0, R(-hw * 0.2), R(-H * 0.45)], pal.primary, 0.3, 0.28);
  // the collar, spikes up off it: drawn after the plastron so it caps the neck line
  for (const sx of [-0.55, -0.05, 0.45]) celPoly(ctx, rig, [R(sx * hw) - 3, -H - 1, R(sx * hw) + 3, -H - 1, R(sx * hw), -H - 8], k.spike, 0.3, 0);
  band(ctx, rig, -hw - 1, -H - 2, W + 2, 6, k.cuff, 2);
  if (rig.override) return;
  const tp = tones(rig, pal.primary);
  // plate seams across the belly (form inside one material: tone, not ink)
  ctx.fillStyle = tp.deep;
  for (const f of [0.3, 0.55, 0.78]) ctx.fillRect(R(-hw * 0.05 + f * 2), R(-H * f), R(hw * 1.0), 1);
  // collar studs
  ctx.fillStyle = rig.col(k.spike);
  for (const sx of [-0.75, -0.3, 0.2, 0.7]) ctx.fillRect(R(sx * hw), -H + 1, 2, 2);
  if (k.kind === 'tin') {
    // the heart: the thing the Tin Man was promised, riveted in behind a window in his belly plate
    const hx = R(hw * 0.42), hy = R(-H * 0.62);
    ctx.fillStyle = rig.col(pal.glow);
    ctx.fillRect(hx - 3, hy - 2, 3, 3); ctx.fillRect(hx + 1, hy - 2, 3, 3); ctx.fillRect(hx - 3, hy, 7, 2); ctx.fillRect(hx - 2, hy + 2, 5, 1); ctx.fillRect(hx - 1, hy + 3, 3, 1);
    ctx.fillStyle = rig.col(pal.metal);
    for (const [x, y] of [[0.1, 0.4], [0.9, 0.4], [0.1, 0.85], [0.9, 0.85]]) ctx.fillRect(R(x * hw), R(-H * y), 2, 2);
  } else if (k.kind === 'earth') {
    // woven vine strands across the bark: the body IS vines, and this is where it shows
    ctx.fillStyle = rig.col(pal.secondary);
    for (let i = 0; i < 3; i++) { ctx.fillRect(-hw + 3, R(-H * (0.2 + i * 0.27)), R(hw * 0.7), 2); }
    ctx.fillStyle = rig.col(k.tip);
    ctx.fillRect(R(-hw * 0.5), R(-H * 0.36), 2, 2); ctx.fillRect(R(-hw * 0.2), R(-H * 0.64), 2, 2);
  } else if (k.kind === 'volcano') {
    // lava showing through the cracks between the side scales
    ctx.fillStyle = rig.col(pal.glow);
    ctx.fillRect(R(-hw * 0.7), R(-H * 0.5), 3, 1); ctx.fillRect(R(-hw * 0.45), R(-H * 0.28), 2, 1);
  }
  rimTop(ctx, rig, -hw + 6, -H + 1, hw - 6, -H + 1, pal.skin);
}

/** Heavy hip block: a scaled pelvis in the leg colour with a darker lower band (hips hook). */
export function koopaHips(ctx, rig, pose, inf) {
  const hip = inf.w, hw = R(hip / 2);
  celPoly(ctx, rig, [-hw, -5, hw, -5, hw + 1, 3, R(hw * 0.4), 7, R(-hw * 0.4), 7, -hw - 1, 3], inf.pal.secondary, 0.36, 0.2);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, inf.pal.secondary).deep; ctx.fillRect(-hw + 2, 2, hip - 4, 1);
}

/** Clawed fist with a spiked wrist cuff (hand hook, hand space: +x along the forearm). Claws are the palette's accent. */
export function koopaHand(ctx, rig, pose, inf) {
  const r = inf.r, k = K(rig), far = inf.far;
  const cuff = far ? tones(rig, k.cuff).sh : k.cuff, spike = far ? tones(rig, k.spike).sh : k.spike, claw = inf.pal.accent;
  celPoly(ctx, rig, [R(-r * 1.2), R(-r * 1.1), R(-r * 0.7), R(-r * 2.1), R(-r * 0.3), R(-r * 1.1)], spike, 0.3, 0);
  celPoly(ctx, rig, [R(-r * 1.2), R(r * 1.1), R(-r * 0.7), R(r * 2.1), R(-r * 0.3), R(r * 1.1)], spike, 0.3, 0);
  band(ctx, rig, R(-r * 1.6), R(-r * 1.2), R(r * 1.2), R(r * 2.4), cuff, 2);
  drawFist(ctx, rig, r, inf.pal.skin);
  // three claws off the knuckles
  for (const cy of [-0.7, 0, 0.7]) celPoly(ctx, rig, [R(r * 1.3), R(r * cy) - 2, R(r * 2.3), R(r * cy), R(r * 1.3), R(r * cy) + 2], claw, 0.3, 0);
}

/** Clawed foot (foot hook, ankle space: +x toward the toe) — a broad scaled foot with three claws, no boot. */
export function koopaFoot(ctx, rig, pose, inf) {
  const claw = inf.pal.accent;
  const heel = R(inf.w * 0.42), toe = R(inf.w * 0.62), top = -R(inf.h), sole = R(inf.h * 0.5);
  celPoly(ctx, rig, [-heel, top, R(heel * 0.6), top, toe - 1, sole - 4, toe + 1, sole - 1, toe, sole, -heel, sole], inf.pal.secondary, 0.34, 0.3);
  if (!rig.override) { ctx.fillStyle = tones(rig, inf.pal.secondary).deep; ctx.fillRect(-heel, sole - 1, toe + heel, 2); }
  for (const dy of [-5, -2]) celPoly(ctx, rig, [toe - 1, sole + dy - 1, toe + 5, sole + dy + 2, toe - 1, sole + dy + 3], claw, 0.3, 0);
}

/**
 * The shell (back accessory, torso space). A dome carried high on the back with a pale rim band and four spikes
 * standing out of it along the normal. The spikes are what the material changes most: a crater cone glowing at the
 * tip on the volcano, a riveted cone on the tin man, a curved thorn of vine on the earth king's stone.
 */
export function koopaShell(ctx, rig) {
  const p = rig.p, k = K(rig), W = p.torsoW, H = p.torsoH;
  const cx = R(-W * 0.46), cy = R(-H * 0.58), rx = R(W * 0.62), ry = R(H * 0.72);
  // spikes first (their bases are buried under the dome), angle measured from +x, y down
  const spikes = [155, 195, 235, 272];
  for (const deg of spikes) {
    const a = deg * Math.PI / 180, nx = Math.cos(a), ny = Math.sin(a);
    const bx = cx + nx * rx * 0.86, by = cy + ny * ry * 0.86, tx = cx + nx * (rx + 11), ty = cy + ny * (ry + 11);
    const sx = -ny * 5, sy = nx * 5;
    if (k.kind === 'earth') {
      // a hooked thorn: the tip bends back along the shell, the way a bramble's does
      celPoly(ctx, rig, [R(bx + sx), R(by + sy), R(tx - sx * 0.5), R(ty - sy * 0.5), R(tx - sx * 1.2), R(ty - sy * 1.2), R(bx - sx), R(by - sy)], k.spike, 0.3, 0);
    } else celPoly(ctx, rig, [R(bx + sx), R(by + sy), R(tx), R(ty), R(bx - sx), R(by - sy)], k.spike, 0.3, 0);
  }
  celPoly(ctx, rig, ell(cx, cy, rx + 3, ry + 3, 16), k.rim, 0.3, 0.2);
  celPoly(ctx, rig, ell(cx - 2, cy - 1, rx - 1, ry - 1, 16), k.shell, 0.36, 0.3);
  if (rig.override) return;
  const t = tones(rig, k.shell);
  // the hex plates of a koopa shell, as tone seams inside the dome
  ctx.fillStyle = t.deep;
  ctx.fillRect(R(cx - rx * 0.5), R(cy - 1), R(rx * 0.9), 1);
  ctx.fillRect(R(cx - rx * 0.1), R(cy - ry * 0.7), 1, R(ry * 1.3));
  for (const deg of spikes) {
    const a = deg * Math.PI / 180, tx = cx + Math.cos(a) * (rx + 9), ty = cy + Math.sin(a) * (ry + 9);
    ctx.fillStyle = rig.col(k.tip); ctx.fillRect(R(tx) - 1, R(ty) - 1, 2, 2);
  }
  if (k.kind === 'volcano') {
    // lava in the plate seams, brighter on the tell
    ctx.fillStyle = rig.col(rig.tell ? rig.palette.glow : k.tip);
    ctx.fillRect(R(cx - rx * 0.4), R(cy + ry * 0.2), 5, 1); ctx.fillRect(R(cx + rx * 0.1), R(cy - ry * 0.35), 1, 4);
    if (rig.phaseIndex >= 1) { ctx.fillRect(R(cx - rx * 0.2), R(cy - ry * 0.1), 6, 1); ctx.fillRect(R(cx - rx * 0.6), R(cy - ry * 0.4), 1, 5); }
  } else if (k.kind === 'tin') {
    ctx.fillStyle = rig.col(rig.palette.metal);
    for (let i = 0; i < 7; i++) { const a = (150 + i * 25) * Math.PI / 180; ctx.fillRect(R(cx + Math.cos(a) * (rx - 4)), R(cy + Math.sin(a) * (ry - 4)), 2, 2); }
    if (rig.rusted) { ctx.fillStyle = rig.col(TIN_RUST); ctx.fillRect(R(cx - rx * 0.3), R(cy + ry * 0.3), 4, 3); ctx.fillRect(R(cx + rx * 0.05), R(cy - ry * 0.5), 3, 3); }
  } else {
    // moss on the stone, and the cracks the vines grew in through
    ctx.fillStyle = rig.col(rig.palette.hair);
    ctx.fillRect(R(cx - rx * 0.6), R(cy - ry * 0.55), 5, 2); ctx.fillRect(R(cx + rx * 0.2), R(cy + ry * 0.35), 4, 2);
    ctx.fillStyle = rig.col(rig.palette.secondary);
    ctx.fillRect(R(cx - rx * 0.2), R(cy + ry * 0.1), 1, 6); ctx.fillRect(R(cx - rx * 0.2), R(cy + ry * 0.1), 5, 1);
  }
  rimTop(ctx, rig, R(cx - rx * 0.6), R(cy - ry * 0.92), R(cx + rx * 0.2), R(cy - ry * 0.98), k.shell);
}
/** Rust bloom colour, shared with the Tin Man's own def (the RUSTED STIFF window paints it on the shell). */
export const TIN_RUST = '#A4552C';

/** The tail (hip accessory, back layer): a short thick tail out behind the shell, two spikes along its top. */
export function koopaTail(ctx, rig) {
  const k = K(rig), hw = R(rig.p.hip / 2), skin = rig.palette.secondary;
  celPoly(ctx, rig, [-hw - 8, -8, -hw - 12, -12, -hw - 7, -5], k.spike, 0.3, 0);
  celTaper(ctx, rig, -hw + 2, -2, -hw - 20, 8, 7, 2, skin);
  celPoly(ctx, rig, [-hw - 14, -1, -hw - 19, -4, -hw - 15, 3], k.spike, 0.3, 0);
}

/** The complete part table. The limbs are left to rig.ts: upper arm in `sleeve`, forearm and fist in `skin`. */
export const KOOPA_PARTS = { head: koopaHead, face: koopaFace, hat: koopaFunnel, torso: koopaBody, hips: koopaHips, hand: koopaHand, foot: koopaFoot };
/** The two accessories every king wears. */
export const KOOPA_SHELL = { attach: 'back', draw: koopaShell };
export const KOOPA_TAIL = { attach: 'hip', layer: 'back', draw: koopaTail };

/** A big, low, heavy body: the head sits forward of the shoulders on a thick neck, the legs are short and wide. */
export const KOOPA_PROPS = {
  headR: 12, neck: 2, neckR: 6, torsoW: 32, torsoH: 28, hip: 26, upperArm: 13, lowerArm: 12, armR: 6, handR: 5.5,
  upperLeg: 12, lowerLeg: 11, legR: 7, footL: 14, footH: 6, shoulderX: 3, hipX: 7, bulge: 0.5,
};

// ---------------------------------------------------------------- animation
const AD = (a: number[], du: number, dl: number) => [a[0] + du, a[1] + dl];
/** Flat on the back, belly up, the shell under him and the tail out: every king falls the same way. */
const FLOOR_POSE = { armR: [-30, -10], armL: [26, 18], torso: 6, head: -12, legR: [14, 10], legL: [-4, 8], root: [-30, -12, 88] };

/**
 * Base animation set (idle 4 / walk 8 / run 8 / jump / fall / land / hurt 3 / stagger 2 / hurtAir / knockdown /
 * lying 2 / getup 3 / dead 2) for a rest carry `c` ({ armR, armL, weapon? }). A koopa king is heavy: a wide planted
 * stance leaning into the shell's weight, a stomping walk that drops the whole body on each contact, and a run that
 * is really a charge — head down, arms back.
 */
export function makeKoopaBase(c): AnimSet {
  const st = { torso: 8, head: -6, legR: [18, 6], legL: [-16, 8], footR: 0, footL: 0 };
  const K0 = (s) => ({ ...st, ...c, ...s });
  const walk = (lr: number[], ll: number[], ar: number[], al: number[], ty: number, sq?: number, fr = 0, fl = 0) =>
    K0({ legR: lr, legL: ll, armR: ar, armL: al, torso: 9, head: -6, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, footR: fr, footL: fl });
  const run = (lr: number[], ll: number[], ar: number[], al: number[], ty: number, sq?: number) =>
    K0({ legR: lr, legL: ll, armR: ar, armL: al, torso: 24, head: -14, root: [0, ty], squash: sq || 1, stretch: sq ? 2 - sq : 1, face: 'angry' });
  const aR = c.armR, aL = c.armL;
  return {
    // idle: the shell's weight rises and settles with each breath, and the head sways with it
    idle: { loop: true, frames: [
      FK(14, K0({ torso: 7, head: -6, root: [0, 0] }), { ease: 'inout' }),
      FK(13, K0({ torso: 10, head: -2, root: [0, 1], armR: AD(aR, 3, 2), armL: AD(aL, -3, 2), squash: 1.01, stretch: 0.99 }), { ease: 'inout' }),
      FK(14, K0({ torso: 8, head: -5, root: [0, 1], armR: AD(aR, -2, -1), armL: AD(aL, 2, -1) }), { ease: 'inout' }),
      FK(13, K0({ torso: 5, head: -9, root: [0, 0], armR: AD(aR, 1, 1), armL: AD(aL, -1, 1) }), { ease: 'inout' }),
    ] },
    // walk: a stomp. The down key drops the whole body 3 px and squashes it, so every step lands like it weighs a ton
    walk: { loop: true, frames: [
      FK(4, walk([26, 4], [-22, 16], AD(aR, -16, 2), AD(aL, 14, 2), 0, 1, -6, 0), { ease: 'out' }),
      FK(4, walk([20, 14], [-14, 28], AD(aR, -8, 0), AD(aL, 6, 0), 3, 1.05), { ease: 'out' }),
      FK(4, walk([6, 24], [0, 10], AD(aR, 4, -2), AD(aL, -6, -2), 1), { ease: 'inout' }),
      FK(4, walk([-10, 12], [16, -2], AD(aR, 14, -2), AD(aL, -14, -2), -1, 1, 0, -6), { ease: 'in' }),
      FK(4, walk([-22, 16], [26, 4], AD(aR, 14, 2), AD(aL, -16, 2), 0, 1, 0, -6), { ease: 'out' }),
      FK(4, walk([-14, 28], [20, 14], AD(aR, 6, 0), AD(aL, -8, 0), 3, 1.05), { ease: 'out' }),
      FK(4, walk([0, 10], [6, 24], AD(aR, -6, -2), AD(aL, 4, -2), 1), { ease: 'inout' }),
      FK(4, walk([16, -2], [-10, 12], AD(aR, -14, -2), AD(aL, 14, -2), -1, 1, -6, 0), { ease: 'in' }),
    ] },
    run: { loop: true, frames: [
      FK(3, run([50, 14], [-38, 54], AD(aR, -40, 10), AD(aL, 30, 10), -2), { ease: 'out' }),
      FK(3, run([38, 30], [-28, 66], AD(aR, -30, 10), AD(aL, 20, 10), 2, 1.05), { ease: 'out' }),
      FK(3, run([10, 40], [10, 30], AD(aR, -10, 6), AD(aL, 0, 6), 1), { ease: 'inout' }),
      FK(3, run([-22, 48], [38, 8], AD(aR, 10, 6), AD(aL, -20, 6), -3), { ease: 'in' }),
      FK(3, run([-38, 54], [50, 14], AD(aR, 30, 10), AD(aL, -40, 10), -2), { ease: 'out' }),
      FK(3, run([-28, 66], [38, 30], AD(aR, 20, 10), AD(aL, -30, 10), 2, 1.05), { ease: 'out' }),
      FK(3, run([10, 30], [10, 40], AD(aR, 0, 6), AD(aL, -10, 6), 1), { ease: 'inout' }),
      FK(3, run([38, 8], [-22, 48], AD(aR, -20, 6), AD(aL, 10, 6), -3), { ease: 'in' }),
    ] },
    jump: { loop: false, frames: [
      FK(4, K0({ legR: [32, 44], legL: [-22, 46], torso: 18, root: [0, 4], squash: 1.14, stretch: 0.88 }), { ease: 'out' }),
      FK(30, K0({ legR: [40, -60], legL: [20, -44], torso: 4, armR: AD(aR, -40, -10), armL: AD(aL, -40, -10), squash: 0.95, stretch: 1.05 })),
    ] },
    fall: { loop: true, frames: [
      FK(10, K0({ legR: [24, -30], legL: [8, -20], armR: AD(aR, -60, -20), armL: AD(aL, -60, -20), torso: -4, head: -4, face: 'grit' }), { ease: 'inout' }),
      FK(10, K0({ legR: [30, -40], legL: [4, -14], armR: AD(aR, -70, -20), armL: AD(aL, -70, -20), torso: -6, head: -6, face: 'grit' }), { ease: 'inout' }),
    ] },
    land: { loop: false, frames: [
      FK(3, K0({ legR: [34, 46], legL: [-24, 48], torso: 24, head: 4, root: [0, 3], squash: 1.18, stretch: 0.84 }), { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }] }),
      FK(6, K0({ legR: [20, 16], legL: [-16, 18], torso: 10, root: [0, 1], squash: 1.03, stretch: 0.97 }), { ease: 'out' }),
    ] },
    hurt: { loop: false, frames: [
      FK(4, K0({ torso: -18, head: -22, armR: AD(aR, -40, -20), armL: AD(aL, -40, -20), root: [-5, 1], legR: [22, 4], legL: [-14, 12], face: 'hurt' }), { ease: 'out' }),
      FK(10, K0({ torso: -4, head: -12, armR: AD(aR, -16, -8), armL: AD(aL, -16, -8), root: [-2, 1], legR: [20, 4], legL: [-14, 10], face: 'hurt' }), { ease: 'out' }),
      FK(6, K0({ face: 'angry' }), { ease: 'out' }),
    ] },
    stagger: { loop: true, frames: [
      FK(7, K0({ torso: 0, head: -18, root: [-3, 1], armR: [-30, -20], armL: [-44, -20], legR: [22, 12], legL: [-20, 16], face: 'dazed' }), { ease: 'inout' }),
      FK(7, K0({ torso: 14, head: 4, root: [3, 0], armR: [-10, -30], armL: [-58, -12], legR: [16, 14], legL: [-24, 12], face: 'dazed' }), { ease: 'inout' }),
    ] },
    hurtAir: { loop: true, frames: [
      FK(6, { armR: [-92, -36], armL: [-104, -28], weapon: 40, torso: -30, head: -22, legR: [40, 40], legL: [10, 58], root: [0, 0, -15], face: 'hurt' }, { ease: 'inout' }),
      FK(6, { armR: [-104, -46], armL: [-114, -28], weapon: 50, torso: -36, head: -28, legR: [50, 30], legL: [20, 48], root: [0, 0, -26], face: 'hurt' }, { ease: 'inout' }),
    ] },
    knockdown: { loop: true, frames: [
      FK(8, { armR: [-62, -38], armL: [-82, -28], weapon: 40, torso: -50, head: -18, legR: [50, 30], legL: [30, 50], root: [0, -6, -26], face: 'hurt' }, { ease: 'inout' }),
      FK(8, { armR: [-72, -48], armL: [-92, -28], weapon: 50, torso: -56, head: -24, legR: [60, 20], legL: [40, 40], root: [0, -6, -36], face: 'hurt' }, { ease: 'inout' }),
    ] },
    lying: { loop: true, frames: [
      FK(16, { ...FLOOR_POSE, face: 'hurt' }, { ease: 'inout' }),
      FK(16, { ...FLOOR_POSE, torso: 9, head: -15, legR: [18, 12], face: 'hurt' }, { ease: 'inout' }),
    ] },
    getup: { loop: false, frames: [
      FK(10, { ...FLOOR_POSE, face: 'hurt' }, { ease: 'in' }),
      FK(10, { armR: [58, 38], armL: [-28, 38], torso: 30, head: -8, legR: [68, 58], legL: [-18, 58], root: [8, 3, -22], face: 'grit', squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
      FK(8, K0({ torso: 12, root: [0, 1], legR: [20, 18], legL: [-14, 14], face: 'angry' }), { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 5 }] }),
    ] },
    dead: { loop: false, frames: [
      FK(8, { ...FLOOR_POSE, legR: [40, -20], legL: [28, -14], torso: -2, root: [-24, -10, 80], squash: 1.08, stretch: 0.92, face: 'dazed' }, { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }] }),
      FK(60, { ...FLOOR_POSE, torso: 8, head: -18, legR: [10, 4], legL: [-6, 6], face: 'dazed' }, { ease: 'out' }),
    ] },
  };
}

/**
 * Six-key strike skeleton for the trio (ART_STYLE 8): anticipation -> load -> hit (smear + fx) -> hold -> punishable
 * recovery -> return to carry — the same shape as gleaningRig's gleanStrike and chandlerRig's chandStrike, because
 * each king runs three or four attacks a phase and every pose is still authored per attack; only the timing
 * skeleton and the frame flags are shared.
 * @param {object} o { tell, active, recovery, holdDur, carry, tellSfx, sfx, hitbox|hitboxes, fx, move, smear, armor,
 *   invuln, event, aimEvent, projectile, recoverFx, recoverEvent, w1, w2, h, hold, r } — the five poses are pose specs.
 */
export function koopaStrike(o): Anim {
  const tell = o.tell || 20, t0 = Math.max(1, Math.round(tell * 0.6));
  const hit: Partial<Frame> = { sfx: o.sfx, fx: o.fx, move: o.move, smear: o.smear, ease: 'overshoot',
    armor: o.armor || undefined, invuln: o.invuln || undefined, event: o.event, projectile: o.projectile };
  if (o.hitboxes) hit.hitboxes = o.hitboxes; else if (o.hitbox) hit.hitbox = o.hitbox;
  return { loop: false, frames: [
    FK(t0, o.w1, { tell: true, sfx: o.tellSfx, armor: o.armor || undefined, invuln: o.tellInvuln || undefined, event: o.aimEvent, ease: 'in' }),
    FK(Math.max(1, tell - t0), o.w2, { tell: true, armor: o.armor || undefined, invuln: o.tellInvuln || undefined, ease: 'out' }),
    FK(o.active || 8, o.h, hit),
    FK(o.holdDur || 3, o.hold || o.h, { ease: 'out', event: o.holdEvent, invuln: o.holdInvuln || undefined }),
    FK(o.recovery || 24, o.r, { punish: true, ease: 'inout', fx: o.recoverFx, event: o.recoverEvent }),
    FK(6, { ...o.carry, torso: 8, head: -6, legR: [18, 6], legL: [-16, 8], footR: 0, footL: 0, root: [0, 0] }, { ease: 'out' }),
  ] };
}

/** Intro / phase-change / defeat for a king with rest carry `c`: the roar, the stagger into the next phase, the fall. */
export function koopaBossCommon(c, roarColor: string) {
  const st = { legR: [18, 6], legL: [-16, 8], footR: 0, footL: 0 };
  return {
    // intro: he stamps once, rears back and ROARS — the jaw drops on `shout`, and the ring goes out in his colour
    intro: { loop: false, frames: [
      FK(22, { ...c, ...st, torso: 4, head: -10, root: [0, 0], face: 'angry' }, { sfx: 'land_heavy', ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }] }),
      FK(16, { ...c, ...st, armR: AD(c.armR, -30, 20), armL: AD(c.armL, -30, 20), torso: -14, head: -24, root: [-3, 0], face: 'grit', squash: 0.97, stretch: 1.03 }, { ease: 'in' }),
      FK(30, { ...c, ...st, armR: [-40, -30], armL: [-60, -30], torso: -20, head: -30, root: [-4, 0], face: 'shout' },
        { sfx: 'roar', ease: 'out', fx: [{ kind: 'ring', x: 20, y: 70, r0: 8, r1: 70, color: roarColor }] }),
      FK(14, { ...c, ...st, torso: 8, head: -6, root: [0, 0], face: 'angry' }, { ease: 'inout' }),
    ] },
    phaseChange: { loop: false, frames: [
      FK(14, { ...c, ...st, torso: -20, head: -20, armR: [-30, -20], armL: [-50, -20], root: [-4, 1], face: 'hurt' }, { sfx: 'prop_break', ease: 'out' }),
      FK(18, { ...c, legR: [30, 40], legL: [-24, 40], torso: 26, head: 8, root: [2, 3], squash: 1.12, stretch: 0.9, face: 'grit' }, { ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }] }),
      FK(22, { ...c, ...st, armR: [-50, -30], armL: [-70, -30], torso: -18, head: -28, root: [-3, 0], face: 'shout' }, { sfx: 'roar', ease: 'out', fx: [{ kind: 'ring', x: 20, y: 70, r0: 8, r1: 80, color: roarColor }] }),
    ] },
    defeat: { loop: false, frames: [
      FK(20, { ...c, ...st, torso: -24, head: -26, armR: [-40, 30], armL: [-70, -30], root: [-4, 0], face: 'hurt' }, { sfx: 'prop_break', ease: 'out' }),
      FK(22, { ...c, torso: 30, head: -6, armR: [40, 38], armL: [22, 32], root: [0, 4], legR: [44, 42], legL: [-30, 46], squash: 1.12, stretch: 0.9, face: 'dazed' },
        { ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 10 }] }),
      FK(70, { ...FLOOR_POSE, face: 'dazed' }, { ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 10 }] }),
    ] },
  };
}

export { P, FK, ell, celBall, celCapsule, flat };
