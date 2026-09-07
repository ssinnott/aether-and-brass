// Fixed-timestep game loop (ARCHITECTURE.md section 3). Logic at exactly 60 Hz, render per rAF.
import { DT, MAX_STEPS_PER_FRAME } from '../constants.js';

/**
 * Create the main loop.
 * @param {{ update: () => void, render: () => void, testMode?: boolean }} o
 *   In testMode the loop never self-runs; `step(n)` drives it (n fixed updates + 1 render).
 * @returns {{ start(): void, stop(): void, step(n?: number): void, fps: number, running: boolean, frame: number, testMode: boolean }}
 */
export function createLoop({ update, render, testMode = false }) {
  let running = false;
  let rafId = 0;
  let last = 0;
  let acc = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  let frame = 0;

  function tick(now) {
    if (!running) return;
    const dtSec = Math.min((now - last) / 1000, 0.25);
    last = now;
    acc += dtSec;
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      update();
      frame++;
      acc -= DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0; // drop backlog rather than spiral
    render();
    fpsFrames++;
    fpsTime += dtSec;
    if (fpsTime >= 0.5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }
    rafId = requestAnimationFrame(tick);
  }

  const loop = {
    testMode,
    /** Start the rAF loop (no-op in testMode). */
    start() {
      if (testMode || running) return;
      running = true;
      last = performance.now();
      acc = 0;
      rafId = requestAnimationFrame(tick);
    },
    /** Stop the rAF loop. */
    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    },
    /** Run n fixed updates then one render. Used by tests; also works in normal mode. */
    step(n = 1) {
      for (let i = 0; i < n; i++) { update(); frame++; }
      render();
    },
    get fps() { return testMode ? 60 : fps; },
    get running() { return running; },
    get frame() { return frame; },
  };
  return loop;
}
