// Board select (title -> BOARD SELECT -> character select): one brass plaque per board in content/stage/index.js,
// each with a hand-drawn vignette of the board, its stage number and name. Boards that have not been opened yet show
// a riveted padlock plate with '? ? ? ? ?' and the board you have to clear to open them; confirming one buzzes and
// shakes the plaque instead of starting. Cleared boards carry a stamped CLEARED plate with the best rank and score.
// Unlock state lives in game/progress.js; `?stage=N` and `?unlockall=1` open boards for the session (see main.js).
//
// The results screen hands this screen a `reveal` stage id after a clear that opened a board (see screens/results.js).
// The plaque is then drawn still sealed and opens on camera: the padlock rattles itself apart, the hatch splits into
// two retracting doors, the '? ? ? ? ?' resolves letter by letter into the board's name and a STAGE N OPEN stamp
// lands with the music. Attack or start skips the flourish; either way the screen settles into normal selection.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, gear, rivetLine } from '../../art/shapes.js';
import { particles } from '../../engine/particles.js';
import { STAGES } from '../../content/stage/index.js';
import { progress } from '../progress.js';
// The plaque art is shared with the online co-op lobby, which draws the same boards small.
import { DEFAULT_PREVIEW, clamp01, rowMetrics, wrapText, drawVignette, drawLockHatch, drawHatchDoors, drawPadlock } from './boardcards.js';

const CARD_Y = 46, CARD_H = 196, GAP = 24, CARD_W_MAX = 200, ROW_PAD = 60;
const ART_X = 9, ART_Y = 26, ART_H = 78;
const DENY_FRAMES = 30, CONFIRM_FRAMES = 18;
/** Reveal phase lengths in frames, and the cumulative frame each phase ends on. */
const RV = { hold: 20, rattle: 46, snap: 12, peel: 36, name: 46, stamp: 34 };
const RV_HOLD = RV.hold, RV_SNAP = RV_HOLD + RV.rattle, RV_PEEL = RV_SNAP + RV.snap,
  RV_NAME = RV_PEEL + RV.peel, RV_STAMP = RV_NAME + RV.name, RV_END = RV_STAMP + RV.stamp;
const RV_SKIPPABLE = 12;
/** Glyphs the resolving name flickers through (all present in the 5x7 font). */
const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Board select screen. Left/right picks a board, attack/start confirms, dodge returns to the title. */
export class BoardSelectScreen extends Screen {
  constructor(game) { super(game, 'boardselect'); }
  enter(params) {
    super.enter(params);
    this.boards = STAGES.map((stage, i) => ({
      stage, index: i,
      unlocked: progress.isUnlocked(i),
      record: progress.record(stage.id),
      // the board that opens this one - kept even once it is open, so a reveal can show the note it used to carry
      prev: STAGES[i - 1] || null,
    }));
    // A board this run just opened is revealed on its own plaque rather than simply appearing unlocked.
    const target = params.reveal ? this.boards.findIndex((b) => b.stage.id === params.reveal && b.unlocked) : -1;
    this.reveal = target >= 0 ? { index: target, t: 0, shake: 0 } : null;
    // otherwise start on the board the options point at, or the last one that is open (the newest thing to play)
    const wanted = Math.min(this.boards.length - 1, Math.max(0, (this.game.options.stage || 1) - 1));
    this.cursor = this.reveal ? this.reveal.index : (this.boards[wanted] && this.boards[wanted].unlocked ? wanted : this.lastUnlocked());
    this.deny = 0; this.confirm = -1; this.leaving = false;
    // the reveal opens in silence and brings the music back in on the stamp
    if (this.reveal) this.game.audio.music.stop();
    else this.game.audio.music.play('title');
    particles.clear();
  }
  /** Index of the last board that is open (0 when none beyond the first). */
  lastUnlocked() { let n = 0; for (let i = 0; i < this.boards.length; i++) if (this.boards[i].unlocked) n = i; return n; }
  get board() { return this.boards[this.cursor]; }
  /** Card geometry: one centred row, cards shrink as boards are added rather than overflowing the view. */
  get metrics() { return rowMetrics(this.boards.length, { maxW: CARD_W_MAX, gap: GAP, pad: ROW_PAD }); }
  cardX(i) { const m = this.metrics; return m.x0 + i * (m.w + GAP); }
  /** How far this board's hatch has opened: 0 sealed, 1 fully open. */
  peelOf(i) {
    const b = this.boards[i], rv = this.reveal;
    if (rv && rv.index === i) return clamp01((rv.t - RV_PEEL) / RV.peel);
    return b.unlocked ? 1 : 0;
  }
  update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio;
    if (this.deny > 0) this.deny--;
    particles.update();
    if (this.reveal) { this.tickReveal(); return; }
    if (this.confirm >= 0) {
      if (++this.confirm >= CONFIRM_FRAMES && !this.leaving) {
        this.leaving = true;
        this.game.options.stage = this.cursor + 1;
        this.game.fadeTo(() => this.game.replace('select'), 0.1);
      }
      return;
    }
    if (this.leaving || !this.boards.length) return;
    for (let p = 0; p < 2; p++) {
      if (!inp.joined(p)) { if (inp.joinPressed(p)) { inp.setJoined(p, true); audio.play('join'); } continue; }
      const dir = (inp.pressed(p, 'right') ? 1 : 0) - (inp.pressed(p, 'left') ? 1 : 0);
      if (dir) { this.cursor = (this.cursor + dir + this.boards.length) % this.boards.length; audio.play('menu_move'); continue; }
      if (inp.pressed(p, 'attack') || inp.pressed(p, 'start') || inp.pressed(p, 'jump')) { this.pick(); return; }
      if (inp.pressed(p, 'dodge') && p === 0) {
        audio.play('menu_back');
        this.leaving = true;
        this.game.fadeTo(() => this.game.replace('title'), 0.08);
        return;
      }
    }
  }
  /** Drive the unlock reveal one frame: rattle, snap, the doors retracting, the name resolving, the stamp. */
  tickReveal() {
    const r = this.reveal, audio = this.game.audio, inp = this.game.input;
    const prev = r.t;
    r.t++;
    if (r.shake > 0) r.shake--;
    // anyone can skip the flourish once it has been on screen for a beat
    if (r.t > RV_SKIPPABLE) {
      for (let p = 0; p < 2; p++) {
        if (!inp.joined(p)) { if (inp.joinPressed(p)) { inp.setJoined(p, true); audio.play('join'); } continue; }
        if (inp.pressed(p, 'attack') || inp.pressed(p, 'start')) { this.endReveal(); return; }
      }
    }
    const cx = this.cardX(r.index) + this.metrics.w / 2, cy = CARD_Y + ART_Y + ART_H / 2;
    const crossed = (mark) => prev < mark && r.t >= mark;
    if (crossed(RV_HOLD)) audio.play('gear_slip');            // the lock starts to give
    if (r.t > RV_HOLD && r.t < RV_SNAP) {                     // rattle ticks tighten as it goes
      const k = (r.t - RV_HOLD) / RV.rattle, every = Math.max(3, Math.round(9 - k * 6));
      if (r.t % every === 0) {
        audio.play('continue_tick'); r.shake = 3;
        particles.spawn('spark', cx, cy + 8, 0, { screen: true, vx: (r.t % 3 - 1) * 0.9, vy: -1.2, life: 16 });
      }
    }
    if (crossed(RV_SNAP)) {                                   // the shackle breaks
      audio.play('prop_break'); r.shake = 14;
      for (let i = 0; i < 26; i++) particles.spawn('spark', cx, cy, 0, { screen: true, vx: (i % 7 - 3) * 2.2, vy: -2 - (i % 4), life: 30 });
    }
    if (crossed(RV_PEEL)) audio.play('hydraulic');            // the doors start to retract
    if (crossed(RV_PEEL + (RV.peel >> 1))) audio.play('steam_vent');
    if (crossed(RV_NAME)) audio.play('chime');                // the name begins to resolve
    if (crossed(RV_STAMP)) {                                  // stamp lands, music comes back in
      audio.play('stage_clear'); r.shake = 8;
      audio.music.play('title');
    }
    if (r.t >= RV_END) this.endReveal();
  }
  /** Leave the reveal for the normal interactive selector, however it ended. */
  endReveal() {
    this.reveal = null;
    this.game.audio.music.play('title');
  }
  /** Confirm the highlighted board, or buzz and shake it when it is still locked. */
  pick() {
    const b = this.board;
    if (!b) return;
    if (!b.unlocked) { this.deny = DENY_FRAMES; this.game.audio.play('menu_back'); return; }
    this.confirm = 0;
    this.game.audio.play('menu_confirm');
    const x = this.cardX(this.cursor) + this.metrics.w / 2;
    for (let i = 0; i < 18; i++) particles.spawn('spark', x, CARD_Y + CARD_H / 2, 0, { screen: true, vx: (i % 6 - 2.5) * 1.6, vy: -1.5 - (i % 4), life: 26 });
  }
  /** Test / debug hook: what the screen is showing, per board. */
  summary() {
    return {
      screen: 'boardselect', cursor: this.cursor,
      revealing: !!this.reveal, revealIndex: this.reveal ? this.reveal.index : -1,
      boards: this.boards.map((b) => ({ id: b.stage.id, name: b.stage.name, unlocked: b.unlocked, cleared: !!b.record })),
    };
  }
  draw(ctx) {
    const f = this.frame, rv = this.reveal;
    ctx.fillStyle = '#1c1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // the snap kicks the whole screen
    const sh = rv && rv.shake > 0 ? Math.round(Math.sin(rv.shake * 1.7) * Math.min(4, rv.shake / 2.5)) : 0;
    ctx.save();
    if (sh) ctx.translate(sh, -sh >> 1);
    ctx.globalAlpha = 0.22;
    gear(ctx, 56, 322, 92, 14, '#3a2a48', null, 0, f * 0.004, 30);
    gear(ctx, 604, 34, 72, 12, '#3a2a48', null, 0, -f * 0.005, 24);
    ctx.globalAlpha = 1;
    drawTextOutlined(ctx, 'BOARD SELECT', VIEW_W / 2, 8, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    // the counter ticks over with the stamp, so it reads 1 / 2 right up to the moment the board opens
    const open = rv && rv.t < RV_STAMP ? progress.unlockedCount() - 1 : progress.unlockedCount();
    drawText(ctx, `BOARDS OPEN  ${open} / ${this.boards.length}`, VIEW_W / 2, 30, { size: 1, color: open < this.boards.length ? UI.steel : UI.teal, align: 'center' });
    if (!this.boards.length) { drawText(ctx, 'NO BOARDS REGISTERED', VIEW_W / 2, 170, { size: 1, color: UI.red, align: 'center' }); ctx.restore(); return; }
    const m = this.metrics;
    for (let i = 0; i < this.boards.length; i++) {
      // spotlight the plaque being revealed
      if (rv && rv.index !== i) ctx.globalAlpha = 0.4;
      this.drawCard(ctx, i, this.cardX(i), CARD_Y, m.w, f);
      ctx.globalAlpha = 1;
    }
    this.drawFooter(ctx, f);
    particles.draw(ctx, null, 'front');
    ctx.restore();
  }
  /** One board plaque: brass frame, vignette (or padlock plate), stage number, name and clear stamp. */
  drawCard(ctx, i, x, y, w, f) {
    const b = this.boards[i], sel = i === this.cursor;
    const rv = this.reveal && this.reveal.index === i ? this.reveal : null;
    const peel = this.peelOf(i), sealed = peel <= 0;
    // how much of the board's own detail has arrived: nothing while sealed, the name resolving, then the rest
    const nameK = rv ? clamp01((rv.t - RV_NAME) / RV.name) : 1;
    const detailK = rv ? clamp01((rv.t - RV_STAMP) / 12) : 1;
    // the selected plaque lifts and bobs; a denied confirm shakes it, and so does the lock giving way
    const lift = sel && !rv ? -3 + Math.round(Math.sin(f * 0.06) * 2) : 0;
    let shake = sel && this.deny > 0 ? Math.round(Math.sin(this.deny * 1.6) * (this.deny / 6)) : 0;
    if (rv && rv.shake > 0) shake += Math.round(Math.sin(rv.shake * 2.3) * Math.min(3, rv.shake / 3));
    const flash = (this.confirm >= 0 && sel && (this.confirm >> 1) % 2 === 0)
      || (rv && rv.t >= RV_STAMP && rv.t < RV_STAMP + 8 && (rv.t >> 1) % 2 === 0);
    ctx.save();
    ctx.translate(x + shake, y + lift);
    const frame = sealed ? '#6a6a72' : (sel ? UI.brassLight : UI.brass);
    rrect(ctx, 0, 0, w, CARD_H, 6, sealed ? '#241e26' : '#3a2a18', frame, sel ? 3 : 2);
    rrect(ctx, 4, 4, w - 8, CARD_H - 8, 4, 'rgba(12,8,16,0.88)', sealed ? '#3c3a44' : UI.brassDark, 1);
    rivetLine(ctx, 10, 9, w - 10, 9, Math.max(4, Math.round(w / 26)), 1.5, frame);
    rivetLine(ctx, 10, CARD_H - 9, w - 10, CARD_H - 9, Math.max(4, Math.round(w / 26)), 1.5, frame);
    drawText(ctx, `STAGE ${b.stage.number || i + 1}`, w / 2, 14, { size: 1, color: sealed ? UI.steel : UI.brassLight, align: 'center' });
    // ---- the art window: hatch, opening doors, or the board's vignette
    const aw = w - ART_X * 2;
    if (peel >= 1) {
      drawVignette(ctx, ART_X, ART_Y, aw, ART_H, b.stage.preview || DEFAULT_PREVIEW, f);
    } else if (sealed) {
      drawLockHatch(ctx, ART_X, ART_Y, aw, ART_H);
      this.drawRevealPadlock(ctx, ART_X, ART_Y, aw, ART_H, rv, f);
    } else {
      drawVignette(ctx, ART_X, ART_Y, aw, ART_H, b.stage.preview || DEFAULT_PREVIEW, f);
      drawHatchDoors(ctx, ART_X, ART_Y, aw, ART_H, peel);
    }
    ctx.strokeStyle = sealed ? '#3c3a44' : UI.brassDark; ctx.lineWidth = 1;
    ctx.strokeRect(ART_X + 0.5, ART_Y + 0.5, aw - 1, ART_H - 1);
    // ---- the caption: '? ? ? ? ?' while sealed, then the name resolving out of noise, then the rest
    const nameY = ART_Y + ART_H + 10;
    if (sealed) {
      drawText(ctx, '? ? ? ? ?', w / 2, nameY, { size: 2, color: '#6a6a72', align: 'center' });
      const req = b.unlocked ? b.prev : (b.prev || null);
      const note = req ? ['CLEAR', `STAGE ${req.number || b.index}`, 'TO OPEN'] : ['LOCKED'];
      note.forEach((s, k) => drawText(ctx, s, w / 2, nameY + 24 + k * 11, { size: 1, color: UI.steel, align: 'center' }));
    } else {
      const shown = nameK >= 1 ? b.stage.name : scrambleName(b.stage.name, nameK, f);
      const lines = wrapText(shown, w - 16, 1);
      lines.forEach((s, k) => drawText(ctx, s, w / 2, nameY + k * 11, { size: 1, color: nameK < 1 ? UI.teal : (sel ? UI.white : UI.paper), align: 'center' }));
      if (detailK > 0) {
        ctx.save(); ctx.globalAlpha *= detailK;
        const below = nameY + lines.length * 11 + 5;
        drawText(ctx, `${(b.stage.sections || []).length} SECTIONS`, w / 2, below, { size: 1, color: UI.steel, align: 'center' });
        const pv = b.stage.preview || DEFAULT_PREVIEW;
        if (pv.blurb) drawText(ctx, pv.blurb, w / 2, below + 12, { size: 1, color: UI.brassDark, align: 'center' });
        if (b.record) {
          const sy = CARD_H - 40;
          rrect(ctx, 12, sy, w - 24, 26, 3, 'rgba(60,40,24,0.85)', UI.brassDark, 1);
          drawText(ctx, 'CLEARED', w / 2, sy + 4, { size: 1, color: UI.brassLight, align: 'center' });
          const best = b.record.rank ? `RANK ${b.record.rank}   ${String(b.record.score).padStart(7, '0')}` : String(b.record.score).padStart(7, '0');
          drawText(ctx, best, w / 2, sy + 15, { size: 1, color: UI.teal, align: 'center' });
        } else {
          drawText(ctx, 'NOT CLEARED', w / 2, CARD_H - 30, { size: 1, color: UI.brassDark, align: 'center' });
        }
        ctx.restore();
      }
    }
    if (flash) { ctx.globalAlpha = 0.35; ctx.fillStyle = UI.white; ctx.fillRect(4, 4, w - 8, CARD_H - 8); ctx.globalAlpha = 1; }
    ctx.restore();
    // selection ring: a turning gear either side of the plaque, red while a locked board is refusing
    if (sel && !(rv && rv.t < RV_STAMP)) {
      const c = this.deny > 0 ? UI.red : UI.white, cy = y + lift + CARD_H / 2;
      gear(ctx, x + shake - 11, cy, 7, 8, c, '#3a2010', 1, f * 0.05, 2.5);
      gear(ctx, x + shake + w + 11, cy, 7, 8, c, '#3a2010', 1, -f * 0.05, 2.5);
    }
  }
  /** The padlock on a sealed plaque: still, rattling itself apart, or tumbling off once it has snapped. */
  drawRevealPadlock(ctx, x, y, w, h, rv, f) {
    const cx = x + w / 2, cy = y + h / 2 + 4;
    if (!rv) { drawPadlock(ctx, cx, cy, { breathe: f }); return; }
    if (rv.t >= RV_SNAP) {
      // broken: the body tumbles off the plate and fades out as the doors take over
      const dt = rv.t - RV_SNAP;
      drawPadlock(ctx, cx + dt * 0.7, cy + dt * dt * 0.2, { open: true, rot: dt * 0.28, alpha: clamp01(1 - dt / RV.snap) });
      return;
    }
    const k = clamp01((rv.t - RV_HOLD) / RV.rattle);
    drawPadlock(ctx, cx + Math.round(Math.sin(rv.t * 2.4) * k * 3), cy, { breathe: f, strain: k });
  }
  /** Subtitle / lock explanation for the highlighted board plus the control legend, or the reveal's stamp. */
  drawFooter(ctx, f) {
    const rv = this.reveal, b = this.board;
    if (rv) {
      const stage = this.boards[rv.index].stage;
      if (rv.t < RV_SNAP) drawText(ctx, 'SOMETHING IS COMING LOOSE...', VIEW_W / 2, 250, { size: 1, color: UI.steel, align: 'center' });
      else if (rv.t < RV_STAMP) drawText(ctx, 'THE SEAL IS BROKEN', VIEW_W / 2, 250, { size: 1, color: UI.teal, align: 'center' });
      else {
        wrapText(stage.subtitle || '', VIEW_W - 80, 1).slice(0, 2).forEach((s, k) => drawText(ctx, s, VIEW_W / 2, 250 + k * 12, { size: 1, color: UI.paper, align: 'center' }));
        // the stamp: a 6f slam from oversized down to its final size, like the results rank
        const t = clamp01((rv.t - RV_STAMP) / 6), size = 3 + Math.round((1 - t) * 3);
        const n = stage.number || rv.index + 1;
        drawTextOutlined(ctx, `STAGE ${n} OPEN`, VIEW_W / 2, 274 - (size - 3) * 4, { size, color: UI.teal, outline: '#0a3038', thickness: 2, align: 'center' });
      }
      drawText(ctx, 'ATTACK OR START  SKIP', VIEW_W / 2, 322, { size: 1, color: UI.brassDark, align: 'center', shadow: false });
      return;
    }
    if (b) {
      if (b.unlocked) {
        wrapText(b.stage.subtitle || '', VIEW_W - 80, 1).slice(0, 2).forEach((s, k) => drawText(ctx, s, VIEW_W / 2, 250 + k * 12, { size: 1, color: UI.paper, align: 'center' }));
      } else if (b.prev) {
        drawText(ctx, `SEALED - CLEAR ${b.prev.name} TO OPEN THIS BOARD`, VIEW_W / 2, 250, { size: 1, color: this.deny > 0 ? UI.red : UI.steel, align: 'center' });
      }
    }
    if (this.deny > 0 && (this.deny >> 2) % 2 === 0) drawTextOutlined(ctx, 'LOCKED', VIEW_W / 2, 274, { size: 2, color: UI.red, outline: '#2a1010', thickness: 1, align: 'center' });
    else if ((f % 60) < 40) drawTextOutlined(ctx, 'PRESS START', VIEW_W / 2, 274, { size: 2, color: UI.white, outline: '#3a2010', thickness: 1, align: 'center' });
    drawText(ctx, 'LEFT / RIGHT  CHOOSE BOARD      ATTACK OR START  CONFIRM      DODGE  BACK', VIEW_W / 2, 306, { size: 1, color: UI.brass, align: 'center', shadow: false });
    drawText(ctx, 'CLEAR A BOARD TO OPEN THE NEXT ONE - YOUR PROGRESS IS SAVED IN THIS BROWSER', VIEW_W / 2, 322, { size: 1, color: UI.brassDark, align: 'center', shadow: false });
  }
}

/**
 * A board name resolving out of noise: characters lock in left to right, the rest flicker through SCRAMBLE.
 * Spaces are preserved and the length never changes, so the wrap stays put while it resolves.
 */
function scrambleName(name, k, f) {
  const chars = String(name).split('');
  const settled = Math.floor(k * chars.length * 1.12);
  return chars.map((c, i) => {
    if (i < settled || c === ' ') return c;
    return SCRAMBLE[(i * 7 + f * 3) % SCRAMBLE.length];
  }).join('');
}
