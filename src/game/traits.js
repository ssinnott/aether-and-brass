// Trait normalisation: `def.traits` + the legacy top-level def flags -> one object the core reads (table in fighter.js header).
import { normalizeShield } from './shield.js';
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
    parry: t.parry || null, tauntMeter: t.tauntMeter || 0, shield: normalizeShield(t.shield),
  };
}
