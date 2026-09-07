# art-invariants — the executable half of `docs/ART_STYLE.md`

`docs/ART_STYLE.md` is a binding art contract. This directory is the part of it a machine can check. Run it:

```
node tools/art-check.js                    # data + geometry tiers (plain node, ~1 s)
node tools/art-check.js --render           # + the pixel tier (headless Chromium)
node tools/art-check.js --only=palette     # one rule, or a whole namespace
node tools/art-check.js --subject=sootborn # one rig, one faction, one class
node tools/art-check.js --json             # the structured report, for CI
node tools/art-check.js --notes            # also print the measured tables (hidden by default)
npm run art-check                          # same as the first line
node tools/art-invariants/selftest.js      # prove every rule can still fire
```

Exit code is 1 when anything reports a non-exempt **error**, 0 otherwise. Warnings never fail the run.
`--render` needs the repo's global Playwright: `NODE_PATH=/opt/node22/lib/node_modules node tools/art-check.js --render`.
Without `--render` the runner prints every render rule it skipped and why — it never skips silently.
Info notes (the measured tables rules print pass or fail) are hidden in the human report unless you pass
`--notes`; `--json` always carries them, and the **SKIPPED** block is always printed.

`selftest.js` is the other half of the evidence: it clones a reference subject in memory, injects one defect and
asserts the rule fires. It fails if any data/geometry rule has no case, so **a new rule is not finished until it
has one**.

## The calibration principle

**The stage-1 reference content defines the invariants.** Every rule must pass for the four heroes
(`src/content/characters/*.js`), the Brassbound, the Sootborn and the stage-1 boss rigs. If a rule as written
fails reference content, the *rule* is wrong — fix the rule, or record a per-case exemption in `exemptions.js`
with a reason. Never loosen a threshold until everything passes, and never tune one so known-bad art passes.
The Stormcrow faction (`stormcrow:*`, `midboss2:*`, `boss2:*`) is the known-bad control: a suite that does not
flag it is not working.

Every threshold in a rule must be **derived by measuring** the reference cast, and the rule must say in a comment
what range it measured and where the bound sits relative to it.

## Files

| file | owns |
| --- | --- |
| `index.js` | the runner: collects subjects, loads rule modules, runs the tiers, applies exemptions, returns the report |
| `subjects.js` | the subject list, built from the content registries |
| `helpers.js` | every shared pure helper — colour maths, pose walking, the recording mock context |
| `exemptions.js` | the calibration ledger (see its header for the policy) |
| `rules/palette.js` | `data` tier: palette relationships, knobs, proportions, build schema |
| `rules/animation.js` | `data` tier: keyframe schema, the standard anim table, beats, hitboxes, faces |
| `rules/geometry.js` | `geometry` tier: everything derivable from `computeJoints()` and the recorder |
| `rules/render.js` | `render` tier: only what genuinely needs pixels |
| `../art-check.js` | the CLI |

A missing `rules/*.js` is reported as skipped, not as a pass, so the suite is usable while a module is in flight.

## Subjects

```js
{ kind: 'character' | 'enemy' | 'boss-phase',
  id: 'sootborn:cutthroat',   // heroes: 'brunhild'; boss phases: 'boss2:kestrel#2'
  name, def, build, anims, rig,
  // conveniences added by subjects.js:
  type, variant, phase, faction, class, buildError }
```

`rig` is `buildRig(build)`, already built. Boss phases that ship their own `build` are separate subjects because
each is a distinct rig with its own animation table; a phase that only re-skins the AI is not a rig and is skipped.
There are **28 subjects**: 4 heroes, 15 enemy variants, 4 boss base rigs and 5 boss-phase rigs.

`class` is `'hero' | 'human-machine' | 'organic-mook' | 'boss'` (`helpers.classOf`) — the key for per-class baselines.

## Writing a rule module

A `data` or `geometry` module:

```js
export const TIER = 'data';               // or 'geometry'
export const RULES = [{
  id: 'palette/sleeve-vs-primary',        // stable, namespaced; --only and exemptions key off it
  section: 'ART_STYLE §0.1',              // the clause it enforces, quoted section number
  severity: 'error' | 'warn',
  describe: 'One line, in the imperative.',
  check(subject, helpers) { return []; }, // [] = pass
}];
```

`check()` returns `[]` to pass, or findings `{ message, detail, where }`:

* `message` — one line, what is wrong.
* `detail` — the numbers that make it actionable (a string, or an array of lines). Print the measured value **and**
  the bound. Rules whose informational half matters (a value ladder, a coverage number) should emit their table on
  a pass too, as a `severity: 'info'` finding — notes are printed but never counted and never fail the run.
* `where` — where in the subject: `'rig.palette.sleeve'`, `'attack2 #3'`.
* A finding may override the rule's `severity` (`'error' | 'warn' | 'info'`).

A thrown check is reported as an error against that subject, never swallowed. Rules must not mutate the subject's
`def`/`build`; if a rule pokes `rig` (e.g. sets `rig.override`), snapshot and restore with
`helpers.snapshotRigState()` / `helpers.restoreRigState()`.

The `render` module:

```js
export const TIER = 'render';
export const RULES = [ /* same shape, but no check() */ ];
export async function checkAll(subjects, page, helpers) {
  return [{ ruleId, subjectId, message, detail }];   // flat findings
}
```

The runner owns the browser lifecycle. The `page` it hands you:

* is in a context whose `baseURL` is the repo served by `tools/server.js`, so `page.goto('/tools/sheet.html?...')` works;
* carries `page.baseUrl` (the same URL as a string) and `helpers.baseUrl`;
* carries `page.artErrors` — an array of `pageerror:` / `console:` error strings — and `page.clearArtErrors()`.

The `helpers` third argument is the shared helper module plus `baseUrl`, `repoRoot`, **`only`** (the runner's
`--only` selection, so a render module can honour it without sniffing `process.argv`) and
**`skip(what, reason)`** (announce a part of the tier you did not run; it lands in the report's SKIPPED block,
which is printed unconditionally).

If Playwright cannot be loaded the tier fails with an error finding naming the `NODE_PATH` hint; it never passes quietly.

## Exemptions

`exemptions.js` exports `EXEMPTIONS`, entries of `{ rule, subject, reason }`. An entry without a non-empty
`reason` is itself reported as an error. `subject` is a subject id or `'*'`. This is how calibration is
recorded — visibly, per case — instead of by quietly weakening a threshold. The Stormcrows get none.

## What lives in `helpers.js`

Rule modules must not redefine any of this.

**Colour** — `normHex` (lower-cases every hex; authored constants are upper-case and `rgbToHex` output is
lower-case, so normalise before comparing), `isHex`, `lum601`, `wcagLum`, `contrastRatio`, `relDiff` (the §0.1
value measure `|La-Lb| / max(La,Lb)`), `rgbToHsv`, `hueDelta`, `differentHueFamily`, `rgbDistance`,
`expandTones`, `toneFamilies(rig)` (the `{base,hi,sh,rim,deep}` sets over `rig.palette` and `rig.paletteFar`),
`ADJACENCY_PAIRS` / `LADDER_PAIRS`.

**Schema constants**, kept next to a pointer at `rig.js`'s own dispatch: `PART_HOOKS` (the 18 hook names),
`ACCESSORY_ATTACH`, `WEAPON_ATTACH`, `EASE_NAMES`, `FACE` / `FACE_NAMES`.

**Subjects** — `isHero`, `isBoss`, `classOf`, `isFaceless` / `faceProfile`.

**Animation** — `animEntries`, `framesOf`, `eachFrame`, `frameHitboxes`, `isDamaging`, `hitKeys`, `attackAnims`,
`poseValue(frame, 'torso.rot')` (resolves against `DEFAULT_POSE`), `amp(frames, path)`, `mean(frames, path)`,
`resolvePose`, `rootScreen(pose)` (the root projection `tools/sheet.js audit()` uses).

**Geometry** — `makeRecorder`, `wrapHooks(rig, ctx)`, `recordDraw(rig, pose, opts)`, `headSpace(ops)`,
`inRanges`, `snapshotRigState` / `restoreRigState`, `fmt`.

`recordDraw()` runs `drawRig` against a mock 2D context that no-ops the path methods and logs every command with
its style, accumulated transform and device-space geometry. Never pass `o.flash` / `o.tint`: that branch is the
only part of `drawRig` that touches `document`. Op entries look like:

```
{ i, op, fillStyle, strokeStyle, lineWidth, alpha, scale, hook, far, depth, bbox, rw, rh, W, H }
```

`op` is one of `fill`, `stroke`, `clip`, `fillRect`, `strokeRect`, `drawImage`, `enter`, `exit`. `bbox` is in
device space (`{x0,y0,x1,y1,w,h,half}`); `W`/`H` are a rect's device size (raw `w`/`h` times the accumulated
scale, which folds in `rig.scale`); `hook`/`far` name the owning part hook and its near/far side. Drive **every**
keyframe of **every** anim: secondary-motion chains are created lazily on first draw, so a chain used only in a
rarely-played anim is invisible unless the whole table is exercised.

`opts.onGradient` is called for `createLinearGradient` / `createRadialGradient` / `createPattern` — pass a
thrower to ban them.

### `isFaceless` was re-derived

The plan's predicate ("`build.parts.face` exists and is not `rigParts.drawFace`") measures **true for Brunhild,
Rook and Pip**, whose hooks wrap `drawFace`. `faceProfile()` replaces it with a structural measure: record one
neutral head draw and look for a *pair* of eye marks inside the `face` hook. Measured over idle key 0 of all 28
subjects — heroes 5-8 pairs, Sootborn 2, Hoister/Grubbik 2, Vane phase 2 → 2; Brassbound 0, Stormcrow 0, Regent
Engine 0, Grapnel Winch and Kestrel 0. The bound (`>= 1 pair` = has a face) sits in the 0-vs-2 gap.

**Calibration result worth knowing:** the Stormcrow gas masks measure faceless exactly like the Brassbound
lenses — one sighting lens, no eye pair. A rule must therefore not rely on `isFaceless()` alone to flag the
Stormcrows' missing attack faces.
