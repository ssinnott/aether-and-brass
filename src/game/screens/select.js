// Character select (GDD 8/9): four 140x200 brass-framed cards with 2.5x rig busts, name, archetype, five 5-pip stat bars,
// hovered card plays its taunt, P1 cursor = white gear ring, P2 = cyan, attack locks / jump unlocks, both may pick the
// same hero (second copy tinted), READY state, then the stage intro. P2 drop-in on any P2 key.
// The cards themselves live in screens/charcards.js, shared with the online co-op lobby.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined, measureText } from '../../engine/text.js';
import { rrect, gear } from '../../art/shapes.js';
import { buildCharSlots, tickCharSlots, drawCharCard, cardX, charStrap, CARD_Y, P2_CURSOR } from './charcards.js';

const READY_FRAMES = 24;

/** Character select screen. Left/right moves the cursor, attack locks, jump/dodge unlocks (P1 dodge backs out). */
export class SelectScreen extends Screen {
  constructor(game) { super(game, 'select'); }
  enter(params) {
    super.enter(params);
    this.chars = this.game.characters;
    this.slots = buildCharSlots(this.chars);
    this.p = [
      { joined: true, cursor: 0, confirmed: false },
      { joined: this.game.input.joined(1), cursor: Math.min(1, Math.max(0, this.chars.length - 1)), confirmed: false },
    ];
    this.starting = false; this.readyTimer = -1;
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
        const chars = this.p.filter((ps) => ps.joined).map((ps) => ps.cursor);
        this.game.options.chars = chars;
        const next = this.game.factories.intro ? 'intro' : 'gameplay';
        this.game.fadeTo(() => this.game.replace(next, { chars }), 0.1);
      }
      return;
    }
    for (let i = 0; i < 2; i++) {
      const ps = this.p[i];
      if (!ps.joined) {
        if (inp.joinPressed(i)) { ps.joined = true; inp.setJoined(i, true); audio.play('join'); this.slots[ps.cursor].anim.play('taunt', { restart: true, fallback: 'idle' }); }
        continue;
      }
      if (ps.confirmed) {
        if (inp.pressed(i, 'dodge') || inp.pressed(i, 'jump')) { ps.confirmed = false; audio.play('menu_back'); this.slots[ps.cursor].anim.play('idle', { restart: true }); }
        continue;
      }
      let moved = false;
      if (inp.pressed(i, 'left')) { ps.cursor = (ps.cursor + n - 1) % n; moved = true; }
      if (inp.pressed(i, 'right')) { ps.cursor = (ps.cursor + 1) % n; moved = true; }
      if (moved) { audio.play('menu_move'); this.slots[ps.cursor].anim.play('taunt', { restart: true, fallback: 'idle' }); }
      if (inp.pressed(i, 'attack') || inp.pressed(i, 'start')) {
        ps.confirmed = true; audio.play('menu_confirm');
        this.slots[ps.cursor].anim.play('win', { restart: true });
      } else if (inp.pressed(i, 'dodge') && i === 0) {
        audio.play('menu_back');
        this.starting = true;
        // back out to wherever the board was chosen, so P1 can change board without restarting from the title
        const back = this.game.factories.boardselect ? 'boardselect' : 'title';
        this.game.fadeTo(() => this.game.replace(back), 0.08);
        return;
      }
    }
    const allReady = this.p.every((ps) => !ps.joined || ps.confirmed);
    if (allReady && this.p[0].confirmed) { this.readyTimer = 0; audio.play('rank_stamp'); }
  }
  draw(ctx) {
    const f = this.frame;
    ctx.fillStyle = '#1c1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.22; gear(ctx, 60, 320, 90, 14, '#3a2a48', null, 0, f * 0.004, 30); gear(ctx, 600, 30, 70, 12, '#3a2a48', null, 0, -f * 0.005, 24); ctx.globalAlpha = 1;
    drawTextOutlined(ctx, 'CHOOSE YOUR FIGHTER', 320, 8, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    const n = this.slots.length;
    if (!n) { drawText(ctx, 'NO CHARACTERS REGISTERED', 320, 170, { size: 1, color: UI.red, align: 'center' }); return; }
    const p1 = this.p[0], p2 = this.p[1];
    for (let i = 0; i < n; i++) {
      drawCharCard(ctx, this.slots[i], cardX(i, n), CARD_Y, f, {
        index: i,
        p1: p1.joined && p1.cursor === i ? { confirmed: p1.confirmed } : null,
        p2: p2.joined && p2.cursor === i ? { confirmed: p2.confirmed } : null,
      });
    }
    const strap = charStrap(this.chars[p1.cursor]);
    if (strap) drawText(ctx, strap, 320, 248, { size: 1, color: UI.paper, align: 'center' });
    if (p2.joined) { const s2 = charStrap(this.chars[p2.cursor]); if (s2) drawText(ctx, `P2: ${s2}`, 320, 262, { size: 1, color: P2_CURSOR, align: 'center' }); }
    else if ((f % 60) < 40) drawText(ctx, 'P2: PRESS J/K/U/L/O/I OR BACKSPACE TO JOIN', 320, 262, { size: 1, color: UI.p2, align: 'center' });
    if (p1.cursor === p2.cursor && p2.joined) drawText(ctx, 'SAME HERO: P2 WEARS A DARKER TINT', 320, 276, { size: 1, color: UI.steel, align: 'center' });
    if (this.readyTimer >= 0) {
      const k = Math.min(1, this.readyTimer / 6), sc = 5 - Math.round(2 * k), ty = 150 - sc * 3;
      const pw = measureText('READY!', sc) + 48, ph = sc * 7 + 20;
      rrect(ctx, 320 - pw / 2, ty - 10, pw, ph, 6, 'rgba(10,6,14,0.9)', UI.brass, 2);
      drawTextOutlined(ctx, 'READY!', 320, ty, { size: sc, color: UI.brassLight, outline: '#3a2010', thickness: 2, align: 'center' });
    }
    drawText(ctx, 'LEFT/RIGHT: CHOOSE   ATTACK: LOCK   JUMP: UNLOCK   DODGE: BACK', 320, 336, { size: 1, color: UI.steel, align: 'center' });
  }
}
