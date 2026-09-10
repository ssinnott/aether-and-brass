// Balance harness: play the game with the autopilot and count who wins.
//
// tools/playtest.js asks "does the game work"; every one of its bot runs is in godmode, so it can never answer
// "is the game fair". This sweeps real runs (no godmode) across boards, difficulties, heroes, party sizes and
// autopilot styles, and reports how often the ENGINE wins — a run lost is the continue stack running out.
//
// Usage:
//   node tools/winrate.js                                   # default sweep: 4 boards x 4 heroes, solo, balanced, normal
//   node tools/winrate.js --stages 1 --styles all --seeds 8  # one board against every autopilot archetype
//   node tools/winrate.js --party 1,2 --difficulty easy,normal,hard
//   node tools/winrate.js --json out.json                   # raw per-run rows for further analysis
//
// Options (all comma-separated lists):
//   --stages 1,2,3,4          boards to play
//   --chars 0,1,2,3           hero indices; in party=2 each is paired with the next hero
//   --party 1,2               party size (2 = local co-op, both slots on autopilot)
//   --styles balanced,...     autopilot archetypes (see BOT_STYLES in src/game/bot.js), or `all`
//   --difficulty easy,normal,hard
//   --seeds N                 runs per cell (default 5)
//   --conc N                  parallel pages (default 6)
//   --max N                   frame cap per run (default 60000, ~16 min of game time)
//   --json PATH               write the raw rows
//   --quiet                   summary tables only
import fs from 'node:fs';
import { createServer } from './server.js';
import { loadPlaywright } from './browser.js';
import { BOT_STYLES } from '../src/game/bot.js';

const { chromium } = loadPlaywright();

const CHUNK = 600;          // frames per step call
const STALL_FRAMES = 9000;  // nothing in the run changed for this long => soft-lock, not a loss

function parseArgs(argv) {
  const o = { stages: [1, 2, 3, 4], chars: [0, 1, 2, 3], party: [1], styles: ['balanced'], difficulty: ['normal'],
    seeds: 5, conc: 6, max: 60000, json: '', quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    const nums = (s) => s.split(',').map(Number).filter((n) => Number.isFinite(n));
    const strs = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
    switch (a) {
      case '--stages': o.stages = nums(next()); break;
      case '--chars': o.chars = nums(next()); break;
      case '--party': o.party = nums(next()); break;
      case '--styles': { const v = next(); o.styles = v === 'all' ? Object.keys(BOT_STYLES) : strs(v); break; }
      case '--difficulty': case '--diff': o.difficulty = strs(next()); break;
      case '--seeds': o.seeds = Number(next()) || 1; break;
      case '--conc': o.conc = Number(next()) || 1; break;
      case '--max': o.max = Number(next()) || 60000; break;
      case '--json': o.json = next(); break;
      case '--quiet': o.quiet = true; break;
      default: if (a.startsWith('--')) { console.log(`unknown option ${a}`); process.exit(2); }
    }
  }
  for (const s of o.styles) if (!BOT_STYLES[s]) { console.log(`unknown --styles ${s} (have: ${Object.keys(BOT_STYLES).join(', ')})`); process.exit(2); }
  for (const d of o.difficulty) if (!['easy', 'normal', 'hard'].includes(d)) { console.log(`unknown --difficulty ${d}`); process.exit(2); }
  return o;
}

/** One run to a conclusion. Resolves to a row: outcome plus the stats the results plaque would show. */
async function playRun(ctx, port, job, max) {
  const page = await ctx.newPage({ viewport: { width: 640, height: 360 } });
  const row = { ...job, outcome: 'error', frames: 0, wipes: 0, damage: 0, kills: 0, rank: '', time: '', err: null };
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  try {
    const chars = job.chars.join(',');
    const styles = job.chars.map(() => job.style).join(',');
    const url = `http://localhost:${port}/index.html?autotest=1&seed=${job.seed}&skipTo=gameplay&stage=${job.stage}`
      + `&chars=${chars}&bot=1&botstyle=${styles}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 20000 });
    // difficulty has no URL param (it is a title-screen choice and ?skipTo skips the title), so set it and
    // re-enter gameplay on the same seed — that way every cell starts from an identical rng stream.
    await page.evaluate(([d, s, cs]) => {
      const g = window.__game;
      g.game.options.difficulty = d;
      g.rng.seed(s);
      g.game.reset('gameplay', { chars: cs });
    }, [job.difficulty, job.seed, job.chars]);

    let sig = '', sigSince = 0;
    for (let f = 0; f < max;) {
      await page.evaluate((k) => window.__game.step(k), CHUNK);
      f += CHUNK; row.frames = f;
      const s = await page.evaluate(() => {
        const g = window.__game, sum = g.summary(), scr = g.game.screen, w = g.world;
        const ps = (w && w.players ? w.players.filter(Boolean) : []);
        return {
          screen: sum.screen,
          // a run is only decided on the results plaque: `defeat` there means the continue countdown expired
          defeat: scr && 'defeat' in scr ? !!scr.defeat : null,
          stats: scr && scr.stats ? scr.stats : null,
          rank: scr && scr.rank ? scr.rank.letter : '',
          sig: [Math.round(sum.cameraX), sum.wavesCleared, (sum.enemies || []).length,
            Math.round(ps.reduce((a, p) => a + (p.damageTakenTotal || 0), 0)), ps.reduce((a, p) => a + (p.kills || 0), 0)].join('|'),
        };
      });
      if (s.screen === 'results') {
        row.outcome = s.defeat ? 'engine' : 'cleared';
        row.rank = s.rank;
        for (const st of s.stats || []) { row.wipes += st.continues; row.damage += st.damageTaken; row.kills += st.kills; row.time = st.time; }
        break;
      }
      // a run where nothing at all moves is a soft-lock in the game or the bot, not a result: report it apart
      if (s.sig === sig) { if (f - sigSince >= STALL_FRAMES) { row.outcome = 'stalled'; break; } } else { sig = s.sig; sigSince = f; }
    }
    if (row.outcome === 'error' && row.frames >= max) row.outcome = 'timeout';
    if (errs.length) row.err = errs[0];
  } catch (e) {
    row.err = e.message;
  } finally {
    await page.close().catch(() => { });
  }
  return row;
}

/** Group rows by the dimensions that actually vary, so a one-board sweep prints one table, not four. */
function report(rows, opts) {
  const dims = [['difficulty', opts.difficulty], ['stage', opts.stages], ['party', opts.party], ['style', opts.styles]]
    .filter(([, list]) => list.length > 1).map(([k]) => k);
  const groups = [['all', rows]];
  const tables = [];
  for (const dim of dims.length ? dims : []) {
    const by = new Map();
    for (const r of rows) { const k = String(r[dim]); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
    tables.push([dim, [...by.entries()]]);
  }
  const line = (label, rs) => {
    const decided = rs.filter((r) => r.outcome === 'cleared' || r.outcome === 'engine');
    const engine = rs.filter((r) => r.outcome === 'engine').length;
    const odd = rs.filter((r) => r.outcome === 'stalled' || r.outcome === 'timeout' || r.err).length;
    const wiped = decided.filter((r) => r.wipes > 0).length;
    const n = decided.length || 1;
    return `  ${String(label).padEnd(12)} runs ${String(rs.length).padStart(4)}  engine wins ${String(engine).padStart(4)}`
      + ` (${(100 * engine / n).toFixed(0).padStart(3)}%)  party wiped ${(100 * wiped / n).toFixed(0).padStart(3)}%`
      + `  wipes/run ${(decided.reduce((a, r) => a + r.wipes, 0) / n).toFixed(2)}`
      + `  dmg ${String(Math.round(decided.reduce((a, r) => a + r.damage, 0) / n)).padStart(5)}`
      + `  kills ${(decided.reduce((a, r) => a + r.kills, 0) / n).toFixed(0).padStart(3)}`
      + (odd ? `  unfinished ${odd}` : '');
  };
  for (const [dim, entries] of tables) {
    console.log(`\nby ${dim}:`);
    for (const [k, rs] of entries.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) console.log(line(k, rs));
  }
  console.log('\noverall:');
  for (const [k, rs] of groups) console.log(line(k, rs));
  const stalls = rows.filter((r) => r.outcome === 'stalled' || r.outcome === 'timeout');
  if (stalls.length) {
    console.log(`\n${stalls.length} run(s) never reached a result (soft-lock or frame cap) — these are draws, not losses:`);
    for (const r of stalls.slice(0, 10)) console.log(`  ${r.outcome} stage${r.stage} ${r.style} party${r.party} chars=${r.chars.join('+')} seed=${r.seed} @${r.frames}f`);
  }
  const errs = rows.filter((r) => r.err);
  if (errs.length) { console.log(`\n${errs.length} run(s) reported a runtime error:`); for (const r of errs.slice(0, 5)) console.log(`  stage${r.stage} seed=${r.seed}: ${r.err}`); }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const jobs = [];
  for (const difficulty of opts.difficulty) for (const stage of opts.stages) for (const style of opts.styles) {
    for (const party of opts.party) for (const c of opts.chars) {
      // party of 2 pairs each hero with the next one, so co-op covers the roster without a full cross product
      const chars = party === 1 ? [c] : [c, opts.chars[(opts.chars.indexOf(c) + 1) % opts.chars.length]];
      for (let i = 0; i < opts.seeds; i++) jobs.push({ difficulty, stage, style, party, chars, seed: 1000 + i * 7 });
    }
  }
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  console.log(`winrate: ${jobs.length} runs — boards [${opts.stages}] x styles [${opts.styles}] x party [${opts.party}]`
    + ` x heroes [${opts.chars}] x ${opts.difficulty} x ${opts.seeds} seeds, ${opts.conc} at a time`);
  const t0 = Date.now();
  const rows = [];
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: opts.conc }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const row = await playRun(ctx, port, job, opts.max);
      rows.push(row); done++;
      if (!opts.quiet) {
        console.log(`  [${String(done).padStart(4)}/${jobs.length}] ${row.difficulty} stage${row.stage} ${row.style}`
          + ` p${row.party}(${row.chars.join('+')}) seed${row.seed}: ${row.outcome}`
          + ` wipes=${row.wipes} dmg=${row.damage} rank=${row.rank || '-'}${row.err ? ' ERR:' + row.err : ''}`);
      }
    }
  }));
  await browser.close();
  server.close();
  report(rows, opts);
  console.log(`\n${rows.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (opts.json) { fs.writeFileSync(opts.json, JSON.stringify(rows, null, 1)); console.log(`raw rows -> ${opts.json}`); }
}

main().catch((e) => { console.error(e); process.exit(2); });
