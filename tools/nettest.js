// Pure-Node tests for the online co-op layer (docs/MULTIPLAYER.md). No browser, no network.
//
//   node tools/nettest.js              run every suite
//   node tools/nettest.js proto picks     run selected suites (proto checksum signal picks rematch buffers progress)
//
// These cover this game's half of the netcode: its wire format (the START packet, the 11+1 action mask), its
// world checksum, its signalling namespace, and the session's lobby rules. The library's own half -- deterministic
// trig, the MQTT codec, the framing, the checksum kernel, the signal mux and the lockstep scheduler under packet
// loss -- is tested where it lives, in game-engine's tools/nettest.ts. Exit code 1 on any failure.
import { ACTIONS, input } from '../src/engine/input.ts';
import * as P from '../src/net/protocol.ts';
import * as S from '../src/net/signal.ts';
import { worldChecksum } from '../src/net/checksum.ts';
import { createNetSession } from '../src/net/session.ts';
// The live module, as session.js sees it: the `progress` suite below works on throwaway copies,
// but which scope a SESSION leaves active is a property of the one instance it imports.
import { progress as liveProgress } from '../src/game/progress.ts';

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
const freshProgress = () => import(`../src/game/progress.ts?t=${++progressModule}`);

const suites = {
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

  // ---- net/session.js: the ROOM outlives the match. A finished board hands the party back to the
  // lobby with their seats, their heroes and their shared campaign intact; only somebody leaving
  // (net.end) breaks the room up and gives each player their solo save back. ----
  async rematch() {
    fakeStorage();
    const virtual = new Set(), joined = new Set();
    // A recording stand-in for engine/input.js: every seat was virtual-injected from the lockstep
    // buffers, and the menus the party comes back to must read the keyboards in front of them.
    const stubInput = {
      playerCount: 4,
      buffersCleared: false, claimsReset: false,
      setJoined(s, v) { if (v) joined.add(s); else joined.delete(s); },
      setVirtual(s) { virtual.add(s); },
      clearVirtual(s) { virtual.delete(s); },
      clearBuffers() { stubInput.buffersCleared = true; },
      resetClaims() { stubInput.claimsReset = true; },
      setPadClaiming() {},
      pollRaw: () => ({}),
    };
    const game = { characters: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], options: { netplay: true, stage: 2 }, players: [] };
    const net = createNetSession({ game, input: stubInput, isHost: true, room: 'TESTRM' });
    // Seat a party of three by hand (connect() needs a browser), then stand in for the match itself:
    // every seat driven by the pump, and one player the bot took over on the way to the last wave.
    net.lobby.members = ['id0', 'id1', 'id2'].map((id, i) => ({ pid: `p${i}`, slot: i, char: i, ready: true, id, local: i === 0, seq: 0, rtt: 20 }));
    net.players = 3; net.localSlot = 0; net.lobby.myReady = true; net.lobby.stage = 2;
    for (let s = 0; s < 3; s++) { stubInput.setVirtual(s, {}); if (s) stubInput.setJoined(s, true); }
    net.lobby.members[2].gone = true;
    net.state = 'playing';
    net.ls = { frame: 100 };
    net.waiting = true; net.missing = [2];

    ok(net.matchOver() === true, 'a finished match hands the party back to the lobby');
    ok(net.state === 'lobby' && net.ls === null, '...off lockstep, with the room still standing');
    ok(liveProgress.isGroup && liveProgress.scope === liveProgress.groupScope(['id0', 'id1']),
      'the party keeps a campaign of its own between boards, re-keyed to whoever is still in the room');
    ok(net.lobby.members.length === 2 && net.players === 2, 'the seat the bot finished the board for is emptied');
    ok(net.localSlot === 0 && net.lobby.members.every((m, i) => m.slot === i), 'and the seats left stay dense');
    ok(!net.lobby.myReady && net.lobby.members.every((m) => !m.ready),
      'every ready flag is cleared: a peer still reading its results plaque cannot be dragged into the next match');
    ok(virtual.size === 0, 'every seat gets its real devices back - a mask frozen on the last frame is not a menu');
    ok(joined.size === 0, '...and no seat is left joined with nothing able to drive it');
    ok(stubInput.buffersCleared && stubInput.claimsReset, 'and the match cannot leak a press into the lobby');
    ok(!net.waiting && net.missing.length === 0, 'the waiting overlay is down');
    ok(game.options.netplay === false, 'nothing is under lockstep control until the next match starts');
    ok(net.matchOver() === false, 'a second call is a no-op: there is no match left to finish');
    net.end('test over');
    ok(!liveProgress.isGroup, 'leaving the room is what hands the player back to their own solo save');

    // The clear itself: the results plaque is built after the match screen has left the stack, so the
    // scope is handed to it (game/screens/gameplay.js -> results.js) rather than read off whatever is
    // active by then. A co-op clear opens the GROUP's next board and touches nobody's solo save.
    const { progress: p } = await freshProgress();
    const group = p.groupScope(['id0', 'id1']);
    ok(p.scope === 'solo', 'the plaque can easily be reached with the solo scope active');
    ok(p.inScope(group, () => p.markCleared('stage1', { score: 900, rank: 'B' })) !== undefined, 'the clear is recorded in the scope it was played in');
    ok(p.scope === 'solo', 'inScope puts back the scope it found');
    ok(!p.isCleared('stage1'), "so a co-op clear stays out of the player's own campaign");
    p.setScope(group);
    ok(p.isCleared('stage1') && p.unlockedCount() >= 2, "...and opens the next board for the group that earned it");
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
