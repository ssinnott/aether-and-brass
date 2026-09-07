// Section 2: Foundry Row (GDD section 6). The great foundry interior: heat, gears, molten metal.
// Far (0.2): cavern wall lit from below, huge slowly rotating gears rimmed furnace-orange (per frame).
// Mid (0.5): brick arcade, chains, furnace doors, a molten channel band with drifting blobs behind a low wall.
// Floor: iron grate plates with rivet seams every 48px; the back 20px is the molten channel (z < 20).
// Near (1.2, drawFront): pipe bundles, heat shimmer (sinusoidal strip offset), rising sparks.
import {
  VIEW_W, FLOOR_TOP, Z_MAX, PARALLAX, BLEED, SKY_H, FLOOR_H, INK,
  makeLayer, blitTiled, blitAt, layerSpace, drawDarkBand, vGradient, radialGlow, makeGlowSprite,
  boxOutlined, rivets, makePool,
} from './common.js';
import { pathGear, pathPoly, paint } from '../shapes.js';

const FAR_W = 1280;
const FLOOR_TILE = 480;
const CHANNEL_H = 20;
const GEARS = [
  { x: 210, y: 92, r: 100, teeth: 18, dir: 1 },
  { x: 520, y: 52, r: 66, teeth: 14, dir: -1 },
  { x: 880, y: 108, r: 90, teeth: 16, dir: 1 },
  { x: 1140, y: 40, r: 60, teeth: 12, dir: -1 },
];
const GEAR_SPEED = 0.3 * Math.PI / 180;
const SPARK_N = 28;
// Heat shimmer: self-copies of the frame in SHIMMER_STEP-row strips from SHIMMER_Y0 down to the floor channel.
// Each strip copy costs ~0.2 ms in software rendering, so keep the strip count low (10 strips).
const SHIMMER_Y0 = 144;
const SHIMMER_STEP = 8;
const BLOB_N = 12;

function brickFill(g, x, y, w, h, fill, mortar, rnd) {
  g.fillStyle = fill; g.fillRect(x, y, w, h);
  g.fillStyle = mortar;
  for (let yy = y; yy < y + h; yy += 8) {
    g.fillRect(x, yy, w, 1);
    for (let xx = x + ((yy / 8) & 1 ? 8 : 0); xx < x + w; xx += 16) g.fillRect(xx, yy, 1, 8);
  }
  if (rnd) { g.fillStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i < (w * h) / 400; i++) g.fillRect(x + Math.floor(rnd() * w / 16) * 16 + 1, y + Math.floor(rnd() * h / 8) * 8 + 1, 15, 7); }
}

function paintFar(g, w, h, rnd) {
  g.translate(0, BLEED);
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED * 2, [[0, '#1C1210'], [0.5, '#2A1C16'], [1, '#4A2A18']]);
  // rock strata: chunky darker / lighter slabs
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w, y = -BLEED + rnd() * 190, ww = 20 + rnd() * 80, hh = 4 + rnd() * 14;
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(255,200,150,0.06)';
    g.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh));
  }
  // stalactite ceiling
  g.fillStyle = '#16100C';
  let x = 0;
  while (x < w) { const ww = 14 + rnd() * 30, hh = 10 + rnd() * 28; pathPoly(g, [x, -BLEED, x + ww, -BLEED, x + ww / 2, hh]); paint(g, '#16100C', null); x += ww - 4; }
  // gear axle mounts (static; the gears themselves animate)
  for (const gr of GEARS) {
    radialGlow(g, gr.x, gr.y + gr.r * 0.6, gr.r * 1.6, 'rgba(255,122,31,0.16)');
    boxOutlined(g, gr.x - 14, gr.y - 14, 28, 28, '#3A2A22', '#120C0A');
  }
  // furnace glow from below
  vGradient(g, 0, 120, w, 96, [[0, 'rgba(255,90,31,0)'], [1, 'rgba(255,122,31,0.35)']]);
}

function paintFurnaceDoor(g, x, y) {
  boxOutlined(g, x, y, 48, 54, '#3A3F4B', '#120C0A');
  g.fillStyle = '#4B5160'; g.fillRect(x, y, 48, 4);
  boxOutlined(g, x + 8, y + 10, 32, 30, '#FF7A1F', '#120C0A');
  g.fillStyle = '#FFB347'; g.fillRect(x + 12, y + 14, 24, 10);
  g.fillStyle = '#120C0A';
  for (let i = 0; i < 4; i++) g.fillRect(x + 8, y + 10 + i * 8, 32, 2);
  for (let i = 0; i < 3; i++) g.fillRect(x + 8 + i * 12, y + 10, 2, 30);
  rivets(g, x + 3, y + 46, x + 44, 8, '#6A6F7A');
}

function paintMid(g, w, h, rnd) {
  g.translate(0, BLEED);
  const brick = '#5A3A2E', mortar = '#3E2620', dark = '#4A2E24';
  // arcade: pillars every 160px, semicircular arches, brick band above; far wall shows through and above
  const pitch = 160, top = 82, springY = 118;
  g.fillStyle = INK; g.fillRect(0, top - 2, w, 6);
  brickFill(g, 0, top, w, 30, brick, mortar, rnd);
  g.fillStyle = INK; g.fillRect(0, top + 28, w, 2);
  for (let px = 0; px < w + pitch; px += pitch) {
    // arch ring (brick) around the opening
    g.fillStyle = INK; g.beginPath(); g.arc(px + pitch / 2, springY, 58, Math.PI, 0); g.rect(px + pitch / 2 - 58, springY, 116, 90); g.fill();
    g.fillStyle = brick; g.beginPath(); g.arc(px + pitch / 2, springY, 56, Math.PI, 0); g.rect(px + pitch / 2 - 56, springY, 112, 90); g.fill();
    g.fillStyle = dark; g.beginPath(); g.arc(px + pitch / 2, springY, 48, Math.PI, 0); g.rect(px + pitch / 2 - 48, springY, 96, 90); g.fill();
    // the opening is cut out so the cavern wall and the great gears show through
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(px + pitch / 2, springY, 42, Math.PI, 0); g.rect(px + pitch / 2 - 42, springY, 84, 90); g.fill();
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(px + pitch / 2, springY, 42, Math.PI, Math.PI * 1.5); g.lineTo(px + pitch / 2 - 42, 200); g.lineTo(px + pitch / 2 - 36, 200); g.lineTo(px + pitch / 2 - 36, springY); g.arc(px + pitch / 2, springY, 36, Math.PI * 1.5, Math.PI, true); g.closePath(); g.fill();
    // pillar
    boxOutlined(g, px - 12, top + 30, 24, 200 - top - 30, brick, INK);
    g.fillStyle = mortar; for (let yy = top + 30; yy < 200; yy += 8) g.fillRect(px - 12, yy, 24, 1);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(px - 12, top + 30, 5, 200 - top - 30);
    boxOutlined(g, px - 16, top + 26, 32, 8, '#6A4A3A', INK);
  }
  // things inside the openings: furnace doors, ladders, chains
  for (let px = 0, k = 0; px < w; px += pitch, k++) {
    const cx = px + pitch / 2;
    if (k % 3 === 0) paintFurnaceDoor(g, cx - 24, 112);
    else if (k % 3 === 1) {
      // hanging chain with hook
      g.fillStyle = '#6A6F7A'; for (let y = 84; y < 150; y += 4) g.fillRect(cx - 1 + ((y >> 2) & 1) * 2 - 1, y, 2, 3);
      g.strokeStyle = '#8A8F9A'; g.lineWidth = 3; g.beginPath(); g.arc(cx, 156, 6, Math.PI * 1.1, Math.PI * 0.4, true); g.stroke();
    } else {
      // ladder
      g.fillStyle = '#3A3F4B'; g.fillRect(cx + 20, 86, 3, 100); g.fillRect(cx + 36, 86, 3, 100);
      for (let y = 92; y < 186; y += 10) g.fillRect(cx + 20, y, 19, 2);
    }
  }
  // overhead pipe run with valves along the brick band
  g.fillStyle = INK; g.fillRect(0, 96, w, 10);
  g.fillStyle = '#B86A3A'; g.fillRect(0, 98, w, 6);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 99, w, 1);
  for (let px = 40; px < w; px += 200) { boxOutlined(g, px, 94, 6, 14, '#8A5A2A', INK); g.fillStyle = '#FF5C5C'; g.beginPath(); g.arc(px + 3, 92, 4, 0, Math.PI * 2); g.fill(); }
  // molten channel band: crusted edges + glowing metal (blobs animate on top per frame)
  g.fillStyle = INK; g.fillRect(0, 158, w, 26);
  vGradient(g, 0, 160, w, 22, [[0, '#FF5A1F'], [0.5, '#FFB347'], [1, '#FF7A1F']]);
  g.fillStyle = '#5A2210';
  for (let i = 0; i < w / 6; i++) { const x = rnd() * w, y = 160 + rnd() * 20; g.fillRect(Math.round(x), Math.round(y), 3 + Math.round(rnd() * 8), 2); }
  // heat glow washing the pillar bases
  vGradient(g, 0, 132, w, 26, [[0, 'rgba(255,122,31,0)'], [1, 'rgba(255,122,31,0.45)']]);
}

function paintWall(g, w, h, rnd) {
  // the low wall in front of the mid molten band: layer row 0 == screen row 176
  g.fillStyle = INK; g.fillRect(0, 0, w, h);
  brickFill(g, 0, 2, w, h - 2, '#4A2A22', '#2E1A14', rnd);
  g.fillStyle = '#6A4A3A'; g.fillRect(0, 2, w, 5);
  g.fillStyle = INK; g.fillRect(0, 7, w, 1);
  g.fillStyle = 'rgba(255,122,31,0.45)'; g.fillRect(0, 2, w, 2);
  for (let x = 0; x < w; x += 96) { g.fillStyle = INK; g.fillRect(x + 40, 0, 12, 10); g.fillStyle = '#7A5A4A'; g.fillRect(x + 42, 0, 8, 8); }
}

function paintFloor(g, w, h, rnd) {
  // iron grate plates
  g.fillStyle = '#2E2A28'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 48) for (let y = CHANNEL_H; y < h; y += 60) if (((x / 48) + Math.floor(y / 60)) & 1) { g.fillStyle = '#343030'; g.fillRect(x, y, 48, 60); }
  g.fillStyle = '#242020';
  for (let y = 0; y < h; y += 6) for (let x = (y / 6) & 1 ? 4 : 0; x < w; x += 8) g.fillRect(x, y + 2, 5, 1);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 1);
  // plate seams every 48px with rivet rows
  for (let x = 0; x < w; x += 48) {
    g.fillStyle = '#1C1816'; g.fillRect(x, 0, 2, h);
    g.fillStyle = '#3A3533'; g.fillRect(x + 2, 0, 1, h);
    for (let y = CHANNEL_H + 8; y < h; y += 12) { g.fillStyle = '#1C1816'; g.fillRect(x + 5, y + 1, 3, 3); g.fillStyle = '#5A5450'; g.fillRect(x + 5, y, 3, 3); g.fillStyle = '#7A7470'; g.fillRect(x + 5, y, 1, 1); }
  }
  // horizontal plate seams
  for (let y = CHANNEL_H + 2; y < h; y += 60) { g.fillStyle = '#1C1816'; g.fillRect(0, y, w, 2); g.fillStyle = '#3A3533'; g.fillRect(0, y + 2, w, 1); }
  // wear / soot
  for (let i = 0; i < 30; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,160,90,0.05)'; g.fillRect(Math.round(rnd() * w), CHANNEL_H + Math.round(rnd() * (h - CHANNEL_H)), 8 + Math.round(rnd() * 30), 2 + Math.round(rnd() * 5)); }
  // molten channel (back 20px): lip, glowing metal, crust
  vGradient(g, 0, 0, w, CHANNEL_H, [[0, '#FF5A1F'], [0.45, '#FFB347'], [1, '#FF7A1F']]);
  g.fillStyle = '#5A2210';
  for (let i = 0; i < w / 8; i++) g.fillRect(Math.round(rnd() * w), 4 + Math.round(rnd() * 13), 3 + Math.round(rnd() * 7), 2);
  g.fillStyle = INK; g.fillRect(0, 0, w, 3);
  g.fillStyle = '#4A4440'; g.fillRect(0, 1, w, 1);
  g.fillStyle = INK; g.fillRect(0, CHANNEL_H - 1, w, 3);
  g.fillStyle = '#4A4440'; g.fillRect(0, CHANNEL_H + 2, w, 2);
  g.fillStyle = '#1C1816'; g.fillRect(0, CHANNEL_H + 4, w, 1);
  // orange light reflected on the grate next to the channel
  vGradient(g, 0, CHANNEL_H + 5, w, 30, [[0, 'rgba(255,122,31,0.30)'], [1, 'rgba(255,122,31,0)']]);
}

function paintPipeBundle(g, w, h) {
  // three vertical pipes with flanges and a valve wheel; drawn at a few positions in the near plane
  const cols = ['#B86A3A', '#4B4F55', '#C9963A'];
  for (let i = 0; i < 3; i++) {
    const x = 2 + i * 11;
    boxOutlined(g, x, 0, 9, h, cols[i], INK);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 1, 0, 2, h);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 6, 0, 3, h);
    for (let y = 40 + i * 30; y < h; y += 140) boxOutlined(g, x - 2, y, 13, 6, cols[i], INK);
  }
  // valve wheel on the middle pipe
  g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.arc(17, 150, 9, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#C9963A'; g.lineWidth = 3; g.beginPath(); g.arc(17, 150, 9, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#C9963A'; g.fillRect(16, 141, 2, 18); g.fillRect(8, 149, 18, 2);
}

export function create(section) {
  const mid = layerSpace(section, PARALLAX.mid);
  const near = layerSpace(section, PARALLAX.near);
  const farL = makeLayer(FAR_W, SKY_H, paintFar, 21);
  const midL = makeLayer(mid.width, SKY_H, paintMid, 22);
  const wallL = makeLayer(FLOOR_TILE, 24 + BLEED, paintWall, 23);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, paintFloor, 24);
  const pipeL = makeLayer(36, 360 + BLEED * 2, paintPipeBundle, 25);
  const sparkGlow = makeGlowSprite(6, 'rgba(255,179,71,0.5)');
  const pipeXs = [];
  for (let x = 420; x < near.width - 200; x += 940) pipeXs.push(x);

  // animated state
  let rot = 0;
  const blobs = makePool(BLOB_N);
  for (let i = 0; i < BLOB_N; i++) { blobs.x[i] = (i * 173) % mid.width; blobs.y[i] = 163 + (i * 7) % 14; blobs.seed[i] = 8 + (i * 5) % 12; blobs.vx[i] = 0.12 + (i % 3) * 0.06; }
  const floorBlobs = makePool(8);
  for (let i = 0; i < 8; i++) { floorBlobs.x[i] = (i * 211) % FLOOR_TILE; floorBlobs.y[i] = 4 + (i * 5) % 12; floorBlobs.seed[i] = 10 + (i * 7) % 14; }
  let floorDrift = 0;
  const sparks = makePool(SPARK_N);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  function resetSpark(i) {
    sparks.x[i] = rnd() * VIEW_W; sparks.y[i] = FLOOR_TOP + rnd() * CHANNEL_H;
    sparks.vx[i] = (rnd() - 0.5) * 0.6; sparks.vy[i] = -(0.6 + rnd() * 1.2); sparks.life[i] = 30 + rnd() * 50; sparks.seed[i] = rnd();
  }
  for (let i = 0; i < SPARK_N; i++) { resetSpark(i); sparks.life[i] *= rnd(); }

  function drawGear(ctx, sx, sy, gr, a) {
    pathGear(ctx, sx, sy, gr.r, gr.teeth, a, gr.r * 0.22);
    ctx.fillStyle = '#1C120D'; ctx.fill();
    ctx.strokeStyle = '#FF7A1F'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    // spokes + hub
    ctx.strokeStyle = '#3A2A22'; ctx.lineWidth = 6; ctx.beginPath();
    for (let i = 0; i < 4; i++) { const b = a + i * Math.PI / 4; ctx.moveTo(sx - Math.cos(b) * gr.r * 0.7, sy - Math.sin(b) * gr.r * 0.7); ctx.lineTo(sx + Math.cos(b) * gr.r * 0.7, sy + Math.sin(b) * gr.r * 0.7); }
    ctx.stroke();
    ctx.fillStyle = '#1C120D'; ctx.beginPath(); ctx.arc(sx, sy, gr.r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FF7A1F'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, gr.r * 0.28, 0, Math.PI * 2); ctx.stroke();
  }

  return {
    update() {
      rot += GEAR_SPEED;
      for (let i = 0; i < BLOB_N; i++) { blobs.x[i] += blobs.vx[i]; if (blobs.x[i] > mid.width + 20) blobs.x[i] -= mid.width + 40; }
      floorDrift = (floorDrift + 0.35) % FLOOR_TILE;
      for (let i = 0; i < SPARK_N; i++) {
        sparks.x[i] += sparks.vx[i] + Math.sin(sparks.life[i] * 0.2) * 0.3; sparks.y[i] += sparks.vy[i]; sparks.life[i] -= 1;
        if (sparks.life[i] <= 0 || sparks.y[i] < 40) resetSpark(i);
      }
    },
    drawBack(ctx, cam) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      const farOrigin = Math.round(-cam.x * PARALLAX.far + shx);
      blitTiled(ctx, farL, farOrigin, -BLEED + sy);
      for (const gr of GEARS) {
        const ox = ((farOrigin + gr.x) % FAR_W + FAR_W) % FAR_W;
        for (let x = ox - FAR_W; x < VIEW_W + gr.r; x += FAR_W) if (x > -gr.r) drawGear(ctx, x, gr.y + sy, gr, rot * gr.dir);
      }
      const midOrigin = mid.originX(cam);
      blitAt(ctx, midL, midOrigin, -BLEED + sy);
      // drifting molten blobs in the mid channel
      for (let i = 0; i < BLOB_N; i++) {
        const x = midOrigin + Math.round(blobs.x[i]);
        if (x < -30 || x > VIEW_W + 30) continue;
        ctx.fillStyle = i & 1 ? '#FFD27A' : '#FF9A3A';
        ctx.beginPath(); ctx.ellipse(x, Math.round(blobs.y[i]) + sy, blobs.seed[i], 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5A2210'; ctx.fillRect(x - 3, Math.round(blobs.y[i]) - 1 + sy, 6, 1);
      }
      blitTiled(ctx, wallL, midOrigin, 176 + sy);
      // floor + molten channel blobs (z < 20)
      const floorOrigin = Math.round(-cam.x + shx);
      blitTiled(ctx, floorL, floorOrigin, FLOOR_TOP + sy);
      for (let i = 0; i < 8; i++) {
        const lx = (floorBlobs.x[i] + floorDrift) % FLOOR_TILE;
        for (let x = ((floorOrigin + lx) % FLOOR_TILE + FLOOR_TILE) % FLOOR_TILE - FLOOR_TILE; x < VIEW_W + 20; x += FLOOR_TILE) {
          if (x < -20) continue;
          ctx.fillStyle = i & 1 ? '#FFD27A' : '#FFE8A0';
          ctx.beginPath(); ctx.ellipse(x, FLOOR_TOP + floorBlobs.y[i] + sy, floorBlobs.seed[i], 2, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam, frame) {
      const sy = cam.shakeY || 0;
      // heat shimmer over the molten band: copy thin strips of the frame with a sinusoidal x offset
      const c = ctx.canvas;
      for (let y = SHIMMER_Y0; y < FLOOR_TOP + CHANNEL_H; y += SHIMMER_STEP) {
        const dx = Math.round(Math.sin(frame * 0.12 + y * 0.2) * 2);
        if (dx !== 0) ctx.drawImage(c, 0, y, VIEW_W, SHIMMER_STEP, dx, y, VIEW_W, SHIMMER_STEP);
      }
      // near pipe bundles
      const nearOrigin = near.originX(cam);
      for (let i = 0; i < pipeXs.length; i++) {
        const x = nearOrigin + pipeXs[i];
        if (x > -40 && x < VIEW_W + 4) ctx.drawImage(pipeL.canvas, x, -BLEED + sy);
      }
      // sparks
      for (let i = 0; i < SPARK_N; i++) {
        const x = Math.round(sparks.x[i]), y = Math.round(sparks.y[i]) + sy;
        ctx.globalAlpha = Math.min(1, sparks.life[i] / 20);
        ctx.drawImage(sparkGlow.canvas, x - 6, y - 6);
        ctx.fillStyle = sparks.seed[i] < 0.3 ? '#FFF2C0' : '#FFB347';
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    },
  };
}
