// Breakable / static prop renderers (GDD section 6 props) in the ART_STYLE look: 1px near-black outline, three flat tones
// per material (highlight cap on the lit top/left edge, shadow band on the lower ~35%), integer coordinates.
// Pure draw hooks + size/hp data; game/items.js `Prop` owns the state (idle / rolling / breaking / fuse / falling).
// Every entry: { w, h, hp, drops, draw(ctx, sx, sy, prop, frame), color, yOff?, roll?, rollHit?, explode?, jumpOnly?, valve?,
//   release?, dump?, fire?, puff?, pieces?(ctx, sx, sy, prop, t) } — the behaviour fields are read by items.js (see PROP_TYPES).
import { rrect, circle, gear, line, pathPoly, paint } from './shapes.js';

const OL = '#2B2B30';
const BRASS = '#C9963A', IRON = '#3A3F4B', WOOD = '#9a7040', COPPER = '#B87333', GLOW = '#FFB347';
const RAMP = { hi: 1.22, sh: 0.66 };
const toneCache = new Map();
/** Three-tone ramp for a hex colour (cached): { hi, base, sh }. Shadows drift cool, highlights warm. */
export function tones(hex) {
  let t = toneCache.get(hex);
  if (t) return t;
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mk = (kr, kg, kb) => '#' + [r * kr, g * kg, b * kb].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  t = { hi: mk(RAMP.hi, RAMP.hi * 0.98, RAMP.hi * 0.9), base: hex, sh: mk(RAMP.sh, RAMP.sh * 0.98, RAMP.sh * 1.15) };
  toneCache.set(hex, t);
  return t;
}
let flash = false;
/** Colour through the hit-flash: white while the prop flashes. */
const C = (hex) => (flash ? '#ffffff' : hex);

/** Outlined box with a highlight cap (top + left 1px) and a shadow band on the lower `band` fraction. */
function box(ctx, x, y, w, h, hex, r = 1, band = 0.35) {
  const t = tones(hex);
  rrect(ctx, x, y, w, h, r, C(t.base), OL, 1);
  if (flash) return;
  ctx.fillStyle = t.sh; ctx.fillRect(x + 1, y + h - Math.round(h * band), w - 2, Math.round(h * band) - 1);
  ctx.fillStyle = t.hi; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2);
}
/** Upright cylinder (barrel / drum): shadow on the right third, highlight stripe on the left. */
function cyl(ctx, x, y, w, h, hex, r = 4) {
  const t = tones(hex);
  rrect(ctx, x, y, w, h, r, C(t.base), OL, 1);
  if (flash) return;
  ctx.fillStyle = t.sh; ctx.fillRect(x + w - Math.round(w * 0.32), y + 2, Math.round(w * 0.32) - 1, h - 4);
  ctx.fillStyle = t.hi; ctx.fillRect(x + 2, y + 2, 2, h - 4);
}
/** Outlined polygon with an optional flat shadow polygon. */
function poly(ctx, pts, hex, shadowPts = null) {
  const t = tones(hex);
  pathPoly(ctx, pts); paint(ctx, C(t.base), OL, 1);
  if (flash || !shadowPts) return;
  pathPoly(ctx, shadowPts); paint(ctx, t.sh, null, 0);
}
/** Flat detail fill (no ramp). */
function flat(ctx, x, y, w, h, hex) { ctx.fillStyle = C(hex); ctx.fillRect(x, y, w, h); }
function rivets(ctx, x0, y, x1, step, hex = BRASS) { ctx.fillStyle = C(tones(hex).hi); for (let x = x0; x <= x1; x += step) ctx.fillRect(x, y, 1, 1); }
function glow(ctx, x, y, w, h, hex, a) { ctx.globalAlpha = a; ctx.fillStyle = hex; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; }

// ---------------------------------------------------------------- Section 1: Sootfoot Docks
function crate(ctx, sx, sy, p) {
  const w = p.w, h = p.h, x = sx - w / 2, y = sy - h;
  box(ctx, x, y, w, h, WOOD, 2);
  if (flash) return;
  const t = tones(WOOD);
  // plank seams + diagonal brace + corner irons
  ctx.fillStyle = t.sh; ctx.fillRect(x + 2, y + Math.round(h / 3), w - 4, 1); ctx.fillRect(x + 2, y + Math.round(h * 2 / 3), w - 4, 1);
  ctx.strokeStyle = t.sh; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + h - 4); ctx.stroke();
  ctx.strokeStyle = t.hi; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 4, y + 3); ctx.lineTo(x + w - 5, y + h - 5); ctx.stroke();
  ctx.fillStyle = IRON; ctx.fillRect(x + 1, y + 1, 4, 4); ctx.fillRect(x + w - 5, y + 1, 4, 4); ctx.fillRect(x + 1, y + h - 5, 4, 4); ctx.fillRect(x + w - 5, y + h - 5, 4, 4);
  rivets(ctx, x + 2, y + 2, x + w - 4, w - 6);
}
function barrel(ctx, sx, sy, p) {
  const w = p.w, h = p.h, x = sx - w / 2, y = sy - h;
  ctx.save();
  if (p.angle) { ctx.translate(sx, sy - h / 2); ctx.rotate(p.angle); ctx.translate(-sx, -(sy - h / 2)); }
  cyl(ctx, x, y, w, h, '#7a5230', 5);
  if (!flash) {
    // hoops (brass, riveted) top and bottom, bung hole
    flat(ctx, x + 1, y + 5, w - 2, 3, tones(BRASS).base); flat(ctx, x + 1, y + h - 8, w - 2, 3, tones(BRASS).base);
    flat(ctx, x + 1, y + 5, w - 2, 1, tones(BRASS).hi); flat(ctx, x + 1, y + h - 8, w - 2, 1, tones(BRASS).hi);
    ctx.fillStyle = tones('#7a5230').sh; ctx.fillRect(x + Math.round(w / 2) - 1, y + 10, 2, h - 20);
    ctx.fillStyle = OL; ctx.fillRect(x + Math.round(w / 2) - 2, y + Math.round(h / 2) - 1, 4, 3);
  }
  ctx.restore();
}
function winch(ctx, sx, sy, p, frame) {
  // A-frame base, cable drum, crank handle, chain running up-left to the mooring gantry.
  box(ctx, sx - 22, sy - 10, 44, 10, IRON, 2);
  poly(ctx, [sx - 16, sy - 10, sx - 8, sy - 36, sx + 8, sy - 36, sx + 16, sy - 10], '#4a5563', [sx - 8, sy - 26, sx + 8, sy - 26, sx + 12, sy - 12, sx - 12, sy - 12]);
  const spin = p.state === 'rolling' ? frame * 0.3 : frame * 0.01;
  gear(ctx, sx, sy - 24, 12, 10, C(tones(BRASS).base), OL, 1, spin, 4, C('#5a3a20'));
  if (flash) return;
  ctx.fillStyle = tones(BRASS).hi; ctx.fillRect(sx - 4, sy - 33, 8, 1);
  line(ctx, sx + 10, sy - 24, sx + 20, sy - 34, '#3A3F4B', 3); circle(ctx, sx + 20, sy - 34, 3, tones(BRASS).base, OL, 1);
  ctx.strokeStyle = '#5a5a62'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - 10, sy - 26); ctx.lineTo(sx - 40, sy - 70); ctx.stroke();
  ctx.fillStyle = '#9a9aa4'; for (let i = 0; i < 6; i++) ctx.fillRect(sx - 12 - i * 5, sy - 29 - i * 7, 2, 2);
}

// ---------------------------------------------------------------- Section 2: Foundry Row
function mold(ctx, sx, sy, p, frame) {
  // ingot mould trough with a glowing bar inside (light pulses)
  poly(ctx, [sx - 22, sy, sx + 22, sy, sx + 17, sy - 16, sx - 17, sy - 16], '#4a4e58', [sx - 21, sy - 1, sx + 21, sy - 1, sx + 20, sy - 6, sx - 20, sy - 6]);
  if (flash) return;
  ctx.fillStyle = tones('#4a4e58').hi; ctx.fillRect(sx - 16, sy - 15, 32, 1);
  const k = 0.6 + 0.4 * Math.sin(frame * 0.12);
  flat(ctx, sx - 12, sy - 13, 24, 6, '#ff7a1f'); flat(ctx, sx - 10, sy - 13, 12, 2, '#FFD27A');
  glow(ctx, sx - 16, sy - 20, 32, 14, GLOW, 0.18 * k);
  ctx.fillStyle = IRON; ctx.fillRect(sx - 20, sy - 4, 40, 1);
}
function cart(ctx, sx, sy, p) {
  const w = p.w, h = p.h, x = sx - w / 2;
  ctx.save();
  if (p.angle) { ctx.translate(sx, sy - 8); ctx.rotate(p.angle * 0.15); ctx.translate(-sx, -(sy - 8)); }
  // hopper body (tapered), rim, coal lumps, axle + two wheels
  poly(ctx, [x, sy - h + 8, x + w, sy - h + 8, x + w - 6, sy - 8, x + 6, sy - 8], IRON, [x + 5, sy - 18, x + w - 5, sy - 18, x + w - 7, sy - 9, x + 7, sy - 9]);
  if (!flash) {
    flat(ctx, x + 1, sy - h + 8, w - 2, 2, tones(IRON).hi);
    rivets(ctx, x + 4, sy - h + 12, x + w - 5, 8, '#9aa6b2');
    for (let i = 0; i < 6; i++) { const cx = x + 6 + i * ((w - 12) / 5), cy = sy - h + 5 - (i % 2) * 3; circle(ctx, cx, cy, 4, '#1a1418', OL, 1); ctx.fillStyle = '#3a3a44'; ctx.fillRect(cx - 2, cy - 3, 2, 1); }
  }
  const wheel = (cx) => { circle(ctx, cx, sy - 5, 6, C('#5a5a62'), OL, 1); if (!flash) { ctx.fillStyle = tones('#5a5a62').sh; ctx.fillRect(cx - 3, sy - 3, 6, 3); circle(ctx, cx, sy - 5, 2, tones(BRASS).base, OL, 1); } };
  wheel(sx - 14); wheel(sx + 14);
  ctx.restore();
}
function drum(ctx, sx, sy, p, frame) {
  const w = p.w, h = p.h, x = sx - w / 2, y = sy - h;
  if (p.state === 'fuse') {
    // cracked, smoking drum about to blow: dark shell, orange seams pulsing faster as the fuse runs out
    cyl(ctx, x, y + 6, w, h - 6, '#4a2020', 3);
    const k = (Math.sin(p.t * (0.3 + p.t * 0.02)) + 1) / 2;
    glow(ctx, x + 3, y + 10, w - 6, h - 14, '#ff7a1f', 0.35 + 0.5 * k);
    ctx.fillStyle = '#FFD27A'; ctx.fillRect(x + 6, y + 14, 2, h - 24); ctx.fillRect(x + w - 9, y + 20, 2, h - 30);
    return;
  }
  cyl(ctx, x, y, w, h, '#8a2e2e', 3);
  if (flash) return;
  flat(ctx, x + 1, y + 6, w - 2, 3, '#c8c0a0'); flat(ctx, x + 1, y + h - 12, w - 2, 3, '#c8c0a0');
  ctx.fillStyle = tones('#c8c0a0').sh; ctx.fillRect(x + w - 8, y + 6, 6, 3); ctx.fillRect(x + w - 8, y + h - 12, 6, 3);
  // hazard label: yellow plate with a flame mark
  flat(ctx, x + 6, y + 14, w - 12, 12, '#ffe070'); ctx.fillStyle = OL; ctx.fillRect(x + Math.round(w / 2) - 2, y + 17, 4, 6); ctx.fillRect(x + Math.round(w / 2) - 1, y + 15, 2, 3);
  ctx.fillStyle = tones('#8a2e2e').hi; ctx.fillRect(x + 4, y + 2, w - 8, 1);
}
function displayCase(ctx, sx, sy, p, frame) {
  // wooden plinth, glass case with a brass frame, golden sprocket turning inside
  box(ctx, sx - 16, sy - 14, 32, 14, '#5a3a20', 2);
  box(ctx, sx - 14, sy - 46, 28, 32, BRASS, 1, 0.2);
  if (flash) return;
  ctx.fillStyle = 'rgba(160,220,240,0.35)'; ctx.fillRect(sx - 12, sy - 44, 24, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(sx - 11, sy - 43, 3, 24);
  gear(ctx, sx, sy - 30, 7, 8, '#ffd84a', OL, 1, frame * 0.03, 2, '#fff4b0');
  ctx.fillStyle = tones('#5a3a20').hi; ctx.fillRect(sx - 15, sy - 13, 30, 1);
}
function bucket(ctx, sx, sy, p, frame) {
  // hanging bucket on a chain from the gantry: swings gently, the roast inside peeks out
  const sw = Math.sin(frame * 0.05 + p.x * 0.01) * 3, top = sy - 72;
  ctx.strokeStyle = '#5a5a62'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(sx + sw, sy - 34); ctx.stroke();
  ctx.fillStyle = '#9a9aa4'; for (let i = 0; i < 5; i++) ctx.fillRect(sx + Math.round(sw * i / 5) - 1, top + 4 + i * 8, 2, 3);
  const bx = sx + sw;
  ctx.strokeStyle = C('#6a6a72'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, sy - 30, 10, Math.PI, 0); ctx.stroke();
  poly(ctx, [bx - 12, sy - 30, bx + 12, sy - 30, bx + 9, sy - 6, bx - 9, sy - 6], '#6a6a72', [bx + 4, sy - 29, bx + 11, sy - 29, bx + 8, sy - 7, bx + 4, sy - 7]);
  if (flash) return;
  flat(ctx, bx - 11, sy - 29, 22, 2, tones('#6a6a72').hi); flat(ctx, bx - 12, sy - 20, 24, 2, tones(BRASS).base);
  circle(ctx, bx - 2, sy - 32, 5, '#c26a2a', OL, 1); circle(ctx, bx + 5, sy - 36, 2, '#f0e0c0', OL, 1);
}

// ---------------------------------------------------------------- Section 3: The Brass Funicular
function trunk(ctx, sx, sy, p) {
  const w = p.w, h = p.h, x = sx - w / 2, y = sy - h;
  box(ctx, x, y + 6, w, h - 6, '#6a3a2a', 2);
  rrect(ctx, x, y, w, 10, 4, C(tones('#7a4636').base), OL, 1);
  if (flash) return;
  ctx.fillStyle = tones('#7a4636').hi; ctx.fillRect(x + 2, y + 1, w - 4, 1);
  flat(ctx, x + 1, y + 9, w - 2, 2, tones(BRASS).base); flat(ctx, x + 5, y + 2, 3, h - 4, tones(BRASS).sh); flat(ctx, x + w - 8, y + 2, 3, h - 4, tones(BRASS).sh);
  rrect(ctx, sx - 4, y + 7, 8, 7, 1, tones(BRASS).base, OL, 1); ctx.fillStyle = OL; ctx.fillRect(sx - 1, y + 10, 2, 2);
  ctx.fillStyle = '#e8d8b0'; ctx.fillRect(x + w - 16, y + 14, 8, 6); ctx.fillStyle = '#c04040'; ctx.fillRect(x + w - 15, y + 15, 6, 1);
}
function mailCart(ctx, sx, sy, p) {
  // hand cart: slatted crate body, mail sacks piled on top, two spoked wheels + push handle
  box(ctx, sx - 18, sy - 30, 36, 20, '#7a4a2e', 2);
  if (!flash) { ctx.fillStyle = tones('#7a4a2e').sh; for (let i = 1; i < 4; i++) ctx.fillRect(sx - 16, sy - 30 + i * 5, 32, 1); }
  rrect(ctx, sx - 12, sy - 40, 14, 12, 5, C(tones('#c8b070').base), OL, 1); rrect(ctx, sx - 2, sy - 42, 14, 14, 5, C(tones('#c8b070').base), OL, 1);
  if (!flash) { ctx.fillStyle = tones('#c8b070').sh; ctx.fillRect(sx - 8, sy - 32, 8, 3); ctx.fillRect(sx + 2, sy - 32, 8, 3); ctx.fillStyle = '#5a3a20'; ctx.fillRect(sx - 8, sy - 38, 6, 1); ctx.fillRect(sx + 2, sy - 40, 6, 1); }
  line(ctx, sx + 18, sy - 28, sx + 26, sy - 44, C(IRON), 3);
  for (const cx of [sx - 10, sx + 10]) { circle(ctx, cx, sy - 6, 7, C('#3a3a44'), OL, 1); if (!flash) { ctx.strokeStyle = '#9aa6b2'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 5, sy - 6); ctx.lineTo(cx + 5, sy - 6); ctx.moveTo(cx, sy - 11); ctx.lineTo(cx, sy - 1); ctx.stroke(); circle(ctx, cx, sy - 6, 2, tones(BRASS).base, OL, 1); } }
}
function lantern(ctx, sx, sy, p, frame) {
  // iron post with a foot plate and a brass lantern head; warm flicker
  box(ctx, sx - 8, sy - 4, 16, 4, IRON, 1);
  box(ctx, sx - 2, sy - 48, 4, 44, IRON, 1, 0);
  if (!flash) { ctx.fillStyle = tones(IRON).sh; ctx.fillRect(sx + 1, sy - 46, 1, 40); }
  box(ctx, sx - 7, sy - 64, 14, 16, BRASS, 2, 0.3);
  poly(ctx, [sx - 8, sy - 64, sx + 8, sy - 64, sx, sy - 70], BRASS);
  if (flash) return;
  const k = 0.55 + 0.25 * Math.sin(frame * 0.2 + p.x);
  glow(ctx, sx - 5, sy - 62, 10, 12, '#ffd070', k); glow(ctx, sx - 12, sy - 70, 24, 28, '#ffb040', 0.12 * k);
  ctx.fillStyle = '#FFD27A'; ctx.fillRect(sx - 1, sy - 58, 2, 4);
}

// ---------------------------------------------------------------- Section 4: The Heart-Engine
function urn(ctx, sx, sy, p) {
  // ceramic urn: flared lip, belly, foot; brass band; a violet gear banner motif
  poly(ctx, [sx - 7, sy - 40, sx + 7, sy - 40, sx + 14, sy - 26, sx + 11, sy - 6, sx + 8, sy, sx - 8, sy, sx - 11, sy - 6, sx - 14, sy - 26],
    '#8a6a40', [sx + 4, sy - 38, sx + 7, sy - 38, sx + 13, sy - 26, sx + 10, sy - 6, sx + 7, sy - 1, sx + 4, sy - 1]);
  if (flash) return;
  rrect(ctx, sx - 9, sy - 44, 18, 5, 1, tones('#8a6a40').hi, OL, 1);
  flat(ctx, sx - 12, sy - 27, 24, 3, tones(BRASS).base); flat(ctx, sx - 12, sy - 27, 24, 1, tones(BRASS).hi);
  ctx.fillStyle = tones('#8a6a40').hi; ctx.fillRect(sx - 9, sy - 22, 2, 12);
  gear(ctx, sx, sy - 16, 4, 6, '#5B2A86', OL, 1, 0, 1.5, '#8a6a40');
}
function cabinet(ctx, sx, sy, p) {
  // tall gothic cabinet: two violet doors with brass handles, pointed cornice
  box(ctx, sx - 17, sy - 48, 34, 48, '#3B3A46', 2);
  poly(ctx, [sx - 19, sy - 48, sx + 19, sy - 48, sx, sy - 56], '#3B3A46');
  if (flash) return;
  rrect(ctx, sx - 14, sy - 44, 12, 38, 1, '#5B2A86', OL, 1); rrect(ctx, sx + 2, sy - 44, 12, 38, 1, '#5B2A86', OL, 1);
  ctx.fillStyle = tones('#5B2A86').hi; ctx.fillRect(sx - 13, sy - 43, 10, 1); ctx.fillRect(sx + 3, sy - 43, 10, 1);
  ctx.fillStyle = tones('#5B2A86').sh; ctx.fillRect(sx - 13, sy - 20, 10, 13); ctx.fillRect(sx + 3, sy - 20, 10, 13);
  flat(ctx, sx - 5, sy - 27, 2, 5, tones(BRASS).base); flat(ctx, sx + 3, sy - 27, 2, 5, tones(BRASS).base);
  poly(ctx, [sx - 10, sy - 40, sx - 6, sy - 40, sx - 8, sy - 34], '#4DF0E0'); poly(ctx, [sx + 6, sy - 40, sx + 10, sy - 40, sx + 8, sy - 34], '#FFB347');
}
function valve(ctx, sx, sy, p, frame) {
  // wall pressure valve: vertical pipe, red hand-wheel, gauge with a needle in the red
  box(ctx, sx - 4, sy - 44, 8, 44, BRASS, 1, 0);
  if (!flash) { ctx.fillStyle = tones(BRASS).sh; ctx.fillRect(sx + 1, sy - 42, 2, 40); ctx.fillStyle = tones(BRASS).hi; ctx.fillRect(sx - 3, sy - 42, 1, 40); }
  box(ctx, sx - 7, sy - 12, 14, 4, IRON, 1); box(ctx, sx - 7, sy - 34, 14, 4, IRON, 1);
  const spin = p.state === 'idle' ? frame * 0.004 : frame * 0.2;
  gear(ctx, sx, sy - 48, 11, 6, C('#c02020'), OL, 1, spin, 4, C(tones(BRASS).base));
  if (flash) return;
  circle(ctx, sx + 14, sy - 26, 5, '#e8e8e0', OL, 1);
  ctx.fillStyle = '#c02020'; ctx.fillRect(sx + 15, sy - 30, 3, 2);
  const a = -0.6 + Math.sin(frame * 0.15) * 0.15; line(ctx, sx + 14, sy - 26, sx + 14 + Math.cos(a) * 4, sy - 26 + Math.sin(a) * 4, OL, 1);
  glow(ctx, sx - 1, sy - 56, 2, 4, '#ffffff', 0.4 + 0.3 * Math.sin(frame * 0.3));
}
function chandelier(ctx, sx, sy, p, frame) {
  // hangs from the vault on a chain; drawn around its own `p.y` (falls after a jump attack)
  const top = sy - 200, cy = sy - p.hangY;
  if (p.state !== 'falling' && p.state !== 'breaking') { ctx.strokeStyle = '#5a5a62'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(sx, cy - 26); ctx.stroke(); ctx.fillStyle = '#9a9aa4'; for (let y = top + 4; y < cy - 28; y += 8) ctx.fillRect(sx - 1, y, 2, 3); }
  ctx.save(); ctx.translate(sx, cy); if (p.state === 'falling') ctx.rotate(Math.sin(p.t * 0.5) * 0.08);
  poly(ctx, [-30, 0, 30, 0, 22, 10, -22, 10], BRASS, [-20, 1, 28, 1, 22, 9, -20, 9]);
  box(ctx, -3, -26, 6, 26, BRASS, 1, 0);
  circle(ctx, 0, -28, 5, C(tones(BRASS).base), OL, 1);
  if (!flash) {
    ctx.fillStyle = tones(BRASS).hi; ctx.fillRect(-28, 1, 56, 1);
    for (let i = -2; i <= 2; i++) {
      const cx = i * 12; flat(ctx, cx - 1, -8, 2, 8, '#F4F1E8');
      const k = 0.6 + 0.4 * Math.sin(frame * 0.25 + i); ctx.fillStyle = '#FFD27A'; ctx.fillRect(cx - 1, -11, 2, 3); glow(ctx, cx - 4, -14, 8, 8, '#ffb040', 0.35 * k);
    }
    ctx.fillStyle = '#4DF0E0'; for (let i = -2; i <= 2; i++) ctx.fillRect(i * 12 - 1, 4, 2, 3);
  }
  ctx.restore();
}

/** Generic break animation: the prop splits into four quads that tumble outward (t in 0..1). */
export function drawPieces(ctx, sx, sy, p, t) {
  const info = p.info, hex = info.color || WOOD, tn = tones(hex), w = p.w, h = p.h;
  const e = t * (2 - t);
  ctx.globalAlpha = 1 - t * t;
  for (let i = 0; i < 4; i++) {
    const dx = (i % 2 ? 1 : -1) * (w * 0.3 + e * 22), dy = -h * 0.5 - (i < 2 ? 1 : 0.4) * e * 26 + t * t * 40, rot = (i % 2 ? 1 : -1) * e * 1.6 + i;
    ctx.save(); ctx.translate(sx + dx, sy + dy + (i < 2 ? -h * 0.2 : h * 0.2)); ctx.rotate(rot);
    rrect(ctx, -w * 0.22, -h * 0.18, w * 0.44, h * 0.36, 1, i < 2 ? tn.hi : tn.base, OL, 1);
    ctx.fillStyle = tn.sh; ctx.fillRect(-w * 0.22 + 1, h * 0.02, w * 0.44 - 2, h * 0.14);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- Stage 2 props (docs/STAGE2.md section 6)
/** Powder keg: a squat iron-hooped barrel with a stencilled charge mark; it goes off 30f after it is broken. */
function powderKeg(ctx, sx, sy, p) {
  const w = p.w, h = p.h, x = sx - w / 2, y = sy - h;
  ctx.save();
  if (p.angle) { ctx.translate(sx, sy - h / 2); ctx.rotate(p.angle); ctx.translate(-sx, -(sy - h / 2)); }
  cyl(ctx, x, y, w, h, '#4A3A2E', 4);
  if (!flash) {
    flat(ctx, x + 1, y + 4, w - 2, 3, tones(IRON).base); flat(ctx, x + 1, y + h - 7, w - 2, 3, tones(IRON).base);
    flat(ctx, x + 1, y + 4, w - 2, 1, tones(IRON).hi); flat(ctx, x + 1, y + h - 7, w - 2, 1, tones(IRON).hi);
    // charge mark: a violet lightning stencil
    ctx.fillStyle = C('#9B7BFF');
    ctx.beginPath(); ctx.moveTo(sx + 2, y + 10); ctx.lineTo(sx - 4, y + 19); ctx.lineTo(sx, y + 19); ctx.lineTo(sx - 3, y + 27);
    ctx.lineTo(sx + 5, y + 17); ctx.lineTo(sx + 1, y + 17); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
/** Ballast bag: sand in oiled canvas on a rope loop — it splits and dumps a Meat Pie some quartermaster hid in it. */
function ballastBag(ctx, sx, sy, p) {
  const w = p.w, h = p.h, x = sx - w / 2, y = sy - h;
  ctx.save();
  if (p.angle) { ctx.translate(sx, sy - h / 2); ctx.rotate(p.angle); ctx.translate(-sx, -(sy - h / 2)); }
  box(ctx, x + 1, y + 5, w - 2, h - 5, '#8A7A52', 6, 0.4);
  if (!flash) {
    ctx.strokeStyle = C('#B9A47E'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 4, y + 8); ctx.lineTo(x + w - 4, y + 8); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, y + 4, 5, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = tones('#8A7A52').sh; ctx.fillRect(x + 3, y + h - 8, w - 6, 3);
  }
  ctx.restore();
}
/** Signal locker: a tall brass-cornered chest of flags and rockets; the Wing kept the good pickups in it. */
function signalLocker(ctx, sx, sy, p) {
  const w = p.w, h = p.h, x = sx - w / 2, y = sy - h;
  box(ctx, x, y, w, h, '#2E3446', 2, 0.35);
  if (flash) return;
  flat(ctx, x + 2, y + 2, w - 4, 2, tones('#2E3446').hi);
  ctx.fillStyle = C(BRASS);
  ctx.fillRect(x, y, 4, 4); ctx.fillRect(x + w - 4, y, 4, 4); ctx.fillRect(x, y + h - 4, 4, 4); ctx.fillRect(x + w - 4, y + h - 4, 4, 4);
  ctx.fillRect(x + 2, y + Math.round(h * 0.45), w - 4, 3);
  // rolled signal flags standing in the top
  const cols = ['#C4913A', '#7C2B34', '#D6CBB2'];
  for (let i = 0; i < 3; i++) { ctx.fillStyle = C(cols[i]); ctx.fillRect(x + 5 + i * 8, y + 6, 5, 12); }
}

// ---------------------------------------------------------------- Throwable clutter (issue #21, GDD 7)
/** Empty glass bottle: never rolled, so it does not honour `p.angle` (thrown-prop spin is a canvas rotation
 *  in throwables.js's draw closure instead, decision 7). */
const BOTTLE_GLASS = '#4a7a52';
function bottle(ctx, sx, sy, p) {
  const w = p.w, h = p.h, x = sx - w / 2, y = sy - h, neckW = Math.round(w * 0.42), neckX = sx - Math.round(neckW / 2);
  box(ctx, x, y + 7, w, h - 7, BOTTLE_GLASS, 2, 0.4);
  box(ctx, neckX, y, neckW, 8, BOTTLE_GLASS, 1, 0.4);
  if (flash) return;
  ctx.fillStyle = tones('#8a6a40').base; ctx.fillRect(neckX, y - 2, neckW, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x + 2, y + 10, 1, h - 13);
}
/** Small carry lamp: an oil lamp set on the dock planks, brass body and a warm flicker (never rolled either). */
function lamp(ctx, sx, sy, p, frame) {
  const w = p.w, h = p.h, x = sx - w / 2, y = sy - h, bodyX = sx - Math.round(w * 0.35), bodyW = Math.round(w * 0.7);
  box(ctx, x, sy - 6, w, 6, IRON, 1);
  box(ctx, bodyX, y + 6, bodyW, h - 12, BRASS, 2, 0.3);
  if (flash) return;
  ctx.fillStyle = 'rgba(160,220,240,0.3)'; ctx.fillRect(bodyX + 1, y + 1, bodyW - 2, 6);
  const k = 0.55 + 0.3 * Math.sin(frame * 0.2 + p.x);
  glow(ctx, bodyX, y - 3, bodyW, 6, '#ffd070', k);
  ctx.fillStyle = '#FFD27A'; ctx.fillRect(sx - 1, y, 2, 3);
}
// ---------------------------------------------------------------- Boards 2-4 (issue #27; docs/STAGE2.md, STAGE3.md, STAGE4.md section 1)
// Each board's props are drawn in that board's quoted palette so they sit in their own backdrop: the Wing's canvas / pewter /
// deck timber with static violet on the powder marks; the Chandlery's chalk / lime spoil / tallow / harness leather / kiln iron
// with rite lime only on a seal; the Gleaning's rose / bladder silk / hemp / cold spoil with zinc for the salvage ironwork.
// Brassbound steel shows on the Gleaning's props because those props ARE Brassbound (what the guild is stripping).
const S2 = { canvas: '#D6CBB2', pewter: '#9AA6B4', timber: '#8A7250', violet: '#9B7BFF' };
const S3 = { chalk: '#DCD8CC', spoil: '#CFC6AE', tallow: '#C29B4A', quicklime: '#E6ECDC', harness: '#7A561E', kiln: '#394249', pewter: '#5E8072', lime: '#D8FF6E' };
const S4 = { rose: '#FF57B0', roseCore: '#FFC4E6', silk: '#9CC4D6', hemp: '#9C893F', spoil: '#4E5A55', spoilLit: '#5E6C66', zinc: '#B4BEC4', steel: '#7F8C99', dark: '#4A5563', joint: '#C89B3C', hole: '#1E2228' };

/** Powder tub: a squat deck-timber tub under a tied canvas cover — one per gun port on the Cold Sovereign. Rolls when shoved and
 *  goes off 30f after it breaks; in the fuse state the cover lifts on a violet glow (the keg's stencil, the drum's tell). */
function powderTub(ctx, sx, sy, p) {
  const w = p.w, h = p.h, x = sx - w / 2, y = sy - h;
  ctx.save();
  if (p.angle) { ctx.translate(sx, sy - h / 2); ctx.rotate(p.angle); ctx.translate(-sx, -(sy - h / 2)); }
  // staves: wider at the rim than the foot, shadow down the right third like cyl()
  poly(ctx, [x + 3, sy, x + w - 3, sy, x + w, y + 6, x, y + 6], S2.timber, [x + w - 11, y + 7, x + w - 1, y + 7, x + w - 4, sy - 1, x + w - 11, sy - 1]);
  if (!flash) {
    ctx.fillStyle = tones(S2.timber).hi; ctx.fillRect(x + 2, y + 8, 2, h - 12);
    ctx.fillStyle = tones(S2.timber).sh; ctx.fillRect(sx - 1, y + 8, 1, h - 12);
    // pewter hoop under the rim and a foot band
    flat(ctx, x + 1, y + 9, w - 2, 3, tones(S2.pewter).base); flat(ctx, x + 3, sy - 4, w - 6, 3, tones(S2.pewter).base);
    flat(ctx, x + 1, y + 9, w - 2, 1, tones(S2.pewter).hi); flat(ctx, x + 3, sy - 4, w - 6, 1, tones(S2.pewter).hi);
  }
  if (p.state === 'fuse') {
    // the cover lifts on the pressure inside: violet light under the rim, pulsing faster as the fuse runs out
    const k = (Math.sin(p.t * (0.3 + p.t * 0.02)) + 1) / 2;
    glow(ctx, x + 2, y + 2, w - 4, 8, S2.violet, 0.35 + 0.5 * k);
    rrect(ctx, x - 1, y - 3, w + 2, 6, 3, tones(S2.canvas).base, OL, 1);
    ctx.restore();
    return;
  }
  // tied canvas cover over the rim with its cord, and the Wing's violet charge stencil between hoop and foot band
  rrect(ctx, x - 1, y, w + 2, 7, 3, C(tones(S2.canvas).base), OL, 1);
  if (!flash) {
    ctx.fillStyle = tones(S2.canvas).sh; ctx.fillRect(x + w - 9, y + 1, 8, 5);
    ctx.fillStyle = tones(S2.canvas).hi; ctx.fillRect(x + 1, y + 1, w - 10, 1);
    ctx.fillStyle = OL; ctx.fillRect(x, y + 7, w, 1);
    ctx.fillStyle = S2.violet;
    ctx.beginPath(); ctx.moveTo(sx + 2, y + 13); ctx.lineTo(sx - 3, y + 19); ctx.lineTo(sx, y + 19); ctx.lineTo(sx - 2, y + 24);
    ctx.lineTo(sx + 3, y + 18); ctx.lineTo(sx, y + 18); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
/** Handcart: the Chandlery's closed carry-cart — kiln-iron frame, a lashed lime-spoil tarpaulin, two spoked wheels and a pair of
 *  shafts. The rite-lime seal on the hasp is the only hint of what rides in it (items.js `release`: a Tin Footman tips out). */
function handcart(ctx, sx, sy, p, frame) {
  // shafts first so the body overlaps them
  line(ctx, sx - 16, sy - 18, sx - 30, sy - 26, C(S3.harness), 3); line(ctx, sx - 16, sy - 13, sx - 30, sy - 21, C(S3.harness), 3);
  box(ctx, sx - 18, sy - 30, 36, 20, S3.kiln, 1, 0.3);
  rrect(ctx, sx - 19, sy - 40, 38, 14, 4, C(tones(S3.spoil).base), OL, 1);
  if (!flash) {
    ctx.fillStyle = tones(S3.spoil).sh; ctx.fillRect(sx + 6, sy - 36, 12, 9); ctx.fillRect(sx - 18, sy - 30, 36, 2);
    ctx.fillStyle = tones(S3.spoil).hi; ctx.fillRect(sx - 17, sy - 39, 22, 1);
    // lashing straps over the tarp and down the frame, pewter rivets along the sill, the hasp plate with the company's seal
    flat(ctx, sx - 10, sy - 40, 3, 30, S3.harness); flat(ctx, sx + 7, sy - 40, 3, 30, S3.harness);
    rivets(ctx, sx - 16, sy - 14, sx + 16, 8, S3.pewter);
    flat(ctx, sx - 4, sy - 27, 8, 6, S3.tallow); flat(ctx, sx - 4, sy - 27, 8, 1, tones(S3.tallow).hi);
    const k = 0.5 + 0.5 * Math.sin(frame * 0.08 + p.x * 0.05);
    flat(ctx, sx - 1, sy - 25, 2, 2, S3.lime); glow(ctx, sx - 4, sy - 28, 8, 8, S3.lime, 0.25 * k);
  }
  // axle + wheels: kiln-iron rims, pewter spokes, tallow hubs
  flat(ctx, sx - 14, sy - 9, 28, 2, C(tones(S3.kiln).sh));
  for (const cx of [sx - 13, sx + 13]) {
    circle(ctx, cx, sy - 8, 8, C(S3.kiln), OL, 1);
    if (flash) continue;
    ctx.strokeStyle = S3.pewter; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 6, sy - 8); ctx.lineTo(cx + 6, sy - 8); ctx.moveTo(cx, sy - 14); ctx.lineTo(cx, sy - 2); ctx.stroke();
    circle(ctx, cx, sy - 8, 2, S3.tallow, OL, 1);
  }
}
/** Tally board: a chalked count on a greened-pewter board in a harness-leather frame, standing on two kiln-iron legs. */
function tallyBoard(ctx, sx, sy, p) {
  box(ctx, sx - 13, sy - 20, 4, 20, S3.kiln, 1, 0); box(ctx, sx + 9, sy - 20, 4, 20, S3.kiln, 1, 0);
  if (!flash) { ctx.fillStyle = tones(S3.kiln).sh; ctx.fillRect(sx - 11, sy - 18, 1, 16); ctx.fillRect(sx + 11, sy - 18, 1, 16); }
  box(ctx, sx - 17, sy - 44, 34, 26, S3.harness, 2, 0.25);
  if (flash) return;
  flat(ctx, sx - 15, sy - 42, 30, 22, tones(S3.pewter).base); flat(ctx, sx - 15, sy - 42, 30, 1, tones(S3.pewter).hi); flat(ctx, sx - 15, sy - 26, 30, 6, tones(S3.pewter).sh);
  // chalk: the company's lime-cone mark, then two rows of four-and-a-stroke tallies
  ctx.fillStyle = S3.chalk;
  ctx.beginPath(); ctx.moveTo(sx - 13, sy - 30); ctx.lineTo(sx - 9, sy - 39); ctx.lineTo(sx - 5, sy - 30); ctx.closePath(); ctx.fill();
  for (let row = 0; row < 2; row++) {
    const ty = sy - 39 + row * 8;
    for (let g = 0; g < 2; g++) { const gx = sx - 2 + g * 9; for (let i = 0; i < 4; i++) ctx.fillRect(gx + i * 2, ty, 1, 5); ctx.fillRect(gx - 1, ty + 2, 8, 1); }
  }
  // tallow-gold ledger hook on the frame top
  flat(ctx, sx - 2, sy - 47, 4, 4, S3.tallow); ctx.fillStyle = OL; ctx.fillRect(sx - 1, sy - 46, 2, 1);
}
/** Ledger stack: three bound ledgers, spines to the left, chalk fore-edges to the right, the top one in tallow cloth with a clasp. */
function ledgerStack(ctx, sx, sy, p) {
  const books = [[sx - 14, sy - 9, 28, 9, S3.harness], [sx - 13, sy - 18, 28, 9, S3.kiln], [sx - 15, sy - 28, 30, 10, S3.tallow]];
  for (const [x, y, w, h, hex] of books) {
    box(ctx, x, y, w, h, hex, 1, 0.3);
    if (flash) continue;
    // fore-edge: chalk leaves with lime-spoil rules between them; a lit crease along the spine
    flat(ctx, x + w - 7, y + 2, 6, h - 3, S3.chalk); ctx.fillStyle = S3.spoil; for (let yy = y + 3; yy < y + h - 2; yy += 2) ctx.fillRect(x + w - 7, yy, 6, 1);
    ctx.fillStyle = tones(hex).hi; ctx.fillRect(x + 3, y + 1, 1, h - 2);
  }
  if (flash) return;
  flat(ctx, sx + 5, sy - 26, 2, 6, S3.tallow); flat(ctx, sx + 5, sy - 26, 2, 1, tones(S3.tallow).hi);
  flat(ctx, sx - 9, sy - 2, 10, 2, S3.chalk);   // a loose slip under the stack
}
/** Lime sack: hessian full of quicklime, tied at the neck with a harness cord, stencilled, dusted white where it has been handled. */
function limeSack(ctx, sx, sy, p) {
  rrect(ctx, sx - 14, sy - 26, 28, 26, 8, C(tones(S3.spoil).base), OL, 1);
  rrect(ctx, sx - 6, sy - 31, 12, 8, 3, C(tones(S3.spoil).base), OL, 1);
  if (flash) return;
  const t = tones(S3.spoil);
  ctx.fillStyle = t.sh; ctx.fillRect(sx - 11, sy - 9, 22, 7); ctx.fillRect(sx + 8, sy - 20, 4, 12);
  ctx.fillStyle = t.hi; ctx.fillRect(sx - 11, sy - 24, 10, 1); ctx.fillRect(sx - 12, sy - 23, 1, 10);
  flat(ctx, sx - 7, sy - 26, 14, 2, S3.harness);
  ctx.fillStyle = S3.kiln; ctx.fillRect(sx - 5, sy - 19, 10, 1); ctx.fillRect(sx - 5, sy - 16, 6, 1); ctx.fillRect(sx - 5, sy - 13, 10, 1);
  ctx.fillStyle = S3.quicklime; ctx.fillRect(sx - 10, sy - 25, 6, 2); ctx.fillRect(sx - 4, sy - 30, 3, 1); ctx.fillRect(sx - 17, sy - 2, 5, 2); ctx.fillRect(sx + 12, sy - 1, 6, 1);
}
/** Salvage stake: a zinc wedge driven into the spoil with a ring on top (shared by the line and its cut animation). */
function drawStake(ctx, sx, sy) {
  poly(ctx, [sx - 5, sy, sx + 5, sy, sx + 3, sy - 10, sx - 3, sy - 10], S4.zinc, [sx + 1, sy - 1, sx + 4, sy - 1, sx + 2, sy - 9, sx + 1, sy - 9]);
  circle(ctx, sx, sy - 12, 3, C(tones(S4.zinc).sh), OL, 1);
  if (!flash) { ctx.fillStyle = tones(S4.zinc).hi; ctx.fillRect(sx - 2, sy - 9, 1, 7); }
}
/** Zinc salvage hook clipped on a line at (hx, hy): a shank on the line and a curved bill opening to the right. */
function drawHook(ctx, hx, hy) {
  box(ctx, hx - 2, hy - 8, 4, 10, S4.zinc, 1, 0);
  for (const [col, lw] of [[OL, 4], [C(tones(S4.zinc).base), 2]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(hx + 3, hy + 2, 4, Math.PI, Math.PI * 2, true); ctx.stroke();
  }
  if (!flash) { ctx.fillStyle = tones(S4.zinc).hi; ctx.fillRect(hx - 1, hy - 7, 1, 8); }
}
/** Hemp line from (sx, y0) up to y1 with a 1px sway so it never reads as a wall seam; `dx` offsets the top end. */
function drawHemp(ctx, sx, y0, y1, dx) {
  ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, y0); ctx.lineTo(sx + dx, y1); ctx.stroke();
  ctx.strokeStyle = C(S4.hemp); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, y0); ctx.lineTo(sx + dx, y1); ctx.stroke();
}
/** Salvage line: a taut hemp line from a floor stake straight up off-screen to a bladder, a zinc hook clipped on at waist height.
 *  Breaking it cuts it — `salvageCut` is its `pieces` hook (the line whips away upward, cosmetic). */
function salvageLine(ctx, sx, sy, p, frame) {
  drawHemp(ctx, sx, sy - 14, sy - 210, Math.round(Math.sin(frame * 0.04 + p.x * 0.01) * 2));
  drawHook(ctx, sx, sy - 44);
  drawStake(ctx, sx, sy);
}
/** Cut salvage line (t in 0..1): the stake stays put while the line and hook whip up out of frame and fade. */
function salvageCut(ctx, sx, sy, p, t) {
  const e = t * (2 - t), y0 = sy - 14 - Math.round(e * 230), wave = Math.sin(t * 14) * 12 * (1 - t);
  ctx.globalAlpha = 1 - t * t;
  drawStake(ctx, sx, sy);
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, y0); ctx.quadraticCurveTo(sx + wave * 2, y0 - 60, sx, sy - 210); ctx.stroke();
  ctx.strokeStyle = S4.hemp; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, y0); ctx.quadraticCurveTo(sx + wave * 2, y0 - 60, sx, sy - 210); ctx.stroke();
  drawHook(ctx, sx + Math.round(wave), y0 - 30);
  ctx.globalAlpha = 1;
}
/** Cargo net: a sling of stripped war hanging over the deck on a hemp line, cinched through a zinc ring. A jump attack opens it
 *  (items.js `dump`): the load comes down as a rolling chassis and the empty net stays up, swinging. Drawn around `p.yOff`. */
function cargoNet(ctx, sx, sy, p, frame) {
  const cy = sy - p.yOff, top = sy - 200;
  drawHemp(ctx, sx, cy - 40, top, 0);
  circle(ctx, sx, cy - 38, 4, C(tones(S4.zinc).base), OL, 1);
  if (p.spent) {
    // emptied: two limp strands swinging under the ring
    const sw = Math.sin(frame * 0.06 + p.x * 0.02) * 4;
    for (const d of [-1, 1]) {
      for (const [col, lw] of [[OL, 3], [S4.hemp, 1]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(sx + d * 2, cy - 34);
        ctx.quadraticCurveTo(sx + d * 10 + sw, cy - 16, sx + d * 6 + sw * 1.5, cy + 4); ctx.stroke();
      }
    }
    return;
  }
  // the load: a cold-spoil plate, a zinc sheet and a Brassbound torso plate with the chest already cut out
  poly(ctx, [sx - 28, cy - 14, sx + 28, cy - 14, sx + 22, cy, sx - 22, cy], S4.spoil, [sx + 6, cy - 13, sx + 27, cy - 13, sx + 21, cy - 1, sx + 6, cy - 1]);
  box(ctx, sx - 19, cy - 26, 14, 12, S4.zinc, 1, 0.3);
  rrect(ctx, sx - 3, cy - 30, 21, 16, 3, C(tones(S4.steel).base), OL, 1);
  if (!flash) {
    ctx.fillStyle = tones(S4.steel).sh; ctx.fillRect(sx + 9, cy - 28, 8, 12);
    ctx.fillStyle = S4.hole; ctx.fillRect(sx + 1, cy - 26, 8, 7);
    ctx.fillStyle = S4.joint; ctx.fillRect(sx - 2, cy - 29, 3, 3); ctx.fillRect(sx + 14, cy - 29, 3, 3);
  }
  // hemp mesh over the load, gathered to the ring
  ctx.strokeStyle = C(S4.hemp); ctx.lineWidth = 1; ctx.beginPath();
  for (let i = -3; i <= 3; i++) { ctx.moveTo(sx, cy - 35); ctx.lineTo(sx + i * 8, cy - 1); }
  for (let k = 1; k <= 3; k++) { const yy = cy - 35 + k * 11, hw = 4 + k * 7; ctx.moveTo(sx - hw, yy); ctx.lineTo(sx + hw, yy); }
  ctx.stroke();
}
/** Chassis: a stripped Brassbound — the torso plate with the chest cut out, still bolted to its hip frame and lashed with hemp.
 *  Rolls on the hip joints when shoved (the brass discs are the wheels); the Gleaning's heaviest rolling prop. */
function chassis(ctx, sx, sy, p) {
  const h = p.h;
  ctx.save();
  if (p.angle) { ctx.translate(sx, sy - h / 2); ctx.rotate(p.angle); ctx.translate(-sx, -(sy - h / 2)); }
  box(ctx, sx - 16, sy - 8, 32, 5, S4.dark, 1, 0.35);
  box(ctx, sx - 17, sy - 24, 5, 8, S4.dark, 1, 0.3); box(ctx, sx + 12, sy - 24, 5, 8, S4.dark, 1, 0.3);
  rrect(ctx, sx - 13, sy - 28, 26, 20, 4, C(tones(S4.steel).base), OL, 1);
  if (!flash) {
    ctx.fillStyle = tones(S4.steel).sh; ctx.fillRect(sx - 12, sy - 14, 24, 5); ctx.fillRect(sx + 7, sy - 26, 5, 12);
    ctx.fillStyle = tones(S4.steel).hi; ctx.fillRect(sx - 11, sy - 27, 18, 1); ctx.fillRect(sx - 12, sy - 26, 1, 12);
    // the chest cut out: a ragged dark hole where the core and the lens were (no cyan left on it)
    ctx.fillStyle = S4.hole; ctx.fillRect(sx - 6, sy - 25, 10, 9); ctx.fillRect(sx - 4, sy - 26, 6, 1); ctx.fillRect(sx - 7, sy - 22, 1, 4);
    rivets(ctx, sx - 10, sy - 12, sx + 10, 5, S4.zinc);
    flat(ctx, sx - 13, sy - 16, 26, 2, S4.hemp); flat(ctx, sx - 13, sy - 16, 26, 1, tones(S4.hemp).hi);
    flat(ctx, sx + 4, sy - 20, 4, 3, S4.zinc);
  }
  for (const cx of [sx - 14, sx + 14]) {
    circle(ctx, cx, sy - 5, 5, C(tones(S4.joint).base), OL, 1);
    if (!flash) { ctx.fillStyle = tones(S4.joint).sh; ctx.fillRect(cx - 2, sy - 4, 4, 3); ctx.fillStyle = OL; ctx.fillRect(cx - 1, sy - 6, 2, 2); }
  }
  ctx.restore();
}
/** Spoil heap: a low mound of tailings (lit a step above the cold spoil floor so it reads against it) with zinc glinting in it
 *  and a dead Brassbound's joint and plate half-buried; rose gas wisps off the top (visual — the lit seep is a hazard). */
function spoilHeap(ctx, sx, sy, p, frame) {
  poly(ctx, [sx - 23, sy, sx - 14, sy - 13, sx - 3, sy - 22, sx + 9, sy - 17, sx + 18, sy - 9, sx + 23, sy], S4.spoilLit,
    [sx + 4, sy - 1, sx + 22, sy - 1, sx + 18, sy - 9, sx + 9, sy - 17, sx + 4, sy - 19]);
  if (flash) return;
  ctx.fillStyle = tones(S4.spoilLit).hi; ctx.fillRect(sx - 13, sy - 13, 10, 1); ctx.fillRect(sx - 4, sy - 21, 6, 1);
  ctx.fillStyle = S4.zinc; ctx.fillRect(sx - 9, sy - 8, 2, 1); ctx.fillRect(sx + 3, sy - 14, 2, 1); ctx.fillRect(sx + 12, sy - 5, 3, 1); ctx.fillRect(sx - 17, sy - 4, 2, 1);
  circle(ctx, sx + 13, sy - 4, 3, tones(S4.joint).sh, OL, 1); rrect(ctx, sx - 20, sy - 7, 9, 5, 1, tones(S4.steel).sh, OL, 1);
  const k = 0.5 + 0.5 * Math.sin(frame * 0.07 + p.x * 0.03), k2 = 0.5 + 0.5 * Math.sin(frame * 0.05 + 2 + p.x * 0.02);
  glow(ctx, sx - 6, sy - 30, 8, 10, S4.rose, 0.1 + 0.12 * k); glow(ctx, sx + 2, sy - 26, 6, 6, S4.rose, 0.08 + 0.12 * k2);
}
/** Gas bag: a half-full salvage bladder in a hemp net on a hemp cradle, rose gas lit from inside, the zinc nozzle shut. Breaks
 *  into a rose puff (items.js `puff`) and never into fire — the lit seep is the hazard, not the bag. */
function gasBag(ctx, sx, sy, p, frame) {
  box(ctx, sx - 11, sy - 6, 22, 6, S4.hemp, 2, 0.4);
  rrect(ctx, sx - 14, sy - 34, 28, 30, 12, C(tones(S4.silk).base), OL, 1);
  if (flash) return;
  const t = tones(S4.silk);
  ctx.fillStyle = t.sh; ctx.fillRect(sx + 5, sy - 26, 6, 14); ctx.fillRect(sx - 8, sy - 9, 16, 3);
  ctx.fillStyle = t.hi; ctx.fillRect(sx - 9, sy - 32, 8, 1); ctx.fillRect(sx - 11, sy - 30, 1, 6);
  // the gas inside breathes on the bladder cycle: a soft glow, a flat rose core with a pale centre
  const k = 0.5 + 0.5 * Math.sin(frame * 0.05 + p.x * 0.02);
  glow(ctx, sx - 9, sy - 27, 18, 16, S4.rose, 0.22 + 0.18 * k); flat(ctx, sx - 3, sy - 22, 6, 6, S4.rose); flat(ctx, sx - 1, sy - 21, 2, 2, S4.roseCore);
  ctx.strokeStyle = S4.hemp; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(sx - 12, sy - 30); ctx.lineTo(sx + 8, sy - 6); ctx.moveTo(sx - 4, sy - 34); ctx.lineTo(sx + 13, sy - 14);
  ctx.moveTo(sx + 12, sy - 30); ctx.lineTo(sx - 8, sy - 6); ctx.moveTo(sx + 4, sy - 34); ctx.lineTo(sx - 13, sy - 14);
  ctx.moveTo(sx - 13, sy - 20); ctx.lineTo(sx + 13, sy - 20); ctx.stroke();
  box(ctx, sx - 3, sy - 38, 6, 5, S4.zinc, 1, 0);
}

/** Prop catalogue. Sizes are hurtbox w/h in px (rigs stand ~72px). */
export const PROP_TYPES = {
  crate: { w: 34, h: 30, hp: 20, drops: ['brassCog', 'brassCog'], draw: crate, color: WOOD },
  barrel: { w: 26, h: 36, hp: 24, drops: 'coalScrip', draw: barrel, color: '#7a5230', roll: 40, rollHit: 10 },
  winch: { w: 44, h: 40, hp: 40, drops: 'aetherVial', draw: winch, color: '#4a5563' },
  mold: { w: 44, h: 16, hp: 30, drops: 'brassCog', draw: mold, color: '#4a4e58' },
  cart: { w: 48, h: 36, hp: 40, drops: 'meatPie', draw: cart, color: IRON, roll: 60, rollHit: 15 },
  drum: { w: 26, h: 38, hp: 20, drops: 'aetherVial', draw: drum, color: '#8a2e2e', explode: { delay: 30, radius: 40, damage: 20 } },
  case: { w: 30, h: 46, hp: 30, drops: 'goldenSprocket', draw: displayCase, color: '#5a3a20' },
  bucket: { w: 26, h: 30, hp: 16, drops: 'roastBird', draw: bucket, color: '#6a6a72', yOff: 6 },
  trunk: { w: 38, h: 26, hp: 24, drops: 'meatPie', draw: trunk, color: '#6a3a2a' },
  mailcart: { w: 40, h: 42, hp: 36, drops: 'goldenSprocket', draw: mailCart, color: '#7a4a2e' },
  /** A broken lantern spills its oil: a fire source (world.addFire) that lights the Tailings' gas seeps. */
  lantern: { w: 16, h: 70, hp: 16, drops: 'coalScrip', draw: lantern, color: IRON, fire: true },
  urn: { w: 28, h: 44, hp: 20, drops: 'meatPie', draw: urn, color: '#8a6a40' },
  cabinet: { w: 34, h: 56, hp: 40, drops: 'goldenSprocket', draw: cabinet, color: '#3B3A46' },
  /** Boss-arena pressure valve: one hit while the Regent Engine is in phase 1 or 2 stuns it 60f (once each). */
  valve: { w: 24, h: 56, hp: 1, drops: null, draw: valve, color: BRASS, valve: true, score: 0 },
  /** Stage 2: a powder keg goes off 30f after it breaks (20 damage, r 40) — bat one into a boarding party. */
  keg: { w: 28, h: 34, hp: 18, drops: 'coalScrip', draw: powderKeg, color: '#4A3A2E', roll: 40, rollHit: 12, explode: { delay: 30, radius: 40, damage: 20 } },
  /** Stage 2: ballast bags on the gas-hall catwalk. */
  ballast: { w: 30, h: 30, hp: 16, drops: 'meatPie', draw: ballastBag, color: '#8A7A52' },
  /** Stage 2: the flagship's signal lockers. */
  locker: { w: 32, h: 50, hp: 34, drops: 'goldenSprocket', draw: signalLocker, color: '#2E3446' },
  /** Falls when hit by a jump attack: 30 to enemies within 90px, once. */
  chandelier: { w: 60, h: 40, hp: 1, drops: null, draw: chandelier, color: BRASS, yOff: 70, jumpOnly: true, fall: { radius: 90, damage: 30 }, score: 0 },
  /** Throwable clutter (issue #21, GDD 7): liftable only where a stage row says `throwable: true`. `throw`
   *  shapes the flying feel exactly like WEAPONS[id].throw (game/weapons.js) -- see ThrowSpec in throwables.js.
   *  Always shatters on landing (Prop.break), whether or not it hit anything on the way (no durability to spend). */
  bottle: { w: 10, h: 18, hp: 4, drops: null, draw: bottle, color: BOTTLE_GLASS,
    throw: { speed: 8, vy: 1, gravity: 0.22, damage: 8, type: 'light', kbX: 2, kbY: 0, hitstun: 14, pierce: 0, maxDist: 220, spin: 0.6 } },
  /** A lit oil lamp, so breaking or throwing one is a fire source like `lantern` above: on a board with gas
   *  (the Tailings' seeps, the Gas-Halls' cells) a thrown lamp lights it. */
  lamp: { w: 16, h: 26, hp: 6, drops: null, draw: lamp, color: BRASS, fire: true,
    throw: { speed: 7, vy: 1.2, gravity: 0.25, damage: 12, type: 'medium', kbX: 3, kbY: 2, hitstun: 18, pierce: 0, maxDist: 200, spin: 0.4 } },
  // ---- boards 2-4 (issue #27). Behaviour fields items.js reads besides roll / rollHit / explode / fall / valve / jumpOnly:
  //      release { type, variant, mods? }  a live enemy tips out on break (a stage entry overrides it or sets release: null)
  //      dump 'chassis'                    an overhead net drops that prop type on the floor, rolling, when a jump attack opens it
  //      fire                              a breaking prop is a fire source (world.addFire) — explosions are regardless
  //      puff { color, count }             a coloured cloud on break    pieces(ctx, sx, sy, p, t)   replaces the split-quads break animation
  /** Stage 2: one powder tub per gun port on the Cold Sovereign — rolls 50, goes off 30f after it breaks (18, r 44). */
  powderTub: { w: 30, h: 28, hp: 18, drops: 'coalScrip', draw: powderTub, color: '#8A7250', roll: 50, rollHit: 12, explode: { delay: 30, radius: 44, damage: 18 } },
  /** Stage 3: the Chandlery's carry-cart — a live Tin Footman tips out when it breaks (the enemy is the drop). */
  handcart: { w: 44, h: 40, hp: 36, drops: null, draw: handcart, color: '#7A561E', release: { type: 'brassbound', variant: 'footman' } },
  /** Stage 3: the tally boards on every wall of the works hold the company's Coal Scrip. */
  tallyBoard: { w: 34, h: 44, hp: 16, drops: 'coalScrip', draw: tallyBoard, color: '#5E8072' },
  /** Stage 3: a stack of chained ledgers (Ledger House). */
  ledgerStack: { w: 30, h: 28, hp: 18, drops: ['brassCog', 'brassCog'], draw: ledgerStack, color: '#7A561E' },
  /** Stage 3: a sack of quicklime bursts in a white puff. */
  limeSack: { w: 28, h: 30, hp: 14, drops: 'meatPie', draw: limeSack, color: '#CFC6AE', puff: { color: '#E6ECDC', count: 12 } },
  /** Stage 4: a salvage line up to a bladder — cutting it drops meter; the line whips away (cosmetic `pieces`). */
  salvageLine: { w: 14, h: 70, hp: 12, drops: 'aetherVial', draw: salvageLine, color: '#9C893F', pieces: salvageCut },
  /** Stage 4: an overhead cargo net — a jump attack dumps its load as a rolling `chassis`; the emptied net stays up (no score, no drops). */
  cargoNet: { w: 56, h: 36, hp: 1, drops: null, draw: cargoNet, color: '#9C893F', yOff: 70, jumpOnly: true, dump: 'chassis', score: 0 },
  /** Stage 4: a stripped Brassbound chassis — the heaviest rolling prop (70px, 16 to enemies). */
  chassis: { w: 36, h: 30, hp: 30, drops: 'brassCog', draw: chassis, color: '#7F8C99', roll: 70, rollHit: 16 },
  /** Stage 4: a spoil heap with a dead Brassbound in it. */
  spoilHeap: { w: 46, h: 22, hp: 24, drops: 'coalScrip', draw: spoilHeap, color: '#5E6C66' },
  /** Stage 4: a salvage bladder — a rose gas puff on break, never fire. */
  gasBag: { w: 30, h: 36, hp: 12, drops: 'meatPie', draw: gasBag, color: '#9CC4D6', puff: { color: '#FF57B0', count: 14 } },
};

/** Which prop types are drawn in which board's palette (docs/STAGE2-4.md section 1) — a guide for stage authors, no behaviour.
 *  Stage 1's catalogue (crate, barrel, drum, lantern, urn, ...) is neutral ironwork and timber and is used on every board. */
export const PROP_FAMILIES = Object.freeze({
  stage2: ['keg', 'ballast', 'locker', 'powderTub'],
  stage3: ['handcart', 'tallyBoard', 'ledgerStack', 'limeSack'],
  stage4: ['salvageLine', 'cargoNet', 'chassis', 'spoilHeap', 'gasBag'],
});

/** Look up a prop type (falls back to crate). */
export function getPropType(type) { return PROP_TYPES[type] || PROP_TYPES.crate; }
/** Draw a prop through its renderer with the hit-flash state applied. */
export function drawProp(ctx, sx, sy, p, frame) {
  flash = p.flashTimer > 0;
  p.info.draw(ctx, sx, sy, p, frame);
  flash = false;
}
