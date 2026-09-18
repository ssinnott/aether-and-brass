// Trial completion + trial matching (issue #22). Two independent halves:
//  (a) trialProgress: a per-hero "which trials has this install cleared" save under aetherAndBrass.trials.v1,
//      structurally the same guarded-localStorage pattern as game/progress.js's board saves (both share the
//      probe helper in game/storage.js).
//  (b) TrialRunner: matches one hero's ordered Trial.steps (content/characters/<hero>Moves.js) against new
//      entries arriving in World.log (game/world.js logEvent) as they happen. screens/training.js owns one
//      runner for whichever trial the trainpause plate / trials list has selected.
import { store } from './storage.ts';
import type { CombatLogEntry } from './world.ts';

/** Completed trial ids per hero id — the shape under `aetherAndBrass.trials.v1`, and what `load()` hands back. */
export type TrialsByHero = Record<string, string[]>;

/**
 * The part of game/world.ts's `World` a runner reads: the combat log and the clock it ages progress against.
 * Structural for the reason game/entity.ts gives for `EntityWorld` — a runner is handed a world, never the
 * other way round. `World` satisfies it.
 */
export interface TrialWorld {
  frame: number;
  /** The capped log of player-dealt hits (world.ts logEvent), matched in arrival order. */
  log: CombatLogEntry[];
  /** The sequence number the log is up to, so a fresh runner ignores everything already in it. */
  logSeq: number;
}

/** Storage key (also read by main.js's trialState() test hook -- import this rather than repeating the literal). */
export const TRIALS_KEY = 'aetherAndBrass.trials.v1';
const KEY = TRIALS_KEY;

/** { [heroId]: string[] } of completed trial ids, read once per page load. */
let heroes: TrialsByHero | null = null;

/** Read the save once; a missing, unreadable or malformed save reads as empty (progress.js's loadAll()). */
function load(): TrialsByHero {
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

function persist(): boolean {
  const s = store(KEY);
  if (!s) return false;
  try { s.setItem(KEY, JSON.stringify({ version: 1, heroes: load() })); return true; } catch (e) { return false; }
}

/** Per-hero trial completion, saved next to game/progress.js's board saves; wiped by the same `?resetprogress=1`. */
export const trialProgress = {
  /** True when this hero has completed this trial id at least once. */
  isDone(heroId: string, trialId: string): boolean { return (load()[heroId] || []).includes(trialId); },
  /** Completed trial ids for this hero (a fresh array copy; safe for a caller to keep). */
  done(heroId: string): string[] { return (load()[heroId] || []).slice(); },
  /**
   * Record a completion.
   * @returns true when this is a NEW completion (and it was persisted); false when already done.
   */
  markDone(heroId: string, trialId: string): boolean {
    const all = load();
    const list = all[heroId] || (all[heroId] = []);
    if (list.includes(trialId)) return false;
    list.push(trialId);
    persist();
    return true;
  },
  /** Forget every hero's trial completions, in memory and on disk (`?resetprogress=1`, alongside board progress). */
  reset(): void {
    heroes = {};
    const s = store(KEY);
    try { if (s) s.removeItem(KEY); } catch (e) { /* nothing to clean up */ }
  },
};

const TRIAL_WINDOW = 120;
/** Combat-log kinds that break a `strict` trial's progress when the entry is not the expected next step. */
const BREAKERS = new Set(['hit', 'projectile', 'body', 'grab', 'throw']);

function matchKind(step: TrialStep, kind: TrialKind): boolean { const k = step.kind || 'hit'; return Array.isArray(k) ? k.includes(kind) : k === kind; }

/** @param e one World.log entry */
function matchStep(step: TrialStep, e: CombatLogEntry): boolean {
  // `CombatLogEntry.kind` is declared `string` in game/world.ts and documented there as carrying one of
  // types/content.d.ts's `TrialKind` values, which is exactly what a step names. Types only.
  if (!matchKind(step, e.kind as TrialKind)) return false;
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
  // The fields, for the checker only, in constructor order. `declare` because these are the constructor's own
  // assignments and nothing else: a plain field declaration would emit a class field per name (es2022 defines them
  // before the constructor body runs), which is a runtime change. Same reasoning, and the same wording, as
  // game/entity.ts and game/world.ts.
  declare trial: Trial;
  /** The player slot whose log entries count (`CombatLogEntry.p`). */
  declare p: number;
  /** How many of `trial.steps` are matched so far, and the frame the last one landed on. */
  declare index: number;
  declare lastFrame: number;
  /** Everything at or below this sequence number has already been read. */
  declare seenSeq: number;
  /** Latched once the last step matches, with the frame it happened on. */
  declare done: boolean;
  declare doneFrame: number;
  constructor(trial: Trial, playerIndex: number, world: TrialWorld) {
    this.trial = trial; this.p = playerIndex;
    this.index = 0; this.lastFrame = -1; this.seenSeq = world.logSeq; this.done = false; this.doneFrame = -1;
  }
  reset(): void { this.index = 0; this.lastFrame = -1; }
  /**
   * Feed the world's log (called once per frame by screens/training.js).
   * @returns true on the exact frame the trial completes.
   */
  update(world: TrialWorld): boolean {
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
