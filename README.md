# Aether & Brass

A steampunk high-fantasy side-scrolling beat-em-up in the spirit of *Golden Axe*, the *TMNT*
arcade games and *TMNT: Shredder's Revenge*. One complete stage, four heroes, two enemy
factions with five variants each, a mid-boss and a three-phase final boss. Local two-player
co-op on one keyboard or with gamepads.

Everything is drawn and synthesized in code: vanilla JavaScript, HTML5 Canvas 2D and WebAudio.
No frameworks, no image or sound files, no build step needed to play.

## Play

```
npm run dev          # serves the repo at http://localhost:8080
```

Then open <http://localhost:8080/> in a modern browser. Any static file server works
(`python3 -m http.server 8080` too). `npm run build` writes a self-contained single file to
`dist/index.html` that you can open directly or share.

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

- Run: double-tap left/right (or hold RT). Dash attack: attack while running.
- Grab: attack next to an enemy that is not reeling. Throw: direction + attack while holding.
- Special costs one meter bar (or a slice of health if the meter is empty). Super needs all three bars.
- Player 2 joins at any time by pressing any of their keys. Escape pauses, M mutes, F1 shows the debug overlay.

## The cast

- **Brunhild Coalheart**, dwarf boilerwright with a steam hammer. Slow, armored, hits like a wall.
- **Sael Windwright**, high-elf sky-courier with an electro-rapier. Double jump, air dash, teleport dash.
- **Captain Rook Halloway**, human sky-captain with cutlass and clockwork revolver. Balanced, can parry.
- **Pip Gearlock & The Rig**, gnome tinkerer in a seven-foot exo-rig. Grappler: reel them in, pick them up, throw them at their friends.

## The stage: The Ascent of Calderwick

Sootfoot Docks (rainy night moorings) → Foundry Row (molten channels, crushing pistons, the
Foreman's cargo-loader mid-boss) → The Brass Funicular (a fight on the roof of a climbing tram)
→ The Heart-Engine (a boiler-cathedral where Chancellor Vane waits in the Regent Engine).

Enemies are the clockwork **Brassbound** (Tin Footman, Brass Halberdier, Copper Sapper, Iron
Warden, Chrome Duelist) and the goblin **Sootborn** (Soot Cutthroat, Scrap Slinger, Firebrand,
Cinder Hulk, Gutter Wrangler).

## Development

```
npm test             # headless Playwright playthrough: boot, select, combat per character,
                     # full bot playthrough to the results screen, co-op, enemy gallery, audio
node tools/playtest.js playthrough    # run one scenario; screenshots land in tools/screens/
```

Debug URL parameters: `?debug=1` (hitboxes, AI states, FPS), `?skipTo=gameplay&chars=0,2`,
`?skipTo=gallery` (every rig and animation), `?bot=1` (autopilot), `?godmode=1`, `?seed=N`.

Design and technical docs live in `docs/` (`GDD.md`, `ARCHITECTURE.md`, `RECONCILIATION.md`).
