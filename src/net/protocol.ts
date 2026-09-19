// This game's wire format for online co-op (docs/MULTIPLAYER.md). The framing, the message ids and every packet
// but START are the library's (src/lib/net/protocol.ts); this file owns what is this game's: PROTOCOL_VERSION,
// how the 11 actions plus the run flag pack into the uint16 mask, and the START packet with the host's match
// parameters.
//
// Input is the hot path: 11 actions plus a run flag pack into one uint16, so a frame of input for one player is
// 2 bytes. Every INPUT packet repeats the last REDUNDANCY frames, which replaces retransmission entirely: a lost
// packet is covered by the next one. Never make the channel reliable/ordered - a retransmitted input arrives
// after its frame has already been simulated.

import { ACTIONS } from '../engine/input.ts';
import type { RawActions, VirtualActions } from '../engine/input.ts';
import { MSG, packet, decodeMessage as decodeFramed } from '../lib/net/protocol.ts';
import type { StartDecoder } from '../lib/net/protocol.ts';

export { MSG, REDUNDANCY, encodeInput, encodeChecksum, encodeDrop, encodeRelay, encodePing, encodeJson } from '../lib/net/protocol.ts';
export type { Decoded } from '../lib/net/protocol.ts';

/**
 * Bumped whenever ACTIONS, the message layout or a simulation rule changes. Peers compare this in
 * HELLO and refuse to start on a mismatch: GitHub Pages is CDN-cached, so one player can easily be
 * on yesterday's bundle, and a shifted bit would silently turn their 'jump' into someone's 'dodge'.
 *
 * 2 — slot-tagged INPUT/CHECKSUM, variable-length START, RELAY and DROP: the four-player session.
 * 3 — the faction expansion (issue #28). The wire format is untouched at v2, but the SIMULATION is not: six new
 *     enemy defs, the spawn-modifier system (game/traits.js SPAWN_MODS) and rewritten spawn tables for boards 2-4.
 *     Two peers on different bundles agree on every input and still diverge on the first wave, which is exactly the
 *     silent desync this constant exists to turn into an honest "different game version" refusal.
 * 4 — the checksum kernel moved to the library and took its type tags with it (a string, a boolean and null hash
 *     under distinct tags now). Two builds hashing the same simulation differently would report a desync that is
 *     not one, so they must never be allowed to start a match together.
 */
export const PROTOCOL_VERSION = 4;

/** Bit index of `run`, after the 11 actions. Frozen: changing it is a wire break, so bump the version. */
export const RUN_BIT = 11;
if (ACTIONS.length !== RUN_BIT) throw new Error(`net/protocol: ACTIONS changed (${ACTIONS.length}); bump PROTOCOL_VERSION and RUN_BIT`);
/** Pack an action map ({attack:true, run:true, ...}) into a uint16. */
export function packActions(a: RawActions) {
  let m = 0;
  for (let i = 0; i < ACTIONS.length; i++) if (a[ACTIONS[i]]) m |= 1 << i;
  if (a.run) m |= 1 << RUN_BIT;
  return m & 0xffff;
}

/** Unpack a uint16 into an action map suitable for input.setVirtual(). */
export function unpackActions(m: number): VirtualActions {
  // Partial, not RawActions: the loop below fills every key, but it fills them one computed index at
  // a time, and `{}` is only a RawActions once it has. `VirtualActions` is the type setVirtual takes.
  const a: VirtualActions = {};
  for (let i = 0; i < ACTIONS.length; i++) a[ACTIONS[i]] = (m & (1 << i)) !== 0;
  a.run = (m & (1 << RUN_BIT)) !== 0;
  return a;
}

/**
 * START: the host's authoritative session parameters. Every peer seeds from this and begins at
 * frame 0. `chars` is one hero index per slot and its length IS the party size, so a peer never has
 * to be told how many players the match has by any other route.
 */
export function encodeStart({ seed, stage, difficulty, chars, delay }) {
  const n = chars.length;
  const { b, v } = packet(10 + n);
  v.setUint8(0, MSG.START);
  v.setUint32(1, seed >>> 0, true);
  v.setUint8(5, stage & 0xff);
  v.setUint8(6, difficulty & 0xff);
  v.setUint16(7, delay & 0xffff, true);
  v.setUint8(9, n & 0xff);
  for (let i = 0; i < n; i++) v.setUint8(10 + i, chars[i] & 0xff);
  return new Uint8Array(b);
}

/** The START half of `decodeMessage`: the library frames everything else. */
const decodeStart: StartDecoder = (u, v) => {
  if (u.length < 10) return null;
  const n = v.getUint8(9);
  if (u.length < 10 + n) return null;
  const chars = new Array<number>(n);
  for (let i = 0; i < n; i++) chars[i] = v.getUint8(10 + i);
  return { seed: v.getUint32(1, true), stage: v.getUint8(5), difficulty: v.getUint8(6), delay: v.getUint16(7, true), chars };
};

/**
 * Decode any message. Returns null for an empty or unknown packet rather than throwing. `any`, as it always was
 * here: net/session.ts reads each message's fields by its `type`, and the START one is handed straight to
 * beginMatch.
 */
export function decodeMessage(bytes: Uint8Array | ArrayBuffer): any { return decodeFramed(bytes, decodeStart); }
