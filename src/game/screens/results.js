// Results / ranking screen (GDD 6 + 9): brass plaque, per-player columns (enemies defeated, max combo, damage taken,
// continues, time, score) rolling in one row per 20f with ratchet ticks, rank S/A/B/C/D stamped with a 6f slam + shake
// (rank from score only per RECONCILIATION; D ceiling after a lost continue countdown), victory poses (win anims),
// auto-return after 600f, PRESS START.
// Clearing a board records it in game/progress.js, which is what opens the next board on BOARD SELECT; when this run
// opened one, a plate announces it under the totals.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, rivetLine, gear } from '../../art/shapes.js';
import { particles } from '../../engine/particles.js';
import { buildRig, drawRig } from '../../art/rig.js';
import { drawShadowScreen } from '../../art/fx.js';
import { AnimPlayer } from '../animation.js';
import { progress } from '../progress.js';
import { getStage, stageIndex } from '../../content/stage/index.js';

const ROWS = [['ENEMIES DEFEATED', 'kills'], ['MAX COMBO', 'maxCombo'], ['DAMAGE TAKEN', 'damageTaken'], ['CONTINUES USED', 'continues'], ['TIME', 'time'], ['SCORE', 'score']];
const ROW_FRAMES = 20, ROLL_FRAMES = 16;
const RANKS = [[120000, 'S', '#ffffff'], [90000, 'A', '#4DF0E0'], [60000, 'B', '#ffe45a'], [30000, 'C', '#ff9a30'], [0, 'D', '#c8c8c8']];
const AUTO_RETURN = 600, BOT_HOLD = 900;
const LABEL_X = 64, COL_X = 250, COL_W = 120, ROW_Y = 104;
const HERO_X = [470, 560], HERO_Y = 322;

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
    // Which board this was, and - on a clear - the board that clear just opened (null when nothing new opened).
    this.stage = params.stage || getStage(this.game.options.stage);
    this.unlocked = this.defeat || !this.stage ? null : progress.markCleared(this.stage.id, { score: this.total, rank: this.rank.letter });
    this.rowsShown = 0; this.rowTimer = 0; this.stamp = -1; this.leaving = false;
    // victory poses: the players' rigs playing their win anims (defeat: lying)
    const chars = this.game.characters || [], picks = this.game.options.chars || [];
    this.heroes = this.stats.map((s, i) => {
      const def = chars.find((c) => c.name === s.name) || chars[picks[i]] || chars[i] || null;
      if (!def) return null;
      const anim = new AnimPlayer(def.anims || {});
      anim.play(this.defeat ? 'lying' : 'win', { fallback: 'idle' });
      return { rig: buildRig(def.build || {}), anim };
    });
    this.game.audio.music.play(this.defeat ? 'gameover' : 'results');
    particles.clear();
  }
  /** Keep the stage bookkeeping visible to window.__game.summary() after the run. */
  summary() { return { ...this.summaryExtra, stageId: this.stage ? this.stage.id : '', unlockedStageId: this.unlocked ? this.unlocked.id : '' }; }
  update() {
    super.update();
    for (const h of this.heroes) if (h) { h.anim.tick(); if (h.anim.done) h.anim.play(this.defeat ? 'lying' : 'win', { restart: true, fallback: 'idle' }); }
    if (this.leaving) return;
    const inp = this.game.input, audio = this.game.audio;
    if (this.rowsShown <= ROWS.length) {
      if (this.frame % ROW_FRAMES === 0 && this.frame > 0) { this.rowsShown++; this.rowTimer = 0; audio.play('menu_move'); }
      else if (++this.rowTimer < ROLL_FRAMES && this.rowTimer % 4 === 0 && this.rowsShown > 0) audio.play('menu_move');
    }
    if (this.rowsShown > ROWS.length && this.stamp < 0) { this.stamp = 0; audio.play('rank_stamp'); }
    if (this.stamp >= 0) this.stamp++;
    if (this.stamp === 6) { for (let i = 0; i < 24; i++) particles.spawn('spark', 520 + (i * 37) % 60, 150 + (i * 23) % 50, 0, { screen: true, vx: (i % 5 - 2) * 1.8, vy: -2 - (i % 3), life: 30 }); }
    particles.update();
    let go = false;
    for (let p = 0; p < 2; p++) if (inp.joined(p) && (inp.pressed(p, 'start') || inp.pressed(p, 'attack'))) go = true;
    if (this.game.options.bot) go = this.frame > BOT_HOLD;
    else if (this.stamp > AUTO_RETURN) go = true;
    if (go && this.frame > 30) { this.leaving = true; audio.play('menu_confirm'); this.game.fadeTo(() => this.game.reset('title'), 0.06); }
  }
  /** "NEW BOARD OPEN" plate: what this clear unlocked, and where to find it. */
  drawUnlock(ctx, f) {
    const stage = this.unlocked, n = stage.number || stageIndex(stage) + 1;
    const x = 56, y = 262, w = 344, h = 34;
    rrect(ctx, x, y, w, h, 4, 'rgba(20,44,44,0.85)', UI.teal, (f % 40) < 20 ? 2 : 1);
    drawText(ctx, `NEW BOARD OPEN - STAGE ${n}`, x + w / 2, y + 5, { size: 1, color: UI.teal, align: 'center' });
    drawText(ctx, stage.name, x + w / 2, y + 18, { size: 1, color: UI.brassLight, align: 'center' });
  }
  /** Value of a row as shown while it rolls in (numbers count up over ROLL_FRAMES). */
  rowValue(s, key, r) {
    const raw = s[key];
    if (key === 'time') return raw;
    const k = r === this.rowsShown - 1 ? Math.min(1, this.rowTimer / ROLL_FRAMES) : 1;
    const v = Math.round((Number(raw) || 0) * k);
    return key === 'score' ? String(v).padStart(7, '0') : String(v);
  }
  draw(ctx) {
    const f = this.frame;
    ctx.fillStyle = '#1a1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.2; gear(ctx, 80, 300, 100, 14, '#3a2a48', null, 0, f * 0.003, 30); gear(ctx, 590, 60, 70, 12, '#3a2a48', null, 0, -f * 0.005, 22); ctx.globalAlpha = 1;
    // plaque
    rrect(ctx, 40, 22, VIEW_W - 80, VIEW_H - 44, 8, '#4a3018', UI.brass, 3);
    rrect(ctx, 46, 28, VIEW_W - 92, VIEW_H - 56, 6, 'rgba(60,40,24,0.9)', UI.brassDark, 1);
    rivetLine(ctx, 54, 32, VIEW_W - 54, 32, 20, 2, UI.brass);
    rivetLine(ctx, 54, VIEW_H - 32, VIEW_W - 54, VIEW_H - 32, 20, 2, UI.brass);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(56, 94, VIEW_W - 112, 1); ctx.fillRect(56, 218, 340, 1);
    if (this.defeat) drawTextOutlined(ctx, 'THE ENGINE WINS.', VIEW_W / 2, 40, { size: 3, color: UI.red, outline: '#2a1010', thickness: 1, align: 'center' });
    else drawTextOutlined(ctx, 'STAGE CLEAR', VIEW_W / 2, 40, { size: 3, color: UI.brassLight, outline: '#3a2010', thickness: 1, align: 'center' });
    drawText(ctx, this.stage ? this.stage.name : '', VIEW_W / 2, 70, { size: 1, color: UI.paper, align: 'center' });
    // columns
    const n = this.stats.length;
    this.stats.forEach((s, i) => drawText(ctx, `P${i + 1} ${s.name}`, COL_X + i * COL_W + COL_W / 2, 84, { size: 1, color: i === 0 ? UI.p1 : UI.p2, align: 'center' }));
    if (n < 2) drawText(ctx, 'SOLO RUN', COL_X + COL_W + COL_W / 2, 84, { size: 1, color: UI.brassDark, align: 'center' });
    ROWS.forEach(([label, key], r) => {
      if (r >= this.rowsShown) return;
      const y = ROW_Y + r * 18, rolling = r === this.rowsShown - 1 && this.rowTimer < ROLL_FRAMES;
      drawText(ctx, label, LABEL_X, y, { size: 1, color: UI.steel });
      this.stats.forEach((s, i) => drawText(ctx, this.rowValue(s, key, r), COL_X + i * COL_W + COL_W / 2, y, { size: 1, color: rolling ? UI.brassLight : UI.paper, align: 'center' }));
    });
    if (this.rowsShown > ROWS.length) {
      drawText(ctx, this.defeat ? 'TIME BONUS   NONE' : `TIME BONUS   +${this.timeBonus}`, LABEL_X, 226, { size: 1, color: UI.brass });
      drawTextOutlined(ctx, `TOTAL  ${String(this.total).padStart(7, '0')}`, LABEL_X, 240, { size: 2, color: UI.brassLight, outline: '#3a2010', align: 'left' });
    }
    // victory poses
    this.heroes.forEach((h, i) => {
      if (!h) return;
      drawShadowScreen(ctx, HERO_X[i], HERO_Y, 34 * h.rig.scale, 0.45);
      drawRig(ctx, h.rig, h.anim.pose, { x: HERO_X[i], y: HERO_Y, facing: i === 0 ? 1 : -1 });
    });
    // rank stamp: 6f slam from big to final size, then a 6f shake
    if (this.stamp >= 0) {
      const t = Math.min(1, this.stamp / 6), sc = 5 + Math.round((1 - t) * 6);
      const shake = this.stamp >= 6 && this.stamp < 12 ? ((this.stamp % 2) ? 3 : -3) : 0;
      const rx = 540 + shake, ry = 128;
      drawText(ctx, 'RANK', rx, ry - 14, { size: 1, color: UI.steel, align: 'center' });
      if (t >= 1) { rrect(ctx, rx - 32, ry - 6, 64, 56, 4, null, this.rank.color, 2); ctx.globalAlpha = 0.15; ctx.fillStyle = this.rank.color; ctx.fillRect(rx - 32, ry - 6, 64, 56); ctx.globalAlpha = 1; }
      drawTextOutlined(ctx, this.rank.letter, rx, ry + 2 - (sc - 5) * 3, { size: sc, color: this.rank.color, outline: '#3a2010', thickness: 2, align: 'center' });
      if (this.defeat && t >= 1) drawText(ctx, 'D CEILING', rx, ry + 54, { size: 1, color: UI.red, align: 'center' });
      particles.draw(ctx, null, 'front');
    }
    if (this.unlocked && this.stamp > 12) this.drawUnlock(ctx, f);
    if ((f % 60) < 40 && this.stamp > 10) drawText(ctx, 'PRESS START', VIEW_W / 2, VIEW_H - 48, { size: 1, color: UI.paper, align: 'center' });
  }
}
