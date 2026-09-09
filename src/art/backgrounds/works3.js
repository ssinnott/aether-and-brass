// Stage 3, section 3: THE LEDGER HOUSE (docs/STAGE3.md section 5). The company's counting floor — the only interior
// of the board, and the only place on it that is darker than the people fighting in it.
// Far (0.2): the pigeon-hole wall and the brass ledger cages, lit by hanging lamps, with the house kiln burning lime
//            at the end of the room.
// Mid (0.5): counting desks with chained ledgers, the wax press, and the cart lane running in from the yard.
// Floor: waxed board with brass inlay lines and lime tracked in on every boot from the yard.
// Near (1.2, drawFront): the hall's pillars passing in front of the fight; paper dust turning in the lamp light.
//
// The two outdoor sections put a pale faction on a mid-dark ground under a bone sky; this one inverts it — a cold
// dark room where the quicklime aprons and tallow coats are the LIGHTEST and the only warm things on screen, so the
// last third of the board reads as the inside of the thing the first two thirds were walking toward.
import {
  VIEW_W, FLOOR_TOP, Z_MAX, PARALLAX, BLEED, SKY_H, FLOOR_H, INK,
  makeLayer, blitTiled, blitAt, layerSpace, drawDarkBand, vGradient, radialGlow, makeGlowSprite,
  boxOutlined, rivets, makePool, pulse,
} from './common.js';
import { pathPoly, paint } from '../shapes.js';

const FAR_W = 960;
const FLOOR_TILE = 480;
const MOTE_N = 30;
const NEAR_Y = 0;
/** Far-layer x of the hanging lamps (their glow is drawn per frame). */
const LAMPS = [120, 360, 600, 840];

// THE COUNTING FLOOR IS A COLD ROOM. It was a warm brown one, and the measurement said so: bg hue 76 against a
// Chandlery mean of 86, 35.8% of the faction's pixels LOST and 46% colour overlap — the worst row on the board,
// because a tallow-and-quicklime faction was standing in a tallow-coloured room. The room is now a green-grey,
// and the only warm things left in it are the two that should be: the lamps and the kiln.
const WALL = '#31382F', WALL_D = '#242B24', HOLE = '#181C17', SHELF = '#4E5546', BRASS = '#B08A3E';
const CAGE = '#8A7440', DESK = '#4E4030', DESK_D = '#3A2F23', PAPER = '#D9D2B8', LEDGER = '#7A2B32';
const IRON = '#4A4E56', LIME = '#D8FF6E', KILN = '#394249';
// The floor is held at v38, and it was MEASURED against the alternative rather than guessed. Taking the boards down
// to v29 for a bigger value gap makes the row worse, not better (lost% 37.6 -> 38.9, dHue 25.5 -> 14.2): the pixels
// this faction loses to a dark ground are its own near-black ink, boots and gauntlets, which no floor value saves,
// while a darker floor greys out the hue separation the cool pass just bought. The trade taken here is the one the
// faction's own colour pass took: 1.8 points of lost% for 12 points of colour overlap (46.0 -> 34.2).
const BOARD = '#5A6151', BOARD_D = '#4A5143', WAX = '#8E2F38';

function paintFar(g, w, h, rnd) {
  g.translate(0, BLEED);
  // the room's own darkness: warm at the bottom where the lamps hang, near-black up in the roof
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED, [[0, '#1C211B'], [0.4, WALL_D], [1, WALL]]);
  // the pigeon-hole wall: the company's memory, floor to ceiling, and every hole has a roll in it
  for (let y = 40; y < 168; y += 22) {
    for (let x = 8; x < w; x += 26) {
      g.fillStyle = SHELF; g.fillRect(x, y, 24, 20);
      g.fillStyle = HOLE; g.fillRect(x + 2, y + 2, 20, 16);
      if (rnd() < 0.7) { g.fillStyle = PAPER; g.fillRect(x + 4, y + 10, 16, 6); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 4, y + 10, 16, 2); }
      if (rnd() < 0.2) { g.fillStyle = LEDGER; g.fillRect(x + 5, y + 4, 5, 12); }
    }
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, y + 20, w, 2);
  }
  // the ledger cages: brass grilles over the alcoves between the racks, with a clerk's hatch in each
  for (let x = 60; x < w; x += 240) {
    boxOutlined(g, x, 96, 88, 106, '#1F251E', INK, 2);
    g.strokeStyle = CAGE; g.lineWidth = 2;
    for (let k = 0; k <= 5; k++) { g.beginPath(); g.moveTo(x + 6 + k * 15, 100); g.lineTo(x + 6 + k * 15, 198); g.stroke(); }
    for (const y of [120, 160]) { g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x + 84, y); g.stroke(); }
    g.fillStyle = BRASS; g.fillRect(x + 30, 140, 28, 4);
    g.fillStyle = 'rgba(216,255,110,0.10)'; g.fillRect(x + 6, 100, 76, 98);
  }
  // the house kiln at the end of the room: it has never once gone out, and it is the only warm mass in the section
  boxOutlined(g, w - 150, 78, 96, 124, KILN, INK, 3);
  g.fillStyle = '#2E353C'; g.fillRect(w - 146, 82, 88, 30);
  radialGlow(g, w - 102, 156, 74, 'rgba(216,255,110,0.26)');
  g.fillStyle = '#1A1E14'; g.fillRect(w - 130, 128, 56, 50);
  g.fillStyle = LIME; g.fillRect(w - 126, 134, 48, 40);
  g.fillStyle = '#FFD27A'; g.fillRect(w - 116, 146, 28, 20);
  for (const y of [124, 182]) { g.fillStyle = IRON; g.fillRect(w - 152, y, 100, 6); }
  rivets(g, w - 146, 126, w - 60, 14, '#8A94A2', 'rgba(0,0,0,0.5)');
  // the hanging lamps' shades (the light itself is drawn per frame)
  for (const lx of LAMPS) {
    g.fillStyle = IRON; g.fillRect(lx - 1, 0, 2, 26);
    pathPoly(g, [lx - 13, 40, lx - 8, 26, lx + 8, 26, lx + 13, 40]); paint(g, '#3E4A42', INK, 2);
    g.fillStyle = '#FFE9A8'; g.fillRect(lx - 8, 38, 16, 4);
  }
  g.fillStyle = WALL; g.fillRect(0, 202, w, FLOOR_TOP - 202 + BLEED);
}
function paintMid(g, w, h, rnd) {
  g.translate(0, BLEED);
  // the counting desks: high sloped desks with a chained ledger open on each, running along the back of the floor
  for (let x = 20; x < w; x += 220) {
    const dx = x + Math.round(rnd() * 30);
    boxOutlined(g, dx, 158, 84, 44, DESK, INK, 2);
    g.fillStyle = DESK_D; g.fillRect(dx, 180, 84, 22);
    pathPoly(g, [dx - 2, 158, dx + 86, 158, dx + 86, 148, dx + 30, 142]); paint(g, DESK_D, INK, 2);
    // the ledger itself, open, with its chain running back to a ring in the desk
    boxOutlined(g, dx + 22, 138, 34, 12, PAPER, INK, 2);
    g.fillStyle = LEDGER; g.fillRect(dx + 38, 138, 4, 12);
    g.strokeStyle = '#8A94A2'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(dx + 24, 148); g.quadraticCurveTo(dx + 14, 160, dx + 8, 158); g.stroke();
    g.fillStyle = BRASS; g.fillRect(dx + 4, 156, 6, 5);
    // a clerk's stool, tipped in under the desk
    g.fillStyle = '#414A3B'; g.fillRect(dx + 60, 186, 16, 4); g.fillRect(dx + 62, 190, 4, 12); g.fillRect(dx + 72, 190, 4, 12);
  }
  // the wax press: the machine that turns a decision into a document, every 220px between the desks
  for (let x = 130; x < w; x += 220) {
    boxOutlined(g, x, 130, 40, 72, IRON, INK, 2);
    g.fillStyle = '#5A6068'; g.fillRect(x + 4, 134, 32, 20);
    g.fillStyle = WAX; g.fillRect(x + 10, 168, 20, 10);
    g.fillStyle = '#3A3F4B'; g.fillRect(x + 16, 154, 8, 16);
    g.fillStyle = BRASS; g.fillRect(x + 6, 158, 28, 4);
    g.strokeStyle = IRON; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x + 20, 134); g.lineTo(x + 44, 118); g.stroke();
    g.fillStyle = '#5E8072'; g.fillRect(x + 42, 114, 10, 6);
  }
  // paper: bundles tied with tape, stacked wherever the floor is not a lane
  for (let x = 70; x < w; x += 220) {
    for (let k = 0; k < 3; k++) {
      const px = x + k * 13, py = 190 - k * 6;
      g.fillStyle = PAPER; g.fillRect(px, py, 12, 8);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px, py + 6, 12, 2);
      g.fillStyle = LEDGER; g.fillRect(px + 4, py, 3, 8);
    }
  }
}
function paintFloor(g, w, h, rnd) {
  // waxed board: wide boards running along x, polished where the clerks walk and limed where the yard comes in
  for (let y = 8; y < Z_MAX - 4; y += 16) {
    const row = (y / 16) | 0;
    g.fillStyle = row & 1 ? BOARD : BOARD_D;
    g.fillRect(0, y, w, 15);
    g.fillStyle = 'rgba(255,236,190,0.07)'; g.fillRect(0, y, w, 2);
    g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(0, y + 14, w, 1);
    for (let x = (row & 1) * 70; x < w; x += 140) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, y, 2, 15); }
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(Math.round(rnd() * w), y + 4 + Math.round(rnd() * 8), 14 + Math.round(rnd() * 26), 1); }
  }
  // brass inlay: the house's own lane markings, two thin strips with screw heads down them
  for (const y of [38, 104]) {
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y + 3, w, 2);
    g.fillStyle = BRASS; g.fillRect(0, y, w, 3);
    for (let x = 10; x < w; x += 46) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x, y, 3, 3); }
  }
  // lime tracked in from the yard: boot-shaped smudges, thickest along the cart lane
  for (let i = 0; i < 20; i++) {
    const x = Math.round(rnd() * w), y = 14 + Math.round(rnd() * (Z_MAX - 30));
    g.fillStyle = 'rgba(214,210,186,0.35)';
    g.fillRect(x, y, 6 + Math.round(rnd() * 8), 3);
  }
  g.fillStyle = INK; g.fillRect(0, 0, w, 8);
  g.fillStyle = '#100E0A'; g.fillRect(0, 0, w, 6);
  g.fillStyle = '#100E0A'; g.fillRect(0, Z_MAX, w, h - Z_MAX);
}
function paintNear(g, w, h, rnd) {
  // the hall's pillars: heavy square posts with a brass collar, passing in front of the fight
  for (let x = 0; x < w; x += 330) {
    boxOutlined(g, x, 0, 22, 214, '#272E26', INK, 2);
    g.fillStyle = '#374033'; g.fillRect(x + 4, 0, 7, 214);
    g.fillStyle = BRASS; g.fillRect(x - 2, 150, 26, 5);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x - 2, 155, 26, 2);
    boxOutlined(g, x - 8, 200, 38, 16, '#272E26', INK, 2);
    // a bundle of dockets nailed to the post at head height
    g.fillStyle = PAPER; g.fillRect(x + 24, 96, 12, 16);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 24, 108, 12, 4);
    g.fillStyle = WAX; g.fillRect(x + 28, 94, 5, 5);
  }
}

export function create(section) {
  const mid = layerSpace(section, PARALLAX.mid);
  const near = layerSpace(section, PARALLAX.near);
  const farL = makeLayer(FAR_W, SKY_H, paintFar, 91);
  const midL = makeLayer(mid.width, SKY_H, paintMid, 92);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, paintFloor, 93);
  const nearL = makeLayer(near.width, 230, paintNear, 94);
  const lampGlow = makeGlowSprite(54, 'rgba(255,224,150,0.20)', 'rgba(255,214,130,0.10)');
  const kilnGlow = makeGlowSprite(70, 'rgba(216,255,110,0.20)');

  const motes = makePool(MOTE_N);
  for (let i = 0; i < MOTE_N; i++) { motes.x[i] = (i * 79) % VIEW_W; motes.y[i] = (i * 53) % 300; motes.vx[i] = 0.10 + (i % 5) * 0.04; motes.vy[i] = -0.05 - (i % 3) * 0.03; motes.seed[i] = i % 4; }
  let f = 0;

  return {
    update(frame) {
      f = frame | 0;
      for (let i = 0; i < MOTE_N; i++) {
        motes.x[i] += motes.vx[i]; motes.y[i] += motes.vy[i] + Math.sin((f + i * 17) * 0.02) * 0.07;
        if (motes.x[i] > VIEW_W + 4) motes.x[i] -= VIEW_W + 8;
        if (motes.y[i] < -4) motes.y[i] += 300;
      }
    },
    drawBack(ctx, cam, frame) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      const farOrigin = Math.round(-cam.x * PARALLAX.far + shx);
      blitTiled(ctx, farL, farOrigin, -BLEED + sy);
      // the lamps: warm pools on the wall, breathing on a long cycle so the room is lit rather than animated
      const k = 0.7 + 0.3 * pulse(frame, 240);
      ctx.globalAlpha = k;
      for (const lx of LAMPS) {
        const ox = ((farOrigin + lx) % FAR_W + FAR_W) % FAR_W;
        for (let x = ox - FAR_W; x < VIEW_W + 60; x += FAR_W) if (x > -60) ctx.drawImage(lampGlow.canvas, x - 54, 40 - 54 + sy);
      }
      // the kiln at the end of the room, on its own slower breath
      const kk = 0.6 + 0.4 * pulse(frame, 150);
      ctx.globalAlpha = kk;
      const kx = ((farOrigin + FAR_W - 102) % FAR_W + FAR_W) % FAR_W;
      for (let x = kx - FAR_W; x < VIEW_W + 70; x += FAR_W) if (x > -70) ctx.drawImage(kilnGlow.canvas, x - 70, 156 - 70 + sy);
      ctx.globalAlpha = 1;
      blitAt(ctx, midL, mid.originX(cam), -BLEED + sy);
      blitTiled(ctx, floorL, Math.round(-cam.x + shx), FLOOR_TOP + sy);
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam) {
      const sy = cam.shakeY || 0;
      blitAt(ctx, nearL, near.originX(cam), NEAR_Y + sy);
      // paper dust turning in the lamp light: the only thing in this room that is not being counted
      for (let i = 0; i < MOTE_N; i++) {
        ctx.fillStyle = motes.seed[i] ? 'rgba(230,222,196,0.16)' : 'rgba(255,236,190,0.26)';
        const s = 1 + (motes.seed[i] & 1);
        ctx.fillRect(Math.round(motes.x[i]), Math.round(motes.y[i]), s, s);
      }
    },
  };
}
