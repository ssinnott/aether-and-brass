// THE KOOPA TRIO, 2 of 3: THE TIN MAN. A giant koopa king made of tin plate, after the Tin Man of the Wizard of Oz:
// a funnel for a crown, rivets down every seam, and a red heart riveted in behind the belly plate. He fights with a
// weapon in each hand — an AXE in the near hand and a SHOVEL WITH CLAWS on its lip in the far one.
//   1. THE TIN MAN (380) — an overhead axe chop, a clawed-shovel scoop that flings dirt, and the two together. Every
//      120 hp he takes, his joints seize: RUSTED STIFF for a long punishable window, until he works them loose.
//   2. ALL HEART   (300) — the heart burns through the plate and he stops rusting; he swings faster, chains the
//      axe into the shovel every time, and spins both weapons round in the TIMBER whirl.
// He cannot go underground — he is far too heavy, and tin goes to rust in the wet down there — so the Volcano King's
// lava wave, which travels under the floor, is what reaches past him; one passing under him while he is rusted
// heats him loose on the spot (koopaTrio.ts). When he falls he drops both weapons, and they are the TIN AXE and the
// CLAW SHOVEL pickups (game/weapons.ts): the only tools that properly cut down Earth's Away (koopaEarth.ts).
import { frontBox, areaBox } from './common.ts';
import { KOOPA_PARTS, KOOPA_PROPS, KOOPA_SHELL, KOOPA_TAIL, makeKoopaBase, koopaStrike, koopaBossCommon } from './koopaRig.ts';
import { TIN, drawTinAxe, drawClawShovel, drawClod, drawLavaWave } from './koopaKit.ts';
import { TRIO_HOOKS } from './koopaTrio.ts';
import { floatText } from '../../art/fx.ts';
import { particles } from '../../engine/particles.ts';
import { audio } from '../../engine/audio.ts';

const hit = (damage: number, type: HitType, kbX: number, kbY: number, hitstun: number, extra?: Partial<Hitbox>): Partial<Hitbox> =>
  ({ damage, type, kbX, kbY, hitstun, once: true, ...(extra || {}) });

// ---------------------------------------------------------------- weapons and what they throw
/** The axe in the near hand (the rig's own weapon slot). */
const AXE = { attach: 'handR', length: 46, draw: drawTinAxe, headAt: 42 };
/** The shovel in the far hand: an accessory in that hand's space, drawn in the back layer with the far arm. */
const SHOVEL = { attach: 'handL', layer: 'back', draw: drawClawShovel };
/** Three clods of dirt off the shovel's lip, fanned. */
const CLODS = { style: 'stone', kind: 'lob', speed: 5.5, angle: 34, count: 3, spreadY: 12, spreadZ: 0.6, gravity: 0.4, bounces: 0, rest: false,
  r: 5, damage: 7, type: 'light', kbX: 2, kbY: 1, hitstun: 14, muzzle: false, offsetX: 40, offsetY: 16, draw: drawClod, hitSfx: 'hit_light' };

// ---------------------------------------------------------------- build
const TIN_PAL = { skin: TIN.tin, hair: TIN.tinDk, primary: TIN.plate, sleeve: TIN.sleeve, secondary: TIN.tinDk,
  accent: TIN.rivet, metal: TIN.bright, dark: TIN.dark, glow: TIN.heart };
const TIN_LOOK = { kind: 'tin', shell: TIN.shell, rim: TIN.rim, spike: TIN.cone, tip: TIN.rivet, horn: TIN.horn, claw: TIN.claw,
  cuff: TIN.cuff, eye: TIN.eye, maw: TIN.maw, jaw: TIN.jaw, funnel: true };
const TIN_BUILD = {
  palette: TIN_PAL, outline: '#161A20', outlineWidth: 1, proportions: { ...KOOPA_PROPS, torsoH: 30, upperLeg: 13, lowerLeg: 12 },
  parts: KOOPA_PARTS, scale: 1.65, smearColor: TIN.edge, koopa: TIN_LOOK, weapon: AXE,
  accessories: [KOOPA_SHELL, KOOPA_TAIL, SHOVEL],
};

// ---------------------------------------------------------------- animations
// The axe rides up on the shoulder (weapon -70: the head clear of the floor on every walk key) and the shovel hangs
// forward in the far hand, claws down.
const TC = { armR: [18, 30], weapon: -70, armL: [-10, 40] };
const LEGS = { legR: [18, 6], legL: [-16, 8] };
const LUNGE = { legR: [36, 10], legL: [-28, 26] };
const common = koopaBossCommon(TC, TIN.heart);
const CHOP_BOX = frontBox(74, hit(18, 'knockdown', 4, 4, 24));
const tinAnims = Object.assign(makeKoopaBase(TC), common, {
  // chop: the axe goes up over the funnel and comes straight down in front of him. The long one: read the raise.
  chop: koopaStrike({
    tell: 24, active: 7, recovery: 28, carry: TC, tellSfx: 'hammer_swing', sfx: 'hammer_slam',
    hitbox: CHOP_BOX, smear: { from: -160, to: 40, a: 0.46, r: 70 },
    fx: [{ kind: 'dust', x: 62, y: 0, count: 6 }, { kind: 'ring', x: 62, y: 0, r0: 4, r1: 34, flat: true, color: TIN.edge }],
    w1: { ...TC, ...LEGS, armR: [-120, -30], weapon: 20, armL: [-4, 40], torso: -8, head: -10, root: [-3, 0], face: 'angry' },
    w2: { ...TC, ...LEGS, armR: [-168, -20], weapon: 10, armL: [4, 44], torso: -18, head: -16, root: [-5, -1], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { ...TC, ...LUNGE, armR: [70, 0], weapon: -10, armL: [-24, 30], torso: 30, head: 4, root: [6, 2], squash: 1.07, stretch: 0.94, face: 'shout' },
    hold: { ...TC, ...LUNGE, armR: [72, 2], weapon: -8, armL: [-24, 30], torso: 32, head: 4, root: [6, 2], face: 'shout' },
    r: { ...TC, legR: [30, 10], legL: [-24, 20], armR: [50, 20], weapon: -30, armL: [-14, 34], torso: 20, head: -2, root: [4, 1], face: 'grit' },
  }),
  // scoop: the far hand drives the clawed shovel along the floor and flings what it rakes up. Low, and it launches.
  scoop: koopaStrike({
    tell: 18, active: 7, recovery: 22, carry: TC, tellSfx: 'grapple', sfx: 'whip',
    hitbox: frontBox(62, hit(12, 'launch', 3, 6, 24), { low: true }), event: 'spawnProjectile', projectile: CLODS,
    fx: [{ kind: 'dust', x: 44, y: 0, count: 8 }],
    w1: { ...TC, ...LEGS, armL: [-70, 30], armR: [10, 30], torso: 10, head: -4, root: [-3, 1], face: 'angry' },
    w2: { ...TC, legR: [26, 20], legL: [-20, 22], armL: [-96, 20], armR: [4, 30], torso: 18, head: 0, root: [-5, 2], squash: 1.04, stretch: 0.97, face: 'grit' },
    h: { ...TC, ...LUNGE, armL: [96, -20], armR: [-20, 30], torso: 22, head: 2, root: [6, 1], squash: 0.97, stretch: 1.03, face: 'shout' },
    hold: { ...TC, ...LUNGE, armL: [110, -24], armR: [-24, 30], torso: 18, head: 0, root: [6, 1], face: 'shout' },
    r: { ...TC, legR: [30, 10], legL: [-24, 20], armL: [60, 10], armR: [0, 30], torso: 14, head: -2, root: [4, 1], face: 'grit' },
  }),
});
const heartAnims = Object.assign({}, tinAnims, {
  // timber: both arms out, both weapons out, and he turns round and round like a felled tree coming down
  timber: koopaStrike({
    tell: 26, active: 30, recovery: 30, carry: TC, tellSfx: 'saw_whine', sfx: 'hammer_swing', armor: true,
    hitbox: { ...areaBox(58, hit(9, 'knockdown', 5, 4, 22)), once: false, rehit: 10, id: 'timber' }, move: { x: 1.5 },
    smear: { from: -120, to: 120, a: 0.4, r: 72 }, fx: [{ kind: 'slash', x: 0, y: 60, radius: 50, angle: 0, sweep: 200 }],
    w1: { ...TC, ...LEGS, armR: [-40, 10], weapon: 60, armL: [-60, 10], torso: -10, head: -8, root: [-2, 0], face: 'angry' },
    w2: { ...TC, legR: [24, 14], legL: [-22, 16], armR: [-80, 0], weapon: 80, armL: [-90, 0], torso: -16, head: -12, root: [-3, 1], squash: 1.04, stretch: 0.97, face: 'grit' },
    h: { ...TC, ...LEGS, armR: [90, 0], weapon: 90, armL: [90, 0], torso: 4, head: 0, root: [0, 0, 180], face: 'shout' },
    hold: { ...TC, ...LEGS, armR: [90, 0], weapon: 90, armL: [90, 0], torso: 4, head: 0, root: [0, 0, 360], face: 'shout' },
    r: { ...TC, legR: [26, 14], legL: [-22, 18], armR: [40, 20], weapon: -20, armL: [-30, 30], torso: 16, head: 0, root: [0, 1, 360], face: 'dazed' },
  }),
});

/** Is a lava wave running under him right now? (the Volcano King's, from any owner — heat is heat) */
function lavaUnder(f, world) {
  for (const e of world.entities) {
    if (e.kind !== 'projectile' || e.drawFn !== drawLavaWave || e.removeMe) continue;
    if (Math.abs(e.x - f.x) < 22 && Math.abs(e.z - f.z) < 18) return true;
  }
  return false;
}

/** THE TIN MAN — the trio's front line, with a weapon in each hand. */
export const koopaTin = {
  id: 'tinman', type: 'tinman', variant: 'king', name: 'THE TIN MAN', subtitle: 'OF THE KOOPA TRIO',
  role: 'boss', bossKind: 'boss', boss: true, trio: true, music: 'boss',
  build: TIN_BUILD, anims: tinAnims, score: 12000,
  // his two weapons land where he fell: the heroes' way through Earth's Away
  drops: ['tinaxe', 'clawshovel', 'food_big'],
  grabbable: false, throwDamageMult: 1, sfx: { hurt: 'clank', death: 'prop_break' },
  traits: { flinchEvery: 3, weight: 1.8 },
  hooks: {
    ...TRIO_HOOKS,
    onUpdate(f, world) {
      TRIO_HOOKS.onUpdate(f, world);
      if (f.ventTimer > 0) {
        // seized: flakes of rust off the joints, and the lava wave is the one thing that frees him early
        if ((world.frame & 7) === 0) particles.burst('debris', f.x, f.h * 0.5, f.z, 1, { speed: 0.6, up: 0.4, color: '#A4552C' });
        if (f.ventTimer > 2 && lavaUnder(f, world)) {
          f.ventTimer = 1;
          floatText(f.x, f.y + f.h + 12, f.z, 'HEATED LOOSE!', '#FFB43A', 2);
          particles.burst('steam', f.x, f.h * 0.4, f.z, 8, { speed: 1.4, up: 1.6 });
        }
      }
      // the heart burns through the plate in phase 2
      if (f.phaseIndex >= 1 && (world.frame & 15) === 0) particles.burst('ember', f.x + f.facing * 10, f.h * 0.45, f.z, 1, { speed: 0.5, up: 0.8, color: TIN.heart });
    },
    onVentOpen(f) { audio.play('clank'); particles.burst('debris', f.x, f.h * 0.6, f.z, 8, { speed: 1.4, up: 1.2, color: '#A4552C' }); },
    /** He works the joints free with the oil can: a hiss of steam, and he is back. */
    onVentClose(f) {
      audio.play('steam_vent');
      particles.burst('steam', f.x, f.h * 0.6, f.z, 6, { speed: 1, up: 1.2 });
      if (!f.dead) floatText(f.x, f.y + f.h + 12, f.z, 'OILED UP!', TIN.eye, 1);
    },
    onPhase(f, i, world) {
      if (!world || i === 0) return;
      world.addFx('ring', f.x, 50, f.z, { r0: 10, r1: 100, color: TIN.heart });
      particles.burst('ember', f.x, f.h * 0.5, f.z, 16, { speed: 2.4, up: 2.4, color: TIN.heart });
      if (world.camera) world.camera.shake(5, 14);
    },
  },
  ai: { attackRange: 64, zTolerance: 18, attackCooldown: [42, 80], firstAttackDelay: 44, ignoresTokens: true, retreatChance: 0, tellWarnFrames: 14 },
  phases: [
    { name: 'THE TIN MAN', hp: 380, color: TIN.tin, armor: false, unlaunchable: true, walkSpeed: 1.2,
      // RUSTED STIFF: every 120 hp, a long stall at 1.5x — the Tin Man's whole problem, and the heroes' opening
      vent: { everyHp: 120, frames: 110, flag: 'rusted', damageMult: 1.5, grabbable: false, stall: true, text: 'RUSTED STIFF!' },
      ai: { attacks: [{ anim: 'chop', range: 80, weight: 4 }, { anim: 'scoop', range: 70, weight: 3 },
        { anim: 'chop', range: 80, weight: 2, chain: 'scoop' }] } },
    { name: 'ALL HEART', hp: 300, color: TIN.heart, armor: false, unlaunchable: true, walkSpeed: 1.5, anims: heartAnims,
      ai: { attackCooldown: [32, 64],
        attacks: [{ anim: 'chop', range: 80, weight: 3, chain: 'scoop' }, { anim: 'scoop', range: 70, weight: 2 },
          { anim: 'timber', range: 90, weight: 3, tellFrames: 26 }] } },
  ],
};
