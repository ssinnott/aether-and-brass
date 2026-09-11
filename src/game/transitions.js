// Stage transitions & cutscenes (GDD section 6): the dock gate + freight-lift ride (180f, one Meat Pie; `up: true` rides the
// shaft upward), the cargo gate + boarding the Aether Funicular, the docking ('dock': the vehicle comes about and the party
// arrives on a `look` — board 1's summit stair with 2 Meat Pies by default, or a ship's companion ladder, a counting-house
// double door, a hemp hoist platform, or nothing — with `pies` Meat Pies waiting), Vane's 2s spiral-stair descent,
// boss intro spotlight / name plates and the defeat spectacle (valves blowing open, dawn). Owned by game/stage.js.
import { VIEW_W, VIEW_H, FLOOR_TOP, Z_MAX, ST, UI } from '../constants.js';
import { Entity } from './entity.js';
import { Pickup } from './items.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { drawText, drawTextOutlined } from '../engine/text.js';
import { rrect, rivetLine, pathPoly, paint, circle } from '../art/shapes.js';
import { buildRig, drawRig } from '../art/rig.js';
import { tones } from '../art/props.js';
import { boss as vaneDef } from '../content/enemies/index.js';

const OL = '#2B2B30', BRASS = '#C9963A', IRON = '#3A3F4B', WOOD = '#6A4A2A', HEMP = '#9C893F', PLANK = '#8A6A3A';
const FADE = 30;
/** Frames a dock `look` takes to settle after the switch (the door swings open, the hoist pulley spins down). */
const LOOK_SETTLE = 40;
/** Dock arrivals by `spec.look`; 'stairs' is board 1's summit landing and the default. */
const DOCK_LOOKS = { stairs: drawStairs, ladder: drawLadder, door: drawDoor, hoist: drawHoist };
const PHASES = {
  lift: [['gate', 50], ['ride', 180], ['fadeOut', FADE], ['switch', 1], ['fadeIn', FADE]],
  board: [['gate', 50], ['fadeOut', FADE], ['switch', 1], ['fadeIn', FADE]],
  dock: [['dock', 40], ['fadeOut', FADE], ['switch', 1], ['fadeIn', FADE]],
  descent: [['descend', 120]],
};

/** A z-sortable draw callback (stage art behind or in front of the fighters). */
export class SceneLayer extends Entity {
  constructor(z, drawFn, x = 0) { super('fx'); this.z = z; this.x = x; this.shadowW = 0; this.drawFn = drawFn; this.t = 0; this.alpha = 1; }
  hurtbox() { return null; }
  update() { this.t++; }
  draw(ctx, cam) { this.drawFn(ctx, cam, this); }
}

/** Iron gate leaf / slat block used by both gates. */
function ironPanel(ctx, x, y, w, h) {
  const t = tones(IRON);
  rrect(ctx, x, y, w, h, 2, t.base, OL, 1);
  ctx.fillStyle = t.sh; ctx.fillRect(x + 2, y + h - Math.round(h * 0.3), w - 4, Math.round(h * 0.3) - 2);
  ctx.fillStyle = t.hi; ctx.fillRect(x + 2, y + 2, w - 4, 1);
  ctx.fillStyle = tones(BRASS).hi; for (let yy = y + 8; yy < y + h - 6; yy += 24) { ctx.fillRect(x + 4, yy, 2, 2); ctx.fillRect(x + w - 6, yy, 2, 2); }
}

/** One scripted transition; the StageRunner holds the players and forwards update()/draw() while it runs. */
export class Transition {
  /**
   * @param {import('./stage.js').StageRunner} runner
   * @param {'lift'|'board'|'dock'|'descent'} kind
   * @param {{ gateX?: number, nextSection?: number, boss?: object, stairX?: number, banner?: string, look?: 'stairs'|'ladder'|'door'|'hoist'|'none', pies?: number, up?: boolean }} spec
   *   dock: look (default 'stairs') + pies (default 2; 0 allowed); the runner shows `banner`. lift: up = the shaft scrolls the other way (the party rises).
   */
  constructor(runner, kind, spec = {}) {
    this.runner = runner; this.kind = kind; this.spec = spec;
    this.phases = PHASES[kind] || [['fadeOut', FADE], ['switch', 1], ['fadeIn', FADE]];
    this.index = 0; this.t = 0; this.frame = 0; this.done = false;
    this.fade = 0; this.layers = [];
    this.world = runner.world;
    this.gateX = spec.gateX != null ? spec.gateX : runner.section.x1;
    this.begin();
  }
  get phase() { return this.phases[this.index][0]; }
  get dur() { return this.phases[this.index][1]; }
  get k() { return Math.min(1, this.t / this.dur); }
  addLayer(z, fn, x = 0) { const l = new SceneLayer(z, fn, x); this.world.add(l); this.layers.push(l); return l; }
  dropLayers() { for (const l of this.layers) l.removeMe = true; this.layers.length = 0; }

  begin() {
    const w = this.world, cam = w.camera;
    if (this.kind === 'lift' || this.kind === 'board' || this.kind === 'dock') {
      if (!cam.locked) { const x0 = Math.max(0, Math.min(Math.round(cam.x), w.stageLength - VIEW_W)); cam.lock(x0, x0 + VIEW_W); }
      audio.play('hydraulic');
    }
    if (this.kind === 'lift') {
      // freight-lift shaft walls scroll up behind the fighters (fade in during the ride); one Meat Pie rides along
      const up = !!this.spec.up;
      this.addLayer(-5, (ctx, c, l) => drawShaft(ctx, c, l, up), cam.x).alpha = 0; // fades in once the lift starts moving
      const px = w.players.reduce((a, p) => a + (p ? p.x : 0), 0) / Math.max(1, w.players.length);
      w.add(new Pickup('meatPie', Math.min(this.gateX - 40, px + 60), 100, { pop: true }));
    }
    if (this.kind === 'dock') { cam.shake(10, 40); audio.play('land_heavy'); }
    if (this.kind === 'descent') {
      this.vaneRig = buildRig(vaneDef.phases[2].build);
      const idle = vaneDef.phases[2].anims.idle; this.vanePose = idle && idle.frames[0].pose;
      audio.play('chime');
    }
  }
  /** Advance one frame; returns true when the transition finished. */
  update() {
    if (this.done) return true;
    this.frame++; this.t++;
    const ph = this.phase;
    if (ph === 'fadeOut') this.fade = this.k;
    else if (ph === 'fadeIn') this.fade = 1 - this.k;
    else if (ph === 'ride') this.ride();
    else if (ph === 'dock') { if (this.t % 6 === 0) particles.burst('steam', this.world.camera.x + (this.t * 53) % VIEW_W, 20, Z_MAX - 6, 2, { speed: 1, up: 2 }); }
    else if (ph === 'descend') this.descend();
    if (this.t >= this.dur) {
      if (ph === 'switch') this.switchSection();
      this.index++; this.t = 0;
      if (this.index >= this.phases.length) { this.finish(); return true; }
    }
    return false;
  }
  ride() {
    const cam = this.world.camera;
    for (const l of this.layers) l.alpha = Math.min(1, this.t / 30);
    if (this.t % 20 === 0) cam.shake(1, 6);
    if (this.t % 10 === 0) particles.burst('steam', cam.x + (this.t % 20 ? 40 : VIEW_W - 40), 30, Z_MAX - 10, 2, { speed: 0.8, up: 2 });
    if (this.t === 150) { audio.play('steam'); cam.shake(4, 12); }
  }
  /** Vane walks down the helix at the arena's right wall, then leaps into the cockpit of the waiting Regent Engine. */
  descend() {
    const b = this.spec.boss;
    if (this.t === 90) { audio.play('aether_step'); }
    if (this.t === 100 && b) { this.world.addFx('ring', b.x, b.h - 10, b.z, { r0: 4, r1: 40, color: '#4DF0E0' }); this.world.addFx('steam', b.x, b.h - 10, b.z, { count: 8 }); }
  }
  switchSection() {
    const r = this.runner, w = this.world, cam = w.camera;
    this.dropLayers();
    const next = this.spec.nextSection != null ? this.spec.nextSection : r.sectionIndex + 1;
    const sec = r.sections[next];
    if (!sec) return;
    cam.unlock(); cam.left = sec.x0; cam.minX = sec.x0; cam.right = w.stageLength;
    r.enterSection(next);
    if (!cam.locked) cam.right = w.stageLength;
    cam.snapTo(sec.x0);
    w.players.forEach((p, i) => { if (!p || p.out) return; p.x = sec.x0 + 70 + i * 40; p.z = 70 + i * 24; p.y = 0; p.vx = p.vy = p.vz = 0; p.facing = 1; if (!p.dead) p.setState(ST.IDLE, 'idle'); });
    for (const e of w.entities) if (e.kind === 'item' && e.x < sec.x0) e.removeMe = true;
    particles.clear();
    if (this.kind === 'dock') {
      // the arrival: board 1's summit stair (a brass landing with three risers) by default, or the look the stage names;
      // `pies` Meat Pies wait on it (default 2, alternating the two pie spots the stair has always used)
      const look = DOCK_LOOKS[this.spec.look || 'stairs'], pies = this.spec.pies != null ? this.spec.pies | 0 : 2;
      if (look) { this.stairs = new SceneLayer(-4, (ctx, c, l) => look(ctx, c, sec.x0, l), sec.x0 + 50); w.add(this.stairs); }
      for (let i = 0; i < pies; i++) w.add(new Pickup('meatPie', sec.x0 + 60 + i * 30, i % 2 ? 100 : 56, { pop: false, life: 1800 }));
    }
    if (this.kind === 'board') audio.play('go_arrow');
  }
  finish() { this.done = true; this.dropLayers(); this.fade = 0; }

  /** Overlays drawn after the world (gates, lift cage, fades, Vane's descent). */
  draw(ctx) {
    const cam = this.world.camera, ph = this.phase, k = this.k;
    if (this.kind === 'lift' && (ph === 'gate' || ph === 'ride')) this.drawLiftFront(ctx, cam, ph, k);
    if (this.kind === 'board' && ph === 'gate') this.drawCargoGate(ctx, cam, k);
    if (this.kind === 'descent') this.drawDescent(ctx, cam);
    if (this.fade > 0) { ctx.fillStyle = '#000'; ctx.globalAlpha = this.fade; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1; }
  }
  /** Dock gate: two riveted leaves hinged on the posts, swinging open (foreshortened) during the gate phase; then the lift cage. */
  drawLiftFront(ctx, cam, ph, k) {
    const gx = cam.toScreenX(this.gateX), top = 40, h = FLOOR_TOP + Z_MAX - top;
    if (ph === 'gate') {
      const e = 1 - (1 - k) * (1 - k), open = Math.max(0.08, 1 - e);
      ironPost(ctx, gx - 34, top - 6, h + 6); ironPost(ctx, gx + 30, top - 6, h + 6);
      ctx.save(); ctx.translate(gx - 30, 0); ctx.scale(open, 1); ironPanel(ctx, 0, top, 30, h); ctx.restore();
      ctx.save(); ctx.translate(gx + 30, 0); ctx.scale(open, 1); ironPanel(ctx, -30, top, 30, h); ctx.restore();
      rrect(ctx, gx - 40, top - 14, 80, 12, 2, tones(BRASS).base, OL, 1); drawText(ctx, 'LIFT', gx, top - 12, { size: 1, color: UI.ink, align: 'center', shadow: false });
      return;
    }
    // freight-lift cage: girder across the top, vertical bars at the screen edges, a swaying lamp
    const a = Math.min(1, this.t / 20);
    ctx.globalAlpha = a;
    rrect(ctx, -4, 42, VIEW_W + 8, 12, 2, tones(IRON).base, OL, 1); rivetLine(ctx, 8, 48, VIEW_W - 8, 48, 22, 1.5, '#c8a050');
    for (const x of [14, VIEW_W - 22]) { ironPanel(ctx, x, 50, 8, FLOOR_TOP + Z_MAX - 50); }
    for (const x of [14, VIEW_W - 22]) for (let y = 70; y < FLOOR_TOP + Z_MAX; y += 40) { ctx.fillStyle = tones(IRON).sh; ctx.fillRect(x - 2, y, 12, 3); }
    const sw = Math.sin(this.t * 0.08) * 6;
    ctx.strokeStyle = '#5a5a62'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(VIEW_W / 2, 54); ctx.lineTo(VIEW_W / 2 + sw, 84); ctx.stroke();
    rrect(ctx, VIEW_W / 2 + sw - 5, 84, 10, 12, 2, tones(BRASS).base, OL, 1);
    ctx.globalAlpha = a * (0.5 + 0.2 * Math.sin(this.t * 0.3)); ctx.fillStyle = '#ffd070'; ctx.fillRect(VIEW_W / 2 + sw - 3, 86, 6, 8);
    ctx.globalAlpha = 1;
  }
  /** Cargo gate: horizontal iron slats rolling up into a brass housing. */
  drawCargoGate(ctx, cam, k) {
    const gx = cam.toScreenX(this.gateX), top = 30, bottom = FLOOR_TOP + Z_MAX, e = k * k;
    const lift = Math.round((bottom - top - 20) * e);
    ironPost(ctx, gx - 24, top - 6, bottom - top + 6); ironPost(ctx, gx + 16, top - 6, bottom - top + 6);
    ctx.save(); ctx.beginPath(); ctx.rect(gx - 20, top + 10, 40, bottom - top - 10); ctx.clip();
    for (let y = top + 12 - lift; y < bottom; y += 14) ironPanel(ctx, gx - 20, y, 40, 12);
    ctx.restore();
    rrect(ctx, gx - 30, top - 6, 60, 16, 3, tones(BRASS).base, OL, 1); ctx.fillStyle = tones(BRASS).sh; ctx.fillRect(gx - 28, top + 4, 56, 4);
    drawText(ctx, 'CARGO', gx, top - 4, { size: 1, color: UI.ink, align: 'center', shadow: false });
    if ((this.t & 4) === 0) { ctx.fillStyle = '#ff5c5c'; ctx.fillRect(gx - 34, top - 2, 3, 3); ctx.fillRect(gx + 31, top - 2, 3, 3); }
  }
  /** Vane: helix stair at the right wall, spiral descent (2 turns), then a leap into the cockpit dome. */
  drawDescent(ctx, cam) {
    const b = this.spec.boss, t = this.t;
    const colX = cam.toScreenX(this.spec.stairX != null ? this.spec.stairX : this.world.stageLength - 46), topY = 6, botY = FLOOR_TOP + 40;
    // the stair column + helix treads (drawn as brass arcs around the column)
    rrect(ctx, colX - 4, topY, 8, botY - topY, 2, tones(IRON).base, OL, 1);
    for (let y = topY + 8; y < botY; y += 12) {
      const ph = (y / 12) * 0.9, r = 26, dx = Math.cos(ph) * r;
      ctx.globalAlpha = Math.sin(ph) > 0 ? 0.9 : 0.35;
      rrect(ctx, colX + Math.min(0, dx), y, Math.abs(dx) + 4, 3, 1, tones(BRASS).base, OL, 1);
    }
    ctx.globalAlpha = 1;
    if (!this.vaneRig || !b) return;
    let x, y, facing = -1, alpha = 1;
    if (t < 90) {
      const p = t / 90, ph = p * Math.PI * 4;
      x = colX + Math.cos(ph) * 26; y = topY + 10 + (botY - topY - 30) * p;
      facing = Math.sin(ph + 0.4) > 0 ? -1 : 1;
      alpha = Math.sin(ph) > 0 ? 1 : 0.45; // behind the column on the far half of each turn
    } else {
      const p = (t - 90) / 20, ex = cam.toScreenX(b.x), ey = FLOOR_TOP + b.z - b.h + 6;
      const sx0 = colX - 26, sy0 = botY - 20;
      x = sx0 + (ex - sx0) * p; y = sy0 + (ey - sy0) * p - Math.sin(p * Math.PI) * 60;
      facing = -1; alpha = p > 0.85 ? 0 : 1;
    }
    if (alpha <= 0) return;
    drawRig(ctx, this.vaneRig, this.vanePose, { x: Math.round(x), y: Math.round(y), facing, still: true, alpha });
  }
}

function ironPost(ctx, x, y, h) {
  rrect(ctx, x, y, 8, h, 2, tones(IRON).base, OL, 1);
  ctx.fillStyle = tones(IRON).hi; ctx.fillRect(x + 1, y + 1, 1, h - 2);
  ctx.fillStyle = tones(BRASS).hi; for (let yy = y + 6; yy < y + h - 4; yy += 16) ctx.fillRect(x + 3, yy, 2, 2);
}
/** Lift shaft: dark rock + iron ribs scrolling upward behind the sky rows (downward when the party rides UP); alpha ramps in as the lift moves. */
function drawShaft(ctx, cam, l, up = false) {
  const a = l.alpha == null ? 1 : l.alpha;
  if (a <= 0) return;
  ctx.globalAlpha = a; ctx.fillStyle = '#17141c'; ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP + cam.shakeY);
  const travel = up ? -l.t : l.t;                       // the walls run the other way when the cage rises
  const off = ((travel * 3) % 48 + 48) % 48, iron = tones(IRON);
  for (let y = -48 + (48 - off); y < FLOOR_TOP; y += 48) {
    ctx.fillStyle = '#221c26'; ctx.fillRect(0, y, VIEW_W, 46);
    ctx.fillStyle = '#2e2632'; for (let x = (y / 48 | 0) % 2 ? 30 : 0; x < VIEW_W; x += 60) ctx.fillRect(x, y + 8, 40, 24);
    rrect(ctx, -4, y + 40, VIEW_W + 8, 8, 1, iron.base, OL, 1); ctx.fillStyle = iron.hi; ctx.fillRect(0, y + 41, VIEW_W, 1);
    ctx.fillStyle = tones(BRASS).hi; for (let x = 12; x < VIEW_W; x += 40) ctx.fillRect(x, y + 43, 2, 2);
  }
  // guide rails at the edges + a passing shaft lamp every 144px
  for (const x of [40, VIEW_W - 48]) { rrect(ctx, x, 0, 8, FLOOR_TOP, 0, iron.sh, OL, 1); }
  const ly = ((travel * 3) % 144 + 144) % 144 - 20;
  ctx.fillStyle = '#ffd070'; ctx.fillRect(VIEW_W - 60, ly, 4, 6); ctx.globalAlpha = a * 0.25; ctx.fillStyle = '#ffb040'; ctx.beginPath(); ctx.arc(VIEW_W - 58, ly + 3, 30, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}
/**
 * Dock look 'ladder': a ship's companion ladder rising off the right edge of the arrival landing and out of the top of the
 * frame — the party has come up from below decks. Two wooden rails, brass-tipped rungs, a hemp hand-rope, a hatch lip at the foot.
 */
function drawLadder(ctx, cam, x0) {
  const sx = cam.toScreenX(x0 + 104), y0 = FLOOR_TOP + cam.shakeY;
  if (sx > VIEW_W || sx + 40 < 0) return;
  const wood = tones(WOOD), brass = tones(BRASS), hemp = tones(HEMP);
  // hatch lip: a brass-edged dark coaming the ladder stands in
  ctx.fillStyle = '#1a1418'; ctx.fillRect(sx - 8, y0, 40, 14);
  rrect(ctx, sx - 10, y0 - 2, 44, 4, 1, brass.base, OL, 1); ctx.fillStyle = brass.hi; ctx.fillRect(sx - 9, y0 - 2, 42, 1);
  for (const x of [sx, sx + 20]) { rrect(ctx, x, -4, 5, y0 + 6, 1, wood.base, OL, 1); ctx.fillStyle = wood.hi; ctx.fillRect(x + 1, 0, 1, y0 + 2); }
  for (let y = y0 - 6; y > 0; y -= 10) { rrect(ctx, sx + 3, y, 19, 3, 1, wood.sh, OL, 1); ctx.fillStyle = brass.base; ctx.fillRect(sx + 3, y, 2, 3); ctx.fillRect(sx + 20, y, 2, 3); }
  ctx.strokeStyle = hemp.base; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx + 30, y0 - 2); ctx.lineTo(sx + 30, 0); ctx.stroke();
  ctx.strokeStyle = OL; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx + 31.5, y0 - 2); ctx.lineTo(sx + 31.5, 0); ctx.stroke();
}
/**
 * Dock look 'door': the counting-house double door the party has just been shown through. A brass lintel over two tall
 * panelled leaves that swing open (foreshortened) over LOOK_SETTLE frames after the switch and then stand open.
 */
function drawDoor(ctx, cam, x0, l) {
  const sx = cam.toScreenX(x0 + 10), y0 = FLOOR_TOP + cam.shakeY, top = y0 - 96, h = 100, W = 80;
  if (sx > VIEW_W || sx + W < 0) return;
  const k = Math.min(1, (l.t || 0) / LOOK_SETTLE), e = 1 - (1 - k) * (1 - k), open = Math.max(0.12, 1 - e);
  const wood = tones(WOOD), brass = tones(BRASS);
  // the dark hall behind the leaves, the frame posts, the lintel plate
  ctx.fillStyle = '#14101a'; ctx.fillRect(sx + 4, top + 8, W - 8, h - 8);
  ironPost(ctx, sx - 2, top - 6, h + 10); ironPost(ctx, sx + W - 6, top - 6, h + 10);
  for (const side of [0, 1]) {
    const hinge = side ? sx + W - 4 : sx + 4, dir = side ? -1 : 1;
    ctx.save(); ctx.translate(hinge, 0); ctx.scale(open * dir, 1);
    rrect(ctx, 0, top + 6, 36, h - 6, 2, wood.base, OL, 1);
    ctx.fillStyle = wood.sh; ctx.fillRect(4, top + 12, 28, 34); ctx.fillRect(4, top + 52, 28, 38); // two recessed panels
    ctx.fillStyle = wood.hi; ctx.fillRect(4, top + 12, 28, 1); ctx.fillRect(4, top + 52, 28, 1);
    rrect(ctx, 28, top + 48, 4, 10, 1, brass.base, OL, 1);                                      // handle
    ctx.restore();
  }
  rrect(ctx, sx - 6, top - 10, W + 12, 14, 2, brass.base, OL, 1); ctx.fillStyle = brass.sh; ctx.fillRect(sx - 4, top, W + 8, 3);
  drawText(ctx, 'LEDGER', sx + W / 2, top - 8, { size: 1, color: UI.ink, align: 'center', shadow: false });
}
/**
 * Dock look 'hoist': the hemp hoist platform the party rode up on — planks over the landing with a brass lip, four hemp lines
 * rising to a pulley block at the top of the frame; the sheave spins down over LOOK_SETTLE frames as the load settles.
 */
function drawHoist(ctx, cam, x0, l) {
  const sx = cam.toScreenX(x0), y0 = FLOOR_TOP + cam.shakeY;
  if (sx > VIEW_W || sx + 120 < 0) return;
  const plank = tones(PLANK), brass = tones(BRASS), hemp = tones(HEMP), iron = tones(IRON);
  // the platform paints the floor band like the stair does: planks running along x, a dark seam every 16px
  ctx.fillStyle = plank.base; ctx.fillRect(sx, y0, 120, Z_MAX);
  ctx.fillStyle = plank.sh; for (let x = sx + 16; x < sx + 120; x += 16) ctx.fillRect(x, y0, 1, Z_MAX);
  ctx.fillStyle = plank.hi; ctx.fillRect(sx, y0 + 1, 120, 1);
  ctx.fillStyle = brass.base; ctx.fillRect(sx + 116, y0, 4, Z_MAX); ctx.fillStyle = brass.hi; ctx.fillRect(sx + 116, y0, 1, Z_MAX);
  ctx.fillStyle = OL; ctx.fillRect(sx + 119, y0, 1, Z_MAX);
  rrect(ctx, sx, y0 - 3, 120, 5, 1, brass.base, OL, 1);
  // four hemp lines from the corners to the block
  const bx = sx + 60, by = 14;
  ctx.lineWidth = 2; ctx.strokeStyle = hemp.base; ctx.beginPath();
  for (const x of [sx + 6, sx + 114]) for (const z of [6, Z_MAX - 6]) { ctx.moveTo(x, y0 + z); ctx.lineTo(bx + (x < bx ? -4 : 4), by + 8); }
  ctx.stroke();
  // the pulley block: iron cheeks, a brass sheave whose spokes turn while the load settles
  rrect(ctx, bx - 12, by - 8, 24, 20, 3, iron.base, OL, 1);
  const ang = Math.min(l.t || 0, LOOK_SETTLE) * 0.18;
  circle(ctx, bx, by + 2, 7, brass.base, OL, 1);
  ctx.strokeStyle = brass.sh; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i < 3; i++) { const a = ang + i * Math.PI / 3; ctx.moveTo(bx - Math.cos(a) * 5, by + 2 - Math.sin(a) * 5); ctx.lineTo(bx + Math.cos(a) * 5, by + 2 + Math.sin(a) * 5); }
  ctx.stroke();
  ctx.fillStyle = hemp.base; ctx.fillRect(bx - 1, 0, 3, by - 6);
}
/** Summit landing: three brass-edged marble steps rising out of the funicular dock onto the Heart-Engine floor. */
function drawStairs(ctx, cam, x0) {
  const sx = cam.toScreenX(x0), y0 = FLOOR_TOP + cam.shakeY;
  if (sx > VIEW_W || sx + 120 < 0) return;
  const marble = tones('#B9B2A5'), brass = tones(BRASS), dark = tones('#6a6660');
  for (let i = 0; i < 3; i++) {
    const x = sx + i * 34, w = 110 - i * 34, top = y0 + i * 6;
    ctx.fillStyle = i % 2 ? marble.base : marble.hi; ctx.fillRect(x, top, w, Z_MAX - i * 6);
    ctx.fillStyle = dark.sh; ctx.fillRect(x, top, w, 1);                 // riser lip
    ctx.fillStyle = marble.sh; ctx.fillRect(x + w - 10, top, 10, Z_MAX - i * 6);
    ctx.fillStyle = brass.base; ctx.fillRect(x + w - 4, top, 4, Z_MAX - i * 6); ctx.fillStyle = brass.hi; ctx.fillRect(x + w - 4, top, 1, Z_MAX - i * 6);
    ctx.fillStyle = OL; ctx.fillRect(x + w - 1, top, 1, Z_MAX - i * 6);
  }
  ctx.fillStyle = brass.base; ctx.fillRect(sx, y0, 110, 3); ctx.fillStyle = brass.hi; ctx.fillRect(sx, y0, 110, 1);
}
/** Boss name plate: a riveted brass plaque behind the HUD banner text. */
export function drawNamePlate(ctx, plate) {
  const t = plate.timer / plate.life, a = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1;
  const w = 420, x = VIEW_W / 2 - w / 2, y = 104, h = plate.sub ? 62 : 44;
  ctx.globalAlpha = a;
  rrect(ctx, x, y, w, h, 4, 'rgba(18,12,20,0.85)', tones(BRASS).base, 2);
  rivetLine(ctx, x + 10, y + 6, x + w - 10, y + 6, 14, 1.5, '#c8a050');
  rivetLine(ctx, x + 10, y + h - 6, x + w - 10, y + h - 6, 14, 1.5, '#c8a050');
  ctx.fillStyle = tones(BRASS).sh; ctx.fillRect(x + 20, y + h - 12, w - 40, 1);
  ctx.globalAlpha = 1;
}
/** Mid-boss intro spotlight: everything dims except a cone from the gantry lights down to the boss. */
export function drawSpotlight(ctx, cam, b, t) {
  const a = Math.min(0.5, t / 20 * 0.5), sx = cam.toScreenX(b.x), sy = FLOOR_TOP + b.z + cam.shakeY;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, VIEW_W, VIEW_H);
  ctx.moveTo(sx - 14, 0); ctx.lineTo(sx + 14, 0); ctx.lineTo(sx + 70, sy + 8); ctx.lineTo(sx - 70, sy + 8); ctx.closePath();
  ctx.fillStyle = '#000'; ctx.globalAlpha = a; ctx.fill('evenodd');
  ctx.globalAlpha = 0.12 + 0.05 * Math.sin(t * 0.3); ctx.fillStyle = '#fff4c0';
  pathPoly(ctx, [sx - 14, 0, sx + 14, 0, sx + 70, sy + 8, sx - 70, sy + 8]); ctx.fill();
  ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.ellipse(sx, sy + 4, 70, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/**
 * Defeat spectacle (GDD 5.2): six welded safety valves blow open one by one with bass thumps, the sky lightens to dawn
 * cream over 120f, the heroes hold their poses. `update(t)` is called every frame of the 240f victory hold.
 */
export class VictorySpectacle {
  constructor(world, arena) {
    this.world = world; this.arena = arena; this.t = 0; this.jets = 0;
    this.layer = new SceneLayer(-4, (ctx, cam, l) => this.drawDawn(ctx, cam, l), (arena.x0 + arena.x1) / 2);
    world.add(this.layer);
  }
  update() {
    const w = this.world, t = ++this.t;
    if (t % 30 === 0 && this.jets < 6) {
      const x = this.arena.x0 + 40 + this.jets * ((this.arena.x1 - this.arena.x0 - 80) / 5);
      this.jets++;
      audio.play('valve_blow'); w.camera.shake(6, 10);
      particles.burst('steam', x, 60, 4, 18, { speed: 2.5, up: 5, spread: 0.5, sizeJitter: 2, color: '#ffffff' });
      w.addFx('ring', x, 60, 4, { r0: 6, r1: 60, color: '#ffffff' });
    }
    if (t > 200 && t % 12 === 0) particles.burst('spark', w.camera.x + (t * 37) % VIEW_W, 100 + (t * 13) % 80, 20, 2, { speed: 1, up: 1, color: '#fff4c0', gravity: 0.02 });
  }
  drawDawn(ctx, cam) {
    const k = Math.max(0, Math.min(1, (this.t - 60) / 120));
    if (k <= 0) return;
    ctx.globalAlpha = 0.5 * k; ctx.fillStyle = '#F4E8C8'; ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP + cam.shakeY);
    // the city lights return terrace by terrace: warm dots climbing the sky rows
    ctx.globalAlpha = k; ctx.fillStyle = '#ffd27a';
    const lit = Math.floor(k * 3);
    for (let i = 0; i < lit; i++) for (let x = 20 + i * 7; x < VIEW_W; x += 46) ctx.fillRect(x, 150 - i * 40 + ((x >> 4) & 7), 2, 2);
    ctx.globalAlpha = 1;
  }
  dispose() { this.layer.removeMe = true; }
}
