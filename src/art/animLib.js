// Animation authoring library: base pose sets shared by every humanoid rig plus parametric attack builders.
// Content files (content/characters, content/enemies) assemble their animation tables from these helpers; the
// results are plain data ({ loop, frames: [{ dur, pose, hitbox, move, fx, sfx, cancel, event }] }).
import { P } from './poses.js';

/** Default hitbox geometry for a frontal strike with the given reach (px in front of the feet). */
export function frontBox(reach, hit, { low = false, high = false, behind = false } = {}) {
  const w = reach + 20;
  const y = low ? -30 : high ? -84 : -62, h = low ? 30 : high ? 84 : 60;
  return behind ? { x: -w, y, w: w * 2, h, z: 24, once: true, ...hit } : { x: 2, y, w, h, z: 24, once: true, ...hit };
}
/** Circular / area hitbox centred on the fighter (radius r). */
export function areaBox(r, hit, { y = -70, h = 70 } = {}) { return { x: -r, y, w: r * 2, h, z: Math.round(r * 0.8), once: true, ...hit }; }

/** Pose triples { w: windup, h: hit, r: recover } per strike style. Arms: [upper, lower] degrees, + = forward. */
export const STYLES = {
  swing: { w: P({ armR: [240, -20], armL: [30, 30], torso: -12, head: -5, weapon: 20, legR: [10, 5], legL: [-15, 10] }),
    h: P({ armR: [80, 0], armL: [-20, 10], torso: 22, head: 5, weapon: 50, legR: [30, 10], legL: [-25, 20], root: [3, 0] }),
    r: P({ armR: [95, 5], armL: [-20, 10], torso: 24, head: 5, weapon: 90, legR: [30, 10], legL: [-25, 20], root: [3, 1] }) },
  backhand: { w: P({ armR: [-70, -40], armL: [40, 20], torso: -10, root: [-2, 1], weapon: -30, legR: [10, 10], legL: [-10, 10] }),
    h: P({ armR: [120, -10], armL: [-30, 10], torso: 18, root: [4, 0], weapon: 20, legR: [30, 10], legL: [-20, 20] }),
    r: P({ armR: [130, 0], armL: [-30, 10], torso: 16, root: [4, 1], weapon: 30, legR: [30, 10], legL: [-20, 20] }) },
  slam: { w: P({ armR: [250, -30], armL: [240, -30], torso: -22, head: -8, weapon: 10, root: [-2, 0], legR: [10, 5], legL: [-15, 10] }),
    h: P({ armR: [70, 10], armL: [65, 10], torso: 32, head: 6, weapon: 60, root: [5, 4], legR: [40, 30], legL: [-30, 30] }),
    r: P({ armR: [75, 15], armL: [70, 15], torso: 30, head: 6, weapon: 70, root: [5, 4], legR: [40, 30], legL: [-30, 30] }) },
  uppercut: { w: P({ armR: [-40, 70], armL: [30, 30], torso: 12, root: [0, 4], weapon: -40, legR: [30, 40], legL: [-10, 30] }),
    h: P({ armR: [200, -30], armL: [-30, 20], torso: -14, head: -8, root: [4, -8], weapon: -40, legR: [20, 10], legL: [-25, 30] }),
    r: P({ armR: [190, -20], armL: [-30, 20], torso: -10, head: -6, root: [4, -4], weapon: -40, legR: [20, 10], legL: [-25, 30] }) },
  thrust: { w: P({ armR: [-30, 80], armL: [40, 30], torso: -8, root: [-2, 0], weapon: -70, legR: [15, 10], legL: [-10, 10] }),
    h: P({ armR: [95, -5], armL: [-40, 20], torso: 20, root: [5, 0], weapon: -95, legR: [40, 10], legL: [-30, 30] }),
    r: P({ armR: [90, 0], armL: [-40, 20], torso: 18, root: [5, 1], weapon: -90, legR: [40, 10], legL: [-30, 30] }) },
  spin: { w: P({ armR: [60, 20], armL: [-60, 20], torso: -6, weapon: -60, root: [0, 0, -10], legR: [10, 5], legL: [-10, 5] }),
    h: P({ armR: [110, -10], armL: [110, -10], torso: 8, weapon: -100, root: [2, -2, 10], legR: [20, 10], legL: [-20, 10] }),
    r: P({ armR: [100, 0], armL: [-40, 10], torso: 10, weapon: -95, root: [2, 0, 0], legR: [20, 10], legL: [-20, 10] }) },
  bash: { w: P({ armR: [-20, 100], armL: [30, 20], torso: -6, weapon: -120, legR: [10, 5], legL: [-10, 10] }),
    h: P({ armR: [70, 70], armL: [-30, 10], torso: 18, root: [4, 0], weapon: -120, legR: [35, 10], legL: [-25, 20] }),
    r: P({ armR: [65, 70], armL: [-30, 10], torso: 16, root: [4, 1], weapon: -120, legR: [35, 10], legL: [-25, 20] }) },
  shot: { w: P({ armL: [60, 20], armR: [30, 30], torso: -4, weapon: -90, head: 4, legR: [10, 5], legL: [-10, 10] }),
    h: P({ armL: [92, 0], armR: [20, 40], torso: 6, weapon: -80, head: 4, root: [-2, 0], legR: [15, 5], legL: [-15, 10] }),
    r: P({ armL: [100, -10], armR: [20, 40], torso: 2, weapon: -80, head: 4, root: [-3, 0], legR: [15, 5], legL: [-15, 10] }) },
  kick: { w: P({ armR: [30, 40], armL: [-40, 30], torso: -10, legR: [-25, 50], legL: [5, 5], root: [0, 2], weapon: -60 }),
    h: P({ armR: [-20, 40], armL: [40, 20], torso: -14, legR: [80, 5], legL: [10, 10], root: [3, -2], weapon: -60 }),
    r: P({ armR: [-10, 40], armL: [30, 20], torso: -10, legR: [70, 10], legL: [10, 10], root: [3, -1], weapon: -60 }) },
  clap: { w: P({ armR: [-100, 10], armL: [-100, 10], torso: -6, root: [-2, 0], weapon: -80, legR: [10, 5], legL: [-10, 10] }),
    h: P({ armR: [90, 20], armL: [90, 20], torso: 14, root: [3, 0], weapon: -80, legR: [30, 10], legL: [-25, 20] }),
    r: P({ armR: [85, 25], armL: [85, 25], torso: 12, root: [3, 1], weapon: -80, legR: [30, 10], legL: [-25, 20] }) },
  vent: { w: P({ armR: [40, 60], armL: [40, 60], torso: -12, root: [-3, 2], weapon: -100, legR: [10, 10], legL: [-15, 10] }),
    h: P({ armR: [95, 0], armL: [95, 0], torso: 16, root: [2, 0], weapon: -95, legR: [35, 10], legL: [-30, 30] }),
    r: P({ armR: [95, 0], armL: [95, 0], torso: 14, root: [2, 1], weapon: -95, legR: [35, 10], legL: [-30, 30] }) },
  charge: { w: P({ armR: [-40, 30], armL: [-40, 30], torso: 20, root: [0, 2], weapon: -40, legR: [20, 10], legL: [-20, 10] }),
    h: P({ armR: [-60, 30], armL: [-60, 30], torso: 45, head: -10, root: [6, 4], weapon: -40, legR: [55, 20], legL: [-45, 60] }),
    r: P({ armR: [-50, 30], armL: [-50, 30], torso: 40, head: -8, root: [6, 4], weapon: -40, legR: [-45, 60], legL: [55, 20] }) },
  slide: { w: P({ torso: 20, root: [0, 4], legR: [40, 40], legL: [-10, 30], armR: [30, 20], weapon: -30 }),
    h: P({ torso: 10, root: [8, 26, -70], legR: [90, 0], legL: [70, 20], armR: [-40, 20], armL: [-60, 20], weapon: -30 }),
    r: P({ torso: 10, root: [6, 20, -50], legR: [80, 10], legL: [60, 20], armR: [-30, 20], armL: [-50, 20], weapon: -30 }) },
  raise: { w: P({ armR: [-170, -10], armL: [-170, -10], torso: -10, head: -8, root: [0, 2], weapon: -20, legR: [10, 5], legL: [-15, 10] }),
    h: P({ armR: [-175, -20], armL: [-175, -20], torso: -6, head: -10, root: [0, 0], weapon: -30, legR: [20, 10], legL: [-20, 10] }),
    r: P({ armR: [-160, -10], armL: [-160, -10], torso: -2, head: -6, root: [0, 1], weapon: -20, legR: [20, 10], legL: [-20, 10] }) },
  dive: { w: P({ armR: [-60, 20], armL: [-60, 20], torso: 35, legR: [70, 10], legL: [-20, 40], weapon: -40 }),
    h: P({ armR: [-80, 20], armL: [-80, 20], torso: 50, head: -10, legR: [90, 0], legL: [-30, 50], weapon: -40 }),
    r: P({ armR: [-70, 20], armL: [-70, 20], torso: 45, head: -8, legR: [85, 5], legL: [-30, 50], weapon: -40 }) },
  airslam: { w: P({ armR: [260, -30], armL: [40, 20], torso: -10, legR: [40, -60], legL: [10, -30], weapon: 20 }),
    h: P({ armR: [85, 5], armL: [-30, 10], torso: 20, legR: [40, -60], legL: [10, -30], weapon: 45 }),
    r: P({ armR: [95, 10], armL: [-30, 10], torso: 22, legR: [40, -60], legL: [10, -30], weapon: 80 }) },
  stomp: { w: P({ armR: [-60, 30], armL: [-60, 30], torso: 5, legR: [60, -90], legL: [60, -90], root: [0, 2], weapon: -60 }),
    h: P({ armR: [-120, 10], armL: [-120, 10], torso: 10, legR: [80, -100], legL: [80, -100], root: [0, 6], weapon: -60 }),
    r: P({ armR: [-100, 10], armL: [-100, 10], torso: 8, legR: [70, -90], legL: [70, -90], root: [0, 4], weapon: -60 }) },
};

/**
 * Build a strike animation.
 * @param {object} o { style, startup, active, recovery, ret, reach, hit, behind, low, high, area, move, armor, fx, sfx, cancel, event, carry, invuln, hitboxes, extraActive }
 */
export function strike(o) {
  const st = STYLES[o.style] || STYLES.swing;
  const carry = o.carry || {};
  const hit = o.hit || { damage: 5, type: 'light', kbX: 2, kbY: 0, hitstun: 14 };
  const hb = o.hitbox || (o.area ? areaBox(o.area, hit) : frontBox(o.reach || 40, hit, { low: o.low, high: o.high, behind: o.behind }));
  const frames = [];
  const w = { dur: o.startup || 5, pose: st.w };
  if (o.sfx) w.sfx = o.sfx;
  if (o.armor) w.armor = true;
  if (o.invuln) w.invuln = true;
  if (o.windupEvent) w.event = o.windupEvent;
  if (o.moveWindup) w.move = o.moveWindup;
  frames.push(w);
  const h = { dur: o.active || 3, pose: st.h };
  if (o.hitboxes) h.hitboxes = o.hitboxes; else h.hitbox = hb;
  if (o.fx) h.fx = o.fx;
  if (o.move) h.move = o.move;
  if (o.armor) h.armor = true;
  if (o.invuln) h.invuln = true;
  if (o.event) h.event = o.event;
  if (o.hitSfx) h.sfx = o.hitSfx;
  frames.push(h);
  if (o.extraActive) for (const ex of o.extraActive) frames.push({ dur: ex.dur || 3, pose: ex.pose || st.h, hitbox: ex.hitbox, hitboxes: ex.hitboxes, event: ex.event, fx: ex.fx, move: ex.move, invuln: o.invuln || undefined });
  const r = { dur: o.recovery || 8, pose: st.r };
  if (o.cancel !== false) r.cancel = o.cancel || 'attack';
  if (o.moveRecover) r.move = o.moveRecover;
  frames.push(r);
  frames.push({ dur: o.ret || 4, pose: P({ ...carry, torso: 6 }), cancel: o.cancel !== false ? (o.cancel || 'attack') : null });
  return { loop: false, frames };
}

/**
 * Base animation set every fighter needs (idle walk run jump fall land hurt hurtAir knockdown lying getup dead win dodge taunt grab grabHold grabHit throw throwBack).
 * `carry` is the partial pose of the resting weapon arm, e.g. { armR: [30, 30], weapon: -100 }.
 */
export function makeBaseAnims(carry = {}) {
  const c = carry, c2 = { ...c, armR: c.armR ? [c.armR[0] + 4, c.armR[1] + 4] : [24, 14] };
  return {
    idle: { loop: true, frames: [
      { dur: 22, pose: P({ ...c, armL: [-15, 12], torso: 2, root: [0, 0] }) },
      { dur: 22, pose: P({ ...c2, armL: [-12, 16], torso: 4, root: [0, 1], head: 2 }) },
    ] },
    walk: { loop: true, frames: [
      { dur: 8, pose: P({ ...c, legR: [28, 6], legL: [-24, 20], armL: [22, 20], torso: 5, root: [0, 0] }) },
      { dur: 8, pose: P({ ...c2, legR: [4, 30], legL: [-2, 4], armL: [2, 12], torso: 5, root: [0, 1] }) },
      { dur: 8, pose: P({ ...c, legR: [-24, 20], legL: [28, 6], armL: [-24, 10], torso: 5, root: [0, 0] }) },
      { dur: 8, pose: P({ ...c2, legR: [-2, 4], legL: [4, 30], armL: [-4, 12], torso: 5, root: [0, 1] }) },
    ] },
    run: { loop: true, frames: [
      { dur: 6, pose: P({ ...c, legR: [55, 20], legL: [-45, 60], armL: [45, 60], torso: 18, root: [0, -2] }) },
      { dur: 6, pose: P({ ...c, legR: [-45, 60], legL: [55, 20], armL: [-35, 60], torso: 18, root: [0, 0] }) },
    ] },
    jump: { loop: false, frames: [
      { dur: 6, pose: P({ ...c, legR: [45, -85], legL: [25, -65], armL: [-60, -20], torso: 8, root: [0, 0] }) },
      { dur: 30, pose: P({ ...c, legR: [35, -75], legL: [20, -55], armL: [-40, -10], torso: 6 }) },
    ] },
    fall: { loop: true, frames: [
      { dur: 12, pose: P({ ...c, legR: [25, -40], legL: [10, -30], armL: [-70, -20], torso: -4 }) },
      { dur: 12, pose: P({ ...c, legR: [30, -45], legL: [5, -25], armL: [-80, -20], torso: -6 }) },
    ] },
    land: { loop: false, frames: [
      { dur: 3, pose: P({ ...c, legR: [30, 50], legL: [-20, 50], torso: 18, root: [0, 6], squash: 1.1, stretch: 0.9 }) },
      { dur: 4, pose: P({ ...c, legR: [10, 15], legL: [-8, 15], torso: 6, root: [0, 2] }) },
    ] },
    hurt: { loop: false, frames: [
      { dur: 4, pose: P({ ...c, torso: -24, head: -22, armL: [-50, -30], armR: [-10, 60], root: [-5, 1], legR: [18, 0], legL: [-12, 10], weapon: -40 }) },
      { dur: 10, pose: P({ ...c, torso: -12, head: -10, armL: [-30, -20], root: [-2, 1], legR: [12, 0], legL: [-8, 8] }) },
      { dur: 6, pose: P({ ...c, torso: 0 }) },
    ] },
    hurtAir: { loop: true, frames: [
      { dur: 6, pose: P({ armR: [-90, -40], armL: [-100, -30], torso: -30, head: -25, legR: [40, 40], legL: [10, 60], root: [0, 0, -15], weapon: -40 }) },
      { dur: 6, pose: P({ armR: [-100, -50], armL: [-110, -30], torso: -35, head: -30, legR: [50, 30], legL: [20, 50], root: [0, 0, -25], weapon: -40 }) },
    ] },
    knockdown: { loop: true, frames: [
      { dur: 8, pose: P({ armR: [-60, -40], armL: [-80, -30], torso: -50, head: -20, legR: [50, 30], legL: [30, 50], root: [0, -6, -25], weapon: -40 }) },
      { dur: 8, pose: P({ armR: [-70, -50], armL: [-90, -30], torso: -55, head: -25, legR: [60, 20], legL: [40, 40], root: [0, -6, -35], weapon: -40 }) },
    ] },
    lying: { loop: true, frames: [{ dur: 30, pose: P({ armR: [35, 15], armL: [25, 20], torso: 4, head: -10, legR: [10, 8], legL: [-4, 6], root: [34, -9, -88], weapon: 10 }) }] },
    getup: { loop: false, frames: [
      { dur: 8, pose: P({ armR: [35, 15], armL: [25, 20], torso: 4, head: -10, legR: [10, 8], legL: [-4, 6], root: [34, -9, -88], weapon: 10 }) },
      { dur: 8, pose: P({ armR: [60, 40], armL: [-30, 40], torso: 30, head: -10, legR: [70, 60], legL: [-20, 60], root: [8, 8, -20], weapon: -20 }) },
      { dur: 6, pose: P({ ...c, torso: 8, root: [0, 2], legR: [15, 20], legL: [-10, 15] }) },
    ] },
    dead: { loop: false, frames: [{ dur: 60, pose: P({ armR: [40, 10], armL: [30, 15], torso: 8, head: -14, legR: [6, 4], legL: [-6, 6], root: [34, -9, -90], weapon: 15 }) }] },
    win: { loop: true, frames: [
      { dur: 20, pose: P({ armR: [-170, -10], armL: [-20, 10], torso: -4, head: -6, weapon: -20, root: [0, 0] }) },
      { dur: 20, pose: P({ armR: [-175, -20], armL: [-25, 15], torso: -6, head: -10, weapon: -30, root: [0, -2] }) },
    ] },
    dodge: { loop: false, frames: [
      { dur: 5, pose: P({ ...c, torso: 30, root: [0, 4, 0], legR: [40, 40], legL: [-20, 40], armL: [-30, 30] }), sfx: 'dodge' },
      { dur: 5, pose: P({ torso: 40, root: [0, -8, 120], legR: [90, 60], legL: [70, 80], armR: [40, 60], armL: [40, 60], weapon: -60 }) },
      { dur: 5, pose: P({ torso: 40, root: [0, -8, 240], legR: [90, 60], legL: [70, 80], armR: [40, 60], armL: [40, 60], weapon: -60 }) },
      { dur: 5, pose: P({ torso: 40, root: [0, -4, 360], legR: [60, 40], legL: [30, 40], armR: [40, 60], armL: [40, 60], weapon: -60 }) },
      { dur: 8, pose: P({ ...c, torso: 8, root: [0, 2, 360], legR: [15, 20], legL: [-10, 15] }) },
    ] },
    taunt: { loop: false, frames: [
      { dur: 20, pose: P({ ...c, armL: [-60, -80], torso: -6, head: -10, root: [0, 0] }) },
      { dur: 20, pose: P({ ...c, armL: [-90, -60], torso: -8, head: -14, root: [0, -1] }) },
      { dur: 20, pose: P({ ...c, armL: [-60, -80], torso: -6, head: -10, root: [0, 0] }), event: 'meterGain' },
    ] },
    grab: { loop: false, frames: [
      { dur: 4, pose: P({ ...c, armL: [40, 40], torso: 6, root: [0, 0] }) },
      { dur: 4, pose: P({ armR: [80, 20], armL: [80, 20], torso: 14, root: [3, 0], weapon: -90 }), hitbox: { x: 4, y: -60, w: 36, h: 56, z: 20, type: 'grab', once: true, damage: 0 }, sfx: 'hit_grab' },
    ] },
    grabHold: { loop: true, frames: [
      { dur: 16, pose: P({ armR: [80, 20], armL: [80, 20], torso: 12, root: [0, 0], weapon: -90 }) },
      { dur: 16, pose: P({ armR: [82, 22], armL: [82, 22], torso: 14, root: [0, 1], weapon: -90 }) },
    ] },
    grabHit: { loop: false, frames: [
      { dur: 4, pose: P({ armR: [80, 20], armL: [-20, 40], torso: 6, root: [-2, 0], weapon: -90, legR: [-20, 50] }) },
      { dur: 4, pose: P({ armR: [80, 20], armL: [-30, 40], torso: 16, root: [2, 0], weapon: -90, legR: [70, 40] }), sfx: 'hit_medium' },
      { dur: 6, pose: P({ armR: [80, 20], armL: [80, 20], torso: 12, root: [0, 0], weapon: -90 }) },
    ] },
    throw: { loop: false, frames: [
      { dur: 5, pose: P({ armR: [60, 30], armL: [60, 30], torso: -20, root: [-3, 0], weapon: -90 }) },
      { dur: 6, pose: P({ armR: [140, -10], armL: [140, -10], torso: 30, root: [6, 0], weapon: -40 }), sfx: 'throw' },
      { dur: 10, pose: P({ armR: [130, 0], armL: [130, 0], torso: 24, root: [6, 1], weapon: -40 }) },
      { dur: 4, pose: P({ ...c, torso: 6 }) },
    ] },
    throwBack: { loop: false, frames: [
      { dur: 5, pose: P({ armR: [-120, -20], armL: [-120, -20], torso: -30, root: [-3, 0], weapon: -60 }) },
      { dur: 6, pose: P({ armR: [-160, -10], armL: [-160, -10], torso: -40, root: [-6, 4], weapon: -60 }), sfx: 'throw' },
      { dur: 10, pose: P({ armR: [-150, 0], armL: [-150, 0], torso: -30, root: [-6, 5], weapon: -60 }) },
      { dur: 4, pose: P({ ...c, torso: 6 }) },
    ] },
  };
}

/** Small helper for content: clone an animation table entry with a field patch on its frames. */
export function patchFrames(anim, fn) { return { ...anim, frames: anim.frames.map((f, i) => ({ ...f, ...(fn(f, i) || {}) })) }; }
