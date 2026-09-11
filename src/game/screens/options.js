// Options overlay (ARCHITECTURE.md section 16): a transparent brass plate pushed on top of the title
// or the pause plate (decision 1: overlay, not replace) with DIFFICULTY / MUSIC / SFX / MUTE /
// SCREEN SHAKE / CONTROLS / RESET TO DEFAULTS / BACK. Game.update() ticks only the top of the screen
// stack, so the opener (title heroes / steam, or gameplay under pause) freezes while this is up and
// resumes on pop, exactly like pause today. The CONTROLS row opens the key/gamepad remapping
// sub-plate in screens/controls.js; BACK / dodge / jump / Escape close whichever plate is showing.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, rivetLine, gear } from '../../art/shapes.js';
import { options, VOLUME_STEPS } from '../options.js';
import { createControlsPanel } from './controls.js';

const ROWS = ['DIFFICULTY', 'MUSIC', 'SFX', 'MUTE', 'SCREEN SHAKE', 'CONTROLS', 'RESET TO DEFAULTS', 'BACK'];
const R_DIFF = 0, R_MUSIC = 1, R_SFX = 2, R_MUTE = 3, R_SHAKE = 4, R_CONTROLS = 5, R_RESET = 6, R_BACK = 7;
const PLATE = { w: 320, h: 232, y: 76 };
const ROW_Y0 = 44, ROW_H = 16, LABEL_X = 18, VALUE_X = 170;
const SLIDER = { cellW: 8, gap: 2, h: 7 };
const SLIDER_W = VOLUME_STEPS * (SLIDER.cellW + SLIDER.gap) - SLIDER.gap;
const NOTICE_FRAMES = 90, SETTLE_FRAMES = 3, FIRST_INPUT_FRAME = 3;
// Rows end at y + 44 + 7*16 + 7 = y + 163; the notice/hint sit below that, clear of both rivet lines
// (top y + 9, bottom y + PLATE.h - 9 = y + 223) and the outer border (y + PLATE.h).
const HINT = 'ATTACK: SELECT  L/R: CHANGE  DODGE: BACK';
// Precomputed uppercase labels so draw() never calls toUpperCase() (no per-frame allocation).
const DIFF_LABELS = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD' };
const SHAKE_LABELS = { off: 'OFF', low: 'LOW', full: 'FULL' };
// Precomputed finished row strings so draw() never builds a template string per frame (no
// allocation in the draw path): DIFF_ROW / DIFF_ROW_LOCKED index by difficulty, MUTE_ROW by
// on/off, SHAKE_ROW by shake level, and STEP_LABELS gives String(n) for every slider value.
const DIFF_ROW = {};
const DIFF_ROW_LOCKED = {};
for (const d of Object.keys(DIFF_LABELS)) {
  DIFF_ROW[d] = `< ${DIFF_LABELS[d]} >`;
  DIFF_ROW_LOCKED[d] = `< ${DIFF_LABELS[d]} > NEXT BOARD`;
}
const MUTE_ROW = { on: '< ON >', off: '< OFF >' };
const SHAKE_ROW = {};
for (const s of Object.keys(SHAKE_LABELS)) SHAKE_ROW[s] = `< ${SHAKE_LABELS[s]} >`;
const STEP_LABELS = Array.from({ length: VOLUME_STEPS + 1 }, (_, i) => String(i));

/** Options overlay screen. Attack/start confirms a row; left/right changes it in place. */
export class OptionsScreen extends Screen {
  constructor(game) { super(game, 'options'); this.transparent = true; }
  enter(params = {}) {
    super.enter(params);
    // Pause already dims the frame behind it 60%; the title does not, so this overlay dims for
    // itself unless the opener passes `dim: false` (pause.js does).
    this.dim = params.dim !== false;
    // pause.js sets this: the running board already cached its difficulty multipliers at enter()
    // (gameplay.js) and never re-reads them, so a mid-board change would show a value the board is
    // not actually using. The row is locked (greyed, no-op) until the next board.
    this.lockDifficulty = !!params.lockDifficulty;
    this.cursor = 0;
    this.panel = 'main';
    this.controls = createControlsPanel(this);
    this.notice = '';
    this.noticeTimer = 0;
    this.settle = 0;
  }
  exit() { this.controls.dispose(); }
  update() {
    super.update();
    if (this.frame < FIRST_INPUT_FRAME) return;
    if (this.settle > 0) { this.settle--; return; }
    if (this.noticeTimer > 0) this.noticeTimer--;
    if (this.panel === 'controls') { this.controls.update(); return; }
    const inp = this.game.input, audio = this.game.audio;
    for (let p = 0; p < inp.playerCount; p++) {
      if (!inp.joined(p)) continue;
      if (inp.pressed(p, 'up')) { this.cursor = (this.cursor + ROWS.length - 1) % ROWS.length; audio.play('menu_move'); }
      if (inp.pressed(p, 'down')) { this.cursor = (this.cursor + 1) % ROWS.length; audio.play('menu_move'); }
      const dir = (inp.pressed(p, 'right') ? 1 : 0) - (inp.pressed(p, 'left') ? 1 : 0);
      if (dir) {
        if (this.cursor === R_DIFF) { if (!this.lockDifficulty) { options.cycle('difficulty', dir); this.game.options.difficulty = options.difficulty(); audio.play('menu_move'); } }
        else if (this.cursor === R_MUSIC) { if (options.adjust('music', dir)) audio.play('menu_move'); }
        else if (this.cursor === R_SFX) { if (options.adjust('sfx', dir)) audio.play('menu_move'); }
        else if (this.cursor === R_MUTE) { audio.setMuted(!audio.muted); audio.play('menu_move'); }
        else if (this.cursor === R_SHAKE) { options.cycle('shake', dir); audio.play('menu_move'); }
      }
      if (inp.pressed(p, 'attack') || inp.pressed(p, 'start')) { this.activate(this.cursor); return; }
      if (inp.pressed(p, 'dodge') || inp.pressed(p, 'jump') || inp.globalPressed('pause')) { this.close(); return; }
    }
  }
  activate(i) {
    const audio = this.game.audio;
    if (i === R_DIFF) { if (!this.lockDifficulty) { options.cycle('difficulty', 1); this.game.options.difficulty = options.difficulty(); audio.play('menu_move'); } }
    else if (i === R_SHAKE) { options.cycle('shake', 1); audio.play('menu_move'); }
    else if (i === R_MUTE) { audio.setMuted(!audio.muted); audio.play('menu_move'); }
    else if (i === R_CONTROLS) { this.panel = 'controls'; this.controls.open(); audio.play('menu_confirm'); }
    else if (i === R_RESET) {
      options.reset();
      this.game.options.difficulty = options.difficulty();
      this.showNotice('DEFAULTS RESTORED');
      audio.play('menu_confirm');
    } else if (i === R_BACK) this.close();
  }
  close() { this.game.audio.play('menu_back'); this.game.pop(); }
  showNotice(text) { this.notice = text; this.noticeTimer = NOTICE_FRAMES; }
  /** Called by the controls panel when it backs out to this plate. */
  closeControls() { this.controls.close(); this.panel = 'main'; this.settle = SETTLE_FRAMES; }
  draw(ctx) {
    if (this.dim) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.panel === 'controls') { this.controls.draw(ctx); return; }
    const x = (VIEW_W - PLATE.w) / 2, y = PLATE.y, f = this.frame;
    rrect(ctx, x, y, PLATE.w, PLATE.h, 8, 'rgba(30,20,26,0.96)', UI.brass, 2);
    rrect(ctx, x + 4, y + 4, PLATE.w - 8, PLATE.h - 8, 6, null, UI.brassDark, 1);
    rivetLine(ctx, x + 12, y + 9, x + PLATE.w - 12, y + 9, 10, 2, UI.brass);
    rivetLine(ctx, x + 12, y + PLATE.h - 9, x + PLATE.w - 12, y + PLATE.h - 9, 10, 2, UI.brass);
    ctx.globalAlpha = 0.25;
    gear(ctx, x + PLATE.w - 26, y + 30, 18, 8, UI.brass, null, 0, f * 0.02, 6);
    gear(ctx, x + 24, y + PLATE.h - 30, 12, 8, UI.copper, null, 0, -f * 0.03, 4);
    ctx.globalAlpha = 1;
    drawTextOutlined(ctx, 'OPTIONS', VIEW_W / 2, y + 16, { size: 2, color: UI.brassLight, outline: '#3a2010', align: 'center' });
    for (let i = 0; i < ROWS.length; i++) {
      const locked = i === R_DIFF && this.lockDifficulty;
      const sel = i === this.cursor, yy = y + ROW_Y0 + i * ROW_H, color = locked ? UI.brassDark : sel ? UI.white : UI.steel;
      if (sel && !locked) gear(ctx, x + LABEL_X - 12, yy + 4, 5, 6, UI.brass, '#3a2010', 1, f * 0.05, 1.5);
      drawText(ctx, ROWS[i], x + LABEL_X, yy, { size: 1, color });
      if (i === R_DIFF) drawText(ctx, (locked ? DIFF_ROW_LOCKED : DIFF_ROW)[options.difficulty()], x + VALUE_X, yy, { size: 1, color });
      else if (i === R_MUTE) drawText(ctx, MUTE_ROW[this.game.audio.muted ? 'on' : 'off'], x + VALUE_X, yy, { size: 1, color });
      else if (i === R_SHAKE) drawText(ctx, SHAKE_ROW[options.get('shake')], x + VALUE_X, yy, { size: 1, color });
      else if (i === R_MUSIC) drawVolumeRow(ctx, x + VALUE_X, yy, options.get('music'), sel, color);
      else if (i === R_SFX) drawVolumeRow(ctx, x + VALUE_X, yy, options.get('sfx'), sel, color);
      else if (i === R_CONTROLS) drawText(ctx, '>', x + VALUE_X, yy, { size: 1, color });
    }
    if (this.noticeTimer > 0) drawText(ctx, this.notice, VIEW_W / 2, y + PLATE.h - 34, { size: 1, color: UI.teal, align: 'center' });
    drawText(ctx, HINT, VIEW_W / 2, y + PLATE.h - 22, { size: 1, color: UI.brassDark, align: 'center' });
  }
  summary() {
    return {
      screen: 'options', panel: this.panel, cursor: this.cursor, notice: this.notice,
      lockDifficulty: this.lockDifficulty,
      difficulty: options.difficulty(), music: options.get('music'), sfx: options.get('sfx'),
      shake: options.get('shake'), muted: this.game.audio.muted, ...this.controls.summary(),
    };
  }
}

function drawVolumeRow(ctx, x, y, value, sel, color) {
  drawSlider(ctx, x, y + 1, value, sel);
  drawText(ctx, STEP_LABELS[value], x + SLIDER_W + 4, y, { size: 1, color });
}
/** A row of VOLUME_STEPS cells, filled brass up to `value`, in a dark trough. */
function drawSlider(ctx, x, y, value, sel) {
  ctx.fillStyle = '#120c14';
  ctx.fillRect(x - 1, y - 1, SLIDER_W + 2, SLIDER.h + 2);
  for (let i = 0; i < VOLUME_STEPS; i++) {
    ctx.fillStyle = i < value ? (sel ? UI.brassLight : UI.brass) : '#2a1c20';
    ctx.fillRect(x + i * (SLIDER.cellW + SLIDER.gap), y, SLIDER.cellW, SLIDER.h);
  }
}
