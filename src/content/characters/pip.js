// Pip Gearlock & The Rig — Grappler (GDD 2.4). Placeholder rig with the GDD palette; complete moveset data.
import { makeHeroAnims, speedFor, hpFor, frontBox, areaBox, STYLES, P } from './common.js';
import { rrect, circle, pathPoly, paint, line } from '../../art/shapes.js';
import { JUMP_VY, METER } from '../../constants.js';

const PAL = { skin: '#F5E0C8', hair: '#C74E4E', primary: '#6B6B75', secondary: '#6B6B75', accent: '#C9A227', metal: '#8FA3B0', dark: '#3a3a44', glow: '#E86A1E' };
const CARRY = { armR: [24, 30], armL: [-24, 30], weapon: -90 };

/** Oversized claw hands (hand space). */
function drawClaw(ctx, rig, pose, info) {
  const ol = rig.col(rig.outline), pal = rig.palette;
  circle(ctx, 0, 0, info.r + 1, rig.col(pal.primary), ol, rig.ow);
  pathPoly(ctx, [2, -5, 14, -7, 8, -1]); paint(ctx, rig.col(pal.accent), ol, 1.5);
  pathPoly(ctx, [2, 5, 14, 7, 8, 1]); paint(ctx, rig.col(pal.accent), ol, 1.5);
}
/** Gnome head with the red hat; the cockpit cage is drawn around it. */
function drawGnomeHead(ctx, rig, pose, info) {
  const ol = rig.col(rig.outline), r = info.r;
  rrect(ctx, -r - 4, -r - 5, r * 2 + 8, r * 2 + 6, 2, null, rig.col(rig.palette.accent), 1);
  circle(ctx, 0, 0, r, rig.col(rig.palette.skin), ol, rig.ow);
}
function drawHat(ctx, rig) {
  const ol = rig.col(rig.outline), r = rig.p.headR;
  pathPoly(ctx, [-r, -r * 0.4, r, -r * 0.4, 1, -r - 8]); paint(ctx, rig.col(rig.palette.hair), ol, 1.5);
}
function drawBoilerAndStacks(ctx, rig) {
  const ol = rig.col(rig.outline), p = rig.p;
  circle(ctx, 0, -p.torsoH * 0.45, 6, rig.col(rig.palette.accent), ol, 1);
  circle(ctx, 0, -p.torsoH * 0.45, 3, rig.col(rig.palette.glow), null, 0);
  circle(ctx, 0, -p.torsoH * 0.8, 3.5, rig.col('#e8e8e0'), ol, 1); line(ctx, 0, -p.torsoH * 0.8, 2, -p.torsoH * 0.8 - 2, rig.col('#59C3A0'), 1);
  rrect(ctx, p.torsoW / 2 - 5, -p.torsoH - 8, 4, 10, 1, rig.col(rig.palette.dark), ol, 1);
  rrect(ctx, -p.torsoW / 2 + 1, -p.torsoH - 8, 4, 10, 1, rig.col(rig.palette.dark), ol, 1);
}
function portrait(ctx, x, y, s) {
  const cx = x + s / 2, cy = y + s / 2;
  rrect(ctx, cx - 11, cy - 10, 22, 20, 2, '#3a3a44', PAL.accent, 1);
  circle(ctx, cx, cy + 1, 6, PAL.skin, '#1a1018', 1);
  pathPoly(ctx, [cx - 7, cy - 2, cx + 7, cy - 2, cx, cy - 11]); paint(ctx, PAL.hair, '#1a1018', 1);
  ctx.fillStyle = '#1a1018'; ctx.fillRect(cx - 3, cy, 2, 2); ctx.fillRect(cx + 2, cy, 2, 2);
}

const ventHit = { damage: 6, type: 'light', kbX: 4, kbY: 0, hitstun: 12 };
const special = { loop: false, frames: [
  { dur: 10, pose: STYLES.vent.w, sfx: 'steam_vent' },
  ...[0, 1, 2, 3].map((i) => ({ dur: 4, pose: i % 2 ? STYLES.vent.r : STYLES.vent.h, hitbox: frontBox(80, ventHit, { high: true }), sfx: 'steam', fx: [{ kind: 'steam', x: 30 + i * 12, y: 30, count: 3 }] })),
  { dur: 10, pose: STYLES.vent.r },
  { dur: 4, pose: P({ ...CARRY, torso: 6 }), cancel: 'any' },
] };
const swingHit = { damage: 20, type: 'knockdown', kbX: 6, kbY: 4, hitstun: 24 };
const swing = (rot) => ({ dur: 14, pose: P({ armR: [110, -10], armL: [110, -10], torso: 10, weapon: -100, root: [0, 0, rot], legR: [20, 10], legL: [-20, 10] }),
  hitbox: areaBox(70, swingHit, { y: -80, h: 80 }), sfx: 'hydraulic', fx: [{ kind: 'ring', x: 0, y: 30, r0: 10, r1: 70, color: '#C9A227' }] });
const superAnim = { loop: false, frames: [
  { dur: 8, pose: STYLES.clap.w, event: 'wreckGrab', radius: 90, sfx: 'super_pip' },
  swing(-10), swing(10), swing(-10),
  { dur: 6, pose: STYLES.raise.r, event: 'wreckThrow', damage: 40, vx: 18, sfx: 'throw' },
  { dur: 8, pose: P({ ...CARRY, torso: 10, root: [0, 2] }) },
] };

const anims = makeHeroAnims({
  carry: CARRY, reach: 40, swingSfx: 'piston',
  combo: [
    { style: 'swing', dmg: 12, startup: 8, active: 3, recovery: 8, hitstun: 18, kbX: 2, hitSfx: 'claw' },
    { style: 'clap', dmg: 14, type: 'medium', behind: true, startup: 6, active: 3, recovery: 9, hitstun: 30, kbX: 1, hitSfx: 'claw' },
    { style: 'uppercut', dmg: 18, type: 'launch', kbX: 2, kbY: 8, startup: 7, active: 4, recovery: 12, hitSfx: 'piston', fx: [{ kind: 'steam', x: 20, y: 30, count: 3 }] },
  ],
  jumpAttack: { style: 'stomp', dmg: 16, type: 'knockdown', kbX: 3, kbY: 4, active: 6, recovery: 20 },
  landAttack: { radius: 30, dmg: 10 },
  dashAttack: { style: 'thrust', dmg: 6, startup: 4, active: 4, recovery: 24, cancel: false, sfx: 'grapple',
    projectile: { style: 'claw', speed: 6, maxDist: 140, damage: 6, type: 'light', hitstun: 14, kbX: 0, chained: true, onHit: 'reel', muzzle: false, offsetX: 20, offsetY: 36, color: '#C9A227', r: 8, life: 60 } },
  special, super: superAnim,
});

/** Pip Gearlock & The Rig character definition. */
export const pip = {
  id: 'pip', name: 'PIP', fullName: 'Pip Gearlock & The Rig', title: 'THE TINKERER', archetype: 'GRAPPLER',
  stats: { power: 4, speed: 2, health: 4, range: 3, technique: 3 },
  maxHp: hpFor(4), walkSpeed: speedFor(2), runSpeed: speedFor(2) * 1.7, jumpVy: JUMP_VY, reach: 40, grabReach: 30, grabOffset: 28,
  grabAll: true, grabDamageMult: 1.25, damageTaken: 1, freeChain: true,
  build: {
    scale: 1.2, palette: PAL, outline: '#2B2B30',
    proportions: { headR: 7, torsoW: 20, torsoH: 28, hip: 20, upperArm: 16, lowerArm: 15, armR: 6.5, handR: 6, upperLeg: 13, lowerLeg: 13, legR: 5, footL: 11 },
    parts: { hand: drawClaw, head: drawGnomeHead, hat: drawHat },
    accessories: [{ attach: 'torso', draw: drawBoilerAndStacks }],
  },
  anims,
  moves: {
    special: { name: 'STEAM VENT', cost: METER.special }, super: { name: 'WRECKING BALL', cost: METER.super, damage: 100 },
    throwFwd: { damage: 20, vx: 13, vy: 5 }, throwBack: { damage: 25, vx: 6, vy: 4, shockwave: { r: 40, damage: 10 } }, grabHit: { damage: 8, hits: 3 },
  },
  sfx: { special: 'special_pip', super: 'super_pip', swing: 'piston' },
  portrait,
};
