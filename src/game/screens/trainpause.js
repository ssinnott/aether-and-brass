// Training pause plate (issue #22): DUMMY behaviour / variant / facing, REFILL HEALTH, METER lock,
// HITBOXES, FRAME DATA, RESET POSITIONS, MOVES, TRIALS, COMMANDS, QUIT TO TITLE. A transparent overlay on top of
// TrainingScreen (the room stays visible underneath -- there is no dim rect, unlike pause.js, so a
// setting's effect on the dummy can be previewed while the plate is up). Built from the same
// drawPlate/drawMenuRows/consumeMenuBuffers helpers pause.js exports so every brass plate matches.
import { VIEW_W, UI, MAX_PLAYERS } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText } from '../../engine/text.js';
import { drawPlate, drawMenuRows, consumeMenuBuffers } from './pause.js';
import { DUMMY_MODES, METER_LOCKS } from './training.js';

const PLATE_W = 260, PLATE_Y = 52, PLATE_H = 250, ROWS_Y0 = PLATE_Y + 40, ROW_H = 14;
const DUMMY_LABEL = { stand: 'STAND', block: 'BLOCK-STAGGER', cpu: 'CPU' };
const METER_LABEL = { normal: 'NORMAL', full: 'LOCK FULL', empty: 'LOCK EMPTY' };
const ROWS = ['RESUME', 'DUMMY', 'VARIANT', 'FACING', 'REFILL HEALTH', 'METER', 'HITBOXES', 'FRAME DATA', 'RESET POSITIONS', 'MOVES', 'TRIALS', 'COMMANDS', 'QUIT TO TITLE'];
const R = { RESUME: 0, DUMMY: 1, VARIANT: 2, FACING: 3, REFILL: 4, METER: 5, HITBOXES: 6, FRAME_DATA: 7, RESET: 8, MOVES: 9, TRIALS: 10, COMMANDS: 11, QUIT: 12 };

/** Training pause plate. Escape / a joined slot's start or jump resumes; up/down moves the cursor;
 *  left/right cycles a row's value; attack activates a row (window.__game reaches the room through
 *  the TrainingScreen underneath, `this.tr`). */
export class TrainPauseScreen extends Screen {
  constructor(game) { super(game, 'trainpause'); this.transparent = true; }
  enter(params) {
    super.enter(params);
    this.cursor = 0;
    this.tr = this.game.screens[this.game.screens.length - 2];
    this.variants = (this.game.enemyList || []).filter((e) => e.role !== 'boss').map((e) => ({ key: `${e.type}:${e.variant}`, name: e.name }));
    this.labels = ROWS.slice();
    // Cached opts, compared field-by-field below (never through a throwaway template-string key -- review
    // finding): null never equals a live opts value, so the first refreshLabels() call always rebuilds.
    this.lkMode = null; this.lkVariant = null; this.lkFaceLock = null; this.lkMeterLock = null; this.lkHitboxes = null; this.lkFrameData = null;
    this.refreshLabels();
  }
  /** Rebuild the 12 row labels from the training screen's live opts -- cursor moves alone never rebuild. */
  refreshLabels() {
    const tr = this.tr;
    if (!tr) return;
    const o = tr.opts;
    if (o.mode === this.lkMode && o.variant === this.lkVariant && o.faceLock === this.lkFaceLock
      && o.meterLock === this.lkMeterLock && o.hitboxes === this.lkHitboxes && o.frameData === this.lkFrameData) return;
    this.lkMode = o.mode; this.lkVariant = o.variant; this.lkFaceLock = o.faceLock; this.lkMeterLock = o.meterLock; this.lkHitboxes = o.hitboxes; this.lkFrameData = o.frameData;
    const variantName = (this.variants.find((v) => v.key === o.variant) || {}).name || o.variant;
    this.labels = ROWS.slice();
    this.labels[R.DUMMY] = `DUMMY  < ${DUMMY_LABEL[o.mode] || o.mode} >`;
    this.labels[R.VARIANT] = `VARIANT  < ${variantName} >`;
    this.labels[R.FACING] = `FACING  < ${o.faceLock ? 'LOCK' : 'TRACK'} >`;
    this.labels[R.METER] = `METER  < ${METER_LABEL[o.meterLock] || o.meterLock} >`;
    this.labels[R.HITBOXES] = `HITBOXES  < ${o.hitboxes ? 'ON' : 'OFF'} >`;
    this.labels[R.FRAME_DATA] = `FRAME DATA  < ${o.frameData ? 'ON' : 'OFF'} >`;
  }
  update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio, tr = this.tr;
    if (this.frame < 3 || !tr) return;
    let resume = inp.globalPressed('pause');
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (!inp.joined(i)) continue;
      if (inp.pressed(i, 'start') || inp.pressed(i, 'jump')) resume = true;
      if (inp.pressed(i, 'up')) { this.cursor = (this.cursor + ROWS.length - 1) % ROWS.length; audio.play('menu_move'); }
      if (inp.pressed(i, 'down')) { this.cursor = (this.cursor + 1) % ROWS.length; audio.play('menu_move'); }
      const left = inp.pressed(i, 'left'), right = inp.pressed(i, 'right');
      if (left || right) {
        const dir = right ? 1 : -1;
        if (this.cursor === R.DUMMY) {
          const idx = DUMMY_MODES.indexOf(tr.opts.mode);
          tr.setDummy({ mode: DUMMY_MODES[(idx + dir + DUMMY_MODES.length) % DUMMY_MODES.length] });
          audio.play('menu_move');
        } else if (this.cursor === R.VARIANT && this.variants.length) {
          const idx = Math.max(0, this.variants.findIndex((v) => v.key === tr.opts.variant));
          tr.setDummy({ variant: this.variants[(idx + dir + this.variants.length) % this.variants.length].key });
          audio.play('menu_move');
        } else if (this.cursor === R.FACING) { tr.setDummy({ faceLock: !tr.opts.faceLock }); audio.play('menu_move'); }
        else if (this.cursor === R.METER) {
          const idx = METER_LOCKS.indexOf(tr.opts.meterLock);
          tr.setMeterLock(METER_LOCKS[(idx + dir + METER_LOCKS.length) % METER_LOCKS.length]);
          audio.play('menu_move');
        } else if (this.cursor === R.HITBOXES) { tr.toggle('hitboxes'); audio.play('menu_move'); }
        else if (this.cursor === R.FRAME_DATA) { tr.toggle('frameData'); audio.play('menu_move'); }
      }
      if (inp.pressed(i, 'attack')) {
        if (this.cursor === R.RESUME) { audio.play('menu_confirm'); resume = true; }
        else if (this.cursor === R.REFILL) { tr.refill(); audio.play('menu_confirm'); }
        else if (this.cursor === R.RESET) { tr.resetPositions(); audio.play('menu_confirm'); }
        else if (this.cursor === R.MOVES) {
          audio.play('menu_confirm'); this.game.push('moves', { chars: tr.players.filter(Boolean).map((p) => this.game.characters.indexOf(p.def)) }); return;
        } else if (this.cursor === R.TRIALS) {
          if (this.game.factories.trials) { audio.play('menu_confirm'); this.game.push('trials'); return; }
        } else if (this.cursor === R.COMMANDS) { audio.play('menu_confirm'); this.game.push('help'); return; }
        else if (this.cursor === R.QUIT) { audio.play('menu_confirm'); audio.music.stop(); this.game.fadeTo(() => this.game.reset('title'), 0.08); return; }
      }
    }
    this.refreshLabels();
    if (resume) this.resume();
  }
  /** Resume: consume the buffered press so it never leaks into the sim as an attack / jump / etc. Also
   *  called by trialsScreen.js after picking a trial, so the buffer is cleared through the same path. */
  resume() { this.game.audio.play('unpause'); consumeMenuBuffers(this.game.input); this.game.pop(); }
  draw(ctx) {
    const f = this.frame, w = PLATE_W, h = PLATE_H, x = (VIEW_W - w) / 2, y = PLATE_Y;
    drawPlate(ctx, x, y, w, h, f, 'TRAINING');
    drawMenuRows(ctx, this.labels, this.cursor, ROWS_Y0, f, ROW_H);
    drawText(ctx, 'ESC / START: RESUME   LEFT/RIGHT: CHANGE', VIEW_W / 2, y + h - 22, { size: 1, color: UI.brassDark, align: 'center' });
  }
}
