// BESTIARY codex text (issue #26): the player-facing entry behind every enemy and boss card.
//
// One block per enemy def, keyed by the def's own `id` (`${type}:${variant}`), plus one block per BOSS PHASE keyed
// `${id}#${phaseIndex}` — a boss's phases are separate silhouettes with separate reads, and the screen reveals a
// phase's block only once the player has actually reached it (game/bestiary.js phaseSeen).
//
// WHY THIS IS ONE FILE AND NOT 39 EDITS. The codex is prose about a def, not part of it: every line here is a
// restatement of docs/GDD.md sections 3-5 and docs/STAGE2.md..STAGE4.md sections 2-4, and those docs are revised as a
// unit. Keeping the whole book in one place is what makes it checkable — `npm run simtest bestiary` asserts that every
// registered variant and every boss phase has a block, that no block is longer than CODEX_MAX_CHARS, and that nothing
// here keys a def that no longer exists. Spread across the five faction files (each already 30-86 KB of rig drawing)
// the same audit would be a grep across ten modules. index.js merges these onto the defs, so `def.codex` reads exactly
// as if it had been written inline, and makeEnemyDef still passes an inline `codex` through for a def that wants one.
//
// THE CONTRACT EACH BLOCK KEEPS:
//   text      the entry proper, in the board doc's voice. ONE string, wrapped by the screen at its panel width, so a
//             line break is never authored here. Held to CODEX_MAX_CHARS (the issue's "about 120 characters"), which
//             is what keeps a card's detail panel to four lines of the 5x7 pixel font at 640x360.
//   tells     what the player watches for, phrased as the thing on screen ("red lens and a spinning wind-up key"),
//             never as a frame count. The faction tells are the ones docs list as universal, repeated per variant
//             because a player reading one entry has not read the other four.
//   weakness  the counterplay, in the multipliers the sim actually applies (game/fighter.js damage mults, the
//             faction `throwDamageMult` / `damageTaken` fields, and the per-def stagger rules).
//
// `firstSeen` is NOT here on purpose. It is derived from the stage data at load (game/bestiary.js firstSeenOf walks
// every wave, reinforcement, timed wave, prop cargo and event spawn in content/stage/*.js), because a hand-written
// board-and-section note goes stale the first time a wave is re-cut and nothing fails when it does. The hunt hint on a
// locked entry is only useful if it is true.

/** Longest a codex `text` may be. The detail panel is 232px wide at size 1 (38 chars a line), so this is four lines. */
export const CODEX_MAX_CHARS = 150;

/**
 * Codex blocks by def id, and by `${id}#${phase}` for boss phases.
 * @type {Record<string, { text: string, tells: string, weakness: string }>}
 */
export const CODEX = {
  // ================================================================ The Brassbound (GDD 3)
  'brassbound:footman': {
    text: 'Clockwork infantry, wound up and pointed at you. It walks straight in, stops at arm\'s length and swings a wooden club. The machine you are taught on.',
    tells: 'The lens goes red and the wind-up key spins before the swing.',
    weakness: 'Throws hit for 1.5x. Every 4th hit grounded slips a gear and staggers it.',
  },
  'brassbound:halberdier': {
    text: 'A crested machine that holds you at the length of its halberd. Thrusts from out of reach, or crouches and sweeps both lanes at once.',
    tells: 'Halberd raised vertical to thrust; a deep crouch means the sweep.',
    weakness: 'Its one hit of armour is front-facing only. Come from behind, or throw it.',
  },
  'brassbound:sapper': {
    text: 'Copper, stooped under a rack of bombs, and it never comes close. It lobs at where you stood half a second ago and keeps its distance.',
    tells: 'The bomb goes up overhead with a sparking fuse before it is thrown.',
    weakness: 'Any attack bats the bomb back for 20. It drops live bombs when it dies.',
  },
  'brassbound:warden': {
    text: 'A tower shield on legs. Nothing you do while the shield is up moves it, and the bash combo behind it ends on the floor.',
    tells: 'The key spins and the shield glows cyan through the three-hit bash.',
    weakness: 'Every 4th hit staggers it; a launcher in that window strips the shield for good.',
  },
  'brassbound:duelist': {
    text: 'Chrome and a cape, circling just outside your reach. It counts your attacks, and the third one in a row buys you a parry and a flurry.',
    tells: 'Rapier vertical and the lens flashing three times: the riposte stance is up.',
    weakness: 'Wait it out, dodge behind, grab it, or shoot it. Throws hit for 1.5x.',
  },

  // ================================================================ The Sootborn (GDD 4)
  'sootborn:cutthroat': {
    text: 'Goblin stokers bought with coal scrip, and there are always more of them. One stabs while the rest flank on the far lane.',
    tells: 'A white eye-flash, then a 12-frame arm pull-back and a chirp.',
    weakness: 'Fire hurts it 1.5x. It flinches on every hit — this is what combos are made of.',
  },
  'sootborn:slinger': {
    text: 'Stands well back on another lane and swings a sling until it has your range. It will not close, so you have to.',
    tells: 'Three loops of the sling over 36 frames before the bolt goes out.',
    weakness: 'Any attack reflects the bolt for 12. Get within 50px and it panics for a free punish.',
  },
  'sootborn:firebrand': {
    text: 'A fuel tank strapped to a goblin with a nozzle. The cone sets you alight and leaves fire burning on the floor behind it.',
    tells: 'The pilot light pops bigger for 24 frames before the cone.',
    weakness: 'The tank goes off 30 frames after it dies: grab the body and throw it into the crowd.',
  },
  'sootborn:hulk': {
    text: 'The clan\'s big one, chained at the wrists, swinging an anvil on a handle. If it gets hold of you it squeezes until someone breaks it off.',
    tells: 'The club goes overhead for 36 frames; arms spread wide is the grab.',
    weakness: 'Flinches every 3rd hit and a launcher stuns it for 45. Only Pip can grab it.',
  },
  'sootborn:wrangler': {
    text: 'A goblin in a stolen top hat who would rather tie you up than hit you. Whips from range, and nets whoever is doing best.',
    tells: 'The net spun overhead for 30 frames; an arm raised is the whip.',
    weakness: 'It backsteps off whiffs, so stop whiffing: dash attacks and grabs beat it outright.',
  },

  // ================================================================ The Stormcrows (STAGE2 2)
  'stormcrow:deckhand': {
    text: 'Pressed crew, not Wing: the one Stormcrow who does not keep his feet. A two-part club stroke and a shoulder barge, and that is all he has.',
    tells: 'A hot white sighting lens, same as the rest of the deck.',
    weakness: 'He flinches on every hit and weighs 0.8 — he is what you throw off the Spine.',
  },
  'stormcrow:crimper': {
    text: 'The fodder with a boat hook. Jabs at range, hooks both your feet out from under you, and lunges in on a pop of the wing-pack.',
    tells: 'An 18-frame tell on the jab; the wing-pack pops for the lunge.',
    weakness: 'Flanks on both lanes but has no armour. Fastest faction to simply out-damage.',
  },
  'stormcrow:corsair': {
    text: 'Holds 150px down the lane with a reel-gun and makes you walk into it. Butt-strokes anything that gets inside the barrel.',
    tells: '24 frames sighting down the barrel before the harpoon goes out.',
    weakness: 'Any attack bats the harpoon back for 14, exactly like the Slinger\'s bolt.',
  },
  'stormcrow:grapnel': {
    text: 'The Quartermaster\'s trick in miniature. The iron goes out flat down the lane and reels you back along it into three squeezes and a throw.',
    tells: '28 frames whirling the iron up behind him, lenses lit.',
    weakness: 'Not reflectable. Hit him in the 30 frames he spends paying out line and it drops slack.',
  },
  'stormcrow:bosun': {
    text: 'A four-link chain that goes round in a full circle, so standing behind him is not standing anywhere. Lobs powder kegs that catch his own side.',
    tells: 'The chain winds up overhead; the keg is thrown at where you were.',
    weakness: 'Only flinches every 2nd hit. Let the kegs do your work on the crowd around him.',
  },
  'stormcrow:galewright': {
    text: 'A storm coil on a long charge and an arc 130px down the lane that leaves you standing still for half a second.',
    tells: 'The lens grows and ramps violet to hot white, then blinks in the last 14 frames.',
    weakness: 'Slow and loud on purpose: the answer is to not be in the lane when it lands.',
  },
  'stormcrow:marine': {
    text: 'The top of the ladder. Boarding axe, a three-vane wing-plate on the off hand, and a shove that chains into a chop that puts you down.',
    tells: 'Signal gold on six carriers and a hot white lens under a grilled muzzle.',
    weakness: 'Every 4th hit staggers him; a launcher then blows the plate apart for good.',
  },

  // ================================================================ The Chandlery of Calderwick (STAGE3 2)
  'chandler:wickboy': {
    text: 'Nothing here kills you; everything here keeps the thing that kills you standing up. He relights an ally 4 health at a time and cancels its stagger.',
    tells: 'The lamp goes from idle green to rite lime and a cone lands on the floor.',
    weakness: 'He steals your punish, so take him first. 40 health and no armour at all.',
  },
  'chandler:tallyman': {
    text: 'Writes you into the ledger. The numeral lands on one hero and every enemy on the board re-points at them until it is rubbed out.',
    tells: 'Chalk out and a lime cone on the floor where the tally is going.',
    weakness: 'Ranged and fragile. In co-op the marked hero runs and the other one kills him.',
  },
  'chandler:limeburner': {
    text: 'Crusts his own side in quicklime: the ally he slakes gets an Iron Warden\'s four-hit armour whether it came with one or not.',
    tells: 'The lamp lime and the rake raised over the machine he is working on.',
    weakness: 'The shell is pre-applied, so a rimmed body is readable before you commit a throw.',
  },
  'chandler:purser': {
    text: 'The company officer with the dram flask. Doses two allies at once: more damage, more speed, and barely any cooldown left between their attacks.',
    tells: 'The flask up and the lamp lime over the pair he is dosing.',
    weakness: 'The dose is the threat, not the man. He has 95 health and a backhand flick.',
  },
  'chandler:resurrectionist': {
    text: 'Tips whatever army this board has already buried back out of his handcart, on its own feet, for as long as he is standing.',
    tells: 'The cart tongs and the lime cone over the ground he is about to crew.',
    weakness: 'Kill him and the cart stops. Leave him and the wave has no bottom.',
  },
  'chandler:runner': {
    text: 'He is not here for you. He sprints to a Chandler mid-rite and lights the lamp, and the rite finishes at two and a half times the speed.',
    tells: 'A lit taper held out, running past you toward somebody else\'s rite.',
    weakness: '35 health and a taper jab between errands. Cut him down on the way.',
  },
  'chandler:drayman': {
    text: 'Heaves a handcart in behind him and shoves it 180px down your lane. The cart stays where it stops, breakable, and he can shove it again.',
    tells: 'The shoulder into the cart bed, and the cart already rolling.',
    weakness: 'Two carts is his limit; with both out he has to come to you with the grab set.',
  },

  // ================================================================ The Gleaning (STAGE4 2)
  'gleaning:picker': {
    text: 'The guild\'s ground crew: a kerchief, a pick and a sack, and no bladder at all. The only Gleaner you can grab whenever you like.',
    tells: 'No bladder overhead — which is itself the tell on this board.',
    weakness: '30 health, grounded, grabbable. The one Gleaner the sky rule does not protect.',
  },
  'gleaning:chaff': {
    text: 'Bounces at you on a half-full bag. The flying kick whiffs under a low poke and always lands inside its own punish window.',
    tells: 'The bladder swells and the gas lights above the head before it leaves the deck.',
    weakness: 'Hit it in the air for 1.5x and juggle it. The landing is the free hit.',
  },
  'gleaning:winnow': {
    text: 'Cranks up to the hang line and drops three ballast bags, re-aimed between each one. It never has to come down to hurt you.',
    tells: 'The bag lit and taut as it hauls up out of your reach.',
    weakness: 'Airborne is 1.5x on this board. Anti-air is not a tactic here, it is the tactic.',
  },
  'gleaning:thresher': {
    text: 'The shadow that dives. There is no hitbox on the way down: the damage is the shockwave where it lands, so the floor is the attack.',
    tells: 'A shadow growing on the deck under a bladder 100px up.',
    weakness: 'Only flinches every 2nd hit, but the landing recovery is long and grabbable.',
  },
  'gleaning:sickle': {
    text: 'Kites at 96px and casts a hook line that drags you in, nets you, and robs a purse of meter before she runs for the edge.',
    tells: 'The bag hitched every 48 frames; the line drawn back before the cast.',
    weakness: 'She carries the bag weak point but never leaves the deck: this one you can chase.',
  },
  'gleaning:harvestman': {
    text: 'Hangs 40 frames over the fight and calls two more Chaff down out of the sky on top of you. The guild\'s elite, and it does not fight alone.',
    tells: 'The hang itself: 40 frames of a lit bladder holding station overhead.',
    weakness: 'Shoot it down. It takes 1.5x for every frame it spends up there.',
  },
  'gleaning:riggerman': {
    text: 'Hauls to the hang line and drops a net that pins you for 90 frames, then glides in and lands beside the man he pinned.',
    tells: 'The net gathered under a bladder at the top of the haul.',
    weakness: 'That landing is a 1.5x grabbable window — and the reason to break the net fast.',
  },

  // ================================================================ Board 1 bosses (GDD 5)
  'midboss': {
    text: 'The goblin foreman who sells his own clans to Vane, in a stolen cargo-loader. A claw, a chain hook, and crates dropped on your shadow.',
    tells: 'A hydraulic hiss on the claw; both arms up is the ground pound.',
    weakness: 'Below 200 it overheats: every 3rd attack stalls 70 frames with the cage open at 3x.',
  },
  'midboss#2': {
    text: 'Out of the cage and on his own feet, fighting like a Gutter Wrangler with a whistle and a hat to throw. A victory lap, and he knows it.',
    tells: 'The whistle before three Cutthroats arrive; the hat comes back.',
    weakness: 'No armour and 100 health. He drops his badge and runs when it is over.',
  },
  'boss': {
    text: 'The Aetherwright, in a tripod walker bolted onto the Heart-Engine itself. Only the legs take damage, and he will stop time to make sure of it.',
    tells: 'A leg rising with a growing shadow; the pocket watch raised for the time stop.',
    weakness: 'Dodge in the last 10 frames of the watch tell. The wall valves stun him 60.',
  },
  'boss#1': {
    text: 'The legs are gone and the body is on the floor at last. A gear-saw sweeping one marked lane at a time, and a fan of bolts from the chest.',
    tells: 'A rising whine as the saw spins up; a cyan line marks the lane it takes.',
    weakness: 'The core cover opens every 150 damage: core hits do 2x and the saw jams 50.',
  },
  'boss#2': {
    text: 'The Engine is scrap and the man is out of it — cane-sword, clockwork arm, and a pocket watch he now has to throw at you himself.',
    tells: 'A bow with a flourish before the cane string; a cyan puff is the step.',
    weakness: 'Grabbable, no armour. 60 damage in one combo and he teleports out.',
  },

  // ================================================================ Board 2 bosses (STAGE2 3-4)
  'midboss2': {
    text: 'The Wing\'s quartermaster strapped into the freighter\'s own cargo winch: a drum of chain on a harness with a grapnel on the end.',
    tells: 'A 28-frame wind-up over the head; the chain hauled back for the grapnel.',
    weakness: 'Every 3rd attack the drum jams for 80 frames: 3x damage, and grabbable out of it.',
  },
  'midboss2#1': {
    text: 'The harness blows its pins and drops off her back. She is a Stormcrow at 1.3x with nothing on her, and she dodges 40% of what you throw.',
    tells: 'The chop that rises into a rip; the wing-pack for the swoop.',
    weakness: 'No armour and grabbable. Her rally brings two Crimpers, so do not take your time.',
  },
  'boss2': {
    text: 'A professional, not a warlord. Bicorne athwart, a storm lance, and the guns of her own flagship walking shells down the deck you are standing on.',
    tells: '34 frames with the lance overhead before the broadside.',
    weakness: 'Move along the lane, not across it. The shells hit her own boarders too.',
  },
  'boss2#1': {
    text: 'The wing-harness opens into four violet-lit vanes and the deck edge starts venting. Super armour, no launch, and the floor is smaller now.',
    tells: 'A 40-frame charge on the coil before the lane bolt.',
    weakness: '60 damage in one combo and she gale-steps behind you — so watch your own back.',
  },
  'boss2#2': {
    text: 'Bare-headed in a red waistcoat with a torn ribbon at her brow, a lance, and a burning bridge. The ladder ends in the person.',
    tells: 'Nothing left above the shoulder but her own hair.',
    weakness: 'No armour, no wings, no ship. Just her.',
  },

  // ================================================================ Board 3 bosses (STAGE3 3-4)
  'midboss3': {
    text: 'The works\' yardmaster with the yard\'s own wheeled draw-kiln strapped across her back, burning whatever it is aimed at.',
    tells: 'The kiln mouth flashing a cone on the floor before it draws.',
    weakness: 'Every 3rd attack it over-draws and stands open 80 frames at 3x, grabbable.',
  },
  'midboss3#1': {
    text: 'The straps blow and the kiln comes off her back. What is left is a Limeburner who is faster than any of the ones outside.',
    tells: 'The rake carried low now, with nothing above the shoulder line.',
    weakness: 'No machine, no armour, 170 health.',
  },
  'boss3': {
    text: 'Not a warlord and not an officer: an agent with a signature, who has never been in a fight and has been paid for every one of them.',
    tells: '34 frames with the chalk out before the tally lands on a hero.',
    weakness: 'His power is the room, not the man. The bell brings the company — kill what it brings.',
  },
  'boss3#1': {
    text: 'Cap off, sleeves rolled, the yard\'s kiln-lamp harness lit on his chest: the man doing the work himself for the first time in his life.',
    tells: 'The lamp on his chest lit rite lime, on him rather than on an ally.',
    weakness: 'There is nothing left on the field for him to make stronger.',
  },
  'boss3#2': {
    text: 'The ledger, and the man holding onto it. Everything the company was is now one book and one signature, and neither of them can fight.',
    tells: 'The book open, the cane forgotten.',
    weakness: 'Grabbable and out of people to pay.',
  },

  // ================================================================ Board 4 bosses (STAGE4 3-4)
  'midboss4': {
    text: 'The guild officer who prices the crop, fighting inside the field baler she normally walks beside: a press drum, a ram arm and a full bladder over it.',
    tells: 'The press going up to the hang line before it comes down on you.',
    weakness: 'Every 3rd attack the drum over-presses: 80 frames open at 3x, and grabbable.',
  },
  'midboss4#1': {
    text: 'The yoke goes and the drum comes off. The officer with a bale hook and half a bag, and the fastest thing on this board.',
    tells: 'The long call before two Chaff come down beside her. Twice a fight, no more.',
    weakness: 'The first Gleaner you fight with no machine on: grabbable, and she has 170.',
  },
  'boss4': {
    text: 'The guild\'s head, who has not touched the ground during any of the four boards. The widest silhouette in the game, and he drifts rather than walks.',
    tells: 'The pole gaff drawn across for the canopy sweep; the HARVEST call for the loft.',
    weakness: 'He calls three times and no more. Everything he drops has to land eventually.',
  },
  'boss4#1': {
    text: 'The canopy is holed and venting. He is fast and low, hopping the length of the arena on a bag that will not hold him up any more.',
    tells: 'The bag going slack, then the vent that stalls him while it re-pressurises.',
    weakness: 'The board\'s own rule finally applies to him: airborne, and 1.5x for all of it.',
  },
  'boss4#2': {
    text: 'No bag at all. A man in a hood with a hook and a bag of other people\'s things, on the floor, quick, and the smallest thing you fight all game.',
    tells: 'The underarm lob of somebody\'s window weight.',
    weakness: 'Grabbable. Send the window weight home for 26.',
  },
};

/** Every key in CODEX, for the completeness test in tools/simtest.js. */
export const CODEX_KEYS = Object.keys(CODEX);
