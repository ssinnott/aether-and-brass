// Headless playthrough harness. Usage:
//   node tools/playtest.js                 # run every scenario
//   node tools/playtest.js boot combat     # run selected scenarios (boot boards select combat shields playthrough playthrough2 playthrough3 playthrough4 coop audio gallery)
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

/**
 * Two pages in ONE browser context, for the online co-op scenario. They must share a context or
 * BroadcastChannel cannot reach between them (each browser.newPage() gets its own implicit context),
 * and the pages then establish a real WebRTC data channel over loopback ICE candidates.
 */
async function withPair(server, hostParams, guestParams, fn, { viewport = { width: 1280, height: 720 } } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  const errs = [];
  const pages = [];
  try {
    for (const params of [hostParams, guestParams]) {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); if (process.env.KEEP) console.log('   [browser]', m.text()); });
      await page.goto(`http://localhost:${server.port}/index.html?autotest=1&${params}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
      pages.push(page);
    }
    await fn(pages[0], pages[1], makeApi(pages[0]), makeApi(pages[1]));
    // A scenario may deliberately close a page (testing disconnect), so skip those.
    for (const p of pages) if (!p.isClosed()) for (const e of await makeApi(p).errors()) errs.push(e);
    assert(errs.length === 0, `no runtime errors in the netplay pair ${errs.length ? JSON.stringify(errs.slice(0, 3)) : ''}`);
  } catch (e) {
    failures++; results.push(`  FAIL: netplay scenario crashed: ${e.message}`); console.log(`  FAIL: netplay scenario crashed: ${e.message}`);
    if (errs.length) console.log('   browser errors:', errs.slice(0, 5));
    try { if (pages[0]) await pages[0].screenshot({ path: path.join(SHOTS, 'netplay-crash.png') }); } catch { /* ignore */ }
  } finally {
    await browser.close();
  }
}

/** Focus a page, press ready, and wait until that page has actually registered it. A backgrounded
 * page suspends rAF, so the press must be confirmed before the next page steals focus. */
async function readyUp(page) {
  await page.bringToFront();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('KeyF');
    try {
      await page.waitForFunction(() => { const n = window.__game.game.net; return !!(n && n.lobby && n.lobby.myReady); }, null, { timeout: 1000 });
      return true;
    } catch { /* the page had not ticked yet; press again */ }
  }
  return false;
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
  // 0c. Co-op progress belongs to the PAIRING, not to either player. A new group starts on board 1
  // however far either player has got solo, the host's board choice still wins, and nothing a group
  // does can touch either player's solo save.
  async netboard(server) {
    const ROOM = 'NETBRD';
    // The host arrives on board 2 (?stage=2 is its own session key); the guest has a clean save.
    await withPair(server, `room=${ROOM}&transport=broadcast&host=1&stage=2`, `room=${ROOM}&transport=broadcast`, async (hostPage, guestPage, H, G) => {
      for (const p of [hostPage, guestPage]) await p.evaluate(() => window.__game.startLoop());
      for (const p of [hostPage, guestPage]) await p.waitForFunction(() => ((window.__game.netState() || {}).state === 'lobby'), null, { timeout: 20000 });

      const before = await guestPage.evaluate(() => window.__game.progressState());
      assert(before.isGroup && /^g:/.test(before.scope), `the lobby switched to the pairing's own progress scope (${before.scope})`);
      assert(before.unlockedCount === 1, 'a brand new group starts with exactly one board open');
      assert(before.unlocked[1] === false, 'the guest has not opened board 2 in this group');
      const hostScope = await hostPage.evaluate(() => window.__game.progressState().scope);
      assert(hostScope === before.scope, 'both peers derive the same group scope from the same two ids');
      await guestPage.waitForFunction(() => ((window.__game.game.net || {}).lobby || {}).stage === 2, null, { timeout: 10000 });
      assert(true, "the guest's lobby follows the host's board choice before the match starts");

      for (const p of [hostPage, guestPage]) assert(await readyUp(p), 'the page registered its ready press');
      for (const p of [hostPage, guestPage]) await p.waitForFunction(() => ((window.__game.netState() || {}).state === 'playing'), null, { timeout: 20000 });
      await guestPage.waitForFunction(() => ((window.__game.netState() || {}).frame || -1) > 60, null, { timeout: 20000 });

      // game.options is a copy of the boot options; beginMatch writes the session's board there.
      const stages = await Promise.all([hostPage, guestPage].map((p) => p.evaluate(() => window.__game.game.options.stage)));
      assert(stages[0] === 2 && stages[1] === 2, `both peers run the host's board (host ${stages[0]}, guest ${stages[1]})`);
      const after = await guestPage.evaluate(() => window.__game.progressState());
      assert(after.unlocked[1] === true, "the guest can play the host's board for this session");
      assert(after.solo[1] === false, "the co-op session did not open board 2 on the guest's SOLO progress");
      assert(!after.saved || !/"boards":\{".+"/.test(after.saved), `nothing was written to the guest's save on disk (${after.saved})`);
      const st = await Promise.all([hostPage, guestPage].map((p) => p.evaluate(() => window.__game.netState())));
      assert(st[0].desync === null && st[1].desync === null, 'no desync while running a board only the host had unlocked');
      await G.shot('23-netplay-shared-board');
    });
  },

  // 0b. The GUEST losing the host. This is the mirror of the netplay scenario's disconnect and it
  // is the case that hard-coding slot 1 got wrong: on the guest the remote player is slot 0, and
  // clearing both virtuals would also move the guest onto the other keyboard bindings mid-run.
  async netdrop(server) {
    const ROOM = 'NETDRP';
    await withPair(server, `room=${ROOM}&transport=broadcast&host=1`, `room=${ROOM}&transport=broadcast`, async (hostPage, guestPage, H, G) => {
      for (const p of [hostPage, guestPage]) await p.evaluate(() => window.__game.startLoop());
      for (const p of [hostPage, guestPage]) await p.waitForFunction(() => ((window.__game.netState() || {}).state === 'lobby'), null, { timeout: 20000 });
      for (const p of [hostPage, guestPage]) assert(await readyUp(p), 'the page registered its ready press');
      for (const p of [hostPage, guestPage]) await p.waitForFunction(() => ((window.__game.netState() || {}).state === 'playing'), null, { timeout: 20000 });
      await guestPage.waitForFunction(() => ((window.__game.netState() || {}).frame || -1) > 60, null, { timeout: 20000 });

      await hostPage.close();
      await guestPage.waitForFunction(() => ((window.__game.netState() || {}).state === 'ended'), null, { timeout: 20000 });
      const after = await guestPage.evaluate(() => {
        const w = window.__game.world, n = window.__game.game.net;
        return { bots: (w.players || []).map((p) => !!(p && p.bot)), slot: n.localSlot, screen: window.__game.screen(), errs: window.__game.errors.length };
      });
      assert(after.slot === 1, 'the guest owns slot 1');
      assert(after.bots[0] === true, 'the guest hands the REMOTE slot (0) to the bot, not its own character');
      assert(after.bots[1] === false, "the guest's own character is still player-controlled");
      assert(after.screen === 'gameplay' && after.errs === 0, 'the guest keeps playing with no errors');

      // ...and the guest must still be driving its own character from its own keyboard (WASD),
      // not the P2 bindings it would fall back to if both virtuals had simply been cleared.
      await guestPage.bringToFront();
      const x0 = await guestPage.evaluate(() => Math.round(window.__game.world.players[1].x));
      await guestPage.keyboard.down('KeyD');
      await guestPage.evaluate(() => new Promise((r) => setTimeout(r, 900)));
      await guestPage.keyboard.up('KeyD');
      const x1 = await guestPage.evaluate(() => Math.round(window.__game.world.players[1].x));
      assert(x1 > x0, `the guest still moves on its own WASD keys after the host vanished (${x0} -> ${x1})`);
    });
  },

  // 0. Online co-op end to end: two pages, a real WebRTC data channel, a synchronised match.
  async netplay(server) {
    const ROOM = 'NETTST';
    await withPair(server, `room=${ROOM}&transport=broadcast&host=1`, `room=${ROOM}&transport=broadcast`, async (hostPage, guestPage, H, G) => {
      const netState = (p) => p.evaluate(() => window.__game.netState());
      const waitNet = async (p, want, ms = 20000) => {
        await p.waitForFunction((w) => { const n = window.__game.netState(); return n && n.state === w; }, want, { timeout: ms });
      };
      // Both pages boot straight into the lobby from the ?room= invite link and connect.
      assert((await H.screen()) === 'lobby' && (await G.screen()) === 'lobby', 'an invite link boots both pages into the lobby');
      for (const p of [hostPage, guestPage]) await p.evaluate(() => window.__game.startLoop());
      await Promise.all([waitNet(hostPage, 'lobby'), waitNet(guestPage, 'lobby')]);
      const hs = await netState(hostPage), gs = await netState(guestPage);
      assert(hs.slot === 0 && gs.slot === 1, `the host owns slot 0 and the guest slot 1 (got ${hs.slot}/${gs.slot})`);
      assert(hs.room === ROOM && gs.room === ROOM, 'both peers agree on the room code');
      await H.shot('20-lobby');

      // Ready up on both sides; the host then broadcasts the session parameters.
      for (const p of [hostPage, guestPage]) assert(await readyUp(p), 'the page registered its ready press');
      await Promise.all([waitNet(hostPage, 'playing'), waitNet(guestPage, 'playing')]);
      assert(true, 'both peers reached the playing state');
      assert((await H.screen()) === 'gameplay' && (await G.screen()) === 'gameplay', 'both peers are in gameplay');

      // Let the match run under lockstep, then compare frames and desync state.
      await hostPage.waitForFunction(() => window.__game.netState().frame > 120, null, { timeout: 20000 });
      const h2 = await netState(hostPage), g2 = await netState(guestPage);
      assert(h2.desync === null && g2.desync === null, `no checksum desync after ${h2.frame} frames (host ${JSON.stringify(h2.desync)} guest ${JSON.stringify(g2.desync)})`);
      assert(Math.abs(h2.frame - g2.frame) <= h2.delay + 2, `peers stay in lockstep (host f${h2.frame}, guest f${g2.frame}, delay ${h2.delay})`);
      assert(h2.delay >= 2, `a sane input delay was negotiated (${h2.delay} frames)`);

      // Real key presses on the guest must move the guest's own character on BOTH machines.
      const posOf = async (p, slot) => (await p.evaluate((s) => { const pl = window.__game.summary().players; return pl && pl[s] ? Math.round(pl[s].x) : null; }, slot));
      const before = await posOf(hostPage, 1);
      await guestPage.bringToFront();
      await guestPage.keyboard.down('KeyD');
      await hostPage.waitForFunction((f) => window.__game.netState().frame > f, h2.frame + 90, { timeout: 20000 });
      await guestPage.keyboard.up('KeyD');
      const afterOnHost = await posOf(hostPage, 1), afterOnGuest = await posOf(guestPage, 1);
      assert(before !== null && afterOnHost !== null, 'both slots exist on the host');
      assert(afterOnHost > before, `the guest's key press moved player 2 on the HOST's machine (${before} -> ${afterOnHost})`);
      assert(Math.abs(afterOnHost - afterOnGuest) <= 60, `both machines agree on player 2's position (host ${afterOnHost}, guest ${afterOnGuest})`);
      await H.shot('21-netplay-host');
      await G.shot('22-netplay-guest');

      // Closing the guest must hand slot 2 to the bot rather than freezing the host.
      const f3 = (await netState(hostPage)).frame;
      await guestPage.close();
      await hostPage.waitForFunction(() => { const n = window.__game.netState(); return n && n.state === 'ended'; }, null, { timeout: 20000 });
      const h4 = await netState(hostPage);
      assert(h4.state === 'ended', `the host detects the disconnect (${h4.reason})`);
      const botOn = await hostPage.evaluate(() => { const p = window.__game.world && window.__game.world.players; return !!(p && p[1] && p[1].bot); });
      assert(botOn, 'slot 2 was handed to the bot so the run survives the disconnect');
      // The simulation must come off the lockstep gate and keep running on its own.
      const posA = await posOf(hostPage, 0);
      await hostPage.waitForFunction(() => window.__game.summary().screen === 'gameplay', null, { timeout: 5000 });
      await hostPage.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
      const stillFine = await hostPage.evaluate(() => window.__game.errors.length === 0 && window.__game.screen() === 'gameplay');
      assert(stillFine, 'the host keeps playing single-handed after the disconnect, with no errors');
      assert(posA !== null && f3 > 0, `the match had run ${f3} lockstep frames before the disconnect`);
    });
  },

  // 1. Title screen renders.
  async boot(server) {
    await withPage(server, 'seed=1', async (g) => {
      await g.step(120);
      assert((await g.screen()) === 'title', 'title screen is active after boot');
      await g.shot('01-title');
      await g.press(0, { attack: true }, 2, 30);
      assert((await g.screen()) === 'boardselect', 'attack on title goes to board select');
      await g.shot('02-boardselect');
      await g.press(0, { attack: true }, 2, 45);
      assert((await g.screen()) === 'select', 'confirming the open board goes to character select');
      await g.shot('02b-select');
    });
  },

  // 1b. Board select: locked boards refuse to start, clearing a board opens the next one, and that survives a reload.
  async boards(server) {
    await withPage(server, 'seed=1', async (g, page) => {
      await g.step(60);
      await g.press(0, { attack: true }, 2, 30);              // title -> board select
      assert((await g.screen()) === 'boardselect', 'START on the title opens BOARD SELECT');
      let sum = await g.summary();
      assert(sum.boards.length >= 2, `board select lists every registered board (got ${sum.boards.length})`);
      assert(sum.boards[0].unlocked, 'board 1 is open on a fresh save');
      assert(!sum.boards[1].unlocked, 'board 2 is locked on a fresh save');
      await g.shot('04-boardselect-locked');
      // moving onto a locked board and confirming must refuse rather than start a run
      await g.press(0, { right: true }, 2, 10);
      sum = await g.summary();
      assert(sum.cursor === 1, 'right moves the cursor onto board 2');
      await g.press(0, { attack: true }, 2, 20);
      assert((await g.screen()) === 'boardselect', 'confirming a locked board does not start a run');
      await g.shot('05-boardselect-denied');
      // the open board still starts
      await g.press(0, { left: true }, 2, 10);
      await g.press(0, { attack: true }, 2, 45);
      assert((await g.screen()) === 'select', 'confirming an open board goes to character select');
      // record a clear the way the results screen does, then reload: the unlock has to be on disk, not in memory
      await page.evaluate(() => window.__game.progress.markCleared('stage1', { score: 12345, rank: 'B' }));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
      await g.step(60);
      await g.press(0, { attack: true }, 2, 30);
      assert((await g.screen()) === 'boardselect', 'the title still opens BOARD SELECT after a reload');
      sum = await g.summary();
      assert(sum.boards[0].cleared, 'board 1 reads as cleared after a reload');
      assert(sum.boards[1].unlocked, 'clearing board 1 opens board 2, and the unlock survives a reload');
      await g.shot('06-boardselect-unlocked');
      await g.press(0, { right: true }, 2, 10);
      await g.press(0, { attack: true }, 2, 45);
      assert((await g.screen()) === 'select', 'the newly opened board can be started');
    });
    // the results screen names the board that was actually played and announces what the clear opened
    await withPage(server, 'seed=1&skipTo=results', async (g) => {
      await g.step(240);
      const sum = await g.summary();
      assert(sum.screen === 'results', 'results screen reachable for the unlock check');
      assert(sum.stageId === 'stage1', `results knows which board was played (got ${sum.stageId})`);
      assert(sum.unlockedStageId === 'stage2', `clearing board 1 reports board 2 as newly opened (got ${sum.unlockedStageId})`);
      await g.shot('07-results-unlock');
    });
    // dismissing a clear that opened a board hands off to BOARD SELECT and plays the reveal on that plaque
    await withPage(server, 'seed=1&skipTo=results', async (g) => {
      await g.step(240);                                      // let the rows roll and the rank land
      await g.press(0, { start: true }, 2, 20);               // dismiss the plaque
      assert((await g.screen()) === 'boardselect', 'dismissing an unlocking clear goes to BOARD SELECT');
      let sum = await g.summary();
      assert(sum.revealing === true, 'the reveal is running on arrival');
      assert(sum.revealIndex === 1, `the reveal targets the board that just opened (got ${sum.revealIndex})`);
      await g.step(20); await g.shot('08-reveal-rattle');
      await g.step(55); await g.shot('09-reveal-doors');
      await g.step(45); await g.shot('10-reveal-name');
      await g.step(40); await g.shot('11-reveal-stamp');
      await g.step(45);
      sum = await g.summary();
      assert(sum.revealing === false, 'the reveal finishes and hands back to normal selection');
      assert((await g.screen()) === 'boardselect', 'the selector stays up once the reveal is done');
      await g.press(0, { attack: true }, 2, 45);
      assert((await g.screen()) === 'select', 'the board the reveal just opened starts a run');
    });
    // the flourish is skippable
    await withPage(server, 'seed=1&skipTo=results', async (g) => {
      await g.step(240);
      await g.press(0, { start: true }, 2, 20);
      await g.step(20);
      await g.press(0, { attack: true }, 2, 6);
      const sum = await g.summary();
      assert(sum.revealing === false, 'attack skips the reveal flourish');
      assert((await g.screen()) === 'boardselect', 'skipping the reveal leaves the selector up');
    });
    // ?unlockall=1 opens every board for the page load; ?resetprogress=1 wipes the save again
    await withPage(server, 'seed=1&unlockall=1', async (g) => {
      await g.step(60);
      await g.press(0, { attack: true }, 2, 30);
      const sum = await g.summary();
      assert(sum.boards.every((b) => b.unlocked), '?unlockall=1 opens every board');
    });
    await withPage(server, 'seed=1', async (g, page) => {
      await g.step(30);
      await page.evaluate(() => window.__game.progress.markCleared('stage1', { score: 999, rank: 'C' }));
      await page.goto(page.url() + '&resetprogress=1', { waitUntil: 'load' });
      await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
      await g.step(60);
      await g.press(0, { attack: true }, 2, 30);
      const sum = await g.summary();
      assert(!sum.boards[1].unlocked, '?resetprogress=1 clears the saved unlocks');
    });
  },

  // 2. Character select -> intro -> gameplay for each character.
  async select(server) {
    for (let c = 0; c < CHARACTER_COUNT; c++) {
      await withPage(server, 'seed=1', async (g) => {
        await g.step(60);
        await g.press(0, { attack: true }, 2, 20);           // title -> board select
        await g.press(0, { attack: true }, 2, 45);           // board select -> character select
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

  // 3b. Shields (game/shield.js): every hero carries one, it is spent before hp, it refills after the
  // wait and only what overflows a broken shield reaches the health bar.
  async shields(server) {
    for (let c = 0; c < CHARACTER_COUNT; c++) {
      await withPage(server, `seed=1&skipTo=gameplay&chars=${c}&nowaves=1`, async (g) => {
        await g.step(10);
        const cfg = await g.eval(() => { const p = window.__game.world.players[0]; return p.traits.shield ? { ...p.traits.shield } : null; });
        assert(!!cfg && cfg.max > 0, `character ${c} has a shield (${cfg ? cfg.max : 'none'})`);
        if (!cfg) return;
        const hurt = (dmg, type) => g.eval((d) => { window.__game.world.players[0].takeHit({ damage: d.dmg, type: d.type }, null); }, { dmg, type });
        const p0 = (await g.summary()).players[0];
        assert(p0.shield === p0.shieldMax, `character ${c} spawns with a full shield (${p0.shield}/${p0.shieldMax})`);

        // a hit smaller than the pool never reaches hp
        await hurt(Math.max(1, Math.floor(cfg.max / 2)), 'light');
        await g.step(4);
        const p1 = (await g.summary()).players[0];
        assert(p1.hp === p0.hp, `character ${c} takes no hp damage while the shield holds (${p0.hp} -> ${p1.hp})`);
        assert(p1.shield < p0.shield, `character ${c} spends shield instead (${p0.shield} -> ${p1.shield})`);
        if (c === 0) await g.shot('04b-shields');   // the HUD strip, half spent

        // the refill waits `delay` frames, then comes back
        await g.step(Math.max(1, cfg.delay - 20));
        const p2 = (await g.summary()).players[0];
        assert(p2.shield === p1.shield, `character ${c} does not refill during the wait (${p2.shield})`);
        await g.step(30 + Math.ceil(cfg.max / cfg.regen));
        const p3 = (await g.summary()).players[0];
        assert(p3.shield === p3.shieldMax, `character ${c} refills to full when left alone (${p3.shield}/${p3.shieldMax})`);

        // more than the pool: the shield breaks and the rest lands on hp
        await hurt(cfg.max + 20, 'heavy');
        await g.step(4);
        const p4 = (await g.summary()).players[0];
        assert(p4.shield === 0, `character ${c} shield breaks under a bigger hit (${p4.shield})`);
        assert(p4.hp < p3.hp, `character ${c} overflow reaches hp (${p3.hp} -> ${p4.hp})`);
        // and a broken shield stays down for the longer wait
        await g.step(cfg.delay);
        const p5 = (await g.summary()).players[0];
        assert(p5.shield === 0, `character ${c} broken shield waits out breakDelay (${p5.shield} after ${cfg.delay}f)`);
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

  async playthrough3(server) {
    await withPage(server, 'seed=11&skipTo=gameplay&stage=3&chars=0&bot=1&godmode=1', async (g) => {
      const MAX = 40000, CHUNK = 600;
      let frames = 0, lastSection = -1, sawMidboss = false, sawBoss = false, lastX = -1, stuckSince = 0;
      while (frames < MAX) {
        await g.step(CHUNK); frames += CHUNK;
        const s = await g.summary();
        if (s.sectionIndex !== lastSection) { lastSection = s.sectionIndex; await g.shot(`60-stage3-section-${s.sectionIndex}`); console.log(`   section ${s.sectionIndex} at frame ${frames} (x=${Math.round(s.cameraX)})`); }
        if (s.boss && s.boss.kind === 'midboss' && !sawMidboss) { sawMidboss = true; await g.shot('61-stage3-midboss'); }
        if (s.boss && s.boss.kind === 'boss' && !sawBoss) { sawBoss = true; await g.shot('62-stage3-boss'); }
        if (Math.abs(s.cameraX - lastX) < 1 && !s.boss && !s.locked) stuckSince += CHUNK; else stuckSince = 0;
        lastX = s.cameraX;
        if (s.screen === 'results') { await g.shot('63-stage3-results'); break; }
        if (s.screen === 'gameover') { assert(false, 'bot should not reach game over in godmode'); break; }
        if (stuckSince > 6000) { await g.shot('crash-stuck-stage3'); assert(false, `bot stuck at x=${Math.round(s.cameraX)} for 6000 frames (screen=${s.screen}, enemies=${s.enemies.length})`); break; }
      }
      const s = await g.summary();
      assert(sawMidboss, 'stage 3 mid-boss appeared during playthrough');
      assert(sawBoss, 'stage 3 final boss appeared during playthrough');
      assert(s.screen === 'results', `stage 3 results reached within ${MAX} frames (got ${s.screen}, frames=${frames}, x=${Math.round(s.cameraX)}, section=${s.sectionIndex})`);
      console.log(`   stage 3 playthrough finished in ${frames} frames, wavesCleared=${s.wavesCleared}`);
    });
  },

  async playthrough4(server) {
    await withPage(server, 'seed=13&skipTo=gameplay&stage=4&chars=0&bot=1&godmode=1', async (g) => {
      const MAX = 40000, CHUNK = 600;
      let frames = 0, lastSection = -1, sawMidboss = false, sawBoss = false, lastX = -1, stuckSince = 0;
      while (frames < MAX) {
        await g.step(CHUNK); frames += CHUNK;
        const s = await g.summary();
        if (s.sectionIndex !== lastSection) { lastSection = s.sectionIndex; await g.shot(`70-stage4-section-${s.sectionIndex}`); console.log(`   section ${s.sectionIndex} at frame ${frames} (x=${Math.round(s.cameraX)})`); }
        if (s.boss && s.boss.kind === 'midboss' && !sawMidboss) { sawMidboss = true; await g.shot('71-stage4-midboss'); }
        if (s.boss && s.boss.kind === 'boss' && !sawBoss) { sawBoss = true; await g.shot('72-stage4-boss'); }
        if (Math.abs(s.cameraX - lastX) < 1 && !s.boss && !s.locked) stuckSince += CHUNK; else stuckSince = 0;
        lastX = s.cameraX;
        if (s.screen === 'results') { await g.shot('73-stage4-results'); break; }
        if (s.screen === 'gameover') { assert(false, 'bot should not reach game over in godmode'); break; }
        if (stuckSince > 6000) { await g.shot('crash-stuck-stage4'); assert(false, `bot stuck at x=${Math.round(s.cameraX)} for 6000 frames (screen=${s.screen}, enemies=${s.enemies.length})`); break; }
      }
      const s = await g.summary();
      assert(sawMidboss, 'stage 4 mid-boss appeared during playthrough');
      assert(sawBoss, 'stage 4 final boss appeared during playthrough');
      assert(s.screen === 'results', `stage 4 results reached within ${MAX} frames (got ${s.screen}, frames=${frames}, x=${Math.round(s.cameraX)}, section=${s.sectionIndex})`);
      console.log(`   stage 4 playthrough finished in ${frames} frames, wavesCleared=${s.wavesCleared}`);
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
