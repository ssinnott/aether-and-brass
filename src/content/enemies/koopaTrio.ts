// THE KOOPA TRIO's shared rules — the three kings are built to be fought TOGETHER, as one group on one stage, and
// this is the part of them that knows the others are there. Every king's def carries `trio: true` and merges
// TRIO_HOOKS first, exactly as a faction merges its BASE_HOOKS.
//
//   THE PACT      when one king falls, the ones still standing roar and hit 20% harder for the rest of the phase.
//   HELPING HANDS the three special moves each lean on the others:
//                   the Volcano King's lava wave runs UNDERGROUND, so it reaches past the Tin Man — who is far too
//                   heavy to go below the boards himself — and heats him loose if he has rusted stiff (koopaTin.ts);
//                   Earth's Away's REGROWTH heals every king standing near him (koopaEarth.ts);
//                   the Tin Man drops his axe and claw shovel when he falls, and they are the only things that
//                   properly cut Earth's Away down (koopaEarth.ts, game/weapons.ts `chop`).
//   TREE MODE     the Mega King's machine grows LIVING TREES that attack the heroes (koopaTree.ts). Their swings hit
//                 everything, kings included — so before he grows them he tells every king to switch on TREE MODE,
//                 and a king with tree mode on is one the trees cannot hurt (and know not to). A king who comes on
//                 later, or whose phase change wiped it, is fair game until the next call.
// It also holds the BURROW both diggers share (Earth's Away and the Mega King): down through the floor, across under
// it to the nearest hero, and up under their feet.
// None of this needs the stage: a king on his own simply finds no allies. When the stage is built it spawns all
// the kings and these rules come alive on their own.
import { UI, TEAM } from '../../constants.ts';
import { floatText } from '../../art/fx.ts';
import { audio } from '../../engine/audio.ts';
import { clamp } from '../../lib/engine/math.ts';
import { areaBox } from './common.ts';
import { FK } from './koopaRig.ts';
import { drawMound } from './koopaKit.ts';
import type { PoseSpec } from '../../lib/art/poses.ts';

/** The other kings still standing in `world` (never `f` itself). */
export function trioAllies(f, world) {
  const out = [];
  if (!world || !world.entities) return out;
  for (const e of world.entities) if (e !== f && e.def && e.def.trio && e.alive && !e.dead && !e.defeated && !e.removeMe) out.push(e);
  return out;
}

/** Heal one king by `n` hp, capped at his current phase's bar, with the green number over him. */
export function healKing(e, n) {
  const before = e.hp;
  e.hp = Math.min(e.maxHp, e.hp + n);
  const got = e.hp - before;
  if (got > 0) floatText(e.x, e.y + e.h + 8, e.z, '+' + got, '#9BE070', 2);
  return got;
}

// ---------------------------------------------------------------- tree mode
/** The status name, and how long one call lasts (the trees live about this long). */
export const TREE_MODE = 'treeMode', TREE_MODE_FRAMES = 1500;
/** Does this hit come from a living tree, landing on a king who has tree mode switched on? Then it does nothing. */
export function treeSafe(f, attacker) {
  return !!(attacker && attacker.def && attacker.def.livingTree && f.status && f.status[TREE_MODE]);
}
/** The switch: a pale-green oxygen bubble round the king, a leaf over his head, pulsing. */
function drawTreeBubble(ctx, f, sx, sy) {
  const t = f.world ? f.world.frame : 0, r = Math.round(Math.max(f.w, 30) * 0.9) + ((t >> 3) & 1);
  const cy = Math.round(sy - f.h * 0.5);
  ctx.save();
  ctx.globalAlpha = 0.45; ctx.strokeStyle = '#9BE070'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(sx, cy, r, Math.round(f.h * 0.58), 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.9; ctx.fillStyle = '#86B04A';
  const ly = Math.round(sy - f.h - 8);
  ctx.fillRect(sx - 3, ly, 6, 3); ctx.fillRect(sx - 1, ly - 2, 3, 2); ctx.fillStyle = '#2E4A20'; ctx.fillRect(sx, ly + 3, 1, 3);
  ctx.restore();
}
/** Switch tree mode on for one king ("TREE MODE ON!"). */
export function treeModeOn(e) {
  if (!e || e.dead || !e.applyStatus) return;
  const had = !!(e.status && e.status[TREE_MODE]);
  e.applyStatus(TREE_MODE, { frames: TREE_MODE_FRAMES, draw: drawTreeBubble });
  if (!had) floatText(e.x, e.y + e.h + 10, e.z, 'TREE MODE ON!', '#9BE070', 1);
}

// ---------------------------------------------------------------- the burrow
/**
 * The burrow for a digger with rest carry `C`: sink (invulnerable), 30 frames under the floor during which the
 * `tunnel` event carries him under the nearest hero, then up through the boards with `erupt` as the hit. Seven keys.
 */
export function burrowAnim(C, erupt, ringColor: string): Anim {
  const SUNK: PoseSpec = { ...C, legR: [40, 60], legL: [-20, 60], armR: [-40, 60], armL: [-50, 60], torso: 30, head: 10, face: 'closed' };
  return { loop: false, frames: [
    FK(14, { ...C, legR: [30, 40], legL: [-20, 40], armR: [-30, 50], armL: [-40, 50], torso: 24, head: 6, root: [0, 3], squash: 1.1, stretch: 0.9, face: 'grit' },
      { tell: true, sfx: 'land_heavy', ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 8 }] }),
    FK(12, { ...SUNK, root: [0, 60] }, { tell: true, invuln: true, ease: 'in', fx: [{ kind: 'dust', x: 0, y: 0, count: 10 }] }),
    FK(30, { ...SUNK, root: [0, 120] }, { invuln: true, event: 'tunnel', ease: 'inout' }),
    FK(8, { ...C, legR: [30, 10], legL: [-20, 14], armR: [-150, -10], armL: [-160, -10], torso: -10, head: -20, root: [0, 0], squash: 0.9, stretch: 1.12, face: 'shout' },
      { hitbox: { ...areaBox(erupt.radius || 40, erupt.hit), id: 'erupt' }, sfx: 'hammer_slam', ease: 'overshoot',
        fx: [{ kind: 'ring', x: 0, y: 0, r0: 6, r1: 56, flat: true, color: ringColor }, { kind: 'dust', x: 0, y: 0, count: 14 }] }),
    FK(4, { ...C, legR: [18, 6], legL: [-16, 8], armR: [-140, -10], armL: [-150, -10], torso: -8, head: -18, root: [0, 0], face: 'shout' }, { ease: 'out' }),
    FK(28, { ...C, legR: [26, 16], legL: [-20, 18], armR: [30, 40], armL: [20, 40], torso: 18, head: 0, root: [0, 2], face: 'grit' }, { punish: true, ease: 'inout' }),
    FK(6, { ...C, legR: [18, 6], legL: [-16, 8], torso: 8, head: -6, footR: 0, footL: 0, root: [0, 0] }, { ease: 'out' }),
  ] };
}
/** The `tunnel` event: across under the floor to the nearest hero, and up under their feet. */
export function tunnelToNearest(f, world) {
  const t = world.nearestEnemy ? world.nearestEnemy(f.x, f.z, { team: TEAM.PLAYER, maxDist: 700 }) : null;
  if (t) {
    const b = world.boundsFor(f), dir = Math.sign(t.x - f.x) || f.facing;
    f.x = clamp(t.x - dir * 6, b.x0, b.x1); f.z = t.z; f.facing = dir;
  }
  audio.play('land_heavy');
}
/** drawBefore: while he is under the floor the body is clipped at the floor line and a mound marks where he is. */
export function burrowDrawBefore(ctx, f, sx, sy) {
  if (f.anim.name !== 'burrow' || f.anim.frameIndex > 2) return;
  if (f.anim.frameIndex >= 1) drawMound(ctx, sx, sy, f.world ? f.world.frame >> 2 : 0);
  ctx.save(); ctx.beginPath(); ctx.rect(sx - 320, sy - 400, 640, 400); ctx.clip();
  f.rig.burrowClip = true;
}
/** drawAfter: the matching restore. */
export function burrowDrawAfter(ctx, f) {
  if (f.rig.burrowClip) { ctx.restore(); f.rig.burrowClip = false; }
}

export const TRIO_HOOKS: Hooks = {
  onUpdate() {},
  /** TREE MODE: a living tree's hit does nothing to a king who has it switched on. */
  onHitTaken(f, h, attacker) { if (treeSafe(f, attacker)) return false; return undefined; },
  /** THE PACT: the survivors take up the fallen king's share. */
  onDeath(f, world) {
    const rest = trioAllies(f, world);
    for (const e of rest) {
      e.damageMult = (e.damageMult || 1) * 1.2;
      floatText(e.x, e.y + e.h + 14, e.z, 'ENRAGED!', UI.hpLow, 2);
    }
    if (rest.length) audio.play('roar');
  },
};
