// Stage 3: The Reckoning of Calderwick (docs/STAGE3.md section 5). Same data format as stage1.js / stage2.js
// (ARCHITECTURE.md section 7 + RECONCILIATION `zones` / `transition` / `mode: 'locked'` + `timedWaves`), four sections:
// the lime road up to the company's works, the cart lane that carries you down to the kiln head (one locked screen),
// the tallow works themselves, and the ledger house at the end of them.
// Enemy slugs come from content/enemies. THE RATIO RULE (issue #28): the closer to the ledger, the more machines and
// the fewer people. The Chandlery works on the Sootborn who took the company's coal scrip on the road (`scrip`: they
// never flee), on the Brassbound it tips out of handcarts in the works — pre-crusted by the Limeburners (`crusted`) —
// and on the re-wound Brassbound standing in the Ledger House. So the board is three factions and one of them is
// standing behind the other two, keeping them up.
const C = 'chandler', B = 'brassbound', S = 'sootborn';
/**
 * Helper: n spawns of one enemy, alternating sides, spread over z lanes and delays. `mods` (traits.js SPAWN_MODS)
 * rides on every spawn of the group — the census counts footman+crusted as its own variant, and so does the player.
 */
function group(type, variant, n, { side = 'alt', z0 = 40, dz = 30, delay0 = 0, ddelay = 30, mods = null } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = side === 'alt' ? (i % 2 ? 'left' : 'right') : side;
    const e = { type, variant, side: s, z: ((z0 + i * dz) % 120) + 10, delay: delay0 + i * ddelay };
    if (mods) e.mods = mods;
    out.push(e);
  }
  return out;
}
/** One spawn with modifiers: a single named enemy on a side, a lane and a delay. */
const one = (type, variant, side, z, delay, mods = null) => (mods ? { type, variant, side, z, delay, mods } : { type, variant, side, z, delay });
/** Wickboys come in pairs from both sides: they are not the threat, they are the reason the threat gets back up. */
const wick = (n, o) => group(C, 'wickboy', n, { ddelay: 26, ...o });
/** Cutthroats on the company's scrip: they rush in from both sides and they do not run when it goes wrong. */
const scrip = (n, o) => group(S, 'cutthroat', n, { ddelay: 24, mods: ['scrip'], ...o });
/** Tin Footmen the Limeburners have already crusted: one hit of frame armour before the tin shows. */
const crusted = (n, o) => group(B, 'footman', n, { ddelay: 30, mods: ['crusted'], ...o });
const SCRIP = ['coalScrip'];
const COGS = ['brassCog', 'brassCog'];
const LIME = '#D8FF6E';

export const stage3 = {
  id: 'stage3', number: 3, name: 'THE RECKONING OF CALDERWICK',
  subtitle: 'THE WAR IS OVER. THE COMPANY IS STILL BILLING FOR IT.',
  // BOARD SELECT vignette (game/screens/boardselect.js): sky ramp, ground band, accent light, motif to draw.
  // groundH 0: the `works` motif paints its own road band, so the handcart can stand IN the road rather than on
  // top of a band drawn over it (game/screens/boardselect.js drawWorksMotif).
  preview: { skyTop: '#C8C4B4', skyBot: '#EAE4D2', ground: '#B9AF95', groundH: 0, accent: LIME, motif: 'works', blurb: 'THE CHANDLERY' },
  introLines: [
    'THE CHANCELLOR IS DOWN. THE ADMIRAL IS DOWN.',
    'SOMEBODY SUPPLIED THEM BOTH, AND IS ALREADY QUOTING FOR THE NEXT ONE.',
    'THE BRASSGUARD ARE GOING DOWN THE LIME ROAD TO CLOSE THE ACCOUNT.',
  ],
  length: 5300,
  /** `midboss3` is the board's own mid-boss track (docs/STAGE3.md section 6): a harpsichord ledger-tick with a kiln clang. */
  music: { works1: 'works1', works2: 'works2', works3: 'works3', midboss: 'midboss3', boss: 'ledgerboss' },
  /** Per-board banner text (game/stage.js): the mid-boss plate and the stage-clear line. */
  banners: { midbossDown: 'YARDMASTER DEFEATED', clear: 'THE ACCOUNT IS CLOSED' },
  sections: [
    // ---------------------------------------------------------------- Section 1: The Lime Road (flat morning, open ground)
    // PEOPLE, NO MACHINES: seven Chandlers' worth of rites on a road gang of Sootborn who took the company's scrip.
    { id: 'w1', name: 'THE LIME ROAD', x0: 0, x1: 1800, backdrop: 'works1', floor: 'road',
      // the board-3 family on the road: lime sacks (a Meat Pie under the quicklime), a tally board (the company's scrip), the carts
      props: [
        { type: 'crate', x: 280, z: 32, drops: COGS }, { type: 'keg', x: 520, z: 116, drops: SCRIP },
        { type: 'cart', x: 880, z: 26, drops: 'meatPie' }, { type: 'limeSack', x: 1140, z: 112, drops: 'meatPie' },
        { type: 'tallyBoard', x: 1300, z: 18, drops: SCRIP }, { type: 'crate', x: 1520, z: 118, drops: COGS },
        { type: 'keg', x: 1740, z: 30, drops: SCRIP },
      ],
      // the roadside lime pits blow off (quicklime: blinded, no launch), and every ten seconds a runaway lime wagon
      // rolls the WHOLE road leftward along the middle rut — the one hazard on the board you hear coming from off screen
      hazards: [
        { type: 'limePit', x: 620, z: 104, period: 180, active: 40, tell: 30 },
        { type: 'wagon', x: 1780, x1: 20, z: 70, period: 600, tell: 45, speed: 4 },
        { type: 'limePit', x: 1540, z: 38, period: 180, active: 40, tell: 30, offset: 90 },
      ],
      /** Issue #31: a slaking pit open in the road. Falling in costs an enemy the round (+200) and a player 8% of max
       *  HP and their footing -- health, not a life. It takes the back lanes only, so the road is never actually shut. */
      zones: [{ type: 'solid', x0: 1180, x1: 1216, z0: 16, z1: 66, height: 0 }],
      waves: [
        // the first rite you will ever see: three Wickboys, and the one you are hitting keeps getting back up (fodder only)
        { triggerX: 400, lock: true, spawns: wick(3, { z0: 40 }) },
        // the Runner: he is not here for you, he is here to light the Wickboys' rites before you can break them
        { triggerX: 880, lock: true, spawns: [
          ...wick(2, { z0: 30, dz: 60 }),
          one(C, 'runner', 'right', 70, 30),
          ...scrip(2, { z0: 90, dz: 40, delay0: 60 }),
        ] },
        { triggerX: 1280, lock: true, spawns: [
          one(C, 'tallyman', 'right', 24, 0),
          one(C, 'limeburner', 'left', 96, 30),
          ...scrip(2, { z0: 50, dz: 60, delay0: 60 }),
          one(C, 'runner', 'left', 40, 120),
        ] },
        { triggerX: 1660, lock: true, spawns: [
          one(C, 'limeburner', 'right', 60, 0),
          one(C, 'tallyman', 'left', 118, 30),
          ...wick(1, { z0: 30, delay0: 60 }),
          one(S, 'slinger', 'right', 20, 90, ['scrip']), one(S, 'slinger', 'left', 110, 120, ['scrip']),
          one(S, 'wrangler', 'right', 70, 150, ['scrip']),
        ] },
      ],
      events: [],
      /** The works' cargo lift takes the road party down into the yard — onto the cart lane. */
      transition: { kind: 'lift', atX: 1740, gateX: 1800 },
    },
    // ---------------------------------------------------------------- Section 2: The Cart Lane (one locked screen, timed waves)
    // THE SET PIECE: the company's traverser belt runs the front of the lane and carries everything on it — carts,
    // crates, the fight — down to the kiln head at the left, whose draw runs the full width of the lane. The first
    // machines on the board come out of handcarts here, and the Drayman is the man who sends the carts down.
    { id: 'w2', name: 'THE CART LANE', x0: 1800, x1: 2440, backdrop: 'works2', floor: 'cobble', mode: 'locked',
      /** Auto-scroll of the far / mid parallax (px per frame, works2.js): the lane is moving and so is the yard behind it. */
      drift: 0.3,
      // two handcarts (a live Tin Footman tips out of each; the second one was crusted before it was loaded); the second
      // cart stands ON the belt at the far end and rides it down toward the kiln head
      props: [
        { type: 'limeSack', x: 1920, z: 28, drops: 'meatPie' },
        { type: 'handcart', x: 2080, z: 34 },
        { type: 'keg', x: 2220, z: 26, drops: SCRIP },
        { type: 'bucket', x: 2380, z: 62, drops: 'roastBird' },
        { type: 'handcart', x: 2410, z: 120, release: { type: B, variant: 'footman', mods: ['crusted'] } },
      ],
      // the kiln head at the belt's end (x 1972..2028, its cone reaching the whole floor band so the belt feeds INTO it;
      // the arrival spot x 1870..1910 stays clear) and a tallow vat boiling over on the back lane
      hazards: [
        { type: 'kilnMouth', x: 2000, z: 12, period: 300, tell: 36, active: 14, reach: 128, halfW: 28 },
        { type: 'tallowVat', x: 2300, z: 40, period: 240, tell: 40, active: 30 },
      ],
      /** the belt: the front 40px of the lane drift everything LEFT at 1px/f for the whole section, a crate every 4s at its head */
      zones: [{ type: 'conveyor', x0: 1990, x1: 2440, z0: 100, active: true }],
      waves: [],
      timedWaves: [
        // the Drayman: the first Chandler who is a threat on his own — and the last of the scrip hands, following you into the yard
        { at: 0, spawns: [
          one(C, 'drayman', 'right', 70, 0),
          ...wick(2, { z0: 30, dz: 80, delay0: 30 }),
          ...scrip(1, { z0: 100, delay0: 90 }),
        ] },
        // the first machines on the board walk in on their own feet; the Limeburner is here to crust them
        { at: 20, spawns: [
          one(B, 'footman', 'right', 40, 0), one(B, 'footman', 'left', 100, 30),
          one(C, 'limeburner', 'right', 80, 60),
          one(C, 'runner', 'left', 30, 90),
        ] },
        // the Resurrection Man, and two Tin Footmen who were crusted before they were loaded
        { at: 45, banner: 'THE CARTS COME DOWN', spawns: [
          one(C, 'resurrectionist', 'right', 70, 0),
          ...crusted(2, { z0: 30, dz: 80, delay0: 30 }),
          ...scrip(1, { z0: 110, delay0: 90 }),
        ] },
        { at: 75, spawns: [
          one(B, 'sapper', 'right', 30, 0), one(B, 'sapper', 'left', 110, 30),
          one(C, 'tallyman', 'right', 70, 60),
          ...wick(1, { z0: 50, delay0: 90 }),
        ] },
      ],
      events: [],
      /** The belt stops at the yard gate; the counting-house's yard door is shown open and you go through it. */
      transition: { kind: 'dock', banner: 'THE YARD GATE', look: 'door', pies: 1 },
    },
    // ---------------------------------------------------------------- Section 3: The Tallow Works (the company's yard)
    // MACHINES AND PEOPLE: the yard is where the Chandlery works on the Brassbound it has put back on their feet.
    { id: 'w3', name: 'THE TALLOW WORKS', x0: 2440, x1: 3600, backdrop: 'works2', floor: 'cobble',
      /** Issue #32: the yard hoist takes the whole floor up a storey to the kiln head, where the Yardmaster is
       *  waiting (his arena at 3120..3600 IS the top of it). Nothing on the deck moves — you are standing on the
       *  thing that is climbing — but a body in the air is not, and the floor closes on it: a jump lands sooner than
       *  it looks like it should for as long as the climb lasts. */
      platform: { kind: 'hoist', frames: 1200, rise: 0.9 },
      props: [
        { type: 'keg', x: 2520, z: 120, drops: SCRIP },
        { type: 'handcart', x: 2700, z: 30, release: { type: B, variant: 'halberdier', mods: ['crusted'] } },
        { type: 'bucket', x: 2860, z: 120, drops: 'roastBird' }, { type: 'urn', x: 2960, z: 24, drops: 'brassHeart' },
        { type: 'tallyBoard', x: 3080, z: 118, drops: SCRIP },
        { type: 'keg', x: 3300, z: 30, drops: SCRIP }, { type: 'limeSack', x: 3460, z: 116, drops: 'meatPie' },
        { type: 'handcart', x: 3086, z: 70, hp: 60, barricade: true },
      ],
      // the tallow vats boil over on both lanes, the draw-kiln in the shed wall flashes its cone across the back lane,
      // and the yard crane keeps its hook swinging over the middle of it
      hazards: [
        { type: 'tallowVat', x: 2600, z: 106, period: 240, tell: 40, active: 30 },
        { type: 'kilnMouth', x: 2760, z: 12, period: 300, tell: 36, active: 14 },
        { type: 'hook', x: 2880, z: 66, period: 120 },
        { type: 'tallowVat', x: 3040, z: 34, period: 240, tell: 40, active: 30, offset: 120 },
      ],
      /** Issue #31: a loaded handcart shoved across the yard mouth. The cart owns the health and the drops; the paired
       *  `solid` owns the geometry, and the wave will not clear while it stands. Breaking it tips out the Tin Footman
       *  the cart was carrying (the `handcart` type's own `release`) -- the board's whole conceit, as an obstacle. */
      zones: [{ type: 'solid', x0: 3060, x1: 3112, z0: 0, z1: 140, height: 46, breakable: true }],
      waves: [
        // the Purser: the company's dram, on a Limeburner who is about to crust a Sapper
        { triggerX: 2800, lock: true, spawns: [
          one(C, 'limeburner', 'right', 40, 0),
          one(C, 'purser', 'left', 90, 30),
          ...wick(1, { z0: 60, delay0: 60 }),
          one(B, 'sapper', 'right', 110, 90),
        ] },
        { triggerX: 3000, lock: true, spawns: [
          one(C, 'drayman', 'right', 70, 0),
          one(C, 'tallyman', 'left', 116, 30),
          ...crusted(2, { z0: 30, dz: 60, delay0: 60 }),
          one(C, 'runner', 'left', 50, 120),
        ] },
        // the Halberdiers: the first re-wound Brassbound with a reach, out of the Resurrection Man's cart
        { triggerX: 3240, lock: true, spawns: [
          one(C, 'resurrectionist', 'right', 70, 0),
          one(B, 'halberdier', 'left', 40, 30), one(B, 'halberdier', 'right', 110, 60),
          ...wick(1, { z0: 30, delay0: 90 }),
          ...scrip(1, { z0: 90, delay0: 120 }),
        ] },
      ],
      events: [],
      /** Past the kiln head the counting-house doors come up and you go in. */
      transition: { kind: 'board', atX: 3540, gateX: 3600 },
    },
    // ---------------------------------------------------------------- Section 4: The Ledger House (interior)
    // MACHINES, AND THE PEOPLE WHO WOUND THEM: the Brassbound outnumber everyone else for the first time on the board.
    { id: 'w4', name: 'THE LEDGER HOUSE', x0: 3600, x1: 5300, backdrop: 'works3', floor: 'board',
      props: [
        { type: 'cabinet', x: 3760, z: 20, drops: 'goldenSprocket' }, { type: 'ledgerStack', x: 3900, z: 116, drops: COGS },
        { type: 'case', x: 4120, z: 22, drops: 'goldenSprocket' }, { type: 'tallyBoard', x: 4300, z: 112, drops: SCRIP },
        { type: 'urn', x: 4460, z: 26, drops: 'meatPie' }, { type: 'ledgerStack', x: 4640, z: 112, drops: COGS },
        { type: 'cabinet', x: 4760, z: 24, drops: 'aetherVial' }, { type: 'urn', x: 5020, z: 118, drops: 'meatPie' },
      ],
      // the house drops its ledgers off the galleries (a growing shadow, then the book lands), and one lime lamp on the
      // counting floor is a pit: the lamp is the tell
      hazards: [
        { type: 'ledgerDrop', name: 'galleries', x: 3980, z: 100, period: 240, tell: 36, active: 8 },
        { type: 'ledgerDrop', name: 'galleries', x: 4320, z: 40, period: 240, tell: 36, active: 8, offset: 120 },
        { type: 'limePit', x: 4560, z: 110, period: 180, tell: 30, active: 40 },
      ],
      /** The counting floor: the desk edge vents lime as the Factor's harness eats the room (4 damage every 30f inside). */
      zones: [{ type: 'daisVents', x0: 4880, x1: 5300, color: LIME }],
      waves: [
        { triggerX: 3900, lock: true, spawns: [
          one(C, 'resurrectionist', 'right', 60, 0),
          ...wick(1, { z0: 24, delay0: 30 }),
          ...crusted(2, { z0: 100, dz: 60, delay0: 60 }),
          one(C, 'runner', 'left', 70, 120),
        ] },
        // a re-wound Chrome Duelist: the company has got as far as Vane's officers
        { triggerX: 4240, lock: true, spawns: [
          one(C, 'purser', 'right', 44, 0),
          one(C, 'limeburner', 'left', 110, 30),
          one(B, 'halberdier', 'right', 70, 60), one(B, 'halberdier', 'left', 20, 90),
          one(B, 'duelist', 'right', 100, 120),
        ] },
        { triggerX: 4560, lock: true, spawns: [
          one(C, 'tallyman', 'left', 118, 0),
          one(B, 'sapper', 'right', 30, 30),
          one(B, 'warden', 'right', 70, 60),
          one(C, 'drayman', 'left', 50, 90),
        ] },
        // the war, restarted, in one wave: the elite pair together for the only time on the board, Vane's iron and chrome
        // with the company standing behind them — and when it is nearly over, the company sends more hands
        { triggerX: 4880, lock: true, spawns: [
          one(C, 'resurrectionist', 'right', 50, 0),
          one(C, 'purser', 'left', 90, 30),
          one(B, 'footman', 'left', 30, 60), one(B, 'footman', 'right', 74, 90),
          one(B, 'warden', 'right', 108, 120),
          one(B, 'duelist', 'left', 60, 150),
        ], reinforcements: [{ whenRemaining: 2, spawns: [...wick(2, { z0: 30, dz: 80 }), one(C, 'runner', 'left', 70, 60)] }] },
      ],
      /**
       * THE LAMPS GO GREEN (issue #33). The company's lime lamps come up all down the counting floor and the house
       * answers: the galleries start dropping ledgers twice as fast, and the Chandlery sends down everyone it has
       * left -- a Resurrection Man and two Tallymen, all at once, all marking the floor. The board's whole thesis in
       * one moment: you cannot cancel every rite, so you pick. The lamps themselves are the two-second warning, and
       * the gallery retiming reverts with the event.
       */
      events: [
        { id: 'lampsgreen', onWaveClear: 2, once: true, actions: [
          { caption: 'THE LAMPS GO GREEN', sub: 'THE HOUSE IS COUNTING', life: 150 },
          { sfx: 'chime' }, { music: 'midboss3' },
          { zoneFlash: { x0: 3700, x1: 4800, z0: 0, z1: 140, frames: 240, color: '#D8FF6E' } },
          { wait: 120 },
          { hazardSet: { name: 'galleries', period: 120 } },
          { camera: { shake: 5, frames: 18 } },
          // Tallymen and a Limeburner, deliberately NOT the Resurrection Man: his RECREW tips a fresh Tin Footman out
          // of the cart on a timer, so an event that spawns him hands the wave lock an enemy source that never runs
          // dry and the section can never clear. See the SPAWN rule in game/events.js.
          { spawn: [
            { type: 'chandler', variant: 'tallyman', z: 30, delay: 0, entrance: { kind: 'teleport', dx: -110 } },
            { type: 'chandler', variant: 'limeburner', z: 70, delay: 40, entrance: { kind: 'teleport', dx: 0 } },
            { type: 'chandler', variant: 'tallyman', z: 116, delay: 80, entrance: { kind: 'teleport', dx: 110 } },
          ] },
          { wait: 600 },
        ] },
      ],
    },
  ],
  /** Yardmaster Marl holds the kiln head at the far end of the works. */
  midboss: { atX: 3400, def: 'midboss3', arena: { x0: 3120, x1: 3600 }, intro: { name: 'YARDMASTER MARL', sub: '& THE LIME KILN' } },
  /** The Factor is waiting at the desk on the counting floor (drawn at the end of the works3 backdrop). */
  boss: { atX: 5200, def: 'boss3', arena: { x0: 4880, x1: 5300 }, camera: { x0: 4660, x1: 5300 }, intro: { name: 'FACTOR ORIEL HASP', sub: 'THE CHANDLERY OF CALDERWICK' } },
};
