// Signalling strategies: the small out-of-band channel two browsers use to exchange WebRTC
// descriptions before they can talk directly (docs/MULTIPLAYER.md section 3).
//
// A strategy is { send(obj), onMessage(fn), close() }: a live rendezvous both peers can publish to
// before they talk directly. Room codes over MQTT are the one the game offers; BroadcastChannel
// reaches two tabs of a single origin and exists for the end-to-end test.
//
// Both avoid a server we operate. Note the page is served over HTTPS, so every socket here
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
 * Two tabs of the same origin. Zero infrastructure and always available, so it is the transport
 * the end-to-end playtest uses (`?transport=broadcast`); the game's UI only offers room codes.
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
    let lastError = '';
    const tryNext = () => {
      if (i >= brokers.length) { reject(new Error(lastError || 'no MQTT broker reachable')); return; }
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
            // Return code 0 is "accepted". A public broker that is rate-limiting answers with a
            // non-zero code and then closes; treating that as success gives a channel whose every
            // publish is silently swallowed, and disarms the fallback to the next broker.
            const rc = p.body && p.body.length > 1 ? p.body[1] : 0;
            if (rc !== 0) { lastError = `rendezvous refused the connection (0x${rc.toString(16)})`; fail(); return; }
            ws.send(encodeSubscribe(1, topic));
            clearTimeout(timer);
            settled = true;
            ping = setInterval(() => { try { ws.send(encodePingReq()); } catch { /* ignore */ } }, 30000);
            const chan = {
              send(obj) { try { ws.send(encodePublish(topic, JSON.stringify({ role, ...obj }))); } catch { /* ignore */ } },
              onMessage(fn) { handler = fn; },
              close() { clearInterval(ping); try { ws.close(); } catch { /* ignore */ } },
              /** Set by the caller to hear about the rendezvous dying (a broker drop is invisible otherwise). */
              onDown: null,
              url,
            };
            ws.onclose = () => { clearInterval(ping); if (chan.onDown) chan.onDown('rendezvous disconnected'); };
            resolve(chan);
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
