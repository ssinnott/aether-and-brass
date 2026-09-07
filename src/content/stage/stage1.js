// Stage 1: The Ascent of Calderwick (GDD section 6). Pure data in the ARCHITECTURE section 7 format
// (+ RECONCILIATION: section 3 is `mode: 'locked'` with `timedWaves`). Enemy type/variant slugs come from content/enemies.
const B = 'brassbound', S = 'sootborn';
/** Helper: n spawns of one enemy, alternating sides, spread over z lanes and delays. */
function group(type, variant, n, { side = 'alt', z0 = 40, dz = 30, delay0 = 0, ddelay = 30 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = side === 'alt' ? (i % 2 ? 'left' : 'right') : side;
    out.push({ type, variant, side: s, z: ((z0 + i * dz) % 120) + 10, delay: delay0 + i * ddelay });
  }
  return out;
}
/** Cutthroats always rush in from both sides (GDD 4: flank on both lanes). */
const cut = (n, o) => group(S, 'cutthroat', n, { ddelay: 20, ...o });

export const stage1 = {
  id: 'stage1', name: 'THE ASCENT OF CALDERWICK', subtitle: 'CALDERWICK, CITY OF THE HEART-ENGINE. THE CHANCELLOR HAS SEALED THE SKY.',
  length: 6000,
  music: { section1: 'section1', section2: 'section2', section3: 'section3', section4: 'section4', midboss: 'midboss', boss: 'boss' },
  sections: [
    // ---------------------------------------------------------------- Section 1: Sootfoot Docks (rain, night)
    { id: 's1', name: 'SOOTFOOT DOCKS', x0: 0, x1: 1800, backdrop: 'section1', floor: 'planks',
      props: [
        { type: 'crate', x: 300, z: 30, drops: 'brassCog' }, { type: 'crate', x: 340, z: 30, drops: 'meatPie' },
        { type: 'barrel', x: 760, z: 118, drops: 'coalScrip' }, { type: 'crate', x: 1080, z: 24, drops: 'brassCog' },
        { type: 'winch', x: 1180, z: 14, drops: 'aetherVial' }, { type: 'barrel', x: 1450, z: 120, drops: 'coalScrip' },
        { type: 'crate', x: 1720, z: 40, drops: 'meatPie' },
      ],
      hazards: [
        { type: 'steamVent', x: 600, z: 100, period: 180, active: 60, tell: 20 },
        { type: 'steamVent', x: 1250, z: 40, period: 180, active: 60, tell: 20, offset: 90 },
        { type: 'hook', x: 1500, z: 70, period: 120 },
      ],
      waves: [
        { triggerX: 400, lock: true, spawns: cut(3, { z0: 40 }) },
        { triggerX: 900, lock: true, spawns: [...cut(4, { z0: 30 }), { type: S, variant: 'slinger', side: 'right', z: 20, delay: 40 }, { type: S, variant: 'slinger', side: 'left', z: 120, delay: 70 }] },
        { triggerX: 1300, lock: true, spawns: [{ type: B, variant: 'footman', side: 'right', z: 70, delay: 0 }],
          reinforcements: [{ whenRemaining: 0, spawns: cut(2, { z0: 40, dz: 60, delay0: 20 }) }] },
        { triggerX: 1650, lock: true, spawns: [
          { type: B, variant: 'footman', side: 'right', z: 60, delay: 0 }, { type: B, variant: 'footman', side: 'left', z: 90, delay: 30 },
          ...cut(3, { z0: 20, delay0: 40 }),
          { type: S, variant: 'slinger', side: 'right', z: 120, delay: 90 }, { type: S, variant: 'slinger', side: 'left', z: 20, delay: 120 },
        ] },
      ],
      events: [{ atX: 1760, kind: 'text', text: 'DOCK GATE OPENING', sub: 'TO THE FOUNDRY' }],
    },
    // ---------------------------------------------------------------- Section 2: Foundry Row (interior, heat)
    { id: 's2', name: 'FOUNDRY ROW', x0: 1800, x1: 3800, backdrop: 'section2', floor: 'grate',
      props: [
        { type: 'mold', x: 1960, z: 24, drops: 'brassCog' }, { type: 'cart', x: 2250, z: 110, drops: 'meatPie' },
        { type: 'drum', x: 2380, z: 30, drops: 'aetherVial' }, { type: 'case', x: 2700, z: 20, drops: 'goldenSprocket' },
        { type: 'mold', x: 2760, z: 120, drops: 'brassCog' }, { type: 'bucket', x: 3100, z: 16, drops: 'roastBird' },
        { type: 'drum', x: 3150, z: 110, drops: 'aetherVial' }, { type: 'cart', x: 3480, z: 30, drops: 'meatPie' },
      ],
      hazards: [
        { type: 'steamVent', x: 2500, z: 110, period: 180, active: 40, tell: 30 },
        { type: 'steamVent', x: 2800, z: 30, period: 180, active: 40, tell: 30, offset: 90 },
        { type: 'piston', x: 3000, z: 60, period: 240, active: 10, tell: 30 },
        { type: 'piston', x: 3300, z: 90, period: 240, active: 10, tell: 30, offset: 120 },
      ],
      waves: [
        { triggerX: 2100, lock: true, spawns: [{ type: S, variant: 'firebrand', side: 'right', z: 40, delay: 0 }, { type: S, variant: 'firebrand', side: 'left', z: 100, delay: 30 }, ...cut(3, { z0: 60, delay0: 20 })] },
        { triggerX: 2500, lock: true, spawns: [
          { type: B, variant: 'halberdier', side: 'right', z: 50, delay: 0 }, { type: B, variant: 'halberdier', side: 'left', z: 100, delay: 40 },
          { type: B, variant: 'sapper', side: 'right', z: 120, delay: 60 }, { type: B, variant: 'sapper', side: 'left', z: 20, delay: 90 },
        ] },
        { triggerX: 2900, lock: true, spawns: [
          { type: S, variant: 'hulk', side: 'right', z: 70, delay: 0 }, { type: S, variant: 'wrangler', side: 'left', z: 110, delay: 30 }, ...cut(3, { z0: 30, delay0: 40 }),
        ] },
        { triggerX: 3250, lock: true, spawns: [
          { type: B, variant: 'warden', side: 'right', z: 70, delay: 0 },
          { type: B, variant: 'halberdier', side: 'left', z: 40, delay: 40 }, { type: B, variant: 'halberdier', side: 'right', z: 110, delay: 80 },
          { type: S, variant: 'slinger', side: 'left', z: 120, delay: 100 }, { type: S, variant: 'slinger', side: 'right', z: 20, delay: 130 },
        ] },
      ],
      events: [],
    },
    // ---------------------------------------------------------------- Section 3: The Brass Funicular (one locked screen, timed waves)
    { id: 's3', name: 'THE BRASS FUNICULAR', x0: 3800, x1: 4440, backdrop: 'section3', floor: 'brass', mode: 'locked',
      props: [
        { type: 'trunk', x: 3900, z: 20, drops: 'meatPie' }, { type: 'trunk', x: 4300, z: 120, drops: 'brassCog' },
        { type: 'mailcart', x: 4120, z: 16, drops: 'goldenSprocket' }, { type: 'lantern', x: 3860, z: 128, drops: 'coalScrip' }, { type: 'lantern', x: 4400, z: 128, drops: 'coalScrip' },
      ],
      hazards: [{ type: 'crossbar', x: 4120, z: 0, period: 360, active: 12, tell: 40 }],
      waves: [],
      timedWaves: [
        { at: 0, spawns: [{ type: B, variant: 'sapper', side: 'right', z: 30, delay: 0 }, { type: B, variant: 'sapper', side: 'left', z: 110, delay: 30 }, { type: B, variant: 'sapper', side: 'right', z: 120, delay: 60 },
          { type: B, variant: 'footman', side: 'left', z: 60, delay: 20 }, { type: B, variant: 'footman', side: 'right', z: 80, delay: 50 }] },
        { at: 25, spawns: [{ type: B, variant: 'duelist', side: 'right', z: 50, delay: 0 }, { type: B, variant: 'duelist', side: 'left', z: 100, delay: 30 },
          { type: B, variant: 'halberdier', side: 'left', z: 40, delay: 60 }, { type: B, variant: 'halberdier', side: 'right', z: 110, delay: 90 }] },
        { at: 55, spawns: [{ type: S, variant: 'wrangler', side: 'right', z: 30, delay: 0 }, { type: S, variant: 'wrangler', side: 'left', z: 120, delay: 20 },
          { type: S, variant: 'hulk', side: 'right', z: 70, delay: 40 }, { type: S, variant: 'slinger', side: 'left', z: 20, delay: 70 }, { type: S, variant: 'slinger', side: 'right', z: 120, delay: 100 }] },
        { at: 90, spawns: [{ type: B, variant: 'warden', side: 'sky', z: 70, delay: 0, shake: 10 },
          { type: B, variant: 'duelist', side: 'right', z: 40, delay: 40 }, { type: B, variant: 'duelist', side: 'left', z: 110, delay: 70 },
          { type: B, variant: 'footman', side: 'left', z: 60, delay: 100 }, { type: B, variant: 'footman', side: 'right', z: 90, delay: 130 }] },
      ],
      events: [],
    },
    // ---------------------------------------------------------------- Section 4: The Heart-Engine (summit cathedral)
    { id: 's4', name: 'THE HEART-ENGINE', x0: 4440, x1: 6000, backdrop: 'section4', floor: 'marble',
      props: [
        { type: 'crate', x: 4520, z: 30, drops: 'meatPie' }, { type: 'crate', x: 4560, z: 110, drops: 'meatPie' },
        { type: 'urn', x: 4700, z: 20, drops: 'meatPie' }, { type: 'urn', x: 5000, z: 120, drops: 'meatPie' }, { type: 'urn', x: 5350, z: 24, drops: 'brassHeart' },
        { type: 'cabinet', x: 5250, z: 16, drops: 'goldenSprocket' },
        { type: 'valve', x: 5600, z: 14, drops: 'aetherVial' }, { type: 'valve', x: 5960, z: 14, drops: 'aetherVial' },
      ],
      hazards: [
        { type: 'aetherVent', x: 4900, z: 110, period: 180, active: 40, tell: 30 },
        { type: 'aetherVent', x: 5260, z: 40, period: 180, active: 40, tell: 30, offset: 90 },
        { type: 'aetherVent', x: 5560, z: 100, period: 180, active: 40, tell: 30, offset: 45 },
      ],
      waves: [
        { triggerX: 4800, lock: true, spawns: [{ type: B, variant: 'footman', side: 'right', z: 40, delay: 0 }, { type: B, variant: 'footman', side: 'left', z: 100, delay: 30 },
          { type: B, variant: 'halberdier', side: 'right', z: 110, delay: 60 }, { type: B, variant: 'halberdier', side: 'left', z: 30, delay: 90 }] },
        { triggerX: 5150, lock: true, spawns: [{ type: B, variant: 'warden', side: 'right', z: 70, delay: 0 },
          { type: B, variant: 'sapper', side: 'left', z: 30, delay: 30 }, { type: B, variant: 'sapper', side: 'left', z: 120, delay: 60 }, { type: B, variant: 'duelist', side: 'right', z: 40, delay: 90 }] },
        { triggerX: 5500, lock: true, spawns: [{ type: B, variant: 'warden', side: 'right', z: 50, delay: 0 }, { type: B, variant: 'warden', side: 'left', z: 100, delay: 40 },
          { type: B, variant: 'duelist', side: 'right', z: 110, delay: 80 }, { type: B, variant: 'duelist', side: 'left', z: 30, delay: 110 },
          { type: S, variant: 'wrangler', side: 'left', z: 120, delay: 140 }, ...cut(3, { z0: 20, delay0: 160 })] },
      ],
      events: [],
    },
  ],
  /** Foreman Grubbik & the Hoister: cargo bay at the end of Foundry Row. */
  midboss: { atX: 3600, def: 'midboss', arena: { x0: 3280, x1: 3920 }, intro: { name: 'FOREMAN GRUBBIK', sub: '& THE HOISTER' } },
  /** Chancellor Vane: the dais at the summit (RECONCILIATION: arena 5560..6000). */
  boss: { atX: 5900, def: 'boss', arena: { x0: 5560, x1: 6000 }, camera: { x0: 5360, x1: 6000 }, intro: { name: 'CHANCELLOR AURELIUS VANE', sub: 'THE AETHERWRIGHT' } },
};
