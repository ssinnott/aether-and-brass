// In-game HUD (GDD 9, ARCHITECTURE 10). Top 40px strip at alpha 0.5: per-player 24x24 rig portrait, name, 120x8 health
// bar (green/yellow/red thresholds, 4f white flash, delayed second bar), 120x5 meter in three segments (full = pulsing
// white rim, red tint when a special would cost HP), lives icons, 7-digit score. Centre: stage timer, GO arrow, targeted
// enemy. Combo counter with grade word / colour climb / scale pop on each side. Elite armor icons, 400x10 boss bar with
// name plate + phase segments, banners / boss name plates, the super cut-in (portrait slam + name banner during the
// 12f freeze) and the per-player CONTINUE countdown while the partner keeps playing.
import { VIEW_W, VIEW_H, FLOOR_TOP, METER, UI, ST } from '../constants.js';
import { drawText, drawTextOutlined, measureText } from '../engine/text.js';
import { buildRig } from '../art/rig.js';
import { rrect, gear, rivetLine, pathPoly, paint } from '../art/shapes.js';
import { drawHeadPortrait, drawLifeIcon, drawArmorIcon, idlePoseOf } from '../art/portraits.js';
import { ease } from '../art/poses.js';
import { clamp } from '../engine/math.js';

const STRIP_H = 40, BAR_W = 120, BAR_H = 8, METER_H = 5, PORTRAIT = 24;
const GHOST_DELAY = 20, GHOST_SPEED = 0.8;
const COMBO_COLORS = ['#c8c8c8', '#ffe45a', '#ff9a30', '#4DF0E0', '#ffffff'];
const BOSS_BAR_W = 400, BOSS_BAR_Y = 349, BOSS_BAR_H = 10;
const CUTIN_LIFE = 50, CONTINUE_FRAMES = 600, TARGET_FRAMES = 90;
const HP_COLORS = ['#59C3A0', '#F2C94C', '#FF5C5C'];

/** Draws the HUD for a World's players. The gameplay screen forwards update()/draw(). */
export class Hud {
  constructor(world, game) {
    this.world = world; this.game = game;
    this.frame = 0;
    this.ghost = [null, null];      // { hp, delay, flash, lastHp } per player (delayed second bar + damage flash)
    this.prig = [null, null];       // portrait rigs per player slot
    this.target = null; this.targetTimer = 0;
    this.banner = null;             // { text, sub, timer, life, plate }
    this.cutIn = null;              // { p, text, sub, timer, life }
    this.superInst = [-1, -1];
    this.cont = [null, null];       // per-player continue countdown while the partner plays
  }
  /** The gameplay screen that owns this HUD (via the stage runner). */
  get screen() { const s = this.world.stage; return s && s.screen ? s.screen : null; }
  playerRig(p, i) {
    let r = this.prig[i];
    if (!r || r.def !== p.def) r = this.prig[i] = { def: p.def, rig: buildRig(p.def.build || {}), pose: idlePoseOf(p.def) };
    return r;
  }
  /** Centre banner (wave text, GO, section names). A super's announce becomes the cut-in; boss names become a plate. */
  showBanner(text, sub = '', life = 90) {
    for (const p of this.world.players) {
      if (p.state === ST.SUPER && p.anim && p.anim.instance !== this.superInst[p.index]) {
        this.superInst[p.index] = p.anim.instance;
        this.cutIn = { p, text, sub, timer: 0, life: CUTIN_LIFE };
        return;
      }
    }
    const b = this.world.boss, st = this.world.stage;
    // the stage runner draws its own riveted plaque behind boss intro names: plain text sits inside it (no nested plates)
    const inPlaque = !!(st && st.plate && st.plate.name === text);
    const plate = !inPlaque && !!(b && b.alive && (text === b.name || text === b.phaseName));
    this.banner = { text, sub, timer: 0, life, plate, inPlaque };
  }

  // ---------- update ----------
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
      if (g.delay > 0) g.delay--; else if (g.hp > p.hp) g.hp = Math.max(p.hp, g.hp - Math.max(GHOST_SPEED, p.dead || p.out ? p.maxHp * 0.03 : 0));
      const t = p.lastTarget;
      if (t && t.alive && !t.dead && t.hpBarTimer > 0 && t.kind !== 'boss') { this.target = t; this.targetTimer = TARGET_FRAMES; }
      this.updateContinue(p, i);
    }
    if (this.targetTimer > 0) this.targetTimer--; else this.target = null;
    if (this.banner && ++this.banner.timer >= this.banner.life) this.banner = null;
    if (this.cutIn && ++this.cutIn.timer >= this.cutIn.life) this.cutIn = null;
  }
  /** GDD 9: a player at 0 lives counts down CONTINUE? on their side while the partner keeps playing. */
  updateContinue(p, i) {
    const ps = this.world.players, scr = this.screen;
    const partnerAlive = ps.some((q) => q && q !== p && !q.out);
    if (!p.out || !partnerAlive || !scr) { this.cont[i] = null; return; }
    let c = this.cont[i];
    if (!c) c = this.cont[i] = { timer: CONTINUE_FRAMES, lastDigit: 10, crack: 0, expired: scr.continues <= 0 };
    if (c.crack > 0) c.crack--;
    if (c.expired) return;
    c.timer--;
    const d = Math.max(0, Math.ceil(c.timer / 60));
    if (d !== c.lastDigit) { c.lastDigit = d; c.crack = 8; this.game.audio.play('continue_tick'); }
    const inp = this.game.input;
    // no joined() gate: a slot that exists in the world is a player (skipTo=gameplay&chars=a,b never calls setJoined)
    const go = inp.pressed(p.index, 'attack') || inp.pressed(p.index, 'jump') || inp.pressed(p.index, 'special');
    if (go && scr.continues > 0) { this.revive(p); this.cont[i] = null; return; }
    if (c.timer <= 0) { c.expired = true; this.game.audio.play('game_over'); }
  }
  /** Spend a continue on one player (fresh lives, full HP, drops in from the top with i-frames). */
  revive(p) {
    const scr = this.screen, w = this.world;
    scr.continues--; scr.continuesUsed++; p.continuesUsed++;
    p.out = false; p.lives = 4; // respawn() takes one -> 3
    p.respawn(w);
    w._refreshLists();
    this.game.audio.play('menu_confirm');
    this.showBanner('CONTINUE!', `${scr.continues} LEFT`, 90);
  }

  // ---------- draw ----------
  draw(ctx) {
    const w = this.world, ps = w.players;
    ctx.fillStyle = 'rgba(10,6,12,0.5)'; ctx.fillRect(0, 0, VIEW_W, STRIP_H);
    ctx.fillStyle = 'rgba(226,179,74,0.5)'; ctx.fillRect(0, STRIP_H - 1, VIEW_W, 1);
    for (let i = 0; i < ps.length; i++) this.drawPlayer(ctx, ps[i], i);
    if (ps.length < 2 && !this.game.input.joined(1) && (this.frame % 90) < 60) drawText(ctx, 'P2: PRESS J TO JOIN', VIEW_W - 8, 16, { size: 1, color: UI.p2, align: 'right' });
    this.drawCenter(ctx);
    this.drawEnemyArmor(ctx);
    if (w.boss && w.boss.alive) this.drawBoss(ctx, w.boss);
    for (let i = 0; i < ps.length; i++) this.drawCombo(ctx, ps[i], i);
    for (let i = 0; i < ps.length; i++) if (this.cont[i]) this.drawContinue(ctx, ps[i], i, this.cont[i]);
    if (this.cutIn) this.drawCutIn(ctx, this.cutIn);
    else if (this.banner) this.drawBanner(ctx, this.banner);
  }
  drawPlayer(ctx, p, i) {
    const right = i === 1;
    const x0 = right ? VIEW_W - 8 - PORTRAIT : 8;
    const bx = right ? VIEW_W - 12 - PORTRAIT - BAR_W : x0 + PORTRAIT + 4;
    const col = right ? UI.p2 : UI.p1, pr = this.playerRig(p, i);
    // portrait (24x24 rig head in a brass frame)
    rrect(ctx, x0 - 1, 5, PORTRAIT + 2, PORTRAIT + 2, 3, '#1a1420', UI.brass, 1);
    drawHeadPortrait(ctx, pr.rig, pr.pose, x0, 6, PORTRAIT, { facing: right ? -1 : 1, bg: '#241a2e', flash: p.flashTimer > 0 && !p.dead });
    if (p.out || p.dead) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0, 6, PORTRAIT, PORTRAIT); }
    if (p.out) drawText(ctx, 'OUT', x0 + PORTRAIT / 2, 14, { size: 1, color: UI.red, align: 'center' });
    // name
    drawText(ctx, p.def.name || p.name, right ? bx + BAR_W : bx, 3, { size: 1, color: col, align: right ? 'right' : 'left' });
    // health bar: dark trough, delayed second bar, current fill with colour thresholds + white damage flash
    const g = this.ghost[i], frac = clamp(p.hp / p.maxHp, 0, 1), ghostFrac = g ? clamp(Math.max(frac, g.hp / p.maxHp), 0, 1) : frac;
    const fillX = (wd) => (right ? bx + BAR_W - wd : bx);
    ctx.fillStyle = '#120c14'; ctx.fillRect(bx - 1, 13, BAR_W + 2, BAR_H + 2);
    ctx.fillStyle = '#2a1416'; ctx.fillRect(bx, 14, BAR_W, BAR_H);
    const gw = Math.round(BAR_W * ghostFrac); ctx.fillStyle = '#a03a2a'; ctx.fillRect(fillX(gw), 14, gw, BAR_H);
    const hw = Math.round(BAR_W * frac);
    ctx.fillStyle = g && g.flash > 0 ? '#ffffff' : HP_COLORS[frac > 0.5 ? 0 : frac > 0.25 ? 1 : 2];
    ctx.fillRect(fillX(hw), 14, hw, BAR_H);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(fillX(hw), 14, hw, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let s = 1; s < 10; s++) ctx.fillRect(bx + s * 12, 14, 1, BAR_H);
    // meter: three 100-point segments
    const segW = Math.floor((BAR_W - 4) / 3), full = p.meter >= METER.max;
    const costsHp = p.meter < METER.special && p.hp > p.maxHp * METER.hpCostMinFrac, pulse = (this.frame % 20) < 10;
    for (let s = 0; s < 3; s++) {
      const seg = right ? 2 - s : s, sx = bx + s * (segW + 2), fill = clamp((p.meter - seg * METER.bar) / METER.bar, 0, 1);
      ctx.fillStyle = '#120c14'; ctx.fillRect(sx - 1, 24, segW + 2, METER_H + 2);
      ctx.fillStyle = costsHp ? '#5a1a1e' : '#14242c'; ctx.fillRect(sx, 25, segW, METER_H);
      const fw = Math.round(segW * fill);
      ctx.fillStyle = full ? (pulse ? '#ffffff' : '#9af4ec') : '#4DF0E0'; ctx.fillRect(right ? sx + segW - fw : sx, 25, fw, METER_H);
      if (fw > 2) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(right ? sx + segW - fw : sx, 25, fw, 1); }
    }
    if (full) { ctx.strokeStyle = pulse ? '#ffffff' : '#9af4ec'; ctx.lineWidth = 1; ctx.strokeRect(bx - 1.5, 23.5, BAR_W + 1, METER_H + 3); }
    else if (costsHp && (this.frame % 30) < 20) drawText(ctx, 'HP', right ? bx - 4 : bx + BAR_W + 4, 24, { size: 1, color: UI.red, align: right ? 'right' : 'left' });
    // lives icons + 7-digit score
    const n = Math.min(p.lives, 5);
    for (let l = 0; l < n; l++) drawLifeIcon(ctx, p.def.id, right ? bx + BAR_W - 10 - l * 12 : bx + l * 12, 32);
    if (p.lives > 5) drawText(ctx, '+' + (p.lives - 5), right ? bx + BAR_W - n * 12 - 2 : bx + n * 12 + 2, 33, { size: 1, color: UI.paper, align: right ? 'right' : 'left' });
    drawText(ctx, String(Math.min(9999999, p.score)).padStart(7, '0'), right ? bx : bx + BAR_W, 32, { size: 1, color: UI.paper, align: right ? 'left' : 'right' });
  }
  /** Stage timer, GO arrow and the targeted enemy's bar. */
  drawCenter(ctx) {
    const scr = this.screen, st = this.world.stage, cx = VIEW_W / 2;
    const frames = scr ? scr.time || 0 : 0, s = Math.floor(frames / 60);
    drawText(ctx, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, cx, 3, { size: 2, color: UI.paper, align: 'center' });
    if (st && st.goTimer > 0 && !this.world.camera.locked) {
      if ((st.goTimer % 30) < 20) {
        drawTextOutlined(ctx, 'GO', cx - 6, 21, { size: 2, color: UI.brass, outline: '#3a2010', thickness: 1, align: 'center' });
        pathPoly(ctx, [cx + 10, 22, cx + 22, 28, cx + 10, 34]); paint(ctx, UI.brass, '#3a2010', 1);
      }
      return;
    }
    const t = this.target;
    if (t && t.alive && !t.dead && !t.removeMe) {
      const w = 100, x = Math.round(cx - w / 2);
      drawText(ctx, t.name, cx, 20, { size: 1, color: UI.paper, align: 'center' });
      ctx.fillStyle = '#120c14'; ctx.fillRect(x - 1, 30, w + 2, 6);
      ctx.fillStyle = '#5a1a1a'; ctx.fillRect(x, 31, w, 4);
      ctx.fillStyle = t.hp / t.maxHp > 0.3 ? UI.hp : UI.hpLow; ctx.fillRect(x, 31, Math.round(w * clamp(t.hp / t.maxHp, 0, 1)), 4);
    }
  }
  /** Armor icon beside the 60x4 elite bars drawn by the fighters themselves. */
  drawEnemyArmor(ctx) {
    const cam = this.world.camera;
    for (const e of this.world.enemies) {
      if (e.kind === 'boss' || !e.def.elite || e.hpBarTimer <= 0 || e.dead || !e.armor) continue;
      const sx = cam.toScreenX(e.x), top = Math.round(FLOOR_TOP + e.z - e.y + cam.shakeY - e.h - 10);
      drawArmorIcon(ctx, sx - 30 - 12, top - 3);
    }
  }
  /** 400x10 boss bar in rows 342..358 with a brass name plate and phase segments. */
  drawBoss(ctx, b) {
    const x = Math.round(VIEW_W / 2 - BOSS_BAR_W / 2), y = BOSS_BAR_Y;
    const hp = b.hpTotal != null ? b.hpTotal : b.hp, max = b.hpTotalMax || b.maxHp || 1;
    ctx.fillStyle = 'rgba(10,6,12,0.72)'; ctx.fillRect(0, 340, VIEW_W, VIEW_H - 340);
    // name plate
    const nw = measureText(b.name) + 10;
    rrect(ctx, x - 2, 339, nw, 10, 2, UI.brass, '#3a2010', 1);
    drawText(ctx, b.name, x + 3, 340, { size: 1, color: '#2a1408', shadow: false });
    if (b.phaseName && b.phaseName !== b.name) drawText(ctx, b.phaseName, x + BOSS_BAR_W, 340, { size: 1, color: b.phaseColor || UI.paper, align: 'right' });
    // bar
    ctx.fillStyle = '#120c14'; ctx.fillRect(x - 1, y, BOSS_BAR_W + 2, BOSS_BAR_H);
    ctx.fillStyle = '#3a1416'; ctx.fillRect(x, y + 1, BOSS_BAR_W, BOSS_BAR_H - 2);
    const fw = Math.round(BOSS_BAR_W * clamp(hp / max, 0, 1));
    ctx.fillStyle = b.phaseColor || UI.hp; ctx.fillRect(x, y + 1, fw, BOSS_BAR_H - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y + 1, fw, 2);
    ctx.fillStyle = '#120c14';
    if (b.phaseHps) { let acc = 0; for (let i = b.phaseHps.length - 1; i > 0; i--) { acc += b.phaseHps[i]; ctx.fillRect(x + Math.round(BOSS_BAR_W * acc / max) - 1, y, 2, BOSS_BAR_H); } }
    else if (b.phases > 1) for (let i = 1; i < b.phases; i++) ctx.fillRect(x + Math.round(BOSS_BAR_W * i / b.phases) - 1, y, 2, BOSS_BAR_H);
    rrect(ctx, x - 1.5, y - 0.5, BOSS_BAR_W + 3, BOSS_BAR_H + 1, 1, null, UI.brassDark, 0.5);
  }
  /** Combo counter on the player's side (GDD 9): number pops 1.3 -> 1.0, colour climbs grey/yellow/orange/cyan/white. */
  drawCombo(ctx, p, i) {
    const x = i === 0 ? 46 : VIEW_W - 46, y = 50;
    if (p.combo >= 3) {
      const tier = p.combo >= 60 ? 4 : p.combo >= 35 ? 3 : p.combo >= 20 ? 2 : p.combo >= 10 ? 1 : 0, col = COMBO_COLORS[tier];
      const sc = clamp(p.comboScale || 1, 1, 1.3);
      ctx.save(); ctx.translate(x, y + 10); ctx.scale(sc, sc);
      drawTextOutlined(ctx, String(p.combo), 0, -10, { size: 3, color: col, outline: '#2a1410', thickness: 1, align: 'center' });
      ctx.restore();
      drawText(ctx, 'HITS', x, y + 24, { size: 1, color: col, align: 'center' });
      const w = comboWord(p.combo);
      if (w) drawTextOutlined(ctx, w, x, y + 35, { size: 1, color: col, outline: '#2a1410', thickness: 1, align: 'center' });
    } else if (p.gradeTimer > 0 && p.grade) {
      const a = Math.min(1, p.gradeTimer / 30);
      ctx.globalAlpha = a; // anchored to the screen edge: 'AETHERIC!' at size 2 is wider than the counter column
      drawTextOutlined(ctx, p.grade.word + '!', i === 0 ? 12 : VIEW_W - 12, y, { size: 2, color: p.grade.color, outline: '#2a1410', thickness: 1, align: i === 0 ? 'left' : 'right' });
      ctx.globalAlpha = 1;
    }
  }
  /** Per-player CONTINUE? countdown with a cracking gear digit (partner still fighting). */
  drawContinue(ctx, p, i, c) {
    const x = i === 0 ? 100 : VIEW_W - 100, y = 60, scr = this.screen;
    const d = Math.max(0, Math.ceil(c.timer / 60)), shake = c.crack > 0 ? (c.crack % 2 ? 2 : -2) : 0;
    rrect(ctx, x - 70, y - 4, 140, 92, 6, 'rgba(10,6,14,0.7)', UI.brassDark, 1);
    if (c.expired) {
      drawTextOutlined(ctx, scr && scr.continues > 0 ? 'OUT' : 'NO CONTINUES', x, y + 30, { size: 2, color: UI.red, outline: '#2a1010', thickness: 1, align: 'center' });
      drawText(ctx, 'THE ENGINE CLAIMS ' + (p.def.name || 'A HERO'), x, y + 56, { size: 1, color: UI.steel, align: 'center' });
      return;
    }
    drawTextOutlined(ctx, 'CONTINUE?', x, y, { size: 2, color: UI.brass, outline: '#3a2010', thickness: 1, align: 'center' });
    drawCrackGear(ctx, x + shake, y + 42, 20, c.crack, this.frame);
    drawTextOutlined(ctx, String(d), x + shake, y + 32, { size: 3, color: c.crack > 0 ? '#ffffff' : UI.paper, outline: '#2a1410', thickness: 1, align: 'center' });
    if ((this.frame % 40) < 28) drawText(ctx, `ATTACK: CONTINUE (${scr ? scr.continues : 0})`, x, y + 72, { size: 1, color: UI.paper, align: 'center' });
  }
  /** Wave / section banners, or a brass name plate for bosses and phases. */
  drawBanner(ctx, b) {
    const t = b.timer / b.life, a = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1;
    ctx.globalAlpha = a;
    if (b.plate) {
      const k = ease('overshoot', Math.min(1, b.timer / 14)), w = Math.max(220, measureText(b.text, 2) + 40), h = b.sub ? 44 : 30;
      const x = Math.round(VIEW_W / 2 - w / 2 + (1 - k) * -VIEW_W), y = 96;
      rrect(ctx, x, y, w, h, 4, 'rgba(24,14,10,0.92)', UI.brass, 2);
      rivetLine(ctx, x + 8, y + 5, x + w - 8, y + 5, Math.floor(w / 24), 1.5, UI.brass);
      rivetLine(ctx, x + 8, y + h - 5, x + w - 8, y + h - 5, Math.floor(w / 24), 1.5, UI.brass);
      drawTextOutlined(ctx, b.text, x + w / 2, y + 9, { size: 2, color: UI.brassLight, outline: '#3a2010', thickness: 1, align: 'center' });
      if (b.sub) drawText(ctx, b.sub, x + w / 2, y + 28, { size: 1, color: UI.paper, align: 'center' });
    } else {
      const y = b.inPlaque ? 114 : 120, subY = b.inPlaque ? 140 : 152;
      drawTextOutlined(ctx, b.text, VIEW_W / 2, y, { size: 3, color: b.inPlaque ? UI.brassLight : UI.brass, outline: '#2a1410', thickness: 1, align: 'center' });
      if (b.sub) drawText(ctx, b.sub, VIEW_W / 2, subY, { size: 1, color: UI.paper, align: 'center' });
    }
    ctx.globalAlpha = 1;
  }
  /** Super cut-in: dark band, 64px portrait slamming in from the player's side, move name + hero name banner. */
  drawCutIn(ctx, c) {
    const p = c.p, i = p.index || 0, t = c.timer, life = c.life, left = i === 0;
    const a = t > life - 12 ? (life - t) / 12 : 1, pr = this.playerRig(p, i);
    const y0 = 92, h = 84;
    ctx.globalAlpha = a;
    pathPoly(ctx, [0, y0 + 8, VIEW_W, y0, VIEW_W, y0 + h, 0, y0 + h + 8]); paint(ctx, 'rgba(10,6,14,0.84)', null, 0);
    ctx.fillStyle = UI.brass; ctx.fillRect(0, y0 + 7, VIEW_W, 1); ctx.fillRect(0, y0 + h + 7, VIEW_W, 1);
    ctx.fillStyle = 'rgba(77,240,224,0.35)'; ctx.fillRect(0, y0 + 9, VIEW_W, 1);
    // portrait slam (overshoot over 8f)
    const k = ease('overshoot', Math.min(1, t / 8)), size = 64;
    const target = left ? 48 : VIEW_W - 48 - size, start = left ? -size - 20 : VIEW_W + 20;
    const px = Math.round(start + (target - start) * k), py = y0 + 10;
    rrect(ctx, px - 3, py - 3, size + 6, size + 6, 4, '#1a1420', UI.brass, 2);
    drawHeadPortrait(ctx, pr.rig, pr.pose, px, py, size, { facing: left ? 1 : -1, bg: '#2a1c3a', fill: 0.62, cy: 0.5 });
    if (t < 6) { ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - t / 6)})`; ctx.fillRect(px, py, size, size); }
    // name banner slides from the opposite side
    const k2 = ease('out', clamp((t - 4) / 10, 0, 1));
    const tx = left ? px + size + 22 : px - 22, align = left ? 'left' : 'right';
    const slide = Math.round((1 - k2) * (left ? 120 : -120));
    drawTextOutlined(ctx, c.text, tx + slide, y0 + 24, { size: 3, color: UI.brassLight, outline: '#3a2010', thickness: 2, align });
    drawText(ctx, c.sub, tx + slide, y0 + 52, { size: 1, color: left ? UI.p1 : UI.p2, align });
    ctx.globalAlpha = 1;
  }
}

function comboWord(n) { return n >= 60 ? 'AETHERIC' : n >= 35 ? 'STEAMED' : n >= 20 ? 'BRASSY' : n >= 10 ? 'SPARKY' : n >= 3 ? 'SOOTY' : ''; }

/** A brass gear that shows crack lines while `crack` > 0 (countdown digits crack like a gear each second). */
export function drawCrackGear(ctx, cx, cy, r, crack, frame) {
  gear(ctx, cx, cy, r, 10, crack > 0 ? '#f4e8c8' : '#5a3a1c', UI.brass, 1.5, frame * 0.01, r * 0.3, '#1a1018');
  if (crack > 0) {
    ctx.strokeStyle = '#1a1018'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(cx - r * 0.7, cy - r * 0.5); ctx.lineTo(cx - r * 0.2, cy - r * 0.1); ctx.lineTo(cx - r * 0.5, cy + r * 0.5);
    ctx.moveTo(cx + r * 0.6, cy - r * 0.6); ctx.lineTo(cx + r * 0.25, cy + r * 0.05); ctx.lineTo(cx + r * 0.7, cy + r * 0.45);
    ctx.stroke();
  }
}
