// COMMANDS & SOUND plate: the in-game quick reference. One brass plate listing every command with the
// key and pad button actually bound to it and a one-line description of what it does, plus the three
// sound settings (MUSIC / SFX / MUTE) adjustable in place, so a player who forgets a button -- or wants
// the music down -- never has to leave the run or dig through OPTIONS > CONTROLS.
//
// Reached from both pause plates (pause.js COMMANDS, trainpause.js COMMANDS). Hidden from the normal
// plate while `game.net.active` for the same reason OPTIONS and MOVES are (docs/MULTIPLAYER.md): pause
// is pushed on both peers by a masked start press, so a screen only one peer pushes would leave the two
// stacks disagreeing. Like moves.js it never reads globalPressed('pause') while online and navigates
// only from a joined slot's own per-frame edges, so that stays true by construction if it is ever shown.
//
// The SOUND rows write the same persisted settings as the OPTIONS plate (game/options.js) and share its
// slider drawing -- this is a second door onto one setting, never a second copy of it. Nothing here
// touches sim state, so none of it enters src/net/checksum.js.
//
// Every displayed string is built once in enter() (bindings cannot be rebound and no slot can join while
// this overlay is on top -- Game.update() ticks only the top of the stack, and this screen never polls
// joinPressed), so draw() allocates nothing per frame.
import { VIEW_W, VIEW_H, UI, MAX_PLAYERS } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText } from '../../engine/text.js';
import { rivetLine, gear } from '../../art/shapes.js';
import { input, bindings } from '../../engine/input.js';
import { options } from '../options.js';
import { drawPlate, consumeMenuBuffers } from './pause.js';
import { drawVolumeRow } from './options.js';

const PLATE_X = 20, PLATE_Y = 22, PLATE_W = 600, PLATE_H = 316;
const HEAD_Y = PLATE_Y + 34, ROW_Y0 = PLATE_Y + 50, ROW_H = 15;
const ACTION_X = PLATE_X + 16, KEYS_CX = PLATE_X + 150, PAD_CX = PLATE_X + 250, DESC_X = PLATE_X + 300;
const DIVIDER_Y = PLATE_Y + 210, SOUND_HEAD_Y = PLATE_Y + 218;
const SOUND_Y0 = PLATE_Y + 236, SOUND_ROW_H = 16, SOUND_LABEL_X = PLATE_X + 40, SOUND_VALUE_X = PLATE_X + 150;
const NOTE_Y0 = PLATE_Y + 238, NOTE_LINE_H = 14;
const HINT = 'UP/DOWN: SOUND ROW   LEFT/RIGHT: CHANGE   JUMP: BACK';

// One entry per command row. `action` names the bound action whose key/pad labels fill the two middle
// columns; a row with no single binding behind it (RUN, THROW, MUTE) spells its own out in build().
const COMMANDS = [
  { label: 'MOVE', action: 'move', desc: 'WALK THE LANE; UP AND DOWN STEP INTO DEPTH' },
  { label: 'RUN', action: '', desc: 'DOUBLE-TAP A DIRECTION; RUNNING ATTACKS DASH' },
  { label: 'ATTACK', action: 'attack', desc: 'THE COMBO; NEXT TO A STANDING ENEMY IT GRABS' },
  { label: 'JUMP', action: 'jump', desc: 'HOP GAPS AND PLATFORMS; ATTACK IN THE AIR' },
  { label: 'DODGE', action: 'dodge', desc: 'ROLL WITH I-FRAMES; CANCELS ATTACK RECOVERY' },
  { label: 'SPECIAL', action: 'special', desc: 'COSTS ONE METER BAR, OR HEALTH WHEN EMPTY' },
  { label: 'SUPER', action: 'super', desc: 'NEEDS ALL THREE METER BARS' },
  { label: 'TAUNT', action: 'taunt', desc: 'STRIKE A POSE AND BUILD A LITTLE METER' },
  { label: 'THROW', action: '', desc: 'THROW WHAT YOU HOLD: A BODY, WEAPON OR PROP' },
  { label: 'PAUSE', action: 'start', desc: 'OPENS THE PAUSE PLATE THIS CAME FROM' },
  { label: 'MUTE', action: '', desc: 'SILENCE MUSIC AND SFX AT ONCE' },
];
const R_MUSIC = 0, R_SFX = 1, R_MUTE = 2;
const SOUND_ROWS = ['MUSIC', 'SFX', 'MUTE'];
const MUTE_VALUE = { on: '< ON >', off: '< OFF >' };
const NO_BUTTON = '-';

/**
 * Build the eleven [keys, pad] label pairs for `layout` (the keyboard half the local player is actually
 * using: the 1P arcade aliases until P2 joins, P1's own keys after). Reads every label through
 * `input.moveText()` / `input.keyText()` so a remapped key shows up here too (ARCHITECTURE.md 16 --
 * screens never hard-code a key name).
 * @param {string} layout
 * @returns {Array<{ keys: string, pad: string }>}
 */
function buildLabels(layout) {
  const key = (action) => input.keyText(layout, action) || '?';
  const pad = (action) => input.keyText('pad', action) || '?';
  return COMMANDS.map((cmd) => {
    if (cmd.label === 'MOVE') return { keys: input.moveText(layout), pad: input.moveText('pad') };
    if (cmd.label === 'RUN') return { keys: '2x DIR', pad: `HOLD ${input.padLabel(bindings.gamepadRun[0])}` };
    if (cmd.label === 'THROW') return { keys: `DIR + ${key('attack')}`, pad: `DIR + ${pad('attack')}` };
    if (cmd.label === 'PAUSE') return { keys: `${key('start')} / ${input.keyLabel(bindings.global.pause[0])}`, pad: pad('start') };
    if (cmd.label === 'MUTE') return { keys: input.keyLabel(bindings.global.mute[0]), pad: NO_BUTTON };
    return { keys: key(cmd.action), pad: pad(cmd.action) };
  });
}

/**
 * COMMANDS & SOUND: the command summary plus the MUSIC / SFX / MUTE rows. up/down picks a sound row,
 * left/right changes it (attack toggles MUTE), and jump / dodge / start -- or Escape offline -- backs
 * out to whichever pause plate pushed this.
 */
export class HelpScreen extends Screen {
  constructor(game) { super(game, 'help'); this.transparent = true; }
  enter(params) {
    super.enter(params);
    this.online = !!(this.game.net && this.game.net.active);
    this.cursor = 0;
    // The keyboard half this player is on right now: the arcade aliases are live until P2 joins, after
    // which P1 moves to the left half (engine/bindings.js soloAliases) -- the same rule moves.js follows.
    this.coop = input.joined(1);
    this.layout = this.coop ? 'p1' : 'solo';
    this.labels = buildLabels(this.layout);
    this.keysHead = this.coop ? 'P1 KEYS' : 'KEYS';
    this.notes = ['REMAP ANY KEY IN OPTIONS > CONTROLS'];
    if (this.coop) this.notes.push('P2 KEYS ARE LISTED THERE TOO');
  }
  update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio;
    if (this.frame < 3) return; // the press that opened this plate must not act on it
    let back = !this.online && inp.globalPressed('pause');
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (!inp.joined(i)) continue;
      if (inp.pressed(i, 'jump') || inp.pressed(i, 'dodge') || inp.pressed(i, 'start')) back = true;
      if (inp.pressed(i, 'up')) { this.cursor = (this.cursor + SOUND_ROWS.length - 1) % SOUND_ROWS.length; audio.play('menu_move'); }
      if (inp.pressed(i, 'down')) { this.cursor = (this.cursor + 1) % SOUND_ROWS.length; audio.play('menu_move'); }
      const dir = (inp.pressed(i, 'right') ? 1 : 0) - (inp.pressed(i, 'left') ? 1 : 0);
      if (dir) this.change(dir);
      // MUTE is the only row a confirm can act on; a confirm on a slider would be a silent no-op, so it
      // nudges the slider up instead of doing nothing.
      if (inp.pressed(i, 'attack')) this.change(1);
    }
    if (back) { audio.play('menu_back'); consumeMenuBuffers(inp); this.game.pop(); }
  }
  /** Step the highlighted sound row by `dir` (MUTE toggles either way). */
  change(dir) {
    const audio = this.game.audio;
    if (this.cursor === R_MUTE) { audio.setMuted(!audio.muted); audio.play('menu_move'); return; }
    if (options.adjust(this.cursor === R_MUSIC ? 'music' : 'sfx', dir)) audio.play('menu_move');
  }
  draw(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const f = this.frame;
    drawPlate(ctx, PLATE_X, PLATE_Y, PLATE_W, PLATE_H, f, 'COMMANDS & SOUND');
    drawText(ctx, 'ACTION', ACTION_X, HEAD_Y, { size: 1, color: UI.brass });
    drawText(ctx, this.keysHead, KEYS_CX, HEAD_Y, { size: 1, color: UI.brass, align: 'center' });
    drawText(ctx, 'PAD', PAD_CX, HEAD_Y, { size: 1, color: UI.brass, align: 'center' });
    drawText(ctx, 'WHAT IT DOES', DESC_X, HEAD_Y, { size: 1, color: UI.brass });
    for (let i = 0; i < COMMANDS.length; i++) {
      const yy = ROW_Y0 + i * ROW_H, cmd = COMMANDS[i], lab = this.labels[i];
      drawText(ctx, cmd.label, ACTION_X, yy, { size: 1, color: UI.white });
      drawText(ctx, lab.keys, KEYS_CX, yy, { size: 1, color: UI.paper, align: 'center' });
      drawText(ctx, lab.pad, PAD_CX, yy, { size: 1, color: UI.paper, align: 'center' });
      drawText(ctx, cmd.desc, DESC_X, yy, { size: 1, color: UI.steel });
    }
    rivetLine(ctx, PLATE_X + 12, DIVIDER_Y, PLATE_X + PLATE_W - 12, DIVIDER_Y, 20, 2, UI.brassDark);
    drawText(ctx, 'SOUND', ACTION_X, SOUND_HEAD_Y, { size: 1, color: UI.brass });
    for (let i = 0; i < SOUND_ROWS.length; i++) {
      const sel = i === this.cursor, yy = SOUND_Y0 + i * SOUND_ROW_H, color = sel ? UI.white : UI.steel;
      if (sel) gear(ctx, SOUND_LABEL_X - 12, yy + 4, 5, 6, UI.brass, '#3a2010', 1, f * 0.05, 1.5);
      drawText(ctx, SOUND_ROWS[i], SOUND_LABEL_X, yy, { size: 1, color });
      if (i === R_MUTE) drawText(ctx, MUTE_VALUE[this.game.audio.muted ? 'on' : 'off'], SOUND_VALUE_X, yy, { size: 1, color });
      else drawVolumeRow(ctx, SOUND_VALUE_X, yy, options.get(i === R_MUSIC ? 'music' : 'sfx'), sel, color);
    }
    for (let i = 0; i < this.notes.length; i++) drawText(ctx, this.notes[i], DESC_X, NOTE_Y0 + i * NOTE_LINE_H, { size: 1, color: UI.brassDark });
    drawText(ctx, HINT, VIEW_W / 2, PLATE_Y + PLATE_H - 22, { size: 1, color: UI.brassDark, align: 'center' });
  }
  summary() {
    return {
      screen: 'help', cursor: this.cursor, commandRows: COMMANDS.length, layout: this.layout,
      commandKeys: this.labels.map((l) => l.keys), commandPads: this.labels.map((l) => l.pad),
      music: options.get('music'), sfx: options.get('sfx'), muted: this.game.audio.muted,
    };
  }
}
