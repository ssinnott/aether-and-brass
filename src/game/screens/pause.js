// Pause overlay (GDD 9 + RECONCILIATION): 60% dim, brass plate with RESUME / MUTE / OPTIONS / MOVES /
// COMMANDS / QUIT TO TITLE, a composite drop-in join hint for any free slot (issue #23). OPTIONS is hidden under netplay
// (ITEMS_ONLINE): pause is pushed on both peers by a
// masked start press and key capture is local-only, so the two screen stacks would diverge if either peer
// could open it; options stays reachable from the title before/after a session (decision 3). OPTIONS is
// pushed with `lockDifficulty: true`: gameplay.js caches the board's difficulty multipliers at enter() and
// never re-reads them mid-board, so the DIFFICULTY row is locked while paused (it still applies from the
// next board) to avoid showing a value the running board is not actually using.
import { VIEW_W, VIEW_H, UI, MAX_PLAYERS } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, rivetLine, gear } from '../../art/shapes.js';
import { dropInChar, joinHint } from '../party.js';

// MOVES and COMMANDS are hidden under netplay (ITEMS_ONLINE): a screen-stack divergence between peers
// must be impossible by construction (docs/MULTIPLAYER.md), and both are local-only overlays like OPTIONS.
// COMMANDS (screens/help.js) is the quick reference: every command with its bound key and pad button,
// plus the MUSIC / SFX / MUTE rows, so a forgotten button or a too-loud track is one row away mid-run.
const ITEMS_LOCAL = ['RESUME', 'MUTE', 'OPTIONS', 'MOVES', 'COMMANDS', 'QUIT TO TITLE'];
const ITEMS_ONLINE = ['RESUME', 'MUTE', 'QUIT TO TITLE'];
const PLATE_W = 240, PLATE_BASE_H = 84, ROW_H = 16, PLATE_Y = 104;

/** Draw a titled brass plate (rrect frame, rivet lines, two idle gears, outlined title). Shared by
 *  every plate-style overlay: pause, trainpause, trials, moves (issue #22). */
export function drawPlate(ctx, x, y, w, h, f, title) {
  rrect(ctx, x, y, w, h, 8, 'rgba(30,20,26,0.96)', UI.brass, 2);
  rrect(ctx, x + 4, y + 4, w - 8, h - 8, 6, null, UI.brassDark, 1);
  rivetLine(ctx, x + 12, y + 9, x + w - 12, y + 9, 10, 2, UI.brass);
  rivetLine(ctx, x + 12, y + h - 9, x + w - 12, y + h - 9, 10, 2, UI.brass);
  ctx.globalAlpha = 0.25; gear(ctx, x + w - 26, y + 30, 18, 8, UI.brass, null, 0, f * 0.02, 6); gear(ctx, x + 24, y + h - 30, 12, 8, UI.copper, null, 0, -f * 0.03, 4); ctx.globalAlpha = 1;
  drawTextOutlined(ctx, title, VIEW_W / 2, y + 18, { size: 2, color: UI.brassLight, outline: '#3a2010', align: 'center' });
}
/** Draw one centred row per label; the selected row gets the spinning-gear marker. Shared by every
 *  plate-style overlay (issue #22): `rows` are already-built display strings, so draw() allocates nothing. */
export function drawMenuRows(ctx, rows, cursor, y0, f, pitch = 16) {
  for (let i = 0; i < rows.length; i++) {
    const sel = i === cursor, yy = y0 + i * pitch, label = rows[i];
    if (sel) gear(ctx, VIEW_W / 2 - (label.length * 6) / 2 - 12, yy + 4, 5, 6, UI.brass, '#3a2010', 1, f * 0.05, 1.5);
    drawText(ctx, label, VIEW_W / 2, yy, { size: 1, color: sel ? UI.white : UI.steel, align: 'center' });
  }
}
/** A resume / confirm press must not leak into gameplay through the input buffer as an attack / jump / etc. */
export function consumeMenuBuffers(input) {
  for (let p = 0; p < input.playerCount; p++) for (const a of ['attack', 'jump', 'special', 'super', 'dodge', 'taunt']) input.consume(p, a);
}

/** Pause overlay. Start/Escape resumes; attack confirms the highlighted item. */
export class PauseScreen extends Screen {
  constructor(game) { super(game, 'pause'); this.transparent = true; }
  enter(params) {
    super.enter(params);
    this.cursor = 0;
    this.online = !!(this.game.net && this.game.net.active);
    this.items = this.online ? ITEMS_ONLINE : ITEMS_LOCAL;
    this.joinKey = -1; this.hint = '';
    this.labels = this.items.slice(); this.muted = null; // forces one rebuild below
  }
  update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio, online = this.online;
    if (this.muted !== audio.muted) {
      this.muted = audio.muted;
      this.labels = this.items.map((label) => label === 'MUTE' ? `MUTE  < ${this.muted ? 'ON' : 'OFF'} >` : label);
    }
    if (this.frame < 3) return;
    // Drop-in on any free slot: the join edge itself never doubles as a menu press, and the player
    // is added to the gameplay screen beneath (its own drop-in only fires on a join edge, which this
    // overlay has consumed).
    const joinedNow = new Set();
    if (!online) for (let s = 1; s < MAX_PLAYERS; s++) if (!inp.joined(s) && inp.joinPressed(s)) { inp.setJoined(s, true); joinedNow.add(s); audio.play('join'); this.addSlot(s); }
    const k = inp.joinState();
    if (k !== this.joinKey) { this.joinKey = k; this.hint = joinHint(inp, online); }
    let resume = !online && inp.globalPressed('pause');   // netplay resumes through the `start` bit
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (!inp.joined(i) || joinedNow.has(i)) continue;
      if (inp.pressed(i, 'start') || inp.pressed(i, 'jump')) resume = true;
      if (inp.pressed(i, 'up')) { this.cursor = (this.cursor + this.items.length - 1) % this.items.length; audio.play('menu_move'); }
      if (inp.pressed(i, 'down')) { this.cursor = (this.cursor + 1) % this.items.length; audio.play('menu_move'); }
      const item = this.items[this.cursor];
      if ((inp.pressed(i, 'left') || inp.pressed(i, 'right')) && item === 'MUTE') { audio.toggleMute(); audio.play('menu_move'); }
      if (inp.pressed(i, 'attack')) {
        if (item === 'RESUME') { audio.play('menu_confirm'); resume = true; }
        else if (item === 'MUTE') { audio.toggleMute(); audio.play('menu_confirm'); }
        else if (item === 'OPTIONS') { audio.play('menu_confirm'); this.game.push('options', { dim: false, lockDifficulty: true }); return; }
        else if (item === 'COMMANDS') { audio.play('menu_confirm'); this.game.push('help'); return; }
        else if (item === 'MOVES') {
          audio.play('menu_confirm');
          const gp = this.game.screens[this.game.screens.length - 2];
          this.game.push('moves', { chars: gp && gp.players ? gp.players.filter(Boolean).map((p) => this.game.characters.indexOf(p.def)) : [0] });
          return;
        }
        else { audio.play('menu_confirm'); audio.music.stop(); this.game.fadeTo(() => this.game.reset('title'), 0.08); return; }
      }
    }
    if (resume) { audio.play('unpause'); this.consumeBuffers(); this.game.pop(); }
  }
  /** The RESUME press must not leak into gameplay through the input buffer as an attack / jump. */
  consumeBuffers() { consumeMenuBuffers(this.game.input); }
  /** Drop-in from the pause overlay: adds the player to the GameplayScreen underneath (games.screens[-2]). */
  addSlot(slot) {
    const gp = this.game.screens[this.game.screens.length - 2];
    if (!gp || typeof gp.addPlayer !== 'function' || !gp.players || gp.players[slot] || gp.players.filter(Boolean).length >= gp.maxPlayers()) return;
    gp.addPlayer(dropInChar(this.game.options, this.game.characters, slot), slot);
    if (gp.hud && gp.hud.showBanner) gp.hud.showBanner(`P${slot + 1} JOINS!`, '', 60);
  }
  draw(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // A composite hint with both a keyboard and a pad-only part is two lines ('\n', see party.js) --
    // the plate grows by one row per extra line so the second line still sits inside the brass frame
    // (review major: a fixed-height plate let a two-part hint spill past both borders).
    const hintLines = this.hint ? this.hint.split('\n').length : 1;
    const w = PLATE_W, h = PLATE_BASE_H + this.items.length * ROW_H + (hintLines - 1) * ROW_H, x = (VIEW_W - w) / 2, y = PLATE_Y, f = this.frame;
    drawPlate(ctx, x, y, w, h, f, 'PAUSED');
    drawMenuRows(ctx, this.labels, this.cursor, y + 48, f, ROW_H);
    if (this.hint && (f % 60) < 40) drawText(ctx, this.hint, VIEW_W / 2, y + h - 22 - (hintLines - 1) * ROW_H, { size: 1, color: UI.p2, align: 'center' });
    else drawText(ctx, 'ESC / START: RESUME', VIEW_W / 2, y + h - 22, { size: 1, color: UI.brassDark, align: 'center' });
  }
}
