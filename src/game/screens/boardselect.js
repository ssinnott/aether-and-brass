// Board select (title -> BOARD SELECT -> character select): one brass plaque per board in content/stage/index.js,
// each with a hand-drawn vignette of the board, its stage number and name. Boards that have not been opened yet show
// a riveted padlock plate with '? ? ? ? ?' and the board you have to clear to open them; confirming one buzzes and
// shakes the plaque instead of starting. Cleared boards carry a stamped CLEARED plate with the best rank and score.
// Unlock state lives in game/progress.js; `?stage=N` and `?unlockall=1` open boards for the session (see main.js).
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
/** Fallback vignette for a board whose data carries no `preview` block. */
const DEFAULT_PREVIEW = { skyTop: '#0E1424', skyBot: '#3A2E48', ground: '#2B211C', accent: '#FFB038', motif: 'city' };

/** Board select screen. Left/right picks a board, attack/start confirms, dodge returns to the title. */
export class BoardSelectScreen extends Screen {
  constructor(game) { super(game, 'boardselect'); }
  enter(params) {
    super.enter(params);
    this.boards = STAGES.map((stage, i) => ({
      stage, index: i,
      unlocked: progress.isUnlocked(i),
      record: progress.record(stage.id),
      requires: progress.requirementFor(i),
    }));
    // start on the board the options already point at, or the last one that is open (the newest thing to play)
    const wanted = Math.min(this.boards.length - 1, Math.max(0, (this.game.options.stage || 1) - 1));
    this.cursor = this.boards[wanted] && this.boards[wanted].unlocked ? wanted : this.lastUnlocked();
    this.deny = 0; this.confirm = -1; this.leaving = false;
    this.game.audio.music.play('title');
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
  update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio;
    if (this.deny > 0) this.deny--;
    particles.update();
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
      boards: this.boards.map((b) => ({ id: b.stage.id, name: b.stage.name, unlocked: b.unlocked, cleared: !!b.record })),
    };
  }
  draw(ctx) {
    const f = this.frame;
    ctx.fillStyle = '#1c1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.22;
    gear(ctx, 56, 322, 92, 14, '#3a2a48', null, 0, f * 0.004, 30);
    gear(ctx, 604, 34, 72, 12, '#3a2a48', null, 0, -f * 0.005, 24);
    ctx.globalAlpha = 1;
    drawTextOutlined(ctx, 'BOARD SELECT', VIEW_W / 2, 8, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    const open = progress.unlockedCount();
    drawText(ctx, `BOARDS OPEN  ${open} / ${this.boards.length}`, VIEW_W / 2, 30, { size: 1, color: open < this.boards.length ? UI.steel : UI.teal, align: 'center' });
    if (!this.boards.length) { drawText(ctx, 'NO BOARDS REGISTERED', VIEW_W / 2, 170, { size: 1, color: UI.red, align: 'center' }); return; }
    const m = this.metrics;
    for (let i = 0; i < this.boards.length; i++) this.drawCard(ctx, i, this.cardX(i), CARD_Y, m.w, f);
    this.drawFooter(ctx, f);
    particles.draw(ctx, null, 'front');
  }
  /** One board plaque: brass frame, vignette (or padlock plate), stage number, name and clear stamp. */
  drawCard(ctx, i, x, y, w, f) {
    const b = this.boards[i], sel = i === this.cursor;
    // the selected plaque lifts and bobs; a denied confirm shakes it hard for DENY_FRAMES
    const lift = sel ? -3 + Math.round(Math.sin(f * 0.06) * 2) : 0;
    const shake = sel && this.deny > 0 ? Math.round(Math.sin(this.deny * 1.6) * (this.deny / 6)) : 0;
    const flash = this.confirm >= 0 && sel && (this.confirm >> 1) % 2 === 0;
    ctx.save();
    ctx.translate(x + shake, y + lift);
    const locked = !b.unlocked;
    const frame = locked ? '#6a6a72' : (sel ? UI.brassLight : UI.brass);
    rrect(ctx, 0, 0, w, CARD_H, 6, locked ? '#241e26' : '#3a2a18', frame, sel ? 3 : 2);
    rrect(ctx, 4, 4, w - 8, CARD_H - 8, 4, 'rgba(12,8,16,0.88)', locked ? '#3c3a44' : UI.brassDark, 1);
    rivetLine(ctx, 10, 9, w - 10, 9, Math.max(4, Math.round(w / 26)), 1.5, frame);
    rivetLine(ctx, 10, CARD_H - 9, w - 10, CARD_H - 9, Math.max(4, Math.round(w / 26)), 1.5, frame);
    drawText(ctx, `STAGE ${b.stage.number || i + 1}`, w / 2, 14, { size: 1, color: locked ? UI.steel : UI.brassLight, align: 'center' });
    const aw = w - ART_X * 2;
    if (locked) drawLockPlate(ctx, ART_X, ART_Y, aw, ART_H, f);
    else drawVignette(ctx, ART_X, ART_Y, aw, ART_H, b.stage.preview || DEFAULT_PREVIEW, f);
    ctx.strokeStyle = locked ? '#3c3a44' : UI.brassDark; ctx.lineWidth = 1;
    ctx.strokeRect(ART_X + 0.5, ART_Y + 0.5, aw - 1, ART_H - 1);
    // name (wrapped) and, for cleared boards, the stamped record
    const nameY = ART_Y + ART_H + 10;
    if (locked) {
      drawText(ctx, '? ? ? ? ?', w / 2, nameY, { size: 2, color: '#6a6a72', align: 'center' });
      const req = b.requires;
      const note = req ? ['CLEAR', `STAGE ${req.number || b.index}`, 'TO OPEN'] : ['LOCKED'];
      note.forEach((s, k) => drawText(ctx, s, w / 2, nameY + 24 + k * 11, { size: 1, color: UI.steel, align: 'center' }));
    } else {
      const lines = wrapText(b.stage.name, w - 16, 1);
      lines.forEach((s, k) => drawText(ctx, s, w / 2, nameY + k * 11, { size: 1, color: sel ? UI.white : UI.paper, align: 'center' }));
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
    }
    if (flash) { ctx.globalAlpha = 0.35; ctx.fillStyle = UI.white; ctx.fillRect(4, 4, w - 8, CARD_H - 8); ctx.globalAlpha = 1; }
    ctx.restore();
    // selection ring: a turning gear either side of the plaque, red while a locked board is refusing
    if (sel) {
      const c = this.deny > 0 ? UI.red : UI.white, cy = y + lift + CARD_H / 2;
      gear(ctx, x + shake - 11, cy, 7, 8, c, '#3a2010', 1, f * 0.05, 2.5);
      gear(ctx, x + shake + w + 11, cy, 7, 8, c, '#3a2010', 1, -f * 0.05, 2.5);
    }
  }
  /** Subtitle / lock explanation for the highlighted board plus the control legend. */
  drawFooter(ctx, f) {
    const b = this.board;
    if (b) {
      if (b.unlocked) {
        const sub = b.stage.subtitle || '';
        wrapText(sub, VIEW_W - 80, 1).slice(0, 2).forEach((s, k) => drawText(ctx, s, VIEW_W / 2, 250 + k * 12, { size: 1, color: UI.paper, align: 'center' }));
      } else if (b.requires) {
        drawText(ctx, `SEALED - CLEAR ${b.requires.name} TO OPEN THIS BOARD`, VIEW_W / 2, 250, { size: 1, color: this.deny > 0 ? UI.red : UI.steel, align: 'center' });
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

/** The board's vignette: sky ramp, ground band and a motif silhouette drawn from the stage's `preview` block. */
function drawVignette(ctx, x, y, w, h, pv, f) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, pv.skyTop); g.addColorStop(1, pv.skyBot);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  if (pv.motif === 'sky') drawSkyMotif(ctx, x, y, w, h, pv, f);
  else drawCityMotif(ctx, x, y, w, h, pv, f);
  const gh = pv.groundH == null ? 10 : pv.groundH;
  if (gh > 0) {
    ctx.fillStyle = pv.ground; ctx.fillRect(x, y + h - gh, w, gh);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + h - gh, w, 2);
  }
  ctx.restore();
}

/** Board 1: tiered Calderwick terraces under a lit summit, chimney stacks and window dots. */
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
    ctx.fillStyle = 'rgba(220,220,230,0.28)';
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

/** The locked board's plate: hatched steel, rivets and a brass padlock. */
function drawLockPlate(ctx, x, y, w, h, f) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#1d1a24'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(120,120,140,0.16)'; ctx.lineWidth = 1;
  for (let i = -h; i < w; i += 8) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
  rivetLine(ctx, x + 6, y + 6, x + w - 6, y + 6, 5, 1.5, '#5a5a66');
  rivetLine(ctx, x + 6, y + h - 6, x + w - 6, y + h - 6, 5, 1.5, '#5a5a66');
  // padlock: shackle arc over a brass body with a keyhole, breathing very slightly
  const cx = x + w / 2, cy = y + h / 2 + 4, s = 1 + Math.sin(f * 0.04) * 0.02;
  ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  ctx.strokeStyle = '#8a8a96'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy - 6, 7, Math.PI, 0); ctx.stroke();
  rrect(ctx, cx - 11, cy - 6, 22, 17, 3, '#7a5a26', '#c8964a', 1);
  circle(ctx, cx, cy + 1, 2.5, '#1d1a24', null, 0);
  ctx.fillStyle = '#1d1a24'; ctx.fillRect(cx - 1, cy + 1, 2, 6);
  ctx.restore();
}
