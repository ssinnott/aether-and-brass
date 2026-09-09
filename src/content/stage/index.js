// Stage registry: the boards the player can pick on the title screen (STAGE < ... >) and the `?stage=N` debug param.
// Order is the campaign order; index 0 is the default. Stage data format: ARCHITECTURE.md section 7.
import { stage1 } from './stage1.js';
import { stage2 } from './stage2.js';
import { stage3 } from './stage3.js';

/** Every playable board, in order. */
export const STAGES = [stage1, stage2, stage3];

/** Short labels for menus (the full name is on the intro card). */
export const STAGE_LABELS = STAGES.map((s) => s.name);

/**
 * Resolve a stage by its 1-based STAGE NUMBER ('2' / 2 -> stage 2) or by id ('stage2'). 0 and anything
 * unknown fall back to stage 1. Menus index STAGES directly; this is for `?stage=N` and saved options.
 * @param {number|string} which
 */
export function getStage(which) {
  if (typeof which === 'string') {
    const byId = STAGES.find((s) => s.id === which || s.name === which);
    if (byId) return byId;
    which = parseInt(which, 10);
  }
  const n = Number(which);
  if (!Number.isFinite(n) || n < 2) return STAGES[0];
  return STAGES[n - 1] || STAGES[0];
}

/** Index of a stage in STAGES (0 when it is not registered). */
export function stageIndex(stage) { return Math.max(0, STAGES.indexOf(stage)); }

export { stage1, stage2, stage3 };
