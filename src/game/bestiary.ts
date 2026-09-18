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
import { STAGES } from '../content/stage/index.ts';
import { ENEMY_LIST, getEnemyDef, resolveType } from '../content/enemies/index.ts';
import { CODEX } from '../content/enemies/codex.ts';
import { store } from './storage.ts';
import { progress } from './progress.ts';

const KEY = 'aetherAndBrass.bestiary.v1';

/** One faction tab. */
export interface BestiaryFaction { id: string; name: string; }

/**
 * One codex block. Derived from content/enemies/codex.ts's own table rather than written out again: that file is
 * the authority on the three fields, and deriving means the two can never drift.
 */
export type CodexBlock = (typeof CODEX)[keyof typeof CODEX];

/** Where a def is first met, derived from the stage data (FIRST_SEEN). Board and section are 1-based, for display. */
export interface FirstSeen {
  board: number;
  boardName: string;
  section: number;
  sectionName: string;
}

/** One boss phase that is its own silhouette, and so gets its own block on the card. */
export interface PhaseBlock {
  /** Index into `def.phases`. */
  index: number;
  name: string;
  codex: CodexBlock | null;
  /** Rig build and animation table. `any` for the reason game/fighter.ts's `FighterDef` gives for the same two
   *  fields: content authors both wider than the vendored library declares them. */
  build: any;
  anims: any;
}

/** One entry in the book: everything the screen draws a card from. */
export interface BestiaryEntry {
  id: string;
  type: string;
  variant: string;
  name: string;
  subtitle: string;
  /** One of FACTIONS' ids; every boss and mid-boss is filed under `boss`. */
  faction: string;
  role: string;
  boss: boolean;
  codex: CodexBlock | null;
  /** Null for a def the campaign never spawns, which is what leaves an entry with no hunt hint. */
  firstSeen: FirstSeen | null;
  /** See `PhaseBlock.build`. */
  build: any;
  anims: any;
  /** Empty for everything that is not a boss. */
  phases: PhaseBlock[];
}

/** One enemy's tally in one scope's book. */
export interface BestiaryStats {
  /** Times defeated. */
  n: number;
  /** Of those defeats, how many were a throw kill and how many went over an edge. */
  thrown: number;
  ring: number;
  /** Defeats per hero name, so the book can name who has killed the most. */
  by: Record<string, number>;
  /** Boss phases REACHED, indexed by phase number — written even when the boss was never beaten (markPhase). */
  phases: boolean[];
}

/** One scope's book: stats by def id. */
export type BestiaryRecords = Record<string, BestiaryStats>;

/**
 * A record as it comes off disk. Every field is `unknown` because that is the honest type of anything
 * `JSON.parse` produced — checking each one back into a `BestiaryStats` is precisely what `sanitiseRecords` is.
 */
export interface SavedStats {
  n?: unknown;
  thrown?: unknown;
  ring?: unknown;
  by?: unknown;
  phases?: unknown;
}

/** `{ seen, total, pct }` for the whole book in the active scope. */
export interface BestiaryCompletion { seen: number; total: number; pct: number; }

/** What `record` takes beside the def: how the kill happened, and which phase it was on. */
export interface RecordOpts {
  thrown?: boolean;
  ringOut?: boolean;
  hero?: string;
  phase?: number;
}

/** One spawn entry as this file reads one: only the two fields that name a def. */
export interface SpawnRef { type?: string; variant?: string; }

// The four rows below carry far more than the one or two fields named on each — game/stage.ts declares the
// authored shapes (`WaveSpec`, `PropSpec`, `EventAction`, `StageEvent`) in full, and this module walks the CONTENT
// rather than the runner, so it is declared structurally here for the reason game/entity.ts gives for
// `EntityWorld`. The index signature on each is deliberate and load-bearing: without it every one of these is a
// WEAK type (all members optional), and a row carrying none of the named fields — an event action that is a
// `sign`, a prop with no cargo — would be rejected for having no property in common.

/** One wave, or one of its reinforcement rows. */
export interface WaveSource { spawns?: SpawnRef[]; reinforcements?: WaveSource[]; [key: string]: unknown; }

/** One placed prop: a container's cargo, and the single unit it lets out when it breaks. */
export interface PropSource { cargo?: SpawnRef[]; release?: SpawnRef | null; [key: string]: unknown; }

/** One event action. Only a `spawn` names units; every other action in the table is skipped. */
export interface ActionSource { spawn?: SpawnRef | SpawnRef[]; [key: string]: unknown; }

/** One scripted event. */
export interface EventSource { actions?: ActionSource[]; [key: string]: unknown; }

/**
 * The spawn sources `visitSectionSpawns` walks in one section. All of them, because a variant whose only
 * appearance is inside a crate still appears. game/stage.ts's `StageSection` is the authored shape and satisfies
 * this.
 */
export interface SectionSpawnSources {
  name?: string;
  waves?: WaveSource[];
  timedWaves?: WaveSource[];
  props?: PropSource[];
  events?: EventSource[];
  [key: string]: unknown;
}

/** The save file as it comes off disk — the shape `loadAll` expects and `sanitiseRecords` then checks field by field. */
interface SavedBook {
  version?: number;
  scopes?: Record<string, Record<string, SavedStats>>;
}

/** Tab order on the screen. `boss` is the catch-all for every mid-boss and final boss. */
export const FACTIONS: readonly BestiaryFaction[] = Object.freeze([
  { id: 'brassbound', name: 'BRASSBOUND' },
  { id: 'sootborn', name: 'SOOTBORN' },
  { id: 'stormcrow', name: 'STORMCROWS' },
  { id: 'chandler', name: 'CHANDLERY' },
  { id: 'gleaning', name: 'GLEANING' },
  { id: 'boss', name: 'BOSSES' },
]);

/** An empty stat record. `by` tallies defeats per hero name, so the book can name who has killed the most. */
const blank = (): BestiaryStats => ({ n: 0, thrown: 0, ring: 0, by: {}, phases: [] });

// ---------------------------------------------------------------- first appearance, derived from the stage data
/**
 * Walk every spawn source in one section and hand each `type:variant` to `visit`.
 * The sources are all of them, because a variant whose only appearance is inside a crate still appears:
 * waves, their reinforcements, a locked section's timed waves, prop cargo / release, and event `spawn` actions.
 */
function visitSectionSpawns(section: SectionSpawnSources, visit: (id: string) => void): void {
  const spawn = (s?: SpawnRef | null) => { if (s && s.type) visit(`${resolveType(s.type)}:${String(s.variant || '').toLowerCase()}`); };
  const list = (arr?: SpawnRef[]) => { for (const s of arr || []) spawn(s); };
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
const FIRST_SEEN: Record<string, FirstSeen> = (() => {
  const out: Record<string, FirstSeen> = {};
  STAGES.forEach((stage, si) => {
    const sections = stage.sections || [];
    const note = (id: string, sec: SectionSpawnSources | undefined, i: number) => {
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
function phaseBlocks(def): PhaseBlock[] {
  const out: PhaseBlock[] = [];
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
export const ENTRIES: BestiaryEntry[] = (() => {
  const out: BestiaryEntry[] = [];
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
export function entriesOf(faction: string): BestiaryEntry[] { return ENTRIES.filter((e) => e.faction === faction); }

const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));
/** The book entry for a def id, or null. */
export function entryOf(id: string): BestiaryEntry | null { return BY_ID.get(id) || null; }

// ---------------------------------------------------------------- the save
/** `{ [scope]: { [defId]: stats } }`, read once per page load. */
let scopes: Record<string, BestiaryRecords> | null = null;
let dirty = false;

/**
 * Drop anything that is not a number, and any entry for a def that no longer exists. This is the whole of what a
 * saved book has to survive, so it is exported and asserted directly by `tools/simtest.js` rather than only through
 * a round trip that would need a browser to write the save in the first place.
 */
export function sanitiseRecords(rec: Record<string, SavedStats> | null | undefined): BestiaryRecords {
  const out: BestiaryRecords = {};
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

function loadAll(): Record<string, BestiaryRecords> {
  if (scopes) return scopes;
  scopes = {};
  const s = store(KEY);
  if (!s) return scopes;
  try {
    const parsed: SavedBook = JSON.parse(s.getItem(KEY) || '{}');
    if (parsed && parsed.scopes && typeof parsed.scopes === 'object') {
      for (const [key, rec] of Object.entries(parsed.scopes)) scopes[key] = sanitiseRecords(rec);
    }
  } catch (e) { scopes = {}; }
  return scopes;
}

/** Records for the scope board progress is currently using, created on demand. */
function book(): BestiaryRecords {
  const all = loadAll();
  const key = progress.scope;
  if (!all[key]) all[key] = {};
  return all[key];
}

export const bestiary = {
  /** The scope this book is being read and written under — always the one game/progress.js is using. */
  get scope(): string { return progress.scope; },

  /** Stats for a def id in the active scope (a zeroed record when it has never been beaten). */
  stats(id: string): BestiaryStats { return book()[id] || blank(); },
  /** True once this enemy has been defeated at least once in the active scope. */
  isSeen(id: string): boolean { const r = book()[id]; return !!(r && r.n > 0); },
  /** True once this boss PHASE has been reached, which is what gates the person-inside reveal on the screen. */
  phaseSeen(id: string, index: number): boolean { const r = book()[id]; return !!(r && r.phases && r.phases[index]); },
  /** The hero who has beaten this enemy most often, or '' when it has never been beaten. */
  topHero(id: string): string {
    const r = book()[id];
    if (!r) return '';
    let best = '', n = 0;
    for (const [hero, v] of Object.entries(r.by)) if (v > n || (v === n && hero < best)) { best = hero; n = v; }
    return best;
  },
  /** `{ seen, total, pct }` for the whole book in the active scope. */
  completion(): BestiaryCompletion {
    const rec = book();
    let seen = 0;
    for (const e of ENTRIES) if (rec[e.id] && rec[e.id].n > 0) seen++;
    return { seen, total: ENTRIES.length, pct: ENTRIES.length ? Math.floor((seen / ENTRIES.length) * 100) : 0 };
  },
  /** True when every variant and boss has been entered. */
  get complete(): boolean { const c = this.completion(); return c.total > 0 && c.seen === c.total; },

  /**
   * Record one defeat. Memory only: call flush() to persist.
   * @param def the defeated enemy's def (or anything carrying its `id`)
   * @returns true when this was the FIRST time this enemy has been beaten in the active scope, which is
   *   what the HUD's NEW ENTRY plate and the results screen's new-entry list are driven from.
   */
  record(def: { id?: string } | null, o: RecordOpts = {}): boolean {
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
  markPhase(def: { id?: string } | null, index: number): void {
    const id = def && def.id;
    if (!id || !BY_ID.has(id) || !(index >= 0)) return;
    const rec = book();
    const s = rec[id] || (rec[id] = blank());
    if (s.phases[index]) return;
    s.phases[index] = true;
    dirty = true;
  },

  /** Write the book if anything has changed. Safe to call often; a storage failure is silent and harmless. */
  flush(): boolean {
    if (!dirty) return false;
    const s = store(KEY);
    if (!s) { dirty = false; return false; }
    try { s.setItem(KEY, JSON.stringify({ version: 1, scopes: loadAll() })); dirty = false; return true; }
    catch (e) { dirty = false; return false; }
  },

  /** Forget the whole book, in every scope, in memory and on disk. */
  reset(): void {
    scopes = {}; dirty = false;
    const s = store(KEY);
    try { if (s) s.removeItem(KEY); } catch (e) { /* nothing to clean up */ }
  },
};
