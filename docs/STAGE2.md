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
  Aether cyan `#4DF0E0` stays reserved for Concordat machinery, so on this board it reads as "old regime": the two
  Tin Footmen in the last wave and the summit glow far below.
- Every faction keeps its universal tell. Brassbound: lens goes red. Sootborn: eyes flash white. **Stormcrow: the
  glass on the head — goggles, loupe or sealed sighting lens — goes hot white and blinks in the last frames of the
  wind-up.** One unmistakable light per head, whatever the head is wearing.

# 2. The faction: The Stormcrows (base + 5 variants)

**Type identity:** people, not machines and not goblins. Aeronauts fight the way people fight on a windy deck — they
give ground, they hop back out of a swing that missed, they keep their feet. They are the *pressure* faction: nothing
here is unkillable, but nothing here stands still to be hit either.

**Base rig** (`src/content/enemies/stormcrowRig.js`): a tall wedge. High-collared storm coat flaring into two tails
(a secondary-motion chain, so they lag in the run), crossed canvas boarding straps, a folded **wing-pack** on the back
that flares open on any hop or lunge, oiled canvas sleeves over warm skin, and a piece of glass on every head.

**THE HIGHER THE RATE, THE MORE SEALED THE MASK.** The head is the rank ladder, and it runs bare face -> welded shut:

| Rate | Variant | Head |
|---|---|---|
| 1 | Deck Crimper | knotted bandana, **goggles shoved up** onto the knot — a whole face |
| 2 | Line Corsair | slouch hat, **goggles under the brim** — a face behind glass |
| 3 | Powder Bosun | bald and bearded, **one eye behind a brass loupe** — half a face |
| 4 | Galewright | **sealed keel visor**: pewter dome, storm cowl, long gun-metal beak, one big lens |
| 5 | Ironwing Marine | **sealed iron muzzle**: crest, short grilled beak, one small hot-white sighting lens |

The Powder Bosun is the hinge — one eye glassed, one eye human — so the step from face to mask happens exactly
between him and the Galewright. The two sealed heads keep the eye row, the eye spacing, the brass lens rim and the
copper filter can at the chin that the bare three have, so they read as the same species, welded shut.

**Rank colour.** Every Stormcrow's rank is one warm ramp heated a step per rate — ash rust, brick red, ember orange,
flame amber, signal gold (`WATCH` in `stormcrow.js`, mirrored into `palette.rank` so far limbs shade correctly) —
and the marks that carry it multiply as the rate climbs and move UP the body: 1 carrier on the Crimper (the arm
band), 2 on the Corsair (+ hatband), 3 on the Bosun (brow band, smock collar, waist sash — never on his bare arms),
4 on the Galewright (brow band, gorget, armbands, trouser lace), 6 on the Marine (helm-crest edge, cuirass band,
armbands, cuffs, lace, wing-plate boss). Rank colour is the ONLY high-chroma warm left on a rig — every scarf and
the Crimper's bandana are neutral — so nothing on the deck competes with the mark that says who is in charge.
The brass wing badge in the same chest position on all seven is what still says "Ninth Wing".

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
| Deck Crimper | 45 | 6 | 1.20x | 150 |
| Line Corsair | 40 | 9 | 1.15x | 200 |
| Powder Bosun | 85 | 14 | 0.85x | 300 |
| Galewright | 90 | 12 | 1.00x | 500 |
| Ironwing Marine | 190 | 16 | 0.70x | 1000 |

**C1. Deck Crimper** — *the fodder.* Base coat, one ash-rust armband and nothing else (a dirty canvas rag for a
bandana — the lowest rate wears no rank above the collar), a 46px ash boat hook. Jabs at 50px (18f tell), a low
**sweep** that hooks both feet out (knockdown), and a **lunge** from mid range with the wing-pack popping for the
step. Flanks on both lanes. *First:* Section 1, Wave 1.

**C2. Line Corsair** — *the reason you keep moving.* Teal coat, brick-red armband and hatband — the first rate
whose colour reaches the head — a stubby reel-gun. Holds 150px and
puts a **harpoon** down the lane (24f tell, sighting down the barrel). **Any player attack bats the harpoon back for
14** — exactly like the Scrap Slinger's bolt, and exactly as necessary, because a Corsair at the far end of the deck
is otherwise free damage. Butt-strokes anything that gets inside the gun. *First:* Section 1, Wave 2.

**C3. Powder Bosun** — *the crowd control.* Grey-violet coat, ember-orange brow band, smock collar and waist sash
(the widest rank field on the deck; nothing on his bare arms), scale 1.08, a four-link **chain shot**.
The chain goes round in a full circle: 58px, **hits behind as well as in front**, 14 and a knockdown. From range he
lobs a **powder keg** at where you stood 20 frames ago; it bounces once and goes off for 14 on *everyone*, his own
side included. He only flinches on every second hit. *First:* Section 1, Wave 3.

**C4. Galewright** — *the tell you have to respect.* Violet coat, sealed keel visor, amber rank, a copper-wound
**storm coil**. The coil charges for 36 frames — the bulb brightens, and **the sighting lens grows and ramps violet
-> hot white** with `rig.coil` before it blinks in the last 14 (the lens carries the charge now; there is no
standing-on-end hair under a sealed helm) — and then throws an arc **130px down the lane**:
12 damage and **30 frames of stunned**. It is slow and loud on purpose — the answer is to be somewhere else, which is
what the **repel** (a short pressure wave, no real damage, big knockback) is for: it puts you back in the lane.
Ignores attack tokens, circles, dodges. *First:* Section 2, Wave 1.

**C5. Ironwing Marine** — *the wall.* Deep navy, scale 1.28, boarding axe, and a three-vane **wing-plate** strapped to
the off hand. The top of both ladders: sealed iron muzzle with a small hot-white sighting lens, and signal gold on
six carriers, more rank than the other four together. He is a big head with a small eye where the Galewright is a
small head with a big eye — that inversion, her long keel beak against his short grilled muzzle, and his crest
against her swept cowl are what keep two pewter helms from reading as the same man. Super armour and no launch
while the plate is up; **every 4th hit staggers him for 30 frames**, and a
launcher during that stagger **strips the plate for good** (it blows apart in a shower of pewter). After that he
flinches and launches like anybody else. Grabbable only by Pip. Shove (armoured, advancing) chains into a chop that
puts you on the deck. *First:* Section 2, Wave 2 — he comes through the gas-cell netting from above.

# 3. Mid-boss: Quartermaster Skree & the Grapnel Winch

- **Concept:** the Wing's quartermaster, strapped into the freighter's own cargo winch — a drum of chain on a harness
  with a grapnel on the end. She is a Stormcrow at 1.45x, so the fight reads as "one of them, but the machinery is
  hers".
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

**Stage name:** *The Storm Above Calderwick.* World x runs 0–5200. Three sections; camera, wave locks and the GO arrow
work exactly as in Stage 1.

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
- **Props:** crates, **powder kegs** (they go off 30f after they break: 20, r 40 — bat one into a boarding party),
  **ballast bags** (Meat Pie), a **signal locker** (Golden Sprocket).
- **Hazards:** **lightning conductors** at x 700 and 1620 (40f violet ring tell, then 14 + knockdown + 24f stunned);
  the loading hook still swinging at x 1180.
- **Zone:** `rails` over the whole section. There is no bulwark up here — **anything thrown over the edge is gone**
  (+200), which is the cheapest damage on the board and by far the most satisfying.
- **Waves:** (1) 3x Crimper. (2) 3x Crimper + 2x Corsair. (3) 1x Bosun + 2x Crimper. (4) 1x Bosun + 2x Corsair + 3x Crimper.
- **Transition:** the freighter warps in against the spine and the cargo gate comes down; the players board.

## Section 2, The Gas-Halls (x 1900–3600; interior)
- **Setting:** inside the envelope of the captured freighter — the only interior of the board, and the only place in
  the game lit softly from above.
- **Parallax:** *Far* (0.2x): the envelope skin, ribbed in hoops, with two rows of pale-green **gas cells** breathing
  behind their netting (a slow glow on a 190-frame cycle), stringers and patched canvas. *Mid* (0.5x): the keel truss,
  hanging chains and hooks, ballast bags on lanyards, cargo stacked along the back, gantry lamps. *Near* (1.2x):
  structural frames passing in front of the fight; canvas dust turning in the cell light.
- **Floor:** plank catwalk over mesh, caulked bay seams with brass screw heads, a dark drop along the back edge.
- **Props:** ballast bags, kegs, crates, a signal locker, a hanging bucket (Roast Bird).
- **Hazards:** gas valves venting at x 2280 and 3060; a loading hook at x 2680.
- **Waves:** (1) 2x Galewright + 3x Crimper. (2) 1x Marine **through the netting from above** + 2x Crimper + 1x Corsair.
  (3) 2x Bosun + 2x Corsair + 2x Crimper.
- **Mid-boss** (x 3400): Quartermaster Skree & the Grapnel Winch.
- **Transition:** past the winch bay the hull is open to the weather — a boarding ramp across to the flagship.

## Section 3, The Cold Sovereign (x 3600–5200; the flagship's weather deck)
- **Setting:** from the gun batteries aft to the bridge tower, inside the storm the whole way.
- **Parallax:** *Far* (0.2x): a black storm wall, a cold seam of light on the horizon, the rest of the blockade heeled
  over with violet running lights, and **forked lightning** redrawn from a seed on every strike. *Mid* (0.5x): the
  bulwark with gun ports and run-out cannon, hinged lids, powder tubs and shot, shrouds climbing out of the rail, and
  **the bridge tower standing at the end of the section** so the boss arena is visible long before you reach it.
  *Near* (1.2x): the leeward rail and rigging falls; rain, spray and the flash.
- **Floor:** holystoned planking, treenails, caulked butt seams with brass inlay, ring bolts, wet patches.
- **Props:** kegs, crates, a signal locker, ballast bags, and an urn holding the board's **Brass Heart** (1-UP) at x 4460.
- **Hazards:** three **lightning conductors** (x 3880, 4260, 4560) — the storm earths itself all along the deck.
- **Zone:** `daisVents` over the bridge dais (4760–5200): the band shrinks per boss phase and the edges vent.
- **Waves:** (1) 1x Marine + 2x Corsair + 2x Crimper. (2) 2x Galewright + 1x Bosun + 3x Crimper. (3) 2x Marine +
  1x Galewright + **2x Tin Footman** (Concordat holdouts the Wing never bothered to unbolt) + 2x Crimper.
- **Final boss** (x 5100): Admiral Odaline Kestrel.

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
- The mid-boss reuses `midboss2` (the half-time cut of the Grubbik theme).

# 7. Picking the board

START on the title screen opens **BOARD SELECT** (`src/game/screens/boardselect.js`), one brass plaque per
registered board. Stage 2 starts **locked**: its plaque shows a padlock plate, `? ? ? ? ?` and CLEAR STAGE 1 TO
OPEN, and confirming it buzzes rather than starting a run. Clearing Stage 1 opens it for good — the results screen
announces it, and dismissing the plaque returns to BOARD SELECT to play the unlock on Stage 2's own plaque (the
padlock rattles apart, the hatch retracts as two doors, `? ? ? ? ?` resolves into THE STORM ABOVE CALDERWICK and a
STAGE 2 OPEN stamp lands). The plaque then carries the board's name, its three sections, THE STORMCROWS and your
best rank. Unlocks persist in `localStorage` via `src/game/progress.js`.

`?stage=2` still jumps straight to the board and opens it for that page load, so a direct link works on a fresh
save, and it works with the usual debug params (`?skipTo=gameplay&stage=2&bot=1&godmode=1`); `?unlockall=1` opens
every board for one page load. The stage registry is `src/content/stage/index.js`; adding a third board is a stage
file (with a `preview` block for its plaque), a backdrop module and one line in `STAGES` — it then appears on BOARD
SELECT, locked behind Stage 2, with no other changes.

`npm test` runs the Stage 2 bot playthrough as the `playthrough2` scenario, with the same assertions as Stage 1
(both bosses seen, results screen reached, zero runtime errors) and screenshots under `tools/screens/5x-stage2-*`.
