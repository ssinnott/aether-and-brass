// Pure-Node tests for the online co-op layer (docs/MULTIPLAYER.md). No browser, no network.
//
//   node tools/nettest.js              run every suite
//   node tools/nettest.js trig proto   run selected suites (trig mqtt proto lockstep checksum signal picks buffers progress)
//
// These cover the parts that must be provably correct before anything is on the wire: deterministic
// trig, the MQTT signalling codec, the input/message wire format, and the lockstep frame scheduler
// under packet loss. Exit code 1 on any failure.
import { dsin, dcos, dhypot } from '../src/engine/trig.js';
import { ACTIONS, input } from '../src/engine/input.js';
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
    const d = P.decodeMessage(P.encodeInput(3, 4294967290, masks));
    ok(d.baseFrame === 4294967290 && JSON.stringify(d.masks) === JSON.stringify(masks), 'INPUT round trips near the uint32 ceiling');
    ok(d.slot === 3, 'INPUT names the slot it came from, so a relayed packet is still attributable');
    ok(P.encodeInput(0, 0, masks).length === 23, 'INPUT with 8 frames of redundancy is 23 bytes (~1.4 KB/s at 60Hz, per peer)');

    const c = P.decodeMessage(P.encodeChecksum(2, 1234, 0xdeadbeef));
    ok(c.slot === 2 && c.frame === 1234 && c.sum === 0xdeadbeef, 'CHECKSUM keeps the high bit and names its sender');
    for (const chars of [[3, 0], [3, 0, 1], [3, 0, 1, 2]]) {
      const s2 = P.decodeMessage(P.encodeStart({ seed: 0xfeedface, stage: 2, difficulty: 1, chars, delay: 4 }));
      ok(s2.seed === 0xfeedface && s2.delay === 4 && JSON.stringify(s2.chars) === JSON.stringify(chars),
        `START round trips a party of ${chars.length}`);
    }
    const dr = P.decodeMessage(P.encodeDrop(2, 4000000000));
    ok(dr.slot === 2 && dr.frame === 4000000000, 'DROP round trips a slot and the frame it leaves on');
    const pg = P.decodeMessage(P.encodePing(2, 77, P.MSG.PONG));
    ok(pg.type === P.MSG.PONG && pg.slot === 2 && pg.id === 77, 'PONG carries the answering slot, so a relayed ping is answered to the right player');

    // RELAY wraps a whole packet for the host to hand on; the far end must decode the inner one
    // exactly as if it had arrived down a direct channel.
    const inner = P.encodeInput(1, 900, masks), rl = P.decodeMessage(P.encodeRelay(2, inner));
    ok(rl.to === 2 && rl.payload.length === inner.length, 'RELAY round trips its destination and payload');
    const unwrapped = P.decodeMessage(rl.payload);
    ok(unwrapped.slot === 1 && unwrapped.baseFrame === 900, 'the relayed payload decodes to the original INPUT');
    ok(P.encodeRelay(2, inner).length === inner.length + 2, 'relaying costs two bytes');
    ok(P.decodeMessage(P.encodeJson(P.MSG.LOBBY, { ready: true })).ready === true, 'JSON messages round trip');

    // Packets arrive corrupt and truncated over an unreliable channel; decoding must never throw.
    let threw = false;
    const samples = [P.encodeInput(1, 1, masks), P.encodeChecksum(1, 1, 2), P.encodeDrop(1, 2), P.encodeRelay(1, inner),
      P.encodePing(1, 2), P.encodeStart({ seed: 1, stage: 1, difficulty: 0, chars: [0, 0, 0, 0], delay: 3 })];
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

    // One room rendezvous carries up to six pairings, so it has to be split back up into the
    // one-pairing channel net/peer.js expects.
    const sent = [];
    let feed = null;
    const mux = S.createSignalMux({ send: (o) => sent.push(o), onMessage: (fn) => { feed = fn; }, close() {} }, 'me');
    const seenB = [], seenC = [], anns = [];
    mux.onAnnounce((m) => anns.push(m));
    const b = mux.channel('B'); b.onMessage((m) => seenB.push(m));
    const c = mux.channel('C'); c.onMessage((m) => seenC.push(m));
    b.send({ hello: true });
    ok(sent.length === 1 && sent[0].to === 'B' && sent[0].hello === true, 'a pairing channel addresses what it sends');
    feed({ from: 'B', to: 'me', sdp: { type: 'offer' } });
    feed({ from: 'C', to: 'me', cand: { c: 1 } });
    ok(seenB.length === 1 && seenB[0].sdp && seenC.length === 1 && seenC[0].cand, "each pairing hears only its own peer's signalling");
    feed({ from: 'D', ann: 1, host: 1 });
    ok(anns.length === 1 && anns[0].from === 'D' && seenB.length === 1, 'an unaddressed announcement goes to the room, not to a pairing');
    feed({ from: 'E', to: 'me', sdp: { type: 'offer' } });
    ok(anns.length === 1 && seenB.length === 1 && seenC.length === 1, 'signalling addressed to us from a peer we have no channel for is dropped');
    // Every peer in the room sees every pairing's signalling: another pair's offer must never be
    // handed to our own connection with that peer, or it answers a negotiation that was not ours.
    feed({ from: 'B', to: 'somebody-else', sdp: { type: 'offer' } });
    ok(seenB.length === 1, "signalling addressed to another peer is not ours to answer");
    ok(mux.has('B') && !mux.has('E'), 'the mux knows which peers it already has a channel for');
    b.close();
    feed({ from: 'B', to: 'me', cand: { c: 2 } });
    ok(seenB.length === 1, 'closing one pairing leaves the rendezvous up for the others');
    feed({ from: 'C', to: 'me', cand: { c: 3 } });
    ok(seenC.length === 2, '...and the others keep working');
  },

  // ---- net/session.js: one hero each. Online there is no "I'm the darker one", so the lobby
  // refuses a pick somebody else is holding, and the host arbitrates whatever the room asks for. ----
  picks() {
    const game = { characters: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], options: {} };
    const stubInput = { setJoined() {}, setVirtual() {}, clearVirtual() {}, pollRaw: () => ({}) };
    const make = (isHost) => createNetSession({ game, input: stubInput, isHost, room: 'TESTRM' });
    /** Seat a party by hand: connect() needs a browser, and these rules are pure roster logic. */
    const seatParty = (net, chars, mine = 0) => {
      net.lobby.members = chars.map((c, i) => ({ pid: `p${i}`, slot: i, char: c, ready: false, id: `id${i}`, local: i === mine, seq: 0, rtt: 0 }));
      net.localSlot = mine;
      net.players = chars.length;
      net.lobby.myChar = chars[mine];
      return net;
    };

    const host = seatParty(make(true), [0, 2]);
    ok(host.localSlot === 0 && host.players === 2, 'the host holds seat 0');
    ok(host.charTaken(2) && !host.charTaken(1), "the other player's hero is the only one marked taken");
    ok(host.setChar(3) && host.lobby.myChar === 3, 'a free hero can be chosen');
    ok(host.setChar(2) === false && host.lobby.myChar === 3, "a hero somebody else holds is refused, and the pick does not move");
    host.lobby.myChar = 1;
    ok(host.nextChar(1) === 3, 'moving right skips over the card the other player is holding');
    ok(host.nextChar(-1) === 0, 'and moving left skips it too');
    host.lobby.myChar = 3;
    ok(host.nextChar(1) === 0, 'the row wraps');

    // Four players, three cards spoken for: the cursor has exactly one place left to go.
    const four = seatParty(make(false), [0, 1, 2, 3], 2);
    ok(four.localSlot === 2 && four.players === 4, 'a guest takes the seat the host gave it');
    ok([0, 1, 3].every((i) => four.charTaken(i)) && !four.charTaken(2), 'in a full room every other hero is taken');
    ok(four.nextChar(1) === 2 && four.nextChar(-1) === 2, 'with one card left the cursor stays on it rather than landing on somebody else');
    ok(four.setChar(1) === false, 'and a taken hero is still refused in a four-player room');
    const three = seatParty(make(false), [0, 1, 2], 1);
    ok(three.nextChar(1) === 3, 'a party of three still leaves the fourth card free to move onto');

    // One character registered: the rule cannot be honoured, and must not deadlock the lobby.
    const solo = seatParty(createNetSession({ game: { characters: [{ id: 'a' }], options: {} }, input: stubInput, isHost: true }), [0, 0]);
    ok(!solo.charTaken(0) && solo.setChar(0), 'with a single hero registered every player may share it');
  },

  // ---- engine/input.js: the match boundary must not let a menu press through as gameplay ----
  buffers() {
    // The lobby's READY press lands in slot 0's buffer on EVERY machine, because the lobby reads
    // the local player through binding set 0 whatever seat they hold. Slot 0 is somebody else's
    // character on everyone but the host, so a press that survives into frame 0 is a desync that
    // no input mask ever asked for (net/session.js beginMatch).
    input.setVirtual(0, { attack: true }); input.update();
    input.setVirtual(0, { attack: false }); input.update();
    ok(input.buffered(0, 'attack'), 'a press is still buffered a frame later, which is the whole point of the buffer');
    ok(!input.pressed(0, 'attack'), '...without still reading as a fresh edge');
    input.clearBuffers();
    ok(!input.buffered(0, 'attack'), 'clearBuffers() forgets it, so the fight does not open on somebody else swinging');

    input.setVirtual(1, { jump: true }); input.update();
    input.setVirtual(2, { jump: true }); input.update();
    ok(input.buffered(1, 'jump') && input.buffered(2, 'jump'), 'two seats each hold their own buffered press');
    input.clearBuffers(2);
    ok(input.buffered(1, 'jump') && !input.buffered(2, 'jump'), 'clearing one seat leaves the others alone');
    input.clearBuffers();
    ok(ACTIONS.every((a) => [0, 1, 2, 3].every((p) => !input.buffered(p, a))), 'and clearing everything leaves no action buffered on any seat');
    for (let p = 0; p < 4; p++) input.clearVirtual(p);
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
      const D = 'dddd0000111122223';
      ok(p.groupScope([A, B, C, D]) === p.groupScope([D, C, B, A]), 'a party of four keys the same whatever order they arrived in');
      ok(p.groupScope([A, B, C]) !== p.groupScope([A, B, C, D]), 'a fourth player makes it a different group');
      ok(p.groupScope([A, B]) === p.groupScope(A, B), 'and two of them still key exactly as the pair always did');
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

  // ---- net/lockstep.js: a party of two to four over a lossy, reordering link must never diverge ----
  lockstep() {
    /**
     * A whole party on a simulated link. Every peer broadcasts its own input to every other, which
     * is exactly what net/session.js does over the mesh; `silent` stops sending for one slot from a
     * given tick, standing in for a player whose connection has died.
     */
    function sim({ players = 2, loss, latency, jitter, ticks, delay, seed, silent = null, dropAt = 0 }) {
      const R = rngOf(seed);
      const peers = Array.from({ length: players }, (_, i) => createLockstep({ localSlot: i, players, delay }));
      const prng = peers.map((_, i) => rngOf(seed ^ (0x1111 * (i + 1))));
      const consumed = peers.map(() => []);
      const inFlight = [];
      // `owner` is whose input the packet carries, which is not always who is sending it: a peer
      // forwarding somebody else's tail is still a packet from that somebody.
      const send = (from, t, pkt, owner = from) => {
        if (silent && from === silent.slot && t >= silent.from) return;      // this player has gone quiet
        for (let to = 0; to < players; to++) {
          if (to === from || to === owner || R() < loss) continue;
          inFlight.push({ to, at: t + latency + Math.floor(R() * (jitter + 1)), owner, pkt });
        }
      };
      let declared = -1;
      for (let t = 0; t < ticks; t++) {
        for (const p of inFlight) if (p.at === t) peers[p.to].receiveInput(p.owner, p.pkt.baseFrame, p.pkt.masks);
        for (let i = inFlight.length - 1; i >= 0; i--) if (inFlight[i].at <= t) inFlight.splice(i, 1);
        // The host notices the silence and names ONE frame for everybody to retire that slot on:
        // the frame the party has come to a halt on, which is the only one that is both reachable
        // by every peer and in nobody's past.
        if (silent && dropAt && t === silent.from + dropAt && declared < 0) {
          declared = peers[0].frame;
          for (let i = 0; i < players; i++) if (i !== silent.slot) peers[i].dropSlot(silent.slot, declared);
        }
        for (let i = 0; i < players; i++) {
          const peer = peers[i];
          if (!peer.canAdvance()) {
            peer.stall();
            send(i, t, peer.resend());
            // A stalled peer also passes on what it last heard from whoever it is waiting for, which
            // is how the party converges on the last frame a departing player actually played.
            for (const s of peer.missing()) { const tail = peer.tailOf(s); if (tail) send(i, t, tail, s); }
            continue;
          }
          consumed[i].push(`${peer.frame}:${peer.inputs().join(',')}`);
          send(i, t, peer.recordLocal(Math.floor(prng[i]() * 4096)));
          peer.advance();
        }
      }
      return { peers, consumed, declared };
    }

    /** Every peer must have consumed exactly the same input for every frame they all reached. */
    const agree = (consumed) => {
      const n = Math.min(...consumed.map((c) => c.length));
      const first = consumed[0].slice(0, n).join('|');
      return { n, same: consumed.every((c) => c.slice(0, n).join('|') === first) };
    };

    for (const cfg of [
      { name: 'two peers, perfect link', players: 2, loss: 0, latency: 1, jitter: 0, delay: 3, floor: 1500 },
      { name: 'two peers, 10% loss', players: 2, loss: 0.10, latency: 2, jitter: 1, delay: 3, floor: 1500 },
      { name: 'three peers, 10% loss', players: 3, loss: 0.10, latency: 2, jitter: 1, delay: 3, floor: 1400 },
      { name: 'four peers, perfect link', players: 4, loss: 0, latency: 1, jitter: 0, delay: 3, floor: 1500 },
      { name: 'four peers, 10% loss', players: 4, loss: 0.10, latency: 2, jitter: 1, delay: 3, floor: 1300 },
      { name: 'four peers, 40% loss + jitter', players: 4, loss: 0.40, latency: 2, jitter: 3, delay: 3, floor: 150 },
      { name: 'four peers, 70% loss', players: 4, loss: 0.70, latency: 3, jitter: 4, delay: 6, floor: 1 },   // an effectively dead link
      { name: 'four peers, high latency, delay 6', players: 4, loss: 0.05, latency: 6, jitter: 2, delay: 6, floor: 1400 },
    ]) {
      const { peers, consumed } = sim({ ...cfg, ticks: 3000, seed: 12345 });
      const { n, same } = agree(consumed);
      ok(same, `${cfg.name}: all ${cfg.players} peers consumed identical input for all ${n} shared frames`);
      ok(n >= cfg.floor, `${cfg.name}: ${n} frames simulated (floor ${cfg.floor})`);
      const drift = Math.max(...peers.map((p) => p.frame)) - Math.min(...peers.map((p) => p.frame));
      ok(drift <= cfg.delay + 1, `${cfg.name}: the party stays within delay+1 (drift ${drift})`);
    }

    // A player vanishing mid-match. The host names a future frame; everybody else retires the slot
    // on that same frame, so the three that remain stay identical rather than each guessing.
    for (const players of [3, 4]) {
      const { peers, consumed, declared } = sim({
        players, loss: 0.05, latency: 2, jitter: 1, ticks: 3000, delay: 3, seed: 99,
        silent: { slot: players - 1, from: 400 }, dropAt: 60,
      });
      const alive = consumed.slice(0, players - 1);
      const { n, same } = agree(alive);
      ok(same, `${players} peers, one drops: the survivors consumed identical input for all ${n} frames`);
      ok(n > declared + 500, `${players} peers, one drops: the match runs on well past the drop frame (${n} > ${declared})`);
      ok(peers[0].isGone(players - 1) && !peers[0].isGone(0), 'only the dropped slot is retired');
      // Everyone reached the drop frame, and from it on the empty seat reads as pressing nothing.
      ok(alive.every((c) => c.length > declared), 'every survivor reached the drop frame rather than deadlocking short of it');
      ok(alive.every((c) => /,0$/.test(c[declared])), 'from the drop frame on, the empty seat presses nothing');
      ok(alive.every((c) => c[declared - 1] && c[declared - 1].split(':')[0] === String(declared - 1)), 'the frames before it were played with real input');
    }

    // The input delay must exceed the one-way latency or the peers have no slack; and a stalled peer
    // must keep retransmitting, or peers stalling on the same frame deadlock forever.
    const rows = [];
    for (const latency of [1, 3]) for (const delay of [1, 2, 4, 8]) {
      const { consumed } = sim({ players: 4, loss: 0.05, latency, jitter: 0, ticks: 2000, delay, seed: 7 });
      rows.push({ latency, delay, frames: agree(consumed).n });
    }
    ok(rows.every((r) => r.frames > 0), 'no configuration deadlocks (a stalled peer keeps retransmitting)');
    ok(rows.filter((r) => r.delay > r.latency).every((r) => r.frames > 1100), 'delay > one-way latency gives healthy throughput with four players');
    const at3 = rows.filter((r) => r.latency === 3).sort((a, b) => a.delay - b.delay).map((r) => r.frames);
    ok(at3[0] <= at3[1] && at3[1] <= at3[2] && at3[2] <= at3[3], `throughput rises monotonically with delay at fixed latency (${at3.join(' -> ')})`);

    // A single packet must heal a burst of drops through the redundancy window alone.
    {
      const A = createLockstep({ localSlot: 0, delay: 3 }), B = createLockstep({ localSlot: 1, delay: 3 });
      const pump = (from, fromSlot, to, drop) => { const p = from.recordLocal(0x111); if (!drop) to.receiveInput(fromSlot, p.baseFrame, p.masks); };
      for (let i = 0; i < 20; i++) { if (A.canAdvance()) { pump(A, 0, B, false); A.advance(); } if (B.canAdvance()) { pump(B, 1, A, false); B.advance(); } }
      for (let i = 0; i < 5; i++) if (A.canAdvance()) { pump(A, 0, B, true); A.advance(); }
      let drained = 0;
      while (B.canAdvance() && drained < 50) { pump(B, 1, A, false); B.advance(); drained++; }
      ok(drained === 3, `B drains exactly its buffered lead of delay=3 frames (drained ${drained})`);
      ok(!B.canAdvance(), 'B then stalls');
      if (A.canAdvance()) pump(A, 0, B, false);
      ok(B.canAdvance(), 'one packet heals 5 dropped frames via the redundancy window');
    }

    // Checksums must be caught in either arrival order, and against EVERY peer: with four players
    // one machine is compared with three others on the same frame.
    {
      const A = createLockstep({ localSlot: 0, delay: 3, players: 4 });
      A.noteLocalChecksum(30, 0xabc); A.receiveChecksum(1, 30, 0xabc); A.receiveChecksum(2, 30, 0xabc); A.receiveChecksum(3, 30, 0xabc);
      ok(A.desync === null, 'matching checksums from all three peers do not report a desync');
      A.noteLocalChecksum(60, 0xabc); A.receiveChecksum(1, 60, 0xabc); A.receiveChecksum(3, 60, 0xdef);
      ok(A.desync && A.desync.frame === 60 && A.desync.slot === 3, 'a mismatch on the THIRD peer is still caught, after two matches on the same frame');
      const B = createLockstep({ localSlot: 1, delay: 3, players: 4 });
      B.receiveChecksum(2, 90, 0x111); B.noteLocalChecksum(90, 0x222);
      ok(B.desync && B.desync.frame === 90 && B.desync.slot === 2, 'mismatch caught when theirs arrives first');
      const C = createLockstep({ localSlot: 0, delay: 3, players: 3 });
      C.receiveChecksum(1, 30, 0x9); C.receiveChecksum(2, 30, 0x9); C.noteLocalChecksum(30, 0x9);
      ok(C.desync === null, 'two peers arriving before our own number are both compared against it');
    }

    ok(createLockstep({ localSlot: 0, delay: 0 }).delay === 1, 'delay 0 is coerced to 1 (0 deadlocks at frame 0)');
    const L = createLockstep({ localSlot: 2, delay: 3, players: 4 });
    ok(L.canAdvance() && L.inputs().length === 4 && L.inputs().every((m) => m === 0), 'the opening frames are pre-filled with neutral input for every seat');
    ok(JSON.stringify(L.remoteSlots) === '[0,1,3]', 'a peer in seat 3 of 4 waits on the other three');
    ok(L.receiveInput(2, 10, [0xfff]) === undefined && L.inputs()[2] === 0, 'a peer never takes its OWN input off the wire');
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
