// Section 1: Sootfoot Docks (GDD section 6). Rainy night on the airship moorings.
// Far (0.2): night gradient, terraced city silhouettes with window dots, cyan summit glow, drifting airships.
// Mid (0.5): wharf wall, dock cranes, mooring masts with chains, gaslamps every 180px with halos.
// Floor: wet planks in 12px rows with puddles. Near (1.2, drawFront): bollards, rope coils; rain.
import {
  VIEW_W, FLOOR_TOP, Z_MAX, PARALLAX, BLEED, SKY_H, FLOOR_H, INK,
  makeLayer, blitTiled, blitAt, layerSpace, drawDarkBand, vGradient, radialGlow, makeGlowSprite,
  boxOutlined, rivets, windowDots, skyline, makePool,
} from './common.js';
import { pathPoly, paint } from '../shapes.js';

const FAR_W = 1280;
const FLOOR_TILE = 480;
const LAMP_STEP = 180;
const RAIN_N = 60;

function paintFar(g, w, h, rnd) {
  g.translate(0, BLEED); // layer row 0 == screen row -BLEED
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED, [[0, '#0E1424'], [0.55, '#182238'], [1, '#1F2A44']]);
  g.fillStyle = '#1F2A44'; g.fillRect(0, FLOOR_TOP, w, BLEED);
  // low cloud bands
  g.fillStyle = 'rgba(8,12,26,0.35)';
  for (let i = 0; i < 9; i++) {
    const cx = rnd() * w, cy = 20 + rnd() * 70, rx = 90 + rnd() * 120, ry = 6 + rnd() * 8;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  }
  // the mountain and the Heart-Engine summit glow
  radialGlow(g, 985, 44, 130, 'rgba(77,240,224,0.32)');
  radialGlow(g, 985, 44, 50, 'rgba(120,255,240,0.45)');
  pathPoly(g, [560, 202, 760, 120, 880, 70, 960, 46, 1010, 46, 1090, 80, 1200, 130, 1290, 202]);
  paint(g, '#101828', null);
  // summit engine tower: stepped silhouette with cyan slit windows
  g.fillStyle = '#0C1220';
  g.fillRect(968, 30, 34, 20); g.fillRect(976, 18, 18, 14); g.fillRect(982, 8, 6, 12);
  g.fillStyle = '#4DF0E0';
  g.fillRect(974, 36, 2, 6); g.fillRect(982, 36, 2, 6); g.fillRect(992, 36, 2, 6); g.fillRect(984, 22, 2, 5);
  // stacked terraces (three tiers, the nearer the lighter)
  skyline(g, -20, w + 40, 156, 22, 56, rnd, '#0F1528', { minW: 16, maxW: 40, chimneys: 0.2, step: 3, windows: { color: 'rgba(232,192,112,0.35)', sx: 6, sy: 9, chance: 0.35 } });
  skyline(g, -20, w + 40, 178, 24, 62, rnd, '#141A2C', { minW: 20, maxW: 52, chimneys: 0.35, step: 4, windows: { color: 'rgba(232,192,112,0.6)', sx: 7, sy: 9, chance: 0.45 } });
  skyline(g, -20, w + 40, 202, 18, 44, rnd, '#181E32', { minW: 22, maxW: 60, chimneys: 0.4, step: 4, windows: { color: '#E8C070', sx: 8, sy: 10, chance: 0.4 } });
  // a few domes and spires on the mid tier
  g.fillStyle = '#141A2C';
  for (let i = 0; i < 5; i++) {
    const cx = 60 + rnd() * (w - 120), r = 8 + rnd() * 10;
    g.beginPath(); g.arc(cx, 132 + rnd() * 20, r, Math.PI, 0); g.fill();
    g.fillRect(cx - 1, 100 + rnd() * 20, 2, 40);
  }
  // rain haze low on the horizon
  vGradient(g, 0, 150, w, 66, [[0, 'rgba(31,42,68,0)'], [1, 'rgba(31,42,68,0.55)']]);
}

function paintCrane(g, x, base, height, jibDir) {
  const iron = '#3A3F4B', hi = '#4B5160';
  // legs
  boxOutlined(g, x, base - height, 8, height, iron);
  boxOutlined(g, x + 26, base - height, 8, height, iron);
  g.strokeStyle = '#2E323C'; g.lineWidth = 2;
  for (let y = base - 16; y > base - height + 16; y -= 24) {
    g.beginPath(); g.moveTo(x + 8, y); g.lineTo(x + 26, y - 20); g.moveTo(x + 26, y); g.lineTo(x + 8, y - 20); g.stroke();
  }
  // cab + jib
  boxOutlined(g, x - 6, base - height - 18, 46, 18, hi);
  g.fillStyle = '#FFD070'; g.fillRect(x + 4, base - height - 13, 8, 6);
  const jx = jibDir > 0 ? x + 40 : x - 6 - 96;
  boxOutlined(g, jx, base - height - 14, 96, 8, iron);
  g.fillStyle = hi; g.fillRect(jx, base - height - 14, 96, 3);
  // counterweight
  boxOutlined(g, jibDir > 0 ? x - 20 : x + 34, base - height - 10, 14, 14, '#2E323C');
  // chain + hook
  const cx = jibDir > 0 ? jx + 84 : jx + 12, cy = base - height - 6;
  g.fillStyle = '#5B616E';
  for (let y = cy; y < cy + 50; y += 4) g.fillRect(cx - 1, y, 2, 2);
  g.strokeStyle = INK; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy + 56, 6, Math.PI * 1.1, Math.PI * 0.4, true); g.stroke();
}

function paintLamp(g, x, base) {
  radialGlow(g, x + 2, base - 72, 46, 'rgba(255,208,112,0.32)');
  boxOutlined(g, x - 4, base - 6, 12, 6, '#2E323C');
  boxOutlined(g, x, base - 66, 4, 60, '#3A3F4B');
  g.fillStyle = '#4B5160'; g.fillRect(x, base - 66, 1, 60);
  // crossbar + lantern
  boxOutlined(g, x - 5, base - 70, 14, 4, '#3A3F4B');
  boxOutlined(g, x - 3, base - 82, 10, 12, '#FFD070');
  g.fillStyle = '#FFF2C0'; g.fillRect(x - 1, base - 80, 4, 6);
  g.fillStyle = INK; g.fillRect(x - 1, base - 86, 6, 4);
}

function paintMid(g, w, h, rnd) {
  g.translate(0, BLEED);
  // cranes and mooring masts along the wharf
  let x = 60;
  let k = 0;
  while (x < w) {
    if (k % 3 === 2) {
      // mooring mast with chains to an off-screen airship
      boxOutlined(g, x, 60, 6, 140, '#3A3F4B');
      g.fillStyle = '#5B616E';
      for (let i = 0; i < 40; i++) { g.fillRect(x + 6 + i * 3, 70 - i * 2, 2, 2); g.fillRect(x - 2 - i * 3, 74 - i * 2, 2, 2); }
      g.fillStyle = '#FF5C5C'; g.fillRect(x + 1, 54, 4, 4);
    } else {
      paintCrane(g, x, 200, 96 + Math.round(rnd() * 50), k % 2 ? 1 : -1);
    }
    x += 240 + Math.round(rnd() * 160);
    k++;
  }
  // wharf wall (the back edge of the docks) with stone courses and iron cleats
  g.fillStyle = INK; g.fillRect(0, 182, w, 20);
  g.fillStyle = '#2A2F3C'; g.fillRect(0, 184, w, 18);
  g.fillStyle = '#333948'; g.fillRect(0, 184, w, 3);
  g.fillStyle = '#20242E';
  for (let y = 190; y < 202; y += 6) for (let xx = (y / 6) % 2 ? 12 : 0; xx < w; xx += 24) g.fillRect(xx, y, 1, 5);
  g.fillStyle = '#20242E'; g.fillRect(0, 189, w, 1); g.fillRect(0, 195, w, 1);
  // gaslamps every LAMP_STEP px
  for (let lx = 90; lx < w; lx += LAMP_STEP) paintLamp(g, lx, 186);
}

function paintFloor(g, w, h, rnd) {
  // planks run along x in 12px rows; alternate the two browns, ink seams, staggered plank ends
  for (let row = 0; row * 12 < h; row++) {
    const y = row * 12;
    g.fillStyle = row % 2 ? '#443629' : '#3A2E24';
    g.fillRect(0, y, w, 12);
    g.fillStyle = '#2A2018'; g.fillRect(0, y, w, 1);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y + 1, w, 1);
    let x = Math.round(rnd() * 60) - 60;
    while (x < w) {
      const len = 72 + Math.round(rnd() * 3) * 24;
      g.fillStyle = '#231a12'; g.fillRect(x, y, 2, 12);
      g.fillStyle = 'rgba(200,160,80,0.5)'; g.fillRect(x + 5, y + 5, 1, 1); g.fillRect(x + len - 6, y + 5, 1, 1);
      x += len;
    }
    // grain streaks
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 6; i++) g.fillRect(Math.round(rnd() * w), y + 3 + Math.round(rnd() * 6), 12 + Math.round(rnd() * 30), 1);
  }
  // sky reflection towards the back edge, and puddles
  vGradient(g, 0, 0, w, 40, [[0, 'rgba(90,120,170,0.16)'], [1, 'rgba(90,120,170,0)']]);
  for (let i = 0; i < 9; i++) {
    const cx = rnd() * w, cy = 12 + rnd() * (Z_MAX - 20), rx = 14 + rnd() * 26, ry = 3 + rnd() * 4;
    g.fillStyle = 'rgba(138,180,216,0.15)';
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(200,220,240,0.12)';
    g.beginPath(); g.ellipse(cx - rx * 0.3, cy - 1, rx * 0.4, 1.2, 0, 0, Math.PI * 2); g.fill();
    if (cx > w - 40) { g.fillStyle = 'rgba(138,180,216,0.15)'; g.beginPath(); g.ellipse(cx - w, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  }
}

function paintBollard(g, x, y) {
  boxOutlined(g, x - 9, y + 24, 18, 6, '#2A2F3A');
  boxOutlined(g, x - 6, y, 12, 26, '#3A3F4B');
  g.fillStyle = '#4B5160'; g.fillRect(x - 6, y, 3, 26);
  g.fillStyle = INK; g.fillRect(x - 8, y - 4, 16, 6);
  g.fillStyle = '#4B5160'; g.fillRect(x - 6, y - 2, 12, 3);
  // rope loop
  g.strokeStyle = '#8A6A3A'; g.lineWidth = 3;
  g.beginPath(); g.ellipse(x, y + 8, 9, 4, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(x + 8, y + 9); g.quadraticCurveTo(x + 30, y + 14, x + 44, y + 30); g.stroke();
}
function paintRopeCoil(g, x, y) {
  g.strokeStyle = INK; g.lineWidth = 6;
  for (let i = 3; i >= 0; i--) { g.beginPath(); g.ellipse(x, y - i * 2, 16 - i * 3, 6 - i, 0, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = '#8A6A3A'; g.lineWidth = 3;
  for (let i = 3; i >= 0; i--) { g.beginPath(); g.ellipse(x, y - i * 2, 16 - i * 3, 6 - i, 0, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = '#A8845A'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(x - 2, y - 7, 6, 2, 0, Math.PI, Math.PI * 2); g.stroke();
}
function paintNear(g, w, h, rnd) {
  // layer row 0 == screen row NEAR_Y
  let x = 120;
  let k = 0;
  while (x < w) {
    if (k % 3 === 1) paintRopeCoil(g, x, 58); else paintBollard(g, x, 30);
    x += 300 + Math.round(rnd() * 260);
    k++;
  }
}
const NEAR_Y = 280;

export function create(section) {
  const mid = layerSpace(section, PARALLAX.mid);
  const near = layerSpace(section, PARALLAX.near);
  const farL = makeLayer(FAR_W, SKY_H, paintFar, 11);
  const midL = makeLayer(mid.width, SKY_H, paintMid, 12);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, paintFloor, 13);
  const nearL = makeLayer(near.width, 80, paintNear, 14);
  const lampGlow = makeGlowSprite(22, 'rgba(255,214,130,0.30)');

  // animated state
  const ships = [
    { x: 180, y: 48, vx: 0.11, big: true },
    { x: 760, y: 92, vx: -0.07, big: false },
  ];
  const rain = makePool(RAIN_N);
  for (let i = 0; i < RAIN_N; i++) { rain.x[i] = (i * 97) % VIEW_W; rain.y[i] = (i * 53) % 360; rain.seed[i] = (i * 7) % 5; }
  let f = 0;

  function drawShip(ctx, sx, sy, big) {
    const rx = big ? 42 : 30, ry = big ? 13 : 9;
    ctx.fillStyle = '#0B101C';
    ctx.beginPath(); ctx.ellipse(sx, sy, rx + 2, ry + 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1A2238';
    ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0B101C';
    ctx.fillRect(sx - rx + 4, sy + ry - 1, rx * 2 - 8, 1);
    // tail fins
    ctx.fillRect(sx - rx - 4, sy - ry * 0.7, 10, 3); ctx.fillRect(sx - rx - 4, sy + ry * 0.4, 10, 3);
    // gondola + rigging
    ctx.fillRect(sx - 1, sy + ry, 2, 6); ctx.fillRect(sx - 12, sy + ry, 2, 6); ctx.fillRect(sx + 10, sy + ry, 2, 6);
    ctx.fillRect(sx - 16, sy + ry + 5, 32, 8);
    ctx.fillStyle = '#E8C070';
    ctx.fillRect(sx - 10, sy + ry + 7, 3, 3); ctx.fillRect(sx - 2, sy + ry + 7, 3, 3); ctx.fillRect(sx + 6, sy + ry + 7, 3, 3);
    // running light blinks
    if ((f >> 5) & 1) { ctx.fillStyle = '#FF5C5C'; ctx.fillRect(sx + rx - 3, sy - 1, 2, 2); }
  }

  return {
    update(frame, cam) {
      f = frame | 0;
      for (const s of ships) { s.x += s.vx; if (s.x > FAR_W + 60) s.x -= FAR_W + 120; if (s.x < -60) s.x += FAR_W + 120; }
      for (let i = 0; i < RAIN_N; i++) {
        rain.y[i] += 6; rain.x[i] -= 1.2;
        if (rain.y[i] > 360) { rain.y[i] -= 372; rain.x[i] = (rain.x[i] + 173) % (VIEW_W + 40); }
        if (rain.x[i] < -20) rain.x[i] += VIEW_W + 40;
      }
    },
    drawBack(ctx, cam, frame) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      // far
      const farOrigin = Math.round(-cam.x * PARALLAX.far + shx);
      blitTiled(ctx, farL, farOrigin, -BLEED + sy);
      for (const s of ships) {
        const bob = Math.round(Math.sin((frame + s.x) * 0.02) * 2);
        const ox = ((farOrigin + Math.round(s.x)) % FAR_W + FAR_W) % FAR_W;
        for (let x = ox - FAR_W; x < VIEW_W + 60; x += FAR_W) if (x > -60) drawShip(ctx, x, s.y + bob + sy, s.big);
      }
      // mid
      const midOrigin = mid.originX(cam);
      blitAt(ctx, midL, midOrigin, -BLEED + sy);
      // lamp flicker (cheap: one sprite per visible lamp)
      const first = Math.max(0, Math.floor((-midOrigin - 40) / LAMP_STEP));
      for (let i = first; ; i++) {
        const lx = midOrigin + 90 + i * LAMP_STEP;
        if (lx > VIEW_W + 40) break;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(frame * 0.35 + i * 1.7) * 0.6;
        ctx.drawImage(lampGlow.canvas, lx + 2 - 22, 186 - 76 - 22 + sy);
      }
      ctx.globalAlpha = 1;
      // floor
      blitTiled(ctx, floorL, Math.round(-cam.x + shx), FLOOR_TOP + sy);
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam) {
      const sy = cam.shakeY || 0;
      blitAt(ctx, nearL, near.originX(cam), NEAR_Y + sy);
      ctx.fillStyle = 'rgba(190,216,255,0.3)';
      for (let i = 0; i < RAIN_N; i++) {
        const x = Math.round(rain.x[i]), y = Math.round(rain.y[i]);
        ctx.fillRect(x, y, 1, 8);
        if (rain.seed[i] === 0) ctx.fillRect(x - 1, y + 8, 1, 3);
      }
    },
  };
}
