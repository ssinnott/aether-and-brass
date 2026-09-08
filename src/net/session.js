// Online co-op session: signalling -> peer -> lobby -> synchronised match (docs/MULTIPLAYER.md).
//
// Owns the netplay state machine and the per-frame lockstep pump. The rules that keep the two peers
// identical live here, and every one of them exists because breaking it desyncs the match:
//
//  * The local device is always read through binding set 0 with the solo aliases live, whichever
//    game slot this peer owns. Both players sit alone at their own keyboard using WASD.
//  * Escape is folded into the `start` bit, so pause is a simulated event both peers agree on
//    rather than a local keyboard edge that would pause one side only.
//  * Missing remote input NEVER becomes a neutral mask. Zero-filling manufactures a release edge
//    and a re-press edge, which player.js reads as a double-tap and starts a run. We stall instead.
//  * The entity id counter and the RNG are reset at the match boundary so both peers start level.

import { rng } from '../engine/rng.js';
import { Entity } from '../game/entity.js';
import { createPeer } from './peer.js';
import { createLockstep } from './lockstep.js';
import { worldChecksum } from './checksum.js';
import { broadcastSignal, mqttSignal, manualSignal, makeRoomCode } from './signal.js';
import { MSG, packActions, unpackActions, encodeInput, encodeChecksum, encodeStart, encodeJson, encodePing, decodeMessage } from './protocol.js';

/** Frames without remote input before the match is declared dead (~8s). */
const STALL_TIMEOUT = 480;
/** How often a stalled peer retransmits its window, in rAF ticks. */
const RESEND_EVERY = 3;

/** Turn a measured round-trip time into an input delay in frames, clamped to something playable. */
export function delayForRtt(rttMs) {
  if (rttMs == null) return 3;
  const oneWay = rttMs / 2 / (1000 / 60);        // one-way latency in frames
  return Math.max(2, Math.min(10, Math.ceil(oneWay) + 1));   // must exceed one-way latency (tools/nettest.js)
}

/**
 * @param {{ game: object, input: object, isHost: boolean, room?: string, transport?: 'mqtt'|'broadcast'|'manual',
 *           onState?: (s: string) => void, onLocalCode?: (code: string) => void }} o
 */
export function createNetSession({ game, input, isHost, room = '', transport = 'mqtt', onState, onLocalCode }) {
  const net = {
    isHost,
    room: room || (isHost ? makeRoomCode() : ''),
    transport,
    /** 'idle' | 'signalling' | 'connecting' | 'lobby' | 'playing' | 'ended' */
    state: 'idle',
    error: '',
    endReason: '',
    localSlot: isHost ? 0 : 1,
    remoteSlot: isHost ? 1 : 0,
    delay: 3,
    rtt: null,
    /** Lobby: each side's character index and ready flag. */
    lobby: { myChar: 0, theirChar: 1, myReady: false, theirReady: false, peerHere: false },
    ls: null,
    peer: null,
    signal: null,
    /** True while the simulation is under lockstep control. */
    get active() { return net.state === 'playing'; },
    /** True while waiting on the peer (the gameplay screen draws an overlay on this). */
    waiting: false,
  };

  const setState = (s) => { if (net.state !== s) { net.state = s; if (onState) onState(s); } };
  let resendTick = 0;
  let pingId = 1;
  const pingSent = new Map();

  // ---- transport -------------------------------------------------------------------------------

  async function makeSignal() {
    if (transport === 'broadcast') return broadcastSignal(net.room, isHost ? 'host' : 'guest');
    if (transport === 'manual') return manualSignal({ onLocal: (code) => { if (onLocalCode) onLocalCode(code); } });
    return mqttSignal(net.room, isHost ? 'host' : 'guest');
  }

  /** Begin connecting. Resolves once signalling is up; the peer arrives asynchronously. */
  net.connect = async function connect() {
    setState('signalling');
    try {
      net.signal = await makeSignal();
    } catch (e) {
      net.error = 'could not reach a signalling server';
      setState('ended');
      return false;
    }
    setState('connecting');
    net.peer = createPeer({
      isHost,
      signal: net.signal,
      trickle: transport !== 'manual',
      onOpen: () => { net.lobby.peerHere = true; setState('lobby'); sendLobby(); measureRtt(); },
      onMessage: onPacket,
      onClose: (reason) => net.end(reason || 'peer disconnected'),
    });
    return true;
  };

  /** Copy-paste transport only: feed in the code the other player sent. */
  net.acceptCode = (code) => (net.signal && net.signal.accept ? net.signal.accept(code) : false);

  const send = (bytes) => { if (net.peer) net.peer.send(bytes); };

  // ---- lobby -----------------------------------------------------------------------------------

  function sendLobby() {
    send(encodeJson(MSG.LOBBY, { char: net.lobby.myChar, ready: net.lobby.myReady }));
  }
  net.setChar = (i) => { net.lobby.myChar = i | 0; sendLobby(); };
  net.setReady = (v) => { net.lobby.myReady = !!v; sendLobby(); maybeStart(); };

  async function measureRtt() {
    for (let i = 0; i < 5; i++) {
      const id = pingId++;
      pingSent.set(id, performance.now());
      send(encodePing(id));
      await new Promise((r) => setTimeout(r, 150));
    }
    const fromStats = net.peer ? await net.peer.rtt() : null;
    if (fromStats != null && net.rtt == null) net.rtt = fromStats;
    net.delay = delayForRtt(net.rtt);
  }

  /** Host only: once both sides are ready, fix the session parameters and tell the guest. */
  function maybeStart() {
    if (!isHost || net.state !== 'lobby') return;
    if (!net.lobby.myReady || !net.lobby.theirReady) return;
    const params = {
      seed: (Math.floor(Math.random() * 0x7fffffff) | 0) >>> 0 || 1,   // chosen once, before any simulation
      stage: game.options.stage || 1,
      difficulty: ['easy', 'normal', 'hard'].indexOf(game.options.difficulty || 'normal'),
      chars: isHost ? [net.lobby.myChar, net.lobby.theirChar] : [net.lobby.theirChar, net.lobby.myChar],
      delay: net.delay,
    };
    send(encodeStart(params));
    beginMatch(params);
  }

  /** Both peers run this with byte-identical parameters. Everything after it is lockstep. */
  function beginMatch({ seed, stage, difficulty, chars, delay }) {
    net.delay = Math.max(1, delay);
    net.ls = createLockstep({ localSlot: net.localSlot, delay: net.delay });
    game.options.stage = stage || 1;
    game.options.difficulty = ['easy', 'normal', 'hard'][difficulty] || 'normal';
    game.options.chars = [chars[0], chars[1]];
    game.options.netplay = true;
    Entity.resetIds();          // ids must match: a host who played solo first would otherwise start higher
    rng.seed(seed);             // the boot seed is Date.now()-derived, so re-seed at the match boundary
    input.setJoined(1, true);   // both slots exist from frame 0; drop-in is disabled under netplay
    setState('playing');
    game.reset('gameplay', { chars: [chars[0], chars[1]], net });
  }

  // ---- packets ---------------------------------------------------------------------------------

  function onPacket(bytes) {
    const m = decodeMessage(bytes);
    if (!m) return;
    switch (m.type) {
      case MSG.LOBBY:
        net.lobby.theirChar = m.char | 0;
        net.lobby.theirReady = !!m.ready;
        maybeStart();
        break;
      case MSG.START:
        if (!isHost && net.state === 'lobby') beginMatch(m);
        break;
      case MSG.INPUT:
        if (net.ls) net.ls.receiveInput(m.baseFrame, m.masks);
        break;
      case MSG.CHECKSUM:
        if (net.ls) net.ls.receiveChecksum(m.frame, m.sum);
        break;
      case MSG.PING:
        send(encodePing(m.id, MSG.PONG));
        break;
      case MSG.PONG: {
        const t = pingSent.get(m.id);
        if (t != null) { pingSent.delete(m.id); const r = performance.now() - t; net.rtt = net.rtt == null ? r : net.rtt * 0.7 + r * 0.3; }
        break;
      }
      case MSG.BYE:
        net.end(m.reason || 'the other player left');
        break;
      default: break;
    }
  }

  // ---- the per-frame pump ----------------------------------------------------------------------

  /**
   * Gate for createLoop's canUpdate. False means the peer's input for this frame has not arrived,
   * so the simulation must wait rather than guess.
   */
  net.canStep = function canStep() {
    if (!net.active || !net.ls) return true;
    const ready = net.ls.canAdvance();
    net.waiting = !ready;
    if (!ready) {
      net.ls.stall();
      if (net.ls.stalled > STALL_TIMEOUT) net.end('connection lost');
    }
    return ready;
  };

  /**
   * Runs every rAF, gated or not. A stalled peer must keep retransmitting: if both peers stall on
   * the same frame and neither transmits, the match deadlocks permanently (tools/nettest.js).
   */
  net.pump = function pump() {
    if (!net.active || !net.ls) return;
    if (net.ls.desync) { net.end(`desync at frame ${net.ls.desync.frame}`); return; }
    if (!net.waiting) return;
    if (++resendTick % RESEND_EVERY) return;
    const p = net.ls.resend();
    send(encodeInput(p.baseFrame, p.masks));
  };

  /** Before each simulated frame: sample local devices, share them, and apply both delayed masks. */
  net.beforeStep = function beforeStep() {
    if (!net.active || !net.ls) return;
    const raw = input.pollRaw(0, { solo: true });
    // Escape must not pause locally: routed through `start`, both peers pause on the same frame.
    if (input.globalPressed('pause')) raw.start = true;
    const p = net.ls.recordLocal(packActions(raw));
    send(encodeInput(p.baseFrame, p.masks));
    const [m0, m1] = net.ls.inputs();
    input.setVirtual(0, unpackActions(m0));
    input.setVirtual(1, unpackActions(m1));
  };

  /** After each simulated frame: advance the clock and exchange a checksum periodically. */
  net.afterStep = function afterStep(world) {
    if (!net.active || !net.ls) return;
    const f = net.ls.frame;
    if (world && net.ls.isChecksumFrame(f)) {
      const sum = worldChecksum(world, rng);
      net.ls.noteLocalChecksum(f, sum);
      send(encodeChecksum(f, sum));
    }
    net.ls.advance();
  };

  /**
   * Tear the session down and hand slot 1 to the bot so the run survives (docs/MULTIPLAYER.md 6).
   * v1 has no state-transfer resync: a desync ends the session rather than trying to repair it.
   */
  net.end = function end(reason = 'session ended') {
    if (net.state === 'ended') return;
    net.endReason = reason;
    try { send(encodeJson(MSG.BYE, { reason })); } catch { /* channel already gone */ }
    setState('ended');
    net.waiting = false;
    input.clearVirtual(0);
    input.clearVirtual(1);
    game.options.netplay = false;
    const players = game.players || [];
    if (players[1]) players[1].bot = true;
    try { if (net.peer) net.peer.close(); } catch { /* ignore */ }
    net.ls = null;
  };

  return net;
}
