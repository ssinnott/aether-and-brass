// In-game HUD (ARCHITECTURE.md section 10, GDD section 9): per-player portrait/name/health/meter/lives/score,
// targeted enemy bar, boss bar, combo counter with grades.
import { VIEW_W, VIEW_H, FLOOR_TOP, METER, UI } from '../constants.js';
import { drawText, drawTextOutlined } from '../engine/text.js';
import { drawRig } from '../art/rig.js';
import { rrect } from '../art/shapes.js';

const STRIP_H = 40, BAR_W = 120, BAR_H = 8, METER_H = 5, PORTRAIT = 24;
const GHOST_DELAY = 20, GHOST_SPEED = 0.6;
const COMBO_COLORS = ['#c8c8c8', '#ffe45a', '#ff9a30', '#4DF0E0', '#ffffff'];
const BOSS_BAR_W = 400, BOSS_BAR_Y = 346;

/** Draws the HUD for a World's players. */
export class Hud {
  constructor(world, game) {
    this.world = world; this.game = game;
    this.frame = 0;
    this.ghost = [null, null];      // { hp, delay, flash } per player
    this.target = null; this.targetTimer = 0;
    this.banner = null;             // { text, sub, timer, life }
  }
  /** Show a centre banner (wave text, GO arrow, etc). */
  showBanner(text, sub = '', life = 90) { this.banner = { text, sub, timer: 0, life }; }
  update() {
    this.frame++;
    const ps = this.world.players;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      let g = this.ghost[i];
      if (!g) g = this.ghost[i] = { hp: p.hp, delay: 0, flash: 0, lastHp: p.hp };
      if (p.hp < g.lastHp) { g.flash = 4; g.delay = GHOST_DELAY; }
      if (p.hp > g.hp) g.hp = p.hp;
      g.lastHp = p.hp;
      if (g.flash > 0) g.flash--;
      if (g.delay > 0) g.delay--; else if (g.hp > p.hp) g.hp = Math.max(p.hp, g.hp - GHOST_SPEED);
      if (p.lastTarget && p.lastTarget.alive && !p.lastTarget.dead && p.lastTarget.hpBarTimer > 0) { this.target = p.lastTarget; this.targetTimer = 120; }
    }
    if (this.targetTimer > 0) this.targetTimer--; else this.target = null;
    if (this.banner && ++this.banner.timer >= this.banner.life) this.banner = null;
  }
  draw(ctx) {
    const w = this.world, ps = w.players;
    ctx.fillStyle = 'rgba(10,6,12,0.5)'; ctx.fillRect(0, 0, VIEW_W, STRIP_H);
    ctx.fillStyle = UI.brassDark; ctx.fillRect(0, STRIP_H - 1, VIEW_W, 1);
    for (let i = 0; i < ps.length; i++) this.drawPlayer(ctx, ps[i], i);
    if (ps.length < 2 && !this.game.input.joined(1) && (this.frame % 90) < 60) drawText(ctx, 'P2 PRESS J TO JOIN', VIEW_W - 8, 6, { size: 1, color: UI.p2, align: 'right' });
    if (this.target && this.target.alive && !this.target.dead) this.drawTarget(ctx, this.target);
    if (w.boss && w.boss.alive) this.drawBoss(ctx, w.boss);
    for (let i = 0; i < ps.length; i++) this.drawCombo(ctx, ps[i], i);
    if (this.banner) this.drawBanner(ctx, this.banner);
  }
  drawPlayer(ctx, p, i) {
    const right = i === 1;
    const x0 = right ? VIEW_W - 8 - (PORTRAIT + 4 + BAR_W) : 8;
    const bx = x0 + PORTRAIT + 4, col = right ? UI.p2 : UI.p1;
    // portrait
    rrect(ctx, x0, 6, PORTRAIT, PORTRAIT, 3, '#1a1420', col, 1);
    ctx.save(); ctx.beginPath(); ctx.rect(x0 + 1, 7, PORTRAIT - 2, PORTRAIT - 2); ctx.clip();
    if (p.def.portrait) p.def.portrait(ctx, x0, 6, PORTRAIT);
    else drawBust(ctx, p, x0, 6, PORTRAIT);
    ctx.restore();
    if (p.out) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0, 6, PORTRAIT, PORTRAIT); }
    drawText(ctx, p.def.name || p.name, bx, 4, { size: 1, color: col });
    // health bar (segmented), ghost, flash
    const g = this.ghost[i], frac = Math.max(0, p.hp / p.maxHp), ghostFrac = g ? Math.max(frac, g.hp / p.maxHp) : frac;
    ctx.fillStyle = '#120c14'; ctx.fillRect(bx - 1, 13, BAR_W + 2, BAR_H + 2);
    ctx.fillStyle = '#3a1a1a'; ctx.fillRect(bx, 14, BAR_W, BAR_H);
    ctx.fillStyle = '#8a3a2a'; ctx.fillRect(bx, 14, Math.round(BAR_W * ghostFrac), BAR_H);
    ctx.fillStyle = g && g.flash > 0 ? '#ffffff' : frac > 0.5 ? '#59C3A0' : frac > 0.25 ? '#F2C94C' : '#FF5C5C';
    ctx.fillRect(bx, 14, Math.round(BAR_W * frac), BAR_H);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let s = 1; s < 10; s++) ctx.fillRect(bx + s * 12, 14, 1, BAR_H);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(bx, 14, Math.round(BAR_W * frac), 2);
    // meter: three segments
    const segW = Math.floor((BAR_W - 4) / 3), full = p.meter >= METER.max, costsHp = p.meter < METER.special;
    for (let s = 0; s < 3; s++) {
      const sx = bx + s * (segW + 2), fill = Math.max(0, Math.min(1, (p.meter - s * METER.bar) / METER.bar));
      ctx.fillStyle = '#120c14'; ctx.fillRect(sx - 1, 24, segW + 2, METER_H + 2);
      ctx.fillStyle = costsHp ? '#3a1414' : '#14242c'; ctx.fillRect(sx, 25, segW, METER_H);
      ctx.fillStyle = full ? ((this.frame % 20) < 10 ? '#ffffff' : UI.meterFull) : '#4DF0E0'; ctx.fillRect(sx, 25, Math.round(segW * fill), METER_H);
    }
    if (full) { ctx.strokeStyle = (this.frame % 20) < 10 ? '#ffffff' : UI.meterFull; ctx.lineWidth = 1; ctx.strokeRect(bx - 1.5, 23.5, BAR_W + 1, METER_H + 3); }
    // lives + score
    for (let l = 0; l < Math.min(p.lives, 6); l++) rrect(ctx, bx + l * 8, 33, 6, 5, 1, p.def.build && p.def.build.palette ? (p.def.build.palette.accent || UI.brass) : UI.brass, '#120c14', 0.5);
    drawText(ctx, String(p.score).padStart(7, '0'), bx + BAR_W, 32, { size: 1, color: UI.paper, align: 'right' });
  }
  drawTarget(ctx, t) {
    const w = 100, x = Math.round(VIEW_W / 2 - w / 2), y = 8;
    drawText(ctx, t.name, VIEW_W / 2, y, { size: 1, color: UI.paper, align: 'center' });
    ctx.fillStyle = '#120c14'; ctx.fillRect(x - 1, y + 10, w + 2, 6);
    ctx.fillStyle = '#5a1a1a'; ctx.fillRect(x, y + 11, w, 4);
    ctx.fillStyle = UI.hp; ctx.fillRect(x, y + 11, Math.round(w * Math.max(0, t.hp / t.maxHp)), 4);
  }
  drawBoss(ctx, b) {
    const x = Math.round(VIEW_W / 2 - BOSS_BAR_W / 2), y = BOSS_BAR_Y;
    ctx.fillStyle = 'rgba(10,6,12,0.7)'; ctx.fillRect(0, y - 6, VIEW_W, VIEW_H - y + 6);
    drawText(ctx, b.name, x, y - 3, { size: 1, color: UI.brass });
    ctx.fillStyle = '#120c14'; ctx.fillRect(x - 1, y + 5, BOSS_BAR_W + 2, 10);
    ctx.fillStyle = '#4a1a1a'; ctx.fillRect(x, y + 6, BOSS_BAR_W, 8);
    ctx.fillStyle = b.phaseColor || UI.hp; ctx.fillRect(x, y + 6, Math.round(BOSS_BAR_W * Math.max(0, b.hp / b.maxHp)), 8);
    if (b.phases) for (let i = 1; i < b.phases; i++) { ctx.fillStyle = '#120c14'; ctx.fillRect(x + Math.round(BOSS_BAR_W * i / b.phases), y + 6, 2, 8); }
  }
  drawCombo(ctx, p, i) {
    const cam = this.world.camera;
    if (p.combo >= 2) {
      const sx = cam.toScreenX(p.x) + (i === 0 ? -50 : 50), sy = Math.round(FLOOR_TOP + p.z - p.y - p.h - 26 + cam.shakeY);
      const tier = p.combo >= 60 ? 4 : p.combo >= 35 ? 3 : p.combo >= 20 ? 2 : p.combo >= 10 ? 1 : 0;
      const size = Math.max(2, Math.round(2 * p.comboScale + 0.3));
      drawTextOutlined(ctx, String(p.combo), sx, sy, { size, color: COMBO_COLORS[tier], outline: '#2a1410', thickness: 1, align: 'center' });
      drawText(ctx, 'HITS', sx, sy + size * 9, { size: 1, color: COMBO_COLORS[tier], align: 'center' });
      const g = comboWord(p.combo); if (g) drawText(ctx, g, sx, sy + size * 9 + 10, { size: 1, color: COMBO_COLORS[tier], align: 'center' });
    } else if (p.gradeTimer > 0 && p.grade) {
      const sx = i === 0 ? 120 : VIEW_W - 120, sy = 52, a = Math.min(1, p.gradeTimer / 30);
      ctx.globalAlpha = a;
      drawTextOutlined(ctx, p.grade.word + '!', sx, sy, { size: 2, color: p.grade.color, outline: '#2a1410', thickness: 1, align: 'center' });
      ctx.globalAlpha = 1;
    }
  }
  drawBanner(ctx, b) {
    const t = b.timer / b.life, a = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1;
    ctx.globalAlpha = a;
    drawTextOutlined(ctx, b.text, VIEW_W / 2, 120, { size: 3, color: UI.brass, outline: '#2a1410', thickness: 1, align: 'center' });
    if (b.sub) drawText(ctx, b.sub, VIEW_W / 2, 152, { size: 1, color: UI.paper, align: 'center' });
    ctx.globalAlpha = 1;
  }
}

function comboWord(n) { return n >= 60 ? 'AETHERIC' : n >= 35 ? 'STEAMED' : n >= 20 ? 'BRASSY' : n >= 10 ? 'SPARKY' : n >= 3 ? 'SOOTY' : ''; }

/** Fallback portrait: the rig's head, clipped into a box, drawn from its idle pose. */
export function drawBust(ctx, f, x, y, size) {
  const rig = f.rig, pose = (f.def.anims && f.def.anims.idle && f.def.anims.idle.frames[0].pose) || null;
  const sc = 0.5;
  const headFromFeet = (rig.height - rig.p.headR) * rig.scale * sc;
  drawRig(ctx, rig, pose, { x: x + size / 2 - 1, y: y + size / 2 + headFromFeet, facing: 1, scale: sc });
}
