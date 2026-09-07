// Debug gallery (ARCHITECTURE.md section 15): every registered rig in a labelled grid, cycling animations.
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText } from '../../engine/text.js';
import { buildRig, drawRig } from '../../art/rig.js';
import { AnimPlayer } from '../animation.js';
import { drawShadowScreen } from '../../art/fx.js';

/** Preferred animation cycling order (only names present in at least one entry are shown). */
export const GALLERY_ANIMS = ['idle', 'walk', 'attack1', 'hurt', 'run', 'attack2', 'attack3', 'attack4', 'jumpAttack', 'dashAttack', 'special', 'super',
  'grab', 'grabHit', 'throw', 'jump', 'fall', 'land', 'dodge', 'taunt', 'hurtAir', 'knockdown', 'lying', 'getup', 'dead', 'win', 'lunge'];
const HEADER_H = 24;

/**
 * Gallery screen. Entries come from `params.registry` or `game.galleryRegistry`: [{ name, build, anims }].
 * right/left = next/previous animation, up/down = scroll rows when the grid overflows.
 */
export class GalleryScreen extends Screen {
  constructor(game) { super(game, 'gallery'); }
  enter(params) {
    super.enter(params);
    const registry = params.registry || this.game.galleryRegistry || [];
    this.entries = registry.map((e) => ({ name: e.name || e.id || '?', rig: buildRig(e.build || {}), anim: new AnimPlayer(e.anims || {}), hold: 0 }));
    const present = new Set();
    for (const e of registry) for (const k of Object.keys(e.anims || {})) present.add(k);
    this.animNames = GALLERY_ANIMS.filter((n) => present.has(n));
    for (const k of present) if (!this.animNames.includes(k)) this.animNames.push(k);
    if (!this.animNames.length) this.animNames = ['idle'];
    this.animIndex = 0;
    this.scroll = 0;
    this._layout();
    this._playAll(true);
  }
  _layout() {
    const n = this.entries.length;
    this.cols = n > 10 ? 6 : Math.max(1, Math.min(n, 5));
    this.rows = Math.max(1, Math.ceil(n / this.cols));
    this.cellW = Math.floor(VIEW_W / this.cols);
    this.cellH = Math.max(96, Math.min(150, Math.floor((VIEW_H - HEADER_H) / Math.min(this.rows, 3))));
    this.visibleRows = Math.min(this.rows, Math.max(1, Math.floor((VIEW_H - HEADER_H) / this.cellH)));
    this.gridY = HEADER_H + Math.floor((VIEW_H - HEADER_H - this.visibleRows * this.cellH) / 2);
  }
  _playAll(restart) {
    const name = this.animNames[this.animIndex];
    for (const e of this.entries) { e.anim.play(name, { restart, fallback: 'idle' }); e.hold = 0; }
  }
  /** Current animation name. */
  get animName() { return this.animNames[this.animIndex]; }
  update() {
    super.update();
    const inp = this.game.input;
    if (inp.pressed(0, 'right') || inp.pressed(1, 'right')) { this.animIndex = (this.animIndex + 1) % this.animNames.length; this._playAll(true); this.game.audio.play('menu_move'); }
    if (inp.pressed(0, 'left') || inp.pressed(1, 'left')) { this.animIndex = (this.animIndex + this.animNames.length - 1) % this.animNames.length; this._playAll(true); this.game.audio.play('menu_move'); }
    if (inp.pressed(0, 'down')) this.scroll = Math.min(Math.max(0, this.rows - this.visibleRows), this.scroll + 1);
    if (inp.pressed(0, 'up')) this.scroll = Math.max(0, this.scroll - 1);
    if (inp.pressed(0, 'dodge') || inp.pressed(0, 'start')) { this.game.replace('title'); return; }
    for (const e of this.entries) {
      e.anim.tick();
      if (e.anim.done) { if (++e.hold > 30) e.anim.play(this.animName, { restart: true, fallback: 'idle' }), (e.hold = 0); }
    }
  }
  draw(ctx) {
    ctx.fillStyle = '#2a2430'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#1a1420'; ctx.fillRect(0, 0, VIEW_W, HEADER_H);
    drawText(ctx, `GALLERY  ${this.entries.length} RIGS   ANIM: ${this.animName.toUpperCase()} (${this.animIndex + 1}/${this.animNames.length})   LEFT/RIGHT: CYCLE  UP/DOWN: SCROLL`, 8, 8, { size: 1, color: UI.brass });
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const col = i % this.cols, row = Math.floor(i / this.cols) - this.scroll;
      if (row < 0 || row >= this.visibleRows) continue;
      const x = col * this.cellW, y = this.gridY + row * this.cellH;
      ctx.fillStyle = (col + row) % 2 ? '#2e2834' : '#2a2430'; ctx.fillRect(x, y, this.cellW, this.cellH);
      ctx.fillStyle = '#3a3242'; ctx.fillRect(x, y + this.cellH - 16, this.cellW, 16);
      const fx = x + this.cellW / 2, fy = y + this.cellH - 16;
      // fit tall rigs (and their raised weapons) inside the cell
      const fit = Math.min(1, (this.cellH - 22) / ((e.rig.height + 14) * e.rig.scale));
      drawShadowScreen(ctx, fx, fy, 34 * e.rig.scale * fit, 0.5);
      drawRig(ctx, e.rig, e.anim.pose, { x: fx, y: fy, facing: 1, scale: fit });
      drawText(ctx, e.name, fx, y + this.cellH - 12, { size: 1, color: UI.paper, align: 'center' });
    }
  }
}
