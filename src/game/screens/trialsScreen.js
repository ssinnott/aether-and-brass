// Per-hero TRIALS list (issue #22), reachable from the training pause plate (row TRIALS). A transparent
// overlay two below itself is the TrainingScreen (stack: training, trainpause, trials); picking a trial
// calls TrainingScreen.setTrial and pops back through the trainpause plate's own resume() so the input
// buffer is consumed the same way every other resume is.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText } from '../../engine/text.js';
import { drawPlate, drawMenuRows } from './pause.js';
import { trialProgress } from '../trials.js';

const PLATE_W = 300, ROWS_Y_OFF = 60, ROW_H = 14, FOOT_PAD = 40;

/** Per-hero trial list with ticks (game/trials.js trialProgress). */
export class TrialsScreen extends Screen {
  constructor(game) { super(game, 'trials'); this.transparent = true; }
  enter(params) {
    super.enter(params);
    // stack is [..., training, trainpause, trials]: the training screen is two below this one.
    this.tr = this.game.screens[this.game.screens.length - 3];
    this.hero = this.tr && this.tr.players[0] ? this.tr.players[0].def : null;
    this.list = (this.hero && this.hero.trials) || [];
    this.cursor = Math.max(0, this.list.findIndex((t) => this.tr && this.tr.trialDef && t.id === this.tr.trialDef.id));
    this.rows = this.list.map((t) => `${trialProgress.isDone(this.hero.id, t.id) ? '[X] ' : '[ ] '}${t.name}`);
    this.h = ROWS_Y_OFF + this.list.length * ROW_H + FOOT_PAD;
    // Cached once: the training screen underneath never updates while this overlay is on top (game.js only
    // updates the top screen), so trialProgress and the list are fixed for the overlay's whole life -- draw()
    // must not rebuild these every frame (no-allocation-in-draw-paths contract).
    this.title = `${this.hero ? this.hero.name : ''} TRIALS`;
    const done = this.list.filter((t) => trialProgress.isDone(this.hero.id, t.id)).length;
    this.footer = `ATTACK: START   JUMP: BACK   ${done}/${this.list.length} DONE`;
  }
  update() {
    super.update();
    if (this.frame < 3) return;
    const inp = this.game.input, audio = this.game.audio;
    // Escape backs out here exactly as it does on trainpause / moves (review finding): this overlay is
    // local-only (training is single-player), so the netplay caveat that keeps pause.js from reading Escape
    // never applies.
    const back = inp.globalPressed('pause') || inp.pressed(0, 'jump') || inp.pressed(0, 'dodge') || inp.pressed(0, 'start');
    // Read the back keys before the empty-list guard: a hero def with no trials (NO TRIALS) must still be
    // possible to back out of (review finding) -- there is no other way off this overlay.
    if (!this.list.length) {
      if (back) { audio.play('menu_back'); this.game.pop(); }
      return;
    }
    if (inp.pressed(0, 'up')) { this.cursor = (this.cursor + this.list.length - 1) % this.list.length; audio.play('menu_move'); }
    if (inp.pressed(0, 'down')) { this.cursor = (this.cursor + 1) % this.list.length; audio.play('menu_move'); }
    if (inp.pressed(0, 'attack')) {
      audio.play('menu_confirm');
      this.tr.setTrial(this.list[this.cursor].id);
      this.game.pop();
      const tp = this.game.screen;
      if (tp && tp.resume) tp.resume(); // consumes the buffered attack press the same way trainpause's own resume does
      return;
    }
    if (back) { audio.play('menu_back'); this.game.pop(); }
  }
  draw(ctx) {
    const f = this.frame, w = PLATE_W, h = this.h, x = (VIEW_W - w) / 2, y = Math.max(20, (VIEW_H - h) / 2);
    drawPlate(ctx, x, y, w, h, f, this.title);
    if (!this.list.length) { drawText(ctx, 'NO TRIALS', VIEW_W / 2, y + ROWS_Y_OFF, { size: 1, color: UI.steel, align: 'center' }); return; }
    drawMenuRows(ctx, this.rows, this.cursor, y + ROWS_Y_OFF, f, ROW_H);
    const hint = this.list[this.cursor] ? this.list[this.cursor].hint : '';
    if (hint) drawText(ctx, hint, VIEW_W / 2, y + ROWS_Y_OFF + this.list.length * ROW_H + 12, { size: 1, color: UI.steel, align: 'center' });
    drawText(ctx, this.footer, VIEW_W / 2, y + h - 14, { size: 1, color: UI.brassDark, align: 'center' });
  }
}
