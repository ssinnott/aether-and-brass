// Animation invariants (tier: data). Everything here is arithmetic over `def.anims` — keyframe schema, the standard
// animation table's shape and durations, pose amplitudes, squash/stretch beats, attack beat structure, hitbox
// placement and the face-expression contract. No joints, no drawing (the one exception is the face-responsiveness
// probe in anim/attack-face-aggressive, which records a single head draw through helpers.recordDraw and is DOM-free).
//
// Enforces docs/ART_STYLE.md sections 1, 6, 8 and 11. Boss phases are ordinary subjects: each carries its own
// animation table.
//
// CALIBRATION. Every threshold below was DERIVED by measuring the 18 stage-1 reference subjects (the four heroes, the
// five Brassbound, the five Sootborn, the Hoister + Grubbik and the Regent Engine + Vane) against the 10 known-bad
// control subjects (stormcrow:*, midboss2:*, boss2:*); the measured range sits in the comment next to each number.
// Where the guide states a rule literally but measurement shows the literal form condemns reference art, the corrected
// form ships and the mismatch is recorded in DOC_BUGS — never loosened silently, never tuned so the control passes.
import { EASE, FACE } from '../../../src/art/poses.js';

export const TIER = 'data';

// ------------------------------------------------------------------ derived thresholds (measured range in comment)
const T = {
  /** section 8 keyframe duration. Measured 2 .. 70 over all 28 subjects; the assertion is integer >= 1, not a band. */
  durMin: 1,
  /** section 8 smear alpha. Measured 0.30 .. 0.60 over the 74 reference smear keys; bound set outside both ends. */
  smearAlpha: [0.2, 0.8],
  /** section 8 smear sweep |to - from|, degrees. Measured 22 (vane#2 caneFlurry) .. 240 (brunhild jumpAttack). */
  smearSweep: [20, 300],
  /** section 8 idle loop length. The guide's own band (50-56f); measured sootborn/bosses 52, heroes/brassbound 54. */
  idleSum: [50, 56],
  /** section 8 walk / run loop length below the heavy-machine gate. Measured 32 / 24 on every rig under the gate. */
  walkSum: 32, runSum: 24,
  /** Heavy-machine gate. Derived from the observed gap: warden 1.45 walks 32f, the hoister 1.90 walks 40f. */
  bigScale: 1.8,
  /** Loop length allowed above the gate. Measured hoister walk 40 / run 24, regent engine walk 40 / run 40. */
  walkSumBig: [32, 40], runSumBig: [24, 40],
  /** section 8 idle breathing amplitudes. Measured torso 3-4, root.y exactly 1, head 3-8 on all 28 subjects. */
  idleTorsoAmp: 2, idleRootAmp: 1, idleHeadAmp: 1,
  /** section 8 walk bob. Measured root.y amplitude 1 (rook, the floor) .. 3. */
  walkRootAmp: 1,
  /** section 8 walk down-key squash. Measured {1, 1.03} or {1, 1.04}, on exactly 2 of the 8 keys, everywhere. */
  walkSquash: [1.02, 1.06], walkSquashKeys: 2,
  /** Mirror residual between the two halves of the walk. Measured 0.0 on all 28; 3 deg leaves room for hand tuning. */
  mirrorTol: 3,
  /** section 8 free-arm swing. Measured amplitude 48 .. 52 and mean -11.5 .. -20.5 once the held-arm gate applies. */
  armSwingAmp: 30, armSwingMean: 0,
  /** section 8 run lean, degrees, on every key. Measured 20 (heroes, brassbound) .. 33 (grubbik#2) below the gate. */
  runLean: 15,
  /** section 8 run stride half-amplitude. Measured 39 (brunhild, pip, vane#2) .. 50 below the gate; 24 .. 46 above. */
  runStride: 30, runStrideBig: 20,
  /** section 8 squash beats. Every centre value measured identical on all 28 subjects; the band allows hand tuning. */
  jumpSquash: [1.08, 1.14], jumpStretch: [0.86, 0.94],
  landSquash: [1.12, 1.20], landDur: 3, getupSquash: [1.04, 1.10], dodgeSquash: 1.04,
  /** section 8 attack easing coverage, per def over attack anims. Measured reference 0.957 .. 1.000, control 0.000. */
  easeCoverage: 0.85,
  /** section 8 hit-hold delta, degrees, max per joint between the hit key and the next. Measured 6 .. 18 (rook a4). */
  holdDelta: 25,
  /** section 8 non-contiguous hitbox runs are legal above this key count. Measured: single-hit combos are <= 6 keys. */
  multiHitKeys: 6,
  /** section 8 "every key sets legR/legL". Measured reference 0 .. 1 unset keys per def, control 2 .. 10. */
  looseLegKeys: 1,
};

/** Guide statements measurement contradicts. Reported as notes; each is a doc bug, not a failing rig. */
const DOC_BUGS = [
  'section 8 walk "head -1..+2": the head-bob is NOT universal - brassbound (all five), the hoister and the regent engine hold the head rigid (amplitude 0). Reported as a note, never a failure.',
  'section 8 run "face: angry": measured neutral on brassbound / hoister / regent engine and grit on every stormcrow, so the run-face clause has no separating power and is dropped.',
  'section 8 dodge "closed" on the tuck keys: fails the Sootborn (key 3 is grit) and Grubbik phase 2 (all tuck keys grit). Shipped as the effort set {closed, grit}.',
  'section 8 "lying is dazed": fails 19 of 28 defs - only the heroes reach dazed in lying; every enemy faction stays on hurt and reaches dazed in dead. Shipped as {hurt, dazed}.',
  'section 8 attack follow-through "ease: inout": fails sael attack4 (in) and vane#2 clockworkFist (out). Shipped as the smoothing set {inout, out, in}.',
  'section 8 jump/dead/dodge/throwBack/grab key counts are not universal: jump 2 or 3, dead 1 or 2, dodge 4 or 5, throwBack 4 or 5, grab 2 or 3. Shipped as bands.',
  'section 8 jump key 1 "0.94 / 1.08": brassbound and the stage-1 bosses use 0.96 / 1.04, so only the DIRECTION (squash < 1 < stretch) is asserted.',
];

/** Looping states, one-shot states, and the key counts / extras measured identical (or banded) across all 28 subjects. */
const BASE_SET = {
  idle: { keys: 4, loop: true },
  walk: { keys: 8, loop: true },
  run: { keys: 8, loop: true },
  jump: { keys: [2, 3], loop: false },          // 3 heroes/sootborn/stormcrow/stage-2, 2 brassbound/stage-1 bosses
  fall: { keys: 2, loop: true },
  land: { keys: 2, loop: false },
  hurt: { keys: 3, loop: false, durs: [4, 10, 6] },
  hurtAir: { keys: 2, loop: true, rootRot: [-40, -10] },   // measured exactly [-15, -25] on all 28
  knockdown: { keys: 2, loop: true, rootRot: [-40, -10] }, // measured exactly [-25, -35] on all 28
  lying: { keys: 2, loop: true, sum: 32 },
  getup: { keys: 3, loop: false },
  dead: { keys: [1, 2], loop: false },          // 1 heroes/brassbound/stage-1 bosses, 2 sootborn/stormcrow/stage-2
  dodge: { keys: [4, 5], loop: false, optional: true },     // 5 everywhere except grubbik#2, which uses 4
  grab: { keys: [2, 3], loop: false, optional: true },      // 2 heroes, 3 sootborn:hulk
  grabHold: { keys: 2, loop: true, optional: true },
  grabHit: { keys: 3, loop: false, optional: true },
  throw: { keys: 4, loop: false, optional: true },
  throwBack: { keys: [4, 5], loop: false, optional: true }, // 4 brunhild/rook, 5 sael/pip
};

/** Joints compared by the hit-hold clause; the arm/leg pairs plus the two body rotations. */
const HOLD_JOINTS = ['armR.upper', 'armR.lower', 'armL.upper', 'armL.lower',
  'legR.upper', 'legR.lower', 'legL.upper', 'legL.lower', 'torso.rot', 'head.rot'];
/** Mirror pairs the walk's second half must swap. */
const MIRROR_PAIRS = [['legR.upper', 'legL.upper'], ['legR.lower', 'legL.lower'], ['footR.rot', 'footL.rot']];
/** Easings that smooth a beat (as opposed to linear / snap, which do not). */
const SMOOTHING = ['inout', 'out', 'in'];
/** The aggressive expressions section 6 reserves for effort. */
const EFFORT_FACES = [FACE.shout, FACE.grit];
/** The faces section 8 allows on the tuck keys of a dodge (the guide says closed; the Sootborn also use grit). */
const DODGE_FACES = [FACE.closed, FACE.grit];
const FACE_NAME = Object.fromEntries(Object.entries(FACE).map(([k, v]) => [v, k]));

// ------------------------------------------------------------------ local helpers (nothing here is in helpers.js)

/** Name a face index for a report line. */
function faceName(v) { return FACE_NAME[v] != null ? `${FACE_NAME[v]}(${v})` : String(v); }

/**
 * The face a keyframe actually resolves to. game/animation.js applies the frame-level `face` override on top of
 * `pose.face`, so a rule that reads only the pose sees the wrong expression on every key that uses the shorthand.
 * @param {object} frame
 * @param {object} h helpers module
 * @returns {number} 0..7
 */
function frameFace(frame, h) {
  if (frame && frame.face != null) return h.faceIndex(frame.face);
  return h.poseValue(frame, 'face');
}

/** Sum of a frame list's durations. */
function durSum(frames) { return frames.reduce((a, f) => a + (f.dur || 0), 0); }

/** Format an array of numbers for a detail line. */
function list(v) { return '[' + v.join(', ') + ']'; }

/** True when n satisfies a spec that is either an exact number or an inclusive [lo, hi] band. */
function within(n, spec) { return Array.isArray(spec) ? n >= spec[0] && n <= spec[1] : n === spec; }
/** Render such a spec for a message. */
function specText(spec) { return Array.isArray(spec) ? `${spec[0]}-${spec[1]}` : String(spec); }

/**
 * True when an attack is a SUSTAINED beam rather than a swing: three or more consecutive damaging keys sharing one
 * hitbox id. Measured over all 28 subjects only sootborn:firebrand's flame and pip's super classify this way, and no
 * control attack does — so scoping the swing-only beat clauses by this predicate exempts the flamethrower structurally
 * (ART_STYLE section 8 permits projectile/beam movesets) instead of by a hand-written faction exemption.
 */
function isSustained(anim, h) {
  const keys = h.hitKeys(anim);
  if (keys.length < 3) return false;
  let best = 1, run = 1;
  for (let i = 1; i < keys.length; i++) {
    const prev = h.frameHitboxes(anim.frames[keys[i - 1]]).find(h.isDamaging);
    const cur = h.frameHitboxes(anim.frames[keys[i]]).find(h.isDamaging);
    run = keys[i] === keys[i - 1] + 1 && prev && cur && prev.id && prev.id === cur.id ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best >= 3;
}

const EXPRESSIVE = new WeakMap();
/**
 * True when the rig's face actually RENDERS an aggressive expression: record one idle head draw at face neutral and at
 * each of angry / shout / grit and compare the command streams. Measured over all 28 subjects - heroes, Sootborn, the
 * Hoister, Grubbik and Vane respond to all seven faces; the Brassbound lenses and the Stormcrow gas masks respond to
 * `dazed` only, and the Regent Engine to `hurt` only. This is the honest scope for the effort-face contract: on a
 * masked rig `pose.face` has no visual consequence at all, so asserting it would be asserting nothing a viewer sees.
 * (helpers.isFaceless() does NOT separate these cases - it measures the Stormcrow masks faceless exactly like the
 * Brassbound lenses - which is why this probe exists.)
 * @returns {{ expressive: boolean, responds: string[] }}
 */
function faceResponse(subject, h) {
  const cached = EXPRESSIVE.get(subject);
  if (cached) return cached;
  const out = { expressive: false, responds: [] };
  const idle = subject.anims && subject.anims.idle;
  const frame = idle && idle.frames && idle.frames[0];
  if (!subject.rig || !frame) { EXPRESSIVE.set(subject, out); return out; }
  const sign = (face) => {
    const snap = h.snapshotRigState(subject.rig);
    const pose = h.makePose(frame.pose);
    pose.face = face;
    let s = '';
    try {
      const { ops } = h.recordDraw(subject.rig, pose, {});
      s = ops.map((e) => `${e.op}|${e.fillStyle}|${e.strokeStyle}|${e.bbox ? e.bbox.x0.toFixed(3) + ',' + e.bbox.y0.toFixed(3) + ',' + e.bbox.x1.toFixed(3) + ',' + e.bbox.y1.toFixed(3) : ''}`).join(';');
    } catch { s = ''; }
    h.restoreRigState(subject.rig, snap);
    return s;
  };
  const base = sign(FACE.neutral);
  if (base) {
    for (const name of ['angry', 'shout', 'grit']) if (sign(FACE[name]) !== base) out.responds.push(name);
    out.expressive = out.responds.length > 0;
  }
  EXPRESSIVE.set(subject, out);
  return out;
}

// ------------------------------------------------------------------ rules

export const RULES = [
  {
    id: 'anim/frame-schema',
    section: 'ART_STYLE §8',
    severity: 'error',
    describe: 'Give every keyframe a valid duration, ease, smear and face.',
    check(subject, h) {
      const out = [];
      for (const [name, anim] of h.animEntries(subject)) {
        h.framesOf(anim).forEach((f, i) => {
          const where = `${name} #${i}`;
          if (!Number.isInteger(f.dur) || f.dur < T.durMin) {
            out.push({ message: `keyframe duration must be a whole number of frames >= ${T.durMin}`, detail: `dur = ${JSON.stringify(f.dur)} (measured 2..70 over the reference cast)`, where });
          }
          if (!f.pose || typeof f.pose !== 'object') {
            out.push({ message: 'keyframe has no pose object', detail: `pose = ${JSON.stringify(f.pose)}`, where });
          }
          if (f.ease != null && !Object.prototype.hasOwnProperty.call(EASE, f.ease)) {
            out.push({ message: `unknown ease '${f.ease}' - ease() degrades it to linear with no error, so the key silently loses its curve`, detail: `valid: ${Object.keys(EASE).join(', ')}`, where });
          }
          const face = f.face != null ? f.face : (f.pose && f.pose.face);
          if (face != null && !(Number.isInteger(h.faceIndex(face)) && h.faceIndex(face) >= 0 && h.faceIndex(face) <= 7)) {
            out.push({ message: `face ${JSON.stringify(face)} does not resolve to a FACE index`, detail: `valid: ${Object.keys(FACE).join(', ')}`, where });
          }
          if (f.face != null && f.pose && f.pose.face != null && h.faceIndex(f.face) !== h.faceIndex(f.pose.face)) {
            out.push({ message: 'frame.face and pose.face disagree - the frame-level override wins and the pose value is dead code', detail: `frame.face = ${faceName(h.faceIndex(f.face))}, pose.face = ${faceName(h.faceIndex(f.pose.face))}`, where });
          }
          const sm = f.smear;
          if (!sm) return;
          const from = sm.from == null ? 0 : sm.from, to = sm.to == null ? 0 : sm.to;
          const a = sm.a == null ? 0.45 : sm.a, r = sm.r == null ? 0 : sm.r;
          if (!isFinite(from) || !isFinite(to)) {
            out.push({ message: 'smear from/to must be finite root-space degrees', detail: `from = ${JSON.stringify(sm.from)}, to = ${JSON.stringify(sm.to)}`, where });
          }
          if (!(a >= T.smearAlpha[0] && a <= T.smearAlpha[1])) {
            out.push({ message: `smear alpha ${h.fmt(a)} is outside ${T.smearAlpha[0]}-${T.smearAlpha[1]} - drawSmear skips at a <= 0.01, so a mistyped alpha is an invisible smear no contact sheet will reveal`, detail: 'measured 0.30 .. 0.60 over the 74 reference smear keys', where });
          }
          if (!(r >= 0) || !isFinite(r)) {
            out.push({ message: `smear radius must be >= 0 (0 = auto)`, detail: `r = ${JSON.stringify(sm.r)} (measured 0 .. 78)`, where });
          }
          const sweep = Math.abs(to - from);
          if (isFinite(sweep) && !(sweep >= T.smearSweep[0] && sweep <= T.smearSweep[1])) {
            out.push({ message: `smear sweep ${h.fmt(sweep)} deg is outside ${T.smearSweep[0]}-${T.smearSweep[1]} - a value near 3 means radians, a value near 0 or above 300 means an absolute screen angle`, detail: `from ${h.fmt(from)} -> to ${h.fmt(to)}; measured 22 .. 240 over the reference cast (drawSmear itself clamps at 351)`, where });
          }
        });
      }
      return out;
    },
  },

  {
    id: 'anim/base-set-shape',
    section: 'ART_STYLE §8, §11',
    severity: 'error',
    describe: 'Author the standard animation table with its documented key counts.',
    check(subject, h) {
      const out = [];
      for (const name of Object.keys(BASE_SET)) {
        const spec = BASE_SET[name];
        const anim = subject.anims[name];
        if (!anim || !Array.isArray(anim.frames)) {
          if (!spec.optional) out.push({ message: `the standard animation table has no '${name}'`, detail: 'makeBaseAnims() supplies one; a def that drops it has no animation for that state at all', where: name });
          continue;
        }
        const frames = anim.frames;
        if (!within(frames.length, spec.keys)) {
          out.push({ message: `${name} has ${frames.length} keys, expected ${specText(spec.keys)}`, detail: 'makeBaseAnims() ships a 2-key idle, 4-key walk and 2-key run, so this is what catches a def that forgot to override the base set', where: name });
        }
        if (spec.loop === true && anim.loop !== true) out.push({ message: `${name} must loop`, detail: `loop = ${JSON.stringify(anim.loop)}`, where: name });
        if (spec.loop === false && anim.loop === true) out.push({ message: `${name} must not loop`, detail: 'loop = true', where: name });
        if (spec.durs && (frames.length !== spec.durs.length || spec.durs.some((d, i) => frames[i].dur !== d))) {
          out.push({ message: `${name} durations must be ${list(spec.durs)}`, detail: `measured ${list(frames.map((f) => f.dur))}; ${list(spec.durs)} is identical on all 28 reference and control defs`, where: name });
        }
        if (spec.sum != null && durSum(frames) !== spec.sum) {
          out.push({ message: `${name} must run ${spec.sum} frames`, detail: `measured ${durSum(frames)}f; ${spec.sum}f is identical on all 28 defs`, where: name });
        }
        if (spec.rootRot) {
          frames.forEach((f, i) => {
            const rot = h.poseValue(f, 'root.rot');
            if (!(rot >= spec.rootRot[0] && rot <= spec.rootRot[1])) {
              out.push({ message: `${name} key ${i} root.rot ${h.fmt(rot)} is outside ${specText(spec.rootRot)} - the body must read as tumbling`, detail: 'measured hurtAir [-15, -25] and knockdown [-25, -35] on all 28 defs; the band is wide enough for a hand-authored tumble', where: `${name} #${i}` });
            }
          });
        }
      }
      return out;
    },
  },

  {
    id: 'anim/cycle-durations',
    section: 'ART_STYLE §8',
    severity: 'warn',
    describe: 'Run the locomotion loops at the documented frame lengths.',
    check(subject, h) {
      const out = [];
      const scale = (subject.rig && subject.rig.scale) || 1;
      const big = scale >= T.bigScale;
      const sums = {};
      for (const name of ['idle', 'walk', 'run']) {
        const anim = subject.anims[name];
        sums[name] = anim && anim.frames ? durSum(anim.frames) : null;
      }
      if (sums.idle != null && !(sums.idle >= T.idleSum[0] && sums.idle <= T.idleSum[1])) {
        out.push({ message: `idle loop is ${sums.idle}f, outside the guide's ${T.idleSum[0]}-${T.idleSum[1]}f`, detail: `measured sootborn and the stage-1 bosses 52f, heroes and brassbound 54f; the guide's own band is used verbatim so a 51f or 55f loop is not punished`, where: 'idle' });
      }
      const check = (name, exact, band) => {
        if (sums[name] == null) return;
        const ok = big ? sums[name] >= band[0] && sums[name] <= band[1] : sums[name] === exact;
        if (ok) return;
        out.push({
          message: `${name} loop is ${sums[name]}f, expected ${big ? `${band[0]}-${band[1]}f (rig.scale ${h.fmt(scale)} >= ${T.bigScale})` : `${exact}f`}`,
          detail: `measured ${exact}f on every rig under the scale gate; above it the hoister walks 40f and the regent engine walks 40f / runs 40f. The ${T.bigScale} gate comes from the observed gap: the iron warden at 1.45 uses ${exact}f, the hoister at 1.90 does not.`,
          where: name,
        });
      };
      check('walk', T.walkSum, T.walkSumBig);
      check('run', T.runSum, T.runSumBig);
      return out;
    },
  },

  {
    id: 'anim/idle-breathes',
    section: 'ART_STYLE §1, §8, §11',
    severity: 'error',
    describe: 'Make idle a real breathing loop, not a held pose.',
    check(subject, h) {
      const anim = subject.anims.idle;
      if (!anim || !anim.frames || !anim.frames.length) return [];
      const frames = anim.frames;
      const torso = h.amp(frames, 'torso.rot'), root = h.amp(frames, 'root.y'), head = h.amp(frames, 'head.rot');
      const detail = `torso.rot amplitude ${h.fmt(torso)} (bound >= ${T.idleTorsoAmp}), root.y amplitude ${h.fmt(root)} (bound >= ${T.idleRootAmp}), head.rot amplitude ${h.fmt(head)} (bound >= ${T.idleHeadAmp}).`
        + ' Measured over all 28 subjects: torso 3 or 4 on every def, root.y exactly 1 on every def, head 3-8. Amplitudes, never absolute values - the Sootborn idle torso sits at 13..17 because section 2 makes them hunched.';
      const out = [];
      if (!(torso >= T.idleTorsoAmp || root >= T.idleRootAmp)) out.push({ message: 'idle neither leans nor bobs - it is a held pose, not a breath', detail, where: 'idle' });
      if (!(head >= T.idleHeadAmp)) out.push({ message: 'idle head never moves', detail, where: 'idle' });
      return out;
    },
  },

  {
    id: 'anim/locomotion-shape',
    section: 'ART_STYLE §8, §11',
    severity: 'warn',
    describe: 'Give walk its down/up bob and mirrored halves, and run its lean and stride.',
    check(subject, h) {
      const out = [];
      const scale = (subject.rig && subject.rig.scale) || 1;
      const walk = subject.anims.walk, run = subject.anims.run;
      if (walk && walk.frames && walk.frames.length) {
        const frames = walk.frames;
        const root = h.amp(frames, 'root.y');
        if (root < T.walkRootAmp) {
          out.push({ message: `walk has no down/up bob (root.y amplitude ${h.fmt(root)} < ${T.walkRootAmp})`, detail: 'measured 1 (rook, the reference floor) .. 3 - the bound cannot be raised without failing a reference hero', where: 'walk' });
        }
        const squash = frames.map((f) => h.poseValue(f, 'squash'));
        const down = squash.filter((v) => v >= T.walkSquash[0] && v <= T.walkSquash[1]).length;
        if (down !== T.walkSquashKeys) {
          out.push({ message: `walk squashes on ${down} keys, expected exactly ${T.walkSquashKeys} (the two down keys)`, detail: `squash per key ${list(squash.map((v) => h.fmt(v)))}; measured {1, 1.03} on heroes/brassbound and {1, 1.04} on pip/sootborn/stage-1 bosses, always on exactly 2 of the 8 keys`, where: 'walk' });
        }
        if (frames.length === 8) {
          let worst = 0, at = '';
          for (let i = 0; i < 4; i++) {
            for (const [a, b] of MIRROR_PAIRS) {
              for (const [x, y] of [[a, b], [b, a]]) {
                const d = Math.abs(h.poseValue(frames[i], x) - h.poseValue(frames[i + 4], y));
                if (d > worst) { worst = d; at = `key ${i}.${x} vs key ${i + 4}.${y}`; }
              }
            }
          }
          if (worst > T.mirrorTol) {
            out.push({ message: `the second half of walk does not mirror the first (worst residual ${h.fmt(worst)} deg > ${T.mirrorTol})`, detail: `${at}; measured 0.0 on all 28 subjects - the ${T.mirrorTol} deg allowance exists only for a hand-authored limp`, where: 'walk' });
          }
        }
        const headAmp = h.amp(frames, 'head.rot');
        if (headAmp === 0) {
          out.push({ severity: 'info', message: 'walk holds the head rigid (head.rot amplitude 0)', detail: DOC_BUGS[0], where: 'walk' });
        }
        const heldOffHand = (subject.build.accessories || []).some((a) => a && a.attach === 'handL');
        if (!heldOffHand && scale < T.bigScale) {
          const amp = h.amp(frames, 'armL.upper'), avg = h.mean(frames, 'armL.upper');
          if (amp < T.armSwingAmp || avg >= T.armSwingMean) {
            out.push({
              message: `the free arm does not swing back in walk (armL.upper amplitude ${h.fmt(amp)}, mean ${h.fmt(avg)})`,
              detail: `bounds: amplitude >= ${T.armSwingAmp}, mean < ${T.armSwingMean}. Measured 48 .. 52 amplitude and -11.5 .. -20.5 mean across every rig this clause applies to.`
                + ' Skipped for a rig with a handL accessory (warden shield, sapper bomb, marine wing-shield, wrangler whip, grubbik#2 net) and above the '
                + `${T.bigScale} scale gate (the regent engine plants both arms forward at 50 deg and legitimately measures amplitude 18 / mean +42.5).`,
              where: 'walk',
            });
          }
        }
      }
      if (run && run.frames && run.frames.length) {
        const frames = run.frames;
        const leans = frames.map((f) => h.poseValue(f, 'torso.rot'));
        const minLean = Math.min(...leans);
        if (scale < T.bigScale && minLean < T.runLean) {
          out.push({ message: `run does not lean into the stride (torso.rot floor ${h.fmt(minLean)} < ${T.runLean})`, detail: `per-key lean ${list(leans.map((v) => h.fmt(v)))}; measured 20 (heroes, brassbound) .. 33 (grubbik#2) below the scale gate. The regent engine leans 4 and is exempt by the ${T.bigScale} gate.`, where: 'run' });
        }
        const half = h.amp(frames, 'legR.upper') / 2;
        const bound = scale >= T.bigScale ? T.runStrideBig : T.runStride;
        if (half < bound) {
          out.push({ message: `run has no stride (legR.upper half-amplitude ${h.fmt(half)} < ${bound})`, detail: 'measured 39 (brunhild, pip, vane#2) .. 50 below the scale gate, and 24 (regent engine) .. 46 above it', where: 'run' });
        }
      }
      return out;
    },
  },

  {
    id: 'anim/squash-stretch-beats',
    section: 'ART_STYLE §8, §11',
    severity: 'error',
    describe: 'Sell jump, land and getup with the documented squash/stretch beats.',
    check(subject, h) {
      const out = [];
      const band = (v, b) => v >= b[0] && v <= b[1];
      const jump = subject.anims.jump, land = subject.anims.land, getup = subject.anims.getup, dodge = subject.anims.dodge;
      if (jump && jump.frames && jump.frames.length >= 2) {
        const f0 = jump.frames[0], f1 = jump.frames[1];
        const sq0 = h.poseValue(f0, 'squash'), st0 = h.poseValue(f0, 'stretch');
        if (!band(sq0, T.jumpSquash) || !band(st0, T.jumpStretch)) {
          out.push({ message: `jump key 0 must crouch (squash ${specText(T.jumpSquash)} / stretch ${specText(T.jumpStretch)})`, detail: `measured ${h.fmt(sq0)} / ${h.fmt(st0)}; 1.1 / 0.9 is identical on all 28 defs`, where: 'jump #0' });
        }
        const sq1 = h.poseValue(f1, 'squash'), st1 = h.poseValue(f1, 'stretch');
        if (!(sq1 < 0.99 && st1 > 1.01)) {
          out.push({ message: 'jump key 1 must stretch out of the crouch (squash < 1 < stretch)', detail: `measured ${h.fmt(sq1)} / ${h.fmt(st1)}. ${DOC_BUGS[6]}`, where: 'jump #1' });
        }
      }
      for (const [name, anim] of [['jump', jump], ['land', land]]) {
        if (!anim || !anim.frames) continue;
        if (!anim.frames.some((f) => h.poseValue(f, 'squash') !== 1 || h.poseValue(f, 'stretch') !== 1)) out.push({ message: `${name} carries no squash or stretch on any key`, detail: 'every reference def sells both beats', where: name });
      }
      if (land && land.frames && land.frames.length >= 2) {
        const sq = h.poseValue(land.frames[0], 'squash');
        if (!band(sq, T.landSquash)) {
          out.push({ message: `land key 0 must absorb the impact (squash ${specText(T.landSquash)})`, detail: `measured ${h.fmt(sq)}; 1.16 is identical on all 28 defs`, where: 'land #0' });
        }
        if (land.frames[0].dur !== T.landDur) {
          out.push({ message: `land key 0 must hold for ${T.landDur}f`, detail: `measured ${land.frames[0].dur}f; 3f is identical on all 28 defs`, where: 'land #0' });
        }
        const sq1 = h.poseValue(land.frames[1], 'squash');
        if (!(sq1 < sq)) {
          out.push({ message: 'land must settle - key 1 squashes at least as hard as key 0', detail: `key 0 ${h.fmt(sq)}, key 1 ${h.fmt(sq1)} (measured 1.16 -> 1.02 on all 28 defs)`, where: 'land #1' });
        }
      }
      if (getup && getup.frames && getup.frames.length >= 2) {
        const sq = h.poseValue(getup.frames[1], 'squash');
        if (!band(sq, T.getupSquash)) {
          out.push({ message: `getup key 1 must push off the floor (squash ${specText(T.getupSquash)})`, detail: `measured ${h.fmt(sq)}; 1.06 is identical on all 28 defs`, where: 'getup #1' });
        }
      }
      // Hero-scoped: every enemy dodge is a backstep that ends at squash 1.0, so a faction-wide form fails 12 of the
      // 16 defs that have a dodge.
      if (h.isHero(subject) && dodge && dodge.frames && dodge.frames.length) {
        const last = dodge.frames[dodge.frames.length - 1];
        const sq = h.poseValue(last, 'squash');
        if (sq < T.dodgeSquash) {
          out.push({ message: `a hero dodge must land on a squash >= ${T.dodgeSquash}`, detail: `measured ${h.fmt(sq)}; 1.06 on all four heroes`, where: `dodge #${dodge.frames.length - 1}` });
        }
      }
      return out;
    },
  },

  {
    id: 'anim/attack-ease-coverage',
    section: 'ART_STYLE §8, §11',
    severity: 'error',
    describe: 'Ease the keys of every attack - an un-eased attack set is an un-animated one.',
    check(subject, h) {
      const attacks = h.attackAnims(subject);
      if (!attacks.length) return [];
      let keys = 0, eased = 0;
      const per = [];
      for (const [name, anim] of attacks) {
        const frames = h.framesOf(anim);
        const e = frames.filter((f) => f.ease).length;
        keys += frames.length; eased += e;
        per.push(`${name} ${e}/${frames.length}`);
      }
      const coverage = keys ? eased / keys : 1;
      const detail = `${eased}/${keys} attack keys eased across ${attacks.length} attack anims (bound >= ${T.easeCoverage}).\n  ${per.join(', ')}`
        + '\n  Measured per def: heroes 0.957-0.976 (the gaps are jumpAttack\'s persistent key and one dash hit key), every stage-1 enemy and both stage-1 boss rigs exactly 1.000, every stormcrow and stage-2 boss rig exactly 0.000.'
        + ' Computed per DEF over attack anims only: the guide\'s literal "ease on every key" fails all four heroes, and computing it over ALL anims separates far more weakly (heroes drop to 0.95, the control rises to 0.72-0.84).';
      if (coverage < T.easeCoverage) {
        return [{ message: `only ${h.fmt(coverage * 100, 1)} % of this def's attack keys carry an ease (bound ${T.easeCoverage * 100} %)`, detail, where: 'attacks' }];
      }
      return [{ severity: 'info', message: `attack ease coverage ${h.fmt(coverage, 3)}`, detail, where: 'attacks' }];
    },
  },

  {
    id: 'anim/attack-beats',
    section: 'ART_STYLE §8, §11',
    severity: 'warn',
    describe: 'Build attacks from the four beats: anticipation, smear hit, hold, follow-through.',
    check(subject, h) {
      const out = [];
      const attacks = h.attackAnims(subject);
      if (!attacks.length) return out;
      // (a) anticipation - per attack, but exempt when key 0 already carries the hitbox (there is no room to wind up).
      // Reported once per DEF (one line per rig, not one per move) so a whole-cast run stays readable.
      const noWindUp = [];
      for (const [name, anim] of attacks) {
        const frames = h.framesOf(anim);
        if (h.hitKeys(anim).includes(0)) continue;
        if (frames[0].ease !== 'in') noWindUp.push(`${name} (key 0 ease = ${JSON.stringify(frames[0].ease || null)})`);
      }
      if (noWindUp.length) {
        out.push({ message: `${noWindUp.length} attack(s) do not wind up - key 0 must ease 'in'`, where: 'attacks',
          detail: `${noWindUp.join(', ')}. Measured 'in' on the first key of every attack of every reference def.` });
      }
      // (b)(c) overshoot + smear, per DEF over SWING attacks. Per-attack forms measure a 24-39 % false-positive rate on
      // stage-1 content (brunhild's super, pip's special and the firebrand's flame all legitimately use 'out').
      const swings = attacks.filter(([, a]) => !isSustained(a, h));
      const beams = attacks.filter(([, a]) => isSustained(a, h)).map(([n]) => n);
      if (!swings.length) {
        out.push({ severity: 'info', message: 'no swing attacks: the overshoot and smear clauses do not apply', detail: `every attack on this def is a sustained beam (${beams.join(', ')}) - three or more consecutive damaging keys sharing one hitbox id. ART_STYLE section 8 permits projectile/beam movesets, and a beam has no arc to smear. Measured: only sootborn:firebrand (flame) and pip (super) classify as sustained, and no control attack does.`, where: 'attacks' });
      } else {
        const overshoot = swings.some(([, a]) => h.hitKeys(a).some((i) => a.frames[i].ease === 'overshoot'));
        const smear = swings.some(([, a]) => h.hitKeys(a).some((i) => a.frames[i].smear));
        const names = swings.map(([n]) => n).join(', ');
        if (!overshoot) out.push({ message: 'no attack on this def overshoots on its hit key', detail: `swing attacks: ${names}. Measured true for all 14 stage-1 rigs and both stage-1 boss rigs, false for every stormcrow and stage-2 boss rig.`, where: 'attacks' });
        if (!smear) out.push({ message: 'no attack on this def carries a smear on its hit key', detail: `swing attacks: ${names}. Measured 74 smear keys across the reference cast and 0 across the control.`, where: 'attacks' });
      }
      const noFollow = [];
      for (const [name, anim] of attacks) {
        const frames = h.framesOf(anim);
        const hits = h.hitKeys(anim);
        // (d) hold - scoped BY NAME to attack1..attack4, because dash lunges and grabs legitimately have no hold beat.
        if (/^attack[1-4]$/.test(name)) {
          for (const i of hits) {
            if (i + 1 >= frames.length) continue;
            let worst = 0, joint = '';
            for (const path of HOLD_JOINTS) {
              const d = Math.abs(h.poseValue(frames[i], path) - h.poseValue(frames[i + 1], path));
              if (d > worst) { worst = d; joint = path; }
            }
            if (worst > T.holdDelta) {
              out.push({ message: `${name} key ${i + 1} is a new pose, not a hold (${joint} moves ${h.fmt(worst)} deg > ${T.holdDelta})`, detail: 'measured 2 .. 18 deg (rook attack4 the maximum) across the four heroes\' attack1-4 hold keys', where: `${name} #${i + 1}` });
            }
          }
        }
        // (e) follow-through. Collected and reported once per def, like the anticipation clause.
        if (frames.length >= 5 && hits.length === 1) {
          const k = hits[0] + 2;
          if (k < frames.length && !SMOOTHING.includes(frames[k].ease)) {
            noFollow.push(`${name} #${k} (ease = ${JSON.stringify(frames[k].ease || null)})`);
          }
        }
      }
      if (noFollow.length) {
        out.push({ message: `${noFollow.length} attack(s) do not ease the follow-through key`, where: 'attacks',
          detail: `${noFollow.join(', ')}. Expected one of ${SMOOTHING.join(' / ')}. ${DOC_BUGS[4]}` });
      }
      return out;
    },
  },

  {
    id: 'anim/hitbox-placement',
    section: 'ART_STYLE §8, §11',
    severity: 'error',
    describe: 'Put the hitbox on the hit keys and nowhere else.',
    check(subject, h) {
      const out = [];
      for (const [name, anim] of h.animEntries(subject)) {
        const frames = h.framesOf(anim);
        const hits = h.hitKeys(anim);
        if (!hits.length) continue;
        // Structural exemptions, never by anim name: a grab family anim, a persistent hitbox declaring a shared id,
        // and a multi-hit attack longer than the single-hit ground combos.
        const isGrab = frames.some((f) => h.frameHitboxes(f).some((hb) => hb && hb.type === 'grab'));
        if (isGrab) continue;
        const boxes = hits.map((i) => h.frameHitboxes(frames[i]).find(h.isDamaging));
        const hasId = boxes.some((b) => b && b.id);
        if (hits.includes(0)) out.push({ message: `${name} damages on key 0 - there is no anticipation beat in front of it`, detail: `hit keys ${list(hits)}`, where: `${name} #0` });
        const last = frames.length - 1;
        if (hits.includes(last) && !hasId) {
          out.push({ message: `${name} still damages on its last key - the recovery beat is live`, detail: `hit keys ${list(hits)} of ${frames.length}. A deliberately persistent hitbox declares itself with an \`id\` (that is how all four heroes' jumpAttack passes); one that forgets the id is flagged, which is the safe error direction.`, where: `${name} #${last}` });
        }
        let contiguous = true;
        for (let i = 1; i < hits.length; i++) if (hits[i] !== hits[i - 1] + 1) contiguous = false;
        if (!contiguous && !hasId && frames.length <= T.multiHitKeys) {
          out.push({ message: `${name} damages on a broken run of keys`, detail: `hit keys ${list(hits)} of ${frames.length}. Non-contiguous runs are legal when the hitbox sets an id (warden shieldBash 2,3,5,6,8,9; duelist riposte 1,3,5,7; vane sawSweep 2,4) or when the attack runs longer than ${T.multiHitKeys} keys (brunhild super 9, sael super 20, vane#2 caneFlurry 13) - the ${T.multiHitKeys}-key gate is the observed split between single-hit ground combos and multi-hit attacks.`, where: `${name}` });
        }
      }
      return out;
    },
  },

  {
    id: 'anim/face-expression-set',
    section: 'ART_STYLE §6, §8, §11',
    severity: 'error',
    describe: 'Set the documented face on the reaction and outcome animations.',
    check(subject, h) {
      const out = [];
      const need = (name, allowed, keys) => {
        const anim = subject.anims[name];
        if (!anim || !anim.frames || !anim.frames.length) return;
        const frames = anim.frames;
        const idx = keys ? keys(frames) : frames.map((f, i) => i);
        for (const i of idx) {
          if (i < 0 || i >= frames.length) continue;
          const face = frameFace(frames[i], h);
          if (!allowed.includes(face)) out.push({ message: `${name} key ${i} shows ${faceName(face)}, expected ${allowed.map(faceName).join(' or ')}`, detail: 'measured identical on all 28 reference and control defs', where: `${name} #${i}` });
        }
      };
      need('hurt', [FACE.hurt], (f) => [0]);
      need('knockdown', [FACE.hurt]);
      need('hurtAir', [FACE.hurt]);
      need('dead', [FACE.dazed]);
      // The guide's literal "lying is dazed" fails 19 of 28 defs: only the heroes reach dazed in lying.
      need('lying', [FACE.hurt, FACE.dazed]);
      // The guide's literal "the tuck keys are closed" fails the Sootborn and Grubbik phase 2.
      need('dodge', DODGE_FACES, (f) => (f.length >= 3 ? Array.from({ length: f.length - 2 }, (_, k) => k + 1) : []));

      if (h.isHero(subject)) {
        const win = subject.anims.win;
        if (win && win.frames && win.frames.length) {
          const faces = win.frames.map((f) => frameFace(f, h));
          if (!faces.includes(FACE.happy)) out.push({ message: 'win never shows happy', detail: `faces ${list(faces.map(faceName))}. Asserted as "contains", not "key 0 is happy": rook's win opens on neutral and brunhild's ends on closed when the boiler blows steam in her face.`, where: 'win' });
        }
        const taunt = subject.anims.taunt;
        if (taunt && taunt.frames && taunt.frames.length) {
          const last = taunt.frames[taunt.frames.length - 1];
          const face = frameFace(last, h);
          const i = taunt.frames.length - 1;
          if (face !== FACE.happy) {
            out.push({ message: `taunt must end on happy, not ${faceName(face)}`, detail: 'asserted on the LAST key, not the first: brunhild\'s taunt opens on neutral', where: `taunt #${i}` });
          }
          if (last.event !== 'meterGain') {
            out.push({ message: "taunt's last key must fire event 'meterGain'", detail: `event = ${JSON.stringify(last.event || null)}; this is a contract with the game code, true on all four heroes`, where: `taunt #${i}` });
          }
        }
      }
      return out;
    },
  },

  {
    id: 'anim/attack-face-aggressive',
    section: 'ART_STYLE §6, §8, §11',
    severity: 'warn',
    describe: 'Show effort on the face during attacks.',
    check(subject, h) {
      const attacks = h.attackAnims(subject);
      if (!attacks.length) return [];
      const resp = faceResponse(subject, h);
      if (!resp.expressive) {
        return [{
          severity: 'info',
          message: 'skipped: this rig has no expressive face',
          detail: 'measured by probe, not by faction name: recording one idle head draw at face neutral against angry / shout / grit produces an IDENTICAL command stream, so pose.face has no visual consequence on this rig.'
            + ' Measured over all 28 subjects - heroes, Sootborn, the Hoister, Grubbik and Vane respond to all seven faces; the Brassbound lenses, the Regent Engine and the Stormcrow gas masks do not.'
            + ' NOTE the calibration result: the Stormcrow masks measure exactly like the Brassbound lenses, so this rule cannot be the one that flags them - their attacks are caught by anim/attack-ease-coverage and anim/attack-beats instead.',
          where: 'attacks',
        }];
      }
      const out = [];
      for (const [name, anim] of attacks) {
        for (const i of h.hitKeys(anim)) {
          const face = frameFace(anim.frames[i], h);
          if (!EFFORT_FACES.includes(face)) out.push({ message: `${name} hits on ${faceName(face)} - a hit key must show effort (${EFFORT_FACES.map(faceName).join(' or ')})`, detail: 'measured: heroes set shout or grit on every hit key, Sootborn / the Hoister / Grubbik / Vane phase 2 set shout', where: `${name} #${i}` });
        }
      }
      // section 11: idle -> attack -> hurt must read as three different faces.
      const idle = subject.anims.idle, hurt = subject.anims.hurt;
      const atk = attacks[0][1];
      const atkKey = h.hitKeys(atk)[0];
      if (idle && idle.frames && idle.frames.length && hurt && hurt.frames && hurt.frames.length && atkKey != null) {
        const a = frameFace(idle.frames[0], h), b = frameFace(atk.frames[atkKey], h), c = frameFace(hurt.frames[0], h);
        if (a === b || b === c || a === c) out.push({ message: 'idle, attack and hurt do not read as three different faces', detail: `idle ${faceName(a)}, attack ${faceName(b)}, hurt ${faceName(c)}. No reference def sets a face in idle at all, so idle resolves to the default ${faceName(FACE.neutral)}.`, where: 'idle/attack/hurt' });
      }
      return out;
    },
  },

  {
    id: 'anim/legs-explicit',
    section: 'ART_STYLE §8',
    severity: 'warn',
    describe: 'Set legR and legL on every key so no foot floats on an inherited pose.',
    check(subject, h) {
      const loose = [];
      for (const [name, anim] of h.animEntries(subject)) {
        h.framesOf(anim).forEach((f, i) => {
          const pose = f.pose || {};
          if (!pose.legR || !pose.legL) loose.push(`${name} #${i}${pose.legR ? '' : ' legR'}${pose.legL ? '' : ' legL'}`);
        });
      }
      if (loose.length <= T.looseLegKeys) return [];
      return [{
        message: `${loose.length} keys inherit their leg pose instead of setting it (budget ${T.looseLegKeys})`,
        detail: `${loose.join(', ')}\n  A budget rather than a per-key assertion: one inherited key per def is a legitimate authoring choice (brunhild's super return key is exactly that).`
          + ' Measured per def: heroes 0-1, all five brassbound 0, all five sootborn 0, both stage-1 boss rigs 0 (stage-1 maximum 1); stormcrows 2-3, the grapnel winch 6-7, kestrel 7-10.',
        where: 'anims',
      }];
    },
  },
];
