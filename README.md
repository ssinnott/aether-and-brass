# Aether & Brass

A steampunk high-fantasy side-scrolling beat-em-up in the spirit of *Golden Axe*, the *TMNT*
arcade games and *TMNT: Shredder's Revenge*. **Two complete boards** end to end, four playable
heroes, three enemy factions with five variants each, two mid-bosses and two multi-phase final
bosses. Local two-player co-op on one keyboard or with gamepads.

Everything is drawn and synthesized in code: vanilla JavaScript, HTML5 Canvas 2D and WebAudio.
No engine, no framework, and not a single image or audio file. Characters are procedural
paper-doll rigs built from canvas primitives and animated by keyframed joint angles;
backdrops are pre-rendered parallax layers; all 92 sound effects and 17 music tracks are
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

| Action  | Player 1 (left half) | Player 2 (right half) | P1 solo aliases | Gamepad |
|---------|----------------------|-----------------------|-----------------|---------|
| Move    | W A S D              | Arrow keys            | Arrow keys      | D-pad / left stick |
| Attack  | F                    | J                     | Z               | A / Cross |
| Jump    | G                    | K                     | X               | B / Circle |
| Dodge   | R                    | U                     | C               | X / Square |
| Special | H                    | L                     | V               | Y / Triangle |
| Super   | Space                | O                     | Space           | RB / R1 |
| Taunt   | T                    | I                     | B               | LB / L1 |
| Start   | Enter                | Backspace             | Enter           | Start |

- **Run**: double-tap left or right (or hold RT). **Dash attack**: attack while running.
- **Grab**: attack next to an enemy that isn't reeling. **Throw**: direction + attack while holding.
  Thrown bodies are weapons: they hurt whatever they land on.
- **Special** costs one meter bar, or a slice of health when the meter is empty. **Super** needs all three bars.
- **Dodge** rolls with invulnerability frames and cancels attack recovery.
- Player 2 joins at any time by pressing any of their keys. Escape pauses, M mutes, F1 shows the debug overlay.

## The heroes

| | Archetype | Signature |
|---|---|---|
| **Brunhild Coalheart** | Tank | Dwarf boilerwright with a steam hammer. Armor through combo hits, Piston Quake, and a piledriver that shakes the floor. |
| **Sael Windwright** | Speed | High-elf sky-courier with an electro-rapier. Double jump, air dash, a teleporting Arc Dash and the Sky Lane super. |
| **Captain Rook Halloway** | Balanced | Sky-captain with cutlass and clockwork revolver. Can parry with a well-timed roll; calls in a broadside from his airship. |
| **Pip Gearlock & The Rig** | Grappler | Gnome tinkerer in an exo-rig. Grapple-shot reel, grab armor, and a Wrecking Ball super that swings an enemy at their friends. |

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

**Bosses** — Foreman Grubbik & the Hoister and Chancellor Aurelius Vane in the Regent Engine on
board 1; Quartermaster Skree & the Grapnel Winch and Admiral Odaline Kestrel of the Ninth Wing
on board 2. Every one of them is stripped down phase by phase until the person inside is exposed.

## Board 1: The Ascent of Calderwick

Sootfoot Docks (rainy night moorings, swinging cargo hooks) → Foundry Row (molten channels,
crushing pistons, the mid-boss in a conveyor-fed cargo bay) → The Brass Funicular (a fight on
the roof of a climbing tram, throw enemies over the railings) → The Heart-Engine (a boiler
cathedral where the sky opens again when you win).

Fifteen enemy waves, breakable props with pickups, stage hazards that hurt everyone,
ring-outs, a combo grading system, ranks, lives and continues.

## Board 2: The Storm Above Calderwick

The morning after Vane falls, the Ninth Aeronaut Wing blockades the sky nobody told them was
free. The Mooring Spine (dawn storm above a cloud sea; no bulwark, so throw them off the edge)
→ The Gas-Halls (the soft green interior of a captured freighter, and the quartermaster's
grapnel winch at the end of it) → The Cold Sovereign (the flagship's weather deck, gun ports
and lightning, up to the bridge where the Admiral is waiting).

Board 2 is **locked until you clear board 1**. Full design doc: `docs/STAGE2.md`.

## Board select

START on the title screen opens **BOARD SELECT**: one brass plaque per board with its vignette, name,
section count and the factions you will be fighting. Left/right chooses, attack or start confirms, dodge
goes back. A board you have not opened yet shows a padlock plate and the board you have to clear to open
it; confirming it buzzes instead of starting a run.

Board 1 is always open, and clearing a board opens the next one for good — the results screen announces it
with a **NEW BOARD OPEN** plate, and cleared boards keep your best rank and score on their plaque. Progress
is saved in the browser's `localStorage` under `aetherAndBrass.progress.v1`; if storage is unavailable
(private-mode browsers, `file://` pages) the game still plays, it just starts every session on board 1.

`?stage=N` links straight to a board and opens it for that page load, so a shared link works on a fresh
save. `?unlockall=1` opens every board for one page load without touching the save, and
`?resetprogress=1` wipes the saved unlocks.

## Development

```
npm test                              # full headless Playwright suite
node tools/playtest.js playthrough    # one scenario; screenshots land in tools/screens/
node tools/sheet-capture.js out char=brunhild    # character contact sheets
```

The suite boots the game, walks the character select, drives every hero's whole moveset,
runs an autopilot bot through both boards to their results screens, plays co-op, spawns
every enemy variant, and renders every sound effect and music track offline to check none
are silent.

Debug URL parameters: `?debug=1` (hitboxes, AI states, FPS), `?skipTo=gameplay&chars=0,2`,
`?skipTo=gallery`, `?bot=1`, `?godmode=1`, `?nowaves=1`, `?seed=N`, `?stage=2`, `?unlockall=1`,
`?resetprogress=1`.

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
