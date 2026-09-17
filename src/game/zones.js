// Environment zones: the stretches of a board that act on whatever stands in them -- molten channels, open
// rails, conveyors, gusts, spoil, net decking and the solid obstacles -- plus ZoneFlash, the timed warning
// painted over one. Split out of game/hazards.js, which had grown to twice the ~700-line contract. The seam is
// real: a Hazard is a thing at a POINT that cycles (tell -> active -> recovery), a Zone is a SPAN that is
// simply true of the floor while you stand in it, and nothing crossed between them but two doc comments.
import { FLOOR_TOP, VIEW_W, ST, Z_MIN, Z_MAX } from '../constants.js';
import { Entity } from './entity.js';
import { Prop, ringOut } from './items.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { rng } from '../engine/rng.js';
import { clamp } from '../engine/math.js';
import { floatText, drawWind, windDrag, WIND_COLOR, WIND_BANNER } from '../art/fx.js';
import { rrect, circle, poly, pathPoly } from '../art/shapes.js';
import { tones } from '../art/props.js';
import { OL, ROSE, AIR_STATES, TELL_RED } from './hazards.js';  // the board ink, tailings rose and air-state set both halves paint with

const MOLTEN_Z = 20, RAIL = 12, DAIS_EVERY = 30, DAIS_DMG = 4, CONVEYOR_EVERY = 240;
/** How far past the lip a scalded player is thrown, and the forward drift that carries them there. */
const MOLTEN_EJECT = 12, MOLTEN_EJECT_VZ = 4;
/** Edge shove: a body knocked down / thrown within EDGE_LANE px of a lethal edge by an attacker standing deeper in the lane drifts
 *  toward that edge at EDGE_VZ px/f while airborne (hits carry no z knockback, so this is what makes "knock them in" reachable). */
const EDGE_LANE = 30, EDGE_VZ = 2.4;
const MOLTEN_HIT = { damage: 10, type: 'knockdown', kbX: 0, kbY: 5, hitstun: 20, sfx: 'burn' };
/** Gust defaults (issue #27 Mooring Spine): a 45f rising wind, then 40f of `push` px/f drift in z for grounded fighters. */
const GUST = { period: 420, tell: 45, active: 40, push: 1.3, warn: 'GALE', warnSub: 'THE WIND HAS THE DECK' };
/** Spoil: grounded movement inside the patch keeps this fraction of itself per frame (the ground gives under every step). */
const SPOIL_DAMP = 0.55;
/** Net decking: a heavy landing sags a square NET_SAG frames, then it is open NET_OPEN frames. Players who drop lose NET_DROP_FRAC
 *  of max HP and are set NET_CLEAR px outside the square - health, not a life (issue #27 "a ring-out variant that costs health"). */
const NET_SAG = 10, NET_OPEN = 60, NET_DROP_FRAC = 0.08, NET_CLEAR = 10, NET_SQUARE = { w: 60, d: 30 };
/** Solid obstacles (issue #31): the default wall height, low enough that a running jump clears it. A gap reuses the
 *  Crop Loft's net-square ejectors wholesale, so it also costs NET_DROP_FRAC of max HP — the board 4 rule that a fall
 *  through the floor costs health, not a life, applied everywhere. */
const SOLID_HEIGHT = 44;

/**
 * Open-rails edge loss (issue #21, GDD 7): a thrown weapon / prop still in flight is marked `lost` and made to
 * expire in place (its own onExpire — throwables.js landWeapon / landProp — reads `lost` and skips both the
 * pickup and the shatter FX, so it neither lands nor breaks, it is just gone); a resting weapon pickup that has
 * drifted past the edge is simply removed. Unlike `ringOut` this is cargo, not a body: no score, no death FX.
 */
function loseOverEdge(world, e) {
  if (e.kind === 'projectile') { e.lost = true; e.expire(world, false); } else e.removeMe = true;
  particles.burst('dust', e.x, 0, e.z, 6, { speed: 1.5, up: 1 });
}

/**
 * A floor zone with a rule: molten (Foundry Row back edge), rails (funicular railings / open decks), daisVents (boss dais edges),
 * conveyor (cargo-bay front strip), gust (Mooring Spine deck wind), spoil (tailings patches), netGive (Crop Loft net
 * squares). Drawn behind entities (z = -5).
 */
export class Zone extends Entity {
  /**
   * @param {{ type: 'molten'|'rails'|'daisVents'|'conveyor'|'gust'|'spoil'|'netGive', x0: number, x1: number, z0?: number, z1?: number, active?: boolean, color?: string, open?: boolean,
   *   period?: number, tell?: number, push?: number, dir?: number, offset?: number, warn?: string, warnSub?: string, squares?: {x:number, z:number, w?:number, d?:number}[] }} spec
   *   gust { period 420, tell 45, active (frames) 40, push 1.3, dir 0|1|-1, warn 'GALE', warnSub } | spoil { z0, z1 } | netGive { squares }
   *   rails { open: true } (issue #21) also discards thrown weapons / props and weapon pickups that drift over the edge (loseOverEdge)
   */
  constructor(spec) {
    super('fx');
    // `solid` (issue #31) is the one type whose z band defaults to the WHOLE floor: a wall or a gap that silently
    // began at z 100 would be an obstacle the author never placed. Every other type keeps the back-edge default.
    const backEdge = spec.type === 'solid' ? Z_MIN : 100;
    this.type = spec.type; this.x0 = spec.x0; this.x1 = spec.x1; this.z0 = spec.z0 != null ? spec.z0 : backEdge;
    this.x = (spec.x0 + spec.x1) / 2; this.z = -5; this.shadowW = 0;
    this.forced = !!spec.active;
    /** issue #21 GDD 7: a `rails` zone with no bulwark at all (open air past the edge, not a railing) also
     *  discards thrown weapons / props and dropped weapon pickups that drift past it (updateRails). */
    this.open = !!spec.open;
    this.color = spec.color || '';   // daisVents edge glow: the board's own energy colour (see draw())
    this.burns = new Map();        // fighter id -> { f, ticks, t }
    this.wasAir = new Map();       // enemy id -> was airborne last frame (edge shove detection)
    this.t = 0; this.lastCrate = 0;
    // gust: its own tell / active cycle (spec.active is the frame count here, not the molten/rails force flag)
    this.period = spec.period || GUST.period; this.tell = spec.tell != null ? spec.tell : GUST.tell;
    this.activeFrames = typeof spec.active === 'number' ? spec.active : GUST.active;
    this.push = spec.push != null ? spec.push : GUST.push; this.dir = spec.dir || 0; this.offset = spec.offset || 0;
    if (this.type === 'gust') this.forced = false;
    this.phase = 'idle'; this.phaseT = 0; this.gustDir = 1;
    // the one-shot "this is the wind, not you" banner (updateGust); '' on `warn` turns it off for that zone
    this.warn = spec.warn != null ? spec.warn : GUST.warn;
    this.warnSub = spec.warnSub != null ? spec.warnSub : GUST.warnSub;
    this.announced = false;
    // spoil: the z band, and where every grounded fighter inside it stood last frame
    this.z1 = spec.z1 != null ? spec.z1 : Z_MAX;
    this.last = new Map();
    // netGive: the marked squares and per-fighter "was falling" flags for landing detection
    this.squares = (spec.squares || []).map((s) => ({ x: s.x, z: s.z, w: s.w || NET_SQUARE.w, d: s.d || NET_SQUARE.d, sag: 0, open: 0 }));
    this.landing = new Map();
    // solid (issue #31): `height` is the y a body must clear; 0 means a floor gap. `breakable` makes the block
    // conditional on a `barricade` Prop inside the rectangle still standing — the Prop owns the hp, the hit
    // reaction, the drops and the break FX, and (unlike a Zone, which is kind 'fx') its hp is hashed by the
    // desync canary. `isSolid` is what fighter.js / enemy.js / bot.js scan for; `fell` de-dupes gap drops.
    this.isSolid = this.type === 'solid';
    this.height = spec.height != null ? spec.height : SOLID_HEIGHT;
    this.breakable = !!spec.breakable;
    this.prop = null; this.propChecked = false;
    // A wall is drawn as a standing body (drawSolid), so it has to SORT like one -- at its own back edge, which is
    // the one depth that both hides what is genuinely behind it and lets everything from that edge forward draw
    // over it: a fighter walking past its face, and the one mid-jump over it. Nothing reads a Zone's `z` but the
    // depth sort (world.js depthCompare) and Entity.screen, and `fx` is not hashed by net/checksum.js, so this is
    // render order and nothing else. A gap is a hole in the deck and stays where every other zone is, under
    // everything that walks on it.
    if (this.isSolid && this.height > 0) this.z = this.z0;
  }
  /**
   * A solid blocks unless it is a barricade whose Prop has been broken. Non-breakable solids always block.
   * `prop.solid` rather than `prop.alive` is the test: Prop.break() clears `solid` on the frame the hit lands but
   * leaves the body alive through its break animation, and a gate you have just smashed has to open now.
   */
  get blocking() { return !this.breakable || !!(this.prop && this.prop.solid && this.prop.alive && !this.prop.removeMe); }
  /** Floor plan of a solid, for enemy pathing / the autopilot. Permanent while blocking — a wall has no quiet phase. */
  dangerBox() {
    if (!this.isSolid || !this.blocking) return null;
    return { x0: this.x0, x1: this.x1, z0: this.z0, z1: this.z1 };
  }
  /** Is (x, z) inside this zone's rectangle? */
  inBox(x, z) { return x >= this.x0 && x <= this.x1 && z >= this.z0 && z <= this.z1; }
  hurtbox() { return null; }
  inX(e) { return e.x >= this.x0 && e.x <= this.x1; }
  /** Enemy `f` just entered KNOCKDOWN / THROWN near a lethal edge (low = z of the back edge, high = z of the front edge, null = none):
   *  shove it over when the attacker stood deeper in the lane than the body. */
  edgeShove(f, low, high) {
    const air = f.state === ST.THROWN || f.state === ST.KNOCKDOWN;
    const was = this.wasAir.get(f.id);
    if (f.dead) this.wasAir.delete(f.id); else this.wasAir.set(f.id, air);
    if (!air || was || f.dead) return;
    const by = f.thrownBy || f.lastHitBy;
    if (!by || by.kind !== 'player') return;
    if (low != null && f.z < low + EDGE_LANE && by.z > f.z + 4) f.vz = -EDGE_VZ;
    else if (high != null && f.z > high - EDGE_LANE && by.z < f.z - 4) f.vz = EDGE_VZ;
  }
  /** The zone applies only while its arena's boss is up (conveyor / dais) or always (molten / rails). */
  get active() {
    if (this.forced) return true;
    const b = this.world && this.world.boss;
    if (this.type === 'conveyor') return !!(b && b.bossKind === 'midboss' && !b.defeated);
    if (this.type === 'daisVents') return !!(b && b.bossKind === 'boss' && !b.defeated);
    return true;
  }
  /** Is any of the zone's span on screen (sfx gate)? */
  onScreen(cam) { return this.x1 >= cam.x - 40 && this.x0 <= cam.x + VIEW_W + 40; }
  update(world) {
    this.world = world; this.t++;
    switch (this.type) {
      case 'molten': this.updateMolten(world); break;
      case 'rails': this.updateRails(world); break;
      case 'daisVents': this.updateDais(world); break;
      case 'conveyor': this.updateConveyor(world); break;
      case 'gust': this.updateGust(world); break;
      case 'spoil': this.updateSpoil(world); break;
      case 'netGive': this.updateNetGive(world); break;
      case 'solid': this.updateSolid(world); break;
      default: break;
    }
  }
  /**
   * A solid's per-frame work is only ever two things; the WALL case is resolved in Fighter.physics instead, because
   * zones update before fighters and a hard collision applied from here would be corrected a frame late.
   *   breakable  find the barricade Prop that holds the block up, once, and let the wave lock read it.
   *   height 0   a hole in the deck: whoever is standing in it falls, and cargo that lands in it is gone. This is
   *              the Crop Loft's netGive rule with the square replaced by the zone's own rectangle, so the three
   *              existing ejectors (ringOut / dropPlayer / loseOverEdge) do all of the work.
   */
  updateSolid(world) {
    if (this.breakable && !this.propChecked) {
      this.propChecked = true;
      for (const e of world.entities) { if (e.kind === 'prop' && e.barricade && this.inBox(e.x, e.z)) { this.prop = e; break; } }
    }
    if (this.height > 0) return;
    const rect = this.asRect();
    // No edgeShove here. Its band is one whose danger lies OUTSIDE it -- `rails` passes (RAIL, Z_MAX - RAIL) and
    // `molten` passes (MOLTEN_Z, null) -- and it pushes bodies PAST those edges. A gap's danger is INSIDE
    // [z0, z1], so feeding it the rectangle's own bounds shoves bodies away from the hole, not into it. Knocking
    // an enemy in is reachable anyway: the x knockback of a hit carries a body across the rectangle, and a throw
    // aimed along it lands the body inside, where the inBox test below rings it out.
    for (const f of world.fighters) {
      if (f.dead || f.y > 0 || f.grabbedBy || f.kind === 'boss' || !this.inBox(f.x, f.z)) continue;
      // dropPlayer sets the body down OUTSIDE the rectangle, so there is no repeat next frame and no de-dupe to keep
      if (f.kind === 'player') this.dropPlayer(world, f, rect);
      else if (ringOut(world, f, 'rail', 0)) { f.vy = 2.5; f.vx = 0; f.vz = 0; }
    }
    for (const e of world.entities) {
      // e.y > 0 for the same reason the fighter loop above skips airborne bodies: a gap is a hole in the deck,
      // not open air above it, so cargo still in flight crosses it. What LANDS in it is gone.
      if (e.removeMe || e.y > 0 || !this.inBox(e.x, e.z)) continue;
      const cargo = (e.kind === 'projectile' && (e.thrownWeapon || e.thrownProp)) || (e.kind === 'item' && e.weaponId);
      if (cargo) loseOverEdge(world, e);
    }
  }
  /** The zone's rectangle in the {x, z, w, d} shape dropPlayer expects (it was written for a netGive square). */
  asRect() { return { x: (this.x0 + this.x1) / 2, z: (this.z0 + this.z1) / 2, w: this.x1 - this.x0, d: this.z1 - this.z0 }; }
  updateMolten(world) {
    for (const f of world.fighters) {
      if (!this.inX(f) || f.z >= MOLTEN_Z || f.grabbedBy) continue;
      if (f.kind === 'player') {
        // the burn rides on the scald landing: a player still invulnerable (get-up i-frames) is only shoved clear
        if (!f.dead && f.takeHit(MOLTEN_HIT, null)) this.burns.set(f.id, { f, ticks: 2, t: 0 });
        f.z = MOLTEN_Z + MOLTEN_EJECT; f.vz = MOLTEN_EJECT_VZ;
        particles.burst('ember', f.x, 6, f.z, 8, { speed: 3, up: 3, color: '#FFB347' });
      } else if (f.kind === 'boss') { f.z = MOLTEN_Z + 1; }
      else if (AIR_STATES.has(f.state) || f.airborne || f.state === ST.LYING) ringOut(world, f, 'molten');
      else f.z = MOLTEN_Z + 1;
    }
    for (const f of world.fighters) if (f.kind === 'enemy' && this.inX(f)) this.edgeShove(f, MOLTEN_Z, null);
    for (const b of this.burns.values()) {
      if (++b.t % 20 === 0) { b.f.takeHitRaw(2, 'light'); particles.burst('ember', b.f.x, 20, b.f.z, 3, { speed: 1.5, up: 2 }); if (--b.ticks <= 0 || b.f.dead) this.burns.delete(b.f.id); }
    }
    // items that fell into the channel drift back to the lip so drops from ring-outs stay collectable
    if ((this.t & 3) === 0) for (const e of world.entities) if (e.kind === 'item' && this.inX(e) && e.z < MOLTEN_Z + 4) e.z = MOLTEN_Z + 6;
  }
  updateRails(world) {
    for (const f of world.fighters) {
      if (!this.inX(f)) continue;
      if (f.kind === 'enemy') this.edgeShove(f, RAIL, Z_MAX - RAIL);
      const over = f.z < RAIL ? -1 : f.z > Z_MAX - RAIL ? 1 : 0;
      if (!over) continue;
      if (f.kind === 'enemy' && (f.state === ST.THROWN || (f.state === ST.KNOCKDOWN && f.y > 4))) { ringOut(world, f, 'rail', over); continue; }
      f.z = over < 0 ? RAIL : Z_MAX - RAIL;
      if (f.vz * over > 0) f.vz = 0;
    }
    // Open deck (no railing at all, issue #21 GDD 7): a thrown weapon / prop still in flight, or a weapon pickup
    // that has drifted, past the same front/back band falls off the edge instead of landing or staying collectable.
    if (!this.open) return;
    for (const e of world.entities) {
      if (e.removeMe || !this.inX(e)) continue;
      const cargo = (e.kind === 'projectile' && (e.thrownWeapon || e.thrownProp)) || (e.kind === 'item' && e.weaponId);
      if (!cargo) continue;
      if (e.z < RAIL || e.z > Z_MAX - RAIL) loseOverEdge(world, e);
    }
  }
  /** Boss dais (GDD 5.2): the world's floor band shrinks 20px per phase (stage.js calls shrinkBand); the closed strips are steam
   *  vents: 4 dmg every 30f to anyone inside, jets along both edges. It is a "get back on the dais" nudge, not a kill zone —
   *  the band can close faster than a knocked-down player can stand up. */
  updateDais(world) {
    if (!this.active) return;
    const band = world.floorBand || { z0: 0, z1: Z_MAX };
    if (band.z0 <= 0 && band.z1 >= Z_MAX) return;
    if ((this.t & 1) === 0) {
      const x = world.camera.x + rng.range(10, VIEW_W - 10), back = rng.chance(0.5);
      particles.burst('steam', x, 4, back ? rng.range(0, band.z0) : rng.range(band.z1, Z_MAX), 1, { speed: 0.6, up: 2.4, color: '#d8fffb', sizeJitter: 1 });
    }
    if (this.t % DAIS_EVERY) return;
    for (const f of world.fighters) {
      if (f.kind === 'boss' || f.dead || !this.inX(f)) continue;
      if (f.z < band.z0 || f.z > band.z1) { f.takeHitRaw(DAIS_DMG, 'light'); particles.burst('steam', f.x, 20, f.z, 4, { speed: 1.5, up: 2.5 }); }
    }
  }
  updateConveyor(world) {
    if (!this.active) return;
    for (const e of world.entities) {
      if (e.removeMe || e.z < this.z0 || !this.inX(e)) continue;
      const k = e.kind;
      if (k === 'player' || k === 'enemy' || k === 'boss') { if (!e.grabbedBy && e.y <= 0 && e.state !== ST.DEAD) e.x -= 1; }
      else if (k === 'prop' || k === 'item') {
        if (k === 'prop' && (e.state === 'breaking' || e.state === 'rolling')) continue;
        e.x -= 1;
        if (e.rider && e.x < this.x0 + 8) { e.removeMe = true; particles.burst('dust', e.x, 0, e.z, 5, { speed: 1.5, up: 1 }); }
      }
    }
    if (this.t - this.lastCrate >= CONVEYOR_EVERY) {
      this.lastCrate = this.t;
      // an always-on belt (`active: true`, board 3's cart lane) runs for the whole board: it only feeds crates and clunks
      // while the camera can see it, like every other periodic hazard, so the ledger house does not hear the yard
      if (!this.onScreen(world.camera)) return;
      world.add(new Prop('crate', this.x1 - 20, this.z0 + 20, { drops: rng.chance(0.25) ? 'meatPie' : ['brassCog', 'brassCog'], rider: true }));
      audio.play('hydraulic');
    }
  }
  /**
   * Gust (Mooring Spine): a rising wind for `tell` frames, then every grounded fighter in the span drifts `push` px/f in z
   * for `active` frames, clamped to the floor band. It never throws anyone: on a railed deck the rails zone clamps at the
   * rail (and only a THROWN / airborne knockdown body goes over), so the gust is what walks you toward the edge, not over it.
   * `dir` 0 alternates per cycle so the deck is never pushed the same way twice running.
   *
   * NAMING IT. A shove nobody can attribute is not a mechanic, it is a controller fault: the first time a gust tells
   * WITH ITS SPAN ON SCREEN it puts its name on the HUD (`warn` / `warnSub`) and then never again. Once per zone, not
   * once per section: StageRunner.start builds every section's zones up front and they live for the whole board, so a
   * per-section flag would be a lie — but a board that authors a gust per section (stage2 does, and gives them
   * different words) gets one banner per gust, which is the behaviour that was wanted anyway. That, `drawWind`'s
   * chevrons holding through the active phase, and `windDrag`'s dust off the feet of whoever is being moved are three
   * answers to one question, and the player needs all three: what, which way, and is it happening to ME.
   */
  updateGust(world) {
    const g = (world.frame + this.offset) % this.period, prev = this.phase;
    const tellAt = this.period - this.activeFrames - this.tell, activeAt = this.period - this.activeFrames;
    this.phase = g >= activeAt ? 'active' : g >= tellAt ? 'tell' : 'idle';
    // ...but only while the party is in the section this gust belongs to. Every section's zones are in the world
    // from StageRunner.start and a gust spans exactly its section, so the runner's own test for which section this
    // is -- the camera centre -- is the test for whether this is my wind. Without it a boss arena narrower than a
    // screen leaks the next deck's gale into this room: Camera.lock widens the Gas-Halls winch bay to a full
    // screen, so the Cold Sovereign's span was on camera for the whole Skree fight and the deck's banner was spent
    // a section early. Forced to idle rather than returned, so drawWeather goes quiet with it; recomputed from
    // world.frame every step, so nothing is stored and lockstep peers stay identical.
    const mid = world.camera.x + VIEW_W / 2;
    if (mid < this.x0 || mid > this.x1) this.phase = 'idle';
    this.phaseT = this.phase === 'active' ? g - activeAt : this.phase === 'tell' ? g - tellAt : g;
    if (this.phase !== 'idle' && prev === 'idle') this.gustDir = this.dir || ((Math.floor((world.frame + this.offset) / this.period) & 1) ? -1 : 1);
    const heard = this.onScreen(world.camera);
    if (this.phase === 'tell' && prev !== 'tell' && heard) {
      audio.play('gale', { volume: 0.5 });
      if (!this.announced && this.warn && typeof world.announce === 'function') { this.announced = true; world.announce(this.warn, this.warnSub, WIND_BANNER); }
    }
    if (this.phase === 'active' && prev !== 'active' && heard) audio.play('gale');
    if (this.phase !== 'active') return;
    const band = world.floorBand, dz = this.push * this.gustDir;
    for (const f of world.fighters) {
      if (!this.inX(f) || f.y > 0 || f.grabbedBy || f.dead || f.kind === 'boss' || f.status.netted) continue;
      f.z = clamp(f.z + dz, band.z0, band.z1);
      windDrag(f, world.frame, 0, this.gustDir);
    }
  }
  /**
   * Spoil (tailings): the ground gives under every step. Grounded fighters inside the patch keep only SPOIL_DAMP of the
   * distance they covered since last frame - walking, knockback slides and dash attacks alike - so the patch slows
   * without touching anyone's speed stat. Last positions are kept per fighter id and pruned as bodies leave or die.
   */
  updateSpoil(world) {
    const last = this.last;
    for (const f of world.fighters) {
      const inside = this.inX(f) && f.z >= this.z0 && f.z <= this.z1 && f.y <= 0 && !f.grabbedBy && f.kind !== 'boss';
      const p = last.get(f.id);
      if (!inside) { if (p) last.delete(f.id); continue; }
      if (p) {
        const dx = f.x - p.x, dz = f.z - p.z;
        if (dx || dz) {
          f.x = p.x + dx * SPOIL_DAMP; f.z = p.z + dz * SPOIL_DAMP;
          if ((world.frame + f.id) % 6 === 0 && Math.abs(dx) + Math.abs(dz) > 0.3) particles.burst('dust', f.x, 0, f.z + 4, 1, { speed: 0.6, up: 0.4, color: '#5a3a4a' });
        }
        p.x = f.x; p.z = f.z;
      } else last.set(f.id, { x: f.x, z: f.z });
    }
    if ((world.frame & 31) === 0) for (const id of last.keys()) { let seen = false; for (const f of world.fighters) if (f.id === id) { seen = true; break; } if (!seen) last.delete(id); }
  }
  /**
   * Net decking (Crop Loft): a knockdown / thrown body hitting the deck inside a marked square sags it for NET_SAG frames
   * and then it is open for NET_OPEN: enemies standing in it drop through (a ring-out, +200), players lose NET_DROP_FRAC of
   * max HP, are knocked down and set on the nearest edge. Airborne bodies over an open square are fine until they land.
   */
  updateNetGive(world) {
    for (const f of world.fighters) {
      if (f.dead) { this.landing.delete(f.id); continue; }
      const air = f.y > 0 && AIR_STATES.has(f.state);
      const was = this.landing.get(f.id);
      this.landing.set(f.id, air);
      if (!was || air || f.y > 0 || !this.inX(f)) continue;    // a falling body just hit the deck
      const sq = this.squareAt(f.x, f.z);
      if (sq && !sq.open && !sq.sag) { sq.sag = NET_SAG; audio.play('net'); particles.burst('dust', sq.x, 0, sq.z, 6, { speed: 1.2, up: 0.6 }); }
    }
    for (const sq of this.squares) {
      if (sq.sag > 0 && --sq.sag === 0) { sq.open = NET_OPEN; audio.play('prop_break'); particles.burst('debris', sq.x, 2, sq.z, 8, { speed: 2, up: 2, color: '#8a7040' }); }
      if (sq.open <= 0) continue;
      sq.open--;
      for (const f of world.fighters) {
        if (f.y > 0 || f.grabbedBy || f.dead || f.kind === 'boss' || !this.inSquare(sq, f.x, f.z)) continue;
        if (f.kind === 'player') this.dropPlayer(world, f, sq);
        else if (ringOut(world, f, 'rail', 0)) { f.vy = 2.5; f.vx = 0; f.vz = 0; }   // the rail pop is replaced by a short drop
      }
    }
  }
  inSquare(sq, x, z) { return Math.abs(x - sq.x) <= sq.w / 2 && Math.abs(z - sq.z) <= sq.d / 2; }
  squareAt(x, z) { for (const sq of this.squares) if (this.inSquare(sq, x, z)) return sq; return null; }
  /** A player fell through: knockdown that costs health (not a life) and a reposition to the nearest edge that is still floor. */
  dropPlayer(world, p, sq) {
    const band = world.floorBand;
    const edges = [
      { z: sq.z - sq.d / 2 - NET_CLEAR, d: p.z - (sq.z - sq.d / 2) }, { z: sq.z + sq.d / 2 + NET_CLEAR, d: (sq.z + sq.d / 2) - p.z },
      { x: sq.x - sq.w / 2 - NET_CLEAR, d: p.x - (sq.x - sq.w / 2) }, { x: sq.x + sq.w / 2 + NET_CLEAR, d: (sq.x + sq.w / 2) - p.x },
    ].filter((e) => e.z == null || (e.z >= band.z0 && e.z <= band.z1)).sort((a, b) => a.d - b.d);
    const e = edges[0] || { x: sq.x + sq.w / 2 + NET_CLEAR };
    if (e.z != null) p.z = e.z; else p.x = e.x;
    p.vx = 0; p.vz = 0;
    const dmg = Math.max(1, Math.round(p.maxHp * NET_DROP_FRAC));
    // otg: the body that opened the square is usually still LYING on it, and a lying fighter ignores hits without it
    p.takeHit({ damage: dmg, type: 'knockdown', kbX: 0, kbY: 5, hitstun: 20, fromX: sq.x, sfx: 'net', otg: true }, null);
    floatText(p.x, p.y + p.h + 14, p.z, 'THROUGH!', ROSE, 1);
    particles.burst('debris', sq.x, 2, sq.z, 6, { speed: 1.6, up: 1.8, color: '#8a7040' });
  }
  draw(ctx, cam) {
    const sy0 = FLOOR_TOP + cam.shakeY, f = this.t;
    const x0 = Math.max(0, cam.toScreenX(this.x0)), x1 = Math.min(VIEW_W, cam.toScreenX(this.x1));
    if (x1 <= x0) return;
    if (this.type === 'molten') {
      // heat haze + surface glints over the backdrop's channel band
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(f * 0.1); ctx.fillStyle = '#ffd27a'; ctx.fillRect(x0, sy0, x1 - x0, MOLTEN_Z); ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let x = x0 + ((f >> 1) % 40); x < x1; x += 40) ctx.fillRect(x, sy0 + 6 + ((x >> 3) & 6), 6, 1);
      if ((f & 7) === 0) { const ex = this.x0 + ((f * 37) % (this.x1 - this.x0)); if (cam.isVisible(ex, 0)) particles.burst('ember', ex, 4, 10, 1, { speed: 0.8, up: 1.4 }); }
    } else if (this.type === 'daisVents' && this.active) {
      // glow lines along the closed band edges (the world paints the vent strips themselves). The colour is the
      // BOARD's energy colour, not a constant: aether cyan is Concordat machinery (GDD 1), so a board that has no
      // Concordat left on it passes its own — `{ type: 'daisVents', color: '#D8FF6E' }` on the Chandlery's floor.
      const band = this.world.floorBand || { z0: 0, z1: Z_MAX };
      ctx.fillStyle = this.color || '#4DF0E0'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(f * 0.3);
      if (band.z0 > 0) ctx.fillRect(x0, sy0 + band.z0 - 1, x1 - x0, 2);
      if (band.z1 < Z_MAX) ctx.fillRect(x0, sy0 + band.z1 - 1, x1 - x0, 2);
      ctx.globalAlpha = 1;
    } else if (this.type === 'conveyor') {
      // belt over the front strip: dark rubber with brass chevrons that scroll left while it runs, rollers at the edges
      const y = sy0 + this.z0, h = Z_MAX - this.z0, belt = tones('#2a2a30');
      ctx.globalAlpha = 0.9; ctx.fillStyle = belt.base; ctx.fillRect(x0, y, x1 - x0, h);
      ctx.fillStyle = belt.hi; ctx.fillRect(x0, y, x1 - x0, 2); ctx.fillStyle = belt.sh; ctx.fillRect(x0, y + h - 4, x1 - x0, 4);
      const off = this.active ? (f % 24) : 0;
      ctx.fillStyle = tones('#C9963A').sh;
      for (let x = x0 - 24 + (24 - off); x < x1; x += 24) { pathPoly(ctx, [x, y + 6, x + 8, y + 6, x + 16, y + h / 2, x + 8, y + h - 6, x, y + h - 6, x + 8, y + h / 2]); ctx.fill(); }
      for (let x = x0 + 4; x < x1; x += 60) rrect(ctx, x, y - 4, 8, h + 8, 3, '#4a4a52', OL, 1);
      ctx.globalAlpha = 1;
    } else if (this.type === 'spoil') {
      // a patch of slumped tailings: dark slag with rose glints, inked like a prop so it reads as ground, not a shadow
      const y = sy0 + this.z0, h = this.z1 - this.z0, slag = tones('#4a2f3c');
      rrect(ctx, x0, y, x1 - x0, h, 6, slag.base, OL, 1);
      ctx.fillStyle = slag.sh; ctx.fillRect(x0 + 2, y + h - 5, x1 - x0 - 4, 3); ctx.fillStyle = slag.hi; ctx.fillRect(x0 + 3, y + 1, x1 - x0 - 6, 1);
      for (let x = x0 + 8; x < x1 - 8; x += 22) { const ly = y + 4 + ((x >> 2) % Math.max(1, h - 10)); rrect(ctx, x, ly, 8, 4, 2, slag.sh, OL, 1); ctx.fillStyle = (x >> 1) % 3 ? ROSE : '#b03a7a'; ctx.fillRect(x + 3, ly + 1, 2, 1); }
    } else if (this.type === 'netGive') {
      // marked net squares: a rope grid with rose tape at the corners; sagging squares bow, open squares are a dark hole
      const rope = tones('#8a7040');
      for (const sq of this.squares) {
        const sx = cam.toScreenX(sq.x), sxx0 = sx - sq.w / 2, syy0 = sy0 + sq.z - sq.d / 2;
        if (sxx0 + sq.w < 0 || sxx0 > VIEW_W) continue;
        if (sq.open > 0) {
          ctx.globalAlpha = 0.88; ctx.fillStyle = '#120c14'; ctx.fillRect(sxx0, syy0, sq.w, sq.d); ctx.globalAlpha = 1;
          ctx.strokeStyle = rope.base; ctx.lineWidth = 1; ctx.beginPath();
          for (let x = sxx0 + 5; x < sxx0 + sq.w; x += 10) { ctx.moveTo(x, syy0); ctx.lineTo(x + 1, syy0 + 4); ctx.moveTo(x, syy0 + sq.d); ctx.lineTo(x - 1, syy0 + sq.d - 4); }   // frayed ends
          ctx.stroke();
        } else {
          const sag = sq.sag > 0 ? 1 + ((f >> 1) & 1) : 0;
          ctx.globalAlpha = 0.8; ctx.strokeStyle = rope.base; ctx.lineWidth = 1; ctx.beginPath();
          for (let x = sxx0; x <= sxx0 + sq.w; x += 10) { ctx.moveTo(x, syy0); ctx.lineTo(x, syy0 + sq.d + sag); }
          for (let y = syy0; y <= syy0 + sq.d; y += 10) { ctx.moveTo(sxx0, y + (y > syy0 ? sag : 0)); ctx.lineTo(sxx0 + sq.w, y + (y > syy0 ? sag : 0)); }
          ctx.stroke(); ctx.globalAlpha = 1;
        }
        // rose tape on the border (flashing while the square is giving), knots at the corners
        ctx.strokeStyle = sq.sag > 0 && (f & 4) ? '#ffffff' : ROSE; ctx.lineWidth = 1; ctx.strokeRect(sxx0 + 0.5, syy0 + 0.5, sq.w - 1, sq.d - 1);
        for (const [kx, ky] of [[sxx0, syy0], [sxx0 + sq.w, syy0], [sxx0, syy0 + sq.d], [sxx0 + sq.w, syy0 + sq.d]]) circle(ctx, kx, ky, 2, rope.hi, OL, 1);
      }
    } else if (this.isSolid) {
      this.drawSolid(ctx, cam, sy0, x0, x1, f);
    }
  }
  /**
   * A gust's telegraph (art/fx.js `drawWind`): streaks running the push direction plus a chevron row on the edge the
   * wind is pushing TOWARD, which holds through the active phase instead of stopping at the moment of effect. A
   * banking deck (game/platforms.js) draws the identical thing rotated into x, so the two read as one piece of
   * weather rather than as two unexplained shoves.
   *
   * This is `drawWeather`, not `draw`: World runs it over the backdrop's front layer, because the front rope rail on
   * an open deck covers the very band edge a chevron row wants (see World.drawWeather).
   */
  drawWeather(ctx, cam) {
    if (this.type !== 'gust' || this.phase === 'idle') return;
    const x0 = Math.max(0, cam.toScreenX(this.x0)), x1 = Math.min(VIEW_W, cam.toScreenX(this.x1));
    drawWind(ctx, {
      x0, x1, y0: FLOOR_TOP + cam.shakeY, axis: 'z', dir: this.gustDir, frame: this.t,
      k: this.phase === 'tell' ? this.phaseT / Math.max(1, this.tell) : 1,
      active: this.phase === 'active', color: this.color || WIND_COLOR,
    });
  }
  /**
   * A gap is a hole in the deck: the floor simply is not there, so it is drawn as the dark underneath with a lit
   * lip on the near side.
   *
   * A WALL is drawn as a body STANDING on the deck, because the footprint on its own read as a plate set into the
   * floor -- and nothing the picture says you can walk on will ever be read as something to jump. Everything here
   * is the zone's own numbers: the barrier stands on the band's near lip, rises exactly `height` px (the same
   * number Fighter.hitSolid measures a jump's apex against, so the edge the eye picks is the edge a jump has to
   * clear), and the dimmed footprint behind it still says which lanes are shut. It is drawn side-on with a shallow
   * top cap rather than with a full top face, which is the house idiom for a solid object (art/props.js `mold`,
   * `cart`): this projection has no x foreshortening, so a top face the depth of the band would read as a second
   * floor. A broken barricade stops drawing entirely, matching `blocking`.
   */
  drawSolid(ctx, cam, sy0, x0, x1, f) {
    if (!this.blocking) return;
    const y = sy0 + this.z0, h = Math.max(2, this.z1 - this.z0), w = x1 - x0;
    if (this.height <= 0) {
      // the hole, and the broken lip the player reads as "the plank is gone"
      ctx.fillStyle = '#0b0810'; ctx.fillRect(x0, y, w, h);
      ctx.strokeStyle = OL; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#6b5a3a';
      for (let x = x0 + 3; x < x1 - 3; x += 9) { ctx.fillRect(x, y - 1, 4, 2); ctx.fillRect(x + 2, y + h - 1, 4, 2); }
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#2a2030'; ctx.fillRect(x0 + 2, y + 2, w - 4, 2); ctx.globalAlpha = 1;
      return;
    }
    const t = tones('#4a4e58');
    const foot = y + h;                     // the near lip of the band: where the barrier meets the deck
    const top = foot - this.height;         // exactly `height` above the deck -- the edge a jump has to clear
    const cap = Math.min(6, Math.max(2, Math.min(Math.round(h / 8), Math.floor(this.height / 3))));
    const face = Math.min(top + cap, foot - 2);   // the top cap eats into the height, it never adds to it
    ctx.save();
    // The footprint is what is left of the old floor plan, and it is drawn as the barrier's SHADOW on the deck
    // rather than as more plate: the band lies directly above the face on screen, so anything in the zone's own
    // metal there fuses with it into one impossibly tall column. As a shadow it reads as ground, and it still
    // says which lanes are shut -- the same rectangle dangerBox hands enemy pathing.
    ctx.fillStyle = '#0b0810';
    // four flat bands rather than a gradient (the house idiom, and it holds up at 1x): the shadow is darkest where
    // the barrier stands and thins toward the back, so a band as deep as the whole floor cannot read as a pit
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.06 + 0.1 * i;
      ctx.fillRect(x0, y + (h * i) / 4, w, h / 4 + 1);
    }
    ctx.globalAlpha = 0.3; ctx.strokeStyle = '#000000'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = x0 + 4; x < x1; x += 8) { ctx.moveTo(x, foot); ctx.lineTo(x + 6, y); }
    ctx.stroke();
    // the contact shadow that puts the barrier ON the deck rather than in front of it
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#000000'; ctx.fillRect(x0 - 2, foot - 1, w + 4, 3);
    ctx.globalAlpha = 1;
    // the standing face, with uprights and a footing band so it is structure rather than one painted panel
    rrect(ctx, x0, face, w, foot - face, 2, t.base, OL, 1);
    ctx.fillStyle = t.sh;
    for (let x = x0 + 5; x < x1 - 3; x += 9) ctx.fillRect(x, face + 2, 1, foot - face - 5);
    ctx.fillRect(x0 + 2, foot - 4, w - 4, 3);
    ctx.fillStyle = t.hi; ctx.fillRect(x0 + 2, face + 1, w - 4, 1);
    // the top cap: a shallow face receding away from the camera, lit from the top-left (ART_STYLE 3)
    poly(ctx, [[x0 + 2, top], [x1 - 2, top], [x1, face], [x0, face]], t.hi, OL, 1);
    // that top edge is the whole point of the silhouette, so it takes the brightest mark on the object; a barricade
    // that can still be broken keeps it live, which reads as "hit me" rather than as scenery
    ctx.fillStyle = this.breakable ? ((f & 8) ? '#e2b34a' : '#8a5a1c') : '#c8a050';
    ctx.fillRect(x0 + 1, top, w - 2, 1);
    ctx.restore();
  }
}

/**
 * A scripted warning patch (issue #33 `zoneFlash`): the fair warning an event owes the player before it changes the
 * room. It is an `fx` entity with a finite life that flags `isHazard` and answers `dangerBox()` for exactly that
 * life, so `laneAroundHazards` steers mobs and the autopilot out of the patch while it flashes and stops the moment
 * it expires. A PERMANENT box here would be a bug, not a nicety: enemies would refuse that lane for the rest of the
 * board and a purely visual action would have become simulation.
 */
export class ZoneFlash extends Entity {
  /** @param {{x0:number, x1:number, z0?:number, z1?:number, frames?:number, color?:string}} spec */
  constructor(spec) {
    super('fx');
    this.x0 = spec.x0; this.x1 = spec.x1;
    this.z0 = spec.z0 != null ? spec.z0 : Z_MIN;
    this.z1 = spec.z1 != null ? spec.z1 : Z_MAX;
    this.x = (this.x0 + this.x1) / 2; this.z = -4; this.shadowW = 0;
    this.life = Math.max(1, spec.frames || 120); this.t = 0;
    this.color = spec.color || TELL_RED;
    this.isHazard = true;
  }
  hurtbox() { return null; }
  dangerBox() { return { x0: this.x0, x1: this.x1, z0: this.z0, z1: this.z1 }; }
  update() { if (++this.t >= this.life) { this.removeMe = true; this.alive = false; } }
  draw(ctx, cam) {
    const sy0 = FLOOR_TOP + cam.shakeY, x0 = Math.max(0, cam.toScreenX(this.x0)), x1 = Math.min(VIEW_W, cam.toScreenX(this.x1));
    if (x1 <= x0) return;
    const y = sy0 + this.z0, h = Math.max(2, this.z1 - this.z0);
    // a hatched patch that beats faster as it runs out: the same read as a hazard's tell, at section scale
    const k = this.t / this.life, beat = (this.t % Math.max(4, Math.round(14 - 10 * k))) < 3;
    ctx.save();
    ctx.globalAlpha = 0.16 + 0.14 * k;
    ctx.fillStyle = this.color; ctx.fillRect(x0, y, x1 - x0, h);
    ctx.globalAlpha = beat ? 0.9 : 0.45;
    ctx.strokeStyle = beat ? '#ffffff' : this.color; ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y + 0.5, x1 - x0 - 1, h - 1);
    ctx.globalAlpha = 0.3 + 0.2 * k; ctx.beginPath();
    for (let x = x0 - h; x < x1; x += 12) { ctx.moveTo(x, y + h); ctx.lineTo(x + h, y); }
    ctx.stroke();
    ctx.restore();
  }
}

/** Build the Zone entities for a section's `zones` list. */
export function createZones(list = []) { return list.map((z) => new Zone(z)); }
