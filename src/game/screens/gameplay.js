// Gameplay screen: World + players + HUD on a placeholder arena until the StageRunner exists (ARCHITECTURE.md sections 9, 12, 15).
import { VIEW_W, VIEW_H, TEAM, Z_MAX, METER, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { World } from '../world.js';
import { Player } from '../player.js';
import { Fighter } from '../fighter.js';
import { Hud } from '../hud.js';
import { Prop } from '../items.js';
import { makeDummyDef } from '../dummy.js';
import { createBackdrop } from '../../art/backgrounds/index.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { clamp } from '../../engine/math.js';

const ARENA_LENGTH = 2000;
const GAME_OVER_FRAMES = 240;

/** The main in-game screen. Exposes spawnEnemy / killAllEnemies / fillMeter / facePlayerToNearestEnemy / summary for window.__game. */
export class GameplayScreen extends Screen {
  constructor(game) { super(game, 'gameplay'); }
  enter(params) {
    super.enter(params);
    const game = this.game, opt = game.options;
    const chars = (params.chars && params.chars.length ? params.chars : opt.chars) || [0];
    // Placeholder arena: the stage runner (game/stage.js) replaces this with real stage data when it lands.
    this.stage = { id: 'arena', name: 'TRAINING YARD', length: ARENA_LENGTH, sections: [{ id: 'arena', x0: 0, x1: ARENA_LENGTH, backdrop: 'section1', floor: 'planks' }] };
    this.backdrop = createBackdrop(this.stage.sections[0], this.stage);
    this.world = new World({ stageLength: ARENA_LENGTH, game, backdrop: this.backdrop, options: opt });
    this.world.onEnemyKilled = (e, killer) => { this.enemiesDefeated++; };
    this.enemiesDefeated = 0;
    this.players = [];
    chars.slice(0, 2).forEach((ci, i) => this.addPlayer(ci, i));
    this.hud = new Hud(this.world, game);
    game.players = this.players;
    this.gameOverTimer = 0;
    this.time = 0;
    // free-roam props so breakables can be tested without a stage
    this.world.add(new Prop('crate', 420, 40, { drops: 'meatPie' }));
    this.world.add(new Prop('barrel', 560, 110, { drops: 'coalScrip' }));
    for (const s of opt.spawn || []) this.spawnEnemy(s.type, s.variant, s.dx, s.dz);
    if (params.resume) return;
    game.audio.music.play('section1');
    this.hud.showBanner('TRAINING YARD', 'NO STAGE LOADED - FREE ROAM', 120);
  }
  /** Add a player for character index `ci` in slot `slot`. */
  addPlayer(ci, slot) {
    const def = this.game.characters[ci] || this.game.characters[0];
    if (!def) return null;
    const opt = this.game.options;
    const cam = this.world.camera;
    const p = new Player(def, slot, { input: this.game.input, x: clamp(cam.x + 100 + slot * 40, 20, ARENA_LENGTH - 20), z: 70 + slot * 24, facing: 1, bot: !!opt.bot, godmode: !!opt.godmode });
    if (slot === 1) p.tint = null;
    this.world.add(p);
    this.players[slot] = p;
    return p;
  }
  update() {
    super.update();
    const inp = this.game.input, world = this.world;
    // P2 drop-in (any P2-only key)
    if (!inp.joined(1) && inp.joinPressed(1) && this.players.length < 2) {
      inp.setJoined(1, true);
      const ci = this.game.options.chars[1] != null ? this.game.options.chars[1] : 1;
      this.addPlayer(ci, 1);
      this.game.audio.play('join');
      this.hud.showBanner('P2 JOINS!', '', 60);
    }
    // pause: Escape (global) or a joined player's start button
    let pause = inp.globalPressed('pause');
    for (let i = 0; i < 2 && !pause; i++) if (inp.joined(i) && inp.pressed(i, 'start')) pause = true;
    if (pause && this.game.factories.pause) { this.game.audio.play('pause'); this.game.push('pause'); return; }
    this.time++;
    world.update();
    this.hud.update();
    const anyAlive = this.players.some((p) => p && !p.out);
    if (!anyAlive) {
      if (++this.gameOverTimer === 1) this.game.audio.music.play('gameover');
      if (this.gameOverTimer >= GAME_OVER_FRAMES) {
        if (this.game.factories.gameover) this.game.replace('gameover', { players: this.players });
        else this.game.fadeTo(() => this.game.reset('title'), 0.05);
      }
    }
  }
  draw(ctx) {
    this.world.draw(ctx);
    this.hud.draw(ctx);
    if (window.__game && window.__game.debug) this.world.drawDebug(ctx);
    if (this.gameOverTimer > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawTextOutlined(ctx, 'THE ENGINE WINS.', VIEW_W / 2, 150, { size: 3, color: UI.red, outline: '#2a1010', thickness: 1, align: 'center' });
      drawText(ctx, 'GAME OVER', VIEW_W / 2, 190, { size: 2, color: UI.paper, align: 'center' });
    }
  }
  exit() { this.game.players = []; }

  // ---------- window.__game hooks ----------
  summary() {
    const w = this.world, b = w.boss;
    return {
      sectionIndex: w.sectionIndex, cameraX: w.camera.x, locked: w.camera.locked, wavesCleared: w.wavesCleared,
      players: this.players.filter(Boolean).map((p) => ({ hp: p.hp, lives: p.lives, x: p.x, z: p.z, state: p.state, meter: p.meter, score: p.score, combo: p.combo, out: p.out })),
      enemies: w.enemies.filter((e) => e.kind !== 'boss').map((e) => ({ name: e.name, type: e.def.type || '', variant: e.def.variant || '', hp: e.hp, state: e.state, x: e.x, z: e.z })),
      boss: b ? { kind: b.bossKind || 'boss', name: b.name, hp: b.hp, maxHp: b.maxHp, phase: b.phase || 1, state: b.state } : null,
      enemiesDefeated: this.enemiesDefeated, time: this.time,
    };
  }
  /**
   * Spawn an enemy at P1.x + dx, P1.z + dz. Uses `game.enemyFactory(type, variant, x, z, world)` when the enemy content
   * registry has installed one; otherwise a generic dummy Fighter so combat can be exercised.
   */
  spawnEnemy(type = 'typeA', variant = 'grunt', dx = 80, dz = 0) {
    const p1 = this.players[0] || { x: this.world.camera.x + 200, z: 70 };
    const x = p1.x + (Number(dx) || 0), z = clamp(p1.z + (Number(dz) || 0), 0, Z_MAX);
    let e = null;
    if (typeof this.game.enemyFactory === 'function') e = this.game.enemyFactory(type, variant, x, z, this.world);
    if (!e) { e = new Fighter(makeDummyDef(type, variant), { team: TEAM.ENEMY, kind: 'enemy', x, z, facing: x < p1.x ? 1 : -1 }); }
    if (!e.world) this.world.add(e);
    return e;
  }
  /** Remove every enemy (and boss) immediately. */
  killAllEnemies() {
    for (const e of this.world.entities.slice()) {
      if ((e.kind === 'enemy' || e.kind === 'boss') || (e.kind === 'projectile' && e.team === TEAM.ENEMY)) this.world.remove(e);
    }
    for (const p of this.players) if (p) { p.grabTarget = null; p.heldBody = null; if (p.lastTarget && p.lastTarget.removeMe) p.lastTarget = null; }
    this.world._refreshLists();
  }
  /** Fill a player's meter to the max (super ready). */
  fillMeter(pi = 0) { const p = this.players[pi]; if (p) p.meter = METER.max; }
  /** Turn a player toward (and step toward) the nearest enemy. */
  facePlayerToNearestEnemy(pi = 0) { const p = this.players[pi]; if (p) p.faceNearestEnemy(this.world); }
}
