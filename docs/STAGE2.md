> **Relationship to the other docs:** this file is to Stage 2 what `docs/GDD.md` is to Stage 1 — the design authority
> for *this board's* fiction, faction, bosses, layout and audio. It changes no technical contract: everything here is
> built on `docs/ARCHITECTURE.md` (which still wins on technical matters) and `docs/RECONCILIATION.md` (controls,
> physics, floor band, hit-stop). The four heroes, the combat system, the HUD, the pickups, the scoring and the ranks
> are exactly as Stage 1 defines them.

# 1. Where this board sits

Stage 1 ends with Chancellor Vane down, the welded safety valves blown open and the sky over Calderwick unsealed for
the first time in a year. **Stage 2 is the morning after.**

**Setting: the sky itself.** The Concordat's air arm — the **Ninth Aeronaut Wing** — was moored above the city when the
Heart-Engine went cold. Nobody told them the war was over, and their commander has decided that a sky the Chancellor
sealed is a sky the Wing still owns. Their blockade is sitting on the mooring spine above Calderwick, and the first
freighter that tried to leave is now a prize hanging off their flagship's beam.

The Brassguard take the *Stubborn Kettle* up to ask them to stand down. It goes about as well as expected.

**Tone:** where Stage 1 was a climb through a city — warm, sooty, downhill light and furnace orange — Stage 2 is
**cold, high and wet**. Storm violet, canvas cream, wet iron and one amber sun that never clears the weather. The
brass is still here; there is just a lot more sky behind it.

**Visual language deltas from the GDD:**
- Palette: storm slate `#44557A`, canvas `#D6CBB2`, pewter `#9AA6B4`, wine `#7C2B34`, deck timber `#8A7250`.
- **Static violet `#9B7BFF` is the new energy colour.** It appears on Stormcrow coils, wing-packs and powder marks.
  Aether cyan `#4DF0E0` stays reserved for Concordat machinery, so on this board it reads as "old regime": the
  Brassbound the Wing carries aboard (section 2 below) and the summit glow far below. The board-select plaque's
  accent is the violet too, not the cyan.
- Every faction keeps its universal tell. Brassbound: lens goes red. Sootborn: eyes flash white. **Stormcrow: the
  glass on the head — goggles, loupe or sealed sighting lens — goes hot white and blinks in the last frames of the
  wind-up.** One unmistakable light per head, whatever the head is wearing.

# 2. The factions: The Stormcrows (base + 7 variants) and the clockwork marines

**Type identity:** people, not machines and not goblins. Aeronauts fight the way people fight on a windy deck — they
give ground, they hop back out of a swing that missed, they keep their feet. They are the *pressure* faction: nothing
here is unkillable, but nothing here stands still to be hit either. The Wing is the board; the **Brassbound** are its
second faction — the clockwork marines it carries aboard (the end of this section).

**Base rig** (`src/content/enemies/stormcrowRig.js`): a tall wedge. High-collared storm coat flaring into two tails
(a secondary-motion chain, so they lag in the run), crossed canvas boarding straps, a folded **wing-pack** on the back
that flares open on any hop or lunge, oiled canvas sleeves over warm skin, and a piece of glass on every head.

**THE HIGHER THE RATE, THE MORE SEALED THE MASK.** The head is the rank ladder, and it runs bare face -> welded shut:

| Rate | Variant | Head |
|---|---|---|
| 0 | Deckhand | watch cap, **goggles shoved up** onto it, no wing-pack — a pressed hand, not a rate |
| 1 | Deck Crimper | knotted bandana, **goggles shoved up** onto the knot — a whole face |
| 2 | Line Corsair | slouch hat, **goggles under the brim** — a face behind glass |
| 2b | Grapnel Mate | peaked cap, **goggles DOWN over the eyes** — a petty officer, one rung over the Corsair |
| 3 | Powder Bosun | bald and bearded, **one eye behind a brass loupe** — half a face |
| 4 | Galewright | **sealed keel visor**: pewter dome, storm cowl, long gun-metal beak, one big lens |
| 5 | Ironwing Marine | **sealed iron muzzle**: crest, short grilled beak, one small hot-white sighting lens |

The Powder Bosun is the hinge — one eye glassed, one eye human — so the step from face to mask happens exactly
between him and the Galewright. The two sealed heads keep the eye row, the eye spacing, the brass lens rim and the
copper filter can at the chin that the bare ones have, so they read as the same species, welded shut.

**Rank colour.** Every Stormcrow's rank is one warm ramp heated a step per rate — brick rust, ember red, flame
orange, signal amber, hot gold (`WATCH` in `stormcrow.js`, mirrored into `palette.rank` so far limbs shade
correctly) — and the marks that carry it multiply as the rate climbs and move UP the body: 0 carriers on the
Deckhand (plain strap leather where the brassard goes), 1 on the Crimper (the arm band), 2 on the Corsair
(+ hatband), 2 on the Grapnel Mate (+ cap band, one rung hotter than the Corsair), 3 on the Bosun (brow band, smock
collar, waist sash — never on his bare arms), 4 on the Galewright (brow band, gorget, armbands, trouser lace), 6 on
the Marine (helm-crest edge, cuirass band, armbands, cuffs, lace, wing-plate boss). Rank colour is the ONLY
high-chroma warm left on a rig — every scarf and the Crimper's bandana are neutral — so nothing on the deck competes
with the mark that says who is in charge. The brass wing badge in the same chest position on every rate is what
still says "Ninth Wing".

**Flag rank** does not continue the ramp, it steps out of it: the two bosses wear the Wing's **red in a gold frame**
(a `GOLD_DK` edge under every band, and gold hardware round it). Cloth alone = rated; cloth in a gold frame = flag
rank — which also keeps the Marine's signal gold from reading as a boss.

**Faction rules:**
- **Jump attacks do 1.5x** (`traits.jumpAttackTakenMult`). A Stormcrow covers the deck, not the air above it; going
  over the top is the answer to a line that will not break.
- **At most 2 attack at once** (`tokenGroup: 'stormcrow'`); the rest circle on the other z lane.
- **Everyone backsteps.** Two whiffed player attacks in a row nearby and they hop out of range with i-frames
  (`backstepAfterWhiffs`). Mashing into a Stormcrow line is punished by distance, not by damage.
- No armour anywhere except the Ironwing Marine's wing-plate.

| Variant | HP | Dmg | Speed | Score |
|---|---|---|---|---|
| Deckhand | 35 | 7 | 1.10x | 100 |
| Deck Crimper | 45 | 6 | 1.20x | 150 |
| Line Corsair | 40 | 9 | 1.15x | 200 |
| Grapnel Mate | 120 | 8 | 0.90x | 550 |
| Powder Bosun | 85 | 14 | 0.85x | 300 |
| Galewright | 90 | 12 | 1.00x | 500 |
| Ironwing Marine | 190 | 16 | 0.70x | 1000 |

**C0. Deckhand** — *the pressed crew.* Undyed canvas slop, a watch cap with the goggles shoved up, a bedroll for a
back piece and a belaying pin off the fife rail; **no wing-pack** and no rank. Short, stooped and cowed (scale 0.9),
the one Stormcrow who does not keep his feet: he flinches on every hit, weighs 0.8 and is throwable — he is what you
throw off the Spine. A two-hit **club** (5 + 5, the return stroke is its own hit) and a shoulder **barge** from mid
range (7, medium, real knockback). *First:* Section 1, Wave 1 — the fodder-only opener, so the first thing the board
teaches is the rail.

**C1. Deck Crimper** — *the fodder with a hook.* Base coat, one ash-rust armband and nothing else (a dirty canvas rag
for a bandana — the lowest rate wears no rank above the collar), a 50px ash boat hook. Jabs at 50px (18f tell), a low
**sweep** that hooks both feet out (knockdown), and a **lunge** from mid range with the wing-pack popping for the
step. Flanks on both lanes. *First:* Section 1, Wave 2.

**C2. Line Corsair** — *the reason you keep moving.* Teal coat, brick-red armband and hatband — the first rate
whose colour reaches the head — a stubby reel-gun. Holds 150px and
puts a **harpoon** down the lane (24f tell, sighting down the barrel). **Any player attack bats the harpoon back for
14** — exactly like the Scrap Slinger's bolt, and exactly as necessary, because a Corsair at the far end of the deck
is otherwise free damage. Butt-strokes anything that gets inside the gun. *First:* Section 1, Wave 2.

**C2b. Grapnel Mate** — *the line.* Pea-coat navy, peaked cap, goggles down, a grapnel drum on his back and the iron
in his fist; scale 1.05, the longest arms on the deck. Quartermaster Skree's trick in miniature: 28f whirling the
iron up behind him (the lenses light), then the **grapnel line** goes out flat down the lane for 240px (8, medium)
and whoever it bites is **reeled back along it** into his hands. Three squeezes (6 each), then the throw goes
**BACKWARD** over his shoulder (18). It is a **repositioning** move, not a ring-out: `hazards.js` rings out enemies
only — a player over a rail is clamped back onto the deck — and no throw in the game imparts vz, so nothing he does
can put you over the side. What it costs you is ground: it drags you off the line you chose and back down the deck
you just fought up. Not reflectable; the counterplay is the 30 frames he spends paying out line after a cast, when a
hit on him drops the line slack. Comes straight down your lane (no flanking), flinches every second hit, drops meter.
*First:* Section 2, Wave 3; he works hardest on the locked gun deck of Section 3, where the screen will not scroll
and every foot he drags you back is a foot you have to take again.

**C3. Powder Bosun** — *the crowd control.* Grey-violet coat, ember-orange brow band, smock collar and waist sash
(the widest rank field on the deck; nothing on his bare arms), scale 1.15, a four-link **chain shot**.
The chain goes round in a full circle: 58px, **hits behind as well as in front**, 14 — a heavy flinch, not a
knockdown: it stops you where you stand rather than putting you down. From range he lobs a **powder keg** at where
you stood 20 frames ago; it bounces once and goes off for 14 on *everyone*, his own side included. He only flinches
on every second hit. *First:* Section 1, Wave 3.

**C4. Galewright** — *the tell you have to respect.* Violet coat, sealed keel visor, amber rank, a copper-wound
**storm coil**. The coil charges for 36 frames — the bulb brightens, and **the sighting lens grows and ramps violet
-> hot white** with `rig.coil` before it blinks in the last 14 (the lens carries the charge now; there is no
standing-on-end hair under a sealed helm) — and then throws an arc **130px down the lane**:
12 damage and **30 frames of stunned**. It is slow and loud on purpose — the answer is to be somewhere else, which is
what the **repel** (a short pressure wave, no real damage, big knockback) is for: it puts you back in the lane.
Ignores attack tokens, circles, dodges. *First:* Section 2, Wave 1.

**C5. Ironwing Marine** — *the wall.* Deep navy, scale 1.31, boarding axe, and a three-vane **wing-plate** strapped to
the off hand. The top of both ladders: sealed iron muzzle with a small hot-white sighting lens, and signal gold on
six carriers, more rank than the other four together. He is a big head with a small eye where the Galewright is a
small head with a big eye — that inversion, her long keel beak against his short grilled muzzle, and his crest
against her swept cowl are what keep two pewter helms from reading as the same man. Super armour and no launch
while the plate is up; **every 4th hit staggers him for 30 frames**, and a
launcher during that stagger **strips the plate for good** (it blows apart in a shower of pewter). After that he
flinches and launches like anybody else. Grabbable only by Pip. Shove (armoured, advancing) chains into a chop that
puts you on the deck. *First:* Section 2, Wave 2 — he comes through the gas-cell netting from above.

## The second faction: the clockwork marines

The Concordat's blockade ships carried Brassbound the way any warship carries marines, and the Wing still has them.
**THE HIGHER YOU BOARD, THE MORE CLOCKWORK:** two machines in the Spine's twenty bodies, five in the freighter's
twenty, eleven in the gun deck's nineteen, and ten in the bridge's fifteen. The rule is the share and not the head
count — 10%, 25%, 58%, 67% — so the bridge still tops the ladder on one machine fewer than the gun deck: it is the
Admiral's own clockwork closed around her, her Duelists and the Wardens on the tower door, with her rated Stormcrows
over them and no pressed crew at all. Every Brassbound variant (`docs/GDD.md` section 4: Tin Footman, Copper Sapper,
Brass Halberdier, Iron Warden, Chrome Duelist) keeps its Stage 1 behaviour and its red-lens tell; what changes is the
wind-up.

- **Holdouts** (`mods: ['holdout']`, `game/traits.js SPAWN_MODS`): the machines the Wing never bothered to unbolt,
  still walking their old posts on the Spine and in the freighter's hold and brig. Dead-grey lens and core (the red
  tell still fires), **no wind-up key** on the back, walk and run at 0.8x, **1.3x HP**, 1.2x score. Seven on the
  board: a Footman in each of Section 1's last two waves, two Sappers and a Halberdier in the Gas-Halls, and the two
  Footmen the brig gives up in Section 3. They are the only modifier this board uses.
- **Re-wound** (no modifier): the Brassbound the Wing wound back up for its boarding parties — the un-modded Stage 1
  machines, first seen as the two Footmen guarding the winch bay (Section 2, Wave 4), then the flagship's two gun
  crews, and finally the tower guard on her bridge — the Footmen, the Halberdier, the Sappers, and the Admiral's own
  Wardens and Duelists.
- **Elite pairs** fight together only in the last section, and there every wave has one: Marine + Duelist (Wave 1),
  Galewright + Marine + Warden (Wave 2), Duelist + Warden (Wave 3). The Galewright and the Marine share a wave exactly
  once on the board, and so do the Warden and the Duelist. **No Iron Warden stands on the gun deck**: both of them are
  the Admiral's tower-door guard on the bridge. The gun deck's elites are the Wing's own — the Ironwing Marine who
  walks the brig's holdouts up onto his deck, and the Galewright over the second gun crew — which is Brassbound line
  troops under Stormcrow officers, the way round issue #28 asked for.

Board census (`node tools/stage-census.js`): 74 enemies over 15 waves, **15 distinct variants** (a holdout counts as
its own), Stormcrows 46 (7 variants) / Brassbound 28 (8), top share Deck Crimper 18%.

# 3. Mid-boss: Quartermaster Skree & the Grapnel Winch

- **Concept:** the Wing's quartermaster, strapped into the freighter's own cargo winch — a drum of chain on a harness
  with a grapnel on the end. She is a Stormcrow at 1.5x in the harness and 1.3x once it comes off, so the fight
  reads as "one of them, but the machinery is hers".
- **HP:** the Winch 320 (armoured, unlaunchable), then Skree on foot 160.
- **Phase 1 attacks:**
  1. *Chain Sweep* — 28f wind-up over the head, then the whole length in a circle. 96px, **both sides**, 20 + knockdown.
  2. *Drum Slam* — 32f raise, then the winch comes down: r 72 area, 22 + knockdown, dust ring.
  3. *Grapnel* — 30f haul, then the chain runs 300px down the lane. 22 + knockdown with **negative knockback**: it
     yanks you back toward her.
  - **Every third attack the drum jams**: 80 frames with the winch locked and venting (`rig.jammed` lights it up).
    That window is **3x damage and she can be grabbed out of it**. It is the whole fight.
- **Phase 2, Skree on foot (160):** the harness blows its pins and drops off her back. No armour, grabbable, walk
  speed 2.2, dodges 40% of what you throw. Chop chains into a rising **rip** (launcher), a wing-pack **swoop** from
  mid range, and one **rally** that brings two Deck Crimpers up the lines.
- **Arena:** the winch bay at the far end of the gas-halls (`arena: 3120..3600`).

# 4. Final boss: Admiral Odaline Kestrel, the Ninth Wing

- **Concept:** the elegant villain again, but this one is a professional. Bicorne worn athwart, gold-frogged navy
  coat, a red flag-rank sash in a gold frame, storm cape, and a 66px **storm lance** with a coil head. Three phases,
  each stripping something off her — the bicorne and cape, then the sash and epaulettes, until the last phase is
  nothing but the red itself: a bare-headed woman in a red waistcoat with a torn red ribbon at her brow, a lance,
  and a burning bridge. The ladder ends in the person.
- **HP:** Phase 1 420, Phase 2 400, Phase 3 260 (one bar, three coloured segments).

**Phase 1, THE ADMIRAL (420).**
1. *Lance Thrust* — 22f level, 78px reach, 16.
2. *Sweeping Cut* — 26f, the lance goes round her: 74px, **both sides**, 20 + knockdown.
3. *BROADSIDE* — 34f with the lance overhead, then **four shells walk down the deck** from the guns below (r 44, 18 +
   knockdown each, and they hit her own boarders too). Move along the lane, not across it.
4. *Boarders* — at 66% and 33% she signals over the rail and two Deck Crimpers come up the lines.

**Phase 2, STORM-WING (400).** The wing-harness opens: four violet-lit vanes and super armour, no launch. The floor
band shrinks 16px as the deck edge starts venting.
1. *Chain Lightning* — a 40f charge, then a **150px lane bolt** for 20 and **34 frames of stunned**.
2. *Gale Step* — after **60 damage in one combo** she vanishes in a violet puff, reappears behind whoever did it and
   goes straight into the sweeping cut. Dodge on the reappear.
3. *Coil Vent* — **every 150 HP** the coil blows open for 110 frames: she stops attacking entirely and takes **2x
   damage**. This is the phase's whole punish economy.

**Phase 3, THE LAST CROW (260).** Harness gone, hat off, no armour, **grabbable**, walk speed 2.4.
1. *Lance String* — a fast 10-damage jab that chains into a rising cut (launcher).
2. *Last Keg* — one lobbed powder keg at where you were half a second ago.
3. Dodges 40% of incoming attacks; the fight ends as a duel.

- **Arena:** the bridge dais (`arena: 4760..5200`, camera `4560..5200`) with the `daisVents` zone, so the band shrinks
  and the edges hurt as the phases go on. **Defeat spectacle:** the shared `VictorySpectacle` — she drops the lance,
  the harness dies, and STAGE CLEAR.

# 5. The board (end to end)

**Stage name:** *The Storm Above Calderwick.* World x runs 0–5200. **Four sections**: two scrolling decks, one locked
screen while the flagship comes about, and the run along her bridge deck. Camera, wave locks and the GO arrow work
exactly as in Stage 1; the locked section works as Stage 1's funicular does (`mode: 'locked'`, `timedWaves`, a `dock`
exit). Every section has its own hazard identity, its own prop set out of the board's family (`PROP_FAMILIES.stage2`:
powder keg, ballast bag, signal locker, powder tub — plus the neutral crate, bucket and urn) and one thing the section
before it did not do.

**Intro card:**
> THE HEART-ENGINE IS COLD AND THE SKY IS OPEN.
> THE NINTH AERONAUT WING NEVER STOOD DOWN.
> **THE STUBBORN KETTLE IS GOING UP THERE TO ASK WHY.**

## Section 1, The Mooring Spine (x 0–1900; dawn, storm, open air)
- **Setting:** the topmost mooring gantry of Calderwick, above a sea of cloud, with the blockade hanging in the weather.
- **Parallax:** *Far* (0.2x): storm gradient indigo → bruised violet → dawn amber, an anvil cloud wall, three banks of
  lit cloud tops, three fleet hulls drifting, and **lightning that lights the whole sky** every ~7s. *Mid* (0.5x):
  lattice masts every 300px with gantry arms, mooring rings, sagging cables and hanging lanterns. *Near* (1.2x): rope
  rails on stanchions, coiled rope; wind-driven rain over everything.
- **Floor:** wet iron grating under raised walkway plates, hazard chevrons along the back edge, standing water.
- **Props:** crates (2x Brass Cog), **powder kegs** (they go off 30f after they break: 20, r 40 — bat one into a
  boarding party; Coal Scrip), **ballast bags** (Meat Pie), a **signal locker** (Golden Sprocket).
- **Hazards:** **lightning conductors** at x 700 (z 96) and x 1620 (z 40, half a cycle behind): a 40f violet ring,
  then 12 + knockdown + 10f stunned; the loading hook still swinging at x 1180 (z 70).
- **Zones:** `rails` over the whole section — there is no bulwark up here, **any enemy thrown over the edge is gone**
  (+200), the cheapest damage on the board and by far the most satisfying — and a **`gust`** over the whole section:
  every 7s (420f) a 45f gale, then 40f in which everyone on their feet drifts 1.3 px/f toward one rail or the other
  (the direction alternates each cycle, ~52px a gust). The gust never rings anyone out by itself; with the rails live
  it decides who is standing where when the next swing lands.
- **Waves (20):** (1) 3x Deckhand — fodder only, learn the rail. (2) 2x Deckhand + 2x Crimper + 1x Corsair.
  (3) "meet the holdout": 1x Bosun + 2x Crimper + **1x Tin Footman (holdout)** off the gantry; **reinforcements** —
  2x Deckhand come up the lines once the wave is down. (4) 1x Bosun + 2x Corsair + 2x Crimper + 1x Tin Footman
  (holdout).
- **Transition:** the freighter warps in against the spine and the cargo gate comes down; the players board.

## Section 2, The Gas-Halls (x 1900–3600; interior)
- **Setting:** inside the envelope of the captured freighter — the only interior of the board, and the only place in
  the game lit softly from above.
- **Parallax:** *Far* (0.2x): the envelope skin, ribbed in hoops, with two rows of pale-green **gas cells** breathing
  behind their netting (a slow glow on a 190-frame cycle), stringers and patched canvas. *Mid* (0.5x): the keel truss,
  hanging chains and hooks, ballast bags on lanyards, cargo stacked along the back, gantry lamps. *Near* (1.2x):
  structural frames passing in front of the fight; canvas dust turning in the cell light.
- **Floor:** plank catwalk over mesh, caulked bay seams with brass screw heads, a dark drop along the back edge.
- **Props:** ballast bags (Meat Pie) x2, kegs x2, crates x2, a signal locker holding the Wing's **Aether Vial**
  (meter before the winch bay), a hanging bucket (Roast Bird), and a **powder tub** at x 2900 under the Bosuns' wave
  for their kegs to cook (it rolls 50 and goes off 30f after it breaks: 18, r 44).
- **Hazards:** two of the cells have split. **Gas cells** at x 2300 (z 70, the cloud drifts right at 2 px/f) and
  x 3060 (z 40, drifts left, 210f behind): the cell swells and hisses for 40f, then a green cloud rolls 300px along
  its lane for 150f — 4 and **30f of stunned** to whoever it rolls over, once each. **Any fire inside the cloud
  ignites it** — a Bosun's keg, a keg or tub going off, a burning body: 14 + knockdown + burn on everyone within
  1.6r, and the cell is empty until its next cycle. The loading hook swings at x 2680 (z 66). No gas valves any more:
  the section's tell is the hiss, not the rattle.
- **Waves (20):** (1) 2x Galewright behind 2x Deckhand. (2) 1x Marine **through the netting from above** + 2x Crimper
  + 1x Corsair + **2x Copper Sapper (holdout)** lobbing bombs into the gas. (3) "meet the line": **1x Grapnel Mate** +
  2x Crimper + **1x Brass Halberdier (holdout)**. (4) the winch bay's guard: 2x Bosun + 1x Corsair + 1x Grapnel Mate +
  **2x Tin Footman** — the first machines the Wing has re-wound.
- **Mid-boss** (x 3400, arena 3120–3600): Quartermaster Skree & the Grapnel Winch.
- **Transition:** past the winch bay the hull is open to the weather — a boarding ramp across to the flagship.

## Section 3, The Cold Sovereign (x 3600–4240; the gun deck, one locked screen)
- **Setting:** the flagship's gun deck, amidships, the moment she comes about with the party aboard. The camera locks
  to the one screen and **the ship moves**: the `storm3` far layer auto-scrolls (`drift: 0.6` px/f, frame-based) so
  the storm wall and the rest of the blockade slide past the rail while the deck, bulwark and near rail stay put; the
  bridge tower is left off this section's mid layer — the bridge is the next one.
- **Parallax:** *Far* (0.2x): a black storm wall, a cold seam of light on the horizon, the rest of the blockade heeled
  over with violet running lights, and **forked lightning** redrawn from a seed on every strike. *Mid* (0.5x): the
  bulwark with gun ports and run-out cannon, hinged lids, powder tubs and shot, shrouds climbing out of the rail.
  *Near* (1.2x): the leeward rail and rigging falls; rain, spray and the flash.
- **Floor:** holystoned planking, treenails, caulked butt seams with brass inlay, ring bolts, wet patches.
- **Props:** a **powder tub at each gun port** (x 3760 z 26 aft, x 4080 z 116 forward), a ballast bag (Meat Pie), the
  signal locker (Aether Vial) and a bucket (Roast Bird) amidships — food and meter for the densest screen on the board.
- **Hazards:** two **run-out cannon**. The aft gun at the left edge (x 3604, z 22) fires right up the **back lane**
  (z 4–40); the forward gun at the right edge (x 4236, z 118) fires left down the **front lane** (z 100–136), 180f
  behind it. Every 360f: 45f of the carriage running the barrel out while its lane lights on the deck, then the shot
  crosses the whole screen in 10f — 12 + knockdown, the body thrown downrange. The middle of the deck is never in a
  lane; the gust is what puts you in one.
- **Zones:** `rails` both sides — an **enemy** thrown over the edge rings out (+200), and a player cannot go over at
  all: `hazards.js` rings out enemies only and clamps everyone else back onto the planking. The Grapnel Mate at 22s is
  here to drag you back down a deck you cannot leave, not to put you over the side. And the **bank**: a `gust` every
  7s (420f), 45f of gale then 40f at **1.3 px/f** — 52px toward one rail or the other, alternating.
- **Timed waves (19)** — each fires at its time or the moment the one before it is cleared, whichever is first:
  - **0s:** the gun crew — 2x Copper Sapper + 2x Tin Footman + 1x Deckhand.
  - **22s:** 2x Brass Halberdier + 1x Grapnel Mate + 1x Corsair.
  - **50s, banner THE BRIG OPENS:** **1x Ironwing Marine** walking **2x Tin Footman (holdout)** the Wing kept bolted
    below up onto his deck + 2x Crimper.
  - **80s:** the second gun crew closing up under the coil — 1x Galewright + 2x Copper Sapper + 1x Tin Footman +
    1x Crimper.
- **Transition:** `dock` — banner **THE SHIP COMES ABOUT**, and the party arrives at the foot of a ship's companion
  ladder on the bridge deck with 2 Meat Pies.

## Section 4, The Bridge (x 4240–5200; the flagship's upper deck)
- **Setting:** from the companion ladder to the bridge tower, still inside the storm; the `storm3` backdrop again, with
  the tower standing at the end of the section so the boss arena is visible long before you reach it.
- **Props:** a keg, an urn holding the board's **Brass Heart** (1-UP) at x 4460, a bucket (Roast Bird), the signal
  locker (Golden Sprocket) and a ballast bag (Meat Pie) at the foot of the dais.
- **Hazards:** two masts, no hook — **lightning conductors** at x 4420 (z 100, the front lane) and x 4640 (z 36, the
  back lane, 105f behind): the storm earths itself on both lanes of the bridge deck, never on both at once.
- **Zone:** `daisVents` over the bridge dais (4760–5200): the band shrinks per boss phase and the edges vent.
- **Waves (15):** ten of the fifteen bodies up here are machines, and no pressed crew gets this far — not one
  Deckhand, not one Crimper. (1) the head of the companion ladder: 1x Marine + **1x Chrome Duelist** (the Admiral's
  second) + 2x Tin Footman + 1x Brass Halberdier. (2) **1x Galewright + 1x Marine** (the Wing's elite pair, together
  for the only time on the board) + 2x Copper Sapper + **1x Iron Warden** off the tower door. (3) the last line:
  2x Chrome Duelist + 1x Iron Warden + 1x Grapnel Mate + 1x Bosun. The Duelist and the Warden are the last two new
  faces on the board, and both of them are hers.
- **Final boss** (x 5100, arena 4760–5200, camera 4560–5200): Admiral Odaline Kestrel.

# 6. Audio

New SFX (`src/engine/audio/sfx.js`, all in `CANONICAL_SFX` so the self-test covers them). Faction convention:
Stormcrow **voices** come through the beak filtered and nasal (bandpassed square and triangle); their **machinery** is
static — crackle and a bright discharge, never a brass clank.

- `crow_hurt` — square 420→300Hz with vibrato through a bandpassed crack.
- `crow_death` — triangle 380→130Hz with a falling noise band and a whoosh tail.
- `crow_call` — the two-note whistle the watch answers to.
- `harpoon` — a bandpassed crack, a low square thump and a rising line whoosh.
- `gale` — a slow bandpassed gust.
- `coil_charge` — a 180→900Hz AM saw with eight accelerating crackles: the Galewright / lance wind-up.
- `thunder_strike` — a hard highpassed crack into an echoed low boom.

New music tracks (`src/engine/audio/music.js`): the **Calderwick motif D–F–A–C carried up into the sky as a shanty**.
- `storm1` 136 BPM, Dm–C–B♭–A — driving square bass, saw lead on the motif, whistle counter on the combat channel.
- `storm2` 126 BPM in **3/4**, Am–Em–F–G — organ and music-box plucks; the quiet interior of the board.
- `storm3` 144 BPM, Em–C–Am–B7 — brass stabs and an open hat, the run to the bridge.
- `stormboss` 158 BPM, Gm–E♭–B♭–D — brass on every other beat under a saw lead, with a ticking rim on the second
  drum channel.
- The mid-boss track is `midboss2` (the half-time cut of the Grubbik theme) — this board's own; boards 3 and 4 have
  `midboss3` / `midboss4`, so `stage.music.midboss` is unique per board.

# 7. Picking the board

START on the title screen opens **BOARD SELECT** (`src/game/screens/boardselect.js`), one brass plaque per
registered board. Stage 2 starts **locked**: its plaque shows a padlock plate, `? ? ? ? ?` and CLEAR STAGE 1 TO
OPEN, and confirming it buzzes rather than starting a run. Clearing Stage 1 opens it for good — the results screen
announces it, and dismissing the plaque returns to BOARD SELECT to play the unlock on Stage 2's own plaque (the
padlock rattles apart, the hatch retracts as two doors, `? ? ? ? ?` resolves into THE STORM ABOVE CALDERWICK and a
STAGE 2 OPEN stamp lands). The plaque then carries the board's name, its four sections, STORMCROWS & BRASSBOUND and your
best rank. Unlocks persist in `localStorage` via `src/game/progress.js`.

`?stage=2` still jumps straight to the board and opens it for that page load, so a direct link works on a fresh
save, and it works with the usual debug params (`?skipTo=gameplay&stage=2&bot=1&godmode=1`); `?unlockall=1` opens
every board for one page load. The stage registry is `src/content/stage/index.js`; it already carries four boards,
and adding another is a stage file (with a `preview` block for its plaque), a backdrop module and one line in
`STAGES` — it then appears on BOARD SELECT, locked behind the board in front of it, with no other changes.

`npm test` runs the Stage 2 bot playthrough as the `playthrough2` scenario, with the same assertions as Stage 1
(both bosses seen, results screen reached, zero runtime errors) and screenshots under `tools/screens/5x-stage2-*`.
