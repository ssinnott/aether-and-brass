// Enemy registry (ARCHITECTURE.md section 8 / 15): getEnemyDef(type, variant), ENEMY_LIST (10 variants + midboss + boss).
// Type slugs come from the GDD faction names; the ARCHITECTURE aliases typeA/typeB are accepted too.
import { BRASSBOUND } from './brassbound.js';
import { SOOTBORN } from './sootborn.js';
import { midboss } from './midboss.js';
import { boss } from './boss.js';

const TYPE_ALIASES = { typeA: 'brassbound', typeB: 'sootborn', brass: 'brassbound', soot: 'sootborn', grubbik: 'midboss', hoister: 'midboss', vane: 'boss' };
/** GDD display-name words -> variant slugs (so 'Tin Footman' / 'footman' / 'tin' all resolve). */
const VARIANT_ALIASES = {
  brassbound: { tin: 'footman', grunt: 'footman', halberd: 'halberdier', brass: 'halberdier', copper: 'sapper', bomber: 'sapper', iron: 'warden', shield: 'warden', brute: 'warden', chrome: 'duelist', fencer: 'duelist' },
  sootborn: { soot: 'cutthroat', grunt: 'cutthroat', goblin: 'cutthroat', knife: 'cutthroat', scrap: 'slinger', sling: 'slinger', fire: 'firebrand', flame: 'firebrand', cinder: 'hulk', brute: 'hulk', gutter: 'wrangler', whip: 'wrangler' },
};

/** All enemy defs keyed by `${type}:${variant}`. */
const DEFS = new Map();
for (const d of [...BRASSBOUND, ...SOOTBORN]) DEFS.set(`${d.type}:${d.variant}`, d);
DEFS.set('midboss:grubbik', midboss);
DEFS.set('boss:vane', boss);

/** Resolve a type slug (accepting aliases). */
export function resolveType(type) {
  const t = String(type || 'brassbound').toLowerCase();
  return TYPE_ALIASES[t] || t;
}

/**
 * Look up an enemy definition. Unknown variants fall back to the type's first variant; unknown types to the Tin Footman.
 * @param {string} type 'brassbound' | 'sootborn' | 'midboss' | 'boss' (aliases: typeA, typeB, grubbik, vane)
 * @param {string} [variant]
 */
export function getEnemyDef(type, variant) {
  const t = resolveType(type);
  if (t === 'midboss') return midboss;
  if (t === 'boss') return boss;
  let v = String(variant || '').toLowerCase().replace(/[^a-z]/g, '');
  const al = VARIANT_ALIASES[t];
  if (al && al[v]) v = al[v];
  if (DEFS.has(`${t}:${v}`)) return DEFS.get(`${t}:${v}`);
  // partial match on the display name ('tin footman' -> footman)
  for (const d of DEFS.values()) if (d.type === t && v && (d.name.toLowerCase().replace(/[^a-z]/g, '').includes(v) || v.includes(d.variant))) return d;
  const first = [...DEFS.values()].find((d) => d.type === t);
  return first || BRASSBOUND[0];
}

/** Registry list for window.__game.enemyList(): 10 variants + midboss + boss. */
export const ENEMY_LIST = [
  ...BRASSBOUND.map((d) => ({ type: d.type, variant: d.variant, name: d.name, role: d.role })),
  ...SOOTBORN.map((d) => ({ type: d.type, variant: d.variant, name: d.name, role: d.role })),
  { type: 'midboss', variant: 'grubbik', name: midboss.name, role: 'boss' },
  { type: 'boss', variant: 'vane', name: boss.name, role: 'boss' },
];

/** Gallery entries: every variant plus each boss phase rig. */
export const ENEMY_GALLERY = [
  ...BRASSBOUND.map((d) => ({ id: d.id, name: d.name, build: d.build, anims: d.anims })),
  ...SOOTBORN.map((d) => ({ id: d.id, name: d.name, build: d.build, anims: d.anims })),
  { id: 'midboss', name: 'THE HOISTER', build: midboss.build, anims: midboss.anims },
  { id: 'midboss2', name: 'GRUBBIK', build: midboss.phases[2].build, anims: midboss.phases[2].anims },
  { id: 'boss', name: 'REGENT ENGINE', build: boss.build, anims: boss.anims },
  { id: 'boss2', name: 'VANE', build: boss.phases[2].build, anims: boss.phases[2].anims },
];

export { BRASSBOUND, SOOTBORN, midboss, boss };
