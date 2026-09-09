// Stage 3: The Reckoning of Calderwick (docs/STAGE3.md section 5). Same data format as stage1.js / stage2.js
// (ARCHITECTURE.md section 7 + RECONCILIATION `zones` / `transition`), three sections: the lime road up to the
// company's works, the tallow works themselves, and the ledger house at the end of them.
// Enemy slugs come from content/enemies: the Chandlery works on the Sootborn who took the company's scrip and, from
// the works onward, on the Brassbound it has put back on their feet — so the board is three factions and one of them
// is standing behind the other two, keeping them up.
const C = 'chandler', B = 'brassbound', S = 'sootborn';
/** Helper: n spawns of one enemy, alternating sides, spread over z lanes and delays. */
function group(type, variant, n, { side = 'alt', z0 = 40, dz = 30, delay0 = 0, ddelay = 30 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = side === 'alt' ? (i % 2 ? 'left' : 'right') : side;
    out.push({ type, variant, side: s, z: ((z0 + i * dz) % 120) + 10, delay: delay0 + i * ddelay });
  }
  return out;
}
/** Wickboys come in pairs from both sides: they are not the threat, they are the reason the threat gets back up. */
const wick = (n, o) => group(C, 'wickboy', n, { ddelay: 26, ...o });
const cut = (n, o) => group(S, 'cutthroat', n, { ddelay: 20, ...o });
const SCRIP = ['coalScrip'];
const COGS = ['brassCog', 'brassCog'];

export const stage3 = {
  id: 'stage3', number: 3, name: 'THE RECKONING OF CALDERWICK',
  subtitle: 'THE WAR IS OVER. THE COMPANY IS STILL BILLING FOR IT.',
  // BOARD SELECT vignette (game/screens/boardselect.js): sky ramp, ground band, accent light, motif to draw.
  preview: { skyTop: '#C8C4B4', skyBot: '#EAE4D2', ground: '#B9AF95', groundH: 12, accent: '#D8FF6E', motif: 'works', blurb: 'THE CHANDLERY' },
  introLines: [
    'THE CHANCELLOR IS DOWN. THE ADMIRAL IS DOWN.',
    'SOMEBODY SUPPLIED THEM BOTH, AND IS ALREADY QUOTING FOR THE NEXT ONE.',
    'THE BRASSGUARD ARE GOING DOWN THE LIME ROAD TO CLOSE THE ACCOUNT.',
  ],
  length: 5300,
  music: { works1: 'works1', works2: 'works2', works3: 'works3', midboss: 'midboss', boss: 'ledgerboss' },
  /** Per-board banner text (game/stage.js): the mid-boss plate and the stage-clear line. */
  banners: { midbossDown: 'YARDMASTER DEFEATED', clear: 'THE ACCOUNT IS CLOSED' },
  sections: [
    // ---------------------------------------------------------------- Section 1: The Lime Road (flat morning, open ground)
    { id: 'w1', name: 'THE LIME ROAD', x0: 0, x1: 1800, backdrop: 'works1', floor: 'road',
      props: [
        { type: 'crate', x: 280, z: 32, drops: COGS }, { type: 'keg', x: 520, z: 116, drops: SCRIP },
        { type: 'cart', x: 880, z: 26, drops: 'meatPie' }, { type: 'crate', x: 1140, z: 112, drops: COGS },
        { type: 'locker', x: 1280, z: 18, drops: 'goldenSprocket' }, { type: 'ballast', x: 1520, z: 118, drops: 'meatPie' },
        { type: 'keg', x: 1740, z: 36, drops: SCRIP },
      ],
      // the roadside lime pits blow off, and the wagon crane still swings its loading hook over the ruts
      hazards: [
        { type: 'steamVent', x: 620, z: 104, period: 180, active: 50, tell: 24 },
        { type: 'hook', x: 1120, z: 70, period: 120 },
        { type: 'steamVent', x: 1540, z: 38, period: 180, active: 50, tell: 24, offset: 90 },
      ],
      waves: [
        // the first rite you will ever see: three Wickboys, and the one you are hitting keeps getting back up
        { triggerX: 400, lock: true, spawns: wick(3, { z0: 40 }) },
        { triggerX: 880, lock: true, spawns: [...wick(2, { z0: 30 }), ...cut(2, { z0: 90, delay0: 40 })] },
        { triggerX: 1280, lock: true, spawns: [
          { type: C, variant: 'tallyman', side: 'right', z: 24, delay: 0 },
          { type: C, variant: 'limeburner', side: 'left', z: 96, delay: 40 },
          ...cut(2, { z0: 50, delay0: 60 }),
        ] },
        { triggerX: 1660, lock: true, spawns: [
          { type: C, variant: 'limeburner', side: 'right', z: 60, delay: 0 },
          { type: C, variant: 'tallyman', side: 'left', z: 118, delay: 40 },
          ...wick(2, { z0: 30, dz: 60, delay0: 30 }),
          { type: S, variant: 'slinger', side: 'right', z: 20, delay: 90 }, { type: S, variant: 'slinger', side: 'left', z: 110, delay: 120 },
        ] },
      ],
      events: [],
      /** The works' cargo lift takes the road party down into the yard. */
      transition: { kind: 'lift', atX: 1740, gateX: 1800 },
    },
    // ---------------------------------------------------------------- Section 2: The Tallow Works (the company's yard)
    { id: 'w2', name: 'THE TALLOW WORKS', x0: 1800, x1: 3600, backdrop: 'works2', floor: 'cobble',
      props: [
        { type: 'cart', x: 1960, z: 28, drops: 'meatPie' }, { type: 'keg', x: 2140, z: 114, drops: SCRIP },
        { type: 'crate', x: 2320, z: 30, drops: COGS }, { type: 'locker', x: 2500, z: 20, drops: 'goldenSprocket' },
        { type: 'bucket', x: 2740, z: 118, drops: 'roastBird' }, { type: 'urn', x: 2960, z: 24, drops: 'brassHeart' },
        { type: 'keg', x: 3120, z: 108, drops: SCRIP }, { type: 'crate', x: 3300, z: 34, drops: COGS },
      ],
      // the yard's draw-kilns blow off along the cart lanes; the yard crane keeps a hook over the middle of it
      hazards: [
        { type: 'steamVent', x: 2180, z: 106, period: 180, active: 50, tell: 24 },
        { type: 'hook', x: 2600, z: 66, period: 130 },
        { type: 'steamVent', x: 3020, z: 34, period: 180, active: 50, tell: 24, offset: 90 },
      ],
      waves: [
        { triggerX: 2100, lock: true, spawns: [
          { type: C, variant: 'limeburner', side: 'right', z: 40, delay: 0 },
          ...wick(2, { z0: 90, delay0: 30 }), ...cut(1, { z0: 60, delay0: 70 }),
        ] },
        { triggerX: 2560, lock: true, spawns: [
          { type: C, variant: 'purser', side: 'right', z: 60, delay: 0 },
          { type: C, variant: 'tallyman', side: 'left', z: 116, delay: 40 },
          { type: B, variant: 'sapper', side: 'right', z: 20, delay: 80 }, { type: B, variant: 'sapper', side: 'left', z: 96, delay: 110 },
        ] },
        // the first cart, and the first thing you see come out of one
        { triggerX: 3040, lock: true, spawns: [
          { type: C, variant: 'resurrectionist', side: 'right', z: 70, delay: 0 },
          ...wick(1, { z0: 30, delay0: 40 }),
          { type: B, variant: 'footman', side: 'left', z: 40, delay: 60 }, { type: B, variant: 'footman', side: 'right', z: 110, delay: 90 },
        ] },
      ],
      events: [],
      /** Past the kiln head the counting-house doors come up and you go in. */
      transition: { kind: 'board', atX: 3540, gateX: 3600 },
    },
    // ---------------------------------------------------------------- Section 3: The Ledger House (interior)
    { id: 'w3', name: 'THE LEDGER HOUSE', x0: 3600, x1: 5300, backdrop: 'works3', floor: 'board',
      props: [
        { type: 'cabinet', x: 3760, z: 20, drops: 'goldenSprocket' }, { type: 'crate', x: 3940, z: 116, drops: COGS },
        { type: 'case', x: 4120, z: 22, drops: 'goldenSprocket' }, { type: 'keg', x: 4300, z: 112, drops: SCRIP },
        { type: 'urn', x: 4460, z: 26, drops: 'meatPie' },
        { type: 'crate', x: 4620, z: 110, drops: COGS }, { type: 'cabinet', x: 4740, z: 24, drops: 'goldenSprocket' },
      ],
      // the house kilns vent along the counting floor, and the wax press keeps swinging its hook over the desks
      hazards: [
        { type: 'steamVent', x: 3980, z: 100, period: 170, active: 50, tell: 24 },
        { type: 'hook', x: 4260, z: 68, period: 120 },
        { type: 'steamVent', x: 4520, z: 36, period: 170, active: 50, tell: 24, offset: 85 },
      ],
      /** The counting floor: the desk edge vents lime as the Factor's harness eats the room (5 damage every 20f inside). */
      zones: [{ type: 'daisVents', x0: 4880, x1: 5300, color: '#D8FF6E' }],
      waves: [
        { triggerX: 3900, lock: true, spawns: [
          { type: C, variant: 'resurrectionist', side: 'right', z: 60, delay: 0 },
          ...wick(2, { z0: 24, delay0: 40 }),
          { type: B, variant: 'footman', side: 'left', z: 100, delay: 70 }, { type: B, variant: 'footman', side: 'right', z: 34, delay: 100 },
        ] },
        { triggerX: 4300, lock: true, spawns: [
          { type: C, variant: 'purser', side: 'right', z: 44, delay: 0 },
          { type: C, variant: 'limeburner', side: 'left', z: 110, delay: 40 },
          { type: B, variant: 'halberdier', side: 'right', z: 70, delay: 80 }, { type: B, variant: 'halberdier', side: 'left', z: 20, delay: 110 },
          ...wick(1, { z0: 90, delay0: 60 }),
        ] },
        // the war, restarted, in one wave: two carts' worth of Brassbound with the company standing behind them
        { triggerX: 4680, lock: true, spawns: [
          { type: C, variant: 'resurrectionist', side: 'right', z: 50, delay: 0 },
          { type: C, variant: 'tallyman', side: 'left', z: 118, delay: 40 },
          { type: C, variant: 'purser', side: 'right', z: 90, delay: 90 },
          { type: B, variant: 'footman', side: 'left', z: 30, delay: 60 }, { type: B, variant: 'footman', side: 'right', z: 74, delay: 120 },
          { type: B, variant: 'warden', side: 'left', z: 108, delay: 150 },
        ] },
      ],
      events: [],
    },
  ],
  /** Yardmaster Marl holds the kiln head at the far end of the works. */
  midboss: { atX: 3400, def: 'midboss3', arena: { x0: 3120, x1: 3600 }, intro: { name: 'YARDMASTER MARL', sub: '& THE LIME KILN' } },
  /** The Factor is waiting at the desk on the counting floor (drawn at the end of the works3 backdrop). */
  boss: { atX: 5200, def: 'boss3', arena: { x0: 4880, x1: 5300 }, camera: { x0: 4660, x1: 5300 }, intro: { name: 'FACTOR ORIEL HASP', sub: 'THE CHANDLERY OF CALDERWICK' } },
};
