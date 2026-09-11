// Pickup weapons (issue #20, GDD section 7): the four enemy-dropped weapons a player may wield for a handful of
// swings before they shatter. This module is data + a small swing builder; it owns no sim state (that lives on
// Player, game/player.js) and no entity (WeaponPickup lives in game/items.js). It must never import items.js or
// player.js (items.js imports this module and player.js imports both; importing either back would form a cycle).
import { strike } from '../art/animLib.js';
import { drawCorsairCutlass } from '../art/weapons.js';
import { drawHalberd, drawRapier } from '../content/enemies/brassbound.js';
import { drawShovel } from '../content/enemies/chandler.js';
import { VIEW_W } from '../constants.js';

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
function swing(s, last) {
  const a = strike({
    style: s.style, startup: s.startup, active: s.active, recovery: s.recovery, ret: 4, carry: WEAPON_CARRY,
    reach: s.reach, low: s.low, sfx: s.sfx,
    fx: [{ kind: 'slash', x: s.reach - 12, y: s.low ? 14 : 40, radius: 30, angle: s.low ? 30 : 10 }],
    hit: { damage: s.dmg, type: s.type, kbX: s.kbX, kbY: s.kbY || 0, hitstun: s.hitstun, status: s.status, weapon: true },
    cancel: last ? 'any' : 'attack',
  });
  if (s.smear) a.frames[1].smear = s.smear;
  return a;
}
/** Build a weapon's { attack1..N } table from its `swings` list; the last swing chain-cancels into anything. */
function anims(swings) {
  const t = {};
  swings.forEach((s, i) => { t['attack' + (i + 1)] = swing(s, i === swings.length - 1); });
  return t;
}

// `rig` is exactly the build.weapon shape art/rig.js draws in hand space ({ attach, length, draw, headAt }).
// `status.burn` uses the record shape of STATUS_DEFAULTS.burn (game/status.js). sfx names (whiff, hammer_swing,
// rapier, rapier_arc) all exist in src/engine/audio/sfx.js.
const table = {
  halberd: {
    id: 'halberd', name: 'HALBERD', hits: 12, color: '#9EB5D3',
    rig: { attach: 'handR', length: 58, draw: drawHalberd, headAt: 44 },
    swings: [
      { style: 'thrust', startup: 8, active: 4, recovery: 12, reach: 62, dmg: 12, type: 'medium', kbX: 3, hitstun: 20, sfx: 'whiff' },
      { style: 'swing', startup: 8, active: 4, recovery: 12, reach: 58, dmg: 12, type: 'medium', kbX: 3, hitstun: 20, sfx: 'hammer_swing', smear: SM_SWING },
      { style: 'swing', low: true, startup: 10, active: 5, recovery: 16, reach: 60, dmg: 16, type: 'knockdown', kbX: 5, kbY: 4, hitstun: 22, sfx: 'hammer_swing', smear: SM_LOW },
    ],
  },
  cutlass: {
    id: 'cutlass', name: 'CUTLASS', hits: 15, color: '#9EB5D3',
    rig: { attach: 'handR', length: 42, draw: drawCorsairCutlass, headAt: 30 },
    swings: [
      { style: 'swing', startup: 3, active: 3, recovery: 7, reach: 34, dmg: 7, type: 'light', kbX: 2, hitstun: 22, sfx: 'rapier', smear: SM_SWING },
      { style: 'backhand', startup: 3, active: 3, recovery: 7, reach: 34, dmg: 7, type: 'light', kbX: 2, hitstun: 22, sfx: 'rapier', smear: SM_BACK },
      { style: 'swing', startup: 4, active: 3, recovery: 10, reach: 38, dmg: 9, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 22, sfx: 'rapier_arc', smear: SM_SWING },
    ],
  },
  limerake: {
    id: 'limerake', name: 'LIME RAKE', hits: 10, color: '#B8C0C4',
    rig: { attach: 'handR', length: 44, draw: drawShovel, headAt: 32 },
    swings: [
      { style: 'swing', startup: 6, active: 4, recovery: 10, reach: 46, dmg: 9, type: 'medium', kbX: 3, hitstun: 18, status: { burn: { frames: 40, every: 20, damage: 2 } }, sfx: 'whiff', smear: SM_SWING },
      { style: 'slam', startup: 8, active: 4, recovery: 14, reach: 48, dmg: 12, type: 'knockdown', kbX: 4, kbY: 4, hitstun: 20, status: { burn: { frames: 40, every: 20, damage: 2 } }, sfx: 'hammer_swing', smear: SM_SLAM },
    ],
  },
  sabre: {
    id: 'sabre', name: 'DUELLING SABRE', hits: 8, color: '#DDE6EE',
    rig: { attach: 'handR', length: 44, draw: drawRapier, headAt: 30 },
    swings: [
      { style: 'thrust', startup: 4, active: 3, recovery: 8, reach: 48, dmg: 14, type: 'medium', kbX: 3, hitstun: 18, sfx: 'rapier' },
      { style: 'thrust', startup: 4, active: 3, recovery: 8, reach: 48, dmg: 14, type: 'medium', kbX: 3, hitstun: 18, sfx: 'rapier' },
      { style: 'thrust', startup: 5, active: 4, recovery: 12, reach: 52, dmg: 18, type: 'knockdown', kbX: 5, kbY: 4, hitstun: 22, sfx: 'rapier_arc' },
    ],
  },
};
for (const w of Object.values(table)) {
  w.anims = anims(w.swings);
  w.reach = Math.min(...w.swings.map((s) => s.reach));
}
/** The four pickup weapon defs, keyed by id (game/items.js WeaponPickup, game/player.js wield/drop/break). */
export const WEAPONS = Object.freeze(table);

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
