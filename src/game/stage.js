// StageRunner (ARCHITECTURE.md section 7, GDD section 6): sections + backdrops, wave director with camera locks,
// side / sky spawns with delays, reinforcements, timed waves for locked sections, props / hazards / zones, GO arrow,
// scripted transitions (lift, funicular boarding, docking), mid-boss and boss triggers with intro cutscene / spotlight /
// name plates, the defeat spectacle and results after a 240f pose hold.
import { VIEW_W, VIEW_H, FLOOR_TOP, Z_MAX, ST, UI, WAVE_EXTRA_BY_PARTY, PARTY_EXTRA_DELAY } from '../constants.js';
import { createBackdrop, backdropsReady } from '../art/backgrounds/index.js';
import { Prop } from './items.js';
import { Hazard } from './hazards.js';
import { Zone, ZoneFlash } from './zones.js';
import { Transition, drawSpotlight, VictorySpectacle } from './transitions.js';
import { entranceFor, entranceLanding, EntranceTell, teleportShove } from './entrances.js';
import { createPlatform } from './platforms.js';
import { EventRunner } from './events.js';
import { Actor, Sign } from './actors.js';
import { Dialogue, PLATE_COOLDOWN } from './dialogue.js';
import { STRIP_H } from './hud.js';
import { getEnemyDef } from '../content/enemies/index.js';
import { CHARACTERS, getCharacter } from '../content/characters/index.js';
import { BANTER, SOLO } from '../content/characters/lines.js';
import { clamp } from '../engine/math.js';
import { audio } from '../engine/audio.js';
import { particles } from '../engine/particles.js';
import { floatText } from '../art/fx.js';
import { ease } from '../art/poses.js';

const SPAWN_MARGIN = 50;
const GO_FRAMES = 150;
const NO_DAMAGE_BONUS = 1000;   // GDD 7 scoring: a wave cleared without any player being hit
/** Frames a wave may run with nothing hurt and nothing killed before its survivors are pressed in (checkWaveStall). */
const WAVE_STALL_FRAMES = 600;
/** Pose hold after the boss defeat spectacle before the results (GDD 6). */
const VICTORY_FRAMES = 240;
const PLATE_FRAMES = 170, SPOTLIGHT_FRAMES = 110, DESCENT_FRAMES = 120, DAIS_SHRINK = 20;
/** Combo the `combo20` companion line fires on — the BRASSY grade boundary (game/player.js GRADES). */
const COMBO_LINE = 20;
/**
 * Frames after a boss name plate before the heroes answer it.
 *
 * It is DERIVED from the dialogue cooldown rather than picked, because the boss speaks first: `showPlate` raises the
 * boss's own arrival line, which takes the floor for `PLATE_COOLDOWN` frames and outranks every hero trigger. A
 * reply scheduled inside that window is not delayed, it is DROPPED — so a hand-picked 70 against a cooldown of 90
 * meant no hero ever answered a boss at all.
 */
const BOSS_REPLY_DELAY = PLATE_COOLDOWN + 24;
/** The same, for a section opening — long enough that the section name plate has been read first. */
const SECTION_REPLY_DELAY = 50;
/** Life of a dock transition's arrival banner. */
const DOCK_BANNER_LIFE = 60;
/**
 * The story-beat LETTERBOX. A beat is the one moment the game narrates at you while you still hold the controls, and
 * with nothing on screen to mark it "the opening is still running" and "the opening finished and the quay is simply
 * quiet" look exactly alike -- which is the whole of why an intro was hard to tell the end of. Two bars slide in with
 * the beat and slide back out when it ends, so the state is something the screen says rather than something the
 * player infers from a caption they may not have been looking at.
 *
 * The depth is DERIVED rather than picked: FLOOR_TOP + Z_MAX is the bottom edge of the floor band, so a bar this deep
 * is exactly the strip below the last row any body can stand on. The letterbox can never cover a pair of feet.
 */
const CINEMA_H = VIEW_H - (FLOOR_TOP + Z_MAX);
/** Frames the bars take to slide in, and the same again to slide back out. */
const CINEMA_SLIDE = 18;

/** Drives one stage for a World. The gameplay screen owns it and forwards update()/draw(). */
export class StageRunner {
  /**
   * @param {import('./world.js').World} world
   * @param {object} stage stage data (content/stage/stage1.js)
   * @param {{ game: object, hud: object, screen: object, nowaves?: boolean, startSection?: number, startEvent?: string }} o
   */
  constructor(world, stage, { game, hud, screen, nowaves = false, startSection = 0, startEvent = '' }) {
    this.world = world; this.stage = stage; this.game = game; this.hud = hud; this.screen = screen;
    this.nowaves = nowaves;
    this.sections = stage.sections;
    this.sectionIndex = -1;
    this.frame = 0;
    this.pending = [];            // [{ at, spec, x, z, facing }]
    this.activeWave = null;       // { wave, reinforced }
    this.wavesCleared = 0;
    this.goTimer = 0;
    this.sectionTimer = 0; this.timedIndex = 0; this.timedDone = false;
    this.midbossState = 'none'; this.bossState = 'none'; this.bossEntity = null;
    this.victoryTimer = -1; this.finished = false; this.spectacle = null;
    this.transition = null; this.plate = null; this.pendingPlate = null; this.spotlightT = -1;
    this.music = '';
    this.startSection = clamp(startSection | 0, 0, this.sections.length - 1);
    /** `?event=<id>` (issue #33): jump to this scripted event instead of the section start. */
    this.startEventId = startEvent || '';
    this.forceEvents = false;
    /**
     * Story beats (issue #25). OFF for the bot and for `?nowaves`, which is what keeps tools/winrate.js and the
     * playtest scenarios seeing exactly the run they saw before: the bot draws from the shared rng on every frame it
     * plays, so a beat that merely made a run LONGER would move every winrate number at a fixed seed.
     *
     * This is peer-local and that is safe, because nothing a beat does is simulation — no rng draw, no hashed
     * entity, no hazard. See the determinism notes in game/actors.js and game/dialogue.js.
     */
    this.beats = !nowaves && !(game && game.options && game.options.bot);
    /** @type {import('./actors.js').Actor[]} bodies the running beat put on stage, dropped when it ends */
    this.actors = [];
    /** @type {import('./actors.js').Sign[]} lettered boards the running beat put up, dropped with it */
    this.signs = [];
    /** Letterbox travel in frames, 0..CINEMA_SLIDE: counts up while a beat runs and back down once it is over. */
    this.cinemaT = 0;
    /** A scheduled exchange: `{ trigger, t, focus }`, counted down in update(). See saySoon(). */
    this.pendingSay = null;
    /** Last frame's `out` / `combo` per slot — the edges pollDialogue() turns into triggers. */
    this.wasOut = null; this.wasCombo = null;
    this.dialogue = new Dialogue({ banter: BANTER, solo: SOLO, order: CHARACTERS.map((c) => c.id) }, { enabled: this.beats });
    world.stage = this;
    world.spawnEnemy = (type, variant, x, z, opts) => this.screen.spawnEnemyAt(type, variant, x, z, opts);
    world.announce = (text, sub, life) => this.hud.showBanner(text, sub, life);
    world.onBossSpawn = (b) => this.onBossSpawn(b);
    /**
     * A boss's own call-out (issue #25). Read from `b.baseDef`, never `b.def`: `mergePhase` (game/boss.js) REPLACES
     * every non-`ai` key of the def on a phase change, so by phase 2 `b.def.lines` is whatever that phase's override
     * happened to carry — which is nothing.
     */
    world.bossLine = (b, key, phase) => {
      const lines = b && b.baseDef && b.baseDef.lines;
      if (!lines || !this.dialogue) return false;
      const text = key === 'defeat' ? lines.defeat : (lines.phase || [])[phase | 0];
      return text ? this.dialogue.shout(b, text) : false;
    };
    /**
     * Scripted mid-board events (issue #33). The runner itself imports nothing from the engine — every effect it can
     * have is in this bag — which is what lets tools/simtest.js step a whole script in pure Node with no canvas.
     */
    this.events = new EventRunner({
      caption: (text, sub, life) => this.hud.showBanner(text, sub, life),
      camera: (shake, frames) => this.world.camera.shake(shake, frames),
      sfx: (name) => audio.play(name),
      music: (track) => this.playMusic(track),
      hazardSet: (spec) => this.hazardSet(spec),
      hazardRevert: (token) => this.hazardRevert(token),
      zoneFlash: (spec) => this.world.add(new ZoneFlash(spec)),
      spawn: (specs) => this.eventSpawn(specs),
      prop: (spec) => this.world.spawnProp(spec.type, spec.x, spec.z, spec),
      // Story-beat actions (issue #25). Every one is scenery, and every one is a no-op when beats are off, so a
      // peer running `?bot=1` steps the SAME script for the same number of frames and simply stages nothing.
      actor: (spec) => this.spawnActor(spec),
      walk: (spec) => this.walkActor(spec),
      sign: (spec) => this.spawnSign(spec),
      say: (spec) => this.say(spec && spec.trigger, spec || {}),
    });
  }

  // --------------------------------------------------------------------------------------------------------------
  // Story beats (issue #25)
  // --------------------------------------------------------------------------------------------------------------
  /**
   * Put a scripted body on stage. The def is resolved from the enemy roster, or from the hero roster when the spec
   * names a character — a beat stages both (dock hands on board 1, a chained Brassbound on board 3).
   *
   * Deliberately NOT routed through `eventSpawn`: that starts a wave and locks the camera behind it, and an actor
   * that locked the camera would be a section the player could never walk out of.
   */
  spawnActor(spec) {
    if (!this.beats || !spec) return null;
    const def = resolveActorDef(spec, this.game);
    if (!def) return null;
    const a = new Actor(def, { id: spec.id || '', x: spec.x || 0, z: spec.z != null ? spec.z : 70, facing: spec.facing || 1, anim: spec.anim || 'idle', life: spec.life || 0 });
    if (spec.vx || spec.vz || spec.frames) a.push({ vx: spec.vx || 0, vz: spec.vz || 0, frames: spec.frames || 0, anim: spec.anim || '', face: spec.face || 0 });
    this.actors.push(a);
    this.world.add(a);
    return a;
  }

  /**
   * Letter the board's name on something standing in the world. Tracked alongside the actors rather than left to its
   * own `life` timer: a sign belongs to the beat that put it up, and a section left early (a speedrun, `?nowaves`,
   * a debug jump) must not carry a hoarding into the next backdrop.
   */
  spawnSign(spec) {
    if (!this.beats || !spec) return null;
    const s = new Sign(spec);
    this.signs.push(s);
    this.world.add(s);
    return s;
  }

  /** Retarget an actor already on stage, addressed by the `id` its `actor` action gave it. */
  walkActor(spec) {
    if (!this.beats || !spec) return;
    for (const a of this.actors) {
      if (a.removeMe || (spec.id && a.actorId !== spec.id)) continue;
      a.retarget({ vx: spec.vx || 0, vz: spec.vz || 0, frames: spec.frames || 0, anim: spec.anim || '', face: spec.face || 0 });
      if (spec.id) return;
    }
  }

  /**
   * True while a story beat is holding the wave director (issue #25). A beat holds the SECTION as well as the wave,
   * because the two would otherwise come apart: with no waves to stop them, a player who runs rather than walks
   * covers about 1900px in the eight seconds of board 1's opening, and section 1 ends at 1800 — they would cross
   * into Foundry Row having skipped every fight on the quay.
   *
   * `outrun` is the safety valve on that, and it is what makes the hold impossible to get stuck behind: however
   * fast the party moves, the beat is cancelled the moment they reach the section's last authored wave, and the
   * section plays out normally from wherever they are.
   */
  get holdingWaves() { return !!(this.events.running && this.events.event && this.events.event.holdWaves); }

  /** The furthest authored trigger in this section: past it, a beat has nothing left to hold and stands down. */
  outrunAt(sec) {
    let x = -Infinity;
    for (const w of sec.waves || []) if (w.triggerX > x) x = w.triggerX;
    const tr = sec.transition;
    if (tr && tr.atX != null && tr.atX < x) x = tr.atX;
    return x;
  }

  /**
   * True while a STORY beat is running. Deliberately keyed on `beat: true` rather than on "an event is running": a
   * mid-board combat script (the over-fire, the broadside) is a thing happening TO the player in the middle of a
   * fight, not a scene, and framing one would say the fight had stopped when it very much has not.
   */
  get beatRunning() { return !!(this.events.running && this.events.event && this.events.event.beat); }

  /**
   * Step the letterbox one frame toward open or shut.
   *
   * Driven from "is a beat running THIS frame" rather than from the places a beat starts and stops, because a beat
   * ends four different ways -- its script running out, the outrun valve, a section change, and a `?event=` jump --
   * and a close that had to be remembered at each of them is a close that will be forgotten at one of them. This
   * also gives the retract for free when a beat is cut off mid-caption, which is the case that most needs it.
   */
  updateCinema() {
    if (this.beatRunning) { if (this.cinemaT < CINEMA_SLIDE) this.cinemaT++; }
    else if (this.cinemaT > 0) this.cinemaT--;
  }

  /** Stop a running beat early and strike everything it staged. The script's own end goes through clearActors(). */
  endBeat() { this.events.cancel(); this.clearActors(); }

  /** Drop everything a beat put on stage — bodies and lettering alike (the beat ended, or the section changed). */
  clearActors() {
    for (const a of this.actors) { a.removeMe = true; a.alive = false; }
    for (const s of this.signs) { s.removeMe = true; s.alive = false; }
    this.actors.length = 0; this.signs.length = 0;
  }

  /**
   * Raise a companion exchange. Every trigger in the game funnels through here so that the "one plate at a time"
   * rule is enforced in exactly one place, and so the whole system can be switched off with a single flag.
   *
   * @param {string} trigger one of dialogue.TRIGGERS
   * @param {{ focus?: object, row?: number|null }} [o] the hero the moment belongs to, when there is one, and the
   *   authored row an opening beat names so that board 3 hears board 3's exchange (see Dialogue.index)
   */
  say(trigger, { focus = null, row = null } = {}) {
    if (!this.dialogue || !trigger) return false;
    return this.dialogue.say(trigger, this.world.players, this.world.frame, { focus, row });
  }

  /**
   * The same, `delay` frames from now. Several triggers fire on the exact frame something ELSE is already asking for
   * the player's attention — a section banner, a boss name plate — and a line that lands on that frame is a line
   * nobody reads. One slot, so a later schedule replaces an earlier one rather than stacking.
   */
  saySoon(trigger, delay, { focus = null } = {}) {
    if (!this.dialogue || !trigger) return;
    this.pendingSay = { trigger, t: Math.max(1, delay | 0), focus };
  }

  /**
   * Three of the seven dialogue triggers are EDGES in player state rather than events anybody raises: a partner
   * going out, a partner coming back on a continue, and a combo crossing 20. They are polled here, in one place,
   * for two reasons.
   *
   * The first is that the alternative is three call sites scattered through player.js, hud.js and gameplay.js, each
   * of which would have to reach back to the runner for a system none of them otherwise knows about.
   *
   * The second is correctness, and it is specific: the combo counter does not step by one. An air hit adds
   * AIR_HIT_COMBO (2), so a combo can go 19 -> 21 and an `=== 20` test never fires at all. Only a CROSSING test is
   * right, and a crossing test needs last frame's value, which is what this poll keeps.
   *
   * Deterministic: `p.out` and `p.combo` are simulation state, agreed by lockstep before this runs.
   */
  pollDialogue() {
    const ps = this.world.players;
    // Both baselines are seeded from LIVE state, never from zero. The player list grows when somebody drops in
    // mid-run (game/party.js), and a zeroed combo baseline turns every combo already past 20 into a fresh crossing
    // on that frame — the party gains a player and the hero mid-combo congratulates themselves again.
    if (!this.wasOut || this.wasOut.length !== ps.length) {
      this.wasOut = ps.map((p) => !!(p && p.out));
      this.wasCombo = ps.map((p) => (p ? p.combo | 0 : 0));
    }
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p) continue;
      const out = !!p.out, combo = p.combo | 0;
      // A partner going out is about the OTHER hero, so the survivor speaks first and the one who went out answers.
      if (out && !this.wasOut[i]) this.say('partnerDown', { focus: ps.find((q) => q && q !== p && !q.out) || null });
      else if (!out && this.wasOut[i]) this.say('partnerContinue', { focus: p });
      else if (combo >= COMBO_LINE && this.wasCombo[i] < COMBO_LINE) this.say('combo20', { focus: p });
      this.wasOut[i] = out; this.wasCombo[i] = combo;
    }
  }
  /**
   * An event's `spawn` action (issue #33). These are a real encounter, not strays: if a wave is running they join it
   * as reinforcements, and if none is they START one, which locks the camera behind them.
   *
   * That lock is the whole point. An `onWaveClear` event fires from clearWave, which has already UNLOCKED the camera,
   * so units queued straight into the world have the entire stage to back into — and a ranged variant in
   * KEEP_DISTANCE (a Tallyman, a Slinger) kites away indefinitely. A human walks past it; the autopilot cannot,
   * because it still has a live target, so it never walks right and the run never reaches the next trigger. That is
   * a STALL rather than a loss, and tools/winrate.js counts an unfinished run as a failure.
   */
  eventSpawn(specs) {
    if (!specs || !specs.length) return;
    if (this.activeWave) { this.queueSpawns(specs); return; }
    this.startWave({ spawns: specs }, true);
  }
  /**
   * `hazardSet` action: force every hazard tagged `name` into a phase and/or retime it, and hand back a token that
   * restores exactly what was there. Writing through `h.info` would retime that hazard TYPE on every board for the
   * rest of the page load (HAZARD_TYPES is a shared live table), so only per-instance fields are ever touched.
   * @returns {{ hazards: Array<{h: object, forcePhase: object|null, period: number, offset: number}> }|null}
   */
  hazardSet(spec) {
    const name = spec && spec.name;
    if (!name) return null;
    const token = { hazards: [] };
    for (const e of this.world.entities) {
      if (!e.isHazard || e.removeMe || e.name !== name) continue;
      token.hazards.push({ h: e, forcePhase: e.forcePhase, period: e.period, offset: e.offset });
      if (spec.force !== undefined) {
        e.forcePhase = spec.force ? { phase: spec.force, until: spec.frames ? this.world.frame + spec.frames : null } : null;
      }
      // Retiming re-solves `offset` so the hazard stays at the same fraction of its cycle. Setting `period` alone
      // makes (world.frame + offset) % period jump, which can drop a hazard straight into 'active' with no tell --
      // the one thing GDD 6 says a hazard may never do.
      if (spec.period) {
        const frac = e.period ? (((this.world.frame + e.offset) % e.period) / e.period) : 0;
        e.period = spec.period;
        // Normalised to [0, period): Hazard.update does `(world.frame + offset) % period` and a NEGATIVE offset
        // makes that expression negative in JS, which parks the hazard below its own tellStart forever -- it would
        // simply never fire again, silently, for the rest of the board.
        const raw = Math.round(frac * spec.period) - (this.world.frame % spec.period);
        e.offset = ((raw % spec.period) + spec.period) % spec.period;
      }
    }
    return token.hazards.length ? token : null;
  }
  /**
   * Undo a `hazardSet` (its own `frames` timer, or the event ending). Restoring `period` re-solves `offset` for the
   * SAME reason setting it does: `(world.frame + offset) % period` has moved on while the override was in force, so
   * putting the old pair back raw can drop the hazard straight into 'active' with no tell — which GDD 6 forbids, and
   * which is nastier on the way back than on the way out because nobody is expecting the room to change again.
   */
  hazardRevert(token) {
    for (const t of (token && token.hazards) || []) {
      t.h.forcePhase = t.forcePhase;
      if (t.h.period !== t.period) {
        const frac = t.h.period ? (((this.world.frame + t.h.offset) % t.h.period) / t.h.period) : 0;
        const raw = Math.round(frac * t.period) - (this.world.frame % t.period);
        t.h.period = t.period;
        t.h.offset = ((raw % t.period) + t.period) % t.period;
      } else t.h.offset = t.offset;
    }
  }

  /** Place every prop / hazard / zone, position the camera, enter the first section. */
  start() {
    for (const sec of this.sections) {
      // every extra field of a prop entry (release / dump / solid / rider / fire ...) is forwarded to the Prop as-is: items.js owns the meaning
      // every extra field of a prop row reaches the Prop through this spread, but Prop's constructor destructures a
      // CLOSED list -- a new stage-data field (issue #34 `cargo` / `name`) has to be added there too or it is dropped
      for (const p of sec.props || []) this.world.add(new Prop(p.type, p.x, p.z, { ...p, drops: p.drops !== undefined ? p.drops : null, hp: p.hp || 0 }));
      if (!this.nowaves) for (const h of sec.hazards || []) this.world.add(new Hazard(h));
      for (const z of sec.zones || []) this.world.add(new Zone(z));
      for (const w of sec.waves || []) w._state = 'idle';
      if (sec.transition) sec.transition._done = false;
      for (const ev of sec.events || []) ev._done = false;
    }
    // `?event=<id>`: resolve the id to the section that owns it and start there, just short of its trigger, so an
    // author can iterate on one event without replaying the board. `forceEvents` lets it run under ?nowaves=1 too.
    let jumpTo = null;
    if (this.startEventId) {
      for (let i = 0; i < this.sections.length && !jumpTo; i++) {
        for (const ev of this.sections[i].events || []) if (ev.id === this.startEventId) { jumpTo = { i, ev }; break; }
      }
      if (jumpTo) { this.startSection = jumpTo.i; this.forceEvents = true; }
    }
    const sec = this.sections[this.startSection];
    // debug section skips start past earlier bosses
    if (this.stage.midboss && sec.x0 > this.stage.midboss.atX) this.midbossState = 'done';
    if (this.stage.boss && sec.x0 > this.stage.boss.atX) this.bossState = 'done';
    if (this.startSection > 0 || jumpTo) {
      // land just short of an `atX` event so the walk into it is the thing being iterated on
      const x = jumpTo && jumpTo.ev.atX != null ? Math.max(sec.x0 + 40, jumpTo.ev.atX - VIEW_W / 2 - 60) : sec.x0 + 40;
      this.world.camera.snapTo(x);
      this.world.camera.minX = Math.max(0, x);
      for (const p of this.world.players) p.x = x + 100 + (p.index || 0) * 40;
      for (let i = 0; i < this.startSection; i++) if (this.sections[i].transition) this.sections[i].transition._done = true;
    }
    this.enterSection(this.startSection, true);
    // the per-section art modules load asynchronously; swap the placeholder for the real backdrop once they are in
    this.alive = true;
    backdropsReady().then(() => { if (this.alive && this.sectionIndex >= 0) this.screen.setBackdrop(createBackdrop(this.section, this.stage)); });
  }
  /** Stop swapping backdrops after the screen exits. */
  dispose() { this.alive = false; }

  /** Section index containing world x. */
  sectionAt(x) { for (let i = this.sections.length - 1; i >= 0; i--) if (x >= this.sections[i].x0) return i; return 0; }
  get section() { return this.sections[this.sectionIndex] || this.sections[0]; }
  get busy() { return !!this.activeWave || this.pending.length > 0 || this.bossActive || !!this.transition; }
  get bossActive() { return this.midbossState === 'active' || this.bossState === 'active'; }

  enterSection(i, first = false) {
    if (i === this.sectionIndex) return;
    const sec = this.sections[i];
    this.sectionIndex = i;
    this.world.sectionIndex = i;
    if (!first) for (const p of this.world.players) if (p.discardWeapon) p.discardWeapon(); // GDD 7: a pickup weapon is not carried into the next section
    this.screen.setBackdrop(createBackdrop(sec, this.stage));
    const track = (this.stage.music && this.stage.music[sec.backdrop]) || sec.backdrop;
    this.playMusic(track);
    this.sectionTimer = 0; this.timedIndex = 0; this.timedDone = !(sec.timedWaves && sec.timedWaves.length);
    // waves cleared IN THIS SECTION. `wavesCleared` is a stage-wide running total, which would make an author write
    // `onWaveClear: 14` to mean "after the second wave of the last section"; this is the number they actually mean.
    this.sectionWaves = 0;
    // issue #32: the section's moving floor, if it has one. Built here (the only place a section is entered from --
    // update() and Transition.switchSection both come through here) and thrown away with the section, keyed to the
    // world frame we arrived on so its whole phase is derivable rather than stored.
    this.platform = createPlatform(sec, this.world.frame);
    this.world.platform = this.platform;
    // a script belongs to the section that authored it: leaving mid-event reverts every hazard override it made
    if (this.events) this.events.cancel();
    // ...and so do the bodies and the conversation it staged. An actor is scenery for one beat; carrying one into
    // the next section would leave a dock hand walking through Foundry Row.
    this.clearActors();
    if (this.dialogue) this.dialogue.reset();
    // The section enter STINGER (issue #25) is the board doc's own line for this room, and it rides the section
    // name plate's subtitle rather than a banner of its own: `showBanner` is one slot and the last write wins, so a
    // second call here would simply delete the section name. A stinger also earns 30 more frames to be read in.
    if (!first || this.startSection > 0) {
      const sub = (this.beats && sec.stinger) || sec.sub || '';
      this.hud.showBanner(sec.name || sec.id.toUpperCase(), sub, sub === sec.stinger && sub ? 120 : 90);
    }
    if (sec.mode === 'locked' && !this.nowaves) this.world.camera.lock(sec.x0, sec.x1);
    // "a new room opened" is the most-fired dialogue trigger, and it is scheduled rather than said: on the frame a
    // section opens the player is already reading its name plate, and the first section of a run opens on frame 0,
    // before the board has drawn once.
    this.saySoon('sectionStart', SECTION_REPLY_DELAY);
  }
  playMusic(track) { if (track && track !== this.music) { this.music = track; this.game.audio.music.play(track); } }

  // ---------- per-step ----------
  update() {
    this.frame++;
    const world = this.world, cam = world.camera, center = cam.x + VIEW_W / 2;
    // Companion plates age HERE, at the very top, above the transition early-return below: a line raised as a
    // section opened has to keep ticking through the lift ride that follows it, or it would hang on screen for the
    // whole transition and then vanish the instant the party got control back.
    if (this.dialogue) this.dialogue.update();
    if (this.beats) this.pollDialogue();
    if (this.pendingSay && --this.pendingSay.t <= 0) { const s = this.pendingSay; this.pendingSay = null; this.say(s.trigger, { focus: s.focus }); }
    if (this.plate && ++this.plate.timer >= this.plate.life) this.plate = null;
    if (this.spotlightT >= 0 && ++this.spotlightT > SPOTLIGHT_FRAMES) this.spotlightT = -1;
    // The letterbox ages HERE, above the transition early-return, for the same reason the companion plates do: a
    // beat cut short by a section change has to finish retracting rather than hang open behind the lift ride.
    this.updateCinema();
    // The platform is stepped BEFORE the transition early-return: a hoist does not stop climbing because the party is
    // boarding something. `carry` is false during a transition so its clock runs on while nothing shoves a held body.
    if (this.platform) this.platform.update(world, !this.transition);
    if (this.transition) { this.holdPlayers(); if (this.transition.update()) this.endTransition(); return; }
    // section by camera centre; a section whose exit is a scripted transition is left through that transition instead.
    // A beat holding the wave director holds this too — see `holdingWaves`: leaving the section mid-beat is how a
    // running player would skip every fight the section had.
    const next = this.sectionAt(center);
    if (next > this.sectionIndex && !this.holdingWaves) {
      const tr = this.section.transition;
      if (tr && !tr._done && !this.bossActive && !this.nowaves) { this.startTransition(tr); return; }
      this.enterSection(next);
    }
    if (this.goTimer > 0) this.goTimer--;
    // The event script is stepped HERE, above the victory / boss / nowaves returns, because checkTriggers is not
    // frame-stepped at all -- it does not run while a wave is active, and a script driven from there would stall
    // for the whole of its own wave. Arming still happens down there, where `reach` already exists.
    // A beat's cast belongs to the beat. When the script finishes, the bodies it staged walk off with it rather than
    // being left standing in the middle of the next wave.
    if (this.events.running && !this.events.update()) this.clearActors();
    if (this.victoryTimer >= 0) {
      if (this.spectacle) this.spectacle.update();
      if (++this.victoryTimer >= VICTORY_FRAMES && !this.finished) { this.finished = true; this.screen.onVictory(); }
      return;
    }
    if (this.bossActive) { this.updateBoss(); return; }
    // The pending-spawn queue is drained even in the free-roam test arena: `nowaves` stops the runner TRIGGERING
    // waves, and with nothing triggering them `pending` is empty, so this is a no-op there — except when a test
    // has queued a spawn itself through `spawnEntrance` (issue #30), which is the only way to watch an entrance's
    // tell / arrival / punish frames without a wave running on top of it.
    this.updateSpawns();
    if (this.nowaves) return;
    // trigger position: camera centre, or the furthest living player when the camera is pinned at the stage end
    let reach = center;
    for (const p of world.players) if (p && p.alive && !p.dead && !p.out && p.x > reach) reach = p.x;
    if (this.section.mode === 'locked' && !this.timedDone) this.updateTimed();
    if (this.activeWave) this.updateWave();
    else this.checkTriggers(reach);
  }
  /** Locked section: waves fire at `at` seconds since the section started, or as soon as the previous wave is cleared. */
  updateTimed() {
    const sec = this.section, list = sec.timedWaves || [];
    this.sectionTimer++;
    if (this.timedIndex >= list.length) return;
    const tw = list[this.timedIndex];
    const timeUp = this.sectionTimer >= (tw.at || 0) * 60;
    const clear = this.timedIndex > 0 && !this.activeWave && !this.pending.length;
    if (!timeUp && !clear) return;
    this.timedIndex++;
    if (tw.banner) this.hud.showBanner(tw.banner, tw.sub || '', 80);
    if (this.activeWave) this.queueSpawns(tw.spawns || []); else this.startWave(tw, false);
  }

  updateSpawns() {
    let n = 0;
    for (const s of this.pending) {
      if (this.frame < s.at) { this.pending[n++] = s; continue; }
      // issue #30: an entrance with a tell shows the tell first and lands the unit `tell` frames later
      if (s.ent && s.ent.tell > 0 && !s.told) { this.startTell(s); this.pending[n++] = s; continue; }
      // issue #34: a `cargo` spawn is not placed by the runner at all -- it is handed to the prop, which rattles and
      // tips it out itself. A container that has already been broken has no cargo to give, so the unit climbs out of
      // the wreck where it stood instead: a wave must never be one enemy short because a crate was smashed early.
      if (s.ent && s.ent.kind === 'cargo') { this.spawnFromCargo(s); continue; }
      this.spawn(s);
    }
    this.pending.length = n;
  }
  /**
   * The INTACT prop carrying `name` (issue #34), or null once it has been broken. `state` rather than `alive` is the
   * test, the same way a barricade's `blocking` reads `prop.solid`: Prop.break() leaves the body alive through its
   * break animation, and a crate that is currently flying apart cannot hand anybody out of it.
   */
  propNamed(name) {
    if (!name) return null;
    for (const e of this.world.entities) {
      if (e.kind !== 'prop' || e.name !== name || !e.alive || e.removeMe) continue;
      if (e.state !== 'idle' && e.state !== 'rolling') continue;
      return e;
    }
    return null;
  }
  /** Hand one queued spawn to its container, or climb it out of the wreck if the container is already gone. */
  spawnFromCargo(s) {
    const box = this.propNamed(s.ent.prop);
    if (box) { box.cargo = box.cargo || []; box.cargo.push(s.spec); box.releaseCargo(this.world, 1); return; }
    this.screen.spawnEnemyAt(s.spec.type, s.spec.variant, s.x, s.z, {
      entered: false, facing: s.facing, mods: s.spec.mods, entrance: entranceFor({ entrance: { kind: 'climbOut' } }),
    });
  }
  /** Place an entrance's tell and push its spawn back by the tell's length (game/entrances.js). */
  startTell(s) {
    const ent = s.ent;
    s.told = true;
    s.at = this.frame + ent.tell;
    this.world.add(new EntranceTell({ kind: ent.kind, x: s.x, z: s.z, frames: ent.tell, r: ent.r, look: ent.look }));
    if (ent.tellSfx) audio.play(ent.tellSfx);
  }
  spawn(s) {
    // spec.mods (spawn modifiers, traits.js SPAWN_MODS) ride the pending spec and reach the Enemy constructor through spawnEnemyAt;
    // s.ent (issue #30) is the resolved entrance, which sets the unit's own start pose and takes over its first frames
    const e = this.screen.spawnEnemyAt(s.spec.type, s.spec.variant, s.x, s.z, { entered: false, facing: s.facing, fromSky: !s.ent && s.spec.side === 'sky', mods: s.spec.mods, entrance: s.ent });
    if (s.ent) {
      // a ring that completes under a player shoves them clear rather than landing a free hit (entrances.js)
      if (s.ent.kind === 'teleport') teleportShove(this.world, s.x, s.z, s.ent.r);
      return e;
    }
    if (s.spec.side === 'sky') {
      if (e && e.mods && e.mods.includes('winged')) {
        // lowered in on a bladder (traits.js winged): a line-release hiss and rose gas, no roof to come through
        this.world.camera.shake(Math.min(s.spec.shake || 3, 3), 8); audio.play('steam_vent');
        particles.burst('steam', s.x, 160, s.z, 6, { speed: 1.2, up: 1.4, color: '#FF57B0', sizeJitter: 1.2 });
      } else {
        // crashes through the roof: shake, roof debris and a shower of gears
        this.world.camera.shake(s.spec.shake || 8, 14); audio.play('land_heavy'); audio.play('prop_break');
        particles.burst('debris', s.x, 150, s.z, 14, { speed: 4, up: 1, color: '#8C6825', sizeJitter: 2 });
        particles.burst('gear', s.x, 150, s.z, 4, { speed: 3, up: 1 });
        particles.burst('dust', s.x, 140, s.z, 8, { speed: 2, up: 0.5 });
      }
    }
    return e;
  }
  /** Queue a wave's spawn list just outside the current lock bounds. A party of 3-4 (issue #23:
   *  WAVE_EXTRA_BY_PARTY) gets extra clones of the list's leading non-sky specs, delayed by
   *  PARTY_EXTRA_DELAY and mirrored to the opposite side, so a locked section with more heroes does
   *  not thin out; sky specs are never cloned (a timed Warden crashing through the roof twice would
   *  double its shake/SFX burst). Applies to every list that reaches here: waves, reinforcements and
   *  timed waves alike. No randomness; parties of 1-2 get `specs === list` (identity, byte-for-byte
   *  unchanged streams for solo, two-player and netplay checksums). */
  queueSpawns(list, extraDelay = 0) {
    const cam = this.world.camera;
    const left = cam.locked ? cam.left : cam.x, right = cam.locked ? cam.right : cam.x + VIEW_W;
    const extra = WAVE_EXTRA_BY_PARTY[Math.min(this.world.partySize, WAVE_EXTRA_BY_PARTY.length - 1)];
    const specs = extra > 0
      ? list.concat(list.filter((s) => s.side !== 'sky').slice(0, extra).map((s) => ({ ...s, delay: (s.delay || 0) + PARTY_EXTRA_DELAY, side: s.side === 'left' ? 'right' : 'left' })))
      : list;
    specs.forEach((spec, i) => {
      const side = spec.side || (i % 2 ? 'left' : 'right');
      // issue #30: an authored `entrance` delivers to its own spot (entranceLanding) instead of just outside the lock,
      // and a flyIn with no `from` of its own crosses in from the side the spec already names.
      const ent = entranceFor(spec);
      if (ent && ent.from == null) ent.from = side === 'left' ? 'left' : 'right';
      // issue #34: a `cargo` entrance has no side and no camera-relative x at all -- it comes out of a NAMED PROP,
      // wherever that prop is standing. Resolved here, where the prop is already in the world, rather than at spawn.
      const box = ent && ent.kind === 'cargo' ? this.propNamed(ent.prop) : null;
      const x = box ? box.x
        : ent ? entranceLanding(ent, left, right)
        : side === 'left' ? left - SPAWN_MARGIN - (i % 3) * 14 : side === 'sky' ? (left + right) / 2 + (spec.dx || 0) : right + SPAWN_MARGIN + (i % 3) * 14;
      const z = box ? box.z : clamp(spec.z != null ? spec.z : 70, 10, 130);
      this.pending.push({ at: this.frame + (spec.delay || 0) + extraDelay, spec, ent, box, x, z, facing: side === 'left' ? 1 : -1, told: false });
    });
  }
  /**
   * Debug / test hook (ARCHITECTURE 15): queue ONE spawn with an authored entrance at the camera, through the
   * ordinary queueSpawns path so the tell, the ARRIVING state and the punish window are exactly a wave's.
   * @param {string} type @param {string} variant @param {object} entrance @param {{ z?: number, delay?: number }} [o]
   */
  spawnEntrance(type, variant, entrance, { z = 70, delay = 0 } = {}) {
    this.queueSpawns([{ type, variant, z, delay, entrance }]);
    return this.pending[this.pending.length - 1] || null;
  }
  lockHere() {
    const cam = this.world.camera;
    const x0 = clamp(Math.round(cam.x), 0, this.stage.length - VIEW_W);
    cam.lock(x0, x0 + VIEW_W);
  }
  startWave(wave, lock = true) {
    if (lock) this.lockHere();
    this.activeWave = { wave, reinforced: false, startFrame: this.frame, hits: this.playerHits(), sig: -1, sigAt: this.frame, pressed: false };
    this.queueSpawns(wave.spawns || []);
  }
  updateWave() {
    const aw = this.activeWave, w = aw.wave, alive = this.world.waveEnemies.length;
    if (this.pending.length) return;
    if (!aw.reinforced && w.reinforcements && w.reinforcements.length) {
      const r = w.reinforcements[0];
      if (alive <= (r.whenRemaining != null ? r.whenRemaining : 0)) { aw.reinforced = true; this.queueSpawns(r.spawns || []); return; }
    }
    if (alive > 0) { this.checkWaveStall(aw); return; }
    if (this.barricadeHolding()) return;   // issue #31: the gate is still up, so the wave is not over
    this.clearWave();
  }
  /**
   * ANTI-STALL. A wave holds the camera lock until it is empty, so a survivor the party cannot reach holds the whole
   * board: in a `mode: 'locked'` section (board 3's cart lane) there is not even a way to walk past it. The one variant
   * that can arrange that on its own is a ranged one — `finishAttack` tops the retreat budget back up by 40 on every
   * shot, so a Tallyman that lands its lob, backs off and lands the next one never runs the budget down and kites
   * inside the lock forever, knocking the approach over on a cadence the player cannot close through.
   *
   * So: if nothing in the wave has died and nothing has lost a hit point for WAVE_STALL_FRAMES, the survivors are
   * pressed in (Enemy.pressIn) and fight at melee range for the rest of the wave. The test is the wave's own hp
   * total, which every landed hit moves, so a fight that is merely slow never trips it; and it is derived from
   * hashed state on a deterministic frame counter, so every peer in a netplay room presses on the same frame.
   */
  checkWaveStall(aw) {
    if (aw.pressed) return;
    const list = this.world.waveEnemies;
    let sig = list.length;
    for (const e of list) sig = (Math.imul(sig, 31) + Math.round(e.hp)) | 0;
    if (sig !== aw.sig) { aw.sig = sig; aw.sigAt = this.frame; return; }
    if (this.frame - aw.sigAt < WAVE_STALL_FRAMES) return;
    aw.pressed = true;
    for (const e of list) if (e.pressIn) e.pressIn();
  }
  /**
   * Is a breakable `solid` (issue #31) still standing inside the current camera lock? While one is, the wave it
   * belongs to does not clear and the lock does not release — the barricade IS the wave's last enemy. Only a locked
   * camera is considered: a barricade the party has already walked past must never hold a later wave open.
   *
   * WHOLLY inside, not merely overlapping. A wave that locks the screen with the barricade straddling an edge asks
   * the party to break something that is half off the screen they are locked to — board 3's yard gate sits 6px past
   * the right edge of the lock the first Tallow Works wave takes — and what that reads as is a room emptied of
   * enemies that never opens. One that far out is the NEXT wave's gate; this one clears on its enemies alone.
   */
  barricadeHolding() {
    const cam = this.world.camera;
    if (!cam.locked) return false;
    for (const e of this.world.entities) {
      if (!e.isSolid || !e.breakable || e.removeMe || !e.blocking) continue;
      if (e.x0 >= cam.left && e.x1 <= cam.right) return true;
    }
    return false;
  }
  /** Total times the players have been hit this run (GDD 7 no-damage wave bonus). */
  playerHits() { let n = 0; for (const p of this.world.players) n += p.hitCount || 0; return n; }
  clearWave() {
    const sec = this.section, aw = this.activeWave;
    // GDD 7 scoring: clearing a wave without a single player getting hit is worth +1000 to each survivor
    if (aw && this.playerHits() === aw.hits) {
      for (const p of this.world.players) {
        if (!p.alive || p.dead || p.out || !p.addScore) continue;
        p.addScore(NO_DAMAGE_BONUS, false);
        floatText(p.x, p.y + p.h + 20, p.z, 'NO DAMAGE +' + NO_DAMAGE_BONUS, UI.brassLight, 1);
      }
    }
    this.activeWave = null;
    this.wavesCleared++;
    this.world.wavesCleared = this.wavesCleared;
    this.sectionWaves++;
    // issue #33: `onWaveClear: n` fires after the section's Nth wave, before the lock / unlock branch below, so a
    // caption or a spawn cannot race the dock transition a locked section ends with.
    for (const ev of sec.events || []) {
      if (ev._done || ev.onWaveClear == null || ev.onWaveClear !== this.sectionWaves) continue;
      ev._done = true;
      this.startEvent(ev);
    }
    const lockedSection = sec.mode === 'locked' && !this.timedDone;
    if (!lockedSection) { this.world.camera.unlock(); this.goTimer = GO_FRAMES; audio.play('go_arrow'); }
    else if (this.timedIndex >= (sec.timedWaves || []).length) {
      // the last timed wave: the vehicle docks (scripted 'dock' transition into the next section; the banner / look / pies
      // come from sec.transition — board 1's funicular is the default when the section names nothing)
      this.timedDone = true;
      this.startTransition(sec.transition || { kind: 'dock' });
    } else this.updateTimed(); // next timed wave fires on clear
  }
  /**
   * Begin one scripted event (issue #33). `kind: 'text'` is the shorthand board 1 already shipped and stays working:
   * it is a one-action script with a single caption, so no existing stage data changes.
   */
  startEvent(ev) {
    if (this.nowaves && !this.forceEvents) return;
    // A STORY BEAT (issue #25) does not arm at all when beats are off, and this is the whole of that switch.
    //
    // It is not enough for the beat's own actions to no-op, which is what an earlier version of this did: a beat
    // holds the wave director for as long as its script runs (`holdWaves`), so a bot run that stepped the script
    // and staged nothing still waited six seconds for its first wave. Every playthrough moved, and `npm run
    // winrate` moves with it. Skipping the event outright is what makes "the harness sees the run it saw before"
    // true rather than nearly true.
    if (ev.beat && !this.beats && !this.forceEvents) return;
    if (ev.kind === 'text') { this.hud.showBanner(ev.text || '', ev.sub || '', ev.life || 90); return; }
    this.events.arm(ev);
  }
  checkTriggers(center) {
    const sec = this.section, stage = this.stage;
    // final boss
    if (stage.boss && this.bossState === 'none' && center >= stage.boss.atX && this.sectionAt(stage.boss.atX) === this.sectionIndex) { this.startBoss(stage.boss, 'boss'); return; }
    if (stage.midboss && this.midbossState === 'none' && center >= stage.midboss.atX && this.sectionAt(stage.midboss.atX) === this.sectionIndex) { this.startBoss(stage.midboss, 'midboss'); return; }
    // An intro beat (issue #25) is "walking a set-dressed stretch with NO ENEMIES before the first wave", and the
    // stretch the boards already have between the spawn point and the first trigger is about two seconds of it. So
    // a beat marked `holdWaves` holds the wave director for as long as its script runs, rather than the level being
    // re-cut to make room. Nothing else is held: the player walks, the camera follows, hazards run.
    //
    // It CANNOT deadlock. `holdWaves` only reads while `events.running`, an EventRunner stops the moment its script
    // runs out of actions, and `events.cancel()` on a section change clears it even if the section is left mid-beat.
    // The safety valve: a party that has walked past everything the section had to throw at them has outrun the
    // beat, so it stands down here rather than holding a section that has nothing left to give.
    if (this.holdingWaves && center >= this.outrunAt(sec)) this.endBeat();
    if (!this.holdingWaves) {
      for (const w of sec.waves || []) {
        if (w._state !== 'idle' || center < w.triggerX) continue;
        w._state = 'done';
        this.startWave(w, w.lock !== false);
        return;
      }
    }
    for (const ev of sec.events || []) {
      if (ev._done || ev.atX == null || center < ev.atX) continue;
      ev._done = true;
      this.startEvent(ev);
    }
    const tr = sec.transition;
    if (tr && !tr._done && tr.atX != null && center >= tr.atX) this.startTransition(tr);
  }

  // ---------- transitions ----------
  /**
   * Start a scripted transition (lift / board / dock / descent). Players are held until it finishes.
   * spec = { kind, atX?, gateX?, banner?, look?, pies?, up? }: a 'dock' shows `banner` (default 'FUNICULAR DOCKING'; '' = none) and
   * arrives on `look` ('stairs' default | 'ladder' | 'door' | 'hoist' | 'none') with `pies` Meat Pies (default 2); a 'lift' with
   * `up: true` rides the shaft upward (transitions.js).
   */
  startTransition(spec, extra = {}) {
    if (this.transition) return;
    spec._done = true;
    this.goTimer = 0;
    const vignette = this.beats ? spec.vignette : null;
    // `showBanner` is ONE SLOT and the last write wins, so a dock's arrival banner and a vignette caption in the
    // same breath is not two lines, it is the first one deleted. When a vignette opens with a caption it IS this
    // transition's banner, and the default one stands down for it.
    const vignetteOpens = !!(vignette && (vignette.cues || []).some((c) => c.caption != null && (c.at | 0) <= DOCK_BANNER_LIFE));
    if (spec.kind === 'dock' && !vignetteOpens) { const banner = spec.banner != null ? spec.banner : 'FUNICULAR DOCKING'; if (banner) this.hud.showBanner(banner, '', DOCK_BANNER_LIFE); }
    // `vignette` (issue #25) is the between-section moment. It is handed to the Transition rather than armed as an
    // event because StageRunner.update() returns above `events.update()` for the whole of a transition, so a script
    // armed here would not advance a frame until the party already had control back.
    this.transition = new Transition(this, spec.kind, { gateX: spec.gateX, nextSection: this.sectionIndex + 1, banner: spec.banner, look: spec.look, pies: spec.pies, up: spec.up, vignette, ...extra });
    this.holdPlayers();
  }
  endTransition() {
    const tr = this.transition;
    this.transition = null;
    if (!tr) return;
    // A vignette's cast goes with it. `switchSection` already clears actors through enterSection, but a `descent`
    // has no switch phase at all, so this is the one teardown every kind passes through.
    this.clearActors();
    if (tr.kind === 'dock') { this.goTimer = GO_FRAMES; audio.play('go_arrow'); }
    if (tr.kind === 'board') this.sectionTimer = 0;
    if (tr.kind === 'descent' && this.pendingPlate) { this.showPlate(this.pendingPlate); this.pendingPlate = null; }
  }

  /**
   * One vignette cue, fired by the Transition at its authored frame. The vocabulary is deliberately the event
   * runner's — `actor`, `walk`, `caption`, `sfx`, `camera` — so an author writing a between-section moment writes
   * the same shapes as one writing a mid-board beat.
   */
  vignetteCue(cue) {
    if (!cue || !this.beats) return;
    // A vignette plays under a LOCKED camera parked wherever the transition began, so an author has no absolute x
    // worth writing: the same lift is a different place on every board. `dx` is therefore measured from the left
    // edge of the view, which is the only frame of reference a between-section moment actually has.
    if (cue.actor) this.spawnActor(cue.actor.dx != null ? { ...cue.actor, x: this.world.camera.x + cue.actor.dx } : cue.actor);
    if (cue.walk) this.walkActor(cue.walk);
    if (cue.caption != null) this.hud.showBanner(String(cue.caption), cue.sub || '', cue.life || 110);
    if (cue.sfx) audio.play(cue.sfx);
    if (cue.camera) this.world.camera.shake(cue.camera.shake || 4, cue.camera.frames || 12);
    if (cue.say) this.say(cue.say);
  }
  /** Freeze player input for this frame (cutscenes): no actions, i-frames, walking stops. */
  holdPlayers() {
    for (const p of this.world.players) {
      if (!p || p.out || p.dead) continue;
      p.busy = 2; p.invuln = Math.max(p.invuln, 2);
      if (p.state === ST.WALK || p.state === ST.RUN) { p.running = false; p.setState(ST.IDLE, 'idle'); }
    }
  }

  // ---------- bosses ----------
  startBoss(spec, kind) {
    const world = this.world, cam = world.camera;
    const camBox = spec.camera || spec.arena;
    if (camBox) cam.lock(camBox.x0, camBox.x1); else this.lockHere();
    world.arenaBounds = kind === 'boss' && spec.arena ? { x0: spec.arena.x0, x1: spec.arena.x1 } : null;
    const ax1 = (spec.arena || camBox).x1;
    const e = this.screen.spawnEnemyAt(spec.def, null, ax1 - 110, 70, { facing: -1 });
    this.bossEntity = e;
    if (kind === 'boss') {
      this.bossState = 'active';
      // The descent is BOARD 1's arrival and nobody else's: transitions.js builds the figure on the stair from the
      // `boss` def, so it is Vane whatever board it plays on. Opt-in per board, because Kestrel, Hasp and Oke are
      // already standing in their arenas when the camera locks.
      if (spec.descent) {
        // Vane descends the spiral stair (2s cutscene) while the Regent Engine's intro plays; silence, then the plate + music
        this.game.audio.music.stop(); this.music = '';
        this.transition = new Transition(this, 'descent', { boss: e, stairX: ax1 - 40 });
        if (typeof world.cutscene === 'function') world.cutscene(DESCENT_FRAMES, null); // the world freezes; the runner draws the descent
        this.holdPlayers();
      }
      this.bossPhase = -1;
      this.trackBossBand();
    } else { this.midbossState = 'active'; this.spotlightT = 0; }
  }
  onBossSpawn(b) {
    const spec = b.bossKind === 'midboss' ? this.stage.midboss : this.stage.boss;
    const plate = { name: ((spec && spec.intro) || {}).name || b.name, sub: ((spec && spec.intro) || {}).sub || b.def.subtitle || '', timer: 0, life: PLATE_FRAMES, kind: b.bossKind };
    if (this.transition && this.transition.kind === 'descent') { this.pendingPlate = plate; return; }
    this.showPlate(plate);
  }
  showPlate(plate) {
    this.plate = plate;
    this.hud.showBanner(plate.name, plate.sub, PLATE_FRAMES);
    audio.play('boss_intro'); audio.play('roar');
    this.playMusic((this.stage.music && this.stage.music[plate.kind]) || plate.kind);
    this.world.camera.shake(8, 20);
    // The boss's ARRIVAL line (issue #25). It has to be raised here and nowhere else: `Boss.nextPhase` is what calls
    // `world.bossLine`, and phase 0 is not entered through nextPhase at all — the constructor applies it — so a boss
    // that only spoke from nextPhase would never say the one line it was written to open with.
    if (this.bossEntity && this.world.bossLine) this.world.bossLine(this.bossEntity, 'phase', 0);
    // ...and then the heroes answer the name plate, after it rather than over it.
    this.saySoon(plate.kind === 'midboss' ? 'midbossIntro' : 'bossIntro', BOSS_REPLY_DELAY);
  }
  /** GDD 5.2 dais: the floor band shrinks 20px per phase as the edge vents open (world.shrinkBand); reset when the boss is gone. */
  trackBossBand() {
    const b = this.bossEntity, world = this.world;
    if (!b || !world.shrinkBand) return;
    const ph = b.phaseIndex || 0;
    if (ph !== this.bossPhase) { this.bossPhase = ph; world.shrinkBand(DAIS_SHRINK); }
  }
  updateBoss() {
    const b = this.bossEntity;
    if (this.bossState === 'active' && !this.transition) this.trackBossBand();
    if (!b) { this.bossState = this.bossState === 'active' ? 'done' : this.bossState; this.midbossState = this.midbossState === 'active' ? 'done' : this.midbossState; return; }
    const gone = b.removeMe || (b.defeated && b.state === ST.DEAD) || (!b.alive);
    if (!gone) return;
    if (this.midbossState === 'active') {
      this.midbossState = 'done'; this.bossEntity = null;
      this.world.camera.unlock(); this.world.arenaBounds = null;
      this.goTimer = GO_FRAMES; audio.play('go_arrow');
      this.playMusic((this.stage.music && this.stage.music[this.section.backdrop]) || this.section.backdrop);
      this.hud.showBanner(((this.stage.banners || {}).midbossDown) || 'FOREMAN DEFEATED', 'GO', 120);
    } else if (this.bossState === 'active') {
      this.bossState = 'done';
      this.victoryTimer = 0;
      audio.play('stage_clear');
      this.hud.showBanner('STAGE CLEAR', ((this.stage.banners || {}).clear) || 'THE SKY OPENS', VICTORY_FRAMES);
      for (const p of this.world.players) if (p && !p.out) p.victory = true;
      this.world.arenaBounds = null;
      if (this.world.resetBand) this.world.resetBand();
      const arena = (this.stage.boss && (this.stage.boss.arena || this.stage.boss.camera)) || { x0: this.world.camera.left, x1: this.world.camera.right };
      this.spectacle = new VictorySpectacle(this.world, arena);
    }
  }

  /**
   * Transition overlays, the boss intro spotlight, and the companion speech plates (the HUD draws the GO arrow from
   * `goTimer`). The plates are drawn HERE rather than from the world or the HUD because this pass is the one layer
   * that is above every entity, particle and weather effect and still below all HUD — a line spoken in the rain on
   * board 1 has to be readable through it, and the HUD strip must still win over the line.
   */
  draw(ctx) {
    const cam = this.world.camera;
    if (this.spotlightT >= 0 && this.bossEntity && this.midbossState === 'active') drawSpotlight(ctx, cam, this.bossEntity, this.spotlightT);
    if (this.transition) this.transition.draw(ctx);
    this.drawCinema(ctx);
    if (this.dialogue) this.dialogue.draw(ctx, cam);
  }

  /**
   * The story-beat letterbox: two bars that slide in for the length of a beat and back out when it ends.
   *
   * The top bar slides out from UNDER the HUD strip rather than from row 0. The strip already owns rows 0..STRIP_H-1
   * and is drawn after this pass, so a bar anchored at the top would spend its whole travel hidden behind the strip
   * and then appear as a finished band; anchored at the strip's own bottom edge, every frame of the travel is
   * visible. The bottom bar starts at the floor band's bottom edge -- see CINEMA_H -- so nothing standing on the
   * floor is ever behind it. Speech plates draw after this, because a companion line is not scenery to be framed.
   */
  drawCinema(ctx) {
    if (this.cinemaT <= 0) return;
    const h = Math.round(CINEMA_H * ease('out', this.cinemaT / CINEMA_SLIDE));
    if (h <= 0) return;
    ctx.save();
    ctx.fillStyle = 'rgba(8,5,10,0.94)';
    ctx.fillRect(0, STRIP_H, VIEW_W, h);
    ctx.fillRect(0, VIEW_H - h, VIEW_W, h);
    // a brass hairline on each inner edge: the same trim the HUD strip and every plate in the game are lined with,
    // so the bars read as part of the machine rather than as two rectangles the renderer forgot to clear
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = UI.brass;
    ctx.fillRect(0, STRIP_H + h - 1, VIEW_W, 1);
    ctx.fillRect(0, VIEW_H - h, VIEW_W, 1);
    ctx.restore();
  }

  /** window.__game.summary() contribution. */
  summary() {
    const pf = this.platform;
    return { sectionIndex: this.sectionIndex, wavesCleared: this.wavesCleared, transition: this.transition ? this.transition.kind : null,
      platform: pf ? { kind: pf.kind, phase: pf.phase, progress: pf.progress(this.world), offset: Math.round(pf.offset || 0) } : null,
      event: this.events.running ? { id: this.events.event.id || '', step: this.events.step, t: this.events.t } : null,
      beat: { on: !!this.beats, running: this.beatRunning, letterbox: this.cinemaT / CINEMA_SLIDE,
        actors: this.actors.length, signs: this.signs.length, ...(this.dialogue ? this.dialogue.summary() : {}) } };
  }
}

/**
 * Which def an `actor` action stages. A beat names either an enemy (`def: 'sootborn', variant: 'cutthroat'`) or a
 * hero (`hero: 'brunhild'`), and both resolve to the same kind of content def — an actor is a rig with the AI taken
 * off, so the roster it comes from does not matter to it.
 *
 * A hero actor defaults to the def the PLAYER is not using where a beat asks for `hero: 'other'`, so a stage can
 * stage "the rest of the party" without knowing who was picked.
 */
function resolveActorDef(spec, game) {
  if (spec.hero) {
    if (spec.hero === 'other') {
      const taken = new Set((game && game.options && game.options.chars) || []);
      const free = CHARACTERS.findIndex((c, i) => !taken.has(i));
      return CHARACTERS[free >= 0 ? free : 0];
    }
    return getCharacter(spec.hero);
  }
  return spec.def ? getEnemyDef(spec.def, spec.variant) : null;
}
