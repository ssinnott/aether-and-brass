// The BESTIARY (issue #26): which enemies and bosses the player has beaten, how many of each, and how.
//
// One entry per registered enemy variant and one per boss (content/enemies/index.js ENEMY_LIST), unlocked on first
// defeat. Until then it is not shown at all: screens/bestiary.js draws a card only for an entry `isSeen()` is true
// for, so the book is a record of what the player has actually killed rather than a checklist of what they have
// not. The counts here (completion(), and the per-faction totals the screen adds up) are what answer "how many are
// left" without naming them.
//
// SCOPES. Counts are namespaced exactly as board progress is, and by the SAME key: this module reads
// `progress.scope` rather than keeping a scope of its own, so a co-op pairing's kills can never leak into either
// player's solo book and the two saves can never disagree about who is playing. Setting the scope is progress.js's
// job (game/progress.js setScope, called by the netplay session); there is deliberately no setter here.
//
// STORAGE is localStorage under its own key, and every access is guarded through game/storage.js: private-mode
// browsers, `file://` pages and storage-blocked embeds throw on read or write. A failure means "nothing recorded
// yet" and the game plays exactly as before — the book is a keepsake, never a prerequisite, and never gates a board.
//
// WRITES ARE BATCHED. record() only touches memory; flush() is what serialises. A busy wave kills a dozen enemies
// inside a second and JSON.stringify-ing the whole book on each of them would be a stutter in the middle of a fight,
// so the gameplay screen flushes once at the results plaque and once more on the way out of the match (any exit:
// quit to title, game over, a reset), which between them cover every way a run can end.
//
// DETERMINISM. Nothing here is simulation. record() is called from the same places the score is credited, reads
// only fields the sim has already settled, and writes to a module-level object that no sim code reads back; it is
// never hashed by net/checksum.js and never consumes the `rng` singleton. A peer with a different book plays an
// identical match.
import { STAGES } from '../content/stage/index.js';
import { ENEMY_LIST, getEnemyDef, resolveType } from '../content/enemies/index.js';
import { CODEX } from '../content/enemies/codex.js';
import { store } from './storage.js';
import { progress } from './progress.js';

const KEY = 'aetherAndBrass.bestiary.v1';

/** Tab order on the screen. `boss` is the catch-all for every mid-boss and final boss. */
export const FACTIONS = Object.freeze([
  { id: 'brassbound', name: 'BRASSBOUND' },
  { id: 'sootborn', name: 'SOOTBORN' },
  { id: 'stormcrow', name: 'STORMCROWS' },
  { id: 'chandler', name: 'CHANDLERY' },
  { id: 'gleaning', name: 'GLEANING' },
  { id: 'boss', name: 'BOSSES' },
]);

/** An empty stat record. `by` tallies defeats per hero name, so the book can name who has killed the most. */
const blank = () => ({ n: 0, thrown: 0, ring: 0, by: {}, phases: [] });

// ---------------------------------------------------------------- first appearance, derived from the stage data
/**
 * Walk every spawn source in one section and hand each `type:variant` to `visit`.
 * The sources are all of them, because a variant whose only appearance is inside a crate still appears:
 * waves, their reinforcements, a locked section's timed waves, prop cargo / release, and event `spawn` actions.
 */
function visitSectionSpawns(section, visit) {
  const spawn = (s) => { if (s && s.type) visit(`${resolveType(s.type)}:${String(s.variant || '').toLowerCase()}`); };
  const list = (arr) => { for (const s of arr || []) spawn(s); };
  for (const w of section.waves || []) {
    list(w.spawns);
    for (const r of w.reinforcements || []) list(r.spawns);
  }
  for (const w of section.timedWaves || []) list(w.spawns);
  for (const p of section.props || []) { list(p.cargo); spawn(p.release); }
  for (const ev of section.events || []) {
    for (const a of ev.actions || []) { if (!a || !a.spawn) continue; list(Array.isArray(a.spawn) ? a.spawn : [a.spawn]); }
  }
}

/**
 * `{ [defId]: { board, boardName, section, sectionName } }` for every enemy the campaign actually spawns, board
 * order first. Derived rather than authored: a hand-written "board 2, section 1" note in the codex would go stale
 * the first time a wave was re-cut, and the hunt hint on a locked entry is only worth showing if it is true.
 * Built once at module load — the stage data is static.
 */
const FIRST_SEEN = (() => {
  const out = {};
  STAGES.forEach((stage, si) => {
    const sections = stage.sections || [];
    const note = (id, sec, i) => {
      if (!id || out[id]) return;   // first appearance only: board order, then section order
      out[id] = { board: si + 1, boardName: stage.name, section: i + 1, sectionName: sec ? sec.name : '' };
    };
    sections.forEach((sec, i) => visitSectionSpawns(sec, (id) => note(id, sec, i)));
    // Bosses are placed by x rather than spawned by a wave, so they are matched to the section they stand in.
    for (const key of ['midboss', 'boss']) {
      const b = stage[key];
      if (!b || !b.def) continue;
      const i = Math.max(0, sections.findIndex((s) => b.atX >= s.x0 && b.atX <= s.x1));
      const def = getEnemyDef(b.def);
      if (def) note(def.id, sections[i], i);
    }
  });
  return out;
})();

// ---------------------------------------------------------------- the entries
/** Boss defs carry `phases`; a phase with its own build or anims is a separate silhouette and gets its own block. */
function phaseBlocks(def) {
  const out = [];
  const phases = def.phases || [];
  for (let i = 1; i < phases.length; i++) {
    const p = phases[i];
    if (!p || (!p.build && !p.anims)) continue;   // e.g. the Hoister's OVERHEAT: the same rig, angrier
    const codex = CODEX[`${def.id}#${i}`] || null;
    out.push({ index: i, name: p.name || `PHASE ${i + 1}`, codex, build: p.build || def.build, anims: p.anims || def.anims });
  }
  return out;
}

/**
 * Every book entry, in tab order then registry order.
 * `{ id, type, variant, name, faction, role, boss, codex, firstSeen, build, anims, phases }`
 */
export const ENTRIES = (() => {
  const out = [];
  for (const e of ENEMY_LIST) {
    const def = getEnemyDef(e.type, e.variant);
    if (!def) continue;
    const boss = !!def.boss || e.role === 'boss';
    out.push({
      id: def.id, type: def.type, variant: def.variant, name: def.name, subtitle: def.subtitle || '',
      faction: boss ? 'boss' : (def.faction || def.type), role: def.role || 'fodder', boss,
      codex: def.codex || CODEX[def.id] || null,
      firstSeen: FIRST_SEEN[def.id] || null,
      build: def.build, anims: def.anims,
      phases: boss ? phaseBlocks(def) : [],
    });
  }
  const order = FACTIONS.map((f) => f.id);
  return out.sort((a, b) => order.indexOf(a.faction) - order.indexOf(b.faction));
})();

/** Entries belonging to one faction tab, in registry order. */
export function entriesOf(faction) { return ENTRIES.filter((e) => e.faction === faction); }

const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));
/** The book entry for a def id, or null. */
export function entryOf(id) { return BY_ID.get(id) || null; }

// ---------------------------------------------------------------- the save
/** `{ [scope]: { [defId]: stats } }`, read once per page load. */
let scopes = null;
let dirty = false;

/**
 * Drop anything that is not a number, and any entry for a def that no longer exists. This is the whole of what a
 * saved book has to survive, so it is exported and asserted directly by `tools/simtest.js` rather than only through
 * a round trip that would need a browser to write the save in the first place.
 */
export function sanitiseRecords(rec) {
  const out = {};
  if (!rec || typeof rec !== 'object') return out;
  for (const [id, r] of Object.entries(rec)) {
    if (!BY_ID.has(id) || !r || typeof r !== 'object') continue;
    const s = blank();
    s.n = Math.max(0, Number(r.n) || 0);
    s.thrown = Math.max(0, Number(r.thrown) || 0);
    s.ring = Math.max(0, Number(r.ring) || 0);
    if (r.by && typeof r.by === 'object') for (const [hero, n] of Object.entries(r.by)) { const v = Number(n) || 0; if (v > 0) s.by[String(hero)] = v; }
    if (Array.isArray(r.phases)) s.phases = r.phases.map((v) => !!v);
    // Keep a record that carries ONLY phase marks: markPhase() writes one for a boss whose phase was reached but
    // which was never beaten, and dropping it here would silently throw away something deliberately recorded.
    if (s.n > 0 || s.phases.some(Boolean)) out[id] = s;
  }
  return out;
}

function loadAll() {
  if (scopes) return scopes;
  scopes = {};
  const s = store(KEY);
  if (!s) return scopes;
  try {
    const parsed = JSON.parse(s.getItem(KEY) || '{}');
    if (parsed && parsed.scopes && typeof parsed.scopes === 'object') {
      for (const [key, rec] of Object.entries(parsed.scopes)) scopes[key] = sanitiseRecords(rec);
    }
  } catch (e) { scopes = {}; }
  return scopes;
}

/** Records for the scope board progress is currently using, created on demand. */
function book() {
  const all = loadAll();
  const key = progress.scope;
  if (!all[key]) all[key] = {};
  return all[key];
}

export const bestiary = {
  /** The scope this book is being read and written under — always the one game/progress.js is using. */
  get scope() { return progress.scope; },

  /** Stats for a def id in the active scope (a zeroed record when it has never been beaten). */
  stats(id) { return book()[id] || blank(); },
  /** True once this enemy has been defeated at least once in the active scope. */
  isSeen(id) { const r = book()[id]; return !!(r && r.n > 0); },
  /** True once this boss PHASE has been reached, which is what gates the person-inside reveal on the screen. */
  phaseSeen(id, index) { const r = book()[id]; return !!(r && r.phases && r.phases[index]); },
  /** The hero who has beaten this enemy most often, or '' when it has never been beaten. */
  topHero(id) {
    const r = book()[id];
    if (!r) return '';
    let best = '', n = 0;
    for (const [hero, v] of Object.entries(r.by)) if (v > n || (v === n && hero < best)) { best = hero; n = v; }
    return best;
  },
  /** `{ seen, total, pct }` for the whole book in the active scope. */
  completion() {
    const rec = book();
    let seen = 0;
    for (const e of ENTRIES) if (rec[e.id] && rec[e.id].n > 0) seen++;
    return { seen, total: ENTRIES.length, pct: ENTRIES.length ? Math.floor((seen / ENTRIES.length) * 100) : 0 };
  },
  /** True when every variant and boss has been entered. */
  get complete() { const c = this.completion(); return c.total > 0 && c.seen === c.total; },

  /**
   * Record one defeat. Memory only: call flush() to persist.
   * @param {object} def the defeated enemy's def (or anything carrying its `id`)
   * @param {{ thrown?: boolean, ringOut?: boolean, hero?: string, phase?: number }} [o]
   * @returns {boolean} true when this was the FIRST time this enemy has been beaten in the active scope, which is
   *   what the HUD's NEW ENTRY plate and the results screen's new-entry list are driven from.
   */
  record(def, o = {}) {
    const id = def && def.id;
    if (!id || !BY_ID.has(id)) return false;
    const rec = book();
    const fresh = !rec[id] || rec[id].n === 0;
    const s = rec[id] || (rec[id] = blank());
    s.n++;
    if (o.thrown) s.thrown++;
    if (o.ringOut) s.ring++;
    if (o.hero) s.by[o.hero] = (s.by[o.hero] || 0) + 1;
    if (o.phase != null && o.phase >= 0) s.phases[o.phase] = true;
    dirty = true;
    return fresh;
  },

  /**
   * Note that a boss phase has been REACHED, whether or not the boss is beaten. The screen shows a phase's codex
   * block only once this has happened, so the person inside the machine is not spoiled by the card.
   */
  markPhase(def, index) {
    const id = def && def.id;
    if (!id || !BY_ID.has(id) || !(index >= 0)) return;
    const rec = book();
    const s = rec[id] || (rec[id] = blank());
    if (s.phases[index]) return;
    s.phases[index] = true;
    dirty = true;
  },

  /** Write the book if anything has changed. Safe to call often; a storage failure is silent and harmless. */
  flush() {
    if (!dirty) return false;
    const s = store(KEY);
    if (!s) { dirty = false; return false; }
    try { s.setItem(KEY, JSON.stringify({ version: 1, scopes: loadAll() })); dirty = false; return true; }
    catch (e) { dirty = false; return false; }
  },

  /** Forget the whole book, in every scope, in memory and on disk. */
  reset() {
    scopes = {}; dirty = false;
    const s = store(KEY);
    try { if (s) s.removeItem(KEY); } catch (e) { /* nothing to clean up */ }
  },
};
