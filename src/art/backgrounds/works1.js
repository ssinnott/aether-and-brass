// Stage 3, section 1: THE LIME ROAD (docs/STAGE3.md section 5). The cart road up to the Chandlery's works, in the
// flattest light in the game — a chalk-white morning with no sun in it and no weather to hide behind.
// Far (0.2): a bone sky, Calderwick on its mountain far behind, the works' long roof and four chimneys ahead with
//            their smoke standing straight up, and a band of lime haze along the horizon.
// Mid (0.5): a lime shoulder with spoil banks, milestones, standing wagons and the company's pole lamps behind a
//            roadside fence. EVERYTHING IN THIS LAYER STANDS ON THE SHOULDER (MID_GROUND) and the fence crosses in
//            front of it, which is what keeps a parked wagon an object in the yard instead of a decal on the road.
// Floor: a rutted lime road over old rail — cart ruts, sleeper lines, spilled quicklime and gravel.
// Near (1.2, drawFront): cart shafts and a tarpaulin corner at the BOTTOM edge of the frame; lime dust along the ground.
//
// THE BOARD IS PALE AND SO IS THE FACTION, so the floor band is deliberately the DARKEST thing on screen apart from
// the ink: a grey lime road at HSV v42 under a v90 sky. Everything the Chandlery is made of — tallow v76, quicklime
// v90, the pale caps and aprons — reads against the ground it stands on, and the sky is only ever behind heads.
import {
  VIEW_W, FLOOR_TOP, Z_MAX, PARALLAX, BLEED, SKY_H, FLOOR_H, INK,
  makeLayer, blitTiled, blitAt, layerSpace, drawDarkBand, vGradient, makeGlowSprite,
  boxOutlined, rivets, makePool, skyline,
} from './common.js';
import { pathPoly, paint } from '../shapes.js';

const FAR_W = 1280;
const FLOOR_TILE = 480;
const DUST_N = 30;
/** Near layer origin: the front of the frame, so its props are cropped by the bottom of the screen (section1: 280). */
const NEAR_Y = 296;
/** Mid layer: the row everything in it stands on — the far edge of the road's lime shoulder. */
const MID_GROUND = 190;
/** Mid layer: where the shoulder meets the road (the floor band is blitted over everything below it). */
const MID_ROAD = 200;
/** Standing wagons: one every WAGON_STEP of shoulder, and the fence breaks where each one pulled off the road. */
const WAGON_STEP = 322, WAGON_X0 = 60;
/** Pole lamps, on their own rhythm so lamp and wagon never pair up into one repeating tile. */
const LAMP_X0 = 170, LAMP_STEP = 268;
/** Far-layer x of the four works chimneys (smoke is drawn per frame over the pre-rendered stacks). */
const STACKS = [880, 946, 1012, 1078];

const SKY_TOP = '#B7BCB2', SKY_MID = '#D3D1C3', SKY_LOW = '#E9E3D1', HAZE = '#EFEADA';
const CITY = '#9B978A', CITY_D = '#847F72', ROOF = '#7C7466', ROOF_D = '#655F53', STACK = '#6B6459';
const SPOIL = '#CFC6AE', SPOIL_D = '#A79E88', TARP = '#B0AE96', WOOD = '#6A5334', IRON = '#4A4E56';
// The road is COOL and the faction is warm, on purpose. Measured with tools/stage-values.js: at #6A675C the ground
// sat at hue 79 against a Chandlery mean of 85 — six degrees, which is no separation at all, and 31.6% of the
// faction's pixels measured LOST against it. Wet lime on stone is legitimately a green-grey, and walking the ground
// to hue ~120 buys the hue gap without touching the value ladder the section is built on (sky v79, floor v42).
const ROAD = '#616A5E', ROAD_D = '#4F564C', RUT = '#414741', LIME = '#CFC9B2', LIME_HI = '#E4DFC9';
const LAMP = '#D8FF6E';
/** What shows through the open part of a wagon wheel at mid distance: the haze standing behind it. */
const THROUGH = '#E7E1CE';

function paintFar(g, w, h, rnd) {
  g.translate(0, BLEED);
  // a morning with no sun in it: the ramp runs COOL at the top and bone at the horizon, and never gets bright
  vGradient(g, 0, -BLEED, w, FLOOR_TOP + BLEED, [[0, SKY_TOP], [0.5, SKY_MID], [0.86, SKY_LOW], [1, HAZE]]);
  g.fillStyle = HAZE; g.fillRect(0, FLOOR_TOP, w, BLEED);
  // thin flat cloud, drawn as horizontal smears rather than lumps: nothing in this sky has weight
  for (let i = 0; i < 22; i++) {
    const x = rnd() * w, y = 20 + rnd() * 110, ww = 70 + rnd() * 170, hh = 3 + rnd() * 5;
    g.fillStyle = `rgba(255,255,250,${0.10 + rnd() * 0.14})`;
    g.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh));
  }
  // Calderwick, three days behind you: the mountain city as a flat pale silhouette, the Heart-Engine cold
  pathPoly(g, [60, 200, 150, 128, 230, 96, 300, 92, 372, 118, 470, 200]);
  paint(g, CITY, null);
  g.fillStyle = CITY_D;
  skyline(g, 120, 430, 200, 10, 30, rnd, CITY_D, { minW: 14, maxW: 34, chimneys: 0.5 });
  g.fillStyle = CITY_D; g.fillRect(268, 78, 24, 18); g.fillRect(276, 66, 9, 12);
  // the works, ahead and to the right: a long low roof line with four draw-kiln chimneys standing off it
  g.fillStyle = ROOF; g.fillRect(760, 158, 460, 44);
  g.fillStyle = ROOF_D; g.fillRect(760, 158, 460, 6);
  pathPoly(g, [760, 158, 830, 138, 1150, 138, 1220, 158]); paint(g, ROOF_D, null);
  for (let x = 780; x < 1210; x += 34) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, 164, 2, 38); }
  for (const sx of STACKS) {
    g.fillStyle = STACK; g.fillRect(sx - 5, 96, 11, 62);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(sx + 2, 96, 4, 62);
    g.fillStyle = ROOF_D; g.fillRect(sx - 7, 92, 15, 6);
  }
  // the lime haze the works sits in: a bright band along the horizon that eats the bottom of everything far
  vGradient(g, 0, 176, w, 30, [[0, 'rgba(239,234,218,0)'], [1, 'rgba(239,234,218,0.85)']]);
  g.fillStyle = HAZE; g.fillRect(0, 202, w, FLOOR_TOP - 202 + BLEED);
}
/** Wagons stand on the shoulder's far edge; the fence stands at the road's edge in front of them. */
function paintWagon(g, { x: cx, len, kind, dir }) {
  const half = Math.round(len / 2), bedY = 158, bedH = 14, gy = MID_GROUND;
  const rearX = cx - dir * (half - 10), frontX = cx + dir * (half - 9);
  const shaft = (x0, y0, x1, y1) => {
    g.lineCap = 'round';
    for (const [c, lw] of [[INK, 4], [WOOD, 2]]) {
      g.strokeStyle = c; g.lineWidth = lw;
      for (const o of [0, 3]) { g.beginPath(); g.moveTo(x0, y0 - o); g.lineTo(x1, y1 - o); g.stroke(); }   // a PAIR of shafts
    }
  };
  const wheel = (wx, r) => {
    const wy = gy - r;
    g.fillStyle = INK; g.beginPath(); g.arc(wx, wy, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = IRON; g.beginPath(); g.arc(wx, wy, r - 1.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = THROUGH; g.beginPath(); g.arc(wx, wy, r - 3.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = WOOD; g.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 4 + 0.4, dx = Math.cos(a) * (r - 3), dy = Math.sin(a) * (r - 3);
      g.beginPath(); g.moveTo(wx - dx, wy - dy); g.lineTo(wx + dx, wy + dy); g.stroke();
    }
    g.fillStyle = IRON; g.beginPath(); g.arc(wx, wy, 2, 0, Math.PI * 2); g.fill();
  };
  // the scuff the wheels stand in: churned lime under the axles, and the mark that gives the thing weight
  g.fillStyle = 'rgba(0,0,0,0.20)';
  g.beginPath(); g.ellipse(cx, gy + 1, half + 8, 4, 0, 0, Math.PI * 2); g.fill();
  // shafts: dropped in the dirt when it is out of the traces, tipped up over the bed when it is empty
  if (kind === 2) shaft(cx + dir * (half - 2), bedY + bedH - 4, cx + dir * (half + 14), bedY - 26);
  else shaft(cx + dir * (half - 2), bedY + bedH - 4, cx + dir * (half + 22), gy - 1);
  wheel(rearX, 9);
  // the bed: planked, strapped, and dark under its lip so the load sits ON it
  boxOutlined(g, cx - half, bedY, len, bedH, WOOD, INK, 2);
  g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(cx - half, bedY + bedH - 4, len, 4);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let px = cx - half + 8; px < cx + half - 4; px += 11) g.fillRect(px, bedY + 2, 1, bedH - 5);
  g.fillStyle = '#8A7A5A'; g.fillRect(cx - half, bedY + 4, len, 1);
  rivets(g, cx - half + 5, bedY + 2, cx + half - 5, 13, '#8A7A5A', 'rgba(0,0,0,0.4)');
  paintLoad(g, cx, half, len, bedY, kind);
  wheel(frontX, 7);      // the near wheel last, over the bed's lip, so the wagon has a side facing you
  // chocked: this is a hill road and the company knows what a loose dray does on it
  g.fillStyle = INK;
  pathPoly(g, [rearX - dir * 8, gy, rearX - dir * 15, gy, rearX - dir * 8, gy - 5]); g.fill();
}
/** What a standing wagon is carrying: a lashed tarpaulin, an open heap of quicklime, or nothing at all. */
function paintLoad(g, cx, half, len, t, kind) {
  if (kind === 0) {
    // A tarpaulin over three hoops. The silhouette has to SAG between them — a smooth trapezoid over a wagon bed
    // reads as the cab of a motor lorry, which is roughly nine hundred years early for this board.
    const h1 = Math.round(half * 0.45);
    pathPoly(g, [
      cx - half + 1, t, cx - half + 4, t - 8, cx - h1, t - 13, cx - Math.round(half * 0.15), t - 10,
      cx + Math.round(half * 0.2), t - 13, cx + h1, t - 9, cx + half - 4, t - 7, cx + half - 1, t,
    ]);
    paint(g, TARP, INK, 2);
    // the hoops under the cloth, and the rope lashing it to the bed rings
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1;
    for (const k of [-0.45, 0.2]) {
      const rx = Math.round(cx + half * k);
      g.beginPath(); g.moveTo(rx, t - 12); g.lineTo(rx - 1, t - 1); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(cx - h1, t - 12, Math.round(half * 0.5), 2);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
    g.beginPath();
    for (let rx = cx - half + 4; rx < cx + half - 4; rx += 8) { g.moveTo(rx, t - 5); g.lineTo(rx + 5, t - 1); }
    g.stroke();
  } else if (kind === 1) {
    // open: a heap of burnt lime standing above the boards, with the shovel left in it
    g.beginPath(); g.ellipse(cx, t + 1, half - 3, 12, 0, Math.PI, 0); paint(g, LIME, INK, 1.5);
    g.fillStyle = LIME_HI;
    g.beginPath(); g.ellipse(cx - half * 0.3, t, half * 0.4, 7, 0, Math.PI, 0); g.fill();
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + half * 0.4, t - 2); g.lineTo(cx + half * 0.6, t - 16); g.stroke();
    g.strokeStyle = WOOD; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx + half * 0.4, t - 2); g.lineTo(cx + half * 0.6, t - 16); g.stroke();
  } else {
    // tipped out and waiting: the tarpaulin rolled along the bed, roped at both ends
    boxOutlined(g, cx - half + 4, t - 7, len - 8, 7, TARP, INK, 2);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(cx - half + 4, t - 3, len - 8, 3);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (const k of [-0.5, 0.5]) g.fillRect(Math.round(cx + half * k), t - 7, 1, 7);
  }
}
/** The road's lime shoulder: the churned strip the fence, the lamps and the wagons all stand on. */
function paintShoulder(g, w, rnd) {
  g.fillStyle = SPOIL_D; g.fillRect(0, MID_GROUND, w, MID_ROAD - MID_GROUND + 4);
  g.fillStyle = SPOIL; g.fillRect(0, MID_GROUND + 1, w, 4);
  // a ragged lime crust along its far edge, so the shoulder is not a ruled line
  for (let x = 0; x < w; x += 7) {
    const d = Math.round(rnd() * 2);
    g.fillStyle = LIME; g.fillRect(x, MID_GROUND - d, 7, 2 + d);
  }
  // wheel churn down where it meets the road
  for (let i = 0; i < w / 40; i++) {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(Math.round(rnd() * w), MID_GROUND + 4 + Math.round(rnd() * 3), 10 + Math.round(rnd() * 26), 2);
  }
}
/** Where the wagons park, which way they point and what they carry. The fence reads this too: it breaks where each
 *  one pulled off the road. */
function wagonStops(w, rnd) {
  const out = [];
  for (let i = 0, x = WAGON_X0; x < w; i++, x += WAGON_STEP) {
    out.push({ x: x + Math.round(rnd() * 40), len: 56 + Math.round(rnd() * 18), kind: i % 3, dir: i % 2 ? -1 : 1 });
  }
  return out;
}
/** The company's roadside fence. POSTS AND RAILS BOTH BREAK at each wagon's gap: the rails used to run the whole
 *  width behind them, which is most of why a parked wagon read as a sticker laid over a fence. */
function paintFence(g, w, stops) {
  const gaps = stops.map((s) => {
    const c = Math.round(s.x + s.dir * (s.len / 2 + 30));
    return [c - 28, c + 28];
  }).sort((a, b) => a[0] - b[0]);
  for (let x = 0; x < w; x += 46) {
    if (gaps.some(([a, b]) => x + 5 > a && x < b)) continue;
    g.fillStyle = WOOD; g.fillRect(x, 172, 5, 30);
    g.fillStyle = LIME; g.fillRect(x, 172, 5, 5);
  }
  g.fillStyle = WOOD;
  let x0 = 0;
  for (const [a, b] of gaps) {
    if (a > x0) for (const y of [180, 192]) g.fillRect(x0, y, a - x0, 3);
    x0 = Math.max(x0, b);
  }
  for (const y of [180, 192]) g.fillRect(x0, y, w - x0, 3);
}
function paintMid(g, w, h, rnd) {
  g.translate(0, BLEED);
  // THE MID LAYER NEEDS A GROUND IN IT. Everything here used to stop at the floor band's top edge with nothing
  // underneath, so the objects in it hung in the far layer's haze — which a fence post gets away with and a wagon,
  // which meets the ground through two wheels, does not.
  paintShoulder(g, w, rnd);
  // spoil banks: rounded heaps of burnt lime along the back of the shoulder, dark only where they meet the ground
  for (let x = -40; x < w + 40; x += 150) {
    const bx = x + Math.round(rnd() * 40), bh = 26 + Math.round(rnd() * 26), bw = 90 + Math.round(rnd() * 60);
    g.fillStyle = SPOIL_D;
    g.beginPath(); g.ellipse(bx, MID_GROUND + 1, bw / 2, bh * 0.55, 0, Math.PI, 0); g.fill();
    g.fillStyle = SPOIL;
    g.beginPath(); g.ellipse(bx, MID_GROUND - 1, bw / 2 - 4, bh * 0.5, 0, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath(); g.ellipse(bx - bw * 0.14, MID_GROUND - 3, bw * 0.2, bh * 0.24, 0, Math.PI, 0); g.fill();
  }
  // standing wagons waiting for the yard to weigh them, drawn BEFORE the fence: the rails crossing their wheels is
  // what puts them behind the fence line rather than in the road.
  const stops = wagonStops(w, rnd);
  for (const s of stops) paintWagon(g, s);
  // milestones: the company measures the road it charges you for
  for (let x = 250; x < w; x += 644) {
    boxOutlined(g, x, 172, 12, 18, SPOIL, INK, 2);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 3, 177, 6, 2); g.fillRect(x + 3, 182, 6, 2);
  }
  paintFence(g, w, stops);
  // pole lamps: the company lights its own road, and the glass is the same lime as its rites. Their spacing is
  // deliberately NOT the wagons' — one repeating lamp-and-wagon unit every 322px read as wallpaper.
  for (let x = LAMP_X0; x < w; x += LAMP_STEP) {
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x - 6, MID_ROAD - 4, 16, 3);       // the scuff at its foot
    g.fillStyle = IRON; g.fillRect(x, 130, 4, MID_ROAD - 130);
    boxOutlined(g, x - 6, 120, 16, 14, '#3E4A42', INK, 2);
    g.fillStyle = LAMP; g.fillRect(x - 3, 124, 10, 7);
    g.fillStyle = 'rgba(216,255,110,0.18)'; g.fillRect(x - 12, 116, 28, 24);
  }
}
function paintFloor(g, w, h, rnd) {
  // the road: a grey lime crust over old rail, dark enough that a pale faction reads standing on it
  g.fillStyle = ROAD; g.fillRect(0, 0, w, h);
  g.fillStyle = ROAD_D; g.fillRect(0, 0, w, 12);
  // sleeper lines under the crust, running back into the road
  for (let x = 0; x < w; x += 60) { g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(x, 12, 26, 26); }
  // cart ruts: two dark lanes down the middle of the band, with lime pushed to their edges
  for (const y of [46, 96]) {
    g.fillStyle = RUT; g.fillRect(0, y, w, 13);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, y + 10, w, 3);
    g.fillStyle = LIME; g.fillRect(0, y - 3, w, 2); g.fillRect(0, y + 13, w, 2);
  }
  // spilled quicklime: pale patches and streaks, brightest where the wagons turn
  for (let i = 0; i < 26; i++) {
    const x = Math.round(rnd() * w), y = 16 + Math.round(rnd() * (Z_MAX - 34)), ww = 14 + Math.round(rnd() * 46);
    g.fillStyle = rnd() < 0.35 ? LIME_HI : 'rgba(207,201,178,0.5)';
    g.fillRect(x, y, ww, 2 + Math.round(rnd() * 2));
  }
  // gravel and old ballast: never on the rut lines, so the lanes stay legible
  for (let i = 0; i < 90; i++) {
    const y = 16 + Math.round(rnd() * (Z_MAX - 30));
    if ((y > 44 && y < 62) || (y > 94 && y < 112)) continue;
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.20)' : 'rgba(230,226,210,0.22)';
    g.fillRect(Math.round(rnd() * w), y, 2 + Math.round(rnd() * 2), 2);
  }
  g.fillStyle = INK; g.fillRect(0, 0, w, 3);
  g.fillStyle = '#12110E'; g.fillRect(0, Z_MAX, w, h - Z_MAX);
}
/**
 * The corner of a parked cart the camera passes behind: bed, under-frame, axle and one open wheel, all of it cropped
 * by the bottom of the frame. The wheel has to hang off something — a bar and a wheel with air between them is the
 * one arrangement that reads as two decals instead of a cart.
 */
function paintCartCorner(g, x, dir) {
  const bedY = 6, bedH = 12, wx = x + (dir > 0 ? 34 : 76), wy = 42;
  // shaft first, out of frame ahead of it
  const sx = x + (dir > 0 ? 104 : 6), ex = x + (dir > 0 ? 160 : -50);
  g.lineCap = 'round';
  for (const [c, lw] of [[INK, 8], [WOOD, 5]]) {
    g.strokeStyle = c; g.lineWidth = lw;
    g.beginPath(); g.moveTo(sx, bedY + bedH); g.lineTo(ex, bedY - 2); g.stroke();
  }
  // bed, under-frame and the axle the wheel turns on
  boxOutlined(g, x, bedY, 110, bedH, WOOD, INK, 2);
  g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(x, bedY + bedH - 5, 110, 5);
  g.fillStyle = INK; g.fillRect(x + 6, bedY + bedH + 2, 98, 5);
  g.fillStyle = IRON; g.fillRect(wx - 5, bedY + bedH, 10, wy - bedY - bedH);
  // the wheel: a rim, six spokes and a hub, and NOTHING filled — a solid 36px disc this close to camera is an
  // opaque hole in the arena at exactly the height a fighter's chest is; you would lose a Wickboy behind it.
  g.strokeStyle = INK; g.lineWidth = 5;
  g.beginPath(); g.arc(wx, wy, 18, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = IRON; g.lineWidth = 3;
  g.beginPath(); g.arc(wx, wy, 18, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3;
    g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + Math.cos(a) * 17, wy + Math.sin(a) * 17); g.stroke();
    g.strokeStyle = IRON; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + Math.cos(a) * 17, wy + Math.sin(a) * 17); g.stroke();
  }
  g.fillStyle = '#5E8072'; g.beginPath(); g.arc(wx, wy, 4, 0, Math.PI * 2); g.fill();
}
/** A tarpaulined load passing the camera: WIDE and low, so it reads as the top of something roped down on a cart
 *  bed rather than a lump standing in the road. Only its crown ever clears the dark band. */
function paintTarpCorner(g, x) {
  pathPoly(g, [x, 80, x + 14, 52, x + 60, 44, x + 116, 47, x + 168, 55, x + 182, 80]);
  paint(g, TARP, INK, 2);
  // folds falling off the crown, and the rope over the top that says it is lashed to something
  g.fillStyle = 'rgba(0,0,0,0.20)';
  for (const k of [34, 72, 104, 140]) g.fillRect(x + k, 48, 2, 32);
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x + 24, 51, 34, 2); g.fillRect(x + 112, 50, 26, 2);
  g.strokeStyle = INK; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x + 6, 66); g.lineTo(x + 58, 50); g.lineTo(x + 120, 53); g.lineTo(x + 176, 68); g.stroke();
  g.strokeStyle = '#8A7A5A'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x + 6, 66); g.lineTo(x + 58, 50); g.lineTo(x + 120, 53); g.lineTo(x + 176, 68); g.stroke();
}
function paintNear(g, w, h, rnd) {
  // Layer row 0 is screen row NEAR_Y, and NEAR_Y puts this layer at the FRONT of the frame, where everything in it
  // is cropped by the bottom of the screen. It used to be blitted at row 176 — the road's BACK edge — and a 1.2x
  // layer standing at the back of the road is a contradiction the eye picks up immediately: it slides past the
  // ground it appears to be standing on, so a shaft and a wheel up there read as a plank floating in the arena
  // rather than a cart the camera is passing behind. Down here the same two marks read as the cart.
  // Everything is still OPEN — a bar, a rim and six spokes — because a filled 40px wheel in the near layer is an
  // opaque hole in the arena at exactly the height a fighter's chest is: you would lose a Wickboy behind it and
  // never know he was there.
  let x = 40, k = 0;
  while (x < w) {
    if (k % 3 === 2) paintTarpCorner(g, x); else paintCartCorner(g, x, k % 2 ? -1 : 1);
    x += 300 + Math.round(rnd() * 150);
    k++;
  }
}

export function create(section) {
  const mid = layerSpace(section, PARALLAX.mid);
  const near = layerSpace(section, PARALLAX.near);
  const farL = makeLayer(FAR_W, SKY_H, paintFar, 71);
  const midL = makeLayer(mid.width, SKY_H, paintMid, 72);
  const floorL = makeLayer(FLOOR_TILE, FLOOR_H, paintFloor, 73);
  const nearL = makeLayer(near.width, 80, paintNear, 74);
  const lampGlow = makeGlowSprite(22, 'rgba(216,255,110,0.22)');

  // chimney smoke: four columns of puffs that rise, spread and fade — the only thing moving in this sky
  const PUFF_N = STACKS.length * 5;
  const puffs = makePool(PUFF_N);
  for (let i = 0; i < PUFF_N; i++) {
    puffs.x[i] = STACKS[i % STACKS.length];
    puffs.y[i] = 92 - (i % 5) * 16;
    puffs.vy[i] = -0.16 - (i % 3) * 0.03;
    puffs.seed[i] = i % 4;
  }
  const dust = makePool(DUST_N);
  for (let i = 0; i < DUST_N; i++) { dust.x[i] = (i * 71) % VIEW_W; dust.y[i] = 230 + (i * 37) % 108; dust.vx[i] = 0.5 + (i % 5) * 0.16; dust.seed[i] = i % 3; }
  let f = 0;

  return {
    update(frame) {
      f = frame | 0;
      for (let i = 0; i < PUFF_N; i++) {
        puffs.y[i] += puffs.vy[i];
        puffs.x[i] += Math.sin((f + i * 40) * 0.006) * 0.06;
        if (puffs.y[i] < 10) { puffs.y[i] = 94; puffs.x[i] = STACKS[i % STACKS.length]; }
      }
      for (let i = 0; i < DUST_N; i++) {
        dust.x[i] += dust.vx[i];
        dust.y[i] += Math.sin((f + i * 23) * 0.03) * 0.12;
        if (dust.x[i] > VIEW_W + 6) { dust.x[i] -= VIEW_W + 12; dust.y[i] = 230 + ((i * 53) % 108); }
      }
    },
    drawBack(ctx, cam) {
      const sy = cam.shakeY || 0, shx = cam.shakeX || 0;
      const farOrigin = Math.round(-cam.x * PARALLAX.far + shx);
      blitTiled(ctx, farL, farOrigin, -BLEED + sy);
      // the smoke stands straight up: white, flat, and it never leaves the far layer
      for (let i = 0; i < PUFF_N; i++) {
        const r = 5 + puffs.seed[i] * 2, a = 0.30 * Math.max(0, (puffs.y[i] - 8) / 86);
        const ox = ((farOrigin + Math.round(puffs.x[i])) % FAR_W + FAR_W) % FAR_W;
        ctx.fillStyle = `rgba(244,242,232,${a.toFixed(3)})`;
        for (let x = ox - FAR_W; x < VIEW_W + 20; x += FAR_W) {
          if (x < -20) continue;
          ctx.beginPath(); ctx.arc(x, Math.round(puffs.y[i]) + sy, r, 0, Math.PI * 2); ctx.fill();
        }
      }
      blitAt(ctx, midL, mid.originX(cam), -BLEED + sy);
      // the pole lamps burn through the mid layer (the one saturated colour in the section)
      const midOrigin = mid.originX(cam);
      for (let lx = LAMP_X0; lx < mid.width; lx += LAMP_STEP) {
        const x = midOrigin + lx;
        if (x < -40 || x > VIEW_W + 40) continue;
        ctx.drawImage(lampGlow.canvas, x - 22, 127 - 22 + sy);
      }
      blitTiled(ctx, floorL, Math.round(-cam.x + shx), FLOOR_TOP + sy);
      drawDarkBand(ctx);
    },
    drawFront(ctx, cam) {
      const sy = cam.shakeY || 0;
      blitAt(ctx, nearL, near.originX(cam), NEAR_Y + sy);
      // lime dust blowing along the ground, always in front and always low
      for (let i = 0; i < DUST_N; i++) {
        ctx.fillStyle = dust.seed[i] ? 'rgba(226,222,204,0.30)' : 'rgba(244,242,232,0.42)';
        const s = 1 + (dust.seed[i] & 1);
        ctx.fillRect(Math.round(dust.x[i]), Math.round(dust.y[i]), s + 1, s);
      }
    },
  };
}
