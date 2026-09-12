// Stage 1: The Ascent of Calderwick (GDD section 6). Pure data in the ARCHITECTURE section 7 format
// (+ RECONCILIATION: section 3 is `mode: 'locked'` with `timedWaves`; sections carry `zones` (environment rules, see
// game/hazards.js) and a `transition` (scripted exit, see game/transitions.js)). Enemy type/variant slugs come from content/enemies.
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
const COGS = ['brassCog', 'brassCog'];

export const stage1 = {
  id: 'stage1', name: 'THE ASCENT OF CALDERWICK', subtitle: 'CALDERWICK, CITY OF THE HEART-ENGINE. THE CHANCELLOR HAS SEALED THE SKY.',
  // BOARD SELECT vignette (game/screens/boardselect.js): sky ramp, ground band, accent light, motif to draw.
  preview: { skyTop: '#0E1424', skyBot: '#4A3050', ground: '#2B211C', accent: '#FFB038', motif: 'city', blurb: 'BRASSBOUND & SOOTBORN' },
  length: 6000,
  music: { section1: 'section1', section2: 'section2', section3: 'section3', section4: 'section4', midboss: 'midboss', boss: 'boss' },
  sections: [
    // ---------------------------------------------------------------- Section 1: Sootfoot Docks (rain, night)
    { id: 's1', name: 'SOOTFOOT DOCKS', x0: 0, x1: 1800, backdrop: 'section1', floor: 'planks',
      /** Issue #32: the crane hook at x 1500 is not just swinging any more — it is swinging a loaded cargo pallet,
       *  and the pallet is floor. Stand on it and it carries you; step off and it leaves without you. */
      platform: { kind: 'pallet', x0: 1424, x1: 1508, z0: 38, z1: 102, travel: 72, period: 280, axis: 'x' },
      // SCENE DENSITY (ARCHITECTURE 7, measured by tools/stage-census.js): the quay is authored as beats of two to
      // four, never five. The winch and the bottle open on a pair, the vent and the first quay crate close that beat.
      // Six props where there were eleven, and one of each thing the quay has rather than three loose crates: the
      // winch (Aether Vial), the barrel that still rolls 40px and takes 10 off anything it catches (Coal Scrip), the
      // two crates with someone in them, and the throwable pair (issue #21, GDD 7: an empty hand near either lifts it
      // instead of swinging). The loot the cut props carried rides the survivors -- the pie is inside a quay crate
      // now, so the food and the fight are the same decision.
      props: [
        { type: 'winch', x: 280, z: 14, drops: 'aetherVial' },
        { type: 'bottle', x: 520, z: 96, throwable: true },
        // issue #34: two crates on the quay with someone in them. Break one and a Cutthroat climbs out into 26f you
        // can punish; leave it and it is just a crate -- but what is in it is only loot once you have opened it, so a
        // crate you have walked past is a fight you have not had yet.
        { type: 'crate', x: 760, z: 26, name: 'quay1', drops: ['meatPie'], cargo: [{ type: S, variant: 'cutthroat' }] },
        { type: 'lamp', x: 1080, z: 110, throwable: true },
        { type: 'crate', x: 1400, z: 112, name: 'quay2', drops: COGS, cargo: [{ type: S, variant: 'cutthroat' }] },
        { type: 'barrel', x: 1720, z: 118, drops: 'coalScrip' },
      ],
      hazards: [
        { type: 'steamVent', x: 640, z: 100, period: 180, active: 45, tell: 30 },
        { type: 'steamVent', x: 1240, z: 40, period: 180, active: 45, tell: 30, offset: 90 },
        { type: 'hook', x: 1500, z: 70, period: 120 },
      ],
      waves: [
        { triggerX: 400, lock: true, spawns: cut(3, { z0: 40 }) },
        { triggerX: 900, lock: true, spawns: [...cut(4, { z0: 30 }), { type: S, variant: 'slinger', side: 'right', z: 20, delay: 40 }, { type: S, variant: 'slinger', side: 'left', z: 120, delay: 70 }] },
        // "meet the machine": the Footman comes alone; the Cutthroats only join once it is down
        { triggerX: 1300, lock: true, spawns: [{ type: B, variant: 'footman', side: 'right', z: 70, delay: 0 }],
          reinforcements: [{ whenRemaining: 0, spawns: cut(2, { z0: 40, dz: 60, delay0: 20 }) }] },
        { triggerX: 1650, lock: true, spawns: [
          { type: B, variant: 'footman', side: 'right', z: 60, delay: 0 }, { type: B, variant: 'footman', side: 'left', z: 90, delay: 30 },
          ...cut(3, { z0: 20, delay0: 40 }),
          { type: S, variant: 'slinger', side: 'right', z: 120, delay: 90 }, { type: S, variant: 'slinger', side: 'left', z: 20, delay: 120 },
        ] },
      ],
      events: [],
      /** The dock gate rotates open; a 180f freight-lift ride down with one Meat Pie. */
      transition: { kind: 'lift', atX: 1740, gateX: 1800 },
    },
    // ---------------------------------------------------------------- Section 2: Foundry Row (interior, heat)
    { id: 's2', name: 'FOUNDRY ROW', x0: 1800, x1: 3800, backdrop: 'section2', floor: 'grate',
      // The row keeps one of each of its own things -- mold, chute, drum, case, bucket, cart -- rather than two of
      // several, so a screenful of Foundry Row is four objects that are all doing different jobs. The second mold and
      // the second drum are gone and the mold at the head of the row carries the pie they used to leave lying about.
      props: [
        { type: 'mold', x: 1960, z: 24, drops: ['brassCog', 'meatPie'] },
        // the coal chute at the head of the row: it lets a Sootborn out every four seconds while the wave is live
        // (`cargoOn: 'timer'`), and it can be STOOD ON to hold it shut -- the clock stops while somebody is on the lip.
        { type: 'mold', x: 2180, z: 96, name: 'chute', drops: null, cargoOn: 'timer', cargoEvery: 240,
          cargo: [{ type: S, variant: 'cutthroat' }, { type: S, variant: 'cutthroat' }] },
        { type: 'drum', x: 2340, z: 30, drops: 'aetherVial' }, { type: 'case', x: 2700, z: 20, drops: 'goldenSprocket' },
        { type: 'bucket', x: 3200, z: 16, drops: 'roastBird' }, { type: 'cart', x: 3540, z: 30, drops: 'meatPie' },
      ],
      hazards: [
        { type: 'steamVent', x: 2520, z: 110, period: 180, active: 40, tell: 30 },
        { type: 'steamVent', x: 2880, z: 30, period: 180, active: 40, tell: 30, offset: 90 },
        { type: 'piston', x: 3040, z: 60, period: 240, active: 10, tell: 36 },
        { type: 'piston', x: 3360, z: 90, period: 240, active: 10, tell: 36, offset: 120 },
      ],
      // the back 20px is the molten channel (10 + burn and a bounce; enemies knocked in die, +200); the cargo bay's front
      // 40px is a conveyor that drifts everything left at 1px/f and carries a crate every 4s while the Hoister is up
      zones: [
        { type: 'molten', x0: 1800, x1: 3920 },
        { type: 'conveyor', x0: 3280, x1: 3920, z0: 100 },
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
      /** The cargo gate rises; the players board the Aether Funicular tram car. */
      transition: { kind: 'board', atX: 3740, gateX: 3800 },
    },
    // ---------------------------------------------------------------- Section 3: The Brass Funicular (one locked screen, timed waves)
    { id: 's3', name: 'THE BRASS FUNICULAR', x0: 3800, x1: 4440, backdrop: 'section3', floor: 'brass', mode: 'locked',
      // A locked section IS one scene -- the camera never moves off it -- so the car carries three things and the
      // crossbar that sweeps them: a trunk, the mail cart, and a bar coming down the middle of a room you cannot walk
      // out of. The second trunk and the two lanterns were the other three, and their load rides the mail cart.
      props: [
        { type: 'trunk', x: 3900, z: 20, drops: 'meatPie' },
        { type: 'mailcart', x: 4280, z: 16, drops: ['goldenSprocket', 'brassCog', 'coalScrip'] },
      ],
      hazards: [{ type: 'crossbar', x: 4120, z: 0, period: 360, active: 12, tell: 40 }],
      /** front / back 12px are railings: enemies thrown over them are instant KOs (+200). Issue #31: the roof plating
       *  has gone at the far end of the car -- a body that walks into the hole falls through it (an enemy rings out,
       *  a player pays 8% of max HP and is set on the lip). It takes the back half of the band only, so the front
       *  lanes are always a way past it. */
      zones: [
        { type: 'rails', x0: 3800, x1: 4440 },
        { type: 'solid', x0: 4340, x1: 4372, z0: 20, z1: 62, height: 0 },
      ],
      waves: [],
      timedWaves: [
        { at: 0, spawns: [{ type: B, variant: 'sapper', side: 'right', z: 30, delay: 0 }, { type: B, variant: 'sapper', side: 'left', z: 110, delay: 30 }, { type: B, variant: 'sapper', side: 'right', z: 120, delay: 60 },
          { type: B, variant: 'footman', side: 'left', z: 60, delay: 20 }, { type: B, variant: 'footman', side: 'right', z: 80, delay: 50 }] },
        { at: 25, spawns: [{ type: B, variant: 'duelist', side: 'right', z: 50, delay: 0 }, { type: B, variant: 'duelist', side: 'left', z: 100, delay: 30 },
          { type: B, variant: 'halberdier', side: 'left', z: 40, delay: 60 }, { type: B, variant: 'halberdier', side: 'right', z: 110, delay: 90 }] },
        { at: 55, banner: 'THE LAST GOBLINS', spawns: [{ type: S, variant: 'wrangler', side: 'right', z: 30, delay: 0 }, { type: S, variant: 'wrangler', side: 'left', z: 120, delay: 20 },
          { type: S, variant: 'hulk', side: 'right', z: 70, delay: 40 }, { type: S, variant: 'slinger', side: 'left', z: 20, delay: 70 }, { type: S, variant: 'slinger', side: 'right', z: 120, delay: 100 }] },
        // the Warden crashes through the roof with a 10px shake
        { at: 90, spawns: [{ type: B, variant: 'warden', side: 'sky', z: 70, delay: 0, shake: 10 },
          { type: B, variant: 'duelist', side: 'right', z: 40, delay: 40 }, { type: B, variant: 'duelist', side: 'left', z: 110, delay: 70 },
          { type: B, variant: 'footman', side: 'left', z: 60, delay: 100 }, { type: B, variant: 'footman', side: 'right', z: 90, delay: 130 }] },
      ],
      events: [],
      /** The funicular docks; a short stair with no enemies and 2 Meat Pies (spawned by the transition). */
      transition: { kind: 'dock' },
    },
    // ---------------------------------------------------------------- Section 4: The Heart-Engine (summit cathedral)
    { id: 's4', name: 'THE HEART-ENGINE', x0: 4440, x1: 6000, backdrop: 'section4', floor: 'marble',
      // Two urns, the chandelier and the two dais valves. The nave used to carry a third urn and a cabinet as well,
      // which put six things plus a vent in one view of a room whose whole job is to be READ -- three vents firing on
      // the downbeat and a dais you have to be standing on. The cabinet's meter rides the first urn and the 1-UP moves
      // up the nave, so nothing the player can collect has gone; the vents stay exactly where they were, because the
      // run of three of them down the nave is the thing this section teaches.
      props: [
        { type: 'urn', x: 4620, z: 20, drops: ['meatPie', 'goldenSprocket'] },
        { type: 'chandelier', x: 4780, z: 60, drops: null },
        { type: 'urn', x: 5100, z: 120, drops: 'brassHeart' },
        { type: 'valve', x: 5590, z: 12, drops: null }, { type: 'valve', x: 5970, z: 12, drops: null },
      ],
      // aether floor vents fire together on the music's downbeat (2s bars at 120 BPM)
      hazards: [
        { type: 'aetherVent', name: 'daisVents', x: 4900, z: 110, period: 120, active: 30, tell: 30, offset: 80 },
        { type: 'aetherVent', name: 'daisVents', x: 5260, z: 40, period: 120, active: 30, tell: 30, offset: 80 },
        { type: 'aetherVent', name: 'daisVents', x: 5480, z: 100, period: 120, active: 30, tell: 30, offset: 80 },
      ],
      /** the dais: the band shrinks 20px per boss phase as steam vents open along its edges (4 dmg every 30f inside) */
      zones: [{ type: 'daisVents', x0: 5560, x1: 6000 }],
      waves: [
        { triggerX: 4800, lock: true, spawns: [{ type: B, variant: 'footman', side: 'right', z: 40, delay: 0 }, { type: B, variant: 'footman', side: 'left', z: 100, delay: 30 },
          { type: B, variant: 'halberdier', side: 'right', z: 110, delay: 60 }, { type: B, variant: 'halberdier', side: 'left', z: 30, delay: 90 }] },
        // Inside the Engine the Concordat stops walking its machines in and starts RE-FORMING them on the floor
        // (issue #30 `teleport`): a cyan ring and a rising chime for 40f, then the unit is standing in it with 12f
        // of lens-lighting you get to punish. The Sappers still walk on — the ring is for the heavy plate.
        { triggerX: 5150, lock: true, spawns: [{ type: B, variant: 'warden', z: 70, delay: 0, entrance: { kind: 'teleport', dx: 60 } },
          { type: B, variant: 'sapper', side: 'left', z: 30, delay: 30 }, { type: B, variant: 'sapper', side: 'left', z: 120, delay: 60 },
          { type: B, variant: 'duelist', z: 40, delay: 90, entrance: { kind: 'teleport', dx: -90 } }] },
        { triggerX: 5500, lock: true, spawns: [{ type: B, variant: 'warden', z: 50, delay: 0, entrance: { kind: 'teleport', dx: -70 } },
          { type: B, variant: 'warden', side: 'left', z: 100, delay: 40 },
          { type: B, variant: 'duelist', z: 110, delay: 80, entrance: { kind: 'teleport', dx: 80 } },
          { type: B, variant: 'duelist', side: 'left', z: 30, delay: 110 },
          { type: S, variant: 'wrangler', side: 'left', z: 120, delay: 140 }, ...cut(3, { z0: 20, delay0: 160 })] },
      ],
      /**
       * THE REGENT ENGINE OVER-FIRES (issue #33). After the second wave of the section a klaxon goes and the warning
       * lamps come up red across the whole floor; ten seconds later every vent on it opens AT ONCE for eight
       * seconds and the only safe ground is the dais. It is the exam for everything the board taught about vents:
       * the warning is a caption, a klaxon and a `zoneFlash` you can stand outside of, and it lasts long enough to
       * walk out of, because the vents do not open until 600 frames after the first word of it.
       */
      events: [
        { id: 'overfire', onWaveClear: 2, once: true, actions: [
          { caption: 'THE ENGINE IS OVER-FIRING', sub: 'GET TO THE DAIS', life: 150 },
          { sfx: 'coil_charge' }, { camera: { shake: 5, frames: 20 } },
          { zoneFlash: { x0: 4440, x1: 5540, z0: 0, z1: 140, frames: 600, color: '#4DF0E0' } },
          { wait: 600 },
          { caption: 'OVER-FIRE', sub: '', life: 90 },
          { sfx: 'steam' }, { camera: { shake: 9, frames: 24 } },
          { hazardSet: { name: 'daisVents', force: 'active', frames: 480 } },
          { wait: 480 },
        ] },
      ],
    },
  ],
  /** Foreman Grubbik & the Hoister: cargo bay at the end of Foundry Row (conveyor + molten back edge, see section 2 zones). */
  midboss: { atX: 3600, def: 'midboss', arena: { x0: 3280, x1: 3920 }, intro: { name: 'FOREMAN GRUBBIK', sub: '& THE HOISTER' } },
  /** Chancellor Vane: the dais at the summit (RECONCILIATION: arena 5560..6000). Vane descends a spiral stair (2s) first. */
  boss: { atX: 5900, def: 'boss', arena: { x0: 5560, x1: 6000 }, camera: { x0: 5360, x1: 6000 }, intro: { name: 'CHANCELLOR AURELIUS VANE', sub: 'THE AETHERWRIGHT' } },
};
