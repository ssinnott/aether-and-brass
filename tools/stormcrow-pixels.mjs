// TRUE PIXEL CENSUS for the Stormcrow RANK LADDER (stormcrowRig.js): the measurement stormcrowRig's rank note is
// written against, run the same way tools/chandler-pixels.mjs runs the Chandlery's company ladder.
// Every keyframe of every animation of every variant is drawn on a flat magenta key with no sheet chrome, then:
//   actorPx  painted pixels (anything that is not the key or a shadow over it)
//   ink%     share of them that is EXACTLY build.outline -- the crisp line the models are supposed to carry
//   rankPx   pixels carrying that rate's own rank colour (armband, hat band, brow strap, cuff, trouser stripe)
// THE LADDER IS JUDGED ON SHARE: the five rates are five different sizes, so raw counts measure the rig and not the
// rank. It has to climb crimper -> marine, or a rate-3 line trooper out-signals the rate-4 elite above him.
//   NODE_PATH=/opt/node22/lib/node_modules node tools/stormcrow-pixels.mjs [variant,variant]
import { createRequire } from 'node:module';
import { createServer } from './server.js';
const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const c of ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright']) { try { return require(c); } catch { /* next */ } }
  throw new Error('Playwright not found (set NODE_PATH to the global node_modules)');
}
const { chromium } = loadPlaywright();
const { CROW } = await import('../src/content/enemies/stormcrowRig.js');
const { getEnemyDef } = await import('../src/content/enemies/index.js');
// RATE ORDER, not alphabetical and not the registry's: bandana -> slouch hat -> bald head with a loupe -> sealed
// keel visor -> sealed iron muzzle (stormcrowKit.js header). The ladder is only monotone in this order.
const wanted = (process.argv[2] || 'crimper,corsair,bosun,galewright,marine').split(',');

const server = createServer();
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
await page.goto(`http://localhost:${port}/tools/sheet.html?enemy=stormcrow:marine&mode=closeup&zoom=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__sheet && window.__sheet.ready, null, { timeout: 60000 });

const rows = [];
console.log('variant           actorPx    ink%   rankPx   rank%   rank hex');
for (const v of wanted) {
  const r = await page.evaluate(async ({ variant, outline, clan }) => {
    const { buildRig, drawRig } = await import('/src/art/rig.js');
    const { makePose } = await import('/src/art/poses.js');
    const { getEnemyDef } = await import('/src/content/enemies/index.js');
    const def = getEnemyDef('stormcrow', variant);
    const rig = buildRig(def.build || {});
    const W = 200, H = 220;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    const hx = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const o = hx(outline), c = hx(clan);
    let actor = 0, ink = 0, clanPx = 0;
    for (const name of Object.keys(def.anims || {})) {
      const frames = (def.anims[name] && def.anims[name].frames) || [];
      for (const f of frames) {
        const pose = makePose(f && f.pose);
        ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, W, H);
        drawRig(ctx, rig, pose, { x: W / 2, y: H - 40, facing: 1 });
        rig.tick++; rig.chainFrame = rig.tick;
        const d = ctx.getImageData(0, 0, W, H).data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 1] === 0 && d[i] === d[i + 2]) continue;   // the key, and any shadow laid over it
          actor++;
          if (d[i] === o[0] && d[i + 1] === o[1] && d[i + 2] === o[2]) ink++;
          if (d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2]) clanPx++;
        }
      }
    }
    return { actor, ink, clanPx };
  }, { variant: v, outline: CROW.outline, clan: (getEnemyDef('stormcrow', v).build.palette || {}).rank || getEnemyDef('stormcrow', v).build.clan });
  rows.push({ v, ...r });
  console.log(`${v.padEnd(17)}${String(r.actor).padStart(8)}  ${(100 * r.ink / r.actor).toFixed(2).padStart(5)}  ${String(r.clanPx).padStart(7)}  ${(100 * r.clanPx / r.actor).toFixed(3).padStart(6)}   ${(getEnemyDef('stormcrow', v).build.palette || {}).rank || getEnemyDef('stormcrow', v).build.clan}`);
}
// The ladder is judged on SHARE, not on raw pixels: the five rates are five different sizes (the Marine is a 519k
// pixel slab and the Galewright a 210k one), so raw counts measure the rig, not the rank. Share is what a player
// reads -- how much of THIS man is his rank colour.
const ladder = rows.map((r) => 100 * r.clanPx / r.actor);
console.log(`\nrank ladder (rank % of actor px, crimper -> marine): ${ladder.map((x) => x.toFixed(3)).join(' / ')}  ${ladder.every((x, i) => !i || x > ladder[i - 1]) ? 'MONOTONE' : 'NOT MONOTONE'}`);
await browser.close();
server.close();
