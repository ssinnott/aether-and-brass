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

The roster already exists in `src/content/enemies/chandler.js` — five variants built unaffiliated, to be dropped onto
a board. This is that board, and its whole design is the faction's one idea: **nothing here kills you; everything
here keeps the thing that kills you standing up.**

| Variant | Role | Rite |
|---|---|---|
| **Wickboy** | fodder | RELIGHT — heals 4 every 20f **and** cancels a stagger, so he steals your punish |
| **Tallyman** | ranged | TALLY — marks a hero and the whole board re-points at them every 60f |
| **Limeburner** | bruiser | SLAKE — hands an ally an Iron Warden's 4-hit LIMECRUST |
| **Purser** | elite | DRAM — doses two allies: +35% damage, +25% speed, −40% cooldown |
| **Resurrection Man** | grabber | RECREW — tips whatever army is already on this board out of his cart |

**Faction rules (all three are the board's counterplay):** *one touch breaks a rite* — a single hit during the
wind-up cancels it and locks the lamp out for 90 frames; *the rite dies with the ritualist, however it died* — kill
(or ring out) the Chandler and every crust, dose, mend and tally he is holding pops in the same frame; *the company
does not insure its own* — every rite filters `faction !== 'chandler'`, so a room of nothing but Chandlers is a room
of people with no one to work on.

**The rule that shapes the board:** the *recipients* escalate while the ritualists stay the same. Section 1 is
Chandlers working on **Sootborn** who took the company's coal scrip. Section 2 is Chandlers working on each other's
machines in the works itself. Section 3 is Chandlers working on **Brassbound they have just put back together** —
Vane's soldiery, re-wound, crusted and invoiced. The last wave of the board is the war being restarted in front of
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

**Stage name:** *The Reckoning of Calderwick.* World x runs 0–5300. Three sections; camera, wave locks and the GO
arrow work exactly as in Stages 1 and 2.

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
- **Props:** crates, kegs, carts, ballast bags (Meat Pie), a signal locker (Golden Sprocket).
- **Hazards:** two **kiln vents** (x 620, 1540) — the roadside lime pits blow off — and a loading **hook** swinging
  from a wagon crane at x 1120.
- **Waves:** (1) 3x Wickboy — *the first rite you will ever see: the one you are hitting keeps getting back up.*
  (2) 2x Wickboy + 2x **Soot Cutthroat**. (3) 1x Tallyman + 1x Limeburner + 2x Soot Cutthroat.
  (4) 1x Limeburner + 1x Tallyman + 2x Wickboy + 2x **Scrap Slinger**.
- **Transition:** the works' cargo lift takes you down off the road into the yard (`kind: 'lift'`).

## Section 2, The Tallow Works (x 1800–3600; the company's yard, open air)
- **Setting:** the works themselves — tallow vats under gantries, the draw-kilns, cart lanes with the company's lime
  cones burnt into the ground, tally boards on every wall, and the kiln head at the far end.
- **Parallax:** *Far* (0.2x): the works' long roof line, four kiln chimneys drawing smoke, a hoarding with the
  company's mark on it. *Mid* (0.5x): tallow vats and their gantries, stacked handcarts, tally boards, pole lamps.
  *Near* (1.2x): kiln flues and hanging tarpaulin passing in front of the fight; lime dust.
- **Floor:** yard cobble with cart ruts, chalk lane lines and quicklime spill.
- **Props:** carts, crates, kegs, an urn holding the board's **Brass Heart** (1-UP) at x 2960, a signal locker.
- **Hazards:** kiln vents at x 2180 and x 3020, the yard crane's hook at x 2600.
- **Waves:** (1) 1x Limeburner + 2x Wickboy + 1x Soot Cutthroat. (2) 1x Purser + 1x Tallyman + 2x **Copper Sapper**.
  (3) 1x Resurrection Man + 1x Wickboy + 2x **Tin Footman** — the first cart, and the first thing you see come out
  of one.
- **Mid-boss** (x 3400): Yardmaster Marl & the Lime Kiln, at the kiln head.
- **Transition:** the counting-house doors come up and you go in (`kind: 'board'`).

## Section 3, The Ledger House (x 3600–5300; interior)
- **Setting:** the company's counting floor — brass ledger cages, a wall of pigeon-holes, the wax press, tally boards
  floor to ceiling, and one enormous kiln behind the desk that has never once gone out. **A cold room**: the walls,
  the desks and the boards are all green-grey, and the only two warm things in it are the lamps and the kiln, so a
  tallow-coated company standing in its own hall is the warmest thing on screen.
- **Parallax:** *Far* (0.2x): the pigeon-hole wall and the ledger cages, lamplit, with the kiln's lime glow at the
  end of the room. *Mid* (0.5x): counting desks, chained ledgers, the wax press, cart lanes running into the hall.
  *Near* (1.2x): pillars passing in front of the fight; paper dust turning in the lamp light.
- **Floor:** waxed board with brass inlay lines and lime tracked in from the yard.
- **Props:** cabinets, cases, crates, kegs, an urn (Meat Pie).
- **Hazards:** two kiln vents (x 3980, 4520) and the wax press's hook at x 4260.
- **Zone:** `daisVents` over the counting floor (4880–5300).
- **Waves:** (1) 1x Resurrection Man + 2x Wickboy + 2x **Tin Footman**. (2) 1x Purser + 1x Limeburner + 2x **Brass
  Halberdier** + 1x Wickboy. (3) 1x Resurrection Man + 1x Tallyman + 1x Purser + 2x Tin Footman + 1x **Iron Warden** —
  the war, restarted, in one wave.
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
- The mid-boss reuses `midboss` (the Grubbik theme): she is a yard boss, not a flag officer.

# 7. Picking the board

Stage 3 starts **locked** behind Stage 2, exactly as Stage 2 is locked behind Stage 1 (`src/game/progress.js`): its
plaque shows the padlock plate, `? ? ? ? ?` and CLEAR STAGE 2 TO OPEN. Clearing Stage 2 opens it for good and the
results screen plays the same unlock flourish on its plaque. The plaque carries the board's name, its three sections,
THE CHANDLERY and your best rank; its vignette is the `works` motif — a low works roof under a chalk sky, four
chimneys drawing smoke, kiln mouths lit lime along the ground.

`?stage=3` jumps straight to the board and opens it for that page load, and works with the usual debug params
(`?skipTo=gameplay&stage=3&bot=1&godmode=1`); `?unlockall=1` opens every board for one page load.

`npm test` runs the Stage 3 bot playthrough as the `playthrough3` scenario, with the same assertions as Stages 1 and
2 (both bosses seen, results screen reached, zero runtime errors) and screenshots under `tools/screens/6x-stage3-*`.
