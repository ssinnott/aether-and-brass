// Training room (issue #22): a subclass of GameplayScreen, not a new simulation. Runs stage 1 section 2
// (THE BRASS FUNICULAR, one 640px screen, `mode: 'locked'`) through a derived arena stage with every section
// stripped of props / hazards / zones / waves so the funicular's rails ring-out zone and drop props never
// exist here. World / HUD / StageRunner / spawnEnemyAt / killAllEnemies / fillMeter / summary all come free
// from GameplayScreen; this file only owns the dummy slot(s) and the plate options (mode, variant, face lock,
// meter lock, hitbox overlay, frame data toggle) that drive them.
import { VIEW_W, VIEW_H, ST, METER, UI, TEAM } from '../../constants.js';
import { GameplayScreen } from './gameplay.js';
import { getStage } from '../../content/stage/index.js';
import { getEnemyDef } from '../../content/enemies/index.js';
import { initShield } from '../shield.js';
import { animTiming } from '../animation.js';
import { drawText, measureText } from '../../engine/text.js';
import { TrialRunner, trialProgress } from '../trials.js';

/** Training room tuning (issue #22 decisions). */
const TRAINING = Object.freeze({
  stage: 1, section: 2, playerX: 200, playerZOff: 20, dummyX: 330, dummySpacing: 100, z: 70,
  dummyHp: 600, dummyWeight: 1000, respawnFrames: 45, lives: 3, blockStaggerEvery: 4, blockStaggerFrames: 30,
});
export const DUMMY_MODES = ['stand', 'block', 'cpu'];
export const METER_LOCKS = ['normal', 'full', 'empty'];
/** Frame-data strip: the bottom edge (no boss bar ever exists in training) -- the HUD's own combo digit / grade
 *  word occupy y 50..85 (hud.js drawCombo), so the strip cannot sit directly under the 40px HUD strip without
 *  the two overlapping (review finding). */
const FD_Y = VIEW_H - 26, FD_H = 22;
/** Trial panel: right-aligned column under the HUD; TRIAL_MARK_W reserves room for the '[X]'/'[ ]' mark. */
const TRIAL_X = VIEW_W - 8, TRIAL_Y0 = 66, TRIAL_ROW_H = 9, TRIAL_MARK_W = 20;
/** States whose current anim def carries meaningful frame data. */
const ATTACK_STATES = new Set([ST.ATTACK, ST.JUMP_ATTACK, ST.DASH_ATTACK, ST.SPECIAL, ST.SUPER]);
/** Combat-log kinds that update the frame-data strip's last-hit fields. */
const HIT_KINDS = new Set(['hit', 'projectile', 'body']);
/** Pre-rendered 'F<n>' state-timer digits (0-255): the one field on the frame-data strip that changes every
 *  simulated frame while training is on top, so it must never be re-templated into a fresh string each frame
 *  (contract: no allocation in per-frame paths). A timer past 255 (no state runs anywhere near that long) falls
 *  back to String() once. */
const FD_TIMER = Array.from({ length: 256 }, (_, i) => String(i));

/** Stage 1 with every section stripped of props / hazards / zones / waves: the funicular roof as a bare arena. */
function arenaStage() {
  const src = getStage(TRAINING.stage);
  return { ...src, sections: src.sections.map((s) => ({ ...s, props: [], hazards: [], zones: [], waves: [], timedWaves: [], events: [] })) };
}

/** The training room: dummy practice with frame data, hitbox overlay and combo trials (window.__game.setTraining). */
export class TrainingScreen extends GameplayScreen {
  constructor(game) { super(game); this.id = 'training'; this.pauseScreenId = 'trainpause'; }
  /** Single-player only (review finding): frame data, trials and the trainpause plate all read slot 0
   *  alone, so a second body in the room gets none of the room's own features. */
  maxPlayers() { return 1; }
  /** Training defeats stay out of the bestiary (issue #26): the dummy respawns on a 45-frame timer and its variant
   *  is picked from the trainpause plate, so counting it would fill the book from a menu instead of the campaign. */
  countsForBestiary() { return false; }
  enter(params) {
    this.opts = { mode: 'stand', variant: 'brassbound:footman', faceLock: false, meterLock: 'normal', hitboxes: false, frameData: true };
    this.trialDef = null; this.trial = null;
    this.dummies = [{ e: null, timer: 0, x: TRAINING.dummyX }];
    super.enter({ ...params, stage: arenaStage(), section: TRAINING.section, nowaves: true });
    const sec = this.stage.sections[TRAINING.section]; this.sec = sec;
    // GameplayScreen -> StageRunner only locks the camera when !nowaves; training locks it by hand.
    this.world.camera.lock(sec.x0, sec.x1); this.world.camera.snapTo(sec.x0);
    this.hud.showBanner('TRAINING ROOM', this.players[0] ? this.players[0].def.name : '', 90);
    this.fd = {
      state: '', stateTimer: 0, anim: '', startup: 0, active: 0, recovery: 0,
      hitDamage: 0, hitStun: 0, hitType: '', dodgeI0: 0, dodgeI1: 0, dodgeThrough: false,
      line1Pre: 'P1 F', line1Post: '', timerStr: '0', line2: '',
    };
    this.fdSeq = 0;
    // Cached-string keys for line1 / line2 (compared field-by-field, never templated into a throwaway string --
    // review finding): null never equals a live opts value, so the first updateFrameData() call always rebuilds.
    this.fd1State = null; this.fd1Anim = null; this.fd1Startup = null; this.fd1Active = null; this.fd1Recovery = null;
    this.fd2Dmg = null; this.fd2Stun = null; this.fd2Type = null; this.fd2I0 = null; this.fd2I1 = null; this.fd2Through = null;
    this.resetPositions();
  }
  /** A running trial's dummyMode overrides the plate's own DUMMY choice; clearing the trial restores it. */
  get effectiveMode() { return this.trialDef && this.trialDef.dummyMode ? this.trialDef.dummyMode : this.opts.mode; }

  /** Select (or clear, with `id === null`) a trial for the trials list / test hook (game/trials.js TrialRunner). */
  setTrial(id) {
    const def = (this.players[0].def.trials || []).find((t) => t.id === id) || null;
    this.trialDef = def;
    this.trial = def ? new TrialRunner(def, 0, this.world) : null;
    this.trialRows = def ? def.steps.map((s) => s.label) : [];
    const n = def && def.bodies === 2 ? 2 : 1;
    if (this.dummies.length > n) { const extra = this.dummies.pop(); if (extra.e) this.world.remove(extra.e); }
    if (this.dummies.length < n) this.dummies.push({ e: null, timer: 0, x: 0 });
    // Always re-apply the trial's own authored spacing to the second body: a slot left over from a PREVIOUS
    // two-body trial (respawnDummies reuses slot.x) would otherwise keep that trial's spacing, and a narrower
    // hitbox trial picked next (Rook's PIERCING SHOT, spacing 44) could never land on both bodies at once
    // until the player popped the slot with a one-body trial first (review finding).
    if (n === 2) this.dummies[1].x = TRAINING.dummyX + ((def && def.spacing) || TRAINING.dummySpacing);
    this.respawnDummies();
    this.refill();
  }

  /** Reset every player and every dummy to their training spot. A player still dead / out (a CPU dummy or
   *  a trial killed her) must be revived first: Fighter.think bails on `this.dead` and the only respawn path
   *  requires `state === ST.DEAD`, which forcing IDLE below would make unreachable forever (review finding). */
  resetPositions() {
    const sec = this.sec;
    this.players.forEach((p, i) => {
      if (!p) return;
      if (p.dead || p.out) p.respawn(this.world);
      p.x = sec.x0 + TRAINING.playerX + i * 40; p.z = TRAINING.z + TRAINING.playerZOff + i * 24; p.y = 0; p.vy = 0; p.vx = 0;
      p.facing = 1; p.hp = p.maxHp; initShield(p); p.hitstop = 0; p.hurtTimer = 0;
      p.grabTarget = null; p.grabbedBy = null; p.heldBody = null; p.running = false;
      p.setState(ST.IDLE, 'idle');
    });
    this.respawnDummies();
  }
  /** Remove and respawn every dummy slot at its reset spot, from the current variant / mode / face-lock. */
  respawnDummies() {
    this.sweepStrayEnemies();
    for (const slot of this.dummies) {
      if (slot.e) { this.releasePlayersFrom(slot.e); this.world.remove(slot.e); }
      this.spawnDummy(slot);
    }
    this.world._refreshLists();
  }
  /** A CPU-mode dummy's own moves can spawn ordinary (non-dummy) enemies -- Harvestman's chaff drop, the
   *  Resurrectionist's recrew -- through world.spawnEnemy, same as a real wave. Nothing else ever clears them,
   *  so every DUMMY / VARIANT / FACING change, RESET POSITIONS and trial selection would otherwise leave real
   *  attackers behind in a STAND room (review finding). Mirrors killAllEnemies (screens/gameplay.js) but keeps
   *  each slot's own dummy; training has nowaves, so no legitimate non-dummy enemy exists to lose here. */
  sweepStrayEnemies() {
    for (const e of this.world.entities.slice()) {
      if ((e.kind === 'enemy' && !e.traits.dummy) || e.kind === 'boss' || (e.kind === 'projectile' && e.team === TEAM.ENEMY)) this.world.remove(e);
    }
    this.world.attackTokens.holders.clear();
  }
  /** Release any player holding / targeting `e` before it is removed out from under them (a DUMMY / VARIANT /
   *  FACING change mid-grab): mirrors killAllEnemies (screens/gameplay.js), which clears the same fields for
   *  exactly this reason -- otherwise the player is left in ST.GRAB holding (and later throwing) a ghost. */
  releasePlayersFrom(e) {
    for (const p of this.players) {
      if (!p) continue;
      if (p.grabTarget === e) { p.grabTarget = null; p.hitstop = 0; if (p.state === ST.GRAB) p.setState(ST.IDLE, 'idle'); }
      if (p.heldBody === e) p.heldBody = null;
      if (p.lastTarget === e) p.lastTarget = null;
    }
  }
  /** Spawn (or respawn) one dummy slot: `opts.variant` is `type:variant`, spread into a fresh def with traits.dummy. */
  spawnDummy(slot) {
    const [type, variant] = String(this.opts.variant).split(':');
    const base = getEnemyDef(type, variant);
    const def = { ...base, drops: 'none', traits: { ...(base.traits || {}), dummy: true } };
    const e = this.spawnEnemyAt(type, variant, this.sec.x0 + slot.x, TRAINING.z, { facing: -1, def });
    e.dummyMode = this.effectiveMode; e.dummyFaceLock = this.opts.faceLock;
    e.maxHp = e.hp = TRAINING.dummyHp; e.hpBarTimer = 0;
    this.applyMode(e);
    slot.e = e; slot.timer = TRAINING.respawnFrames;
  }
  /** STAND/BLOCK dummies are pinned (traits.weight ~ zero knockback); BLOCK also gets the Brassbound gear-slip
   *  stagger (super armor + Enemy.onHurt's staggerEvery path). CPU keeps the variant's own weight and AI. */
  applyMode(e) {
    if (e.dummyMode === 'cpu') return;
    e.traits.weight = TRAINING.dummyWeight;
    if (e.dummyMode === 'block') {
      e.traits.superArmor = true; e.traits.noLaunch = true; e.unlaunchable = true; e.armor = true;
      e.traits.staggerEveryNthHit = 0;
      e.ai.staggerEvery = TRAINING.blockStaggerEvery; e.ai.staggerFrames = TRAINING.blockStaggerFrames;
    }
  }

  update() {
    super.update();
    if (this.game.screen !== this) return; // a pause (or another screen) is now on top
    for (const slot of this.dummies) {
      if (!slot.e || slot.e.removeMe || !slot.e.alive) { if (--slot.timer <= 0) this.spawnDummy(slot); }
      else slot.timer = TRAINING.respawnFrames;
    }
    for (const p of this.players) {
      if (!p) continue;
      p.lives = TRAINING.lives; // the game-over flow never triggers in training
      if (this.opts.meterLock === 'full') p.meter = METER.max;
      else if (this.opts.meterLock === 'empty') p.meter = 0;
    }
    this.updateFrameData();
    if (this.trial && this.trial.update(this.world)) {
      const heroId = this.players[0].def.id;
      trialProgress.markDone(heroId, this.trialDef.id);
      this.hud.showBanner('TRIAL COMPLETE', this.trialDef.name, 90);
      this.game.audio.play('rank_stamp');
    }
    if (this.trial && this.trial.done && this.game.input.pressed(0, 'taunt')) this.setTrial(this.trialDef.id);
  }
  /** Refresh the P1 frame-data readout (screens/training.js strip) from the fighter and the combat log. */
  updateFrameData() {
    const fd = this.fd, p = this.players[0];
    if (!p) return;
    fd.state = p.state; fd.stateTimer = p.stateTimer;
    if (ATTACK_STATES.has(p.state) && p.anim.def) {
      const t = animTiming(p.anim.def);
      fd.anim = p.anim.name; fd.startup = t.startup; fd.active = t.active; fd.recovery = t.recovery;
    }
    const log = this.world.log;
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e.seq <= this.fdSeq) break;
      if (e.p === 0 && HIT_KINDS.has(e.kind)) { fd.hitDamage = e.damage; fd.hitStun = e.hitstun; fd.hitType = e.type; this.fdSeq = e.seq; break; }
    }
    fd.dodgeI0 = p.traits.dodgeIFrames[0]; fd.dodgeI1 = p.traits.dodgeIFrames[1]; fd.dodgeThrough = p.dodgeThrough;
    // line1: only F<stateTimer> changes every simulated frame (drawn separately from the cached FD_TIMER table);
    // the surrounding text is rebuilt only when state/anim/startup/active/recovery actually change -- compared
    // field-by-field, never through a throwaway template-string key (contract: no allocation in per-frame paths).
    if (fd.state !== this.fd1State || fd.anim !== this.fd1Anim || fd.startup !== this.fd1Startup || fd.active !== this.fd1Active || fd.recovery !== this.fd1Recovery) {
      this.fd1State = fd.state; this.fd1Anim = fd.anim; this.fd1Startup = fd.startup; this.fd1Active = fd.active; this.fd1Recovery = fd.recovery;
      fd.line1Pre = `P1 ${fd.state} F`;
      fd.line1Post = `   ${fd.anim ? fd.anim.toUpperCase() : '-'}  STARTUP ${fd.startup}  ACTIVE ${fd.active}  RECOVERY ${fd.recovery}`;
    }
    fd.timerStr = FD_TIMER[fd.stateTimer] || String(fd.stateTimer);
    if (fd.hitDamage !== this.fd2Dmg || fd.hitStun !== this.fd2Stun || fd.hitType !== this.fd2Type
      || fd.dodgeI0 !== this.fd2I0 || fd.dodgeI1 !== this.fd2I1 || fd.dodgeThrough !== this.fd2Through) {
      this.fd2Dmg = fd.hitDamage; this.fd2Stun = fd.hitStun; this.fd2Type = fd.hitType; this.fd2I0 = fd.dodgeI0; this.fd2I1 = fd.dodgeI1; this.fd2Through = fd.dodgeThrough;
      fd.line2 = `LAST HIT ${fd.hitDamage} DMG  STUN ${fd.hitStun}F  ${fd.hitType ? fd.hitType.toUpperCase() : '-'}   DODGE I-FRAMES ${fd.dodgeI0}-${fd.dodgeI1}  LAST DODGE ${fd.dodgeThrough ? 'THROUGH' : 'CLEAN'}`;
    }
  }

  /** Change dummy mode / variant / face-lock and respawn every dummy slot. */
  setDummy({ mode, variant, faceLock } = {}) {
    if (mode != null) this.opts.mode = mode;
    if (variant != null) this.opts.variant = variant;
    if (faceLock != null) this.opts.faceLock = !!faceLock;
    this.respawnDummies();
  }
  /** Top up every player's HP / shield without moving anyone. */
  refill() { for (const p of this.players) { if (!p) continue; p.hp = p.maxHp; initShield(p); } }
  setMeterLock(m) { this.opts.meterLock = m; }
  toggle(key) { this.opts[key] = !this.opts[key]; }

  /** Test hook (window.__game.setTraining): applies any given field, returns the resulting training summary. */
  setTraining(o = {}) {
    if (o.mode != null || o.variant != null || o.faceLock != null) this.setDummy(o);
    if (o.meterLock != null) this.setMeterLock(o.meterLock);
    if (o.hitboxes != null) this.opts.hitboxes = !!o.hitboxes;
    if (o.frameData != null) this.opts.frameData = !!o.frameData;
    if (o.refill) this.refill();
    if (o.reset) this.resetPositions();
    if ('trial' in o) this.setTrial(o.trial);
    return this.summary().training;
  }

  draw(ctx) {
    super.draw(ctx);
    if (this.opts.hitboxes) this.world.drawDebug(ctx, false);
    if (this.opts.frameData) {
      ctx.fillStyle = 'rgba(10,6,12,0.55)'; ctx.fillRect(0, FD_Y, VIEW_W, FD_H);
      // line1 is three drawText calls (pre / timer / post) instead of one templated string, so the digits that
      // change every simulated frame never force a fresh string allocation (review finding).
      const fd = this.fd, preW = measureText(fd.line1Pre, 1);
      drawText(ctx, fd.line1Pre, 8, FD_Y + 3, { size: 1, color: UI.brassLight });
      drawText(ctx, fd.timerStr, 8 + preW, FD_Y + 3, { size: 1, color: UI.brassLight });
      drawText(ctx, fd.line1Post, 8 + preW + measureText(fd.timerStr, 1), FD_Y + 3, { size: 1, color: UI.brassLight });
      drawText(ctx, fd.line2, 8, FD_Y + 12, { size: 1, color: UI.paper });
    }
    if (this.trial) this.drawTrialPanel(ctx);
  }
  /** The right-side trial panel: name / hint, one row per step (done/current/pending), a blinking footer when done. */
  drawTrialPanel(ctx) {
    const def = this.trialDef, run = this.trial;
    let y = TRIAL_Y0;
    drawText(ctx, def.name, TRIAL_X, y, { size: 1, color: UI.brass, align: 'right' }); y += TRIAL_ROW_H;
    drawText(ctx, def.hint, TRIAL_X, y, { size: 1, color: UI.steel, align: 'right' }); y += TRIAL_ROW_H;
    for (let i = 0; i < this.trialRows.length; i++) {
      const done = i < run.index;
      const color = done ? UI.green : i === run.index ? UI.white : UI.steel;
      drawText(ctx, this.trialRows[i], TRIAL_X - TRIAL_MARK_W, y, { size: 1, color, align: 'right' });
      drawText(ctx, done ? '[X]' : '[ ]', TRIAL_X, y, { size: 1, color, align: 'right' });
      y += TRIAL_ROW_H;
    }
    if (run.done && (this.frame % 40) < 28) drawText(ctx, 'COMPLETE - TAUNT TO RETRY', TRIAL_X, y + 2, { size: 1, color: UI.brassLight, align: 'right' });
  }

  summary() {
    const fd = this.fd;
    const readout = {
      state: fd.state, stateTimer: fd.stateTimer, anim: fd.anim, startup: fd.startup, active: fd.active, recovery: fd.recovery,
      hitDamage: fd.hitDamage, hitStun: fd.hitStun, hitType: fd.hitType, dodgeI0: fd.dodgeI0, dodgeI1: fd.dodgeI1, dodgeThrough: fd.dodgeThrough,
    };
    const heroId = this.players[0] ? this.players[0].def.id : '';
    return {
      ...super.summary(),
      training: {
        mode: this.effectiveMode, userMode: this.opts.mode, variant: this.opts.variant, faceLock: this.opts.faceLock,
        meterLock: this.opts.meterLock, hitboxes: this.opts.hitboxes, frameData: this.opts.frameData,
        dummies: this.dummies.filter((s) => s.e && s.e.alive).length,
        trial: this.trial ? { id: this.trialDef.id, name: this.trialDef.name, step: this.trial.index, total: this.trialDef.steps.length, done: this.trial.done } : null,
        done: heroId ? trialProgress.done(heroId) : [],
        readout,
      },
    };
  }
}
