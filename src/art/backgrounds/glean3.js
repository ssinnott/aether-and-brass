// Stage 4, section 3: THE CROP LOFT (docs/STAGE4.md section 5). The belly of the biggest bladder the guild owns, and
// the only interior in the game with no floor: net decking over a drop, with four boards' worth of stripped war
// hanging over it in cargo nets.
// Far (0.2): the inside of the silk — ribs, seams and patches, lit rose from within by the gas it is full of.
// Mid (0.5): the sorting lines and the cargo nets on them, loaded with everything you have broken since board 1.
// Floor: rope net over boards over nothing, with the gas coming up through the mesh.
// Near (1.2, drawFront): a net corner and its line at the top of the frame; gas motes rising.
//
// The other two sections put a violet faction on a cold field under a warm sky. This one has no sky at all: the
// whole room is the faction's own bladder silk, so the ONE thing that has to stay true is the floor — the netting
// is the darkest surface on the board (Oklab L ~30 against silk at ~80) and the fight reads on it, while everything
// the room is made of sits above the shoulder line where it belongs.
import {
  VIEW_W, FLOOR_TOP, Z_MAX, PARALLAX, BLEED, SKY_H, FLOOR_H, INK,
  makeLayer, blitTiled, blitAt, layerSpace, drawDarkBand, vGradient, radialGlow, makeGlowSprite,
  boxOutlined, rivets, makePool, pulse,
} from './common.js';
import { pathPoly, paint } from '../shapes.js';

const FAR_W = 960;
const FLOOR_TILE = 480;
const MOTE_N = 36;
const NEAR_Y = 4;
const NET_STEP = 240;

// THE ROOM IS DARKER THAN THE FACTION'S OWN SILK, and that is not a mood choice. Every rig in this guild carries a
// GLEAN.silk bladder (Oklab L* 79.7) as its biggest mass; painting the loft's walls in the same silk put a pale blue
// bag in front of a pale blue ceiling and the enemies' largest shape disappeared. It is dusk outside and the only
// light in here is the guild's own rose lamps, so the interior sits 25-40 points UNDER the bags hanging in it and
// the gas does the colour work instead.
const SILK_TOP = '#33455A', SILK_MID = '#4A6072', SILK_LOW = '#63798A', GLOW = '#8A5A78';
const RIB = '#3E5464', SEAM = '#2E4050', PATCH = '#55707F';
const NET = '#4A5450', NET_D = '#39423F', BOARD = '#4C5450', BOARD_D = '#3B423E';
const ROPE = '#6E6942', ROSE = '#FF57B0', HEMP = '#9C893F', IRON = '#4A4E56', BRASS = '#8A7A5A';

function paintFar(g, w, h, rnd) {
  g.translate(0, BLEED);
  // the inside of the bag: pale silk overhead going warmer and rosier toward the deck, where the gas pools
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED, [[0, SILK_TOP], [0.42, SILK_MID], [0.84, SILK_LOW], [1, GLOW]]);
  g.fillStyle = GLOW; g.fillRect(0, FLOOR_TOP, w, BLEED);
  // the ribs: the bag's own frame, curving away from the centre line
  for (let i = 0; i < 7; i++) {
    const x = 40 + i * 138;
    g.strokeStyle = RIB; g.lineWidth = 5;
    g.beginPath(); g.moveTo(x, -BLEED); g.quadraticCurveTo(x + 26, 100, x + 6, 210); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - 2, -BLEED); g.quadraticCurveTo(x + 24, 100, x + 4, 210); g.stroke();
  }
  // the seams and the patches: this bag has been repaired for a hundred years and every repair shows
  g.strokeStyle = SEAM; g.lineWidth = 2;
  for (let y = 18; y < 200; y += 34) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 6); g.stroke(); }
  for (let i = 0; i < 22; i++) {
    const x = Math.round(rnd() * w), y = 12 + Math.round(rnd() * 170), ww = 20 + Math.round(rnd() * 40), hh = 12 + Math.round(rnd() * 18);
    g.fillStyle = PATCH; g.fillRect(x, y, ww, hh);
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, y + hh - 2, ww, 2);
    g.strokeStyle = 'rgba(30,40,52,0.5)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1);
  }
  // the gas the room is full of, pooling along the bottom of the silk
  vGradient(g, 0, 150, w, 60, [[0, 'rgba(255,87,176,0)'], [1, 'rgba(255,87,176,0.26)']]);
  radialGlow(g, 480, 208, 190, 'rgba(255,87,176,0.18)');
}
function paintMid(g, w, h, rnd) {
  g.translate(0, BLEED);
  // the sorting lines: hemp running the length of the loft at two heights, with the nets hanging off them
  for (const y of [46, 96]) {
    g.strokeStyle = 'rgba(20,16,32,0.85)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 4); g.stroke();
    g.strokeStyle = ROPE; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 4); g.stroke();
  }
  // THE CROP: four boards' worth of other people's war, in nets, hanging over the fight
  for (let x = 0; x < w; x += NET_STEP) {
    for (let k = 0; k < 2; k++) {
      // each net hangs a different length off its own sorting line, and the line is long enough to SEE: at a fixed
      // 8px drop the two rows read as pictures hung on a wall rather than as a loft full of loaded nets
      const line = k ? 100 : 50, drop = 10 + Math.round(rnd() * 22);
      const nx = x + 40 + k * 118 + Math.round(rnd() * 24), top = line + drop;
      g.strokeStyle = 'rgba(20,16,32,0.85)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(nx + 4, line); g.lineTo(nx + 4, top); g.stroke();
      g.strokeStyle = ROPE; g.lineWidth = 1;
      g.beginPath(); g.moveTo(nx + 4, line); g.lineTo(nx + 4, top); g.stroke();
      g.fillStyle = IRON; g.fillRect(nx, top - 6, 9, 6);
      const nw = 54 + Math.round(rnd() * 26), nh = 34 + Math.round(rnd() * 16);
      boxOutlined(g, nx - nw / 2 + 4, top, nw, nh, HEMP, INK, 2);
      // the mesh over the load
      g.strokeStyle = 'rgba(0,0,0,0.42)'; g.lineWidth = 1;
      for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(nx - nw / 2 + 4 + i * (nw / 5), top); g.lineTo(nx - nw / 2 + 4 + i * (nw / 5), top + nh); g.stroke(); }
      for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(nx - nw / 2 + 4, top + i * (nh / 3)); g.lineTo(nx + nw / 2 + 4, top + i * (nh / 3)); g.stroke(); }
      // what is in it: brass gears, a plate, a coil, a kiln hoop — one of each war, sorted by nobody
      const pick = Math.floor(rnd() * 4);
      g.fillStyle = pick === 0 ? BRASS : pick === 1 ? '#5A5348' : pick === 2 ? '#3E4654' : '#394249';
      g.fillRect(nx - nw / 2 + 10, top + 6, nw - 12, nh - 14);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(nx - nw / 2 + 10, top + nh - 12, nw - 12, 4);
      if (pick === 0) { g.fillStyle = '#C8A050'; for (let i = 0; i < 3; i++) g.fillRect(nx - nw / 2 + 14 + i * 12, top + 10, 6, 6); }
      if (pick === 2) { g.fillStyle = 'rgba(255,87,176,0.4)'; g.fillRect(nx - nw / 2 + 16, top + 12, nw - 26, 3); }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(nx - nw / 2 + 4, top + nh, nw, 3);
    }
  }
  // the guild's own lamps between the nets: rose glass in an iron cage, hung off the lower line
  for (let x = 130; x < w; x += 300) {
    g.strokeStyle = 'rgba(20,16,32,0.8)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + 6, 100); g.lineTo(x + 6, 146); g.stroke();
    boxOutlined(g, x, 146, 14, 15, '#2E2A3A', INK, 2);
    g.fillStyle = ROSE; g.fillRect(x + 3, 149, 8, 9);
    g.fillStyle = 'rgba(255,87,176,0.16)'; g.fillRect(x - 8, 140, 30, 28);
  }
  // the loft's floor beams, seen edge-on at the back of the room where the netting is lashed to them
  boxOutlined(g, -4, 188, w + 8, 18, BOARD_D, INK, 2);
  g.fillStyle = BOARD; g.fillRect(0, 190, w, 6);
  rivets(g, 8, 194, w - 8, 26, BRASS, 'rgba(0,0,0,0.45)');
}
function paintFloor(g, w, h, rnd) {
  // net over boards over NOTHING: the dark under the mesh is the drop, and it is the point of the room
  g.fillStyle = '#14121E'; g.fillRect(0, 0, w, h);
  // the boards: narrow planks laid across the drop with real gaps between them
  for (let y = 8; y < Z_MAX - 6; y += 22) {
    g.fillStyle = (y / 22 | 0) & 1 ? BOARD : BOARD_D;
    g.fillRect(0, y, w, 15);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, y, w, 2);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y + 13, w, 2);
    // the gas coming up through the gap under each board — a seam, not a stripe: the fight reads on this floor and
    // a rose band every 22px put the board's own energy colour under the feet of a faction that is made of it
    g.fillStyle = 'rgba(255,87,176,0.07)'; g.fillRect(0, y + 16, w, 3);
  }
  // the rope net over all of it: a real grid, dark, so the fight has something to read against
  g.strokeStyle = NET; g.lineWidth = 2;
  for (let x = 0; x < w + 40; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 18, Z_MAX); g.stroke(); }
  for (let x = -40; x < w; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 18, Z_MAX); g.stroke(); }
  g.strokeStyle = NET_D; g.lineWidth = 1;
  for (let y = 10; y < Z_MAX; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  // the knots, and the iron rings the net is lashed down with along both edges
  for (let x = 0; x < w; x += 40) for (let y = 10; y < Z_MAX; y += 24) { g.fillStyle = ROPE; g.fillRect(x - 2, y - 2, 4, 4); }
  for (let x = 0; x < w; x += 60) {
    g.fillStyle = IRON; g.fillRect(x, 2, 8, 6); g.fillRect(x + 20, Z_MAX - 10, 8, 6);
  }
  // spilled crop: brass swarf and clinker caught in the mesh
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rnd() < 0.6 ? 'rgba(0,0,0,0.3)' : 'rgba(200,160,80,0.22)';
    g.fillRect(Math.round(rnd() * w), 12 + Math.round(rnd() * (Z_MAX - 26)), 2 + Math.round(rnd() * 2), 2);
  }
  g.fillStyle = INK; g.fillRect(0, 0, w, 3);
  g.fillStyle = '#0A0812'; g.fillRect(0, Z_MAX, w, h - Z_MAX);
}
function paintNear(g, w, h, rnd) {
  // a net corner and the line holding it, across the TOP of the frame only: nothing at fighter height, on any board
  for (let x = 0; x < w; x += 268) {
    const nx = x + Math.round(rnd() * 30);
    g.strokeStyle = INK; g.lineWidth = 5;
    g.beginPath(); g.moveTo(nx - 50, 0); g.lineTo(nx + 26, 22); g.stroke();
    g.strokeStyle = ROPE; g.lineWidth = 3;
    g.beginPath(); g.moveTo(nx - 50, 0); g.lineTo(nx + 26, 22); g.stroke();
    pathPoly(g, [nx + 26, 22, nx + 74, 0, nx + 74, 26, nx + 30, 34]);
    paint(g, HEMP, INK, 2);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(nx + 30, 26, 44, 5);
  }
}

export function create(section) {
  const mid = layerSpace(section, PARALLAX.mid);
  const near = layerSpace(section, PARALLAX.near);
  const farL = makeLayer(FAR_W, SKY_H, paintFar, 89);
  const midL = makeLayer(mid.width, SKY_H, paintMid, 90);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, paintFloor, 91);
  const nearL = makeLayer(near.width, 40, paintNear, 92);
  const lampGlow = makeGlowSprite(20, 'rgba(255,87,176,0.22)');

  const motes = makePool(MOTE_N);
  for (let i = 0; i < MOTE_N; i++) { motes.x[i] = (i * 59) % VIEW_W; motes.y[i] = 200 + (i * 53) % 140; motes.vy[i] = -0.26 - (i % 5) * 0.05; motes.seed[i] = i % 3; }
  let f = 0;

  return {
    update(frame) {
      f = frame | 0;
      for (let i = 0; i < MOTE_N; i++) {
        motes.y[i] += motes.vy[i];
        motes.x[i] += Math.sin((f + i * 37) * 0.022) * 0.14;
        if (motes.y[i] < 60) { motes.y[i] = 342; motes.x[i] = (i * 59 + f) % VIEW_W; }
      }
    },
    drawBack(ctx, cam, frame) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      blitTiled(ctx, farL, Math.round(-cam.x * PARALLAX.far + shx), -BLEED + sy);
      blitAt(ctx, midL, mid.originX(cam), -BLEED + sy);
      // the lamps breathe with the bag: the whole room is one bladder and it is never quite still
      const midOrigin = mid.originX(cam), k = 0.7 + 0.3 * pulse(frame | 0, 190);
      for (let lx = 130; lx < mid.width; lx += 300) {
        const x = midOrigin + lx;
        if (x < -40 || x > VIEW_W + 40) continue;
        ctx.globalAlpha = k;
        ctx.drawImage(lampGlow.canvas, x + 7 - 20, 153 - 20 + sy);
        ctx.globalAlpha = 1;
      }
      blitTiled(ctx, floorL, Math.round(-cam.x + shx), FLOOR_TOP + sy);
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam) {
      const sy = cam.shakeY || 0;
      blitAt(ctx, nearL, near.originX(cam), NEAR_Y + sy);
      for (let i = 0; i < MOTE_N; i++) {
        ctx.fillStyle = motes.seed[i] ? 'rgba(255,87,176,0.30)' : 'rgba(255,210,122,0.20)';
        const s = 1 + (motes.seed[i] & 1);
        ctx.fillRect(Math.round(motes.x[i]), Math.round(motes.y[i]), s, s + 1);
      }
    },
  };
}
