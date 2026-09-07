// PLACEHOLDER gameplay screen. The game-core engineer replaces this file with the real one
// (World, StageRunner, HUD, players). It reports screen id 'gameplay' and a minimal summary().
import { VIEW_W, VIEW_H, FLOOR_TOP, Z_MAX, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText } from '../../engine/text.js';
import { Camera } from '../../engine/camera.js';
import { particles } from '../../engine/particles.js';
import { buildRig, drawRig } from '../../art/rig.js';
import { AnimPlayer } from '../animation.js';
import { drawShadow } from '../../art/fx.js';
import { ENV } from '../../art/palettes.js';

/** Stub gameplay screen: floor band + idle rigs for the chosen characters. */
export class GameplayScreen extends Screen {
  constructor(game) { super(game, 'gameplay'); }
  enter(params) {
    super.enter(params);
    const chars = params.chars || this.game.options.chars || [0];
    this.camera = new Camera(2000);
    particles.clear();
    this.actors = chars.map((ci, i) => {
      const def = this.game.characters[ci] || this.game.characters[0] || { build: {}, anims: {} };
      const anim = new AnimPlayer(def.anims || {});
      anim.play('idle');
      return { def, rig: buildRig(def.build || {}), anim, x: 120 + i * 60, y: 0, z: 60 + i * 30, facing: 1, hp: 100, maxHp: 100, lives: 3, meter: 0, score: 0, state: 'IDLE', alive: true };
    });
    this.game.players = this.actors;
  }
  update() {
    super.update();
    const inp = this.game.input;
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i], ax = inp.axis(i);
      a.x += ax.x * 2; a.z = Math.max(0, Math.min(Z_MAX, a.z + ax.y * 1.2));
      if (ax.x) a.facing = ax.x;
      a.anim.play(ax.x || ax.y ? 'walk' : 'idle');
      a.state = ax.x || ax.y ? 'WALK' : 'IDLE';
      a.anim.tick();
    }
    this.camera.follow(this.actors);
    this.camera.update();
    particles.update();
  }
  draw(ctx) {
    const cam = this.camera;
    const g = ctx.createLinearGradient(0, 0, 0, FLOOR_TOP);
    g.addColorStop(0, ENV.skyTop); g.addColorStop(1, ENV.skyHorizon);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP);
    ctx.fillStyle = ENV.floorCobble; ctx.fillRect(0, FLOOR_TOP, VIEW_W, Z_MAX);
    ctx.fillStyle = ENV.floorCobbleDark; ctx.fillRect(0, FLOOR_TOP, VIEW_W, 2); ctx.fillRect(0, FLOOR_TOP + Z_MAX, VIEW_W, VIEW_H - FLOOR_TOP - Z_MAX);
    for (let x = -((cam.x | 0) % 40); x < VIEW_W; x += 40) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, FLOOR_TOP, 1, Z_MAX); }
    for (const a of this.actors) drawShadow(ctx, cam, a.x, a.y, a.z, 34 * a.rig.scale);
    particles.draw(ctx, cam, 'back');
    const sorted = this.actors.slice().sort((p, q) => p.z - q.z);
    for (const a of sorted) drawRig(ctx, a.rig, a.anim.pose, { x: cam.toScreenX(a.x), y: FLOOR_TOP + a.z - a.y + cam.shakeY, facing: a.facing });
    particles.draw(ctx, cam, 'front');
    drawText(ctx, 'GAMEPLAY STUB - GAME CORE NOT BUILT YET', 320, 8, { size: 1, color: UI.brass, align: 'center' });
  }
  summary() {
    return {
      sectionIndex: 0, cameraX: this.camera.x, locked: this.camera.locked, wavesCleared: 0, boss: null, enemies: [],
      players: this.actors.map((a) => ({ hp: a.hp, lives: a.lives, x: a.x, state: a.state, meter: a.meter, score: a.score })),
    };
  }
}
