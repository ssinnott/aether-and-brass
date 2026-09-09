// Stage 3, section 2: THE TALLOW WORKS (docs/STAGE3.md section 5). The Chandlery's chartered yard: tallow vats under
// gantries, the draw-kilns, cart lanes burnt into the ground and a weighbridge at the far end of it.
// Far (0.2): the works' long roof filling the sky, four kiln chimneys drawing smoke, and the company's hoarding.
// Mid (0.5): tallow vats on their gantries with condensate steam, stacked handcarts, the tally boards, pole lamps.
// Floor: yard cobble with cart ruts, the company's chalk lane lines and quicklime spill.
// Near (1.2, drawFront): kiln flues and hanging tarpaulin at the screen edges; lime dust along the ground.
//
// Same value contract as the lime road: a v42 ground under a v88 sky, so the pale faction reads on the floor band
// and the one saturated colour anywhere in the section is the lime in the company's own glass.
import {
  VIEW_W, FLOOR_TOP, Z_MAX, PARALLAX, BLEED, SKY_H, FLOOR_H, INK,
  makeLayer, blitTiled, blitAt, layerSpace, drawDarkBand, vGradient, makeGlowSprite,
  boxOutlined, rivets, makePool, pulse,
} from './common.js';
import { pathPoly, paint } from '../shapes.js';

const FAR_W = 1100;
const FLOOR_TILE = 480;
const DUST_N = 26;
const NEAR_Y = 150;
/** Far-layer x of the yard's four kiln chimneys. */
const STACKS = [180, 300, 700, 820];

const SKY_TOP = '#B3B8AE', SKY_MID = '#CFCDBF', SKY_LOW = '#E4DECC';
const ROOF = '#6E6759', ROOF_D = '#565046', BRICK = '#7A6A56', BRICK_D = '#5E5344', STACK = '#635D52';
const VAT = '#8A8172', VAT_D = '#6B6357', IRON = '#4A4E56', WOOD = '#6A5334', TARP = '#B0AE96';
const CHALK = '#DAD5C0', LIME = '#CFC9B2', LAMP = '#D8FF6E', SEAL = '#8E2F38';
// same cool-ground rule as the lime road (see works1.js): the setts are a green-grey, not a warm one, so the pale
// warm faction fighting on them keeps its hue gap
const YARD = '#626B60', YARD_D = '#4E5A4E', SET = '#717A6D';

function paintFar(g, w, h, rnd) {
  g.translate(0, BLEED);
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED, [[0, SKY_TOP], [0.55, SKY_MID], [1, SKY_LOW]]);
  g.fillStyle = SKY_LOW; g.fillRect(0, FLOOR_TOP, w, BLEED);
  for (let i = 0; i < 16; i++) {
    const x = rnd() * w, y = 12 + rnd() * 70, ww = 60 + rnd() * 150;
    g.fillStyle = `rgba(255,255,250,${0.10 + rnd() * 0.12})`;
    g.fillRect(Math.round(x), Math.round(y), Math.round(ww), 3 + Math.round(rnd() * 4));
  }
  // the works: a long brick shed with a shallow roof, standing across the whole back of the yard
  g.fillStyle = BRICK; g.fillRect(0, 120, w, 82);
  g.fillStyle = BRICK_D; g.fillRect(0, 120, w, 8);
  pathPoly(g, [-10, 120, 60, 96, w - 60, 96, w + 10, 120]); paint(g, ROOF, null);
  g.fillStyle = ROOF_D; g.fillRect(0, 114, w, 7);
  // shed windows: small, high, and mostly shuttered — nobody in here is looking out
  for (let x = 24; x < w - 24; x += 62) {
    const shut = rnd() < 0.4;
    boxOutlined(g, x, 136, 26, 20, shut ? BRICK_D : '#B7B7A8', INK, 2);
    if (!shut) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 12, 136, 2, 20); g.fillRect(x, 145, 26, 2); }
  }
  // brick courses, kept faint: this wall is 82px of background and must not out-detail the cast
  g.fillStyle = 'rgba(0,0,0,0.10)';
  for (let y = 162; y < 202; y += 6) g.fillRect(0, y, w, 1);
  for (const sx of STACKS) {
    g.fillStyle = STACK; g.fillRect(sx - 6, 40, 13, 82);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(sx + 2, 40, 5, 82);
    g.fillStyle = ROOF_D; g.fillRect(sx - 8, 36, 17, 6);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(sx - 6, 74, 13, 3);
  }
  // the company's hoarding: a board with the Chandlery's wax seal on it, which is all the name it needs
  boxOutlined(g, 452, 128, 150, 56, '#4A4034', INK, 3);
  g.fillStyle = '#5A4E3E'; g.fillRect(456, 132, 142, 24);
  g.fillStyle = SEAL; g.beginPath(); g.arc(527, 156, 17, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#B0402E'; g.beginPath(); g.arc(527, 156, 12, 0, Math.PI * 2); g.fill();
  g.fillStyle = CHALK; g.fillRect(519, 149, 16, 3); g.fillRect(525, 149, 4, 15);
  g.fillStyle = WOOD; g.fillRect(468, 184, 6, 18); g.fillRect(580, 184, 6, 18);
}
function paintMid(g, w, h, rnd) {
  g.translate(0, BLEED);
  // tallow vats on their gantries: the biggest shapes in the yard, standing along the back
  for (let x = 40; x < w; x += 300) {
    const vx = x + Math.round(rnd() * 40);
    g.fillStyle = IRON; g.fillRect(vx - 6, 190, 6, 14); g.fillRect(vx + 52, 190, 6, 14);
    boxOutlined(g, vx, 134, 52, 60, VAT, INK, 2);
    g.fillStyle = VAT_D; g.fillRect(vx, 166, 52, 28);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(vx + 4, 138, 12, 26);
    for (const y of [142, 162, 182]) { g.fillStyle = IRON; g.fillRect(vx - 2, y, 56, 5); }
    rivets(g, vx + 2, 143, vx + 48, 10, '#9AA6A0', 'rgba(0,0,0,0.45)');
    // the draw tap and the tallow standing in the trough under it
    g.fillStyle = IRON; g.fillRect(vx + 22, 194, 8, 8);
    g.fillStyle = '#C29B4A'; g.fillRect(vx + 14, 200, 26, 4);
  }
  // stacked handcarts, tipped up on end against the shed wall — the fleet the Resurrection Men take out
  for (let x = 180; x < w; x += 300) {
    const cx = x + Math.round(rnd() * 30);
    boxOutlined(g, cx, 156, 26, 46, WOOD, INK, 2);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx + 2, 178, 22, 22);
    g.fillStyle = INK; g.beginPath(); g.arc(cx + 26, 190, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = IRON; g.beginPath(); g.arc(cx + 26, 190, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5E8072'; g.beginPath(); g.arc(cx + 26, 190, 3, 0, Math.PI * 2); g.fill();
  }
  // the tally boards: black boards ruled in chalk, and every line on them is a thing you are about to fight
  for (let x = 110; x < w; x += 300) {
    boxOutlined(g, x, 148, 64, 44, '#2E2E28', INK, 2);
    g.strokeStyle = 'rgba(218,213,192,0.75)'; g.lineWidth = 1;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x + 4, 155 + k * 8); g.lineTo(x + 60, 155 + k * 8); g.stroke(); }
    g.fillStyle = CHALK;
    for (let k = 0; k < 14; k++) { if (rnd() < 0.6) g.fillRect(x + 6 + (k % 7) * 8, 151 + Math.floor(k / 7) * 16, 2, 5); }
  }
  // pole lamps on the cart lanes
  for (let x = 250; x < w; x += 300) {
    g.fillStyle = IRON; g.fillRect(x, 128, 4, 74);
    boxOutlined(g, x - 6, 118, 16, 14, '#3E4A42', INK, 2);
    g.fillStyle = LAMP; g.fillRect(x - 3, 122, 10, 7);
  }
}
function paintFloor(g, w, h, rnd) {
  // yard cobble: setts laid in courses, worn pale where the carts run
  g.fillStyle = YARD; g.fillRect(0, 0, w, h);
  g.fillStyle = YARD_D; g.fillRect(0, 0, w, 10);
  for (let y = 10; y < Z_MAX; y += 11) {
    const row = ((y - 10) / 11) | 0;
    for (let x = (row & 1) * 8; x < w; x += 16) {
      g.fillStyle = rnd() < 0.3 ? SET : YARD_D;
      g.fillRect(x, y, 14, 9);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 10; y < Z_MAX; y += 11) g.fillRect(0, y + 9, w, 1);
  // the cart lanes: two worn strips with the company's chalk lines ruled down either side of them
  for (const y of [40, 96]) {
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, w, 16);
    g.fillStyle = 'rgba(207,201,178,0.35)'; g.fillRect(0, y + 4, w, 8);
    g.fillStyle = CHALK; g.fillRect(0, y - 2, w, 2); g.fillRect(0, y + 16, w, 2);
  }
  // quicklime spill, thickest at the kiln end of every lane
  for (let i = 0; i < 22; i++) {
    const x = Math.round(rnd() * w), y = 14 + Math.round(rnd() * (Z_MAX - 30));
    g.fillStyle = rnd() < 0.4 ? LIME : 'rgba(207,201,178,0.45)';
    g.fillRect(x, y, 10 + Math.round(rnd() * 34), 2 + Math.round(rnd() * 2));
  }
  g.fillStyle = INK; g.fillRect(0, 0, w, 3);
  g.fillStyle = '#12110E'; g.fillRect(0, Z_MAX, w, h - Z_MAX);
}
function paintNear(g, w, h, rnd) {
  // kiln flues crossing in front of the fight, with a tarpaulin corner hanging off every second one
  for (let x = 0; x < w; x += 380) {
    boxOutlined(g, x, 0, 14, 190, '#4A4034', INK, 2);
    g.fillStyle = '#5E5348'; g.fillRect(x + 3, 0, 5, 190);
    for (let y = 20; y < 180; y += 34) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x + 1, y + 1, 12, 4); g.fillStyle = IRON; g.fillRect(x + 1, y, 12, 4); }
    boxOutlined(g, x - 7, 176, 28, 14, '#4A4034', INK, 2);
    if ((x / 380) % 2 === 0) {
      pathPoly(g, [x + 18, 6, x + 62, 2, x + 54, 46, x + 18, 34]); paint(g, TARP, INK, 2);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 22, 20, 30, 12);
    }
  }
}

export function create(section) {
  const mid = layerSpace(section, PARALLAX.mid);
  const near = layerSpace(section, PARALLAX.near);
  const farL = makeLayer(FAR_W, SKY_H, paintFar, 81);
  const midL = makeLayer(mid.width, SKY_H, paintMid, 82);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, paintFloor, 83);
  const nearL = makeLayer(near.width, 200, paintNear, 84);
  const lampGlow = makeGlowSprite(20, 'rgba(216,255,110,0.24)');

  const PUFF_N = STACKS.length * 5;
  const puffs = makePool(PUFF_N);
  for (let i = 0; i < PUFF_N; i++) {
    puffs.x[i] = STACKS[i % STACKS.length];
    puffs.y[i] = 36 - (i % 5) * 7;
    puffs.vy[i] = -0.14 - (i % 3) * 0.03;
    puffs.seed[i] = i % 4;
  }
  const dust = makePool(DUST_N);
  for (let i = 0; i < DUST_N; i++) { dust.x[i] = (i * 67) % VIEW_W; dust.y[i] = 236 + (i * 41) % 100; dust.vx[i] = 0.4 + (i % 4) * 0.14; dust.seed[i] = i % 3; }
  let f = 0;

  return {
    update(frame) {
      f = frame | 0;
      for (let i = 0; i < PUFF_N; i++) {
        puffs.y[i] += puffs.vy[i];
        puffs.x[i] += Math.sin((f + i * 31) * 0.007) * 0.05;
        if (puffs.y[i] < 2) { puffs.y[i] = 38; puffs.x[i] = STACKS[i % STACKS.length]; }
      }
      for (let i = 0; i < DUST_N; i++) {
        dust.x[i] += dust.vx[i];
        dust.y[i] += Math.sin((f + i * 19) * 0.028) * 0.1;
        if (dust.x[i] > VIEW_W + 6) { dust.x[i] -= VIEW_W + 12; dust.y[i] = 236 + ((i * 47) % 100); }
      }
    },
    drawBack(ctx, cam, frame) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      const farOrigin = Math.round(-cam.x * PARALLAX.far + shx);
      blitTiled(ctx, farL, farOrigin, -BLEED + sy);
      for (let i = 0; i < PUFF_N; i++) {
        const r = 5 + puffs.seed[i] * 2, a = 0.32 * Math.max(0, (puffs.y[i] - 2) / 40);
        const ox = ((farOrigin + Math.round(puffs.x[i])) % FAR_W + FAR_W) % FAR_W;
        ctx.fillStyle = `rgba(242,240,230,${a.toFixed(3)})`;
        for (let x = ox - FAR_W; x < VIEW_W + 20; x += FAR_W) {
          if (x < -20) continue;
          ctx.beginPath(); ctx.arc(x, Math.round(puffs.y[i]) + sy, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      blitAt(ctx, midL, mid.originX(cam), -BLEED + sy);
      // vat condensate: a slow breath of steam off the tallow, on a long cycle so the yard feels worked, not busy
      const midOrigin = mid.originX(cam), k = 0.25 + 0.4 * pulse(frame, 210);
      ctx.globalAlpha = k;
      for (let vx = 40; vx < mid.width; vx += 300) {
        const x = midOrigin + vx + 26;
        if (x < -30 || x > VIEW_W + 30) continue;
        ctx.fillStyle = 'rgba(236,236,226,0.5)';
        ctx.beginPath(); ctx.ellipse(x, 128 + sy, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 8, 116 + sy, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (let lx = 250; lx < mid.width; lx += 300) {
        const x = midOrigin + lx;
        if (x < -40 || x > VIEW_W + 40) continue;
        ctx.drawImage(lampGlow.canvas, x - 20, 125 - 20 + sy);
      }
      blitTiled(ctx, floorL, Math.round(-cam.x + shx), FLOOR_TOP + sy);
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam) {
      const sy = cam.shakeY || 0;
      blitAt(ctx, nearL, near.originX(cam), NEAR_Y + sy);
      for (let i = 0; i < DUST_N; i++) {
        ctx.fillStyle = dust.seed[i] ? 'rgba(224,220,202,0.28)' : 'rgba(242,240,230,0.4)';
        const s = 1 + (dust.seed[i] & 1);
        ctx.fillRect(Math.round(dust.x[i]), Math.round(dust.y[i]), s + 1, s);
      }
    },
  };
}
