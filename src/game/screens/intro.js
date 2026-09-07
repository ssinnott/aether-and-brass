// Stage intro card (GDD 6 intro text, ARCHITECTURE 9): black card, brass frame, city silhouette, skip on attack, ~150 frames.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, rivetLine } from '../../art/shapes.js';
import { particles } from '../../engine/particles.js';
import { stage1 } from '../../content/stage/stage1.js';

const INTRO_FRAMES = 150;
const TOWERS = [[40, 200, 50], [100, 170, 40], [150, 220, 70], [230, 150, 36], [280, 190, 60], [350, 140, 44], [410, 200, 40], [460, 160, 70], [540, 210, 50], [590, 180, 40]];

/** Stage name card. Attack/start skips; auto-advances after INTRO_FRAMES. */
export class IntroScreen extends Screen {
  constructor(game) { super(game, 'intro'); }
  enter(params) {
    super.enter(params);
    this.chars = params.chars || this.game.options.chars;
    this.stage = params.stage || stage1;
    this.stageName = params.stageName || this.stage.name;
    this.subtitle = (params.subtitle || this.stage.subtitle || '').split('. ').map((t) => t.replace(/\.$/, ''));
    this.done = false;
    particles.clear();
    this.game.audio.music.stop();
  }
  update() {
    super.update();
    const inp = this.game.input;
    if (this.frame % 6 === 0) particles.spawn('steam', 120 + (this.frame * 53) % 400, 200, 0, { screen: true, vx: 0.2, vy: -0.5, size: 3, life: 60 });
    particles.update();
    if (this.done) return;
    let skip = this.frame >= INTRO_FRAMES || this.game.options.bot;
    for (let p = 0; p < 2 && !skip; p++) if (this.frame > 10 && (inp.pressed(p, 'attack') || inp.pressed(p, 'start'))) skip = true;
    if (skip) { this.done = true; this.game.fadeTo(() => this.game.replace('gameplay', { chars: this.chars, stage: this.stage }), 0.08); }
  }
  draw(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#141A2C';
    for (const [x, top, w] of TOWERS) { ctx.fillRect(x, top, w, VIEW_H - top); ctx.fillRect(x + 4, top - 6, w - 8, 6); }
    ctx.fillStyle = '#4DF0E0'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.frame * 0.08); ctx.fillRect(315, 120, 10, 6); ctx.globalAlpha = 1;
    particles.draw(ctx, null, 'front');
    rrect(ctx, 24, 24, VIEW_W - 48, VIEW_H - 48, 6, null, UI.brass, 2);
    rivetLine(ctx, 34, 32, VIEW_W - 34, 32, 24, 2, UI.brass);
    rivetLine(ctx, 34, VIEW_H - 32, VIEW_W - 34, VIEW_H - 32, 24, 2, UI.brass);
    const fade = Math.min(1, this.frame / 30);
    ctx.globalAlpha = fade;
    this.subtitle.forEach((t, i) => drawText(ctx, t + '.', VIEW_W / 2, 60 + i * 14, { size: 1, color: UI.paper, align: 'center' }));
    drawText(ctx, 'FOUR UNLIKELY DELIVERIES ARE ABOUT TO BE MADE, UPWARD.', VIEW_W / 2, 96, { size: 1, color: UI.steel, align: 'center' });
    ctx.globalAlpha = Math.min(1, Math.max(0, (this.frame - 30) / 30));
    drawTextOutlined(ctx, 'STAGE 1', VIEW_W / 2, 250, { size: 2, color: UI.copper, outline: '#3a2010', align: 'center' });
    drawTextOutlined(ctx, this.stageName, VIEW_W / 2, 272, { size: 2, color: UI.brass, outline: '#3a2010', align: 'center' });
    ctx.globalAlpha = 1;
    const chars = this.game.characters;
    (this.chars || []).slice(0, 2).forEach((ci, i) => { const c = chars[ci]; if (c) drawText(ctx, `P${i + 1} ${c.name} READY`, i === 0 ? 40 : VIEW_W - 40, VIEW_H - 50, { size: 1, color: i === 0 ? UI.p1 : UI.p2, align: i === 0 ? 'left' : 'right' }); });
    if ((this.frame % 40) < 28) drawText(ctx, 'PRESS ATTACK', VIEW_W / 2, VIEW_H - 50, { size: 1, color: UI.brassDark, align: 'center' });
  }
}
