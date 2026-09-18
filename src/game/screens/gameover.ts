// Game over / continue overlay (GDD 9): both players out -> frozen gameplay beneath, grey overlay alpha 0.6,
// "CONTINUE? 9..0" with the digit cracking like a gear each second (shards fly), attack/start spends a continue;
// expiry (or no continues) -> "THE ENGINE WINS." then the results plaque with a D-rank ceiling.
import { VIEW_W, VIEW_H, UI } from '../../constants.ts';
import { Screen } from '../game.ts';
import { confirmPressed } from '../menuinput.ts';
import { drawText, drawTextOutlined } from '../../engine/text.ts';
import { rrect, rivetLine, gear } from '../../lib/art/shapes.ts';
import { drawCrackGear } from '../hud.ts';
// Type-only: `import type` is erased by tsc, esbuild and node alike, so neither adds an edge to the
// module graph the browser loads (the note at the top of screens/gameplay.ts).
import type { Game, ScreenParams } from '../game.ts';
import type { GameplayScreen } from './gameplay.ts';

const COUNTDOWN_FRAMES = 600, WINS_FRAMES = 150;

/**
 * One gear shard thrown off the cracking digit each second. Plain ballistics in screen space -- this
 * overlay draws over a frozen board and owns no simulation, so these never go near engine/particles.js
 * and nothing about them is hashed by net/checksum.js.
 */
export interface GameOverShard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Rotation and its per-frame delta, radians. */
  rot: number;
  vr: number;
  /** Frames left; a shard is dropped at 0 and fades over the last 10. */
  life: number;
}

/** Transparent overlay pushed by the gameplay screen when every player is out. */
export class GameOverScreen extends Screen {
  // The fields, for the checker only, in the order enter() writes them. `declare` because these are
  // assignments and nothing else: a plain field declaration would emit a class field per name (es2022
  // defines them before the constructor body runs), which is a runtime change. Same reasoning, and the
  // same wording, as game/entity.ts's Entity.
  /** The board underneath, which spends the continue or builds the results plaque; null when none was passed. */
  declare gameplay: GameplayScreen | null;
  /** Continues the run has left. */
  declare continues: number;
  /** Counts the countdown down, then the THE ENGINE WINS. hold. */
  declare timer: number;
  /** The digit last drawn, so the crack fires on the change rather than on a modulo. */
  declare lastDigit: number;
  /** Frames left of the gear-crack shake; 0 when the digit is at rest. */
  declare crack: number;
  /** The countdown ran out (or was declined with no continues left): the plate is on its closing line. */
  declare expired: boolean;
  /** A fade is already running, so nothing may start a second one. */
  declare leaving: boolean;
  declare shards: GameOverShard[];

  constructor(game: Game) { super(game, 'gameover'); this.transparent = true; }
  override enter(params: ScreenParams): void {
    super.enter(params);
    this.gameplay = params.screen || null;
    this.continues = params.continues != null ? params.continues : 0;
    this.timer = COUNTDOWN_FRAMES;
    this.lastDigit = 10; this.crack = 0; this.expired = false; this.leaving = false;
    this.shards = [];
    this.game.audio.music.play('gameover');
  }
  get digit(): number { return Math.max(0, Math.ceil(this.timer / 60)); }
  override update(): void {
    super.update();
    for (const s of this.shards) { s.x += s.vx; s.y += s.vy; s.vy += 0.25; s.rot += s.vr; s.life--; }
    this.shards = this.shards.filter((s) => s.life > 0);
    if (this.leaving) return;
    const inp = this.game.input;
    if (this.crack > 0) this.crack--;
    if (!this.expired) {
      this.timer--;
      const d = this.digit;
      if (d !== this.lastDigit) { this.lastDigit = d; this.crack = 8; this.game.audio.play('continue_tick'); this.spawnShards(); }
      let go = false;
      for (let p = 0; p < inp.playerCount; p++) if (confirmPressed(inp, p)) go = true;
      if (this.game.options.bot && this.frame > 30) go = true;
      if (go && this.continues > 0 && this.gameplay) {
        this.leaving = true;
        this.game.audio.play('menu_confirm');
        this.game.fadeTo(() => { this.game.pop(); this.gameplay.continueRun(); }, 0.1);
        return;
      }
      if (this.timer <= 0 || (go && this.continues <= 0)) { this.expired = true; this.timer = WINS_FRAMES; this.game.audio.play('game_over'); }
    } else if (--this.timer <= 0) {
      this.leaving = true;
      const gp = this.gameplay;
      this.game.fadeTo(() => { this.game.pop(); if (gp && gp.showResults) gp.showResults(true); else this.game.reset('title'); }, 0.05);
    }
  }
  spawnShards(): void {
    for (let i = 0; i < 8; i++) this.shards.push({ x: VIEW_W / 2, y: 192, vx: (i - 3.5) * 1.3, vy: -3 - (i % 3), rot: i, vr: (i % 2 ? 1 : -1) * 0.2, life: 30 + (i % 4) * 5 });
  }
  override draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(40,40,48,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const w = 320, h = 170, x = (VIEW_W - w) / 2, y = 92, f = this.frame;
    rrect(ctx, x, y, w, h, 8, 'rgba(24,16,20,0.95)', UI.brass, 2);
    rrect(ctx, x + 4, y + 4, w - 8, h - 8, 6, null, UI.brassDark, 1);
    rivetLine(ctx, x + 12, y + 9, x + w - 12, y + 9, 12, 2, UI.brass);
    rivetLine(ctx, x + 12, y + h - 9, x + w - 12, y + h - 9, 12, 2, UI.brass);
    if (this.expired) {
      const k = Math.min(1, (WINS_FRAMES - this.timer) / 8), sc = 4 - Math.round(k);
      drawTextOutlined(ctx, 'THE ENGINE WINS.', VIEW_W / 2, y + 52 - sc * 2, { size: sc, color: UI.red, outline: '#2a1010', thickness: 1, align: 'center' });
      drawText(ctx, 'THE CHANCELLOR KEEPS THE SKY.', VIEW_W / 2, y + 100, { size: 1, color: UI.steel, align: 'center' });
      drawText(ctx, 'GAME OVER', VIEW_W / 2, y + 122, { size: 2, color: UI.paper, align: 'center' });
      return;
    }
    drawTextOutlined(ctx, 'CONTINUE?', VIEW_W / 2, y + 20, { size: 3, color: UI.brass, outline: '#3a2010', thickness: 1, align: 'center' });
    const shake = this.crack > 0 ? (this.crack % 2 ? 3 : -3) : 0;
    drawCrackGear(ctx, VIEW_W / 2 + shake, y + 100, 34, this.crack, f);
    for (const s of this.shards) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = Math.min(1, s.life / 10); gear(ctx, 0, 0, 4, 5, UI.brass, '#1a1018', 1, 0, 1.2); ctx.restore(); }
    ctx.globalAlpha = 1;
    drawTextOutlined(ctx, String(this.digit), VIEW_W / 2 + shake, y + 86, { size: 4, color: this.crack > 0 ? '#ffffff' : UI.paper, outline: '#2a1410', thickness: 1, align: 'center' });
    const msg = this.continues > 0 ? `ATTACK OR START TO CONTINUE   (${this.continues} LEFT)` : 'NO CONTINUES LEFT';
    if ((f % 40) < 28) drawText(ctx, msg, VIEW_W / 2, y + h - 26, { size: 1, color: this.continues > 0 ? UI.paper : UI.red, align: 'center' });
  }
}
