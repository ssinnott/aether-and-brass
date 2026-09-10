// Title screen (GDD 9 + RECONCILIATION): navy sky, a brass gear (r 140) rotating behind the tiered-city silhouette,
// the AETHER & BRASS logo with a bevel, the four heroes idling on the gear, menu START (1P) / START (2P) /
// DIFFICULTY / MUTE, blinking PRESS START, a compact controls legend (no controls screen) and P2 drop-in.
// START goes to BOARD SELECT (screens/boardselect.js), which is where the run's board is chosen; the plate under
// the logo just reports how many boards are open so far (game/progress.js).
import { VIEW_W, VIEW_H, UI } from '../../constants.js';
import { Screen } from '../game.js';
import { drawText, drawTextOutlined } from '../../engine/text.js';
import { particles } from '../../engine/particles.js';
import { gear, rrect, pathPoly, paint, rivetLine, pipe, circle } from '../../art/shapes.js';
import { buildRig, drawRig } from '../../art/rig.js';
import { drawShadowScreen } from '../../art/fx.js';
import { AnimPlayer } from '../animation.js';
import { ENV } from '../../art/palettes.js';
import { STAGES } from '../../content/stage/index.js';
import { progress } from '../progress.js';

const MENU = ['START (1P)', 'START (2P)', 'ONLINE CO-OP', 'DIFFICULTY', 'MUTE'];
const I_ONLINE = 2, I_DIFF = 3, I_MUTE = 4;
// Controls legend (RECONCILIATION "Final controls"). Keep in step with engine/input.js bindings.
const LEGEND_1P = '1P  ARROWS MOVE  Z ATTACK  X JUMP  C DODGE  V SPECIAL  N SUPER  B TAUNT  ENTER START';
const LEGEND_P1 = 'P1  WASD MOVE  F ATTACK  G JUMP  R DODGE  H SPECIAL  Y SUPER  T TAUNT  ENTER START';
const LEGEND_P2 = 'P2  ARROWS MOVE  J ATTACK  K JUMP  U DODGE  L SPECIAL  O SUPER  I TAUNT  BACKSPACE START';
export const DIFFICULTIES = ['easy', 'normal', 'hard'];
// tiered city: [x, top, w] terraces, front row darker
const FAR_TOWERS = [[0, 236, 44], [48, 214, 30], [84, 246, 60], [150, 222, 26], [182, 206, 50], [240, 232, 34], [280, 218, 40], [326, 240, 30], [362, 210, 56], [424, 230, 40], [470, 216, 30], [506, 244, 50], [562, 222, 40], [608, 236, 40]],
  NEAR_TOWERS = [[0, 262, 70], [76, 250, 40], [122, 270, 90], [218, 256, 60], [284, 272, 70], [360, 252, 44], [410, 268, 80], [496, 254, 50], [552, 266, 90]];
const STACKS = [[196, 206], [372, 210], [566, 222]];
const HERO_X = [96, 184, 456, 544], HERO_Y = 300;
const GEAR_CX = 320, GEAR_CY = 300, GEAR_R = 140;

/** Title screen. Attack / start confirm the menu item; P2 keys join at any time. */
export class TitleScreen extends Screen {
  constructor(game) { super(game, 'title'); }
  enter(params) {
    super.enter(params);
    this.game.audio.music.play('title');
    particles.clear();
    // A netplay session owns slot 1 for its lifetime; clearing it here would silently drop the peer.
    if (!(this.game.net && this.game.net.active)) this.game.input.setJoined(1, false); // new session: P1 solo aliases active until P2 joins
    if (!this.game.options.difficulty) this.game.options.difficulty = 'normal';
    this.cursor = 0; this.p2Flash = 0; this.starting = false;
    this.heroes = (this.game.characters || []).slice(0, 4).map((c, i) => {
      const anim = new AnimPlayer(c.anims || {});
      anim.play('idle');
      for (let k = 0; k < i * 11; k++) anim.tick(); // desynchronise the idle loops
      return { rig: buildRig(c.build || {}), anim, def: c };
    });
  }
  get difficulty() { return this.game.options.difficulty || 'normal'; }
  update() {
    super.update();
    const inp = this.game.input, audio = this.game.audio;
    for (const s of STACKS) if (this.frame % 9 === 0) particles.spawn('steam', s[0] + 4, s[1] - 6, 0, { screen: true, vx: 0.25, vy: -0.7, size: 3, life: 55 });
    if (this.frame % 5 === 0) particles.spawn('ember', 60 + (this.frame * 37) % 520, 330, 0, { screen: true, vx: 0.2, vy: -0.6, size: 1, life: 70 });
    particles.update();
    for (const h of this.heroes) h.anim.tick();
    if (this.p2Flash > 0) this.p2Flash--;
    let joinedNow = false; // the join key itself never doubles as a menu press
    if (!inp.joined(1) && inp.joinPressed(1)) { inp.setJoined(1, true); this.p2Flash = 120; audio.play('join'); joinedNow = true; }
    if (this.frame < 10 || this.starting) return;
    for (let p = 0; p < 2; p++) {
      if (!inp.joined(p) || (p === 1 && joinedNow)) continue;
      if (inp.pressed(p, 'up')) { this.cursor = (this.cursor + MENU.length - 1) % MENU.length; audio.play('menu_move'); }
      if (inp.pressed(p, 'down')) { this.cursor = (this.cursor + 1) % MENU.length; audio.play('menu_move'); }
      const dir = (inp.pressed(p, 'right') ? 1 : 0) - (inp.pressed(p, 'left') ? 1 : 0);
      if (dir && this.cursor === I_DIFF) { this.cycleDifficulty(dir); continue; }
      if (dir && this.cursor === I_MUTE) { audio.toggleMute(); audio.play('menu_move'); continue; }
      if (inp.pressed(p, 'attack') || inp.pressed(p, 'start') || inp.pressed(p, 'jump')) { this.activate(this.cursor); return; }
    }
  }
  cycleDifficulty(dir) {
    const i = DIFFICULTIES.indexOf(this.difficulty);
    this.game.options.difficulty = DIFFICULTIES[(i + dir + DIFFICULTIES.length) % DIFFICULTIES.length];
    this.game.audio.play('menu_move');
  }
  activate(i) {
    const audio = this.game.audio;
    if (i === 0 || i === 1) {
      if (i === 1) this.game.input.setJoined(1, true);
      this.starting = true;
      audio.play('menu_confirm');
      // START always goes through BOARD SELECT; if that screen is not registered the run falls back to the
      // character select on whichever board options.stage already names.
      const next = this.game.factories.boardselect ? 'boardselect' : 'select';
      this.game.fadeTo(() => this.game.replace(next), 0.08);
    } else if (i === I_ONLINE) {
      this.starting = true;
      audio.play('menu_confirm');
      this.game.fadeTo(() => this.game.replace('lobby'), 0.08);
    } else if (i === I_DIFF) this.cycleDifficulty(1);
    else { audio.toggleMute(); audio.play('menu_confirm'); }
  }
  draw(ctx) {
    const f = this.frame;
    // sky + moon
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, ENV.skyTop); g.addColorStop(0.55, ENV.skyMid); g.addColorStop(1, ENV.skyHorizon);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#f4e8c8'; ctx.beginPath(); ctx.arc(556, 56, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.arc(549, 51, 5, 0, Math.PI * 2); ctx.arc(564, 65, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 26; i++) ctx.fillRect((i * 97 + 13) % VIEW_W, (i * 53 + 7) % 150, 1, 1);
    // the great gear (brass outline, r 140) turning behind the city
    ctx.globalAlpha = 0.28;
    gear(ctx, GEAR_CX, GEAR_CY, GEAR_R, 18, '#3a2818', null, 0, f * 0.003, 0);
    ctx.globalAlpha = 0.75;
    gear(ctx, GEAR_CX, GEAR_CY, GEAR_R, 18, null, '#c8964a', 1, f * 0.003, 0);
    circle(ctx, GEAR_CX, GEAR_CY, 104, null, '#a87830', 1);
    circle(ctx, GEAR_CX, GEAR_CY, 96, null, '#a87830', 0.5);
    circle(ctx, GEAR_CX, GEAR_CY, 30, '#2a1c14', '#c8964a', 1);
    ctx.strokeStyle = '#a87830'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = f * 0.003 + i * Math.PI / 3;
      ctx.beginPath(); ctx.moveTo(GEAR_CX + Math.cos(a) * 30, GEAR_CY + Math.sin(a) * 30); ctx.lineTo(GEAR_CX + Math.cos(a) * 96, GEAR_CY + Math.sin(a) * 96); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // cyan summit glow + tiered city silhouette (two rows), windows, chimney stacks
    ctx.fillStyle = 'rgba(77,240,224,0.18)'; ctx.beginPath(); ctx.arc(372, 208, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#231a30';
    for (const [x, top, w] of FAR_TOWERS) { ctx.fillRect(x, top, w, VIEW_H - top); ctx.fillRect(x + 4, top - 6, w - 8, 6); }
    for (const [x, y] of STACKS) ctx.fillRect(x, y, 8, 40);
    ctx.fillStyle = '#ffd070';
    for (let i = 0; i < FAR_TOWERS.length; i++) { const [x, top, w] = FAR_TOWERS[i]; for (let k = 0; k < 3; k++) if (((i * 7 + k * 13 + (f >> 5)) % 5) !== 0) ctx.fillRect(x + 5 + k * Math.max(4, (w - 10) / 3), top + 10, 2, 3); }
    ctx.fillStyle = '#16101e';
    for (const [x, top, w] of NEAR_TOWERS) { ctx.fillRect(x, top, w, VIEW_H - top); ctx.fillRect(x + 6, top - 5, w - 12, 5); }
    ctx.fillStyle = '#e8a840';
    for (let i = 0; i < NEAR_TOWERS.length; i++) { const [x, top, w] = NEAR_TOWERS[i]; for (let k = 0; k < 4; k++) if (((i * 5 + k * 11 + (f >> 6)) % 4) !== 0) ctx.fillRect(x + 6 + k * Math.max(5, (w - 12) / 4), top + 8, 3, 4); }
    particles.draw(ctx, null, 'front');
    // foreground brass walkway + heroes
    ctx.fillStyle = '#2c2030'; ctx.fillRect(0, HERO_Y, VIEW_W, VIEW_H - HERO_Y);
    pipe(ctx, -10, HERO_Y + 12, 650, HERO_Y + 12, 14, ENV.copper, 'rgba(0,0,0,0.5)', 'rgba(255,255,255,0.2)', false);
    rivetLine(ctx, 8, HERO_Y + 40, 632, HERO_Y + 40, 20, 2, ENV.brass);
    gear(ctx, 26, 332, 24, 10, ENV.brass, '#1a1018', 1, f * 0.02, 8);
    gear(ctx, 614, 332, 20, 8, ENV.copper, '#1a1018', 1, -f * 0.025, 7);
    ctx.fillStyle = '#3a2a40'; ctx.fillRect(70, HERO_Y - 2, 500, 3);
    this.heroes.forEach((h, i) => {
      const facing = i < 2 ? 1 : -1;
      drawShadowScreen(ctx, HERO_X[i], HERO_Y, 34 * h.rig.scale, 0.45);
      drawRig(ctx, h.rig, h.anim.pose, { x: HERO_X[i], y: HERO_Y, facing });
    });
    // logo plate with bevelled brass letters
    const bob = Math.round(Math.sin(f * 0.05) * 2);
    rrect(ctx, 150, 30 + bob, 340, 108, 10, 'rgba(20,12,24,0.78)', ENV.brass, 2);
    rivetLine(ctx, 160, 39 + bob, 480, 39 + bob, 9, 2, ENV.brass);
    rivetLine(ctx, 160, 129 + bob, 480, 129 + bob, 9, 2, ENV.brass);
    bevelText(ctx, 'AETHER', 320, 48 + bob, 5, UI.brass, UI.brassLight);
    drawTextOutlined(ctx, '&', 320, 86 + bob, { size: 3, color: UI.copper, outline: '#3a2010', thickness: 1, align: 'center' });
    bevelText(ctx, 'BRASS', 320, 100 + bob, 5, UI.brassLight, '#ffffff');
    pathPoly(ctx, [196, 90 + bob, 296, 90 + bob, 296, 93 + bob, 196, 93 + bob]); paint(ctx, UI.brass, null, 0);
    pathPoly(ctx, [344, 90 + bob, 444, 90 + bob, 444, 93 + bob, 344, 93 + bob]); paint(ctx, UI.brass, null, 0);
    const open = progress.unlockedCount();
    drawText(ctx, `${open} OF ${STAGES.length} BOARDS OPEN`, 320, 146, { size: 1, color: open < STAGES.length ? '#4DF0E0' : UI.brassLight, align: 'center' });
    // menu on a translucent plate
    rrect(ctx, 200, 156, 240, 80, 5, 'rgba(10,6,14,0.55)', 'rgba(200,150,74,0.5)', 1);
    for (let i = 0; i < MENU.length; i++) {
      const sel = i === this.cursor, y = 161 + i * 14;
      let label = MENU[i];
      if (i === I_DIFF) label = `DIFFICULTY  < ${this.difficulty.toUpperCase()} >`;
      if (i === I_MUTE) label = `MUTE  < ${this.game.audio.muted ? 'ON' : 'OFF'} >`;
      if (sel) { gear(ctx, 320 - drawTextWidth(label) / 2 - 12, y + 4, 5, 6, UI.brass, '#3a2010', 1, f * 0.05, 1.5); }
      drawText(ctx, label, 320, y, { size: 1, color: sel ? UI.white : UI.steel, align: 'center' });
    }
    if ((f % 60) < 40) drawTextOutlined(ctx, 'PRESS START', 320, 244, { size: 2, color: '#ffffff', outline: '#3a2010', thickness: 1, align: 'center' });
    // P2 status + compact controls legend on the walkway
    const p2 = this.game.input.joined(1);
    if (p2 && this.p2Flash > 0 && (f % 10) < 6) drawText(ctx, 'P2 JOINED!', 320, 266, { size: 1, color: UI.p2, align: 'center' });
    else if (!p2 && (f % 90) < 60) drawText(ctx, 'P2: PRESS J TO JOIN', 320, 266, { size: 1, color: UI.p2, align: 'center' });
    // Alone, the arcade row leads and the split-keyboard half is only a dimmed footnote; once P2 is in, the
    // two halves are what matter, so they swap places. Matches input.js soloAliases, which are live iff !p2.
    const lead = p2 ? LEGEND_P1 : LEGEND_1P;
    const second = p2 ? LEGEND_P2 : `CO-OP ${LEGEND_P1}`;
    drawText(ctx, lead, 320, 318, { size: 1, color: UI.paper, align: 'center', shadow: false });
    drawText(ctx, second, 320, 330, { size: 1, color: p2 ? UI.paper : UI.brassDark, align: 'center', shadow: false });
    drawText(ctx, 'SPACE JUMPS   RUN: DOUBLE-TAP   ESC PAUSE   M MUTE   GAMEPADS SUPPORTED', 320, 342, { size: 1, color: UI.brass, align: 'center', shadow: false });
    drawText(ctx, '2026 AETHER WORKS', 320, 352, { size: 1, color: UI.brassDark, align: 'center', shadow: false });
  }
}

function drawTextWidth(s) { return s.length * 6 - 1; }
/** Chunky bevelled brass lettering: dark outline, highlight pass offset up-left, base fill on top. */
function bevelText(ctx, text, x, y, size, base, hi) {
  drawTextOutlined(ctx, text, x, y, { size, color: '#6a4014', outline: '#2a1408', thickness: 2, align: 'center' });
  drawText(ctx, text, x - 2, y - 2, { size, color: hi, align: 'center', shadow: false });
  drawText(ctx, text, x - 1, y - 1, { size, color: base, align: 'center', shadow: false });
}
