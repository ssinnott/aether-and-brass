// Dev preview for the per-section backdrops (tools/preview-backdrops.html).
// Shows one section at a time; 1-4 select, arrows scroll the camera, Space toggles animation.
// Draws a few rig-sized boxes at different z so scale and floor depth read.
import { VIEW_W, VIEW_H, FLOOR_TOP, Z_MAX } from '../src/constants.js';
import { Camera } from '../src/engine/camera.js';
import { createBackdrop, backdropsReady } from '../src/art/backgrounds/index.js';

const SECTIONS = [
  { id: 's1', backdrop: 'section1', x0: 0, x1: 1800, name: 'Sootfoot Docks' },
  { id: 's2', backdrop: 'section2', x0: 1800, x1: 3800, name: 'Foundry Row' },
  { id: 's3', backdrop: 'section3', x0: 3800, x1: 4440, name: 'Brass Funicular (locked)' },
  { id: 's4', backdrop: 'section4', x0: 4440, x1: 6000, name: 'Heart-Engine' },
];
const STAGE = { id: 'stage1', name: 'The Ascent of Calderwick', length: 6000, sections: SECTIONS };

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
const scale = Math.max(1, Math.min(4, Number(q.get('scale') || 2)));
canvas.style.width = VIEW_W * scale + 'px';
canvas.style.height = VIEW_H * scale + 'px';
const hud = document.getElementById('hud');

const state = {
  sectionIndex: 0,
  backdrop: null,
  cam: new Camera(STAGE.length),
  frame: 0,
  animating: q.get('anim') !== '0',
  showRigs: q.get('rigs') !== '0',
  rigZ: 70,
  errors: [],
};
window.addEventListener('error', (e) => state.errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => state.errors.push(String(e.reason || e)));

function section() { return SECTIONS[state.sectionIndex]; }
function clampCam() {
  const s = section();
  state.cam.x = Math.max(s.x0 - VIEW_W, Math.min(s.x1, state.cam.x));
}
function selectSection(i, camX) {
  state.sectionIndex = Math.max(0, Math.min(SECTIONS.length - 1, i));
  const s = section();
  state.backdrop = createBackdrop(s, STAGE);
  state.frame = 0;
  state.cam.x = camX == null ? s.x0 : camX;
  clampCam();
}
/** Advance the backdrop by n frames. */
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    state.cam.update();
    state.backdrop.update(state.frame, state.cam);
    state.frame++;
  }
}

function drawRig(x, z, w, h, color, label) {
  const cam = state.cam;
  const sx = cam.toScreenX(x), sy = Math.round(FLOOR_TOP + z + (cam.shakeY || 0));
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(sx, sy, w * 0.6, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2B2B30'; ctx.fillRect(sx - w / 2 - 2, sy - h - 2, w + 4, h + 4);
  ctx.fillStyle = color; ctx.fillRect(sx - w / 2, sy - h, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx - w / 2, sy - h / 2, w, h / 2);
  ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
  ctx.fillText(label, sx, sy - h - 6);
}

function render() {
  const cam = state.cam;
  state.backdrop.drawBack(ctx, cam, state.frame);
  if (state.showRigs) {
    const s = section();
    const base = Math.round(cam.x) + 120;
    drawRig(base + 60, 10, 40, 72, '#8a3a2a', 'z10');
    drawRig(base + 200, state.rigZ, 40, 72, '#3f6a4a', 'z' + state.rigZ);
    drawRig(base + 340, 130, 40, 72, '#5a3a8a', 'z130');
    drawRig(base + 440, 90, 56, 100, '#4a4a58', 'hulk z90');
    // floor band guides
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, FLOOR_TOP, 4, 1); ctx.fillRect(0, FLOOR_TOP + Z_MAX - 1, 4, 1);
    void s;
  }
  state.backdrop.drawFront(ctx, cam, state.frame);
  const s = section();
  hud.textContent = `[${state.sectionIndex + 1}] ${s.name}  x ${s.x0}-${s.x1}   cam.x ${Math.round(cam.x)}   frame ${state.frame}   anim ${state.animating ? 'on' : 'off'}   errors ${state.errors.length}`;
}

function loop() {
  if (state.animating) step(1);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k >= '1' && k <= '4') selectSection(Number(k) - 1);
  else if (k === 'ArrowLeft') { state.cam.x -= e.shiftKey ? 64 : 8; clampCam(); }
  else if (k === 'ArrowRight') { state.cam.x += e.shiftKey ? 64 : 8; clampCam(); }
  else if (k === 'ArrowUp') state.rigZ = Math.max(0, state.rigZ - 10);
  else if (k === 'ArrowDown') state.rigZ = Math.min(Z_MAX, state.rigZ + 10);
  else if (k === ' ') state.animating = !state.animating;
  else if (k === '.') step(1);
  else if (k === 's') state.cam.shake(6, 20);
  else if (k === 'g') state.showRigs = !state.showRigs;
  else if (k === 'r') selectSection(state.sectionIndex);
  else return;
  e.preventDefault();
});

await backdropsReady();
selectSection(Number(q.get('section') || 1) - 1, q.has('cam') ? Number(q.get('cam')) : null);
if (q.has('frame')) step(Number(q.get('frame')) | 0);
render();
/** Test hooks for Playwright. */
window.__preview = {
  state, SECTIONS, selectSection, step, render,
  setCam(x) { state.cam.x = x; clampCam(); },
  shot(sectionIndex, camX, frames = 0) { selectSection(sectionIndex, camX); step(frames); render(); return state.errors.slice(); },
};
requestAnimationFrame(loop);
