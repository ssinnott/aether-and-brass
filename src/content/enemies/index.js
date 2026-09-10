// Enemy registry (ARCHITECTURE.md section 8 / 15): getEnemyDef(type, variant), ENEMY_LIST (every variant + the bosses).
// Stage 1 (docs/GDD.md): Brassbound + Sootborn, the Hoister and the Regent Engine.
// Stage 2 (docs/STAGE2.md): Stormcrows, the Grapnel Winch and the Ninth Wing.
// Stage 3 (docs/STAGE3.md): the Chandlery of Calderwick, the Lime Kiln and the Factor — working on the Brassbound and
// Sootborn they have put back on their feet, so the board is three factions at once.
// Stage 4 (docs/STAGE4.md): the Gleaning, the Baler and the Harvestlord - the salvage guild that has been carrying the
// first three boards away as they fell, working over the Sootborn who have always picked these heaps and the Stormcrows
// the sea gave back, so the last board is the whole war's leftovers in one field.
// Type slugs come from the design-doc faction names; the ARCHITECTURE aliases typeA/typeB are accepted too.
import { BRASSBOUND } from './brassbound.js';
import { SOOTBORN } from './sootborn.js';
import { STORMCROWS } from './stormcrow.js';
import { GLEANINGS } from './gleaning.js';
import { CHANDLERS } from './chandler.js';
import { midboss } from './midboss.js';
import { boss } from './boss.js';
import { midboss2 } from './midboss2.js';
import { boss2 } from './boss2.js';
import { midboss3 } from './midboss3.js';
import { boss3 } from './boss3.js';
import { midboss4 } from './midboss4.js';
import { boss4 } from './boss4.js';

// keys are lower-case: resolveType() lower-cases the slug before the lookup
const TYPE_ALIASES = {
  typea: 'brassbound', typeb: 'sootborn', typec: 'stormcrow', typed: 'gleaning',
  brass: 'brassbound', soot: 'sootborn', crow: 'stormcrow', ninth: 'stormcrow',
  gleaner: 'gleaning', tide: 'gleaning', typee: 'chandler', chandlery: 'chandler', company: 'chandler',
  grubbik: 'midboss', hoister: 'midboss', vane: 'boss', skree: 'midboss2', winch: 'midboss2', kestrel: 'boss2', admiral: 'boss2',
  marl: 'midboss3', yardmaster: 'midboss3', kiln: 'midboss3', hasp: 'boss3', factor: 'boss3', ledger: 'boss3',
  culm: 'midboss4', reeve: 'midboss4', baler: 'midboss4', oke: 'boss4', harvestlord: 'boss4', briar: 'boss4',
};
/** GDD display-name words -> variant slugs (so 'Tin Footman' / 'footman' / 'tin' all resolve). */
const VARIANT_ALIASES = {
  brassbound: { tin: 'footman', grunt: 'footman', halberd: 'halberdier', brass: 'halberdier', copper: 'sapper', bomber: 'sapper', iron: 'warden', shield: 'warden', brute: 'warden', chrome: 'duelist', fencer: 'duelist' },
  sootborn: { soot: 'cutthroat', grunt: 'cutthroat', goblin: 'cutthroat', knife: 'cutthroat', scrap: 'slinger', sling: 'slinger', fire: 'firebrand', flame: 'firebrand', cinder: 'hulk', brute: 'hulk', gutter: 'wrangler', whip: 'wrangler' },
  stormcrow: { deck: 'crimper', grunt: 'crimper', hook: 'crimper', line: 'corsair', harpoon: 'corsair', powder: 'bosun', keg: 'bosun', chain: 'bosun', storm: 'galewright', coil: 'galewright', ironwing: 'marine', wing: 'marine', shield: 'marine' },
  gleaning: { bounce: 'chaff', grunt: 'chaff', perch: 'winnow', ballast: 'winnow', shadow: 'thresher', dive: 'thresher', brute: 'thresher', thief: 'sickle', hook: 'sickle', caller: 'harvestman', canopy: 'harvestman' },
  chandler: { wick: 'wickboy', boy: 'wickboy', ledger: 'tallyman', chalk: 'tallyman', lime: 'limeburner', kiln: 'limeburner', officer: 'purser', dram: 'purser', cart: 'resurrectionist', tongs: 'resurrectionist', resurrection: 'resurrectionist' },
};

/** All enemy defs keyed by `${type}:${variant}`. */
const DEFS = new Map();
for (const d of [...BRASSBOUND, ...SOOTBORN, ...STORMCROWS, ...GLEANINGS, ...CHANDLERS]) DEFS.set(`${d.type}:${d.variant}`, d);
DEFS.set('midboss:grubbik', midboss);
DEFS.set('boss:vane', boss);
DEFS.set('midboss2:skree', midboss2);
DEFS.set('boss2:kestrel', boss2);
DEFS.set('midboss3:marl', midboss3);
DEFS.set('boss3:hasp', boss3);
DEFS.set('midboss4:culm', midboss4);
DEFS.set('boss4:oke', boss4);

/** Resolve a type slug (accepting aliases). */
export function resolveType(type) {
  const t = String(type || 'brassbound').toLowerCase();
  return TYPE_ALIASES[t] || t;
}

/** Boss types resolve to their single def whatever variant is asked for. */
const BOSSES = { midboss, boss, midboss2, boss2, midboss3, boss3, midboss4, boss4 };

/**
 * Look up an enemy definition. Unknown variants fall back to the type's first variant; unknown types to the Tin Footman.
 * @param {string} type 'brassbound' | 'sootborn' | 'stormcrow' | 'gleaning' | 'chandler' | 'midboss' | 'boss' |
 *   'midboss2' | 'boss2' | 'midboss3' | 'boss3' | 'midboss4' | 'boss4'
 *   (aliases: typeA, typeB, typeC, typeD, typeE, grubbik, vane, skree, kestrel, marl, hasp, culm, oke)
 * @param {string} [variant]
 */
export function getEnemyDef(type, variant) {
  const t = resolveType(type);
  if (BOSSES[t]) return BOSSES[t];
  let v = String(variant || '').toLowerCase().replace(/[^a-z]/g, '');
  const al = VARIANT_ALIASES[t];
  if (al && al[v]) v = al[v];
  if (DEFS.has(`${t}:${v}`)) return DEFS.get(`${t}:${v}`);
  // partial match on the display name ('tin footman' -> footman)
  for (const d of DEFS.values()) if (d.type === t && v && (d.name.toLowerCase().replace(/[^a-z]/g, '').includes(v) || v.includes(d.variant))) return d;
  const first = [...DEFS.values()].find((d) => d.type === t);
  return first || BRASSBOUND[0];
}

/** Registry list for window.__game.enemyList(): every variant + every board's mid-boss and boss. */
const listEntry = (d) => ({ type: d.type, variant: d.variant, name: d.name, role: d.role });
export const ENEMY_LIST = [
  ...BRASSBOUND.map(listEntry), ...SOOTBORN.map(listEntry), ...STORMCROWS.map(listEntry), ...GLEANINGS.map(listEntry), ...CHANDLERS.map(listEntry),
  { type: 'midboss', variant: 'grubbik', name: midboss.name, role: 'boss' },
  { type: 'boss', variant: 'vane', name: boss.name, role: 'boss' },
  { type: 'midboss2', variant: 'skree', name: midboss2.name, role: 'boss' },
  { type: 'boss2', variant: 'kestrel', name: boss2.name, role: 'boss' },
  { type: 'midboss3', variant: 'marl', name: midboss3.name, role: 'boss' },
  { type: 'boss3', variant: 'hasp', name: boss3.name, role: 'boss' },
  { type: 'midboss4', variant: 'culm', name: midboss4.name, role: 'boss' },
  { type: 'boss4', variant: 'oke', name: boss4.name, role: 'boss' },
];

/** Gallery entries: every variant plus each boss phase rig. */
const galleryEntry = (d) => ({ id: d.id, name: d.name, build: d.build, anims: d.anims });
export const ENEMY_GALLERY = [
  ...BRASSBOUND.map(galleryEntry), ...SOOTBORN.map(galleryEntry), ...STORMCROWS.map(galleryEntry), ...GLEANINGS.map(galleryEntry), ...CHANDLERS.map(galleryEntry),
  { id: 'midboss', name: 'THE HOISTER', build: midboss.build, anims: midboss.anims },
  { id: 'midbossB', name: 'GRUBBIK', build: midboss.phases[2].build, anims: midboss.phases[2].anims },
  { id: 'boss', name: 'REGENT ENGINE', build: boss.build, anims: boss.anims },
  { id: 'bossB', name: 'VANE', build: boss.phases[2].build, anims: boss.phases[2].anims },
  { id: 'midboss2', name: 'THE GRAPNEL WINCH', build: midboss2.build, anims: midboss2.anims },
  { id: 'midboss2B', name: 'SKREE', build: midboss2.phases[1].build, anims: midboss2.phases[1].anims },
  { id: 'boss2', name: 'ADMIRAL KESTREL', build: boss2.build, anims: boss2.anims },
  { id: 'boss2B', name: 'STORM-WING', build: boss2.phases[1].build, anims: boss2.phases[1].anims },
  { id: 'midboss3', name: 'THE LIME KILN', build: midboss3.build, anims: midboss3.anims },
  { id: 'midboss3B', name: 'YARDMASTER MARL', build: midboss3.phases[1].build, anims: midboss3.phases[1].anims },
  { id: 'boss3', name: 'FACTOR HASP', build: boss3.build, anims: boss3.anims },
  { id: 'boss3B', name: 'THE COMPANY MAN', build: boss3.phases[1].build, anims: boss3.phases[1].anims },
  { id: 'boss3C', name: 'THE LEDGER', build: boss3.phases[2].build, anims: boss3.phases[2].anims },
  { id: 'midboss4', name: 'THE BALER', build: midboss4.build, anims: midboss4.anims },
  { id: 'midboss4B', name: 'REEVE CULM', build: midboss4.phases[1].build, anims: midboss4.phases[1].anims },
  { id: 'boss4', name: 'THE CANOPY', build: boss4.build, anims: boss4.anims },
  { id: 'boss4B', name: 'THE STOOP', build: boss4.phases[1].build, anims: boss4.phases[1].anims },
  { id: 'boss4C', name: 'THE GLEANER', build: boss4.phases[2].build, anims: boss4.phases[2].anims },
];

export { BRASSBOUND, SOOTBORN, STORMCROWS, GLEANINGS, CHANDLERS, midboss, boss, midboss2, boss2, midboss3, boss3, midboss4, boss4 };
