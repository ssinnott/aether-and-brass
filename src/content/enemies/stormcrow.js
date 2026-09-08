// Stage 2 enemy faction: THE STORMCROWS (docs/STAGE2.md section 2) — the Concordat's Ninth Aeronaut Wing, flying
// black over the re-opened sky. Rig, palette and base animation set come from ./stormcrowRig.js, the per-aeronaut
// gear from ./stormcrowKit.js; this file is the five variants, their hand-keyed attacks, projectiles and AI tables.
//
// Type identity: SKY PRIVATEERS. Not a regiment — a press-ganged crew of freebooters in their own weather-beaten
// kit, and the art says so: five silhouettes, five headgears, five back pieces, five sleeve colours, five stances.
// What holds them together is the kit language (the Wing armband, the brass badge, goggles or a lens on every head,
// violet static as the only energy colour) and the way they fight: they give ground, they hop back out of a
// whiffed swing, they keep their feet.
// Two ladders run up the five, and both point the same way — at the Marine:
//  - RANK COLOUR heats one step per rate (WATCH below) and the marks that carry it multiply and climb the body:
//    1 carrier on the Crimper (armband) -> 2 on the Corsair (+ hatband) -> 3 on the Bosun (brow band, smock
//    collar, waist sash) -> 4 on the Galewright (brow band, gorget, armband, lace) -> 6 on the Marine (crest
//    edge, cuirass band, armband, cuff, lace, wing-plate boss).
//  - THE HIGHER THE RATE, THE MORE SEALED THE MASK: bandana with the goggles up, goggles under the brim, one eye
//    behind a brass loupe, then a sealed keel visor and a sealed iron muzzle with a hot-white sighting lens.
// Rank colour is the ONLY high-chroma warm left on a rig: every scarf and the Crimper's bandana are neutral, so
// nothing on the deck competes with the mark that says who is in charge.
// Faction rules:
//  - JUMP ATTACKS DO 1.5x. A Stormcrow covers the deck, not the air above it: go over the top.
//  - At most 2 attack at once (tokenGroup 'stormcrow'); the rest circle on the other z lane.
//  - Every variant backsteps after two whiffed player attacks nearby, so mashing into them is punished by distance.
//
// | Variant          | HP  | Dmg | Speed | Read                                                          |
// |------------------|-----|-----|-------|----------------------------------------------------------------|
// | Deck Crimper     |  45 |   6 | 1.20x | bandana + boat hook; jab, low sweep that trips; the fodder      |
// | Line Corsair     |  40 |   9 | 1.15x | slouch hat, line drum; ANY attack bats the harpoon back         |
// | Powder Bosun     |  85 |  14 | 0.85x | bald, bearded, keg on his back; chain shot, lobbed powder       |
// | Galewright       |  90 |  12 | 1.00x | lens visor, lightning rods; a long charge, then a stunning arc  |
// | Ironwing Marine  | 190 |  16 | 0.70x | crested helm, wing-plate: super armour until a launcher strips  |
import { frontBox, areaBox, makeEnemyDef } from './common.js';
import { CROW, CROW_PAL, CROW_PROPS, crowScarf, crowTails, crowWings, makeCrowBase, crowStrike } from './stormcrowRig.js';
import {
  CROW_PARTS, crowLines, crowReel, crowKeg, crowBandolier, crowRods,
  drawBoatHook, drawLineGun, drawChainShot, drawCoilRod, drawBoardingAxe, drawWingShield,
} from './stormcrowKit.js';
import { pathPoly, paint, line } from '../../art/shapes.js';
import { particles } from '../../engine/particles.js';
import { audio } from '../../engine/audio.js';
import { ST } from '../../constants.js';

const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, once: true, ...(extra || {}) });
/** drawFace options for the one variant with a beard over his mouth (ART_STYLE section 6). */
const BEARDED = { noMouth: true };
/**
 * THE RATE LADDER. One warm ramp, heated a step per rate — brick rust, ember red, flame orange, signal amber, hot
 * gold. It survives a squint, a 0.5x downscale and colourblindness because it is a brightness ramp, not five
 * arbitrary hues, and every rung is a hue-family jump from its own coat (rust vs slate-blue, ember vs teal, flame
 * vs grey-plum, amber vs violet, gold vs navy).
 * Relative luminance 17.3 / 21.2 / 29.6 / 40.2 / 64.8 and hue 13 / 20 / 28 / 34 / 44 degrees: BOTH climb at every
 * rung, so no two rates collapse into one step. Three of the five numbers are load-bearing:
 *  - rung 1 was 13.0, which on a 61.5 canvas sleeve read as a plain leather strap and left the ladder starting at
 *    nothing on the 0.5x squint. It is lifted, not recoloured: the Crimper still carries ONE mark, on the armband.
 *  - rungs 2 and 3 were 11% and 9 degrees apart, i.e. one orange twice; they are now 28% and 8 degrees apart.
 *  - rung 5 was #F6C24A, inside 25% of board 2's own deck-rail hazard chevrons (#C4913A / #A28642) that the
 *    Marine's crest passes in front of at head height. #F8CE58 clears both, without going so pale that its cel
 *    highlight cap turns the crest into a second near-white mark competing with the sighting lens.
 * Each variant carries it in BOTH `build.clan` and `palette.rank` — same literal; `palette.rank` is what the limb
 * hooks read, because farPalette shades it once at buildRig so the far arm's band darkens for free.
 */
export const WATCH = { crimper: '#B8563C', corsair: '#C9612C', bosun: '#DE7A22', galewright: '#E89A34', marine: '#F8CE58' };

// ---------------------------------------------------------------- projectiles
/** Harpoon on a reel line: a pewter dart trailing rope back the way it came (pale once batted back). */
function drawHarpoon(ctx, p, sx, sy) {
  const y = sy - p.r, d = p.facing;
  line(ctx, sx - d * 26, y, sx, y, p.reflected ? '#E8DCC0' : CROW.rope, 1.5);
  ctx.save(); ctx.translate(sx, y); ctx.scale(d, 1);
  pathPoly(ctx, [-14, -2, 6, -2, 12, 0, 6, 2, -14, 2]); paint(ctx, p.reflected ? '#E8E8F0' : CROW.pewter, CROW.outline, 1);
  pathPoly(ctx, [-14, -5, -8, 0, -14, 5]); paint(ctx, CROW.pewterDark, CROW.outline, 1);
  ctx.restore();
}
/**
 * Line Corsair harpoon. Reflectable like the Scrap Slinger's bolt: batting it back is the whole answer to a Corsair
 * holding the far end of the deck. The generic reflect adds a lob (it assumes a bomb), which would sail a flat
 * harpoon over the Corsair's head, so `onReflect` flattens the flight again.
 */
const HARPOON = {
  style: 'bolt', speed: 5.5, damage: 9, type: 'medium', kbX: 6, kbY: 0, hitstun: 18, maxDist: 360, life: 130,
  offsetX: 20, offsetY: 48, r: 6, muzzle: false, color: CROW.pewter, draw: drawHarpoon,
  reflectable: true, damageOnReflect: 14, reflectSpeed: 8,
  onReflect(p) { p.vy = 0; p.gravity = 0; p.maxDist = 360; p.startX = p.x; },
};
/** Powder keg: lobbed at where the player was 20 frames ago, bounces once, then goes off on everyone (friendly). */
const KEG = {
  style: 'bomb', aimAt: true, flight: 46, gravity: 0.4, noContactHit: true, bounces: 1, rest: true, life: 96,
  onExpire: 'explode', radius: 36, r: 7, muzzle: false, offsetX: 6, offsetY: 60, color: '#4A3A2E',
  explodeHit: hit(14, 'knockdown', 4, 4, 22, { friendly: true }),
  reflectable: true, damageOnReflect: 22, reflectSpeed: 6,
};

// ---------------------------------------------------------------- shared def assembly
const BASE = {
  type: 'stormcrow', faction: 'stormcrow', walkSpeed: 1.7,
  build: {
    scale: 0.95, palette: CROW_PAL, outline: CROW.outline, outlineWidth: 1, proportions: CROW_PROPS,
    parts: CROW_PARTS, smearColor: '#DCE6F4', clan: WATCH.crimper,
  },
  sfx: { hurt: 'crow_hurt', death: 'crow_death' },
  ai: {
    attackRange: 42, zTolerance: 13, retreatChance: 0.3, attackCooldown: [40, 85], aggression: 0.6, firstAttackDelay: 42,
    flank: true, tokenGroup: 'stormcrow', maxAttackers: 2,
    backstepAfterWhiffs: { whiffs: 2, dist: 46, iframes: 8, cooldown: 70, range: 110 },
  },
};
/**
 * Rig flags the art reads: the wing vanes flare on any hop / lunge, the goggle glass lights on tell frames, and
 * `rig.down` says the aeronaut is dead so the two sealed helms can put their lens out and keep it out. fighter.js
 * stops calling onUpdate once `dead` is set, so the flag latches on death and clears itself when the rig is reused
 * — which is why every variant hook must call BASE_HOOKS.onUpdate first (galeHooks and corsairHooks do).
 */
const BASE_HOOKS = {
  onUpdate(f) {
    const n = f.anim.name;
    f.rig.wings = f.state === ST.DODGE || f.airborne || n === 'lunge' || n === 'gale' || n === 'shove';
    f.rig.down = false;
  },
  onDeath(f) { f.rig.down = true; },
};
/** Assemble a Stormcrow variant: faction traits + hooks on top of makeEnemyDef. */
function def(v, hooks) {
  const d = makeEnemyDef(BASE, v);
  d.traits = { jumpAttackTakenMult: 1.5, ...(v.traits || {}) };
  d.hooks = { ...BASE_HOOKS, ...(hooks || {}) };
  return d;
}
/** Base set (stance + carry) + the variant's hand-keyed attacks. */
function crowAnims(carry, stance, attacks) {
  const anims = makeCrowBase(carry, stance);
  Object.assign(anims, attacks);
  anims.flee = anims.run;
  return anims;
}

// ---------------------------------------------------------------- C1 Deck Crimper: bandana, cut-down jerkin, boat hook
// The youngest hand on the deck: bare-armed, eager, leaning into everything. Back piece: a coil of boarding line.
const CRIMP_CARRY = { armR: [26, 26], weapon: -20, armL: [-26, -16] };
const CRIMP_STANCE = { lean: 7, head: -3, legR: [10, 6], legL: [-10, 8] };
const crimperAnims = crowAnims(CRIMP_CARRY, CRIMP_STANCE, {
  // jab: 18f of the hook cocking back past the ear (goggles lit) -> 8f thrust -> 3f hold -> 20f punish window
  jab: crowStrike({
    tell: 18, active: 8, recovery: 20, carry: CRIMP_CARRY, lean: 7, tellSfx: 'crow_call', sfx: 'whiff',
    hitbox: frontBox(50, hit(6, 'light', 4, 0, 16)), fx: [{ kind: 'spark', x: 48, y: 42, count: 2 }],
    w1: { armR: [-24, 70], weapon: -43, armL: [36, 26], torso: -4, head: -4, root: [-3, 0], legR: [12, 10], legL: [-16, 12], face: 'angry' },
    w2: { armR: [-40, 86], weapon: -51, armL: [48, 30], torso: -12, head: -2, root: [-6, 1], legR: [8, 10], legL: [-20, 14], squash: 0.97, stretch: 1.03, face: 'angry' },
    h: { armR: [64, -6], weapon: -5, armL: [-42, 22], torso: 22, head: 4, root: [6, 1], legR: [44, 10], legL: [-32, 34], face: 'shout', squash: 1.04, stretch: 0.97 },
    smear: { from: 56, to: 10, a: 0.35, r: 58 },
    hold: { armR: [67, -4], weapon: 6, armL: [-44, 22], torso: 25, head: 5, root: [7, 1], legR: [44, 10], legL: [-32, 34], face: 'shout' },
    r: { armR: [51, 8], weapon: -6, armL: [-32, 18], torso: 17, head: 2, root: [4, 1], legR: [38, 10], legL: [-28, 30], face: 'grit' },
  }),
  // sweep: 22f raising the pole over the shoulder -> he rakes it along the deck at shin height (trips = knockdown)
  sweep: crowStrike({
    tell: 22, active: 10, recovery: 26, carry: CRIMP_CARRY, lean: 7, tellSfx: 'crow_call', sfx: 'whiff',
    hitbox: frontBox(54, hit(8, 'knockdown', 3, 4, 22), { low: true }), fx: [{ kind: 'dust', x: 34, y: 0, count: 4 }],
    w1: { armR: [-136, -18], weapon: 34, armL: [40, 20], torso: -12, head: -8, root: [-3, 0], legR: [10, 8], legL: [-16, 12], face: 'angry' },
    w2: { armR: [-166, -8], weapon: 46, armL: [52, 26], torso: -20, head: -6, root: [-6, 1], legR: [6, 8], legL: [-20, 14], squash: 0.96, stretch: 1.04, face: 'angry' },
    h: { armR: [-2, 6], weapon: -48, armL: [-32, 22], torso: 30, head: 10, root: [5, 3], legR: [52, 22], legL: [-38, 46], face: 'shout', squash: 1.07, stretch: 0.94 },
    smear: { from: -76, to: 56, a: 0.5, r: 64 },
    hold: { armR: [4, 6], weapon: -38, armL: [-34, 22], torso: 32, head: 10, root: [6, 3], legR: [52, 22], legL: [-38, 46], face: 'shout' },
    r: { armR: [-2, 10], weapon: -48, armL: [-26, 16], torso: 22, head: 6, root: [4, 2], legR: [42, 18], legL: [-32, 40], face: 'grit' },
  }),
  // lunge: the pack charge from mid range — he crouches, then throws himself down the deck behind the spike
  lunge: crowStrike({
    tell: 16, active: 10, recovery: 24, carry: CRIMP_CARRY, lean: 7, tellSfx: 'crow_call', sfx: 'whiff',
    hitbox: frontBox(46, hit(7, 'medium', 5, 0, 18)), move: { x: 6 }, fx: [{ kind: 'dust', x: -10, y: 0, count: 3 }],
    w1: { armR: [-10, 40], weapon: -44, armL: [30, 30], torso: 16, head: -8, root: [-2, 2], legR: [26, 30], legL: [-14, 26], squash: 1.06, stretch: 0.95, face: 'angry' },
    w2: { armR: [-20, 44], weapon: -58, armL: [38, 34], torso: 8, head: -10, root: [-5, 3], legR: [22, 36], legL: [-18, 32], squash: 1.09, stretch: 0.92, face: 'angry' },
    h: { armR: [50, -10], weapon: -8, armL: [-60, 20], torso: 42, head: -6, root: [6, 5], legR: [56, 10], legL: [-46, 50], face: 'shout', squash: 0.96, stretch: 1.04 },
    smear: { from: 58, to: 8, a: 0.4, r: 56 },
    hold: { armR: [56, -8], weapon: 0, armL: [-52, 20], torso: 38, head: -4, root: [6, 4], legR: [40, 20], legL: [-30, 40], face: 'shout' },
    r: { armR: [44, 6], weapon: -6, armL: [-30, 16], torso: 26, head: -2, root: [4, 2], legR: [34, 10], legL: [-24, 26], face: 'grit' },
  }),
});
const crimper = def({
  variant: 'crimper', name: 'DECK CRIMPER', role: 'rusher', hp: 45, damage: 1, speed: 1.2, score: 150, drops: 'none',
  build: { ...BASE.build, clan: WATCH.crimper,
    palette: { ...CROW_PAL, hair: '#4A3226', rank: WATCH.crimper },
    // rating: ONE rank carrier, the armband. The bandana is a dirty rag (hatBandana draws it neutral) and the
    // scarf is plain strap leather — nothing above his collar says anything about rank. NOT CROW.rope: that is the
    // exact colour of the boarding-line coil on the same shoulder and only 6.5% off the throat it sits under, so
    // collar, coil and sleeve merged into one pale mass. CROW.strap is 66% off his skin and 60% off the coil.
    crow: { head: 'bandana', coat: 'jerkin', hair: 'crop', scarf: CROW.strap, scarfLen: 2 },
    weapon: { attach: 'handR', length: 50, draw: drawBoatHook, headAt: 44 },
    accessories: [{ attach: 'back', draw: crowLines }, { attach: 'torso', draw: crowScarf }] },
  anims: crimperAnims,
  ai: { attackRange: 44, attacks: [{ anim: 'jab', range: 56, weight: 4 }, { anim: 'sweep', range: 50, weight: 2 }, { anim: 'lunge', range: 110, minRange: 64, weight: 2 }], attackCooldown: [34, 72] },
});

// ---------------------------------------------------------------- C2 Line Corsair: slouch hat, teal oilskin, harpoon gun
// Tall and lanky, weight on the back foot, a tarred queue down his back and the reel drum riding his shoulder.
const CORSAIR_CARRY = { armR: [22, 30], weapon: -30, armL: [-24, -20], grip: 0 };
const CORSAIR_STANCE = { lean: 0, head: 1, legR: [6, 4], legL: [-12, 10] };
const corsairAnims = crowAnims(CORSAIR_CARRY, CORSAIR_STANCE, {
  // harpoon: 24f shouldering the gun and sighting down the lane -> the shot (with a recoil hold) -> 26f reeling in
  harpoon: crowStrike({
    tell: 24, active: 6, recovery: 26, carry: CORSAIR_CARRY, lean: 0, tellSfx: 'coil_charge', sfx: 'harpoon',
    event: 'spawnProjectile', projectile: HARPOON, fx: [{ kind: 'spark', x: 40, y: 48, count: 3 }],
    w1: { armR: [66, -18], weapon: -44, armL: [56, 40], torso: -2, head: 2, root: [-2, 0], legR: [12, 8], legL: [-16, 10], face: 'angry' },
    w2: { armR: [86, -8], weapon: -10, armL: [72, 46], torso: 2, head: 3, root: [-4, 0], legR: [10, 8], legL: [-18, 12], face: 'angry', squash: 0.98, stretch: 1.02 },
    h: { armR: [92, -4], weapon: 4, armL: [76, 44], torso: 6, head: 4, root: [-5, 0], legR: [14, 6], legL: [-20, 14], face: 'shout', squash: 0.97, stretch: 1.03 },
    smear: { from: 16, to: -6, a: 0.3, r: 46 },   // 22 deg: a recoil is a small arc, but under 20 the smear rule reads it as radians
    hold: { armR: [82, 6], weapon: -6, armL: [64, 40], torso: -4, head: 0, root: [-8, 0], legR: [16, 6], legL: [-22, 16], face: 'shout' },
    r: { armR: [40, 30], weapon: -8, armL: [-18, 10], torso: 6, head: 0, root: [-2, 1], legR: [12, 6], legL: [-16, 12], face: 'grit' },
  }),
  // butt-stroke: the panicky answer when a hero is inside the gun's minimum range
  butt: crowStrike({
    tell: 12, active: 7, recovery: 20, carry: CORSAIR_CARRY, lean: 0, sfx: 'whiff',
    hitbox: frontBox(34, hit(6, 'light', 4, 0, 14)),
    w1: { armR: [-28, 92], weapon: -4, armL: [32, 20], torso: -8, head: -4, root: [-2, 1], legR: [10, 8], legL: [-12, 10], face: 'angry' },
    w2: { armR: [-46, 104], weapon: -16, armL: [42, 24], torso: -14, head: -2, root: [-4, 1], legR: [8, 8], legL: [-14, 12], squash: 0.97, stretch: 1.03, face: 'angry' },
    h: { armR: [34, 66], weapon: 10, armL: [-30, 12], torso: 20, head: 6, root: [5, 0], legR: [38, 10], legL: [-26, 22], face: 'shout', squash: 1.04, stretch: 0.97 },
    smear: { from: 46, to: -30, a: 0.4, r: 42 },
    hold: { armR: [40, 62], weapon: 16, armL: [-32, 12], torso: 22, head: 6, root: [5, 0], legR: [38, 10], legL: [-26, 22], face: 'shout' },
    r: { armR: [36, 54], weapon: 14, armL: [-26, 10], torso: 14, head: 2, root: [3, 1], legR: [30, 10], legL: [-22, 20], face: 'grit' },
  }),
});
/** The harpoon is drawn seated in the gun until the shot frame fires it. */
const corsairHooks = {
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    f.rig.fired = f.anim.name === 'harpoon' && f.anim.frameIndex >= 2;
  },
};
const corsair = def({
  variant: 'corsair', name: 'LINE CORSAIR', role: 'ranged', hp: 40, damage: 1, speed: 1.15, score: 200, drops: 'none',
  build: { ...BASE.build, scale: 0.93, clan: WATCH.corsair,
    // teal at the same value, chroma only (L* 49.7 -> 47.9, s 44 -> 70); the trousers leave the neutral core and
    // the hair comes up off the outline (#33241F was 4.0 Oklab L* over it, so his own line died in his hair).
    palette: { ...CROW_PAL, primary: '#21696E', sleeve: '#C9B79A', secondary: '#5F80C4', hair: '#4A382A', rank: WATCH.corsair },
    proportions: { ...CROW_PROPS, headR: 8, torsoW: 19, torsoH: 26, hip: 16, upperLeg: 18, lowerLeg: 17, upperArm: 15, lowerArm: 14, armR: 3.8, legR: 4.6 },
    // petty officer: armband + hatband, the first rate whose colour reaches the head. The scarf goes neutral
    // strap — it used to wear the Crimper's old rank red, which is exactly how the ladder went soft.
    crow: { head: 'slouch', coat: 'oilskin', hair: 'queue', scarf: CROW.strap, scarfLen: 2, tailLen: 26 },
    weapon: { attach: 'handR', length: 40, draw: drawLineGun, headAt: 32 },
    accessories: [{ attach: 'back', draw: crowReel }, { attach: 'back', draw: crowTails }, { attach: 'torso', draw: crowScarf }] },
  anims: corsairAnims,
  ai: { attackRange: 32, attacks: [{ anim: 'butt', range: 40, weight: 1 }],
    ranged: { anim: 'harpoon', minRange: 110, maxRange: 330, cooldown: 160, zAlign: true, keep: 150 },
    retreatBudget: 140, retreatChance: 0.2, evadeChance: 0.25, evadeCooldown: 120 },
}, corsairHooks);

// ---------------------------------------------------------------- C3 Powder Bosun: bald, bearded, powder smock + keg
// Barrel-chested and short-legged, planted wide; the only one with bare arms to the shoulder and a beard.
const BOSUN_CARRY = { armR: [30, 22], weapon: 10, armL: [-22, -14] };
const BOSUN_STANCE = { lean: 9, head: -1, legR: [14, 6], legL: [-14, 8] };
const bosunAnims = crowAnims(BOSUN_CARRY, BOSUN_STANCE, {
  // chain shot: 26f winding the chain up over his head -> a full circle that hits BOTH sides -> 30f punish
  chain: crowStrike({
    tell: 26, active: 12, recovery: 30, carry: BOSUN_CARRY, lean: 9, tellSfx: 'crow_call', sfx: 'whiff',
    hitbox: frontBox(58, hit(14, 'heavy', 6, 2, 24), { behind: true }),
    fx: [{ kind: 'slash', x: 0, y: 42, radius: 46, angle: 0, sweep: 200 }],
    w1: { armR: [-60, -20], weapon: -80, armL: [-40, 20], torso: -6, head: -6, root: [0, 0, -8], legR: [14, 6], legL: [-14, 8], face: 'angry' },
    w2: { armR: [-150, -10], weapon: -200, armL: [-118, 12], torso: -2, head: -10, root: [0, -1, -14], legR: [12, 8], legL: [-16, 10], squash: 0.98, stretch: 1.02, face: 'angry' },
    h: { armR: [110, -10], weapon: -420, armL: [108, -8], torso: 10, head: 4, root: [3, -2, 14], legR: [24, 10], legL: [-24, 12], face: 'shout', squash: 1.04, stretch: 0.97 },
    smear: { from: -200, to: 60, a: 0.55, r: 72 },
    hold: { armR: [118, -6], weapon: -470, armL: [114, -6], torso: 14, head: 6, root: [4, -1, 16], legR: [24, 10], legL: [-24, 12], face: 'shout' },
    r: { armR: [94, 2], weapon: -480, armL: [-38, 12], torso: 12, head: 2, root: [2, 1, 0], legR: [22, 10], legL: [-22, 12], face: 'grit' },
  }),
  // powder keg: 30f hauling it off the belt and lighting the match -> lobbed at where the hero was -> 28f punish
  keg: crowStrike({
    tell: 30, active: 8, recovery: 28, carry: BOSUN_CARRY, lean: 9, tellSfx: 'bomb_fuse', sfx: 'throw',
    aimEvent: 'aim', event: 'spawnProjectile', projectile: KEG,
    w1: { armR: [-34, 62], weapon: -35, armL: [-46, 58], torso: 12, head: 8, root: [-2, 2], legR: [18, 14], legL: [-16, 14], face: 'angry' },
    w2: { armR: [112, 92], weapon: 130, armL: [100, 82], torso: -4, head: -6, root: [-5, 1], legR: [12, 10], legL: [-18, 12], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { armR: [138, 4], weapon: 80, armL: [126, 14], torso: -12, head: -12, root: [3, 2], legR: [22, 6], legL: [-20, 12], face: 'shout', squash: 0.95, stretch: 1.06 },
    smear: { from: -110, to: -40, a: 0.4, r: 54 },
    hold: { armR: [108, 8], weapon: 55, armL: [96, 16], torso: -6, head: -8, root: [4, 2], legR: [22, 6], legL: [-20, 12], face: 'shout' },
    r: { armR: [34, 22], weapon: 0, armL: [22, 12], torso: 14, head: 4, root: [2, 1], legR: [18, 8], legL: [-18, 10], face: 'grit' },
  }),
});
const bosun = def({
  variant: 'bosun', name: 'POWDER BOSUN', role: 'bruiser', hp: 85, damage: 1, speed: 0.85, score: 300, drops: 'none',
  build: { ...BASE.build, scale: 1.15, clan: WATCH.bosun,
    // his smock was the hole in the faction ladder: #5A5560 is 11% saturated, i.e. effectively achromatic, so on
    // every polychrome stage his biggest mass fell in the lattice cells the ground already owned. Storm navy at
    // his own value (L* 45.8 -> 43.2) fills it without going warm - warm here would flatten the rank ladder.
    palette: { ...CROW_PAL, primary: '#454C7A', sleeve: CROW.skin, secondary: '#5E80C6', hair: '#A79C88', rank: WATCH.bosun },
    proportions: { ...CROW_PROPS, headR: 9.5, neckR: 4, torsoW: 27, torsoH: 25, hip: 23, upperLeg: 13, lowerLeg: 12, legR: 6, armR: 5, handR: 5.4, footL: 13, footH: 6, bulge: 0.6 },
    // gunner: waist sash, brow band, smock collar — all cloth, and the widest rank field on the deck. NO armband
    // and no rank cuff: his `sleeve` is his own bare skin, and a warm band on warm tan fails ART_STYLE section 0.1.
    crow: { head: 'loupe', coat: 'smock', hair: 'bald', beard: true, faceOpts: BEARDED, bareArm: true, sash: true, collar: true },
    weapon: { attach: 'handR', length: 48, draw: drawChainShot, headAt: 40 },
    accessories: [{ attach: 'back', draw: crowKeg }, { attach: 'torso', draw: crowBandolier }] },
  anims: bosunAnims,
  // heavy enough to shrug off every other hit, but he still launches and still goes down to a throw
  traits: { flinchEvery: 2, weight: 1.3 },
  ai: { attackRange: 52, zTolerance: 16, attacks: [{ anim: 'chain', range: 64, weight: 4 }],
    ranged: { anim: 'keg', minRange: 90, maxRange: 300, cooldown: 220, aimDelay: 20, keep: 120 },
    retreatBudget: 70, retreatChance: 0.15, attackCooldown: [48, 90] },
});

// ---------------------------------------------------------------- C4 Galewright: lens visor, duster, storm coil
// Thin, upright, stiff-backed; hair standing on end with the charge and two lightning rods over her shoulder.
const GALE_CARRY = { armR: [24, 24], weapon: -24, armL: [-26, -18], grip: 0 };
const GALE_STANCE = { lean: -2, head: 1, legR: [6, 3], legL: [-8, 5] };
/** The arc: a lane-wide bolt that staggers. It is slow and loud on purpose — the answer is to be somewhere else. */
const GALE_BOX = { ...frontBox(130, hit(12, 'heavy', 5, 0, 24, { status: { stunned: { frames: 30 } } })), z: 20 };
const galewrightAnims = crowAnims(GALE_CARRY, GALE_STANCE, {
  // gale: 36f charge (the bulb arcs, the hair lifts, the visor blinks white in the last frames) -> the bolt -> 36f punish
  gale: crowStrike({
    tell: 36, active: 10, recovery: 36, carry: GALE_CARRY, lean: -2, tellSfx: 'coil_charge', sfx: 'thunder_strike',
    hitbox: GALE_BOX, fx: [{ kind: 'spark', x: 60, y: 46, count: 6 }],
    w1: { armR: [-148, -20], weapon: 6, armL: [-56, -30], torso: -6, head: -10, root: [0, 1], legR: [10, 6], legL: [-16, 10], face: 'angry' },
    w2: { armR: [-172, -8], weapon: -14, armL: [-78, -40], torso: -14, head: -14, root: [0, -1], legR: [8, 6], legL: [-18, 12], squash: 0.97, stretch: 1.04, face: 'grit' },
    h: { armR: [71, -8], weapon: 5, armL: [-40, 20], torso: 22, head: 6, root: [5, 1], legR: [40, 10], legL: [-30, 32], face: 'shout', squash: 1.05, stretch: 0.96 },
    smear: { from: -76, to: 5, a: 0.5, r: 66 },
    hold: { armR: [71, -6], weapon: 14, armL: [-42, 20], torso: 25, head: 7, root: [6, 1], legR: [40, 10], legL: [-30, 32], face: 'shout' },
    r: { armR: [49, 10], weapon: 2, armL: [-32, 14], torso: 15, head: 2, root: [3, 1], legR: [32, 10], legL: [-26, 26], face: 'grit' },
  }),
  // repel: a close-range pressure wave; no damage worth the name, but it puts a hero back in the arc's lane
  repel: crowStrike({
    tell: 16, active: 8, recovery: 22, carry: GALE_CARRY, lean: -2, sfx: 'gale',
    hitbox: areaBox(52, hit(5, 'medium', 9, 3, 18)), fx: [{ kind: 'ring', x: 0, y: 30, r0: 6, r1: 60, color: CROW.spark }],
    w1: { armR: [28, 72], weapon: 0, armL: [28, 72], torso: -10, head: -6, root: [-3, 2], legR: [10, 10], legL: [-14, 10], face: 'angry' },
    w2: { armR: [16, 88], weapon: -4, armL: [16, 88], torso: -18, head: -4, root: [-5, 3], legR: [8, 14], legL: [-14, 14], squash: 1.06, stretch: 0.94, face: 'angry' },
    h: { armR: [81, 0], weapon: 5, armL: [69, 0], torso: 14, head: 4, root: [2, 0], legR: [34, 10], legL: [-30, 30], face: 'shout', squash: 0.94, stretch: 1.07 },
    smear: { from: 12, to: -10, a: 0.4, r: 48 },  // 22 deg, as above
    hold: { armR: [81, 2], weapon: 13, armL: [69, 2], torso: 16, head: 5, root: [3, 0], legR: [34, 10], legL: [-30, 30], face: 'shout' },
    r: { armR: [68, 10], weapon: 4, armL: [56, 10], torso: 8, head: 0, root: [2, 1], legR: [26, 10], legL: [-24, 24], face: 'grit' },
  }),
});
/** Charge state for the art: rig.coil drives the bulb, the rod beads and how far the hair stands up. */
const galeHooks = {
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    const a = f.anim, gale = a.name === 'gale', charging = gale && a.frameIndex <= 1;
    f.rig.coil = gale ? (charging ? Math.min(1, (a.frameIndex + a.frameTime / Math.max(1, a.frame.dur)) / 2) : 1) : 0;
    f.rig.wings = f.rig.wings || charging;
    if (charging && world && (world.frame & 3) === 0) particles.burst('spark', f.x + f.facing * 22, 48, f.z, 1, { speed: 1.2, up: 0.6, color: CROW.spark });
  },
};
const galewright = def({
  variant: 'galewright', name: 'GALEWRIGHT', role: 'elite', hp: 90, damage: 1, speed: 1, score: 500, drops: 'meter',
  build: { ...BASE.build, scale: 0.92, clan: WATCH.galewright,
    // violet held at hue 290-295, chroma only (duster s 39 -> 60 at L* 33.7, trousers s 13 -> 35)
    palette: { ...CROW_PAL, primary: '#382A68', sleeve: '#B8A6D6', secondary: '#7466BC', hair: '#9A86C0', glow: CROW.spark, rank: WATCH.galewright },
    proportions: { ...CROW_PROPS, headR: 8, torsoW: 19, torsoH: 28, hip: 16, neck: 4, upperLeg: 17, lowerLeg: 16, armR: 3.6, legR: 4.6 },
    // warrant specialist: SEALED. A small head with a BIG eye (lens 1.35 against the Marine's 0.85) under a swept
    // storm cowl and a long keel beak — with nothing sitting on the eye row any more, the lens is the largest and
    // brightest mark on her head, which is the whole point of the sealed helm. Four rank carriers: the brow band on
    // the cold pewter strap, the duster's gorget, both armbands and the trouser lace — head / throat / arm / leg,
    // all of it in front. No rank cuff (her rod hand is already a stack of warm copper rings) and nothing on the
    // cowl behind her, where amber would read as coil charge. `hair: 'loose'` is gone with the standing hair.
    crow: { head: 'visor', coat: 'duster', sealed: true, cowl: 'storm', beak: 'keel', lens: 1.35,
      gorget: true, lace: true, scarf: '#C9BEA6', scarfLen: 3, tailLen: 28 },
    weapon: { attach: 'handR', length: 42, draw: drawCoilRod, headAt: 34 },
    accessories: [{ attach: 'back', draw: crowRods }, { attach: 'back', draw: crowTails }, { attach: 'torso', draw: crowScarf }] },
  anims: galewrightAnims,
  ai: { attackRange: 46, zTolerance: 14, ignoresTokens: true, hoverCircle: true,
    attacks: [{ anim: 'gale', range: 150, minRange: 60, weight: 4 }, { anim: 'repel', range: 52, weight: 3 }],
    attackCooldown: [70, 110], evadeChance: 0.3, evadeCooldown: 110, tellWarnFrames: 14 },
}, galeHooks);

// ---------------------------------------------------------------- C5 Ironwing Marine: crested helm, wing-plate, axe
// The only one still in uniform, and the only one still armoured: broad, planted, half-masked behind the plate.
const MARINE_CARRY = { armR: [28, 20], weapon: -10, armL: [10, 70] };
const MARINE_STANCE = { lean: 6, head: -2, legR: [14, 4], legL: [-14, 8], holdOffArm: true, stagger: { armL: [-30, 20] } };
const marineAnims = crowAnims(MARINE_CARRY, MARINE_STANCE, {
  // shield charge: 30f set behind the wing-plate -> a shoving advance -> 26f punish (and the plate is still up)
  shove: crowStrike({
    tell: 30, active: 12, recovery: 26, carry: MARINE_CARRY, lean: 6, tellSfx: 'crow_call', sfx: 'armor', armor: true,
    hitbox: frontBox(46, hit(16, 'medium', 7, 0, 22)), move: { x: 4.5 },
    w1: { armR: [-20, 30], weapon: -24, armL: [16, 78], torso: 16, head: -6, root: [-3, 1], legR: [22, 16], legL: [-18, 18], face: 'angry' },
    w2: { armR: [-32, 38], weapon: -36, armL: [8, 88], torso: 8, head: -8, root: [-7, 2], legR: [16, 24], legL: [-24, 24], squash: 1.05, stretch: 0.95, face: 'grit' },
    h: { armR: [-42, 30], weapon: -18, armL: [34, 58], torso: 44, head: -10, root: [7, 3], legR: [54, 18], legL: [-44, 52], face: 'shout', squash: 0.96, stretch: 1.05 },
    hold: { armR: [-38, 28], weapon: -20, armL: [40, 54], torso: 40, head: -8, root: [7, 3], legR: [44, 24], legL: [-34, 44], face: 'shout' },
    r: { armR: [-24, 26], weapon: -22, armL: [24, 64], torso: 26, head: -4, root: [4, 2], legR: [32, 14], legL: [-26, 30], face: 'grit' },
  }),
  // axe chop: the follow-up the shove chains into; the last hit puts a hero on the deck
  chop: crowStrike({
    tell: 24, active: 10, recovery: 30, carry: MARINE_CARRY, lean: 6, tellSfx: 'crow_call', sfx: 'hammer_slam',
    hitbox: frontBox(52, hit(18, 'knockdown', 5, 5, 26)), fx: [{ kind: 'slash', x: 44, y: 40, radius: 26, angle: 40, sweep: 90 }],
    w1: { armR: [-138, -28], weapon: 4, armL: [12, 72], torso: -10, head: -8, root: [-2, 0], legR: [14, 8], legL: [-16, 10], face: 'angry' },
    w2: { armR: [-172, -10], weapon: -20, armL: [4, 80], torso: -18, head: -12, root: [-5, 2], legR: [10, 8], legL: [-18, 12], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { armR: [22, 14], weapon: 5, armL: [-10, 58], torso: 34, head: 8, root: [6, 3], legR: [46, 26], legL: [-32, 36], face: 'shout', squash: 1.08, stretch: 0.93 },
    smear: { from: -70, to: 20, a: 0.55, r: 60 },
    hold: { armR: [23, 16], weapon: 18, armL: [-12, 58], torso: 37, head: 9, root: [7, 3], legR: [46, 26], legL: [-32, 36], face: 'shout' },
    r: { armR: [22, 20], weapon: 6, armL: [0, 62], torso: 24, head: 4, root: [4, 2], legR: [38, 18], legL: [-28, 30], face: 'grit' },
  }),
});
/**
 * The wing-plate is a rig flag, so stripping it is visible for the rest of the fight. There is deliberately NO
 * stagger particle: it burst at y 54, which on a 1.31-scale rig is his cuirass and not his helm, and it fired on
 * exactly the frames where the lens is already stuttering violet — two violet marks on one enemy. The lens carries
 * the stagger on its own (crowVisorMask reads FACE.dazed).
 */
const marineHooks = {
  onShieldStripped(f, world) {
    if (!world) return;
    particles.burst('debris', f.x, 44, f.z, 12, { speed: 3.4, up: 2.4, color: CROW.pewter, sizeJitter: 2 });
    audio.play('gear_slip');
  },
};
const marine = def({
  variant: 'marine', name: 'IRONWING MARINE', role: 'elite', hp: 190, damage: 1, speed: 0.7, score: 1000, drops: 'food_small',
  build: { ...BASE.build, scale: 1.31, clan: WATCH.marine,
    // navy at the same value, chroma only (L* 40.3 -> 35.5, s 50 -> 70); hair off the ink (#2A2018 was 1.6 L* over it)
    palette: { ...CROW_PAL, primary: '#203A6B', sleeve: '#BFAE90', secondary: '#5474B4', metal: '#A6B6D0', hair: '#4A3226', rank: WATCH.marine },
    proportions: { ...CROW_PROPS, headR: 9, torsoW: 24, torsoH: 25, hip: 20, upperLeg: 15, lowerLeg: 14, legR: 5.6, armR: 4.6, handR: 5.2, footL: 13, footH: 6, bulge: 0.35 },
    // marine: SEALED, and the top of both ladders. A big head with a small eye (lens 0.85) behind a short grilled
    // iron muzzle — the inverted lens sizes are what stop two pewter heads reading as the same man. Six rank
    // carriers, more than anyone: the helm crest at the very crown, the cuirass band, both armbands, both cuffs,
    // the trouser lace and the wing-plate boss. `hair: 'crop'` is gone with the bare skull.
    crow: { head: 'helm', coat: 'plate', sealed: true, cowl: 'iron', beak: 'iron', lens: 0.85,
      cuff: true, lace: true },
    weapon: { attach: 'handR', length: 42, draw: drawBoardingAxe, headAt: 32 },
    accessories: [{ attach: 'back', draw: crowWings }, { attach: 'handL', draw: drawWingShield }] },
  anims: marineAnims,
  elite: true, grabbable: false, grabbableByGrappler: true, lyingFrames: 55,
  ai: { attackRange: 50, zTolerance: 16, ignoresTokens: true, attackCooldown: [50, 90],
    attacks: [{ anim: 'shove', range: 56, weight: 3, chain: 'chop' }, { anim: 'chop', range: 56, weight: 2 }],
    shield: { hitsToStagger: 4, staggerFrames: 30, stripOnLauncher: true }, retreatChance: 0.1,
    backstepAfterWhiffs: null },
}, marineHooks);

/** The Ninth Wing, in the order the stage introduces them. */
export const STORMCROWS = [crimper, corsair, bosun, galewright, marine];
