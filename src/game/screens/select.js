// Character select (ARCHITECTURE.md section 9, GDD 9): 4 portrait cards with stat pips, per-player cursor, P2 drop-in.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { buildRig, drawRig } from '../../art/rig.js';
import { AnimPlayer } from '../animation.js';
import { rrect, gear, rivetLine } from '../../art/shapes.js';
import { drawShadowScreen } from '../../art/fx.js';
import { ENV } from '../../art/palettes.js';

const STATS = ['power', 'speed', 'health', 'range', 'technique'];
const STAT_LABELS = { power: 'POW', speed: 'SPD', health: 'HP', range: 'RNG', technique: 'TEC' };

/** Character select screen. Left/right moves the cursor, attack confirms, dodge cancels/backs out. */
export class SelectScreen extends Screen {
  constructor(game) { super(game, 'select'); }
  enter(params) {
    super.enter(params);
    this.chars = this.game.characters;
    this.slots = this.chars.map((c) => {
      const anim = new AnimPlayer(c.anims || {});
      anim.play('idle');
      return { rig: buildRig(c.build || {}), anim, def: c, hover: 0 };
    });
    this.p = [
      { joined: true, cursor: 0, confirmed: false },
      { joined: this.game.input.joined(1), cursor: Math.min(1, Math.max(0, this.chars.length - 1)), confirmed: false },
    ];
    this.starting = false;
    this.game.audio.music.play('title');
  }
  update() {
    super.update();
    const inp = this.game.input, n = this.chars.length;
    if (!n || this.starting) return;
    for (let i = 0; i < 2; i++) {
      const ps = this.p[i];
      if (!ps.joined) {
        if (inp.joinPressed(i)) { ps.joined = true; inp.setJoined(i, true); this.game.audio.play('join'); }
        continue;
      }
      if (ps.confirmed) {
        if (inp.pressed(i, 'dodge') || inp.pressed(i, 'jump')) { ps.confirmed = false; this.game.audio.play('menu_back'); this.slots[ps.cursor].anim.play('idle', { restart: true }); }
        continue;
      }
      let moved = false;
      if (inp.pressed(i, 'left')) { ps.cursor = (ps.cursor + n - 1) % n; moved = true; }
      if (inp.pressed(i, 'right')) { ps.cursor = (ps.cursor + 1) % n; moved = true; }
      if (moved) { this.game.audio.play('menu_move'); this.slots[ps.cursor].anim.play('taunt', { restart: true, fallback: 'idle' }); }
      if (inp.pressed(i, 'attack') || inp.pressed(i, 'start')) {
        ps.confirmed = true; this.game.audio.play('menu_confirm');
        this.slots[ps.cursor].anim.play('win', { restart: true });
      } else if ((inp.pressed(i, 'dodge') || inp.pressed(i, 'jump')) && i === 0) {
        this.game.audio.play('menu_back');
        this.game.fadeTo(() => this.game.replace('title'), 0.08);
        return;
      }
    }
    const allReady = this.p.every((ps) => !ps.joined || ps.confirmed);
    if (allReady && this.p[0].confirmed) {
      this.starting = true;
      const chars = this.p.filter((ps) => ps.joined).map((ps) => ps.cursor);
      this.game.options.chars = chars;
      const next = this.game.factories.intro ? 'intro' : 'gameplay';
      this.game.fadeTo(() => this.game.replace(next, { chars }), 0.1);
    }
    for (const s of this.slots) { s.anim.tick(); if (s.anim.done && s.anim.name !== 'win') s.anim.play('idle', { restart: true }); }
  }
  draw(ctx) {
    const f = this.frame;
    ctx.fillStyle = '#1c1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.25; gear(ctx, 60, 300, 90, 14, '#3a2a48', null, 0, f * 0.004, 30); gear(ctx, 600, 40, 70, 12, '#3a2a48', null, 0, -f * 0.005, 24); ctx.globalAlpha = 1;
    drawTextOutlined(ctx, 'CHOOSE YOUR FIGHTER', 320, 12, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    const n = this.slots.length;
    if (!n) { drawText(ctx, 'NO CHARACTERS REGISTERED', 320, 170, { size: 1, color: UI.red, align: 'center' }); return; }
    const boxW = Math.min(148, Math.floor((VIEW_W - 40) / n)), boxH = 236, gap = 8;
    const totalW = n * boxW + (n - 1) * gap, x0 = Math.round((VIEW_W - totalW) / 2), y0 = 40;
    for (let i = 0; i < n; i++) {
      const s = this.slots[i], d = s.def, x = x0 + i * (boxW + gap);
      const sel1 = this.p[0].cursor === i && this.p[0].joined, sel2 = this.p[1].cursor === i && this.p[1].joined;
      rrect(ctx, x, y0, boxW, boxH, 6, sel1 || sel2 ? '#2e2436' : '#241a2a', sel1 ? UI.p1 : sel2 ? UI.p2 : ENV.brassDark, sel1 || sel2 ? 2 : 1);
      if (sel1 && sel2) rrect(ctx, x + 3, y0 + 3, boxW - 6, boxH - 6, 5, null, UI.p2, 1);
      rivetLine(ctx, x + 8, y0 + 6, x + boxW - 8, y0 + 6, 6, 1.5, ENV.brass);
      // rig bust area
      const floorY = y0 + 128;
      ctx.fillStyle = '#3a3040'; ctx.fillRect(x + 10, floorY, boxW - 20, 2);
      const fit = Math.min(1.2, 92 / ((s.rig.height + 10) * s.rig.scale));
      drawShadowScreen(ctx, x + boxW / 2, floorY + 1, 34 * s.rig.scale * fit, 0.5);
      drawRig(ctx, s.rig, s.anim.pose, { x: x + boxW / 2, y: floorY, facing: 1, scale: fit });
      if (sel1 || sel2) { ctx.strokeStyle = sel1 ? UI.p1 : UI.p2; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + boxW / 2, floorY - 40, 46 + Math.sin(f * 0.1) * 2, 0, Math.PI * 2); ctx.stroke(); }
      drawTextOutlined(ctx, d.name || d.id, x + boxW / 2, floorY + 8, { size: 2, color: UI.paper, outline: '#2a1410', align: 'center' });
      drawText(ctx, d.archetype || '', x + boxW / 2, floorY + 28, { size: 1, color: UI.brass, align: 'center' });
      // stat pips
      const st = d.stats || {};
      STATS.forEach((k, r) => {
        const yy = floorY + 42 + r * 11;
        drawText(ctx, STAT_LABELS[k], x + 10, yy, { size: 1, color: UI.steel });
        for (let p = 0; p < 5; p++) { ctx.fillStyle = p < (st[k] || 0) ? (sel1 ? UI.p1 : sel2 ? UI.p2 : UI.brass) : '#3a3040'; ctx.fillRect(x + 42 + p * 12, yy, 9, 6); }
      });
      if (sel1) drawText(ctx, this.p[0].confirmed ? 'P1 READY' : 'P1', x + boxW / 2, y0 + 12, { size: 1, color: UI.p1, align: 'center' });
      if (sel2) drawText(ctx, this.p[1].confirmed ? 'P2 READY' : 'P2', x + boxW / 2, y0 + (sel1 ? 22 : 12), { size: 1, color: UI.p2, align: 'center' });
    }
    const hov = this.chars[this.p[0].cursor];
    if (hov && hov.title) drawText(ctx, `${hov.fullName ? hov.fullName.toUpperCase() : hov.name} - ${hov.title}`, 320, 286, { size: 1, color: UI.paper, align: 'center' });
    if (!this.p[1].joined && (f % 60) < 40) drawText(ctx, 'P2: PRESS J/K/U/L/O/I OR BACKSPACE TO JOIN', 320, 312, { size: 1, color: UI.p2, align: 'center' });
    drawText(ctx, 'LEFT/RIGHT: CHOOSE   ATTACK: CONFIRM   DODGE: BACK', 320, 336, { size: 1, color: UI.steel, align: 'center' });
  }
}
