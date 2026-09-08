// Subject collection for the art-invariant suite: turns the content registries into the flat list of rigs every
// rule runs against. A SUBJECT is { kind, id, name, def, build, anims, rig } plus the derived conveniences
// { type, variant, phase, faction, class } (see README.md).
//
// Boss phases that carry their own `build` are separate subjects (id 'boss2:kestrel#2') because each phase is a
// distinct rig with its own animation table. Phases that only re-skin the AI (no build) are not rigs and are skipped.
import { buildRig } from '../../src/art/rig.js';
import { CHARACTERS } from '../../src/content/characters/index.js';
import { BRASSBOUND, SOOTBORN, STORMCROWS, GLEANINGS, CHANDLERS, midboss, boss, midboss2, boss2 } from '../../src/content/enemies/index.js';
import { classOf } from './helpers.js';

/** Stable subject id for an enemy/boss def: always `${type}:${variant}` (the boss defs' own `id` is the short slug). */
function subjectId(def) { return `${def.type}:${def.variant}`; }

/** The four boss defs, in stage order. */
const BOSS_DEFS = [midboss, boss, midboss2, boss2];

/** Stage-1 reference factions: these DEFINE the invariants and must never report an error. */
export const REFERENCE_TYPES = Object.freeze(['brassbound', 'sootborn', 'midboss', 'boss']);
/** The known-bad control faction. A suite that does not flag it is not working. */
export const CONTROL_TYPES = Object.freeze(['stormcrow', 'midboss2', 'boss2']);

function make(kind, id, name, def, build, anims, phase) {
  const s = {
    kind, id, name: name || id, def, build: build || {}, anims: anims || {}, rig: null,
    type: def.type || (kind === 'character' ? 'hero' : ''), variant: def.variant || '', phase: phase != null ? phase : null,
    buildError: null,
  };
  try { s.rig = buildRig(s.build); } catch (e) { s.buildError = String((e && e.stack) || e); }
  s.class = classOf(s);
  s.faction = s.type;
  return s;
}

/**
 * Every rig in the game as a subject: the four playable characters, every enemy variant, each boss's base rig and
 * each boss phase that ships its own build.
 * @returns {object[]} subjects in registry order
 */
export function collectSubjects() {
  const out = [];
  for (const def of CHARACTERS) out.push(make('character', def.id, def.name, def, def.build, def.anims));
  for (const def of [...BRASSBOUND, ...SOOTBORN, ...STORMCROWS, ...GLEANINGS, ...CHANDLERS]) {
    out.push(make('enemy', subjectId(def), def.name, def, def.build, def.anims));
  }
  for (const def of BOSS_DEFS) {
    const base = subjectId(def);
    out.push(make('enemy', base, def.name, def, def.build, def.anims));
    const phases = def.phases || [];
    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i];
      if (!ph || !ph.build) continue; // an AI-only phase re-uses the base rig; it is not a separate rig
      out.push(make('boss-phase', `${base}#${i}`, ph.name || `${def.name} phase ${i}`, def, ph.build, ph.anims || def.anims, i));
    }
  }
  return out;
}

/**
 * Filter subjects by CLI selectors. A selector matches an exact id, an id prefix ('sootborn' -> every Sootborn),
 * a def type, a kind ('character' | 'enemy' | 'boss-phase') or a class ('hero' | 'boss' | ...).
 * @param {object[]} subjects
 * @param {string[]} selectors comma-split already; an empty list selects everything
 */
export function filterSubjects(subjects, selectors) {
  if (!selectors || !selectors.length) return subjects;
  const want = selectors.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  return subjects.filter((s) => {
    const id = s.id.toLowerCase();
    return want.some((w) => id === w || id.startsWith(w) || s.type === w || s.kind === w || s.class === w || s.variant === w);
  });
}

/** True for stage-1 reference content: these subjects must produce zero errors. */
export function isReference(subject) {
  return subject.kind === 'character' || REFERENCE_TYPES.includes(subject.type);
}
/** True for the known-bad control content the suite exists to flag. */
export function isControl(subject) { return CONTROL_TYPES.includes(subject.type); }
