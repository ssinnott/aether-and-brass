// Gameplay screen: World + players + HUD + StageRunner (ARCHITECTURE.md sections 7, 9, 12, 15).
// Exposes spawnEnemy / spawnEnemyAt / killAllEnemies / fillMeter / facePlayerToNearestEnemy / summary for window.__game.
import { VIEW_W, VIEW_H, TEAM, ST, Z_MAX, METER, UI, MAX_PLAYERS, NET_PLAYERS } from '../../constants.js';
import { Screen } from '../game.js';
import { World } from '../world.js';
import { Player } from '../player.js';
import { Enemy } from '../enemy.js';
import { Boss } from '../boss.js';
import { Hud } from '../hud.js';
import { StageRunner } from '../stage.js';
import { getEnemyDef } from '../../content/enemies/index.js';
import { getStage } from '../../content/stage/index.js';
import { drawTextOutlined } from '../../engine/text.js';
import { clamp } from '../../engine/math.js';
import { WeaponPickup } from '../items.js';
import { dropInChar, dupTint } from '../party.js';

const GAME_OVER_DELAY = 150;
const START_X = 100;
/** Player z spread (issue #23): slot 3 lands at 70 + 3*16 = 118, inside Z_MAX 140 (today's slot*24 would hit 142). */
const PLAYER_START_Z = 70, PLAYER_Z_PITCH = 16;
/** Difficulty tuning (GDD 7): enemy HP / damage multipliers, tell speed, continues. */
const DIFFICULTY = {
  easy: { hpMult: 0.75, dmgMult: 0.6, tellScale: 1.3, continues: 5 },
  normal: { hpMult: 1, dmgMult: 1, tellScale: 1, continues: 3 },
  hard: { hpMult: 1.25, dmgMult: 1.4, tellScale: 0.85, continues: 2 },
};

/** The main in-game screen. */
export class GameplayScreen extends Screen {
  constructor(game) { super(game, 'gameplay'); this.pauseScreenId = 'pause'; }
  enter(params) {
    super.enter(params);
    const game = this.game, opt = game.options;
    const chars = (params.chars && params.chars.length ? params.chars : opt.chars) || [0];
    this.stage = params.stage || getStage(opt.stage);
    this.backdrop = null;
    this.difficulty = DIFFICULTY[opt.difficulty] || DIFFICULTY.normal;
    opt.tellScale = this.difficulty.tellScale;
    this.world = new World({ stageLength: this.stage.length, game, backdrop: null, options: opt });
    this.world.onEnemyKilled = () => { this.enemiesDefeated++; };
    this.enemiesDefeated = 0;
    this.players = [];
    this.continues = params.continues != null ? params.continues : this.difficulty.continues;
    this.continuesUsed = 0;
    this.hud = new Hud(this.world, game);
    chars.slice(0, this.maxPlayers()).forEach((ci, i) => { if (ci != null && ci >= 0) this.addPlayer(ci, i); });
    this.players.forEach((p, i) => { if (p && i > 0) game.input.setJoined(i, true); });
    game.players = this.players;
    this.gameOverTimer = 0; this.gameOverShown = false;
    this.time = 0;
    // #22 training room: TrainingScreen passes its own nowaves/section (arena stage, camera locked by hand
    // since the runner only locks when !nowaves); every other caller keeps reading game.options as before.
    const nowaves = params.nowaves != null ? !!params.nowaves : !!opt.nowaves;
    const section = params.section != null ? params.section | 0 : (opt.section || 0);
    // ?event=<id> (issue #33): the runner resolves the id to its section and arms it once the party is in place
    const event = params.event != null ? params.event : (opt.event || '');
    this.runner = new StageRunner(this.world, this.stage, { game, hud: this.hud, screen: this, nowaves, startSection: section, startEvent: event });
    this.runner.start();
    for (const s of opt.spawn || []) this.spawnEnemy(s.type, s.variant, s.dx, s.dz);
    if (!params.resume && !(section > 0)) this.hud.showBanner(this.stage.name, this.stage.sections[0].name || '', 120);
  }
  /**
   * Netplay status over the scene: a stall while somebody's input is late, the note when one player
   * of a larger party drops out mid-match, and the banner shown when the session itself ends and
   * the bots take over every seat but this one.
   */
  drawNetStatus(ctx) {
    const net = this.game.net;
    if (!net) return;
    if (net.active && net.waiting) {
      const f = this.frame;
      const late = (net.missing || []).filter((s) => s !== net.localSlot).map((s) => s + 1);
      const who = late.length > 1 ? `WAITING FOR PLAYERS ${late.join(' AND ')}` : `WAITING FOR PLAYER ${late[0] || net.remoteSlot + 1}`;
      ctx.fillStyle = 'rgba(10,6,20,0.55)'; ctx.fillRect(0, VIEW_H / 2 - 22, VIEW_W, 44);
      drawTextOutlined(ctx, who, VIEW_W / 2, VIEW_H / 2 - 14, { size: 2, color: '#4DF0E0', outline: '#0a3a38', align: 'center' });
      drawTextOutlined(ctx, '.'.repeat(1 + ((f >> 4) % 3)), VIEW_W / 2, VIEW_H / 2 + 6, { size: 2, color: '#4DF0E0', outline: '#0a3a38', align: 'center' });
    } else if (net.state === 'ended' && net.endReason && this.frame - (this.netEndedAt || (this.netEndedAt = this.frame)) < 240) {
      const bots = (this.players || []).map((p, i) => (p && i !== net.localSlot ? i + 1 : 0)).filter(Boolean);
      ctx.fillStyle = 'rgba(10,6,20,0.6)'; ctx.fillRect(0, 40, VIEW_W, 30);
      drawTextOutlined(ctx, String(net.endReason).toUpperCase(), VIEW_W / 2, 44, { size: 1, color: UI.red, outline: '#2a0808', align: 'center' });
      const line = bots.length > 1 ? `PLAYERS ${bots.join(' AND ')} ARE NOW BOTS` : `PLAYER ${bots[0] || 2} IS NOW A BOT`;
      drawTextOutlined(ctx, line, VIEW_W / 2, 58, { size: 1, color: UI.paper, outline: '#2a0808', align: 'center' });
    } else if (net.active && net.lastDrop && performance.now() - net.lastDrop.at < 4000) {
      // One player of three or four lost: the match plays on, so say who the bot has taken over.
      ctx.fillStyle = 'rgba(10,6,20,0.6)'; ctx.fillRect(0, 40, VIEW_W, 16);
      drawTextOutlined(ctx, `PLAYER ${net.lastDrop.slot + 1} LEFT - THE BOT TAKES OVER`, VIEW_W / 2, 44, { size: 1, color: UI.red, outline: '#2a0808', align: 'center' });
    }
  }
  /** Swap the backdrop (StageRunner calls this on section changes). */
  setBackdrop(b) { this.backdrop = b; this.world.backdrop = b; }
  /** Slots this run may fill: the party the lockstep session seated under netplay (two to four),
   *  four for couch co-op. A method (not a constant) so #22's training arena can cap the run at one. */
  maxPlayers() {
    if (!this.game.options.netplay) return MAX_PLAYERS;
    const net = this.game.net;
    return Math.min(NET_PLAYERS, (net && net.players) || NET_PLAYERS);
  }
  /** Add a player for character index `ci` in slot `slot`. */
  addPlayer(ci, slot) {
    const def = this.game.characters[ci] || this.game.characters[0];
    if (!def) return null;
    const opt = this.game.options, cam = this.world.camera;
    const x = clamp(Math.max(cam.x, cam.left) + START_X + slot * 40, 20, this.stage.length - 20);
    // ?botstyle=aggressive,defensive gives each slot its own autopilot archetype; one name applies to both.
    const styles = opt.botStyle || [];
    const p = new Player(def, slot, { input: this.game.input, x, z: PLAYER_START_Z + slot * PLAYER_Z_PITCH, facing: 1,
      bot: !!opt.bot, botStyle: styles[slot] || styles[0] || '', godmode: !!opt.godmode });
    const t = dupTint(this.players, def, slot);
    if (t) { p.tint = t.tint; p.tintAlpha = t.tintAlpha; }
    this.world.add(p);
    this.players[slot] = p;
    return p;
  }
  update() {
    super.update();
    const inp = this.game.input, world = this.world;
    // Under netplay every seat is established by the lobby and every input arrives through the
    // lockstep mask. joinPressed() and globalPressed() are local keyboard edges that never reach
    // the peer, so acting on them here would advance one peer's simulation and not the other's.
    const online = !!(this.game.net && this.game.net.active);
    // Drop-in on any free slot (any that slot's own key/pad); the join edge itself never doubles as
    // a pause press. A Set per update is fine -- this is the sim tick, not a per-frame draw path.
    const joinedNow = new Set();
    if (!online) {
      for (let s = 1; s < MAX_PLAYERS; s++) {
        if (inp.joined(s) || this.players[s] || !inp.joinPressed(s)) continue;
        if (this.players.filter(Boolean).length >= this.maxPlayers()) break;
        inp.setJoined(s, true); joinedNow.add(s);
        this.addPlayer(dropInChar(this.game.options, this.game.characters, s), s);
        this.game.audio.play('join');
        this.hud.showBanner(`P${s + 1} JOINS!`, '', 60);
      }
    }
    // pause: Escape (global) or a joined player's start button
    // Escape is folded into the `start` bit by the net session, so pause is a simulated event.
    let pause = !online && inp.globalPressed('pause');
    for (let i = 0; i < MAX_PLAYERS && !pause; i++) if (inp.joined(i) && !joinedNow.has(i) && inp.pressed(i, 'start')) pause = true;
    if (pause && this.game.factories[this.pauseScreenId] && !this.gameOverShown) { this.game.audio.play('pause'); this.game.push(this.pauseScreenId); return; }
    this.time++;
    world.update();
    this.runner.update();
    this.hud.update();
    const anyAlive = this.players.some((p) => p && !p.out);
    if (!anyAlive && !this.gameOverShown) {
      if (++this.gameOverTimer === 1) this.game.audio.music.play('gameover');
      if (this.gameOverTimer >= GAME_OVER_DELAY) {
        this.gameOverShown = true;
        if (this.game.factories.gameover) this.game.push('gameover', { screen: this, continues: this.continues });
        else this.game.fadeTo(() => this.game.reset('title'), 0.05);
      }
    }
  }
  /** Spend a continue: every player back with fresh lives and full HP at the current spot (GDD 7). */
  continueRun() {
    if (this.continues <= 0) return false;
    this.continues--; this.continuesUsed++;
    const cam = this.world.camera;
    this.players.forEach((p, i) => {
      if (!p) return;
      p.out = false; p.dead = false; p.alive = true; p.removeMe = false; p.lives = 3; p.continuesUsed++;
      p.hp = p.maxHp; p.meter = 0; p.state = ST.IDLE; p.stateTimer = 0; p.hitstop = 0; p.grabbedBy = null; p.grabTarget = null; p.heldBody = null; p.heldProp = null;
      p.hurtTimer = 0; p.juggleCount = 0; p.juggleGravity = 0; p.juggleImmune = false; p.chainHits = 0; p.combo = 0; p.comboTimer = 0; p.running = false; p.comboStep = 0; p.busy = 0;
      p.clearWeapon();
      p.x = clamp(cam.x + VIEW_W / 2 - 40 + i * 60, cam.left + 20, cam.right - 20); p.z = PLAYER_START_Z + i * PLAYER_Z_PITCH; p.y = 0; p.vy = 0; p.vx = 0;
      p.invuln = 120; p.play('idle');
      if (!this.world.entities.includes(p)) this.world.add(p);
    });
    this.world._refreshLists();
    this.gameOverTimer = 0; this.gameOverShown = false;
    this.game.audio.music.play(this.runner.music || 'section1');
    this.hud.showBanner('CONTINUE!', `${this.continues} LEFT`, 90);
    return true;
  }
  /** Stage cleared: results screen with the run statistics. */
  onVictory() {
    this.game.audio.music.stop();
    this.game.fadeTo(() => this.showResults(false), 0.04);
  }
  /** Replace this screen with the results plaque (`defeat` = continue countdown expired: GDD 9, D-rank ceiling). */
  showResults(defeat = false) {
    const stats = this.players.filter(Boolean).map((p) => ({
      name: p.def.name, kills: p.kills, maxCombo: p.maxCombo, damageTaken: Math.round(p.damageTakenTotal), continues: p.continuesUsed, score: p.score, lives: p.lives, index: p.index,
    }));
    this.game.replace('results', { stats, defeat, stage: this.stage, time: this.time, enemiesDefeated: this.enemiesDefeated, continuesUsed: this.continuesUsed, sectionIndex: this.world.sectionIndex, wavesCleared: this.world.wavesCleared, cameraX: this.world.camera.x });
  }
  draw(ctx) {
    this.world.draw(ctx);
    this.runner.draw(ctx);
    this.hud.draw(ctx);
    this.drawNetStatus(ctx);
    if (window.__game && window.__game.debug) this.world.drawDebug(ctx);
    if (this.gameOverTimer > 0 && !this.gameOverShown) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.5, this.gameOverTimer / GAME_OVER_DELAY * 0.5)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawTextOutlined(ctx, 'ALL HEROES DOWN', VIEW_W / 2, 150, { size: 3, color: UI.red, outline: '#2a1010', thickness: 1, align: 'center' });
    }
  }
  exit() {
    // Any way out of the match ends the session: quitting to title, the results screen, a reset.
    // Without this the lockstep pump keeps injecting the peer's masks into the title screen menu.
    if (this.game.net && this.game.net.active) this.game.net.end('left the match');
    this.game.players = [];
    if (this.runner) this.runner.dispose();
  }

  // ---------- window.__game hooks ----------
  summary() {
    const w = this.world, b = w.boss;
    const rs = this.runner && this.runner.summary ? this.runner.summary() : {};
    return {
      ...rs,
      sectionIndex: w.sectionIndex, cameraX: w.camera.x, locked: w.camera.locked, wavesCleared: w.wavesCleared,
      players: this.players.filter(Boolean).map((p) => ({ hp: p.hp, lives: p.lives, shield: p.shield, shieldMax: p.shieldMax, x: p.x, z: p.z, state: p.state, meter: p.meter, score: p.score, combo: p.combo, out: p.out, weapon: p.weaponId, weaponHits: p.weaponHits, index: p.index, id: p.def.id })),
      enemies: w.enemies.filter((e) => e.kind !== 'boss').map((e) => ({ name: e.name, type: e.def.type || '', variant: e.def.variant || '', mods: e.mods || [], hp: e.hp, state: e.state, x: e.x, z: e.z, ai: e.aiState })),
      boss: b ? { kind: b.bossKind || 'boss', name: b.name, hp: b.hpTotal != null ? b.hpTotal : b.hp, maxHp: b.hpTotalMax || b.maxHp, phase: b.phase || 1, state: b.state, phaseName: b.phaseName } : null,
      enemiesDefeated: this.enemiesDefeated, time: this.time, continues: this.continues,
    };
  }
  /** Spawn an enemy at P1.x + dx, P1.z + dz (bosses too: type 'midboss' | 'boss'). */
  spawnEnemy(type = 'brassbound', variant = 'footman', dx = 80, dz = 0) {
    const p1 = this.players[0] || { x: this.world.camera.x + 200, z: 70 };
    const x = p1.x + (Number(dx) || 0), z = clamp(p1.z + (Number(dz) || 0), 0, Z_MAX);
    return this.spawnEnemyAt(type, variant, x, z, { facing: x < p1.x ? 1 : -1 });
  }
  /**
   * Debug / test hook (issue #30): queue one spawn with an authored entrance through the stage runner, so a
   * scenario can watch a `teleport` / `flyIn` / `descend` / `ropeDrop` tell, arrival and punish window on an
   * otherwise empty `?nowaves=1` arena. Returns the queued pending entry, or null with no runner.
   */
  spawnEntrance(type = 'brassbound', variant = 'warden', kind = 'teleport', opts = {}) {
    if (!this.runner) return null;
    const { z, delay, ...entrance } = opts || {};
    return this.runner.spawnEntrance(type, variant, { kind, ...entrance }, { z, delay });
  }
  /** Spawn an enemy from the content registry at absolute world coords. `opts.def` (training room) skips the lookup. */
  spawnEnemyAt(type, variant, x, z, opts = {}) {
    const def = opts.def || getEnemyDef(type, variant);
    const e = def.boss ? new Boss(def, { x, z, facing: opts.facing != null ? opts.facing : -1 }) : new Enemy(def, { x, z, ...opts });
    const d = this.difficulty || DIFFICULTY.normal;
    if (!def.boss && d.hpMult !== 1) { e.maxHp = Math.round(e.maxHp * d.hpMult); e.hp = e.maxHp; }
    if (d.dmgMult !== 1) e.damageMult = (e.damageMult || 1) * d.dmgMult;
    this.world.add(e);
    return e;
  }
  /** Test hook: lay a pickup weapon at P1.x + dx, P1.z + dz (settled, no pop, no grace). */
  spawnWeapon(id = 'halberd', dx = 0, dz = 0) {
    const p1 = this.players[0] || { x: this.world.camera.x + 200, z: 70 };
    const wp = new WeaponPickup(id, p1.x + (Number(dx) || 0), clamp(p1.z + (Number(dz) || 0), 0, Z_MAX), { pop: false });
    this.world.add(wp);
    return wp.weaponId;
  }
  /** Remove every enemy (and boss) immediately. */
  killAllEnemies() {
    for (const e of this.world.entities.slice()) {
      if ((e.kind === 'enemy' || e.kind === 'boss') || (e.kind === 'projectile' && e.team === TEAM.ENEMY)) this.world.remove(e);
    }
    for (const p of this.players) {
      if (!p) continue;
      p.grabTarget = null; p.heldBody = null; p.grabbedBy = null; p.hitstop = 0;
      if (p.lastTarget && p.lastTarget.removeMe) p.lastTarget = null;
      // test hook: scripted moves expect a clean actionable player, so leftover hitstun from the removed enemies is cleared
      if (p.inHitstun && !p.out && !p.dead) { p.hurtTimer = 0; p.y = 0; p.vy = 0; p.vx = 0; p.setState(ST.IDLE, 'idle'); }
    }
    this.world.attackTokens.holders.clear();
    this.world._refreshLists();
  }
  /** Fill a player's meter to the max (super ready). */
  fillMeter(pi = 0) { const p = this.players[pi]; if (p) p.meter = METER.max; }
  /** Turn a player toward (and step toward) the nearest enemy. */
  facePlayerToNearestEnemy(pi = 0) { const p = this.players[pi]; if (p) p.faceNearestEnemy(this.world); }
}

