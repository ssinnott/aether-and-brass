// Stage 2, section 1: THE MOORING SPINE (docs/STAGE2.md section 6). Dawn on the topmost mooring gantry of Calderwick,
// above a sea of cloud, with the Ninth Wing's blockade hanging in the weather.
// Far (0.2): storm gradient (indigo -> bruised violet -> dawn amber), a cloud sea at the horizon, three fleet hulls
//            drifting, and lightning that lights the whole sky for a few frames.
// Mid (0.5): the spine — lattice masts every 300px with gantry arms, mooring cables, swinging lanterns.
// Floor: wet iron grating with hazard chevrons, rivet seams and standing water.
// Deck rail (1.0, drawBack): the walkway's BACK rope rail, bolted to the deck and drawn behind the fight.
// Near (1.2, drawFront): the FRONT rope rail along the bottom of the frame, coiled rope; wind-driven rain.
//
// THE TWO RAILS. This walkway is open air on both edges, so it is railed on both — and which pass a rail is drawn in
// is decided by which side of the fight it stands on, never by how it is painted. The back rail scrolls with the
// floor (1.0) and goes down in `drawBack`, so a fighter on the back lane stands IN FRONT of it; the front rail is
// the only one the camera is on the near side of, so it is the only one in the near layer, and it is kept down at
// the bottom of the frame (glean2's rule: nothing in a near layer at fighter height — a full-width bar across the
// arena hides whoever is standing behind it).
import {
  VIEW_W, FLOOR_TOP, Z_MAX, PARALLAX, BLEED, SKY_H, FLOOR_H, INK,
  makeLayer, blitTiled, blitAt, layerSpace, drawDarkBand, vGradient, radialGlow, makeGlowSprite,
  boxOutlined, rivets, makePool,
} from './common.js';
import { pathPoly, paint } from '../shapes.js';

const FAR_W = 1280;
const FLOOR_TILE = 480;
const MAST_STEP = 300;
const RAIN_N = 70;
/** The front rope rail sits along the bottom of the frame: its cap is below the feet of the frontmost lane. */
const NEAR_Y = 296;
/** The back rope rail is tiled with the deck (floor parallax), just above the floor band's back edge. */
const RAIL_TILE = 480, RAIL_H = 34, RAIL_Y = FLOOR_TOP - 22;
/** Stanchion pitch, shared by both rails so they read as the same railing seen from two sides. */
const STANCHION_STEP = 96;
/** Lightning: a strike every ~7s, three quick flashes then a long dark. */
const BOLT_PERIOD = 430;

const SKY_TOP = '#141A32', SKY_MID = '#39304F', SKY_LOW = '#8A6A6E', DAWN = '#E0A070';
const IRONW = '#39414F', IRON_D = '#242A36', DECK = '#4A525E', DECK_D = '#333A45', HAZARD = '#C4913A';

function paintFar(g, w, h, rnd) {
  g.translate(0, BLEED);
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED, [[0, SKY_TOP], [0.42, SKY_MID], [0.78, SKY_LOW], [1, DAWN]]);
  g.fillStyle = DAWN; g.fillRect(0, FLOOR_TOP, w, BLEED);
  // the sun, still under the weather: a flat amber disc smeared by cloud
  radialGlow(g, 900, 168, 130, 'rgba(255,190,120,0.34)');
  g.fillStyle = 'rgba(255,214,150,0.75)'; g.beginPath(); g.arc(900, 170, 16, 0, Math.PI * 2); g.fill();
  // storm wall: heavy anvil cloud across the upper sky
  for (let i = 0; i < 16; i++) {
    const cx = rnd() * w, cy = 6 + rnd() * 86, rx = 80 + rnd() * 150, ry = 12 + rnd() * 22;
    g.fillStyle = `rgba(22,26,50,${0.22 + rnd() * 0.2})`;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  }
  // rain curtains hanging out of the storm
  g.fillStyle = 'rgba(120,130,170,0.10)';
  for (let i = 0; i < 10; i++) { const x = rnd() * w, y = 60 + rnd() * 40, ww = 40 + rnd() * 70; g.fillRect(Math.round(x), Math.round(y), Math.round(ww), 90); }
  // the cloud sea: three banks of lit tops with dark undersides, the city's terraces just breaking through
  for (let band = 0; band < 3; band++) {
    const y = 150 + band * 20, lit = `rgba(255,${200 - band * 26},${170 - band * 30},${0.5 - band * 0.1})`;
    for (let i = 0; i < 22; i++) {
      const cx = rnd() * w, rx = 60 + rnd() * 90, ry = 7 + rnd() * 6;
      g.fillStyle = `rgba(30,26,48,${0.5 + band * 0.14})`;
      g.beginPath(); g.ellipse(cx, y + 3, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = lit;
      g.beginPath(); g.ellipse(cx, y, rx * 0.9, ry * 0.7, 0, Math.PI, 0); g.fill();
    }
  }
  g.fillStyle = 'rgba(26,22,44,0.9)'; g.fillRect(0, 194, w, FLOOR_TOP - 194 + BLEED);
  // the summit of Calderwick, far behind and below: a stepped silhouette with the Heart-Engine gone dark
  pathPoly(g, [80, 196, 150, 150, 210, 132, 250, 132, 300, 152, 380, 196]);
  paint(g, '#221E3A', null);
  g.fillStyle = '#191634'; g.fillRect(212, 118, 26, 16); g.fillRect(220, 106, 10, 12);
  g.fillStyle = 'rgba(77,240,224,0.5)'; g.fillRect(222, 110, 6, 3);
}
/** One fleet hull: a fat gasbag over a gun-deck gondola, with running lights. */
function drawHull(ctx, sx, sy, big, f) {
  const rx = big ? 54 : 34, ry = big ? 15 : 10;
  ctx.fillStyle = '#0E1224';
  ctx.beginPath(); ctx.ellipse(sx, sy, rx + 2, ry + 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#232A44';
  ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0E1224';
  ctx.fillRect(sx - rx + 4, sy + ry - 2, rx * 2 - 8, 2);
  ctx.fillRect(sx - rx - 5, sy - ry * 0.6, 11, 3); ctx.fillRect(sx - rx - 5, sy + ry * 0.4, 11, 3);
  // gondola with gun ports
  ctx.fillRect(sx - rx * 0.6, sy + ry + 4, rx * 1.2, 8);
  ctx.fillStyle = '#4A4050';
  for (let i = 0; i < (big ? 5 : 3); i++) ctx.fillRect(Math.round(sx - rx * 0.5 + i * (rx / (big ? 2.6 : 1.8))), sy + ry + 6, 3, 3);
  ctx.fillStyle = '#D7CBFF';
  if ((f >> 5) & 1) { ctx.fillRect(sx + rx - 4, sy - 1, 2, 2); ctx.fillRect(sx - rx + 2, sy - 1, 2, 2); }
}
function paintMid(g, w, h, rnd) {
  g.translate(0, BLEED);
  // the spine itself: a continuous iron walkway wall under the gantries
  boxOutlined(g, -4, 176, w + 8, 30, IRON_D, INK, 2);
  g.fillStyle = IRONW; g.fillRect(0, 178, w, 12);
  rivets(g, 8, 182, w - 8, 22, '#6C7686', 'rgba(0,0,0,0.5)');
  for (let x = 0; x < w; x += MAST_STEP) {
    const mx = x + 60;
    // lattice mast climbing out of the walkway
    boxOutlined(g, mx, 20, 7, 158, IRONW, INK, 2);
    boxOutlined(g, mx + 26, 20, 7, 158, IRONW, INK, 2);
    g.strokeStyle = '#5C6675'; g.lineWidth = 2;
    for (let y = 22; y < 176; y += 22) { g.beginPath(); g.moveTo(mx + 7, y); g.lineTo(mx + 26, y + 22); g.moveTo(mx + 26, y); g.lineTo(mx + 7, y + 22); g.stroke(); }
    // gantry arm reaching out with a mooring ring on the end
    boxOutlined(g, mx + 33, 54, 108, 9, IRONW, INK, 2);
    g.fillStyle = '#6C7686'; g.fillRect(mx + 33, 55, 108, 3);
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(mx + 146, 60, 7, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = HAZARD; g.lineWidth = 2; g.beginPath(); g.arc(mx + 146, 60, 7, 0, Math.PI * 2); g.stroke();
    // mooring cables sagging away from the arm
    g.strokeStyle = 'rgba(20,24,34,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(mx + 146, 66); g.quadraticCurveTo(mx + 210, 118, mx + 286, 60); g.stroke();
    g.beginPath(); g.moveTo(mx + 30, 40); g.quadraticCurveTo(mx + 120, 96, mx + 240, 34); g.stroke();
    // hanging lantern on the arm
    boxOutlined(g, mx + 88, 63, 8, 10, '#2E3444', INK, 1);
    g.fillStyle = '#FFD79A'; g.fillRect(mx + 90, 65, 4, 6);
    // a warning light at the mast head
    g.fillStyle = '#FF5C5C'; g.fillRect(mx + 14, 14, 4, 4);
    // capstan drums bolted to the walkway
    boxOutlined(g, mx + 180 + Math.round(rnd() * 30), 158, 22, 20, '#3E4654', INK, 2);
  }
}
function paintFloor(g, w, h, rnd) {
  // iron grating: a dark mesh under raised walkway plates
  g.fillStyle = IRON_D; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1B2029';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 2);
  for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 2, h);
  const pw = 120, ph = 68;
  for (let py = 0; py * ph < h; py++) for (let px = 0; px * pw < w; px++) {
    const x = px * pw, y = py * ph;
    g.fillStyle = (px + py) & 1 ? DECK_D : DECK;
    g.fillRect(x + 2, y + 2, pw - 4, ph - 5);
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 3, y + 3, pw - 6, 2);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x + 2, y + ph - 5, pw - 4, 2);
    rivets(g, x + 10, y + 7, x + pw - 10, 16, '#8A93A3', 'rgba(0,0,0,0.5)');
    rivets(g, x + 10, y + ph - 12, x + pw - 10, 16, '#8A93A3', 'rgba(0,0,0,0.5)');
  }
  // hazard chevrons along the back edge (the drop is that way)
  for (let x = -20; x < w + 20; x += 26) {
    g.fillStyle = HAZARD;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 13, 0); g.lineTo(x + 26, 12); g.lineTo(x + 13, 12); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 12, w, 2);
  // standing water: flat ellipses with a bright rim on the lit side
  for (let i = 0; i < 16; i++) {
    const cx = rnd() * w, cy = 24 + rnd() * (Z_MAX - 40), rx = 12 + rnd() * 26, ry = 4 + rnd() * 6;
    g.fillStyle = 'rgba(150,180,220,0.13)';
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(220,235,255,0.16)';
    g.beginPath(); g.ellipse(cx - rx * 0.2, cy - ry * 0.3, rx * 0.5, ry * 0.35, 0, 0, Math.PI * 2); g.fill();
  }
  // scuffs and old rope marks
  for (let i = 0; i < 26; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.07)'; g.fillRect(Math.round(rnd() * w), Math.round(rnd() * h), 8 + Math.round(rnd() * 30), 1 + Math.round(rnd() * 2)); }
  g.fillStyle = '#12161E'; g.fillRect(0, Z_MAX, w, h - Z_MAX);
}
/** Stanchions with two slack ropes, from `y0`: the one railing both edges of the walkway carry. */
function paintRopeRail(g, w, y0) {
  for (let x = 0; x < w; x += STANCHION_STEP) {
    boxOutlined(g, x, y0, 5, 30, '#2A3040', INK, 2);
    g.fillStyle = '#3E4654'; g.fillRect(x + 1, y0 + 1, 2, 28);
  }
  for (const [color, width] of [['#1A1E28', 4], ['#8A7A5A', 2]]) {
    g.strokeStyle = color; g.lineWidth = width;
    for (const y of [y0 + 8, y0 + 20]) {
      // every bay starts and ends on a stanchion, so the back rail's tile repeats without a kink at the seam
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x < w; x += STANCHION_STEP) g.quadraticCurveTo(x + STANCHION_STEP / 2, y + 5, x + STANCHION_STEP, y);
      g.stroke();
    }
  }
}
/** The BACK rail: tiled with the deck and drawn in the back pass, so the fight walks in front of it. */
function paintDeckRail(g, w) {
  paintRopeRail(g, w, 2);
}
function paintNear(g, w, h, rnd) {
  // the FRONT rope rail, along the bottom of the frame — the camera is on the near side of this one
  paintRopeRail(g, w, 30);
  // coiled rope and a cleat here and there, lying at its foot
  for (let x = 40; x < w; x += 240) {
    const y = 56 + Math.round(rnd() * 6);
    g.strokeStyle = '#8A7A5A'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(x, y, 14, 5, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(x, y - 2, 9, 3, 0, 0, Math.PI * 2); g.stroke();
  }
}

export function create(section) {
  const mid = layerSpace(section, PARALLAX.mid);
  const near = layerSpace(section, PARALLAX.near);
  const farL = makeLayer(FAR_W, SKY_H, paintFar, 51);
  const midL = makeLayer(mid.width, SKY_H, paintMid, 52);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, paintFloor, 53);
  const nearL = makeLayer(near.width, 70, paintNear, 54);
  const railL = makeLayer(RAIL_TILE, RAIL_H, paintDeckRail, 55);
  const sunGlow = makeGlowSprite(26, 'rgba(255,214,150,0.30)');

  const hulls = [
    { x: 140, y: 62, vx: 0.09, big: true },
    { x: 620, y: 104, vx: -0.06, big: false },
    { x: 1010, y: 78, vx: 0.05, big: false },
  ];
  const rain = makePool(RAIN_N);
  for (let i = 0; i < RAIN_N; i++) { rain.x[i] = (i * 89) % (VIEW_W + 60); rain.y[i] = (i * 61) % 360; rain.seed[i] = (i * 11) % 6; }
  let f = 0, flash = 0;

  return {
    update(frame) {
      f = frame | 0;
      // lightning: three quick flashes at the top of each cycle, then nothing
      const t = f % BOLT_PERIOD;
      flash = t < 4 ? 0.85 : t < 8 ? 0.2 : t < 12 ? 0.6 : 0;
      for (const s of hulls) { s.x += s.vx; if (s.x > FAR_W + 80) s.x -= FAR_W + 160; if (s.x < -80) s.x += FAR_W + 160; }
      for (let i = 0; i < RAIN_N; i++) {
        rain.y[i] += 7; rain.x[i] -= 2.6;
        if (rain.y[i] > 360) { rain.y[i] -= 374; rain.x[i] = (rain.x[i] + 211) % (VIEW_W + 60); }
        if (rain.x[i] < -30) rain.x[i] += VIEW_W + 60;
      }
    },
    drawBack(ctx, cam, frame) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      const farOrigin = Math.round(-cam.x * PARALLAX.far + shx);
      blitTiled(ctx, farL, farOrigin, -BLEED + sy);
      const sunX = ((farOrigin + 900) % FAR_W + FAR_W) % FAR_W;
      for (let x = sunX - FAR_W; x < VIEW_W + 40; x += FAR_W) if (x > -40) ctx.drawImage(sunGlow.canvas, x - 26, 170 - 26 + sy);
      for (const s of hulls) {
        const bob = Math.round(Math.sin((frame + s.x) * 0.017) * 3);
        const ox = ((farOrigin + Math.round(s.x)) % FAR_W + FAR_W) % FAR_W;
        for (let x = ox - FAR_W; x < VIEW_W + 80; x += FAR_W) if (x > -80) drawHull(ctx, x, s.y + bob + sy, s.big, f);
      }
      // the lightning lights the sky layers only (the deck stays dark: the flash comes from behind the storm)
      if (flash > 0) { ctx.globalAlpha = flash * 0.5; ctx.fillStyle = '#C8D4FF'; ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP + sy); ctx.globalAlpha = 1; }
      blitAt(ctx, midL, mid.originX(cam), -BLEED + sy);
      blitTiled(ctx, floorL, Math.round(-cam.x + shx), FLOOR_TOP + sy);
      // the back rail rides the deck's own parallax (1.0) so it stays bolted to the walkway it stands on
      blitTiled(ctx, railL, Math.round(-cam.x + shx), RAIL_Y + sy);
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam) {
      const sy = cam.shakeY || 0;
      blitAt(ctx, nearL, near.originX(cam), NEAR_Y + sy);
      // wind-driven rain, slanted with the gust
      ctx.strokeStyle = 'rgba(198,216,255,0.32)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < RAIN_N; i++) {
        const x = Math.round(rain.x[i]), y = Math.round(rain.y[i]), len = 9 + rain.seed[i];
        ctx.moveTo(x, y); ctx.lineTo(x - 3, y + len);
      }
      ctx.stroke();
      if (flash > 0) { ctx.globalAlpha = flash * 0.18; ctx.fillStyle = '#E8EEFF'; ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP + Z_MAX); ctx.globalAlpha = 1; }
    },
  };
}
