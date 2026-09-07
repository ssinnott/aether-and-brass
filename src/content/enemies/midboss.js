// Mid-boss: Foreman Grubbik & the Hoister (GDD 5.1). Phase 1/2 = the Hoister loader exosuit (600 HP, hook yank + overheat
// from 50%), phase 3 = Grubbik on foot (100 HP, fights like a Gutter Wrangler + whistle rally + hat toss).
import { makeEnemyAnims, enemyAttack, frontBox, P, SOOT, OUTLINE, sootHead, noFace, sootTorso, sootBadge, drawWhip, drawTopHat } from './common.js';
import { rrect, circle, pathPoly, paint, line } from '../../art/shapes.js';

// ---------------------------------------------------------------- Hoister rig (scale 2 generic rig with a chassis torso)
const HOISTER_PAL = { skin: '#6a6a70', hair: '#3a3a40', primary: '#E07A1F', secondary: '#4a4a52', accent: '#C89B3C', metal: '#9a9aa4', dark: '#2a2a30', glow: '#FF5C5C' };
function chassisTorso(ctx, rig, pose, info) {
  const w = info.w, h = info.h, ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -w / 2 - 4, -h + 2, w + 8, h + 6, 5, rig.col(pal.primary), ol, rig.ow);
  ctx.save(); ctx.beginPath(); ctx.rect(-w / 2 - 4, -h + 2, w + 8, h + 6); ctx.clip();
  ctx.fillStyle = rig.col('#1a1418'); for (let i = -3; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * 10, -h + 2); ctx.lineTo(i * 10 + 5, -h + 2); ctx.lineTo(i * 10 - 5, h); ctx.lineTo(i * 10 - 10, h); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = rig.col('rgba(0,0,0,0.25)'); ctx.fillRect(-w / 2 - 3, -h / 2 + 4, w + 6, h / 2 + 3);
  if (rig.overheat) { ctx.fillStyle = rig.col('rgba(255,60,40,0.35)'); ctx.fillRect(-w / 2 - 4, -h + 2, w + 8, h + 6); }
  // boiler behind + gauge
  rrect(ctx, -w / 2 - 12, -h - 4, 12, h * 0.7, 4, rig.col(pal.secondary), ol, rig.ow);
  circle(ctx, w * 0.25, -h * 0.55, 4, rig.col('#e8e8e0'), ol, 1); line(ctx, w * 0.25, -h * 0.55, w * 0.25 + 3, -h * 0.55 - 2, rig.col('#c02020'), 1);
}
/** Grubbik in the open cockpit cage: goblin head with stovepipe hat and cigar, cage bars around. */
function cockpitHead(ctx, rig, pose, info) {
  const r = info.r, ol = rig.col(rig.outline);
  rrect(ctx, -r - 6, -r - 4, r * 2 + 12, r * 2 + 8, 2, rig.col('rgba(40,40,48,0.5)'), rig.col('#C89B3C'), 1.5);
  ctx.fillStyle = rig.col('#C89B3C'); for (let i = -1; i <= 1; i++) ctx.fillRect(i * 7 - 1, -r - 4, 2, r * 2 + 8);
  circle(ctx, 0, 0, r * 0.8, rig.col(SOOT.skin), ol, rig.ow);
  pathPoly(ctx, [r * 0.5, 0, r * 1.3, 0.2, r * 0.5, r * 0.4]); paint(ctx, rig.col(SOOT.skin), ol, 1);
  ctx.fillStyle = rig.col(SOOT.eye); ctx.fillRect(r * 0.1, -r * 0.4, 3, 3);
  rrect(ctx, -r * 0.8, -r * 0.8, r * 1.6, 3, 1, rig.col('#1a1418'), ol, 1); rrect(ctx, -r * 0.5, -r * 0.8 - 12, r, 12, 1, rig.col('#1a1418'), ol, 1);
  circle(ctx, r * 0.35, -r * 0.35, 3, null, rig.col('#C89B3C'), 1);
  line(ctx, r * 0.6, r * 0.35, r * 1.4, r * 0.2, rig.col('#5a3a20'), 3); circle(ctx, r * 1.4, r * 0.2, 1.5, rig.col('#ff8040'), null, 0);
}
function pistonLeg(ctx, rig, pose, info) {
  const ol = rig.col(rig.outline);
  rrect(ctx, -info.r, 0, info.r * 2, info.len, 2, rig.col(rig.palette.secondary), ol, rig.ow);
  rrect(ctx, -info.r + 2, info.len * 0.3, info.r * 2 - 4, info.len * 0.5, 1, rig.col(rig.palette.metal), ol, 1);
}
function clawHand(ctx, rig, pose, info) {
  const ol = rig.col(rig.outline);
  circle(ctx, 0, 0, info.r + 2, rig.col(rig.palette.secondary), ol, rig.ow);
  pathPoly(ctx, [2, -6, 18, -10, 12, -2]); paint(ctx, rig.col(rig.palette.metal), ol, 1.5);
  pathPoly(ctx, [2, 6, 18, 10, 12, 2]); paint(ctx, rig.col(rig.palette.metal), ol, 1.5);
}
function hookArm(ctx, rig) {
  const ol = rig.col(rig.outline);
  for (let i = 0; i < 5; i++) line(ctx, i * 4, i * 2, i * 4 + 4, i * 2 + 2, rig.col('#5B616E'), 2);
  ctx.strokeStyle = rig.col('#9a9aa4'); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(24, 12, 5, Math.PI * 1.2, Math.PI * 0.4, true); ctx.stroke();
  circle(ctx, 24, 12, 5, null, ol, 1);
}
const HOISTER_BUILD = {
  scale: 1.9, palette: HOISTER_PAL, outline: OUTLINE,
  proportions: { headR: 8, neck: 4, torsoW: 30, torsoH: 24, hip: 26, upperArm: 16, lowerArm: 14, armR: 6, handR: 5, upperLeg: 12, lowerLeg: 12, legR: 6, footL: 14, footH: 6 },
  parts: { torso: chassisTorso, head: cockpitHead, face: noFace, legUpper: pistonLeg, legLower: pistonLeg, hand: clawHand },
  accessories: [{ attach: 'handL', draw: hookArm }],
};
const HOISTER_CARRY = { armR: [30, 40], armL: [-30, 30], weapon: -90, torso: 4 };
const crateSpec = { fromSky: true, aimAt: true, style: 'crate', height: 230, gravity: 0.55, life: 200, damage: 24, type: 'knockdown', kbX: 4, kbY: 5, radius: 60, color: '#9a7040', r: 12, muzzle: false };
const hoisterAnims = makeEnemyAnims({ carry: HOISTER_CARRY, attacks: {
  clawSweep: { style: 'swing', tell: 24, active: 10, recovery: 30, reach: 100, dmg: 22, type: 'knockdown', kbX: 6, kbY: 4, tellSfx: 'hydraulic', sfx: 'hammer_swing', hitSfx: 'hit_heavy',
    fx: [{ kind: 'slash', x: 60, y: 50, radius: 60, angle: 10 }] },
  groundPound: { style: 'slam', tell: 30, active: 6, recovery: 34, noHitbox: true, tellSfx: 'hydraulic', event: 'shockwave', radius: 60, hit: { damage: 18, type: 'knockdown', kbX: 5, kbY: 5 }, shake: 12, sfx: 'piston_crush' },
  crateDrop: { style: 'raise', tell: 40, active: 6, recovery: 30, noHitbox: true, tellSfx: 'crate_drop', aimEvent: 'aim', event: 'crateDrop', projectile: crateSpec, sfx: 'hydraulic' },
  hookYank: { style: 'thrust', tell: 20, active: 8, recovery: 40, noHitbox: true, tellSfx: 'hook_yank', event: 'spawnProjectile', sfx: 'hook_yank',
    projectile: { style: 'claw', chained: true, speed: 6, maxDist: 320, damage: 30, type: 'knockdown', kbX: -4, kbY: 4, hitstun: 24, offsetX: 40, offsetY: 50, color: '#9a9aa4', r: 9, life: 70, muzzle: false } },
}, extra: {
  intro: { loop: false, frames: [
    { dur: 40, pose: P({ ...HOISTER_CARRY, root: [0, 0], torso: -4 }), sfx: 'hydraulic' },
    { dur: 40, pose: P({ armR: [-160, -20], armL: [-150, -20], torso: -8, head: -6, root: [0, -3] }), sfx: 'roar' },
    { dur: 20, pose: P({ ...HOISTER_CARRY }) },
  ] },
  phaseChange: { loop: false, frames: [
    { dur: 20, pose: P({ ...HOISTER_CARRY, torso: -12, root: [-4, 2, -8] }), sfx: 'explosion' },
    { dur: 20, pose: P({ ...HOISTER_CARRY, torso: 10, root: [4, 2, 8] }), fx: [{ kind: 'steam', x: 0, y: 60, count: 8 }] },
    { dur: 20, pose: P({ ...HOISTER_CARRY }) },
  ] },
  defeat: { loop: false, frames: [
    { dur: 30, pose: P({ ...HOISTER_CARRY, root: [0, 0, 0] }), sfx: 'explosion' },
    { dur: 30, pose: P({ armR: [60, 40], armL: [40, 30], torso: 20, root: [6, 10, 25] }), sfx: 'explosion_big', fx: [{ kind: 'steam', x: 0, y: 70, count: 10 }] },
    { dur: 60, pose: P({ armR: [60, 40], armL: [40, 30], torso: 24, root: [8, 14, 28] }) },
  ] },
} });

// ---------------------------------------------------------------- Grubbik on foot (Sootborn rig x1.0, top hat, monocle, cigar)
const GRUBBIK_PAL = { skin: '#7aa848', hair: '#3F6B2E', primary: '#3a2a3a', secondary: '#2a2030', accent: '#C89B3C', metal: '#B0B0B0', dark: '#1a1418', glow: '#F2C94C' };
const GRUBBIK_BUILD = {
  scale: 1.0, palette: GRUBBIK_PAL, outline: OUTLINE, clan: '#7A1E2A',
  proportions: { headR: 11, neck: 2, torsoW: 22, torsoH: 22, hip: 18, upperArm: 15, lowerArm: 14, armR: 4.2, upperLeg: 11, lowerLeg: 10, legR: 5, footL: 10, footH: 5 },
  parts: { head: sootHead, face: noFace, torso: sootTorso },
  weapon: { attach: 'handR', length: 50, draw: drawWhip },
  accessories: [{ attach: 'torso', draw: sootBadge }, { attach: 'head', draw: (ctx, rig, pose) => drawTopHat(ctx, rig, pose) }],
};
const GRUBBIK_CARRY = { armR: [30, 40], armL: [-20, 30], weapon: -100, torso: 12, head: -6 };
const netSpec = { style: 'net', speed: 5, damage: 4, type: 'medium', kbX: 0, hitstun: 70, maxDist: 220, life: 80, offsetX: 16, offsetY: 50, color: '#c8b070', r: 10, muzzle: false };
const hatSpec = { style: 'hat', speed: 5, damage: 8, type: 'medium', kbX: 3, hitstun: 16, maxDist: 220, life: 90, offsetX: 10, offsetY: 60, color: '#1a1418', r: 8, muzzle: false, pierce: 2 };
const grubbikAnims = makeEnemyAnims({ carry: GRUBBIK_CARRY, attacks: {
  whip: { style: 'swing', tell: 14, active: 6, recovery: 22, reach: 60, dmg: 8, type: 'medium', kbX: 3, hitstun: 18, tellSfx: 'whip', sfx: 'whip', high: true },
  net: { style: 'raise', tell: 30, active: 6, recovery: 26, noHitbox: true, tellSfx: 'net', event: 'spawnProjectile', projectile: netSpec, sfx: 'throw' },
  hatToss: { style: 'backhand', tell: 16, active: 6, recovery: 24, noHitbox: true, tellSfx: 'whiff', event: 'spawnProjectile', projectile: hatSpec, sfx: 'throw' },
  whistle: { style: 'raise', tell: 30, active: 10, recovery: 30, noHitbox: true, tellSfx: 'soot_flee', event: 'summon', summon: [{ type: 'sootborn', variant: 'cutthroat' }, { type: 'sootborn', variant: 'cutthroat' }, { type: 'sootborn', variant: 'cutthroat' }], sfx: 'soot_flee' },
}, extra: {
  phaseChange: { loop: false, frames: [
    { dur: 30, pose: P({ ...GRUBBIK_CARRY, root: [0, -20], legR: [30, -40], legL: [10, -30] }), sfx: 'soot_flee' },
    { dur: 20, pose: P({ ...GRUBBIK_CARRY, root: [0, 4], torso: 20, squash: 1.1, stretch: 0.9 }), fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }] },
    { dur: 20, pose: P({ ...GRUBBIK_CARRY }) },
  ] },
  defeat: { loop: false, frames: [
    { dur: 30, pose: P({ ...GRUBBIK_CARRY, torso: -10, head: -14, armL: [-60, -60] }), sfx: 'soot_death' },
    { dur: 60, pose: P({ ...GRUBBIK_CARRY, torso: 30, root: [0, 4], legR: [50, 20], legL: [-45, 60] }) },
  ] },
} });

/** Foreman Grubbik & the Hoister definition. */
export const midboss = {
  id: 'midboss', type: 'midboss', variant: 'grubbik', name: 'FOREMAN GRUBBIK', subtitle: '& THE HOISTER', role: 'boss', bossKind: 'midboss', boss: true, music: 'midboss',
  build: HOISTER_BUILD, anims: hoisterAnims, score: 5000, drops: ['food_big', 'meter', 'score_big'], grabbable: false, throwDamageMult: 1,
  sfx: { hurt: 'brass_hit', death: 'boss_defeat' },
  ai: { attackRange: 90, zTolerance: 18, attackCooldown: [40, 80], firstAttackDelay: 40, ignoresTokens: true, retreatChance: 0, staggerEvery: 0, flank: false, tellScale: 1 },
  phases: [
    { name: 'THE HOISTER', hp: 300, color: '#E07A1F', armor: true, unlaunchable: true, walkSpeed: 1.1,
      ai: { attacks: [{ anim: 'clawSweep', range: 110, weight: 4 }, { anim: 'groundPound', range: 80, weight: 3 }, { anim: 'crateDrop', range: 400, minRange: 60, weight: 2 }] } },
    { name: 'OVERHEAT', hp: 300, color: '#FF5C5C', armor: true, unlaunchable: true, walkSpeed: 1.3, overheat: true,
      ai: { attacks: [{ anim: 'clawSweep', range: 110, weight: 3 }, { anim: 'groundPound', range: 80, weight: 3 }, { anim: 'crateDrop', range: 400, minRange: 60, weight: 2 }, { anim: 'hookYank', range: 330, minRange: 80, weight: 4 }],
        attackCooldown: [30, 60], stallEvery: 3, stallFrames: 70 } },
    { name: 'GRUBBIK', hp: 100, color: '#F2C94C', armor: false, unlaunchable: false, grabbable: true, walkSpeed: 2.4, build: GRUBBIK_BUILD, anims: grubbikAnims, damageMult: 1,
      ai: { attackRange: 56, zTolerance: 12, attacks: [{ anim: 'whip', range: 70, weight: 4 }, { anim: 'hatToss', range: 220, minRange: 60, weight: 2 }, { anim: 'whistle', range: 400, weight: 1, maxUses: 1 }],
        ranged: { anim: 'net', minRange: 80, maxRange: 220, cooldown: 240, zAlign: true, keep: 100 }, evadeChance: 0.5, evadeCooldown: 90, retreatBudget: 60, attackCooldown: [30, 70] } },
  ],
};
export { enemyAttack, frontBox };
