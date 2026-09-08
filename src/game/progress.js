// Persistent player progress: which boards have been cleared, and therefore which are selectable on the
// BOARD SELECT screen (game/screens/boardselect.js). Board 1 is always open; board N opens when board N-1
// has been cleared, so a fresh save shows one plaque and one padlock.
//
// Storage is localStorage and EVERY access is guarded: private-mode browsers, `file://` pages and
// storage-blocked embeds throw on read or write. A failure means "nothing cleared yet" and the game stays
// fully playable on board 1 - progress is a convenience, never a prerequisite.
//
// Session unlocks (allowSession / unlockAllForSession) open a board for this page load only and are never
// written back, so `?stage=2` and `?unlockall=1` links keep working without silently rewriting a save.
import { STAGES } from '../content/stage/index.js';

const KEY = 'aetherAndBrass.progress.v1';

/** Cleared-board records, keyed by stage id: { cleared: true, score, rank }. */
let records = null;
/** Stage indices opened for this session only (URL params). */
const sessionOpen = new Set();
let sessionOpenAll = false;

/** localStorage or null when it is unavailable / throws (private mode, file://, blocked embeds). */
function store() {
  try {
    const s = window.localStorage;
    if (!s) return null;
    const probe = KEY + '.probe';
    s.setItem(probe, '1'); s.removeItem(probe); // Safari private mode only throws on write
    return s;
  } catch (e) { return null; }
}

/** Read the save once per page load; a missing, unreadable or malformed save reads as empty. */
function load() {
  if (records) return records;
  records = {};
  const s = store();
  if (!s) return records;
  try {
    const parsed = JSON.parse(s.getItem(KEY) || '{}');
    const boards = parsed && typeof parsed === 'object' ? parsed.boards : null;
    if (boards && typeof boards === 'object') {
      // only keep entries for boards that still exist, so a removed stage cannot unlock its neighbour
      for (const stage of STAGES) {
        const r = boards[stage.id];
        if (r && r.cleared) records[stage.id] = { cleared: true, score: Number(r.score) || 0, rank: typeof r.rank === 'string' ? r.rank : '' };
      }
    }
  } catch (e) { records = {}; }
  return records;
}

function persist() {
  const s = store();
  if (!s) return false;
  try { s.setItem(KEY, JSON.stringify({ version: 1, boards: records })); return true; } catch (e) { return false; }
}

export const progress = {
  /** Record for a cleared board, or null. `{ cleared: true, score, rank }` */
  record(stageId) { return load()[stageId] || null; },
  /** True when this board has been cleared at least once. */
  isCleared(stageId) { return !!load()[stageId]; },
  /**
   * True when the board at this index can be picked: board 0 always, later boards once their predecessor is
   * cleared, plus any board opened for this session by a URL param.
   * @param {number} index 0-based index into STAGES
   */
  isUnlocked(index) {
    if (index <= 0) return true;
    if (sessionOpenAll || sessionOpen.has(index)) return true;
    const prev = STAGES[index - 1];
    return !!(prev && this.isCleared(prev.id));
  },
  /** The board whose clear opens the one at `index` (null for board 1 and for anything already open). */
  requirementFor(index) { return index > 0 && !this.isUnlocked(index) ? STAGES[index - 1] || null : null; },
  /** How many boards are currently selectable. */
  unlockedCount() { return STAGES.reduce((n, _, i) => n + (this.isUnlocked(i) ? 1 : 0), 0); },
  /**
   * Mark a board cleared and keep the best score / rank. Returns the board this clear opened, or null when
   * it opened nothing (already cleared, or it was the last board).
   * @param {string} stageId
   * @param {{score?: number, rank?: string}} run
   */
  markCleared(stageId, run = {}) {
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
    return !wasCleared && next ? next : null;
  },
  /** Open one board for this page load only (never saved). Used by `?stage=N` so a direct link still works. */
  allowSession(index) { if (index > 0) sessionOpen.add(index); },
  /** Open every board for this page load only (never saved). Used by `?unlockall=1`. */
  unlockAllForSession() { sessionOpenAll = true; },
  /** Forget all progress, in memory and on disk. */
  reset() {
    records = {};
    sessionOpen.clear(); sessionOpenAll = false;
    const s = store();
    try { if (s) s.removeItem(KEY); } catch (e) { /* nothing to clean up */ }
  },
};
