// Stage intro card (GDD 6 + 9): black card with a brass frame, tiered-city silhouette with rising steam, the stage's
// text lines fading in one after another, STAGE N / stage name, both hero portraits with "P1 / P2 READY". Skippable.
// The lines and the number come from the stage data (`introLines`, `number`), so every board gets its own card.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { rrect, rivetLine } from '../../art/shapes.js';
import { particles } from '../../engine/particles.js';
import { buildRig } from '../../art/rig.js';
import { drawHeadPortrait, drawPortraitFrame, idlePoseOf } from '../../art/portraits.js';
import { getStage, stageIndex } from '../../content/stage/index.js';

const INTRO_FRAMES = 300;
/** Stage 1's card text (GDD section 6); other boards carry their own `introLines`. */
const LINES = ['CALDERWICK, CITY OF THE HEART-ENGINE.', 'THE CHANCELLOR HAS SEALED THE SKY.', 'FOUR UNLIKELY DELIVERIES ARE ABOUT TO BE MADE, UPWARD.'];
const LINE_AT = [12, 48, 84], STAGE_AT = 126, FADE = 24;
const FAR = [[0, 214, 50], [56, 196, 36], [98, 224, 70], [176, 184, 30], [212, 204, 56], [276, 190, 40], [322, 214, 34], [362, 176, 60], [428, 206, 44], [478, 190, 36], [520, 216, 60], [586, 198, 54]];
const NEAR = [[0, 250, 80], [90, 238, 50], [150, 258, 90], [250, 244, 60], [320, 262, 70], [400, 240, 50], [460, 256, 90], [560, 246, 80]];
const STACKS = [[110, 224], [232, 204], [376, 176], [540, 216]];

/** Stage name card. Attack/start skips; auto-advances after INTRO_FRAMES. */
export class IntroScreen extends Screen {
  constructor(game) { super(game, 'intro'); }
  enter(params) {
    super.enter(params);
    this.chars = params.chars || this.game.options.chars;
    this.stage = params.stage || getStage(this.game.options.stage);
    this.stageName = params.stageName || this.stage.name;
    this.lines = this.stage.introLines || LINES;
    this.stageLabel = `STAGE ${this.stage.number || stageIndex(this.stage) + 1}`;
    this.done = false;
    this.portraits = (this.chars || []).slice(0, 2).map((ci) => { const c = this.game.characters[ci]; return c ? { def: c, rig: buildRig(c.build || {}), pose: idlePoseOf(c) } : null; });
    particles.clear();
    this.game.audio.music.stop();
  }
  update() {
    super.update();
    const inp = this.game.input;
    if (this.frame % 5 === 0) { const s = STACKS[(this.frame / 5) % STACKS.length | 0]; particles.spawn('steam', s[0] + 4, s[1] - 4, 0, { screen: true, vx: 0.15, vy: -0.55, size: 3, life: 70 }); }
    if (this.frame % 7 === 0) particles.spawn('steam', 60 + (this.frame * 53) % 520, 262, 0, { screen: true, vx: 0.1, vy: -0.35, size: 4, life: 80, alpha: 0.5 });
    particles.update();
    if (this.done) return;
    let skip = this.frame >= INTRO_FRAMES || this.game.options.bot;
    for (let p = 0; p < 2 && !skip; p++) if (this.frame > 10 && (inp.pressed(p, 'attack') || inp.pressed(p, 'start'))) skip = true;
    if (skip) { this.done = true; this.game.audio.play('menu_confirm'); this.game.fadeTo(() => this.game.replace('gameplay', { chars: this.chars, stage: this.stage }), 0.08); }
  }
  draw(ctx) {
    const f = this.frame;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // city: far terraces, cyan summit glow, near terraces, window dots
    ctx.fillStyle = 'rgba(77,240,224,0.12)'; ctx.beginPath(); ctx.arc(392, 176, 34 + Math.sin(f * 0.05) * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#141A2C';
    for (const [x, top, w] of FAR) { ctx.fillRect(x, top, w, VIEW_H - top); ctx.fillRect(x + 4, top - 6, w - 8, 6); }
    for (const [x, y] of STACKS) ctx.fillRect(x, y, 8, 34);
    ctx.fillStyle = '#4DF0E0'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(f * 0.08); ctx.fillRect(387, 170, 10, 6); ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd070';
    for (let i = 0; i < FAR.length; i++) { const [x, top, w] = FAR[i]; for (let k = 0; k < 3; k++) if (((i * 7 + k * 13 + (f >> 5)) % 4) !== 0) ctx.fillRect(x + 5 + k * Math.max(4, (w - 10) / 3), top + 8, 2, 3); }
    ctx.fillStyle = '#0c1020';
    for (const [x, top, w] of NEAR) { ctx.fillRect(x, top, w, VIEW_H - top); ctx.fillRect(x + 6, top - 5, w - 12, 5); }
    particles.draw(ctx, null, 'front');
    // brass frame
    rrect(ctx, 24, 24, VIEW_W - 48, VIEW_H - 48, 6, null, UI.brass, 2);
    rrect(ctx, 28, 28, VIEW_W - 56, VIEW_H - 56, 4, null, UI.brassDark, 1);
    rivetLine(ctx, 34, 32, VIEW_W - 34, 32, 24, 2, UI.brass);
    rivetLine(ctx, 34, VIEW_H - 32, VIEW_W - 34, VIEW_H - 32, 24, 2, UI.brass);
    rivetLine(ctx, 32, 44, 32, VIEW_H - 44, 12, 2, UI.brass);
    rivetLine(ctx, VIEW_W - 32, 44, VIEW_W - 32, VIEW_H - 44, 12, 2, UI.brass);
    // text lines fade in one after another (RECONCILIATION: fade-in instead of typewriter)
    this.lines.forEach((t, i) => {
      const a = Math.min(1, Math.max(0, (f - (LINE_AT[i] != null ? LINE_AT[i] : 84 + i * 36)) / FADE));
      if (a <= 0) return;
      ctx.globalAlpha = a;
      drawText(ctx, t, VIEW_W / 2, 56 + i * 16, { size: 1, color: i === this.lines.length - 1 ? UI.brassLight : UI.paper, align: 'center' });
    });
    const sa = Math.min(1, Math.max(0, (f - STAGE_AT) / FADE));
    if (sa > 0) {
      ctx.globalAlpha = sa;
      const rise = Math.round((1 - sa) * 8);
      rrect(ctx, 152, 108 + rise, 336, 48, 4, 'rgba(24,14,10,0.85)', UI.brass, 2);
      rivetLine(ctx, 162, 113 + rise, 478, 113 + rise, 14, 1.5, UI.brass);
      drawText(ctx, this.stageLabel, VIEW_W / 2, 118 + rise, { size: 1, color: UI.copper, align: 'center' });
      drawTextOutlined(ctx, this.stageName, VIEW_W / 2, 130 + rise, { size: 2, color: UI.brassLight, outline: '#3a2010', align: 'center' });
    }
    ctx.globalAlpha = 1;
    // hero portraits with READY tags
    this.portraits.forEach((pr, i) => {
      if (!pr) return;
      const right = i === 1, px = right ? VIEW_W - 44 - 48 : 44, py = VIEW_H - 112, col = right ? UI.p2 : UI.p1;
      drawPortraitFrame(ctx, px, py, 48, 48, col, 4);
      drawHeadPortrait(ctx, pr.rig, pr.pose, px, py, 48, { facing: right ? -1 : 1, bg: '#1a1426', fill: 0.62 });
      drawText(ctx, `P${i + 1} ${pr.def.name}`, right ? px + 48 : px, py + 52, { size: 1, color: col, align: right ? 'right' : 'left' });
      if ((f % 40) < 30) drawText(ctx, 'READY', right ? px + 48 : px, py + 62, { size: 1, color: UI.brassLight, align: right ? 'right' : 'left' });
    });
    if ((f % 40) < 28) drawText(ctx, 'ATTACK: SKIP', VIEW_W / 2, VIEW_H - 46, { size: 1, color: UI.brass, align: 'center' });
  }
}
