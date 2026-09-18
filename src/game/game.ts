// Game: screen stack, players, options, transitions (ARCHITECTURE.md section 9).
import { VIEW_W, VIEW_H } from '../constants.ts';
import type { Player } from './player.ts';
import type { Rng } from '../lib/engine/rng.ts';
import type { input as inputService } from '../engine/input.ts';
import type { audio as audioService } from '../engine/audio.ts';

/**
 * What a screen is handed on `enter` / `push` / `replace` / `reset`. Open by design: every screen
 * names its own params (`{ stage, section }`, `{ results }`, ...) and reads them off `this.params`.
 */
export type ScreenParams = Record<string, any>;

/** What `summary()` contributes to window.__game.summary() (ARCHITECTURE.md section 12). */
export type ScreenSummary = Record<string, any>;

/** A registered screen factory: id -> (game) => Screen. */
export type ScreenFactory = (game: Game) => Screen;

/** Base screen. Subclasses set `id` and override enter/exit/update/draw. */
export class Screen {
  // `declare`, not a plain field: these are the constructor's own assignments and nothing else. A
  // plain declaration emits a class field per name (es2022 defines them before the constructor body
  // runs), which would be a runtime change. See the same note in game/entity.ts.
  declare game: Game;
  declare id: string;
  /** When true, screens below are drawn first (overlay). */
  declare transparent: boolean;
  declare frame: number;
  /** Whatever `enter` was handed; every screen reads its own keys off it. */
  declare params: ScreenParams;

  constructor(game: Game, id: string = 'screen') {
    this.game = game;
    this.id = id;
    /** When true, screens below are drawn first (overlay). */
    this.transparent = false;
    this.frame = 0;
  }
  /** Called when pushed / replaced onto the stack. */
  enter(params: ScreenParams = {}): void { this.params = params; }
  /** Called when popped / replaced away. */
  exit(): void {}
  /** Fixed step. */
  update(): void { this.frame++; }
  /** Render. */
  draw(ctx: CanvasRenderingContext2D): void { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  /** Optional: contribute to window.__game.summary(). */
  summary(): ScreenSummary { return {}; }
}

/**
 * The run options the game shell reads, as `parseOptions` (main.ts) builds them from the URL. The
 * listed keys are the ones `Game` itself defaults; the rest of the query string (touch, botStyle,
 * difficulty, ...) rides along untouched, which is what the index signature is for — the URL is an
 * open vocabulary and every screen reads its own flags off it.
 */
export interface GameOptions {
  debug: boolean;
  autotest: boolean;
  seed: number;
  godmode: boolean;
  bot: boolean;
  nowaves: boolean;
  /** Character index per player slot. */
  chars: number[];
  /** Dev-only forced spawns (`?spawn=type:variant@dx,dz`). */
  spawn: any[];
  skipTo: string;
  section: number;
  event: string;
  stage: number;
  /** Everything else parseOptions carries; see the note above. */
  [key: string]: any;
}

/** The shared services the shell is constructed with. */
export interface GameServices {
  input: typeof inputService;
  audio: typeof audioService;
  rng: Rng;
  options?: Partial<GameOptions>;
}

/**
 * One entry of a registry the content layer fills in at boot: the playable characters
 * (`game.characters`), the enemy list (`game.enemyList`) and the gallery (`game.galleryRegistry`).
 * Only the fields the game layer itself reads are named; a content def carries many more.
 */
export interface RegistryEntry {
  id?: string;
  name?: string;
  /**
   * `build` and `anims` (RigBuild / AnimSet) and the rest of a content def — type, variant, role,
   * palette, stats, portrait — ride along under the index signature rather than being named here.
   * Pinning `build` to `RigBuild` at the registry would report content's existing widenings (an
   * accessory's `attach` is authored as `string`, not `AccessoryAttach`) against the ASSIGNMENT in
   * main.ts rather than against the def that widened it, which is where it belongs.
   */
  [key: string]: any;
}

/** The fade-to-black state machine: `dir` +1 fading out, -1 fading in, 0 idle. */
export interface Fade {
  alpha: number;
  dir: number;
  speed: number;
  then: (() => void) | null;
}

/** Game shell: owns the screen stack and the shared services (input, audio, options). */
export class Game {
  declare input: GameServices['input'];
  declare audio: GameServices['audio'];
  declare rng: Rng;
  declare options: GameOptions;
  declare screens: Screen[];
  declare factories: Record<string, ScreenFactory>;
  /** Players (Player instances once the game-core exists). */
  declare players: Player[];
  /** Playable character registry [{ id, name, build, anims, ... }] — set by content/characters/index.js. */
  declare characters: RegistryEntry[];
  /** Enemy registry list [{ type, variant, name, role }] — set by content/enemies/index.js. */
  declare enemyList: RegistryEntry[];
  /** Gallery entries [{ name, build, anims }] shown by the gallery screen. */
  declare galleryRegistry: RegistryEntry[];
  declare frame: number;
  declare fade: Fade;
  /**
   * The live online co-op session and its factory. Neither is set here: main.ts installs both at
   * boot (`game.createNet = (o) => ...`), and screens reach the session as `game.net` — null until
   * a room is opened. `any` because the session object is net/session.ts's own (it grows `connect`
   * / `end` / `run` after `createNetSession` returns); naming its shape here would be declaring
   * that module's API from the outside.
   */
  declare net: any;
  declare createNet: (o?: Record<string, any>) => any;

  /**
   * @param {{ input: object, audio: object, rng: object, options?: object }} services
   */
  constructor({ input, audio, rng, options = {} }: GameServices) {
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
  registerScreen(id: string, factory: ScreenFactory): void { this.factories[id] = factory; }
  /** Registered ids. */
  get screenIds(): string[] { return Object.keys(this.factories); }
  _make(id: string): Screen {
    const f = this.factories[id];
    if (!f) throw new Error(`Unknown screen '${id}'`);
    const s = f(this);
    if (!s.id) s.id = id;
    return s;
  }
  /** Top screen or null. */
  get screen(): Screen | null { return this.screens.length ? this.screens[this.screens.length - 1] : null; }
  /** Id of the top screen ('' when empty). */
  screenId(): string { return this.screen ? this.screen.id : ''; }
  /** Push a screen on top (overlay if it declares `transparent`). */
  push(id: string, params: ScreenParams = {}): Screen {
    const s = this._make(id);
    this.screens.push(s);
    s.enter(params);
    return s;
  }
  /** Replace the top screen (or push when empty). */
  replace(id: string, params: ScreenParams = {}): Screen {
    const top = this.screens.pop();
    if (top) top.exit();
    return this.push(id, params);
  }
  /** Replace the whole stack with one screen. */
  reset(id: string, params: ScreenParams = {}): Screen {
    while (this.screens.length) this.screens.pop().exit();
    return this.push(id, params);
  }
  /** Pop the top screen. */
  pop(): Screen | undefined {
    const top = this.screens.pop();
    if (top) top.exit();
    return top;
  }
  /** Fade to black, then run `fn` (usually a replace), then fade back in. */
  fadeTo(fn: () => void, speed: number = 0.06): void {
    if (this.fade.dir === 1) return;
    this.fade.dir = 1; this.fade.speed = speed; this.fade.then = fn;
  }
  /** Fixed step: fade bookkeeping + top screen update. */
  update(): void {
    this.frame++;
    const f = this.fade;
    if (f.dir === 1) { f.alpha = Math.min(1, f.alpha + f.speed); if (f.alpha >= 1) { f.dir = -1; const fn = f.then; f.then = null; if (fn) fn(); } }
    else if (f.dir === -1) { f.alpha = Math.max(0, f.alpha - f.speed); if (f.alpha <= 0) f.dir = 0; }
    const top = this.screen;
    if (top && f.dir !== 1) top.update();
  }
  /** Draw the stack: from the lowest opaque screen up, then the fade overlay. */
  draw(ctx: CanvasRenderingContext2D): void {
    let start = this.screens.length - 1;
    while (start > 0 && this.screens[start].transparent) start--;
    for (let i = Math.max(0, start); i < this.screens.length; i++) this.screens[i].draw(ctx);
    if (this.fade.alpha > 0) {
      ctx.globalAlpha = this.fade.alpha; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1;
    }
  }
}
