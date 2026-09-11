// Pause overlay (GDD 9 + RECONCILIATION): 60% dim, brass plate with RESUME / MUTE / OPTIONS / QUIT TO
// TITLE, P2 join hint. OPTIONS is hidden under netplay (ITEMS_ONLINE): pause is pushed on both peers by a
// masked start press and key capture is local-only, so the two screen stacks would diverge if either peer
// could open it; options stays reachable from the title before/after a session (decision 3). OPTIONS is
// pushed with `lockDifficulty: true`: gameplay.js caches the board's difficulty multipliers at enter() and
// never re-reads them mid-board, so the DIFFICULTY row is locked while paused (it still applies from the
// next board) to avoid showing a value the running board is not actually using.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, rivetLine, gear } from '../../art/shapes.js';

const ITEMS_LOCAL = ['RESUME', 'MUTE', 'OPTIONS', 'QUIT TO TITLE'];
const ITEMS_ONLINE = ['RESUME', 'MUTE', 'QUIT TO TITLE'];
const PLATE_W = 240, PLATE_BASE_H = 84, ROW_H = 16, PLATE_Y = 104;

/** Pause overlay. Start/Escape resumes; attack confirms the highlighted item. */
export class PauseScreen extends Screen {
  constructor(game) { super(game, 'pause'); this.transparent = true; }
  enter(params) {
    super.enter(params);
    this.cursor = 0;
    this.items = (this.game.net && this.game.net.active) ? ITEMS_ONLINE : ITEMS_LOCAL;
  }
  update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio;
    const online = !!(this.game.net && this.game.net.active);
    if (this.frame < 3) return;
    // P2 drop-in: the join key itself never doubles as a menu press, and the player is added to the gameplay screen
    // beneath (its own drop-in only fires on a join edge, which this overlay has consumed)
    let joinedNow = false;
    if (!online && !inp.joined(1) && inp.joinPressed(1)) { inp.setJoined(1, true); joinedNow = true; audio.play('join'); this.addP2(); }
    let resume = !online && inp.globalPressed('pause');   // netplay resumes through the `start` bit
    for (let i = 0; i < 2; i++) {
      if (!inp.joined(i) || (i === 1 && joinedNow)) continue;
      if (inp.pressed(i, 'start') || inp.pressed(i, 'jump')) resume = true;
      if (inp.pressed(i, 'up')) { this.cursor = (this.cursor + this.items.length - 1) % this.items.length; audio.play('menu_move'); }
      if (inp.pressed(i, 'down')) { this.cursor = (this.cursor + 1) % this.items.length; audio.play('menu_move'); }
      const item = this.items[this.cursor];
      if ((inp.pressed(i, 'left') || inp.pressed(i, 'right')) && item === 'MUTE') { audio.toggleMute(); audio.play('menu_move'); }
      if (inp.pressed(i, 'attack')) {
        if (item === 'RESUME') { audio.play('menu_confirm'); resume = true; }
        else if (item === 'MUTE') { audio.toggleMute(); audio.play('menu_confirm'); }
        else if (item === 'OPTIONS') { audio.play('menu_confirm'); this.game.push('options', { dim: false, lockDifficulty: true }); return; }
        else { audio.play('menu_confirm'); audio.music.stop(); this.game.fadeTo(() => this.game.reset('title'), 0.08); return; }
      }
    }
    if (resume) { audio.play('unpause'); this.consumeBuffers(); this.game.pop(); }
  }
  /** The RESUME press must not leak into gameplay through the input buffer as an attack / jump. */
  consumeBuffers() {
    for (let p = 0; p < 2; p++) for (const a of ['attack', 'jump', 'special', 'super', 'dodge', 'taunt']) this.game.input.consume(p, a);
  }
  addP2() {
    const gp = this.game.screens[this.game.screens.length - 2];
    if (!gp || typeof gp.addPlayer !== 'function' || !gp.players || gp.players.length >= 2) return;
    const ci = this.game.options.chars[1] != null ? this.game.options.chars[1] : 1;
    gp.addPlayer(ci, 1);
    if (gp.hud && gp.hud.showBanner) gp.hud.showBanner('P2 JOINS!', '', 60);
  }
  draw(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const w = PLATE_W, h = PLATE_BASE_H + this.items.length * ROW_H, x = (VIEW_W - w) / 2, y = PLATE_Y, f = this.frame;
    rrect(ctx, x, y, w, h, 8, 'rgba(30,20,26,0.96)', UI.brass, 2);
    rrect(ctx, x + 4, y + 4, w - 8, h - 8, 6, null, UI.brassDark, 1);
    rivetLine(ctx, x + 12, y + 9, x + w - 12, y + 9, 10, 2, UI.brass);
    rivetLine(ctx, x + 12, y + h - 9, x + w - 12, y + h - 9, 10, 2, UI.brass);
    ctx.globalAlpha = 0.25; gear(ctx, x + w - 26, y + 30, 18, 8, UI.brass, null, 0, f * 0.02, 6); gear(ctx, x + 24, y + h - 30, 12, 8, UI.copper, null, 0, -f * 0.03, 4); ctx.globalAlpha = 1;
    drawTextOutlined(ctx, 'PAUSED', VIEW_W / 2, y + 18, { size: 2, color: UI.brassLight, outline: '#3a2010', align: 'center' });
    for (let i = 0; i < this.items.length; i++) {
      const sel = i === this.cursor, yy = y + 48 + i * ROW_H;
      let label = this.items[i];
      if (label === 'MUTE') label = `MUTE  < ${this.game.audio.muted ? 'ON' : 'OFF'} >`;
      if (sel) gear(ctx, VIEW_W / 2 - (label.length * 6) / 2 - 12, yy + 4, 5, 6, UI.brass, '#3a2010', 1, f * 0.05, 1.5);
      drawText(ctx, label, VIEW_W / 2, yy, { size: 1, color: sel ? UI.white : UI.steel, align: 'center' });
    }
    if (!this.game.input.joined(1) && (f % 60) < 40) drawText(ctx, this.game.input.joinHint(1), VIEW_W / 2, y + h - 22, { size: 1, color: UI.p2, align: 'center' });
    else drawText(ctx, 'ESC / START: RESUME', VIEW_W / 2, y + h - 22, { size: 1, color: UI.brassDark, align: 'center' });
  }
}
