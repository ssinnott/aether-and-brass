// THE MEGA KING: the fourth koopa king, bigger than the other three put together, and built OUT of them — the three
// kings taken apart and reassembled as one: the Volcano King's red-scaled head and flame mane (he breathes fire), the
// Tin Man's riveted tin shell and belly plate with the heart behind it, Earth's Away's vine forearms and claws (he
// digs), and one thing none of the others have: EARTH STONE JEWELRY — a jewelled circlet, a necklace of stones, gems
// on his cuffs and set in his shell — which in phase 2 is a shield of its own (the EARTH STONES, traits.shield).
//
//   1. THE MEGA DESTROYER (560) — he rides his machine (koopaMegaMachine.ts), which has every power the kings have:
//      a FIRE CANNON, a DRILL that lunges and then DIGS a lava wave along under the floor, a tin-plated RAM, and one
//      more none of them have — GROW: its nursery plants LIVING TREES around the heroes (koopaTree.ts). Before he
//      grows them he always calls out to every king to switch on TREE MODE, and a king with it on is one the trees
//      will not hurt (koopaTrio.ts). Hit the hull for 0.8x, or jump at the king in the cockpit for 1.5x.
//   2. THE MEGA KING      (440) — the machine blows apart and he comes at you on foot: FLAME BREATH, lobbed FIRE
//      BOMBS, a BURROW under the floor that bursts up under you, a TIN SHELL spin, and a QUAKE stamp; the Earth
//      Stones soak up the first 60 of every exchange and come back if you let him breathe.
// He is a king like the others (`trio: true`): the pact, tree mode and the rest of koopaTrio.ts apply to him too.
import { frontBox, areaBox } from './common.ts';
import { KOOPA_PARTS, KOOPA_PROPS, KOOPA_SHELL, KOOPA_TAIL, makeKoopaBase, koopaStrike, koopaBossCommon } from './koopaRig.ts';
import { VOLC, TIN, EARTH } from './koopaKit.ts';
import { LAVA_WAVE, FIRE_BOMB } from './koopaVolcano.ts';
import { TRIO_HOOKS, trioAllies, treeModeOn, burrowAnim, tunnelToNearest, burrowDrawBefore, burrowDrawAfter } from './koopaTrio.ts';
import { MACHINE_LIFT, drawMachineBack, drawMachineFront } from './koopaMegaMachine.ts';
import { ST } from '../../constants.ts';
import { floatText } from '../../art/fx.ts';
import { particles } from '../../engine/particles.ts';
import { audio } from '../../engine/audio.ts';
import { clamp } from '../../lib/engine/math.ts';

const hit = (damage: number, type: HitType, kbX: number, kbY: number, hitstun: number, extra?: Partial<Hitbox>): Partial<Hitbox> =>
  ({ damage, type, kbX, kbY, hitstun, once: true, ...(extra || {}) });
const BURN = { burn: { frames: 60, every: 20, damage: 2 } };
/** At most this many living trees up at once; GROW plants up to three a call. */
const MAX_TREES = 4, TREES_PER_GROW = 3;

// ---------------------------------------------------------------- what the machine and the king send out
/** The fire cannon: three fireballs fanned down across the floor from the fore-deck. */
const FIREBALLS = { kind: 'straight', style: 'bomb', speed: 5.5, angle: -12, count: 3, spreadY: 7, offsetX: 106, offsetY: MACHINE_LIFT + 6,
  r: 7, damage: 11, type: 'heavy', kbX: 4, kbY: 1, hitstun: 20, element: 'fire', status: BURN, muzzle: false, life: 90, color: VOLC.lava,
  draw: FIRE_BOMB.draw, hitSfx: 'burn' };
/** The drill goes into the floor and a lava wave comes out of the far end of the hole, two lanes wide. */
const DIG_WAVE = { ...LAVA_WAVE, offsetX: 124, count: 2, spreadZ: 0.7, damage: 14 };

// ---------------------------------------------------------------- builds
/** All three kings in one body. The palette's skin is the vine of his forearms; head and body name their own scales. */
const MEGA_PAL = { skin: EARTH.vine, hair: VOLC.mane, primary: TIN.plate, sleeve: TIN.sleeve, secondary: EARTH.stoneDk,
  accent: VOLC.claw, metal: TIN.bright, dark: EARTH.dirt, glow: VOLC.glow };
const MEGA_LOOK = { kind: 'mega', headSkin: VOLC.scale, bodySkin: VOLC.scale, shellKind: 'tin', bellyKind: 'tin', jewels: true,
  shell: TIN.shell, rim: TIN.rim, spike: VOLC.cone, tip: VOLC.lava, horn: EARTH.horn, claw: VOLC.claw, cuff: EARTH.coil,
  eye: VOLC.eye, maw: VOLC.maw, jaw: VOLC.jaw };
const BASE_BUILD = {
  palette: MEGA_PAL, outline: '#120E10', outlineWidth: 1, parts: KOOPA_PARTS, smearColor: VOLC.lava, koopa: MEGA_LOOK,
  proportions: { ...KOOPA_PROPS, headR: 13, torsoW: 34, torsoH: 30, hip: 28 }, accessories: [KOOPA_SHELL, KOOPA_TAIL],
};
/** In the cockpit: the machine is the big thing, so he rides it at the other kings' size. */
const COCKPIT_BUILD = { ...BASE_BUILD, scale: 1.7 };
/** On foot: bigger than the other three put together. */
const MEGA_BUILD = { ...BASE_BUILD, scale: 2.3 };

// ---------------------------------------------------------------- animations
const MC = { armR: [40, 64], armL: [30, 64] };      // both hands forward on the levers
const KC = { armR: [22, 42], armL: [-14, 36] };
const LEGS = { legR: [18, 6], legL: [-16, 8] };
const LUNGE = { legR: [36, 10], legL: [-28, 26] };
const machineAnims = Object.assign(makeKoopaBase(MC), koopaBossCommon(MC, VOLC.lava), {
  // cannon: haul the near lever back, slam it forward, and the fore-deck cannon throws three fireballs
  cannon: koopaStrike({
    tell: 24, active: 6, recovery: 24, carry: MC, tellSfx: 'fire', sfx: 'cannon', event: 'spawnProjectile', projectile: FIREBALLS,
    w1: { ...MC, ...LEGS, armR: [-10, 70], torso: -6, head: -8, face: 'angry' },
    w2: { ...MC, ...LEGS, armR: [-30, 80], torso: -12, head: -12, squash: 0.98, stretch: 1.02, face: 'grit' },
    h: { ...MC, ...LEGS, armR: [80, 20], torso: 14, head: 2, root: [3, 0], face: 'shout' },
    hold: { ...MC, ...LEGS, armR: [82, 20], torso: 14, head: 2, root: [3, 0], face: 'shout' },
    r: { ...MC, ...LEGS, armR: [60, 40], torso: 8, head: -2, face: 'grit' },
  }),
  // drill: both levers forward and the prow drill lunges out, grinding whatever is in front of the treads
  drill: koopaStrike({
    tell: 20, active: 16, recovery: 24, carry: MC, tellSfx: 'saw_whine', sfx: 'saw_whine', move: { x: 2 },
    hitbox: { x: 70, y: -44, w: 90, h: 44, z: 26, damage: 7, type: 'knockdown', kbX: 5, kbY: 3, hitstun: 20, once: false, rehit: 8, id: 'drill' },
    fx: [{ kind: 'dust', x: 120, y: 0, count: 6 }],
    w1: { ...MC, ...LEGS, armR: [10, 60], armL: [0, 60], torso: -4, head: -6, face: 'angry' },
    w2: { ...MC, ...LEGS, armR: [0, 50], armL: [-10, 50], torso: -8, head: -8, face: 'grit' },
    h: { ...MC, ...LEGS, armR: [90, 10], armL: [84, 10], torso: 18, head: 4, root: [3, 0], face: 'shout' },
    hold: { ...MC, ...LEGS, armR: [92, 10], armL: [86, 10], torso: 18, head: 4, root: [3, 0], face: 'shout' },
    r: { ...MC, ...LEGS, armR: [60, 40], armL: [50, 40], torso: 8, head: 0, face: 'grit' },
  }),
  // dig: the drill goes down into the boards, and the lava comes out the other end of the tunnel
  dig: koopaStrike({
    tell: 30, active: 8, recovery: 30, carry: MC, tellSfx: 'saw_whine', sfx: 'hammer_slam', event: 'spawnProjectile', projectile: DIG_WAVE,
    fx: [{ kind: 'dust', x: 110, y: 0, count: 12 }, { kind: 'ring', x: 110, y: 0, r0: 6, r1: 50, flat: true, color: VOLC.lava }],
    w1: { ...MC, ...LEGS, armR: [-20, 40], armL: [-30, 40], torso: 10, head: 6, face: 'angry' },
    w2: { ...MC, ...LEGS, armR: [-40, 30], armL: [-50, 30], torso: 16, head: 10, squash: 1.04, stretch: 0.97, face: 'grit' },
    h: { ...MC, ...LEGS, armR: [30, 60], armL: [20, 60], torso: 28, head: 12, root: [2, 2], face: 'shout' },
    hold: { ...MC, ...LEGS, armR: [30, 60], armL: [20, 60], torso: 28, head: 12, root: [2, 2], face: 'shout' },
    r: { ...MC, ...LEGS, armR: [36, 62], armL: [26, 62], torso: 14, head: 2, face: 'grit' },
  }),
  // ram: full throttle, tin plate first, straight across the floor
  ram: koopaStrike({
    tell: 26, active: 30, recovery: 30, carry: MC, tellSfx: 'hydraulic', sfx: 'piston', armor: true, move: { x: 6 },
    hitbox: frontBox(110, hit(18, 'knockdown', 6, 4, 24)), fx: [{ kind: 'dust', x: -60, y: 0, count: 8 }],
    w1: { ...MC, ...LEGS, armR: [-30, 60], armL: [-40, 60], torso: -10, head: -8, face: 'angry' },
    w2: { ...MC, ...LEGS, armR: [-50, 50], armL: [-60, 50], torso: -16, head: -14, squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...MC, ...LEGS, armR: [100, 0], armL: [96, 0], torso: 30, head: 10, root: [4, 0], face: 'shout' },
    hold: { ...MC, ...LEGS, armR: [100, 0], armL: [96, 0], torso: 30, head: 10, root: [4, 0], face: 'shout' },
    r: { ...MC, ...LEGS, armR: [50, 40], armL: [40, 40], torso: 12, head: 0, face: 'dazed' },
  }),
  // grow: "KINGS! TREE MODE ON!" — then the nursery plants living trees round the heroes. Armoured: once he has
  // told the kings to switch tree mode on, the trees are coming.
  grow: koopaStrike({
    tell: 40, active: 10, recovery: 36, carry: MC, tellSfx: 'roar', sfx: 'land_heavy', aimEvent: 'treeCall', event: 'growTrees', armor: true,
    fx: [{ kind: 'ring', x: -80, y: 90, r0: 8, r1: 70, color: EARTH.leaf }],
    w1: { ...MC, ...LEGS, armR: [-150, -20], armL: [-40, 50], torso: -12, head: -20, face: 'shout' },
    w2: { ...MC, ...LEGS, armR: [-170, -20], armL: [-30, 60], torso: -16, head: -24, squash: 0.96, stretch: 1.05, face: 'shout' },
    h: { ...MC, ...LEGS, armR: [60, 50], armL: [70, 50], torso: 20, head: 4, root: [2, 0], face: 'angry' },
    hold: { ...MC, ...LEGS, armR: [62, 50], armL: [72, 50], torso: 20, head: 4, root: [2, 0], face: 'angry' },
    r: { ...MC, ...LEGS, armR: [50, 60], armL: [40, 60], torso: 10, head: 0, face: 'grit' },
  }),
});
const kingAnims = Object.assign(makeKoopaBase(KC), koopaBossCommon(KC, VOLC.lava), {
  // flame: he rears back and breathes a sheet of fire down across the floor in front of him
  flame: koopaStrike({
    tell: 28, active: 24, recovery: 28, carry: KC, tellSfx: 'fire', sfx: 'fire',
    hitbox: { ...frontBox(120, hit(6, 'light', 2, 0, 14, { element: 'fire', status: BURN })), y: -90, h: 90, once: false, rehit: 8, id: 'flame' },
    fx: [{ kind: 'steam', x: 60, y: 60, count: 4 }],
    w1: { ...KC, ...LEGS, torso: -14, head: -26, root: [-3, 0], face: 'grit' },
    w2: { ...KC, ...LEGS, torso: -20, head: -32, root: [-5, 0], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...KC, ...LUNGE, torso: 24, head: 18, root: [5, 1], face: 'shout' },
    hold: { ...KC, ...LUNGE, torso: 26, head: 20, root: [5, 1], face: 'shout' },
    r: { ...KC, legR: [30, 10], legL: [-24, 20], torso: 12, head: 0, root: [3, 1], face: 'grit' },
  }),
  firebomb: koopaStrike({
    tell: 22, active: 6, recovery: 24, carry: KC, tellSfx: 'fire', sfx: 'throw',
    aimEvent: 'aim', event: 'spawnProjectile', projectile: { ...FIRE_BOMB, offsetY: 150 }, smear: { from: -150, to: 60, a: 0.34, r: 60 },
    w1: { ...KC, ...LEGS, armR: [-150, -20], torso: -10, head: -12, root: [-3, 0], face: 'angry' },
    w2: { ...KC, ...LEGS, armR: [-176, -34], torso: -18, head: -16, root: [-6, 0], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...KC, ...LUNGE, armR: [110, -6], armL: [-26, 20], torso: 20, head: 0, root: [5, 0], face: 'shout' },
    hold: { ...KC, ...LUNGE, armR: [104, 0], armL: [-28, 20], torso: 22, head: 0, root: [5, 0], face: 'shout' },
    r: { ...KC, legR: [28, 8], legL: [-22, 18], armR: [60, 24], torso: 14, head: -4, root: [3, 0], face: 'grit' },
  }),
  // burrow: Earth's Away's dig, with three times the weight coming up under you
  // (the eruption ring is jade: the Earth Stones coming up through the floor with him)
  burrow: burrowAnim(KC, { radius: 56, hit: hit(20, 'launch', 3, 8, 28) }, '#3FBF7F'),
  // shellspin: into the tin shell, and across the floor
  shellspin: koopaStrike({
    tell: 22, active: 34, recovery: 28, carry: KC, tellSfx: 'steam_vent', sfx: 'saw_whine', armor: true,
    hitbox: { ...areaBox(48, hit(11, 'knockdown', 5, 4, 22)), once: false, rehit: 12, id: 'spin' }, move: { x: 5.5 },
    fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }],
    w1: { ...KC, legR: [40, 60], legL: [-10, 60], armR: [-30, 60], armL: [-40, 60], torso: 40, head: 10, root: [0, 4], squash: 1.1, stretch: 0.9, face: 'grit' },
    w2: { ...KC, legR: [70, 100], legL: [50, 100], armR: [-10, 90], armL: [-20, 90], torso: 60, head: 20, root: [0, 10, 40], squash: 1.12, stretch: 0.9, face: 'closed' },
    h: { ...KC, legR: [70, 100], legL: [50, 100], armR: [-10, 90], armL: [-20, 90], torso: 60, head: 20, root: [0, 10, 400], face: 'closed' },
    hold: { ...KC, legR: [70, 100], legL: [50, 100], armR: [-10, 90], armL: [-20, 90], torso: 60, head: 20, root: [0, 10, 720], face: 'closed' },
    r: { ...KC, legR: [30, 30], legL: [-20, 30], armR: [20, 50], armL: [-10, 44], torso: 24, head: 0, root: [0, 3, 720], squash: 1.08, stretch: 0.94, face: 'dazed' },
  }),
  // quake: one foot up, and down — the floor jumps for 100 px round him. Be in the air.
  quake: koopaStrike({
    tell: 30, active: 6, recovery: 30, carry: KC, tellSfx: 'roar', sfx: 'hammer_slam',
    hitbox: areaBox(100, hit(16, 'knockdown', 5, 5, 24), { y: -26, h: 26 }),
    fx: [{ kind: 'ring', x: 0, y: 0, r0: 8, r1: 110, flat: true, color: VOLC.lava }, { kind: 'dust', x: 0, y: 0, count: 16 }],
    w1: { ...KC, legR: [70, -30], legL: [-16, 8], armR: [-60, 20], armL: [-70, 20], torso: -10, head: -14, root: [0, -2], face: 'angry' },
    w2: { ...KC, legR: [84, -44], legL: [-18, 10], armR: [-90, 10], armL: [-100, 10], torso: -16, head: -18, root: [0, -3], squash: 0.95, stretch: 1.06, face: 'grit' },
    h: { ...KC, legR: [34, 34], legL: [-26, 34], armR: [40, 30], armL: [30, 30], torso: 30, head: 6, root: [0, 4], squash: 1.16, stretch: 0.86, face: 'shout' },
    hold: { ...KC, legR: [34, 34], legL: [-26, 34], armR: [42, 30], armL: [32, 30], torso: 30, head: 6, root: [0, 4], face: 'shout' },
    r: { ...KC, legR: [26, 18], legL: [-22, 22], armR: [30, 40], armL: [20, 40], torso: 16, head: 0, root: [0, 1], face: 'grit' },
  }),
});

// ---------------------------------------------------------------- the machine's two calls
/** "KINGS! TREE MODE ON!": every king standing (himself too) switches it on before a single tree comes up. */
function treeCall(f, world) {
  floatText(f.x, f.y + f.h + MACHINE_LIFT + 16, f.z, 'KINGS! TREE MODE ON!', '#9BE070', 2);
  treeModeOn(f);
  for (const e of trioAllies(f, world)) treeModeOn(e);
  audio.play('chime');
}
/** GROW: living trees come up out of the floor beside the heroes (never more than MAX_TREES standing at once). */
function growTrees(f, world) {
  if (!world.spawnEnemy) return;
  let alive = 0;
  for (const e of world.entities) if (e.def && e.def.livingTree && !e.dead && !e.removeMe) alive++;
  const room = Math.min(TREES_PER_GROW, MAX_TREES - alive);
  if (room <= 0) return;
  const heroes = (world.players || []).filter((p) => p && !p.dead && p.alive !== false);
  const b = world.boundsFor(f), zb = world.floorBand;
  for (let i = 0; i < room; i++) {
    const h = heroes.length ? heroes[i % heroes.length] : null;
    const side = i % 2 ? -1 : 1;
    const x = clamp(h ? h.x + side * (46 + (i >> 1) * 20) : f.x + f.facing * (140 + i * 40), b.x0, b.x1);
    const z = clamp(h ? h.z + (i - 1) * 10 : f.z, zb.z0, zb.z1);
    const tree = world.spawnEnemy('tree', 'living', x, z, { entered: true, facing: h ? Math.sign(h.x - x) || 1 : -f.facing });
    if (tree && tree.anim && tree.anim.has('sprout')) tree.setState(ST.SPECIAL, 'sprout');
    particles.burst('debris', x, 4, z, 6, { speed: 1.6, up: 2.2, color: EARTH.dirt });
  }
  if (world.camera) world.camera.shake(4, 12);
}

/** THE MEGA KING — the three kings in one, on the Mega Destroyer. */
export const koopaMega = {
  id: 'megaking', type: 'megaking', variant: 'king', name: 'THE MEGA KING', subtitle: 'ALL THREE KINGS IN ONE',
  role: 'boss', bossKind: 'boss', boss: true, trio: true, music: 'boss',
  build: COCKPIT_BUILD, anims: machineAnims, score: 25000, drops: ['life', 'food_big', 'score_big'],
  grabbable: false, throwDamageMult: 1, sfx: { hurt: 'clank', death: 'explosion_big' },
  traits: { flinchEvery: 3, weight: 3, fireDamageMult: 0.5 },
  hooks: {
    ...TRIO_HOOKS,
    onAnimEvent(f, name, frame, world) {
      if (name === 'treeCall') { treeCall(f, world); return true; }
      if (name === 'growTrees') { growTrees(f, world); return true; }
      if (name === 'tunnel') { tunnelToNearest(f, world); return true; }
      return false;
    },
    /** Phase 1: the machine under him and the rig lifted into the cockpit. Phase 2: the dig's floor clip. */
    drawBefore(ctx, f, sx, sy) {
      if (f.phaseIndex === 0) {
        drawMachineBack(ctx, f, sx, sy, f.world ? f.world.frame : 0);
        ctx.save(); ctx.translate(0, -MACHINE_LIFT); f.rig.machineLift = true;
        return;
      }
      burrowDrawBefore(ctx, f, sx, sy);
    },
    drawAfter(ctx, f, sx, sy) {
      if (f.rig.machineLift) { ctx.restore(); f.rig.machineLift = false; drawMachineFront(ctx, f, sx, sy); return; }
      burrowDrawAfter(ctx, f);
    },
    onUpdate(f, world) {
      TRIO_HOOKS.onUpdate(f, world);
      if (f.phaseIndex === 0 && (world.frame & 7) === 0) particles.burst('smoke', f.x - f.facing * 46, 124, f.z, 1, { speed: 0.4, up: 1.2 });
      if (f.phaseIndex === 1 && (world.frame & 31) === 0) particles.burst('ember', f.x, f.h * 0.9, f.z, 2, { speed: 0.6, up: 1.4, color: '#3FBF7F' });
    },
    /** The Mega Destroyer blows apart and the king climbs out of the wreck. */
    onPhase(f, i, world) {
      if (i === 1) f.shield = f.shieldMax;   // he climbs out with the Earth Stones fully charged
      if (!world || i === 0) return;
      particles.burst('debris', f.x, 50, f.z, 30, { speed: 4, up: 4, color: TIN.shell, sizeJitter: 2 });
      particles.burst('ember', f.x, 60, f.z, 30, { speed: 3.4, up: 3.6, color: VOLC.lava, sizeJitter: 1.6 });
      particles.burst('smoke', f.x, 40, f.z, 16, { speed: 2, up: 2 });
      world.addFx('ring', f.x, 40, f.z, { r0: 10, r1: 150, color: VOLC.lava });
      if (world.camera) world.camera.shake(9, 30);
      audio.play('explosion_big');
      floatText(f.x, f.y + f.h + 20, f.z, 'THE MEGA DESTROYER IS DOWN!', '#F2E6C8', 2);
    },
  },
  ai: { attackRange: 110, zTolerance: 22, attackCooldown: [44, 84], firstAttackDelay: 50, ignoresTokens: true, retreatChance: 0, tellWarnFrames: 14 },
  phases: [
    // a machine: it takes every hit without flinching and it does not fall over (superArmor + noLaunch)
    { name: 'THE MEGA DESTROYER', hp: 560, color: VOLC.lava, armor: true, unlaunchable: true, walkSpeed: 1.0,
      // the hull takes 0.8x; the king up in the cockpit takes 1.5x, and you have to jump to reach him
      hurtParts: [{ name: 'hull', y: [0, MACHINE_LIFT], x: [-96, 96], damageMult: 0.8 }, { name: 'king', y: [MACHINE_LIFT, MACHINE_LIFT + 130], x: [-26, 26], damageMult: 1.5 }],
      ai: { attacks: [{ anim: 'cannon', range: 340, minRange: 90, weight: 3 }, { anim: 'drill', range: 150, weight: 4 },
        { anim: 'dig', range: 360, minRange: 60, weight: 3, tellFrames: 30 }, { anim: 'ram', range: 260, minRange: 60, weight: 2 },
        { anim: 'grow', range: 600, minRange: 0, weight: 2, maxUses: 3, tellFrames: 40 }] } },
    { name: 'THE MEGA KING', hp: 440, color: '#3FBF7F', armor: false, unlaunchable: true, walkSpeed: 1.3, build: MEGA_BUILD, anims: kingAnims,
      hurtParts: null,
      traits: { flinchEvery: 3, weight: 3, fireDamageMult: 0.5, shield: { name: 'EARTH STONES', max: 60, regen: 0.4, delay: 150, breakDelay: 300 } },
      ai: { attackRange: 90, attackCooldown: [36, 72],
        attacks: [{ anim: 'flame', range: 130, weight: 4 }, { anim: 'firebomb', range: 340, minRange: 100, weight: 3 },
          { anim: 'burrow', range: 420, minRange: 120, weight: 2 }, { anim: 'shellspin', range: 240, minRange: 60, weight: 2 },
          { anim: 'quake', range: 100, weight: 3 }] } },
  ],
};
