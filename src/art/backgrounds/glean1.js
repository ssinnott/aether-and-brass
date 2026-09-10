// Stage 4, section 1: THE TAILINGS (docs/STAGE4.md section 5). The spoil field west of Calderwick at dusk, where the
// city has poured its slag for a century and where the gas that fills a salvage bladder comes up out of the heaps on
// its own.
// Far (0.2): a rose dusk (violet -> gas rose -> tailings amber at the horizon), Calderwick behind and cold, the
//            spoil ridge, and the guild's bladders drifting over all of it on their lines.
// Mid (0.5): spoil heaps venting rose, half-buried wrecks off all three boards, salvage lines going up out of the
//            field with bales already on them, and the guild's pole lamps.
// Floor: cold clinker and ash over old tramway rail, with gas seams glowing faintly in the cracks.
// Near (1.2, drawFront): a loaded net crossing the top of the frame on its line; gas motes drifting UP.
//
// THE SKY IS WARM AND THE GROUND IS COLD, which is the opposite of every other board in the game and is measured,
// not decorative: this faction is violet cloth, hemp and PALE BLUE SILK, and the silk is the biggest mass on every
// rig. Pale blue on an amber sky separates on hue and value at once; violet cloth on a cold green-grey field does
// the same thing at the other end of the ladder. Warm ground is the one thing that would sink both.
import {
  VIEW_W, FLOOR_TOP, Z_MAX, PARALLAX, BLEED, SKY_H, FLOOR_H, INK,
  makeLayer, blitTiled, blitAt, layerSpace, drawDarkBand, vGradient, radialGlow, makeGlowSprite,
  boxOutlined, rivets, makePool, skyline,
} from './common.js';
import { pathPoly, paint } from '../shapes.js';

const FAR_W = 1280;
const FLOOR_TILE = 480;
const MOTE_N = 34;
const NEAR_Y = 8;
/** Far-layer x of the three drifting bladders (they are pre-rendered nowhere: they move every frame). */
const BAGS = [{ x: 180, y: 58, r: 15, vx: 0.06 }, { x: 640, y: 96, r: 10, vx: -0.045 }, { x: 1010, y: 44, r: 19, vx: 0.035 }];

const SKY_TOP = '#241A34', SKY_MID = '#4A2F4E', SKY_ROSE = '#9A5A6E', DUSK = '#E8956A';
const CITY = '#241E38', CITY_D = '#191430';
const SPOIL = '#5A6058', SPOIL_D = '#414A46', SPOIL_HI = '#727A6C';
const ASH = '#4E5A55', ASH_D = '#3C4642', CLINKER = '#333B38', RAIL = '#4A4E56';
const ROPE = '#6E6942', SILK = '#9CC4D6', ROSE = '#FF57B0', HEMP = '#9C893F';

function paintFar(g, w, h, rnd) {
  g.translate(0, BLEED);
  // the last light: violet overhead, gas rose across the middle, tailings amber sitting on the field
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED, [[0, SKY_TOP], [0.38, SKY_MID], [0.74, SKY_ROSE], [1, DUSK]]);
  g.fillStyle = DUSK; g.fillRect(0, FLOOR_TOP, w, BLEED);
  // the sun already down: the glow is coming off the field, not out of the sky
  radialGlow(g, 300, 200, 150, 'rgba(255,150,110,0.28)');
  // flat cloud, lit underneath — the only warm marks above the horizon
  for (let i = 0; i < 20; i++) {
    const x = rnd() * w, y = 24 + rnd() * 96, ww = 60 + rnd() * 160, hh = 3 + rnd() * 5;
    g.fillStyle = `rgba(255,190,150,${0.08 + rnd() * 0.12})`;
    g.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh));
  }
  // Calderwick, a week behind you and cold: the mountain city as a flat dark silhouette with nothing lit in it
  pathPoly(g, [700, 196, 790, 128, 870, 98, 940, 96, 1010, 122, 1110, 196]);
  paint(g, CITY, null);
  skyline(g, 760, 1070, 196, 10, 28, rnd, CITY_D, { minW: 14, maxW: 32, chimneys: 0.5 });
  g.fillStyle = CITY_D; g.fillRect(908, 82, 24, 16); g.fillRect(916, 70, 9, 12);
  // the spoil ridge: the far edge of the field, a low sawtooth that never gets bright
  for (let x = -20; x < w + 40; x += 78) {
    const bx = x + Math.round(rnd() * 30), bh = 20 + Math.round(rnd() * 22);
    pathPoly(g, [bx - 54, 200, bx, 200 - bh, bx + 58, 200]);
    paint(g, '#33323E', null);
  }
  g.fillStyle = '#2E2C3A'; g.fillRect(0, 198, w, FLOOR_TOP - 198 + BLEED);
}
/** One drifting bladder: silk bulb, gas inside it, a hemp line and whatever is hanging on the end of the line. */
function drawBag(ctx, sx, sy, r, f) {
  ctx.fillStyle = '#171426';
  ctx.beginPath(); ctx.ellipse(sx, sy, r + 2, r * 0.78 + 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SILK;
  ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,87,176,0.30)';
  ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.2, r * 0.66, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(Math.round(sx - r + 2), Math.round(sy + r * 0.5), Math.round(r * 2 - 4), 2);
  // the line, and the load on it
  ctx.strokeStyle = 'rgba(20,16,32,0.85)'; ctx.lineWidth = 1;
  const len = r * 1.9;
  ctx.beginPath(); ctx.moveTo(sx, sy + r * 0.78); ctx.lineTo(sx + 1, sy + r * 0.78 + len); ctx.stroke();
  ctx.fillStyle = HEMP; ctx.fillRect(Math.round(sx - 4), Math.round(sy + r * 0.78 + len), 9, 5);
  if ((f >> 6) & 1) { ctx.fillStyle = ROSE; ctx.fillRect(Math.round(sx - 1), Math.round(sy - r * 0.4), 2, 2); }
}
function paintMid(g, w, h, rnd) {
  g.translate(0, BLEED);
  // the heaps: rounded slag banks, darkest where they meet the field, with the gas seeping off their crowns
  for (let x = -40; x < w + 40; x += 156) {
    const bx = x + Math.round(rnd() * 40), bh = 30 + Math.round(rnd() * 30), bw = 100 + Math.round(rnd() * 60);
    g.fillStyle = SPOIL_D;
    g.beginPath(); g.ellipse(bx, 202, bw / 2, bh * 0.6, 0, Math.PI, 0); g.fill();
    g.fillStyle = SPOIL;
    g.beginPath(); g.ellipse(bx, 199, bw / 2 - 5, bh * 0.54, 0, Math.PI, 0); g.fill();
    g.fillStyle = SPOIL_HI;
    g.beginPath(); g.ellipse(bx - bw * 0.15, 197, bw * 0.2, bh * 0.24, 0, Math.PI, 0); g.fill();
    // the seep: a soft rose wash sitting in the hollow on the lee side of every heap
    g.fillStyle = 'rgba(255,87,176,0.10)';
    g.beginPath(); g.ellipse(bx + bw * 0.4, 200, 26, 12, 0, Math.PI, 0); g.fill();
  }
  // half-buried wrecks: one off each of the first three boards, in the order you broke them
  for (let x = 40; x < w; x += 372) {
    const wx = x + Math.round(rnd() * 40), pick = Math.floor(rnd() * 3);
    if (pick === 0) {          // a Brassbound torso plate, chest already cut out of it
      boxOutlined(g, wx, 176, 34, 24, '#5A5348', INK, 2);
      g.fillStyle = '#2A2620'; g.fillRect(wx + 10, 182, 15, 13);
      rivets(g, wx + 4, 180, wx + 30, 9, '#8A7A5A', 'rgba(0,0,0,0.45)');
    } else if (pick === 1) {   // a Wing gun barrel, standing out of the slag at the angle it landed
      g.save(); g.translate(wx + 20, 198); g.rotate(-0.5);
      boxOutlined(g, -6, -44, 12, 46, '#3E4654', INK, 2);
      g.fillStyle = '#5C6675'; g.fillRect(-4, -42, 4, 42);
      g.restore();
    } else {                   // a Chandlery kiln drum, on its side and long cold
      boxOutlined(g, wx, 178, 40, 22, '#394249', INK, 2);
      g.fillStyle = '#2B3138'; g.fillRect(wx + 3, 182, 34, 3); g.fillRect(wx + 3, 192, 34, 3);
      g.fillStyle = '#20262C'; g.fillRect(wx + 14, 184, 12, 10);
    }
  }
  // the salvage lines: hemp going up out of the field, with a bale already climbing each one
  for (let x = 110; x < w; x += 260) {
    g.strokeStyle = 'rgba(20,16,32,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, 200); g.lineTo(x - 16, 0); g.stroke();
    g.strokeStyle = ROPE; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, 200); g.lineTo(x - 16, 0); g.stroke();
    const by = 60 + Math.round(rnd() * 90), bx = x - Math.round((200 - by) * 0.08);
    boxOutlined(g, bx - 11, by, 22, 13, HEMP, INK, 2);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx - 11, by + 9, 22, 4);
    g.fillStyle = '#4A4E56'; g.fillRect(bx - 3, by - 4, 6, 5);
  }
  // the guild's pole lamps: rose glass on a bent pole, the only light anybody out here has bothered to hang
  for (let x = 200; x < w; x += 336) {
    g.fillStyle = RAIL; g.fillRect(x, 126, 4, 76);
    g.fillStyle = RAIL; g.fillRect(x, 126, 16, 4);
    boxOutlined(g, x + 10, 128, 14, 13, '#2E2A3A', INK, 2);
    g.fillStyle = ROSE; g.fillRect(x + 13, 131, 9, 7);
    g.fillStyle = 'rgba(255,87,176,0.16)'; g.fillRect(x + 2, 122, 30, 24);
  }
}
function paintFloor(g, w, h, rnd) {
  // cold clinker and ash: a green-grey field, dark enough that violet cloth and hemp both read standing on it
  g.fillStyle = ASH; g.fillRect(0, 0, w, h);
  g.fillStyle = ASH_D; g.fillRect(0, 0, w, 12);
  // old tramway rail, still running out to the heaps under the ash
  for (const y of [44, 94]) {
    g.fillStyle = CLINKER; g.fillRect(0, y, w, 12);
    g.fillStyle = RAIL; g.fillRect(0, y + 1, w, 2); g.fillRect(0, y + 9, w, 2);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y + 11, w, 2);
    for (let x = 0; x < w; x += 40) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, y - 3, 22, 3); }
  }
  // gas seams: thin rose cracks in the ash, never on the rail lines where a fighter's feet have to read
  for (let i = 0; i < 22; i++) {
    const y = 16 + Math.round(rnd() * (Z_MAX - 32));
    if ((y > 40 && y < 60) || (y > 90 && y < 110)) continue;
    const x = Math.round(rnd() * w), ww = 10 + Math.round(rnd() * 30);
    g.fillStyle = 'rgba(255,87,176,0.16)'; g.fillRect(x, y, ww, 2);
    g.fillStyle = 'rgba(255,87,176,0.30)'; g.fillRect(x + 3, y, Math.round(ww * 0.4), 1);
  }
  // clinker: dark grit and the odd pale bone of quicklime the last board left out here
  for (let i = 0; i < 90; i++) {
    const y = 16 + Math.round(rnd() * (Z_MAX - 30));
    if ((y > 42 && y < 58) || (y > 92 && y < 108)) continue;
    g.fillStyle = rnd() < 0.7 ? 'rgba(0,0,0,0.22)' : 'rgba(214,220,206,0.16)';
    g.fillRect(Math.round(rnd() * w), y, 2 + Math.round(rnd() * 3), 2);
  }
  g.fillStyle = INK; g.fillRect(0, 0, w, 3);
  g.fillStyle = '#0E0C16'; g.fillRect(0, Z_MAX, w, h - Z_MAX);
}
function paintNear(g, w, h, rnd) {
  // A LOADED NET ON A LINE, crossing the TOP of the frame every 300px. It is up there rather than at chest height
  // for the same reason the Lime Road's cart wheels are open: a solid near-layer mass at fighter height is a hole in
  // the arena you can lose a Chaff behind. Up here it is the board's own subject matter and it blocks nothing.
  for (let x = 0; x < w; x += 300) {
    const nx = x + Math.round(rnd() * 40);
    g.strokeStyle = INK; g.lineWidth = 4;
    g.beginPath(); g.moveTo(nx - 60, 0); g.lineTo(nx + 60, 16); g.stroke();
    g.strokeStyle = ROPE; g.lineWidth = 2;
    g.beginPath(); g.moveTo(nx - 60, 0); g.lineTo(nx + 60, 16); g.stroke();
    // the net itself, hanging under the line with somebody's plate in it
    boxOutlined(g, nx - 16, 10, 34, 22, HEMP, INK, 2);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(nx - 16 + k * 8, 10); g.lineTo(nx - 16 + k * 8, 32); g.stroke(); }
    g.fillStyle = '#5A5348'; g.fillRect(nx - 10, 16, 22, 10);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(nx - 16, 28, 34, 4);
  }
}

export function create(section) {
  const mid = layerSpace(section, PARALLAX.mid);
  const near = layerSpace(section, PARALLAX.near);
  const farL = makeLayer(FAR_W, SKY_H, paintFar, 81);
  const midL = makeLayer(mid.width, SKY_H, paintMid, 82);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, paintFloor, 83);
  const nearL = makeLayer(near.width, 40, paintNear, 84);
  const lampGlow = makeGlowSprite(24, 'rgba(255,87,176,0.20)');

  const bags = BAGS.map((b) => ({ ...b }));
  // gas motes: the one board where the near particles go UP, because the gas is what everything here runs on
  const motes = makePool(MOTE_N);
  for (let i = 0; i < MOTE_N; i++) { motes.x[i] = (i * 67) % VIEW_W; motes.y[i] = 220 + (i * 41) % 120; motes.vy[i] = -0.22 - (i % 5) * 0.06; motes.seed[i] = i % 3; }
  let f = 0;

  return {
    update(frame) {
      f = frame | 0;
      for (const b of bags) { b.x += b.vx; if (b.x > FAR_W + 60) b.x -= FAR_W + 120; if (b.x < -60) b.x += FAR_W + 120; }
      for (let i = 0; i < MOTE_N; i++) {
        motes.y[i] += motes.vy[i];
        motes.x[i] += Math.sin((f + i * 29) * 0.02) * 0.16;
        if (motes.y[i] < 150) { motes.y[i] = 342; motes.x[i] = (i * 67 + f) % VIEW_W; }
      }
    },
    drawBack(ctx, cam, frame) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      const farOrigin = Math.round(-cam.x * PARALLAX.far + shx);
      blitTiled(ctx, farL, farOrigin, -BLEED + sy);
      for (const b of bags) {
        const bob = Math.round(Math.sin((frame + b.x) * 0.014) * 3);
        const ox = ((farOrigin + Math.round(b.x)) % FAR_W + FAR_W) % FAR_W;
        for (let x = ox - FAR_W; x < VIEW_W + 60; x += FAR_W) if (x > -60) drawBag(ctx, x, b.y + bob + sy, b.r, f);
      }
      blitAt(ctx, midL, mid.originX(cam), -BLEED + sy);
      // the pole lamps burn through the mid layer (the board's one saturated colour)
      const midOrigin = mid.originX(cam);
      for (let lx = 200; lx < mid.width; lx += 336) {
        const x = midOrigin + lx;
        if (x < -40 || x > VIEW_W + 40) continue;
        ctx.drawImage(lampGlow.canvas, x + 17 - 24, 135 - 24 + sy);
      }
      blitTiled(ctx, floorL, Math.round(-cam.x + shx), FLOOR_TOP + sy);
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam) {
      const sy = cam.shakeY || 0;
      blitAt(ctx, nearL, near.originX(cam), NEAR_Y + sy);
      // tailings gas, rising: flat rose, never white, and always in front
      for (let i = 0; i < MOTE_N; i++) {
        ctx.fillStyle = motes.seed[i] ? 'rgba(255,87,176,0.26)' : 'rgba(255,210,122,0.22)';
        const s = 1 + (motes.seed[i] & 1);
        ctx.fillRect(Math.round(motes.x[i]), Math.round(motes.y[i]), s, s + 1);
      }
    },
  };
}
