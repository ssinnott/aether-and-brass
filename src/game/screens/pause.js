// Pause overlay (transparent screen): RESUME / QUIT TO TITLE, P2 join prompt (ARCHITECTURE.md section 9, GDD 9).
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, rivetLine } from '../../art/shapes.js';

const ITEMS = ['RESUME', 'QUIT TO TITLE'];

/** Pause overlay. Start/Escape resumes; attack confirms the highlighted item. */
export class PauseScreen extends Screen {
  constructor(game) { super(game, 'pause'); this.transparent = true; }
  enter(params) { super.enter(params); this.cursor = 0; }
  update() {
    super.update();
    const inp = this.game.input;
    if (this.frame < 3) return;
    if (!inp.joined(1) && inp.joinPressed(1)) { inp.setJoined(1, true); this.game.audio.play('join'); }
    let resume = inp.globalPressed('pause');
    for (let i = 0; i < 2; i++) {
      if (!inp.joined(i)) continue;
      if (inp.pressed(i, 'start') || inp.pressed(i, 'jump')) resume = true;
      if (inp.pressed(i, 'up')) { this.cursor = (this.cursor + ITEMS.length - 1) % ITEMS.length; this.game.audio.play('menu_move'); }
      if (inp.pressed(i, 'down')) { this.cursor = (this.cursor + 1) % ITEMS.length; this.game.audio.play('menu_move'); }
      if (inp.pressed(i, 'attack')) {
        this.game.audio.play('menu_confirm');
        if (this.cursor === 0) resume = true;
        else { this.game.audio.music.stop(); this.game.fadeTo(() => this.game.reset('title'), 0.08); return; }
      }
    }
    if (resume) { this.game.audio.play('unpause'); this.game.pop(); }
  }
  draw(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const w = 220, h = 110, x = (VIEW_W - w) / 2, y = 110;
    rrect(ctx, x, y, w, h, 8, 'rgba(30,20,26,0.95)', UI.brass, 2);
    rivetLine(ctx, x + 10, y + 8, x + w - 10, y + 8, 9, 2, UI.brass);
    drawTextOutlined(ctx, 'PAUSED', VIEW_W / 2, y + 16, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    for (let i = 0; i < ITEMS.length; i++) {
      const sel = i === this.cursor;
      drawText(ctx, (sel ? '> ' : '  ') + ITEMS[i], VIEW_W / 2, y + 46 + i * 16, { size: 1, color: sel ? UI.white : UI.steel, align: 'center' });
    }
    if (!this.game.input.joined(1) && (this.frame % 60) < 40) drawText(ctx, 'P2 PRESS START TO JOIN', VIEW_W / 2, y + h - 16, { size: 1, color: UI.p2, align: 'center' });
    else drawText(ctx, 'ESC / START: RESUME', VIEW_W / 2, y + h - 16, { size: 1, color: UI.brassDark, align: 'center' });
  }
}
