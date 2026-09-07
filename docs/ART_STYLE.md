# AETHER & BRASS — Character Art & Animation Style Guide (binding)

This guide governs every rig drawn through `src/art/rig.js`: the four heroes, the ten enemy variants, the two bosses
and any prop that borrows the rig helpers. It supersedes the renderer line of `docs/GDD.md` §1 ("2px outlines, flat
fills") — the outline is now **1 px** and fills are **3-tone cel bands**. Everything else in the GDD (palettes, silhouettes,
accessories, tells) still applies; `docs/RECONCILIATION.md` still wins on numbers (rig scale ×1.4, floor band, physics).

**Canonical reference:** `src/content/characters/brunhild.js` (rig build, custom parts, secondary motion, full
animation set). When in doubt, do what Brunhild does. Contact sheets of the reference live in
`tools/sheet.html?char=brunhild` (see §10).

---

## 1. The look in one paragraph

Chunky 16-bit arcade sprite (Shredder's Revenge / Metal Slug energy): big heads, big hands, big boots; one crisp
**1 px near-black outline** around every silhouette; **three flat tones per colour** (highlight / base / shadow) laid
down as hard bands with a **top-left light**; no gradients, no soft alpha except smears and steam; joints snapped to
whole pixels at 1×; **everything moves** — idle breathes, cloth and hair lag, weapons smear, hits overshoot and hold.

## 2. Proportions

| | heads tall | standing height (scale 1) | notes |
|---|---|---|---|
| Heroes (Sael, Rook) | 3.5–4 | 76–84 px | `headR` 9–10, long legs for Sael (`upperLeg`/`lowerLeg` 17–18) |
| Heroes (Brunhild, Pip) | 3 | 62–70 px (Pip's rig 80+) | squat: `torsoW` 28–30, `hip` 24–26, `legR` 6.5 |
| Brassbound | 3.5 | ~72 px | rigid, rectangular; `bulge: 0` for machine limbs |
| Sootborn | 2.5–3 | ~60 px (`scale` 0.85) | hunched: `torso` lean 12–15° in every pose, `headR` 11+ |
| Cinder Hulk / Iron Warden | 3 | `scale` 1.35 / 1.45 | |
| Hoister / Regent Engine | — | `scale` 2.0 / 2.8 | unique builds; still the shared joint set |

Height at scale 1 = `upperLeg + lowerLeg + footH - 2 + torsoH - 2 + neck + headR*2`. Multiply every GDD pixel size by
1.4 (RECONCILIATION) and round to whole pixels. Hands: `handR` 4.5–5.5 (fists read from across the screen). Feet:
`footL` 11–13. Set `proportions.bulge` (0..1, default 0.5) for tapered "heroic" limbs — thighs and upper arms swell at
the joint, shins and forearms narrow — and `neckR` for thick or thin necks.

## 3. Light, tones, outline

* **Light direction:** top-left in root space (`LIGHT_X = LIGHT_Y = -0.7071`). `enter()` in rig.js rotates
  `rig.light` into every part space, so the same code shades a raised arm correctly. Never hard-code a shadow side.
* **Ramp:** every colour gets `tones(rig, hex)` → `{ hi, base, sh, rim, deep }` from `RAMP = { hi: 1.22, sh: 0.66,
  rim: 1.55 }` (shadows drift cool/blue, highlights warm). Override per rig with `build.ramp` only for machines
  (`sh: 0.6` for gunmetal reads harder).
* **Band rules:** shadow covers ~35 % of a part from its far side; highlight is a thin cap on the lit edge; a 1 px `rim`
  on the top/lit edge of hard-edged metal only (`rimRect`). Details (buckles, rivets, straps) are `flat` fills without a
  ramp. Max three tones per material — do not stack extra highlights.
* **Outline:** 1 px, colour `build.outline` (heroes `#1E1A22`, Brassbound `#1A1E24`, Sootborn `#1E1A14`). Draw it via the
  helpers (`outlinePath`) — a stroke 2·ow wide *under* the fill so exactly 1 px shows. Internal seams are 1 px of the
  `sh`/`deep` tone, not outline colour.
* **Far limbs:** the rig passes `rig.paletteFar` (`farPalette`: 0.62 × brightness, 25 % desaturated, slightly cool) to far
  parts; do not darken twice. `build.farShade` / `build.farDesat` override.
* **Value rule (readability pass):** every pair of *adjacent* parts differs by ≥ 25 % luminance **or** a hue-family
  change — skin = light warm, cloth = mid, metal = distinctly light or dark. Upper arms and cuffs take `palette.sleeve`
  (defaults to `primary`): give it a light shirt colour so the arms read against the torso. Trousers, boots and the
  floor must not share a value (a mid leather boot with a light steel toe, not iron on iron).
* **Two-tone rule:** cel parts narrower than ~8 px (`r < 4`, `shading.js THIN_R`) get base + shadow only; highlight
  bands live on big shapes (torso, head, weapon head). `build.thinR` overrides.
* **Contact shadow:** the renderer draws a 1 px translucent dark capsule under the near arm and near leg
  (`build.contactShadow`, alpha 0.3) so a limb crossing the torso separates from it. Weapons and accessories do not get
  one — keep them from crossing the torso in rest poses instead.
* **Hit flash:** while `rig.override` is set, draw only outline + flat fill and return early (see every Brunhild part).

## 4. Palette usage

* Heroes: saturated warm primaries + one metal (GDD §2 palettes verbatim). Cast readability test: idle poses of all
  four side by side (`mode=cast`) must be tellable apart at 1× in 100 ms.
* Brassbound: cold metals (`#7F8C99` steel, `#4A5563` dark steel, `#C89B3C` brass joints) + the regiment stripe.
  **Aether cyan `#4DF0E0` is Concordat-only** — lens, core window, boss tells, meter pickups. Heroes never wear it; the
  Brassbound lens turning `#FF5C5C` is always the attack tell.
* Sootborn: warm soot (`#6BA84F` skin, `#3F6B2E` shade, rags `#5A4A3A`) + clan colour + the brass badge.
* Glow colours (boiler fire, lenses, muzzle) are flat, no ramp, and get a 1–2 px `#FFD27A` hot core.
* Keep per-rig extra constants local to the content file (`SHIRT`, `LEATHER`, `IRON`, `LENS` in brunhild.js).

## 5. Authoring parts, accessories and weapons

All hooks receive `(ctx, rig, pose, info)` in a local space set up by rig.js: origin at the joint, **+x along the limb**
for limbs/hands/weapons, torso space origin at the hip centre (y up negative), head space origin at the head centre,
facing right. `info` (`{ name, far, pal, len, r, w, h, color }`) is a reusable object — never retain it. Helpers
(`src/art/shading.js`): `celRect`, `celPoly`, `celBall`, `celCapsule`, `celTaper`, `celPath` (any path you traced),
`flat`, `outlinePath`, `rimRect`, `tones`, `pathRR`. Default renderers (`src/art/rigParts.js`) are exported so you can
compose: `drawBoot`, `drawFist`, `drawBelt`, `drawSkull`, `drawHairCap`, `drawFace`, `drawMouth`, `drawTorsoShape`,
`drawLimbSegs`, `drawCuff`, `drawNeck`, `drawStick`.

Part hooks: `head face beard hair hat neck torso hips back shoulder armUpper armLower hand legUpper legLower foot weapon
smear`. Accessories: `{ attach: 'head'|'torso'|'back'|'hip'|'handR'|'handL'|'root', layer?: 'back', draw(ctx, rig, pose) }`
(`back`/`layer:'back'` draw behind the body, others in front). Weapon: `{ attach: 'handR', length, draw, twoHanded?,
grip? }` drawn in hand space with +x along the handle; `length` sets `joints.weaponTip` for FX.

```js
// a boot: reuse the default, add an iron toe (brunhild.js)
function drawBootB(ctx, rig, pose, inf) {
  drawBoot(ctx, rig, inf.w, inf.h, PAL.secondary, PAL.accent);
  if (rig.override) return;                       // hit flash: silhouette only
  const toe = R(inf.w * 0.62);
  ctx.fillStyle = tones(rig, IRON).base; ctx.fillRect(toe - 4, 0, 4, 3);
  ctx.fillStyle = tones(rig, IRON).hi;   ctx.fillRect(toe - 4, 0, 3, 1);
}
// a head accessory: goggles on the forehead
function drawGoggles(ctx, rig) {
  const r = rig.p.headR;
  for (let i = 0; i < 2; i++) {
    const cx = i ? R(r * 0.45) : R(-r * 0.15), cy = R(-r * 0.62);
    celBall(ctx, rig, cx, cy, 4, PAL.accent, false);
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fillStyle = rig.col(LENS); ctx.fill();
  }
}
// a two-handed weapon: hand space, +x along the handle; the far hand is solved onto the handle by pose.grip
weapon: { attach: 'handR', length: 40, draw: drawHammer, twoHanded: true, grip: 18 }
```

**Detail floor:** anything under 2 px at 1x is noise, not detail — no 1 px rivets, gauge needles, studs or wrap
stripes; one buckle per boot, one seam per garment, bands ≥ 3 px, one shape per material rather than stacked clumps.

Rules: integer coordinates (`R = Math.round`) for every detail rect; silhouettes first, details after the
`rig.override` early return; no per-frame allocation (no arrays/objects/strings inside draw — `tones()` caches, the
palette constants are module-level); `rig.col(hex)` for any raw colour so the flash still works; procedural motion uses
`rig.tick` (counts draw calls: the boiler puffs on `rig.tick % 20`). **Far-side parts take their colours from
`info.pal`** (`inf.pal.skin`, `inf.pal.secondary` …), never from the module palette — `rig.js` hands far limbs
`rig.paletteFar`, and a hand or boot hook that hard-codes `PAL.skin` draws the far fist as bright as the near one (the
first Brunhild pass did exactly that). Steam and smoke are the only soft marks on a rig: no outline, merged discs,
alpha fading with height (`puff()` in brunhild.js); an outlined `celBall` at 85 % alpha reads as a cannonball.

### Two-handed weapons: the grip must be reachable

`weapon.grip` is the far hand's spot along the handle, measured from the near hand (**negative = toward the pommel**).
`rig.js` solves the far arm with 2-bone IK toward that point; when the point is farther than `upperArm + lowerArm`
from the far shoulder the arm stretches straight toward it and the far fist stays *attached to its wrist* (it is drawn
on the handle at the joint it actually reached, never teleported). A stretched-straight far arm every hit frame is the
tell that the grip is out of reach. Two facts drive the authoring:

* The far shoulder sits `2·shoulderX + 2` px behind the near one, so with both arms extended the same way the far
  hand is always ~8 px short. **Stack the hands** (`grip: -8`, fists touching like a bat grip) instead of spreading
  them 18 px apart along the handle — Brunhild's reach went from "unreachable in 50 keys" to "reachable in all but
  the uppercut peak" from that one change.
* Keep the near arm slightly bent on hit keys (`lower` 40–100°) so the grip point stays inside the far arm's reach
  circle; extend fully only during the smear frame, where the lerp hides it.

Audit before you look: `computeJoints(rig, makePose(frame.pose))` gives `joints.grip` and `joints.shoulderF`;
their distance must be ≤ `upperArm + lowerArm + 2` on every `grip: 1` key (the verifier's `audit.mjs` also prints the
hammer-head centre — `handN + 32 px along weaponAngle` — and the lowest boot sole, which must sit at y = 0 ± 2 on
ground keys; fix floating/sunk feet with `root: [x, y]`, the scale/stretch pivot is the feet so `root.y` moves the
whole body 1:1). A 3-value grid search over `armR.upper/lower` and `weapon.rot` against a target hand and hammer-head
position is the quickest way to hit a slam key that actually lands on the floor. `window.__sheet.audit()` in `tools/sheet.html`
prints exactly these numbers for every key of the loaded rig (`GRIP` / `FLOOR` flags on the offenders).

## 6. Face system

`pose.face` is an expression index (`FACE = { neutral, angry, hurt, happy, shout, dazed, grit, closed }`); `P()` and
frames accept the names (`face: 'shout'` on a frame overrides the pose). `drawFace(ctx, rig, r, pose.face, opts)` draws
whites + pupils, stepped brows and a mouth; `opts.noMouth` for beards (draw the beard in `parts.beard`, after the
face), `opts.eyeY`, `opts.pupil`, `opts.brow`. **Features scale with the head:** `headR >= 9.5` (or `opts.big`) gets
5x4 / 4x4 whites, 2x2 pupils and 2 px brows; smaller heads keep 4x3 whites and 1 px brows. Keep hats and goggles above
the brow line (`cy <= -0.9 r`); a beard is ONE mass (two chain segments at most) in a colour distinct from the garment
beneath it. Every attack hit frame is `shout` or `grit`; hurt/knockdown/lying use
`hurt` → `dazed`; win/taunt `happy`; dodge `closed`. Brassbound have no face: draw the lens in `parts.face` and colour it
from the pose (`pose.face === FACE.angry` → red tell). Sootborn eyes track the player: shift the pupil by the sign of
the target direction the AI writes into the def (`eyeTrack`) — keep it inside `parts.face`.

## 7. Secondary motion (beards, hair, scarves, chains, coat-tails)

`getChain(rig, name, segments, { joint: 'head'|'torso', rest: [0,1], stiffness, damping, gain, rotGain, maxAng })`
returns a chain whose `ang[i]` is the lag rotation of segment i, stepped automatically by `drawRig` from the anchor
joint's on-screen motion (only for AnimPlayer poses; menus pass `still: true`). Draw it inside a part/accessory in the
anchor's local space:

```js
const ch = getChain(rig, 'beard', 3, { joint: 'head', rest: [0, 1], stiffness: 0.16, damping: 0.66, gain: 1.6, maxAng: 28 });
ctx.save(); ctx.translate(R(r * 0.25), R(r * 0.5));
for (let i = 0; i < ch.n; i++) {
  ctx.rotate(rad(ch.ang[i]));
  celPoly(ctx, rig, [...clump i...], PAL.hair, 0.4, 0.3);   // one shaded clump per segment
  ctx.translate(0, h - 1);                                    // move to the clump's tip
}
ctx.restore();
```

Use: Sael ponytail (3 segs, `rest: [-1, 0.3]`, gain 2.5) and scarf (`joint: 'torso'`, `rest: [-1, 0]`), Rook coat
tails (2 × 2 segs from the torso), Brunhild beard, Cinder Hulk wrist chains (`joint: 'torso'`, hanging), Wrangler whip
at rest, Vane's queue. 2–4 segments; never more than 3 chains per rig.

## 8. Animation bar (per state)

Author with `F(dur, spec, extra)` from `content/characters/common.js` (`P()` shorthand + frame fields). Frame fields
that drive the renderer: `ease` (`in | out | inout | overshoot | snap | linear`), `smear: { from, to, a, r }` (weapon
sweep in root-space degrees, 0 = forward, -90 = up; `a` fades toward the next frame's smear), `face`. Every key sets
`legR/legL` explicitly (no floating feet) and `root: [x, y]` for weight shifts.

| state | keys | pattern |
|---|---|---|
| idle | 4, 50–56f loop | breathing: torso 1→4°, head ±2°, root y 0→1, weapon/arm drift 2°; puffs/flicker via `rig.tick`. **Open rest pose:** weapon rested on the shoulder (`weaponBack: 1` draws it behind the body) or held low at the side; off-hand free; no limb or weapon crosses the torso or the head |
| walk | 8, 32f | contact / down / pass / up ×2; `root y` +2 on down, −1 on up; `squash 1.03` on down; head −1..+2; same open carry as idle (two-handed carries are for run and attacks) |
| run | 8, 24f | lean 20°, stride ±50°, both feet off the ground on the pass keys, `face: angry` |
| jump / fall / land | 3 / 2 / 2 | crouch (`squash 1.1`) → stretch (`0.94/1.08`) → tuck; land `squash 1.16` for 3f then settle |
| attack N | 5–6 | **anticipation** (`ease: in`, 3–4f, weapon opposite the swing) → **smear** hit key (`ease: overshoot`, 3f, `smear`, hitbox) → **hit hold** (2–3f, pose +4°) → **follow-through** (`ease: inout`, 6–12f, `cancel`) → return (4f) |
| jumpAttack | 3 | windup, hit (smear), held pose with the persistent hitbox; legs tucked |
| dashAttack | 4 | shoulder/lunge: lean 45°, `move`, `armor`; legs alternate |
| special / super | 6–9 | same anticipation→hit→hold pattern, bigger `squash` (1.14) and `fx`; super holds a signature pose |
| dodge | 5 | crouch → two rotated tuck keys (`root: [x, -44..-54, 120/240]`, torso 24–30, legs folded) → land `squash 1.06` |
| taunt | 3–4 | a held signature pose with 2 breathing keys; `event: 'meterGain'` on the last key |
| grab / grabHold / grabHit / throw / throwBack | 2 / 2 / 3 / 4 / 4 | hold loops breathe; throws use anticipation + `smear` + `sfx: 'throw'` |
| hurt | 3 | snap back (torso −26, head −24, 4f, `face: hurt`) → recover (10f) → neutral (6f) |
| hurtAir / knockdown | 2 loops | rotated root (−15..−35), limbs flung |
| lying | 2, 32f loop | breathing on the floor; weapon dropped along the floor (root rot −88: body-space +y runs along the ground toward the feet, so aim `weaponAngle` at 0 with the hand near body-x ≈ −8) |
| getup | 3 | lying → push up (`squash 1.06`) → stand |
| dead | 1 | lying pose, `face: dazed`; enemies add the death spectacle in `fx` |
| win | 5 | hop with `squash/stretch`, weapon raised, `face: happy` |

Timing numbers (startup/active/recovery) come from the GDD and never change for art reasons — add anticipation
*inside* the startup budget (e.g. Piston Quake 8f startup = 4f `in` + 4f `out`).

## 9. Performance

* Zero allocations per draw (ARCHITECTURE §11): no object/array literals, no template strings, no closures inside any
  part hook; typed arrays or module constants for point lists; `tones()` for colours.
* Budget: **≤ 0.15 ms per rig per frame on a desktop GPU canvas** (12 fighters + FX at 60 Hz). Measured split
  (verifier, Chromium headless, `sheet-capture.js … bench` loop): the JS side of `drawRig` — joints, IK, chains, tone
  lookups, command recording into a mock context — is **0.06 ms** for Brunhild (300 draws = 17 ms); everything above that
  is rasterization, which the headless build does in software (SwiftShader). That software floor is ~0.9 ms even for the
  plain placeholder rigs (Sael 0.87, Rook 0.79, Pip 0.87 ms) and 1.25 ms for Brunhild (1.0 ms with `shading: false`), so
  **the headless bench cannot be held to the 0.15 ms number** — its calibrated ceiling is **≤ 1.3 ms per draw**, and a
  rig that exceeds Brunhild's ~250 canvas commands per draw (76 fills, 43 strokes, 19 clips, 137 1-px rects) is over
  budget. Chains, IK and the pose lerp are negligible; count shapes, not maths.
* Cost drivers, in order: number of cel shapes (each = outline stroke + fill + 1–2 bands), `celPath`/`celPoly`/`celRect`
  clips (each clip ≈ 3 fills in software raster; prefer `celCapsule`/`celBall`/`celTaper`, which use offset shapes and
  no clip), chains (each segment is a cel shape). Cap a rig at ~45 cel shapes + ~140 flat 1-px rects (1-px rects are
  nearly free); put detail in rects, not extra shapes. Shading is ~20 % of Brunhild's raster cost, the outlines ~30 %.
* Snapping: leave `build.snap` on (default) — sub-pixel joints blur the 1 px outline.

## 10. Contact-sheet workflow

`tools/server.js` (or the playtest server) serves the repo; open `tools/sheet.html`:

* `?char=<id>&mode=anims` — every keyframe of every animation, hit frames underlined red, `smear`/`armor`/`invuln` tags.
* `?char=<id>&mode=strip&anims=walk,run&samples=8` — evenly spaced samples of loops (the motion test).
* `?char=<id>&mode=attacks&step=3` — every 3rd frame of the attack set (anticipation/hold/recovery read).
* `?char=<id>&mode=closeup&zoom=6&anims=idle:0,attack1:hit` — pixel check.
* `?mode=cast&enemies=1` — every hero and registered enemy in idle/walk/hit/hurt: palette and silhouette comparison.
* `?enemy=<type>:<variant>` instead of `char` for enemies (falls back to a generic rig when the registry is missing).
* `&facing=-1` on any mode renders every cell mirrored — the facing-left check (smear, beard chain, accessories).

Headless: `NODE_PATH=/opt/node22/lib/node_modules node tools/sheet-capture.js <outDir> char=<id> [jobs] [extras…]` writes
`sheet-anims.png sheet-walk-run.png sheet-attacks.png closeup.png cast.png ingame.png` (+ `ingame-attack.png`) and prints
the bench; `jobs` is a comma list of `anims,walk,attacks,closeup,cast,ingame,debug,bench` (`debug` = 2× in-game shots
with the `?debug=1` hit/hurt-box overlay on attack1's and the special's hit frame); extras are ad-hoc sheets written as
`"<sheet query>><file.png>"`, e.g. `"mode=anims&anims=hurt,getup&zoom=4>hurt.png"`. `enemy=brassbound:footman` works
the same. Look at every image before calling a rig done — and read the 3×-zoom `anims` sheet row by row: the hit key
and the hold key must differ by a few degrees only (they interpolate), a 100°+ jump between two adjacent non-smear keys
is a flail.

## 11. Self-review checklist

- [ ] Silhouette test: the rig filled black is still recognisable (weapon, hat/hair, one signature accessory).
- [ ] 1 px outline everywhere, no double outlines where parts overlap, no outline-coloured seams.
- [ ] Three tones per material, light from the top-left in every pose (check a raised arm and a lying pose).
- [ ] Value test: every adjacent pair of parts differs in value or hue family (`mode=closeup&zoom=6`); sleeves are not the torso colour.
- [ ] Squint test: the 1x idle / walk / attack-hit frames downscaled 0.5x still show a person with the weapon.
- [ ] Rest poses are open: nothing crosses the torso or the face in idle/walk; both hands and both boots visible.
- [ ] Palette from the GDD; aether cyan only on Concordat machinery; faction read (warm hero / cold Brassbound / soot).
- [ ] Face changes across idle → attack → hurt; beard/hair/scarf lags when the head snaps in `hurt`.
- [ ] Idle breathes (4 keys); walk 8 keys with a down/up bob; run has airborne keys.
- [ ] Every attack: anticipation → smear hit → hold → follow-through, `ease` on every key, hitbox on the hit key(s) only.
- [ ] Jump/land/dodge use `squash`/`stretch`; dodge rolls around the body centre, not the feet.
- [ ] hurt / knockdown / lying / getup / dead read at 1× on the docks backdrop (`mode=cast`, `bg=docks`).
- [ ] Weapon lies along the floor in lying/dead (not floating above the body); two-handed weapons keep both hands
      on the handle (`grip: 1` **and** the grip point within the far arm's reach on every key — audit, do not eyeball).
- [ ] Hammer/blade head lands where the hitbox is: slam keys put the head on the floor line in front (`y ≈ -4`),
      swipes at chest height inside `frontBox(reach)`, uppercuts through the `high` box.
- [ ] Hit flash draws the whole silhouette white (every custom part returns after the flat fill when `rig.override`).
- [ ] No per-frame allocation; bench within budget; `node --check` clean; `tools/playtest.js boot select combat gallery` green.
