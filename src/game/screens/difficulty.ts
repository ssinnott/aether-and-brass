// Difficulty select (title -> BOARD SELECT -> DIFFICULTY -> character select): one brass plaque per level in
// constants.js DIFFICULTIES, each with a pressure gauge whose needle sits in the green, the amber or the red, and the
// level's tuning printed underneath -- enemy damage, attack speed, health, wind-up time and continues, read straight
// off DIFFICULTY_TUNING, so the plaque can never promise a number the board will not use. A row that makes the run
// easier than MEDIUM is lit teal, one that makes it harder red.
//
// This is a second door onto the OPTIONS plate's DIFFICULTY row (screens/options.js), not a second setting: the
// cursor opens on the level in play and confirming a different one saves it through game/options.js exactly as that
// row does. Confirming the level already in play writes nothing, so a `?difficulty=` link stays session only.
// Character select's BACK returns here, and BACK from here returns to BOARD SELECT on the board that was picked.
import { VIEW_W, VIEW_H, UI, DIFFICULTIES, DIFFICULTY_TUNING } from '../../constants.ts';
import { Screen } from '../game.ts';
import { drawText, drawTextOutlined } from '../../engine/text.ts';
import { rrect, gear, rivetLine, circle, line, pathArcBand, paint } from '../../lib/art/shapes.ts';
import { particles } from '../../engine/particles.ts';
import { STAGES } from '../../content/stage/index.ts';
import { options } from '../options.ts';
import { rowMetrics, wrapText } from './boardcards.ts';
import { input } from '../../engine/input.ts';
import { confirmPressed, cancelPressed, escapePressed, confirmKey, backKey } from '../menuinput.ts';
// Type-only: this screen reaches down for the shapes it works in rather than adding a module edge, the same
// arrangement (and for the same reason) as the block at the top of game/screens/gameplay.ts. `import type` is
// erased by tsc, esbuild and node alike.
import type { Game, ScreenParams, ScreenSummary } from '../game.ts';
import type { DifficultyTuning } from '../../constants.ts';
import type { RowMetrics } from './boardcards.ts';
import type { BoardStage } from './boardselect.ts';

const CARD_Y = 48, CARD_H = 188, GAP = 22, CARD_W_MAX = 184, ROW_PAD = 60;
const NAME_Y = 16, GAUGE_Y = 64, GAUGE_R = 22, TAG_Y = 98, RULE_Y = 111, STAT_Y = 118, STAT_H = 12, STAT_X = 14;
const CONFIRM_FRAMES = 18;
/** The gauge sweeps 270 degrees clockwise from bottom-left to bottom-right, through the top. */
const G_A0 = Math.PI * 0.75, G_SWEEP = Math.PI * 1.5;

/** What each level reads as on its plaque: the name, the needle's place on the gauge (0..1), a tagline for the plate
 *  and a sentence for the footer. The numbers are not here -- they are DIFFICULTY_TUNING's. */
const LEVELS: Record<string, { label: string; needle: number; tag: string; blurb: string }> = {
  easy: { label: 'EASY', needle: 0.2, tag: 'ROOM TO LEARN', blurb: 'ENEMIES HIT SOFTER, SWING SLOWER AND FALL SOONER, WITH MORE CONTINUES TO SPARE' },
  medium: { label: 'MEDIUM', needle: 0.56, tag: 'THE FIGHT AS BUILT', blurb: 'EVERY ENEMY FIGHTS THE WAY IT WAS BUILT TO - THE BOARDS AS THEY ARE BALANCED' },
  hard: { label: 'HARD', needle: 0.88, tag: 'NO QUARTER GIVEN', blurb: 'ENEMIES HIT HARDER, TAKE MORE PUNISHMENT AND WIND UP FASTER, WITH FEWER CONTINUES' },
};

/** The tuning rows a plaque prints, in order. `easierBelow`: a value under MEDIUM's makes the run easier. */
const STATS: Array<{ label: string; key: keyof DifficultyTuning; pct: boolean; easierBelow: boolean }> = [
  { label: 'ENEMY DAMAGE', key: 'dmgMult', pct: true, easierBelow: true },
  { label: 'ATTACK SPEED', key: 'attackSpeed', pct: true, easierBelow: true },
  { label: 'ENEMY HEALTH', key: 'hpMult', pct: true, easierBelow: true },
  { label: 'WIND-UP TIME', key: 'tellScale', pct: true, easierBelow: false },
  { label: 'CONTINUES', key: 'continues', pct: false, easierBelow: false },
];

/** One printed tuning row: built once in enter(), so draw() allocates nothing per frame. */
export interface StatLine {
  label: string;
  value: string;
  /** Teal when the row makes the run easier than MEDIUM, red when harder, steel when the same. */
  color: string;
}

/** One level's plaque, as enter() builds it. */
export interface LevelEntry {
  id: string;
  label: string;
  /** Where the needle rests, 0 (bottom of the green) .. 1 (top of the red). */
  needle: number;
  tag: string;
  /** The footer sentence, already wrapped to the width it is drawn at. */
  blurb: string[];
  stats: StatLine[];
}

/** Difficulty select screen. Left/right picks a level, CONFIRM (ENTER or attack) takes it to character select,
 *  BACK (Escape, jump or dodge) returns to BOARD SELECT -- the one scheme in game/menuinput.js. */
export class DifficultyScreen extends Screen {
  // The fields, for the checker only, in the order enter() writes them. `declare` because these are assignments
  // and nothing else: a plain field declaration would emit a class field per name (es2022 defines them before the
  // constructor body runs), which is a runtime change. Same reasoning, and the same wording, as game/entity.ts.
  declare levels: LevelEntry[];
  /** Index into `levels` of the highlighted plaque. */
  declare cursor: number;
  /** The board this run is on, for the line under the heading. */
  declare boardLine: string;
  declare hint: string;
  /** Frames since a level was confirmed; -1 until it is. */
  declare confirm: number;
  /** The screen has handed off and stops reading input. */
  declare leaving: boolean;

  constructor(game: Game) { super(game, 'difficulty'); }
  override enter(params: ScreenParams): void {
    super.enter(params);
    const medium = DIFFICULTY_TUNING.medium;
    this.levels = DIFFICULTIES.map((id) => {
      const t = DIFFICULTY_TUNING[id], lv = LEVELS[id] || { label: id.toUpperCase(), needle: 0.5, tag: '', blurb: '' };
      return {
        id, label: lv.label, needle: lv.needle, tag: lv.tag,
        blurb: wrapText(lv.blurb, VIEW_W - 80, 1).slice(0, 2),
        stats: STATS.map((s) => {
          const v = t[s.key], base = medium[s.key];
          const easier = s.easierBelow ? v < base : v > base;
          return { label: s.label, value: s.pct ? `${Math.round(v * 100)}%` : String(v), color: v === base ? UI.steel : easier ? UI.teal : UI.red };
        }),
      };
    });
    // Open on the level in play: the `?difficulty=` override when a link carried one, else the saved choice.
    this.cursor = Math.max(0, DIFFICULTIES.indexOf(options.difficulty()));
    // BoardStage, as BOARD SELECT reads a board: stage 1 carries no `number` and falls back to its place in the list
    const n = Math.max(1, this.game.options.stage || 1), stage: BoardStage | undefined = STAGES[n - 1];
    this.boardLine = stage ? `STAGE ${stage.number || n}  ${stage.name}` : '';
    this.hint = `LEFT / RIGHT  CHOOSE      ${confirmKey(input)}  CONFIRM      ${backKey(input)}  BACK`;
    this.confirm = -1; this.leaving = false;
    this.game.audio.music.play('title');
    particles.clear();
  }
  get level(): LevelEntry { return this.levels[this.cursor]; }
  /** Card geometry: one centred row, the same arithmetic BOARD SELECT lays its plaques out with. */
  get metrics(): RowMetrics { return rowMetrics(this.levels.length, { maxW: CARD_W_MAX, gap: GAP, pad: ROW_PAD }); }
  cardX(i: number): number { const m = this.metrics; return m.x0 + i * (m.w + GAP); }
  override update(): void {
    super.update();
    const inp = this.game.input, audio = this.game.audio, n = this.levels.length;
    particles.update();
    if (this.confirm >= 0) {
      if (++this.confirm >= CONFIRM_FRAMES && !this.leaving) {
        this.leaving = true;
        // character select's BACK comes back here, so the way out of a run's setup is the way in, a step at a time
        this.game.fadeTo(() => this.game.replace('select', { back: 'difficulty' }), 0.1);
      }
      return;
    }
    if (this.leaving || !n) return;
    for (let p = 0; p < inp.playerCount; p++) {
      if (!inp.joined(p)) { if (inp.joinPressed(p)) { inp.setJoined(p, true); audio.play('join'); } continue; }
      const dir = (inp.pressed(p, 'right') ? 1 : 0) - (inp.pressed(p, 'left') ? 1 : 0);
      if (dir) { this.cursor = (this.cursor + dir + n) % n; audio.play('menu_move'); continue; }
      if (confirmPressed(inp, p)) { this.pick(); return; }
      if (p === 0 && (cancelPressed(inp, p) || escapePressed(inp))) {
        audio.play('menu_back');
        this.leaving = true;
        this.game.fadeTo(() => this.game.replace(this.game.factories.boardselect ? 'boardselect' : 'title'), 0.08);
        return;
      }
    }
  }
  /** Take the highlighted level: save it the way the OPTIONS row would, and hand the run on to character select. */
  pick(): void {
    const id = this.level.id;
    // Only a CHANGE is written. options.set() persists and clears any `?difficulty=` override, which is right when
    // the player picked something else and wrong when they simply confirmed the level the link asked for.
    if (id !== options.difficulty()) options.set('difficulty', id);
    this.game.options.difficulty = id;
    this.confirm = 0;
    this.game.audio.play('menu_confirm');
    const x = this.cardX(this.cursor) + this.metrics.w / 2;
    for (let i = 0; i < 18; i++) particles.spawn('spark', x, CARD_Y + GAUGE_Y, 0, { screen: true, vx: (i % 6 - 2.5) * 1.6, vy: -1.5 - (i % 4), life: 26 });
  }
  /** Test / debug hook: which level is highlighted, and what the plaques print. */
  override summary(): ScreenSummary {
    return {
      screen: 'difficulty', cursor: this.cursor, difficulty: this.level ? this.level.id : '', confirmed: this.confirm >= 0,
      levels: this.levels.map((l) => ({ id: l.id, label: l.label, stats: l.stats.map((s) => `${s.label} ${s.value}`) })),
    };
  }
  override draw(ctx: CanvasRenderingContext2D): void {
    const f = this.frame;
    ctx.fillStyle = '#1c1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.22;
    gear(ctx, 56, 322, 92, 14, '#3a2a48', null, 0, f * 0.004, 30);
    gear(ctx, 604, 34, 72, 12, '#3a2a48', null, 0, -f * 0.005, 24);
    ctx.globalAlpha = 1;
    drawTextOutlined(ctx, 'SELECT DIFFICULTY', VIEW_W / 2, 8, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    if (this.boardLine) drawText(ctx, this.boardLine, VIEW_W / 2, 30, { size: 1, color: UI.steel, align: 'center' });
    const m = this.metrics;
    for (let i = 0; i < this.levels.length; i++) this.drawCard(ctx, i, this.cardX(i), CARD_Y, m.w, f);
    this.drawFooter(ctx, f);
    particles.draw(ctx, null, 'front');
  }
  /** One level's plaque: brass frame, name, pressure gauge, tagline and the tuning rows. */
  drawCard(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, w: number, f: number): void {
    const lv = this.levels[i], sel = i === this.cursor;
    // the selected plaque lifts and bobs, and flashes once it is confirmed -- BOARD SELECT's plaques do the same
    const lift = sel ? -3 + Math.round(Math.sin(f * 0.06) * 2) : 0;
    const flash = this.confirm >= 0 && sel && (this.confirm >> 1) % 2 === 0;
    ctx.save();
    ctx.translate(x, y + lift);
    const frame = sel ? UI.brassLight : UI.brass;
    rrect(ctx, 0, 0, w, CARD_H, 6, '#3a2a18', frame, sel ? 3 : 2);
    rrect(ctx, 4, 4, w - 8, CARD_H - 8, 4, 'rgba(12,8,16,0.88)', UI.brassDark, 1);
    rivetLine(ctx, 10, 9, w - 10, 9, Math.max(4, Math.round(w / 26)), 1.5, frame);
    rivetLine(ctx, 10, CARD_H - 9, w - 10, CARD_H - 9, Math.max(4, Math.round(w / 26)), 1.5, frame);
    drawTextOutlined(ctx, lv.label, w / 2, NAME_Y, { size: 2, color: sel ? UI.white : UI.brassLight, outline: '#3a2010', align: 'center' });
    // the selected gauge's needle quivers, the way a real one does under pressure; the red end shakes harder
    const quiver = sel ? Math.sin(f * 0.35) * 0.012 + (lv.needle > 0.8 ? Math.sin(f * 1.7) * 0.01 : 0) : 0;
    drawGauge(ctx, w / 2, GAUGE_Y, GAUGE_R, lv.needle + quiver, frame);
    drawText(ctx, lv.tag, w / 2, TAG_Y, { size: 1, color: sel ? UI.paper : UI.steel, align: 'center' });
    line(ctx, STAT_X, RULE_Y, w - STAT_X, RULE_Y, UI.brassDark, 1);
    for (let k = 0; k < lv.stats.length; k++) {
      const s = lv.stats[k], yy = STAT_Y + k * STAT_H;
      drawText(ctx, s.label, STAT_X, yy, { size: 1, color: sel ? UI.paper : UI.steel });
      drawText(ctx, s.value, w - STAT_X, yy, { size: 1, color: s.color, align: 'right' });
    }
    if (flash) { ctx.globalAlpha = 0.35; ctx.fillStyle = UI.white; ctx.fillRect(4, 4, w - 8, CARD_H - 8); ctx.globalAlpha = 1; }
    ctx.restore();
    // selection ring: a turning gear either side of the plaque
    if (sel) {
      const cy = y + lift + CARD_H / 2;
      gear(ctx, x - 11, cy, 7, 8, UI.white, '#3a2010', 1, f * 0.05, 2.5);
      gear(ctx, x + w + 11, cy, 7, 8, UI.white, '#3a2010', 1, -f * 0.05, 2.5);
    }
  }
  /** The highlighted level's sentence, the start prompt and the control legend. */
  drawFooter(ctx: CanvasRenderingContext2D, f: number): void {
    const lv = this.level;
    if (lv) lv.blurb.forEach((s, k) => drawText(ctx, s, VIEW_W / 2, 250 + k * 12, { size: 1, color: UI.paper, align: 'center' }));
    if ((f % 60) < 40) drawTextOutlined(ctx, 'PRESS START', VIEW_W / 2, 274, { size: 2, color: UI.white, outline: '#3a2010', thickness: 1, align: 'center' });
    drawText(ctx, this.hint, VIEW_W / 2, 306, { size: 1, color: UI.brass, align: 'center', shadow: false });
    drawText(ctx, 'YOUR CHOICE IS SAVED FOR NEXT TIME - OPTIONS CAN CHANGE IT TOO', VIEW_W / 2, 322, { size: 1, color: UI.brassDark, align: 'center', shadow: false });
  }
}

/**
 * A brass-bezelled pressure gauge centred on (cx, cy): a paper face with green, amber and red bands round a 270 degree
 * sweep, eleven ticks, and a needle at `k` (0 = bottom of the green, 1 = top of the red).
 */
function drawGauge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, k: number, rim: string): void {
  const at = (t: number) => G_A0 + G_SWEEP * t;
  circle(ctx, cx, cy, r + 4, '#2a1c14', rim, 2);
  circle(ctx, cx, cy, r, '#e8dcc0', '#8a5a1c', 1);
  pathArcBand(ctx, cx, cy, r - 6, r - 2, at(0), at(0.45)); paint(ctx, UI.green, null);
  pathArcBand(ctx, cx, cy, r - 6, r - 2, at(0.45), at(0.75)); paint(ctx, UI.brass, null);
  pathArcBand(ctx, cx, cy, r - 6, r - 2, at(0.75), at(1)); paint(ctx, UI.red, null);
  for (let i = 0; i <= 10; i++) {
    const a = at(i / 10), r0 = i % 5 === 0 ? r - 11 : r - 9;
    line(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * (r - 7), cy + Math.sin(a) * (r - 7), '#3a2010', 1);
  }
  drawText(ctx, 'PSI', cx, cy + 10, { size: 1, color: '#8a6a4a', align: 'center', shadow: false });
  const a = at(Math.max(0, Math.min(1, k)));
  line(ctx, cx - Math.cos(a) * 4, cy - Math.sin(a) * 4, cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4), '#2a1a10', 2);
  circle(ctx, cx, cy, 3, UI.brass, '#3a2010', 1);
}
