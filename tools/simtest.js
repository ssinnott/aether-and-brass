// Pure-Node tests for the sim modules that can be reasoned about without a canvas (issue #33). No browser, no
// rendering, no audio context — the same shape as tools/nettest.js, and run by `npm test` ahead of the browser
// harness so a sequencing mistake fails in a second rather than after six minutes of playthroughs.
//
//   node tools/simtest.js              run every suite
//   node tools/simtest.js events       run selected suites (events entrances platforms)
//
// These cover the parts whose CORRECTNESS IS ORDERING rather than rendering: which action of a script runs on which
// frame, how long an arrival takes, and where a platform is at a given frame. Exit code 1 on any failure.
import { EventRunner, eventLength, EVENT_ACTIONS } from '../src/game/events.js';
import { ENTRANCES, entranceFor, entranceLength, entranceLanding } from '../src/game/entrances.js';
import { PLATFORMS } from '../src/game/platforms.js';

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok:   ' : '  FAIL: ') + msg); if (!cond) failures++; };

/** A host that records every call instead of touching the game, so a script's effects are a plain list. */
function recorder() {
  const log = [];
  let token = 0;
  return {
    log,
    caption: (text, sub, life) => log.push(`caption:${text}|${sub}|${life}`),
    camera: (shake, frames) => log.push(`camera:${shake}:${frames}`),
    sfx: (name) => log.push(`sfx:${name}`),
    music: (track) => log.push(`music:${track}`),
    hazardSet: (spec) => { log.push(`hazardSet:${spec.name}:${spec.force || ''}`); return { id: ++token }; },
    hazardRevert: (t) => log.push(`hazardRevert:${t.id}`),
    zoneFlash: (spec) => log.push(`zoneFlash:${spec.x0}-${spec.x1}`),
    spawn: (specs) => log.push(`spawn:${specs.length}`),
    prop: (spec) => log.push(`prop:${spec.type}`),
  };
}

// ================================================================ events (issue #33)
function suiteEvents() {
  console.log('\n== events ==');

  // (a) a run of instant actions all lands on ONE frame: that is what makes caption + sfx + flash read as one beat
  {
    const h = recorder(), r = new EventRunner(h);
    r.arm({ id: 'a', actions: [{ caption: 'X' }, { sfx: 's' }, { zoneFlash: { x0: 0, x1: 10 } }, { wait: 3 }, { caption: 'Y' }] });
    r.update();
    ok(h.log.join(',') === 'caption:X||90,sfx:s,zoneFlash:0-10', `instant actions run together on frame 1 (${h.log.join(',')})`);
    ok(r.running, 'the script is still running while it waits');
  }

  // (b) `wait` is the only thing that spends time, and it spends exactly what it says
  {
    const h = recorder(), r = new EventRunner(h);
    r.arm({ id: 'b', actions: [{ wait: 3 }, { caption: 'AFTER' }] });
    r.update(); r.update(); r.update();
    ok(h.log.length === 0, 'nothing has run three frames into a 3-frame wait');
    r.update();
    ok(h.log.join(',') === 'caption:AFTER||90', `the next action runs on the frame the wait ends (${h.log.join(',')})`);
    ok(!r.running, 'and the script ends when its last action has run');
  }

  // (c) every hazard override is handed back when the script ends, newest first
  {
    const h = recorder(), r = new EventRunner(h);
    r.arm({ id: 'c', actions: [{ hazardSet: { name: 'vents', force: 'active' } }, { hazardSet: { name: 'guns', force: 'idle' } }] });
    r.update();
    ok(h.log.join(',') === 'hazardSet:vents:active,hazardSet:guns:idle,hazardRevert:2,hazardRevert:1',
      `overrides revert in reverse order at the end (${h.log.join(',')})`);
  }

  // (d) a script cut short mid-wait still reverts: leaving a section must never strand a vent open
  {
    const h = recorder(), r = new EventRunner(h);
    r.arm({ id: 'd', actions: [{ hazardSet: { name: 'vents', force: 'active' } }, { wait: 600 }] });
    r.update();
    ok(h.log.join(',') === 'hazardSet:vents:active', 'the override is applied and the script settles into its wait');
    r.cancel();
    ok(h.log.join(',') === 'hazardSet:vents:active,hazardRevert:1', `cancel() reverts it (${h.log.join(',')})`);
    ok(!r.running, 'and the script is over');
  }

  // (e) one script at a time: a second arm while one runs is refused, not queued
  {
    const h = recorder(), r = new EventRunner(h);
    ok(r.arm({ id: 'e1', actions: [{ wait: 10 }] }) === true, 'the first event arms');
    ok(r.arm({ id: 'e2', actions: [{ caption: 'NO' }] }) === false, 'a second event while one is running is refused');
    r.update();
    ok(h.log.length === 0, 'and the refused script never ran');
  }

  // (f) malformed data is inert rather than throwing: stage data is hand-written
  {
    const h = recorder(), r = new EventRunner(h);
    ok(r.arm(null) === false, 'arming null is refused');
    ok(r.arm({ id: 'f', actions: 'not an array' }) === false, 'arming a non-array action list is refused');
    r.arm({ id: 'f2', actions: [null, 42, { caption: 'OK' }] });
    r.update();
    ok(h.log.join(',') === 'caption:OK||90', `junk entries are skipped (${h.log.join(',')})`);
  }

  // (g) eventLength matches what stepping actually takes, which is what the docs quote
  {
    const ev = { actions: [{ caption: 'A' }, { wait: 5 }, { sfx: 's' }, { wait: 7 }, { caption: 'B' }] };
    const h = recorder(), r = new EventRunner(h);
    r.arm(ev);
    let frames = 0;
    while (r.update()) { frames++; if (frames > 100) break; }
    frames++;                                   // the frame the final update() returned false on
    ok(frames === eventLength(ev), `eventLength(${eventLength(ev)}) matches the ${frames} frames stepping took`);
  }

  // (h) the action table and the documented list agree
  {
    const known = new Set(EVENT_ACTIONS);
    ok(known.has('caption') && known.has('wait') && known.has('hazardSet') && known.has('zoneFlash') && known.has('spawn') && known.has('prop'),
      'EVENT_ACTIONS lists every action the runner handles');
  }
}

// ================================================================ entrances (issue #30)
function suiteEntrances() {
  console.log('\n== entrances ==');

  // every kind resolves, and its length is tell + path + hang + arrive
  for (const kind of Object.keys(ENTRANCES)) {
    const ent = entranceFor({ entrance: { kind } });
    ok(!!ent && ent.kind === kind, `${kind} resolves through entranceFor`);
    ok(entranceLength(ent) > ent.tell, `${kind} takes longer than its own tell (${entranceLength(ent)}f)`);
  }
  ok(entranceFor({ entrance: { kind: 'nonsense' } }) === null, 'an unknown entrance kind resolves to null rather than throwing');
  ok(entranceFor({}) === null, 'a spec with no entrance resolves to null (the walk-on default)');

  // a flyIn's whole point is its landing recovery, so it never hangs however the author asks
  ok(entranceFor({ entrance: { kind: 'flyIn', hang: 90 } }).hang === 0, 'a flyIn ignores `hang`');
  ok(entranceFor({ entrance: { kind: 'ropeDrop' } }).hang === 30, 'a ropeDrop hangs 30 frames by default');
  ok(entranceFor({ entrance: { kind: 'descend', hang: -5 } }).hang === 0, 'a negative hang is clamped to 0, never an endless hover');

  // the landing follows the `side: 'sky'` convention: absolute `x`, or `dx` from the centre of the lock
  ok(entranceLanding({ x: 1234 }, 0, 640) === 1234, 'an absolute `x` landing is used as given');
  ok(entranceLanding({ dx: -40 }, 0, 640) === 280, 'a `dx` landing is measured from the centre of the lock');
  ok(entranceLanding({}, 100, 740) === 420, 'no x and no dx lands at the centre of the lock');
}

// ================================================================ platforms (issue #32)
function suitePlatforms() {
  console.log('\n== platforms ==');
  for (const kind of Object.keys(PLATFORMS)) ok(!!PLATFORMS[kind], `${kind} has a defaults entry`);
  ok(PLATFORMS.tilt.period > PLATFORMS.tilt.active + PLATFORMS.tilt.tell,
    'a tilt spends more of its cycle level than banking (the bank is an event, not the weather)');
  ok(PLATFORMS.hoist.rise > 0, 'a hoist rises');
  ok(PLATFORMS.pallet.travel > 0 && PLATFORMS.pallet.period > 0, 'a pallet travels over a period');
}

const SUITES = { events: suiteEvents, entrances: suiteEntrances, platforms: suitePlatforms };
const pick = process.argv.slice(2).filter((a) => SUITES[a]);
for (const name of (pick.length ? pick : Object.keys(SUITES))) SUITES[name]();
console.log(`\n${failures ? failures + ' failure(s)' : 'all sim tests passed'}`);
process.exit(failures ? 1 : 0);
