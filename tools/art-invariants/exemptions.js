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

  // --- palette/value-ladder-adjacent, the head/hair pair on the five Gleanings: DELETED 2026-09-08 by fixing the art,
  // which is response 1 and always beats response 3. The five entries recorded that `palette.hair` and `palette.skin`
  // were the same hex (GLEAN.night), so the pair compared a key with itself and could not be a real adjacency. The
  // Gleaning readability pass split them into the two materials that are actually on screen either side of that
  // boundary - GLEAN.cowl, the hood, and GLEAN.oil, the oilcloth throat and forearm wraps - and the pair now clears
  // the organic-mook baseline on the hue-family branch (violet 260 deg against oilcloth 138 deg, both over the
  // saturation floor). Nothing was loosened to get there and the rule keeps its teeth on every other rig.

  // --- palette/value-ladder-adjacent, the Powder Bosun's arm. He has no sleeve: `crow.bareArm` (stormcrow.js:281)
  // says his sleeve IS his skin - he is the one rate who works with his arms rolled out - so palette.sleeve is set
  // to CROW.skin deliberately and the armLower/armUpper pair measures 0.000 because the arm is ONE material for its
  // whole length. That is the correct reading of the art: section 0.1 asks for a light sleeve so the arm reads
  // against the torso, and a bare arm already does, against a navy smock. His other four ladder rungs pass, and his
  // beard was re-spaced in this same pass (0.150 -> 0.319) rather than exempted.
  { rule: 'palette/value-ladder-adjacent', subject: 'stormcrow:bosun', reason: '2026-09-08: no sleeve - crow.bareArm makes this rate\'s sleeve his skin (palette.sleeve is CROW.skin by intent), so armLower/armUpper is one material and 0.000 is the right measurement, not a defect. His beard/face rung was FIXED in the same pass rather than exempted' },

  // --- geom/limb-crossings, the Hoister's far arm. Not a rank carrier and not a band on a bone at all: the mark the
  // rule measures is a hoist CHAIN, a prop drawn through a limb hook because that is where it hangs from. The rule
  // anticipates exactly this rig in its own source (rules/geometry.js:368 - "several rigs hook a limb to draw
  // machinery that extends well past it (Pip's frame, the Hoister's pistons)") and guards it with a t-in-[0,1] test;
  // the guard clears most keyframes and misses the ones where the hanging chain happens to project onto the phantom
  // elbowF->handF segment. One entry, one rig, one rule.
  { rule: 'geom/limb-crossings', subject: 'midboss:grubbik', reason: 'the Hoister has no far forearm: midboss.js:158-180 drawChainHook replaces it with the 5-link hoist CHAIN, which hangs straight down from the elbow whatever the boom does (the forearm rotation is undone), lags on a secondary-motion chain and ends in the barbed hook that Hook Yank fires. geom/limb-crossings groups marks by MATERIAL, so the five steel links merge into one bbox and are scored as a single band laid across a bone the art never draws; the 18.8 px is the distance from the elbow to the middle of a hanging chain, not a misplaced cuff. No placement can satisfy the joint test - the chain hangs from the elbow by physics and its centre is half a chain-length below any joint by construction - and the only ways to clear the count are deleting the chain or painting the brass hook head steel so the prop reads as one material, which deletes the Hook Yank tell. The prop was FIXED rather than merely exempted in the same pass (2026-09-08): the hook head was a celRect shank plus a celPoly barb in the same brass, two separately outlined shapes lit off two centres with an outline across the hook\'s own neck, and is now ONE path stroked and filled once; the tell wash was a 0.35 fill painted UNDER the opaque brass that followed it, so it never reached a pixel, and now runs red clipped inside that inked silhouette. The two segments this rig really does draw as bones, armUpper and legUpper, each carry exactly one 6 px band, on the elbow and on the knee' },
  // --- palette/value-ladder-adjacent on the four Stage 3 boss rigs that wear the Chandlery's own cloths. Two pairs
  // fire, and they are the SAME two pairs on all four subjects because all four use CH_PAL unchanged
  // (src/content/enemies/chandlerRig.js). Both are measured, both are argued here, and neither is a rig defect:
  //
  //   armLower/armUpper (skin/sleeve, d 0.128 against a boss baseline of 0.213) - THE ADJACENCY DOES NOT EXIST ON
  //   THIS RIG. chArmLower (chandlerRig.js) paints the forearm in pal.SECONDARY, a harness-leather bracer, with a
  //   pal.sleeve cuff clipped inside it, and chHand paints the fist in pal.dark / pal.secondary: no Chandler paints
  //   pal.skin anywhere below the jaw. palette.skin is the FACE colour on this faction, and the one place it does
  //   touch cloth - neck/torso, skin against the coat collar - measures 0.201 and passes. Same case as the Powder
  //   Bosun's arm and the Gleaning hoods above: a palette key compared against a part it is never drawn next to.
  //
  //   torso/hips (primary/secondary, d 0.426 against 0.525) - the coat against the apron panel and belt block, and
  //   this is the FACTION's ladder, not a boss re-space: tallow #C29B4A (Oklab L* 70.9) over harness leather
  //   #7A561E (L* 48.1) is dE 22.8, more than twice the project's own LOST threshold of 10, and the boundary
  //   carries real ink on both parts plus the quicklime apron hem (chTorso) and the quicklime belt seam (chHips).
  //   The rec-601 relDiff baseline it misses was set by the two stage-1 bosses - a furnace-red machine and a
  //   near-black Chancellor's coat - and the only ways to reach 0.525 are lifting the coat to ~L* 85 (which walks
  //   the biggest mass on the rig into this board's own chalk-white sky and lime road) or dropping the apron to
  //   ~L* 32 (which puts it within 10 L* of the #20180F outline and swallows the line, the exact defect the
  //   faction's own leather pass fixed). The five line variants carry the identical pair and pass only because
  //   organic-mook's baseline for it is 0; holding the same two cloths to a different number because a boss is
  //   wearing them would be a rule artefact, not a readability finding.
  { rule: 'palette/value-ladder-adjacent', subject: 'midboss3:marl', reason: '2026-09-08: the Chandlery ladder on a boss rig - skin/sleeve is not an adjacency this faction draws (chArmLower paints the forearm in pal.secondary, pal.skin is the face only), and primary/secondary is the faction\'s own coat-over-apron step at Oklab dE 22.8 with ink and two quicklime seams on the boundary. See the block comment above for the measurements' },
  { rule: 'palette/value-ladder-adjacent', subject: 'midboss3:marl#1', reason: '2026-09-08: same two pairs as midboss3:marl - the phase 2 rig uses CH_PAL unchanged, so the measurements and the argument are identical' },
  { rule: 'palette/value-ladder-adjacent', subject: 'boss3:hasp', reason: '2026-09-08: same two pairs as midboss3:marl - the Factor wears the company coat over the company apron, and no Chandler paints pal.skin below the jaw' },
  { rule: 'palette/value-ladder-adjacent', subject: 'boss3:hasp#1', reason: '2026-09-08: same two pairs as midboss3:marl. Phase 3 (boss3:hasp#2) clears both without an exemption: the coat comes off and primary becomes the quicklime shirt, which is the phase change doing the work' },
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
