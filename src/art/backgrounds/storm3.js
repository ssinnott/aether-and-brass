// Stage 2, section 3: THE COLD SOVEREIGN (docs/STAGE2.md section 6). The flagship's weather deck, running from the
// gun batteries aft to the bridge tower where the Admiral is waiting — and the whole thing is inside the storm.
// Far (0.2): a black storm wall with rolling cloud, forked lightning, and the rest of the blockade heeling over in it.
// Mid (0.5): the ship — a bulwark of gun ports with run-out cannon, rigging, boarding nets, and the bridge tower
//            standing at the end of the section so the boss arena is visible long before you reach it.
// Floor: holystoned deck planking with brass inlay, a caulked seam grid and a compass rose on the dais.
// Near (1.2, drawFront): the leeward rail and rigging ropes; rain, spray and the flash of the strikes.
import {
  VIEW_W, FLOOR_TOP, Z_MAX, PARALLAX, BLEED, SKY_H, FLOOR_H, INK,
  makeLayer, blitTiled, blitAt, layerSpace, drawDarkBand, vGradient, radialGlow, makeGlowSprite,
  boxOutlined, rivets, makePool,
} from './common.js';
import { pathPoly, paint } from '../shapes.js';

const FAR_W = 1280;
const FLOOR_TILE = 480;
const PORT_STEP = 132;
const RAIN_N = 80;
const NEAR_Y = 150;
const BOLT_PERIOD = 320;

const SKY_TOP = '#0B0F1E', SKY_MID = '#1A2138', SKY_LOW = '#39415C';
const HULL = '#3B4762', HULL_D = '#232B3E', TIMBER = '#8A7250', TIMBER_D = '#6B5738', BRASS = '#B08A3E';
const SPARK = '#9B7BFF';

function paintFar(g, w, h, rnd) {
  g.translate(0, BLEED);
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED, [[0, SKY_TOP], [0.5, SKY_MID], [1, SKY_LOW]]);
  g.fillStyle = SKY_LOW; g.fillRect(0, FLOOR_TOP, w, BLEED);
  // rolling storm cloud, heavier at the top
  for (let i = 0; i < 30; i++) {
    const cx = rnd() * w, cy = -10 + rnd() * 150, rx = 70 + rnd() * 150, ry = 14 + rnd() * 26;
    g.fillStyle = `rgba(10,13,26,${0.16 + rnd() * 0.24})`;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  }
  // a cold seam of light where the storm breaks over the horizon
  g.fillStyle = 'rgba(150,170,230,0.14)'; g.fillRect(0, 150, w, 22);
  g.fillStyle = 'rgba(190,205,255,0.10)'; g.fillRect(0, 158, w, 5);
  // the rest of the blockade: hulls heeled over, running lights violet
  for (let i = 0; i < 5; i++) {
    const cx = 90 + i * 250 + rnd() * 60, cy = 60 + rnd() * 74, rx = 26 + rnd() * 26, ry = 8 + rnd() * 6;
    const heel = (rnd() - 0.5) * 0.35;
    g.save(); g.translate(cx, cy); g.rotate(heel);
    g.fillStyle = '#0B0F1C'; g.beginPath(); g.ellipse(0, 0, rx + 2, ry + 2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#161C2E'; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(-rx * 0.5, ry, rx, 4);
    g.fillStyle = SPARK; g.fillRect(rx - 4, -1, 2, 2);
    g.restore();
  }
  // rain haze over the far layer
  g.fillStyle = 'rgba(120,140,190,0.07)';
  for (let i = 0; i < 14; i++) { const x = rnd() * w; g.fillRect(Math.round(x), 30, 30 + Math.round(rnd() * 60), 160); }
}
function paintMid(g, w, h, rnd) {
  g.translate(0, BLEED);
  // the bulwark: a black timber wall with a rail cap, running the whole section
  boxOutlined(g, -4, 128, w + 8, 78, HULL_D, INK, 2);
  g.fillStyle = HULL; g.fillRect(0, 132, w, 66);
  g.fillStyle = 'rgba(0,0,0,0.28)'; for (let y = 140; y < 198; y += 11) g.fillRect(0, y, w, 2);
  boxOutlined(g, -4, 120, w + 8, 10, '#5A6884', INK, 2);
  g.fillStyle = '#7C8AA6'; g.fillRect(0, 122, w, 3);
  g.fillStyle = 'rgba(220,232,255,0.30)'; g.fillRect(0, 121, w, 1);
  rivets(g, 8, 126, w - 8, 26, '#8A93A3', 'rgba(0,0,0,0.5)');
  // gun ports with run-out cannon, lids hinged up
  for (let x = 40; x < w; x += PORT_STEP) {
    boxOutlined(g, x, 146, 34, 30, '#0D1119', INK, 2);
    g.fillStyle = '#141A26'; g.fillRect(x + 2, 148, 30, 26);
    // barrel
    g.fillStyle = INK; g.fillRect(x + 8, 154, 30, 12);
    g.fillStyle = '#3E4654'; g.fillRect(x + 9, 155, 28, 10);
    g.fillStyle = '#5C6675'; g.fillRect(x + 9, 155, 28, 3);
    g.fillStyle = '#0D1119'; g.fillRect(x + 34, 156, 4, 8);
    // hinged lid propped above the port
    g.save(); g.translate(x + 2, 146); g.rotate(-0.5);
    boxOutlined(g, 0, -26, 34, 24, HULL_D, INK, 2);
    g.fillStyle = '#3A4356'; g.fillRect(2, -24, 30, 20);
    g.fillStyle = BRASS; g.fillRect(4, -22, 26, 2);
    g.restore();
    // powder tub + a stack of shot beside the gun
    boxOutlined(g, x + 44, 182, 14, 14, '#4C3A28', INK, 2);
    for (let k = 0; k < 3; k++) { g.fillStyle = '#2E3440'; g.beginPath(); g.arc(x + 66 + k * 7, 194, 4, 0, Math.PI * 2); g.fill(); }
  }
  // shrouds: rigging climbing out of the bulwark every 260px
  for (let x = 60; x < w; x += 260) {
    g.strokeStyle = 'rgba(20,24,34,0.9)'; g.lineWidth = 2;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(x + k * 5, 120); g.lineTo(x + k * 22, -20); g.stroke(); }
    g.strokeStyle = 'rgba(185,164,126,0.6)'; g.lineWidth = 1;
    for (let y = 0; y < 120; y += 16) { g.beginPath(); g.moveTo(x - 16 - y * 0.1, y); g.lineTo(x + 16 + y * 0.1, y); g.stroke(); }
  }
  // the bridge tower at the far end of the section: the boss arena, visible from a long way off
  const bx = w - 400;
  boxOutlined(g, bx, 24, 150, 182, HULL_D, INK, 2);
  g.fillStyle = HULL; g.fillRect(bx + 4, 28, 142, 176);
  g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 40; y < 200; y += 14) g.fillRect(bx + 4, y, 142, 2);
  // glazed wheelhouse with a violet coil lamp inside
  boxOutlined(g, bx + 20, 40, 110, 46, '#0E1220', INK, 2);
  g.fillStyle = '#1C2740'; g.fillRect(bx + 22, 42, 106, 42);
  radialGlow(g, bx + 76, 64, 60, 'rgba(155,123,255,0.30)');
  g.fillStyle = SPARK; for (let i = 0; i < 5; i++) g.fillRect(bx + 30 + i * 22, 50, 12, 3);
  g.fillStyle = INK; for (let i = 0; i < 4; i++) g.fillRect(bx + 44 + i * 22, 42, 3, 42);
  // funnel, mast and the Wing's colours
  boxOutlined(g, bx + 152, 60, 24, 146, '#20283A', INK, 2);
  g.fillStyle = '#39415C'; g.fillRect(bx + 155, 62, 8, 142);
  boxOutlined(g, bx + 66, -20, 8, 44, '#20283A', INK, 2);
  pathPoly(g, [bx + 74, -14, bx + 132, -4, bx + 74, 8]); paint(g, '#1F2740', INK, 2);
  pathPoly(g, [bx + 78, -8, bx + 116, -2, bx + 78, 4]); paint(g, SPARK, null, 0);
}
function paintFloor(g, w, h, rnd) {
  // holystoned planking running along x, pale and salt-bleached
  for (let y = 0; y < Z_MAX; y += 12) {
    const row = (y / 12) | 0;
    g.fillStyle = row & 1 ? TIMBER : TIMBER_D;
    g.fillRect(0, y, w, 11);
    g.fillStyle = 'rgba(255,246,220,0.10)'; g.fillRect(0, y, w, 2);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + 10, w, 1);
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(Math.round(rnd() * w), y + 3 + Math.round(rnd() * 5), 20 + Math.round(rnd() * 40), 1); }
    // treenails
    for (let x = (row & 1) * 30; x < w; x += 60) { g.fillStyle = 'rgba(40,26,14,0.6)'; g.fillRect(x, y + 4, 2, 2); }
  }
  // caulked butt seams across the deck every 160px, with a brass inlay let flush into the planking between them
  for (let x = 0; x < w; x += 160) {
    g.fillStyle = 'rgba(20,12,6,0.7)'; g.fillRect(x, 0, 3, Z_MAX);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + 60, 0, 4, Z_MAX);
    g.fillStyle = BRASS; g.fillRect(x + 61, 0, 2, Z_MAX);
    g.fillStyle = 'rgba(255,240,190,0.18)'; g.fillRect(x + 61, 0, 1, Z_MAX);
  }
  // a ring bolt and a coil of rope now and then
  for (let x = 30; x < w; x += 190) {
    const y = 20 + Math.round(rnd() * (Z_MAX - 50));
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = BRASS; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke();
  }
  // wet patches where the rain is coming over the rail
  for (let i = 0; i < 12; i++) {
    const cx = rnd() * w, cy = 10 + rnd() * (Z_MAX - 24), rx = 16 + rnd() * 30, ry = 5 + rnd() * 7;
    g.fillStyle = 'rgba(120,150,200,0.10)';
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#100D14'; g.fillRect(0, Z_MAX, w, h - Z_MAX);
}
function paintNear(g, w, h, rnd) {
  // the leeward rail: a solid cap on turned stanchions, with rigging falls hanging past the camera
  for (let x = 0; x < w; x += 74) {
    boxOutlined(g, x, 24, 7, 32, '#1B2130', INK, 2);
    g.fillStyle = '#39415C'; g.fillRect(x + 1, 25, 3, 30);
    g.fillStyle = BRASS; g.fillRect(x, 30, 7, 3);
  }
  boxOutlined(g, -4, 16, w + 8, 10, '#20283A', INK, 2);
  g.fillStyle = '#4A5468'; g.fillRect(0, 18, w, 3);
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 18, w, 1);
  for (let x = 120; x < w; x += 300) {
    g.strokeStyle = INK; g.lineWidth = 5;
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + 12, 40, x + 4, 84); g.stroke();
    g.strokeStyle = '#B9A47E'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + 12, 40, x + 4, 84); g.stroke();
  }
}

export function create(section) {
  const mid = layerSpace(section, PARALLAX.mid);
  const near = layerSpace(section, PARALLAX.near);
  const farL = makeLayer(FAR_W, SKY_H, paintFar, 71);
  const midL = makeLayer(mid.width, SKY_H, paintMid, 72);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, paintFloor, 73);
  const nearL = makeLayer(near.width, 100, paintNear, 74);
  const boltGlow = makeGlowSprite(60, 'rgba(200,214,255,0.34)');

  const rain = makePool(RAIN_N);
  for (let i = 0; i < RAIN_N; i++) { rain.x[i] = (i * 79) % (VIEW_W + 80); rain.y[i] = (i * 43) % 360; rain.seed[i] = (i * 13) % 7; }
  /** The forked bolt is re-drawn from a seed each strike so no two look the same. */
  let f = 0, flash = 0, boltX = 200, boltSeed = 1;

  function drawBolt(ctx, x0, sy) {
    let x = x0, y = -10, s = boltSeed;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff); };
    ctx.strokeStyle = 'rgba(230,238,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y);
    while (y < 150) { x += (rnd() - 0.5) * 34; y += 14 + rnd() * 16; ctx.lineTo(x, y + sy); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(155,123,255,0.45)'; ctx.lineWidth = 5; ctx.stroke();
  }

  return {
    update(frame) {
      f = frame | 0;
      const t = f % BOLT_PERIOD;
      if (t === 0) { boltSeed = (f * 2654435761) & 0x7fffffff; boltX = 60 + (boltSeed % (VIEW_W - 120)); }
      flash = t < 3 ? 0.9 : t < 6 ? 0.25 : t < 10 ? 0.55 : 0;
      for (let i = 0; i < RAIN_N; i++) {
        rain.y[i] += 8; rain.x[i] -= 3.4;
        if (rain.y[i] > 360) { rain.y[i] -= 376; rain.x[i] = (rain.x[i] + 191) % (VIEW_W + 80); }
        if (rain.x[i] < -40) rain.x[i] += VIEW_W + 80;
      }
    },
    drawBack(ctx, cam) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      blitTiled(ctx, farL, Math.round(-cam.x * PARALLAX.far + shx), -BLEED + sy);
      if (flash > 0) {
        ctx.globalAlpha = flash;
        ctx.drawImage(boltGlow.canvas, boltX - 60, 40 + sy);
        drawBolt(ctx, boltX, sy);
        ctx.globalAlpha = flash * 0.45; ctx.fillStyle = '#C8D4FF'; ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP + sy);
        ctx.globalAlpha = 1;
      }
      blitAt(ctx, midL, mid.originX(cam), -BLEED + sy);
      blitTiled(ctx, floorL, Math.round(-cam.x + shx), FLOOR_TOP + sy);
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam) {
      const sy = cam.shakeY || 0;
      blitAt(ctx, nearL, near.originX(cam), NEAR_Y + sy);
      ctx.strokeStyle = 'rgba(206,222,255,0.34)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < RAIN_N; i++) {
        const x = Math.round(rain.x[i]), y = Math.round(rain.y[i]), len = 10 + rain.seed[i];
        ctx.moveTo(x, y); ctx.lineTo(x - 4, y + len);
      }
      ctx.stroke();
      // spray coming over the rail on the beat of the swell
      const s = Math.sin(f * 0.03);
      if (s > 0.9) {
        ctx.fillStyle = 'rgba(220,235,255,0.12)';
        for (let i = 0; i < 10; i++) ctx.fillRect((i * 71 + f * 3) % VIEW_W, 300 - (i % 4) * 8, 6, 2);
      }
      if (flash > 0) { ctx.globalAlpha = flash * 0.2; ctx.fillStyle = '#E8EEFF'; ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP + Z_MAX); ctx.globalAlpha = 1; }
    },
  };
}
