// Breakable / static prop renderers (GDD section 6 props). Pure draw hooks + size/hp data; game/items.js Prop uses them.
// Every entry: { w, h, hp (0 = static, never a hit target), drops (default pickup alias), draw(ctx, sx, sy, prop, frame), explode? }.
import { rrect, circle, gear, line, pathPoly, paint } from './shapes.js';

const OL = '#2B2B30';
const BRASS = '#C9963A', IRON = '#3A3F4B', WOOD = '#9a7040', WOOD_DARK = '#5a3a20';

function crate(ctx, sx, sy, p) {
  const w = p.w, h = p.h, f = p.flashTimer ? '#ffffff' : WOOD;
  rrect(ctx, sx - w / 2, sy - h, w, h, 2, f, OL, 2);
  ctx.strokeStyle = p.flashTimer ? '#ffffff' : WOOD_DARK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx - w / 2 + 3, sy - h + 3); ctx.lineTo(sx + w / 2 - 3, sy - 3); ctx.moveTo(sx + w / 2 - 3, sy - h + 3); ctx.lineTo(sx - w / 2 + 3, sy - 3); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(sx - w / 2 + 2, sy - h / 2, w - 4, h / 2 - 2);
}
function barrel(ctx, sx, sy, p) {
  const w = p.w, h = p.h, f = p.flashTimer ? '#ffffff' : '#7a5230';
  rrect(ctx, sx - w / 2, sy - h, w, h, 5, f, OL, 2);
  ctx.fillStyle = p.flashTimer ? '#ffffff' : '#8a5a1c'; ctx.fillRect(sx - w / 2 + 1, sy - h + 5, w - 2, 3); ctx.fillRect(sx - w / 2 + 1, sy - 8, w - 2, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx + 2, sy - h + 2, w / 2 - 3, h - 4);
}
function winch(ctx, sx, sy, p, frame) {
  const f = p.flashTimer ? '#ffffff' : IRON;
  rrect(ctx, sx - 14, sy - 10, 28, 10, 2, f, OL, 2);
  gear(ctx, sx, sy - 20, 11, 9, p.flashTimer ? '#ffffff' : BRASS, OL, 2, frame * 0.01, 4, '#5a3a20');
  line(ctx, sx - 12, sy - 20, sx - 30, sy - 40, '#5a5a62', 2);
}
function mold(ctx, sx, sy, p) {
  const f = p.flashTimer ? '#ffffff' : '#4a4e58';
  pathPoly(ctx, [sx - 18, sy, sx + 18, sy, sx + 14, sy - 12, sx - 14, sy - 12]); paint(ctx, f, OL, 2);
  ctx.fillStyle = p.flashTimer ? '#ffffff' : '#ff8a2a'; ctx.fillRect(sx - 10, sy - 10, 20, 4);
  ctx.fillStyle = 'rgba(255,220,120,0.6)'; ctx.fillRect(sx - 8, sy - 10, 6, 2);
}
function cart(ctx, sx, sy, p) {
  const f = p.flashTimer ? '#ffffff' : IRON;
  rrect(ctx, sx - 18, sy - 22, 36, 16, 2, f, OL, 2);
  ctx.fillStyle = p.flashTimer ? '#ffffff' : '#1a1418'; for (let i = 0; i < 5; i++) circle(ctx, sx - 12 + i * 6, sy - 24, 3, '#1a1418', OL, 1);
  circle(ctx, sx - 10, sy - 4, 5, '#5a5a62', OL, 2); circle(ctx, sx + 10, sy - 4, 5, '#5a5a62', OL, 2);
}
function drum(ctx, sx, sy, p) {
  const f = p.flashTimer ? '#ffffff' : '#8a2e2e';
  rrect(ctx, sx - 11, sy - 30, 22, 30, 3, f, OL, 2);
  ctx.fillStyle = p.flashTimer ? '#ffffff' : '#c8c0a0'; ctx.fillRect(sx - 9, sy - 26, 18, 3); ctx.fillRect(sx - 9, sy - 10, 18, 3);
  ctx.fillStyle = '#ffe070'; ctx.fillRect(sx - 4, sy - 21, 8, 8); ctx.fillStyle = OL; ctx.fillRect(sx - 1, sy - 19, 2, 4);
}
function displayCase(ctx, sx, sy, p, frame) {
  rrect(ctx, sx - 12, sy - 34, 24, 34, 2, p.flashTimer ? '#ffffff' : '#5a3a20', OL, 2);
  rrect(ctx, sx - 9, sy - 31, 18, 20, 1, 'rgba(160,220,240,0.45)', BRASS, 1);
  gear(ctx, sx, sy - 21, 6, 8, '#ffd84a', OL, 1, frame * 0.03, 2, '#fff4b0');
}
function bucket(ctx, sx, sy, p) {
  line(ctx, sx, sy - 60, sx, sy - 30, '#5a5a62', 2);
  pathPoly(ctx, [sx - 11, sy - 30, sx + 11, sy - 30, sx + 8, sy - 10, sx - 8, sy - 10]); paint(ctx, p.flashTimer ? '#ffffff' : '#6a6a72', OL, 2);
  ctx.fillStyle = '#c26a2a'; ctx.fillRect(sx - 6, sy - 32, 12, 4);
}
function trunk(ctx, sx, sy, p) {
  const f = p.flashTimer ? '#ffffff' : '#6a3a2a';
  rrect(ctx, sx - 16, sy - 20, 32, 20, 3, f, OL, 2);
  ctx.fillStyle = p.flashTimer ? '#ffffff' : BRASS; ctx.fillRect(sx - 14, sy - 12, 28, 2); ctx.fillRect(sx - 3, sy - 15, 6, 6);
}
function mailCart(ctx, sx, sy, p) {
  rrect(ctx, sx - 16, sy - 26, 32, 18, 2, p.flashTimer ? '#ffffff' : '#7a4a2e', OL, 2);
  rrect(ctx, sx - 10, sy - 34, 20, 10, 5, p.flashTimer ? '#ffffff' : '#c8b070', OL, 2);
  circle(ctx, sx - 9, sy - 4, 5, '#3a3a44', OL, 2); circle(ctx, sx + 9, sy - 4, 5, '#3a3a44', OL, 2);
}
function lantern(ctx, sx, sy, p, frame) {
  line(ctx, sx, sy, sx, sy - 44, p.flashTimer ? '#ffffff' : IRON, 4);
  rrect(ctx, sx - 6, sy - 56, 12, 14, 2, p.flashTimer ? '#ffffff' : BRASS, OL, 2);
  ctx.globalAlpha = 0.5 + 0.2 * Math.sin(frame * 0.2); ctx.fillStyle = '#ffd070'; ctx.fillRect(sx - 4, sy - 54, 8, 10); ctx.globalAlpha = 1;
}
function urn(ctx, sx, sy, p) {
  const f = p.flashTimer ? '#ffffff' : '#8a6a40';
  pathPoly(ctx, [sx - 6, sy - 32, sx + 6, sy - 32, sx + 12, sy - 20, sx + 9, sy, sx - 9, sy, sx - 12, sy - 20]); paint(ctx, f, OL, 2);
  ctx.fillStyle = p.flashTimer ? '#ffffff' : BRASS; ctx.fillRect(sx - 10, sy - 22, 20, 3);
}
function cabinet(ctx, sx, sy, p) {
  rrect(ctx, sx - 14, sy - 40, 28, 40, 2, p.flashTimer ? '#ffffff' : '#3B3A46', OL, 2);
  rrect(ctx, sx - 11, sy - 37, 10, 34, 1, '#5B2A86', OL, 1); rrect(ctx, sx + 1, sy - 37, 10, 34, 1, '#5B2A86', OL, 1);
  ctx.fillStyle = BRASS; ctx.fillRect(sx - 3, sy - 22, 2, 4); ctx.fillRect(sx + 1, sy - 22, 2, 4);
}
function valve(ctx, sx, sy, p, frame) {
  line(ctx, sx, sy, sx, sy - 30, p.flashTimer ? '#ffffff' : BRASS, 6);
  gear(ctx, sx, sy - 36, 10, 6, p.flashTimer ? '#ffffff' : '#c02020', OL, 2, frame * 0.005, 3);
  circle(ctx, sx + 12, sy - 22, 4, '#e8e8e0', OL, 1); line(ctx, sx + 12, sy - 22, sx + 14, sy - 25, '#c02020', 1);
}

/** Prop catalogue. `explode` props detonate `explode.delay` frames after breaking (oil drums). */
export const PROP_TYPES = {
  crate: { w: 28, h: 24, hp: 20, drops: 'brassCog', draw: crate, color: WOOD },
  barrel: { w: 22, h: 30, hp: 24, drops: 'coalScrip', draw: barrel, color: '#6a4a30' },
  winch: { w: 30, h: 40, hp: 40, drops: 'aetherVial', draw: winch, color: '#5a5a62' },
  mold: { w: 36, h: 14, hp: 30, drops: 'brassCog', draw: mold, color: '#4a4e58' },
  cart: { w: 36, h: 28, hp: 40, drops: 'meatPie', draw: cart, color: '#3a3f4b' },
  drum: { w: 22, h: 30, hp: 20, drops: 'aetherVial', draw: drum, color: '#8a2e2e', explode: { delay: 30, radius: 40, damage: 20 } },
  case: { w: 24, h: 34, hp: 30, drops: 'goldenSprocket', draw: displayCase, color: '#5a3a20' },
  bucket: { w: 22, h: 24, hp: 16, drops: 'roastBird', draw: bucket, color: '#6a6a72' },
  trunk: { w: 32, h: 20, hp: 24, drops: 'meatPie', draw: trunk, color: '#6a3a2a' },
  mailcart: { w: 32, h: 34, hp: 36, drops: 'goldenSprocket', draw: mailCart, color: '#7a4a2e' },
  lantern: { w: 12, h: 56, hp: 16, drops: 'coalScrip', draw: lantern, color: '#3a3f4b' },
  urn: { w: 24, h: 32, hp: 20, drops: 'meatPie', draw: urn, color: '#8a6a40' },
  cabinet: { w: 28, h: 40, hp: 40, drops: 'goldenSprocket', draw: cabinet, color: '#3B3A46' },
  valve: { w: 20, h: 40, hp: 30, drops: 'aetherVial', draw: valve, color: BRASS },
};

/** Look up a prop type (falls back to crate). */
export function getPropType(type) { return PROP_TYPES[type] || PROP_TYPES.crate; }
