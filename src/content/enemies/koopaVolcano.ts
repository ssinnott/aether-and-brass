// THE KOOPA TRIO, 1 of 3: THE VOLCANO KING. A koopa king built out of a volcano — basalt-red scales, an obsidian
// shell whose spikes are little craters, a mane of flame and lava running in every seam. He is the trio's artillery:
// he stands back and throws BOMBS MADE OF FIRE, and he slams the floor to send a LAVA WAVE running under it — the
// wave travels UNDERGROUND, so it goes where the others cannot (the Tin Man is too heavy to follow anyone below the
// boards), and it heats the Tin Man loose if it passes under him while he is rusted stiff (koopaTin.ts).
//   1. THE VOLCANO KING (360) — claw swipe up close, a lobbed fire bomb that bursts into a pool of lava, the lava wave.
//   2. ERUPTION         (280) — the shell blows its top: the seams run hot, the bombs come in threes, he tucks into
//      the shell and spins across the floor, and the crater on his back rains fire down on the whole arena.
// Fire does not hurt him (traits.fireDamageMult 0): his own lava pools are safe ground for him and nobody else.
//
// No stage fields him yet. The trio is built to come on together in one fight (koopaTrio.ts has the shared rules);
// until that stage exists they are spawnable on their own — getEnemyDef('volcano') — and drawn in the gallery.
import { frontBox, areaBox } from './common.ts';
import { KOOPA_PARTS, KOOPA_PROPS, KOOPA_SHELL, KOOPA_TAIL, makeKoopaBase, koopaStrike, koopaBossCommon } from './koopaRig.ts';
import { VOLC, drawFireBomb, drawLavaWave, drawLavaPool } from './koopaKit.ts';
import { TRIO_HOOKS } from './koopaTrio.ts';
import { particles } from '../../engine/particles.ts';
import { audio } from '../../engine/audio.ts';

const hit = (damage: number, type: HitType, kbX: number, kbY: number, hitstun: number, extra?: Partial<Hitbox>): Partial<Hitbox> =>
  ({ damage, type, kbX, kbY, hitstun, once: true, ...(extra || {}) });
const BURN = { burn: { frames: 60, every: 20, damage: 2 } };

// ---------------------------------------------------------------- what he throws
/** The pool a fire bomb leaves: burns heroes who stand in it (his own team walks through it). */
const LAVA_POOL = { kind: 'puddle', style: 'fire', r: 20, life: 150, every: 20, pierce: 99, damage: 4, type: 'light', kbX: 1, kbY: 0, hitstun: 12,
  element: 'fire', status: { burn: { frames: 40, every: 20, damage: 2 } }, muzzle: false, draw: drawLavaPool };
/** A fire bomb bursts: a fire blast, a scatter of embers, and a pool of lava where it landed. */
function bombBurst(world, proj, byHit, owner) {
  world.areaHit(proj.x, proj.z, 36, { damage: 14, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 22, element: 'fire', status: BURN }, owner, { team: proj.team, y: proj.y, shake: 6 });
  particles.burst('ember', proj.x, proj.y + 4, proj.z, 14, { speed: 3, up: 2.4, color: VOLC.lava });
  particles.burst('smoke', proj.x, proj.y + 4, proj.z, 6, { speed: 1.2, up: 1 });
  audio.play('explosion');
  if (owner && !owner.dead) world.spawnProjectile(LAVA_POOL, owner, proj.x, 0, proj.z);
}
/** The fire bomb: lobbed at where you are going to be. It bursts on landing, and you can bat it back for 24. */
export const FIRE_BOMB = { style: 'bomb', kind: 'lob', aimAt: true, flight: 40, gravity: 0.45, bounces: 0, rest: false, life: 120,
  noContactHit: true, onExpire: bombBurst, r: 7, muzzle: false, offsetX: 10, offsetY: 84, color: VOLC.lava, draw: drawFireBomb,
  reflectable: true, damageOnReflect: 24, reflectSpeed: 6 };
/** Phase 2: three at once, fanned in depth. */
const FIRE_BOMBS = { ...FIRE_BOMB, aimAt: false, count: 3, spreadZ: 1.1, speed: 3.4, angle: 62, gravity: 0.3 };
/** ERUPTION: the crater on his back throws them straight up and they come down all over the floor. */
const ERUPTION = { ...FIRE_BOMB, aimAt: false, fromSky: true, height: 260, count: 4, ahead: -90, spacing: 60, gravity: 0.35, life: 200 };
/**
 * The lava wave: 5 px a frame along the floor, UNDER it, for 300 px. Pierces everyone in its lane, launches them,
 * and sets them alight. A hero in the air goes over it (its body is the 10 px hump at the surface).
 */
export const LAVA_WAVE = { kind: 'straight', style: 'fire', speed: 5, angle: 0, offsetX: 34, offsetY: 0, r: 10, life: 60, maxDist: 300,
  pierce: 99, damage: 12, type: 'launch', kbX: 3, kbY: 6, hitstun: 24, element: 'fire', status: BURN, muzzle: false, zTol: 14,
  hitSfx: 'burn', draw: drawLavaWave };

// ---------------------------------------------------------------- builds
const VOLC_PAL = { skin: VOLC.scale, hair: VOLC.mane, primary: VOLC.belly, sleeve: VOLC.upper, secondary: VOLC.scaleDk,
  accent: VOLC.claw, metal: VOLC.rim, dark: VOLC.ash, glow: VOLC.glow };
const VOLC_LOOK = { kind: 'volcano', shell: VOLC.obsidian, rim: VOLC.rim, spike: VOLC.cone, tip: VOLC.lava, horn: VOLC.bone, claw: VOLC.claw,
  cuff: VOLC.cuff, eye: VOLC.eye, maw: VOLC.maw, jaw: VOLC.jaw };
const VOLC_BUILD = {
  palette: VOLC_PAL, outline: '#140C10', outlineWidth: 1, proportions: KOOPA_PROPS, parts: KOOPA_PARTS, scale: 1.55,
  smearColor: VOLC.lava, koopa: VOLC_LOOK, accessories: [KOOPA_SHELL, KOOPA_TAIL],
};

// ---------------------------------------------------------------- animations
const VC = { armR: [22, 42], armL: [-14, 36] };
const LEGS = { legR: [18, 6], legL: [-16, 8] };
const LUNGE = { legR: [36, 10], legL: [-28, 26] };
const common = koopaBossCommon(VC, VOLC.lava);
const volcanoAnims = Object.assign(makeKoopaBase(VC), common, {
  // claw: a big overhand rake with the near claws. Short, heavy, and his only answer to someone standing on him.
  claw: koopaStrike({
    tell: 18, active: 7, recovery: 22, carry: VC, tellSfx: 'grapple', sfx: 'claw',
    hitbox: frontBox(64, hit(14, 'heavy', 4, 1, 20)), smear: { from: -100, to: 60, a: 0.45, r: 52 },
    fx: [{ kind: 'slash', x: 50, y: 50, radius: 26, angle: 20, sweep: 90 }],
    w1: { ...VC, ...LEGS, armR: [-50, 30], armL: [-6, 40], torso: -4, head: -10, root: [-3, 0], face: 'angry' },
    w2: { ...VC, ...LEGS, armR: [-96, 10], armL: [4, 44], torso: -14, head: -14, root: [-5, 0], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...VC, ...LUNGE, armR: [96, 16], armL: [-30, 20], torso: 26, head: 0, root: [7, 1], squash: 1.05, stretch: 0.95, face: 'shout' },
    hold: { ...VC, ...LUNGE, armR: [100, 18], armL: [-32, 20], torso: 28, head: 0, root: [7, 1], face: 'shout' },
    r: { ...VC, legR: [30, 10], legL: [-24, 20], armR: [70, 30], armL: [-24, 26], torso: 18, head: -4, root: [5, 1], face: 'grit' },
  }),
  // firebomb: he plucks one off the shell (over the shoulder, behind) and lobs it overhand at where you are going
  firebomb: koopaStrike({
    tell: 24, active: 6, recovery: 24, carry: VC, tellSfx: 'fire', sfx: 'throw',
    aimEvent: 'aim', event: 'spawnProjectile', projectile: FIRE_BOMB, smear: { from: -150, to: 60, a: 0.34, r: 50 },
    w1: { ...VC, ...LEGS, armR: [-150, -20], armL: [10, 36], torso: -10, head: -12, root: [-3, 0], face: 'angry' },
    w2: { ...VC, ...LEGS, armR: [-176, -34], armL: [20, 40], torso: -18, head: -16, root: [-6, 0], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...VC, ...LUNGE, armR: [110, -6], armL: [-26, 20], torso: 20, head: 0, root: [5, 0], squash: 1.04, stretch: 0.96, face: 'shout' },
    hold: { ...VC, ...LUNGE, armR: [104, 0], armL: [-28, 20], torso: 22, head: 0, root: [5, 0], face: 'shout' },
    r: { ...VC, legR: [28, 8], legL: [-22, 18], armR: [60, 24], armL: [-18, 28], torso: 14, head: -4, root: [3, 0], face: 'grit' },
  }),
  // lavawave: both fists up, then down on the boards. The wave goes out along the floor from where they hit.
  lavawave: koopaStrike({
    tell: 30, active: 8, recovery: 30, carry: VC, tellSfx: 'roar', sfx: 'hammer_slam',
    event: 'spawnProjectile', projectile: LAVA_WAVE,
    fx: [{ kind: 'ring', x: 34, y: 0, r0: 6, r1: 50, flat: true, color: VOLC.lava }, { kind: 'dust', x: 34, y: 0, count: 8 }],
    recoverFx: [{ kind: 'steam', x: 30, y: 10, count: 3 }],
    w1: { ...VC, ...LEGS, armR: [-150, -14], armL: [-150, -14], torso: -14, head: -16, root: [-2, -1], face: 'angry' },
    w2: { ...VC, ...LEGS, armR: [-176, -8], armL: [-174, -8], torso: -22, head: -22, root: [-4, -2], squash: 0.95, stretch: 1.06, face: 'shout' },
    h: { ...VC, legR: [40, 34], legL: [-30, 36], armR: [70, 16], armL: [66, 18], torso: 38, head: 8, root: [4, 4], squash: 1.14, stretch: 0.88, face: 'shout' },
    hold: { ...VC, legR: [40, 34], legL: [-30, 36], armR: [72, 18], armL: [68, 20], torso: 38, head: 8, root: [4, 4], squash: 1.1, stretch: 0.92, face: 'grit' },
    r: { ...VC, legR: [30, 20], legL: [-24, 24], armR: [50, 30], armL: [44, 30], torso: 24, head: 2, root: [3, 2], face: 'grit' },
  }),
});
const eruptionAnims = Object.assign({}, volcanoAnims, {
  firebomb: koopaStrike({ ...animSpec(volcanoAnims.firebomb), tell: 22, projectile: FIRE_BOMBS, aimEvent: undefined }),
  // shellspin: he pulls everything into the shell and comes across the floor as a spinning, burning boulder
  shellspin: koopaStrike({
    tell: 22, active: 34, recovery: 26, carry: VC, tellSfx: 'steam_vent', sfx: 'saw_whine', armor: true,
    hitbox: { ...areaBox(34, hit(10, 'knockdown', 5, 4, 22, { element: 'fire' })), once: false, rehit: 12, id: 'spin' }, move: { x: 5.5 },
    fx: [{ kind: 'dust', x: 0, y: 0, count: 6 }],
    w1: { ...VC, legR: [40, 60], legL: [-10, 60], armR: [-30, 60], armL: [-40, 60], torso: 40, head: 10, root: [0, 4], squash: 1.1, stretch: 0.9, face: 'grit' },
    w2: { ...VC, legR: [70, 100], legL: [50, 100], armR: [-10, 90], armL: [-20, 90], torso: 60, head: 20, root: [0, 10, 40], squash: 1.12, stretch: 0.9, face: 'closed' },
    h: { ...VC, legR: [70, 100], legL: [50, 100], armR: [-10, 90], armL: [-20, 90], torso: 60, head: 20, root: [0, 10, 400], face: 'closed' },
    hold: { ...VC, legR: [70, 100], legL: [50, 100], armR: [-10, 90], armL: [-20, 90], torso: 60, head: 20, root: [0, 10, 720], face: 'closed' },
    r: { ...VC, legR: [30, 30], legL: [-20, 30], armR: [20, 50], armL: [-10, 44], torso: 24, head: 0, root: [0, 3, 720], squash: 1.08, stretch: 0.94, face: 'dazed' },
  }),
  // eruption: he roars, the crater on his back blows, and four bombs come down across the arena
  eruption: koopaStrike({
    tell: 40, active: 8, recovery: 34, carry: VC, tellSfx: 'roar', sfx: 'explosion_big',
    event: 'spawnProjectile', projectile: ERUPTION,
    fx: [{ kind: 'ring', x: -20, y: 90, r0: 8, r1: 80, color: VOLC.lava }, { kind: 'steam', x: -20, y: 90, count: 8 }],
    w1: { ...VC, ...LEGS, armR: [-60, -40], armL: [-80, -40], torso: 20, head: 10, root: [0, 2], face: 'grit' },
    w2: { ...VC, legR: [26, 20], legL: [-22, 22], armR: [-40, -60], armL: [-60, -60], torso: 30, head: 16, root: [0, 3], squash: 1.08, stretch: 0.93, face: 'grit' },
    h: { ...VC, ...LEGS, armR: [-120, -20], armL: [-140, -20], torso: -20, head: -30, root: [-2, -1], squash: 0.94, stretch: 1.07, face: 'shout' },
    hold: { ...VC, ...LEGS, armR: [-124, -20], armL: [-144, -20], torso: -22, head: -30, root: [-2, -1], face: 'shout' },
    r: { ...VC, ...LEGS, armR: [-40, 20], armL: [-50, 20], torso: -4, head: -12, root: [0, 0], face: 'angry' },
  }),
});
/** The pose table of an existing strike, reopened so a phase-2 variant keeps its poses and changes its timing. */
function animSpec(a) {
  const f = a.frames;
  return { tell: f[0].dur + f[1].dur, active: f[2].dur, recovery: f[4].dur, carry: VC, tellSfx: f[0].sfx, sfx: f[2].sfx,
    event: f[2].event, projectile: f[2].projectile, smear: f[2].smear, aimEvent: f[0].event,
    w1: f[0].pose, w2: f[1].pose, h: f[2].pose, hold: f[3].pose, r: f[4].pose };
}

/** THE VOLCANO KING — the trio's artillery. */
export const koopaVolcano = {
  id: 'volcano', type: 'volcano', variant: 'king', name: 'THE VOLCANO KING', subtitle: 'OF THE KOOPA TRIO',
  role: 'boss', bossKind: 'boss', boss: true, trio: true, music: 'boss',
  build: VOLC_BUILD, anims: volcanoAnims, score: 12000, drops: ['food_big', 'meter'],
  grabbable: false, throwDamageMult: 1, sfx: { hurt: 'hydraulic', death: 'explosion_big' },
  traits: { flinchEvery: 2, weight: 1.6, fireDamageMult: 0 },
  hooks: {
    ...TRIO_HOOKS,
    onUpdate(f, world) {
      TRIO_HOOKS.onUpdate(f, world);
      // the crater on his back smokes all the time, and spits embers once the shell has blown
      if ((world.frame & 15) === 0) particles.burst('smoke', f.x - f.facing * 22, f.h * 0.95, f.z, 1, { speed: 0.4, up: 0.9 });
      if (f.phaseIndex >= 1 && (world.frame & 7) === 0) particles.burst('ember', f.x - f.facing * 22, f.h * 0.95, f.z, 2, { speed: 1.2, up: 2, color: VOLC.lava });
    },
    onPhase(f, i, world) {
      if (!world || i === 0) return;
      particles.burst('ember', f.x, f.h * 0.8, f.z, 24, { speed: 3, up: 3.6, color: VOLC.lava, sizeJitter: 1.6 });
      world.addFx('ring', f.x, 40, f.z, { r0: 10, r1: 110, color: VOLC.lava });
      if (world.camera) world.camera.shake(6, 18);
    },
  },
  ai: { attackRange: 60, zTolerance: 18, attackCooldown: [46, 86], firstAttackDelay: 50, ignoresTokens: true, retreatChance: 0, tellWarnFrames: 14 },
  phases: [
    { name: 'THE VOLCANO KING', hp: 360, color: VOLC.scale, armor: false, unlaunchable: true, walkSpeed: 1.3,
      ai: { attacks: [{ anim: 'claw', range: 70, weight: 4 }, { anim: 'firebomb', range: 300, minRange: 80, weight: 4 },
        { anim: 'lavawave', range: 300, minRange: 40, weight: 3, tellFrames: 30 }] } },
    { name: 'ERUPTION', hp: 280, color: VOLC.lava, armor: false, unlaunchable: true, walkSpeed: 1.6, anims: eruptionAnims,
      ai: { attackCooldown: [36, 70],
        attacks: [{ anim: 'claw', range: 70, weight: 3 }, { anim: 'firebomb', range: 300, minRange: 80, weight: 3 },
          { anim: 'lavawave', range: 300, minRange: 40, weight: 3, tellFrames: 28 }, { anim: 'shellspin', range: 200, minRange: 50, weight: 2 },
          { anim: 'eruption', range: 400, minRange: 0, weight: 2, maxUses: 3, tellFrames: 40 }] } },
  ],
};
