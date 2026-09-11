// Status effects on fighters (GDD 3/4/5): burn, netted, stunned, timeStopped + any custom named status a content def applies.
// Pure helpers used by Fighter (applyStatus / hasStatus / clearStatus / tick / draw). Content never imports this directly:
// `f.applyStatus(name, opts, source)` is the API; `hit.status = { burn: { frames, every, damage } }` applies on contact.
import { ST, UI } from '../constants.js';
import { particles } from '../engine/particles.js';
import { floatText } from '../art/fx.js';
import { audio } from '../engine/audio.js';
import { circle, line } from '../art/shapes.js';

/**
 * Built-in status defaults. Any option can be overridden per application:
 *  burn        { frames: 60, every: 20, damage: 2 }            damage tick every `every` frames, orange embers, fire damage (fireDamageMult)
 *  netted      { frames: 90, mashOut: 6 }                      stuck in place; mash attack `mashOut` times or a teammate's hit frees
 *  stunned     { frames: 40 }                                  cannot act (stagger anim), stars overhead, ignores armor
 *  timeStopped { frames: 60 }                                  frozen solid (still hittable), cyan tint
 *  blinded     { frames: 30 }                                  quicklime in the eyes (hazards.js limePit): cannot ATTACK - players' attack /
 *                                                              special / super presses are dropped (player.js), enemies stagger like `stunned`;
 *                                                              walking, jumping and dodging still work. Quicklime-white tint.
 * Custom statuses: applyStatus('myStatus', { frames, onTick(f, s, world), onEnd(f, s, world), draw(ctx, f, sx, sy, s), tint })
 */
export const STATUS_DEFAULTS = Object.freeze({
  burn: { frames: 60, every: 20, damage: 2, color: '#ff8a2a', tint: '#ff6a20', tintAlpha: 0.25 },
  netted: { frames: 90, mashOut: 6 },
  stunned: { frames: 40 },
  timeStopped: { frames: 60, tint: '#4DF0E0', tintAlpha: 0.35 },
  blinded: { frames: 30, tint: '#E6ECDC', tintAlpha: 0.35 },
});
/** Radius of the fire a burning body registers with the world each tick (hazards.js gas seeps / cells ignite off it). */
const BURN_FIRE_R = 16;

/** Apply (or refresh) a status. Returns the status record. */
export function applyStatus(f, name, opts = {}, source = null) {
  const d = STATUS_DEFAULTS[name] || {};
  const prev = f.status[name];
  const s = { ...d, ...opts, name, source, timer: opts.frames != null ? opts.frames : (d.frames || 60), age: 0, mash: 0 };
  if (prev && prev.timer > s.timer) s.timer = prev.timer;  // refreshing never shortens
  f.status[name] = s;
  if (name === 'stunned') {
    f.hurtTimer = Math.max(f.hurtTimer || 0, s.timer); f.chainHits = 0;
    if (f.grabTarget && f.releaseGrab) f.releaseGrab(false);
    f.pendingAttack = null; f.vx = 0;
    if (!f.airborne) f.setState(ST.HURT, 'stagger', { fallback: 'hurt' });
    if (f.releaseToken) f.releaseToken();
    audio.play('stagger');
  } else if (name === 'netted') {
    f.vx = 0; f.vz = 0;
    if (!f.inHitstun && !f.airborne) f.setState(ST.IDLE, 'hurt', { fallback: 'idle' });
    audio.play('net');
  } else if (name === 'timeStopped') {
    f.flashTimer = 2;
  } else if (name === 'burn') {
    if (!prev) audio.play('burn');
  } else if (name === 'blinded') {
    // a blinded ENEMY is handled like a stunned one (enemy.js gates every attack on inHitstun): the stagger holds it
    // for the duration. A player keeps control of their feet - only the attack buttons go dead (player.js).
    if (f.kind !== 'player') {
      f.hurtTimer = Math.max(f.hurtTimer || 0, s.timer);
      if (f.grabTarget && f.releaseGrab) f.releaseGrab(false);
      f.pendingAttack = null; f.vx = 0;
      if (!f.airborne && f.state !== ST.GRABBED) f.setState(ST.HURT, 'stagger', { fallback: 'hurt' });
      if (f.releaseToken) f.releaseToken();
    }
    if (!prev) audio.play('steam', { volume: 0.5 });
  }
  if (f.callHook) f.callHook('onStatus', name, s, 'apply');
  return s;
}

/** Remove a status (calls onEnd). */
export function clearStatus(f, name, world = f.world) {
  const s = f.status[name];
  if (!s) return;
  delete f.status[name];
  if (typeof s.onEnd === 'function') s.onEnd(f, s, world);
  if (f.callHook) f.callHook('onStatus', name, s, 'end');
}

/** Advance every status one step. Call after the frozen check (timeStopped is ticked by the caller). */
export function tickStatuses(f, world) {
  const st = f.status;
  for (const name in st) {
    const s = st[name];
    if (name === 'timeStopped') continue;
    s.age++;
    if (name === 'burn') tickBurn(f, s, world);
    else if (name === 'netted') { f.vx = 0; f.vz = 0; if (!f.inHitstun && !f.airborne && f.state !== ST.IDLE && f.state !== ST.HURT) f.setState(ST.IDLE, 'hurt', { fallback: 'idle' }); }
    else if (name === 'stunned') { if (f.state !== ST.HURT && !f.airborne && f.state !== ST.GRABBED) f.setState(ST.HURT, 'stagger', { fallback: 'hurt' }); }
    else if (name === 'blinded') {
      if (s.age % 4 === 0) particles.burst('dust', f.x + (s.age % 3 - 1) * 5, f.y + f.h * 0.9, f.z, 1, { speed: 0.5, up: 0.5, color: s.tint });
      if (f.kind !== 'player' && f.state !== ST.HURT && !f.airborne && f.state !== ST.GRABBED) f.setState(ST.HURT, 'stagger', { fallback: 'hurt' });
    }
    if (typeof s.onTick === 'function') s.onTick(f, s, world);
    if (f.callHook) f.callHook('onStatus', name, s, 'tick');
    if (--s.timer <= 0 || f.dead) clearStatus(f, name, world);
  }
}

function tickBurn(f, s, world) {
  if (world && world.addFire) world.addFire(f.x, f.z, BURN_FIRE_R);   // a burning body is a fire source: it lights gas it walks into
  if (s.age % 3 === 0) particles.burst('ember', f.x + (s.age % 5 - 2) * 3, f.y + f.h * 0.5, f.z, 1, { speed: 1, up: 1.8, color: s.color });
  if (s.age % (s.every || 20) === 0) {
    const dmg = Math.round((s.damage || 2) * (f.traits ? f.traits.fireDamageMult || 1 : 1));
    f.takeHitRaw(dmg, 'light', s.source, { noStop: true, fire: true });
  }
}

/** Frozen by a time stop: the fighter skips its whole update while this returns true. */
export function tickFrozen(f, world) {
  const s = f.status.timeStopped;
  if (!s) return false;
  s.age++;
  if (--s.timer <= 0) clearStatus(f, 'timeStopped', world);
  return true;
}

/** Player-side mash-out of a net (Player calls when attack is pressed while netted). Returns true when freed. */
export function mashNet(f) {
  const s = f.status.netted;
  if (!s) return false;
  s.timer = Math.max(1, s.timer - 6);
  if (++s.mash < (s.mashOut || 6)) return false;
  clearStatus(f, 'netted');
  f.invuln = Math.max(f.invuln, 12);
  floatText(f.x, f.y + f.h + 10, f.z, 'FREE!', UI.brassLight, 1);
  audio.play('prop_break');
  return true;
}

/** Tint colour / alpha of the strongest active status (for drawRig) or null. */
export function statusTint(f) {
  const st = f.status;
  if (st.timeStopped) return st.timeStopped;
  if (st.burn) return st.burn;
  for (const k in st) if (st[k].tint) return st[k];
  return null;
}

/** Draw status overlays at the feet screen position (net, stars, custom draw). */
export function drawStatuses(ctx, f, sx, sy) {
  const st = f.status, frame = f.world ? f.world.frame : 0;
  const top = sy - f.h;
  if (st.netted) {
    const r = Math.round(f.w * 0.9), cy = sy - f.h * 0.5;
    ctx.save(); ctx.globalAlpha = 0.85; ctx.strokeStyle = '#c8b070'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let k = -3; k <= 3; k++) { ctx.moveTo(sx + k * 6, cy - r); ctx.lineTo(sx + k * 6, cy + r); ctx.moveTo(sx - r, cy + k * 6); ctx.lineTo(sx + r, cy + k * 6); }
    ctx.stroke(); ctx.globalAlpha = 1;
    circle(ctx, sx, cy, r + 2, null, '#8a7040', 2);
    ctx.restore();
  }
  if (st.stunned) {
    for (let i = 0; i < 3; i++) {
      const a = frame * 0.15 + i * (Math.PI * 2 / 3);
      const x = sx + Math.cos(a) * 14, y = top - 6 + Math.sin(a) * 4;
      circle(ctx, x, y, 2.5, '#ffe45a', '#2B2B30', 1);
      line(ctx, x - 3, y, x + 3, y, '#fff8b0', 1); line(ctx, x, y - 3, x, y + 3, '#fff8b0', 1);
    }
  }
  if (st.blinded) {
    // a swirl of quicklime dust round the head: three motes orbiting the eye line, no ramp (a glow-class mark)
    for (let i = 0; i < 3; i++) {
      const a = frame * 0.2 + i * (Math.PI * 2 / 3);
      const x = sx + Math.cos(a) * 11, y = top + 6 + Math.sin(a) * 3;
      circle(ctx, x, y, 2, '#E6ECDC', '#2B2B30', 1);
    }
  }
  if (st.timeStopped && (frame % 6) < 3) {
    ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#4DF0E0'; ctx.lineWidth = 1;
    ctx.strokeRect(sx - f.w / 2 - 3, top - 3, f.w + 6, f.h + 6); ctx.restore();
  }
  for (const k in st) if (typeof st[k].draw === 'function') st[k].draw(ctx, f, sx, sy, st[k]);
}
