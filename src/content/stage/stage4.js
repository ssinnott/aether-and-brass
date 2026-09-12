// Stage 4: The Gleaning of Calderwick (docs/STAGE4.md section 5). Same data format as stage1.js / stage2.js / stage3.js
// (ARCHITECTURE.md section 7 + RECONCILIATION `zones` / `transition` / `mode: 'locked'` + `timedWaves`), four sections:
// the tailings field west of the city, the guild's float drifting over it on its forty bladders (one locked screen), the
// press end of that float where the Reeve bales the crop, and the crop loft inside the biggest bag the guild owns.
// Enemy slugs come from content/enemies; spawn modifiers from game/traits.js SPAWN_MODS. THE RATIO RULE (issue #28): THE
// SKY FILLS UP AS YOU GO — and it is counted, not asserted: a third of the field hangs under a bladder (6/18), a third of
// the float (7/20), a little over a third of the press (7/19) and nearly three quarters of the loft (13/18). What counts
// is a bag of its own, not an arrival: a `winged` body comes in off the sky, LANDS and fights on its feet, so the press
// reads as more sky than it is if you count wings. The Gleaning are the board. The Sootborn who have picked these heaps
// since before the guild had a name work the ground in the field; the whole Stormcrow roster — all seven of them — fights
// GROUNDED on the float and down the press end (the Ninth Wing came down in the sea a week ago and flies for whoever is
// buying), which is what holds the middle of the board on the deck while the Gleaners fill the air above it; from the
// press onward the guild flies the Concordat's own machine — `winged` Brassbound and Sootborn with a salvage bladder
// strapped on — and walks `salvaged` Brassbound it has re-plated in its own colours; the loft is the guild and its scrap
// and nothing else. Four factions, and the one that was behind the other three the whole time is not keeping them
// standing, it is carrying them away.
const G = 'gleaning', S = 'sootborn', C = 'stormcrow', B = 'brassbound';
/**
 * Helper: n spawns of one enemy, alternating sides, spread over z lanes and delays. `mods` (traits.js SPAWN_MODS)
 * rides on every spawn of the group — the census counts footman+winged as its own variant, and so does the player.
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
/** One spawn with optional modifiers: a single named enemy on a side, a lane and a delay. */
const one = (type, variant, side, z, delay, mods = null) => (mods ? { type, variant, side, z, delay, mods } : { type, variant, side, z, delay });
/**
 * A body the guild has strapped a salvage bladder to (SPAWN_MODS.winged): it arrives FROM THE SKY over the middle of the
 * screen (`side: 'sky'`, spread by `dx`), sinks slowly on the bag, and is worth 1.25x while it hangs there. The small
 * `shake` is the line letting go above you, not a roof coming in.
 */
const winged = (type, variant, dx, z, delay) => ({ type, variant, side: 'sky', dx, z, delay, shake: 3, mods: ['winged'] });
/** Chaff come in pairs off both sides: they are the wave's pressure, and the lesson is that they always land. */
const chaff = (n, o) => group(G, 'chaff', n, { ddelay: 24, ...o });
/** Pickers: the guild's ground crew, no bladder at all — the one Gleaner you can grab whenever you like. */
const pick = (n, o) => group(G, 'picker', n, { ddelay: 26, ...o });
/** Soot Cutthroats rush in from both sides at once, as they have since the docks. */
const cut = (n, o) => group(S, 'cutthroat', n, { ddelay: 20, ...o });
/** Deck Crimpers, grounded: the Wing's pressure, fighting off a raft instead of a deck. */
const crimp = (n, o) => group(C, 'crimper', n, { ddelay: 22, ...o });
/** Deckhands: the Wing's own fodder, off a ship at the bottom of the sea - they work the guild's lines for the wages now. */
const deck = (n, o) => group(C, 'deckhand', n, { ddelay: 24, ...o });
/** Tin Footmen the guild has re-plated in plum and hemp (SPAWN_MODS.salvaged): gear-slip on the third hit, a cog when they drop. */
const salvaged = (n, o) => group(B, 'footman', n, { ddelay: 30, mods: ['salvaged'], ...o });
const SCRIP = ['coalScrip'];
const COGS = ['brassCog', 'brassCog'];
const ROSE = '#FF57B0';

export const stage4 = {
  id: 'stage4', number: 4, name: 'THE GLEANING OF CALDERWICK',
  subtitle: 'EVERYTHING YOU BROKE IS BEING CARRIED AWAY.',
  // BOARD SELECT vignette (game/screens/boardselect.js): sky ramp, ground band, accent light, motif to draw.
  // groundH 0: the `crop` motif paints its own spoil line, so the loaded net can hang ACROSS it rather than on top
  // of a band drawn over it (game/screens/boardcards.js drawCropMotif).
  preview: { skyTop: '#2E1F3E', skyBot: '#E8956A', ground: '#4E5A55', groundH: 0, accent: ROSE, motif: 'crop', blurb: 'GLEANING & STORMCROWS' },
  introLines: [
    'THREE POWERS ARE DOWN AND THE FIELD IS FULL OF THEM.',
    'SOMEBODY HAS BEEN FOLLOWING YOU THE WHOLE WAY, PICKING IT UP.',
    'THE BRASSGUARD ARE GOING OUT TO THE TAILINGS TO SEE WHO IS BUYING.',
  ],
  length: 5300,
  /** `midboss4` is the Baler's own track (docs/STAGE4.md section 6): 150 BPM Em, the ram on the one and the three over a windlass tick. */
  music: { glean1: 'glean1', glean2: 'glean2', glean3: 'glean3', midboss: 'midboss4', boss: 'cropboss' },
  /** Per-board banner text (game/stage.js): the mid-boss plate and the stage-clear line. */
  banners: { midbossDown: 'REEVE DEFEATED', clear: 'THE CROP GOES UP' },
  sections: [
    // ---------------------------------------------------------------- Section 1: The Tailings (rose dusk, open field)
    // THE GROUND: Pickers and Sootborn on the spoil, and the first bladders over it — and only the first. This is the
    // thinnest sky on the board (6 of 18 off the ground) because the rule has to start somewhere: the field is a dozen
    // bodies standing in the slag with a few bags over them. The seeps are harmless rose gas until something burning
    // touches one — the Firebrand's flame, a broken lantern, a keg going off — and then they are not.
    { id: 'g1', name: 'THE TAILINGS', x0: 0, x1: 1800, backdrop: 'glean1', floor: 'spoil',
      // the board-4 family on the field: spoil heaps (the guild's scrip), a salvage line going up (cut it for meter), and the
      // guild's pole lantern at x 580 — break it and the spilt oil lights the seep beside it, on purpose
      props: [
        { type: 'spoilHeap', x: 300, z: 30, drops: SCRIP }, { type: 'lantern', x: 580, z: 124, drops: SCRIP },
        { type: 'salvageLine', x: 1000, z: 20, drops: 'aetherVial' }, { type: 'crate', x: 1300, z: 112, drops: COGS },
        { type: 'keg', x: 1460, z: 60, drops: SCRIP }, { type: 'bucket', x: 1600, z: 118, drops: 'roastBird' },
        { type: 'spoilHeap', x: 1690, z: 24, drops: SCRIP },
      ],
      // two gas seeps (front lane, then back lane) and the salvage hook swinging on the line up to the float between them
      hazards: [
        { type: 'gasSeep', x: 620, z: 104 },
        { type: 'hook', x: 1120, z: 70, period: 120 },
        { type: 'gasSeep', x: 1400, z: 40 },
      ],
      /** Sinking spoil under the hook: every step inside the patch keeps 55% of its distance — the ground you fight the Hulk on. */
      zones: [{ type: 'spoil', x0: 900, x1: 1150, z0: 80, z1: 140 }],
      waves: [
        // fodder first, and grounded: three Pickers with no bladder, the only Gleaners you can grab whenever you like
        { triggerX: 400, lock: true, spawns: pick(3, { z0: 40 }) },
        // the first thing you will ever see off the ground: two Chaff over two Pickers, with the goblins who have always picked here
        { triggerX: 860, lock: true, spawns: [...pick(2, { z0: 30, dz: 60 }), ...chaff(2, { z0: 60, delay0: 30 }), ...cut(2, { z0: 100, dz: 20, delay0: 80 })] },
        // the first Winnow, with a Slinger under her - two things aiming at the same square of floor - and a Firebrand, whose
        // flame is the first fire on the field: the seep at x 1400 is in this wave's view
        { triggerX: 1260, lock: true, spawns: [
          one(G, 'winnow', 'right', 24, 0),
          one(S, 'slinger', 'left', 108, 60),
          one(S, 'firebrand', 'right', 90, 90),
        ] },
        // the section's exam, and it is a GROUND exam: something is stealing at your feet while the two goblins who take
        // hold of you work the spoil that will not let you run - the Hulk on the sinking patch, the Wrangler's whip off it -
        // and when one is left the bladder goes up and the next wave comes down: two Chaff out of the sky, which is all the
        // sky the field gets
        { triggerX: 1640, lock: true, spawns: [
          one(G, 'sickle', 'right', 60, 0),
          ...pick(1, { z0: 30, delay0: 60 }),
          one(S, 'hulk', 'right', 70, 100),
          one(S, 'wrangler', 'left', 40, 130),
        // the bladder goes up and the crop comes down UNDER ITS OWN SILK (issue #30 `descend`) rather than dropping out
        // of a bare sky: slow, hittable for the airborne 1.5x the whole way, and 30f on the spoil when it lands
        ], reinforcements: [{ whenRemaining: 1, spawns: [
          { type: G, variant: 'chaff', z: 50, delay: 0, entrance: { kind: 'descend', dx: -70 } },
          { type: G, variant: 'chaff', z: 100, delay: 30, entrance: { kind: 'descend', dx: 70 } },
        ] }] },
      ],
      events: [],
      /** The guild's own cargo hoist takes the party UP off the field (`up: true`: the shaft runs the other way). */
      transition: { kind: 'lift', atX: 1740, gateX: 1800, up: true },
    },
    // ---------------------------------------------------------------- Section 2: The Lash-Up (the float, one locked screen, timed waves)
    // THE SET PIECE: a raft of other people's wrecks hanging on forty bladders and DRIFTING (`drift`, glean2.js) toward the
    // press end. No bulwark anywhere on it, and the crop coming up onto it on lines drops ballast bags where the lines land.
    // The Wing comes down here, and all of it: the whole Stormcrow roster - Deckhand, Crimper, Corsair, Bosun, Galewright,
    // Grapnel Mate and Marine, twelve bodies of it - grounded on the deck, fighting for the guild's wages. They are why the
    // float is barely more sky than the field was: the Gleaners are over your head, but most of what is on the raft is
    // standing on it.
    { id: 'g2', name: 'THE LASH-UP', x0: 1800, x1: 2440, backdrop: 'glean2', floor: 'plank', mode: 'locked',
      /** Issue #32: forty bladders and no keel. The float dips slower and further than a ship banks, and there is no
       *  bulwark anywhere on it — so the slide and the plank gaps (issue #31) are the same problem twice. */
      platform: { kind: 'tilt', period: 540, tell: 60, active: 80, slide: 0.6, dir: 0 },
      /** Auto-scroll of the far parallax (px per frame, glean2.js): the field a long way below slides past under the raft. */
      drift: 0.4,
      // two salvage lines (meter, either end), a gas bag (a pie, and a rose puff - never a fire source) and a ballast bag;
      // the arrival spot (x 1870..1910) stays clear
      props: [
        { type: 'salvageLine', x: 1930, z: 20, drops: 'aetherVial' },
        { type: 'gasBag', x: 2060, z: 118, drops: 'meatPie' },
        { type: 'ballast', x: 2200, z: 26, drops: 'meatPie' },
        { type: 'salvageLine', x: 2380, z: 116, drops: 'aetherVial' },
      ],
      // the lines land their loads: a growing shadow on the deck, then a ballast bag (14 knockdown) - one on the middle of
      // the raft, one on the front lane at the far end half a cycle later
      hazards: [
        { type: 'ballastDrop', x: 1960, z: 60, period: 240, tell: 36, active: 8 },
        { type: 'ballastDrop', x: 2280, z: 100, period: 240, tell: 36, active: 8, offset: 120 },
      ],
      /** No bulwark on a raft of other people's hulls: the front and back 12px are open air over the field (+200). */
      // `open: true` (issue #21): a thrown weapon / prop, or a dropped weapon pickup, drifting past the same edge is lost too.
      zones: [{ type: 'rails', x0: 1800, x1: 2440, open: true },
        // issue #31: two planks have gone out of the float, one in each lane and well apart, so there is always a way
        // across but never a straight line. Nothing below but the field: an enemy that goes in is gone (+200), a
        // player pays 8% of max HP and is set back on the lip.
        { type: 'solid', x0: 1978, x1: 2010, z0: 14, z1: 60, height: 0 },
        { type: 'solid', x0: 2232, x1: 2264, z0: 84, z1: 130, height: 0 },
      ],
      waves: [],
      timedWaves: [
        // the first Thresher, with the ground crew and the first Stormcrows on the board: two Deckhands working the lines
        // and a Crimper off them, all three on their feet on the deck
        { at: 0, spawns: [
          one(G, 'thresher', 'right', 40, 0),
          ...pick(1, { z0: 80, delay0: 30 }),
          ...deck(2, { z0: 100, dz: 40, delay0: 60 }),
          ...crimp(1, { z0: 116, side: 'left', delay0: 90 }),
        ] },
        // the Harvestman, a section early: he hangs and calls the crop down while a Bosun's keg is in the air
        { at: 22, spawns: [
          one(G, 'harvestman', 'right', 60, 0),
          ...chaff(2, { z0: 30, dz: 80, delay0: 40 }),
          one(C, 'bosun', 'left', 100, 100),
          ...crimp(1, { z0: 20, side: 'right', delay0: 130 }),
        ] },
        // the Ninth Wing, for hire, and the whole of it on one deck: a Galewright's coil, two Crimpers to walk you toward the
        // edge, a Corsair's line - and the Grapnel Mate to take you the last step off a raft with no rails
        { at: 50, banner: 'THE WING COMES DOWN', spawns: [
          one(C, 'galewright', 'right', 50, 0),
          ...crimp(2, { z0: 20, dz: 100, delay0: 30 }),
          one(C, 'corsair', 'left', 70, 90),
          one(C, 'grapnel', 'right', 100, 130),
        ] },
        // the Marine comes down out of the bladders above the raft on a line, the Thresher off a second one beside it
        // (issue #30 `ropeDrop`: both hang 30f, and a hit on either cuts it); the Winnow lowers itself on its own silk,
        // and a Deckhand walks in under the three of them
        { at: 80, spawns: [
          { type: G, variant: 'thresher', z: 40, delay: 0, entrance: { kind: 'ropeDrop', dx: -80 } },
          { type: G, variant: 'winnow', z: 100, delay: 30, entrance: { kind: 'descend', dx: 90 } },
          { type: C, variant: 'marine', z: 70, delay: 60, entrance: { kind: 'ropeDrop', dx: 0 } },
          ...chaff(1, { z0: 60, side: 'left', delay0: 100 }),
          ...deck(1, { z0: 20, side: 'right', delay0: 140 }),
        ] },
      ],
      /**
       * THE BLADDERS LET GO (issue #33). A salvage line parts overhead and an Iron Warden's stripped carcass comes
       * down onto the float; a Winnow follows it down on her own silk to get a line back on it. Until she does, the
       * carcass is the best weapon on the raft -- `chassis` rolls when it is struck -- so the beat is a question
       * about whether you spend the time using it or the time stopping her taking it away.
       */
      events: [
        { id: 'bladders', onWaveClear: 2, once: true, actions: [
          { caption: 'THE BLADDERS LET GO', sub: 'SOMETHING IS COMING DOWN', life: 140 },
          { sfx: 'crate_drop' },
          { zoneFlash: { x0: 2040, x1: 2140, z0: 40, z1: 100, frames: 120, color: '#FF57B0' } },
          { wait: 120 },
          { prop: { type: 'chassis', x: 2090, z: 70, drops: COGS } },
          { camera: { shake: 8, frames: 22 } }, { sfx: 'land_heavy' },
          { wait: 60 },
          { caption: 'SHE WANTS IT BACK', sub: '', life: 100 },
          { spawn: [{ type: G, variant: 'winnow', z: 70, delay: 0, entrance: { kind: 'descend', dx: 60 } }] },
          { wait: 240 },
        ] },
      ],
      /** The raft noses in against the press end; the hemp hoist platform is the landing, two pies on it. */
      transition: { kind: 'dock', banner: 'THE PRESS END', look: 'hoist', pies: 2 },
    },
    // ---------------------------------------------------------------- Section 3: The Press (the float's press end, decked in)
    // THE GUILD FLIES THE CONCORDAT'S OWN MACHINE: winged Footmen and a winged Cutthroat out of the sky and salvaged Footmen
    // in guild plate, over the Gleaners - and the Wing is still here, seven of them working the press for wages, which is
    // why the press is only a little more sky than the float. The winged bodies LAND: they are the Concordat on the guild's
    // bags, not the guild's own air. Decked in - no rails, no net squares - because the Reeve's arena is at the end of it
    // and a ring-out zone inside a boss arena only ever takes a player's life.
    { id: 'g3', name: 'THE PRESS', x0: 2440, x1: 3600, backdrop: 'glean2', floor: 'plank',
      // the urn holds the board's Brass Heart (1-UP); a gas bag (pie) and a salvage line (meter) stand in the Reeve's arena,
      // and the lantern at x 3012 is the fire that lights the seep beside it
      props: [
        { type: 'crate', x: 2520, z: 30, drops: COGS }, { type: 'keg', x: 2680, z: 116, drops: SCRIP },
        { type: 'gasBag', x: 2790, z: 118, drops: 'meatPie' }, { type: 'urn', x: 2900, z: 24, drops: 'brassHeart' },
        { type: 'lantern', x: 3012, z: 124, drops: SCRIP },
        { type: 'salvageLine', x: 3200, z: 20, drops: 'aetherVial' }, { type: 'gasBag', x: 3400, z: 118, drops: 'meatPie' },
      ],
      // a ballast line lands on the back lane, the press crane's hook works the middle, and one seep vents through the
      // decking on the front lane just short of the arena - a different layout from the field and the raft
      hazards: [
        { type: 'ballastDrop', x: 2640, z: 40, period: 240, tell: 36, active: 8 },
        { type: 'hook', x: 2900, z: 66, period: 130 },
        { type: 'gasSeep', x: 3060, z: 110 },
      ],
      waves: [
        // "meet the salvage": two Tin Footmen re-plated in plum and hemp, walking in under a Sickle and a Chaff, with two of
        // the Wing's Deckhands behind them working the press lines
        { triggerX: 2660, lock: true, spawns: [
          one(G, 'sickle', 'right', 60, 0),
          ...salvaged(2, { z0: 30, dz: 80, delay0: 30 }),
          ...chaff(1, { z0: 100, side: 'left', delay0: 90 }),
          ...deck(2, { z0: 20, dz: 90, delay0: 120 }),
        ] },
        // the guild flying the Concordat's own machine: two winged Footmen sink in out of the sky on salvage bladders - and
        // then stand on the deck with the Corsair and the Crimper who are still drawing the Wing's wages
        { triggerX: 2880, lock: true, spawns: [
          one(G, 'thresher', 'right', 40, 0),
          winged(B, 'footman', -80, 30, 30), winged(B, 'footman', 80, 110, 60),
          one(C, 'corsair', 'left', 70, 90),
          ...crimp(1, { z0: 118, side: 'right', delay0: 120 }),
          ...chaff(1, { z0: 60, side: 'left', delay0: 150 }),
        ] },
        // the last line before the Reeve: a winged Cutthroat down over two Chaff, a Bosun's keg, and two Crimpers to walk you
        // into both - the guild's re-plated Halberdier is held back for the loft, where the heavy salvage is stacked
        { triggerX: 3080, lock: true, spawns: [
          one(G, 'winnow', 'right', 40, 0),
          winged(S, 'cutthroat', 60, 60, 60),
          ...chaff(2, { z0: 20, dz: 100, delay0: 90 }),
          one(C, 'bosun', 'right', 110, 150),
          ...crimp(2, { z0: 70, dz: 40, side: 'left', delay0: 180 }),
        ] },
      ],
      events: [],
      /** Past the press the loft hatch comes down against the float and the party goes in. */
      transition: { kind: 'board', atX: 3540, gateX: 3600 },
    },
    // ---------------------------------------------------------------- Section 4: The Crop Loft (inside the great bag)
    // ONLY THE GUILD, AND ITS SCRAP: the Riggerman's nets, the two role-'elite' bodies this room owes the player - the
    // Harvestman and a Brass Warden the guild has re-plated in its own colours - and the winged / salvaged Brassbound it
    // has made its own. The Riggerman is NOT half of that pair: gleaning.js builds him role 'grabber', elite false, and a
    // net is not an elite. No floor to speak of either: marked net squares give way, and 13 of the 18 bodies in here hang
    // under a bag of their own, which is where the rule has been going since the field.
    { id: 'g4', name: 'THE CROP LOFT', x0: 3600, x1: 5300, backdrop: 'glean3', floor: 'net',
      // two cargo nets overhead (a jump attack opens one and its chassis comes down rolling), a case, a salvage line (meter),
      // an urn and a gas bag (pies) before the hang line, and one lantern on the sorting line - the only fire in a bag of gas
      props: [
        { type: 'cargoNet', x: 3960, z: 60 }, { type: 'case', x: 4080, z: 22, drops: 'goldenSprocket' },
        { type: 'lantern', x: 4170, z: 20, drops: SCRIP }, { type: 'salvageLine', x: 4240, z: 118, drops: 'aetherVial' },
        { type: 'urn', x: 4420, z: 26, drops: 'meatPie' }, { type: 'gasBag', x: 4560, z: 120, drops: 'meatPie' },
        { type: 'cargoNet', x: 4660, z: 80 }, { type: 'bucket', x: 4780, z: 118, drops: 'roastBird' },
      ],
      // the loft's own gas comes up through the netting on the back lane, and the nets above drop their ballast on the front
      hazards: [
        { type: 'gasSeep', x: 4120, z: 30 },
        { type: 'ballastDrop', x: 4500, z: 100, period: 240, tell: 36, active: 8 },
      ],
      /**
       * Net decking: three marked squares give way under a knockdown landing (enemies in them ring out, +200; players lose
       * 8% and are set on the edge) - all of them short of the boss camera box (4660). The hang line: the net edge vents
       * rose as the Harvestlord's canopy eats the loft.
       */
      zones: [
        { type: 'netGive', x0: 3700, x1: 4800, squares: [{ x: 3900, z: 60 }, { x: 4300, z: 110 }, { x: 4600, z: 40 }] },
        // issue #31: one square of decking is simply GONE rather than waiting to be opened by a heavy landing — the
        // net squares above are a trap you spring, this is a hole you can see. Well short of the boss camera box.
        { type: 'solid', x0: 4120, x1: 4156, z0: 34, z1: 84, height: 0 },
        { type: 'daisVents', x0: 4880, x1: 5300, color: ROSE },
      ],
      waves: [
        // "meet the net": the Riggerman, held for the loft, drops it from the hang line and lands beside whoever it pinned
        { triggerX: 3900, lock: true, spawns: [
          one(G, 'riggerman', 'right', 70, 0),
          ...chaff(2, { z0: 30, dz: 80, delay0: 40 }),
          ...pick(1, { z0: 110, side: 'left', delay0: 100 }),
        ] },
        // the Concordat's machine on the guild's bladders, over a net floor: two winged Footmen between a Winnow and a
        // Thresher - the bags carry them in and then let them down, and they fight the rest of the wave on the netting
        { triggerX: 4260, lock: true, spawns: [
          one(G, 'winnow', 'right', 40, 0),
          one(G, 'thresher', 'left', 100, 30),
          winged(B, 'footman', -70, 30, 60), winged(B, 'footman', 70, 110, 90),
        ] },
        // the elite pair, in the room the game ends in: the Harvestman's call over an Iron Warden the guild has re-plated in
        // plum and hemp - the heaviest thing in the nets, standing on a floor that gives. The Riggerman with them is a
        // grabber, not an elite; his net is the wave's other job.
        { triggerX: 4560, lock: true, spawns: [
          one(G, 'harvestman', 'right', 60, 0),
          one(G, 'riggerman', 'left', 90, 40),
          ...chaff(2, { z0: 20, dz: 100, delay0: 70 }),
          one(B, 'warden', 'right', 118, 130, ['salvaged']),
        ] },
        // the last wave of the campaign: everything the guild has in the air at the same time, with the loft's own salvaged
        // Halberdier on the netting under it - the last thing the Concordat does on this board is hold a floor for them
        { triggerX: 4820, lock: true, spawns: [
          one(G, 'harvestman', 'right', 50, 0),
          one(G, 'thresher', 'left', 118, 30),
          one(G, 'riggerman', 'left', 40, 90),
          one(G, 'winnow', 'right', 20, 150),
          one(B, 'halberdier', 'right', 90, 120, ['salvaged']),
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
