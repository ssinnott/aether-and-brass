// Pose-geometry invariants (tier: geometry). Everything here is derivable in plain node from computeJoints() and
// from the recording mock 2D context in helpers.js — no browser, no DOM. It promotes the logic prototyped in
// tools/sheet.js audit() (GRIP / FLOOR flags, ART_STYLE §5) into asserted rules.
//
// Enforces docs/ART_STYLE.md §0.2, §0.3, §0.6, §0.7, §0.8, §1, §3, §4, §5, §7, §9 and §11. Every threshold was
// DERIVED by driving EVERY keyframe of EVERY animation of all 28 subjects (chains are created lazily, so a partial
// drive under-reports); the measured range sits next to each number in T. Where the guide's literal wording fails
// stage-1 reference content the corrected form is shipped and the doc bug is recorded in DOC_BUGS — never loosened
// silently, and never tuned so the known-bad Stormcrow control passes.
//
// Cost: one analysis pass per subject (normal draw + determinism re-draw + flash draw per keyframe), cached in a
// WeakMap and shared by all eleven rules. ~2 s for the whole cast.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rad } from '../../../src/engine/math.js';
import { LIGHT_X, LIGHT_Y, RAMP } from '../../../src/art/shading.js';
import { stepChain, resetChain } from '../../../src/art/secondary.js';
import * as H from '../helpers.js';

export const TIER = 'geometry';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
/** ART_STYLE §0 names brunhild.js as the canonical reference; repo-wide (non per-rig) findings are anchored there. */
const ANCHOR_SUBJECT = 'brunhild';
/** ART_STYLE §4's hot-core colours. sael.js uses WHITE inside her cold arc on purpose; boss2 uses the pale mint. */
const CORE_COLOURS = Object.freeze(['#ffd27a', '#ffffff', '#eafffb']);

// ---------------------------------------------------------------- derived thresholds (measured range in the comment)
const T = {
  /** §0.2 outlinePath's exact signature: an outline stroke UNDER a fill is 2*ow wide. 0 exceptions in 2233 keyframes. */
  outlineLineWidth: 2,
  /** §5 GRIP. Only brunhild is two-handed; her worst is 25.3 against reach 23 (attack4 #3, the steam uppercut). */
  gripSlack: 3,
  /** §5 FLOOR. Worst sunk sole over the ground-state allowlist across all 28 subjects: 3.5 (pip attack3 #1). */
  floorSunk: 4,
  /** §7 chain budget. Measured maxima: 3 chains (rook / hulk / hoister / grubbik#2), 8 segments (hoister). */
  maxChains: 3, maxSegments: 8, maxBeardSegments: 2,
  /** §7 chain parameters, each band one notch outside the extremes of the 36 reference chains. */
  stiffness: [0.08, 0.26],  // measured 0.10 .. 0.22
  damping: [0.55, 0.80],    // measured 0.60 .. 0.74
  gain: [1.0, 3.0],         // measured 1.4 .. 2.5
  rotGain: [0.2, 0.8],      // measured 0.30 .. 0.70 (vane#2's queue sits on 0.70)
  maxAng: [18, 60],         // measured 22 .. 50
  /** §7 stability: worst impulse settle time over the 36 reference chains is 28 frames; bound at 1.5x, rounded up. */
  settleFrames: 45,
  /** §0.6 rest pose. Weapon-head clearance: reference floor 7.2 px (wrangler idle #3); stormcrow:bosun sits at 5.2. */
  restClearance: 6,
  /** §0.6 open carry: head in front of the hip. Reference floor 18.1 px (brassbound:sapper idle #3). */
  restInFront: 16,
  /** §0.7 / §3 a mark is "thin" below 2 px. The 0.01 epsilon absorbs transform float noise (a raw 2 px rect
   *  measures 1.9999999999999998 through a rotated matrix — pip's gauge needle). */
  thin: 1.99, stud: 3.99,
  /** §9 draw budget, per keyframe. Measured non-boss max: 49 cel / 25 clips / 240 commands (all pip). */
  celShapes: 52, clipsMook: 28, commandsMook: 260,
  /** Measured stage-1 boss max: 47 cel / 36 clips / 297 commands (all midboss:grubbik at scale 1.9). */
  clipsBoss: 40, commandsBoss: 320,
};

/**
 * §0.7 detail floor, per faction class: a NON-REGRESSION snapshot, not a bright line. There is no separating
 * threshold — `studs` measures WORSE on reference heroes (15) than on the Stormcrows (2-3) — so each class is held
 * to the worst stage-1 member of its own class. Regenerate only in a reviewed commit.
 *   studs  = max per-keyframe count of marks small in BOTH axes (device < 2 x < 4), head space excluded.
 *   sub2   = mean per keyframe of sub-2 px rects in a colour that is not one of the rig's tone families.
 * Measured (stage-1 only): hero studs 4/8/9/15, sub2 0.31/1.58/1.86/2.33 | human-machine (Brassbound) studs 0-2,
 * sub2 0.00-0.43 | organic-mook (Sootborn) studs 3-11, sub2 1.00-5.59 | boss (grubbik, grubbik#2, vane, vane#2)
 * studs 0-10, sub2 0.00-3.36. The sub2 bounds carry < 0.05/keyframe of rounding slack; the stud bounds carry none.
 */
const DETAIL_BASELINE = Object.freeze({
  hero: { studs: 15, sub2: 2.35 },
  'human-machine': { studs: 2, sub2: 0.45 },
  'organic-mook': { studs: 11, sub2: 5.60 },
  boss: { studs: 10, sub2: 3.40 },
});

/** Animation names whose keys stand on the floor. An ALLOWLIST: audit()'s air-state blocklist regex misses the
 *  custom names the Sootborn and Stormcrows use ('hop', 'flee', 'panic', 'stagger') and fires on run pass keys. */
const GROUND_ANIMS = /^(idle|walk|attack[1-9]|taunt|grab|grabHold|grabHit|throw|throwBack|hurt|land)$/;
/** computeJoints() rounds exactly these through S = Math.round. weaponTip and grip are deliberately unsnapped. */
const SNAPPED_JOINTS = Object.freeze(['hipN', 'hipF', 'kneeN', 'kneeF', 'ankleN', 'ankleF', 'shoulderN', 'shoulderF',
  'elbowN', 'elbowF', 'wristN', 'wristF', 'handN', 'handF', 'torso', 'neck', 'head']);

/** Guide statements that measurement contradicts. Printed as detail lines; each is a doc bug, not a failing rig. */
const DOC_BUGS = Object.freeze([
  '§0.2 "an outline stroke 2*ow wide under the fill" is only true of outlinePath: boss.js engineDome and sootborn.js drawNet draw hand-rolled outline-coloured LINES at lineWidth 1 and 3 and never fill them. The rule asserts the stroke+fill pairing instead, and reports the bare lines.',
  '§0.2 "a big shape must carry an outline" cannot be asserted on every fill: celCapsule / celTaper / celBall paint their shadow and highlight bands as bare fills. The rule scopes to a fill in a palette BASE colour that differs from the colour of the outlined shape it sits inside (a faked internal boundary) - 0 hits on all 18 stage-1 subjects, 68-76 per Stormcrow.',
  '§4 "every glow mark gets a 1-2 px hot core" fails reference: sootborn eyes, grubbik\'s lens, vane\'s core window and sael\'s arc draw no core. The core coverage is reported as a metric, only the FLAT half is asserted.',
  '§9 "~45 cel shapes" is stale: pip measures 49, grubbik 47, kestrel#1 46 and rook 45. §9\'s per-category Brunhild counts (76 fills / 43 strokes / 19 clips / 137 rects) are not reproducible either - measured 77 / 37 / 15 / 95.',
  '§0.7 "nothing under 2 px" has no separating threshold: the reference heroes carry more sub-2 px marks per keyframe than the Stormcrows do. Shipped as the per-class non-regression baseline in DETAIL_BASELINE.',
]);

// ---------------------------------------------------------------- small local helpers
const fmt = H.fmt;
const isRgba = (v) => typeof v === 'string' && v.startsWith('rgba');
const colourOf = (e) => (e.op === 'fill' || e.op === 'fillRect') ? e.fillStyle
  : (e.op === 'stroke' || e.op === 'strokeRect') ? e.strokeStyle : null;
const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);
const total = (map) => [...map.values()].reduce((a, b) => a + b, 0);
const topLines = (map, n = 6) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} x${v}`);

/**
 * Device-space disc covering the head, hat, hair and beard for a resolved pose, reproducing drawRig's own root
 * transform (translate -> scale(fs, ss) -> translate(root) -> rotate). helpers.headSpace() only sees WRAPPED part
 * hooks, so a rig that uses the default drawSkull / drawFace (sael, rook) has no head range at all and its 1 px
 * brows and pupils would be read as body detail; this geometric mask covers both cases.
 * @returns {{x:number, y:number, r:number}}
 */
function headDisc(rig, pose) {
  const J = rig.joints;
  const sq = pose.squash, st = pose.stretch === 1 && sq !== 1 ? 1 / sq : pose.stretch;
  const fs = rig.scale * sq, ss = rig.scale * st;
  const c = Math.cos(rad(pose.root.rot)), s = Math.sin(rad(pose.root.rot));
  const rx = rig.snap ? Math.round(pose.root.x) : pose.root.x, ry = rig.snap ? Math.round(pose.root.y) : pose.root.y;
  return {
    x: (J.head.x * c - J.head.y * s + rx) * fs,
    y: (J.head.x * s + J.head.y * c + ry) * ss,
    // 1.7 headR covers the skull plus a hat brim or a beard; measured to exclude every face mark and no body mark.
    r: rig.p.headR * rig.scale * 1.7,
  };
}

/**
 * Wrap every part hook, accessory and weapon draw with a transform/save-depth balance probe BEFORE the recorder's
 * own wrapper sees them, so the hook name and info.far attribution in the op log is unchanged.
 * @returns {() => void} restore
 */
function wrapBalance(rig, out) {
  const parts = rig.parts, accessories = rig.accessories, weapon = rig.weapon;
  const probe = (name, fn) => function balanced(ctx, r, pose, inf) {
    const t0 = ctx.transform, d0 = ctx.saveDepth;
    try { return fn.call(this, ctx, r, pose, inf); } finally {
      const t1 = ctx.transform, d1 = ctx.saveDepth;
      if (d0 !== d1) out.add(`${name}: ctx.save depth ${d0} on entry, ${d1} on exit`);
      for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) {
        if (Math.abs(t0[k] - t1[k]) > 1e-9) { out.add(`${name}: transform.${k} ${fmt(t0[k], 3)} on entry, ${fmt(t1[k], 3)} on exit`); break; }
      }
    }
  };
  const next = {};
  for (const k of Object.keys(parts)) next[k] = typeof parts[k] === 'function' ? probe(k, parts[k]) : parts[k];
  rig.parts = next;
  rig.accessories = accessories.map((a, i) => (typeof a.draw === 'function'
    ? { ...a, draw: probe(`accessory:${a.attach || 'torso'}#${i}`, a.draw) } : a));
  if (weapon && typeof weapon.draw === 'function') rig.weapon = { ...weapon, draw: probe('weapon', weapon.draw) };
  return () => { rig.parts = parts; rig.accessories = accessories; rig.weapon = weapon; };
}

/** Stable signature of a recorded command stream, for the determinism comparison. */
function streamSignature(ops) {
  const out = [];
  for (const e of ops) {
    if (e.op === 'enter' || e.op === 'exit') continue;
    const b = e.bbox ? `${e.bbox.x0.toFixed(4)},${e.bbox.y0.toFixed(4)},${e.bbox.x1.toFixed(4)},${e.bbox.y1.toFixed(4)}` : '';
    out.push(`${e.op}|${e.fillStyle}|${e.strokeStyle}|${e.lineWidth}|${e.alpha}|${b}`);
  }
  return out.join(';');
}

// ---------------------------------------------------------------- the single analysis pass
const CACHE = new WeakMap();

function emptyAnalysis() {
  return {
    frames: 0,
    outline: { badPaired: new Map(), unpaired: new Map(), bareFills: new Map(), bareRects: new Map() },
    leak: { palette: new Map(), identity: new Map() },
    flash: { bad: new Map(), notShorter: [] },
    hygiene: { gradients: [], nondet: [], balance: new Set(), lightBad: [] },
    audit: { snap: [], gripKeys: 0, gripOver: [], gripWorst: null, sunk: { v: -Infinity, where: '-' }, float: { v: -Infinity, where: '-' } },
    seams: new Map(),
    detail: { studs: 0, studsAt: '-', sub2: 0, sub2Hooks: new Map() },
    glow: { ramp: new Map(), marks: 0, big: 0, bigCored: 0, uncored: new Map() },
    budget: { cel: { v: 0, where: '-' }, clip: { v: 0, where: '-' }, cmd: { v: 0, where: '-' }, fills: 0, strokes: 0, rects: 0 },
  };
}

/** Pose-audit metrics for one keyframe (SNAP / GRIP / FLOOR, promoted from tools/sheet.js audit()). */
function auditFrame(A, rig, pose, animName, index, where) {
  const p = rig.p, J = H.computeJoints(rig, pose), a = A.audit;
  // Asserted unconditionally, NOT gated on rig.snap: §1 and §9 require whole-pixel joints at 1x, so turning
  // build.snap off is itself the defect this half exists to catch (a fractional joint blurs the 1 px outline).
  for (const k of SNAPPED_JOINTS) {
    const j = J[k];
    if (!Number.isInteger(j.x) || !Number.isInteger(j.y)) a.snap.push(`${where} ${k} = (${fmt(j.x, 3)}, ${fmt(j.y, 3)})`);
  }
  // GRIP: only meaningful when the rig actually carries a two-handed weapon — every other rig repurposes pose.grip
  // as an unrelated 0..1 channel (the Regent Engine's stagger, the firebrand's pilot light, the wrangler's whip).
  if (rig.weapon && rig.weapon.twoHanded && pose.grip > 0) {
    const reach = p.upperArm + p.lowerArm;
    const d = Math.hypot(J.grip.x - J.shoulderF.x, J.grip.y - J.shoulderF.y);
    a.gripKeys++;
    if (!a.gripWorst || d - reach > a.gripWorst.over) a.gripWorst = { over: d - reach, d, reach, where };
    if (d > reach + T.gripSlack) a.gripOver.push(`${where} d=${fmt(d, 1)} > reach ${reach} + ${T.gripSlack}`);
  }
  const scr = H.rootScreen(pose);
  const boot = Math.max(scr(J.ankleN.x, J.ankleN.y + p.footH * 0.5).y, scr(J.ankleF.x, J.ankleF.y + p.footH * 0.5).y);
  if (GROUND_ANIMS.test(animName)) {
    if (boot > a.sunk.v) { a.sunk.v = boot; a.sunk.where = where; }
    if (-boot > a.float.v) { a.float.v = -boot; a.float.where = where; }
  }
  return J;
}

/** Scan one recorded command stream for every op-log rule. */
function scanFrame(A, rig, ops, ctx3, where) {
  const { outline, bases, tf, glowBases, glowRamp, farAllow, headDisc: hd } = ctx3;
  const headRanges = H.headSpace(ops);
  const draw = ops.filter((e) => e.op !== 'enter' && e.op !== 'exit');
  const parentColours = new Map();     // hook -> colours already painted under an outline in this frame
  const nearCols = new Map(), farCols = new Map();
  let cel = 0, clip = 0, cmd = 0, studs = 0;

  for (let k = 0; k < draw.length; k++) {
    const e = draw[k], hook = e.hook || '';
    const raw = colourOf(e);
    const c = raw == null ? null : H.normHex(raw);

    // ---- budget counters
    if (e.op === 'fill') { A.budget.fills++; cmd++; }
    else if (e.op === 'stroke') { A.budget.strokes++; cmd++; }
    else if (e.op === 'clip') { clip++; cmd++; }
    else if (e.op === 'fillRect') { A.budget.rects++; cmd++; }

    // ---- §0.2 outline contract: outlinePath is "stroke at 2*ow, then fill the same path"
    if (e.op === 'stroke' && c === outline) {
      const next = draw[k + 1];
      if (next && next.op === 'fill') {
        if (e.lineWidth === rig.ow * T.outlineLineWidth) cel++;
        else bump(A.outline.badPaired, `${hook || '<default renderer>'} lineWidth ${e.lineWidth} (want ${rig.ow * T.outlineLineWidth}) @ ${where}`);
      } else {
        bump(A.outline.unpaired, `${hook || '<default renderer>'} lineWidth ${e.lineWidth}`);
      }
    }

    // ---- far-palette leak, half A: a palette colour painted on a far part at NEAR brightness
    if (e.far && c && !farAllow.has(c) && !isRgba(raw) && tf.near.has(c) && !tf.far.has(c)) {
      bump(A.leak.palette, `${c} in ${hook} (near-palette tone on a far part)`);
    }
    // half B: the same non-allow-listed colour on both sides of the body from one hook — a module constant that
    // never went through info.pal / farTone. This is what catches a leak the palette sets cannot see.
    if (c && hook && !farAllow.has(c) && !isRgba(raw)) {
      const m = e.far ? farCols : nearCols;
      if (!m.has(hook)) m.set(hook, new Set());
      m.get(hook).add(c);
    }

    // ---- rect-level rules (seams, detail floor)
    if (e.op === 'fillRect' && e.bbox) {
      const inHead = H.inRanges(e.i, headRanges)
        || Math.hypot((e.bbox.x0 + e.bbox.x1) / 2 - hd.x, (e.bbox.y0 + e.bbox.y1) / 2 - hd.y) <= hd.r;
      if (!inHead) {
        // §3 seams are 1 px of the sh/deep tone, never the outline colour. Measured in LOCAL space: the author
        // writes a 2 px needle, and a squashed pose must not turn it into a "seam".
        if (Math.min(Math.abs(e.rw), Math.abs(e.rh)) < 2 && c === outline) {
          bump(A.seams, `${hook || '<default renderer>'} ${Math.abs(e.rw)}x${Math.abs(e.rh)} px @ ${where}`);
        }
        // §0.7 detail floor, in DEVICE space (a 1 px rect on a scale-0.85 Sootborn is 0.85 device px).
        if (isFinite(e.W) && isFinite(e.H)) {
          const mn = Math.min(e.W, e.H), mx = Math.max(e.W, e.H);
          if (mn < T.thin && mx < T.stud) studs++;
          if (mn < T.thin && c && !tf.all.has(c)) { A.detail.sub2++; bump(A.detail.sub2Hooks, `${hook || '<default renderer>'} ${c}`); }
        }
      }
    }

    // ---- §4 glow marks are flat: only the base of a glow colour is ever painted
    if (c && glowRamp.has(c)) bump(A.glow.ramp, `${glowRamp.get(c)} tone of the glow colour in ${hook || '<default renderer>'} @ ${where}`);
    if (c && glowBases.has(c) && (e.op === 'fill' || e.op === 'fillRect') && e.bbox) {
      A.glow.marks++;
      const w = e.op === 'fillRect' ? e.W : e.bbox.w, h = e.op === 'fillRect' ? e.H : e.bbox.h;
      if (Math.min(w, h) >= 5) {                       // §0.7 calls a glow SLOT >= 6 px; 5 keeps eyes out
        A.glow.big++;
        let cored = false;
        for (let j = k + 1; j < Math.min(k + 16, draw.length); j++) {
          const n = draw[j];
          if (n.op !== 'fillRect' || !n.bbox || !CORE_COLOURS.includes(H.normHex(n.fillStyle))) continue;
          if (n.bbox.x0 >= e.bbox.x0 - 1 && n.bbox.x1 <= e.bbox.x1 + 1 && n.bbox.y0 >= e.bbox.y0 - 1 && n.bbox.y1 <= e.bbox.y1 + 1) { cored = true; break; }
        }
        if (cored) A.glow.bigCored++; else bump(A.glow.uncored, `${hook || '<default renderer>'} ${fmt(Math.min(w, h), 1)} px`);
      }
    }

    // ---- §0.2 a faked internal boundary: a big fill in a palette base colour, no outline, different from the
    // colour of the outlined shape it sits inside (a same-colour re-fill is a cut-back, not a new boundary).
    // Mutation testing found that a faked boundary drawn with ctx.fillRect walked straight past this check,
    // which only looked at path fills. Widening the ERROR to cover rects fires on the reference cast too (264
    // substantial unoutlined accent rects on Brunhild alone, mostly weapon bands), so it cannot be an error
    // without re-cutting the calibration. The rect case is therefore collected separately and reported by
    // geom/outline-rect-boundary at warn severity: visible, and honest about which content it lands on.
    if ((e.op === 'fill' || e.op === 'fillRect') && e.bbox && c) {
      const prev = draw[k - 1];
      const outlined = prev && prev.op === 'stroke' && H.normHex(prev.strokeStyle) === outline;
      if (outlined) {
        if (!parentColours.has(hook)) parentColours.set(hook, new Set());
        parentColours.get(hook).add(c);
      } else if (e.alpha >= 1 && bases.has(c) && !glowBases.has(c) && c !== '#ffffff') {
        const local = e.bbox.half / (e.scale || 1);
        const hiMin = rig.hiMin != null ? rig.hiMin : 6;
        // half-extent is half the LONGER side, which is the right measure for a path fill but not for a rect: a
        // 17x2 binding band on a weapon haft has a half-extent of 8.5 px while being a thin detail line, not a
        // region that could fake a boundary. So a rect must also be substantial on its SHORT side. (Widening the
        // check to fillRect without this fired 418 times on Brunhild alone, all of them weapon bands.)
        // half is the half-DIAGONAL, the right size measure for a path fill but not for a rect: a 16x5 binding
        // band has a half-diagonal of 8.4 px while being a thin detail line, so a rect must also be substantial
        // on its short side before it could read as a region that fakes a boundary.
        const minSide = Math.min(e.bbox.x1 - e.bbox.x0, e.bbox.y1 - e.bbox.y0) / (e.scale || 1);
        const fresh = !(parentColours.get(hook) || new Set()).has(c);
        if (e.op === 'fillRect') {
          if (local >= hiMin && minSide >= hiMin && fresh) {
            bump(A.outline.bareRects, `${hook || '<default renderer>'} ${c} ${fmt(minSide, 1)}x${fmt(local * 2, 1)} px`);
          }
        } else if (local >= hiMin && fresh) {
          bump(A.outline.bareFills, `${hook || '<default renderer>'} ${c} half-extent ${fmt(local, 1)} px >= hiMin ${hiMin}`);
        }
      }
    }
  }

  for (const [hook, set] of farCols) {
    const near = nearCols.get(hook);
    if (!near) continue;
    for (const c of set) if (near.has(c)) bump(A.leak.identity, `${c} in ${hook} (identical on the near and far side)`);
  }

  if (studs > A.detail.studs) { A.detail.studs = studs; A.detail.studsAt = where; }
  if (cel > A.budget.cel.v) { A.budget.cel.v = cel; A.budget.cel.where = where; }
  if (clip > A.budget.clip.v) { A.budget.clip.v = clip; A.budget.clip.where = where; }
  if (cmd > A.budget.cmd.v) { A.budget.cmd.v = cmd; A.budget.cmd.where = where; }
  return draw.length;
}

/**
 * Drive every keyframe of every animation of one subject through computeJoints() and the recorder, and reduce the
 * result to the aggregate every rule below reads. Cached per subject.
 * @param {object} subject a suite subject ({ rig, anims, ... })
 * @returns {object} the analysis aggregate
 */
export function analyse(subject) {
  const cached = CACHE.get(subject);
  if (cached) return cached;
  const A = emptyAnalysis();
  const rig = subject.rig;
  CACHE.set(subject, A);
  if (!rig) return A;

  const outline = H.normHex(rig.outline);
  const tf = H.toneFamilies(rig);
  const bases = new Set(), glowBases = new Set(), glowRamp = new Map();
  for (const table of [tf.byKey, tf.farByKey]) {
    for (const key of Object.keys(table)) {
      bases.add(table[key].base);
      if (key === 'glow') glowBases.add(table[key].base);
    }
  }
  for (const table of [tf.byKey, tf.farByKey]) {
    const g = table.glow;
    if (!g) continue;
    for (const band of ['hi', 'sh', 'rim', 'deep']) if (!glowBases.has(g[band])) glowRamp.set(g[band], band);
  }
  // Colours a far part may legitimately paint at full strength: the outline, a self-luminous lens or spark, and
  // the §4 hot core — distance-darkening those would read as a dead bulb.
  const farAllow = new Set([outline, '#ffffff', '#ffd27a', ...glowBases].filter(Boolean));

  const snap = H.snapshotRigState(rig);
  const restoreHooks = wrapBalance(rig, A.hygiene.balance);
  const clocks = { random: Math.random, date: Date.now, perf: typeof performance !== 'undefined' ? performance.now : null };
  try {
    for (const [name, anim] of H.animEntries(subject)) {
      const frames = H.framesOf(anim);
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i], where = `${name} #${i}`;
        const pose = H.resolvePose(frame);
        auditFrame(A, rig, pose, name, i, where);
        const hd = headDisc(rig, pose);
        const before = H.snapshotRigState(rig);
        let first = null, second = null;
        // Procedural motion must come from rig.tick, never wall-clock or randomness: ban both for the draw.
        Math.random = () => { throw new Error('Math.random() called inside a draw'); };
        Date.now = () => { throw new Error('Date.now() called inside a draw'); };
        if (clocks.perf) performance.now = () => { throw new Error('performance.now() called inside a draw'); };
        try {
          first = H.recordDraw(rig, pose, { onGradient: (kind) => A.hygiene.gradients.push(`${kind} gradient/pattern @ ${where}`) });
          H.restoreRigState(rig, before);
          second = H.recordDraw(rig, pose, { onGradient: () => {} });
        } catch (e) {
          A.hygiene.nondet.push(`${where}: ${(e && e.message) || e}`);
        } finally {
          Math.random = clocks.random; Date.now = clocks.date;
          if (clocks.perf) performance.now = clocks.perf;
        }
        if (rig.light.x !== LIGHT_X || rig.light.y !== LIGHT_Y) A.hygiene.lightBad.push(where);
        if (!first) { H.restoreRigState(rig, before); continue; }
        if (second && streamSignature(first.ops) !== streamSignature(second.ops)) {
          A.hygiene.nondet.push(`${where}: two draws of the same (pose, tick) produced different command streams`);
        }
        A.frames++;
        const normalOps = scanFrame(A, rig, first.ops, { outline, bases, tf, glowBases, glowRamp, farAllow, headDisc: hd }, where);

        // §3 hit flash: while rig.override is set only outline + flat fill may be drawn. The non-offscreen branch
        // never touches rig.override, so setting it by hand needs no DOM.
        H.restoreRigState(rig, before);
        rig.override = '#ffffff';
        let flash = null;
        try { flash = H.recordDraw(rig, pose, { onGradient: () => {} }); } finally { rig.override = null; }
        // Leave the rig as ONE draw of this keyframe would: tick advances by exactly 1 per keyframe, so procedural
        // effects keyed on rig.tick (chimney puffs, lens flicker) cycle through their phases across the drive
        // instead of freezing on whichever phase the subject started in.
        H.restoreRigState(rig, before);
        rig.tick = before.tick + 1; rig.chainFrame = rig.tick;
        if (flash) {
          let ops = 0;
          for (const e of flash.ops) {
            if (e.op === 'enter' || e.op === 'exit') continue;
            ops++;
            const raw = colourOf(e);
            if (raw == null || isRgba(raw)) continue;
            const c = H.normHex(raw);
            if (c === '#ffffff' || c === outline) continue;
            bump(A.flash.bad, `${raw} in ${e.hook || '<default renderer>'} @ ${where}`);
          }
          if (ops >= normalOps) A.flash.notShorter.push(`${where} (${ops} ops vs ${normalOps} in a normal draw)`);
        }
      }
    }
  } finally {
    restoreHooks();
    H.restoreRigState(rig, snap);
  }
  A.detail.sub2PerFrame = A.frames ? A.detail.sub2 / A.frames : 0;
  return A;
}

// ---------------------------------------------------------------- repo-wide source scans (reported on the anchor)
let SOURCE_SCAN = null;
function sourceScan() {
  if (SOURCE_SCAN) return SOURCE_SCAN;
  const hits = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      const full = `${dir}/${entry}`;
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { walk(full); continue; }
      if (!entry.endsWith('.js')) continue;
      const text = readFileSync(full, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (/\brig\.light\s*(\.\s*[xy]\s*)?=[^=]/.test(line)) hits.push(`${full.slice(ROOT.length)}:${i + 1} assigns rig.light`);
      });
    }
  };
  walk(`${ROOT}src/content`);
  SOURCE_SCAN = { lightWrites: hits };
  return SOURCE_SCAN;
}

// ---------------------------------------------------------------- rules
export const RULES = [
  {
    id: 'geom/outline-stroke-contract',
    section: 'ART_STYLE §0.2, §11',
    severity: 'error',
    describe: 'Stroke every cel shape\'s outline at 2*ow under its fill, and never fake an internal boundary.',
    check(subject) {
      const A = analyse(subject), out = [];
      if (A.outline.badPaired.size) {
        out.push({ message: `${total(A.outline.badPaired)} outline stroke(s) under a fill are not ${subject.rig.ow * T.outlineLineWidth} px wide`, detail: ['outlinePath() strokes 2*rig.ow so exactly ow px shows outside the fill; a hand-rolled width breaks the 1 px rule.', ...topLines(A.outline.badPaired)] });
      }
      if (A.outline.bareFills.size) {
        out.push({ message: `${total(A.outline.bareFills)} big fill(s) paint a new internal boundary with no outline`, detail: ['A fill in a palette base colour, at or above build.hiMin half-extent, with no outline stroke and a colour different from the outlined shape it sits inside (§0.2: never fake a boundary).', ...topLines(A.outline.bareFills)] });
      }
      if (A.outline.unpaired.size) {
        out.push({ severity: 'info', message: `${A.outline.unpaired.size} hand-drawn outline-coloured line shape(s) (not cel shapes, not asserted)`, detail: ['outline-coloured strokes with NO fill on the same path — a rope ring, a dome edge:', ...topLines(A.outline.unpaired)] });
      }
      return out;
    },
  },

  {
    id: 'geom/far-palette-leak',
    section: 'ART_STYLE §0.3, §5',
    severity: 'error',
    describe: 'Colour far-side parts from info.pal, never from the near palette or a module constant.',
    check(subject) {
      const A = analyse(subject);
      const halves = [
        [A.leak.palette, 'near-palette colour(s) painted on a far part', 'A colour in the rig\'s near tone families but not its far ones, emitted with info.far set.'],
        [A.leak.identity, 'module constant(s) painted identically on the near and far side', 'One hook emits the same hex on both sides of the body, so the far part is as bright as the near one. Route it through info.pal or farTone(hex, build.farShade, build.farDesat).'],
      ];
      return halves.filter(([m]) => m.size)
        .map(([m, what, why]) => ({ message: `${m.size} ${what}`, detail: [why, ...topLines(m)] }));
    },
  },

  {
    id: 'geom/flash-purity',
    section: 'ART_STYLE §3, §5, §11',
    severity: 'error',
    describe: 'Draw only outline and flat fill while rig.override is set.',
    check(subject) {
      const A = analyse(subject), out = [];
      if (A.flash.bad.size) {
        out.push({ message: `${total(A.flash.bad)} non-silhouette colour(s) survive the hit flash`, detail: ['With rig.override set only the flash colour, the outline and rgba() contact/steam marks may be painted; anything else is a detail pass that forgot its `if (rig.override) return`, or a raw colour that skipped rig.col().', ...topLines(A.flash.bad)] });
      }
      if (A.flash.notShorter.length) {
        out.push({ message: `${A.flash.notShorter.length} keyframe(s) draw as many commands flashing as normally`, detail: ['The flash pass must return early after the flat fill, so it is strictly cheaper than a normal draw.', ...A.flash.notShorter.slice(0, 6)] });
      }
      return out;
    },
  },

  {
    id: 'geom/draw-hygiene',
    section: 'ART_STYLE §1, §3, §5',
    severity: 'error',
    describe: 'Keep draws flat, deterministic and transform-balanced.',
    check(subject) {
      const A = analyse(subject), g = A.hygiene;
      const out = [
        [[...g.gradients], 'gradient/pattern call(s) in a rig draw', '§1: flat cel tones, no gradients.'],
        [[...g.nondet], 'keyframe(s) draw non-deterministically', 'Procedural motion comes from rig.tick, never from Math.random / Date.now / performance.now.'],
        [[...g.balance], 'hook(s) leave the context unbalanced', 'An unrestored save or translate corrupts every part drawn after it.'],
        [[...g.lightBad], 'keyframe(s) end with rig.light off the root direction', 'enter()/leave() must be paired so rig.light returns to (LIGHT_X, LIGHT_Y).'],
      ].filter(([list]) => list.length)
        .map(([list, what, why]) => ({ message: `${list.length} ${what}`, detail: [why, ...list.slice(0, 6)] }));
      if (subject.id === ANCHOR_SUBJECT) {
        // The one place the suite asserts engine constants: if the light or the ramp moves, every threshold here
        // and in rules/palette.js was calibrated against the old values.
        if (LIGHT_X !== -0.7071 || LIGHT_Y !== -0.7071) out.push({ message: 'src/art/shading.js LIGHT_X / LIGHT_Y moved off the documented top-left (-0.7071, -0.7071)', detail: `now (${LIGHT_X}, ${LIGHT_Y}) — §3, and every calibrated threshold in this suite, assumes the old value.` });
        if (RAMP.hi !== 1.22 || RAMP.sh !== 0.66 || RAMP.rim !== 1.55) out.push({ message: 'src/art/shading.js RAMP moved off the documented { hi: 1.22, sh: 0.66, rim: 1.55 }', detail: `now ${JSON.stringify(RAMP)} — content silently re-shades.` });
        const scan = sourceScan();
        if (scan.lightWrites.length) out.push({ message: `${scan.lightWrites.length} content file(s) assign rig.light directly`, detail: ['Only setLight() / enter() / leave() may move the light.', ...scan.lightWrites] });
      }
      return out;
    },
  },

  {
    id: 'geom/pose-audit',
    section: 'ART_STYLE §0.8, §5, §11',
    severity: 'error',
    describe: 'Snap joints, keep two-handed grips in reach and stand ground poses on the floor.',
    check(subject) {
      const A = analyse(subject), a = A.audit, out = [];
      if (a.snap.length) {
        out.push({ message: `${a.snap.length} joint(s) are not integer-snapped`, detail: ['computeJoints() rounds every joint while build.snap is on (the default); a fractional joint blurs the 1 px outline, so build.snap: false is itself the defect.', ...a.snap.slice(0, 6)] });
      }
      if (a.gripOver.length) {
        out.push({ message: `${a.gripOver.length} two-handed key(s) put the grip out of the far arm\'s reach (GRIP)`, detail: ['§5: stack the hands (grip: -8) and keep the near arm bent so the grip stays inside upperArm + lowerArm.', ...a.gripOver.slice(0, 6)] });
      }
      if (a.sunk.v > T.floorSunk) {
        out.push({ message: `lowest boot sole sinks ${fmt(a.sunk.v, 1)} px through the floor (FLOOR)`, detail: `${a.sunk.where}; bound ${T.floorSunk} px, derived from the worst reference sunk sole (3.5 px, pip attack3 #1). Fix with root: [x, y] — the scale pivot is the feet, so root.y moves the body 1:1.`, where: a.sunk.where });
      }
      out.push({
        severity: 'info',
        message: `floor: worst sunk ${fmt(a.sunk.v, 1)} px @ ${a.sunk.where}, worst float ${fmt(a.float.v, 1)} px @ ${a.float.where}; grip keys ${a.gripKeys}`,
        detail: a.gripWorst ? `worst grip reach ${fmt(a.gripWorst.d, 1)} against ${a.gripWorst.reach} @ ${a.gripWorst.where} (${fmt(a.gripWorst.over, 1)} over). Float is reported, never failed: a crouch or a rotated throw legitimately lifts the soles.` : 'no two-handed grip keys on this rig. Float is reported, never failed.',
      });
      return out;
    },
  },

  {
    id: 'geom/chain-contract',
    section: 'ART_STYLE §7',
    severity: 'error',
    describe: 'Keep secondary-motion chains within count, anchor, budget and stability limits.',
    check(subject) {
      const A = analyse(subject);                       // the full drive is what creates the lazy chains
      const chains = subject.rig ? subject.rig.chains : {};
      const names = Object.keys(chains), out = [];
      if (!names.length) return [];                    // no chains is a legitimate rig (footman, sapper, warden, vane)
      let segments = 0;
      const table = [];
      for (const name of names) {
        const c = chains[name];
        segments += c.n;
        if (c.joint !== 'head' && c.joint !== 'torso') {
          out.push({ message: `chain '${name}' is anchored to '${c.joint}'`, detail: 'stepChains() only reads torsoAngle and headAngle; any other name silently drives the chain from the wrong body part.', where: name });
        }
        const band = (key, range) => {
          const v = c[key];
          if (typeof v !== 'number' || v < range[0] || v > range[1]) out.push({ message: `chain '${name}' ${key} = ${v}, outside [${range[0]}, ${range[1]}]`, detail: `Reference range over the 36 chains in the cast: see T.${key}.`, where: name });
        };
        band('stiffness', T.stiffness); band('damping', T.damping); band('gain', T.gain);
        band('rotGain', T.rotGain); band('maxAng', T.maxAng);
        if (/beard/i.test(name) && c.n > T.maxBeardSegments) {
          out.push({ message: `beard chain '${name}' has ${c.n} segments`, detail: `§0.5: a beard is ONE polygon sheared by a ${T.maxBeardSegments}-segment chain at most.`, where: name });
        }
        // stability: impulse, then 120 free frames. The clamp must hold, nothing may go NaN, and it must settle.
        const ang0 = Float32Array.from(c.ang), vel0 = Float32Array.from(c.vel);
        resetChain(c);
        stepChain(c, 20, 0, 0);
        let settle = -1, nan = false, escaped = 0, peak = 0;
        for (let t = 0; t < 400; t++) {
          stepChain(c, 0, 0, 0);
          let mx = 0;
          for (let i = 0; i < c.n; i++) { if (!isFinite(c.ang[i])) nan = true; mx = Math.max(mx, Math.abs(c.ang[i])); }
          peak = Math.max(peak, mx);
          if (mx > c.maxAng + 1e-6) escaped++;
          if (settle < 0 && mx < 1) settle = t;
        }
        resetChain(c);
        if (c.ang.some((v) => v !== 0) || c.vel.some((v) => v !== 0)) out.push({ message: `resetChain() left chain '${name}' non-zero`, detail: 'resetChain must zero both ang and vel.', where: name });
        c.ang.set(ang0); c.vel.set(vel0);
        if (nan) out.push({ message: `chain '${name}' goes NaN under a 20 px impulse`, where: name });
        if (escaped) out.push({ message: `chain '${name}' breaks its own maxAng clamp on ${escaped} frame(s) (peak ${fmt(peak, 1)} deg vs ${c.maxAng})`, where: name });
        if (settle < 0 || settle > T.settleFrames) out.push({ message: `chain '${name}' does not settle below 1 deg within ${T.settleFrames} frames (${settle < 0 ? 'never' : settle + ' frames'})`, detail: 'Worst settle time over the reference cast is 28 frames; the bound is 1.5x that.', where: name });
        table.push(`${name}: n=${c.n} joint=${c.joint} stiffness=${c.stiffness} damping=${c.damping} gain=${c.gain} rotGain=${c.rotGain} maxAng=${c.maxAng} settle=${settle}f`);
      }
      if (names.length > T.maxChains) out.push({ message: `${names.length} chains (§7: never more than ${T.maxChains} per rig)`, detail: table });
      if (segments > T.maxSegments) out.push({ message: `${segments} chain segments (bound ${T.maxSegments}; §9 counts each segment as a cel shape)`, detail: table });
      out.push({ severity: 'info', message: `${names.length} chain(s), ${segments} segments`, detail: table });
      return out;
    },
  },

  {
    id: 'geom/outline-rect-boundary',
    section: 'ART_STYLE \u00a70.2',
    severity: 'warn',
    describe: 'Outline internal boundaries painted with fillRect, not just those painted as path fills.',
    check(subject) {
      const A = analyse(subject);
      if (!A || !A.outline) return [];
      if (!A.outline.bareRects.size) return [{ severity: 'info', message: 'no unoutlined rect boundaries' }];
      return [{
        message: `${total(A.outline.bareRects)} rect fill(s) paint a new internal boundary with no outline`,
        detail: [
          'Same defect as geom/outline-stroke-contract, drawn with ctx.fillRect instead of a path fill: a rect at or',
          'above hiMin on BOTH sides, in a palette base colour, unoutlined, and a different colour from the outlined',
          'shape it sits inside. Found by mutation testing, which showed the error-severity rule missed it entirely.',
          'It is a WARNING rather than an error because it also fires on the stage-1 reference cast that defines the',
          'invariants (Brunhild alone has 264, mostly weapon bands). Promoting it to error is a deliberate art',
          'decision -- add the outlines to the reference first, then raise the severity -- not a threshold tweak.',
          ...topLines(A.outline.bareRects),
        ],
      }];
    },
  },

  {
    id: 'geom/rest-pose-open',
    section: 'ART_STYLE §0.6, §8',
    severity: 'warn',
    describe: 'Hold the weapon clear of the floor and open in idle and walk.',
    check(subject) {
      const rig = subject.rig;
      if (!rig || !rig.weapon) return [{ severity: 'info', message: 'no weapon: §0.6 rest-pose carry does not apply' }];
      const headAt = rig.weapon.headAt != null ? rig.weapon.headAt : 32;
      const near = rig.weapon.attach !== 'handL';
      const p = rig.p;
      const out = [], rows = [];
      let low = null, tucked = null, shoulder = 0;
      for (const name of ['idle', 'walk']) {
        const anim = subject.anims[name];
        if (!anim) continue;
        H.framesOf(anim).forEach((frame, i) => {
          const pose = H.resolvePose(frame);
          const J = H.computeJoints(rig, pose), scr = H.rootScreen(pose), where = `${name} #${i}`;
          if (pose.weaponBack > 0.5) { shoulder++; rows.push(`${where}: weaponBack (shoulder carry)`); return; }
          const hand = near ? J.handN : J.handF, a = rad(J.weaponAngle);
          const head = scr(hand.x + Math.sin(a) * headAt, hand.y + Math.cos(a) * headAt);
          const hip = scr(near ? J.hipN.x : J.hipF.x, J.hipN.y);
          // §0.6's third sanctioned variant: the head held in front of the chest.
          const chest = scr(J.torso.x, J.torso.y - p.torsoH * 0.5);
          const inChest = Math.abs(head.x - chest.x) <= p.torsoW * 0.75 && Math.abs(head.y - chest.y) <= p.torsoH * 0.75;
          rows.push(`${where}: head (${fmt(head.x, 0)}, ${fmt(head.y, 0)}) clearance ${fmt(-head.y, 1)} px, ${fmt(head.x - hip.x, 1)} px in front of the hip${inChest ? ', inside the chest box' : ''}`);
          if (head.y > -T.restClearance && (!low || head.y > low.y)) low = { y: head.y, where };
          if (head.x - hip.x < T.restInFront && !inChest && (!tucked || head.x - hip.x < tucked.dx)) tucked = { dx: head.x - hip.x, where };
        });
      }
      if (low) {
        out.push({ message: `the weapon head rests ${fmt(-low.y, 1)} px off the floor (bound ${T.restClearance})`, detail: [`§0.6: "a head resting on the floor reads as a separate canister at squint scale". Reference floor is 7.2 px (sootborn:wrangler idle #3).`, ...rows], where: low.where });
      }
      if (tucked) {
        out.push({ message: `the weapon head sits only ${fmt(tucked.dx, 1)} px in front of the hip (bound ${T.restInFront})`, detail: [`§0.6 wants an open carry: head lifted in front of the hip, rested on the shoulder (weaponBack) or held in front of the chest. Reference floor is 18.1 px (brassbound:sapper idle #3).`, ...rows], where: tucked.where });
      }
      if (!out.length) {
        out.push({ severity: 'info', message: `rest carry ok: headAt ${headAt} px, ${shoulder} shoulder-carry key(s) over ${rows.length} idle/walk keys` });
      }
      return out;
    },
  },

  {
    id: 'geom/outline-coloured-seam',
    section: 'ART_STYLE §0.2, §3, §11',
    severity: 'warn',
    describe: 'Draw internal seams in the sh/deep tone, never in the outline colour.',
    check(subject) {
      const A = analyse(subject);
      if (!A.seams.size) return [];
      return [{
        message: `${total(A.seams)} thin rect(s) drawn in the outline colour outside head space`,
        detail: ['§3: "internal seams are 1 px of the sh/deep tone, not outline colour". Head space (drawFace\'s brows and pupils, drawMouth, the Sootborn grin, the Stormcrow brow bar) is excluded — that ink is sanctioned by §0.5 and §6.', ...topLines(A.seams)],
      }];
    },
  },

  {
    id: 'geom/detail-floor',
    section: 'ART_STYLE §0.7, §5',
    severity: 'warn',
    describe: 'Keep detail marks above the 2 px noise floor for the faction class.',
    check(subject) {
      const A = analyse(subject);
      const base = DETAIL_BASELINE[subject.class];
      const detail = [
        `studs (device < ${T.thin} px in BOTH axes and < ${T.stud} px in the other): ${A.detail.studs} max per keyframe @ ${A.detail.studsAt}`,
        `sub-2 px non-tone rects: ${fmt(A.detail.sub2PerFrame, 2)} per keyframe (${A.detail.sub2} over ${A.frames})`,
        ...topLines(A.detail.sub2Hooks, 4),
        base ? `class '${subject.class}' stage-1 baseline: studs <= ${base.studs}, sub-2 px <= ${fmt(base.sub2, 2)} per keyframe` : `no baseline for class '${subject.class}'`,
      ];
      if (!base) return [{ severity: 'info', message: 'no detail baseline for this class', detail }];
      const out = [];
      if (A.detail.studs > base.studs) out.push({ message: `${A.detail.studs} sub-2 px studs on one keyframe, over the '${subject.class}' baseline of ${base.studs}`, detail, where: A.detail.studsAt });
      if (A.detail.sub2PerFrame > base.sub2) out.push({ message: `${fmt(A.detail.sub2PerFrame, 2)} sub-2 px non-tone rects per keyframe, over the '${subject.class}' baseline of ${fmt(base.sub2, 2)}`, detail });
      if (!out.length) out.push({ severity: 'info', message: `detail floor within the '${subject.class}' baseline`, detail });
      return out;
    },
  },

  {
    id: 'geom/glow-flat-and-cored',
    section: 'ART_STYLE §4',
    severity: 'warn',
    describe: 'Paint glow marks flat, with no tone ramp.',
    check(subject) {
      const A = analyse(subject), out = [];
      if (A.glow.ramp.size) {
        out.push({
          message: `${total(A.glow.ramp)} glow mark(s) painted with a tone ramp`,
          detail: ['§4: "glow colours are flat, no ramp". A celBall / celRect / celPath on a glow colour paints its hi or sh band and the light stops reading as light.', ...topLines(A.glow.ramp)],
        });
      }
      if (A.glow.big) {
        out.push({
          severity: 'info',
          message: `glow marks ${A.glow.marks}, of which ${A.glow.big} are >= 5 px and ${A.glow.bigCored} carry a hot core`,
          detail: [`§4's 1-2 px hot core is REPORTED, never failed: the reference cast contradicts it (sootborn eyes, grubbik's lens, vane's core window and sael's arc all draw none). Core colours looked for: ${CORE_COLOURS.join(', ')}.`, ...topLines(A.glow.uncored, 4)],
        });
      }
      return out;
    },
  },

  {
    id: 'geom/draw-budget',
    section: 'ART_STYLE §9, §11',
    severity: 'warn',
    describe: 'Keep a rig inside its cel-shape, clip and command budget.',
    check(subject) {
      const A = analyse(subject), b = A.budget;
      const boss = subject.class === 'boss';
      const clips = boss ? T.clipsBoss : T.clipsMook, cmds = boss ? T.commandsBoss : T.commandsMook;
      const detail = [
        `worst keyframe: ${b.cel.v} cel shapes @ ${b.cel.where}, ${b.clip.v} clips @ ${b.clip.where}, ${b.cmd.v} commands @ ${b.cmd.where}`,
        `totals over ${A.frames} keyframes: ${b.fills} fills, ${b.strokes} strokes, ${b.rects} rects`,
        `bounds for class '${subject.class}': ${T.celShapes} cel shapes, ${clips} clips, ${cmds} commands`,
      ];
      const out = [];
      if (b.cel.v > T.celShapes) out.push({ message: `${b.cel.v} cel shapes on one keyframe (bound ${T.celShapes})`, detail, where: b.cel.where });
      if (b.clip.v > clips) out.push({ message: `${b.clip.v} clips on one keyframe (bound ${clips}); each clip costs about 3 fills in software raster`, detail, where: b.clip.where });
      if (b.cmd.v > cmds) out.push({ message: `${b.cmd.v} canvas commands on one keyframe (bound ${cmds})`, detail, where: b.cmd.where });
      if (!out.length) out.push({ severity: 'info', message: `draw budget ok (${b.cel.v} cel / ${b.clip.v} clips / ${b.cmd.v} commands worst keyframe)`, detail });
      return out;
    },
  },
];

/** Guide statements this module ships in a corrected form; each is a doc bug to file, not a failing rig. */
export { DOC_BUGS, T as THRESHOLDS, DETAIL_BASELINE };
