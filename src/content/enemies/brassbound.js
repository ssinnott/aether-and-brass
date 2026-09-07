// Enemy Type A: The Brassbound (GDD section 3). Clockwork infantry on the upgraded cel-shaded automaton rig (parts + base
// animation set in ./common.js, `brass*B`) with five variants: Tin Footman (club), Brass Halberdier (halberd thrust + crouch
// sweep, 1-hit front armor), Copper Sapper (lobs battable bombs at where the player stood 0.4 s ago, drops bombs on death),
// Iron Warden (tower shield super armor, 3-hit shield bash, 4th-hit stagger, launcher strips the shield, Pip-only grabs, 1.5x
// from jump attacks) and Chrome Duelist (circles at 45 px, riposte stance after 3 player attacks, lunging thrust).
// Type traits: 1.5x damage from throws, gear-slip stagger every 4th hit, wind-up key spins while acting and stops when staggered,
// lens + core turn red on every tell. Death: six parts fly out and the aether core pops cyan.
import { makeEnemyDef, frontBox, BRASS, FK, BRASS_OUTLINE, BRASS_PAL, BRASS_PROPS, BRASS_PARTS, BRASS_KEY, makeBrassBase, brassPuff } from './common.js';
import { celRect, celBall, celPoly, tones, outlinePath } from '../../art/shading.js';
import { getChain } from '../../art/secondary.js';
import { rrect, circle, pathPoly, paint, gear } from '../../art/shapes.js';
import { rad } from '../../engine/math.js';
import { rng } from '../../engine/rng.js';
import { particles } from '../../engine/particles.js';
import { TEAM } from '../../constants.js';

const R = Math.round, TAU = Math.PI * 2;
const WOOD = '#6A4426', IRON = '#4A4E5A', LIGHT = '#C8D0D8', BOMB = '#2A2E38', HOT = '#FFD27A', CAPE = '#2E4A6B';
const LENS = BRASS.lens;
const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, ...(extra || {}) });

// ---------------------------------------------------------------- weapons (hand space: +x along the forearm / handle)
/** 22px wooden club: dark handle, swelling head with an iron band. */
function drawClub(ctx, rig) {
  celRect(ctx, rig, -4, -2, 16, 4, 1, WOOD, 0.4, 0);
  celPoly(ctx, rig, [10, -3, 20, -5, 26, -3, 27, 3, 20, 5, 10, 3], '#8A5C32', 0.38, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(IRON); ctx.fillRect(12, -4, 3, 8);
}
/** 56px halberd: long shaft, trapezoid axe blade, spike and back hook (light steel). */
function drawHalberd(ctx, rig) {
  celRect(ctx, rig, -16, -1.5, 64, 3, 1, '#5A3A22', 0.4, 0);
  celPoly(ctx, rig, [32, -4, 42, -14, 52, -12, 54, 3, 46, 6, 33, 4], LIGHT, 0.36, 0.3);
  celPoly(ctx, rig, [46, -2, 62, 0, 46, 2], LIGHT, 0.4, 0);
  celPoly(ctx, rig, [34, 4, 40, 4, 38, 10, 33, 8], LIGHT, 0.4, 0);
  if (rig.override) return;
  ctx.fillStyle = rig.col(rig.palette.accent); ctx.fillRect(28, -3, 4, 6);
}
/** Copper spanner (Sapper's melee tool). */
function drawWrench(ctx, rig) {
  celRect(ctx, rig, -3, -2, 16, 4, 1, '#8A5A2A', 0.4, 0);
  celPoly(ctx, rig, [12, -5, 20, -5, 20, -2, 16, -1, 16, 1, 20, 2, 20, 5, 12, 5], '#A8703A', 0.38, 0.3);
}
/** Iron mace: shaft + spiked ball head. */
function drawMace(ctx, rig) {
  celRect(ctx, rig, -6, -2, 30, 4, 1, IRON, 0.4, 0);
  // six flat spikes (outlined, no clip: perf) under a shaded ball head
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.moveTo(28 + Math.cos(a) * 5, Math.sin(a) * 5); ctx.lineTo(28 + Math.cos(a) * 11, Math.sin(a) * 11); ctx.lineTo(28 + Math.cos(a + 0.6) * 5, Math.sin(a + 0.6) * 5); ctx.closePath(); }
  outlinePath(ctx, rig); ctx.fillStyle = rig.col(tones(rig, LIGHT).sh); ctx.fill();
  celBall(ctx, rig, 28, 0, 7, LIGHT, true);
  if (rig.override) return;
  ctx.fillStyle = rig.col(rig.palette.accent); ctx.fillRect(-6, -2, 4, 4);
}
/** Chrome rapier: verdigris guard ball, thin 38px blade with a light edge. */
function drawRapier(ctx, rig) {
  celRect(ctx, rig, -5, -1.5, 8, 3, 1, '#3A3F4B', 0.4, 0);
  celBall(ctx, rig, 3, 0, 3.5, rig.palette.accent, false);
  celRect(ctx, rig, 6, -1, 38, 2, 1, LIGHT, 0.4, 0);
  if (rig.override) return;
  ctx.fillStyle = rig.col('#FFFFFF'); ctx.fillRect(8, -1, 30, 1);
}

// ---------------------------------------------------------------- accessories
/** Tower shield strapped along the off forearm (handL, hand space: +x along the forearm): light-steel rim, gunmetal face, purple band, brass boss; glows cyan on tells. */
function drawShield(ctx, rig) {
  if (rig.shieldStripped) return;
  const tell = rig.tell;
  celRect(ctx, rig, -13, -9, 32, 18, 4, '#9AA4B2', 0.36, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(tell ? LENS : '#3A3A44'); ctx.fillRect(-10, -6, 26, 12);
  ctx.fillStyle = tones(rig, tell ? LENS : '#3A3A44').sh; ctx.fillRect(-10, 3, 26, 3);
  ctx.fillStyle = rig.col(tell ? '#B6FFF8' : '#5B2A86'); ctx.fillRect(-9, -1, 24, 3);
  celBall(ctx, rig, 3, 0, 3, rig.palette.accent, false);
}
/** One cape segment (trapezoid x0..x1 at the top, x2..x3 at y=h): outlined flat fill + an inset shadow band, no clip (perf). */
function capeSeg(ctx, rig, x0, x1, x2, x3, h) {
  pathPoly(ctx, [x0, 0, x1, 0, x2, h, x3, h]); outlinePath(ctx, rig);
  const t = tones(rig, CAPE); ctx.fillStyle = rig.col(t.base); ctx.fill();
  if (rig.override) return;
  pathPoly(ctx, [x2 - 5, h - 1, x2 - 1, h - 1, x1 - 1, 2, x1 - 4, 2]); ctx.fillStyle = t.sh; ctx.fill();
}
/** Cape: two lagging cloth segments hanging from the shoulders (back accessory, torso space). */
function drawCape(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), H = p.torsoH;
  const ch = getChain(rig, 'cape', 2, { joint: 'torso', rest: [-0.35, 1], stiffness: 0.12, damping: 0.7, gain: 2.2, rotGain: 0.5, maxAng: 40 });
  ctx.save(); ctx.translate(-hw + 3, -H + 4);
  ctx.rotate(rad(ch.ang[0]));
  capeSeg(ctx, rig, -4, 10, 8, -10, 18);
  ctx.translate(-1, 17); ctx.rotate(rad(ch.ang[1]));
  capeSeg(ctx, rig, -9, 7, 6, -14, 17);
  ctx.restore();
}
/** Bomb backpack (back accessory): copper-brown pack with three iron bombs and a twinkling fuse spark. */
function drawBombPack(ctx, rig) {
  const p = rig.p, x0 = -R(p.torsoW / 2) - 10, y0 = -p.torsoH + 3, h = p.torsoH - 6;
  celRect(ctx, rig, x0, y0, 12, h, 3, '#5A3A22', 0.4, 0.25);
  for (let i = 0; i < 3; i++) celBall(ctx, rig, x0 + 6, y0 + 5 + i * 7, 4, BOMB, i === 0);
  if (rig.override) return;
  ctx.fillStyle = rig.col(rig.palette.accent); ctx.fillRect(x0 + 1, y0 + h - 5, 10, 3);
  if ((rig.tick & 4) === 0) { ctx.fillStyle = rig.col(HOT); ctx.fillRect(x0 + 8, y0 - 1, 2, 2); }
}
/** Bomb held in the off hand while lobbing (handL accessory; `rig.showBomb` is set by the Sapper's onUpdate hook). */
function drawHeldBomb(ctx, rig) {
  if (!rig.showBomb) return;
  celBall(ctx, rig, 7, 0, 5.5, BOMB, true);
  if (rig.override) return;
  ctx.fillStyle = rig.col('#8A6A40'); ctx.fillRect(9, -9, 2, 4);
  ctx.fillStyle = rig.col((rig.tick & 2) ? HOT : '#FFFFFF'); ctx.fillRect(8, -11, 3, 3);
}
/** Crested helmet ridge with a bouncing plume (head accessory, above the hairline). */
function drawCrest(ctx, rig) {
  const r = rig.p.headR;
  const ch = getChain(rig, 'crest', 1, { joint: 'head', rest: [0, -1], stiffness: 0.14, damping: 0.68, gain: 1.4, rotGain: 0.4, maxAng: 26 });
  celRect(ctx, rig, -r - 1, -r - 2, r * 2 + 2, 4, 1, rig.palette.accent, 0.4, 0);
  ctx.save(); ctx.translate(0, -r - 1); ctx.rotate(rad(ch.ang[0]));
  celPoly(ctx, rig, [-5, 0, 5, 0, 3, -6, 0, -11, -4, -8], rig.build.stripe || '#8A2E2E', 0.4, 0.25);
  ctx.restore();
}
/** Chrome half-mask over the jaw (head accessory). */
function drawHalfMask(ctx, rig) {
  const r = rig.p.headR;
  celRect(ctx, rig, -R(r * 0.4), 2, R(r * 1.5), R(r * 0.95), 2, '#B8C4CE', 0.36, 0.3);
  if (rig.override) return;
  ctx.fillStyle = rig.col(rig.palette.accent); ctx.fillRect(-R(r * 0.4) + 1, 2, R(r * 1.5) - 2, 2);
}
/** Shoulder smokestack puffing every 16 draws (torso accessory, front layer, rises from behind the far shoulder). */
function drawStack(ctx, rig) {
  const p = rig.p, x = -R(p.torsoW / 2) + 2, y = -p.torsoH - 12;
  celRect(ctx, rig, x, y, 6, 15, 1, IRON, 0.4, 0.2);
  celRect(ctx, rig, x - 1, y - 2, 8, 3, 1, IRON, 0.4, 0);
  if (rig.override) return;
  const f = rig.tick % 16, k = f / 16;
  ctx.fillStyle = '#B8B4BC';
  brassPuff(ctx, x + 3 - k * 3, y - 6 - k * 12, 2 + k * 3.5, 0.55 - k * 0.5);
  if (f > 8) { const k2 = (f - 8) / 16; brassPuff(ctx, x + 3 - k2 * 2, y - 5 - k2 * 8, 1.5 + k2 * 2.5, 0.4 - k2 * 0.35); }
}

// ---------------------------------------------------------------- projectiles & death spectacle
/** Iron bomb with a brass band and a sparking fuse (spark blinks faster in the last 40 frames). */
function drawBomb(ctx, p, sx, sy) {
  const r = p.r, cy = sy - r, ol = BRASS_OUTLINE;
  circle(ctx, sx, cy, r, BOMB, ol, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(sx + 1, cy + 1, r - 2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#C89B3C'; ctx.fillRect(sx - r + 1, cy - 1, r * 2 - 2, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(sx - 3, cy - r + 2, 3, 2);
  ctx.strokeStyle = '#8A6A40'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx + 2, cy - r + 1); ctx.lineTo(sx + 5, cy - r - 5); ctx.stroke();
  const fast = p.life < 40, on = fast ? (p.life & 2) === 0 : (p.life & 4) === 0;
  if (on) circle(ctx, sx + 5, cy - r - 6, fast ? 3 : 2, fast ? '#FFFFFF' : HOT, null, 0);
}
/** Lobbed bomb: bounces once, blinks, explodes r30 for 12 (hits enemies too); any player attack bats it 150px for 20. */
const BOMB_SPEC = { style: 'bomb', aimAt: true, flight: 48, gravity: 0.4, noContactHit: true, bounces: 1, rest: true, life: 100, onExpire: 'explode', radius: 30,
  explodeHit: { damage: 12, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 20, friendly: true }, r: 6, muzzle: false, offsetX: 4, offsetY: 62,
  reflectable: true, damageOnReflect: 20, reflectSpeed: 6, draw: drawBomb };
/** Tower shield lying on the floor after a launcher strips it. */
function drawFallenShield(ctx, p, sx, sy) {
  ctx.save(); ctx.translate(sx, sy - 3); ctx.rotate(p.facing * 0.2);
  rrect(ctx, -20, -8, 40, 16, 4, '#9AA4B2', BRASS_OUTLINE, 1);
  rrect(ctx, -16, -5, 32, 10, 2, '#3A3A44', BRASS_OUTLINE, 1);
  ctx.fillStyle = '#5B2A86'; ctx.fillRect(-14, -1, 28, 3); circle(ctx, 2, 0, 3, '#C89B3C', BRASS_OUTLINE, 1);
  ctx.restore();
}
const PART_DRAW = [
  (ctx, sx, sy, pal, a) => { ctx.translate(sx, sy); ctx.rotate(a); rrect(ctx, -8, -8, 16, 16, 3, pal.primary, BRASS_OUTLINE, 1); ctx.fillStyle = pal.secondary; ctx.fillRect(-6, -5, 12, 3); circle(ctx, 3, 0, 3, '#3A3F4B', BRASS_OUTLINE, 1); },
  (ctx, sx, sy, pal, a) => { ctx.translate(sx, sy); ctx.rotate(a); rrect(ctx, -3, -7, 6, 14, 2, pal.secondary, BRASS_OUTLINE, 1); circle(ctx, 0, -7, 4, pal.accent, BRASS_OUTLINE, 1); },
  (ctx, sx, sy, pal, a) => { ctx.translate(sx, sy); ctx.rotate(a); rrect(ctx, -3, -8, 6, 16, 2, pal.secondary, BRASS_OUTLINE, 1); circle(ctx, 0, 8, 4, pal.accent, BRASS_OUTLINE, 1); },
  (ctx, sx, sy, pal, a) => { ctx.translate(sx, sy); ctx.rotate(a); pathPoly(ctx, [-5, -3, 6, -3, 8, 0, 8, 3, -5, 3]); paint(ctx, pal.primary, BRASS_OUTLINE, 1); ctx.fillStyle = pal.accent; ctx.fillRect(4, -2, 3, 3); },
  (ctx, sx, sy, pal, a) => { gear(ctx, sx, sy, 7, 6, pal.accent, BRASS_OUTLINE, 1, a, 2, 'rgba(0,0,0,0.4)'); },
  (ctx, sx, sy, pal, a) => { ctx.translate(sx, sy); ctx.rotate(a); rrect(ctx, -8, -2, 12, 4, 1, pal.accent, BRASS_OUTLINE, 1); rrect(ctx, -12, -7, 5, 14, 2, pal.accent, BRASS_OUTLINE, 1); },
];
function drawPart(ctx, p, sx, sy) { ctx.save(); PART_DRAW[p.partIndex](ctx, sx, sy - p.r, p.partPal, p.spin * 2); ctx.restore(); }
/** Death spectacle (GDD 3): six parts (head, arm, leg, foot, pauldron, key) fly out and bounce; the aether core pops cyan. */
function brassDeath(f, world) {
  const pal = f.rig.palette, sc = f.rig.scale;
  for (let i = 0; i < 6; i++) {
    const p = world.spawnProjectile({ owner: null, team: TEAM.NONE, x: f.x + rng.range(-8, 8) * sc, y: 30 * sc + rng.range(0, 30), z: f.z + rng.range(-10, 10),
      vx: rng.range(-3.5, 3.5) + (i - 2.5) * 0.6, vy: rng.range(4, 8), vz: rng.range(-0.6, 0.6), gravity: 0.5, bounces: 2, rest: true, life: 110 + i * 8, hit: null, r: 5, style: 'rubble', draw: drawPart });
    p.partIndex = i; p.partPal = pal;
  }
  world.addFx('ring', f.x, 30 * sc, f.z, { r0: 6, r1: 48 * sc, color: LENS });
  world.addFx('ring', f.x, 30 * sc, f.z, { r0: 2, r1: 24 * sc, color: '#FFFFFF', life: 10 });
  particles.burst('spark', f.x, 30 * sc, f.z, 14, { speed: 4.5, up: 2, color: LENS, color2: '#FFFFFF' });
  particles.burst('steam', f.x, 20 * sc, f.z, 8, { speed: 1.5, up: 2, sizeJitter: 1.5 });
  particles.burst('gear', f.x, 26 * sc, f.z, 3, { speed: 3, up: 3.5, color: pal.accent });
}

// ---------------------------------------------------------------- shared build / def helpers
function mkBuild(o) {
  return { scale: o.scale || 1, palette: { ...BRASS_PAL, ...(o.palette || {}) }, outline: BRASS_OUTLINE, outlineWidth: 1, ramp: { sh: 0.6 }, thinR: 4.5, contactShadow: true,
    smearColor: o.smear || '#C8D0D8', proportions: { ...BRASS_PROPS, ...(o.proportions || {}) }, parts: BRASS_PARTS, stripe: o.stripe,
    weapon: o.weapon, accessories: [BRASS_KEY, ...(o.accessories || [])] };
}
const BASE = {
  type: 'brassbound', faction: 'brassbound', walkSpeed: 1.5, throwDamageMult: 1.5,
  build: mkBuild({ stripe: '#3E5C8A' }),
  sfx: { hurt: 'brass_hit', death: 'brass_death', tell: 'brass_tell' },
  ai: { attackRange: 40, zTolerance: 12, retreatChance: 0.15, attackCooldown: [45, 90], aggression: 0.6, staggerEvery: 4, staggerFrames: 30, firstAttackDelay: 50, flank: false },
};
/** makeEnemyDef + the hook / trait / projectile tables the core reads (fighter.js header). */
function variant(v) {
  const d = makeEnemyDef(BASE, v);
  d.hooks = { onDeath: brassDeath, ...(v.hooks || {}) };
  d.traits = { throwDamageTakenMult: 1.5, ...(v.traits || {}) };
  return d;
}
const TELL = { tell: true, sfx: 'brass_tell' };
const RET = (c, dur = 8) => FK(dur, { ...c, torso: 4 }, { punish: true, ease: 'out' });

// ================================================================ A1 Tin Footman: club, steel-blue stripe
const C_FOOT = { armR: [22, -4], weapon: -32, armL: [-30, -20], legR: [8, 0], legL: [-8, 0] };
const SWING_HIT = frontBox(34, hit(6, 'light', 3, 0, 16, { id: 'swing' }));
const footmanAnims = { ...makeBrassBase(C_FOOT), swing: { loop: false, frames: [
  // anticipation: club wound up over the shoulder (lens red, key spinning) -> smear down -> hold -> follow-through -> settle
  FK(12, { ...C_FOOT, armR: [-60, -40], weapon: 20, armL: [20, 20], torso: -10, head: -6, root: [-2, 0], legR: [10, 4], legL: [-16, 10] }, { ...TELL, ease: 'in' }),
  FK(8, { ...C_FOOT, armR: [-80, -50], weapon: 24, armL: [26, 24], torso: -14, head: -8, root: [-3, 0], squash: 0.97, stretch: 1.03, legR: [8, 4], legL: [-18, 12] }, { tell: true, ease: 'out' }),
  FK(3, { ...C_FOOT, armR: [80, 10], weapon: 40, armL: [-20, 10], torso: 22, head: 6, root: [4, 1], squash: 1.04, stretch: 0.96, legR: [30, 10], legL: [-24, 20] }, { hitbox: SWING_HIT, smear: { from: -150, to: 30, a: 0.5 }, sfx: 'whiff', ease: 'overshoot' }),
  FK(9, { ...C_FOOT, armR: [86, 14], weapon: 46, armL: [-22, 10], torso: 24, head: 6, root: [5, 2], legR: [30, 10], legL: [-24, 20] }, { hitbox: SWING_HIT, ease: 'out' }),
  FK(14, { ...C_FOOT, armR: [96, 20], weapon: 60, armL: [-24, 12], torso: 20, head: 4, root: [4, 2], legR: [28, 10], legL: [-22, 18] }, { punish: true, ease: 'inout' }),
  RET(C_FOOT, 10),
] } };
const footman = variant({
  variant: 'footman', name: 'TIN FOOTMAN', role: 'fodder', hp: 40, damage: 1, speed: 1.0, score: 150, drops: 'none',
  build: mkBuild({ stripe: '#3E5C8A', weapon: { attach: 'handR', length: 26, draw: drawClub, headAt: 20 } }), anims: footmanAnims,
  ai: { attackRange: 34, attacks: [{ anim: 'swing', range: 44, weight: 1 }], maxAttackers: 2 },
});

// ================================================================ A2 Brass Halberdier: gold body, iron-red stripe, crest, halberd
const C_HALB = { armR: [30, 10], weapon: -130, armL: [-24, -12], legR: [8, 0], legL: [-8, 0] };
const THRUST_HIT = frontBox(52, hit(10, 'medium', 4, 0, 20, { id: 'thrust' }));
const SWEEP_HIT = { x: -50, y: -30, w: 100, h: 30, z: 40, once: true, id: 'sweep', ...hit(14, 'knockdown', 4, 4, 20) };
const halbAnims = { ...makeBrassBase(C_HALB, { weaponFloor: 0 }), thrust: { loop: false, frames: [
  // halberd raised vertical, then over the shoulder; 1-hit front armor through the wind-up and the thrust
  FK(14, { ...C_HALB, armR: [40, 30], weapon: -110, armL: [16, 20], torso: -6, head: -4, root: [-2, 0], legR: [10, 4], legL: [-14, 10] }, { ...TELL, armor: 1, ease: 'in' }),
  FK(10, { ...C_HALB, armR: [50, 36], weapon: -122, armL: [24, 24], torso: -12, head: -6, root: [-4, 0], squash: 0.97, stretch: 1.03, legR: [8, 4], legL: [-16, 12] }, { tell: true, armor: 1, ease: 'out' }),
  FK(3, { ...C_HALB, armR: [95, -5], weapon: 0, armL: [-40, 20], torso: 20, head: 4, root: [5, 0], legR: [40, 10], legL: [-30, 30] }, { hitbox: THRUST_HIT, armor: 1, move: { x: 2 }, sfx: 'whiff', fx: [{ kind: 'slash', x: 54, y: 44, radius: 18, angle: 0, sweep: 50 }], ease: 'overshoot' }),
  FK(5, { ...C_HALB, armR: [98, -6], weapon: 0, armL: [-42, 20], torso: 22, head: 4, root: [6, 0], legR: [42, 10], legL: [-32, 32] }, { hitbox: THRUST_HIT, armor: 1, ease: 'out' }),
  FK(16, { ...C_HALB, armR: [70, 20], weapon: -60, armL: [-30, 16], torso: 14, head: 2, root: [4, 1], legR: [34, 10], legL: [-26, 26] }, { punish: true, ease: 'inout' }),
  RET(C_HALB, 10),
] }, sweep: { loop: false, frames: [
  // crouch with the blade drawn back low, then a floor-level sweep through both lanes (trips)
  FK(16, { ...C_HALB, armR: [-50, 10], weapon: 20, armL: [30, 30], torso: 14, head: 4, root: [0, 6], legR: [30, 40], legL: [-16, 40] }, { ...TELL, armor: 1, ease: 'in' }),
  FK(14, { ...C_HALB, armR: [-60, 14], weapon: 24, armL: [36, 34], torso: 18, head: 6, root: [-2, 8], squash: 1.06, stretch: 0.94, legR: [34, 46], legL: [-18, 46] }, { tell: true, armor: 1, ease: 'out' }),
  FK(4, { ...C_HALB, armR: [100, 0], weapon: 10, armL: [-30, 20], torso: 30, head: 6, root: [4, 8], squash: 1.04, stretch: 0.96, legR: [40, 50], legL: [-30, 50] }, { hitbox: SWEEP_HIT, smear: { from: 200, to: 0, a: 0.5, r: 66 }, sfx: 'hammer_swing', fx: [{ kind: 'dust', x: 30, y: 0, count: 5 }], ease: 'overshoot' }),
  FK(6, { ...C_HALB, armR: [106, 2], weapon: 12, armL: [-32, 20], torso: 32, head: 6, root: [5, 8], legR: [40, 50], legL: [-30, 50] }, { hitbox: SWEEP_HIT, ease: 'out' }),
  FK(18, { ...C_HALB, armR: [90, 10], weapon: -20, armL: [-24, 16], torso: 22, head: 4, root: [3, 6], legR: [34, 40], legL: [-24, 40] }, { punish: true, ease: 'inout' }),
  RET(C_HALB, 12),
] } };
const halberdier = variant({
  variant: 'halberdier', name: 'BRASS HALBERDIER', role: 'bruiser', hp: 70, damage: 1, speed: 0.8, score: 300, drops: 'none',
  build: mkBuild({ scale: 1.1, stripe: '#8A2E2E', palette: { primary: '#C9A227', accent: '#7A5A16', skin: '#7E8A98' },
    weapon: { attach: 'handR', length: 58, draw: drawHalberd, headAt: 44 }, accessories: [{ attach: 'head', draw: drawCrest }] }),
  anims: halbAnims, traits: { armorFrontOnly: true, armorHits: 1 },
  ai: { attackRange: 55, zTolerance: 12, attacks: [{ anim: 'thrust', range: 66, minRange: 30, weight: 3 }, { anim: 'sweep', range: 46, weight: 2 }], attackCooldown: [50, 100] },
});

// ================================================================ A3 Copper Sapper: copper, yellow stripe, bomb backpack, scale 0.9
const C_SAP = { armR: [20, -6], weapon: -30, armL: [-34, -20], legR: [8, 0], legL: [-8, 0] };
const BASH_HIT = frontBox(30, hit(8, 'light', 3, 0, 14, { id: 'bash' }));
const sapperAnims = { ...makeBrassBase(C_SAP), lob: { loop: false, frames: [
  // bomb hoisted overhead in the off hand, fuse sparking (30f), then hurled at where the target stood 0.4 s ago
  FK(18, { ...C_SAP, armR: [-130, -30], armL: [-140, -30], weapon: -20, torso: -8, head: -10, root: [0, 1], legR: [10, 4], legL: [-14, 10] }, { tell: true, sfx: 'bomb_fuse', ease: 'in' }),
  FK(12, { ...C_SAP, armR: [-140, -34], armL: [-150, -36], weapon: -24, torso: -14, head: -12, root: [-2, 0], squash: 0.97, stretch: 1.03, legR: [8, 4], legL: [-16, 12] }, { tell: true, event: 'aim', ease: 'out' }),
  FK(6, { ...C_SAP, armR: [-30, 30], armL: [80, 0], weapon: -60, torso: 22, head: 6, root: [4, 0], squash: 1.04, stretch: 0.96, legR: [30, 10], legL: [-24, 20] }, { event: 'spawnProjectile', projectile: BOMB_SPEC, sfx: 'throw', ease: 'overshoot' }),
  FK(18, { ...C_SAP, armR: [-20, 30], armL: [70, 10], weapon: -60, torso: 16, head: 4, root: [3, 1], legR: [26, 10], legL: [-22, 18] }, { punish: true, ease: 'inout' }),
  RET(C_SAP, 12),
] }, bash: { loop: false, frames: [
  FK(8, { ...C_SAP, armR: [-60, -40], weapon: -30, armL: [40, 20], torso: -10, root: [-2, 1], legR: [10, 10], legL: [-10, 10] }, { ...TELL, ease: 'in' }),
  FK(6, { ...C_SAP, armR: [-70, -44], weapon: -34, armL: [46, 24], torso: -12, root: [-3, 1], legR: [10, 10], legL: [-10, 10] }, { tell: true, ease: 'out' }),
  FK(3, { ...C_SAP, armR: [120, -10], weapon: 20, armL: [-30, 10], torso: 18, root: [4, 0], legR: [30, 10], legL: [-20, 20] }, { hitbox: BASH_HIT, smear: { from: -120, to: 20, a: 0.45 }, sfx: 'whiff', ease: 'overshoot' }),
  FK(5, { ...C_SAP, armR: [126, -8], weapon: 24, armL: [-32, 10], torso: 20, root: [5, 0], legR: [30, 10], legL: [-20, 20] }, { hitbox: BASH_HIT, ease: 'out' }),
  FK(12, { ...C_SAP, armR: [110, 0], weapon: 30, armL: [-28, 10], torso: 14, root: [4, 1], legR: [28, 10], legL: [-20, 18] }, { punish: true, ease: 'inout' }),
  RET(C_SAP, 8),
] } };
/** On death the remaining bombs roll out of the pack and explode 60f later (battable). */
function sapperDeath(f, world) {
  brassDeath(f, world);
  for (let i = 0; i < 2; i++) {
    world.spawnProjectile({ owner: f, team: TEAM.ENEMY, x: f.x + (i ? 12 : -12), y: 24, z: f.z + (i ? 6 : -6), vx: i ? 1.2 : -1.2, vy: 2.5, gravity: 0.5, bounces: 1, rest: true, life: 70, hit: null,
      onExpire: 'explode', radius: 30, explodeHit: { ...BOMB_SPEC.explodeHit }, r: 6, style: 'bomb', reflectable: true, damageOnReflect: 20, reflectSpeed: 6, draw: drawBomb });
  }
}
const sapper = variant({
  variant: 'sapper', name: 'COPPER SAPPER', role: 'ranged', hp: 50, damage: 1, speed: 1.1, score: 200, drops: 'none',
  build: mkBuild({ scale: 0.9, stripe: '#E8C547', palette: { primary: '#B87333', accent: '#5A3A22', skin: '#7E8A98' }, weapon: { attach: 'handR', length: 20, draw: drawWrench, headAt: 16 },
    accessories: [{ attach: 'back', draw: drawBombPack }, { attach: 'handL', draw: drawHeldBomb }] }),
  anims: sapperAnims,
  hooks: { onDeath: sapperDeath, onUpdate: (f) => { f.rig.showBomb = f.anim.name === 'lob' && f.anim.frameIndex <= 1; } },
  ai: { attackRange: 34, attacks: [{ anim: 'bash', range: 40, weight: 1 }], ranged: { anim: 'lob', minRange: 90, maxRange: 300, cooldown: 150, zAlign: false, keep: 120, aimDelay: 24 }, retreatBudget: 120 },
});

// ================================================================ A4 Iron Warden: gunmetal, purple stripe, tower shield + mace, scale 1.45
const C_WARD = { armR: [28, -4], weapon: -34, armL: [12, 22], legR: [10, 0], legL: [-10, 0] };
const B1 = frontBox(40, hit(16, 'medium', 3, 0, 20, { id: 'b1' })), B2 = frontBox(40, hit(16, 'medium', 3, 0, 20, { id: 'b2' })), B3 = frontBox(46, hit(20, 'knockdown', 5, 4, 24, { id: 'b3' }));
const wardenAnims = { ...makeBrassBase(C_WARD, { stagger: { armL: [-6, 4] }, holdOffArm: true }), shieldBash: { loop: false, frames: [
  // shield raised and glowing cyan (30f) -> shove -> shove -> mace overhead slam (knockdown)
  FK(18, { ...C_WARD, armL: [50, -50], armR: [-40, -20], weapon: -30, torso: -8, head: -4, root: [-2, 0], legR: [12, 4], legL: [-14, 10] }, { ...TELL, ease: 'in' }),
  FK(12, { ...C_WARD, armL: [60, -60], armR: [-50, -24], weapon: -34, torso: -12, head: -6, root: [-4, 0], squash: 0.97, stretch: 1.03, legR: [10, 4], legL: [-16, 12] }, { tell: true, ease: 'out' }),
  FK(3, { ...C_WARD, armL: [96, -96], armR: [-30, -10], weapon: -30, torso: 20, head: 4, root: [4, 0], squash: 1.04, stretch: 0.96, legR: [34, 10], legL: [-26, 22] }, { hitbox: B1, move: { x: 2 }, sfx: 'hammer_swing', fx: [{ kind: 'dust', x: -8, y: 0, count: 3 }], ease: 'overshoot' }),
  FK(5, { ...C_WARD, armL: [100, -100], armR: [-32, -10], weapon: -30, torso: 22, head: 4, root: [5, 0], legR: [34, 10], legL: [-26, 22] }, { hitbox: B1, ease: 'out' }),
  FK(10, { ...C_WARD, armL: [56, -56], armR: [-36, -14], weapon: -30, torso: 4, head: 0, root: [0, 0], legR: [16, 6], legL: [-16, 12] }, { ease: 'inout' }),
  FK(3, { ...C_WARD, armL: [100, -100], armR: [-30, -10], weapon: -30, torso: 22, head: 4, root: [6, 0], squash: 1.04, stretch: 0.96, legR: [36, 10], legL: [-28, 24] }, { hitbox: B2, move: { x: 2 }, sfx: 'hammer_swing', ease: 'overshoot' }),
  FK(5, { ...C_WARD, armL: [104, -104], armR: [-32, -10], weapon: -30, torso: 24, head: 4, root: [7, 0], legR: [36, 10], legL: [-28, 24] }, { hitbox: B2, ease: 'out' }),
  FK(12, { ...C_WARD, armL: [30, -30], armR: [-120, -60], weapon: 20, torso: -10, head: -8, root: [-2, 0], squash: 0.97, stretch: 1.03, legR: [10, 4], legL: [-16, 12] }, { tell: true, ease: 'in' }),
  FK(4, { ...C_WARD, armL: [24, -24], armR: [90, 10], weapon: 40, torso: 30, head: 8, root: [6, 3], squash: 1.08, stretch: 0.92, legR: [44, 30], legL: [-30, 34] }, { hitbox: B3, smear: { from: -170, to: 60, a: 0.55 }, sfx: 'hammer_slam', fx: [{ kind: 'dust', x: 34, y: 0, count: 7 }, { kind: 'ring', x: 36, y: 0, r0: 4, r1: 30, flat: true, color: '#ffd080' }], ease: 'overshoot' }),
  FK(6, { ...C_WARD, armL: [24, -24], armR: [94, 12], weapon: 42, torso: 32, head: 8, root: [6, 3], legR: [44, 30], legL: [-30, 34] }, { hitbox: B3, ease: 'out' }),
  FK(14, { ...C_WARD, armL: [20, -20], armR: [100, 14], weapon: 30, torso: 22, head: 6, root: [5, 2], legR: [38, 22], legL: [-28, 28] }, { punish: true, ease: 'inout' }),
  RET(C_WARD, 10),
] } };
/** The stripped shield falls as a prop in front of the Warden. */
function wardenShieldStripped(f, world) {
  world.spawnProjectile({ owner: null, team: TEAM.NONE, x: f.x + f.facing * 16, y: 34, z: f.z + 4, vx: f.facing * 1.5, vy: 3, facing: f.facing, gravity: 0.5, bounces: 1, rest: true, life: 100000, hit: null, r: 8, style: 'rubble', draw: drawFallenShield });
  particles.burst('spark', f.x + f.facing * 16, 40, f.z, 10, { speed: 4, up: 2, color: LENS });
}
const warden = variant({
  variant: 'warden', name: 'IRON WARDEN', role: 'elite', hp: 180, damage: 1, speed: 0.7, score: 1000, drops: 'meter', elite: true, lyingFrames: 50,
  build: mkBuild({ scale: 1.45, stripe: '#5B2A86', palette: { primary: '#3A3A44', secondary: '#6E7A88', sleeve: '#6E7A88', skin: '#8593A0', accent: '#9AA4B2', joint: '#C89B3C' },
    proportions: { torsoW: 24, torsoH: 27, hip: 20, armR: 4.5, legR: 5 }, weapon: { attach: 'handR', length: 36, draw: drawMace, headAt: 28 },
    accessories: [{ attach: 'handL', draw: drawShield }, { attach: 'torso', draw: drawStack }] }),
  anims: wardenAnims, traits: { jumpAttackTakenMult: 1.5, grabbable: false, grabbableByGrappler: true },
  hooks: { onShieldStripped: wardenShieldStripped },
  ai: { attackRange: 46, zTolerance: 14, attacks: [{ anim: 'shieldBash', range: 56, weight: 1 }], attackCooldown: [60, 110], shield: { hitsToStagger: 4, staggerFrames: 30, stripOnLauncher: true }, ignoresTokens: true, retreatChance: 0 },
});

// ================================================================ A5 Chrome Duelist: chrome, verdigris stripe, thin arms, rapier, cape, half-mask
const C_DUEL = { armR: [30, 0], weapon: -30, armL: [-40, -30], legR: [10, 0], legL: [-12, 4] };
const LUNGE_HIT = frontBox(44, hit(12, 'medium', 4, 0, 18, { id: 'lunge' }));
const FL = (n, last) => frontBox(40, last ? hit(3, 'knockdown', 5, 4, 20, { id: 'fl' + n }) : hit(3, 'light', 1, 0, 10, { id: 'fl' + n }));
const flurryHit = (n, last) => FK(2, { ...C_DUEL, armR: [95, -5], weapon: 0, armL: [-50, -20], torso: 22, head: 4, root: [3 + n, 0], legR: [44, 6], legL: [-36, 34] },
  { hitbox: FL(n, last), sfx: last ? 'rapier_arc' : 'rapier', smear: last ? { from: -40, to: 20, a: 0.45, r: 60 } : undefined, fx: [{ kind: 'slash', x: 46, y: 40 + (n % 2) * 10, radius: 14, angle: 0, sweep: 40 }], ease: 'overshoot' });
const flurryPull = (n) => FK(3, { ...C_DUEL, armR: [60, 24], weapon: -24, armL: [-46, -20], torso: 14, head: 2, root: [2 + n, 0], legR: [40, 6], legL: [-34, 30] }, { ease: 'in' });
const duelistAnims = { ...makeBrassBase(C_DUEL, { weaponFloor: -10 }), lunge: { loop: false, frames: [
  // crouch with the rapier chambered at the hip (16f), then a 5px/f lunging thrust
  FK(10, { ...C_DUEL, armR: [-30, 60], weapon: -60, armL: [-50, -20], torso: 12, head: 2, root: [0, 5], legR: [26, 36], legL: [-16, 36] }, { ...TELL, ease: 'in' }),
  FK(6, { ...C_DUEL, armR: [-36, 66], weapon: -64, armL: [-56, -24], torso: 16, head: 4, root: [-2, 7], squash: 1.06, stretch: 0.94, legR: [30, 40], legL: [-18, 40] }, { tell: true, ease: 'out' }),
  FK(3, { ...C_DUEL, armR: [95, -5], weapon: 0, armL: [-60, -20], torso: 24, head: 4, root: [6, -1], squash: 0.96, stretch: 1.04, legR: [50, 4], legL: [-40, 40] }, { hitbox: LUNGE_HIT, move: { x: 5 }, sfx: 'rapier', fx: [{ kind: 'slash', x: 48, y: 44, radius: 18, angle: 0, sweep: 50 }], ease: 'overshoot' }),
  FK(5, { ...C_DUEL, armR: [98, -6], weapon: 0, armL: [-62, -20], torso: 26, head: 4, root: [6, 0], legR: [52, 4], legL: [-42, 42] }, { hitbox: LUNGE_HIT, move: { x: 3 }, ease: 'out' }),
  FK(14, { ...C_DUEL, armR: [70, 10], weapon: -20, armL: [-50, -20], torso: 16, head: 2, root: [4, 1], legR: [40, 8], legL: [-32, 32] }, { punish: true, ease: 'inout' }),
  RET(C_DUEL, 10),
] }, riposteStance: { loop: true, frames: [
  // rapier vertical, weight back, off hand raised: the lens flashes 3x over the first 18f (rig.stanceFlash) then holds red
  FK(9, { ...C_DUEL, armR: [60, 40], weapon: -80, armL: [-60, -70], torso: -6, head: -2, root: [-2, 0], legR: [14, 6], legL: [-20, 10] }, { ease: 'inout' }),
  FK(9, { ...C_DUEL, armR: [62, 42], weapon: -82, armL: [-64, -72], torso: -8, head: -3, root: [-2, 1], legR: [14, 6], legL: [-20, 10] }, { ease: 'inout' }),
] }, riposte: { loop: false, frames: [
  // parry (invulnerable) -> four thrusts (3 x 3 + a 3 knockdown = 12) -> recovery
  FK(3, { ...C_DUEL, armR: [70, 30], weapon: -60, armL: [-60, -60], torso: -6, head: -2, root: [-2, 0], legR: [14, 6], legL: [-20, 10] }, { invuln: true, ease: 'in' }),
  flurryHit(0), flurryPull(0), flurryHit(1), flurryPull(1), flurryHit(2), flurryPull(2), flurryHit(3, true),
  FK(12, { ...C_DUEL, armR: [80, 10], weapon: -10, armL: [-50, -30], torso: 16, head: 2, root: [5, 1], legR: [40, 8], legL: [-32, 32] }, { punish: true, ease: 'inout' }),
  RET(C_DUEL, 6),
] } };
const duelist = variant({
  variant: 'duelist', name: 'CHROME DUELIST', role: 'elite', hp: 90, damage: 1, speed: 1.2, score: 500, drops: 'none',
  build: mkBuild({ stripe: '#2E6B52', palette: { primary: '#DDE6EE', accent: '#2E6B52', skin: '#7E8A98' }, proportions: { armR: 3.2, torsoW: 20, handR: 4 }, smear: '#E8F4FF',
    weapon: { attach: 'handR', length: 44, draw: drawRapier, headAt: 30 }, accessories: [{ attach: 'back', draw: drawCape }, { attach: 'head', draw: drawHalfMask }] }),
  anims: duelistAnims,
  hooks: { onUpdate: (f) => { f.rig.stanceFlash = f.inStance ? f.stanceTimer : 0; } },
  ai: { attackRange: 45, zTolerance: 12, attacks: [{ anim: 'lunge', range: 84, minRange: 20, weight: 1 }], attackCooldown: [40, 80], hoverCircle: true, retreatChance: 0.3,
    riposteStance: { afterPlayerAttacks: 3, frames: 30, flurryAnim: 'riposte', stanceAnim: 'riposteStance', range: 120, cooldown: 150 } },
});

/** Brassbound variants in GDD order. */
export const BRASSBOUND = [footman, halberdier, sapper, warden, duelist];
export { areaBox } from './common.js';
