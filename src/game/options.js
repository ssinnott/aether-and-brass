// Persisted player options: difficulty, the audio mixer, screen shake and key/gamepad bindings
// (ARCHITECTURE.md section 16). Saved under 'aetherAndBrass.options.v1' via the guarded probe in
// game/storage.js (shared with game/progress.js) - a missing / unreadable / malformed save reads as
// defaults and the game stays fully playable; persistence is a convenience, never a prerequisite.
//
// PERSISTED: difficulty, music/sfx volume steps, screen shake level, key/gamepad bindings (input.js).
// SESSION-ONLY, NEVER WRITTEN BACK: mute (a persisted mute is a silent-game trap) and the `?difficulty=`
// URL override held in `sessionDifficulty` here, exactly like progress.js's allowSession - a link is a
// key to a difficulty, whoever is playing, and it never overwrites what the player actually chose.
//
// Every storage access goes through store() (game/storage.js), never window.localStorage directly.
import { DIFFICULTIES } from '../constants.js';
import { audio } from '../engine/audio.js';
import { input } from '../engine/input.js';
import { Camera } from '../engine/camera.js';
import { store } from './storage.js';

const KEY = 'aetherAndBrass.options.v1';
/** Screen shake levels, cycled by the SCREEN SHAKE row. */
export const SHAKE_LEVELS = Object.freeze(['off', 'low', 'full']);
/** Camera.shakeScale for each level (decision 6: OFF/LOW/FULL = 0/0.5/1). */
export const SHAKE_SCALE = Object.freeze({ off: 0, low: 0.5, full: 1 });
/** Integer steps a volume slider divides into (0..VOLUME_STEPS). */
export const VOLUME_STEPS = 10;
const DEFAULTS = Object.freeze({ difficulty: 'normal', music: 5, sfx: 10, shake: 'full' });
/** Value lists for the cycled (non-slider) settings. */
const LISTS = { difficulty: DIFFICULTIES, shake: SHAKE_LEVELS };

/** The persisted settings, read once per page load. */
let current = { ...DEFAULTS };
/** `?difficulty=` override for this page load only; never persisted. '' means "use `current.difficulty`". */
let sessionDifficulty = '';

/** Coerce a raw parsed save's top-level fields to valid values, defaulting anything malformed. */
function sanitise(raw) {
  const difficulty = DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : DEFAULTS.difficulty;
  const music = clampStep(raw.music, DEFAULTS.music);
  const sfx = clampStep(raw.sfx, DEFAULTS.sfx);
  const shake = SHAKE_LEVELS.includes(raw.shake) ? raw.shake : DEFAULTS.shake;
  return { difficulty, music, sfx, shake };
}
function clampStep(x, fallback) {
  const n = Math.round(Number(x));
  return Number.isFinite(n) ? Math.max(0, Math.min(VOLUME_STEPS, n)) : fallback;
}

/** Write the current settings (plus the live bindings) to storage. Returns whether it succeeded. */
function persist() {
  const s = store(KEY);
  if (!s) return false;
  try { s.setItem(KEY, JSON.stringify({ version: 1, ...current, bindings: input.exportBindings() })); return true; } catch (e) { return false; }
}

/** Persisted player options singleton. */
export const options = {
  /** Read the save (once per page load) and apply it. Call before the first screen is pushed. */
  load() {
    const s = store(KEY);
    let parsed = null;
    if (s) { try { parsed = JSON.parse(s.getItem(KEY) || 'null'); } catch (e) { parsed = null; } }
    current = sanitise(parsed || {});
    input.importBindings(parsed && parsed.bindings ? parsed.bindings : null);
    this.apply();
  },
  /** Push the current settings into audio, Camera and input. Idempotent. */
  apply() {
    audio.music.setVolume(current.music / VOLUME_STEPS);
    audio.setSfxVolume(current.sfx / VOLUME_STEPS);
    Camera.shakeScale = SHAKE_SCALE[current.shake];
  },
  /** @param {'difficulty'|'music'|'sfx'|'shake'} key */
  get(key) { return current[key]; },
  /**
   * Set one setting (sanitised), apply it and persist. Setting difficulty clears any session override.
   * @param {'difficulty'|'music'|'sfx'|'shake'} key
   */
  set(key, value) {
    current = sanitise({ ...current, [key]: value });
    if (key === 'difficulty') sessionDifficulty = '';
    this.apply();
    persist();
  },
  /**
   * Step a cycled (list-valued) setting by `dir` (wraps).
   * @param {'difficulty'|'shake'} key
   * @param {number} dir
   */
  cycle(key, dir) {
    const list = LISTS[key];
    // Step from the value the row is showing, not the saved one: under a `?difficulty=` session
    // override this.difficulty() differs from current.difficulty, and a right-press must land on
    // the next difficulty after what the player sees, not after what's saved (set() below clears
    // the override either way, so the result is always persisted from here).
    const base = key === 'difficulty' ? this.difficulty() : current[key];
    const i = list.indexOf(base);
    this.set(key, list[(i + dir + list.length) % list.length]);
  },
  /**
   * Step a slider (music / sfx) setting by `dir`, clamped 0..VOLUME_STEPS. Returns whether it changed.
   * @param {'music'|'sfx'} key
   * @param {number} dir
   */
  adjust(key, dir) {
    const next = Math.max(0, Math.min(VOLUME_STEPS, current[key] + dir));
    if (next === current[key]) return false;
    this.set(key, next);
    return true;
  },
  /** The difficulty to play: the `?difficulty=` session override if one is set, else the saved value. */
  difficulty() { return sessionDifficulty || current.difficulty; },
  /**
   * Hold a `?difficulty=` URL override for this page load only (never persisted; same rule as
   * progress.allowSession). Ignored for anything not in DIFFICULTIES.
   * @param {string} d
   */
  setSessionDifficulty(d) { if (DIFFICULTIES.includes(d)) sessionDifficulty = d; },
  /** Camera.shakeScale for the current SCREEN SHAKE setting. */
  shakeScale() { return SHAKE_SCALE[current.shake]; },
  /** Persist the live bindings (call after a successful input.rebind()). */
  saveBindings() { return persist(); },
  /** Restore every default (including bindings) and forget the save. */
  reset() {
    current = { ...DEFAULTS };
    sessionDifficulty = '';
    input.resetBindings();
    this.apply();
    const s = store(KEY);
    try { if (s) s.removeItem(KEY); } catch (e) { /* nothing to clean up */ }
  },
  /** Test hook: the full state, including whether storage worked and what is actually saved. */
  state() {
    const s = store(KEY);
    let saved = null;
    if (s) { try { saved = s.getItem(KEY); } catch (e) { saved = null; } }
    return {
      ...current,
      difficulty: this.difficulty(),
      muted: audio.muted,
      storage: !!s,
      saved,
      bindings: input.exportBindings(),
      legend: { solo: input.legend('solo'), p1: input.legend('p1'), p2: input.legend('p2') },
      joinHint: input.joinHint(1),
    };
  },
};
