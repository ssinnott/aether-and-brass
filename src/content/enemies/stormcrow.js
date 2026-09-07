// Stage 2 enemy faction: THE STORMCROWS (docs/STAGE2.md section 2) — the Concordat's Ninth Aeronaut Wing, flying
// black over the re-opened sky. Rig, palette and base animation set come from ./stormcrowRig.js; this file is the
// five variants, their telegraphed attacks, projectiles and AI tables (data + small hooks only, ARCHITECTURE 14).
//
// Type identity: aeronauts. They fight the way people fight on a windy deck — they give ground, they hop back out of
// a whiffed swing, they keep their feet. Nothing here is armoured except the Ironwing Marine's wing-plate.
// Faction rules:
//  - JUMP ATTACKS DO 1.5x. A Stormcrow covers the deck, not the air above it: go over the top.
//  - At most 2 attack at once (tokenGroup 'stormcrow'); the rest circle on the other z lane.
//  - Every variant backsteps after two whiffed player attacks nearby, so mashing into them is punished by distance.
//
// | Variant          | HP  | Dmg | Speed | Read                                                          |
// |------------------|-----|-----|-------|----------------------------------------------------------------|
// | Deck Crimper     |  45 |   6 | 1.20x | boat-hook jab, low sweep that trips; the fodder                 |
// | Line Corsair     |  40 |   9 | 1.15x | harpoon on a line at range; ANY attack bats the harpoon back    |
// | Powder Bosun     |  85 |  14 | 0.85x | chain shot (hits behind), lobbed powder keg that hurts everyone |
// | Galewright       |  90 |  12 | 1.00x | storm coil: a long charge, then a stunning arc down the lane    |
// | Ironwing Marine  | 190 |  16 | 0.70x | wing-plate: super armour until a launcher strips it             |
import { frontBox, enemyAttack, makeEnemyDef } from './common.js';
import {
  CROW, CROW_PAL, CROW_PROPS, CROW_PARTS, CROW_BACK, makeCrowBase,
  drawBoatHook, drawLineGun, drawChainShot, drawCoilRod, drawBoardingAxe, drawWingShield,
} from './stormcrowRig.js';
import { pathPoly, paint, line } from '../../art/shapes.js';
import { particles } from '../../engine/particles.js';
import { audio } from '../../engine/audio.js';
import { ST } from '../../constants.js';

const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, ...(extra || {}) });
/** Regiment colours: every Stormcrow wears its watch's chevron on the coat. */
export const WATCH = { crimper: '#7C2B34', corsair: '#2F6E7A', bosun: '#A8632A', galewright: '#5B3E8C', marine: '#3C5A88' };

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
    parts: CROW_PARTS, accessories: CROW_BACK, smearColor: '#DCE6F4', clan: WATCH.crimper,
  },
  sfx: { hurt: 'crow_hurt', death: 'crow_death' },
  ai: {
    attackRange: 42, zTolerance: 13, retreatChance: 0.3, attackCooldown: [40, 85], aggression: 0.6, firstAttackDelay: 42,
    flank: true, tokenGroup: 'stormcrow', maxAttackers: 2,
    backstepAfterWhiffs: { whiffs: 2, dist: 46, iframes: 8, cooldown: 70, range: 110 },
  },
};
/** Rig flags the art reads: the wing vanes flare on any hop / lunge, the mask lenses light on tell frames. */
const BASE_HOOKS = {
  onUpdate(f) {
    const n = f.anim.name;
    f.rig.wings = f.state === ST.DODGE || f.airborne || n === 'lunge' || n === 'gale';
  },
};
/** Assemble a Stormcrow variant: faction traits + hooks on top of makeEnemyDef. */
function def(v, hooks) {
  const d = makeEnemyDef(BASE, v);
  d.traits = { jumpAttackTakenMult: 1.5, ...(v.traits || {}) };
  d.hooks = { ...BASE_HOOKS, ...(hooks || {}) };
  return d;
}
/** Base set + parametric telegraphed attacks (common.js enemyAttack: tell -> active -> punishable recovery). */
function crowAnims(carry, attacks, o = {}) {
  const anims = makeCrowBase(carry, o);
  for (const name of Object.keys(attacks)) anims[name] = enemyAttack(attacks[name], carry);
  if (o.extra) Object.assign(anims, o.extra);
  anims.flee = anims.run;
  return anims;
}

// ---------------------------------------------------------------- C1 Deck Crimper: boat hook, jab + tripping sweep
const CRIMP_CARRY = { armR: [26, 26], weapon: -20, armL: [-26, -16] };
const crimperAnims = crowAnims(CRIMP_CARRY, {
  // jab: 18f hook raised (mask lens hot) -> 8f thrust -> 20f punish window
  jab: { style: 'thrust', tell: 18, active: 8, recovery: 20, reach: 50, dmg: 6, type: 'light', kbX: 4, hitstun: 16,
    tellSfx: 'crow_call', sfx: 'whiff', fx: [{ kind: 'spark', x: 48, y: 42, count: 2 }] },
  // sweep: he drops the pole to shin height and hooks both feet out (trips = knockdown)
  sweep: { style: 'swing', tell: 22, active: 10, recovery: 26, reach: 54, dmg: 8, type: 'knockdown', kbX: 3, kbY: 4, hitstun: 22,
    low: true, tellSfx: 'crow_call', sfx: 'whiff', fx: [{ kind: 'dust', x: 34, y: 0, count: 4 }] },
  // lunge: the pack-charge from mid range; the wing-pack pops for a step of thrust
  lunge: { style: 'charge', tell: 16, active: 10, recovery: 24, reach: 46, dmg: 7, type: 'medium', kbX: 5, hitstun: 18,
    move: { x: 6 }, tellSfx: 'crow_call', sfx: 'whiff', fx: [{ kind: 'dust', x: -10, y: 0, count: 3 }] },
});
const crimper = def({
  variant: 'crimper', name: 'DECK CRIMPER', role: 'rusher', hp: 45, damage: 1, speed: 1.2, score: 150, drops: 'none',
  build: { ...BASE.build, clan: WATCH.crimper, weapon: { attach: 'handR', length: 46, draw: drawBoatHook, headAt: 42 } },
  anims: crimperAnims,
  ai: { attackRange: 44, attacks: [{ anim: 'jab', range: 56, weight: 4 }, { anim: 'sweep', range: 50, weight: 2 }, { anim: 'lunge', range: 110, minRange: 64, weight: 2 }], attackCooldown: [34, 72] },
});

// ---------------------------------------------------------------- C2 Line Corsair: harpoon at range, panics up close
const CORSAIR_CARRY = { armR: [22, 30], weapon: -30, armL: [-24, -20], grip: 0 };
const corsairAnims = crowAnims(CORSAIR_CARRY, {
  // harpoon: 24f shoulder the gun and sight down the lane -> fire -> 26f reel (the punish window)
  harpoon: { style: 'shot', tell: 24, active: 6, recovery: 26, noHitbox: true, event: 'spawnProjectile', projectile: HARPOON,
    tellSfx: 'coil_charge', sfx: 'harpoon', fx: [{ kind: 'spark', x: 40, y: 48, count: 3 }] },
  // butt-stroke: the panicky answer when a hero is inside the gun's minimum range
  butt: { style: 'bash', tell: 12, active: 7, recovery: 20, reach: 34, dmg: 6, type: 'light', kbX: 4, hitstun: 14, sfx: 'whiff' },
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
  build: { ...BASE.build, clan: WATCH.corsair, palette: { ...CROW_PAL, primary: '#3A6376', sleeve: '#3A6376', secondary: '#26404E' },
    weapon: { attach: 'handR', length: 38, draw: drawLineGun, headAt: 30 } },
  anims: corsairAnims,
  ai: { attackRange: 32, attacks: [{ anim: 'butt', range: 40, weight: 1 }],
    ranged: { anim: 'harpoon', minRange: 110, maxRange: 330, cooldown: 160, zAlign: true, keep: 150 },
    retreatBudget: 140, retreatChance: 0.2, evadeChance: 0.25, evadeCooldown: 120 },
}, corsairHooks);

// ---------------------------------------------------------------- C3 Powder Bosun: chain shot + lobbed keg
const BOSUN_CARRY = { armR: [30, 22], weapon: 10, armL: [-22, -14] };
const bosunAnims = crowAnims(BOSUN_CARRY, {
  // chain shot: 26f wind-up over the head -> a full circle that hits BOTH sides -> 30f punish
  chain: { style: 'spin', tell: 26, active: 12, recovery: 30, reach: 58, dmg: 14, type: 'heavy', kbX: 6, kbY: 2, hitstun: 24,
    behind: true, tellSfx: 'crow_call', sfx: 'whiff',
    fx: [{ kind: 'slash', x: 0, y: 42, radius: 46, angle: 0, sweep: 200 }] },
  // powder keg: 30f haul it off the belt and light it -> lob at where the hero was 20f ago -> 28f punish
  keg: { style: 'swing', tell: 30, active: 8, recovery: 28, noHitbox: true, aimEvent: 'aim', event: 'spawnProjectile', projectile: KEG,
    tellSfx: 'bomb_fuse', sfx: 'throw' },
});
const bosun = def({
  variant: 'bosun', name: 'POWDER BOSUN', role: 'bruiser', hp: 85, damage: 1, speed: 0.85, score: 300, drops: 'none',
  build: { ...BASE.build, scale: 1.08, clan: WATCH.bosun, palette: { ...CROW_PAL, primary: '#4E4759', sleeve: '#4E4759', secondary: '#33303E' },
    weapon: { attach: 'handR', length: 46, draw: drawChainShot, headAt: 38 } },
  anims: bosunAnims,
  // heavy enough to shrug off every other hit, but he still launches and still goes down to a throw
  traits: { flinchEvery: 2, weight: 1.3 },
  ai: { attackRange: 52, zTolerance: 16, attacks: [{ anim: 'chain', range: 64, weight: 4 }],
    ranged: { anim: 'keg', minRange: 90, maxRange: 300, cooldown: 220, aimDelay: 20, keep: 120 },
    retreatBudget: 70, retreatChance: 0.15, attackCooldown: [48, 90] },
});

// ---------------------------------------------------------------- C4 Galewright: storm coil, charge then a stunning arc
const GALE_CARRY = { armR: [24, 24], weapon: -24, armL: [-26, -18], grip: 0 };
/** The arc: a lane-wide bolt that staggers. It is slow and loud on purpose — the answer is to be somewhere else. */
const GALE_BOX = { ...frontBox(130, hit(12, 'heavy', 5, 0, 24, { status: { stunned: { frames: 30 } } })), z: 20 };
const galewrightAnims = crowAnims(GALE_CARRY, {
  // gale: 36f charge (grip climbs, the bulb throws arcs, the lenses blink white in the last frames) -> 10f bolt -> 36f punish
  gale: { style: 'raise', tell: 36, active: 10, recovery: 36, hitbox: GALE_BOX, tellSfx: 'coil_charge', sfx: 'thunder_strike',
    fx: [{ kind: 'spark', x: 60, y: 46, count: 6 }] },
  // repel: a close-range pressure wave; no damage worth the name, but it puts a hero back in the arc's lane
  repel: { style: 'vent', tell: 16, active: 8, recovery: 22, area: 52, dmg: 5, type: 'medium', kbX: 9, kbY: 3, hitstun: 18,
    sfx: 'gale', fx: [{ kind: 'ring', x: 0, y: 30, r0: 6, r1: 60, color: CROW.spark }] },
});
/** Charge state for the art: pose.grip is keyed by the tell frames, so the bulb brightens with the wind-up. */
const galeHooks = {
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    const a = f.anim, gale = a.name === 'gale', charging = gale && a.frameIndex <= 1;
    // rig.coil (0..1) drives the bulb: it climbs across the two tell frames and stays lit through the bolt
    f.rig.coil = gale ? (charging ? Math.min(1, (a.frameIndex + a.frameTime / Math.max(1, a.frame.dur)) / 2) : 1) : 0;
    f.rig.wings = f.rig.wings || charging;
    if (charging && world && (world.frame & 3) === 0) particles.burst('spark', f.x + f.facing * 22, 48, f.z, 1, { speed: 1.2, up: 0.6, color: CROW.spark });
  },
};
const galewright = def({
  variant: 'galewright', name: 'GALEWRIGHT', role: 'elite', hp: 90, damage: 1, speed: 1, score: 500, drops: 'meter',
  build: { ...BASE.build, clan: WATCH.galewright, palette: { ...CROW_PAL, primary: '#4A3F68', sleeve: '#4A3F68', secondary: '#2F2848', glow: CROW.spark },
    weapon: { attach: 'handR', length: 40, draw: drawCoilRod, headAt: 34 } },
  anims: galewrightAnims,
  ai: { attackRange: 46, zTolerance: 14, ignoresTokens: true, hoverCircle: true,
    attacks: [{ anim: 'gale', range: 150, minRange: 60, weight: 4 }, { anim: 'repel', range: 52, weight: 3 }],
    attackCooldown: [70, 110], evadeChance: 0.3, evadeCooldown: 110, tellWarnFrames: 14 },
}, galeHooks);

// ---------------------------------------------------------------- C5 Ironwing Marine: wing-plate shield, boarding axe
const MARINE_CARRY = { armR: [28, 20], weapon: -10, armL: [10, 70] };
const marineAnims = crowAnims(MARINE_CARRY, {
  // shield charge: 30f behind the wing-plate -> a shoving advance -> 26f punish (and the plate is still up)
  shove: { style: 'charge', tell: 30, active: 12, recovery: 26, reach: 46, dmg: 16, type: 'medium', kbX: 7, hitstun: 22,
    move: { x: 4.5 }, armor: true, tellSfx: 'crow_call', sfx: 'armor' },
  // axe chop: the follow-up the shove chains into; the last hit puts a hero on the deck
  chop: { style: 'slam', tell: 24, active: 10, recovery: 30, reach: 52, dmg: 18, type: 'knockdown', kbX: 5, kbY: 5, hitstun: 26,
    tellSfx: 'crow_call', sfx: 'hammer_slam', fx: [{ kind: 'slash', x: 44, y: 40, radius: 26, angle: 40, sweep: 90 }] },
}, { holdOffArm: true, stagger: { armL: [-30, 20] } });
/** The wing-plate is a rig flag, so stripping it is visible for the rest of the fight. */
const marineHooks = {
  onShieldStripped(f, world) {
    if (!world) return;
    particles.burst('debris', f.x, 44, f.z, 12, { speed: 3.4, up: 2.4, color: CROW.pewter, sizeJitter: 2 });
    audio.play('gear_slip');
  },
};
const marine = def({
  variant: 'marine', name: 'IRONWING MARINE', role: 'elite', hp: 190, damage: 1, speed: 0.7, score: 1000, drops: 'food_small',
  build: { ...BASE.build, scale: 1.28, clan: WATCH.marine, palette: { ...CROW_PAL, primary: '#36486B', sleeve: '#36486B', secondary: '#212C46', metal: '#AEB9C6' },
    weapon: { attach: 'handR', length: 40, draw: drawBoardingAxe, headAt: 30 },
    accessories: [...CROW_BACK, { attach: 'handL', draw: drawWingShield }] },
  anims: marineAnims,
  elite: true, grabbable: false, grabbableByGrappler: true, lyingFrames: 55,
  ai: { attackRange: 50, zTolerance: 16, ignoresTokens: true, attackCooldown: [50, 90],
    attacks: [{ anim: 'shove', range: 56, weight: 3, chain: 'chop' }, { anim: 'chop', range: 56, weight: 2 }],
    shield: { hitsToStagger: 4, staggerFrames: 30, stripOnLauncher: true }, retreatChance: 0.1,
    backstepAfterWhiffs: null },
}, marineHooks);

/** The Ninth Wing, in the order the stage introduces them. */
export const STORMCROWS = [crimper, corsair, bosun, galewright, marine];
