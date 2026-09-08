# Online Co-op — Options Brainstorm (no backend)

Status: **exploration only**. Nothing here is implemented. This is a menu of options
with a recommendation, written against the code as of this branch.

Constraint: **no backend we own or operate.** The game must stay a folder of static
files (`tools/build.js` output) served from anywhere — itch.io, GitHub Pages, a USB stick.

---

## 0. TL;DR

The codebase is already ~70% of the way to deterministic lockstep netcode, mostly by
accident of good architecture. The recommended path is:

> **Trystero (public-infrastructure signalling) → WebRTC DataChannel → deterministic
> lockstep with 3-frame input delay → checksum watchdog → bot takeover on desync.**

Total new code: roughly 600–900 lines in a new `src/net/` module, plus a ~40-line
determinism cleanup in existing gameplay files. No changes to combat, AI, or art.

If that turns out to be too much, **Option T4 (canvas streaming)** is a ~200-line
weekend hack that gets two people playing tonight at the cost of guest-side latency.

---

## 1. What the codebase already gives us

I went looking for the things that usually make retrofitting netcode painful. Most of
them are already handled.

| Requirement | Status | Where |
|---|---|---|
| Fixed timestep, decoupled from render | ✅ Exactly 60 Hz | `src/engine/loop.js` — `update()` and `render()` are separate; `step(n)` already drives N updates manually |
| Seeded deterministic RNG | ✅ mulberry32 singleton | `src/engine/rng.js` — `rng.seed(n)`, all gameplay randomness routed through it |
| No hidden randomness in the sim | ✅ (near-perfect) | `Math.random` appears **only** in `engine/camera.js:78` (screen shake) and `engine/audio.js:151` (pitch jitter) — both purely cosmetic, both off-sim |
| No wall-clock in the sim | ✅ | `performance.now()` only in `loop.js` frame pacing; `Date.now()` only for the default seed in `main.js:35` |
| Input funnelled through one place | ✅ | `src/engine/input.js` — one `input.update()` per fixed step |
| **A ready-made remote-input injection point** | ✅ | `input.setVirtual(player, actions)` / `clearVirtual` — already used and battle-tested by `tools/playtest.js` |
| Two player slots wired end to end | ✅ | Bindings, `Player(def, index)` slots 0/1, HUD, drop-in join (`input.joinPressed`), even difficulty scaling (`world.attackTokens.max` → 3 with two players) |
| An AI that can play a character | ✅ | `src/game/bot.js` — and it draws from the seeded `rng`, so **both peers simulate the bot identically** |
| Seed already plumbed as an option | ✅ | `options.seed` in `main.js` |
| Sort stability in the sim | ✅ | Only `.sort()` in `src/game/*` is `world.js:140`, which is inside `draw()` — render-only |

The practical upshot: **we can send 2 bytes per player per frame and both machines will
draw the same game.** That is the cheapest netcode there is, and this codebase is
already shaped for it.

### What's missing

- **No serialization layer.** Entities are class instances with `world` back-references
  and function-valued hooks (`def.hooks`, `def.traits`). There is no `serialize()` /
  `restore()`. This is the single reason rollback netcode is a phase-2 item rather than
  a phase-1 one — delay-based lockstep doesn't need it.
- **No lobby / session concept.** Character select (`screens/select.js`) assumes both
  players are at the same keyboard.
- **A short determinism punch list** — see §5.

---

## 2. Two independent decisions

People conflate these. They're orthogonal, and picking them separately is what makes
this tractable:

1. **Transport** — how do bytes get from one browser to another with no server of ours?
2. **Model** — what bytes, and who is authoritative?

---

## 3. Transport options (the "no backend" part)

The honest framing: WebRTC always needs *some* signalling to exchange connection
descriptions, and often a STUN server to discover public addresses. The trick isn't
avoiding servers entirely — it's avoiding servers **we build, deploy, pay for, or
maintain**.

### T1. Trystero over public infrastructure — **recommended**

A library that does WebRTC room-joining using public BitTorrent trackers, Nostr relays,
or public MQTT brokers as the signalling channel. You pick a strategy, join a room by
string ID, and get peer connections.

```js
import { joinRoom } from 'trystero/nostr';
const room = joinRoom({ appId: 'aether-and-brass' }, roomCode);
const [sendInput, getInput] = room.makeAction('in');
```

- **Ships as:** one bundled dependency, no deployment
- **UX:** host generates a 6-char room code, shares it over Discord/text; guest types it in
- **Cost:** zero
- **Risk:** depends on third-party public infrastructure staying up and unblocked.
  Mitigate by supporting two strategies with automatic fallback (nostr → mqtt → torrent)
  and keeping T2 as the always-works escape hatch.

### T2. Manual copy-paste SDP exchange — the zero-dependency floor

Host clicks "Host", gets a blob of text, pastes it to their friend. Friend pastes it in,
gets an answer blob, pastes it back. Connection established.

- **Ships as:** ~80 lines using raw `RTCPeerConnection`, no dependencies at all
- **Cost:** zero, and depends on nothing but a public STUN server
- **UX:** genuinely clunky — two round trips of copy-paste before you play
- **Worth building anyway** as the "signalling is down / firewalled" fallback. Compress
  the SDP (strip candidates you don't need, deflate + base64) and it's a long-ish code
  rather than a wall of text.

### T3. PeerJS public broker

PeerJS runs a free public signalling broker. Simplest possible API.

- **Pro:** trivial to use, well-known
- **Con:** a single third party's free service — rate-limited, and a single point of
  failure for your entire multiplayer feature. Fine for a prototype, weak as the
  shipping default.

### T4. Public MQTT broker as the *data* transport (not just signalling)

Skip WebRTC entirely. Both peers connect to a public MQTT-over-WebSocket broker and
publish input to a topic.

- **Pro:** dead simple, no NAT traversal problems at all, works where WebRTC doesn't
- **Con:** every packet round-trips through a shared public broker — expect 80–250 ms
  and no delivery guarantees under load. Also, you're putting real-time traffic on
  someone's free service, which is rude at scale.
- **Verdict:** excellent **fallback** when WebRTC fails to connect, unusable as the
  primary path. Pairs naturally with a netcode model that tolerates latency (see M1
  with a larger delay, or M3).

### T5. Canvas streaming ("Parsec in a tab") — the shortcut

Not a netcode model at all — a remote-desktop trick, but it deserves its own line
because of how little code it takes given what already exists:

```js
// Host
const stream = displayCanvas.captureStream(60);
peer.addTrack(stream.getVideoTracks()[0], stream);
dataChannel.onmessage = (e) => input.setVirtual(1, unpackActions(e.data));

// Guest
peer.ontrack = (e) => { videoEl.srcObject = e.streams[0]; };  // that's the whole client
setInterval(() => dataChannel.send(packActions(localInput)), 16);
```

- **Effort:** genuinely ~200 lines. `setVirtual` is the only hook needed and it already
  exists and is already tested.
- **Bandwidth:** 640×360 is tiny — roughly 1–2 Mbps for VP8/H.264 at 60fps
- **Determinism required:** none whatsoever. Zero risk of desync, because there is only
  one simulation.
- **Con:** the guest feels 80–150 ms of latency on *everything*, including their own
  character. In a beat-em-up with parries and dodge i-frames, that's noticeable but not
  fatal. The host has a real advantage. Guest sees compression artifacts on your
  carefully hand-drawn pixel art, which may be the real dealbreaker.
- **Verdict:** the fastest possible path to "I played this with my friend." Good as a
  proof of concept or a permanent "couch mode for people not on the couch" option.
  Not the thing to ship as *the* multiplayer feature.

### The NAT caveat (be honest about this one)

WebRTC peer-to-peer fails between certain NAT configurations — symmetric NAT on both
ends, some corporate/carrier networks. Real-world failure rates land somewhere around
10–15% of random pairs. The standard fix is a TURN relay server, **which is exactly the
backend we said we wouldn't run.**

Options, none perfect:
- Accept it, detect the failure, and show "couldn't connect — try a different network"
- Fall back to T4 (public MQTT relay) with a bigger input delay when WebRTC fails
- Let a user paste their own TURN credentials in an advanced box (some people have one)

This is the one place where "no backend" has a genuine, unavoidable cost. Worth deciding
consciously rather than discovering later.

---

## 4. Netcode model options

### M1. Deterministic lockstep with input delay — **recommended**

Both peers run the identical simulation. Neither sends game state — only **inputs**.
Each peer buffers local input for N frames before applying it, so remote input for
frame `f` arrives before frame `f` is simulated.

```
frame f:  apply(localInput[f - DELAY], remoteInput[f - DELAY]) → update()
          send localInput[f]
```

- **Bandwidth:** `ACTIONS` has 11 entries plus `run` → 12 bits, so **one `uint16` per
  player per frame**. Send the last 8 frames in every packet for free redundancy and it's
  still ~1 KB/s. Use an unreliable/unordered DataChannel; the redundancy replaces
  retransmission.
- **Latency:** input delay = `DELAY` frames. At 3 frames that's 50 ms of local input lag
  and it covers up to ~50 ms of network RTT. A beat-em-up tolerates this far better than
  a fighting game would — you have no 1-frame links, and `INPUT_BUFFER = 8` already
  smooths input timing.
- **Fits the codebase because:** `loop.step(n)` already exists for running N updates
  manually, `setVirtual` already injects input, and the sim is already seeded.
- **Risk:** a single divergence desyncs the game permanently. Mitigated by the checksum
  watchdog (§6) and the determinism cleanup (§5).
- **Adaptive delay:** measure RTT and grow `DELAY` on bad connections rather than
  stuttering. 2 frames on LAN, 6 on a bad link.

### M2. Rollback (GGPO-style) — the phase-2 upgrade

Predict the remote player's input (repeat last frame), simulate immediately with zero
input delay, and when real input arrives and differs, restore a saved state and re-simulate.

- **Feel:** dramatically better than M1 — zero local input lag
- **Blocker:** needs full save/restore of world state every frame. Today's entity classes
  aren't serializable, and there are a lot of them (`world.entities` includes fighters,
  projectiles, items, hazards, props, plus `fx`, `particles`, `camera`).
- **Verdict:** the right destination, the wrong starting point. Build M1 first; the
  transport, the input wire format, the desync detection, and the lobby are all shared.
  If M1 ships and the delay feels bad, add save/restore and upgrade in place.

### M3. Host-authoritative snapshot sync (P2P client-server)

One player's browser is the "server". Host runs the only simulation and broadcasts
entity snapshots at 15–20 Hz; the guest interpolates between them and client-side
predicts only its own character.

- **Bandwidth:** ~40 entities × ~13 bytes (id, type, x/y/z as int16, state, anim frame,
  flags, hp) ≈ 520 B/snapshot → ~10 KB/s. Perfectly fine.
- **Pro:** **no determinism requirement at all.** Immune to cross-browser float
  differences, `Math.sin` variance, everything in §5. Nothing can desync, because the
  guest doesn't simulate.
- **Con:** more code than M1, not less — you need snapshot encode/decode, entity
  interpolation, guest-side prediction and reconciliation for the local character, and a
  visual-only entity representation on the guest. Host still has a latency advantage.
- **Verdict:** the safe choice if determinism proves too brittle in testing. Given how
  clean the RNG and timestep situation already is, I'd bet on M1 first and keep this in
  the back pocket.

### M4. Async / ghost co-op — the "no netcode" option

Not real-time at all. Share a seed and a recorded input stream; play alongside a replay
of your friend's run. Or trade seeded score-attack challenge links.

- **Effort:** very low. You already have deterministic replay for free — record the
  `uint16` input stream, share it with the seed, play it back through `setVirtual`.
- **Verdict:** not co-op in the sense meant here, but it's nearly free given the
  architecture, and it's a genuinely nice feature. Worth noting the input-recording
  work is a strict subset of M1's work — it's a useful first milestone that ships value
  on its own.

---

## 5. Determinism punch list (for M1/M2)

Only IEEE-754 `+ - * /` and `Math.sqrt` are guaranteed bit-identical across JS engines.
**`Math.sin`, `Math.cos`, `Math.pow`, `Math.hypot`, and `Math.atan2` are not** — they're
implementation-defined, and Chrome/Firefox/Safari genuinely differ in the last bits.

The good news: after auditing `src/game/`, almost every trig call is inside a `draw()`
method. Here is the complete list of gameplay-affecting ones:

| Location | Call | Why it matters | Fix |
|---|---|---|---|
| `src/game/hazards.js:51` | `Math.sin` in `get swingX()` | Feeds `world.spawnAreaHit(...)` at `hazards.js:85` — hazard position → collision → damage | Fixed-point sine LUT (`this.t` is already frame-quantised, so a 256-entry table is exact enough) |
| `src/game/projectile.js:98` | `Math.hypot` in homing | Steers projectiles → what they hit | `Math.sqrt(dx*dx + dy*dy)` — `sqrt` is spec-exact and this is a drop-in |
| `src/game/projectile.js:290` | `Math.cos` / `Math.sin` for launch angle | Projectile velocity | Same LUT, or precompute per-spec at load time |

That is the **entire** list — two files, well under 40 lines of change.

`src/engine/math.js:42–44` (`easing.outCubic` / `outBack` / `outElastic`, which use
`Math.pow` and `Math.sin`) look like a risk but aren't: grepping the whole tree, nothing
outside `math.js` references them. They're currently dead code. If they get used later,
keep them out of the sim or make them table-driven.

Everything else — `status.js:131`,
`transitions.js:*`, `items.js:66`, `world.js:151`, and the rest of `hazards.js`/
`projectile.js` — is inside draw code and can stay exactly as it is.

Also worth doing:
- Add a `net-determinism` check to `tools/playtest.js`: run the same seed and input
  script twice, assert identical state checksums at every frame. Cheap regression guard.
- Keep `camera.js` shake and `audio.js` jitter on `Math.random` — they're outside the
  sim and must stay that way. Add a comment saying so, since it now matters.
- Make sure nothing in the sim reads `input.device()`, gamepad state, or canvas size
  directly.

---

## 6. Desync detection and recovery

Lockstep's failure mode is silent divergence, so make it loud:

- Every 30 frames, each peer computes a cheap checksum over sim state — `rng.state` plus
  each fighter's `x, y, z, state, hp` quantised to integers — and sends it with the input
  packet.
- On mismatch: log both checksums with the frame number, then pick a recovery:
  - **Soft:** host re-sends an authoritative state snapshot, guest adopts it (requires
    partial serialization — i.e. some of M3's work)
  - **Hard:** end the session cleanly with "connection desynced", and **hand the second
    character to `bot.js`** so the run isn't lost. This is the cheap one, and it reuses
    code that already exists.
- Same bot handoff on plain disconnect, and on the guest pausing/tabbing out.

`rng.state` is already exposed as a getter and already rendered in the debug overlay
(`main.js` draws `rng:${rng.state}`) — that's a ready-made desync canary during development.

---

## 7. The parts that aren't netcode

Easy to forget, and these are where the schedule actually goes:

- **Lobby/session flow.** Host picks stage + seed and sends them; both peers must agree
  before the first frame. `options.seed` and `options.stage` already exist as the payload.
- **Networked character select.** `screens/select.js` currently assumes one keyboard.
  Needs both peers to confirm before starting, with a ready-check.
- **Pause.** In lockstep, pause is a synchronized *game event*, not a local one — it has
  to go through the input stream, or one peer stalls.
- **Continues / game over.** `screens/gameover.js` continue prompts are per-player and
  timed; both peers must resolve identically.
- **Audio.** Deliberately non-deterministic (pitch jitter) and that's correct — just make
  sure nothing feeds audio state back into the sim.
- **Connection UI.** Room code entry, "waiting for player 2", ping display, disconnect
  toast. Real work, no netcode in it.

---

## 8. Suggested phasing

| Phase | Deliverable | Ships value on its own? |
|---|---|---|
| 0 | Determinism cleanup (§5) + double-run replay assertion in `playtest.js` | Yes — replay/ghost feature, better test coverage |
| 1 | Input recording + playback via `setVirtual` | Yes — M4 async ghosts, attract mode, bug repro |
| 2 | Transport layer (`src/net/`): T2 copy-paste first (no deps), then T1 Trystero | No |
| 3 | M1 lockstep, 3-frame delay, `uint16` input packets, checksum watchdog | **Yes — this is online co-op** |
| 4 | Lobby, networked select, synced pause, disconnect → bot handoff | Yes — makes it shippable |
| 5 | Optional: adaptive delay, MQTT fallback, then M2 rollback | Polish |

Phase 0 and 1 are worth doing regardless of whether online co-op ever ships — they're
just good engineering hygiene for a deterministic game, and they make bug reports
reproducible.

---

## 9. Open questions

1. **How much guest-side latency is acceptable?** This is the single decision that picks
   the model. If 50 ms of input delay is fine → M1. If it must feel local → M2. If we
   want it working this week and don't care → T5.
2. **Is a copy-paste room code acceptable as the always-works fallback,** or does the UX
   need to be one-click-only? (The latter means depending fully on third-party
   infrastructure.)
3. **Do we accept the ~10–15% NAT failure rate,** or is an MQTT relay fallback worth the
   latency hit for those users?
4. **Two players only, or more?** Lockstep bandwidth is trivial at 4 players, but
   `bindings.keyboard` has 2 entries, `Player` slots are `0|1`, and the HUD assumes 2.
   Widening that is a separate chunk of work with no netcode in it.
5. **Cross-browser or same-browser?** Determinism risk drops a lot if we can say "both
   players on Chrome" — though I'd rather just fix §5 and not have that footnote.
