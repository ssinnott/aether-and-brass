// Stage 2 mid-boss: QUARTERMASTER SKREE & THE GRAPNEL WINCH (docs/STAGE2.md section 5.1).
// The Ninth Wing's quartermaster fights strapped into the freighter's cargo winch: a drum of chain on a harness with
// a grapnel on the end. Phase 1 is the winch — armoured, unlaunchable, and every third attack jams the drum wide open
// (the punish window). Phase 2 is Skree herself, cut loose from the harness: no armour, grabbable, and fast.
//
// Reuses the Stormcrow rig (./stormcrowRig.js) so the mid-boss reads as "one of them, but bigger": same beaked mask,
// same coat, same lens tell. What is new is the harness — a drum, a boom arm and the chain — drawn as accessories.
import { enemyAttack } from './common.js';
import {
  CROW, CROW_PAL, CROW_PROPS, CROW_PARTS, CROW_BACK, FK, makeCrowBase, crowWings, crowTails, drawBoardingAxe,
} from './stormcrowRig.js';
import { celRect, celBall, celCapsule, tones } from '../../art/shading.js';
import { pathPoly, paint, circle, capsule } from '../../art/shapes.js';
import { particles } from '../../engine/particles.js';

const R = Math.round, TAU = Math.PI * 2;
const DRUM = '#4E4535', CHAIN = '#7A828E', HOT = '#FFD27A';

// ---------------------------------------------------------------- harness art
/**
 * The winch harness (back accessory, torso space): a chain drum on the shoulder with a stubby boom arm over it.
 * The drum spins while the chain is out (`rig.chainOut`) and locks solid, venting, while the winch is jammed
 * (`rig.jammed`) — the read that says "hit me now".
 */
function drawWinch(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), x = -hw - 6, y = -R(p.torsoH * 0.78);
  celRect(ctx, rig, x - 4, y - 4, 20, 26, 3, CROW.pewterDark, 0.36, 0.28);
  const a = rig.jammed ? 0 : (rig.chainOut ? rig.tick * 0.42 : rig.tick * 0.06);
  ctx.save(); ctx.translate(x + 6, y + 9); ctx.rotate(a);
  celBall(ctx, rig, 0, 0, 9, DRUM, true);
  if (!rig.override) {
    ctx.strokeStyle = rig.col(CHAIN); ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, 5 + i * 1.8, 0, TAU); ctx.stroke(); }
  }
  ctx.restore();
  // boom arm reaching over the near shoulder, with the fairlead the chain runs through
  celCapsule(ctx, rig, x + 8, y - 2, hw + 6, -R(p.torsoH * 0.95), 3.5, CROW.copper, 0.3);
  celBall(ctx, rig, hw + 6, -R(p.torsoH * 0.95), 4, CROW.pewter, true);
  if (rig.override) return;
  if (rig.jammed) {
    ctx.fillStyle = 'rgba(255,210,122,0.35)';
    ctx.beginPath(); ctx.arc(x + 6, y + 9, 14, 0, TAU); ctx.fill();
    ctx.fillStyle = rig.col(HOT); ctx.fillRect(x + 2, y - 6, 8, 3);
  }
  ctx.fillStyle = tones(rig, CROW.copper).deep; ctx.fillRect(x + 10, y - 4, 10, 2);
}
/** The grapnel projectile: three flukes on a chain running back to the winch. */
function drawGrapnel(ctx, p, sx, sy) {
  const y = sy - p.r, d = p.facing;
  ctx.save(); ctx.translate(sx, y); ctx.scale(d, 1);
  capsule(ctx, -12, 0, 6, 0, 3, CHAIN, CROW.outline, 1);
  for (let i = 0; i < 3; i++) {
    const a = -0.7 + i * 0.7;
    pathPoly(ctx, [4, 0, 4 + Math.cos(a) * 13, Math.sin(a) * 13, 8 + Math.cos(a) * 13, Math.sin(a) * 13 + 3, 6, 3]);
    paint(ctx, CHAIN, CROW.outline, 1);
  }
  circle(ctx, -12, 0, 4, CROW.pewterDark, CROW.outline, 1);
  ctx.restore();
}

// ---------------------------------------------------------------- builds
const SKREE_PAL = { ...CROW_PAL, primary: '#3A4256', sleeve: '#3A4256', secondary: '#252B3C', metal: '#B4BECA' };
/** Phase 1/2: Skree in the harness — 1.45x the line rig, the winch on her back. */
const WINCH_BUILD = {
  scale: 1.45, palette: SKREE_PAL, outline: CROW.outline, outlineWidth: 1, proportions: CROW_PROPS,
  parts: CROW_PARTS, clan: '#C4913A', smearColor: '#DCE6F4',
  weapon: { attach: 'handR', length: 42, draw: drawBoardingAxe, headAt: 32 },
  accessories: [{ attach: 'back', draw: crowWings }, { attach: 'back', draw: drawWinch }, { attach: 'back', draw: crowTails }],
};
/** Phase 3: cut loose. Same woman, no drum, no boom: only the axe and a very bad mood. */
const SKREE_BUILD = { ...WINCH_BUILD, scale: 1.3, accessories: CROW_BACK };

// ---------------------------------------------------------------- animations
const WC = { armR: [30, 20], weapon: -12, armL: [-20, -12] };
/** Grapnel: the chain runs out along the lane and yanks whoever it catches back toward the winch (negative kbX). */
const GRAPNEL = {
  style: 'claw', chained: true, speed: 6.5, maxDist: 300, life: 72,
  damage: 22, type: 'knockdown', kbX: -5, kbY: 4, hitstun: 24, offsetX: 34, offsetY: 58, r: 9, muzzle: false, draw: drawGrapnel,
};
const winchAnims = Object.assign(makeCrowBase(WC), {
  // grapnel shot: 30f haul the drum round (lenses hot, chain rattling) -> fire -> 40f reel back in (punish)
  grapnel: enemyAttack({ style: 'shot', tell: 30, active: 8, recovery: 40, noHitbox: true, event: 'spawnProjectile', projectile: GRAPNEL,
    tellSfx: 'hook_yank', sfx: 'hook_yank', fx: [{ kind: 'spark', x: 46, y: 54, count: 3 }] }, WC),
  // chain sweep: the drum pays out and she swings the whole length in a circle — both lanes, both sides
  chainSweep: enemyAttack({ style: 'spin', tell: 28, active: 14, recovery: 34, reach: 96, dmg: 20, type: 'knockdown', kbX: 7, kbY: 3,
    hitstun: 24, behind: true, tellSfx: 'crow_call', sfx: 'whiff', fx: [{ kind: 'slash', x: 0, y: 52, radius: 74, angle: 0, sweep: 220 }] }, WC),
  // drum slam: she drops the whole winch on the deck; a shockwave goes out along the plates
  slam: enemyAttack({ style: 'slam', tell: 32, active: 10, recovery: 36, area: 72, dmg: 22, type: 'knockdown', kbX: 5, kbY: 5,
    hitstun: 26, tellSfx: 'hydraulic', sfx: 'hammer_slam', fx: [{ kind: 'ring', x: 0, y: 6, r0: 8, r1: 74, color: '#DCE6F4' }, { kind: 'dust', x: 0, y: 0, count: 8 }] }, WC),
  // intro: she plants the axe, the drum spins up and she calls the deck to order
  intro: { loop: false, frames: [
    FK(26, { ...WC, torso: -4, head: -6, root: [0, 2], legR: [14, 10], legL: [-14, 10], squash: 1.04, stretch: 0.96 }, { sfx: 'hydraulic', ease: 'out' }),
    FK(24, { ...WC, armR: [-150, -20], weapon: -40, armL: [-40, -30], torso: -10, head: -14, root: [0, -1], face: 'shout' }, { sfx: 'crow_call', ease: 'inout', fx: [{ kind: 'spark', x: -12, y: 78, count: 5 }] }),
    FK(22, { ...WC, torso: 8, head: 4, root: [0, 1], face: 'angry' }, { ease: 'inout' }),
  ] },
  // phase change: the harness blows its pins, the drum drops off her back and she steps out of it
  phaseChange: { loop: false, frames: [
    FK(16, { ...WC, torso: -18, head: -20, armR: [-40, 30], armL: [-70, -30], root: [-4, 0], face: 'hurt' }, { sfx: 'prop_break', ease: 'out' }),
    FK(14, { ...WC, torso: 20, head: 6, root: [2, 4], legR: [36, 44], legL: [-26, 44], squash: 1.12, stretch: 0.9, face: 'grit' }, { ease: 'in', fx: [{ kind: 'debris', x: -10, y: 40, count: 8 }, { kind: 'dust', x: 0, y: 0, count: 8 }] }),
    FK(14, { ...WC, torso: 4, head: -6, root: [0, 1], face: 'angry' }, { ease: 'out' }),
  ] },
  // defeat: the axe goes, she folds over the rail and the wing-pack fizzles out
  defeat: { loop: false, frames: [
    FK(20, { ...WC, torso: -16, head: -22, armR: [-20, 50], armL: [-70, -50], weapon: -40, root: [-4, 0], legR: [24, 6], legL: [-16, 14], face: 'hurt' }, { sfx: 'crow_death', ease: 'out' }),
    FK(18, { ...WC, torso: 28, head: -4, armR: [40, 44], armL: [24, 38], root: [0, 5], legR: [40, 44], legL: [-28, 46], squash: 1.12, stretch: 0.9, face: 'dazed' }, { ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }] }),
    FK(60, { armR: [-22, -6], weapon: -14, armL: [28, 18], torso: 8, head: -16, legR: [12, 10], legL: [-4, 8], root: [26, -8, -88], face: 'dazed' }, { ease: 'out' }),
  ] },
});
const SC = { armR: [28, 22], weapon: -10, armL: [-24, -16] };
const skreeAnims = Object.assign(makeCrowBase(SC), {
  // axe combo: a chopping first hit that chains straight into a rising second
  chop: enemyAttack({ style: 'slam', tell: 20, active: 9, recovery: 24, reach: 54, dmg: 16, type: 'medium', kbX: 5, hitstun: 20,
    tellSfx: 'crow_call', sfx: 'hammer_slam', fx: [{ kind: 'slash', x: 44, y: 44, radius: 26, angle: 40, sweep: 90 }] }, SC),
  rip: enemyAttack({ style: 'uppercut', tell: 16, active: 9, recovery: 30, reach: 48, dmg: 18, type: 'launch', kbX: 3, kbY: 8, hitstun: 24,
    tellSfx: 'crow_call', sfx: 'hammer_slam', fx: [{ kind: 'slash', x: 38, y: 50, radius: 28, angle: -70, sweep: 110 }] }, SC),
  // wing hop: she kicks the pack and crosses the deck, axe first
  swoop: enemyAttack({ style: 'charge', tell: 22, active: 12, recovery: 30, reach: 50, dmg: 18, type: 'knockdown', kbX: 7, kbY: 4,
    hitstun: 24, move: { x: 7 }, tellSfx: 'gale', sfx: 'whiff', fx: [{ kind: 'spark', x: -14, y: 40, count: 4 }] }, SC),
  // rally: two fingers to the mask and the watch below sends up two Crimpers
  rally: enemyAttack({ style: 'raise', tell: 26, active: 8, recovery: 34, noHitbox: true, event: 'summon',
    summon: [{ type: 'stormcrow', variant: 'crimper' }, { type: 'stormcrow', variant: 'crimper' }], tellSfx: 'crow_call', sfx: 'crow_call' }, SC),
  phaseChange: winchAnims.phaseChange,
  defeat: winchAnims.defeat,
});

/** Quartermaster Skree & the Grapnel Winch — the Stage 2 mid-boss. */
export const midboss2 = {
  id: 'midboss2', type: 'midboss2', variant: 'skree', name: 'QUARTERMASTER SKREE', subtitle: '& THE GRAPNEL WINCH',
  role: 'boss', bossKind: 'midboss', boss: true, music: 'midboss2',
  build: WINCH_BUILD, anims: winchAnims, score: 5000, drops: ['food_big', 'meter', 'score_big'],
  grabbable: false, throwDamageMult: 1, sfx: { hurt: 'crow_hurt', death: 'crow_death' },
  hooks: {
    /** Art state: the drum spins while the chain is out and locks, venting, while the winch is jammed. */
    onUpdate(f) {
      const n = f.anim.name;
      f.rig.chainOut = n === 'grapnel' && f.anim.frameIndex >= 2;
      f.rig.jammed = !!f.stalled;
      f.rig.wings = n === 'swoop' || f.airborne;
    },
    onPhase(f, i, world) {
      if (!world || i !== 1) return;
      particles.burst('debris', f.x, f.h * 0.6, f.z, 14, { speed: 3.6, up: 2.6, color: DRUM, sizeJitter: 2 });
      particles.burst('spark', f.x, f.h * 0.6, f.z, 10, { speed: 3, up: 2 });
      world.addFx('ring', f.x, 40, f.z, { r0: 8, r1: 110, color: '#DCE6F4' });
    },
  },
  ai: { attackRange: 80, zTolerance: 18, attackCooldown: [44, 84], firstAttackDelay: 40, ignoresTokens: true, retreatChance: 0, flank: false },
  phases: [
    { name: 'THE GRAPNEL WINCH', hp: 320, color: '#9AA6B4', armor: true, unlaunchable: true, walkSpeed: 1.1,
      ai: { attacks: [{ anim: 'chainSweep', range: 104, weight: 4 }, { anim: 'slam', range: 76, weight: 3 }, { anim: 'grapnel', range: 300, minRange: 90, weight: 3 }],
        // every third attack the drum jams wide open: 3x damage and she can be grabbed out of it
        stallEvery: 3, stallFrames: 80, stallDamageMult: 3, stallGrabbable: true } },
    { name: 'SKREE', hp: 160, color: '#C4913A', armor: false, unlaunchable: false, grabbable: true, walkSpeed: 2.2,
      build: SKREE_BUILD, anims: skreeAnims,
      ai: { attackRange: 54, zTolerance: 14, attackCooldown: [30, 64], evadeChance: 0.4, evadeCooldown: 100,
        attacks: [{ anim: 'chop', range: 60, weight: 4, chain: 'rip' }, { anim: 'rip', range: 56, weight: 2 },
          { anim: 'swoop', range: 190, minRange: 70, weight: 3 }, { anim: 'rally', range: 400, weight: 1, maxUses: 1 }] } },
  ],
};
