// Boot: create services, Game, screens, loop; install window.__game debug/test hooks (ARCHITECTURE.md 12/15).
import { VIEW_W, VIEW_H } from './constants.js';
import { createLoop } from './engine/loop.js';
import { input } from './engine/input.js';
import { rng } from './engine/rng.js';
import { createCanvas } from './engine/canvas.js';
import { touch } from './engine/touch.js';
import { audio } from './engine/audio.js';
import { particles } from './engine/particles.js';
import { Game } from './game/game.js';
import { TitleScreen } from './game/screens/title.js';
import { SelectScreen } from './game/screens/select.js';
import { GalleryScreen } from './game/screens/gallery.js';
import { GameplayScreen } from './game/screens/gameplay.js';
import { IntroScreen } from './game/screens/intro.js';
import { PauseScreen } from './game/screens/pause.js';
import { GameOverScreen } from './game/screens/gameover.js';
import { ResultsScreen } from './game/screens/results.js';
import { createNetSession } from './net/session.js';
import { CHARACTERS } from './content/characters/index.js';
import { ENEMY_LIST, ENEMY_GALLERY } from './content/enemies/index.js';

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
    touch: flag('touch'),
    spawn: devOnly ? spawn : [],
    bot: devOnly && flag('bot'),
    godmode: devOnly && flag('godmode'),
    section: devOnly ? (parseInt(q.get('section') || '0', 10) || 0) : 0,
    // which board to play: 1-based stage number (see content/stage/index.js). Honoured outside dev mode too so a
    // link can point straight at a board.
    stage: q.has('stage') ? (parseInt(q.get('stage'), 10) || 1) : 1,
    // Online co-op invite links: ?room=CODE joins that room, ?host=1 hosts it, ?transport= picks
    // the signalling strategy (mqtt by default; broadcast is same-machine tabs and the e2e test).
    room: (q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
    host: flag('host'),
    transport: ['mqtt', 'broadcast', 'manual'].includes(q.get('transport')) ? q.get('transport') : 'mqtt',
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
  touch.init(view, options.touch);
  audio.init();

  const game = new Game({ input, audio, rng, options });
  // Content registries: playable characters, enemy list (10 variants + midboss + boss) and the gallery (all rigs).
  game.characters = CHARACTERS;
  game.enemyList = ENEMY_LIST;
  game.galleryRegistry = [...CHARACTERS.map((c) => ({ id: c.id, name: c.name, build: c.build, anims: c.anims })), ...ENEMY_GALLERY];
  game.registerScreen('title', (g) => new TitleScreen(g));
  game.registerScreen('select', (g) => new SelectScreen(g));
  game.registerScreen('intro', (g) => new IntroScreen(g));
  game.registerScreen('gallery', (g) => new GalleryScreen(g));
  game.registerScreen('gameplay', (g) => new GameplayScreen(g));
  game.registerScreen('pause', (g) => new PauseScreen(g));
  game.registerScreen('gameover', (g) => new GameOverScreen(g));
  game.registerScreen('results', (g) => new ResultsScreen(g));

  let showDebug = options.debug;
  let frameCounter = 0;

  /** The live online co-op session, or null in single player. Screens reach it as `game.net`. */
  let net = null;
  game.createNet = (o) => {
    net = createNetSession({ game, input, ...o });
    game.net = net;
    return net;
  };

  function update() {
    try {
      touch.update();
      // Netplay drives both slots from the lockstep buffers, so the local devices are sampled and
      // the delayed masks injected before input.update() turns them into edges.
      if (net && net.active) net.beforeStep();
      input.update();
      if (input.globalPressed('mute')) audio.toggleMute();
      if (input.globalPressed('debug')) showDebug = !showDebug;
      game.update();
      if (net && net.active) net.afterStep(hooks.world);
      frameCounter++;
    } catch (e) { recordError(e); }
  }
  function drawDebug() {
    ctx.save();
    ctx.font = '10px monospace'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, VIEW_H - 12, 210, 12);
    ctx.fillStyle = '#9f9';
    const nd = net && net.ls ? ` net:${net.state} f${net.ls.frame} d${net.delay} rtt${Math.round(net.rtt || 0)}${net.waiting ? ' WAIT' : ''}` : '';
    ctx.fillText(`fps ${loop.fps} f${frameCounter} scr:${game.screenId()} p:${particles.count} rng:${(rng.state >>> 0).toString(16).slice(0, 6)}${nd}`, 2, VIEW_H - 11);
    if (hooks.errors.length) {
      ctx.fillStyle = 'rgba(140,0,0,0.85)'; ctx.fillRect(0, 0, VIEW_W, 12 * Math.min(4, hooks.errors.length) + 4);
      ctx.fillStyle = '#fff';
      hooks.errors.slice(-4).forEach((m, i) => ctx.fillText(String(m).slice(0, 110), 2, 2 + i * 12));
    }
    ctx.restore();
  }
  function render() {
    try {
      // Runs every rAF even while the simulation is gated: a stalled peer must keep retransmitting
      // its input window or two peers stalled on the same frame deadlock permanently.
      if (net) net.pump();
      game.draw(ctx);
      touch.draw(ctx);
      if (showDebug || hooks.errors.length) drawDebug();
    } catch (e) { recordError(e); }
    view.present();
  }
  // In netplay the fixed step waits for the peer's input; rendering is never gated, so the game
  // keeps drawing a "waiting" overlay instead of freezing.
  const loop = createLoop({ update, render, testMode: options.autotest, canUpdate: () => !net || !net.active || net.canStep() });

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
    /** Online co-op state for tools/playtest.js. */
    netState() { return net ? { state: net.state, room: net.room, slot: net.localSlot, delay: net.delay, waiting: net.waiting, frame: net.ls ? net.ls.frame : -1, desync: net.ls ? net.ls.desync : null, reason: net.endReason } : null; },
    startNet(o) { return game.startNet ? game.startNet(o) : null; },
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
