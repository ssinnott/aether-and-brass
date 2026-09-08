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
  { rule: 'geom/far-palette-leak', subject: 'sootborn:hulk', reason: '2026-09-07: pre-existing leak, src/content/enemies/common.js gobHand paints the GOB.iron wrist chains from the module constant on both sides (3 colours x 79 keyframes) - farTone the chain links; NOT a licence to weaken the rule' },
  { rule: 'geom/far-palette-leak', subject: 'boss:vane#2', reason: '2026-09-07: pre-existing leak, src/content/enemies/boss.js vaneHand paints the 3x3 BLADE knuckle glint on the FAR fist from the module constant (88 keyframes) - use tones(rig, inf.pal.metal).hi' },

  // --- geom/limb-crossings, the Hoister's far arm. Not a rank carrier and not a band on a bone at all: the mark the
  // rule measures is a hoist CHAIN, a prop drawn through a limb hook because that is where it hangs from. The rule
  // anticipates exactly this rig in its own source (rules/geometry.js:368 - "several rigs hook a limb to draw
  // machinery that extends well past it (Pip's frame, the Hoister's pistons)") and guards it with a t-in-[0,1] test;
  // the guard clears most keyframes and misses the ones where the hanging chain happens to project onto the phantom
  // elbowF->handF segment. One entry, one rig, one rule.
  { rule: 'geom/limb-crossings', subject: 'midboss:grubbik', reason: 'the Hoister has no far forearm: midboss.js:158-180 drawChainHook replaces it with the 5-link hoist CHAIN, which hangs straight down from the elbow whatever the boom does (the forearm rotation is undone), lags on a secondary-motion chain and ends in the barbed hook that Hook Yank fires. geom/limb-crossings groups marks by MATERIAL, so the five steel links merge into one bbox and are scored as a single band laid across a bone the art never draws; the 18.8 px is the distance from the elbow to the middle of a hanging chain, not a misplaced cuff. No placement can satisfy the joint test - the chain hangs from the elbow by physics and its centre is half a chain-length below any joint by construction - and the only ways to clear the count are deleting the chain or painting the brass hook head steel so the prop reads as one material, which deletes the Hook Yank tell. The prop was FIXED rather than merely exempted in the same pass (2026-09-08): the hook head was a celRect shank plus a celPoly barb in the same brass, two separately outlined shapes lit off two centres with an outline across the hook\'s own neck, and is now ONE path stroked and filled once; the tell wash was a 0.35 fill painted UNDER the opaque brass that followed it, so it never reached a pixel, and now runs red clipped inside that inked silhouette. The two segments this rig really does draw as bones, armUpper and legUpper, each carry exactly one 6 px band, on the elbow and on the knee' },
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
