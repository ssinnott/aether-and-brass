// Brunhild Coalheart — Tank (GDD 2.1). Placeholder rig with the GDD palette; complete moveset data.
import { makeHeroAnims, speedFor, hpFor, areaBox, STYLES, P } from './common.js';
import { rrect, circle, pathPoly, paint, gear } from '../../art/shapes.js';
import { JUMP_VY, METER } from '../../constants.js';

const PAL = { skin: '#F0D9B5', hair: '#B5502A', primary: '#7A2E1E', secondary: '#3A3A44', accent: '#C9A227', metal: '#C9A227', dark: '#3A3A44', glow: '#E86A1E' };
const CARRY = { armR: [30, 30], weapon: -100 };

/** Two-handed steam hammer (hand space: +x along the handle). */
function drawHammer(ctx, rig) {
  const ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -8, -2, 38, 4, 2, rig.col('#5a3a22'), ol, rig.ow);
  rrect(ctx, 24, -17, 14, 34, 3, rig.col(pal.metal), ol, rig.ow);
  rrect(ctx, 28, -24, 5, 8, 1, rig.col(pal.dark), ol, 1);
  circle(ctx, 31, -26, 3, rig.col('#e8f0f4'), null, 0);
  ctx.fillStyle = rig.col('rgba(255,255,255,0.3)'); ctx.fillRect(26, -14, 3, 28);
  ctx.fillStyle = rig.col(pal.glow); ctx.fillRect(30, -4, 4, 8);
}
function drawBeardFace(ctx, rig, pose, info) {
  const r = info.r, ol = rig.col(rig.outline);
  ctx.fillStyle = ol; ctx.fillRect(r * 0.35, -r * 0.25, 2.5, 2.5); ctx.fillRect(r * 0.2, -r * 0.55, r * 0.55, 1.5);
  rrect(ctx, -r * 0.6, r * 0.15, r * 1.6, r * 1.1, 2, rig.col(rig.palette.hair), ol, 1);
  ctx.fillStyle = rig.col('#8a3a1a'); ctx.fillRect(-r * 0.3, r * 0.5, r * 0.9, 2);
}
function drawGoggles(ctx, rig) {
  const ol = rig.col(rig.outline), r = rig.p.headR;
  ctx.fillStyle = rig.col('#3a2a1a'); ctx.fillRect(-r + 1, -r * 0.6, r * 2 - 2, 3);
  circle(ctx, 3, -r * 0.5, 3.2, rig.col('#9BC1E8'), ol, 1); circle(ctx, -3, -r * 0.5, 3.2, rig.col('#9BC1E8'), ol, 1);
}
function drawBoiler(ctx, rig) {
  const ol = rig.col(rig.outline), p = rig.p;
  rrect(ctx, -p.torsoW / 2 - 10, -p.torsoH + 2, 13, p.torsoH - 4, 4, rig.col(rig.palette.secondary), ol, rig.ow);
  rrect(ctx, -p.torsoW / 2 - 6, -p.torsoH - 6, 4, 9, 1, rig.col(rig.palette.dark), ol, 1);
  circle(ctx, -p.torsoW / 2 - 3.5, -p.torsoH / 2 + 2, 3, rig.col(rig.palette.glow), ol, 1);
}
function drawPauldron(ctx, rig) {
  const ol = rig.col(rig.outline), p = rig.p;
  gear(ctx, p.torsoW / 2 - 2, -p.torsoH + 3, 6, 7, rig.col(rig.palette.accent), ol, 1, 0, 2);
}
function portrait(ctx, x, y, s) {
  const cx = x + s / 2, cy = y + s / 2;
  circle(ctx, cx, cy - 2, 8, PAL.skin, '#1a1018', 1);
  rrect(ctx, cx - 7, cy + 1, 14, 9, 2, PAL.hair, '#1a1018', 1);
  ctx.fillStyle = '#3a2a1a'; ctx.fillRect(cx - 8, cy - 8, 16, 3);
  circle(ctx, cx - 3, cy - 7, 2.5, '#9BC1E8', '#1a1018', 1); circle(ctx, cx + 3, cy - 7, 2.5, '#9BC1E8', '#1a1018', 1);
  ctx.fillStyle = '#1a1018'; ctx.fillRect(cx - 4, cy - 2, 2, 2); ctx.fillRect(cx + 2, cy - 2, 2, 2);
}

const quakeHit = { damage: 25, type: 'knockdown', kbX: 5, kbY: 4, hitstun: 24 };
const special = { loop: false, frames: [
  { dur: 8, pose: STYLES.slam.w, sfx: 'hammer_swing', invuln: true },
  { dur: 4, pose: STYLES.slam.h, hitbox: areaBox(60, quakeHit), invuln: true, sfx: 'hammer_slam', fx: [{ kind: 'ring', x: 0, y: 0, r1: 60, flat: true, color: '#ffb060' }, { kind: 'dust', x: 0, y: 0, count: 8 }] },
  { dur: 12, pose: STYLES.slam.r },
  { dur: 4, pose: P({ ...CARRY, torso: 6 }), cancel: 'any' },
] };
const ring = (r, dmg, dur = 6) => ({ dur, pose: STYLES.raise.h, hitbox: areaBox(r, { damage: dmg, type: 'knockdown', kbX: 6, kbY: 5, hitstun: 24 }, { y: -90, h: 90 }), sfx: 'steam',
  fx: [{ kind: 'ring', x: 0, y: 0, r1: r, flat: true, color: '#e8f0f4' }, { kind: 'ring', x: 0, y: 30, r1: r * 0.8, color: '#ffb060' }, { kind: 'steam', x: 0, y: 40, count: 6 }] });
const superAnim = { loop: false, frames: [
  { dur: 9, pose: STYLES.raise.w, sfx: 'super_brunhild' },
  ring(60, 30), { dur: 4, pose: STYLES.raise.r }, ring(100, 30), { dur: 4, pose: STYLES.raise.r }, ring(140, 40),
  { dur: 10, pose: P({ ...CARRY, torso: 10, root: [0, 2] }) },
] };

const anims = makeHeroAnims({
  carry: CARRY, reach: 40, swingSfx: 'hammer_swing',
  combo: [
    { style: 'swing', dmg: 10, startup: 6, active: 3, recovery: 8, hitstun: 16, kbX: 2 },
    { style: 'backhand', dmg: 10, behind: true, startup: 5, active: 3, recovery: 8, hitstun: 16, kbX: 2 },
    { style: 'slam', dmg: 15, type: 'knockdown', kbX: 3, kbY: 4, startup: 7, active: 3, recovery: 10, armor: true, hitSfx: 'hammer_slam', fx: [{ kind: 'dust', x: 30, y: 0, count: 6 }] },
    { style: 'uppercut', dmg: 20, type: 'launch', kbX: 2, kbY: 8, startup: 7, active: 4, recovery: 12, armor: true, hitSfx: 'steam', fx: [{ kind: 'ring', x: 26, y: 40, r0: 2, r1: 24, color: '#ffb060' }, { kind: 'steam', x: 26, y: 40, count: 3 }] },
  ],
  jumpAttack: { style: 'airslam', dmg: 14, type: 'knockdown', kbX: 3, kbY: 4, active: 5, recovery: 20 },
  landAttack: { radius: 40, dmg: 10 },
  dashAttack: { style: 'charge', dmg: 18, type: 'knockdown', kbX: 24, kbY: 3, startup: 4, active: 14, move: { x: 8 }, armor: true, recovery: 10, cancel: false, sfx: 'steam' },
  special, super: superAnim,
});

/** Brunhild Coalheart character definition. */
export const brunhild = {
  id: 'brunhild', name: 'BRUNHILD', fullName: 'Brunhild Coalheart', title: 'THE BOILERWRIGHT', archetype: 'TANK',
  stats: { power: 5, speed: 2, health: 5, range: 3, technique: 2 },
  maxHp: hpFor(5), walkSpeed: speedFor(2), runSpeed: speedFor(2) * 1.7, jumpVy: JUMP_VY, reach: 40, grabReach: 20, grabOffset: 26,
  damageTaken: 0.85, freeChain: true,
  build: {
    scale: 1, palette: PAL, outline: '#2B2B30',
    proportions: { headR: 9, torsoW: 28, torsoH: 24, hip: 24, upperArm: 14, lowerArm: 12, armR: 6, upperLeg: 11, lowerLeg: 11, legR: 6.5, footL: 11 },
    parts: { face: drawBeardFace },
    weapon: { attach: 'handR', length: 38, draw: drawHammer },
    accessories: [{ attach: 'head', draw: drawGoggles }, { attach: 'back', draw: drawBoiler }, { attach: 'torso', draw: drawPauldron }],
  },
  anims,
  moves: {
    special: { name: 'PISTON QUAKE', cost: METER.special }, super: { name: 'OVERPRESSURE', cost: METER.super, damage: 100 },
    throwFwd: { damage: 20, vx: 12, vy: 5 }, throwBack: { damage: 22, vx: 6, vy: 4, shockwave: { r: 40, damage: 10 } }, grabHit: { damage: 8, hits: 3 },
  },
  sfx: { special: 'special_brunhild', super: 'super_brunhild', swing: 'hammer_swing' },
  portrait,
};
