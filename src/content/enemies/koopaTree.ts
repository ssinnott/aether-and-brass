// THE LIVING TREE: what the Mega King's machine grows (koopaMega.ts). A tree pulls itself up out of the floor — roots
// for legs, a trunk for a body, branches for arms, a crown of leaves over a face in the bark — and goes after the
// heroes. Its swings hit EVERYTHING, kings included (`friendly`), which is why the Mega King makes every king switch
// on TREE MODE before he grows them (koopaTrio.ts): a king with tree mode on is one the trees cannot hurt. Trees never
// hurt each other. Fire burns them half again as hard.
// Not a board enemy on its own: it only ever arrives by the Mega Destroyer's GROW, so it is registered for spawning
// ('tree' / 'living') and kept out of the bestiary list with the kings.
import { frontBox, areaBox } from './common.ts';
import { makeKoopaBase, koopaStrike, FK } from './koopaRig.ts';
import { drawMound } from './koopaKit.ts';
import { celPoly, celTaper, celBall, tones, band, rimTop } from '../../lib/art/shading.ts';
import { drawFist } from '../../lib/art/rigParts.ts';
import { FACE } from '../../lib/art/poses.ts';

const R = Math.round;
const hit = (damage: number, type: HitType, kbX: number, kbY: number, hitstun: number, extra?: Partial<Hitbox>): Partial<Hitbox> =>
  ({ damage, type, kbX, kbY, hitstun, once: true, friendly: true, ...(extra || {}) });

export const TREE = {
  bark: '#6A4A30', barkLt: '#7E5C3A', barkDk: '#4E3A24', sleeve: '#3E2C1A', leaf: '#5E9A3A', leafLt: '#86B04A',
  knot: '#2E2014', eye: '#E8F070', root: '#443220', pebble: '#9A9A90',
};

// ---------------------------------------------------------------- parts
/** The crown (head hook): a face-shaped block of bark with a heap of leaves piled over and behind it. */
function treeHead(ctx, rig, pose, inf) {
  const r = inf.r, leaf = inf.pal.hair;
  // a bushy crown: four clumps of leaves, back ones first
  for (const [x, y, k] of [[-1.0, -1.0, 0.85], [1.05, -0.95, 0.8], [0.05, -1.75, 1.0], [-0.55, -1.55, 0.8], [0.7, -1.55, 0.8]]) celBall(ctx, rig, R(x * r), R(y * r), R(k * r), leaf, true);
  celPoly(ctx, rig, [R(-0.8 * r), R(-0.8 * r), R(0.9 * r), R(-0.8 * r), R(1.0 * r), R(0.7 * r), R(0.5 * r), R(1.0 * r), R(-0.7 * r), R(0.9 * r)], inf.pal.skin, 0.34, 0.28);
  if (rig.override) return;
  const t = tones(rig, leaf);
  ctx.fillStyle = t.sh; ctx.fillRect(R(-1.2 * r), R(-0.9 * r), 4, 2); ctx.fillRect(R(0.6 * r), R(-1.4 * r), 3, 2);
  ctx.fillStyle = rig.col(inf.pal.accent); ctx.fillRect(R(-0.3 * r), R(-2.3 * r), 3, 2); ctx.fillRect(R(0.9 * r), R(-1.4 * r), 2, 2); ctx.fillRect(R(-1.2 * r), R(-1.4 * r), 2, 2);
}
/** The face in the bark: two lit hollows and a knot-hole mouth that gapes on `shout`. */
function treeFace(ctx, rig, pose, inf) {
  if (rig.override) return;
  const r = inf.r, face = pose.face | 0, deep = tones(rig, inf.pal.skin).deep;
  const ey = R(-0.2 * r);
  ctx.fillStyle = rig.col(TREE.knot); ctx.fillRect(R(0.2 * r), ey - 1, 5, 4); ctx.fillRect(R(-0.5 * r), ey - 1, 3, 4);
  if (face !== FACE.closed && face !== FACE.dazed) {
    ctx.fillStyle = rig.col(rig.tell ? '#FFFFFF' : inf.pal.glow); ctx.fillRect(R(0.2 * r) + 2, ey, 2, 2); ctx.fillRect(R(-0.5 * r) + 1, ey, 1, 2);
  }
  const open = face === FACE.shout ? 4 : face === FACE.angry || face === FACE.grit ? 2 : 1;
  ctx.fillStyle = rig.col(TREE.knot); ctx.fillRect(R(0.05 * r), R(0.45 * r), 6, open);
  ctx.fillStyle = deep; ctx.fillRect(R(-0.6 * r), R(-0.6 * r), R(1.3 * r), 1);   // the brow of the bark
}
/** The trunk (torso hook): tapered bark with grain running up it and one knot. */
function treeTrunk(ctx, rig, pose, inf) {
  const W = inf.w, H = inf.h, hw = R(W / 2);
  celPoly(ctx, rig, [-hw + 3, -H, hw - 3, -H, hw, R(-H * 0.5), hw + 2, 3, -hw - 2, 3, -hw, R(-H * 0.5)], inf.pal.primary, 0.34, 0.28);
  if (rig.override) return;
  const t = tones(rig, inf.pal.primary);
  ctx.fillStyle = t.deep;
  for (const x of [-0.5, -0.1, 0.35]) ctx.fillRect(R(x * hw), R(-H * 0.9), 1, R(H * 0.8));
  band(ctx, rig, R(hw * 0.1), R(-H * 0.55), 5, 4, TREE.knot, 2);
  rimTop(ctx, rig, -hw + 4, -H + 1, hw - 4, -H + 1, inf.pal.primary);
}
/** Root flare over the hips (hips hook). */
function treeHips(ctx, rig, pose, inf) {
  const hw = R(inf.w / 2);
  celPoly(ctx, rig, [-hw, -5, hw, -5, hw + 3, 5, R(hw * 0.3), 3, 0, 7, R(-hw * 0.3), 3, -hw - 3, 5], inf.pal.secondary, 0.36, 0.2);
}
/** A hand of three twigs (hand hook). */
function treeHand(ctx, rig, pose, inf) {
  const r = inf.r;
  drawFist(ctx, rig, r * 0.8, inf.pal.skin);
  for (const cy of [-0.8, 0, 0.8]) celTaper(ctx, rig, R(r * 0.8), R(r * cy), R(r * 2.4), R(r * cy * 1.6), 2, 1, inf.pal.skin);
}
/** A clump of roots for a foot (foot hook). */
function treeFoot(ctx, rig, pose, inf) {
  const heel = R(inf.w * 0.42), toe = R(inf.w * 0.62), top = -R(inf.h), sole = R(inf.h * 0.5);
  celPoly(ctx, rig, [-heel, top, R(heel * 0.6), top, toe + 2, sole - 1, toe + 4, sole, -heel - 3, sole], inf.pal.secondary, 0.34, 0.25);
  if (rig.override) return;
  ctx.fillStyle = tones(rig, inf.pal.secondary).deep; ctx.fillRect(-heel, sole - 1, toe + heel, 2);
}
const TREE_PARTS = { head: treeHead, face: treeFace, torso: treeTrunk, hips: treeHips, hand: treeHand, foot: treeFoot };

const TREE_PAL = { skin: TREE.barkLt, hair: TREE.leaf, primary: TREE.bark, sleeve: TREE.sleeve, secondary: TREE.barkDk,
  accent: TREE.leafLt, metal: TREE.pebble, dark: TREE.root, glow: TREE.eye };
const TREE_BUILD = {
  palette: TREE_PAL, outline: '#140E08', outlineWidth: 1, scale: 1.35, parts: TREE_PARTS,
  proportions: { headR: 10, neck: 2, neckR: 5, torsoW: 20, torsoH: 30, hip: 20, upperArm: 15, lowerArm: 14, armR: 4.5, handR: 4.5,
    upperLeg: 11, lowerLeg: 10, legR: 6, footL: 13, footH: 5, shoulderX: 3, hipX: 5, bulge: 0.4 },
};

// ---------------------------------------------------------------- animations
const TC = { armR: [10, 30], armL: [-16, 30] };
const LEGS = { legR: [18, 6], legL: [-16, 8] };
const treeAnims = Object.assign(makeKoopaBase(TC), {
  // sprout: it pulls itself up out of the floor (the drawBefore clip hides whatever is still under the boards)
  sprout: { loop: false, frames: [
    FK(18, { ...TC, legR: [40, 60], legL: [-20, 60], armR: [-150, -10], armL: [-160, -10], torso: 10, head: -10, root: [0, 110], face: 'closed' },
      { invuln: true, sfx: 'land_heavy', ease: 'out', fx: [{ kind: 'dust', x: 0, y: 0, count: 10 }] }),
    FK(16, { ...TC, legR: [30, 30], legL: [-16, 30], armR: [-160, -20], armL: [-170, -20], torso: -6, head: -16, root: [0, 40], face: 'shout' }, { invuln: true, ease: 'out' }),
    FK(12, { ...TC, ...LEGS, armR: [-140, -20], armL: [-150, -20], torso: -10, head: -18, root: [0, 0], squash: 0.94, stretch: 1.07, face: 'shout' }, { sfx: 'roar', ease: 'overshoot' }),
    FK(10, { ...TC, ...LEGS, torso: 8, head: -6, root: [0, 0], face: 'angry' }, { ease: 'out' }),
  ] },
  // branch: a long overhead swing with the near branch
  branch: koopaStrike({
    tell: 20, active: 6, recovery: 22, carry: TC, tellSfx: 'grapple', sfx: 'whip',
    hitbox: frontBox(58, hit(9, 'medium', 3, 0, 18)), smear: { from: -120, to: 50, a: 0.4, r: 50 },
    w1: { ...TC, ...LEGS, armR: [-80, 30], torso: -6, head: -10, root: [-3, 0], face: 'angry' },
    w2: { ...TC, ...LEGS, armR: [-130, 20], torso: -14, head: -14, root: [-5, 0], squash: 0.97, stretch: 1.03, face: 'grit' },
    h: { ...TC, legR: [34, 10], legL: [-26, 24], armR: [96, 10], armL: [-24, 24], torso: 24, head: 2, root: [5, 1], squash: 1.04, stretch: 0.96, face: 'shout' },
    hold: { ...TC, legR: [34, 10], legL: [-26, 24], armR: [100, 12], armL: [-26, 24], torso: 26, head: 2, root: [5, 1], face: 'shout' },
    r: { ...TC, legR: [28, 10], legL: [-22, 18], armR: [60, 30], armL: [-20, 28], torso: 14, head: -2, root: [3, 1], face: 'grit' },
  }),
  // roots: it stamps and roots burst up all round it
  roots: koopaStrike({
    tell: 26, active: 8, recovery: 26, carry: TC, tellSfx: 'land_heavy', sfx: 'hammer_slam',
    hitbox: areaBox(42, hit(12, 'knockdown', 4, 4, 22), { y: -30, h: 30 }),
    fx: [{ kind: 'ring', x: 0, y: 0, r0: 6, r1: 50, flat: true, color: TREE.leafLt }, { kind: 'dust', x: 0, y: 0, count: 10 }],
    w1: { ...TC, legR: [60, -30], legL: [-16, 8], armR: [-60, 30], armL: [-70, 30], torso: -8, head: -10, root: [0, -2], face: 'angry' },
    w2: { ...TC, legR: [70, -40], legL: [-18, 10], armR: [-80, 20], armL: [-90, 20], torso: -12, head: -14, root: [0, -3], squash: 0.96, stretch: 1.05, face: 'grit' },
    h: { ...TC, legR: [30, 30], legL: [-24, 30], armR: [30, 40], armL: [20, 40], torso: 26, head: 6, root: [0, 3], squash: 1.12, stretch: 0.9, face: 'shout' },
    hold: { ...TC, legR: [30, 30], legL: [-24, 30], armR: [32, 40], armL: [22, 40], torso: 26, head: 6, root: [0, 3], face: 'shout' },
    r: { ...TC, legR: [24, 16], legL: [-20, 18], armR: [20, 40], armL: [10, 40], torso: 14, head: 0, root: [0, 1], face: 'grit' },
  }),
});

/** A LIVING TREE, grown by the Mega Destroyer. */
export const livingTree = {
  id: 'tree:living', type: 'tree', variant: 'living', name: 'LIVING TREE', role: 'bruiser', faction: 'tree', livingTree: true,
  build: TREE_BUILD, anims: treeAnims, hp: 70, maxHp: 70, damageMult: 1, walkSpeed: 1.0, runSpeed: 1.6, score: 300, drops: 'none',
  elite: false, armor: false, unlaunchable: false, grabbable: true, throwDamageMult: 1, damageTaken: 1, lyingFrames: 40,
  sfx: { hurt: 'land_heavy', death: 'prop_break' }, moves: null, codex: null,
  traits: { weight: 1.3, fireDamageMult: 1.5 },
  ai: { attackRange: 56, zTolerance: 14, attackCooldown: [50, 90], firstAttackDelay: 30, ignoresTokens: true, retreatChance: 0,
    attacks: [{ anim: 'branch', range: 64, weight: 3 }, { anim: 'roots', range: 48, weight: 2 }] },
  hooks: {
    /** Trees never hurt each other. */
    onHitTaken(f, h, attacker) { if (attacker && attacker.def && attacker.def.livingTree) return false; return undefined; },
    /** Coming up out of the floor: clip at the floor line and heap the dirt over the hole. */
    drawBefore(ctx, f, sx, sy) {
      if (f.anim.name !== 'sprout' || f.anim.frameIndex > 1) return;
      drawMound(ctx, sx, sy, f.world ? f.world.frame >> 2 : 0);
      ctx.save(); ctx.beginPath(); ctx.rect(sx - 200, sy - 300, 400, 300); ctx.clip();
      f.rig.burrowClip = true;
    },
    drawAfter(ctx, f) { if (f.rig.burrowClip) { ctx.restore(); f.rig.burrowClip = false; } },
  },
};
