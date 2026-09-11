// Enemy Type C: The Gleaning — the salvage guild that follows the fighting on tailings-gas bladders and strips whatever
// falls out of it. Seven variants: Chaff (bouncing rusher), Winnow (perching ballast dropper), Thresher (the shadow that
// dives), Sickle (the grounded thief), Harvestman (the elite that calls the crop in from above), and from issue #28
// the Picker (grounded fodder with no bladder at all, the one Gleaner you can grab at will) and the Riggerman (the grabber
// who drops a net on you from the hang line and lands beside the man it pinned). Rig, palette, parts, bladder and the
// base animation set live in gleaningRig.js; every attack here is hand-keyed (docs/ART_STYLE.md 8):
// anticipation -> smear hit -> hold -> follow-through (punish) -> return, with an ease on every key.
//
// Faction rules (BASE_HOOKS in gleaningRig.js): SHOT DOWN (1.25x on top of the core's 1.2x air bonus = 1.5x and a juggle
// on any hit taken airborne) and the bladder weak point (hurtParts tile the full rig height, the bag box takes 1.6x).
// Every hover ends in a long `punish: true` recovery with ai.punishGrabbable, so the landing is the hero moment: you
// cannot grab a hovering Gleaner (grabs.js refuses airborne targets), you collect it on the deck.
import { frontBox, makeEnemyDef } from './common.js';
import {
  GLEAN, GLEAN_OUTLINE, GLEAN_PAL, GLEAN_PROPS, GLEAN_PARTS, CHALK, FK,
  drawBladder, drawWristTool, drawHipGear, makeGleanBase, BASE_HOOKS, ventPuff,
} from './gleaningRig.js';
import { celRect, band, tones } from '../../art/shading.js';
import { pathRrect, pathPoly, paint } from '../../art/shapes.js';
import { floatText } from '../../art/fx.js';
import { particles } from '../../engine/particles.js';
import { audio } from '../../engine/audio.js';
import { clamp } from '../../engine/math.js';
import { ST } from '../../constants.js';

const R = Math.round;
const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, ...(extra || {}) });
// THE HANG LINE is 64: `move: { vy: 8 }` under GRAVITY 0.5 tops out there, two pixels above every standard ground
// hitbox in the game (frontBox tops out at owner.y + 62) and comfortably inside a jump attack (hero apex ~90).
/** A Sickle only runs for a purse worth running with (and never takes more than one). */
const PURSE = 20, STEAL = 50;

// ---------------------------------------------------------------- shared def assembly
const BASE = {
  type: 'gleaning', faction: 'gleaning', walkSpeed: 1.6,
  build: { scale: 0.95, palette: GLEAN_PAL, outline: GLEAN_OUTLINE, outlineWidth: 1, proportions: GLEAN_PROPS, parts: GLEAN_PARTS,
    smearColor: GLEAN.zinc, bagShape: 'taut', chalk: CHALK.chaff },
  sfx: { hurt: 'hydraulic', death: 'steam_vent' },
  ai: { attackRange: 44, zTolerance: 12, attackCooldown: [40, 85], firstAttackDelay: 40, tokenGroup: 'gleaning', maxAttackers: 2, tellWarnFrames: 10 },
};
/** makeEnemyDef does not carry traits / hooks / hurtParts / projectiles: the faction wrapper attaches them. */
function def(v, hooks) {
  const d = makeEnemyDef(BASE, v);
  d.traits = { ...(v.traits || {}) };
  d.hooks = { ...BASE_HOOKS, ...(hooks || {}) };
  d.hurtParts = v.hurtParts;
  if (v.projectiles) d.projectiles = v.projectiles;
  if (v.grabOffset) d.grabOffset = v.grabOffset;
  return d;
}
/** The bladder is on every Gleaner; `tool` / `hipGear` select what hangs below the hands and off the belt. */
const BAG_ACC = { attach: 'back', draw: drawBladder };
const WRIST_ACC = { attach: 'handR', draw: drawWristTool };
const HIP_ACC = { attach: 'hip', draw: drawHipGear };

// ---------------------------------------------------------------- C1 CHAFF: the bounce. Low pokes whiff under it; it always lands inside its own punish window.
const CHAFF_CARRY = { armR: [16, 16], armL: [-19, 18] };
/**
 * PER-VARIANT STANCE AND GAIT (gleaningRig.makeGleanBase `o`). Five jobs, five ways of standing: the head pass gave
 * the guild five hoods, but five hoods on one pose still measured as one silhouette (worst pairwise IoU 0.720 against
 * a 0.79 bound — the hood is a small share of a shape whose biggest mass is a gasbag). The stance is where the rest
 * of the difference lives, and it costs no gameplay field: `stance` is the neutral pose every base animation inherits,
 * `stride` scales the leg swing and `bob` the weight drop, both applied to BOTH mirror halves so the walk cycle's
 * mirror contract stays exact.
 */
const CHAFF_STANCE = { stance: { torso: -1, head: 8, legR: [18, 4], legL: [-20, 6], footR: -20, footL: -17 }, stride: 1.15, bob: 1.2 };
// the winch hand works BENT OVER her drop with her feet together on a perch: a tall narrow column, knees close.
const WIN_STANCE = { stance: { torso: 14, head: -6, legR: [6, 14], legL: [-7, 16], footR: -10, footL: -8 }, stride: 0.8, bob: 0.75 };
// the bruiser is SQUAT and rooted, leaning back under two over-pressured bags: knees bent, feet planted, no reach.
const THR_STANCE = { stance: { torso: -12, head: 2, legR: [13, 16], legL: [-15, 18], footR: -8, footL: -6 }, stride: 0.75, bob: 1.3 };
// the thief PROWLS: a deep wide crouch, weight back over the trailing foot, ready to be somewhere else.
const SIC_STANCE = { stance: { torso: 1, head: 5, legR: [30, -2], legL: [-21, 16], footR: -26, footL: -14 }, stride: 1.2, bob: 0.9 };
const HAR_STANCE = { stance: { torso: -8, head: 10, legR: [11, 5], legL: [-13, 7], footR: -16, footL: -14 }, stride: 0.9, bob: 0.75 };
const chaffAnims = Object.assign(makeGleanBase(CHAFF_CARRY, CHAFF_STANCE), {
  // hop: 14f fold-and-swell tell -> the leap (8f active at y 20-40, move x 6 / vy 6) -> hold -> 22f recovery, split so the
  // absorb happens WHERE THE FEET ARE: ~24f of airtime from the active key means touchdown lands ~14f into the recovery,
  // so the first 12f trail the legs in the air and the last 10f are the landing squash. No smear: the flying kick has
  // nothing in the hand (ART_STYLE 8 gives non-weapon strikes overshoot + squash + dust, which this already has).
  hop: { loop: false, frames: [
    FK(8, { ...CHAFF_CARRY, torso: 12, head: 10, legR: [32, 42], legL: [-20, 42], armR: [-22, 20], armL: [-38, 22], footR: -10, footL: -8,
      root: [-2, 2], squash: 1.08, stretch: 0.93, face: 'angry' }, { tell: true, ease: 'in' }),
    FK(6, { ...CHAFF_CARRY, torso: 17, head: 13, legR: [40, 52], legL: [-25, 52], armR: [-32, 26], armL: [-48, 26], footR: -6, footL: -4,
      root: [-4, 3], squash: 1.12, stretch: 0.9, face: 'angry' }, { tell: true, sfx: 'steam_vent', ease: 'out' }),
    FK(8, { ...CHAFF_CARRY, torso: -14, head: -6, legR: [86, 6], legL: [24, 18], armR: [-68, -26], armL: [-84, -22], footR: 12, footL: -12,
      root: [5, -6], squash: 0.94, stretch: 1.07, face: 'shout' },
    { hitbox: frontBox(40, hit(6, 'medium', 4, 0, 18)), move: { x: 6, vy: 6 },
      fx: [{ kind: 'steam', x: -12, y: 26, count: 3 }], sfx: 'whiff', ease: 'overshoot' }),
    FK(3, { ...CHAFF_CARRY, torso: -18, head: -8, legR: [90, 4], legL: [28, 16], armR: [-72, -26], armL: [-88, -22], footR: 14, footL: -12,
      root: [6, -6], squash: 0.96, stretch: 1.05, face: 'shout' }, { ease: 'out' }),
    FK(12, { ...CHAFF_CARRY, torso: -4, head: 2, legR: [46, -18], legL: [10, -14], armR: [-40, -6], armL: [-54, -4], footR: 6, footL: -6,
      root: [4, -4], face: 'grit' }, { punish: true, ease: 'in' }),
    FK(10, { ...CHAFF_CARRY, torso: 14, head: 10, legR: [30, 34], legL: [-18, 36], armR: [-14, 16], armL: [-28, 18], footR: -14, footL: -12,
      root: [3, 1], squash: 1.14, stretch: 0.88, face: 'grit' }, { punish: true, ease: 'overshoot', fx: [{ kind: 'dust', x: 0, y: 0, count: 4 }] }),
    FK(6, { ...CHAFF_CARRY, torso: -3, head: 6, legR: [14, 6], legL: [-16, 8], footR: -18, footL: -15, root: [0, 0] }, { ease: 'out' }),
  ] },
  // snag: the ground answer — a low hook with the wrist gaff that trips. It is a LOW box: jump it.
  snag: { loop: false, frames: [
    FK(10, { ...CHAFF_CARRY, armR: [-46, -30], armL: [34, 16], torso: 6, head: 2, root: [-3, 0], legR: [12, 8], legL: [-16, 12], face: 'angry' }, { tell: true, ease: 'in' }),
    FK(6, { ...CHAFF_CARRY, armR: [-62, -34], armL: [42, 18], torso: 10, head: 4, root: [-5, 1], legR: [16, 14], legL: [-18, 16], face: 'angry', squash: 1.04, stretch: 0.97 }, { tell: true, ease: 'out' }),
    FK(6, { ...CHAFF_CARRY, armR: [96, 30], armL: [-34, 14], torso: 28, head: 12, root: [4, 1], legR: [40, 16], legL: [-26, 28], face: 'shout', squash: 1.05, stretch: 0.96 },
      { hitbox: { ...frontBox(44, hit(6, 'knockdown', 3, 4, 20)), low: true }, smear: { from: -50, to: 80, a: 0.45, r: 52 },
        fx: [{ kind: 'dust', x: 34, y: 0, count: 4 }], sfx: 'whiff', ease: 'overshoot' }),
    FK(3, { ...CHAFF_CARRY, armR: [102, 32], armL: [-36, 14], torso: 30, head: 12, root: [5, 1], legR: [40, 16], legL: [-26, 28], face: 'shout' }, { ease: 'out' }),
    FK(20, { ...CHAFF_CARRY, armR: [78, 24], armL: [-28, 12], torso: 20, head: 8, root: [3, 0], legR: [32, 12], legL: [-22, 24], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...CHAFF_CARRY, torso: -3, head: 6, legR: [14, 6], legL: [-16, 8], footR: -18, footL: -15, root: [0, 0] }, { ease: 'out' }),
  ] },
});
/**
 * The two-channel tell (bag swells + gas lights) has to stay ON for the whole dangerous window, not just the two keys
 * the core marks `tell: true`: gleaningRig.js drives rig.swell / rig.gas off rig.tell, and enemy.js clears rig.tell the
 * moment the wind-up ends — which is exactly when the Chaff leaves the ground. Hold it across the airborne keys.
 */
const chaffHooks = {
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    const a = f.anim;
    if (a.name === 'hop' && a.frameIndex >= 2 && a.frameIndex <= 4) { f.rig.gas = 1; f.rig.swell = 1.1; }
  },
};
const chaff = def({
  variant: 'chaff', name: 'CHAFF', role: 'rusher', hp: 40, damage: 1, speed: 1.25, score: 150, drops: 'none',
  build: { ...BASE.build, scale: 0.9, bagShape: 'slack', hood: 'rag', chalk: CHALK.chaff, tool: 'gaff', accessories: [BAG_ACC, WRIST_ACC] },
  anims: chaffAnims,
  traits: { weight: 0.8 },
  hurtParts: [{ name: 'body', y: [0, 38] }, { name: 'bag', y: [38, 66], damageMult: 1.6 }],
  ai: { attackRange: 44, zTolerance: 12, firstAttackDelay: 36, attackCooldown: [30, 66], maxAttackers: 2, tellWarnFrames: 10,
    attacks: [{ anim: 'hop', range: 96, minRange: 40, weight: 4, tellFrames: 14 }, { anim: 'snag', range: 44, weight: 2 }] },
}, chaffHooks);

// ---------------------------------------------------------------- C2 WINNOW: the perch. Cranks to the hang line and drops three re-aimed ballast bags.
/** A bag of grit, not a bomb: no fuse, no explosion, no element. The counterplay is your feet. */
function drawBallast(ctx, p, sx, sy) {
  const y = sy - p.r;
  pathRrect(ctx, sx - 6, y - 6, 12, 13, 3); paint(ctx, GLEAN.sack, GLEAN_OUTLINE, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(sx - 5, y + 1, 10, 5);
  ctx.fillStyle = GLEAN.rope; ctx.fillRect(sx - 4, y - 7, 8, 3);
}
const BALLAST = { style: 'bomb', kind: 'lob', aimAt: true, flight: 26, gravity: 0.5, bounces: 0, rest: false, offsetX: 0, offsetY: 0,
  r: 6, muzzle: false, color: GLEAN.sack, damage: 9, type: 'knockdown', kbX: 2, kbY: 4, hitstun: 20, friendly: true, hitSfx: 'land_heavy', draw: drawBallast };
const WIN_CARRY = { armR: [10, 22], armL: [-14, 24] };
const WIN_HANG = { armR: [-30, 40], armL: [-40, 42], torso: -6, head: 12, legR: [16, -40], legL: [-12, -34], footR: -30, footL: -28, face: 'angry' };
const winnowAnims = Object.assign(makeGleanBase(WIN_CARRY, WIN_STANCE), {
  // ballast: 20f crank tell -> 16f rise to the hang line -> 34f hang at y 64 -> sink -> 26f punish.
  // The hang is THREE micro-beats of aim(5-6f, `aim` re-aims live) -> reach(3f, arm back to the bandolier, torso up,
  // ease in) -> release(3f, both arms driven forward-down, torso over, overshoot + smear, `spawn`), and the three aim
  // keys differ from each other. The old version was two byte-identical poses flip-flopped for 34 frames: a 9-damage
  // knockdown bomb with no anticipation, no smear and no follow-through (ART_STYLE 8 / 10).
  ballast: { loop: false, frames: [
    FK(12, { ...WIN_CARRY, armR: [40, 60], armL: [-20, 30], torso: 10, head: 10, root: [-2, 0], legR: [14, 10], legL: [-16, 12], face: 'angry' },
      { tell: true, sfx: 'grapple', ease: 'in' }),
    FK(8, { ...WIN_CARRY, armR: [64, 40], armL: [-26, 34], torso: 14, head: 12, root: [-3, 2], legR: [20, 16], legL: [-20, 18], face: 'angry', squash: 1.06, stretch: 0.95 },
      { tell: true, ease: 'out' }),
    FK(16, { ...WIN_HANG, armR: [-16, 46], armL: [-24, 48], torso: -12, head: 8, root: [0, -4], squash: 0.94, stretch: 1.07, face: 'grit' },
      { move: { vy: 8 }, sfx: 'steam_vent', fx: [{ kind: 'steam', x: -8, y: 20, count: 4 }], ease: 'out' }),
    FK(6, { ...WIN_HANG, root: [0, 0] }, { event: 'aim', ease: 'inout' }),
    FK(3, { ...WIN_HANG, armR: [-92, 18], armL: [-52, 44], torso: -18, head: 16, root: [-1, -1], legR: [20, -44], legL: [-16, -36] }, { ease: 'in' }),
    FK(3, { ...WIN_HANG, armR: [10, 55], armL: [-16, 50], torso: 4, head: 4, root: [1, 1], legR: [10, -32], legL: [-6, -28], face: 'shout' },
      { spawn: { projectile: BALLAST, y: 0 }, smear: { from: -60, to: 40, a: 0.35, r: 34 }, sfx: 'throw', ease: 'overshoot' }),
    FK(5, { ...WIN_HANG, armR: [-26, 44], armL: [-36, 46], torso: -2, head: 8, root: [1, -1], legR: [22, -46], legL: [-18, -30] }, { event: 'aim', ease: 'inout' }),
    FK(3, { ...WIN_HANG, armR: [-92, 18], armL: [-52, 44], torso: -18, head: 16, root: [-1, 0], legR: [24, -48], legL: [-18, -34] }, { ease: 'in' }),
    FK(3, { ...WIN_HANG, armR: [10, 55], armL: [-16, 50], torso: 4, head: 4, root: [1, 1], legR: [12, -34], legL: [-8, -30], face: 'shout' },
      { spawn: { projectile: BALLAST, y: 0 }, smear: { from: -60, to: 40, a: 0.35, r: 34 }, sfx: 'throw', ease: 'overshoot' }),
    FK(5, { ...WIN_HANG, armR: [-34, 38], armL: [-44, 40], torso: -8, head: 14, root: [-1, 0], legR: [12, -34], legL: [-8, -40] }, { event: 'aim', ease: 'inout' }),
    FK(3, { ...WIN_HANG, armR: [-92, 18], armL: [-52, 44], torso: -18, head: 16, root: [-1, -1], legR: [18, -42], legL: [-14, -38] }, { ease: 'in' }),
    FK(3, { ...WIN_HANG, armR: [10, 55], armL: [-16, 50], torso: 4, head: 4, root: [1, 1], legR: [10, -30], legL: [-6, -26], face: 'shout' },
      { spawn: { projectile: BALLAST, y: 0 }, smear: { from: -60, to: 40, a: 0.35, r: 34 }, sfx: 'throw', ease: 'overshoot' }),
    FK(6, { ...WIN_HANG, armR: [-6, 40], armL: [-14, 42], torso: 8, head: 14, legR: [20, -20], legL: [-14, -16], face: 'grit' }, { move: { vy: -6 }, ease: 'in' }),
    FK(26, { ...WIN_CARRY, armR: [24, 30], armL: [-22, 30], torso: 14, head: 12, root: [0, 1], legR: [26, 24], legL: [-20, 26], face: 'grit', squash: 1.06, stretch: 0.95 },
      { punish: true, ease: 'inout' }),
    FK(6, { ...WIN_CARRY, torso: -3, head: 6, legR: [14, 6], legL: [-16, 8], footR: -18, footL: -15, root: [0, 0] }, { ease: 'out' }),
  ] },
  // shove: the panic answer with both lines in its fists when something is inside 36px
  shove: { loop: false, frames: [
    FK(7, { ...WIN_CARRY, armR: [-24, 74], armL: [-30, 70], torso: -8, head: 0, root: [-3, 1], legR: [10, 8], legL: [-14, 10], face: 'hurt' }, { tell: true, ease: 'in' }),
    FK(5, { ...WIN_CARRY, armR: [-34, 84], armL: [-40, 78], torso: -12, head: -2, root: [-5, 2], legR: [8, 8], legL: [-16, 12], face: 'hurt', squash: 0.97, stretch: 1.03 }, { tell: true, ease: 'out' }),
    // no smear: an empty two-hand bash, nothing in the hand to leave an arc (the default smear draws a zinc crescent)
    FK(6, { ...WIN_CARRY, armR: [76, 24], armL: [70, 26], torso: 22, head: 10, root: [4, 1], legR: [32, 12], legL: [-24, 24], face: 'shout', squash: 1.04, stretch: 0.97 },
      { hitbox: frontBox(36, hit(6, 'medium', 6, 0, 14)), fx: [{ kind: 'dust', x: 30, y: 0, count: 3 }], sfx: 'whiff', ease: 'overshoot' }),
    FK(3, { ...WIN_CARRY, armR: [82, 22], armL: [76, 24], torso: 24, head: 10, root: [5, 1], legR: [32, 12], legL: [-24, 24], face: 'shout' }, { ease: 'out' }),
    FK(20, { ...WIN_CARRY, armR: [58, 26], armL: [52, 28], torso: 16, head: 8, root: [3, 0], legR: [26, 12], legL: [-20, 22], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...WIN_CARRY, torso: -3, head: 6, legR: [14, 6], legL: [-16, 8], footR: -18, footL: -15, root: [0, 0] }, { ease: 'out' }),
  ] },
});
/**
 * The hang: re-arming noGravity every step of the hang frames pins the altitude (the core decrements it in physics).
 * The bandolier is finite — six bags, two volleys — and it is also the unit's clock: an EMPTY Winnow has nothing left
 * to perch for, so zeroing its retreat budget drops it out of KEEP_DISTANCE for good (enemy.js gates both the
 * KEEP_DISTANCE entry and thinkRanged on `retreatBudget > 0`) and it has to come down and work the floor with a shove,
 * which it is bad at. You can read exactly how much perch it has left off its own silhouette.
 */
const winnowHooks = {
  onSpawn(f) { f.bagsLeft = 6; f.rig.bags = 6; },
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    const a = f.anim;
    if (a.name === 'ballast') {
      // hang keys 3..11 (aim/reach/release x3) pin the altitude; key 12 is the sink and MUST let go of the pin, or
      // fighter.js zeroes `move.vy: -6` on the same physics step it is applied and the drop starts ~2 frames late,
      // eating the front of the advertised grabbable landing.
      if (a.frameIndex >= 3 && a.frameIndex <= 11) f.noGravity = 2;
      else if (a.frameIndex >= 12) f.noGravity = 0;
      if (a.frameIndex >= 2 && a.frameIndex <= 11) { f.rig.gas = 1; f.rig.swell = 1.12; }   // the tell stays lit while it hangs
      if (a.newFrame && (a.frameIndex === 5 || a.frameIndex === 8 || a.frameIndex === 11) && f.bagsLeft > 0) f.bagsLeft--;
    }
    f.rig.bags = f.bagsLeft;
    if (f.bagsLeft <= 0) f.retreatBudget = 0;
  },
  onLanded(f, world, from) {
    BASE_HOOKS.onLanded(f, world, from);
    if (!f.dead) audio.play('land_heavy');
  },
};
const winnow = def({
  variant: 'winnow', name: 'WINNOW', role: 'ranged', hp: 42, damage: 1, speed: 1, score: 250, drops: 'none',
  build: { ...BASE.build, scale: 1, bagShape: 'tall', hood: 'peak', chalk: CHALK.winnow, hipGear: 'drum', bags: 6, accessories: [BAG_ACC, HIP_ACC] },
  anims: winnowAnims,
  traits: { weight: 0.9 },
  hurtParts: [{ name: 'body', y: [0, 40] }, { name: 'bag', y: [40, 74], damageMult: 1.6 }],
  // NO ranged.aimDelay: think() returns early on ST.ATTACK before recordHistory(), so during the hang the history is
  // frozen and a delayed aim would resolve all three drops to one stale sample. Live aim re-aims on every `aim` frame.
  ai: { attackRange: 30, zTolerance: 12, attackCooldown: [40, 85], tellWarnFrames: 12,
    attacks: [{ anim: 'shove', range: 36, weight: 1 }],
    ranged: { anim: 'ballast', minRange: 90, maxRange: 300, cooldown: 210, zAlign: false, keep: 130 },
    panicRange: 44, panicFrames: 26, retreatBudget: 130, retreatChance: 0.2 },
}, winnowHooks);

// ---------------------------------------------------------------- C3 THRESHER: the shadow. No hitbox in the air; only the landing hurts.
const THR_CARRY = { armR: [20, 26], armL: [-24, 28] };
const THR_AIR = { armR: [-54, 30], armL: [-64, 32], torso: -10, head: 8, legR: [30, -50], legL: [-16, -44], footR: -34, footL: -32, face: 'shout' };
const thresherAnims = Object.assign(makeGleanBase(THR_CARRY, THR_STANCE), {
  // dive: 34f of both bags swelling -> up to y 100 -> 72px of travel with NO hitbox -> pull-down -> the landing shockwave (onLanded) -> 40f punish
  dive: { loop: false, frames: [
    FK(20, { ...THR_CARRY, armR: [34, 44], armL: [-34, 44], torso: 14, head: 12, root: [-2, 2], legR: [18, 16], legL: [-20, 18], face: 'angry', squash: 1.06, stretch: 0.95 },
      { tell: true, sfx: 'grapple', fx: [{ kind: 'dust', x: -10, y: 0, count: 3 }], ease: 'in' }),
    FK(14, { ...THR_CARRY, armR: [46, 34], armL: [-46, 36], torso: 20, head: 14, root: [-4, 3], legR: [26, 26], legL: [-24, 28], face: 'angry', squash: 1.12, stretch: 0.9 },
      { tell: true, fx: [{ kind: 'dust', x: 12, y: 0, count: 3 }], ease: 'out' }),
    FK(10, { ...THR_AIR, armR: [-30, 40], armL: [-38, 42], torso: -18, root: [0, -6], squash: 0.92, stretch: 1.09 },
      { move: { vy: 10 }, sfx: 'steam_vent', fx: [{ kind: 'steam', x: -14, y: 18, count: 5 }], ease: 'out' }),
    FK(6, { ...THR_AIR, root: [2, -2] }, { move: { x: 4.5 }, ease: 'inout' }),
    FK(6, { ...THR_AIR, torso: -4, head: 12, root: [3, 0] }, { move: { x: 4.5 }, ease: 'inout' }),
    FK(4, { ...THR_AIR, torso: 6, head: 14, legR: [42, -30], legL: [-6, -26], root: [4, 2] }, { move: { x: 4.5 }, ease: 'in' }),
    // no smear on the pull-down: a body drop with nothing in the hand, and the arc was a pale crescent over the head
    FK(14, { ...THR_AIR, torso: 24, head: 16, legR: [56, 10], legL: [10, 14], footR: -6, footL: -6, root: [4, 6], squash: 1.04, stretch: 0.96 },
      { move: { vy: -6 }, ease: 'in' }),
    // 3f IMPACT key: the shockwave (16 damage, r46, shake 7) fires from hooks.onLanded, and without this the rig was
    // still 40 frames from its landed pose when the screen shook (ART_STYLE 8: 2-3f hit hold before the follow-through)
    FK(3, { ...THR_CARRY, armR: [6, 54], armL: [-12, 54], torso: 32, head: 18, root: [2, 3], legR: [56, 46], legL: [-34, 48], face: 'shout', squash: 1.22, stretch: 0.82 },
      { punish: true, ease: 'overshoot' }),
    FK(37, { ...THR_CARRY, armR: [16, 46], armL: [-20, 46], torso: 26, head: 16, root: [2, 1], legR: [44, 34], legL: [-30, 36], face: 'grit', squash: 1.12, stretch: 0.9 },
      { punish: true, ease: 'inout' }),
    FK(8, { ...THR_CARRY, torso: -3, head: 6, legR: [14, 6], legL: [-16, 8], footR: -18, footL: -15, root: [0, 0] }, { ease: 'out' }),
  ] },
  // clog: the ground stomp with the iron-shod clogs — slow, front box, walk around it
  clog: { loop: false, frames: [
    FK(13, { ...THR_CARRY, armR: [-40, 40], armL: [-48, 40], torso: -10, head: 0, root: [-3, 1], legR: [30, -50], legL: [-8, 10], footR: -40, face: 'angry' }, { tell: true, sfx: 'grapple', ease: 'in' }),
    FK(9, { ...THR_CARRY, armR: [-56, 44], armL: [-62, 44], torso: -16, head: -4, root: [-5, -1], legR: [42, -70], legL: [-6, 12], footR: -46, face: 'angry', squash: 0.96, stretch: 1.05 }, { tell: true, ease: 'out' }),
    // no smear: this is a FOOT stomp with the iron clogs, not an arm swing — the dust ring and squash 1.14 carry it
    FK(8, { ...THR_CARRY, armR: [30, 40], armL: [24, 42], torso: 22, head: 14, root: [4, 2], legR: [58, 14], legL: [-22, 26], footR: 0, face: 'shout', squash: 1.14, stretch: 0.88 },
      { hitbox: frontBox(54, hit(14, 'heavy', 4, 2, 22)), sfx: 'land_heavy',
        fx: [{ kind: 'dust', x: 44, y: 0, count: 7 }, { kind: 'ring', x: 40, y: 0, r0: 4, r1: 26, flat: true, color: GLEAN.rose }], ease: 'overshoot' }),
    FK(4, { ...THR_CARRY, armR: [34, 40], armL: [28, 42], torso: 24, head: 14, root: [5, 2], legR: [58, 14], legL: [-22, 26], footR: 0, face: 'shout' }, { ease: 'out' }),
    FK(26, { ...THR_CARRY, armR: [24, 36], armL: [18, 38], torso: 16, head: 10, root: [3, 1], legR: [44, 14], legL: [-24, 24], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...THR_CARRY, torso: -3, head: 6, legR: [14, 6], legL: [-16, 8], footR: -18, footL: -15, root: [0, 0] }, { ease: 'out' }),
  ] },
});
/** The shockwave lives in onLanded, never on a frame: it can then never desync from the physics (the anim may end mid-air). */
const thresherHooks = {
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    const a = f.anim;
    if (a.name === 'dive' && a.frameIndex >= 2 && a.frameIndex <= 6) { f.rig.gas = 1; f.rig.swell = 1.12; }
    if (f.y > 20 && !f.dead) {
      if (world.frame % 3 === 0) ventPuff(f, 1, 0.4);
      // the floor read, content-side: fx.js scales the engine shadow's alpha by height, so at the apex it is 0.18 alpha
      // on near-black planks and invisible. A flat rose ring on the deck is the telegraph the design actually promises.
      if (world.frame % 6 === 0) world.addFx('ring', f.x, 0, f.z, { r0: 30, r1: 46, life: 14, flat: true, color: GLEAN.rose });
    }
  },
  onLanded(f, world, from) {
    if (f.dead) return;
    if (f.anim.name !== 'dive') { BASE_HOOKS.onLanded(f, world, from); return; }
    world.areaHit(f.x, f.z, 46, { damage: 16, type: 'knockdown', kbX: 5, kbY: 5, hitstun: 24, friendly: true }, f, { shake: 7, color: GLEAN.rose });
    world.addFx('dust', f.x, 0, f.z, { count: 9 });
    ventPuff(f, 8, 1.6);
    audio.play('land_heavy');
  },
};
const thresher = def({
  variant: 'thresher', name: 'THRESHER', role: 'bruiser', hp: 85, damage: 1, speed: 0.85, score: 400, drops: 'none', lyingFrames: 48,
  build: { ...BASE.build, scale: 1.12, bagShape: 'twin', hood: 'cowl', chalk: CHALK.thresher, hipGear: 'apron', accessories: [BAG_ACC, HIP_ACC] },
  anims: thresherAnims,
  traits: { flinchEvery: 2, weight: 1.5 },
  hurtParts: [{ name: 'body', y: [0, 48] }, { name: 'bags', y: [48, 88], damageMult: 1.6 }],
  ai: { attackRange: 60, zTolerance: 16, attackCooldown: [70, 120], retreatChance: 0.1, tellWarnFrames: 12, maxAttackers: 2,
    punishDamageMult: 1.25, punishGrabbable: true,
    attacks: [{ anim: 'dive', range: 190, minRange: 80, weight: 4, tellFrames: 34 }, { anim: 'clog', range: 54, weight: 2 }] },
}, thresherHooks);

// ---------------------------------------------------------------- C4 SICKLE: the thief. Hooks you, drags you, robs you once, and leaves.
function drawHookLine(ctx, p, sx, sy) {
  const y = sy - p.r, d = p.vx >= 0 ? 1 : -1;
  ctx.strokeStyle = GLEAN.rope; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(sx - d * 14, y + 2); ctx.lineTo(sx, y); ctx.stroke();
  pathPoly(ctx, [sx + d * 6, y, sx - d * 2, y - 5, sx - d * 4, y, sx - d * 2, y + 5]); paint(ctx, GLEAN.zinc, GLEAN_OUTLINE, 1);
  ctx.strokeStyle = GLEAN.zinc; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(sx - d * 2, y + 4, 4, -0.4 * d, 2.6 * d, d < 0); ctx.stroke();
}
/**
 * The theft rides on the projectile, not a hit id: projectileOptsFromSpec forwards a FUNCTION `spec.onHit` as
 * (target, world, projectile, owner) but drops `hit.id`. It robs once per life, and only a purse worth running with.
 *
 * DRAG THEN PIN, and in that order. `status: { netted }` in the spec cannot work here: fighter.hurt applies hit.status
 * BEFORE the knockback branch, and status.js tickStatuses re-zeroes vx/vz on a netted fighter every frame, so the
 * negative kbX (the drag toward the Sickle — the whole point of a hook) was dead data. The hit now lands the drag on
 * its own, and a tiny bookkeeping status lays the net on at age HOOK_NET_DELAY, once the pull has actually moved you.
 */
const HOOK_NET_DELAY = 8;
function hookNetTick(f, s) {
  if (s.age < HOOK_NET_DELAY) return;
  if (!f.dead && f.applyStatus) f.applyStatus('netted', { frames: 45, mashOut: 6 });
  s.timer = 0;   // tickStatuses decrements after onTick, so this clears `hooked` on the same step
}
const HOOKLINE = { style: 'bolt', chained: true, speed: 7, damage: 8, type: 'medium', kbX: -6, kbY: 0, hitstun: 22, maxDist: 240, life: 70,
  offsetX: 20, offsetY: 44, r: 5, pierce: 0, muzzle: false, color: GLEAN.zinc, draw: drawHookLine,
  onHit(t, w, p, owner) {
    if (t.applyStatus && !t.dead) t.applyStatus('hooked', { frames: HOOK_NET_DELAY + 2, onTick: hookNetTick }, owner);
    if (!owner || owner.swag || !t.addMeter || t.meter == null || t.meter < PURSE) return;
    const had = t.meter;
    t.addMeter(-STEAL);
    owner.swag = had - t.meter;
    owner.rig.tally = (owner.rig.tally || 0) + 1;
    floatText(t.x, t.y + t.h + 10, t.z, '-' + owner.swag + ' GLEANED', GLEAN.rose, 1);
    audio.play('pickup_meter');
    owner.fleeOff = true; owner.fleeing = true; owner.entered = false; owner.aiState = 'FLEE';
    owner.fleeDir = -(Math.sign(t.x - owner.x) || owner.facing);
  } };
/**
 * Slate tally-board on the chest: one fresh chalk stroke every time it robs somebody (torso accessory).
 * Chalk on SLATE is light (L* 87 on 30); CHALK.sickle is the mark on the pale silk and is deliberately dark there.
 * The slate itself is UNCHANGED by the readability pass and was measured before it was left alone: at Oklab L* 29.6
 * it clears the outline by 16 and now sits 14 under the lifted coat it hangs on, up from 9 — the palette move did
 * this panel's job for it, so the panel does not move.
 */
const TALLY_CHALK = '#CFD6E2';
function drawTallyBoard(ctx, rig) {
  const p = rig.p, x = R(p.torsoW * 0.05);
  celRect(ctx, rig, x - 5, -R(p.torsoH * 0.62), 11, 13, 2, '#2F2A38', 0.4, 0.2);
  if (rig.override) return;
  ctx.fillStyle = rig.col(TALLY_CHALK);
  for (let i = 0; i < 2 + (rig.tally || 0); i++) ctx.fillRect(x - 3 + (i % 3) * 3, -R(p.torsoH * 0.62) + 3 + ((i / 3) | 0) * 5, 2, 4);
}
const SIC_CARRY = { armR: [14, 20], armL: [-18, 22] };
const sickleAnims = Object.assign(makeGleanBase(SIC_CARRY, SIC_STANCE), {
  // snatch: 26f coil-lift tell (the bag lights) -> the line goes out flat down the lane -> 28f recovery
  snatch: { loop: false, frames: [
    FK(16, { ...SIC_CARRY, armR: [-70, -20], armL: [26, 24], torso: -6, head: 2, root: [-3, 0], legR: [12, 8], legL: [-16, 12], face: 'angry' },
      { tell: true, sfx: 'net', ease: 'in' }),
    FK(10, { ...SIC_CARRY, armR: [-96, -14], armL: [34, 26], torso: -12, head: -2, root: [-5, 1], legR: [10, 8], legL: [-18, 14], face: 'angry', squash: 0.97, stretch: 1.03 },
      { tell: true, ease: 'out' }),
    FK(6, { ...SIC_CARRY, armR: [92, -14], armL: [-40, 18], torso: 24, head: 10, root: [5, 1], legR: [36, 12], legL: [-26, 26], face: 'shout', squash: 1.04, stretch: 0.97 },
      { event: 'spawnProjectile', projectile: HOOKLINE, smear: { from: -110, to: 10, a: 0.45, r: 58 }, sfx: 'grapple', ease: 'overshoot' }),
    FK(3, { ...SIC_CARRY, armR: [98, -12], armL: [-42, 18], torso: 26, head: 10, root: [6, 1], legR: [36, 12], legL: [-26, 26], face: 'shout' }, { ease: 'out' }),
    FK(28, { ...SIC_CARRY, armR: [74, 4], armL: [-30, 14], torso: 16, head: 8, root: [3, 0], legR: [30, 10], legL: [-22, 22], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...SIC_CARRY, torso: -3, head: 6, legR: [14, 6], legL: [-16, 8], footR: -18, footL: -15, root: [0, 0] }, { ease: 'out' }),
  ] },
  // gaff: the close answer with the longest arms in the faction
  gaff: { loop: false, frames: [
    FK(10, { ...SIC_CARRY, armR: [-54, -34], armL: [30, 20], torso: -4, head: 2, root: [-3, 0], legR: [10, 8], legL: [-14, 10], face: 'angry' }, { tell: true, sfx: 'whiff', ease: 'in' }),
    FK(6, { ...SIC_CARRY, armR: [-74, -38], armL: [38, 22], torso: -10, head: 0, root: [-5, 1], legR: [8, 8], legL: [-16, 12], face: 'angry', squash: 0.97, stretch: 1.03 }, { tell: true, ease: 'out' }),
    FK(8, { ...SIC_CARRY, armR: [104, -12], armL: [-38, 16], torso: 28, head: 12, root: [5, 1], legR: [40, 10], legL: [-28, 28], face: 'shout', squash: 1.05, stretch: 0.96 },
      { hitbox: frontBox(52, hit(10, 'medium', 4, 0, 18)), smear: { from: -80, to: 30, a: 0.45, r: 60 },
        fx: [{ kind: 'slash', x: 44, y: 40, radius: 20, angle: 0, sweep: 54 }], sfx: 'whiff', ease: 'overshoot' }),
    FK(3, { ...SIC_CARRY, armR: [110, -10], armL: [-40, 16], torso: 30, head: 12, root: [6, 1], legR: [40, 10], legL: [-28, 28], face: 'shout' }, { ease: 'out' }),
    FK(22, { ...SIC_CARRY, armR: [86, 2], armL: [-30, 14], torso: 20, head: 8, root: [4, 0], legR: [32, 10], legL: [-24, 24], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...SIC_CARRY, torso: -3, head: 6, legR: [14, 6], legL: [-16, 8], footR: -18, footL: -15, root: [0, 0] }, { ease: 'out' }),
  ] },
  // hitch: the chase tax — it has to hoist the bag every 48f of bolting, and the middle of that is punishable at 1.5x.
  // The last key lands on the FLEE carry (arms still up on the lines), not the idle carry: hitch hands straight back to
  // the `flee` loop, so ending on armR +14 / armL -18 whipped both arms 190 deg down and 190 deg back up, twice a hitch
  // (ART_STYLE 10: a 100 deg+ jump between two adjacent non-smear keys is a flail).
  hitch: { loop: false, frames: [
    FK(4, { ...SIC_CARRY, armR: [-150, -24], armL: [-166, -20], torso: 14, head: -6, root: [-2, 1], legR: [26, 24], legL: [-18, 26], face: 'hurt', squash: 1.06, stretch: 0.95 }, { sfx: 'net', ease: 'in' }),
    FK(8, { ...SIC_CARRY, armR: [-176, -10], armL: [-178, -14], torso: -8, head: -12, root: [-4, -1], legR: [16, 10], legL: [-12, 14], face: 'hurt', squash: 0.96, stretch: 1.05 }, { punish: true, ease: 'inout' }),
    FK(4, { ...SIC_CARRY, armR: [-150, -24], armL: [-168, -20], torso: 4, head: -8, root: [0, 0], legR: [22, 20], legL: [-16, 22], face: 'hurt' }, { ease: 'out' }),
  ] },
});
const HITCH_EVERY = 48;
const sickleHooks = {
  onSpawn(f) { f.swag = 0; f.hitchCd = HITCH_EVERY; f.rig.tally = 0; },
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    if (f.dead) return;
    // finishAttack() drops the AI back into APPROACH when the hitch animation ends: re-arm the escape.
    if (f.fleeOff && f.aiState !== 'FLEE' && !f.inHitstun) { f.aiState = 'FLEE'; f.fleeing = true; }
    if (f.aiState !== 'FLEE' || f.state === ST.ATTACK || f.inHitstun) return;
    if (--f.hitchCd <= 0) { f.hitchCd = HITCH_EVERY; f.currentAttack = null; f.setState(ST.ATTACK, 'hitch'); }
  },
};
const sickle = def({
  variant: 'sickle', name: 'SICKLE', role: 'ranged', hp: 60, damage: 1, speed: 1.35, score: 500, drops: 'meter',
  build: { ...BASE.build, scale: 1, bagShape: 'taut', hood: 'brim', chalk: CHALK.sickle, tool: 'hook',
    proportions: { ...GLEAN_PROPS, upperArm: 17, lowerArm: 17, armR: 3.5 },
    accessories: [BAG_ACC, WRIST_ACC, { attach: 'torso', draw: drawTallyBoard }] },
  anims: sickleAnims,
  traits: { weight: 0.9 },
  hurtParts: [{ name: 'body', y: [0, 42] }, { name: 'bag', y: [42, 76], damageMult: 1.6 }],
  // keep 96 > attackRange 46: it kites at 96 and thinkRanged's melee fallback gaffs anything that closes.
  ai: { attackRange: 46, zTolerance: 14, attackCooldown: [40, 80], targetBy: 'lowestHp', evadeChance: 0.3, evadeCooldown: 100,
    retreatChance: 0.25, retreatBudget: 120, tellWarnFrames: 12, punishDamageMult: 1.5,
    attacks: [{ anim: 'gaff', range: 52, weight: 2 }],
    ranged: { anim: 'snatch', minRange: 70, maxRange: 240, cooldown: 210, zAlign: true, keep: 96 } },
}, sickleHooks);

// ---------------------------------------------------------------- C5 HARVESTMAN: the caller. Takes the floor away at the exact moment it doubles the crowd.
const HAR_CARRY = { armR: [18, 24], armL: [-22, 26] };
const HAR_HANG = { armR: [-150, -20], armL: [-40, 40], torso: -6, head: 10, legR: [18, -44], legL: [-14, -38], footR: -32, footL: -30, face: 'shout' };
const harvestmanAnims = Object.assign(makeGleanBase(HAR_CARRY, HAR_STANCE), {
  // haul: 40f of horn and blazing bag -> the winch to the hang line -> 40f hanging while two Chaff fall in -> 34f grabbable
  // landing. The four hang keys are a BREATHING LOOP (root y 0/-2/0/-1, torso -6/-10/-4/-8, head +10/+14/+8/+12, legs
  // swinging 8-12 deg out of phase), not one held pose: this is 40 frames of screen time at the moment the player has to
  // decide to go anti-air, and legR/legL used to be frozen through all of it (ART_STYLE 1: everything moves).
  // callDown keeps the one big arm change so it still punches through the loop.
  haul: { loop: false, frames: [
    FK(24, { ...HAR_CARRY, armR: [-130, -30], armL: [-30, 34], torso: -8, head: -4, root: [-3, 0], legR: [12, 8], legL: [-16, 12], face: 'shout' },
      { tell: true, sfx: 'roar', ease: 'in' }),
    FK(16, { ...HAR_CARRY, armR: [-158, -18], armL: [-38, 38], torso: -14, head: -8, root: [-5, 1], legR: [10, 10], legL: [-18, 14], face: 'shout', squash: 0.96, stretch: 1.05 },
      { tell: true, ease: 'out' }),
    FK(16, { ...HAR_HANG, armR: [-160, -14], torso: -18, root: [0, -4], squash: 0.94, stretch: 1.07 },
      { move: { vy: 8 }, sfx: 'steam_vent', fx: [{ kind: 'steam', x: -10, y: 22, count: 5 }], ease: 'out' }),
    FK(10, { ...HAR_HANG, torso: -6, head: 10, legR: [18, -44], legL: [-14, -38], root: [0, 0] }, { ease: 'inout' }),
    FK(10, { ...HAR_HANG, armR: [-172, -6], armL: [-52, 44], torso: -10, head: 14, legR: [24, -52], legL: [-20, -32], root: [-1, -2] },
      { event: 'callDown', fx: [{ kind: 'ring', x: 0, y: 40, r0: 8, r1: 46, color: GLEAN.rose }], ease: 'out' }),
    FK(10, { ...HAR_HANG, armR: [-150, -16], armL: [-44, 42], torso: -4, head: 8, legR: [14, -38], legL: [-10, -44], root: [1, 0] }, { ease: 'inout' }),
    FK(10, { ...HAR_HANG, armR: [-140, -20], armL: [-36, 38], torso: -8, head: 12, legR: [20, -48], legL: [-16, -36], root: [0, -1] }, { ease: 'inout' }),
    FK(8, { ...HAR_HANG, armR: [-60, 20], armL: [-26, 40], torso: 10, head: 14, legR: [22, -18], legL: [-16, -14], face: 'grit' }, { move: { vy: -6 }, ease: 'in' }),
    FK(34, { ...HAR_CARRY, armR: [22, 40], armL: [-24, 40], torso: 22, head: 14, root: [0, 1], legR: [36, 30], legL: [-26, 32], face: 'grit', squash: 1.1, stretch: 0.91 },
      { punish: true, ease: 'inout' }),
    FK(8, { ...HAR_CARRY, torso: -3, head: 6, legR: [14, 6], legL: [-16, 8], footR: -18, footL: -15, root: [0, 0] }, { ease: 'out' }),
  ] },
  // shear: the ground game — a plain telegraphed two-handed downward hook chop with no armour behind it
  shear: { loop: false, frames: [
    FK(14, { ...HAR_CARRY, armR: [-120, -40], armL: [-112, -38], torso: -14, head: -6, root: [-3, 1], legR: [12, 8], legL: [-16, 12], face: 'angry' }, { tell: true, sfx: 'grapple', ease: 'in' }),
    FK(10, { ...HAR_CARRY, armR: [-166, -20], armL: [-158, -22], torso: -22, head: -12, root: [-5, -1], legR: [10, 10], legL: [-18, 16], face: 'angry', squash: 0.96, stretch: 1.05 }, { tell: true, ease: 'out' }),
    // smear r 44 / a 0.4, not r 66 / a 0.5: at scale 1.3 that was an 86px arc on a 94px rig — the largest shape in the
    // frame. This is a real tool swing (the hook), so it keeps its smear; it just reads as the hook's path now.
    FK(10, { ...HAR_CARRY, armR: [66, 16], armL: [60, 18], torso: 34, head: 16, root: [6, 2], legR: [46, 26], legL: [-32, 34], face: 'shout', squash: 1.1, stretch: 0.92 },
      { hitbox: frontBox(60, hit(14, 'knockdown', 5, 5, 26)), smear: { from: -170, to: 50, a: 0.4, r: 44 },
        fx: [{ kind: 'dust', x: 56, y: 0, count: 6 }, { kind: 'slash', x: 50, y: 30, radius: 24, angle: 20, sweep: 70 }], sfx: 'whiff', ease: 'overshoot' }),
    FK(4, { ...HAR_CARRY, armR: [72, 18], armL: [66, 20], torso: 36, head: 16, root: [6, 2], legR: [46, 26], legL: [-32, 34], face: 'shout' }, { ease: 'out' }),
    FK(30, { ...HAR_CARRY, armR: [56, 24], armL: [50, 26], torso: 26, head: 12, root: [4, 1], legR: [40, 24], legL: [-28, 30], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...HAR_CARRY, torso: -3, head: 6, legR: [14, 6], legL: [-16, 8], footR: -18, footL: -15, root: [0, 0] }, { ease: 'out' }),
  ] },
});
/**
 * The crop comes down from ABOVE, so this is a content-side spawn rather than the built-in `summon` event (Enemy.summon
 * spawns from the screen wings). `fromSky: true` is the exact Enemy-constructor path stage.js already uses for the Iron
 * Warden: y = 170 in the 'fall' state.
 */
const harvestmanHooks = {
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    const a = f.anim;
    if (a.name !== 'haul') return;
    // release the altitude pin ON the sink key (see winnowHooks): re-arming it through key 7 zeroed the `move.vy: -6`
    // impulse twice and the elite touched down ~16 frames into its 34f grabbable recovery instead of at the start.
    if (a.frameIndex >= 3 && a.frameIndex <= 6) f.noGravity = 2;
    else if (a.frameIndex >= 7) f.noGravity = 0;
    if (a.frameIndex >= 2 && a.frameIndex <= 7) { f.rig.gas = 1; f.rig.swell = 1.14; }   // the canopy blazes for the whole hang
  },
  onAnimEvent(f, name, frame, world) {
    if (name !== 'callDown') return false;
    if (!world.spawnEnemy) return true;
    for (let s = -1; s <= 1; s += 2) {
      world.spawnEnemy('gleaning', 'chaff', f.x + s * 44, clamp(f.z + s * 16, world.floorBand.z0, world.floorBand.z1), { entered: true, facing: -s, fromSky: true });
    }
    if (world.camera) world.camera.shake(4, 8);
    particles.burst('steam', f.x, f.y + f.h * 0.8, f.z, 8, { speed: 1.6, up: 1.4, color: GLEAN.rose, sizeJitter: 1.4 });
    audio.play('roar');
    return true;
  },
};
const harvestman = def({
  variant: 'harvestman', name: 'HARVESTMAN', role: 'elite', hp: 150, damage: 1, speed: 0.9, score: 1000, drops: 'food_small',
  elite: true, grabbable: false, grabbableByGrappler: true, lyingFrames: 55,
  build: { ...BASE.build, scale: 1.3, bagShape: 'canopy', hood: 'tall', chalk: CHALK.harvestman, tool: 'horn', hipGear: 'tags', jawFace: true,
    accessories: [BAG_ACC, WRIST_ACC, HIP_ACC] },
  anims: harvestmanAnims,
  traits: { flinchEvery: 2, weight: 1.6 },
  hurtParts: [{ name: 'body', y: [0, 58] }, { name: 'bag', y: [58, 100], damageMult: 1.6 }],
  // ignoresTokens: false EXPLICITLY overrides ROLE_DEFAULTS.elite — two stacked hauls and the sky stops being readable.
  // haul's range 260 raises maxAttackRange and it has no ai.ranged, so thinkApproach fires it from across the arena.
  ai: { attackRange: 56, zTolerance: 16, ignoresTokens: false, hoverCircle: true, attackCooldown: [70, 120], retreatChance: 0.15,
    tellWarnFrames: 14, maxAttackers: 2, punishDamageMult: 1.5, punishGrabbable: true, evadeChance: 0.2, evadeCooldown: 120,
    attacks: [{ anim: 'haul', range: 260, minRange: 0, weight: 3, maxUses: 2, tellFrames: 40 }, { anim: 'shear', range: 60, weight: 4 }] },
}, harvestmanHooks);

// ---------------------------------------------------------------- C6 PICKER (issue #28): the man on the ground. No bladder,
// no hang, nothing to shoot down — and the one Gleaner you can grab AT WILL. He is not the only grabbable one: the Harvestman
// and the Riggerman set `grabbable: false` outright, and Chaff / Winnow / Thresher / Sickle are grabbable by the default but
// spend the fight in the air, where grabs.js refuses them (it rejects any airborne target), so they are only takeable in the
// landing recovery each hover ends on. He is the one who is simply standing there.
/**
 * GROUNDED, and the stance says so before anything else does: heels DOWN (footR -6 / footL -4 against the faction's
 * hanging -18 / -15), knees soft, torso folded over the field he is working. Every other Gleaner stands like a man on
 * a rope; he stands like a man with a sack. The shared idle overrides torso/head per key (the stance only reaches the
 * legs there), so his stoop gets its own 4-key 54f idle below at the shared loop's breathing amplitudes.
 * root y +1 on every ground key: with the knees this bent the soles sit ~1 px above the deck at root 0, and the
 * scale pivot is the feet, so +1 puts the boot line back on the floor (measured with computeJoints, not eyeballed).
 */
const PICK_STANCE = { stance: { torso: 16, head: -8, legR: [22, 12], legL: [-18, 16], footR: -6, footL: -4, root: [0, 1] }, stride: 1.1, bob: 1.1 };
const PICK_CARRY = { armR: [28, 42], armL: [-14, 30] };   // pick hand forward and low over the ground, off hand back by the sack
const PICK_LEGS = { legR: [22, 12], legL: [-18, 16], footR: -6, footL: -4 };
const pickerAnims = Object.assign(makeGleanBase(PICK_CARRY, PICK_STANCE), {
  idle: { loop: true, frames: [
    FK(14, { ...PICK_CARRY, ...PICK_LEGS, torso: 14, head: -6, root: [0, 1] }, { ease: 'inout' }),
    FK(13, { ...PICK_CARRY, ...PICK_LEGS, torso: 20, head: -2, root: [1, 2], legR: [24, 14], armR: [32, 44], armL: [-17, 32], squash: 1.01, stretch: 0.99 }, { ease: 'inout' }),
    FK(14, { ...PICK_CARRY, ...PICK_LEGS, torso: 15, head: -5, root: [0, 1], armR: [26, 41], armL: [-12, 29] }, { ease: 'inout' }),
    FK(13, { ...PICK_CARRY, ...PICK_LEGS, torso: 19, head: -3, root: [-1, 2], legL: [-19, 17], armR: [29, 43], armL: [-15, 31] }, { ease: 'inout' }),
  ] },
  // rake: the low pick rake — a LOW box (jump it): the pick goes out flat and is dragged back across the deck, and it trips
  rake: { loop: false, frames: [
    FK(9, { ...PICK_CARRY, armR: [-36, -20], armL: [20, 28], torso: 10, head: -6, root: [-3, 1], legR: [18, 10], legL: [-16, 14], footR: -6, footL: -4, face: 'angry' }, { tell: true, sfx: 'whiff', ease: 'in' }),
    FK(5, { ...PICK_CARRY, armR: [-54, -26], armL: [26, 30], torso: 6, head: -8, root: [-5, 1], legR: [16, 10], legL: [-18, 16], footR: -6, footL: -4, face: 'angry', squash: 0.98, stretch: 1.02 }, { tell: true, ease: 'out' }),
    FK(5, { ...PICK_CARRY, armR: [86, 38], armL: [-28, 18], torso: 30, head: 4, root: [4, 1], legR: [36, 12], legL: [-26, 26], footR: -2, footL: -2, face: 'shout', squash: 1.05, stretch: 0.96 },
      { hitbox: { ...frontBox(40, hit(5, 'light', 3, 0, 14)), low: true }, smear: { from: -40, to: 85, a: 0.4, r: 38 },
        fx: [{ kind: 'dust', x: 30, y: 0, count: 3 }], sfx: 'whiff', ease: 'overshoot' }),
    FK(3, { ...PICK_CARRY, armR: [92, 40], armL: [-30, 18], torso: 32, head: 4, root: [5, 1], legR: [36, 12], legL: [-26, 26], footR: -2, footL: -2, face: 'shout' }, { ease: 'out' }),
    FK(14, { ...PICK_CARRY, armR: [70, 36], armL: [-22, 20], torso: 24, head: 0, root: [3, 1], legR: [30, 12], legL: [-22, 22], footR: -4, footL: -3, face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...PICK_CARRY, ...PICK_LEGS, torso: 16, head: -8, root: [0, 1] }, { ease: 'out' }),
  ] },
  // sackSwing: the two-hand swing of the field sack. `grip: 1` on the wind-up / hit / hold keys lifts the sack off the
  // hip into the fists (gleaningRig drawWristTool / drawHipGear read it), and the recovery key drops it back. Medium,
  // and it pushes: the one thing a Picker can do to make room.
  sackSwing: { loop: false, frames: [
    FK(12, { ...PICK_CARRY, armR: [-66, -30], armL: [-72, -28], grip: 1, torso: -2, head: -10, root: [-3, 1], legR: [20, 10], legL: [-18, 14], footR: -6, footL: -4, face: 'angry' }, { tell: true, sfx: 'grapple', ease: 'in' }),
    FK(8, { ...PICK_CARRY, armR: [-94, -20], armL: [-100, -22], grip: 1, torso: -8, head: -12, root: [-5, 1], legR: [16, 10], legL: [-20, 16], footR: -6, footL: -4, face: 'angry', squash: 0.97, stretch: 1.03 }, { tell: true, ease: 'out' }),
    FK(6, { ...PICK_CARRY, armR: [68, 22], armL: [62, 24], grip: 1, torso: 26, head: 6, root: [5, 1], legR: [36, 10], legL: [-26, 26], footR: -2, footL: -2, face: 'shout', squash: 1.06, stretch: 0.95 },
      { hitbox: frontBox(46, hit(8, 'medium', 5, 0, 18)), smear: { from: -120, to: 40, a: 0.4, r: 40 },
        fx: [{ kind: 'dust', x: 36, y: 0, count: 4 }], sfx: 'whiff', ease: 'overshoot' }),
    FK(3, { ...PICK_CARRY, armR: [74, 22], armL: [68, 24], grip: 1, torso: 28, head: 6, root: [6, 1], legR: [36, 10], legL: [-26, 26], footR: -2, footL: -2, face: 'shout' }, { ease: 'out' }),
    FK(18, { ...PICK_CARRY, armR: [54, 30], armL: [46, 30], torso: 20, head: 0, root: [4, 1], legR: [30, 10], legL: [-22, 22], footR: -4, footL: -3, face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...PICK_CARRY, ...PICK_LEGS, torso: 16, head: -8, root: [0, 1] }, { ease: 'out' }),
  ] },
});
const picker = def({
  variant: 'picker', name: 'PICKER', role: 'fodder', hp: 30, damage: 1, speed: 1.15, score: 100, drops: 'none', grabbable: true,
  // no BAG_ACC and bagShape 'none': every bag reader steps aside (gleaningRig.js header). No hurtParts either — there is no
  // weak point above his head because there is nothing above his head. His tell is the lens and the breather going rose.
  build: { ...BASE.build, scale: 0.85, bagShape: 'none', hood: 'kerchief', chalk: CHALK.picker, tool: 'pick', hipGear: 'sack', accessories: [WRIST_ACC, HIP_ACC] },
  anims: pickerAnims,
  traits: { weight: 0.8 },
  ai: { attackRange: 40, zTolerance: 12, firstAttackDelay: 30, attackCooldown: [34, 70], maxAttackers: 2, tellWarnFrames: 8,
    attacks: [{ anim: 'rake', range: 40, weight: 3 }, { anim: 'sackSwing', range: 46, minRange: 18, weight: 2 }] },
});

// ---------------------------------------------------------------- C7 RIGGERMAN (issue #28): the net. Rises to the hang line, drops a net on you, and lands next to the man it pinned.
/** Salvage net: rope mesh with three zinc weights, turning as it falls. Pure draw — `p.spin` is advanced by the projectile. */
function drawNet(ctx, p, sx, sy) {
  const r = p.r;
  ctx.save(); ctx.translate(sx, sy - r); ctx.rotate(p.spin);
  ctx.strokeStyle = GLEAN.rope; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();
  for (let k = -1; k <= 1; k++) { ctx.moveTo(k * 6, -r); ctx.lineTo(k * 6, r); ctx.moveTo(-r, k * 6); ctx.lineTo(r, k * 6); }
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094;
    pathRrect(ctx, R(Math.cos(a) * r) - 2, R(Math.sin(a) * r) - 2, 4, 4, 1); paint(ctx, GLEAN.zinc, GLEAN_OUTLINE, 1);
  }
  ctx.restore();
}
/**
 * The net rides the projectile's own `status`, the way the Wrangler's does (sootborn.js netSpec): fighter.hurt applies
 * hit.status on contact and status.js pins the body — 90 frames, six mashes out, or a partner's swing cuts it. No drag
 * (kbX 0), because the point is that you stay exactly where the net found you, which is where he is about to land.
 * A short lob (flight 22 from the hang line at y 64) re-aimed live on the `aim` key, not a straight drop: the hero has
 * had 24 frames of tell and 16 of rise to move, and a net that only lands under his own feet never lands on anyone.
 */
const NET = { style: 'net', kind: 'lob', aimAt: true, flight: 22, gravity: 0.5, bounces: 0, rest: false, offsetX: 0, offsetY: 0,
  r: 10, muzzle: false, color: GLEAN.rope, damage: 4, type: 'medium', kbX: 0, kbY: 0, hitstun: 12, hitSfx: 'net',
  status: { netted: { frames: 90, mashOut: 6 } }, draw: drawNet };
/**
 * Rigger's harness (torso accessory): a broad rope girth under the yoke with a zinc D-ring the lines clip to. Rope on
 * coat and zinc on rope are both material changes, so both take ink (band); one tone mark inside the ring, no more.
 */
function drawHarness(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), y = -R(p.torsoH * 0.42);
  band(ctx, rig, -hw - 1, y, p.torsoW + 2, 5, GLEAN.rope);
  band(ctx, rig, R(hw * 0.2), y - 2, 6, 8, GLEAN.zinc, 2);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, GLEAN.zinc).deep; ctx.fillRect(R(hw * 0.2) + 2, y, 2, 4);
}
// the rigger stands WIDE and low, feet planted a yard apart the way a man does on a moving deck, one hand always up on
// his line: the widest leg spread in the guild under the tallest bag, which is the silhouette delta against the Winnow
// (feet together, stooped) and the Thresher (squat, both hands down) that share his bag height and his bulk.
// root y +3: legs splayed 26 / -28 deg shorten the standing height by cos, and at root 0 the soles hung 3.2-4.2 px
// off the deck on every stance key (measured with computeJoints through geom/pose-audit's own sole math). The scale
// pivot is the feet, so +3 puts the boot line on the floor; every explicit ground key below carries the same offset.
const RIG_STANCE = { stance: { torso: -6, head: 8, legR: [26, 8], legL: [-28, 12], footR: -16, footL: -14, root: [0, 3] }, stride: 0.9, bob: 0.9 };
// gaff hand at the hip with the forearm BENT (lower 66): the gaff hangs 22 px under the fist, and with the arm straight
// down at scale 1.15 its hook sat on the floor line in every rest key (ART_STYLE 0.6, weapon head off the floor).
// The other hand is UP on its line — a rigger never lets go of the rope.
const RIG_CARRY = { armR: [30, 66], armL: [-58, 44] };
const RIG_LEGS = { legR: [26, 8], legL: [-28, 12], footR: -16, footL: -14, root: [0, 3] };
const RIG_HANG = { armR: [-44, 44], armL: [-56, 46], torso: -8, head: 10, legR: [22, -46], legL: [-16, -40], footR: -30, footL: -28, face: 'angry' };
const riggermanAnims = Object.assign(makeGleanBase(RIG_CARRY, { ...RIG_STANCE, grab: true }), {
  // netDrop: 24f harness-hitch tell (both hands haul the lines, knees drop, the bag lights) -> 16f rise to the hang line
  // -> ~29f hang at y 64: aim (re-aimed live) -> reach (the coil comes off the hip: grip 1) -> release (both arms driven
  // down, the net goes, smear) -> hold -> GLIDE 40px toward the man he just netted -> sink -> 32f grabbable landing.
  // The glide is the design's whole point: he lands within grab reach of the pinned hero, not where he took off.
  netDrop: { loop: false, frames: [
    FK(14, { ...RIG_CARRY, armR: [-70, 30], armL: [-80, 32], torso: 8, head: 6, root: [-2, 2], legR: [26, 14], legL: [-26, 16], footR: -12, footL: -10, face: 'angry', squash: 1.04, stretch: 0.97 },
      { tell: true, sfx: 'grapple', ease: 'in' }),
    FK(10, { ...RIG_CARRY, armR: [-100, 20], armL: [-108, 24], torso: 12, head: 8, root: [-3, 3], legR: [30, 20], legL: [-28, 22], footR: -8, footL: -6, face: 'angry', squash: 1.08, stretch: 0.93 },
      { tell: true, ease: 'out' }),
    FK(16, { ...RIG_HANG, armR: [-20, 48], armL: [-30, 50], torso: -14, head: 8, root: [0, -4], squash: 0.94, stretch: 1.07, face: 'grit' },
      { move: { vy: 8 }, sfx: 'steam_vent', fx: [{ kind: 'steam', x: -8, y: 20, count: 4 }], ease: 'out' }),
    FK(8, { ...RIG_HANG, root: [0, 0] }, { event: 'aim', ease: 'inout' }),
    FK(4, { ...RIG_HANG, armR: [36, 60], armL: [28, 62], grip: 1, torso: 12, head: 18, root: [0, 1], legR: [14, -34], legL: [-8, -30] }, { ease: 'in' }),
    FK(4, { ...RIG_HANG, armR: [84, 30], armL: [78, 32], grip: 1, torso: 18, head: 14, root: [1, 2], legR: [12, -30], legL: [-6, -26], face: 'shout' },
      { spawn: { projectile: NET, y: 0 }, smear: { from: -20, to: 90, a: 0.35, r: 36 }, sfx: 'net', ease: 'overshoot' }),
    FK(3, { ...RIG_HANG, armR: [88, 32], armL: [82, 34], grip: 1, torso: 20, head: 14, root: [1, 2], legR: [12, -30], legL: [-6, -26], face: 'shout' }, { ease: 'out' }),
    FK(10, { ...RIG_HANG, armR: [-60, 40], armL: [-70, 42], torso: -2, head: 12, root: [2, -1], legR: [26, -50], legL: [-18, -30] }, { move: { x: 4 }, ease: 'inout' }),
    FK(6, { ...RIG_HANG, armR: [-10, 40], armL: [-18, 42], torso: 8, head: 14, legR: [22, -18], legL: [-14, -14], face: 'grit' }, { move: { vy: -6 }, ease: 'in' }),
    FK(32, { ...RIG_CARRY, armR: [20, 30], armL: [-20, 32], torso: 18, head: 12, root: [0, 2], legR: [36, 28], legL: [-28, 30], footR: -6, footL: -4, face: 'grit', squash: 1.1, stretch: 0.91 },
      { punish: true, ease: 'inout' }),
    FK(6, { ...RIG_CARRY, ...RIG_LEGS, torso: -6, head: 8 }, { ease: 'out' }),
  ] },
  // hook: the ground answer, a one-hand gaff sweep with the line hand still up — the swing that hooks a netted man closer
  hook: { loop: false, frames: [
    FK(10, { ...RIG_CARRY, armR: [-58, -30], armL: [-70, 40], torso: -4, head: 4, root: [-3, 2], legR: [22, 8], legL: [-24, 12], footR: -16, footL: -14, face: 'angry' }, { tell: true, sfx: 'whiff', ease: 'in' }),
    FK(6, { ...RIG_CARRY, armR: [-80, -36], armL: [-76, 42], torso: -10, head: 0, root: [-5, 1], legR: [20, 8], legL: [-26, 14], footR: -16, footL: -14, face: 'angry', squash: 0.97, stretch: 1.03 }, { tell: true, ease: 'out' }),
    FK(7, { ...RIG_CARRY, armR: [100, -8], armL: [-40, 30], torso: 26, head: 12, root: [5, 1], legR: [40, 12], legL: [-30, 28], footR: -8, footL: -6, face: 'shout', squash: 1.05, stretch: 0.96 },
      { hitbox: frontBox(54, hit(10, 'medium', 4, 0, 18)), smear: { from: -80, to: 30, a: 0.45, r: 58 },
        fx: [{ kind: 'slash', x: 46, y: 40, radius: 20, angle: 0, sweep: 54 }], sfx: 'whiff', ease: 'overshoot' }),
    FK(3, { ...RIG_CARRY, armR: [106, -6], armL: [-42, 30], torso: 28, head: 12, root: [6, 1], legR: [40, 12], legL: [-30, 28], footR: -8, footL: -6, face: 'shout' }, { ease: 'out' }),
    FK(22, { ...RIG_CARRY, armR: [84, 6], armL: [-34, 34], torso: 18, head: 8, root: [4, 1], legR: [32, 10], legL: [-26, 24], footR: -10, footL: -8, face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...RIG_CARRY, ...RIG_LEGS, torso: -6, head: 8 }, { ease: 'out' }),
  ] },
});
/**
 * THE NET IS THE SET-UP, THE GRAB IS THE PAY-OFF, and the table says so: while his target is in the net this is the
 * whole attack list (the Drayman's DRAY_MELEE pattern — a frozen module table swapped onto f.ai.attacks, never a
 * mutation of the def's own array, which normalizeAi shares by reference). Measured without it: the drop's recovery
 * ends 36 px from the pinned hero with a 50-100f cooldown and no token, so the core's HOVER rule backs him off to
 * 78-108 px, where only netDrop (>= 64) and hook (<= 58) qualify — he re-netted a netted man, or hooked him from 51
 * px and knocked him further away, and in 900 frames the grab never started. With the table cut to the grab and the
 * cooldown zeroed he walks straight off the landing into it: net lands at t, he lands ~t+30, recovery to ~t+68,
 * grabTell 20f, grab key ~t+92 against a 90f net — and the net he glided in under was re-aimed, so he is inside 46 px
 * more often than not. A hero who mashes out (6 presses) leaves him grabbing air inside his own 10f punish key.
 */
const NET_FOLLOWUP = Object.freeze([{ anim: 'grab', tell: 'grabTell', range: 46, weight: 1 }]);
const riggermanHooks = {
  onSpawn(f) { f.netBaseAttacks = f.ai.attacks; },
  onUpdate(f, world) {
    BASE_HOOKS.onUpdate(f, world);
    const a = f.anim;
    if (a.name === 'netDrop') {
      // hang keys 3..7 pin the altitude; key 8 is the sink and MUST let go (see winnowHooks: re-arming the pin on the
      // sink key zeroes `move.vy: -6` on the step it is applied and eats the front of the grabbable landing)
      if (a.frameIndex >= 3 && a.frameIndex <= 7) f.noGravity = 2;
      else if (a.frameIndex >= 8) f.noGravity = 0;
      if (a.frameIndex >= 2 && a.frameIndex <= 7) { f.rig.gas = 1; f.rig.swell = 1.12; }   // the tell stays lit while he hangs
    }
    const t = f.target, netted = !!(t && t.status && t.status.netted && !t.dead);
    f.ai.attacks = netted ? NET_FOLLOWUP : (f.netBaseAttacks || f.ai.attacks);
    if (netted && f.attackCooldown > 0) f.attackCooldown = 0;
  },
  onLanded(f, world, from) {
    BASE_HOOKS.onLanded(f, world, from);
    if (!f.dead) audio.play('land_heavy');
  },
};
const riggerman = def({
  variant: 'riggerman', name: 'RIGGERMAN', role: 'grabber', hp: 130, damage: 1, speed: 0.9, score: 600, drops: 'meter',
  elite: false, grabbable: false, grabbableByGrappler: true, lyingFrames: 50, grabOffset: 24,
  build: { ...BASE.build, scale: 1.15, bagShape: 'tall', hood: 'rigger', chalk: CHALK.riggerman, tool: 'gaff', hipGear: 'netcoil',
    accessories: [BAG_ACC, WRIST_ACC, HIP_ACC, { attach: 'torso', draw: drawHarness }] },
  anims: riggermanAnims,
  traits: { flinchEvery: 2, weight: 1.4 },
  hurtParts: [{ name: 'body', y: [0, 50] }, { name: 'bag', y: [50, 92], damageMult: 1.6 }],
  moves: { grabHit: { damage: 6, hits: 3 }, throwFwd: { damage: 14, vx: 8, vy: 5 } },
  // ignoresTokens: false overrides ROLE_DEFAULTS.grabber (the Cinder Hulk's choice too): two of these over one hero is
  // two nets, and the faction's maxAttackers 2 is the promise that the sky stays readable. netDrop's range 170 raises
  // maxAttackRange and there is no ai.ranged, so thinkApproach fires it from down the lane and he never kites.
  ai: { attackRange: 48, zTolerance: 14, ignoresTokens: false, attackCooldown: [50, 100], firstAttackDelay: 40, tellWarnFrames: 12,
    punishDamageMult: 1.5, punishGrabbable: true, grabHoldHits: 3, grabHitEvery: 18, flank: false, maxAttackers: 2,
    attacks: [{ anim: 'netDrop', range: 170, minRange: 64, weight: 3 }, { anim: 'grab', tell: 'grabTell', range: 46, weight: 4 }, { anim: 'hook', range: 58, weight: 2 }] },
}, riggermanHooks);

/** The Gleaning, in wave-introduction order (the two issue #28 variants last, so nothing that indexes the first five moves). */
export const GLEANINGS = [chaff, winnow, thresher, sickle, harvestman, picker, riggerman];
