// Character-select busts, HUD head portraits, cut-in portraits and lives icons — all drawn from the character rigs so
// they match the in-game cel-shaded sprites (ARCHITECTURE.md art/portraits.js, GDD 9, ART_STYLE). No bitmaps.
import { drawRig, computeJoints } from './rig.js';
import { makePose } from './poses.js';
import { rrect, rivetLine, gear, circle, pathPoly, paint } from './shapes.js';
import { UI } from '../constants.js';

/** First idle keyframe pose of a character def (partial pose), or null. */
export function idlePoseOf(def) {
  const a = def && def.anims && def.anims.idle;
  return a && a.frames && a.frames[0] ? a.frames[0].pose : null;
}

/** Root-space head centre / head top of a rig in a (partial) pose. Cached on the rig per pose object (no per-frame work). */
function anchor(rig, pose) {
  const c = rig._portraitAnchor;
  if (c && c.pose === pose) return c;
  const full = makePose(pose);
  const J = computeJoints(rig, full);
  const a = { pose, headX: J.head.x + full.root.x, headY: J.head.y + full.root.y, top: J.top + full.root.y, headR: rig.p.headR };
  rig._portraitAnchor = a;
  return a;
}

/**
 * Head-and-shoulders portrait clipped to a `size` square (HUD 24px, intro 48px, cut-in 64px).
 * @param {{ facing?: number, bg?: string|null, flash?: boolean, tint?: string|null, tintAlpha?: number, fill?: number, cy?: number }} [o]
 */
export function drawHeadPortrait(ctx, rig, pose, x, y, size, o = {}) {
  const facing = o.facing || 1, a = anchor(rig, pose);
  const sc = (size * (o.fill || 0.6)) / (a.headR * 2 * rig.scale);
  const fs = facing * sc * rig.scale, ss = sc * rig.scale;
  const cx = x + size / 2, cy = y + size * (o.cy != null ? o.cy : 0.47);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
  if (o.bg !== null) { ctx.fillStyle = o.bg || '#1a1420'; ctx.fillRect(x, y, size, size); }
  drawRig(ctx, rig, pose, { x: cx - a.headX * fs, y: cy - a.headY * ss, facing, scale: sc, still: true, flash: !!o.flash, tint: o.tint || null, tintAlpha: o.tintAlpha });
  ctx.restore();
}

/**
 * Bust for the character-select card: the rig at `scale` (2.5 for the 140x200 cards) clipped to (x, y, w, h) with the head
 * near the top. `anchorPose` (default: the drawn pose) fixes the feet so an animated pose does not bob the framing.
 * @param {{ facing?: number, margin?: number, tint?: string|null, tintAlpha?: number, still?: boolean, flash?: boolean }} [o]
 */
export function drawBust(ctx, rig, pose, anchorPose, x, y, w, h, scale, o = {}) {
  const facing = o.facing || 1, a = anchor(rig, anchorPose || pose), ss = scale * rig.scale;
  const margin = o.margin != null ? o.margin : 12;
  const feetY = y + margin - a.top * ss;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  drawRig(ctx, rig, pose, { x: x + w / 2 - a.headX * facing * ss * 0.5, y: feetY, facing, scale, still: !!o.still, flash: !!o.flash, tint: o.tint || null, tintAlpha: o.tintAlpha });
  ctx.restore();
}

/** Brass portrait frame (dark inset, brass rim, optional rivets). */
export function drawPortraitFrame(ctx, x, y, w, h, color = UI.brass, rivets = 0) {
  rrect(ctx, x - 2, y - 2, w + 4, h + 4, 3, '#1a1420', color, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 1, y - 1, w + 2, 1);
  if (rivets > 0) { rivetLine(ctx, x + 3, y - 2, x + w - 3, y - 2, rivets, 1.2, UI.brassLight); rivetLine(ctx, x + 3, y + h + 2, x + w - 3, y + h + 2, rivets, 1.2, UI.brassLight); }
}

/** 10x8 lives icon per character (GDD 9: goggles / scarf / tricorne / red hat); other ids get a small gear. */
export function drawLifeIcon(ctx, id, x, y) {
  const ol = '#1a1018';
  switch (id) {
    case 'brunhild':
      ctx.fillStyle = '#5A3A26'; ctx.fillRect(x, y + 3, 10, 2);
      circle(ctx, x + 3, y + 4, 2.5, '#C9A227', ol, 1); circle(ctx, x + 7, y + 4, 2.5, '#C9A227', ol, 1);
      ctx.fillStyle = '#9BC1E8'; ctx.fillRect(x + 2, y + 3, 2, 2); ctx.fillRect(x + 6, y + 3, 2, 2);
      break;
    case 'sael':
      rrect(ctx, x, y + 2, 7, 4, 1, '#C74E4E', ol, 1);
      pathPoly(ctx, [x + 6, y + 3, x + 10, y, x + 10, y + 7, x + 6, y + 5]); paint(ctx, '#C74E4E', ol, 1);
      break;
    case 'rook':
      pathPoly(ctx, [x, y + 6, x + 10, y + 6, x + 8, y + 1, x + 2, y + 1]); paint(ctx, '#2a1a14', ol, 1);
      ctx.fillStyle = '#C9A227'; ctx.fillRect(x + 2, y + 4, 6, 1);
      break;
    case 'pip':
      pathPoly(ctx, [x + 1, y + 7, x + 9, y + 7, x + 5, y]); paint(ctx, '#C74E4E', ol, 1);
      break;
    default:
      gear(ctx, x + 5, y + 4, 4, 6, UI.brass, ol, 1, 0, 1.2);
  }
}

/** Small armor (tower-shield) icon for elite enemy bars. */
export function drawArmorIcon(ctx, x, y) {
  pathPoly(ctx, [x, y, x + 8, y, x + 8, y + 5, x + 4, y + 9, x, y + 5]); paint(ctx, '#7F8C99', '#1A1E24', 1);
  ctx.fillStyle = '#C89B3C'; ctx.fillRect(x + 3, y + 1, 2, 5); ctx.fillRect(x + 1, y + 3, 6, 1);
}

/** Player cursor: a rotating gear ring (P1 white, P2 cyan) with the player number inside. */
export function drawCursorRing(ctx, cx, cy, r, color, rot, label, drawTextFn) {
  gear(ctx, cx, cy, r, 8, null, color, 1.5, rot, 0);
  ctx.fillStyle = 'rgba(10,6,14,0.85)'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.stroke();
  if (label && drawTextFn) drawTextFn(ctx, label, cx, cy - 3, { size: 1, color, align: 'center', shadow: false });
}
