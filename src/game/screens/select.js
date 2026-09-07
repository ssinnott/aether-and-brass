// Character select (stub layout; the game-core engineer fills in stats/portraits). P2 joins with any P2 key.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { buildRig, drawRig } from '../../art/rig.js';
import { AnimPlayer } from '../animation.js';
import { rrect, gear } from '../../art/shapes.js';
import { drawShadowScreen } from '../../art/fx.js';
import { ENV } from '../../art/palettes.js';

/** Character select screen. */
export class SelectScreen extends Screen {
  constructor(game) { super(game, 'select'); }
  enter(params) {
    super.enter(params);
    this.chars = this.game.characters;
    this.slots = this.chars.map((c) => {
      const anim = new AnimPlayer(c.anims || {});
      anim.play('idle');
      return { rig: buildRig(c.build || {}), anim, def: c };
    });
    this.p = [
      { joined: true, cursor: 0, confirmed: false },
      { joined: false, cursor: Math.min(1, Math.max(0, this.chars.length - 1)), confirmed: false },
    ];
    this.starting = false;
  }
  update() {
    super.update();
    const inp = this.game.input, n = this.chars.length;
    if (!n || this.starting) return;
    for (let i = 0; i < 2; i++) {
      const ps = this.p[i];
      if (!ps.joined) {
        if (inp.anyPressedBy(i)) { ps.joined = true; this.game.audio.play('menu_confirm'); }
        continue;
      }
      if (ps.confirmed) {
        if (inp.pressed(i, 'dodge')) { ps.confirmed = false; this.game.audio.play('menu_back'); }
        continue;
      }
      if (inp.pressed(i, 'left')) { ps.cursor = (ps.cursor + n - 1) % n; this.game.audio.play('menu_move'); }
      if (inp.pressed(i, 'right')) { ps.cursor = (ps.cursor + 1) % n; this.game.audio.play('menu_move'); }
      if (inp.pressed(i, 'attack') || inp.pressed(i, 'start')) {
        ps.confirmed = true; this.game.audio.play('menu_confirm');
        this.slots[ps.cursor].anim.play('win', { restart: true });
      } else if (inp.pressed(i, 'dodge') && i === 0) {
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
    for (const s of this.slots) s.anim.tick();
  }
  draw(ctx) {
    ctx.fillStyle = '#1c1420'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.25; gear(ctx, 60, 300, 90, 14, '#3a2a48', null, 0, this.frame * 0.004, 30); gear(ctx, 600, 40, 70, 12, '#3a2a48', null, 0, -this.frame * 0.005, 24); ctx.globalAlpha = 1;
    drawTextOutlined(ctx, 'CHOOSE YOUR FIGHTER', 320, 16, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    const n = this.slots.length;
    if (!n) { drawText(ctx, 'NO CHARACTERS REGISTERED', 320, 170, { size: 1, color: UI.red, align: 'center' }); return; }
    const boxW = Math.min(140, Math.floor((VIEW_W - 40) / n)), boxH = 190, gap = 8;
    const totalW = n * boxW + (n - 1) * gap, x0 = Math.round((VIEW_W - totalW) / 2), y0 = 56;
    for (let i = 0; i < n; i++) {
      const s = this.slots[i], x = x0 + i * (boxW + gap);
      const sel1 = this.p[0].cursor === i && this.p[0].joined, sel2 = this.p[1].cursor === i && this.p[1].joined;
      rrect(ctx, x, y0, boxW, boxH, 6, sel1 || sel2 ? '#2e2436' : '#241a2a', sel1 ? UI.p1 : sel2 ? UI.p2 : ENV.brassDark, 1);
      if (sel1 && sel2) rrect(ctx, x + 2, y0 + 2, boxW - 4, boxH - 4, 5, null, UI.p2, 1);
      ctx.fillStyle = '#3a3040'; ctx.fillRect(x + 8, y0 + boxH - 40, boxW - 16, 3);
      drawShadowScreen(ctx, x + boxW / 2, y0 + boxH - 39, 34 * s.rig.scale, 0.5);
      drawRig(ctx, s.rig, s.anim.pose, { x: x + boxW / 2, y: y0 + boxH - 40, facing: 1 });
      drawText(ctx, s.def.name || s.def.id, x + boxW / 2, y0 + boxH - 26, { size: 1, color: UI.paper, align: 'center' });
      if (sel1) drawText(ctx, this.p[0].confirmed ? 'P1 READY' : 'P1', x + boxW / 2, y0 + 6, { size: 1, color: UI.p1, align: 'center' });
      if (sel2) drawText(ctx, this.p[1].confirmed ? 'P2 READY' : 'P2', x + boxW / 2, y0 + (sel1 ? 16 : 6), { size: 1, color: UI.p2, align: 'center' });
    }
    if (!this.p[1].joined && (this.frame % 60) < 40) drawText(ctx, 'P2: PRESS ANY KEY TO JOIN', 320, 268, { size: 1, color: UI.p2, align: 'center' });
    drawText(ctx, 'LEFT/RIGHT: CHOOSE   ATTACK: CONFIRM   DODGE: BACK', 320, 300, { size: 1, color: UI.steel, align: 'center' });
  }
}
