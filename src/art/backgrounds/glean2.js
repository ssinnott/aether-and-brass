// Stage 4, section 2: THE LASH-UP (docs/STAGE4.md section 5). The guild's float: a raft of other people's wrecks
// lashed together and hung over the tailings on forty bladders, with the crop coming up onto it on lines.
// Far (0.2): the same rose dusk seen from higher up, the field a long way below through the haze, and the crop loft
//            — the biggest bag the guild owns — standing off the end of the float.
// Mid (0.5): the float's own mast of bladders on their rigging, the lashed wreck sections it is built out of, the
//            windlasses that bring the crop up, and bales climbing the lines.
// Floor: mismatched decking over hull plate, rope lashings, and the gaps where the field shows through.
// Near (1.2, drawFront): the lashings themselves at the top of the frame; gas motes rising.
//
// Two sections share this backdrop (stage4.js g2 THE LASH-UP and g3 THE PRESS) and createBackdrop is called per section:
// - THE LASH-UP is the locked screen and it carries `drift` (px/frame): the raft is under way, so the far layer — the
//   field a long way below and the loft off the end of the float — scrolls itself by `drift` every frame (frame-based,
//   deterministic, the storm3.js / works2.js pattern; the far layer tiles, so the drift is one extra term in its origin).
//   The mid layer is the float's own mast of bladders and the wrecks it is built from, so it stays put: it is the raft.
// - A section with a `rails` zone has no bulwark: the floor's first and last rows are painted as EDGE — rope, then
//   nothing, then the field a long way down — rather than as a wall. What you can throw somebody off has to look like it.
//   THE PRESS has no rails (the Reeve's arena is decked in), so it gets a low hull-plate bulwark on those rows instead.
import {
  VIEW_W, FLOOR_TOP, Z_MAX, PARALLAX, BLEED, SKY_H, FLOOR_H, INK,
  makeLayer, blitTiled, blitAt, layerSpace, drawDarkBand, vGradient, radialGlow, makeGlowSprite,
  boxOutlined, rivets, makePool,
} from './common.js';
import { pathPoly, paint } from '../shapes.js';

const FAR_W = 1280;
const FLOOR_TILE = 480;
const MOTE_N = 30;
const NEAR_Y = 4;
const MAST_STEP = 320;

const SKY_TOP = '#221830', SKY_MID = '#472C4A', SKY_ROSE = '#A05F70', DUSK = '#EFA077';
const FIELD = '#3A4240', FIELD_D = '#2C3432';
const HULL = '#4A5058', HULL_D = '#343A42', PLANK = '#586257', PLANK_D = '#454E45', PLANK_HI = '#6B7568';
const ROPE = '#6E6942', SILK = '#9CC4D6', ROSE = '#FF57B0', HEMP = '#9C893F', IRON = '#4A4E56';

function paintFar(g, w, h, rnd) {
  g.translate(0, BLEED);
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED, [[0, SKY_TOP], [0.36, SKY_MID], [0.72, SKY_ROSE], [1, DUSK]]);
  g.fillStyle = DUSK; g.fillRect(0, FLOOR_TOP, w, BLEED);
  radialGlow(g, 240, 190, 150, 'rgba(255,150,110,0.26)');
  // thin cloud, all of it below the eye line now: you are above the weather that is left
  for (let i = 0; i < 18; i++) {
    const x = rnd() * w, y = 96 + rnd() * 70, ww = 70 + rnd() * 180;
    g.fillStyle = `rgba(255,190,150,${0.07 + rnd() * 0.10})`;
    g.fillRect(Math.round(x), Math.round(y), Math.round(ww), 3 + Math.round(rnd() * 4));
  }
  // the field, a long way down: the heaps as a flat pattern with the gas sitting in the hollows
  g.fillStyle = FIELD_D; g.fillRect(0, 170, w, FLOOR_TOP - 170 + BLEED);
  for (let x = -30; x < w + 30; x += 64) {
    const bx = x + Math.round(rnd() * 24), bh = 6 + Math.round(rnd() * 8);
    g.fillStyle = FIELD;
    g.beginPath(); g.ellipse(bx, 182, 30, bh, 0, Math.PI, 0); g.fill();
    if (rnd() < 0.4) { g.fillStyle = 'rgba(255,87,176,0.12)'; g.beginPath(); g.ellipse(bx + 20, 183, 14, 5, 0, Math.PI, 0); g.fill(); }
  }
  g.fillStyle = 'rgba(60,40,60,0.5)'; g.fillRect(0, 168, w, 10);
  // THE CROP LOFT, off the end of the float: the biggest bag in the guild, lit rose from the inside
  const lx = 940;
  g.fillStyle = '#171426';
  g.beginPath(); g.ellipse(lx, 96, 140, 62, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = SILK;
  g.beginPath(); g.ellipse(lx, 96, 136, 58, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,87,176,0.22)';
  g.beginPath(); g.ellipse(lx, 108, 108, 38, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.20)';
  for (let i = -3; i <= 3; i++) g.fillRect(lx + i * 34 - 1, 40, 2, 112);   // the ribs
  g.fillStyle = 'rgba(0,0,0,0.24)'; g.fillRect(lx - 130, 140, 260, 4);
  // its own gondola, hanging under it, which is where you are going
  boxOutlined(g, lx - 46, 152, 92, 22, '#3A3F49', INK, 2);
  g.fillStyle = ROSE;
  for (let i = 0; i < 5; i++) if (((i * 3) % 4) !== 0) g.fillRect(lx - 36 + i * 18, 158, 5, 4);
}
function paintMid(g, w, h, rnd) {
  g.translate(0, BLEED);
  // the float's own bladders: a mast of them over the deck on rigging, all the way along
  for (let x = 0; x < w; x += MAST_STEP) {
    const mx = x + 70;
    for (let k = 0; k < 3; k++) {
      const bx = mx + k * 62 - 40, by = 30 + ((k * 17) % 22), r = 22 + ((k * 7) % 9);
      g.fillStyle = '#171426';
      g.beginPath(); g.ellipse(bx, by, r + 2, r * 0.74 + 2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = SILK;
      g.beginPath(); g.ellipse(bx, by, r, r * 0.74, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,87,176,0.24)';
      g.beginPath(); g.ellipse(bx, by + r * 0.2, r * 0.6, r * 0.4, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(20,16,32,0.8)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(bx - r * 0.5, by + r * 0.7); g.lineTo(bx - 6, 186); g.moveTo(bx + r * 0.5, by + r * 0.7); g.lineTo(bx + 8, 186); g.stroke();
    }
    // the windlass that brings the crop up, bolted through whatever it is standing on
    boxOutlined(g, mx + 120, 168, 30, 24, IRON, INK, 2);
    g.fillStyle = '#5C6675'; g.fillRect(mx + 124, 172, 22, 6);
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(mx + 135, 182, 7, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = HEMP; g.lineWidth = 1.5; g.beginPath(); g.arc(mx + 135, 182, 7, 0, Math.PI * 2); g.stroke();
    // its line, going over the side with a bale on the way up
    g.strokeStyle = 'rgba(20,16,32,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(mx + 135, 190); g.lineTo(mx + 150, 260); g.stroke();
    boxOutlined(g, mx + 138, 214, 24, 15, HEMP, INK, 2);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(mx + 138, 224, 24, 5);
  }
  // the wreck sections the float is built out of, standing along the back of the deck
  for (let x = 20; x < w; x += 208) {
    const wx = x + Math.round(rnd() * 30), pick = Math.floor(rnd() * 3);
    if (pick === 0) {          // a Concordat hull plate, riveted, with the regiment stripe still on it
      boxOutlined(g, wx, 150, 76, 46, HULL, INK, 2);
      g.fillStyle = HULL_D; g.fillRect(wx + 2, 152, 72, 8);
      g.fillStyle = '#7A4A2E'; g.fillRect(wx + 6, 168, 64, 4);
      rivets(g, wx + 6, 158, wx + 70, 12, '#8A93A3', 'rgba(0,0,0,0.5)');
    } else if (pick === 1) {   // half a Wing gunboat, ribs out
      pathPoly(g, [wx, 196, wx + 8, 154, wx + 70, 148, wx + 84, 196]);
      paint(g, HULL_D, INK, 2);
      g.strokeStyle = '#5C6675'; g.lineWidth = 2;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(wx + 12 + k * 14, 152); g.lineTo(wx + 16 + k * 14, 194); g.stroke(); }
    } else {                   // a kiln drum off the last board, lashed down and used as a bollard
      boxOutlined(g, wx, 164, 44, 32, '#394249', INK, 2);
      g.fillStyle = '#2B3138'; g.fillRect(wx + 3, 170, 38, 3); g.fillRect(wx + 3, 186, 38, 3);
      g.strokeStyle = ROPE; g.lineWidth = 3;
      g.beginPath(); g.moveTo(wx - 4, 176); g.lineTo(wx + 48, 180); g.stroke();
    }
  }
}
/** `open`: the deck edges are open air (a `rails` section); otherwise a low bulwark of hull plate runs along them. */
function paintFloor(g, w, h, rnd, open = true) {
  // decking off six different ships: planks of three lengths, laid across hull plate, none of it matching
  g.fillStyle = HULL_D; g.fillRect(0, 0, w, h);
  for (let y = 12; y < Z_MAX - 12; y += 13) {
    for (let x = 0; x < w; x += 1) {
      const seg = 40 + ((x / 40 | 0) % 3) * 22;
      g.fillStyle = ((x / seg | 0) + (y / 13 | 0)) & 1 ? PLANK : PLANK_D;
      g.fillRect(x, y, seg, 12);
      x += seg - 1;
    }
  }
  for (let y = 12; y < Z_MAX - 12; y += 13) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, y + 11, w, 2); }
  // Rope lashings across the deck: this raft is TIED together, not built. Every 240px and dimmed, not every 120 at
  // full hemp — four bright vertical bars a screen is a picket fence laid on the floor the fight happens on, and the
  // floor of a beat-em-up is the one surface that has to stay quiet (works1's road ruts are the same argument).
  for (let x = 60; x < w; x += 240) {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 1, 12, 5, Z_MAX - 24);
    g.fillStyle = 'rgba(110,105,66,0.55)'; g.fillRect(x, 12, 5, Z_MAX - 24);
    for (let y = 18; y < Z_MAX - 16; y += 22) { g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(x - 2, y, 9, 3); }
  }
  // the gaps: where two wrecks did not meet, the field shows through a long way down
  for (let i = 0; i < 7; i++) {
    const x = Math.round(rnd() * w), y = 30 + Math.round(rnd() * (Z_MAX - 70)), ww = 16 + Math.round(rnd() * 30);
    g.fillStyle = '#14121E'; g.fillRect(x, y, ww, 7);
    g.fillStyle = 'rgba(255,87,176,0.14)'; g.fillRect(x + 2, y + 2, ww - 4, 3);
  }
  if (open) {
    // THE OPEN EDGES. Front and back are rope, then air: stage4 gives the raft a `rails` zone and a ring-out has
    // to be legible before somebody goes over it.
    g.fillStyle = INK; g.fillRect(0, 0, w, 4);
    g.fillStyle = ROPE; g.fillRect(0, 4, w, 3);
    for (let x = 0; x < w; x += 44) { g.fillStyle = IRON; g.fillRect(x, 0, 5, 10); }
    g.fillStyle = ROPE; g.fillRect(0, Z_MAX - 7, w, 3);
    g.fillStyle = INK; g.fillRect(0, Z_MAX - 4, w, 4);
    for (let x = 22; x < w; x += 44) { g.fillStyle = IRON; g.fillRect(x, Z_MAX - 10, 5, 10); }
  } else {
    // DECKED IN (the press end): a low bulwark of riveted hull plate along both edges, lashed down like everything else here
    g.fillStyle = INK; g.fillRect(0, 0, w, 11); g.fillRect(0, Z_MAX - 11, w, 11);
    g.fillStyle = HULL; g.fillRect(0, 2, w, 7); g.fillRect(0, Z_MAX - 9, w, 7);
    g.fillStyle = HULL_D; g.fillRect(0, 2, w, 2); g.fillRect(0, Z_MAX - 4, w, 2);
    for (let x = 10; x < w; x += 22) { g.fillStyle = '#8A93A3'; g.fillRect(x, 4, 2, 2); g.fillRect(x, Z_MAX - 7, 2, 2); }
    for (let x = 60; x < w; x += 240) { g.fillStyle = ROPE; g.fillRect(x, 0, 5, 11); g.fillRect(x, Z_MAX - 11, 5, 11); }
  }
  // scuffs, tar and old rope marks
  for (let i = 0; i < 30; i++) {
    g.fillStyle = rnd() < 0.6 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)';
    g.fillRect(Math.round(rnd() * w), 14 + Math.round(rnd() * (Z_MAX - 30)), 8 + Math.round(rnd() * 26), 1 + Math.round(rnd() * 2));
  }
  g.fillStyle = '#0E0C16'; g.fillRect(0, Z_MAX, w, h - Z_MAX);
}
function paintNear(g, w, h, rnd) {
  // the lashings that hold the float to its bladders, crossing the TOP of the frame — nothing at fighter height
  for (let x = 0; x < w; x += 240) {
    const nx = x + Math.round(rnd() * 30);
    g.strokeStyle = INK; g.lineWidth = 5;
    g.beginPath(); g.moveTo(nx - 70, 26); g.lineTo(nx + 30, 0); g.stroke();
    g.strokeStyle = ROPE; g.lineWidth = 3;
    g.beginPath(); g.moveTo(nx - 70, 26); g.lineTo(nx + 30, 0); g.stroke();
    // a thimble and a claim tag on the line
    g.fillStyle = IRON; g.fillRect(nx - 28, 8, 7, 7);
    g.fillStyle = HEMP; g.fillRect(nx - 20, 12, 9, 6);
  }
}

export function create(section) {
  /** Under way (see the header): the far layer auto-scrolls this many px per frame; 0 on the scrolling press end. */
  const drift = Number(section.drift) || 0;
  /** Open edges (a `rails` section) or a decked-in bulwark (the press, which holds the Reeve's arena). */
  const open = (section.zones || []).some((z) => z.type === 'rails');
  const mid = layerSpace(section, PARALLAX.mid);
  const near = layerSpace(section, PARALLAX.near);
  const farL = makeLayer(FAR_W, SKY_H, paintFar, 85);
  const midL = makeLayer(mid.width, SKY_H, paintMid, 86);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, (g, w, h, rnd) => paintFloor(g, w, h, rnd, open), 87);
  const nearL = makeLayer(near.width, 36, paintNear, 88);
  const loftGlow = makeGlowSprite(60, 'rgba(255,87,176,0.16)');

  const motes = makePool(MOTE_N);
  for (let i = 0; i < MOTE_N; i++) { motes.x[i] = (i * 73) % VIEW_W; motes.y[i] = 210 + (i * 47) % 130; motes.vy[i] = -0.3 - (i % 4) * 0.07; motes.seed[i] = i % 3; }
  let f = 0;

  return {
    update(frame) {
      f = frame | 0;
      for (let i = 0; i < MOTE_N; i++) {
        motes.y[i] += motes.vy[i];
        motes.x[i] += Math.sin((f + i * 31) * 0.024) * 0.2;
        if (motes.y[i] < 140) { motes.y[i] = 342; motes.x[i] = (i * 73 + f) % VIEW_W; }
      }
    },
    drawBack(ctx, cam) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      // the far layer tiles, so the raft's drift is one extra term in its origin (it wraps for free); f is the fixed-step frame
      const farOrigin = Math.round(-cam.x * PARALLAX.far - f * drift + shx);
      blitTiled(ctx, farL, farOrigin, -BLEED + sy);
      // the loft burns rose through the haze: the thing at the end of the board, visible from the whole of it
      const loftX = ((farOrigin + 940) % FAR_W + FAR_W) % FAR_W;
      for (let x = loftX - FAR_W; x < VIEW_W + 60; x += FAR_W) if (x > -60) ctx.drawImage(loftGlow.canvas, x - 60, 104 - 60 + sy);
      blitAt(ctx, midL, mid.originX(cam), -BLEED + sy);
      blitTiled(ctx, floorL, Math.round(-cam.x + shx), FLOOR_TOP + sy);
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam) {
      const sy = cam.shakeY || 0;
      blitAt(ctx, nearL, near.originX(cam), NEAR_Y + sy);
      for (let i = 0; i < MOTE_N; i++) {
        ctx.fillStyle = motes.seed[i] ? 'rgba(255,87,176,0.28)' : 'rgba(255,210,122,0.20)';
        const s = 1 + (motes.seed[i] & 1);
        ctx.fillRect(Math.round(motes.x[i]), Math.round(motes.y[i]), s, s + 1);
      }
    },
  };
}
