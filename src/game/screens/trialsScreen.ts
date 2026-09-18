// Per-hero TRIALS list (issue #22), reachable from the training pause plate (row TRIALS). A transparent
// overlay two below itself is the TrainingScreen (stack: training, trainpause, trials); picking a trial
// calls TrainingScreen.setTrial and pops back through the trainpause plate's own resume() so the input
// buffer is consumed the same way every other resume is.
import { VIEW_W, VIEW_H, UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import { drawText } from '../../engine/text.ts';
import { drawPlate, drawMenuRows } from './pause.ts';
import { trialProgress } from '../trials.ts';
import { input } from '../../engine/input.ts';
import { confirmPressed, cancelPressed, escapePressed, confirmKey, backKey } from '../menuinput.ts';
// Type-only, every one of them: `import type` is erased by tsc, esbuild and node alike, so none of these
// adds an edge to the module graph the browser loads (the note at the top of screens/gameplay.ts).
import type { Game, ScreenParams } from '../game.ts';
import type { TrainingScreen } from './training.ts';
import type { TrainPauseScreen } from './trainpause.ts';
import type { FighterDef } from '../fighter.ts';

const PLATE_W = 300, ROWS_Y_OFF = 60, ROW_H = 14, FOOT_PAD = 40;

/**
 * The plate this overlay was pushed from, as the one line that reaches back through it uses it. The stack
 * holds a plain `Screen`; `resume` is TrainPauseScreen's, and it is optional here because that line already
 * guards for a screen without it (`tp && tp.resume`). The guard is the contract -- this type only names
 * what it guards for -- so nothing here may turn it into something the checker considers redundant.
 */
export type TrialsCaller = Screen & Partial<Pick<TrainPauseScreen, 'resume'>>;

/** Per-hero trial list with ticks (game/trials.js trialProgress). */
export class TrialsScreen extends Screen {
  // The fields, for the checker only, in the order enter() writes them. `declare` because these are
  // assignments and nothing else: a plain field declaration would emit a class field per name (es2022
  // defines them before the constructor body runs), which is a runtime change. Same reasoning, and the
  // same wording, as game/entity.ts's Entity.
  /** The training room, two below this overlay on the stack (see enter()). */
  declare tr: TrainingScreen;
  /** The hero whose trials these are, or null when the room has no body in slot 0 yet. */
  declare hero: FighterDef | null;
  /** That hero's trials (`def.trials`); empty for a hero with none, which the plate says so about. */
  declare list: Trial[];
  declare cursor: number;
  // Everything below is cached ONCE in enter(): the training screen underneath never updates while this
  // overlay is on top, so none of it can change for the overlay's whole life (see the note there).
  /** One display string per trial, tick included. */
  declare rows: string[];
  /** Plate height, grown to fit the list. */
  declare h: number;
  declare title: string;
  declare footer: string;

  constructor(game: Game) { super(game, 'trials'); this.transparent = true; }
  override enter(params: ScreenParams): void {
    super.enter(params);
    // stack is [..., training, trainpause, trials]: the training screen is two below this one.
    this.tr = this.game.screens[this.game.screens.length - 3] as TrainingScreen;
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
    this.footer = `${confirmKey(input)}: START   ${backKey(input)}: BACK   ${done}/${this.list.length} DONE`;
  }
  override update(): void {
    super.update();
    if (this.frame < 3) return;
    const inp = this.game.input, audio = this.game.audio;
    // Escape backs out here exactly as it does on trainpause / moves (review finding): this overlay is
    // local-only (training is single-player), so the netplay caveat that keeps pause.js from reading Escape
    // never applies. `start` is CONFIRM, not BACK (game/menuinput.js), so it starts the highlighted trial.
    const back = escapePressed(inp) || cancelPressed(inp, 0);
    // Read the back keys before the empty-list guard: a hero def with no trials (NO TRIALS) must still be
    // possible to back out of (review finding) -- there is no other way off this overlay.
    if (!this.list.length) {
      if (back) { audio.play('menu_back'); this.game.pop(); }
      return;
    }
    if (inp.pressed(0, 'up')) { this.cursor = (this.cursor + this.list.length - 1) % this.list.length; audio.play('menu_move'); }
    if (inp.pressed(0, 'down')) { this.cursor = (this.cursor + 1) % this.list.length; audio.play('menu_move'); }
    if (confirmPressed(inp, 0)) {
      audio.play('menu_confirm');
      this.tr.setTrial(this.list[this.cursor].id);
      this.game.pop();
      const tp = this.game.screen as TrialsCaller;
      if (tp && tp.resume) tp.resume(); // consumes the buffered attack press the same way trainpause's own resume does
      return;
    }
    if (back) { audio.play('menu_back'); this.game.pop(); }
  }
  override draw(ctx: CanvasRenderingContext2D): void {
    const f = this.frame, w = PLATE_W, h = this.h, x = (VIEW_W - w) / 2, y = Math.max(20, (VIEW_H - h) / 2);
    drawPlate(ctx, x, y, w, h, f, this.title);
    if (!this.list.length) { drawText(ctx, 'NO TRIALS', VIEW_W / 2, y + ROWS_Y_OFF, { size: 1, color: UI.steel, align: 'center' }); return; }
    drawMenuRows(ctx, this.rows, this.cursor, y + ROWS_Y_OFF, f, ROW_H);
    const hint = this.list[this.cursor] ? this.list[this.cursor].hint : '';
    if (hint) drawText(ctx, hint, VIEW_W / 2, y + ROWS_Y_OFF + this.list.length * ROW_H + 12, { size: 1, color: UI.steel, align: 'center' });
    drawText(ctx, this.footer, VIEW_W / 2, y + h - 14, { size: 1, color: UI.brassDark, align: 'center' });
  }
}
