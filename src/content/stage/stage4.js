// Stage 4: The Gleaning of Calderwick (docs/STAGE4.md section 5). Same data format as stage1.js / stage2.js /
// stage3.js (ARCHITECTURE.md section 7 + RECONCILIATION `zones` / `transition`), three sections: the tailings field
// west of the city, the guild's own float hanging over it, and the crop loft inside the biggest bag they own.
// Enemy slugs come from content/enemies: the Gleaning throughout, with the Sootborn who have picked these heaps since
// before the guild had a name working the ground in section 1, and the Stormcrows the sea gave back flying for
// whoever is buying from the float onward. Three factions again — except this time the one behind the other two is
// not keeping them standing, it is buying what is left of them.
const G = 'gleaning', S = 'sootborn', C = 'stormcrow';
/** Helper: n spawns of one enemy, alternating sides, spread over z lanes and delays. */
function group(type, variant, n, { side = 'alt', z0 = 40, dz = 30, delay0 = 0, ddelay = 30 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = side === 'alt' ? (i % 2 ? 'left' : 'right') : side;
    out.push({ type, variant, side: s, z: ((z0 + i * dz) % 120) + 10, delay: delay0 + i * ddelay });
  }
  return out;
}
/** Chaff come in pairs off both sides: they are the wave's pressure, and the lesson is that they always land. */
const chaff = (n, o) => group(G, 'chaff', n, { ddelay: 24, ...o });
const cut = (n, o) => group(S, 'cutthroat', n, { ddelay: 20, ...o });
const SCRIP = ['coalScrip'];
const COGS = ['brassCog', 'brassCog'];

export const stage4 = {
  id: 'stage4', number: 4, name: 'THE GLEANING OF CALDERWICK',
  subtitle: 'EVERYTHING YOU BROKE IS BEING CARRIED AWAY.',
  // BOARD SELECT vignette (game/screens/boardselect.js): sky ramp, ground band, accent light, motif to draw.
  // groundH 0: the `crop` motif paints its own spoil line, so the loaded net can hang ACROSS it rather than on top
  // of a band drawn over it (game/screens/boardcards.js drawCropMotif).
  preview: { skyTop: '#2E1F3E', skyBot: '#E8956A', ground: '#4E5A55', groundH: 0, accent: '#FF57B0', motif: 'crop', blurb: 'THE GLEANING' },
  introLines: [
    'THREE POWERS ARE DOWN AND THE FIELD IS FULL OF THEM.',
    'SOMEBODY HAS BEEN FOLLOWING YOU THE WHOLE WAY, PICKING IT UP.',
    'THE BRASSGUARD ARE GOING OUT TO THE TAILINGS TO SEE WHO IS BUYING.',
  ],
  length: 5300,
  music: { glean1: 'glean1', glean2: 'glean2', glean3: 'glean3', midboss: 'midboss2', boss: 'cropboss' },
  /** Per-board banner text (game/stage.js): the mid-boss plate and the stage-clear line. */
  banners: { midbossDown: 'REEVE DEFEATED', clear: 'THE CROP GOES UP' },
  sections: [
    // ---------------------------------------------------------------- Section 1: The Tailings (rose dusk, open field)
    { id: 'g1', name: 'THE TAILINGS', x0: 0, x1: 1800, backdrop: 'glean1', floor: 'spoil',
      props: [
        { type: 'crate', x: 280, z: 32, drops: COGS }, { type: 'keg', x: 520, z: 116, drops: SCRIP },
        { type: 'ballast', x: 880, z: 26, drops: 'meatPie' }, { type: 'crate', x: 1140, z: 112, drops: COGS },
        { type: 'locker', x: 1280, z: 18, drops: 'goldenSprocket' }, { type: 'bucket', x: 1520, z: 118, drops: 'roastBird' },
        { type: 'keg', x: 1740, z: 36, drops: SCRIP },
      ],
      // the heaps let their gas go where the slag is still hot, and the guild's loading hook swings on the line to the float
      hazards: [
        { type: 'steamVent', x: 620, z: 104, period: 180, active: 50, tell: 24 },
        { type: 'hook', x: 1120, z: 70, period: 120 },
        { type: 'steamVent', x: 1540, z: 38, period: 180, active: 50, tell: 24, offset: 90 },
      ],
      waves: [
        // the first thing you will ever see off the ground: three Chaff, alone, so you learn where they land
        { triggerX: 400, lock: true, spawns: chaff(3, { z0: 40 }) },
        { triggerX: 880, lock: true, spawns: [...chaff(2, { z0: 30 }), ...cut(2, { z0: 90, delay0: 40 })] },
        // the first Winnow, with a slinger under her: two things aiming at the same square of floor
        { triggerX: 1280, lock: true, spawns: [
          { type: G, variant: 'winnow', side: 'right', z: 24, delay: 0 },
          ...chaff(2, { z0: 60, delay0: 30 }),
          { type: S, variant: 'slinger', side: 'left', z: 108, delay: 60 },
        ] },
        // the section's exam: something is stealing at your feet while something else is aiming at them
        { triggerX: 1660, lock: true, spawns: [
          { type: G, variant: 'sickle', side: 'right', z: 60, delay: 0 },
          { type: G, variant: 'winnow', side: 'left', z: 118, delay: 40 },
          ...chaff(2, { z0: 30, dz: 60, delay0: 30 }),
          { type: S, variant: 'cutthroat', side: 'right', z: 20, delay: 90 }, { type: S, variant: 'slinger', side: 'left', z: 110, delay: 120 },
        ] },
      ],
      events: [],
      /** The guild's own cargo hoist takes the party up off the field. */
      transition: { kind: 'lift', atX: 1740, gateX: 1800 },
    },
    // ---------------------------------------------------------------- Section 2: The Lash-Up (the guild's float)
    { id: 'g2', name: 'THE LASH-UP', x0: 1800, x1: 3600, backdrop: 'glean2', floor: 'plank',
      props: [
        { type: 'ballast', x: 1960, z: 28, drops: 'meatPie' }, { type: 'keg', x: 2140, z: 114, drops: SCRIP },
        { type: 'crate', x: 2320, z: 30, drops: COGS }, { type: 'locker', x: 2500, z: 20, drops: 'goldenSprocket' },
        { type: 'bucket', x: 2740, z: 118, drops: 'roastBird' }, { type: 'urn', x: 2960, z: 24, drops: 'brassHeart' },
        { type: 'keg', x: 3120, z: 108, drops: SCRIP }, { type: 'crate', x: 3300, z: 34, drops: COGS },
      ],
      // gas vents up through the decking where the wrecks are lashed together; one hook works the loading line
      hazards: [
        { type: 'steamVent', x: 2180, z: 106, period: 180, active: 50, tell: 24 },
        { type: 'hook', x: 2600, z: 66, period: 130 },
        { type: 'steamVent', x: 3020, z: 34, period: 180, active: 50, tell: 24, offset: 90 },
      ],
      /**
       * No bulwark on a raft of other people's hulls: the front and back 12px are open air over the field (+200).
       * It STOPS at 3120, which is where the Reeve's arena starts — the press end of the float is decked in, because
       * a ring-out zone inside a boss arena only ever takes a player's life (the boss is unlaunchable and cannot be
       * thrown), and stage2 keeps its own `rails` out of its mid-boss section for the same reason. `open: true`
       * (issue #21): a thrown weapon / prop, or a dropped weapon pickup, drifting past the same edge is lost too.
       */
      zones: [{ type: 'rails', x0: 1800, x1: 3120, open: true }],
      waves: [
        { triggerX: 2100, lock: true, spawns: [
          { type: G, variant: 'thresher', side: 'right', z: 40, delay: 0 },
          ...chaff(2, { z0: 90, delay0: 30 }),
        ] },
        // the Ninth Wing, working: two grounded crimpers with a Winnow dropping over the top of them
        { triggerX: 2560, lock: true, spawns: [
          { type: G, variant: 'winnow', side: 'right', z: 60, delay: 0 },
          { type: C, variant: 'crimper', side: 'left', z: 116, delay: 40 }, { type: C, variant: 'crimper', side: 'right', z: 20, delay: 70 },
          ...chaff(1, { z0: 80, delay0: 100 }),
        ] },
        { triggerX: 3040, lock: true, spawns: [
          { type: G, variant: 'sickle', side: 'right', z: 70, delay: 0 },
          { type: G, variant: 'thresher', side: 'left', z: 30, delay: 40 },
          ...chaff(2, { z0: 50, delay0: 70 }),
          { type: C, variant: 'corsair', side: 'right', z: 110, delay: 110 },
        ] },
      ],
      events: [],
      /** Past the press the loft hatch comes down against the float and the party goes in. */
      transition: { kind: 'board', atX: 3540, gateX: 3600 },
    },
    // ---------------------------------------------------------------- Section 3: The Crop Loft (inside the great bag)
    { id: 'g3', name: 'THE CROP LOFT', x0: 3600, x1: 5300, backdrop: 'glean3', floor: 'net',
      props: [
        { type: 'crate', x: 3760, z: 20, drops: 'goldenSprocket' }, { type: 'ballast', x: 3940, z: 116, drops: 'meatPie' },
        { type: 'case', x: 4120, z: 22, drops: 'goldenSprocket' }, { type: 'keg', x: 4300, z: 112, drops: SCRIP },
        { type: 'urn', x: 4460, z: 26, drops: 'meatPie' },
        { type: 'crate', x: 4620, z: 110, drops: COGS }, { type: 'cabinet', x: 4740, z: 24, drops: 'goldenSprocket' },
      ],
      // the loft's own gas comes up through the netting, and the sorting line keeps a hook over the middle of it
      hazards: [
        { type: 'steamVent', x: 3980, z: 100, period: 170, active: 50, tell: 24 },
        { type: 'hook', x: 4260, z: 68, period: 120 },
        { type: 'steamVent', x: 4520, z: 36, period: 170, active: 50, tell: 24, offset: 85 },
      ],
      /** The hang line: the net edge vents rose as the Harvestlord's canopy eats the loft (5 damage every 20f inside). */
      zones: [{ type: 'daisVents', x0: 4880, x1: 5300, color: '#FF57B0' }],
      waves: [
        { triggerX: 3900, lock: true, spawns: [
          { type: G, variant: 'harvestman', side: 'right', z: 60, delay: 0 },
          ...chaff(2, { z0: 24, delay0: 40 }),
        ] },
        { triggerX: 4300, lock: true, spawns: [
          { type: G, variant: 'winnow', side: 'right', z: 44, delay: 0 },
          { type: G, variant: 'thresher', side: 'left', z: 110, delay: 40 },
          { type: C, variant: 'corsair', side: 'right', z: 70, delay: 80 }, { type: C, variant: 'corsair', side: 'left', z: 20, delay: 110 },
        ] },
        // the last wave of the campaign: everything in the room in the air at the same time
        { triggerX: 4680, lock: true, spawns: [
          { type: G, variant: 'harvestman', side: 'right', z: 50, delay: 0 },
          { type: G, variant: 'thresher', side: 'left', z: 118, delay: 40 },
          { type: G, variant: 'sickle', side: 'right', z: 90, delay: 90 },
          ...chaff(2, { z0: 30, dz: 44, delay0: 60 }),
        ] },
      ],
      events: [],
    },
  ],
  /** Reeve Culm holds the press at the far end of the float. */
  midboss: { atX: 3400, def: 'midboss4', arena: { x0: 3120, x1: 3600 }, intro: { name: 'REEVE TANSY CULM', sub: '& THE BALER' } },
  /** The Harvestlord is on the loft's own hang line (drawn at the end of the glean3 backdrop). */
  boss: { atX: 5200, def: 'boss4', arena: { x0: 4880, x1: 5300 }, camera: { x0: 4660, x1: 5300 }, intro: { name: 'HARVESTLORD BRIAR OKE', sub: 'THE GLEANING' } },
};
