// StageRunner (ARCHITECTURE.md section 7, GDD section 6): sections + backdrops, wave director with camera locks,
// side / sky spawns with delays, reinforcements, timed waves for locked sections, props & hazards, GO arrow,
// mid-boss and boss triggers with intro banners, victory -> results after 180 frames.
import { VIEW_W, FLOOR_TOP, ST, UI } from '../constants.js';
import { createBackdrop, backdropsReady } from '../art/backgrounds/index.js';
import { Prop } from './items.js';
import { Hazard } from './hazards.js';
import { drawTextOutlined } from '../engine/text.js';
import { pathPoly, paint } from '../art/shapes.js';
import { clamp } from '../engine/math.js';
import { audio } from '../engine/audio.js';

const SPAWN_MARGIN = 50;
const GO_FRAMES = 150;
const VICTORY_FRAMES = 180;

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
    this.victoryTimer = -1; this.finished = false;
    this.music = '';
    this.startSection = clamp(startSection | 0, 0, this.sections.length - 1);
    world.stage = this;
    world.spawnEnemy = (type, variant, x, z, opts) => this.screen.spawnEnemyAt(type, variant, x, z, opts);
    world.announce = (text, sub, life) => this.hud.showBanner(text, sub, life);
    world.onBossSpawn = (b) => this.onBossSpawn(b);
  }

  /** Place every prop / hazard, position the camera, enter the first section. */
  start() {
    for (const sec of this.sections) {
      for (const p of sec.props || []) this.world.add(new Prop(p.type, p.x, p.z, { drops: p.drops || null, hp: p.hp || 0 }));
      if (!this.nowaves) for (const h of sec.hazards || []) this.world.add(new Hazard(h));
      for (const w of sec.waves || []) w._state = 'idle';
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
  get busy() { return !!this.activeWave || this.pending.length > 0 || this.bossActive; }
  get bossActive() { return this.midbossState === 'active' || this.bossState === 'active'; }

  enterSection(i, first = false) {
    if (i === this.sectionIndex) return;
    const sec = this.sections[i];
    this.sectionIndex = i;
    this.world.sectionIndex = i;
    this.screen.setBackdrop(createBackdrop(sec, this.stage));
    const track = (this.stage.music && this.stage.music[sec.backdrop]) || sec.backdrop;
    this.playMusic(track);
    this.sectionTimer = 0; this.timedIndex = 0; this.timedDone = !(sec.timedWaves && sec.timedWaves.length);
    if (!first || this.startSection > 0) this.hud.showBanner(sec.name || sec.id.toUpperCase(), '', 90);
    if (sec.mode === 'locked' && !this.nowaves) this.world.camera.lock(sec.x0, sec.x1);
  }
  playMusic(track) { if (track && track !== this.music) { this.music = track; this.game.audio.music.play(track); } }

  // ---------- per-step ----------
  update() {
    this.frame++;
    const world = this.world, cam = world.camera, center = cam.x + VIEW_W / 2;
    // section by camera centre (locked sections are entered a little early so the lock pulls the players aboard)
    const next = this.sectionAt(center);
    if (next > this.sectionIndex) this.enterSection(next);
    if (this.goTimer > 0) this.goTimer--;
    if (this.victoryTimer >= 0) { if (++this.victoryTimer >= VICTORY_FRAMES && !this.finished) { this.finished = true; this.screen.onVictory(); } return; }
    if (this.bossActive) { this.updateBoss(); return; }
    if (this.nowaves) return;
    this.updateSpawns();
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
    if (this.activeWave) this.queueSpawns(tw.spawns || []); else this.startWave(tw, false);
  }

  updateSpawns() {
    let n = 0;
    for (const s of this.pending) {
      if (this.frame >= s.at) this.spawn(s);
      else this.pending[n++] = s;
    }
    this.pending.length = n;
  }
  spawn(s) {
    const e = this.screen.spawnEnemyAt(s.spec.type, s.spec.variant, s.x, s.z, { entered: false, facing: s.facing, fromSky: s.spec.side === 'sky' });
    if (s.spec.side === 'sky') { this.world.camera.shake(s.spec.shake || 8, 14); audio.play('land_heavy'); }
    return e;
  }
  /** Queue a wave's spawn list just outside the current lock bounds. */
  queueSpawns(list, extraDelay = 0) {
    const cam = this.world.camera;
    const left = cam.locked ? cam.left : cam.x, right = cam.locked ? cam.right : cam.x + VIEW_W;
    list.forEach((spec, i) => {
      const side = spec.side || (i % 2 ? 'left' : 'right');
      const x = side === 'left' ? left - SPAWN_MARGIN - (i % 3) * 14 : side === 'sky' ? (left + right) / 2 + (spec.dx || 0) : right + SPAWN_MARGIN + (i % 3) * 14;
      this.pending.push({ at: this.frame + (spec.delay || 0) + extraDelay, spec, x, z: clamp(spec.z != null ? spec.z : 70, 10, 130), facing: side === 'left' ? 1 : -1 });
    });
  }
  lockHere() {
    const cam = this.world.camera;
    const x0 = clamp(Math.round(cam.x), 0, this.stage.length - VIEW_W);
    cam.lock(x0, x0 + VIEW_W);
  }
  startWave(wave, lock = true) {
    if (lock) this.lockHere();
    this.activeWave = { wave, reinforced: false, startFrame: this.frame };
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
    this.clearWave();
  }
  clearWave() {
    const sec = this.section;
    this.activeWave = null;
    this.wavesCleared++;
    this.world.wavesCleared = this.wavesCleared;
    const lockedSection = sec.mode === 'locked' && !this.timedDone;
    if (!lockedSection) { this.world.camera.unlock(); this.goTimer = GO_FRAMES; audio.play('go_arrow'); }
    else if (this.timedIndex >= (sec.timedWaves || []).length) { this.timedDone = true; this.world.camera.unlock(); this.goTimer = GO_FRAMES; audio.play('go_arrow'); this.hud.showBanner('FUNICULAR DOCKED', 'GO', 90); }
    else this.updateTimed(); // next timed wave fires on clear
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
    if (kind === 'boss') this.bossState = 'active'; else this.midbossState = 'active';
  }
  onBossSpawn(b) {
    const spec = b.bossKind === 'midboss' ? this.stage.midboss : this.stage.boss;
    const intro = (spec && spec.intro) || { name: b.name, sub: b.def.subtitle || '' };
    this.hud.showBanner(intro.name, intro.sub, 170);
    audio.play('boss_intro'); audio.play('roar');
    this.playMusic((this.stage.music && this.stage.music[b.bossKind]) || b.def.music || b.bossKind);
    this.world.camera.shake(8, 20);
  }
  updateBoss() {
    const b = this.bossEntity;
    if (!b) { this.bossState = this.bossState === 'active' ? 'done' : this.bossState; this.midbossState = this.midbossState === 'active' ? 'done' : this.midbossState; return; }
    const gone = b.removeMe || (b.defeated && b.state === ST.DEAD) || (!b.alive);
    if (!gone) return;
    if (this.midbossState === 'active') {
      this.midbossState = 'done'; this.bossEntity = null;
      this.world.camera.unlock(); this.world.arenaBounds = null;
      this.goTimer = GO_FRAMES; audio.play('go_arrow');
      this.playMusic((this.stage.music && this.stage.music[this.section.backdrop]) || this.section.backdrop);
      this.hud.showBanner('FOREMAN DEFEATED', 'GO', 120);
    } else if (this.bossState === 'active') {
      this.bossState = 'done';
      this.victoryTimer = 0;
      audio.play('stage_clear');
      this.hud.showBanner('STAGE CLEAR', 'THE SKY OPENS', VICTORY_FRAMES);
      for (const p of this.world.players) if (p && !p.out) p.victory = true; // victorious players ignore hits (Fighter.takeHit)
      // leftover escorts (summoned footmen) fall with the Engine so the pose hold is never a fight
      for (const e of this.world.enemies) if (e.kind !== 'boss' && !e.dead) { e.hp = 0; e.dead = true; e.knockDown(5, (e.x < this.bossEntity.x ? -1 : 1) * 3); }
      this.world.arenaBounds = null;
    }
  }

  /** GO arrow (blinking) after a wave clear. */
  draw(ctx) {
    if (this.goTimer <= 0 || this.world.camera.locked) return;
    if ((this.goTimer % 30) >= 20) return;
    const x = VIEW_W - 70, y = FLOOR_TOP - 60;
    drawTextOutlined(ctx, 'GO', x, y, { size: 3, color: UI.brass, outline: '#3a2010', thickness: 1, align: 'center' });
    pathPoly(ctx, [x + 30, y + 2, x + 52, y + 12, x + 30, y + 22]); paint(ctx, UI.brass, '#3a2010', 2);
  }

  /** window.__game.summary() contribution. */
  summary() { return { sectionIndex: this.sectionIndex, wavesCleared: this.wavesCleared }; }
}
