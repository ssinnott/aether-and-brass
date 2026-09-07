// Headless playthrough harness. Usage:
//   node tools/playtest.js                 # run every scenario
//   node tools/playtest.js boot combat     # run selected scenarios (boot select combat playthrough playthrough2 coop audio gallery)
//   KEEP=1 node tools/playtest.js          # keep browser output verbose
// Requires Playwright: local dependency or the global install (NODE_PATH fallback).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from './server.js';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright'];
  for (const c of candidates) { try { return require(c); } catch { /* next */ } }
  throw new Error('Playwright not found. Install with `npm i -D playwright-core` or set NODE_PATH to the global node_modules.');
}
const { chromium } = loadPlaywright();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tools', 'screens');
fs.mkdirSync(SHOTS, { recursive: true });

const CHARACTER_COUNT = 4;
const ENEMY_LIST_FALLBACK = []; // filled from the game at runtime via __game.enemyList()

let failures = 0;
const results = [];
function assert(cond, msg) {
  if (!cond) { failures++; results.push(`  FAIL: ${msg}`); console.log(`  FAIL: ${msg}`); }
  else results.push(`  ok:   ${msg}`);
}

async function withPage(server, params, fn, { viewport = { width: 1280, height: 720 } } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); if (process.env.KEEP) console.log('   [browser]', m.text()); });
  const url = `http://localhost:${server.port}/index.html?autotest=1&${params}`;
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
    const api = makeApi(page);
    await fn(api, page);
    const errs = await api.errors();
    assert(errs.length === 0, `no runtime errors (${params}) ${errs.length ? JSON.stringify(errs.slice(0, 3)) : ''}`);
    assert(consoleErrors.length === 0, `no console errors (${params}) ${consoleErrors.length ? JSON.stringify(consoleErrors.slice(0, 3)) : ''}`);
  } catch (e) {
    failures++; results.push(`  FAIL: scenario crashed (${params}): ${e.message}`); console.log(`  FAIL: scenario crashed (${params}): ${e.message}`);
    if (consoleErrors.length) console.log('   browser errors:', consoleErrors.slice(0, 5));
    try { await page.screenshot({ path: path.join(SHOTS, 'crash.png') }); } catch { /* ignore */ }
  } finally {
    await browser.close();
  }
}

function makeApi(page) {
  return {
    step: (n) => page.evaluate((k) => window.__game.step(k), n),
    summary: () => page.evaluate(() => window.__game.summary()),
    screen: () => page.evaluate(() => window.__game.screen()),
    errors: () => page.evaluate(() => window.__game.errors.slice()),
    setInput: (p, a) => page.evaluate(([pp, aa]) => window.__game.setInput(pp, aa), [p, a]),
    clearInput: (p) => page.evaluate((pp) => window.__game.clearInput(pp), p),
    // press: hold actions for `hold` frames then release and run `settle` frames
    press: async (p, actions, hold = 2, settle = 0) => {
      await page.evaluate(([pp, aa]) => window.__game.setInput(pp, aa), [p, actions]);
      await page.evaluate((k) => window.__game.step(k), hold);
      await page.evaluate((pp) => window.__game.clearInput(pp), p);
      if (settle) await page.evaluate((k) => window.__game.step(k), settle);
    },
    spawnEnemy: (type, variant, dx, dz = 0) => page.evaluate(([t, v, x, z]) => window.__game.spawnEnemy(t, v, x, z), [type, variant, dx, dz]),
    killEnemies: () => page.evaluate(() => window.__game.killAllEnemies()),
    enemyList: () => page.evaluate(() => window.__game.enemyList()),
    characterList: () => page.evaluate(() => window.__game.characterList()),
    shot: (name) => page.screenshot({ path: path.join(SHOTS, name + '.png') }),
    eval: (fn, arg) => page.evaluate(fn, arg),
  };
}

const scenarios = {
  // 1. Title screen renders.
  async boot(server) {
    await withPage(server, 'seed=1', async (g) => {
      await g.step(120);
      assert((await g.screen()) === 'title', 'title screen is active after boot');
      await g.shot('01-title');
      await g.press(0, { attack: true }, 2, 30);
      assert((await g.screen()) === 'select', 'attack on title goes to character select');
      await g.shot('02-select');
    });
  },

  // 2. Character select -> intro -> gameplay for each character.
  async select(server) {
    for (let c = 0; c < CHARACTER_COUNT; c++) {
      await withPage(server, 'seed=1', async (g) => {
        await g.step(60);
        await g.press(0, { attack: true }, 2, 20);           // title -> select
        for (let i = 0; i < c; i++) await g.press(0, { right: true }, 2, 10);
        await g.press(0, { attack: true }, 2, 20);           // confirm character
        // ready/confirm again if the select screen requires a second confirmation
        let s = await g.screen();
        if (s === 'select') { await g.press(0, { start: true }, 2, 20); s = await g.screen(); }
        if (s === 'select') { await g.press(0, { attack: true }, 2, 20); s = await g.screen(); }
        assert(s === 'intro' || s === 'gameplay', `character ${c}: confirm leads to intro/gameplay (got ${s})`);
        await g.step(200);
        await g.press(0, { attack: true }, 2, 30);           // skip intro card if any
        await g.step(60);
        const sum = await g.summary();
        assert(sum.screen === 'gameplay', `character ${c}: gameplay reached (got ${sum.screen})`);
        assert(sum.players.length === 1 && sum.players[0].hp > 0, `character ${c}: one live player`);
        if (c === 0) await g.shot('03-intro-to-gameplay');
      });
    }
  },

  // 3. Every character can hit enemies with every move.
  async combat(server) {
    const moves = [
      { name: 'combo', run: async (g) => { for (let i = 0; i < 5; i++) await g.press(0, { attack: true }, 2, 14); await g.step(40); } },
      { name: 'jumpAttack', run: async (g) => { await g.press(0, { jump: true }, 2, 10); await g.press(0, { attack: true }, 2, 40); await g.step(30); } },
      { name: 'dashAttack', run: async (g) => { await g.press(0, { right: true }, 3, 3); await g.press(0, { right: true }, 3, 0); await g.press(0, { right: true, attack: true }, 3, 40); await g.step(30); } },
      { name: 'special', run: async (g) => { await g.press(0, { special: true }, 2, 60); await g.step(30); } },
      { name: 'super', run: async (g) => { await g.eval(() => window.__game.fillMeter(0)); await g.press(0, { super: true }, 2, 120); await g.step(60); } },
      { name: 'grab', run: async (g) => { await g.press(0, { right: true }, 20, 5); await g.press(0, { attack: true }, 2, 20); await g.press(0, { attack: true }, 2, 20); await g.press(0, { right: true, attack: true }, 2, 60); } },
    ];
    for (let c = 0; c < CHARACTER_COUNT; c++) {
      await withPage(server, `seed=1&skipTo=gameplay&chars=${c}&nowaves=1&godmode=1`, async (g) => {
        await g.step(30);
        for (const mv of moves) {
          await g.killEnemies();
          await g.step(5);
          await g.spawnEnemy('typeA', 'grunt', 40, 0);
          await g.spawnEnemy('typeA', 'grunt', 70, 0);
          await g.step(2);
          const before = (await g.summary()).enemies.reduce((a, e) => a + e.hp, 0);
          await mv.run(g);
          const after = (await g.summary()).enemies.reduce((a, e) => a + e.hp, 0);
          assert(after < before, `character ${c} move '${mv.name}' damages enemies (${before} -> ${after})`);
          if (c === 0 && mv.name === 'combo') await g.shot('04-combat');
        }
      });
    }
  },

  // 4. Full bot playthrough to the results screen.
  async playthrough(server) {
    await withPage(server, 'seed=7&skipTo=gameplay&chars=0&bot=1&godmode=1', async (g) => {
      const MAX = 40000, CHUNK = 600;
      let frames = 0, lastSection = -1, sawMidboss = false, sawBoss = false, lastX = -1, stuckSince = 0;
      while (frames < MAX) {
        await g.step(CHUNK); frames += CHUNK;
        const s = await g.summary();
        if (s.sectionIndex !== lastSection) { lastSection = s.sectionIndex; await g.shot(`10-section-${s.sectionIndex}`); console.log(`   section ${s.sectionIndex} at frame ${frames} (x=${Math.round(s.cameraX)})`); }
        if (s.boss && s.boss.kind === 'midboss' && !sawMidboss) { sawMidboss = true; await g.shot('11-midboss'); }
        if (s.boss && s.boss.kind === 'boss' && !sawBoss) { sawBoss = true; await g.shot('12-boss'); }
        if (Math.abs(s.cameraX - lastX) < 1 && !s.boss && !s.locked) stuckSince += CHUNK; else stuckSince = 0;
        lastX = s.cameraX;
        if (s.screen === 'results') { await g.shot('13-results'); break; }
        if (s.screen === 'gameover') { assert(false, 'bot should not reach game over in godmode'); break; }
        if (stuckSince > 6000) { await g.shot('crash-stuck'); assert(false, `bot stuck at x=${Math.round(s.cameraX)} for 6000 frames (screen=${s.screen}, enemies=${s.enemies.length})`); break; }
      }
      const s = await g.summary();
      assert(sawMidboss, 'mid-boss appeared during playthrough');
      assert(sawBoss, 'final boss appeared during playthrough');
      assert(s.screen === 'results', `results screen reached within ${MAX} frames (got ${s.screen}, frames=${frames}, x=${Math.round(s.cameraX)}, section=${s.sectionIndex})`);
      console.log(`   playthrough finished in ${frames} frames, wavesCleared=${s.wavesCleared}`);
    });
  },

  // 4b. Full bot playthrough of the second board (Stage 2: The Storm Above Calderwick).
  async playthrough2(server) {
    await withPage(server, 'seed=7&skipTo=gameplay&stage=2&chars=0&bot=1&godmode=1', async (g) => {
      const MAX = 40000, CHUNK = 600;
      let frames = 0, lastSection = -1, sawMidboss = false, sawBoss = false, lastX = -1, stuckSince = 0;
      while (frames < MAX) {
        await g.step(CHUNK); frames += CHUNK;
        const s = await g.summary();
        if (s.sectionIndex !== lastSection) { lastSection = s.sectionIndex; await g.shot(`50-stage2-section-${s.sectionIndex}`); console.log(`   section ${s.sectionIndex} at frame ${frames} (x=${Math.round(s.cameraX)})`); }
        if (s.boss && s.boss.kind === 'midboss' && !sawMidboss) { sawMidboss = true; await g.shot('51-stage2-midboss'); }
        if (s.boss && s.boss.kind === 'boss' && !sawBoss) { sawBoss = true; await g.shot('52-stage2-boss'); }
        if (Math.abs(s.cameraX - lastX) < 1 && !s.boss && !s.locked) stuckSince += CHUNK; else stuckSince = 0;
        lastX = s.cameraX;
        if (s.screen === 'results') { await g.shot('53-stage2-results'); break; }
        if (s.screen === 'gameover') { assert(false, 'bot should not reach game over in godmode'); break; }
        if (stuckSince > 6000) { await g.shot('crash-stuck-stage2'); assert(false, `bot stuck at x=${Math.round(s.cameraX)} for 6000 frames (screen=${s.screen}, enemies=${s.enemies.length})`); break; }
      }
      const s = await g.summary();
      assert(sawMidboss, 'stage 2 mid-boss appeared during playthrough');
      assert(sawBoss, 'stage 2 final boss appeared during playthrough');
      assert(s.screen === 'results', `stage 2 results reached within ${MAX} frames (got ${s.screen}, frames=${frames}, x=${Math.round(s.cameraX)}, section=${s.sectionIndex})`);
      console.log(`   stage 2 playthrough finished in ${frames} frames, wavesCleared=${s.wavesCleared}`);
    });
  },

  // 5. Two-player co-op runs without errors.
  async coop(server) {
    await withPage(server, 'seed=3&skipTo=gameplay&chars=1,3&bot=1&godmode=1', async (g) => {
      await g.step(3000);
      const s = await g.summary();
      assert(s.players.length === 2, 'two players present');
      assert(s.wavesCleared >= 1, `co-op bots clear at least one wave (cleared ${s.wavesCleared})`);
      await g.shot('20-coop');
    });
  },

  // 7. Audio: every canonical SFX and music track renders non-silently through an OfflineAudioContext.
  async audio(server) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    try {
      await page.goto(`http://localhost:${server.port}/index.html?debug=1&seed=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
      const report = await page.evaluate(() => import('/src/engine/audio.js').then((m) => m.audio.selfTest()));
      assert(report && Array.isArray(report.sfx), 'audio.selfTest() returns {sfx:[...], music:[...]}');
      const silent = (report.sfx || []).filter((r) => !(r.rms > 0.0005));
      const failed = (report.sfx || []).filter((r) => r.error);
      assert(failed.length === 0, `no SFX throws (${failed.map((r) => r.name + ': ' + r.error).slice(0, 5).join('; ')})`);
      assert(silent.length === 0, `every SFX is audible (silent: ${silent.map((r) => r.name).join(', ')})`);
      assert((report.sfx || []).length >= 60, `canonical SFX list implemented (${(report.sfx || []).length} rendered)`);
      const quietTracks = (report.music || []).filter((r) => !(r.rms > 0.002) || r.error);
      assert((report.music || []).length >= 9, `all 9 music tracks render (${(report.music || []).length})`);
      assert(quietTracks.length === 0, `every music track is audible/no error (${quietTracks.map((r) => r.name + (r.error ? ':' + r.error : '')).join(', ')})`);
      assert(errs.length === 0, `no page errors during audio self-test ${errs.slice(0, 2).join('; ')}`);
    } catch (e) {
      failures++; results.push(`  FAIL: audio scenario crashed: ${e.message}`); console.log(`  FAIL: audio scenario crashed: ${e.message}`);
    } finally { await browser.close(); }
  },

  // 6. Gallery of every character, enemy variant and boss for visual review.
  async gallery(server) {
    await withPage(server, 'seed=1&skipTo=gallery', async (g) => {
      await g.step(30);
      assert((await g.screen()) === 'gallery', 'gallery screen active');
      await g.shot('30-gallery-idle');
      await g.press(0, { right: true }, 2, 20); // next animation
      await g.shot('31-gallery-walk');
      await g.press(0, { right: true }, 2, 20);
      await g.shot('32-gallery-attack');
      const list = await g.enemyList();
      assert(Array.isArray(list) && list.length >= 12, `enemy registry has 10 variants + 2 bosses (got ${list && list.length})`);
      const chars = await g.characterList();
      assert(Array.isArray(chars) && chars.length === 4, `4 playable characters registered (got ${chars && chars.length})`);
    });
    // Each enemy variant fights the player: spawns, approaches, attacks, can be killed.
    const list = await new Promise((resolve) => withPage(server, 'seed=1&skipTo=gallery', async (g) => resolve(await g.enemyList())));
    for (const e of list) {
      await withPage(server, `seed=2&skipTo=gameplay&chars=2&nowaves=1&godmode=1`, async (g) => {
        await g.step(10);
        await g.spawnEnemy(e.type, e.variant, 120, 0);
        await g.step(400);
        let s = await g.summary();
        assert(s.enemies.length + (s.boss ? 1 : 0) >= 1, `${e.type}:${e.variant} spawned and alive after 400 frames`);
        const hp0 = s.boss ? s.boss.hp : (s.enemies.length ? s.enemies[0].hp : 0);
        // walk toward it and mash attack for a while
        for (let i = 0; i < 40; i++) { await g.eval(() => window.__game.facePlayerToNearestEnemy(0)); await g.press(0, { attack: true }, 2, 10); }
        s = await g.summary();
        const hp1 = s.boss ? s.boss.hp : (s.enemies.length ? s.enemies[0].hp : 0);
        assert(hp1 < hp0, `${e.type}:${e.variant} takes damage from player attacks (${hp0} -> ${hp1})`);
        await g.shot(`40-enemy-${e.type}-${e.variant}`);
      });
    }
  },
};

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const names = wanted.length ? wanted : Object.keys(scenarios);
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  server.port = server.address().port;
  console.log(`playtest server on :${server.port}`);
  const t0 = Date.now();
  for (const n of names) {
    if (!scenarios[n]) { console.log(`unknown scenario ${n}`); failures++; continue; }
    console.log(`\n== ${n} ==`);
    await scenarios[n](server);
  }
  server.close();
  console.log(`\n${results.length} checks, ${failures} failures, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
