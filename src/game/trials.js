// Trial completion + trial matching (issue #22). Two independent halves:
//  (a) trialProgress: a per-hero "which trials has this install cleared" save under aetherAndBrass.trials.v1,
//      structurally the same guarded-localStorage pattern as game/progress.js's board saves (both share the
//      probe helper in game/storage.js).
//  (b) TrialRunner: matches one hero's ordered Trial.steps (content/characters/<hero>Moves.js) against new
//      entries arriving in World.log (game/world.js logEvent) as they happen. screens/training.js owns one
//      runner for whichever trial the trainpause plate / trials list has selected.
import { store } from './storage.js';

/** Storage key (also read by main.js's trialState() test hook -- import this rather than repeating the literal). */
export const TRIALS_KEY = 'aetherAndBrass.trials.v1';
const KEY = TRIALS_KEY;

/** { [heroId]: string[] } of completed trial ids, read once per page load. */
let heroes = null;

/** Read the save once; a missing, unreadable or malformed save reads as empty (progress.js's loadAll()). */
function load() {
  if (heroes) return heroes;
  heroes = {};
  const s = store(KEY);
  if (!s) return heroes;
  try {
    const parsed = JSON.parse(s.getItem(KEY) || '{}');
    if (parsed && parsed.heroes && typeof parsed.heroes === 'object') {
      for (const [id, list] of Object.entries(parsed.heroes)) heroes[id] = Array.isArray(list) ? list.filter((t) => typeof t === 'string') : [];
    }
  } catch (e) { heroes = {}; }
  return heroes;
}

function persist() {
  const s = store(KEY);
  if (!s) return false;
  try { s.setItem(KEY, JSON.stringify({ version: 1, heroes: load() })); return true; } catch (e) { return false; }
}

/** Per-hero trial completion, saved next to game/progress.js's board saves; wiped by the same `?resetprogress=1`. */
export const trialProgress = {
  /** True when this hero has completed this trial id at least once. */
  isDone(heroId, trialId) { return (load()[heroId] || []).includes(trialId); },
  /** Completed trial ids for this hero (a fresh array copy; safe for a caller to keep). */
  done(heroId) { return (load()[heroId] || []).slice(); },
  /**
   * Record a completion.
   * @returns {boolean} true when this is a NEW completion (and it was persisted); false when already done.
   */
  markDone(heroId, trialId) {
    const all = load();
    const list = all[heroId] || (all[heroId] = []);
    if (list.includes(trialId)) return false;
    list.push(trialId);
    persist();
    return true;
  },
  /** Forget every hero's trial completions, in memory and on disk (`?resetprogress=1`, alongside board progress). */
  reset() {
    heroes = {};
    const s = store(KEY);
    try { if (s) s.removeItem(KEY); } catch (e) { /* nothing to clean up */ }
  },
};

const TRIAL_WINDOW = 120;
/** Combat-log kinds that break a `strict` trial's progress when the entry is not the expected next step. */
const BREAKERS = new Set(['hit', 'projectile', 'body', 'grab', 'throw']);

function matchKind(step, kind) { const k = step.kind || 'hit'; return Array.isArray(k) ? k.includes(kind) : k === kind; }

/** @param {TrialStep} step @param {object} e one World.log entry */
function matchStep(step, e) {
  if (!matchKind(step, e.kind)) return false;
  if (step.anim) { if (Array.isArray(step.anim) ? !step.anim.includes(e.anim) : step.anim !== e.anim) return false; }
  if (step.air != null && e.air !== step.air) return false;
  if (step.type && e.type !== step.type) return false;
  return true;
}

/**
 * Matches one hero's Trial against new World.log entries as they arrive. Ordered steps; progress resets
 * after `trial.window` (default 120) frames of silence since the last matched step and, for `strict` trials
 * only, on any combo-breaking log entry (BREAKERS) that is not the expected next step — lenient by default
 * so a stray hit does not fail a grab/throw trial, strict for combos so the hits must be consecutive.
 */
export class TrialRunner {
  /**
   * @param {Trial} trial
   * @param {number} playerIndex
   * @param {import('./world.js').World} world
   */
  constructor(trial, playerIndex, world) {
    this.trial = trial; this.p = playerIndex;
    this.index = 0; this.lastFrame = -1; this.seenSeq = world.logSeq; this.done = false; this.doneFrame = -1;
  }
  reset() { this.index = 0; this.lastFrame = -1; }
  /**
   * Feed the world's log (called once per frame by screens/training.js).
   * @returns {boolean} true on the exact frame the trial completes.
   */
  update(world) {
    if (this.done) return false;
    if (this.index > 0 && world.frame - this.lastFrame > (this.trial.window || TRIAL_WINDOW)) this.reset();
    for (const e of world.log) {
      if (e.seq <= this.seenSeq) continue;
      this.seenSeq = e.seq;
      if (e.p !== this.p) continue;
      const step = this.trial.steps[this.index];
      if (matchStep(step, e)) {
        this.index++; this.lastFrame = e.frame;
        if (this.index >= this.trial.steps.length) { this.done = true; this.doneFrame = e.frame; return true; }
      } else if (this.trial.strict && BREAKERS.has(e.kind)) {
        this.reset();
        if (matchStep(this.trial.steps[0], e)) { this.index = 1; this.lastFrame = e.frame; }
      }
    }
    return false;
  }
}
