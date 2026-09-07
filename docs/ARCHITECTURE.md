# Aether & Brass — Technical Architecture Contract

This document is the binding technical contract for the game. Every module, agent and
reviewer codes against it. If the GDD (`docs/GDD.md`) and this file disagree on a
*technical* matter, this file wins; on a *design* matter (names, numbers, movesets,
stage beats), the GDD wins.

## 0. Stack & non-negotiables

- **Runtime:** browser, HTML5 Canvas 2D, vanilla JavaScript **ES modules**. No
  framework, no TypeScript, no bundler required to *play* (open `index.html` via any
  static server). `npm run build` produces a single-file `dist/index.html` (esbuild) for
  sharing, but `src/` must always run un-bundled.
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
package.json               # scripts: dev, build, test (see section 13)
tools/server.js            # zero-dependency static server (node), used by dev + tests
tools/playtest.js          # Playwright headless playthrough harness (see section 13)
tools/build.js             # esbuild single-file bundle -> dist/index.html
docs/GDD.md                # game design document (authoritative for design)
docs/ARCHITECTURE.md       # this file
src/
  main.js                  # boot: create Game, start loop, install debug hooks
  constants.js             # VIEW_W, VIEW_H, DT, FLOOR_TOP, Z_MIN, Z_MAX, GRAVITY, TEAM, etc.
  engine/
    loop.js                # fixed-timestep loop; test mode step(n)
    input.js               # keyboard + gamepad -> per-player action state with edge detection & buffer
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
      section1.js ... section4.js, floors.js, sky.js
    props.js               # breakable/static prop renderers (crates, barrels, lamps, pipes, gears...)
    portraits.js           # character-select portraits & HUD icons drawn from rigs
  game/
    game.js                # Game: screen stack, players, options, transitions
    world.js               # World: entities list, spawn/despawn, depth-sorted draw, update, hit resolution
    entity.js              # Entity base class
    fighter.js             # Fighter: shared state machine, animation player, hurt/knockdown/juggle, grabs
    player.js              # Player extends Fighter: input-driven controller, combos, meter, supers
    enemy.js               # Enemy extends Fighter: AI controller framework (section 8)
    boss.js                # Boss extends Enemy: phase machine, HP bar, intro
    combat.js              # hitbox/hurtbox resolution, damage application, hitstop, knockback rules
    animation.js           # animation player utilities: play(name), tick(), current frame/pose, events
    items.js               # pickups (food/health, score, meter) and breakable props
    hazards.js             # stage hazards (steam vents, pistons, conveyor floors, pits if any)
    stage.js               # StageRunner: sections, wave director, camera locks, GO arrow, boss trigger
    hud.js                 # in-game HUD
    screens/
      title.js, select.js, intro.js, gameplay.js, pause.js, gameover.js, results.js
  content/
    characters/            # one file per playable character (rig build, palette, anims, moves)
      index.js, brass.js, ... (names from GDD)
    enemies/
      index.js             # registry: getEnemyDef(type, variant)
      typeA.js             # base rig/anims for type A + 5 variant overrides (file name from GDD)
      typeB.js
      midboss.js, boss.js
    stage/
      stage1.js            # stage data (sections, waves, props, hazards) per section 7 format
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
- Gravity `GRAVITY = 0.55` px/frame²; a jump sets `vy = 9.5` (≈ 82 px apex) unless the
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
  setVirtual(player, actionsObject),  // test hook: { left:true, attack:true ... } overrides devices until cleared
  clearVirtual(player),
  bindings,                           // exported default keyboard maps (from GDD section 8)
}
```
Players are `0` and `1`. Gamepad `i` maps to player `i` and is OR-merged with that
player's keyboard bindings. Use the standard gamepad mapping (d-pad + left stick
for movement, buttons per GDD).

### `engine/camera.js`
```js
export class Camera {
  constructor(stageLength)    // right bound when unlocked
  x = 0; left = 0; right = STAGE_LENGTH; locked = false; shakeX; shakeY; minX;
  follow(players)             // target = mean x of alive players - VIEW_W/2, clamped to [max(left, minX), right - VIEW_W]; eased (approach 0.12)
  lock(x0, x1) / unlock()     // lock also sets left/right (right >= x0 + VIEW_W); unlock sets left = floor(x) (never scrolls back)
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

Required fields: `hp, maxHp, team (TEAM.PLAYER|TEAM.ENEMY), def (content definition), rig, anim (AnimPlayer), state, stateTimer, invuln (frames), hitstop (frames), armor (bool, elites ignore hitstun), juggleCount, lastHitBy, grabTarget/grabbedBy, flashTimer, dead`.

Rules implemented ONCE in `Fighter` (players and enemies both inherit):
- `takeHit(hit, attacker)` applies damage, hitstop to both (`light:4, heavy:7, launch:8, knockdown:10` frames), flash, knockback (`vx = kbX * attacker.facing`, `vy = kbY`), state → `HURT` (ground, `hitstun` frames), `HURT_AIR` if airborne, `KNOCKDOWN` if `type` is `launch`/`knockdown` or if `juggleCount >= 3` or if hp <= 0. Spawns hit spark + damage text. Returns false if invulnerable / already dead / friendly (no friendly fire between players; enemies never hurt enemies unless `hit.friendly`).
- `KNOCKDOWN` flight: gravity applies; on landing → `LYING` for `def.lyingFrames` (default 40; dead → stay & fade out), then `GETUP` (invuln 20 frames), then `IDLE`. Juggle: a `KNOCKDOWN` fighter still in the air with `y > 0` can be hit again (juggle), which resets `vy` to `hit.kbY * 0.8`; `juggleCount++`; after 4 juggles the target becomes hit-immune until it lands (anti-infinite).
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
- Meter: `meter (0..100)`; gain on hit dealt (`+4` light, `+8` heavy), on taunt completion (`+25`), on damage taken (`+2`). Reset per life.
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
      props: [ { type: 'crate', x: 320, z: 60, drops: 'food_small' }, { type: 'lamp', x: 500, z: 8 /* static, no collide */ } ],
      hazards: [ { type: 'steamVent', x: 800, z: 100, period: 180, active: 60 } ],
      waves: [
        { triggerX: 240,   // when camera.x + VIEW_W/2 >= triggerX (i.e. players reached here)
          lock: true,      // camera locks to [triggerX - VIEW_W/2, triggerX + VIEW_W/2]
          spawns: [ { type: 'typeA', variant: 'grunt', side: 'right', z: 40, delay: 0 },
                    { type: 'typeA', variant: 'grunt', side: 'left',  z: 100, delay: 45 } ],
          reinforcements: [ { whenRemaining: 1, spawns: [ ... ] } ]   // optional
        },
      ],
      events: [ { atX: 1050, kind: 'midboss' | 'bossIntro' | 'text', ... } ]
    }, ...
  ],
  midboss: { atX: ..., def: 'midboss' },
  boss:    { atX: ..., def: 'boss', arena: { x0, x1 } },
}
```
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
`ENTER` (walk on-screen) → `APPROACH` (align `z` within `zTolerance`, close to `attackRange` on the target's facing-agnostic side; picks the nearest player, re-targets every 90 frames or when hit) → `ATTACK` (needs an **attack token**: `World.attackTokens` limits simultaneous attackers to 2 (3 in co-op) — enemies without a token `HOVER`: shuffle at distance `attackRange + 30..60`, occasionally step in `z`) → `RECOVER` (short back-off after attacking, `retreatChance`) → loop. Ranged variants use `KEEP_DISTANCE`. Elites/bosses ignore tokens. Enemies never overlap each other perfectly: apply a soft separation force between enemies within 18px in `x` and 10px in `z`. Enemies react to being hit exactly like players (shared `Fighter`).
Off-screen rule: an enemy that is > 200px outside the camera for 300 frames teleports to
the nearest lock edge (prevents stuck waves).

## 9. Screens (`game/screens/`)
`Game` holds a stack `screens[]`; top screen gets `update()`, all screens draw bottom
to top if `transparent` (pause overlay). Each screen: `enter(params)`, `exit()`,
`update()`, `draw(ctx)`. Flow: `title → select → intro → gameplay ⇄ pause; gameplay → gameover → (continue → gameplay | title); gameplay → results → title`.
Title: animated backdrop, logo, "PRESS ATTACK", blinking. Select: 4 portraits, both
players can join (P2 presses start), stats bars, confirm/back. Intro: stage card 2.5s
(skip on attack). Results: score, max combo, grade, time, "PRESS START".

## 10. HUD (`game/hud.js`)
Per player (P1 left, P2 right): portrait icon, name, health bar (segmented, colors shift
at < 30%), special meter bar, lives count, score. Center-top: current enemy targeted
health bar (name + bar, last hit enemy, 2s), boss bar at bottom when a boss is active.
Combo counter: near the player, big number + "HITS" + grade text when dropped.

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
chosen characters and section), `?godmode=1`, `?bot=1` (built-in autopilot that walks
right and attacks the nearest enemy — used for headless playthroughs).

```js
window.__game = {
  game, world (getter), input, rng,
  step(n),                           // run n fixed updates + 1 render (test mode)
  screen() -> string,                // current screen id
  summary() -> { screen, sectionIndex, cameraX, locked, players: [{hp, lives, x, state, meter, score}], enemies: [{name, variant, hp, state, x, z}], boss: {...}|null, wavesCleared, errors: [] },
  setInput(p, actions) / clearInput(p),
  errors: []                         // window.onerror + unhandledrejection push here
}
```
Every uncaught error must be pushed to `__game.errors` (and rendered in a red box in
debug mode) — tests fail on any error.

## 13. Tooling & tests
- `npm run dev` → `node tools/server.js` (serves repo root on http://localhost:8080 with correct
  `Content-Type` for `.js` = `text/javascript`, no caching).
- `npm run build` → `node tools/build.js` → esbuild bundles `src/main.js` (IIFE, minified
  off) and inlines it + CSS into `dist/index.html` (single file, no external refs).
- `npm test` → `node tools/playtest.js`: starts the server, launches headless Chromium
  via the globally installed Playwright (`NODE_PATH=/opt/node22/lib/node_modules` or
  local dep), runs scenarios and writes screenshots to `tools/screens/`:
  1. `boot`: title screen renders, zero errors.
  2. `select`: navigate select, pick every character (4 runs), start gameplay, zero errors.
  3. `combat`: for each character, spawn near enemies, script attacks (combo, jump attack,
     dash attack, special, super, grab/throw), assert enemy hp decreases, assert hits land.
  4. `playthrough`: `?bot=1&godmode=1&autotest=1&seed=1`, step in chunks of 600 frames up
     to a hard cap (e.g. 30000 frames), assert progress (camera advances, waves clear,
     midboss and boss die, results screen reached). Screenshot each section + boss + results.
  5. `coop`: two players, same as 4 for 3000 frames.
  6. `enemies`: spawn every one of the 10 variants + midboss + boss via
     `?skipTo=gameplay&spawn=typeA:grunt`, screenshot each for a visual review sheet (`tools/screens/enemies.png` contact sheet).
  Exit code non-zero on any assertion failure or `__game.errors.length > 0`.

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
- `skipTo=gameplay|gallery|results|title` — `gallery` is a debug screen that draws every
  playable character, every enemy variant and both bosses in a labelled grid, cycling
  animations (`right` = next anim: idle → walk → attack1 → hurt …, `left` = previous).
- `chars=0,2` — character indices for P1 (and P2 if two given).
- `nowaves=1` — the stage runner never triggers waves/bosses (free-roam test arena).
- `spawn=typeA:grunt@80,typeB:brute@-90` — spawn enemies at `player.x + dx` on load.
- `bot=1` — autopilot for every player: walk toward the nearest enemy (align z), attack when
  in range, occasionally jump-attack/special, walk right when no enemies; skip intro/results prompts.

`window.__game` extra members: `ready` (true once the first screen entered),
`spawnEnemy(type, variant, dx, dz)` (relative to P1), `killAllEnemies()`,
`enemyList() -> [{type, variant, name, role}]` (10 variants + `{type:'midboss'}` + `{type:'boss'}`),
`characterList() -> [{id, name}]`, `fillMeter(p)`, `facePlayerToNearestEnemy(p)` (turns
P1 toward and steps toward the nearest enemy — used by the enemy test), `summary().boss` =
`{ kind:'midboss'|'boss', name, hp, maxHp, phase, state }` or `null`.
`summary().sectionIndex` = index of the section containing the camera center.

## 16. Input bindings
The authoritative binding table lives in `docs/RECONCILIATION.md` (P1 = WASD + F G R H Space T Enter; P2 = Arrows + J K U L O I Backspace; P1 solo aliases Arrows + Z X C V Space B until P2 joins; gamepads 0/1 → P1/P2). Actions: `left right up down attack jump dodge special super taunt start`. Global keys: Escape pause, M mute, F1 debug. `preventDefault()` on every bound key.
