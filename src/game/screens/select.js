// Character select (GDD 8/9): four 140x200 brass-framed cards with 2.5x rig busts, name, archetype, five 5-pip stat bars,
// hovered card plays its taunt, P1 cursor = white gear ring, P2 = cyan, attack locks / jump unlocks, both may pick the
// same hero (second copy tinted), READY state, then the stage intro. P2 drop-in on any P2 key.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined, measureText } from '../../engine/text.js';
import { buildRig } from '../../art/rig.js';
import { AnimPlayer } from '../animation.js';
import { rrect, gear, rivetLine } from '../../art/shapes.js';
import { drawBust, drawCursorRing, idlePoseOf } from '../../art/portraits.js';
import { ENV } from '../../art/palettes.js';

const STATS = ['power', 'speed', 'health', 'range', 'technique'];
const STAT_LABELS = { power: 'POW', speed: 'SPD', health: 'HP', range: 'RNG', technique: 'TEC' };
const CARD_W = 140, CARD_H = 200, GAP = 12, CARD_Y = 34, BUST_H = 96, BUST_SCALE = 2.5;
const READY_FRAMES = 24;
const P2_CURSOR = '#4DF0E0';

/** Character select screen. Left/right moves the cursor, attack locks, jump/dodge unlocks (P1 dodge backs out). */
export class SelectScreen extends Screen {
  constructor(game) { super(game, 'select'); }
  enter(params) {
    super.enter(params);
    this.chars = this.game.characters;
    this.slots = this.chars.map((c) => {
      const anim = new AnimPlayer(c.anims || {});
      anim.play('idle');
      return { rig: buildRig(c.build || {}), anim, def: c, idle: idlePoseOf(c) };
    });
    this.p = [
      { joined: true, cursor: 0, confirmed: false },
      { joined: this.game.input.joined(1), cursor: Math.min(1, Math.max(0, this.chars.length - 1)), confirmed: false },
    ];
    this.starting = false; this.readyTimer = -1;
    this.game.audio.music.play('title');
    if (this.slots[0]) this.slots[0].anim.play('taunt', { restart: true, fallback: 'idle' });
  }
  update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio, n = this.chars.length;
    for (const s of this.slots) { s.anim.tick(); if (s.anim.done && s.anim.name !== 'win') s.anim.play('idle', { restart: true }); }
    if (!n || this.starting) return;
    if (this.readyTimer >= 0) {
      if (++this.readyTimer >= READY_FRAMES) {
        this.starting = true;
        const chars = this.p.filter((ps) => ps.joined).map((ps) => ps.cursor);
        this.game.options.chars = chars;
        const next = this.game.factories.intro ? 'intro' : 'gameplay';
        this.game.fadeTo(() => this.game.replace(next, { chars }), 0.1);
      }
      return;
    }
    for (let i = 0; i < 2; i++) {
      const ps = this.p[i];
      if (!ps.joined) {
        if (inp.joinPressed(i)) { ps.joined = true; inp.setJoined(i, true); audio.play('join'); this.slots[ps.cursor].anim.play('taunt', { restart: true, fallback: 'idle' }); }
        continue;
      }
      if (ps.confirmed) {
        if (inp.pressed(i, 'dodge') || inp.pressed(i, 'jump')) { ps.confirmed = false; audio.play('menu_back'); this.slots[ps.cursor].anim.play('idle', { restart: true }); }
        continue;
      }
      let moved = false;
      if (inp.pressed(i, 'left')) { ps.cursor = (ps.cursor + n - 1) % n; moved = true; }
      if (inp.pressed(i, 'right')) { ps.cursor = (ps.cursor + 1) % n; moved = true; }
      if (moved) { audio.play('menu_move'); this.slots[ps.cursor].anim.play('taunt', { restart: true, fallback: 'idle' }); }
      if (inp.pressed(i, 'attack') || inp.pressed(i, 'start')) {
        ps.confirmed = true; audio.play('menu_confirm');
        this.slots[ps.cursor].anim.play('win', { restart: true });
      } else if (inp.pressed(i, 'dodge') && i === 0) {
        audio.play('menu_back');
        this.starting = true;
        // back out to wherever the board was chosen, so P1 can change board without restarting from the title
        const back = this.game.factories.boardselect ? 'boardselect' : 'title';
        this.game.fadeTo(() => this.game.replace(back), 0.08);
        return;
      }
    }
    const allReady = this.p.every((ps) => !ps.joined || ps.confirmed);
    if (allReady && this.p[0].confirmed) { this.readyTimer = 0; audio.play('rank_stamp'); }
  }
  draw(ctx) {
    const f = this.frame;
    ctx.fillStyle = '#1c1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.22; gear(ctx, 60, 320, 90, 14, '#3a2a48', null, 0, f * 0.004, 30); gear(ctx, 600, 30, 70, 12, '#3a2a48', null, 0, -f * 0.005, 24); ctx.globalAlpha = 1;
    drawTextOutlined(ctx, 'CHOOSE YOUR FIGHTER', 320, 8, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    const n = this.slots.length;
    if (!n) { drawText(ctx, 'NO CHARACTERS REGISTERED', 320, 170, { size: 1, color: UI.red, align: 'center' }); return; }
    const totalW = n * CARD_W + (n - 1) * GAP, x0 = Math.round((VIEW_W - totalW) / 2);
    for (let i = 0; i < n; i++) this.drawCard(ctx, i, x0 + i * (CARD_W + GAP), CARD_Y, f);
    const hov = this.chars[this.p[0].cursor];
    if (hov && hov.title) drawText(ctx, `${hov.fullName ? hov.fullName.toUpperCase() : hov.name} - ${hov.title}`, 320, 248, { size: 1, color: UI.paper, align: 'center' });
    if (this.p[1].joined) { const h2 = this.chars[this.p[1].cursor]; if (h2 && h2.title) drawText(ctx, `P2: ${h2.fullName ? h2.fullName.toUpperCase() : h2.name} - ${h2.title}`, 320, 262, { size: 1, color: P2_CURSOR, align: 'center' }); }
    else if ((f % 60) < 40) drawText(ctx, 'P2: PRESS J/K/U/L/O/I OR BACKSPACE TO JOIN', 320, 262, { size: 1, color: UI.p2, align: 'center' });
    if (this.p[0].cursor === this.p[1].cursor && this.p[1].joined) drawText(ctx, 'SAME HERO: P2 WEARS A DARKER TINT', 320, 276, { size: 1, color: UI.steel, align: 'center' });
    if (this.readyTimer >= 0) {
      const k = Math.min(1, this.readyTimer / 6), sc = 5 - Math.round(2 * k), ty = 150 - sc * 3;
      const pw = measureText('READY!', sc) + 48, ph = sc * 7 + 20;
      rrect(ctx, 320 - pw / 2, ty - 10, pw, ph, 6, 'rgba(10,6,14,0.9)', UI.brass, 2);
      drawTextOutlined(ctx, 'READY!', 320, ty, { size: sc, color: UI.brassLight, outline: '#3a2010', thickness: 2, align: 'center' });
    }
    drawText(ctx, 'LEFT/RIGHT: CHOOSE   ATTACK: LOCK   JUMP: UNLOCK   DODGE: BACK', 320, 336, { size: 1, color: UI.steel, align: 'center' });
  }
  drawCard(ctx, i, x, y, f) {
    const s = this.slots[i], d = s.def, p1 = this.p[0], p2 = this.p[1];
    const sel1 = p1.cursor === i && p1.joined, sel2 = p2.cursor === i && p2.joined, sel = sel1 || sel2;
    const frameCol = sel1 && sel2 ? UI.brassLight : sel1 ? UI.white : sel2 ? P2_CURSOR : ENV.brassDark;
    rrect(ctx, x, y, CARD_W, CARD_H, 6, sel ? '#2e2436' : '#241a2a', UI.brass, 2);
    if (sel) rrect(ctx, x + 3, y + 3, CARD_W - 6, CARD_H - 6, 4, null, frameCol, 1);
    // bust window (2.5x rig, head near the top) with a subtle backdrop gear
    const bx = x + 6, by = y + 6, bw = CARD_W - 12;
    ctx.fillStyle = '#1a1226'; ctx.fillRect(bx, by, bw, BUST_H);
    ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, BUST_H); ctx.clip();
    ctx.globalAlpha = 0.3; gear(ctx, bx + bw / 2, by + BUST_H / 2 + 20, 60, 12, '#3a2a48', null, 0, f * 0.004 + i, 20); ctx.globalAlpha = 1;
    ctx.restore();
    const tint = sel2 && !sel1 ? null : sel1 && sel2 ? '#1a2a5a' : null;
    drawBust(ctx, s.rig, s.anim.pose, s.idle, bx, by, bw, BUST_H, BUST_SCALE, { facing: 1, margin: 20, tint, tintAlpha: 0.3 });
    rrect(ctx, bx, by, bw, BUST_H, 2, null, '#120c14', 1);
    rivetLine(ctx, x + 10, y + 5, x + CARD_W - 10, y + 5, 6, 1.5, UI.brass);
    rivetLine(ctx, x + 10, y + CARD_H - 5, x + CARD_W - 10, y + CARD_H - 5, 6, 1.5, UI.brass);
    // name / archetype / stat pips
    drawTextOutlined(ctx, d.name || d.id, x + CARD_W / 2, y + 108, { size: 2, color: UI.paper, outline: '#2a1410', align: 'center' });
    drawText(ctx, d.archetype || '', x + CARD_W / 2, y + 126, { size: 1, color: UI.brass, align: 'center' });
    const st = d.stats || {}, pipCol = sel1 && sel2 ? UI.brassLight : sel1 ? UI.white : sel2 ? P2_CURSOR : UI.brass;
    STATS.forEach((k, r) => {
      const yy = y + 140 + r * 11;
      drawText(ctx, STAT_LABELS[k], x + 10, yy, { size: 1, color: UI.steel });
      for (let p = 0; p < 5; p++) {
        const on = p < (st[k] || 0);
        rrect(ctx, x + 40 + p * 18, yy - 1, 14, 8, 1, on ? pipCol : '#332a3a', '#120c14', 0.5);
        if (on) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 41 + p * 18, yy, 12, 1); }
      }
    });
    // cursors: rotating gear rings in the top corners; READY stamp when locked
    if (sel1) drawCursorRing(ctx, x + 16, y + 18, 13, UI.white, f * 0.04, '1', drawText);
    if (sel2) drawCursorRing(ctx, x + CARD_W - 16, y + 18, 13, P2_CURSOR, -f * 0.04, '2', drawText);
    if ((sel1 && p1.confirmed) || (sel2 && p2.confirmed)) {
      const who = sel1 && p1.confirmed && sel2 && p2.confirmed ? 'P1+P2 READY' : sel1 && p1.confirmed ? 'P1 READY' : 'P2 READY';
      rrect(ctx, x + 20, y + 80, CARD_W - 40, 14, 3, 'rgba(10,6,14,0.85)', sel1 && p1.confirmed ? UI.white : P2_CURSOR, 1);
      drawText(ctx, who, x + CARD_W / 2, y + 83, { size: 1, color: UI.brassLight, align: 'center' });
    }
  }
}
