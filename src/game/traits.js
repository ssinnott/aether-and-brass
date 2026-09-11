// Trait normalisation: `def.traits` + the legacy top-level def flags -> one object the core reads (table in fighter.js header).
// Also the SPAWN MODIFIER table (issue #28 part 3): spawn-time patches of an enemy def (holdout / crusted / scrip / winged /
// salvaged) that stage data asks for with `mods: ['holdout']` on a spawn entry. Spawn-time only, so netplay stays in lockstep:
// a mod is part of the def the Enemy is built from, never a coin flipped later.
import { normalizeShield } from './shield.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
import { buildRig } from '../art/rig.js';
import { ST } from '../constants.js';
/** Normalise `def.traits` + legacy def fields (damageTaken, armor, unlaunchable, grabbable, grabReach, grabDamageMult, throwDamageMult, doubleJump, grabAll). */
export function normalizeTraits(def) {
  const t = def.traits || {};
  const pick = (k, legacy, dflt) => (t[k] !== undefined ? t[k] : (legacy !== undefined ? legacy : dflt));
  return {
    damageTakenMult: pick('damageTakenMult', def.damageTaken, 1), fireDamageMult: pick('fireDamageMult', undefined, 1), jumpAttackTakenMult: pick('jumpAttackTakenMult', undefined, 1),
    superArmor: !!pick('superArmor', def.armor, false), noLaunch: !!pick('noLaunch', def.unlaunchable, false), armorHits: pick('armorHits', undefined, 0), armorFrontOnly: !!t.armorFrontOnly,
    flinchEvery: t.flinchEvery || 0, staggerEveryNthHit: t.staggerEveryNthHit || 0, staggerFrames: t.staggerFrames || 30, ignoreKnockdownBelow: t.ignoreKnockdownBelow || 0,
    grabbable: pick('grabbable', def.grabbable, true), grabbableByGrappler: pick('grabbableByGrappler', def.grabbableByGrappler, true), grabAll: !!pick('grabAll', def.grabAll, false),
    grabReach: pick('grabReach', def.grabReach, 20), grabDamageMult: pick('grabDamageMult', def.grabDamageMult, 1), throwDamageMult: t.throwDamageMult || 1, throwDamageTakenMult: pick('throwDamageTakenMult', def.throwDamageMult, 1),
    fleeHpFrac: t.fleeHpFrac || 0, fleeChance: t.fleeChance || 0, weight: t.weight || 1,
    extraJumps: pick('extraJumps', def.doubleJump ? 1 : undefined, 0), airDashes: t.airDashes || 0, dodgeRecovery: pick('dodgeRecovery', undefined, 8), dodgeIFrames: t.dodgeIFrames || [2, 12],
    parry: t.parry || null, tauntMeter: t.tauntMeter || 0, dummy: !!t.dummy, shield: normalizeShield(t.shield),
  };
}

// ================================================================ spawn modifiers (issue #28 part 3)
/**
 * Mod art registry. The game layer never imports content, so a mod's accessory names its drawing (`MOD_ART.bladder`) and
 * content/enemies/mods.js fills the name in at load (registerModArt). An unregistered name draws nothing rather than throwing:
 * a stage can ask for a mod before its art lands and the enemy still plays.
 * @type {Record<string, (ctx: CanvasRenderingContext2D, rig: object, pose: object) => void>}
 */
export const MOD_ART = {};
/** Register the draw hook behind a mod accessory name ('bladder' | 'scripBadge' | 'salvagePlate'). */
export function registerModArt(name, fn) { MOD_ART[name] = fn; }
/** Accessory record that looks its drawing up by name at draw time (so registration order never matters). */
const modAcc = (attach, name) => ({ attach, draw: (ctx, rig, pose) => { const fn = MOD_ART[name]; if (fn) fn(ctx, rig, pose); } });

/** The Limeburner's quicklime (content/enemies/chandlerRig.js CH.quicklime), repeated here so the crust reads the same without importing content. */
const QUICKLIME = '#E6ECDC';
/** Dead-grey lens / core glow of an automaton nobody has wound in years (holdout). The RED tell lens is a constant in brassLensB, so the tell survives. */
const DEAD_GLOW = '#5A6068';
/** Slowest a winged body may fall (px/frame) once the bag is venting: the Gleaning's settle onto the deck. */
const WINGED_SINK = 1.4;
/** Rate of the ARRIVAL descent, above the hang line. Faster than the settle: enemy.js think() returns early while airborne,
 *  so every frame spent in the air is a frame the body cannot act — the hang is the beat, the fall to it is not. */
const WINGED_DROP = 3;
/** The Gleaning hang line (content/enemies/gleaning.js): clear of every ground hitbox, inside a jump attack's apex. */
const WINGED_HANG = 64;
/** Frames a winged body hangs on the line before the bag vents and it settles. Fixed, never rng: netplay runs in lockstep. */
const WINGED_HANG_FRAMES = 48;
/** Fraction of the body below the bag when winged tiles its own hurtParts (the Gleaning defs sit at 0.54-0.58). */
const WINGED_BODY_FRAC = 0.55;
/** States in which a winged body still owns its altitude. A hit takes the hang away, so launches and juggles fall normally. */
const WINGED_HANG_STATES = new Set([ST.IDLE, ST.WALK, ST.RUN, ST.JUMP, ST.ATTACK, ST.JUMP_ATTACK, ST.DASH_ATTACK, ST.SPECIAL, ST.GRAB]);
/** True when a def already hangs under a bladder of its own (every Gleaning but the Picker). */
function hasBladder(def) {
  const b = def.build || {};
  if (b.bagShape && b.bagShape !== 'none') return true;
  return !!(def.hurtParts || []).some((p) => p.name === 'bag' || p.name === 'bags');
}
/**
 * The crusted status: one hit of frame armour. A spawn-time, engine-generic copy of the Limeburner's LIMECRUST (chandler.js)
 * with `hits: 1`: super armour + no launch until the first hit is COUNTED (fighter.js advances hitCount before the armour
 * branch, so the armoured hit itself counts), then the crust falls off as quicklime debris and the previous armour flags return.
 * normalizeTraits builds a fresh per-instance traits object, so the flags written here never leak into the shared def.
 */
/**
 * The crust's outline: a 1px quicklime rim round the hurtbox, the same read the Limeburner's LIMECRUST gets from
 * chandlerRig.drawRiteRim. Re-drawn here rather than imported because `crusted` goes on ANY faction and the game layer
 * never imports content — a 20% tint on its own left the one cue that this body eats a hit before it flinches invisible.
 */
function drawCrustRim(ctx, f, sx, sy, s) {
  const w = f.w + 6, h = f.h + 6, x = Math.round(sx - w / 2), y = Math.round(sy - f.h - 3);
  ctx.save();
  ctx.globalAlpha = 0.85; ctx.strokeStyle = s.rim || QUICKLIME; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.restore();
}
const CRUSTED = {
  frames: 1e9, tint: QUICKLIME, tintAlpha: 0.2, rim: QUICKLIME, draw: drawCrustRim,
  onTick(f, s) { if (s.hits0 != null && f.hitCount - s.hits0 >= 1) f.clearStatus('crusted'); },
  onEnd(f, s) {
    if (s.hits0 == null) return;
    f.traits.superArmor = !!s.prevArmor; f.traits.noLaunch = !!s.prevNoLaunch; f.unlaunchable = !!s.prevUnlaunch; f.armor = !!s.prevArmor;
    particles.burst('debris', f.x, f.y + f.h * 0.5, f.z, 6, { speed: 2.2, up: 2, color: QUICKLIME });
    audio.play('prop_break');
  },
};
/** Pre-apply the crust at spawn. Never on a shielded enemy (ai.shield): the two armour systems fight each other (chandler.js findCrust). */
function crust(f) {
  if (f.hasStatus('crusted') || (f.ai && f.ai.shield) || f.dead) return;
  const s = f.applyStatus('crusted', CRUSTED, f);
  s.prevArmor = f.traits.superArmor; s.prevNoLaunch = f.traits.noLaunch; s.prevUnlaunch = f.unlaunchable; s.hits0 = f.hitCount;
  f.traits.superArmor = true; f.traits.noLaunch = true; f.unlaunchable = true; f.armor = true;
}

/**
 * The spawn modifier table. `apply(d, base)` patches the FRESH derived copy `d` applyMods hands it (build / palette / accessories /
 * traits / ai / hurtParts are already shallow-cloned, so pushing and assigning into them is safe; `base` is the untouched def for
 * reading the original numbers). `hooks` are chained AFTER the def's own hooks (see chainHooks). `factions` is advisory — a
 * stage may put a Brassbound mod on a Sootborn and nothing throws; the art simply reads oddly.
 *  holdout   Brassbound left running in an abandoned works: dead-grey lens / core (the red tell still fires), no wind-up key
 *            (build.noKey, brassKeyB returns), walk + run x0.8, hp x1.3, score x1.2.
 *  crusted   any: one hit of frame armour pre-applied (status 'crusted' above) and a quicklime puff when it breaks; quicklime tint.
 *  scrip     Sootborn on the Company's payroll: a lime-ringed badge and it NEVER flees — flee / fleeHp / fleeLast / fleeHpFrac /
 *            fleeChance zeroed and the Slinger's panic-flee with them (panic is stagger-then-run, the same flee).
 *  winged    any grounded variant with a salvage bladder strapped on: spawns from the sky (Enemy constructor fromSky), sinks at
 *            WINGED_SINK px/frame to the Gleaning hang line and HANGS there for WINGED_HANG_FRAMES before the bag vents and
 *            it settles; the Gleaning's shot-down rule (x1.25 on any hit taken airborne); and the bladder weak point —
 *            hurtParts tile the body, the upper band takes x1.6, and holing it while the bag carries drops the body as a
 *            knockdown. Skipped whole (`skip`) on anything that already hangs under a bladder; the bagless Picker takes it.
 *  salvaged  Brassbound re-plated by the Gleaning in guild colours: plum coat tones over brass joints, hemp stripe + a riveted
 *            hemp plate, drops a Brass Cog where the base dropped nothing, gear-slip on the 3RD hit (ai.staggerEvery 3), score x1.1.
 */
export const SPAWN_MODS = Object.freeze({
  holdout: {
    label: 'HOLDOUT', factions: ['brassbound'],
    apply(d, base) {
      d.build.palette.glow = DEAD_GLOW; d.build.noKey = true;
      const walk = base.walkSpeed || 1.8, run = base.runSpeed || walk * 1.7;
      d.walkSpeed = walk * 0.8; d.runSpeed = run * 0.8;
      d.hp = d.maxHp = Math.round((base.maxHp || base.hp || 100) * 1.3);
      d.score = Math.round((base.score || 100) * 1.2);
    },
  },
  crusted: {
    label: 'CRUSTED',
    apply() {},
    hooks: { onSpawn(f) { crust(f); } },
  },
  scrip: {
    label: 'SCRIP', factions: ['sootborn'],
    apply(d) {
      d.build.accessories.push(modAcc('torso', 'scripBadge'));
      d.ai.fleeHp = 0; d.ai.flee = undefined; d.ai.fleeLast = false; d.ai.panicRange = 0; d.ai.panicWhenClose = 0;
      d.traits.fleeHpFrac = 0; d.traits.fleeChance = 0;  // normalizeAi turns either of these back into fleeLast
    },
  },
  winged: {
    label: 'WINGED', factions: ['brassbound', 'sootborn', 'stormcrow', 'chandler', 'gleaning'],
    // A body that already hangs under a bladder gets nothing from a second one: skipped WHOLE (applyMods drops the name), so
    // no chained hooks, no '(WINGED)' suffix and no forced sky spawn. The Picker is bagless and is the one Gleaning it takes.
    skip: hasBladder,
    apply(d) {
      d.build.accessories.push(modAcc('back', 'bladder'));
      // 'none' is the Picker's bagless rig and drawBladder returns on it, so the shape has to be replaced, not defaulted.
      if (!d.build.bagShape || d.build.bagShape === 'none') d.build.bagShape = 'slack';   // the Chaff's slack bag
      // hurtParts TILE the body the way every Gleaning def does (chaff [0,38]+[38,66] against h=65): the bag is the upper
      // band OF the body, not a box above it. Boxes are disjoint, so combat.js's first-overlap match still picks the right
      // one — and the height is the rig's real height, not a hard-coded 72 (Brassbound measure 74, the goblin 66).
      if (!d.hurtParts || !d.hurtParts.length) {
        const H = Math.round((buildRig(d.build).height || 72) * (d.build.scale || 1));
        const split = Math.round(H * WINGED_BODY_FRAC);
        d.hurtParts = [{ name: 'body', y: [0, split] }, { name: 'bag', y: [split, H], damageMult: 1.6 }];
      }
    },
    hooks: {
      onSpawn(f) { f.wingedHang = WINGED_HANG_FRAMES; f.bladderGone = false; },
      onUpdate(f) {
        const r = f.rig;
        // drawBladder falls back to the pose face when nothing drives gasDead, and every non-Brassbound faction poses
        // `dazed` on its stagger keys — which deflated the bag a third and put the gas out on any stagger. Drive it here.
        r.gasDead = false; r.gasDeadAt = null;
        if (f.bladderGone || !f.airborne) { r.gas = 0.25; return; }
        r.gas = 0.8;   // the bag glows while it carries
        if (!WINGED_HANG_STATES.has(f.state)) return;   // hurt / knocked down / thrown: the body falls on its own terms
        if (f.wingedHang == null) f.wingedHang = WINGED_HANG_FRAMES;
        if (f.y > WINGED_HANG) { if (f.vy < -WINGED_DROP) f.vy = -WINGED_DROP; return; }
        // on the line: re-arm noGravity every step to pin the altitude (physics decrements it), the way the Gleaning hangs
        if (f.wingedHang > 0) { f.wingedHang--; f.noGravity = 2; f.y = WINGED_HANG; f.vy = 0; }
        else if (f.vy < -WINGED_SINK) f.vy = -WINGED_SINK;   // the bag vents and it settles onto the deck
      },
      onHitTaken(f, h) {
        if (!f.airborne || f.dead) return undefined;
        const hit = { ...h, damage: Math.round((h.damage || 0) * 1.25) };   // the Gleaning's shot-down rule
        // the weak point: hole the bag while it carries and the bladder gives — it comes down instead of settling
        const part = f.hitPart;
        if (!f.bladderGone && part && (part.name === 'bag' || part.name === 'bags')) {
          f.bladderGone = true; f.wingedHang = 0; f.noGravity = 0;
          f.rig.gasDead = true; f.rig.gasDeadAt = f.rig.tick | 0;
          hit.type = 'knockdown';
        }
        return hit;
      },
    },
  },
  salvaged: {
    label: 'SALVAGED', factions: ['brassbound'],
    apply(d, base) {
      // #453352, not #4E3C58: torso(primary)/hips(secondary) has to clear the human-machine value ladder, and the old
      // pair measured 0.310 against a 0.331 reference baseline — a plum coat that went flat across the hips.
      Object.assign(d.build.palette, { primary: '#6E5A78', secondary: '#453352', sleeve: '#453352' });
      d.build.stripe = '#9C893F';
      d.build.accessories.push(modAcc('torso', 'salvagePlate'));
      if (!base.drops || base.drops === 'none') d.drops = 'brassCog';
      d.ai.staggerEvery = 3; if (d.traits.staggerEveryNthHit) d.traits.staggerEveryNthHit = 3;
      d.score = Math.round((base.score || 100) * 1.1);
    },
  },
});

/**
 * Chain a def's hooks with the mods' hooks: the base hook runs first, then each mod's, in mod order. onHitTaken threads the hit
 * through (a replacement hit from one hook is what the next one sees; the first `false` rejects the hit); every other hook
 * returns the first non-undefined result (onAnimEvent / onAttackPressed `true` = consumed stays with whoever consumed it).
 */
function chainHooks(base, modHooks) {
  const names = new Set(Object.keys(base || {}));
  for (const h of modHooks) for (const k of Object.keys(h)) names.add(k);
  const out = {};
  for (const name of names) {
    const fns = [];
    if (base && base[name]) fns.push(base[name]);
    for (const h of modHooks) if (h[name]) fns.push(h[name]);
    if (fns.length === 1) { out[name] = fns[0]; continue; }
    if (name === 'onHitTaken') {
      out[name] = (f, hit, attacker, world) => {
        let replaced = false;
        for (const fn of fns) { const r = fn(f, hit, attacker, world); if (r === false) return false; if (r && typeof r === 'object') { hit = r; replaced = true; } }
        return replaced ? hit : undefined;
      };
    } else {
      out[name] = (...args) => { let res; for (const fn of fns) { const r = fn(...args); if (res === undefined) res = r; } return res; };
    }
  }
  return out;
}

/** derived defs per base def, keyed by the joined mod list — rigs are built from the SAME derived def on every spawn. */
const MOD_CACHE = new WeakMap();
/**
 * Derive a def with `mods` applied. Returns the def itself when no known mod is named; otherwise a NEW def (cached per def + mod
 * set) with a shallow-copied build (patched palette / accessories), traits, ai and hurtParts, chained hooks, `def.mods` and a
 * display name suffix (`TIN FOOTMAN (HOLDOUT, CRUSTED)`). type / variant / id stay the base's. The base def is never mutated.
 * @param {object} def enemy def (content/enemies)
 * @param {string[]} mods SPAWN_MODS names; unknown names are skipped, duplicates collapse
 */
export function applyMods(def, mods) {
  const list = [];
  // `spec.skip(def)` drops a mod WHOLE rather than letting apply() no-op: a half-applied mod still chained its hooks,
  // suffixed the name and (via def.mods) forced a sky spawn, which is how a winged Gleaner used to arrive bagless.
  for (const m of mods || []) {
    const spec = SPAWN_MODS[m];
    if (!spec || list.includes(m)) continue;
    if (spec.skip && spec.skip(def)) continue;
    list.push(m);
  }
  if (!list.length || !def) return def;
  const key = list.join('+');
  let byKey = MOD_CACHE.get(def);
  if (!byKey) { byKey = new Map(); MOD_CACHE.set(def, byKey); }
  const cached = byKey.get(key);
  if (cached) return cached;
  const b = def.build || {};
  const d = {
    ...def, mods: list.slice(),
    build: { ...b, palette: { ...(b.palette || {}) }, accessories: [...(b.accessories || [])] },
    traits: { ...(def.traits || {}) }, ai: { ...(def.ai || {}) },
    hurtParts: def.hurtParts ? def.hurtParts.map((p) => ({ ...p })) : def.hurtParts,
  };
  const labels = [], hooks = [];
  for (const m of list) { const spec = SPAWN_MODS[m]; spec.apply(d, def); labels.push(spec.label); if (spec.hooks) hooks.push(spec.hooks); }
  d.name = `${def.name || def.id || 'fighter'} (${labels.join(', ')})`;
  d.hooks = chainHooks(def.hooks, hooks);
  byKey.set(key, d);
  return d;
}
