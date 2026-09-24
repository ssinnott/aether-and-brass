// THE KOOPA TRIO, 3 of 3: EARTH'S AWAY. An earthy koopa king: his head is made ENTIRELY OF DIRT, his spiked shell is
// STONE, and the rest of him is VINES — the spikes on his shell, his horns, his collar and every claw are pointed,
// thorny vine. He is the trio's support, and the one you cannot simply punch down:
//   ROOTED        fists, feet and fire barely move him — every hit that is not a chop does a quarter damage and
//                 never knocks him over. Only an AXE or a SHOVEL cuts him down (a weapon swing or throw marked
//                 `chop` in game/weapons.ts: the Tin Man's TIN AXE and CLAW SHOVEL, the Lime Rake, the Halberd),
//                 and those do half again as much and knock him flat. The Tin Man drops both when he falls.
//   VINE LASH     a long whip of vine that TANGLES whoever it catches (the `netted` status: mash out, or a partner's
//                 hit frees you).
//   BURROW        he sinks into the floor, tunnels under the nearest hero, and bursts up under them.
//   REGROWTH      he roots into the floor and the ground heals every king standing near him, himself a little too
//                 — his whole job in the trio is to keep the other two up.
//   1. EARTH'S AWAY (360) — lash, burrow, regrowth twice.
//   2. OVERGROWN    (300) — he blooms: a row of thorns runs out along the floor at you (BRAMBLE), and the regrowth
//      comes three times and heals more.
import { frontBox, areaBox } from './common.ts';
import { KOOPA_PARTS, KOOPA_PROPS, KOOPA_SHELL, KOOPA_TAIL, makeKoopaBase, koopaStrike, koopaBossCommon, FK } from './koopaRig.ts';
import { EARTH, drawBramble, drawMound } from './koopaKit.ts';
import { TRIO_HOOKS, trioAllies, healKing } from './koopaTrio.ts';
import { TEAM } from '../../constants.ts';
import { floatText } from '../../art/fx.ts';
import { particles } from '../../engine/particles.ts';
import { audio } from '../../engine/audio.ts';
import { clamp } from '../../lib/engine/math.ts';
import type { PoseSpec } from '../../lib/art/poses.ts';

const R = Math.round;
const hit = (damage: number, type: HitType, kbX: number, kbY: number, hitstun: number, extra?: Partial<Hitbox>): Partial<Hitbox> =>
  ({ damage, type, kbX, kbY, hitstun, once: true, ...(extra || {}) });
/** Tangled in vines: the engine's own net (game/status.ts `netted`). */
const TANGLE = { netted: { frames: 80, mashOut: 6 } };
/** What a non-chop hit is worth against him, and what a chop is worth. */
const ROOTED_MULT = 0.25, CHOP_MULT = 1.5;
/** How far REGROWTH reaches, and how much it heals the others / himself, per phase. */
const REGROW_RANGE = 420, REGROW = [{ allies: 50, self: 20 }, { allies: 70, self: 30 }];

// ---------------------------------------------------------------- what he sends out
/** BRAMBLE: thorns tearing up out of the floor in a line, 4 px a frame for 280 px; tangles what it catches. */
const BRAMBLE = { kind: 'straight', style: 'rubble', speed: 4, angle: 0, offsetX: 30, offsetY: 0, r: 9, life: 70, maxDist: 280,
  pierce: 99, damage: 10, type: 'medium', kbX: 1, kbY: 0, hitstun: 30, status: TANGLE, muzzle: false, zTol: 14, hitSfx: 'net', draw: drawBramble };

// ---------------------------------------------------------------- build
const EARTH_PAL = { skin: EARTH.vine, hair: EARTH.leaf, primary: EARTH.bark, sleeve: EARTH.sleeve, secondary: EARTH.vineDk,
  accent: EARTH.claw, metal: EARTH.pebble, dark: EARTH.dirt, glow: EARTH.spore };
const EARTH_LOOK = { kind: 'earth', shell: EARTH.stone, rim: EARTH.stoneDk, spike: EARTH.thorn, tip: EARTH.point, horn: EARTH.horn, claw: EARTH.claw,
  cuff: EARTH.coil, eye: EARTH.eye, maw: EARTH.maw, jaw: EARTH.dirtDk, dirtHead: true };
const EARTH_BUILD = {
  palette: EARTH_PAL, outline: '#120E0A', outlineWidth: 1, proportions: { ...KOOPA_PROPS, headR: 13, torsoW: 34, hip: 28 },
  parts: KOOPA_PARTS, scale: 1.6, smearColor: EARTH.thorn, koopa: EARTH_LOOK, accessories: [KOOPA_SHELL, KOOPA_TAIL],
};

// ---------------------------------------------------------------- animations
const EC = { armR: [20, 44], armL: [-14, 38] };
const LEGS = { legR: [18, 6], legL: [-16, 8] };
const LUNGE = { legR: [36, 10], legL: [-28, 26] };
const common = koopaBossCommon(EC, EARTH.leaf);
/** Sunk: the body pushed down through the floor line (drawBefore clips everything under it). */
const SUNK: PoseSpec = { ...EC, legR: [40, 60], legL: [-20, 60], armR: [-40, 60], armL: [-50, 60], torso: 30, head: 10, face: 'closed' };
const earthAnims = Object.assign(makeKoopaBase(EC), common, {
  // lash: the near arm unwinds into a 90 px whip of vine. It pulls you in a step and ties you up.
  lash: koopaStrike({
    tell: 20, active: 8, recovery: 26, carry: EC, tellSfx: 'grapple', sfx: 'whip',
    hitbox: frontBox(92, hit(8, 'medium', -3, 0, 22, { status: TANGLE })), smear: { from: -60, to: 90, a: 0.4, r: 90 },
    fx: [{ kind: 'slash', x: 70, y: 50, radius: 30, angle: 0, sweep: 70, color: '#86B04A' }],
    w1: { ...EC, ...LEGS, armR: [-60, 60], armL: [-4, 40], torso: -4, head: -8, root: [-3, 0], face: 'angry' },
    w2: { ...EC, ...LEGS, armR: [-100, 40], armL: [6, 42], torso: -12, head: -12, root: [-5, 0], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...EC, ...LUNGE, armR: [92, -6], armL: [-30, 24], torso: 22, head: 2, root: [6, 1], squash: 1.04, stretch: 0.96, face: 'shout' },
    hold: { ...EC, ...LUNGE, armR: [96, -8], armL: [-32, 24], torso: 24, head: 2, root: [6, 1], face: 'shout' },
    r: { ...EC, legR: [30, 10], legL: [-24, 20], armR: [60, 20], armL: [-20, 30], torso: 14, head: -2, root: [3, 1], face: 'grit' },
  }),
  // burrow: down through the floor (invulnerable), across under it to whoever is nearest, up under their feet
  burrow: { loop: false, frames: [
    FK(14, { ...EC, legR: [30, 40], legL: [-20, 40], armR: [-30, 50], armL: [-40, 50], torso: 24, head: 6, root: [0, 3], squash: 1.1, stretch: 0.9, face: 'grit' },
      { tell: true, sfx: 'land_heavy', ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }] }),
    FK(12, { ...SUNK, root: [0, 60] }, { tell: true, invuln: true, ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 10 }] }),
    FK(30, { ...SUNK, root: [0, 120] }, { invuln: true, event: 'tunnel', ease: 'inout' }),
    FK(8, { ...EC, legR: [30, 10], legL: [-20, 14], armR: [-150, -10], armL: [-160, -10], torso: -10, head: -20, root: [0, 0], squash: 0.9, stretch: 1.12, face: 'shout' },
      { hitbox: { ...areaBox(40, hit(16, 'launch', 3, 7, 26, { status: TANGLE })), id: 'erupt' }, sfx: 'hammer_slam', ease: 'overshoot',
        fx: [{ kind: 'ring', x: 0, y: 0, r0: 6, r1: 56, flat: true, color: EARTH.thorn }, { kind: 'dust', x: 0, y: 0, count: 14 }] }),
    FK(4, { ...EC, ...LEGS, armR: [-140, -10], armL: [-150, -10], torso: -8, head: -18, root: [0, 0], face: 'shout' }, { ease: 'out' }),
    FK(28, { ...EC, legR: [26, 16], legL: [-20, 18], armR: [30, 40], armL: [20, 40], torso: 18, head: 0, root: [0, 2], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...EC, ...LEGS, torso: 8, head: -6, footR: 0, footL: 0, root: [0, 0] }, { ease: 'out' }),
  ] },
  // regrowth: claws into the floor, the roots light up, and every king near him closes his wounds
  regrowth: koopaStrike({
    tell: 36, active: 10, recovery: 28, carry: EC, tellSfx: 'steam_vent', sfx: 'chime', event: 'regrow',
    fx: [{ kind: 'ring', x: 0, y: 0, r0: 8, r1: 90, flat: true, color: EARTH.spore }],
    w1: { ...EC, legR: [24, 20], legL: [-20, 22], armR: [40, 60], armL: [30, 60], torso: 26, head: 10, root: [0, 2], face: 'closed' },
    w2: { ...EC, legR: [28, 30], legL: [-22, 30], armR: [60, 70], armL: [50, 70], torso: 34, head: 14, root: [0, 3], squash: 1.06, stretch: 0.95, face: 'closed' },
    h: { ...EC, ...LEGS, armR: [-150, -20], armL: [-160, -20], torso: -12, head: -22, root: [0, 0], squash: 0.95, stretch: 1.06, face: 'shout' },
    hold: { ...EC, ...LEGS, armR: [-154, -20], armL: [-164, -20], torso: -14, head: -24, root: [0, 0], face: 'shout' },
    r: { ...EC, ...LEGS, armR: [-40, 30], armL: [-50, 30], torso: 0, head: -10, root: [0, 0], face: 'angry' },
  }),
});
const overgrownAnims = Object.assign({}, earthAnims, {
  // bramble: he stamps and a line of thorns tears up out of the floor, running at you
  bramble: koopaStrike({
    tell: 26, active: 8, recovery: 28, carry: EC, tellSfx: 'grapple', sfx: 'hammer_slam',
    event: 'spawnProjectile', projectile: BRAMBLE,
    fx: [{ kind: 'dust', x: 30, y: 0, count: 10 }, { kind: 'ring', x: 30, y: 0, r0: 4, r1: 40, flat: true, color: EARTH.thorn }],
    w1: { ...EC, ...LEGS, armR: [-70, 20], armL: [-80, 20], torso: -8, head: -12, root: [-2, 0], face: 'angry' },
    w2: { ...EC, legR: [60, -20], legL: [-16, 8], armR: [-90, 10], armL: [-100, 10], torso: -14, head: -16, root: [-3, -2], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { ...EC, legR: [40, 34], legL: [-26, 34], armR: [40, 30], armL: [30, 30], torso: 30, head: 6, root: [4, 4], squash: 1.12, stretch: 0.9, face: 'shout' },
    hold: { ...EC, legR: [40, 34], legL: [-26, 34], armR: [42, 30], armL: [32, 30], torso: 30, head: 6, root: [4, 4], face: 'shout' },
    r: { ...EC, legR: [28, 18], legL: [-22, 22], armR: [30, 40], armL: [20, 40], torso: 18, head: 0, root: [2, 2], face: 'grit' },
  }),
});

/** A chop: a weapon swing or throw from an axe or a shovel (game/weapons.ts marks those hits `chop`). */
const isChop = (h) => !!(h && h.chop);

/** EARTH'S AWAY — the trio's support, and the reason the heroes need the Tin Man's tools. */
export const koopaEarth = {
  id: 'earthsaway', type: 'earthsaway', variant: 'king', name: "EARTH'S AWAY", subtitle: 'OF THE KOOPA TRIO',
  role: 'boss', bossKind: 'boss', boss: true, trio: true, music: 'boss',
  build: EARTH_BUILD, anims: earthAnims, score: 14000, drops: ['food_big', 'score_big'],
  grabbable: false, throwDamageMult: 1, sfx: { hurt: 'land_heavy', death: 'prop_break' },
  traits: { weight: 2.2 },
  hooks: {
    ...TRIO_HOOKS,
    /** ROOTED: a quarter of anything that is not a chop, and never off his feet; a chop does 1.5x and fells him. */
    onHitTaken(f, h, attacker, world) {
      if (isChop(h)) return { ...h, damage: Math.round((h.damage || 0) * CHOP_MULT), breaksArmor: true };
      if (world && world.frame - (f.rootedSaid || -999) > 90) {
        f.rootedSaid = world.frame;
        floatText(f.x, f.y + f.h + 10, f.z, 'ROOTED! USE AN AXE', EARTH.point, 1);
      }
      return { ...h, damage: Math.max(1, Math.round((h.damage || 0) * ROOTED_MULT)) };
    },
    onAnimEvent(f, name, frame, world) {
      if (name === 'tunnel') {
        // across under the floor to the nearest hero, and up under their feet
        const t = world.nearestEnemy ? world.nearestEnemy(f.x, f.z, { team: TEAM.PLAYER, maxDist: 700 }) : null;
        if (t) {
          const b = world.boundsFor(f), dir = Math.sign(t.x - f.x) || f.facing;
          f.x = clamp(t.x - dir * 6, b.x0, b.x1); f.z = t.z; f.facing = dir;
        }
        audio.play('land_heavy');
        return true;
      }
      if (name === 'regrow') {
        const heal = REGROW[Math.min(REGROW.length - 1, f.phaseIndex || 0)];
        for (const e of trioAllies(f, world)) {
          if (Math.abs(e.x - f.x) > REGROW_RANGE) continue;
          if (healKing(e, heal.allies) > 0) particles.burst('ember', e.x, e.h * 0.5, e.z, 10, { speed: 1.4, up: 2, color: EARTH.spore });
        }
        healKing(f, heal.self);
        particles.burst('ember', f.x, 10, f.z, 14, { speed: 2, up: 2.6, color: EARTH.leaf });
        return true;
      }
      return false;
    },
    /** Under the floor, the body is clipped at the floor line and a mound of dirt marks where he is. */
    drawBefore(ctx, f, sx, sy) {
      const under = f.anim.name === 'burrow' && f.anim.frameIndex >= 1 && f.anim.frameIndex <= 2;
      if (under) drawMound(ctx, sx, sy, f.world ? f.world.frame >> 2 : 0);
      if (f.anim.name === 'burrow' && f.anim.frameIndex <= 2) {
        ctx.save(); ctx.beginPath(); ctx.rect(sx - 320, sy - 400, 640, 400); ctx.clip();
        f.rig.burrowClip = true;
      }
    },
    drawAfter(ctx, f) {
      if (f.rig.burrowClip) { ctx.restore(); f.rig.burrowClip = false; }
    },
    onPhase(f, i, world) {
      if (!world || i === 0) return;
      particles.burst('ember', f.x, f.h * 0.7, f.z, 20, { speed: 2.2, up: 2.8, color: EARTH.bloom, sizeJitter: 1.2 });
      world.addFx('ring', f.x, 40, f.z, { r0: 10, r1: 100, color: EARTH.leaf });
    },
  },
  ai: { attackRange: 70, zTolerance: 18, attackCooldown: [48, 88], firstAttackDelay: 50, ignoresTokens: true, retreatChance: 0, tellWarnFrames: 14 },
  phases: [
    { name: "EARTH'S AWAY", hp: 360, color: EARTH.vine, armor: true, unlaunchable: true, walkSpeed: 1.1,
      ai: { attacks: [{ anim: 'lash', range: 100, weight: 4 }, { anim: 'burrow', range: 400, minRange: 90, weight: 3 },
        { anim: 'regrowth', range: 500, minRange: 0, weight: 2, maxUses: 2, tellFrames: 36 }] } },
    { name: 'OVERGROWN', hp: 300, color: EARTH.bloom, armor: true, unlaunchable: true, walkSpeed: 1.3, anims: overgrownAnims,
      ai: { attackCooldown: [38, 72],
        attacks: [{ anim: 'lash', range: 100, weight: 3 }, { anim: 'burrow', range: 400, minRange: 90, weight: 2 },
          { anim: 'bramble', range: 300, minRange: 60, weight: 3 }, { anim: 'regrowth', range: 500, minRange: 0, weight: 2, maxUses: 3, tellFrames: 36 }] } },
  ],
};
