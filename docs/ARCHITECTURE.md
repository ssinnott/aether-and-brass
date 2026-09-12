# Aether & Brass — Technical Architecture Contract

This document is the binding technical contract for the game. Every module, agent and
reviewer codes against it. If a design document and this file disagree on a *technical*
matter, this file wins; on a *design* matter (names, numbers, movesets, stage beats), the
design document wins — `docs/GDD.md` for stage 1 and the shared systems, `docs/STAGE2.md`
for stage 2 (its faction, bosses, sections and audio).

## 0. Stack & non-negotiables

- **Runtime:** browser, HTML5 Canvas 2D, vanilla JavaScript **ES modules**. No
  framework, no TypeScript *sources*, no bundler required to *play* (open `index.html` via any
  static server). `npm run build` produces a single-file `dist/index.html` (esbuild) for
  sharing, but `src/` must always run un-bundled.
- **Types are checked, never compiled.** `npm run typecheck` runs `tsc --noEmit` over the
  JSDoc already in the source (`tsconfig.json`). It emits nothing: no transpile step stands
  between editing a file and reloading the page, and `src/` stays the plain ES modules above.
  The only `.ts` in the repo is the `types/` directory — `globals.d.ts` (`window.__game`, Safari's
  prefixed audio constructors) and `content.d.ts` (`Frame`, `Hit`, `Hitbox`, `Anim`, `AnimSet`,
  `Hooks`). Both are declaration-only: never imported, never shipped, and global, so JSDoc in
  `src/**.js` names them directly (`/** @type {Frame[]} */`). `include` covers `engine/`, `net/`
  and `content/`, and widens one directory at a time — each joins only once it is clean.
  `strict` is off by design: this is untyped JS with sparse JSDoc, and the noise would bury the
  findings. `Frame` deliberately has **no index signature**, so a misspelled frame key is an
  error rather than a field that silently does nothing — which is the failure mode `content/` has.
- **`game/fighter.js` is the authority on what content may contain.** Its two reference blocks —
  CONTENT HOOK REFERENCE and FRAME FIELDS honoured by the core — are what actually call into
  `content/`, and `types/content.d.ts` is derived from them. Section 4 below covers the same
  ground more briefly and its lists are a subset (it omits the `medium` and `throw` hit types and
  most hitbox fields); where the two disagree, the core wins. Add a field to the core, then to
  `types/content.d.ts`, then use it.
- **Zero binary assets.** All art is drawn with canvas primitives; all audio is
  synthesized with WebAudio. Nothing is fetched at runtime except our own modules.
- **Internal resolution:** `640 x 360` (constants `VIEW_W`, `VIEW_H`). The internal
  canvas is scaled to the window by the largest integer factor that fits (min 1x), letterboxed, with
  `image-rendering: pixelated` and `imageSmoothingEnabled = false` on the *display*
  canvas. The integer factor is chosen in **device pixels** (`devicePixelRatio`, clamped
  1..4) so HiDPI screens get evenly sized crisp game pixels; the display canvas's bitmap
  is `window size * dpr` and its CSS size is the window size. All game drawing happens on the internal canvas. Snap sprite positions to
  integers when drawing (`Math.round`) for a crisp pixel look.
- **Fixed timestep:** logic runs at exactly `60 Hz` (`DT = 1/60`). Render every
  requestAnimationFrame with the latest state (no interpolation needed). Accumulator
  clamps to 5 steps per frame to avoid spiral of death. All gameplay numbers
  (speeds, timers) are expressed **per frame at 60 fps** (px/frame, frames).
- **Determinism for tests:** all randomness goes through `engine/rng.js` (seedable
  mulberry32). Never call `Math.random()` in game logic (UI sparkle is fine).
- **File size:** keep every file under ~700 lines; split rather than grow.
- **No globals** except `window.__game` (debug/test hooks, section 12).
- Browser support target: current Chrome/Firefox/Safari. No experimental APIs.

## 1. Repository layout

```
index.html                 # loads src/main.js as a module; contains only the canvas + minimal CSS
package.json               # scripts: dev, build, test, typecheck (see section 13)
tsconfig.json              # type-check config (noEmit; nothing is compiled)
types/globals.d.ts         # ambient declarations for window.__game and prefixed WebAudio
types/content.d.ts         # Frame / Hit / Hitbox / Anim / AnimSet / Hooks — the content contracts
tools/server.js            # zero-dependency static server (node), used by dev + tests
tools/playtest.js          # Playwright headless playthrough harness (see section 13)
tools/build.js             # esbuild single-file bundle -> dist/index.html
tools/scenarios/           # playtest scenario modules merged into tools/playtest.js
docs/GDD.md                # game design document (authoritative for design)
docs/ARCHITECTURE.md       # this file
src/
  main.js                  # boot: create Game, start loop, install debug hooks
  constants.js             # VIEW_W, VIEW_H, DT, FLOOR_TOP, Z_MIN, Z_MAX, GRAVITY, TEAM, etc.
  engine/
    loop.js                # fixed-timestep loop; test mode step(n)
    input.js               # keyboard + gamepad -> per-player action state with edge detection & buffer
    bindings.js            # default binding table + pure helpers: clone/sanitise/rebind/legend/join-hint
    rng.js                 # seedable RNG: rng.seed(n), rng.next(), rng.range(a,b), rng.int(a,b), rng.pick(arr), rng.chance(p)
    camera.js              # camera x, lock/unlock, shake
    canvas.js              # create internal canvas, display canvas, resize/scaling, present()
    text.js                # drawText(ctx, str, x, y, opts) using a built-in procedural pixel font (see 9)
    particles.js           # pooled particle system (sparks, dust, smoke, steam, debris, floating text)
    audio.js               # WebAudio synth: sfx.play(name, opts), music.play(track), master mute
    math.js                # clamp, lerp, approach, sign, rectsOverlap, easing helpers
    timer.js               # simple cooldown/tween helpers (optional)
  art/
    palettes.js            # named palettes (hex) shared by characters/enemies/stage
    rig.js                 # generic humanoid paper-doll: buildRig(build), drawRig(ctx, rig, pose, opts)
    poses.js               # helpers: lerpPose, mirrorPose, DEFAULT_POSE
    shapes.js              # primitive helpers: rrect, ellipse, poly, capsule, gear, rivetLine, outlineStroke...
    fx.js                  # hit sparks, shockwaves, slash arcs, muzzle flash, shadows
    backgrounds/           # one module per stage section backdrop + floor renderers
      index.js               # registry: createBackdrop(section, stage) by `section.backdrop` id
      section1.js ... section4.js    # stage 1
      storm1.js ... storm3.js        # stage 2
      works1.js ... works3.js        # stage 3
      glean1.js ... glean3.js        # stage 4
    props.js               # breakable/static prop renderers (crates, barrels, lamps, pipes, gears...)
    portraits.js           # character-select portraits & HUD icons drawn from rigs
    weapons.js             # corsair cutlass draw, on-floor weapon render, HUD icon + durability pips
  game/
    game.js                # Game: screen stack, players, options, transitions
    world.js               # World: entities list, spawn/despawn, depth-sorted draw, update, hit resolution
    entity.js              # Entity base class
    fighter.js             # Fighter: shared state machine, animation player, hurt/knockdown/juggle, grabs
    player.js              # Player extends Fighter: input-driven controller, combos, meter, supers
    enemy.js               # Enemy extends Fighter: AI controller framework (section 8)
    boss.js                # Boss extends Enemy: phase machine, HP bar, intro
    combat.js              # hitbox/hurtbox resolution, damage application, hitstop, knockback rules
    shield.js              # regenerating shields: traits.shield normalisation, absorb/refill, HUD strip + in-world ripple
    animation.js           # animation player utilities: play(name), tick(), current frame/pose, events
    items.js               # pickups (food/health, score, meter) and breakable props
    weapons.js             # pickup weapon table (WEAPONS), swing anims, bot seek helpers
    throwables.js          # issue #21: weapon + prop throw/land/shatter, held prop, lime patch, edge-loss helper
    hazards.js             # stage hazards (steam vents, pistons, conveyor floors, pits if any)
    stage.js               # StageRunner: sections, wave director, camera locks, GO arrow, boss trigger
    storage.js             # guarded localStorage probe: store(namespace), shared by progress.js + options.js
    options.js             # persisted options (difficulty, music/sfx volume, screen shake, bindings)
    trials.js              # issue #22: TrialRunner (matches world.log against a Trial's steps) + trialProgress (guarded save)
    hud.js                 # in-game HUD
    menuinput.js           # the one menu control scheme (CONFIRM / BACK), read by every screen (section 16)
    screens/
      title.js, boardselect.js, select.js, intro.js, gameplay.js, pause.js, gameover.js, results.js
      gallery.js, lobby.js       # rig gallery; online co-op lobby (net/)
      charcards.js, boardcards.js  # hero cards / board plaques, shared by select+lobby and boardselect+lobby
      options.js, controls.js     # OPTIONS overlay (main plate) and its CONTROLS sub-plate
      training.js, trainpause.js  # issue #22: TrainingScreen (extends gameplay.js) + its own pause plate
      trialsScreen.js, moves.js   # issue #22: per-hero trial list with ticks; move list with animated rig previews
  content/
    characters/            # one file per playable character (rig build, palette, anims, moves)
      index.js, brass.js, ... (names from GDD)
      <hero>Moves.js         # issue #22: sibling per hero — MoveEntry[] moveList + Trial[] trials, imported and
                             # attached by the hero file (kept separate so pip.js stays close to the 700-line cap)
    enemies/
      index.js             # registry: getEnemyDef(type, variant), ENEMY_LIST, ENEMY_GALLERY
      common.js            # shared rig parts / animation + def builders for every faction
      brassbound.js        # stage 1 type A: base rig/anims + 5 variant overrides
      sootborn.js          # stage 1 type B
      stormcrowRig.js      # stage 2 faction rig (parts, palette, base animation set)
      stormcrow.js         # stage 2 type C: 7 variant overrides
      gleaningRig.js       # stage 4 faction rig (parts, palette, bladder, gleanStrike)
      gleaning.js          # stage 4 type D: 7 variant overrides
      chandlerRig.js       # stage 3 faction rig (parts, palette, lamp/rite plumbing, chandStrike)
      chandler.js          # stage 3 type E: 7 variant overrides + the four rites
      midboss.js, boss.js          # stage 1 bosses
      midboss2.js, boss2.js        # stage 2 bosses (reuse the Stormcrow rig)
      midboss3.js, boss3.js        # stage 3 bosses (reuse the Chandlery rig and its rites)
      midboss4.js, boss4.js        # stage 4 bosses (reuse the Gleaning rig and its bladder)
    stage/
      index.js             # STAGES registry + getStage(n): the boards BOARD SELECT offers
      stage1.js            # stage data (sections, waves, props, hazards) per section 7 format
      stage2.js
      stage3.js
      stage4.js
```

## 2. Coordinate system (semi-isometric beat-em-up plane)

- World space is 3D: `x` (along the stage, px), `z` (depth on the floor, px), `y`
  (height above floor, px, `>= 0`).
- Floor band: `z` in `[Z_MIN=0, Z_MAX=140]`. `z=0` is the far edge (top of the floor
  on screen), `z=140` is the near edge (bottom).
- Screen projection (feet position):
  `sx = Math.round(x - camera.x)`, `sy = Math.round(FLOOR_TOP + z - y)` with
  `FLOOR_TOP = 200`. The floor thus occupies screen rows 200..340; the backdrop is
  drawn above (and behind) it. Nothing scales with depth (classic 2D look).
- **Facing:** `facing = +1` (right) or `-1` (left). Sprites are authored facing right;
  drawing flips with `ctx.scale(-1,1)` when facing left. Hitboxes are mirrored by
  facing.
- **Depth sort:** draw order each frame = shadows first (all), then entities sorted by
  `z` ascending (far to near). Ties broken by `y` descending (airborne behind), then id.
- **Shadows:** every fighter/item draws an ellipse shadow at `(x, z)` on the floor,
  size shrinking slightly with `y`.
- Movement: walking moves both `x` and `z`; vertical (up/down) input moves `z` at
  ~`0.6x` horizontal speed. Entities are clamped to the floor band and to the camera's
  current lock bounds (`camera.left + 8 .. camera.right - 8`) — enemies may exist
  off-screen while entering.
- Gravity `GRAVITY = 0.5` px/frame² (RECONCILIATION); a jump sets `vy = 9.5` (≈ 90 px apex) unless the
  GDD specifies per-character values. Landing when `y <= 0`.

## 3. Engine modules — required exports

### `engine/loop.js`
```js
export function createLoop({ update, render, testMode }) 
// returns { start(), stop(), step(n = 1) /* runs n fixed updates then one render; used by tests */, fps }
```
In `testMode` (URL `?autotest=1`) the loop does NOT self-run on rAF; `step(n)` drives it.

### `engine/input.js`
Actions per player: `left, right, up, down, attack, jump, special, super, dodge, taunt, start`.
```js
export const input = {
  init(canvasEl),                     // attaches listeners; handles gamepadconnected
  update(),                           // call once per fixed step; polls gamepads; ages buffers
  held(player, action) -> bool,
  pressed(player, action) -> bool,    // true only on the step the key went down
  buffered(player, action, frames=8) -> bool,  // pressed within the last N steps; consume() clears it
  consume(player, action),
  axis(player) -> { x: -1|0|1, y: -1|0|1 },
  anyPressed() -> bool,               // for title screen "press any key"
  joinPressed(player) -> bool,        // player pressed one of their OWN keys/buttons this step (P2 drop-in; shared arrows never count for P2)
  setJoined(player, bool) / joined(player),   // while P2 is not joined, P1 also accepts the solo alias keys (RECONCILIATION table)
  runHeld(player) -> bool,            // gamepad RT held (run without double-tap); virtual { run:true }
  globalPressed('pause'|'mute'|'debug') -> bool,
  setVirtual(player, actionsObject),  // test hook: { left:true, attack:true ... } overrides devices until cleared
  clearVirtual(player),
  setPadVirtual(index, buttons),      // test hook: number[] of pressed button indices (or null to remove the fake pad); fakes navigator.getGamepads()[index] for pollGamepads()
  bindings,                           // mutable clone of engine/bindings.js DEFAULT_BINDINGS; edited in place by rebind/importBindings/resetBindings
  bindingsVersion,                    // bumps on every bindings change; screens diff it to know when to rebuild cached hint strings
  rebind(layout, action, code) -> { ok: true, swapped?: string } | { ok: false, reason: string },  // layout: 'solo'|'p1'|'p2'|'pad'; code is a KeyboardEvent.code for solo/p1/p2, a gamepad button index for pad
  importBindings(raw) / exportBindings() / resetBindings(),  // round-trip through engine/bindings.js sanitiseBindings()
  legend(layout) -> string,           // e.g. "WASD MOVE  F ATTACK  G JUMP  ..." style legend line for a layout, built from current bindings
  joinHint(slot) -> string,           // "P2: PRESS J TO JOIN" style hint (single primary key), built from the slot's own (non-shared) keys
  joinKeysHint(slot) -> string,       // long form, same "P2: PRESS ..." prefix but every joinable key: "P2: PRESS J/K/U/L/O/I OR BACKSPACE TO JOIN"
  keyText(layout, action) -> string,  // first bound key/button label for one action
  cellText(layout, action) -> string, // every bound label for a grid cell joined ' / ', e.g. "G / SPACE"
  hasKey(layout, action, code) -> bool,
  swallowKey(code),                   // drops a just-captured keydown from keysDown/keysPressedPending before the next update(), so it fires no action and doesn't toggle mute/debug
  beginPadCapture() / capturePadButton() -> number / endPadCapture(),  // gamepad rebind capture (no player/index arg: any connected pad), polled from a screen's update(); capturePadButton() returns -1 when nothing new is pressed
  padOf(player) -> number, hasKeyboard(player) -> bool, freeSlots() -> number[], unboundPads,  // pad claimed / has a keyboard half (false for slots 2/3) / free slots (allocates) / unclaimed connected pads
  joinState() -> number,              // joined bitmask | unbound-pad bit; no allocation, for cache invalidation
  resetClaims(), setPadClaiming(bool),  // reset every pad claim/kbSeen (title entry) / claiming off (netplay) => any pad drives the local player, never claims a new slot
}
```
Players are `0..3` (`MAX_PLAYERS`); keyboard halves exist for slots 0/1 only, so slots 2/3 need a claimed gamepad or a test virtual. Gamepads are not index-bound: an unbound pad's first BUTTON edge (axes ignored) claims the lowest slot with no pad whose keyboard half is unused (`kbSeen`) and that isn't a netplay virtual slot — that press also counts as the slot's join. Claims (and `kbSeen`) reset on title entry (`resetClaims()`). Netplay turns claiming off (`setPadClaiming(false)`, `lobby.js`/`session.js`); while off, `pollRaw(player)` reads the pad bound to that slot plus every unbound pad, so a pad drives the local player whether pressed before or after the keyboard and can never claim the peer's slot mid-match. Use the standard gamepad mapping (d-pad + left stick, buttons per GDD).
The four binding layouts are `solo` (1P arcade aliases), `p1`, `p2`
(both keyboard) and `pad` (shared gamepad map); `engine/bindings.js` owns `DEFAULT_BINDINGS`, `LAYOUTS`
and the pure `cloneBindings` / `sanitiseBindings` / `rebindKey` / `rebindPad` / `keyLabel` / `padLabel` /
`legendFor` / `joinLabels` / `joinCodesFor` helpers that `input.js`'s wrappers above delegate to; the six
rebind conflict invariants (same-layout swap, same-side sibling strip with refusal if it would unbind
something, other-side / global / RT refusal, and the same-code exemption that lets P1 and P2 rearrange
the shared arrow keys) live there and are re-checked by `sanitiseBindings` on every load, so no path —
UI, a hand-edited save, or a future import — can put one key on two actions or a P1 key into P2's join set.

### `engine/camera.js`
```js
export class Camera {
  constructor(stageLength)    // right bound when unlocked
  x = 0; left = 0; right = STAGE_LENGTH; locked = false; shakeX; shakeY; minX;
  follow(players)             // target = mean x of alive players - VIEW_W/2, clamped to [max(left, minX), right - VIEW_W]; eased (approach 0.12)
  lock(x0, x1) / unlock()     // lock also sets left/right (right >= x0 + VIEW_W); unlock sets left = floor(x) (never scrolls back)
  static shakeScale = 1       // visual-only multiplier applied inside shake(); OPTIONS' SCREEN SHAKE setting (1 / 0.5 / 0) scales it; never hashed in net/checksum.js
  shake(intensity, frames)
  update()
  toScreenX(x)                // Math.round(x - this.x + shakeX)
  snapTo(x), isVisible(x, margin)
}
```
`toScreenX`, `drawShadow` (art/fx.js) and `particles.draw` all fold `shakeX/shakeY` in, so
entities must project as `sx = cam.toScreenX(x)`, `sy = FLOOR_TOP + z - y + cam.shakeY` to stay in sync.

### `engine/canvas.js`
```js
export function createCanvas(mount) // -> { ctx /* internal 640x360 */, present(), scale /* integer, device px */, dpr, displayCanvas, resize(), toInternal(clientX, clientY) }
```
Use `toInternal()` for any pointer mapping (it accounts for dpr and the letterbox offset).

### `engine/text.js`
`drawText(ctx, text, x, y, { size = 1, color, align = 'left'|'center'|'right', shadow = true, font = 'pixel' })`.
Implement a procedural 5x7 pixel font for `A-Z 0-9 .,:;!?'"-+/()%>` + a chunky 
outlined "title" style via scaling. Never rely on system fonts for HUD text (they
break the pixel aesthetic); `ctx.fillText` with `monospace` is allowed only for the
debug overlay.

### `engine/particles.js`
```js
export const particles = { spawn(kind, x, y, z, opts), update(), draw(ctx, cam), clear() }
```
Kinds at minimum: `spark, dust, smoke, steam, ember, debris, gear, text (floating damage/COMBO), ring (shockwave)`.
Particles have world coords and draw with the same projection; they are drawn after
entities of lower z (simplest: draw all particles after all entities, except `dust`
which draws before).

### `engine/audio.js`
```js
export const audio = {
  init(),                    // creates AudioContext lazily on first user gesture (call on any keydown/click)
  play(name, { volume=1, pitch=1 } = {}),   // named synthesized SFX (list in GDD section 10); no-op if not unlocked
  music: { play(trackName), stop(), setVolume(v) },   // pattern sequencer, loops; tracks per GDD
  muted, toggleMute(),
  setMuted(m),               // primitive mute setter; toggleMute() delegates to it
  setSfxVolume(v),            // 0..1, seeds the sfx gain node
  sfxVolume, musicVolume,     // getters mirroring the current gain values
}
```
Test mode (`?autotest=1`) must never create an AudioContext (all calls no-op).

### `engine/rng.js`
```js
export const rng = { seed(n), next(), range(a,b), int(a,b), pick(arr), chance(p) }
```

## 4. Art: rig & animation system

### Build (`art/rig.js`)
A **build** describes a humanoid paper-doll in local space, authored **facing right**,
origin at the **feet center** (`0,0`), `y` **negative going up** in local space.

```js
const build = {
  scale: 1,                    // uniform scale (variants: 0.85 small goblin, 1.3 brute)
  height: 72,                  // total standing height in px at scale 1 (reference)
  proportions: { headR: 9, neck: 3, torsoW: 22, torsoH: 26, hip: 18, upperArm: 13, lowerArm: 12, handR: 4, upperLeg: 15, lowerLeg: 15, footL: 10 },
  palette: { skin, hair, primary, secondary, accent, metal, dark, glow },   // hex strings
  parts: {                     // optional custom draw hooks per part: (ctx, rig, pose, part) => void
    head, torso, armUpper, armLower, hand, legUpper, legLower, foot, weapon, back, hat, face
  },
  accessories: [ /* { attach: 'head'|'torso'|'back'|'handR'|'handL'|'hip', draw(ctx, rig, pose) } */ ],
  weapon: { attach: 'handR', length: 30, draw(ctx, rig, pose) },  // drawn in hand space, +x along the blade/barrel
  outline: '#1a1018',          // outline color (2px at scale 1, drawn as stroke)
}
export function buildRig(build) -> rig     // precomputes joint chain lengths, caches nothing else
export function drawRig(ctx, rig, pose, { x, y, facing, tint, flash, alpha })  // draws at screen coords
```
`drawRig` composes: back accessories → far leg → far arm → torso → hip → near leg →
head (+hat/face) → near arm (+weapon) → front accessories. The "far" limb is drawn
slightly darker (`tint` 0.8). Outline: draw each part filled with `outline` color
inflated by 1px, then the fill — or stroke; either is fine, but every rig must have an
outline for readability against backdrops. `flash` draws the whole rig white (hit
flash); `tint` can draw a colored overlay (e.g. red at low HP is not needed).

### Pose (`art/poses.js`)
A pose is a plain object of joint values in degrees / px. All fields optional
(missing = default):
```js
DEFAULT_POSE = {
  root: { x: 0, y: 0, rot: 0 },          // whole-body offset (crouch/bob) and lean
  torso: { rot: 0, x: 0, y: 0 },
  head: { rot: 0, x: 0, y: 0 },
  armR: { upper: 20, lower: 10 }, armL: { upper: -20, lower: 10 },  // rotation in degrees, 0 = hanging down, + = forward (toward facing)
  legR: { upper: 0, lower: 0 }, legL: { upper: 0, lower: 0 },
  handR: { rot: 0 }, handL: { rot: 0 },
  footR: { rot: 0 }, footL: { rot: 0 },    // extra foot/boot rotation
  weapon: { rot: 0 },                      // extra rotation of the weapon in hand space (+ = clockwise when facing right)
  squash: 1, stretch: 1,                   // scaleX / scaleY on the whole rig (landing squash)
}
lerpPose(a, b, t, out = SCRATCH_POSE) -> pose   // deep interpolation of numbers; missing fields = defaults; no allocation
makePose(partial), copyPose(src, out, reset), mirrorPose(pose, out), addPose(pose, delta), P(spec) /* authoring shorthand */
```
Limb angles are plain numbers, so a value of `240` is drawn like `-120` but *interpolates*
differently: authoring a wind-up as `240` and the hit as `80` sweeps the arm over the head
(through 180), while `-120 -> 80` sweeps under the arm (through 0). Hand space: +x runs
along the forearm; weapons draw along +x.
Convention: `armR`/`legR` are the **near** (front-facing-viewer) limbs.

### Animations (`game/animation.js`)
```js
// A character's animation set:
anims = {
  idle:  { loop: true,  frames: [ { dur: 12, pose: {...} }, { dur: 12, pose: {...} } ] },
  walk:  { loop: true,  frames: [ ... ] },
  run, jump, fall, land, hurt, hurtAir, knockdown, lying, getup, dodge, taunt, grab, grabHold, throw, dead, win,
  attack1, attack2, attack3, (attack4), jumpAttack, dashAttack, special, super, grabHit,
}
// frame fields:
{ dur: frames, pose, 
  interp: true,                   // lerp toward the NEXT frame's pose over dur (default true; false = step)
  hitbox: { x, y, w, h, z: 24, damage, kbX, kbY, hitstun, type:'light'|'heavy'|'launch'|'knockdown'|'grab', once: true },
  move: { x: px/frame }           // root motion along facing (used by dash attacks, lunges)
  fx: [ { kind:'slash'|'muzzle'|'ring'|'dust', x, y } ],
  sfx: 'name',
  cancel: 'attack'|'any'|null,    // during this frame, the input buffer may cancel into the next combo hit / jump
  event: 'spawnProjectile' | 'grabCheck' | 'superFlash' | ...   // Fighter.onAnimEvent(name)
}
```
Hitbox coordinates are local (feet origin, `y` negative up, `x` positive toward
facing) and mirrored by facing. The animation player (`AnimPlayer`) exposes
`play(name, { restart=false })`, `tick()`, `pose` (interpolated), `frame`, `frameIndex`,
`done` (non-looping finished), `events` consumed by the owner.
`AnimPlayer.setOverlay(table)` makes `has()` / `play()` resolve names from the overlay first (held
pickup weapons replace `attack1..N`; see `game/weapons.js`).

## 5. Entity & Fighter

### `game/entity.js`
```js
export class Entity {
  id, kind ('player'|'enemy'|'boss'|'item'|'prop'|'projectile'|'fx'), x, y, z, vx, vy, vz, facing, w, h, zSize=20, alive=true, removeMe=false
  update(world) {}   draw(ctx, cam) {}   drawShadow(ctx, cam) {}
  get feetScreen() -> {sx, sy}
  hurtbox() -> { x0, x1, y0, y1, z0, z1 } | null      // world-space AABB (y positive up)
}
```

### `game/fighter.js` — shared state machine
States (string constants in `constants.js` `ST`): `IDLE, WALK, RUN, JUMP, ATTACK, JUMP_ATTACK, DASH_ATTACK, SPECIAL, SUPER, DODGE, TAUNT, HURT, HURT_AIR, KNOCKDOWN (airborne, being launched/flying), LYING, GETUP, GRAB (holding), GRABBED, THROWN, DEAD`.

Required fields: `hp, maxHp, team (TEAM.PLAYER|TEAM.ENEMY), def (content definition), rig, anim (AnimPlayer), state, stateTimer, invuln (frames), hitstop (frames), armor (bool, elites ignore hitstun), juggleCount, lastHitBy, grabTarget/grabbedBy, flashTimer, dead, shield/shieldMax/shieldTimer (game/shield.js)`.

Rules implemented ONCE in `Fighter` (players and enemies both inherit):
- `takeHit(hit, attacker)` applies damage, hitstop to both (`HITSTOP` in constants.js: `light:3, medium:5, heavy:8, launch:8, knockdown:8, grab:6, throw:6, superFinisher:14`, per RECONCILIATION), flash, knockback (`vx = kbX * attacker.facing`, `vy = kbY`), state → `HURT` (ground, `hitstun` frames), `HURT_AIR` if airborne, `KNOCKDOWN` if `type` is `launch`/`knockdown` or if `juggleCount >= 3` or if hp <= 0. Spawns hit spark + damage text. Returns false if invulnerable / already dead / friendly (no friendly fire between players; enemies never hurt enemies unless `hit.friendly`).
- `KNOCKDOWN` flight: gravity applies; on landing → `LYING` for `def.lyingFrames` (default 40; dead → stay & fade out), then `GETUP` (invuln 20 frames), then `IDLE`. Juggle: a `KNOCKDOWN` fighter still in the air with `y > 0` can be hit again (juggle), which resets `vy` to `hit.kbY * 0.8`; `juggleCount++`; after 4 juggles the target becomes hit-immune until it lands (anti-infinite).
- **`plant(world)` is the only way to put a body on the floor from outside `physics()`.** `get airborne` is
  `y > 0 || vy > 0`, so writing `y = 0; vy = 0` directly takes a body OUT of the air without ever landing it, and
  `physics()` only reaches `onLand` on the way down. Every exit from an air state lives inside `onLand` —
  `KNOCKDOWN`/`THROWN` → `LYING` → `GETUP`, `JUMP` → `IDLE`, and hp 0 → `ST.DEAD` — so a body planted the naive way
  is frozen in its air state for good. Above 0 hp it also never leaves `world.waveEnemies`, and a wave that cannot
  clear is a **soft-lock**, which `tools/winrate.js` scores as a failure rather than a loss. `Enemy.checkOffscreen`'s
  stuck-wave rescue is the live caller: it teleports a unit that has not reached the arena to the camera lock edge,
  and a unit can be knocked down *before* it ever gets there. Anything that repositions a fighter — a rescue, a
  cutscene, an authored arrival — goes through `plant`, or forces a definite `setState` of its own the way the
  `game/boss.js` phase-change and defeat paths do.
- **Shields** (`game/shield.js`, GDD 7): a fighter with `traits.shield` carries `shield` HP in front of `hp`. Every
  damage path — `takeHit` and `takeHitRaw` — spends the shield first and applies only the overflow to `hp`; the
  reaction (hitstun, knockback, launch, armor, death) is computed from the hit exactly as before, so absorbing
  changes damage and nothing else. `tickShield` refills `regen` per frame once `delay` frames have passed with no
  damage (`breakDelay` after the pool empties), and never while dead, frozen or in hit-stop (the update returns
  first). `initShield` on spawn and respawn, `syncShield` after a def swap (boss phases). Absorbed damage is not
  counted in the results screen's Damage Taken, which stays HP lost.
- **Training dummy** (`traits.dummy`, issue #22): a def spread with `traits.dummy: true` (passed through
  `spawnEnemyAt`'s optional `opts.def`, never on a normal spawn) makes `Enemy.think` short-circuit into
  `thinkDummy` — face the nearest player (unless `e.dummyFaceLock`) and stand, no attacks, no tokens, no
  riposte/flee — unless `e.dummyMode === 'cpu'`, in which case the variant's own AI fights back at the
  current difficulty. `traits.weight` (already read by `Fighter.takeHit` as a knockback divisor) is set to
  1000 per instance to pin a STAND/BLOCK dummy in place so combos keep it inside a bot's attack band;
  hitstun, launch height and throws are unaffected. See `game/screens/training.js`.
- `hitstop`: while `> 0` the fighter's own update is frozen (anim and physics) but it still draws; camera shake on heavy hits.
- Wall/edge bounce: when a knocked-down fighter hits the camera lock edge with `|vx| > 4`, it bounces back (`vx *= -0.5`) — feels great, cheap.
- Grabs: `grab` hitbox type → if target is grabbable (`def.grabbable !== false`, not a boss unless allowed) attacker → `GRAB`, target → `GRABBED` (positioned in front of attacker each frame). From `GRAB`: attack = grab hit (up to 3, then auto-throw), direction + attack = throw in that direction (`THROWN` = knockdown with strong velocity; thrown bodies hit other enemies for damage `hit.friendly = true`). Grab breaks after `def.grabHoldFrames` (90).
- Death: `hp <= 0` → knocked down; on landing while dead → `DEAD` state, blink for 60 frames then `removeMe = true`, spawns drops if any.

### `game/player.js`
Input → intent → state transitions (implements GDD section 7 combat rules):
- Movement 8-way; double-tap direction (within 12 frames) or hold `dodge` + direction → `RUN`; `attack` during run → `DASH_ATTACK`.
- Ground combo: `attack` from `IDLE/WALK` → `attack1`; during a frame with `cancel:'attack'` a buffered `attack` chains to the next hit only if the previous hit **connected** (`hitConfirmed`) or GDD says free chain; final hit knocks down.
- `jump` → `JUMP`; `attack` in air → `JUMP_ATTACK` (one per jump); down+attack in air = dive if defined.
- `special` → `SPECIAL` (costs 1 meter bar, or 8% HP per GDD); `super` (separate button) with a full 300 meter → `SUPER` (screen freeze + portrait cut-in, invuln, big hitbox/multi-hit).
- `dodge` → `DODGE` (i-frames per GDD, short hop backward or roll through).
- `taunt` → `TAUNT` (builds meter, interruptible).
- Meter: `meter (0..METER.max = 300)`, three bars of 100 (`METER` in constants.js; special costs one bar, super the full meter, HP fallback per RECONCILIATION); gain on hit dealt (`+4` light, `+8` heavy), on taunt completion (`+25`), on damage taken (`+2`). Reset per life.
- Held pickup weapon (`weaponId`, `weaponHits`; `game/weapons.js`): `pickUpWeapon / clearWeapon /
  discardWeapon / dropWeapon / breakWeapon / spendWeapon`. While wielding, the ground combo comes from
  `WEAPONS[id].anims` (via `AnimPlayer.setOverlay`, section 4) instead of the hero's own; a swing hitbox
  carries `weapon: true` and spends one hit per connecting target (`onHitConfirmed`); reaching 0 hits
  breaks it. `knockDown()` / `thrown()` drop it as a `WeaponPickup` (20-frame grace before either player
  may retake it); entering the next section discards it (`LEFT BEHIND`, no pickup); respawn and continue
  clear it silently; a hero already wielding never swaps for another pickup. `net/checksum.js` hashes
  `weaponId`, `weaponHits` and the dropped pickup's `grace`.
- **Throwing** (`game/throwables.js`, issue #21, GDD 7): direction + Attack while wielding a weapon (`startWeaponThrow`, checked between grab and swing in the attack order) turns the hero into
  `ST.GRAB` playing its own forward `throw` anim; release spawns a plain `Projectile` (`spawnThrownWeapon`) carrying the weapon's own `WEAPONS[id].throw` spec (`speed, vy, gravity, damage, type, kbX,
  kbY, hitstun, pierce, maxDist, spin`, plus an optional lime-patch `patch` on the Lime Rake) and every hit sets `hit.body = true` (`fighter.js` `takeHit`: `throwDamageTakenMult` applies,
  `lastHitWasThrow` is set for the kill-credit bonus). It lands as the same `WeaponPickup` with `hits - 1` (`landWeapon`), or shatters at 0 either way — durability always drops on a throw, hit or
  miss, and a weapon lost over an `open` rails edge gives nothing back. Left/right + Attack turns to face and throws forward; up/down adds `THROW.vz` px/f of z drift instead. A small stage prop
  flagged `throwable: true` (bottle, lamp — `PROP_TYPES[type].throw`) can be lifted empty-handed (`findLiftProp` / `liftProp`) and only thrown, never swung (`thinkHeld`, walk-only at `THROW.holdWalk`,
  no run/jump/dodge); it is a live `Prop` in state `'held'`, positioned every frame from the holder (`fighter.heldProp`, `updateHeldProp` — no one-frame lag) and always shatters on landing
  (`landProp`, a fresh `Prop.break()`). Grab beats weapon-throw beats prop-lift beats swing; a held prop drops on any hit taken (`onHurt`); a wielded weapon still drops only on a knockdown / being
  thrown (`Player.knockDown` / `thrown`, issue #20). `net/checksum.js` also hashes `heldProp`,
  `holder`, `lost`, `throwable`, `throwPending.kind`, `thrownWeapon`, `thrownProp` and `lastHitWasThrow` per entity.
- Combo counter: increments on every hit dealt while the "combo timer" (60 frames since last hit) is alive; on drop, HUD shows grade per GDD.
- Lives/continues per GDD; on death respawn after 90 frames with invuln 120 frames if lives remain; else show `CONTINUE?` (handled by gameplay screen).

## 6. Combat resolution (`game/combat.js`)
```js
export function resolveHits(world)   // called once per fixed step after all updates
```
For every fighter whose current animation frame has a `hitbox` (and for every live
projectile): compute the world-space box (mirror by facing), for every candidate target
(`team !== attacker.team` or `hit.friendly`, alive, `hurtbox()`, not already in
`attacker.hitTargets` for this attack instance — an instance id increments each time an
attack animation starts): overlap test on `x`, `y` **and** `|targetZ - attackerZ| <= hit.z`
(default 24). On hit → `target.takeHit(hit, attacker)`, `attacker.onHitConfirmed(target)`
(meter, combo, hitstop), spark FX at the overlap center, `audio.play(hit.sfx || 'hit_' + type)`.
Multi-hit attacks set `once:false` with `rehit: N` frames between hits on the same
target. Breakable props are also targets (kind `prop`, `team` `NONE`).

## 7. Stage data format (`content/stage/stage1.js`)
```js
export const stage1 = {
  id: 'stage1', name: 'Stage name from GDD', subtitle: 'Intro card text',
  length: 4200,                       // total world width in px (sections tile left to right)
  music: { section1: 'track1', ... },
  sections: [
    { id: 's1', x0: 0, x1: 1100, backdrop: 'section1', floor: 'cobble',
      props: [ { type: 'crate', x: 320, z: 60, drops: 'food_small' }, { type: 'lamp', x: 1000, z: 110, throwable: true } ],
      // `drops:` on an enemy def (content/enemies/*.js) may also name a weapon id
      // (halberd | cutlass | limerake | sabre, game/weapons.js) to spawn a WeaponPickup instead.
      // `throwable: true` on a prop row (issue #21, GDD 7) makes that instance liftable empty-handed
      // when its PROP_TYPES entry also carries a `throw` spec (game/throwables.js findLiftProp) — only
      // bottle and lamp today; barrels/kegs/carts have no `throw` spec, so `startRoll` is unaffected.
      hazards: [ { type: 'steamVent', x: 800, z: 100, period: 180, active: 60 } ],
      waves: [
        { triggerX: 240,   // when camera.x + VIEW_W/2 >= triggerX (i.e. players reached here)
          lock: true,      // camera locks to [triggerX - VIEW_W/2, triggerX + VIEW_W/2]
          spawns: [ { type: 'typeA', variant: 'grunt', side: 'right', z: 40, delay: 0 },
                    { type: 'typeA', variant: 'grunt', side: 'left',  z: 100, delay: 45, mods: ['holdout'] },
                    { type: 'typeA', variant: 'elite', z: 70, delay: 90, entrance: { kind: 'teleport', dx: -60 } } ],
          reinforcements: [ { whenRemaining: 1, spawns: [ ... ] } ]   // optional
        },
      ],
      events: [ { id: 'overfire', onWaveClear: 2, once: true, actions: [ { caption: '...' }, { wait: 120 }, ... ] },
                { atX: 1050, kind: 'text', text: '...' } ]   // `kind: 'text'` is the old one-banner shorthand
    }, ...
  ],
  midboss: { atX: ..., def: 'midboss' },
  boss:    { atX: ..., def: 'boss', arena: { x0, x1 } },
  banners: { midbossDown: 'FOREMAN DEFEATED', clear: 'THE SKY OPENS' },   // optional per-board banner wording
}
```
Stages are registered in `content/stage/index.js` (`STAGES`, `getStage(n)`); `game.options.stage` is the
**1-based stage number** the BOARD SELECT screen and the `?stage=N` URL param write, and the gameplay /
intro screens resolve it through `getStage`. Adding a board is a stage data file, its backdrop modules (with
their ids added to `art/backgrounds/index.js`), a `preview` block for its select plaque and one entry in
`STAGES` — the selector, the unlock chain and the title screen's board counter all size themselves off
`STAGES.length`, so nothing else needs touching.

`preview` is the BOARD SELECT vignette (`game/screens/boardselect.js`), not gameplay art:
`{ skyTop, skyBot, ground, groundH?, accent, motif: 'city'|'sky'|'works', blurb? }`.

`banners` is optional: a board that does not supply it keeps stage 1's wording ("FOREMAN DEFEATED" on the mid-boss,
"THE SKY OPENS" under STAGE CLEAR). A `zones` entry may also carry `color` — the `daisVents` edge glow defaults to
aether cyan, which is Concordat machinery, so a board with no Concordat on it passes its own energy colour instead.

A `rails` hazard zone (`game/hazards.js` `Zone`) may also carry `open: true` (issue #21, GDD 7): outside `[RAIL, Z_MAX - RAIL]` z it discards a thrown weapon, thrown prop or weapon pickup still in
flight over the edge (`loseOverEdge`) instead of letting it land — only The Mooring Spine (stage2 `m1`) and The Lash-Up (stage4 `g2`) set it, because both boards say so explicitly ("no bulwark", "no
bulwark anywhere"). The Brass Funicular's `rails` (stage1 `s3`) are railings, not an open edge, so it omits `open` and thrown items land on the roof as normal.

A `solid` zone (issue #31) is the one thing in the game that BLOCKS movement: `{ type: 'solid', x0, x1, z0, z1,
height, breakable? }`. A grounded fighter cannot cross `[x0, x1]` while its z is inside `[z0, z1]`; one whose y clears
`height` passes over, and a body that is still RISING is measured by the apex its jump will reach, so committing to a
jump that clears the obstacle clears it (without that, a jump started against a wall is blocked through its own
ascent). Knockback into a solid wall-bounces with the same numbers the camera bound already uses (`AIR_FALL_STATES`,
|vx| > 4, `vx *= -0.5`). `height: 0` is a floor GAP: an enemy that walks in rings out (+200), a player pays 8% of max
HP and is set on the nearest lip — health, not a life, the same rule the Crop Loft's `netGive` squares use, and
literally the same three ejectors (`ringOut` / `dropPlayer` / `loseOverEdge`). `breakable: true` blocks only while a
Prop flagged `barricade: true` inside the rectangle is still standing, and `StageRunner.barricadeHolding` keeps that
wave open until it is down. The health lives on the **Prop**, not the Zone, because a Prop is kind `'prop'` and its hp
is hashed by `net/checksum.js`, whereas a Zone is kind `'fx'` and its state is invisible to the desync canary.
Unlike every other zone a solid answers `dangerBox()` permanently (a wall has no quiet phase), which is what makes
`laneAroundHazards` route mobs and the autopilot around it for free; a broken barricade reports `null` again.

Hazard and zone types, their spec fields, timings, hits and `dangerBox` footprints are tabulated in the header of
`game/hazards.js` (HAZARD TABLE / ZONE TABLE). Boards 2-4 declare `lightning`, `cannon`, `gasCell`, `limePit`,
`wagon`, `tallowVat`, `kilnMouth`, `ledgerDrop` / `ballastDrop` and `gasSeep` hazards and `gust`, `spoil` and
`netGive` zones from that table next to stage 1's five hazards (`steamVent`, `aetherVent`, `piston`, `hook`,
`crossbar`) and four zones (`molten`, `conveyor`, `rails`, `daisVents`), which boards 2-4 also draw on; every
hazard follows the same tell / active / grace contract, so the enemy
pathing (`laneAroundHazards`) and the autopilot read them without knowing the type.

A spawn entry may carry `entrance: { kind, ... }` (issue #30, `game/entrances.js`), which replaces the walk-on from
`side` with an authored arrival. Kinds are `teleport` | `flyIn` | `descend` | `ropeDrop`; their frame budgets, paths
and tells are tabulated in the ENTRANCE TABLE at the head of that module. Every entrance is a tell (an `EntranceTell`
placed *before* the unit exists, which flags `isHazard` and answers `dangerBox()` so `laneAroundHazards` steers mobs
and the autopilot around it for free), then a scripted approach in the new **ARRIVING** ai state, then a punishable,
grabbable recovery once the body is on the floor. `entered` stays false for the whole arrival exactly as it does while
a side spawn walks in, so the wave lock and the enemies-remaining count are unchanged. Shared spec fields: `x`
(absolute) or `dx` (offset from the lock centre, the convention `side: 'sky'` already uses), `from` ('left'|'right',
which side a `flyIn` crosses from — defaults to the spec's own `side`), `speed` (a `descend`'s px/frame) and `hang`
(frames a `descend`/`ropeDrop` holds in the air before letting go; `ropeDrop` defaults to 30). A hit on a unit still
hanging on a rope CUTS THE LINE: the hit is rewritten to a knockdown and the body drops, which works even on a
shielded unit whose armour swallows the reaction. `arriveT`, `aiState` and `entered` are hashed by `net/checksum.js`.

A spawn entry may carry `mods: ['holdout'|'crusted'|'scrip'|'winged'|'salvaged']` (issue #28): the Enemy is built from a
derived def (`game/traits.js` `SPAWN_MODS` / `applyMods`) at spawn time, so a modifier is part of the def the rig comes
from and lockstep netplay never sees a late coin flip. A `SPAWN_MODS` entry is `{ label, factions?, skip?(def), apply(d,
base), hooks? }`; the optional `skip(def)` drops that modifier **whole** — `applyMods` leaves it out of `def.mods`, so no
hooks chain, no label joins the display name and nothing downstream reads it as applied, instead of letting `apply` no-op
and ship a half-modded body (`winged` skips every def that already hangs under a bladder of its own). A prop entry
forwards every extra field to the `Prop` constructor:
`hp`, `drops`, `solid`, `rider`, `release: { type, variant, mods? } | null` (a live enemy tips out on break), `dump:
'chassis'` (an overhead net drops a rolling prop when a jump attack hits it) and `fire` (a breaking fire source lights gas
seeps through `world.addFire`). `art/props.js` `PROP_FAMILIES` names which prop types belong to which board's palette.

A prop entry may carry **`cargo: [spawnSpec]`** (issue #34) — spawn specs the container is holding — plus `name` (the
author key a wave addresses it by) and `cargoOn`: `'break'` (everything climbs out when the prop is broken — the
generalisation of `release`, which is the same idea for exactly one unit and still works unchanged) or `'timer'` (one
every `cargoEvery` frames while the wave is live: a deck hatch, a coal chute). Everything arrives through the
`climbOut` entrance (issue #30): on its feet where the container stands, in a long punishable recovery, because
getting out of a box is slow. Nothing appears next to the player without a visible container.

A timer container **rattles** for 40 frames before it opens, and flags `isHazard` with a `dangerBox()` live only for
that window, so `laneAroundHazards` steers mobs and the autopilot out of the lane for free — and stops the moment it
opens, because a permanently dangerous crate would make enemies refuse that lane for the whole board. It can also be
**stood on to hold it shut**: a fighter on the lid stops the clock (the co-op job on a hatch). Deliberately not a
lock — stepping off resumes from where it stopped rather than resetting, so holding buys time, it does not cancel the
wave. Cargo that never comes out is **loot**: smashing a timer container drops one pickup per unspent entry instead
of tipping the whole load out at once, so breaking a crate early is a trade rather than always right.

A wave entry may use `entrance: { kind: 'cargo', prop: <name> }`, which has no side and no camera-relative x at all:
the runner resolves the name to that container and hands the spawn to it, so the unit comes out wherever the prop is
standing. A wave-supplied load is not in the container until the wave fires, so breaking it early cannot turn those
units into loot the way a pre-loaded crate's cargo does — they climb out of the wreck instead, because a wave must
never be an enemy short because scenery was smashed.

`events` (issue #33, `game/events.js`) is a frame-stepped action script per section, armed when the trigger position
passes `atX` (the same `reach` wave triggers use) or when the section's Nth wave clears (`onWaveClear: n`, counted
**per section**, not stage-wide). The actions and what each one blocks for are tabulated in the ACTION TABLE at the
head of that module: `caption`, `wait` (the only action that spends time — `wait: N` is exactly N frames), `camera`,
`sfx`, `music`, `hazardSet`, `zoneFlash`, `spawn` and `prop`. A run of instant actions all lands on one frame, so
`{caption}, {sfx}, {zoneFlash}` reads as a single beat.

`hazardSet: { name, force?, period?, frames? }` addresses hazards by an optional author key (`name` on the hazard
spec) because `Entity.id` differs between lockstep peers and is deliberately unhashed. It only ever touches
per-instance fields — writing through `h.info` would retime that hazard TYPE on every board for the rest of the page
load, since `HAZARD_TYPES` is a shared live table — and it lands in the same place the gas cell's `spent` flag does,
because `phase` is recomputed from `(world.frame + offset) % period` every step and assigning it anywhere else is
overwritten next frame. Retiming re-solves `offset` so the hazard keeps its place in its own cycle; setting `period`
alone can drop a hazard straight into `active` with no tell, which GDD 6 forbids. Every override is handed back when
its `frames` run out, when the script ends, and when the section is left.

Content rules a script can break where a hazard cannot: never inside a boss arena, never during a transition, and
every event warns before it hurts (a caption plus a `zoneFlash` or a tell SFX, with enough `wait` for a bot to walk
out). One is a soft-lock rather than a fairness problem: **a `spawn` action must never introduce a summoner**. The
wave lock clears on `world.waveEnemies.length === 0`, and the Chandlery's Resurrection Man tips a fresh Tin Footman
out of his cart on a timer — in an authored wave you stop that by killing him, but dropped in from a script he is
simply a section that cannot end.

A section may declare `platform: { kind, ... }` (issue #32, `game/platforms.js`), which makes the floor band itself a
vehicle rather than only its backdrop. Kinds and their fields are tabulated in the PLATFORM TABLE at the head of that
module: `hoist` (the deck climbs — a body in the AIR takes `rise` px/f of extra downward velocity, because the floor
is coming up to meet it, so a jump lands sooner than it looks like it should), `pallet` (a sub-rectangle of the floor
slides and carries whoever is standing on it; step off and it leaves without you) and `tilt` (the deck banks on a
tell/active cycle and every grounded body slides `slide` px/f toward the low side; `dir: 0` alternates each cycle).

Three rules make this work and are not optional. **Riders are moved by writing `x`/`z` directly, never `vx`/`vz`** —
the grounded branch of `Fighter.physics` applies `GROUND_FRICTION` and snaps anything under 0.05 to zero, so a rider
delta put into a velocity is decayed the same frame and the rider lags the floor (`Zone.updateConveyor` and
`Zone.updateGust` already do it this way, and their exclusion list — airborne, held, dead, boss, netted — is the one
reused). **A hoist never raises a rider's `y`**: `get airborne` is `y > 0 || vy > 0`, so a raised deck would make every
rider permanently airborne — unable to act (`actionable`), ungrabbable (`grabs.js`), and dragged straight back down by
gravity with `onLand` firing every frame. **A platform stores nothing but the frame its section was entered on**: its
whole phase is a pure function of `world.frame` and the section data, the same contract `Hazard` uses, because the
StageRunner's own state is not hashed by `net/checksum.js` (the canary walks `world.entities`) and a platform that
stored its position would be simulation the desync check cannot see. The effect stays visible in the fighter
positions the canary already hashes.

Note two name collisions that are *not* the same thing: a dock transition's `look: 'hoist'` (`transitions.js`
`DOCK_LOOKS`) is the art of a landing, not a `platform.kind`; and `section.drift` is a backdrop parallax scalar, not
platform motion. The Brass Funicular declares no `platform` at all and is unchanged.

`transition` is `{ kind: 'lift'|'board'|'dock'|'descent', atX?, gateX?, banner?, look?, pies?, up? }`: a `mode: 'locked'`
section ends in a `dock` when its last timed wave clears, showing `banner` (default the funicular's) and arriving on
`look` ('stairs' default, 'ladder', 'door', 'hoist', 'none') with `pies` Meat Pies (default 2); `{ kind: 'lift', up: true }`
rides the shaft upward. Locked sections are exactly one screen (640px) wide and must not contain a boss trigger.

### Board unlocks (`game/progress.js`)
Board 1 is always selectable; board N opens once board N-1 has been cleared. `ResultsScreen` calls
`progress.markCleared(stage.id, { score, rank })` on a clear (never on a defeat) and announces whatever
that opened. Dismissing such a clear does `reset('boardselect', { reveal: <stageId> })` instead of
returning to the title, and `BoardSelectScreen` plays the unlock on that plaque: a fixed frame-timed
sequence (`RV` in `screens/boardselect.js` — hold, rattle, snap, peel, name, stamp) that draws the plaque
still sealed, breaks the padlock, retracts the hatch as two doors over the vignette, resolves the name out
of scrambled glyphs and lands a STAGE N OPEN stamp with the music. Attack or start ends it early; either way
the screen settles into ordinary selection with the cursor already on the new board. State persists to `localStorage` under `aetherAndBrass.progress.v1` as
`{ version: 1, boards: { <stageId>: { cleared, score, rank } } }`, and **every** access is guarded — a
browser that throws on storage reads as "nothing cleared yet" and the game stays playable on board 1.
`allowSession(i)` / `unlockAllForSession()` open boards for one page load only and are never written back,
which is how `?stage=N` links and `?unlockall=1` work without rewriting a save.

`StageRunner` (`game/stage.js`): tracks the furthest camera position; on wave
trigger, locks camera, spawns enemies at `side` just outside the lock bounds (with
`delay` frames), watches the enemy count; when 0 and no pending spawns → unlock, show
the animated `GO ▶` arrow (blinking, 2s or until the players move right). On reaching
the boss `atX` → boss intro (name banner + roar SFX), lock arena, spawn boss. On boss
death → victory jingle, players `win` anim, then results screen after 180 frames.

## 8. Enemy AI framework (`game/enemy.js`)
An `EnemyDef` (in `content/enemies/*.js`):
```js
{
  type: 'typeA', variant: 'grunt', name: 'Display Name', role: 'fodder'|'bruiser'|'ranged'|'rusher'|'elite'|'grabber',
  build: {...}, anims: {...},            // shared per type, overridden per variant (palette, scale, weapon, extra anims)
  hp: 30, damage: 1.0 (multiplier), speed: 1.4, score: 100, drops: 'none' | 'meter' | 'food_small',
  ai: { attackRange: 40, zTolerance: 14, approachSpeed: 1.4, retreatChance: 0.3, attackCooldown: [40, 80], aggression: 0.5,
        attacks: [ { anim: 'attack1', range: 40, weight: 3 }, { anim: 'lunge', range: 90, weight: 1, minRange: 60 } ],
        ranged: { anim: 'throw', minRange: 120, maxRange: 300, projectile: 'wrench', cooldown: 150 },   // optional
        armor: false, blockChance: 0, canBeGrabbed: true, flees: false },
  onSpawn, onDeath, onUpdate   // optional hooks (fighter, world)
}
```
Base AI state machine (in `Enemy`), tuned by `def.ai`:
`ARRIVING` (issue #30, only for a spawn with an authored `entrance`: on screen, drawn and hittable, but on a scripted path from `game/entrances.js`, taking no actions and holding no attack token; ends in a punishable, grabbable recovery, then re-arms `firstAttackDelay` against the LANDING so a long flight cannot buy the unit a free swing) → `ENTER` (walk on-screen) → `APPROACH` (align `z` within `zTolerance`, close to `attackRange` on the target's facing-agnostic side; picks the nearest player, re-targets every 90 frames or when hit) → `ATTACK` (needs an **attack token**: `World.attackTokens.max` comes from `ATTACK_TOKENS_BY_PARTY = [2, 2, 3, 4, 4]`, indexed by the number of living players (`World.alivePlayers.length`; `World.partySize` — players not yet out — drives the `WAVE_EXTRA_BY_PARTY` clones below instead) — 1 and 2 players keep today's 2, 3 players get 3, 4 players get 4 — enemies without a token `HOVER`: shuffle at distance `attackRange + 30..60`, occasionally step in `z`) → `RECOVER` (short back-off after attacking, `retreatChance`) → loop. Ranged variants use `KEEP_DISTANCE`. Elites/bosses ignore tokens. Enemies never overlap each other perfectly: apply a soft separation force between enemies within 18px in `x` and 10px in `z`. Enemies react to being hit exactly like players (shared `Fighter`).
Jump-over (issue #31): `laneAroundHazards` steers an approach around a `solid` exactly as it steers around a live
vent, but a wall that spans the whole floor band leaves no lane to take — it returns z unchanged, and that case (and
only that case) is where a mob goes over the top instead. `Enemy.tryJumpOver` commits within 30px of the obstacle's
near face, or after 90 frames of failing to close on its target with one in the way, which is the anti-stick rule:
nothing may stand grinding against a wall forever. This is the first AI-driven jump in the game — `jump` anims existed
but nothing ever played them for an enemy. Flyers skip it: already being off the ground clears the obstacle.
Off-screen rule: an enemy that is > 200px outside the camera for 300 frames teleports to
the nearest lock edge (prevents stuck waves). An `ARRIVING` unit is exempt — its path is authored and bounded, and
yanking it to a lock edge mid-flight would break it — so `game/entrances.js` carries its own watchdog instead: an
arrival that outlives its own length by 180 frames ends as an ordinary enemy rather than holding the wave open.
`StageRunner.queueSpawns(list, extraDelay)` appends `WAVE_EXTRA_BY_PARTY = [0, 0, 0, 1, 2]` non-sky clones (delay + `PARTY_EXTRA_DELAY`, side flipped) to every spawn list for parties of 3-4; bosses excluded, 1-2 unchanged.

## 9. Screens (`game/screens/`)
`Game` holds a stack `screens[]`; top screen gets `update()`, all screens draw bottom
to top if `transparent` (pause overlay). Each screen: `enter(params)`, `exit()`,
`update()`, `draw(ctx)`. No screen wires its own menu keys: **CONFIRM** and **BACK** come from
`game/menuinput.js` (section 16), so the same two keys work on every plate in the game. Flow: `title → select → intro → gameplay ⇄ pause; gameplay → gameover → (continue → gameplay | title); gameplay → results → title`.
Title: animated backdrop, logo, a single `START` row plus `ONLINE CO-OP` / `TRAINING` / `OPTIONS`, "PRESS ATTACK", blinking; any free slot (1-3) joins with its own key/pad and a composite drop-in hint (`party.js joinHint`). Select: 4 portraits, up to four cursors (rings in the four card corners), any slot joins by its own key or pad, stats bars, confirm/back; an already-picked hero's later copy wears a tint (`dupTint`); `params.next` / `params.back` (default `intro` / `boardselect`) route confirm/back elsewhere — `{ next: 'training', back: 'title' }` for the TRAINING row, heading reads TRAINING ROOM. The online co-op lobby
(`lobby.js`) picks heroes on the same cards (`charcards.js`) and boards on the same plaques
(`boardcards.js`, compact) on one screen, with the room's other two to three players driving the
P2-P4 cursors, a status column per seat, and no two players allowed on one hero
(docs/MULTIPLAYER.md). Intro: stage card 2.5s
(skip on attack). Results: score, max combo, grade, time, "PRESS START".
Training (issue #22): `title → select(next:'training') → training ⇄ trainpause → moves | trials`.
`TrainingScreen` (`screens/training.js`) extends `GameplayScreen` and runs stage 1's THE BRASS FUNICULAR
section through a derived arena stage (every section stripped of props/hazards/zones/waves, so nothing
but the floor and one or two dummies exist in the room); its `pauseScreenId` is `'trainpause'` instead of
`'pause'`. `trainpause.js` is a sibling of `pause.js` (shares its extracted `drawPlate` / `drawMenuRows` /
`consumeMenuBuffers` helpers) with rows for DUMMY (STAND/BLOCK-STAGGER/CPU), VARIANT (every non-boss entry of `game.enemyList`, 31 today
non-boss enemies), FACING lock, REFILL HEALTH, METER lock, HITBOXES overlay, FRAME DATA readout, RESET
POSITIONS, MOVES and TRIALS. `moves.js` (pushed from either pause plate; hidden from the normal plate
while `game.net.active`) lists a hero's `moveList` with an animated rig preview beside each row and its
bound key via `inputLabel()`. `trialsScreen.js` lists a hero's `trials` with a `[X]`/`[ ]` tick
(`game/trials.js` `trialProgress`) and hands the picked id to `TrainingScreen.setTrial()`.
`gameplay ⇄ pause → moves` too (hidden online, same guard) so the move list is reachable from a real run.
`help.js` is the COMMANDS & SOUND quick reference, pushed from either pause plate (hidden from the normal
plate while `game.net.active`, same guard and same reason as MOVES / OPTIONS): eleven command rows, each
built once in `enter()` from `input.moveText()` / `input.keyText()` for the live keyboard half (`solo`
until P2 joins, then `p1`) and for `pad`, beside a one-line description; under a divider the MUSIC / SFX /
MUTE rows write the same `game/options.js` settings the OPTIONS plate writes (and share its
`drawVolumeRow`), so this is a second door onto one setting, never a second copy.
`title | pause → options`: `OptionsScreen` (`screens/options.js`) is a transparent overlay pushed on top
of either opener and popped on back (both openers freeze underneath exactly like `pause` freezes
`gameplay`, since `Game.update()` only ticks the top of the stack); it is hidden from the pause plate
under netplay. Its `CONTROLS` row pushes an in-screen sub-plate (`screens/controls.js`, not a stack push)
for the key/gamepad remap grid. Neither screen touches sim state, so nothing here enters
`src/net/checksum.js`.

## 10. HUD (`game/hud.js`)
Per player: portrait icon, name, shield strip (120x2, drawn by
`game/shield.js`), health bar (segmented, colors shift
at < 30%), special meter bar, lives count, score. Center-top: current enemy targeted
health bar (name + bar, last hit enemy, 2s), boss bar at bottom when a boss is active.
Combo counter: near the player, big number + "HITS" + grade text when dropped.
Held pickup weapon: 14x8 icon past the health-bar end with one 2x4 durability pip per remaining hit
(`drawWeaponSlot`, `game/hud.js` / `art/weapons.js`).
Layout: slots 0-1 only keeps the mirrored two-column strip (P1 left, P2 right); a player in slot 2/3 switches it to four 158px columns in slot order (`PLAYER_COLORS`), name above the bar, center-top timer/`GO`/target dropped 40px, `CONTINUE` boxes below the wave-banner block. Join hints are cached, rebuilt only on `input.joinState()` change.

## 11. Performance rules
- No allocations in the per-frame draw of rigs beyond `ctx` calls; poses are reused
  objects (`lerpPose` writes into a scratch object).
- Backdrop layers are pre-rendered once per section into offscreen canvases (wider than
  the screen) and blitted with parallax offsets (`far: 0.2, mid: 0.5, near: 0.8`,
  floor 1.0). Animated backdrop elements (gears, steam, airships) draw on top per frame.
- Target: 60 fps with 12 fighters + 200 particles on a mid laptop.

## 12. Debug & test hooks (`src/main.js`)
URL params: `?debug=1` (hitboxes, hurtboxes, AI state labels, FPS), `?autotest=1`
(test mode: no audio context, no rAF loop, seeded rng, `window.__game` fully populated),
`?seed=123`, `?skipTo=gameplay&chars=0,2&section=3` (jump straight into gameplay with
chosen characters and section), `?event=<id>` (issue #33: start in the section that owns that scripted event, just
short of its trigger, so an author can iterate on one without replaying the board; dev-only and inert in netplay, for
the same reason `?enemythrow=1` is — the START packet does not carry it, so a peer without the flag would simulate a
different world), `?stage=2` (which board to play; honoured outside dev mode
too, and it opens that board on BOARD SELECT for the page load), `?unlockall=1` (open every board for
this page load, save untouched), `?resetprogress=1` (wipe the saved unlocks and, issue #22, the saved
trial ticks under `aetherAndBrass.trials.v1`), `?godmode=1`, `?bot=1`
(built-in autopilot that walks right and attacks the nearest enemy — used for headless playthroughs),
`?difficulty=easy|normal|hard` (session-only override of the saved difficulty: sets
`game.options.difficulty` for this page load via `userOptions.setSessionDifficulty()`, never written
back to `aetherAndBrass.options.v1`).

```js
window.__game = {
  game, world (getter), input, rng,
  step(n),                           // run n fixed updates + 1 render (test mode)
  screen() -> string,                // current screen id
  summary() -> { screen, sectionIndex, cameraX, locked, players: [{hp, lives, x, state, meter, score, weapon, weaponHits, index, id}], enemies: [{name, variant, hp, state, x, z}], boss: {...}|null, wavesCleared, errors: [] },
  setInput(p, actions) / clearInput(p),
  userOptions,                       // the game/options.js module object (load/apply/get/set/cycle/adjust/difficulty/saveBindings/reset/state)
  optionsState() -> object,          // userOptions.state(): { storage, saved, ...current values } for test assertions
  setTraining(partial) -> object,    // issue #22: delegates to the top screen's setTraining(); null off training
  trialState() -> object,            // issue #22: { saved (raw aetherAndBrass.trials.v1 string, or null), heroes: { [heroId]: string[] } }
  moveAnims,                         // issue #22: MOVE_ANIMS.slice() — the anim names every hero's moveList must cover
  errors: []                         // window.onerror + unhandledrejection push here
}
```
Every uncaught error must be pushed to `__game.errors` (and rendered in a red box in debug mode) — tests fail on any error. `players[].index` is the input slot (0-3); `players[].id` is `def.id` — both let a test find an entry in a slot-sparse party without relying on array position.
`__game.world` reads only the TOP screen (`net.afterStep` depends on that for the desync checksum), so it
is `null` whenever an overlay (`pause`, `trainpause`, `options`, `moves`, `trials`) sits on top of
`gameplay`/`training` — a test must read `world` only while the screen it wants is on top.
`World.log` (`world.logEvent(kind, attacker, target, opts)`, issue #22, capped at 64 entries) is a combat
log of player-dealt hits/grabs/throws/parries/dodges read by the training room's frame-data readout and
`game/trials.js`'s `TrialRunner`; like `world.fx` it is derived state, deliberately **not** hashed by
`src/net/checksum.js` (`node tools/nettest.js` proves this stays true).

## 13. Tooling & tests
- `npm run dev` → `node tools/server.js` (serves repo root on http://localhost:8080 with correct
  `Content-Type` for `.js` = `text/javascript`, no caching).
- `npm run typecheck` → `tsc -p tsconfig.json`: checks `engine/`, `net/` and `content/` against their JSDoc
  and emits nothing. Runs in CI before the build. `npm run lint` is `node --check src/main.js`
  followed by this.
- `npm run build` → `node tools/build.js` → esbuild bundles `src/main.js` (IIFE, minified
  off) and inlines it + CSS into `dist/index.html` (single file, no external refs).
- `npm test` → `node tools/simtest.js && node tools/playtest.js`. The first is a PURE-NODE suite (issue #33, the
  same shape as `tools/nettest.js`: no browser, no canvas, no audio context) covering the sim modules whose
  correctness is ORDERING rather than rendering — event action sequencing, entrance frame budgets, platform
  defaults. It runs in a second and gates the browser harness, so a sequencing mistake fails immediately instead of
  after six minutes of playthroughs. `npm run simtest` runs it alone. The second:
  starts the server, launches headless Chromium
  via the globally installed Playwright (`NODE_PATH=/opt/node22/lib/node_modules` or
  local dep), runs scenarios and writes screenshots to `tools/screens/`:
  1. `boot`: title screen renders, START reaches BOARD SELECT and then character select, zero errors.
  1b. `boards`: BOARD SELECT lists every registered board, a locked board refuses to start, a recorded
     clear opens the next board and survives a page reload, the results screen names the board it cleared
     and reports the unlock, dismissing it hands off to the plaque reveal (which runs, is skippable, and
     leaves a startable board), and `?unlockall=1` / `?resetprogress=1` behave.
  2. `select`: navigate select, pick every character (4 runs), start gameplay, zero errors.
  3. `combat`: for each character, spawn near enemies, script attacks (combo, jump attack,
     dash attack, special, super, grab/throw), assert enemy hp decreases, assert hits land.
  3b. `shields`: for every hero, the shield starts full, absorbs a hit smaller than the pool with no HP
     loss, holds through its `delay`, refills to full when left alone, breaks under a bigger hit with only
     the overflow reaching HP, and stays down for the longer `breakDelay`.
  3c. `weapons` (`tools/scenarios/weapons.js`): each of the four weapons drops, is picked up, swings and
     spends durability, shatters, is dropped by a knockdown and picked up by the partner, and is
     discarded on section entry.
  3d. `thrown` (`tools/scenarios/thrown.js`, issue #21, blocks A-F): weapon throw direction/z-drift/durability/no-accidental-throw, open-rails re-pickup and edge loss on stage 2, a lime patch
     slowing and restoring a staggered footman, bottle/lamp lift-hold-throw-and-always-shatter, defensive-vs-aggressive bot `throwChance`, and the optional Scrap Slinger / Soot Cutthroat
     prop-throw stretch behind dev-only `?enemythrow=1` (never in netplay).
  3e. `entrances` (`tools/scenarios/entrances.js`, issue #30): each of the four entrance kinds is queued onto an empty
     `?nowaves=1` arena and watched frame by frame — the tell is placed before the unit exists and answers `dangerBox()`,
     the unit then spawns in `ARRIVING` with `entered` false and takes no action for its whole approach, and the arrival
     ends in a punishable window on the floor with `firstAttackDelay` re-armed. Plus the rope-drop line cut, checked on
     both an unarmored unit (the hit is rewritten to a knockdown) and a shielded Marine (whose armour swallows the
     reaction, but whose line is cut all the same).
  3f. `obstacles` (`tools/scenarios/obstacles.js`, issue #31): against the real authored obstacles — board 1's
     Funicular roof gap and board 2's Gas-Halls powder barricade. Walking into a gap drops the player through it for
     health (measured on hp PLUS the hero's shield, since that buffer is spent first) and sets them on the lip; a
     running jump clears it for nothing; an enemy standing in it rings out; an enemy walled off from its target leaves
     the ground and reaches the far side; and a barricade blocks, holds its wave lock and answers `dangerBox()` until
     its Prop is broken, then stops doing all three.
  3g. `platforms` (`tools/scenarios/platforms.js`, issue #32): one block per platform kind against the real authored
     section — the Cold Sovereign banking and the Lash-Up float dipping (a grounded body slides with the deck, an
     airborne one does not), the Sootfoot Docks cargo pallet (a body on it is carried, one off it is left behind) and
     the Tallow Works hoist (a climbing hoist pulls an airborne body down faster than gravity alone, and leaves a
     grounded one alone) — plus the regression that the Brass Funicular declares no platform.
  3h. `events` (`tools/scenarios/events.js`, issue #33): the browser half of the event system — `?event=<id>` starts
     in the section that owns it, board 1's over-fire script warns with a `zoneFlash` BEFORE it forces all three dais
     vents open together and hands every override back afterwards, board 2's broadside forces its two guns one after
     the other rather than together, and an unknown id is inert rather than a crash. Action sequencing itself is in
     `tools/simtest.js`.
  3i. `cargo` (`tools/scenarios/cargo.js`, issue #34): against the real authored containers — a quay crate tips its
     cargo out on break and the unit climbs out at the crate into a punishable recovery; the foundry chute is quiet
     (no threat box), rattles (threat box live), lets one out at a time, stops its clock while it is stood on and
     resumes rather than resets when you step off; a smashed brig hatch drops loot for what never came out instead of
     tipping the load; and a wave entry addressed at the yard handcart spawns AT the cart, and still delivers when the
     cart has already been broken.
  4. `playthrough`: `?bot=1&godmode=1&autotest=1&seed=1`, step in chunks of 600 frames up
     to a hard cap (e.g. 30000 frames), assert progress (camera advances, waves clear,
     midboss and boss die, results screen reached). Screenshot each section + boss + results.
  4b. `playthrough2`: the same run with `&stage=2` — every registered board must be completable
     by the bot with zero runtime errors.
  5. `coop`: two players, same as 4 for 3000 frames.
  6. `gallery`: `?skipTo=gallery` screenshots the idle / walk / attack pages, then asserts the registry
     against a named list (the seven long-standing variants plus the six issue #28 added — `stormcrow:deckhand`,
     `stormcrow:grapnel`, `chandler:runner`, `chandler:drayman`, `gleaning:picker`, `gleaning:riggerman`) and a
     floor of 39 entries (31 variants + 8 bosses), so a deleted variant cannot shrink the test with it. Then every
     one of those 39 entries is spawned on its own in a free-roam arena (`nowaves=1&godmode=1`), asserted alive
     after 400 frames and asserted to lose hp to player attacks, and screenshot as `40-enemy-<type>-<variant>`.
  7. `botstyles`: every `BOT_STYLES` archetype fights and makes progress, and `?botstyle=a,b`
     puts a different archetype in each co-op slot.
  8. `options` (lives in its own `tools/playtest-options.js`, imported and registered here as
     `optionsScenario`): drives the OPTIONS overlay from both title and pause (hidden from pause under
     netplay), every row (difficulty, music/sfx sliders, screen shake incl. a live `Camera.shakeScale`
     check), the CONTROLS grid's key and gamepad capture and every conflict-refusal path, persistence
     across a reload, that a remapped key drives gameplay damage while the old key does nothing, and
     RESET TO DEFAULTS. Further scenarios that don't fit in `playtest.js` follow this sibling-module
     pattern: a small file exporting one function of the form `(server, { withPage, assert }) => {...}`,
     imported and added to the `scenarios` map here.
  9. `coop4` (`tools/scenarios/coop4.js`, issue #23): a four-bot run to results (`attackTokens.max===4`, 4 stats rows); pad-only drop-in mid-run/pause; title pad-claim assignment (arrows-then-pad stays P2, `resetClaims()` releases on title entry); a four-cursor select into gameplay; the netplay guard (own room) — `beginMatch` un-joins local slots above `NET_PLAYERS`, no pad claims the peer's slot, no desync.
  10. `training` (`tools/scenarios/training.js`, issue #22 — same sibling-module pattern as `options`/`coop4`,
     registered from here as `training: (server) => trainingScenario(server, { withPage, assert, CHARACTER_COUNT })`):
     Part A, per hero, `?skipTo=training`: lands on `training` with one STAND Tin Footman dummy and no props/
     rails in the arena; every move-list animation is covered and each hero has 5-8 trials; walks in and
     lands attack1, asserting the frame-data readout's startup/active/recovery against the hand-checked
     table; BLOCK/VARIANT/METER-LOCK plate settings and dummy respawn-after-death; hero 0 also screenshots
     the hitbox overlay, the training pause plate, the trial list and the MOVES screen reached from it.
     Part B (`?seed=3&chars=0&bot=1&resetprogress=1`): the built-in bot completes Brunhild's 4-hit combo
     trial against the pinned dummy within a frame budget, the tick is readable via `trialState()` and
     persists under `aetherAndBrass.trials.v1`, a two-body trial keeps two dummies standing, and a trial's
     `dummyMode` override (and its release) is asserted. Part C: the title's TRAINING row reaches `select`
     then `training`; the normal gameplay pause plate's MOVES row opens `moves` and returns.
  Exit code non-zero on any assertion failure or `__game.errors.length > 0`.

`tools/winrate.js` (`npm run winrate`) is the balance counterpart: it plays runs with NO godmode
and reports how often the engine wins, sweeping `--stages`, `--difficulty`, `--chars`, `--party`
(1-4, every slot beyond the first on autopilot) and `--styles`. Every playtest bot run is in godmode, so
the suite can prove the game works but never that it is fair; this answers the second question.
Runs that never reach the results plaque are reported as unfinished — a soft-lock, not a loss.

## 14. Code conventions
- ES2022, `const`/`let`, named exports, one class per file where sensible, JSDoc on
  public functions. 2-space indent, semicolons, single quotes.
- Content modules (`content/`) must be **data + small draw hooks** only; no gameplay
  logic other than optional `onUpdate` hooks.
- Never hardcode a number twice: put it in the def or `constants.js`.
- Every module must import only from `engine/`, `art/`, `game/`, `content/` — never
  from `tools/`.
- All angles in degrees in content data; converted to radians inside `rig.js`.

## 15. Additional debug hooks required by `tools/playtest.js`
URL params (all only honored when `?autotest=1` or `?debug=1`):
- `skipTo=gameplay|gallery|results|title|training` — `gallery` is a debug screen that draws every
  playable character, every enemy variant and every boss rig — `ENEMY_GALLERY`, 49 entries: the 31 variants plus
  each board's mid-boss and boss base rig and every phase rig that ships its own `build` — in a labelled grid, cycling
  animations (`right` = next anim: idle → walk → attack1 → hurt …, `left` = previous). `training`
  (issue #22, `game/screens/training.js`) opens the training room directly for the chosen `chars`
  hero: one STAND dummy on the Funicular roof, no waves, no props, ready for `__game.setTraining()`.
- `chars=0,2` — character indices by slot, up to four (`MAX_PLAYERS`): `chars=0,1,2,3` fills slots 0-3.
- `nowaves=1` — the stage runner never triggers waves/bosses (free-roam test arena).
- `spawn=typeA:grunt@80,typeB:brute@-90` — spawn enemies at `player.x + dx` on load.
- `bot=1` — autopilot for every player: walk toward the nearest enemy (align z), attack when
  in range, occasionally jump-attack/special, walk right when no enemies; skip intro/results prompts.
- `botstyle=NAME[,NAME,...]` — which `BOT_STYLES` archetype each slot's autopilot plays as
  (`src/game/bot.js`): `balanced` (default, the behaviour the playtest scenarios are written
  against), `aggressive`, `defensive`, `masher`. One name applies to every slot; one name per joined
  slot gives each its own. A style is a whole player archetype (button speed, dodge rate, spacing, when it
  retreats), not a difficulty setting — difficulty is an OPTIONS choice persisted by
  `game/options.js`, with `?difficulty=` as a session override. Each style also carries a
  `throwChance` (issue #21: balanced 0.4, aggressive 0, defensive 0.9, masher 0.2) — the only intentional bot throw path, rolled at most once every 20 frames while armed and in range.
- `enemythrow=1` — optional stretch (issue #21 step 21.6): a Scrap Slinger or Soot Cutthroat may lift and throw a nearby throwable prop at its target (`game/throwables.js` `tryEnemyPropThrow` /
  `thinkEnemyHeld`), spending an attack token like any other attack. Off by default and forced off whenever `world.game.net.active` (the START packet does not carry the flag, so a peer without it
  would desync).

`window.__game` extra members: `ready` (true once the first screen entered),
`spawnEnemy(type, variant, dx, dz)` (relative to P1), `killAllEnemies()`,
`spawnWeapon(id, dx, dz)` (lays a settled pickup weapon at P1.x + dx, P1.z + dz, no pop, no grace),
`spawnEntrance(type, variant, kind, { z, delay, ...entranceFields })` (issue #30: queues ONE spawn with an authored
entrance through the stage runner's ordinary `queueSpawns` path, so a scenario can watch a tell, an ARRIVING approach
and a punish window on an otherwise empty `?nowaves=1` arena — the runner drains its pending queue even under
`nowaves`, which only stops it TRIGGERING waves),
`enemyList() -> [{type, variant, name, role}]` (`ENEMY_LIST`, 39 entries: the 31 non-boss variants — 5 Brassbound,
5 Sootborn, 7 Stormcrow, 7 Gleaning, 7 Chandlery — then the 8 boss entries `midboss`/`boss`, `midboss2`/`boss2`,
`midboss3`/`boss3`, `midboss4`/`boss4`, each with `role: 'boss'` and its own `variant` slug),
`characterList() -> [{id, name}]`, `fillMeter(p)`, `facePlayerToNearestEnemy(p)` (turns
P1 toward and steps toward the nearest enemy — used by the enemy test), `summary().boss` =
`{ kind:'midboss'|'boss', name, hp, maxHp, phase, state }` or `null`.
`summary().sectionIndex` = index of the section containing the camera center.
`summary().players[]` has no held-prop or thrown-projectile fields (issue #21); the `thrown` scenario reaches those directly off `world.entities` (`heldProp`, `thrownWeapon`, `thrownProp`,
`lost`), the same convention the `weapons` scenario already uses for dropped `WeaponPickup`s.
`__game.setTraining(partial)` (issue #22) delegates to the current screen's `setTraining` (`null` off
`training`) and returns its `summary().training` — `{ mode, userMode, variant, faceLock, meterLock,
hitboxes, frameData, dummies, trial, readout, done }` — the same object `summary().training` exposes
directly while `training` is the top screen; `partial` may set any of `mode`, `variant`, `faceLock`,
`meterLock`, `hitboxes`, `frameData`, `refill: true`, `reset: true`, or `trial: id | null`.
`__game.trialState()` returns the raw `aetherAndBrass.trials.v1` string and each hero's completed trial
ids, independent of which screen is on top. `__game.moveAnims` is `MOVE_ANIMS.slice()` (`content/characters/common.js`) — the animation names a hero's `moveList` must cover (move-list coverage assertion, scenario `training`).

## 16. Input bindings
The authoritative binding table lives in `docs/RECONCILIATION.md` (P1 = WASD + F G R H Y T Enter; P2 = Arrows + J K U L O I Backspace; P1 solo aliases Arrows + Z X C V N B until P2 joins; Space jumps on both P1 sets; gamepads are not index-bound — an unbound pad's first button press claims the lowest free slot; P3/P4 are gamepad-only, no keyboard half). Actions: `left right up down attack jump dodge special super taunt start`. Global keys: Escape pause, M mute, F1 debug. `preventDefault()` on every bound key.
`engine/input.js` implements that table verbatim (`bindings.keyboard[0|1]`, `bindings.soloAliases`, `bindings.gamepad`, `bindings.gamepadRun = [7]`, stick deadzone 0.25). Drop-in for any slot 1-3: poll `input.joinPressed(slot)` and call `input.setJoined(slot, true)`; the title screen resets every claim (`input.resetClaims()`).
The table above is only the shipped default: `game/options.js` persists any remapping under
`aetherAndBrass.options.v1` (same guarded-`localStorage` pattern as `game/progress.js`, via
`game/storage.js`'s `store()`), loading it once at boot and re-sanitising it against the defaults. The
six binding conflict invariants (one key per action per layout; a same-layout collision swaps; a
same-side sibling strip refuses if it would leave an action unbound; the other player's key, the
sibling layout's key for a different action, and the three global keys are always refused; a code the
edited layout already owns under the same action is exempt, so P1 and P2 can rearrange the shared arrow
keys between themselves) live entirely in `engine/bindings.js` (`rebindKey` / `rebindPad` /
`sanitiseBindings`) and are enforced identically for a live rebind (`screens/controls.js` via
`input.rebind`) and a loaded save. Screens must never hard-code a key name or gamepad label: every
legend, join hint and grid cell reads through `input.legend()` / `input.joinHint()` / `input.joinKeysHint()` /
`input.keyText()` / `input.cellText()` / `input.hasKey()`, cached and invalidated by `input.bindingsVersion`.

**Menu keys (`game/menuinput.js`).** The scheme every screen and plate obeys, defined once so the two
halves can never drift apart again (they had: `start` confirmed on the title, board select and OPTIONS but
resumed on the pause plate, while `jump` confirmed on the title and backed out of every overlay, so ENTER
on a highlighted pause row closed the plate instead of picking it):

| | keys | helper |
|---|---|---|
| CONFIRM | `start` (Enter / pad START) or `attack` | `confirmPressed(input, player)` |
| BACK | `jump` or `dodge` (pad B / X) | `cancelPressed(input, player)` |
| BACK (global) | `Escape` | `escapePressed(input, online)` |

A pause plate opens on Escape or `start` with its cursor on RESUME, so either key closes a freshly opened
one; after a cursor move ENTER picks the row and Escape resumes. A plate with nothing to pick (`moves.js`,
`gallery.js`) treats CONFIRM as BACK rather than leaving ENTER dead. `escapePressed(input, true)` returns
`false`, which is how every overlay only one peer could pop stays netplay-safe (`docs/MULTIPLAYER.md`):
online, `net/session.js` folds Escape into the `start` bit, so it arrives as a CONFIRM on the party's
shared cursor and `jump` / `dodge` remain a deterministic BACK. Hint lines name the CONFIRM / BACK keys
through `confirmKey(input)` / `backKey(input)` (never a hard-coded label) and are built in `enter()` — or,
for a screen that can sit under a live rebind (`pause.js`, `trainpause.js`, `options.js`, `controls.js`),
rebuilt when `input.bindingsVersion` changes, never per frame in `draw()`.
