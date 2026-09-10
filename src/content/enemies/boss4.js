// Stage 4 final boss: HARVESTLORD BRIAR OKE, THE GLEANING (docs/STAGE4.md section 4).
// The guild's head, who has not touched the ground during any of the four boards. Three phases, each one taking the
// sky off him:
//   1. THE CANOPY  (400) — four spars of rubberised silk and him hanging under it: re-aimed ballast, a long canopy
//      sweep with the pole gaff, and the HARVEST call that fetches the loft down on you at 66% and 33%.
//   2. THE STOOP   (340) — the canopy is holed and venting. Low, fast, mostly airborne: a diving shoulder, a gaff
//      hook that drags you in, and a VENT every 150 HP that stalls him at 2x while the bag re-pressurises.
//   3. THE GLEANER (240) — no bag at all. A man with a hook and a bag of other people's things: a hook string into a
//      bale-bar crack, and two lobbed salvage weights you can bat back at him for double.
//
// The three phases are three SILHOUETTES (docs/ART_STYLE 0.6 / 11), and each one is smaller than the last:
//   1. WIDE — the canopy is the widest single mass any boss in the game carries, on a spreader bar wider than his
//      shoulders, with the pole gaff crossing the whole body and the tall crown under it.
//   2. TALL — the canopy is gone and a holed bag stands on end behind him like a Winnow's: a narrow column, the
//      hood pulled down, the gaff carried short.
//   3. SMALL — no bag, no spars, no crown: the hood is down on his shoulders, and the only thing he is carrying is
//      a hook and a sack. The palette does the last step — the plum coat gives way to the hemp of his own sleeves.
// Rig, palette, parts, bladder and the six-key strike skeleton come from ./gleaningRig.js; the faction rules
// (SHOT DOWN, the bag weak point, the landing punish) are BASE_HOOKS' and are never overridden — the Harvestlord
// is worth 1.5x in the air like everybody else in his guild, and phase 2 is airborne most of the time.
//
// PALETTE NOTE (tools/art-check.js): both phases carry GLEAN_PAL unchanged, so the two pairs the boss-class baseline
// measures tighter than the enemy one — hair/torso (cowl 36.5 / plum 43.7, d 0.269 against a 0.327 boss baseline) and
// torso/hips (plum / night, d 0.320 against 0.525) — report as warnings here and do not on the five line variants.
// They are left standing rather than fixed: this faction's ladder is the same cloth on a boss as on a Chaff, and the
// separation these two pairs give up is bought back by the accessory that only a boss wears (see below). It is the
// same call midboss3/boss3 record for the Chandlery ladder, which carries exemptions for the same two pairs.
import { frontBox, areaBox } from './common.js';
import {
  GLEAN, GLEAN_OUTLINE, GLEAN_PAL, GLEAN_PROPS, GLEAN_PARTS, CHALK, FK,
  drawBladder, makeGleanBase, BASE_HOOKS, gleanStrike, ventPuff,
} from './gleaningRig.js';
import { celRect, celCapsule, tones, band, rimTop } from '../../art/shading.js';
import { pathRrect, pathPoly, paint } from '../../art/shapes.js';
import { clamp } from '../../engine/math.js';
import { particles } from '../../engine/particles.js';
import { audio } from '../../engine/audio.js';

const R = Math.round;
const hit = (damage, type, kbX, kbY, hitstun, extra) => ({ damage, type, kbX, kbY, hitstun, once: true, ...(extra || {}) });
/** The guild-master's chalk: the Harvestman's crop-green, which is the top of the guild's own ladder. */
const RANK = CHALK.harvestman;
const SPAR = '#4A4E56';

// ---------------------------------------------------------------- the things he owns
/**
 * The spreader bar (phase 1, back accessory in torso space, drawn UNDER the bladder itself): one iron bar wider than
 * his shoulders with the guild's mark across it, hung off two short rope risers.
 *
 * IT IS NOT A SECOND YOKE. `drawBladder` already draws a four-spar rope yoke for `bagShape: 'canopy'` — it is the
 * mark the faction rig calls "the single mark that answers 'blob on a stick'" — and an earlier version of this part
 * drew four more struts radiating off the torso on top of it. Eight spars on one rig read as sticks pushed through a
 * man's shoulders, not as a frame holding a bag up. What the Harvestlord needs from this accessory is the one thing
 * no line variant has: WIDTH at the shoulder line, so phase 1 is the widest silhouette in the game and phases 2 and
 * 3 can each be narrower than the last.
 */
function drawSpreaderBar(ctx, rig) {
  const p = rig.p, hw = R(p.torsoW / 2), y = -R(p.torsoH * 0.92);
  celCapsule(ctx, rig, -hw - 18, y, hw + 18, y - 2, 4, SPAR, 0.3);
  if (rig.override) return;
  band(ctx, rig, -R(p.torsoW * 0.4), y - 3, R(p.torsoW * 0.8), 4, RANK, 1);
  ctx.strokeStyle = rig.col(GLEAN.rope); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of [-1, 1]) { ctx.moveTo((hw + 15) * s, y - 2); ctx.lineTo((hw + 8) * s, y - 12); }
  ctx.stroke();
  ctx.fillStyle = tones(rig, SPAR).deep; ctx.fillRect(-hw - 12, y - 1, R(p.torsoW) + 24, 2);
  rimTop(ctx, rig, -hw - 14, y - 4, hw + 14, y - 6, SPAR);
}
/**
 * The pole gaff: 52px of hemp-wrapped ash with a long IRON hook — the longest reach in the faction, and the reason
 * the head is iron rather than zinc: this weapon spends most of its life crossing the guild's own bladder silk, and
 * `iron` is the one dark metal on this rig for exactly that job. In zinc it was the brightest thing on a boss whose
 * light is supposed to live in the canopy over his head.
 */
function drawPoleGaff(ctx, rig) {
  celRect(ctx, rig, -12, -3, 42, 6, 2, GLEAN.rope, 0.4, 0.2);
  celCapsule(ctx, rig, 30, 0, 46, -11, 4, GLEAN.iron, 0.3);
  celCapsule(ctx, rig, 46, -11, 52, 5, 3, GLEAN.iron, 0.3);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, GLEAN.iron).deep; ctx.fillRect(32, -2, 12, 2);
  band(ctx, rig, 4, -3, 7, 6, GLEAN.sack, 1);
  band(ctx, rig, 20, -3, 5, 6, RANK, 1);
  rimTop(ctx, rig, 34, -7, 48, -13, GLEAN.iron);
}
/** Phase 3 hip: the sack itself, hanging off the belt — everything he still has, and it is other people's. */
function drawClaimSack(ctx, rig) {
  const hw = R(rig.p.hip / 2);
  celRect(ctx, rig, hw - 3, -1, 14, 17, 5, GLEAN.sack, 0.4, 0.26);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, GLEAN.sack).deep; ctx.fillRect(hw - 1, 3, 10, 2);
  band(ctx, rig, hw - 1, 8, 10, 4, RANK, 1);
  ctx.fillStyle = rig.col(GLEAN.zinc); ctx.fillRect(hw + 2, 12, 4, 4);   // somebody's brass, poking out of it
}

// ---------------------------------------------------------------- what he throws
/** Phase 1 ballast: a bag of grit on a rope, aimed at where you are going to be. No fuse, no element — move. */
function drawBallast(ctx, p, sx, sy) {
  const y = sy - p.r;
  pathRrect(ctx, sx - 7, y - 7, 14, 15, 3); paint(ctx, GLEAN.sack, GLEAN_OUTLINE, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(sx - 6, y + 2, 12, 5);
  ctx.fillStyle = GLEAN.rope; ctx.fillRect(sx - 5, y - 8, 10, 3);
}
const BALLAST = { style: 'bomb', kind: 'lob', aimAt: true, flight: 28, gravity: 0.5, bounces: 0, rest: false, offsetX: 0, offsetY: 40,
  r: 7, muzzle: false, color: GLEAN.sack, damage: 13, type: 'knockdown', kbX: 2, kbY: 4, hitstun: 20, friendly: true, hitSfx: 'land_heavy', draw: drawBallast };
/** Phase 3 salvage weight: a lead sash-weight off somebody's window, lobbed underarm and REFLECTABLE for 26 back. */
function drawWeight(ctx, p, sx, sy) {
  const y = sy - p.r;
  pathPoly(ctx, [sx - 5, y - 7, sx + 5, y - 7, sx + 6, y + 7, sx - 6, y + 7]); paint(ctx, GLEAN.zinc, GLEAN_OUTLINE, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(sx - 4, y + 1, 9, 4);
  ctx.fillStyle = GLEAN.rope; ctx.fillRect(sx - 2, y - 9, 4, 3);
}
const WEIGHT = { style: 'stone', kind: 'lob', aimAt: true, flight: 30, gravity: 0.5, bounces: 0, rest: false, offsetX: 10, offsetY: 44, r: 6, muzzle: false,
  color: GLEAN.zinc, damage: 12, type: 'knockdown', kbX: 3, kbY: 4, hitstun: 20, friendly: true,
  reflectable: true, damageOnReflect: 26, reflectSpeed: 7, hitSfx: 'land_heavy', draw: drawWeight };

/**
 * THE CROP GOES UP: on his death every bladder in the loft lets go at once and four boards' worth of stripped iron
 * goes out through the roof. The stage runner's VictorySpectacle owns the camera afterwards; this is the frame it
 * happens on, and it is the last thing the campaign shows you.
 */
function cropGoesUp(f, world) {
  if (!world) return;
  particles.burst('steam', f.x, 40, f.z, 26, { speed: 2.6, up: 4.2, color: GLEAN.rose, sizeJitter: 2 });
  particles.burst('debris', f.x, 30, f.z, 18, { speed: 3, up: 3.6, color: GLEAN.zinc, sizeJitter: 2 });
  world.addFx('ring', f.x, 40, f.z, { r0: 10, r1: 150, color: GLEAN.rose });
  if (world.camera) world.camera.shake(7, 26);
  audio.play('steam_vent');
}

// ---------------------------------------------------------------- builds
const GAFF = { attach: 'handR', length: 52, draw: drawPoleGaff, headAt: 46 };
const BASE_BUILD = {
  palette: GLEAN_PAL, outline: GLEAN_OUTLINE, outlineWidth: 1, proportions: GLEAN_PROPS, parts: GLEAN_PARTS,
  smearColor: GLEAN.iron, hood: 'lord', chalk: RANK, weapon: GAFF,
};
/** Phase 1: the widest mass any boss carries — the spreader bar under the guild's own canopy, over the tall crown. */
const CANOPY_BUILD = { ...BASE_BUILD, scale: 1.45, bagShape: 'canopy',
  accessories: [{ attach: 'back', draw: drawSpreaderBar }, { attach: 'back', draw: drawBladder }] };
/** Phase 2: the spars are gone and what is left stands on end behind him, holed. A narrow column. */
const STOOP_BUILD = { ...BASE_BUILD, scale: 1.3, bagShape: 'tall',
  accessories: [{ attach: 'back', draw: drawBladder }] };
/**
 * Phase 3: no bag, no spars, no crown — the hood is down and the sack on his belt is the whole of him.
 * THE PALETTE IS THE LAST STEP OF THE PHASE CHANGE (docs/ART_STYLE 11): the plum coat is gone and what is under it
 * is a hemp shirt with SLEEVES CUT FROM A DEAD BLADDER, which is both the story of the man and the only way this
 * build clears palette/value-ladder-adjacent — `sleeve` may not equal `primary`, and hemp on hemp is exactly that.
 * Bladder silk is 16 points over the shirt and a whole hue family off it (48 -> 200), and he is the one Gleaner in
 * the game with no bag left to take it from anywhere else.
 */
const GLEANER_BUILD = { ...BASE_BUILD, scale: 1.15, hood: 'rag',
  palette: { ...GLEAN_PAL, primary: GLEAN.sack, sleeve: GLEAN.silk },
  accessories: [{ attach: 'hip', draw: drawClaimSack }] };

// ---------------------------------------------------------------- animations
/** Hanging: he does not stand, he is held up. Knees together and drawn up, weight nowhere. */
const CANOPY_STANCE = { stance: { torso: -12, head: 12, legR: [10, 10], legL: [-12, 12], footR: -26, footL: -22 }, stride: 0.8, bob: 0.7 };
/** Holed: the bag will not hold him, so he is half-crouched over his own feet for the first time in his life. */
const STOOP_STANCE = { stance: { torso: 8, head: 2, legR: [22, 10], legL: [-22, 14], footR: -14, footL: -10 }, stride: 1.15, bob: 1.25 };
/** On the deck: a man in a hood with a hook, standing the way the Sickle stands, because that is what he is now. */
const GLEANER_STANCE = { stance: { torso: 0, head: 6, legR: [26, 0], legL: [-20, 12], footR: -24, footL: -13 }, stride: 1.2, bob: 1 };
// THE CARRY ANGLE IS MEASURED, not eyeballed: geom/rest-carry wants the weapon head at least 6 px off the floor and
// 18 px in front of the hip through every idle and walk key, and the Gleaning walk swings its weapon arm 20 degrees
// back on four of its eight keys. At the -34 these three carries started on, a 52 px pole swept 14 px THROUGH the
// deck on walk #7. Raised to -70 / -60 the same pole rides up over the shoulder with the hook forward, which is how
// anybody actually carries a gaff, and the worst key of the cycle clears by 10-15 px.
const HC = { armR: [16, 28], weapon: -70, armL: [-20, -6] };
const SC = { armR: [22, 24], weapon: -60, armL: [-26, -10] };
const GC = { armR: [26, 22], weapon: -60, armL: [-28, -14] };
const SWEEP_BOX = frontBox(76, hit(16, 'knockdown', 5, 3, 22));
const STOOP_BOX = areaBox(58, hit(18, 'knockdown', 5, 4, 24));
const common = {
  // intro: he comes down the loft's own hang line to head height, looks at the four of you, and does not land
  intro: { loop: false, frames: [
    FK(28, { ...HC, torso: -16, head: 14, root: [0, -3], legR: [10, 12], legL: [-12, 14] }, { sfx: 'steam_vent', ease: 'out' }),
    FK(24, { ...HC, armR: [-56, 60], weapon: -48, armL: [-34, 34], torso: -6, head: -8, root: [-2, -1], legR: [12, 10], legL: [-14, 12], face: 'shout' },
      { sfx: 'roar', ease: 'inout', fx: [{ kind: 'ring', x: 0, y: 44, r0: 6, r1: 50, color: GLEAN.rose }] }),
    FK(22, { ...HC, torso: -14, head: 12, root: [1, -2], legR: [10, 10], legL: [-12, 12], face: 'angry' }, { ease: 'inout' }),
  ] },
  // defeat: the last bag lets go, he comes down on the netting and the loft goes up over him
  defeat: { loop: false, frames: [
    FK(22, { ...GC, torso: -22, head: -20, armR: [-28, 48], weapon: -56, armL: [-64, -40], root: [-4, 0], legR: [22, 8], legL: [-16, 14], face: 'hurt' },
      { sfx: 'prop_break', ease: 'out' }),
    FK(20, { ...GC, torso: 26, head: -4, armR: [40, 38], armL: [22, 32], root: [0, 4], legR: [44, 42], legL: [-30, 46], squash: 1.12, stretch: 0.9, face: 'dazed' },
      { ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }, { kind: 'steam', x: -16, y: 32, count: 6 }] }),
    FK(70, { armR: [-24, -8], weapon: -14, armL: [28, 18], torso: 2, head: -10, legR: [12, 10], legL: [-4, 8], footR: 0, footL: 0, root: [16, -4, -88], face: 'dazed' }, { ease: 'out' }),
  ] },
};
const canopyAnims = Object.assign(makeGleanBase(HC, CANOPY_STANCE), common, {
  // phase change: the spars snap, the canopy goes off the top of the screen and he drops onto his own feet
  phaseChange: { loop: false, frames: [
    FK(16, { ...HC, torso: -22, head: -16, armR: [-38, 24], armL: [-60, -24], root: [-4, -2], legR: [14, 12], legL: [-16, 14], face: 'hurt' }, { sfx: 'prop_break', ease: 'out' }),
    FK(14, { ...HC, torso: 22, head: 8, root: [2, 3], legR: [36, 44], legL: [-26, 44], squash: 1.14, stretch: 0.88, face: 'grit' },
      { ease: 'in', fx: [{ kind: 'debris', x: -12, y: 52, count: 10 }, { kind: 'steam', x: -8, y: 40, count: 7 }, { kind: 'dust', x: 0, y: 0, count: 8 }] }),
    FK(14, { ...SC, torso: 6, head: 2, root: [0, 0], legR: [20, 10], legL: [-20, 12], face: 'angry' }, { ease: 'out' }),
  ] },
  // sweep: the pole gaff goes round the whole arena at chest height. 76px of reach — duck it or be somewhere else.
  sweep: gleanStrike({
    tell: 26, active: 10, recovery: 30, carry: HC, stance: CANOPY_STANCE.stance, tellSfx: 'grapple', sfx: 'whiff',
    hitbox: SWEEP_BOX, smear: { from: -110, to: 60, a: 0.44, r: 78 },
    fx: [{ kind: 'slash', x: 62, y: 44, radius: 34, angle: 10, sweep: 120 }],
    w1: { ...HC, armR: [-74, -34], weapon: 28, armL: [-34, 26], torso: -22, head: -6, root: [-4, -1], legR: [10, 12], legL: [-14, 14], face: 'angry' },
    w2: { ...HC, armR: [-128, -20], weapon: 12, armL: [-44, 32], torso: -30, head: -14, root: [-7, -2], legR: [8, 12], legL: [-16, 16], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { ...HC, armR: [46, 6], weapon: -18, armL: [-30, 20], torso: 26, head: 8, root: [7, 1], legR: [34, 18], legL: [-28, 26], face: 'shout', squash: 1.06, stretch: 0.95 },
    hold: { ...HC, armR: [50, 8], weapon: -14, armL: [-32, 20], torso: 28, head: 8, root: [7, 1], legR: [34, 18], legL: [-28, 26], face: 'shout' },
    r: { ...HC, armR: [40, 18], weapon: -26, armL: [-24, 16], torso: 10, head: 4, root: [4, 0], legR: [24, 14], legL: [-22, 20], face: 'grit' },
  }),
  // ballast: he cuts a bag off the yoke and drops it where you are GOING to be (aimAt). The counterplay is your feet.
  ballast: gleanStrike({
    tell: 24, active: 6, recovery: 26, carry: HC, stance: CANOPY_STANCE.stance, tellSfx: 'sling', sfx: 'throw',
    aimEvent: 'aim', event: 'spawnProjectile', projectile: BALLAST, smear: { from: 20, to: 56, a: 0.28, r: 46 },
    w1: { ...HC, armR: [20, 46], weapon: 18, armL: [-80, -8], torso: -14, head: -4, root: [-5, -1], legR: [8, 12], legL: [-18, 18], face: 'angry' },
    w2: { ...HC, armR: [24, 52], weapon: 22, armL: [-124, -20], torso: -22, head: -12, root: [-8, 0], legR: [6, 14], legL: [-24, 22], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...HC, armR: [18, 42], weapon: 12, armL: [66, -18], torso: 8, head: 8, root: [4, 0], legR: [24, 10], legL: [-18, 18], face: 'shout', squash: 1.04, stretch: 0.96 },
    hold: { ...HC, armR: [18, 40], weapon: 10, armL: [76, -12], torso: 10, head: 8, root: [5, 0], legR: [24, 10], legL: [-18, 18], face: 'shout' },
    r: { ...HC, armR: [22, 38], weapon: 6, armL: [46, 8], torso: 2, head: 4, root: [3, 0], legR: [18, 10], legL: [-16, 16], face: 'grit' },
  }),
  // HARVEST: 40 frames of horn and blazing canopy while the loft comes down on the wings of the arena.
  harvest: gleanStrike({
    tell: 40, active: 8, recovery: 34, carry: HC, stance: CANOPY_STANCE.stance, tellSfx: 'roar', sfx: 'steam_vent',
    event: 'harvest', fx: [{ kind: 'ring', x: 0, y: 46, r0: 8, r1: 66, color: GLEAN.rose }, { kind: 'steam', x: 6, y: 40, count: 6 }],
    recoverFx: [{ kind: 'steam', x: -8, y: 36, count: 3 }],
    w1: { ...HC, armR: [-126, -30], weapon: 26, armL: [-30, 34], torso: -20, head: -6, root: [-3, -2], legR: [12, 10], legL: [-16, 12], face: 'shout' },
    w2: { ...HC, armR: [-162, -16], weapon: 8, armL: [-40, 40], torso: -28, head: -10, root: [-5, -3], legR: [10, 12], legL: [-18, 14], squash: 0.96, stretch: 1.05, face: 'shout' },
    h: { ...HC, armR: [-176, -6], weapon: 2, armL: [-54, 46], torso: -22, head: 14, root: [-1, -4], legR: [16, 14], legL: [-20, 16], face: 'shout', squash: 0.94, stretch: 1.06 },
    hold: { ...HC, armR: [-172, -8], weapon: 4, armL: [-50, 44], torso: -18, head: 12, root: [0, -3], legR: [16, 14], legL: [-20, 16], face: 'shout' },
    r: { ...HC, armR: [-44, 30], weapon: -20, armL: [-24, 32], torso: -6, head: 8, root: [1, -1], legR: [18, 12], legL: [-18, 14], face: 'grit' },
  }),
});
const stoopAnims = Object.assign(makeGleanBase(SC, STOOP_STANCE), common, {
  phaseChange: canopyAnims.phaseChange,
  // stoop: the dive. He goes up on what is left of the bag and comes down on you shoulder first, and he is worth
  // 1.5x for every frame of it — this phase is where the board's own rule finally lands on the man who wrote it.
  stoop: gleanStrike({
    tell: 26, active: 10, recovery: 32, carry: SC, stance: STOOP_STANCE.stance, tellSfx: 'steam_vent', sfx: 'land_heavy',
    hitbox: STOOP_BOX, move: { x: 7, vy: 7 }, smear: { from: -30, to: 44, a: 0.32, r: 60 },
    fx: [{ kind: 'ring', x: 0, y: 22, r0: 6, r1: 66, flat: true, color: GLEAN.rose }, { kind: 'steam', x: -12, y: 28, count: 6 }],
    recoverFx: [{ kind: 'dust', x: 0, y: 0, count: 6 }],
    w1: { ...SC, armR: [-26, 52], weapon: -38, armL: [-38, 24], torso: 16, head: 8, root: [-2, 3], legR: [26, 30], legL: [-18, 32], face: 'angry' },
    w2: { ...SC, armR: [-42, 66], weapon: -52, armL: [-54, 36], torso: 24, head: 12, root: [-4, 5], legR: [32, 44], legL: [-22, 46], squash: 1.12, stretch: 0.89, face: 'shout' },
    h: { ...SC, armR: [-70, -24], weapon: -20, armL: [-84, -20], torso: -26, head: -14, root: [4, -8], legR: [46, 10], legL: [26, 16], face: 'shout', squash: 0.93, stretch: 1.08 },
    hold: { ...SC, armR: [-64, -22], weapon: -18, armL: [-78, -18], torso: -22, head: -12, root: [5, -6], legR: [48, 12], legL: [28, 18], face: 'shout' },
    r: { ...SC, armR: [16, 30], weapon: -16, armL: [-14, 22], torso: 26, head: 10, root: [3, 3], legR: [44, 36], legL: [-30, 38], squash: 1.12, stretch: 0.9, face: 'grit' },
  }),
  // drag: the gaff goes out, hooks and PULLS. It is the only thing on the board that moves you toward a Gleaner.
  drag: gleanStrike({
    tell: 20, active: 8, recovery: 26, carry: SC, stance: STOOP_STANCE.stance, tellSfx: 'grapple', sfx: 'grapple',
    hitbox: frontBox(66, hit(12, 'medium', -6, 0, 22)), smear: { from: 60, to: -30, a: 0.4, r: 62 },
    fx: [{ kind: 'slash', x: 54, y: 44, radius: 26, angle: -20, sweep: 80 }],
    w1: { ...SC, armR: [-40, 58], weapon: -30, armL: [-30, 22], torso: 10, head: 2, root: [-3, 1], legR: [20, 12], legL: [-22, 16], face: 'angry' },
    w2: { ...SC, armR: [-58, 72], weapon: -44, armL: [-40, 28], torso: 16, head: 4, root: [-6, 2], legR: [18, 14], legL: [-26, 20], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...SC, armR: [86, -10], weapon: 14, armL: [-36, 16], torso: -14, head: -4, root: [6, 0], legR: [38, 12], legL: [-28, 26], face: 'shout', squash: 1.04, stretch: 0.96 },
    hold: { ...SC, armR: [78, -6], weapon: 10, armL: [-34, 16], torso: -8, head: -2, root: [4, 0], legR: [36, 12], legL: [-26, 24], face: 'shout' },
    r: { ...SC, armR: [44, 14], weapon: -10, armL: [-26, 14], torso: 12, head: 4, root: [2, 1], legR: [26, 12], legL: [-22, 20], face: 'grit' },
  }),
  ballast: canopyAnims.ballast,
});
const gleanerAnims = Object.assign(makeGleanBase(GC, GLEANER_STANCE), common, {
  phaseChange: canopyAnims.phaseChange,
  // hook: the string, fast and short, and it chains into the crack
  hook: gleanStrike({
    tell: 12, active: 6, recovery: 16, carry: GC, stance: GLEANER_STANCE.stance, tellSfx: 'whiff', sfx: 'rapier',
    hitbox: frontBox(56, hit(10, 'light', 4, 0, 14)), move: { x: 3 }, smear: { from: -26, to: 30, a: 0.36, r: 54 },
    fx: [{ kind: 'slash', x: 46, y: 44, radius: 18, angle: 10, sweep: 46 }],
    w1: { ...GC, armR: [-30, 60], weapon: -58, armL: [-38, -46], torso: -8, head: 0, root: [-3, 0], legR: [16, 8], legL: [-18, 10], face: 'angry' },
    w2: { ...GC, armR: [-42, 70], weapon: -72, armL: [-44, -44], torso: -14, head: -2, root: [-5, 0], legR: [14, 8], legL: [-20, 12], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...GC, armR: [88, -4], weapon: 14, armL: [-38, -6], torso: 20, head: 4, root: [6, 0], legR: [40, 8], legL: [-30, 26], face: 'shout', squash: 1.03, stretch: 0.97 },
    hold: { ...GC, armR: [92, -6], weapon: 16, armL: [-40, -6], torso: 22, head: 4, root: [7, 0], legR: [40, 8], legL: [-30, 26], face: 'shout' },
    r: { ...GC, armR: [64, 10], weapon: -14, armL: [-32, -42], torso: 8, head: 2, root: [4, 1], legR: [28, 8], legL: [-22, 20], face: 'grit' },
  }),
  // crack: the bale bar, two-handed, straight down. The only thing he owns that weighs anything.
  crack: gleanStrike({
    tell: 22, active: 9, recovery: 28, carry: GC, stance: GLEANER_STANCE.stance, tellSfx: 'hammer_swing', sfx: 'hammer_slam',
    hitbox: frontBox(58, hit(16, 'knockdown', 4, 4, 24)), smear: { from: -150, to: 46, a: 0.42, r: 58 },
    fx: [{ kind: 'dust', x: 50, y: 0, count: 6 }, { kind: 'ring', x: 50, y: 0, r0: 4, r1: 30, flat: true, color: GLEAN.sack }],
    w1: { ...GC, armR: [-70, -32], weapon: 24, armL: [-82, -26], torso: -12, head: -8, root: [-3, 0], legR: [14, 6], legL: [-18, 12], face: 'angry' },
    w2: { ...GC, armR: [-124, -22], weapon: 10, armL: [-132, -18], torso: -22, head: -16, root: [-6, -1], legR: [12, 6], legL: [-20, 14], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { ...GC, armR: [20, -6], weapon: -24, armL: [26, -4], torso: 32, head: 10, root: [6, 3], legR: [44, 26], legL: [-32, 34], face: 'shout', squash: 1.08, stretch: 0.93 },
    hold: { ...GC, armR: [22, -4], weapon: -22, armL: [28, -2], torso: 34, head: 10, root: [6, 3], legR: [44, 26], legL: [-32, 34], face: 'shout' },
    r: { ...GC, armR: [30, 8], weapon: -30, armL: [8, -20], torso: 22, head: 4, root: [4, 2], legR: [34, 20], legL: [-26, 28], face: 'grit' },
  }),
  // weights: he lobs somebody's window weights underarm, and they come back for 26 if you send one home
  weight: gleanStrike({
    tell: 24, active: 6, recovery: 28, carry: GC, stance: GLEANER_STANCE.stance, tellSfx: 'sling', sfx: 'throw',
    aimEvent: 'aim', event: 'spawnProjectile', projectile: WEIGHT, smear: { from: 20, to: 52, a: 0.28, r: 46 },
    w1: { ...GC, armR: [22, 46], weapon: 20, armL: [-84, -10], torso: -6, head: -6, root: [-6, 0], legR: [4, 10], legL: [-22, 20], face: 'angry' },
    w2: { ...GC, armR: [26, 52], weapon: 24, armL: [-126, -22], torso: -16, head: -14, root: [-9, 1], legR: [2, 12], legL: [-28, 24], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...GC, armR: [20, 42], weapon: 14, armL: [68, -20], torso: 14, head: 6, root: [5, 1], legR: [28, 8], legL: [-20, 18], face: 'shout', squash: 1.04, stretch: 0.96 },
    hold: { ...GC, armR: [20, 40], weapon: 12, armL: [78, -14], torso: 16, head: 6, root: [6, 1], legR: [28, 8], legL: [-20, 18], face: 'shout' },
    r: { ...GC, armR: [24, 38], weapon: 8, armL: [48, 6], torso: 10, head: 2, root: [4, 1], legR: [22, 8], legL: [-18, 16], face: 'grit' },
  }),
});

/** Harvestlord Briar Oke, the Gleaning — the Stage 4 final boss, and the last fight in the campaign. */
export const boss4 = {
  id: 'boss4', type: 'boss4', variant: 'oke', name: 'HARVESTLORD BRIAR OKE', subtitle: 'THE GLEANING',
  role: 'boss', bossKind: 'boss', boss: true, music: 'cropboss',
  build: CANOPY_BUILD, anims: canopyAnims, score: 16000, drops: ['food_big', 'meter', 'score_big'],
  grabbable: false, throwDamageMult: 1, sfx: { hurt: 'hydraulic', death: 'steam_vent' },
  traits: { flinchEvery: 2, weight: 1.4 },
  /** The bag is the weak point on every rig in this guild, and the man who owns the guild is no exception. */
  hurtParts: [{ name: 'body', y: [0, 64] }, { name: 'bag', y: [64, 116], damageMult: 1.6 }],
  hooks: {
    // the faction contract first (the two tell channels, SHOT DOWN, the landing vent), then the four things of his
    ...BASE_HOOKS,
    /**
     * Art state: the holed bag stands open for exactly as long as the vent window does, and both tell channels are
     * held across every airborne key — enemy.js clears rig.tell the moment a wind-up ends, which on this faction is
     * precisely when the attacker leaves the ground.
     */
    onUpdate(f, world) {
      BASE_HOOKS.onUpdate(f, world);
      f.rig.venting = f.ventTimer > 0;
      const a = f.anim;
      if ((a.name === 'stoop' || a.name === 'harvest') && a.frameIndex >= 2 && a.frameIndex <= 4) { f.rig.gas = 1; f.rig.swell = 1.16; }
      if (f.ventTimer > 0 && (world.frame & 7) === 0) ventPuff(f, 2, 1.6);
    },
    onAnimEvent(f, name, frame, world) {
      if (name !== 'harvest') return false;
      if (!world.spawnEnemy) return true;
      // the crop comes down from ABOVE (fromSky), which is the only way anything arrives in this loft
      const kinds = ['chaff', 'winnow'];
      for (let s = -1; s <= 1; s += 2) {
        world.spawnEnemy('gleaning', kinds[(s + 1) >> 1], f.x + s * 58, clamp(f.z + s * 20, world.floorBand.z0, world.floorBand.z1), { entered: true, facing: -s, fromSky: true });
      }
      if (world.camera) world.camera.shake(5, 10);
      particles.burst('steam', f.x, R(f.h * 0.8), f.z, 10, { speed: 1.8, up: 2, color: GLEAN.rose, sizeJitter: 1.4 });
      audio.play('roar');
      return true;
    },
    onPhase(f, i, world) {
      if (!world) return;
      ventPuff(f, 12, 2.4);
      particles.burst('debris', f.x, f.h * 0.6, f.z, 12, { speed: 3, up: 2.4, color: SPAR, sizeJitter: 2 });
      if (i === 2) world.addFx('ring', f.x, 36, f.z, { r0: 8, r1: 96, color: GLEAN.rose });
    },
    /** THE CROP GOES UP: the whole loft leaves with him. */
    onDeath(f, world) { BASE_HOOKS.onDeath(f, world); cropGoesUp(f, world); },
  },
  ai: { attackRange: 62, zTolerance: 18, attackCooldown: [44, 82], firstAttackDelay: 44, ignoresTokens: true, retreatChance: 0, tellWarnFrames: 14, punishGrabbable: true },
  phases: [
    { name: 'THE CANOPY', hp: 400, color: GLEAN.silk, armor: false, unlaunchable: true, walkSpeed: 1.4,
      summonAt: [0.66, 0.33], summon: [{ type: 'gleaning', variant: 'chaff' }, { type: 'gleaning', variant: 'chaff' }],
      ai: { attacks: [{ anim: 'sweep', range: 82, weight: 4 }, { anim: 'ballast', range: 300, minRange: 80, weight: 3 },
        { anim: 'harvest', range: 300, minRange: 0, weight: 2, maxUses: 3, tellFrames: 40 }] } },
    { name: 'THE STOOP', hp: 340, color: GLEAN.rose, armor: false, unlaunchable: false, walkSpeed: 2.2,
      build: STOOP_BUILD, anims: stoopAnims, bandShrink: 16,
      hurtParts: [{ name: 'body', y: [0, 58] }, { name: 'bag', y: [58, 104], damageMult: 1.6 }],
      // the bag blows its relief every 150 HP: he stops attacking and takes double damage until it re-pressurises
      vent: { everyHp: 150, frames: 110, flag: 'venting', damageMult: 2, grabbable: true, stall: true, text: 'BAG VENTING!' },
      ai: { attackCooldown: [38, 72],
        attacks: [{ anim: 'stoop', range: 170, minRange: 40, weight: 4, tellFrames: 26 }, { anim: 'drag', range: 72, weight: 3 },
          { anim: 'ballast', range: 300, minRange: 90, weight: 2 }] } },
    { name: 'THE GLEANER', hp: 240, color: GLEAN.sack, armor: false, unlaunchable: false, grabbable: true, walkSpeed: 2.5,
      build: GLEANER_BUILD, anims: gleanerAnims, hurtParts: null,
      ai: { attackRange: 54, zTolerance: 14, attackCooldown: [26, 56], evadeChance: 0.4, evadeCooldown: 90,
        attacks: [{ anim: 'hook', range: 60, weight: 5, chain: 'crack' }, { anim: 'crack', range: 58, weight: 2 },
          { anim: 'weight', range: 300, minRange: 90, weight: 3 }] } },
  ],
};
