// Pure-Node tests for the sim modules that can be reasoned about without a canvas (issue #33). No browser, no
// rendering — the same shape as tools/nettest.js, and run by `npm test` ahead of the browser harness so a
// sequencing mistake fails in a second rather than after six minutes of playthroughs.
//
//   node tools/simtest.js              run every suite
//   node tools/simtest.js events       run selected suites (events entrances platforms audio bestiary bindings)
//
// These cover the parts whose CORRECTNESS IS ORDERING rather than rendering: which action of a script runs on which
// frame, how long an arrival takes, where a platform is at a given frame, which audio nodes are still in the graph
// after a sound has finished, and the keyboard layout's own invariants. Exit code 1 on any failure.
import { EventRunner, eventLength, EVENT_ACTIONS } from '../src/game/events.js';
import { ENTRANCES, entranceFor, entranceLength, entranceLanding } from '../src/game/entrances.js';
import { PLATFORMS } from '../src/game/platforms.js';
import { SFX_DEFS, CANONICAL_SFX } from '../src/engine/audio/sfx.js';
import { TRACKS, compileTrack, scheduleSteps } from '../src/engine/audio/music.js';
import { bestiary, sanitiseRecords, ENTRIES, entriesOf, FACTIONS } from '../src/game/bestiary.js';
import { CODEX, CODEX_MAX_CHARS } from '../src/content/enemies/codex.js';
import { progress, SOLO_SCOPE } from '../src/game/progress.js';
import {
  DEFAULT_BINDINGS, BINDINGS_LAYOUT, LAYOUTS, joinCodesFor, joinLabels, legendFor,
  moveLabelFor, rebindKey, cloneBindings, sanitiseBindings,
} from '../src/engine/bindings.js';

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
  // A tilt is the one kind that moves a body with NOTHING ON SCREEN TO POINT AT: a hoist bends an arc the player is
  // already watching and a pallet is a piece of floor they chose to stand on, but a bank just shoves you. So it is
  // also the one kind that has to introduce itself, and the default has to carry that -- an author who writes
  // `{ kind: 'tilt' }` and nothing else must still get a deck that says what it is doing.
  ok(!!PLATFORMS.tilt.warn, 'a tilt names itself on the HUD by default (a shove with no object to point at must)');
  ok(!PLATFORMS.hoist.warn && !PLATFORMS.pallet.warn, 'a hoist and a pallet do not: they are visible on their own');
}


// ================================================================ audio node lifetime
// Every synth module is `(ctx, dest, when, opts)`, so a stub context is enough to answer the one question that only
// shows up after half an hour of play: does a sound leave anything behind? A node that is still connected is still
// processed every render quantum, so a per-note or per-hit residue grows without bound and eventually starves the
// audio thread -- the music goes first, because it is the one thing playing continuously.
function stubContext() {
  const live = new Set();
  const due = [];  // [time, node] from stop(), replayed by advance()
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const mk = (kind, extra) => { const n = { kind, connect: (d) => d, disconnect: () => live.delete(n), ...extra }; live.add(n); return n; };
  const src = (kind, extra) => mk(kind, { onended: null, start() {}, stop(t) { due.push([t, this]); }, ...extra });
  return {
    live,
    sampleRate: 44100,
    currentTime: 0,
    destination: { kind: 'destination', connect: (d) => d, disconnect() {} },
    createGain: () => mk('gain', { gain: param() }),
    createOscillator: () => src('osc', { frequency: param(), detune: param(), type: 'square' }),
    createBufferSource: () => src('bufsrc', { buffer: null, loop: false, playbackRate: param() }),
    createBiquadFilter: () => mk('filter', { type: 'lowpass', frequency: param(), Q: param(), gain: param() }),
    createWaveShaper: () => mk('shaper', { curve: null, oversample: 'none' }),
    createDelay: () => mk('delay', { delayTime: param() }),
    createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, getChannelData: () => new Float32Array(len) }),
    /** Run the context clock to `t`, firing every source's `ended` on the way (what tears voices down in a browser). */
    advance(t) {
      this.currentTime = t;
      for (let i = due.length - 1; i >= 0; i--) if (due[i][0] <= t) { const n = due[i][1]; due.splice(i, 1); if (n.onended) n.onended(); }
    },
  };
}

function suiteAudio() {
  console.log('\n== audio ==');

  // (a) every SFX, played over and over the way a long fight plays them, leaves nothing connected.
  // `echo` used to be the offender: its taps have no source of their own, so they outlived every hit that fed them.
  const leaky = [];
  for (const name of CANONICAL_SFX) {
    const def = SFX_DEFS[name];
    if (!def) continue;
    const ctx = stubContext();
    const before = ctx.live.size;
    let t = 0;
    for (let i = 0; i < 20; i++) { def(ctx, ctx.destination, t, { v: 1, p: 1, vol: 1, pitch: 1 }); t += 4; ctx.advance(t); }
    ctx.advance(t + 30);
    if (ctx.live.size > before) leaky.push(`${name} (+${ctx.live.size - before})`);
  }
  ok(leaky.length === 0, `20 plays of every SFX leave no nodes in the graph (leaking: ${leaky.join(', ') || 'none'})`);

  // (b) the same for the music sequencer, over enough steps to cover several loops of every track.
  // `bass_dist` used to leak a waveshaper + gain per sixteenth, which is ~1200 nodes a minute on boss2.
  const leakyTracks = [];
  for (const name of Object.keys(TRACKS)) {
    const ctx = stubContext();
    const before = ctx.live.size;
    const c = compileTrack(TRACKS[name]);
    const steps = c.total * 3;
    for (let i = 0; i < steps; i++) { scheduleSteps(ctx, ctx.destination, TRACKS[name], 0, i, i + 1, {}); ctx.advance(i * c.stepDur); }
    ctx.advance(steps * c.stepDur + 60); // past the longest note in the game (the boss3 drone is 128 steps)
    if (ctx.live.size > before) leakyTracks.push(`${name} (+${ctx.live.size - before})`);
  }
  ok(leakyTracks.length === 0, `3 loops of every track leave no nodes in the graph (leaking: ${leakyTracks.join(', ') || 'none'})`);
}

// ================================================================ bestiary (issue #26)
// The book is pure bookkeeping over static content, which makes it exactly the kind of thing this harness is for:
// the completeness of 39 entries, the length budget the 640x360 panel imposes, and the counting rules — all
// checkable in a second without a canvas. `window` is absent here, so game/storage.js hands back null and the book
// runs memory-only, which is also the private-mode path a browser takes.
function suiteBestiary() {
  console.log('\n== bestiary ==');
  const fakeDef = (id) => ({ id });
  /** What the store reads back for `id` after a save + load: the JSON round trip, then loadAll()'s own sanitiser. */
  const sanitiseRoundTrip = (id) => {
    const raw = JSON.parse(JSON.stringify({ [id]: bestiary.stats(id) }));
    return sanitiseRecords(raw)[id] || { n: 0, phases: [] };
  };

  // ---- content completeness
  const noCodex = ENTRIES.filter((e) => !e.codex).map((e) => e.id);
  ok(noCodex.length === 0, `every one of the ${ENTRIES.length} entries has a codex block (missing: ${noCodex.join(', ') || 'none'})`);
  const noPhase = [];
  for (const e of ENTRIES) for (const p of e.phases) if (!p.codex) noPhase.push(`${e.id}#${p.index}`);
  ok(noPhase.length === 0, `every boss phase with its own rig has one too (missing: ${noPhase.join(', ') || 'none'})`);
  const long = Object.entries(CODEX).filter(([, v]) => v.text.length > CODEX_MAX_CHARS).map(([k, v]) => `${k} (${v.text.length})`);
  ok(long.length === 0, `no codex text exceeds ${CODEX_MAX_CHARS} chars (over: ${long.join(', ') || 'none'})`);
  const thin = Object.entries(CODEX).filter(([, v]) => !v.tells || !v.weakness).map(([k]) => k);
  ok(thin.length === 0, `every block names a tell and a weakness (thin: ${thin.join(', ') || 'none'})`);
  // An orphan key is a def that was renamed or removed: the entry silently loses its text, which nothing else catches.
  const known = new Set();
  for (const e of ENTRIES) { known.add(e.id); for (const p of e.phases) known.add(`${e.id}#${p.index}`); }
  const orphans = Object.keys(CODEX).filter((k) => !known.has(k));
  ok(orphans.length === 0, `no codex block keys a def that no longer exists (orphans: ${orphans.join(', ') || 'none'})`);
  const noFirst = ENTRIES.filter((e) => !e.firstSeen).map((e) => e.id);
  ok(noFirst.length === 0, `every entry's first appearance is derivable from the stage data (missing: ${noFirst.join(', ') || 'none'})`);
  const tabbed = FACTIONS.reduce((n, f) => n + entriesOf(f.id).length, 0);
  ok(tabbed === ENTRIES.length, `every entry falls under exactly one faction tab (${tabbed} of ${ENTRIES.length})`);

  // ---- counting
  bestiary.reset(); progress.setScope(SOLO_SCOPE);
  const footman = ENTRIES.find((e) => e.id === 'brassbound:footman');
  ok(!bestiary.isSeen(footman.id), 'a fresh book has nothing in it');
  ok(bestiary.completion().seen === 0, 'and reads 0% complete');
  ok(bestiary.record(fakeDef(footman.id), { hero: 'BRUNHILD' }) === true, 'the first defeat opens the entry');
  ok(bestiary.record(fakeDef(footman.id), { hero: 'BRUNHILD' }) === false, 'the second does not open it again');
  ok(bestiary.stats(footman.id).n === 2, 'but it is counted');
  bestiary.record(fakeDef(footman.id), { thrown: true, hero: 'SAEL' });
  bestiary.record(fakeDef(footman.id), { ringOut: true, hero: 'SAEL' });
  const st = bestiary.stats(footman.id);
  ok(st.n === 4 && st.thrown === 1 && st.ring === 1, `throws and ring-outs are counted apart from the total (n ${st.n}, thrown ${st.thrown}, ring ${st.ring})`);
  ok(bestiary.topHero(footman.id) === 'BRUNHILD', 'the best hunter is the hero with the most, ties broken by name');
  ok(bestiary.completion().seen === 1, 'one entry read as one entry, however many times it was beaten');
  ok(bestiary.record(fakeDef('nope:nothing')) === false, 'a def that is not in the book records nothing');

  // ---- boss phases
  const vane = ENTRIES.find((e) => e.id === 'boss');
  ok(vane && vane.phases.length === 2, `the final boss carries its two later phases (${vane ? vane.phases.length : 0})`);
  ok(!bestiary.phaseSeen('boss', 2), 'an unreached phase stays hidden');
  bestiary.markPhase(fakeDef('boss'), 2);
  ok(bestiary.phaseSeen('boss', 2), 'reaching it reveals it');
  ok(!bestiary.isSeen('boss'), 'reaching a phase is not defeating the boss: the entry itself stays shut');
  // A record holding nothing but phase marks has to survive the save round trip, or reaching a phase in a run you
  // lost is thrown away by the next page load.
  ok(sanitiseRoundTrip('boss').phases[2] === true, 'and a phase-only record survives being read back');

  // ---- scopes: a co-op pairing keeps its own book, exactly as board progress does
  progress.setScope(progress.groupScope('aaaa', 'bbbb'));
  ok(!bestiary.isSeen(footman.id), 'a group scope starts from an empty book');
  bestiary.record(fakeDef(footman.id), { hero: 'PIP' });
  ok(bestiary.stats(footman.id).n === 1, 'and counts on its own');
  progress.setScope(SOLO_SCOPE);
  ok(bestiary.stats(footman.id).n === 4, 'while the solo book is untouched by it');

  // ---- storage is a convenience, never a prerequisite
  ok(bestiary.flush() === false, 'flush() with no storage available reports failure rather than throwing');
  ok(bestiary.stats(footman.id).n === 4, 'and the in-memory book is still readable after it');
  bestiary.reset();
  ok(bestiary.completion().seen === 0, 'reset() empties every scope');
}


/**
 * The keyboard layout's own invariants (engine/bindings.js file header), checked against the shipped
 * DEFAULT_BINDINGS rather than against a copy of the table: a nine-key block per player, no key in two
 * players' hands, nothing landing on a global key. These are the rules the whole join / rebind / save
 * machinery assumes, so a table edited without them is worth catching in a second here rather than six
 * minutes into the browser harness.
 */
function suiteBindings() {
  console.log('\n== bindings ==');
  const ACT = ['left', 'right', 'up', 'down', 'attack', 'jump', 'special', 'super', 'dodge', 'taunt', 'start'];
  const D = DEFAULT_BINDINGS;
  const codesOf = (map) => ACT.flatMap((a) => map[a] || []);

  // (a) every action of every layout is bound
  let unbound = [];
  for (let i = 0; i < D.keyboard.length; i++) for (const a of ACT) if (!(D.keyboard[i][a] || []).length) unbound.push(`P${i + 1}.${a}`);
  for (const a of ACT) if (!(D.gamepad[a] || []).length) unbound.push(`pad.${a}`);
  ok(unbound.length === 0, `every action of every layout has a code (${unbound.join() || 'none missing'})`);

  // (b) no code sits under two actions of the same layout
  let dup = [];
  for (let i = 0; i < D.keyboard.length; i++) {
    const seen = new Map();
    for (const a of ACT) for (const c of D.keyboard[i][a]) { if (seen.has(c)) dup.push(`P${i + 1} ${c}=${seen.get(c)}/${a}`); seen.set(c, a); }
  }
  ok(dup.length === 0, `no key sits under two actions of one layout (${dup.join() || 'none'})`);

  // (c) the blocks are disjoint -- the rule joinCodesFor relies on to say whose press it was
  const p1Codes = new Set(codesOf(D.keyboard[0]));
  const shared = codesOf(D.keyboard[1]).filter((c) => p1Codes.has(c));
  ok(shared.length === 0, `no key belongs to two players (${shared.join() || 'none shared'})`);

  // (d) no global key is bound to a player action
  const globals = new Set(Object.values(D.global).flat());
  const onGlobal = [];
  for (let i = 0; i < D.keyboard.length; i++) for (const c of codesOf(D.keyboard[i])) if (globals.has(c)) onGlobal.push(`P${i + 1}:${c}`);
  ok(onGlobal.length === 0, `no global key (Escape / M / F1) is bound to a player action (${onGlobal.join() || 'none'})`);

  // (e) the pad's run button is not also an action
  ok(!ACT.some((a) => D.gamepad[a].some((b) => D.gamepadRun.includes(b))), 'the gamepad run button is not also an action button');

  // The shape the docs promise: nine keys for movement and the five buttons, two digits above for the rest.
  for (let i = 0; i < D.keyboard.length; i++) {
    const nine = new Set(['up', 'left', 'down', 'right', 'attack', 'jump', 'dodge', 'special', 'super'].map((a) => D.keyboard[i][a][0]));
    ok(nine.size === 9, `P${i + 1}'s movement and five buttons are nine distinct primary keys (${nine.size})`);
    ok(['taunt', 'start'].every((a) => D.keyboard[i][a].some((c) => /^Digit\d$/.test(c))),
      `P${i + 1}'s taunt and start sit on the digits above the block`);
  }
  ok(LAYOUTS.join() === 'p1,p2,pad', `one layout per player plus the pad (${LAYOUTS.join()})`);
  ok(moveLabelFor(D, 'p1') === 'WASD', `P1 moves on WASD (${moveLabelFor(D, 'p1')})`);
  ok(/^ARROWS|WASD$/.test(moveLabelFor(D, 'p1')) && D.keyboard[0].up.includes('ArrowUp'),
    'the arrows are P1\'s second movement set, so they never need switching off');

  // Every key of a block is a join key for that block, and a slot with no block does not throw.
  const join1 = joinCodesFor(D, 1);
  ok(codesOf(D.keyboard[1]).every((c) => join1.has(c)), 'every key of P2\'s block counts as a P2 join press');
  ok(![...join1].some((c) => p1Codes.has(c)), 'no P1 key can ever read as a P2 join press');
  ok(joinCodesFor(D, 2).size === 0 && joinLabels(D, 2).key === '',
    'a slot with no keyboard block yields an empty join set and an empty label rather than throwing');
  ok(joinLabels(D, 1).key === 'V', `the P2 join hint names P2's attack key (${joinLabels(D, 1).key})`);
  ok(legendFor(D, 'p2').startsWith('TFGH MOVE'), `P2's legend reads from the live table (${legendFor(D, 'p2').slice(0, 24)})`);

  // Rebinding: the other player's keys and the globals are refused; a same-layout collision swaps.
  const b = cloneBindings(D);
  ok(rebindKey(b, 'p1', 'attack', 'KeyV').ok === false, 'rebinding P1 attack onto a P2 key is refused');
  ok(rebindKey(b, 'p1', 'attack', 'KeyM').ok === false, 'rebinding onto a global key is refused');
  ok(rebindKey(b, 'p2', 'attack', 'KeyC').ok === false, 'and the refusal works in the other direction too');
  ok(b.keyboard[0].attack.join() === 'KeyZ' && b.keyboard[1].attack.join() === 'KeyV', 'a refused rebind changes nothing');
  const swap = rebindKey(b, 'p1', 'jump', 'KeyZ');
  ok(swap.ok && swap.swapped === 'attack' && b.keyboard[0].jump.join() === 'KeyZ' && b.keyboard[0].attack.join() === 'KeyX',
    'a same-layout collision swaps: JUMP takes Z and the displaced ATTACK takes JUMP\'s old X');

  // A save from the previous layout must not survive: it is self-consistent, so nothing would revert it.
  const oldSave = {
    solo: { attack: ['KeyZ'], jump: ['KeyX', 'Space'] },
    keyboard: [
      { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], attack: ['KeyF'], jump: ['KeyG', 'Space'],
        dodge: ['KeyR'], special: ['KeyH'], super: ['KeyY'], taunt: ['KeyT'], start: ['Enter'] },
      { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], attack: ['KeyJ'],
        jump: ['KeyK'], dodge: ['KeyU'], special: ['KeyL'], super: ['KeyO'], taunt: ['KeyI'], start: ['Backspace'] },
    ],
    pad: D.gamepad,
  };
  const migrated = sanitiseBindings(oldSave, D, ACT);
  ok(migrated.keyboard[0].attack.join() === 'KeyZ' && migrated.keyboard[1].attack.join() === 'KeyV',
    'a save from the previous layout is dropped whole, not merged into a hybrid');
  const stamped = sanitiseBindings({ layout: BINDINGS_LAYOUT, keyboard: D.keyboard, pad: D.gamepad }, D, ACT);
  ok(JSON.stringify(stamped.keyboard) === JSON.stringify(D.keyboard), 'a save carrying the current stamp round-trips unchanged');
  const remap = sanitiseBindings({ layout: BINDINGS_LAYOUT, keyboard: [{ attack: ['KeyP'] }, {}], pad: D.gamepad }, D, ACT);
  ok(remap.keyboard[0].attack.join() === 'KeyP', 'and a legitimate remap inside a stamped save is kept');
  ok(sanitiseBindings('nonsense', D, ACT).keyboard[0].attack.join() === 'KeyZ', 'garbage falls back to the defaults');
}

const SUITES = { events: suiteEvents, entrances: suiteEntrances, platforms: suitePlatforms, audio: suiteAudio, bestiary: suiteBestiary, bindings: suiteBindings };
const pick = process.argv.slice(2).filter((a) => SUITES[a]);
for (const name of (pick.length ? pick : Object.keys(SUITES))) SUITES[name]();
console.log(`\n${failures ? failures + ' failure(s)' : 'all sim tests passed'}`);
process.exit(failures ? 1 : 0);
