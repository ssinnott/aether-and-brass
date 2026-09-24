// Pickup weapons (issue #20, GDD section 7): the four enemy-dropped weapons a player may wield for a handful of
// swings before they shatter. This module is data + a small swing builder; it owns no sim state (that lives on
// Player, game/player.js) and no entity (WeaponPickup lives in game/items.js). It must never import items.js or
// player.js (items.js imports this module and player.js imports both; importing either back would form a cycle).
import { strike } from '../art/animLib.ts';
import { drawCorsairCutlass } from '../art/weapons.ts';
import { drawHalberd, drawRapier } from '../content/enemies/brassbound.ts';
import { drawShovel } from '../content/enemies/chandlerKit.ts';
import { drawTinAxe, drawClawShovel } from '../content/enemies/koopaKit.ts';
import { VIEW_W } from '../constants.ts';
// The rig and animation shapes come from the vendored library rather than being restated here: `RigWeapon` is
// exactly the `build.weapon` block lib/art/rig.ts draws in hand space, and `AnimSet` is the set lib/art/animation.ts's
// AnimPlayer takes as an overlay — which is what a wielded weapon's table is handed to (game/player.ts wield).
import type { RigWeapon } from '../lib/art/rig.ts';
import type { AnimSet } from '../lib/art/animation.ts';

/**
 * Resting weapon-arm pose while a hero carries a pickup weapon (a copy of brassbound's private C_HALB: weapon low
 * at the side, ART_STYLE section 0.6). `strike()`'s `carry` option folds this into every swing's return-to-idle
 * frame.
 */
export const WEAPON_CARRY = { armR: [30, 10], weapon: -130, armL: [-24, -12], legR: [8, 0], legL: [-8, 0] };

/** Reusable smear specs (art/secondary.js consumes { from, to, a, r? } on the active frame). */
const SM_SWING = { from: -150, to: 30, a: 0.5 };
const SM_BACK = { from: 200, to: 30, a: 0.45 };
const SM_SLAM = { from: -170, to: 40, a: 0.5 };
const SM_LOW = { from: 200, to: 0, a: 0.5, r: 66 };

/**
 * Build one strike() animation for a swing spec. `strike()` only ever forwards `o.fx`, never writes `frame.smear`
 * (art/animLib.js), so a swing carrying its own `smear` gets it patched onto the active frame (frames[1], the key
 * the hitbox lives on) here.
 */
function swing(s: WeaponSwing, last: boolean, chop: boolean) {
  const a = strike({
    style: s.style, startup: s.startup, active: s.active, recovery: s.recovery, ret: 4, carry: WEAPON_CARRY,
    reach: s.reach, low: s.low, sfx: s.sfx,
    fx: [{ kind: 'slash', x: s.reach - 12, y: s.low ? 14 : 40, radius: 30, angle: s.low ? 30 : 10 }],
    hit: { damage: s.dmg, type: s.type, kbX: s.kbX, kbY: s.kbY || 0, hitstun: s.hitstun, status: s.status, weapon: true, ...(chop ? { chop: true } : {}) },
    cancel: last ? 'any' : 'attack',
  });
  if (s.smear) a.frames[1].smear = s.smear;
  return a;
}
/** Build a weapon's { attack1..N } table from its `swings` list; the last swing chain-cancels into anything. */
function anims(swings: WeaponSwing[], chop: boolean): AnimSet {
  const t: AnimSet = {};
  swings.forEach((s, i) => { t['attack' + (i + 1)] = swing(s, i === swings.length - 1, chop); });
  return t;
}

// `rig` is exactly the build.weapon shape art/rig.js draws in hand space ({ attach, length, draw, headAt }).
// `status.burn` uses the record shape of STATUS_DEFAULTS.burn (game/status.js). sfx names (whiff, hammer_swing,
// rapier, rapier_arc) all exist in src/engine/audio/sfx.js.
// Per-weapon throw feel (issue #21, GDD 7): speed/vy/gravity shape the arc, damage/type/kbX/kbY/hitstun/pierce/
// maxDist the hit it lands, spin a visual rotation-rate multiplier (throwables.js drawThrownWeapon). limeRake's
// `patch` is the lime-patch spec its landing spot leaves behind (step 21.2). See ThrowSpec in throwables.js.
/** A smear spec as art/secondary.ts consumes one on the active frame. */
export interface WeaponSmear { from: number; to: number; a: number; r?: number; }

/** One swing of a weapon's ground chain: the frame budget, the reach, and the hit it lands. */
export interface WeaponSwing {
  /** Which `strike()` shape to build (art/animLib.ts): thrust, swing, backhand, slam. */
  style: string;
  /** A low swing: the arc and the slash FX drop to shin height. */
  low?: boolean;
  startup: number;
  active: number;
  recovery: number;
  reach: number;
  /** Damage. Named `dmg` here and mapped onto the hit's `damage` by `swing()`. */
  dmg: number;
  type: HitType;
  kbX: number;
  kbY?: number;
  hitstun: number;
  /** Statuses the hit applies (game/status.ts): the lime rake's burn. `any` per entry: each status names its own
   *  fields, same as `Hit.status` in types/content.d.ts and `ProjectileOpts.status` in game/projectile.ts. */
  status?: Record<string, any>;
  sfx: string;
  smear?: WeaponSmear;
}

/**
 * Per-weapon throw feel (issue #21, GDD 7) — the block the comment above describes, and the weapon half of
 * game/throwables.ts's `ThrowSpec`. Declared here because this module AUTHORS these and throwables.ts imports
 * this one, so the dependency must not run back the other way (see the cycle note at the top of this file).
 */
export interface WeaponThrow {
  /** The arc: launch speed along facing, initial upward velocity, and the gravity pulling it down. */
  speed: number;
  vy: number;
  gravity: number;
  /** The hit it lands. */
  damage: number;
  type: HitType;
  kbX: number;
  kbY: number;
  hitstun: number;
  /** Extra targets after the first. */
  pierce: number;
  /** How far it flies before it drops. */
  maxDist: number;
  /** Visual rotation-rate multiplier (throwables.ts drawThrownWeapon). */
  spin: number;
  /** The lime rake only: the lime patch its landing spot leaves behind (step 21.2). */
  patch?: { life: number; r: number; mult: number; frames: number; };
}

/** One pickup weapon. */
export interface WeaponDef {
  id: string;
  name: string;
  /** Durability: connecting swings it can make before it shatters. */
  hits: number;
  color: string;
  rig: RigWeapon;
  swings: WeaponSwing[];
  throw: WeaponThrow;
  /**
   * An axe or a shovel: its swings and its throw carry `hit.chop`, which is what cuts through Earth's Away's roots
   * (content/enemies/koopaEarth.ts). Every other target ignores the flag.
   */
  chop?: boolean;
  /**
   * The `{ attack1..N }` table built from `swings`, and the shortest reach in the chain. Both are filled in by the
   * loop under the table below, so both are always present by the time anything reads a weapon; they are optional
   * only because the table is AUTHORED without them.
   */
  anims?: AnimSet;
  reach?: number;
}

const THROW_HALBERD: WeaponThrow = { speed: 7, vy: 1.5, gravity: 0.25, damage: 22, type: 'knockdown', kbX: 5, kbY: 5, hitstun: 24, pierce: 0, maxDist: 200, spin: 0 };
const THROW_CUTLASS: WeaponThrow = { speed: 10, vy: 1, gravity: 0.2, damage: 14, type: 'heavy', kbX: 4, kbY: 0, hitstun: 22, pierce: 1, maxDist: 260, spin: 0.5 };
const THROW_LIMERAKE: WeaponThrow = { speed: 6, vy: 5, gravity: 0.45, damage: 12, type: 'knockdown', kbX: 3, kbY: 4, hitstun: 20, pierce: 0, maxDist: 220, spin: 0.2, patch: { life: 150, r: 34, mult: 0.5, frames: 30 } };

const table: Record<string, WeaponDef> = {
  halberd: {
    id: 'halberd', name: 'HALBERD', hits: 12, color: '#9EB5D3', chop: true,
    rig: { attach: 'handR', length: 58, draw: drawHalberd, headAt: 44 },
    swings: [
      { style: 'thrust', startup: 8, active: 4, recovery: 12, reach: 62, dmg: 12, type: 'medium', kbX: 3, hitstun: 20, sfx: 'whiff' },
      { style: 'swing', startup: 8, active: 4, recovery: 12, reach: 58, dmg: 12, type: 'medium', kbX: 3, hitstun: 20, sfx: 'hammer_swing', smear: SM_SWING },
      { style: 'swing', low: true, startup: 10, active: 5, recovery: 16, reach: 60, dmg: 16, type: 'knockdown', kbX: 5, kbY: 4, hitstun: 22, sfx: 'hammer_swing', smear: SM_LOW },
    ],
    throw: THROW_HALBERD,
  },
  cutlass: {
    id: 'cutlass', name: 'CUTLASS', hits: 15, color: '#9EB5D3',
    rig: { attach: 'handR', length: 42, draw: drawCorsairCutlass, headAt: 30 },
    swings: [
      { style: 'swing', startup: 3, active: 3, recovery: 7, reach: 34, dmg: 7, type: 'light', kbX: 2, hitstun: 22, sfx: 'rapier', smear: SM_SWING },
      { style: 'backhand', startup: 3, active: 3, recovery: 7, reach: 34, dmg: 7, type: 'light', kbX: 2, hitstun: 22, sfx: 'rapier', smear: SM_BACK },
      { style: 'swing', startup: 4, active: 3, recovery: 10, reach: 38, dmg: 9, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 22, sfx: 'rapier_arc', smear: SM_SWING },
    ],
    throw: THROW_CUTLASS,
  },
  limerake: {
    id: 'limerake', name: 'LIME RAKE', hits: 10, color: '#B8C0C4', chop: true,
    rig: { attach: 'handR', length: 44, draw: drawShovel, headAt: 32 },
    swings: [
      { style: 'swing', startup: 6, active: 4, recovery: 10, reach: 46, dmg: 9, type: 'medium', kbX: 3, hitstun: 18, status: { burn: { frames: 40, every: 20, damage: 2 } }, sfx: 'whiff', smear: SM_SWING },
      { style: 'slam', startup: 8, active: 4, recovery: 14, reach: 48, dmg: 12, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 20, status: { burn: { frames: 40, every: 20, damage: 2 } }, sfx: 'hammer_swing', smear: SM_SLAM },
    ],
    throw: THROW_LIMERAKE,
  },
  sabre: {
    id: 'sabre', name: 'DUELLING SABRE', hits: 8, color: '#DDE6EE',
    rig: { attach: 'handR', length: 44, draw: drawRapier, headAt: 30 },
    swings: [
      { style: 'thrust', startup: 4, active: 3, recovery: 8, reach: 48, dmg: 14, type: 'medium', kbX: 3, hitstun: 18, sfx: 'rapier' },
      { style: 'thrust', startup: 4, active: 3, recovery: 8, reach: 48, dmg: 14, type: 'medium', kbX: 3, hitstun: 18, sfx: 'rapier' },
      { style: 'thrust', startup: 5, active: 4, recovery: 12, reach: 52, dmg: 18, type: 'knockdown', kbX: 5, kbY: 4, hitstun: 22, sfx: 'rapier_arc' },
    ],
    throw: { ...THROW_CUTLASS, damage: 18 },
  },
  // The Koopa Trio's Tin Man drops these two when he falls (content/enemies/koopaTin.ts): an axe and a shovel with
  // claws on its lip, both `chop` — the heroes' way through Earth's Away.
  tinaxe: {
    id: 'tinaxe', name: 'TIN AXE', hits: 10, color: '#C9D3DA', chop: true,
    rig: { attach: 'handR', length: 46, draw: drawTinAxe, headAt: 42 },
    swings: [
      { style: 'swing', startup: 7, active: 4, recovery: 12, reach: 52, dmg: 13, type: 'medium', kbX: 3, hitstun: 20, sfx: 'hammer_swing', smear: SM_SWING },
      { style: 'slam', startup: 10, active: 4, recovery: 16, reach: 54, dmg: 19, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 22, sfx: 'hammer_slam', smear: SM_SLAM },
    ],
    throw: { ...THROW_HALBERD, damage: 20, spin: 0.6, maxDist: 220 },
  },
  clawshovel: {
    id: 'clawshovel', name: 'CLAW SHOVEL', hits: 10, color: '#C9D3DA', chop: true,
    rig: { attach: 'handR', length: 44, draw: drawClawShovel, headAt: 38 },
    swings: [
      { style: 'thrust', startup: 6, active: 4, recovery: 10, reach: 50, dmg: 11, type: 'medium', kbX: 3, hitstun: 18, sfx: 'whiff' },
      { style: 'swing', low: true, startup: 8, active: 5, recovery: 14, reach: 50, dmg: 15, type: 'launch', kbX: 3, kbY: 6, hitstun: 22, sfx: 'whip', smear: SM_LOW },
    ],
    throw: { ...THROW_LIMERAKE, damage: 14, patch: undefined },
  },
};
for (const w of Object.values(table)) {
  w.anims = anims(w.swings, !!w.chop);
  w.reach = Math.min(...w.swings.map((s) => s.reach));
}
/** The pickup weapon defs, keyed by id (game/items.js WeaponPickup, game/player.js wield/drop/break). */
export const WEAPONS: Readonly<Record<string, WeaponDef>> = Object.freeze(table);

/** Bot weapon-seeking tuning (game/bot.js) and player-drop behaviour (game/player.js). */
export const WEAPON_SEEK_DIST = 140, WEAPON_SEEK_SAFE_X = 110, WEAPON_SEEK_SAFE_Z = 40;
export const WEAPON_DROP_VX = 1.5, WEAPON_DROP_GRACE = 20;

/**
 * Closest weapon pickup within `maxDist` (Manhattan, z weighted), inside the camera view and the floor band, and
 * past its collection grace. Returns null when there is none. No allocation (game/bot.js calls this every frame).
 */
export function nearestWeaponPickup(world, x, z, maxDist = WEAPON_SEEK_DIST) {
  let best = null, bestD = maxDist;
  for (const e of world.entities) {
    if (e.kind !== 'item' || !e.weaponId || e.removeMe || e.grace > 0) continue;
    if (e.z < world.floorBand.z0 || e.z > world.floorBand.z1) continue;
    if (e.x <= world.camera.x + 16 || e.x >= world.camera.x + VIEW_W - 16) continue;
    const d = Math.abs(e.x - x) + Math.abs(e.z - z) * 1.5;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** Four gallery cells (one hero per weapon) proving the held swing poses; spread into game.galleryRegistry by main.js. */
export function weaponGalleryEntries(characters) {
  return Object.values(WEAPONS).map((w, i) => {
    const c = characters[i % characters.length];
    return { id: c.id + ':' + w.id, name: c.name + ' + ' + w.name, build: { ...c.build, weapon: w.rig }, anims: { ...c.anims, ...w.anims } };
  });
}
