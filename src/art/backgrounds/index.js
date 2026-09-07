// Backdrop registry. CONTRACT (docs/RECONCILIATION.md "Backdrop API"):
//   createBackdrop(section, stage) -> { update(frame, cam), drawBack(ctx, cam, frame), drawFront(ctx, cam, frame) }
// - drawBack paints EVERYTHING behind entities: sky, far/mid parallax layers and the floor band
//   (rows FLOOR_TOP..FLOOR_TOP+Z_MAX) for the section's x-range, in screen space using cam.x/cam.shakeX/shakeY.
// - drawFront paints near-parallax overlays and weather (rain, heat shimmer, motes) on top of entities.
// - update advances animated elements (gears, airships, drifting lava, auto-scroll for section 3).
// Section modules (section1.js .. section4.js) export `create(section, stage)` with the same shape.
// This file currently provides a PLACEHOLDER for unknown ids; the backdrop artist replaces the internals
// of the per-section modules without changing this API.
import { VIEW_W, VIEW_H, FLOOR_TOP, Z_MAX } from '../../constants.js';

const PLACEHOLDER_PALETTES = {
  section1: { skyTop: '#0E1424', skyBot: '#1F2A44', floorA: '#3A2E24', floorB: '#443629' },
  section2: { skyTop: '#2A1C16', skyBot: '#5A3A2E', floorA: '#2E2A28', floorB: '#3A3533' },
  section3: { skyTop: '#3A2450', skyBot: '#E8743B', floorA: '#A67C2E', floorB: '#8C6825' },
  section4: { skyTop: '#1B1E2B', skyBot: '#3B3A46', floorA: '#D9D3C7', floorB: '#B9B2A5' },
};

let sectionModules = null;
/** Lazily import the per-section modules so a broken artist module cannot break the whole game. */
async function loadSectionModules() {
  if (sectionModules) return sectionModules;
  sectionModules = {};
  const ids = ['section1', 'section2', 'section3', 'section4'];
  await Promise.all(ids.map(async (id) => {
    try { sectionModules[id] = await import(`./${id}.js`); } catch (e) { sectionModules[id] = null; }
  }));
  return sectionModules;
}
// Kick off loading at module import time so createBackdrop can be synchronous by the time gameplay starts.
const modulesReady = loadSectionModules();

/** Placeholder backdrop: gradient sky + striped floor; used until a section module exists. */
export function createPlaceholderBackdrop(section) {
  const pal = PLACEHOLDER_PALETTES[section.backdrop] || PLACEHOLDER_PALETTES.section1;
  return {
    update() {},
    drawBack(ctx, cam) {
      const g = ctx.createLinearGradient(0, 0, 0, FLOOR_TOP);
      g.addColorStop(0, pal.skyTop); g.addColorStop(1, pal.skyBot);
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP);
      ctx.fillStyle = pal.floorA; ctx.fillRect(0, FLOOR_TOP, VIEW_W, Z_MAX);
      ctx.fillStyle = pal.floorB;
      for (let x = -(((cam.x | 0) % 48) + 48) % 48; x < VIEW_W; x += 48) ctx.fillRect(x, FLOOR_TOP, 24, Z_MAX);
      ctx.fillStyle = '#0a0a0e'; ctx.fillRect(0, FLOOR_TOP + Z_MAX, VIEW_W, VIEW_H - FLOOR_TOP - Z_MAX);
    },
    drawFront() {},
  };
}

/**
 * Create the backdrop for a stage section. Synchronous: if the section's art module has not finished
 * loading yet (only possible in the first few ms after boot) a placeholder is returned.
 * @param {{id:string, backdrop:string, x0:number, x1:number}} section
 * @param {object} stage the full stage definition
 */
export function createBackdrop(section, stage) {
  const mod = sectionModules && sectionModules[section.backdrop];
  if (mod && typeof mod.create === 'function') return mod.create(section, stage);
  return createPlaceholderBackdrop(section);
}

/** Await this before starting gameplay to guarantee real section art is used. */
export function backdropsReady() { return modulesReady; }
