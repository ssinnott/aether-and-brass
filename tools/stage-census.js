// Stage census: the wave / enemy / hazard tables behind issues #27 and #28, regenerated from the stage data so
// the numbers in a PR are measured rather than typed. Pure Node, no browser: it imports content/stage and
// content/enemies (the same way tools/art-check.js does).
//
//   node tools/stage-census.js            # the markdown tables + the acceptance checklist
//   node tools/stage-census.js --json     # the same as one JSON document
//   node tools/stage-census.js --strict   # exit 1 when any acceptance row fails
//
// "Variant" counts a spawn modifier as its own entry (footman+holdout is not a footman), as #28 asks, and every
// table counts reinforcements and timed waves as enemies and waves respectively.
import { STAGES } from '../src/content/stage/index.js';
import { getEnemyDef } from '../src/content/enemies/index.js';

// the spawn-modifier table (game/traits.js SPAWN_MODS); tolerated as absent so the census runs on any revision
const SPAWN_MODS = (await import('../src/game/traits.js')).SPAWN_MODS || {};

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json'), STRICT = argv.includes('--strict');
const TOP_SHARE_MAX = 0.30, MIN_DISTINCT = 12, MIN_ENEMIES = 60, MIN_FACTION_VARIANTS = 4;

/** Every wave of a section in play order: trigger waves, then the locked section's timed waves. */
function wavesOf(sec) {
  const out = [];
  for (const w of sec.waves || []) out.push({ ...w, timed: false });
  for (const w of sec.timedWaves || []) out.push({ ...w, timed: true });
  return out;
}
/** Every spawn of a wave, reinforcements included, tagged with the wave it came from. */
function spawnsOf(w) {
  const out = [...(w.spawns || [])];
  for (const r of w.reinforcements || []) out.push(...(r.spawns || []));
  return out;
}
const key = (s) => `${s.type}:${s.variant}${s.mods && s.mods.length ? '+' + [...s.mods].sort().join('+') : ''}`;
const label = (k) => k.replace(/^[a-z]+:/, '');
/** A section's hazard layout, position-relative so two sections with the same vents in the same places collide. */
function layoutOf(sec) {
  return (sec.hazards || []).map((h) => `${h.type}@${h.x - sec.x0},${h.z == null ? 100 : h.z}`).sort().join(' | ') || '(none)';
}

function census(stage, index) {
  const sections = stage.sections, n = index + 1;
  const counts = new Map(), factions = new Map(), variantsByFaction = new Map(), modsUsed = new Map();
  let enemies = 0, waves = 0, mixed = 0, reinforced = 0, timed = 0, locked = 0;
  const seen = new Set(), secRows = [], hazardTypes = new Set(), layouts = [];
  let elitePairSections = [];
  for (const sec of sections) {
    const secWaves = wavesOf(sec);
    const introduced = [], elitesHere = new Set();
    let secMixed = 0, secEnemies = 0;
    for (const w of secWaves) {
      waves++;
      if (w.timed) timed++;
      if (w.reinforcements && w.reinforcements.length) reinforced++;
      const sp = spawnsOf(w), fac = new Set();
      for (const s of sp) {
        const def = getEnemyDef(s.type, s.variant);
        const k = key(s);
        enemies++; secEnemies++;
        counts.set(k, (counts.get(k) || 0) + 1);
        factions.set(def.faction, (factions.get(def.faction) || 0) + 1);
        if (!variantsByFaction.has(def.faction)) variantsByFaction.set(def.faction, new Set());
        variantsByFaction.get(def.faction).add(k);
        for (const m of s.mods || []) modsUsed.set(m, (modsUsed.get(m) || 0) + 1);
        fac.add(def.faction);
        if (!seen.has(k)) { seen.add(k); introduced.push(k); }
        if (def.role === 'elite' || def.elite) elitesHere.add(`${def.type}:${def.variant}`);
      }
      if (fac.size > 1) { mixed++; secMixed++; }
    }
    if (sec.mode === 'locked') locked++;
    for (const h of sec.hazards || []) hazardTypes.add(h.type);
    for (const z of sec.zones || []) hazardTypes.add(z.type + ' zone');
    layouts.push({ stage: n, section: sec.id, layout: layoutOf(sec) });
    if (elitesHere.size >= 2) elitePairSections.push(sec.id);
    secRows.push({ id: sec.id, name: sec.name, locked: sec.mode === 'locked', waves: secWaves.length, enemies: secEnemies, mixed: secMixed,
      introduced: introduced.map(label), elites: [...elitesHere].map(label), hazards: (sec.hazards || []).map((h) => h.type),
      zones: (sec.zones || []).map((z) => z.type), props: [...new Set((sec.props || []).map((p) => p.type))], transition: sec.transition ? sec.transition.kind : null });
  }
  let top = null;
  for (const [k, v] of counts) if (!top || v > top.count) top = { key: k, count: v };
  const lastSec = secRows[secRows.length - 1];
  return {
    number: n, id: stage.id, name: stage.name, sections: sections.length, waves, enemies, distinct: counts.size,
    top: top ? { variant: label(top.key), share: top.count / Math.max(1, enemies) } : null,
    mixed, reinforced, timed, locked, hazardTypes: [...hazardTypes], layouts,
    midbossTrack: stage.music && stage.music.midboss, factions: [...factions.entries()].map(([f, c]) => ({ faction: f, enemies: c, variants: variantsByFaction.get(f).size, list: [...variantsByFaction.get(f)].map(label) })),
    mods: [...modsUsed.entries()].map(([m, c]) => ({ mod: m, waves: c })),
    lateIntroduction: lastSec ? lastSec.introduced.length : 0,
    elitePairSections,
    secRows,
  };
}

const rows = STAGES.map(census);
const allLayouts = rows.flatMap((r) => r.layouts);
const layoutDupes = [];
for (let i = 0; i < allLayouts.length; i++) for (let j = i + 1; j < allLayouts.length; j++) {
  if (allLayouts[i].layout !== '(none)' && allLayouts[i].layout === allLayouts[j].layout) layoutDupes.push([allLayouts[i], allLayouts[j]]);
}
const midbossTracks = rows.map((r) => r.midbossTrack);
const modNames = Object.keys(SPAWN_MODS || {});

// ---------------------------------------------------------------- acceptance
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
check('No two sections in the game share a hazard layout', layoutDupes.length === 0, layoutDupes.map(([a, b]) => `${a.stage}/${a.section} = ${b.stage}/${b.section}`).join('; ') || 'all layouts unique');
for (const r of rows) {
  const b = `Board ${r.number}`;
  check(`${b}: has a locked / moving section`, r.locked > 0, `${r.locked} locked section(s)`);
  check(`${b}: has a reinforcement wave`, r.reinforced > 0, `${r.reinforced} wave(s) with reinforcements`);
  check(`${b}: has its own mid-boss track`, r.midbossTrack && midbossTracks.filter((t) => t === r.midbossTrack).length === 1, String(r.midbossTrack));
  check(`${b}: top variant under ${Math.round(TOP_SHARE_MAX * 100)}%`, r.top && r.top.share < TOP_SHARE_MAX, r.top ? `${r.top.variant} ${(r.top.share * 100).toFixed(0)}%` : 'no spawns');
  // the pacing and volume targets of #28 are written for boards 2-4; board 1 is the reference they are measured against
  if (r.number === 1) continue;
  check(`${b}: at least ${MIN_DISTINCT} distinct variants (mods count)`, r.distinct >= MIN_DISTINCT, `${r.distinct}`);
  check(`${b}: ${MIN_ENEMIES}+ enemies`, r.enemies >= MIN_ENEMIES, `${r.enemies}`);
  const full = r.factions.filter((f) => f.variants >= MIN_FACTION_VARIANTS);
  check(`${b}: two factions with ${MIN_FACTION_VARIANTS}+ variants each`, full.length >= 2, r.factions.map((f) => `${f.faction} ${f.variants}v/${f.enemies}e`).join(', '));
  check(`${b}: every section introduces a variant, one held for the last section`, r.secRows.every((s) => s.introduced.length > 0) && r.lateIntroduction > 0, r.secRows.map((s) => `${s.id}:+${s.introduced.length}`).join(' '));
  check(`${b}: at least two mixed-faction waves per section`, r.secRows.every((s) => s.mixed >= 2), r.secRows.map((s) => `${s.id}:${s.mixed}`).join(' '));
}
for (const m of modNames) {
  const used = rows.some((r) => r.mods.some((x) => x.mod === m));
  check(`Modifier '${m}' is used by at least one wave`, used, rows.map((r) => { const x = r.mods.find((y) => y.mod === m); return x ? `board ${r.number}: ${x.waves} spawn(s)` : null; }).filter(Boolean).join(', ') || 'unused');
}
const failed = checks.filter((c) => !c.ok);

// ---------------------------------------------------------------- output
if (JSON_OUT) {
  console.log(JSON.stringify({ boards: rows, layoutDupes, checks }, null, 2));
} else {
  const pct = (x) => `${Math.round(x * 100)}%`;
  console.log('## Boards (reinforcements and timed waves included)\n');
  console.log('| Board | Sections | Waves | Enemies | Distinct variants | Top variant share | Mixed-faction waves | Waves with reinforcements | Timed/locked waves | Hazard types | Hazard layout unique per section |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const dup = layoutDupes.some(([a, b]) => a.stage === r.number || b.stage === r.number);
    console.log(`| ${r.number} ${r.name.replace(/^THE /, '').split(' ')[0][0] + r.name.replace(/^THE /, '').split(' ')[0].slice(1).toLowerCase()} | ${r.sections} | ${r.waves} | ${r.enemies} | ${r.distinct} | ${r.top ? `${r.top.variant} ${pct(r.top.share)}` : '-'} | ${r.mixed} | ${r.reinforced} | ${r.timed} | ${r.hazardTypes.length} (${r.hazardTypes.join(', ')}) | ${dup ? '**no**' : 'yes'} |`);
  }
  console.log('\n## Factions per board\n');
  console.log('| Board | Faction | Enemies | Distinct variants (mods count) | Variants |');
  console.log('|---|---|---|---|---|');
  for (const r of rows) for (const f of r.factions.sort((a, b) => b.enemies - a.enemies)) console.log(`| ${r.number} | ${f.faction} | ${f.enemies} | ${f.variants} | ${f.list.join(', ')} |`);
  console.log('\n## Sections\n');
  console.log('| Board | Section | Mode | Waves | Enemies | Mixed waves | Introduces | Elites present | Hazards | Zones | Props | Exit |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) for (const s of r.secRows) {
    console.log(`| ${r.number} | ${s.name} | ${s.locked ? 'locked' : 'scroll'} | ${s.waves} | ${s.enemies} | ${s.mixed} | ${s.introduced.join(', ') || '-'} | ${s.elites.join(', ') || '-'} | ${s.hazards.join(', ') || '-'} | ${s.zones.join(', ') || '-'} | ${s.props.join(', ') || '-'} | ${s.transition || '-'} |`);
  }
  console.log('\n## Spawn modifiers\n');
  console.log('| Board | Modifier | Spawns |');
  console.log('|---|---|---|');
  for (const r of rows) for (const m of r.mods) console.log(`| ${r.number} | ${m.mod} | ${m.waves} |`);
  if (!rows.some((r) => r.mods.length)) console.log('| - | (none used) | - |');
  console.log('\n## Acceptance\n');
  for (const c of checks) console.log(`- [${c.ok ? 'x' : ' '}] ${c.name} — ${c.detail}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} acceptance rows pass${failed.length ? `; ${failed.length} FAIL` : ''}`);
}
if (STRICT && failed.length) process.exit(1);
