// StageRunner (ARCHITECTURE.md section 7, GDD section 6): sections + backdrops, wave director with camera locks,
// side / sky spawns with delays, reinforcements, timed waves for locked sections, props / hazards / zones, GO arrow,
// scripted transitions (lift, funicular boarding, docking), mid-boss and boss triggers with intro cutscene / spotlight /
// name plates, the defeat spectacle and results after a 240f pose hold.
import { VIEW_W, ST, UI, WAVE_EXTRA_BY_PARTY, PARTY_EXTRA_DELAY } from '../constants.js';
import { createBackdrop, backdropsReady } from '../art/backgrounds/index.js';
import { Prop } from './items.js';
import { Hazard, Zone } from './hazards.js';
import { Transition, drawSpotlight, VictorySpectacle } from './transitions.js';
import { entranceFor, entranceLanding, EntranceTell, teleportShove } from './entrances.js';
import { clamp } from '../engine/math.js';
import { audio } from '../engine/audio.js';
import { particles } from '../engine/particles.js';
import { floatText } from '../art/fx.js';

const SPAWN_MARGIN = 50;
const GO_FRAMES = 150;
const NO_DAMAGE_BONUS = 1000;   // GDD 7 scoring: a wave cleared without any player being hit
/** Pose hold after the boss defeat spectacle before the results (GDD 6). */
const VICTORY_FRAMES = 240;
const PLATE_FRAMES = 170, SPOTLIGHT_FRAMES = 110, DESCENT_FRAMES = 120, DAIS_SHRINK = 20;

/** Drives one stage for a World. The gameplay screen owns it and forwards update()/draw(). */
export class StageRunner {
  /**
   * @param {import('./world.js').World} world
   * @param {object} stage stage data (content/stage/stage1.js)
   * @param {{ game: object, hud: object, screen: object, nowaves?: boolean, startSection?: number }} o
   */
  constructor(world, stage, { game, hud, screen, nowaves = false, startSection = 0 }) {
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
    world.stage = this;
    world.spawnEnemy = (type, variant, x, z, opts) => this.screen.spawnEnemyAt(type, variant, x, z, opts);
    world.announce = (text, sub, life) => this.hud.showBanner(text, sub, life);
    world.onBossSpawn = (b) => this.onBossSpawn(b);
  }

  /** Place every prop / hazard / zone, position the camera, enter the first section. */
  start() {
    for (const sec of this.sections) {
      // every extra field of a prop entry (release / dump / solid / rider / fire ...) is forwarded to the Prop as-is: items.js owns the meaning
      for (const p of sec.props || []) this.world.add(new Prop(p.type, p.x, p.z, { ...p, drops: p.drops !== undefined ? p.drops : null, hp: p.hp || 0 }));
      if (!this.nowaves) for (const h of sec.hazards || []) this.world.add(new Hazard(h));
      for (const z of sec.zones || []) this.world.add(new Zone(z));
      for (const w of sec.waves || []) w._state = 'idle';
      if (sec.transition) sec.transition._done = false;
      for (const ev of sec.events || []) ev._done = false;
    }
    const sec = this.sections[this.startSection];
    // debug section skips start past earlier bosses
    if (this.stage.midboss && sec.x0 > this.stage.midboss.atX) this.midbossState = 'done';
    if (this.stage.boss && sec.x0 > this.stage.boss.atX) this.bossState = 'done';
    if (this.startSection > 0) {
      const x = sec.x0 + 40;
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
    if (!first || this.startSection > 0) this.hud.showBanner(sec.name || sec.id.toUpperCase(), sec.sub || '', 90);
    if (sec.mode === 'locked' && !this.nowaves) this.world.camera.lock(sec.x0, sec.x1);
  }
  playMusic(track) { if (track && track !== this.music) { this.music = track; this.game.audio.music.play(track); } }

  // ---------- per-step ----------
  update() {
    this.frame++;
    const world = this.world, cam = world.camera, center = cam.x + VIEW_W / 2;
    if (this.plate && ++this.plate.timer >= this.plate.life) this.plate = null;
    if (this.spotlightT >= 0 && ++this.spotlightT > SPOTLIGHT_FRAMES) this.spotlightT = -1;
    if (this.transition) { this.holdPlayers(); if (this.transition.update()) this.endTransition(); return; }
    // section by camera centre; a section whose exit is a scripted transition is left through that transition instead
    const next = this.sectionAt(center);
    if (next > this.sectionIndex) {
      const tr = this.section.transition;
      if (tr && !tr._done && !this.bossActive && !this.nowaves) { this.startTransition(tr); return; }
      this.enterSection(next);
    }
    if (this.goTimer > 0) this.goTimer--;
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
      this.spawn(s);
    }
    this.pending.length = n;
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
      const x = ent ? entranceLanding(ent, left, right)
        : side === 'left' ? left - SPAWN_MARGIN - (i % 3) * 14 : side === 'sky' ? (left + right) / 2 + (spec.dx || 0) : right + SPAWN_MARGIN + (i % 3) * 14;
      this.pending.push({ at: this.frame + (spec.delay || 0) + extraDelay, spec, ent, x, z: clamp(spec.z != null ? spec.z : 70, 10, 130), facing: side === 'left' ? 1 : -1, told: false });
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
    this.activeWave = { wave, reinforced: false, startFrame: this.frame, hits: this.playerHits() };
    this.queueSpawns(wave.spawns || []);
  }
  updateWave() {
    const aw = this.activeWave, w = aw.wave, alive = this.world.waveEnemies.length;
    if (this.pending.length) return;
    if (!aw.reinforced && w.reinforcements && w.reinforcements.length) {
      const r = w.reinforcements[0];
      if (alive <= (r.whenRemaining != null ? r.whenRemaining : 0)) { aw.reinforced = true; this.queueSpawns(r.spawns || []); return; }
    }
    if (alive > 0) return;
    if (this.barricadeHolding()) return;   // issue #31: the gate is still up, so the wave is not over
    this.clearWave();
  }
  /**
   * Is a breakable `solid` (issue #31) still standing inside the current camera lock? While one is, the wave it
   * belongs to does not clear and the lock does not release — the barricade IS the wave's last enemy. Only a locked
   * camera is considered: a barricade the party has already walked past must never hold a later wave open.
   */
  barricadeHolding() {
    const cam = this.world.camera;
    if (!cam.locked) return false;
    for (const e of this.world.entities) {
      if (!e.isSolid || !e.breakable || e.removeMe || !e.blocking) continue;
      if (e.x1 >= cam.left && e.x0 <= cam.right) return true;
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
    const lockedSection = sec.mode === 'locked' && !this.timedDone;
    if (!lockedSection) { this.world.camera.unlock(); this.goTimer = GO_FRAMES; audio.play('go_arrow'); }
    else if (this.timedIndex >= (sec.timedWaves || []).length) {
      // the last timed wave: the vehicle docks (scripted 'dock' transition into the next section; the banner / look / pies
      // come from sec.transition — board 1's funicular is the default when the section names nothing)
      this.timedDone = true;
      this.startTransition(sec.transition || { kind: 'dock' });
    } else this.updateTimed(); // next timed wave fires on clear
  }
  checkTriggers(center) {
    const sec = this.section, stage = this.stage;
    // final boss
    if (stage.boss && this.bossState === 'none' && center >= stage.boss.atX && this.sectionAt(stage.boss.atX) === this.sectionIndex) { this.startBoss(stage.boss, 'boss'); return; }
    if (stage.midboss && this.midbossState === 'none' && center >= stage.midboss.atX && this.sectionAt(stage.midboss.atX) === this.sectionIndex) { this.startBoss(stage.midboss, 'midboss'); return; }
    for (const w of sec.waves || []) {
      if (w._state !== 'idle' || center < w.triggerX) continue;
      w._state = 'done';
      this.startWave(w, w.lock !== false);
      return;
    }
    for (const ev of sec.events || []) {
      if (ev._done || center < ev.atX) continue;
      ev._done = true;
      if (ev.kind === 'text') this.hud.showBanner(ev.text || '', ev.sub || '', ev.life || 90);
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
    if (spec.kind === 'dock') { const banner = spec.banner != null ? spec.banner : 'FUNICULAR DOCKING'; if (banner) this.hud.showBanner(banner, '', 60); }
    this.transition = new Transition(this, spec.kind, { gateX: spec.gateX, nextSection: this.sectionIndex + 1, banner: spec.banner, look: spec.look, pies: spec.pies, up: spec.up, ...extra });
    this.holdPlayers();
  }
  endTransition() {
    const tr = this.transition;
    this.transition = null;
    if (!tr) return;
    if (tr.kind === 'dock') { this.goTimer = GO_FRAMES; audio.play('go_arrow'); }
    if (tr.kind === 'board') this.sectionTimer = 0;
    if (tr.kind === 'descent' && this.pendingPlate) { this.showPlate(this.pendingPlate); this.pendingPlate = null; }
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
      // Vane descends the spiral stair (2s cutscene) while the Regent Engine's intro plays; silence, then the plate + music
      this.game.audio.music.stop(); this.music = '';
      this.transition = new Transition(this, 'descent', { boss: e, stairX: ax1 - 40 });
      if (typeof world.cutscene === 'function') world.cutscene(DESCENT_FRAMES, null); // the world freezes; the runner draws the descent
      this.holdPlayers();
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

  /** Transition overlays and the boss intro spotlight (the HUD draws the GO arrow from `goTimer`). */
  draw(ctx) {
    const cam = this.world.camera;
    if (this.spotlightT >= 0 && this.bossEntity && this.midbossState === 'active') drawSpotlight(ctx, cam, this.bossEntity, this.spotlightT);
    if (this.transition) this.transition.draw(ctx);
  }

  /** window.__game.summary() contribution. */
  summary() { return { sectionIndex: this.sectionIndex, wavesCleared: this.wavesCleared, transition: this.transition ? this.transition.kind : null }; }
}
