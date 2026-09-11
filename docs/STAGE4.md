> **Relationship to the other docs:** this file is to Stage 4 what `docs/GDD.md` is to Stage 1, `docs/STAGE2.md` is
> to Stage 2 and `docs/STAGE3.md` is to Stage 3 — the design authority for *this board's* fiction, faction, bosses,
> layout and audio. It changes no technical contract: everything here is built on `docs/ARCHITECTURE.md` (which still
> wins on technical matters) and `docs/RECONCILIATION.md` (controls, physics, floor band, hit-stop). The four heroes,
> the combat system, the HUD, the pickups, the scoring and the ranks are exactly as Stage 1 defines them.

# 1. Where this board sits

Stage 1 ends with the Chancellor down and the sky unsealed. Stage 2 ends with the Ninth Wing's flagship coming apart
in the weather. Stage 3 ends with the company that supplied both of them closed. **Stage 4 is what is left on the
ground afterwards**, and the people who have been carrying it away the whole time.

**Setting: the tailings west of Calderwick, at dusk, a week after the Ledger House.** The spoil field is where the
city has poured its slag, its ash and its worn-out machinery for a hundred years, and where the tailings gas that
fills a salvage bladder comes up out of the heaps on its own. The Gleaning have worked it for as long as there has
been anything to work. What is new is the crop: three armies' worth of iron has come down in one season, and the
guild has been out under every one of your fights with a bag and a hook, taking the pieces up as they fell.

The Brassguard did not come out here to fight anybody. They came out because the *Stubborn Kettle*'s own boiler
plate — and Vane's engine, and the Wing's coils, and the Chandlery's kilns — are all out here in one place, being
sorted, baled and lifted, and somebody is buying. **Stage 4 is the bill for the first three boards being carried off
over your head.**

**Tone:** Stage 1 was warm and sooty at night; Stage 2 was cold, high and wet; Stage 3 was dry, pale and flat.
**Stage 4 is a rose dusk over a cold field** — the last board, the last light, and the only board where the thing
you are fighting is mostly *above* you. Gas seeps out of the spoil and lights rose where it catches; salvage lines
go up out of the field into a sky full of bladders; nothing here is a building, and by section 4 nothing here is
even ground.

**Visual language deltas from the GDD:**
- Palette: dusk violet `#3A2A4E`, gas rose `#FF57B0`, tailings amber `#E8956A` along the horizon, bladder silk
  `#9CC4D6`, hemp `#9C893F`, cold spoil `#4E5A55`.
- **The ground is COOL and the faction is violet**, on every section: spoil `#4E5A55`, float decking `#586257`,
  loft netting `#4A5450`. This is measured, not decorative — `tools/stage-values.js` reports the Gleaning's worst
  numbers against warm dark ground (six of the seven existing sections sit in a 44–76 degree amber wedge, which is
  where this faction's coat and its wraps already live). A cool green-grey field keeps the plum coat, the hemp yoke
  and the violet boots off the ground they stand on, and the amber is spent in the SKY instead, where the pale
  bladder silk needs it.
- **The board's energy colour is tailings rose `#FF57B0`** — the gas in every bladder, the seep out of the heaps,
  the lit lines in the loft. On this board rose always means *gas*, which always means *something is about to be in
  the air*, and air is the whole board.
- Aether cyan `#4DF0E0` does not appear on this board, and neither does rite lime. Both companies are finished; what
  is out here is a hundred years of other people's scrap and the only guild that never picked a side.
- The faction's universal tell is unchanged: **the bladder swells and the gas lights** above the head, where nothing
  else in the game puts anything. Sootborn (white eye-flash) and Stormcrow (hot white sighting lens) keep theirs.

# 2. The factions: The Gleaning, and everyone the Gleaning is carrying away

The roster lives in `src/content/enemies/gleaning.js` — seven variants built unaffiliated, to be dropped onto a
board. This is that board, and its whole design is the faction's one idea: **everything here fights from the air,
and everything here has to land.**

| Variant | Role | What it does with the sky |
|---|---|---|
| **Picker** | fodder (30 HP) | nothing — no bladder at all, a kerchief, a pick and a sack: the guild's ground crew, and the only Gleaner you can grab whenever you like |
| **Chaff** | rusher | bounces — a flying kick that whiffs under low pokes and always lands inside its own punish |
| **Winnow** | ranged | cranks up to the hang line and drops three re-aimed ballast bags |
| **Thresher** | bruiser | the shadow that dives: a shoulder drop with real armour on the way down |
| **Sickle** | thief | grounded, kites at 96px, takes one purse and runs for the edge with it |
| **Harvestman** | elite | hangs 40 frames and calls two more Chaff down out of the sky on top of you |
| **Riggerman** | grabber (130 HP) | hauls to the hang line and drops a NET that pins you for 90f, glides in and lands beside the man it pinned — the landing is a 1.5x grabbable punish window, and the grab is the pay-off if you are still in the net |

**Faction rules (both are the board's counterplay):** *shot down* — a Gleaner hit while airborne takes 1.5x and
juggles, so anti-air is not a tactic on this board, it is the tactic; and *the landing is the hero moment* — every
hover ends in a long punishable recovery in which the Gleaner can finally be grabbed, because `grabs.js` refuses
airborne targets outright. The bladder itself is a weak point: the bag box takes 1.6x wherever it is hit.

**The other three factions are on this board because the guild is buying them.** Board 4 is four factions
(`tools/stage-census.js`: the Gleaning 7 variants / 48 spawns, the Sootborn 6 / 7, the Stormcrows 5 / 10, the
Brassbound 3 / 8), and the two spawn modifiers that are this board's own (`src/game/traits.js` SPAWN_MODS) are how
it says who the guild has already made its own:
- **The Sootborn field hands** (section 1 only): Cutthroat, Slinger, Firebrand, Cinder Hulk and Gutter Wrangler.
  The goblins have picked these heaps since before the guild had a name, and they work the ground while the
  Gleaning work the air. The **Firebrand is the field's fire**: his flame is what lights a gas seep.
- **The grounded Wing** (sections 2–3): Deck Crimper, Line Corsair, Powder Bosun, Galewright and Ironwing Marine.
  The Ninth Wing came down in the sea a week ago; its survivors have wing-packs, no ship and no wages, so they fly
  for whoever is buying — on the guild's own float, fighting from a raft instead of a deck.
- **`winged`** — a salvage bladder strapped onto any grounded variant: the enemy **arrives from the sky** over the
  middle of the screen, sinks slowly on the bag, takes 1.25x while it hangs there (the Gleaning's own shot-down
  rule, applied to a Tin Footman) and carries the bag weak point above its head. Four winged Tin Footmen and one
  winged Soot Cutthroat, from the press onward: *the Gleaning flying the Concordat's own machine.*
- **`salvaged`** — Brassbound re-plated by the guild in its own colours: plum coat tones over the brass joints, a
  hemp stripe and a riveted hemp plate on the chest, a Brass Cog where the base dropped nothing, and a gear-slip on
  the third hit. Two salvaged Tin Footmen and two salvaged Brass Halberdiers, the press and the loft.

**The rule that shapes the board:** *the sky fills up as you go.* Section 1 is the field — Pickers and Sootborn on
the spoil, the first bladders over it. Section 2 is the guild's own float with the **whole Stormcrow roster
grounded** on it and the Harvestman a section early. Section 3 is the press end of that float, where the guild
flies the Concordat's own machine and walks its re-plated Footmen in under the Gleaners. Section 4 is the loft,
four storeys of other people's war stacked in nets, the Riggerman held back for it, the elite pair together for the
only time on the board, and no floor to speak of.

# 3. Mid-boss: Reeve Tansy Culm & the Baler

The guild officer who prices the crop, fighting inside the field baler she normally walks beside: a press drum
across her back on a hemp yoke, the ram arm bolted down her weapon side and a full bladder over the whole thing so
the machine can be walked out to wherever the crop fell.

- **Phase 1 — THE BALER (320 hp, armour, unlaunchable).** She fights on the deck with the drum on. Two ground
  attacks (the ram, and a low sweep of the bale hook) and one air attack: the press goes up to the hang line and
  comes down on you. Every third attack the drum **over-presses** and stands open for 80 frames at 3x damage and
  grabbable — the same read as the Lime Kiln's over-draw, in a machine that pushes instead of burning.
- **Phase 2 — REEVE CULM (170 hp, grabbable, fast).** The yoke goes, the drum comes off her back, and what is left
  is the officer with a bale hook and half a bag: a two-hit hook string that chains into a rising gaff, and one
  long-range **CALL THE CROP** that brings a Chaff in from either wing. She is the first Gleaner in the game you
  fight without a machine on, and she is the fastest thing on the board.

Both phases are two silhouettes, not one minus a box: phase 1 is a drum wider than her shoulders under a full bag
with the ram arm crossing the body; phase 2 has nothing above the shoulder line but her own hood, and the bag is
slack and half-empty.

# 4. Final boss: Harvestlord Briar Oke, the Gleaning

The guild's head, who has not touched the ground during any of the four boards. Three phases, each one taking the
sky off him.

1. **THE CANOPY (400).** The guild's great bladder on a spreader bar wider than his shoulders, with him under it —
   he does not so much walk as drift: ballast drops that re-aim on the way down, a 76px canopy sweep with the pole
   gaff, and the **HARVEST** call, which brings a Chaff and a Winnow down out of the loft *from above*. Two more
   Gleaners come in off the wings at 66% and 33% whether he calls or not. The widest silhouette in the game.
2. **THE STOOP (340).** The canopy is holed and venting. He is fast and low now, hopping the length of the arena on
   a bag that will not hold him up: a diving shoulder, a gaff hook that drags you forward, and a **VENT** every
   150 hp that stalls him at 2x damage while the bag re-pressurises. This is the phase where the board's own rule
   finally applies to him — he is airborne most of it, and he takes 1.5x for all of it.
3. **THE GLEANER (240).** No bag at all. A man in a hood with a hook and a bag of other people's things, on the
   floor, grabbable, quick: a hook string, a spine-crack with the bale bar, and two lobbed salvage weights you can
   bat back at him for double. He is the smallest silhouette any boss in the game finishes on, and that is the
   point of him.

**THE CROP GOES UP:** on his death every bladder in the loft lets go at once and the whole ceiling of the room —
four boards' worth of stripped iron in nets — rises and goes out through the roof, which is the last thing the game
shows you.

# 5. The board (end to end)

**Stage name:** *The Gleaning of Calderwick.* World x runs 0–5300. Four sections, the same data format as
`stage1.js` / `stage2.js` / `stage3.js` (`ARCHITECTURE.md` section 7 + `RECONCILIATION` `zones` / `transition` /
`mode: 'locked'` + `timedWaves`); the second section is the board's one **locked screen** with timed waves, and it
is the set piece. `tools/stage-census.js` measures it at 73 enemies in 15 waves, 21 distinct variants (a modifier
counts), the top variant (Chaff) at 23%, 11 mixed-faction waves, one reinforcement wave, four timed waves, and a
hazard layout no other section in the game shares. Enemy slugs come from `src/content/enemies`: `gleaning`
throughout, `sootborn` in section 1 (and one winged Cutthroat in section 3), `stormcrow` on the float and the
press, `brassbound` — winged and salvaged — from the press onward.

**Intro card:**
> THREE POWERS ARE DOWN AND THE FIELD IS FULL OF THEM.
> SOMEBODY HAS BEEN FOLLOWING YOU THE WHOLE WAY, PICKING IT UP.
> **THE BRASSGUARD ARE GOING OUT TO THE TAILINGS TO SEE WHO IS BUYING.**

## Section 1, The Tailings (x 0–1800; rose dusk, open field; `glean1`)

Spoil heaps, gas seeping out of them, a dead Brassbound half-buried in the slag with its chest already cut out, and
salvage lines going up into a sky with bladders in it. Flat, open, and the widest floor band on the board — this is
where the game teaches you to look up, and where it teaches you that the rose haze is only a warning.

- **Props:** two **spoil heaps** (x 300, x 1690; Coal Scrip), the guild's pole **lantern** at x 580 (Coal Scrip —
  and a **fire** when it breaks: the spilt oil lights the seep beside it, which is the one thing on the field that
  lights a seep *on purpose*), a **salvage line** at x 1000 (cut it for an Aether Vial), a crate (Brass Cogs), a
  **keg** at x 1460 (Coal Scrip; it goes off 30f after breaking, and the blast lights the back-lane seep), a bucket
  (Roast Bird).
- **Hazards:** two **gas seeps** (`gasSeep`, x 620 on the front lane, x 1400 on the back lane) — rose haze,
  HARMLESS until any fire touches it (a burning body, the Firebrand's flame, a broken lantern, a keg, an explosion),
  then a 12 knockdown + burn burst within 34px and 360f dormant — and the salvage **hook** swinging at x 1120 on the
  line up to the float.
- **Zone:** **sinking spoil** (`spoil`, x 900–1150, z 80–140): every step, slide and dash inside the patch keeps
  55% of its distance. It sits under the hook's arc, and it is the ground you fight the Hulk on.
- **Waves (21):** (1) 3x **Picker** — fodder first, and grounded: the only Gleaners you can grab whenever you like.
  (2) 2x Picker + 2x **Chaff** + 2x Soot Cutthroat — the first thing you will ever see off the ground, over the
  goblins who have always picked here. (3) 1x **Winnow** + 2x Chaff + 1x Scrap Slinger + 1x **Firebrand** — two
  things aiming at the same square of floor, and the first fire on the field (the seep at x 1400 is in this wave's
  view). (4) 1x **Sickle** + 1x Winnow + 1x Picker + 1x Cinder Hulk + 1x Gutter Wrangler — the section's exam:
  something is stealing at your feet while something else is aiming at them, on spoil that will not let you run —
  and when one is left standing **the bladder goes up and the next wave comes down**: 2x Chaff out of the sky.
- **Exit:** the guild's own cargo hoist takes the party **up** off the field (`kind: 'lift'`, `up: true`, atX
  1740) — onto the float.

## Section 2, The Lash-Up (x 1800–2440; the guild's float, one locked screen, timed waves — the set piece; `glean2`)

A raft of lashed-together wrecks — a Concordat hull plate, half a Wing gunboat, a Chandlery kiln drum — hanging over
the field on forty bladders, **under way**: the camera locks to the screen and the far parallax (the field a long
way below, the loft off the end of the float) scrolls itself at `drift: 0.4` px/frame, so the raft reads as a thing
drifting toward the press end rather than a still screen. No bulwark anywhere on it.

- **Props:** two **salvage lines** (x 1930, x 2380; Aether Vials, one at either end), a **gas bag** at x 2060 (a
  Meat Pie and a rose puff — never a fire source), a ballast bag at x 2200 (Meat Pie). The arrival spot (x
  1870–1910) stays clear.
- **Hazards:** two **ballast drops** (`ballastDrop`) — the lines landing their loads: a shadow grows on the deck
  for 36f, then a ballast bag lands for 14 knockdown, every 240f — at x 1960 on the middle lane and at x 2280 on the
  front lane half a cycle later.
- **Zone:** `rails` over the whole raft (x 1800–2440): the front and back 12px are open air over the field, and
  anything thrown over goes into it for +200.
- **Timed waves (17)** — each fires at its time, or as soon as the one before it is cleared: **0s** 1x
  **Thresher** + 2x Picker + 1x **Deck Crimper** (the first Stormcrow on the board, grounded and working). **22s**
  1x **Harvestman** (a section early: he hangs and calls the crop down) + 2x Chaff + 1x **Powder Bosun** + 1x Deck
  Crimper. **50s**, banner **THE WING COMES DOWN**: 1x **Galewright** + 2x Deck Crimper + 1x **Line Corsair** — a
  coil on a raft with no rails and two Crimpers to walk you toward the edge. **80s** 1x Thresher + 1x Winnow + 1x
  **Ironwing Marine** (down out of the bladders above the raft, `side: 'sky'`) + 1x Chaff.
- **Exit:** the raft noses in against the press end — `kind: 'dock'`, banner **THE PRESS END**, the hemp hoist
  platform as the landing (look `hoist`), two Meat Pies on it.

## Section 3, The Press (x 2440–3600; the float's press end, decked in; `glean2`)

The end of the float where the crop is baled: the press crane, the windlasses, and the Reeve's baler at the far end
of it. **Decked in** — no rails and no net squares, because the Reeve's arena is at the end of it and a ring-out
zone inside a boss arena can only cost a player a life (the boss cannot be thrown out of it). The backdrop paints a
low hull-plate bulwark along the deck edges here instead of the raft's rope-and-air.

- **Props:** a crate (Brass Cogs), a keg (Coal Scrip), a **gas bag** at x 2790 (Meat Pie), the urn holding the
  board's **Brass Heart** (1-UP) at x 2900, a **lantern** at x 3012 (the fire that lights the seep beside it), and
  in the Reeve's arena a **salvage line** at x 3200 (Aether Vial) and a gas bag at x 3400 (Meat Pie).
- **Hazards:** a **ballast drop** at x 2640 on the back lane, the press crane's **hook** at x 2900 over the middle
  lane, and one **gas seep** at x 3060 on the front lane just short of the arena — a different layout from the
  field and the raft.
- **Waves (15):** (1) 1x Sickle + 2x **Tin Footman (salvaged)** + 1x Chaff — *meet the salvage*: two Footmen
  re-plated in plum and hemp, walking in under a Sickle. (2) 1x Thresher + 2x **Tin Footman (winged)** + 1x Line
  Corsair + 1x Picker — the guild flying the Concordat's own machine: two Footmen sink in out of the sky on salvage
  bladders. (3) 1x Winnow + 1x **Brass Halberdier (salvaged)** + 1x **Soot Cutthroat (winged)** + 2x Chaff + 1x
  Powder Bosun — the last line before the Reeve.
- **Mid-boss** (x 3400): **Reeve Tansy Culm & the Baler** at the press (`arena: 3120..3600`).
- **Exit:** the loft hatch comes down against the float and the party goes in (`kind: 'board'`, atX 3540).

## Section 4, The Crop Loft (x 3600–5300; inside the guild's great bag; `glean3`)

The belly of the biggest bladder the guild owns, and the only interior in the game with no floor: net decking over a
drop, four storeys of stripped war in cargo nets overhead, and rose gas lighting all of it from inside the silk.
Only the guild in here, and the scrap it has made its own.

- **Props:** two **cargo nets** overhead (x 3960, x 4660) — only a **jump attack** opens one, and when it does its
  load, a rolling **chassis**, comes down on the floor under it and rolls away from whoever opened it as a live
  hazard (Brass Cog when it breaks); a case (Golden Sprocket), a **lantern** at x 4170 on the sorting line (the only
  fire in a bag full of gas), a **salvage line** at x 4240 (Aether Vial), an urn and a **gas bag** (Meat Pies) before
  the hang line, a bucket (Roast Bird).
- **Hazards:** one **gas seep** at x 4120 on the back lane (the loft's own gas coming up through the netting) and a
  **ballast drop** at x 4500 on the front lane, from the nets above.
- **Zones:** **net decking** (`netGive`, x 3700–4800) with three marked squares — x 3900 z 60, x 4300 z 110, x 4600
  z 40 — that give way under a knockdown or thrown landing: the square sags for 10f and is open for 60f, enemies
  standing in it ring out (+200), players lose 8% of max HP, are knocked down and set on the nearest edge. All
  three are short of the boss camera box. And `daisVents` from x 4880 in rose — the Harvestlord's canopy is eating
  the loft's own gas and the deck edge vents where it does.
- **Waves (20):** (1) 1x **Riggerman** (held for the loft: *meet the net*) + 2x Chaff + 1x Picker. (2) 1x Winnow +
  1x Thresher + 2x Tin Footman (winged) + 1x Sickle — the Concordat's machine on the guild's bladders, over a net
  floor. (3) 1x Harvestman + 1x Riggerman + 2x Chaff + 1x Brass Halberdier (salvaged) — the elite pair, together
  for the first time on the board: the Harvestman's call over the Riggerman's net. (4) 1x Harvestman + 1x Thresher
  + 1x Sickle + 1x Riggerman + 1x Chaff + 1x Winnow — the last wave of the campaign, everything in the room in the
  air at once.
- **Boss:** **Harvestlord Briar Oke** on the loft's own hang line (`atX: 5200`, arena `4880–5300`, camera
  `4660–5300`). The floor band shrinks 20px an edge per phase as it always does, and phase 2 takes another 16 on
  top: by the time he is on the deck with you there is very little deck left.

# 6. Audio

| Cue | Track | Notes |
|---|---|---|
| Section 1 | `glean1` | 118 bpm, Am — a slow field track: bowed pad, hemp-rope pizzicato, no drums until the first wave |
| Sections 2–3 | `glean2` | 130 bpm, Em — the float: a rolling bass and a windlass tick under the lead |
| Section 4 | `glean3` | 142 bpm, Bm — inside the bag: pad, harp figure and the loft's own creak on the drums |
| Mid-boss | `midboss4` | 150 bpm, Em (Em–C–Am–B7) — **the Baler's own track**: a triangle bass and an organ pad under a saw lead (a pulse lead doubles it a fourth down while she is swinging), and the press on the drums — **the ram on the one and the three** (kick on beats 1 and 3, the snare answering on 4) **over a windlass tick** (toms on every eighth) and a closed hat. A yard machine, not a winch: `stage.music.midboss` is unique per board |
| Boss | `cropboss` | 160 bpm, Am — the campaign's last track, and the only one that ends on the tonic |
| Stage clear | `results` | as every board |

Board 4's stage-clear banner is **THE CROP GOES UP**; the mid-boss plate is **REEVE DEFEATED**.

# 7. Picking the board

Board 4 is **locked until you clear board 3**, and it is the last board: clearing it opens nothing, which
`progress.markCleared` already handles (`STAGES[index + 1]` is undefined and the results screen shows no NEW BOARD
OPEN plate). Its BOARD SELECT plaque uses the `crop` motif: the spoil field at dusk under a sky of bladders, with
one loaded net on a line crossing the frame. `?stage=4` links straight to it, as for every other board.
