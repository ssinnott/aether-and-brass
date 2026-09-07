// Headless contact-sheet capture (Playwright). Usage:
//   NODE_PATH=/opt/node22/lib/node_modules node tools/sheet-capture.js <outDir> [char=brunhild | enemy=typeA:grunt] [jobs]
//   jobs (comma list, default all): anims,walk,attacks,closeup,cast,ingame,bench (+ debug: in-game shot with the ?debug=1 hitbox overlay)
//   extra args: "<sheet query>><file.png>" ad-hoc sheets, e.g. "mode=anims&anims=hurt,getup&zoom=4>hurt.png"
// Writes sheet-anims.png, sheet-walk-run.png, sheet-attacks.png, closeup.png, cast.png, ingame.png (2x gameplay shot)
// and prints the drawRig benchmark. Character index for the in-game shot comes from the character registry order.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from './server.js';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const c of ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright']) { try { return require(c); } catch { /* next */ } }
  throw new Error('Playwright not found (set NODE_PATH to the global node_modules)');
}
const { chromium } = loadPlaywright();

const outDir = path.resolve(process.argv[2] || 'tools/screens');
const who = process.argv[3] || 'char=brunhild';
const jobs = (process.argv[4] || 'anims,walk,attacks,closeup,cast,ingame,bench').split(',');
fs.mkdirSync(outDir, { recursive: true });

const server = createServer();
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

async function shoot(params, file) {
  await page.goto(`http://localhost:${port}/tools/sheet.html?${who}&${params}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sheet && window.__sheet.ready, null, { timeout: 60000 });
  const err = await page.evaluate(() => window.__sheet.error);
  if (err) { console.log('SHEET ERROR', params, err); return; }
  const el = await page.$('#sheet');
  await el.screenshot({ path: path.join(outDir, file) });
  console.log('wrote', path.join(outDir, file));
}
const SHEETS = {
  anims: ['mode=anims&zoom=3&cols=8', 'sheet-anims.png'],
  walk: ['mode=strip&zoom=3&anims=walk,run&samples=8', 'sheet-walk-run.png'],
  attacks: ['mode=attacks&zoom=3&step=3&cols=14', 'sheet-attacks.png'],
  closeup: ['mode=closeup&zoom=6', 'closeup.png'],
  cast: ['mode=cast&zoom=3&enemies=1', 'cast.png'],
};
for (const j of jobs) if (SHEETS[j]) await shoot(SHEETS[j][0], SHEETS[j][1]);
// extra ad-hoc sheets: further args of the form "<query params>><file.png>", e.g. "mode=anims&anims=hurt,getup&zoom=4>hurt.png"
for (const extra of process.argv.slice(5)) { const [params, file] = extra.split('>'); if (params && file) await shoot(params, file); }

if (jobs.includes('ingame')) {
  const charId = who.startsWith('char=') ? who.slice(5) : 'brunhild';
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`http://localhost:${port}/index.html?autotest=1&seed=1&skipTo=gameplay&nowaves=1&chars=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
  const idx = await page.evaluate((id) => { const l = window.__game.characterList(); const i = l.findIndex((c) => c.id === id); return i < 0 ? 0 : i; }, charId);
  if (idx !== 0) {
    await page.goto(`http://localhost:${port}/index.html?autotest=1&seed=1&skipTo=gameplay&nowaves=1&chars=${idx}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
  }
  await page.evaluate(() => {
    window.__game.step(30);
    try { window.__game.spawnEnemy('typeA', 'grunt', 96, 0); } catch (e) { console.warn('spawnEnemy failed', e); }
    try { window.__game.spawnEnemy('typeB', 'goblin', 150, 30); } catch (e) { /* optional */ }
    window.__game.step(40);
  });
  await page.screenshot({ path: path.join(outDir, 'ingame.png') });
  await page.evaluate(() => { window.__game.setInput(0, { attack: true }); window.__game.step(2); window.__game.clearInput(0); window.__game.step(7); });
  await page.screenshot({ path: path.join(outDir, 'ingame-attack.png') });
  console.log('wrote', path.join(outDir, 'ingame.png'), 'and ingame-attack.png');
}
if (jobs.includes('debug')) {
  // hitbox overlay shots (?debug=1 -> world.drawDebug draws hit/hurt boxes): attack1's hit frame and the special's hit frame
  const charId = who.startsWith('char=') ? who.slice(5) : 'brunhild';
  const gotoGame = async (idx) => {
    await page.goto(`http://localhost:${port}/index.html?autotest=1&debug=1&seed=1&skipTo=gameplay&nowaves=1&chars=${idx}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 15000 });
  };
  await page.setViewportSize({ width: 1280, height: 720 });
  await gotoGame(0);
  const idx = await page.evaluate((id) => { const l = window.__game.characterList(); const i = l.findIndex((c) => c.id === id); return i < 0 ? 0 : i; }, charId);
  if (idx !== 0) await gotoGame(idx);
  await page.evaluate(() => { window.__game.step(30); try { window.__game.spawnEnemy('typeA', 'grunt', 110, 0); } catch (e) { /* optional */ } window.__game.step(20); });
  for (const [name, action, steps] of [['debug-attack1', 'attack', 7], ['debug-special', 'special', 10]]) {
    await page.evaluate(([a, n]) => {
      try { if (a === 'special' && window.__game.fillMeter) window.__game.fillMeter(0); } catch (e) { /* optional */ }
      window.__game.setInput(0, { [a]: true }); window.__game.step(1); window.__game.clearInput(0); window.__game.step(n);
    }, [action, steps]);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
    console.log('wrote', path.join(outDir, name + '.png'));
    await page.evaluate(() => window.__game.step(60));
  }
}
if (jobs.includes('bench')) {
  await page.goto(`http://localhost:${port}/tools/sheet.html?${who}&mode=closeup&zoom=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sheet && window.__sheet.ready, null, { timeout: 60000 });
  const ms = await page.evaluate(() => { window.__sheet.bench(300); return window.__sheet.bench(3000); });
  console.log(`drawRig avg: ${ms.toFixed(4)} ms`);
}
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
await browser.close();
server.close();
