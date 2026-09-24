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
// None of this needs the stage: a king on his own simply finds no allies. When the stage is built it spawns all
// three and these rules come alive on their own.
import { UI } from '../../constants.ts';
import { floatText } from '../../art/fx.ts';
import { audio } from '../../engine/audio.ts';

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

export const TRIO_HOOKS: Hooks = {
  onUpdate() {},
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
