// Enemy Type B: The Sootborn (GDD section 4). Base goblin rig + 5 variants: Soot Cutthroat, Scrap Slinger, Firebrand,
// Cinder Hulk, Gutter Wrangler. Placeholder art on the generic rig; complete GDD attack/AI data.
import {
  makeEnemyAnims, makeEnemyDef, frontBox, P, SOOT, OUTLINE,
  sootHead, noFace, sootTorso, sootBadge,
  drawKnife, drawSling, drawNozzle, drawAnvilClub, drawWhip, drawTank, drawTopHat, drawBandana, drawCap, drawWeldGoggles, drawCollar,
} from './common.js';

const CARRY = { armR: [30, 30], armL: [-20, 30], weapon: -90, torso: 15, head: -8 };
const BASE_PAL = { skin: SOOT.skin, hair: SOOT.shade, primary: SOOT.rags, secondary: '#4a3a2e', accent: SOOT.scrap, metal: SOOT.scrap, dark: '#2a2018', glow: SOOT.eye };
const PROPS = { headR: 11, neck: 2, torsoW: 20, torsoH: 22, hip: 16, upperArm: 15, lowerArm: 14, armR: 4.2, upperLeg: 11, lowerLeg: 10, legR: 5, footL: 10, footH: 5 };
const PARTS = { head: sootHead, face: noFace, torso: sootTorso };
const BADGE = { attach: 'torso', draw: sootBadge };

const BASE = {
  type: 'sootborn', faction: 'sootborn', walkSpeed: 1.7,
  build: { scale: 0.85, palette: BASE_PAL, outline: OUTLINE, proportions: PROPS, parts: PARTS, accessories: [BADGE], clan: '#9A4A22' },
  sfx: { hurt: 'soot_hurt', death: 'soot_death' },
  ai: { attackRange: 34, zTolerance: 12, retreatChance: 0.35, attackCooldown: [35, 80], aggression: 0.7, firstAttackDelay: 40, flank: true, fleeLast: true },
};

// ---------------------------------------------------------------- B1 Soot Cutthroat
const cutthroatAnims = makeEnemyAnims({ carry: CARRY, attacks: {
  stab: { style: 'thrust', tell: 12, active: 6, recovery: 18, reach: 30, dmg: 5, type: 'light', kbX: 2, hitstun: 14, tellSfx: 'soot_flee', sfx: 'whiff', move: { x: 3 } },
} });
const cutthroat = makeEnemyDef(BASE, {
  variant: 'cutthroat', name: 'SOOT CUTTHROAT', role: 'rusher', hp: 30, damage: 1, speed: 1.3, score: 100, drops: 'none',
  build: { clan: '#9A4A22', weapon: { attach: 'handR', length: 18, draw: drawKnife }, accessories: [BADGE, { attach: 'head', draw: drawBandana }] },
  anims: cutthroatAnims,
  ai: { attackRange: 34, attacks: [{ anim: 'stab', range: 44, weight: 1 }], fleeHp: 10, fleeDistance: 100 },
});

// ---------------------------------------------------------------- B2 Scrap Slinger
const boltSpec = { style: 'stone', speed: 4, damage: 8, type: 'medium', kbX: 5, hitstun: 18, maxDist: 320, life: 120, offsetX: 16, offsetY: 44, color: '#8a8a80', r: 4, muzzle: false };
const slingerAnims = makeEnemyAnims({ carry: { ...CARRY, armR: [40, 20], weapon: 0 }, attacks: {
  sling: { style: 'raise', tell: 36, active: 6, recovery: 24, noHitbox: true, tellSfx: 'sling', event: 'spawnProjectile', projectile: boltSpec, sfx: 'bolt' },
  bash: { style: 'backhand', tell: 12, active: 6, recovery: 18, reach: 28, dmg: 6, type: 'light', kbX: 2, hitstun: 14, sfx: 'whiff' },
} });
const slinger = makeEnemyDef(BASE, {
  variant: 'slinger', name: 'SCRAP SLINGER', role: 'ranged', hp: 35, damage: 1, speed: 1.1, score: 150, drops: 'none',
  build: { clan: '#D9A62B', palette: { ...BASE_PAL, skin: '#8FA35A' }, weapon: { attach: 'handR', length: 16, draw: drawSling }, accessories: [BADGE, { attach: 'head', draw: drawCap }] },
  anims: slingerAnims,
  ai: { attackRange: 32, attacks: [{ anim: 'bash', range: 38, weight: 1 }], ranged: { anim: 'sling', minRange: 110, maxRange: 300, cooldown: 150, zAlign: true, keep: 140 },
    panicRange: 50, panicFrames: 30, retreatBudget: 80, fleeLast: true },
});

// ---------------------------------------------------------------- B3 Firebrand
const flameHit = { damage: 5, type: 'light', kbX: 1, hitstun: 12, once: false, rehit: 8, id: 'flame' };
const flameBox = frontBox(70, flameHit, { high: true });
const firebrandAnims = makeEnemyAnims({ carry: { ...CARRY, armR: [50, 30], weapon: -110 }, attacks: {
  flame: { style: 'vent', tell: 24, active: 10, recovery: 24, hitbox: flameBox, tellSfx: 'fire', sfx: 'burn', fx: [{ kind: 'steam', x: 40, y: 40, count: 3 }],
    extraActive: [
      { dur: 10, hitbox: flameBox, fx: [{ kind: 'steam', x: 52, y: 44, count: 3 }] },
      { dur: 10, hitbox: flameBox, fx: [{ kind: 'steam', x: 64, y: 40, count: 3 }] },
    ] },
} });
function firebrandDeath(f, world) {
  world.spawnProjectile({ owner: f, style: 'bomb', x: f.x, y: 0, z: f.z, life: 30, rest: true, gravity: 0, hit: null, onExpire: 'explode', radius: 40,
    explodeHit: { damage: 15, type: 'knockdown', kbX: 5, kbY: 5, friendly: true }, color: '#8a4a2a', r: 7 });
}
const firebrand = makeEnemyDef(BASE, {
  variant: 'firebrand', name: 'FIREBRAND', role: 'bruiser', hp: 45, damage: 1, speed: 1.0, score: 200, drops: 'none',
  build: { clan: '#F08A24', palette: { ...BASE_PAL, skin: '#8C3A2E' }, weapon: { attach: 'handR', length: 22, draw: drawNozzle },
    accessories: [BADGE, { attach: 'back', draw: drawTank }, { attach: 'head', draw: drawWeldGoggles }] },
  anims: firebrandAnims, onDeath: firebrandDeath,
  ai: { attackRange: 56, zTolerance: 14, attacks: [{ anim: 'flame', range: 70, weight: 1 }], attackCooldown: [50, 100], retreatChance: 0.2 },
});

// ---------------------------------------------------------------- B4 Cinder Hulk
const hulkAnims = makeEnemyAnims({ carry: { armR: [40, 30], armL: [-20, 20], weapon: -120, torso: 8 }, attacks: {
  overhead: { style: 'slam', tell: 36, active: 8, recovery: 34, reach: 50, dmg: 18, type: 'knockdown', kbX: 5, kbY: 5, tellSfx: 'roar', sfx: 'hammer_slam', hitSfx: 'hit_heavy',
    fx: [{ kind: 'dust', x: 40, y: 0, count: 8 }], shake: 8 },
  grab: { style: 'clap', tell: 20, active: 8, recovery: 24, tellSfx: 'roar', sfx: 'whiff',
    hitbox: { x: 4, y: -70, w: 40, h: 66, z: 20, type: 'grab', once: true, damage: 0 } },
} });
const hulk = makeEnemyDef(BASE, {
  variant: 'hulk', name: 'CINDER HULK', role: 'grabber', hp: 160, damage: 1, speed: 0.6, score: 500, drops: 'food_small', elite: true, armor: true,
  grabbable: false, grabbableByGrappler: true, lyingFrames: 50,
  build: { scale: 1.35, clan: '#B8692E', palette: { ...BASE_PAL, skin: '#4C7A3C', primary: '#3a3a30' }, proportions: { ...PROPS, torsoW: 26, torsoH: 26, armR: 6, legR: 6.5 },
    weapon: { attach: 'handR', length: 60, draw: drawAnvilClub }, accessories: [BADGE, { attach: 'torso', draw: drawCollar }] },
  anims: hulkAnims,
  moves: { grabHit: { damage: 5, hits: 4 }, throwFwd: { damage: 8, vx: 9, vy: 5 } },
  ai: { attackRange: 50, zTolerance: 14, attacks: [{ anim: 'overhead', range: 60, weight: 3 }, { anim: 'grab', range: 40, weight: 2 }], attackCooldown: [60, 120],
    staggerEvery: 3, staggerFrames: 20, launchStun: 45, ignoresTokens: true, retreatChance: 0, fleeLast: false, flank: false, grabHoldHits: 4 },
});

// ---------------------------------------------------------------- B5 Gutter Wrangler
const netSpec = { style: 'net', speed: 5, damage: 4, type: 'medium', kbX: 0, hitstun: 70, maxDist: 220, life: 80, offsetX: 16, offsetY: 50, color: '#c8b070', r: 10, muzzle: false };
const wranglerAnims = makeEnemyAnims({ carry: { ...CARRY, armR: [30, 40], weapon: -100 }, attacks: {
  whip: { style: 'swing', tell: 14, active: 6, recovery: 22, reach: 60, dmg: 8, type: 'medium', kbX: 3, hitstun: 18, tellSfx: 'whip', sfx: 'whip', high: true },
  net: { style: 'raise', tell: 30, active: 6, recovery: 26, noHitbox: true, tellSfx: 'net', event: 'spawnProjectile', projectile: netSpec, sfx: 'throw' },
} });
const wrangler = makeEnemyDef(BASE, {
  variant: 'wrangler', name: 'GUTTER WRANGLER', role: 'elite', hp: 60, damage: 1, speed: 1.5, score: 400, drops: 'score',
  build: { scale: 0.77, clan: '#7A1E2A', palette: { ...BASE_PAL, skin: '#9EC96D', primary: '#7A1E2A' }, weapon: { attach: 'handR', length: 50, draw: drawWhip },
    accessories: [BADGE, { attach: 'head', draw: drawTopHat }] },
  anims: wranglerAnims,
  ai: { attackRange: 56, zTolerance: 12, attacks: [{ anim: 'whip', range: 70, weight: 3 }], ranged: { anim: 'net', minRange: 80, maxRange: 220, cooldown: 240, zAlign: true, keep: 110 },
    evadeChance: 0.5, evadeCooldown: 90, retreatBudget: 60, attackCooldown: [30, 70] },
});

/** Sootborn variants in GDD order. */
export const SOOTBORN = [cutthroat, slinger, firebrand, hulk, wrangler];
