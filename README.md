# Aether & Brass

A steampunk high-fantasy side-scrolling beat-em-up in the spirit of *Golden Axe*, the *TMNT*
arcade games and *TMNT: Shredder's Revenge*. **Four complete boards** end to end, four playable
heroes, five enemy factions with five variants each, four mid-bosses and four multi-phase final
bosses. Local co-op for up to four players (two keyboard halves plus gamepads, or four gamepads).

Everything is drawn and synthesized in code: vanilla JavaScript, HTML5 Canvas 2D and WebAudio.
No engine, no framework, and not a single image or audio file. Characters are procedural
paper-doll rigs built from canvas primitives and animated by keyframed joint angles;
backdrops are pre-rendered parallax layers; all 94 sound effects and 25 music tracks are
synthesized from oscillators and noise at runtime.

## Play

**Online:** <https://ssinnott.github.io/aether-and-brass/> — published from `main` by GitHub Actions.

**Locally:**

```
npm run dev          # serves the repo at http://localhost:8080
```

Then open <http://localhost:8080/> in a modern browser. Any static file server works.
`npm run build` bundles everything into a self-contained `dist/index.html` you can open
directly from disk or hand to someone as one file.

## Controls

**Playing alone?** Use the arcade layout: **arrows** to move with your right hand, **Z X C V B N** under
your left. That's the whole scheme — one contiguous row, nothing to reach for.

| Action  | One player (arcade) | Co-op P1 (left half) | Co-op P2 (right half) | Gamepad |
|---------|---------------------|----------------------|-----------------------|---------|
| Move    | Arrow keys          | W A S D              | Arrow keys            | D-pad / left stick |
| Attack  | Z                   | F                    | J                     | A / Cross |
| Jump    | X (or Space)        | G (or Space)         | K                     | B / Circle |
| Dodge   | C                   | R                    | U                     | X / Square |
| Special | V                   | H                    | L                     | Y / Triangle |
| Super   | N                   | Y                    | O                     | RB / R1 |
| Taunt   | B                   | T                    | I                     | LB / L1 |
| Start   | Enter               | Enter                | Backspace             | Start |

The arcade keys are live until a second player joins, at which point P1 moves to the left half of the
keyboard so both players fit. Each half puts its six buttons in one 2×3 block under a single hand —
P1's `R T Y` over `F G H` mirrors P2's `U I O` over `J K L`.

- **Run**: double-tap left or right (or hold RT). **Dash attack**: attack while running.
- **Grab**: attack next to an enemy that isn't reeling. **Throw**: direction + attack while holding.
  Thrown bodies are weapons: they hurt whatever they land on.
- Enemies drop their weapons; pick one up for a handful of swings before it shatters. Direction + attack
  while wielding one **throws it** instead of swinging — forward hurls it along your facing, up/down arcs
  it into the depth you're facing — and costs a durability hit whether it lands or misses; drift one off an
  open edge and it's gone for good. Walking into an enemy with a weapon held and pressing attack now
  throws rather than swings, so release the stick first if you meant to swing.
- A few small props (a bottle, a gaslamp) can be picked up empty-handed the same way, but they never
  swing at all — any attack while holding one throws it, and it always shatters where it lands. Grabbing
  an enemy comes first, then a held weapon's throw, then picking up a prop, then an ordinary swing.
- **Special** costs one meter bar, or a slice of health when the meter is empty. **Super** needs all three bars.
- **Dodge** rolls with invulnerability frames and cancels attack recovery.
- Every hero carries a **shield**: a small regenerating buffer, drawn as the thin brass strip above the health
  bar, that is spent before health and refills a few seconds after the last hit. The pool, the refill rate and
  the wait are different for each hero (character select prints them), and breaking one keeps it down twice as
  long — it is a buffer, not a block, so the hit still lands, staggers and knocks down as usual.
- Player 2 joins at any time by pressing any of their own keys (J K U L O I or Backspace — the arrows are
  shared, so they don't count). Escape pauses, M mutes, F1 shows the debug overlay. The on-screen legends and
  the "P2: PRESS J TO JOIN" hint follow whatever is actually bound, so they change if you remap keys below.
- Players 3 and 4 use gamepads: press any button on a pad and it takes the next free slot, on the title,
  character select, pause or mid-run. A pad is never tied to a fixed slot — whichever one you press first
  becomes P1 if nobody else has, and a pad you set down keeps its slot until you return to the title screen,
  where every claim resets.
- Keys and gamepad buttons can be remapped from **OPTIONS** (a row on the title menu, or on the pause plate
  during a local game) → **CONTROLS**: one key per action per layout. A key already used by the other player,
  by the arcade / co-op sibling layout for a different action, or a global key (Escape, M, F1) is refused;
  a collision within the same layout swaps the two actions instead. OPTIONS also has MUSIC and SFX volume
  sliders, a SCREEN SHAKE setting (off / low / full) and difficulty, and everything there persists in the
  browser under `aetherAndBrass.options.v1` — same caveat as progress: if storage is unavailable the game
  still plays, it just falls back to defaults every session and nothing throws.

## The heroes

| | Archetype | Signature |
|---|---|---|
| **Brunhild Coalheart** | Tank | Dwarf boilerwright with a steam hammer. Armor through combo hits, Piston Quake, and a piledriver that shakes the floor. Boiler Plate: 34 shield, the slowest to come back. |
| **Sael Windwright** | Speed | High-elf sky-courier with an electro-rapier. Double jump, air dash, a teleporting Arc Dash and the Sky Lane super. Static Ward: only 14 shield, back in half a second. |
| **Captain Rook Halloway** | Balanced | Sky-captain with cutlass and clockwork revolver. Can parry with a well-timed roll; calls in a broadside from his airship. Bulwark: 22 shield, the cast's middle. |
| **Pip Gearlock & The Rig** | Grappler | Gnome tinkerer in an exo-rig. Grapple-shot reel, grab armor, and a Wrecking Ball super that swings an enemy at their friends. Pressure Hull: 28 shield to walk in behind. |

## The enemies

**The Brassbound** — clockwork soldiery: Tin Footman, Brass Halberdier, Copper Sapper,
Iron Warden, Chrome Duelist. They telegraph with a red lens and a spinning wind-up key,
take extra damage from throws, and gear-slip into a stagger on every fourth hit.

**The Sootborn** — press-ganged goblin stokers: Soot Cutthroat, Scrap Slinger, Firebrand,
Cinder Hulk, Gutter Wrangler. Fast, fragile, cowardly alone, and they burn easily.

**The Stormcrows** — the Concordat's Ninth Aeronaut Wing, flying black over the re-opened sky
(board 2): Deck Crimper, Line Corsair, Powder Bosun, Galewright, Ironwing Marine. Beaked flight
masks with one hot white sighting lens, wing-packs that flare when they move, and a habit of
hopping backwards out of anything you whiff. Jump attacks hurt them 1.5x.

**The Gleaning** — the salvage guild that follows the fighting on tailings-gas bladders and strips
whatever falls out of it, and the faction of board 4: Chaff, Winnow, Thresher, Sickle, Harvestman.
Everything here fights from the air and everything here has to land: a Gleaner hit while airborne takes
1.5x and juggles, the bladder over its head is a 1.6x weak point, and every hover ends in a long
punishable recovery on the deck — which is the only place you can grab one.

**The Chandlery of Calderwick** — the chartered supply company that kept both sides in the war
standing, and the faction of board 3: Wickboy, Tallyman, Limeburner, Purser, Resurrection Man.
Nothing here kills you; everything here keeps the thing that kills you standing up — they heal it,
crust it, dose it, mark you for the whole room and tip fresh Brassbound out of a handcart. One touch
during a rite's wind-up cancels it, and every rite dies with the Chandler holding it.

**Bosses** — Foreman Grubbik & the Hoister and Chancellor Aurelius Vane in the Regent Engine on
board 1; Quartermaster Skree & the Grapnel Winch and Admiral Odaline Kestrel of the Ninth Wing
on board 2; Yardmaster Marl & the Lime Kiln and Factor Oriel Hasp of the Chandlery on board 3;
Reeve Tansy Culm & the Baler and Harvestlord Briar Oke of the Gleaning on board 4.
Every one of them is stripped down phase by phase until the person inside is exposed.

## Board 1: The Ascent of Calderwick

Sootfoot Docks (rainy night moorings, swinging cargo hooks, a bottle and a gaslamp lying around
to pick up and throw) → Foundry Row (molten channels, crushing pistons, the mid-boss in a
conveyor-fed cargo bay) → The Brass Funicular (a fight on the roof of a climbing tram — its
railings catch anything thrown, enemy or otherwise) → The Heart-Engine (a boiler cathedral
where the sky opens again when you win).

Fifteen enemy waves, breakable props with pickups, stage hazards that hurt everyone,
ring-outs, a combo grading system, ranks, lives and continues.

## Board 2: The Storm Above Calderwick

The morning after Vane falls, the Ninth Aeronaut Wing blockades the sky nobody told them was
free. The Mooring Spine (dawn storm above a cloud sea; no bulwark, so throw them off the edge —
and a weapon or prop thrown too near it is lost the same way, not landed)
→ The Gas-Halls (the soft green interior of a captured freighter, and the quartermaster's
grapnel winch at the end of it) → The Cold Sovereign (the flagship's weather deck, gun ports
and lightning, up to the bridge where the Admiral is waiting).

Board 2 is **locked until you clear board 1**. Full design doc: `docs/STAGE2.md`.

## Board 3: The Reckoning of Calderwick

Two organisations are beaten and the war is still being invoiced. The Chandlery of Calderwick supplied
both sides under charter, and with the Chancellor's estate unsettled it is **re-crewing the war** —
tipping Brassbound back onto their feet out of handcarts and writing every one of them into a ledger.
The Lime Road (a chalk-white morning, wagon trains, the works' chimneys ahead) → The Tallow Works
(vats, draw-kilns, cart lanes, and the yardmaster at the kiln head) → The Ledger House (the counting
floor, where the man who signed for all of it is waiting).

The plainest-looking board in the game and the one about money: no furnace glow and no storm, just
lime dust and one saturated colour — the lime in the company's own lamps, which always means something
behind you is being repaired. Board 3 is **locked until you clear board 2**. Full design doc:
`docs/STAGE3.md`.

## Board 4: The Gleaning of Calderwick

Three organisations are down and the field west of the city is full of them. The Gleaning have worked
the tailings since before the guild had a name, and they have been out under every fight you have had,
taking the pieces up as they fell. The Tailings (a rose dusk over the spoil heaps, gas seeping out of
them, salvage lines going up into a sky full of bladders) → The Lash-Up (the guild's float, a raft of
other people's wrecks hung over the field on forty bladders, with no bulwark anywhere) → The Crop Loft
(inside the biggest bag they own, net decking over a drop, four boards' worth of stripped war hanging
overhead in cargo nets).

The board where the fight is mostly above you: anti-air is not a tactic here, it is the tactic, and every
landing is the opening. Board 4 is **locked until you clear board 3**, and it is the last one. Full design
doc: `docs/STAGE4.md`.

## Board select

START on the title screen opens **BOARD SELECT**: one brass plaque per board with its vignette, name,
section count and the factions you will be fighting. Left/right chooses, attack or start confirms, dodge
goes back. A board you have not opened yet shows a padlock plate and the board you have to clear to open
it; confirming it buzzes instead of starting a run.

Board 1 is always open, and clearing a board opens the next one for good. The results screen announces it
with a **NEW BOARD OPEN** plate, and dismissing the plaque drops you back onto BOARD SELECT to watch it
happen: the new board's plaque is still sealed, the padlock rattles itself apart, the hatch splits into two
retracting doors, the `? ? ? ? ?` resolves letter by letter into the board's name and a **STAGE 2 OPEN**
stamp lands as the music comes back in. Attack or start skips the flourish. Cleared boards keep your best
rank and score on their plaque.

Progress is saved in the browser's `localStorage` under `aetherAndBrass.progress.v1`; if storage is
unavailable (private-mode browsers, `file://` pages) the game still plays, it just starts every session on
board 1.

`?stage=N` links straight to a board and opens it for that page load, so a shared link works on a fresh
save. `?unlockall=1` opens every board for one page load without touching the save, and
`?resetprogress=1` wipes the saved unlocks.

## Development

```
npm test                              # full headless Playwright suite
node tools/playtest.js playthrough    # one scenario; screenshots land in tools/screens/
node tools/sheet-capture.js out char=brunhild    # character contact sheets
npm run winrate -- --stages 1 --styles all       # balance sweep: how often does the engine win?
```

The suite boots the game, walks the character select, drives every hero's whole moveset,
runs an autopilot bot through all four boards to their results screens, plays co-op (including a full
four-player run, drop-in on every slot and gamepad-claim rules, `coop4`), spawns every enemy variant,
picks up, swings, breaks and drops every enemy weapon, exercises every autopilot archetype, and renders
every sound effect and music track offline to check none are silent.

`npm test` answers "does it work"; `npm run winrate` answers "is it fair". The latter plays real
runs with no godmode and counts how often the ENGINE wins — a run lost is the continue stack
running out — across boards, difficulties, heroes, party sizes and autopilot styles:

```
npm run winrate                                          # 4 boards x 4 heroes, solo, balanced, normal
npm run winrate -- --stages 1 --styles all --seeds 8     # one board against every archetype
npm run winrate -- --party 1,2,3,4 --difficulty easy,normal,hard --json out.json
```

Autopilot archetypes (`src/game/bot.js`): `balanced` (the default, and what the test suite is
written against), `aggressive` (fast buttons, never dodges), `defensive` (fights at range,
dodges hard, backs off when hurt), `masher` (no spacing, no patience). A run that never reaches
a result is reported apart as unfinished — that is a soft-lock, not a loss.

Debug URL parameters: `?debug=1` (hitboxes, AI states, FPS), `?skipTo=gameplay&chars=0,1,2,3`,
`?skipTo=gallery`, `?bot=1`, `?botstyle=aggressive,defensive` (one archetype per slot),
`?godmode=1`, `?nowaves=1`, `?seed=N`, `?stage=4`, `?unlockall=1`, `?resetprogress=1`,
`?difficulty=easy|normal|hard` (session only — overrides the saved difficulty for this page load without
writing it back).

### Deployment

`.github/workflows/pages.yml` builds the single-file game and publishes it to GitHub Pages on
every push to `main`, serving it at `https://ssinnott.github.io/aether-and-brass/`. Pages is
already switched on for the repository with **Source: GitHub Actions**.

Every push and pull request builds, but only `main` deploys: the `github-pages` environment restricts
deployments to the default branch, so a deploy from anywhere else is rejected with *Branch
"…" is not allowed to deploy to github-pages due to environment protection rules*. To publish
from another branch, add it under **Settings → Environments → github-pages → Deployment
branches**, then start the workflow by hand from the Actions tab with that branch selected.

### Documentation

- `docs/GDD.md` — the game design document: world, cast, enemies, bosses, board 1, combat rules.
- `docs/STAGE2.md` — board 2: the Stormcrows, both of its bosses, its sections and its audio.
- `docs/STAGE3.md` — board 3: the Chandlery, both of its bosses, its sections and its audio.
- `docs/STAGE4.md` — board 4: the Gleaning, both of its bosses, its sections and its audio.
- `docs/ARCHITECTURE.md` — the technical contract: coordinate system, rig format, module APIs.
- `docs/ART_STYLE.md` — binding character art and animation rules, including the readability pass.
- `docs/RECONCILIATION.md` — where the design and technical docs disagree, this decides.

### Layout

```
src/engine/    loop, input, camera, canvas scaling, pixel font, particles, WebAudio synth
src/art/       rig renderer, cel shading, secondary motion, FX, props, parallax backdrops
src/game/      fighters, players, enemy AI, bosses, combat, world, stage runner, HUD, screens, board unlocks
src/content/   characters, enemies and stage data (pure data + small draw hooks)
tools/         dev server, single-file build, playtest harness, contact-sheet generator
```

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship it; just keep the copyright notice.
