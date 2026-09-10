// Shields ("wards"): the short-term regenerating buffer a fighter carries in front of its HP (GDD 7).
//
// A shield is a small pool of temporary hit points that eats damage BEFORE hp and refills itself a
// short while after the fighter stops being hit. Pool, refill rate and both waits are per-character
// (`def.traits.shield`), so Brunhild's slab of boiler plate and Sael's half-second static bubble are
// the same three numbers with different values. Nothing else about a hit changes: hitstun, armor,
// knockback, juggles and death all read exactly as before, so a shield is a damage buffer and never
// a second dodge — it buys the mistake back, it does not cancel the reaction.
//
// `traits.shield` (game/traits.js normalises it; absent or `max: 0` = no shield):
//   max         pool in HP
//   regen       HP per frame once the refill starts (x60 = per second)
//   delay       frames of not being damaged before the refill starts
//   breakDelay  the same wait after the pool is emptied — breaking a shield is the real punish
//   name        what the float text calls it when it breaks ('BOILER PLATE DOWN')
// Any fighter may carry one, not just players: nothing here assumes a controller.
import { UI } from '../constants.js';
import { audio } from '../engine/audio.js';
import { floatText } from '../art/fx.js';
import { ellipse } from '../art/shapes.js';
import { clamp } from '../engine/math.js';

/** Frames the in-world ripple stays up after a hit is absorbed. */
const SHIELD_HIT_FRAMES = 10;
/** Frames the HUD bar flashes white after absorbing. */
const SHIELD_FLASH_FRAMES = 4;
/** HUD bar geometry: a 2px strip riding directly above the health bar. */
const SHIELD_BAR_H = 2;
const COL = { fill: UI.brass, full: UI.brassLight, flash: UI.white, trough: '#2b2418', charging: '#3d3320', text: '#ffe9a8' };

/** Defaults for anything `traits.shield` leaves out. */
const DEFAULTS = { regen: 0.3, delay: 120, name: 'SHIELD' };

/** `traits.shield` -> a complete record, or null when the fighter has no shield. */
export function normalizeShield(spec) {
  if (!spec) return null;
  const max = spec.max || 0;
  if (max <= 0) return null;
  const delay = spec.delay != null ? spec.delay : DEFAULTS.delay;
  return {
    max, delay, regen: spec.regen != null ? spec.regen : DEFAULTS.regen,
    breakDelay: spec.breakDelay != null ? spec.breakDelay : Math.round(delay * 2),
    name: spec.name || DEFAULTS.name,
  };
}

/** Full shield, timers cleared (spawn and respawn). */
export function initShield(f) {
  f.shieldMax = f.traits.shield ? f.traits.shield.max : 0;
  f.shield = f.shieldMax;
  f.shieldTimer = 0; f.shieldFlash = 0; f.shieldHit = 0;
}
/** Re-read the shield after a def swap (boss phase changes): keep what is left, never above the new max. */
export function syncShield(f) {
  f.shieldMax = f.traits.shield ? f.traits.shield.max : 0;
  f.shield = Math.min(f.shield || 0, f.shieldMax);
}

/** One step of refill + timers. Frozen fighters never get here (Fighter.update returns first). */
export function tickShield(f) {
  if (f.shieldFlash > 0) f.shieldFlash--;
  if (f.shieldHit > 0) f.shieldHit--;
  const s = f.traits.shield;
  if (!s || f.dead) return;
  if (f.shieldTimer > 0) { f.shieldTimer--; return; }
  if (f.shield >= f.shieldMax) return;
  f.shield = Math.min(f.shieldMax, f.shield + s.regen);
  if (f.shield >= f.shieldMax && f.kind === 'player') audio.play('shield_up', { volume: 0.5 });
}

/**
 * Spend the shield on `dmg` (already rounded HP). Returns how much it absorbed; the caller applies
 * the rest to hp. Any damage — hits, burns, hold hits — restarts the refill wait, so a burn keeps
 * the shield down as long as it lasts.
 */
export function absorbShield(f, dmg, attacker) {
  const s = f.traits.shield;
  if (!s || dmg <= 0) return 0;
  if (f.shield <= 0) { f.shieldTimer = Math.max(f.shieldTimer, s.breakDelay); return 0; }
  const absorbed = Math.min(f.shield, dmg);
  f.shield = Math.max(0, f.shield - absorbed);
  const broke = f.shield <= 0;
  f.shieldTimer = broke ? s.breakDelay : s.delay;
  f.shieldFlash = SHIELD_FLASH_FRAMES; f.shieldHit = SHIELD_HIT_FRAMES;
  const shown = Math.max(1, Math.round(absorbed));
  floatText(f.x, f.y + f.h + 6, f.z, String(shown), COL.text, 1);
  if (broke) {
    audio.play('shield_break');
    floatText(f.x, f.y + f.h + 18, f.z, s.name + ' DOWN', UI.steel, 1);
    if (f.world) f.world.addFx('ring', f.x, f.h * 0.5, f.z, { r0: 6, r1: f.w * 2.2, color: COL.full });
  } else if (!f.armor) {
    audio.play('armor', { volume: 0.55, pitch: 1.3 });   // an armored fighter already clanks: don't stack two
  }
  return absorbed;
}

/** In-world tell: a brass ripple around the body for a few frames after the shield eats a hit. */
export function drawShieldFx(ctx, f, sx, sy) {
  if (f.shieldHit <= 0) return;
  const t = f.shieldHit / SHIELD_HIT_FRAMES, grow = (1 - t) * 4;
  const cy = sy - f.h * 0.5, rx = f.w * 0.95 + grow, ry = f.h * 0.6 + grow;
  ctx.save();
  ctx.globalAlpha = 0.55 * t;
  ellipse(ctx, sx, cy, rx, ry, null, f.shield > 0 ? COL.full : UI.steel, 1.5);
  ctx.globalAlpha = 0.25 * t;
  ellipse(ctx, sx, cy, rx - 3, ry - 3, null, COL.full, 1);
  ctx.restore();
}

/**
 * HUD strip (`hud.js`): a 2px brass bar above the health bar, filling from the player's own side.
 * Empty and waiting = a slow dim pulse, so a broken shield still says "it is coming back".
 */
export function drawShieldBar(ctx, f, x, y, w, right = false, frame = 0) {
  if (!f.shieldMax) return;
  const frac = clamp(f.shield / f.shieldMax, 0, 1);
  ctx.fillStyle = '#120c14'; ctx.fillRect(x - 1, y, w + 2, SHIELD_BAR_H + 2);
  ctx.fillStyle = COL.trough; ctx.fillRect(x, y + 1, w, SHIELD_BAR_H);
  if (frac <= 0) {
    if ((frame % 24) < 12) { ctx.fillStyle = COL.charging; ctx.fillRect(x, y + 1, w, SHIELD_BAR_H); }
    return;
  }
  const fw = Math.max(1, Math.ceil(w * frac));
  ctx.fillStyle = f.shieldFlash > 0 ? COL.flash : frac >= 1 ? COL.full : COL.fill;
  ctx.fillRect(right ? x + w - fw : x, y + 1, fw, SHIELD_BAR_H);
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(right ? x + w - fw : x, y + 1, fw, 1);
}

/** One-line summary for the character select card ('' when the hero has no shield). */
export function shieldLabel(def) {
  const s = normalizeShield(def && def.traits && def.traits.shield);
  if (!s) return '';
  const perSec = Math.round(s.regen * 60 * 10) / 10, wait = Math.round(s.delay / 6) / 10;
  return `SHIELD: ${s.name} ${s.max} - ${perSec}/S AFTER ${wait}S`;
}
