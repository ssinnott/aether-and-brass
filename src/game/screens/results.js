// Results / ranking screen (GDD 6 + 9): brass plaque, per-player columns (enemies defeated, max combo, damage taken,
// continues, time, score), rank stamp (S/A/B/C/D from score, rank from score only per RECONCILIATION), press start -> title.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, rivetLine, gear } from '../../art/shapes.js';
import { particles } from '../../engine/particles.js';

const ROWS = [['ENEMIES DEFEATED', 'kills'], ['MAX COMBO', 'maxCombo'], ['DAMAGE TAKEN', 'damageTaken'], ['CONTINUES USED', 'continues'], ['TIME', 'time'], ['SCORE', 'score']];
const ROW_FRAMES = 20;
const RANKS = [[120000, 'S', '#ffffff'], [90000, 'A', '#4DF0E0'], [60000, 'B', '#ffe45a'], [30000, 'C', '#ff9a30'], [0, 'D', '#c8c8c8']];
const AUTO_RETURN = 600, BOT_HOLD = 900;

/** Rank letter for a total score. */
export function rankFor(score) { for (const r of RANKS) if (score >= r[0]) return { letter: r[1], color: r[2] }; return { letter: 'D', color: '#c8c8c8' }; }
function fmtTime(frames) { const s = Math.floor(frames / 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

/** Stage results. */
export class ResultsScreen extends Screen {
  constructor(game) { super(game, 'results'); }
  enter(params) {
    super.enter(params);
    this.stats = (params.stats && params.stats.length ? params.stats : [{ name: 'P1', kills: 0, maxCombo: 0, damageTaken: 0, continues: 0, score: 0 }]).slice(0, 2);
    this.time = params.time || 0;
    /** True when the run ended on an expired continue countdown (GDD 9): no time bonus, rank capped at D. */
    this.defeat = !!params.defeat;
    const seconds = Math.floor(this.time / 60);
    this.timeBonus = this.defeat ? 0 : Math.max(0, 60000 - seconds * 50);
    for (const s of this.stats) { s.time = fmtTime(this.time); s.finalScore = s.score + Math.round(this.timeBonus / this.stats.length); }
    this.total = this.stats.reduce((a, s) => a + s.finalScore, 0);
    this.summaryExtra = { sectionIndex: params.sectionIndex || 0, wavesCleared: params.wavesCleared || 0, cameraX: params.cameraX || 0 };
    this.rank = this.defeat ? rankFor(0) : rankFor(this.total);
    this.rowsShown = 0; this.stamp = -1; this.done = false; this.leaving = false;
    this.game.audio.music.play(this.defeat ? 'gameover' : 'results');
    particles.clear();
  }
  /** Keep the stage bookkeeping visible to window.__game.summary() after the run. */
  summary() { return this.summaryExtra; }
  update() {
    super.update();
    if (this.leaving) return;
    const inp = this.game.input;
    if (this.frame % ROW_FRAMES === 0 && this.rowsShown < ROWS.length + 1) { this.rowsShown++; this.game.audio.play('continue_tick'); }
    if (this.rowsShown > ROWS.length && this.stamp < 0) { this.stamp = 0; this.game.audio.play('rank_stamp'); }
    if (this.stamp >= 0) this.stamp++;
    if (this.stamp === 6) { for (let i = 0; i < 20; i++) particles.spawn('spark', 470 + (i * 37) % 60, 150 + (i * 23) % 60, 0, { screen: true, vx: (i % 5 - 2) * 1.5, vy: -2 - (i % 3), life: 30 }); }
    particles.update();
    let go = false;
    for (let p = 0; p < 2; p++) if (inp.joined(p) && (inp.pressed(p, 'start') || inp.pressed(p, 'attack'))) go = true;
    if (this.game.options.bot) go = this.frame > BOT_HOLD;
    else if (this.frame > AUTO_RETURN + ROWS.length * ROW_FRAMES) go = true;
    if (go && this.frame > 30) { this.leaving = true; this.game.audio.play('menu_confirm'); this.game.fadeTo(() => this.game.reset('title'), 0.06); }
  }
  draw(ctx) {
    const f = this.frame;
    ctx.fillStyle = '#1a1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.2; gear(ctx, 80, 300, 100, 14, '#3a2a48', null, 0, f * 0.003, 30); gear(ctx, 590, 60, 70, 12, '#3a2a48', null, 0, -f * 0.005, 22); ctx.globalAlpha = 1;
    rrect(ctx, 40, 24, VIEW_W - 80, VIEW_H - 48, 8, 'rgba(60,40,24,0.9)', UI.brass, 3);
    rivetLine(ctx, 52, 34, VIEW_W - 52, 34, 20, 2, UI.brass);
    rivetLine(ctx, 52, VIEW_H - 34, VIEW_W - 52, VIEW_H - 34, 20, 2, UI.brass);
    if (this.defeat) drawTextOutlined(ctx, 'THE ENGINE WINS.', VIEW_W / 2, 44, { size: 3, color: UI.red, outline: '#2a1010', thickness: 1, align: 'center' });
    else drawTextOutlined(ctx, 'STAGE CLEAR', VIEW_W / 2, 44, { size: 3, color: UI.brassLight, outline: '#3a2010', thickness: 1, align: 'center' });
    drawText(ctx, 'THE ASCENT OF CALDERWICK', VIEW_W / 2, 74, { size: 1, color: UI.paper, align: 'center' });
    const n = this.stats.length, colW = 150, x0 = 70 + 130;
    this.stats.forEach((s, i) => drawText(ctx, s.name, x0 + i * colW + colW / 2, 96, { size: 1, color: i === 0 ? UI.p1 : UI.p2, align: 'center' }));
    ROWS.forEach(([label, key], r) => {
      if (r >= this.rowsShown) return;
      const y = 114 + r * 18;
      drawText(ctx, label, 70, y, { size: 1, color: UI.steel });
      this.stats.forEach((s, i) => {
        const v = key === 'score' ? String(s.score).padStart(7, '0') : String(s[key]);
        drawText(ctx, v, x0 + i * colW + colW / 2, y, { size: 1, color: UI.paper, align: 'center' });
      });
    });
    if (this.rowsShown > ROWS.length) {
      drawText(ctx, `TIME BONUS +${this.timeBonus}`, 70, 228, { size: 1, color: UI.brass });
      drawText(ctx, `TOTAL ${String(this.total).padStart(7, '0')}`, 70, 244, { size: 1, color: UI.brassLight });
    }
    if (this.stamp >= 0) {
      const t = Math.min(1, this.stamp / 6), sc = 4 + Math.round((1 - t) * 6);
      const shake = this.stamp < 12 && this.stamp >= 6 ? ((this.stamp % 2) ? 3 : -3) : 0;
      drawText(ctx, 'RANK', 500 + shake, 200, { size: 1, color: UI.steel, align: 'center' });
      drawTextOutlined(ctx, this.rank.letter, 500 + shake, 214, { size: sc, color: this.rank.color, outline: '#3a2010', thickness: 2, align: 'center' });
      particles.draw(ctx, null, 'front');
    }
    if (n < 2) drawText(ctx, 'SOLO RUN', x0 + colW + colW / 2, 96, { size: 1, color: UI.brassDark, align: 'center' });
    if ((f % 60) < 40 && this.stamp > 10) drawText(ctx, 'PRESS START', VIEW_W / 2, VIEW_H - 52, { size: 1, color: UI.paper, align: 'center' });
  }
}
