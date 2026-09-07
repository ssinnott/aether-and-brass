// Game over / continue overlay (GDD 9): frozen gameplay beneath, grey overlay, "CONTINUE? 9..0" countdown.
// Attack / start with continues left -> continue (fresh lives, full HP); timeout or no continues -> title.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, rivetLine, gear } from '../../art/shapes.js';

const COUNTDOWN_FRAMES = 600;

/** Transparent overlay pushed by the gameplay screen when every player is out. */
export class GameOverScreen extends Screen {
  constructor(game) { super(game, 'gameover'); this.transparent = true; }
  enter(params) {
    super.enter(params);
    this.gameplay = params.screen || null;
    this.continues = params.continues != null ? params.continues : 0;
    this.timer = COUNTDOWN_FRAMES;
    this.lastDigit = 10; this.crack = 0; this.expired = false; this.leaving = false;
    this.game.audio.music.play('gameover');
  }
  get digit() { return Math.max(0, Math.ceil(this.timer / 60)); }
  update() {
    super.update();
    if (this.leaving) return;
    const inp = this.game.input;
    if (this.crack > 0) this.crack--;
    if (!this.expired) {
      this.timer--;
      const d = this.digit;
      if (d !== this.lastDigit) { this.lastDigit = d; this.crack = 8; this.game.audio.play('continue_tick'); }
      let go = false;
      for (let p = 0; p < 2; p++) if (inp.joined(p) && (inp.pressed(p, 'attack') || inp.pressed(p, 'start'))) go = true;
      if (this.game.options.bot && this.frame > 30) go = true;
      if (go && this.continues > 0 && this.gameplay) {
        this.leaving = true;
        this.game.audio.play('menu_confirm');
        this.game.fadeTo(() => { this.game.pop(); this.gameplay.continueRun(); }, 0.1);
        return;
      }
      if (this.timer <= 0 || (go && this.continues <= 0)) { this.expired = true; this.timer = 150; this.game.audio.play('game_over'); }
    } else if (--this.timer <= 0) {
      // GDD 9: expiry -> "THE ENGINE WINS." then the results plaque with a D-rank ceiling
      this.leaving = true;
      const gp = this.gameplay;
      this.game.fadeTo(() => { this.game.pop(); if (gp && gp.showResults) gp.showResults(true); else this.game.reset('title'); }, 0.05);
    }
  }
  draw(ctx) {
    ctx.fillStyle = 'rgba(40,40,48,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const w = 300, h = 150, x = (VIEW_W - w) / 2, y = 100;
    rrect(ctx, x, y, w, h, 8, 'rgba(24,16,20,0.95)', UI.brass, 2);
    rivetLine(ctx, x + 10, y + 8, x + w - 10, y + 8, 12, 2, UI.brass);
    rivetLine(ctx, x + 10, y + h - 8, x + w - 10, y + h - 8, 12, 2, UI.brass);
    if (this.expired) {
      drawTextOutlined(ctx, 'THE ENGINE WINS.', VIEW_W / 2, y + 40, { size: 2, color: UI.red, outline: '#2a1010', thickness: 1, align: 'center' });
      drawText(ctx, 'GAME OVER', VIEW_W / 2, y + 80, { size: 2, color: UI.paper, align: 'center' });
      return;
    }
    drawTextOutlined(ctx, 'CONTINUE?', VIEW_W / 2, y + 22, { size: 3, color: UI.brass, outline: '#3a2010', thickness: 1, align: 'center' });
    const shake = this.crack > 0 ? (this.crack % 2 ? 2 : -2) : 0;
    gear(ctx, VIEW_W / 2 + shake, y + 86, 26, 10, this.crack > 0 ? '#ffffff' : '#3a3040', UI.brass, 2, this.frame * 0.01, 0);
    drawTextOutlined(ctx, String(this.digit), VIEW_W / 2 + shake, y + 72, { size: 4, color: this.crack > 0 ? '#ffffff' : UI.paper, outline: '#2a1410', thickness: 1, align: 'center' });
    const msg = this.continues > 0 ? `ATTACK OR START TO CONTINUE   (${this.continues} LEFT)` : 'NO CONTINUES LEFT';
    if ((this.frame % 40) < 28) drawText(ctx, msg, VIEW_W / 2, y + h - 26, { size: 1, color: this.continues > 0 ? UI.paper : UI.red, align: 'center' });
  }
}
