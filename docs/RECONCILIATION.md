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

## Scope tiers — final ship status (verified 2026-09-07 against the tree)

**MUST (the vertical slice) — SHIPPED IN FULL.** Verified end to end: a bot playthrough
(`?bot=1&godmode=1&seed=5`) runs title → select → all four sections → both bosses → victory
spectacle → results in ~22,000 frames with zero runtime errors (the bot auto-skips the intro
card; it was screenshot-verified separately with `skipTo=intro`), and
`node tools/playtest.js` (boot select combat playthrough coop gallery audio) is 127 checks,
0 failures.

| MUST item | Status |
|---|---|
| 4 characters, full GDD movesets (ground combo, jump/dash attack, special, super, grab/throw, taunt, trait) | `content/characters/{brunhild,sael,rook,pip}.js` — 29–31 animations each, complete state sets |
| 10 enemy variants + roles/attacks/tells | `content/enemies/{brassbound,sootborn}.js` — 5 + 5, all registered in `ENEMY_LIST` |
| Mid-boss (both phases) | `content/enemies/midboss.js` — Hoister 300 + Overheat 300 (the GDD's "2-segment bar, phase 2 at 50 %") then Grubbik on foot 100 |
| Final boss (three phases) | `content/enemies/boss.js` — Regent Engine Legs → Body → Chancellor Vane |
| 4 sections, distinct backdrops/floors/props/hazards/waves | `content/stage/stage1.js` + `art/backgrounds/section1..4.js`; 15 waves cleared per full run |
| Pickups, lives/continues, score/combo/grades/rank | `game/items.js`, `game/hud.js` (per-player CONTINUE countdown), `game/screens/results.js` |
| Meter / specials / supers, dodge i-frames, juggles, grabs & throws (thrown enemies hit others) | `game/player.js`, `game/fighter.js`, `game/grabs.js` |
| Hit-stop / shake, HUD, title / select / intro / pause / game-over / results | `game/screens/*`, `game/hud.js` |
| Local co-op, gamepad | `engine/input.js` (P2 drop-in on any P2 key; pads 0→P1, 1→P2) |
| Synthesized SFX + music per section | `engine/audio/{sfx,music,synth}.js` — all canonical names below implemented |

Nothing from MUST is missing.

**SHOULD — built (all but one):**
Rook parry (`content/characters/rook.js` + `game/traits.js`); Duelist Riposte (`brassbound.js`
`riposteStance`/`riposte`); Warden shield stagger + launcher shield strip; Sapper bombs battable
(`reflectable`, `damageOnReflect: 20`); Slinger bolt reflect (flat `onReflect` so a batted bolt
travels back down the lane); Firebrand death explosion + fire puddles; Cinder Hulk grab and
Wrangler net, both with mash-out (`status.mashNet`, `player.mashCount`); Sootborn flee at low HP
(`ai.fleeHp` / `ai.fleeLast`); ring-outs (molten channel + funicular railings, `game/hazards.js`);
Section 2 conveyor + molten channel in the mid-boss cargo bay; Time Stop dodge-cancel
(`enemy.timeStop` honours `dodgedRecently`); Aether Step (Vane `blinkAnim`); pressure valves and
the chandelier (`game/items.js` + the section 4 props); tech roll (`player.js`); difficulty select
(Easy/Normal/Hard on the title menu, `DIFFICULTY` in `screens/gameplay.js`); crowd-clear bonus;
**no-damage wave bonus (+1000, `game/stage.js`)**.

**SHOULD — not built (the one gap):** *co-op revive* in the GDD 7 sense — a partner at 0 lives
lying as a ghost for 15 s, revived by holding Taunt beside them for 120 f, once per section. What
ships instead is the MUST-tier continue system: a downed player gets their own 10-second
CONTINUE? countdown on their side of the HUD while the partner keeps playing, and any of
attack/jump/special spends a continue to bring them back (`game/hud.js`).

**CUT — confirmed absent from the tree:** no options menu beyond difficulty + mute, no alternate
palettes, no partner toss, no DUO super, no attract mode, no controls screen (the title draws the
compact legend instead), no MVP / BEST PARTNER badges, no per-continue rank penalty (rank comes
from score only; a lost continue countdown caps it at D), no "Boilerplate" difficulty, no ghost-bar
drain animation (the HUD uses the simple delayed second bar), no typewriter text.

## Game title
The game is **AETHER & BRASS** (logo already on the title screen). The GDD's "CALDERWICK" logo is
overridden; "The Ascent of Calderwick" stays as the stage name and appears on the intro card.

## Backdrop API (art/backgrounds/index.js — already in the tree)
`createBackdrop(section, stage)` → `{ update(frame, cam), drawBack(ctx, cam, frame), drawFront(ctx, cam, frame) }`.
Per-section modules `art/backgrounds/section1.js … section4.js` export `create(section, stage)` with that
shape; `index.js` dispatches by `section.backdrop` and falls back to a placeholder. `game/stage.js`
awaits `backdropsReady()` once (or just tolerates the placeholder for the first frames). Props,
hazards and pickups are game entities, NOT backdrop.

## Canonical audio names (game code calls these; engine/audio.js implements them)
Unknown names must silently no-op (console.warn once when `?debug=1`).
- UI: `menu_move menu_confirm menu_back pause unpause join continue_tick rank_stamp go_arrow stage_clear game_over`
- Generic combat: `hit_light hit_medium hit_heavy hit_launch hit_knockdown hit_grab throw whiff parry armor dodge jump land land_heavy getup stagger gear_slip meter_full`
- Factions: `brass_hit brass_tell brass_death soot_hurt soot_death soot_flee`
- Hero weapons: `hammer_swing hammer_slam rapier rapier_arc revolver revolver_fan piston grapple claw steam_vent`
- Specials/supers: `special_brunhild special_sael special_rook special_pip super_charge super_brunhild super_sael super_rook super_pip`
- World: `prop_break explosion explosion_big fire burn steam vent_tell piston_crush crate_drop bomb_fuse bomb_bat net whip sling bolt chime hydraulic saw_whine time_stop_tick aether_step valve_blow hook_yank cannon`
- Pickups: `pickup_food pickup_score pickup_meter pickup_life`
- Bosses: `boss_intro boss_phase boss_defeat roar`
- Music tracks (`audio.music.play(name)`): `title section1 section2 midboss section3 section4 boss results gameover`

## File ownership for parallel work (no two agents edit the same file)
- Game core (fighter/player/enemy/boss/combat/world/stage/items/hazards/projectile/hud/screens/bot, main.js, input.js bindings): game-core workflow.
- `engine/audio.js` (+ optional `engine/audio/*.js` helpers): audio workflow only. Game code only calls `audio.play` / `audio.music.play`.
- `art/backgrounds/section1..4.js`, `art/backgrounds/common.js`: backdrop workflow only (index.js is fixed).
- `content/characters/*.js`: one agent per character file after the game core lands.
- `content/enemies/*.js`: enemy workflow after the game core lands.
- `content/stage/stage1.js`, `art/props.js`: stage workflow after the game core lands.
