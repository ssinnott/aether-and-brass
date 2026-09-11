// Pure-Node tests for the online co-op layer (docs/MULTIPLAYER.md). No browser, no network.
//
//   node tools/nettest.js              run every suite
//   node tools/nettest.js trig proto   run selected suites (trig mqtt proto lockstep checksum signal picks progress)
//
// These cover the parts that must be provably correct before anything is on the wire: deterministic
// trig, the MQTT signalling codec, the input/message wire format, and the lockstep frame scheduler
// under packet loss. Exit code 1 on any failure.
import { dsin, dcos, dhypot } from '../src/engine/trig.js';
import { ACTIONS } from '../src/engine/input.js';
import * as M from '../src/net/mqtt-codec.js';
import * as P from '../src/net/protocol.js';
import * as S from '../src/net/signal.js';
import { worldChecksum } from '../src/net/checksum.js';
import { createLockstep } from '../src/net/lockstep.js';
import { createNetSession } from '../src/net/session.js';

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok:   ' : '  FAIL: ') + msg); if (!cond) failures++; };

/** Deterministic PRNG so every run of this file is identical. */
function rngOf(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A localStorage stand-in, so the progress suite can exercise persistence and migration in Node. */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  globalThis.window = {
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    },
  };
  return map;
}

let progressModule = 0;
/** A fresh copy of progress.js, so each case starts with an unread save. */
const freshProgress = () => import(`../src/game/progress.js?t=${++progressModule}`);

const suites = {
  // ---- engine/trig.js: must match Math.* closely enough to be invisible, using only exact ops ----
  trig() {
    let maxErr = 0;
    for (let i = 0; i < 400000; i++) {
      const a = (i - 200000) * 0.05;                       // -10000..10000 rad, well beyond game scale
      maxErr = Math.max(maxErr, Math.abs(dsin(a) - Math.sin(a)), Math.abs(dcos(a) - Math.cos(a)));
    }
    ok(maxErr < 1e-14, `dsin/dcos match Math.sin/cos to ${maxErr.toExponential(2)} over +-10000 rad`);

    // The reason this matters: swapping Math.sin for dsin must not move a single pixel in single player.
    let pixelDiffs = 0;
    for (let t = 0; t < 100000; t++) {
      const a = (t / 90) * Math.PI * 2;
      if (Math.round(Math.sin(a) * 40) !== Math.round(dsin(a) * 40)) pixelDiffs++;
    }
    ok(pixelDiffs === 0, 'hazard swing: 0 rounded-pixel differences vs Math.sin over 100k frames');

    ok(dsin(0) === 0 && dcos(0) === 1, 'exact at 0');
    ok(Math.abs(dsin(Math.PI / 2) - 1) < 1e-15, 'dsin(PI/2) = 1');
    ok(dhypot(3, 4) === 5, 'dhypot(3,4) = 5 exactly');
    ok(Number.isNaN(dsin(Infinity)) && Number.isNaN(dcos(NaN)), 'non-finite input yields NaN rather than looping');
  },

  // ---- net/mqtt-codec.js: a WebSocket frame does not align with an MQTT packet ----
  mqtt() {
    for (const n of [0, 127, 128, 16383, 16384, 2097151, 2097152, 268435455]) {
      const b = M.encodeLength(n), d = M.decodeLength(new Uint8Array([0, ...b]), 1);
      ok(d && d.value === n && d.bytes === b.length, `remaining-length round trip ${n} (${b.length}B)`);
    }
    ok(M.decodeLength(new Uint8Array([0, 0x80]), 1) === null, 'incomplete varint returns null');

    const one = M.createParser().push(M.encodePublish('ab/ROOM/host', 'hello'));
    ok(one.length === 1 && one[0].topic === 'ab/ROOM/host' && one[0].payload === 'hello', 'PUBLISH round trip');

    const wire = M.encodePublish('t/x', 'abcdefghij'), split = M.createParser();
    ok(split.push(wire.subarray(0, 4)).length === 0, 'a packet split across frames yields nothing on the first half');
    ok(split.push(wire.subarray(4))[0].payload === 'abcdefghij', '...and is reassembled on the second');

    const many = M.createParser().push(new Uint8Array([...M.encodePublish('a', '1'), ...M.encodePingReq(), ...M.encodePublish('b', '2')]));
    ok(many.length === 3 && many[1].type === M.PKT.PINGREQ, 'three packets arriving in one frame all decode');

    const big = 'x'.repeat(500), bw = M.encodePublish('topic', big), p4 = M.createParser();
    p4.push(bw.subarray(0, 1)); p4.push(bw.subarray(1, 300));
    ok(p4.push(bw.subarray(300))[0].payload === big, '500B payload split across three frames');

    ok(M.encodeSubscribe(1, 't')[0] === 0x82, 'SUBSCRIBE fixed header is 0x82 (the 0x02 flag is mandatory)');
    const c = M.encodeConnect('cid');
    ok(c[0] === 0x10 && String.fromCharCode(...c.subarray(4, 8)) === 'MQTT' && c[8] === 4, 'CONNECT declares MQTT protocol level 4');
  },

  // ---- net/protocol.js: the wire format, including hostile input ----
  proto() {
    ok(ACTIONS.length === 11 && P.RUN_BIT === 11, 'the 11 actions plus run fit in a uint16');
    let bad = 0;
    for (let m = 0; m < 4096; m++) if (P.packActions(P.unpackActions(m)) !== m) bad++;
    ok(bad === 0, 'all 4096 reachable masks survive unpack -> pack unchanged');

    const masks = Array.from({ length: P.REDUNDANCY }, (_, i) => (i * 37 + 5) & 0xfff);
    const d = P.decodeMessage(P.encodeInput(4294967290, masks));
    ok(d.baseFrame === 4294967290 && JSON.stringify(d.masks) === JSON.stringify(masks), 'INPUT round trips near the uint32 ceiling');
    ok(P.encodeInput(0, masks).length === 22, 'INPUT with 8 frames of redundancy is 22 bytes (~1.3 KB/s at 60Hz)');

    const c = P.decodeMessage(P.encodeChecksum(1234, 0xdeadbeef));
    ok(c.frame === 1234 && c.sum === 0xdeadbeef, 'CHECKSUM keeps the high bit');
    const s = P.decodeMessage(P.encodeStart({ seed: 0xfeedface, stage: 2, difficulty: 1, chars: [3, 0], delay: 4 }));
    ok(s.seed === 0xfeedface && s.chars[1] === 0 && s.delay === 4, 'START round trips');
    ok(P.decodeMessage(P.encodeJson(P.MSG.LOBBY, { ready: true })).ready === true, 'JSON messages round trip');

    // Packets arrive corrupt and truncated over an unreliable channel; decoding must never throw.
    let threw = false;
    const samples = [P.encodeInput(1, masks), P.encodeChecksum(1, 2), P.encodeStart({ seed: 1, stage: 1, difficulty: 0, chars: [0, 0], delay: 3 })];
    for (const mk of samples) for (let n = 0; n <= mk.length; n++) { try { P.decodeMessage(mk.subarray(0, n)); } catch { threw = true; } }
    ok(!threw, 'every truncation of every packet decodes to null instead of throwing');
    ok(P.decodeMessage(new Uint8Array([99])) === null, 'an unknown message type decodes to null');
  },

  // ---- net/checksum.js: must catch every divergence and produce ZERO false positives ----
  checksum() {
    const world = (over = {}) => ({ frame: 10, entities: [{ kind: 'player', x: 1.5, y: 0, z: 70, vx: 0, vy: 0, facing: 1, alive: true, removeMe: false, hp: 100, state: 2, stateTimer: 3, ...over }] });
    const rng = { state: 12345 };
    const base = worldChecksum(world(), rng);
    ok(worldChecksum(world(), rng) === base, 'identical state hashes identically');
    ok(worldChecksum(world({ x: 1.5000001 }), rng) !== base, 'a 1e-7 position difference is caught');
    ok(worldChecksum(world(), { state: 12346 }) !== base, 'an rng stream divergence is caught');
    ok(worldChecksum(world({ hp: 99 }), rng) !== base, 'an hp difference is caught');
    ok(worldChecksum(world({ state: 'HURT' }), rng) !== base, 'a STRING state difference is caught (ST.* are strings, not numbers)');
    ok(worldChecksum(world({ stateTimer: 4 }), rng) !== base, 'a stateTimer difference is caught');
    ok(worldChecksum(world({ vz: 0.5 }), rng) !== base, 'a vz difference is caught (drives ring-outs)');
    ok(worldChecksum(world({ hitstop: 3 }), rng) !== base, 'a hitstop difference is caught');
    ok(worldChecksum(world({ weaponId: 'halberd', weaponHits: 12 }), rng) !== base, 'a held pickup weapon difference is caught (game/weapons.js)');
    ok(worldChecksum(world({ heldProp: { id: 1 } }), rng) !== base, 'a held prop difference is caught (issue #21 game/throwables.js)');
    ok(worldChecksum(world({ thrownWeapon: 'halberd', weaponHits: 11 }), rng) !== base, 'a thrown-weapon projectile difference is caught (issue #21)');
    ok(worldChecksum(world({ throwPending: { kind: 'weapon' } }), rng) !== base, 'a throwPending.kind difference is caught (issue #21)');
    ok(worldChecksum(world({ propThrowCooldown: 60 }), rng) !== base, 'an enemy prop-throw cooldown difference is caught (issue #21 step 21.6)');
    ok(worldChecksum(world({ lastHitWasThrow: true }), rng) !== base, 'a lastHitWasThrow difference is caught (issue #21 fighter.js, feeds the x1.5 throw-kill score bonus)');
    ok(worldChecksum(world({ anim: { instance: 1, frameIndex: 0, frameTime: 0 } }), rng)
       !== worldChecksum(world({ anim: { instance: 2, frameIndex: 0, frameTime: 0 } }), rng), 'an animation cursor difference is caught');
    ok(worldChecksum(world({ state: 'AB' }), rng) !== worldChecksum(world({ state: 'BA' }), rng), 'string hashing is order sensitive');
    ok(worldChecksum(world({ facing: -1 }), rng) !== base, 'a facing difference is caught');

    // False-positive traps. -0 arises from multiplying a velocity by zero; entity ids differ
    // between peers because the id counter is never reset between runs.
    ok(worldChecksum(world({ vx: -0 }), rng) === worldChecksum(world({ vx: 0 }), rng), '-0 and 0 hash identically');
    ok(worldChecksum(world({ vy: NaN }), rng) === worldChecksum(world({ vy: NaN }), rng), 'NaN hashes stably');
    const a = world(), b = world();
    a.entities[0].id = 900; b.entities[0].id = 3;
    ok(worldChecksum(a, rng) === worldChecksum(b, rng), 'differing entity ids do NOT trip the canary');

    // A purely visual entity (SceneLayer is kind 'fx') must never influence the hash.
    const withFx = world();
    withFx.entities.push({ kind: 'fx', x: 1, y: 2, z: 3, vx: 0, vy: 0, facing: 1, alive: true, removeMe: false });
    ok(worldChecksum(withFx, rng) === base, 'visual-only fx entities are excluded');
    ok(worldChecksum({ ...world(), freeze: 5 }, rng) !== base, 'world.freeze is caught (it early-returns the whole update)');
  },

  // ---- net/signal.js: the room codes the whole lobby is built on ----
  signal() {
    const codes = new Set();
    for (let i = 0; i < 2000; i++) codes.add(S.makeRoomCode());
    ok(codes.size === 2000, '2000 room codes with no collision');
    ok([...codes].every((c) => /^[23456789BCDFGHJKMNPQRSTVWXYZ]{6}$/.test(c)), 'room codes avoid vowels and ambiguous glyphs');
    ok(typeof S.mqttSignal === 'function' && typeof S.broadcastSignal === 'function', 'the two signalling strategies are the room-code rendezvous and the test channel');
  },

  // ---- net/session.js: one hero each. Online there is no "I'm the darker one", so the lobby
  // refuses a pick the peer is holding and the guest yields when two picks cross in flight. ----
  picks() {
    const game = { characters: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], options: {} };
    const stubInput = { setJoined() {}, setVirtual() {}, clearVirtual() {}, pollRaw: () => ({}) };
    const make = (isHost) => createNetSession({ game, input: stubInput, isHost, room: 'TESTRM' });

    const host = make(true), guest = make(false);
    ok(host.lobby.myChar === 0 && guest.lobby.myChar === 1, 'the two peers open on different heroes');

    host.lobby.theirChar = 2;
    ok(host.charTaken(2) && !host.charTaken(1), "the peer's hero is the only one marked taken");
    ok(host.setChar(3) && host.lobby.myChar === 3, 'a free hero can be chosen');
    ok(host.setChar(2) === false && host.lobby.myChar === 3, "the peer's hero is refused, and the pick does not move");
    host.lobby.myChar = 1;
    ok(host.nextChar(1) === 3, 'moving right skips over the card the peer is holding');
    ok(host.nextChar(-1) === 0, 'and moving left skips it too');
    host.lobby.myChar = 3;
    ok(host.nextChar(1) === 0, 'the row wraps');

    // One character registered: the rule cannot be honoured, and must not deadlock the lobby.
    const solo = createNetSession({ game: { characters: [{ id: 'a' }], options: {} }, input: stubInput, isHost: true });
    solo.lobby.theirChar = 0;
    ok(!solo.charTaken(0) && solo.setChar(0), 'with a single hero registered both players may share it');
  },

  // ---- game/progress.js: co-op progress belongs to the pairing, not to either player's solo save ----
  async progress() {
    const KEY = 'aetherAndBrass.progress.v1';
    const A = 'aaaa111122223333', B = 'bbbb4444555566667', C = 'cccc88889999aaaa';

    {
      fakeStorage();
      const { progress: p, SOLO_SCOPE } = await freshProgress();
      ok(p.scope === SOLO_SCOPE && !p.isGroup, 'reads and writes default to the solo scope');
      ok(p.groupScope(A, B) === p.groupScope(B, A), 'the group key is the same whoever hosts');
      ok(p.groupScope(A, B) !== p.groupScope(A, C), 'a different partner is a different group');
      ok(/^g:[0-9a-f]{8}$/.test(p.groupScope(A, B)), 'the group key is short and readable in a save file');
      const id = p.playerId();
      ok(/^[0-9a-f]{16}$/.test(id) && p.playerId() === id, 'the player id is stable within a page load');
    }

    {
      const disk = fakeStorage();
      const { progress: p } = await freshProgress();
      p.markCleared('stage1', { score: 100, rank: 'A' });
      ok(p.isCleared('stage1') && p.unlockedCount() >= 2, 'a solo clear opens the next board');

      p.setScope(p.groupScope(A, B));
      ok(!p.isCleared('stage1'), 'a brand new group starts from scratch - the solo clear is invisible to it');
      ok(p.unlockedCount() === 1, 'a new group has exactly one board open');
      p.markCleared('stage1', { score: 5, rank: 'C' });
      ok(p.isCleared('stage1') && p.unlockedCount() >= 2, 'clearing together opens the next board for the group');

      p.setScope(null);
      ok(p.record('stage1').score === 100, 'the co-op clear did not overwrite the solo score');
      ok(p.scope === 'solo', 'setScope(null) returns to solo');

      p.setScope(p.groupScope(A, C));
      ok(!p.isCleared('stage1'), 'a different pairing is a different campaign');

      const saved = JSON.parse(disk.get(KEY));
      ok(saved.version === 2 && saved.scopes.solo && saved.scopes[p.groupScope(A, B)], 'both scopes are persisted side by side');
      ok(saved.scopes.solo.boards.stage1.score === 100 && saved.scopes[p.groupScope(A, B)].boards.stage1.score === 5, 'each scope keeps its own score');
    }

    {
      // A session key from a URL is global (a link is a key, whoever plays); a co-op host's board
      // choice is scoped, so it can never show up unlocked on the guest's own solo BOARD SELECT.
      fakeStorage();
      const { progress: p } = await freshProgress();
      const g = p.groupScope(A, B);
      p.allowSession(1, g);
      p.setScope(g);
      ok(p.isUnlocked(1), "a co-op host's board is playable inside the group");
      p.setScope(null);
      ok(!p.isUnlocked(1), 'and is NOT unlocked on the solo board select');
      p.setScope(p.groupScope(A, C));
      ok(!p.isUnlocked(1), 'nor for a different pairing');
      p.setScope(null);
      p.allowSession(1);
      ok(p.isUnlocked(1), 'a ?stage=N link opens the board globally');
      p.setScope(g);
      ok(p.isUnlocked(1), '...in every scope, because a link is a key whoever is playing');
    }

    {
      // Anyone who already played has a v1 save. It must come back as their solo progress.
      fakeStorage({ [KEY]: JSON.stringify({ version: 1, boards: { stage1: { cleared: true, score: 4200, rank: 'S' } } }) });
      const { progress: p } = await freshProgress();
      ok(p.isCleared('stage1') && p.record('stage1').score === 4200, 'a v1 save migrates into the solo scope with its score');
      ok(p.unlockedCount() >= 2, 'the migrated clear still opens the next board');
      p.setScope(p.groupScope(A, B));
      ok(!p.isCleared('stage1'), 'the migrated progress does not leak into a co-op group');
    }

    {
      // Storage can be unavailable (private mode, file://). Progress is a convenience, never a gate.
      globalThis.window = { get localStorage() { throw new Error('blocked'); } };
      const { progress: p } = await freshProgress();
      ok(p.unlockedCount() === 1 && p.isUnlocked(0), 'with storage blocked the game still offers board 1');
      ok(p.markCleared('stage1', { score: 1 }) !== undefined, 'marking a clear with storage blocked does not throw');
      ok(/^[0-9a-f]{16}$/.test(p.playerId()), 'a player id is still minted, just not remembered');
      delete globalThis.window;
    }
  },

  // ---- net/lockstep.js: two peers over a lossy, reordering link must never diverge ----
  lockstep() {
    // Two peers driven by independent input streams across a simulated link.
    function sim({ loss, latency, jitter, ticks, delay, seed }) {
      const R = rngOf(seed), A = createLockstep({ localSlot: 0, delay }), B = createLockstep({ localSlot: 1, delay });
      const inFlight = [], consumed = [[], []], prng = [rngOf(seed ^ 0xaaaa), rngOf(seed ^ 0xbbbb)];
      const send = (to, t, pkt) => { if (R() >= loss) inFlight.push({ to, at: t + latency + Math.floor(R() * (jitter + 1)), pkt }); };
      for (let t = 0; t < ticks; t++) {
        for (const p of inFlight) if (p.at === t) (p.to === 'A' ? A : B).receiveInput(p.pkt.baseFrame, p.pkt.masks);
        for (let i = inFlight.length - 1; i >= 0; i--) if (inFlight[i].at <= t) inFlight.splice(i, 1);
        for (const [peer, other, idx] of [[A, 'B', 0], [B, 'A', 1]]) {
          if (!peer.canAdvance()) { peer.stall(); send(other, t, peer.resend()); continue; }
          const [m0, m1] = peer.inputs();
          consumed[idx].push(`${peer.frame}:${m0},${m1}`);
          send(other, t, peer.recordLocal(Math.floor(prng[idx]() * 4096)));
          peer.advance();
        }
      }
      return { A, B, consumed };
    }

    for (const cfg of [
      { name: 'perfect link', loss: 0, latency: 1, jitter: 0, delay: 3, floor: 1500 },
      { name: '10% loss', loss: 0.10, latency: 2, jitter: 1, delay: 3, floor: 1500 },
      { name: '40% loss + jitter', loss: 0.40, latency: 2, jitter: 3, delay: 3, floor: 200 },
      { name: '70% loss', loss: 0.70, latency: 3, jitter: 4, delay: 6, floor: 1 },   // an effectively dead link
      { name: 'high latency, delay 6', loss: 0.05, latency: 6, jitter: 2, delay: 6, floor: 1500 },
    ]) {
      const { A, B, consumed } = sim({ ...cfg, ticks: 3000, seed: 12345 });
      const n = Math.min(consumed[0].length, consumed[1].length);
      ok(consumed[0].slice(0, n).join('|') === consumed[1].slice(0, n).join('|'), `${cfg.name}: both peers consumed identical input for all ${n} shared frames`);
      ok(n >= cfg.floor, `${cfg.name}: ${n} frames simulated (floor ${cfg.floor})`);
      ok(Math.abs(A.frame - B.frame) <= cfg.delay + 1, `${cfg.name}: peers stay within delay+1 (drift ${Math.abs(A.frame - B.frame)})`);
    }

    // The input delay must exceed the one-way latency or the peers have no slack; and a stalled peer
    // must keep retransmitting, or two peers stalling on the same frame deadlock forever.
    const rows = [];
    for (const latency of [1, 3]) for (const delay of [1, 2, 4, 8]) {
      const { consumed } = sim({ loss: 0.05, latency, jitter: 0, ticks: 2000, delay, seed: 7 });
      rows.push({ latency, delay, frames: Math.min(consumed[0].length, consumed[1].length) });
    }
    ok(rows.every((r) => r.frames > 0), 'no configuration deadlocks (a stalled peer keeps retransmitting)');
    ok(rows.filter((r) => r.delay > r.latency).every((r) => r.frames > 1200), 'delay > one-way latency gives healthy throughput');
    const at3 = rows.filter((r) => r.latency === 3).sort((a, b) => a.delay - b.delay).map((r) => r.frames);
    ok(at3[0] <= at3[1] && at3[1] <= at3[2] && at3[2] <= at3[3], `throughput rises monotonically with delay at fixed latency (${at3.join(' -> ')})`);

    // A single packet must heal a burst of drops through the redundancy window alone.
    {
      const A = createLockstep({ localSlot: 0, delay: 3 }), B = createLockstep({ localSlot: 1, delay: 3 });
      const pump = (from, to, drop) => { const p = from.recordLocal(0x111); if (!drop) to.receiveInput(p.baseFrame, p.masks); };
      for (let i = 0; i < 20; i++) { if (A.canAdvance()) { pump(A, B, false); A.advance(); } if (B.canAdvance()) { pump(B, A, false); B.advance(); } }
      for (let i = 0; i < 5; i++) if (A.canAdvance()) { pump(A, B, true); A.advance(); }
      let drained = 0;
      while (B.canAdvance() && drained < 50) { pump(B, A, false); B.advance(); drained++; }
      ok(drained === 3, `B drains exactly its buffered lead of delay=3 frames (drained ${drained})`);
      ok(!B.canAdvance(), 'B then stalls');
      if (A.canAdvance()) pump(A, B, false);
      ok(B.canAdvance(), 'one packet heals 5 dropped frames via the redundancy window');
    }

    // Checksums must be caught in either arrival order.
    {
      const A = createLockstep({ localSlot: 0, delay: 3 });
      A.noteLocalChecksum(30, 0xabc); A.receiveChecksum(30, 0xabc);
      ok(A.desync === null, 'matching checksums do not report a desync');
      A.noteLocalChecksum(60, 0xabc); A.receiveChecksum(60, 0xdef);
      ok(A.desync && A.desync.frame === 60, 'mismatch caught when ours is recorded first');
      const B = createLockstep({ localSlot: 1, delay: 3 });
      B.receiveChecksum(90, 0x111); B.noteLocalChecksum(90, 0x222);
      ok(B.desync && B.desync.frame === 90, 'mismatch caught when theirs arrives first');
    }

    ok(createLockstep({ localSlot: 0, delay: 0 }).delay === 1, 'delay 0 is coerced to 1 (0 deadlocks at frame 0)');
    const L = createLockstep({ localSlot: 0, delay: 3 });
    ok(L.canAdvance() && L.inputs()[0] === 0 && L.inputs()[1] === 0, 'the opening frames are pre-filled with neutral input');
  },
};

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const names = wanted.length ? wanted : Object.keys(suites);
for (const n of names) {
  if (!suites[n]) { console.log(`unknown suite ${n} (have: ${Object.keys(suites).join(' ')})`); failures++; continue; }
  console.log(`\n${n}:`);
  await suites[n]();
}
console.log(failures ? `\n${failures} failure(s)` : '\nall net tests passed');
process.exit(failures ? 1 : 0);
