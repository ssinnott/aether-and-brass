// Title screen: animated steampunk backdrop, logo, blinking PRESS ATTACK (ARCHITECTURE.md section 9).
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { particles } from '../../engine/particles.js';
import { gear, rrect, pathPoly, paint, rivetLine, pipe } from '../../art/shapes.js';
import { ENV } from '../../art/palettes.js';

const TOWERS = [[0, 150, 40], [55, 120, 30], [95, 170, 50], [160, 135, 26], [200, 110, 60], [275, 160, 34], [320, 125, 44], [380, 145, 28], [420, 100, 70], [500, 150, 40], [560, 120, 36], [610, 160, 50]];
const STACKS = [[118, 168], [222, 108], [430, 98], [575, 118]];

/** Title screen. Attack/start (either player) -> select. */
export class TitleScreen extends Screen {
  constructor(game) { super(game, 'title'); }
  enter(params) {
    super.enter(params);
    this.game.audio.music.play('title');
    particles.clear();
  }
  update() {
    super.update();
    const inp = this.game.input;
    for (const s of STACKS) if (this.frame % 9 === 0) particles.spawn('steam', s[0] + 4, s[1] - 6, 0, { screen: true, vx: 0.25, vy: -0.7, size: 3, life: 55 });
    if (this.frame % 4 === 0) particles.spawn('ember', 60 + (this.frame * 37) % 520, 330, 0, { screen: true, vx: 0.2, vy: -0.6, size: 1, life: 70 });
    particles.update();
    if (this.frame < 10) return;
    for (let p = 0; p < 2; p++) {
      if (inp.pressed(p, 'attack') || inp.pressed(p, 'start') || inp.pressed(p, 'jump')) {
        this.game.audio.play('menu_confirm');
        this.game.fadeTo(() => this.game.replace('select'), 0.08);
        return;
      }
    }
  }
  draw(ctx) {
    const f = this.frame;
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, ENV.skyTop); g.addColorStop(0.55, ENV.skyMid); g.addColorStop(1, ENV.skyHorizon);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // moon + big background gear
    ctx.fillStyle = '#f4e8c8'; ctx.beginPath(); ctx.arc(520, 70, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.arc(512, 64, 6, 0, Math.PI * 2); ctx.arc(530, 80, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.35;
    gear(ctx, 320, 150, 120, 16, '#2a1c30', null, 0, f * 0.003, 40, '#3a2a48');
    gear(ctx, 110, 250, 70, 12, '#2a1c30', null, 0, -f * 0.006, 22, '#3a2a48');
    gear(ctx, 560, 230, 50, 10, '#2a1c30', null, 0, f * 0.009, 16, '#3a2a48');
    ctx.globalAlpha = 1;
    // city silhouette
    ctx.fillStyle = '#1a1220';
    for (const [x, top, w] of TOWERS) { ctx.fillRect(x, top, w, VIEW_H - top); ctx.fillRect(x + 4, top - 8, w - 8, 8); }
    for (const [x, y] of STACKS) ctx.fillRect(x, y, 8, 40);
    ctx.fillStyle = '#ffd070';
    for (let i = 0; i < TOWERS.length; i++) { const [x, top, w] = TOWERS[i]; for (let k = 0; k < 3; k++) if (((i * 7 + k * 13 + (f >> 5)) % 5) !== 0) ctx.fillRect(x + 6 + k * Math.max(4, (w - 12) / 3), top + 14, 3, 4); }
    particles.draw(ctx, null, 'front');
    // foreground brass pipes + floor plate
    ctx.fillStyle = '#2c2030'; ctx.fillRect(0, 300, VIEW_W, 60);
    pipe(ctx, -10, 312, 650, 312, 14, ENV.copper, 'rgba(0,0,0,0.5)', 'rgba(255,255,255,0.2)', false);
    pipe(ctx, 90, 300, 90, 370, 10, ENV.brass, 'rgba(0,0,0,0.5)', 'rgba(255,255,255,0.2)', true);
    pipe(ctx, 540, 300, 540, 370, 10, ENV.brass, 'rgba(0,0,0,0.5)', 'rgba(255,255,255,0.2)', true);
    rivetLine(ctx, 8, 340, 632, 340, 20, 2, ENV.brass);
    gear(ctx, 40, 330, 26, 10, ENV.brass, '#1a1018', 1, f * 0.02, 8);
    gear(ctx, 600, 330, 22, 8, ENV.copper, '#1a1018', 1, -f * 0.025, 7);
    // logo plate
    const bob = Math.round(Math.sin(f * 0.05) * 2);
    rrect(ctx, 150, 62 + bob, 340, 122, 10, 'rgba(20,12,24,0.75)', ENV.brass, 2);
    rivetLine(ctx, 160, 72 + bob, 480, 72 + bob, 9, 2, ENV.brass);
    rivetLine(ctx, 160, 174 + bob, 480, 174 + bob, 9, 2, ENV.brass);
    drawTextOutlined(ctx, 'AETHER', 320, 82 + bob, { size: 5, color: UI.brass, outline: '#3a2010', thickness: 2, align: 'center' });
    drawTextOutlined(ctx, '&', 320, 122 + bob, { size: 3, color: UI.copper, outline: '#3a2010', thickness: 1, align: 'center' });
    drawTextOutlined(ctx, 'BRASS', 320, 140 + bob, { size: 5, color: UI.brassLight, outline: '#3a2010', thickness: 2, align: 'center' });
    pathPoly(ctx, [200, 118 + bob, 300, 118 + bob, 300, 121 + bob, 200, 121 + bob]); paint(ctx, UI.brass, null, 0);
    pathPoly(ctx, [340, 118 + bob, 440, 118 + bob, 440, 121 + bob, 340, 121 + bob]); paint(ctx, UI.brass, null, 0);
    drawText(ctx, 'A STEAMPUNK BEAT-EM-UP', 320, 196, { size: 1, color: UI.paper, align: 'center' });
    if ((f % 60) < 40) drawTextOutlined(ctx, 'PRESS ATTACK', 320, 228, { size: 2, color: '#ffffff', outline: '#3a2010', thickness: 1, align: 'center' });
    drawText(ctx, 'P1: WASD + F/G/H/R/T   P2: ARROWS + K/L/;/O/P   ENTER: START', 320, 264, { size: 1, color: UI.steel, align: 'center' });
    drawText(ctx, '2026 AETHER WORKS', 320, 346, { size: 1, color: UI.brassDark, align: 'center', shadow: false });
  }
}
