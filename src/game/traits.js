// Trait normalisation: `def.traits` + the legacy top-level def flags -> one object the core reads (table in fighter.js header).
// Also the SPAWN MODIFIER table (issue #28 part 3): spawn-time patches of an enemy def (holdout / crusted / scrip / winged /
// salvaged) that stage data asks for with `mods: ['holdout']` on a spawn entry. Spawn-time only, so netplay stays in lockstep:
// a mod is part of the def the Enemy is built from, never a coin flipped later.
import { normalizeShield } from './shield.js';
import { particles } from '../engine/particles.js';
import { audio } from '../engine/audio.js';
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
/** Slowest a winged body may fall (px/frame): the bladder hangs it, the Gleaning's descent. */
const WINGED_SINK = 1.4;
/**
 * The crusted status: one hit of frame armour. A spawn-time, engine-generic copy of the Limeburner's LIMECRUST (chandler.js)
 * with `hits: 1`: super armour + no launch until the first hit is COUNTED (fighter.js advances hitCount before the armour
 * branch, so the armoured hit itself counts), then the crust falls off as quicklime debris and the previous armour flags return.
 * normalizeTraits builds a fresh per-instance traits object, so the flags written here never leak into the shared def.
 */
const CRUSTED = {
  frames: 1e9, tint: QUICKLIME, tintAlpha: 0.2,
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
 *            WINGED_SINK px/frame while airborne, the Gleaning's shot-down rule (x1.25 on any hit taken airborne) plus
 *            traits.jumpAttackTakenMult >= 1.25, and the bladder weak point (hurtParts 'bag' above the rig, x1.6). A Gleaner
 *            already hangs under one: the mod is a no-op on type 'gleaning'.
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
    label: 'WINGED', factions: ['brassbound', 'sootborn', 'stormcrow', 'chandler'],
    apply(d, base) {
      if (base.type === 'gleaning') return;
      d.build.accessories.push(modAcc('back', 'bladder'));
      if (!d.build.bagShape) d.build.bagShape = 'slack';  // the Chaff's slack bag; only drawBladder reads it
      // hurtParts are rig-space px: the body tiles the rig height, the bag box sits above it (gleaning.js convention)
      const H = Math.round((d.build.scale || 1) * 72), bag = { name: 'bag', y: [H, H + 28], damageMult: 1.6 };
      d.hurtParts = d.hurtParts && d.hurtParts.length ? [...d.hurtParts, bag] : [{ name: 'body', y: [0, H] }, bag];
      d.traits.jumpAttackTakenMult = Math.max(d.traits.jumpAttackTakenMult || 1, 1.25);
    },
    hooks: {
      onUpdate(f) {
        if (f.airborne && f.vy < -WINGED_SINK) f.vy = -WINGED_SINK;
        f.rig.gas = f.airborne ? 0.8 : 0.25;  // the bag glows while it carries (drawBladder reads rig.gas)
      },
      onHitTaken(f, h) { if (!f.airborne || f.dead) return undefined; return { ...h, damage: Math.round((h.damage || 0) * 1.25) }; },
    },
  },
  salvaged: {
    label: 'SALVAGED', factions: ['brassbound'],
    apply(d, base) {
      Object.assign(d.build.palette, { primary: '#6E5A78', secondary: '#4E3C58', sleeve: '#4E3C58' });
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
  for (const m of mods || []) if (SPAWN_MODS[m] && !list.includes(m)) list.push(m);
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
