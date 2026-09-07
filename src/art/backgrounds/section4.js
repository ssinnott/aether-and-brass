// Section 4: The Heart-Engine (GDD section 6). A boiler-cathedral of brass at the summit.
// Far (0.2): the Engine wall: boiler cylinders with brass bands, gauges with twitching needles (per frame),
//            and the 120px cyan core pulsing on a 60-frame heartbeat (per frame, pre-rendered glow sprite).
// Mid (0.5): gothic colonnade with stained-glass triangle mosaics and purple gear banners.
// Near (1.2, drawFront): brass pillars, drifting cyan motes.
// Floor: marble diamonds with a darker mirrored band at the back and brass inlay lines.
import {
  VIEW_W, FLOOR_TOP, Z_MAX, PARALLAX, BLEED, SKY_H, FLOOR_H, INK,
  makeLayer, blitTiled, blitAt, layerSpace, drawDarkBand, vGradient, radialGlow, makeGlowSprite,
  boxOutlined, rivets, makePool, beat,
} from './common.js';
import { pathGear, paint } from '../shapes.js';

const FAR_W = 1280;
const FLOOR_TILE = 480;
const CORE = { x: 212, y: 104, r: 60 };
// Pillars stand at mid-layer x PILLAR_PHASE + n*ARCH_PITCH. The bay centred on WIDE_CENTER (screen x 420 when the
// camera parks at 5360 for the boss) is double width with no pillar, so the Engine core shows through it.
const PILLAR_PHASE = 48;
const WIDE_CENTER = 1200;
const GAUGES = [[92, 60], [332, 48], [372, 150], [604, 70], [1006, 66], [1180, 140]];
const MOTE_N = 30;
const ARCH_PITCH = 128;

function paintCylinder(g, x, y0, w, y1) {
  boxOutlined(g, x, y0, w, y1 - y0, '#8C6825', INK);
  g.fillStyle = INK; g.beginPath(); g.arc(x + w / 2, y0, w / 2 + 2, Math.PI, 0); g.fill();
  g.fillStyle = '#8C6825'; g.beginPath(); g.arc(x + w / 2, y0, w / 2, Math.PI, 0); g.fill();
  g.fillStyle = '#A67C2E'; g.fillRect(x + 4, y0 - 2, Math.round(w * 0.22), y1 - y0 + 2);
  g.fillStyle = '#6E5220'; g.fillRect(x + Math.round(w * 0.72), y0, Math.round(w * 0.28), y1 - y0);
  for (let y = y0 + 22; y < y1 - 10; y += 44) {
    boxOutlined(g, x - 3, y, w + 6, 8, '#C9963A', INK);
    rivets(g, x + 2, y + 3, x + w - 4, 10, '#E2B34A', 'rgba(0,0,0,0.5)');
  }
  // steam dome cap
  boxOutlined(g, x + w / 2 - 8, y0 - w / 2 - 10, 16, 12, '#C9963A', INK);
}
function paintGaugeFace(g, x, y) {
  g.fillStyle = INK; g.beginPath(); g.arc(x, y, 17, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#C9963A'; g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#E8E0C8'; g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#FF5C5C'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, 11, -0.35, 0.45); g.closePath(); g.fill();
  g.fillStyle = INK;
  for (let i = 0; i < 7; i++) { const a = Math.PI * 0.75 + i * Math.PI * 0.25; g.fillRect(Math.round(x + Math.cos(a) * 8) - 1, Math.round(y + Math.sin(a) * 8) - 1, 2, 2); }
}

function paintFar(g, w, h, rnd) {
  g.translate(0, BLEED);
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED * 2, [[0, '#15171F'], [0.6, '#1F2230'], [1, '#2A2E3E']]);
  // iron panelling
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = -BLEED; y < 216; y += 32) for (let x = (y / 32 & 1) ? 48 : 0; x < w; x += 96) { g.fillRect(x, y, 95, 1); g.fillRect(x, y, 1, 31); }
  // overhead pipe runs
  for (const [y, col] of [[14, '#3A3F4B'], [30, '#B86A3A']]) { g.fillStyle = INK; g.fillRect(0, y - 2, w, 10); g.fillStyle = col; g.fillRect(0, y, w, 6); g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(0, y + 1, w, 1); }
  // the core housing and glow: the heart of the Engine (the disk itself pulses per frame)
  radialGlow(g, CORE.x, CORE.y, 150, 'rgba(77,240,224,0.22)');
  boxOutlined(g, CORE.x - 110, CORE.y - 92, 220, 292, '#2A2E3E', INK);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(CORE.x - 110, CORE.y - 92, 220, 8);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; boxOutlined(g, Math.round(CORE.x + Math.cos(a) * 88) - 6, Math.round(CORE.y + Math.sin(a) * 88) - 12, 12, 24, '#4B4F55', INK); }
  g.fillStyle = INK; g.beginPath(); g.arc(CORE.x, CORE.y, CORE.r + 20, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#C9963A'; g.beginPath(); g.arc(CORE.x, CORE.y, CORE.r + 17, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8C6825'; g.beginPath(); g.arc(CORE.x, CORE.y, CORE.r + 17, Math.PI * 0.15, Math.PI * 0.85); g.fill();
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(Math.round(CORE.x + Math.cos(a) * (CORE.r + 11)) - 1, Math.round(CORE.y + Math.sin(a) * (CORE.r + 11)), 3, 3); g.fillStyle = '#E2B34A'; g.fillRect(Math.round(CORE.x + Math.cos(a) * (CORE.r + 11)) - 1, Math.round(CORE.y + Math.sin(a) * (CORE.r + 11)) - 1, 3, 3); }
  g.fillStyle = '#0F2A2C'; g.beginPath(); g.arc(CORE.x, CORE.y, CORE.r + 4, 0, Math.PI * 2); g.fill();
  // conduits feeding the core
  for (const [x0, x1] of [[CORE.x - 200, CORE.x - 76], [CORE.x + 76, CORE.x + 200]]) { g.fillStyle = INK; g.fillRect(x0, CORE.y - 6, x1 - x0, 12); g.fillStyle = '#4B4F55'; g.fillRect(x0, CORE.y - 4, x1 - x0, 8); g.fillStyle = '#4DF0E0'; g.fillRect(x0, CORE.y - 1, x1 - x0, 2); }
  // boiler cylinders flanking the core
  for (const [x, wdt, top] of [[20, 56, 60], [330, 70, 52], [430, 60, 66], [560, 72, 48], [680, 56, 70], [800, 64, 56], [900, 60, 62], [1030, 72, 46], [1160, 56, 64]]) paintCylinder(g, x, top, wdt, 200);
  // pipes between cylinders + gauges
  for (const [x, y] of GAUGES) { boxOutlined(g, x - 3, y + 14, 6, 200 - y - 14, '#4B4F55', INK); paintGaugeFace(g, x, y); }
  // plinth along the bottom of the wall
  g.fillStyle = INK; g.fillRect(0, 178, w, 24);
  g.fillStyle = '#3A3F4B'; g.fillRect(0, 180, w, 20);
  g.fillStyle = '#4B5160'; g.fillRect(0, 180, w, 3);
  rivets(g, 8, 190, w, 24, '#8A8F9A');
  g.fillStyle = '#3A3F4B'; g.fillRect(0, 200, w, BLEED);
}

function paintStainedGlass(g, cx, top, bottom, halfW, rnd) {
  const cols = ['#5B2A86', '#4DF0E0', '#C9963A', '#8A2A3A', '#2E7A90', '#7A4AA6'];
  g.save();
  g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + halfW, top + halfW * 1.3); g.lineTo(cx + halfW, bottom); g.lineTo(cx - halfW, bottom); g.lineTo(cx - halfW, top + halfW * 1.3); g.closePath();
  g.clip();
  g.fillStyle = '#1A1A22'; g.fillRect(cx - halfW, top, halfW * 2, bottom - top);
  const s = 16;
  for (let y = top; y < bottom; y += s) for (let x = cx - halfW; x < cx + halfW; x += s) {
    const c1 = cols[Math.floor(rnd() * cols.length)], c2 = cols[Math.floor(rnd() * cols.length)];
    g.fillStyle = c1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y); g.lineTo(x, y + s); g.closePath(); g.fill();
    g.fillStyle = c2; g.beginPath(); g.moveTo(x + s, y); g.lineTo(x + s, y + s); g.lineTo(x, y + s); g.closePath(); g.fill();
  }
  // lead lines
  g.strokeStyle = '#1A1A22'; g.lineWidth = 1.5;
  for (let y = top; y < bottom; y += s) { g.beginPath(); g.moveTo(cx - halfW, y); g.lineTo(cx + halfW, y); g.stroke(); }
  for (let x = cx - halfW; x < cx + halfW; x += s) { g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke(); g.beginPath(); g.moveTo(x + s, top); g.lineTo(x, top + s); g.stroke(); }
  g.restore();
}
function paintBanner(g, x, y) {
  boxOutlined(g, x - 18, y - 4, 36, 4, '#C9963A', INK);
  g.fillStyle = INK; g.beginPath(); g.moveTo(x - 15, y); g.lineTo(x + 15, y); g.lineTo(x + 15, y + 62); g.lineTo(x, y + 52); g.lineTo(x - 15, y + 62); g.closePath(); g.fill();
  g.fillStyle = '#5B2A86'; g.beginPath(); g.moveTo(x - 13, y); g.lineTo(x + 13, y); g.lineTo(x + 13, y + 58); g.lineTo(x, y + 49); g.lineTo(x - 13, y + 58); g.closePath(); g.fill();
  g.fillStyle = '#48206C'; g.fillRect(x + 4, y, 9, 54);
  g.fillStyle = '#C9963A'; g.fillRect(x - 13, y + 4, 26, 2); g.fillRect(x - 13, y + 40, 26, 2);
  pathGear(g, x, y + 23, 9, 8, 0, 3); paint(g, '#C9963A', INK, 1);
  g.fillStyle = '#5B2A86'; g.beginPath(); g.arc(x, y + 23, 3, 0, Math.PI * 2); g.fill();
}
function paintMid(g, w, h, rnd) {
  g.translate(0, BLEED);
  const stone = '#3B3A46', stoneDark = '#2E2D38', stoneLight = '#4A4858';
  // cornice beam above the colonnade
  g.fillStyle = INK; g.fillRect(0, 34, w, 14);
  g.fillStyle = stone; g.fillRect(0, 36, w, 10);
  g.fillStyle = stoneLight; g.fillRect(0, 36, w, 2);
  for (let x = 0; x < w; x += 16) { g.fillStyle = stoneDark; g.fillRect(x, 40, 8, 4); }
  // pointed arches between pillars; every other bay holds stained glass, the rest open onto the Engine wall
  for (let px = PILLAR_PHASE - ARCH_PITCH * 2, k = 0; px < w + ARCH_PITCH; px += ARCH_PITCH, k++) {
    if (px === WIDE_CENTER) continue; // no pillar in the middle of the wide bay
    const wide = px + ARCH_PITCH === WIDE_CENTER;
    const bayW = wide ? ARCH_PITCH * 2 : ARCH_PITCH;
    const cx = px + bayW / 2, half = bayW / 2 - 14, slope = wide ? 0.5 : 1.3;
    const arch = (hw, top) => { g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + hw, top + hw * slope); g.lineTo(cx + hw, 200); g.lineTo(cx - hw, 200); g.lineTo(cx - hw, top + hw * slope); g.closePath(); };
    g.fillStyle = INK; arch(half + 4, 46); g.fill();
    g.fillStyle = stone; arch(half, 50); g.fill();
    g.fillStyle = stoneLight; arch(half, 50); g.save(); g.clip(); g.fillRect(cx - half, 50, half * 2, 4); g.fillRect(cx - half, 50, 4, 150); g.restore();
    const inner = half - 10;
    g.save(); g.globalCompositeOperation = 'destination-out'; arch(inner, 62); g.fill(); g.restore();
    if (!wide && (k & 1)) {
      paintStainedGlass(g, cx, 62, 200, inner, rnd);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx - inner, 62, inner * 2, 138);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(cx - inner, 150, inner * 2, 50);
    } else {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(cx - inner, Math.round(62 + inner * slope), 4, Math.round(200 - 62 - inner * slope));
    }
    // pillar with capital and base
    boxOutlined(g, px - 8, 48, 16, 152, stone, INK);
    g.fillStyle = stoneLight; g.fillRect(px - 8, 48, 4, 152);
    g.fillStyle = stoneDark; g.fillRect(px + 4, 48, 4, 152);
    boxOutlined(g, px - 12, 46, 24, 8, stoneLight, INK);
    boxOutlined(g, px - 12, 186, 24, 14, stoneLight, INK);
    // gear banners hang in the open bays (and flank the wide one)
    if (!wide && !(k & 1)) paintBanner(g, cx, 56);
  }
  // plinth step at the back edge of the floor
  g.fillStyle = INK; g.fillRect(0, 184, w, 18);
  g.fillStyle = stoneLight; g.fillRect(0, 186, w, 14);
  g.fillStyle = stone; g.fillRect(0, 193, w, 7);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 186, w, 2);
  g.fillStyle = stoneLight; g.fillRect(0, 200, w, BLEED);
}

function paintFloor(g, w, h, rnd) {
  const a = '#D9D3C7', b = '#B9B2A5';
  g.fillStyle = a; g.fillRect(0, 0, w, h);
  const dw = 24, dh = 12; // diamond half-extents (wide rhombi read as a floor in perspective)
  g.fillStyle = b;
  for (let row = -1; row * dh < h + dh; row++) for (let col = -1; col * dw < w + dw; col++) {
    if ((row + col) & 1) continue;
    const cx = col * dw, cy = row * dh;
    g.beginPath(); g.moveTo(cx, cy - dh); g.lineTo(cx + dw, cy); g.lineTo(cx, cy + dh); g.lineTo(cx - dw, cy); g.closePath(); g.fill();
  }
  // marble veins
  for (let i = 0; i < 40; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(80,70,90,0.12)'; const x = rnd() * w, y = rnd() * h; g.fillRect(Math.round(x), Math.round(y), 4 + Math.round(rnd() * 18), 1); }
  // brass inlay lines
  for (const y of [8, Z_MAX - 8]) { g.fillStyle = '#8C6825'; g.fillRect(0, y, w, 3); g.fillStyle = '#E2B34A'; g.fillRect(0, y, w, 1); }
  // darker mirrored band at the back (the wall reflected in the polish) + gloss towards the front
  vGradient(g, 0, 0, w, 44, [[0, 'rgba(46,45,56,0.45)'], [1, 'rgba(46,45,56,0)']]);
  vGradient(g, 0, Z_MAX - 36, w, 36, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.14)']]);
  g.fillStyle = 'rgba(77,240,224,0.06)'; g.fillRect(0, 0, w, 20);
  // front edge: step down into the dark band
  g.fillStyle = '#8A8478'; g.fillRect(0, Z_MAX, w, 3);
  g.fillStyle = '#4A4858'; g.fillRect(0, Z_MAX + 3, w, h - Z_MAX - 3);
}

function paintPillar(g, w, h) {
  boxOutlined(g, 8, 0, 24, h, '#C9963A', INK);
  g.fillStyle = '#E2B34A'; g.fillRect(8, 0, 5, h);
  g.fillStyle = '#8C6825'; g.fillRect(24, 0, 8, h);
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 14; x < 24; x += 5) g.fillRect(x, 0, 1, h);
  boxOutlined(g, 2, BLEED + 26, 36, 12, '#C9963A', INK);
  g.fillStyle = '#8C6825'; g.fillRect(2, BLEED + 34, 36, 4);
  boxOutlined(g, 2, BLEED + 300, 36, 14, '#C9963A', INK);
  g.fillStyle = '#8C6825'; g.fillRect(2, BLEED + 308, 36, 6);
  for (let y = BLEED + 60; y < h - 40; y += 90) rivets(g, 10, y, 30, 8, '#E2B34A', 'rgba(0,0,0,0.5)');
}

export function create(section) {
  const mid = layerSpace(section, PARALLAX.mid);
  const near = layerSpace(section, PARALLAX.near);
  const farL = makeLayer(FAR_W, SKY_H, paintFar, 41);
  const midL = makeLayer(mid.width, SKY_H, paintMid, 42);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, paintFloor, 43);
  const pillarL = makeLayer(40, 360 + BLEED * 2, paintPillar, 44);
  const coreGlow = makeGlowSprite(130, 'rgba(120,255,240,0.55)', 'rgba(77,240,224,0.22)');
  const moteGlow = makeGlowSprite(5, 'rgba(77,240,224,0.5)');
  const pillarXs = [];
  for (let x = 520; x < near.width - 200; x += 1040) pillarXs.push(x);

  const motes = makePool(MOTE_N);
  for (let i = 0; i < MOTE_N; i++) { motes.x[i] = (i * 151) % VIEW_W; motes.y[i] = 40 + (i * 89) % 300; motes.vy[i] = -(0.15 + (i % 5) * 0.06); motes.seed[i] = (i * 0.37) % 1; }
  let f = 0;

  return {
    update(frame) {
      f = frame | 0;
      for (let i = 0; i < MOTE_N; i++) {
        motes.y[i] += motes.vy[i]; motes.x[i] += Math.sin((f + i * 40) * 0.03) * 0.3;
        if (motes.y[i] < 30) { motes.y[i] = 350; motes.x[i] = (motes.x[i] + 263) % VIEW_W; }
        if (motes.x[i] < -4) motes.x[i] += VIEW_W + 8; else if (motes.x[i] > VIEW_W + 4) motes.x[i] -= VIEW_W + 8;
      }
    },
    drawBack(ctx, cam, frame) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      const farOrigin = Math.round(-cam.x * PARALLAX.far + shx);
      blitTiled(ctx, farL, farOrigin, -BLEED + sy);
      const b = beat(frame, 60);
      // gauge needles twitch with the heartbeat
      ctx.strokeStyle = '#B03030'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < GAUGES.length; i++) {
        const gx = ((farOrigin + GAUGES[i][0]) % FAR_W + FAR_W) % FAR_W;
        for (let x = gx - FAR_W; x < VIEW_W + 20; x += FAR_W) {
          if (x < -20) continue;
          const a = Math.PI * 0.75 + (0.9 + 0.5 * Math.sin(frame * 0.05 + i * 1.3) + b * 0.4) * 1.2;
          ctx.beginPath(); ctx.moveTo(x, GAUGES[i][1] + sy); ctx.lineTo(x + Math.cos(a) * 9, GAUGES[i][1] + sy + Math.sin(a) * 9); ctx.stroke();
        }
      }
      // the core: pulsing disk + glow
      const cx0 = ((farOrigin + CORE.x) % FAR_W + FAR_W) % FAR_W;
      for (let x = cx0 - FAR_W; x < VIEW_W + 160; x += FAR_W) {
        if (x < -160) continue;
        const r = Math.round(CORE.r * (0.94 + 0.06 * b));
        ctx.globalAlpha = 0.45 + 0.55 * b;
        ctx.drawImage(coreGlow.canvas, x - 130, CORE.y - 130 + sy);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#1A5A5C'; ctx.beginPath(); ctx.arc(x, CORE.y + sy, r + 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4DF0E0'; ctx.beginPath(); ctx.arc(x, CORE.y + sy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#C8FFF8'; ctx.beginPath(); ctx.arc(x - r * 0.15, CORE.y + sy - r * 0.15, r * (0.45 + 0.15 * b), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(x - r * 0.3, CORE.y + sy - r * 0.3, r * 0.12, 0, Math.PI * 2); ctx.fill();
        // aether swirl: three orbiting sparks
        ctx.fillStyle = '#C8FFF8';
        for (let k = 0; k < 3; k++) { const a = frame * 0.04 + k * 2.1; ctx.fillRect(Math.round(x + Math.cos(a) * r * 0.75) - 1, Math.round(CORE.y + sy + Math.sin(a) * r * 0.75) - 1, 3, 3); }
      }
      blitAt(ctx, midL, mid.originX(cam), -BLEED + sy);
      blitTiled(ctx, floorL, Math.round(-cam.x + shx), FLOOR_TOP + sy);
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam, frame) {
      const sy = cam.shakeY || 0;
      const nearOrigin = near.originX(cam);
      for (let i = 0; i < pillarXs.length; i++) {
        const x = nearOrigin + pillarXs[i];
        if (x > -44 && x < VIEW_W + 4) ctx.drawImage(pillarL.canvas, x, -BLEED + sy);
      }
      for (let i = 0; i < MOTE_N; i++) {
        const x = Math.round(motes.x[i]), y = Math.round(motes.y[i]) + sy;
        ctx.globalAlpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(frame * 0.08 + motes.seed[i] * 12));
        ctx.drawImage(moteGlow.canvas, x - 5, y - 5);
        ctx.fillStyle = motes.seed[i] < 0.3 ? '#C8FFF8' : '#4DF0E0';
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    },
  };
}
