// Game: screen stack, players, options, transitions (ARCHITECTURE.md section 9).
import { VIEW_W, VIEW_H } from '../constants.js';

/** Base screen. Subclasses set `id` and override enter/exit/update/draw. */
export class Screen {
  constructor(game, id = 'screen') {
    this.game = game;
    this.id = id;
    /** When true, screens below are drawn first (overlay). */
    this.transparent = false;
    this.frame = 0;
  }
  /** Called when pushed / replaced onto the stack. */
  enter(params = {}) { this.params = params; }
  /** Called when popped / replaced away. */
  exit() {}
  /** Fixed step. */
  update() { this.frame++; }
  /** Render. */
  draw(ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  /** Optional: contribute to window.__game.summary(). */
  summary() { return {}; }
}

/** Game shell: owns the screen stack and the shared services (input, audio, options). */
export class Game {
  /**
   * @param {{ input: object, audio: object, rng: object, options?: object }} services
   */
  constructor({ input, audio, rng, options = {} }) {
    this.input = input;
    this.audio = audio;
    this.rng = rng;
    this.options = { debug: false, autotest: false, seed: 1, godmode: false, bot: false, nowaves: false, chars: [0], spawn: [], skipTo: '', section: 0, event: '', stage: 1, ...options };
    this.screens = [];
    this.factories = {};
    /** Players (Player instances once the game-core exists). */
    this.players = [];
    /** Playable character registry [{ id, name, build, anims, ... }] — set by content/characters/index.js. */
    this.characters = [];
    /** Enemy registry list [{ type, variant, name, role }] — set by content/enemies/index.js. */
    this.enemyList = [];
    /** Gallery entries [{ name, build, anims }] shown by the gallery screen. */
    this.galleryRegistry = [];
    this.frame = 0;
    this.fade = { alpha: 0, dir: 0, speed: 0.05, then: null };
  }
  /** Register a screen factory: id -> (game) => Screen. */
  registerScreen(id, factory) { this.factories[id] = factory; }
  /** Registered ids. */
  get screenIds() { return Object.keys(this.factories); }
  _make(id) {
    const f = this.factories[id];
    if (!f) throw new Error(`Unknown screen '${id}'`);
    const s = f(this);
    if (!s.id) s.id = id;
    return s;
  }
  /** Top screen or null. */
  get screen() { return this.screens.length ? this.screens[this.screens.length - 1] : null; }
  /** Id of the top screen ('' when empty). */
  screenId() { return this.screen ? this.screen.id : ''; }
  /** Push a screen on top (overlay if it declares `transparent`). */
  push(id, params = {}) {
    const s = this._make(id);
    this.screens.push(s);
    s.enter(params);
    return s;
  }
  /** Replace the top screen (or push when empty). */
  replace(id, params = {}) {
    const top = this.screens.pop();
    if (top) top.exit();
    return this.push(id, params);
  }
  /** Replace the whole stack with one screen. */
  reset(id, params = {}) {
    while (this.screens.length) this.screens.pop().exit();
    return this.push(id, params);
  }
  /** Pop the top screen. */
  pop() {
    const top = this.screens.pop();
    if (top) top.exit();
    return top;
  }
  /** Fade to black, then run `fn` (usually a replace), then fade back in. */
  fadeTo(fn, speed = 0.06) {
    if (this.fade.dir === 1) return;
    this.fade.dir = 1; this.fade.speed = speed; this.fade.then = fn;
  }
  /** Fixed step: fade bookkeeping + top screen update. */
  update() {
    this.frame++;
    const f = this.fade;
    if (f.dir === 1) { f.alpha = Math.min(1, f.alpha + f.speed); if (f.alpha >= 1) { f.dir = -1; const fn = f.then; f.then = null; if (fn) fn(); } }
    else if (f.dir === -1) { f.alpha = Math.max(0, f.alpha - f.speed); if (f.alpha <= 0) f.dir = 0; }
    const top = this.screen;
    if (top && f.dir !== 1) top.update();
  }
  /** Draw the stack: from the lowest opaque screen up, then the fade overlay. */
  draw(ctx) {
    let start = this.screens.length - 1;
    while (start > 0 && this.screens[start].transparent) start--;
    for (let i = Math.max(0, start); i < this.screens.length; i++) this.screens[i].draw(ctx);
    if (this.fade.alpha > 0) {
      ctx.globalAlpha = this.fade.alpha; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1;
    }
  }
}
