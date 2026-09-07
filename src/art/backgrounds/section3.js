// Section 3: The Brass Funicular (GDD section 6). One locked screen on the roof of a tram climbing the cliff.
// Everything auto-scrolls DOWN to sell the climb (the camera is locked; cam.x only positions the floor).
// Far: dusk sky lerping to night over ~90s (two pre-rendered skies cross-faded), the lower city dropping at
//      0.3px/f, then a cloud strip. Mid (1.5px/f): cliff face, lattice pylon mast, cables, cross girders.
// Near (3px/f, drawFront): rail struts at the screen edges, wind streaks.
// Floor: riveted brass roof plates with darker coupling gaps; railings on the back and front 12px of the band.
import {
  VIEW_W, VIEW_H, FLOOR_TOP, Z_MAX, BLEED, SKY_H, FLOOR_H, INK, BAND_TOP,
  makeLayer, blitTiled, blitAt, blitTiledV, drawDarkBand, vGradient, radialGlow,
  boxOutlined, rivets, windowDots, skyline, makePool,
} from './common.js';
import { pathPoly, paint } from '../shapes.js';

const FLOOR_TILE = 480;
const CITY_H = 1700;
const CITY_Y0 = -1340; // strip row 1340 sits at screen row 0 when the climb starts
const CLOUD_H = 400;
const MID_H = 480;
const NEAR_H = 240;
const NIGHT_FRAMES = 5400;
const CITY_SPEED = 0.3, MID_SPEED = 1.5, NEAR_SPEED = 3;
const STREAK_N = 22;
const RAIL = 12;

function paintDusk(g, w, h, rnd) {
  g.translate(0, BLEED);
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED * 2, [[0, '#3A2450'], [0.45, '#7A3A58'], [0.8, '#D8663A'], [1, '#E8743B']]);
  // sun haze on the horizon + distant ridge
  radialGlow(g, 470, 170, 160, 'rgba(255,200,120,0.45)');
  g.fillStyle = 'rgba(120,60,90,0.55)';
  pathPoly(g, [-10, 200, 60, 168, 140, 178, 230, 150, 320, 172, 400, 158, 470, 176, 560, 154, 650, 170, 650, 220, -10, 220]);
  paint(g, 'rgba(110,52,88,0.7)', null);
  for (let i = 0; i < 6; i++) { const x = rnd() * w, y = 30 + rnd() * 60, ww = 60 + rnd() * 120; g.fillStyle = 'rgba(255,170,120,0.18)'; g.fillRect(Math.round(x), Math.round(y), Math.round(ww), 3); }
}
function paintNight(g, w, h, rnd) {
  g.translate(0, BLEED);
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED * 2, [[0, '#0F1A2E'], [0.7, '#152238'], [1, '#26304E']]);
  g.fillStyle = '#E8EEFF';
  for (let i = 0; i < 70; i++) { const x = rnd() * w, y = -BLEED + rnd() * 150; g.globalAlpha = 0.3 + rnd() * 0.7; g.fillRect(Math.round(x), Math.round(y), rnd() < 0.2 ? 2 : 1, 1); }
  g.globalAlpha = 1;
  g.fillStyle = '#F4E8C8'; g.beginPath(); g.arc(500, 44, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.arc(495, 40, 4, 0, Math.PI * 2); g.arc(506, 50, 3, 0, Math.PI * 2); g.fill();
  radialGlow(g, 500, 44, 60, 'rgba(244,232,200,0.18)');
  pathPoly(g, [-10, 200, 60, 168, 140, 178, 230, 150, 320, 172, 400, 158, 470, 176, 560, 154, 650, 170, 650, 220, -10, 220]);
  paint(g, '#0C1424', null);
}
function paintCity(g, w, h, rnd) {
  // A tall strip that drops past the tram at 0.3px/f. From the bottom up (the order it is seen):
  // lower city (visible at the start) -> tier wall with a viaduct -> the third terrace's factories and domes
  // -> the summit bulwark of the Heart-Engine -> gantry tops -> open sky.
  const warm = (a) => `rgba(232,192,112,${a})`;
  // lower city: three terraces descending into the valley haze
  skyline(g, -10, w + 20, 1420, 30, 80, rnd, '#1A1430', { minW: 18, maxW: 44, chimneys: 0.4, step: 3, windows: { color: warm(0.7), sx: 6, sy: 8, chance: 0.45 } });
  g.fillStyle = '#1A1430'; g.fillRect(0, 1418, w, 90);
  skyline(g, -10, w + 20, 1500, 24, 70, rnd, '#14102A', { minW: 16, maxW: 40, chimneys: 0.4, step: 3, windows: { color: warm(0.5), sx: 6, sy: 8, chance: 0.4 } });
  g.fillStyle = '#14102A'; g.fillRect(0, 1498, w, 90);
  skyline(g, -10, w + 20, 1580, 20, 60, rnd, '#100C22', { minW: 14, maxW: 36, chimneys: 0.3, step: 2, windows: { color: warm(0.35), sx: 5, sy: 7, chance: 0.35 } });
  g.fillStyle = '#100C22'; g.fillRect(0, 1578, w, h - 1578);
  vGradient(g, 0, 1420, w, 280, [[0, 'rgba(40,30,70,0)'], [1, 'rgba(40,30,70,0.8)']]);
  // mountain flank between the summit and the third terrace (a lamp-lit road zigzags up it)
  g.fillStyle = '#1A1428'; g.fillRect(0, 700, w, 240);
  for (let i = 0; i < 40; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.05)'; g.fillRect(Math.round(rnd() * w), 700 + Math.round(rnd() * 240), 20 + Math.round(rnd() * 90), 3 + Math.round(rnd() * 12)); }
  g.fillStyle = warm(0.8);
  for (let i = 0; i < 24; i++) g.fillRect(Math.round(60 + i * 22 + Math.sin(i * 0.9) * 40), 720 + i * 8, 2, 2);
  // third terrace: a back row of blocks, verdigris domes, tall factories with smoke stacks
  skyline(g, -10, w + 20, 1000, 40, 120, rnd, '#1A1430', { minW: 26, maxW: 60, chimneys: 0.5, step: 4, windows: { color: warm(0.4), sx: 7, sy: 9, chance: 0.4 } });
  g.fillStyle = '#1A1430'; g.fillRect(0, 998, w, 100);
  for (let i = 0; i < 4; i++) {
    const cx = 70 + i * 160 + rnd() * 60, r = 18 + rnd() * 10;
    g.fillStyle = '#221A38'; g.fillRect(cx - r - 4, 990, r * 2 + 8, 110);
    g.fillStyle = '#4E8A6E'; g.beginPath(); g.arc(cx, 990, r, Math.PI, 0); g.fill();
    g.fillStyle = '#3A6A54'; g.beginPath(); g.arc(cx, 990, r, Math.PI * 1.5, 0); g.lineTo(cx, 990); g.closePath(); g.fill();
    g.fillStyle = '#C9963A'; g.fillRect(cx - 1, 990 - r - 12, 2, 12);
  }
  for (let i = 0; i < 6; i++) {
    const x = Math.round(30 + rnd() * (w - 60)), top = 860 + Math.round(rnd() * 80);
    g.fillStyle = '#141024'; g.fillRect(x, top, 12, 1090 - top);
    g.fillStyle = 'rgba(200,200,220,0.14)';
    for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(x + 6 - k * 6, top - 8 - k * 14, 8 + k * 4, 5 + k * 2, 0, 0, Math.PI * 2); g.fill(); }
  }
  skyline(g, -10, w + 20, 1090, 60, 140, rnd, '#221A3A', { minW: 30, maxW: 70, chimneys: 0.6, step: 5, windows: { color: warm(0.75), sx: 8, sy: 10, chance: 0.5 } });
  // tier wall with a viaduct along its foot
  g.fillStyle = '#1C1630'; g.fillRect(0, 1090, w, 160);
  g.fillStyle = '#2C2444'; g.fillRect(0, 1090, w, 6);
  g.fillStyle = 'rgba(0,0,0,0.2)'; for (let y = 1102; y < 1250; y += 12) g.fillRect(0, y, w, 1);
  g.fillStyle = '#1C1630'; for (let x = 0; x < w; x += 24) g.fillRect(x, 1080, 12, 10);
  for (let x = 0; x < w; x += 80) { g.fillStyle = '#0E0B1C'; g.beginPath(); g.arc(x + 40, 1200, 28, Math.PI, 0); g.rect(x + 12, 1200, 56, 50); g.fill(); g.fillStyle = warm(0.9); g.fillRect(x + 39, 1096, 2, 3); }
  // the summit bulwark: an iron wall with brass pipes and cyan slit windows, gantries rising above it
  radialGlow(g, 320, 300, 220, 'rgba(77,240,224,0.18)');
  g.fillStyle = '#12101A'; g.fillRect(0, 298, w, 404);
  g.fillStyle = '#2A2634'; g.fillRect(0, 302, w, 396);
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 320; y < 700; y += 40) g.fillRect(0, y, w, 2);
  for (let x = 40; x < w; x += 96) { boxOutlined(g, x, 302, 10, 396, '#8C6825', '#12101A'); g.fillStyle = '#A67C2E'; g.fillRect(x + 1, 302, 3, 396); boxOutlined(g, x - 3, 380, 16, 8, '#C9963A', '#12101A'); }
  g.fillStyle = '#4DF0E0';
  for (let y = 330; y < 690; y += 48) for (let x = 14; x < w; x += 32) if (rnd() < 0.7) g.fillRect(x, y, 2, 10);
  g.fillStyle = '#12101A'; for (let x = 0; x < w; x += 32) g.fillRect(x, 286, 16, 14);
  for (let i = 0; i < 5; i++) { const x = 60 + i * 130 + Math.round(rnd() * 40); g.fillStyle = '#1E1A28'; g.fillRect(x, 200 + Math.round(rnd() * 60), 6, 100); g.fillRect(x - 14, 220 + Math.round(rnd() * 30), 34, 4); g.fillStyle = '#FF5C5C'; g.fillRect(x + 2, 196, 2, 2); }
  g.fillStyle = 'rgba(77,240,224,0.35)'; g.fillRect(0, 302, w, 2);
}
function paintClouds(g, w, h, rnd) {
  for (let i = 0; i < 14; i++) {
    const cx = rnd() * w, cy = rnd() * h, rx = 50 + rnd() * 110, ry = 5 + rnd() * 9;
    g.fillStyle = `rgba(230,200,220,${0.10 + rnd() * 0.12})`;
    for (const ox of [0, -w, w]) { g.beginPath(); g.ellipse(cx + ox, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
    if (cy < ry) { g.beginPath(); g.ellipse(cx, cy + h, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
    if (cy > h - ry) { g.beginPath(); g.ellipse(cx, cy - h, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  }
}
function paintMid(g, w, h, rnd) {
  // layer x 0 == screen x -BLEED so camera shake never exposes the edge of the cliff
  g.translate(BLEED, 0);
  // cliff face on the left (rock strata, ledges), vertically tileable
  const rock = '#3A2A34', rockDark = '#2A1E28', rockLight = '#4E3A48';
  const edge = [];
  for (let y = 0; y <= h; y += 40) edge.push(232 + Math.round(Math.sin(y * 0.05) * 14 + (rnd() - 0.5) * 12));
  edge[edge.length - 1] = edge[0];
  g.fillStyle = INK; g.beginPath(); g.moveTo(-BLEED, 0);
  for (let i = 0; i < edge.length; i++) g.lineTo(edge[i] + 4, i * 40);
  g.lineTo(-BLEED, h); g.closePath(); g.fill();
  g.fillStyle = rock; g.beginPath(); g.moveTo(-BLEED, 0);
  for (let i = 0; i < edge.length; i++) g.lineTo(edge[i], i * 40);
  g.lineTo(-BLEED, h); g.closePath(); g.fill();
  g.save(); g.clip();
  for (let i = 0; i < 60; i++) {
    const x = -BLEED + rnd() * 256, y = rnd() * h, ww = 20 + rnd() * 70, hh = 6 + rnd() * 16;
    g.fillStyle = rnd() < 0.5 ? rockDark : rockLight;
    g.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh));
    if (y + hh > h) g.fillRect(Math.round(x), Math.round(y) - h, Math.round(ww), Math.round(hh));
  }
  // strata lines
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 12; y < h; y += 36) g.fillRect(-BLEED, y, 276, 2);
  g.restore();
  // lattice pylon mast anchored to the cliff, with cross girders every 240px carrying the cables
  const mx = 244;
  boxOutlined(g, mx, 0, 6, h, '#3A3F4B', INK);
  boxOutlined(g, mx + 22, 0, 6, h, '#3A3F4B', INK);
  g.strokeStyle = '#4B5160'; g.lineWidth = 2;
  for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(mx + 6, y); g.lineTo(mx + 22, y + 24); g.moveTo(mx + 22, y); g.lineTo(mx + 6, y + 24); g.stroke(); }
  for (let y = 60; y < h; y += 240) {
    boxOutlined(g, mx - 30, y, 30, 8, '#3A3F4B', INK); // anchor into the rock
    boxOutlined(g, mx, y - 4, 400, 10, '#3A3F4B', INK); // cross girder
    g.fillStyle = '#4B5160'; g.fillRect(mx, y - 4, 400, 3);
    rivets(g, mx + 6, y, mx + 396, 16, '#6A6F7A');
    // cable clamps hanging from the girder
    for (const cx of [340, 372, 560]) { boxOutlined(g, cx - 4, y + 6, 8, 14, '#C9963A', INK); }
    // warning lamp
    g.fillStyle = '#FF5C5C'; g.fillRect(mx + 396, y - 8, 4, 4);
  }
  // haul cables (static verticals) with clamps sliding by
  for (const cx of [340, 372, 560]) {
    g.fillStyle = INK; g.fillRect(cx - 2, 0, 4, h);
    g.fillStyle = '#6A6F7A'; g.fillRect(cx - 1, 0, 2, h);
    for (let y = 30; y < h; y += 120) { boxOutlined(g, cx - 3, y, 6, 10, '#8A8F9A', INK); }
  }
}
function paintNear(g, w, h, rnd) {
  // rail struts at both screen edges (the track beside the roof), vertically tileable
  for (const side of [0, 1]) {
    const x = side ? w - 14 : 0;
    boxOutlined(g, x + (side ? 6 : 2), 0, 6, h, '#5A5F6A', INK);
    for (let y = 8; y < h; y += 60) {
      boxOutlined(g, side ? x - 8 : x, y, 22, 8, '#3A3F4B', INK);
      g.fillStyle = '#C9963A'; g.fillRect(side ? x - 4 : x + 12, y + 2, 4, 4);
    }
  }
}
function paintFloor(g, w, h, rnd) {
  // riveted brass roof plates
  g.fillStyle = '#A67C2E'; g.fillRect(0, 0, w, h);
  const pw = 120, ph = 70;
  for (let py = 0; py * ph < h; py++) for (let px = 0; px * pw < w; px++) {
    g.fillStyle = (px + py) & 1 ? '#8C6825' : '#A67C2E';
    g.fillRect(px * pw, py * ph, pw, ph);
    g.fillStyle = 'rgba(255,240,180,0.10)'; g.fillRect(px * pw + 2, py * ph + 2, pw - 4, 3);
    g.fillStyle = '#5A4018'; g.fillRect(px * pw, py * ph, pw, 2); g.fillRect(px * pw, py * ph, 2, ph);
    rivets(g, px * pw + 8, py * ph + 6, px * pw + pw - 8, 14, '#E2B34A', 'rgba(0,0,0,0.5)');
    rivets(g, px * pw + 8, py * ph + ph - 8, px * pw + pw - 8, 14, '#E2B34A', 'rgba(0,0,0,0.5)');
    for (let y = py * ph + 20; y < py * ph + ph - 12; y += 14) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(px * pw + 6, y + 1, 2, 2); g.fillRect(px * pw + pw - 8, y + 1, 2, 2); g.fillStyle = '#E2B34A'; g.fillRect(px * pw + 6, y, 2, 2); g.fillRect(px * pw + pw - 8, y, 2, 2); }
  }
  // scuffs
  for (let i = 0; i < 24; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)'; g.fillRect(Math.round(rnd() * w), Math.round(rnd() * h), 6 + Math.round(rnd() * 26), 1 + Math.round(rnd() * 2)); }
  // roof hatch and ventilator cowl (cosmetic)
  boxOutlined(g, 300, 60, 44, 28, '#8C6825', INK);
  g.fillStyle = '#A67C2E'; g.fillRect(302, 62, 40, 4);
  g.fillStyle = INK; g.fillRect(300, 72, 44, 2); g.fillRect(320, 76, 6, 8);
  boxOutlined(g, 120, 92, 18, 18, '#4B4F55', INK);
  g.fillStyle = '#6A6F7A'; g.beginPath(); g.arc(129, 92, 9, Math.PI, 0); g.fill();
  // coupling gap (darker, cosmetic: the floor stays continuous)
  g.fillStyle = INK; g.fillRect(w - 14, 0, 14, h);
  g.fillStyle = '#3A2A18'; g.fillRect(w - 12, 0, 10, h);
  g.fillStyle = '#5A4018'; for (let y = 0; y < h; y += 8) g.fillRect(w - 10, y, 6, 3);
  // railings: back 12px and front 12px of the band
  for (const y0 of [0, Z_MAX - RAIL]) {
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y0 + (y0 ? 0 : RAIL), w, 4);
    for (let x = 0; x < w; x += 40) boxOutlined(g, x + 18, y0, 4, RAIL, '#C9963A', INK);
    g.fillStyle = INK; g.fillRect(0, y0, w, 6);
    g.fillStyle = '#C9963A'; g.fillRect(0, y0 + 1, w, 3);
    g.fillStyle = '#E2B34A'; g.fillRect(0, y0 + 1, w, 1);
    g.fillStyle = INK; g.fillRect(0, y0 + RAIL - 3, w, 2);
    g.fillStyle = '#8C6825'; g.fillRect(0, y0 + RAIL - 2, w, 1);
  }
  // tram side below the front railing (visible if the dark band is ever lifted)
  g.fillStyle = '#5A4018'; g.fillRect(0, Z_MAX, w, h - Z_MAX);
}

export function create() {
  const duskL = makeLayer(VIEW_W, SKY_H, paintDusk, 31);
  const nightL = makeLayer(VIEW_W, SKY_H, paintNight, 32);
  const cityL = makeLayer(VIEW_W, CITY_H, paintCity, 33);
  const cloudL = makeLayer(VIEW_W, CLOUD_H, paintClouds, 34);
  const midL = makeLayer(VIEW_W + BLEED * 2, MID_H, paintMid, 35);
  const nearL = makeLayer(VIEW_W, NEAR_H, paintNear, 36);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, paintFloor, 37);
  const streaks = makePool(STREAK_N);
  for (let i = 0; i < STREAK_N; i++) { streaks.x[i] = (i * 131) % VIEW_W; streaks.y[i] = (i * 71) % VIEW_H; streaks.vy[i] = NEAR_SPEED + (i % 4) * 0.8; streaks.life[i] = 16 + (i * 13) % 30; }
  let f = 0;
  let cityY = 0, midY = 0, nearY = 0, cloudY = 0;

  return {
    /** Frames since the section started (drives dusk -> night). */
    get time() { return f; },
    update() {
      f++;
      cityY += CITY_SPEED; cloudY += CITY_SPEED * 0.8;
      midY = (midY + MID_SPEED) % MID_H;
      nearY = (nearY + NEAR_SPEED) % NEAR_H;
      for (let i = 0; i < STREAK_N; i++) {
        streaks.y[i] += streaks.vy[i];
        if (streaks.y[i] > VIEW_H) { streaks.y[i] = -streaks.life[i]; streaks.x[i] = (streaks.x[i] + 197) % VIEW_W; }
      }
    },
    drawBack(ctx, cam) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      const t = Math.min(1, f / NIGHT_FRAMES);
      blitAt(ctx, duskL, shx, -BLEED + sy);
      if (t > 0) { ctx.globalAlpha = t; blitAt(ctx, nightL, shx, -BLEED + sy); ctx.globalAlpha = 1; }
      // the city drops away; then the cloud strip keeps drifting
      blitAt(ctx, cityL, shx, CITY_Y0 + Math.round(cityY) + sy);
      ctx.globalAlpha = 0.6 + 0.4 * t;
      blitTiledV(ctx, cloudL, shx, -Math.round(cloudY) % CLOUD_H + sy, -BLEED, FLOOR_TOP + BLEED);
      ctx.globalAlpha = 1;
      // night tint over the far layers so the city lights read warmer as it darkens
      if (t > 0) { ctx.globalAlpha = 0.35 * t; ctx.fillStyle = '#0A1028'; ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP + BLEED + sy); ctx.globalAlpha = 1; }
      // cliff, mast, girders, cables
      blitTiledV(ctx, midL, -BLEED + shx, Math.round(midY) + sy, -BLEED, FLOOR_TOP + BLEED);
      // floor: the tram roof (world-anchored; the camera is locked anyway)
      blitTiled(ctx, floorL, Math.round(-cam.x + shx), FLOOR_TOP + sy);
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      blitTiledV(ctx, nearL, shx, Math.round(nearY) + sy, 0, BAND_TOP);
      // wind streaks
      for (let i = 0; i < STREAK_N; i++) {
        const x = Math.round(streaks.x[i]) + shx, y = Math.round(streaks.y[i]);
        ctx.fillStyle = i % 3 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.35)';
        ctx.fillRect(x, y, 1, streaks.life[i]);
      }
    },
  };
}
