// Generic dummy enemy definition used until content/enemies exists (spawnEnemy fallback). Idles, takes hits, gets up.
import { PALETTES } from '../art/palettes.js';
import { makeBaseAnims } from '../art/animLib.js';
import { rrect } from '../art/shapes.js';

function drawClub(ctx, rig) {
  const ol = rig.col(rig.outline);
  rrect(ctx, -5, -2, 26, 4, 2, rig.col('#6a5a4a'), ol, rig.ow);
  rrect(ctx, 14, -4, 8, 8, 2, rig.col(rig.palette.metal), ol, rig.ow);
}
const DUMMY_ANIMS = makeBaseAnims({ armR: [25, 10], weapon: -20 });
const VARIANT_PALETTES = {
  grunt: PALETTES.automaton, brute: PALETTES.brute, goblin: PALETTES.goblin,
};

/**
 * Build a placeholder enemy def: { id, type, variant, name, build, anims, hp, score, drops, ... }.
 * @param {string} type
 * @param {string} variant
 */
export function makeDummyDef(type = 'typeA', variant = 'grunt') {
  const pal = VARIANT_PALETTES[variant] || (type === 'typeB' ? PALETTES.goblin : PALETTES.automaton);
  const scale = variant === 'brute' ? 1.3 : type === 'typeB' ? 0.85 : 1;
  return {
    id: `${type}:${variant}`, type, variant, name: `DUMMY ${variant}`.toUpperCase(), role: 'fodder',
    build: { scale, palette: pal, weapon: { attach: 'handR', length: 24, draw: drawClub } },
    anims: DUMMY_ANIMS,
    hp: variant === 'brute' ? 160 : 60, maxHp: variant === 'brute' ? 160 : 60, score: 100, drops: 'none',
    walkSpeed: 1.2, lyingFrames: 40, grabbable: true, sfx: { hurt: type === 'typeB' ? 'soot_hurt' : 'brass_hit', death: type === 'typeB' ? 'soot_death' : 'brass_death' },
  };
}
