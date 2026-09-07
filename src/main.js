// Boot: create services, Game, screens, loop; install window.__game debug/test hooks (ARCHITECTURE.md 12/15).
import { VIEW_W, VIEW_H } from './constants.js';
import { createLoop } from './engine/loop.js';
import { input } from './engine/input.js';
import { rng } from './engine/rng.js';
import { createCanvas } from './engine/canvas.js';
import { audio } from './engine/audio.js';
import { particles } from './engine/particles.js';
import { Game } from './game/game.js';
import { TitleScreen } from './game/screens/title.js';
import { SelectScreen } from './game/screens/select.js';
import { GalleryScreen } from './game/screens/gallery.js';
import { GameplayScreen } from './game/screens/gameplay.js';
import { DEMO_RIGS } from './art/demoRigs.js';

/** Parse URL params into game options. */
export function parseOptions(search = window.location.search) {
  const q = new URLSearchParams(search);
  const flag = (k) => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';
  const autotest = flag('autotest'), debug = flag('debug');
  const chars = (q.get('chars') || '0').split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n >= 0);
  const spawn = (q.get('spawn') || '').split(',').filter(Boolean).map((tok) => {
    const m = /^([^:@]+)(?::([^@]+))?(?:@(-?\d+)(?:,(-?\d+))?)?$/.exec(tok.trim());
    return m ? { type: m[1], variant: m[2] || 'grunt', dx: m[3] != null ? Number(m[3]) : 80, dz: m[4] != null ? Number(m[4]) : 0 } : null;
  }).filter(Boolean);
  const devOnly = autotest || debug;
  return {
    autotest, debug,
    seed: q.has('seed') ? Number(q.get('seed')) || 1 : (autotest ? 1 : (Date.now() & 0x7fffffff)),
    skipTo: devOnly ? (q.get('skipTo') || '') : '',
    chars: chars.length ? chars : [0],
    nowaves: devOnly && flag('nowaves'),
    spawn: devOnly ? spawn : [],
    bot: devOnly && flag('bot'),
    godmode: devOnly && flag('godmode'),
    section: devOnly ? (parseInt(q.get('section') || '0', 10) || 0) : 0,
  };
}

const hooks = window.__game || (window.__game = { ready: false, errors: [] });
if (!Array.isArray(hooks.errors)) hooks.errors = [];
let lastErrorMsg = '';
function recordError(e) {
  const msg = e && e.stack ? String(e.stack).split('\n').slice(0, 2).join(' ') : String(e && e.message ? e.message : e);
  if (msg === lastErrorMsg) return; // the same error thrown every frame is recorded once
  lastErrorMsg = msg;
  if (hooks._record) hooks._record(msg); // index.html helper pushes + shows the red box
  else { hooks.errors.push(msg); console.warn(msg); }
}
window.addEventListener('error', (e) => { if (!hooks._record) hooks.errors.push(String(e.message || e.error)); });
window.addEventListener('unhandledrejection', (e) => { if (!hooks._record) hooks.errors.push('unhandled rejection: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)); });

function boot() {
  const options = parseOptions();
  audio.testMode = options.autotest;
  rng.seed(options.seed);
  const view = createCanvas(document.getElementById('game') || document.body);
  const ctx = view.ctx;
  input.init(view.displayCanvas);
  audio.init();

  const game = new Game({ input, audio, rng, options });
  // Placeholder registries: content/characters/index.js and content/enemies/index.js replace these.
  game.characters = DEMO_RIGS.slice(0, 4).map((r) => ({ id: r.id, name: r.name, build: r.build, anims: r.anims }));
  game.galleryRegistry = DEMO_RIGS.slice();
  game.enemyList = [];
  game.registerScreen('title', (g) => new TitleScreen(g));
  game.registerScreen('select', (g) => new SelectScreen(g));
  game.registerScreen('gallery', (g) => new GalleryScreen(g));
  game.registerScreen('gameplay', (g) => new GameplayScreen(g));

  let showDebug = options.debug;
  let frameCounter = 0;

  function update() {
    try {
      input.update();
      if (input.globalPressed('mute')) audio.toggleMute();
      if (input.globalPressed('debug')) showDebug = !showDebug;
      game.update();
      frameCounter++;
    } catch (e) { recordError(e); }
  }
  function drawDebug() {
    ctx.save();
    ctx.font = '10px monospace'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, VIEW_H - 12, 210, 12);
    ctx.fillStyle = '#9f9';
    ctx.fillText(`fps ${loop.fps} f${frameCounter} scr:${game.screenId()} p:${particles.count} rng:${(rng.state >>> 0).toString(16).slice(0, 6)}`, 2, VIEW_H - 11);
    if (hooks.errors.length) {
      ctx.fillStyle = 'rgba(140,0,0,0.85)'; ctx.fillRect(0, 0, VIEW_W, 12 * Math.min(4, hooks.errors.length) + 4);
      ctx.fillStyle = '#fff';
      hooks.errors.slice(-4).forEach((m, i) => ctx.fillText(String(m).slice(0, 110), 2, 2 + i * 12));
    }
    ctx.restore();
  }
  function render() {
    try {
      game.draw(ctx);
      if (showDebug || hooks.errors.length) drawDebug();
    } catch (e) { recordError(e); }
    view.present();
  }
  const loop = createLoop({ update, render, testMode: options.autotest });

  // ---- window.__game (section 12 + 15). Screen-specific hooks delegate to the top screen when it implements them. ----
  const delegate = (name, fallback) => (...args) => {
    const s = game.screen;
    if (s && typeof s[name] === 'function') return s[name](...args);
    return typeof fallback === 'function' ? fallback(...args) : fallback;
  };
  // NOTE: Object.assign would evaluate getters once; live getters are defined separately below.
  Object.assign(hooks, {
    game, input, rng, audio, particles, loop, options,
    step(n = 1) { loop.step(Math.max(0, n | 0)); },
    screen() { return game.screenId(); },
    summary() {
      const base = { screen: game.screenId(), sectionIndex: 0, cameraX: 0, locked: false, players: [], enemies: [], boss: null, wavesCleared: 0 };
      // merge bottom -> top so a transparent overlay (pause) does not hide the gameplay data beneath it
      let merged = base;
      for (const s of game.screens) if (typeof s.summary === 'function') merged = { ...merged, ...(s.summary() || {}) };
      return { ...merged, screen: game.screenId(), errors: hooks.errors.slice() };
    },
    setInput(p, actions) { input.setVirtual(p, actions); },
    clearInput(p) { input.clearVirtual(p); },
    spawnEnemy: delegate('spawnEnemy', null),
    killAllEnemies: delegate('killAllEnemies', undefined),
    enemyList: () => (game.enemyList || []).map((e) => ({ type: e.type, variant: e.variant, name: e.name, role: e.role })),
    characterList: () => (game.characters || []).map((c) => ({ id: c.id, name: c.name })),
    fillMeter: delegate('fillMeter', undefined),
    facePlayerToNearestEnemy: delegate('facePlayerToNearestEnemy', undefined),
    toggleDebug() { showDebug = !showDebug; return showDebug; },
  });
  Object.defineProperties(hooks, {
    /** Live World of the current gameplay screen (null when none). */
    world: { get() { const s = game.screen; return s && s.world ? s.world : null; }, enumerable: true, configurable: true },
    /** Whether the debug overlay is on (F1). */
    debug: { get() { return showDebug; }, enumerable: true, configurable: true },
  });

  // ---- initial screen ----
  const start = options.skipTo && game.factories[options.skipTo] ? options.skipTo : 'title';
  try {
    game.push(start, { chars: options.chars });
  } catch (e) { recordError(e); if (start !== 'title') game.reset('title'); }
  hooks.ready = true;
  if (options.autotest) render(); else loop.start();
}

try { boot(); } catch (e) { recordError(e); hooks.ready = true; }
