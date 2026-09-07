// Enemy Type A: The Brassbound (GDD section 3). Base clockwork rig + 5 variants: Tin Footman, Brass Halberdier,
// Copper Sapper, Iron Warden, Chrome Duelist. Placeholder art on the generic rig; complete GDD attack/AI data.
import {
  makeEnemyAnims, makeEnemyDef, frontBox, areaBox, P, BRASS, OUTLINE,
  brassHead, noFace, brassTorso, windKey, brassLimb, brassFoot,
  drawClub, drawHalberd, drawMace, drawRapier, drawShield, drawCape, drawBombPack, drawStack, drawCrest, drawHalfMask,
} from './common.js';

const CARRY = { armR: [26, 22], armL: [-18, 10], weapon: -80, torso: 0 };
const BASE_PAL = { skin: BRASS.darkSteel, hair: BRASS.darkSteel, primary: BRASS.steel, secondary: BRASS.darkSteel, accent: BRASS.brass, metal: '#C8D0D8', dark: '#3A3F4B', glow: BRASS.lens };
const PROPS = { headR: 8.5, torsoW: 22, torsoH: 26, hip: 18, upperArm: 13, lowerArm: 12, armR: 4.2, upperLeg: 14, lowerLeg: 14, legR: 5, footL: 11, footH: 5 };
const PARTS = { head: brassHead, face: noFace, torso: brassTorso, armUpper: brassLimb, armLower: brassLimb, legUpper: brassLimb, legLower: brassLimb, foot: brassFoot };
const KEY = { attach: 'back', draw: windKey };

const BASE = {
  type: 'brassbound', faction: 'brassbound', walkSpeed: 1.5, throwDamageMult: 1.5,
  build: { scale: 1, palette: BASE_PAL, outline: OUTLINE, proportions: PROPS, parts: PARTS, accessories: [KEY], stripe: '#3E5C8A' },
  sfx: { hurt: 'brass_hit', death: 'brass_death', tell: 'brass_tell' },
  ai: { attackRange: 40, zTolerance: 12, retreatChance: 0.2, attackCooldown: [45, 90], aggression: 0.6, staggerEvery: 4, staggerFrames: 30, firstAttackDelay: 50, flank: false },
};

// ---------------------------------------------------------------- A1 Tin Footman
const footmanAnims = makeEnemyAnims({ carry: CARRY, attacks: {
  swing: { style: 'swing', tell: 20, active: 12, recovery: 24, reach: 34, dmg: 6, type: 'light', kbX: 3, hitstun: 16, tellSfx: 'brass_tell', sfx: 'whiff' },
} });
const footman = makeEnemyDef(BASE, {
  variant: 'footman', name: 'TIN FOOTMAN', role: 'fodder', hp: 40, damage: 1, speed: 1.0, score: 150, drops: 'none',
  build: { weapon: { attach: 'handR', length: 22, draw: drawClub } }, anims: footmanAnims,
  ai: { attackRange: 38, attacks: [{ anim: 'swing', range: 46, weight: 1 }], maxAttackers: 2 },
});

// ---------------------------------------------------------------- A2 Brass Halberdier
const halbAnims = makeEnemyAnims({ carry: { armR: [40, 40], armL: [-10, 10], weapon: -130 }, attacks: {
  thrust: { style: 'thrust', tell: 24, active: 8, recovery: 26, reach: 52, dmg: 10, type: 'medium', kbX: 4, hitstun: 20, tellSfx: 'brass_tell', sfx: 'whiff', armor: true },
  sweep: { style: 'slide', tell: 30, active: 10, recovery: 30, dmg: 14, type: 'knockdown', kbX: 4, kbY: 4, tellSfx: 'brass_tell', sfx: 'hammer_swing',
    hitbox: { x: -44, y: -40, w: 88, h: 40, z: 40, once: true, damage: 14, type: 'knockdown', kbX: 4, kbY: 4 } },
} });
const halberdier = makeEnemyDef(BASE, {
  variant: 'halberdier', name: 'BRASS HALBERDIER', role: 'bruiser', hp: 70, damage: 1, speed: 0.8, score: 300, drops: 'none',
  build: { scale: 1.1, palette: { ...BASE_PAL, primary: '#C9A227', secondary: '#8a6a20' }, stripe: '#8A2E2E',
    weapon: { attach: 'handR', length: 56, draw: drawHalberd }, accessories: [KEY, { attach: 'head', draw: drawCrest }] },
  anims: halbAnims,
  ai: { attackRange: 58, zTolerance: 12, attacks: [{ anim: 'thrust', range: 66, minRange: 30, weight: 3 }, { anim: 'sweep', range: 46, weight: 2 }], attackCooldown: [50, 100] },
});

// ---------------------------------------------------------------- A3 Copper Sapper
const bombSpec = { style: 'bomb', aimAt: true, flight: 48, gravity: 0.4, noContactHit: true, bounces: 1, rest: true, life: 120, onExpire: 'explode', radius: 30,
  explodeHit: { damage: 12, type: 'knockdown', kbX: 4, kbY: 4, friendly: true }, color: '#2a2a30', r: 6, muzzle: false, offsetX: 6, offsetY: 60 };
const sapperAnims = makeEnemyAnims({ carry: { armR: [20, 30], armL: [-10, 20], weapon: -60 }, attacks: {
  lob: { style: 'raise', tell: 30, active: 6, recovery: 30, noHitbox: true, tellSfx: 'bomb_fuse', aimEvent: 'aim', event: 'spawnProjectile', projectile: bombSpec, sfx: 'throw' },
  bash: { style: 'backhand', tell: 14, active: 8, recovery: 20, reach: 30, dmg: 8, type: 'light', kbX: 3, hitstun: 14, tellSfx: 'brass_tell', sfx: 'whiff' },
} });
function sapperDeath(f, world) {
  for (let i = 0; i < 2; i++) {
    world.spawnProjectile({ owner: f, style: 'bomb', x: f.x + (i ? 14 : -14), y: 0, z: f.z, life: 60 + i * 12, rest: true, gravity: 0, hit: null, onExpire: 'explode', radius: 30,
      explodeHit: { damage: 12, type: 'knockdown', kbX: 4, kbY: 4, friendly: true }, color: '#2a2a30', r: 6 });
  }
}
const sapper = makeEnemyDef(BASE, {
  variant: 'sapper', name: 'COPPER SAPPER', role: 'ranged', hp: 50, damage: 1, speed: 1.1, score: 200, drops: 'none',
  build: { scale: 0.9, palette: { ...BASE_PAL, primary: '#B87333', secondary: '#7a4a22' }, stripe: '#E8C547', accessories: [KEY, { attach: 'back', draw: drawBombPack }] },
  anims: sapperAnims, onDeath: sapperDeath,
  ai: { attackRange: 34, attacks: [{ anim: 'bash', range: 40, weight: 1 }], ranged: { anim: 'lob', minRange: 90, maxRange: 300, cooldown: 150, zAlign: false, keep: 120 }, retreatBudget: 90 },
});

// ---------------------------------------------------------------- A4 Iron Warden
const bashHit = (dmg, type, kbX, kbY) => ({ damage: dmg, type, kbX, kbY, hitstun: 20 });
const wardenAnims = makeEnemyAnims({ carry: { armR: [30, 30], armL: [-30, 60], weapon: -90 }, attacks: {
  shieldBash: { style: 'bash', tell: 30, active: 8, recovery: 8, reach: 40, dmg: 16, type: 'medium', kbX: 3, hitstun: 20, tellSfx: 'brass_tell', sfx: 'hammer_swing', armor: true,
    extraActive: [
      { dur: 12, pose: P({ armR: [40, 40], armL: [-20, 40], torso: -6, weapon: -90 }) },
      { dur: 8, pose: P({ armL: [100, 10], armR: [30, 40], torso: 20, root: [4, 0], weapon: -90 }), hitbox: frontBox(40, bashHit(16, 'medium', 3, 0)), sfx: 'hammer_swing', move: { x: 2 } },
      { dur: 14, pose: P({ armR: [-40, 40], armL: [-20, 40], torso: -8, weapon: 20 }) },
      { dur: 10, pose: P({ armR: [110, -10], armL: [30, 20], torso: 24, root: [4, 0], weapon: 40 }), hitbox: frontBox(46, bashHit(20, 'knockdown', 5, 4)), sfx: 'hammer_slam', move: { x: 2 } },
    ] },
} });
const warden = makeEnemyDef(BASE, {
  variant: 'warden', name: 'IRON WARDEN', role: 'elite', hp: 180, damage: 1, speed: 0.7, score: 1000, drops: 'meter', elite: true, armor: true, unlaunchable: true,
  grabbable: false, grabbableByGrappler: true, lyingFrames: 50,
  build: { scale: 1.45, palette: { ...BASE_PAL, primary: '#3A3A44', secondary: '#2a2a34', accent: '#8a8a94' }, stripe: '#5B2A86',
    weapon: { attach: 'handR', length: 34, draw: drawMace }, accessories: [KEY, { attach: 'handL', draw: drawShield }, { attach: 'torso', draw: drawStack }] },
  anims: wardenAnims,
  ai: { attackRange: 46, zTolerance: 14, attacks: [{ anim: 'shieldBash', range: 56, weight: 1 }], attackCooldown: [60, 110], staggerEvery: 4, staggerFrames: 30, shield: true, ignoresTokens: true, retreatChance: 0 },
});

// ---------------------------------------------------------------- A5 Chrome Duelist
const duelistAnims = makeEnemyAnims({ carry: { armR: [34, 20], armL: [-30, 20], weapon: -100 }, attacks: {
  lunge: { style: 'thrust', tell: 16, active: 8, recovery: 24, reach: 44, dmg: 12, type: 'medium', kbX: 4, hitstun: 18, tellSfx: 'chime', sfx: 'rapier', move: { x: 5 } },
  riposte: { style: 'thrust', tell: 4, active: 4, recovery: 18, reach: 40, dmg: 3, type: 'light', kbX: 1, hitstun: 12, sfx: 'rapier', invuln: true,
    extraActive: [
      { dur: 4, hitbox: frontBox(40, { damage: 3, type: 'light', kbX: 1, hitstun: 12 }), sfx: 'rapier' },
      { dur: 4, hitbox: frontBox(40, { damage: 3, type: 'light', kbX: 1, hitstun: 12 }), sfx: 'rapier' },
      { dur: 6, hitbox: frontBox(44, { damage: 3, type: 'knockdown', kbX: 5, kbY: 4 }), sfx: 'rapier_arc' },
    ] },
} });
const duelist = makeEnemyDef(BASE, {
  variant: 'duelist', name: 'CHROME DUELIST', role: 'elite', hp: 90, damage: 1, speed: 1.2, score: 500, drops: 'none',
  build: { scale: 1, palette: { ...BASE_PAL, primary: '#DDE6EE', secondary: '#9aa6b2', accent: '#2E6B52' }, stripe: '#2E6B52',
    proportions: { ...PROPS, armR: 3.2, torsoW: 19 }, weapon: { attach: 'handR', length: 44, draw: drawRapier },
    accessories: [KEY, { attach: 'back', draw: drawCape }, { attach: 'head', draw: drawHalfMask }] },
  anims: duelistAnims,
  ai: { attackRange: 44, zTolerance: 12, attacks: [{ anim: 'lunge', range: 80, minRange: 20, weight: 1 }], attackCooldown: [40, 80], hoverCircle: true, riposteChance: 0.3, riposteAnim: 'riposte', riposteCooldown: 150 },
});

/** Brassbound variants in GDD order. */
export const BRASSBOUND = [footman, halberdier, sapper, warden, duelist];
export { areaBox };
