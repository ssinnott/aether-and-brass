// Shared authoring helpers for placeholder character content. Each character file passes its GDD numbers here and
// receives a complete animation table (every state the Fighter state machine needs). Pure data assembly, no game logic.
import { makeBaseAnims, strike, frontBox, areaBox, STYLES } from '../../art/animLib.ts';
import { P } from '../../lib/art/poses.ts';
import type { PoseSpec } from '../../lib/art/poses.ts';

export { strike, frontBox, areaBox, STYLES, P };

/**
 * What F() merges onto the keyframe it builds: every `Frame` field except the two F() writes itself. Frame has no
 * index signature on purpose (types/content.d.ts), so a misspelt frame key here is a compile error.
 */
export type FrameExtra = Omit<Frame, 'dur' | 'pose'>;

/**
 * F()'s two forms. The plain call takes Frame's own fields and nothing else, which is what keeps a misspelt frame
 * key an error. A character whose OWN hooks read a field back off the frame (Sael's `jet` and `charge`, which only
 * her onAnimEvent knows about) names that wider shape at the call — `F<SaelFrameExtra>(...)` — and is checked
 * against it just as strictly. There is no form that accepts an unnamed key.
 */
export interface Keyframe {
  (dur: number, spec: PoseSpec, extra?: FrameExtra): Frame;
  <E extends FrameExtra>(dur: number, spec: PoseSpec, extra: E): Frame & E;
}

/**
 * What a character's ground key G() takes. G() solves root.y itself so the lowest sole sits on the floor, and reads
 * `root[1]` back off the spec as an extra sink, so its `root` is always the [x, y, rot] array form P() accepts —
 * never the { x, y, rot } object one.
 */
export type GroundSpec = Omit<PoseSpec, 'root'> & { root?: number[] };

/** Keyframe shorthand for hand-authored anims: F(dur, poseSpec, extraFrameFields) -> { dur, pose: P(spec), ...extra }. */
export const F: Keyframe = (dur: number, spec: PoseSpec, extra?: FrameExtra) => ({ dur, pose: P(spec), ...(extra || {}) });
/** Hit data shorthand: hit(damage, type, kbX, kbY, hitstun, extra). */
export const hit = (damage: number, type?: HitType, kbX?: number, kbY?: number, hitstun?: number, extra?: Partial<Hit>): Hit => ({ damage, type, kbX, kbY, hitstun, ...(extra || {}) });

/**
 * Animation names that are moves (issue #22 acceptance 1): every hero anim key in this list must appear in some
 * moveList entry's `anims` / `anim` (checked by the training scenario's coverage assertion, window.__game.moveAnims).
 */
export const MOVE_ANIMS = Object.freeze(['attack1', 'attack2', 'attack3', 'attack4', 'jumpAttack', 'jumpAttack2', 'landAttack', 'dashAttack', 'special', 'super', 'dodge', 'airDash', 'parry', 'taunt', 'grab', 'grabHit', 'throw', 'throwBack']);

/** One row of a trial: the label the HUD prints, the combat-log kind(s) that satisfy it, and the anim(s) it must come from. */
export const step = (label: string, kind: TrialKind | TrialKind[] = 'hit', anim: string | string[] | undefined = undefined, extra: Partial<TrialStep> = {}): TrialStep => ({ label, kind, ...(anim ? { anim } : {}), ...extra });
/** A `comboTrial(n)` is the n-hit ground combo, one step per link. */
export function comboTrial(n: number): Trial {
  const steps = Array.from({ length: n }, (_, i) => step(`HIT ${i + 1}`, 'hit', `attack${i + 1}`));
  return { id: 'combo', name: `${n}-HIT COMBO`, hint: 'PRESS ATTACK IN THE RECOVERY OF EACH HIT', strict: true, window: 60, steps };
}
/** Jump-in, then grab the enemy it put on the ground. */
export function jumpGrabTrial(): Trial { return { id: 'jumpgrab', name: 'JUMP-IN GRAB', hint: 'JUMP ATTACK, THEN GRAB WHEN IT STANDS', window: 150, steps: [step('JUMP ATTACK', 'hit', 'jumpAttack'), step('GRAB', 'grab')] }; }
/** Dodge-cancel a combo hit's recovery straight into the special. */
export function dodgeCancelTrial(): Trial { return { id: 'dodgecancel', name: 'DODGE-CANCEL SPECIAL', hint: 'HIT, DODGE OUT OF THE RECOVERY, SPECIAL', window: 60, steps: [step('COMBO HIT', 'hit', ['attack1', 'attack2', 'attack3', 'attack4']), step('DODGE CANCEL', 'cancel'), step('SPECIAL', ['hit', 'projectile'], 'special')] }; }
/** Grab one body and throw it into the other (two dummies). */
export function throwBodyTrial(): Trial { return { id: 'throwbody', name: 'BODY THROW', hint: 'GRAB ONE, THROW IT INTO THE OTHER', window: 150, bodies: 2, steps: [step('GRAB', 'grab'), step('THROW', 'throw'), step('BODY HIT', 'body')] }; }

/** GDD stat -> movement mapping (GDD 2: walk 1.7 / 2.2 / 2.8 px/f for Speed 2 / 3 / 5; run = walk x 1.7). */
export function speedFor(speedStat: number): number { return speedStat >= 5 ? 2.8 : speedStat >= 3 ? 2.2 : 1.7; }
/** Health stat -> max HP. */
export function hpFor(healthStat: number): number { return 95 + healthStat * 21; }

/** A pose-triple name in `STYLES` (animLib.ts): which windup / hit / recover keys a swing is built from. */
export type StrikeStyle = keyof typeof STYLES;

/**
 * One link of a hero's ground combo, in the terms `strike()` builds a swing from. `dmg` / `type` / `kbX` / `kbY` /
 * `hitstun` become the link's `Hit`; everything else is timing or presentation.
 */
export interface HeroComboStep {
  style: StrikeStyle;
  dmg: number;
  type?: HitType;
  /** Frames before the box goes live (default 5). */
  startup?: number;
  /** Frames the box is live (default 3). */
  active?: number;
  /** Frames of recovery (default 8). */
  recovery?: number;
  /** Frames of the return-to-carry key (default 4). */
  ret?: number;
  /** px in front of the feet; falls back to the set's own `reach`. */
  reach?: number;
  hitstun?: number;
  kbX?: number;
  kbY?: number;
  /** A mirrored copy of the box is added behind the fighter. */
  behind?: boolean;
  high?: boolean;
  low?: boolean;
  /** Radius of an area box centred on the fighter, instead of the frontal one. */
  area?: number;
  /** true = unlimited armor hits; a number absorbs that many. */
  armor?: boolean | number;
  move?: FrameMove | number;
  event?: string;
  fx?: Frame['fx'];
  sfx?: string;
  hitSfx?: string;
  onHit?: string;
}

/** The air attack (`jumpAttack`): one box that stays live through the descent. */
export interface HeroJumpAttack {
  /** Defaults to 'airslam'. */
  style?: StrikeStyle;
  dmg: number;
  type?: HitType;
  reach?: number;
  kbX?: number;
  kbY?: number;
  hitstun?: number;
  startup?: number;
  active?: number;
  recovery?: number;
  move?: FrameMove | number;
  moveRecover?: FrameMove | number;
  /** Anim event on the windup frame. */
  windupEvent?: string;
  event?: string;
  onHit?: string;
  /** false = the box is dropped on the recovery frame instead of staying live. */
  persist?: boolean;
}

/** The optional second air attack (`jumpAttack2`): a shot, fired from the shot pose. */
export interface HeroAirShot {
  projectile: Frame['projectile'];
  sfx?: string;
}

/** The optional landing shockwave (`landAttack`). */
export interface HeroLandAttack {
  radius: number;
  dmg: number;
}

/** The run attack (`dashAttack`): like a combo link, plus the projectile / cancel forms only it has. */
export interface HeroDashAttack {
  style: StrikeStyle;
  dmg: number;
  type?: HitType;
  startup?: number;
  active?: number;
  recovery?: number;
  reach?: number;
  hitstun?: number;
  kbX?: number;
  kbY?: number;
  behind?: boolean;
  low?: boolean;
  /** Radius of an area box centred on the fighter, instead of the frontal one. */
  area?: number;
  armor?: boolean | number;
  invuln?: boolean | number;
  move?: FrameMove | number;
  moveRecover?: FrameMove | number;
  event?: string;
  /** Set = the active frame spawns this instead of carrying a box. */
  projectile?: Frame['projectile'];
  /** false = no cancel window at all; otherwise the button that may cancel the recovery (default 'attack'). */
  cancel?: Frame['cancel'] | false;
  fx?: Frame['fx'];
  sfx?: string;
}

/** Everything `makeHeroAnims` needs: the GDD numbers of one hero, plus the two anims the character file authors itself. */
export interface HeroAnimSpec {
  /** Rest pose of the weapon arm, e.g. { armR: [30, 30], weapon: -100 }. */
  carry?: PoseSpec;
  /** Default reach in px (default 40). */
  reach?: number;
  /** Default swing sfx for every link that names none of its own. */
  swingSfx?: string;
  combo: HeroComboStep[];
  jumpAttack: HeroJumpAttack;
  jumpAttack2?: HeroAirShot;
  landAttack?: HeroLandAttack;
  dashAttack: HeroDashAttack;
  /** Full animation entries, built by the character file. */
  special: Anim;
  super: Anim;
  taunt?: Anim;
  /** Additional named anims, merged over the set. */
  extra?: AnimSet;
}

/** Build the standard hero animation set. */
export function makeHeroAnims(o: HeroAnimSpec): AnimSet {
  const carry = o.carry || {}, reach = o.reach || 40;
  // The base set IS an AnimSet, but animLib.ts infers its own return: the grab frame's `type: 'grab'` widens to
  // `string` there, so the shape has to be named here. Type-level only.
  const anims = makeBaseAnims(carry) as AnimSet;
  o.combo.forEach((c, i) => {
    anims['attack' + (i + 1)] = strike({
      style: c.style, startup: c.startup || 5, active: c.active || 3, recovery: c.recovery || 8, ret: c.ret || 4, carry,
      reach: c.reach || reach, behind: c.behind, high: c.high, low: c.low, area: c.area, armor: c.armor, move: c.move, event: c.event,
      sfx: c.sfx || o.swingSfx, hitSfx: c.hitSfx, fx: c.fx || [{ kind: 'slash', x: 22, y: 40, radius: 30, angle: c.style === 'uppercut' ? -60 : 10 }],
      hit: { damage: c.dmg, type: c.type || 'light', kbX: c.kbX != null ? c.kbX : 2, kbY: c.kbY || 0, hitstun: c.hitstun || 16, onHit: c.onHit },
      cancel: i === o.combo.length - 1 ? 'any' : 'attack',
    });
  });
  const ja = o.jumpAttack;
  // the air hitbox reaches below the feet and stays live through the descent (shared id = one hit per target)
  const jaBox = { id: 'jumpAttack', x: -6, y: -50, w: (ja.reach || reach) + 20, h: 78, z: 24, once: true, damage: ja.dmg, type: ja.type || 'knockdown',
    kbX: ja.kbX != null ? ja.kbX : 4, kbY: ja.kbY != null ? ja.kbY : 4, hitstun: ja.hitstun || 20, onHit: ja.onHit };
  anims.jumpAttack = {
    loop: false, frames: [
      { dur: ja.startup || 4, pose: STYLES[ja.style || 'airslam'].w, sfx: o.swingSfx, event: ja.windupEvent },
      { dur: ja.active || 5, pose: STYLES[ja.style || 'airslam'].h, move: ja.move, event: ja.event, hitbox: jaBox },
      { dur: ja.recovery || 20, pose: STYLES[ja.style || 'airslam'].r, move: ja.moveRecover, hitbox: ja.persist === false ? undefined : jaBox },
    ],
  };
  if (o.jumpAttack2) {
    const j2 = o.jumpAttack2;
    anims.jumpAttack2 = { loop: false, frames: [
      { dur: 3, pose: STYLES.shot.w }, { dur: 3, pose: P({ armL: [140, -10], armR: [20, 40], torso: 10, legR: [30, -50], legL: [10, -30], weapon: -80 }), event: 'spawnProjectile', projectile: j2.projectile, sfx: j2.sfx },
      { dur: 12, pose: P({ armL: [130, -10], armR: [20, 40], torso: 8, legR: [30, -50], legL: [10, -30], weapon: -80 }) },
    ] };
  }
  if (o.landAttack) {
    anims.landAttack = { loop: false, frames: [
      { dur: 2, pose: P({ ...carry, legR: [30, 50], legL: [-20, 50], torso: 24, root: [0, 8], squash: 1.15, stretch: 0.85 }), event: 'shockwave', radius: o.landAttack.radius, hit: { damage: o.landAttack.dmg, type: 'knockdown', kbX: 4, kbY: 4 }, sfx: 'land_heavy' },
      { dur: 10, pose: P({ ...carry, legR: [20, 30], legL: [-15, 30], torso: 12, root: [0, 4] }) },
      { dur: 6, pose: P({ ...carry, torso: 4 }), cancel: 'any' },
    ] };
  }
  const d = o.dashAttack;
  const dFrames: Frame[] = [{ dur: d.startup || 4, pose: STYLES[d.style].w, sfx: d.sfx || o.swingSfx, invuln: d.invuln || undefined, armor: d.armor || undefined }];
  const dHit = d.projectile ? null : (d.area ? areaBox(d.area, { damage: d.dmg, type: d.type || 'knockdown', kbX: d.kbX != null ? d.kbX : 6, kbY: d.kbY || 4, hitstun: d.hitstun || 20 })
    : frontBox(d.reach || reach, { damage: d.dmg, type: d.type || 'knockdown', kbX: d.kbX != null ? d.kbX : 6, kbY: d.kbY || 4, hitstun: d.hitstun || 20 }, { low: d.low, behind: d.behind }));
  dFrames.push({ dur: d.active || 8, pose: STYLES[d.style].h, hitbox: dHit || undefined, move: d.move, armor: d.armor || undefined, invuln: d.invuln || undefined,
    event: d.projectile ? 'spawnProjectile' : d.event, projectile: d.projectile, fx: d.fx || (d.projectile ? undefined : [{ kind: 'dust', x: -10, y: 0 }]) });
  dFrames.push({ dur: d.recovery || 10, pose: STYLES[d.style].r, cancel: d.cancel === false ? null : (d.cancel || 'attack'), move: d.moveRecover });
  dFrames.push({ dur: 4, pose: P({ ...carry, torso: 6 }), cancel: 'any' });
  anims.dashAttack = { loop: false, frames: dFrames };
  anims.special = o.special;
  anims.super = o.super;
  if (o.taunt) anims.taunt = o.taunt;
  if (o.extra) Object.assign(anims, o.extra);
  return anims;
}
