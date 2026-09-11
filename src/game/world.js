// World: entity list, spawn/despawn, update order, depth-sorted draw with shadows first, FX, attack tokens (per faction group),
// camera bounds, floor band (boss arena shrink), area hits, spec-based projectile spawning, cutscenes, boss stun (pressure valves).
import { VIEW_W, VIEW_H, FLOOR_TOP, Z_MIN, Z_MAX, CAMERA_MARGIN, TEAM, ST, ATTACK_TOKENS_BY_PARTY } from '../constants.js';
import { Camera } from '../engine/camera.js';
import { particles } from '../engine/particles.js';
import { resolveHits } from './combat.js';
import { Projectile, projectileOptsFromSpec } from './projectile.js';
import { spawnDrops, Prop } from './items.js';
import { drawHitSpark, drawRing, drawSlash, drawMuzzleFlash, burstDust, burstSteam } from '../art/fx.js';
import { audio } from '../engine/audio.js';

const FX_LIFE = { spark: 10, slash: 10, ring: 16, muzzle: 6, flash: 8 };
const FIGHTER_KINDS = new Set(['player', 'enemy', 'boss']);
/** Capped combat log length (World.log): oldest entries drop first. */
const LOG_MAX = 64;

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
    /** Capped combat log of player-dealt hits (training room: game/trials.js, screens/training.js). Derived state
     *  like `fx`: never hashed by net/checksum.js. */
    this.log = []; this.logSeq = 0;
    this.fx = [];
    this.freeze = 0;
    this.freezeFocus = null;
    this.boss = null;
    this.wavesCleared = 0;
    this.sectionIndex = 0;
    /** Attack tokens: at most `max` enemies attack at once overall; `groups` caps a faction / ai.tokenGroup (Sootborn 2). */
    this.attackTokens = { max: 2, holders: new Set(), groups: {} };
    /** Optional narrower fighter bounds inside the camera lock (boss dais). */
    this.arenaBounds = null;
    /** Floor band in z every fighter is clamped to (boss arenas shrink it: `shrinkBand`). */
    this.floorBand = { z0: Z_MIN, z1: Z_MAX };
    /** Hook installed by the gameplay screen: (type, variant, x, z, opts) => Enemy (used by bosses / stage events). */
    this.spawnEnemy = null;
    /** Stage runner (when running a real stage). */
    this.stage = null;
    /** Cutscene: entities freeze while `cutsceneTimer` > 0; `cutsceneDraw(ctx, world, t)` draws over the scene. */
    this.cutsceneTimer = 0; this.cutsceneDraw = null; this.cutsceneLen = 0;
    this._fighters = [];
    this._enemies = [];
    this._valves = new Set();
    /**
     * Fire sources registered THIS frame as { x, z, r }, cleared at the top of every update. Burn ticks (status.js),
     * fire projectiles / puddles (projectile.js), a breaking lantern (items.js) and boiling vats call `addFire`; the gas
     * hazards (hazards.js gasSeep / gasCell) read it to decide whether they ignite. A per-frame list, not a flag, so a
     * hazard can ask "is there fire HERE" without every fire source knowing about every hazard. `lastFires` is the
     * previous frame's list: entities update in list order, so a hazard placed before a burning fighter would otherwise
     * never see its fire (the list is empty when the hazard runs and cleared again before it runs next).
     */
    this.fires = [];
    this.lastFires = [];
  }
  /** Register a fire at (x, z) with radius r for this frame (see `fires`). */
  addFire(x, z, r = 16) { this.fires.push({ x, z, r }); }
  /** Add an entity. */
  add(e) {
    e.world = this;
    this.entities.push(e);
    if (e.kind === 'player' && !this.players.includes(e)) this.players.push(e);
    if (e.kind === 'boss') this.boss = e;
    if (e.kind === 'prop' && (e.stunsBoss || (e.info && e.info.stunsBoss) || /valve/i.test(e.type || ''))) this._valves.add(e);
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
  /** Players still in the run (alive or respawning, not out): the party size waves scale to (issue #23). */
  get partySize() { let n = 0; for (const p of this.players) if (p && !p.out) n++; return n; }
  _refreshLists() {
    this._fighters.length = 0; this._enemies.length = 0;
    for (const e of this.entities) {
      if (!FIGHTER_KINDS.has(e.kind) || e.removeMe || !e.alive) continue;
      this._fighters.push(e);
      if (e.team === TEAM.ENEMY) this._enemies.push(e);
    }
    const n = this.alivePlayers.length;
    this.attackTokens.max = ATTACK_TOKENS_BY_PARTY[Math.min(n, ATTACK_TOKENS_BY_PARTY.length - 1)];
  }
  /** Freeze the world for n frames (super cut-in); `focus` keeps drawing on top. */
  freezeFrames(n, focus = null) { this.freeze = Math.max(this.freeze, n); this.freezeFocus = focus; }
  /**
   * Cutscene: freeze gameplay for `frames` and draw `drawFn(ctx, world, t01)` over the scene (boss entrances, phase cut-ins).
   * Prefers `game.cutscene(frames, drawFn)` when the shell implements it.
   */
  cutscene(frames, drawFn = null) {
    if (this.game && typeof this.game.cutscene === 'function') { this.game.cutscene(frames, drawFn); return; }
    this.cutsceneTimer = Math.max(this.cutsceneTimer, frames | 0); this.cutsceneLen = this.cutsceneTimer; this.cutsceneDraw = drawFn;
  }
  get inCutscene() { return this.cutsceneTimer > 0; }

  /** Fixed step. */
  update() {
    this.frame++;
    // fire sources re-register every step (a puddle that burned out last frame lights nothing two frames on); the swap keeps
    // last frame's list readable for hazards that update earlier in the entity order than the fire that reached them
    const swap = this.lastFires; this.lastFires = this.fires; this.fires = swap; this.fires.length = 0;
    if (this.cutsceneTimer > 0) { this.cutsceneTimer--; this.camera.update(); this._tickFx(); particles.update(); if (this.cutsceneTimer === 0) this.cutsceneDraw = null; return; }
    if (this.freeze > 0) { this.freeze--; this.camera.update(); this._tickFx(); if (this.freeze === 0) this.freezeFocus = null; return; }
    this._refreshLists();
    const list = this.entities.slice();
    for (const e of list) if (!e.removeMe) e.update(this);
    resolveHits(this);
    this._tickFx();
    particles.update();
    for (const h of this.attackTokens.holders) if (!h.alive || h.removeMe) this.releaseToken(h);
    this._checkValves();
    this.camera.follow(this.players);
    this.camera.update();
    if (this.backdrop && this.backdrop.update) this.backdrop.update(this.frame, this.camera);
    let n = 0;
    for (let i = 0; i < this.entities.length; i++) { const e = this.entities[i]; if (!e.removeMe) this.entities[n++] = e; else if (this.boss === e) this.boss = null; }
    this.entities.length = n;
    this._refreshLists();
  }
  _tickFx() { let n = 0; for (const f of this.fx) { f.t++; if (f.t < f.life) this.fx[n++] = f; } this.fx.length = n; }
  /** Pressure valves (GDD 5.2): a flagged prop that breaks stuns the boss once (props flag themselves with `stunsBoss` or a 'valve' type). */
  _checkValves() {
    if (!this._valves.size) return;
    for (const v of this._valves) {
      if (v.alive && !v.removeMe) continue;
      this._valves.delete(v);
      this.stunBoss(v.stunFrames || 60, { source: v });
    }
  }
  /**
   * Stun the active boss for `frames` (pressure valves, stage events). Honoured unless the boss' current phase sets ai.valveStun = false.
   * @returns {boolean} true when a boss was stunned
   */
  stunBoss(frames = 60, { source = null } = {}) {
    const b = this.boss;
    if (!b || !b.alive || b.dead || b.defeated || (b.ai && b.ai.valveStun === false) || typeof b.stun !== 'function') return false;
    b.stun(frames, source);
    return true;
  }
  /**
   * Record a player-dealt combat event. Derived state like `fx`: never hashed by net/checksum.js, read only by the
   * training room (screens/training.js, game/trials.js). Area / shockwave hits arrive here as kind 'projectile'
   * because world.areaHit builds a Projectile. opts: { hit, anim, air }
   */
  logEvent(kind, attacker, target, { hit = null, anim = null, air = false } = {}) {
    if (!attacker || attacker.kind !== 'player') return;
    if (target && target.kind !== 'enemy' && target.kind !== 'boss') return;
    if (this.log.length >= LOG_MAX) this.log.shift();
    this.log.push({ seq: ++this.logSeq, frame: this.frame, p: attacker.index, kind, anim: anim || (attacker.anim ? attacker.anim.name : ''),
      type: hit ? (hit.type || 'light') : '', damage: target ? (target.lastDamage || 0) : 0, hitstun: target && target.state === ST.HURT ? target.hurtTimer : 0,
      air: !!air, targetId: target ? target.id : 0 });
  }

  /** Draw everything: backdrop, shadows, depth-sorted entities, FX, particles, foreground, cutscene overlay. */
  draw(ctx) {
    const cam = this.camera;
    if (this.backdrop && this.backdrop.drawBack) this.backdrop.drawBack(ctx, cam, this.frame);
    else { ctx.fillStyle = '#202030'; ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP); ctx.fillStyle = '#4a4650'; ctx.fillRect(0, FLOOR_TOP, VIEW_W, VIEW_H - FLOOR_TOP); }
    this.drawBandEdges(ctx, cam);
    for (const e of this.entities) if (e.alive || e.kind === 'player' || e.state === ST.DEAD) e.drawShadow(ctx, cam);
    particles.draw(ctx, cam, 'back');
    const sorted = this.entities.slice().sort(depthCompare);
    for (const e of sorted) e.draw(ctx, cam);
    this.drawFx(ctx, cam);
    particles.draw(ctx, cam, 'front');
    if (this.backdrop && this.backdrop.drawFront) this.backdrop.drawFront(ctx, cam, this.frame);
    if (this.cutsceneTimer > 0 && this.cutsceneDraw) this.cutsceneDraw(ctx, this, 1 - this.cutsceneTimer / Math.max(1, this.cutsceneLen));
  }
  /** Shrunk floor band: steam-vent strips along the closed edges (GDD 5.2 dais). */
  drawBandEdges(ctx, cam) {
    const b = this.floorBand;
    if (b.z0 <= Z_MIN && b.z1 >= Z_MAX) return;
    ctx.save(); ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.frame * 0.2); ctx.fillStyle = '#e8f0f4';
    if (b.z0 > Z_MIN) ctx.fillRect(0, FLOOR_TOP + Z_MIN + cam.shakeY, VIEW_W, b.z0 - Z_MIN);
    if (b.z1 < Z_MAX) ctx.fillRect(0, FLOOR_TOP + b.z1 + cam.shakeY, VIEW_W, Z_MAX - b.z1);
    ctx.restore();
  }
  /** Debug overlay: hitboxes, hurtboxes, states (`labels` false = boxes only, no state text). */
  drawDebug(ctx, labels = true) { for (const e of this.entities) if (e.drawDebug) e.drawDebug(ctx, this.camera, labels); }

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
  /**
   * Spawn a projectile. Two forms:
   *  spawnProjectile(rawOpts)                              raw Projectile options (see projectile.js)
   *  spawnProjectile(spec, owner, x, y, z, opts)           content spec (or a name in owner.def.projectiles); x/y/z override the spec's
   *                                                        offsets when given; opts: { index, count, aimX, aimZ, facing, ...overrides }
   */
  spawnProjectile(spec, owner, x, y, z, opts = {}) {
    if (arguments.length <= 1 || spec instanceof Projectile) return this.add(spec instanceof Projectile ? spec : new Projectile(spec));
    const s = typeof spec === 'string' ? (owner && owner.def && owner.def.projectiles && owner.def.projectiles[spec]) : spec;
    if (!s) return null;
    const o = projectileOptsFromSpec(s, owner || null, { ...opts, x, y, z });
    if (opts.overrides) Object.assign(o, opts.overrides);
    if (!owner && o.team == null) o.team = TEAM.NONE;
    return this.add(new Projectile(o));
  }
  /**
   * One-frame area hit centred at (x, z) with radius r, credited to `attacker` (null = stage hazard, hits everyone).
   * opts: { teams: [TEAM..] (who may be hit; default = the attacker's enemies, or everyone when null), team (projectile team),
   *         exclude (entity), y (height), shake (px), color (ring), silent (no ring / shake), knockdown / launch (set hit.type) }
   * @returns {Projectile}
   */
  areaHit(x, z, r, hit, attacker = null, opts = {}) {
    const h = { ...hit };
    if (opts.knockdown) h.type = 'knockdown'; else if (opts.launch) h.type = 'launch';
    if (!attacker && h.friendly == null) h.friendly = true;
    const team = opts.team != null ? opts.team : (attacker ? attacker.team : TEAM.NONE);
    const p = new Projectile({ owner: attacker, team, x, y: Math.max(opts.y || 0, r * 0.5), z, r, life: 2, style: 'explosion', hit: { ...h, z: r }, pierce: 99, hitsTeams: opts.teams || opts.hitsTeams || null });
    if (opts.exclude) p.hitTargets.add(opts.exclude.id);
    if (!opts.silent) {
      this.addFx('ring', x, 0, z, { r1: r, flat: true, color: opts.color || '#ffd080' });
      if (opts.shake && this.camera) this.camera.shake(opts.shake, opts.shake >= 8 ? 12 : 8);
    }
    return this.add(p);
  }
  /**
   * Spawn a breakable prop from the art/props.js catalogue at world (x, z) — the content-side way to put a prop down
   * (the Drayman shoves a handcart, a Hoister drops a crate): content never imports game/items.js, it asks the world.
   * @param {string} type PROP_TYPES key  @param {object} [opts] Prop constructor opts ({ drops, hp, release, dump, fire, solid, rider })
   * @returns {Prop}
   */
  spawnProp(type, x, z, opts = {}) { return this.add(new Prop(type, x, z, opts)); }
  /** Legacy alias of areaHit(x, z, r, hit, owner, { exclude, y }). */
  spawnAreaHit(owner, x, z, r, hit, exclude = null, y = 0) { return this.areaHit(x, z, r, hit, owner, { exclude, y, silent: true }); }
  /** Nearest living enemy fighter to (x, z). */
  nearestEnemy(x, z, { team = TEAM.ENEMY, maxDist = Infinity, exclude = null, zWeight = 1.5 } = {}) {
    let best = null, bestD = maxDist;
    for (const e of this._fighters) {
      if (e.team !== team || e.dead || (e.out) || (exclude && (exclude === e || (exclude.has && exclude.has(e.id))))) continue;
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
  /** Floor band (z) a fighter is clamped to. */
  zBounds(e) { return this.floorBand; }
  /** Shrink the floor band by `px` on each edge (boss phases); resetBand() restores it. */
  shrinkBand(px) { const b = this.floorBand; b.z0 = Math.min(b.z0 + px, 60); b.z1 = Math.max(b.z1 - px, 80); audio.play('steam'); }
  resetBand() { this.floorBand.z0 = Z_MIN; this.floorBand.z1 = Z_MAX; }
  /** Attack tokens: at most `max` enemies attack at once; a faction / ai.tokenGroup may cap itself lower (ai.maxAttackers). */
  requestToken(e) {
    const t = this.attackTokens;
    if (t.holders.has(e)) return true;
    const group = e.ai && (e.ai.tokenGroup || (e.ai.maxAttackers && e.def && e.def.faction)) || null;
    if (group) {
      let n = 0; for (const h of t.holders) if (h.ai && (h.ai.tokenGroup || (h.ai.maxAttackers && h.def && h.def.faction)) === group) n++;
      if (n >= (e.ai.maxAttackers || t.max)) return false;
    }
    if (t.holders.size >= t.max) return false;
    t.holders.add(e); return true;
  }
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
  clear() { this.entities.length = 0; this.players.length = 0; this.fx.length = 0; this.log.length = 0; this.fires.length = 0; this.lastFires.length = 0; this.boss = null; this.attackTokens.holders.clear(); this._valves.clear(); this.resetBand(); this.cutsceneTimer = 0; particles.clear(); }
  /** Living enemies excluding bosses (wave bookkeeping). */
  get waveEnemies() { return this._enemies.filter((e) => e.kind !== 'boss' && !e.fleeing && !e.dead); }
}

function depthCompare(a, b) {
  if (a.z !== b.z) return a.z - b.z;
  if (a.y !== b.y) return b.y - a.y;
  return a.id - b.id;
}
