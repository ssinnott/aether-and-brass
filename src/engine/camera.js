// Side-scrolling camera with lock bounds and shake (ARCHITECTURE.md section 3).
import { VIEW_W } from '../constants.js';
import { clamp } from './math.js';

/** How far across the screen the leading player may get before the camera has to follow them rather
 *  than the party's mean (see `follow`). 0.75 puts the hard stop 160px from the right edge. */
const LEAD_LIMIT = 0.75;

/** Camera along x; `left`/`right` are the current world bounds entities are clamped to. */
export class Camera {
  /** Visual-only multiplier on every shake() (options SCREEN SHAKE: 0 off, 0.5 low, 1 full). Never hashed: camera shake is excluded from net/checksum.js. */
  static shakeScale = 1;

  /**
   * @param {number} stageLength total stage width in px (right bound when unlocked)
   */
  constructor(stageLength = VIEW_W) {
    this.x = 0;
    this.stageLength = stageLength;
    this.left = 0;
    this.right = stageLength;
    this.locked = false;
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeFrames = 0;
    this.shakeIntensity = 0;
    /** Camera never scrolls back past this x (classic beat-em-up). */
    this.minX = 0;
    /** Easing factor toward the follow target. */
    this.ease = 0.12;
    this.target = 0;
  }

  /**
   * Follow the mean x of alive players, but never let the LEADER be held against the right edge:
   * the target is at least `leader - VIEW_W * LEAD_LIMIT`. Eased, clamped to [left, right - VIEW_W]
   * and never below minX.
   *
   * Without that floor one player can veto the whole run. The mean and the bounds in world.js
   * (a player is clamped to [cam.x + margin, cam.x + VIEW_W - margin]) settle into a standstill: a
   * hero who stops moving is pushed to the left edge, the one still playing is pinned against the
   * right edge, the mean lands exactly mid-screen, and `target === x` forever. Measured before this
   * floor: one idle hero at x 140 stopped the camera dead at 132 on a 6000px stage, and 16 seconds
   * of holding right moved it 0px. Somebody putting the pad down -- or just standing still -- ended
   * the run, and nothing the other player could press recovered it.
   *
   * The floor only binds when the party is more than half a screen apart (for two players: the mean
   * beats it until they are VIEW_W/2 apart), so ordinary co-op, where everyone moves together, is
   * untouched -- and it is identical to the old behaviour for one player, since the mean IS the
   * leader. Past that spread the camera travels at the leader's pace and the straggler is carried
   * along by the same left-edge clamp that used to strand everybody.
   * @param {Array<{x:number, alive?:boolean, dead?:boolean}>} players
   */
  follow(players) {
    let sum = 0, n = 0, lead = -Infinity;
    for (const p of players) {
      if (!p || p.alive === false || p.dead) continue;
      sum += p.x; n++;
      if (p.x > lead) lead = p.x;
    }
    if (n === 0) return;
    const lo = Math.max(this.left, this.minX);
    const hi = Math.max(lo, this.right - VIEW_W);
    this.target = clamp(Math.max(sum / n - VIEW_W / 2, lead - VIEW_W * LEAD_LIMIT), lo, hi);
    this.x += (this.target - this.x) * this.ease;
    if (Math.abs(this.target - this.x) < 0.05) this.x = this.target;
    if (!this.locked && this.x > this.minX) this.minX = this.x;
  }

  /** Lock the camera to world bounds [x0, x1] (usually one screen wide). Players are clamped inside. */
  lock(x0, x1) {
    this.locked = true;
    this.left = x0;
    this.right = Math.max(x1, x0 + VIEW_W);
  }

  /** Unlock: bounds become [current x, stageLength] so the camera never scrolls back. */
  unlock() {
    this.locked = false;
    this.left = Math.max(0, Math.floor(this.x));
    this.minX = Math.max(this.minX, this.left);
    this.right = this.stageLength;
  }

  /** Snap immediately to x (used on section skips). */
  snapTo(x) {
    this.x = this.target = clamp(x, this.left, Math.max(this.left, this.right - VIEW_W));
    this.minX = Math.min(this.minX, this.x);
  }

  /** Shake for `frames` frames with pixel intensity, scaled by the SCREEN SHAKE option. */
  shake(intensity = 4, frames = 10) {
    const k = intensity * Camera.shakeScale;
    if (k <= 0) return;
    this.shakeIntensity = Math.max(this.shakeIntensity, k);
    this.shakeFrames = Math.max(this.shakeFrames, frames);
  }

  /** Per fixed step: decay shake. (Math.random is fine here: purely visual.) */
  update() {
    if (this.shakeFrames > 0) {
      this.shakeFrames--;
      const k = this.shakeIntensity * (0.5 + 0.5 * Math.min(1, this.shakeFrames / 8));
      this.shakeX = Math.round((Math.random() * 2 - 1) * k);
      this.shakeY = Math.round((Math.random() * 2 - 1) * k * 0.6);
      if (this.shakeFrames === 0) { this.shakeIntensity = 0; this.shakeX = 0; this.shakeY = 0; }
    }
  }

  /** World x -> screen x (integer, includes shake). */
  toScreenX(x) { return Math.round(x - this.x + this.shakeX); }

  /** True if world x is within the visible range (+ margin). */
  isVisible(x, margin = 40) { return x >= this.x - margin && x <= this.x + VIEW_W + margin; }
}
