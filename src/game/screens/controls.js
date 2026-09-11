// CONTROLS sub-plate (ARCHITECTURE.md section 16): an 11-action x 4-layout grid (1P ARCADE, P1, P2,
// PAD) shown inside the options overlay. Attack on a cell begins capture; the next raw keydown, or the
// next new gamepad button, is handed to input.rebind() (engine/bindings.js owns the conflict model),
// and a red notice reports a refusal. Capture is local only: the title / pause screen beneath does not
// update while options is on top (Game.update() ticks only the top of the stack), so a P2 join key
// pressed while capturing is simply swallowed and never joins. M / F1 pressed during capture are
// refused as global keys by rebind() AND swallowed here, so mute / debug never toggle mid-capture. The
// two CAPTURE_SETTLE frames after a capture ends absorb the keyup / pad-release edge of whatever was
// just pressed, so it never doubles as a menu move on the frame right after.
import { VIEW_W, UI } from '../../constants.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, rivetLine } from '../../art/shapes.js';
import { options } from '../options.js';
import { ACTIONS } from '../../engine/input.js';

const PLATE = { x: 20, y: 25, w: 600, h: 310 };
const COLS = [['1P ARCADE', 'solo'], ['P1', 'p1'], ['P2', 'p2'], ['PAD', 'pad']];
const COL_X0 = 120, COL_W = 120, ACTION_X = 14, HEAD_Y = 34, ROW_Y0 = 50, ROW_H = 18;
const CAPTURE_SETTLE = 2, NOTICE_FRAMES = 90, BLINK = 30, BLINK_ON = 20;
// 11 rows end at y + 50 + 11*18 = y + 248; notice sits at y + h - 40, hint at y + h - 24 (h = 310).
const ACTION_LABELS = ACTIONS.map((a) => a.toUpperCase());
const HINT = 'ATTACK: REBIND   ESC: CANCEL   DODGE: BACK   ARROWS ARE SHARED BY 1P AND P2';
const PROMPT_KEY = 'PRESS A KEY', PROMPT_PAD = 'PRESS A BUTTON';

/**
 * Build the CONTROLS sub-panel for an OptionsScreen. `screen.game.input` / `screen.game.audio` are
 * fixed for the screen's lifetime, so they are captured once here.
 * @param {object} screen the owning OptionsScreen (screens/options.js)
 */
export function createControlsPanel(screen) {
  const input = screen.game.input, audio = screen.game.audio;
  const st = { row: 0, col: 0, capturing: false, notice: '', noticeBad: false, noticeTimer: 0, settle: 0 };
  /** @type {((e: KeyboardEvent) => void)|null} */
  let onKey = null;

  function notice(text, bad) { st.notice = text; st.noticeBad = bad; st.noticeTimer = NOTICE_FRAMES; }

  function startCapture() {
    st.capturing = true;
    if (COLS[st.col][1] === 'pad') input.beginPadCapture();
    audio.play('menu_confirm');
  }
  function cancel() {
    st.capturing = false;
    input.endPadCapture();
    st.settle = CAPTURE_SETTLE;
    audio.play('menu_back');
  }
  /** @param {string|number} code */
  function apply(code) {
    const layout = COLS[st.col][1], action = ACTIONS[st.row];
    const r = input.rebind(layout, action, code);
    st.capturing = false;
    input.endPadCapture();
    st.settle = CAPTURE_SETTLE;
    if (r.ok) {
      options.saveBindings();
      notice(r.swapped ? `${ACTION_LABELS[st.row]} SET - ${r.swapped.toUpperCase()} TAKES THE OLD KEY` : `${ACTION_LABELS[st.row]} SET`, false);
      audio.play('menu_confirm');
    } else {
      notice(r.reason, true);
      audio.play('menu_back');
    }
  }
  /** Raw keydown while capturing a keyboard cell (installed on open(), removed on close()). */
  function handleKey(e) {
    if (!st.capturing) return;
    if (e.repeat) return; // OS auto-repeat while the key that started capture is still held is not a new key
    e.preventDefault();
    input.swallowKey(e.code); // dropped for this step: fires no action / global and does not back out via Escape
    if (e.code === 'Escape') { cancel(); return; }
    if (COLS[st.col][1] === 'pad') return; // pad column only accepts gamepad buttons, polled in update()
    apply(e.code);
  }

  return {
    open() {
      st.row = 0; st.col = 0; st.capturing = false;
      st.notice = ''; st.noticeBad = false; st.noticeTimer = 0; st.settle = 0;
      if (!onKey) { onKey = (e) => handleKey(e); window.addEventListener('keydown', onKey); }
    },
    close() {
      if (onKey) { window.removeEventListener('keydown', onKey); onKey = null; }
      input.endPadCapture();
      st.capturing = false;
    },
    /** Safety net so a panel left mid-capture never leaks its keydown listener when options closes. */
    dispose() { this.close(); },
    update() {
      if (st.settle > 0) { st.settle--; return; }
      if (st.noticeTimer > 0) st.noticeTimer--;
      if (st.capturing) {
        if (COLS[st.col][1] === 'pad') {
          const b = input.capturePadButton();
          if (b >= 0) apply(b);
        }
        return;
      }
      for (let p = 0; p < 2; p++) {
        if (!input.joined(p)) continue;
        if (input.pressed(p, 'up')) { st.row = (st.row + ACTIONS.length - 1) % ACTIONS.length; audio.play('menu_move'); }
        if (input.pressed(p, 'down')) { st.row = (st.row + 1) % ACTIONS.length; audio.play('menu_move'); }
        if (input.pressed(p, 'left')) { st.col = (st.col + COLS.length - 1) % COLS.length; audio.play('menu_move'); }
        if (input.pressed(p, 'right')) { st.col = (st.col + 1) % COLS.length; audio.play('menu_move'); }
        if (input.pressed(p, 'attack') || input.pressed(p, 'start')) { startCapture(); return; }
        if (input.pressed(p, 'dodge') || input.pressed(p, 'jump') || input.globalPressed('pause')) {
          audio.play('menu_back');
          screen.closeControls();
          return;
        }
      }
    },
    draw(ctx) {
      const x = PLATE.x, y = PLATE.y, w = PLATE.w, h = PLATE.h, f = screen.frame;
      rrect(ctx, x, y, w, h, 8, 'rgba(30,20,26,0.96)', UI.brass, 2);
      rrect(ctx, x + 4, y + 4, w - 8, h - 8, 6, null, UI.brassDark, 1);
      rivetLine(ctx, x + 12, y + 9, x + w - 12, y + 9, 20, 2, UI.brass);
      rivetLine(ctx, x + 12, y + h - 9, x + w - 12, y + h - 9, 20, 2, UI.brass);
      drawTextOutlined(ctx, 'CONTROLS', VIEW_W / 2, y + 10, { size: 2, color: UI.brassLight, outline: '#3a2010', align: 'center' });
      drawText(ctx, 'ACTION', x + ACTION_X, y + HEAD_Y, { size: 1, color: UI.brass });
      for (let c = 0; c < COLS.length; c++) {
        drawText(ctx, COLS[c][0], x + COL_X0 + c * COL_W + COL_W / 2, y + HEAD_Y, { size: 1, color: UI.brass, align: 'center' });
      }
      for (let r = 0; r < ACTIONS.length; r++) {
        const yy = y + ROW_Y0 + r * ROW_H;
        drawText(ctx, ACTION_LABELS[r], x + ACTION_X, yy, { size: 1, color: UI.steel });
        for (let c = 0; c < COLS.length; c++) {
          const layout = COLS[c][1], action = ACTIONS[r];
          const cx = x + COL_X0 + c * COL_W + COL_W / 2;
          const isCursor = r === st.row && c === st.col;
          if (isCursor) rrect(ctx, cx - COL_W / 2 + 6, yy - 3, COL_W - 12, ROW_H - 4, 3, null, UI.brass, 1);
          if (isCursor && st.capturing && (f % BLINK) < BLINK_ON) {
            drawText(ctx, layout === 'pad' ? PROMPT_PAD : PROMPT_KEY, cx, yy, { size: 1, color: UI.teal, align: 'center' });
          } else {
            drawText(ctx, input.cellText(layout, action), cx, yy, { size: 1, color: isCursor ? UI.white : UI.paper, align: 'center' });
          }
        }
      }
      if (st.noticeTimer > 0) drawText(ctx, st.notice, VIEW_W / 2, y + h - 40, { size: 1, color: st.noticeBad ? UI.red : UI.teal, align: 'center' });
      drawText(ctx, HINT, VIEW_W / 2, y + h - 24, { size: 1, color: UI.brassDark, align: 'center' });
    },
    summary() {
      return { row: st.row, col: st.col, capturing: st.capturing, controlsNotice: st.notice, controlsBad: st.noticeBad };
    },
  };
}
