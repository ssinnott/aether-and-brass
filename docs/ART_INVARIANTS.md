# Art invariants — the executable half of ART_STYLE.md

`docs/ART_STYLE.md` is binding but it is prose, so nothing enforced it. The Stormcrow faction shipped violating
several of its rules and was only caught when a human put contact sheets side by side. This suite turns as much of
that guide as can honestly be measured into a test.

```sh
npm run art-check                                             # data + geometry tiers, ~2.5 s, no browser
node tools/art-check.js --render                              # + the pixel tier (needs headless Chromium)
NODE_PATH=/opt/node22/lib/node_modules node tools/art-check.js --render
node tools/art-check.js --only=palette --subject=sootborn     # narrow it
node tools/art-check.js --json                                # the structured report, for CI
node tools/art-invariants/selftest.js                         # prove every rule can still fire
```

Exit code 1 on any non-exempt error, 0 otherwise. Warnings never fail the run. Info notes (the measured tables the
rules print pass or fail) are hidden by default — `--notes` prints them, `--json` always carries them.

**Today's numbers.** 28 subjects, 37 rules. The 18 stage-1 reference subjects report **0 errors, 0 warnings**
(5 exempt findings, all one rule — see [The exemption ledger](#the-exemption-ledger)). The 10 known-bad control
subjects report **43 errors and 81 warnings**, and every single finding in a full run lands on one of them.

So **a full run exits 1 today**, on purpose: the Stormcrow faction ships in the tree and is the control this suite
was written to catch. A CI job that must be green right now should run
`node tools/art-check.js --subject=brunhild,sael,rook,pip,brassbound,sootborn,midboss:grubbik,boss:vane`
(the reference cast, exit 0) plus `node tools/art-invariants/selftest.js`, and treat the full run as the report on
the Stormcrows until that art is fixed. Do not narrow a full run with `--only` — some rules are pairwise (§3).

---

## 1. Subjects

`tools/art-invariants/subjects.js` turns the content registries into a flat list of 28 rigs:

| group | subjects | role |
|---|---|---|
| heroes | `brunhild` `sael` `rook` `pip` | **reference** |
| Brassbound | `brassbound:footman` `…:halberdier` `…:sapper` `…:warden` `…:duelist` | **reference** |
| Sootborn | `sootborn:cutthroat` `…:slinger` `…:firebrand` `…:hulk` `…:wrangler` | **reference** |
| stage-1 bosses | `midboss:grubbik` `midboss:grubbik#2` `boss:vane` `boss:vane#2` | **reference** |
| Stormcrows | `stormcrow:crimper` `…:corsair` `…:bosun` `…:galewright` `…:marine` | **control** |
| stage-2 bosses | `midboss2:skree` `…#1` `boss2:kestrel` `…#1` `…#2` | **control** |

A boss **phase** that ships its own `build` is a separate subject (`boss2:kestrel#2`), because each phase is a
distinct rig with its own animation table. `boss.phases[1]` ("REGENT ENGINE — BODY") has anims but no build, so it
is not a rig and is not a subject; nothing measures that table today.

### The calibration principle

**Reference content defines the invariants.** Every rule must be silent on all 18 reference subjects. When a rule
fires on reference art there are three honest responses, in this order: fix the art, fix the rule, or record a
dated per-case exemption. Never loosen a threshold until the known-bad art passes, and never tune a bound to make
the control pass. The Stormcrows are the control: **a suite that does not flag them is not working.**

---

## 2. What the suite checks

### Data tier — `rules/palette.js` (no DOM, no drawing)

| rule | sev | guide |
|---|---|---|
| `palette/sleeve-vs-primary` | error | §0.1 — sleeve must separate from the torso primary |
| `palette/outline` | error | §1, §3 — one near-black 1 px outline colour |
| `palette/value-ladder-adjacent` | warn | §0.1, §3 — adjacent parts separated by value or hue family |
| `palette/beard-vs-garment` | warn | §0.5, §6 — a beard is not the garment colour |
| `palette/faction-signature` | error | §4 — each faction's per-variant signature present, hex, distinct |
| `palette/aether-cyan-concordat` | error | §4 — `#4DF0E0` only on Concordat machinery |
| `palette/faction-variant-divergence` | warn | §0.8, §4 — siblings differ in the core palette keys |
| `palette/shading-knobs` | error | §0.3, §0.4, §1, §9 — `thinR` / `hiMin` / `flatR` / far-limb knobs in band |
| `palette/proportions` | warn | §2 — heads-tall, foot, hand and scale inside an archetype band |
| `palette/build-schema` | error | §5 — only documented part hooks, attach points and weapon fields |

### Data tier — `rules/animation.js`

| rule | sev | guide |
|---|---|---|
| `anim/frame-schema` | error | §8 — valid `dur` / `ease` / `smear` / `face` on every key |
| `anim/base-set-shape` | error | §8, §11 — the standard table with its documented key counts |
| `anim/cycle-durations` | warn | §8 — idle 50-56f, walk 32f, run 24f (banded above rig scale 1.8) |
| `anim/idle-breathes` | error | §1, §8, §11 — idle is a breathing loop, not a held pose |
| `anim/locomotion-shape` | warn | §8, §11 — walk bob + mirrored halves, run lean + stride |
| `anim/squash-stretch-beats` | error | §8, §11 — jump / land / getup squash beats |
| `anim/attack-ease-coverage` | error | §8, §11 — **the highest-signal rule in the suite** (below) |
| `anim/attack-beats` | warn | §8, §11 — anticipation, smear hit, hold, follow-through |
| `anim/hitbox-placement` | error | §8, §11 — hitbox on the hit keys and nowhere else |
| `anim/face-expression-set` | error | §6, §8, §11 — the documented face on hurt / lying / dead / dodge |
| `anim/attack-face-aggressive` | warn | §6, §8, §11 — effort on the face, on rigs that have one |
| `anim/legs-explicit` | warn | §8 — no key inherits its leg pose |

### Geometry tier — `rules/geometry.js` (drives `computeJoints` + a recording 2D context; still no DOM)

One shared pass per subject drives **every keyframe of every anim** through the joint solver and three recorded
draws (normal, a determinism re-draw, and a `rig.override` flash pass): 2233 keyframes, ~2.2 s for the whole tier.

| rule | sev | guide |
|---|---|---|
| `geom/outline-stroke-contract` | error | §0.2 — outline stroke at `2*ow` under every fill; never fake a boundary |
| `geom/far-palette-leak` | error | §0.3, §5 — far parts colour from `info.pal`, never a near constant |
| `geom/flash-purity` | error | §3, §5, §11 — only white + outline while `rig.override` is set |
| `geom/draw-hygiene` | error | §1, §3, §5 — no gradients/patterns, deterministic, transform-balanced |
| `geom/pose-audit` | error | §0.8, §5, §11 — SNAP / GRIP / FLOOR (promoted from `tools/sheet.js` `audit()`) |
| `geom/chain-contract` | error | §7 — chain count, anchor, parameter bands and settling stability |
| `geom/rest-pose-open` | warn | §0.6, §8 — weapon head off the floor, head in front of the hip |
| `geom/outline-coloured-seam` | warn | §0.2, §3, §11 — internal seams in a tone, not the outline colour |
| `geom/detail-floor` | warn | §0.7, §5 — sub-2 px marks not worse than the class reference |
| `geom/glow-flat-and-cored` | warn | §4 — glow marks flat, no tone ramp |
| `geom/draw-budget` | warn | §9, §11 — cel shapes, clips and commands per keyframe |

### Render tier — `rules/render.js` (`--render`; headless Chromium over `tools/server.js` + `tools/sheet.html`)

| rule | sev | guide |
|---|---|---|
| `render/silhouette-distinctness` | error | §0.8, §4, §11 — pairwise silhouette IoU inside a faction |
| `render/squint-readability` | warn | §0.8, §11 — distinct colours surviving the 0.5× downsample |
| `render/bench-budget` | warn | §9 — scale-normalised per-draw cost, budget derived per run |
| `render/sheets-and-playtest-green` | error | §10, §11 — every sheet and every boss-phase frame renders clean |

The runner owns the browser: it serves the repo on an ephemeral port, opens one page and hands it to `checkAll()`.
Without `--render` all four rules are listed under **SKIPPED** with the reason — never a silent pass. If Playwright
cannot be resolved, `--render` fails with `render/tier` and exit 1, with the `NODE_PATH` hint.

### The three Stormcrow defects, and what catches them

1. **`palette.sleeve === palette.primary`** (§0.1, "the single biggest de-blobbing win") →
   `palette/sleeve-vs-primary`, 10 errors. Reference measures a 0.21-0.73 rec-601 relative difference; all five
   Stormcrows and all five stage-2 boss rigs measure exactly 0.000 against a 0.18 bound.
2. **Attacks with no ease, no smear, no anticipation** (§8) → `anim/attack-ease-coverage`, 10 errors: eased-key
   coverage over attack anims is 0.957-1.000 on every reference def and exactly **0.000** on all ten control
   subjects. `anim/attack-beats` adds the per-beat detail as warnings.
3. **Five variants, one silhouette** (§0.8) → `render/silhouette-distinctness`, 6 errors. It is discriminating
   rather than blanket: crimper/corsair/galewright are one shape (IoU 0.885-0.938 against a 0.79 bound) while
   `bosun` (0.66-0.69, the powder keg) and `marine` (0.37-0.49, scale + wing-shield) are legitimately distinct and
   correctly do not fire.

---

## 3. What the suite deliberately does NOT check

Each of these was attempted, measured, and dropped. They are listed so nobody re-derives them, and so nobody reads
a green run as "the art is good".

**Perceptual judgements. No proxy for them survived calibration.**
- §0.8's actual squint test ("does it still read as a person with a weapon"). The render tier measures colour
  count instead. Connected-component count, the "largest non-body blob" weapon proxy and silhouette fill ratio were
  all measured and all **overlap** between reference and control (reference legitimately measures a *single*
  component — a paper doll is connected by construction — while controls measure 2-9, i.e. more, not fewer). They
  are printed as notes, never asserted.
- §0.5 face layout ("nothing sits on the eye row", "hats above the hairline"). Head geometry is authored per rig;
  no measurable form separated reference from control.
- §4's "faction read" (warm hero / cold Brassbound / soot) beyond the exact signature-hex checks.
- Whether a design is *good*. The suite checks contract compliance, not art direction.

**Clauses whose literal text fails reference content.** These are guide bugs, not art bugs. Each is recorded in a
`DOC_BUGS` constant in its module and printed in the failing rule's detail line, so the divergence is visible at
the point of use. The suite ships the corrected form.
- §0.1 "every adjacent pair differs by ≥ 25 % luminance" — fails brunhild (skin/sleeve 0.046), sael
  (primary/secondary 0.079) and every Sootborn. Shipped as a **per-class non-regression baseline** instead.
- §2's heads-tall and scale tables are stale (sael measures 4.26 against a documented 3.5-4; pip 4.72 against 3;
  the Hoister 1.90 against 2.0; the Regent Engine 2.45 against 2.8). Shipped as two archetype bands, squat
  [2.6, 3.3] and standard [3.8, 5.4], with the 3.3-3.8 gap flagged as "commit to an archetype".
- §3's outline hexes are a guide, not a contract (pip ships `#1B1820`). Only "1 px, near-black, high contrast
  against the rig's lightest key" is asserted; a literal "contrast ≥ 4.0 against `palette.primary`" fails six
  reference rigs (as low as 1.07).
- §0.2 "an outline under every fill" — `celCapsule` / `celTaper` / `celBall` paint their own tone bands as bare
  fills, so the unconditional form fires hundreds of times per rig. Asserted as the **stroke+fill pairing**
  (`outlinePath`'s signature) plus a faked-internal-boundary test. Two reference rigs draw hand-rolled
  outline-coloured *lines* (`boss.js` engineDome at width 1, `sootborn.js` drawNet at width 3); those are reported
  as a note, not failed.
- §4 "every glow mark gets a 1-2 px hot core" — fails the Sootborn eyes, Grubbik's lens, Vane's core window and
  sael's arc. Only the FLAT half is asserted; core coverage is a metric.
- §0.7 "nothing under 2 px" — has **no separating threshold at all**: reference heroes carry *more* sub-2 px marks
  per keyframe than the Stormcrows do. Shipped as a per-class non-regression baseline.
- §8's walk head-bob (7 reference subjects hold the head rigid), run `face: angry` (reference measures neutral,
  the control already uses grit — zero separating power), dodge tuck keys `closed` (the Sootborn use grit),
  "lying is dazed" (fails 19 of 28), the literal `ease: 'inout'` follow-through (sael attack4 uses `in`) and the
  literal jump key-1 `0.94 / 1.08` pair (Brassbound use 0.96 / 1.04). Each is shipped as a band or a set, or
  dropped to a note.
- §9's per-category draw counts are not reproducible (the documented 76 fills / 43 strokes / 19 clips / 137 rects
  for brunhild measure 77 / 37 / 15 / 95). Re-derived from the recorder as per-keyframe maxima.

**Things another tool already owns.**
- `tools/playtest.js boot select combat gallery` is wired into `render/sheets-and-playtest-green` but is **opt-in**
  behind `ART_CHECK_PLAYTEST=1`, and announced in SKIPPED when it is off. It is a game-logic gate, it costs ~60 s,
  and it should run as its own CI job so a browser flake can never be mistaken for — or mask — an art regression.
- `tools/sheet.js` `audit()` and `bench()` still exist for interactive use. `audit()`'s logic is promoted into
  `geom/pose-audit` (with two fixes: GRIP is gated on `rig.weapon.twoHanded`, and FLOOR uses an explicit
  ground-state allowlist instead of a blocklist regex that missed `hop` / `flee` / `panic` / `stagger`). The
  duplication is deliberate for now — `window.__sheet.audit` is part of `tools/sheet-capture.js`'s contract.

**Structural blind spots worth knowing.**
- `palette/beard-vs-garment` is blind to a beard hook that paints a local constant rather than `palette.hair`.
- The aether-cyan and `face:` literal checks include a repo-wide source grep, reported against the canonical
  subject `brunhild`; a `--subject` filter that excludes brunhild skips them.
- Pairwise rules (faction signature uniqueness, variant divergence, silhouette distinctness) rebuild the faction
  roster themselves and emit each pair once, so a narrow `--subject` filter can hide a pair finding.
- `render/silhouette-distinctness` compares *siblings within a faction* only. A boss phase is the same character in
  another state, not a sibling variant, so phases are not compared against their base rig.
- `anim/attack-face-aggressive` cannot flag the Stormcrows and no honest form of it can. Recording one head draw at
  `face: neutral` against angry / shout / grit shows the Brassbound lenses, the Regent Engine **and** every
  Stormcrow gas mask produce an identical command stream: `pose.face` has no visual consequence on those rigs.
  The rule scopes itself to expression-capable rigs, measured by that probe rather than by faction name. Flagging a
  blank Stormcrow attack face would be flagging something a viewer can never see. **This is worth a line in §6.**

---

## 4. How the thresholds were derived

Every numeric bound in the suite was measured over all 28 subjects *before* it was chosen, and sits just outside
the reference range — never fitted, never trimmed to make the control fail. Three shapes recur:

1. **Exact contracts** — no tolerance, because reference measures one value with no exceptions: `rig.ow === 1`
   (28/28), `snap` integers on 17 joints (28/28), zero gradients or patterns (28/28), zero non-white fills in the
   flash pass (~74k fills), `paletteFar === farPalette(palette, farShade, farDesat)`, the 18 part-hook names.
2. **Bands with slack outside the reference range** — e.g. sleeve/primary `d >= 0.18` against a reference floor of
   0.208 (rook) and a control measurement of 0.000; idle loop 50-56f (the guide's own band, and reference measures
   52 or 54); walk root bob amplitude `>= 1` (reference floor exactly 1); attack-ease coverage `>= 0.85` against a
   reference floor of 0.957 and a control value of 0.000. Where a bound had to move to admit reference art it moved
   **outward** and the move is recorded (chain `rotGain` ceiling 0.8, because `boss:vane#2`'s queue sits on 0.70;
   dodge key count [4,5], because the reference `midboss:grubbik#2` ships a 4-key dodge).
3. **Per-class non-regression baselines** — for the two clauses where no universal bound exists (§0.1's value
   ladder and §0.7's detail floor). The baseline is the *stage-1 minimum for that class and that pair*, minus a
   small rounding slack, snapshotted in the module. These do not encode a quality standard; they encode "no worse
   than the reference cast of the same archetype". Classes are `hero`, `human-machine`, `organic-mook`, `boss`.

`render/bench-budget` is the one machine-dependent rule. It checks in **no millisecond number at all**: the budget
is 1.5× the slowest *reference* subject measured in the same run. If a run contains no reference subject it prints
"budget could not be derived — nothing was asserted" rather than inventing one.

---

## 5. How to add a rule

1. Pick the tier. If it needs only `def` / `build` / `anims` / a built `rig`, it is `data`. If it needs
   `computeJoints` or a recorded draw, it is `geometry`. Only pixels need `render`.
2. Add it to the module's `RULES` array:

```js
export const TIER = 'data';                       // or 'geometry'
export const RULES = [{
  id: 'palette/sleeve-vs-primary',                // stable, namespaced; --only and exemptions key off it
  section: 'ART_STYLE §0.1',                      // the clause it enforces, quoted
  severity: 'error',                              // 'error' fails the run; 'warn' does not
  describe: 'Give the sleeve a colour that separates from the torso primary.',   // one line, imperative
  check(subject, helpers) { return []; },         // [] = pass; else [{ message, detail, where }]
}];
```

A finding may set `severity: 'info'` to print a measured table without counting or failing — use it to show the
number a rule is asserting on, pass or fail. Render rules omit `check` and are driven by
`export async function checkAll(subjects, page, helpers)` returning `{ ruleId, subjectId, message, detail }`.
`helpers.only` carries the runner's `--only` selection and `helpers.skip(what, reason)` announces a part of the
tier that did not run.

3. **Measure before you bound.** Run the candidate over all 28 subjects, print the range for reference and for
   control, and put the bound in the gap. If there is no gap, you have not found a measurable rule — report it as
   a note or drop it. If the rule fires on reference, the rule is wrong until proven otherwise.
4. **Add a case to `tools/art-invariants/selftest.js` in the same commit.** It clones a reference subject, injects
   exactly one defect and asserts the rule is quiet before and loud after. The selftest fails if any data or
   geometry rule has no case, so a rule is not finished until it has one. Today: 36 cases, 33/33 rules covered.
5. Note the calibration in the module (a `THRESHOLDS` constant, or a `DOC_BUGS` entry if the guide's literal text
   had to be corrected) and update this file.

---

## 6. The exemption ledger

`tools/art-invariants/exemptions.js` records, per case, a rule that a specific subject is allowed to fail:

```js
{ rule: 'geom/far-palette-leak', subject: 'sootborn:hulk', reason: '2026-09-07: pre-existing leak, …' }
```

An entry without a non-empty `reason` is itself reported as an error, and so is a duplicate. An exempted finding is
still **printed in full**, marked `exempt` with its reason — it drops out of the error count but never out of the
report. That is the whole point: calibration is recorded visibly, per case, instead of by quietly weakening a
threshold. `subject: '*'` exists but should be expected to justify itself in review. The control faction
(`stormcrow:*`, `midboss2:*`, `boss2:*`) gets no exemptions, ever.

**The ledger today is a to-do list for the art, not a softened rule.** All four entries are the same §0.3 defect —
a module constant painted on a far part at near brightness — in three shared hooks, and each names its one-line
fix:

| subject | hook | leak |
|---|---|---|
| `sootborn:firebrand` | `common.js` `gobCuffArm` | `build.clan` + its `sh` tone on both sides (2 colours × 66 keys) |
| `midboss:grubbik#2` | `common.js` `gobCuffArm` | the same defect with Grubbik's band colour (× 91 keys) |
| `sootborn:hulk` | `common.js` `gobHand` | `GOB.iron` wrist chains from the module constant (3 colours × 79 keys) |
| `boss:vane#2` | `boss.js` `vaneHand` | the 3×3 `BLADE` knuckle glint on the far fist (× 88 keys) |

One fix in `common.js` clears the first three. They were left in place deliberately: changing a rig's colours is an
art change and belongs in a commit where a human reviews the contact sheets, which is the very thing this suite
exists to support. The idiom to use is the one `sael.js` (`GLOVE_FAR`), `brunhild.js` (`tones(rig, LEATHER).sh`)
and `boss.js` (`GUN_F` / `DARK_F`) already use. (§0.3 names a `farTone()` helper that does not exist in the
codebase — `farShade()` in `src/art/palettes.js` is the real one.)

---

## 7. What a reviewer should look at sceptically

- **The four reference exemptions.** They are real defects, but four entries on one rule is exactly the shape a
  wrong rule makes. The counter-evidence is that the same rule catches all ten control subjects on the identical
  measure, and that each entry names a specific hook and a specific fix.
- **The per-class non-regression baselines** (`palette/value-ladder-adjacent`, `geom/detail-floor`). They are
  snapshots, not standards. `stormcrow:bosun`'s torso/hips ladder finding sits 3 thousandths under its baseline,
  and pip sits 4 % under the mook command budget — both will move if the class assignment in `helpers.classOf` or
  the art changes.
- **`geom/pose-audit`'s GRIP half rests on one rig.** Brunhild is the only two-handed rig in the cast, so the
  reach tolerance (`+3` px over a worst measured `+2.3`) is calibrated on a single subject.
- **`render/bench-budget` must be re-baselined per host** and should be its own CI job.
- **The `--only` and `--subject` filters can hide pairwise findings** (see §3). CI should run the suite unfiltered.
- **`anim/attack-face-aggressive` is currently silent on the whole cast** — 16 subjects skip it as expressionless
  and the rest pass. It has teeth (the selftest proves it), but it is doing less work than its name suggests.

## Known gaps (mutation testing, 24 injected defects, 12 caught)

The suite was mutation-tested by injecting defects and checking whether it fired. It caught 12 of 24. The misses
are recorded here rather than quietly left, because a suite's blind spots are part of its contract:

| defect injected | why it survived |
| --- | --- |
| smear removed from a swing hit key | `anim/attack-beats` is warn-only; no error covers smear |
| `punish: true` removed from a recovery key | **no rule reads `punish`** |
| one ground key left without `legR`/`legL` | `anim/legs-explicit` has a budget of 1, so the first offence is free |
| 140 deg jump between adjacent non-smear keys | no rule; the hold clause is scoped to `attack1..attack4` |
| boots given the same value as trousers at a different hue | `palette/value-ladder-adjacent` silent on the mutated pair |
| aether cyan re-exported from `src/art/palettes.js` | the rule greps `src/content` for the literal |
| near-miss cyan `#4CEFE1` (RGB distance 2) | the rule matches the literal, not a distance |
| outline dropped from a shape drawn with `fillRect` | now reported by `geom/outline-rect-boundary` (warn) |
| outline dropped where the colour is a module constant | the check is gated on palette base colours |
| second highlight band stacked on a limb | no rule |
| rig floating 6 px off the floor on a ground key | `geom/pose-audit` did not fire |
| hat moved down onto the eye row | the eye-row rule was dropped as too false-positive-prone |

### The calibration ceiling

`geom/outline-rect-boundary` is a warning, not an error, and the reason is worth stating plainly. Widening the
faked-boundary check to cover `fillRect` fires on the stage-1 reference cast as well: 264 substantial unoutlined
accent rects on Brunhild alone, mostly weapon bands. The suite is calibrated so that reference content defines
the invariants and must report zero errors -- which is right for consistency, but it means the suite cannot set a
quality ceiling above what we already draw. Where the reference itself fakes boundaries, the suite has been
taught to accept it.

Promoting this rule to error is therefore an art decision, not a threshold tweak: outline the reference cast
first, then raise the severity.
