// Signalling for online co-op (docs/MULTIPLAYER.md section 3): the library's two strategies (src/lib/net/signal.ts)
// bound to this game's rendezvous namespace. A room code, the MQTT topic and the BroadcastChannel name are all
// derived from APP_ID, which is what keeps this game's rooms apart from the sibling's on the same public brokers.
import { createSignalling } from '../lib/net/signal.ts';

/** Rendezvous namespace: the MQTT topic prefix (`aether-and-brass/<ROOM>`) and the test channel's name. */
export const APP_ID = 'aether-and-brass';

export { ROOM_ALPHABET, MQTT_BROKERS, makeRoomCode, createSignalMux } from '../lib/net/signal.ts';
export type { Rendezvous, SignalEnvelope, SignalMux, MuxChannel } from '../lib/net/signal.ts';

/** The two strategies: `?transport=broadcast` for the end-to-end test, room codes over MQTT for players. */
export const { broadcastSignal, mqttSignal } = createSignalling({ appId: APP_ID, clientPrefix: 'ab' });
