// Deterministic lockstep frame scheduler (docs/MULTIPLAYER.md, model M1).
//
// Both peers simulate every frame identically and exchange only input masks. This module owns the
// frame bookkeeping and nothing else: it has no knowledge of transports, screens or the World, so
// it is fully unit testable in Node (tools/nettest.js).
//
// Delay is applied when input is RECORDED, not when it is applied: input polled during frame F is
// scheduled for frame F + delay. Both peers do this symmetrically, so a packet's frame numbers are
// already delay-adjusted when they arrive. Frames 0..delay-1 are pre-filled with neutral input so
// the opening frames need no special case.

const RING = 1024;            // ~17s of frames; a stall long enough to wrap is a dead connection
const MASK = RING - 1;

/**
 * @param {{ localSlot: number, delay?: number, redundancy?: number, checksumEvery?: number }} o
 */
export function createLockstep({ localSlot, delay = 3, redundancy = 8, checksumEvery = 30 }) {
  // delay 0 deadlocks: frame 0 would need input neither peer has scheduled yet, and each peer only
  // schedules input for a frame it has already simulated. Zero-delay lockstep needs rollback (M2).
  delay = Math.max(1, delay | 0);
  const remoteSlot = localSlot === 0 ? 1 : 0;
  const masks = [new Uint16Array(RING), new Uint16Array(RING)];
  const stamp = [new Int32Array(RING).fill(-1), new Int32Array(RING).fill(-1)];
  const localSums = new Map();   // frame -> our checksum, pruned as it is compared
  const pendingSums = new Map(); // frame -> their checksum that arrived before ours

  const put = (slot, frame, mask) => {
    if (frame < 0) return;
    const i = frame & MASK;
    if (stamp[slot][i] === frame) return;       // already have it; ignore duplicates from redundancy
    stamp[slot][i] = frame;
    masks[slot][i] = mask & 0xffff;
  };
  const has = (slot, frame) => stamp[slot][frame & MASK] === frame;
  const get = (slot, frame) => (has(slot, frame) ? masks[slot][frame & MASK] : 0);

  // Neutral input for the opening frames: nobody has pressed anything yet.
  for (let f = 0; f < delay; f++) { put(0, f, 0); put(1, f, 0); }

  const ls = {
    /** Next frame to simulate. */
    frame: 0,
    localSlot,
    remoteSlot,
    delay,
    /** Consecutive frames spent waiting for remote input (0 when running). */
    stalled: 0,
    /** Highest frame we have remote input for (diagnostics / connection health). */
    remoteFrame: -1,
    /** Highest frame we have scheduled local input for. */
    lastRecorded: delay - 1,
    /** Set once when the peers' checksums disagree: { frame, mine, theirs }. */
    desync: null,

    /**
     * Record this frame's local device input and return the INPUT packet to send.
     * Call exactly once per simulated frame, before advance().
     */
    recordLocal(mask) {
      const target = ls.frame + delay;
      put(localSlot, target, mask);
      ls.lastRecorded = target;
      return window(target);
    },

    /**
     * The current redundancy window WITHOUT recording new input. Send this on a timer whenever the
     * peer is stalled. Without it, two peers that stall on the same frame never transmit again —
     * each is waiting for input the other will only send after advancing — and the match deadlocks
     * permanently. Cheap insurance: it is the same 22-byte packet.
     */
    resend() { return window(ls.lastRecorded); },

    /** Feed a decoded INPUT message from the peer. */
    receiveInput(baseFrame, list) {
      for (let i = 0; i < list.length; i++) {
        const f = baseFrame + i;
        if (f >= ls.frame + RING) continue;     // absurdly far ahead: ignore rather than corrupt the ring
        put(remoteSlot, f, list[i]);
        if (f > ls.remoteFrame) ls.remoteFrame = f;
      }
    },

    /** True when both players' input for the current frame is known. */
    canAdvance() { return has(0, ls.frame) && has(1, ls.frame); },

    /** Input masks for the current frame as [slot0, slot1]. */
    inputs() { return [get(0, ls.frame), get(1, ls.frame)]; },

    /** Consume the current frame. Call only when canAdvance() is true. */
    advance() { ls.frame++; ls.stalled = 0; },

    /** Call when canAdvance() is false, to age the stall for disconnect detection. */
    stall() { ls.stalled++; },

    /** Should a checksum be exchanged for `frame`? */
    isChecksumFrame(frame) { return frame % checksumEvery === 0; },

    /** Record our own checksum for a frame and compare against anything already received. */
    noteLocalChecksum(frame, sum) {
      const theirs = pendingSums.get(frame);
      if (theirs !== undefined) { pendingSums.delete(frame); compare(frame, sum >>> 0, theirs); return; }
      localSums.set(frame, sum >>> 0);
      if (localSums.size > 64) localSums.delete(localSums.keys().next().value);
    },

    /** Feed a CHECKSUM message from the peer. */
    receiveChecksum(frame, sum) {
      const mine = localSums.get(frame);
      if (mine !== undefined) { localSums.delete(frame); compare(frame, mine, sum >>> 0); return; }
      pendingSums.set(frame, sum >>> 0);
      if (pendingSums.size > 64) pendingSums.delete(pendingSums.keys().next().value);
    },
  };

  function window(target) {
    const from = Math.max(0, target - redundancy + 1);
    const out = [];
    for (let f = from; f <= target; f++) out.push(get(localSlot, f));
    return { baseFrame: from, masks: out };
  }

  function compare(frame, mine, theirs) {
    if (mine !== theirs && !ls.desync) ls.desync = { frame, mine, theirs };
  }

  return ls;
}
