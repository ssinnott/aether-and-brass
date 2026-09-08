// Shared pure helpers for the art-invariant rule modules (see README.md for the harness contract).
// Everything here is DOM-free: colour maths, pose/animation walking, subject classification, the recording
// mock 2D context and the part-hook wrapper. Rule modules must not redefine any of it.
import { hexToRgb } from '../../src/art/palettes.js';
import { makeTones, RAMP } from '../../src/art/shading.js';
import { DEFAULT_POSE, FACE, EASE, makePose, faceIndex } from '../../src/art/poses.js';
import { drawRig, computeJoints } from '../../src/art/rig.js';
import * as rigParts from '../../src/art/rigParts.js';
import { rad } from '../../src/engine/math.js';

export { FACE, EASE, makePose, faceIndex, DEFAULT_POSE, makeTones, RAMP, computeJoints, rigParts };

// ---------------------------------------------------------------------------
// colour
// ---------------------------------------------------------------------------

/** Lower-case a '#rgb' / '#rrggbb' string to '#rrggbb'; returns null for anything that is not a hex colour. */
export function normHex(v) {
  if (typeof v !== 'string') return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return '#' + h;
}

/** True when v is a hex colour string. */
export function isHex(v) { return normHex(v) != null; }

/** rec-601 luminance of a hex colour, normalised to 0..1: (0.299r + 0.587g + 0.114b) / 255. */
export function lum601(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** WCAG relative luminance (linearised sRGB): 0.2126R + 0.7152G + 0.0722B, 0..1. */
export function wcagLum(hex) {
  const c = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG contrast ratio (Lmax + 0.05) / (Lmin + 0.05), 1..21. */
export function contrastRatio(a, b) {
  const la = wcagLum(a), lb = wcagLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Relative luminance difference d = |La - Lb| / max(La, Lb) on rec-601 luminance. This is the value-ladder
 * measure ART_STYLE §0.1 is about; 0 = identical value, 1 = one side is black.
 */
export function relDiff(a, b) {
  const la = lum601(a), lb = lum601(b);
  const m = Math.max(la, lb);
  return m <= 0 ? 0 : Math.abs(la - lb) / m;
}

/** HSV of a hex colour: h in 0..360, s and v in 0..1. */
export function rgbToHsv(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: mx <= 0 ? 0 : d / mx, v: mx };
}

/** Shortest hue distance between two hex colours, 0..180 degrees. */
export function hueDelta(a, b) {
  const d = Math.abs(rgbToHsv(a).h - rgbToHsv(b).h) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * True when two colours read as different hue families: the hue delta clears `minHue` AND both colours are
 * saturated enough for hue to mean anything (near-greys are always the same family).
 */
export function differentHueFamily(a, b, minHue = 40, minSat = 0.15) {
  const sa = rgbToHsv(a).s, sb = rgbToHsv(b).s;
  return sa >= minSat && sb >= minSat && hueDelta(a, b) >= minHue;
}

/** Euclidean RGB distance between two hex colours, 0..441. */
export function rgbDistance(a, b) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/** The five tone strings makeTones() produces for a colour, lower-cased: [base, hi, sh, rim, deep]. */
export function expandTones(hex, ramp = RAMP) {
  const h = normHex(hex);
  if (!h) return [];
  const t = makeTones(h, ramp);
  return [t.base, t.hi, t.sh, t.rim, t.deep].map((c) => normHex(c) || String(c).toLowerCase());
}

/**
 * Every tone family a rig can legitimately paint, lower-cased.
 * @returns {{ near: Set<string>, far: Set<string>, all: Set<string>, byKey: object, farByKey: object }}
 *   byKey/farByKey map a palette key to its { base, hi, sh, rim, deep } strings.
 */
export function toneFamilies(rig) {
  const near = new Set(), far = new Set(), byKey = {}, farByKey = {};
  const add = (src, set, table) => {
    for (const k of Object.keys(src || {})) {
      const h = normHex(src[k]);
      if (!h) continue;
      const t = makeTones(h, rig.ramp);
      const o = {};
      for (const band of ['base', 'hi', 'sh', 'rim', 'deep']) {
        const c = normHex(t[band]) || String(t[band]).toLowerCase();
        o[band] = c; set.add(c);
      }
      table[k] = o;
    }
  };
  add(rig.palette, near, byKey);
  add(rig.paletteFar, far, farByKey);
  return { near, far, all: new Set([...near, ...far]), byKey, farByKey };
}

/**
 * Adjacent part pairs implied by rig.js's default part -> palette-key assignment (ART_STYLE §0.1 value ladder).
 * `owned` marks the sleeve/primary pair, which palette/sleeve-vs-primary enforces as a hard error instead.
 */
export const ADJACENCY_PAIRS = Object.freeze([
  { id: 'armUpper/torso', a: 'sleeve', b: 'primary', owned: true },
  { id: 'armLower/armUpper', a: 'skin', b: 'sleeve' },
  { id: 'neck/torso', a: 'skin', b: 'primary' },
  { id: 'head/hair', a: 'skin', b: 'hair' },
  { id: 'hair/torso', a: 'hair', b: 'primary' },
  { id: 'torso/hips', a: 'primary', b: 'secondary' },
  { id: 'legLower/foot', a: 'secondary', b: 'dark' },
  { id: 'foot/accent', a: 'dark', b: 'accent' },
].map(Object.freeze));

/** The value-ladder pairs minus the sleeve/primary pair owned by palette/sleeve-vs-primary. */
export const LADDER_PAIRS = Object.freeze(ADJACENCY_PAIRS.filter((p) => !p.owned));

// ---------------------------------------------------------------------------
// build-schema constants (kept next to rig.js's own dispatch: drawLeg/drawArm/drawTorso/drawHead/drawAccessories)
// ---------------------------------------------------------------------------

/** The 18 part-hook names rig.js dispatches on. Anything else in build.parts renders as the default, silently. */
export const PART_HOOKS = Object.freeze([
  'head', 'face', 'beard', 'hair', 'hat', 'neck', 'torso', 'hips', 'back', 'shoulder',
  'armUpper', 'armLower', 'hand', 'legUpper', 'legLower', 'foot', 'weapon', 'smear',
]);
/** Accessory attach points drawAccessories() understands; anything else falls through to the bare root branch. */
export const ACCESSORY_ATTACH = Object.freeze(['head', 'torso', 'back', 'hip', 'handR', 'handL', 'root']);
/** Weapon attach points computeJoints()/drawArm() understand. */
export const WEAPON_ATTACH = Object.freeze(['handR', 'handL']);
/** Valid frame.ease names (ease() degrades anything else to linear, silently). */
export const EASE_NAMES = Object.freeze(Object.keys(EASE));
/** Valid pose.face indices. */
export const FACE_NAMES = Object.freeze(Object.keys(FACE));

// ---------------------------------------------------------------------------
// subject classification
// ---------------------------------------------------------------------------

/** True for a playable character subject. */
export function isHero(subject) { return subject.kind === 'character'; }

/** True for a boss or boss-phase subject. */
export function isBoss(subject) {
  return subject.kind === 'boss-phase' || ['midboss', 'boss', 'midboss2', 'boss2'].includes(subject.def && subject.def.type);
}

const FACE_PROFILE = new WeakMap();

/**
 * Measure whether a rig has a FACE, structurally: record one neutral head draw and look for a PAIR of eye marks
 * inside the `face` hook — two small non-outline fills sitting on the same row, a few px apart. That is what
 * rigParts.drawFace (whites + pupils) and the Sootborn's gobFace (glowing eyes + ink pupils) both emit, and what
 * a single sighting lens (ART_STYLE §6's "Brassbound have no face: draw the lens in parts.face") does not.
 *
 * Measured over idle key 0 of all 28 subjects: heroes 5-8 pairs, Sootborn 2, Hoister/Grubbik 2, Vane (phase 2) 2;
 * Brassbound 0, Stormcrow 0, Regent Engine 0, Grapnel Winch / Kestrel 0. The bound (>= 1 pair = has a face) sits
 * in the 0-vs-2 gap. NOTE the calibration result: the Stormcrow gas masks measure faceless exactly like the
 * Brassbound lenses, so a rule must not rely on isFaceless() alone to flag them.
 * @returns {{ custom: boolean, usesDrawFace: boolean, marks: number, eyeMarks: number, pairs: number, faceless: boolean }}
 */
export function faceProfile(subject) {
  const cached = FACE_PROFILE.get(subject);
  if (cached) return cached;
  const hook = subject.build && subject.build.parts && subject.build.parts.face;
  const custom = typeof hook === 'function' && hook !== rigParts.drawFace;
  const out = { custom, usesDrawFace: !custom, marks: 0, eyeMarks: 0, pairs: 0, faceless: false };
  if (!custom || !subject.rig) { FACE_PROFILE.set(subject, out); return out; }
  out.usesDrawFace = /\bdrawFace\s*\(/.test(String(hook));
  const anim = subject.anims.idle || Object.values(subject.anims).find((a) => a && a.frames && a.frames.length);
  const frame = anim && anim.frames && anim.frames[0];
  if (frame) {
    const snap = snapshotRigState(subject.rig);
    const { ops } = recordDraw(subject.rig, makePose(frame.pose), {});
    restoreRigState(subject.rig, snap);
    const ranges = headSpace(ops, ['face']);
    const outline = normHex(subject.rig.outline);
    const rects = ops.filter((e) => e.op === 'fillRect' && e.bbox && inRanges(e.i, ranges));
    const eyes = rects.filter((e) => e.W * e.H >= 3 && e.W * e.H <= 80 && normHex(e.fillStyle) !== outline);
    out.marks = rects.length; out.eyeMarks = eyes.length;
    for (let i = 0; i < eyes.length; i++) {
      for (let j = i + 1; j < eyes.length; j++) {
        const a = eyes[i].bbox, b = eyes[j].bbox;
        if (Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2) <= 1.5 && Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2) >= 3) out.pairs++;
      }
    }
  }
  out.faceless = out.pairs < 1;
  FACE_PROFILE.set(subject, out);
  return out;
}

/** True when the rig has no readable face (a lens or a mask instead of eyes). See faceProfile() for the measure. */
export function isFaceless(subject) { return faceProfile(subject).faceless; }

/** Faction class used to key per-class baselines: 'hero' | 'human-machine' | 'organic-mook' | 'boss'. */
const CLASS_BY_TYPE = { brassbound: 'human-machine', stormcrow: 'human-machine', sootborn: 'organic-mook' };
export function classOf(subject) {
  if (isHero(subject)) return 'hero';
  if (isBoss(subject)) return 'boss';
  return CLASS_BY_TYPE[subject.def && subject.def.type] || 'organic-mook';
}

// ---------------------------------------------------------------------------
// animation / pose walking
// ---------------------------------------------------------------------------

/** [name, anim] pairs for every animation on a subject (or def), skipping anything without a frames array. */
export function animEntries(defOrSubject) {
  const anims = (defOrSubject && defOrSubject.anims) || {};
  const out = [];
  for (const name of Object.keys(anims)) {
    const a = anims[name];
    if (a && Array.isArray(a.frames)) out.push([name, a]);
  }
  return out;
}

/** Frames of one animation (never null). */
export function framesOf(anim) { return (anim && anim.frames) || []; }

/** Walk every keyframe of every animation: fn(frame, index, animName, anim). */
export function eachFrame(defOrSubject, fn) {
  for (const [name, anim] of animEntries(defOrSubject)) {
    const frames = framesOf(anim);
    for (let i = 0; i < frames.length; i++) fn(frames[i], i, name, anim);
  }
}

/** Damaging hitboxes on a frame (frame.hitbox or frame.hitboxes), as an array. */
export function frameHitboxes(frame) {
  if (!frame) return [];
  if (Array.isArray(frame.hitboxes)) return frame.hitboxes.filter(Boolean);
  return frame.hitbox ? [frame.hitbox] : [];
}

/** True when a hitbox actually deals damage (grabs and damage-0 markers do not count as attacks). */
export function isDamaging(hb) {
  return !!hb && hb.type !== 'grab' && hb.damage !== 0;
}

/** Indices of the keys of one animation that carry a damaging hitbox. */
export function hitKeys(anim) {
  const out = [];
  framesOf(anim).forEach((f, i) => { if (frameHitboxes(f).some(isDamaging)) out.push(i); });
  return out;
}

/** [name, anim] pairs for animations containing at least one damaging hitbox. */
export function attackAnims(defOrSubject) {
  return animEntries(defOrSubject).filter(([, a]) => hitKeys(a).length > 0);
}

/**
 * Read one pose channel off a keyframe, falling back to DEFAULT_POSE.
 * @param {object} frame keyframe
 * @param {string} path 'torso.rot', 'root.y', 'armL.upper', 'squash', 'face', ...
 */
export function poseValue(frame, path) {
  const pose = (frame && frame.pose) || {};
  const [k, s] = path.split('.');
  const d = DEFAULT_POSE[k];
  if (s == null) {
    const v = pose[k];
    if (k === 'face') return v != null ? faceIndex(v) : DEFAULT_POSE.face;
    return v != null ? v : (typeof d === 'number' ? d : undefined);
  }
  const g = pose[k];
  const v = g && g[s] != null ? g[s] : undefined;
  return v != null ? v : (d && d[s] != null ? d[s] : 0);
}

/** max - min of a pose channel across a list of keyframes (DEFAULT_POSE fills the gaps). 0 for an empty list. */
export function amp(frames, path) {
  const vals = (frames || []).map((f) => poseValue(f, path)).filter((v) => typeof v === 'number' && isFinite(v));
  if (!vals.length) return 0;
  return Math.max(...vals) - Math.min(...vals);
}

/** Mean of a pose channel across a list of keyframes. */
export function mean(frames, path) {
  const vals = (frames || []).map((f) => poseValue(f, path)).filter((v) => typeof v === 'number' && isFinite(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

/** Fully resolved pose for a keyframe (a fresh object; safe to keep). */
export function resolvePose(frame) { return makePose(frame && frame.pose); }

/**
 * Root-space projection used by tools/sheet.js audit(): apply the pose's root rotation then offset.
 * @returns {(x:number, y:number) => {x:number, y:number}}
 */
export function rootScreen(pose) {
  const rr = rad(pose.root.rot), c = Math.cos(rr), s = Math.sin(rr);
  return (x, y) => ({ x: x * c - y * s + pose.root.x, y: x * s + y * c + pose.root.y });
}

// ---------------------------------------------------------------------------
// recording mock 2D context
// ---------------------------------------------------------------------------

const STYLE_KEYS = ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'lineJoin', 'lineCap', 'font',
  'textBaseline', 'textAlign', 'globalCompositeOperation', 'imageSmoothingEnabled', 'miterLimit', 'filter'];

function mat() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
function mul(m, n) {
  return {
    a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f,
  };
}
function apply(m, x, y) { return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; }

/**
 * A no-op canvas 2D context that logs every drawing command with its style, accumulated transform and
 * device-space geometry. `opts.onGradient` is called (and may throw) for gradient/pattern creation.
 * @returns {object} ctx with `ops` (the log) and `hookStack`
 */
export function makeRecorder(opts = {}) {
  const ops = [];
  const stack = [];
  const hooks = [];
  let m = mat();
  let path = [];               // device-space points of the current path
  let lpath = [];              // the SAME points before the transform: a mark's authored size and orientation
  let started = false;
  const style = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1 };
  const sx = () => Math.hypot(m.a, m.b);
  const sy = () => Math.hypot(m.c, m.d);
  const uniform = () => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
  const push = (x, y) => { const p = apply(m, x, y); path.push(p.x, p.y); lpath.push(x, y); };
  const bboxOf = (pts) => {
    if (!pts.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      if (pts[i] < x0) x0 = pts[i];
      if (pts[i] > x1) x1 = pts[i];
      if (pts[i + 1] < y0) y0 = pts[i + 1];
      if (pts[i + 1] > y1) y1 = pts[i + 1];
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, half: Math.hypot(x1 - x0, y1 - y0) / 2 };
  };
  const rec = (op, extra) => {
    const hook = hooks.length ? hooks[hooks.length - 1] : null;
    const e = {
      i: ops.length, op,
      fillStyle: typeof style.fillStyle === 'string' ? style.fillStyle : String(style.fillStyle),
      strokeStyle: typeof style.strokeStyle === 'string' ? style.strokeStyle : String(style.strokeStyle),
      lineWidth: style.lineWidth, alpha: style.globalAlpha, scale: uniform(),
      hook: hook ? hook.name : null, far: hook ? !!hook.far : false, depth: hooks.length,
      // save/restore depth at the moment of the op. `depth` is the HOOK stack; this is the graphics-state stack,
      // and it is the only way to tell whether a clip set earlier is still in effect for this op — which is what
      // separates "a fill that cuts back inside an outlined silhouette" from "a fill that fakes a new boundary".
      sd: stack.length,
      ...extra,
    };
    ops.push(e);
    return e;
  };

  const ctx = {
    ops, canvas: { width: 480, height: 480 },
    /** Current accumulated transform (read-only snapshot). */
    get transform() { return { ...m }; },
    /** Hook stack maintained by wrapHooks(). */
    hookStack: hooks,
    /** Depth of the save/restore stack. */
    get saveDepth() { return stack.length; },

    save() { stack.push({ m: { ...m }, s: { ...style } }); },
    restore() {
      const s = stack.pop();
      if (!s) { rec('restore-underflow', {}); return; }
      m = s.m; Object.assign(style, s.s);
    },
    translate(x, y) { m = mul(m, { a: 1, b: 0, c: 0, d: 1, e: x, f: y }); },
    scale(x, y) { m = mul(m, { a: x, b: 0, c: 0, d: y, e: 0, f: 0 }); },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); m = mul(m, { a: c, b: s, c: -s, d: c, e: 0, f: 0 }); },
    transformMatrix(a, b, c, d, e, f) { m = mul(m, { a, b, c, d, e, f }); },
    setTransform(a, b, c, d, e, f) { m = a && typeof a === 'object' ? { ...a } : { a, b, c, d, e, f }; },
    resetTransform() { m = mat(); },

    beginPath() { path = []; lpath = []; started = true; },
    closePath() { },
    moveTo(x, y) { push(x, y); },
    lineTo(x, y) { push(x, y); },
    quadraticCurveTo(cx, cy, x, y) { push(cx, cy); push(x, y); },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { push(c1x, c1y); push(c2x, c2y); push(x, y); },
    arcTo(x1, y1, x2, y2) { push(x1, y1); push(x2, y2); },
    // A circle's device bounding box is a square around its transformed centre, NOT the transform of two opposite
    // corners of its local box. Pushing two corners made a rotated circle measure as a sliver -- a 8 px joint ring
    // on a running leg recorded as 1.05 x 12.05 -- which every size-based rule then read as a hairline. Rects have
    // the same problem: their hull needs all four corners once the space is rotated.
    arc(cx, cy, r) { const c = apply(m, cx, cy), R = r * uniform(); path.push(c.x - R, c.y - R, c.x + R, c.y + R); lpath.push(cx - r, cy - r, cx + r, cy + r); },
    ellipse(cx, cy, rx, ry) { const c = apply(m, cx, cy), RX = rx * sx(), RY = ry * sy(), R = Math.max(RX, RY); path.push(c.x - R, c.y - R, c.x + R, c.y + R); lpath.push(cx - rx, cy - ry, cx + rx, cy + ry); },
    rect(x, y, w, h) { push(x, y); push(x + w, y); push(x + w, y + h); push(x, y + h); },
    roundRect(x, y, w, h) { push(x, y); push(x + w, y); push(x + w, y + h); push(x, y + h); },

    fill() { rec('fill', { bbox: bboxOf(path), lbox: bboxOf(lpath), started }); },
    stroke() { rec('stroke', { bbox: bboxOf(path), lbox: bboxOf(lpath), started }); },
    clip() { rec('clip', { bbox: bboxOf(path) }); },
    fillRect(x, y, w, h) {
      const p = [];
      for (const [px, py] of [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) { const q = apply(m, px, py); p.push(q.x, q.y); }
      rec('fillRect', { bbox: bboxOf(p), lbox: { x0: x, y0: y, x1: x + w, y1: y + h, w: Math.abs(w), h: Math.abs(h), half: Math.hypot(w, h) / 2 }, rw: w, rh: h, W: Math.abs(w) * sx(), H: Math.abs(h) * sy() });
    },
    strokeRect(x, y, w, h) { rec('strokeRect', { rw: w, rh: h, W: Math.abs(w) * sx(), H: Math.abs(h) * sy() }); },
    clearRect() { },
    drawImage() { rec('drawImage', {}); },
    fillText() { rec('fillText', {}); },
    strokeText() { rec('strokeText', {}); },
    measureText() { return { width: 0 }; },
    getImageData() { return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; },
    putImageData() { },
    setLineDash() { },
    getLineDash() { return []; },
    createLinearGradient(...a) { if (opts.onGradient) opts.onGradient('linear', a); rec('createLinearGradient', {}); return { addColorStop() { } }; },
    createRadialGradient(...a) { if (opts.onGradient) opts.onGradient('radial', a); rec('createRadialGradient', {}); return { addColorStop() { } }; },
    createPattern(...a) { if (opts.onGradient) opts.onGradient('pattern', a); rec('createPattern', {}); return null; },
  };
  for (const k of STYLE_KEYS) {
    if (k in style) continue;
    style[k] = k === 'imageSmoothingEnabled' ? true : '';
  }
  for (const k of STYLE_KEYS) {
    Object.defineProperty(ctx, k, { get() { return style[k]; }, set(v) { style[k] = v; }, enumerable: true, configurable: true });
  }
  return ctx;
}

/**
 * Replace every part hook, accessory draw and weapon draw on a BUILT rig with a wrapper that pushes
 * ENTER/EXIT markers (carrying the hook name and info.far) onto the recorder's hook stack and op log, so every
 * recorded op is attributable to its owning hook and near/far side. Never mutates the def's own build objects.
 * @returns {() => void} restore
 */
export function wrapHooks(rig, ctx) {
  const parts = rig.parts, accessories = rig.accessories, weapon = rig.weapon;
  const stack = ctx.hookStack, ops = ctx.ops;
  const enter = (name, far) => { stack.push({ name, far: !!far }); ops.push({ i: ops.length, op: 'enter', hook: name, far: !!far, depth: stack.length }); };
  const exit = (name) => { stack.pop(); ops.push({ i: ops.length, op: 'exit', hook: name, depth: stack.length }); };
  const wrap = (name, fn, farFrom) => function wrapped(...args) {
    const inf = farFrom === 'info' ? args[3] : null;
    enter(name, inf ? inf.far : false);
    try { return fn.apply(this, args); } finally { exit(name); }
  };
  const nextParts = {};
  for (const k of Object.keys(parts)) nextParts[k] = typeof parts[k] === 'function' ? wrap(k, parts[k], 'info') : parts[k];
  rig.parts = nextParts;
  rig.accessories = accessories.map((a, i) => (typeof a.draw === 'function' ? { ...a, draw: wrap(`accessory:${a.attach || 'torso'}#${i}`, a.draw) } : a));
  if (weapon && typeof weapon.draw === 'function') rig.weapon = { ...weapon, draw: wrap('weapon', weapon.draw) };
  return () => { rig.parts = parts; rig.accessories = accessories; rig.weapon = weapon; };
}

/** Mutable per-rig state written by AI/procedural code, snapshotted so a determinism check can restore it. */
// 'ow' and 'pxScale' are in this list because drawRig WRITES them (the outline width is divided by the draw scale,
// and the joint grid is that scale). Without them a single recorded draw leaves rig.ow at 1/sc for the rest of the
// process, and palette/outline's `rig.ow !== 1` check silently becomes dependent on which tier ran first.
const RIG_STATE_KEYS = ['tick', 'chainFrame', 'tell', 'look', 'coil', 'showBomb', 'shieldStripped', 'wings', 'fired', 'override', 'facing', 'lastPose', 'ow', 'pxScale'];

/** Snapshot the mutable rig state a draw touches. */
export function snapshotRigState(rig) {
  const o = {};
  for (const k of RIG_STATE_KEYS) if (k in rig) o[k] = rig[k];
  return o;
}
/** Restore a snapshot taken by snapshotRigState(). */
export function restoreRigState(rig, snap) { for (const k of Object.keys(snap)) rig[k] = snap[k]; }

/**
 * Record one drawRig() call into a mock context. Never pass o.flash / o.tint: that branch is the only part of
 * drawRig that touches `document`, so avoiding it keeps the recorder DOM-free.
 * @param {object} rig built rig (hooks are wrapped and restored around the draw)
 * @param {object} pose partial or resolved pose
 * @param {{ x?:number, y?:number, facing?:number, scale?:number, still?:boolean, onGradient?:Function }} [opts]
 * @returns {{ ops: object[], ctx: object }}
 */
export function recordDraw(rig, pose, opts = {}) {
  const ctx = makeRecorder({ onGradient: opts.onGradient });
  const restore = wrapHooks(rig, ctx);
  try {
    drawRig(ctx, rig, pose, { x: opts.x || 0, y: opts.y || 0, facing: opts.facing || 1, scale: opts.scale, still: opts.still });
  } finally { restore(); }
  return { ops: ctx.ops, ctx };
}

/** Log index ranges [start, end) produced by the head-space hooks (§0.5 / §6 sanction outline-coloured face ink). */
export const HEAD_HOOKS = Object.freeze(['head', 'face', 'beard', 'hair', 'hat']);
export function headSpace(ops, names = HEAD_HOOKS) {
  const want = new Set(names), ranges = [];
  const open = [];
  for (const e of ops) {
    if (e.op === 'enter') { open.push({ hook: e.hook, start: e.i }); continue; }
    if (e.op === 'exit') { const o = open.pop(); if (o && want.has(o.hook)) ranges.push({ hook: o.hook, start: o.start, end: e.i + 1 }); }
  }
  return ranges;
}
/** True when log index i falls inside one of the ranges returned by headSpace(). */
export function inRanges(i, ranges) {
  for (const r of ranges) if (i >= r.start && i < r.end) return true;
  return false;
}

/** Format a number for report `detail` lines. */
export function fmt(v, digits = 2) {
  return typeof v === 'number' && isFinite(v) ? Number(v.toFixed(digits)).toString() : String(v);
}
