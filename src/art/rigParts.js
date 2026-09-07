// Default part renderers for rig.js, drawn as chunky cel-shaded pixel-sprite shapes (1px outline, 3-tone bands,
// top-left light). Every function draws in the part's local space set up by rig.js and allocates nothing.
// Content may import these to compose custom parts (e.g. draw the default boot and add a strap).
import { celCapsule, celTaper, celBall, celRect, celPoly, celPath, tones, flat, pathRR, rimRect } from './shading.js';
import { FACE } from './poses.js';

const R = Math.round;

/**
 * Upper + lower limb capsules (root space). Forearms/shins are drawn slightly thicker than the upper segment.
 * `bulge` (0..1, from proportions.bulge) tapers each segment toward its far end: thighs/upper arms swell at the
 * hip/shoulder, shins/forearms narrow toward the ankle/wrist — the "heroic" silhouette for taller builds.
 */
export function drawLimbSegs(ctx, rig, a, b, c, r1, r2, fill1, fill2, capAtA = true, bulge = 0) {
  if (capAtA) celBall(ctx, rig, a.x, a.y, r1 + 1, fill1, false); // shoulder / hip cap so the joint reads as a sleeve
  if (bulge > 0) {
    celTaper(ctx, rig, a.x, a.y, b.x, b.y, r1 * (1 + 0.14 * bulge), r1 * (1 - 0.06 * bulge), fill1);
    celTaper(ctx, rig, b.x, b.y, c.x, c.y, r2 * (1 + 0.04 * bulge), r2 * (1 - 0.22 * bulge), fill2);
  } else {
    celCapsule(ctx, rig, a.x, a.y, b.x, b.y, r1, fill1);
    celCapsule(ctx, rig, b.x, b.y, c.x, c.y, r2, fill2);
  }
}

/** Sleeve cuff band around the elbow end of the forearm (root space, along the limb b->c). */
export function drawCuff(ctx, rig, b, c, r, hex) {
  const dx = c.x - b.x, dy = c.y - b.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const x0 = b.x + ux * 1, y0 = b.y + uy * 1, x1 = b.x + ux * 4, y1 = b.y + uy * 4;
  celCapsule(ctx, rig, x0, y0, x1, y1, r + 0.5, hex, 0);
}

/** Mitten fist with a thumb (hand space: +x along the forearm, origin at the wrist). */
export function drawFist(ctx, rig, r, skin, opts = null) {
  const w = R(r * 2.2), h = R(r * 2), x0 = R(-r * 0.6), y0 = R(-r);
  celRect(ctx, rig, x0, y0, w, h, R(r * 0.8), skin, 0.4, 0.25);
  // thumb: small ball on the lit side, knuckle notches
  celBall(ctx, rig, x0 + R(r * 0.9), y0, R(r * 0.55), skin, false);
  if (!rig.override) {
    ctx.fillStyle = tones(rig, skin).sh;
    ctx.fillRect(x0 + w - 3, y0 + 2, 1, 1); ctx.fillRect(x0 + w - 3, y0 + h - 3, 1, 1);
  }
  if (opts && opts.glove) { ctx.fillStyle = rig.col(opts.glove); ctx.fillRect(x0 - 1, y0, 2, h); }
}

/** Boot with a sole, heel, toe cap and strap (ankle space: origin at the ankle, y down, toe toward +x). */
export function drawBoot(ctx, rig, footL, footH, hex, accent = null) {
  const heel = R(footL * 0.42), toe = R(footL * 0.62), top = -R(footH * 1.0), sole = R(footH * 0.5);
  // upper: heel block + toe wedge as one silhouette
  celPoly(ctx, rig, [-heel, top, heel * 0.6, top, toe - 2, sole - 3, toe, sole - 1, toe, sole, -heel, sole], hex, 0.34, 0.3);
  if (rig.override) return;
  const t = tones(rig, hex);
  // sole (2px, darkest) + 1px heel step
  ctx.fillStyle = t.deep; ctx.fillRect(-heel, sole - 1, toe + heel, 2); ctx.fillRect(-heel, sole - 3, 3, 2);
  // strap + buckle across the instep
  ctx.fillStyle = t.deep; ctx.fillRect(-heel + 1, top + 2, heel * 0.6 + heel - 2, 2);
  ctx.fillStyle = rig.col(accent || rig.palette.accent); ctx.fillRect(R(heel * 0.6) - 3, top + 1, 3, 3);
  // rim on the lit top edge
  ctx.fillStyle = t.rim; ctx.fillRect(-heel + 1, top, R((heel * 0.6 + heel) * 0.6), 1);
}

/** Shaped torso silhouette (torso space: origin at the hip centre, y up negative). Shoulders wide, waist narrow. */
export function drawTorsoShape(ctx, rig, W, H, hip, hex) {
  const hw = R(W / 2), hh = R(hip / 2 * 0.92);
  celPoly(ctx, rig, [-hw - 1, -H + 4, -hw + 4, -H, hw - 4, -H, hw + 1, -H + 4, hw, R(-H * 0.5), hh, 2, -hh, 2, -hw, R(-H * 0.5)], hex, 0.36, 0.28);
  if (rig.override) return;
  const t = tones(rig, hex);
  // collar notch + chest seam + two buttons
  ctx.fillStyle = t.deep; ctx.fillRect(-3, -H, 6, 3); ctx.fillRect(0, -H + 5, 1, H - 8);
  ctx.fillStyle = rig.col(rig.palette.accent); ctx.fillRect(2, -H + 8, 2, 2); ctx.fillRect(2, -H + 14, 2, 2);
}

/** Belt with buckle and rivets over a short trouser block (hip space: origin at hip centre). */
export function drawBelt(ctx, rig, hip, hex, beltHex, buckleHex) {
  const hw = R(hip / 2);
  celRect(ctx, rig, -hw, -5, hip, 11, 3, hex, 0.4, 0.2);
  if (rig.override) { ctx.fillStyle = rig.col(beltHex); ctx.fillRect(-hw + 1, -5, hip - 2, 3); return; }
  const t = tones(rig, beltHex);
  ctx.fillStyle = t.base; ctx.fillRect(-hw + 1, -5, hip - 2, 4);
  ctx.fillStyle = t.sh; ctx.fillRect(-hw + 1, -2, hip - 2, 1);
  ctx.fillStyle = rig.col(buckleHex); ctx.fillRect(1, -6, 5, 5);
  ctx.fillStyle = t.sh; ctx.fillRect(2, -5, 3, 3);
  ctx.fillStyle = tones(rig, buckleHex).hi; ctx.fillRect(-hw + 3, -4, 1, 1); ctx.fillRect(hw - 4, -4, 1, 1);
}

/** Neck (root space, between the neck joint and the head centre). */
export function drawNeck(ctx, rig, n, h, skin, r = 3.5) {
  celCapsule(ctx, rig, n.x, n.y, n.x + (h.x - n.x) * 0.5, n.y + (h.y - n.y) * 0.5, r, skin, 0);
}

/** Skull + jaw + ear + nose (head space). Hair cap drawn over the top/back with clumps. */
export function drawSkull(ctx, rig, r, skin, hair, opts = null) {
  const jaw = opts && opts.jaw != null ? opts.jaw : 0.35;
  // skull: ellipse with a squared jaw toward the chin
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.05, r, r * 0.98, 0, Math.PI * 1.02, Math.PI * 2.02);
  ctx.lineTo(r * 0.98, r * jaw); ctx.lineTo(r * 0.6, r * 0.95); ctx.lineTo(-r * 0.55, r * 0.95); ctx.lineTo(-r * 0.98, r * jaw);
  ctx.closePath();
  celPath(ctx, rig, skin, 0, 0, r, 0.3, 0.3);
  // ear
  celBall(ctx, rig, -r * 0.55, r * 0.15, R(r * 0.26), skin, false);
  // nose (profile bump)
  ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.05); ctx.lineTo(r * 1.15, r * 0.3); ctx.lineTo(r * 0.7, r * 0.45); ctx.closePath();
  flat(ctx, rig, skin);
  if (!rig.override) { ctx.fillStyle = tones(rig, skin).sh; ctx.fillRect(R(r * 0.75), R(r * 0.4), 3, 1); }
  if (hair && !(opts && opts.noHair)) drawHairCap(ctx, rig, r, hair, opts && opts.hairStyle);
}

/** Hair mass: a cap over the top/back of the skull with 3 shaded clumps. */
export function drawHairCap(ctx, rig, r, hair, style = 'short') {
  const b = R(r * 0.72);
  if (style === 'bald') return;
  ctx.beginPath();
  ctx.moveTo(r * 0.62, -r * 0.62);
  ctx.lineTo(r * 0.3, -r * 0.9); ctx.lineTo(r * 0.05, -r * 1.02); ctx.lineTo(-r * 0.35, -r * 0.98); ctx.lineTo(-r * 0.8, -r * 0.7);
  ctx.lineTo(-r * 1.02, -r * 0.2); ctx.lineTo(-r * 1.0, r * 0.25); ctx.lineTo(-r * 0.8, r * 0.1); ctx.lineTo(-r * 0.7, -r * 0.35);
  ctx.lineTo(-r * 0.3, -r * 0.62); ctx.lineTo(r * 0.15, -r * 0.6);
  ctx.closePath();
  celPath(ctx, rig, hair, -r * 0.2, -r * 0.5, r, 0.4, 0.3);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, hair).sh; ctx.fillRect(R(-r * 0.6), R(-r * 0.75), 1, 3); ctx.fillRect(R(-r * 0.1), R(-r * 0.9), 1, 2);
  ctx.fillStyle = tones(rig, hair).hi; ctx.fillRect(R(-r * 0.45), -b - 2, 3, 1);
}

/**
 * Face: whites of the eyes with pupils, brows and a mouth, all driven by the expression index (poses.js FACE).
 * Head space, rig faces right; the near eye sits at +x. `opts.noMouth` for bearded rigs, `opts.eyeY` to move the eye line.
 */
export function drawFace(ctx, rig, r, face, opts = null) {
  const ink = rig.col(rig.outline), white = rig.col('#f8f4ec'), ey = R(-r * 0.15) + (opts && opts.eyeY || 0);
  const ex = R(r * 0.45), fx = R(-r * 0.12), pupil = rig.col(opts && opts.pupil || '#1a1418');
  const angry = face === FACE.angry || face === FACE.shout || face === FACE.grit;
  const closed = face === FACE.closed || face === FACE.happy;
  if (face === FACE.dazed) {
    ctx.fillStyle = ink;
    for (let i = 0; i < 3; i++) { ctx.fillRect(ex - 1 + i, ey - 1 + i, 1, 1); ctx.fillRect(ex + 1 - i, ey - 1 + i, 1, 1); ctx.fillRect(fx - 1 + i, ey - 1 + i, 1, 1); ctx.fillRect(fx + 1 - i, ey - 1 + i, 1, 1); }
  } else if (closed) {
    ctx.fillStyle = ink;
    if (face === FACE.happy) { ctx.fillRect(ex - 1, ey, 1, 1); ctx.fillRect(ex, ey - 1, 2, 1); ctx.fillRect(ex + 2, ey, 1, 1); ctx.fillRect(fx - 1, ey, 1, 1); ctx.fillRect(fx, ey - 1, 1, 1); ctx.fillRect(fx + 1, ey, 1, 1); }
    else { ctx.fillRect(ex - 1, ey, 4, 1); ctx.fillRect(fx - 1, ey, 3, 1); }
  } else {
    // whites + pupils (pupils look toward facing; hurt = wide eyes with small pupils)
    const wide = face === FACE.hurt ? 1 : 0;
    ctx.fillStyle = white; ctx.fillRect(ex - 1, ey - 1 - wide, 4, 3 + wide); ctx.fillRect(fx - 1, ey - 1 - wide, 3, 3 + wide);
    ctx.fillStyle = pupil;
    if (face === FACE.hurt) { ctx.fillRect(ex + 1, ey, 1, 1); ctx.fillRect(fx, ey, 1, 1); }
    else { ctx.fillRect(ex + 1, ey - (angry ? 0 : 1), 1, 2); ctx.fillRect(fx, ey - (angry ? 0 : 1), 1, 2); }
    if (angry) { ctx.fillStyle = ink; ctx.fillRect(ex - 1, ey - 1, 4, 1); ctx.fillRect(fx - 1, ey - 1, 3, 1); } // lids pressed down
  }
  // brows (1px, stepped)
  ctx.fillStyle = rig.col(opts && opts.brow || rig.palette.hair || ink);
  const by = ey - 3;
  if (angry) { ctx.fillRect(ex - 2, by - 1, 2, 1); ctx.fillRect(ex, by, 2, 1); ctx.fillRect(ex + 2, by + 1, 1, 1); ctx.fillRect(fx - 1, by, 2, 1); ctx.fillRect(fx + 1, by + 1, 1, 1); }
  else if (face === FACE.hurt) { ctx.fillRect(ex - 2, by, 2, 1); ctx.fillRect(ex, by - 1, 3, 1); ctx.fillRect(fx - 1, by, 1, 1); ctx.fillRect(fx, by - 1, 2, 1); }
  else if (face === FACE.happy) { ctx.fillRect(ex - 2, by - 1, 4, 1); ctx.fillRect(fx - 1, by - 1, 3, 1); }
  else { ctx.fillRect(ex - 2, by, 4, 1); ctx.fillRect(fx - 1, by, 3, 1); }
  if (opts && opts.noMouth) return;
  drawMouth(ctx, rig, r, face, opts);
}

/** Mouth only (head space), for rigs that draw their own eyes. */
export function drawMouth(ctx, rig, r, face, opts = null) {
  const ink = rig.col(rig.outline), mx = R(r * 0.45), my = R(r * 0.5) + (opts && opts.mouthY || 0);
  ctx.fillStyle = ink;
  if (face === FACE.shout) { ctx.fillRect(mx - 1, my - 1, 4, 4); ctx.fillStyle = rig.col('#a03030'); ctx.fillRect(mx, my + 1, 2, 1); ctx.fillStyle = rig.col('#f8f4ec'); ctx.fillRect(mx, my - 1, 2, 1); }
  else if (face === FACE.hurt) { ctx.fillRect(mx, my - 1, 2, 3); }
  else if (face === FACE.angry || face === FACE.grit) { ctx.fillRect(mx - 1, my + 1, 1, 1); ctx.fillRect(mx, my, 3, 1); ctx.fillRect(mx + 3, my + 1, 1, 1); if (face === FACE.grit) { ctx.fillStyle = rig.col('#f8f4ec'); ctx.fillRect(mx, my + 1, 3, 1); } }
  else if (face === FACE.happy) { ctx.fillRect(mx - 1, my - 1, 1, 1); ctx.fillRect(mx, my, 3, 1); ctx.fillRect(mx + 3, my - 1, 1, 1); }
  else if (face === FACE.dazed) { ctx.fillRect(mx - 1, my, 1, 1); ctx.fillRect(mx, my + 1, 2, 1); ctx.fillRect(mx + 2, my, 1, 1); }
  else ctx.fillRect(mx, my, 3, 1);
}

/** Generic weapon: a shaded stick with a wrapped grip (hand space, +x along the blade). */
export function drawStick(ctx, rig, len, hex, gripHex) {
  celRect(ctx, rig, -4, -2, len, 4, 2, hex, 0.4, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(gripHex || rig.palette.dark);
  for (let x = -3; x < 6; x += 3) ctx.fillRect(x, -2, 2, 4);
}

export { pathRR, rimRect };
