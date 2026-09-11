> **Relationship to the other docs:** this file is to Stage 3 what `docs/GDD.md` is to Stage 1 and `docs/STAGE2.md`
> is to Stage 2 — the design authority for *this board's* fiction, faction, bosses, layout and audio. It changes no
> technical contract: everything here is built on `docs/ARCHITECTURE.md` (which still wins on technical matters) and
> `docs/RECONCILIATION.md` (controls, physics, floor band, hit-stop). The four heroes, the combat system, the HUD, the
> pickups, the scoring and the ranks are exactly as Stage 1 defines them.

# 1. Where this board sits

Stage 1 ends with Chancellor Vane down and the sky unsealed. Stage 2 ends the next morning with the Ninth Wing's
flagship coming apart in the weather. Both of them were supplied by the same company, and **Stage 3 is the invoice**.

**Setting: the Chandlery's own works, on the lime road south of Calderwick**, three days later. A ship's chandler
supplies an army; a tallow chandler makes its light. The Chandlery of Calderwick has been doing both under charter
since the first week of the war, to whoever held the ledger — the Brassbound were still wound because of them and the
Sootborn were still standing because of them, and neither the Chancellor nor the Admiral was ever the reason this
kept going. The company was.

Vane's estate has not settled its account. So the company is **re-crewing the war**: Resurrection Men tipping
Brassbound back onto their feet out of handcarts, Limeburners crusting them, Tallymen writing every one of them into
a ledger to be presented to whoever signs next. The Brassguard take the *Stubborn Kettle* down the lime road to close
the account, and this time there is no fortress and no flagship — just a yard, a kiln, and a man with a book.

**Tone:** Stage 1 was warm and sooty at night; Stage 2 was cold, high and wet. **Stage 3 is dry, pale and in broad
daylight** — the first board fought under a flat white morning. No furnace glow, no storm: chalk dust, quicklime,
bone-white sky, long low shadows and kiln smoke standing straight up. It is the plainest-looking board in the game
and it is the one about money.

**Visual language deltas from the GDD:**
- Palette: chalk sky `#DCD8CC`, lime spoil `#CFC6AE`, tallow gold `#C29B4A`, quicklime `#E6ECDC`, harness leather
  `#7A561E`, kiln iron `#394249`, greened pewter `#5E8072`.
- **The ground is COOL and the faction is warm**, everywhere on the board: the road `#616A5E`, the yard setts
  `#626B60`, the counting-house boards `#5A6151`. This is measured, not decorative — `tools/stage-values.js` put the
  Chandlery's hue within 6 degrees of a warm grey road (39% of its colour mass landing on ground the backdrop
  already claims); walking the three grounds to a lime-grey takes that gap to 25-37 degrees and drops the Ledger
  House's overlap from 46% to 34%. Wet lime on stone is a green-grey anyway.
- **The board's energy colour is rite lime `#D8FF6E`** — lamps, floor cones, the tether from a Chandler to whoever
  is about to get back up. On this board a lime light on the ground always means *something behind you is being
  repaired*, and it is always the thing to hit.
- Aether cyan `#4DF0E0` does not appear on this board at all. The Concordat is over; the machinery out here is a
  century of second-hand iron and a kiln that has never gone out.
- The faction's universal tell is unchanged: **the lamp goes from idle green to rite lime and a cone lands on the
  floor** where the rite is going. Brassbound (red lens) and Sootborn (white eye-flash) keep theirs — this board is
  where you see all three at once.

# 2. The faction: the Chandlery of Calderwick

The roster lives in `src/content/enemies/chandler.js` — seven variants built unaffiliated, to be dropped onto a
board. This is that board, and its whole design is the faction's one idea: **nothing here kills you; everything
here keeps the thing that kills you standing up.**

| Variant | Role | Rite |
|---|---|---|
| **Wickboy** | fodder | RELIGHT — heals 4 every 20f **and** cancels a stagger, so he steals your punish |
| **Tallyman** | ranged | TALLY — marks a hero and the whole board re-points at them every 60f |
| **Limeburner** | bruiser | SLAKE — hands an ally an Iron Warden's 4-hit LIMECRUST |
| **Purser** | elite | DRAM — doses two allies: +35% damage, +25% speed, −40% cooldown |
| **Resurrection Man** | grabber | RECREW — tips whatever army is already on this board out of his cart |
| **Runner** | rusher (35 HP) | LIGHT IT — he is not here for you: he sprints to a Chandler mid-rite and lights the lamp, and the rite finishes at 2.5x. Between rites a taper jab, nothing more |
| **Drayman** | grabber (140 HP) | SHOVE — a handcart heaves in behind him and rolls 180px down the lane (14 knockdown to whoever it meets; the cart stays, breakable and re-shovable). At most two of his carts live at once; with both out he closes in with the grab set and a hook slam instead |

**The people the company works on wear its mark too.** Two spawn modifiers (`src/game/traits.js` SPAWN_MODS) are
how the board says whose side a body is on without a word of text:
- **`scrip`** on the Sootborn of the lime road — a scrip badge on the torso and *no flee, no panic*: a Cutthroat,
  Slinger or Wrangler who took the company's coal scrip stands and dies for it. Ten of them on the board, all in the
  first three sections; the Ledger House has no Sootborn left to pay.
- **`crusted`** on Brassbound the Limeburners have already worked on — one hit of frame armour at spawn, the
  Limeburner's quicklime shell pre-applied (never on a shielded Iron Warden). Six crusted Tin Footmen walk in on
  their own feet across sections 2–4, and three more machines tip **out of the handcarts** standing in the works: a
  Tin Footman, a crusted Tin Footman and a crusted Brass Halberdier (`handcart` props with a `release`).

**Faction rules (all three are the board's counterplay):** *one touch breaks a rite* — a single hit during the
wind-up cancels it and locks the lamp out for 90 frames; *the rite dies with the ritualist, however it died* — kill
(or ring out) the Chandler and every crust, dose, mend and tally he is holding pops in the same frame; *the company
does not insure its own* — every rite filters `faction !== 'chandler'`, so a room of nothing but Chandlers is a room
of people with no one to work on.

**The rule that shapes the board:** *the closer to the ledger, the more machines and the fewer people.* The
ritualists stay the same; the recipients escalate. Section 1 is Chandlers working on **Sootborn** who took the
company's coal scrip — nineteen people and not one machine. Section 2 is the cart lane, where the **first Brassbound
on the board** walk in, tip out of the carts and get crusted in front of you. Section 3 is the yard, Chandlers
working on the Brassbound they have just put back on their feet. Section 4 is the Ledger House, where the
**re-wound machines outnumber the people** for the first time — Vane's soldiery, right up to an Iron Warden and a
Chrome Duelist, re-wound, crusted and invoiced. The last wave of the board is the war being restarted in front of
you, which is the argument the whole game has been making.

# 3. Mid-boss: Yardmaster Marl & the Lime Kiln

- **Concept:** the works' yardmaster — a Limeburner at 1.5x with the yard's own **wheeled draw-kiln** strapped across
  her back: a charge drum behind the shoulder, a chimney standing off it past the ear, the draw-door at the hip and
  the barrow wheel still bolted to the frame. Phase 1 is a machine wearing a woman — the kiln is 40% of the
  silhouette and her face is a canvas hood under a leather brow plate; phase 2 cuts every bit of it away.
- **HP:** the Lime Kiln 320 (armoured, unlaunchable), then Marl on the yard 170.
- **Phase 1 attacks:**
  1. *Shovel Slam* — 26f up over the shoulder, then down on the floor line: 66px, 20 + knockdown, lime ring.
  2. *Quicklime Scoop* — 22f low crouch, then a **low** 58px scoop: 16 + knockdown. Jump it; it is also how you get
     over the shovel.
  3. *SLAKE THE YARD* — 34f with the kiln cracked open (two hits of frame armour, the faction's one exception),
     then a 60px area shove that hands **up to four of the re-crewed army standing with her** a 4-hit limecrust.
     The company does not insure its own, so it never lands on a Chandler — and when there is nobody in the room to
     work on she takes it **herself**, which is what makes fighting her alone a different fight. One touch that
     beats the frame armour kills the rite.
  - **Every third attack the kiln over-draws:** 80 frames of it standing open and venting (`rig.venting` lights the
    charge white-hot). She stops attacking entirely, takes **3x damage** and **can be grabbed** out of it. That is
    the whole fight, and it is the same lesson as the Hoister's drum and Skree's winch.
- **Phase 2, Yardmaster Marl (170):** the kiln straps blow and the whole thing goes off her back (it stays on the
  yard as scenery). No armour, grabbable, walk speed 2.1. A fast two-hit shovel string that chains into a **rising
  shovel** (launcher), the low scoop again, and one last SLAKE — **on herself**, because there is nobody left to
  insure.
- **Arena:** the kiln head at the far end of the works (`arena: 3120..3600`).

# 4. Final boss: Factor Oriel Hasp, the Chandlery of Calderwick

- **Concept:** not a warlord and not an officer — **an agent with a signature**. Tall, immaculate, peaked company cap,
  a floor-length coat, a cane, a dram flask and the ledger under one arm. He has never personally been in a fight and
  has been paid for every one of them. The three phases take the company off him one layer at a time, and the joke of
  the fight is that his power is *the room*, not the man: he does not get stronger, he makes everything else stronger,
  and by the last phase there is nothing left to work on.
- **HP:** Phase 1 400, Phase 2 360, Phase 3 240 (one bar, three coloured segments).

**Phase 1, THE FACTOR (400).** Cap, coat, ledger, cane. No armour — but he does not fight alone and he knows it.
1. *Cane String* — a 12-damage fencer's rap that chains into a **backhand flick that hits behind him** (the Purser's,
   faster): walking through him does not solve him.
2. *TALLY* — 34f with the chalk out, then a numeral lands on one hero and **every enemy on the field re-points at
   them** for 300 frames. In co-op this is the boss telling your partner to run.
3. *The company answers* — at 66% and 33% he rings the hand-bell and **a Wickboy and a Limeburner come in from the
   doors**. They are not escorts; they are what he is for.

**Phase 2, THE COMPANY MAN (360).** The cap is off, the coat is open over rolled sleeves and the yard's **kiln-lamp
harness** is lit on his chest: the man doing the work himself for the first time in his life. The floor band shrinks
16px as the counting floor's lime lanes open.
1. *DRAM* — he doses **himself**: +35% damage, +25% speed, −40% cooldown for 240 frames. The 32f pour is the single
   most valuable interrupt on the board — one touch and it is gone for 90 frames.
2. *Lime Cone* — 30f with the lamp wide open, then a 72px cone of quicklime off the harness: 18 + knockdown. It is
   his only reach, and the 32f recovery on the end of it is the only free punish the phase gives away.
3. *Ledger Slam* — the book, two-handed, straight down: 22 + knockdown inside 54px.
4. *Kiln Vent* — **every 150 HP** the harness blows its relief and he stalls for 110 frames taking **2x damage**.
   Same economy as the Admiral's coil; the tell is the lime light going white on the floor.

**Phase 3, THE LEDGER (240).** No cap, no coat, no harness, no rites left, **grabbable**, walk speed 2.4. Just a man
with a book, in a room he owns.
1. *Seal Flurry* — three fast cane raps into a ledger-spine slam (knockdown).
2. *Wax Seals* — lobbed lead-and-wax seals, **reflectable**: 26 straight back at him if you send one home.
3. He dodges 40% of what you throw and there is nothing else left; the fight ends as a duel, which is the one thing
   he has never had to have.
- **Faction rule at the end:** when he goes down **every rite on the field pops in the same frame** — every crust,
  dose, mend and tally, on everything still standing, because the rite dies with the ritualist and he is holding the
  whole ledger. The room stops being an army and goes back to being furniture.
- **Arena:** the counting floor (`arena: 4880..5300`, camera `4660..5300`) with the `daisVents` zone, so the band
  shrinks and the edges vent as the phases go on. **Defeat spectacle:** the shared `VictorySpectacle`.

# 5. The board (end to end)

**Stage name:** *The Reckoning of Calderwick.* World x runs 0–5300. Four sections; camera, wave locks and the GO
arrow work exactly as in Stages 1 and 2, and the second section is the board's one **locked screen** with timed
waves (the Brass Funicular's format). `tools/stage-census.js` measures it at 72 enemies in 15 waves, 16 distinct
variants (a modifier counts), the top variant (Wickboy) at 19%, 14 mixed-faction waves, one reinforcement wave, and
a hazard layout no other section in the game shares.

**Intro card:**
> THE CHANCELLOR IS DOWN. THE ADMIRAL IS DOWN.
> SOMEBODY SUPPLIED THEM BOTH, AND IS ALREADY QUOTING FOR THE NEXT ONE.
> **THE BRASSGUARD ARE GOING DOWN THE LIME ROAD TO CLOSE THE ACCOUNT.**

## Section 1, The Lime Road (x 0–1800; flat morning light, open ground)
- **Setting:** the cart road up to the works, white with spilled lime, wagon trains standing in it and the works'
  four chimneys drawing smoke straight up ahead of you.
- **Parallax:** *Far* (0.2x): a chalk sky with no sun in it, the low line of the works and its chimneys, the city on
  its mountain far behind. *Mid* (0.5x): lime spoil banks, milestones, standing wagons under tarpaulins, roadside
  lamps on poles. *Near* (1.2x): cart shafts and hanging tarpaulin at the screen edges, lime dust blowing along the
  ground.
- **Floor:** rutted lime road over old rail, sleeper lines, spilled quicklime, cart tracks.
- **Props:** crates (Brass Cogs), kegs (Coal Scrip), a cart (Meat Pie), a **lime sack** at x 1140 (a Meat Pie under
  the quicklime, which goes up in a white puff), a **tally board** at x 1300 (the company's Coal Scrip).
- **Hazards:** two **lime pits** (x 620 on the front lane, x 1540 on the back lane) — the roadside quicklime blows
  off every 180f: 5 damage and **BLINDED** for 30f (no attacking), no launch — and the **runaway lime wagon**: parked
  at x 1780, it rocks on its chocks for 45f and then rolls the *whole road* leftward along the middle rut (z 70) to
  x 20 at 4px/f, once every 600f. 14 knockdown to whoever is standing in the rut; you hear the brake lever from off
  screen before you see it.
- **Waves (19):** (1) 3x Wickboy — *the first rite you will ever see: the one you are hitting keeps getting back
  up*, and nothing else. (2) 2x Wickboy + 1x **Runner** + 2x Soot Cutthroat (scrip) — the Runner is not here for
  you, he is here to light the Wickboys' rites before you can break them. (3) 1x Tallyman + 1x Limeburner + 2x Soot
  Cutthroat (scrip) + 1x Runner. (4) 1x Limeburner + 1x Tallyman + 1x Wickboy + 2x Scrap Slinger (scrip) + 1x Gutter
  Wrangler (scrip).
- **Transition:** the works' cargo lift takes you down off the road (`kind: 'lift'`) — onto the cart lane.

## Section 2, The Cart Lane (x 1800–2440; one locked screen, timed waves — the set piece)
- **Setting:** the company's traverser lane between the lift and the yard gate. A **belt runs the front 40px of the
  lane** (z ≥ 100, x 1990–2440) and carries everything on it — carts, crates, the fight — **left at 1px/f toward the
  kiln head**, for the whole section (`conveyor` zone, `active: true`); a crate with Brass Cogs or a Meat Pie comes
  down off the belt head every 4s. The backdrop is the yard's (`works2`) with `drift: 0.3`: the far and mid parallax
  auto-scroll, so the lane reads as a thing that is moving through the yard rather than a still screen with a belt
  painted on it.
- **Hazards:** the **kiln head** at x 2000 (`kilnMouth`, z 12, reach 128) — its draw-cone runs the **full width of the
  floor band**, so the belt feeds *into* it: a 36f lime glow, then 14f of fire across x 1972–2028 (12 knockdown +
  burn) every 300f; the arrival spot (x 1870–1910) stays clear of it. A **tallow vat** at x 2300 on the back lane
  bubbles for 40f and boils over for 30f every 240f (6 knockdown + burn; a fire source while it boils).
- **Props:** a lime sack (Meat Pie), a keg, a bucket (Roast Bird), and **two handcarts**: a live **Tin Footman tips
  out** of each when it breaks. The second cart stands *on the belt* at x 2410 and rides it down to the kiln head,
  and its Footman was **crusted** before it was loaded.
- **Timed waves (16, plus the two out of the carts)** — each fires at its time, or as soon as the one before it is
  cleared: **0s** 1x **Drayman** (the first Chandler who is a threat on his own) + 2x Wickboy + 1x Soot Cutthroat
  (scrip). **20s** 2x Tin Footman (the first machines on the board, on their own feet) + 1x Limeburner (here to crust
  them) + 1x Runner. **45s**, banner THE CARTS COME DOWN: 1x Resurrection Man + 2x Tin Footman (crusted) + 1x Soot
  Cutthroat (scrip). **75s** 2x Copper Sapper + 1x Tallyman + 1x Wickboy.
- **Exit:** the belt stops at the yard gate — `kind: 'dock'`, banner **THE YARD GATE**, the counting-house's yard
  door shown open on the arrival landing (look `door`), one Meat Pie on it.

## Section 3, The Tallow Works (x 2440–3600; the company's yard, open air)
- **Setting:** the works themselves — tallow vats under gantries, the draw-kilns, cart lanes with the company's lime
  cones burnt into the ground, tally boards on every wall, and the kiln head at the far end.
- **Parallax:** *Far* (0.2x): the works' long roof line, four kiln chimneys drawing smoke, a hoarding with the
  company's mark on it. *Mid* (0.5x): tallow vats and their gantries, stacked handcarts, tally boards, pole lamps.
  *Near* (1.2x): kiln flues and hanging tarpaulin passing in front of the fight; lime dust.
- **Floor:** yard cobble with cart ruts, chalk lane lines and quicklime spill.
- **Props:** kegs, a **handcart** at x 2700 (a **crusted Brass Halberdier** tips out of it), a bucket (Roast Bird),
  the urn holding the board's **Brass Heart** (1-UP) at x 2960, a tally board, a lime sack (Meat Pie) in the
  kiln-head arena.
- **Hazards:** **tallow vats** at x 2600 (front lane) and x 3040 (back lane, on the opposite half of the cycle), the
  shed wall's **draw-kiln** at x 2760 (a 90px cone across the back lane every 300f), and the yard crane's **hook**
  swinging at x 2880 over the middle lane.
- **Waves (14, plus the one out of the cart):** (1) 1x Limeburner + 1x **Purser** + 1x Wickboy + 1x Copper Sapper —
  the company's dram, on a Limeburner who is about to crust a Sapper. (2) 1x Drayman + 1x Tallyman + 2x Tin Footman
  (crusted) + 1x Runner. (3) 1x Resurrection Man + 2x **Brass Halberdier** + 1x Wickboy + 1x Soot Cutthroat (scrip) —
  the first re-wound Brassbound with a reach, out of the Resurrection Man's cart. The Purser and the Resurrection Man
  are never in the same wave here: the elite pair is held for the last section.
- **Mid-boss** (x 3400): Yardmaster Marl & the Lime Kiln, at the kiln head (`arena: 3120..3600`).
- **Transition:** the counting-house doors come up and you go in (`kind: 'board'`).

## Section 4, The Ledger House (x 3600–5300; interior)
- **Setting:** the company's counting floor — brass ledger cages, a wall of pigeon-holes, the wax press, tally boards
  floor to ceiling, and one enormous kiln behind the desk that has never once gone out. **A cold room**: the walls,
  the desks and the boards are all green-grey, and the only two warm things in it are the lamps and the kiln, so a
  tallow-coated company standing in its own hall is the warmest thing on screen.
- **Parallax:** *Far* (0.2x): the pigeon-hole wall and the ledger cages, lamplit, with the kiln's lime glow at the
  end of the room. *Mid* (0.5x): counting desks, chained ledgers, the wax press, cart lanes running into the hall.
  *Near* (1.2x): pillars passing in front of the fight; paper dust turning in the lamp light.
- **Floor:** waxed board with brass inlay lines and lime tracked in from the yard.
- **Props:** cabinets (a Golden Sprocket; the second, at x 4760, an Aether Vial), two **ledger stacks** (Brass Cogs),
  a case (Golden Sprocket), a tally board, urns (Meat Pie — one of them out on the counting floor, for the fight).
- **Hazards:** two **ledger drops** (x 3980 on the front lane, x 4320 on the back lane, half a cycle apart) — the
  house drops its ledgers off the galleries: a shadow grows on the floor for 36f and then the book lands, 10
  knockdown — and one **lime pit** at x 4560 on the front lane, where the lime lamp on the floor is the tell.
- **Zone:** `daisVents` over the counting floor (4880–5300), in rite lime.
- **Waves (23):** (1) 1x Resurrection Man + 1x Wickboy + 2x Tin Footman (crusted) + 1x Runner. (2) 1x Purser + 1x
  Limeburner + 2x Brass Halberdier + 1x **Chrome Duelist** — the company has got as far as Vane's officers. (3) 1x
  Tallyman + 1x Copper Sapper + 1x **Iron Warden** + 1x Drayman. (4) 1x Resurrection Man + 1x Purser + 2x Tin Footman
  + 1x Iron Warden + 1x Chrome Duelist — *the war, restarted, in one wave*: the company's elite pair together for the
  only time on the board, and Vane's iron and chrome with them — and when two are left standing **the company sends
  more hands**: 2x Wickboy + 1x Runner come in from the doors.
- **Final boss** (x 5200): Factor Oriel Hasp.

# 6. Audio

No new SFX: the faction was built with its voice already in `CANONICAL_SFX` — the respirator-muffled wheeze is the
lowpassed `hydraulic`, the lamp glass is `prop_break`, and every rite lands on `chime`.

New music tracks (`src/engine/audio/music.js`): the **Calderwick motif D–F–A–C taken down to the ground and played
straight** — this board's music is the least ornamented in the game, because it is about book-keeping.
- `works1` 124 BPM, Dm–F–B♭–C — pluck lead over a walking triangle bass and a brushed hat: a work song.
- `works2` 132 BPM, Gm–B♭–E♭–F — organ pumping on the off-beat under a saw lead; the company at work.
- `works3` 138 BPM, Cm–A♭–E♭–G — a harpsichord ledger-tick on every beat with brass under it, and no let-up.
- `ledgerboss` 156 BPM, Dm–B♭–Gm–A — the motif at full weight: brass stabs, distorted bass, hats through the bar.
- `midboss3` 146 BPM, Gm–E♭–B♭–F — the yardmaster's own track: a **harpsichord ledger-tick on every beat** over
  a square bass and brass stabs on the two-and-four, the kiln lead on pluck (a pulse lead doubles it a fifth up while
  she is swinging), and a **kiln clang on the last sixteenth of every bar** — the crash where the draw-door slams.
  She is a yard boss, not a flag officer, and the book-keeping never stops under her.

# 7. Picking the board

Stage 3 starts **locked** behind Stage 2, exactly as Stage 2 is locked behind Stage 1 (`src/game/progress.js`): its
plaque shows the padlock plate, `? ? ? ? ?` and CLEAR STAGE 2 TO OPEN. Clearing Stage 2 opens it for good and the
results screen plays the same unlock flourish on its plaque. The plaque carries the board's name, its four sections,
THE CHANDLERY and your best rank; its vignette is the `works` motif — a low works roof under a chalk sky, four
chimneys drawing smoke, kiln mouths lit lime along the ground.

`?stage=3` jumps straight to the board and opens it for that page load, and works with the usual debug params
(`?skipTo=gameplay&stage=3&bot=1&godmode=1`); `?unlockall=1` opens every board for one page load.

`npm test` runs the Stage 3 bot playthrough as the `playthrough3` scenario, with the same assertions as Stages 1 and
2 (both bosses seen, results screen reached, zero runtime errors) and screenshots under `tools/screens/6x-stage3-*`.
