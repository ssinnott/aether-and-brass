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
import { drawText, drawTextOutlined, measureText } from '../../engine/text.js';
import { rrect, gear, rivetLine, circle, poly, line } from '../../art/shapes.js';
import { particles } from '../../engine/particles.js';
import { STAGES } from '../../content/stage/index.js';
import { progress } from '../progress.js';

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
/** Fallback vignette for a board whose data carries no `preview` block. */
const DEFAULT_PREVIEW = { skyTop: '#0E1424', skyBot: '#3A2E48', ground: '#2B211C', accent: '#FFB038', motif: 'city' };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

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
  get metrics() {
    const n = this.boards.length;
    const w = Math.max(96, Math.min(CARD_W_MAX, Math.floor((VIEW_W - ROW_PAD - (n - 1) * GAP) / Math.max(1, n))));
    return { w, x0: Math.round((VIEW_W - (n * w + (n - 1) * GAP)) / 2) };
  }
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

/** Split text into lines that fit `maxW` px at `size`, breaking on spaces (a single long word is left long). */
function wrapText(text, maxW, size = 1) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && measureText(next, size) > maxW) { lines.push(cur); cur = word; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
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

/** The board's vignette: sky ramp, ground band and a motif silhouette drawn from the stage's `preview` block. */
function drawVignette(ctx, x, y, w, h, pv, f) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, pv.skyTop); g.addColorStop(1, pv.skyBot);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  if (pv.motif === 'sky') drawSkyMotif(ctx, x, y, w, h, pv, f);
  else if (pv.motif === 'works') drawWorksMotif(ctx, x, y, w, h, pv, f);
  else drawCityMotif(ctx, x, y, w, h, pv, f);
  const gh = pv.groundH == null ? 10 : pv.groundH;
  if (gh > 0) {
    ctx.fillStyle = pv.ground; ctx.fillRect(x, y + h - gh, w, gh);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + h - gh, w, 2);
  }
  ctx.restore();
}

/** Board 1: tiered Calderwick terraces under a moon and the lit summit, chimney stacks and window dots. */
function drawCityMotif(ctx, x, y, w, h, pv, f) {
  const base = y + h - 10;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 10; i++) ctx.fillRect(x + ((i * 53 + 9) % w), y + ((i * 29 + 3) % Math.max(1, h - 40)), 1, 1);
  circle(ctx, x + w * 0.74, y + 13, 6, '#F4E8C8', null, 0);
  ctx.globalAlpha = 0.22; circle(ctx, x + w * 0.44, y + h - 26, 13, '#4DF0E0', null, 0); ctx.globalAlpha = 1;
  ctx.fillStyle = '#241C34';
  for (let i = 0; i < 7; i++) {
    const tw = Math.round(w / 7), tx = x + i * tw, th = 16 + ((i * 13) % 5) * 5;
    ctx.fillRect(tx, base - th, tw - 2, th);
    ctx.fillRect(tx + 2, base - th - 4, tw - 6, 4);
  }
  ctx.fillStyle = '#150F20';
  for (let i = 0; i < 5; i++) {
    const tw = Math.round(w / 5), tx = x + i * tw, th = 10 + ((i * 7) % 4) * 4;
    ctx.fillRect(tx, base - th, tw - 3, th);
  }
  ctx.fillStyle = pv.accent;
  for (let i = 0; i < 14; i++) if (((i * 7 + (f >> 5)) % 4) !== 0) ctx.fillRect(x + 4 + (i * 11) % (w - 8), base - 8 - (i % 3) * 6, 2, 2);
  // two stacks trailing steam
  for (const sx of [x + w * 0.22, x + w * 0.72]) {
    ctx.fillStyle = '#150F20'; ctx.fillRect(sx, base - 34, 3, 34);
    for (let k = 0; k < 3; k++) circle(ctx, sx + 1.5 + k, base - 38 - k * 6 - ((f >> 3) % 6), 2 + k, 'rgba(220,220,230,0.22)', null, 0);
  }
}

/** Board 2: a cloud sea at dawn with the Ninth Wing's hulls over it and a lightning fork. */
function drawSkyMotif(ctx, x, y, w, h, pv, f) {
  const base = y + h - 10;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let i = 0; i < 4; i++) {
    const cy = y + 20 + i * 12, off = ((f >> 4) + i * 17) % (w + 40);
    ctx.fillRect(x - 20 + off, cy, 34 - i * 4, 3);
    ctx.fillRect(x - 20 + (off + w / 2) % (w + 40), cy + 4, 22 - i * 3, 2);
  }
  // cloud sea: jittered radii and heights so it reads as weather rather than a row of bubbles
  for (let i = 0; i < 11; i++) {
    const jitter = (i * 37) % 13;
    circle(ctx, x - 6 + (i * (w + 12)) / 10, base + 2 - (jitter % 5), 7 + (jitter % 7), 'rgba(240,220,220,0.28)', null, 0);
  }
  // two airship hulls, the near one lit by the accent
  const hull = (hx, hy, hw, hh, fill) => {
    poly(ctx, [hx, hy, hx + hw * 0.82, hy - hh * 0.5, hx + hw, hy, hx + hw * 0.82, hy + hh * 0.5, hx, hy], fill, null, 0);
  };
  hull(x + w * 0.08, y + 30, w * 0.34, 12, '#2A2438');
  hull(x + w * 0.5, y + 20, w * 0.44, 16, '#171426');
  ctx.fillStyle = pv.accent;
  for (let i = 0; i < 3; i++) ctx.fillRect(x + w * 0.56 + i * 8, y + 19, 2, 2);
  // lightning every ~2s
  if ((f % 130) < 6) {
    const lx = x + w * 0.3;
    line(ctx, lx, y + 2, lx + 5, y + 16, '#e8f0ff', 1.5);
    line(ctx, lx + 5, y + 16, lx - 2, y + 24, '#e8f0ff', 1.5);
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#e8f0ff'; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
  }
}

/** Board 3: the Chandlery's works under a chalk sky — a long roof, four chimneys smoking, kiln mouths lit lime. */
function drawWorksMotif(ctx, x, y, w, h, pv, f) {
  const base = y + h - 12;
  // the lime haze the works stands in: a bright band across the bottom of the sky
  ctx.fillStyle = 'rgba(244,240,226,0.5)'; ctx.fillRect(x, base - 22, w, 22);
  // the works: one long shed with a shallow roof, the widest flat shape on any plaque
  ctx.fillStyle = '#6E6759'; ctx.fillRect(x + 6, base - 26, w - 12, 26);
  poly(ctx, [x + 6, base - 26, x + 22, base - 34, x + w - 22, base - 34, x + w - 6, base - 26], '#565046', null, 0);
  // four draw-kiln chimneys, with smoke standing straight up off them (nothing on this board blows sideways)
  for (let i = 0; i < 4; i++) {
    const sx = x + 16 + i * ((w - 32) / 3.4);
    ctx.fillStyle = '#4A443B'; ctx.fillRect(sx, base - 56, 5, 30);
    for (let k = 0; k < 3; k++) {
      const sy = base - 60 - k * 7 - ((f >> 3) % 7);
      circle(ctx, sx + 2.5, sy, 2 + k, `rgba(238,236,226,${0.3 - k * 0.07})`, null, 0);
    }
  }
  // the kiln mouths along the ground: the board's one saturated colour, and the only light in the picture. The
  // fourth slot is left out on purpose — that is where the handcart stands, and a cart drawn ON a lit kiln mouth
  // reads as a vehicle with headlights.
  const slot = (w - 24) / 5;
  for (let i = 0; i < 5; i++) {
    if (i === 3) continue;
    const kx = x + 12 + i * slot;
    ctx.fillStyle = '#2A2620'; ctx.fillRect(kx, base - 12, 12, 12);
    ctx.fillStyle = pv.accent;
    if (((i * 5 + (f >> 4)) % 7) !== 0) ctx.fillRect(kx + 2, base - 9, 8, 6);
  }
  // THE ROAD IS PAINTED HERE, not by drawVignette (stage3's preview sets `groundH: 0` for exactly this reason), so
  // that the cart can be drawn ON TOP of it. Everything else on this plaque stops at the road line; the cart has to
  // cross it, because a wheel whose bottom edge is exactly on the line still reads as hovering — a wheel sits IN the
  // road it is standing on, with its bottom couple of pixels swallowed by the surface.
  const road = pv.ground || '#B9AF95';
  ctx.fillStyle = road; ctx.fillRect(x, base, w, y + h - base);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, base, w, 2);
  // A LOADED HANDCART, STANDING IN THE ROAD: a flat load under a tarpaulin with the shaft standing up out of it,
  // and both wheels sunk 3px past the road line. A rounded tarp over a body between two wheels, floating above the
  // line, drew a car in the middle of a Victorian lime works.
  const cx = Math.round(x + 12 + 3 * slot), top = base - 11;
  line(ctx, cx + 1, top + 1, cx - 9, top - 6, '#4A3E2E', 2);          // the shaft, up and out to the left
  ctx.fillStyle = '#4A3E2E'; ctx.fillRect(cx, top, 22, 7);            // the body
  ctx.fillStyle = '#2E2A24'; ctx.fillRect(cx, top + 5, 22, 2);
  ctx.fillStyle = '#B0AE96'; ctx.fillRect(cx + 3, top - 4, 16, 4);    // the load under its tarpaulin
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx + 3, top - 2, 16, 2);
  // the wheels, crossing the road line, with the cart's shadow pooled under the axle
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(cx + 2, base + 1, 19, 2);
  circle(ctx, cx + 5, base + 1, 4, '#2E2A24', null, 0);
  circle(ctx, cx + 17, base + 1, 4, '#2E2A24', null, 0);
  ctx.fillStyle = road; ctx.fillRect(x, base + 5, w, y + h - base - 5);   // the road surface closes over the tyres
}

/** The sealed plate behind a locked board: hatched steel with rivets. */
function drawLockHatch(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#1d1a24'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(120,120,140,0.16)'; ctx.lineWidth = 1;
  for (let i = -h; i < w; i += 8) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
  rivetLine(ctx, x + 6, y + 6, x + w - 6, y + 6, 5, 1.5, '#5a5a66');
  rivetLine(ctx, x + 6, y + h - 6, x + w - 6, y + h - 6, 5, 1.5, '#5a5a66');
  ctx.restore();
}

/**
 * The hatch splitting into two doors that retract off either side, uncovering the vignette already drawn beneath.
 * @param {number} k 0 = shut, 1 = fully open
 */
function drawHatchDoors(ctx, x, y, w, h, k) {
  const half = w / 2, shift = Math.round(k * (half + 2));
  for (const side of [-1, 1]) {
    const dx = side * shift, doorX = side < 0 ? x : x + half;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();          // never spill outside the art window
    ctx.beginPath(); ctx.rect(doorX + dx, y, half, h); ctx.clip(); // this door where it currently sits
    ctx.translate(dx, 0);
    drawLockHatch(ctx, x, y, w, h);
    ctx.restore();
  }
  // hot seam where the doors part, fading as the gap widens
  if (k < 1) {
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.9;
    line(ctx, x + half - shift, y, x + half - shift, y + h, '#ffe45a', 1.5);
    line(ctx, x + half + shift, y, x + half + shift, y + h, '#ffe45a', 1.5);
    ctx.restore();
  }
}

/** A brass padlock. `strain` bows the shackle before it breaks; `open` draws it snapped, `rot`/`alpha` tumble it. */
function drawPadlock(ctx, cx, cy, opts = {}) {
  const { breathe = null, strain = 0, open = false, rot = 0, alpha = 1 } = opts;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  if (breathe != null) { const s = 1 + Math.sin(breathe * 0.04) * 0.02; ctx.scale(s, s); }
  ctx.translate(-cx, -cy);
  ctx.strokeStyle = strain > 0.6 ? '#c8c8d4' : '#8a8a96'; ctx.lineWidth = 3;
  ctx.beginPath();
  if (open) ctx.arc(cx + 5, cy - 7, 7, Math.PI * 1.15, Math.PI * 2.1);  // snapped: the shackle has sprung
  else ctx.arc(cx, cy - 6 - strain, 7, Math.PI, 0);
  ctx.stroke();
  rrect(ctx, cx - 11, cy - 6, 22, 17, 3, '#7a5a26', '#c8964a', 1);
  circle(ctx, cx, cy + 1, 2.5, '#1d1a24', null, 0);
  ctx.fillStyle = '#1d1a24'; ctx.fillRect(cx - 1, cy + 1, 2, 6);
  ctx.restore();
}
