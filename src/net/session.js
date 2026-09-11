// Online co-op session: signalling -> peers -> lobby -> synchronised match (docs/MULTIPLAYER.md).
//
// Owns the netplay state machine and the per-frame lockstep pump for a party of TWO TO FOUR. The
// rules that keep every peer identical live here, and every one of them exists because breaking it
// desyncs the match:
//
//  * The local device is always read through binding set 0 with the solo aliases live, whichever
//    game slot this peer owns. Everyone sits alone at their own keyboard using WASD.
//  * Escape is folded into the `start` bit, so pause is a simulated event the whole party agrees on
//    rather than a local keyboard edge that would pause one machine only.
//  * Missing remote input NEVER becomes a neutral mask. Zero-filling manufactures a release edge
//    and a re-press edge, which player.js reads as a double-tap and starts a run. We stall instead.
//  * A player who vanishes mid-match is retired by the HOST on an announced future frame (DROP), so
//    every remaining machine hands that slot to the bot on the same frame. Three peers each
//    noticing a silence at their own moment would be three different simulations.
//  * The entity id counter and the RNG are reset at the match boundary so every peer starts level.
//
// TOPOLOGY. Every player holds a direct WebRTC link to every other where one can be formed - four
// players are six links - and each peer sends only its OWN input, to everyone, once per frame. A
// full mesh is what keeps the delay honest: routing a guest's input through the host would put two
// network hops between two players sitting on fast connections. But without a TURN relay some pairs
// simply cannot see each other (symmetric NAT at both ends), so any link that fails to form falls
// back to the host, who forwards those packets on (MSG.RELAY). The host is the one peer everybody
// must reach: they are also the authority for the roster, the board and the START parameters, and
// the session ends for everyone if they leave.

import { rng } from '../engine/rng.js';
import { DIFFICULTIES, NET_PLAYERS, NET_MIN_PLAYERS } from '../constants.js';
import { Entity } from '../game/entity.js';
import { progress } from '../game/progress.js';
import { createPeer } from './peer.js';
import { createLockstep } from './lockstep.js';
import { worldChecksum } from './checksum.js';
import { broadcastSignal, mqttSignal, makeRoomCode, createSignalMux } from './signal.js';
import { MSG, PROTOCOL_VERSION, packActions, unpackActions, encodeInput, encodeChecksum, encodeStart, encodeJson, encodePing, encodeRelay, encodeDrop, decodeMessage } from './protocol.js';

/**
 * Wall-clock milliseconds without remote input before a silent player is given up on. Counted in
 * real time, NOT in ticks: canStep() runs once per rAF, so a 144Hz display would reach a tick count
 * three times sooner than a 60Hz one and kill sessions over a survivable blip.
 */
const STALL_TIMEOUT_MS = 8000;
/** The same, for a player whose connection has actually gone: there is nothing left to wait for
 *  except the party converging on the last frame they played. */
const DEAD_LINK_STALL_MS = 2000;
/** A guest waits this much longer than the host's own timeout before giving up on the whole match:
 *  the host is the one who declares a drop, and this is the margin for that word to arrive. */
const HOST_DECISION_MS = 4000;
/** Milliseconds of stall before the "waiting" overlay appears, and the minimum it stays up. */
const WAIT_SHOW_MS = 220, WAIT_HOLD_MS = 500;
/** How often a stalled peer retransmits its window, in rAF ticks. */
const RESEND_EVERY = 3;
/** How often a peer publishes "I am here" on the rendezvous while the room is still filling. */
const ANNOUNCE_MS = 800;
/** How long the host waits for a guest's latency report before starting without it. */
const RTT_REPORT_GRACE_MS = 3000;

/** Turn a measured round-trip time into an input delay in frames, clamped to something playable. */
export function delayForRtt(rttMs) {
  if (rttMs == null) return 3;
  const oneWay = rttMs / 2 / (1000 / 60);        // one-way latency in frames
  return Math.max(2, Math.min(10, Math.ceil(oneWay) + 1));   // must exceed one-way latency (tools/nettest.js)
}

/**
 * @param {{ game: object, input: object, isHost: boolean, room?: string, transport?: 'mqtt'|'broadcast',
 *           onState?: (s: string) => void }} o
 */
export function createNetSession({ game, input, isHost, room = '', transport = 'mqtt', onState }) {
  const net = {
    isHost,
    room: room || (isHost ? makeRoomCode() : ''),
    transport,
    /** This peer's id on the rendezvous. Unique per page load, and nothing but an address. */
    pid: makeRoomCode(8),
    /** 'idle' | 'signalling' | 'connecting' | 'lobby' | 'playing' | 'ended' */
    state: 'idle',
    error: '',
    endReason: '',
    /** Our seat in the party. The host is always 0; a guest has -1 until the host seats them. */
    localSlot: isHost ? 0 : -1,
    /** Party size, which is simply how many people are in the room until the match starts. */
    players: 1,
    delay: 3,
    /** Worst round-trip time to anyone in the party, which is what the delay has to cover. */
    rtt: null,
    /** True once a ping measurement exists; the match will not start before this. */
    rttReady: false,
    /** Set when a peer reports a different protocol version. */
    versionMismatch: false,
    /** The progress scope this party plays in (game/progress.js), set once ids are exchanged. */
    groupScope: '',
    /**
     * Lobby state. `members` is the host's roster, indexed by slot; `stage` is the HOST's board,
     * since unlocks are per-player localStorage and the party does not agree on what is playable.
     * The host's game is the one being played, so they choose from their own unlocked boards and
     * everyone else is given a session-only key to it.
     */
    lobby: { myChar: 0, myReady: false, stage: 1, members: [] },
    ls: null,
    /** pid -> link record, one per pairing (see linkTo). */
    links: new Map(),
    signal: null,
    mux: null,
    /** True while the simulation is under lockstep control. */
    get active() { return net.state === 'playing'; },
    /** True while waiting on somebody (the gameplay screen draws an overlay on this). */
    waiting: false,
    /** Slots the current frame is waiting for, for that overlay. */
    missing: [],
    /** The last seat the bot took over mid-match: { slot, at }, for the gameplay banner. */
    lastDrop: null,
    /** The first slot that is not ours. Kept for the screens, which say "player N" to the player. */
    get remoteSlot() { return net.localSlot === 0 ? 1 : 0; },
    /** Everyone but us, by slot, in seat order. */
    remoteSlots() { return net.lobby.members.filter((m) => m && !m.local).map((m) => m.slot); },
    /** The roster entry for a slot, or null. */
    memberAt(slot) { return net.lobby.members[slot] || null; },
  };

  const setState = (s) => { if (net.state !== s) { net.state = s; if (onState) onState(s); } };
  let resendTick = 0;
  let pingId = 1;
  const pingSent = new Map();          // ping id -> { slot, at }
  let stallStart = 0, waitShownAt = 0, watchdog = 0, announcer = 0, rttTimer = 0, measuring = false;
  let allReadyAt = 0;
  /** Our own char/ready request counter: the host echoes it back so a stale roster cannot rubber-band us. */
  let seq = 0;
  /** Slots whose DROP frame the simulation has already reached, so the bot is handed over once. */
  const dropped = new Set();
  /** Slots whose link has actually died, as opposed to merely having gone quiet. */
  const lostLinks = new Set();
  /** Set by beforeStep, cleared by afterStep: the two must always pair on the same frame. */
  let stepped = false;

  const members = () => net.lobby.members;
  const memberByPid = (pid) => members().find((m) => m && m.pid === pid) || null;
  const localMember = () => members().find((m) => m && m.local) || null;
  const hostMember = () => members().find((m) => m && m.slot === 0) || null;
  const hostLink = () => {
    if (isHost) return null;
    const h = hostMember();
    const byRoster = h ? net.links.get(h.pid) : null;
    if (byRoster) return byRoster;
    // Before the roster lands, the only link a guest has IS the host's.
    for (const l of net.links.values()) if (l.isHost) return l;
    return null;
  };

  // ---- transport -------------------------------------------------------------------------------

  async function makeSignal() {
    // Room codes are the only way in from the UI. BroadcastChannel reaches the tabs of one origin
    // and nothing else, so it stays as `?transport=broadcast` for the end-to-end test to drive.
    if (transport === 'broadcast') return broadcastSignal(net.room, net.pid);
    return mqttSignal(net.room, net.pid);
  }

  /** Begin connecting. Resolves once signalling is up; the other players arrive asynchronously. */
  net.connect = async function connect() {
    setState('signalling');
    try {
      net.signal = await makeSignal();
    } catch (e) {
      net.error = 'could not reach a signalling server';
      setState('ended');
      return false;
    }
    net.mux = createSignalMux(net.signal, net.pid);
    net.mux.onAnnounce(onAnnounce);
    if (isHost) {
      // The host seats themselves before anyone else can arrive, so slot 0 is never in doubt.
      net.lobby.members = [{ pid: net.pid, slot: 0, char: 0, ready: false, id: progress.playerId(), local: true, seq: 0, rtt: 0 }];
      net.players = 1;
      setState('lobby');
    } else {
      setState('connecting');
    }
    announce();
    announcer = setInterval(() => { announce(); maybeStart(); }, ANNOUNCE_MS);
    return true;
  };

  /** "I am here" - and, from the host, whether there is still a seat free. */
  function announce() {
    if (!net.mux || net.state === 'playing' || net.state === 'ended') return;
    net.mux.announce(isHost ? { ann: 1, host: 1, open: members().length < NET_PLAYERS ? 1 : 0 } : { ann: 1 });
  }

  /**
   * Somebody published to the room. A host answers every announcement with a link; a guest only
   * ever opens a link to the host from an announcement - the other guests it learns about from the
   * host's roster instead, which is what stops a fifth player meshing into a full room.
   */
  function onAnnounce(m) {
    if (!m || !m.ann || !m.from || net.state === 'playing' || net.state === 'ended') return;
    if (net.links.has(m.from)) return;
    if (isHost) {
      if (m.host) return;                                   // two hosts in one room: not ours to talk to
      if (members().length >= NET_PLAYERS) return;          // full: they are told so by our announcement
      linkTo(m.from, false);
    } else if (m.host) {
      if (!m.open && net.localSlot < 0) { net.error = 'the room is full'; net.end('the room is full'); return; }
      linkTo(m.from, true);
    }
  }

  /**
   * One link of the mesh. `toHost` marks the link every guest must have: losing it ends the
   * session, while losing a link to another guest only moves that traffic onto the host's relay.
   */
  function linkTo(pid, toHost) {
    if (net.links.has(pid) || pid === net.pid) return null;
    // ?netrelay=1 stands in for a pair of players who cannot see each other directly: no link is
    // made, so everything for them goes through the host's relay instead (see sendToSlot).
    if (!toHost && !isHost && game.options && game.options.netrelay) return null;
    const link = { pid, isHost: !!toHost, open: false, peer: null, since: Date.now() };
    net.links.set(pid, link);
    link.peer = createPeer({
      // Both ends compute the same answer from ids they both hold, so exactly one of them offers.
      initiator: net.pid < pid,
      signal: net.mux.channel(pid),
      onOpen: () => {
        link.open = true;
        // Version first: a peer on a cached older bundle must be told, not silently desynced.
        // The player id names the co-op progress scope (game/progress.js) and goes nowhere else.
        link.peer.send(encodeJson(MSG.HELLO, { v: PROTOCOL_VERSION, id: progress.playerId(), pid: net.pid }), true);
        if (isHost) sendRoster();
        scheduleRtt();
      },
      onMessage: (bytes) => onPacket(bytes, link),
      onClose: (reason) => onLinkClosed(link, reason),
    });
    return link;
  }

  function onLinkClosed(link, reason) {
    net.links.delete(link.pid);
    link.open = false;
    if (net.state === 'ended') return;
    const m = memberByPid(link.pid);
    if (link.isHost && !isHost) { net.end(reason || 'the host left'); return; }
    // A guest-to-guest link dying only moves that traffic onto the host's relay; the guest says
    // nothing about it, because the host is the one who decides whether a player has really gone.
    // A seat that has ALREADY been retired is not news: applyDrop closes its link itself, and the
    // simulation retires it on the agreed frame rather than the moment the channel went.
    if (m && net.active && net.ls && net.ls.dropFrameOf(m.slot) < 0) {
      lostLinks.add(m.slot);
      // Losing the only other player leaves nobody to stay in step with, so the session simply ends
      // and the bots take over - there is no shared simulation left to keep identical. Losing one
      // of three is not that: the rest play on, and the host retires the seat on an agreed frame.
      if (!net.ls.livingRemotes().some((s) => s !== m.slot)) { net.end(reason || 'the other player left'); return; }
    }
    if (!isHost || !m) return;
    if (!net.active) { seat(null, m.slot); sendRoster(); announce(); }
  }

  // ---- addressing ------------------------------------------------------------------------------

  /**
   * Send to one slot: down the direct link when there is one, and otherwise wrapped up for the host
   * to forward. A guest with no direct link to another guest is the case this exists for.
   */
  function sendToSlot(slot, bytes, reliable = false) {
    const m = net.lobby.members[slot];
    if (!m || m.local || m.gone) return false;
    const direct = net.links.get(m.pid);
    if (direct && direct.open) return direct.peer.send(bytes, reliable);
    if (isHost) return false;                       // the host IS the relay; there is nowhere else to go
    const h = hostLink();
    if (!h || !h.open) return false;
    return h.peer.send(encodeRelay(slot, bytes), reliable);
  }

  /** Send to everybody else in the party. */
  function broadcast(bytes, reliable = false) {
    for (const m of members()) if (m && !m.local && !m.gone) sendToSlot(m.slot, bytes, reliable);
  }

  // ---- roster ----------------------------------------------------------------------------------

  /** Seat a peer (or, with a null pid, empty the seat). Host only. */
  function seat(pid, slot, id = '') {
    const list = members();
    if (pid == null) { list[slot] = null; }
    else list[slot] = { pid, slot, char: firstFreeChar(slot), ready: false, id, local: false, seq: 0, rtt: null };
    // Slots stay dense: a party of three is slots 0-2, never 0, 2 and 3, or the HUD grows a hole
    // and stage.js scales the waves for a player who is not there.
    const packed = list.filter(Boolean);
    packed.forEach((m, i) => { m.slot = i; });
    net.lobby.members = packed;
    net.players = packed.length;
    // Anyone who had readied up readied for a different party. Ask them all again.
    for (const m of packed) m.ready = false;
    net.lobby.myReady = false;
    allReadyAt = 0;
    lostLinks.clear();    // seats have just been renumbered, so any note against one is meaningless
    syncScope();
  }

  /** The first seat with nobody in it, or -1 when the room is full. Host only. */
  function freeSlot() {
    const list = members();
    for (let s = 0; s < NET_PLAYERS; s++) if (!list[s]) return s;
    return -1;
  }

  /** A hero nobody else is holding, for seating a new arrival. */
  function firstFreeChar(exceptSlot = -1) {
    const n = charCount();
    for (let c = 0; c < n; c++) if (!members().some((m) => m && m.slot !== exceptSlot && (m.char | 0) === c)) return c;
    return 0;
  }

  /** The whole party's progress scope: a group is its members, whoever hosts and in whatever order. */
  function syncScope() {
    const ids = members().filter((m) => m && m.id).map((m) => m.id);
    if (ids.length < NET_MIN_PLAYERS) return;
    net.groupScope = progress.groupScope(ids);
    progress.setScope(net.groupScope);
  }

  /** Host only: publish the roster. It is the single source of truth for every lobby screen. */
  function sendRoster() {
    if (!isHost) return;
    const roster = members().map((m) => ({ pid: m.pid, slot: m.slot, char: m.char, ready: m.ready, id: m.id, seq: m.seq }));
    broadcast(encodeJson(MSG.LOBBY, { roster, stage: net.lobby.stage }), true);
    maybeStart();
  }

  /** Guest only: ask the host for a hero / ready state. The roster that comes back is the answer. */
  function sendRequest() {
    if (isHost) return;
    sendToSlot(0, encodeJson(MSG.LOBBY, { req: { char: net.lobby.myChar, ready: net.lobby.myReady, seq: ++seq, rtt: net.rtt } }), true);
  }

  /** Apply a roster from the host. */
  function takeRoster(m) {
    // Sorted by seat, because the rest of the session addresses members by index: members[slot].
    const list = (m.roster || []).slice().sort((a, b) => (a.slot | 0) - (b.slot | 0))
      .map((r) => ({ ...r, local: r.pid === net.pid, gone: false }));
    const mine = list.find((r) => r.local);
    if (!mine) { net.end('the room is full'); return; }
    net.lobby.members = list;
    net.players = list.length;
    net.localSlot = mine.slot;
    // Adopt the host's word for our own pick only once it is answering our LATEST request; without
    // this a roster still carrying the previous hero snaps the cursor back while it is being moved.
    if ((mine.seq | 0) === seq) { net.lobby.myChar = mine.char | 0; net.lobby.myReady = !!mine.ready; }
    if (m.stage) net.lobby.stage = m.stage | 0;
    syncScope();
    // Everyone in the roster is somebody to be in lockstep with, so mesh with them directly.
    for (const r of list) if (!r.local && !net.links.has(r.pid)) linkTo(r.pid, r.slot === 0);
    if (net.state === 'connecting') setState('lobby');
    scheduleRtt();
  }

  /** Host only: take a guest's request, refusing a hero somebody else is holding. */
  function takeRequest(m, link) {
    const who = memberByPid(link.pid);
    if (!who || !m.req) return;
    const c = m.req.char | 0;
    // Two players on the same fighter are told apart by nothing but a tint, which is fine sharing a
    // couch and confusing online, so a pick that collides with somebody else's is simply refused -
    // the roster the requester gets back still shows the hero they had.
    if (charCount() < 2 || !members().some((o) => o && o.slot !== who.slot && (o.char | 0) === c)) who.char = c;
    who.ready = !!m.req.ready;
    who.seq = m.req.seq | 0;
    if (m.req.rtt != null) who.rtt = m.req.rtt;
    sendRoster();
  }

  // ---- lobby -----------------------------------------------------------------------------------

  /** How many heroes are on offer. Below two, the no-duplicates rule cannot be honoured at all. */
  const charCount = () => Math.max(1, (game.characters || []).length | 0);
  /** True when somebody else is holding hero `i`, so this player may not take it. */
  net.charTaken = (i) => charCount() > 1 && members().some((m) => m && !m.local && (m.char | 0) === (i | 0));
  /** The first hero at or after `i`, walking in `dir`, that nobody else is holding. */
  const freeCharFrom = (i, dir) => {
    const n = charCount();
    let c = (((i | 0) % n) + n) % n;
    for (let k = 0; k < n; k++) { if (!net.charTaken(c)) return c; c = (c + dir + n) % n; }
    return c;
  };
  /** The hero `dir` steps away that is actually available: the lobby cursor skips taken cards. */
  net.nextChar = (dir = 1) => freeCharFrom(net.lobby.myChar + dir, dir);
  /** Pick a hero. A pick that collides with somebody else's is refused. */
  net.setChar = (i) => {
    const c = i | 0;
    if (net.charTaken(c)) return false;
    net.lobby.myChar = c;
    const me = localMember();
    if (isHost && me) { me.char = c; sendRoster(); } else sendRequest();
    return true;
  };
  /** Host only: choose the board this session plays, from the boards the HOST has unlocked. */
  net.setStage = (n) => { if (isHost) { net.lobby.stage = Math.max(1, n | 0); sendRoster(); } };
  net.setReady = (v) => {
    net.lobby.myReady = !!v;
    const me = localMember();
    if (isHost && me) { me.ready = !!v; sendRoster(); } else sendRequest();
  };

  /** Everyone who is seated, ready, and (for the host) reachable. */
  function partyReady() {
    const list = members();
    if (list.length < NET_MIN_PLAYERS) return false;
    if (!list.every((m) => m && m.ready)) return false;
    if (!list.every((m) => m && (m.local || (net.links.get(m.pid) || {}).open))) return false;
    if (charCount() > 1) {
      const seen = new Set();
      for (const m of list) { if (seen.has(m.char | 0)) return false; seen.add(m.char | 0); }
    }
    return true;
  }

  /**
   * Measure again shortly. Called whenever the party changes, since a new arrival is a new pair to
   * cover; the small debounce collapses the burst of roster traffic a single join causes into one
   * round of pings.
   */
  function scheduleRtt() {
    if (rttTimer) return;
    rttTimer = setTimeout(() => { rttTimer = 0; measureRtt(); }, 200);
  }

  async function measureRtt() {
    if (measuring) return;
    const slots = net.remoteSlots().filter((s) => s !== net.localSlot && net.localSlot >= 0);
    if (!slots.length) return;
    measuring = true;
    for (let i = 0; i < 5; i++) {
      for (const s of slots) {
        const id = pingId++;
        pingSent.set(id, { slot: s, at: performance.now() });
        sendToSlot(s, encodePing(net.localSlot, id));
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    // A relayed pair is measured end to end by those pings, hops and all. The candidate-pair stat
    // only knows about a direct link, so it is a fallback for when no PONG came back at all.
    if (net.rtt == null) {
      for (const s of slots) {
        const m = net.lobby.members[s], l = m ? net.links.get(m.pid) : null;
        const fromStats = l && l.peer ? await l.peer.rtt() : null;
        if (fromStats != null) net.rtt = Math.max(net.rtt || 0, fromStats);
      }
    }
    measuring = false;
    net.rttReady = true;
    const me = localMember();
    if (me) me.rtt = net.rtt;
    if (!isHost) sendRequest();
    maybeStart();                 // everyone may already have readied while we were measuring
  }

  /** Host only: once the whole party is ready, fix the session parameters and tell them. */
  function maybeStart() {
    if (!isHost || net.state !== 'lobby') return;
    if (!partyReady()) { allReadyAt = 0; return; }
    // The delay must exceed the one-way latency (tools/nettest.js), so never start on the default
    // guess: measuring takes ~800ms and players in a voice call can ready up faster than that.
    if (!net.rttReady) return;
    if (!allReadyAt) allReadyAt = performance.now();
    // Every guest reports its own worst round trip, which is how the host hears about a slow pair
    // it is not part of. Missing reports are waited for briefly and then started without.
    const missing = members().some((m) => m && !m.local && m.rtt == null);
    if (missing && performance.now() - allReadyAt < RTT_REPORT_GRACE_MS) return;
    const worst = members().reduce((w, m) => Math.max(w, m && m.rtt != null ? m.rtt : 0), net.rtt || 0);
    net.rtt = worst;
    net.delay = delayForRtt(worst);
    const params = {
      seed: (Math.floor(Math.random() * 0x7fffffff) | 0) >>> 0 || 1,   // chosen once, before any simulation
      stage: net.lobby.stage || game.options.stage || 1,
      difficulty: DIFFICULTIES.indexOf(game.options.difficulty || 'normal'),
      chars: members().map((m) => m.char | 0),
      delay: net.delay,
    };
    broadcast(encodeStart(params), true);
    beginMatch(params);
  }

  /** Every peer runs this with byte-identical parameters. Everything after it is lockstep. */
  function beginMatch({ seed, stage, difficulty, chars, delay }) {
    const players = Math.max(NET_MIN_PLAYERS, Math.min(NET_PLAYERS, chars.length));
    net.players = players;
    net.delay = Math.max(1, delay);
    net.ls = createLockstep({ localSlot: net.localSlot, players, delay: net.delay });
    game.options.stage = stage || 1;
    // Every peer reads the same group scope, so they normally agree on what is open. They can drift
    // (one player closed the tab before the results screen recorded a clear), so the host's choice
    // still wins: give the rest a key to this board for the page load only, scoped to this group so
    // it cannot appear unlocked on their own solo BOARD SELECT. Nothing is written back, and
    // results.js records the clear into the GROUP scope on every peer.
    progress.allowSession((stage || 1) - 1, net.groupScope);
    game.options.difficulty = DIFFICULTIES[difficulty] || 'normal';
    game.options.chars = chars.slice(0, players);
    game.options.netplay = true;
    Entity.resetIds();          // ids must match: a host who played solo first would otherwise start higher
    rng.seed(seed);             // the boot seed is Date.now()-derived, so re-seed at the match boundary
    for (let s = 1; s < players; s++) input.setJoined(s, true);   // every seat exists from frame 0; drop-in is off
    // Pad claims are a couch-only concept; online, ANY unbound pad must drive the local player (see
    // pollRaw), never claim somebody else's slot, and any local slot beyond the party (left over
    // from couch co-op) must not silently ride along into the match. The nettest stub input has
    // neither method nor playerCount, so both are guarded.
    if (typeof input.resetClaims === 'function') { input.resetClaims(); input.setPadClaiming(false); }
    for (let s = players; s < (input.playerCount || players); s++) input.setJoined(s, false);
    // No more arrivals: the party is fixed at the START packet, and the rendezvous has nothing left
    // to do until the session ends.
    if (announcer) { clearInterval(announcer); announcer = 0; }
    // The disconnect watchdog runs on a timer, NOT off canStep(): the gated loop only calls that
    // from requestAnimationFrame, which Chromium throttles or suspends for a backgrounded page -
    // exactly the situation where a peer has gone away and the session must be dealt with.
    if (watchdog) clearInterval(watchdog);
    watchdog = setInterval(tickWatchdog, 250);
    setState('playing');
    game.reset('gameplay', { chars: game.options.chars.slice(), net });
  }

  // ---- losing a player -------------------------------------------------------------------------

  /**
   * Host only: retire a slot, on the frame the whole party has come to a halt on.
   *
   * That frame is the only safe choice, and it is only safe once the party really has halted. It
   * cannot be in anyone's past - nobody can simulate a frame they have no input for - and it is
   * reachable by everyone, because every frame before it is one the party has already played. A
   * frame chosen further ahead would be unreachable (the departed player never sent input for it,
   * so every machine would sit waiting for it forever), and one chosen while the match was still
   * running could land behind a peer that had buffered further ahead than the host. Callers
   * therefore only reach this after a stall on this very slot, by which time the tails peers
   * forward for each other (see pump) have brought everyone to the same frame.
   */
  function declareDrop(slot) {
    if (!isHost || !net.active || !net.ls) return;
    if (slot === net.localSlot || net.ls.dropFrameOf(slot) >= 0) return;
    const at = net.ls.frame;
    applyDrop(slot, at);
    broadcast(encodeDrop(slot, at), true);
  }

  /** Retire a slot at `frame` on this machine. The bot takes over when the simulation gets there. */
  function applyDrop(slot, frame) {
    if (!net.ls || !net.ls.dropSlot(slot, frame)) return;
    const m = net.lobby.members[slot];
    if (m) m.gone = true;
    const link = m ? net.links.get(m.pid) : null;
    if (link) { net.links.delete(m.pid); try { link.peer.close(); } catch { /* already gone */ } }
  }

  /** Hand a retired slot to the bot, on the exact frame the whole party agreed on. */
  function retireReachedSlots() {
    if (!net.ls) return;
    for (const s of net.ls.remoteSlots) {
      if (dropped.has(s) || !net.ls.isGone(s)) continue;
      dropped.add(s);
      // Wall-clock, and display only: the gameplay screen shows "the bot takes over" for a moment.
      net.lastDrop = { slot: s, at: performance.now() };
      const p = (game.players || [])[s];
      if (p) p.bot = true;
    }
    // Nobody left to be in lockstep with: come off the gate and let this player carry on alone.
    if (net.ls.livingRemotes().length === 0) net.end('everyone else left');
  }

  /** The disconnect watchdog, on a timer rather than on the frame loop. */
  function tickWatchdog() {
    if (!net.active || !net.ls) return;
    if (net.ls.canAdvance()) { stallStart = 0; return; }
    if (!stallStart) stallStart = performance.now();
    const stalledFor = performance.now() - stallStart;
    const late = net.ls.missing().filter((s) => s !== net.localSlot);
    if (isHost) {
      // Whoever the frame is waiting on has had their time: a couple of seconds when their
      // connection is known to be gone (long enough for the party to converge on the last frame
      // they played), the full eight when they have merely fallen quiet.
      const ready = late.filter((s) => stalledFor > (lostLinks.has(s) ? DEAD_LINK_STALL_MS : STALL_TIMEOUT_MS));
      if (!ready.length) return;
      for (const s of ready) declareDrop(s);
      stallStart = 0;
      return;
    }
    if (stalledFor <= STALL_TIMEOUT_MS) return;
    // A guest waits for the host's word, so that everyone retires the same slot on the same frame -
    // but not forever, and not at all once the host itself is unreachable.
    const h = hostLink();
    if (!h || !h.open) { net.end('connection lost'); return; }
    if (stalledFor > STALL_TIMEOUT_MS + HOST_DECISION_MS) net.end('connection lost');
  }

  // ---- packets ---------------------------------------------------------------------------------

  function onPacket(bytes, link) {
    const m = decodeMessage(bytes);
    if (!m) return;
    switch (m.type) {
      case MSG.HELLO: {
        if (m.v !== PROTOCOL_VERSION) { net.versionMismatch = true; net.end('different game version - both reload the page'); break; }
        if (!isHost) break;
        // The host seats an arrival here rather than on the open: this is the first moment their
        // version is known good and their player id (which names the group's progress) is in hand.
        if (memberByPid(link.pid)) break;
        const s = freeSlot();
        if (s < 0) { link.peer.send(encodeJson(MSG.BYE, { reason: 'the room is full' }), true); link.peer.close(); break; }
        if (net.state !== 'lobby') { link.peer.send(encodeJson(MSG.BYE, { reason: 'that match has already started' }), true); link.peer.close(); break; }
        seat(link.pid, s, m.id || '');
        sendRoster();
        scheduleRtt();                    // a new arrival is a new pair for the delay to cover
        announce();                       // the room's free-seat count has just changed
        break;
      }
      case MSG.LOBBY:
        if (m.roster && !isHost && link.isHost) takeRoster(m);
        else if (m.req && isHost) takeRequest(m, link);
        break;
      case MSG.START:
        if (!isHost && link.isHost && net.state === 'lobby' && net.localSlot >= 0) beginMatch(m);
        break;
      case MSG.DROP:
        if (!isHost && link.isHost && net.ls) applyDrop(m.slot, m.frame);
        break;
      case MSG.RELAY: {
        // Only the host forwards, and only ever a packet that is not itself a relay: two peers
        // bouncing a relay off each other would be a loop with no hop count to stop it.
        if (!isHost || !m.payload.length || m.payload[0] === MSG.RELAY) break;
        const inner = m.payload[0];
        sendToSlot(m.to, m.payload, inner !== MSG.INPUT && inner !== MSG.CHECKSUM);
        break;
      }
      case MSG.INPUT:
        if (net.ls) net.ls.receiveInput(m.slot, m.baseFrame, m.masks);
        break;
      case MSG.CHECKSUM:
        if (net.ls) net.ls.receiveChecksum(m.slot, m.frame, m.sum);
        break;
      case MSG.PING:
        // Addressed by slot, not answered down the channel it came in on: a relayed ping arrives
        // from the host and its answer belongs to the player who sent it.
        sendToSlot(m.slot, encodePing(net.localSlot, m.id, MSG.PONG));
        break;
      case MSG.PONG: {
        const p = pingSent.get(m.id);
        if (p) {
          pingSent.delete(m.id);
          const r = performance.now() - p.at;
          // One number is kept, and it is the WORST of the party: the input delay has to cover the
          // slowest pair in the room, not the average of them. It still eases back down, so a
          // single slow first packet does not saddle the match with a delay it never needed.
          net.rtt = net.rtt == null ? r : Math.max(r, net.rtt * 0.7 + r * 0.3);
        }
        break;
      }
      case MSG.BYE:
        // Only the host leaving is the end of the room. Anyone else leaving is one seat emptying,
        // which is the same path as their link simply dying.
        if (link.isHost && !isHost) net.end(m.reason || 'the host left');
        else onLinkClosed(link, m.reason || 'a player left');
        break;
      default: break;
    }
  }

  // ---- the per-frame pump ----------------------------------------------------------------------

  /**
   * Gate for createLoop's canUpdate. False means somebody's input for this frame has not arrived,
   * so the simulation must wait rather than guess.
   */
  net.canStep = function canStep() {
    if (!net.active || !net.ls) return true;
    const ready = net.ls.canAdvance();
    const now = performance.now();
    if (ready) {
      stallStart = 0;
      // Hold the overlay briefly once shown: at 3% loss canAdvance flips false for a single rAF
      // about once a second, and a banner that flashes for 16ms reads as a rendering fault.
      if (net.waiting && now - waitShownAt > WAIT_HOLD_MS) { net.waiting = false; net.missing = []; }
    } else {
      net.ls.stall();
      if (!stallStart) stallStart = now;
      if (!net.waiting && now - stallStart > WAIT_SHOW_MS) { net.waiting = true; waitShownAt = now; }
      if (net.waiting) net.missing = net.ls.missing();
    }
    return ready;
  };

  /**
   * Runs every rAF, gated or not. A stalled peer must keep retransmitting: if two peers stall on
   * the same frame and neither transmits, the match deadlocks permanently (tools/nettest.js).
   */
  net.pump = function pump() {
    // After a session ends the surviving player must keep their own keyboard: the local slot is
    // still virtual-injected, so keep feeding it from the real devices rather than clearing it,
    // which would move them to another binding set.
    if (net.endedPump) { input.setVirtual(Math.max(0, net.localSlot), input.pollRaw(0, { solo: true })); return; }
    if (!net.active || !net.ls) return;
    if (net.ls.desync) { net.end(`desync at frame ${net.ls.desync.frame}`); return; }
    if (!net.waiting) return;
    if (++resendTick % RESEND_EVERY) return;
    const p = net.ls.resend();
    broadcast(encodeInput(net.localSlot, p.baseFrame, p.masks));
    // ...and pass on what we last heard from whoever the frame is waiting for. A packet only its
    // sender can produce is lost with its sender, so this is how the party converges on the last
    // frame a departing player actually played - and, while everyone is still here, how a peer that
    // can hear a third player covers for one that momentarily cannot.
    for (const s of net.ls.missing()) {
      if (s === net.localSlot) continue;
      const t = net.ls.tailOf(s);
      if (t) broadcast(encodeInput(s, t.baseFrame, t.masks));
    }
  };

  /** Before each simulated frame: sample local devices, share them, and apply every delayed mask. */
  net.beforeStep = function beforeStep() {
    if (!net.active || !net.ls) return false;
    // Belt and braces: loop.step(n) deliberately ignores canUpdate, so a test (or any future
    // caller) could reach here without everyone's input. Never guess - inputs() would return a
    // neutral mask, and a manufactured release+press edge reads as a double-tap run in player.js.
    if (!net.ls.canAdvance()) return false;
    retireReachedSlots();
    if (!net.active || !net.ls) return false;    // the last of the party left on this very frame
    const raw = input.pollRaw(0, { solo: true });
    // Escape must not pause locally: routed through `start`, the whole party pauses on one frame.
    if (input.globalPressed('pause')) raw.start = true;
    const p = net.ls.recordLocal(packActions(raw));
    broadcast(encodeInput(net.localSlot, p.baseFrame, p.masks));
    const masks = net.ls.inputs();
    for (let s = 0; s < masks.length; s++) input.setVirtual(s, unpackActions(masks[s]));
    stepped = true;
    return true;
  };

  /** After each simulated frame: advance the clock and exchange a checksum periodically. */
  net.afterStep = function afterStep(world) {
    // Only advance for a frame beforeStep actually prepared. The two are guarded independently in
    // main.js, and beginMatch() runs from inside game.update() (the lobby's own update), so the
    // frame a match starts on would otherwise be advanced without ever having been fed input -
    // leaving the peers' frame counters permanently one apart.
    if (!stepped || !net.active || !net.ls) { stepped = false; return; }
    stepped = false;
    const f = net.ls.frame;
    if (world && net.ls.isChecksumFrame(f)) {
      const sum = worldChecksum(world, rng);
      net.ls.noteLocalChecksum(f, sum);
      broadcast(encodeChecksum(net.localSlot, f, sum));
    }
    net.ls.advance();
  };

  /**
   * Tear the session down and hand every other slot to the bot so the run survives
   * (docs/MULTIPLAYER.md 6). v1 has no state-transfer resync: a desync ends the session rather than
   * trying to repair it.
   */
  net.end = function end(reason = 'session ended') {
    if (net.state === 'ended') return;
    if (watchdog) { clearInterval(watchdog); watchdog = 0; }
    if (announcer) { clearInterval(announcer); announcer = 0; }
    if (rttTimer) { clearTimeout(rttTimer); rttTimer = 0; }
    net.endReason = reason;
    try { broadcast(encodeJson(MSG.BYE, { reason }), true); } catch { /* channels already gone */ }
    setState('ended');
    net.waiting = false;
    net.missing = [];
    game.options.netplay = false;
    progress.setScope(null);    // back to this player's own solo progress
    // Hand every REMOTE slot to the bot - on a guest that includes slot 0, not just the slots above
    // ours. Clearing every virtual would also drop the local player onto another binding set
    // (arrows / J K U L O I) mid-run, so the local slot keeps being driven from their own keyboard
    // by the ended pump.
    const players = game.players || [];
    for (let s = 0; s < Math.max(net.players, players.length); s++) {
      if (s === net.localSlot) continue;
      input.clearVirtual(s);
      if (players[s]) players[s].bot = true;
    }
    net.endedPump = true;
    for (const l of net.links.values()) { try { l.peer.close(); } catch { /* ignore */ } }
    net.links.clear();
    try { if (net.mux) net.mux.close(); } catch { /* ignore */ }
    net.ls = null;
  };

  return net;
}
