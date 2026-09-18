// Persistent player progress: which boards have been cleared, and therefore which are selectable on the
// BOARD SELECT screen (game/screens/boardselect.js). Board 1 is always open; board N opens when board N-1
// has been cleared, so a fresh save shows one plaque and one padlock.
//
// SCOPES. Progress is namespaced. Solo play uses the 'solo' scope; an online co-op session uses a scope
// derived from WHO IS PLAYING, so a pairing earns its own way up from board 1 and neither player's solo
// save is touched by a co-op clear. The key is a hash of the two players' ids, so the same two people get
// the same scope every time they play, with no accounts and no server. Clearing site data (or playing from
// another machine or browser profile) mints a new id, so that reads as a new group - unavoidable without
// accounts, and accounts would mean a backend.
//
// Storage is localStorage and EVERY access is guarded (the guarded probe lives in game/storage.js, shared
// with game/options.js): private-mode browsers, `file://` pages and storage-blocked embeds throw on read or
// write. A failure means "nothing cleared yet" and the game stays fully playable on board 1 - progress is a
// convenience, never a prerequisite.
//
// Session unlocks (allowSession / unlockAllForSession) open a board for this page load only and are never
// written back, so `?stage=2` and `?unlockall=1` links keep working without silently rewriting a save.
// They are deliberately scope-independent: a link is a key to a board, whoever is playing.
import { STAGES } from '../content/stage/index.ts';
import { store } from './storage.ts';
import type { StageData } from './stage.ts';

const KEY = 'aetherAndBrass.progress.v1';
const ID_KEY = 'aetherAndBrass.playerId.v1';
/** The scope used when not in an online session. */
export const SOLO_SCOPE = 'solo';

/** One cleared board. There is no record for a board that has never been cleared, so `cleared` is always true. */
export interface BoardRecord {
  cleared: true;
  /** Best score across every clear of this board in this scope. */
  score: number;
  /** The rank that best score earned; '' when the save carried none. */
  rank: string;
}

/** One scope's cleared boards, by stage id. */
export type BoardRecords = Record<string, BoardRecord>;

/**
 * A board record as it comes off disk. Every field is `unknown` because that is the honest type of anything
 * `JSON.parse` produced — checking each one back into a `BoardRecord` is precisely what `sanitise` is.
 */
export interface SavedBoard {
  cleared?: unknown;
  score?: unknown;
  rank?: unknown;
}

/** The save file as it comes off disk. `boards` at the top level is the v1 shape, read as solo (see `loadAll`). */
interface SavedProgress {
  version?: number;
  scopes?: Record<string, { boards?: Record<string, SavedBoard> }>;
  boards?: Record<string, SavedBoard>;
}

/** { [scopeKey]: { [stageId]: { cleared: true, score, rank } } }, read once per page load. */
let scopes: Record<string, BoardRecords> | null = null;
/** Which scope reads and writes currently address. */
let active = SOLO_SCOPE;
/** This install's player id, cached after the first read. */
let myId = '';
/** Stage indices opened for this page load by a URL param. Not scoped: a link is a key, whoever plays. */
const sessionOpen = new Set<number>();
/** Stage indices opened for this page load WITHIN one scope, e.g. the board a co-op host chose. */
const scopedOpen = new Map<string, Set<number>>();
let sessionOpenAll = false;

/**
 * One board of the campaign. `StageData` (game/stage.ts) is the declared shape, and it is what every consumer of a
 * board handed back from here already declares its own field as (screens/results.ts `unlocked`), so it is the
 * contract this module publishes.
 *
 * The two returns below assert into it. The authored boards in content/stage/*.ts are NOT yet assignable to
 * `StageData` — an authored row widens several literal unions to `string` (a hazard's `type` is the one tsc names
 * first) — but that is a gap in the CONTENT layer's typing, not in this one, and it closes when content/stage
 * joins the checked set. Asserting here rather than loosening the contract keeps the gap in one named place.
 */
export type Board = StageData;

/** Keep only entries for boards that still exist, so a removed stage cannot unlock its neighbour. */
function sanitise(boards: Record<string, SavedBoard> | null | undefined): BoardRecords {
  const out: BoardRecords = {};
  if (!boards || typeof boards !== 'object') return out;
  for (const stage of STAGES) {
    const r = boards[stage.id];
    if (r && r.cleared) out[stage.id] = { cleared: true, score: Number(r.score) || 0, rank: typeof r.rank === 'string' ? r.rank : '' };
  }
  return out;
}

/** Read the save once per page load; a missing, unreadable or malformed save reads as empty. */
function loadAll(): Record<string, BoardRecords> {
  if (scopes) return scopes;
  scopes = {};
  const s = store(KEY);
  if (!s) return scopes;
  try {
    const parsed: SavedProgress = JSON.parse(s.getItem(KEY) || '{}');
    if (parsed && parsed.scopes && typeof parsed.scopes === 'object') {
      for (const [key, rec] of Object.entries(parsed.scopes)) scopes[key] = sanitise(rec && rec.boards);
    } else if (parsed && parsed.boards) {
      scopes[SOLO_SCOPE] = sanitise(parsed.boards);   // v1 save: everything recorded so far was solo
    }
  } catch (e) { scopes = {}; }
  return scopes;
}

/** Records for the active scope, created on demand. */
function load(): BoardRecords {
  const all = loadAll();
  if (!all[active]) all[active] = {};
  return all[active];
}

function persist(): boolean {
  const s = store(KEY);
  if (!s) return false;
  const out: Record<string, { boards: BoardRecords }> = {};
  for (const [key, boards] of Object.entries(loadAll())) out[key] = { boards };
  try { s.setItem(KEY, JSON.stringify({ version: 2, scopes: out })); return true; } catch (e) { return false; }
}

/** FNV-1a over a string, as 8 lowercase hex digits. Short enough to read in a save file. */
function hash(str: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export const progress = {
  /**
   * This install's stable player id, minted on first use. Used only to name a co-op scope; it is never
   * sent anywhere except to the peer you are playing with. When storage is unavailable the id is
   * per-page-load, so the group simply will not be remembered.
   */
  playerId(): string {
    if (myId) return myId;
    const s = store(KEY);
    try {
      const existing = s && s.getItem(ID_KEY);
      if (existing) { myId = existing; return myId; }
    } catch (e) { /* fall through and mint one */ }
    const buf = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf);
    else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
    myId = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    try { if (s) s.setItem(ID_KEY, myId); } catch (e) { /* ephemeral id for this page load */ }
    return myId;
  },

  /** The scope a party of player ids shares, whoever hosts and whatever order they arrived in. */
  groupScope(...ids: Array<string | string[]>): string { return 'g:' + hash(ids.flat().map((v) => String(v || '')).sort().join('|')); },

  /** Which scope is being read and written ('solo', or 'g:...' during an online session). */
  get scope(): string { return active; },
  /** True while a co-op group's progress is the active scope. */
  get isGroup(): boolean { return active !== SOLO_SCOPE; },
  /** Point reads and writes at a scope. Pass nothing to go back to solo. */
  setScope(key?: string | null): void { active = key || SOLO_SCOPE; },

  /**
   * Run `fn` with `scope` active, restoring the scope that was active before it either way.
   *
   * A co-op clear is recorded through this. The results plaque is built AFTER the match screen has
   * left the stack, and leaving it is what releases the session's grip on the group's progress, so
   * the scope the run was played in has to be handed to the plaque explicitly rather than read off
   * whatever is active by the time it is drawn.
   * @param scope a scope key, or '' / null to just run `fn` where it is
   */
  inScope<T>(scope: string | null | undefined, fn: () => T): T {
    if (!scope || scope === active) return fn();
    const prev = active;
    active = scope;
    try { return fn(); } finally { active = prev; }
  },

  /** Record for a cleared board in the active scope, or null. `{ cleared: true, score, rank }` */
  record(stageId: string): BoardRecord | null { return load()[stageId] || null; },
  /** True when this board has been cleared at least once in the active scope. */
  isCleared(stageId: string): boolean { return !!load()[stageId]; },
  /**
   * True when the board at this index can be picked: board 0 always, later boards once their predecessor is
   * cleared IN THE ACTIVE SCOPE, plus any board opened for this session by a URL param.
   * @param index 0-based index into STAGES
   */
  isUnlocked(index: number): boolean {
    if (index <= 0) return true;
    if (sessionOpenAll || sessionOpen.has(index)) return true;
    const scoped = scopedOpen.get(active);
    if (scoped && scoped.has(index)) return true;
    const prev = STAGES[index - 1];
    return !!(prev && this.isCleared(prev.id));
  },
  /** The board whose clear opens the one at `index` (null for board 1 and for anything already open). */
  requirementFor(index: number): Board | null { return index > 0 && !this.isUnlocked(index) ? (STAGES[index - 1] as Board) || null : null; },
  /** How many boards are currently selectable in the active scope. */
  unlockedCount(): number { return STAGES.reduce((n, _, i) => n + (this.isUnlocked(i) ? 1 : 0), 0); },
  /**
   * Mark a board cleared in the ACTIVE SCOPE and keep the best score / rank. Returns the board this clear
   * opened, or null when it opened nothing (already cleared, or it was the last board). A co-op clear
   * therefore advances the group and leaves both players' solo saves untouched.
   */
  markCleared(stageId: string, run: { score?: number; rank?: string } = {}): Board | null {
    const all = load();
    const index = STAGES.findIndex((s) => s.id === stageId);
    if (index < 0) return null;
    const wasCleared = !!all[stageId];
    const prev = all[stageId] || { cleared: true, score: 0, rank: '' };
    const score = Number(run.score) || 0;
    all[stageId] = { cleared: true, score: Math.max(prev.score, score), rank: score >= prev.score && run.rank ? run.rank : prev.rank };
    persist();
    const next = STAGES[index + 1];
    // "newly unlocked" is about the board this clear opened, so a repeat clear of the same board opens nothing
    return !wasCleared && next ? next as Board : null;
  },
  /**
   * Open one board for this page load only (never saved).
   * @param index 0-based index into STAGES
   * @param scope when given, the board opens only while that scope is active. A co-op host's
   *   board choice uses this so it cannot show up as unlocked on the guest's own solo BOARD SELECT;
   *   `?stage=N` passes no scope, because a link is a key whoever is playing.
   */
  allowSession(index: number, scope?: string | null): void {
    if (index <= 0) return;
    if (!scope) { sessionOpen.add(index); return; }
    if (!scopedOpen.has(scope)) scopedOpen.set(scope, new Set());
    scopedOpen.get(scope).add(index);
  },
  /** Open every board for this page load only (never saved). Used by `?unlockall=1`. */
  unlockAllForSession(): void { sessionOpenAll = true; },
  /** Forget all progress in EVERY scope, in memory and on disk. */
  reset(): void {
    scopes = {};
    active = SOLO_SCOPE;
    sessionOpen.clear(); scopedOpen.clear(); sessionOpenAll = false;
    const s = store(KEY);
    try { if (s) s.removeItem(KEY); } catch (e) { /* nothing to clean up */ }
  },
};
