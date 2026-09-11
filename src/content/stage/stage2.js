// Stage 2: The Storm Above Calderwick (docs/STAGE2.md section 6). Same data format as stage1.js
// (ARCHITECTURE.md section 7 + RECONCILIATION `zones` / `transition`), three sections instead of four:
// the mooring spine, the gas-halls of a captured freighter, and the flagship's weather deck.
// Enemy slugs come from content/enemies (the Stormcrows; two Brassbound show up at the very end as Concordat holdouts).
const C = 'stormcrow', B = 'brassbound';
/** Helper: n spawns of one enemy, alternating sides, spread over z lanes and delays. */
function group(type, variant, n, { side = 'alt', z0 = 40, dz = 30, delay0 = 0, ddelay = 30 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = side === 'alt' ? (i % 2 ? 'left' : 'right') : side;
    out.push({ type, variant, side: s, z: ((z0 + i * dz) % 120) + 10, delay: delay0 + i * ddelay });
  }
  return out;
}
/** Crimpers come in off both sides at once — they are the wave's pressure, not its threat. */
const crimp = (n, o) => group(C, 'crimper', n, { ddelay: 22, ...o });
const KEGS = ['coalScrip'];

export const stage2 = {
  id: 'stage2', number: 2, name: 'THE STORM ABOVE CALDERWICK',
  subtitle: 'THE SKY IS OPEN. THE NINTH WING HAS DECIDED TO CLOSE IT AGAIN.',
  // BOARD SELECT vignette (game/screens/boardselect.js): sky ramp, ground band, accent light, motif to draw.
  // Static violet, not aether cyan: cyan is Concordat-only (STAGE2.md section 1) and the Stormcrows are not Concordat.
  preview: { skyTop: '#141A32', skyBot: '#E0A070', ground: '#454D5A', groundH: 0, accent: '#9B7BFF', motif: 'sky', blurb: 'THE STORMCROWS' },
  introLines: [
    'THE HEART-ENGINE IS COLD AND THE SKY IS OPEN.',
    'THE NINTH AERONAUT WING NEVER STOOD DOWN.',
    'THE STUBBORN KETTLE IS GOING UP THERE TO ASK WHY.',
  ],
  length: 5200,
  music: { storm1: 'storm1', storm2: 'storm2', storm3: 'storm3', midboss: 'midboss2', boss: 'stormboss' },
  sections: [
    // ---------------------------------------------------------------- Section 1: The Mooring Spine (dawn, storm, open air)
    { id: 'm1', name: 'THE MOORING SPINE', x0: 0, x1: 1900, backdrop: 'storm1', floor: 'grate',
      props: [
        { type: 'crate', x: 300, z: 34, drops: ['brassCog', 'brassCog'] }, { type: 'keg', x: 520, z: 116, drops: KEGS },
        { type: 'ballast', x: 900, z: 24, drops: 'meatPie' }, { type: 'crate', x: 1160, z: 110, drops: ['brassCog', 'brassCog'] },
        { type: 'locker', x: 1290, z: 18, drops: 'goldenSprocket' }, { type: 'keg', x: 1560, z: 118, drops: KEGS },
        { type: 'ballast', x: 1810, z: 40, drops: 'meatPie' },
      ],
      // the storm earths itself through the mooring masts; the loading hook still swings between them
      hazards: [
        { type: 'lightning', x: 700, z: 96, period: 220, active: 12, tell: 40 },
        { type: 'hook', x: 1180, z: 70, period: 120 },
        { type: 'lightning', x: 1620, z: 40, period: 220, active: 12, tell: 40, offset: 110 },
      ],
      /** No bulwark up here: the front and back 12px are open air. Anything thrown over goes into the cloud (+200). */
      zones: [{ type: 'rails', x0: 0, x1: 1900 }],
      waves: [
        { triggerX: 420, lock: true, spawns: crimp(3, { z0: 40 }) },
        { triggerX: 880, lock: true, spawns: [...crimp(3, { z0: 30 }),
          { type: C, variant: 'corsair', side: 'right', z: 20, delay: 50 }, { type: C, variant: 'corsair', side: 'left', z: 120, delay: 80 }] },
        // "meet the chain": the Bosun comes with a pair of Crimpers to keep you honest while the keg is in the air
        { triggerX: 1320, lock: true, spawns: [{ type: C, variant: 'bosun', side: 'right', z: 70, delay: 0 }, ...crimp(2, { z0: 30, dz: 60, delay0: 30 })] },
        { triggerX: 1720, lock: true, spawns: [
          { type: C, variant: 'bosun', side: 'right', z: 60, delay: 0 },
          { type: C, variant: 'corsair', side: 'left', z: 20, delay: 40 }, { type: C, variant: 'corsair', side: 'right', z: 120, delay: 70 },
          ...crimp(3, { z0: 40, delay0: 60 }),
        ] },
      ],
      events: [],
      /** The freighter warps in against the spine and the cargo gate comes down: the players board. */
      transition: { kind: 'board', atX: 1840, gateX: 1900 },
    },
    // ---------------------------------------------------------------- Section 2: The Gas-Halls (interior, soft light)
    { id: 'm2', name: 'THE GAS-HALLS', x0: 1900, x1: 3600, backdrop: 'storm2', floor: 'plank',
      props: [
        { type: 'ballast', x: 2040, z: 26, drops: 'meatPie' }, { type: 'keg', x: 2210, z: 112, drops: KEGS },
        { type: 'crate', x: 2380, z: 30, drops: ['brassCog', 'brassCog'] }, { type: 'locker', x: 2560, z: 20, drops: 'goldenSprocket' },
        { type: 'ballast', x: 2760, z: 118, drops: 'meatPie' }, { type: 'bucket', x: 2980, z: 18, drops: 'roastBird' },
        { type: 'keg', x: 3120, z: 108, drops: KEGS }, { type: 'crate', x: 3320, z: 34, drops: ['brassCog', 'brassCog'] },
      ],
      // gas valves vent along the catwalk; a loading hook still swings on its chain over the middle of the hall
      hazards: [
        { type: 'steamVent', x: 2280, z: 106, period: 180, active: 40, tell: 30 },
        { type: 'hook', x: 2680, z: 66, period: 130 },
        { type: 'steamVent', x: 3060, z: 34, period: 180, active: 40, tell: 30, offset: 90 },
      ],
      waves: [
        // the coil arrives: two Galewrights with a screen of Crimpers in front of them
        { triggerX: 2180, lock: true, spawns: [{ type: C, variant: 'galewright', side: 'right', z: 40, delay: 0 },
          { type: C, variant: 'galewright', side: 'left', z: 110, delay: 40 }, ...crimp(3, { z0: 60, delay0: 20 })] },
        // the first Marine drops through the netting from the cells above
        { triggerX: 2620, lock: true, spawns: [{ type: C, variant: 'marine', side: 'sky', z: 70, delay: 0, shake: 8 },
          ...crimp(2, { z0: 30, delay0: 40 }), { type: C, variant: 'corsair', side: 'left', z: 118, delay: 80 }] },
        { triggerX: 3060, lock: true, spawns: [
          { type: C, variant: 'bosun', side: 'right', z: 50, delay: 0 }, { type: C, variant: 'bosun', side: 'left', z: 110, delay: 50 },
          { type: C, variant: 'corsair', side: 'right', z: 20, delay: 80 }, { type: C, variant: 'corsair', side: 'left', z: 120, delay: 110 },
          ...crimp(2, { z0: 60, delay0: 30 }),
        ] },
      ],
      events: [],
      /** Past the winch bay the hull is open to the weather: a boarding ramp across to the flagship. */
      transition: { kind: 'board', atX: 3540, gateX: 3600 },
    },
    // ---------------------------------------------------------------- Section 3: The Cold Sovereign (flagship deck)
    { id: 'm3', name: 'THE COLD SOVEREIGN', x0: 3600, x1: 5200, backdrop: 'storm3', floor: 'deck',
      props: [
        { type: 'keg', x: 3760, z: 30, drops: KEGS }, { type: 'crate', x: 3940, z: 116, drops: ['brassCog', 'brassCog'] },
        { type: 'locker', x: 4120, z: 20, drops: 'goldenSprocket' }, { type: 'ballast', x: 4300, z: 112, drops: 'meatPie' },
        { type: 'urn', x: 4460, z: 24, drops: 'brassHeart' },
        { type: 'keg', x: 4620, z: 110, drops: KEGS }, { type: 'ballast', x: 4700, z: 26, drops: 'meatPie' },
      ],
      // the masts earth the storm all along the weather deck; the bridge dais keeps two of them
      hazards: [
        { type: 'lightning', x: 3880, z: 100, period: 210, active: 12, tell: 40 },
        { type: 'lightning', x: 4260, z: 36, period: 210, active: 12, tell: 40, offset: 105 },
        { type: 'lightning', x: 4560, z: 104, period: 210, active: 12, tell: 40, offset: 60 },
      ],
      /** The bridge dais: the deck edge vents steam as the Admiral's coil eats the ship (5 damage every 20f inside). */
      zones: [{ type: 'daisVents', x0: 4760, x1: 5200 }],
      waves: [
        { triggerX: 3900, lock: true, spawns: [{ type: C, variant: 'marine', side: 'right', z: 60, delay: 0 },
          { type: C, variant: 'corsair', side: 'left', z: 20, delay: 40 }, { type: C, variant: 'corsair', side: 'right', z: 120, delay: 70 },
          ...crimp(2, { z0: 80, delay0: 90 })] },
        { triggerX: 4280, lock: true, spawns: [{ type: C, variant: 'galewright', side: 'right', z: 40, delay: 0 },
          { type: C, variant: 'galewright', side: 'left', z: 110, delay: 40 }, { type: C, variant: 'bosun', side: 'right', z: 70, delay: 80 },
          ...crimp(3, { z0: 20, delay0: 60 })] },
        // the last line: two Marines, the Wing's remaining coils, and a pair of Brassbound the Concordat left aboard
        { triggerX: 4640, lock: true, spawns: [
          { type: C, variant: 'marine', side: 'right', z: 50, delay: 0 }, { type: C, variant: 'marine', side: 'left', z: 100, delay: 50 },
          { type: C, variant: 'galewright', side: 'right', z: 118, delay: 90 },
          { type: B, variant: 'footman', side: 'left', z: 30, delay: 120 }, { type: B, variant: 'footman', side: 'right', z: 80, delay: 150 },
          ...crimp(2, { z0: 60, delay0: 100 }),
        ] },
      ],
      events: [],
    },
  ],
  /** Quartermaster Skree holds the winch bay at the far end of the gas-halls. */
  midboss: { atX: 3400, def: 'midboss2', arena: { x0: 3120, x1: 3600 }, intro: { name: 'QUARTERMASTER SKREE', sub: '& THE GRAPNEL WINCH' } },
  /** The Admiral is waiting on the bridge dais (the tower is drawn at the end of the storm3 backdrop). */
  boss: { atX: 5100, def: 'boss2', arena: { x0: 4760, x1: 5200 }, camera: { x0: 4560, x1: 5200 }, intro: { name: 'ADMIRAL ODALINE KESTREL', sub: 'THE NINTH WING' } },
};
