// Shared character-card rendering: the 140x200 brass cards used by BOTH places a hero is chosen -
// the local CHOOSE YOUR FIGHTER screen (screens/select.js, up to four cursors, one per corner) and
// the online co-op lobby (screens/lobby.js, always exactly two). Online picking should feel exactly
// like the couch version, so the cards, the busts, the stat pips and the gear-ring cursors all come
// from here; the only difference is where the cursors come from (local keyboards/pads, or the
// peer's LOBBY packet online) and how many of the four corners are ever in use.
import { VIEW_W, UI, MAX_PLAYERS } from '../../constants.js';
import { drawText, drawTextOutlined, measureText } from '../../engine/text.js';
import { buildRig } from '../../art/rig.js';
import { AnimPlayer } from '../animation.js';
import { rrect, gear, rivetLine } from '../../art/shapes.js';
import { drawBust, drawCursorRing, idlePoseOf } from '../../art/portraits.js';
import { ENV } from '../../art/palettes.js';

const STATS = ['power', 'speed', 'health', 'range', 'technique'];
const STAT_LABELS = { power: 'POW', speed: 'SPD', health: 'HP', range: 'RNG', technique: 'TEC' };
export const CARD_W = 140, CARD_H = 200, GAP = 12, CARD_Y = 34, BUST_H = 96, BUST_SCALE = 2.5;
/** Cursor colours by slot: P1 white, P2 cyan, P3 violet, P4 magenta -- everywhere in the game. */
export const CURSOR_COLORS = Object.freeze([UI.white, '#4DF0E0', UI.p3, UI.p4]);
/** @deprecated kept for the lobby, which only ever shows two cursors. */
export const P1_CURSOR = CURSOR_COLORS[0], P2_CURSOR = CURSOR_COLORS[1];
/** Ring anchor per slot, corner-mounted so up to four cursors fit on one 140x200 card. */
const RING_POS = [[16, 18], [CARD_W - 16, 18], [16, 86], [CARD_W - 16, 86]];
/** READY-stamp y (local to the card): between the two ring rows, clear of both. */
const STAMP_Y = 56;

/** Rig, animation player and idle anchor pose for every character, ready to draw as a card. */
export function buildCharSlots(chars = []) {
  return chars.map((c) => {
    const anim = new AnimPlayer(c.anims || {});
    anim.play('idle');
    return { rig: buildRig(c.build || {}), anim, def: c, idle: idlePoseOf(c) };
  });
}

/** Advance every card's animation; a finished one-shot falls back to idle (the win pose holds). */
export function tickCharSlots(slots) {
  for (const s of slots) { s.anim.tick(); if (s.anim.done && s.anim.name !== 'win') s.anim.play('idle', { restart: true }); }
}

/** Left edge of card `i` in a centred row of `n`. */
export function cardX(i, n) {
  const totalW = n * CARD_W + (n - 1) * GAP;
  return Math.round((VIEW_W - totalW) / 2) + i * (CARD_W + GAP);
}

/** Full name + title strapline for the card a cursor is on ('' when the character has no title). */
export function charStrap(def) {
  if (!def || !def.title) return '';
  return `${def.fullName ? def.fullName.toUpperCase() : def.name} - ${def.title}`;
}

/**
 * One hero card.
 *
 * `cursors` is a 4-slot array (one per player slot): null when that slot is not on this card,
 * otherwise `{ confirmed, label }` -- the label is what the READY stamp calls them ('P1'..'P4' by
 * default, 'YOU' / 'THEM' would read wrong on a shared screen so the lobby keeps the slot numbers
 * too). Up to four cursors can land on the same card (duplicate heroes are allowed); a second or
 * later cursor tints the bust and turns the frame/pips brassy rather than trying to mix colours.
 * `taken` greys out a card this viewer may not choose: online co-op forbids two players on the
 * same hero, so the card the peer is holding is shown as unavailable rather than silently skipped.
 */
export function drawCharCard(ctx, slot, x, y, f, o = {}) {
  const { cursors = [], taken = false, index = 0 } = o;
  const d = slot.def;
  let on = 0, first = -1;
  for (let s = 0; s < MAX_PLAYERS; s++) if (cursors[s]) { on++; if (first < 0) first = s; }
  const sel = on > 0;
  const frameCol = on > 1 ? UI.brassLight : sel ? CURSOR_COLORS[first] : ENV.brassDark;
  rrect(ctx, x, y, CARD_W, CARD_H, 6, sel ? '#2e2436' : '#241a2a', UI.brass, 2);
  if (sel) rrect(ctx, x + 3, y + 3, CARD_W - 6, CARD_H - 6, 4, null, frameCol, 1);
  // bust window (2.5x rig, head near the top) with a subtle backdrop gear
  const bx = x + 6, by = y + 6, bw = CARD_W - 12;
  ctx.fillStyle = '#1a1226'; ctx.fillRect(bx, by, bw, BUST_H);
  ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, BUST_H); ctx.clip();
  ctx.globalAlpha = 0.3; gear(ctx, bx + bw / 2, by + BUST_H / 2 + 20, 60, 12, '#3a2a48', null, 0, f * 0.004 + index, 20); ctx.globalAlpha = 1;
  ctx.restore();
  const tint = on > 1 ? '#1a2a5a' : null;
  drawBust(ctx, slot.rig, slot.anim.pose, slot.idle, bx, by, bw, BUST_H, BUST_SCALE, { facing: 1, margin: 20, tint, tintAlpha: 0.3 });
  rrect(ctx, bx, by, bw, BUST_H, 2, null, '#120c14', 1);
  rivetLine(ctx, x + 10, y + 5, x + CARD_W - 10, y + 5, 6, 1.5, UI.brass);
  rivetLine(ctx, x + 10, y + CARD_H - 5, x + CARD_W - 10, y + CARD_H - 5, 6, 1.5, UI.brass);
  // name / archetype / stat pips
  drawTextOutlined(ctx, d.name || d.id, x + CARD_W / 2, y + 108, { size: 2, color: UI.paper, outline: '#2a1410', align: 'center' });
  drawText(ctx, d.archetype || '', x + CARD_W / 2, y + 126, { size: 1, color: UI.brass, align: 'center' });
  const st = d.stats || {}, pipCol = on > 1 ? UI.brassLight : sel ? CURSOR_COLORS[first] : UI.brass;
  STATS.forEach((k, r) => {
    const yy = y + 140 + r * 11;
    drawText(ctx, STAT_LABELS[k], x + 10, yy, { size: 1, color: UI.steel });
    for (let p = 0; p < 5; p++) {
      const pipOn = p < (st[k] || 0);
      rrect(ctx, x + 40 + p * 18, yy - 1, 14, 8, 1, pipOn ? pipCol : '#332a3a', '#120c14', 0.5);
      if (pipOn) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 41 + p * 18, yy, 12, 1); }
    }
  });
  // A hero the other player has claimed is shaded out under everything the cursors draw, so their
  // ring and READY stamp still read clearly on top of it.
  if (taken) { ctx.fillStyle = 'rgba(12,8,16,0.45)'; ctx.fillRect(x + 1, y + 1, CARD_W - 2, CARD_H - 2); }
  // cursors: rotating gear rings in the four corners (RING_POS), READY stamp when any is locked
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!cursors[s]) continue;
    const [rx, ry] = RING_POS[s];
    drawCursorRing(ctx, x + rx, y + ry, 13, CURSOR_COLORS[s], (s % 2 ? -1 : 1) * f * 0.04, String(s + 1), drawText);
  }
  let firstConfirmed = -1, names = '';
  for (let s = 0; s < MAX_PLAYERS; s++) {
    if (!cursors[s] || !cursors[s].confirmed) continue;
    if (firstConfirmed < 0) firstConfirmed = s;
    names += (names ? '+' : '') + (cursors[s].label || `P${s + 1}`);
  }
  if (firstConfirmed >= 0) {
    let who = `${names} READY`;
    if (measureText(who, 1) > CARD_W - 44) who = names;
    rrect(ctx, x + 20, y + STAMP_Y, CARD_W - 40, 14, 3, 'rgba(10,6,14,0.85)', CURSOR_COLORS[firstConfirmed], 1);
    drawText(ctx, who, x + CARD_W / 2, y + STAMP_Y + 3, { size: 1, color: UI.brassLight, align: 'center' });
  }
}
