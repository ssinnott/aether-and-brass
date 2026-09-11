// Pickup weapons (issue #20): art shared across the four enemy-dropped weapons — the corsair's cutlass (a new
// hand-space draw; the Line Corsair carries a harpoon gun, and Rook's drawCutlass in rook.js is hero art in his own
// palette), the on-floor render used by WeaponPickup (game/items.js), and the HUD icon + durability pips
// (game/hud.js). drawHalberd / drawRapier (content/enemies/brassbound.js) and drawShovel
// (content/enemies/chandler.js) are reused as-is for the other three weapons' hand-space draw and are not repeated
// here.
import { celRect, celPoly, celBall, tones } from './shading.js';
import { buildRig, setLight } from './rig.js';
import { DEFAULT_POSE } from './poses.js';
import { pathPoly, paint, circle } from './shapes.js';
import { UI } from '../constants.js';

const OL = '#2B2B30', STEEL = '#9EB5D3', BRASS = '#C89B3C', GRIP = '#4A3020', SLAB = '#B8C0C4', PIP_ON = UI.brass, PIP_OFF = '#3a2a1c';
/** Held-weapon HUD icon cell size and durability pip geometry (game/hud.js). */
export const WPN_ICON_W = 14, WPN_ICON_H = 8, PIP_W = 2, PIP_H = 4, PIP_PITCH = 3, FLOOR_ANGLE = -0.35;

// Point lists, module-level: ART_STYLE section 9 forbids allocating inside a draw.
const CUTLASS_BLADE = [8, -2, 30, -4, 40, -8, 42, -3, 34, 2, 8, 2];
const ICON_HALBERD_HEAD = [8, 0, 13, 1, 13, 7, 9, 6, 9, 2];
const ICON_CUTLASS_BLADE = [5, 5, 9, 1, 13, 0, 13, 3, 8, 6, 5, 7];
const ICON_RAKE_HEAD = [8, 0, 13, 0, 13, 8, 8, 8];

/** Line Corsair's dropped cutlass: hand space, +x along the blade, 42 px overall. */
export function drawCorsairCutlass(ctx, rig) {
  celRect(ctx, rig, -6, -2, 12, 4, 1, GRIP, 0.4, 0);
  celBall(ctx, rig, 6, 0, 3.5, BRASS, false);
  celPoly(ctx, rig, CUTLASS_BLADE, STEEL, 0.36, 0.3);
  if (rig.override) return;
  // 2 px edge highlight: the blade's half-extent is under hiMin, so this is the only light mark (ART_STYLE 0.7).
  ctx.fillStyle = rig.col(tones(rig, STEEL).hi);
  ctx.fillRect(10, -3, 22, 2);
}

/** Module-level rig used only to draw a held weapon lying flat on the floor (WeaponPickup.draw, game/items.js). */
const FLOOR_RIG = buildRig({ outline: '#1A1E24', palette: { accent: BRASS, metal: STEEL } });

/** Render a weapon's own hand-space draw lying on the floor, rotated flat, at screen coords (sx, sy). */
export function drawWeaponFloor(ctx, sx, sy, rigWeapon, angle = FLOOR_ANGLE) {
  ctx.save();
  ctx.translate(sx - Math.round(rigWeapon.length * 0.45), sy - 3);
  ctx.rotate(angle);
  setLight(FLOOR_RIG, angle * 180 / Math.PI);
  rigWeapon.draw(ctx, FLOOR_RIG, DEFAULT_POSE);
  setLight(FLOOR_RIG, 0);
  ctx.restore();
}

/** 1 px-outlined fill strip (a grip or blade slab on the HUD icon), like drawLifeIcon in art/portraits.js. */
function strip(ctx, x, y, w, h, fill) {
  ctx.fillStyle = OL; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
}
/** Outlined polygon head shape on the HUD icon at absolute (x, y); pathPoly wants absolute coordinates (shapes.js). */
function head(ctx, x, y, pts, fill) {
  ctx.save();
  ctx.translate(x, y);
  pathPoly(ctx, pts);
  paint(ctx, fill, OL, 1);
  ctx.restore();
}

/** 14x8 HUD icon for a held pickup weapon (game/hud.js). */
export function drawWeaponIcon(ctx, id, x, y) {
  switch (id) {
    case 'cutlass':
      strip(ctx, x, y + 3, 3, 2, GRIP);
      strip(ctx, x + 3, y + 2, 2, 4, BRASS);
      head(ctx, x, y, ICON_CUTLASS_BLADE, STEEL);
      break;
    case 'limerake':
      strip(ctx, x, y + 3, 8, 2, GRIP);
      head(ctx, x, y, ICON_RAKE_HEAD, SLAB);
      break;
    case 'sabre':
      strip(ctx, x, y + 3, 12, 2, STEEL);
      circle(ctx, x + 3, y + 4, 2, BRASS, OL, 1);
      break;
    default: // halberd and unknown ids
      strip(ctx, x, y + 3, 9, 2, GRIP);
      head(ctx, x, y, ICON_HALBERD_HEAD, STEEL);
      break;
  }
}

/** Durability pips: one 2x4 pip per hit, lit for the hits remaining. `dir` -1 grows leftwards (P2, game/hud.js). */
export function drawDurabilityPips(ctx, x, y, total, left, dir = 1) {
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < left ? PIP_ON : PIP_OFF;
    ctx.fillRect(dir > 0 ? x + i * PIP_PITCH : x - PIP_W - i * PIP_PITCH, y, PIP_W, PIP_H);
  }
}
