// Stage 2, section 2: THE GAS-HALLS (docs/STAGE2.md section 6). Inside the envelope of a captured freighter — the
// only interior of the stage, and the only place in the game lit from above by something soft.
// Far (0.2): the far wall of the envelope, ribbed in hoops, with rows of pale-green gas cells breathing behind netting.
// Mid (0.5): the catwalk truss the fight happens on: girders, hanging chains, cargo nets and ballast bags.
// Floor: plank catwalk over mesh, brass seam strips, a dark drop along the back edge.
// Near (1.2, drawFront): girder frames at the screen edges, plus fabric dust drifting through the light.
import {
  VIEW_W, FLOOR_TOP, Z_MAX, PARALLAX, BLEED, SKY_H, FLOOR_H, INK,
  makeLayer, blitTiled, blitAt, layerSpace, drawDarkBand, vGradient, radialGlow, makeGlowSprite,
  boxOutlined, rivets, makePool, pulse,
} from './common.js';
import { pathPoly, paint } from '../shapes.js';

const FAR_W = 960;
const FLOOR_TILE = 480;
const HOOP_STEP = 210;
const MOTE_N = 34;
const NEAR_Y = 0;

const SKIN = '#2B2A3A', SKIN_D = '#1C1B28', RIB = '#4A4657', CELL = '#8FC6A4', CELL_D = '#4E7C63';
const WOOD = '#6A5238', WOOD_D = '#4C3A28', BRASS = '#B08A3E', ROPE = '#B9A47E';

function paintFar(g, w, h, rnd) {
  g.translate(0, BLEED);
  // envelope skin: dark canvas, lighter toward the crown where the cells glow
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED, [[0, SKIN_D], [0.35, SKIN], [1, '#241F2E']]);
  g.fillStyle = '#241F2E'; g.fillRect(0, FLOOR_TOP, w, BLEED);
  // gas cells: rows of soft green bladders behind their netting
  for (let row = 0; row < 2; row++) {
    const cy = 44 + row * 74, ry = 30 - row * 6;
    for (let x = 30; x < w; x += 150) {
      const cx = x + (row ? 70 : 0), rx = 58 - row * 8;
      radialGlow(g, cx, cy, rx + 30, `rgba(150,220,180,${0.16 - row * 0.05})`);
      g.fillStyle = row ? CELL_D : CELL;
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath(); g.ellipse(cx - rx * 0.3, cy - ry * 0.4, rx * 0.4, ry * 0.3, 0, 0, Math.PI * 2); g.fill();
      // netting over the cell
      g.strokeStyle = 'rgba(20,18,28,0.55)'; g.lineWidth = 1;
      for (let k = -3; k <= 3; k++) {
        g.beginPath(); g.moveTo(cx + k * 16, cy - ry); g.lineTo(cx + k * 16, cy + ry); g.stroke();
        g.beginPath(); g.moveTo(cx - rx, cy + k * 9); g.lineTo(cx + rx, cy + k * 9); g.stroke();
      }
    }
  }
  // the envelope's ribs, curving away down the hall
  for (let x = -40; x < w + 40; x += HOOP_STEP) {
    g.strokeStyle = INK; g.lineWidth = 7;
    g.beginPath(); g.moveTo(x, FLOOR_TOP); g.quadraticCurveTo(x + 52, -30, x + 118, FLOOR_TOP); g.stroke();
    g.strokeStyle = RIB; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x, FLOOR_TOP); g.quadraticCurveTo(x + 52, -30, x + 118, FLOOR_TOP); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x + 2, FLOOR_TOP); g.quadraticCurveTo(x + 54, -28, x + 120, FLOOR_TOP); g.stroke();
  }
  // longitudinal stringers tying the ribs together
  g.fillStyle = 'rgba(74,70,87,0.8)';
  for (const y of [30, 96, 150]) g.fillRect(0, y, w, 3);
  // patched canvas: lighter rectangles stitched over old tears
  for (let i = 0; i < 12; i++) {
    const x = rnd() * w, y = 110 + rnd() * 70, ww = 20 + rnd() * 40, hh = 12 + rnd() * 20;
    g.fillStyle = 'rgba(90,84,104,0.35)'; g.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh));
    g.strokeStyle = 'rgba(200,190,160,0.25)'; g.lineWidth = 1; g.setLineDash([2, 3]);
    g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(ww), Math.round(hh)); g.setLineDash([]);
  }
}
function paintMid(g, w, h, rnd) {
  g.translate(0, BLEED);
  // the keel truss the catwalk hangs from, running the length of the hall just above head height
  boxOutlined(g, -4, 96, w + 8, 12, '#3A3446', INK, 2);
  g.fillStyle = '#524A60'; g.fillRect(0, 98, w, 3);
  rivets(g, 8, 102, w - 8, 20, '#8A7EA0', 'rgba(0,0,0,0.5)');
  g.strokeStyle = '#3A3446'; g.lineWidth = 3;
  for (let x = 0; x < w; x += 34) { g.beginPath(); g.moveTo(x, 108); g.lineTo(x + 17, 150); g.lineTo(x + 34, 108); g.stroke(); }
  boxOutlined(g, -4, 150, w + 8, 8, '#2E2A3A', INK, 2);
  // hanging chains with hooks, and ballast bags on lanyards
  for (let x = 40; x < w; x += 148) {
    const drop = 40 + Math.round(rnd() * 40);
    g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(x, 108); g.lineTo(x, 108 + drop); g.stroke();
    g.strokeStyle = '#7A828E'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 108); g.lineTo(x, 108 + drop); g.stroke();
    if (rnd() < 0.5) { boxOutlined(g, x - 7, 108 + drop, 14, 16, '#5A4A34', INK, 2); g.fillStyle = ROPE; g.fillRect(x - 6, 110 + drop, 12, 2); }
    else { g.strokeStyle = '#7A828E'; g.lineWidth = 3; g.beginPath(); g.arc(x, 112 + drop, 5, 0.4, 4.2); g.stroke(); }
  }
  // cargo stacked along the back of the catwalk: crates, lashed barrels and a spare gas cylinder, so the strip between
  // the netting and the floor is loading bay rather than a black void
  for (let x = 10; x < w; x += 176) {
    boxOutlined(g, x, 168, 30, 30, '#5A4A34', INK, 2);
    g.fillStyle = '#6E5A3E'; g.fillRect(x + 2, 170, 26, 12);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 2, 186, 26, 10);
    g.fillStyle = ROPE; g.fillRect(x, 180, 30, 2);
    boxOutlined(g, x + 34, 176, 20, 22, '#4A4054', INK, 2);
    g.fillStyle = '#5E5468'; g.fillRect(x + 36, 178, 16, 8);
    if ((x / 176) % 2 === 0) {
      boxOutlined(g, x + 60, 160, 14, 38, '#3E4A52', INK, 2);
      g.fillStyle = '#54646E'; g.fillRect(x + 62, 162, 4, 34);
      g.fillStyle = CELL_D; g.fillRect(x + 62, 166, 10, 4);
    }
  }
  // cargo netting slung between the frames
  for (let x = 0; x < w; x += 300) {
    g.strokeStyle = 'rgba(185,164,126,0.5)'; g.lineWidth = 1;
    for (let k = 0; k < 8; k++) {
      g.beginPath(); g.moveTo(x + 20 + k * 12, 158); g.lineTo(x + 60 + k * 12, 196); g.stroke();
      g.beginPath(); g.moveTo(x + 100 - k * 12, 158); g.lineTo(x + 60 - k * 12, 196); g.stroke();
    }
  }
  // gantry lamps on the truss (the only warm light in the hall)
  for (let x = 90; x < w; x += 296) {
    boxOutlined(g, x, 108, 12, 9, '#2E2A3A', INK, 1);
    g.fillStyle = '#FFD79A'; g.fillRect(x + 2, 115, 8, 3);
  }
}
function paintFloor(g, w, h, rnd) {
  // mesh under the planks
  g.fillStyle = '#171420'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#221E2C';
  for (let y = 0; y < h; y += 5) g.fillRect(0, y, w, 2);
  // plank catwalk: 14px boards along x with staggered butt joints
  for (let y = 10; y < Z_MAX - 6; y += 14) {
    const row = (y / 14) | 0;
    g.fillStyle = row & 1 ? WOOD : WOOD_D;
    g.fillRect(0, y, w, 13);
    g.fillStyle = 'rgba(255,230,180,0.08)'; g.fillRect(0, y, w, 2);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y + 12, w, 1);
    for (let x = (row & 1) * 60; x < w; x += 120) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, y, 2, 13); }
    // grain
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(Math.round(rnd() * w), y + 3 + Math.round(rnd() * 7), 16 + Math.round(rnd() * 30), 1); }
  }
  // seams between the catwalk bays: a caulked gap with brass screw heads down it. Deliberately NOT a continuous bright
  // strip — anything with value and height here reads as a row of posts standing in the middle of the fight.
  for (let x = 0; x < w; x += 120) {
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, 8, 3, Z_MAX - 12);
    g.fillStyle = 'rgba(255,230,180,0.06)'; g.fillRect(x + 3, 8, 1, Z_MAX - 12);
    for (let y = 16; y < Z_MAX - 12; y += 26) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, y + 1, 3, 2); g.fillStyle = BRASS; g.fillRect(x, y, 3, 2); }
  }
  // the back edge: a dark gap where the catwalk ends and the hull curves away
  g.fillStyle = INK; g.fillRect(0, 0, w, 10);
  g.fillStyle = '#0C0A12'; g.fillRect(0, 0, w, 8);
  for (let x = 0; x < w; x += 40) { g.fillStyle = '#3A3446'; g.fillRect(x, 6, 22, 4); }
  // spilled ballast sand and rope ends
  for (let i = 0; i < 18; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(200,180,140,0.10)' : 'rgba(0,0,0,0.16)'; g.fillRect(Math.round(rnd() * w), 14 + Math.round(rnd() * (Z_MAX - 30)), 8 + Math.round(rnd() * 22), 2); }
  g.fillStyle = '#0C0A12'; g.fillRect(0, Z_MAX, w, h - Z_MAX);
}
function paintNear(g, w, h, rnd) {
  // structural frames that pass in front of the fight every 320px
  for (let x = 0; x < w; x += 320) {
    boxOutlined(g, x, 0, 16, 210, '#241F2E', INK, 2);
    g.fillStyle = '#3A3446'; g.fillRect(x + 2, 0, 5, 210);
    rivets(g, x + 5, 20, x + 5, 1, '#6A6280', 'rgba(0,0,0,0.5)');
    for (let y = 24; y < 200; y += 30) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + 4, y + 1, 3, 3); g.fillStyle = '#6A6280'; g.fillRect(x + 4, y, 3, 3); }
    boxOutlined(g, x - 10, 196, 36, 12, '#241F2E', INK, 2);
    // a rope tail hanging off the frame
    g.strokeStyle = ROPE; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + 20, 200); g.quadraticCurveTo(x + 30, 224, x + 22, 244); g.stroke();
  }
}

export function create(section) {
  const mid = layerSpace(section, PARALLAX.mid);
  const near = layerSpace(section, PARALLAX.near);
  const farL = makeLayer(FAR_W, SKY_H, paintFar, 61);
  const midL = makeLayer(mid.width, SKY_H, paintMid, 62);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, paintFloor, 63);
  const nearL = makeLayer(near.width, 250, paintNear, 64);
  const cellGlow = makeGlowSprite(46, 'rgba(150,220,180,0.22)');

  const motes = makePool(MOTE_N);
  for (let i = 0; i < MOTE_N; i++) { motes.x[i] = (i * 83) % VIEW_W; motes.y[i] = (i * 47) % 300; motes.vx[i] = 0.12 + (i % 5) * 0.05; motes.vy[i] = -0.06 - (i % 3) * 0.04; motes.seed[i] = i % 4; }
  let f = 0;

  return {
    update(frame) {
      f = frame | 0;
      for (let i = 0; i < MOTE_N; i++) {
        motes.x[i] += motes.vx[i]; motes.y[i] += motes.vy[i] + Math.sin((f + i * 20) * 0.02) * 0.08;
        if (motes.x[i] > VIEW_W + 4) motes.x[i] -= VIEW_W + 8;
        if (motes.y[i] < -4) motes.y[i] += 300;
      }
    },
    drawBack(ctx, cam, frame) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      const farOrigin = Math.round(-cam.x * PARALLAX.far + shx);
      blitTiled(ctx, farL, farOrigin, -BLEED + sy);
      // the cells breathe: a slow glow riding over the pre-rendered bladders
      const k = 0.35 + 0.45 * pulse(frame, 190);
      ctx.globalAlpha = k;
      for (let x = ((farOrigin + 30) % 150 + 150) % 150 - 150; x < VIEW_W + 60; x += 150) ctx.drawImage(cellGlow.canvas, x - 46, 44 - 46 + sy);
      ctx.globalAlpha = 1;
      blitAt(ctx, midL, mid.originX(cam), -BLEED + sy);
      blitTiled(ctx, floorL, Math.round(-cam.x + shx), FLOOR_TOP + sy);
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam) {
      const sy = cam.shakeY || 0;
      blitAt(ctx, nearL, near.originX(cam), NEAR_Y + sy);
      // canvas dust turning slowly in the cell light
      for (let i = 0; i < MOTE_N; i++) {
        ctx.fillStyle = motes.seed[i] ? 'rgba(220,230,210,0.16)' : 'rgba(180,230,200,0.26)';
        ctx.fillRect(Math.round(motes.x[i]), Math.round(motes.y[i]), 1 + (motes.seed[i] & 1), 1 + (motes.seed[i] & 1));
      }
    },
  };
}
