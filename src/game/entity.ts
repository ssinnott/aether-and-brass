// Entity base class (ARCHITECTURE.md section 5). World space: x along the stage, z depth (0 far .. 140 near), y height (>= 0).
import { FLOOR_TOP, TEAM } from '../constants.ts';
import { drawShadow } from '../art/fx.ts';

/** One of the TEAM values (constants.ts): players never hurt players, enemies never hurt enemies. */
export type Team = typeof TEAM[keyof typeof TEAM];

/**
 * What an entity is. The six simulation kinds are the ones net/checksum.ts hashes (its KIND table);
 * 'fx' is visual-only and deliberately never hashed.
 */
export type EntityKind = 'player' | 'enemy' | 'boss' | 'item' | 'prop' | 'projectile' | 'fx';

/** World-space axis-aligned box, y positive up (hurtbox()). */
export interface Aabb {
  x0: number; x1: number;
  y0: number; y1: number;
  z0: number; z1: number;
}

/** A local hitbox resolved into world space by `worldHitbox`: a box in x/y with a single z centre. */
export interface WorldHitbox {
  x0: number; x1: number;
  y0: number; y1: number;
  z: number;
}

/** Screen position of an entity's feet, in internal render px. */
export interface FeetScreen { sx: number; sy: number; }

/**
 * The camera surface entities draw through (engine/camera.ts `Camera` satisfies it). Declared
 * structurally rather than imported so the entity core does not depend on the engine layer's own
 * declarations.
 */
export interface CameraView {
  x: number;
  shakeX: number;
  shakeY: number;
  /** Locked to a section's bounds (an arena), rather than following the party. */
  locked: boolean;
  /** World x -> screen x (integer, includes shake). */
  toScreenX(x: number): number;
  shake(intensity?: number, frames?: number): void;
}

/**
 * The part of game/world.ts's `World` that every entity touches. Structural, for the same reason as
 * `CameraView`: entity.ts is the root of the hierarchy and world.ts already depends on it, so the
 * dependency must not run back the other way. `World` satisfies this.
 *
 * A layer that reads more of the world than this says either extends it — `FighterWorld` in
 * game/fighter.ts does — or, for one or two members, merges them in from its own file, which needs
 * no redeclaration of `this.world` anywhere:
 *
 *   declare module './entity.ts' {
 *     interface EntityWorld { spawnEnemy: ((type: string, x: number, z: number) => Entity) | null; }
 *   }
 *
 * Either way the addition is checked against the real World the first time one is passed in.
 */
export interface EntityWorld {
  frame: number;
  camera: CameraView;
  /**
   * The opts bag is `Record<string, any>` rather than world.ts's own `FxOpts`, which is the type the real
   * implementation takes: naming it here would need an import from world.ts, and world.ts already imports THIS
   * file — the back-dependency this interface exists to avoid. Structural width is the price; `World` satisfies
   * it either way, and a wrong key is caught at the call inside world.ts where `FxOpts` is in scope.
   */
  addFx(kind: string, x: number, y: number, z: number, opts?: Record<string, any>): void;
}

let nextId = 1;

/** Base entity. Subclasses override update/draw/hurtbox. */
export class Entity {
  // The fields, for the checker only, in constructor order. `declare` because these are the
  // constructor's own assignments and nothing else: a plain field declaration would emit a class
  // field per name (es2022 defines them before the constructor body runs), which is a runtime
  // change — game/fighter.ts reads `this.shield !== undefined` to ask whether a field has been
  // assigned at all, and game/combat.ts reads `t.hitPart !== undefined` to tell a fighter from a
  // prop. `declare` erases under tsc, esbuild and node --experimental-strip-types alike. Same
  // reasoning (and the same wording) as lib/art/animation.ts's AnimPlayer.
  declare id: number;
  declare kind: EntityKind;
  /** One of the TEAM values; subclasses reassign it. */
  declare team: Team;
  declare x: number;
  declare y: number;
  declare z: number;
  declare vx: number;
  declare vy: number;
  declare vz: number;
  /** +1 facing right, -1 facing left. */
  declare facing: number;
  /** Half-width / height used by the default hurtbox and shadow. */
  declare w: number;
  declare h: number;
  declare zSize: number;
  declare alive: boolean;
  declare removeMe: boolean;
  /** Shadow ellipse width (0 = no shadow). */
  declare shadowW: number;
  /** The world this entity last updated in (null until it does). */
  declare world: EntityWorld | null;

  /**
   * @param {'player'|'enemy'|'boss'|'item'|'prop'|'projectile'|'fx'} kind
   */
  constructor(kind: EntityKind = 'fx') {
    this.id = nextId++;
    this.kind = kind;
    /** @type {typeof TEAM[keyof typeof TEAM]} One of the TEAM values; subclasses reassign it. */
    this.team = TEAM.NONE;
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.facing = 1;
    /** Half-width / height used by the default hurtbox and shadow. */
    this.w = 24; this.h = 60; this.zSize = 20;
    this.alive = true;
    this.removeMe = false;
    /** Shadow ellipse width (0 = no shadow). */
    this.shadowW = 30;
    this.world = null;
  }
  /** Fixed step. */
  update(world: EntityWorld): void {}
  /** Draw at screen coords (feet). */
  draw(ctx: CanvasRenderingContext2D, cam: CameraView): void {}
  /** Floor drop shadow. */
  drawShadow(ctx: CanvasRenderingContext2D, cam: CameraView): void { if (this.shadowW > 0) drawShadow(ctx, cam, this.x, this.y, this.z, this.shadowW); }
  /** Screen position of the feet (uses the world camera when available). */
  get feetScreen(): FeetScreen {
    const cam = this.world ? this.world.camera : null;
    return { sx: cam ? cam.toScreenX(this.x) : Math.round(this.x), sy: Math.round(FLOOR_TOP + this.z - this.y + (cam ? cam.shakeY : 0)) };
  }
  /** World-space AABB (y positive up) or null when not hittable. */
  hurtbox(): Aabb | null {
    if (!this.alive) return null;
    return { x0: this.x - this.w / 2, x1: this.x + this.w / 2, y0: this.y, y1: this.y + this.h, z0: this.z - this.zSize / 2, z1: this.z + this.zSize / 2 };
  }
  /** Reset the id counter (tests). */
  static resetIds(): void { nextId = 1; }
}

/** Convert a local hitbox (feet origin, y negative up, +x toward facing) to a world AABB. */
export function worldHitbox(owner: Entity, hb: Hitbox): WorldHitbox {
  const f = owner.facing;
  const lx0 = f > 0 ? hb.x : -(hb.x + hb.w);
  return { x0: owner.x + lx0, x1: owner.x + lx0 + hb.w, y0: owner.y - (hb.y + hb.h), y1: owner.y - hb.y, z: hb.z != null ? hb.z : 24 };
}
