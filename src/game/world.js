// World: entity list, spawn/despawn, update order, depth-sorted draw with shadows first, FX, attack tokens, camera bounds.
import { VIEW_W, VIEW_H, FLOOR_TOP, Z_MAX, CAMERA_MARGIN, TEAM, ST } from '../constants.js';
import { Camera } from '../engine/camera.js';
import { particles } from '../engine/particles.js';
import { resolveHits } from './combat.js';
import { Projectile } from './projectile.js';
import { spawnDrops } from './items.js';
import { drawHitSpark, drawRing, drawSlash, drawMuzzleFlash, burstDust, burstSteam } from '../art/fx.js';

const FX_LIFE = { spark: 10, slash: 10, ring: 16, muzzle: 6, flash: 8 };
const FIGHTER_KINDS = new Set(['player', 'enemy', 'boss']);

/** The playfield: owns entities, the camera, transient FX and the hit resolution pass. */
export class World {
  /**
   * @param {{ stageLength?: number, game?: object, backdrop?: object, options?: object }} o
   */
  constructor({ stageLength = 2000, game = null, backdrop = null, options = {} } = {}) {
    this.game = game;
    this.options = options;
    this.entities = [];
    /** Player fighters (kept even while dead/out so the HUD can show them). */
    this.players = [];
    this.camera = new Camera(stageLength);
    this.stageLength = stageLength;
    this.backdrop = backdrop;
    this.frame = 0;
    this.fx = [];
    this.freeze = 0;
    this.freezeFocus = null;
    this.boss = null;
    this.wavesCleared = 0;
    this.sectionIndex = 0;
    this.attackTokens = { max: 2, holders: new Set() };
    /** Optional narrower fighter bounds inside the camera lock (boss dais). */
    this.arenaBounds = null;
    /** Hook installed by the gameplay screen: (type, variant, x, z, opts) => Enemy (used by bosses / stage events). */
    this.spawnEnemy = null;
    /** Stage runner (when running a real stage). */
    this.stage = null;
    this._fighters = [];
    this._enemies = [];
  }
  /** Add an entity. */
  add(e) {
    e.world = this;
    this.entities.push(e);
    if (e.kind === 'player' && !this.players.includes(e)) this.players.push(e);
    if (e.kind === 'boss') this.boss = e;
    return e;
  }
  /** Remove an entity immediately. */
  remove(e) { e.removeMe = true; const i = this.entities.indexOf(e); if (i >= 0) this.entities.splice(i, 1); if (this.boss === e) this.boss = null; }
  /** Living fighters (players, enemies, bosses) as of the last update. */
  get fighters() { return this._fighters; }
  /** Living enemies + bosses as of the last update. */
  get enemies() { return this._enemies; }
  /** Living players. */
  get alivePlayers() { return this.players.filter((p) => p.alive && !p.dead && !p.removeMe); }
  _refreshLists() {
    this._fighters.length = 0; this._enemies.length = 0;
    for (const e of this.entities) {
      if (!FIGHTER_KINDS.has(e.kind) || e.removeMe || !e.alive) continue;
      this._fighters.push(e);
      if (e.team === TEAM.ENEMY) this._enemies.push(e);
    }
    this.attackTokens.max = this.alivePlayers.length > 1 ? 3 : 2;
  }
  /** Freeze the world for n frames (super cut-in); `focus` keeps drawing on top. */
  freezeFrames(n, focus = null) { this.freeze = Math.max(this.freeze, n); this.freezeFocus = focus; }

  /** Fixed step. */
  update() {
    this.frame++;
    if (this.freeze > 0) { this.freeze--; this.camera.update(); this._tickFx(); if (this.freeze === 0) this.freezeFocus = null; return; }
    this._refreshLists();
    const list = this.entities.slice();
    for (const e of list) if (!e.removeMe) e.update(this);
    resolveHits(this);
    this._tickFx();
    particles.update();
    for (const h of this.attackTokens.holders) if (!h.alive || h.removeMe) this.attackTokens.holders.delete(h);
    this.camera.follow(this.players);
    this.camera.update();
    if (this.backdrop && this.backdrop.update) this.backdrop.update(this.frame, this.camera);
    let n = 0;
    for (let i = 0; i < this.entities.length; i++) { const e = this.entities[i]; if (!e.removeMe) this.entities[n++] = e; else if (this.boss === e) this.boss = null; }
    this.entities.length = n;
    this._refreshLists();
  }
  _tickFx() { let n = 0; for (const f of this.fx) { f.t++; if (f.t < f.life) this.fx[n++] = f; } this.fx.length = n; }

  /** Draw everything: backdrop, shadows, depth-sorted entities, FX, particles, foreground. */
  draw(ctx) {
    const cam = this.camera;
    if (this.backdrop && this.backdrop.drawBack) this.backdrop.drawBack(ctx, cam, this.frame);
    else { ctx.fillStyle = '#202030'; ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP); ctx.fillStyle = '#4a4650'; ctx.fillRect(0, FLOOR_TOP, VIEW_W, VIEW_H - FLOOR_TOP); }
    for (const e of this.entities) if (e.alive || e.kind === 'player' || e.state === ST.DEAD) e.drawShadow(ctx, cam);
    particles.draw(ctx, cam, 'back');
    const sorted = this.entities.slice().sort(depthCompare);
    for (const e of sorted) e.draw(ctx, cam);
    this.drawFx(ctx, cam);
    particles.draw(ctx, cam, 'front');
    if (this.backdrop && this.backdrop.drawFront) this.backdrop.drawFront(ctx, cam, this.frame);
  }
  /** Debug overlay: hitboxes, hurtboxes, states. */
  drawDebug(ctx) { for (const e of this.entities) if (e.drawDebug) e.drawDebug(ctx, this.camera); }

  // ---------- FX ----------
  /**
   * Add a transient screen effect at world coords. kinds: spark {type}, slash {radius, angle, sweep, color}, ring {r0, r1, color, flat},
   * muzzle, dust, steam (the last two spawn particles immediately).
   */
  addFx(kind, x, y, z, opts = {}) {
    if (kind === 'dust') { burstDust(x, z, opts.count || 5); return; }
    if (kind === 'steam') { burstSteam(x, y, z, opts.count || 4); return; }
    if (!FX_LIFE[kind]) return;
    this.fx.push({ kind, x, y, z, t: 0, life: opts.life || FX_LIFE[kind], facing: opts.facing || 1, type: opts.type || 'light', radius: opts.radius || 34,
      angle: opts.angle || 0, sweep: opts.sweep || 110, color: opts.color || '#ffffff', r0: opts.r0 || 4, r1: opts.r1 || 60, flat: !!opts.flat, rot: (x * 7 + z) % 6 });
  }
  drawFx(ctx, cam) {
    for (const f of this.fx) {
      const t = f.t / f.life, sx = cam.toScreenX(f.x), sy = Math.round(FLOOR_TOP + f.z - f.y + cam.shakeY);
      if (f.kind === 'spark') drawHitSpark(ctx, sx, sy, t, f.type, f.rot);
      else if (f.kind === 'slash') drawSlash(ctx, sx, sy, t, f.radius, f.angle, f.sweep, f.facing, f.color === '#ffffff' ? '#e8f4ff' : f.color);
      else if (f.kind === 'ring') drawRing(ctx, sx, sy, t, f.r0, f.r1, f.color, 3, f.flat);
      else if (f.kind === 'muzzle') drawMuzzleFlash(ctx, sx, sy, t, f.facing);
      else if (f.kind === 'flash') { ctx.fillStyle = f.color; ctx.globalAlpha = 0.7 * (1 - t); ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1; }
    }
  }

  // ---------- spawning helpers ----------
  /** Spawn a projectile. */
  spawnProjectile(opts) { return this.add(new Projectile(opts)); }
  /**
   * One-frame area hit centred at (x, z) with radius r, credited to `owner`. Uses an invisible explosion projectile.
   */
  spawnAreaHit(owner, x, z, r, hit, exclude = null, y = 0) {
    const p = new Projectile({ owner, team: owner ? owner.team : TEAM.NONE, x, y: Math.max(y, r * 0.5), z, r, life: 2, style: 'explosion', hit: { ...hit, z: r }, pierce: 99 });
    if (exclude) p.hitTargets.add(exclude.id);
    return this.add(p);
  }
  /** Nearest living enemy fighter to (x, z). */
  nearestEnemy(x, z, { team = TEAM.ENEMY, maxDist = Infinity, exclude = null, zWeight = 1.5 } = {}) {
    let best = null, bestD = maxDist;
    for (const e of this._fighters) {
      if (e.team !== team || e.dead || (exclude && (exclude === e || (exclude.has && exclude.has(e.id))))) continue;
      const d = Math.abs(e.x - x) + Math.abs(e.z - z) * zWeight;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
  /** World x bounds an entity is clamped to (ARCHITECTURE section 2). */
  boundsFor(e) {
    const cam = this.camera, m = CAMERA_MARGIN;
    const ab = this.arenaBounds;
    if (e.kind === 'player') return ab ? { x0: Math.max(ab.x0, cam.x) + m, x1: Math.min(ab.x1, cam.x + VIEW_W) - m } : { x0: Math.max(cam.left, cam.x) + m, x1: Math.min(cam.right, cam.x + VIEW_W) - m };
    if (cam.locked && e.entered !== false) return ab ? { x0: ab.x0 + m, x1: ab.x1 - m } : { x0: cam.left + m, x1: cam.right - m };
    return { x0: 0, x1: this.stageLength };
  }
  /** Attack tokens: at most `max` enemies attack at once. */
  requestToken(e) { const t = this.attackTokens; if (t.holders.has(e)) return true; if (t.holders.size >= t.max) return false; t.holders.add(e); return true; }
  releaseToken(e) { this.attackTokens.holders.delete(e); }
  /** Called when a fighter dies (lands dead): drops + score credit. */
  onDeath(f) {
    if (f.team === TEAM.ENEMY) {
      spawnDrops(this, f.x, f.z, f.def.drops);
      const killer = f.lastHitBy;
      if (killer && killer.onKill) killer.onKill(f);
      if (this.onEnemyKilled) this.onEnemyKilled(f, killer);
    }
    if (f.kind === 'boss' && this.boss === f) this.boss = null;
  }
  /** Reset for a new run. */
  clear() { this.entities.length = 0; this.players.length = 0; this.fx.length = 0; this.boss = null; this.attackTokens.holders.clear(); particles.clear(); }
  /** Living enemies excluding bosses (wave bookkeeping). */
  get waveEnemies() { return this._enemies.filter((e) => e.kind !== 'boss' && !e.fleeing && !e.dead); }
}

function depthCompare(a, b) {
  if (a.z !== b.z) return a.z - b.z;
  if (a.y !== b.y) return b.y - a.y;
  return a.id - b.id;
}
