// Projectiles: bullets / bolts / shells (straight), bombs (lob + bounce + fuse + explode), boomerangs (return to the owner),
// grapples (chain out, reel the first enemy hit into the owner's grab), fire puddles (area hazards), reflectable bombs / bolts,
// custom-drawn projectiles. Built from content specs by `projectileOptsFromSpec` (frame `projectile`, `spawn.projectile`,
// def.projectiles[name]); see the FRAME FIELDS / PROJECTILE SPEC tables at the top of fighter.js.
import { FLOOR_TOP, TEAM, VIEW_W, ST, CAMERA_MARGIN } from '../constants.ts';
import { Entity } from './entity.ts';
import { particles } from '../engine/particles.ts';
import { circle, rrect, pathPoly, paint, line } from '../lib/art/shapes.ts';
import { jointScreen } from '../lib/art/rig.ts';
import { audio } from '../engine/audio.ts';
import { clamp } from '../lib/engine/math.ts';
import { dsin, dcos, dhypot } from '../lib/engine/trig.ts';
import type { Aabb, CameraView, Team } from './entity.ts';
// Type-only, and erased: game/fighter.ts reaches game/hazards.ts, which imports this file at runtime, so the
// declarations may travel back down but the module must not.
import type { Fighter, FighterWorld, ProjectileSpawnOpts } from './fighter.ts';

/** Default local spawn offset (facing x, up y) used by `projectileOptsFromSpec` when a spec omits offsetX/offsetY. */
export const PROJ_OFFSET_X = 20, PROJ_OFFSET_Y = 40;

/**
 * How a projectile is drawn, and the key of its default body radius: STYLE_R below is `Record<ProjectileStyle, number>`
 * and nothing else may key it, so a misspelled style is a compile error rather than a silent 4px bullet.
 */
export type ProjectileStyle = 'bullet' | 'bolt' | 'bomb' | 'cannonball' | 'claw' | 'explosion' | 'shell' | 'hat' | 'crate' | 'net' | 'watch' | 'stone' | 'fire' | 'rubble';

/** How a projectile moves. 'straight' is the default, and the one kind with no KIND_DEFAULTS row. */
export type ProjectileMotion = 'straight' | 'lob' | 'fuse' | 'boomerang' | 'grapple' | 'puddle';

const STYLE_R: Record<ProjectileStyle, number> = { bullet: 3, bolt: 3, bomb: 6, cannonball: 8, claw: 8, explosion: 20, shell: 5, hat: 8, crate: 12, net: 10, watch: 6, stone: 4, fire: 22, rubble: 10 };
/** One row of KIND_DEFAULTS: what a motion kind fills in wherever the opts leave a field out. Every field optional. */
interface KindDefaults {
  gravity?: number;
  life?: number;
  bounces?: number;
  rest?: boolean;
  maxDist?: number;
  pierce?: number;
  chained?: boolean;
  reelFrames?: number;
  every?: number;
  style?: ProjectileStyle;
}
const KIND_DEFAULTS: Partial<Record<ProjectileMotion, KindDefaults>> = {
  lob: { gravity: 0.5, bounces: 1, rest: true },
  fuse: { rest: true, gravity: 0 },
  boomerang: { maxDist: 160, pierce: 99 },
  grapple: { chained: true, pierce: 0, reelFrames: 12 },
  puddle: { every: 20, gravity: 0, life: 180, style: 'fire' },
};

// ================================ DECLARED SHAPES ===================================================================
// The projectile vocabulary: the opts the constructor reads, the content spec `projectileOptsFromSpec` reads, and the
// slice of the world a projectile touches. Shapes types/content.d.ts already declares (Hit and friends) are used BY
// NAME rather than described a second time -- that file stays the authority for content.

/**
 * The hit a projectile carries: types/content.d.ts's `Hit`, plus the two fields only a projectile's hit has.
 * Both are read outside this file, which is why they are declared rather than left off.
 */
export interface ProjectileHit extends Hit {
  /** Half-depth the box reaches in z; game/combat.ts falls back to 24 when it is absent (`p.hit.z != null ? p.hit.z : 24`). */
  z?: number;
  /** Set by `reflect`: this hit belongs to a projectile that was batted back. */
  reflected?: boolean;
}

/**
 * The part of game/world.ts's `World` a projectile reaches for. It is game/fighter.ts's `FighterWorld` -- the same
 * combat services (boundsFor, areaHit, logEvent) a fighter uses, since a projectile's owner IS a fighter -- plus
 * `addFire`. Structural for the reason given in game/entity.ts: world.ts depends on this file, so the dependency must
 * not run back the other way. `World` satisfies it.
 */
export interface ProjectileWorld extends FighterWorld {
  /**
   * Register a fire at (x, z) with radius r for this frame (world.ts `fires`), so the gas hazards can ignite off it.
   * Optional: `update` tests for it before calling, and a world without hazards need not carry one.
   */
  addFire?(x: number, z: number, r?: number): void;
}

/** Custom renderer (`opts.draw` / `spec.draw`), drawn instead of the `style` switch. */
export type ProjectileDraw = (ctx: CanvasRenderingContext2D, projectile: Projectile, sx: number, sy: number) => void;
/** `opts.onHit` as a function; the string form ('reel') is handled by the core in `onHitTarget`. */
export type ProjectileOnHit = (target: Fighter, world: ProjectileWorld, projectile: Projectile) => void;
/** `opts.onExpire` as a function; the string form ('explode') is handled by the core in `expire`. `byHit` = spent on a target. */
export type ProjectileOnExpire = (world: ProjectileWorld, projectile: Projectile, byHit?: boolean) => void;
/** `opts.onReflect`: run after a batted projectile has been turned around. */
export type ProjectileOnReflect = (projectile: Projectile, attacker: Fighter, world: ProjectileWorld) => void;
/** `opts.onTick`: the puddle tick hook (issue #21 lime patch). */
export type ProjectileOnTick = (world: ProjectileWorld, projectile: Projectile) => void;

/**
 * A content spec's own `onHit` / `onExpire`: the opts hook with the spawning owner appended, which is what
 * `projectileOptsFromSpec` closes over. `owner` is optional so the raw spec hook is still assignable to the
 * three-argument opts hook -- the `out` literal parks it there before the wrapper below replaces it.
 */
export type ProjectileSpecOnHit = (target: Fighter, world: ProjectileWorld, projectile: Projectile, owner?: Fighter | null) => void;
export type ProjectileSpecOnExpire = (world: ProjectileWorld, projectile: Projectile, byHit?: boolean, owner?: Fighter | null) => void;

/** What `box()` returns: the body in x/y only. `hurtbox()` is the same box with the z span added. */
export interface ProjectileBox {
  x0: number; x1: number;
  y0: number; y1: number;
}

/** Everything the constructor reads. Built by hand (game/items.ts, game/hazards.ts, world.areaHit) or by `projectileOptsFromSpec`. */
export interface ProjectileOpts {
  /** fighter that fired it (credited with hits) */
  owner: Fighter | null;
  /** defaults to owner.team (TEAM.NONE + hit.friendly hits everyone) */
  team?: Team;
  /** { damage, type, kbX, kbY, hitstun, z, status, element }; null = this projectile deals no contact hit. */
  hit?: ProjectileHit | null;
  /** motion kind (default straight) */
  kind?: ProjectileMotion;
  style?: ProjectileStyle;
  /** a hit from the other team reverses it (team + owner swap, `damageOnReflect`) */
  reflectable?: boolean;
  /** custom renderer (ctx, projectile, sx, sy) */
  draw?: ProjectileDraw;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** px/frame² pulled off vy; defaults to the motion kind's. */
  gravity?: number;
  /** Frames of flight. */
  life?: number;
  /** Body radius; defaults to STYLE_R[style]. */
  r?: number;
  /** Targets it passes through before expiring. */
  pierce?: number;
  /** Flight distance in x before it expires (or turns back). */
  maxDist?: number;
  color?: string;
  /** 'reel' (grapple) or a hook run after the hit lands. */
  onHit?: 'reel' | ProjectileOnHit | null;
  /** 'explode' (area hit of `radius`) or a hook run at end of life. */
  onExpire?: 'explode' | ProjectileOnExpire | null;
  onReflect?: ProjectileOnReflect | null;
  /** Explosion radius. */
  radius?: number;
  /** Puddle: area hit every N frames. */
  every?: number;
  /** Optional array of TEAM values this projectile may damage. */
  hitsTeams?: Team[] | null;
  /** Grapple: frames the reel-in lasts before the hand-off to the grab. */
  reelFrames?: number;
  /** A thrown weapon / prop lands at the camera / lock edge instead of being culled off-screen (issue #21). */
  stopAtBounds?: boolean;
  /** Which way it points (drawing, and the direction `reflect` bats it); defaults to the sign of vx. */
  facing?: number;
  /** Draws a chain back to the owner (grapple). */
  chained?: boolean;
  /** Floor bounces before expiring (lobbed bombs). */
  bounces?: number;
  /** After the bounces, rest on the floor until life runs out (fuse). */
  rest?: boolean;
  /** Hit data used by the explosion when different from the contact hit. */
  explodeHit?: ProjectileHit | null;
  /** Damage the batted-back copy deals; 0 = 1.5x the original. */
  damageOnReflect?: number;
  /** Speed the batted-back copy flies at; 0 = 1.4x the incoming speed, floored at 5. */
  reflectSpeed?: number;
  /** Puddle tick hook, alongside (or instead of) the area hit. */
  onTick?: ProjectileOnTick;
  /** Overrides the style/hit inference: true = it registers with world.fires, false = it never does. */
  isFire?: boolean;
}

/**
 * A content projectile spec, as authored in a frame's `projectile`, a `spawn.projectile` or `def.projectiles[name]`.
 * The field list is the one the doc block on `projectileOptsFromSpec` (below) spells out; nothing else is read, and
 * there is deliberately no index signature, so a misspelled spec key is a compile error wherever a spec is typed.
 */
export interface ProjectileSpec {
  kind?: ProjectileMotion;
  style?: ProjectileStyle;
  /** px/frame along facing; a 'fuse' / 'puddle' spec defaults to 0, everything else to 6. */
  speed?: number;
  /** Degrees above the horizontal. */
  angle?: number;
  /** Shots per spawn; > 1 fans them by `spreadY` / `spreadZ`. */
  count?: number;
  /** Which shot of a `count` burst this is, when content pins it rather than letting `o.index` say. */
  index?: number;
  spreadY?: number;
  spreadZ?: number;
  vz?: number;
  damage?: number;
  type?: HitType;
  kbX?: number;
  kbY?: number;
  hitstun?: number;
  /** Half-depth in z the contact hit reaches (`hit.z`). */
  zTol?: number;
  friendly?: boolean;
  /** Statuses the contact hit applies (`{ netted: { frames: 90 } }`). `any` per entry: each status names its own fields, same as `Hit.status` in types/content.d.ts. */
  status?: Record<string, any>;
  element?: string;
  /** `hit.sfx`. */
  hitSfx?: string;
  /** No contact hit at all (a fuse bomb that only ever explodes). */
  noContactHit?: boolean;
  explodeHit?: ProjectileHit | null;
  radius?: number;
  bounces?: number;
  rest?: boolean;
  life?: number;
  gravity?: number;
  maxDist?: number;
  pierce?: number;
  chained?: boolean;
  r?: number;
  color?: string;
  /** Lob at the owner's aim point (fighter.ts fills aimX / aimZ from the nearest enemy) rather than straight ahead. */
  aimAt?: boolean;
  /** Frames the aimed lob takes to arrive; the arc is solved for it. */
  flight?: number;
  /** Drop it from `height` above the aim point / ahead of the owner instead of firing it. */
  fromSky?: boolean;
  height?: number;
  /** fromSky: px ahead of the owner the first one lands, and px between consecutive ones. */
  ahead?: number;
  spacing?: number;
  zOffset?: number;
  /** Local spawn offset along facing / up; PROJ_OFFSET_X / PROJ_OFFSET_Y when absent. */
  offsetX?: number;
  offsetY?: number;
  /** false = no muzzle flash (read by fighter.ts spawnFromFrame, not here). */
  muzzle?: boolean;
  reflectable?: boolean;
  damageOnReflect?: number;
  reflectSpeed?: number;
  onReflect?: ProjectileOnReflect;
  onHit?: 'reel' | ProjectileSpecOnHit;
  onExpire?: 'explode' | ProjectileSpecOnExpire;
  reelFrames?: number;
  /** Puddle tick interval in frames. */
  every?: number;
  hitsTeams?: Team[] | null;
  /** Spawn it on TEAM.NONE instead of the owner's team (a fire puddle burns everyone). */
  teamNone?: boolean;
  /** An explicit team wins over `teamNone`. */
  team?: Team;
  draw?: ProjectileDraw;
}

/**
 * The `o` argument of `projectileOptsFromSpec`: game/fighter.ts's `ProjectileSpawnOpts` (the world-space x/y/z, the
 * aim point and the index within a burst) plus the facing world.spawnProjectile forwards.
 */
export interface ProjectileSpawnOverrides extends ProjectileSpawnOpts {
  /** Fire along this facing instead of the owner's. */
  facing?: number;
}

export class Projectile extends Entity {
  // The fields, for the checker only, in constructor order. `declare` because these are the constructor's own
  // assignments and nothing else: a plain field declaration would emit a class field per name (es2022 defines them
  // before the constructor body runs), and giving every instance extra own properties is a runtime change — the same
  // reason game/entity.ts and game/fighter.ts declare theirs this way (game/combat.ts tells a fighter from a prop by
  // `t.hitPart !== undefined`, and content draw hooks read fields like `p.reflected` straight off the instance).
  // `declare` erases under tsc, esbuild and node --experimental-strip-types alike.
  /** Fighter that fired it (credited with hits); null for a stage hazard's own blast. */
  declare owner: Fighter | null;
  /** Name of the owner's animation at the moment of construction (training-room log/frame-data readout). */
  declare fromAnim: string;
  /** Narrower than Entity's: a projectile reaches the combat services and `addFire` through it. */
  declare world: ProjectileWorld | null;
  declare motion: ProjectileMotion;
  declare gravity: number;
  /** Frames left. A boomerang turns back at 0 and keeps counting down (`life < -120` gives up on a lost owner). */
  declare life: number;
  declare style: ProjectileStyle;
  /** Body radius. */
  declare r: number;
  /** Contact hit, already flagged projectile / ranged; null = it deals none (a fuse bomb, a reeling grapple). */
  declare hit: ProjectileHit | null;
  declare pierce: number;
  declare maxDist: number;
  declare color: string;
  declare onHit: 'reel' | ProjectileOnHit | null;
  declare onExpire: 'explode' | ProjectileOnExpire | null;
  declare onReflect: ProjectileOnReflect | null;
  /** Explosion radius. */
  declare radius: number;
  /** Where it was fired from: `maxDist` is measured off startX. */
  declare startX: number;
  declare startZ: number;
  /** Entity ids it has already hit (game/combat.ts adds to it; `turnBack` clears it so a boomerang re-hits on the way home). */
  declare hitTargets: Set<number>;
  /** Draws a chain back to the owner (grapple). */
  declare chained: boolean;
  /** Floor bounces before expiring (lobbed bombs). */
  declare bounces: number;
  /** After the bounces, rest on the floor until life runs out (fuse). */
  declare rest: boolean;
  /** Hit data used by the explosion when different from the contact hit. */
  declare explodeHit: ProjectileHit | null;
  declare reflectable: boolean;
  declare damageOnReflect: number;
  declare reflectSpeed: number;
  /** Batted back at least once; content draw hooks repaint off it. */
  declare reflected: boolean;
  /** Optional array of TEAM values this projectile may damage. */
  declare hitsTeams: Team[] | null;
  /** Puddle: area hit every N frames. */
  declare every: number;
  declare reelFrames: number;
  /** The fighter a grapple hooked, while it is being reeled in. */
  declare reelTarget: Fighter | null;
  declare reelT: number;
  declare drawFn: ProjectileDraw | null;
  /** Grapple: the chain is being pulled back in (no hit, no target). */
  declare retract: boolean;
  /** Boomerang: on its way home to the owner. */
  declare returning: boolean;
  declare spin: number;
  /** world.frame of the last puddle tick. */
  declare lastTick: number;
  /** A thrown weapon / prop lands at the camera / lock edge instead of being culled off-screen (issue #21). */
  declare stopAtBounds: boolean;
  /** Puddle tick hook for a puddle with no direct hit (issue #21 lime patch, throwables.js). */
  declare onTick: ProjectileOnTick | null;
  /** It registers with world.fires every step, so the gas hazards can ignite off it. */
  declare isFire: boolean;

  /** @param {ProjectileOpts & { x, y, z, vx, vy, vz, gravity, life, r, pierce, maxDist, color, onHit, onExpire, radius, every, hitsTeams, reelFrames, stopAtBounds }} o */
  constructor(o: ProjectileOpts) {
    super('projectile');
    this.owner = o.owner || null;
    /** Name of the owner's animation at the moment of construction (training-room log/frame-data readout). */
    this.fromAnim = this.owner && this.owner.anim ? this.owner.anim.name : '';
    this.team = o.team != null ? o.team : (this.owner ? this.owner.team : TEAM.NONE);
    this.motion = o.kind || 'straight';
    const kd: KindDefaults = KIND_DEFAULTS[this.motion] || {};
    this.x = o.x || 0; this.y = o.y || 0; this.z = o.z || 0;
    this.vx = o.vx || 0; this.vy = o.vy || 0; this.vz = o.vz || 0;
    this.gravity = o.gravity != null ? o.gravity : (kd.gravity || 0);
    this.life = o.life != null ? o.life : (kd.life || 90);
    this.style = o.style || kd.style || 'bullet';
    this.r = o.r != null ? o.r : (STYLE_R[this.style] || 4);
    this.hit = o.hit ? { ...o.hit, projectile: true, ranged: true } : null; // flagged so parries / ripostes ignore ranged hits
    this.pierce = o.pierce != null ? o.pierce : (kd.pierce || 0);
    this.maxDist = o.maxDist != null ? o.maxDist : (kd.maxDist || 0);
    this.color = o.color || '#ffe070';
    this.onHit = o.onHit || null;           // 'reel' | (target, world, projectile) => void
    this.onExpire = o.onExpire || null;     // 'explode' | function(world, projectile, byHit)
    this.onReflect = o.onReflect || null;   // (projectile, attacker, world) => void
    this.radius = o.radius || 40;           // explosion radius
    this.startX = this.x; this.startZ = this.z;
    this.hitTargets = new Set();
    this.facing = o.facing || (this.vx < 0 ? -1 : 1);
    this.shadowW = this.style === 'explosion' || this.style === 'fire' ? 0 : Math.max(8, this.r * 2);
    this.zSize = this.r * 2;
    this.chained = o.chained != null ? !!o.chained : !!kd.chained;    // draws a chain back to the owner (grapple)
    this.bounces = o.bounces != null ? o.bounces : (kd.bounces || 0);  // floor bounces before expiring (lobbed bombs)
    this.rest = o.rest != null ? !!o.rest : !!kd.rest;                 // after the bounces, rest on the floor until life runs out (fuse)
    this.explodeHit = o.explodeHit || null; // hit data used by the explosion when different from the contact hit
    this.reflectable = !!o.reflectable;
    this.damageOnReflect = o.damageOnReflect || 0;
    this.reflectSpeed = o.reflectSpeed || 0;
    this.reflected = false;
    this.hitsTeams = o.hitsTeams || null;   // optional array of TEAM values this projectile may damage
    this.every = o.every || kd.every || 0;  // puddle: area hit every N frames
    this.reelFrames = o.reelFrames || kd.reelFrames || 12;
    this.reelTarget = null; this.reelT = 0;
    this.drawFn = typeof o.draw === 'function' ? o.draw : null;
    this.retract = false; this.returning = false;
    this.spin = 0; this.lastTick = -99;
    /** A thrown weapon / prop lands at the camera / lock edge instead of being culled off-screen (issue #21). */
    this.stopAtBounds = !!o.stopAtBounds;
    /** Puddle tick hook for a puddle with no direct hit (issue #21 lime patch, throwables.js): `onTick(world, this)`
     *  fires every `every` frames alongside (or instead of) the ordinary area-hit tick. */
    this.onTick = typeof o.onTick === 'function' ? o.onTick : null;
    // Fire: a puddle (style 'fire') or anything whose hit is fire (`element: 'fire'` / `fire: true` - the Firebrand's tank
    // blast, a fire bomb's explosion, the tallow vat's splash). It registers with world.fires every step so the gas hazards
    // (hazards.js gasSeep / gasCell) can ignite off it; the fire is a fact about the projectile, not about who it hits.
    // `o.isFire` overrides the inference: the thrown lime rake's patch (throwables.js) borrows the fire STYLE for its
    // zero-shadow draw but is quicklime, not flame, and must not light a gas seep.
    this.isFire = o.isFire != null ? !!o.isFire : (this.style === 'fire' || !!(this.hit && (this.hit.element === 'fire' || this.hit.fire)));
  }
  /** World-space AABB of the projectile body (y positive up). */
  box(): ProjectileBox { return { x0: this.x - this.r, x1: this.x + this.r, y0: Math.max(0, this.y - this.r), y1: this.y + this.r }; }
  /** Reflectable projectiles are hittable by the other team (combat.js). */
  override hurtbox(): Aabb | null { if (!this.reflectable || !this.alive || this.removeMe) return null; const b = this.box(); return { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: this.z - this.r, z1: this.z + this.r }; }
  /** May this projectile damage `t`? (team filtering) */
  canHit(t: Entity): boolean {
    if (this.hitsTeams) return this.hitsTeams.includes(t.team) || t.kind === 'prop';
    return t.kind === 'prop' || t.team !== this.team || !!(this.hit && this.hit.friendly);
  }
  override update(world: ProjectileWorld): void {
    this.world = world;
    if (this.isFire && world.addFire) world.addFire(this.x, this.z, this.r);
    if (this.reelTarget) { this.updateReel(world); return; }
    if (this.retract) {
      const o = this.owner, tx = o ? o.x + o.facing * 10 : this.x, ty = o ? o.y + 30 : 0;
      this.x += (tx - this.x) * 0.35; this.y += (ty - this.y) * 0.35;
      if (Math.abs(tx - this.x) < 6) this.removeMe = true;
      return;
    }
    this.life--;
    this.spin += 0.3;
    if (this.motion === 'puddle') { this.updatePuddle(world); return; }
    if (this.returning) {
      const o = this.owner;
      if (!o || !o.alive) { this.removeMe = true; return; }
      const dx = o.x - this.x, dy = (o.y + 40) - this.y, dz = o.z - this.z, d = dhypot(dx, dy) || 1;
      const s = Math.max(4, Math.abs(this.vx) || 5);
      this.x += dx / d * s; this.y += dy / d * s; this.z += dz * 0.2;
      if (d < 12 || this.life < -120) { this.expire(world, false); return; }
      return;
    }
    this.vy -= this.gravity;
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    if (this.y < 0) {
      this.y = 0;
      if (this.bounces > 0 && this.vy < -0.5) { this.bounces--; this.vy = -this.vy * 0.45; this.vx *= 0.6; this.vz *= 0.6; particles.burst('dust', this.x, 0, this.z, 3, { speed: 1.2 }); }
      else if (this.rest && this.life > 0) { this.vy = 0; this.gravity = 0; this.vx = 0; this.vz = 0; }
      else { this.expire(world, false); return; }
    }
    if (this.life <= 0) { if (this.motion === 'boomerang') { this.turnBack(); return; } this.expire(world, false); return; }
    if (this.maxDist && Math.abs(this.x - this.startX) >= this.maxDist) {
      if (this.motion === 'boomerang') { this.turnBack(); return; }
      this.expire(world, false); return;
    }
    const cam = world.camera;
    if (this.stopAtBounds && cam) {
      const lk = cam.locked ? world.boundsFor(this) : { x0: cam.x + CAMERA_MARGIN, x1: cam.x + VIEW_W - CAMERA_MARGIN };
      if (this.x < lk.x0 || this.x > lk.x1) { this.x = clamp(this.x, lk.x0, lk.x1); this.expire(world, false); return; }
    }
    if (cam && (this.x < cam.x - 200 || this.x > cam.x + VIEW_W + 200)) this.removeMe = true;
  }
  turnBack(): void { this.returning = true; this.hitTargets.clear(); this.vx = -this.vx; this.life = 0; }
  /** Fire puddle / area hazard: hits everything inside every `every` frames (or runs a custom `onTick`, e.g. the
   *  lime patch's slow — a puddle with `hit: null` that has nothing to deal an area hit with). */
  updatePuddle(world: ProjectileWorld): void {
    if (this.life <= 0) { this.expire(world, false); return; }
    if (this.life % 4 === 0) particles.burst('ember', this.x + (this.life % 7 - 3) * this.r * 0.25, 2, this.z, 1, { speed: 0.6, up: 1.6, color: this.color === '#ffe070' ? '#ff9a30' : this.color });
    if (this.every && world.frame - this.lastTick >= this.every && (this.hit || this.onTick)) {
      this.lastTick = world.frame;
      if (this.hit) world.areaHit(this.x, this.z, this.r, this.hit, this.owner, { team: this.team, y: 0, silent: true, hitsTeams: this.hitsTeams });
      if (this.onTick) this.onTick(world, this);
    }
  }
  /** Grapple: drag the hooked fighter to the owner, then hand it to the owner's grab. */
  updateReel(world: ProjectileWorld): void {
    const t = this.reelTarget, o = this.owner;
    if (!o || !o.alive || o.dead || !t.alive || t.dead || o.grabTarget || o.inHitstun || o.heldProp) { this.reelTarget = null; this.removeMe = true; return; }
    const off = ((o.def && o.def.grabOffset) || 24) * (o.scale || 1);
    const gx = o.x + o.facing * off;
    t.x += (gx - t.x) * 0.3; t.z += (o.z - t.z) * 0.3; t.y = Math.max(0, t.y * 0.7); t.vx = 0; t.vy = 0;
    t.hurtTimer = Math.max(t.hurtTimer || 0, 3); t.facing = -o.facing;
    if (t.state !== ST.HURT) t.setState(ST.HURT, 'hurt');
    this.x = t.x; this.y = t.y + 30; this.z = t.z;
    if (++this.reelT >= this.reelFrames || Math.abs(gx - t.x) < 4) {
      this.reelTarget = null; this.removeMe = true;
      if (t.grabbableBy && t.grabbableBy(o, { ignoreHitstun: true }) && !t.grabbedBy) { t.x = gx; t.z = o.z; t.hurtTimer = 0; o.startGrab(t); if (world.logEvent) world.logEvent('grab', o, t, { anim: this.fromAnim }); }
      else t.hurtTimer = 8;
    }
  }
  /** Called by combat when the projectile damages a target. */
  onHitTarget(target: Fighter, world: ProjectileWorld): void {
    if (this.style === 'bullet' || this.style === 'shell') particles.burst('spark', this.x, this.y, this.z, 5, { speed: 3 });
    if (this.onHit === 'reel') {
      const o = this.owner;
      if (target.kind !== 'prop' && !target.dead && target.grabbableBy && o && !o.grabTarget && !o.heldProp && target.grabbableBy(o, { ignoreHitstun: true })
        && (o.state === ST.DASH_ATTACK || o.state === ST.ATTACK || o.state === ST.SPECIAL || o.actionable)) {
        this.reelTarget = target; this.reelT = 0; this.hit = null; this.pierce = 99;
        audio.play('hook_yank');
      }
      return;
    }
    if (typeof this.onHit === 'function') this.onHit(target, world, this);
  }
  /**
   * Reflect (bat back) this projectile: reversed along the attacker's facing, swaps team + owner, applies `damageOnReflect`.
   * Fuse bombs become contact-hitting missiles that explode on impact (GDD 3 A3 "any player attack bats the bomb").
   */
  reflect(attacker: Fighter, world: ProjectileWorld): void {
    this.reflected = true; this.reflectable = false;
    this.team = attacker.team; this.owner = attacker;
    this.hitTargets.clear();
    const spd = this.reflectSpeed || Math.max(5, Math.abs(this.vx) * 1.4);
    this.facing = attacker.facing; this.vx = attacker.facing * spd; this.vz = 0;
    this.gravity = this.gravity || (this.motion === 'lob' || this.motion === 'fuse' ? 0.3 : 0);
    this.rest = false; this.bounces = 0; this.startX = this.x; this.maxDist = this.maxDist || 150;
    // lofted bombs get enough lift to actually fly `maxDist` before touching down (GDD 3 A3: batted 150px)
    this.vy = Math.max(this.vy, this.gravity > 0 ? this.gravity * (this.maxDist / spd) / 2 : 2.5);
    this.life = Math.max(this.life, 60); this.retract = false; this.returning = false;
    const base: ProjectileHit = this.hit || this.explodeHit || { damage: 8, type: 'medium', kbX: 5, kbY: 2, hitstun: 18 };
    this.hit = { ...base, projectile: true, ranged: true, friendly: true, damage: this.damageOnReflect || Math.round((base.damage || 8) * 1.5), reflected: true };
    if (this.explodeHit) this.explodeHit = { ...this.explodeHit, friendly: true };
    if (this.onExpire === 'explode') this.pierce = 0;
    particles.burst('spark', this.x, this.y, this.z, 8, { speed: 4 });
    audio.play(this.style === 'bomb' ? 'bomb_bat' : 'parry');
    if (typeof this.onReflect === 'function') this.onReflect(this, attacker, world);
  }
  /** End of life: explode (if configured), or vanish. */
  expire(world: ProjectileWorld, byHit: boolean): void {
    if (this.removeMe) return;
    if (this.onExpire === 'explode') {
      const hit = this.explodeHit || this.hit;
      world.areaHit(this.x, this.z, this.radius, hit, this.owner, { team: this.team, y: this.y, shake: 8, hitsTeams: this.hitsTeams });
      audio.play('explosion');
      particles.burst('ember', this.x, this.y + 4, this.z, 10, { speed: 3, up: 2 });
      particles.burst('smoke', this.x, this.y + 4, this.z, 6, { speed: 1.2, up: 1 });
    } else if (typeof this.onExpire === 'function') this.onExpire(world, this, byHit);
    if (this.chained && !byHit && !this.reelTarget) { this.retract = true; this.hit = null; return; }
    this.removeMe = true;
  }
  override draw(ctx: CanvasRenderingContext2D, cam: CameraView): void {
    const sx = cam.toScreenX(this.x), sy = Math.round(FLOOR_TOP + this.z - this.y + cam.shakeY);
    if (this.drawFn) { this.drawFn(ctx, this, sx, sy); return; }
    const ol = '#1a1018';
    if (this.chained && this.owner && this.owner.rig) {
      const j = jointScreen(this.owner.rig, 'handN');
      line(ctx, j.x, j.y, sx, sy - this.r, '#3a3a44', 4); line(ctx, j.x, j.y, sx, sy - this.r, '#9a9aa8', 2);
    }
    switch (this.style) {
      case 'bullet': case 'shell': {
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(-this.vy, this.vx));
        rrect(ctx, -this.r - 6, -this.r * 0.6, this.r * 2 + 6, this.r * 1.2, 2, this.color, ol, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-1, -1, this.r, 1);
        ctx.restore(); break;
      }
      case 'bolt': { ctx.save(); ctx.translate(sx, sy); ctx.rotate(this.spin); rrect(ctx, -this.r, -this.r, this.r * 2, this.r * 2, 1, this.color, ol, 1); ctx.restore(); break; }
      case 'bomb': case 'cannonball': case 'rubble': {
        circle(ctx, sx, sy - this.r, this.r, this.color, ol, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(sx - this.r * 0.35, sy - this.r * 1.35, this.r * 0.3, 0, Math.PI * 2); ctx.fill();
        if (this.style === 'bomb') { line(ctx, sx + 2, sy - this.r * 2, sx + 5, sy - this.r * 2 - 5, '#8a6a40', 2); if ((this.life & 4) === 0 || (this.life < 40 && (this.life & 2) === 0)) circle(ctx, sx + 5, sy - this.r * 2 - 6, 2, this.life < 40 ? '#ffffff' : '#ffe070', null, 0); }
        break;
      }
      case 'claw': {
        ctx.save(); ctx.translate(sx, sy - this.r); ctx.scale(this.facing, 1);
        pathPoly(ctx, [-6, -6, 8, -2, 2, 0, 8, 2, -6, 6, -2, 0]); paint(ctx, this.color, ol, 1.5);
        ctx.restore(); break;
      }
      case 'crate': {
        rrect(ctx, sx - this.r, sy - this.r * 2, this.r * 2, this.r * 2, 2, this.color === '#ffe070' ? '#9a7040' : this.color, ol, 1);
        ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - this.r + 2, sy - this.r * 2 + 2); ctx.lineTo(sx + this.r - 2, sy - 2); ctx.stroke();
        break;
      }
      case 'net': {
        ctx.save(); ctx.translate(sx, sy - this.r); ctx.rotate(this.spin);
        ctx.strokeStyle = this.color; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let k = -2; k <= 2; k++) { ctx.moveTo(k * 4, -this.r); ctx.lineTo(k * 4, this.r); ctx.moveTo(-this.r, k * 4); ctx.lineTo(this.r, k * 4); }
        ctx.stroke(); ctx.restore(); break;
      }
      case 'watch': {
        circle(ctx, sx, sy - this.r, this.r, (this.life & 8) && this.life < 40 ? '#ffffff' : this.color, ol, 1);
        line(ctx, sx, sy - this.r, sx + this.r * 0.6 * Math.cos(this.spin * 3), sy - this.r + this.r * 0.6 * Math.sin(this.spin * 3), ol, 1);
        break;
      }
      case 'fire': {
        const k = 0.8 + 0.2 * Math.sin(this.spin * 4), a = Math.min(1, this.life / 30);
        ctx.save(); ctx.globalAlpha = 0.75 * a;
        ctx.fillStyle = '#ff5a1f'; ctx.beginPath(); ctx.ellipse(sx, sy, this.r * k, this.r * 0.4 * k, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(sx, sy, this.r * 0.55 * k, this.r * 0.22 * k, 0, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 4; i++) { const px = sx + Math.sin(this.spin * 2 + i * 1.7) * this.r * 0.6, ph = 6 + Math.sin(this.spin * 3 + i) * 4; pathPoly(ctx, [px - 3, sy, px + 3, sy, px, sy - ph]); ctx.fillStyle = i % 2 ? '#ff9a30' : '#ffe070'; ctx.fill(); }
        ctx.restore(); break;
      }
      case 'stone': { circle(ctx, sx, sy - this.r, this.r, this.color, ol, 1); break; }
      case 'hat': { ctx.save(); ctx.translate(sx, sy - this.r); ctx.rotate(this.spin * 2); rrect(ctx, -9, -2, 18, 4, 1, this.color, ol, 1); rrect(ctx, -5, -9, 10, 8, 1, this.color, ol, 1); ctx.restore(); break; }
      case 'explosion': default: break; // explosion FX are spawned on creation
    }
  }
}

/**
 * Build Projectile options from a content spec (frame `projectile`, `spawn.projectile`, or def.projectiles[name]).
 * Spec fields: kind, style, speed, angle, count, spreadY, spreadZ, vz, damage, type, kbX, kbY, hitstun, zTol, friendly, status, element,
 *   hitSfx, noContactHit, explodeHit, radius, bounces, rest, life, gravity, maxDist, pierce, chained, r, color, aimAt, flight, fromSky,
 *   height, ahead, spacing, zOffset, offsetX, offsetY, muzzle, reflectable, damageOnReflect, reflectSpeed, onReflect, onHit ('reel' | fn),
 *   onExpire ('explode' | fn), reelFrames, every (puddle tick), hitsTeams, teamNone, draw(ctx, proj, sx, sy).
 * `o` overrides: x, y, z (world), index/count (fan spreads), aimX/aimZ (lob target), facing.
 * @returns {ProjectileOpts}
 */
export function projectileOptsFromSpec(spec: ProjectileSpec, owner: Fighter | null, o: ProjectileSpawnOverrides = {}): ProjectileOpts {
  const facing = o.facing || (owner ? owner.facing : 1);
  const count = spec.count || 1, i = o.index || 0, idx = spec.index != null ? spec.index : i;
  const angle = ((spec.angle || 0) + (count > 1 ? (i - (count - 1) / 2) * (spec.spreadY || 0) : 0)) * Math.PI / 180;
  const stationary = spec.kind === 'fuse' || spec.kind === 'puddle';
  const speed = spec.speed != null ? spec.speed : (stationary ? 0 : 6);
  const out: ProjectileOpts = {
    owner, team: spec.team != null ? spec.team : (spec.teamNone ? TEAM.NONE : undefined), kind: spec.kind, style: spec.style || 'bullet', color: spec.color, life: spec.life, gravity: spec.gravity,
    pierce: spec.pierce, maxDist: spec.maxDist, bounces: spec.bounces, rest: spec.rest, radius: spec.radius || 40, facing, chained: spec.chained, r: spec.r,
    hit: spec.noContactHit ? null : { damage: spec.damage || 6, type: spec.type || 'light', kbX: spec.kbX != null ? spec.kbX : 3, kbY: spec.kbY || 0, hitstun: spec.hitstun || 14, z: spec.zTol,
      friendly: spec.friendly, status: spec.status, element: spec.element, sfx: spec.hitSfx },
    explodeHit: spec.explodeHit || null, onExpire: spec.onExpire || null, every: spec.every, hitsTeams: spec.hitsTeams,
    reflectable: spec.reflectable, damageOnReflect: spec.damageOnReflect, reflectSpeed: spec.reflectSpeed, reelFrames: spec.reelFrames, draw: spec.draw,
  };
  const ox = owner ? owner.x : 0, oy = owner ? owner.y : 0, oz = owner ? owner.z : 0;
  const aimX = o.aimX != null ? o.aimX : (owner && owner.aimX != null ? owner.aimX : null);
  const aimZ = o.aimZ != null ? o.aimZ : (owner && owner.aimZ != null ? owner.aimZ : null);
  if (spec.fromSky) {
    out.x = spec.aimAt ? (aimX != null ? aimX : ox) : ox + facing * ((spec.ahead || 40) + idx * (spec.spacing || 40));
    out.y = spec.height || 200; out.z = spec.aimAt ? (aimZ != null ? aimZ : oz) : oz + (spec.zOffset || 0); out.vx = 0; out.vy = 0; out.gravity = spec.gravity || 0.5;
  } else if (spec.aimAt) {
    const T = spec.flight || 50, g = spec.gravity != null ? spec.gravity : 0.5;
    out.x = ox + facing * (spec.offsetX != null ? spec.offsetX : PROJ_OFFSET_X); out.y = oy + (spec.offsetY != null ? spec.offsetY : PROJ_OFFSET_Y); out.z = oz;
    const tx = aimX != null ? aimX : ox + facing * 120, tz = aimZ != null ? aimZ : oz;
    out.vx = (tx - out.x) / T; out.vz = (tz - out.z) / T; out.vy = (0.5 * g * T * T - out.y) / T; out.gravity = g;
  } else {
    out.x = ox + facing * (spec.offsetX != null ? spec.offsetX : PROJ_OFFSET_X); out.y = oy + (spec.offsetY != null ? spec.offsetY : PROJ_OFFSET_Y); out.z = oz;
    out.vx = dcos(angle) * speed * facing; out.vy = dsin(angle) * speed;
    out.vz = count > 1 ? (i - (count - 1) / 2) * (spec.spreadZ || 0) : (spec.vz || 0);
  }
  if (o.x != null) out.x = o.x; if (o.y != null) out.y = o.y; if (o.z != null) out.z = o.z;
  if (spec.onHit === 'reel') out.onHit = 'reel';
  // The two `as` below are the typeof guard restated: tsc drops a narrowing of `spec.onHit` / `spec.onExpire` inside
  // the wrapper closure, so the guarded call would not check without it. Type-only; the emitted call is unchanged.
  else if (typeof spec.onHit === 'function') out.onHit = (t, w, proj) => (spec.onHit as ProjectileSpecOnHit)(t, w, proj, owner);
  if (typeof spec.onExpire === 'function') out.onExpire = (w, proj, byHit) => (spec.onExpire as ProjectileSpecOnExpire)(w, proj, byHit, owner);
  if (typeof spec.onReflect === 'function') out.onReflect = spec.onReflect;
  return out;
}
