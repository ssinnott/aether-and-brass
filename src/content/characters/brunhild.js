// Brunhild Coalheart — Tank (GDD 2.1). Dwarf boilerwright with a two-handed steam hammer, boiler backpack,
// forehead goggles, gear pauldron and a big braided beard. Hand-authored 16-bit style sprite rig + full animation set.
// Numbers (damage, startup, hitboxes) follow the GDD / the previous placeholder so the game logic is unchanged.
import { speedFor, hpFor, areaBox, frontBox, P, F, hit } from './common.js';
import { JUMP_VY, METER } from '../../constants.js';
import { celRect, celBall, celPoly, celCapsule, celPath, tones, flat, outlinePath } from '../../art/shading.js';
import { drawSkull, drawFace, drawBoot, drawFist, drawBelt } from '../../art/rigParts.js';
import { getChain } from '../../art/secondary.js';
import { rad } from '../../engine/math.js';

// ---------------------------------------------------------------------------------------------------------------
// Palette (GDD 2.1) and rig build
// ---------------------------------------------------------------------------------------------------------------
const PAL = { skin: '#F0D9B5', hair: '#B5502A', primary: '#7A2E1E', secondary: '#3A3A44', accent: '#C9A227', metal: '#C9A227', dark: '#3A3A44', glow: '#E86A1E' };
const SHIRT = '#8C6A4A', LEATHER = '#5A3A26', IRON = '#5C5E6A', LENS = '#9BC1E8', STEAM = '#E8F0F4', WOOD = '#7A4A26';
const R = Math.round;

/** Two-handed steam hammer (hand space: +x along the handle). Bevelled iron head, brass bands, chimney, fire slot. */
function drawHammer(ctx, rig) {
  // handle (pommel 14px behind the near hand so the rear hand sits on it) with a leather wrap under both fists
  celRect(ctx, rig, -14, -2, 47, 4, 1, WOOD, 0.4, 0.3);
  if (!rig.override) { ctx.fillStyle = tones(rig, LEATHER).base; for (let x = -13; x < 8; x += 3) ctx.fillRect(x, -2, 2, 4); ctx.fillStyle = tones(rig, LEATHER).sh; ctx.fillRect(-14, 1, 22, 1); ctx.fillStyle = tones(rig, PAL.accent).base; ctx.fillRect(-14, -2, 2, 4); }
  // head: tall iron block perpendicular to the handle, bevelled ends
  celPoly(ctx, rig, [26, -16, 38, -16, 40, -14, 40, 12, 38, 14, 26, 14, 24, 12, 24, -14], IRON, 0.38, 0.28);
  if (rig.override) return;
  const ti = tones(rig, IRON), tb = tones(rig, PAL.accent);
  // bevel line + brass bands + rivets
  ctx.fillStyle = ti.hi; ctx.fillRect(26, -15, 1, 28);
  ctx.fillStyle = tb.base; ctx.fillRect(25, -10, 14, 2); ctx.fillRect(25, 7, 14, 2);
  ctx.fillStyle = tb.sh; ctx.fillRect(25, -8, 14, 1); ctx.fillRect(25, 9, 14, 1);
  ctx.fillStyle = tb.hi; ctx.fillRect(27, -10, 1, 1); ctx.fillRect(36, -10, 1, 1); ctx.fillRect(27, 7, 1, 1); ctx.fillRect(36, 7, 1, 1);
  // striking faces (darker end caps) + fire slot with glow
  ctx.fillStyle = ti.deep; ctx.fillRect(24, -14, 2, 26); ctx.fillRect(38, -14, 2, 26);
  ctx.fillStyle = rig.col('#2a1a18'); ctx.fillRect(29, -4, 6, 8);
  ctx.fillStyle = rig.col(PAL.glow); ctx.fillRect(30, -3, 4, 6);
  ctx.fillStyle = rig.col('#FFD27A'); ctx.fillRect(31, -1, 2, 2);
  // chimney stub on the back face (top of the head when raised)
  ctx.beginPath(); ctx.rect(29, -21, 6, 6); flat(ctx, rig, ti.sh);
  ctx.fillStyle = ti.hi; ctx.fillRect(30, -21, 1, 5);
}

/** Head: skull + hair pulled back into a bun, big nose, goggles on the forehead (head space). */
function drawHead(ctx, rig, pose, inf) {
  const r = inf.r;
  drawSkull(ctx, rig, r, PAL.skin, PAL.hair, { jaw: 0.3, hairStyle: 'short' });
  // hair bun at the back + tie
  celBall(ctx, rig, -r * 0.9, -r * 0.45, 4, PAL.hair, true);
  if (!rig.override) { ctx.fillStyle = rig.col(PAL.accent); ctx.fillRect(R(-r * 0.9) - 1, R(-r * 0.45) - 1, 2, 2); }
  // big dwarven nose
  ctx.beginPath(); ctx.moveTo(r * 0.55, r * 0.05); ctx.lineTo(r * 1.25, r * 0.35); ctx.lineTo(r * 0.9, r * 0.55); ctx.lineTo(r * 0.55, r * 0.5); ctx.closePath();
  celPath(ctx, rig, PAL.skin, r * 0.9, r * 0.3, r * 0.4, 0.35, 0.3);
}
/** Eyes + brows (mouth hidden under the beard), then the beard mass with lagging clumps and braid rings. */
function drawFaceBeard(ctx, rig, pose, inf) {
  const r = inf.r;
  drawFace(ctx, rig, r, pose.face | 0, { noMouth: true, eyeY: 0, brow: '#8a3a1a' });
  // beard: 3 chained clumps hanging from the jaw, lagging the head via a secondary chain
  const ch = getChain(rig, 'beard', 3, { joint: 'head', rest: [0, 1], stiffness: 0.16, damping: 0.66, gain: 1.6, rotGain: 0.5, maxAng: 28 });
  ctx.save();
  ctx.translate(R(r * 0.25), R(r * 0.5));
  const w0 = R(r * 1.5);
  // moustache
  celPoly(ctx, rig, [-r * 0.2, -r * 0.05, r * 0.85, -r * 0.05, r * 0.95, r * 0.25, r * 0.3, r * 0.15, -r * 0.3, r * 0.3], PAL.hair, 0.35, 0.3);
  for (let i = 0; i < ch.n; i++) {
    ctx.rotate(rad(ch.ang[i]));
    const w = w0 - i * 4, h = i === ch.n - 1 ? 7 : 6;
    // clump: rounded block with two scalloped tips
    celPoly(ctx, rig, [-w / 2, 0, w / 2, 0, w / 2 - 1, h - 2, w / 4, h, 0, h - 2, -w / 4, h, -w / 2 + 1, h - 2], PAL.hair, 0.4, 0.3);
    if (!rig.override && i === 1) { ctx.fillStyle = rig.col(PAL.accent); ctx.fillRect(-2, h - 3, 4, 2); ctx.fillStyle = tones(rig, PAL.accent).sh; ctx.fillRect(-2, h - 2, 4, 1); }
    ctx.translate(0, h - 1);
  }
  ctx.restore();
}
/** Goggles resting on the forehead: leather strap + two brass-rimmed blue lenses (head space). */
function drawGoggles(ctx, rig) {
  const r = rig.p.headR;
  if (!rig.override) { ctx.fillStyle = tones(rig, LEATHER).base; ctx.fillRect(R(-r) + 1, R(-r * 0.7), R(r * 2) - 2, 3); ctx.fillStyle = tones(rig, LEATHER).sh; ctx.fillRect(R(-r) + 1, R(-r * 0.7) + 2, R(r * 2) - 2, 1); }
  for (let i = 0; i < 2; i++) {
    const cx = i ? R(r * 0.45) : R(-r * 0.15), cy = R(-r * 0.62);
    celBall(ctx, rig, cx, cy, 4, PAL.accent, false);
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fillStyle = rig.col(LENS); ctx.fill();
    if (!rig.override) { ctx.fillStyle = rig.col('#ffffff'); ctx.fillRect(cx - 1, cy - 2, 1, 1); }
  }
}
/** Leather apron over a shirt: shaped torso, bib straps, brass rivets, chest pocket (torso space). */
function drawTorso(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2);
  // shirt body (shoulders) then apron on top
  celPoly(ctx, rig, [-hw - 1, -H + 4, -hw + 4, -H, hw - 4, -H, hw + 1, -H + 4, hw, R(-H * 0.5), hw - 2, 2, -hw + 2, 2, -hw, R(-H * 0.5)], SHIRT, 0.36, 0.28);
  celPoly(ctx, rig, [-hw + 4, -H + 6, hw - 4, -H + 6, hw - 2, R(-H * 0.4), hw - 3, 3, -hw + 3, 3, -hw + 2, R(-H * 0.4)], PAL.primary, 0.38, 0.25);
  if (rig.override) return;
  const tp = tones(rig, PAL.primary), tb = tones(rig, PAL.accent);
  // bib straps up to the shoulders + rivets
  ctx.fillStyle = tones(rig, LEATHER).base; ctx.fillRect(-hw + 6, -H + 1, 3, 6); ctx.fillRect(hw - 9, -H + 1, 3, 6);
  ctx.fillStyle = tb.base; ctx.fillRect(-hw + 6, -H + 6, 2, 2); ctx.fillRect(hw - 8, -H + 6, 2, 2);
  // apron seam, pocket and a wrench tucked in
  ctx.fillStyle = tp.sh; ctx.fillRect(-hw + 5, -H + 9, W - 10, 1); ctx.fillRect(-2, -H + 12, 8, 6);
  ctx.fillStyle = tp.hi; ctx.fillRect(-hw + 5, -H + 7, 6, 1);
  ctx.fillStyle = tones(rig, IRON).base; ctx.fillRect(0, -H + 9, 2, 4); ctx.fillRect(-1, -H + 8, 4, 2);
}
/** Heavy belt with a big buckle, pouch and a tool loop (hip space). */
function drawHips(ctx, rig, pose, inf) {
  drawBelt(ctx, rig, inf.w, PAL.secondary, LEATHER, PAL.accent);
  if (rig.override) return;
  const hw = R(inf.w / 2);
  ctx.fillStyle = tones(rig, LEATHER).base; ctx.fillRect(hw - 8, -2, 6, 6);
  ctx.fillStyle = tones(rig, LEATHER).sh; ctx.fillRect(hw - 8, 3, 6, 1); ctx.fillRect(hw - 7, 0, 4, 1);
  ctx.fillStyle = tones(rig, PAL.accent).base; ctx.fillRect(hw - 6, -3, 2, 1);
}
/** Big iron-toed boots with two straps (ankle space). */
function drawBootB(ctx, rig, pose, inf) {
  drawBoot(ctx, rig, inf.w, inf.h, inf.pal.secondary, inf.pal.accent);
  if (rig.override) return;
  const toe = R(inf.w * 0.62);
  ctx.fillStyle = tones(rig, IRON).base; ctx.fillRect(toe - 4, 0, 4, 3);
  ctx.fillStyle = tones(rig, IRON).hi; ctx.fillRect(toe - 4, 0, 3, 1);
}
/** Thick fists with leather bracers on the forearm side (hand space). */
function drawHand(ctx, rig, pose, inf) {
  drawFist(ctx, rig, inf.r, inf.pal.skin);
  if (rig.override) return;
  ctx.fillStyle = inf.far ? tones(rig, LEATHER).sh : tones(rig, LEATHER).base; ctx.fillRect(R(-inf.r * 0.6) - 3, -inf.r, 3, inf.r * 2);
  ctx.fillStyle = tones(rig, inf.pal.accent).base; ctx.fillRect(R(-inf.r * 0.6) - 2, -1, 1, 2);
}
/** Boiler backpack: riveted iron cylinder with brass bands, fire window and a chimney puffing every 20 frames. */
function drawBoiler(ctx, rig) {
  const p = rig.p, x0 = -p.torsoW / 2 - 9, y0 = -p.torsoH - 4, w = 13, h = p.torsoH + 2;
  // straps
  if (!rig.override) { ctx.fillStyle = tones(rig, LEATHER).base; ctx.fillRect(x0 + w - 3, y0 + 6, 8, 3); ctx.fillRect(x0 + w - 3, y0 + h - 8, 8, 3); }
  celRect(ctx, rig, x0, y0, w, h, 4, PAL.secondary, 0.4, 0.3);
  // dome + chimney
  celBall(ctx, rig, x0 + w / 2, y0 + 1, 5, PAL.secondary, true);
  celRect(ctx, rig, x0 + 3, y0 - 9, 4, 9, 1, IRON, 0.4, 0.3);
  if (rig.override) return;
  const tb = tones(rig, PAL.accent), ti = tones(rig, IRON);
  ctx.fillStyle = tb.base; ctx.fillRect(x0 + 1, y0 + 8, w - 2, 2); ctx.fillRect(x0 + 1, y0 + h - 7, w - 2, 2);
  ctx.fillStyle = tb.sh; ctx.fillRect(x0 + 1, y0 + 10, w - 2, 1); ctx.fillRect(x0 + 1, y0 + h - 5, w - 2, 1);
  ctx.fillStyle = tb.hi; ctx.fillRect(x0 + 2, y0 + 8, 1, 1); ctx.fillRect(x0 + w - 3, y0 + 8, 1, 1);
  // fire window
  ctx.fillStyle = rig.col('#241a1c'); ctx.fillRect(x0 + 3, y0 + 13, 7, 6);
  ctx.fillStyle = rig.col(PAL.glow); ctx.fillRect(x0 + 4, y0 + 14, 5, 4);
  ctx.fillStyle = rig.col('#FFD27A'); ctx.fillRect(x0 + 5, y0 + 16, 2, 1);
  ctx.fillStyle = ti.deep; ctx.fillRect(x0 + 3, y0 + 13, 7, 1); ctx.fillRect(x0 + 6, y0 + 13, 1, 6);
  // pressure gauge
  celBall(ctx, rig, x0 + w - 2, y0 + h - 12, 3, '#E8E0C8', false);
  ctx.fillStyle = rig.col('#a03030'); ctx.fillRect(x0 + w - 2, y0 + h - 14, 1, 2);
  // chimney puffs: one puff every 20 frames, rises, swells and fades over 20 frames (draw counter lives on the rig).
  // Steam is the one soft thing on the rig: no outline, three merged discs, alpha fading with height (ART_STYLE 3).
  const f = rig.tick % 20, k = f / 20, a0 = ctx.globalAlpha;
  ctx.fillStyle = tones(rig, STEAM).base;
  puff(ctx, x0 + 5 - k * 3, y0 - 11 - k * 13, 1.5 + k * 3.5, a0 * (0.6 - k * 0.5));
  if (f > 10) { const k2 = (f - 10) / 20; puff(ctx, x0 + 5 - k2 * 2, y0 - 10 - k2 * 9, 1.2 + k2 * 2.5, a0 * (0.45 - k2 * 0.4)); }
  ctx.globalAlpha = a0;
}
const TAU = Math.PI * 2;
/** One steam puff: three merged discs, no outline (fillStyle already set). */
function puff(ctx, x, y, r, alpha) {
  if (alpha <= 0.02) return;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU); ctx.arc(x - r * 0.8, y + r * 0.45, r * 0.7, 0, TAU); ctx.arc(x + r * 0.75, y + r * 0.5, r * 0.6, 0, TAU);
  ctx.fill();
}
/** Gear pauldron on the near shoulder (torso space, drawn in front of the near arm). */
function drawPauldron(ctx, rig) {
  const p = rig.p, cx = p.torsoW / 2 - 1, cy = -p.torsoH + 3;
  ctx.beginPath();
  const n = 8, ro = 7, ri = 5;
  for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? ri : ro; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.closePath();
  celPath(ctx, rig, PAL.accent, cx, cy, ro, 0.4, 0.3);
  celBall(ctx, rig, cx, cy, 2.5, IRON, false);
  if (!rig.override) { ctx.fillStyle = tones(rig, PAL.accent).sh; ctx.fillRect(R(cx) - 3, R(cy) + 3, 6, 1); }
}
/** Select-screen portrait. */
function portrait(ctx, x, y, s) {
  const cx = x + s / 2, cy = y + s / 2;
  ctx.fillStyle = '#1a1018'; ctx.beginPath(); ctx.arc(cx, cy - 1, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PAL.skin; ctx.beginPath(); ctx.arc(cx, cy - 1, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PAL.hair; ctx.fillRect(cx - 8, cy + 2, 16, 10); ctx.fillRect(cx - 9, cy - 9, 18, 4);
  ctx.fillStyle = LEATHER; ctx.fillRect(cx - 9, cy - 7, 18, 3);
  ctx.fillStyle = PAL.accent; ctx.fillRect(cx - 6, cy - 9, 5, 5); ctx.fillRect(cx + 1, cy - 9, 5, 5);
  ctx.fillStyle = LENS; ctx.fillRect(cx - 5, cy - 8, 3, 3); ctx.fillRect(cx + 2, cy - 8, 3, 3);
  ctx.fillStyle = '#f8f4ec'; ctx.fillRect(cx - 5, cy - 2, 3, 2); ctx.fillRect(cx + 2, cy - 2, 3, 2);
  ctx.fillStyle = '#1a1018'; ctx.fillRect(cx - 4, cy - 2, 1, 2); ctx.fillRect(cx + 3, cy - 2, 1, 2);
  ctx.fillStyle = '#8a3a1a'; ctx.fillRect(cx - 5, cy - 4, 3, 1); ctx.fillRect(cx + 2, cy - 4, 3, 1);
}

const build = {
  scale: 1, palette: PAL, outline: '#1E1A22', outlineWidth: 1, smearColor: '#D9C9A8',
  proportions: { headR: 10, neck: 2, torsoW: 30, torsoH: 22, hip: 26, upperArm: 12, lowerArm: 11, armR: 6, handR: 5, upperLeg: 10, lowerLeg: 10, legR: 6.5, footL: 13, footH: 6, shoulderX: 3, hipX: 5 },
  parts: { head: drawHead, face: drawFaceBeard, torso: drawTorso, hips: drawHips, foot: drawBootB, hand: drawHand },
  // grip -8: the far hand holds the handle 8px BEHIND the near hand (stacked bat grip). That keeps the grip point within
  // the far arm's 23px reach in every two-handed key; see the audit notes in docs/ART_STYLE.md section 5.
  weapon: { attach: 'handR', length: 40, draw: drawHammer, twoHanded: true, grip: -8 },
  accessories: [{ attach: 'head', draw: drawGoggles }, { attach: 'back', draw: drawBoiler }, { attach: 'torso', draw: drawPauldron }],
};

// ---------------------------------------------------------------------------------------------------------------
// Animation authoring
// ---------------------------------------------------------------------------------------------------------------
/** Hammer resting on the near shoulder, far arm relaxed with a bent elbow, feet planted wide. */
const CARRY = { armR: [38, -168], weapon: 16, armL: [-12, 20], legR: [8, 0], legL: [-8, 0] };
/**
 * Hammer held ready in front of the chest, both hands on the handle (pose.grip = 1 solves the far arm onto it).
 * Two-handed keys were fitted so the grip point stays within the far arm's reach (see docs/ART_STYLE.md section 5):
 * every `grip: 1` key below keeps the far-shoulder -> grip distance under 25px.
 */
const READY = { armR: [88, -130], weapon: -130, armL: [30, -60], grip: 1, legR: [14, 4], legL: [-14, 6] };
const SW = 'hammer_swing';
/** Hit data of the jump slam (shared id = one hit per target across the hit + held frames). */
const JUMP_HIT = { id: 'jumpAttack', x: -6, y: -50, w: 60, h: 78, z: 24, once: true, damage: 14, type: 'knockdown', kbX: 3, kbY: 4, hitstun: 20 };
/** Hammer dropped along the floor while lying (root rot -88: body-space +y runs toward the feet along the ground). */
const FLOORED = { armR: [-24, -4], weapon: -24, armL: [25, 20], torso: 4, head: -10, legR: [10, 8], legL: [-4, 6], root: [30, -9, -88], face: 'dazed' };

const anims = {
  idle: { loop: true, frames: [
    F(14, { ...CARRY, torso: 2, root: [0, 0] }, { ease: 'inout' }),
    F(14, { ...CARRY, torso: 4, head: 2, root: [0, 1], armR: [40, -166], weapon: 18, armL: [-10, 22] }, { ease: 'inout' }),
    F(12, { ...CARRY, torso: 3, head: 1, root: [0, 1], armR: [39, -167], weapon: 17 }, { ease: 'inout' }),
    F(14, { ...CARRY, torso: 1, head: -1, root: [0, 0], armR: [37, -169], weapon: 15, armL: [-13, 18] }, { ease: 'inout' }),
  ] },
  walk: { loop: true, frames: [
    F(4, { ...CARRY, legR: [30, 2], legL: [-22, 18], footR: -8, armL: [22, 24], torso: 7, root: [0, 0], armR: [40, -166], weapon: 18 }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [24, 10], legL: [-14, 30], armL: [16, 22], torso: 8, root: [0, 2], armR: [42, -164], weapon: 22, head: 2, squash: 1.03, stretch: 0.97 }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [8, 22], legL: [0, 12], armL: [4, 18], torso: 6, root: [0, 1], armR: [38, -168], weapon: 14 }, { ease: 'inout' }),
    F(4, { ...CARRY, legR: [-10, 12], legL: [18, -2], footL: -6, armL: [-12, 18], torso: 5, root: [0, -1], armR: [36, -170], weapon: 10, head: -1 }, { ease: 'in' }),
    F(4, { ...CARRY, legR: [-22, 18], legL: [30, 2], footL: -8, armL: [-26, 16], torso: 7, root: [0, 0], armR: [40, -166], weapon: 18 }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [-14, 30], legL: [24, 10], armL: [-20, 16], torso: 8, root: [0, 2], armR: [42, -164], weapon: 22, head: 2, squash: 1.03, stretch: 0.97 }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [0, 12], legL: [8, 22], armL: [-6, 18], torso: 6, root: [0, 1], armR: [38, -168], weapon: 14 }, { ease: 'inout' }),
    F(4, { ...CARRY, legR: [18, -2], legL: [-10, 12], footR: -6, armL: [10, 20], torso: 5, root: [0, -1], armR: [36, -170], weapon: 10, head: -1 }, { ease: 'in' }),
  ] },
  run: { loop: true, frames: [
    F(3, { ...READY, legR: [52, 14], legL: [-40, 56], armR: [90, -128], weapon: -106, torso: 20, head: -4, root: [0, -2], face: 'angry' }, { ease: 'out' }),
    F(3, { ...READY, legR: [40, 30], legL: [-30, 70], armR: [88, -126], weapon: -104, torso: 22, head: -4, root: [0, 1], squash: 1.04, stretch: 0.96, face: 'angry' }, { ease: 'out' }),
    F(3, { ...READY, legR: [10, 40], legL: [10, 30], armR: [86, -124], weapon: -102, torso: 21, head: -3, root: [0, 2], face: 'angry' }, { ease: 'inout' }),
    F(3, { ...READY, legR: [-24, 50], legL: [40, 8], armR: [88, -126], weapon: -104, torso: 20, head: -4, root: [0, -1], face: 'angry' }, { ease: 'in' }),
    F(3, { ...READY, legR: [-40, 56], legL: [52, 14], armR: [90, -128], weapon: -106, torso: 20, head: -4, root: [0, -2], face: 'angry' }, { ease: 'out' }),
    F(3, { ...READY, legR: [-30, 70], legL: [40, 30], armR: [88, -126], weapon: -104, torso: 22, head: -4, root: [0, 1], squash: 1.04, stretch: 0.96, face: 'angry' }, { ease: 'out' }),
    F(3, { ...READY, legR: [10, 30], legL: [10, 40], armR: [86, -124], weapon: -102, torso: 21, head: -3, root: [0, 2], face: 'angry' }, { ease: 'inout' }),
    F(3, { ...READY, legR: [40, 8], legL: [-24, 50], armR: [88, -126], weapon: -104, torso: 20, head: -4, root: [0, -1], face: 'angry' }, { ease: 'in' }),
  ] },
  jump: { loop: false, frames: [
    F(3, { ...CARRY, legR: [30, 40], legL: [-20, 44], torso: 14, root: [0, 4], squash: 1.1, stretch: 0.9, armL: [-30, 30] }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [30, -30], legL: [10, -20], torso: -4, root: [0, -2], squash: 0.94, stretch: 1.08, armL: [-70, -30], head: -4 }, { ease: 'out' }),
    F(30, { ...CARRY, legR: [40, -70], legL: [20, -50], torso: 2, armL: [-50, -20], head: -2, squash: 1, stretch: 1 }),
  ] },
  fall: { loop: true, frames: [
    F(10, { ...CARRY, legR: [24, -30], legL: [8, -20], armL: [-80, -30], torso: -6, head: -6, face: 'grit' }, { ease: 'inout' }),
    F(10, { ...CARRY, legR: [30, -40], legL: [4, -14], armL: [-95, -30], torso: -8, head: -8, face: 'grit' }, { ease: 'inout' }),
  ] },
  land: { loop: false, frames: [
    F(3, { ...CARRY, legR: [34, 46], legL: [-24, 48], torso: 22, head: 4, root: [0, 3], squash: 1.16, stretch: 0.86, armL: [-30, 30], face: 'grit' }, { ease: 'out' }),
    F(4, { ...CARRY, legR: [14, 16], legL: [-10, 18], torso: 8, root: [0, 1], squash: 1.02, stretch: 0.98 }, { ease: 'out' }),
  ] },

  // ---- ground combo: swipe -> backhand -> overhead slam -> steam uppercut (GDD 2.1) ----
  // Every attack: anticipation (ease in, hammer wound the opposite way) -> hit key (overshoot + smear + hitbox) ->
  // hit hold (+4 deg) -> follow-through (inout, cancel window) -> return to CARRY.
  attack1: { loop: false, frames: [
    F(3, { grip: 1, armR: [-44, -146], weapon: -72, armL: [40, -50], torso: -12, head: -6, root: [-2, 1], legR: [4, 4], legL: [-18, 12], face: 'angry' }, { sfx: SW, ease: 'in' }),
    F(3, { grip: 1, armR: [-52, -150], weapon: -76, armL: [50, -60], torso: -18, head: -8, root: [-3, 1], legR: [2, 6], legL: [-22, 16], face: 'angry' }, { ease: 'out' }),
    F(3, { grip: 1, armR: [76, 60], weapon: 94, armL: [-24, 16], torso: 26, head: 6, root: [5, 2], legR: [34, 8], legL: [-26, 22], face: 'shout' },
      { hitbox: frontBox(40, hit(10, 'light', 2, 0, 16)), smear: { from: -160, to: 0, a: 0.5 }, fx: [{ kind: 'slash', x: 30, y: 40, radius: 30, angle: 10 }], ease: 'overshoot' }),
    F(2, { grip: 1, armR: [80, 64], weapon: 98, armL: [-26, 16], torso: 28, head: 6, root: [6, 2], legR: [34, 8], legL: [-26, 22], face: 'shout' }, { ease: 'out' }),
    F(6, { grip: 1, armR: [74, 58], weapon: 92, armL: [-22, 14], torso: 24, head: 4, root: [5, 2], legR: [32, 8], legL: [-26, 22], face: 'angry' }, { cancel: 'attack', ease: 'inout' }),
    F(4, { ...CARRY, torso: 8, root: [2, 0], face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack2: { loop: false, frames: [
    F(3, { grip: 1, armR: [74, 60], weapon: 98, armL: [-30, 20], torso: 22, head: 4, root: [2, 2], legR: [30, 8], legL: [-24, 20], face: 'angry' }, { sfx: SW, ease: 'in' }),
    F(2, { grip: 1, armR: [80, 66], weapon: 104, armL: [-34, 22], torso: 26, head: 6, root: [3, 2], legR: [30, 8], legL: [-24, 20], face: 'angry' }, { ease: 'out' }),
    F(3, { grip: 1, armR: [-56, -90], weapon: -80, armL: [50, -40], torso: -16, head: -10, root: [-4, 1], legR: [-10, 10], legL: [20, 6], face: 'shout' },
      { hitbox: frontBox(40, hit(10, 'light', 2, 0, 16), { behind: true }), smear: { from: 5, to: -200, a: 0.5 }, fx: [{ kind: 'slash', x: -6, y: 46, radius: 34, angle: -110 }], ease: 'overshoot' }),
    F(2, { grip: 1, armR: [-60, -94], weapon: -84, armL: [54, -44], torso: -18, head: -12, root: [-5, 1], legR: [-10, 10], legL: [20, 6], face: 'shout' }, { ease: 'out' }),
    F(6, { grip: 1, armR: [-50, -86], weapon: -76, armL: [40, -30], torso: -10, head: -6, root: [-3, 1], legR: [-6, 8], legL: [16, 6], face: 'angry' }, { cancel: 'attack', ease: 'inout' }),
    F(4, { ...CARRY, torso: 6, face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack3: { loop: false, frames: [
    F(4, { grip: 1, armR: [-120, -60], weapon: -56, armL: [-10, -150], torso: -18, head: -10, root: [-2, 1], legR: [6, 4], legL: [-20, 14], face: 'angry' }, { sfx: SW, armor: true, ease: 'in' }),
    F(3, { grip: 1, armR: [-130, -66], weapon: -60, armL: [-30, -150], torso: -26, head: -12, root: [-3, -1], squash: 0.96, stretch: 1.05, legR: [4, 2], legL: [-24, 18], face: 'shout' }, { armor: true, ease: 'out' }),
    F(3, { grip: 1, armR: [84, -100], weapon: -20, armL: [100, 10], torso: 40, head: 8, root: [6, 2], squash: 1.1, stretch: 0.9, legR: [44, 30], legL: [-30, 34], face: 'shout' },
      { hitbox: frontBox(40, hit(15, 'knockdown', 3, 4, 20)), smear: { from: -175, to: 60, a: 0.55 }, sfx: 'hammer_slam', armor: true,
        fx: [{ kind: 'dust', x: 30, y: 0, count: 6 }, { kind: 'ring', x: 34, y: 0, r0: 4, r1: 26, flat: true, color: '#ffd080' }], ease: 'overshoot' }),
    F(3, { grip: 1, armR: [86, -98], weapon: -18, armL: [102, 12], torso: 42, head: 8, root: [6, 2], squash: 1.08, stretch: 0.92, legR: [44, 30], legL: [-30, 34], face: 'grit' }, { ease: 'out' }),
    F(10, { grip: 1, armR: [106, -100], weapon: -10, armL: [90, 20], torso: 30, head: 6, root: [5, 2], legR: [38, 22], legL: [-28, 28], face: 'grit' }, { cancel: 'attack', ease: 'inout' }),
    F(4, { ...CARRY, torso: 8, root: [2, 1], face: 'angry' }, { cancel: 'attack', ease: 'out' }),
  ] },
  attack4: { loop: false, frames: [
    F(4, { grip: 1, armR: [-84, 100], weapon: 110, armL: [40, 20], torso: 24, head: 6, root: [0, 2], squash: 1.08, stretch: 0.92, legR: [30, 40], legL: [-14, 34], face: 'angry' }, { sfx: 'steam', armor: true, ease: 'in' }),
    F(3, { grip: 1, armR: [-90, 104], weapon: 114, armL: [46, 24], torso: 28, head: 8, root: [-1, 3], squash: 1.12, stretch: 0.88, legR: [32, 44], legL: [-16, 38], face: 'grit' }, { armor: true, ease: 'out' }),
    F(4, { grip: 1, armR: [160, 8], weapon: -2, armL: [-40, 20], torso: -16, head: -10, root: [5, -6], squash: 0.94, stretch: 1.08, legR: [26, 4], legL: [-30, 36], face: 'shout' },
      { hitbox: frontBox(40, hit(20, 'launch', 2, 8, 20), { high: true }), smear: { from: 130, to: -80, a: 0.55 }, sfx: 'steam', armor: true,
        fx: [{ kind: 'ring', x: 26, y: 40, r0: 2, r1: 24, color: '#ffb060' }, { kind: 'steam', x: 26, y: 40, count: 3 }], ease: 'overshoot' }),
    F(3, { grip: 1, armR: [164, 10], weapon: -4, armL: [-44, 20], torso: -18, head: -12, root: [5, -6], squash: 0.96, stretch: 1.05, legR: [26, 4], legL: [-30, 36], face: 'shout' }, { ease: 'out' }),
    F(12, { grip: 1, armR: [130, 58], weapon: 20, armL: [-34, 20], torso: -10, head: -6, root: [4, -1], legR: [20, 10], legL: [-26, 30], face: 'angry' }, { cancel: 'any', ease: 'inout' }),
    F(4, { ...CARRY, torso: 6, root: [2, 0] }, { cancel: 'any', ease: 'out' }),
  ] },

  jumpAttack: { loop: false, frames: [
    F(4, { grip: 1, armR: [-104, -120], weapon: -82, armL: [40, -40], torso: -12, head: -6, legR: [56, -100], legL: [14, -56], face: 'angry' }, { sfx: SW, ease: 'in' }),
    F(5, { grip: 1, armR: [110, -100], weapon: 4, armL: [-30, 10], torso: 26, head: 6, legR: [60, -106], legL: [16, -60], face: 'shout' },
      { hitbox: JUMP_HIT, smear: { from: -170, to: 70, a: 0.5 }, ease: 'overshoot' }),
    F(20, { grip: 1, armR: [114, -98], weapon: 8, armL: [-30, 10], torso: 28, head: 6, legR: [56, -100], legL: [14, -56], face: 'grit' }, { hitbox: JUMP_HIT }),
  ] },
  landAttack: { loop: false, frames: [
    F(2, { grip: 1, armR: [78, -100], weapon: -38, armL: [90, 20], legR: [30, 50], legL: [-20, 50], torso: 30, head: 6, root: [0, 3], squash: 1.18, stretch: 0.82, face: 'shout' },
      { event: 'shockwave', radius: 40, hit: hit(10, 'knockdown', 4, 4, 20), sfx: 'land_heavy', ease: 'out' }),
    F(10, { grip: 1, armR: [90, -100], weapon: -26, armL: [86, 20], legR: [20, 30], legL: [-15, 30], torso: 18, root: [0, 1], face: 'grit' }, { ease: 'inout' }),
    F(6, { ...CARRY, torso: 4 }, { cancel: 'any', ease: 'out' }),
  ] },
  dashAttack: { loop: false, frames: [
    F(4, { armR: [-30, -150], weapon: 30, armL: [-50, 20], torso: 26, head: -6, root: [-2, 2], squash: 1.05, stretch: 0.95, legR: [26, 12], legL: [-24, 14], face: 'angry' }, { sfx: 'steam', armor: true, ease: 'in' }),
    F(14, { armR: [-40, -150], weapon: 30, armL: [-70, 30], torso: 48, head: -14, root: [6, 2], legR: [60, 20], legL: [-50, 60], face: 'shout' },
      { hitbox: frontBox(40, hit(18, 'knockdown', 24, 3, 20)), move: { x: 8 }, armor: true, fx: [{ kind: 'dust', x: -10, y: 0 }, { kind: 'steam', x: -16, y: 44, count: 2 }] }),
    F(10, { armR: [-30, -150], weapon: 30, armL: [-40, 30], torso: 36, head: -8, root: [6, 2], legR: [-40, 60], legL: [50, 20], face: 'grit' }, { ease: 'out' }),
    F(4, { ...CARRY, torso: 8 }, { cancel: 'any', ease: 'out' }),
  ] },

  // ---- Piston Quake: two-handed overhead slam into the ground, r 60 (8f startup / 4f active / 12f recovery, invulnerable) ----
  special: { loop: false, frames: [
    F(4, { grip: 1, armR: [-120, -60], weapon: -56, armL: [-30, -170], torso: -14, head: -8, root: [-2, 1], legR: [10, 6], legL: [-18, 10], face: 'angry' }, { sfx: SW, invuln: true, ease: 'in' }),
    F(4, { grip: 1, armR: [-134, -70], weapon: -62, armL: [-60, -160], torso: -26, head: -14, root: [-3, -2], squash: 0.94, stretch: 1.08, legR: [6, 2], legL: [-22, 16], face: 'shout' }, { invuln: true, ease: 'out' }),
    F(4, { grip: 1, armR: [92, -100], weapon: 6, armL: [106, 8], torso: 44, head: 8, root: [6, 3], squash: 1.14, stretch: 0.86, legR: [48, 34], legL: [-34, 40], face: 'shout' },
      { hitbox: areaBox(60, hit(25, 'knockdown', 5, 4, 24)), invuln: true, sfx: 'hammer_slam', smear: { from: -175, to: 62, a: 0.6 },
        fx: [{ kind: 'ring', x: 0, y: 0, r1: 60, flat: true, color: '#ffb060' }, { kind: 'dust', x: 0, y: 0, count: 8 }, { kind: 'steam', x: 34, y: 6, count: 4 }], ease: 'overshoot' }),
    F(6, { grip: 1, armR: [94, -98], weapon: 8, armL: [104, 12], torso: 42, head: 6, root: [6, 3], squash: 1.1, stretch: 0.9, legR: [48, 34], legL: [-34, 40], face: 'grit' }, { ease: 'out' }),
    F(6, { grip: 1, armR: [106, -100], weapon: -8, armL: [90, 20], torso: 26, head: 4, root: [4, 2], legR: [36, 22], legL: [-26, 26], face: 'grit' }, { ease: 'inout' }),
    F(4, { ...CARRY, torso: 6 }, { cancel: 'any', ease: 'out' }),
  ] },
  // ---- Overpressure: hammer thrust straight up, boiler blows three expanding rings (r 60/100/140) ----
  super: (() => {
    const ring = (r, dmg, dur = 6) => F(dur, { grip: 1, armR: [148, 56], weapon: 18, armL: [-40, 30], torso: -8, head: -12, root: [0, 2], squash: 1.08, stretch: 0.94, legR: [24, 12], legL: [-24, 12], face: 'shout' },
      { hitbox: areaBox(r, hit(dmg, 'knockdown', 6, 5, 24), { y: -90, h: 90 }), sfx: 'steam', ease: 'out',
        fx: [{ kind: 'ring', x: 0, y: 0, r1: r, flat: true, color: '#e8f0f4' }, { kind: 'ring', x: 0, y: 30, r1: r * 0.8, color: '#ffb060' }, { kind: 'steam', x: -12, y: 60, count: 6 }] });
    const rise = (dur) => F(dur, { grip: 1, armR: [144, 52], weapon: 14, armL: [-30, 30], torso: -4, head: -8, root: [0, 1], squash: 0.96, stretch: 1.05, legR: [16, 6], legL: [-16, 6], face: 'grit' }, { ease: 'in' });
    return { loop: false, frames: [
      F(5, { grip: 1, armR: [-84, 100], weapon: 110, armL: [30, 30], torso: 20, head: 6, root: [0, 2], squash: 1.1, stretch: 0.9, legR: [26, 30], legL: [-20, 30], face: 'angry' }, { sfx: 'super_brunhild', ease: 'in' }),
      F(4, { grip: 1, armR: [144, 54], weapon: 16, armL: [-30, 30], torso: -6, head: -10, root: [0, 0], squash: 0.94, stretch: 1.08, legR: [14, 4], legL: [-14, 4], face: 'shout' }, { smear: { from: 110, to: -95, a: 0.5 }, ease: 'overshoot' }),
      ring(60, 30), rise(4), ring(100, 30), rise(4), ring(140, 40),
      F(10, { grip: 1, armR: [136, 50], weapon: 12, armL: [-30, 20], torso: 0, head: -6, root: [0, 1], face: 'happy' }, { ease: 'inout' }),
      F(4, { ...CARRY, torso: 6 }, { ease: 'out' }),
    ] };
  })(),

  dodge: { loop: false, frames: [
    F(4, { ...READY, armR: [58, -130], weapon: -122, torso: 30, root: [0, 3, 0], legR: [40, 40], legL: [-20, 40], face: 'grit', squash: 1.08, stretch: 0.92 }, { sfx: 'dodge', ease: 'in' }),
    F(5, { torso: 24, head: 6, root: [4, -54, 120], legR: [100, 70], legL: [80, 90], armR: [70, -110], weapon: -30, armL: [60, 60], face: 'closed' }),
    F(5, { torso: 30, head: 10, root: [12, -40, 240], legR: [100, 70], legL: [80, 90], armR: [70, -110], weapon: -30, armL: [60, 60], face: 'closed' }),
    F(5, { torso: 40, root: [6, -6, 360], legR: [60, 40], legL: [30, 40], armR: [60, -110], weapon: -30, armL: [50, 60], face: 'closed' }, { ease: 'out' }),
    F(7, { ...CARRY, torso: 10, root: [0, 2, 360], legR: [18, 20], legL: [-12, 16], squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
  ] },
  taunt: { loop: false, frames: [
    F(8, { armR: [80, 30], weapon: 80, armL: [-12, 20], torso: 6, head: 2, legR: [12, 4], legL: [-12, 4], face: 'neutral' }, { ease: 'out' }),
    F(18, { armR: [78, 34], weapon: 84, armL: [-30, -80], torso: 8, head: -8, legR: [10, 2], legL: [-14, 6], root: [1, 1], face: 'happy' }, { ease: 'inout' }),
    F(18, { armR: [80, 32], weapon: 82, armL: [-34, -76], torso: 10, head: -4, legR: [10, 2], legL: [-14, 6], root: [1, 2], face: 'happy' }, { ease: 'inout' }),
    F(16, { armR: [78, 34], weapon: 84, armL: [-30, -80], torso: 8, head: -8, legR: [10, 2], legL: [-14, 6], root: [1, 1], face: 'happy' }, { event: 'meterGain', ease: 'inout' }),
  ] },

  // ---- grabs / throws ----
  grab: { loop: false, frames: [
    F(4, { ...CARRY, armL: [40, 40], torso: 6, root: [0, 0], face: 'angry' }, { ease: 'in' }),
    F(4, { armR: [76, 24], weapon: -100, armL: [84, 16], torso: 16, root: [3, 0], legR: [26, 8], legL: [-20, 14], face: 'angry' },
      { hitbox: { x: 4, y: -60, w: 36, h: 56, z: 20, type: 'grab', once: true, damage: 0 }, sfx: 'hit_grab', ease: 'out' }),
  ] },
  grabHold: { loop: true, frames: [
    F(16, { armR: [76, 24], weapon: -100, armL: [84, 16], torso: 12, root: [0, 0], legR: [22, 6], legL: [-20, 12], face: 'angry' }, { ease: 'inout' }),
    F(16, { armR: [78, 26], weapon: -100, armL: [86, 18], torso: 14, root: [0, 1], legR: [22, 6], legL: [-20, 12], face: 'angry' }, { ease: 'inout' }),
  ] },
  grabHit: { loop: false, frames: [
    F(4, { armR: [76, 24], weapon: -100, armL: [84, 16], torso: -8, head: -14, root: [-2, 0], legR: [20, 6], legL: [-20, 12], face: 'angry' }, { ease: 'in' }),
    F(4, { armR: [76, 24], weapon: -100, armL: [84, 16], torso: 28, head: 14, root: [4, 1], legR: [30, 10], legL: [-24, 18], face: 'shout' }, { sfx: 'hit_medium', ease: 'overshoot' }),
    F(6, { armR: [76, 24], weapon: -100, armL: [84, 16], torso: 12, root: [0, 0], legR: [22, 6], legL: [-20, 12], face: 'angry' }, { ease: 'out' }),
  ] },
  // forward throw: hammer-golf swing from the ground up
  throw: { loop: false, frames: [
    F(5, { grip: 1, armR: [-22, -96], weapon: -46, armL: [-20, 40], torso: 20, head: 6, root: [-2, 1], squash: 1.06, stretch: 0.94, legR: [28, 34], legL: [-14, 30], face: 'angry' }, { ease: 'in' }),
    F(6, { grip: 1, armR: [120, 60], weapon: 30, armL: [-40, 20], torso: -12, head: -8, root: [6, -2], squash: 0.96, stretch: 1.06, legR: [24, 6], legL: [-30, 34], face: 'shout' },
      { sfx: 'throw', smear: { from: 120, to: -60, a: 0.5 }, ease: 'overshoot' }),
    F(10, { grip: 1, armR: [132, 50], weapon: 28, armL: [-34, 20], torso: -8, head: -6, root: [6, 0], legR: [20, 8], legL: [-26, 30], face: 'angry' }, { ease: 'out' }),
    F(4, { ...CARRY, torso: 6 }, { ease: 'out' }),
  ] },
  // back throw: piledriver — lift overhead, slam down behind
  throwBack: { loop: false, frames: [
    F(5, { grip: 1, armR: [-180, 50], weapon: 14, armL: [-150, -10], torso: -24, head: -10, root: [-3, 1], squash: 0.95, stretch: 1.06, legR: [10, 4], legL: [-10, 4], face: 'angry' }, { ease: 'in' }),
    F(6, { grip: 1, armR: [-96, 70], weapon: -34, armL: [-170, -20], torso: -44, head: -12, root: [-8, 2], squash: 1.12, stretch: 0.88, legR: [-30, 40], legL: [30, 40], face: 'shout' }, { sfx: 'throw', ease: 'overshoot' }),
    F(10, { grip: 1, armR: [-106, 70], weapon: -30, armL: [-160, -10], torso: -34, head: -8, root: [-7, 2], legR: [-24, 30], legL: [26, 30], face: 'grit' }, { ease: 'out' }),
    F(4, { ...CARRY, torso: 6 }, { ease: 'out' }),
  ] },

  // ---- damage / defeat ----
  hurt: { loop: false, frames: [
    F(4, { ...CARRY, torso: -26, head: -24, armL: [-60, -30], armR: [10, -140], weapon: 40, root: [-5, 1], legR: [22, 4], legL: [-14, 12], face: 'hurt' }, { ease: 'out' }),
    F(10, { ...CARRY, torso: -12, head: -10, armL: [-30, -10], armR: [24, -160], weapon: 24, root: [-2, 1], legR: [14, 2], legL: [-10, 8], face: 'hurt' }, { ease: 'out' }),
    F(6, { ...CARRY, torso: 0, face: 'angry' }, { ease: 'out' }),
  ] },
  hurtAir: { loop: true, frames: [
    F(6, { armR: [-90, -40], weapon: 40, armL: [-100, -30], torso: -30, head: -25, legR: [40, 40], legL: [10, 60], root: [0, 0, -15], face: 'hurt' }, { ease: 'inout' }),
    F(6, { armR: [-100, -50], weapon: 50, armL: [-110, -30], torso: -35, head: -30, legR: [50, 30], legL: [20, 50], root: [0, 0, -25], face: 'hurt' }, { ease: 'inout' }),
  ] },
  knockdown: { loop: true, frames: [
    F(8, { armR: [-60, -40], weapon: 40, armL: [-80, -30], torso: -50, head: -20, legR: [50, 30], legL: [30, 50], root: [0, -6, -25], face: 'hurt' }, { ease: 'inout' }),
    F(8, { armR: [-70, -50], weapon: 50, armL: [-90, -30], torso: -55, head: -25, legR: [60, 20], legL: [40, 40], root: [0, -6, -35], face: 'hurt' }, { ease: 'inout' }),
  ] },
  lying: { loop: true, frames: [
    F(16, { ...FLOORED }, { ease: 'inout' }),
    F(16, { ...FLOORED, torso: 6, head: -12 }, { ease: 'inout' }),
  ] },
  getup: { loop: false, frames: [
    F(8, { ...FLOORED }, { ease: 'in' }),
    F(8, { armR: [60, 40], weapon: 30, armL: [-30, 40], torso: 30, head: -10, legR: [70, 60], legL: [-20, 60], root: [8, 4, -20], face: 'grit', squash: 1.06, stretch: 0.94 }, { ease: 'out' }),
    F(6, { ...CARRY, torso: 8, root: [0, 1], legR: [15, 20], legL: [-10, 15], face: 'angry' }, { ease: 'out' }),
  ] },
  dead: { loop: false, frames: [
    F(60, { ...FLOORED, torso: 8, head: -14, legR: [6, 4], legL: [-6, 6], root: [30, -9, -90] }),
  ] },
  win: { loop: true, frames: [
    F(6, { armR: [-160, -10], weapon: -20, armL: [-20, 10], torso: -4, head: -6, root: [0, 3], squash: 1.08, stretch: 0.92, legR: [12, 10], legL: [-12, 10], face: 'happy' }, { ease: 'out' }),
    F(10, { armR: [-176, -20], weapon: -30, armL: [-40, -60], torso: -8, head: -12, root: [0, -8], squash: 0.96, stretch: 1.06, legR: [30, -50], legL: [-10, -30], face: 'happy' }, { ease: 'out' }),
    F(6, { armR: [-170, -16], weapon: -26, armL: [-30, -40], torso: -6, head: -10, root: [0, -3], legR: [20, -20], legL: [-10, -10], face: 'happy' }, { ease: 'in' }),
    F(4, { armR: [-160, -10], weapon: -20, armL: [-20, 10], torso: -4, head: -6, root: [0, 4], squash: 1.1, stretch: 0.9, legR: [14, 14], legL: [-14, 14], face: 'happy' }, { ease: 'out' }),
    F(14, { armR: [-164, -12], weapon: -22, armL: [-24, 8], torso: -5, head: -8, root: [0, 1], legR: [10, 4], legL: [-10, 4], face: 'happy' }, { ease: 'inout' }),
  ] },
};

/** Brunhild Coalheart character definition. */
export const brunhild = {
  id: 'brunhild', name: 'BRUNHILD', fullName: 'Brunhild Coalheart', title: 'THE BOILERWRIGHT', archetype: 'TANK',
  stats: { power: 5, speed: 2, health: 5, range: 3, technique: 2 },
  maxHp: hpFor(5), walkSpeed: speedFor(2), runSpeed: speedFor(2) * 1.7, jumpVy: JUMP_VY, reach: 40, grabReach: 20, grabOffset: 26,
  damageTaken: 0.85, freeChain: true,
  build,
  anims,
  moves: {
    special: { name: 'PISTON QUAKE', cost: METER.special }, super: { name: 'OVERPRESSURE', cost: METER.super, damage: 100 },
    throwFwd: { damage: 20, vx: 12, vy: 5 }, throwBack: { damage: 22, vx: 6, vy: 4, shockwave: { r: 40, damage: 10 } }, grabHit: { damage: 8, hits: 3 },
  },
  sfx: { special: 'special_brunhild', super: 'super_brunhild', swing: 'hammer_swing' },
  portrait,
};
