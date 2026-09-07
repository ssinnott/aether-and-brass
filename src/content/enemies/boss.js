// Final boss: Chancellor Aurelius Vane, the Aetherwright (GDD 5.2). Phase 1 = Regent Engine legs (450), phase 2 = body (450),
// phase 3 = Vane on foot (250). Placeholder art on the generic rig; complete GDD attack data per phase.
import { makeEnemyAnims, frontBox, P, OUTLINE, noFace } from './common.js';
import { rrect, circle, pathPoly, paint, line, gear } from '../../art/shapes.js';

// ---------------------------------------------------------------- Regent Engine rig (scale 2.5, barrel body, dome cockpit, cannon + saw)
const ENGINE_PAL = { skin: '#3A3F4B', hair: '#3A3F4B', primary: '#C9963A', secondary: '#3A3F4B', accent: '#4DF0E0', metal: '#9aa0a8', dark: '#2a2e38', glow: '#4DF0E0' };
function barrelTorso(ctx, rig, pose, info) {
  const w = info.w, h = info.h, ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -w / 2 - 2, -h, w + 4, h + 6, 8, rig.col(pal.primary), ol, rig.ow);
  ctx.fillStyle = rig.col(pal.secondary); for (let i = 0; i < 4; i++) ctx.fillRect(-w / 2 - 2, -h + 4 + i * (h / 4), w + 4, 2);
  ctx.fillStyle = rig.col('rgba(0,0,0,0.22)'); ctx.fillRect(-w / 2 - 1, -h / 2 + 2, w + 2, h / 2 + 2);
  const open = rig.coreOpen;
  circle(ctx, 0, -h * 0.45, w * 0.22, rig.col(open ? '#ffffff' : rig.tell ? '#FF5C5C' : pal.glow), ol, 1.5);
  ctx.fillStyle = rig.col('rgba(255,255,255,0.45)'); ctx.fillRect(-2, -h * 0.45 - w * 0.12, 3, 3);
  if (rig.phaseIndex === 1) { ctx.fillStyle = rig.col('#FF5C5C'); ctx.fillRect(-w * 0.2, -h * 0.15, w * 0.4, 3); } // bolt slit
}
function domeHead(ctx, rig, pose, info) {
  const r = info.r, ol = rig.col(rig.outline);
  ctx.beginPath(); ctx.arc(0, r * 0.4, r * 1.3, Math.PI, 0); ctx.closePath(); paint(ctx, rig.col('rgba(120,200,220,0.55)'), ol, rig.ow);
  rrect(ctx, -r * 1.3, r * 0.3, r * 2.6, 3, 1, rig.col('#C9963A'), ol, 1);
  // Vane inside: tiny top hat + cravat
  rrect(ctx, -3, -r * 0.6, 6, 6, 1, rig.col('#1B1E2B'), ol, 1); rrect(ctx, -4, 0, 8, 2, 1, rig.col('#1B1E2B'), null, 0);
  ctx.fillStyle = rig.col('#F4F1E8'); ctx.fillRect(-1, 3, 2, 3);
  if (rig.tell) { ctx.fillStyle = rig.col('rgba(77,240,224,0.4)'); ctx.beginPath(); ctx.arc(0, r * 0.4, r * 1.2, Math.PI, 0); ctx.fill(); }
}
function tripodLeg(ctx, rig, pose, info) {
  const ol = rig.col(rig.outline);
  rrect(ctx, -info.r, 0, info.r * 2, info.len, 2, rig.col(rig.palette.secondary), ol, rig.ow);
  rrect(ctx, -info.r + 2, 3, info.r * 2 - 4, info.len * 0.4, 1, rig.col(rig.palette.metal), ol, 1);
  circle(ctx, 0, 0, info.r * 0.9, rig.col('#C9963A'), ol, 1);
}
function sawHand(ctx, rig, pose, info) {
  const ol = rig.col(rig.outline), a = rig.sawAngle || 0;
  gear(ctx, 8, 0, 14, 8, rig.col(rig.palette.metal), ol, 1.5, a, 4, rig.col('#C9963A'));
}
function cannonArm(ctx, rig) {
  const ol = rig.col(rig.outline);
  rrect(ctx, -4, -5, 34, 10, 3, rig.col('#3A3F4B'), ol, rig.ow);
  rrect(ctx, 26, -6, 8, 12, 2, rig.col('#C9963A'), ol, 1);
  circle(ctx, 32, 0, 3, rig.col(rig.tell ? '#FF5C5C' : '#1a1418'), null, 0);
}
const ENGINE_BUILD = {
  scale: 2.4, palette: ENGINE_PAL, outline: OUTLINE,
  proportions: { headR: 7, neck: 2, torsoW: 30, torsoH: 24, hip: 28, upperArm: 15, lowerArm: 13, armR: 5.5, handR: 5, upperLeg: 12, lowerLeg: 11, legR: 6, footL: 16, footH: 6 },
  parts: { torso: barrelTorso, head: domeHead, face: noFace, legUpper: tripodLeg, legLower: tripodLeg, hand: sawHand },
  accessories: [{ attach: 'handL', draw: cannonArm }],
};
const ENGINE_CARRY = { armR: [40, 30], armL: [-40, 40], weapon: -90, torso: 0 };
const ENGINE_LOW = { armR: [40, 30], armL: [-40, 40], weapon: -90, torso: 6, root: [0, 26], legR: [70, -100], legL: [70, -100] };
const shell = { style: 'shell', speed: 6, damage: 18, type: 'knockdown', kbX: 5, kbY: 4, hitstun: 22, maxDist: 500, life: 110, offsetX: 50, offsetY: 60, color: '#4DF0E0', r: 5 };
const sawHit = (zOff) => ({ x: -420, y: -50, w: 840, h: 50, z: 30, zOff, once: true, damage: 28, type: 'knockdown', kbX: 6, kbY: 5, id: 'saw' + zOff });
const engineAnims = makeEnemyAnims({ carry: ENGINE_CARRY, attacks: {
  stomp: { style: 'stomp', tell: 30, active: 6, recovery: 30, noHitbox: true, tellSfx: 'hydraulic', event: 'shockwave', radius: 40, offset: 30, hit: { damage: 20, type: 'knockdown', kbX: 5, kbY: 5 }, shake: 12, sfx: 'piston_crush' },
  cannonVolley: { style: 'shot', tell: 40, active: 6, recovery: 60, noHitbox: true, tellSfx: 'brass_tell', event: 'spawnProjectile', projectile: shell, sfx: 'cannon',
    extraActive: [{ dur: 10 }, { dur: 6, event: 'spawnProjectile', projectile: shell, sfx: 'cannon' }, { dur: 10 }, { dur: 6, event: 'spawnProjectile', projectile: shell, sfx: 'cannon' }] },
  summonEscort: { style: 'raise', tell: 30, active: 10, recovery: 40, noHitbox: true, tellSfx: 'brass_tell', event: 'summon', summon: [{ type: 'brassbound', variant: 'footman' }, { type: 'brassbound', variant: 'footman' }], sfx: 'chime' },
  timeStop: { style: 'raise', tell: 40, active: 6, recovery: 20, noHitbox: true, tellSfx: 'time_stop_tick', event: 'timeStop', sfx: 'chime',
    extraActive: [{ dur: 30, pose: P({ ...ENGINE_CARRY, legR: [60, -90], legL: [0, 0], root: [0, 2] }) }, { dur: 6, event: 'shockwave', radius: 44, offset: 30, hit: { damage: 20, type: 'knockdown', kbX: 5, kbY: 5 }, shake: 12, sfx: 'piston_crush' }] },
  sawSweep: { style: 'spin', tell: 36, active: 8, recovery: 50, tellSfx: 'saw_whine', hitboxes: [sawHit(0)], sfx: 'saw_whine',
    extraActive: [{ dur: 40, pose: P({ ...ENGINE_LOW, armR: [100, 0] }) }, { dur: 8, pose: P({ ...ENGINE_LOW, armR: [100, 0], root: [0, 26, 8] }), hitboxes: [sawHit(-60), sawHit(60)], sfx: 'saw_whine' }] },
  boltSpray: { style: 'shot', tell: 30, active: 8, recovery: 40, noHitbox: true, tellSfx: 'brass_tell', event: 'spawnProjectile', sfx: 'revolver_fan',
    projectile: { style: 'bolt', speed: 5, damage: 8, type: 'light', kbX: 3, hitstun: 14, count: 8, spreadZ: 4, spreadY: 3, maxDist: 400, life: 100, offsetX: 30, offsetY: 40, color: '#FF5C5C', r: 3, muzzle: false } },
}, extra: {
  intro: { loop: false, frames: [
    { dur: 60, pose: P({ ...ENGINE_CARRY, root: [0, 0] }), sfx: 'hydraulic' },
    { dur: 40, pose: P({ ...ENGINE_CARRY, armL: [-160, -10], armR: [-150, -10], torso: -6 }), sfx: 'roar' },
    { dur: 20, pose: P({ ...ENGINE_CARRY }) },
  ] },
  phaseChange: { loop: false, frames: [
    { dur: 20, pose: P({ ...ENGINE_CARRY, root: [0, 0, -4] }), sfx: 'explosion' },
    { dur: 30, pose: P({ ...ENGINE_LOW, root: [0, 26, 4] }), sfx: 'explosion_big', fx: [{ kind: 'steam', x: 0, y: 40, count: 10 }] },
    { dur: 20, pose: P({ ...ENGINE_LOW }) },
  ] },
  defeat: { loop: false, frames: [
    { dur: 30, pose: P({ ...ENGINE_LOW }), sfx: 'explosion' },
    { dur: 30, pose: P({ ...ENGINE_LOW, root: [4, 28, 12] }), sfx: 'explosion_big' },
    { dur: 60, pose: P({ ...ENGINE_LOW, root: [8, 30, 18] }), fx: [{ kind: 'steam', x: 0, y: 60, count: 12 }] },
  ] },
} });
// phase 2: the body sits on the floor (legs collapsed) — same rig, lowered rest poses
const engineBodyAnims = { ...engineAnims,
  idle: { loop: true, frames: [{ dur: 24, pose: P({ ...ENGINE_LOW }) }, { dur: 24, pose: P({ ...ENGINE_LOW, root: [0, 27], torso: 8 }) }] },
  walk: { loop: true, frames: [{ dur: 12, pose: P({ ...ENGINE_LOW, root: [0, 25, -2] }) }, { dur: 12, pose: P({ ...ENGINE_LOW, root: [0, 27, 2] }) }] },
};

// ---------------------------------------------------------------- Vane on foot (hero rig x1.1, frock coat, top hat, cane-sword)
const VANE_PAL = { skin: '#E8CDB5', hair: '#8C8C94', primary: '#1B1E2B', secondary: '#1B1E2B', accent: '#4DF0E0', metal: '#D8DCE0', dark: '#101218', glow: '#4DF0E0' };
function vaneHat(ctx, rig) {
  const r = rig.p.headR, ol = rig.col(rig.outline);
  rrect(ctx, -r - 3, -r * 0.75, r * 2 + 6, 3, 1, rig.col('#101218'), ol, 1);
  rrect(ctx, -r + 1, -r * 0.75 - 15, r * 2 - 2, 15, 1, rig.col('#101218'), ol, rig.ow);
  circle(ctx, 0, -r * 0.75 - 8, 3, rig.col('#C9963A'), ol, 1); line(ctx, 0, -r * 0.75 - 8, 2, -r * 0.75 - 10, rig.col('#c02020'), 1);
  ctx.fillStyle = rig.col('#101218'); ctx.fillRect(r * 0.2, -r * 0.2, 4, 1.5); circle(ctx, r * 0.5, -r * 0.15, 2.5, null, rig.col('#D8DCE0'), 1);
}
function caneSword(ctx, rig) {
  const ol = rig.col(rig.outline);
  circle(ctx, 0, 0, 3, rig.col('#C9963A'), ol, 1);
  rrect(ctx, 2, -1, 34, 2, 1, rig.col(rig.palette.metal), ol, 1.5);
}
function frockTorso(ctx, rig, pose, info) {
  const w = info.w, h = info.h, ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -w / 2, -h, w, h + 4, 5, rig.col(pal.primary), ol, rig.ow);
  pathPoly(ctx, [-w / 2 + 2, h * 0.1, -w / 2 - 6, h * 0.9, -w / 2 + 6, h * 0.5]); paint(ctx, rig.col(pal.primary), ol, 1.5); // coat tail
  ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(-1, -h + 6, 1.5, h - 4); ctx.fillRect(-w / 2 + 2, -h + 3, w - 4, 1.5);
  ctx.fillStyle = rig.col('#F4F1E8'); ctx.fillRect(-3, -h + 1, 6, 5);
}
function clockworkArm(ctx, rig, pose, info) {
  const ol = rig.col(rig.outline);
  rrect(ctx, -info.r + 0.5, 0, info.r * 2 - 1, info.len, 2, rig.col(info.far ? '#9aa0a8' : rig.palette.primary), ol, rig.ow);
  if (info.far) { circle(ctx, 0, 0, info.r * 0.8, rig.col('#C9963A'), ol, 1); }
}
const VANE_BUILD = {
  scale: 1.1, palette: VANE_PAL, outline: OUTLINE,
  proportions: { headR: 8.5, torsoW: 20, torsoH: 27, hip: 16, upperArm: 13, lowerArm: 12, armR: 4, upperLeg: 16, lowerLeg: 16, legR: 5, footL: 10 },
  parts: { torso: frockTorso, armUpper: clockworkArm },
  weapon: { attach: 'handR', length: 36, draw: caneSword },
  accessories: [{ attach: 'head', draw: vaneHat }],
};
const VANE_CARRY = { armR: [24, 40], armL: [-24, 20], weapon: -110, torso: -2 };
const flurryHit = (dmg, type, kbX, kbY) => frontBox(44, { damage: dmg, type, kbX, kbY, hitstun: 14 });
const watchSpec = { style: 'watch', aimAt: true, flight: 40, gravity: 0.4, noContactHit: true, bounces: 0, rest: true, life: 130, onExpire: 'explode', radius: 40,
  explodeHit: { damage: 16, type: 'knockdown', kbX: 5, kbY: 5 }, color: '#C9963A', r: 6, muzzle: false, offsetX: 10, offsetY: 50 };
const vaneAnims = makeEnemyAnims({ carry: VANE_CARRY, attacks: {
  caneFlurry: { style: 'thrust', tell: 20, active: 5, recovery: 30, reach: 44, dmg: 8, type: 'light', kbX: 2, hitstun: 14, tellSfx: 'chime', sfx: 'rapier',
    extraActive: [
      { dur: 5, pose: P({ armR: [60, 30], armL: [-40, 20], torso: 10, weapon: -60 }) },
      { dur: 5, hitbox: flurryHit(8, 'light', 2, 0), sfx: 'rapier' },
      { dur: 5, pose: P({ armR: [60, 30], armL: [-40, 20], torso: 10, weapon: -60 }) },
      { dur: 5, hitbox: flurryHit(8, 'light', 2, 0), sfx: 'rapier' },
      { dur: 5, pose: P({ armR: [60, 30], armL: [-40, 20], torso: 10, weapon: -60 }) },
      { dur: 5, hitbox: flurryHit(8, 'medium', 2, 0), sfx: 'rapier' },
      { dur: 5, pose: P({ armR: [-40, 60], armL: [-40, 20], torso: 8, weapon: -60 }) },
      { dur: 6, pose: P({ armR: [200, -30], armL: [-30, 20], torso: -14, root: [4, -6], weapon: -40 }), hitbox: flurryHit(8, 'launch', 2, 8), sfx: 'rapier_arc' },
    ] },
  clockworkFist: { style: 'bash', tell: 30, active: 10, recovery: 40, reach: 100, dmg: 18, type: 'knockdown', kbX: 6, kbY: 4, tellSfx: 'gear_slip', sfx: 'piston', move: { x: 4 } },
  watchBomb: { style: 'backhand', tell: 20, active: 6, recovery: 26, noHitbox: true, tellSfx: 'time_stop_tick', aimEvent: 'aim', event: 'spawnProjectile', projectile: watchSpec, sfx: 'throw' },
  aetherStep: { style: 'raise', tell: 10, active: 20, recovery: 6, noHitbox: true, tellSfx: 'aether_step', event: 'teleportBehind', invuln: true, sfx: 'aether_step', chain: 'caneFlurry' },
}, extra: {
  phaseChange: { loop: false, frames: [
    { dur: 30, pose: P({ ...VANE_CARRY, root: [0, -30], legR: [30, -40], legL: [10, -30] }), sfx: 'explosion_big' },
    { dur: 20, pose: P({ ...VANE_CARRY, root: [0, 4], torso: 20, squash: 1.1, stretch: 0.9 }), fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }] },
    { dur: 30, pose: P({ ...VANE_CARRY, armL: [-90, -60], head: -8 }) },
  ] },
  defeat: { loop: false, frames: [
    { dur: 40, pose: P({ ...VANE_CARRY, torso: -10, head: -14, armR: [60, 40], armL: [-60, -60], weapon: 40 }), sfx: 'boss_defeat' },
    { dur: 80, pose: P({ torso: 34, head: 10, root: [0, 6], legR: [60, 40], legL: [-40, 60], armR: [30, 60], armL: [30, 60] }) },
  ] },
} });

/** Chancellor Aurelius Vane definition. */
export const boss = {
  id: 'boss', type: 'boss', variant: 'vane', name: 'CHANCELLOR AURELIUS VANE', subtitle: 'THE AETHERWRIGHT', role: 'boss', bossKind: 'boss', boss: true, music: 'boss',
  build: ENGINE_BUILD, anims: engineAnims, score: 15000, drops: ['food_big', 'meter', 'score_big'], grabbable: false, throwDamageMult: 1,
  sfx: { hurt: 'brass_hit', death: 'boss_defeat' },
  ai: { attackRange: 70, zTolerance: 20, attackCooldown: [50, 90], firstAttackDelay: 40, ignoresTokens: true, retreatChance: 0, staggerEvery: 0, flank: false },
  phases: [
    { name: 'REGENT ENGINE - LEGS', hp: 450, color: '#4DF0E0', armor: true, unlaunchable: true, walkSpeed: 0.9, phaseIndex: 0,
      ai: { attacks: [{ anim: 'stomp', range: 90, weight: 4 }, { anim: 'cannonVolley', range: 420, minRange: 70, weight: 3 }, { anim: 'timeStop', range: 120, weight: 2 }, { anim: 'summonEscort', range: 500, weight: 2, maxUses: 2 }] } },
    { name: 'REGENT ENGINE - BODY', hp: 450, color: '#C9963A', armor: true, unlaunchable: true, walkSpeed: 0.7, phaseIndex: 1, anims: engineBodyAnims, hurtboxScale: 0.7,
      ai: { attacks: [{ anim: 'sawSweep', range: 500, weight: 4 }, { anim: 'boltSpray', range: 420, minRange: 50, weight: 3 }, { anim: 'cannonVolley', range: 420, minRange: 70, weight: 2 }], attackCooldown: [45, 80] } },
    { name: 'CHANCELLOR VANE', hp: 250, color: '#F4F1E8', armor: false, unlaunchable: false, grabbable: true, walkSpeed: 2.6, build: VANE_BUILD, anims: vaneAnims, phaseIndex: 2, damageMult: 1,
      ai: { attackRange: 46, zTolerance: 12, attacks: [{ anim: 'caneFlurry', range: 60, weight: 4 }, { anim: 'clockworkFist', range: 120, minRange: 40, weight: 3 }, { anim: 'watchBomb', range: 300, minRange: 60, weight: 2 }, { anim: 'aetherStep', range: 400, minRange: 50, weight: 2 }],
        attackCooldown: [30, 60], hoverCircle: true, blinkOnDamage: 60 } },
  ],
};
