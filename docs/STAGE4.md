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
go up out of the field into a sky full of bladders; nothing here is a building, and by section 3 nothing here is
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

# 2. The faction: The Gleaning

The roster already exists in `src/content/enemies/gleaning.js` — five variants built unaffiliated, to be dropped
onto a board. This is that board, and its whole design is the faction's one idea: **everything here fights from the
air, and everything here has to land.**

| Variant | Role | What it does with the sky |
|---|---|---|
| **Chaff** | rusher | bounces — a flying kick that whiffs under low pokes and always lands inside its own punish |
| **Winnow** | ranged | cranks up to the hang line and drops three re-aimed ballast bags |
| **Thresher** | bruiser | the shadow that dives: a shoulder drop with real armour on the way down |
| **Sickle** | thief | grounded, kites at 96px, takes one purse and runs for the edge with it |
| **Harvestman** | elite | hangs 40 frames and calls two more Chaff down out of the sky on top of you |

**Faction rules (both are the board's counterplay):** *shot down* — a Gleaner hit while airborne takes 1.5x and
juggles, so anti-air is not a tactic on this board, it is the tactic; and *the landing is the hero moment* — every
hover ends in a long punishable recovery in which the Gleaner can finally be grabbed, because `grabs.js` refuses
airborne targets outright. The bladder itself is a weak point: the bag box takes 1.6x wherever it is hit.

**The rule that shapes the board:** the sky fills up as you go. Section 1 is a field with **Sootborn** in it — the
goblins have picked these heaps since before the guild had a name, and they work the ground while the Gleaning work
the air. Section 2 puts you on the guild's own float with **grounded Stormcrows** — the Ninth Wing came down in the
sea a week ago and its survivors have wing-packs, no ship and no wages, so they fly for whoever is buying. Section 3
is the loft, where it is nothing but the guild, four storeys of other people's war stacked in nets, and no floor to
speak of.

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

Three sections, `length: 5300`, the same data format as `stage1.js` / `stage2.js` / `stage3.js`
(`ARCHITECTURE.md` section 7 + `RECONCILIATION` `zones` / `transition`). Enemy slugs come from
`src/content/enemies`: `gleaning` throughout, `sootborn` in section 1, `stormcrow` from the float onward.

## Section 1, The Tailings (x 0–1800; rose dusk, open field)

Spoil heaps, gas seeping out of them, a dead Brassbound half-buried in the slag with its chest already cut out, and
salvage lines going up into a sky with bladders in it. Flat, open, and the widest floor band on the board — this is
where the game teaches you to look up.

- **Hazards:** two gas seeps (`steamVent`) and one swinging salvage hook (`hook`) on the line to the float.
- **Waves:** three Chaff (the bounce, alone, so you learn the punish) → Chaff and Sootborn cutthroats in the same
  wave → the first Winnow, with a Sootborn slinger to keep you honest under it → a Sickle and a Winnow together
  with two Chaff, which is the section's exam: something is stealing at your feet while something else is aiming at
  them.
- **Exit:** the guild's own cargo hoist takes the party up off the field (`transition: lift`).

## Section 2, The Lash-Up (x 1800–3600; the guild's float, open air)

A raft of lashed-together wrecks — a Concordat hull plate, half a Wing gunboat, a Chandlery kiln drum — hanging over
the field on forty bladders, with the crop coming up onto it on lines. No bulwark for the first two thirds of it: the
front and back 12px are open air (`zones: rails`, x 1800–3120), so anything thrown over the edge goes into the field
for +200. The press end, where the Reeve is, is decked in — a ring-out zone inside a boss arena can only cost a
player a life, since the boss cannot be thrown out of it.

- **Hazards:** two gas seeps venting through the decking and one hook on the loading line.
- **Waves:** a Thresher with a Chaff screen → two grounded Stormcrow crimpers with a Winnow above them → a Sickle,
  a Thresher and two Chaff, the last wave before the Reeve.
- **Mid-boss:** **Reeve Tansy Culm & the Baler** at the press at the far end (`atX: 3400`, arena `3120–3600`).
- **Exit:** the loft hatch comes down against the float and the party goes in (`transition: board`).

## Section 3, The Crop Loft (x 3600–5300; inside the guild's great bag)

The belly of the biggest bladder the guild owns, and the only interior in the game with no floor: net decking over a
drop, four storeys of stripped war in cargo nets overhead, and rose gas lighting all of it from inside the silk.

- **Hazards:** two seeps through the netting and one hook on the sorting line.
- **Zone:** `daisVents` from x 4880 in rose — the Harvestlord's canopy is eating the loft's own gas and the deck
  edge vents where it does (5 damage every 20f inside).
- **Waves:** a Harvestman with two Chaff → a Winnow, a Thresher and two Stormcrow corsairs on the nets → the last
  wave of the campaign: a Harvestman, a Thresher, a Sickle and two Chaff, with everything in the room in the air at
  once.
- **Boss:** **Harvestlord Briar Oke** on the loft's own hang line (`atX: 5200`, arena `4880–5300`). The floor band
  shrinks 20px an edge per phase as it always does, and phase 2 takes another 16 on top: by the time he is on the
  deck with you there is very little deck left.

# 6. Audio

| Cue | Track | Notes |
|---|---|---|
| Section 1 | `glean1` | 118 bpm, Am — a slow field track: bowed pad, hemp-rope pizzicato, no drums until the first wave |
| Section 2 | `glean2` | 130 bpm, Em — the float: a rolling bass and a windlass tick under the lead |
| Section 3 | `glean3` | 142 bpm, Bm — inside the bag: pad, harp figure and the loft's own creak on the drums |
| Mid-boss | `midboss2` | the Wing's mid-boss track, reused: a winch is a winch |
| Boss | `cropboss` | 160 bpm, Am — the campaign's last track, and the only one that ends on the tonic |
| Stage clear | `results` | as every board |

Board 4's stage-clear banner is **THE CROP GOES UP**; the mid-boss plate is **REEVE DEFEATED**.

# 7. Picking the board

Board 4 is **locked until you clear board 3**, and it is the last board: clearing it opens nothing, which
`progress.markCleared` already handles (`STAGES[index + 1]` is undefined and the results screen shows no NEW BOARD
OPEN plate). Its BOARD SELECT plaque uses the `crop` motif: the spoil field at dusk under a sky of bladders, with
one loaded net on a line crossing the frame. `?stage=4` links straight to it, as for every other board.
