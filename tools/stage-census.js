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
const TOP_SHARE_MAX = 0.30, MIN_DISTINCT = 12, MIN_ENEMIES = 60, MAX_ENEMIES = 75, MIN_FACTION_VARIANTS = 4;
/** Part 1 wants a second faction "at real strength", benchmarked on board 1's near-even 37/36. A share of the board, not a variant count. */
const MIN_SECOND_FACTION_SHARE = 0.25;

/** True when a def hangs under a bladder of its own — airborne BY CONSTRUCTION, independent of any spawn modifier. */
function carriesBladder(def) {
  const b = def.build || {};
  if (b.bagShape && b.bagShape !== 'none') return true;
  return (def.hurtParts || []).some((p) => p.name === 'bag' || p.name === 'bags');
}

/**
 * The ratio rule each board states in its own header comment (src/content/stage/stageN.js). #28 Part 1 asks for a rule
 * that MOVES across the sections, so this measures it instead of taking the comment's word: `rising` must not fall from
 * one section to the next, and where a rule has a second half ("and the fewer people") `falling` must not climb.
 * Board 4 counts only enemies airborne by construction — a `winged` body arrives from the sky and then lands, so
 * counting it as sky is how a section that has LESS sky than the one before it reads as more.
 */
const RATIO_RULES = {
  2: { rule: 'the higher you board, the more clockwork', rising: { unit: 'clockwork', of: (def) => def.faction === 'brassbound' } },
  3: { rule: 'the closer to the ledger, the more machines and the fewer people',
    rising: { unit: 'machines', of: (def) => def.faction === 'brassbound' },
    falling: { unit: 'people', of: (def) => def.faction === 'chandler' || def.faction === 'sootborn' } },
  4: { rule: 'the sky fills up as you go', rising: { unit: 'airborne', of: carriesBladder } },
};

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
  const rule = RATIO_RULES[n];
  for (const sec of sections) {
    const secWaves = wavesOf(sec);
    const introduced = [], elitesHere = new Set();
    let secMixed = 0, secEnemies = 0, secRising = 0, secFalling = 0;
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
        if (rule && rule.rising.of(def, s)) secRising++;
        if (rule && rule.falling && rule.falling.of(def, s)) secFalling++;
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
      rising: secRising, risingShare: secRising / Math.max(1, secEnemies), falling: secFalling,
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
    elitePairSections, lastSectionId: lastSec ? lastSec.id : null,
    lastSectionElites: lastSec ? lastSec.elites.length : 0,
    ratio: RATIO_RULES[n] || null,
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
  // The GDD escalation clause of Part 4 ("fodder in section 1, elites by section 2, the elite pair together only in the
  // last section"). The STRICT reading — a pair in the last section and nowhere else — is not met by board 1 either
  // (it pairs from section 2 on), and reworking board 1 is outside #28, which treats it as the reference. So the hard
  // row is the half the reference does satisfy and that carries the escalation: the LAST section must field the pair.
  // Where else a pair meets is printed under the Sections table rather than asserted, so the strict reading stays visible.
  check(`${b}: the elite pair is together in the last section`, r.lastSectionElites >= 2,
    `${r.lastSectionId}: ${r.lastSectionElites} elite variant(s); pairs meet in ${r.elitePairSections.join(', ') || 'no section'}`);
  // the pacing and volume targets of #28 are written for boards 2-4; board 1 is the reference they are measured against
  if (r.number === 1) continue;
  check(`${b}: at least ${MIN_DISTINCT} distinct variants (mods count)`, r.distinct >= MIN_DISTINCT, `${r.distinct}`);
  check(`${b}: ${MIN_ENEMIES} to ${MAX_ENEMIES} enemies`, r.enemies >= MIN_ENEMIES && r.enemies <= MAX_ENEMIES, `${r.enemies}`);
  const full = r.factions.filter((f) => f.variants >= MIN_FACTION_VARIANTS);
  check(`${b}: two factions with ${MIN_FACTION_VARIANTS}+ variants each`, full.length >= 2, r.factions.map((f) => `${f.faction} ${f.variants}v/${f.enemies}e`).join(', '));
  // Part 1 asks for the second faction AT REAL STRENGTH, not merely present: variety alone let a 10-enemy cameo pass.
  const byVolume = [...r.factions].sort((a, c) => c.enemies - a.enemies);
  const second = byVolume[1];
  check(`${b}: the second faction carries ${Math.round(MIN_SECOND_FACTION_SHARE * 100)}%+ of the board`,
    !!second && second.enemies / Math.max(1, r.enemies) >= MIN_SECOND_FACTION_SHARE,
    byVolume.map((f) => `${f.faction} ${f.enemies}e ${Math.round(f.enemies / Math.max(1, r.enemies) * 100)}%`).join(', '));
  // Part 1's ratio rule, measured across the sections instead of taken on trust from the stage header comment
  if (r.ratio) {
    const s = r.secRows, shares = s.map((x) => x.risingShare);
    const risingOk = shares.every((v, i) => i === 0 || v >= shares[i - 1] - 1e-9) && shares[shares.length - 1] > shares[0];
    check(`${b}: "${r.ratio.rule}" — ${r.ratio.rising.unit} share rises across the sections`, risingOk,
      s.map((x) => `${x.id}:${x.rising}/${x.enemies} ${(x.risingShare * 100).toFixed(0)}%`).join(' '));
    if (r.ratio.falling) {
      const fall = s.map((x) => x.falling);
      const fallingOk = fall.every((v, i) => i === 0 || v <= fall[i - 1]);
      check(`${b}: "${r.ratio.rule}" — ${r.ratio.falling.unit} fall across the sections`, fallingOk,
        s.map((x) => `${x.id}:${x.falling}`).join(' '));
    }
  }
  check(`${b}: every section introduces a variant, one held for the last section`, r.secRows.every((s) => s.introduced.length > 0) && r.lateIntroduction > 0, r.secRows.map((s) => `${s.id}:+${s.introduced.length}`).join(' '));
  check(`${b}: at least two mixed-faction waves per section`, r.secRows.every((s) => s.mixed >= 2), r.secRows.map((s) => `${s.id}:${s.mixed}`).join(' '));
}
for (const m of modNames) {
  const used = rows.some((r) => r.mods.some((x) => x.mod === m));
  check(`Modifier '${m}' is used by at least one wave`, used, rows.map((r) => { const x = r.mods.find((y) => y.mod === m); return x ? `board ${r.number}: ${x.waves} spawn(s)` : null; }).filter(Boolean).join(', ') || 'unused');
}
// SPAWN_MODS[m].factions is advisory at runtime — applyMods does not police it and an unknown NAME is dropped silently
// while still counting toward the distinct-variant row above. Nothing in the game will tell you; this does.
const badMods = [];
for (const stage of STAGES) {
  for (const sec of stage.sections) for (const w of wavesOf(sec)) for (const s of spawnsOf(w)) {
    for (const m of s.mods || []) {
      const spec = SPAWN_MODS[m];
      if (!spec) { badMods.push(`${stage.id}/${sec.id}: unknown mod '${m}' on ${s.type}:${s.variant}`); continue; }
      const fac = getEnemyDef(s.type, s.variant).faction;
      if (spec.factions && !spec.factions.includes(fac)) badMods.push(`${stage.id}/${sec.id}: '${m}' on ${fac} ${s.variant} (declared for ${spec.factions.join('/')})`);
    }
  }
}
check('Every spawn modifier named by stage data exists and is legal for its faction', badMods.length === 0, badMods.join('; ') || 'all mod spawns legal');
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
