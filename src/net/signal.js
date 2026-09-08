// Signalling strategies: the small out-of-band channel two browsers use to exchange WebRTC
// descriptions before they can talk directly (docs/MULTIPLAYER.md section 3).
//
// A strategy is { send(obj), onMessage(fn), close(), rendezvous? }. `rendezvous: false` marks a
// channel with no live peer (copy-paste), which peer.js treats differently.
//
// All three avoid a server we operate. Note the page is served over HTTPS, so every socket here
// MUST be wss:// - a ws:// URL is blocked as mixed content with no visible error.

import { createParser, encodeConnect, encodeSubscribe, encodePublish, encodePingReq, PKT } from './mqtt-codec.js';

/** Room codes: no vowels (so no accidental words) and no 0/O/1/I/L ambiguity when read aloud. */
const ALPHABET = '23456789BCDFGHJKMNPQRSTVWXYZ';

/** A short, unambiguous, unguessable room code. */
export function makeRoomCode(len = 6) {
  const out = [];
  const buf = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < len; i++) buf[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < len; i++) out.push(ALPHABET[buf[i] % ALPHABET.length]);
  return out.join('');
}

/**
 * Two tabs of the same origin. Zero infrastructure and always available, so it is both the
 * "play on this machine" option and the transport the end-to-end playtest uses.
 */
export function broadcastSignal(room, role) {
  const bc = new BroadcastChannel('aether-brass-net:' + room);
  let handler = null;
  bc.onmessage = (e) => { const m = e.data; if (m && m.role !== role && handler) handler(m); };
  return {
    send(obj) { try { bc.postMessage({ role, ...obj }); } catch { /* channel closed */ } },
    onMessage(fn) { handler = fn; },
    close() { try { bc.close(); } catch { /* already closed */ } },
  };
}

/** Public MQTT brokers over WSS. Tried in order; the first that connects wins. */
export const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

/**
 * Rendezvous through a public MQTT broker. Both peers subscribe to the room topic and publish
 * there; QoS 0 means a message sent before the other side subscribed is simply lost, which is why
 * peer.js repeats its hello until the exchange happens.
 * @returns {Promise<object>} a signal channel, once CONNACK has arrived
 */
export function mqttSignal(room, role, brokers = MQTT_BROKERS) {
  const topic = `aether-and-brass/${room}`;
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= brokers.length) { reject(new Error('no MQTT broker reachable')); return; }
      const url = brokers[i++];
      let ws;
      try { ws = new WebSocket(url, 'mqtt'); } catch { tryNext(); return; }
      ws.binaryType = 'arraybuffer';
      const parser = createParser();
      let handler = null, ping = 0, settled = false;
      const fail = () => { if (settled) return; settled = true; clearInterval(ping); try { ws.close(); } catch { /* ignore */ } tryNext(); };
      const timer = setTimeout(fail, 8000);

      ws.onerror = fail;
      ws.onclose = fail;
      ws.onopen = () => ws.send(encodeConnect(`ab-${role}-${makeRoomCode(8)}`));
      ws.onmessage = (e) => {
        for (const p of parser.push(new Uint8Array(e.data))) {
          if (p.type === PKT.CONNACK) {
            ws.send(encodeSubscribe(1, topic));
            clearTimeout(timer);
            settled = true;
            ping = setInterval(() => { try { ws.send(encodePingReq()); } catch { /* ignore */ } }, 30000);
            resolve({
              send(obj) { try { ws.send(encodePublish(topic, JSON.stringify({ role, ...obj }))); } catch { /* ignore */ } },
              onMessage(fn) { handler = fn; },
              close() { clearInterval(ping); try { ws.close(); } catch { /* ignore */ } },
              url,
            });
          } else if (p.type === PKT.PUBLISH && p.topic === topic && handler) {
            let m = null;
            try { m = JSON.parse(p.payload); } catch { /* not ours */ }
            if (m && m.role !== role) handler(m);   // the broker echoes our own publishes back
          }
        }
      };
    };
    tryNext();
  });
}

/**
 * Copy-paste signalling: no infrastructure at all, works wherever WebRTC does. Non-trickle, so each
 * side produces exactly one code. `onLocal` fires with the code to show the user; feed the code
 * they paste back in through accept().
 */
export function manualSignal({ onLocal }) {
  let handler = null;
  return {
    rendezvous: false,
    send(obj) { if (obj && obj.sdp && onLocal) onLocal(encodeCode(obj.sdp)); },
    onMessage(fn) { handler = fn; },
    /** Feed in a code pasted by the user. Returns false when it is not a valid code. */
    accept(code) {
      const sdp = decodeCode(code);
      if (!sdp || !handler) return false;
      handler({ sdp });
      return true;
    },
    close() { handler = null; },
  };
}

/** SDP -> a compact base64url code. The type is one character; the rest is the description. */
export function encodeCode(desc) {
  const body = JSON.stringify({ t: desc.type === 'offer' ? 'o' : 'a', s: desc.sdp });
  const bytes = new TextEncoder().encode(body);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Inverse of encodeCode. Returns null on anything malformed rather than throwing. */
export function decodeCode(code) {
  try {
    const b64 = String(code).trim().replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const o = JSON.parse(new TextDecoder().decode(bytes));
    if (!o || !o.s || (o.t !== 'o' && o.t !== 'a')) return null;
    return { type: o.t === 'o' ? 'offer' : 'answer', sdp: o.s };
  } catch { return null; }
}
