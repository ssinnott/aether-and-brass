// WebRTC peer connection for online co-op (docs/MULTIPLAYER.md section 3).
//
// The data channel is deliberately UNRELIABLE and UNORDERED. A retransmitted input packet would
// arrive after its frame had already been simulated, so it is worthless, and ordering would let one
// lost packet head-of-line block every packet behind it. protocol.js repeats the last 8 frames in
// every packet instead, which covers loss without any retransmission.
//
// Signalling is pluggable (net/signal-*.js). A signal channel is { send(obj), onMessage(fn), close() }
// and only needs to carry a handful of small JSON objects before the peers talk directly.

/** Public STUN only. A TURN relay would be a server we operate, which the no-backend rule forbids. */
export const DEFAULT_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

/**
 * @param {{ isHost: boolean, signal: object, iceServers?: object[], trickle?: boolean,
 *           onOpen?: () => void, onMessage?: (bytes: Uint8Array) => void,
 *           onClose?: (reason: string) => void, onState?: (state: string) => void }} o
 */
export function createPeer({ isHost, signal, iceServers = DEFAULT_ICE, trickle = true, onOpen, onMessage, onClose, onState }) {
  const pc = new RTCPeerConnection({ iceServers });
  let chan = null;
  let closed = false;
  let offered = false;
  /** ICE candidates that arrived before setRemoteDescription; adding them early throws. */
  const pending = [];

  const state = (s) => { if (onState) onState(s); };

  function wire(c) {
    chan = c;
    c.binaryType = 'arraybuffer';
    c.onopen = () => { state('open'); if (onOpen) onOpen(); };
    c.onmessage = (e) => { if (onMessage) onMessage(new Uint8Array(e.data)); };
    c.onclose = () => close('channel closed');
    c.onerror = () => close('channel error');
  }

  if (isHost) wire(pc.createDataChannel('ab', { ordered: false, maxRetransmits: 0 }));
  else pc.ondatachannel = (e) => wire(e.channel);

  // Trickle sends each candidate as it is found. Copy-paste signalling cannot do that (it would be
  // one code per candidate), so it waits for gathering to finish and ships one description instead.
  pc.onicecandidate = (e) => { if (trickle && e.candidate) signal.send({ cand: e.candidate.toJSON() }); };

  /** Resolve once ICE gathering has finished, so localDescription carries every candidate. */
  function gathered() {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); } };
      pc.addEventListener('icegatheringstatechange', check);
      setTimeout(() => { pc.removeEventListener('icegatheringstatechange', check); resolve(); }, 4000); // ship what we have
    });
  }
  const publish = async (desc) => { if (!trickle) await gathered(); signal.send({ sdp: trickle ? desc : pc.localDescription }); };
  pc.onconnectionstatechange = () => {
    state(pc.connectionState);
    if (pc.connectionState === 'failed') close('connection failed');
    else if (pc.connectionState === 'disconnected') state('disconnected');
  };

  async function makeOffer() {
    if (!isHost || offered) return;
    offered = true;
    const o = await pc.createOffer();
    await pc.setLocalDescription(o);
    await publish(o);
  }

  signal.onMessage(async (m) => {
    if (closed || !m) return;
    try {
      // The rendezvous has no retention: a message sent before the peer subscribed is simply lost.
      // Both sides therefore announce themselves repeatedly until the SDP exchange has happened.
      if (m.hello) { signal.send({ hello: true }); await makeOffer(); return; }
      if (m.sdp) {
        if (m.sdp.type === 'offer' && isHost) return;             // two hosts in one room: ignore
        await pc.setRemoteDescription(m.sdp);
        while (pending.length) await pc.addIceCandidate(pending.shift()).catch(() => {});
        if (m.sdp.type === 'offer') {
          const a = await pc.createAnswer();
          await pc.setLocalDescription(a);
          await publish(a);
        }
      } else if (m.cand) {
        if (pc.remoteDescription) await pc.addIceCandidate(m.cand).catch(() => {});
        else pending.push(m.cand);
      }
    } catch (e) { close('signalling error: ' + (e && e.message ? e.message : e)); }
  });

  // Announce presence until the SDP exchange completes. Without this the peer that arrives second
  // never learns the first one is there, and the connection silently never forms.
  const beat = signal.rendezvous === false ? 0 : setInterval(() => {
    if (closed) return;
    if (pc.remoteDescription) { clearInterval(beat); return; }
    signal.send({ hello: true });
  }, 400);
  if (signal.rendezvous === false) makeOffer();   // copy-paste: produce the offer code immediately
  else signal.send({ hello: true });

  function close(reason = 'closed') {
    if (closed) return;
    closed = true;
    if (beat) clearInterval(beat);
    try { if (chan) chan.close(); } catch { /* ignore */ }
    try { pc.close(); } catch { /* ignore */ }
    try { signal.close(); } catch { /* ignore */ }
    if (onClose) onClose(reason);
  }

  return {
    pc,
    get open() { return !!chan && chan.readyState === 'open'; },
    get closed() { return closed; },
    /** Send bytes. Silently drops when the channel is not open - callers resend by design. */
    send(bytes) {
      if (!chan || chan.readyState !== 'open') return false;
      try { chan.send(bytes); return true; } catch { return false; }
    },
    /** Round-trip time in ms from the selected candidate pair, or null before one is chosen. */
    async rtt() {
      try {
        const stats = await pc.getStats();
        let ms = null;
        stats.forEach((s) => { if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.currentRoundTripTime != null) ms = s.currentRoundTripTime * 1000; });
        return ms;
      } catch { return null; }
    },
    close,
  };
}
