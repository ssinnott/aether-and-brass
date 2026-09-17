// Entity base class (ARCHITECTURE.md section 5). World space: x along the stage, z depth (0 far .. 140 near), y height (>= 0).
import { FLOOR_TOP, TEAM } from '../constants.ts';
import { drawShadow } from '../art/fx.ts';

let nextId = 1;

/** Base entity. Subclasses override update/draw/hurtbox. */
export class Entity {
  /**
   * @param {'player'|'enemy'|'boss'|'item'|'prop'|'projectile'|'fx'} kind
   */
  constructor(kind = 'fx') {
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
  update(world) {}
  /** Draw at screen coords (feet). */
  draw(ctx, cam) {}
  /** Floor drop shadow. */
  drawShadow(ctx, cam) { if (this.shadowW > 0) drawShadow(ctx, cam, this.x, this.y, this.z, this.shadowW); }
  /** Screen position of the feet (uses the world camera when available). */
  get feetScreen() {
    const cam = this.world ? this.world.camera : null;
    return { sx: cam ? cam.toScreenX(this.x) : Math.round(this.x), sy: Math.round(FLOOR_TOP + this.z - this.y + (cam ? cam.shakeY : 0)) };
  }
  /** World-space AABB (y positive up) or null when not hittable. */
  hurtbox() {
    if (!this.alive) return null;
    return { x0: this.x - this.w / 2, x1: this.x + this.w / 2, y0: this.y, y1: this.y + this.h, z0: this.z - this.zSize / 2, z1: this.z + this.zSize / 2 };
  }
  /** Reset the id counter (tests). */
  static resetIds() { nextId = 1; }
}

/** Convert a local hitbox (feet origin, y negative up, +x toward facing) to a world AABB. */
export function worldHitbox(owner, hb) {
  const f = owner.facing;
  const lx0 = f > 0 ? hb.x : -(hb.x + hb.w);
  return { x0: owner.x + lx0, x1: owner.x + lx0 + hb.w, y0: owner.y - (hb.y + hb.h), y1: owner.y - hb.y, z: hb.z != null ? hb.z : 24 };
}
