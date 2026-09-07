// Placeholder demo rigs + animations. They prove the rig/animation system and serve as authoring examples
// for content/characters and content/enemies (which will replace them). Safe to delete once real content exists.
import { PALETTES } from './palettes.js';
import { P } from './poses.js';
import { rrect, circle, pathRrect, pathPoly, paint, gear } from './shapes.js';

// ---------- weapons (drawn in hand space: origin at the grip, +x along the forearm/blade) ----------
/** War hammer: handle along +x, big brass head at the end. */
export function drawHammer(ctx, rig) {
  const ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -6, -1.5, 30, 3, 1.5, rig.col('#6a4a2a'), ol, rig.ow);        // handle
  rrect(ctx, 20, -7, 12, 14, 2, rig.col(pal.metal), ol, rig.ow);          // head
  ctx.fillStyle = rig.col('rgba(255,255,255,0.25)'); ctx.fillRect(22, -5, 8, 2);
  ctx.fillStyle = rig.col(pal.accent); ctx.fillRect(25, -7, 2, 14);
  rrect(ctx, -8, -2.5, 5, 5, 1, rig.col(pal.accent), ol, rig.ow);          // pommel
}
/** Short dagger / shiv. */
export function drawDagger(ctx, rig) {
  const ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -4, -1.5, 8, 3, 1, rig.col('#4a3020'), ol, rig.ow);
  pathPoly(ctx, [4, -3, 18, 0, 4, 3]); paint(ctx, rig.col(pal.metal), ol, rig.ow);
  ctx.fillStyle = rig.col('rgba(255,255,255,0.35)'); ctx.fillRect(6, -1, 8, 1);
}
/** Heavy pipe club with a flange. */
export function drawPipeClub(ctx, rig) {
  const ol = rig.col(rig.outline), pal = rig.palette;
  rrect(ctx, -6, -2.5, 36, 5, 2.5, rig.col(pal.metal), ol, rig.ow);
  rrect(ctx, 22, -5, 6, 10, 1.5, rig.col(pal.accent), ol, rig.ow);
  rrect(ctx, 8, -4, 4, 8, 1, rig.col(pal.accent), ol, rig.ow);
  ctx.fillStyle = rig.col('rgba(255,255,255,0.22)'); ctx.fillRect(-3, -1.5, 26, 1.5);
}

// ---------- accessories ----------
/** Goggles pushed up on the forehead (head space). */
function drawGoggles(ctx, rig) {
  const ol = rig.col(rig.outline), r = rig.p.headR;
  ctx.fillStyle = rig.col('#3a2a1a'); ctx.fillRect(-r + 1, -r * 0.55, r * 2 - 2, 3);
  circle(ctx, 2, -r * 0.45, 3, rig.col('#7ae0ff'), ol, 1);
  circle(ctx, -3, -r * 0.45, 3, rig.col('#7ae0ff'), ol, 1);
}
/** Brass shoulder pad (torso space, near shoulder). */
function drawShoulderPad(ctx, rig) {
  const ol = rig.col(rig.outline), p = rig.p;
  pathRrect(ctx, -2, -(p.torsoH - 1), 12, 8, 3); paint(ctx, rig.col(rig.palette.metal), ol, rig.ow);
  ctx.fillStyle = rig.col(rig.palette.accent); ctx.fillRect(1, -(p.torsoH - 1) + 2, 2, 2); ctx.fillRect(6, -(p.torsoH - 1) + 2, 2, 2);
}
/** Backpack boiler with a gear (torso space, behind). */
function drawBoilerPack(ctx, rig) {
  const ol = rig.col(rig.outline), p = rig.p;
  pathRrect(ctx, -p.torsoW / 2 - 8, -p.torsoH + 2, 12, p.torsoH - 6, 4); paint(ctx, rig.col(rig.palette.metal), ol, rig.ow);
  gear(ctx, -p.torsoW / 2 - 2, -p.torsoH / 2, 5, 6, rig.col(rig.palette.accent), ol, 1, 0, 1.5);
}
/** Leather cap with a spike (head space). */
function drawSpikeCap(ctx, rig) {
  const ol = rig.col(rig.outline), r = rig.p.headR;
  ctx.beginPath(); ctx.arc(0, -1, r + 0.5, Math.PI, 0); ctx.closePath(); paint(ctx, rig.col('#5a4030'), ol, rig.ow);
  pathPoly(ctx, [-2, -r + 1, 0, -r - 6, 2, -r + 1]); paint(ctx, rig.col(rig.palette.metal), ol, 1);
}
/** Riveted iron helmet with a visor slit (head space). */
function drawIronHelm(ctx, rig) {
  const ol = rig.col(rig.outline), r = rig.p.headR;
  ctx.beginPath(); ctx.arc(0, 0, r + 1, Math.PI * 0.95, Math.PI * 0.12); ctx.lineTo(r + 1, 3); ctx.lineTo(-r - 1, 3); ctx.closePath();
  paint(ctx, rig.col(rig.palette.metal), ol, rig.ow);
  ctx.fillStyle = rig.col(rig.outline); ctx.fillRect(r * 0.2, -r * 0.35, r * 0.85, 2.5);
  ctx.fillStyle = rig.col(rig.palette.accent); ctx.fillRect(-r * 0.5, -r - 1, r, 2);
}

// ---------- animation sets ----------
/** Generic unarmed/armed animation set; `w` selects a weapon-carry style: 'hammer' | 'dagger' | 'club' | 'none'. */
export function makeDemoAnims(w = 'none') {
  const carry = w === 'hammer' ? { armR: [30, 30], weapon: -100 } : w === 'club' ? { armR: [25, 10], weapon: -20 } : w === 'dagger' ? { armR: [30, 40], weapon: -60 } : { armR: [20, 10] };
  const carry2 = { ...carry, armR: [carry.armR[0] + 4, carry.armR[1] + 4] };
  return {
    idle: { loop: true, frames: [
      { dur: 22, pose: P({ ...carry, armL: [-15, 12], torso: 2, root: [0, 0] }) },
      { dur: 22, pose: P({ ...carry2, armL: [-12, 16], torso: 4, root: [0, 1], head: 2 }) },
    ] },
    walk: { loop: true, frames: [
      { dur: 8, pose: P({ ...carry, legR: [28, 6], legL: [-24, 20], armL: [22, 20], torso: 5, root: [0, 0] }) },
      { dur: 8, pose: P({ ...carry2, legR: [4, 30], legL: [-2, 4], armL: [2, 12], torso: 5, root: [0, 1] }) },
      { dur: 8, pose: P({ ...carry, legR: [-24, 20], legL: [28, 6], armL: [-24, 10], torso: 5, root: [0, 0] }) },
      { dur: 8, pose: P({ ...carry2, legR: [-2, 4], legL: [4, 30], armL: [-4, 12], torso: 5, root: [0, 1] }) },
    ] },
    run: { loop: true, frames: [
      { dur: 6, pose: P({ ...carry, legR: [55, 20], legL: [-45, 60], armL: [45, 60], torso: 18, root: [0, -2] }) },
      { dur: 6, pose: P({ ...carry, legR: [-45, 60], legL: [55, 20], armL: [-35, 60], torso: 18, root: [0, 0] }) },
    ] },
    attack1: { loop: false, frames: [
      // wind-up: 240 (= -120, arm up-back) lerps to 80 THROUGH 180, i.e. the weapon sweeps over the head, not under the arm
      { dur: 5, pose: P({ armR: [240, -20], armL: [30, 30], torso: -12, head: -5, weapon: 20, legR: [10, 5], legL: [-15, 10] }), sfx: 'whiff' },
      { dur: 3, pose: P({ armR: [80, 0], armL: [-20, 10], torso: 22, head: 5, weapon: 50, legR: [30, 10], legL: [-25, 20], root: [3, 0] }),
        hitbox: { x: 16, y: -50, w: 44, h: 46, z: 24, damage: 8, kbX: 3, kbY: 0, hitstun: 16, type: 'light', once: true }, fx: [{ kind: 'slash', x: 22, y: -40 }] },
      { dur: 6, pose: P({ armR: [95, 5], armL: [-20, 10], torso: 24, head: 5, weapon: 90, legR: [30, 10], legL: [-25, 20], root: [3, 1] }), cancel: 'attack' },
      { dur: 8, pose: P({ ...carry, torso: 8, legR: [10, 5], legL: [-10, 10] }) },
    ] },
    attack2: { loop: false, frames: [
      { dur: 5, pose: P({ armR: [-90, -60], armL: [40, 30], torso: -16, root: [-2, 2], weapon: w === 'hammer' ? -60 : 0, legR: [10, 20], legL: [-10, 10] }), sfx: 'whiff' },
      { dur: 4, pose: P({ armR: [60, 0], armL: [-30, 10], torso: 26, root: [6, 0], weapon: w === 'hammer' ? -60 : 0, legR: [40, 10], legL: [-30, 30] }),
        hitbox: { x: 18, y: -40, w: 48, h: 40, z: 24, damage: 14, kbX: 6, kbY: 6, hitstun: 24, type: 'heavy', once: true }, fx: [{ kind: 'ring', x: 30, y: 0 }] },
      { dur: 8, pose: P({ armR: [50, 5], armL: [-30, 10], torso: 24, root: [6, 1], weapon: w === 'hammer' ? -60 : 0, legR: [40, 10], legL: [-30, 30] }) },
      { dur: 8, pose: P({ ...carry, torso: 6 }) },
    ] },
    hurt: { loop: false, frames: [
      { dur: 4, pose: P({ ...carry, torso: -24, head: -22, armL: [-50, -30], armR: [-10, 60], root: [-5, 1], legR: [18, 0], legL: [-12, 10], weapon: -40 }) },
      { dur: 10, pose: P({ ...carry, torso: -12, head: -10, armL: [-30, -20], root: [-2, 1], legR: [12, 0], legL: [-8, 8] }) },
      { dur: 6, pose: P({ ...carry, torso: 0 }) },
    ] },
    knockdown: { loop: true, frames: [
      { dur: 8, pose: P({ armR: [-60, -40], armL: [-80, -30], torso: -50, head: -20, legR: [50, 30], legL: [30, 50], root: [0, -6, -25], weapon: -40 }) },
      { dur: 8, pose: P({ armR: [-70, -50], armL: [-90, -30], torso: -55, head: -25, legR: [60, 20], legL: [40, 40], root: [0, -6, -35], weapon: -40 }) },
    ] },
    lying: { loop: true, frames: [
      { dur: 30, pose: P({ armR: [35, 15], armL: [25, 20], torso: 4, head: -10, legR: [10, 8], legL: [-4, 6], root: [34, -9, -88], weapon: 10 }) },
    ] },
    jump: { loop: false, frames: [
      { dur: 6, pose: P({ ...carry, legR: [45, -85], legL: [25, -65], armL: [-60, -20], torso: 8, root: [0, 0] }) },
      { dur: 30, pose: P({ ...carry, legR: [35, -75], legL: [20, -55], armL: [-40, -10], torso: 6 }) },
    ] },
    jumpAttack: { loop: false, frames: [
      { dur: 4, pose: P({ armR: [260, -30], armL: [40, 20], torso: -10, legR: [40, -60], legL: [10, -30], weapon: 20 }), sfx: 'whiff' },
      { dur: 4, pose: P({ armR: [85, 5], armL: [-30, 10], torso: 20, legR: [40, -60], legL: [10, -30], weapon: 45 }),
        hitbox: { x: 10, y: -46, w: 42, h: 44, z: 24, damage: 10, kbX: 4, kbY: 5, hitstun: 20, type: 'knockdown', once: true } },
      { dur: 20, pose: P({ armR: [95, 10], armL: [-30, 10], torso: 22, legR: [40, -60], legL: [10, -30], weapon: 80 }) },
    ] },
    dead: { loop: false, frames: [
      { dur: 60, pose: P({ armR: [40, 10], armL: [30, 15], torso: 8, head: -14, legR: [6, 4], legL: [-6, 6], root: [34, -9, -90], weapon: 15 }) },
    ] },
    win: { loop: true, frames: [
      { dur: 20, pose: P({ armR: [-170, -10], armL: [-20, 10], torso: -4, head: -6, weapon: -20, root: [0, 0] }) },
      { dur: 20, pose: P({ armR: [-175, -20], armL: [-25, 15], torso: -6, head: -10, weapon: -30, root: [0, -2] }) },
    ] },
  };
}

/** Demo registry entries: { id, name, build, anims }. */
export const DEMO_RIGS = [
  {
    id: 'demo_hero', name: 'HAMMERSMITH',
    build: { scale: 1, palette: PALETTES.hero, weapon: { attach: 'handR', length: 32, draw: drawHammer },
      accessories: [{ attach: 'head', draw: drawGoggles }, { attach: 'torso', draw: drawShoulderPad }, { attach: 'back', draw: drawBoilerPack }] },
    anims: makeDemoAnims('hammer'),
  },
  {
    id: 'demo_goblin', name: 'COG GOBLIN',
    build: { scale: 0.8, palette: PALETTES.goblin, proportions: { headR: 11, torsoW: 20, torsoH: 22, upperArm: 14, lowerArm: 13, upperLeg: 12, lowerLeg: 12 },
      weapon: { attach: 'handR', length: 18, draw: drawDagger }, accessories: [{ attach: 'head', draw: drawSpikeCap }] },
    anims: makeDemoAnims('dagger'),
  },
  {
    id: 'demo_brute', name: 'BOILER BRUTE',
    build: { scale: 1.3, palette: PALETTES.brute, proportions: { headR: 8, torsoW: 28, torsoH: 28, hip: 22, upperArm: 15, lowerArm: 14, handR: 5, armR: 6, legR: 6.5, footL: 12 },
      weapon: { attach: 'handR', length: 34, draw: drawPipeClub }, accessories: [{ attach: 'head', draw: drawIronHelm }, { attach: 'torso', draw: drawShoulderPad }] },
    anims: makeDemoAnims('club'),
  },
  {
    id: 'demo_duelist', name: 'AETHER DUELIST',
    build: { scale: 0.95, palette: PALETTES.duelist, proportions: { torsoW: 20, upperLeg: 16, lowerLeg: 16 },
      weapon: { attach: 'handR', length: 22, draw: drawDagger }, accessories: [{ attach: 'head', draw: drawGoggles }] },
    anims: makeDemoAnims('dagger'),
  },
];
