// What a story beat puts in the world (issue #25): scripted ACTORS, and the SIGNS that carry the board's subtitle.
//
// Part one of the file is the actor — a body that walks through a beat and cannot be fought. Part two is the sign,
// the lettered board a beat walks you past instead of showing you a title card.
//
// A beat needs people in it — the crew on the Sootfoot gangway, a Chandlery handcart crossing the cargo gate, the
// Gleaning stripping a Warden on the spoil heap. Every one of those is an existing rig doing something authored, so
// this file adds no art. What it adds is a body that is deliberately NOT a fight:
//
//   not in `world.enemies`      the wave lock never waits on it and `bot.pickTarget` never sees it
//   not in `world.fighters`     nothing separates against it, no attack token, no AI
//   not hittable                combat.js TARGET_KINDS is ['player','enemy','boss','prop'] and 'fx' is not in it
//   not hashed                  net/checksum.js keys off the same kinds, so an actor is invisible to the checksum
//   draws no rng                the whole reason it is a Fighter subclass and not an Enemy (see DETERMINISM below)
//
// All five fall out of ONE choice: `kind: 'fx'` with `team: TEAM.NONE`. The rig, the animation player, the floor
// shadow and the depth sort are Fighter's and come along for free, so an actor reads as exactly the same body the
// player fights two screens later — which is the point of staging a beat with them.
//
// DETERMINISM (docs/MULTIPLAYER.md). An actor must be skippable per-peer: `?bot=1` runs and the harness skip the
// whole beat, and one peer running a beat the other skipped may not change what the checksum sees. That rules out
// `Enemy`, whose constructor draws `rng.sign()` (enemy.js:114) and would shift the shared mulberry32 stream by the
// number of actors a peer happened to spawn. A Fighter subclass with `think()` overridden draws nothing at all: the
// script below is a pure function of the actor's own `t` counter, exactly as entrances.js is of its `arriveT`.
//
// Content hooks are stripped rather than trusted. An enemy def's `onSpawn`/`onUpdate` are written for a unit in a
// fight — the Resurrection Man's cart timer, a Stormcrow's tether — and some of them do draw rng. `actorDef()`
// derives a hookless copy so a beat can stage ANY def in the roster without auditing it first.
import { ST, TEAM, Z_SPEED_FACTOR, FLOOR_TOP, VIEW_W, UI } from '../constants.js';
import { Fighter } from './fighter.js';
import { Entity } from './entity.js';
import { clamp, sign } from '../engine/math.js';
import { drawText, measureText, lineHeight } from '../engine/text.js';
import { rrect, rivetLine } from '../art/shapes.js';

/** Hooks and def-level callbacks an actor must not run. `applyDef` reads `def.hooks`, so blanking it disables all. */
export function actorDef(def) {
  return { ...def, hooks: null, onSpawn: null, onUpdate: null, drops: null, score: 0 };
}

/**
 * One scripted body in a beat. Motion is a queue of `{ vx, vz, frames, anim }` legs pushed by the `actor` and
 * `walk` event actions; when the queue empties the actor stands. Nothing here reads input, targets or the rng.
 */
export class Actor extends Fighter {
  /**
   * @param {object} def any character or enemy def
   * @param {{ id?: string, x?: number, z?: number, facing?: 1|-1, anim?: string, life?: number }} o
   *   `id` is what a later `walk` action addresses; `life` removes the actor after N frames (0 = until the beat ends).
   */
  constructor(def, { id = '', x = 0, z = 70, facing = 1, anim = 'idle', life = 0 } = {}) {
    super(actorDef(def), { team: TEAM.NONE, kind: 'fx', x, z, facing });
    /** Addressed by `{ walk: { id } }`, and by the beat teardown that removes every actor it spawned. */
    this.actorId = id;
    /** Frames since spawn. The only clock the script reads — never world.frame, never the rng. */
    this.t = 0;
    this.life = life | 0;
    /** @type {{ vx: number, vz: number, frames: number, anim: string, face: number }[]} */
    this.legs = [];
    // An actor is scenery, so it is exempt from the one-screen clamp a locked camera puts on a fighter
    // (world.boundsFor keys on `entered !== false`). A handcart has to be able to cross the screen and leave.
    this.entered = false;
    this.godmode = true;
    if (anim && anim !== 'idle') this.play(anim, { restart: true });
  }

  /** Queue one leg of movement. `frames <= 0` holds the leg until something replaces it. */
  push({ vx = 0, vz = 0, frames = 0, anim = '', face = 0 } = {}) {
    this.legs.push({ vx, vz, frames: frames | 0, anim, face: face | 0 });
    return this;
  }

  /** Replace the queue outright (a `walk` action retargeting an actor mid-beat). */
  retarget(spec) { this.legs.length = 0; return this.push(spec); }

  /**
   * Scripted motion. Positions are written directly rather than through `vx`, the way Enemy.moveToward does, so a
   * leg's distance is exactly `vx * frames` and an author can place a body on a mark without solving for friction.
   */
  think(world) {
    this.t++;
    if (this.life > 0 && this.t >= this.life) { this.removeMe = true; this.alive = false; return; }
    const leg = this.legs[0];
    if (!leg) { this.stand(); return; }
    const zb = world.zBounds ? world.zBounds(this) : null;
    this.x += leg.vx;
    if (leg.vz) this.z = clamp(this.z + leg.vz, zb ? zb.z0 : 0, zb ? zb.z1 : 140);
    if (leg.face) this.facing = leg.face > 0 ? 1 : -1;
    else if (Math.abs(leg.vx) > 0.05) this.facing = sign(leg.vx);
    const an = leg.anim || (Math.abs(leg.vx) > 0.05 || Math.abs(leg.vz) > 0.05 ? 'walk' : 'idle');
    const st = an === 'run' ? ST.RUN : an === 'idle' ? ST.IDLE : ST.WALK;
    if (this.state !== st || this.anim.name !== an) { this.state = st; this.stateTimer = 0; this.play(an, { restart: false }); }
    if (leg.frames > 0 && --leg.frames <= 0) this.legs.shift();
  }

  /** Idle between legs, without Enemy's facing-the-player behaviour. */
  stand() {
    if (this.state !== ST.IDLE) { this.state = ST.IDLE; this.stateTimer = 0; this.play('idle', { restart: false }); }
    else if (this.anim.name !== 'idle' && (this.anim.done || (this.anim.def && this.anim.def.loop))) this.play('idle');
  }

  /** Scenery is never a target; combat.js already refuses kind 'fx', and this closes the door from the other side. */
  hurtbox() { return null; }
  takeHit() { return false; }
}

/** Z speed an author writes as a plain px/frame, matched to the depth foreshortening the rest of the game uses. */
export const ACTOR_Z_SPEED = Z_SPEED_FACTOR;

/**
 * Default height a Sign hangs at. Chosen against the HUD rather than the art: a banner occupies screen rows 114 to
 * 160, and at z 6 this puts the board's bottom edge at row ~96, clear above it.
 */
export const SIGN_LIFT = 118;

// ---------------------------------------------------------------------------------------------------------------
// Signs: the stage subtitle, lettered on something that belongs to the board
// ---------------------------------------------------------------------------------------------------------------
// The intro card put the board's subtitle on a black plate in the middle of the screen. A beat puts it on a thing
// instead — the hoarding at the head of the Sootfoot gangway, the nameplate bolted to the Cold Sovereign's rail, the
// Chandlery's tally board at the foot of the Lime Road, a stencil on a bale at the top of the spoil heap. It is the
// same words; the difference is that you walk past them, which is the whole of what issue #25 asks for.
//
// A Sign is world-space (it depth-sorts and scrolls with the camera like any prop) and is NOT a prop: props are
// breakable, lootable, throwable furniture that items.js owns, and a Sign is none of those things.

/**
 * Board looks, keyed by the `style` a stage writes. Each paints the board behind the letters.
 *
 * Every one of them is handed `legs` — the px from the bottom of the board down to the floor at its own z — and is
 * responsible for drawing its own support that far. That is what lets a sign hang HIGH enough to clear the HUD's
 * banner rows (114..160, game/hud.js) without floating: a dockside hoarding is mounted where it can be read from
 * the far end of the quay, and it has posts all the way down to the planks to prove it.
 */
const SIGN_LOOKS = {
  /** Board 1: paper pasted to a plank hoarding on two posts, rain-stained. */
  hoarding(ctx, x, y, w, h, legs) {
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x + 8, y + h, 4, legs); ctx.fillRect(x + w - 12, y + h, 4, legs);
    rrect(ctx, x, y, w, h, 1, '#6A4A2A', '#2B2B30', 1);
    ctx.fillStyle = '#d8cbab'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = 'rgba(58,42,26,0.25)'; ctx.fillRect(x + 3, y + h - 9, w - 6, 6);
  },
  /** Board 2: a riveted brass nameplate on a stanchion off the rail of a moored sky-ship. */
  nameplate(ctx, x, y, w, h, legs) {
    ctx.fillStyle = '#3A3F4B'; ctx.fillRect(x + Math.round(w / 2) - 2, y + h, 4, legs);
    rrect(ctx, x, y, w, h, 2, '#8a5a1c', '#2B2B30', 1);
    rrect(ctx, x + 2, y + 2, w - 4, h - 4, 1, '#c9963a', null, 0);
    rivetLine(ctx, x + 5, y + 4, x + w - 5, y + 4, Math.max(2, (w / 22) | 0), 1, UI.brassLight);
    rivetLine(ctx, x + 5, y + h - 4, x + w - 5, y + h - 4, Math.max(2, (w / 22) | 0), 1, UI.brassLight);
  },
  /** Board 3: the company's slate tally board on a trestle, ruled in lime. */
  tally(ctx, x, y, w, h, legs) {
    ctx.fillStyle = '#4a4030';
    ctx.fillRect(x + 10, y + h, 3, legs); ctx.fillRect(x + w - 13, y + h, 3, legs);
    rrect(ctx, x, y, w, h, 1, '#2b3230', '#1a1f1e', 1);
    ctx.fillStyle = 'rgba(154,200,90,0.5)';
    for (let i = 1; i < 4; i++) ctx.fillRect(x + 4, y + Math.round((h * i) / 4), w - 8, 1);
    ctx.fillStyle = 'rgba(154,200,90,0.35)'; ctx.fillRect(x + Math.round(w * 0.72), y + 3, 1, h - 6);
  },
  /** Board 4: a stencil sprayed on a strapped bale, stacked on the ones under it. */
  bale(ctx, x, y, w, h, legs) {
    ctx.fillStyle = '#5f5238';
    for (let i = 0; i * 14 < legs; i++) ctx.fillRect(x + 4, y + h + i * 14, w - 8, 12);
    rrect(ctx, x, y, w, h, 2, '#7a6a4a', '#2B2B30', 1);
    ctx.fillStyle = '#4a3f2a';
    for (let i = 1; i < 3; i++) ctx.fillRect(x + Math.round((w * i) / 3) - 2, y, 4, h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x + 2, y + h - 5, w - 4, 3);
  },
};

/**
 * A lettered board standing in the world. Fades in over `fade` frames so it does not pop as the camera reaches it.
 *
 * @param {{ text: string, sub?: string, x: number, z?: number, style?: keyof SIGN_LOOKS, y?: number, size?: number,
 *           fade?: number, life?: number, color?: string }} spec
 */
export class Sign extends Entity {
  constructor(spec = /** @type {any} */ ({})) {
    super('fx');
    this.text = String(spec.text || '');
    this.sub = String(spec.sub || '');
    this.x = spec.x || 0;
    this.z = spec.z != null ? spec.z : 12;
    // Height off the floor the board hangs at. The default clears the HUD's banner rows (114..160, game/hud.js) so
    // the board's name and the caption framing it are never drawn on top of each other; the look draws its own
    // support down to the floor, so hanging it high reads as mounted rather than floating.
    this.lift = spec.y != null ? spec.y : SIGN_LIFT;
    this.style = spec.style || 'hoarding';
    this.size = spec.size || 1;
    this.color = spec.color || '#2b1c10';
    this.fade = spec.fade != null ? spec.fade : 30;
    this.life = spec.life | 0;
    this.t = 0;
    this.shadowW = 0;
  }
  hurtbox() { return null; }
  update() { this.t++; if (this.life > 0 && this.t >= this.life) { this.removeMe = true; this.alive = false; } }
  draw(ctx, cam) {
    const a = this.fade > 0 ? Math.min(1, this.t / this.fade) : 1;
    if (a <= 0) return;
    const groundY = Math.round(FLOOR_TOP + this.z + (cam.shakeY || 0));
    const sx = cam.toScreenX(this.x), sy = groundY - this.lift;
    const tw = measureText(this.text, this.size), sw = this.sub ? measureText(this.sub, 1) : 0;
    const w = Math.max(tw, sw) + 20, h = (this.sub ? 26 : 16) + 4;
    const x = Math.round(sx - w / 2), y = Math.round(sy - h);
    if (x > VIEW_W || x + w < 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    (SIGN_LOOKS[this.style] || SIGN_LOOKS.hoarding)(ctx, x, y, w, h, Math.max(0, groundY - (y + h)));
    drawText(ctx, this.text, sx, y + 6, { size: this.size, color: this.color, align: 'center', shadow: false });
    if (this.sub) drawText(ctx, this.sub, sx, y + 6 + lineHeight(this.size) + 2, { size: 1, color: this.color, align: 'center', shadow: false, alpha: 0.75 });
    ctx.restore();
  }
}
