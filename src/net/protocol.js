// Wire format for online co-op (docs/MULTIPLAYER.md). Everything is little-endian binary sent over
// an unreliable, unordered RTCDataChannel - small enough that we never need to fragment.
//
// Input is the hot path: 11 actions plus a run flag pack into one uint16, so a frame of input for
// one player is 2 bytes. Every INPUT packet repeats the last REDUNDANCY frames, which replaces
// retransmission entirely: a lost packet is covered by the next one. Never make the channel
// reliable/ordered - a retransmitted input arrives after its frame has already been simulated.
//
// Two to four players share one match. Every packet that carries simulation data names the SLOT it
// came from rather than relying on which connection it arrived on: with four players the mesh is
// six links, and any link that fails to form is carried by the host instead (MSG.RELAY), so a
// packet's sender and its courier are not always the same peer.

import { ACTIONS } from '../engine/input.js';

/**
 * Bumped whenever ACTIONS, the message layout or a simulation rule changes. Peers compare this in
 * HELLO and refuse to start on a mismatch: GitHub Pages is CDN-cached, so one player can easily be
 * on yesterday's bundle, and a shifted bit would silently turn their 'jump' into someone's 'dodge'.
 *
 * v2: slot-tagged INPUT/CHECKSUM, variable-length START, RELAY and DROP - the four-player session.
 */
export const PROTOCOL_VERSION = 2;

/** Bit index of `run`, after the 11 actions. Frozen: changing it is a wire break, so bump the version. */
export const RUN_BIT = 11;
if (ACTIONS.length !== RUN_BIT) throw new Error(`net/protocol: ACTIONS changed (${ACTIONS.length}); bump PROTOCOL_VERSION and RUN_BIT`);
/** Frames of input repeated in every INPUT packet. */
export const REDUNDANCY = 8;

export const MSG = { HELLO: 1, LOBBY: 2, START: 3, INPUT: 4, CHECKSUM: 5, PING: 6, PONG: 7, BYE: 8, RELAY: 9, DROP: 10 };

/** Pack an action map ({attack:true, run:true, ...}) into a uint16. */
export function packActions(a) {
  let m = 0;
  for (let i = 0; i < ACTIONS.length; i++) if (a[ACTIONS[i]]) m |= 1 << i;
  if (a.run) m |= 1 << RUN_BIT;
  return m & 0xffff;
}

/** Unpack a uint16 into an action map suitable for input.setVirtual(). */
export function unpackActions(m) {
  const a = {};
  for (let i = 0; i < ACTIONS.length; i++) a[ACTIONS[i]] = (m & (1 << i)) !== 0;
  a.run = (m & (1 << RUN_BIT)) !== 0;
  return a;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function buf(n) { const b = new ArrayBuffer(n); return { b, v: new DataView(b) }; }

/** INPUT: `slot`'s input, masks[0] for `baseFrame` and masks[i] for baseFrame + i. */
export function encodeInput(slot, baseFrame, masks) {
  const { b, v } = buf(7 + masks.length * 2);
  v.setUint8(0, MSG.INPUT);
  v.setUint8(1, slot & 0xff);
  v.setUint32(2, baseFrame >>> 0, true);
  v.setUint8(6, masks.length);
  for (let i = 0; i < masks.length; i++) v.setUint16(7 + i * 2, masks[i] & 0xffff, true);
  return new Uint8Array(b);
}

/** CHECKSUM: `slot`'s simulation hash at `frame`. */
export function encodeChecksum(slot, frame, sum) {
  const { b, v } = buf(10);
  v.setUint8(0, MSG.CHECKSUM);
  v.setUint8(1, slot & 0xff);
  v.setUint32(2, frame >>> 0, true);
  v.setUint32(6, sum >>> 0, true);
  return new Uint8Array(b);
}

/**
 * START: the host's authoritative session parameters. Every peer seeds from this and begins at
 * frame 0. `chars` is one hero index per slot and its length IS the party size, so a peer never has
 * to be told how many players the match has by any other route.
 */
export function encodeStart({ seed, stage, difficulty, chars, delay }) {
  const n = chars.length;
  const { b, v } = buf(10 + n);
  v.setUint8(0, MSG.START);
  v.setUint32(1, seed >>> 0, true);
  v.setUint8(5, stage & 0xff);
  v.setUint8(6, difficulty & 0xff);
  v.setUint16(7, delay & 0xffff, true);
  v.setUint8(9, n & 0xff);
  for (let i = 0; i < n; i++) v.setUint8(10 + i, chars[i] & 0xff);
  return new Uint8Array(b);
}

/**
 * DROP: the host retiring a slot whose peer has gone, at an agreed FUTURE frame. Every peer hands
 * that slot to the bot on exactly that frame, so the parting is part of the simulation rather than
 * three machines each noticing a silence at a different moment.
 */
export function encodeDrop(slot, frame) {
  const { b, v } = buf(6);
  v.setUint8(0, MSG.DROP);
  v.setUint8(1, slot & 0xff);
  v.setUint32(2, frame >>> 0, true);
  return new Uint8Array(b);
}

/**
 * RELAY: an inner packet the host passes on to `to`, for the pair of guests whose direct link never
 * formed. The payload is an ordinary packet carrying its own sender slot, so the far end handles it
 * exactly as if it had arrived down a direct channel.
 */
export function encodeRelay(to, payload) {
  const out = new Uint8Array(2 + payload.length);
  out[0] = MSG.RELAY;
  out[1] = to & 0xff;
  out.set(payload, 2);
  return out;
}

/**
 * PING / PONG carry an opaque id echoed back, so RTT needs no clock sync, and the SENDER'S slot so
 * the answer can be addressed. A ping that came the long way round (via the host's relay) arrives
 * down the host's channel, and replying to the channel it arrived on would answer the wrong player.
 */
export function encodePing(slot, id, type = MSG.PING) {
  const { b, v } = buf(6);
  v.setUint8(0, type);
  v.setUint8(1, slot & 0xff);
  v.setUint32(2, id >>> 0, true);
  return new Uint8Array(b);
}

/** HELLO / LOBBY / BYE carry a small JSON body (roster, character choices, quit reason). */
export function encodeJson(type, obj) {
  const body = enc.encode(JSON.stringify(obj));
  const out = new Uint8Array(1 + body.length);
  out[0] = type;
  out.set(body, 1);
  return out;
}

/** Decode any message. Returns null for an empty or unknown packet rather than throwing. */
export function decodeMessage(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!u.length) return null;
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const type = u[0];
  switch (type) {
    case MSG.INPUT: {
      if (u.length < 7) return null;
      const slot = v.getUint8(1), baseFrame = v.getUint32(2, true), count = v.getUint8(6);
      if (u.length < 7 + count * 2) return null;
      const masks = new Array(count);
      for (let i = 0; i < count; i++) masks[i] = v.getUint16(7 + i * 2, true);
      return { type, slot, baseFrame, masks };
    }
    case MSG.CHECKSUM:
      return u.length < 10 ? null : { type, slot: v.getUint8(1), frame: v.getUint32(2, true), sum: v.getUint32(6, true) };
    case MSG.START: {
      if (u.length < 10) return null;
      const n = v.getUint8(9);
      if (u.length < 10 + n) return null;
      const chars = new Array(n);
      for (let i = 0; i < n; i++) chars[i] = v.getUint8(10 + i);
      return { type, seed: v.getUint32(1, true), stage: v.getUint8(5), difficulty: v.getUint8(6), delay: v.getUint16(7, true), chars };
    }
    case MSG.DROP:
      return u.length < 6 ? null : { type, slot: v.getUint8(1), frame: v.getUint32(2, true) };
    case MSG.RELAY:
      // The payload is handed on as a view, never copied: relaying is on the per-frame path.
      return u.length < 3 ? null : { type, to: v.getUint8(1), payload: u.subarray(2) };
    case MSG.PING:
    case MSG.PONG:
      return u.length < 6 ? null : { type, slot: v.getUint8(1), id: v.getUint32(2, true) };
    case MSG.HELLO:
    case MSG.LOBBY:
    case MSG.BYE:
      try { return { type, ...JSON.parse(dec.decode(u.subarray(1)) || '{}') }; } catch { return { type }; }
    default:
      return null;
  }
}
