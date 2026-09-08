// Chandlery recorder-proxy census: area-weighted mean HSV saturation per variant, plus the CLAN rank-mark
// pixel census (area painted in each variant's own wax-seal / cap hue). Not a substitute for
// tools/stage-values.js -- it is the fast iteration proxy, ignoring occlusion.
import { collectSubjects } from './art-invariants/subjects.js';
import * as H from './art-invariants/helpers.js';
import { farShade } from '../src/art/palettes.js';

function hsv(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let hue = 0;
  if (mx !== mn) {
    const d = mx - mn;
    hue = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
    hue *= 60;
  }
  return { h: hue, s: mx === 0 ? 0 : (mx - mn) / mx, v: mx };
}
const NORM = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);

const subs = collectSubjects().filter((s) => s.type === 'chandler');
const wanted = process.argv[2] ? process.argv[2].split(',') : null;
const rows = [];
for (const s of subs) {
  if (wanted && !wanted.includes(s.variant)) continue;
  const rig = s.rig;
  const outline = NORM(rig.outline);
  const area = new Map();
  const snap = H.snapshotRigState(rig);
  for (const [name, anim] of H.animEntries(s)) {
    for (const f of H.framesOf(anim)) {
      const pose = H.resolvePose(f);
      const before = H.snapshotRigState(rig);
      let rec = null;
      try { rec = H.recordDraw(rig, pose, {}); } catch { /* skip */ }
      H.restoreRigState(rig, before);
      rig.tick = before.tick + 1; rig.chainFrame = rig.tick;
      if (!rec) continue;
      for (const e of rec.ops) {
        if (e.op !== 'fill' && e.op !== 'fillRect') continue;
        const c = NORM(e.fillStyle);
        if (!c || c === outline) continue;
        const a = e.op === 'fillRect' ? (e.W || 0) * (e.H || 0)
          : (e.bbox ? (e.bbox.w * e.bbox.h * 0.72) : 0);   // path fills are ~72 % of their bbox
        if (!(a > 0)) continue;
        area.set(c, (area.get(c) || 0) + a * (e.alpha == null ? 1 : e.alpha));
      }
    }
  }
  H.restoreRigState(rig, snap);
  let tot = 0, sat = 0, val = 0;
  for (const [c, a] of area) { const q = hsv(c); tot += a; sat += q.s * a; val += q.v * a; }
  // The rank census counts the EXACT clan hex and its own tone ramp -- a hue window is useless on this faction,
  // where the coat, the leather and every wax seal are all warm.
  const clan = NORM(rig.build && rig.build.clan);
  // the Tallyman's rung rides a FAR accessory (the ledger spine), so the far value of the clan hex counts too
  const fam = clan ? new Set([...H.expandTones(clan, rig.ramp), ...H.expandTones(farShade(clan, 0.62, 0.25), rig.ramp)]
    .map((x) => NORM(x)).filter(Boolean)) : null;
  let clanArea = 0;
  if (fam) for (const [c, a] of area) if (fam.has(c)) clanArea += a;
  const top = [...area].sort((x, y) => y[1] - x[1]).slice(0, 12)
    .map(([c, a]) => `${c} ${(100 * a / tot).toFixed(1)}% s${Math.round(hsv(c).s * 100)}`).join('  ');
  rows.push({ v: s.variant, s: 100 * sat / tot, val: 100 * val / tot, clan, clanArea, clanPct: 100 * clanArea / tot, top });
}
console.log('variant           meanS  meanV   clan      clanArea  clan%   biggest masses');
for (const r of rows) {
  console.log(`${r.v.padEnd(17)}${r.s.toFixed(1).padStart(5)}  ${r.val.toFixed(1).padStart(5)}   ${(r.clan || '-').padEnd(9)} ${r.clanArea.toFixed(0).padStart(8)}  ${r.clanPct.toFixed(2).padStart(5)}   ${r.top}`);
}
