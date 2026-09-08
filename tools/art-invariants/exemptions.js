// Calibration ledger for the art-invariant suite.
//
// POLICY. The stage-1 reference content (the four heroes, the Brassbound, the Sootborn and the stage-1 boss rigs)
// DEFINES the invariants. When a rule fires on reference art there are exactly three honest responses, in order:
//   1. Fix the art.
//   2. Fix the rule - if the rule as written condemns art that is correct, the rule (or the guide) is wrong.
//   3. Record an exemption HERE, with a reason, naming the one rule and the one subject it covers.
// Never loosen a threshold so a known-bad subject passes, and never blanket-exempt a rule or a faction: an
// exemption is a visible, reviewable, per-case admission, which is the whole point of this file existing.
//
// Entry shape (every field required; an entry without a non-empty `reason` string is itself reported as an error):
//   { rule: 'palette/sleeve-vs-primary', subject: 'boss:vane', reason: 'why this one case is genuinely fine' }
// `subject` may be a subject id ('sootborn:firebrand', 'boss2:kestrel#2') or '*' for every subject - use '*'
// only for a rule that is provably not applicable to any rig, and expect to justify it in review.
// Date the reason when the exemption records a defect that is meant to be fixed ("2026-09-07: pre-existing ...").
//
// The Stormcrow faction (stormcrow:*, midboss2:*, boss2:*) is the suite's known-bad control. It gets NO
// exemptions - every finding against it is the suite doing its job.

/** @type {{ rule: string, subject: string, reason: string }[]} */
export const EXEMPTIONS = [
  // Seeds the agreed plan calls for. They are deliberately NOT enabled here: each one must be turned on by the
  // rule author who measured the case, in the same commit as the rule that needs it, so the reason is verifiable.
  // { rule: 'anim/attack-beats', subject: 'sootborn:firebrand', reason: 'flamethrower: a sustained beam has no arc to smear (ART_STYLE section 8 permits projectile/beam movesets)' },
  // { rule: 'palette/proportions', subject: 'pip', reason: 'a gnome in a machine: bulge 0 is the construct-adjacent build, worth a doc note' },

  // --- geom/far-palette-leak (rules/geometry.js). Four stage-1 rigs paint a module/build constant on a FAR part at
  // near brightness. Each was measured hook by hook; each is a small, real ART_STYLE section 0.3 defect with a known
  // one-line fix, dated so it does not become permanent. The five Stormcrow / stage-2 leaks get NO exemption.
  { rule: 'geom/far-palette-leak', subject: 'sootborn:firebrand', reason: '2026-09-07: pre-existing leak, src/content/enemies/common.js gobCuffArm paints build.clan and its sh tone on both sides of the body (2 colours x 66 keyframes) - route the band through inf.pal / farTone; NOT a licence to weaken the rule' },
  { rule: 'geom/far-palette-leak', subject: 'sootborn:hulk', reason: '2026-09-07: pre-existing leak, src/content/enemies/common.js gobHand paints the GOB.iron wrist chains from the module constant on both sides (3 colours x 79 keyframes) - farTone the chain links; NOT a licence to weaken the rule' },
  { rule: 'geom/far-palette-leak', subject: 'midboss:grubbik#2', reason: '2026-09-07: the same gobCuffArm defect as sootborn:firebrand, with Grubbik\'s own band colour (2 colours x 91 keyframes) - one fix in common.js clears both' },
  { rule: 'geom/far-palette-leak', subject: 'boss:vane#2', reason: '2026-09-07: pre-existing leak, src/content/enemies/boss.js vaneHand paints the 3x3 BLADE knuckle glint on the FAR fist from the module constant (88 keyframes) - use tones(rig, inf.pal.metal).hi' },
];

/**
 * Validate the ledger. Returns one problem string per malformed entry (an exemption without a reason is an error).
 * @param {{rule?:string, subject?:string, reason?:string}[]} [list]
 * @returns {string[]}
 */
export function validateExemptions(list = EXEMPTIONS) {
  const problems = [], seen = new Set();
  list.forEach((e, i) => {
    const at = `EXEMPTIONS[${i}]`;
    if (!e || typeof e !== 'object') { problems.push(`${at} is not an object`); return; }
    if (typeof e.rule !== 'string' || !e.rule.trim()) problems.push(`${at} has no rule id`);
    if (typeof e.subject !== 'string' || !e.subject.trim()) problems.push(`${at} (${e.rule}) has no subject id`);
    if (typeof e.reason !== 'string' || !e.reason.trim()) problems.push(`${at} (${e.rule} / ${e.subject}) has no reason - an exemption without a reason is an error`);
    const key = `${e.rule} ${e.subject}`;
    if (seen.has(key)) problems.push(`${at} duplicates an earlier exemption for ${e.rule} / ${e.subject}`);
    seen.add(key);
  });
  return problems;
}

/**
 * The exemption covering a (ruleId, subjectId) pair, or null.
 * @param {string} ruleId
 * @param {string} subjectId
 * @param {object[]} [list]
 * @returns {{rule:string, subject:string, reason:string}|null}
 */
export function findExemption(ruleId, subjectId, list = EXEMPTIONS) {
  return list.find((e) => e && e.rule === ruleId && (e.subject === subjectId || e.subject === '*')) || null;
}
