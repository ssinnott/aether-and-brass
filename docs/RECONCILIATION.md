# GDD ↔ Architecture Reconciliation (binding)

Where `docs/GDD.md` and `docs/ARCHITECTURE.md` disagree, THIS file decides. Builders read
all three. Anything not mentioned here: design numbers come from the GDD, technical
rules from ARCHITECTURE.

## Numbers that override the GDD
| Topic | Use this |
|---|---|
| Floor band | `FLOOR_TOP = 200`, `z ∈ [0, 140]` → screen rows 200..340 (not 210..360). HUD strip is the top 40 rows; boss bar sits in rows 342..358. |
| Rig size | The engine's generic rig stands ~72px at `scale 1`. The GDD's rig pixel dimensions were written for a 48px base: **multiply every GDD rig/part pixel size by 1.4**. Relative scales still hold (Sootborn ≈ 0.85, Brassbound ≈ 1.0, Cinder Hulk ≈ 1.35, Iron Warden ≈ 1.45, Hoister ≈ 2.0, Regent Engine ≈ 2.8, Vane ≈ 1.1). |
| Distances | Reach, ranges, knockback, arena widths, radii and stage x-coordinates in the GDD are used **as written** (they were designed for the 640px screen). |
| Physics | `GRAVITY = 0.5` px/f² for everything. Jump `vy = 9.5` (Sael 8.5 + double jump). Launcher `vy = 8`. Juggle re-hit `vy = 5`, +0.05 gravity per juggle hit, 5th hit = hard knockdown. Knockdown pop `vy = 4`. |
| Hit-stop | GDD table: light 3f, medium 5f, heavy/launcher 8f, throw 6f, super finisher 14f (replaces ARCHITECTURE's table). |
| Meter | GDD: 3 bars × 100 (`meter ∈ [0, 300]`), special = 100, super = 300, HP-cost fallback 8% max HP when no bar is full and HP > 15%. |
| Camera | Follows the midpoint of living players, never scrolls left once advanced, locks on 640px arenas during waves (GDD and ARCHITECTURE agree). |
| Section 3 | Camera locked for the whole section; waves are timer-triggered (`at` seconds since section start, or earlier on clear); backdrop auto-scrolls. Stage format gains `mode: 'locked'` + `timedWaves`. |
| Section 4 boss | Boss trigger at x 5900, arena x 5560..6000 (400px band as GDD, clamp to stage end). |

## Final controls (replaces GDD §8 and ARCHITECTURE §16 tables)
Each player owns one half of the keyboard so two people can share it.

| Action  | P1 (left half) | P2 (right half) | P1 solo aliases (active only until P2 joins) | Gamepad (standard map) |
|---------|----------------|-----------------|---------------------------------------------|------------------------|
| move    | W A S D        | Arrow keys      | Arrow keys                                  | D-pad / left stick (deadzone 0.25) |
| attack  | F              | J (Numpad1)     | Z                                           | 0 (A / Cross) |
| jump    | G              | K (Numpad2)     | X                                           | 1 (B / Circle) |
| dodge   | R              | U (Numpad4)     | C                                           | 2 (X / Square) |
| special | H              | L (Numpad3)     | V                                           | 3 (Y / Triangle) |
| super   | Space          | O (Numpad6)     | Space                                       | 5 (RB / R1) |
| taunt   | T              | I (Numpad5)     | B                                           | 4 (LB / L1) |
| start   | Enter          | Backspace (Numpad0) | Enter                                   | 9 (Start) |

- Run = double-tap left/right (12f window) or hold RT (gamepad 7). Dash attack = attack while running.
- Grab = attack within grab reach of an enemy that is NOT in hitstun and not armored (never interrupts a combo). Throw = direction + attack while holding; attack = hold hit.
- Global: `Escape` pauses/unpauses for everyone, `M` mutes, `F1` toggles the debug overlay. `preventDefault()` on all bound keys.
- P2 joins (title, select, pause, or in-game) by pressing any P2-only key (J K U L O I Backspace or Numpad). When P2 joins, P1's solo aliases switch off. Gamepad 0 → P1, gamepad 1 → P2, OR-merged with their keyboard keys.
- Super = separate button (no attack+jump chord).

## Scope tiers
**MUST (the vertical slice; everything here ships):** all 4 characters with full GDD movesets (ground combo, jump attack, dash attack, special, super, grab/throw, taunt, unique trait), 10 enemy variants with their listed attacks/tells/roles, mid-boss (both phases) and final boss (three phases) with all listed attacks, all 4 sections with distinct backdrops/floors/props/hazards/waves exactly as listed, pickups, lives/continues, score/combo/grades/rank, meter/specials/supers, dodge i-frames, juggles, grabs/throws (thrown enemies hit others), hit-stop/shake, HUD, title/select/intro/pause/game-over/results screens, local co-op, gamepad, synthesized SFX + music per section.

**SHOULD (add once MUST is green in your area):** Rook parry; Duelist Riposte; Warden shield stagger/strip; Sapper bombs battable; Slinger bolt reflect; Firebrand death explosion + fire puddles; Hulk grab & Wrangler net with mash-out; Sootborn flee at low HP; ring-outs (molten channel, funicular railings) ; Section 2 conveyor + molten channel in the mid-boss arena; Time Stop dodge-cancel; Aether Step; pressure valves; chandelier; tech roll; co-op revive; difficulty select (Easy/Normal/Hard) on the title menu; no-damage wave bonus; crowd-clear bonus.

**CUT (do not build):** Options menu beyond difficulty + mute, alternate palettes, partner toss, DUO super, attract mode, controls screen (draw a compact controls legend on the title screen instead), MVP/BEST PARTNER badges, per-continue rank penalty (keep: rank from score only), "Boilerplate" difficulty, ghost-bar drain animation (a simple delayed second bar is fine), typewriter text (fade-in is fine).
