// Side-scrolling camera with lock bounds and shake (ARCHITECTURE.md section 3).
import { VIEW_W } from '../constants.js';
import { clamp } from './math.js';

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
   * Follow the mean x of alive players; eased, clamped to [left, right - VIEW_W] and never below minX.
   * @param {Array<{x:number, alive?:boolean, dead?:boolean}>} players
   */
  follow(players) {
    let sum = 0, n = 0;
    for (const p of players) {
      if (!p || p.alive === false || p.dead) continue;
      sum += p.x; n++;
    }
    if (n === 0) return;
    const lo = Math.max(this.left, this.minX);
    const hi = Math.max(lo, this.right - VIEW_W);
    this.target = clamp(sum / n - VIEW_W / 2, lo, hi);
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
