// THE ARCADE scenario for tools/playtest.js (src/engine/arcade.ts). Receives the harness helpers so this file shares
// one assert and one results list with it -- the same pattern as tools/scenarios/roomcode.js.
//
// github.com/ssinnott/arcade frames this page beside its other games. What this pins down:
//   A -- standalone, and in any frame that is NOT the arcade, the title is exactly the game's own six rows with
//        OPTIONS last, and the page says nothing to anybody;
//   B -- framed by the arcade, BACK TO ARCADE is a seventh row under OPTIONS, and choosing it asks the arcade for
//        its shelf without the game itself going anywhere;
//   C -- a room hosted in the arcade hands out the arcade's link to this game, and tells the arcade its code.
//
// The arcade here is a stand-in, tools/arcade-host.html: a page that frames index.html under a given name and
// keeps every message the frame posts it. Which origin it is served from is the other half of what the game
// checks, and 127.0.0.1 is another origin than the localhost the game itself is on.
import { launch } from '../browser.js';

const ARCADE_ROW = 'BACK TO ARCADE';
/** The arcade's link to this game with the room code left off, as the arcade names the frame (engine/arcade.ts). */
const linkFor = (server) => `http://localhost:${server.port}/#aether-and-brass?room=`;

/**
 * @param {{ withPage: Function, assert: Function, makeApi: Function }} deps
 * @returns {{ arcade: Function }}
 */
export function arcadeScenarios({ withPage, assert, makeApi }) {
  /** Open the stand-in on `host`, wait for the game in its frame, and hand `fn` the frame's api and the page. */
  async function withFrame(server, { host = 'localhost', name, params = 'seed=1' }, fn) {
    const browser = await launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    const src = `http://localhost:${server.port}/index.html?autotest=1&${params}`;
    const at = `http://${host}:${server.port}/tools/arcade-host.html?` + new URLSearchParams({ name, src });
    try {
      await page.goto(at, { waitUntil: 'load' });
      const frame = page.frames().find((f) => f !== page.mainFrame());
      await frame.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
      const g = { ...makeApi(frame), shot: makeApi(page).shot };
      await fn(g, { page, frame, got: () => page.evaluate(() => window.__got.map((m) => m.data)) });
      const all = [...await g.errors(), ...errs];
      assert(all.length === 0, `no errors in the frame or around it (${name} from ${host}) ${all.length ? JSON.stringify(all.slice(0, 3)) : ''}`);
    } catch (e) {
      assert(false, `arcade scenario crashed (${name} from ${host}): ${e.message}`);
    } finally {
      await browser.close();
    }
  }

  /** Wait until the page has been posted a message of `type`, and return it (or null after a few seconds). */
  async function posted(page, type) {
    try { await page.waitForFunction((t) => window.__got.some((m) => m.data && m.data.type === t), type, { timeout: 5000 }); } catch { return null; }
    return page.evaluate((t) => window.__got.find((m) => m.data && m.data.type === t), type);
  }

  return {
    async arcade(server) {
      // ---- A: a page of its own ----------------------------------------------------------
      await withPage(server, 'seed=1', async (g) => {
        await g.step(20);
        const s = await g.summary();
        assert(!(await g.eval(() => window.__game.arcade.active)), 'a page of its own is not in the arcade');
        assert(s.rows === 6 && s.menu[5] === 'OPTIONS' && !s.menu.includes(ARCADE_ROW),
          `and its title is the game's own six rows, OPTIONS last (${s.menu.join()})`);
      });

      // ---- A: framed, but not by the arcade ----------------------------------------------
      const others = [
        ['a same-site page that names the frame anything else', 'localhost', 'game'],
        ['another origin using the arcade name', '127.0.0.1', 'arcade:' + linkFor(server)],
        ['an arcade name whose link points at another site', 'localhost', 'arcade:https://example.com/#aether-and-brass?room='],
      ];
      for (const [label, host, name] of others) {
        await withFrame(server, { host, name }, async (g, { frame, got }) => {
          await g.step(20);
          const s = await g.summary();
          assert(!(await frame.evaluate(() => window.__game.arcade.active)), `${label}: is not the arcade`);
          assert(s.rows === 6 && !s.menu.includes(ARCADE_ROW), `${label}: no ${ARCADE_ROW} row (${s.menu.join()})`);
          assert((await got()).length === 0, `${label}: is told nothing (${JSON.stringify(await got())})`);
        });
      }

      // ---- B: the arcade's row, and the way back ------------------------------------------
      await withFrame(server, { name: 'arcade:' + linkFor(server) }, async (g, { page, frame }) => {
        await g.step(60);
        assert(await frame.evaluate(() => window.__game.arcade.active), 'framed by the arcade, the game knows it');
        const hello = await posted(page, 'arcade:hello');
        assert(!!hello && hello.origin === `http://localhost:${server.port}`, `and says hello, so the arcade can drop its own back button (${JSON.stringify(hello)})`);
        let s = await g.summary();
        assert(s.rows === 7 && s.menu[5] === 'OPTIONS' && s.menu[6] === ARCADE_ROW,
          `${ARCADE_ROW} is a seventh row, under OPTIONS (${s.menu.join()})`);
        await g.shot('arcade-title');
        // the menu wraps, so one UP from START is the last row
        await g.press(0, { up: true }, 2, 6);
        s = await g.summary();
        assert(s.row === ARCADE_ROW, `the cursor reaches it (got ${s.row})`);
        await g.press(0, { attack: true }, 2, 10);
        assert(!!(await posted(page, 'arcade:exit')), 'choosing it asks the arcade for its shelf');
        assert((await g.screen()) === 'title', `and leaves the game itself alone: taking the frame away is the arcade's job (on ${await g.screen()})`);
      });

      // ---- C: a room hosted in the arcade -------------------------------------------------
      await withFrame(server, { name: 'arcade:' + linkFor(server), params: 'seed=1&host=1&transport=broadcast' }, async (g, { page, frame }) => {
        await g.step(30);
        const s = await g.summary();
        const room = await frame.evaluate(() => { const n = window.__game.netState(); return n ? n.room : ''; });
        assert(s.lobbyPhase === 'connecting' && s.isHost && !!room, `?host=1 opens a room and waits in it (got ${s.lobbyPhase}, ${room})`);
        assert(s.invite === linkFor(server) + room, `its invite opens the arcade at this game (got ${s.invite})`);
        const told = await posted(page, 'arcade:room');
        assert(!!told && told.data.room === room, `and the arcade is told the code for its address bar (${JSON.stringify(told && told.data)})`);
      });
    },
  };
}
