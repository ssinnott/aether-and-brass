// Teeth test for the art-invariant suite: every data/geometry rule is shown a rig that BREAKS it and must fire.
//
//   node tools/art-invariants/selftest.js        -> "36 pass, 0 fail", exit 0
//
// Why this exists. A rule that never fires is indistinguishable from a rule that passes, and most of the suite is
// silent on the shipped cast (that is the point - reference content defines the invariants). This file is the other
// half of the evidence: each case clones a REFERENCE subject in memory, injects exactly one defect, and asserts the
// rule is quiet on the clean subject and loud on the mutated one. Nothing here touches disk or src/.
//
// Adding a rule? Add a case here in the same commit. The rule is not finished until it has one.
import { buildRig } from '../../src/art/rig.js';
import { collectSubjects } from './subjects.js';
import * as helpers from './helpers.js';
import * as palette from './rules/palette.js';
import * as animation from './rules/animation.js';
import * as geometry from './rules/geometry.js';
import { tones, celCapsule } from '../../src/art/shading.js';
import { getChain } from '../../src/art/secondary.js';

const RULES = new Map();
for (const m of [palette, animation, geometry]) for (const r of m.RULES) RULES.set(r.id, r);

const subs = new Map(collectSubjects().map((s) => [s.id, s]));

function clone(id, mutate) {
  const base = subs.get(id);
  const build = { ...base.build, palette: { ...base.build.palette }, proportions: { ...(base.build.proportions || {}) }, parts: { ...(base.build.parts || {}) } };
  const anims = {};
  for (const [k, v] of Object.entries(base.anims || {})) anims[k] = { ...v, frames: (v.frames || []).map((f) => ({ ...f, pose: f.pose ? JSON.parse(JSON.stringify(f.pose)) : f.pose })) };
  const s = { ...base, build, anims, rig: null, buildError: null };
  mutate(s);
  try { s.rig = buildRig(s.build); } catch (e) { s.buildError = String(e); }
  return s;
}

let pass = 0, fail = 0;
const covered = new Set();
function expect(ruleId, subjectId, mutate, label) {
  covered.add(ruleId);
  const rule = RULES.get(ruleId);
  if (!rule) { console.log(`MISSING RULE ${ruleId}`); fail++; return; }
  const clean = RULES.get(ruleId).check(subs.get(subjectId), helpers) || [];
  const cleanBad = clean.filter((f) => (f.severity || rule.severity) !== 'info');
  const mutated = clone(subjectId, mutate);
  let got = [];
  try { got = rule.check(mutated, helpers) || []; } catch (e) { got = [{ message: 'THREW: ' + e.message }]; }
  const bad = got.filter((f) => (f.severity || rule.severity) !== 'info');
  const ok = cleanBad.length === 0 && bad.length > 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${ruleId.padEnd(34)} ${label}  (clean ${cleanBad.length}, mutated ${bad.length})`);
  if (!ok && bad.length) console.log('        ', bad[0].message);
  ok ? pass++ : fail++;
}

// ---- palette
expect('palette/outline', 'brunhild', (s) => { s.build.outlineWidth = 2; }, 'outlineWidth 2');
expect('palette/outline', 'sael', (s) => { s.build.outline = '#8a8a8a'; }, 'mid-grey outline');
expect('palette/shading-knobs', 'rook', (s) => { s.build.shading = false; }, 'shading off');
expect('palette/shading-knobs', 'brunhild', (s) => { s.build.thinR = 12; }, 'thinR 12');
expect('palette/build-schema', 'brunhild', (s) => { s.build.parts = { ...s.build.parts, boot: () => {} }; }, "part hook 'boot'");
expect('palette/proportions', 'sael', (s) => { s.build.proportions = { ...s.build.proportions, headR: 3 }; }, 'headR 3');
expect('palette/proportions', 'brunhild', (s) => { s.build.proportions = { ...s.build.proportions, footL: 4 }; }, 'footL 4');
expect('palette/faction-signature', 'brassbound:footman', (s) => { s.build.stripe = null; }, 'stripe removed');
expect('palette/aether-cyan-concordat', 'brunhild', (s) => { s.build.palette.accent = '#4DF0E0'; }, 'hero in aether cyan');
expect('palette/beard-vs-garment', 'rook', (s) => { s.build.palette.hair = s.build.palette.primary; }, 'beard = garment');
expect('palette/sleeve-vs-primary', 'brunhild', (s) => { s.build.palette.sleeve = s.build.palette.primary; }, 'sleeve = primary');
expect('palette/value-ladder-adjacent', 'sael', (s) => { s.build.palette.secondary = s.build.palette.primary; }, 'secondary = primary');

// ---- animation
expect('anim/frame-schema', 'brunhild', (s) => { s.anims.idle.frames[0].dur = 0; }, 'dur 0');
expect('anim/base-set-shape', 'sael', (s) => { s.anims.idle.frames.pop(); }, 'idle 3 keys');
expect('anim/cycle-durations', 'rook', (s) => { s.anims.walk.frames[0].dur = 20; }, 'walk 8f longer');
expect('anim/idle-breathes', 'pip', (s) => { for (const f of s.anims.idle.frames) { f.pose.torso = { ...(f.pose.torso || {}), rot: 0 }; f.pose.root = [0, 0]; f.pose.head = { ...(f.pose.head || {}), rot: 0 }; } }, 'idle frozen');
expect('anim/squash-stretch-beats', 'brunhild', (s) => { for (const f of s.anims.land.frames) { f.pose.squash = 1; f.pose.stretch = 1; } }, 'land not squashed');
expect('anim/attack-ease-coverage', 'sael', (s) => { for (const a of Object.values(s.anims)) for (const f of a.frames) delete f.ease; }, 'all ease stripped');
expect('anim/attack-beats', 'rook', (s) => { for (const a of Object.values(s.anims)) for (const f of a.frames) { delete f.ease; delete f.smear; } }, 'no ease/smear');
expect('anim/face-expression-set', 'brunhild', (s) => { s.anims.hurt.frames[0].face = 'happy'; s.anims.hurt.frames[0].pose.face = 'happy'; }, 'hurt smiles');
expect('anim/legs-explicit', 'sael', (s) => { for (const f of s.anims.walk.frames) { delete f.pose.legN; delete f.pose.legF; delete f.pose.legR; delete f.pose.legL; } }, 'legs unset');

// ---- geometry
expect('geom/pose-audit', 'brunhild', (s) => { s.build.snap = false; }, 'snap off');
expect('geom/draw-hygiene', 'sael', (s) => { const t = s.build.parts.torso; s.build.parts = { ...s.build.parts, torso(ctx, rig, pose, inf) { Math.random(); return t && t(ctx, rig, pose, inf); } }; }, 'Math.random in a hook');
expect('geom/flash-purity', 'rook', (s) => { const t = s.build.parts.torso; s.build.parts = { ...s.build.parts, torso(ctx, rig, pose, inf) { ctx.fillStyle = '#ff00ff'; ctx.fillRect(-4, -4, 8, 8); return t && t(ctx, rig, pose, inf); } }; }, 'flash-ignoring fill');
expect('geom/far-palette-leak', 'sael', (s) => { const t = s.build.parts.hand; s.build.parts = { ...s.build.parts, hand(ctx, rig, pose, inf) { ctx.fillStyle = '#ecba8c'; ctx.fillRect(-2, -2, 4, 4); return t && t(ctx, rig, pose, inf); } }; }, 'constant on both sides');
expect('geom/outline-stroke-contract', 'brunhild', (s) => { const t = s.build.parts.torso; s.build.parts = { ...s.build.parts, torso(ctx, rig, pose, inf) { const r = t && t(ctx, rig, pose, inf); if (!rig.override) { ctx.strokeStyle = rig.outline; ctx.lineWidth = 1; ctx.beginPath(); ctx.rect(-6, -6, 12, 12); ctx.stroke(); ctx.fillStyle = rig.palette.accent; ctx.fill(); } return r; } }; }, 'hand-rolled outline');
expect('geom/chain-contract', 'brunhild', (s) => { const t = s.build.parts.torso; s.build.parts = { ...s.build.parts, torso(ctx, rig, pose, inf) { getChain(rig, 'bogus', 2, { joint: 'elbowN', rest: [0, 1], stiffness: 0.9, damping: 0.1, gain: 9, rotGain: 2, maxAng: 120 }); return t && t(ctx, rig, pose, inf); } }; }, 'chain on elbowN, params out of band');
expect('geom/detail-floor', 'brassbound:footman', (s) => { const t = s.build.parts.torso; s.build.parts = { ...s.build.parts, torso(ctx, rig, pose, inf) { const r = t && t(ctx, rig, pose, inf); if (!rig.override) for (let i = 0; i < 40; i++) { ctx.fillStyle = '#c0ffee'; ctx.fillRect(-8 + i % 8, -8 + ((i / 8) | 0), 1, 1); } return r; } }; }, '40 one-pixel studs');
expect('geom/draw-budget', 'brassbound:footman', (s) => { const t = s.build.parts.torso; s.build.parts = { ...s.build.parts, torso(ctx, rig, pose, inf) { const r = t && t(ctx, rig, pose, inf); for (let i = 0; i < 200; i++) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 2, 2); ctx.clip(); ctx.restore(); } return r; } }; }, '200 clips');
expect('geom/rest-pose-open', 'brassbound:duelist', (s) => { s.build.weapon = { ...s.build.weapon, headAt: 90 }; }, 'weapon head dragged to the floor');
expect('geom/glow-flat-and-cored', 'brassbound:footman', (s) => { const t = s.build.parts.torso; s.build.parts = { ...s.build.parts, torso(ctx, rig, pose, inf) { const r = t && t(ctx, rig, pose, inf); if (!rig.override && rig.palette.glow) { ctx.fillStyle = tones(rig, rig.palette.glow).hi; ctx.fillRect(-3, -3, 6, 6); } return r; } }; }, 'ramped glow tone');

// sael, not brunhild: brunhild already trips this rule at baseline (weapon bands), so mutating her would prove
// nothing. sael is clean, so a 12x12 unoutlined accent rect is the whole signal.
expect('geom/outline-rect-boundary', 'sael', (s) => { const t = s.build.parts.torso; s.build.parts = { ...s.build.parts, torso(ctx, rig, pose, inf) { const r = t && t(ctx, rig, pose, inf); if (!rig.override) { ctx.fillStyle = rig.col(rig.palette.accent); ctx.fillRect(-6, -6, 12, 12); } return r; } }; }, 'unoutlined 12x12 accent rect');
expect('geom/outline-coloured-seam', 'brassbound:footman', (s) => { const t = s.build.parts.torso; s.build.parts = { ...s.build.parts, torso(ctx, rig, pose, inf) { const r = t && t(ctx, rig, pose, inf); if (!rig.override) { ctx.fillStyle = rig.outline; ctx.fillRect(-8, 0, 16, 1); } return r; } }; }, 'outline-coloured 16x1 seam');
expect('anim/hitbox-placement', 'brunhild', (s) => { for (const f of s.anims.idle.frames) f.hitbox = { id: 'x', x: 10, y: -20, w: 20, h: 20 }; }, 'hitbox on idle');
expect('anim/locomotion-shape', 'sael', (s) => { for (const f of s.anims.run.frames) { f.pose.torso = { ...(f.pose.torso || {}), rot: 0 }; f.pose.legN = { upper: 0, lower: 0 }; f.pose.legF = { upper: 0, lower: 0 }; } }, 'run with no lean or stride');
expect('palette/faction-variant-divergence', 'stormcrow:corsair', (s) => { const c = subs.get('stormcrow:crimper'); s.build.palette = { ...c.build.palette }; }, 'variant palette cloned');
expect('anim/attack-face-aggressive', 'brunhild', (s) => { for (const a of Object.values(s.anims)) for (const f of a.frames) { f.face = 'neutral'; if (f.pose) f.pose.face = 'neutral'; } }, 'blank face through every attack');

// ---- the readability pass
expect('geom/mark-budget', 'brassbound:footman', (s) => { const t = s.build.parts.torso; s.build.parts = { ...s.build.parts, torso(ctx, rig, pose, inf) { const r = t && t(ctx, rig, pose, inf); if (!rig.override) for (let i = 0; i < 140; i++) { ctx.fillStyle = '#c0ffee'; ctx.fillRect(-8 + i % 8, -8 + ((i / 8) | 0), 4, 4); } return r; } }; }, '140 extra marks on the torso');
// brunhild has no limb hooks, so the rule is silent on her by construction: an armUpper that paints TWO bands
// across the bicep is the entire signal, with no baseline to subtract.
expect('geom/limb-crossings', 'brunhild', (s) => {
  s.build.parts = { ...s.build.parts,
    armUpper(ctx, rig, pose, inf) {
      const r = inf.r, pal = inf.pal;
      celCapsule(ctx, rig, 0, 0, 0, inf.len, r, pal.sleeve || pal.primary, 0);
      if (rig.override) return;
      ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(-r, inf.len * 0.35, r * 2, 2);
      ctx.fillStyle = rig.col(pal.metal); ctx.fillRect(-r, inf.len * 0.6, r * 2, 2);
    } };
}, 'two material bands across one bicep');
// The order this rule checks is fixed in rig.js, so it cannot be broken from a build. What CAN be done is open a
// 'hand' range early: rig.parts.hand is wrapped by name, so calling it from the torso hook makes the hand appear
// long before the weapon — exactly the defect the rule exists to catch, reproduced without touching src/.
expect('geom/appendage-layering', 'brassbound:duelist', (s) => { const t = s.build.parts.torso; s.build.parts = { ...s.build.parts, torso(ctx, rig, pose, inf) { const r = t && t(ctx, rig, pose, inf); if (rig.parts.hand) rig.parts.hand(ctx, rig, pose, { ...inf, name: 'hand', far: false, r: rig.p.handR, color: rig.palette.skin }); return r; } }; }, 'hand opened during the torso, before the weapon');

// Coverage: a data/geometry rule with no case here is a rule nobody has proved can fire.
const uncovered = [...RULES.keys()].filter((id) => !covered.has(id));
if (uncovered.length) {
  console.log(`\nFAIL  ${uncovered.length} rule(s) have no teeth case: ${uncovered.join(', ')}`);
  fail += uncovered.length;
}

console.log(`\n${pass} pass, ${fail} fail  (${covered.size}/${RULES.size} data+geometry rules covered)`);
console.log('the render tier is not covered here - it needs a browser; see docs/ART_INVARIANTS.md');
process.exit(fail ? 1 : 0);
