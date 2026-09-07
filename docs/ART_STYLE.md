# AETHER & BRASS — Character Art & Animation Style Guide (binding)

This guide governs every rig drawn through `src/art/rig.js`: the four heroes, the ten enemy variants, the two bosses
and any prop that borrows the rig helpers. It supersedes the renderer line of `docs/GDD.md` §1 ("2px outlines, flat
fills") — the outline is now **1 px** and fills are **3-tone cel bands**. Everything else in the GDD (palettes, silhouettes,
accessories, tells) still applies; `docs/RECONCILIATION.md` still wins on numbers (rig scale ×1.4, floor band, physics).

**Canonical reference:** `src/content/characters/brunhild.js` (rig build, custom parts, secondary motion, full
animation set, and the worked example of every readability rule below). When in doubt, do what Brunhild does. Contact
sheets of the reference live in `tools/sheet.html?char=brunhild` (see §10).

---

## 0. Readability rules (binding — read before anything else)

The complaint these rules answer: "muddled, hard to pick out arms, legs, items and the face". Judged at the **2× display
scale** the game is played at and sanity-checked at 1×. In idle, walk, run and every attack hit frame a viewer must
instantly pick out: the head with eyes and brows (and beard), the signature headgear, the torso, **both** arms with
hands, **both** legs with boots, the weapon head **and** handle, and the signature back piece. Most of this is done by
the renderer (`src/art/rig.js`, `shading.js`, `rigParts.js`) so every rig gets it for free; the rest is authoring.

1. **Value separation between touching parts.** Every pair of *adjacent* parts differs by ≥ 25 % luminance **or** a
   hue-family change (skin = light warm, cloth = mid, metal = distinctly light or dark). Build the value ladder before
   drawing — Brunhild: tan skin `#ECBA8C` > cream sleeve `#D9CDAE` > bright-rust beard `#D4562A` > dark-oxblood apron
   `#6B2419`; blue-grey trousers `#566070` over **cool slate boots `#454C60`** (cool against the warm dock planks) with a
   light-steel toe; light steel hammer head `#9AA0AE` on a mid wood handle `#8C5A2C`; dark iron boiler with 3 px brass
   bands. **`palette.sleeve`** (upper arms + cuffs; defaults to `primary`) is the single biggest de-blobbing win: give it
   a light shirt colour so the arms read against the torso. GDD colours are hue references — re-space the values.
2. **One 1 px outline on every boundary, internal ones included.** Every part strokes its own outline
   (`outlinePath` under the fill), so draw order gives internal boundaries for free; never fake one with a tone seam,
   and keep an outline on every accessory that overlaps the body. **Contact shadow:** the renderer draws a translucent
   dark capsule (`build.contactShadow`, default alpha 0.3, `false` = off) under every arm and leg segment, so a limb
   crossing the torso, the far leg or a back accessory gets a darker 1 px contact edge on top of its outline.
3. **Far limbs darker and greyer.** `rig.paletteFar = farPalette(palette, farShade, farDesat)` — `build.farShade` 0.62
   (38 % darker), `build.farDesat` 0.25 (pulled toward grey, slightly cool). Far-side hooks must colour from `info.pal`
   (`farTone()` for module constants), never from the module palette, and never darken twice.
4. **Simplified shading.** Parts narrower than 8 px (`r < build.thinR`, default 4) get **two tones** (base + shadow);
   clipped shapes (`celPath` / `celRect` / `celPoly`) get a highlight cap only when their half-extent is ≥ `build.hiMin`
   (default 6: torso, head, weapon head); below `build.flatR` (2.5) a part is one flat tone. `build.tones: 2` drops
   every highlight cap on a rig — the only light marks are then explicit 1 px rims (`rimRect` on axis-aligned metal,
   `rimTop` along a shoulder line / boot top) and only on big shapes. Never stack highlights.
5. **Bigger, simpler face features.** `drawFace` scales with the head: `headR >= 9.5` (or `opts.big`) gets 5×4 / 4×4
   whites, 2×2 pupils and 2 px brows. Lay the head out in rows before adding headgear — Brunhild's 22 px head: goggles
   −16..−8 | brows −5..−4 | eyes −2..1 | nose 3..9 | beard 5..20 (`drawSkull(..., { noNose: true })` when you draw your
   own nose, `opts.eyeY` to move the eye row) — nothing sits on the eye row; hats and goggles go above the hairline
   (`cy <= -r`). A beard is ONE polygon in a colour distinct from the garment below it, sheared by a 2-segment chain
   rather than split into outlined clumps.
6. **Open silhouettes in neutral poses.** Idle / walk hold the weapon low at the side with the head *lifted* in front
   of the hip (Brunhild `CARRY`: limb angle ~115°, head 27 px in front, bottom 12 px off the floor — a head resting on
   the floor reads as a separate canister at squint scale), on the shoulder (`weaponBack: 1` draws it in the back
   layer), or in front of the chest; the off-hand hangs free and **visible** (swing it back so the fist emerges below
   the back piece behind the hip — an arm hanging straight down hides behind the torso and belt); nothing crosses the
   torso or the face. Two-handed grips are for run and hit keys — and there the fists stay *in front of the chest,
   below the chin* (Brunhild attack1: hands at y −37, chin at −42; bend the near arm so the grip stays reachable).
   Weapon accessories (chimney, guard) sit on the side that faces away from the body in the carry.
7. **Less clutter — the 2 px floor.** Anything under 2 px at 1× is noise: no 1 px rivets, knuckle notches, gauge
   needles, studs or wrap stripes; bands ≥ 3 px, buckles ≥ 3×3, toe caps ≥ 4 px, glow slots ≥ 6 px; one buckle per
   boot, one seam per garment, one shape per material.
8. **Squint test + audit.** Render the 1× idle / walk / hit frames, downscale to 0.5× and upscale ×6 nearest: a person
   with the weapon must still be visible. `window.__sheet.audit()` (`weapon.headAt` = px from the near hand to the
   weapon-head centre) must print no new `GRIP` / `FLOOR` flags; `mode=cast&enemies=1&bg=docks` must keep every rig
   tellable apart on the floor colour.

---

## 1. The look in one paragraph

Chunky 16-bit arcade sprite (Shredder's Revenge / Metal Slug energy): big heads, big hands, big boots; one crisp
**1 px near-black outline** around every silhouette *and every internal part boundary*; **flat cel tones** (highlight /
base / shadow on the big shapes, base + shadow on anything narrower than 8 px) laid down as hard bands with a
**top-left light**; no gradients, no soft alpha except smears and steam; joints snapped to whole pixels at 1×;
**everything moves** — idle breathes, cloth and hair lag, weapons smear, hits overshoot and hold. Readability beats
detail: §0 wins every argument.

## 2. Proportions

| | heads tall | standing height (scale 1) | notes |
|---|---|---|---|
| Heroes (Sael, Rook) | 3.5–4 | 76–84 px | `headR` 9–10, long legs for Sael (`upperLeg`/`lowerLeg` 17–18) |
| Heroes (Brunhild, Pip) | 3 | 62–70 px (Brunhild 68, Pip's rig 80+) | squat: `headR` 11 (big-face rows, §0.5), `torsoW` 28–30, `hip` 24–26, `legR` 6.5 |
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
  parts; do not darken twice. `build.farShade` / `build.farDesat` override; `farTone(hex, f, desat)` for module constants.
* **Value rule (readability pass):** every pair of *adjacent* parts differs by ≥ 25 % luminance **or** a hue-family
  change — skin = light warm, cloth = mid, metal = distinctly light or dark. Upper arms and cuffs take `palette.sleeve`
  (defaults to `primary`): give it a light shirt colour so the arms read against the torso. Trousers, boots and the
  floor must not share a value (a mid leather boot with a light steel toe, not iron on iron).
* **Two-tone rule (shading budget):** cel parts narrower than ~8 px (`r < build.thinR`, default 4) get base + shadow
  only; clipped shapes get a highlight cap only at half-extent ≥ `build.hiMin` (6); below `build.flatR` (2.5) flat.
  `build.tones: 2` = no highlight caps at all, light marks via `rimRect` / `rimTop` on big shapes only (§0.4).
* **Contact shadow:** the renderer draws a 1 px translucent dark capsule under every arm and leg segment
  (`build.contactShadow`, alpha 0.3) so a near limb separates from the torso and a far limb from the back piece it
  crosses. Weapons and accessories do not get one — keep them from crossing the torso in rest poses instead.
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
`flat`, `outlinePath`, `rimRect`, `rimTop`, `wantHi`, `wantSh`, `tones`, `pathRR`. Default renderers (`src/art/rigParts.js`) are exported so you can
compose: `drawBoot`, `drawFist`, `drawBelt`, `drawSkull`, `drawHairCap`, `drawFace`, `drawMouth`, `drawTorsoShape`,
`drawLimbSegs`, `drawCuff`, `drawNeck`, `drawStick`.

Part hooks: `head face beard hair hat neck torso hips back shoulder armUpper armLower hand legUpper legLower foot weapon
smear`. Accessories: `{ attach: 'head'|'torso'|'back'|'hip'|'handR'|'handL'|'root', layer?: 'back', draw(ctx, rig, pose) }`
(`back`/`layer:'back'` draw behind the body, others in front). Weapon: `{ attach: 'handR', length, draw, twoHanded?,
grip? }` drawn in hand space with +x along the handle; `length` sets `joints.weaponTip` for FX.

```js
// a boot: reuse the default (slate `pal.dark`, one brass buckle), add a 5x4 light-steel toe (brunhild.js)
function drawBootB(ctx, rig, pose, inf) {
  drawBoot(ctx, rig, inf.w, inf.h, inf.pal.dark, inf.pal.accent);   // inf.pal: far boots come pre-darkened
  if (rig.override) return;                                          // hit flash: silhouette only
  const toe = R(inf.w * 0.62);
  ctx.fillStyle = rig.col(inf.pal.metal); ctx.fillRect(toe - 5, -1, 5, 4);
  ctx.fillStyle = tones(rig, inf.pal.metal).sh; ctx.fillRect(toe - 5, 2, 5, 1);
}
// a head accessory: goggles pushed up over the hairline, 2 px clear of the brows (§0.5)
function drawGoggles(ctx, rig) {
  const r = rig.p.headR, cy = R(-r * 1.05);
  for (let i = 0; i < 2; i++) {
    const cx = i ? R(r * 0.5) : R(-r * 0.2);
    celBall(ctx, rig, cx, cy, 4.5, PAL.accent, false);
    ctx.beginPath(); ctx.arc(cx, cy, 2.8, 0, Math.PI * 2); ctx.fillStyle = rig.col(LENS); ctx.fill();
  }
}
// a two-handed weapon: hand space, +x along the handle; the far hand is solved onto the handle by pose.grip
// (stacked 8 px behind the near hand); headAt = px from the near hand to the head centre for the audit
weapon: { attach: 'handR', length: 40, draw: drawHammer, twoHanded: true, grip: -8, headAt: 30 }
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
hammer-head centre — `handN + weapon.headAt px along weaponAngle` (default 32) — and the lowest boot sole, which must sit at y = 0 ± 2 on
ground keys; fix floating/sunk feet with `root: [x, y]`, the scale/stretch pivot is the feet so `root.y` moves the
whole body 1:1). A 3-value grid search over `armR.upper/lower` and `weapon.rot` against a target hand and hammer-head
position is the quickest way to hit a slam key that actually lands on the floor. `window.__sheet.audit()` in `tools/sheet.html`
prints exactly these numbers for every key of the loaded rig (`GRIP` / `FLOOR` flags on the offenders).

## 6. Face system

`pose.face` is an expression index (`FACE = { neutral, angry, hurt, happy, shout, dazed, grit, closed }`); `P()` and
frames accept the names (`face: 'shout'` on a frame overrides the pose). `drawFace(ctx, rig, r, pose.face, opts)` draws
whites + pupils, stepped brows and a mouth; `opts.noMouth` for beards (draw the beard in `parts.beard` or after the
eyes in `parts.face`), `opts.eyeY`, `opts.pupil`, `opts.brow`, `opts.big`. **Features scale with the head:** `headR >= 9.5`
(or `opts.big`) gets 5x4 / 4x4 whites, 2x2 pupils and 2 px brows; smaller heads keep 4x3 whites and 1 px brows. Lay the
head out in rows (§0.5) — `drawSkull(..., { noNose: true })` when the default profile nose would land on the eye row;
keep hats and goggles above the hairline (`cy <= -r`); a beard is ONE polygon (chain-sheared, two segments at most) in a
colour distinct from the garment beneath it. Every attack hit frame is `shout` or `grit`; hurt/knockdown/lying use
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
| idle | 4, 50–56f loop | breathing: torso 1→4°, head ±2°, root y 0→1, weapon/arm drift 2°; puffs/flicker via `rig.tick`. **Open rest pose (§0.6):** weapon low at the side with the head lifted in front of the hip, rested on the shoulder (`weaponBack: 1` draws it behind the body) or in front of the chest; off-hand hanging back so its fist shows behind the hip; no limb or weapon crosses the torso or the head |
| walk | 8, 32f | contact / down / pass / up ×2; `root y` +2 on down, −1 on up; `squash 1.03` on down; head −1..+2; same open carry as idle, free arm swings (biased back so it shows on the back half of the stride); two-handed carries are for run and attacks |
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
- [ ] 1 px outline everywhere, including where a limb crosses the torso; no double outlines, no outline-coloured seams.
- [ ] Two tones on limbs, highlight caps only on torso / head / weapon head, light from the top-left in every pose.
- [ ] §0 value test: every adjacent pair of parts differs in value or hue family (`mode=closeup&zoom=6`); sleeves are not the torso colour; boots separate from trousers and floor; far limbs 38 % darker; nothing under 2 px.
- [ ] Squint test: the 1x idle / walk / attack-hit frames downscaled 0.5x still show a person with the weapon (head lifted off the floor).
- [ ] Rest poses are open: nothing crosses the torso or the face in idle/walk; both hands and both boots visible; hit-frame fists below the chin.
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
