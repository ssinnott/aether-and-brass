// Scripted mid-board events (issue #33, ARCHITECTURE.md section 7): the room changes for a few seconds.
//
// Every section has carried an `events: []` array since board 1 shipped and every one of them was empty except for a
// couple of `kind: 'text'` banners. An event is now a frame-stepped script:
//
//   { id: 'overfire', atX: 5100, once: true, actions: [ { caption: '...' }, { wait: 120 }, ... ] }
//   { id: 'broadside', onWaveClear: 2, actions: [ ... ] }
//
// armed when the trigger position passes `atX` (the same `reach` value wave triggers use — the camera centre, or the
// furthest living player when the camera is pinned at the stage end), or when the section's Nth wave clears.
//
// ================================ ACTION TABLE (stage authors and tools read this) ===========================
// action                                       blocks for        what it does
// { caption, sub?, life? }                     0                 the HUD banner (this is what `kind: 'text'` was)
// { wait: frames }                             frames            the only way a script spends time
// { camera: { shake, frames? } }               0                 camera.shake (visual only, never hashed)
// { sfx: 'name' }                              0                 one sound
// { music: 'track' }                           0                 swap the track (a stinger or a layer)
// { hazardSet: { name, force?, period?, frames? } }  0            force every hazard tagged `name` to 'active' or
//                                                                'idle', and/or retime it; reverts after `frames`,
//                                                                and unconditionally when the event ends
// { zoneFlash: { x0, x1, z0?, z1?, frames?, color? } }  0         a warning patch on the floor BEFORE anything hurts
// { spawn: [spawnSpec] }                       0                 a wave entry, entrances (issue #30) and all
// { prop: { type, x, z, ...opts } }            0                 put a prop down (the Gleaning's dropped carcass)
// ---- story beats (issue #25), all of them scenery: none is a fight, none is hashed -----------------------------
// { actor: { id, def, variant?, x, z, facing?, anim?, vx?, vz?, frames?, life? } }  0   a scripted body (actors.js)
// { walk: { id, vx?, vz?, frames?, anim?, face? } }  0           retarget an actor already on stage
// { sign: { text, sub?, x, z?, style?, life? } }     0           the board's subtitle, lettered on a thing in-world
// { say: { trigger, focus? } }                 0                 raise a companion exchange (game/dialogue.js)
//
// There is deliberately no `hold`: `wait` already is one, and a second name for it would be two ways to spell the
// only action that spends time. Nor does any beat action freeze the player — see the fairness note below.
//
// RULES THE CONTENT MUST KEEP (GDD 6 fairness, restated because a script can break them where a hazard cannot):
// never inside a boss arena, never during a transition, and every event warns before it hurts — a caption plus a
// `zoneFlash` or a tell SFX, with enough `wait` after it for a bot to walk out.
//
// And one that is a SOFT-LOCK, not a fairness problem: a `spawn` action must never introduce a SUMMONER. The wave
// lock clears on `world.waveEnemies.length === 0`, and a unit that produces more enemies on a timer — the Chandlery's
// Resurrection Man tipping Tin Footmen out of his cart is the one in the roster — is an enemy source the count can
// never drain. In an authored wave you stop it by killing him, because he arrived with the wave that is waiting on
// him; dropped in from a script he is simply a section that cannot end.
//
// DETERMINISM. The script is stepped once per sim frame from StageRunner.update and spends time only through `wait`,
// so it is frame-counted rather than wall-clocked. Nothing here consumes the `rng` singleton. `caption`, `camera`,
// `sfx` and `music` are not simulation at all (camera shake is explicitly excluded from net/checksum.js); `spawn`,
// `prop` and `hazardSet` ARE, and they are applied unconditionally on every peer from the same frame.
//
// The runner is deliberately free of engine imports: it reaches the game through the `host` bag the StageRunner
// hands it. That is what lets tools/simtest.js step a whole script in pure Node with no canvas and no audio context.

/** Actions in the order the table above documents them. A script may repeat any of them. */
export const EVENT_ACTIONS = Object.freeze([
  'caption', 'wait', 'camera', 'sfx', 'music', 'hazardSet', 'zoneFlash', 'spawn', 'prop',
  'actor', 'walk', 'sign', 'say',
]);

/**
 * The beat actions (issue #25). Split out because they share one property the combat actions do not: every one of
 * them is SCENERY. None spawns a fight, none changes a hazard, none is hashed by net/checksum.js, and none of them
 * is required to run for the section to be completable — which is exactly what lets `?bot=1` and the test harness
 * skip a whole beat on one peer while the other plays it.
 */
export const BEAT_ACTIONS = Object.freeze(['actor', 'walk', 'sign', 'say']);

/**
 * A payload the runner FORWARDS without looking inside it — every action but `wait` and `camera` is one.
 *
 * Deliberately opaque. game/stage.ts declares the authored vocabulary each of these really is (`PropSpec`,
 * `ActorSpec`, `ZoneFlashSpec`, `HazardSetSpec`, `SaySpec` and the rest) and its `EventAction` is what content is
 * written against; naming those here would mean either duplicating them or importing game/stage.ts, and stage.ts
 * already imports THIS file. The dependency runs one way and the far side declares what it needs structurally —
 * the rule game/entity.ts sets out for `EntityWorld` and game/stage.ts follows for `StageWorld`. It is also what
 * keeps the promise in the note at the top of this file: the runner imports nothing.
 */
export type ActionPayload = object;

/** What `host.hazardSet` hands back for `host.hazardRevert` to spend. Opaque here for the same reason. */
export type HazardRevertToken = object;

/**
 * One action of a script, as the RUNNER sees it: the ACTION TABLE above is the authority on the vocabulary, and
 * `run` dispatches on the key, so an entry carries exactly one action and every field is optional. Only `wait` and
 * `camera` are read into — the rest go to the host untouched. game/stage.ts's `EventAction` is the authored shape
 * and satisfies this.
 */
export interface ScriptAction {
  caption?: string;
  sub?: string;
  life?: number;
  /** The only action that spends time. */
  wait?: number;
  /** The two fields `run` reads off it; game/stage.ts's `CameraCue` is the authored shape. */
  camera?: { shake?: number; frames?: number };
  sfx?: string;
  music?: string;
  hazardSet?: ActionPayload;
  zoneFlash?: ActionPayload;
  /** `run` wraps a bare spec in an array, so an author may write either. */
  spawn?: ActionPayload | ActionPayload[];
  prop?: ActionPayload;
  actor?: ActionPayload;
  walk?: ActionPayload;
  sign?: ActionPayload;
  say?: ActionPayload;
}

/**
 * One event script. `id`, `atX` and `once` are the example at the top of this file; the runner itself reads nothing
 * but `actions`, and game/stage.ts owns the arming fields and the latch because arming is its job.
 */
export interface EventScript {
  id?: string;
  actions?: ScriptAction[];
}

/**
 * Every effect a script can have, injected so this module imports nothing. The four beat actions are optional: a
 * host that does not implement them stages no scenery and the script's timing is unchanged (see `run`).
 */
export interface EventHost {
  caption(text: string, sub: string, life: number): void;
  camera(shake: number, frames: number): void;
  sfx(name: string): void;
  music(track: string): void;
  hazardSet(spec: ActionPayload): HazardRevertToken | null;
  hazardRevert(token: HazardRevertToken): void;
  zoneFlash(spec: ActionPayload): void;
  spawn(specs: ActionPayload[]): void;
  prop(spec: ActionPayload): void;
  actor?(spec: ActionPayload): void;
  walk?(spec: ActionPayload): void;
  sign?(spec: ActionPayload): void;
  say?(spec: ActionPayload): void;
}

/**
 * Runs one section's events. The StageRunner owns exactly one of these and steps it every sim frame.
 *
 * @param host every effect the script can have, injected so this module imports nothing
 */
export class EventRunner {
  // The fields, for the checker only, in constructor order. `declare` because these are the constructor's own
  // assignments and nothing else: a plain field declaration would emit a class field per name (es2022 defines them
  // before the constructor body runs), which is a runtime change. `declare` erases under tsc, esbuild and
  // node --experimental-strip-types alike. Same reasoning, and the same wording, as game/entity.ts and game/world.ts.
  declare host: EventHost;
  /** The event currently running, or null. */
  declare event: EventScript | null;
  /** Index of the next action, and frames still to burn on a `wait`. */
  declare step: number;
  declare waitT: number;
  /** Frames since the event started (what a test asserts against). */
  declare t: number;
  /** hazardSet tokens to hand back when the event ends, newest first. */
  declare pending: HazardRevertToken[];
  constructor(host: EventHost) {
    this.host = host;
    /** The event currently running, or null. */
    this.event = null;
    /** Index of the next action, and frames still to burn on a `wait`. */
    this.step = 0; this.waitT = 0;
    /** Frames since the event started (what a test asserts against). */
    this.t = 0;
    /** hazardSet tokens to hand back when the event ends, newest first. */
    this.pending = [];
  }
  get running(): boolean { return !!this.event; }

  /**
   * Start an event. `once` is the default: the caller latches `ev._done` exactly as wave triggers latch `_state`,
   * so an event never re-arms unless the section is re-entered. A second arm while one is running is ignored
   * rather than queued — two scripts changing the room at once is never what an author meant.
   * @returns true when this event actually started
   */
  arm(ev: EventScript | null): boolean {
    if (this.event || !ev || !Array.isArray(ev.actions)) return false;
    this.event = ev;
    this.step = 0; this.waitT = 0; this.t = 0;
    this.pending = [];
    return true;
  }

  /**
   * One sim frame. Runs every action until it hits a `wait` (or the end), so a run of instant actions all land on
   * the same frame — which is what makes `{ caption }, { sfx }, { zoneFlash }` read as one beat rather than three.
   * @returns true while an event is still running
   */
  update(): boolean {
    if (!this.event) return false;
    this.t++;
    if (this.waitT > 0) { this.waitT--; return true; }
    const list = this.event.actions;
    while (this.step < list.length) {
      const a = list[this.step++];
      const wait = this.run(a);
      // -1 because THIS frame is the first of the wait: the action list is stepped once per sim frame, so a
      // `wait: 5` that stored 5 here would hold for six. `eventLength` quotes the sum of the waits and has to be
      // the number of frames stepping actually takes, or every authored beat drifts by one frame per wait.
      if (wait > 0) { this.waitT = wait - 1; return true; }
    }
    this.finish();
    return false;
  }

  /** Apply one action. @returns frames to block for (only `wait` is ever non-zero). */
  run(a: ScriptAction | null): number {
    if (!a || typeof a !== 'object') return 0;
    if (a.wait != null) return Math.max(0, a.wait | 0);
    if (a.caption != null) this.host.caption(String(a.caption), a.sub || '', a.life || 90);
    if (a.camera) this.host.camera(a.camera.shake || 4, a.camera.frames || 12);
    if (a.sfx) this.host.sfx(a.sfx);
    if (a.music) this.host.music(a.music);
    if (a.zoneFlash) this.host.zoneFlash(a.zoneFlash);
    if (a.hazardSet) { const token = this.host.hazardSet(a.hazardSet); if (token) this.pending.push(token); }
    if (a.spawn) this.host.spawn(Array.isArray(a.spawn) ? a.spawn : [a.spawn]);
    if (a.prop) this.host.prop(a.prop);
    // Beat actions. `host.actor` and friends are optional: a host that does not implement them (the pure-Node
    // recorder in tools/simtest.js used to be one) simply stages no scenery, and the script's timing is unchanged.
    if (a.actor && this.host.actor) this.host.actor(a.actor);
    if (a.walk && this.host.walk) this.host.walk(a.walk);
    if (a.sign && this.host.sign) this.host.sign(a.sign);
    if (a.say && this.host.say) this.host.say(a.say);
    return 0;
  }

  /**
   * The event is over. Every hazard override is handed back here as well as on its own `frames` timer, so a script
   * that ends early — or a section left mid-event — can never strand a vent open for the rest of the board.
   */
  finish(): void {
    for (let i = this.pending.length - 1; i >= 0; i--) this.host.hazardRevert(this.pending[i]);
    this.pending.length = 0;
    this.event = null;
    this.step = 0; this.waitT = 0;
  }

  /** Section change / teardown: stop and revert, without pretending the script completed. */
  cancel(): void { if (this.event) this.finish(); }
}

/**
 * Total frames a script takes, for docs and tests. Only `wait` spends time, so this is just the sum of the waits
 * plus one frame for the run of instant actions that follows the last of them.
 */
export function eventLength(ev: EventScript | null): number {
  let n = 1;
  for (const a of (ev && ev.actions) || []) if (a && a.wait != null) n += Math.max(0, a.wait | 0);
  return n;
}
