# Aether & Brass

A steampunk high-fantasy side-scrolling beat-em-up in the spirit of *Golden Axe*, the *TMNT*
arcade games and *TMNT: Shredder's Revenge*. One complete stage end to end, four playable
heroes, two enemy factions with five variants each, a two-phase mid-boss and a three-phase
final boss. Local two-player co-op on one keyboard or with gamepads.

Everything is drawn and synthesized in code: vanilla JavaScript, HTML5 Canvas 2D and WebAudio.
No engine, no framework, and not a single image or audio file. Characters are procedural
paper-doll rigs built from canvas primitives and animated by keyframed joint angles;
backdrops are pre-rendered parallax layers; all 85 sound effects and 13 music tracks are
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

**Bosses** — Foreman Grubbik & the Hoister (a stolen cargo-loader that overheats and opens
its cockpit), then Chancellor Aurelius Vane in the Regent Engine, stripped down across three
phases until the man himself is exposed.

## The stage: The Ascent of Calderwick

Sootfoot Docks (rainy night moorings, swinging cargo hooks) → Foundry Row (molten channels,
crushing pistons, the mid-boss in a conveyor-fed cargo bay) → The Brass Funicular (a fight on
the roof of a climbing tram, throw enemies over the railings) → The Heart-Engine (a boiler
cathedral where the sky opens again when you win).

Fifteen enemy waves, breakable props with pickups, stage hazards that hurt everyone,
ring-outs, a combo grading system, ranks, lives and continues.

## Development

```
npm test                              # full headless Playwright suite
node tools/playtest.js playthrough    # one scenario; screenshots land in tools/screens/
node tools/sheet-capture.js out char=brunhild    # character contact sheets
```

The suite boots the game, walks the character select, drives every hero's whole moveset,
runs an autopilot bot through the entire stage to the results screen, plays co-op, spawns
every enemy variant, and renders every sound effect and music track offline to check none
are silent.

Debug URL parameters: `?debug=1` (hitboxes, AI states, FPS), `?skipTo=gameplay&chars=0,2`,
`?skipTo=gallery`, `?bot=1`, `?godmode=1`, `?nowaves=1`, `?seed=N`.

### Deployment

`.github/workflows/pages.yml` builds the single-file game and publishes it to GitHub Pages on
every push to `main`, serving it at `https://ssinnott.github.io/aether-and-brass/`.

It needs Pages switched on once, by a repository admin in the browser:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.

That step cannot be automated. Creating the Pages site requires admin rights the workflow's
built-in `GITHUB_TOKEN` does not have, so `actions/configure-pages` with `enablement: true`
fails with *Resource not accessible by integration*; only an admin (or a personal access token
with `repo` scope) can create the site.

The next push, or a manual run from the Actions tab, then publishes. If the deploy job reports
that a branch is not allowed to deploy, either merge to `main` or add that branch under
**Settings → Environments → github-pages → Deployment branches**.

### Documentation

- `docs/GDD.md` — the game design document: world, cast, enemies, bosses, stage, combat rules.
- `docs/ARCHITECTURE.md` — the technical contract: coordinate system, rig format, module APIs.
- `docs/ART_STYLE.md` — binding character art and animation rules, including the readability pass.
- `docs/RECONCILIATION.md` — where the design and technical docs disagree, this decides.

### Layout

```
src/engine/    loop, input, camera, canvas scaling, pixel font, particles, WebAudio synth
src/art/       rig renderer, cel shading, secondary motion, FX, props, parallax backdrops
src/game/      fighters, players, enemy AI, bosses, combat, world, stage runner, HUD, screens
src/content/   characters, enemies and stage data (pure data + small draw hooks)
tools/         dev server, single-file build, playtest harness, contact-sheet generator
```

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship it; just keep the copyright notice.
