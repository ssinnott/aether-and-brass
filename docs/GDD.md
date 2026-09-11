> **Binding overrides:** see `docs/RECONCILIATION.md` for the final controls, floor band, rig scale, physics constants and the MUST/SHOULD/CUT scope tiers. Where it conflicts with this document, RECONCILIATION wins.
>
> **Scope of this document:** the world, the four heroes, the combat system, the HUD and **stage 1, The Ascent of Calderwick**. The second board — *The Storm Above Calderwick*, its Stormcrow faction and its two bosses — is designed in `docs/STAGE2.md`, which is the authority for that board and inherits every system rule from here unchanged.

# 1. World & Tone

**Setting: Calderwick, the Tiered City.** A mountain-flank foundry-city built in three stacked terraces around the **Heart-Engine**, a colossal alchemical boiler that burns *aether* (a luminous cyan vapor) to keep the airship docks afloat. Victorian fantasy: riveted brass, verdigris domes, gaslamps, gothic ironwork, endless steam.

**The faction: The Cinder Concordat**, led by **Chancellor Aurelius Vane**, the city's former Aetherwright (chief engineer). Vane has seized the Heart-Engine, sealed the sky, welded the safety valves shut, and is over-firing the Engine to bind the city to his will. His army has two arms:

- **The Brassbound** (Enemy Type A): clockwork soldiery wound from Heart-Engine aether. Expensive, deliberate, relentless, never afraid.
- **The Sootborn** (Enemy Type B): goblin stoker-clans of the lower city, press-ganged and paid in coal scrip. Fast, numerous, cowardly alone, dangerous in packs. They are *people:* they flee, cheer, panic.

**The rule that shapes the stage:** the deeper you push toward the Engine, the more Brassbound and fewer Sootborn, the wave lists in §6 follow it.

**Heroes:** the Brassguard, a freelance crew with a dented airship (the *Stubborn Kettle*).

**Tone:** Saturday-morning swashbuckling with a Dickensian grin, Shredder's Revenge energy in a brass top hat.

**Visual language rules:**
- Renderer: 2px `#2B2B30` outlines on every primitive, flat fills, a darker shade band on the lower half of torsos and limbs. Shadows: ellipses, alpha 0.35.
- Readability: heroes use *saturated warm primaries + one metal* so a player finds themselves in a crowd in 100 ms. Brassbound: *cold metals* (brass `#C89B3C`, verdigris `#4E8A6E`, gunmetal `#4B4F55`), rigid rectangular silhouettes. Sootborn: *warm soot tones* (acid green, rust, tar-black), round hunched silhouettes.
- **Aether cyan `#4DF0E0` appears only on Concordat machinery, boss tells and meter pickups; heroes never wear it.** A Brassbound lens turning cyan → red `#FF5C5C` is always an attack tell.
- Backdrop palette: brass `#C9963A`, iron `#3A3F4B`, furnace orange `#FF7A1F`, night violet `#2B1E4A`.

**Plane:** 640×360 internal. Floor band 150px tall (z = 0 back to 150 front; screen y 210–360). Rigs face left/right only (mirrored). Depth sort by z.

# 2. Playable Characters (4)

Shared body scale: 48px standing, head 12px circle, torso 14×18; all four rigs share one joint set and keyframe format. Walk speed 1.7 / 2.2 / 2.8 px/f for Speed 2 / 3 / 5; run = walk × 1.7; z-movement 0.6× x. Specials cost 1 meter bar, or 8% max HP if no bar is full (§7).

## 2.1 Brunhild Coalheart, Tank
- **Backstory:** Dwarf boilerwright who forged the Heart-Engine's safety valves Vane welded shut. She is going up there to open them, with a hammer.
- **Stats:** Power 5 / Speed 2 / Health 5 / Range 3 / Technique 2.
- **Visual:** Squat, 42×30px, wide rect beard, thick arms. Palette: `#B5502A` beard, `#7A2E1E` apron, `#C9A227` brass, `#3A3A44` iron, `#F0D9B5` skin, `#E86A1E` boiler fire, `#9BC1E8` goggle lens. **Weapon:** two-handed steam hammer (24×10 head, 26px handle, 4px chimney). **Accessories:** boiler backpack (chimney puffs a circle every 20f), goggles on forehead, gear pauldron.
- **Moveset:**
  - *Ground combo (4):* swipe (10 dmg, 6f startup, hitstun 16f) → backhand (10, hits behind too) → overhead slam (15, knockdown; ground-bounces an airborne enemy once) → steam uppercut (20, launcher, 12px flame circle). Reach 40px.
  - *Jump attack:* downward slam, 14; 40px landing shockwave (10, knockdown).
  - *Dash attack:* shoulder charge, 14f, 18 dmg, knockback 120px, absorbs 3 hits.
  - *Special:* **Piston Quake**: r 60px, 25 dmg, knockdown to all grounded enemies. 8f startup, 4f active, 12f recovery, invulnerable through active.
  - *Super:* **Overpressure**: 3-hit expanding ring (r 60/100/140px, 30+30+40, knockdown), 45f, invulnerable.
  - *Grab + throw:* forward = hammer-golf swing, enemy flies 200px as a projectile (20); back = piledriver (22, 40px shockwave).
  - *Taunt:* leans on hammer, whistle.
  - *Unique trait:* **Heavy Frame**: 15% less damage taken; Sootborn light attacks cannot knock her down; combo hits 3–4 absorb 1 hit each.
  - *Shield:* **Boiler Plate**, 34 points, refilling 9/s once she has gone 2.5s without damage (5s after it breaks). The biggest slab in the cast and the slowest to come back.
- **Play feel:** Slow, but every swing is a wall, you stand in the crowd and the crowd regrets it.

## 2.2 Sael Windwright, Speed
- **Backstory:** High-elf sky-courier grounded when Vane sealed the sky. She owes 400 undelivered letters and takes deliveries personally.
- **Stats:** Power 2 / Speed 5 / Health 2 / Range 2 / Technique 5.
- **Visual:** Tall and thin, 52×16px, ear triangles, long legs. Palette: `#EAF2F7` hair (ponytail = 3 chained rects, 2f lag), `#2F6F8F` coat, `#D9B45B` trim, `#F5E0C8` skin, `#8FE3FF` electro-arc, `#1C2A33` boots, `#C74E4E` scarf. **Weapon:** electro-rapier, 30px line with a 4px circle guard. **Accessories:** aviator cap with goggles, jet boots (5f flame triangle on dash/jump), trailing scarf.
- **Moveset:**
  - *Ground combo (4):* thrust (5, 4f, hitstun 14f) → thrust (5) → spinning slash (8, front and back) → rising lunge (10, launcher, moves her 20px up-forward).
  - *Jump attack:* 45° dive kick, 12; on hit rebounds 30px up and can act again.
  - *Dash attack:* **Arc Dash**: 60px teleport-dash through enemies (i-frames 8f), 8 dmg to all passed, cancellable into the combo.
  - *Special:* **Tempest Waltz**: locks onto the nearest enemy within 60px: 6 thrusts (4 each) + thunderclap (10, knockdown). 36f, i-frames 1–20.
  - *Super:* **Sky Lane**: zips between up to 8 enemies (12 each, 6f per hop), ending in a 30 dmg thunderclap. Invulnerable.
  - *Grab + throw:* forward = jet-boot kick, enemy flies 160px and she gains 15px height (air-combo opener); back = vault-over kick, enemy sent 90px behind (12).
  - *Taunt:* flips and catches the rapier.
  - *Unique trait:* **Double Jump** plus one air dash per airborne state; dodge recovery 5f; takes 15% more damage.
  - *Shield:* **Static Ward**, 14 points, refilling 27/s after 1s without damage (2s after it breaks). Tiny and nearly instant: it pays for hit-and-run and gives her nothing while she stands in the crowd.
- **Play feel:** A hummingbird with a knife, always at the enemy you weren't looking at.

## 2.3 Captain Rook Halloway, Balanced (ranged hybrid)
- **Backstory:** Human captain of the impounded *Stubborn Kettle*. He is here for his ship, his crew, and, if there's time, the city.
- **Stats:** Power 3 / Speed 3 / Health 3 / Range 4 / Technique 3.
- **Visual:** 48×20px, tricorne trapezoid, two coat-tail rects (3f lag). Palette: `#5A2A2A` oxblood coat, `#C9A227` buttons, `#F0D9B5` skin, `#3A2A1E` beard, `#D8D8D8` steel, `#7B4A2E` boots, `#F2C94C` muzzle flash. **Weapon:** cutlass (26px curved polygon) right, clockwork revolver (8×5 rect + 3px barrel) left. **Accessories:** tricorne, gear eye-patch, fringed epaulettes.
- **Moveset:**
  - *Ground combo (4):* slash (8, 5f, hitstun 16f) → reverse slash (8) → pommel bash (10, stagger) → point-blank shot (14, knockdown, knockback 80px, pierces to a second enemy behind for 8).
  - *Jump attack:* downward slash, 12; Attack again in the air fires a downward shot (8).
  - *Dash attack:* baseball slide, 12, trips, passes under projectiles.
  - *Special:* **Fan the Hammer**: 5 shots in a 30° fan, 6 each, 200px range.
  - *Super:* **Broadside**: the *Stubborn Kettle* crosses the far layer dropping 6 cannonballs (25 each, r 40px, knockdown) 6f apart. Invulnerable 50f.
  - *Grab + throw:* forward = 3 pommel hits (6 each) then a boot kick; back = hip toss, enemy lands 90px behind and bounces (juggle-able).
  - *Taunt:* tips hat, spins revolver.
  - *Unique trait:* **Parry**: his dodge is a normal roll, but an enemy melee attack that would connect during frames 1–6 of the roll is parried instead: roll cancels, enemy stunned 40f, +15 meter, 8f hit-stop. A mistimed press is still a full roll.
  - *Shield:* **Bulwark**, 22 points, refilling 18/s after 1.7s without damage (3.3s after it breaks). The middle of the cast in every number, and one more thing a parry keeps intact.
- **Play feel:** The jack-of-all-trades who answers every question with the right tool, sword, boot, or bullet.

## 2.4 Pip Gearlock & The Rig, Grappler
- **Backstory:** A gnome tinkerer who couldn't reach the top shelf, so she built a 7-foot exo-rig. It hisses when she's annoyed. She is frequently annoyed.
- **Stats:** Power 4 / Speed 2 / Health 4 / Range 3 / Technique 3.
- **Visual:** 58px tall, built like a scaffold, **on the standard joint set**: the head joint is Pip's 9px gnome head with a red hat triangle; a 16×14 open-cockpit cage (rect outline) is an accessory drawn around it. Torso 12×22 with a brass boiler circle; oversized arms ending in two-triangle claws; 5px piston legs. Palette: `#6B6B75` frame, `#C9A227` brass, `#C74E4E` hat, `#F5E0C8` skin, `#E86A1E` boiler glow, `#8FA3B0` steam, `#59C3A0` gauge. **Accessories:** chest pressure gauge (needle = her meter), shoulder exhaust stacks, hanging lantern.
- **Moveset:**
  - *Ground combo (3):* claw swat (12, 8f, hitstun 18f) → double-claw clap (14, front and back, stagger) → piston uppercut (18, launcher).
  - *Jump attack:* butt-stomp, 16, 30px shockwave (knockdown).
  - *Dash attack:* **Grapple Shot**: fires the right claw on a chain 140px forward at 6px/f; the first enemy hit takes 6 and is reeled into her grab state over 12f.
  - *Special:* **Steam Vent**: 80px, 40° cone, 4 × 6 dmg, 20px pushback per hit, extinguishes fire puddles. 10f startup.
  - *Super:* **Wrecking Ball**: grabs the nearest enemy (else a rubble ball), swings it in three circles (r 70px, 20 per rotation to all touched), hurls it 300px (40). 70f, invulnerable.
  - *Grab + throw:* forward = hurl 220px as a projectile (20); back = piledriver (25, 40px shockwave); Attack while holding = **Crush**, 3 × 8.
  - *Taunt:* vents both stacks.
  - *Unique trait:* **Grab Armor**: uninterruptible grab startup; reach 30px (standard 20); can grab Iron Wardens, Cinder Hulks and partners (§7); grab damage +25%.
  - *Shield:* **Pressure Hull**, 28 points, refilling 12/s after 2.2s without damage (4.3s after it breaks). The walk-in budget: the rig eats the hit that would otherwise interrupt the approach.
- **Play feel:** A crane operator in a bar fight, reel them in, pick them up, turn one enemy into a weapon against the rest.

# 3. Enemy Type A (base + 5 variants): The Brassbound

**Type identity:** clockwork infantry, precise, telegraphed, the *walls* of the game; fewer, worth more, never flee. Take **1.5× damage from throws and grabs** (including thrown Sootborn).

**Base rig:** 50px, rigid upright. Head 12×12 rounded rect with one 6px lens (`#4DF0E0`, red `#FF5C5C` during tells). Torso 16×20 with a round aether-core window; gear pauldrons; 6px limbs with ball-joint circles; plate feet. Palette: `#7F8C99` steel, `#4A5563` dark steel, `#C89B3C` brass joints, `#4DF0E0` lens/core, plus a **regiment stripe** on the chest per variant. **Every Brassbound has a wind-up key on the back (rect + circle) that rotates while it acts and stops when staggered or stunned, the universal "it's open" read.** Death: 6 parts fly out, cyan core pop.

**Shared behaviors:** walk straight at the player, no flanking. Every 4th hit in one combo causes a "gear slip" stagger (30f) regardless of armor. All variants except the shielded Iron Warden launch normally.

| Variant | HP | Dmg | Speed |
|---|---|---|---|
| Tin Footman | 40 | 6 | 1.0× |
| Brass Halberdier | 70 | 10 | 0.8× |
| Copper Sapper | 50 | 12 | 1.1× |
| Iron Warden | 180 | 16 | 0.7× |
| Chrome Duelist | 90 | 12 | 1.2× |

**A1. Tin Footman**: *Visual delta:* base palette, stripe steel-blue `#3E5C8A`, 16px wooden club. *Behavior:* walks in on the player's z, stops at 30px. Tell: key spins, lens red, 20f; swing 12f active, 6 dmg, recovery 24f. At most two Footmen attack at once. Flinches on every hit. *First:* Section 1, Wave 3, alone, the "meet the machine" moment.

**A2. Brass Halberdier**: *Visual delta:* body `#C9A227`, stripe iron-red `#8A2E2E`, scale 1.1, 40px halberd + trapezoid blade, crested helmet. *Behavior:* holds 55px. *Thrust:* halberd raised vertical 24f, 10 dmg, 50px reach. *Sweep:* crouches 30f, hits both lanes within 40px for 14, trips. 1-hit armor from the front only. *First:* Section 2, Wave 2.

**A3. Copper Sapper**: *Visual delta:* `#B87333` copper, stripe yellow `#E8C547`, scale 0.9, backpack of 3 bomb circles. *Behavior:* keeps 120px; lobs a bomb at the player's position from 0.4s ago (tell: bomb overhead 30f, sparking fuse). Bomb bounces once, blinks 40f, explodes r 30px (12, hits enemies too). **Any player attack bats the bomb 150px** (20 dmg to Brassbound hit). On death drops remaining bombs, exploding 60f later. *First:* Section 2, Wave 2.

**A4. Iron Warden**: *Visual delta:* scale 1.4 (70px), `#3A3A44` gunmetal, stripe purple `#5B2A86`, tower shield (18×30) left, 28px mace right, shoulder smokestack. *Behavior:* super armor and no launch while shielded. 3-hit shield-bash combo (tell: key spins 30f, shield glows cyan) 16/16/20, last knocks down. **Every 4th hit taken while shielded staggers him 30f** (shield lowers, key stops), the punish window; **a launcher during that stagger strips the shield permanently** (it falls as a prop), after which he flinches and launches like a Footman. Grabbable only by Pip. Jump attacks do 1.5×. *First:* Section 2, Wave 4; pairs in Sections 3–4.

**A5. Chrome Duelist**: *Visual delta:* `#DDE6EE` chrome, stripe verdigris `#2E6B52`, thin arms, 28px rapier line, cape (2 rects `#2E4A6B`), half-mask. *Behavior:* circles at 45px. After the player presses Attack 3 times in a row he enters **Riposte stance** (tell: rapier vertical, lens flashes 3× over 18f, chime): any melee into him during the 30f stance is parried and answered with a 4-hit flurry (12 total). Answers: wait, dodge behind, grab, projectiles. Own attack: lunging thrust (tell: 16f crouch), 12. *First:* Section 3, Wave 2.

# 4. Enemy Type B (base + 5 variants): The Sootborn

**Type identity:** goblin stoker-clans bribed with coal scrip. Fast, fleshy, cowardly, numerous; flinch on every hit, the *combo fuel*. Fire hurts them 1.5×. Every Sootborn wears a **numbered brass badge** (chest circle), the shared faction mark.

**Base rig:** 40px, hunched 15°. Oversized 14px head circle with a triangular nose and ear triangles; `#F2C94C` eyes track the nearest player; long arms, short legs. Palette: `#6BA84F` skin, `#3F6B2E` shade, `#5A4A3A` rags, `#B0B0B0` scrap, plus a **clan color** per variant. Death: flops with X-eyes.

**Shared behaviors:** approach in an arc and flank on both z-lanes. **Attack tokens:** at most 2 Sootborn attack at once; the rest circle. If the *last* enemy in a wave is a Sootborn at ≤30% HP, 50% chance it flees offscreen (counts as cleared, no score).

| Variant | HP | Dmg | Speed |
|---|---|---|---|
| Soot Cutthroat | 30 | 5 | 1.3× |
| Scrap Slinger | 35 | 8 | 1.1× |
| Firebrand | 45 | 10 (+burn) | 1.0× |
| Cinder Hulk | 160 | 18 | 0.6× |
| Gutter Wrangler | 60 | 8 | 1.5× |

**B1. Soot Cutthroat**: *Visual delta:* base, clan rust `#9A4A22` bandana, 10px knife line. *Behavior:* charges in groups; one stabs (tell: 12f arm pull-back with a "hee!" chirp; 5 dmg) while others flank on the other lane. At <10 HP runs 100px away, then returns. *First:* Section 1, Wave 1.

**B2. Scrap Slinger**: *Visual delta:* `#8FA35A` olive skin, clan mustard `#D9A62B` cap, sling (line + circle). *Behavior:* stays 140px away on another lane; swings the sling 3 loops over 36f, releases a 6px bolt at 4px/f (8, knockback). Any attack reflects the bolt (12 back). A player within 50px makes it panic: 30f stagger (free punish), then it runs. *First:* Section 1, Wave 2.

**B3. Firebrand**: *Visual delta:* `#8C3A2E` singed skin, clan orange `#F08A24`, fuel-tank backpack linked to a nozzle, welding goggles. *Behavior:* 70px flame cone (tell: pilot light pops bigger 24f): 3 × 5 + burn (2 every 20f for 60f); leaves a fire puddle 180f (hurts everyone). **On death the tank explodes after 30f** (r 40px, 15 to all), grab and throw the body into a crowd first. *First:* Section 2, Wave 1.

**B4. Cinder Hulk**: *Visual delta:* scale 1.6 (64px), `#4C7A3C` skin, clan copper `#B8692E` collar, wrist chains, anvil-headed club (20×12 on a 30px handle). *Behavior:* club overhead (tell: 36f raise, dust circles) 18 + knockdown. **Grab** (tell: arms spread 20f, roar): squeezed 4 × 5 unless the player mashes Attack ×6 or the partner hits him. Flinches every 3rd hit; a launcher stuns him 45f. Grabbable only by Pip. *First:* Section 2, Wave 3.

**B5. Gutter Wrangler**: *Visual delta:* `#9EC96D` skin, scale 0.9, clan oxblood `#7A1E2A` waistcoat, stolen top hat, monocle, 6-segment whip, net. *Behavior:* backsteps 40px (8f i-frames) after any 2 whiffed player attacks in a row. Whip crack (tell: arm raised 14f) 8 at 60px. **Net throw** (tell: net spun overhead 30f): netted player stuck 90f unless mashing or freed by the partner; **in co-op he nets the player with the higher combo count.** Dash attacks and grabs beat him. *First:* Section 2, Wave 3.

# 5. Mid-boss & Final Boss

## 5.1 Mid-boss: Foreman Grubbik & the Hoister
- **Concept:** the goblin foreman who sells his own clans to Vane, in a stolen cargo-loader exosuit.
- **Visual:** unique rig, 96px. Chassis a 40×30 rounded rect in hazard orange `#E07A1F` with black stripes, boiler behind, open cockpit cage on top, two piston legs, left arm a crane **claw** (2-prong polygon), right arm a **chain hook** (5 line segments). Grubbik in the cage: Sootborn rig ×1.2, stovepipe hat, monocle, cigar.
- **HP:** Hoister 600 (2-segment bar, Phase 2 at 50%), then Grubbik on foot 100.
- **Attacks (Hoister):**
  1. *Claw Sweep:* tell: claw draws back 24f with a hydraulic hiss. 100px arc, 22, knockdown. Punish: 30f recovery, claw stuck; cabin hits 1.5×.
  2. *Ground Pound:* tell: both arms up 30f. Shockwave r 60px, 18, knockdown. Jump it and land a jump attack on the cabin.
  3. *Crate Drop:* tell: Grubbik pulls a lever 40f; a shadow grows at the player's position. Crate: 24, r 60px, knockdown, then a breakable prop dropping a Meat Pie or Aether Vial, the fight feeds you.
  4. *Hook Yank (Phase 2):* tell: hook rattles and glows 20f, fires along his lane at 6px/f; a caught player is reeled in and crushed (30) unless they mash out within 25f. Dodge in z.
  - **Overheat (≤200 HP):** chassis glows red, attacks 20% faster, but every 3rd attack ends in a 70f stall with the cage open: grab the cockpit for 3× damage (Pip's Grapple Shot reaches it from anywhere).
- **Phase 2, Grubbik on foot (100 HP):** fights like a Gutter Wrangler plus a *Whistle Rally* (spawns 3 Cutthroats once) and a *Hat Toss* (boomerang, 8). No armor, a victory lap.
- **Arena gimmick:** 640px cargo bay. A conveyor strip on the front 40px of the band drifts everything left at 1px/f and carries a breakable crate every 4s. The back edge (z < 20) is the molten channel: enemies knocked in die (+200), players take 20 and bounce back.
- **Defeat spectacle:** legs buckle (rig tilts 25° over 30f), boiler bursts in three pops (shake 12px), Grubbik drops his badge and runs offscreen; 3 pickups rain down.

## 5.2 Final Boss: Chancellor Aurelius Vane, the Aetherwright
- **Concept:** the elegant villain piloting the **Regent Engine**, a tripod walker bolted onto the Heart-Engine. Three phases strip the machine down until the man is exposed.
- **Visual (Regent Engine):** 140px. Tripod piston legs, barrel body (`#C9963A` rounded rect, `#3A3F4B` ribs), glass cockpit dome, 60px cyan core window, left arm a steam cannon, right arm a spinning gear-saw (circle + 8 triangle teeth). **Visual (Vane):** hero rig ×1.15, lean. Frock coat `#1B1E2B` with cyan piping, cravat `#F4F1E8`, grey queue `#8C8C94`, spectacles, top hat with a brass gauge, cane-sword (`#D8DCE0`), clockwork left arm, skin `#E8CDB5`.
- **HP:** Phase 1 450, Phase 2 450, Phase 3 250 (one bar, three colored segments).
- **Phase 1, Legs (only the legs take damage):**
  1. *Stomp:* a leg rises 30f (shadow grows), slams r 40, 20, knockdown. Jump it.
  2. *Cannon Volley:* cockpit flashes cyan 3× over 40f; 3 shells along the player's lane at 6px/f (18, knockdown). Dodge in z. Punish: cannon vents 60f.
  3. *Summon Escort* (66% and 33%), 2 Tin Footmen march in.
  4. *Time Stop:* Vane raises his pocket watch (tell 40f, ticking slows); players freeze 60f while a free Stomp lands. **A Dodge input during the last 10f of the tell (watch glows white) avoids it entirely.**
- **Phase 2, Body (legs collapse; the body drops to floor height and is hittable):**
  1. *Saw Sweep:* saw spins up with a rising whine 36f, sweeps the full width along one 60px z-band (marked by a cyan line), then the other 48f later. 28, knockdown. Punish: saw jams 50f.
  2. *Bolt Spray:* cockpit red 30f, chest slit fires 8 bolts in a fan (8 each). Jump over.
  3. *Core Vent* (every 150 HP lost), core cover opens 120f: core hits do 2×; saw and cannon stall.
- **Phase 3, Vane on foot (the Engine explodes, he leaps clear):** speed 1.3×, no armor, grabbable.
  1. *Cane Flurry:* bows with a flourish 20f, then a 5-hit string (8 each, last launches). Rook can parry any hit; 30f recovery.
  2. *Clockwork Fist:* arm ratchets 360° 30f, pistons out 100px (18). Punish: arm stays extended 40f (counts as body).
  3. *Pocket-Watch Bomb:* ticking circle, flashes faster, explodes r 40 after 90f (16).
  4. *Aether Step:* vanishes in a cyan puff, reappears behind the nearest player after 20f, always followed by Cane Flurry; dodge on reappear. Teleports away after taking 60 dmg in one combo.
- **Arena gimmick:** the dais, 400px wide. The band shrinks 20px per phase as steam vents open along its edges (4 dmg every 30f inside). Two breakable **pressure valves** on the walls: hitting one in Phase 1 or 2 stuns the Regent Engine 60f (once each).
- **Defeat spectacle:** Vane drops cane and hat; the welded safety valves blow open one by one (6 white steam jets with bass thumps); the sky lightens to dawn cream over 120f, city lights return terrace by terrace, heroes pose, "STAGE CLEAR".

# 6. The Stage (end to end)

**Stage name:** *The Ascent of Calderwick.*
**Intro card** (black, brass frame, tiered-city silhouette with rising steam, typewriter 2 chars/f, skippable):
> CALDERWICK, CITY OF THE HEART-ENGINE. The Chancellor has sealed the sky.
> Four unlikely deliveries are about to be made, upward.
> **STAGE 1: THE ASCENT OF CALDERWICK**

**Global rules:** world x runs 0–6000px. The camera tracks the **midpoint** of living players (clamped so nobody leaves the screen), right only. Wave triggers lock the camera on a 640px arena until clear, then a blinking "GO →" arrow.

**Hazard rules (all sections, every board).** A hazard is a positional mistake, not a damage race:
- **One hit per body per activation.** After a hazard catches you it cannot touch you again for ~90–120f (its `grace`) — long enough to land, lie, stand up and step clear. An eruption never juggles you for its whole active window.
- **The knockback throws you clear.** Hazard hits carry `fromX`, so the launch or knockdown pushes you *away* from the vent / piston / hook rather than off your own facing, which used to drop you straight back into it.
- **Tells are the fair warning**, not the hit count: rattle / shadow / horn / ring, 30f or more.
- **Fire is a fact about the world.** Burning bodies, fire projectiles and puddles, a boiling tallow vat, a broken lantern and every explosion register with `world.fires`; board 4's rose gas seeps and board 2's green gas clouds are harmless until fire (or, for the cloud, a Powder Bosun's keg) touches them, then they burst on everyone inside.
- **Mobs path around one that is live.** An enemy approaching a player steers to the edge of a hazard's footprint (the cargo hook's whole 176px arc) while it is telling or firing, so hazard damage on a mob is something the player sets up by knocking them in — a *dormant* vent is still bait to be walked over.

## Section 1, Sootfoot Docks (x 0–1800; rain, night)
- **Setting:** airship moorings, chain-lashed gantries, light rain.
- **Parallax:** *Far* (0.2×): night gradient `#0E1424 → #1F2A44`, stepped terrace silhouettes `#141A2C` with window dots, a cyan summit glow, two airship silhouettes (ellipse + gondola rect). *Mid* (0.5×): dock cranes (rects + braces), gaslamps every 180px (post + halo); rain as 60 1×8px lines alpha 0.3 falling 6px/f. *Near* (1.2×): bollards, rope coils.
- **Floor:** wet planks `#3A2E24` / `#443629`, 12px rows; puddle ellipses alpha 0.15.
- **Props & breakables:** crates (**Brass Cog** ×2; 1 in 4 a **Meat Pie**), barrels (roll 40px, 10 dmg to enemies; **Coal Scrip**), mooring winch (**Aether Vial**), a dock bottle and a gaslamp (§7: no drop, empty-handed pick-up, thrown-only).
- **Hazards:** steam vents at x 600 and 1250 (rattle 30f, erupt 45f every 180f: 7 + launch, hits enemies). Swinging cargo hook at x 1500 (period 2s; 10, knockdown).
- **Waves:**
  - Wave 1 (x 400): 3× Soot Cutthroat.
  - Wave 2 (x 900): 4× Soot Cutthroat + 2× Scrap Slinger.
  - Wave 3 (x 1300): 1× Tin Footman (alone) + 2× Soot Cutthroat.
  - Wave 4 (x 1650): 2× Tin Footman + 2× Scrap Slinger + 3× Soot Cutthroat.
- **Transition:** a dock gate rotates open; a 180f freight-lift ride down with one Meat Pie.

## Section 2, Foundry Row (x 1800–3800; interior, heat)
- **Setting:** the great foundry, the goblins' workplace.
- **Parallax:** *Far* (0.2×): cavern wall `#2A1C16`, huge gears (r 60–100px, 0.3°/f) rimmed `#FF7A1F`. *Mid* (0.5×): brick arches `#5A3A2E`, a molten channel behind a low wall (`#FFB347 → #FF5A1F` band with drifting blobs). *Near* (1.2×): pipe bundles, heat shimmer (2px sinusoidal x-offset), sparks.
- **Floor:** iron grate plates `#2E2A28` with rivet rows at 48px seams. The back 20px (z < 20) is the **molten channel**: 10 + burn and a bounce back; enemies knocked in die.
- **Props & breakables:** ingot molds (**Brass Cog**), coal carts (roll, 15 to enemies; **Meat Pie**), oil drums (explode 30f after breaking, 20 dmg r 40; **Aether Vial**), display case (**Golden Sprocket**), hanging bucket (**Roast Bird**).
- **Hazards:** steam vents at x 2500 and 2800 (cyan tell 30f, jet 40f: 7 + launch). Crushing pistons at x 3000 and 3300 every 240f (shadow tell 36f; 16 + knockdown, hits enemies).
- **Waves:**
  - Wave 1 (x 2100): 2× Firebrand + 3× Soot Cutthroat.
  - Wave 2 (x 2500, vents active): 2× Brass Halberdier + 2× Copper Sapper.
  - Wave 3 (x 2900): 1× Cinder Hulk + 1× Gutter Wrangler + 3× Soot Cutthroat.
  - Wave 4 (x 3250, pistons active): 1× Iron Warden + 2× Brass Halberdier + 2× Scrap Slinger.
  - **Mid-boss** (x 3600): Foreman Grubbik & the Hoister. Intro: spotlight cone, hat tip, name plate.
- **Transition:** the cargo gate rises; players board the **Aether Funicular** tram car.

## Section 3, The Brass Funicular (x 3800–4440, one locked screen; exterior, dusk into night, moving)
- **Setting:** a tram car climbing the cliff; the floor is its roof, backdrops scroll to sell the climb.
- **Parallax:** *Far* (auto-scroll down 0.3px/f): dusk gradient `#3A2450 → #E8743B` lerping to night `#0F1A2E`; the lower city as stepped silhouettes. *Mid* (auto 1.5px/f): cliff polygon, cable and pylons (thick rects every 240px). *Near* (auto 3px/f): rail struts, wind streaks.
- **Floor:** riveted brass roof `#A67C2E` / `#8C6825`; couplings drawn as darker gaps (cosmetic; floor is continuous). **Front and back 12px of the band are railings**: enemies thrown over them are instant KOs (+200).
- **Props & breakables:** luggage trunks (**Meat Pie**, **Brass Cog**), mailbag cart (**Golden Sprocket**), lantern posts (**Coal Scrip**).
- **Hazards:** **pylon crossbars** every 360f sweep the back lane (z < 40) (tell: horn + shadow 40f): 12 + knockdown; step forward in z.
- **Waves (timer-triggered, or on clear):**
  - Wave 1 (t = 0s): 3× Copper Sapper + 2× Tin Footman.
  - Wave 2 (t = 25s): 2× Chrome Duelist + 2× Brass Halberdier.
  - Wave 3 (t = 55s): 2× Gutter Wrangler + 1× Cinder Hulk + 2× Scrap Slinger, the last goblins.
  - Wave 4 (t = 90s): 1× Iron Warden + 2× Chrome Duelist + 2× Tin Footman, the Warden **crashes through the roof** with a 10px shake.
- **Transition:** the funicular docks; a short stair with no enemies and 2 Meat Pies.

## Section 4, The Heart-Engine (x 4440–6000; summit, cathedral of brass)
- **Setting:** a boiler-cathedral; the Engine's core burns at the far end.
- **Parallax:** *Far* (0.2×): the Engine wall, cylinders `#8C6825` with gauge needles, a 120px cyan core pulsing on the downbeat. *Mid* (0.5×): gothic arches `#3B3A46` with stained-glass triangle mosaics; purple `#5B2A86` gear banners. *Near* (1.2×): brass pillars, cyan motes.
- **Floor:** marble diamonds `#D9D3C7` / `#B9B2A5` with actor reflections at alpha 0.12.
- **Props & breakables:** urns (**Meat Pie**; the third hides a **Brass Heart** 1-UP), a **chandelier** that falls when hit by a jump attack (30 to enemies within 90px, once), a cabinet (**Golden Sprocket**), the boss-arena **pressure valves**.
- **Hazards:** aether floor vents (cyan tell 30f, 30f jet: 10 + launch) firing on the music's downbeat.
- **Waves:**
  - Wave 1 (x 4800): 2× Tin Footman + 2× Brass Halberdier.
  - Wave 2 (x 5150): 1× Iron Warden + 2× Copper Sapper + 1× Chrome Duelist.
  - Wave 3 (x 5500): 2× Iron Warden + 2× Chrome Duelist + 1× Gutter Wrangler + 3× Soot Cutthroat, the miserable last goblins flee fast; the machines are running out of hands.
  - **Final boss** (x 5900): Vane descends a spiral stair (2s cutscene) and mounts the Regent Engine. Name plate "CHANCELLOR AURELIUS VANE, THE AETHERWRIGHT"; 2s cut-ins between phases.
- **Transition:** defeat spectacle, 240f pose hold, results.

## Results screen
Brass plaque; per player column: **Enemies Defeated**, **Max Combo**, **Damage Taken**, **Continues Used**, **Time**, **Score** (one row per 20f with a ratchet tick). Then **Rank** (S/A/B/C/D) stamps on with a 6f slam and shake. Victory poses: Brunhild opens a valve and gets steam in the face; Sael flings 400 letters; Rook salutes the *Stubborn Kettle*; Pip's rig bows. Co-op adds "MVP" and "BEST PARTNER" badges. Auto-return after 600f.

# 7. Combat System Rules

All timings at 60fps. Every attack carries `dmg`, `hitstun` (f), `knockback` (px over 8f with decel) and a `reaction` in {flinch, stagger, launch, knockdown}.

- **Hitstun / knockback / knockdown:** *Flinch:* hitstun only (light 14f, medium 20f, heavy 26f). *Stagger:* hitstun + 30f wobble. *Launch:* vertical velocity 7px/f, gravity 0.35px/f². *Knockdown:* pops 16px, lands, lies 40f, gets up with 12f i-frames. Hitstun scales −2f per hit after the 5th consecutive hit (min 8f), no standing infinites. Combo enders and throws always knock down. Players get 30f i-frames after get-up; **tech** (Jump within 6f of landing) rolls 60px and stands instantly.
- **Juggling & air combos:** launched enemies can be hit up to 4 times in the air; each hit resets vertical velocity to +3px/f and juggle gravity rises +0.05px/f² per hit; the 5th hit forces a hard knockdown. Air hits deal 1.2× and count double toward the combo. Shielded Iron Wardens cannot be launched.
- **Dodge:** 20f roll along x (or z if Up/Down held), 60px, **i-frames 2–12**, recovery 8f (Sael 5f), 6f cooldown. Dodge **cancels any attack's recovery frames**. Dodging through an enemy's active frames grants 4f hit-stop and +10 meter.
- **Blocking:** none. Defense is dodge, parry (Rook), armor (Brunhild, Pip), shields, movement.
- **Shields:** every hero carries a small **regenerating shield** in front of their health — `max` points that soak
  damage before HP, refilling `regen` per second once they have gone `delay` without taking any, and `breakDelay`
  (twice the wait) after the pool is emptied. Per character: Brunhild **Boiler Plate** 34 / 9 per s / 2.5s,
  Sael **Static Ward** 14 / 27 per s / 1s, Rook **Bulwark** 22 / 18 per s / 1.7s, Pip **Pressure Hull** 28 / 12 per s / 2.2s.
  It is a *buffer, not a block*: the hit still connects, still staggers, launches or knocks down, and only the damage
  is eaten — so a shield buys back a mistake, it never replaces a dodge. Any damage restarts the wait, chip damage
  (burns, hold hits) included, so a fighter cannot recharge while burning. Breaking one costs the attacker nothing
  and the defender the longer wait, which is what makes pressure worth keeping up. Damage a shield ate does not count
  toward **Damage Taken** on the results screen. Shields come back full on respawn. Enemies and bosses have none by
  default; the same `traits.shield` block gives one to any fighter that should.
  **HUD:** a 120×2 brass strip directly above the health bar — pale when full, dim and slowly pulsing while it is
  down and waiting; the character-select card prints each hero's pool, rate and wait.
- **Special meter:** 3 bars of 100 per player. Gain: +4 per hit landed, +8 per knockdown, +12 per kill, +10 per sidestep, +2 per hit taken, taunt +20 over 60f (vulnerable), Aether Vial / Golden Sprocket +100. Spend: Special = 1 bar; **if no bar is full, a special costs 8% max HP** (only above 15% HP; meter shows red). Super = all 3 bars: 12f screen freeze with portrait cut-in, then invulnerable. Meter resets on death.
- **Grabs:** pressing Attack within 20px (Pip 30px) of an enemy that is **not in hitstun and not armored** grabs instead of striking, walking into enemies never grabs, so combos are never interrupted. Startup 8f, invulnerable; hold 60f max. Forward + Attack = forward throw, Back + Attack = back throw, Attack = hold hits. Thrown enemies are projectiles (15 + knockdown to anything hit) and count toward the combo. Grabs beat armor and Riposte stance. Bosses are grabbable only in stated windows.
- **Hit-stop & screen shake:** hit-stop freezes attacker and victim only: light 3f, medium 5f, heavy/launcher 8f, throw 6f, super finisher 14f. Shake: heavy hits 3px/6f, knockdowns 4px/8f, explosions 8px/12f, boss slams 12px/16f, supers 6px/20f; clamped 16px.
- **Combo counter & grades:** per player; drops 90f after the last hit or on taking damage. Shown at 3+: 3–9 **SOOTY**, 10–19 **SPARKY**, 20–34 **BRASSY**, 35–59 **STEAMED**, 60+ **AETHERIC**. Score multiplier per hit = 1 + combo/20, cap 3×.
- **Pickups** (walk-over; vanish at 10s): **Meat Pie** (+25% HP), **Roast Bird** (+60%), **Brass Cog** (200), **Coal Scrip** (500), **Aether Vial** (+1 bar), **Golden Sprocket** (+1 bar, +1000), **Brass Heart** (1-UP).
- **Weapon pickups** (walk-over; vanish at 10s; dropped on any knockdown and free for the partner to take after a short grace; **left behind on entering the next section**, never carried across): Brass Halberdier -> **Halberd** (12 hits, long slow thrust / swing / low sweep, last hit knocks down), Line Corsair -> **Cutlass** (15 hits, short fast, extra hitstun), Limeburner -> **Lime Rake** (10 hits, mid reach, short burn), Chrome Duelist -> **Duelling Sabre** (8 hits, fast, high damage). Swings use the normal combo grading and meter; the last hit shatters the weapon. Brassbound take extra damage from throws only, never from weapons.
- **Thrown weapons & props:** direction + Attack while wielding throws the weapon instead of swinging it — left/right turns to face and throws forward, up/down arcs it into the z you're facing instead. Each weapon keeps its own throw feel (Halberd knocks down; Cutlass and Sabre pierce one extra target; **Lime Rake** also lays a lime patch on landing, 2.5s of lime slick that halves the walk speed of anyone standing in it). A throw always spends one durability hit whether or not it connects, and shatters the same as running out on a swing; a weapon that drifts off an open edge (The Mooring Spine, The Lash-Up) is gone for good. A handful of small stage clutter — a dock bottle, a gaslamp — is picked up empty-handed the same way but has no swing at all: any Attack while holding one throws it, and it always breaks on landing. Thrown weapons and props hit like a thrown enemy: Brassbound take their usual 1.5×, and a kill off one pays the throw-kill score bonus.
- **Lives / continues:** 3 lives each; respawn from the top with 60f i-frames. Continues: 3 per session, shared in co-op; 10-second countdown; restores 3 lives and full HP at the current wave. Score is not reset; each continue costs one rank.
- **Scoring:** kills, Soot Cutthroat 100, Scrap Slinger 150, Firebrand 200, Gutter Wrangler 400, Cinder Hulk 500, Tin Footman 150, Copper Sapper 200, Brass Halberdier 300, Chrome Duelist 500, Iron Warden 1000, Grubbik 5000, Vane 15000; props 50; combo multiplier applies. Throw kill ×1.5; 3+ enemies in one hit ×2 ("CROWD CLEAR!"); ring-out +200; no-damage wave +1000; time bonus max(0, 60000 − seconds × 50). Ranks: S ≥ 120,000, A ≥ 90,000, B ≥ 60,000, C ≥ 30,000, else D; −1 rank per continue.
- **Co-op interactions:** no friendly fire on attacks. **Thrown enemies and rolling props do hit teammates** (5 dmg, knockdown, deliberately funny; Options toggle). **Revive:** a partner at 0 lives lies as a ghost 15s; hold Taunt beside them 120f to revive at 50% HP, once per section. **Partner toss:** Pip only, throw a partner 200px as an invulnerable projectile (20 + knockdown). **DUO super:** both supers within 60f of each other cost no meter ("DUO!" banner). **Assist:** hitting an enemy holding your partner frees them (+10 meter each). Pickups first-come.
- **Difficulty:** *Easy* (enemy HP ×0.75, damage ×0.6, tells +8f, 5 continues), *Normal* (as listed), *Hard* (HP ×1.25, damage ×1.4, tells −4f, +1 Cutthroat/Footman per wave, 2 continues), *Boilerplate* (Hard + no continues + 1 life).

# 8. Controls

Verbs: Move (8-way; Up/Down = z), Attack, Jump, Dodge, Special, Super, Taunt, Pause. **Run** = double-tap Left/Right (or hold RT on a pad); **Dash attack** = Attack while running; **Grab** = Attack beside an idle (non-hitstun, non-armored) enemy; **Throw** = direction + Attack while holding; **Hold hit** = Attack while holding.

Final bindings (authoritative table in `docs/RECONCILIATION.md`):

| Action  | 1P arcade (until P2 joins) | P1 (left half) | P2 (right half) | Gamepad |
|---------|----------------------------|----------------|-----------------|---------|
| move    | Arrows                     | W A S D        | Arrows          | D-pad / stick |
| attack  | Z                          | F              | J               | 0 (A) |
| jump    | X (or Space)               | G (or Space)   | K               | 1 (B) |
| dodge   | C                          | R              | U               | 2 (X) |
| special | V                          | H              | L               | 3 (Y) |
| super   | N                          | Y              | O               | 5 (RB) |
| taunt   | B                          | T              | I               | 4 (LB) |
| start   | Enter                      | Enter          | Backspace       | 9 (Start) |

Global: Escape pauses/unpauses, M mutes, F1 debug overlay. Any free slot joins by pressing its own key or pad button at any time (drop-in). Gamepads claim the lowest free slot on their first button press (never index-bound); P3/P4 are gamepad-only.
**Menu navigation:** Up/Down (or Left/Right on the select screen) moves; Attack / Enter confirms; Jump / Escape backs out. Character select: Left/Right cycles portraits, Attack locks, Jump unlocks; both players may pick the same hero (second copy gets a darker tint).

# 9. Screens & HUD

- **Title:** navy gradient; a brass gear outline (r 140px) rotates behind the tiered-city silhouette. Logo "**CALDERWICK**" in chunky brass rects with a 3px bevel; "*Brass & Aether*" in cyan italic; the four heroes idle on the gear. Menu: START / ONLINE CO-OP / TRAINING / OPTIONS (difficulty, friendly fire, volumes, scale, controls); any free slot joins with its own key or pad. "PRESS START" blinks 30f.
- **Character select:** each hero's shield (name, pool, refill rate, wait) prints under the cards; four portrait cards (140×200, brass frames) holding 2.5× rig busts: **Brunhild** (copper; beard rect, goggles, hammer on shoulder), **Sael** (teal; ear triangles, ponytail, rapier spark), **Rook** (oxblood; tricorne, gear eye-patch, revolver spin), **Pip** (iron grey; red hat inside the cockpit cage, claws clacking). Under each: name, archetype, five 5-pip stat bars. Hovered card plays its taunt. P1 cursor white gear ring, P2 cyan.
- **Stage intro card:** §6, plus both portraits with "P1 / P2 READY".
- **In-game HUD (top strip 640×40, alpha 0.5):** P1 left, P2 right. 24×24 bust portrait; name; **shield strip** 120×2 in brass directly above the health bar (pale when full, dim slow pulse while down); **health bar** 120×8 (`#59C3A0` → `#F2C94C` under 50% → `#FF5C5C` under 25%; white 4f flash on damage; a "ghost" bar drains behind after 20f); **special meter** 120×5 in three segments, filling cyan, full = pulsing white rim, red tint when a special would cost health; **lives** as character icons (goggles / scarf / tricorne / red hat); **score** 7 digits. Center: stage timer and "GO →". **Combo counter** on the player's side: 24px number + grade word, scales 1.3→1.0 over 6f per hit, color climbs grey → yellow → orange → cyan → white. **Enemy health:** 40×3 bar above the head, shown 90f after each hit; elites 60×4 with an armor icon; bosses a 400×10 bottom bar with name plate and phase segments. Pickups show floating "+25" text. With three or four players the strip becomes four 158px columns left to right (P1..P4 in slot order, name above the bar, bars filling rightward); the timer, GO arrow and target readout drop below the strip.
- **Pause:** 60% dim, brass plate: RESUME / MUTE / OPTIONS / MOVES / QUIT TO TITLE, plus a join hint for every free slot (P2 key / P3-P4 any pad button) while a slot is free. MOVES opens the same move list as the training pause plate for whichever heroes are in the run; it is hidden during online co-op, since a screen popped by only one peer's local edge would leave the two peers' screen stacks disagreeing.
- **Game over / continue:** a player at 0 lives shows "CONTINUE? 9…0" on their side, the digit cracking like a gear each second; the partner keeps playing. Both out → frozen screen, grey overlay alpha 0.6, same countdown; Start uses a continue. Expiry: "THE ENGINE WINS." then results with a D-rank ceiling.
- **Results / ranking:** §6.
- **Training room:** TRAINING on the title menu opens character select into the Brass Funicular roof
  stripped of its props, hazards, waves and the rails ring-out, holding one standing practice dummy. Its
  own pause plate swaps the dummy between standing still, blocking with an armored stagger, or fighting
  back as any of the 25 rank-and-file variants; locks its facing so a hero can drill a move that only
  connects from behind; tops up health,
  locks the meter full or empty, and overlays hitboxes and a live startup/active/recovery frame-data
  readout under the HUD. MOVES lists every move with its bound key and a one-line description, the rig
  playing it out beside the row; TRIALS gives each hero a handful of set-piece combos to land — the
  starter combo, a jump-in into a grab, a dodge-cancel into a special, a body throw — ticking off and
  saving alongside board progress.

# 10. Audio Direction

All sound is WebAudio: oscillators (sine/square/saw/triangle), a white-noise buffer through biquad filters, short ADSR envelopes, pitch ramps. **Faction conventions:** Sootborn sounds are *pitchy and organic* (triangle/saw, vibrato, upward squeaks); Brassbound sounds are *metallic and low* (square + ring-mod, bandpassed noise clanks); aether sounds are *glassy* (high detuned sines, long release, slow tremolo).

**SFX list:**
- *Light hit:* 40ms noise burst bandpassed 1.2kHz + 30ms square 220Hz. *Heavy hit:* 80ms noise 600Hz bandpass + sine kick 120→50Hz over 80ms. *Launcher:* heavy hit + rising saw 200→800Hz over 120ms.
- *Brassbound hit:* square 180Hz ring-modulated by 1,300Hz, 120ms. *Tell tick:* three square 1kHz ticks across the wind-up. *Death:* 400ms grinding (noise + square 90Hz) ending in a core pop: sine 2,400Hz, 300ms release.
- *Sootborn hurt:* triangle 600→900Hz chirp with vibrato, 120ms. *Death:* saw 800→200Hz over 300ms.
- *Brunhild hammer:* square 220Hz ring-modded by 1,100Hz, 90ms. *Sael rapier:* saw 2kHz with 60Hz amplitude modulation, 70ms. *Rook revolver:* 20ms noise click + sine 80Hz thump. *Pip piston:* 100ms noise hiss then a 70Hz square thunk; Grapple Shot: 6 square 400Hz blips.
- *Parry:* bell sines 1,760 + 2,640Hz, 250ms decay.
- *Grab:* two 40ms square clicks 150Hz. *Throw:* rising noise whoosh. *Prop break:* 3 noise bursts bandpassed 400–800Hz. *Explosion:* 400ms noise lowpassed 300Hz + sine 60→20Hz.
- *Pickups:* Meat Pie sine C5→E5; score items glassy arpeggio C6–E6–G6; Aether Vial rising saw 200→800Hz. *Super activation:* 8f silence, 30Hz sine swell 300ms with rising noise, noise crash on the freeze; per-character tails (boiler roar / thunderclap / cannon booms / swinging whoosh).
- *Boss tells:* Hoister claw 200ms hydraulic hiss; Regent Engine saw 60→240Hz over 36f; Time Stop 1kHz tick slowing 8Hz→2Hz.

**Music**: a 4-track sequencer (square/triangle bass, saw/pulse lead through a lowpass, detuned-triangle pads, noise drums with a 60Hz sine kick), 16-step patterns, 8-bar loops, "mechanical" swing (odd steps delayed 8%). Motif: the **Calderwick theme**, a rising 4-note figure D–F–A–C, reused in every section. A "combat intensity" harmony lead toggles on during wave locks.
- *Title:* 100 BPM, Dm–B♭–F–C, pads and music-box plucks.
- *Section 1, Sootfoot Docks:* 128 BPM, Dm–B♭–Gm–A, driving square bass, saw lead on the motif, ticking hats as rain.
- *Section 2, Foundry Row:* 140 BPM, Gm–Gm/F♯–E♭–D, kick every beat, hammer clang on 2 and 4, bluesy motif. Drops to bass + clangs when Grubbik appears.
- *Mid-boss (Grubbik):* 150 BPM, Cm–A♭–B♭–Cm, brass-band feel with a mocking pulse-wave whistle counter-melody; half-time drums for the on-foot phase.
- *Section 3, Brass Funicular:* 132 BPM, Am–F–C–G, wide detuned pads, lead an octave up; modulates up a semitone at each pylon crossbar.
- *Section 4, Heart-Engine:* 120 BPM, Em–C–D–Bm, pipe-organ stacked squares, metronome 16th hat, the motif as a hymn. Silent 2s when Vane appears.
- *Final boss (Vane):* Phase 1: 150 BPM waltz in 3/4 (Em–B7–Em–C), harpsichord-like plucks over a ticking clock. Phase 2: 160 BPM in 4/4, same loop with distorted saw bass and doubled kick. Phase 3: 90 BPM half-time, the motif in D minor over a huge pad and a rising sine drone climbing a semitone every 8 bars, then the motif returns in D major for his last 20% HP.
- *Results:* 110 BPM, D–G–A–D, the motif in the major key with brass-like square triads.
