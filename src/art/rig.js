// Generic humanoid paper-doll rig (ARCHITECTURE.md section 4).
// Local space: authored facing right, origin at the feet centre, y negative = up. Angles in degrees:
// limb 0 = hanging down, positive = swings forward (toward facing). torso/head positive = lean forward.
import { rad } from '../engine/math.js';
import { PALETTES, shadePalette } from './palettes.js';
import { pathCapsule, pathEllipse, pathRrect, paint } from './shapes.js';
import { SCRATCH_POSE, copyPose } from './poses.js';

/** Reference proportions at scale 1 (~72-76 px tall). */
export const DEFAULT_PROPORTIONS = Object.freeze({
  headR: 9, neck: 3, torsoW: 22, torsoH: 26, hip: 18, upperArm: 13, lowerArm: 12, handR: 4, upperLeg: 15, lowerLeg: 15, footL: 10,
  armR: 4.5, legR: 5.5, footH: 5, shoulderX: 2, hipX: 4,
});

const FAR_SHADE = 0.8;
const OFF_W = 320, OFF_H = 320, OFF_OX = 160, OFF_OY = 264;
let offCanvas = null, offCtx = null;
function getOffscreen() {
  if (!offCanvas) { offCanvas = document.createElement('canvas'); offCanvas.width = OFF_W; offCanvas.height = OFF_H; offCtx = offCanvas.getContext('2d'); }
  return offCtx;
}

const pt = () => ({ x: 0, y: 0 });
function makeJoints() {
  return {
    hipN: pt(), hipF: pt(), kneeN: pt(), kneeF: pt(), ankleN: pt(), ankleF: pt(), legN: { upper: 0, lower: 0, foot: 0 }, legF: { upper: 0, lower: 0, foot: 0 },
    torso: pt(), torsoAngle: 0, shoulderN: pt(), shoulderF: pt(), elbowN: pt(), elbowF: pt(), wristN: pt(), wristF: pt(),
    handN: pt(), handF: pt(), armN: { upper: 0, lower: 0, hand: 0 }, armF: { upper: 0, lower: 0, hand: 0 },
    neck: pt(), head: pt(), headAngle: 0, weaponTip: pt(), top: 0,
  };
}

/**
 * Precompute a rig from a build description (see ARCHITECTURE.md section 4 for the build shape).
 * @returns {object} rig with { build, scale, p (proportions), palette, paletteFar, outline, joints, height, width, col(hex) }
 */
export function buildRig(build = {}) {
  const p = { ...DEFAULT_PROPORTIONS, ...(build.proportions || {}) };
  const palette = { ...PALETTES.hero, ...(build.palette || {}) };
  const hipY = -(p.upperLeg + p.lowerLeg + p.footH - 2);
  const rig = {
    build, scale: build.scale || 1, p, palette, paletteFar: shadePalette(palette, FAR_SHADE),
    outline: build.outline || '#1a1018', ow: build.outlineWidth != null ? build.outlineWidth : 2,
    parts: build.parts || {}, accessories: build.accessories || [], weapon: build.weapon || null,
    hipY, height: (-(hipY) + p.torsoH - 2 + p.neck + p.headR * 2), width: p.torsoW,
    joints: makeJoints(), override: null, facing: 1,
    tf: { x: 0, y: 0, fs: 1, ss: 1, rx: 0, ry: 0, c: 1, s: 0 },
    /** Reusable info object passed to part hooks ({ name, far, pal, len, r, color, w, h }); do not retain it. */
    partInfo: { name: '', far: false, pal: null, len: 0, r: 0, color: '', w: 0, h: 0, length: 0 },
    /** Colour helper for hooks: returns the flash override when active, else the colour. */
    col(hex) { return rig.override || hex; },
  };
  return rig;
}

const SIDES = ['N', 'F'];

/** Compute joint positions (root space, before root offset/rotation) for a resolved pose into rig.joints. */
export function computeJoints(rig, pose) {
  const p = rig.p, J = rig.joints, hipY = rig.hipY;
  const ta = pose.torso.rot;
  // legs (attached to the hips, unaffected by torso lean)
  for (let i = 0; i < 2; i++) {
    const side = SIDES[i];
    const leg = side === 'N' ? pose.legR : pose.legL, foot = side === 'N' ? pose.footR : pose.footL;
    const hip = J['hip' + side], knee = J['knee' + side], ankle = J['ankle' + side], ang = J['leg' + side];
    hip.x = side === 'N' ? p.hipX : -p.hipX; hip.y = hipY;
    ang.upper = leg.upper; ang.lower = leg.upper + leg.lower; ang.foot = ang.lower * 0.35 + foot.rot;
    knee.x = hip.x + Math.sin(rad(ang.upper)) * p.upperLeg; knee.y = hip.y + Math.cos(rad(ang.upper)) * p.upperLeg;
    ankle.x = knee.x + Math.sin(rad(ang.lower)) * p.lowerLeg; ankle.y = knee.y + Math.cos(rad(ang.lower)) * p.lowerLeg;
  }
  // torso pivot at hip centre
  J.torso.x = pose.torso.x; J.torso.y = hipY + pose.torso.y; J.torsoAngle = ta;
  const c = Math.cos(rad(ta)), s = Math.sin(rad(ta));
  const tx = J.torso.x, ty = J.torso.y;
  const shY = -(p.torsoH - 5);
  J.shoulderN.x = tx + p.shoulderX * c - shY * s; J.shoulderN.y = ty + p.shoulderX * s + shY * c;
  J.shoulderF.x = tx + (-p.shoulderX - 2) * c - (shY + 1) * s; J.shoulderF.y = ty + (-p.shoulderX - 2) * s + (shY + 1) * c;
  const nY = -p.torsoH + 2;
  J.neck.x = tx - nY * s; J.neck.y = ty + nY * c;
  J.headAngle = ta + pose.head.rot;
  const hc = Math.cos(rad(J.headAngle)), hs = Math.sin(rad(J.headAngle));
  const hy = -(p.neck + p.headR) + pose.head.y, hx = pose.head.x;
  J.head.x = J.neck.x + hx * hc - hy * hs; J.head.y = J.neck.y + hx * hs + hy * hc;
  J.top = J.head.y - p.headR;
  // arms (relative to torso lean)
  for (let i = 0; i < 2; i++) {
    const side = SIDES[i];
    const arm = side === 'N' ? pose.armR : pose.armL, hand = side === 'N' ? pose.handR : pose.handL;
    const sh = J['shoulder' + side], el = J['elbow' + side], wr = J['wrist' + side], hd = J['hand' + side], ang = J['arm' + side];
    ang.upper = ta + arm.upper; ang.lower = ang.upper + arm.lower; ang.hand = ang.lower + hand.rot;
    el.x = sh.x + Math.sin(rad(ang.upper)) * p.upperArm; el.y = sh.y + Math.cos(rad(ang.upper)) * p.upperArm;
    wr.x = el.x + Math.sin(rad(ang.lower)) * p.lowerArm; wr.y = el.y + Math.cos(rad(ang.lower)) * p.lowerArm;
    hd.x = wr.x + Math.sin(rad(ang.lower)) * p.handR * 0.6; hd.y = wr.y + Math.cos(rad(ang.lower)) * p.handR * 0.6;
  }
  // weapon tip (hand space +x = along the forearm, plus weapon.rot)
  if (rig.weapon) {
    const near = rig.weapon.attach !== 'handL';
    const hd = near ? J.handN : J.handF, a = (near ? J.armN.hand : J.armF.hand) + pose.weapon.rot;
    const len = rig.weapon.length || 30;
    J.weaponTip.x = hd.x + Math.sin(rad(a)) * len; J.weaponTip.y = hd.y + Math.cos(rad(a)) * len;
  }
  return J;
}

// ---------- default part renderers (no allocations per frame: see ARCHITECTURE.md section 11) ----------
function limb(ctx, rig, a, b, r, fill) {
  pathCapsule(ctx, a.x, a.y, b.x, b.y, r);
  paint(ctx, rig.col(fill), rig.col(rig.outline), rig.ow);
}
function limbPair(ctx, rig, a, b, c, r1, r2, fill1, fill2) {
  // outline both segments first, then fill both, so the joint reads as one limb with a single silhouette
  const ol = rig.col(rig.outline);
  pathCapsule(ctx, a.x, a.y, b.x, b.y, r1); paint(ctx, null, ol, rig.ow);
  pathCapsule(ctx, b.x, b.y, c.x, c.y, r2); paint(ctx, null, ol, rig.ow);
  pathCapsule(ctx, a.x, a.y, b.x, b.y, r1); paint(ctx, rig.col(fill1), null, 0);
  pathCapsule(ctx, b.x, b.y, c.x, c.y, r2); paint(ctx, rig.col(fill2), null, 0);
}
/** Push a local space (translate + rotate). Every call must be paired with ctx.restore(). */
function enter(ctx, x, y, angDeg) { ctx.save(); ctx.translate(x, y); ctx.rotate(rad(angDeg)); }
/** Fill the rig's reusable part-info object handed to custom part hooks (never retained by hooks). */
function info(rig, name, far, pal, len, r, color, w, h) {
  const o = rig.partInfo;
  o.name = name; o.far = far; o.pal = pal; o.len = len; o.r = r; o.color = color; o.w = w; o.h = h; o.length = len;
  return o;
}

function drawLeg(ctx, rig, pose, side) {
  const J = rig.joints, p = rig.p, pal = side === 'N' ? rig.palette : rig.paletteFar, far = side === 'F';
  const hip = J['hip' + side], knee = J['knee' + side], ankle = J['ankle' + side], ang = J['leg' + side];
  const hooks = rig.parts;
  if (hooks.legUpper || hooks.legLower) {
    if (hooks.legUpper) { enter(ctx, hip.x, hip.y, -ang.upper); hooks.legUpper(ctx, rig, pose, info(rig, 'legUpper', far, pal, p.upperLeg, p.legR, pal.secondary)); ctx.restore(); }
    else limb(ctx, rig, hip, knee, p.legR, pal.secondary);
    if (hooks.legLower) { enter(ctx, knee.x, knee.y, -ang.lower); hooks.legLower(ctx, rig, pose, info(rig, 'legLower', far, pal, p.lowerLeg, p.legR - 1, pal.secondary)); ctx.restore(); }
    else limb(ctx, rig, knee, ankle, p.legR - 1, pal.secondary);
  } else {
    limbPair(ctx, rig, hip, knee, ankle, p.legR, p.legR - 1, pal.secondary, pal.secondary);
  }
  // foot / boot
  enter(ctx, ankle.x, ankle.y, -ang.foot);
  if (hooks.foot) hooks.foot(ctx, rig, pose, info(rig, 'foot', far, pal, p.footL, 0, pal.dark, p.footL, p.footH));
  else {
    pathRrect(ctx, -p.footL * 0.35, -p.footH * 0.5, p.footL, p.footH, 2.5);
    paint(ctx, rig.col(pal.dark), rig.col(rig.outline), rig.ow);
    ctx.fillStyle = rig.col('rgba(255,255,255,0.18)'); ctx.fillRect(-p.footL * 0.35 + 2, -p.footH * 0.5 + 1, p.footL - 4, 1.5);
  }
  ctx.restore();
}

function drawArm(ctx, rig, pose, side, withWeapon) {
  const J = rig.joints, p = rig.p, pal = side === 'N' ? rig.palette : rig.paletteFar, far = side === 'F';
  const sh = J['shoulder' + side], el = J['elbow' + side], wr = J['wrist' + side], hd = J['hand' + side], ang = J['arm' + side];
  const hooks = rig.parts;
  if (hooks.armUpper || hooks.armLower) {
    if (hooks.armUpper) { enter(ctx, sh.x, sh.y, -ang.upper); hooks.armUpper(ctx, rig, pose, info(rig, 'armUpper', far, pal, p.upperArm, p.armR, pal.primary)); ctx.restore(); }
    else limb(ctx, rig, sh, el, p.armR, pal.primary);
    if (hooks.armLower) { enter(ctx, el.x, el.y, -ang.lower); hooks.armLower(ctx, rig, pose, info(rig, 'armLower', far, pal, p.lowerArm, p.armR - 0.5, pal.skin)); ctx.restore(); }
    else limb(ctx, rig, el, wr, p.armR - 0.5, pal.skin);
  } else {
    limbPair(ctx, rig, sh, el, wr, p.armR, p.armR - 0.5, pal.primary, pal.skin);
  }
  // hand space: +x along the forearm direction (plus hand.rot); weapons draw along +x.
  const weaponHere = withWeapon && rig.weapon && ((rig.weapon.attach !== 'handL') === (side === 'N'));
  enter(ctx, hd.x, hd.y, -ang.hand + 90);
  if (hooks.hand) hooks.hand(ctx, rig, pose, info(rig, 'hand', far, pal, 0, p.handR, pal.dark));
  else { pathEllipse(ctx, 0, 0, p.handR, p.handR); paint(ctx, rig.col(pal.dark), rig.col(rig.outline), rig.ow); }
  if (weaponHere) {
    ctx.save(); ctx.rotate(rad(pose.weapon.rot));
    if (rig.weapon.draw) rig.weapon.draw(ctx, rig, pose); else if (hooks.weapon) hooks.weapon(ctx, rig, pose, info(rig, 'weapon', far, pal, rig.weapon.length || 30, 0, pal.metal));
    ctx.restore();
  }
  ctx.restore();
}

function drawTorso(ctx, rig, pose) {
  const J = rig.joints, p = rig.p, pal = rig.palette, hooks = rig.parts;
  enter(ctx, J.torso.x, J.torso.y, J.torsoAngle);
  if (hooks.torso) hooks.torso(ctx, rig, pose, info(rig, 'torso', false, pal, 0, 0, pal.primary, p.torsoW, p.torsoH));
  else {
    pathRrect(ctx, -p.torsoW / 2, -p.torsoH, p.torsoW, p.torsoH + 4, 6);
    paint(ctx, rig.col(pal.primary), rig.col(rig.outline), rig.ow);
    // shoulder highlight + chest seam
    ctx.fillStyle = rig.col('rgba(255,255,255,0.14)'); ctx.fillRect(-p.torsoW / 2 + 3, -p.torsoH + 2, p.torsoW - 6, 3);
    ctx.fillStyle = rig.col('rgba(0,0,0,0.22)'); ctx.fillRect(-1, -p.torsoH + 6, 2, p.torsoH - 8);
  }
  ctx.restore();
  // neck (drawn before the head)
  const nx = J.neck.x, ny = J.neck.y, hx = J.head.x, hy = J.head.y;
  pathCapsule(ctx, nx, ny, nx + (hx - nx) * 0.5, ny + (hy - ny) * 0.5, 3.2);
  paint(ctx, rig.col(pal.skin), rig.col(rig.outline), rig.ow);
}

function drawHips(ctx, rig, pose) {
  const p = rig.p, pal = rig.palette, hooks = rig.parts;
  enter(ctx, 0, rig.hipY, 0);
  if (hooks.hips) hooks.hips(ctx, rig, pose, info(rig, 'hips', false, pal, 0, 0, pal.secondary, p.hip, 11));
  else {
    pathRrect(ctx, -p.hip / 2, -5, p.hip, 11, 4);
    paint(ctx, rig.col(pal.secondary), rig.col(rig.outline), rig.ow);
    // belt + buckle
    ctx.fillStyle = rig.col(pal.dark); ctx.fillRect(-p.hip / 2 + 1, -5, p.hip - 2, 3);
    ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(1, -5.5, 4, 4);
  }
  ctx.restore();
}

function drawHead(ctx, rig, pose) {
  const J = rig.joints, p = rig.p, pal = rig.palette, hooks = rig.parts, r = p.headR;
  enter(ctx, J.head.x, J.head.y, J.headAngle);
  if (hooks.head) hooks.head(ctx, rig, pose, info(rig, 'head', false, pal, 0, r, pal.skin));
  else {
    pathEllipse(ctx, 0, 0, r, r * 1.02);
    paint(ctx, rig.col(pal.skin), rig.col(rig.outline), rig.ow);
    // hair cap over the top/back
    ctx.beginPath(); ctx.arc(0, 0, r - 0.5, rad(-60), rad(175), true); ctx.closePath();
    ctx.fillStyle = rig.col(pal.hair); ctx.fill();
    ctx.fillStyle = rig.col(pal.hair); ctx.fillRect(-r + 1, -2, 3.5, r * 0.9); // sideburn / back hair
    // nose bump on the profile + ear
    pathEllipse(ctx, r - 0.5, r * 0.15, 2.2, 1.8); paint(ctx, rig.col(pal.skin), rig.col(rig.outline), 1);
    pathEllipse(ctx, -r * 0.35, r * 0.1, 1.8, 2.4); paint(ctx, rig.col(pal.skin), rig.col(rig.outline), 1);
  }
  if (hooks.face) hooks.face(ctx, rig, pose, info(rig, 'face', false, pal, 0, r, pal.dark));
  else {
    ctx.fillStyle = rig.col(rig.outline);
    ctx.fillRect(r * 0.35, -r * 0.2, 2.5, 2.5);             // eye
    ctx.fillRect(r * 0.2, -r * 0.5, r * 0.55, 1.5);         // brow
    ctx.fillRect(r * 0.4, r * 0.4, r * 0.4, 1.5);           // mouth
  }
  if (hooks.hat) hooks.hat(ctx, rig, pose, info(rig, 'hat', false, pal, 0, r, pal.dark));
  const acc = rig.accessories;
  for (let i = 0; i < acc.length; i++) if (acc[i].attach === 'head') acc[i].draw(ctx, rig, pose);
  ctx.restore();
}

function drawAccessories(ctx, rig, pose, layer) {
  const J = rig.joints, list = rig.accessories;
  for (let i = 0; i < list.length; i++) {
    const acc = list[i];
    const at = acc.attach || 'torso';
    const isBack = at === 'back' || acc.layer === 'back';
    if (at === 'head') continue; // drawn with the head
    if (layer === 'back' ? !isBack : isBack) continue;
    if (at === 'back' || at === 'torso') enter(ctx, J.torso.x, J.torso.y, J.torsoAngle);
    else if (at === 'hip') enter(ctx, 0, rig.hipY, 0);
    else if (at === 'handR') enter(ctx, J.handN.x, J.handN.y, -J.armN.hand + 90);
    else if (at === 'handL') enter(ctx, J.handF.x, J.handF.y, -J.armF.hand + 90);
    else ctx.save(); // 'root'
    acc.draw(ctx, rig, pose);
    ctx.restore();
  }
  if (layer === 'back' && rig.parts.back) { enter(ctx, J.torso.x, J.torso.y, J.torsoAngle); rig.parts.back(ctx, rig, pose, info(rig, 'back', false, rig.palette, 0, 0, rig.palette.primary)); ctx.restore(); }
}

function drawBody(ctx, rig, pose) {
  drawAccessories(ctx, rig, pose, 'back');
  drawLeg(ctx, rig, pose, 'F');
  drawArm(ctx, rig, pose, 'F', true);
  drawTorso(ctx, rig, pose);
  drawHips(ctx, rig, pose);
  drawLeg(ctx, rig, pose, 'N');
  drawHead(ctx, rig, pose);
  drawArm(ctx, rig, pose, 'N', true);
  drawAccessories(ctx, rig, pose, 'front');
}

/**
 * Draw a rig at screen coords (feet position). The pose may be partial; it is resolved against DEFAULT_POSE.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} rig from buildRig
 * @param {object} pose partial or full pose
 * @param {{ x:number, y:number, facing?:number, tint?:string|null, tintAlpha?:number, flash?:boolean, alpha?:number, scale?:number }} o
 */
export function drawRig(ctx, rig, pose, o) {
  const P = pose && pose.__full ? pose : copyPose(pose, SCRATCH_POSE, true);
  computeJoints(rig, P);
  const facing = o.facing || 1, sc = (o.scale || 1) * rig.scale;
  const fs = facing * sc * P.squash, ss = sc * P.stretch;
  const t = rig.tf; t.x = Math.round(o.x); t.y = Math.round(o.y); t.fs = fs; t.ss = ss; t.rx = P.root.x; t.ry = P.root.y; t.c = Math.cos(rad(P.root.rot)); t.s = Math.sin(rad(P.root.rot));
  rig.facing = facing;
  const useOff = o.flash || o.tint;
  ctx.save();
  if (o.alpha != null && o.alpha < 1) ctx.globalAlpha *= o.alpha;
  if (useOff) {
    const g = getOffscreen();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, OFF_W, OFF_H);
    g.translate(OFF_OX, OFF_OY); g.scale(fs, ss); g.translate(P.root.x, P.root.y); g.rotate(rad(P.root.rot));
    rig.override = o.flash ? '#ffffff' : null;
    drawBody(g, rig, P);
    rig.override = null;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = o.flash ? 1 : (o.tintAlpha != null ? o.tintAlpha : 0.5);
    g.fillStyle = o.flash ? '#ffffff' : o.tint;
    g.fillRect(0, 0, OFF_W, OFF_H);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    ctx.drawImage(offCanvas, t.x - OFF_OX, t.y - OFF_OY);
  } else {
    ctx.translate(t.x, t.y); ctx.scale(fs, ss); ctx.translate(P.root.x, P.root.y); ctx.rotate(rad(P.root.rot));
    drawBody(ctx, rig, P);
  }
  ctx.restore();
}

/**
 * Screen position of a joint after the last drawRig call (e.g. 'handN', 'weaponTip', 'head', 'torso').
 * @returns {{x:number, y:number}} out
 */
export function jointScreen(rig, name, out = { x: 0, y: 0 }) {
  const j = rig.joints[name] || rig.joints.torso, t = rig.tf;
  const lx = j.x * t.c - j.y * t.s + t.rx, ly = j.x * t.s + j.y * t.c + t.ry;
  out.x = t.x + lx * t.fs; out.y = t.y + ly * t.ss;
  return out;
}

/** Mark a fully populated pose so drawRig can skip resolution (AnimPlayer does this for its pose). */
export function markFull(pose) { Object.defineProperty(pose, '__full', { value: true, enumerable: false }); return pose; }
