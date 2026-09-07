// Stage 2 final boss: ADMIRAL ODALINE KESTREL, THE NINTH WING (docs/STAGE2.md section 5.2).
// Three phases on the flagship's bridge, each one stripping something off her:
//   1. THE ADMIRAL   (420) — bicorne, storm lance, and the fleet at her back: thrusts, a sweeping cut, and a
//      BROADSIDE she calls down from the guns below; escorts board at 66% and 33%.
//   2. STORM-WING    (400) — the wing-harness opens. She steps through the air (a violet gale-step that always
//      answers a combo), throws chain lightning down a lane, and every 150 HP the coil VENTS: 2x damage, no attacks.
//   3. THE LAST CROW (260) — harness gone, no armour, grabbable. A five-hit lance string and one last powder keg.
// Rig, palette and base animations come from ./stormcrowRig.js; the bicorne, epaulettes, cape and open harness are
// the only new art. Data + small hooks only (ARCHITECTURE.md section 14).
import { enemyAttack, frontBox } from './common.js';
import {
  CROW, CROW_PAL, CROW_PROPS, CROW_PARTS, crowWings, crowTails, FK, makeCrowBase,
} from './stormcrowRig.js';
import { celRect, celBall, celPoly, celCapsule, tones, rimTop } from '../../art/shading.js';
import { pathPoly, paint, circle } from '../../art/shapes.js';
import { particles } from '../../engine/particles.js';

const R = Math.round, TAU = Math.PI * 2;
const GOLD = '#D8AE52', GOLD_DK = '#8A6A26', COAT = '#1F2740', COAT_DK = '#141A2C', SASH = '#7C2B34';

// ---------------------------------------------------------------- admiral art
/** Bicorne worn athwart, with a gold cord and the Wing's storm badge (hat hook, head space). */
function bicorne(ctx, rig, pose, inf) {
  const r = inf.r;
  celPoly(ctx, rig, [-r - 9, R(-r * 0.75), -r - 3, R(-r * 1.5), R(r * 0.1), R(-r * 1.72), r + 3, R(-r * 1.5), r + 9, R(-r * 0.75), R(r * 0.6), R(-r * 1.02), R(-r * 0.6), R(-r * 1.02)], COAT_DK, 0.34, 0.28);
  if (rig.override) return;
  ctx.fillStyle = rig.col(GOLD);
  ctx.fillRect(R(-r * 0.9), R(-r * 1.12), R(r * 1.8), 2);
  ctx.beginPath(); ctx.moveTo(R(r * 0.2), R(-r * 1.62)); ctx.lineTo(R(r * 0.7), R(-r * 1.16)); ctx.lineTo(R(-r * 0.3), R(-r * 1.16)); ctx.closePath(); ctx.fill();
  celBall(ctx, rig, R(r * 0.2), R(-r * 1.2), 3, CROW.spark, false);
  rimTop(ctx, rig, -r - 4, R(-r * 1.45), R(r * 0.2), R(-r * 1.68), '#3A4256');
}
/** Admiral's coat: the Stormcrow silhouette with a gold-frogged front, a wine sash and heavy epaulettes. */
function admiralCoat(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2), pal = inf.pal;
  celPoly(ctx, rig, [-hw - 3, -H + 4, -hw + 1, -H - 1, hw - 1, -H - 1, hw + 3, -H + 4, hw + 4, 2, -hw - 4, 2], pal.primary, 0.36, 0.28);
  if (rig.override) return;
  const t = tones(rig, pal.primary);
  ctx.fillStyle = t.hi; ctx.fillRect(-hw + 1, -H - 1, W - 2, 3);
  // gold frogging: four bars down the chest
  ctx.fillStyle = rig.col(GOLD);
  for (let i = 0; i < 4; i++) ctx.fillRect(-R(W * 0.26), -H + 6 + i * 6, R(W * 0.52), 2);
  ctx.fillStyle = rig.col(GOLD_DK);
  for (let i = 0; i < 4; i++) ctx.fillRect(-R(W * 0.26), -H + 8 + i * 6, R(W * 0.52), 1);
  // wine sash across the body + a gold clasp
  ctx.strokeStyle = rig.col(SASH); ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-hw + 1, -H + 6); ctx.lineTo(hw, -R(H * 0.2)); ctx.stroke();
  celBall(ctx, rig, R(W * 0.3), -R(H * 0.26), 3, GOLD, false);
  // epaulettes
  for (const sx of [-hw + 1, hw - 5]) {
    celRect(ctx, rig, sx - 1, -H - 2, 6, 5, 2, GOLD, 0.36, 0.32);
    ctx.fillStyle = rig.col(GOLD_DK); ctx.fillRect(sx, -H + 2, 5, 4);
  }
  ctx.fillStyle = t.deep; ctx.fillRect(-hw + 1, -R(H * 0.14), W - 2, 1);
}
/** Storm cape (back accessory): a long panel on a 3-link chain, wine on the inside. */
function admiralCape(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2);
  const ang = rig.tick * 0.05;
  celPoly(ctx, rig, [-hw + 2, -p.torsoH - 1, hw - 2, -p.torsoH - 1, hw + 4 + Math.sin(ang) * 2, 20, 0, 30, -hw - 5 + Math.sin(ang) * 2, 22], COAT_DK, 0.4, 0.18);
  if (rig.override) return;
  ctx.fillStyle = rig.col(SASH); ctx.fillRect(-hw + 3, -p.torsoH, R(p.torsoW) - 6, 3);
}
/** The open wing-harness of phase 2: four violet-lit vanes standing off the shoulders (back accessory). */
function stormHarness(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), y = -R(p.torsoH * 0.8);
  for (let i = 0; i < 4; i++) {
    const a = -40 - i * 30 + Math.sin(rig.tick * 0.08 + i) * 3;
    ctx.save(); ctx.translate(-hw - 1, y + i * 3); ctx.rotate(a * Math.PI / 180);
    celPoly(ctx, rig, [0, -3, -34, -8, -42, 0, -32, 6, 0, 4], i & 1 ? CROW.pewterDark : COAT_DK, 0.36, 0.26);
    if (!rig.override) { ctx.fillStyle = rig.col(CROW.spark); ctx.fillRect(-30, -1, 22, 1.5); }
    ctx.restore();
  }
  celCapsule(ctx, rig, -hw - 2, y - 4, -hw - 2, y + 12, 4.5, CROW.copper, 0.3);
  if (rig.override) return;
  // the coil core: a steady violet spark, blown wide open while the vent window is up (rig.venting)
  const vent = rig.venting ? 1 : 0;
  if (vent) { ctx.fillStyle = 'rgba(215,203,255,0.35)'; ctx.beginPath(); ctx.arc(-hw - 2, y + 4, 16, 0, TAU); ctx.fill(); }
  ctx.fillStyle = rig.col(vent ? '#FFFFFF' : CROW.sparkPale);
  ctx.beginPath(); ctx.arc(-hw - 2, y + 4, 3 + vent * 3 + (rig.tick % 8) * 0.2, 0, TAU); ctx.fill();
}
/** Storm lance: a long pewter haft with a gold cage and a coil head that lights while `rig.coil` climbs. */
function drawLance(ctx, rig) {
  const k = rig.coil || 0;
  celCapsule(ctx, rig, -18, 0, 44, 0, 2.8, CROW.pewterDark, 0.3);
  celBall(ctx, rig, -18, 0, 4, GOLD, false);
  celPoly(ctx, rig, [40, -6, 58, -3, 66, 0, 58, 3, 40, 6], CROW.pewter, 0.34, 0.32);
  for (let i = 0; i < 3; i++) celBall(ctx, rig, 42 + i * 5, 0, 3.4, GOLD, false);
  if (rig.override) return;
  ctx.fillStyle = rig.col(k > 0.05 ? CROW.sparkPale : CROW.glass);
  ctx.beginPath(); ctx.arc(64, 0, 3 + k * 3, 0, TAU); ctx.fill();
  if (k <= 0.05) return;
  ctx.strokeStyle = rig.col(CROW.spark); ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = rig.tick * 0.7 + i * 2.1;
    ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64 + Math.cos(a) * (9 + k * 9), Math.sin(a) * (9 + k * 9)); ctx.stroke();
  }
}
/** Falling broadside shell: a ribbed iron shot with a violet fuse ring. */
function drawShell(ctx, p, sx, sy) {
  const y = sy - p.r;
  circle(ctx, sx, y, p.r, '#3A4150', CROW.outline, 1);
  circle(ctx, sx - 2, y - 2, p.r * 0.4, '#5C6675', null, 0);
  pathPoly(ctx, [sx - 3, y - p.r - 4, sx + 3, y - p.r - 4, sx + 2, y - p.r, sx - 2, y - p.r]); paint(ctx, CROW.spark, CROW.outline, 1);
}

// ---------------------------------------------------------------- builds
const ADM_PAL = { ...CROW_PAL, primary: COAT, sleeve: COAT, secondary: COAT_DK, accent: GOLD, metal: '#C2CCD8', glow: CROW.spark };
const BASE_BUILD = {
  scale: 1.22, palette: ADM_PAL, outline: CROW.outline, outlineWidth: 1, proportions: CROW_PROPS,
  parts: { ...CROW_PARTS, torso: admiralCoat, hat: bicorne }, clan: SASH, smearColor: '#E4ECFA',
  weapon: { attach: 'handR', length: 66, draw: drawLance, headAt: 56 },
};
/** Phase 1: bicorne, cape, folded wings. */
const ADMIRAL_BUILD = { ...BASE_BUILD, accessories: [{ attach: 'back', draw: crowWings }, { attach: 'back', draw: admiralCape }] };
/** Phase 2: the harness opens and the cape goes; the bicorne stays. */
const WING_BUILD = { ...BASE_BUILD, accessories: [{ attach: 'back', draw: stormHarness }, { attach: 'back', draw: crowTails }] };
/** Phase 3: hat off, harness gone. Just a woman with a lance on a burning bridge. */
const CROW_BUILD = { ...BASE_BUILD, scale: 1.14, parts: { ...CROW_PARTS, torso: admiralCoat }, accessories: [{ attach: 'back', draw: crowTails }] };

// ---------------------------------------------------------------- projectiles
/** BROADSIDE: four shells walk down the deck from the guns below (they hurt her own boarders too). */
const SHELL = {
  fromSky: true, style: 'shell', height: 240, gravity: 0.5, life: 220, count: 4, spacing: 62, ahead: 30,
  noContactHit: true, onExpire: 'explode', radius: 44, r: 8, muzzle: false, draw: drawShell,
  explodeHit: { damage: 18, type: 'knockdown', kbX: 4, kbY: 5, hitstun: 22, friendly: true },
};
/** The last keg she has: lobbed where a hero stood half a second ago. */
const KEG = {
  style: 'bomb', aimAt: true, flight: 44, gravity: 0.4, noContactHit: true, bounces: 1, rest: true, life: 90,
  onExpire: 'explode', radius: 38, r: 7, muzzle: false, offsetX: 6, offsetY: 60, color: '#4A3A2E',
  explodeHit: { damage: 16, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 22, friendly: true },
  reflectable: true, damageOnReflect: 24, reflectSpeed: 6,
};

// ---------------------------------------------------------------- animations
const AC = { armR: [28, 20], weapon: -18, armL: [-22, -14] };
/** Chain lightning: a lane-wide bolt that leaves a hero stunned where they stood. */
const ARC_BOX = { ...frontBox(150, { damage: 20, type: 'heavy', kbX: 6, kbY: 0, hitstun: 26, once: true, status: { stunned: { frames: 34 } } }), z: 22 };
const common = {
  // intro: she looks the boarding party over, tips the bicorne with the lance and levels it
  intro: { loop: false, frames: [
    FK(28, { ...AC, torso: -2, head: -6, root: [0, 1], legR: [10, 6], legL: [-10, 6] }, { ease: 'out' }),
    FK(26, { ...AC, armR: [-140, -20], weapon: -50, armL: [-30, -20], torso: -8, head: -12, face: 'angry' }, { sfx: 'crow_call', ease: 'inout', fx: [{ kind: 'spark', x: 30, y: 76, count: 6 }] }),
    FK(24, { ...AC, armR: [70, -10], weapon: -80, torso: 12, head: 2, root: [2, 0], face: 'angry' }, { sfx: 'coil_charge', ease: 'overshoot' }),
  ] },
  phaseChange: { loop: false, frames: [
    FK(16, { ...AC, torso: -22, head: -22, armR: [-30, 40], armL: [-70, -30], root: [-4, 0], face: 'hurt' }, { sfx: 'gale', ease: 'out' }),
    FK(16, { ...AC, torso: 16, head: 4, root: [0, 3], legR: [30, 40], legL: [-22, 40], squash: 1.1, stretch: 0.92, face: 'grit' }, { ease: 'in', fx: [{ kind: 'ring', x: 0, y: 40, r0: 10, r1: 120, color: CROW.spark }, { kind: 'spark', x: 0, y: 50, count: 8 }] }),
    FK(14, { ...AC, torso: 4, head: -4, root: [0, 1], face: 'angry' }, { ease: 'out' }),
  ] },
  // defeat: the lance goes over the rail, the harness dies, she goes down on one knee and then the deck
  defeat: { loop: false, frames: [
    FK(22, { ...AC, torso: -18, head: -24, armR: [-20, 54], weapon: -60, armL: [-72, -50], root: [-4, 0], legR: [24, 6], legL: [-16, 14], face: 'hurt' }, { sfx: 'crow_death', ease: 'out' }),
    FK(20, { ...AC, torso: 26, head: -2, armR: [46, 40], armL: [26, 36], root: [0, 5], legR: [46, 40], legL: [-30, 50], squash: 1.12, stretch: 0.9, face: 'dazed' }, { ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }] }),
    FK(70, { armR: [-22, -6], weapon: -14, armL: [28, 18], torso: 8, head: -16, legR: [12, 10], legL: [-4, 8], root: [26, -8, -88], face: 'dazed' }, { ease: 'out' }),
  ] },
};
const p1Anims = Object.assign(makeCrowBase(AC), common, {
  // lance thrust: 22f level the lance -> 8f drive -> 26f punish
  thrust: enemyAttack({ style: 'thrust', tell: 22, active: 8, recovery: 26, reach: 78, dmg: 16, type: 'medium', kbX: 6, hitstun: 20,
    tellSfx: 'coil_charge', sfx: 'rapier', fx: [{ kind: 'spark', x: 74, y: 48, count: 3 }] }, AC),
  // sweeping cut: the lance goes round her; both sides, and it puts you down
  cut: enemyAttack({ style: 'spin', tell: 26, active: 12, recovery: 30, reach: 74, dmg: 20, type: 'knockdown', kbX: 7, kbY: 3, hitstun: 24,
    behind: true, tellSfx: 'crow_call', sfx: 'rapier_arc', fx: [{ kind: 'slash', x: 0, y: 50, radius: 62, angle: 0, sweep: 220 }] }, AC),
  // BROADSIDE: lance overhead, and the guns below walk four shells down the deck
  broadside: enemyAttack({ style: 'raise', tell: 34, active: 10, recovery: 34, noHitbox: true, event: 'spawnProjectile', projectile: SHELL,
    tellSfx: 'coil_charge', sfx: 'cannons', fx: [{ kind: 'spark', x: 0, y: 78, count: 6 }] }, AC),
  // boarders: she signals over the rail and two Crimpers come up the lines (Boss.afterDamage plays this at 66% / 33%)
  summonEscort: enemyAttack({ style: 'raise', tell: 22, active: 8, recovery: 28, noHitbox: true, event: 'summon',
    summon: [{ type: 'stormcrow', variant: 'crimper' }, { type: 'stormcrow', variant: 'crimper' }], tellSfx: 'crow_call', sfx: 'crow_call' }, AC),
});
const p2Anims = Object.assign(makeCrowBase(AC), common, {
  thrust: p1Anims.thrust,
  cut: p1Anims.cut,
  // chain lightning: 40f charge (the lance head lights, the lenses blink) -> the bolt -> 40f punish
  chain: enemyAttack({ style: 'raise', tell: 40, active: 12, recovery: 40, hitbox: ARC_BOX,
    tellSfx: 'coil_charge', sfx: 'thunder_strike', fx: [{ kind: 'spark', x: 70, y: 50, count: 8 }] }, AC),
  // gale step: she vanishes in a violet puff and reappears behind whoever hit her, already swinging
  galeStep: { loop: false, frames: [
    FK(8, { ...AC, torso: -14, head: -12, armR: [-40, 20], armL: [-60, -20], root: [-3, 0], face: 'angry' }, { tell: true, sfx: 'gale', ease: 'in' }),
    FK(4, { ...AC, torso: 0, head: -4, root: [0, -6], squash: 0.9, stretch: 1.12 },
      { teleport: { toNearestEnemy: true, behind: true, range: 260, offset: 40 }, invuln: true, sfx: 'aether_step', fx: [{ kind: 'ring', x: 0, y: 40, r0: 6, r1: 70, color: CROW.spark }] }),
    FK(8, { ...AC, torso: 8, head: 0, root: [0, 1], face: 'shout' }, { ease: 'out' }),
  ] },
});
const p3Anims = Object.assign(makeCrowBase(AC), common, {
  // lance string: three quick stabs that chain into the finisher
  jab: enemyAttack({ style: 'thrust', tell: 14, active: 6, recovery: 16, reach: 72, dmg: 10, type: 'light', kbX: 4, hitstun: 16,
    tellSfx: 'coil_charge', sfx: 'rapier', fx: [{ kind: 'spark', x: 70, y: 46, count: 2 }] }, AC),
  // finisher: a rising cut that launches
  rise: enemyAttack({ style: 'uppercut', tell: 16, active: 9, recovery: 30, reach: 62, dmg: 18, type: 'launch', kbX: 3, kbY: 8, hitstun: 24,
    tellSfx: 'crow_call', sfx: 'rapier_arc', fx: [{ kind: 'slash', x: 52, y: 54, radius: 34, angle: -70, sweep: 120 }] }, AC),
  keg: enemyAttack({ style: 'swing', tell: 26, active: 8, recovery: 30, noHitbox: true, aimEvent: 'aim', event: 'spawnProjectile', projectile: KEG,
    tellSfx: 'bomb_fuse', sfx: 'throw' }, AC),
});

/** Admiral Odaline Kestrel, the Ninth Wing — the Stage 2 final boss. */
export const boss2 = {
  id: 'boss2', type: 'boss2', variant: 'kestrel', name: 'ADMIRAL ODALINE KESTREL', subtitle: 'THE NINTH WING',
  role: 'boss', bossKind: 'boss', boss: true, music: 'stormboss',
  build: ADMIRAL_BUILD, anims: p1Anims, score: 15000, drops: ['food_big', 'meter', 'score_big'],
  grabbable: false, throwDamageMult: 1, sfx: { hurt: 'crow_hurt', death: 'crow_death' },
  hooks: {
    /** Art state: the lance head charges through every coil wind-up, the wings flare whenever she leaves the deck. */
    onUpdate(f) {
      const a = f.anim, n = a.name, charging = (n === 'chain' || n === 'broadside') && a.frameIndex <= 1;
      f.rig.coil = charging ? Math.min(1, (a.frameIndex + a.frameTime / Math.max(1, a.frame.dur)) / 2) : (n === 'chain' ? 1 : 0);
      f.rig.wings = n === 'galeStep' || f.airborne;
    },
    onPhase(f, i, world) {
      if (!world) return;
      particles.burst('spark', f.x, f.h * 0.6, f.z, 14, { speed: 3.4, up: 2.4, color: CROW.spark });
      if (i === 2) particles.burst('debris', f.x, f.h * 0.5, f.z, 10, { speed: 3, up: 2, color: CROW.pewter, sizeJitter: 2 });
    },
  },
  ai: { attackRange: 78, zTolerance: 18, attackCooldown: [46, 84], firstAttackDelay: 46, ignoresTokens: true, retreatChance: 0, tellWarnFrames: 14 },
  phases: [
    { name: 'THE ADMIRAL', hp: 420, color: '#D8AE52', armor: false, walkSpeed: 1.5,
      summonAt: [0.66, 0.33], summon: [{ type: 'stormcrow', variant: 'crimper' }, { type: 'stormcrow', variant: 'crimper' }],
      ai: { attacks: [{ anim: 'thrust', range: 92, weight: 4 }, { anim: 'cut', range: 80, weight: 3 }, { anim: 'broadside', range: 420, minRange: 90, weight: 2 }] } },
    { name: 'STORM-WING', hp: 400, color: CROW.spark, armor: true, unlaunchable: true, walkSpeed: 1.8,
      build: WING_BUILD, anims: p2Anims, bandShrink: 16,
      // the coil vents every 150 HP: she stops attacking and takes double damage until it closes
      vent: { everyHp: 150, frames: 110, flag: 'venting', damageMult: 2, grabbable: false, stall: true, text: 'COIL VENTING!' },
      ai: { attacks: [{ anim: 'chain', range: 170, minRange: 50, weight: 4 }, { anim: 'cut', range: 80, weight: 3 }, { anim: 'thrust', range: 92, weight: 2 }],
        blinkOnDamage: 60, blinkAnim: 'galeStep', blinkChain: 'cut', attackCooldown: [40, 74] } },
    { name: 'THE LAST CROW', hp: 260, color: '#E8E8F0', armor: false, unlaunchable: false, grabbable: true, walkSpeed: 2.4,
      build: CROW_BUILD, anims: p3Anims,
      ai: { attackRange: 66, zTolerance: 14, attackCooldown: [26, 56], evadeChance: 0.4, evadeCooldown: 90,
        attacks: [{ anim: 'jab', range: 84, weight: 5, chain: 'rise' }, { anim: 'rise', range: 70, weight: 2 }, { anim: 'keg', range: 300, minRange: 90, weight: 2 }] } },
  ],
};
