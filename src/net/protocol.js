// Wire format for online co-op (docs/MULTIPLAYER.md). Everything is little-endian binary sent over
// an unreliable, unordered RTCDataChannel — small enough that we never need to fragment.
//
// Input is the hot path: 11 actions plus a run flag pack into one uint16, so a frame of input for
// one player is 2 bytes. Every INPUT packet repeats the last REDUNDANCY frames, which replaces
// retransmission entirely: a lost packet is covered by the next one. Never make the channel
// reliable/ordered — a retransmitted input arrives after its frame has already been simulated.

import { ACTIONS } from '../engine/input.js';

/** Bit index of each action in the packed mask; `run` occupies the bit after the last action. */
export const RUN_BIT = ACTIONS.length;
/** Frames of input repeated in every INPUT packet. */
export const REDUNDANCY = 8;

export const MSG = { HELLO: 1, LOBBY: 2, START: 3, INPUT: 4, CHECKSUM: 5, PING: 6, PONG: 7, BYE: 8 };

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

/** INPUT: masks[0] is for `baseFrame`, masks[i] for baseFrame + i. */
export function encodeInput(baseFrame, masks) {
  const { b, v } = buf(6 + masks.length * 2);
  v.setUint8(0, MSG.INPUT);
  v.setUint32(1, baseFrame >>> 0, true);
  v.setUint8(5, masks.length);
  for (let i = 0; i < masks.length; i++) v.setUint16(6 + i * 2, masks[i] & 0xffff, true);
  return new Uint8Array(b);
}

/** CHECKSUM: the sender's simulation hash at `frame`. */
export function encodeChecksum(frame, sum) {
  const { b, v } = buf(9);
  v.setUint8(0, MSG.CHECKSUM);
  v.setUint32(1, frame >>> 0, true);
  v.setUint32(5, sum >>> 0, true);
  return new Uint8Array(b);
}

/** START: the host's authoritative session parameters. Both peers seed from this and begin at frame 0. */
export function encodeStart({ seed, stage, difficulty, chars, delay }) {
  const { b, v } = buf(11);
  v.setUint8(0, MSG.START);
  v.setUint32(1, seed >>> 0, true);
  v.setUint8(5, stage & 0xff);
  v.setUint8(6, difficulty & 0xff);
  v.setUint8(7, chars[0] & 0xff);
  v.setUint8(8, chars[1] & 0xff);
  v.setUint16(9, delay & 0xffff, true);
  return new Uint8Array(b);
}

/** PING / PONG carry an opaque id echoed back, so RTT needs no clock sync. */
export function encodePing(id, type = MSG.PING) {
  const { b, v } = buf(5);
  v.setUint8(0, type);
  v.setUint32(1, id >>> 0, true);
  return new Uint8Array(b);
}

/** HELLO / LOBBY / BYE carry a small JSON body (lobby state, character choices, quit reason). */
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
      if (u.length < 6) return null;
      const baseFrame = v.getUint32(1, true), count = v.getUint8(5);
      if (u.length < 6 + count * 2) return null;
      const masks = new Array(count);
      for (let i = 0; i < count; i++) masks[i] = v.getUint16(6 + i * 2, true);
      return { type, baseFrame, masks };
    }
    case MSG.CHECKSUM:
      return u.length < 9 ? null : { type, frame: v.getUint32(1, true), sum: v.getUint32(5, true) };
    case MSG.START:
      return u.length < 11 ? null : {
        type, seed: v.getUint32(1, true), stage: v.getUint8(5), difficulty: v.getUint8(6),
        chars: [v.getUint8(7), v.getUint8(8)], delay: v.getUint16(9, true),
      };
    case MSG.PING:
    case MSG.PONG:
      return u.length < 5 ? null : { type, id: v.getUint32(1, true) };
    case MSG.HELLO:
    case MSG.LOBBY:
    case MSG.BYE:
      try { return { type, ...JSON.parse(dec.decode(u.subarray(1)) || '{}') }; } catch { return { type }; }
    default:
      return null;
  }
}
