// TRUE PIXEL CENSUS for the Chandlery, the measurement the Stormcrow rank ladder is judged by (stormcrowRig.js:22).
// Every keyframe of every animation of every variant is drawn on a flat magenta key with no sheet chrome, then:
//   actorPx  painted pixels (anything that is not the key or a shadow over it)
//   ink%     share of them that is EXACTLY build.outline -- the crisp line the models are supposed to carry
//   clanPx   share carrying that variant's own company-ladder colour (wax seal, band, spine, cockade, lashing)
// COUNT AND AREA MUST AGREE: the ladder has to climb fodder -> grabber, or an elite is out-signalled by a grunt.
//   NODE_PATH=/opt/node22/lib/node_modules node tools/chandler-pixels.mjs [variant,variant]
import { createRequire } from 'node:module';
import { createServer } from './server.js';
const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const c of ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright']) { try { return require(c); } catch { /* next */ } }
  throw new Error('Playwright not found (set NODE_PATH to the global node_modules)');
}
const { chromium } = loadPlaywright();
const { CH, CLAN } = await import('../src/content/enemies/chandlerRig.js');
const wanted = (process.argv[2] || 'wickboy,tallyman,limeburner,purser,resurrectionist').split(',');

const server = createServer();
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
await page.goto(`http://localhost:${port}/tools/sheet.html?enemy=chandler:purser&mode=closeup&zoom=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__sheet && window.__sheet.ready, null, { timeout: 60000 });

const rows = [];
console.log('variant           actorPx    ink%   clanPx   clan%   clan hex');
for (const v of wanted) {
  const r = await page.evaluate(async ({ variant, outline, clan }) => {
    const { buildRig, drawRig } = await import('/src/art/rig.js');
    const { makePose } = await import('/src/art/poses.js');
    const { getEnemyDef } = await import('/src/content/enemies/index.js');
    const def = getEnemyDef('chandler', variant);
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
  }, { variant: v, outline: CH.outline, clan: CLAN[v] });
  rows.push({ v, ...r });
  console.log(`${v.padEnd(17)}${String(r.actor).padStart(8)}  ${(100 * r.ink / r.actor).toFixed(2).padStart(5)}  ${String(r.clanPx).padStart(7)}  ${(100 * r.clanPx / r.actor).toFixed(3).padStart(6)}   ${CLAN[v]}`);
}
const ladder = rows.map((r) => r.clanPx);
console.log(`\ncompany ladder (clan px, fodder -> grabber): ${ladder.join(' / ')}  ${ladder.every((x, i) => !i || x > ladder[i - 1]) ? 'MONOTONE' : 'NOT MONOTONE'}`);
await browser.close();
server.close();
