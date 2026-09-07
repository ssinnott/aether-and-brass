// Captain Rook Halloway — Balanced ranged hybrid (GDD 2.3). Placeholder rig with the GDD palette; complete moveset data.
import { makeHeroAnims, speedFor, hpFor, STYLES, P } from './common.js';
import { rrect, circle, pathPoly, paint } from '../../art/shapes.js';
import { JUMP_VY, METER } from '../../constants.js';

const PAL = { skin: '#F0D9B5', hair: '#3A2A1E', primary: '#5A2A2A', secondary: '#7B4A2E', accent: '#C9A227', metal: '#D8D8D8', dark: '#3A2A1E', glow: '#F2C94C' };
const CARRY = { armR: [28, 24], weapon: -70 };

/** Cutlass: curved 36px polygon (hand space, +x along the blade). */
function drawCutlass(ctx, rig) {
  const ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -5, -2, 9, 4, 2, rig.col('#4a3020'), ol, rig.ow);
  pathPoly(ctx, [-2, -4, 4, -5, 4, 5, -2, 6]); paint(ctx, rig.col(pal.accent), ol, 1);
  pathPoly(ctx, [4, -2.5, 20, -4, 34, -8, 38, -2, 30, 1, 16, 2.5, 4, 2.5]); paint(ctx, rig.col(pal.metal), ol, rig.ow);
  ctx.fillStyle = rig.col('rgba(255,255,255,0.4)'); ctx.fillRect(8, -2, 20, 1);
}
/** Clockwork revolver in the far hand (hand space). */
function drawRevolver(ctx, rig) {
  const ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -3, -3, 11, 7, 2, rig.col(pal.dark), ol, 1);
  rrect(ctx, 6, -2, 8, 3, 1, rig.col(pal.metal), ol, 1);
  circle(ctx, 2, 0, 2.5, rig.col(pal.accent), ol, 1);
}
function drawTricorne(ctx, rig) {
  const ol = rig.col(rig.outline), r = rig.p.headR;
  pathPoly(ctx, [-r - 4, -r * 0.5, r + 4, -r * 0.5, r + 1, -r - 6, -r - 1, -r - 6]); paint(ctx, rig.col('#2a1a14'), ol, rig.ow);
  ctx.fillStyle = rig.col(rig.palette.accent); ctx.fillRect(-r, -r - 2, r * 2, 2);
  circle(ctx, r * 0.5, -r * 0.2, 2.5, rig.col(rig.palette.accent), ol, 1); // gear eye-patch
}
function drawEpaulettes(ctx, rig) {
  const ol = rig.col(rig.outline), p = rig.p;
  rrect(ctx, p.torsoW / 2 - 6, -p.torsoH - 1, 10, 5, 2, rig.col(rig.palette.accent), ol, 1);
  rrect(ctx, -p.torsoW / 2 - 4, -p.torsoH - 1, 10, 5, 2, rig.col(rig.palette.accent), ol, 1);
}
function portrait(ctx, x, y, s) {
  const cx = x + s / 2, cy = y + s / 2;
  circle(ctx, cx, cy, 8, PAL.skin, '#1a1018', 1);
  pathPoly(ctx, [cx - 12, cy - 5, cx + 12, cy - 5, cx + 9, cy - 11, cx - 9, cy - 11]); paint(ctx, '#2a1a14', '#1a1018', 1);
  ctx.fillStyle = PAL.accent; ctx.fillRect(cx - 8, cy - 7, 16, 2);
  circle(ctx, cx + 3, cy - 1, 2.5, PAL.accent, '#1a1018', 1);
  ctx.fillStyle = '#1a1018'; ctx.fillRect(cx - 4, cy - 2, 2, 2);
  ctx.fillStyle = PAL.hair; ctx.fillRect(cx - 5, cy + 4, 10, 3);
}

const shot = (vz, i) => ({ dur: 4, pose: i % 2 ? STYLES.shot.r : STYLES.shot.h, event: 'spawnProjectile', sfx: 'revolver',
  projectile: { style: 'bullet', damage: 6, type: 'light', hitstun: 14, kbX: 2, speed: 8, maxDist: 200, offsetX: 22, offsetY: 44, vz, color: '#F2C94C' } });
const special = { loop: false, frames: [
  { dur: 6, pose: STYLES.shot.w, sfx: 'revolver_fan' },
  ...[-1.2, -0.6, 0, 0.6, 1.2].map(shot),
  { dur: 10, pose: STYLES.shot.r },
  { dur: 4, pose: P({ ...CARRY, torso: 6 }), cancel: 'any' },
] };
const cannonball = (i) => ({ dur: 6, pose: i % 2 ? STYLES.raise.h : STYLES.raise.r, event: 'spawnProjectile', sfx: 'cannon',
  projectile: { fromSky: true, style: 'cannonball', damage: 25, type: 'knockdown', kbX: 5, kbY: 5, hitstun: 24, onExpire: 'explode', radius: 40, index: i, ahead: 30, spacing: 40, height: 220, gravity: 0.6, life: 200, muzzle: false, color: '#2a2a30', r: 7 } });
const superAnim = { loop: false, frames: [
  { dur: 12, pose: STYLES.raise.w, sfx: 'super_rook' },
  ...[0, 1, 2, 3, 4, 5].map(cannonball),
  { dur: 8, pose: STYLES.raise.r },
] };

const anims = makeHeroAnims({
  carry: CARRY, reach: 40, swingSfx: 'whiff',
  combo: [
    { style: 'swing', dmg: 8, startup: 5, active: 3, recovery: 7, hitstun: 16, kbX: 2 },
    { style: 'backhand', dmg: 8, startup: 5, active: 3, recovery: 7, hitstun: 16, kbX: 2 },
    { style: 'bash', dmg: 10, type: 'medium', startup: 5, active: 3, recovery: 9, hitstun: 30, kbX: 1, hitSfx: 'hit_medium' },
    { style: 'shot', dmg: 14, type: 'knockdown', kbX: 16, kbY: 3, startup: 6, active: 3, recovery: 12, hitSfx: 'revolver', event: 'spawnProjectile',
      fx: [{ kind: 'muzzle', x: 30, y: 46 }] },
  ],
  jumpAttack: { style: 'airslam', dmg: 12, type: 'medium', kbX: 3, kbY: 0, hitstun: 20, active: 5, recovery: 20 },
  jumpAttack2: { sfx: 'revolver', projectile: { style: 'bullet', damage: 8, type: 'light', hitstun: 14, kbX: 2, speed: 7, angle: -60, offsetX: 10, offsetY: 30, life: 60, color: '#F2C94C' } },
  dashAttack: { style: 'slide', dmg: 12, type: 'knockdown', kbX: 4, kbY: 3, low: true, startup: 3, active: 10, move: { x: 6 }, recovery: 8, sfx: 'dodge' },
  special, super: superAnim,
});
// the point-blank shot also fires a piercing bullet for the enemy behind (GDD: pierces to a second enemy for 8)
anims.attack4.frames[1].projectile = { style: 'bullet', damage: 8, type: 'light', hitstun: 14, kbX: 3, speed: 8, maxDist: 90, offsetX: 26, offsetY: 44, pierce: 1, color: '#F2C94C', muzzle: false };

/** Captain Rook Halloway character definition. */
export const rook = {
  id: 'rook', name: 'ROOK', fullName: 'Captain Rook Halloway', title: 'THE CAPTAIN', archetype: 'BALANCED',
  stats: { power: 3, speed: 3, health: 3, range: 4, technique: 3 },
  maxHp: hpFor(3), walkSpeed: speedFor(3), runSpeed: speedFor(3) * 1.7, jumpVy: JUMP_VY, reach: 40, grabReach: 20, grabOffset: 24,
  damageTaken: 1, freeChain: true,
  build: {
    scale: 1, palette: PAL, outline: '#2B2B30',
    proportions: { headR: 9, torsoW: 22, torsoH: 26, hip: 18, upperArm: 13, lowerArm: 12, armR: 4.5, upperLeg: 15, lowerLeg: 15, legR: 5.5, footL: 10 },
    weapon: { attach: 'handR', length: 36, draw: drawCutlass },
    accessories: [{ attach: 'head', draw: drawTricorne }, { attach: 'torso', draw: drawEpaulettes }, { attach: 'handL', draw: drawRevolver }],
  },
  anims,
  moves: {
    special: { name: 'FAN THE HAMMER', cost: METER.special }, super: { name: 'BROADSIDE', cost: METER.super, damage: 150 },
    throwFwd: { damage: 12, vx: 9, vy: 4 }, throwBack: { damage: 12, vx: 5, vy: 7 }, grabHit: { damage: 6, hits: 3 },
  },
  sfx: { special: 'special_rook', super: 'super_rook', swing: 'whiff' },
  portrait,
};
