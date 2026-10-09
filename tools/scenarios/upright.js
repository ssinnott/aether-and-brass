// THE UPRIGHT PHONE scenario for tools/playtest.js (src/engine/sideways.ts and index.html's quarter turn). Receives
// the harness helpers so this file shares one assert and one results list with it -- the same pattern as
// tools/scenarios/arcade.js.
//
// A phone held upright used to be shown TURN YOUR DEVICE SIDEWAYS, which a phone with its rotation lock on could
// never get past: the page stays upright however the phone is held. Now the game itself is drawn on its side. What
// this pins down:
//   A -- held upright: no notice left in the page, and the canvas a quarter turn clockwise, 16:9 with its long side
//        down the screen, as wide as the phone and all of it on screen;
//   B -- a thumb is measured through the turn: a press where ATK is drawn holds attack, and the stick dragged toward
//        the player's right - DOWN the upright screen - is right and nothing else, and walks the hero right;
//   C -- the phone turned with its rotation unlocked: the page goes landscape, nothing is turned, and ATK is under
//        the thumb in its landscape place again.
import { launch } from '../browser.js';

/** A phone held upright, as most of them are picked up; touch and a coarse pointer, so it is a phone to the page. */
const UPRIGHT = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };
/** Where ATK sits in internal 640x360 px (src/engine/touch.ts BUTTONS), and a spot on the stick's side of it. */
const ATK = { x: 588, y: 306 }, STICK_AT = { x: 150, y: 250 };

/** Internal px -> client px through the canvas as it is laid out: turned (x down the screen, y right to left) or not. */
function clientOf(page, at) {
  return page.evaluate(([x, y]) => {
    const el = document.getElementById('game'), r = el.getBoundingClientRect();
    if (getComputedStyle(el).transform === 'none') return { x: r.left + x * r.width / 640, y: r.top + y * r.height / 360 };
    return { x: r.right - y * r.width / 360, y: r.top + x * r.height / 640 };
  }, [at.x, at.y]);
}
/** A finger: a real PointerEvent on the canvas, through engine/touch.ts's own listeners. */
function finger(page, type, at, id = 1) {
  return page.evaluate(([t, x, y, pid]) => {
    document.getElementById('game').dispatchEvent(new PointerEvent(t, {
      pointerId: pid, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y,
    }));
  }, [type, at.x, at.y, id]);
}
/** The directions and the attack player 1 is holding, as engine/input.ts has them after the last step. */
const holding = (page) => page.evaluate(() => ['left', 'right', 'up', 'down', 'attack'].filter((a) => window.__game.input.held(0, a)));

/**
 * @param {{ assert: Function, makeApi: Function }} deps
 * @returns {{ upright: Function }}
 */
export function uprightScenarios({ assert, makeApi }) {
  /** One upright phone on `params`, handing `fn` the harness api and the page. */
  async function withPhone(server, params, fn) {
    const browser = await launch();
    const page = await browser.newPage(UPRIGHT);
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    try {
      await page.goto(`http://localhost:${server.port}/index.html?autotest=1&${params}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
      const g = makeApi(page);
      await fn(g, page);
      const all = [...await g.errors(), ...errs];
      assert(all.length === 0, `no errors on the upright phone (${params}) ${all.length ? JSON.stringify(all.slice(0, 3)) : ''}`);
    } catch (e) {
      assert(false, `upright scenario crashed (${params}): ${e.message}`);
    } finally {
      await browser.close();
    }
  }

  return {
    async upright(server) {
      await withPhone(server, 'seed=1&skipTo=gameplay&chars=0&nowaves=1&godmode=1', async (g, page) => {
        await g.step(120);

        // ---- A: no notice, the game itself on its side ----------------------------------------
        assert(await page.evaluate(() => !document.getElementById('rotate')), 'there is no "turn your device" notice left in the page');
        const look = await page.evaluate(() => {
          const el = document.getElementById('game'), r = el.getBoundingClientRect();
          return { t: getComputedStyle(el).transform, top: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
        });
        const m = /^matrix\(([^)]*)\)$/.exec(look.t);
        const [a, b, c, d] = m ? m[1].split(',').map(Number) : [1, 0, 0, 1];
        assert(!!m && Math.abs(a) < 1e-6 && b === 1 && c === -1 && Math.abs(d) < 1e-6, `held upright, the game is drawn on its side: a quarter turn clockwise (${look.t})`);
        assert(Math.abs(look.h / look.w - 16 / 9) < 0.01, `with its long side down the screen (${look.w.toFixed(0)} x ${look.h.toFixed(0)})`);
        assert(Math.abs(look.w - look.vw) < 1 && look.top >= 0 && look.top + look.h <= look.vh + 0.5,
          `as wide as the phone, and all of it on the screen (${look.w.toFixed(0)} x ${look.h.toFixed(0)} at ${look.top.toFixed(0)}, in ${look.vw} x ${look.vh})`);
        await g.shot('96-upright-gameplay');

        // ---- B: a thumb is measured through the turn ---------------------------------------
        const atk = await clientOf(page, ATK);
        await finger(page, 'pointerdown', atk);
        await g.step(2);
        assert((await holding(page)).join() === 'attack', `a press where ATK is drawn on the turned game holds attack (${(await holding(page)).join()})`);
        await finger(page, 'pointerup', atk);
        await g.step(2);
        const x0 = await page.evaluate(() => window.__game.world.players[0].x);
        const home = await clientOf(page, STICK_AT);
        await finger(page, 'pointerdown', home, 2);
        await finger(page, 'pointermove', { x: home.x, y: home.y + 18 }, 2);
        await g.step(2);
        assert((await holding(page)).join() === 'right', `the stick dragged down the upright screen - the player's right - is right and nothing else (${(await holding(page)).join()})`);
        await g.step(30);
        const x1 = await page.evaluate(() => window.__game.world.players[0].x);
        assert(x1 > x0, `and the hero walks right with it (${Math.round(x0)} -> ${Math.round(x1)})`);
        await finger(page, 'pointerup', { x: home.x, y: home.y + 18 }, 2);
        await g.step(2);

        // ---- C: turned, with the phone's rotation unlocked ----------------------------------
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForFunction(() => {
          const el = document.getElementById('game');
          return getComputedStyle(el).transform === 'none' && el.style.width === '640px';
        }, null, { timeout: 5000 });
        await g.step(2);
        const flat = await clientOf(page, ATK);
        await finger(page, 'pointerdown', flat, 3);
        await g.step(2);
        assert((await holding(page)).join() === 'attack', `landscape, nothing is turned and ATK is under the thumb again (${(await holding(page)).join()})`);
        await finger(page, 'pointerup', flat, 3);
        await g.step(2);
      });
    },
  };
}
