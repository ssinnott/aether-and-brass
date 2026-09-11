// Stage 2: The Storm Above Calderwick (docs/STAGE2.md section 5). Same data format as stage1.js
// (ARCHITECTURE.md section 7 + RECONCILIATION `zones` / `transition`), four sections: the mooring spine, the gas-halls of a
// captured freighter, one locked screen on the flagship's gun deck while she banks, and the run along her bridge deck.
// Two factions (issue #28). The Stormcrows are the board; the Brassbound are its clockwork marines, and the rule is THE HIGHER
// YOU BOARD, THE MORE CLOCKWORK: `mods: ['holdout']` Brassbound are the Concordat machines the Wing never unbolted (sections
// 1-2, dead-grey lens, slow, 1.3x hp), the un-modded ones are the machines the Wing re-wound for its boarding parties (3-4).
// Enemy slugs come from content/enemies; spawn modifiers from game/traits.js SPAWN_MODS.
const C = 'stormcrow', B = 'brassbound';
/** Helper: n spawns of one enemy, alternating sides, spread over z lanes and delays; `mods` rides every spawn. */
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
/** Crimpers come in off both sides at once — they are the wave's pressure, not its threat. */
const crimp = (n, o) => group(C, 'crimper', n, { ddelay: 22, ...o });
/** Deckhands: the pressed crew, fodder with no wing-pack; what you throw off the Spine. */
const hands = (n, o) => group(C, 'deckhand', n, { ddelay: 26, ...o });
/** One Brassbound the Wing never unbolted (SPAWN_MODS.holdout). */
const holdout = (variant, side, z, delay) => ({ type: B, variant, side, z, delay, mods: ['holdout'] });
const KEGS = ['coalScrip'];
const COGS = ['brassCog', 'brassCog'];

export const stage2 = {
  id: 'stage2', number: 2, name: 'THE STORM ABOVE CALDERWICK',
  subtitle: 'THE SKY IS OPEN. THE NINTH WING HAS DECIDED TO CLOSE IT AGAIN.',
  // BOARD SELECT vignette (game/screens/boardselect.js): sky ramp, ground band, accent light, motif to draw.
  // The accent is the board's own storm violet (ART_STYLE 4 keeps aether cyan for Concordat machinery).
  preview: { skyTop: '#141A32', skyBot: '#E0A070', ground: '#454D5A', groundH: 0, accent: '#9B7BFF', motif: 'sky', blurb: 'STORMCROWS & BRASSBOUND' },
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
        { type: 'crate', x: 300, z: 34, drops: COGS }, { type: 'keg', x: 520, z: 116, drops: KEGS },
        { type: 'ballast', x: 900, z: 24, drops: 'meatPie' }, { type: 'crate', x: 1160, z: 110, drops: COGS },
        { type: 'locker', x: 1290, z: 18, drops: 'goldenSprocket' }, { type: 'keg', x: 1560, z: 118, drops: KEGS },
        { type: 'ballast', x: 1810, z: 40, drops: 'meatPie' },
      ],
      // the storm earths itself through the mooring masts; the loading hook still swings between them
      hazards: [
        { type: 'lightning', x: 700, z: 96, period: 220, active: 12, tell: 40 },
        { type: 'hook', x: 1180, z: 70, period: 120 },
        { type: 'lightning', x: 1620, z: 40, period: 220, active: 12, tell: 40, offset: 110 },
      ],
      /** No bulwark up here: the front and back 12px are open air. Anything thrown over goes into the cloud (+200) — and the
       *  cloud tears sideways: every 7s a gust (45f of gale first) drags everyone on their feet toward one edge or the other. */
      zones: [{ type: 'rails', x0: 0, x1: 1900 }, { type: 'gust', x0: 0, x1: 1900, dir: 0 }],
      waves: [
        // the pressed crew first: three Deckhands, no wing-packs, throwable - learn the rail
        { triggerX: 420, lock: true, spawns: hands(3, { z0: 40 }) },
        { triggerX: 880, lock: true, spawns: [...hands(2, { z0: 30, dz: 60 }), ...crimp(2, { z0: 60, delay0: 30 }),
          { type: C, variant: 'corsair', side: 'left', z: 120, delay: 80 }] },
        // "meet the holdout": the Bosun's keg is in the air, two Crimpers keep you honest, and a Tin Footman the Wing never
        // unbolted walks in off the gantry; two Deckhands only come up the lines once the wave is down
        { triggerX: 1320, lock: true, spawns: [{ type: C, variant: 'bosun', side: 'right', z: 70, delay: 0 }, ...crimp(2, { z0: 30, dz: 60, delay0: 30 }),
          holdout('footman', 'left', 90, 60)],
          reinforcements: [{ whenRemaining: 0, spawns: hands(2, { z0: 40, dz: 60, delay0: 20 }) }] },
        { triggerX: 1720, lock: true, spawns: [
          { type: C, variant: 'bosun', side: 'right', z: 60, delay: 0 },
          { type: C, variant: 'corsair', side: 'left', z: 20, delay: 40 }, { type: C, variant: 'corsair', side: 'right', z: 120, delay: 70 },
          ...crimp(2, { z0: 40, delay0: 60 }),
          holdout('footman', 'left', 100, 110),
        ] },
      ],
      events: [],
      /** The freighter warps in against the spine and the cargo gate comes down: the players board. */
      transition: { kind: 'board', atX: 1840, gateX: 1900 },
    },
    // ---------------------------------------------------------------- Section 2: The Gas-Halls (interior, soft light)
    { id: 'm2', name: 'THE GAS-HALLS', x0: 1900, x1: 3600, backdrop: 'storm2', floor: 'plank',
      // the signal locker holds the Wing's aether flasks here (meter before the winch bay); a powder tub sits under the
      // Bosuns' wave for their kegs to cook
      props: [
        { type: 'ballast', x: 2040, z: 26, drops: 'meatPie' }, { type: 'keg', x: 2210, z: 112, drops: KEGS },
        { type: 'crate', x: 2380, z: 30, drops: COGS }, { type: 'locker', x: 2560, z: 20, drops: 'aetherVial' },
        { type: 'ballast', x: 2760, z: 118, drops: 'meatPie' }, { type: 'powderTub', x: 2900, z: 112 },
        { type: 'bucket', x: 2980, z: 18, drops: 'roastBird' },
        { type: 'keg', x: 3120, z: 108, drops: KEGS }, { type: 'crate', x: 3320, z: 34, drops: COGS },
      ],
      // two gas cells have split: their clouds drift along the catwalk (one left, one right) and stun whoever they roll
      // over - and any fire inside one (a Bosun's keg, a burning body) bursts it; the loading hook still swings over the middle
      hazards: [
        { type: 'gasCell', x: 2300, z: 70, drift: 2 },
        { type: 'hook', x: 2680, z: 66, period: 130 },
        { type: 'gasCell', x: 3060, z: 40, drift: -2, offset: 210 },
      ],
      waves: [
        // the coil arrives: two Galewrights behind a pair of Deckhands
        { triggerX: 2260, lock: true, spawns: [{ type: C, variant: 'galewright', side: 'right', z: 40, delay: 0 },
          { type: C, variant: 'galewright', side: 'left', z: 110, delay: 40 }, ...hands(2, { z0: 60, delay0: 20 })] },
        // the first Marine drops through the netting from the cells above; two holdout Sappers lob bombs into the gas
        { triggerX: 2540, lock: true, spawns: [{ type: C, variant: 'marine', side: 'sky', z: 70, delay: 0, shake: 8 },
          ...crimp(2, { z0: 30, delay0: 40 }), { type: C, variant: 'corsair', side: 'left', z: 118, delay: 80 },
          holdout('sapper', 'right', 20, 100), holdout('sapper', 'left', 120, 130)] },
        // "meet the line": the Grapnel Mate reels you in and throws you BACKWARD; a holdout Halberdier holds the lane behind him
        { triggerX: 2820, lock: true, spawns: [{ type: C, variant: 'grapnel', side: 'right', z: 70, delay: 0 },
          ...crimp(2, { z0: 30, dz: 80, delay0: 30 }), holdout('halberdier', 'left', 60, 80)] },
        // the winch bay's guard: two Bosuns over the powder tub, and the first Footmen the Wing has re-wound
        { triggerX: 3080, lock: true, spawns: [
          { type: C, variant: 'bosun', side: 'right', z: 50, delay: 0 }, { type: C, variant: 'bosun', side: 'left', z: 110, delay: 50 },
          { type: C, variant: 'corsair', side: 'right', z: 20, delay: 80 }, { type: C, variant: 'grapnel', side: 'left', z: 70, delay: 100 },
          { type: B, variant: 'footman', side: 'right', z: 120, delay: 130 }, { type: B, variant: 'footman', side: 'left', z: 30, delay: 160 },
        ] },
      ],
      events: [],
      /** Past the winch bay the hull is open to the weather: a boarding ramp across to the flagship. */
      transition: { kind: 'board', atX: 3540, gateX: 3600 },
    },
    // ---------------------------------------------------------------- Section 3: The Cold Sovereign (the gun deck, one locked screen)
    /** The flagship comes about with the party aboard: the camera locks to the screen, the far sky slides past
     *  (`drift`, storm3.js), the deck banks every 6s (a 1.6 px/f gust, 64px either way) and both gun ports are live. */
    { id: 'm3', name: 'THE COLD SOVEREIGN', x0: 3600, x1: 4240, backdrop: 'storm3', floor: 'deck', mode: 'locked', drift: 0.6,
      // one powder tub at each gun port (they roll 50 and go off 30f after breaking), food and meter amidships
      props: [
        { type: 'powderTub', x: 3760, z: 26 }, { type: 'powderTub', x: 4080, z: 116 },
        { type: 'ballast', x: 3900, z: 118, drops: 'meatPie' }, { type: 'locker', x: 4010, z: 18, drops: 'aetherVial' },
        { type: 'bucket', x: 4170, z: 62, drops: 'roastBird' },
      ],
      // the aft gun at the left edge fires up the back lane (z 4..40); the forward gun at the right edge fires down the front
      // lane (z 100..136) half a cycle later. 45f of the gun running out and the lane lighting, then the shot: 12 + knockdown.
      hazards: [
        { type: 'cannon', x: 3604, z: 22, dir: 1, lane: 36 },
        { type: 'cannon', x: 4236, z: 118, dir: -1, lane: 36, offset: 150 },
      ],
      /** Rails both sides (throw-overs ring out) and the bank: the gust alternates direction each cycle. */
      zones: [{ type: 'rails', x0: 3600, x1: 4240 }, { type: 'gust', x0: 3600, x1: 4240, dir: 0, period: 360, push: 1.6 }],
      waves: [],
      timedWaves: [
        // the gun crew: re-wound Sappers and Footmen under one Deckhand
        { at: 0, spawns: [{ type: B, variant: 'sapper', side: 'right', z: 30, delay: 0 }, { type: B, variant: 'sapper', side: 'left', z: 110, delay: 30 },
          { type: B, variant: 'footman', side: 'left', z: 60, delay: 20 }, { type: B, variant: 'footman', side: 'right', z: 90, delay: 50 },
          { type: C, variant: 'deckhand', side: 'right', z: 120, delay: 80 }] },
        { at: 22, spawns: [{ type: B, variant: 'halberdier', side: 'right', z: 50, delay: 0 }, { type: B, variant: 'halberdier', side: 'left', z: 100, delay: 30 },
          { type: C, variant: 'grapnel', side: 'right', z: 70, delay: 60 }, { type: C, variant: 'corsair', side: 'left', z: 20, delay: 90 }] },
        // the brig below the gun deck opens: the Warden and the two Footmen the Wing kept bolted down there
        { at: 50, banner: 'THE BRIG OPENS', spawns: [{ type: B, variant: 'warden', side: 'right', z: 70, delay: 0 },
          holdout('footman', 'left', 40, 30), holdout('footman', 'left', 110, 60), ...crimp(2, { z0: 20, dz: 100, delay0: 90 })] },
        { at: 80, spawns: [{ type: C, variant: 'galewright', side: 'left', z: 60, delay: 0 }, { type: B, variant: 'warden', side: 'right', z: 80, delay: 30 },
          { type: B, variant: 'sapper', side: 'right', z: 20, delay: 70 }, ...crimp(2, { z0: 40, dz: 80, delay0: 100 })] },
      ],
      events: [],
      /** The ship steadies on her new heading; a companion ladder up to the bridge deck with two Meat Pies at its foot. */
      transition: { kind: 'dock', banner: 'THE SHIP COMES ABOUT', look: 'ladder', pies: 2 },
    },
    // ---------------------------------------------------------------- Section 4: The Bridge (the flagship's upper deck)
    { id: 'm4', name: 'THE BRIDGE', x0: 4240, x1: 5200, backdrop: 'storm3', floor: 'deck',
      props: [
        { type: 'keg', x: 4380, z: 112, drops: KEGS }, { type: 'urn', x: 4460, z: 24, drops: 'brassHeart' },
        { type: 'bucket', x: 4540, z: 118, drops: 'roastBird' }, { type: 'locker', x: 4700, z: 18, drops: 'goldenSprocket' },
        { type: 'ballast', x: 4740, z: 116, drops: 'meatPie' },
      ],
      // two masts earth the storm on the bridge deck, one on each lane and half a cycle apart; no hook up here
      hazards: [
        { type: 'lightning', x: 4420, z: 100, period: 210, active: 12, tell: 40 },
        { type: 'lightning', x: 4640, z: 36, period: 210, active: 12, tell: 40, offset: 105 },
      ],
      /** The bridge dais: the deck edge vents as the Admiral's coil eats the ship — the glow is the board's storm violet. */
      zones: [{ type: 'daisVents', x0: 4760, x1: 5200, color: '#9B7BFF' }],
      waves: [
        // the Admiral's second: a Chrome Duelist the Wing re-wound to fence beside a Marine
        { triggerX: 4600, lock: true, spawns: [{ type: C, variant: 'marine', side: 'right', z: 60, delay: 0 },
          { type: C, variant: 'corsair', side: 'left', z: 20, delay: 40 }, { type: C, variant: 'corsair', side: 'right', z: 120, delay: 70 },
          { type: B, variant: 'duelist', side: 'left', z: 80, delay: 100 }, ...crimp(1, { z0: 100, delay0: 130 })] },
        // the elite pair, together for the only time on the board: the Galewright's arc over the Marine's plate
        { triggerX: 4740, lock: true, spawns: [{ type: C, variant: 'galewright', side: 'right', z: 40, delay: 0 },
          { type: C, variant: 'marine', side: 'left', z: 90, delay: 40 }, { type: B, variant: 'sapper', side: 'right', z: 120, delay: 70 },
          { type: B, variant: 'sapper', side: 'left', z: 20, delay: 100 }, { type: C, variant: 'bosun', side: 'right', z: 70, delay: 130 }] },
        // the last line before the dais
        { triggerX: 4860, lock: true, spawns: [
          { type: B, variant: 'duelist', side: 'right', z: 50, delay: 0 }, { type: B, variant: 'duelist', side: 'left', z: 100, delay: 30 },
          { type: C, variant: 'galewright', side: 'right', z: 118, delay: 70 }, { type: C, variant: 'grapnel', side: 'left', z: 70, delay: 100 },
          { type: C, variant: 'deckhand', side: 'right', z: 20, delay: 130 },
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
