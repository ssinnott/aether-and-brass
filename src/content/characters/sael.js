// Sael Windwright — Speed (GDD 2.2). Placeholder rig with the GDD palette; complete moveset data.
import { makeHeroAnims, speedFor, hpFor, frontBox, areaBox, STYLES, P } from './common.js';
import { rrect, circle, pathPoly, paint, line } from '../../art/shapes.js';
import { METER } from '../../constants.js';

const PAL = { skin: '#F5E0C8', hair: '#EAF2F7', primary: '#2F6F8F', secondary: '#1C2A33', accent: '#D9B45B', metal: '#D8DCE0', dark: '#1C2A33', glow: '#8FE3FF' };
const CARRY = { armR: [30, 40], weapon: -60 };

/** Electro-rapier: 42px line with a 4px guard circle. */
function drawRapier(ctx, rig) {
  const ol = rig.col(rig.outline), pal = rig.palette;
  line(ctx, -4, 0, 4, 0, ol, 4); line(ctx, -4, 0, 4, 0, rig.col('#4a3020'), 2);
  circle(ctx, 5, 0, 4, rig.col(pal.accent), ol, 1);
  line(ctx, 6, 0, 42, 0, ol, 4); line(ctx, 6, 0, 42, 0, rig.col(pal.metal), 2);
  ctx.fillStyle = rig.col(pal.glow); ctx.fillRect(36, -1, 5, 2);
}
function drawEarsAndTail(ctx, rig) {
  const ol = rig.col(rig.outline), r = rig.p.headR;
  pathPoly(ctx, [-r * 0.4, 0, -r * 1.3, -r * 0.4, -r * 0.5, r * 0.4]); paint(ctx, rig.col(rig.palette.skin), ol, 1);
  rrect(ctx, -r - 4, -2, 5, 8, 2, rig.col(rig.palette.hair), ol, 1);
  rrect(ctx, -r - 8, 4, 5, 8, 2, rig.col(rig.palette.hair), ol, 1);
  rrect(ctx, -r - 11, 10, 4, 7, 2, rig.col(rig.palette.hair), ol, 1);
  ctx.fillStyle = rig.col('#3a2a1a'); ctx.fillRect(-r + 1, -r * 0.7, r * 2 - 2, 2.5);
  circle(ctx, 2, -r * 0.6, 2.5, rig.col('#9BC1E8'), ol, 1);
}
function drawScarf(ctx, rig) {
  const ol = rig.col(rig.outline), p = rig.p;
  rrect(ctx, -p.torsoW / 2 - 1, -p.torsoH - 1, p.torsoW + 2, 5, 2, rig.col('#C74E4E'), ol, 1);
  rrect(ctx, -p.torsoW / 2 - 12, -p.torsoH + 1, 12, 4, 2, rig.col('#C74E4E'), ol, 1);
}
function portrait(ctx, x, y, s) {
  const cx = x + s / 2, cy = y + s / 2;
  rrect(ctx, cx - 9, cy - 6, 6, 12, 2, PAL.hair, '#1a1018', 1);
  circle(ctx, cx, cy - 1, 8, PAL.skin, '#1a1018', 1);
  pathPoly(ctx, [cx - 6, cy - 2, cx - 13, cy - 5, cx - 6, cy + 1]); paint(ctx, PAL.skin, '#1a1018', 1);
  ctx.fillStyle = PAL.hair; ctx.fillRect(cx - 7, cy - 9, 14, 4);
  ctx.fillStyle = '#1a1018'; ctx.fillRect(cx + 1, cy - 2, 2, 2);
  ctx.fillStyle = '#C74E4E'; ctx.fillRect(cx - 6, cy + 6, 12, 3);
}

const thrustHit = { damage: 4, type: 'light', kbX: 0.5, kbY: 0, hitstun: 12 };
const special = { loop: false, frames: [
  { dur: 4, pose: STYLES.thrust.w, event: 'lockOn', radius: 70, invuln: true, sfx: 'special_sael' },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ dur: 3, pose: i % 2 ? STYLES.thrust.r : STYLES.thrust.h, hitbox: frontBox(40, thrustHit), invuln: i < 5, sfx: 'rapier', fx: [{ kind: 'slash', x: 24, y: 40, radius: 22, angle: (i - 3) * 15, sweep: 60, color: '#8FE3FF' }] })),
  { dur: 4, pose: STYLES.raise.h, hitbox: areaBox(50, { damage: 10, type: 'knockdown', kbX: 5, kbY: 4, hitstun: 24 }), sfx: 'rapier_arc', fx: [{ kind: 'ring', x: 0, y: 40, r0: 4, r1: 50, color: '#8FE3FF' }] },
  { dur: 8, pose: STYLES.raise.r },
  { dur: 4, pose: P({ ...CARRY, torso: 6 }), cancel: 'any' },
] };
const hopHit = { damage: 12, type: 'medium', kbX: 1, kbY: 0, hitstun: 20 };
const superFrames = [{ dur: 6, pose: STYLES.raise.w, sfx: 'super_sael' }];
for (let i = 0; i < 8; i++) {
  superFrames.push({ dur: 2, pose: STYLES.thrust.w, event: 'blink', sfx: 'aether_step' });
  superFrames.push({ dur: 4, pose: STYLES.thrust.h, hitbox: frontBox(40, hopHit), sfx: 'rapier', fx: [{ kind: 'slash', x: 24, y: 40, radius: 26, angle: 0, sweep: 80, color: '#8FE3FF' }] });
}
superFrames.push({ dur: 6, pose: STYLES.raise.h, hitbox: areaBox(60, { damage: 30, type: 'knockdown', kbX: 6, kbY: 5, hitstun: 24 }, { y: -90, h: 90 }), sfx: 'rapier_arc', fx: [{ kind: 'ring', x: 0, y: 40, r0: 4, r1: 60, color: '#ffffff' }, { kind: 'ring', x: 0, y: 0, r1: 60, flat: true, color: '#8FE3FF' }] });
superFrames.push({ dur: 10, pose: STYLES.raise.r });
const superAnim = { loop: false, frames: superFrames };

const anims = makeHeroAnims({
  carry: CARRY, reach: 34, swingSfx: 'rapier',
  combo: [
    { style: 'thrust', dmg: 5, startup: 4, active: 2, recovery: 6, hitstun: 14, kbX: 1.5, fx: [{ kind: 'slash', x: 26, y: 40, radius: 20, angle: 0, sweep: 50, color: '#8FE3FF' }] },
    { style: 'thrust', dmg: 5, startup: 4, active: 2, recovery: 6, hitstun: 14, kbX: 1.5, fx: [{ kind: 'slash', x: 26, y: 44, radius: 20, angle: -10, sweep: 50, color: '#8FE3FF' }] },
    { style: 'spin', dmg: 8, behind: true, startup: 5, active: 3, recovery: 8, hitstun: 16, kbX: 2, hitSfx: 'rapier_arc', fx: [{ kind: 'ring', x: 0, y: 40, r0: 4, r1: 40, color: '#8FE3FF' }] },
    { style: 'uppercut', dmg: 10, type: 'launch', kbX: 2, kbY: 8, startup: 5, active: 5, recovery: 10, move: { x: 4 }, hitSfx: 'rapier_arc' },
  ],
  jumpAttack: { style: 'dive', dmg: 12, type: 'medium', kbX: 3, kbY: 0, hitstun: 20, onHit: 'rebound', move: { x: 3, vy: -4 }, active: 24, recovery: 4 },
  dashAttack: { style: 'charge', dmg: 8, type: 'light', hitstun: 14, kbX: 2, startup: 2, active: 6, move: { x: 10 }, invuln: true, area: 30, recovery: 6, cancel: 'attack', sfx: 'aether_step',
    fx: [{ kind: 'ring', x: 0, y: 36, r0: 2, r1: 30, color: '#8FE3FF' }] },
  special, super: superAnim,
});
anims.dodge = { ...anims.dodge, frames: anims.dodge.frames.map((f, i) => (i === anims.dodge.frames.length - 1 ? { ...f, dur: 5 } : f)) };

/** Sael Windwright character definition. */
export const sael = {
  id: 'sael', name: 'SAEL', fullName: 'Sael Windwright', title: 'THE SKY-COURIER', archetype: 'SPEED',
  stats: { power: 2, speed: 5, health: 2, range: 2, technique: 5 },
  maxHp: hpFor(2), walkSpeed: speedFor(5), runSpeed: speedFor(5) * 1.7, jumpVy: 8.5, doubleJump: true, reach: 34, grabReach: 20, grabOffset: 24,
  damageTaken: 1.15, freeChain: true,
  build: {
    scale: 1.05, palette: PAL, outline: '#2B2B30',
    proportions: { headR: 8, torsoW: 16, torsoH: 26, hip: 14, upperArm: 14, lowerArm: 13, armR: 3.5, upperLeg: 18, lowerLeg: 18, legR: 4, footL: 9 },
    weapon: { attach: 'handR', length: 42, draw: drawRapier },
    accessories: [{ attach: 'head', draw: drawEarsAndTail }, { attach: 'torso', draw: drawScarf }],
  },
  anims,
  moves: {
    special: { name: 'TEMPEST WALTZ', cost: METER.special }, super: { name: 'SKY LANE', cost: METER.super, damage: 126 },
    throwFwd: { damage: 12, vx: 10, vy: 5, selfVy: 4 }, throwBack: { damage: 12, vx: 6, vy: 4 }, grabHit: { damage: 5, hits: 3 },
  },
  sfx: { special: 'special_sael', super: 'super_sael', swing: 'rapier' },
  portrait,
};
