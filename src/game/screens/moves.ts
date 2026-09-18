// MOVES screen (issue #22): the hero's full move list with an animated rig preview beside the highlighted
// row, reachable from both pause plates -- pause.js's normal plate (hidden there during an online match)
// and trainpause.js's training plate. Netplay-safe by construction like pause.js: it never reads
// globalPressed('pause') while online and navigates only from a joined slot's own per-frame edges, so a
// screen-stack divergence between peers is impossible (docs/MULTIPLAYER.md) -- today MOVES is hidden
// online anyway, so this only matters if that ever changes.
import { VIEW_W, VIEW_H, UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import { drawText } from '../../engine/text.ts';
import { buildRig, drawRig } from '../../lib/art/rig.ts';
import { AnimPlayer } from '../../lib/art/animation.ts';
import { drawShadowScreen } from '../../art/fx.ts';
import { input, bindings } from '../../engine/input.ts';
import { drawPlate, consumeMenuBuffers } from './pause.ts';
import { confirmPressed, cancelPressed, escapePressed, confirmKey, backKey } from '../menuinput.ts';
// Type-only: `import type` is erased by tsc, esbuild and node alike, so neither adds an edge to the
// module graph the browser loads (the note at the top of screens/gameplay.ts).
import type { Game, ScreenParams, RegistryEntry } from '../game.ts';
import type { Rig } from '../../lib/art/rig.ts';

const PLATE_X = 20, PLATE_Y = 30, PLATE_W = 600, PLATE_H = 300;
const CLIP_X = 24, CLIP_Y = 60, CLIP_W = 150, CLIP_H = 236;
const RIG_X = 100, RIG_Y = 250, RIG_SCALE = 2;
const ROW_X = 190, ROW_Y0 = 62, ROW_H = 15, ROW_KEY_X = 600;
const DESC_WRAP = 66, DESC_LINE_H = 9;
const HOLD_FRAMES = 30;

/** Control words a MoveEntry.input string may name, in the order they are looked up. */
const ACTION_WORDS = ['ATTACK', 'JUMP', 'DODGE', 'SPECIAL', 'SUPER', 'TAUNT'];

/**
 * One row of the list: a hero's MoveEntry (types/content.d.ts) with the two strings the row draws already
 * finished -- the input labelled against the live bindings and the description wrapped -- so draw()
 * allocates nothing. Built once per hero in enter().
 */
export interface MoveRow {
  name: string;
  /** `MoveEntry.input` with every control word replaced by 'WORD [K]'; see inputLabel. */
  key: string;
  descLines: string[];
  /** The animations played beside the row, in sequence. `['idle']` when the entry names none. */
  anims: string[];
}

/** One hero's preview rig, and where the highlighted row's animation sequence has got to on it. */
export interface MovePreview {
  rig: Rig;
  anim: AnimPlayer;
  /** Frames a finished animation has been held before the next one in the sequence starts. */
  hold: number;
  /** Index into the highlighted row's `anims`. */
  seq: number;
}

/** Split `text` into lines no wider than `width` chars, breaking on spaces (never mid-word). */
function wrapDesc(text: string, width: number = DESC_WRAP): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > width && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Replace each control word in a MoveEntry.input string with 'WORD [K]', K the on-screen label of the
 * live key bound to that action for keyboard `slot` (P1's block for a slot that has none of its own) --
 * a single call site so a future rebinding UI only has to change what this reads. RUN has no
 * binding of its own (double-tap direction / gamepad RT held), so it is always spelled out literally.
 * @param {string} text
 * @param {number} slot
 * @returns {string}
 */
export function inputLabel(text: string, slot: number): string {
  let out = text.replace(/\bRUN\b/g, 'RUN [2x DIR]');
  for (const word of ACTION_WORDS) {
    if (!out.includes(word)) continue;
    const action = word.toLowerCase();
    const codes = (bindings.keyboard[slot] || bindings.keyboard[0])[action];
    const key = codes && codes.length ? input.keyLabel(codes[0]) : '?';
    out = out.replace(new RegExp(`\\b${word}\\b`, 'g'), `${word} [${key}]`);
  }
  return out;
}

/**
 * MOVES: every hero's move list, with an animated rig preview beside the highlighted row.
 * `params.chars` names the character index (or indices, for a shared pause during local co-op) to show;
 * defaults to hero 0. up/down moves the row (replaying its preview); left/right switches hero when more
 * than one was passed; Escape (offline) or jump / dodge backs out to whichever plate pushed this. There is
 * no row to activate here, so CONFIRM -- ENTER or attack -- reads as "done reading" and backs out too,
 * rather than leaving ENTER dead on a plate the rest of the game selects with (game/menuinput.js).
 */
export class MovesScreen extends Screen {
  // The fields, for the checker only, in the order enter() writes them. `declare` because these are
  // assignments and nothing else: a plain field declaration would emit a class field per name (es2022
  // defines them before the constructor body runs), which is a runtime change. Same reasoning, and the
  // same wording, as game/entity.ts's Entity.
  /** A match is live, which is what keeps Escape from backing out of an overlay only one peer has. */
  declare online: boolean;
  declare hint: string;
  /** The heroes this plate was opened for; never empty (enter() falls back to hero 0). */
  declare chars: RegistryEntry[];
  /** Index into `chars` / `rows` / `previews`, which are parallel. */
  declare heroIndex: number;
  /** Index into the current hero's rows. */
  declare cursor: number;
  declare previews: MovePreview[];
  /** One list per hero, in `chars` order. */
  declare rows: MoveRow[][];
  /** The cached plate title; rebuilt only when heroIndex changes, never per frame. */
  declare title: string;

  constructor(game: Game) { super(game, 'moves'); this.transparent = true; }
  override enter(params: ScreenParams): void {
    super.enter(params);
    this.online = !!(this.game.net && this.game.net.active);
    this.hint = `UP/DOWN: MOVE   LEFT/RIGHT: HERO   ${backKey(input)} / ${confirmKey(input)}: BACK`;
    const idx = params.chars && params.chars.length ? params.chars : [0];
    this.chars = idx.map((i) => this.game.characters[i]).filter(Boolean);
    if (!this.chars.length) this.chars = [this.game.characters[0]];
    this.heroIndex = 0;
    this.cursor = 0;
    this.previews = this.chars.map((c) => ({ rig: buildRig(c.build || {}), anim: new AnimPlayer(c.anims || {}), hold: 0, seq: 0 }));
    this.rows = this.chars.map((c) => (c.moveList || []).map((m: MoveEntry) => ({
      name: m.name,
      key: inputLabel(m.input, 0),
      descLines: wrapDesc(m.desc),
      anims: m.anims || (m.anim ? [m.anim] : ['idle']),
    })));
    this.title = '';
    this.refreshTitle();
    this.playRow();
  }
  /** Rebuild the cached plate title -- only changes when heroIndex changes, never per frame. */
  refreshTitle(): void { this.title = `${this.chars[this.heroIndex].name} MOVES  <  >`; }
  /** Play the highlighted row's first animation on the current hero's preview (restarts even if already playing). */
  playRow(): void {
    const list = this.rows[this.heroIndex];
    if (!list.length) return;
    const preview = this.previews[this.heroIndex];
    preview.seq = 0; preview.hold = 0;
    preview.anim.play(list[this.cursor].anims[0], { restart: true, fallback: 'idle' });
  }
  override update(): void {
    super.update();
    const inp = this.game.input, audio = this.game.audio;
    if (this.frame < 3) return;
    let back = escapePressed(inp, this.online);
    // Every joined slot (up to 4 in local co-op), matching pause.js / trainpause.js: a pad-only P3/P4 who
    // opened MOVES from the pause plate must be able to navigate and back out with their own controller.
    for (let i = 0; i < inp.playerCount; i++) {
      if (!inp.joined(i)) continue;
      if (cancelPressed(inp, i) || confirmPressed(inp, i)) back = true;
      const list = this.rows[this.heroIndex];
      if (list.length) {
        if (inp.pressed(i, 'up')) { this.cursor = (this.cursor + list.length - 1) % list.length; audio.play('menu_move'); this.playRow(); }
        if (inp.pressed(i, 'down')) { this.cursor = (this.cursor + 1) % list.length; audio.play('menu_move'); this.playRow(); }
      }
      if (this.chars.length > 1 && (inp.pressed(i, 'left') || inp.pressed(i, 'right'))) {
        const dir = inp.pressed(i, 'right') ? 1 : -1;
        this.heroIndex = (this.heroIndex + dir + this.chars.length) % this.chars.length;
        this.cursor = Math.min(this.cursor, Math.max(0, this.rows[this.heroIndex].length - 1));
        this.refreshTitle();
        audio.play('menu_move');
        this.playRow();
      }
    }
    if (back) { audio.play('menu_back'); consumeMenuBuffers(inp); this.game.pop(); return; }
    const preview = this.previews[this.heroIndex];
    preview.anim.tick();
    if (preview.anim.done) {
      if (++preview.hold > HOLD_FRAMES) {
        preview.hold = 0;
        const anims = this.rows[this.heroIndex][this.cursor].anims;
        preview.seq = (preview.seq + 1) % anims.length;
        preview.anim.play(anims[preview.seq], { restart: true, fallback: 'idle' });
      }
    }
  }
  override draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const rows = this.rows[this.heroIndex], preview = this.previews[this.heroIndex], f = this.frame;
    drawPlate(ctx, PLATE_X, PLATE_Y, PLATE_W, PLATE_H, f, this.title);
    ctx.save();
    ctx.beginPath(); ctx.rect(CLIP_X, CLIP_Y, CLIP_W, CLIP_H); ctx.clip();
    drawShadowScreen(ctx, RIG_X, RIG_Y, 34 * preview.rig.scale, 0.45);
    drawRig(ctx, preview.rig, preview.anim.pose, { x: RIG_X, y: RIG_Y, facing: 1, scale: RIG_SCALE });
    ctx.restore();
    for (let i = 0; i < rows.length; i++) {
      const sel = i === this.cursor, y = ROW_Y0 + i * ROW_H, color = sel ? UI.white : UI.paper;
      drawText(ctx, rows[i].name, ROW_X, y, { size: 1, color });
      drawText(ctx, rows[i].key, ROW_KEY_X, y, { size: 1, color, align: 'right' });
    }
    if (rows.length) {
      let dy = ROW_Y0 + rows.length * ROW_H + 8;
      for (const line of rows[this.cursor].descLines) { drawText(ctx, line, ROW_X, dy, { size: 1, color: UI.brassLight }); dy += DESC_LINE_H; }
    }
    drawText(ctx, this.hint, VIEW_W / 2, PLATE_Y + PLATE_H - 22, { size: 1, color: UI.brassDark, align: 'center' });
  }
  /** Test hook (tools/scenarios/training.js): the currently playing preview anim and the highlighted row. */
  preview(): { anim: string | null; row: number } { return { anim: this.previews[this.heroIndex].anim.name, row: this.cursor }; }
}
