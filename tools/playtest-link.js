// SOURCE CODE scenario for tools/playtest.js. Receives the harness helpers so the two files share one
// browser, one assert and one results list (same pattern as tools/playtest-options.js).
//
// Covers the title's link back to the repository (src/engine/links.ts + screens/title.js): the row sits
// second from last so OPTIONS keeps the bottom of the menu, following it opens the repository URL in a
// new tab without leaving the title, a refused popup says so instead of pretending, the address is drawn
// inside the view, and a real mouse click on that address opens the same URL.
//
// `window.open` is stubbed in the page so the run never actually navigates anywhere; the stub records
// what it was asked to open, which is the only thing worth asserting here.
/**
 * @param {ReturnType<typeof import('./server.js').createServer>} server
 * @param {{ withPage: Function, assert: Function }} deps
 */
export async function sourceLink(server, { withPage, assert }) {
  await withPage(server, 'seed=1', async (g, page) => {
    const up_ = () => g.press(0, { up: true }, 2, 6);
    const atk = () => g.press(0, { attack: true }, 2, 10);
    const stubOpen = (result) => g.eval((ok) => {
      window.__opened = [];
      window.open = (url) => { window.__opened.push(url); return ok ? { opener: null } : null; };
    }, result);
    const opened = () => g.eval(() => window.__opened.slice());

    await g.step(60);
    await stubOpen(true);

    // The menu wraps, so two ups from START land on the second-from-last row whatever precedes it --
    // the same reason playtest-options.js reaches OPTIONS with one.
    let s = await g.summary();
    assert(s.row === 'START', `the title opens on START (got ${s.row})`);
    await up_();
    s = await g.summary();
    assert(s.row === 'OPTIONS', 'OPTIONS is still the last row of the title menu');
    await up_();
    s = await g.summary();
    assert(s.row === 'SOURCE CODE', `SOURCE CODE sits directly above OPTIONS (got ${s.row})`);

    await atk();
    assert((await g.screen()) === 'title', 'following the link leaves the game on the title');
    let urls = await opened();
    assert(urls.length === 1 && /^https:\/\/github\.com\//.test(urls[0]), `SOURCE CODE opens a github.com address (got ${JSON.stringify(urls)})`);
    assert(urls[0] === s.link, 'and it is the address the title draws');
    s = await g.summary();
    assert(/OPENED/.test(s.notice), `the title reports the new tab (got "${s.notice}")`);
    await g.shot('95-title-source');

    // The address is drawn where a mouse can reach it, and a real click on it opens the same URL. This
    // is the path that survives a popup blocker: it runs inside the click rather than in the fixed step.
    const z = s.linkZone;
    assert(z.x >= 0 && z.y >= 0 && z.x + z.w <= 640 && z.y + z.h <= 360, `the clickable address is inside the view (${JSON.stringify(z)})`);
    const pt = await g.eval(() => {
      const el = document.getElementById('game');
      const r = el.getBoundingClientRect();
      const zz = window.__game.summary().linkZone;
      return { x: r.left + (zz.x + zz.w / 2) * (r.width / 640), y: r.top + (zz.y + zz.h / 2) * (r.height / 360) };
    });
    await page.mouse.click(pt.x, pt.y);
    await g.step(2);
    urls = await opened();
    assert(urls.length === 2 && urls[1] === s.link, `a mouse click on the drawn address opens it too (got ${JSON.stringify(urls)})`);
    assert((await g.screen()) === 'title', 'a click on the address does not disturb the screen stack');

    // A blocked popup must read as blocked: the row says so, and the address stays on screen to copy.
    await stubOpen(false);
    await atk();
    s = await g.summary();
    assert((await opened()).length === 1, 'a refused window.open is still one attempt, not a retry loop');
    assert(/BLOCKED/.test(s.notice), `a blocked tab is reported honestly (got "${s.notice}")`);

    // Leaving the title releases the zone: a click where the address used to be opens nothing.
    await g.press(0, { down: true }, 2, 6);
    await g.press(0, { down: true }, 2, 6);
    s = await g.summary();
    assert(s.row === 'START', 'two downs wrap back to START');
    await stubOpen(true);
    await atk();
    await g.step(30); // START fades out before it replaces the screen (title.js fadeTo 0.08/frame)
    assert((await g.screen()) === 'boardselect', 'START still opens BOARD SELECT');
    await page.mouse.click(pt.x, pt.y);
    await g.step(2);
    assert((await opened()).length === 0, 'the address stops being clickable once the title is gone');
  });
}
