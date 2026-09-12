// Character select (GDD 8/9): up to four 140x200 brass-framed cards with 2.5x rig busts, name, archetype,
// five 5-pip stat bars, hovered card plays its taunt, four cursors (P1 white, P2 cyan, P3 violet, P4
// magenta), attack locks / jump unlocks, any two (or more) may pick the same hero (later copies wear a
// tint), READY state, then the stage intro. P2-P4 drop in on any of their own keys/pad buttons (issue #23).
// The cards themselves live in screens/charcards.js, shared with the online co-op lobby.
import { VIEW_W, VIEW_H, UI, MAX_PLAYERS, PLAYER_COLORS } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined, measureText } from '../../engine/text.js';
import { rrect, gear } from '../../art/shapes.js';
import { buildCharSlots, tickCharSlots, drawCharCard, cardX, charStrap, CARD_Y } from './charcards.js';
import { shieldLabel } from '../shield.js';
import { joinHint } from '../party.js';
import { input } from '../../engine/input.js';
import { confirmPressed, cancelPressed, escapePressed, confirmKey, backKey } from '../menuinput.js';

const READY_FRAMES = 24;
const SLOT_GAP = 18;

/** Character select screen. Left/right moves a cursor; CONFIRM (ENTER or attack) locks a hero and BACK
 *  (Escape, jump or dodge) unlocks it -- or, from an unlocked P1, leaves the screen (game/menuinput.js). */
export class SelectScreen extends Screen {
  constructor(game) { super(game, 'select'); }
  enter(params) {
    super.enter(params);
    this.chars = this.game.characters;
    this.slots = buildCharSlots(this.chars);
    // issue #22: the TRAINING route caps the room at one player (TrainingScreen.maxPlayers), so slots 1-3
    // never join here -- a slot already claimed before select (title.js P2 drop-in) is ignored outright,
    // not merely blocked from confirming, or its card cursor and "same hero" bookkeeping would still show it.
    this.single = params.next === 'training';
    // A slot claimed on the title screen (P2 drop-in) must be released here too, or input.joined(1) stays
    // true all the way into the single-player training room with no P2 player: P2's start would pause the
    // room and P2's own keys would drive the training plate, trials and moves overlays (review finding).
    if (this.single) for (let i = 1; i < MAX_PLAYERS; i++) if (this.game.input.joined(i)) this.game.input.setJoined(i, false);
    this.p = Array.from({ length: MAX_PLAYERS }, (_, i) => ({
      joined: i === 0 || (!this.single && this.game.input.joined(i)),
      cursor: Math.min(i, Math.max(0, this.chars.length - 1)),
      confirmed: false,
    }));
    this.cardCursors = this.slots.map(() => new Array(MAX_PLAYERS).fill(null));
    this.dirty = true; this.joinKey = -1; this.hint = ''; this.slotLine = []; this.sameHero = false;
    this.starting = false; this.readyTimer = -1;
    this.keysHint = `LEFT/RIGHT: CHOOSE   ${confirmKey(input)}: LOCK   ${backKey(input)}: UNLOCK / BACK`;
    this.game.audio.music.play('title');
    if (this.slots[0]) this.slots[0].anim.play('taunt', { restart: true, fallback: 'idle' });
  }
  update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio, n = this.chars.length;
    tickCharSlots(this.slots);
    if (!n || this.starting) return;
    if (this.readyTimer >= 0) {
      if (++this.readyTimer >= READY_FRAMES) {
        this.starting = true;
        const chars = this.p.map((ps) => (ps.joined ? ps.cursor : null));
        while (chars.length > 1 && chars[chars.length - 1] == null) chars.pop();
        this.game.options.chars = chars;
        // issue #22: the title's TRAINING row routes here with params.next = 'training'; every other
        // caller (BOARD SELECT) keeps the intro/gameplay default.
        const next = this.params.next || (this.game.factories.intro ? 'intro' : 'gameplay');
        this.game.fadeTo(() => this.game.replace(next, { chars }), 0.1);
      }
      return;
    }
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const ps = this.p[i];
      if (!ps.joined) {
        if (!this.single && inp.joinPressed(i)) { ps.joined = true; inp.setJoined(i, true); audio.play('join'); this.slots[ps.cursor].anim.play('taunt', { restart: true, fallback: 'idle' }); this.dirty = true; }
        continue;
      }
      if (ps.confirmed) {
        if (cancelPressed(inp, i) || (i === 0 && escapePressed(inp))) { ps.confirmed = false; audio.play('menu_back'); this.slots[ps.cursor].anim.play('idle', { restart: true }); this.dirty = true; }
        continue;
      }
      let moved = false;
      if (inp.pressed(i, 'left')) { ps.cursor = (ps.cursor + n - 1) % n; moved = true; }
      if (inp.pressed(i, 'right')) { ps.cursor = (ps.cursor + 1) % n; moved = true; }
      if (moved) { audio.play('menu_move'); this.slots[ps.cursor].anim.play('taunt', { restart: true, fallback: 'idle' }); this.dirty = true; }
      if (confirmPressed(inp, i)) {
        ps.confirmed = true; audio.play('menu_confirm');
        this.slots[ps.cursor].anim.play('win', { restart: true });
        this.dirty = true;
      } else if (i === 0 && (cancelPressed(inp, i) || escapePressed(inp))) {
        audio.play('menu_back');
        this.starting = true;
        // back out to wherever the board was chosen, so P1 can change board without restarting from the title
        // (params.back = 'title' for the TRAINING route: there is no board to return to)
        const back = this.params.back || (this.game.factories.boardselect ? 'boardselect' : 'title');
        this.game.fadeTo(() => this.game.replace(back), 0.08);
        return;
      }
    }
    const allReady = this.p.every((ps) => !ps.joined || ps.confirmed);
    if (allReady && this.p[0].confirmed) { this.readyTimer = 0; audio.play('rank_stamp'); }
    if (this.dirty) { this.rebuild(); this.dirty = false; }
    const k = inp.joinState();
    if (this.single) this.hint = '';
    else if (k !== this.joinKey) {
      this.joinKey = k;
      const h = joinHint(inp);
      // Free slot 1 has its own keyboard half; the composite hint's short form for it is swapped
      // for #19's long "PRESS X/Y/Z OR W" list, which is worth the extra width on this screen alone.
      this.hint = !inp.joined(1) ? h.replace(inp.joinHint(1), inp.joinKeysHint(1)) : h;
    }
  }
  /** Rebuild the per-card cursor matrix, the joined-slot status line and the same-hero flag.
   *  Called only when `this.dirty` (a join / move / confirm / unconfirm happened this frame). */
  rebuild() {
    const n = this.slots.length;
    for (let c = 0; c < n; c++) {
      const col = this.cardCursors[c];
      for (let s = 0; s < MAX_PLAYERS; s++) col[s] = this.p[s].joined && this.p[s].cursor === c ? { confirmed: this.p[s].confirmed } : null;
    }
    const parts = [];
    for (let s = 1; s < MAX_PLAYERS; s++) {
      const ps = this.p[s];
      if (!ps.joined) continue;
      const d = this.chars[ps.cursor];
      const text = `P${s + 1} ${(d && (d.name || d.id)) || '?'}`;
      parts.push({ text, color: PLAYER_COLORS[s], w: measureText(text, 1) });
    }
    let totalW = 0;
    for (const p of parts) totalW += p.w;
    totalW += Math.max(0, parts.length - 1) * SLOT_GAP;
    let x = 320 - totalW / 2;
    for (const p of parts) { p.x = x + p.w / 2; x += p.w + SLOT_GAP; }
    this.slotLine = parts;
    let sameHero = false;
    for (let a = 0; a < MAX_PLAYERS && !sameHero; a++) {
      if (!this.p[a].joined) continue;
      for (let b = a + 1; b < MAX_PLAYERS; b++) if (this.p[b].joined && this.p[b].cursor === this.p[a].cursor) { sameHero = true; break; }
    }
    this.sameHero = sameHero;
  }
  draw(ctx) {
    const f = this.frame;
    ctx.fillStyle = '#1c1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.22; gear(ctx, 60, 320, 90, 14, '#3a2a48', null, 0, f * 0.004, 30); gear(ctx, 600, 30, 70, 12, '#3a2a48', null, 0, -f * 0.005, 24); ctx.globalAlpha = 1;
    const heading = this.params.next === 'training' ? 'TRAINING ROOM' : 'CHOOSE YOUR FIGHTER';
    drawTextOutlined(ctx, heading, 320, 8, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    const n = this.slots.length;
    if (!n) { drawText(ctx, 'NO CHARACTERS REGISTERED', 320, 170, { size: 1, color: UI.red, align: 'center' }); return; }
    const p1 = this.p[0];
    for (let i = 0; i < n; i++) {
      drawCharCard(ctx, this.slots[i], cardX(i, n), CARD_Y, f, { index: i, cursors: this.cardCursors[i] });
    }
    // the shield line sits between the cards and the strapline: it is the one hero stat the five pips do not show
    const sh = shieldLabel(this.chars[p1.cursor]);
    if (sh) drawText(ctx, sh, 320, 238, { size: 1, color: UI.brass, align: 'center' });
    const strap = charStrap(this.chars[p1.cursor]);
    if (strap) drawText(ctx, strap, 320, 248, { size: 1, color: UI.paper, align: 'center' });
    for (const p of this.slotLine) drawText(ctx, p.text, p.x, 262, { size: 1, color: p.color, align: 'center' });
    if (this.hint && (f % 60) < 40) drawText(ctx, this.hint, 320, 276, { size: 1, color: UI.steel, align: 'center' });
    if (this.sameHero) drawText(ctx, 'SAME HERO: LATER COPIES WEAR A TINT', 320, 290, { size: 1, color: UI.steel, align: 'center' });
    if (this.readyTimer >= 0) {
      const k = Math.min(1, this.readyTimer / 6), sc = 5 - Math.round(2 * k), ty = 150 - sc * 3;
      const pw = measureText('READY!', sc) + 48, ph = sc * 7 + 20;
      rrect(ctx, 320 - pw / 2, ty - 10, pw, ph, 6, 'rgba(10,6,14,0.9)', UI.brass, 2);
      drawTextOutlined(ctx, 'READY!', 320, ty, { size: sc, color: UI.brassLight, outline: '#3a2010', thickness: 2, align: 'center' });
    }
    drawText(ctx, this.keysHint, 320, 336, { size: 1, color: UI.steel, align: 'center' });
  }
}
